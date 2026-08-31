import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotificationPushAuthFailureCoordinator,
  NotificationPushAuthFailureCoordinatorError,
  PUSH_AUTH_FAILURE_COORDINATOR_ERROR_CODES,
} from "../src/notificationPushAuthFailureCoordinator.ts";
import { decodeCanonicalCleanupToken } from "../supabase/functions/_shared/push-cleanup-protocol.js";
import { FIXED_CLEANUP_TOKEN } from "./fixtures/pushCleanupPublicKeys.js";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_AUTH_USER_ID = "99999999-9999-4999-8999-999999999999";
const DEVICE_ID = "55555555-5555-4555-8555-555555555555";
const SUSPENDED_REVISION = "66666666-6666-4666-8666-666666666666";
const SERVER_CONSENT = Object.freeze({
  consentEpoch: "77777777-7777-4777-8777-777777777777",
  consentId: "9223372036854775807",
  consentVersion: "9223372036854775807",
});
const OTHER_SERVER_CONSENT = Object.freeze({
  ...SERVER_CONSENT,
  consentVersion: "1",
});
const BINDING = Object.freeze({
  authUserId: AUTH_USER_ID,
  bindingId: "22222222-2222-4222-8222-222222222222",
  deviceId: DEVICE_ID,
  localRevision: "33333333-3333-4333-8333-333333333333",
  serverConsent: SERVER_CONSENT,
  state: "enabled",
});
const ATTEMPT = Object.freeze({
  attemptId: "44444444-4444-4444-8444-444444444444",
  authUserId: AUTH_USER_ID,
  bindingId: BINDING.bindingId,
  bindingRevision: SUSPENDED_REVISION,
  cleanupToken: FIXED_CLEANUP_TOKEN,
  deviceId: DEVICE_ID,
  reason: "auth_rejected",
  schemaVersion: 1,
  serverConsent: SERVER_CONSENT,
});

function bindingForState(state) {
  if (state === "auth-unverified") return Object.freeze({ ...BINDING, reason: "auth_unavailable", state });
  if (state === "cleanup-required") return Object.freeze({ ...BINDING, reason: "user_logout", state });
  if (state === "provisioning") return Object.freeze({ ...BINDING, serverConsent: null, state });
  return Object.freeze({ ...BINDING, state });
}

function suspendedState(binding, state, reason) {
  return {
    authUserId: binding.authUserId,
    bindingId: binding.bindingId,
    deviceId: binding.deviceId,
    localRevision: SUSPENDED_REVISION,
    reason,
    serverConsent: binding.serverConsent,
    state,
  };
}

function assertSafeResult(result, kind) {
  assert.deepEqual(result, { kind });
  assert.deepEqual(Object.keys(result), ["kind"]);
  assert.equal(JSON.stringify(result).includes(FIXED_CLEANUP_TOKEN), false);
}

test("construction is dormant and rejects invalid ports with one fixed error", () => {
  let calls = 0;
  const coordinator = createNotificationPushAuthFailureCoordinator({
    cleanup: {
      processPendingPushCleanup: async () => {
        calls += 1;
        throw new Error("must stay dormant");
      },
    },
    storage: {
      suspendCurrentPushBinding: async () => {
        calls += 1;
        throw new Error("must stay dormant");
      },
    },
  });
  assert.equal(typeof coordinator.processAuthFailure, "function");
  assert.equal(calls, 0);

  for (const options of [
    undefined,
    null,
    {},
    { cleanup: {}, storage: { suspendCurrentPushBinding: async () => ({ attempt: null, state: {} }) } },
    { cleanup: { processPendingPushCleanup: async () => ({ kind: "pending" }) }, storage: {} },
  ]) {
    assert.throws(
      () => createNotificationPushAuthFailureCoordinator(options),
      (error) => {
        assert.ok(error instanceof NotificationPushAuthFailureCoordinatorError);
        assert.equal(error.code, PUSH_AUTH_FAILURE_COORDINATOR_ERROR_CODES.INVALID_CONFIGURATION);
        assert.equal(error.message, PUSH_AUTH_FAILURE_COORDINATOR_ERROR_CODES.INVALID_CONFIGURATION);
        return true;
      }
    );
  }
});

