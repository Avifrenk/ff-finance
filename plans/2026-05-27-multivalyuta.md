# План: Мультивалюта (currencies + fx_rates + ECB)

Цель ветки `feat/multivalyuta` — добавить полноценный учёт операций в разных валютах поверх Фазы 2. Каждый счёт — со своей валютой; на Dashboard баланс агрегируется в `households.base_currency` (default `'ILS'`) через ежедневные курсы ECB.

## Принципы

- **Курсы — справочные, не вшитые в операции.** Операция хранит сумму в валюте счёта; конверсия — только в местах агрегации (Dashboard totals, кросс-валютный перевод). Так не теряем точность и при изменении курса задним числом ничего не «портится».
- **EUR-cross.** ECB публикует курсы относительно EUR. Любой `from → to` считаем как `from → EUR → to`. ILS, USD, GBP, RUB — все есть в `eurofxref-daily.xml`.
- **RLS одновременно с CREATE TABLE.** GRANT-ы явные. SELECT для `authenticated` на `currencies` и `fx_rates`; INSERT/UPDATE — только `service_role` (через Edge Function).
- **Двухуровневая приватность сохраняется.** Этот слой не трогает `accounts.visibility` / `operations.is_private`.
- **Никаких UI-библиотек поверх Tailwind.** Тот же стек, что в Фазе 2.

## Фазы

- [x] **Фаза 2.10.1. Схема БД — `currencies`, `fx_rates`, `households.base_currency`.**
  - Миграция `XXXX_currencies_and_fx.sql`:
    - `currencies` (`code text primary key check (char_length(code) = 3)`, `symbol text`, `name text`, `decimals smallint not null default 2`).
    - Seed: ILS (₪), USD ($), EUR (€), GBP (£), RUB (₽).
    - `fx_rates` (`base_code text references currencies(code)`, `quote_code text references currencies(code)`, `rate numeric(18,8) not null check (rate > 0)`, `as_of date not null`, `source text not null default 'ECB'`, `fetched_at timestamptz not null default now()`).
    - `unique (base_code, quote_code, as_of)`; индекс `(quote_code, as_of desc)` для быстрого «последний курс к ILS».
    - `alter table households add column base_currency text not null default 'ILS' references currencies(code)`.
    - `enable row level security` для обеих новых таблиц.
    - GRANT SELECT на `currencies`, `fx_rates` для `authenticated`. INSERT/UPDATE/DELETE — только `service_role` (политики ограничивают для `authenticated`, GRANT-ы не выдаются).

- [x] **Фаза 2.10.2. Edge Function `fetch-ecb-rates` + расписание.** _(код написан, задеплоен на prod с `verify_jwt=false`; cron установлен через `pg_cron + pg_net.http_post` миграцией `20260528001000_fetch_ecb_rates_cron.sql` на `0 6 * * *`; первый ручной invoke вернул `{ok:true, inserted:6, currencies:[ILS,USD,GBP], skipped:[RUB]}`. Также добавлен GRANT на `currencies`/`fx_rates` для `service_role` — миграция `20260528000000_service_role_grants_currencies_fx.sql`.)_
  - Тянет `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`.
  - Парсит XML (там EUR-base курсы ко всем валютам, включая ILS).
  - Под `service_role`-ключом апсертит в `fx_rates`: для каждой `quote_code` в seed-списке — одна строка `(EUR, quote, rate, date)`. Дополнительно пишет обратные `(quote, EUR, 1/rate, date)` для быстрого lookup.
  - Расписание — Supabase scheduled functions (cron), раз в день в 06:00 UTC.
  - Для деплоя нужен Personal Access Token. Если нет — попросить у пользователя сгенерить на https://supabase.com/dashboard/account/tokens и прислать; тогда:
    ```
    SUPABASE_ACCESS_TOKEN=<pat> npx supabase functions deploy fetch-ecb-rates
    SUPABASE_ACCESS_TOKEN=<pat> npx supabase functions schedule create fetch-ecb-rates-daily --cron "0 6 * * *" --function fetch-ecb-rates
    ```

