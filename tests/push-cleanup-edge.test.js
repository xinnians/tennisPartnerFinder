import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canonicalCleanupEnvelopeJson,
  canonicalCleanupPublicJwkJson,
  canonicalCleanupPublicKeyDocumentJson,
  CLEANUP_KEY_RING_LIMIT,
  CLEANUP_PUBLIC_KEY_DOCUMENT_VERSION,
  CLEANUP_RSA_CIPHERTEXT_BYTES,
  CLEANUP_RSA_CIPHERTEXT_CHARACTERS,
  CLEANUP_RSA_LABEL_TEXT,
  CLEANUP_RSA_MODULUS_BITS,
  cleanupTokenDigestHex,
  decodeCanonicalCleanupToken,
  digestForCleanupEnvelope,
  encodeBase64Url,
  encryptCleanupTokenEnvelope,
  loadPrivateKeyRing,
  parseCanonicalCleanupPublicJwkJson,
  parseCanonicalCleanupPublicKeyDocument,
  rsaJwkThumbprint,
} from "../supabase/functions/push-cleanup/crypto.js";
import { CLEANUP_ENVELOPE_BYTES, createPushCleanupHandler } from "../supabase/functions/push-cleanup/handler.js";
import { cleanupRuntimeAccess, exactHttpOrigin } from "../supabase/functions/push-cleanup/runtime.js";

const ALLOWED_ORIGIN = "https://qiuka.tw";
const FIXED_TOKEN = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const FIXED_DIGEST = "630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd";
const FUNCTION_DIRECTORY = new URL("../supabase/functions/push-cleanup/", import.meta.url);
const RFC_7638_RSA_MODULUS =
  "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw";

