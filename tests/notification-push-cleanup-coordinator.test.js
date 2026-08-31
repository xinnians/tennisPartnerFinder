import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotificationPushCleanupCoordinator,
  NotificationPushCleanupCoordinatorError,
  PUSH_CLEANUP_COORDINATOR_ERROR_CODES,
} from "../src/notificationPushCleanupCoordinator.ts";
import { FIXED_CLEANUP_TOKEN } from "./fixtures/pushCleanupPublicKeys.js";

const ATTEMPT = Object.freeze({ attemptId: "attempt-1", cleanupToken: FIXED_CLEANUP_TOKEN });

function assertSafeResult(result, kind) {
  assert.deepEqual(result, { kind });
  assert.deepEqual(Object.keys(result), ["kind"]);
  assert.equal(JSON.stringify(result).includes(FIXED_CLEANUP_TOKEN), false);
}

test("construction is dormant and rejects invalid ports with one fixed error", () => {
  let calls = 0;
  const coordinator = createNotificationPushCleanupCoordinator({
    storage: {
      completePendingPushCleanup: async () => {
        calls += 1;
        throw new Error("must stay dormant");
      },
    },
    transport: {
      sendPushCleanup: async () => {
        calls += 1;
        throw new Error("must stay dormant");
      },
    },
  });
  assert.equal(typeof coordinator.processPendingPushCleanup, "function");
  assert.equal(calls, 0);

  for (const options of [
    undefined,
    null,
    {},
    { storage: {}, transport: { sendPushCleanup: async () => ({ kind: "pending" }) } },
    { storage: { completePendingPushCleanup: async () => false }, transport: {} },
  ]) {
    assert.throws(
      () => createNotificationPushCleanupCoordinator(options),
      (error) => {
        assert.ok(error instanceof NotificationPushCleanupCoordinatorError);
        assert.equal(error.code, PUSH_CLEANUP_COORDINATOR_ERROR_CODES.INVALID_CONFIGURATION);
        assert.equal(error.message, PUSH_CLEANUP_COORDINATOR_ERROR_CODES.INVALID_CONFIGURATION);
        return true;
      }
    );
  }
});

test("an exact transport completion runs one exact local CAS and forwards the same signal", async () => {
  const calls = [];
  const abortController = new AbortController();
  const coordinator = createNotificationPushCleanupCoordinator({
    storage: {
      completePendingPushCleanup: async (attempt) => {
        calls.push(["storage", attempt]);
        return true;
      },
    },
    transport: {
      sendPushCleanup: async (input) => {
        calls.push(["transport", input]);
        abortController.abort();
        return { kind: "completed" };
      },
    },
  });

  const result = await coordinator.processPendingPushCleanup({
    attempt: ATTEMPT,
    signal: abortController.signal,
  });
  assertSafeResult(result, "completed");
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], "transport");
  assert.deepEqual(calls[0][1], { cleanupToken: FIXED_CLEANUP_TOKEN, signal: abortController.signal });
  assert.equal(calls[0][1].signal, abortController.signal);
  assert.equal(abortController.signal.aborted, true);
  assert.equal(calls[1][0], "storage");
  assert.equal(calls[1][1], ATTEMPT);
});

test("a pending transport result never touches storage or retries", async () => {
  let transportCalls = 0;
  let storageCalls = 0;
  const abortController = new AbortController();
  abortController.abort();
  const coordinator = createNotificationPushCleanupCoordinator({
    storage: {
      completePendingPushCleanup: async () => {
        storageCalls += 1;
        return true;
      },
    },
    transport: {
      sendPushCleanup: async (input) => {
        transportCalls += 1;
        assert.equal(input.signal, abortController.signal);
        return { kind: "pending" };
      },
    },
  });

  const result = await coordinator.processPendingPushCleanup({
    attempt: ATTEMPT,
    signal: abortController.signal,
  });
  assertSafeResult(result, "pending");
  assert.equal(transportCalls, 1);
  assert.equal(storageCalls, 0);
});

