import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createValidatedWebPushRequest,
  createWebPushHttp1Head,
  dispatcherDatabaseTimestampMs,
  DISPATCH_V2_RESPONSE_HEADER_MAX_BYTES,
  findHttpHeaderTerminator,
  parseProviderHttp1ResponseHead,
  readDispatcherV2DenoWebPushConfig,
  safeIntegerFromCanonicalDecimal,
} from "../supabase/functions/notification-outbox-dispatch/v2-web-push-core.js";

const ENDPOINT = "https://updates.push.services.mozilla.com/wpush/v2/test?x=1";
const AUTHORIZATION = "vapid t=header.payload.signature, k=public_key";

function environment(values) {
  return (name) => values[name] ?? "";
}

function validDetails(body = Uint8Array.of(1, 2, 3)) {
  return {
    body,
    endpoint: ENDPOINT,
    headers: {
      Authorization: AUTHORIZATION,
      "Content-Encoding": "aes128gcm",
      "Content-Length": body.byteLength,
      "Content-Type": "application/octet-stream",
      TTL: 60,
      Urgency: "normal",
    },
    method: "POST",
  };
}

test("Deno Web Push configuration has no defaults and requires the exact transport marker", () => {
  const values = {
    PUSH_PROVIDER_ORIGINS_V1: '["https://updates.push.services.mozilla.com"]',
    WEB_PUSH_TRANSPORT: "deno-native-web-push-v1",
    WEB_PUSH_VAPID_PRIVATE_KEY: "private",
    WEB_PUSH_VAPID_PUBLIC_KEY: "public",
    WEB_PUSH_VAPID_SUBJECT: "mailto:push@example.test",
  };
  assert.deepEqual(readDispatcherV2DenoWebPushConfig(environment(values)), {
    serializedProviderOrigins: values.PUSH_PROVIDER_ORIGINS_V1,
    vapidPrivateKey: values.WEB_PUSH_VAPID_PRIVATE_KEY,
    vapidPublicKey: values.WEB_PUSH_VAPID_PUBLIC_KEY,
    vapidSubject: values.WEB_PUSH_VAPID_SUBJECT,
  });
  for (const overrides of [
    { WEB_PUSH_TRANSPORT: "mock" },
    { WEB_PUSH_VAPID_PRIVATE_KEY: "" },
    { WEB_PUSH_VAPID_PUBLIC_KEY: " public" },
    { PUSH_PROVIDER_ORIGINS_V1: "" },
  ]) {
    assert.throws(
      () => readDispatcherV2DenoWebPushConfig(environment({ ...values, ...overrides })),
      /DISPATCH_V2_WEB_PUSH_CONFIG_INVALID/u
    );
  }
});

test("request-detail generation is pinned to aes128gcm, exact TTL, normal urgency, and per-call VAPID", () => {
  const calls = [];
  const subscription = { endpoint: ENDPOINT, keys: { auth: "auth", p256dh: "p256dh" } };
  const request = createValidatedWebPushRequest({
    endpoint: ENDPOINT,
    generateRequestDetails: (...args) => {
      calls.push(args);
      return validDetails();
    },
    message: '{"title":"test"}',
    subscription,
    ttlSeconds: 60,
    vapidPrivateKey: "private",
    vapidPublicKey: "public",
    vapidSubject: "mailto:push@example.test",
  });
  assert.deepEqual(calls, [
    [
      subscription,
      '{"title":"test"}',
      {
        TTL: 60,
        contentEncoding: "aes128gcm",
        urgency: "normal",
        vapidDetails: { privateKey: "private", publicKey: "public", subject: "mailto:push@example.test" },
      },
    ],
  ]);
  assert.deepEqual([...request.body], [1, 2, 3]);

  for (const details of [
    { ...validDetails(), endpoint: "https://attacker.example/push" },
    { ...validDetails(), redirect: "follow" },
    { ...validDetails(), headers: { ...validDetails().headers, TTL: 61 } },
    { ...validDetails(), headers: { ...validDetails().headers, Authorization: "vapid good\r\nx-evil: 1" } },
    { ...validDetails(), headers: { ...validDetails().headers, "Content-Length": 2 } },
  ]) {
    assert.throws(
      () =>
        createValidatedWebPushRequest({
          endpoint: ENDPOINT,
          generateRequestDetails: () => details,
          message: "{}",
          subscription,
          ttlSeconds: 60,
          vapidPrivateKey: "private",
          vapidPublicKey: "public",
          vapidSubject: "mailto:push@example.test",
        }),
      /DISPATCH_V2_WEB_PUSH_MATERIAL_INVALID/u
    );
  }
});