async function generateTestKeys(modulusLength = 2048) {
  const pair = await crypto.subtle.generateKey(
    {
      hash: "SHA-256",
      modulusLength,
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
  const kid = await rsaJwkThumbprint(publicJwk);
  assert.equal(typeof kid, "string");
  return {
    privateJwk: { ...privateJwk, kid },
    publicJwk: { ...publicJwk, kid },
  };
}

const testKeys = await generateTestKeys();
const otherTestKeys = await generateTestKeys();
const testKeyRing = await loadPrivateKeyRing(JSON.stringify({ keys: [testKeys.privateJwk] }));

function mutateCiphertext(envelope) {
  return {
    ...envelope,
    ciphertext: `${envelope.ciphertext[0] === "A" ? "B" : "A"}${envelope.ciphertext.slice(1)}`,
  };
}

function jsonRequest(body, headers = {}) {
  return new Request("https://project.supabase.co/functions/v1/push-cleanup", {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", origin: ALLOWED_ORIGIN, ...headers },
    method: "POST",
  });
}

async function responseShape(response) {
  return {
    body: await response.json(),
    cacheControl: response.headers.get("cache-control"),
    corsOrigin: response.headers.get("access-control-allow-origin"),
    status: response.status,
    vary: response.headers.get("vary"),
  };
}

function handlerHarness(overrides = {}) {
  const calls = [];
  const handler = createPushCleanupHandler({
    allowedOrigin: ALLOWED_ORIGIN,
    hostedRuntime: false,
    loadKeyRing: async () => testKeyRing,
    localTestEnabled: true,
    quarantineByDigest: async (digestHex) => {
      calls.push(digestHex);
      return "OK";
    },
    ...overrides,
  });
  return { calls, handler };
}

function expectedResponse(outcome, status, corsOrigin = ALLOWED_ORIGIN) {
  return {
    body: { outcome },
    cacheControl: "no-store",
    corsOrigin,
    status,
    vary: "Origin",
  };
}

async function encryptRawPlaintext(plaintext, publicJwk, label = CLEANUP_RSA_LABEL_TEXT) {
  const key = await crypto.subtle.importKey("jwk", publicJwk, { hash: "SHA-256", name: "RSA-OAEP" }, false, [
    "encrypt",
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { label: new TextEncoder().encode(label), name: "RSA-OAEP" },
      key,
      new TextEncoder().encode(plaintext)
    )
  );
  return {
    ciphertext: encodeBase64Url(ciphertext),
    keyId: publicJwk.kid,
    version: 1,
  };
}

test("cleanup token codec hashes the decoded 32-byte fixed vector", async () => {
  assert.deepEqual([...decodeCanonicalCleanupToken(FIXED_TOKEN)], [...Array(32).keys()]);
  assert.equal(await cleanupTokenDigestHex(FIXED_TOKEN), FIXED_DIGEST);
});

test("RFC 7638 RSA example produces the published SHA-256 thumbprint", async () => {
  assert.equal(
    await rsaJwkThumbprint({ e: "AQAB", kty: "RSA", n: RFC_7638_RSA_MODULUS }),
    "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs"
  );
});

test("cleanup token codec rejects padded, malformed, and non-canonical base64url aliases", () => {
  const zeroToken = encodeBase64Url(new Uint8Array(32));
  assert.equal(zeroToken, "A".repeat(43));
  for (const invalid of [
    `${zeroToken}=`,
    zeroToken.slice(0, -1),
    `${zeroToken}A`,
    `${zeroToken.slice(0, -1)}B`,
    `${zeroToken.slice(0, -1)}C`,
    `${zeroToken.slice(0, -1)}D`,
    `${zeroToken.slice(0, -1)}+`,
  ]) {
    assert.equal(decodeCanonicalCleanupToken(invalid), null, invalid);
  }
});

test("private JWKS verifies RFC 7638 kid, exact usage, and key uniqueness", async () => {
  assert.equal(testKeys.privateJwk.kid, await rsaJwkThumbprint(testKeys.publicJwk));
  assert.equal(testKeys.privateJwk.kid.length, 43);
  assert.equal((await loadPrivateKeyRing(JSON.stringify({ keys: [testKeys.privateJwk] }))).size, 1);
  assert.equal(
    (await loadPrivateKeyRing(JSON.stringify({ keys: [testKeys.privateJwk, otherTestKeys.privateJwk] }))).size,
    CLEANUP_KEY_RING_LIMIT
  );

  await assert.rejects(loadPrivateKeyRing(JSON.stringify([testKeys.privateJwk])), /KEY_CONFIG_INVALID/);
  await assert.rejects(
    loadPrivateKeyRing(JSON.stringify({ keys: [testKeys.privateJwk, otherTestKeys.privateJwk, testKeys.privateJwk] })),
    /KEY_CONFIG_INVALID/
  );
  await assert.rejects(
    loadPrivateKeyRing(JSON.stringify({ keys: [{ ...testKeys.privateJwk, kid: otherTestKeys.privateJwk.kid }] })),
    /KEY_CONFIG_INVALID/
  );
  await assert.rejects(
    loadPrivateKeyRing(JSON.stringify({ keys: [testKeys.privateJwk, testKeys.privateJwk] })),
    /KEY_CONFIG_INVALID/
  );
  await assert.rejects(
    loadPrivateKeyRing(JSON.stringify({ keys: [{ ...testKeys.privateJwk, key_ops: ["decrypt", "unwrapKey"] }] })),
    /KEY_CONFIG_INVALID/
  );
  await assert.rejects(
    loadPrivateKeyRing(JSON.stringify({ keys: [{ ...testKeys.privateJwk, e: "AAEAAQ" }] })),
    /KEY_CONFIG_INVALID/
  );
  await assert.rejects(
    loadPrivateKeyRing(JSON.stringify({ keys: [{ ...testKeys.privateJwk, unexpected: true }] })),
    /KEY_CONFIG_INVALID/
  );
});

test("public-key v1 document is canonical, public-only, and bound to its RFC 7638 kid", async () => {
  const canonicalJwk = await canonicalCleanupPublicJwkJson(testKeys.publicJwk);
  const canonicalDocument = await canonicalCleanupPublicKeyDocumentJson(testKeys.publicJwk);

  assert.equal(CLEANUP_PUBLIC_KEY_DOCUMENT_VERSION, 1);
  assert.equal(
    canonicalJwk,
    JSON.stringify({
      alg: "RSA-OAEP-256",
      e: "AQAB",
      ext: true,
      key_ops: ["encrypt"],
      kid: testKeys.publicJwk.kid,
      kty: "RSA",
      n: testKeys.publicJwk.n,
    })
  );
  assert.equal(canonicalDocument, `{"key":${canonicalJwk},"version":1}`);
  assert.deepEqual(await parseCanonicalCleanupPublicJwkJson(canonicalJwk), JSON.parse(canonicalJwk));
  assert.deepEqual(await parseCanonicalCleanupPublicKeyDocument(canonicalDocument), JSON.parse(canonicalJwk));
  for (const privateMember of ["d", "dp", "dq", "p", "q", "qi"]) {
    assert.equal(Object.hasOwn(JSON.parse(canonicalDocument).key, privateMember), false);
  }
});

test("public-key config rejects aliases, duplicate or private fields, and document drift", async () => {
  const canonicalJwk = await canonicalCleanupPublicJwkJson(testKeys.publicJwk);
  const canonicalDocument = await canonicalCleanupPublicKeyDocumentJson(testKeys.publicJwk);
  const parsedJwk = JSON.parse(canonicalJwk);
  const privateJwk = JSON.stringify({ ...parsedJwk, d: "AQ" });
  const duplicateAlgorithm = canonicalJwk.replace(
    '{"alg":"RSA-OAEP-256"',
    '{"alg":"RSA-OAEP-256","alg":"RSA-OAEP-256"'
  );

  for (const invalid of ["", `${canonicalJwk}\n`, duplicateAlgorithm, privateJwk, JSON.stringify(testKeys.publicJwk)]) {
    await assert.rejects(parseCanonicalCleanupPublicJwkJson(invalid), /PUBLIC_KEY_INVALID/);
  }
  await assert.rejects(
    parseCanonicalCleanupPublicJwkJson(JSON.stringify({ ...parsedJwk, kid: otherTestKeys.publicJwk.kid })),
    /PUBLIC_KEY_INVALID/
  );
  for (const invalid of [
    `${canonicalDocument}\n`,
    canonicalDocument.replace('"version":1', '"version":2'),
    canonicalDocument.replace('"version":1', '"version":1,"extra":true'),
    JSON.stringify({ version: 1, key: parsedJwk }),
  ]) {
    await assert.rejects(parseCanonicalCleanupPublicKeyDocument(invalid), /PUBLIC_KEY_DOCUMENT_INVALID/);
  }
});

test("private JWKS rejects a structurally valid key whose private CRT values cannot decrypt", async () => {
  const corruptedPrivateJwk = {
    ...testKeys.privateJwk,
    d: "AQ",
    dp: "AQ",
    dq: "AQ",
    p: "AQ",
    q: "AQ",
    qi: "AQ",
  };

  await assert.rejects(loadPrivateKeyRing(JSON.stringify({ keys: [corruptedPrivateJwk] })), /KEY_CONFIG_INVALID/);
});

test("v1 freezes a two-key 2048-bit ring and derives the canonical 425-byte body", async () => {
  assert.equal(CLEANUP_RSA_LABEL_TEXT, "qiuka.tw/push-cleanup-token/v1");
  assert.equal(
    Buffer.from(new TextEncoder().encode(CLEANUP_RSA_LABEL_TEXT)).toString("hex"),
    "7169756b612e74772f707573682d636c65616e75702d746f6b656e2f7631"
  );
  assert.equal(CLEANUP_RSA_MODULUS_BITS, 2048);
  assert.equal(CLEANUP_RSA_CIPHERTEXT_BYTES, 256);
  assert.equal(CLEANUP_RSA_CIPHERTEXT_CHARACTERS, 342);
  assert.equal(CLEANUP_ENVELOPE_BYTES, 425);

  const envelope = await encryptCleanupTokenEnvelope(FIXED_TOKEN, testKeys.publicJwk);
  const canonicalBody = canonicalCleanupEnvelopeJson(envelope);
  assert.equal(new TextEncoder().encode(canonicalBody).byteLength, CLEANUP_ENVELOPE_BYTES);
  assert.equal(canonicalBody, JSON.stringify(envelope));
  await assert.rejects(
    encryptCleanupTokenEnvelope(FIXED_TOKEN, { ...testKeys.publicJwk, kid: undefined }),
    /PUBLIC_KEY_INVALID/
  );
});

test("v1 rejects 1024-bit and 3072-bit RSA keys instead of changing its body contract", async () => {
  const rejectedKeys = await Promise.all([generateTestKeys(1024), generateTestKeys(3072)]);
  for (const keys of rejectedKeys) {
    await assert.rejects(loadPrivateKeyRing(JSON.stringify({ keys: [keys.privateJwk] })), /KEY_CONFIG_INVALID/);
    await assert.rejects(encryptCleanupTokenEnvelope(FIXED_TOKEN, keys.publicJwk), /PUBLIC_KEY_INVALID/);
  }
});

test("RSA-OAEP envelope is randomized and decrypts to the decoded-token digest", async () => {
  const first = await encryptCleanupTokenEnvelope(FIXED_TOKEN, testKeys.publicJwk);
  const second = await encryptCleanupTokenEnvelope(FIXED_TOKEN, testKeys.publicJwk);

  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(first.keyId, testKeys.publicJwk.kid);
  assert.equal(first.version, 1);
  assert.equal(first.ciphertext.includes(FIXED_TOKEN), false);
  assert.deepEqual(await digestForCleanupEnvelope(first, testKeyRing), {
    decrypted: true,
    digestHex: FIXED_DIGEST,
    kind: "digest",
  });
});

test("valid-shape OAEP failure uses a random digest instead of skipping the DB boundary", async () => {
  const encrypted = await encryptCleanupTokenEnvelope(FIXED_TOKEN, testKeys.publicJwk);
  const deterministicCrypto = {
    getRandomValues(bytes) {
      bytes.fill(0x5a);
      return bytes;
    },
    subtle: crypto.subtle,
  };
  const expectedFallback = await cleanupTokenDigestHex(encodeBase64Url(new Uint8Array(32).fill(0x5a)));

  assert.deepEqual(await digestForCleanupEnvelope(mutateCiphertext(encrypted), testKeyRing, deterministicCrypto), {
    decrypted: false,
    digestHex: expectedFallback,
    kind: "digest",
  });
  assert.deepEqual(await digestForCleanupEnvelope({ ...encrypted, keyId: otherTestKeys.publicJwk.kid }, testKeyRing), {
    kind: "key-unavailable",
  });
});

test("each OAEP fallback gets fresh random bytes before decrypt and hashes once afterward", async () => {
  const encrypted = mutateCiphertext(await encryptCleanupTokenEnvelope(FIXED_TOKEN, testKeys.publicJwk));
  const operations = [];
  let randomCalls = 0;
  const orderedCrypto = {
    getRandomValues(bytes) {
      operations.push("random");
      randomCalls += 1;
      bytes.fill(randomCalls);
      return bytes;
    },
    subtle: {
      async decrypt(...arguments_) {
        operations.push("decrypt");
        return crypto.subtle.decrypt(...arguments_);
      },
      async digest(...arguments_) {
        operations.push("digest");
        return crypto.subtle.digest(...arguments_);
      },
    },
  };

  const first = await digestForCleanupEnvelope(encrypted, testKeyRing, orderedCrypto);
  assert.deepEqual(operations, ["random", "decrypt", "digest"]);
  operations.length = 0;
  const second = await digestForCleanupEnvelope(encrypted, testKeyRing, orderedCrypto);
  assert.deepEqual(operations, ["random", "decrypt", "digest"]);
  assert.equal(randomCalls, 2);
  assert.notEqual(first.digestHex, second.digestHex);
});

test("current and previous keys decrypt, while a retired public kid asks the client to retry", async () => {
  const rotatingRing = await loadPrivateKeyRing(
    JSON.stringify({ keys: [testKeys.privateJwk, otherTestKeys.privateJwk] })
  );
  const currentEnvelope = await encryptCleanupTokenEnvelope(FIXED_TOKEN, testKeys.publicJwk);
  const previousEnvelope = await encryptCleanupTokenEnvelope(FIXED_TOKEN, otherTestKeys.publicJwk);

  for (const envelope of [currentEnvelope, previousEnvelope]) {
    assert.deepEqual(await digestForCleanupEnvelope(envelope, rotatingRing), {
      decrypted: true,
      digestHex: FIXED_DIGEST,
      kind: "digest",
    });
  }

  const { calls, handler } = handlerHarness();
  assert.deepEqual(await responseShape(await handler(jsonRequest(previousEnvelope))), expectedResponse("RETRY", 503));
  assert.deepEqual(calls, []);
});

test("runtime gate requires exact local mode and treats deployment or region markers as hosted", () => {
  const access = (environment) => cleanupRuntimeAccess((name) => environment[name] ?? "");

  assert.deepEqual(access({}), { hostedRuntime: false, localTestEnabled: false });
  assert.deepEqual(access({ PUSH_CLEANUP_RUNTIME_MODE: "local-test" }), {
    hostedRuntime: false,
    localTestEnabled: false,
  });
  assert.deepEqual(access({ PUSH_CLEANUP_RUNTIME_MODE: "local-test-v1" }), {
    hostedRuntime: false,
    localTestEnabled: true,
  });
  assert.deepEqual(access({ PUSH_CLEANUP_RUNTIME_MODE: "local-test-v1", SB_EXECUTION_ID: "local-isolate" }), {
    hostedRuntime: false,
    localTestEnabled: true,
  });
  for (const marker of ["DENO_DEPLOYMENT_ID", "SB_REGION"]) {
    assert.deepEqual(access({ [marker]: "hosted", PUSH_CLEANUP_RUNTIME_MODE: "local-test-v1" }), {
      hostedRuntime: true,
      localTestEnabled: false,
    });
  }
});

test("allowed origin config accepts only an exact HTTP(S) origin", () => {
  assert.equal(exactHttpOrigin("https://qiuka.tw"), "https://qiuka.tw");
  assert.equal(exactHttpOrigin("http://127.0.0.1:5173"), "http://127.0.0.1:5173");
  for (const invalid of [
    "",
    "null",
    "https://qiuka.tw/",
    "https://qiuka.tw/path",
    "https://qiuka.tw?x=1",
    "ftp://qiuka.tw",
    "https://user:password@qiuka.tw",
  ]) {
    assert.equal(exactHttpOrigin(invalid), "", invalid);
  }
});

test("disabled and hosted handlers stop before body read, key import, decryption, or RPC", async () => {
  for (const access of [
    { hostedRuntime: false, localTestEnabled: false },
    { hostedRuntime: true, localTestEnabled: true },
  ]) {
    let bodyReads = 0;
    let keyLoads = 0;
    let rpcCalls = 0;
    const handler = createPushCleanupHandler({
      ...access,
      allowedOrigin: ALLOWED_ORIGIN,
      loadKeyRing: async () => {
        keyLoads += 1;
        return testKeyRing;
      },
      quarantineByDigest: async () => {
        rpcCalls += 1;
        return "OK";
      },
    });
    const request = {
      get body() {
        bodyReads += 1;
        throw new Error("body must remain unread");
      },
      headers: new Headers({ "content-type": "application/json", origin: ALLOWED_ORIGIN }),
      method: "POST",
    };

    assert.deepEqual(await responseShape(await handler(request)), expectedResponse("RETRY", 503));
    assert.deepEqual({ bodyReads, keyLoads, rpcCalls }, { bodyReads: 0, keyLoads: 0, rpcCalls: 0 });
  }
});

test("valid cleanup envelope calls only the digest command and returns the fixed OK shape", async () => {
  const envelope = await encryptCleanupTokenEnvelope(FIXED_TOKEN, testKeys.publicJwk);
  const { calls, handler } = handlerHarness();

  assert.deepEqual(await responseShape(await handler(jsonRequest(envelope))), expectedResponse("OK", 200));
  assert.deepEqual(calls, [FIXED_DIGEST]);
});

test("tampered valid-shape envelope still calls the fixed DB boundary and looks identical", async () => {
  const envelope = mutateCiphertext(await encryptCleanupTokenEnvelope(FIXED_TOKEN, testKeys.publicJwk));
  const { calls, handler } = handlerHarness();

  assert.deepEqual(await responseShape(await handler(jsonRequest(envelope))), expectedResponse("OK", 200));
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^[0-9a-f]{64}$/u);
});

test("wrong OAEP label and encrypted non-canonical tokens still use one fallback DB call", async () => {
  const zeroToken = encodeBase64Url(new Uint8Array(32));
  const invalidAlias = `${zeroToken.slice(0, -1)}B`;
  const envelopes = [
    await encryptRawPlaintext(FIXED_TOKEN, testKeys.publicJwk, "wrong-label"),
    await encryptRawPlaintext(invalidAlias, testKeys.publicJwk),
  ];

  for (const envelope of envelopes) {
    const { calls, handler } = handlerHarness();
    assert.deepEqual(await responseShape(await handler(jsonRequest(envelope))), expectedResponse("OK", 200));
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^[0-9a-f]{64}$/u);
    assert.notEqual(calls[0], FIXED_DIGEST);
  }
});

