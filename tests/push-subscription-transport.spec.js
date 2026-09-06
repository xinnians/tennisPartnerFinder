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

const APP_ORIGIN = "http://127.0.0.1:5174";
const PUBLIC_KEY_URL = `${APP_ORIGIN}/push-subscription-key-v1.json`;
const SUBSCRIPTION_ENDPOINT = "https://project.supabase.co/functions/v1/push-subscription-v2";
const PROVIDER_ORIGIN = "https://push-fixture.qiuka.tw";
const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const BINDING_ID = "22222222-2222-4222-8222-222222222222";
const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const CLEANUP_TOKEN = encodeBase64Url(new Uint8Array(32).fill(7));

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

const [rsaKeys, p256dh] = await Promise.all([generateRsaKeys(), generateP256PublicKey()]);
const publicKeyDocument = await canonicalPushSubscriptionPublicKeyDocumentJson(rsaKeys.publicJwk);
const privateKeyRing = await loadPushSubscriptionPrivateKeyRing(JSON.stringify({ keys: [rsaKeys.privateJwk] }));
const subscription = {
  auth: encodeBase64Url(new Uint8Array(16).fill(5)),
  endpoint: `${PROVIDER_ORIGIN}/send/opaque?token=a%2Fb`,
  p256dh: encodeBase64Url(p256dh),
};

test("real browser WebCrypto sends one opaque enable envelope through the bounded transport", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(
    async ({ authUserId, bindingId, cleanupToken, deviceId, endpoint, keyDocument, keyUrl, subscription }) => {
      const { createNotificationPushSubscriptionTransport, PUSH_SUBSCRIPTION_TRANSPORT_MAX_POSTS } =
        await import("/src/notificationPushSubscriptionTransport.ts");
      const response = (body, status, url) => {
        const value = new Response(body, {
          headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
          status,
        });
        Object.defineProperty(value, "url", { value: url });
        return value;
      };
      const calls = [];
      const transport = createNotificationPushSubscriptionTransport({
        fetchRef: async (url, init) => {
          calls.push({
            body: init.body ?? null,
            credentials: init.credentials,
            headers: init.headers,
            method: init.method,
            redirect: init.redirect,
            url,
          });
          return init.method === "GET"
            ? response(keyDocument, 200, keyUrl)
            : response(
                JSON.stringify({
                  bindingId,
                  consentEpoch: "44444444-4444-4444-8444-444444444444",
                  consentId: "41",
                  consentVersion: "8",
                  kind: "committed",
                  version: 1,
                }),
                200,
                endpoint
              );
        },
        subscriptionEndpoint: endpoint,
      });
      const committed = await transport.sendEnable({
        accessToken: "private-bearer",
        authUserId,
        predecessor: null,
        provisioning: { bindingId, cleanupToken, deviceId },
        subscription,
      });
      return { calls, committed, maxPosts: PUSH_SUBSCRIPTION_TRANSPORT_MAX_POSTS };
    },
    {
      authUserId: AUTH_USER_ID,
      bindingId: BINDING_ID,
      cleanupToken: CLEANUP_TOKEN,
      deviceId: DEVICE_ID,
      endpoint: SUBSCRIPTION_ENDPOINT,
      keyDocument: publicKeyDocument,
      keyUrl: PUBLIC_KEY_URL,
      subscription,
    }
  );

  expect(result.maxPosts).toBe(1);
  expect(result.committed).toEqual({
    bindingId: BINDING_ID,
    consentEpoch: "44444444-4444-4444-8444-444444444444",
    consentId: "41",
    consentVersion: "8",
    kind: "committed",
    version: 1,
  });
  expect(result.calls).toHaveLength(2);
  expect(result.calls[0]).toMatchObject({ credentials: "omit", method: "GET", redirect: "error", url: PUBLIC_KEY_URL });
  expect(result.calls[1]).toMatchObject({
    credentials: "omit",
    headers: {
      accept: "application/json",
      authorization: "Bearer private-bearer",
      "content-type": "application/json",
    },
    method: "POST",
    redirect: "error",
    url: SUBSCRIPTION_ENDPOINT,
  });
  expect(result.calls[1].body).not.toContain(CLEANUP_TOKEN);
  expect(result.calls[1].body).not.toContain(subscription.endpoint);
  const decrypted = await decryptPushSubscriptionEnvelope(
    JSON.parse(result.calls[1].body),
    AUTH_USER_ID,
    [PROVIDER_ORIGIN],
    privateKeyRing
  );
  expect(decrypted).toEqual({
    kind: "payload",
    payload: {
      bindingId: BINDING_ID,
      cleanupTokenHash: "4bb06f8e4e3a7715d201d573d0aa423762e55dabd61a2c02278fa56cc6d294e0",
      deviceId: DEVICE_ID,
      kind: "enable",
      predecessor: null,
      subscription,
      version: 1,
    },
  });
});
