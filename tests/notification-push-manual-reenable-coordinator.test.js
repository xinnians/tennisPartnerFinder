import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotificationPushManualReenableCoordinator,
  NotificationPushManualReenableError,
  PUSH_MANUAL_REENABLE_ERROR_CODES,
} from "../src/notificationPushManualReenableCoordinator.ts";
import { encodeBase64Url } from "../supabase/functions/_shared/push-cleanup-protocol.js";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const SERVER_CONSENT = Object.freeze({
  consentEpoch: "22222222-2222-4222-8222-222222222222",
  consentId: "9223372036854775807",
  consentVersion: "9223372036854775807",
});
const OLD_TOKEN = encodeBase64Url(new Uint8Array(32).fill(7));
const NEW_TOKEN = encodeBase64Url(new Uint8Array(32).fill(9));
const BINDING = Object.freeze({
  authUserId: AUTH_USER_ID,
  bindingId: "33333333-3333-4333-8333-333333333333",
  deviceId: "44444444-4444-4444-8444-444444444444",
  localRevision: "55555555-5555-4555-8555-555555555555",
  reason: "auth_unavailable",
  serverConsent: SERVER_CONSENT,
  state: "auth-unverified",
});
const ATTEMPT = Object.freeze({
  attemptId: "66666666-6666-4666-8666-666666666666",
  authUserId: AUTH_USER_ID,
  bindingId: BINDING.bindingId,
  bindingRevision: BINDING.localRevision,
  cleanupToken: OLD_TOKEN,
  deviceId: BINDING.deviceId,
  reason: "subscription_changed",
  schemaVersion: 1,
  serverConsent: SERVER_CONSENT,
});
const PROVISIONING = Object.freeze({
  authUserId: AUTH_USER_ID,
  bindingId: "77777777-7777-4777-8777-777777777777",
  cleanupToken: NEW_TOKEN,
  deviceId: BINDING.deviceId,
  key: "current",
  localRevision: "88888888-8888-4888-8888-888888888888",
  schemaVersion: 1,
  serverConsent: null,
  state: "provisioning",
});

function createHarness({
  attempt = ATTEMPT,
  cleanupResult = { kind: "completed" },
  enableResult = { kind: "committed" },
  proofResults = [],
  provisioning = PROVISIONING,
} = {}) {
  const calls = [];
  const remainingProofResults = [...proofResults];
  const coordinator = createNotificationPushManualReenableCoordinator({
    cleanup: {
      processPendingPushCleanup: async (input) => {
        calls.push(["cleanup", input]);
        return cleanupResult;
      },
    },
    enable: {
      enableProvisioning: async (input) => {
        calls.push(["enable", input]);
        return enableResult;
      },
    },
    isVerifiedAuthProofCurrent: (proof) => {
      calls.push(["proof", proof]);
      return remainingProofResults.length > 0 ? remainingProofResults.shift() : true;
    },
    storage: {
      beginExplicitPushProvisioning: async (input) => {
        calls.push(["provisioning", input]);
        return provisioning;
      },
      beginExplicitPushReenable: async (input) => {
        calls.push(["reenable", input]);
        return attempt;
      },
    },
  });
  return { calls, coordinator };
}

function input(signal) {
  return {
    authProofRevision: 12,
    authUserId: AUTH_USER_ID,
    binding: BINDING,
    ...(signal ? { signal } : {}),
  };
}

test("construction is dormant and rejects a missing port with one fixed error", () => {
  let calls = 0;
  const coordinator = createNotificationPushManualReenableCoordinator({
    cleanup: { processPendingPushCleanup: async () => (calls += 1) },
    enable: { enableProvisioning: async () => (calls += 1) },
    isVerifiedAuthProofCurrent: () => {
      calls += 1;
      return true;
    },
    storage: {
      beginExplicitPushProvisioning: async () => (calls += 1),
      beginExplicitPushReenable: async () => (calls += 1),
    },
  });
  assert.equal(typeof coordinator.startManualPushReenable, "function");
  assert.equal(calls, 0);

  for (const options of [undefined, null, {}, { cleanup: {}, enable: {}, storage: {} }]) {
    assert.throws(
      () => createNotificationPushManualReenableCoordinator(options),
      (error) => {
        assert.ok(error instanceof NotificationPushManualReenableError);
        assert.equal(error.code, PUSH_MANUAL_REENABLE_ERROR_CODES.INVALID_CONFIGURATION);
        assert.equal(error.message, PUSH_MANUAL_REENABLE_ERROR_CODES.INVALID_CONFIGURATION);
        return true;
      }
    );
  }
});

