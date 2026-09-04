import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotificationPushSubscriptionCoordinator,
  NotificationPushSubscriptionCoordinatorError,
  PUSH_SUBSCRIPTION_COORDINATOR_ERROR_CODES,
} from "../src/notificationPushSubscriptionCoordinator.ts";
import { encodeBase64Url } from "../supabase/functions/_shared/push-cleanup-protocol.js";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const PROOF = Object.freeze({ accessToken: "private-bearer", authUserId: AUTH_USER_ID, revision: 12 });
const CONSENT = Object.freeze({
  consentEpoch: "22222222-2222-4222-8222-222222222222",
  consentId: "41",
  consentVersion: "7",
});
const NEXT_CONSENT = Object.freeze({ ...CONSENT, consentVersion: "8" });
const PROVISIONING = Object.freeze({
  authUserId: AUTH_USER_ID,
  bindingId: "33333333-3333-4333-8333-333333333333",
  cleanupToken: encodeBase64Url(new Uint8Array(32).fill(7)),
  deviceId: "44444444-4444-4444-8444-444444444444",
  key: "current",
  localRevision: "55555555-5555-4555-8555-555555555555",
  schemaVersion: 1,
  serverConsent: null,
  state: "provisioning",
});
const ENABLED = Object.freeze({
  authUserId: AUTH_USER_ID,
  bindingId: PROVISIONING.bindingId,
  deviceId: PROVISIONING.deviceId,
  localRevision: "66666666-6666-4666-8666-666666666666",
  serverConsent: CONSENT,
  state: "enabled",
});
const SUBSCRIPTION = Object.freeze({
  auth: "auth-value",
  endpoint: "https://push.example.test/exact",
  p256dh: "p256dh-value",
});

function committed(bindingId = PROVISIONING.bindingId, consent = NEXT_CONSENT) {
  return { bindingId, ...consent, kind: "committed", version: 1 };
}

function createHarness({
  currentResults = [],
  enableResponse = committed(),
  enabledCommit = { ...ENABLED, localRevision: "77777777-7777-4777-8777-777777777777", serverConsent: NEXT_CONSENT },
  prepared = { kind: "ready", subscription: SUBSCRIPTION },
  proof = PROOF,
  provisioning = PROVISIONING,
  refreshCommit = { ...ENABLED, localRevision: "88888888-8888-4888-8888-888888888888", serverConsent: NEXT_CONSENT },
  refreshResponse = committed(ENABLED.bindingId),
  runtime = { binding: ENABLED, deviceId: ENABLED.deviceId, kind: "enabled" },
} = {}) {
  const calls = [];
  const remainingCurrent = [...currentResults];
  const coordinator = createNotificationPushSubscriptionCoordinator({
    auth: {
      isVerifiedAuthProofCurrent: (candidate) => {
        calls.push(["current", candidate]);
        return remainingCurrent.length > 0 ? remainingCurrent.shift() : true;
      },
      notifyUnauthorized: async (input) => calls.push(["unauthorized", input]),
      readVerifiedAuthProof: async (input) => {
        calls.push(["proof", input]);
        return proof;
      },
    },
    browser: {
      preparePushSubscription: async (input) => {
        calls.push(["prepare", input]);
        return prepared;
      },
    },
    storage: {
      cancelExplicitPushProvisioning: async (input) => calls.push(["cancel", input]),
      commitPushProvisioning: async (input) => {
        calls.push(["commit-enable", input]);
        return enabledCommit;
      },
      commitPushRefresh: async (input) => {
        calls.push(["commit-refresh", input]);
        return refreshCommit;
      },
      readPushProvisioning: async (authUserId) => {
        calls.push(["read-provisioning", authUserId]);
        return provisioning;
      },
      readPushRuntimeState: async () => {
        calls.push(["read-runtime"]);
        return runtime;
      },
    },
    transport: {
      sendEnable: async (input) => {
        calls.push(["send-enable", input]);
        return enableResponse;
      },
      sendRefresh: async (input) => {
        calls.push(["send-refresh", input]);
        return refreshResponse;
      },
    },
  });
  return { calls, coordinator };
}

function enableInput(signal) {
  return {
    authProofRevision: PROOF.revision,
    authUserId: AUTH_USER_ID,
    predecessor: CONSENT,
    provisioning: PROVISIONING,
    ...(signal ? { signal } : {}),
  };
}

function refreshInput(signal) {
  return {
    authProofRevision: PROOF.revision,
    authUserId: AUTH_USER_ID,
    binding: ENABLED,
    ...(signal ? { signal } : {}),
  };
}

