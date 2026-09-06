import assert from "node:assert/strict";
import test from "node:test";

import { encodeBase64Url } from "../supabase/functions/_shared/push-cleanup-protocol.js";
import {
  canonicalPushSubscriptionEnvelopeJson,
  encryptPushSubscriptionEnvelope,
  PUSH_SUBSCRIPTION_ENVELOPE_MAX_BYTES,
  pushSubscriptionRsaThumbprint,
  vapidPublicKeyFingerprint,
} from "../supabase/functions/_shared/push-subscription-v2-protocol.js";
import { loadPushSubscriptionPrivateKeyRing } from "../supabase/functions/push-subscription-v2/crypto.js";
import { createPushSubscriptionV2Handler } from "../supabase/functions/push-subscription-v2/handler.js";

const APP_ORIGIN = "https://qiuka.tw";
const PROVIDER_ORIGIN = "https://push-fixture.qiuka.tw";
const FUNCTION_URL = "https://project.supabase.co/functions/v1/push-subscription-v2";
const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_AUTH_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BINDING_ID = "22222222-2222-4222-8222-222222222222";
const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const CONSENT = Object.freeze({
  consentEpoch: "44444444-4444-4444-8444-444444444444",
  consentId: "41",
  consentVersion: "7",
});

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

const [rsaKeys, otherRsaKeys, p256dh, vapidPublicKey] = await Promise.all([
  generateRsaKeys(),
  generateRsaKeys(),
  generateP256PublicKey(),
  generateP256PublicKey(),
]);
const keyRing = await loadPushSubscriptionPrivateKeyRing(JSON.stringify({ keys: [rsaKeys.privateJwk] }));
const otherKeyRing = await loadPushSubscriptionPrivateKeyRing(JSON.stringify({ keys: [otherRsaKeys.privateJwk] }));
const vapidFingerprint = await vapidPublicKeyFingerprint(vapidPublicKey);
const subscription = Object.freeze({
  auth: encodeBase64Url(new Uint8Array(16).fill(5)),
  endpoint: `${PROVIDER_ORIGIN}/send/opaque?token=a%2Fb`,
  p256dh: encodeBase64Url(p256dh),
});
const enablePayload = Object.freeze({
  bindingId: BINDING_ID,
  cleanupTokenHash: "4bb06f8e4e3a7715d201d573d0aa423762e55dabd61a2c02278fa56cc6d294e0",
  deviceId: DEVICE_ID,
  kind: "enable",
  predecessor: CONSENT,
  subscription,
  version: 1,
});
const refreshPayload = Object.freeze({
  bindingId: BINDING_ID,
  deviceId: DEVICE_ID,
  expectedConsent: CONSENT,
  kind: "refresh",
  subscription,
  version: 1,
});
const committed = Object.freeze({
  bindingId: BINDING_ID,
  consentEpoch: CONSENT.consentEpoch,
  consentId: CONSENT.consentId,
  consentVersion: "8",
  kind: "committed",
  version: 1,
});

async function encryptedBody(payload = enablePayload, authUserId = AUTH_USER_ID, publicJwk = rsaKeys.publicJwk) {
  const envelope = await encryptPushSubscriptionEnvelope(payload, authUserId, publicJwk);
  const body = canonicalPushSubscriptionEnvelopeJson(envelope);
  assert.equal(typeof body, "string");
  return body;
}

function request(body, { headers = {}, method = "POST", origin = APP_ORIGIN } = {}) {
  return new Request(FUNCTION_URL, {
    ...(method === "POST" ? { body } : {}),
    headers: {
      ...(method === "POST" ? { authorization: "Bearer private-user-jwt", "content-type": "application/json" } : {}),
      origin,
      ...headers,
    },
    method,
  });
}

function harness(overrides = {}) {
  const calls = [];
  const ports = {
    enableCommand: async (input) => {
      calls.push(["enable", input]);
      return committed;
    },
    loadKeyRing: async () => {
      calls.push(["keys"]);
      return keyRing;
    },
    loadProviderPolicy: async () => {
      calls.push(["policy"]);
      return JSON.stringify([PROVIDER_ORIGIN]);
    },
    loadServerVapidPublicKey: async () => {
      calls.push(["vapid"]);
      return vapidPublicKey;
    },
    refreshCommand: async (input) => {
      calls.push(["refresh", input]);
      return committed;
    },
    verifyUser: async (token) => {
      calls.push(["auth", token]);
      return { authUserId: AUTH_USER_ID, kind: "verified" };
    },
    ...overrides,
  };
  return {
    calls,
    handler: createPushSubscriptionV2Handler({ allowedOrigin: APP_ORIGIN, ports }),
  };
}

