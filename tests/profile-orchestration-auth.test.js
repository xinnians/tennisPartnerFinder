import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAuthCandidate,
  authIdentity,
  configureProfileOrchestrationFeature,
  openProfileCompletion,
} from "../src/features/profile/profileOrchestrationFeature.ts";

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
