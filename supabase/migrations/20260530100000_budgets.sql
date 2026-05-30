-- =============================================================================
-- Migration: budgets (Фаза 3.4)
-- =============================================================================
-- Месячные бюджеты на категории расходов. Один бюджет = (household, category,
-- месяц). Сумма хранится в households.base_currency — без поля currency: при
-- смене базовой валюты семьи бюджеты не пересчитываются, просто перевыводятся
-- в новой валюте (если совсем редкий кейс — пользователь поправит руками).
--
-- Прогресс «потрачено vs бюджет» считается на клиенте, конвертируя расходы из
-- валюты счёта в base_currency через convertMoney (как в Dashboard.totalBalance).
--
-- Инварианты:
--   * RLS включается одновременно с CREATE TABLE.
--   * GRANTы для authenticated явные ("Automatically expose new tables" off).
--   * Категории kind='income' тоже могут иметь запись (не блокируем на уровне
--     БД), но UI просто не показывает им поле бюджета — бюджет это потолок
--     расходов. Так гибче, если когда-то понадобится «целевой доход».
-- =============================================================================

create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id)  on delete cascade,
  category_id  uuid not null references public.categories(id)  on delete cascade,
  month        date not null,
  amount       numeric(14, 2) not null check (amount > 0),
  created_by   uuid not null references public.profiles(id)    on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Один бюджет на (household, category, месяц). Месяц — первое число.
create unique index budgets_household_category_month_unique
  on public.budgets(household_id, category_id, month);

create index budgets_household_month_idx
  on public.budgets(household_id, month);

-- Триггер на обновление updated_at — есть в проекте паттерн? Нет, не нашёл.
-- Делаем минимально: при UPDATE поле дополнительно ставит клиент через .update().
-- Если станет важным — добавим триггер отдельной миграцией.

comment on table  public.budgets is 'Месячный бюджет на категорию расходов. amount хранится в households.base_currency.';
comment on column public.budgets.month is 'Первое число месяца, для которого задан бюджет (date, не timestamptz).';
comment on column public.budgets.amount is 'Сумма в households.base_currency. При смене базовой валюты не пересчитывается.';


-- =============================================================================
-- RLS
-- =============================================================================
alter table public.budgets enable row level security;

-- SELECT — членам household.
create policy "budgets: household reads"
  on public.budgets
  for select
  to authenticated
  using (household_id = public.current_household_id());

-- INSERT/UPDATE/DELETE — обоим партнёрам, как и категории. Бюджет это семейная
-- настройка, не «личная» для одного автора. Поле created_by сохраняется для
-- истории.
create policy "budgets: household writes"
  on public.budgets
  for insert
  to authenticated
  with check (
    household_id = public.current_household_id()
    and created_by = auth.uid()
  );

create policy "budgets: household updates"
  on public.budgets
  for update
  to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy "budgets: household deletes"
  on public.budgets
  for delete
  to authenticated
  using (household_id = public.current_household_id());


-- =============================================================================
-- GRANTы
-- =============================================================================
grant select, insert, update, delete on public.budgets to authenticated;
