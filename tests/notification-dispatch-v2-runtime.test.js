import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  dispatcherV2RuntimeAccess,
  readDispatcherV2LocalConfig,
  runDispatcherV2Batch,
  safeDispatcherV2RuntimeErrorCode,
} from "../supabase/functions/notification-outbox-dispatch/v2-runtime.js";
import {
  createDispatcherV2LocalMockSender,
  readDispatcherV2LocalMockConfig,
} from "../supabase/functions/notification-outbox-dispatch/v2-local-mock.js";

const WORKER_TOKEN = "10000000-0000-4000-8000-000000000001";
const CLAIM_TOKEN = "20000000-0000-4000-8000-000000000001";
const NOTIFICATION_ID = "30000000-0000-4000-8000-000000000001";
const CONSENT_EPOCH = "40000000-0000-4000-8000-000000000001";
const MAX_BIGINT = "9223372036854775807";
const PROVIDER_ORIGIN = "https://push-fixture.qiuka.tw";
const INDEX_SOURCE = readFileSync(
  new URL("../supabase/functions/notification-outbox-dispatch/index.ts", import.meta.url),
  "utf8"
);

function environment(values) {
  return (name) => values[name] ?? "";
}

function beginResult() {
  return {
    databaseNow: "2026-09-07T00:00:00+00:00",
    deliveryLeaseMs: "10000",
    generation: MAX_BIGINT,
    kind: "ready",
    leaseUntil: "2026-09-07T00:01:00+00:00",
    legacyOutboxHandled: false,
    legacyWritesEnabled: true,
    maxDeliveryAttempts: 3,
    pushTtlSafetyBudgetMs: "0",
    requestDeadlineMs: "5000",
    runtimeMode: "canary",
    startedAt: "2026-09-07T00:00:00+00:00",
    version: 1,
    workerToken: WORKER_TOKEN,
  };
}

function claimedResult() {
  return {
    attempt: 1,
    claimToken: CLAIM_TOKEN,
    claimedAt: "2026-09-07T00:00:00+00:00",
    databaseNow: "2026-09-07T00:00:00+00:00",
    deliveryId: MAX_BIGINT,
    expiresAt: "2026-09-07T00:01:00+00:00",
    kind: "claimed",
    leaseUntil: "2026-09-07T00:00:10+00:00",
    notificationId: NOTIFICATION_ID,
    outboxId: "9223372036854775806",
    recipientProfileId: "9223372036854775805",
    version: 1,
  };
}

function preparedResult() {
  return {
    auth: "auth-fixture",
    claimToken: CLAIM_TOKEN,
    consentEpoch: CONSENT_EPOCH,
    databaseNow: "2026-09-07T00:00:00+00:00",
    deliveryId: MAX_BIGINT,
    endpoint: `${PROVIDER_ORIGIN}/send/token`,
    endpointFingerprintAlgorithm: "sha256-endpoint-utf8-v1",
    endpointFingerprintHex: "a".repeat(64),
    eventType: "session_updated",
    expiresAt: "2026-09-07T00:01:00+00:00",
    kind: "ready",
    notificationId: NOTIFICATION_ID,
    outboxId: "9223372036854775806",
    p256dh: "p256dh-fixture",
    payload: {
      court: "青年公園網球場",
      message: "球局資訊已更新。",
      slots_remaining: 1,
      start_at: "2026-09-08T08:00:00+08:00",
      url: "/sessions/1",
    },
    pushTtlSafetyBudgetMs: "0",
    requestDeadlineMs: "5000",
    transportVersion: MAX_BIGINT,
    vapidFingerprintAlgorithm: "sha256-vapid-p256-uncompressed-v1",
    vapidFingerprintHex: "b".repeat(64),
    version: 1,
  };
}

