import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import {
  canonicalProviderOrigin,
  canonicalPushSubscriptionEnvelopeJson,
  canonicalPushSubscriptionInnerJson,
  canonicalPushSubscriptionPublicKeyDocumentJson,
  decodeCanonicalBase64Url,
  encodeBase64Url,
  encryptPushSubscriptionEnvelope,
  parseCanonicalProviderOriginsPolicy,
  parseCanonicalPushSubscriptionPublicKeyDocument,
  PUSH_SUBSCRIPTION_AAD_PREFIX,
  PUSH_SUBSCRIPTION_AES_KEY_BYTES,
  PUSH_SUBSCRIPTION_AUTH_BYTES,
  PUSH_SUBSCRIPTION_ENDPOINT_MAX_BYTES,
  PUSH_SUBSCRIPTION_ENVELOPE_MAX_BYTES,
  PUSH_SUBSCRIPTION_GCM_TAG_BYTES,
  PUSH_SUBSCRIPTION_IV_BYTES,
  PUSH_SUBSCRIPTION_PUBLIC_KEY_DOCUMENT_BYTES,
  PUSH_SUBSCRIPTION_RSA_LABEL_TEXT,
  pushSubscriptionAad,
  pushSubscriptionRsaThumbprint,
  validateCanonicalEndpoint,
  validateCanonicalEndpointStructure,
  validateCanonicalPushSubscription,
  validateCanonicalPushSubscriptionStructure,
  vapidPublicKeyFingerprint,
} from "../supabase/functions/_shared/push-subscription-v2-protocol.js";
import {
  decryptPushSubscriptionEnvelope,
  loadPushSubscriptionPrivateKeyRing,
  PUSH_SUBSCRIPTION_KEY_RING_LIMIT,
} from "../supabase/functions/push-subscription-v2/crypto.js";
import { createPushSubscriptionV2Ports } from "../supabase/functions/push-subscription-v2/ports.js";
import {
  PUSH_SUBSCRIPTION_V2_ENDPOINT_CORPUS,
  PUSH_SUBSCRIPTION_V2_FIXTURE_ORIGIN,
} from "./fixtures/pushSubscriptionV2PolicyCorpus.js";

const PROVIDER_ORIGIN = PUSH_SUBSCRIPTION_V2_FIXTURE_ORIGIN;
const PROVIDER_POLICY_JSON = JSON.stringify([PROVIDER_ORIGIN]);
const AUTH_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_AUTH_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BINDING_ID = "11111111-1111-4111-8111-111111111111";
const DEVICE_ID = "22222222-2222-4222-8222-222222222222";
const CONSENT_EPOCH = "33333333-3333-4333-8333-333333333333";
const textEncoder = new TextEncoder();
const providerPolicy = await parseCanonicalProviderOriginsPolicy(PROVIDER_POLICY_JSON);

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

const [currentKeys, previousKeys, p256dhBytes, vapidBytes] = await Promise.all([
  generateRsaKeys(),
  generateRsaKeys(),
  generateP256PublicKey(),
  generateP256PublicKey(),
]);
const currentKeyRing = await loadPushSubscriptionPrivateKeyRing(JSON.stringify({ keys: [currentKeys.privateJwk] }));
const validSubscription = Object.freeze({
  auth: encodeBase64Url(new Uint8Array(PUSH_SUBSCRIPTION_AUTH_BYTES).fill(7)),
  endpoint: `${PROVIDER_ORIGIN}/send/opaque?token=a%2Fb`,
  p256dh: encodeBase64Url(p256dhBytes),
});

function enablePayload(subscription = validSubscription) {
  return {
    bindingId: BINDING_ID,
    cleanupTokenHash: "ab".repeat(32),
    deviceId: DEVICE_ID,
    kind: "enable",
    predecessor: { consentEpoch: CONSENT_EPOCH, consentId: "1", consentVersion: "9223372036854775807" },
    subscription,
    version: 1,
  };
}

function refreshPayload(subscription = validSubscription) {
  return {
    bindingId: BINDING_ID,
    deviceId: DEVICE_ID,
    expectedConsent: { consentEpoch: CONSENT_EPOCH, consentId: "1", consentVersion: "2" },
    kind: "refresh",
    subscription,
    version: 1,
  };
}

function replaceBase64Length(value, byteLength) {
  const replacement = new Uint8Array(byteLength);
  replacement.set((decodeCanonicalBase64Url(value) ?? new Uint8Array()).slice(0, byteLength));
  return encodeBase64Url(replacement);
}

