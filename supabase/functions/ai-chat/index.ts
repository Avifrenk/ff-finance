// =============================================================================
// Edge Function: ai-chat (Фаза 6.3)
// =============================================================================
// AI-ассистент по семейным финансам (Claude Sonnet 4.6).
//
// Контракт:
//   Запрос:  POST { user_message: string }
//   Заголовки: Authorization: Bearer <user JWT>
//   Ответ:  text/event-stream (SSE)
//     events:
//       { "type":"chunk", "delta":"..." }      — кусок ответа модели
//       { "type":"tool",  "name":"sum_by_category" }
//                                              — UI индикация "думаю"
//       { "type":"done",  "message_id": "...",
//                          "tokens_in": N,
//                          "tokens_out": N }
//       { "type":"error", "message": "..." }
//
// Алгоритм:
//   1. Идентифицируем юзера через JWT.
//   2. Проверяем лимит 50 user-сообщений за сутки.
//   3. Берём активный household (из current_household_id() = household_members.
//      single row, у нас один household на юзера).
//   4. Под service_role собираем контекст: операции за 30 дней, активные
//      бюджеты текущего месяца, незаархивированные цели, балансы счетов.
//   5. Записываем user-сообщение в ai_chat_messages.
//   6. Собираем историю чата (последние 20 сообщений).
//   7. Зовём Claude в цикле:
//        a. Если tool_use — выполняем tool на Postgres, возвращаем tool_result.
//        b. Если end_turn — стримим финальные text-блоки клиенту.
//   8. Записываем assistant-сообщение в ai_chat_messages.
//
// Prompt caching:
//   system — массив из двух блоков. Второй (с контекстом) помечен
//   cache_control: ephemeral → на повторных вопросах в течение 5 мин
//   юзер платит только за свой новый user_message + ответ.
//
// Secrets:
//   ANTHROPIC_API_KEY — тот же, что в ai-parse-receipt.
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — авто.
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
// Цены Sonnet 4.6 на 2026-05: $3/M input, $15/M output. Кеш-чтение ~10%.
const PRICE_INPUT_PER_TOKEN = 3 / 1_000_000;
const PRICE_OUTPUT_PER_TOKEN = 15 / 1_000_000;

const DAILY_USER_MESSAGE_LIMIT = 50;
const HISTORY_TURNS_LIMIT = 20;       // последние N сообщений (user+assistant) в контексте
const OPERATIONS_DAYS_WINDOW = 30;    // последние N дней операций в system
const OPERATIONS_HARD_CAP = 200;      // не больше N строк операций в system

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});


// -----------------------------------------------------------------------------
// Tools — выполняются на нашей стороне (Postgres) и возвращаются модели.
// -----------------------------------------------------------------------------
const TOOLS = [
  {
    name: "sum_by_category",
    description:
      "Суммирует операции по категориям за указанный месяц. " +
      "Возвращает массив { category_name, total, currency } " +
      "в базовой валюте household.",
    input_schema: {
      type: "object",
      properties: {
        month: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}$",
          description: "Месяц в формате YYYY-MM (например '2026-05').",
        },
        kind: {
          type: "string",
          enum: ["expense", "income"],
          description: "Тип операций: 'expense' (траты) или 'income' (доходы).",
        },
      },
      required: ["month", "kind"],
    },
  },
  {
    name: "get_balance",
    description:
      "Возвращает текущий баланс счёта (initial_balance + сумма доходов − сумма " +
      "расходов в валюте счёта). Если account_id не указан — вернёт балансы " +
      "всех видимых счетов.",
    input_schema: {
      type: "object",
      properties: {
        account_id: {
          type: ["string", "null"],
          description: "UUID счёта. Если не указано — все счета.",
        },
      },
      required: [],
    },
  },
  {
    name: "compare_months",
    description:
      "Сравнивает два месяца: для каждого считает сумму доходов, сумму расходов " +
      "и net (income − expense) в базовой валюте household.",
    input_schema: {
      type: "object",
      properties: {
        month_a: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}$",
          description: "Первый месяц YYYY-MM.",
        },
        month_b: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}$",
          description: "Второй месяц YYYY-MM.",
        },
      },
      required: ["month_a", "month_b"],
    },
  },
] as const;


