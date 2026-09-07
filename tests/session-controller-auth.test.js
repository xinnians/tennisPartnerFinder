import assert from "node:assert/strict";
import test from "node:test";

import { createSessionController } from "../src/sessionController.ts";
import { sessionIdentity, validAuthSession } from "../src/features/profile-auth/profileAuthFeature.ts";

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test("auth identity only accepts a non-empty session user id", () => {
  const valid = { access_token: "token-a", user: { id: "account-a" } };

  assert.equal(sessionIdentity(valid), "account-a");
  assert.equal(validAuthSession(valid), valid);
  assert.equal(sessionIdentity({ access_token: "must-not-be-an-identity" }), null);
  assert.equal(sessionIdentity({ user: { id: "   " } }), null);
  assert.equal(validAuthSession({ access_token: "must-not-be-an-identity" }), null);
});

test("controller rejects a session without user.id and performs no private participation load", async () => {
  const identityChanges = [];
  let participationLoads = 0;
  const controller = createSessionController({
    api: {
      loadMySessions: async () => {
        participationLoads += 1;
        return [];
      },
    },
    discoveryPollIntervalMs: 60 * 60 * 1000,
    onAuthIdentityChange: (change) => {
      identityChanges.push(change);
      return null;
    },
    visibilityTarget: null,
  });

  controller.setAuthSession({ access_token: "must-not-be-an-identity" });
  await flush();

  assert.equal(controller.getAppState().authSession, null);
  assert.equal(controller.sessionStore.getState().profileEligibility, null);
  assert.equal(controller.sessionStore.getState().authEpoch, 1);
  assert.deepEqual(controller.getMySessions(), []);
  assert.equal(participationLoads, 0);
  assert.equal(identityChanges.length, 1);
  assert.equal(identityChanges[0].identity, null);
  assert.equal(identityChanges[0].invalidSession, true);
});

test("an invalid session clears private rows from an authenticated controller without another private load", async () => {
  let participationLoads = 0;
  const privateSession = {
    sessionId: 41,
    startAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: "open",
    viewerParticipantStatus: "accepted",
    viewerRole: "guest",
  };
  const controller = createSessionController({
    api: {
      loadMySessions: async () => {
        participationLoads += 1;
        return [privateSession];
      },
    },
    discoveryPollIntervalMs: 60 * 60 * 1000,
    onAuthIdentityChange: ({ session }) =>
      session ? { directory: false, nickname: false, ntrp: false, status: "loading" } : null,
    visibilityTarget: null,
  });

  controller.setAuthSession({ access_token: "token-a", user: { id: "account-a" } });
  await flush();
  assert.deepEqual(controller.getMySessions(), [privateSession]);
  assert.equal(participationLoads, 1);

  controller.setAuthSession({ access_token: "must-not-be-an-identity" });
  await flush();

  assert.equal(controller.getAppState().authSession, null);
  assert.deepEqual(controller.getMySessions(), []);
  assert.equal(controller.sessionStore.getState().profileEligibility, null);
  assert.equal(participationLoads, 1);
});

test("controller classifies auth identity once, resets before reconciliation, and keeps token refresh light", async () => {
  const order = [];
  let identityResetCount = 0;
  let participationLoads = 0;
  const controller = createSessionController({
    api: {
      loadMySessions: async () => {
        participationLoads += 1;
        return [];
      },
    },
    discoveryPollIntervalMs: 60 * 60 * 1000,
    onAuthIdentityChange: ({ session }) => {
      identityResetCount += 1;
      order.push("main-reset");
      return session ? { directory: false, nickname: false, ntrp: false, status: "loading" } : null;
    },
    visibilityTarget: null,
  });

  let meEmits = 0;
  controller.sessionStore.subscribe("me", () => {
    meEmits += 1;
    order.push("me-emit");
  });
  controller.setProfile({ nick: "測試球友" });
  assert.equal(meEmits, 1, "setProfile keeps its uncovered me-channel emit");
  order.length = 0;

  controller.setAuthSession({ access_token: "token-a1", user: { id: "account-a" } });
  assert.deepEqual(order.slice(0, 2), ["main-reset", "me-emit"], "main reset runs before setAuthState publishes");
  await flush();
  assert.equal(identityResetCount, 1);
  assert.equal(participationLoads, 1);

  const emitsBeforeRefresh = meEmits;
  controller.setAuthSession({ access_token: "token-a2", user: { id: "account-a" } });
  assert.equal(identityResetCount, 1, "same-account token refresh does not trigger identity reset");
  assert.equal(participationLoads, 1, "same-account token refresh does not run participation reconciliation");
  assert.equal(meEmits, emitsBeforeRefresh + 1, "setAuthSession keeps its uncovered me-channel emit");
  assert.equal(controller.getAppState().authSession?.access_token, "token-a2");
});

test("an account switch clears blocked-player rows synchronously and rejects account A's late refresh", async () => {
  const pending = deferred();
  let blockLoads = 0;
  const controller = createSessionController({
    api: {
      loadMyPlayerBlocks: async () => {
        blockLoads += 1;
        if (blockLoads === 1) return [{ blockedNickname: "帳號 A", blockedProfileId: 11 }];
        return pending.promise;
      },
      loadMySessions: async () => [],
    },
    discoveryPollIntervalMs: 60 * 60 * 1000,
    visibilityTarget: null,
  });

  await controller.setAuthState({ user: { id: "account-a" } }, null);
  assert.equal(await controller.blockedPlayers.refresh(), true);
  assert.equal(controller.blockedPlayers.getSnapshot().blockedPlayers[0]?.blockedProfileId, 11);
  const observablePairs = [];
  const capturePair = () =>
    observablePairs.push({
      blockedProfileIds: controller.blockedPlayers.getSnapshot().blockedPlayers.map((row) => row.blockedProfileId),
      identity: controller.getAppState().authSession?.user?.id ?? null,
    });
  controller.sessionStore.subscribe("me", capturePair);
  controller.blockedPlayers.subscribe(capturePair);
  const lateRefresh = controller.blockedPlayers.refresh();

  const accountSwitch = controller.setAuthState({ user: { id: "account-b" } }, null);
  assert.deepEqual(controller.blockedPlayers.getSnapshot(), {
    blockedPlayers: [],
    blockedPlayersError: "",
    blockedPlayersStatus: "idle",
  });
  assert.equal(
    observablePairs.some((pair) => pair.identity === "account-b" && pair.blockedProfileIds.includes(11)),
    false,
    "no observable update may pair account B with account A's rows"
  );

  pending.resolve([{ blockedNickname: "帳號 A 延遲資料", blockedProfileId: 12 }]);
  assert.equal(await lateRefresh, false);
  await accountSwitch;
  assert.deepEqual(controller.blockedPlayers.getSnapshot().blockedPlayers, []);
});
