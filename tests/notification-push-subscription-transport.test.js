import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotificationPushSubscriptionTransport,
  NotificationPushSubscriptionTransportError,
  PUSH_SUBSCRIPTION_TRANSPORT_ERROR_CODES,
  PUSH_SUBSCRIPTION_TRANSPORT_MAX_POSTS,
} from "../src/notificationPushSubscriptionTransport.ts";
import { encodeBase64Url } from "../supabase/functions/_shared/push-cleanup-protocol.js";
import {
  canonicalPushSubscriptionEnvelopeJson,
  canonicalPushSubscriptionPublicKeyDocumentJson,
  PUSH_SUBSCRIPTION_AUTH_BYTES,
  PUSH_SUBSCRIPTION_PUBLIC_KEY_DOCUMENT_BYTES,
  pushSubscriptionRsaThumbprint,
} from "../supabase/functions/_shared/push-subscription-v2-protocol.js";
import {
  decryptPushSubscriptionEnvelope,
  loadPushSubscriptionPrivateKeyRing,
} from "../supabase/functions/push-subscription-v2/crypto.js";

const APP_ORIGIN = "https://qiuka.tw";
const SUBSCRIPTION_ENDPOINT = "https://project.supabase.co/functions/v1/push-subscription-v2";
const PUBLIC_KEY_URL = `${APP_ORIGIN}/push-subscription-key-v1.json`;
const PROVIDER_ORIGIN = "https://push-fixture.qiuka.tw";
const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const BINDING_ID = "22222222-2222-4222-8222-222222222222";
const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const CONSENT = Object.freeze({
  consentEpoch: "44444444-4444-4444-8444-444444444444",
  consentId: "41",
  consentVersion: "7",
});
const CLEANUP_TOKEN = encodeBase64Url(new Uint8Array(32).fill(7));
const JSON_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
});
const encoder = new TextEncoder();

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
const PRIVATE_KEY_RING = await loadPushSubscriptionPrivateKeyRing(JSON.stringify({ keys: [rsaKeys.privateJwk] }));
const PUBLIC_KEY_DOCUMENT = await canonicalPushSubscriptionPublicKeyDocumentJson(rsaKeys.publicJwk);
const SUBSCRIPTION = Object.freeze({
  auth: encodeBase64Url(new Uint8Array(PUSH_SUBSCRIPTION_AUTH_BYTES).fill(5)),
  endpoint: `${PROVIDER_ORIGIN}/send/opaque?token=a%2Fb`,
  p256dh: encodeBase64Url(p256dh),
});
const PROVISIONING = Object.freeze({ bindingId: BINDING_ID, cleanupToken: CLEANUP_TOKEN, deviceId: DEVICE_ID });
const ENABLED = Object.freeze({ bindingId: BINDING_ID, deviceId: DEVICE_ID, serverConsent: CONSENT });

function streamResponse(
  body,
  {
    chunks = [encoder.encode(body).byteLength],
    close = true,
    headers = JSON_HEADERS,
    redirected = false,
    status = 200,
    url = "",
  } = {}
) {
  const source = typeof body === "string" ? encoder.encode(body) : body;
  const queued = [];
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() {
      cancelled = true;
    },
    start(controller) {
      let offset = 0;
      for (const length of chunks) {
        const chunk = source.slice(offset, offset + length);
        queued.push(chunk);
        controller.enqueue(chunk);
        offset += length;
      }
      if (close) controller.close();
    },
  });
  const response = new Response(stream, { headers, status });
  Object.defineProperties(response, { redirected: { value: redirected }, url: { value: url } });
  return { chunks: queued, response, wasCancelled: () => cancelled };
}

function keyResponse(document = PUBLIC_KEY_DOCUMENT, options = {}) {
  return streamResponse(document, {
    chunks: [200, PUSH_SUBSCRIPTION_PUBLIC_KEY_DOCUMENT_BYTES - 200],
    headers: { ...JSON_HEADERS, "content-length": String(encoder.encode(document).byteLength) },
    url: PUBLIC_KEY_URL,
    ...options,
  });
}