test("malformed, non-canonical, encoded, and oversized bodies stay fixed OK without RPC", async () => {
  const envelope = await encryptCleanupTokenEnvelope(FIXED_TOKEN, testKeys.publicJwk);
  const cases = [
    jsonRequest("{"),
    jsonRequest({ ...envelope, extra: FIXED_TOKEN }),
    jsonRequest(JSON.stringify({ keyId: envelope.keyId, ciphertext: envelope.ciphertext, version: 1 })),
    jsonRequest(` ${JSON.stringify(envelope)}`),
    jsonRequest(envelope, { "content-encoding": "gzip" }),
    jsonRequest("x".repeat(CLEANUP_ENVELOPE_BYTES + 1)),
    jsonRequest(envelope, { "content-length": String(CLEANUP_ENVELOPE_BYTES + 1) }),
    new Request("https://project.supabase.co/functions/v1/push-cleanup", {
      body: JSON.stringify(envelope),
      headers: { "content-type": "text/plain", origin: ALLOWED_ORIGIN },
      method: "POST",
    }),
  ];

  const { calls, handler } = handlerHarness();
  for (const request of cases) {
    assert.deepEqual(await responseShape(await handler(request)), expectedResponse("OK", 200));
  }
  assert.deepEqual(calls, []);
});