async function envelopeWithRawAesKey(payload, authUserId, aesKeyBytes, label = PUSH_SUBSCRIPTION_RSA_LABEL_TEXT) {
  const serialized = await canonicalPushSubscriptionInnerJson(payload);
  assert.ok(serialized);
  const iv = new Uint8Array(PUSH_SUBSCRIPTION_IV_BYTES).fill(9);
  const encryptionKeyBytes =
    aesKeyBytes.byteLength === PUSH_SUBSCRIPTION_AES_KEY_BYTES
      ? aesKeyBytes
      : new Uint8Array(PUSH_SUBSCRIPTION_AES_KEY_BYTES).fill(5);
  const aesKey = await crypto.subtle.importKey("raw", encryptionKeyBytes, "AES-GCM", false, ["encrypt"]);
  const rsaKey = await crypto.subtle.importKey(
    "jwk",
    currentKeys.publicJwk,
    { hash: "SHA-256", name: "RSA-OAEP" },
    false,
    ["encrypt"]
  );
  const aad = pushSubscriptionAad(authUserId);
  assert.ok(aad);
  const [ciphertext, encryptedKey] = await Promise.all([
    crypto.subtle.encrypt(
      { additionalData: aad, iv, name: "AES-GCM", tagLength: PUSH_SUBSCRIPTION_GCM_TAG_BYTES * 8 },
      aesKey,
      textEncoder.encode(serialized)
    ),
    crypto.subtle.encrypt({ label: textEncoder.encode(label), name: "RSA-OAEP" }, rsaKey, aesKeyBytes),
  ]);
  return {
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
    encryptedKey: encodeBase64Url(new Uint8Array(encryptedKey)),
    iv: encodeBase64Url(iv),
    keyId: currentKeys.publicJwk.kid,
    version: 1,
  };
}

test("provider policy accepts only canonical sorted unique non-empty HTTPS origins", async () => {
  assert.equal(canonicalProviderOrigin(PROVIDER_ORIGIN), PROVIDER_ORIGIN);
  assert.deepEqual(providerPolicy.origins, [PROVIDER_ORIGIN]);
  assert.equal(providerPolicy.serialized, PROVIDER_POLICY_JSON);
  assert.equal(providerPolicy.digest.byteLength, 32);

  for (const invalid of [
    "",
    "[]",
    JSON.stringify([`${PROVIDER_ORIGIN}/`]),
    JSON.stringify(["http://push-fixture.qiuka.tw"]),
    JSON.stringify(["https://127.0.0.1"]),
    JSON.stringify(["https://intranet"]),
    JSON.stringify(["https://push.localhost"]),
    JSON.stringify(["https://push.local"]),
    JSON.stringify(["https://router.home.arpa"]),
    JSON.stringify(["https://fixture.test"]),
    JSON.stringify([PROVIDER_ORIGIN, PROVIDER_ORIGIN]),
    JSON.stringify(["https://z.qiuka.tw", PROVIDER_ORIGIN]),
    `${PROVIDER_POLICY_JSON}\n`,
  ]) {
    await assert.rejects(parseCanonicalProviderOriginsPolicy(invalid), /PUSH_PROVIDER_POLICY_INVALID/, invalid);
  }
});

test("the endpoint corpus separates browser structure from server provider policy", () => {
  const prefix = `${PROVIDER_ORIGIN}/`;
  const exactLimit = prefix + "a".repeat(PUSH_SUBSCRIPTION_ENDPOINT_MAX_BYTES - textEncoder.encode(prefix).byteLength);
  const corpus = [
    ...PUSH_SUBSCRIPTION_V2_ENDPOINT_CORPUS,
    { endpoint: exactLimit, providerValid: true, structureValid: true },
    { endpoint: `${exactLimit}a`, providerValid: false, structureValid: false },
    { endpoint: `${validSubscription.endpoint}#fragment`, providerValid: false, structureValid: false },
  ];
  for (const { endpoint, providerValid, structureValid } of corpus) {
    assert.equal(Boolean(validateCanonicalEndpointStructure(endpoint)), structureValid, `structure ${endpoint}`);
    assert.equal(
      Boolean(validateCanonicalEndpoint(endpoint, providerPolicy.origins)),
      providerValid,
      `provider ${endpoint}`
    );
  }
});

