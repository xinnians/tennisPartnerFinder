import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createDispatcherV2HostedCanarySenderEnvironment,
  dispatcherV2HostedCanaryAccess,
  readDispatcherV2HostedCanaryConfig,
} from "../supabase/functions/notification-outbox-dispatch-v2-canary/runtime.js";

const GENERATION = "9223372036854775000";
const SECRET = "a".repeat(64);

function environment(values) {
  return (name) => values[name] ?? "";
}

test("hosted canary needs the exact hosted mode while local tests use a separate mode", () => {
  assert.deepEqual(dispatcherV2HostedCanaryAccess(environment({})), { enabled: false, hostedRuntime: false });
  assert.deepEqual(
    dispatcherV2HostedCanaryAccess(environment({ NOTIFICATION_DISPATCH_V2_CANARY_MODE: "local-test-v1" })),
    { enabled: true, hostedRuntime: false }
  );
  assert.deepEqual(
    dispatcherV2HostedCanaryAccess(
      environment({
        DENO_DEPLOYMENT_ID: "present",
        NOTIFICATION_DISPATCH_V2_CANARY_MODE: "local-test-v1",
      })
    ),
    { enabled: false, hostedRuntime: true }
  );
  assert.deepEqual(
    dispatcherV2HostedCanaryAccess(
      environment({
        NOTIFICATION_DISPATCH_V2_CANARY_MODE: "hosted-manual-canary-v1",
        SB_REGION: "present",
      })
    ),
    { enabled: true, hostedRuntime: true }
  );
});

test("hosted canary configuration has no generation, credential, or authorization defaults", () => {
  const values = {
    NOTIFICATION_DISPATCH_V2_CANARY_DATABASE_URL:
      "postgresql://notification_dispatcher:secret@database.example/postgres",
    NOTIFICATION_DISPATCH_V2_CANARY_EXPECTED_GENERATION: GENERATION,
    NOTIFICATION_DISPATCH_V2_CANARY_MODE: "local-test-v1",
    NOTIFICATION_DISPATCH_V2_CANARY_SECRET: SECRET,
  };
  assert.deepEqual(readDispatcherV2HostedCanaryConfig(environment(values)), {
    canarySecret: SECRET,
    connectionString: values.NOTIFICATION_DISPATCH_V2_CANARY_DATABASE_URL,
    expectedGeneration: GENERATION,
  });
  for (const overrides of [
    { NOTIFICATION_DISPATCH_V2_CANARY_MODE: "" },
    { NOTIFICATION_DISPATCH_V2_CANARY_SECRET: "short" },
    { NOTIFICATION_DISPATCH_V2_CANARY_SECRET: ` ${SECRET}` },
    { NOTIFICATION_DISPATCH_V2_CANARY_DATABASE_URL: "" },
    { NOTIFICATION_DISPATCH_V2_CANARY_EXPECTED_GENERATION: "01" },
    { NOTIFICATION_DISPATCH_V2_CANARY_EXPECTED_GENERATION: "9223372036854775808" },
  ]) {
    assert.throws(
      () => readDispatcherV2HostedCanaryConfig(environment({ ...values, ...overrides })),
      /DISPATCH_V2_CANARY_CONFIG_INVALID/u
    );
  }
});

test("hosted canary maps sender policy to canary-only names and shares only VAPID", () => {
  const values = {
    NOTIFICATION_DISPATCH_V2_CANARY_PROVIDER_ORIGINS_V1: '["https://fcm.googleapis.com"]',
    NOTIFICATION_DISPATCH_V2_CANARY_TRANSPORT: "deno-native-web-push-v1",
    PUSH_PROVIDER_ORIGINS_V1: '["https://should-not-be-used.example"]',
    WEB_PUSH_TRANSPORT: "mock",
    WEB_PUSH_VAPID_PRIVATE_KEY: "private",
    WEB_PUSH_VAPID_PUBLIC_KEY: "public",
    WEB_PUSH_VAPID_SUBJECT: "mailto:push@example.test",
  };
  const canaryEnvironment = createDispatcherV2HostedCanarySenderEnvironment(environment(values));
  assert.equal(
    canaryEnvironment("PUSH_PROVIDER_ORIGINS_V1"),
    values.NOTIFICATION_DISPATCH_V2_CANARY_PROVIDER_ORIGINS_V1
  );
  assert.equal(canaryEnvironment("WEB_PUSH_TRANSPORT"), values.NOTIFICATION_DISPATCH_V2_CANARY_TRANSPORT);
  assert.equal(canaryEnvironment("WEB_PUSH_VAPID_PRIVATE_KEY"), values.WEB_PUSH_VAPID_PRIVATE_KEY);
  assert.equal(canaryEnvironment("WEB_PUSH_VAPID_PUBLIC_KEY"), values.WEB_PUSH_VAPID_PUBLIC_KEY);
  assert.equal(canaryEnvironment("WEB_PUSH_VAPID_SUBJECT"), values.WEB_PUSH_VAPID_SUBJECT);
  assert.equal(canaryEnvironment("PUSH_TEST_URL"), "");
  assert.throws(() => createDispatcherV2HostedCanarySenderEnvironment(null), /DISPATCH_V2_CANARY_CONFIG_INVALID/u);
});

test("canary entrypoint gates runtime, method, configuration, and secret before database or sender work", () => {
  const source = readFileSync(
    new URL("../supabase/functions/notification-outbox-dispatch-v2-canary/index.ts", import.meta.url),
    "utf8"
  );
  const ordered = [
    "if (!dispatcherV2HostedCanaryAccess(env).enabled)",
    'if (request.method !== "POST")',
    "runtimeConfig = readDispatcherV2HostedCanaryConfig(env)",
    'request.headers.get("x-notification-v2-canary-secret")',
    "createDispatcherV2HostedCanarySenderEnvironment(env)",
    "await createDispatcherV2DenoWebPushSender",
    "await withNotificationDispatcherDatabase",
  ].map((marker) => source.indexOf(marker));
  assert.ok(ordered.every((index) => index >= 0));
  assert.deepEqual(
    ordered,
    [...ordered].sort((left, right) => left - right)
  );
  assert.doesNotMatch(source, /NOTIFICATION_CRON_SECRET|webpush\.sendNotification|\bfetch\s*\(/u);
  assert.doesNotMatch(source, /\b(?:console|logger|Sentry)\./u);
  assert.match(source, /return Deno\.env\.get\(name\) \?\? "";/u);

  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
  assert.match(config, /\[functions\.notification-outbox-dispatch-v2-canary\]\nverify_jwt = false/u);
});
