-- =============================================================================
-- Migration: SQL-триггеры для notification_queue (Фаза 8.4.4)
-- =============================================================================
-- Три триггера кладут отложенные пуши в notification_queue:
--   1. notify_budget_exceeded — operations after insert/update
--   2. notify_goal_reached    — goal_contributions after insert/update
--   3. notify_settlement      — transfers after insert (is_debt_settlement)
--
-- Все три — SECURITY DEFINER, чтобы insert в notification_queue прошёл (RLS
-- закрывает прямой insert пользователю; insert делается из триггера от
-- имени definer'а = postgres).
--
-- Идемпотентность через notification_queue.dedup_key + unique partial index:
-- триггер вычисляет стабильный dedup_key и делает `on conflict do nothing`.
-- Это гарантирует один пуш на одно событие: один раз за месяц на категорию,
-- один раз на достижение цели, один раз на каждый settlement.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. dedup_key + unique
-- -----------------------------------------------------------------------------
alter table public.notification_queue
  add column dedup_key text;

create unique index notification_queue_dedup_unique
  on public.notification_queue (profile_id, dedup_key)
  where dedup_key is not null;

comment on column public.notification_queue.dedup_key is 'Стабильный ключ события (budget:cat:YYYY-MM:profile, goal:id:100:profile, settlement:transfer_id). Используется с on conflict do nothing для идемпотентности.';


-- -----------------------------------------------------------------------------
-- 1. notify_budget_exceeded
-- -----------------------------------------------------------------------------
create or replace function public.notify_budget_exceeded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month         date;
  v_budget        numeric;
  v_spent         numeric;
  v_category_name text;
  v_base_currency text;
  v_dedup_base    text;
  v_member        record;
begin
  -- Срабатываем только на «настоящие» expense'ы с категорией (без transfer-операций).
  if NEW.kind <> 'expense' or NEW.category_id is null or NEW.transfer_id is not null then
    return NEW;
  end if;

  v_month := date_trunc('month', NEW.occurred_at)::date;

  select amount into v_budget
    from public.budgets
    where household_id = NEW.household_id
      and category_id = NEW.category_id
      and month = v_month;

  if v_budget is null then
    return NEW;
  end if;

  select base_currency into v_base_currency
    from public.households
    where id = NEW.household_id;

  select coalesce(
    sum(public.convert_to_base(o.amount, a.currency, v_base_currency, o.occurred_at)),
    0
  ) into v_spent
    from public.operations o
    join public.accounts a on a.id = o.account_id
    where o.household_id = NEW.household_id
      and o.kind = 'expense'
      and o.category_id = NEW.category_id
      and o.occurred_at >= v_month
      and o.occurred_at < (v_month + interval '1 month')
      and o.transfer_id is null;

  if v_spent <= v_budget then
    return NEW;
  end if;

  select name into v_category_name from public.categories where id = NEW.category_id;

  v_dedup_base := 'budget:' || NEW.category_id::text || ':' || to_char(v_month, 'YYYY-MM');

  for v_member in
    select profile_id from public.household_members where household_id = NEW.household_id
  loop
    insert into public.notification_queue (profile_id, title, body, url, dedup_key)
    values (
      v_member.profile_id,
      'Бюджет превышен',
      v_category_name || ': ' || round(v_spent)::text || ' из ' || round(v_budget)::text || ' ' || v_base_currency,
      '/',
      v_dedup_base || ':' || v_member.profile_id::text
    )
    on conflict (profile_id, dedup_key) where dedup_key is not null do nothing;
  end loop;

  return NEW;
end;
$$;

create trigger notify_budget_exceeded_trg
  after insert or update on public.operations
  for each row execute function public.notify_budget_exceeded();


-- -----------------------------------------------------------------------------
-- 2. notify_goal_reached
-- -----------------------------------------------------------------------------
create or replace function public.notify_goal_reached()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal_id           uuid;
  v_household_id      uuid;
  v_name              text;
  v_target            numeric;
  v_visibility        text;
  v_owner_profile_id  uuid;
  v_total             numeric;
  v_dedup_base        text;
  v_member            record;
begin
  select id, household_id, name, target_amount, visibility, owner_profile_id
    into v_goal_id, v_household_id, v_name, v_target, v_visibility, v_owner_profile_id
    from public.goals where id = NEW.goal_id;

  if v_goal_id is null then
    return NEW;
  end if;

  select coalesce(sum(amount), 0) into v_total
    from public.goal_contributions
    where goal_id = v_goal_id;

  if v_total < v_target then
    return NEW;
  end if;

  v_dedup_base := 'goal:' || v_goal_id::text || ':100';

  if v_visibility = 'personal' then
    -- Personal-цель: уведомляем только владельца.
    insert into public.notification_queue (profile_id, title, body, url, dedup_key)
    values (
      v_owner_profile_id,
      'Цель достигнута 🎯',
      v_name,
      '/goals',
      v_dedup_base || ':' || v_owner_profile_id::text
    )
    on conflict (profile_id, dedup_key) where dedup_key is not null do nothing;
  else
    -- Shared-цель: уведомляем обоих.
    for v_member in
      select profile_id from public.household_members where household_id = v_household_id
    loop
      insert into public.notification_queue (profile_id, title, body, url, dedup_key)
      values (
        v_member.profile_id,
        'Цель достигнута 🎯',
        v_name,
        '/goals',
        v_dedup_base || ':' || v_member.profile_id::text
      )
      on conflict (profile_id, dedup_key) where dedup_key is not null do nothing;
    end loop;
  end if;

  return NEW;
end;
$$;

create trigger notify_goal_reached_trg
  after insert or update on public.goal_contributions
  for each row execute function public.notify_goal_reached();


-- -----------------------------------------------------------------------------
-- 3. notify_settlement
-- -----------------------------------------------------------------------------
create or replace function public.notify_settlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_profile_id uuid;
  v_to_profile_id   uuid;
  v_from_currency   text;
  v_household_id    uuid;
  v_base_currency   text;
  v_from_name       text;
  v_amount_in_base  numeric;
  v_amount_text     text;
begin
  if not NEW.is_debt_settlement then
    return NEW;
  end if;

  select owner_profile_id, currency, household_id
    into v_from_profile_id, v_from_currency, v_household_id
    from public.accounts where id = NEW.from_account_id;

  select owner_profile_id into v_to_profile_id
    from public.accounts where id = NEW.to_account_id;

  if v_from_profile_id is null or v_to_profile_id is null or v_from_profile_id = v_to_profile_id then
    return NEW;
  end if;

  select base_currency into v_base_currency
    from public.households where id = v_household_id;

  select display_name into v_from_name
    from public.profiles where id = v_from_profile_id;

  v_amount_in_base := public.convert_to_base(NEW.amount, v_from_currency, v_base_currency, NEW.occurred_at);
  v_amount_text := round(coalesce(v_amount_in_base, NEW.amount))::text || ' ' ||
                   coalesce(v_base_currency, v_from_currency);

  insert into public.notification_queue (profile_id, title, body, url, dedup_key)
  values (
    v_to_profile_id,
    'Долг погашен 🤝',
    coalesce(v_from_name, 'Партнёр') || ' перевёл ' || v_amount_text,
    '/debts',
    'settlement:' || NEW.id::text
  )
  on conflict (profile_id, dedup_key) where dedup_key is not null do nothing;

  return NEW;
end;
$$;

create trigger notify_settlement_trg
  after insert on public.transfers
  for each row execute function public.notify_settlement();