test("subscription key corpus enforces exact shape, canonical base64url, lengths, and a valid P-256 point", async () => {
  const structured = await validateCanonicalPushSubscriptionStructure(validSubscription);
  const validated = await validateCanonicalPushSubscription(validSubscription, providerPolicy.origins);
  assert.deepEqual(structured, validated);
  assert.equal(validated?.endpoint, validSubscription.endpoint);
  assert.equal(validated?.endpointFingerprint.length, 64);

  const invalidSubscriptions = [
    { ...validSubscription, extra: true },
    { ...validSubscription, auth: `${validSubscription.auth}=` },
    { ...validSubscription, auth: replaceBase64Length(validSubscription.auth, 15) },
    { ...validSubscription, auth: replaceBase64Length(validSubscription.auth, 17) },
    { ...validSubscription, p256dh: replaceBase64Length(validSubscription.p256dh, 64) },
    { ...validSubscription, p256dh: replaceBase64Length(validSubscription.p256dh, 66) },
    { ...validSubscription, p256dh: encodeBase64Url(new Uint8Array(65)) },
    { ...validSubscription, p256dh: encodeBase64Url(new Uint8Array(65).fill(4)) },
  ];
  for (const candidate of invalidSubscriptions) {
    assert.equal(await validateCanonicalPushSubscriptionStructure(candidate), null);
    assert.equal(await validateCanonicalPushSubscription(candidate, providerPolicy.origins), null);
  }
  const foreign = { ...validSubscription, endpoint: "https://push.other.qiuka.tw/send" };
  assert.ok(await validateCanonicalPushSubscriptionStructure(foreign));
  assert.equal(await validateCanonicalPushSubscription(foreign, providerPolicy.origins), null);
});

test("VAPID fingerprint validates the 65-byte uncompressed P-256 key", async () => {
  const encoded = encodeBase64Url(vapidBytes);
  const fromBytes = await vapidPublicKeyFingerprint(vapidBytes);
  assert.deepEqual(await vapidPublicKeyFingerprint(encoded), fromBytes);
  assert.equal(fromBytes?.fingerprint.length, 64);
  assert.equal(await vapidPublicKeyFingerprint(vapidBytes.slice(0, -1)), null);
});

test("enable and refresh payloads require exact canonical shapes and PostgreSQL bigint strings", async () => {
  for (const payload of [enablePayload(), refreshPayload()]) {
    const canonical = await canonicalPushSubscriptionInnerJson(payload);
    assert.equal(canonical, JSON.stringify(payload));
  }
  for (const invalid of [
    { ...enablePayload(), extra: true },
    { ...enablePayload(), bindingId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
    { ...enablePayload(), bindingId: "33333333-3333-1333-8333-333333333333" },
    { ...enablePayload(), cleanupTokenHash: "AB".repeat(32) },
    { ...enablePayload(), predecessor: { consentEpoch: CONSENT_EPOCH, consentId: "01", consentVersion: "2" } },
    {
      ...enablePayload(),
      predecessor: { consentEpoch: CONSENT_EPOCH, consentId: "1", consentVersion: "9223372036854775808" },
    },
    { ...refreshPayload(), expectedConsent: null },
  ]) {
    assert.equal(await canonicalPushSubscriptionInnerJson(invalid), null);
  }
});

test("the independent public-key document is exact, encrypt-only, thumbprinted, and 499 bytes", async () => {
  const source = await canonicalPushSubscriptionPublicKeyDocumentJson(currentKeys.publicJwk);
  assert.equal(textEncoder.encode(source).byteLength, PUSH_SUBSCRIPTION_PUBLIC_KEY_DOCUMENT_BYTES);
  assert.deepEqual(await parseCanonicalPushSubscriptionPublicKeyDocument(source), currentKeys.publicJwk);
  await assert.rejects(parseCanonicalPushSubscriptionPublicKeyDocument(`${source}\n`), /DOCUMENT_INVALID/);
  await assert.rejects(
    parseCanonicalPushSubscriptionPublicKeyDocument(JSON.stringify({ key: currentKeys.privateJwk, version: 1 })),
    /DOCUMENT_INVALID/
  );
});

test("hybrid envelopes randomize both AES key and IV, decrypt canonically, and bind the verified user in AAD", async () => {
  const first = await encryptPushSubscriptionEnvelope(enablePayload(), AUTH_USER_ID, currentKeys.publicJwk);
  const second = await encryptPushSubscriptionEnvelope(enablePayload(), AUTH_USER_ID, currentKeys.publicJwk);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.encryptedKey, second.encryptedKey);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(canonicalPushSubscriptionEnvelopeJson(first), JSON.stringify(first));
  assert.deepEqual(await decryptPushSubscriptionEnvelope(first, AUTH_USER_ID, providerPolicy.origins, currentKeyRing), {
    kind: "payload",
    payload: enablePayload(),
  });
  assert.deepEqual(
    await decryptPushSubscriptionEnvelope(first, OTHER_AUTH_USER_ID, providerPolicy.origins, currentKeyRing),
    {
      kind: "invalid",
    }
  );
  assert.deepEqual(
    await decryptPushSubscriptionEnvelope(first, AUTH_USER_ID, ["https://other.qiuka.tw"], currentKeyRing),
    {
      kind: "endpoint-unavailable",
    }
  );

  const fixedOnlyAad = await envelopeWithRawAesKey(enablePayload(), AUTH_USER_ID, new Uint8Array(32).fill(5));
  const fixedPrefixBytes = textEncoder.encode(PUSH_SUBSCRIPTION_AAD_PREFIX);
  const iv = decodeCanonicalBase64Url(fixedOnlyAad.iv);
  const wrongAadKey = await crypto.subtle.importKey("raw", new Uint8Array(32).fill(5), "AES-GCM", false, ["encrypt"]);
  const inner = await canonicalPushSubscriptionInnerJson(enablePayload());
  fixedOnlyAad.ciphertext = encodeBase64Url(
    new Uint8Array(
      await crypto.subtle.encrypt(
        { additionalData: fixedPrefixBytes, iv, name: "AES-GCM", tagLength: 128 },
        wrongAadKey,
        textEncoder.encode(inner)
      )
    )
  );
  assert.deepEqual(
    await decryptPushSubscriptionEnvelope(fixedOnlyAad, AUTH_USER_ID, providerPolicy.origins, currentKeyRing),
    { kind: "invalid" }
  );
});

