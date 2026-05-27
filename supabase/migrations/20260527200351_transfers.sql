-- =============================================================================
-- Migration: transfers (Фаза 2.8)
-- =============================================================================
-- Переводы между счетами.
--
-- Дизайн:
--   * Таблица transfers — «шапка» перевода (откуда, куда, сумма, дата).
--   * В operations добавляем nullable transfer_id — для связи с шапкой.
--   * При создании перевода через RPC create_transfer создаются ДВЕ
--     операции с одинаковым transfer_id: расход на from-счёте + доход
--     на to-счёте. Категория — null (служебная семантика).
--   * Удаление: FK on delete cascade — удаление transfers удалит и две
--     операции. И наоборот для удобства — RPC delete_transfer.
--
-- RLS: на transfers — членам той же household, где оба счёта видимы.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. transfers
-- -----------------------------------------------------------------------------
create table public.transfers (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households(id) on delete cascade,
  from_account_id   uuid not null references public.accounts(id)   on delete restrict,
  to_account_id     uuid not null references public.accounts(id)   on delete restrict,
  amount            numeric(14, 2) not null check (amount > 0),
  occurred_at       date not null default current_date,
  note              text,
  author_profile_id uuid not null references public.profiles(id)   on delete restrict,
  created_at        timestamptz not null default now(),
  check (from_account_id <> to_account_id)
);

create index transfers_household_idx        on public.transfers(household_id);
create index transfers_household_occurred_idx on public.transfers(household_id, occurred_at desc);

comment on table public.transfers is 'Шапка перевода между двумя счетами. Конкретные изменения баланса лежат в двух связанных operations.';


-- -----------------------------------------------------------------------------
-- 2. operations.transfer_id (связь с шапкой)
-- -----------------------------------------------------------------------------
alter table public.operations
  add column transfer_id uuid references public.transfers(id) on delete cascade;

create index operations_transfer_idx on public.operations(transfer_id) where transfer_id is not null;

comment on column public.operations.transfer_id is 'Если операция — часть перевода, ссылка на transfers. Две операции с одним transfer_id образуют перевод.';


-- =============================================================================
-- RLS на transfers
-- =============================================================================
alter table public.transfers enable row level security;

-- SELECT — в своей household И оба счёта тебе видимы.
create policy "transfers: visible in household"
  on public.transfers
  for select
  to authenticated
  using (
    household_id = public.current_household_id()
    and exists (
      select 1 from public.accounts a
      where  a.id = transfers.from_account_id
        and  (a.visibility = 'shared' or a.owner_profile_id = auth.uid())
    )
    and exists (
      select 1 from public.accounts a
      where  a.id = transfers.to_account_id
        and  (a.visibility = 'shared' or a.owner_profile_id = auth.uid())
    )
  );

-- INSERT — обычно идёт через RPC, но политику опишем явно (на всякий).
create policy "transfers: author creates in household"
  on public.transfers
  for insert
  to authenticated
  with check (
    household_id = public.current_household_id()
    and author_profile_id = auth.uid()
  );

-- DELETE — только автор.
create policy "transfers: only author deletes"
  on public.transfers
  for delete
  to authenticated
  using (author_profile_id = auth.uid());

grant select, insert, delete on public.transfers to authenticated;


-- =============================================================================
-- RPC: create_transfer
-- =============================================================================
-- Атомарно создаёт transfer + две связанные операции.
-- Возвращает id transfer'а.
create or replace function public.create_transfer(
  p_from_account_id uuid,
  p_to_account_id   uuid,
  p_amount          numeric,
  p_occurred_at     date default current_date,
  p_note            text default null
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

  -- Проверяем, что оба счёта в этой household И видимы текущему юзеру.
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
    'income', p_amount, p_occurred_at, p_note, false, v_transfer_id
  );

  return v_transfer_id;
end;
$$;

comment on function public.create_transfer is 'Атомарно создаёт перевод и две связанных операции. Бросает: AUTH_REQUIRED, NO_HOUSEHOLD, INVALID_AMOUNT, SAME_ACCOUNT, ACCOUNT_NOT_VISIBLE.';

revoke all on function public.create_transfer(uuid, uuid, numeric, date, text) from public;
grant execute on function public.create_transfer(uuid, uuid, numeric, date, text) to authenticated;