test("unavailable auth only closes the matching local binding and never starts cleanup", async () => {
  for (const state of ["enabled", "provisioning", "auth-unverified"]) {
    const calls = [];
    const binding = bindingForState(state);
    const coordinator = createNotificationPushAuthFailureCoordinator({
      cleanup: {
        processPendingPushCleanup: async () => {
          calls.push(["cleanup"]);
          return { kind: "completed" };
        },
      },
      storage: {
        suspendCurrentPushBinding: async (input) => {
          calls.push(["storage", input]);
          return { attempt: null, state: suspendedState(binding, "auth-unverified", "auth_unavailable") };
        },
      },
    });

    const result = await coordinator.processAuthFailure({ authUserId: AUTH_USER_ID, binding, kind: "unavailable" });
    assertSafeResult(result, "local-closed");
    assert.deepEqual(calls, [
      [
        "storage",
        {
          authUserId: AUTH_USER_ID,
          bindingId: BINDING.bindingId,
          expectedLocalRevision: BINDING.localRevision,
          reason: "auth_unavailable",
        },
      ],
    ]);
  }

  let calls = 0;
  const coordinator = createNotificationPushAuthFailureCoordinator({
    cleanup: {
      processPendingPushCleanup: async () => {
        calls += 1;
        return { kind: "completed" };
      },
    },
    storage: {
      suspendCurrentPushBinding: async () => {
        calls += 1;
        return { attempt: null, state: {} };
      },
    },
  });
  assertSafeResult(
    await coordinator.processAuthFailure({
      authUserId: AUTH_USER_ID,
      binding: bindingForState("cleanup-required"),
      kind: "unavailable",
    }),
    "pending"
  );
  assert.equal(calls, 0);
});

test("rejected auth queues the matching binding and gives the exact attempt and signal to cleanup once", async () => {
  for (const state of ["enabled", "provisioning", "auth-unverified", "cleanup-required"]) {
    const calls = [];
    const abortController = new AbortController();
    const binding = bindingForState(state);
    const reason = state === "cleanup-required" ? binding.reason : "auth_rejected";
    const attempt = Object.freeze({ ...ATTEMPT, reason, serverConsent: binding.serverConsent });
    const coordinator = createNotificationPushAuthFailureCoordinator({
      cleanup: {
        processPendingPushCleanup: async (input) => {
          calls.push(["cleanup", input]);
          return { kind: "completed" };
        },
      },
      storage: {
        suspendCurrentPushBinding: async (input) => {
          calls.push(["storage", input]);
          return { attempt, state: suspendedState(binding, "cleanup-required", reason) };
        },
      },
    });

    const result = await coordinator.processAuthFailure({
      authUserId: AUTH_USER_ID,
      binding,
      kind: "rejected",
      signal: abortController.signal,
    });
    assertSafeResult(result, "cleanup-completed");
    assert.deepEqual(calls[0], [
      "storage",
      {
        authUserId: AUTH_USER_ID,
        bindingId: BINDING.bindingId,
        expectedLocalRevision: BINDING.localRevision,
        reason: "auth_rejected",
      },
    ]);
    assert.equal(calls[1][0], "cleanup");
    assert.equal(calls[1][1].attempt, attempt);
    assert.equal(calls[1][1].signal, abortController.signal);
    assert.equal(calls.length, 2);
  }
});

test("missing owner correlation or an unknown snapshot stays pending without touching either port", async () => {
  let calls = 0;
  const coordinator = createNotificationPushAuthFailureCoordinator({
    cleanup: {
      processPendingPushCleanup: async () => {
        calls += 1;
        return { kind: "completed" };
      },
    },
    storage: {
      suspendCurrentPushBinding: async () => {
        calls += 1;
        return { attempt: ATTEMPT, state: {} };
      },
    },
  });

  const bindingWithSymbol = { ...BINDING };
  bindingWithSymbol[Symbol("private")] = FIXED_CLEANUP_TOKEN;
  const inputWithSymbol = { authUserId: AUTH_USER_ID, binding: BINDING, kind: "rejected" };
  inputWithSymbol[Symbol("private")] = FIXED_CLEANUP_TOKEN;

  for (const input of [
    undefined,
    null,
    {},
    { authUserId: "", binding: BINDING, kind: "rejected" },
    { authUserId: OTHER_AUTH_USER_ID, binding: BINDING, kind: "rejected" },
    { authUserId: AUTH_USER_ID, binding: null, kind: "rejected" },
    { authUserId: AUTH_USER_ID, binding: { ...BINDING, bindingId: null }, kind: "rejected" },
    { authUserId: AUTH_USER_ID, binding: { ...BINDING, localRevision: null }, kind: "rejected" },
    { authUserId: AUTH_USER_ID, binding: { ...BINDING, cleanupToken: FIXED_CLEANUP_TOKEN }, kind: "rejected" },
    { authUserId: AUTH_USER_ID, binding: { ...BINDING, serverConsent: null }, kind: "rejected" },
    {
      authUserId: AUTH_USER_ID,
      binding: { ...bindingForState("provisioning"), serverConsent: SERVER_CONSENT },
      kind: "rejected",
    },
    { authUserId: AUTH_USER_ID, binding: bindingWithSymbol, kind: "rejected" },
    { authUserId: AUTH_USER_ID, binding: { ...BINDING, state: "disabled" }, kind: "rejected" },
    { authUserId: AUTH_USER_ID, binding: BINDING, kind: "anonymous" },
    { authUserId: AUTH_USER_ID, binding: BINDING, detail: FIXED_CLEANUP_TOKEN, kind: "rejected" },
    inputWithSymbol,
  ]) {
    assertSafeResult(await coordinator.processAuthFailure(input), "pending");
  }
  assert.equal(calls, 0);
});

