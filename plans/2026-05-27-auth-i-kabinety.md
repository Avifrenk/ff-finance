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

- [ ] **Фаза 1.8. Ручная верификация end-to-end.**
  - Сценарий A (owner): регистрация email → создание household «Frenkel» → копирование invite-ссылки.
  - Сценарий B (partner): в инкогнито — регистрация по invite-ссылке → автоматически в той же household.
  - Сценарий C (Google): вход через Google → попадает в onboarding → создаёт household.
  - Сценарий D (приватность): партнёр видит общий household, но НЕ видит чужого `profile` вне household и НЕ может прочесть чужие invites.
  - Зафиксировать скриншоты (по желанию) в `.business/история/`.

- [ ] **Фаза 1.9. Закрытие плана и рефлексия.**
  - Отметить все фазы `[x]`, дописать блок «Итог» (что реально вошло, что отложено и почему).
  - Обновить `ROADMAP.md`: чекбоксы Фазы 1 → `[x]`.
  - Создать `.business/история/YYYY-MM-DD-auth-i-kabinety.md` по формату из `CLAUDE.md` (5 пунктов: задача / как решал / решил ли / эффективно ли / как было → как стало).
  - В `App.tsx` снять статус «Авторизация» с серого на зелёный.

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

(заполнить в конце ветки)
