// =============================================================================
// Edge Function: ai-parse-receipt (Фаза 6.1)
// =============================================================================
// Парсит фото чека через Claude Vision (Sonnet 4.6).
//
// Контракт:
//   Запрос:  POST { scan_id: uuid }
//   Заголовки: Authorization: Bearer <user JWT>
//
// Алгоритм:
//   1. Идентифицируем пользователя через JWT.
//   2. Читаем row из ai_receipt_scans (RLS-aware клиентом юзера → 404 если чужой).
//   3. Под service_role:
//      a. Скачиваем фото из bucket receipts/.
//      b. Вызываем Claude Sonnet 4.6 с image + structured output (JSON schema).
//      c. Записываем parsed_json, tokens, cost_usd, status='parsed' в row.
//   4. Возвращаем parsed_json + scan_id клиенту.
//
// Schema на выходе Claude:
//   { vendor, date (YYYY-MM-DD|null), currency (ILS/USD/EUR/...), total,
//     items: [{ name, quantity, price, category_hint }] }
//
// Secrets (через `supabase secrets set`):
//   ANTHROPIC_API_KEY — sk-ant-api03-...
//   SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY выставляются автоматически.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.88.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY не выставлены");
}
if (!ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY не выставлен — задайте через supabase secrets set");
}

