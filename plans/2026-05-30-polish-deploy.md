# План: Фаза 8 — Полировка и деплой

Цель ветки `feat/polish-deploy` — закрыть Фазу 8 из ROADMAP. После мержа:

1. Жена ставит приложение на главный экран айфона одним тапом (или, для iOS, по инструкции Share → На экран Домой).
2. Все экраны корректно отрисованы на iPhone (414px viewport, safe area для Home Bar).
3. Push-уведомления приходят на важные события (бюджет превышен, цель достигнута, settlement от партнёра) — без открытого приложения.
4. Приложение задеплоено на Vercel, доступно по постоянному URL без локального dev-сервера.
5. Бэкап БД задокументирован — куда смотреть, как восстановить.

UX-фильтр прежний: всё, что видит жена, понятно «с первого раза, без объяснений». Никаких лишних диалогов, попапов и галочек.

## Принципы

- **PWA-инсталл — мягкий, не назойливый.** Баннер «Установите на главный экран» один раз сверху Dashboard, dismissible, флаг в `localStorage` (`ff:install-prompt-dismissed`). После dismiss больше не показываем. В Settings — постоянная кнопка «Установить приложение» (для тех, кто dismiss'нул и потом передумал) и тут же сворачиваемый блок «На iPhone: Share → На экран Домой» со скриншотом эмодзи (🔗 → ➕).
- **iOS — отдельный путь.** `beforeinstallprompt` на iOS не существует. Детектируем по `navigator.userAgent` + `'standalone' in navigator`. На iOS показываем не кнопку, а инструкцию — и только если приложение ещё не запущено в `standalone`-режиме.
- **Safe area везде, где есть фикс-элементы или footer-зона.** Кнопка «+», `<main>`-padding, любые модалки. Tailwind v4 поддерживает arbitrary `env(safe-area-inset-bottom)` через `[bottom:max(1.5rem,env(safe-area-inset-bottom))]`.
- **Push — opt-in, всегда можно выключить.** В Settings → «Уведомления»: toggle. При включении — браузер спрашивает permission, после grant — subscribe → upsert в `push_subscriptions`. При выключении — `unsubscribe()` + delete row. Без явного включения пушей не шлём вообще.
- **Push-payload — без приватных данных.** В заголовке push'а — короткая фраза («Бюджет на еду превышен», «Подушка пополнена на 1200 ₪»). Никаких имён, паролей, токенов. Сумма — ОК (это про их семью). Номера счетов — нет.
- **Push-триггеры — события через очередь, не через realtime.** Любое событие, требующее уведомления, кладётся в новую таблицу `notification_queue(profile_id, title, body, url, created_at, sent_at)`. Edge Function `send-push` крутится на pg_cron каждые 5 минут, забирает `sent_at is null`, шлёт пуши через `web-push` библиотеку (Deno-порт), ставит `sent_at = now()`. Reasoning: realtime push из триггеров требует pg_net или webhook'ов в Supabase pro tier — у нас free. Очередь проще и устойчивее (если Edge упала — события не теряются).
- **VAPID — public в `.env.local` (`VITE_VAPID_PUBLIC_KEY`), private в `~/.config/ff-finance/vapid-private` + в Supabase secrets `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.** В репо ни тот, ни другой не попадает. Public ключ в браузере — это нормально, он именно для этого и есть.
- **Деплой на Vercel, не Cloudflare.** Reasoning: Vite-SPA из коробки Vercel понимает; Cloudflare Pages требует чуть больше танцев с rewrites. Privacy-разница для пет-проекта на двух человек несущественна. Доменом будет `*.vercel.app` (кастомный домен — отдельная микро-фича).
- **Все секреты ставит и проверяет агент, не пользователь.** Для шагов в чужих админках (Vercel, Supabase Dashboard) — готовый промт для Claude-с-браузером, результат складывается в `~/.config/ff-finance/<нужный-файл>`. Скрипт/код потом сам читает из файла.
- **Build + tsc + lint чистые** перед коммитом каждой подфазы.

## Открытые вопросы

- **Какие именно события триггерят пуш?** Базовый MVP-список: (a) бюджет превышен (любой), (b) цель достигнута 100%, (c) settlement от партнёра. Можно добавить «крупная трата от партнёра > X ₪» — но это требует выбора порога. Предлагаю в MVP только (a)(b)(c); порог для (d) — отдельная фича. **Решение: согласовать с пользователем перед Фазой 8.4.**
- **Кастомный домен?** `*.vercel.app` длинный и невзрачный, но бесплатный и сразу работает. Кастомный — $10–15/год + настройка DNS. **Решение: MVP — на `vercel.app`, кастомный — backlog.**
- **iOS Web Push требует iOS 16.4+ и установленной PWA.** Если у жены iOS старее или приложение не установлено — пуши не дойдут даже после grant. Это не баг плана, это ограничение платформы; в UI Settings рядом с toggle добавляем тонкий хинт «На iPhone — сначала установите на главный экран».
- **Supabase Auth redirect URLs** — после деплоя на Vercel нужно добавить новый origin (`https://<project>.vercel.app`) в Supabase → Auth → URL Configuration → Redirect URLs. Без этого OAuth от Google перестанет работать на prod-домене (localhost уже добавлен). Это часть деплой-промта для браузерного Клода.

## Инварианты, которые не ломаем

- Двухуровневая приватность (`accounts.visibility` + `operations.is_private`) — нерелевантна Фазе 8, но RLS на новых таблицах обязателен.
- `push_subscriptions` и `notification_queue` — у обеих `RLS enable`, политика `using profile_id = auth.uid()`. service_role гранчуем ТОЛЬКО на эти две таблицы (Edge Function `send-push` пишет `sent_at` и читает endpoint/keys). Никуда больше service_role не утекает.
- `notification_queue.body` — plain text, не должен содержать persistent IDs (operation_id, transfer_id). url — путь внутри приложения (например `/operations#op-<id>`), это публично только владельцу.
- Все деньги в пушах — в `base_currency` семьи. Конверсия — на момент создания queue-записи, не на момент отправки (курс может прыгнуть).
- UI-фильтр «понятно жене с первого раза» сохраняем: один баннер про PWA на Dashboard (не два, не три), одна кнопка в Settings.
- Никаких chart-библиотек.
- Комментарии в коде — только когда объясняют WHY (workaround, неочевидный инвариант).

## Не входит

- Кастомный домен (`vercel.app` достаточно).
- Push-триггер «крупная трата от партнёра > X ₪» (требует UI настройки порога).
- Юнит-тесты для `lib/push.ts` (как и в Фазах 3-5 — тестов нет, отдельная ветка `feat/tests`).
- Гендерная эвристика в DebtsSummary (отдельная микро-фича).
- Категории CRUD (отдельная фича; жена пока живёт на seed).
- Перевод приложения на en (всё на русском, как сейчас).
- Replay/восстановление потерянных пушей при долгом offline (free-tier Supabase ретеншн пушей — 7 дней).

## Фазы

- [ ] **Фаза 8.1. PWA-готовность: иконки, manifest, meta-теги.**
  - `public/`: добавить `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`, `apple-touch-icon.png` (180×180). Сгенерировать через node-скрипт `scripts/gen-pwa-icons.mjs` из `public/favicon.svg`, используя `sharp` (поставить в devDependencies). Maskable иконка — с safe zone (логотип занимает центральные 80% canvas, поля — solid brand color).
  - `vite.config.ts`: `theme_color: '#6366f1'` (brand indigo вместо тёмного slate), `background_color: '#f8fafc'` (под gradient body). Добавить `lang: 'ru'`, `categories: ['finance']`. Manifest icon с `purpose: 'maskable'` — отдельный файл, не дубль any.
  - `index.html`: title → `FF Finance`. Добавить:
    - `<meta name="theme-color" content="#6366f1" />`
    - `<meta name="apple-mobile-web-app-capable" content="yes" />`
    - `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`
    - `<meta name="apple-mobile-web-app-title" content="FF Finance" />`
    - `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`
    - В существующий `<meta name="viewport">` добавить `viewport-fit=cover` (для safe area).
  - SW регистрируется автоматически (`registerType: 'autoUpdate'`), отдельно ничего не зовём.
  - Сборка `npm run build` должна показать в `dist/`: manifest.webmanifest, sw.js, workbox-*.js, иконки.
  - Коммит: `feat(pwa): иконки, manifest, meta-теги для установки на главный экран`.

- [ ] **Фаза 8.2. InstallBanner на Dashboard + кнопка в Settings.**
  - Новый хук `src/hooks/useInstallPrompt.ts`:
    - Ловит `window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); setEvent(e) })`.
    - Возвращает `{ canInstall, isInstalled, isIOS, install: () => Promise<void>, dismissed, dismiss: () => void }`.
    - `isInstalled` = `window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true`.
    - `isIOS` = `/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream`.
    - `dismissed` — `localStorage.getItem('ff:install-prompt-dismissed') === '1'`. `dismiss()` — выставляет флаг.
    - На `appinstalled` — обнуляем event, ставим `isInstalled=true`.
  - Новый компонент `src/components/InstallBanner.tsx`:
    - Если `isInstalled` или `dismissed` → null.
    - Если `canInstall` → плашка «📱 Установите FF Finance на главный экран» + кнопка «Установить» (вызывает `install()`) и крестик (`dismiss()`).
    - Если `isIOS && !isInstalled && !dismissed` → плашка «На iPhone: нажмите 🔗 Share → ➕ На экран Домой» + крестик.
    - Если на остальных платформах нет `beforeinstallprompt` — null (например, Firefox без PWA).
  - **Размещение на Dashboard**: первой строкой, над балансом. Это самый верх — жена увидит сразу.
  - В `src/pages/Settings.tsx`: новая секция «Установка приложения». Всегда видна (даже после dismiss и после установки). Если `isInstalled` → «✅ Приложение установлено». Если `canInstall` → кнопка «Установить». Если `isIOS && !isInstalled` → инструкция. Если ни одно — серый хинт «Откройте этот URL в Safari/Chrome на телефоне, чтобы установить».
  - Коммит: `feat(pwa): мягкий install-баннер на Dashboard + кнопка в Settings`.

- [ ] **Фаза 8.3. Мобильная адаптация: safe area, навбар, кнопка +.**
  - `AppLayout.tsx`:
    - `<main>`: `pb-24` → `pb-[max(6rem,env(safe-area-inset-bottom)+5rem)]`.
    - Кнопка «+»: `bottom-6` → `bottom-[max(1.5rem,env(safe-area-inset-bottom)+0.5rem)]`. `right-6` оставляем.
    - Header `<div>`: добавить `pt-[env(safe-area-inset-top)]` (на айфоне в standalone статус-бар поверх).
    - Nav: на узких экранах горизонтальная NavItem-цепочка ломается. Решение: на `<md` показываем только эмодзи (📊 / 📝 / 🎯 / 🪙 / 🤝 / ⚙️) без подписей; на `≥md` — как сейчас, с текстом. Реализация: в `NavItem` принимаем `icon: string` и `children`, рендерим `<span class="md:hidden">{icon}</span><span class="hidden md:inline">{children}</span>`. Иконки: Дашборд 📊, Операции 📝, Цели 🎯, Крипта 🪙, Долги 🤝, Настройки ⚙️.
    - ViewModeSwitcher: на `<md` показываем только эмодзи (🧍 / 🏠) без имени, на `≥md` — с именем.
    - «Выйти»: на `<md` — иконка 🚪 (или 🔓) с aria-label «Выйти», на `≥md` — текст.
  - `index.css`: **dark mode оставляем как есть.** Планировал убрать, но dark-классы (`dark:bg-*`, `dark:text-*`) проросли по всем компонентам — без `prefers-color-scheme: dark` в css они бы всё равно сработали по системной теме (Tailwind v4 dark-variant по умолчанию media-based), и body стал бы светлым при тёмных карточках → рассинхрон. Чистка dark-классов — отдельная ветка, если когда-то понадобится. В этой фазе только синхронизировал theme_color манифеста с brand'ом.
  - **Шаги верификации** (вручную, агент не может покликать на айфоне):
    - `npm run dev` → открыть на десктопе с DevTools, выбрать «iPhone 12 Pro» (390×844) и «iPhone 14 Pro Max» (430×932). Прогнать: Dashboard / Operations / Goals / Crypto / Debts / Settings. Проверить, что навбар не вылезает, кнопка `+` не накрывается scrollbar'ом, модалки (AddOperationDialog, SettleDebtDialog, CryptoTxDialog) полностью видны и поля доступны.
    - Все цифры читаются (никаких 6-значных сумм поверх друг друга).
    - Прокрутка не упирается в кнопку `+` (внизу хватает воздуха).
    - Пользователь после мержа отдаёт жене Vercel-URL — финальная проверка на реальном айфоне.
  - Коммит: `feat(mobile): safe-area, эмодзи-нав на узких экранах, fix bottom-inset`.

- [ ] **Фаза 8.4. Web Push: VAPID, миграция, хук, Edge Function.**
  - **Подфаза 8.4.0. Согласование с пользователем перед началом:** список push-триггеров. По умолчанию: (a) бюджет превышен, (b) цель достигнута 100%, (c) settlement от партнёра. Если пользователь захочет другой набор — корректируем подфазу 8.4.4. Спросить нужно ТОЛЬКО эти триггеры, не разводить на остальные вопросы — план уже всё закрывает.
  - **Подфаза 8.4.1. VAPID-ключи.** Локально: `npx web-push generate-vapid-keys --json > /tmp/vapid.json`. Public ключ кладём в `.env.local` как `VITE_VAPID_PUBLIC_KEY=...` (новая переменная, в репо не идёт). Private ключ + subject (`mailto:avramshulga@gmail.com`) кладём в `~/.config/ff-finance/vapid-private` (одна строка JSON `{"privateKey":"...","subject":"mailto:..."}`) c `chmod 600`. Удаляем `/tmp/vapid.json`.
  - **Подфаза 8.4.2. Миграция `20260530600000_push_subscriptions.sql`:**
    ```sql
    create table public.push_subscriptions (
      id uuid primary key default gen_random_uuid(),
      profile_id uuid not null references public.profiles(id) on delete cascade,
      endpoint text not null,
      p256dh text not null,
      auth text not null,
      created_at timestamptz not null default now(),
      unique (profile_id, endpoint)
    );
    create index push_subscriptions_profile_idx on public.push_subscriptions(profile_id);
    alter table public.push_subscriptions enable row level security;
    create policy "Own subscriptions: select" on public.push_subscriptions for select using (profile_id = auth.uid());
    create policy "Own subscriptions: insert" on public.push_subscriptions for insert with check (profile_id = auth.uid());
    create policy "Own subscriptions: delete" on public.push_subscriptions for delete using (profile_id = auth.uid());
    grant select, insert, delete on public.push_subscriptions to authenticated;
    grant select, delete on public.push_subscriptions to service_role;

    create table public.notification_queue (
      id uuid primary key default gen_random_uuid(),
      profile_id uuid not null references public.profiles(id) on delete cascade,
      title text not null,
      body text not null,
      url text,
      created_at timestamptz not null default now(),
      sent_at timestamptz
    );
    create index notification_queue_unsent_idx on public.notification_queue(created_at) where sent_at is null;
    alter table public.notification_queue enable row level security;
    create policy "Own queue: select" on public.notification_queue for select using (profile_id = auth.uid());
    grant select on public.notification_queue to authenticated;
    grant select, update on public.notification_queue to service_role;
    -- Insert делает Edge Function под service_role; пользователи в очередь не пишут.
    ```
    Применить: `npm run db:push`. `types/database.ts`: добавить обе таблицы.
  - **Подфаза 8.4.3. Хук + UI подписки.**
    - `src/lib/push.ts`: `subscribe(): Promise<PushSubscription | null>` — запрашивает permission, регистрирует у SW. Конвертирует `applicationServerKey` (`urlBase64ToUint8Array`). `unsubscribe(): Promise<void>`. Чистые функции, без сайд-эффектов вне браузерного API.
    - `src/hooks/usePush.ts`: `{ permission, isSubscribed, loading, enable: () => Promise<void>, disable: () => Promise<void> }`. `enable` — subscribe + upsert строки `(profile_id, endpoint, p256dh, auth)`. `disable` — unsubscribe + delete row по endpoint.
    - В Settings: новая секция «🔔 Уведомления» с toggle. Под toggle хинт: «Получать push о превышении бюджета, достижении цели и settlement'ах от партнёра. На iPhone: сначала установите приложение на главный экран». Если `permission === 'denied'` → серый текст «Уведомления заблокированы в настройках браузера. Разрешите доступ → попробуйте снова».
  - **Подфаза 8.4.4. Триггеры и заполнение `notification_queue`.**
    - Триггеры пишем **на стороне БД** (SQL `create function ... language plpgsql` + `create trigger`), а не в Edge Function — это надёжнее и не зависит от деплоя функции. Для каждого триггера определяем кого нотифицируем (партнёра или обоих).
    - В новой миграции `20260530600100_notification_triggers.sql`:
      - **Бюджет превышен:** функция `notify_budget_exceeded()` — триггер на `operations` after insert/update. Считает сумму expense'ов категории в текущем месяце; если перевалила за `budgets.amount` И до операции не переваливала — insert в queue для каждого `household_member`. Заголовок: «Бюджет превышен», тело: `«{category}: потрачено {sum_in_base} {base_currency}, бюджет {budget_amount}»`, url: `/`.
      - **Цель достигнута:** функция `notify_goal_reached()` — триггер на `operations` after insert/update (потому что goal `current_amount` считается из autotransfer-операций; goals.current_amount у нас нет колонки, считается в lib/goals — значит триггер вешаем не на goals, а смотрим в `goals` view: на каждое изменение operations пересчитываем; если goal X пересёк 100% — insert. Если такая логика становится больно сложной — упрощаем: тригер на goals.update только при изменении target_amount/end_date, а 100%-факт считает Edge Function каждые 5 мин по тому же SQL что lib/goals. **Решение принимается в момент реализации после чтения goals/contributions кода.**
      - **Settlement от партнёра:** функция `notify_settlement()` — триггер на `transfers` after insert WHERE `is_debt_settlement = true`. Insert в queue для `to_account.owner_profile_id`. Заголовок: «Долг погашен», тело: «{from_name} перевёл вам {amount} {currency}», url: `/debts`.
    - Применить: `npm run db:push`.
  - **Подфаза 8.4.5. Edge Function `supabase/functions/send-push/index.ts`.**
    - Deno-функция, импортирует `web-push` через `npm:web-push@3` (Deno 2 поддерживает npm-импорты).
    - Алгоритм:
      1. SELECT `id, profile_id, title, body, url FROM notification_queue WHERE sent_at IS NULL ORDER BY created_at LIMIT 100`.
      2. Для каждой записи: SELECT `endpoint, p256dh, auth FROM push_subscriptions WHERE profile_id = $1`.
      3. Для каждой subscription: `webpush.sendNotification({ endpoint, keys }, JSON.stringify({ title, body, url }), { vapidDetails: { subject, publicKey, privateKey } })`. Если 410 Gone или 404 → delete subscription (мусор).
      4. UPDATE queue SET sent_at = now() WHERE id = $1.
    - Secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
  - **Подфаза 8.4.6. SW-обработчик `push` события.**
    - vite-plugin-pwa с `injectRegister: 'auto'` генерит SW по умолчанию через workbox. Для кастомных handler'ов добавляем в `vite.config.ts` `strategies: 'injectManifest'` и пишем `public/sw.ts` (или `src/sw.ts`) с:
      ```ts
      self.addEventListener('push', (event) => {
        const data = event.data?.json() ?? {}
        event.waitUntil(self.registration.showNotification(data.title, { body: data.body, data: { url: data.url }, icon: '/pwa-192x192.png', badge: '/pwa-192x192.png' }))
      })
      self.addEventListener('notificationclick', (event) => {
        event.notification.close()
        const url = event.notification.data?.url ?? '/'
        event.waitUntil(self.clients.matchAll({ type: 'window' }).then(clients => {
          const existing = clients.find(c => c.url.includes(url))
          if (existing) return existing.focus()
          return self.clients.openWindow(url)
        }))
      })
      ```
    - **Решение**: использовать `injectManifest` придётся. Иначе кастомный push-handler не добавить. Это нетривиальное изменение vite-config и сборки — закладываем в подфазу время.
  - **Подфаза 8.4.7. Деплой Edge Functions + pg_cron + tail Фазы 5.**
    - Промт для Claude-с-браузером: получить Supabase Personal Access Token и положить в `~/.config/ff-finance/supabase-pat` (chmod 600). Промт выдаётся в чат пользователю как один code-fence (см. правило handoff).
    - После получения PAT:
      - `SUPABASE_ACCESS_TOKEN=$(node -e "console.log(fs.readFileSync('/Users/avifrenkel/.config/ff-finance/supabase-pat','utf8').trim())") npx supabase functions deploy send-push --project-ref cngrrvfqwaqfydmfhiex --no-verify-jwt`
      - То же для `fetch-coingecko-prices` (tail Фазы 5).
      - Secrets: `npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:... --project-ref cngrrvfqwaqfydmfhiex` (значения из `~/.config/ff-finance/vapid-private` + .env.local, читаем через node).
      - Миграция `20260530600200_send_push_cron.sql`: pg_cron schedule `*/5 * * * *` → `https://<ref>.functions.supabase.co/send-push` через `net.http_post` (extension pg_net должен быть включён; если нет — `create extension if not exists pg_net`). Применить через `npm run db:push`.
  - Коммит подфаз: 8.4.2 + 8.4.3 + 8.4.4 + 8.4.5/6 + 8.4.7 — пять отдельных коммитов с понятными сообщениями.

- [ ] **Фаза 8.5. Деплой фронта на Vercel.**
  - Локально: создать `vercel.json` с SPA-rewrite (`{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }`) — чтобы React Router работал на прямых URL `/operations`, `/debts` и т.д.
  - Локально: убедиться, что `npm run build` чистый и в `dist/` лежит работающая статика. Проверить через `npx vite preview --port 4173`, что Auth callback не ломается (`/auth/callback`).
  - Промт для Claude-с-браузером: создать Vercel-проект из GitHub-репо, добавить env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`), задеплоить, скопировать deployment URL в `~/.config/ff-finance/deploy-url`.
  - После deploy: второй промт для Claude-с-браузером — добавить prod-URL в Supabase Dashboard → Authentication → URL Configuration → Redirect URLs (`https://<deploy-url>/auth/callback`). И там же в Google OAuth client (если используется Google login) → Authorized redirect URIs.
  - Локально (агент сам): прочитать deploy-url, открыть curl-ом — проверить что HTML отдаётся и manifest.webmanifest доступен.
  - Коммит: `chore(deploy): vercel.json для SPA-rewrite`.

- [ ] **Фаза 8.6. Бэкапы БД — документация.**
  - В `README.md` добавить секцию «Бэкап и восстановление БД»:
    - Supabase free tier: автоматический daily backup, retention 7 дней.
    - Где смотреть: Supabase Dashboard → Database → Backups.
    - Восстановление: только через UI (restore to point-in-time на free недоступен; на free — только полный restore из daily snapshot).
    - Рекомендация: раз в месяц вручную `pg_dump` через `npm run db:push` connection и складывать в `~/Backups/ff-finance/YYYY-MM-DD.sql.gz`. Добавить скрипт `scripts/db-dump.mjs` (читает connection как и `db-push.mjs`, дёргает `pg_dump`, gzip'ит, кладёт в `~/Backups/ff-finance/`).
    - `npm run db:backup` — npm-script для запуска.
  - Коммит: `docs+chore(backup): инструкция и npm run db:backup`.

- [ ] **Фаза 8.7. Финал: ROADMAP, рефлексия, merge.**
  - Обновить `ROADMAP.md`: Фаза 8 → ✅, все 5 пунктов отметить.
  - Обновить блок «Итог» в этом плане: что реализовано, что отложено, какие follow-up'ы остались.
  - Создать `.business/история/2026-05-30-polish-deploy.md` по 5-пунктовому формату.
  - `git checkout main && git merge --no-ff feat/polish-deploy -m "<подробный merge-message>"`.
  - Финальный смоук: открыть prod-URL, залогиниться, добавить операцию, проверить что новая операция отображается, что push приходит после превышения бюджета (если quick-test можно сделать на тестовой категории с бюджетом 1 ₪).

## Деплой миграций

В этой ветке три новые миграции (одной командой `npm run db:push`):
1. `20260530600000_push_subscriptions.sql` — таблицы `push_subscriptions` + `notification_queue`.
2. `20260530600100_notification_triggers.sql` — триггеры на operations/transfers + функция notify_*.
3. `20260530600200_send_push_cron.sql` — pg_cron schedule на `send-push`.

Применяются последовательно (Supabase order = по имени). Откат — отдельной миграцией, не правим прошлые.

## Итог

**Закрыто на 100%:**
- Фаза 8.1: PWA-готовность. Иконки 192/512/maskable + apple-touch (генерируются на prebuild через `npm run pwa:icons`), `theme_color: #6366f1`, лицевые meta-теги (theme-color, apple-mobile-web-app-*), `viewport-fit=cover`. Манифест `dist/manifest.webmanifest` валидный, lighthouse PWA-проверка должна проходить.
- Фаза 8.2: `InstallBanner` первой строкой на Dashboard + `InstallSection` в Settings (всегда видна). Хук `useInstallPrompt` ловит `beforeinstallprompt`/`appinstalled`, детектит standalone + iOS (с учётом iPadOS-маскировки под Macintosh), `localStorage` dismiss.
- Фаза 8.3: safe-area для `<header>`/`<main>`/кнопки «+», на узких экранах навбар свернулся в эмодзи-ряд с aria-label'ами, ViewModeSwitcher показывает только 🧍/🏠. Реальное живое тестирование на айфоне жены — после деплоя (см. ниже).
- Фаза 8.4.1–8.4.6: VAPID-ключи, миграции `push_subscriptions` + `notification_queue` + триггеры `notify_budget_exceeded` / `notify_goal_reached` / `notify_settlement` (с dedup_key), хук `usePush`, секция «🔔 Уведомления» в Settings, SW (переход на `injectManifest`) с обработчиками `push`/`notificationclick`, Edge Function `send-push` на Deno + `web-push@3.6.7`.
- Фаза 8.6: `npm run db:backup` через `pg_dump` → `~/Backups/ff-finance/*.sql.gz`, раздел «Бэкап и восстановление БД» в README.

**Также закрыто (8.4.7, после получения Supabase PAT):**
- `npx supabase functions deploy send-push --project-ref cngrrvfqwaqfydmfhiex --no-verify-jwt` — успешно.
- `npx supabase functions deploy fetch-coingecko-prices --project-ref cngrrvfqwaqfydmfhiex --no-verify-jwt` — успешно (tail Фазы 5: pg_cron этой функции больше не уходит в 404).
- `npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:avramshulga@gmail.com --project-ref cngrrvfqwaqfydmfhiex` — успешно.
- Smoke-curl на `/functions/v1/send-push` → `{"ok":true,"processed":0,"sent":0,"ms":~300}`.
- Миграция `20260530600200_send_push_cron.sql` накатана — pg_cron каждые 5 мин зовёт send-push.

**Отложено (нужно ручное действие в Vercel UI):**
- Фаза 8.5: деплой фронта на Vercel. У аккаунта `avifrenk` нет personal scope (никогда не открывал dashboard), а через API team создать не удалось — Vercel требует payment method. После того как пользователь один раз пройдёт Hobby-онбординг на https://vercel.com/dashboard, CLI деплоит сам без дополнительных вопросов: `vercel link --yes` → `vercel env add` x3 (значения из `.env.local`) → `vercel deploy --prod`. Затем добавить prod-URL в Supabase Auth → Redirect URLs (через REST API под тем же PAT, без UI).
- «Тестирование с супругой и итерация» — следствие отложенного 8.5.

**Follow-up'ы из плана:**
- Гендерная эвристика в `DebtsSummary` (имя на а/я → ж.р.) — не трогали; на нерусских именах ошибается. Лечится `profile.gender` или нейтральной формулировкой.
- Категории CRUD — не трогали; жена пока живёт на seed.
- Юнит-тесты (vitest для `lib/crypto.ts`, `lib/debts.ts`, теперь ещё `lib/push.ts`) — отдельная ветка `feat/tests`.
- Push-триггер «крупная трата от партнёра > X ₪» — отложен, нужна UI настройка порога.
- Удаление `dark:`-классов из всех компонентов (синхронно с убиранием `prefers-color-scheme: dark` из CSS) — отдельная ветка.

**Что пользоваться можно прямо сейчас (без деплоя):**
- Локально (`npm run dev`) — всё кроме реальной доставки пушей. Триггеры в БД уже работают: при превышении бюджета строка в `notification_queue` появится — её можно увидеть через select для своего профиля.
- `npm run db:backup` — сохраняет дамп в `~/Backups/ff-finance/`.
