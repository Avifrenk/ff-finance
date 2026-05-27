# План: Фаза 1 — Аутентификация и кабинеты

Цель ветки — закрыть всю Фазу 1 из [ROADMAP.md](../ROADMAP.md): поднять Supabase-проект, спроектировать ядро схемы (`profiles`, `households`, `household_members`), включить RLS, прикрутить логин/регистрацию (email + Google), реализовать создание «семьи» и приглашение супруги, а также переключение контекста «личный кабинет ↔ семейный».

После этой ветки приложение должно: открываться неавторизованному → показывать логин; после входа → создать/вступить в `household`; уметь переключаться между своим личным контекстом и общим семейным.

## Принципы

- **Один план = одна функция** (правило `CLAUDE.md`). Здесь функция = «вход в продукт».
- RLS — **с самого первого дня**. Никакого «потом докрутим». Любая таблица создаётся уже с политиками.
- Двухуровневая модель приватности из памяти проекта: счёт имеет `visibility` (personal/shared), операция на shared-счёте имеет `is_private`. На Фазе 1 поля закладываем в схеме, но активно используются с Фазы 2.
- Не плодим UI-библиотеки. Базовые формы — Tailwind + нативные `<input>`. Никаких shadcn/Radix на этом шаге.

## Фазы

- [ ] **Фаза 1.1. Supabase-проект + локальный конфиг.**
  - Создать проект в Supabase (регион eu-central или ближайший к IL).
  - Заполнить `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Файл уже игнорируется git'ом.
  - Проверить, что `npm run dev` поднимается без ошибки `Missing Supabase env vars`.
  - В Supabase Dashboard включить Email-auth, добавить redirect URL `http://localhost:5173`.

- [ ] **Фаза 1.2. Схема БД — ядро identity.**
  - Завести папку `supabase/migrations/` (если её нет) и первую миграцию `0001_identity.sql`:
    - `profiles` (id uuid PK = auth.users.id, display_name, avatar_url, locale default 'ru', created_at).
    - `households` (id uuid PK, name, owner_id → profiles, created_at).
    - `household_members` (household_id, profile_id, role enum `owner|partner`, joined_at, PK composite). Уникальный индекс: один профиль = максимум один household (на MVP пары).
    - Триггер `on_auth_user_created` → создаёт строку в `profiles`.
  - Сгенерировать типы: `npx supabase gen types typescript --project-id <id> > src/types/database.ts`.

- [ ] **Фаза 1.3. RLS — политики чтения и записи.**
  - Включить RLS на всех трёх таблицах.
  - `profiles`: SELECT — себе всегда, плюс «членам моего household». UPDATE — только себе.
  - `households`: SELECT — только если ты `household_members.profile_id = auth.uid()`. INSERT — любой авторизованный (создаёт свою семью). UPDATE — только owner.
  - `household_members`: SELECT — членам того же household. INSERT — owner добавляет partner. DELETE — owner или сам участник (выход).
  - Ручной тест: вторым тестовым юзером убедиться, что не видишь чужой `household` и его профиль.

- [ ] **Фаза 1.4. Приглашения супруги.**
  - Таблица `household_invites` (id, household_id, email, token, expires_at, created_at, accepted_at nullable).
  - RPC-функция `accept_invite(token text)` — атомарно: проверяет токен, добавляет в `household_members`, помечает invite принятым.
  - Email-приглашение: пока **без отправки писем** — owner получает ссылку `/invite/<token>`, копирует и шлёт супруге сам (мессенджером). Реальная рассылка через Supabase Email — отложим до Фазы 8 (полировка).

- [ ] **Фаза 1.5. Auth UI — email + Google.**
  - Маршруты через `react-router-dom@7`: `/login`, `/register`, `/invite/:token`, всё остальное под guard'ом.
  - Хук `useSession()` — обёртка над `supabase.auth.getSession()` + `onAuthStateChange`.
  - Компонент `<RequireAuth>` (HOC/wrapper) — редиректит на `/login`.
  - Google OAuth: настроить provider в Supabase Dashboard (Google Cloud Console → OAuth client). На локалке — `http://localhost:5173/auth/callback`.

- [ ] **Фаза 1.6. Онбординг: создать семью или принять приглашение.**
  - Если у юзера нет `household_members` — `/onboarding`: две карточки «Создать семью» / «У меня есть приглашение».
  - «Создать семью» → форма имени (например «Frenkel») → INSERT household + INSERT household_member(role=owner).
  - «Принять приглашение» → ввод токена (или вход по `/invite/:token`) → вызов RPC `accept_invite`.

- [ ] **Фаза 1.7. Context switcher: личное ↔ семейное.**
  - Глобальный store (React Context, без Redux/Zustand — для пары избыточно). Поля: `session`, `profile`, `household`, `viewMode: 'personal' | 'household'`.
  - В шапке — переключатель с двумя пунктами. Сохранять выбор в `localStorage`.
  - Заглушки страниц `/` (дашборд), `/operations`, `/settings` — пока пустые экраны с заголовком «<viewMode> · <household.name>», но уже под guard'ом и с переключателем.

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