test("storage errors or suspension contract drift stay pending without cleanup", async () => {
  const rejectedState = suspendedState(BINDING, "cleanup-required", "auth_rejected");
  const attemptWithSymbol = { ...ATTEMPT };
  attemptWithSymbol[Symbol("private")] = FIXED_CLEANUP_TOKEN;
  const responseWithSymbol = { attempt: ATTEMPT, state: rejectedState };
  responseWithSymbol[Symbol("private")] = FIXED_CLEANUP_TOKEN;
  const cases = [
    { name: "undefined", run: async () => undefined },
    { name: "null", run: async () => null },
    { name: "missing state", run: async () => ({ attempt: ATTEMPT }) },
    {
      name: "extra top-level data",
      run: async () => ({ attempt: ATTEMPT, detail: FIXED_CLEANUP_TOKEN, state: rejectedState }),
    },
    { name: "symbol top-level data", run: async () => responseWithSymbol },
    { name: "primitive attempt", run: async () => ({ attempt: FIXED_CLEANUP_TOKEN, state: {} }) },
    {
      name: "missing attempt schema version",
      run: async () => {
        const { schemaVersion, ...attempt } = ATTEMPT;
        assert.equal(schemaVersion, 1);
        return { attempt, state: rejectedState };
      },
    },
    {
      name: "extra attempt data",
      run: async () => ({ attempt: { ...ATTEMPT, detail: FIXED_CLEANUP_TOKEN }, state: rejectedState }),
    },
    { name: "symbol attempt data", run: async () => ({ attempt: attemptWithSymbol, state: rejectedState }) },
    {
      name: "invalid attempt token",
      run: async () => ({ attempt: { ...ATTEMPT, cleanupToken: "not-canonical" }, state: rejectedState }),
    },
    {
      name: "non-canonical 43-character attempt token",
      run: async () => ({
        attempt: { ...ATTEMPT, cleanupToken: `${FIXED_CLEANUP_TOKEN.slice(0, -1)}x` },
        state: rejectedState,
      }),
    },
    {
      name: "wrong attempt owner",
      run: async () => ({ attempt: { ...ATTEMPT, authUserId: OTHER_AUTH_USER_ID }, state: rejectedState }),
    },
    {
      name: "wrong attempt binding",
      run: async () => ({
        attempt: { ...ATTEMPT, bindingId: "88888888-8888-4888-8888-888888888888" },
        state: rejectedState,
      }),
    },
    {
      name: "wrong attempt revision",
      run: async () => ({
        attempt: { ...ATTEMPT, bindingRevision: "88888888-8888-4888-8888-888888888888" },
        state: rejectedState,
      }),
    },
    {
      name: "wrong attempt device",
      run: async () => ({
        attempt: { ...ATTEMPT, deviceId: "88888888-8888-4888-8888-888888888888" },
        state: rejectedState,
      }),
    },
    {
      name: "wrong attempt reason",
      run: async () => ({ attempt: { ...ATTEMPT, reason: "user_logout" }, state: rejectedState }),
    },
    {
      name: "state consent drift",
      run: async () => ({
        attempt: { ...ATTEMPT, serverConsent: OTHER_SERVER_CONSENT },
        state: { ...rejectedState, serverConsent: OTHER_SERVER_CONSENT },
      }),
    },
    {
      name: "attempt consent drift",
      run: async () => ({ attempt: { ...ATTEMPT, serverConsent: OTHER_SERVER_CONSENT }, state: rejectedState }),
    },
    {
      name: "throw",
      run: async () => {
        throw new Error(`private storage detail:${FIXED_CLEANUP_TOKEN}`);
      },
    },
  ];

  for (const { name, run } of cases) {
    let storageCalls = 0;
    let cleanupCalls = 0;
    const coordinator = createNotificationPushAuthFailureCoordinator({
      cleanup: {
        processPendingPushCleanup: async () => {
          cleanupCalls += 1;
          return { kind: "completed" };
        },
      },
      storage: {
        suspendCurrentPushBinding: async () => {
          storageCalls += 1;
          return run();
        },
      },
    });
    const result = await coordinator.processAuthFailure({
      authUserId: AUTH_USER_ID,
      binding: BINDING,
      kind: "rejected",
    });
    assertSafeResult(result, "pending");
    assert.equal(storageCalls, 1, name);
    assert.equal(cleanupCalls, 0, name);
  }
});