const MODEL = "claude-sonnet-4-6";
// Цены Sonnet 4.6 на 2026-05: $3/M input, $15/M output.
const PRICE_INPUT_PER_TOKEN = 3 / 1_000_000;
const PRICE_OUTPUT_PER_TOKEN = 15 / 1_000_000;

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// JSON schema, по которой Claude обязан вернуть ответ.
// additionalProperties: false требуется structured outputs.
const RECEIPT_SCHEMA = {
  type: "object",
  properties: {
    vendor: { type: "string", description: "Название магазина/заведения на чеке" },
    date: {
      type: ["string", "null"],
      description: "Дата чека в формате YYYY-MM-DD, или null если нечитаемо",
    },
    currency: {
      type: "string",
      enum: ["ILS", "USD", "EUR", "RUB", "GBP"],
      description: "Валюта чека. ILS если не указана явно (мы в Израиле).",
    },
    total: {
      type: "number",
      description: "Итоговая сумма к оплате (положительное число)",
    },
    items: {
      type: "array",
      description: "Позиции чека (если читаются)",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Название позиции на чеке" },
          quantity: { type: "number", description: "Количество (1 если не указано)" },
          price: { type: "number", description: "Цена за единицу или итоговая по позиции" },
          category_hint: {
            type: "string",
            description: "Подсказка категории на русском: 'Продукты', 'Кафе', 'Транспорт', 'Аптека', 'Прочее'",
          },
        },
        required: ["name", "quantity", "price", "category_hint"],
        additionalProperties: false,
      },
    },
  },
  required: ["vendor", "date", "currency", "total", "items"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `Ты помощник для семейного финтрекера в Израиле. На входе — фото чека (на русском, иврите или английском). Извлеки данные и верни JSON по схеме.

Правила:
- Все числа — положительные.
- Если валюта не указана явно — ILS (мы в Израиле).
- Дата — в формате YYYY-MM-DD. Если на чеке нет даты или нечитаемо — null.
- category_hint выбирай из ограниченного списка: Продукты, Кафе, Транспорт, Аптека, Развлечения, Одежда, Прочее.
- Если позиции не читаются вообще (мятый чек) — items: [], но total и vendor попробуй вытащить.`;

interface ScanRow {
  id: string;
  household_id: string;
  author_profile_id: string;
  storage_path: string;
  status: string;
}

Deno.serve(async (req) => {
  const startedAt = Date.now();

  // 1. Аутентификация юзера
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "missing Authorization header" }, 401);
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  const userClient = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json({ error: "invalid JWT" }, 401);
  }
  const userId = userData.user.id;

  // 2. Парсим тело запроса
  let body: { scan_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const scanId = body.scan_id;
  if (!scanId || typeof scanId !== "string") {
    return json({ error: "scan_id required" }, 400);
  }

  // 3. Берём row через клиент юзера (RLS проверит что row его)
  const { data: scan, error: scanErr } = await userClient
    .from("ai_receipt_scans")
    .select("id, household_id, author_profile_id, storage_path, status")
    .eq("id", scanId)
    .maybeSingle<ScanRow>();

  if (scanErr) {
    return json({ error: `scan.select: ${scanErr.message}` }, 500);
  }
  if (!scan) {
    return json({ error: "scan not found or not yours" }, 404);
  }
  if (scan.author_profile_id !== userId) {
    return json({ error: "scan does not belong to you" }, 403);
  }
  if (scan.status !== "pending" && scan.status !== "failed") {
    return json({ error: `scan already processed (status=${scan.status})` }, 409);
  }

  // 4. Скачиваем фото из Storage под service_role
  const { data: fileBlob, error: dlErr } = await adminClient.storage
    .from("receipts")
    .download(scan.storage_path);

  if (dlErr || !fileBlob) {
    await markFailed(scan.id, `storage download: ${dlErr?.message ?? "no blob"}`);
    return json({ error: `storage download: ${dlErr?.message ?? "no blob"}` }, 500);
  }

  const arrayBuffer = await fileBlob.arrayBuffer();
  const base64 = bufferToBase64(arrayBuffer);
  const mediaType = inferMediaType(scan.storage_path, fileBlob.type);

  // 5. Вызываем Claude Vision
  let claudeResponse;
  try {
    claudeResponse = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: RECEIPT_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: "Распарсь этот чек по схеме.",
            },
          ],
        },
      ],
    } as Parameters<typeof anthropic.messages.create>[0]);
  } catch (e) {
    const msg = (e as Error).message ?? "unknown";
    await markFailed(scan.id, `claude api: ${msg}`);
    return json({ error: `claude api: ${msg}` }, 502);
  }

  // 6. Парсим ответ
  const textBlock = claudeResponse.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    await markFailed(scan.id, "claude returned no text block");
    return json({ error: "claude returned no text block" }, 502);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(textBlock.text);
  } catch (e) {
    await markFailed(scan.id, `claude returned invalid JSON: ${(e as Error).message}`);
    return json({ error: `claude returned invalid JSON` }, 502);
  }

  // 7. Считаем стоимость
  const tokensIn = claudeResponse.usage.input_tokens ?? 0;
  const tokensOut = claudeResponse.usage.output_tokens ?? 0;
  const costUsd =
    tokensIn * PRICE_INPUT_PER_TOKEN + tokensOut * PRICE_OUTPUT_PER_TOKEN;

  // 8. Записываем результат
  const { error: updErr } = await adminClient
    .from("ai_receipt_scans")
    .update({
      status: "parsed",
      parsed_json: parsedJson,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: Number(costUsd.toFixed(4)),
      error_message: null,
    })
    .eq("id", scan.id);

  if (updErr) {
    return json({ error: `scan.update: ${updErr.message}` }, 500);
  }

  return json({
    ok: true,
    scan_id: scan.id,
    parsed: parsedJson,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: Number(costUsd.toFixed(4)),
    ms: Date.now() - startedAt,
  });
});

async function markFailed(scanId: string, msg: string): Promise<void> {
  await adminClient
    .from("ai_receipt_scans")
    .update({ status: "failed", error_message: msg })
    .eq("id", scanId);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)),
    );
  }
  return btoa(binary);
}

function inferMediaType(path: string, fallback: string): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  // HEIC/HEIF — Anthropic не поддерживает; конвертация на клиенте (canvas → jpeg).
  // Если до сюда дошёл HEIC — это бага клиента.
  if (fallback === "image/png") return "image/png";
  if (fallback === "image/webp") return "image/webp";
  return "image/jpeg";
}