async function shape(response) {
  return {
    allowHeaders: response.headers.get("access-control-allow-headers"),
    allowMethods: response.headers.get("access-control-allow-methods"),
    body: response.status === 204 ? null : await response.text(),
    cacheControl: response.headers.get("cache-control"),
    contentType: response.headers.get("content-type"),
    corsOrigin: response.headers.get("access-control-allow-origin"),
    status: response.status,
    vary: response.headers.get("vary"),
  };
}

test("construction is dormant and rejects incomplete or non-canonical configuration", () => {
  const { calls, handler } = harness();
  assert.equal(typeof handler, "function");
  assert.deepEqual(calls, []);

  const noop = () => {};
  const ports = {
    enableCommand: noop,
    loadKeyRing: noop,
    loadProviderPolicy: noop,
    loadServerVapidPublicKey: noop,
    refreshCommand: noop,
    verifyUser: noop,
  };
  for (const allowedOrigin of ["", "http://qiuka.tw", "https://qiuka.tw/", "https://user@qiuka.tw"]) {
    assert.throws(
      () => createPushSubscriptionV2Handler({ allowedOrigin, ports }),
      /PUSH_SUBSCRIPTION_HANDLER_INVALID_CONFIGURATION/u
    );
  }
  assert.throws(
    () => createPushSubscriptionV2Handler({ allowedOrigin: APP_ORIGIN, ports: { ...ports, directDb: noop } }),
    /PUSH_SUBSCRIPTION_PORTS_INVALID/u
  );
  assert.doesNotThrow(() => createPushSubscriptionV2Handler({ allowedOrigin: "http://127.0.0.1:5173", ports }));
});

test("CORS preflight is exact and an untrusted origin stops before every port", async () => {
  const trusted = harness();
  assert.deepEqual(await shape(await trusted.handler(request(null, { method: "OPTIONS" }))), {
    allowHeaders: "authorization, content-type",
    allowMethods: "POST, OPTIONS",
    body: null,
    cacheControl: "no-store",
    contentType: "application/json; charset=utf-8",
    corsOrigin: APP_ORIGIN,
    status: 204,
    vary: "Origin",
  });
  assert.deepEqual(trusted.calls, []);

  const untrusted = harness();
  assert.deepEqual(
    await shape(await untrusted.handler(request(await encryptedBody(), { origin: `${APP_ORIGIN}.evil.test` }))),
    {
      allowHeaders: null,
      allowMethods: null,
      body: '{"kind":"unavailable","version":1}',
      cacheControl: "no-store",
      contentType: "application/json; charset=utf-8",
      corsOrigin: null,
      status: 503,
      vary: "Origin",
    }
  );
  assert.deepEqual(untrusted.calls, []);
});

test("enable verifies Auth, decrypts with server policy, derives VAPID, and sends the exact DB command", async () => {
  const { calls, handler } = harness();
  const result = await shape(await handler(request(await encryptedBody())));
  assert.deepEqual(result, {
    allowHeaders: null,
    allowMethods: null,
    body: JSON.stringify(committed),
    cacheControl: "no-store",
    contentType: "application/json; charset=utf-8",
    corsOrigin: APP_ORIGIN,
    status: 200,
    vary: "Origin",
  });
  assert.deepEqual(calls.slice(0, 4), [["auth", "private-user-jwt"], ["policy"], ["keys"], ["vapid"]]);
  assert.deepEqual(calls[4], [
    "enable",
    {
      authUserId: AUTH_USER_ID,
      bindingId: BINDING_ID,
      cleanupTokenHash: enablePayload.cleanupTokenHash,
      deviceId: DEVICE_ID,
      predecessor: CONSENT,
      subscription,
      vapidFingerprint: vapidFingerprint.fingerprint,
    },
  ]);
});

test("refresh calls only the refresh command with the exact expected consent", async () => {
  const { calls, handler } = harness();
  const response = await handler(request(await encryptedBody(refreshPayload)));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), JSON.stringify(committed));
  assert.deepEqual(calls.at(-1), [
    "refresh",
    {
      authUserId: AUTH_USER_ID,
      bindingId: BINDING_ID,
      deviceId: DEVICE_ID,
      expectedConsent: CONSENT,
      subscription,
      vapidFingerprint: vapidFingerprint.fingerprint,
    },
  ]);
  assert.equal(
    calls.some(([name]) => name === "enable"),
    false
  );
});

