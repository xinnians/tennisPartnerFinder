import { expect, test } from "@playwright/test";

import { encodeBase64Url } from "../supabase/functions/_shared/push-cleanup-protocol.js";
import {
  canonicalPushSubscriptionPublicKeyDocumentJson,
  pushSubscriptionRsaThumbprint,
} from "../supabase/functions/_shared/push-subscription-v2-protocol.js";
import {
  decryptPushSubscriptionEnvelope,
  loadPushSubscriptionPrivateKeyRing,
} from "../supabase/functions/push-subscription-v2/crypto.js";

const SUBSCRIPTION_ENDPOINT = "https://project.supabase.co/functions/v1/push-subscription-v2";
const PROVIDER_ORIGIN = "https://push-fixture.qiuka.tw";
const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";

async function generateRsaKeys() {
  const pair = await crypto.subtle.generateKey(
    {
      hash: "SHA-256",
      modulusLength: 2048,
      name: "RSA-OAEP",
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["encrypt", "decrypt"]
  );
  const [publicJwk, privateJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", pair.publicKey),
    crypto.subtle.exportKey("jwk", pair.privateKey),
  ]);
  const kid = await pushSubscriptionRsaThumbprint(publicJwk);
  return { privateJwk: { ...privateJwk, kid }, publicJwk: { ...publicJwk, kid } };
}

async function generateP256PublicKey() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
}

const [rsaKeys, p256dh, vapid] = await Promise.all([
  generateRsaKeys(),
  generateP256PublicKey(),
  generateP256PublicKey(),
]);
const publicKeyDocument = await canonicalPushSubscriptionPublicKeyDocumentJson(rsaKeys.publicJwk);
const privateKeyRing = await loadPushSubscriptionPrivateKeyRing(JSON.stringify({ keys: [rsaKeys.privateJwk] }));
const subscription = {
  auth: encodeBase64Url(new Uint8Array(16).fill(5)),
  endpoint: `${PROVIDER_ORIGIN}/send/opaque?token=a%2Fb`,
  p256dh: encodeBase64Url(p256dh),
};
const vapidPublicKey = encodeBase64Url(vapid);

test("the local composition enables through real IndexedDB, WebCrypto, browser port, transport, and coordinator", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(
    async ({ authUserId, endpoint, keyDocument, subscription, vapidPublicKey }) => {
      const { createNotificationPushSubscriptionLocalComposition } =
        await import("/src/notificationPushSubscriptionLocalComposition.ts");
      const { PUSH_STORAGE_DATABASE_NAME } = await import("/src/notificationPushStorage.ts");
      const decode = (value) => {
        const padding = "=".repeat((4 - (value.length % 4)) % 4);
        const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
        return Uint8Array.from(binary, (character) => character.charCodeAt(0));
      };
      const deleteDatabase = () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase(PUSH_STORAGE_DATABASE_NAME);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error("delete blocked"));
        });

      await deleteDatabase();
      const proof = { accessToken: "private-bearer", authUserId, revision: 12 };
      const calls = [];
      const fakeSubscription = {
        endpoint: subscription.endpoint,
        options: { applicationServerKey: decode(vapidPublicKey).buffer },
        toJSON: () => ({
          endpoint: subscription.endpoint,
          keys: { auth: subscription.auth, p256dh: subscription.p256dh },
        }),
        unsubscribe: async () => true,
      };
      const registration = {
        pushManager: {
          getSubscription: async () => null,
          subscribe: async () => {
            calls.push("subscribe");
            return fakeSubscription;
          },
        },
      };
      const response = (body, status, url) => {
        const value = new Response(body, {
          headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
          status,
        });
        Object.defineProperty(value, "url", { value: url });
        return value;
      };
      let postBody = null;
      let currentBindingId = null;
      const composition = createNotificationPushSubscriptionLocalComposition({
        auth: {
          isVerifiedAuthProofCurrent: (candidate) =>
            candidate.authUserId === proof.authUserId && candidate.revision === proof.revision,
          notifyUnauthorized: () => calls.push("unauthorized"),
          readVerifiedAuthProof: async () => proof,
        },
        fetchRef: async (url, init) => {
          calls.push(init.method);
          if (init.method === "GET") {
            return response(keyDocument, 200, `${location.origin}/push-subscription-key-v1.json`);
          }
          postBody = init.body;
          return response(
            JSON.stringify({
              bindingId: currentBindingId,
              consentEpoch: "44444444-4444-4444-8444-444444444444",
              consentId: "41",
              consentVersion: "1",
              kind: "committed",
              version: 1,
            }),
            200,
            endpoint
          );
        },
        navigatorRef: {
          serviceWorker: {
            getRegistration: async () => registration,
            ready: Promise.resolve(registration),
            register: async (path) => {
              calls.push(path);
              return registration;
            },
          },
        },
        notificationRef: { permission: "granted", requestPermission: async () => "granted" },
        subscriptionEndpoint: endpoint,
        vapidPublicKey,
      });
      const deviceId = await composition.storage.getOrCreateLogicalDeviceId();
      const provisioning = await composition.storage.beginExplicitPushProvisioning({
        authUserId,
        deviceId,
        expectedCurrentRevision: null,
      });
      currentBindingId = provisioning.bindingId;
      try {
        const outcome = await composition.coordinator.enableProvisioning({
          authProofRevision: proof.revision,
          authUserId,
          predecessor: null,
          provisioning,
        });
        const runtime = await composition.storage.readPushRuntimeState();
        const value = { calls, outcome, postBody, provisioning, runtime };
        await deleteDatabase();
        return value;
      } finally {
        currentBindingId = null;
      }
    },
    {
      authUserId: AUTH_USER_ID,
      endpoint: SUBSCRIPTION_ENDPOINT,
      keyDocument: publicKeyDocument,
      subscription,
      vapidPublicKey,
    }
  );

  expect(result.outcome).toEqual({ kind: "committed" });
  expect(result.runtime.kind).toBe("enabled");
  expect(result.runtime.binding.bindingId).toBe(result.provisioning.bindingId);
  expect(result.calls).toEqual(["/push-sw.js", "subscribe", "GET", "POST"]);
  expect(result.postBody).not.toContain(result.provisioning.cleanupToken);
  expect(result.postBody).not.toContain(subscription.endpoint);
  const decrypted = await decryptPushSubscriptionEnvelope(
    JSON.parse(result.postBody),
    AUTH_USER_ID,
    [PROVIDER_ORIGIN],
    privateKeyRing
  );
  expect(decrypted.kind).toBe("payload");
  expect(decrypted.payload.bindingId).toBe(result.provisioning.bindingId);
  expect(decrypted.payload.deviceId).toBe(result.provisioning.deviceId);
  expect(decrypted.payload.predecessor).toBeNull();
});
