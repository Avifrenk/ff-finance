-- =============================================================================
-- Migration: operations_core (Фазы 2.1 + 2.2)
-- =============================================================================
-- Базовый учёт операций.
--
-- Таблицы:
--   * accounts    — счета пользователя (наличные, карты), привязаны к household
--                   и owner_profile_id; имеют visibility (personal/shared).
--   * categories  — справочник категорий (расходы и доходы), общий на household.
--   * operations  — атомарные транзакции расход/доход на конкретном счёте.
--
-- Инварианты:
--   * RLS включён одновременно с CREATE TABLE.
--   * Все GRANTы для роли `authenticated` — явные (в проекте отключён
--     "Automatically expose new tables").
--   * Двухуровневая приватность из памяти проекта:
--       - visibility у счёта: personal (видит только owner) | shared (видят
--         все члены household).
--       - is_private у операции: даже на shared-счёте автор может пометить
--         операцию приватной — её не видит партнёр.
--   * Все денежные суммы — numeric(14, 2). Для крипты (Фаза 5) заведём
--     отдельную модель с большей точностью.
--   * Поле currency в accounts заложено сразу (default 'ILS'), мультивалютная
--     логика и FX-курсы появятся в Фазе 2.10.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. accounts
-- -----------------------------------------------------------------------------
create table public.accounts (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households(id) on delete cascade,
  owner_profile_id  uuid not null references public.profiles(id)   on delete restrict,
  name              text not null,
  currency          text not null default 'ILS',
  visibility        text not null check (visibility in ('personal', 'shared')),
  initial_balance   numeric(14, 2) not null default 0,
  created_at        timestamptz not null default now()
);

create index accounts_household_idx        on public.accounts(household_id);
create index accounts_household_visible_idx on public.accounts(household_id, visibility);

comment on table  public.accounts is 'Счета пользователя в рамках household. visibility: personal — видит только owner; shared — все члены семьи.';
comment on column public.accounts.owner_profile_id is 'Чей счёт. Для shared владелец отвечает за начальный баланс и реквизиты, но операции могут вносить оба.';
comment on column public.accounts.initial_balance is 'Балансы операций считаются от этого значения. Изменение initial_balance смещает всю историю.';


-- -----------------------------------------------------------------------------
-- 2. categories
-- -----------------------------------------------------------------------------
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  kind         text not null check (kind in ('expense', 'income')),
  icon         text,
  color        text,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index categories_household_idx        on public.categories(household_id);
create index categories_household_kind_idx   on public.categories(household_id, kind);
create unique index categories_household_name_kind_unique
  on public.categories(household_id, lower(name), kind);

comment on table  public.categories is 'Справочник категорий расходов и доходов. Один на household — оба партнёра пользуются одним списком.';
comment on column public.categories.is_default is 'true для категорий, созданных триггером seed_default_categories при создании household. Используется в UI для подсказки «можно отредактировать».';


-- -----------------------------------------------------------------------------
-- 3. operations
-- -----------------------------------------------------------------------------
create table public.operations (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households(id) on delete cascade,
  account_id         uuid not null references public.accounts(id)   on delete restrict,
  category_id        uuid          references public.categories(id) on delete set null,
  author_profile_id  uuid not null references public.profiles(id)   on delete restrict,
  kind               text not null check (kind in ('expense', 'income')),
  amount             numeric(14, 2) not null check (amount > 0),
  occurred_at        date not null default current_date,
  note               text,
  is_private         boolean not null default false,
  created_at         timestamptz not null default now()
);

create index operations_household_occurred_idx
  on public.operations(household_id, occurred_at desc);
create index operations_account_idx       on public.operations(account_id);
create index operations_author_idx        on public.operations(author_profile_id);
create index operations_household_kind_idx on public.operations(household_id, kind);

comment on table  public.operations is 'Атомарная операция расход/доход на конкретном счёте. is_private прячет операцию от партнёра даже на shared-счёте.';
comment on column public.operations.amount is 'Всегда положительное. Направление денег определяется kind (expense уменьшает баланс, income увеличивает).';


-- =============================================================================
-- RLS — Фаза 2.2
-- =============================================================================
alter table public.accounts   enable row level security;
alter table public.categories enable row level security;
alter table public.operations enable row level security;


-- -----------------------------------------------------------------------------
-- RLS: accounts
-- -----------------------------------------------------------------------------
-- SELECT — счёт виден если:
--   1) ты в этой household, И
--   2) либо visibility='shared', либо ты owner.
create policy "accounts: visible members can read"
  on public.accounts
  for select
  to authenticated
  using (
    household_id = public.current_household_id()
    and (visibility = 'shared' or owner_profile_id = auth.uid())
  );

-- INSERT — только в свою household и только на себя как owner.
create policy "accounts: owner creates own"
  on public.accounts
  for insert
  to authenticated
  with check (
    household_id = public.current_household_id()
    and owner_profile_id = auth.uid()
  );

-- UPDATE / DELETE — только owner.
create policy "accounts: only owner updates"
  on public.accounts
  for update
  to authenticated
  using (owner_profile_id = auth.uid())
  with check (owner_profile_id = auth.uid());

create policy "accounts: only owner deletes"
  on public.accounts
  for delete
  to authenticated
  using (owner_profile_id = auth.uid());


-- -----------------------------------------------------------------------------
-- RLS: categories
-- -----------------------------------------------------------------------------
-- Категории общие для пары — обе стороны могут читать и редактировать.
create policy "categories: household reads"
  on public.categories
  for select
  to authenticated
  using (household_id = public.current_household_id());

create policy "categories: household writes"
  on public.categories
  for insert
  to authenticated
  with check (household_id = public.current_household_id());

create policy "categories: household updates"
  on public.categories
  for update
  to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy "categories: household deletes"
  on public.categories
  for delete
  to authenticated
  using (household_id = public.current_household_id());


-- -----------------------------------------------------------------------------
-- RLS: operations
-- -----------------------------------------------------------------------------
-- SELECT — операция видна если:
--   1) ты в её household, И
--   2) счёт под операцией тебе виден (см. accounts policy), И
--   3) либо is_private=false, либо ты автор.
-- Проверку «счёт виден» делаем через EXISTS-подзапрос — RLS на accounts
-- сам всё отфильтрует.
create policy "operations: visible to members"
  on public.operations
  for select
  to authenticated
  using (
    household_id = public.current_household_id()
    and (is_private = false or author_profile_id = auth.uid())
    and exists (
      select 1 from public.accounts a
      where  a.id = operations.account_id
        and  a.household_id = public.current_household_id()
        and  (a.visibility = 'shared' or a.owner_profile_id = auth.uid())
    )
  );

-- INSERT — автор = я, household моя, счёт мне виден.
create policy "operations: author creates on visible account"
  on public.operations
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

-- UPDATE — только автор операции.
create policy "operations: only author updates"
  on public.operations
  for update
  to authenticated
  using (author_profile_id = auth.uid())
  with check (author_profile_id = auth.uid());

create policy "operations: only author deletes"
  on public.operations
  for delete
  to authenticated
  using (author_profile_id = auth.uid());


-- =============================================================================
-- GRANTы (явные — "Automatically expose new tables" в проекте выключено)
-- =============================================================================
grant select, insert, update, delete on public.accounts   to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.operations to authenticated;
