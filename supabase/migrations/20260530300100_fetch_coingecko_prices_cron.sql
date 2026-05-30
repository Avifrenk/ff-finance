-- =============================================================================
-- Migration: pg_cron для Edge Function fetch-coingecko-prices (Фаза 5.2)
-- =============================================================================
-- Раз в час (в :05) дёргаем Edge Function fetch-coingecko-prices через
-- pg_net.http_post. Функция тянет цены из CoinGecko Simple Price API в
-- ILS/USD/EUR и апсёртит в crypto_prices.
--
-- :05 (а не :00) — чтобы не толкаться с другими крон-задачами, идущими
-- в начале часа. fetch_ecb_rates_daily на 06:00 UTC, поэтому конфликта
-- по нагрузке нет, но всё равно отступ.
--
-- Функция деплоится с verify_jwt=false (см. фазу деплоя в плане),
-- поэтому Authorization-заголовок не нужен.
-- =============================================================================

create extension if not exists pg_net;

-- Идемпотентность повторного применения.
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'fetch_coingecko_prices_hourly';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'fetch_coingecko_prices_hourly',
  '5 * * * *',
  $$select net.http_post(
      url := 'https://cngrrvfqwaqfydmfhiex.supabase.co/functions/v1/fetch-coingecko-prices',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );$$
);
