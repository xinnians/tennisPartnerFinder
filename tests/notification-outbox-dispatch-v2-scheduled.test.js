import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createDispatcherV2ScheduledEntrypoint } from "../supabase/functions/notification-outbox-dispatch-v2/entrypoint.js";
import {
  createDispatcherV2ScheduledSenderEnvironment,
  dispatcherV2ScheduledAccess,
  NOTIFICATION_DISPATCH_V2_HOSTED_RUNTIME_MODE,
  readDispatcherV2ScheduledConfig,
} from "../supabase/functions/notification-outbox-dispatch-v2/runtime.js";

const GENERATION = "9223372036854775000";
const CRON_SECRET = "a".repeat(64);
const CONNECTION_STRING = "postgresql://notification_dispatcher:secret@database.example/postgres";

function environment(values) {
  return (name) => values[name] ?? "";
}

function validEnvironment(overrides = {}) {
  return {
    NOTIFICATION_CRON_SECRET: CRON_SECRET,
    NOTIFICATION_DISPATCH_V2_BATCH_SIZE: "3",
    NOTIFICATION_DISPATCH_V2_DATABASE_URL: CONNECTION_STRING,
    NOTIFICATION_DISPATCH_V2_EXPECTED_GENERATION: GENERATION,
    NOTIFICATION_DISPATCH_V2_PROVIDER_ORIGINS_V1: '["https://fcm.googleapis.com"]',
    NOTIFICATION_DISPATCH_V2_RUNTIME_MODE: "local-test-v1",
    NOTIFICATION_DISPATCH_V2_TEST_URL: "http://host.docker.internal:4010/push",
    NOTIFICATION_DISPATCH_V2_TRANSPORT: "mock",
    ...overrides,
  };
}

function dependencies(calls = []) {
  return {
    async createDenoSender(config) {
      calls.push(["create-deno-sender", config]);
      return async () => ({ kind: "accepted" });
    },
    async createLocalMockSender(config) {
      calls.push(["create-local-mock-sender", config]);
      return async () => ({ kind: "accepted" });
    },
    readDenoSenderConfig(readEnvironment) {
      calls.push(["read-deno-config", readEnvironment("WEB_PUSH_TRANSPORT")]);
      return { kind: "deno-config" };
    },
    readLocalMockConfig(readEnvironment) {
      const config = {
        mockUrl: readEnvironment("PUSH_TEST_URL"),
        policy: readEnvironment("PUSH_PROVIDER_ORIGINS_V1"),
        transport: readEnvironment("WEB_PUSH_TRANSPORT"),
      };
      calls.push(["read-local-mock-config", config]);
      return config;
    },
    async runBatch(values) {
      calls.push([
        "run-batch",
        {
          batchSize: values.batchSize,
          database: values.database,
          expectedGeneration: values.expectedGeneration,
          sendPreparedType: typeof values.sendPrepared,
        },
      ]);
      return { claimed: 0, kind: "completed", version: 1 };
    },
    safeErrorCode() {
      return "DISPATCH_V2_FAILED";
    },
    async withDatabase({ connectionString, operation }) {
      const database = Object.freeze({ kind: "database-port" });
      calls.push(["with-database", connectionString]);
      return operation(database);
    },
  };
}

test("scheduled access accepts only the exact mode for the detected runtime", () => {
  const access = (values) => dispatcherV2ScheduledAccess(environment(values));
  assert.deepEqual(access({}), { hostedEnabled: false, hostedRuntime: false, localTestEnabled: false });
  assert.deepEqual(access({ NOTIFICATION_DISPATCH_V2_RUNTIME_MODE: "local-test-v1" }), {
    hostedEnabled: false,
    hostedRuntime: false,
    localTestEnabled: true,
  });
  assert.deepEqual(access({ NOTIFICATION_DISPATCH_V2_RUNTIME_MODE: "hosted-v1" }), {
    hostedEnabled: false,
    hostedRuntime: false,
    localTestEnabled: false,
  });
  assert.deepEqual(access({ NOTIFICATION_DISPATCH_V2_RUNTIME_MODE: "hosted-v1", SB_REGION: "region" }), {
    hostedEnabled: true,
    hostedRuntime: true,
    localTestEnabled: false,
  });
  for (const mode of ["hosted-v1 ", " hosted-v1", "HOSTED-V1", "enabled", "local-test-v1"]) {
    assert.deepEqual(access({ DENO_DEPLOYMENT_ID: "deployment", NOTIFICATION_DISPATCH_V2_RUNTIME_MODE: mode }), {
      hostedEnabled: false,
      hostedRuntime: true,
      localTestEnabled: false,
    });
  }
  assert.equal(NOTIFICATION_DISPATCH_V2_HOSTED_RUNTIME_MODE, "hosted-v1");
});

