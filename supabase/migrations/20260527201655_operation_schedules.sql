-- =============================================================================
-- Migration: operation_schedules (Фаза 2.9)
-- =============================================================================
-- Регулярные операции (зарплата 1-го числа, аренда 5-го, абонементы,
-- автоплатежи). Шаблон описывается «правилом» cadence_rule, ежедневный
-- pg_cron-воркер раскручивает все шаблоны с next_run_at <= today в
-- настоящие operations.
--
-- Поддерживаемые правила (text-формат, парсится в plpgsql):
--   * 'daily'         — каждый день
--   * 'weekly:0..6'   — раз в неделю (0=воскр, 6=суббота, ISO-style)
--   * 'monthly:1..28' — раз в месяц в указанный день (1..28, чтобы
--                       избежать «нет 30 февраля»)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. operation_schedules
-- -----------------------------------------------------------------------------
create table public.operation_schedules (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households(id) on delete cascade,
  account_id        uuid not null references public.accounts(id)   on delete restrict,
  category_id       uuid          references public.categories(id) on delete set null,
  author_profile_id uuid not null references public.profiles(id)   on delete restrict,
  kind              text not null check (kind in ('expense', 'income')),
  amount            numeric(14, 2) not null check (amount > 0),
  cadence_rule      text not null,
  next_run_at       date not null,
  last_run_at       date,
  is_active         boolean not null default true,
  note              text,
  is_private        boolean not null default false,
  created_at        timestamptz not null default now()
);

create index operation_schedules_next_run_idx
  on public.operation_schedules(next_run_at)
  where is_active = true;
create index operation_schedules_household_idx on public.operation_schedules(household_id);
create index operation_schedules_account_idx   on public.operation_schedules(account_id);

comment on table public.operation_schedules is 'Шаблоны регулярных операций. Раз в день воркер tick_schedules() раскручивает их в operations.';
comment on column public.operation_schedules.cadence_rule is 'Текстовое правило: daily | weekly:N | monthly:N (N=1..28).';


-- -----------------------------------------------------------------------------
-- 2. RLS + GRANT
-- -----------------------------------------------------------------------------
alter table public.operation_schedules enable row level security;

-- SELECT — членам household И счёт виден (с учётом visibility) И
-- (не приватный ИЛИ автор = я).
create policy "schedules: visible to members"
  on public.operation_schedules
  for select
  to authenticated
  using (
    household_id = public.current_household_id()
    and (is_private = false or author_profile_id = auth.uid())
    and exists (
      select 1 from public.accounts a
      where  a.id = operation_schedules.account_id
        and  a.household_id = public.current_household_id()
        and  (a.visibility = 'shared' or a.owner_profile_id = auth.uid())
    )
  );

-- INSERT — автор = я, счёт виден.
create policy "schedules: author creates on visible account"
  on public.operation_schedules
  for insert
  to authenticated
  with check (
    household_id = public.current_household_id()
    and author_profile_id = auth.uid()
    and exists (
      select 1 from public.accounts a
      where  a.id = account_id
        and  a.household_id = public.current_household_id()
        and  (a.visibility = 'shared' or a.owner_profile_id = auth.uid())
    )
  );

-- UPDATE / DELETE — только автор.
create policy "schedules: only author updates"
  on public.operation_schedules
  for update
  to authenticated
  using (author_profile_id = auth.uid())
  with check (author_profile_id = auth.uid());

create policy "schedules: only author deletes"
  on public.operation_schedules
  for delete
  to authenticated
  using (author_profile_id = auth.uid());

grant select, insert, update, delete on public.operation_schedules to authenticated;


-- =============================================================================
-- 3. Парсер cadence_rule + расчёт следующей даты
-- =============================================================================
create or replace function public.compute_next_run_at(
  p_cadence_rule text,
  p_from_date    date
)
returns date
language plpgsql
immutable
as $$
declare
  v_parts        text[];
  v_kind         text;
  v_arg          int;
  v_candidate    date;
  v_target_dow   int;
  v_current_dow  int;
  v_diff         int;
begin
  -- Возвращает первую дату СТРОГО ПОСЛЕ p_from_date, соответствующую правилу.
  if p_cadence_rule = 'daily' then
    return p_from_date + interval '1 day';
  end if;

  v_parts := string_to_array(p_cadence_rule, ':');
  v_kind  := v_parts[1];
  v_arg   := v_parts[2]::int;

  if v_kind = 'weekly' then
    -- ISO: extract(dow) даёт 0..6 (0=воскресенье).
    if v_arg < 0 or v_arg > 6 then
      raise exception 'INVALID_WEEKDAY' using errcode = '22023';
    end if;
    v_current_dow := extract(dow from p_from_date)::int;
    v_diff := v_arg - v_current_dow;
    if v_diff <= 0 then
      v_diff := v_diff + 7;
    end if;
    return p_from_date + (v_diff || ' days')::interval;
  end if;

  if v_kind = 'monthly' then
    if v_arg < 1 or v_arg > 28 then
      raise exception 'INVALID_DAY_OF_MONTH' using errcode = '22023';
    end if;
    -- Кандидат — этого месяца, день v_arg.
    v_candidate := date_trunc('month', p_from_date)::date + (v_arg - 1);
    if v_candidate <= p_from_date then
      -- Уже прошёл или сегодня — берём следующий месяц.
      v_candidate := (date_trunc('month', p_from_date) + interval '1 month')::date + (v_arg - 1);
    end if;
    return v_candidate;
  end if;

  raise exception 'UNKNOWN_CADENCE: %', p_cadence_rule using errcode = '22023';
end;
$$;

comment on function public.compute_next_run_at is 'Следующая дата запуска schedule по правилу daily | weekly:N | monthly:N. Возвращает date строго после p_from_date.';


-- =============================================================================
-- 4. Воркер: tick_schedules — раскручивает дозревшие schedules в operations
-- =============================================================================
create or replace function public.tick_schedules()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.operation_schedules%rowtype;
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
    );

    update public.operation_schedules
      set last_run_at = v_schedule.next_run_at,
          next_run_at = public.compute_next_run_at(v_schedule.cadence_rule, v_schedule.next_run_at)
      where id = v_schedule.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.tick_schedules is 'Раскручивает все activne schedules с next_run_at <= today в operations. Возвращает количество созданных операций.';

revoke all on function public.tick_schedules() from public;
-- Клиенту разрешаем — пригодится в Settings для кнопки «Прокрутить сейчас».
grant execute on function public.tick_schedules() to authenticated;


-- =============================================================================
-- 5. pg_cron: ежедневный запуск в 00:05 UTC
-- =============================================================================
create extension if not exists pg_cron;

-- Снимаем старый job на случай повторного применения миграции.
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'tick_schedules_daily';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'tick_schedules_daily',
  '5 0 * * *',
  $$select public.tick_schedules();$$
);
