-- =============================================================================
-- Migration: tick_schedules + auto goal contributions (Фаза 4.5)
-- =============================================================================
-- При создании income-операции автоматически создавать goal_contributions
-- для целей с auto_percent_of_income > 0.
--
-- Логика конверсии: income сохраняется в валюте счёта (accounts.currency),
-- а contributions — в households.base_currency. SQL-хелпер convert_to_base()
-- идёт через EUR-cross (та же логика, что convertMoney на клиенте).
--
-- Двухуровневая приватность auto-зачисления:
--   * income на shared-счёте → только shared цели household;
--   * income на personal-счёте (=> владелец счёта = автор операции) → только
--     personal цели этого же владельца.
-- Так партнёр не «доливает» в чужую personal-цель, а доход одного партнёра
-- не утекает в shared-цели через personal-кабинет.
--
-- Идемпотентность: partial unique index (goal_id, source_operation_id) where
-- not null → on conflict do nothing. Повторный tick_schedules() или ручной
-- rpc-вызов не дублирует contribution.
--
-- Если курса нет: convert_to_base вернёт null, apply_auto_goal_contributions
-- логирует raise notice и пропускает contribution. Сама income-операция уже
-- создана — на ней tick не падает.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. convert_to_base(amount, from_currency, base_currency, on_date)
-- -----------------------------------------------------------------------------
-- Возвращает сумму в base_currency на дату on_date. Алгоритм:
--   * если from = base → amount.
--   * иначе r_from_to_eur и r_base_to_eur с as_of <= on_date,
--     amount * r_from_to_eur / r_base_to_eur.
--   * EUR трактуется как rate=1 (нет соответствующей строки в fx_rates,
--     потому что fetch-ecb-rates пишет (X, 'EUR') и (EUR, X) для X != EUR).
-- Если курса нет на дату → null.
create or replace function public.convert_to_base(
  p_amount        numeric,
  p_from_currency text,
  p_base_currency text,
  p_on_date       date
)
returns numeric
language plpgsql
stable
as $$
declare
  v_from_to_eur numeric;
  v_base_to_eur numeric;
begin
  if p_amount is null then
    return null;
  end if;
  if p_from_currency = p_base_currency then
    return p_amount;
  end if;

  -- EUR имеет rate=1 «само к себе»; в таблице такая строка не хранится.
  if p_from_currency = 'EUR' then
    v_from_to_eur := 1;
  else
    select rate into v_from_to_eur
    from   public.fx_rates
    where  base_code = p_from_currency
      and  quote_code = 'EUR'
      and  as_of <= p_on_date
    order by as_of desc
    limit 1;
  end if;

  if p_base_currency = 'EUR' then
    v_base_to_eur := 1;
  else
    select rate into v_base_to_eur
    from   public.fx_rates
    where  base_code = p_base_currency
      and  quote_code = 'EUR'
      and  as_of <= p_on_date
    order by as_of desc
    limit 1;
  end if;

  if v_from_to_eur is null or v_base_to_eur is null then
    return null;
  end if;

  return p_amount * v_from_to_eur / v_base_to_eur;
end;
$$;

comment on function public.convert_to_base is 'Конверсия суммы из произвольной валюты в base_currency на конкретную дату через EUR-cross. Возвращает null, если курса нет.';