// -----------------------------------------------------------------------------
// Системный промпт — статическая часть. Меняется редко → cache hit ~100%.
// -----------------------------------------------------------------------------
const SYSTEM_BASE = `Ты — Финик, AI-ассистент в семейном финтрекере Frenkel Family Finance.

Семья живёт в Израиле, базовая валюта по умолчанию — ILS (шекели).
Пользователь общается с тобой на русском (иногда вкраплениями иврита).
Отвечай ВСЕГДА на русском, тёплым человеческим тоном, без занудства и без жаргона.
Краткость > длинная вода. Если ответ можно дать одним числом и одним предложением — так и делай.

Что ты умеешь:
- Отвечать на вопросы вида «сколько потратили в апреле на еду?», «какой баланс на карте Hapoalim?», «сравни этот месяц с прошлым».
- Использовать tools (sum_by_category, get_balance, compare_months) когда нужны точные цифры по месяцам/категориям/счетам. Не выдумывай числа — если данных нет, вызови tool.
- Использовать данные из контекста (операции за 30 дней, бюджеты, цели, балансы) для быстрых ответов без tools.

Правила:
- Если для ответа нужен конкретный месяц, а пользователь сказал «в апреле» — преобразуй в YYYY-MM сам, используя текущую дату из контекста.
- Никогда не предлагай рекомендации в духе «вам нужно меньше тратить» без явного запроса.
- Никогда не показывай UUID счетов/категорий — пользуйся их именами.
- Если данных в контексте нет и tool тоже не помогает — честно скажи «не нашёл данных за этот период».
- Денежные числа форматируй как «1 234,50 ₪» (пробел как разделитель тысяч, запятая дробная).`;


interface ChatRequest {
  user_message?: string;
}

interface OpRow {
  id: string;
  occurred_at: string;
  kind: "expense" | "income";
  amount: number;
  category_id: string | null;
  account_id: string;
  is_private: boolean;
  note: string | null;
}

interface AccountRow {
  id: string;
  name: string;
  currency: string;
  visibility: "personal" | "shared";
  owner_profile_id: string;
  initial_balance: number;
}

interface CategoryRow {
  id: string;
  name: string;
  kind: "expense" | "income";
}

interface BudgetRow {
  id: string;
  category_id: string;
  month: string;
  amount: number;
}

interface GoalRow {
  id: string;
  name: string;
  target_amount: number;
  target_date: string | null;
  is_archived: boolean;
}

interface HouseholdContext {
  household_id: string;
  household_name: string;
  base_currency: string;
  today: string; // YYYY-MM-DD
  accounts: AccountRow[];
  categories: CategoryRow[];
  operations_30d: OpRow[];
  budgets_current_month: BudgetRow[];
  goals: GoalRow[];
  balances: { account_id: string; account_name: string; currency: string; balance: number }[];
  goal_progress: { goal_id: string; goal_name: string; contributed: number }[];
}


