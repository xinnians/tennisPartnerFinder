import { expect, test } from "@playwright/test";

import { pushSubscriptionRsaThumbprint } from "../supabase/functions/_shared/push-subscription-v2-protocol.js";
import {
  decryptPushSubscriptionEnvelope,
  loadPushSubscriptionPrivateKeyRing,
} from "../supabase/functions/push-subscription-v2/crypto.js";
import {
  PUSH_SUBSCRIPTION_V2_ENDPOINT_CORPUS,
  PUSH_SUBSCRIPTION_V2_FIXTURE_ORIGIN,
} from "./fixtures/pushSubscriptionV2PolicyCorpus.js";

const PROVIDER_ORIGIN = PUSH_SUBSCRIPTION_V2_FIXTURE_ORIGIN;
const AUTH_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

const keys = await generateRsaKeys();
const keyRing = await loadPushSubscriptionPrivateKeyRing(JSON.stringify({ keys: [keys.privateJwk] }));

test("real browser WebCrypto uses the shared policy and produces an Edge-decryptable dormant envelope", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(
    async ({ authUserId, endpointCorpus, providerOrigin, publicJwk }) => {
      const protocol = await import("/supabase/functions/_shared/push-subscription-v2-protocol.js");
      const policy = await protocol.parseCanonicalProviderOriginsPolicy(JSON.stringify([providerOrigin]));
      const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      const p256dh = protocol.encodeBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
      const subscription = {
        auth: protocol.encodeBase64Url(crypto.getRandomValues(new Uint8Array(16))),
        endpoint: `${providerOrigin}/opaque/path?token=a%2Fb`,
        p256dh,
      };
      const payload = {
        bindingId: "11111111-1111-4111-8111-111111111111",
        deviceId: "22222222-2222-4222-8222-222222222222",
        expectedConsent: {
          consentEpoch: "33333333-3333-4333-8333-333333333333",
          consentId: "1",
          consentVersion: "2",
        },
        kind: "refresh",
        subscription,
        version: 1,
      };
      const evaluatedCorpus = endpointCorpus.map(({ endpoint, valid }) => ({
        actual: Boolean(protocol.validateCanonicalEndpoint(endpoint, policy.origins)),
        endpoint,
        expected: valid,
      }));
      const envelope = await protocol.encryptPushSubscriptionEnvelope(payload, authUserId, policy.origins, publicJwk);
      return {
        canonical: protocol.canonicalPushSubscriptionEnvelopeJson(envelope) === JSON.stringify(envelope),
        endpointCorpus: evaluatedCorpus,
        envelope,
        payload,
        policyDigestBytes: policy.digest.byteLength,
      };
    },
    {
      authUserId: AUTH_USER_ID,
      endpointCorpus: PUSH_SUBSCRIPTION_V2_ENDPOINT_CORPUS,
      providerOrigin: PROVIDER_ORIGIN,
      publicJwk: keys.publicJwk,
    }
  );

  expect(result.canonical).toBe(true);
  expect(result.policyDigestBytes).toBe(32);
  for (const item of result.endpointCorpus) expect(item.actual, item.endpoint).toBe(item.expected);
  await expect(
    decryptPushSubscriptionEnvelope(result.envelope, AUTH_USER_ID, [PROVIDER_ORIGIN], keyRing)
  ).resolves.toEqual({ kind: "payload", payload: result.payload });
});
