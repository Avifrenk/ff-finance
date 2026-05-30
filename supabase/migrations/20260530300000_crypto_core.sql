-- =============================================================================
-- Migration: crypto_core (Фаза 5.1)
-- =============================================================================
-- Личный крипто-портфель у каждого профиля.
--
-- Архитектурные решения (зафиксированы в plans/2026-05-30-kripta.md):
--   * Крипта ЛИЧНАЯ у каждого — crypto_holdings.profile_id NOT NULL, не
--     household_id. RLS строго profile_id = auth.uid(). Партнёр не видит
--     ни одного холдинга / транзакции / цены сделки.
--   * Транзакции — append-only journal. Баланс холдинга НЕ материализуется
--     колонкой, считается на клиенте через currentBalance(transactions).
--   * price_per_unit_base — в base_currency семьи на момент сделки. Это
--     убирает зависимость FIFO от fx_rates на дату сделки.
--   * CoinGecko-цены в crypto_prices — справочные (для UI и подсказок).
--     В FIFO/налоговом расчёте они НЕ используются.
--   * RLS вместе с CREATE TABLE; GRANT-ы явные. service_role гранчуется
--     только на crypto_prices (туда пишет Edge Function fetch-coingecko-
--     prices). На holdings/transactions service_role не нужен.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. cryptocurrencies — справочник поддерживаемых монет
-- -----------------------------------------------------------------------------
create table public.cryptocurrencies (
  id            uuid primary key default gen_random_uuid(),
  symbol        text not null unique check (char_length(symbol) between 1 and 16),
  coingecko_id  text not null unique,
  name          text not null,
  decimals      smallint not null default 8 check (decimals between 0 and 18),
  icon          text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table  public.cryptocurrencies is 'Справочник поддерживаемых криптовалют. Расширяется отдельной миграцией.';
comment on column public.cryptocurrencies.coingecko_id is 'ID монеты в CoinGecko API (например bitcoin, ethereum). Нужен Edge Function для запроса цен.';
comment on column public.cryptocurrencies.decimals is 'Кол-во знаков после запятой для отображения в UI (BTC=8, USDT=6 и т.д.).';


-- Seed: BTC, ETH, USDT, USDC, SOL.
insert into public.cryptocurrencies (symbol, coingecko_id, name, decimals, icon) values
  ('BTC',  'bitcoin',  'Bitcoin',      8, '₿'),
  ('ETH',  'ethereum', 'Ethereum',    18, 'Ξ'),
  ('USDT', 'tether',   'Tether USD',   6, '₮'),
  ('USDC', 'usd-coin', 'USD Coin',     6, '$'),
  ('SOL',  'solana',   'Solana',       9, '◎');


-- -----------------------------------------------------------------------------
-- 2. crypto_holdings — «у меня X монет на бирже Y»
-- -----------------------------------------------------------------------------
create table public.crypto_holdings (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  coin_id     uuid not null references public.cryptocurrencies(id) on delete restrict,
  custodian   text not null check (char_length(custodian) between 1 and 64),
  created_at  timestamptz not null default now(),
  unique (profile_id, coin_id, custodian)
);

create index crypto_holdings_profile_idx
  on public.crypto_holdings (profile_id);

comment on table  public.crypto_holdings is 'Личный холдинг монет на конкретной бирже/кошельке. RLS: только владелец видит свои строки.';
comment on column public.crypto_holdings.custodian is 'Свободный текст: "Binance", "Trezor", "MetaMask" и т.п. UNIQUE с (profile_id, coin_id) не плодит дубли.';


-- -----------------------------------------------------------------------------
-- 3. crypto_transactions — append-only журнал операций
-- -----------------------------------------------------------------------------
create table public.crypto_transactions (
  id                   uuid primary key default gen_random_uuid(),
  holding_id           uuid not null references public.crypto_holdings(id) on delete cascade,
  kind                 text not null check (kind in ('buy','sell','transfer_in','transfer_out','fee','airdrop')),
  amount               numeric(28,10) not null check (amount > 0),
  price_per_unit_base  numeric(18,4) check (price_per_unit_base is null or price_per_unit_base > 0),
  fee_base             numeric(14,2) not null default 0 check (fee_base >= 0),
  occurred_at          timestamptz not null,
  note                 text,
  created_at           timestamptz not null default now(),
  -- Для buy/sell цена обязательна (нужна для FIFO). Для остальных — опциональна.
  constraint crypto_tx_price_required_for_trades
    check (
      (kind in ('buy','sell') and price_per_unit_base is not null)
      or kind in ('transfer_in','transfer_out','fee','airdrop')
    )
);

create index crypto_transactions_holding_time_idx
  on public.crypto_transactions (holding_id, occurred_at, created_at);

comment on table  public.crypto_transactions is 'Append-only журнал операций по холдингу. Баланс выводится агрегацией на клиенте. FIFO детерминированный по (occurred_at, created_at, id).';
comment on column public.crypto_transactions.amount is 'Всегда положительное; знак определяется kind: buy/transfer_in/airdrop +; sell/transfer_out/fee -.';
comment on column public.crypto_transactions.price_per_unit_base is 'Цена за 1 монету в base_currency семьи на момент сделки. NOT NULL для buy/sell (через CHECK).';


-- -----------------------------------------------------------------------------
-- 4. crypto_prices — справочные цены от CoinGecko
-- -----------------------------------------------------------------------------
create table public.crypto_prices (
  id          uuid primary key default gen_random_uuid(),
  coin_id     uuid not null references public.cryptocurrencies(id) on delete cascade,
  quote_code  text not null references public.currencies(code) on update cascade on delete restrict,
  price       numeric(18,4) not null check (price > 0),
  as_of       timestamptz not null,
  source      text not null default 'coingecko',
  fetched_at  timestamptz not null default now(),
  unique (coin_id, quote_code, as_of)
);

-- Last-price lookup: один index seek.
create index crypto_prices_lookup_idx
  on public.crypto_prices (coin_id, quote_code, as_of desc);

comment on table  public.crypto_prices is 'Справочные цены от CoinGecko. as_of округляется до часа в Edge Function fetch-coingecko-prices. В FIFO/налогах НЕ используется — там цены из транзакций.';


-- =============================================================================
-- RLS — Фаза 5.1
-- =============================================================================
alter table public.cryptocurrencies    enable row level security;
alter table public.crypto_holdings     enable row level security;
alter table public.crypto_transactions enable row level security;
alter table public.crypto_prices       enable row level security;


-- -----------------------------------------------------------------------------
-- RLS: cryptocurrencies — публичный справочник для залогиненных
-- -----------------------------------------------------------------------------
create policy "cryptocurrencies: authenticated read"
  on public.cryptocurrencies
  for select
  to authenticated
  using (true);

-- INSERT/UPDATE/DELETE политик нет — справочник правится миграциями.


-- -----------------------------------------------------------------------------
-- RLS: crypto_holdings — строго profile_id = auth.uid()
-- -----------------------------------------------------------------------------
create policy "crypto_holdings: select own"
  on public.crypto_holdings
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "crypto_holdings: insert own"
  on public.crypto_holdings
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "crypto_holdings: update own"
  on public.crypto_holdings
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "crypto_holdings: delete own"
  on public.crypto_holdings
  for delete
  to authenticated
  using (profile_id = auth.uid());


-- -----------------------------------------------------------------------------
-- RLS: crypto_transactions — через EXISTS на holdings (тот же profile_id)
-- -----------------------------------------------------------------------------
create policy "crypto_transactions: select via own holding"
  on public.crypto_transactions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.crypto_holdings h
      where h.id = crypto_transactions.holding_id
        and h.profile_id = auth.uid()
    )
  );