function databaseFixture({ begin = beginResult(), prepare = preparedResult(), providerState = "accepted" } = {}) {
  const calls = [];
  let claimCount = 0;
  const database = {
    async beginWorker(generation) {
      calls.push(["begin", generation]);
      return begin;
    },
    async claimDelivery(workerToken) {
      calls.push(["claim", workerToken]);
      claimCount += 1;
      return claimCount === 1
        ? claimedResult()
        : { code: "no_ready_delivery", databaseNow: "2026-09-07T00:00:01+00:00", kind: "empty", version: 1 };
    },
    async finalizeOutbox(outboxId) {
      calls.push(["finalize", outboxId]);
      return {
        kind: "finalized",
        outboxId,
        outcome: providerState === "accepted" ? "completed" : "failed",
        outcomeAt: "2026-09-07T00:00:01+00:00",
        outcomeCode:
          providerState === "accepted" ? "deliveries_terminal_with_acceptance" : "deliveries_terminal_failed",
        version: 1,
      };
    },
    async finishWorker(workerToken, succeeded) {
      calls.push(["finish", workerToken, succeeded]);
      return {
        databaseNow: "2026-09-07T00:00:01+00:00",
        finishedAt: "2026-09-07T00:00:01+00:00",
        generation: MAX_BIGINT,
        kind: "finished",
        resultCode: succeeded ? "normal_exit" : "controlled_failure",
        state: succeeded ? "completed" : "failed",
        version: 1,
        workerToken,
      };
    },
    async withSendTransaction(values, operation) {
      calls.push(["transaction", values]);
      return operation({
        async complete(input) {
          calls.push(["complete", input]);
          return {
            code: providerState === "accepted" ? null : "provider_permanent",
            databaseNow: "2026-09-07T00:00:01+00:00",
            deliveryId: claimedResult().deliveryId,
            kind: "completed",
            outboxId: prepare.outboxId,
            state: providerState,
            version: 1,
          };
        },
        async prepare() {
          calls.push(["prepare"]);
          return prepare;
        },
      });
    },
  };
  return { calls, database };
}

test("v2 runtime is local-only and requires exact explicit generation and batch values", () => {
  const localValues = {
    NOTIFICATION_DISPATCH_V2_EXPECTED_GENERATION: MAX_BIGINT,
    NOTIFICATION_DISPATCH_V2_RUNTIME_MODE: "local-test-v1",
    NOTIFICATION_OUTBOX_BATCH_SIZE: "2",
  };
  assert.deepEqual(dispatcherV2RuntimeAccess(environment(localValues)), {
    hostedRuntime: false,
    localTestEnabled: true,
  });
  assert.deepEqual(readDispatcherV2LocalConfig(environment(localValues)), {
    batchSize: 2,
    expectedGeneration: MAX_BIGINT,
  });
  assert.deepEqual(
    dispatcherV2RuntimeAccess(environment({ ...localValues, SB_REGION: "local-marker-is-still-hosted" })),
    { hostedRuntime: true, localTestEnabled: false }
  );

  for (const overrides of [
    { NOTIFICATION_DISPATCH_V2_EXPECTED_GENERATION: "9223372036854775808" },
    { NOTIFICATION_DISPATCH_V2_EXPECTED_GENERATION: "01" },
    { NOTIFICATION_OUTBOX_BATCH_SIZE: "0" },
    { NOTIFICATION_OUTBOX_BATCH_SIZE: "101" },
    { NOTIFICATION_OUTBOX_BATCH_SIZE: " 2" },
  ]) {
    assert.throws(
      () => readDispatcherV2LocalConfig(environment({ ...localValues, ...overrides })),
      /DISPATCH_V2_RUNTIME_CONFIG_INVALID/u
    );
  }
});

test("accepted work stays on one transaction port and every database result is checked", async () => {
  const { calls, database } = databaseFixture();
  const sent = [];
  const result = await runDispatcherV2Batch({
    batchSize: 2,
    database,
    expectedGeneration: MAX_BIGINT,
    sendPrepared: async (prepared) => {
      sent.push(prepared);
      return {
        deliveryErrorCode: null,
        deliveryState: "accepted",
        kind: "accepted",
        logCode: "provider_accepted",
        nextAttemptAtMs: null,
        persistable: true,
        quarantineProvider: false,
        statusCode: 201,
      };
    },
  });

  assert.equal(sent.length, 1);
  assert.deepEqual(result, {
    accepted: 1,
    batchExhausted: false,
    cancelled: 0,
    claimed: 1,
    failed: 0,
    finalized: 1,
    kind: "completed",
    terminalized: 0,
    version: 1,
  });
  assert.deepEqual(calls, [
    ["begin", MAX_BIGINT],
    ["claim", WORKER_TOKEN],
    ["transaction", { claimToken: CLAIM_TOKEN, workerToken: WORKER_TOKEN }],
    ["prepare"],
    ["complete", { errorCode: null, nextAttemptAt: null, outcome: "accepted" }],
    ["finalize", "9223372036854775806"],
    ["claim", WORKER_TOKEN],
    ["finish", WORKER_TOKEN, true],
  ]);
});

