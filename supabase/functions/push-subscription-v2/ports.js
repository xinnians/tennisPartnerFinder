import { hasExactKeys } from "../_shared/push-subscription-v2-protocol.js";

const PORT_NAMES = Object.freeze([
  "enableCommand",
  "loadKeyRing",
  "loadProviderPolicy",
  "loadServerVapidPublicKey",
  "refreshCommand",
  "verifyUser",
]);

// Structural composition only. No handler, Deno.serve, fetch, environment
// reader, DB client, or production caller is created in FA-03B11.
export function createPushSubscriptionV2Ports(ports) {
  if (!hasExactKeys(ports, PORT_NAMES) || PORT_NAMES.some((name) => typeof ports[name] !== "function")) {
    throw new Error("PUSH_SUBSCRIPTION_PORTS_INVALID");
  }
  return Object.freeze({ ...ports });
}
