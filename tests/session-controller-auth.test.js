import assert from "node:assert/strict";
import test from "node:test";

import { createSessionController } from "../src/sessionController.js";

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

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
