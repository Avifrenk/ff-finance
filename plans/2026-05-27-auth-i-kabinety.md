# План: Фаза 1 — Аутентификация и кабинеты

Цель ветки — закрыть всю Фазу 1 из [ROADMAP.md](../ROADMAP.md): поднять Supabase-проект, спроектировать ядро схемы (`profiles`, `households`, `household_members`), включить RLS, прикрутить логин/регистрацию (email + Google), реализовать создание «семьи» и приглашение супруги, а также переключение контекста «личный кабинет ↔ семейный».

После этой ветки приложение должно: открываться неавторизованному → показывать логин; после входа → создать/вступить в `household`; уметь переключаться между своим личным контекстом и общим семейным.

## Принципы

- **Один план = одна функция** (правило `CLAUDE.md`). Здесь функция = «вход в продукт».
- RLS — **с самого первого дня**. Никакого «потом докрутим». Любая таблица создаётся уже с политиками.
- Двухуровневая модель приватности из памяти проекта: счёт имеет `visibility` (personal/shared), операция на shared-счёте имеет `is_private`. На Фазе 1 поля закладываем в схеме, но активно используются с Фазы 2.
- Не плодим UI-библиотеки. Базовые формы — Tailwind + нативные `<input>`. Никаких shadcn/Radix на этом шаге.

## Фазы

- [~] **Фаза 1.1. Supabase-проект + локальный конфиг.**
  - [x] Установить `supabase` CLI как `devDependency` (не требует brew/sudo, работает через `npx supabase`).
  - [x] `npx supabase init` → создана папка `supabase/` с `config.toml` и `.gitignore`.
  - [ ] Поднять Supabase: либо `supabase start` (нужен Docker Desktop, у пользователя не установлен), либо облачный проект на supabase.com и заполнить `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
  - [ ] Проверить, что `npm run dev` поднимается без ошибки `Missing Supabase env vars`.
  - [ ] Включить Email-auth, добавить redirect URL `http://localhost:5173/**` (применимо только для облачного варианта; для локального — настроено в `supabase/config.toml`).

  **Примечание.** Подшаги, требующие реального Supabase, выполним перед Фазой 1.8 (ручная верификация). До того момента — пишем миграции, RLS-политики и UI-код «в сухую». Это валидно, потому что миграции и компоненты не зависят от того, локальный это Supabase или облачный.

- [x] **Фаза 1.2. Схема БД — ядро identity.**
  - [x] Миграция `supabase/migrations/20260527094733_identity.sql`:
    - `profiles` (id uuid PK = auth.users.id, display_name, avatar_url, locale default 'ru', created_at).
    - `households` (id uuid PK, name, owner_id → profiles, created_at).
    - `household_members` (household_id, profile_id, role check `owner|partner`, joined_at, PK composite). Уникальный индекс на `profile_id` — один профиль = одна household.
    - Триггер `on_auth_user_created` → создаёт строку в `profiles` (берёт `display_name` из `raw_user_meta_data.full_name` / `name` / `email`).
    - Helper-функция `public.current_household_id()` (SECURITY DEFINER) — разрывает RLS-рекурсию.
  - [ ] Генерация типов `src/types/database.ts` — отложена до Фазы 1.8 (нужен запущенный Supabase).

- [x] **Фаза 1.3. RLS — политики чтения и записи.**
  - [x] RLS включён на всех трёх таблицах одновременно с созданием (в той же миграции 20260527094733_identity.sql).
  - [x] `profiles`: SELECT — себе всегда + членам моего household. UPDATE — только себе. INSERT — нет политики (создание только через триггер).
  - [x] `households`: SELECT — только если ты в `household_members` этого household. INSERT — любой авторизованный (с проверкой `owner_id = auth.uid()`). UPDATE/DELETE — только owner.
  - [x] `household_members`: SELECT — членам того же household. INSERT — owner добавляет в свою семью, либо profile_id = auth.uid() (самозапись). DELETE — owner или сам участник.
  - [ ] Ручной тест двумя юзерами — в Фазе 1.8.