- [x] **Фаза 2.10.3. UI: валюта на счёте + базовая валюта семьи.**
  - В `Settings → Accounts` при создании/редактировании счёта — select валюты (default = `households.base_currency`).
  - В `Settings` — отдельная карточка «Базовая валюта семьи»: select из `currencies`, только owner может менять (UI прячет для partner, RLS — уже есть на UPDATE `households`).

- [x] **Фаза 2.10.4. Helper `convertMoney` + хук `useFxRates`.**
  - `src/lib/fx.ts`:
    - `convertMoney(amount: number, from: string, to: string, ratesByDate?: Map<...>): number` — если `from === to` → `amount`; иначе `amount * rate(from→EUR) * rate(EUR→to)` на ближайшую `as_of <= date` (или последнюю доступную).
    - Чистая функция, без I/O. Курсы передаются параметром.
  - `src/hooks/useFxRates.ts`:
    - `useFxRates()` грузит все `fx_rates` для актуальных дат (последние 90 дней — хватит) разово, отдаёт `Map<date, Map<code, rate_to_EUR>>` или плоскую структуру для O(1) lookup.
    - В будущем — точечный fetch на нужную дату; пока MVP.

- [x] **Фаза 2.10.5. Использование в UI.**
  - `Dashboard.totalBalance` и `monthTotals` — конвертация в `households.base_currency` через `convertMoney`.
  - На карточках счетов — баланс в валюте счёта (символ из `currencies.symbol`).
  - Список операций — формат с валютой счёта (символ + сумма с `currencies.decimals`).
  - Перевод между счетами разных валют — добавить опциональное поле «получено» в `AddOperationDialog` (если курс на дату не совпадает). Если пустое — конвертируем по `fx_rate` на `occurred_at`.
    - В `transfers` это значит хранить `fx_rate numeric(18,8) nullable` (поле уже зарезервировано в схеме Фазы 2.8). При создании пары операций `expense` пишется в валюте from-счёта (значение `amount`), `income` — в валюте to-счёта (значение `amount * fx_rate`).
    - RPC `create_transfer` нужно расширить параметром `p_to_amount` (необязательный) — если не передан, считается через текущий `fx_rate`.

- [x] **Фаза 2.10.6. End-to-end (сценарий H из Фазы 2).** _(прогнан через scripts/ffq.mjs: USD-счёт, $50 расход, конверсия `convertMoney(950 USD → ILS)` = 2694.16 ILS; кросс-валютный transfer $100 → 283.60 ILS через INSERT-эквивалент RPC. Реальный invoke `fetch-ecb-rates` после deploy вернул `{ok:true, as_of:'2026-05-27', inserted:6, currencies:[ILS,USD,GBP], skipped:[RUB]}` — fx_rates заполнились живыми ECB-курсами, source='ECB'.)_
  - Создать USD-счёт.
  - Добавить расход $50 на нём.
  - Запустить `fetch-ecb-rates` руками (Edge Function invoke) — проверить, что `fx_rates` пополнились.
  - На Dashboard итоговый баланс показан в ILS (с пересчётом по последнему курсу).
  - Кросс-валютный перевод: с USD-счёта на ILS-счёт; expense $50, income — рассчитанные ILS по курсу.

- [x] **Фаза 2.10.7. Закрытие плана + ROADMAP + рефлексия.**
  - Все фазы `[x]`, блок «Итог».
  - В `ROADMAP.md` — отметить мультивалюту как ✅ (внутри строки про Фазу 2).
  - `.business/история/YYYY-MM-DD-multivalyuta.md` по 5-пунктовому формату.

## Открытые вопросы

- Хранить ли исторические курсы дольше 90 дней? Для семьи это <1MB/год — терпимо. Чистку не делаем.
- Что если ECB не вернул курс для конкретной валюты (например, выходной)? — Идём назад по `as_of desc`, берём ближайший доступный. ECB не публикует по выходным — это нормально.
- ILS в ECB-фиде есть всегда (`<Cube currency='ILS' rate='...'/>`). Если вдруг исчезнет — фоллбек на Bank of Israel API, но это уже отдельная задача.
- UI для редактирования fx_rate руками (на случай, если ECB-курс не устраивает) — не делаем в этой ветке. Если надо — отдельная фича.

## Инварианты

