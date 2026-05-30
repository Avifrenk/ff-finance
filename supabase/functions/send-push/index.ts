// =============================================================================
// Edge Function: send-push (Фаза 8.4.5)
// =============================================================================
// Раз в N минут (см. pg_cron в миграции send_push_cron) разгребает
// public.notification_queue: для каждой unsent-записи находит все
// push_subscriptions владельца и отправляет push через web-push.
// Помечает sent_at.
//
// 410 Gone / 404 → endpoint мёртв (юзер удалил установку, очистил данные),
// чистим строку из push_subscriptions.
//
// Под service_role: обходит RLS, чтобы прочитать чужие notification_queue
// и subscriptions. Сами таблицы пользователю напрямую не доступны на
// insert/update (только select собственных через RLS).
//
// Secrets (через `supabase secrets set`):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//   SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY — выставляются автоматически.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "https://esm.sh/web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY не выставлены");
}
if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY не выставлены — задайте через supabase secrets set");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

type QueueRow = {
  id: string;
  profile_id: string;
  title: string;
  body: string;
  url: string | null;
};

type SubRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

Deno.serve(async () => {
  const startedAt = Date.now();

  const { data: queue, error: queueErr } = await supabase
    .from("notification_queue")
    .select("id, profile_id, title, body, url")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(100);

  if (queueErr) {
    return json({ ok: false, where: "queue.select", error: queueErr.message }, 500);
  }
  if (!queue || queue.length === 0) {
    return json({ ok: true, processed: 0, sent: 0, ms: Date.now() - startedAt });
  }

  let pushesSent = 0;
  let deadEndpoints = 0;

  for (const item of queue as QueueRow[]) {
    const { data: subs, error: subErr } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("profile_id", item.profile_id);

    if (subErr) {
      console.error("subs.select failed", item.profile_id, subErr.message);
      continue;
    }

    const payload = JSON.stringify({ title: item.title, body: item.body, url: item.url ?? "/" });

    for (const sub of (subs ?? []) as SubRow[]) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        pushesSent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          deadEndpoints++;
        } else {
          console.error("push send failed", sub.endpoint, status, (e as Error).message);
        }
      }
    }

    const { error: updErr } = await supabase
      .from("notification_queue")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", item.id);
    if (updErr) {
      console.error("queue.update failed", item.id, updErr.message);
    }
  }

  return json({
    ok: true,
    processed: queue.length,
    sent: pushesSent,
    deadEndpoints,
    ms: Date.now() - startedAt,
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