test("construction stays dormant and rejects one missing port with a fixed error", () => {
  const harness = createHarness();
  assert.equal(typeof harness.coordinator.enableProvisioning, "function");
  assert.equal(typeof harness.coordinator.refreshEnabledBinding, "function");
  assert.deepEqual(harness.calls, []);

  for (const options of [undefined, null, {}, { auth: {}, browser: {}, storage: {}, transport: {} }]) {
    assert.throws(
      () => createNotificationPushSubscriptionCoordinator(options),
      (error) => {
        assert.ok(error instanceof NotificationPushSubscriptionCoordinatorError);
        assert.equal(error.code, PUSH_SUBSCRIPTION_COORDINATOR_ERROR_CODES.INVALID_CONFIGURATION);
        assert.equal(error.message, PUSH_SUBSCRIPTION_COORDINATOR_ERROR_CODES.INVALID_CONFIGURATION);
        return true;
      }
    );
  }
});

test("enable checks the exact durable provisioning before and after its single network call", async () => {
  const signal = new AbortController().signal;
  const harness = createHarness();
  assert.deepEqual(await harness.coordinator.enableProvisioning(enableInput(signal)), { kind: "committed" });
  assert.deepEqual(
    harness.calls.filter(([name]) => !["current"].includes(name)).map(([name]) => name),
    ["proof", "prepare", "read-provisioning", "send-enable", "read-provisioning", "commit-enable"]
  );
  const send = harness.calls.find(([name]) => name === "send-enable")[1];
  assert.equal(send.accessToken, PROOF.accessToken);
  assert.equal(send.authUserId, AUTH_USER_ID);
  assert.equal(send.predecessor, CONSENT);
  assert.equal(send.provisioning, PROVISIONING);
  assert.equal(send.signal, signal);
  assert.equal(send.subscription, SUBSCRIPTION);
  const commit = harness.calls.find(([name]) => name === "commit-enable")[1];
  assert.deepEqual(commit, {
    authUserId: AUTH_USER_ID,
    bindingId: PROVISIONING.bindingId,
    deviceId: PROVISIONING.deviceId,
    expectedLocalRevision: PROVISIONING.localRevision,
    ...NEXT_CONSENT,
  });
});

test("only an exact pre-network cancellation reaches B12.5 and never reaches transport", async () => {
  const cancelled = createHarness({ prepared: { kind: "cancelled-before-network" } });
  assert.deepEqual(await cancelled.coordinator.enableProvisioning(enableInput()), { kind: "pending" });
  assert.deepEqual(
    cancelled.calls.filter(([name]) => name !== "current").map(([name]) => name),
    ["proof", "prepare", "read-provisioning", "cancel"]
  );
  assert.deepEqual(cancelled.calls.at(-1)[1], {
    authUserId: AUTH_USER_ID,
    bindingId: PROVISIONING.bindingId,
    expectedLocalRevision: PROVISIONING.localRevision,
  });

  for (const prepared of [{ kind: "pending" }, { kind: "cancelled-before-network", extra: true }, null]) {
    const harness = createHarness({ prepared });
    assert.deepEqual(await harness.coordinator.enableProvisioning(enableInput()), { kind: "pending" });
    assert.equal(
      harness.calls.some(([name]) => name === "cancel" || name === "send-enable"),
      false
    );
  }
});

test("a stale proof or changed provisioning stops before the next irreversible boundary", async () => {
  const staleBeforeNetwork = createHarness({ currentResults: [true, false] });
  assert.deepEqual(await staleBeforeNetwork.coordinator.enableProvisioning(enableInput()), { kind: "pending" });
  assert.equal(
    staleBeforeNetwork.calls.some(([name]) => name === "read-provisioning"),
    false
  );

  const changed = createHarness({
    provisioning: { ...PROVISIONING, localRevision: "99999999-9999-4999-8999-999999999999" },
  });
  assert.deepEqual(await changed.coordinator.enableProvisioning(enableInput()), { kind: "pending" });
  assert.equal(
    changed.calls.some(([name]) => name === "send-enable"),
    false
  );

  const staleAfterNetwork = createHarness({ currentResults: [true, true, true, false] });
  assert.deepEqual(await staleAfterNetwork.coordinator.enableProvisioning(enableInput()), { kind: "pending" });
  assert.equal(
    staleAfterNetwork.calls.some(([name]) => name === "commit-enable"),
    false
  );
});

