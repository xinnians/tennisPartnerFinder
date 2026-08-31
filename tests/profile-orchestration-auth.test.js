import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAuthCandidate,
  authIdentity,
  configureProfileOrchestrationFeature,
  openProfileCompletion,
  restoreAuthWithPort,
} from "../src/features/profile/profileOrchestrationFeature.ts";

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test("profile orchestration closes private UI and fail-closes an incomplete session before any private load", async () => {
  const calls = [];
  let authSession = { access_token: "token-a", user: { id: "account-a" } };

  configureProfileOrchestrationFeature({
    currentAuthAvatarUrl: () => "",
    defaultProfile: () => ({ nickname: "" }),
    getAppState: () => ({ authSession, courts: [], courtsReady: true, profile: { nickname: "球友" } }),
    invalidateAuthRequests: () => calls.push("invalidate"),
    openProfileCompletionSheet: () => ({
      close: (options) => calls.push(["close-profile", options]),
    }),
    reconcilePageRouteOwner: (options) => calls.push(["route", options]),
    resetNotificationSettings: () => calls.push("reset-notifications"),
    resetPresenceTracking: () => calls.push("reset-presence"),
    setAuthSession: (session) => {
      authSession = session;
      calls.push(["session", session]);
    },
    setProfile: (profile) => calls.push(["profile", profile]),
    toast: (message) => calls.push(["toast", message]),
  });

  openProfileCompletion();
  calls.length = 0;
  await applyAuthCandidate({ access_token: "must-not-be-an-identity" });

  assert.equal(authSession, null);
  assert.equal(authIdentity({ access_token: "must-not-be-an-identity" }), null);
  assert.deepEqual(calls, [
    "invalidate",
    ["session", null],
    ["route", { forcePublic: true }],
    ["close-profile", { reason: "account-change", restoreFocus: false }],
    "reset-presence",
    ["profile", { nickname: "" }],
    "reset-notifications",
    ["toast", "登入狀態無效，請重新登入。"],
  ]);
});

test("restoreAuth keeps cached auth callback events side-effect free until verification resolves", async () => {
  const verification = deferred();
  const sessions = [];
  const routes = [];
  const scheduled = [];
  let clearedIntent = 0;
  let clearedUnchangedIntent = 0;
  let onlineCallback = null;
  let verifyCalls = 0;
  const controller = {
    capturePendingIntentVersion: () => 7,
    clearPendingIntent: () => {
      clearedIntent += 1;
    },
    clearPendingIntentIfUnchanged: () => {
      clearedUnchangedIntent += 1;
    },
  };

  configureProfileOrchestrationFeature({
    defaultProfile: () => ({ nickname: "" }),
    getAppState: () => ({ authSession: sessions.at(-1) ?? null, courts: [], courtsReady: true, profile: null }),
    getController: () => controller,
    invalidateAuthRequests: () => {},
    reconcilePageRouteOwner: (options) => routes.push(options),
    resetNotificationSettings: () => {},
    resetPresenceTracking: () => {},
    setAuthSession: (session) => sessions.push(session),
    setProfile: () => {},
    toast: () => {},
  });

  const cached = { access_token: "cached", user: { id: "account-a" } };
  let callbackReturned = false;
  const restoring = restoreAuthWithPort({
    schedule: (task) => scheduled.push(task),
    subscribe: (callback) => {
      callback(cached, "SIGNED_IN");
      callback(cached, "INITIAL_SESSION");
      callbackReturned = true;
      return () => {};
    },
    subscribeOnline: (callback) => {
      onlineCallback = callback;
      return () => {};
    },
    verifyCurrentSession: () => {
      verifyCalls += 1;
      return verification.promise;
    },
  });

  assert.equal(callbackReturned, true);
  assert.deepEqual(sessions, [], "cached callbacks cannot synchronously publish an auth session");
  assert.equal(scheduled.length, 1, "SIGNED_IN is deferred to a real task; INITIAL_SESSION is ignored");
  assert.equal(clearedIntent, 0);
  assert.equal(clearedUnchangedIntent, 0);

  onlineCallback();
  verification.resolve({ error: new Error("offline"), kind: "unavailable", session: null });
  await restoring;

  assert.deepEqual(sessions, [null, null], "the failed boot and its queued retry both remain private-closed");
  assert.deepEqual(routes, [{ forcePublic: true }, { forcePublic: true }]);
  assert.equal(clearedIntent, 0);
  assert.equal(clearedUnchangedIntent, 0, "offline is not guessed to be confirmed anonymous");

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(verifyCalls, 2, "an early production online event survives the in-flight recoverable failure");
});
