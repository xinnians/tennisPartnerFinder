import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotificationPushSubscriptionLocalComposition,
  NotificationPushSubscriptionLocalCompositionError,
  PUSH_SUBSCRIPTION_LOCAL_COMPOSITION_ERROR_CODES,
} from "../src/notificationPushSubscriptionLocalComposition.ts";
import { encodeBase64Url } from "../supabase/functions/_shared/push-cleanup-protocol.js";

async function generateP256PublicKey() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
}

const VAPID_PUBLIC_KEY = encodeBase64Url(await generateP256PublicKey());
const AUTH = Object.freeze({
  isVerifiedAuthProofCurrent: () => true,
  notifyUnauthorized: () => {},
  readVerifiedAuthProof: async () => null,
});

function options(fetchRef) {
  return {
    auth: AUTH,
    fetchRef,
    locationRef: { origin: "https://qiuka.tw" },
    subscriptionEndpoint: "https://project.supabase.co/functions/v1/push-subscription-v2",
    vapidPublicKey: VAPID_PUBLIC_KEY,
  };
}

test("the local composition is dormant and exposes only its coordinator and storage", () => {
  let fetches = 0;
  const composition = createNotificationPushSubscriptionLocalComposition(
    options(async () => {
      fetches += 1;
      throw new Error("must stay dormant");
    })
  );

  assert.deepEqual(Object.keys(composition), ["coordinator", "storage"]);
  assert.equal(typeof composition.coordinator.enableProvisioning, "function");
  assert.equal(typeof composition.coordinator.refreshEnabledBinding, "function");
  assert.equal(typeof composition.storage.beginExplicitPushProvisioning, "function");
  assert.equal(fetches, 0);
});

test("the local composition rejects an incomplete Auth port with one fixed error", () => {
  for (const auth of [undefined, null, {}, { ...AUTH, readVerifiedAuthProof: null }]) {
    assert.throws(
      () => createNotificationPushSubscriptionLocalComposition({ ...options(async () => new Response()), auth }),
      (error) => {
        assert.ok(error instanceof NotificationPushSubscriptionLocalCompositionError);
        assert.equal(error.code, PUSH_SUBSCRIPTION_LOCAL_COMPOSITION_ERROR_CODES.INVALID_CONFIGURATION);
        assert.equal(error.message, PUSH_SUBSCRIPTION_LOCAL_COMPOSITION_ERROR_CODES.INVALID_CONFIGURATION);
        return true;
      }
    );
  }
});