create policy "crypto_transactions: insert via own holding"
  on public.crypto_transactions
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.crypto_holdings h
      where h.id = crypto_transactions.holding_id
        and h.profile_id = auth.uid()
    )
  );

create policy "crypto_transactions: update via own holding"
  on public.crypto_transactions
  for update
  to authenticated
  using (
    exists (
      select 1 from public.crypto_holdings h
      where h.id = crypto_transactions.holding_id
        and h.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.crypto_holdings h
      where h.id = crypto_transactions.holding_id
        and h.profile_id = auth.uid()
    )
  );

create policy "crypto_transactions: delete via own holding"
  on public.crypto_transactions
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.crypto_holdings h
      where h.id = crypto_transactions.holding_id
        and h.profile_id = auth.uid()
    )
  );


-- -----------------------------------------------------------------------------
-- RLS: crypto_prices — публичный read, write только service_role
-- -----------------------------------------------------------------------------
create policy "crypto_prices: authenticated read"
  on public.crypto_prices
  for select
  to authenticated
  using (true);

-- INSERT/UPDATE/DELETE политик для authenticated нет — пишет только
-- Edge Function fetch-coingecko-prices под service_role.


-- =============================================================================
-- GRANTы (явные — "Automatically expose new tables" в проекте выключено)
-- =============================================================================

-- authenticated: справочник + crypto_prices только чтение.
grant select on public.cryptocurrencies to authenticated;
grant select on public.crypto_prices    to authenticated;

-- authenticated: полный CRUD на свои holdings и transactions (RLS отсекает чужие).
grant select, insert, update, delete on public.crypto_holdings     to authenticated;
grant select, insert, update, delete on public.crypto_transactions to authenticated;

-- service_role: чтение справочника + полный CRUD на crypto_prices для
-- Edge Function fetch-coingecko-prices.
grant select                                on public.cryptocurrencies to service_role;
grant select, insert, update, delete        on public.crypto_prices    to service_role;
