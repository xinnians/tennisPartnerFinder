import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotificationPushAuthCorrelation,
  NotificationPushAuthCorrelationError,
  PUSH_AUTH_CORRELATION_ERROR_CODES,
} from "../src/notificationPushAuthCorrelation.ts";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_AUTH_USER_ID = "99999999-9999-4999-8999-999999999999";
const BINDING = Object.freeze({
  authUserId: AUTH_USER_ID,
  bindingId: "22222222-2222-4222-8222-222222222222",
  deviceId: "33333333-3333-4333-8333-333333333333",
  localRevision: "44444444-4444-4444-8444-444444444444",
  serverConsent: null,
  state: "provisioning",
});

function runtime(binding = BINDING) {
  return { binding, deviceId: binding.deviceId, kind: binding.state };
}

function createHarness({ current = () => true, pushRuntime = runtime(), result = { kind: "pending" } } = {}) {
  const calls = [];
  const coordinator = createNotificationPushAuthCorrelation({
    authFailure: {
      processAuthFailure: async (input) => {
        calls.push(["auth-failure", input]);
        return result;
      },
    },
    isVerificationRevisionCurrent: (revision) => {
      calls.push(["revision", revision]);
      return current(revision, calls);
    },
    storage: {
      readPushRuntimeState: async () => {
        calls.push(["storage"]);
        return pushRuntime;
      },
    },
  });
  return { calls, coordinator };
}

test("construction is dormant and requires all three injected ports", () => {
  let calls = 0;
  const coordinator = createNotificationPushAuthCorrelation({
    authFailure: { processAuthFailure: async () => (calls += 1) },
    isVerificationRevisionCurrent: () => {
      calls += 1;
      return true;
    },
    storage: { readPushRuntimeState: async () => (calls += 1) },
  });
  assert.equal(typeof coordinator.processAuthFailureNotice, "function");
  assert.equal(calls, 0);

  for (const options of [
    undefined,
    null,
    {},
    { authFailure: {}, isVerificationRevisionCurrent: () => true, storage: { readPushRuntimeState: async () => ({}) } },
    {
      authFailure: { processAuthFailure: async () => ({ kind: "pending" }) },
      storage: { readPushRuntimeState: async () => ({}) },
    },
  ]) {
    assert.throws(
      () => createNotificationPushAuthCorrelation(options),
      (error) => {
        assert.ok(error instanceof NotificationPushAuthCorrelationError);
        assert.equal(error.code, PUSH_AUTH_CORRELATION_ERROR_CODES.INVALID_CONFIGURATION);
        assert.equal(error.message, PUSH_AUTH_CORRELATION_ERROR_CODES.INVALID_CONFIGURATION);
        return true;
      }
    );
  }
});

test("warm failures require exact prior-owner correlation before entering B9", async () => {
  for (const [kind, downstreamKind] of [
    ["unavailable", "local-closed"],
    ["rejected", "cleanup-completed"],
  ]) {
    const abortController = new AbortController();
    const harness = createHarness({ result: { kind: downstreamKind } });
    const result = await harness.coordinator.processAuthFailureNotice({
      notice: { kind, priorVerifiedAuthUserId: AUTH_USER_ID, revision: 7 },
      signal: abortController.signal,
    });
    assert.deepEqual(result, { kind: downstreamKind });
    assert.deepEqual(harness.calls.slice(0, 3), [["revision", 7], ["storage"], ["revision", 7]]);
    assert.deepEqual(harness.calls[3][0], "auth-failure");
    assert.equal(harness.calls[3][1].authUserId, AUTH_USER_ID);
    assert.equal(harness.calls[3][1].binding, BINDING);
    assert.equal(harness.calls[3][1].kind, kind);
    assert.equal(harness.calls[3][1].signal, abortController.signal);
  }

  const mismatch = createHarness();
  assert.deepEqual(
    await mismatch.coordinator.processAuthFailureNotice({
      notice: { kind: "rejected", priorVerifiedAuthUserId: OTHER_AUTH_USER_ID, revision: 8 },
    }),
    { kind: "ignored" }
  );
  assert.deepEqual(mismatch.calls, [["revision", 8], ["storage"], ["revision", 8]]);
});

