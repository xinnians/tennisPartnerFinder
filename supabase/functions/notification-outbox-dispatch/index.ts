import { createClient } from "npm:@supabase/supabase-js@2.110.0";
import webpush from "npm:web-push@3.6.7";

import { classifyPushStatus, notificationTitle, safePushPayload, toWebPushSubscription } from "./dispatch.js";
import {
  dispatcherV2RuntimeAccess,
  readDispatcherV2LocalConfig,
  runDispatcherV2Batch,
  safeDispatcherV2RuntimeErrorCode,
} from "./v2-runtime.js";

const MAX_BATCH_SIZE = 100;

function env(name: string) {
  return Deno.env.get(name)?.trim() ?? "";
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status,
  });
}

function configuredBatchSize() {
  const value = Number(env("NOTIFICATION_OUTBOX_BATCH_SIZE") || MAX_BATCH_SIZE);
  return Number.isInteger(value) && value > 0 ? Math.min(value, MAX_BATCH_SIZE) : MAX_BATCH_SIZE;
}

function pushMessage(eventType: string, payload: Record<string, unknown>) {
  return {
    ...safePushPayload(payload),
    title: notificationTitle(eventType),
  };
}

async function sendWebPush(subscription: Record<string, unknown>, message: Record<string, unknown>) {
  const subject = env("WEB_PUSH_VAPID_SUBJECT");
  const publicKey = env("WEB_PUSH_VAPID_PUBLIC_KEY");
  const privateKey = env("WEB_PUSH_VAPID_PRIVATE_KEY");
  if (!subject || !publicKey || !privateKey) throw new Error("WEB_PUSH_VAPID_CONFIG_REQUIRED");

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const response = await webpush.sendNotification(toWebPushSubscription(subscription), JSON.stringify(message));
  return Number(response.statusCode);
}

async function sendPush(subscription: Record<string, unknown>, message: Record<string, unknown>) {
  return sendWebPush(subscription, message);
}

function statusFromError(error: unknown) {
  const status = Number((error as { statusCode?: unknown })?.statusCode);
  return Number.isInteger(status) ? status : null;
}

async function runLocalV2Dispatch() {
  try {
    const transport = env("WEB_PUSH_TRANSPORT");
    const senderModulePromise =
      transport === "mock"
        ? import("./v2-local-mock.js")
        : transport === "deno-native-web-push-v1"
          ? import("./v2-deno-web-push.ts")
          : Promise.reject(new Error("DISPATCH_V2_RUNTIME_CONFIG_INVALID"));
    const [{ withNotificationDispatcherDatabase }, senderModule] = await Promise.all([
      import("./v2-database.ts"),
      senderModulePromise,
    ]);
    const config = readDispatcherV2LocalConfig(env);
    const sendPrepared =
      transport === "mock"
        ? await senderModule.createDispatcherV2LocalMockSender(senderModule.readDispatcherV2LocalMockConfig(env))
        : await senderModule.createDispatcherV2DenoWebPushSender(senderModule.readDispatcherV2DenoWebPushConfig(env));
    const result = await withNotificationDispatcherDatabase({
      connectionString: env("NOTIFICATION_DISPATCH_DATABASE_URL"),
      operation: (database) =>
        runDispatcherV2Batch({
          ...config,
          database,
          sendPrepared,
        }),
    });
    return json(result);
  } catch (error) {
    const code = safeDispatcherV2RuntimeErrorCode(error);
    console.error(JSON.stringify({ code, count: 1, statusCode: null }));
    return json({ error: code }, 500);
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (request.headers.get("x-notification-cron-secret") !== env("NOTIFICATION_CRON_SECRET")) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const runtimeAccess = dispatcherV2RuntimeAccess(env);
  if (runtimeAccess.localTestEnabled) return runLocalV2Dispatch();
  if (env("WEB_PUSH_TRANSPORT")) return json({ error: "WEB_PUSH_V2_TRANSPORT_FORBIDDEN" }, 500);

  const supabaseUrl = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "SUPABASE_SERVICE_CONFIG_REQUIRED" }, 500);

  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: outboxRows, error: outboxError } = await client
    .from("notification_outbox")
    .select("id,event_type,recipient_profile_id,session_id,payload,attempts")
    .eq("outbox_format_version", 1)
    .is("sent_at", null)
    .lt("attempts", 3)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(configuredBatchSize());
  if (outboxError) return json({ error: "OUTBOX_READ_FAILED" }, 500);

  const recipientIds = [...new Set((outboxRows ?? []).map((row) => row.recipient_profile_id))];
  const { data: subscriptionRows, error: subscriptionError } = recipientIds.length
    ? await client.from("push_subscriptions").select("profile_id,endpoint,p256dh,auth").in("profile_id", recipientIds)
    : { data: [], error: null };
  if (subscriptionError) return json({ error: "SUBSCRIPTION_READ_FAILED" }, 500);

  const subscriptionsByProfile = new Map<number, Record<string, unknown>[]>();
  for (const subscription of subscriptionRows ?? []) {
    const existing = subscriptionsByProfile.get(subscription.profile_id) ?? [];
    existing.push(subscription);
    subscriptionsByProfile.set(subscription.profile_id, existing);
  }

  let claimed = 0;
  let sent = 0;
  let staleSubscriptions = 0;
  for (const outboxRow of outboxRows ?? []) {
    const nextAttempt = Number(outboxRow.attempts) + 1;
    const { data: claimedRows, error: claimError } = await client
      .from("notification_outbox")
      .update({ attempts: nextAttempt })
      .eq("id", outboxRow.id)
      .eq("attempts", outboxRow.attempts)
      .is("sent_at", null)
      .select("id");
    if (claimError || !claimedRows?.length) continue;
    claimed += 1;

    const subscriptions = subscriptionsByProfile.get(outboxRow.recipient_profile_id) ?? [];
    if (!subscriptions.length) {
      await client.from("notification_outbox").update({ sent_at: new Date().toISOString() }).eq("id", outboxRow.id);
      sent += 1;
      continue;
    }

    let delivered = false;
    let allRemoved = true;
    const message = pushMessage(outboxRow.event_type, outboxRow.payload);
    for (const subscription of subscriptions) {
      let result;
      try {
        result = classifyPushStatus(await sendPush(subscription, message));
      } catch (error) {
        // 只記名稱/狀態/短訊息;endpoint 與 payload 屬敏感內容不可進 log。
        const err = error as { name?: unknown; statusCode?: unknown; message?: unknown };
        console.error(
          "[dispatch] send failed:",
          String(err?.name ?? "Error"),
          Number(err?.statusCode) || null,
          String(err?.message ?? "").slice(0, 160)
        );
        result = classifyPushStatus(statusFromError(error));
      }

      if (result.removeSubscription) {
        await client.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        staleSubscriptions += 1;
      }
      delivered ||= result.delivered;
      allRemoved &&= result.removeSubscription;
    }

    if (delivered || allRemoved) {
      await client.from("notification_outbox").update({ sent_at: new Date().toISOString() }).eq("id", outboxRow.id);
      sent += 1;
    }
  }

  return json({ claimed, sent, staleSubscriptions });
});
