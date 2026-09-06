import { createPushSubscriptionV2RuntimePorts } from "./adapters.js";
import { createPushSubscriptionV2Handler } from "./handler.js";
import { pushSubscriptionV2RuntimeAccess } from "./runtime.js";

function env(name: string) {
  return Deno.env.get(name) ?? "";
}

function unavailableResponse() {
  return new Response('{"kind":"unavailable","version":1}', {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      pragma: "no-cache",
      vary: "Origin",
      "x-content-type-options": "nosniff",
    },
    status: 503,
  });
}

const { localTestEnabled } = pushSubscriptionV2RuntimeAccess(env);

if (!localTestEnabled) {
  Deno.serve(unavailableResponse);
} else {
  Deno.serve(
    createPushSubscriptionV2Handler({
      allowedOrigin: env("PUSH_SUBSCRIPTION_V2_ALLOWED_ORIGIN"),
      ports: createPushSubscriptionV2RuntimePorts({ localTestEnabled: true, readEnvironment: env }),
    })
  );
}
