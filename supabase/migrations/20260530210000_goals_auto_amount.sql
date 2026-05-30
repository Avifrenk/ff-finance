-- =============================================================================
-- Migration: goals.auto_amount_per_income
-- =============================================================================
-- Альтернатива auto_percent_of_income: фиксированная сумма (в base_currency),
-- которая зачисляется в цель с каждого income.
--
-- Семантика: если auto_percent_of_income > 0 — приоритет процента; иначе если
-- auto_amount_per_income > 0 — фиксированная сумма. UI запрещает задать оба
-- одновременно (radio переключатель), но на уровне БД не ограничиваем — на
-- случай ручной правки решаем через приоритет.
-- =============================================================================

alter table public.goals
  add column auto_amount_per_income numeric(14, 2) not null default 0
    check (auto_amount_per_income >= 0);

comment on column public.goals.auto_amount_per_income is
  'Фиксированная сумма в households.base_currency, зачисляемая в цель с каждого income. 0 — выключено. Если одновременно задан auto_percent_of_income > 0, приоритет у процента.';


-- -----------------------------------------------------------------------------
-- Обновляем apply_auto_goal_contributions: проверяем сначала процент, потом
-- фиксированную сумму. Зачисление идёт min(желаемое, остаток до target —
-- amount_base * percent OR auto_amount_per_income), хотя ограничения по
-- target_amount нет: цель может уйти в «+N сверх плана», UI это покажет.
-- -----------------------------------------------------------------------------
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

  for v_goal in
    select g.*
    from   public.goals g
    where  g.household_id = v_op.household_id
      and  g.is_archived = false
      and  (g.auto_percent_of_income > 0 or g.auto_amount_per_income > 0)
      and  (
        (v_account.visibility = 'shared'   and g.visibility = 'shared')
        or
        (v_account.visibility = 'personal' and g.visibility = 'personal'
         and g.owner_profile_id = v_op.author_profile_id)
      )
  loop
    -- Приоритет: процент → фикс. сумма.
    if v_goal.auto_percent_of_income > 0 then
      v_contrib := round(v_amount_base * v_goal.auto_percent_of_income / 100, 2);
    else
      v_contrib := v_goal.auto_amount_per_income;
    end if;

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

comment on function public.apply_auto_goal_contributions is
  'Для income-операции создаёт goal_contributions со source=auto. Приоритет: auto_percent_of_income > 0 → процент; иначе auto_amount_per_income > 0 → фикс. сумма. Идемпотентно.';