test("invalid input, transport drift, and transport errors stay pending without local completion", async () => {
  const cases = [
    { name: "null", response: null },
    { name: "undefined", response: undefined },
    { name: "empty", response: {} },
    { name: "unknown", response: { kind: "unknown" } },
    { name: "completed with extra data", response: { detail: FIXED_CLEANUP_TOKEN, kind: "completed" } },
    { name: "primitive", response: "completed" },
  ];

  for (const { name, response } of cases) {
    let transportCalls = 0;
    let storageCalls = 0;
    const coordinator = createNotificationPushCleanupCoordinator({
      storage: {
        completePendingPushCleanup: async () => {
          storageCalls += 1;
          return true;
        },
      },
      transport: {
        sendPushCleanup: async () => {
          transportCalls += 1;
          return response;
        },
      },
    });
    const result = await coordinator.processPendingPushCleanup({ attempt: ATTEMPT });
    assertSafeResult(result, "pending");
    assert.equal(transportCalls, 1, name);
    assert.equal(storageCalls, 0, name);
  }

  let thrownCalls = 0;
  let thrownStorageCalls = 0;
  const throwingCoordinator = createNotificationPushCleanupCoordinator({
    storage: {
      completePendingPushCleanup: async () => {
        thrownStorageCalls += 1;
        return true;
      },
    },
    transport: {
      sendPushCleanup: async () => {
        thrownCalls += 1;
        throw new Error(`private transport detail:${FIXED_CLEANUP_TOKEN}`);
      },
    },
  });
  assertSafeResult(await throwingCoordinator.processPendingPushCleanup({ attempt: ATTEMPT }), "pending");
  assert.equal(thrownCalls, 1);
  assert.equal(thrownStorageCalls, 0);

  let invalidCalls = 0;
  let invalidStorageCalls = 0;
  const invalidCoordinator = createNotificationPushCleanupCoordinator({
    storage: {
      completePendingPushCleanup: async () => {
        invalidStorageCalls += 1;
        return true;
      },
    },
    transport: {
      sendPushCleanup: async () => {
        invalidCalls += 1;
        return { kind: "completed" };
      },
    },
  });
  assertSafeResult(await invalidCoordinator.processPendingPushCleanup(), "pending");
  assertSafeResult(await invalidCoordinator.processPendingPushCleanup(null), "pending");
  for (const attempt of [undefined, null, [], {}, { cleanupToken: 1 }]) {
    assertSafeResult(await invalidCoordinator.processPendingPushCleanup({ attempt }), "pending");
  }
  assert.equal(invalidCalls, 0);
  assert.equal(invalidStorageCalls, 0);
});

test("an already-absent exact attempt is an idempotent completion only for that input attempt", async () => {
  let transportCalls = 0;
  let storageCalls = 0;
  const coordinator = createNotificationPushCleanupCoordinator({
    storage: {
      completePendingPushCleanup: async (attempt) => {
        storageCalls += 1;
        assert.equal(attempt, ATTEMPT);
        return false;
      },
    },
    transport: {
      sendPushCleanup: async () => {
        transportCalls += 1;
        return { kind: "completed" };
      },
    },
  });

  assertSafeResult(await coordinator.processPendingPushCleanup({ attempt: ATTEMPT }), "completed");
  assert.equal(transportCalls, 1);
  assert.equal(storageCalls, 1);
});

test("a local completion error or contract drift stays pending without a second transport call", async () => {
  const cases = [
    { name: "undefined", run: async () => undefined },
    { name: "null", run: async () => null },
    {
      name: "throw",
      run: async () => {
        throw new Error(`private storage detail:${FIXED_CLEANUP_TOKEN}`);
      },
    },
  ];

  for (const { name, run } of cases) {
    let transportCalls = 0;
    let storageCalls = 0;
    const coordinator = createNotificationPushCleanupCoordinator({
      storage: {
        completePendingPushCleanup: async () => {
          storageCalls += 1;
          return run();
        },
      },
      transport: {
        sendPushCleanup: async () => {
          transportCalls += 1;
          return { kind: "completed" };
        },
      },
    });

    const result = await coordinator.processPendingPushCleanup({ attempt: ATTEMPT });
    assertSafeResult(result, "pending");
    assert.equal(transportCalls, 1, name);
    assert.equal(storageCalls, 1, name);
  }
});