function apiResponse(body, status, options = {}) {
  return streamResponse(body, {
    headers: { ...JSON_HEADERS, "content-length": String(encoder.encode(body).byteLength) },
    status,
    url: SUBSCRIPTION_ENDPOINT,
    ...options,
  });
}

function createTransport(fetchRef) {
  return createNotificationPushSubscriptionTransport({
    fetchRef,
    locationRef: { origin: APP_ORIGIN },
    subscriptionEndpoint: SUBSCRIPTION_ENDPOINT,
  });
}

function committed(consentVersion = "8") {
  return {
    bindingId: BINDING_ID,
    consentEpoch: CONSENT.consentEpoch,
    consentId: CONSENT.consentId,
    consentVersion,
    kind: "committed",
    version: 1,
  };
}

function enableInput(signal) {
  return {
    accessToken: "private-bearer",
    authUserId: AUTH_USER_ID,
    predecessor: CONSENT,
    provisioning: PROVISIONING,
    ...(signal ? { signal } : {}),
    subscription: SUBSCRIPTION,
  };
}

function refreshInput(signal) {
  return {
    accessToken: "private-bearer",
    authUserId: AUTH_USER_ID,
    binding: ENABLED,
    ...(signal ? { signal } : {}),
    subscription: SUBSCRIPTION,
  };
}

test("construction stays dormant and accepts only the fixed subscription endpoint", () => {
  let fetches = 0;
  const transport = createTransport(async () => {
    fetches += 1;
    throw new Error("must stay dormant");
  });
  assert.equal(typeof transport.loadPublicKey, "function");
  assert.equal(typeof transport.sendEnable, "function");
  assert.equal(typeof transport.sendRefresh, "function");
  assert.equal(fetches, 0);

  for (const subscriptionEndpoint of [
    "http://project.supabase.co/functions/v1/push-subscription-v2",
    `${SUBSCRIPTION_ENDPOINT}/`,
    `${SUBSCRIPTION_ENDPOINT}?alias=1`,
    `${SUBSCRIPTION_ENDPOINT}#alias`,
    "https://user:password@project.supabase.co/functions/v1/push-subscription-v2",
    "https://project.supabase.co/functions/v1/push-cleanup",
  ]) {
    assert.throws(
      () =>
        createNotificationPushSubscriptionTransport({
          fetchRef: async () => new Response(),
          locationRef: { origin: APP_ORIGIN },
          subscriptionEndpoint,
        }),
      /PUSH_SUBSCRIPTION_TRANSPORT_INVALID_CONFIGURATION/u
    );
  }
  assert.doesNotThrow(() =>
    createNotificationPushSubscriptionTransport({
      fetchRef: async () => new Response(),
      locationRef: { origin: "http://127.0.0.1:5174" },
      subscriptionEndpoint: "http://127.0.0.1:54321/functions/v1/push-subscription-v2",
    })
  );
});

test("the bounded loader reads only the exact same-origin 499-byte public key document", async () => {
  const served = keyResponse();
  const calls = [];
  const transport = createTransport(async (url, init) => {
    calls.push({ init, url });
    return served.response;
  });

  assert.deepEqual(await transport.loadPublicKey(), rsaKeys.publicJwk);
  assert.equal(encoder.encode(PUBLIC_KEY_DOCUMENT).byteLength, PUSH_SUBSCRIPTION_PUBLIC_KEY_DOCUMENT_BYTES);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, PUBLIC_KEY_URL);
  assert.deepEqual(calls[0].init, {
    cache: "no-store",
    credentials: "omit",
    headers: { accept: "application/json" },
    method: "GET",
    mode: "same-origin",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal: undefined,
  });
  assert.equal(
    served.chunks.every((chunk) => chunk.every((byte) => byte === 0)),
    true
  );
});

