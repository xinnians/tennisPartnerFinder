import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotificationPushSignOutCoordinator,
  NotificationPushSignOutCoordinatorError,
  PUSH_SIGN_OUT_COORDINATOR_ERROR_CODES,
} from "../src/notificationPushSignOutCoordinator.ts";
import { FIXED_CLEANUP_TOKEN } from "./fixtures/pushCleanupPublicKeys.js";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_AUTH_USER_ID = "99999999-9999-4999-8999-999999999999";
const DEVICE_ID = "55555555-5555-4555-8555-555555555555";
const SERVER_CONSENT = Object.freeze({
  consentEpoch: "77777777-7777-4777-8777-777777777777",
  consentId: "9223372036854775807",
  consentVersion: "9223372036854775807",
});
const BINDING = Object.freeze({
  authUserId: AUTH_USER_ID,
  bindingId: "22222222-2222-4222-8222-222222222222",
  deviceId: DEVICE_ID,
  localRevision: "33333333-3333-4333-8333-333333333333",
  serverConsent: SERVER_CONSENT,
  state: "enabled",
});
const SUSPENDED_REVISION = "66666666-6666-4666-8666-666666666666";
const ATTEMPT = Object.freeze({
  attemptId: "44444444-4444-4444-8444-444444444444",
  authUserId: AUTH_USER_ID,
  bindingId: BINDING.bindingId,
  bindingRevision: SUSPENDED_REVISION,
  cleanupToken: FIXED_CLEANUP_TOKEN,
  deviceId: DEVICE_ID,
  reason: "user_logout",
  schemaVersion: 1,
  serverConsent: SERVER_CONSENT,
});

function suspendedState(binding = BINDING, reason = "user_logout") {
  return {
    authUserId: binding.authUserId,
    bindingId: binding.bindingId,
    deviceId: binding.deviceId,
    localRevision: SUSPENDED_REVISION,
    reason,
    serverConsent: binding.serverConsent,
    state: "cleanup-required",
  };
}

function ports(overrides = {}) {
  return {
    browser: {
      deactivateCurrentSubscription: async () => ({ kind: "absent" }),
      ...overrides.browser,
    },
    cleanup: {
      processPendingPushCleanup: async () => ({ kind: "pending" }),
      ...overrides.cleanup,
    },
    owner: {
      quarantineOwnedPushDevice: async () => ({ kind: "completed" }),
      ...overrides.owner,
    },
    storage: {
      completePendingPushCleanup: async () => true,
      suspendCurrentPushBinding: async () => ({ attempt: ATTEMPT, state: suspendedState() }),
      ...overrides.storage,
    },
  };
}

function assertSafeResult(result, kind) {
  assert.deepEqual(result, { kind });
  assert.deepEqual(Object.keys(result), ["kind"]);
  assert.equal(JSON.stringify(result).includes(FIXED_CLEANUP_TOKEN), false);
  assert.equal(JSON.stringify(result).includes("push.example"), false);
}

test("construction is dormant and rejects incomplete ports with one fixed error", () => {
  let calls = 0;
  const coordinator = createNotificationPushSignOutCoordinator(
    ports({
      browser: { deactivateCurrentSubscription: async () => (calls += 1) },
      cleanup: { processPendingPushCleanup: async () => (calls += 1) },
      owner: { quarantineOwnedPushDevice: async () => (calls += 1) },
      storage: {
        completePendingPushCleanup: async () => (calls += 1),
        suspendCurrentPushBinding: async () => (calls += 1),
      },
    })
  );
  assert.equal(typeof coordinator.processCurrentDeviceSignOut, "function");
  assert.equal(calls, 0);

  for (const options of [undefined, null, {}, { ...ports(), browser: {} }, { ...ports(), cleanup: {} }]) {
    assert.throws(
      () => createNotificationPushSignOutCoordinator(options),
      (error) => {
        assert.ok(error instanceof NotificationPushSignOutCoordinatorError);
        assert.equal(error.code, PUSH_SIGN_OUT_COORDINATOR_ERROR_CODES.INVALID_CONFIGURATION);
        assert.equal(error.message, PUSH_SIGN_OUT_COORDINATOR_ERROR_CODES.INVALID_CONFIGURATION);
        return true;
      }
    );
  }
});

