import { createPushSubscriptionV2RuntimePorts } from "./adapters.js";
import { createPushSubscriptionV2Handler } from "./handler.js";
import { pushSubscriptionV2RuntimeAccess } from "./runtime.js";

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

const unavailableHandler = () => unavailableResponse();

export function createPushSubscriptionV2Entrypoint({
  cryptoRef = globalThis.crypto,
  fetchRef = globalThis.fetch,
  readEnvironment,
} = {}) {
  if (typeof readEnvironment !== "function") return unavailableHandler;

  try {
    const { hostedEnabled, localTestEnabled } = pushSubscriptionV2RuntimeAccess(readEnvironment);
    if (!hostedEnabled && !localTestEnabled) return unavailableHandler;

    return createPushSubscriptionV2Handler({
      allowedOrigin: readEnvironment("PUSH_SUBSCRIPTION_V2_ALLOWED_ORIGIN"),
      cryptoRef,
      ports: createPushSubscriptionV2RuntimePorts({
        cryptoRef,
        fetchRef,
        localTestEnabled,
        readEnvironment,
      }),
    });
  } catch {
    return unavailableHandler;
  }
}
