-- =============================================================================
-- Migration: расписание для Edge Function fetch-ecb-rates
-- =============================================================================
-- CLI-команды `supabase functions schedule` нет — расписание создаём через
-- pg_cron + pg_net.http_post, аналогично tick_schedules_daily (Фаза 2.9).
--
-- Job дёргает URL Edge Function без auth-заголовков (функция задеплоена с
-- verify_jwt=false). Функция сама достаёт SUPABASE_SERVICE_ROLE_KEY из своего
-- runtime-окружения и пишет fx_rates под service_role.
--
-- ECB публикует курсы около 16:00 CET по будням. Берём 06:00 UTC следующего
-- дня — стабильно после публикации, без коллизий с другими крон-задачами.
-- =============================================================================

create extension if not exists pg_net;

-- Снимаем старый job на случай повторного применения миграции.
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'fetch_ecb_rates_daily';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'fetch_ecb_rates_daily',
  '0 6 * * *',
  $$select net.http_post(
      url := 'https://cngrrvfqwaqfydmfhiex.supabase.co/functions/v1/fetch-ecb-rates',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );$$
);
