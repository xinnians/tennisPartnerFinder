import { expect, test } from "@playwright/test";

import { canonicalCleanupPublicKeyDocumentJson } from "../supabase/functions/_shared/push-cleanup-protocol.js";
import { CLEANUP_PUBLIC_JWKS } from "./fixtures/pushCleanupPublicKeys.js";

const APP_ORIGIN = "http://127.0.0.1:5174";
const CLEANUP_ENDPOINT = "https://project.supabase.co/functions/v1/push-cleanup";
const PUBLIC_KEY_URL = `${APP_ORIGIN}/push-cleanup-key-v1.json`;
const PUBLIC_KEY_DOCUMENTS = await Promise.all(
  CLEANUP_PUBLIC_JWKS.map((publicJwk) => canonicalCleanupPublicKeyDocumentJson(publicJwk))
);

test("real browser WebCrypto and streams enforce the bounded fixed key document", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(
    async ({ cleanupEndpoint, document, expectedKey, publicKeyUrl }) => {
      const { createNotificationPushCleanupTransport } = await import("/src/notificationPushCleanupTransport.ts");
      const encoder = new TextEncoder();
      const makeResponse = (body, { chunks, close = true }) => {
        const source = encoder.encode(body);
        const queued = [];
        let cancelled = false;
        const response = new Response(
          new ReadableStream({
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
          }),
          {
            headers: {
              "cache-control": "no-store",
              "content-type": "application/json; charset=utf-8",
            },
            status: 200,
          }
        );
        Object.defineProperty(response, "url", { value: publicKeyUrl });
        return { cancelled: () => cancelled, chunks: queued, response };
      };

      const valid = makeResponse(document, { chunks: [177, 322] });
      const calls = [];
      const transport = createNotificationPushCleanupTransport({
        cleanupEndpoint,
        fetchRef: async (url, init) => {
          calls.push({
            cache: init.cache,
            credentials: init.credentials,
            headers: init.headers,
            method: init.method,
            mode: init.mode,
            redirect: init.redirect,
            referrerPolicy: init.referrerPolicy,
            url,
          });
          return valid.response;
        },
      });
      const loaded = await transport.loadPublicKey();

      const oversized = makeResponse(`${document}x`, { chunks: [499, 1], close: false });
      const rejectingTransport = createNotificationPushCleanupTransport({
        cleanupEndpoint,
        fetchRef: async () => oversized.response,
      });
      let oversizedCode = null;
      try {
        await rejectingTransport.loadPublicKey();
      } catch (error) {
        oversizedCode = error instanceof Error && "code" in error ? error.code : null;
      }

      return {
        calls,
        keyMatches: JSON.stringify(loaded) === JSON.stringify(expectedKey),
        oversizedCancelled: oversized.cancelled(),
        oversizedChunksWiped: oversized.chunks.every((chunk) => chunk.every((byte) => byte === 0)),
        oversizedCode,
        validChunksWiped: valid.chunks.every((chunk) => chunk.every((byte) => byte === 0)),
      };
    },
    {
      cleanupEndpoint: CLEANUP_ENDPOINT,
      document: PUBLIC_KEY_DOCUMENTS[0],
      expectedKey: CLEANUP_PUBLIC_JWKS[0],
      publicKeyUrl: PUBLIC_KEY_URL,
    }
  );

  expect(result).toEqual({
    calls: [
      {
        cache: "no-store",
        credentials: "omit",
        headers: { accept: "application/json" },
        method: "GET",
        mode: "same-origin",
        redirect: "error",
        referrerPolicy: "no-referrer",
        url: PUBLIC_KEY_URL,
      },
    ],
    keyMatches: true,
    oversizedCancelled: true,
    oversizedChunksWiped: true,
    oversizedCode: "PUSH_CLEANUP_PUBLIC_KEY_UNAVAILABLE",
    validChunksWiped: true,
  });
});

