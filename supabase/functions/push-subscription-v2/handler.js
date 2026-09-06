import {
  canonicalPushSubscriptionEnvelopeJson,
  hasExactKeys,
  parseCanonicalProviderOriginsPolicy,
  pushSubscriptionAad,
  PUSH_SUBSCRIPTION_ENVELOPE_MAX_BYTES,
  vapidPublicKeyFingerprint,
} from "../_shared/push-subscription-v2-protocol.js";
import { decryptPushSubscriptionEnvelope } from "./crypto.js";
import { createPushSubscriptionV2Ports } from "./ports.js";

const LOCAL_HTTP_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);
const LOWERCASE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const POSITIVE_BIGINT_PATTERN = /^[1-9][0-9]*$/u;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

const BASE_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  pragma: "no-cache",
  vary: "Origin",
  "x-content-type-options": "nosniff",
});

const INVALID_RESULT = Object.freeze({ kind: "invalid", version: 1 });
const UNAVAILABLE_RESULT = Object.freeze({ kind: "unavailable", version: 1 });
const COMMAND_FAILURE_KINDS = new Set(["endpoint-unavailable", "invalid", "runtime-disabled", "stale", "unavailable"]);

function exactAllowedOrigin(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && (url.protocol !== "http:" || !LOCAL_HTTP_HOSTS.has(url.hostname))) ||
      url.username ||
      url.password ||
      url.origin !== value
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function response(result, status, corsOrigin, additionalHeaders = {}) {
  return new Response(JSON.stringify(result), {
    headers: {
      ...BASE_HEADERS,
      ...(corsOrigin ? { "access-control-allow-origin": corsOrigin } : {}),
      ...additionalHeaders,
    },
    status,
  });
}

function invalidResponse(corsOrigin) {
  return response(INVALID_RESULT, 400, corsOrigin);
}

function unavailableResponse(corsOrigin, status = 503) {
  return response(UNAVAILABLE_RESULT, status, corsOrigin);
}

function allowedContentType(request) {
  const contentType = request.headers.get("content-type");
  if (!contentType) return false;
  const parts = contentType.split(";").map((part) => part.trim().toLowerCase());
  return (
    parts[0] === "application/json" && (parts.length === 1 || (parts.length === 2 && parts[1] === "charset=utf-8"))
  );
}

function allowedContentEncoding(request) {
  const encoding = request.headers.get("content-encoding")?.trim().toLowerCase();
  return !encoding || encoding === "identity";
}

async function readBoundedBody(request) {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^(?:0|[1-9][0-9]*)$/u.test(declaredLength) || Number(declaredLength) > PUSH_SUBSCRIPTION_ENVELOPE_MAX_BYTES)
  ) {
    return null;
  }
  if (!request.body) return null;

  let reader;
  try {
    reader = request.body.getReader();
  } catch {
    return null;
  }

  const bytes = new Uint8Array(PUSH_SUBSCRIPTION_ENVELOPE_MAX_BYTES);
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength === 0 || value.byteLength > bytes.byteLength - total) {
        if (value instanceof Uint8Array) value.fill(0);
        try {
          await reader.cancel();
        } catch {
          // The request is already rejected; cancellation is best-effort.
        }
        return null;
      }
      bytes.set(value, total);
      total += value.byteLength;
      value.fill(0);
    }
    if (declaredLength !== null && Number(declaredLength) !== total) return null;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, total));
    } catch {
      return null;
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // The request is already rejected; cancellation is best-effort.
    }
    return null;
  } finally {
    bytes.fill(0);
    try {
      reader.releaseLock();
    } catch {
      // A failed or cancelled reader may already have released its lock.
    }
  }
}

function bearerToken(request) {
  const authorization = request.headers.get("authorization");
  const match = typeof authorization === "string" ? /^Bearer ([^\s,]+)$/u.exec(authorization) : null;
  return match?.[1] ?? null;
}

function verifiedAuthUser(result) {
  if (!hasExactKeys(result, ["authUserId", "kind"]) || result.kind !== "verified") return null;
  const aad = pushSubscriptionAad(result.authUserId);
  if (!aad) return null;
  aad.fill(0);
  return result.authUserId;
}

function validBigint(value) {
  if (typeof value !== "string" || !POSITIVE_BIGINT_PATTERN.test(value)) return false;
  try {
    return BigInt(value) <= MAX_POSTGRES_BIGINT;
  } catch {
    return false;
  }
}