test("a chunked body is accepted at the exact derived boundary and cancelled at boundary plus one", async () => {
  const envelope = await encryptCleanupTokenEnvelope(FIXED_TOKEN, testKeys.publicJwk);
  const canonicalBody = JSON.stringify(envelope);
  const exact = new Request("https://project.supabase.co/functions/v1/push-cleanup", {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(canonicalBody.slice(0, 200)));
        controller.enqueue(new TextEncoder().encode(canonicalBody.slice(200)));
        controller.close();
      },
    }),
    duplex: "half",
    headers: { "content-type": "application/json", origin: ALLOWED_ORIGIN },
    method: "POST",
  });
  let cancelled = false;
  const oversized = new Request("https://project.supabase.co/functions/v1/push-cleanup", {
    body: new ReadableStream({
      cancel() {
        cancelled = true;
      },
      start(controller) {
        controller.enqueue(new Uint8Array(CLEANUP_ENVELOPE_BYTES));
        controller.enqueue(new Uint8Array(1));
      },
    }),
    duplex: "half",
    headers: { "content-type": "application/json", origin: ALLOWED_ORIGIN },
    method: "POST",
  });

  const { calls, handler } = handlerHarness();
  assert.deepEqual(await responseShape(await handler(exact)), expectedResponse("OK", 200));
  assert.deepEqual(await responseShape(await handler(oversized)), expectedResponse("OK", 200));
  assert.equal(cancelled, true);
  assert.deepEqual(calls, [FIXED_DIGEST]);
});

