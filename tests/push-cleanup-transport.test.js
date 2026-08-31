import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotificationPushCleanupTransport,
  NotificationPushCleanupTransportError,
  PUSH_CLEANUP_TRANSPORT_ERROR_CODES,
  PUSH_CLEANUP_TRANSPORT_MAX_POSTS,
} from "../src/notificationPushCleanupTransport.ts";
import {
  canonicalCleanupEnvelopeJson,
  canonicalCleanupPublicKeyDocumentJson,
  CLEANUP_ENVELOPE_BYTES,
  CLEANUP_PUBLIC_KEY_DOCUMENT_BYTES,
  encodeBase64Url,
  encryptCleanupTokenEnvelope,
} from "../supabase/functions/_shared/push-cleanup-protocol.js";
import { CLEANUP_PUBLIC_JWKS, FIXED_CLEANUP_TOKEN } from "./fixtures/pushCleanupPublicKeys.js";

const APP_ORIGIN = "https://qiuka.tw";
const CLEANUP_ENDPOINT = "https://project.supabase.co/functions/v1/push-cleanup";
const PUBLIC_KEY_URL = `${APP_ORIGIN}/push-cleanup-key-v1.json`;
const JSON_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
});
const encoder = new TextEncoder();
const PUBLIC_KEY_DOCUMENTS = await Promise.all(
  CLEANUP_PUBLIC_JWKS.map((publicJwk) => canonicalCleanupPublicKeyDocumentJson(publicJwk))
);

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
  Object.defineProperties(response, {
    redirected: { value: redirected },
    url: { value: url },
  });
  return {
    chunks: queued,
    response,
    wasCancelled: () => cancelled,
  };
}

function keyResponse(document = PUBLIC_KEY_DOCUMENTS[0], options = {}) {
  return streamResponse(document, {
    chunks: [200, CLEANUP_PUBLIC_KEY_DOCUMENT_BYTES - 200],
    headers: {
      ...JSON_HEADERS,
      "content-length": String(encoder.encode(document).byteLength),
    },
    url: PUBLIC_KEY_URL,
    ...options,
  });
}

function cleanupResponse(outcome, status, options = {}) {
  const body = JSON.stringify({ outcome });
  return streamResponse(body, {
    headers: { ...JSON_HEADERS, "content-length": String(encoder.encode(body).byteLength) },
    status,
    url: CLEANUP_ENDPOINT,
    ...options,
  });
}

function createTransport(fetchRef) {
  return createNotificationPushCleanupTransport({
    cleanupEndpoint: CLEANUP_ENDPOINT,
    fetchRef,
    locationRef: { origin: APP_ORIGIN },
  });
}

async function assertPublicKeyUnavailable(response) {
  const transport = createTransport(async () => response);
  await assert.rejects(transport.loadPublicKey(), (error) => {
    assert.ok(error instanceof NotificationPushCleanupTransportError);
    assert.equal(error.code, PUSH_CLEANUP_TRANSPORT_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE);
    assert.equal(error.message, PUSH_CLEANUP_TRANSPORT_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE);
    return true;
  });
}

test("transport construction is dormant and accepts only an exact cleanup endpoint", () => {
  let fetches = 0;
  const transport = createTransport(async () => {
    fetches += 1;
    throw new Error("must stay dormant");
  });
  assert.equal(typeof transport.loadPublicKey, "function");
  assert.equal(fetches, 0);

  for (const cleanupEndpoint of [
    "http://project.supabase.co/functions/v1/push-cleanup",
    "https://project.supabase.co/functions/v1/push-cleanup/",
    "https://project.supabase.co/functions/v1/push-cleanup?alias=1",
    "https://project.supabase.co/functions/v1/push-cleanup#alias",
    "https://user:password@project.supabase.co/functions/v1/push-cleanup",
    "https://project.supabase.co/functions/v1/other",
  ]) {
    assert.throws(
      () =>
        createNotificationPushCleanupTransport({
          cleanupEndpoint,
          fetchRef: async () => new Response(),
          locationRef: { origin: APP_ORIGIN },
        }),
      /PUSH_CLEANUP_TRANSPORT_INVALID_CONFIGURATION/u
    );
  }
  assert.doesNotThrow(() =>
    createNotificationPushCleanupTransport({
      cleanupEndpoint: "http://127.0.0.1:54321/functions/v1/push-cleanup",
      fetchRef: async () => new Response(),
      locationRef: { origin: "http://127.0.0.1:5174" },
    })
  );
  assert.throws(
    () =>
      createNotificationPushCleanupTransport({
        cleanupEndpoint: CLEANUP_ENDPOINT,
        fetchRef: async () => new Response(),
        locationRef: { origin: "http://qiuka.tw" },
      }),
    /PUSH_CLEANUP_TRANSPORT_INVALID_CONFIGURATION/u
  );
});