test("an enabled binding is durably queued, owner-quarantined, locally completed, then browser-deactivated", async () => {
  const calls = [];
  const coordinator = createNotificationPushSignOutCoordinator(
    ports({
      browser: {
        deactivateCurrentSubscription: async () => {
          calls.push("browser");
          return {
            captured: { endpoint: "https://push.example/private", unsubscribe: async () => true },
            evidence: "deactivation-started",
            kind: "deactivated",
          };
        },
      },
      cleanup: {
        processPendingPushCleanup: async () => {
          calls.push("token-cleanup");
          return { kind: "completed" };
        },
      },
      owner: {
        quarantineOwnedPushDevice: async (input) => {
          calls.push(["owner", input]);
          return { kind: "completed" };
        },
      },
      storage: {
        completePendingPushCleanup: async (attempt) => {
          calls.push(["local-complete", attempt]);
          return true;
        },
        suspendCurrentPushBinding: async (input) => {
          calls.push(["suspend", input]);
          return { attempt: ATTEMPT, state: suspendedState() };
        },
      },
    })
  );

  assertSafeResult(
    await coordinator.processCurrentDeviceSignOut({ authUserId: AUTH_USER_ID, binding: BINDING }),
    "completed"
  );
  assert.deepEqual(calls, [
    [
      "suspend",
      {
        authUserId: AUTH_USER_ID,
        bindingId: BINDING.bindingId,
        expectedLocalRevision: BINDING.localRevision,
        reason: "user_logout",
      },
    ],
    [
      "owner",
      {
        consentEpoch: SERVER_CONSENT.consentEpoch,
        consentVersion: SERVER_CONSENT.consentVersion,
        deviceId: DEVICE_ID,
      },
    ],
    ["local-complete", ATTEMPT],
    "browser",
  ]);
});

test("owner stale or pending uses the durable token fallback exactly once before browser deactivation", async (t) => {
  for (const ownerKind of ["stale", "pending"]) {
    await t.test(ownerKind, async () => {
      const calls = [];
      const abortController = new AbortController();
      const coordinator = createNotificationPushSignOutCoordinator(
        ports({
          browser: {
            deactivateCurrentSubscription: async () => {
              calls.push("browser");
              return { kind: "unknown" };
            },
          },
          cleanup: {
            processPendingPushCleanup: async (input) => {
              calls.push(["token-cleanup", input]);
              return { kind: "completed" };
            },
          },
          owner: {
            quarantineOwnedPushDevice: async () => {
              calls.push("owner");
              return { kind: ownerKind };
            },
          },
          storage: {
            suspendCurrentPushBinding: async () => {
              calls.push("suspend");
              return { attempt: ATTEMPT, state: suspendedState() };
            },
          },
        })
      );

      assertSafeResult(
        await coordinator.processCurrentDeviceSignOut({
          authUserId: AUTH_USER_ID,
          binding: BINDING,
          signal: abortController.signal,
        }),
        "completed"
      );
      assert.deepEqual(
        calls.slice(0, 3).map((call) => (Array.isArray(call) ? call[0] : call)),
        ["suspend", "owner", "token-cleanup"]
      );
      assert.equal(calls[2][1].attempt, ATTEMPT);
      assert.equal(calls[2][1].signal, abortController.signal);
      assert.equal(calls[3], "browser");
    });
  }
});

test("a provisioning binding skips owner RPC and cleans its token attempt before browser deactivation", async () => {
  const binding = Object.freeze({ ...BINDING, serverConsent: null, state: "provisioning" });
  const attempt = Object.freeze({ ...ATTEMPT, serverConsent: null });
  const calls = [];
  const coordinator = createNotificationPushSignOutCoordinator(
    ports({
      browser: {
        deactivateCurrentSubscription: async () => {
          calls.push("browser");
          return { kind: "absent" };
        },
      },
      cleanup: {
        processPendingPushCleanup: async () => {
          calls.push("token-cleanup");
          return { kind: "completed" };
        },
      },
      owner: {
        quarantineOwnedPushDevice: async () => {
          calls.push("owner");
          return { kind: "completed" };
        },
      },
      storage: {
        suspendCurrentPushBinding: async () => {
          calls.push("suspend");
          return { attempt, state: suspendedState(binding) };
        },
      },
    })
  );

  assertSafeResult(await coordinator.processCurrentDeviceSignOut({ authUserId: AUTH_USER_ID, binding }), "completed");
  assert.deepEqual(calls, ["suspend", "token-cleanup", "browser"]);
});