test("attempt token acceptance matches the canonical shared protocol for every final base64url character", async () => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const state = suspendedState(BINDING, "cleanup-required", "auth_rejected");

  for (const finalCharacter of alphabet) {
    const cleanupToken = `${FIXED_CLEANUP_TOKEN.slice(0, -1)}${finalCharacter}`;
    const decoded = decodeCanonicalCleanupToken(cleanupToken);
    const expectedCleanupCalls = decoded ? 1 : 0;
    decoded?.fill(0);
    let cleanupCalls = 0;
    const coordinator = createNotificationPushAuthFailureCoordinator({
      cleanup: {
        processPendingPushCleanup: async () => {
          cleanupCalls += 1;
          return { kind: "pending" };
        },
      },
      storage: {
        suspendCurrentPushBinding: async () => ({
          attempt: { ...ATTEMPT, cleanupToken },
          state,
        }),
      },
    });

    assertSafeResult(
      await coordinator.processAuthFailure({ authUserId: AUTH_USER_ID, binding: BINDING, kind: "rejected" }),
      "pending"
    );
    assert.equal(cleanupCalls, expectedCleanupCalls, finalCharacter);
  }
});

test("unavailable auth requires an exact local suspension and never sends contract drift", async () => {
  const validState = suspendedState(BINDING, "auth-unverified", "auth_unavailable");
  const stateWithSymbol = { ...validState };
  stateWithSymbol[Symbol("private")] = FIXED_CLEANUP_TOKEN;
  const cases = [
    { name: "non-null attempt", response: { attempt: ATTEMPT, state: validState } },
    { name: "missing state fields", response: { attempt: null, state: { state: "auth-unverified" } } },
    {
      name: "wrong owner",
      response: { attempt: null, state: { ...validState, authUserId: OTHER_AUTH_USER_ID } },
    },
    { name: "wrong binding", response: { attempt: null, state: { ...validState, bindingId: "wrong" } } },
    { name: "wrong reason", response: { attempt: null, state: { ...validState, reason: "auth_rejected" } } },
    {
      name: "wrong consent",
      response: { attempt: null, state: { ...validState, serverConsent: OTHER_SERVER_CONSENT } },
    },
    { name: "extra state data", response: { attempt: null, state: { ...validState, detail: FIXED_CLEANUP_TOKEN } } },
    { name: "symbol state data", response: { attempt: null, state: stateWithSymbol } },
  ];

  for (const { name, response } of cases) {
    let cleanupCalls = 0;
    const coordinator = createNotificationPushAuthFailureCoordinator({
      cleanup: {
        processPendingPushCleanup: async () => {
          cleanupCalls += 1;
          return { kind: "completed" };
        },
      },
      storage: { suspendCurrentPushBinding: async () => response },
    });

    assertSafeResult(
      await coordinator.processAuthFailure({ authUserId: AUTH_USER_ID, binding: BINDING, kind: "unavailable" }),
      "pending"
    );
    assert.equal(cleanupCalls, 0, name);
  }
});

test("cleanup pending, drift, or errors stay pending without a second storage or cleanup call", async () => {
  const cases = [
    { name: "pending", run: async () => ({ kind: "pending" }) },
    { name: "undefined", run: async () => undefined },
    { name: "extra completed data", run: async () => ({ detail: FIXED_CLEANUP_TOKEN, kind: "completed" }) },
    {
      name: "throw",
      run: async () => {
        throw new Error(`private cleanup detail:${FIXED_CLEANUP_TOKEN}`);
      },
    },
  ];

  for (const { name, run } of cases) {
    let storageCalls = 0;
    let cleanupCalls = 0;
    const coordinator = createNotificationPushAuthFailureCoordinator({
      cleanup: {
        processPendingPushCleanup: async (input) => {
          cleanupCalls += 1;
          assert.equal(input.attempt, ATTEMPT);
          return run();
        },
      },
      storage: {
        suspendCurrentPushBinding: async () => {
          storageCalls += 1;
          return {
            attempt: ATTEMPT,
            state: suspendedState(BINDING, "cleanup-required", "auth_rejected"),
          };
        },
      },
    });

    const result = await coordinator.processAuthFailure({
      authUserId: AUTH_USER_ID,
      binding: BINDING,
      kind: "rejected",
    });
    assertSafeResult(result, "pending");
    assert.equal(storageCalls, 1, name);
    assert.equal(cleanupCalls, 1, name);
  }
});
