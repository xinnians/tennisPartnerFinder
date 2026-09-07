import { withNotificationDispatcherDatabase } from "../notification-outbox-dispatch/v2-database.ts";
import {
  createDispatcherV2DenoWebPushSender,
  readDispatcherV2DenoWebPushConfig,
} from "../notification-outbox-dispatch/v2-deno-web-push.ts";
import { runDispatcherV2Batch, safeDispatcherV2RuntimeErrorCode } from "../notification-outbox-dispatch/v2-runtime.js";
import { dispatcherV2HostedCanaryAccess, readDispatcherV2HostedCanaryConfig } from "./runtime.js";

function env(name: string) {
  return Deno.env.get(name) ?? "";
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
    },
    status,
  });
}

Deno.serve(async (request) => {
  if (!dispatcherV2HostedCanaryAccess(env).enabled) return json({ error: "DISPATCH_V2_CANARY_UNAVAILABLE" }, 503);
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  let runtimeConfig;
  try {
    runtimeConfig = readDispatcherV2HostedCanaryConfig(env);
  } catch {
    return json({ error: "DISPATCH_V2_CANARY_CONFIG_INVALID" }, 503);
  }
  if (request.headers.get("x-notification-v2-canary-secret") !== runtimeConfig.canarySecret) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  try {
    const sendPrepared = await createDispatcherV2DenoWebPushSender(readDispatcherV2DenoWebPushConfig(env));
    const result = await withNotificationDispatcherDatabase({
      connectionString: runtimeConfig.connectionString,
      operation: (database) =>
        runDispatcherV2Batch({
          batchSize: 1,
          database,
          expectedGeneration: runtimeConfig.expectedGeneration,
          sendPrepared,
        }),
    });
    return json(result);
  } catch (error) {
    return json({ error: safeDispatcherV2RuntimeErrorCode(error) }, 500);
  }
});
