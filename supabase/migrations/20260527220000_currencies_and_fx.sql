-- =============================================================================
-- Migration: currencies_and_fx (Фаза 2.10.1)
-- =============================================================================
-- Мультивалютный слой поверх Фазы 2:
--   * currencies        — справочник валют (код, символ, имя, decimals).
--   * fx_rates          — курсы конвертации EUR↔X (источник ECB, ежедневно).
--   * households.base_currency — базовая валюта семьи для агрегации на Dashboard.
--
-- Инварианты:
--   * RLS включён одновременно с CREATE TABLE.
--   * SELECT на currencies / fx_rates — для authenticated; INSERT/UPDATE/DELETE
--     политик нет → запись возможна только через service_role (Edge Function
--     fetch-ecb-rates). Так пользователь не сможет случайно подменить курс.
--   * Курсы хранятся через EUR-cross: одна строка (EUR → quote) и зеркальная
--     (quote → EUR, rate=1/x) для быстрого lookup в любую сторону.
--   * Операции по-прежнему хранятся в валюте счёта (accounts.currency).
--     Конверсия — на лету в местах агрегации.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. currencies
-- -----------------------------------------------------------------------------
create table public.currencies (
  code     text primary key check (char_length(code) = 3),
  symbol   text not null,
  name     text not null,
  decimals smallint not null default 2 check (decimals between 0 and 8)
);

comment on table  public.currencies is 'Справочник валют. code — ISO 4217 (3 буквы). decimals — сколько знаков после запятой показывать в UI.';
comment on column public.currencies.decimals is 'Кол-во знаков после запятой для отображения. ILS/USD/EUR/GBP/RUB — 2.';


-- -----------------------------------------------------------------------------
-- 2. seed: ILS, USD, EUR, GBP, RUB
-- -----------------------------------------------------------------------------
insert into public.currencies (code, symbol, name, decimals) values
  ('ILS', '₪', 'Israeli new shekel',  2),
  ('USD', '$', 'US dollar',           2),
  ('EUR', '€', 'Euro',                2),
  ('GBP', '£', 'British pound',       2),
  ('RUB', '₽', 'Russian ruble',       2);


-- -----------------------------------------------------------------------------
-- 3. households.base_currency
-- -----------------------------------------------------------------------------
-- Default 'ILS' — у нас уже есть household(ы), все они автоматически получат ILS.
alter table public.households
  add column base_currency text not null default 'ILS'
    references public.currencies(code) on update cascade on delete restrict;

comment on column public.households.base_currency is 'Валюта, в которой Dashboard показывает итоговый баланс и месячные тоталы. Менять может только owner (UPDATE RLS уже ограничен).';


-- -----------------------------------------------------------------------------
-- 4. fx_rates
-- -----------------------------------------------------------------------------
create table public.fx_rates (
  base_code  text not null references public.currencies(code) on update cascade on delete restrict,
  quote_code text not null references public.currencies(code) on update cascade on delete restrict,
  rate       numeric(18, 8) not null check (rate > 0),
  as_of      date not null,
  source     text not null default 'ECB',
  fetched_at timestamptz not null default now(),
  primary key (base_code, quote_code, as_of)
);

-- Быстрый lookup «последний курс к X»: где X = ILS обычно.
create index fx_rates_quote_as_of_idx
  on public.fx_rates (quote_code, as_of desc);

-- Сценарий «последний курс от X»: пригодится при cross-валютных переводах.
create index fx_rates_base_as_of_idx
  on public.fx_rates (base_code, as_of desc);

comment on table  public.fx_rates is 'Ежедневные курсы конвертации. Базис — EUR (ECB). Для каждой валюты хранятся обе стороны: (EUR→X) и (X→EUR).';
comment on column public.fx_rates.rate is 'Сколько единиц quote_code за 1 единицу base_code на дату as_of.';


-- =============================================================================
-- RLS — Фаза 2.10.1
-- =============================================================================
alter table public.currencies enable row level security;
alter table public.fx_rates   enable row level security;


-- -----------------------------------------------------------------------------
-- RLS: currencies
-- -----------------------------------------------------------------------------
-- Справочник публичный (в рамках авторизованных).
create policy "currencies: authenticated read"
  on public.currencies
  for select
  to authenticated
  using (true);

-- INSERT/UPDATE/DELETE политик НЕТ — запись только через service_role
-- (он обходит RLS). На MVP справочник статичен (5 валют из seed-а).


-- -----------------------------------------------------------------------------
-- RLS: fx_rates
-- -----------------------------------------------------------------------------
create policy "fx_rates: authenticated read"
  on public.fx_rates
  for select
  to authenticated
  using (true);

-- INSERT/UPDATE/DELETE политик НЕТ — пишет только Edge Function fetch-ecb-rates
-- под service_role-ключом.


-- =============================================================================
-- GRANTы (явные — "Automatically expose new tables" в проекте выключено)
-- =============================================================================
-- authenticated: только чтение справочника и курсов.
grant select on public.currencies to authenticated;
grant select on public.fx_rates   to authenticated;

-- INSERT/UPDATE/DELETE не выдаём никому из публичных ролей.
-- service_role работает в обход GRANTов и RLS — этого достаточно для
-- fetch-ecb-rates (он использует SUPABASE_SERVICE_ROLE_KEY).