test("Auth rejection is 401 while Auth outage and contract drift are unavailable", async () => {
  const body = await encryptedBody();
  for (const [verifyUser, status] of [
    [async () => ({ kind: "rejected" }), 401],
    [async () => ({ kind: "unavailable" }), 503],
    [async () => ({ authUserId: AUTH_USER_ID, kind: "decoded-only" }), 503],
    [async () => Promise.reject(new Error("auth offline")), 503],
  ]) {
    const { calls, handler } = harness({ verifyUser });
    const response = await handler(request(body));
    assert.equal(response.status, status);
    assert.equal(await response.text(), '{"kind":"unavailable","version":1}');
    assert.equal(
      calls.some(([name]) => name === "policy" || name === "enable"),
      false
    );
  }
});

test("invalid method, media type, encoding, bearer, envelope, and body size stop before Auth or DB", async () => {
  const body = await encryptedBody();
  const cases = [
    request(null, { method: "GET" }),
    request(body, { headers: { "content-type": "text/plain" } }),
    request(body, { headers: { "content-encoding": "gzip" } }),
    request(body, { headers: { authorization: "bearer private-user-jwt" } }),
    request('{"version":1}', {}),
    request(body, { headers: { "content-length": String(PUSH_SUBSCRIPTION_ENVELOPE_MAX_BYTES + 1) } }),
  ];
  for (const candidate of cases) {
    const { calls, handler } = harness();
    const response = await handler(candidate);
    assert.equal(response.status, candidate.headers.get("authorization") === "bearer private-user-jwt" ? 401 : 400);
    assert.equal(
      calls.some(([name]) => name === "enable" || name === "refresh"),
      false
    );
  }
});

test("server-only provider policy rejects a foreign canonical endpoint before DB", async () => {
  const { calls, handler } = harness({
    loadProviderPolicy: async () => JSON.stringify(["https://another-provider.qiuka.tw"]),
  });
  const response = await handler(request(await encryptedBody()));
  assert.equal(response.status, 409);
  assert.equal(await response.text(), '{"kind":"endpoint-unavailable","version":1}');
  assert.equal(
    calls.some(([name]) => name === "enable"),
    false
  );
});

test("wrong AAD is invalid, unknown key and malformed server configuration are unavailable", async () => {
  const wrongAad = harness();
  const wrongAadResponse = await wrongAad.handler(request(await encryptedBody(enablePayload, OTHER_AUTH_USER_ID)));
  assert.equal(wrongAadResponse.status, 400);
  assert.equal(await wrongAadResponse.text(), '{"kind":"invalid","version":1}');
  assert.equal(
    wrongAad.calls.some(([name]) => name === "enable"),
    false
  );

  for (const overrides of [
    { loadKeyRing: async () => otherKeyRing },
    { loadProviderPolicy: async () => `${JSON.stringify([PROVIDER_ORIGIN])} ` },
    { loadServerVapidPublicKey: async () => "not-a-vapid-key" },
  ]) {
    const { calls, handler } = harness(overrides);
    const response = await handler(request(await encryptedBody()));
    assert.equal(response.status, 503);
    assert.equal(await response.text(), '{"kind":"unavailable","version":1}');
    assert.equal(
      calls.some(([name]) => name === "enable"),
      false
    );
  }
});

test("only exact DB results cross the Edge response boundary", async () => {
  const cases = [
    [{ kind: "invalid", version: 1 }, 400, '{"kind":"invalid","version":1}'],
    [{ kind: "stale", version: 1 }, 409, '{"kind":"stale","version":1}'],
    [{ kind: "endpoint-unavailable", version: 1 }, 409, '{"kind":"endpoint-unavailable","version":1}'],
    [{ kind: "runtime-disabled", version: 1 }, 503, '{"kind":"unavailable","version":1}'],
    [{ kind: "unavailable", version: 1 }, 503, '{"kind":"unavailable","version":1}'],
    [{ kind: "stale", version: 1, detail: "private" }, 503, '{"kind":"unavailable","version":1}'],
    [{ ...committed, bindingId: DEVICE_ID }, 503, '{"kind":"unavailable","version":1}'],
  ];
  const body = await encryptedBody();
  for (const [commandResult, status, expectedBody] of cases) {
    const { handler } = harness({ enableCommand: async () => commandResult });
    const response = await handler(request(body));
    assert.equal(response.status, status);
    assert.equal(await response.text(), expectedBody);
  }
});