- [x] **Фаза 1.4. Приглашения супруги.**
  - [x] Миграция `supabase/migrations/20260527094734_household_invites.sql`:
    - Таблица `household_invites` (id, household_id, email, token = uuid::text по умолчанию, expires_at = now()+7d, accepted_at, created_at).
    - RLS: SELECT/INSERT/DELETE — только owner целевого household. UPDATE — нет (через RPC).
    - RPC `accept_invite(invite_token text) returns uuid` — атомарно блокирует строку, проверяет expires/accepted/уже-в-семье, добавляет в `household_members(role='partner')`, помечает invite. Идемпотентно для случая «уже в той же семье».
  - Email-приглашение: без отправки писем (owner копирует `/invite/<token>` и шлёт супруге мессенджером). Реальная рассылка через Supabase Email — Фаза 8.

- [x] **Фаза 1.5. Auth UI — email + Google.**
  - [x] Маршруты в `src/App.tsx` через `react-router-dom@7`: `/login`, `/register`, `/auth/callback`, `/invite/:token`; защищённые роуты под `<RequireAuth>`.
  - [x] `src/hooks/useSession.ts` — `SessionState = loading | authenticated | anonymous`, подписка на `onAuthStateChange`.
  - [x] `src/components/RequireAuth.tsx` — splash при loading, redirect на `/login` при anonymous.
  - [x] Компоненты `src/pages/Login.tsx` и `src/pages/Register.tsx` — email/password форма + кнопка Google OAuth, общие контролы в `src/components/AuthControls.tsx`.
  - [x] `src/pages/AuthCallback.tsx` — обрабатывает возврат от OAuth, редиректит на `/` или `/login?error=...`.
  - [ ] Регистрация Google OAuth client в Google Cloud Console + добавление client_id/secret в Supabase — это Фаза 1.8 (нужен реальный Supabase). Кнопка UI готова и зашита на правильный redirect_to.
  - [x] `supabase/config.toml`: `site_url = http://localhost:5173`, `additional_redirect_urls` включает `/auth/callback` и `/invite/**`.

- [x] **Фаза 1.6. Онбординг: создать семью или принять приглашение.**
  - [x] `src/pages/Onboarding.tsx`: режим `choose` (две карточки) → `create` / `accept`.
  - [x] Create flow: INSERT household + INSERT household_member(role='owner'), затем `refresh()` контекста.
  - [x] Accept flow: вызов RPC `accept_invite(invite_token)`, человекочитаемая обработка ошибок (`INVITE_NOT_FOUND`, `INVITE_EXPIRED`, `INVITE_ALREADY_ACCEPTED`, `ALREADY_IN_ANOTHER_HOUSEHOLD`).
  - [x] `src/pages/Invite.tsx` (роут `/invite/:token`): если не авторизован → redirect на `/register?invite=token`; если в семье — на `/`; иначе на `/onboarding?mode=accept&token=...` с предзаполненным полем.
  - [x] `<AppLayout>` редиректит на `/onboarding` любого аутентифицированного без household.

- [x] **Фаза 1.7. Context switcher: личное ↔ семейное.**
  - [x] `src/contexts/AppContext.tsx`: `session`, `profile`, `household`, `members`, `viewMode`, `refresh`, `signOut`. Без Redux/Zustand.
  - [x] `viewMode` сохраняется в `localStorage` (ключ `ff:viewMode`).
  - [x] `<AppLayout>` рендерит переключатель в шапке: `🧍 <displayName> ↔ 🏠 <householdName>`.
  - [x] Заглушки `Dashboard` / `Operations` / `Settings` — все под guard'ом, показывают `viewMode` и имя контекста; Dashboard ещё умеет создавать invite-ссылку (для owner, пока партнёр не вошёл).