test("a disabled database begin is a clean no-op without claim, sender, or finish", async () => {
  for (const code of ["dispatch_disabled", "runtime_mode_disabled"]) {
    const { calls, database } = databaseFixture({
      begin: {
        code,
        databaseNow: "2026-09-07T00:00:00+00:00",
        generation: MAX_BIGINT,
        kind: "disabled",
        version: 1,
      },
    });
    let sends = 0;
    assert.deepEqual(
      await runDispatcherV2Batch({
        batchSize: 2,
        database,
        expectedGeneration: MAX_BIGINT,
        sendPrepared: async () => {
          sends += 1;
          return { kind: "accepted" };
        },
      }),
      { kind: "disabled", version: 1 }
    );
    assert.equal(sends, 0);
    assert.deepEqual(calls, [["begin", MAX_BIGINT]]);
  }
});

test("disabled begin still rejects an incomplete or unknown database contract", async () => {
  for (const begin of [
    { code: "runtime_mode_disabled", generation: MAX_BIGINT, kind: "disabled", version: 1 },
    {
      code: "unknown_disabled_reason",
      databaseNow: "2026-09-07T00:00:00+00:00",
      generation: MAX_BIGINT,
      kind: "disabled",
      version: 1,
    },
  ]) {
    const { database } = databaseFixture({ begin });
    await assert.rejects(
      runDispatcherV2Batch({
        batchSize: 1,
        database,
        expectedGeneration: MAX_BIGINT,
        sendPrepared: async () => ({ kind: "accepted" }),
      }),
      /DISPATCH_V2_DATABASE_CONTRACT_INVALID/u
    );
  }
});

test("prepare cancellation commits without invoking a provider or completion command", async () => {
  const { calls, database } = databaseFixture({
    prepare: {
      code: "recipient_ineligible",
      deliveryId: MAX_BIGINT,
      kind: "cancelled",
      outboxId: "9223372036854775806",
      version: 1,
    },
  });
  let sends = 0;
  const result = await runDispatcherV2Batch({
    batchSize: 1,
    database,
    expectedGeneration: MAX_BIGINT,
    sendPrepared: async () => {
      sends += 1;
    },
  });
  assert.equal(sends, 0);
  assert.equal(result.cancelled, 1);
  assert.equal(
    calls.some(([name]) => name === "complete"),
    false
  );
  assert.deepEqual(calls.at(-1), ["finish", WORKER_TOKEN, true]);
});

test("non-persistable provider evidence fails closed and marks the worker failed", async () => {
  const { calls, database } = databaseFixture();
  await assert.rejects(
    runDispatcherV2Batch({
      batchSize: 1,
      database,
      expectedGeneration: MAX_BIGINT,
      sendPrepared: async () => ({ kind: "unknown", persistable: false }),
    }),
    /DISPATCH_V2_OUTCOME_POLICY_REQUIRED/u
  );
  assert.equal(
    calls.some(([name]) => name === "complete"),
    false
  );
  assert.deepEqual(calls.at(-1), ["finish", WORKER_TOKEN, false]);
});

test("a numeric bigint result is rejected before any send", async () => {
  const { calls, database } = databaseFixture();
  database.claimDelivery = async () => ({ ...claimedResult(), outboxId: Number.MAX_SAFE_INTEGER + 1 });
  await assert.rejects(
    runDispatcherV2Batch({
      batchSize: 1,
      database,
      expectedGeneration: MAX_BIGINT,
      sendPrepared: async () => assert.fail("send must not run"),
    }),
    /DISPATCH_V2_DATABASE_CONTRACT_INVALID/u
  );
  assert.deepEqual(calls.at(-1), ["finish", WORKER_TOKEN, false]);
});