Deno.serve(async (req) => {
  // 1. JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonError("missing Authorization header", 401);
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  const userClient = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return jsonError("invalid JWT", 401);
  }
  const userId = userData.user.id;

  // 2. Body
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  const userMessage = (body.user_message ?? "").trim();
  if (!userMessage) {
    return jsonError("user_message required", 400);
  }
  if (userMessage.length > 4000) {
    return jsonError("user_message too long (max 4000 chars)", 400);
  }

  // 3. Daily limit
  const todayStartIso = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z")
    .toISOString();
  const { count: todayCount, error: cntErr } = await adminClient
    .from("ai_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", userId)
    .eq("role", "user")
    .gte("created_at", todayStartIso);

  if (cntErr) {
    return jsonError(`limit-check failed: ${cntErr.message}`, 500);
  }
  if ((todayCount ?? 0) >= DAILY_USER_MESSAGE_LIMIT) {
    return jsonError(
      `Лимит ${DAILY_USER_MESSAGE_LIMIT} сообщений в сутки исчерпан. Возвращайся завтра 🙂`,
      429,
    );
  }

  // 4. Household — берём первый, в котором юзер числится (у нас один на юзера).
  const { data: memberRows, error: memErr } = await adminClient
    .from("household_members")
    .select("household_id, households!inner(id, name, base_currency)")
    .eq("profile_id", userId)
    .limit(1);

  if (memErr) {
    return jsonError(`household lookup failed: ${memErr.message}`, 500);
  }
  if (!memberRows || memberRows.length === 0) {
    return jsonError("у тебя пока нет семьи — создай в онбординге", 400);
  }
  // deno-lint-ignore no-explicit-any
  const householdRow = (memberRows[0] as any).households;
  const householdId: string = householdRow.id;
  const householdName: string = householdRow.name;
  const baseCurrency: string = householdRow.base_currency;

  // 5. Контекст
  let ctx: HouseholdContext;
  try {
    ctx = await buildHouseholdContext(householdId, householdName, baseCurrency);
  } catch (e) {
    return jsonError(`context build failed: ${(e as Error).message}`, 500);
  }

  // 6. История чата + сохранение нового user-сообщения
  const { data: historyRows, error: histErr } = await adminClient
    .from("ai_chat_messages")
    .select("role, content")
    .eq("profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_TURNS_LIMIT);

  if (histErr) {
    return jsonError(`history fetch failed: ${histErr.message}`, 500);
  }
  const history = (historyRows ?? []).reverse() as { role: "user" | "assistant"; content: string }[];

  const { error: insUserErr } = await adminClient.from("ai_chat_messages").insert({
    profile_id: userId,
    household_id: householdId,
    role: "user",
    content: userMessage,
  });
  if (insUserErr) {
    return jsonError(`save user message failed: ${insUserErr.message}`, 500);
  }

  // 7. Готовим system + messages
  const system = [
    { type: "text" as const, text: SYSTEM_BASE },
    {
      type: "text" as const,
      text: buildContextBlock(ctx),
      cache_control: { type: "ephemeral" as const },
    },
  ];

  // deno-lint-ignore no-explicit-any
  const messages: any[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  // 8. SSE-стрим
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      let totalTokensIn = 0;
      let totalTokensOut = 0;
      let finalText = "";

      try {
        // Цикл: tool_use → tool_result → ... → end_turn (streaming)
        let safety = 0;
        while (safety++ < 6) {
          // На последнем известном раунде используем streaming.
          // Промежуточные раунды (с tool_use) — non-stream, проще распарсить.
          // Стратегия: всегда non-stream до first end_turn без tool_use.
          // Но финальный текст — стримим имитацией "по куску", чтобы UI ощущался живым.

          const response = await anthropic.messages.create({
            // deno-lint-ignore no-explicit-any
            model: MODEL,
            max_tokens: 2000,
            system,
            tools: TOOLS as unknown as Parameters<typeof anthropic.messages.create>[0]["tools"],
            thinking: { type: "enabled", budget_tokens: 2000 },
            messages,
            // deno-lint-ignore no-explicit-any
          } as any);

          totalTokensIn += response.usage?.input_tokens ?? 0;
          totalTokensOut += response.usage?.output_tokens ?? 0;

          // Собираем tool_use из ответа
          // deno-lint-ignore no-explicit-any
          const toolUses = response.content.filter((b: any) => b.type === "tool_use");
          // deno-lint-ignore no-explicit-any
          const textBlocks = response.content.filter((b: any) => b.type === "text");

          if (response.stop_reason === "tool_use" && toolUses.length > 0) {
            // Добавляем assistant-сообщение целиком в historic messages
            messages.push({ role: "assistant", content: response.content });

            // Выполняем все tools параллельно
            const toolResults = await Promise.all(
              // deno-lint-ignore no-explicit-any
              toolUses.map(async (tu: any) => {
                send({ type: "tool", name: tu.name });
                try {
                  const result = await runTool(tu.name, tu.input, ctx);
                  return {
                    type: "tool_result" as const,
                    tool_use_id: tu.id,
                    content: JSON.stringify(result),
                  };
                } catch (e) {
                  return {
                    type: "tool_result" as const,
                    tool_use_id: tu.id,
                    content: JSON.stringify({ error: (e as Error).message }),
                    is_error: true,
                  };
                }
              }),
            );

            messages.push({ role: "user", content: toolResults });
            continue; // следующий раунд
          }

          // end_turn (или иной stop) — финал. Стримим текстовые блоки клиенту.
          // deno-lint-ignore no-explicit-any
          for (const block of textBlocks as any[]) {
            const text: string = block.text ?? "";
            finalText += text;
            // Имитируем стрим: бьём на ~40-символьные куски для плавности.
            const chunkSize = 40;
            for (let i = 0; i < text.length; i += chunkSize) {
              send({ type: "chunk", delta: text.slice(i, i + chunkSize) });
            }
          }
          break;
        }

        if (safety >= 6) {
          send({ type: "error", message: "слишком много раундов tool_use, прерываю" });
        }

        // Сохраняем assistant-сообщение
        let assistantId: string | null = null;
        if (finalText.trim()) {
          const { data: insAsst, error: insAsstErr } = await adminClient
            .from("ai_chat_messages")
            .insert({
              profile_id: userId,
              household_id: householdId,
              role: "assistant",
              content: finalText,
              tokens_in: totalTokensIn,
              tokens_out: totalTokensOut,
            })
            .select("id")
            .single();
          if (insAsstErr) {
            send({ type: "error", message: `save assistant failed: ${insAsstErr.message}` });
          } else {
            assistantId = insAsst?.id ?? null;
          }
        }

        const costUsd =
          totalTokensIn * PRICE_INPUT_PER_TOKEN +
          totalTokensOut * PRICE_OUTPUT_PER_TOKEN;

        send({
          type: "done",
          message_id: assistantId,
          tokens_in: totalTokensIn,
          tokens_out: totalTokensOut,
          cost_usd: Number(costUsd.toFixed(4)),
        });
      } catch (e) {
        send({ type: "error", message: (e as Error).message ?? "unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
});


// =============================================================================
// Контекст: собираем данные за раз под service_role
// =============================================================================
async function buildHouseholdContext(
  householdId: string,
  householdName: string,
  baseCurrency: string,
): Promise<HouseholdContext> {
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date();
  since.setDate(since.getDate() - OPERATIONS_DAYS_WINDOW);
  const sinceIso = since.toISOString().slice(0, 10);

  const monthStart = today.slice(0, 7) + "-01";

  const [accountsRes, categoriesRes, opsRes, budgetsRes, goalsRes] =
    await Promise.all([
      adminClient
        .from("accounts")
        .select("id, name, currency, visibility, owner_profile_id, initial_balance")
        .eq("household_id", householdId),
      adminClient
        .from("categories")
        .select("id, name, kind")
        .eq("household_id", householdId),
      adminClient
        .from("operations")
        .select("id, occurred_at, kind, amount, category_id, account_id, is_private, note")
        .eq("household_id", householdId)
        .gte("occurred_at", sinceIso)
        .order("occurred_at", { ascending: false })
        .limit(OPERATIONS_HARD_CAP),
      adminClient
        .from("budgets")
        .select("id, category_id, month, amount")
        .eq("household_id", householdId)
        .eq("month", monthStart),
      adminClient
        .from("goals")
        .select("id, name, target_amount, target_date, is_archived")
        .eq("household_id", householdId)
        .eq("is_archived", false),
    ]);

  if (accountsRes.error) throw new Error("accounts: " + accountsRes.error.message);
  if (categoriesRes.error) throw new Error("categories: " + categoriesRes.error.message);
  if (opsRes.error) throw new Error("operations: " + opsRes.error.message);
  if (budgetsRes.error) throw new Error("budgets: " + budgetsRes.error.message);
  if (goalsRes.error) throw new Error("goals: " + goalsRes.error.message);

  const accounts = (accountsRes.data ?? []) as AccountRow[];
  const categories = (categoriesRes.data ?? []) as CategoryRow[];
  const operations_30d = (opsRes.data ?? []) as OpRow[];
  const budgets_current_month = (budgetsRes.data ?? []) as BudgetRow[];
  const goals = (goalsRes.data ?? []) as GoalRow[];

  // Балансы по всем операциям (не только 30 дней) — отдельный лёгкий запрос
  const balances = await computeBalances(householdId, accounts);

  // Прогресс по целям — отдельным запросом
  const goalIds = goals.map((g) => g.id);
  let goal_progress: HouseholdContext["goal_progress"] = [];
  if (goalIds.length > 0) {
    const { data: contribs } = await adminClient
      .from("goal_contributions")
      .select("goal_id, amount")
      .in("goal_id", goalIds);
    const sumByGoal = new Map<string, number>();
    for (const row of (contribs ?? []) as { goal_id: string; amount: number }[]) {
      sumByGoal.set(row.goal_id, (sumByGoal.get(row.goal_id) ?? 0) + Number(row.amount));
    }
    goal_progress = goals.map((g) => ({
      goal_id: g.id,
      goal_name: g.name,
      contributed: sumByGoal.get(g.id) ?? 0,
    }));
  }
  return {
    household_id: householdId,
    household_name: householdName,
    base_currency: baseCurrency,
    today,
    accounts,
    categories,
    operations_30d,
    budgets_current_month,
    goals,
    balances,
    goal_progress,
  };
}

async function computeBalances(
  householdId: string,
  accounts: AccountRow[],
): Promise<HouseholdContext["balances"]> {
  if (accounts.length === 0) return [];

  // Все операции по всем счетам household — суммируем
  const { data: allOps, error } = await adminClient
    .from("operations")
    .select("account_id, kind, amount")
    .eq("household_id", householdId);

  if (error) throw new Error("balances ops: " + error.message);

  const sumByAcct = new Map<string, number>();
  for (const op of (allOps ?? []) as { account_id: string; kind: "expense" | "income"; amount: number }[]) {
    const cur = sumByAcct.get(op.account_id) ?? 0;
    const delta = op.kind === "income" ? Number(op.amount) : -Number(op.amount);
    sumByAcct.set(op.account_id, cur + delta);
  }

  return accounts.map((a) => ({
    account_id: a.id,
    account_name: a.name,
    currency: a.currency,
    balance: Number(a.initial_balance) + (sumByAcct.get(a.id) ?? 0),
  }));
}


// =============================================================================
// Контекстный блок в system (markdown, удобно модели)
// =============================================================================
function buildContextBlock(ctx: HouseholdContext): string {
  const lines: string[] = [];
  lines.push(`# Контекст семьи`);
  lines.push(`Сегодня: ${ctx.today}`);
  lines.push(`Семья: «${ctx.household_name}», базовая валюта: ${ctx.base_currency}`);
  lines.push("");

  lines.push(`## Счета (${ctx.accounts.length})`);
  for (const a of ctx.accounts) {
    const bal = ctx.balances.find((b) => b.account_id === a.id);
    const balStr = bal ? bal.balance.toFixed(2) : "?";
    lines.push(`- ${a.name} (${a.currency}, ${a.visibility}): баланс ${balStr} ${a.currency} [id=${a.id}]`);
  }
  lines.push("");

  lines.push(`## Категории (${ctx.categories.length})`);
  const expCats = ctx.categories.filter((c) => c.kind === "expense").map((c) => c.name);
  const incCats = ctx.categories.filter((c) => c.kind === "income").map((c) => c.name);
  lines.push(`Расходы: ${expCats.join(", ") || "—"}`);
  lines.push(`Доходы: ${incCats.join(", ") || "—"}`);
  lines.push("");

  lines.push(`## Бюджеты на текущий месяц (${ctx.budgets_current_month.length})`);
  if (ctx.budgets_current_month.length === 0) {
    lines.push(`(не задано)`);
  } else {
    for (const b of ctx.budgets_current_month) {
      const cat = ctx.categories.find((c) => c.id === b.category_id);
      lines.push(`- ${cat?.name ?? "?"}: лимит ${Number(b.amount).toFixed(2)} ${ctx.base_currency}`);
    }
  }
  lines.push("");

  lines.push(`## Активные цели (${ctx.goals.length})`);
  if (ctx.goals.length === 0) {
    lines.push(`(не задано)`);
  } else {
    for (const g of ctx.goals) {
      const prog = ctx.goal_progress.find((p) => p.goal_id === g.id);
      const contributed = prog?.contributed ?? 0;
      const pct = Number(g.target_amount) > 0
        ? ((contributed / Number(g.target_amount)) * 100).toFixed(0)
        : "0";
      lines.push(
        `- ${g.name}: ${contributed.toFixed(2)} / ${Number(g.target_amount).toFixed(2)} ` +
        `${ctx.base_currency} (${pct}%)` +
        (g.target_date ? `, до ${g.target_date}` : ""),
      );
    }
  }
  lines.push("");

  lines.push(`## Операции за последние ${OPERATIONS_DAYS_WINDOW} дней (top ${ctx.operations_30d.length}, новые сверху)`);
  if (ctx.operations_30d.length === 0) {
    lines.push(`(нет операций)`);
  } else {
    for (const op of ctx.operations_30d) {
      const cat = ctx.categories.find((c) => c.id === op.category_id);
      const acc = ctx.accounts.find((a) => a.id === op.account_id);
      const sign = op.kind === "expense" ? "-" : "+";
      const priv = op.is_private ? " 🔒" : "";
      lines.push(
        `${op.occurred_at} ${sign}${Number(op.amount).toFixed(2)} ${acc?.currency ?? "?"} ` +
        `· ${cat?.name ?? "—"} · ${acc?.name ?? "?"}${priv}` +
        (op.note ? ` · ${op.note}` : ""),
      );
    }
  }

  return lines.join("\n");
}


// =============================================================================
// Tools — реализация
// =============================================================================
async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: HouseholdContext,
): Promise<unknown> {
  switch (name) {
    case "sum_by_category":
      return toolSumByCategory(input as { month: string; kind: "expense" | "income" }, ctx);
    case "get_balance":
      return toolGetBalance(input as { account_id?: string | null }, ctx);
    case "compare_months":
      return toolCompareMonths(input as { month_a: string; month_b: string }, ctx);
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

async function toolSumByCategory(
  args: { month: string; kind: "expense" | "income" },
  ctx: HouseholdContext,
) {
  const { month, kind } = args;
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("month must be YYYY-MM");
  const start = `${month}-01`;
  const end = nextMonthFirstDay(month);

  const { data, error } = await adminClient
    .from("operations")
    .select("category_id, amount")
    .eq("household_id", ctx.household_id)
    .eq("kind", kind)
    .gte("occurred_at", start)
    .lt("occurred_at", end);

  if (error) throw new Error(error.message);

  const sums = new Map<string | null, number>();
  for (const row of (data ?? []) as { category_id: string | null; amount: number }[]) {
    const cur = sums.get(row.category_id) ?? 0;
    sums.set(row.category_id, cur + Number(row.amount));
  }

  const result = Array.from(sums.entries())
    .map(([catId, total]) => {
      const cat = ctx.categories.find((c) => c.id === catId);
      return {
        category_name: cat?.name ?? "(без категории)",
        total: Number(total.toFixed(2)),
        currency: ctx.base_currency,
      };
    })
    .sort((a, b) => b.total - a.total);

  return { month, kind, items: result, currency: ctx.base_currency };
}

async function toolGetBalance(
  args: { account_id?: string | null },
  ctx: HouseholdContext,
) {
  if (args.account_id) {
    const b = ctx.balances.find((x) => x.account_id === args.account_id);
    if (!b) return { error: "счёт не найден" };
    return b;
  }
  return { balances: ctx.balances };
}

async function toolCompareMonths(
  args: { month_a: string; month_b: string },
  ctx: HouseholdContext,
) {
  const sumFor = async (month: string) => {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("month must be YYYY-MM");
    const start = `${month}-01`;
    const end = nextMonthFirstDay(month);
    const { data, error } = await adminClient
      .from("operations")
      .select("kind, amount")
      .eq("household_id", ctx.household_id)
      .gte("occurred_at", start)
      .lt("occurred_at", end);
    if (error) throw new Error(error.message);
    let inc = 0, exp = 0;
    for (const r of (data ?? []) as { kind: "expense" | "income"; amount: number }[]) {
      if (r.kind === "income") inc += Number(r.amount);
      else exp += Number(r.amount);
    }
    return {
      month,
      income: Number(inc.toFixed(2)),
      expense: Number(exp.toFixed(2)),
      net: Number((inc - exp).toFixed(2)),
    };
  };

  const [a, b] = await Promise.all([sumFor(args.month_a), sumFor(args.month_b)]);
  return {
    a,
    b,
    delta: {
      income: Number((b.income - a.income).toFixed(2)),
      expense: Number((b.expense - a.expense).toFixed(2)),
      net: Number((b.net - a.net).toFixed(2)),
    },
    currency: ctx.base_currency,
  };
}

function nextMonthFirstDay(monthYYYYMM: string): string {
  const [y, m] = monthYYYYMM.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)); // month is 1-based → next month
  return next.toISOString().slice(0, 10);
}


// =============================================================================
// helpers
// =============================================================================
function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
