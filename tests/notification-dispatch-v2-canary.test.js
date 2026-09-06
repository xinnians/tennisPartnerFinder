import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { dispatcherV2CanaryRuntimeAccess } from "../supabase/functions/notification-dispatch-v2-canary/runtime.js";

function access(environment) {
  return dispatcherV2CanaryRuntimeAccess((name) => environment[name] ?? "");
}

test("dispatcher v2 network canary is local-only and fails closed on either hosted marker", () => {
  assert.deepEqual(access({ DISPATCH_V2_CANARY_RUNTIME_MODE: "local-test-v1" }), {
    hostedRuntime: false,
    localTestEnabled: true,
  });
  assert.deepEqual(access({ DISPATCH_V2_CANARY_RUNTIME_MODE: "enabled" }), {
    hostedRuntime: false,
    localTestEnabled: false,
  });
  for (const marker of ["DENO_DEPLOYMENT_ID", "SB_REGION"]) {
    assert.deepEqual(access({ DISPATCH_V2_CANARY_RUNTIME_MODE: "local-test-v1", [marker]: "present" }), {
      hostedRuntime: true,
      localTestEnabled: false,
    });
  }
});

test("canary and dormant outcome sources contain no application logging sink", () => {
  const sources = [
    "../supabase/functions/notification-dispatch-v2-canary/index.ts",
    "../supabase/functions/notification-dispatch-v2-canary/runtime.js",
    "../supabase/functions/notification-outbox-dispatch/v2-outcome.js",
  ]
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
    .join("\n");
  assert.doesNotMatch(sources, /\b(?:console|logger|Sentry)\./u);
});
