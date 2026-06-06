// =============================================================================
// Edge Function: add-coin
// =============================================================================
// Добавляет новую монету в справочник public.cryptocurrencies на основе
// CoinGecko-данных. Используется, когда пользователь хочет добавить
// холдинг с монетой, которой нет в сидовом списке (BTC/ETH/SOL/USDT/USDC).
//
// Контракт:
//   POST { coingecko_id: string }
//   Заголовки: Authorization: Bearer <user JWT>
//   Ответ: { coin_id: string, created: boolean, coin: {...} }
//
// Алгоритм:
//   1. JWT-аутентификация.
//   2. Проверяем, нет ли уже монеты с таким coingecko_id (быстрый возврат).
//   3. Запрашиваем CoinGecko /coins/{id} (минимальные поля).
//   4. Определяем decimals: для ERC-20 берём из detail_platforms.ethereum.
//      Для остальных — дефолт по символу (BTC=8, SOL=9, USDT/USDC=6,
//      иначе 8).
//   5. Upsert по coingecko_id под service_role.
//
// RLS:
//   public.cryptocurrencies — у authenticated только SELECT, INSERT идёт
//   через service_role внутри этой функции.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY не выставлены");
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SYMBOL_DECIMALS_DEFAULTS: Record<string, number> = {
  BTC: 8,
  ETH: 18,
  SOL: 9,
  USDT: 6,
  USDC: 6,
  BNB: 18,
  MATIC: 18,
  ARB: 18,
  OP: 18,
  AVAX: 18,
  DOT: 10,
  ADA: 6,
  XRP: 6,
  TRX: 6,
  TON: 9,
  DOGE: 8,
  LTC: 8,
};

interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
  image?: { thumb?: string; small?: string; large?: string };
  detail_platforms?: Record<string, { decimal_place: number | null } | undefined>;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  // JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing Authorization header" }, 401);
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  const userClient = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "invalid JWT" }, 401);

  // Body
  let body: { coingecko_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const coingeckoId = (body.coingecko_id ?? "").trim().toLowerCase();
  if (!coingeckoId || !/^[a-z0-9][a-z0-9._-]{0,80}$/.test(coingeckoId)) {
    return json({ error: "coingecko_id обязателен (только латиница, цифры, _.-)" }, 400);
  }

  // 1. Уже есть?
  const { data: existing, error: existingErr } = await adminClient
    .from("cryptocurrencies")
    .select("id, symbol, coingecko_id, name, decimals, icon, is_active")
    .eq("coingecko_id", coingeckoId)
    .maybeSingle();

  if (existingErr) return json({ error: `lookup: ${existingErr.message}` }, 500);
  if (existing) {
    return json({ coin_id: existing.id, created: false, coin: existing });
  }

  // 2. Тянем из CoinGecko
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coingeckoId)}` +
    `?localization=false&tickers=false&market_data=false&community_data=false` +
    `&developer_data=false&sparkline=false`;

  let cg: CoinGeckoCoin;
  try {
    const resp = await fetch(url, {
      headers: { "user-agent": "ffq-add-coin/1.0" },
    });
    if (resp.status === 404) {
      return json({ error: `Монета '${coingeckoId}' не найдена в CoinGecko` }, 404);
    }
    if (resp.status === 429) {
      return json({ error: "CoinGecko rate limit, попробуй через минуту" }, 429);
    }
    if (!resp.ok) {
      return json({ error: `CoinGecko: HTTP ${resp.status}` }, 502);
    }
    cg = (await resp.json()) as CoinGeckoCoin;
  } catch (e) {
    return json({ error: `CoinGecko fetch: ${(e as Error).message}` }, 502);
  }

  const symbol = (cg.symbol ?? "").toUpperCase().trim();
  if (!symbol) return json({ error: "CoinGecko вернул пустой symbol" }, 502);

  // 3. Decimals
  const ethDecimals = cg.detail_platforms?.ethereum?.decimal_place;
  const decimals = clampDecimals(
    ethDecimals ?? SYMBOL_DECIMALS_DEFAULTS[symbol] ?? 8,
  );

  // 4. icon — URL картинки из CoinGecko (small ≈ 32px)
  const icon = cg.image?.small ?? cg.image?.thumb ?? null;

  const name = (cg.name ?? symbol).slice(0, 80);

  // 5. Insert. Возможен race с UNIQUE(symbol) — обрабатываем.
  const { data: inserted, error: insErr } = await adminClient
    .from("cryptocurrencies")
    .insert({
      symbol,
      coingecko_id: coingeckoId,
      name,
      decimals,
      icon,
      is_active: true,
    })
    .select("id, symbol, coingecko_id, name, decimals, icon, is_active")
    .single();

  if (insErr) {
    // Уникальное нарушение по symbol → юзеру нужно сначала удалить старую
    // запись или это коллизия двух разных coingecko_id с одним тикером.
    if ((insErr as { code?: string }).code === "23505") {
      // Попробуем вернуть существующую с этим symbol — может, это та же монета
      const { data: bySymbol } = await adminClient
        .from("cryptocurrencies")
        .select("id, symbol, coingecko_id, name, decimals, icon, is_active")
        .eq("symbol", symbol)
        .maybeSingle();
      if (bySymbol) {
        return json({
          error: `Тикер ${symbol} уже занят монетой '${bySymbol.coingecko_id}'. Если это другая монета — переименуй вручную.`,
        }, 409);
      }
    }
    return json({ error: `insert: ${insErr.message}` }, 500);
  }

  return json({ coin_id: inserted.id, created: true, coin: inserted }, 201);
});

function clampDecimals(n: number): number {
  if (!Number.isFinite(n)) return 8;
  return Math.max(0, Math.min(18, Math.round(n)));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
