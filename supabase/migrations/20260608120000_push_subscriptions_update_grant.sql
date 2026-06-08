-- =============================================================================
-- Migration: фикс — UPDATE-грант и UPDATE-политика для push_subscriptions
-- =============================================================================
-- БАГ (скрытый с 20260530600000_push_subscriptions.sql): клиент подписки на пуш
-- (`usePush.enable()` → `supabase.from('push_subscriptions').upsert(...)`)
-- использует UPSERT, который PostgREST разворачивает в
-- `INSERT ... ON CONFLICT (profile_id, endpoint) DO UPDATE`. Ветке DO UPDATE
-- нужна привилегия UPDATE на таблицу И отдельная RLS-политика на UPDATE.
-- В исходной миграции выдан только `grant select, insert, delete` и заведены
-- политики лишь на select/insert/delete — UPDATE не покрыт. Итог: любой вызов
-- upsert падал с `permission denied for table push_subscriptions` (SQLSTATE
-- 42501), подписка не создавалась НИКОГДА (в push_subscriptions было 0 строк
-- у всех профилей). Обнаружено при первой реальной проверке web-push на iPhone
-- (Фаза 8 задачника): на устройстве плашка «permission denied for table
-- push_subscriptions (42501)».
--
-- ПОЧЕМУ UPDATE, а не переход на DO NOTHING: upsert здесь намеренный — при
-- переподписке того же endpoint'а ключи (p256dh/auth) и user_agent должны
-- ОБНОВЛЯТЬСЯ (иначе send-push будет слать на устаревшие ключи). DO NOTHING
-- это поведение потерял бы. Поэтому чиним привилегию, а не семантику.
--
-- Идемпотентно: grant повторно — no-op; политику создаём только если её нет.
-- Проверено на prod в транзакции с откатом: после грант+политики upsert
-- вставляет новую подписку и обновляет ключи при конфликте по endpoint.
-- =============================================================================

grant update on public.push_subscriptions to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.push_subscriptions'::regclass
      and polname = 'push_subscriptions: own update'
  ) then
    create policy "push_subscriptions: own update"
      on public.push_subscriptions
      for update
      using (profile_id = auth.uid())
      with check (profile_id = auth.uid());
  end if;
end $$;
