-- =============================================================================
-- Migration: pg_cron для Edge Function send-push (Фаза 8.4.7)
-- =============================================================================
-- Каждые 5 минут дёргаем send-push через pg_net.http_post. Функция
-- разгребает unsent из public.notification_queue и шлёт пуши.
--
-- 5 минут — компромисс: меньше = больше нагрузки cron на free-tier,
-- больше = жена увидит уведомление с большой задержкой. Если станет
-- мало — снизим до 2 минут.
--
-- Функция деплоится с verify_jwt=false, поэтому Authorization не нужен.
-- =============================================================================

create extension if not exists pg_net;

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'send_push_every_5min';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'send_push_every_5min',
  '*/5 * * * *',
  $$select net.http_post(
      url := 'https://cngrrvfqwaqfydmfhiex.supabase.co/functions/v1/send-push',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );$$
);