test("an existing cleanup reason is preserved instead of being relabelled as logout", async () => {
  const binding = Object.freeze({ ...BINDING, reason: "auth_rejected", state: "cleanup-required" });
  const attempt = Object.freeze({ ...ATTEMPT, reason: "auth_rejected" });
  let cleanupAttempt;
  const coordinator = createNotificationPushSignOutCoordinator(
    ports({
      cleanup: {
        processPendingPushCleanup: async ({ attempt: value }) => {
          cleanupAttempt = value;
          return { kind: "pending" };
        },
      },
      owner: { quarantineOwnedPushDevice: async () => ({ kind: "stale" }) },
      storage: {
        suspendCurrentPushBinding: async () => ({
          attempt,
          state: suspendedState(binding, "auth_rejected"),
        }),
      },
    })
  );

  assertSafeResult(await coordinator.processCurrentDeviceSignOut({ authUserId: AUTH_USER_ID, binding }), "pending");
  assert.equal(cleanupAttempt, attempt);
});

test("storage drift cannot reach token cleanup, but a valid owner snapshot still attempts server closure", async () => {
  const calls = [];
  const coordinator = createNotificationPushSignOutCoordinator(
    ports({
      browser: {
        deactivateCurrentSubscription: async () => {
          calls.push("browser");
          throw new Error(`private browser detail:${FIXED_CLEANUP_TOKEN}`);
        },
      },
      cleanup: {
        processPendingPushCleanup: async () => {
          calls.push("token-cleanup");
          return { kind: "completed" };
        },
      },
      owner: {
        quarantineOwnedPushDevice: async () => {
          calls.push("owner");
          return { kind: "completed" };
        },
      },
      storage: {
        completePendingPushCleanup: async () => {
          calls.push("local-complete");
          return true;
        },
        suspendCurrentPushBinding: async () => {
          calls.push("suspend");
          return { attempt: { ...ATTEMPT, cleanupToken: "invalid" }, state: suspendedState() };
        },
      },
    })
  );

  assertSafeResult(
    await coordinator.processCurrentDeviceSignOut({ authUserId: AUTH_USER_ID, binding: BINDING }),
    "pending"
  );
  assert.deepEqual(calls, ["suspend", "owner", "browser"]);
});

test("owner errors keep the exact attempt for one token fallback and browser failures do not erase completion", async () => {
  const calls = [];
  const coordinator = createNotificationPushSignOutCoordinator(
    ports({
      browser: {
        deactivateCurrentSubscription: async () => {
          calls.push("browser");
          throw new Error("browser unavailable");
        },
      },
      cleanup: {
        processPendingPushCleanup: async () => {
          calls.push("token-cleanup");
          return { kind: "completed" };
        },
      },
      owner: {
        quarantineOwnedPushDevice: async () => {
          calls.push("owner");
          throw new Error("owner unavailable");
        },
      },
      storage: {
        suspendCurrentPushBinding: async () => {
          calls.push("suspend");
          return { attempt: ATTEMPT, state: suspendedState() };
        },
      },
    })
  );

  assertSafeResult(
    await coordinator.processCurrentDeviceSignOut({ authUserId: AUTH_USER_ID, binding: BINDING }),
    "completed"
  );
  assert.deepEqual(calls, ["suspend", "owner", "token-cleanup", "browser"]);
});

test("invalid identity or binding data stays pending before every port", async () => {
  let calls = 0;
  const coordinator = createNotificationPushSignOutCoordinator(
    ports({
      browser: { deactivateCurrentSubscription: async () => (calls += 1) },
      cleanup: { processPendingPushCleanup: async () => (calls += 1) },
      owner: { quarantineOwnedPushDevice: async () => (calls += 1) },
      storage: {
        completePendingPushCleanup: async () => (calls += 1),
        suspendCurrentPushBinding: async () => (calls += 1),
      },
    })
  );
  const withSymbol = { authUserId: AUTH_USER_ID, binding: BINDING };
  withSymbol[Symbol("private")] = FIXED_CLEANUP_TOKEN;

  for (const input of [
    undefined,
    null,
    {},
    { authUserId: OTHER_AUTH_USER_ID, binding: BINDING },
    { authUserId: AUTH_USER_ID, binding: { ...BINDING, bindingId: "invalid" } },
    { authUserId: AUTH_USER_ID, binding: { ...BINDING, serverConsent: null } },
    { authUserId: AUTH_USER_ID, binding: BINDING, extra: FIXED_CLEANUP_TOKEN },
    withSymbol,
  ]) {
    assertSafeResult(await coordinator.processCurrentDeviceSignOut(input), "pending");
  }
  assert.equal(calls, 0);
});
