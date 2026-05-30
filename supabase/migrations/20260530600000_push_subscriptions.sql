-- =============================================================================
-- Migration: push_subscriptions + notification_queue (Фаза 8.4.2)
-- =============================================================================
-- Web Push:
--   1. push_subscriptions — браузерные subscription'ы пользователей
--      (endpoint + p256dh + auth). Один профиль может иметь несколько
--      endpoint'ов (телефон + ноутбук жены и т.п.).
--   2. notification_queue — отложенные пуши. SQL-триггеры (см. отдельную
--      миграцию 20260530600100_notification_triggers.sql) добавляют сюда
--      строки на интересные события (бюджет превышен, цель достигнута,
--      settlement от партнёра). Edge Function send-push раз в 5 минут
--      забирает unsent и шлёт пуши, помечает sent_at.
--
-- RLS:
--   - push_subscriptions: пользователь видит и пишет ТОЛЬКО свои.
--     service_role (Edge Function) — только select/delete (delete для
--     410 Gone — мусорные endpoint'ы).
--   - notification_queue: пользователь видит только свои строки (история
--     уведомлений). Insert делает service_role через SQL-триггеры под
--     definer-функцией. Update sent_at — service_role.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. push_subscriptions
-- -----------------------------------------------------------------------------
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  unique (profile_id, endpoint)
);

create index push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: own select"
  on public.push_subscriptions
  for select
  using (profile_id = auth.uid());

create policy "push_subscriptions: own insert"
  on public.push_subscriptions
  for insert
  with check (profile_id = auth.uid());

create policy "push_subscriptions: own delete"
  on public.push_subscriptions
  for delete
  using (profile_id = auth.uid());

grant select, insert, delete on public.push_subscriptions to authenticated;
grant select, delete on public.push_subscriptions to service_role;


-- -----------------------------------------------------------------------------
-- 2. notification_queue
-- -----------------------------------------------------------------------------
create table public.notification_queue (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  body        text not null,
  url         text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

-- Partial index: send-push быстро находит unsent.
create index notification_queue_unsent_idx
  on public.notification_queue (created_at)
  where sent_at is null;

create index notification_queue_profile_idx
  on public.notification_queue (profile_id, created_at desc);

alter table public.notification_queue enable row level security;

create policy "notification_queue: own select"
  on public.notification_queue
  for select
  using (profile_id = auth.uid());

grant select on public.notification_queue to authenticated;
grant select, update on public.notification_queue to service_role;
-- Insert делает service_role через SQL-триггеры (security definer);
-- пользователи в очередь не пишут напрямую.
