// =============================================================================
// Edge Function: fetch-coingecko-prices (Фаза 5.2)
// =============================================================================
// Раз в час тянет цены из CoinGecko Simple Price API для всех активных монет
// из public.cryptocurrencies в трёх валютах: ILS, USD, EUR. Апсёртит в
// public.crypto_prices по ключу (coin_id, quote_code, as_of), где as_of —
// текущий час с обнулёнными минутами/секундами в UTC. За счёт этого
// повторный вызов внутри одного часа не плодит дубли.
//
// Под service_role-ключом — INSERT в crypto_prices без RLS-проблем (для
// authenticated INSERT-политики нет, что блокирует пользователей от подмены
// цен). Образец полностью повторяет fetch-ecb-rates.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";
const QUOTE_CODES = ["ILS", "USD", "EUR"] as const;

type CoinRow = { id: string; coingecko_id: string };
type CgResponse = Record<string, Record<string, number>>;

function startOfHourUtc(d: Date): string {
  const x = new Date(d);
  x.setUTCMinutes(0, 0, 0);
  return x.toISOString();
}

Deno.serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: "missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 1) Список активных монет: id (внутренний) + coingecko_id (для API).
  const { data: coins, error: coinsErr } = await supabase
    .from("cryptocurrencies")
    .select("id, coingecko_id")
    .eq("is_active", true);
  if (coinsErr) {
    return new Response(
      JSON.stringify({ error: `cryptocurrencies select: ${coinsErr.message}` }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  const coinList: CoinRow[] = coins ?? [];
  if (coinList.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, inserted: 0, warning: "no active coins" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  // 2) Тянем CoinGecko Simple Price API.
  const ids = coinList.map((c) => c.coingecko_id).join(",");
  const vs = QUOTE_CODES.map((c) => c.toLowerCase()).join(",");
  const url = `${COINGECKO_URL}?ids=${encodeURIComponent(ids)}&vs_currencies=${vs}`;

  const resp = await fetch(url, { headers: { "user-agent": "ffq-fetch-coingecko-prices/1.0" } });
  if (resp.status === 429) {
    return new Response(
      JSON.stringify({ error: "CoinGecko rate limit (429)" }),
      { status: 429, headers: { "content-type": "application/json" } },
    );
  }
  if (!resp.ok) {
    return new Response(
      JSON.stringify({ error: `CoinGecko fetch: HTTP ${resp.status}` }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
  let parsed: CgResponse;
  try {
    parsed = (await resp.json()) as CgResponse;
  } catch (e) {
    return new Response(
      JSON.stringify({ error: `CoinGecko parse: ${(e as Error).message}` }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  // 3) Сворачиваем в строки для апсёрта.
  const asOf = startOfHourUtc(new Date());
  type Row = {
    coin_id: string;
    quote_code: string;
    price: number;
    as_of: string;
    source: string;
  };
  const rows: Row[] = [];
  const skipped: string[] = [];

  for (const coin of coinList) {
    const block = parsed[coin.coingecko_id];
    if (!block) {
      skipped.push(coin.coingecko_id);
      continue;
    }
    for (const code of QUOTE_CODES) {
      const price = block[code.toLowerCase()];
      if (typeof price === "number" && Number.isFinite(price) && price > 0) {
        rows.push({
          coin_id: coin.id,
          quote_code: code,
          price,
          as_of: asOf,
          source: "coingecko",
        });
      }
    }
  }

  if (rows.length === 0) {
    return new Response(
      JSON.stringify({ as_of: asOf, inserted: 0, skipped, warning: "no prices parsed" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  // 4) Апсёрт по (coin_id, quote_code, as_of).
  const { error: upErr } = await supabase
    .from("crypto_prices")
    .upsert(rows, { onConflict: "coin_id,quote_code,as_of" });
  if (upErr) {
    return new Response(
      JSON.stringify({ error: `crypto_prices upsert: ${upErr.message}`, as_of: asOf }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      as_of: asOf,
      inserted: rows.length,
      coins: coinList.length,
      skipped,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
});