test("shared browser encryption wipes its mutable ciphertext buffer after encoding", async () => {
  const ciphertext = new Uint8Array(256).fill(0x5a);
  const expectedCiphertext = encodeBase64Url(ciphertext.slice());
  const subtle = {
    digest: (...arguments_) => crypto.subtle.digest(...arguments_),
    encrypt: async () => ciphertext.buffer,
    importKey: (...arguments_) => crypto.subtle.importKey(...arguments_),
  };

  const envelope = await encryptCleanupTokenEnvelope(FIXED_CLEANUP_TOKEN, CLEANUP_PUBLIC_JWKS[0], { subtle });
  assert.equal(envelope.ciphertext, expectedCiphertext);
  assert.equal(
    ciphertext.every((byte) => byte === 0),
    true
  );
});

test("bounded loader reads the fixed same-origin document without credentials or redirects", async () => {
  const served = keyResponse();
  const calls = [];
  const transport = createTransport(async (url, init) => {
    calls.push({ init, url });
    return served.response;
  });

  assert.deepEqual(await transport.loadPublicKey(), CLEANUP_PUBLIC_JWKS[0]);
  assert.equal(PUBLIC_KEY_DOCUMENTS[0].length, CLEANUP_PUBLIC_KEY_DOCUMENT_BYTES);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, PUBLIC_KEY_URL);
  assert.deepEqual(
    {
      cache: calls[0].init.cache,
      credentials: calls[0].init.credentials,
      headers: calls[0].init.headers,
      method: calls[0].init.method,
      mode: calls[0].init.mode,
      redirect: calls[0].init.redirect,
      referrerPolicy: calls[0].init.referrerPolicy,
    },
    {
      cache: "no-store",
      credentials: "omit",
      headers: { accept: "application/json" },
      method: "GET",
      mode: "same-origin",
      redirect: "error",
      referrerPolicy: "no-referrer",
    }
  );
  assert.equal(
    served.chunks.every((chunk) => chunk.every((byte) => byte === 0)),
    true
  );
});

test("loader rejects status, headers, redirect, URL, length, UTF-8, and canonical drift with one fixed error", async () => {
  const invalidUtf8 = new Uint8Array(CLEANUP_PUBLIC_KEY_DOCUMENT_BYTES).fill(0x80);
  const cases = [
    keyResponse(undefined, { status: 404 }),
    keyResponse(undefined, { headers: { "cache-control": "no-store", "content-type": "text/html" } }),
    keyResponse(undefined, { headers: { "cache-control": "max-age=60", "content-type": "application/json" } }),
    keyResponse(undefined, { redirected: true }),
    keyResponse(undefined, { url: `${PUBLIC_KEY_URL}?alias=1` }),
    streamResponse(PUBLIC_KEY_DOCUMENTS[0].slice(0, -1), { headers: JSON_HEADERS, url: PUBLIC_KEY_URL }),
    streamResponse(invalidUtf8, { headers: JSON_HEADERS, url: PUBLIC_KEY_URL }),
    streamResponse(PUBLIC_KEY_DOCUMENTS[0].replace('"version":1', '"version":2'), {
      headers: JSON_HEADERS,
      url: PUBLIC_KEY_URL,
    }),
  ];

  for (const candidate of cases) await assertPublicKeyUnavailable(candidate.response);

  const declaredOversize = keyResponse(undefined, {
    close: false,
    headers: { ...JSON_HEADERS, "content-length": String(CLEANUP_PUBLIC_KEY_DOCUMENT_BYTES + 1) },
  });
  await assertPublicKeyUnavailable(declaredOversize.response);
  assert.equal(declaredOversize.wasCancelled(), true);

  const streamedOversize = streamResponse(`${PUBLIC_KEY_DOCUMENTS[0]}x`, {
    chunks: [CLEANUP_PUBLIC_KEY_DOCUMENT_BYTES, 1],
    close: false,
    headers: JSON_HEADERS,
    url: PUBLIC_KEY_URL,
  });
  await assertPublicKeyUnavailable(streamedOversize.response);
  assert.equal(streamedOversize.wasCancelled(), true);
  assert.equal(
    streamedOversize.chunks.every((chunk) => chunk.every((byte) => byte === 0)),
    true
  );
});