test("real browser rotation refetches and re-encrypts exactly once without exposing the token", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(
    async ({ cleanupEndpoint, documents }) => {
      const { createNotificationPushCleanupTransport, PUSH_CLEANUP_TRANSPORT_MAX_POSTS } =
        await import("/src/notificationPushCleanupTransport.ts");
      const { canonicalCleanupEnvelopeJson, encodeBase64Url } =
        await import("/supabase/functions/_shared/push-cleanup-protocol.js");
      const encoder = new TextEncoder();
      const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
      const token = encodeBase64Url(tokenBytes);
      tokenBytes.fill(0);
      const response = (body, status, url) => {
        const value = new Response(body, {
          headers: {
            "cache-control": "no-store",
            "content-type": "application/json; charset=utf-8",
          },
          status,
        });
        Object.defineProperty(value, "url", { value: url });
        return value;
      };

      let keyLoads = 0;
      const posts = [];
      const callOrder = [];
      const transport = createNotificationPushCleanupTransport({
        cleanupEndpoint,
        fetchRef: async (url, init) => {
          callOrder.push(init.method);
          if (init.method === "GET") {
            const body = documents[keyLoads];
            keyLoads += 1;
            return response(body, 200, url);
          }
          posts.push({ body: init.body, headers: init.headers, url });
          return posts.length === 1
            ? response('{"outcome":"RETRY"}', 503, url)
            : response('{"outcome":"OK"}', 200, url);
        },
      });
      const outcome = await transport.sendPushCleanup({ cleanupToken: token });
      const envelopes = posts.map(({ body }) => JSON.parse(body));

      let retryPosts = 0;
      let retryGets = 0;
      const retryBodies = [];
      const retryOnly = createNotificationPushCleanupTransport({
        cleanupEndpoint,
        fetchRef: async (url, init) => {
          if (init.method === "GET") {
            retryGets += 1;
            return response(documents[0], 200, url);
          }
          retryPosts += 1;
          retryBodies.push(init.body);
          return response('{"outcome":"RETRY"}', 503, url);
        },
      });
      const exhausted = await retryOnly.sendPushCleanup({ cleanupToken: token });
      const retryEnvelopes = retryBodies.map((body) => JSON.parse(body));

      return {
        bodyBytes: posts.map(({ body }) => encoder.encode(body).byteLength),
        callOrder,
        ciphertextChanged: envelopes[0].ciphertext !== envelopes[1].ciphertext,
        exhausted,
        headers: posts.map(({ headers }) => headers),
        keyIds: envelopes.map(({ keyId }) => keyId),
        maxPosts: PUSH_CLEANUP_TRANSPORT_MAX_POSTS,
        outcome,
        retryGets,
        retryPosts,
        retryBodiesCanonical: retryBodies.every((body) => canonicalCleanupEnvelopeJson(JSON.parse(body)) === body),
        retryBodyBytes: retryBodies.map((body) => encoder.encode(body).byteLength),
        retryCiphertextChanged: retryEnvelopes[0].ciphertext !== retryEnvelopes[1].ciphertext,
        tokenAbsent:
          posts.every(({ body, headers, url }) =>
            [body, JSON.stringify(headers), url].every((value) => !value.includes(token))
          ) && retryBodies.every((body) => !body.includes(token)),
      };
    },
    {
      cleanupEndpoint: CLEANUP_ENDPOINT,
      documents: PUBLIC_KEY_DOCUMENTS,
    }
  );

  expect(result).toEqual({
    bodyBytes: [425, 425],
    callOrder: ["GET", "POST", "GET", "POST"],
    ciphertextChanged: true,
    exhausted: { kind: "pending" },
    headers: [
      { accept: "application/json", "content-type": "application/json" },
      { accept: "application/json", "content-type": "application/json" },
    ],
    keyIds: CLEANUP_PUBLIC_JWKS.map(({ kid }) => kid),
    maxPosts: 2,
    outcome: { kind: "completed" },
    retryGets: 2,
    retryPosts: 2,
    retryBodiesCanonical: true,
    retryBodyBytes: [425, 425],
    retryCiphertextChanged: true,
    tokenAbsent: true,
  });
});