test("cross-command identity drift is rejected before finalization", async () => {
  const prepareFixture = databaseFixture();
  prepareFixture.database.withSendTransaction = async (values, operation) => {
    prepareFixture.calls.push(["transaction", values]);
    return operation({
      complete: async () => assert.fail("completion must not run"),
      prepare: async () => ({ ...preparedResult(), outboxId: "8" }),
    });
  };
  await assert.rejects(
    runDispatcherV2Batch({
      batchSize: 1,
      database: prepareFixture.database,
      expectedGeneration: MAX_BIGINT,
      sendPrepared: async () => assert.fail("send must not run"),
    }),
    /DISPATCH_V2_PREPARE_CONTRACT_INVALID/u
  );
  assert.equal(
    prepareFixture.calls.some(([name]) => name === "finalize"),
    false
  );
  assert.deepEqual(prepareFixture.calls.at(-1), ["finish", WORKER_TOKEN, false]);

  const completionFixture = databaseFixture();
  completionFixture.database.withSendTransaction = async (values, operation) => {
    completionFixture.calls.push(["transaction", values]);
    return operation({
      complete: async () => ({
        code: null,
        databaseNow: "2026-09-07T00:00:01+00:00",
        deliveryId: MAX_BIGINT,
        kind: "completed",
        outboxId: "8",
        state: "accepted",
        version: 1,
      }),
      prepare: async () => preparedResult(),
    });
  };
  await assert.rejects(
    runDispatcherV2Batch({
      batchSize: 1,
      database: completionFixture.database,
      expectedGeneration: MAX_BIGINT,
      sendPrepared: async () => ({
        deliveryErrorCode: null,
        kind: "accepted",
        persistable: true,
      }),
    }),
    /DISPATCH_V2_COMPLETE_CONTRACT_INVALID/u
  );
  assert.equal(
    completionFixture.calls.some(([name]) => name === "finalize"),
    false
  );
  assert.deepEqual(completionFixture.calls.at(-1), ["finish", WORKER_TOKEN, false]);
});

test("local mock validates provider origin, computes evidence-only TTL, and never follows redirects", async () => {
  const requests = [];
  const sendPrepared = await createDispatcherV2LocalMockSender({
    fetchRef: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return new Response(null, { status: 201 });
    },
    mockUrl: "http://host.docker.internal:43210/push",
    serializedProviderOrigins: JSON.stringify([PROVIDER_ORIGIN]),
  });
  const outcome = await sendPrepared(preparedResult());
  assert.equal(outcome.kind, "accepted");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://host.docker.internal:43210/push");
  assert.equal(requests[0].options.redirect, "manual");
  assert.equal(requests[0].body.kind, "local-dispatch-fixture-v1");
  assert.equal(requests[0].body.notificationId, NOTIFICATION_ID);
  assert.equal(requests[0].body.consentEpoch, CONSENT_EPOCH);
  assert.equal(requests[0].body.ttlSeconds, 55);
  assert.equal(requests[0].body.payload.title, "球局資訊更新");

  await assert.rejects(
    sendPrepared({ ...preparedResult(), endpoint: "https://attacker.example/send/token" }),
    /DISPATCH_V2_MOCK_ENDPOINT_REJECTED/u
  );
});

test("mock configuration is exact and runtime errors never expose arbitrary text", () => {
  const values = {
    PUSH_PROVIDER_ORIGINS_V1: JSON.stringify([PROVIDER_ORIGIN]),
    PUSH_TEST_URL: "http://host.docker.internal:43210/push",
    WEB_PUSH_TRANSPORT: "mock",
  };
  assert.deepEqual(readDispatcherV2LocalMockConfig(environment(values)), {
    mockUrl: values.PUSH_TEST_URL,
    serializedProviderOrigins: values.PUSH_PROVIDER_ORIGINS_V1,
  });
  assert.throws(
    () => readDispatcherV2LocalMockConfig(environment({ ...values, PUSH_TEST_URL: "http://127.0.0.1:43210/push" })),
    /DISPATCH_V2_MOCK_CONFIG_INVALID/u
  );
  assert.equal(safeDispatcherV2RuntimeErrorCode(new Error("https://secret.example/token")), "DISPATCH_V2_FAILED");
  assert.equal(
    safeDispatcherV2RuntimeErrorCode(new Error("DISPATCH_V2_DATABASE_ROLE_INVALID")),
    "DISPATCH_V2_DATABASE_ROLE_INVALID"
  );
});

test("active source keeps every v2 transport local-only and legacy reads pinned to format 1", () => {
  assert.match(INDEX_SOURCE, /\.eq\("outbox_format_version", 1\)/u);
  assert.match(INDEX_SOURCE, /WEB_PUSH_TRANSPORT[\s\S]*WEB_PUSH_V2_TRANSPORT_FORBIDDEN/u);
  assert.match(INDEX_SOURCE, /deno-native-web-push-v1/u);
  assert.match(INDEX_SOURCE, /NOTIFICATION_DISPATCH_DATABASE_URL/u);
  assert.doesNotMatch(INDEX_SOURCE, /connectionString:\s*env\("SUPABASE_DB_URL"\)/u);
});