test("HTTP/1.1 request serialization uses only the exact generated headers and closes the socket", () => {
  const serialized = new TextDecoder().decode(createWebPushHttp1Head(ENDPOINT, validDetails().headers));
  assert.equal(
    serialized,
    [
      "POST /wpush/v2/test?x=1 HTTP/1.1",
      "Host: updates.push.services.mozilla.com",
      `Authorization: ${AUTHORIZATION}`,
      "Content-Encoding: aes128gcm",
      "Content-Length: 3",
      "Content-Type: application/octet-stream",
      "TTL: 60",
      "Urgency: normal",
      "Connection: close",
      "",
      "",
    ].join("\r\n")
  );
  assert.throws(
    () => createWebPushHttp1Head(ENDPOINT, { ...validDetails().headers, "X-Extra": "no" }),
    /DISPATCH_V2_WEB_PUSH_MATERIAL_INVALID/u
  );
});

test("provider response parsing is bounded, rejects folding and duplicates, and preserves Retry-After evidence", () => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode("HTTP/1.1 429 Too Many Requests\r\nRetry-After:\t120 \r\nConnection: close\r\n\r\n");
  assert.equal(findHttpHeaderTerminator(bytes), bytes.byteLength);
  assert.deepEqual(parseProviderHttp1ResponseHead(bytes), { retryAfter: "120", statusCode: 429 });
  assert.deepEqual(parseProviderHttp1ResponseHead(encoder.encode("HTTP/1.1 201 Created\r\nX-Test: ok\r\n\r\n")), {
    retryAfter: null,
    statusCode: 201,
  });

  for (const response of [
    "HTTP/2 201\r\n\r\n",
    "HTTP/1.1 199 Continue\r\n\r\n",
    "HTTP/1.1 429 Too Many Requests\r\n Retry-After: 10\r\n\r\n",
    "HTTP/1.1 429 Too Many Requests\r\nRetry-After: 10\r\nretry-after: 11\r\n\r\n",
    "HTTP/1.1 201 Created\n\n",
  ]) {
    assert.throws(
      () => parseProviderHttp1ResponseHead(encoder.encode(response)),
      /DISPATCH_V2_PROVIDER_RESPONSE_INVALID/u
    );
  }
  assert.throws(
    () => parseProviderHttp1ResponseHead(new Uint8Array(DISPATCH_V2_RESPONSE_HEADER_MAX_BYTES + 1)),
    /DISPATCH_V2_PROVIDER_RESPONSE_INVALID/u
  );
});

test("DB timestamps and millisecond strings stay exact before TTL math", () => {
  assert.equal(dispatcherDatabaseTimestampMs("2026-09-07T00:00:00.123456+00:00"), 1_788_739_200_123);
  assert.equal(safeIntegerFromCanonicalDecimal("0"), 0);
  assert.equal(safeIntegerFromCanonicalDecimal("5000", { positive: true }), 5000);
  for (const value of ["", "01", "-1", "9007199254740992"]) {
    assert.throws(() => safeIntegerFromCanonicalDecimal(value), /DISPATCH_V2_WEB_PUSH_MATERIAL_INVALID/u);
  }
  assert.throws(() => dispatcherDatabaseTimestampMs("2026-09-07 00:00:00"), /DISPATCH_V2_WEB_PUSH_MATERIAL_INVALID/u);
});

test("Deno adapter uses web-push only for request generation and owns the pinned socket itself", () => {
  const source = readFileSync(
    new URL("../supabase/functions/notification-outbox-dispatch/v2-deno-web-push.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /webpush\.generateRequestDetails/u);
  assert.match(source, /Deno\.connect/u);
  assert.match(source, /Deno\.startTls/u);
  assert.doesNotMatch(source, /webpush\.sendNotification|\bfetch\s*\(/u);
  assert.doesNotMatch(source, /\b(?:console|logger|Sentry)\./u);
});