test("a fixed OK completes once and sends only the canonical encrypted envelope", async () => {
  const calls = [];
  const transport = createTransport(async (url, init) => {
    calls.push({ init, url });
    return calls.length === 1 ? keyResponse().response : cleanupResponse("OK", 200).response;
  });

  const result = await transport.sendPushCleanup({ cleanupToken: FIXED_CLEANUP_TOKEN });
  assert.deepEqual(result, { kind: "completed" });
  assert.equal(calls.length, 2);
  const post = calls[1];
  assert.equal(post.url, CLEANUP_ENDPOINT);
  assert.equal(post.init.method, "POST");
  assert.equal(post.init.credentials, "omit");
  assert.equal(post.init.redirect, "error");
  assert.equal(post.init.referrerPolicy, "no-referrer");
  assert.equal(post.init.signal, undefined);
  assert.deepEqual(post.init.headers, { accept: "application/json", "content-type": "application/json" });
  assert.equal(typeof post.init.body, "string");
  assert.equal(encoder.encode(post.init.body).byteLength, CLEANUP_ENVELOPE_BYTES);
  assert.equal(post.init.body.includes(FIXED_CLEANUP_TOKEN), false);
  const envelope = JSON.parse(post.init.body);
  assert.equal(canonicalCleanupEnvelopeJson(envelope), post.init.body);
  assert.equal(envelope.keyId, CLEANUP_PUBLIC_JWKS[0].kid);
  assert.equal(Object.keys(result).includes("cleanupToken"), false);
});

test("an exact RETRY refetches, rotates the key, re-encrypts once, and then completes", async () => {
  const posts = [];
  let keyLoads = 0;
  const transport = createTransport(async (_url, init) => {
    if (init.method === "GET") {
      const response = keyResponse(PUBLIC_KEY_DOCUMENTS[keyLoads]).response;
      keyLoads += 1;
      return response;
    }
    posts.push(init.body);
    return posts.length === 1 ? cleanupResponse("RETRY", 503).response : cleanupResponse("OK", 200).response;
  });

  assert.deepEqual(await transport.sendPushCleanup({ cleanupToken: FIXED_CLEANUP_TOKEN }), { kind: "completed" });
  assert.equal(PUSH_CLEANUP_TRANSPORT_MAX_POSTS, 2);
  assert.equal(keyLoads, 2);
  assert.equal(posts.length, 2);
  const envelopes = posts.map(JSON.parse);
  assert.deepEqual(
    envelopes.map(({ keyId }) => keyId),
    CLEANUP_PUBLIC_JWKS.map(({ kid }) => kid)
  );
  assert.notEqual(envelopes[0].ciphertext, envelopes[1].ciphertext);
  assert.equal(
    posts.every((body) => !body.includes(FIXED_CLEANUP_TOKEN)),
    true
  );
});

test("a second RETRY stays pending after two POSTs and never loops", async () => {
  let gets = 0;
  const posts = [];
  const transport = createTransport(async (_url, init) => {
    if (init.method === "GET") {
      gets += 1;
      return keyResponse().response;
    }
    posts.push(init.body);
    return cleanupResponse("RETRY", 503).response;
  });

  assert.deepEqual(await transport.sendPushCleanup({ cleanupToken: FIXED_CLEANUP_TOKEN }), { kind: "pending" });
  assert.equal(gets, 2);
  assert.equal(posts.length, 2);
  assert.deepEqual(
    posts.map((body) => encoder.encode(body).byteLength),
    [CLEANUP_ENVELOPE_BYTES, CLEANUP_ENVELOPE_BYTES]
  );
  assert.equal(
    posts.every((body) => canonicalCleanupEnvelopeJson(JSON.parse(body)) === body),
    true
  );
  assert.notEqual(JSON.parse(posts[0]).ciphertext, JSON.parse(posts[1]).ciphertext);
});