test("DB failure returns fixed RETRY without reflecting token, digest, ciphertext, or error", async () => {
  const envelope = await encryptCleanupTokenEnvelope(FIXED_TOKEN, testKeys.publicJwk);
  const handler = createPushCleanupHandler({
    allowedOrigin: ALLOWED_ORIGIN,
    hostedRuntime: false,
    loadKeyRing: async () => testKeyRing,
    localTestEnabled: true,
    quarantineByDigest: async () => {
      throw new Error(`must-not-reflect:${FIXED_TOKEN}:${FIXED_DIGEST}:${envelope.ciphertext}`);
    },
  });
  const response = await handler(jsonRequest(envelope));
  const body = await response.text();

  assert.equal(response.status, 503);
  assert.equal(body, '{"outcome":"RETRY"}');
  for (const secret of [FIXED_TOKEN, FIXED_DIGEST, envelope.ciphertext, "must-not-reflect"]) {
    assert.equal(body.includes(secret), false);
  }
});

test("key, random, digest, and DB boundary failures all return the same fixed RETRY", async () => {
  const envelope = await encryptCleanupTokenEnvelope(FIXED_TOKEN, testKeys.publicJwk);
  const cases = [
    {
      loadKeyRing: async () => {
        throw new Error("key-config-detail");
      },
      quarantineByDigest: async () => "OK",
    },
    {
      cryptoRef: {
        getRandomValues() {
          throw new Error("random-detail");
        },
        subtle: crypto.subtle,
      },
      loadKeyRing: async () => testKeyRing,
      quarantineByDigest: async () => "OK",
    },
    {
      loadKeyRing: async () => testKeyRing,
      quarantineByDigest: async () => ({ outcome: "OK" }),
    },
  ];

  for (const dependencies of cases) {
    const handler = createPushCleanupHandler({
      allowedOrigin: ALLOWED_ORIGIN,
      hostedRuntime: false,
      localTestEnabled: true,
      ...dependencies,
    });
    assert.deepEqual(await responseShape(await handler(jsonRequest(envelope))), expectedResponse("RETRY", 503));
  }
});