test("outer envelope length canaries stop before crypto and wrong label or AES-key length is invalid", async () => {
  const envelope = await encryptPushSubscriptionEnvelope(refreshPayload(), AUTH_USER_ID, currentKeys.publicJwk);
  for (const field of ["encryptedKey", "iv", "keyId"]) {
    const bytes = decodeCanonicalBase64Url(envelope[field]);
    for (const delta of [-1, 1]) {
      const changed = { ...envelope, [field]: replaceBase64Length(envelope[field], bytes.byteLength + delta) };
      assert.equal(canonicalPushSubscriptionEnvelopeJson(changed), null, `${field} ${delta}`);
      assert.deepEqual(
        await decryptPushSubscriptionEnvelope(changed, AUTH_USER_ID, providerPolicy.origins, currentKeyRing),
        { kind: "invalid" }
      );
    }
  }
  for (const size of [PUSH_SUBSCRIPTION_AES_KEY_BYTES - 1, PUSH_SUBSCRIPTION_AES_KEY_BYTES + 1]) {
    const changed = await envelopeWithRawAesKey(refreshPayload(), AUTH_USER_ID, new Uint8Array(size).fill(3));
    assert.deepEqual(
      await decryptPushSubscriptionEnvelope(changed, AUTH_USER_ID, providerPolicy.origins, currentKeyRing),
      { kind: "invalid" }
    );
  }
  const wrongLabel = await envelopeWithRawAesKey(
    refreshPayload(),
    AUTH_USER_ID,
    new Uint8Array(PUSH_SUBSCRIPTION_AES_KEY_BYTES).fill(3),
    "qiuka.tw/push-cleanup-token/v1"
  );
  assert.deepEqual(
    await decryptPushSubscriptionEnvelope(wrongLabel, AUTH_USER_ID, providerPolicy.origins, currentKeyRing),
    { kind: "invalid" }
  );
});

test("private key ring permits current plus previous, rejects duplicates, and reports an unknown key", async () => {
  const rotatingRing = await loadPushSubscriptionPrivateKeyRing(
    JSON.stringify({ keys: [currentKeys.privateJwk, previousKeys.privateJwk] })
  );
  assert.equal(rotatingRing.size, PUSH_SUBSCRIPTION_KEY_RING_LIMIT);
  await assert.rejects(
    loadPushSubscriptionPrivateKeyRing(JSON.stringify({ keys: [currentKeys.privateJwk, currentKeys.privateJwk] })),
    /KEY_CONFIG_INVALID/
  );
  const previousEnvelope = await encryptPushSubscriptionEnvelope(
    refreshPayload(),
    AUTH_USER_ID,
    previousKeys.publicJwk
  );
  assert.equal(
    (await decryptPushSubscriptionEnvelope(previousEnvelope, AUTH_USER_ID, providerPolicy.origins, rotatingRing)).kind,
    "payload"
  );
  assert.deepEqual(
    await decryptPushSubscriptionEnvelope(previousEnvelope, AUTH_USER_ID, providerPolicy.origins, currentKeyRing),
    { kind: "key-unavailable" }
  );
});