test("loader drift has one detail-free public-key error", async () => {
  const candidates = [
    keyResponse(undefined, { status: 404 }),
    keyResponse(undefined, { redirected: true }),
    keyResponse(undefined, { url: `${PUBLIC_KEY_URL}?alias=1` }),
    keyResponse(undefined, { headers: { "cache-control": "max-age=60", "content-type": "application/json" } }),
    streamResponse(PUBLIC_KEY_DOCUMENT.slice(0, -1), { headers: JSON_HEADERS, url: PUBLIC_KEY_URL }),
  ];
  for (const candidate of candidates) {
    const transport = createTransport(async () => candidate.response);
    await assert.rejects(transport.loadPublicKey(), (error) => {
      assert.ok(error instanceof NotificationPushSubscriptionTransportError);
      assert.equal(error.code, PUSH_SUBSCRIPTION_TRANSPORT_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE);
      assert.equal(error.message, PUSH_SUBSCRIPTION_TRANSPORT_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE);
      return true;
    });
  }
});

test("enable sends one bearer-authenticated envelope and Edge decrypts the exact token digest payload", async () => {
  const calls = [];
  const expected = committed();
  const transport = createTransport(async (url, init) => {
    calls.push({ init, url });
    return calls.length === 1 ? keyResponse().response : apiResponse(JSON.stringify(expected), 200).response;
  });

  assert.deepEqual(await transport.sendEnable(enableInput()), expected);
  assert.equal(PUSH_SUBSCRIPTION_TRANSPORT_MAX_POSTS, 1);
  assert.equal(calls.length, 2);
  const post = calls[1];
  assert.equal(post.url, SUBSCRIPTION_ENDPOINT);
  assert.equal(post.init.method, "POST");
  assert.equal(post.init.credentials, "omit");
  assert.equal(post.init.redirect, "error");
  assert.deepEqual(post.init.headers, {
    accept: "application/json",
    authorization: "Bearer private-bearer",
    "content-type": "application/json",
  });
  assert.equal(post.init.body.includes(CLEANUP_TOKEN), false);
  assert.equal(post.init.body.includes(SUBSCRIPTION.endpoint), false);
  const envelope = JSON.parse(post.init.body);
  assert.equal(canonicalPushSubscriptionEnvelopeJson(envelope), post.init.body);
  const decrypted = await decryptPushSubscriptionEnvelope(envelope, AUTH_USER_ID, [PROVIDER_ORIGIN], PRIVATE_KEY_RING);
  assert.equal(decrypted.kind, "payload");
  assert.deepEqual(decrypted.payload, {
    bindingId: BINDING_ID,
    cleanupTokenHash: "4bb06f8e4e3a7715d201d573d0aa423762e55dabd61a2c02278fa56cc6d294e0",
    deviceId: DEVICE_ID,
    kind: "enable",
    predecessor: CONSENT,
    subscription: SUBSCRIPTION,
    version: 1,
  });
});

test("refresh encrypts the exact expected consent and has no cleanup token field", async () => {
  const posts = [];
  const expected = committed("7");
  const transport = createTransport(async (_url, init) => {
    if (init.method === "GET") return keyResponse().response;
    posts.push(init.body);
    return apiResponse(JSON.stringify(expected), 200).response;
  });

  assert.deepEqual(await transport.sendRefresh(refreshInput()), expected);
  assert.equal(posts.length, 1);
  const decrypted = await decryptPushSubscriptionEnvelope(
    JSON.parse(posts[0]),
    AUTH_USER_ID,
    [PROVIDER_ORIGIN],
    PRIVATE_KEY_RING
  );
  assert.deepEqual(decrypted, {
    kind: "payload",
    payload: {
      bindingId: BINDING_ID,
      deviceId: DEVICE_ID,
      expectedConsent: CONSENT,
      kind: "refresh",
      subscription: SUBSCRIPTION,
      version: 1,
    },
  });
  assert.equal(JSON.stringify(decrypted).includes("cleanupToken"), false);
});

test("only exact status and canonical response pairs are returned", async () => {
  const cases = [
    { body: '{"kind":"invalid","version":1}', expected: { kind: "invalid", version: 1 }, status: 400 },
    { body: '{"kind":"stale","version":1}', expected: { kind: "stale", version: 1 }, status: 409 },
    {
      body: '{"kind":"endpoint-unavailable","version":1}',
      expected: { kind: "endpoint-unavailable", version: 1 },
      status: 409,
    },
    { body: '{"kind":"unavailable","version":1}', expected: { kind: "unavailable", version: 1 }, status: 503 },
  ];
  for (const { body, expected, status } of cases) {
    let calls = 0;
    const transport = createTransport(async () => {
      calls += 1;
      return calls === 1 ? keyResponse().response : apiResponse(body, status).response;
    });
    assert.deepEqual(await transport.sendRefresh(refreshInput()), expected);
    assert.equal(calls, 2);
  }
});

