import { canonicalCleanupEnvelopeJson, CLEANUP_ENVELOPE_BYTES, digestForCleanupEnvelope } from "./crypto.js";

export { CLEANUP_ENVELOPE_BYTES };

export const PUSH_CLEANUP_LIMITER_CANARY_OUTCOME_HEADER = "x-qiuka-cleanup-limiter-outcome";

const BASE_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  pragma: "no-cache",
  vary: "Origin",
  "x-content-type-options": "nosniff",
});

function response(outcome, status, corsOrigin, additionalHeaders = {}) {
  return new Response(JSON.stringify({ outcome }), {
    headers: {
      ...BASE_HEADERS,
      ...(corsOrigin ? { "access-control-allow-origin": corsOrigin } : {}),
      ...additionalHeaders,
    },
    status,
  });
}

function okResponse(corsOrigin) {
  return response("OK", 200, corsOrigin);
}

function retryResponse(corsOrigin, additionalHeaders = {}) {
  return response("RETRY", 503, corsOrigin, additionalHeaders);
}

function allowedContentType(request) {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

function allowedContentEncoding(request) {
  const encoding = request.headers.get("content-encoding")?.trim().toLowerCase();
  return !encoding || encoding === "identity";
}

async function readBoundedBody(request) {
  const wipeChunks = (chunks) => {
    for (const chunk of chunks) chunk.fill(0);
  };
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(declaredLength) || Number(declaredLength) > CLEANUP_ENVELOPE_BYTES) {
      return null;
    }
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > CLEANUP_ENVELOPE_BYTES) {
        value.fill(0);
        wipeChunks(chunks);
        try {
          await reader.cancel();
        } catch {
          // The request is already rejected; cancellation is best-effort.
        }
        return null;
      }
      chunks.push(value);
    }
  } catch {
    wipeChunks(chunks);
    return null;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (declaredLength !== null && Number(declaredLength) !== total) {
    bytes.fill(0);
    wipeChunks(chunks);
    return null;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  } finally {
    bytes.fill(0);
    wipeChunks(chunks);
  }
}

export function createPushCleanupHandler({
  allowedOrigin,
  authorizeHostedLimiterCanary,
  consumeRateLimit,
  hostedLimiterCanaryEnabled,
  cryptoRef = globalThis.crypto,
  hostedRuntime,
  loadKeyRing,
  localTestEnabled,
  quarantineByDigest,
}) {
  return async function pushCleanupHandler(request) {
    const corsOrigin = request.headers.get("origin") === allowedOrigin && allowedOrigin ? allowedOrigin : null;

    // Hosted canary mode is deliberately limited to one authenticated POST
    // through the limiter. It cannot read the body, load cleanup keys, decrypt,
    // or call the quarantine command. All other hosted traffic stays hard-gated.
    if (hostedRuntime) {
      let canaryAuthorized;
      try {
        canaryAuthorized =
          hostedLimiterCanaryEnabled && request.method === "POST" && authorizeHostedLimiterCanary(request) === true;
      } catch {
        return retryResponse(corsOrigin);
      }
      if (!canaryAuthorized) return retryResponse(corsOrigin);

      try {
        const limiterOutcome = await consumeRateLimit(request);
        if (limiterOutcome !== "ALLOW" && limiterOutcome !== "LIMIT") return retryResponse(corsOrigin);
        return retryResponse(corsOrigin, {
          [PUSH_CLEANUP_LIMITER_CANARY_OUTCOME_HEADER]: limiterOutcome,
        });
      } catch {
        return retryResponse(corsOrigin);
      }
    }

    if (!localTestEnabled) return retryResponse(corsOrigin);

    // This is a browser-only boundary. Missing, null, suffix-matched, and
    // reflected origins stop before body, key, crypto, or database work.
    if (!corsOrigin) return response("FORBIDDEN", 403, null);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          ...BASE_HEADERS,
          "access-control-allow-origin": corsOrigin,
          "access-control-allow-headers": "content-type",
          "access-control-allow-methods": "POST, OPTIONS",
        },
        status: 204,
      });
    }

    if (request.method !== "POST") {
      return response("METHOD_NOT_ALLOWED", 405, corsOrigin, { allow: "POST, OPTIONS" });
    }

    try {
      if ((await consumeRateLimit(request)) !== "ALLOW") return retryResponse(corsOrigin);
    } catch {
      return retryResponse(corsOrigin);
    }

    if (!allowedContentType(request) || !allowedContentEncoding(request)) return okResponse(corsOrigin);
    const body = await readBoundedBody(request);
    if (body === null) return okResponse(corsOrigin);

    let envelope;
    try {
      envelope = JSON.parse(body);
    } catch {
      return okResponse(corsOrigin);
    }
    if (canonicalCleanupEnvelopeJson(envelope) !== body) return okResponse(corsOrigin);

    let keyRing;
    try {
      keyRing = await loadKeyRing();
    } catch {
      return retryResponse(corsOrigin);
    }

    let candidate;
    try {
      candidate = await digestForCleanupEnvelope(envelope, keyRing, cryptoRef);
    } catch {
      return retryResponse(corsOrigin);
    }
    if (candidate.kind === "invalid") return okResponse(corsOrigin);
    if (candidate.kind === "key-unavailable") return retryResponse(corsOrigin);

    try {
      const outcome = await quarantineByDigest(candidate.digestHex);
      return outcome === "OK" ? okResponse(corsOrigin) : retryResponse(corsOrigin);
    } catch {
      return retryResponse(corsOrigin);
    }
  };
}
