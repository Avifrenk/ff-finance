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
- `npm run build` — production-сборка
- `npm run preview` — preview прод-сборки локально
- `npm run lint` — ESLint

## Документация

См. [ROADMAP.md](./ROADMAP.md) — текущие решения, фазы разработки, открытые вопросы.

## Лицензия

Приватный пет-проект. Не для распространения.