test("a structurally exact 401 is handed to Auth without reading its unspecified body", async () => {
  const unauthorized = apiResponse('{"message":"gateway detail"}', 401);
  let calls = 0;
  const transport = createTransport(async () => {
    calls += 1;
    return calls === 1 ? keyResponse().response : unauthorized.response;
  });

  assert.deepEqual(await transport.sendRefresh(refreshInput()), { kind: "unauthorized" });
  assert.equal(calls, 2);
  assert.equal(unauthorized.wasCancelled(), true);
});

test("response drift, abort, invalid local input, and network ambiguity stay unavailable without retry", async () => {
  const drift = [
    apiResponse('{"kind":"stale","version":1}', 200).response,
    apiResponse('{"version":1,"kind":"stale"}', 409).response,
    apiResponse('{"kind":"stale","version":1,"extra":true}', 409).response,
    apiResponse('{"kind":"stale","version":1}', 409, { redirected: true }).response,
    apiResponse('{"kind":"stale","version":1}', 409, { url: `${SUBSCRIPTION_ENDPOINT}?alias=1` }).response,
    apiResponse('{"kind":"stale","version":1}', 409, {
      headers: { "cache-control": "no-store", "content-type": "text/plain" },
    }).response,
  ];
  for (const response of drift) {
    let calls = 0;
    const transport = createTransport(async () => {
      calls += 1;
      return calls === 1 ? keyResponse().response : response;
    });
    assert.deepEqual(await transport.sendEnable(enableInput()), { kind: "unavailable", version: 1 });
    assert.equal(calls, 2);
  }

  const aborted = new AbortController();
  aborted.abort();
  let abortedCalls = 0;
  const abortedTransport = createTransport(async () => {
    abortedCalls += 1;
    return keyResponse().response;
  });
  assert.deepEqual(await abortedTransport.sendEnable(enableInput(aborted.signal)), {
    kind: "unavailable",
    version: 1,
  });
  assert.equal(abortedCalls, 0);

  let invalidCalls = 0;
  const invalidTransport = createTransport(async () => {
    invalidCalls += 1;
    return keyResponse().response;
  });
  assert.deepEqual(
    await invalidTransport.sendEnable({ ...enableInput(), provisioning: { ...PROVISIONING, cleanupToken: "invalid" } }),
    { kind: "unavailable", version: 1 }
  );
  assert.equal(invalidCalls, 0);

  let ambiguousCalls = 0;
  const ambiguousTransport = createTransport(async (_url, init) => {
    ambiguousCalls += 1;
    if (init.method === "GET") return keyResponse().response;
    throw new Error("unknown server outcome");
  });
  assert.deepEqual(await ambiguousTransport.sendRefresh(refreshInput()), { kind: "unavailable", version: 1 });
  assert.equal(ambiguousCalls, 2);
});

test("an oversized streamed response is cancelled and cannot trigger another POST", async () => {
  const maximumBody = JSON.stringify({
    bindingId: BINDING_ID,
    consentEpoch: CONSENT.consentEpoch,
    consentId: "9223372036854775807",
    consentVersion: "9223372036854775807",
    kind: "committed",
    version: 1,
  });
  const oversized = streamResponse(`${maximumBody}x`, {
    chunks: [encoder.encode(maximumBody).byteLength, 1],
    close: false,
    headers: JSON_HEADERS,
    status: 200,
    url: SUBSCRIPTION_ENDPOINT,
  });
  let calls = 0;
  const transport = createTransport(async () => {
    calls += 1;
    return calls === 1 ? keyResponse().response : oversized.response;
  });

  assert.deepEqual(await transport.sendRefresh(refreshInput()), { kind: "unavailable", version: 1 });
  assert.equal(calls, 2);
  assert.equal(oversized.wasCancelled(), true);
  assert.equal(
    oversized.chunks.every((chunk) => chunk.every((byte) => byte === 0)),
    true
  );
});
