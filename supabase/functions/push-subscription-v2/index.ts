import { createPushSubscriptionV2Entrypoint } from "./entrypoint.js";

function env(name: string) {
  return Deno.env.get(name) ?? "";
}

Deno.serve(createPushSubscriptionV2Entrypoint({ readEnvironment: env }));