test("scheduled config has no secret, database, generation, or batch defaults", () => {
  const values = validEnvironment();
  assert.deepEqual(readDispatcherV2ScheduledConfig(environment(values)), {
    batchSize: 3,
    connectionString: CONNECTION_STRING,
    cronSecret: CRON_SECRET,
    expectedGeneration: GENERATION,
  });

  for (const overrides of [
    { NOTIFICATION_CRON_SECRET: "" },
    { NOTIFICATION_CRON_SECRET: "short" },
    { NOTIFICATION_CRON_SECRET: ` ${CRON_SECRET}` },
    { NOTIFICATION_CRON_SECRET: "a".repeat(257) },
    { NOTIFICATION_DISPATCH_V2_BATCH_SIZE: "" },
    { NOTIFICATION_DISPATCH_V2_BATCH_SIZE: "0" },
    { NOTIFICATION_DISPATCH_V2_BATCH_SIZE: "01" },
    { NOTIFICATION_DISPATCH_V2_BATCH_SIZE: "101" },
    { NOTIFICATION_DISPATCH_V2_DATABASE_URL: "" },
    { NOTIFICATION_DISPATCH_V2_DATABASE_URL: ` ${CONNECTION_STRING}` },
    { NOTIFICATION_DISPATCH_V2_EXPECTED_GENERATION: "" },
    { NOTIFICATION_DISPATCH_V2_EXPECTED_GENERATION: "01" },
    { NOTIFICATION_DISPATCH_V2_EXPECTED_GENERATION: "9223372036854775808" },
    { NOTIFICATION_DISPATCH_V2_RUNTIME_MODE: "" },
  ]) {
    assert.throws(
      () => readDispatcherV2ScheduledConfig(environment({ ...values, ...overrides })),
      /DISPATCH_V2_SCHEDULED_CONFIG_INVALID/u
    );
  }
});

test("sender environment isolates v2 policy and transport while sharing only VAPID", () => {
  const values = validEnvironment({
    PUSH_PROVIDER_ORIGINS_V1: '["https://wrong.example"]',
    PUSH_TEST_URL: "http://host.docker.internal:9999/wrong",
    WEB_PUSH_TRANSPORT: "wrong",
    WEB_PUSH_VAPID_PRIVATE_KEY: "private",
    WEB_PUSH_VAPID_PUBLIC_KEY: "public",
    WEB_PUSH_VAPID_SUBJECT: "mailto:push@example.test",
  });
  const senderEnvironment = createDispatcherV2ScheduledSenderEnvironment(environment(values));
  assert.equal(senderEnvironment("PUSH_PROVIDER_ORIGINS_V1"), values.NOTIFICATION_DISPATCH_V2_PROVIDER_ORIGINS_V1);
  assert.equal(senderEnvironment("PUSH_TEST_URL"), values.NOTIFICATION_DISPATCH_V2_TEST_URL);
  assert.equal(senderEnvironment("WEB_PUSH_TRANSPORT"), values.NOTIFICATION_DISPATCH_V2_TRANSPORT);
  assert.equal(senderEnvironment("WEB_PUSH_VAPID_PRIVATE_KEY"), values.WEB_PUSH_VAPID_PRIVATE_KEY);
  assert.equal(senderEnvironment("WEB_PUSH_VAPID_PUBLIC_KEY"), values.WEB_PUSH_VAPID_PUBLIC_KEY);
  assert.equal(senderEnvironment("WEB_PUSH_VAPID_SUBJECT"), values.WEB_PUSH_VAPID_SUBJECT);
  assert.equal(senderEnvironment("SUPABASE_SERVICE_ROLE_KEY"), "");

  const hostedEnvironment = createDispatcherV2ScheduledSenderEnvironment(
    environment(
      validEnvironment({
        NOTIFICATION_DISPATCH_V2_RUNTIME_MODE: "hosted-v1",
        SB_REGION: "region",
      })
    )
  );
  assert.equal(hostedEnvironment("PUSH_TEST_URL"), "");
});

test("entrypoint stays data-free when disabled, misconfigured, unauthorized, or called with another method", async () => {
  const request = (method = "POST", secret = CRON_SECRET) =>
    new Request("https://project.supabase.co/functions/v1/notification-outbox-dispatch-v2", {
      headers: { "x-notification-cron-secret": secret },
      method,
    });

  for (const values of [
    {},
    validEnvironment({ NOTIFICATION_DISPATCH_V2_RUNTIME_MODE: "" }),
    validEnvironment({ NOTIFICATION_DISPATCH_V2_BATCH_SIZE: "" }),
    validEnvironment({ NOTIFICATION_CRON_SECRET: "" }),
  ]) {
    const calls = [];
    const response = await createDispatcherV2ScheduledEntrypoint({
      ...dependencies(calls),
      readEnvironment: environment(values),
    })(request());
    assert.equal(response.status, 503);
    assert.equal(await response.text(), '{"error":"DISPATCH_V2_UNAVAILABLE"}');
    assert.deepEqual(calls, []);
  }

  const methodCalls = [];
  const methodHandler = createDispatcherV2ScheduledEntrypoint({
    ...dependencies(methodCalls),
    readEnvironment: environment(validEnvironment()),
  });
  const methodResponse = await methodHandler(request("GET"));
  assert.equal(methodResponse.status, 405);
  assert.equal(await methodResponse.text(), '{"error":"METHOD_NOT_ALLOWED"}');
  assert.deepEqual(methodCalls, []);

  const authCalls = [];
  const authHandler = createDispatcherV2ScheduledEntrypoint({
    ...dependencies(authCalls),
    readEnvironment: environment(validEnvironment()),
  });
  const authResponse = await authHandler(request("POST", "wrong"));
  assert.equal(authResponse.status, 401);
  assert.equal(await authResponse.text(), '{"error":"UNAUTHORIZED"}');
  assert.deepEqual(authCalls, []);
});

