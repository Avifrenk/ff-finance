-- =============================================================================
-- Migration: is_debt_settlement на transfers + расширение create_transfer (Фаза 7.1)
-- =============================================================================
-- Колонка-флаг для transfer'ов, которые являются «погашением долга» между
-- супругами. Используется на клиенте в lib/debts.ts: settlement-transfer'ы
-- вычитают накопленный долг.
--
-- RPC create_transfer расширяется параметром p_is_debt_settlement
-- (default false) — обратная совместимость через default-значение, но
-- сигнатура функции меняется → DROP + CREATE.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Колонка
-- -----------------------------------------------------------------------------
alter table public.transfers
  add column is_debt_settlement boolean not null default false;

comment on column public.transfers.is_debt_settlement is 'Перевод является погашением долга между супругами (учитывается в lib/debts.ts).';

-- Индекс для секции «История settlement'ов» на /debts.
create index transfers_settlement_idx
  on public.transfers (household_id, occurred_at desc)
  where is_debt_settlement = true;


-- -----------------------------------------------------------------------------
-- 2. create_transfer — DROP + CREATE с новым параметром
-- -----------------------------------------------------------------------------
drop function if exists public.create_transfer(uuid, uuid, numeric, date, text, numeric);

create or replace function public.create_transfer(
  p_from_account_id     uuid,
  p_to_account_id       uuid,
  p_amount              numeric,
  p_occurred_at         date default current_date,
  p_note                text default null,
  p_to_amount           numeric default null,
  p_is_debt_settlement  boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_household_id uuid := public.current_household_id();
  v_transfer_id  uuid;
  v_from_visible boolean;
  v_to_visible   boolean;
  v_to_amount    numeric;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if v_household_id is null then
    raise exception 'NO_HOUSEHOLD' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;
  if p_from_account_id = p_to_account_id then
    raise exception 'SAME_ACCOUNT' using errcode = '22023';
  end if;

  v_to_amount := coalesce(p_to_amount, p_amount);
  if v_to_amount <= 0 then
    raise exception 'INVALID_TO_AMOUNT' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.accounts
    where  id = p_from_account_id
      and  household_id = v_household_id
      and  (visibility = 'shared' or owner_profile_id = v_user_id)
  ) into v_from_visible;

  select exists (
    select 1 from public.accounts
    where  id = p_to_account_id
      and  household_id = v_household_id
      and  (visibility = 'shared' or owner_profile_id = v_user_id)
  ) into v_to_visible;

  if not v_from_visible or not v_to_visible then
    raise exception 'ACCOUNT_NOT_VISIBLE' using errcode = '42501';
  end if;

  insert into public.transfers (
    household_id, from_account_id, to_account_id, amount, occurred_at, note,
    author_profile_id, is_debt_settlement
  ) values (
    v_household_id, p_from_account_id, p_to_account_id, p_amount, p_occurred_at, p_note,
    v_user_id, coalesce(p_is_debt_settlement, false)
  )
  returning id into v_transfer_id;

  insert into public.operations (
    household_id, account_id, category_id, author_profile_id,
    kind, amount, occurred_at, note, is_private, transfer_id
  ) values (
    v_household_id, p_from_account_id, null, v_user_id,
    'expense', p_amount, p_occurred_at, p_note, false, v_transfer_id
  );

  insert into public.operations (
    household_id, account_id, category_id, author_profile_id,
    kind, amount, occurred_at, note, is_private, transfer_id
  ) values (
    v_household_id, p_to_account_id, null, v_user_id,
    'income', v_to_amount, p_occurred_at, p_note, false, v_transfer_id
  );

  return v_transfer_id;
end;
$$;

comment on function public.create_transfer is 'Атомарно создаёт перевод и две операции. p_to_amount — фактически зачисленная сумма на to-счёт; p_is_debt_settlement — флаг «погашение долга».';

revoke all on function public.create_transfer(uuid, uuid, numeric, date, text, numeric, boolean) from public;
grant execute on function public.create_transfer(uuid, uuid, numeric, date, text, numeric, boolean) to authenticated;