revoke all on function public.convert_to_base(numeric, text, text, date) from public;
grant execute on function public.convert_to_base(numeric, text, text, date) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. apply_auto_goal_contributions(operation_id)
-- -----------------------------------------------------------------------------
-- Для income-операции создаёт goal_contributions со source='auto' по всем
-- подходящим целям. Идемпотентно через unique-индекс.
create or replace function public.apply_auto_goal_contributions(
  p_operation_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_op            public.operations%rowtype;
  v_account       public.accounts%rowtype;
  v_household     public.households%rowtype;
  v_amount_base   numeric;
  v_goal          record;
  v_count         int := 0;
  v_contrib       numeric;
begin
  select * into v_op from public.operations where id = p_operation_id;
  if not found or v_op.kind <> 'income' then
    return 0;
  end if;
  -- Переводы между счетами не считаем доходом (фильтр на всякий случай —
  -- transfers создают пары operations с transfer_id, и они идут в обход
  -- этой функции, но если кто-то изменит логику — сюда не пролезет).
  if v_op.transfer_id is not null then
    return 0;
  end if;

  select * into v_account from public.accounts where id = v_op.account_id;
  if not found then
    return 0;
  end if;

  select * into v_household from public.households where id = v_op.household_id;
  if not found then
    return 0;
  end if;

  v_amount_base := public.convert_to_base(
    v_op.amount,
    v_account.currency,
    v_household.base_currency,
    v_op.occurred_at
  );
  if v_amount_base is null then
    raise notice 'apply_auto_goal_contributions: no fx rate for % → % on %, skipping op %',
      v_account.currency, v_household.base_currency, v_op.occurred_at, p_operation_id;
    return 0;
  end if;

  -- Цели подбираем по правилу двухуровневой приватности:
  --   shared-счёт  → shared-цели household;
  --   personal-счёт → personal-цели, owner_profile_id = author операции
  --                   (он же = владелец personal-счёта).
  for v_goal in
    select g.*
    from   public.goals g
    where  g.household_id = v_op.household_id
      and  g.is_archived = false
      and  g.auto_percent_of_income > 0
      and  (
        (v_account.visibility = 'shared'   and g.visibility = 'shared')
        or
        (v_account.visibility = 'personal' and g.visibility = 'personal'
         and g.owner_profile_id = v_op.author_profile_id)
      )
  loop
    v_contrib := round(v_amount_base * v_goal.auto_percent_of_income / 100, 2);
    if v_contrib <= 0 then
      continue;
    end if;

    insert into public.goal_contributions (
      goal_id, amount, occurred_at, author_profile_id,
      source, source_operation_id, note
    ) values (
      v_goal.id,
      v_contrib,
      v_op.occurred_at,
      v_op.author_profile_id,
      'auto',
      v_op.id,
      null
    )
    on conflict (goal_id, source_operation_id) do nothing;

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.apply_auto_goal_contributions is 'Для income-операции создаёт goal_contributions со source=auto по всем целям с auto_percent_of_income > 0 в рамках правил приватности. Идемпотентно.';

revoke all on function public.apply_auto_goal_contributions(uuid) from public;
-- Клиент сам это не вызывает (только через tick_schedules), но authenticated
-- даём execute на случай ручного дёрга «прокрутить расписания сейчас» через
-- rpc tick_schedules → внутри неё SECURITY DEFINER call'ы.
grant execute on function public.apply_auto_goal_contributions(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Перезаписываем tick_schedules() так, чтобы для income-операций
--    вызывалась apply_auto_goal_contributions(new_op_id).
-- -----------------------------------------------------------------------------
create or replace function public.tick_schedules()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.operation_schedules%rowtype;
  v_new_op_id uuid;
  v_count    int := 0;
begin
  for v_schedule in
    select * from public.operation_schedules
    where is_active = true and next_run_at <= current_date
    for update
  loop
    insert into public.operations (
      household_id, account_id, category_id, author_profile_id,
      kind, amount, occurred_at, note, is_private
    ) values (
      v_schedule.household_id,
      v_schedule.account_id,
      v_schedule.category_id,
      v_schedule.author_profile_id,
      v_schedule.kind,
      v_schedule.amount,
      v_schedule.next_run_at,
      coalesce(v_schedule.note, '(автоматически)'),
      v_schedule.is_private
    )
    returning id into v_new_op_id;

    update public.operation_schedules
      set last_run_at = v_schedule.next_run_at,
          next_run_at = public.compute_next_run_at(v_schedule.cadence_rule, v_schedule.next_run_at)
      where id = v_schedule.id;

    -- Авто-зачисление в цели — только для income.
    if v_schedule.kind = 'income' then
      perform public.apply_auto_goal_contributions(v_new_op_id);
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.tick_schedules is 'Раскручивает все активные schedules с next_run_at <= today в operations. Для income — дополнительно вызывает apply_auto_goal_contributions(). Возвращает количество созданных операций.';
