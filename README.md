# Frenkel Family Finance

Семейный финтрекер для пары: личные кабинеты и общий бюджет, мультивалютность (включая шекели и крипту), AI-фичи (фото чека, голос, ассистент).

## Стек

- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS v4** (через `@tailwindcss/vite`)
- **PWA** (`vite-plugin-pwa`) — устанавливается с браузера как приложение
- **Supabase** — БД (Postgres), авторизация, realtime, хранилище файлов
- **Claude API** — фото чека, голос, AI-ассистент
- **CoinGecko API** — цены крипты

## Запуск локально

```bash
# 1. Установить зависимости
npm install

# 2. Скопировать env и заполнить ключами Supabase
cp .env.example .env.local
# отредактируй .env.local

# 3. Запустить dev-сервер
npm run dev
```

## Скрипты

- `npm run dev` — dev-сервер (Vite, HMR)
- `npm run build` — production-сборка (`prebuild` сначала генерит PWA-иконки)
- `npm run preview` — preview прод-сборки локально
- `npm run lint` — ESLint
- `npm run pwa:icons` — пересобрать PNG-иконки из шаблона `scripts/gen-pwa-icons.mjs`
- `npm run db:push` — накатить миграции из `supabase/migrations/` на prod-БД
- `npm run db:backup` — снять gzip-дамп БД в `~/Backups/ff-finance/YYYY-MM-DD-HHMM.sql.gz`

## Бэкап и восстановление БД

**Автоматический (Supabase free tier).** Supabase каждый день делает полный snapshot. Retention — 7 дней. Посмотреть и восстановить: Supabase Dashboard → Database → Backups → выбрать snapshot → Restore. Point-in-time recovery на free-тарифе недоступен, только rollback на день целиком.

**Ручной (recommended раз в месяц).** Запускаем:

```bash
npm run db:backup
```

Скрипт читает connection-URL так же, как `db:push` (из `~/.config/ff-finance/connection`), вызывает `pg_dump --schema=public --schema=auth --no-owner --no-acl`, gzip'ит вывод и кладёт в `~/Backups/ff-finance/YYYY-MM-DD-HHMM.sql.gz`. Требует установленный локально `pg_dump` (входит в `postgresql` brew-формулу).

Восстановление из ручного дампа в случае катастрофы — `gunzip -c file.sql.gz | psql <new-connection-url>`.

## Документация

См. [ROADMAP.md](./ROADMAP.md) — текущие решения, фазы разработки, открытые вопросы.

## Лицензия

Приватный пет-проект. Не для распространения.
