-- =============================================================================
-- Migration: service_role GRANT-ы на currencies / fx_rates
-- =============================================================================
-- В этом проекте "Automatically expose new tables" выключено, а default
-- privileges для service_role не настроены. Поэтому новые таблицы видны
-- только тем ролям, которым явно выдан GRANT.
--
-- Edge Function fetch-ecb-rates работает под service_role-ключом и должна:
--   * читать справочник currencies (чтобы знать какие валюты тянуть);
--   * писать (upsert) в fx_rates.
-- Без этих GRANT-ов supabase-js падает с "permission denied for table".
--
-- RLS у этих таблиц настроен так, что INSERT/UPDATE-политик нет — для
-- authenticated это эффективный read-only. service_role обходит RLS, поэтому
-- ему GRANT-ов достаточно.
-- =============================================================================

grant select               on public.currencies to service_role;
grant select, insert, update, delete on public.fx_rates to service_role;
