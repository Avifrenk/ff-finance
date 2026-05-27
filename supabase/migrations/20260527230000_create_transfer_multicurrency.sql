-- =============================================================================
-- Migration: create_transfer — поддержка кросс-валютных переводов (Фаза 2.10.5)
-- =============================================================================
-- Расширяем create_transfer необязательным параметром p_to_amount: сумма,
-- которая фактически зачислилась на to-счёт (в его валюте). Это позволяет:
--   * При обычном переводе в одной валюте — клиент не передаёт p_to_amount,
--     RPC создаёт income == p_amount (как было раньше).
--   * При кросс-валютном переводе — клиент передаёт фактически полученную
--     сумму в валюте to-счёта. Источник суммы — либо вручную (банк прислал
--     конкретное число), либо рассчитанный через fx_rates на фронте.
--
-- transfers.amount по-прежнему хранит «сколько ушло» с from-счёта. Сумма,
-- которая пришла на to-счёт, восстанавливается из второй operations.amount
-- (kind='income'). Отдельную колонку в transfers пока не вводим — данные
-- и так в operations.
--
-- Совместимость: новый параметр имеет DEFAULT NULL, старые вызовы продолжают
-- работать без изменений. Сигнатура функции меняется → DROP + CREATE.
-- =============================================================================

drop function if exists public.create_transfer(uuid, uuid, numeric, date, text);

create or replace function public.create_transfer(
  p_from_account_id uuid,
  p_to_account_id   uuid,
  p_amount          numeric,
  p_occurred_at     date default current_date,
  p_note            text default null,
  p_to_amount       numeric default null
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

  -- p_to_amount если передан — должен быть > 0; если null — берём p_amount
  -- (значит та же валюта, нет конверсии).
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
    household_id, from_account_id, to_account_id, amount, occurred_at, note, author_profile_id
  ) values (
    v_household_id, p_from_account_id, p_to_account_id, p_amount, p_occurred_at, p_note, v_user_id
  )
  returning id into v_transfer_id;

  -- Расход на from-счёте: сумма в валюте from-счёта.
  insert into public.operations (
    household_id, account_id, category_id, author_profile_id,
    kind, amount, occurred_at, note, is_private, transfer_id
  ) values (
    v_household_id, p_from_account_id, null, v_user_id,
    'expense', p_amount, p_occurred_at, p_note, false, v_transfer_id
  );

  -- Доход на to-счёте: сумма в валюте to-счёта (v_to_amount).
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

comment on function public.create_transfer is 'Атомарно создаёт перевод и две операции. p_to_amount — фактически зачисленная сумма на to-счёт (в его валюте); если null, считается равной p_amount (та же валюта).';

revoke all on function public.create_transfer(uuid, uuid, numeric, date, text, numeric) from public;
grant execute on function public.create_transfer(uuid, uuid, numeric, date, text, numeric) to authenticated;