test("authorized local execution maps only namespaced config into the existing D1 and sender ports", async () => {
  const calls = [];
  const handler = createDispatcherV2ScheduledEntrypoint({
    ...dependencies(calls),
    readEnvironment: environment(validEnvironment()),
  });
  const response = await handler(
    new Request("http://localhost/functions/v1/notification-outbox-dispatch-v2", {
      headers: { "x-notification-cron-secret": CRON_SECRET },
      method: "POST",
    })
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { claimed: 0, kind: "completed", version: 1 });
  assert.deepEqual(calls, [
    [
      "read-local-mock-config",
      {
        mockUrl: "http://host.docker.internal:4010/push",
        policy: '["https://fcm.googleapis.com"]',
        transport: "mock",
      },
    ],
    [
      "create-local-mock-sender",
      {
        mockUrl: "http://host.docker.internal:4010/push",
        policy: '["https://fcm.googleapis.com"]',
        transport: "mock",
      },
    ],
    ["with-database", CONNECTION_STRING],
    [
      "run-batch",
      {
        batchSize: 3,
        database: { kind: "database-port" },
        expectedGeneration: GENERATION,
        sendPreparedType: "function",
      },
    ],
  ]);
});

test("hosted execution can never select the local mock sender", async () => {
  const calls = [];
  const handler = createDispatcherV2ScheduledEntrypoint({
    ...dependencies(calls),
    readEnvironment: environment(
      validEnvironment({
        NOTIFICATION_DISPATCH_V2_RUNTIME_MODE: "hosted-v1",
        SB_REGION: "region",
      })
    ),
  });
  const response = await handler(
    new Request("https://project.supabase.co/functions/v1/notification-outbox-dispatch-v2", {
      headers: { "x-notification-cron-secret": CRON_SECRET },
      method: "POST",
    })
  );
  assert.equal(response.status, 200);
  assert.equal(
    calls.some(([name]) => name === "create-local-mock-sender"),
    false
  );
  assert.equal(
    calls.some(([name]) => name === "read-local-mock-config"),
    false
  );
  assert.equal(
    calls.some(([name]) => name === "create-deno-sender"),
    true
  );
  assert.equal(
    calls.some(([name]) => name === "read-deno-config"),
    true
  );
});

test("entrypoint exposes only a fixed runtime error and no cacheable response", async () => {
  const handler = createDispatcherV2ScheduledEntrypoint({
    ...dependencies(),
    createLocalMockSender: async () => {
      throw new Error("postgresql://notification_dispatcher:secret@database.example/postgres");
    },
    readEnvironment: environment(validEnvironment()),
  });
  const response = await handler(
    new Request("http://localhost/functions/v1/notification-outbox-dispatch-v2", {
      headers: { "x-notification-cron-secret": CRON_SECRET },
      method: "POST",
    })
  );
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), '{"error":"DISPATCH_V2_FAILED"}');
});

test("scheduled source remains a thin composition without logging, cron creation, or copied dispatch logic", () => {
  const directory = new URL("../supabase/functions/notification-outbox-dispatch-v2/", import.meta.url);
  const source = ["entrypoint.js", "index.ts", "runtime.js"]
    .map((name) => readFileSync(new URL(name, directory), "utf8"))
    .join("\n");
  const indexSource = readFileSync(new URL("index.ts", directory), "utf8");
  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");

  assert.match(indexSource, /createDispatcherV2ScheduledEntrypoint/u);
  assert.match(indexSource, /withNotificationDispatcherDatabase/u);
  assert.match(indexSource, /createDispatcherV2DenoWebPushSender/u);
  assert.match(indexSource, /runDispatcherV2Batch/u);
  assert.doesNotMatch(source, /\b(?:console|logger|Sentry)\./u);
  assert.doesNotMatch(source, /create extension|cron\.schedule|notification_dispatcher_api\./iu);
  assert.doesNotMatch(source, /NOTIFICATION_DISPATCH_V2_BATCH_SIZE\s*\|\||EXPECTED_GENERATION\s*\|\|/u);
  assert.match(config, /\[functions\.notification-outbox-dispatch-v2\]\nverify_jwt = false/u);
});