test("CORS preflight and non-POST method never touch crypto or DB", async () => {
  let calls = 0;
  const { handler } = handlerHarness({
    loadKeyRing: async () => {
      calls += 1;
      return testKeyRing;
    },
    quarantineByDigest: async () => {
      calls += 1;
      return "OK";
    },
  });
  const options = await handler(
    new Request("https://project.supabase.co/functions/v1/push-cleanup", {
      headers: { origin: ALLOWED_ORIGIN },
      method: "OPTIONS",
    })
  );
  const get = await handler(
    new Request("https://project.supabase.co/functions/v1/push-cleanup", {
      headers: { origin: ALLOWED_ORIGIN },
    })
  );

  assert.equal(options.status, 204);
  assert.equal(options.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
  assert.equal(options.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  assert.equal(options.headers.get("access-control-allow-headers"), "content-type");
  assert.equal(options.headers.get("access-control-allow-credentials"), null);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST, OPTIONS");
  assert.equal(calls, 0);
});

test("foreign, null, suffix, and missing origins stop before body, keys, crypto, or DB", async () => {
  for (const origin of [undefined, "null", "https://evil.example", "https://qiuka.tw.evil.example"]) {
    let bodyReads = 0;
    let dependencyCalls = 0;
    const handler = createPushCleanupHandler({
      allowedOrigin: ALLOWED_ORIGIN,
      hostedRuntime: false,
      loadKeyRing: async () => {
        dependencyCalls += 1;
        return testKeyRing;
      },
      localTestEnabled: true,
      quarantineByDigest: async () => {
        dependencyCalls += 1;
        return "OK";
      },
    });
    const headers = new Headers({ "content-type": "application/json" });
    if (origin !== undefined) headers.set("origin", origin);
    const request = {
      get body() {
        bodyReads += 1;
        throw new Error("body must remain unread");
      },
      headers,
      method: "POST",
    };

    assert.deepEqual(await responseShape(await handler(request)), expectedResponse("FORBIDDEN", 403, null));
    assert.deepEqual({ bodyReads, dependencyCalls }, { bodyReads: 0, dependencyCalls: 0 });
  }
});

test("Edge source has no application logging and only the approved RPC name", () => {
  const sharedProtocolSource = readFileSync(new URL("../_shared/push-cleanup-protocol.js", FUNCTION_DIRECTORY), "utf8");
  const cryptoSource = readFileSync(new URL("crypto.js", FUNCTION_DIRECTORY), "utf8");
  const handlerSource = readFileSync(new URL("handler.js", FUNCTION_DIRECTORY), "utf8");
  const indexSource = readFileSync(new URL("index.ts", FUNCTION_DIRECTORY), "utf8");
  const allSource = `${sharedProtocolSource}\n${cryptoSource}\n${handlerSource}\n${indexSource}`;

  assert.doesNotMatch(allSource, /console\./u);
  assert.doesNotMatch(allSource, /access-control-allow-origin["']?\s*:\s*["']\*["']/u);
  assert.doesNotMatch(handlerSource, /request\.(?:json|text)\(/u);
  assert.match(indexSource, /rest\/v1\/rpc\/quarantine_push_by_token/u);
  assert.match(indexSource, /redirect:\s*["']error["']/u);
  assert.doesNotMatch(indexSource, /push_subscriptions|push_device_consents|push_endpoint_registry/u);
  assert.doesNotMatch(indexSource, /PUSH_CLEANUP_RUNTIME_MODE[^\n]+production/u);
  assert.doesNotMatch(sharedProtocolSource, /loadPrivateKeyRing|subtle\.decrypt|PUSH_CLEANUP_PRIVATE/u);

  const configSource = readFileSync(new URL("../../config.toml", FUNCTION_DIRECTORY), "utf8");
  assert.match(configSource, /\[functions\.push-cleanup\]\s*verify_jwt\s*=\s*false/u);
});
