// =============================================================================
// Edge Function: fetch-ecb-rates (Фаза 2.10.2)
// =============================================================================
// Раз в день тянет XML с курсами ECB (eurofxref-daily.xml), парсит, апсёртит в
// public.fx_rates. Для каждой валюты пишет обе стороны:
//   * (EUR → X, rate)
//   * (X → EUR, 1/rate)
// чтобы lookup в любую сторону был O(1).
//
// Какие валюты нужны нам — берём из public.currencies (5 валют seed). Те, что
// ECB не публикует (например, RUB после 2022), просто пропускаем без ошибки.
//
// Под service_role-ключом — поэтому INSERT в fx_rates проходит даже без
// INSERT-политики (service_role обходит RLS).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

type Parsed = {
  asOf: string;
  rates: Map<string, number>;
};

function parseEcbXml(xml: string): Parsed {
  const timeMatch = xml.match(/<Cube\s+time='([\d-]+)'>/);
  if (!timeMatch) {
    throw new Error("ECB XML: <Cube time='...'> not found");
  }
  const asOf = timeMatch[1];

  const rates = new Map<string, number>();
  const re = /<Cube\s+currency='([A-Z]{3})'\s+rate='([\d.]+)'\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const code = m[1];
    const rate = Number.parseFloat(m[2]);
    if (Number.isFinite(rate) && rate > 0) {
      rates.set(code, rate);
    }
  }

  return { asOf, rates };
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

  // 1) Список нужных нам валют — из справочника.
  const { data: currencyRows, error: curErr } = await supabase
    .from("currencies")
    .select("code");
  if (curErr) {
    return new Response(
      JSON.stringify({ error: `currencies select: ${curErr.message}` }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  const wanted = new Set<string>(currencyRows.map((r: { code: string }) => r.code));
  wanted.delete("EUR"); // EUR — база, для (EUR → EUR) запись не нужна.

  // 2) Тянем ECB XML.
  const resp = await fetch(ECB_URL, { headers: { "user-agent": "ffq-fetch-ecb-rates/1.0" } });
  if (!resp.ok) {
    return new Response(
      JSON.stringify({ error: `ECB fetch: HTTP ${resp.status}` }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
  const xml = await resp.text();
  const parsed = parseEcbXml(xml);

  // 3) Строим строки для апсерта.
  type Row = {
    base_code: string;
    quote_code: string;
    rate: number;
    as_of: string;
    source: string;
  };
  const rows: Row[] = [];
  const skipped: string[] = [];

  for (const code of wanted) {
    const rate = parsed.rates.get(code);
    if (rate === undefined) {
      skipped.push(code);
      continue;
    }
    rows.push({ base_code: "EUR", quote_code: code, rate, as_of: parsed.asOf, source: "ECB" });
    rows.push({ base_code: code, quote_code: "EUR", rate: 1 / rate, as_of: parsed.asOf, source: "ECB" });
  }

  if (rows.length === 0) {
    return new Response(
      JSON.stringify({ as_of: parsed.asOf, inserted: 0, skipped, warning: "no matching currencies" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  // 4) Апсёрт по PK (base_code, quote_code, as_of).
  const { error: upErr } = await supabase
    .from("fx_rates")
    .upsert(rows, { onConflict: "base_code,quote_code,as_of" });
  if (upErr) {
    return new Response(
      JSON.stringify({ error: `fx_rates upsert: ${upErr.message}`, as_of: parsed.asOf }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      as_of: parsed.asOf,
      inserted: rows.length,
      currencies: [...wanted].filter((c) => parsed.rates.has(c)),
      skipped,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
});