test("unauthorized notifies Auth without exposing the bearer and every other non-success preserves provisioning", async () => {
  const unauthorized = createHarness({ enableResponse: { kind: "unauthorized" } });
  assert.deepEqual(await unauthorized.coordinator.enableProvisioning(enableInput()), { kind: "pending" });
  const notice = unauthorized.calls.find(([name]) => name === "unauthorized")[1];
  assert.deepEqual(notice, { authUserId: AUTH_USER_ID, revision: PROOF.revision });
  assert.equal(JSON.stringify(notice).includes(PROOF.accessToken), false);
  assert.equal(
    unauthorized.calls.some(([name]) => name === "commit-enable"),
    false
  );

  const superseded = createHarness({
    currentResults: [true, true, true, false],
    enableResponse: { kind: "unauthorized" },
  });
  assert.deepEqual(await superseded.coordinator.enableProvisioning(enableInput()), { kind: "pending" });
  assert.equal(
    superseded.calls.some(([name]) => name === "unauthorized"),
    false
  );

  for (const enableResponse of [
    { kind: "unavailable", version: 1 },
    { kind: "stale", version: 1 },
    { kind: "invalid", version: 1 },
    { kind: "endpoint-unavailable", version: 1 },
    { ...committed(), extra: true },
    committed("99999999-9999-4999-8999-999999999999"),
  ]) {
    const harness = createHarness({ enableResponse });
    assert.deepEqual(await harness.coordinator.enableProvisioning(enableInput()), { kind: "pending" });
    assert.equal(
      harness.calls.some(([name]) => name === "commit-enable"),
      false
    );
  }
});

test("refresh checks the exact enabled snapshot around one network call and commits through B12.6", async () => {
  const signal = new AbortController().signal;
  const harness = createHarness();
  assert.deepEqual(await harness.coordinator.refreshEnabledBinding(refreshInput(signal)), { kind: "committed" });
  assert.deepEqual(
    harness.calls.filter(([name]) => name !== "current").map(([name]) => name),
    ["proof", "prepare", "read-runtime", "send-refresh", "read-runtime", "commit-refresh"]
  );
  const send = harness.calls.find(([name]) => name === "send-refresh")[1];
  assert.equal(send.accessToken, PROOF.accessToken);
  assert.equal(send.authUserId, AUTH_USER_ID);
  assert.equal(send.binding, ENABLED);
  assert.equal(send.signal, signal);
  assert.equal(send.subscription, SUBSCRIPTION);
  assert.deepEqual(harness.calls.find(([name]) => name === "commit-refresh")[1], {
    authUserId: AUTH_USER_ID,
    bindingId: ENABLED.bindingId,
    deviceId: ENABLED.deviceId,
    expectedConsent: CONSENT,
    expectedLocalRevision: ENABLED.localRevision,
    ...NEXT_CONSENT,
  });
});

test("refresh never cancels local state and rejects runtime, response, or commit drift", async () => {
  for (const options of [
    { prepared: { kind: "cancelled-before-network" } },
    {
      runtime: {
        binding: { ...ENABLED, localRevision: "99999999-9999-4999-8999-999999999999" },
        deviceId: ENABLED.deviceId,
        kind: "enabled",
      },
    },
    { refreshResponse: committed("99999999-9999-4999-8999-999999999999") },
    { refreshCommit: { ...ENABLED, serverConsent: CONSENT } },
  ]) {
    const harness = createHarness(options);
    assert.deepEqual(await harness.coordinator.refreshEnabledBinding(refreshInput()), { kind: "pending" });
    assert.equal(
      harness.calls.some(([name]) => name === "cancel"),
      false
    );
  }
});

test("malformed input and thrown ports stay detail-free pending without an unintended request", async () => {
  for (const candidate of [
    null,
    {},
    { ...enableInput(), authProofRevision: -1 },
    { ...enableInput(), authUserId: "not-a-uuid" },
    { ...enableInput(), provisioning: { ...PROVISIONING, state: "enabled" } },
    { ...enableInput(), extra: true },
  ]) {
    const harness = createHarness();
    assert.deepEqual(await harness.coordinator.enableProvisioning(candidate), { kind: "pending" });
    assert.deepEqual(harness.calls, []);
  }

  const calls = [];
  const failing = createNotificationPushSubscriptionCoordinator({
    auth: {
      isVerifiedAuthProofCurrent: () => true,
      notifyUnauthorized: () => calls.push("unauthorized"),
      readVerifiedAuthProof: async () => PROOF,
    },
    browser: { preparePushSubscription: async () => ({ kind: "ready", subscription: SUBSCRIPTION }) },
    storage: {
      cancelExplicitPushProvisioning: async () => calls.push("cancel"),
      commitPushProvisioning: async () => calls.push("commit-enable"),
      commitPushRefresh: async () => calls.push("commit-refresh"),
      readPushProvisioning: async () => PROVISIONING,
      readPushRuntimeState: async () => ({ binding: ENABLED, deviceId: ENABLED.deviceId, kind: "enabled" }),
    },
    transport: {
      sendEnable: async () => Promise.reject(new Error("private detail")),
      sendRefresh: async () => Promise.reject(new Error("private detail")),
    },
  });
  assert.deepEqual(await failing.enableProvisioning(enableInput()), { kind: "pending" });
  assert.deepEqual(await failing.refreshEnabledBinding(refreshInput()), { kind: "pending" });
  assert.deepEqual(calls, []);
});