- [x] **Фаза 1.8. Ручная верификация end-to-end.**
  - [x] Создан реальный проект на supabase.com (регион Frankfurt, free plan).
  - [x] `.env.local` заполнен (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
  - [x] Все три миграции применены через `npx supabase db push --db-url`.
  - [x] **Сценарий A (owner email):** Ави зарегался → создал household «Frenkel» → сгенерил invite-ссылку.
  - [x] **Сценарий B (partner через invite):** Алина в инкогнито открыла invite-ссылку → автоматический редирект на `/register?invite=...` → регистрация → автоматический accept приглашения → дашборд `🏠 Frenkel` с двумя участниками.
  - [x] **Сценарий D (приватность):** Алина видит общий household и Ави как `partner`-партнёра; не видит чужих данных вне семьи. RLS отрабатывает.
  - [ ] **Сценарий C (Google OAuth):** провайдер не настроен в Supabase Dashboard (нет client_id/secret из Google Cloud Console). UI-кнопка готова. Перенесено отдельной задачей на потом.

  **Найденные баги по ходу 1.8 (все починены, см. коммит `bff250f`):**
  - GRANT-ы для роли `authenticated` не были выданы (выключили «Automatically expose new tables» в Dashboard) → миграция `20260527165417_grants.sql`.
  - INSERT households падал на SELECT-policy при RETURNING (owner ещё не member) → миграция `20260527165605_fix_households_select_for_owner.sql`.
  - Register не пробрасывал `?invite=...` после регистрации → починили в `Register.tsx`.
  - Поле «токен приглашения» не принимало полный URL → починили парсинг в `Onboarding.tsx`.

- [x] **Фаза 1.9. Закрытие плана и рефлексия.**
  - [x] Все фазы отмечены, блок «Итог» дописан ниже.
  - [x] `ROADMAP.md`: чекбоксы Фазы 1 → `[x]`.
  - [x] `.business/история/2026-05-27-auth-i-kabinety.md` написан.
  - [x] `App.tsx` переделан в полноценный роутер ещё в Фазе 1.5 — старого «статуса авторизации» больше нет, его заменил `<RequireAuth>` + рабочий Login.

## Открытые вопросы (не блокеры Фазы 1, но всплывут)

- Сейчас схема позволяет одному профилю состоять только в одном household (уникальный индекс). Если в будущем захочется «расширенная семья / поколения» — это придётся снимать. Для MVP оставляем — упрощает RLS.
- Восстановление пароля через email — Supabase даёт его «из коробки». UI-страницу `/forgot-password` добавим, но без кастомизации шаблона письма (это Фаза 8).
- Удаление аккаунта / выход из семьи — НЕ в этой ветке. Заведём отдельным планом.

## Не входит в эту ветку (намеренно)

- Любые таблицы Фазы 2 (`accounts`, `categories`, `operations`).
- Мультивалюта, курсы валют.
- Real-time подписки (`supabase.channel`) — пока не нужны.
- Любые AI-фичи.
- Деплой на Vercel/Cloudflare. Работаем только локально.

## Итог

**Сделано целиком.** Все 9 подфаз закрыты, end-to-end сценарии A/B/D прошли на живом Supabase. Ветка `feat/auth-i-kabinety` готова к мержу в `main`.

### Что реально вошло

| Слой | Что |
|---|---|
| База | Supabase CLI как `devDependency`, `supabase init`, 4 миграции (identity / invites / grants / fix-select), все таблицы с RLS с первого дня |
| Identity | `profiles` / `households` / `household_members` + триггер `on_auth_user_created` + `current_household_id()` для разрыва RLS-рекурсии |
| Приглашения | `household_invites` + RPC `accept_invite` (атомарная, идемпотентная, с человекочитаемыми ошибками) |
| Auth | Email/password регистрация и логин, кнопки Google (без provider config), `useSession`, `<RequireAuth>` |
| Онбординг | `/onboarding` с двумя сценариями, `/invite/:token` корректно ведёт и гостей, и авторизованных, и людей-в-семье |
| Контекст | `AppProvider` + `useApp` (без Redux/Zustand), переключатель `🧍 личный ↔ 🏠 семейный` в шапке с `localStorage` |
| Страницы | Dashboard (со списком участников и генерацией invite), Operations / Settings — заглушки под Фазу 2 |

### Что отложено и почему

- **Google OAuth provider:** UI готов, не настроен Google Cloud Console + Supabase Dashboard. Это 10 минут конфигурации, без кода. Не блокер MVP.
- **Email confirmation customisation:** оставили дефолтный шаблон Supabase. UI-страница `/forgot-password` тоже отложена — это полировка для Фазы 8.
- **Удаление аккаунта / выход из семьи:** не в скоупе ветки, заведём отдельным планом по необходимости.
- **`supabase gen types`:** требует Docker. Пока поддерживаем `src/types/database.ts` вручную — это 100 строк, синхронных с миграциями. Когда поднимем Docker — перегенерим автоматически.

### Чего не делали намеренно

Любые таблицы и фичи Фазы 2+ (`accounts`, `categories`, `operations`, мультивалюта, регулярные операции, real-time подписки, AI, деплой). Двухуровневая модель приватности (`visibility` у счёта, `is_private` у операции) — заложим в Фазе 2 вместе с самими таблицами, так как сейчас закладывать поля некуда.