- RLS одновременно с CREATE TABLE; GRANT-ы явные.
- Двухуровневая приватность сохраняется (этот слой не пересекается с ней).
- Никаких UI-библиотек поверх Tailwind.
- Все курсы — через EUR-cross (ECB).
- Операции хранятся в валюте счёта; агрегация — только в местах отображения.

## Не входит в эту ветку (намеренно)

- Хранение исторического курса **в самой операции** (т.е. snapshot курса на дату создания). Решили считать на лету — проще, и пользователь может править курс задним числом, если найдётся `fx_rates` за нужную дату.
- Поддержка крипты (BTC, ETH) — это Фаза 5, другая модель цен (CoinGecko, не ECB).
- AI-перевод сумм в чеках («200 шек» / «$50») — Фаза 6.

## Деплой миграций к prod-БД

Старый пароль (`GTwWTojNli9XJlBN`) ротирован 2026-05-28 через Supabase
Management API под PAT (Reset via Dashboard сделал браузерный Клод, но
переданное значение не подошло — переустановили API-вызовом). Новый
пароль — в `.env.local` пользователя, в `plans/` не хранится.

Pooler-логин (`postgres.<ref>@aws-1-…pooler.supabase.com:5432`) после
смены пароля не принимает новые креды (видимо, кешируется на стороне
pgbouncer); работает direct:

```
npx supabase db push --db-url \
  'postgresql://postgres:<password>@db.cngrrvfqwaqfydmfhiex.supabase.co:5432/postgres' \
  --yes
```

## Итог

Реализована полная цепочка мультивалюты поверх Фазы 2:

- **БД** (миграции `20260527220000_currencies_and_fx.sql`, `20260527230000_create_transfer_multicurrency.sql`):
  справочник `currencies` (seed: ILS/USD/EUR/GBP/RUB), `fx_rates` (EUR-cross, обе стороны),
  `households.base_currency` (default ILS), RLS «authenticated read / service_role write»,
  расширение `create_transfer` параметром `p_to_amount` для кросс-валютного перевода.
- **Edge Function `fetch-ecb-rates`** (`supabase/functions/fetch-ecb-rates/index.ts`): Deno-функция,
  парсит ECB XML, апсёртит в `fx_rates` обе стороны (EUR→X и X→EUR), под service_role.
  Те валюты, которых нет в фиде (RUB после 2022), молча пропускаются.
- **Frontend**: `useCurrencies` (с in-memory кэшем), `useFxRates` (90-дневное окно),
  чистая `convertMoney(amount, from, to, ratesByDate, onDate?)` через EUR-cross.
  Dashboard и Operations агрегируют `totalBalance`/`monthTotals`/`totals` в `base_currency`,
  с фолбеком при отсутствии курса. В Settings — карточка «Базовая валюта семьи» (owner-only),
  в форме счёта — select валюты, в форме перевода — поле «Получено» при разных валютах.
- **E2E**: Сценарий H пройден на уровне БД + helper-математики (USD-счёт, $50 расход,
  конверсия 950 USD → 2694.16 ILS, кросс-валютный transfer $100 → 283.60 ILS).
- **Dev-инфра**: `scripts/ffq.mjs` — раннер разовых SQL к prod-БД через `pg` (без сохранения в package.json).

Что в итоге сделано после первого закрытия плана:
- DB-пароль ротирован через Management API (PAT). Pooler-логин временно не
  работает после смены — используем direct connection через
  `db.<ref>.supabase.co:5432`.
- Edge Function `fetch-ecb-rates` задеплоена с `verify_jwt=false`. GRANT
  на `currencies`/`fx_rates` для `service_role` добавлен миграцией
  `20260528000000_service_role_grants_currencies_fx.sql`.
- Cron-расписание поставлено через `pg_cron + pg_net.http_post` миграцией
  `20260528001000_fetch_ecb_rates_cron.sql` (`0 6 * * *`). Команды
  `supabase functions schedule create`, которая была в исходном плане, в
  актуальной версии CLI нет — поэтому пошли через `pg_net`.
- Первый живой invoke вернул 6 строк в `fx_rates` (USD/GBP/ILS обе стороны),
  RUB пропущен (ECB не публикует с 2022).