test("one explicit action performs exact cleanup before creating and enabling a fresh provisioning", async () => {
  const abortController = new AbortController();
  const harness = createHarness();
  assert.deepEqual(await harness.coordinator.startManualPushReenable(input(abortController.signal)), {
    kind: "committed",
  });

  assert.deepEqual(
    harness.calls.map(([name]) => name),
    ["proof", "reenable", "proof", "cleanup", "proof", "provisioning", "proof", "enable", "proof"]
  );
  assert.deepEqual(harness.calls[1][1], {
    authUserId: AUTH_USER_ID,
    bindingId: BINDING.bindingId,
    expectedLocalRevision: BINDING.localRevision,
  });
  assert.equal(harness.calls[3][1].attempt, ATTEMPT);
  assert.equal(harness.calls[3][1].signal, abortController.signal);
  assert.deepEqual(harness.calls[5][1], {
    authUserId: AUTH_USER_ID,
    deviceId: BINDING.deviceId,
    expectedCurrentRevision: null,
  });
  assert.equal(harness.calls[7][1].predecessor, SERVER_CONSENT);
  assert.equal(harness.calls[7][1].provisioning, PROVISIONING);
  assert.equal(harness.calls[7][1].signal, abortController.signal);
  assert.equal(harness.calls[7][1].authProofRevision, 12);
  assert.equal(harness.calls[7][1].authUserId, AUTH_USER_ID);
});

test("cleanup must return exact completed before provisioning can start", async () => {
  for (const cleanupResult of [{ kind: "pending" }, { kind: "completed", extra: true }, null]) {
    const harness = createHarness({ cleanupResult });
    assert.deepEqual(await harness.coordinator.startManualPushReenable(input()), { kind: "pending" });
    assert.equal(
      harness.calls.some(([name]) => name === "provisioning"),
      false
    );
    assert.equal(
      harness.calls.some(([name]) => name === "enable"),
      false
    );
  }
});

test("every async boundary rechecks the same verified Auth proof before continuing", async () => {
  const cases = [
    { expected: ["proof"], proofResults: [false] },
    { expected: ["proof", "reenable", "proof"], proofResults: [true, false] },
    { expected: ["proof", "reenable", "proof", "cleanup", "proof"], proofResults: [true, true, false] },
    {
      expected: ["proof", "reenable", "proof", "cleanup", "proof", "provisioning", "proof"],
      proofResults: [true, true, true, false],
    },
    {
      expected: ["proof", "reenable", "proof", "cleanup", "proof", "provisioning", "proof", "enable", "proof"],
      proofResults: [true, true, true, true, false],
    },
  ];
  for (const { expected, proofResults } of cases) {
    const harness = createHarness({ proofResults });
    assert.deepEqual(await harness.coordinator.startManualPushReenable(input()), { kind: "pending" });
    assert.deepEqual(
      harness.calls.map(([name]) => name),
      expected
    );
    for (const [name, proof] of harness.calls.filter(([name]) => name === "proof")) {
      assert.equal(name, "proof");
      assert.deepEqual(proof, { authUserId: AUTH_USER_ID, revision: 12 });
    }
  }
});

test("mismatched attempt or reused provisioning identity fails closed before enable", async () => {
  for (const attempt of [
    { ...ATTEMPT, reason: "auth_rejected" },
    { ...ATTEMPT, bindingRevision: "99999999-9999-4999-8999-999999999999" },
    { ...ATTEMPT, serverConsent: null },
    { ...ATTEMPT, extra: true },
  ]) {
    const harness = createHarness({ attempt });
    assert.deepEqual(await harness.coordinator.startManualPushReenable(input()), { kind: "pending" });
    assert.equal(
      harness.calls.some(([name]) => name === "cleanup"),
      false
    );
  }

  for (const provisioning of [
    { ...PROVISIONING, bindingId: ATTEMPT.bindingId },
    { ...PROVISIONING, cleanupToken: ATTEMPT.cleanupToken },
    { ...PROVISIONING, deviceId: "99999999-9999-4999-8999-999999999999" },
    { ...PROVISIONING, extra: true },
  ]) {
    const harness = createHarness({ provisioning });
    assert.deepEqual(await harness.coordinator.startManualPushReenable(input()), { kind: "pending" });
    assert.equal(
      harness.calls.some(([name]) => name === "enable"),
      false
    );
  }
});

test("malformed input, port failure, and non-exact enable result stay detail-free pending", async () => {
  for (const invalidInput of [
    null,
    {},
    { ...input(), authProofRevision: -1 },
    { ...input(), authUserId: "not-a-uuid" },
    { ...input(), binding: { ...BINDING, state: "enabled" } },
    { ...input(), unexpected: true },
  ]) {
    const harness = createHarness();
    assert.deepEqual(await harness.coordinator.startManualPushReenable(invalidInput), { kind: "pending" });
    assert.deepEqual(harness.calls, []);
  }

  for (const enableResult of [{ kind: "pending" }, { kind: "committed", extra: true }, null]) {
    const harness = createHarness({ enableResult });
    assert.deepEqual(await harness.coordinator.startManualPushReenable(input()), { kind: "pending" });
  }

  const failing = createNotificationPushManualReenableCoordinator({
    cleanup: { processPendingPushCleanup: async () => Promise.reject(new Error("private detail")) },
    enable: { enableProvisioning: async () => ({ kind: "committed" }) },
    isVerifiedAuthProofCurrent: () => true,
    storage: {
      beginExplicitPushProvisioning: async () => PROVISIONING,
      beginExplicitPushReenable: async () => ATTEMPT,
    },
  });
  assert.deepEqual(await failing.startManualPushReenable(input()), { kind: "pending" });
});
