import assert from "node:assert/strict";
import test from "node:test";
import { createNotificationPushUserActions } from "../src/notificationPushUserActions.ts";

function fixture(initial = { kind: "disabled" }) {
  let state = initial;
  let current = true;
  const calls = [];
  const proof = { authUserId: "owner", revision: 1, accessToken: "memory-only" };
  const binding = { authUserId: "owner", bindingId: "binding", localRevision: "revision", state: "enabled" };
  const storage = {
    readPushRuntimeState: async () => state,
    getOrCreateLogicalDeviceId: async () => "device",
    beginExplicitPushProvisioning: async () => {
      calls.push("provision");
      return { ...binding, state: "provisioning" };
    },
    readPushProvisioning: async () => ({ ...binding, state: "provisioning" }),
    suspendCurrentPushBinding: async (input) => {
      calls.push(input.reason);
      state = { kind: "cleanup-pending" };
    },
    listPendingPushCleanups: async () => [{ attemptId: "old" }],
  };
  const options = {
    auth: { readCurrentVerifiedAuthProof: () => proof, isVerifiedAuthProofCurrent: () => current },
    storage,
    subscription: {
      enableProvisioning: async () => {
        calls.push("enable");
        state = { kind: "enabled", binding };
        return { kind: "committed" };
      },
      refreshEnabledBinding: async () => {
        calls.push("refresh");
        return { kind: "committed" };
      },
    },
    manualReenable: {
      startManualPushReenable: async () => {
        calls.push("manual");
      },
    },
    cleanup: {
      processPendingPushCleanup: async () => {
        calls.push("cleanup");
        state = { kind: "disabled" };
        return { kind: "completed" };
      },
    },
  };
  return {
    options,
    calls,
    setCurrent: (value) => {
      current = value;
    },
    setState: (value) => {
      state = value;
    },
  };
}

test("explicit enable single-flights provisioning and reports enabled only after verified refresh", async () => {
  const f = fixture();
  const actions = createNotificationPushUserActions(f.options);
  const first = actions.enable();
  const second = actions.enable();
  assert.equal(first, second);
  assert.deepEqual(await first, { kind: "enabled" });
  assert.deepEqual(f.calls, ["provision", "enable", "refresh"]);
});

test("stale Auth during storage access prevents provisioning and network writes", async () => {
  const f = fixture();
  f.options.storage.readPushRuntimeState = async () => {
    f.setCurrent(false);
    return { kind: "disabled" };
  };
  assert.deepEqual(await createNotificationPushUserActions(f.options).enable(), { kind: "auth-unverified" });
  assert.deepEqual(f.calls, []);
});

test("account changes clean the old local binding before enrolling the new account", async () => {
  const f = fixture({ kind: "enabled", binding: { authUserId: "other", bindingId: "old", localRevision: "revision" } });
  assert.deepEqual(await createNotificationPushUserActions(f.options).enable(), { kind: "enabled" });
  assert.deepEqual(f.calls, ["account_changed", "cleanup", "provision", "enable", "refresh"]);
});

test("invalid storage is never reset or replaced with a new device", async () => {
  const f = fixture({ kind: "invalid" });
  assert.deepEqual(await createNotificationPushUserActions(f.options).enable(), { kind: "invalid" });
  assert.deepEqual(f.calls, []);
});

test("an enabled local record alone cannot report current delivery readiness", async () => {
  const f = fixture({ kind: "enabled", binding: { authUserId: "owner" } });
  f.options.subscription.refreshEnabledBinding = async () => ({ kind: "pending" });
  assert.deepEqual(await createNotificationPushUserActions(f.options).readState(), { kind: "auth-unverified" });
});

test("pending cleanup blocks enrollment until the cleanup command confirms completion", async () => {
  const f = fixture({ kind: "cleanup-pending" });
  f.options.cleanup.processPendingPushCleanup = async () => ({ kind: "pending" });
  assert.deepEqual(await createNotificationPushUserActions(f.options).enable(), { kind: "cleanup-pending" });
  assert.deepEqual(f.calls, []);
});