test("cold failures use only local close or cleanup-token B9 paths without inventing an owner proof", async () => {
  for (const kind of ["unavailable", "rejected"]) {
    const harness = createHarness();
    assert.deepEqual(await harness.coordinator.processAuthFailureNotice({ notice: { kind, revision: 0 } }), {
      kind: "pending",
    });
    const forwarded = harness.calls.at(-1)[1];
    assert.equal(forwarded.authUserId, BINDING.authUserId);
    assert.equal(forwarded.binding, BINDING);
    assert.equal(forwarded.kind, kind);
    assert.equal(Object.hasOwn(forwarded, "priorVerifiedAuthUserId"), false);
  }
});

test("superseded, stale, malformed, and non-binding states never enter B9", async () => {
  const superseded = createHarness();
  assert.deepEqual(
    await superseded.coordinator.processAuthFailureNotice({ notice: { kind: "superseded", revision: 2 } }),
    { kind: "ignored" }
  );
  assert.deepEqual(superseded.calls, []);

  const stale = createHarness({ current: () => false });
  assert.deepEqual(await stale.coordinator.processAuthFailureNotice({ notice: { kind: "rejected", revision: 3 } }), {
    kind: "ignored",
  });
  assert.deepEqual(stale.calls, [["revision", 3]]);

  const changedDuringRead = createHarness({ current: (_revision, calls) => calls.length === 1 });
  assert.deepEqual(
    await changedDuringRead.coordinator.processAuthFailureNotice({ notice: { kind: "rejected", revision: 4 } }),
    { kind: "ignored" }
  );
  assert.deepEqual(changedDuringRead.calls, [["revision", 4], ["storage"], ["revision", 4]]);

  for (const input of [
    null,
    {},
    { notice: { kind: "rejected", revision: -1 } },
    { notice: { kind: "rejected", revision: 1, unexpected: true } },
    { notice: { kind: "rejected", priorVerifiedAuthUserId: "not-a-uuid", revision: 1 } },
  ]) {
    const malformed = createHarness();
    assert.deepEqual(await malformed.coordinator.processAuthFailureNotice(input), { kind: "ignored" });
    assert.deepEqual(malformed.calls, []);
  }

  for (const pushRuntime of [{ kind: "disabled" }, { kind: "cleanup-pending" }, { kind: "invalid" }]) {
    const inactive = createHarness({ pushRuntime });
    assert.deepEqual(
      await inactive.coordinator.processAuthFailureNotice({ notice: { kind: "unavailable", revision: 5 } }),
      { kind: "ignored" }
    );
    assert.equal(
      inactive.calls.some(([name]) => name === "auth-failure"),
      false
    );
  }
});

test("port failures and non-exact B9 results fail closed without leaking details", async () => {
  const storageFailure = createNotificationPushAuthCorrelation({
    authFailure: { processAuthFailure: async () => ({ kind: "cleanup-completed" }) },
    isVerificationRevisionCurrent: () => true,
    storage: { readPushRuntimeState: async () => Promise.reject(new Error("private storage detail")) },
  });
  assert.deepEqual(await storageFailure.processAuthFailureNotice({ notice: { kind: "rejected", revision: 1 } }), {
    kind: "pending",
  });

  for (const result of [null, {}, { kind: "cleanup-completed", extra: true }, { kind: "unknown" }]) {
    const harness = createHarness({ result });
    assert.deepEqual(
      await harness.coordinator.processAuthFailureNotice({ notice: { kind: "rejected", revision: 1 } }),
      { kind: "pending" }
    );
  }
});