test("network ambiguity, a supplied signal, and non-exact responses stay pending without an immediate replay", async () => {
  const abortController = new AbortController();
  const cases = [
    {
      expectedCalls: 1,
      fetchRef: async () => {
        throw new Error("key network detail");
      },
      name: "key network failure",
    },
    {
      expectedCalls: 2,
      fetchRef: (() => {
        let calls = 0;
        return async (_url, init) => {
          calls += 1;
          if (calls === 1) return keyResponse().response;
          assert.equal(init.signal, abortController.signal);
          throw new Error(`unknown acceptance:${FIXED_CLEANUP_TOKEN}`);
        };
      })(),
      name: "ambiguous POST failure",
    },
    ...[
      { name: "RETRY with 200", response: cleanupResponse("RETRY", 200).response },
      {
        name: "OK without no-store",
        response: cleanupResponse("OK", 200, { headers: { "content-type": "application/json" } }).response,
      },
      { name: "OK with 503", response: cleanupResponse("OK", 503).response },
      {
        name: "OK with trailing newline",
        response: streamResponse('{"outcome":"OK"}\n', {
          headers: JSON_HEADERS,
          status: 200,
          url: CLEANUP_ENDPOINT,
        }).response,
      },
      {
        name: "OK from a different URL",
        response: cleanupResponse("OK", 200, { url: `${CLEANUP_ENDPOINT}?alias=1` }).response,
      },
      { name: "redirected OK", response: cleanupResponse("OK", 200, { redirected: true }).response },
      {
        name: "OK with text content type",
        response: cleanupResponse("OK", 200, {
          headers: { "cache-control": "no-store", "content-type": "text/plain" },
        }).response,
      },
    ].map(({ name, response }) => ({
      expectedCalls: 2,
      fetchRef: (() => {
        let calls = 0;
        return async () => {
          calls += 1;
          return calls === 1 ? keyResponse().response : response;
        };
      })(),
      name,
    })),
  ];

  for (const { expectedCalls, fetchRef, name } of cases) {
    let calls = 0;
    const countedFetch = async (...arguments_) => {
      calls += 1;
      return fetchRef(...arguments_);
    };
    const transport = createTransport(countedFetch);
    const result = await transport.sendPushCleanup({
      cleanupToken: FIXED_CLEANUP_TOKEN,
      signal: abortController.signal,
    });
    assert.deepEqual(result, { kind: "pending" }, name);
    assert.equal(calls, expectedCalls, name);
  }
});

test("an abort before or immediately after key loading stops before encryption and POST", async () => {
  const before = new AbortController();
  before.abort();
  let beforeFetches = 0;
  const beforeTransport = createTransport(async () => {
    beforeFetches += 1;
    return keyResponse().response;
  });
  assert.deepEqual(
    await beforeTransport.sendPushCleanup({ cleanupToken: FIXED_CLEANUP_TOKEN, signal: before.signal }),
    { kind: "pending" }
  );
  assert.equal(beforeFetches, 0);

  const after = new AbortController();
  let afterFetches = 0;
  const afterTransport = createTransport(async () => {
    afterFetches += 1;
    after.abort();
    return keyResponse().response;
  });
  assert.deepEqual(await afterTransport.sendPushCleanup({ cleanupToken: FIXED_CLEANUP_TOKEN, signal: after.signal }), {
    kind: "pending",
  });
  assert.equal(afterFetches, 1);
});

test("oversized cleanup responses are cancelled and cannot complete or trigger another POST", async () => {
  const oversizedBody = `${'{"outcome":"RETRY"}'}x`;
  const oversized = streamResponse(oversizedBody, {
    chunks: [19, 1],
    close: false,
    headers: JSON_HEADERS,
    status: 503,
    url: CLEANUP_ENDPOINT,
  });
  let calls = 0;
  const transport = createTransport(async () => {
    calls += 1;
    return calls === 1 ? keyResponse().response : oversized.response;
  });

  assert.deepEqual(await transport.sendPushCleanup({ cleanupToken: FIXED_CLEANUP_TOKEN }), { kind: "pending" });
  assert.equal(calls, 2);
  assert.equal(oversized.wasCancelled(), true);
  assert.equal(
    oversized.chunks.every((chunk) => chunk.every((byte) => byte === 0)),
    true
  );
});

test("invalid local tokens stop before key fetch and never appear in the fixed error", async () => {
  let fetches = 0;
  const transport = createTransport(async () => {
    fetches += 1;
    return keyResponse().response;
  });
  const invalid = `${FIXED_CLEANUP_TOKEN}=`;
  await assert.rejects(transport.sendPushCleanup({ cleanupToken: invalid }), (error) => {
    assert.equal(error.code, PUSH_CLEANUP_TRANSPORT_ERROR_CODES.INVALID_INPUT);
    assert.equal(error.message.includes(invalid), false);
    return true;
  });
  assert.equal(fetches, 0);
});
