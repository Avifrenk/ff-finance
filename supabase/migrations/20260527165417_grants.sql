-- =============================================================================
-- Migration: grants
-- =============================================================================
-- При создании проекта мы выключили "Automatically expose new tables", то есть
-- Supabase НЕ выдаёт привилегии Data-API ролям (anon, authenticated, service_role)
-- автоматически. Без GRANT-ов любая RLS-политика бесполезна — Postgres сначала
-- проверяет привилегии и только потом RLS.
--
-- Здесь явно выдаём `authenticated` минимально необходимые права на наши
-- таблицы. `anon` ничего не получает — приложение всегда работает под
-- авторизованным юзером.
-- =============================================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles         to authenticated;
grant select, insert, update, delete on public.households       to authenticated;
grant select, insert, update, delete on public.household_members to authenticated;
grant select, insert, update, delete on public.household_invites to authenticated;

-- Функции были созданы с явным `grant execute ... to authenticated`,
-- но повторим на случай если кто-то перезапускает миграции вразнобой.
grant execute on function public.current_household_id()           to authenticated;
grant execute on function public.accept_invite(text)              to authenticated;