test("an exact browser OK removes only the original durable pending attempt", async ({ page }) => {
  await page.goto("/");
  const completed = await page.evaluate(
    async ({ cleanupEndpoint, document }) => {
      const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
      const { createNotificationPushCleanupTransport } = await import("/src/notificationPushCleanupTransport.ts");
      const storage = createNotificationPushStorage();
      const authUserId = "11111111-1111-4111-8111-111111111111";
      const deviceId = await storage.getOrCreateLogicalDeviceId();
      const provisioning = await storage.beginExplicitPushProvisioning({
        authUserId,
        deviceId,
        expectedCurrentRevision: null,
      });
      const enabled = await storage.commitPushProvisioning({
        authUserId,
        bindingId: provisioning.bindingId,
        consentEpoch: "22222222-2222-4222-8222-222222222222",
        consentId: "1",
        consentVersion: "1",
        deviceId,
        expectedLocalRevision: provisioning.localRevision,
      });
      const suspended = await storage.suspendCurrentPushBinding({
        authUserId,
        bindingId: enabled.bindingId,
        expectedLocalRevision: enabled.localRevision,
        reason: "user_logout",
      });
      if (!suspended.attempt) return { attemptMissing: true };

      const callOrder = [];
      let tokenAbsent = true;
      const response = (body, status, url) => {
        const value = new Response(body, {
          headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
          status,
        });
        Object.defineProperty(value, "url", { value: url });
        return value;
      };
      const transport = createNotificationPushCleanupTransport({
        cleanupEndpoint,
        fetchRef: async (url, init) => {
          callOrder.push(init.method);
          if (init.method === "GET") return response(document, 200, url);
          tokenAbsent = [String(init.body), JSON.stringify(init.headers), String(url)].every(
            (value) => !value.includes(suspended.attempt.cleanupToken)
          );
          return response('{"outcome":"OK"}', 200, url);
        },
      });
      const before = await storage.listPendingPushCleanups();
      const outcome = await transport.sendPushCleanup({ cleanupToken: suspended.attempt.cleanupToken });
      const exactCompleted =
        outcome.kind === "completed" ? await storage.completePendingPushCleanup(suspended.attempt) : false;
      return {
        attemptId: suspended.attempt.attemptId,
        callOrder,
        exactCompleted,
        outcome,
        pendingAfter: (await storage.listPendingPushCleanups()).length,
        pendingBefore: before.length,
        runtimeAfter: (await storage.readPushRuntimeState()).kind,
        tokenAbsent,
      };
    },
    { cleanupEndpoint: CLEANUP_ENDPOINT, document: PUBLIC_KEY_DOCUMENTS[0] }
  );
  expect(completed).toMatchObject({
    callOrder: ["GET", "POST"],
    exactCompleted: true,
    outcome: { kind: "completed" },
    pendingAfter: 0,
    pendingBefore: 1,
    runtimeAfter: "disabled",
    tokenAbsent: true,
  });

  await page.reload();
  const afterReload = await page.evaluate(async () => {
    const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
    const storage = createNotificationPushStorage();
    return {
      pending: (await storage.listPendingPushCleanups()).length,
      runtime: (await storage.readPushRuntimeState()).kind,
    };
  });
  expect(afterReload).toEqual({ pending: 0, runtime: "disabled" });
});

test("an ambiguous aborted POST keeps the exact pending attempt across reload", async ({ page }) => {
  await page.goto("/");
  const pending = await page.evaluate(
    async ({ cleanupEndpoint, document }) => {
      const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
      const { createNotificationPushCleanupTransport } = await import("/src/notificationPushCleanupTransport.ts");
      const storage = createNotificationPushStorage();
      const authUserId = "11111111-1111-4111-8111-111111111111";
      const deviceId = await storage.getOrCreateLogicalDeviceId();
      const provisioning = await storage.beginExplicitPushProvisioning({
        authUserId,
        deviceId,
        expectedCurrentRevision: null,
      });
      const enabled = await storage.commitPushProvisioning({
        authUserId,
        bindingId: provisioning.bindingId,
        consentEpoch: "22222222-2222-4222-8222-222222222222",
        consentId: "1",
        consentVersion: "1",
        deviceId,
        expectedLocalRevision: provisioning.localRevision,
      });
      const suspended = await storage.suspendCurrentPushBinding({
        authUserId,
        bindingId: enabled.bindingId,
        expectedLocalRevision: enabled.localRevision,
        reason: "user_logout",
      });
      if (!suspended.attempt) return { attemptMissing: true };

      const abortController = new AbortController();
      let postCalls = 0;
      let tokenAbsent = true;
      const transport = createNotificationPushCleanupTransport({
        cleanupEndpoint,
        fetchRef: async (url, init) => {
          if (init.method === "GET") {
            const value = new Response(document, {
              headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
              status: 200,
            });
            Object.defineProperty(value, "url", { value: url });
            return value;
          }
          postCalls += 1;
          tokenAbsent = [String(init.body), JSON.stringify(init.headers), String(url)].every(
            (value) => !value.includes(suspended.attempt.cleanupToken)
          );
          abortController.abort();
          throw new DOMException("request aborted", "AbortError");
        },
      });
      const outcome = await transport.sendPushCleanup({
        cleanupToken: suspended.attempt.cleanupToken,
        signal: abortController.signal,
      });
      const [stored] = await storage.listPendingPushCleanups();
      return {
        attemptPreserved: stored?.attemptId === suspended.attempt.attemptId,
        outcome,
        pendingCount: stored ? 1 : 0,
        postCalls,
        tokenAbsent,
      };
    },
    { cleanupEndpoint: CLEANUP_ENDPOINT, document: PUBLIC_KEY_DOCUMENTS[0] }
  );
  expect(pending).toEqual({
    attemptPreserved: true,
    outcome: { kind: "pending" },
    pendingCount: 1,
    postCalls: 1,
    tokenAbsent: true,
  });

  await page.reload();
  const afterReload = await page.evaluate(async () => {
    const { createNotificationPushStorage } = await import("/src/notificationPushStorage.ts");
    const storage = createNotificationPushStorage();
    const attempts = await storage.listPendingPushCleanups();
    return { pending: attempts.length, runtime: (await storage.readPushRuntimeState()).kind };
  });
  expect(afterReload).toEqual({ pending: 1, runtime: "cleanup-pending" });
});