test("the request body bound is derived from a valid 4096-byte endpoint fixture", async () => {
  const prefix = `${PROVIDER_ORIGIN}/`;
  const endpoint = prefix + "a".repeat(PUSH_SUBSCRIPTION_ENDPOINT_MAX_BYTES - textEncoder.encode(prefix).byteLength);
  assert.equal(textEncoder.encode(endpoint).byteLength, PUSH_SUBSCRIPTION_ENDPOINT_MAX_BYTES);
  const maximumPayload = {
    ...enablePayload({ ...validSubscription, endpoint }),
    predecessor: {
      consentEpoch: CONSENT_EPOCH,
      consentId: "9223372036854775807",
      consentVersion: "9223372036854775807",
    },
  };
  const envelope = await encryptPushSubscriptionEnvelope(maximumPayload, AUTH_USER_ID, currentKeys.publicJwk);
  assert.equal(textEncoder.encode(JSON.stringify(envelope)).byteLength, PUSH_SUBSCRIPTION_ENVELOPE_MAX_BYTES);
});

test("B11 ports are exact, inert, and only reviewed dispatcher policy adapters may import the shared policy", () => {
  const noop = () => {};
  const ports = {
    enableCommand: noop,
    loadKeyRing: noop,
    loadProviderPolicy: noop,
    loadServerVapidPublicKey: noop,
    refreshCommand: noop,
    verifyUser: noop,
  };
  assert.equal(createPushSubscriptionV2Ports(ports).verifyUser, noop);
  assert.throws(() => createPushSubscriptionV2Ports({ ...ports, fetch: noop }), /PORTS_INVALID/);
  assert.throws(() => createPushSubscriptionV2Ports({ ...ports, verifyUser: "decode-only" }), /PORTS_INVALID/);

  const directory = new URL("../supabase/functions/push-subscription-v2/", import.meta.url);
  const cryptoSource = readFileSync(new URL("crypto.js", directory), "utf8");
  const portsSource = readFileSync(new URL("ports.js", directory), "utf8");
  assert.doesNotMatch(`${cryptoSource}\n${portsSource}`, /Deno\.serve\s*\(|globalThis\.fetch\s*\(|\bawait fetch\s*\(/u);
  assert.doesNotMatch(
    `${cryptoSource}\n${portsSource}`,
    /push-cleanup-protocol|PUSH_CLEANUP_PUBLIC|PUSH_CLEANUP_PRIVATE/u
  );

  const dispatcherPolicyFiles = ["v2-egress.js", "v2-local-mock.js"];
  const productionSources = ["../src/", "../supabase/functions/notification-outbox-dispatch/"]
    .flatMap((root) => {
      const rootUrl = new URL(root, import.meta.url);
      return readdirSync(rootUrl, { recursive: true })
        .filter((path) => /\.(?:js|ts|tsx)$/u.test(path))
        .filter((path) =>
          root === "../src/"
            ? !["notificationPushSubscriptionLocalComposition.ts", "notificationPushSubscriptionTransport.ts"].includes(
                path
              )
            : !dispatcherPolicyFiles.includes(path)
        )
        .map((path) => readFileSync(new URL(path, rootUrl), "utf8"));
    })
    .join("\n");
  assert.doesNotMatch(productionSources, /push-subscription-v2|pushSubscriptionV2/u);

  const dispatcherDirectory = new URL("../supabase/functions/notification-outbox-dispatch/", import.meta.url);
  const dispatcherV2References = readdirSync(dispatcherDirectory, { recursive: true })
    .filter((path) => /\.(?:js|ts)$/u.test(path))
    .filter((path) =>
      /push-subscription-v2|pushSubscriptionV2/u.test(readFileSync(new URL(path, dispatcherDirectory), "utf8"))
    );
  assert.deepEqual(dispatcherV2References.sort(), dispatcherPolicyFiles);
  const dormantEgressSource = readFileSync(new URL("v2-egress.js", dispatcherDirectory), "utf8");
  const localMockSource = readFileSync(new URL("v2-local-mock.js", dispatcherDirectory), "utf8");
  assert.match(dormantEgressSource, /\.\.\/_shared\/push-subscription-v2-protocol\.js/u);
  assert.match(localMockSource, /\.\.\/_shared\/push-subscription-v2-protocol\.js/u);
  assert.doesNotMatch(dormantEgressSource, /Deno\.serve\s*\(|\bfetch\s*\(|sendNotification\s*\(|console\./u);
  assert.doesNotMatch(localMockSource, /Deno\.serve\s*\(|sendNotification\s*\(|console\./u);
});