function canonicalCommandResult(result, bindingId) {
  if (
    hasExactKeys(result, ["bindingId", "consentEpoch", "consentId", "consentVersion", "kind", "version"]) &&
    result.kind === "committed" &&
    result.version === 1 &&
    result.bindingId === bindingId &&
    typeof result.consentEpoch === "string" &&
    LOWERCASE_UUID_PATTERN.test(result.consentEpoch) &&
    validBigint(result.consentId) &&
    validBigint(result.consentVersion)
  ) {
    return {
      bindingId: result.bindingId,
      consentEpoch: result.consentEpoch,
      consentId: result.consentId,
      consentVersion: result.consentVersion,
      kind: "committed",
      version: 1,
    };
  }
  if (hasExactKeys(result, ["kind", "version"]) && result.version === 1 && COMMAND_FAILURE_KINDS.has(result.kind)) {
    return { kind: result.kind, version: 1 };
  }
  return null;
}

function resultResponse(result, corsOrigin) {
  if (!result || result.kind === "runtime-disabled" || result.kind === "unavailable") {
    return unavailableResponse(corsOrigin);
  }
  if (result.kind === "committed") return response(result, 200, corsOrigin);
  if (result.kind === "invalid") return invalidResponse(corsOrigin);
  return response(result, 409, corsOrigin);
}

export function createPushSubscriptionV2Handler({ allowedOrigin, cryptoRef = globalThis.crypto, ports }) {
  const origin = exactAllowedOrigin(allowedOrigin);
  if (!origin || !cryptoRef?.subtle) throw new Error("PUSH_SUBSCRIPTION_HANDLER_INVALID_CONFIGURATION");
  const dependencies = createPushSubscriptionV2Ports(ports);

  return async function pushSubscriptionV2Handler(request) {
    const corsOrigin = request.headers.get("origin") === origin ? origin : null;
    if (!corsOrigin) return unavailableResponse(null);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          ...BASE_HEADERS,
          "access-control-allow-headers": "authorization, content-type",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-origin": corsOrigin,
        },
        status: 204,
      });
    }
    if (request.method !== "POST") {
      return invalidResponse(corsOrigin);
    }
    if (!allowedContentType(request) || !allowedContentEncoding(request)) return invalidResponse(corsOrigin);

    const body = await readBoundedBody(request);
    if (body === null) return invalidResponse(corsOrigin);
    let envelope;
    try {
      envelope = JSON.parse(body);
    } catch {
      return invalidResponse(corsOrigin);
    }
    if (canonicalPushSubscriptionEnvelopeJson(envelope) !== body) return invalidResponse(corsOrigin);

    const token = bearerToken(request);
    if (!token) return unavailableResponse(corsOrigin, 401);

    let authResult;
    try {
      authResult = await dependencies.verifyUser(token);
    } catch {
      return unavailableResponse(corsOrigin);
    }
    if (hasExactKeys(authResult, ["kind"]) && authResult.kind === "rejected") {
      return unavailableResponse(corsOrigin, 401);
    }
    if (hasExactKeys(authResult, ["kind"]) && authResult.kind === "unavailable") {
      return unavailableResponse(corsOrigin);
    }
    const authUserId = verifiedAuthUser(authResult);
    if (!authUserId) return unavailableResponse(corsOrigin);

    let decrypted;
    let vapid;
    try {
      const serializedPolicy = await dependencies.loadProviderPolicy();
      const policy = await parseCanonicalProviderOriginsPolicy(serializedPolicy, cryptoRef);
      const [keyRing, serverVapidPublicKey] = await Promise.all([
        dependencies.loadKeyRing(),
        dependencies.loadServerVapidPublicKey(),
      ]);
      vapid = await vapidPublicKeyFingerprint(serverVapidPublicKey, cryptoRef);
      if (!vapid) return unavailableResponse(corsOrigin);
      decrypted = await decryptPushSubscriptionEnvelope(envelope, authUserId, policy.origins, keyRing, cryptoRef);
    } catch {
      return unavailableResponse(corsOrigin);
    }

    if (decrypted.kind === "invalid") return invalidResponse(corsOrigin);
    if (decrypted.kind === "endpoint-unavailable") {
      return response({ kind: "endpoint-unavailable", version: 1 }, 409, corsOrigin);
    }
    if (decrypted.kind !== "payload") return unavailableResponse(corsOrigin);

    const payload = decrypted.payload;
    let commandResult;
    try {
      commandResult =
        payload.kind === "enable"
          ? await dependencies.enableCommand({
              authUserId,
              bindingId: payload.bindingId,
              cleanupTokenHash: payload.cleanupTokenHash,
              deviceId: payload.deviceId,
              predecessor: payload.predecessor,
              subscription: payload.subscription,
              vapidFingerprint: vapid.fingerprint,
            })
          : await dependencies.refreshCommand({
              authUserId,
              bindingId: payload.bindingId,
              deviceId: payload.deviceId,
              expectedConsent: payload.expectedConsent,
              subscription: payload.subscription,
              vapidFingerprint: vapid.fingerprint,
            });
    } catch {
      return unavailableResponse(corsOrigin);
    }
    return resultResponse(canonicalCommandResult(commandResult, payload.bindingId), corsOrigin);
  };
}
