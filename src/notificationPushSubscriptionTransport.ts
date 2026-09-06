import { decodeCanonicalCleanupToken } from "../supabase/functions/_shared/push-cleanup-protocol.js";
import {
  canonicalPushSubscriptionEnvelopeJson,
  encryptPushSubscriptionEnvelope,
  parseCanonicalPushSubscriptionPublicKeyDocument,
  PUSH_SUBSCRIPTION_ENVELOPE_MAX_BYTES,
  PUSH_SUBSCRIPTION_PUBLIC_KEY_DOCUMENT_BYTES,
  PUSH_SUBSCRIPTION_PUBLIC_KEY_PATH,
} from "../supabase/functions/_shared/push-subscription-v2-protocol.js";

const SUBSCRIPTION_ENDPOINT_PATH = "/functions/v1/push-subscription-v2";
const LOCAL_HTTP_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const POSITIVE_BIGINT_PATTERN = /^[1-9][0-9]*$/u;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

const INVALID_BODY = '{"kind":"invalid","version":1}';
const STALE_BODY = '{"kind":"stale","version":1}';
const ENDPOINT_UNAVAILABLE_BODY = '{"kind":"endpoint-unavailable","version":1}';
const UNAVAILABLE_BODY = '{"kind":"unavailable","version":1}';
const MAXIMUM_COMMITTED_BODY = JSON.stringify({
  bindingId: "00000000-0000-4000-8000-000000000000",
  consentEpoch: "00000000-0000-0000-8000-000000000000",
  consentId: MAX_POSTGRES_BIGINT.toString(),
  consentVersion: MAX_POSTGRES_BIGINT.toString(),
  kind: "committed",
  version: 1,
});
const RESPONSE_BODY_LIMIT = Math.max(
  ...[INVALID_BODY, STALE_BODY, ENDPOINT_UNAVAILABLE_BODY, UNAVAILABLE_BODY, MAXIMUM_COMMITTED_BODY].map(
    (body) => new TextEncoder().encode(body).byteLength
  )
);

export const PUSH_SUBSCRIPTION_TRANSPORT_MAX_POSTS = 1;

export const PUSH_SUBSCRIPTION_TRANSPORT_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: "PUSH_SUBSCRIPTION_TRANSPORT_INVALID_CONFIGURATION",
  PUBLIC_KEY_UNAVAILABLE: "PUSH_SUBSCRIPTION_PUBLIC_KEY_UNAVAILABLE",
});

export class NotificationPushSubscriptionTransportError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NotificationPushSubscriptionTransportError";
    this.code = code;
  }
}

interface PushServerConsentIdentity {
  readonly consentEpoch: string;
  readonly consentId: string;
  readonly consentVersion: string;
}

interface PushSubscriptionValue {
  readonly auth: string;
  readonly endpoint: string;
  readonly p256dh: string;
}

interface PushProvisioningBinding {
  readonly bindingId: string;
  readonly cleanupToken: string;
  readonly deviceId: string;
}

interface PushEnabledBinding {
  readonly bindingId: string;
  readonly deviceId: string;
  readonly serverConsent: PushServerConsentIdentity;
}

interface PushSubscriptionTransportOptions {
  cryptoRef?: Crypto;
  fetchRef?: typeof globalThis.fetch;
  locationRef?: Pick<Location, "origin">;
  subscriptionEndpoint: string;
}

interface SendEnableInput {
  readonly accessToken: string;
  readonly authUserId: string;
  readonly predecessor: PushServerConsentIdentity | null;
  readonly provisioning: PushProvisioningBinding;
  readonly signal?: AbortSignal;
  readonly subscription: PushSubscriptionValue;
}

interface SendRefreshInput {
  readonly accessToken: string;
  readonly authUserId: string;
  readonly binding: PushEnabledBinding;
  readonly signal?: AbortSignal;
  readonly subscription: PushSubscriptionValue;
}

export type PushSubscriptionTransportResult =
  | {
      bindingId: string;
      consentEpoch: string;
      consentId: string;
      consentVersion: string;
      kind: "committed";
      version: 1;
    }
  | { kind: "endpoint-unavailable" | "invalid" | "stale" | "unavailable"; version: 1 }
  | { kind: "unauthorized" };

const UNAVAILABLE_RESULT = Object.freeze({ kind: "unavailable", version: 1 } as const);
const UNAUTHORIZED_RESULT = Object.freeze({ kind: "unauthorized" } as const);

function transportError(code: string): NotificationPushSubscriptionTransportError {
  return new NotificationPushSubscriptionTransportError(code);
}

function exactHttpOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
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

function exactSubscriptionEndpoint(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && (url.protocol !== "http:" || !LOCAL_HTTP_HOSTS.has(url.hostname))) ||
      url.username ||
      url.password ||
      url.pathname !== SUBSCRIPTION_ENDPOINT_PATH ||
      url.search ||
      url.hash ||
      url.href !== value
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function allowedJsonContentType(headers: Headers): boolean {
  const contentType = headers.get("content-type");
  if (!contentType) return false;
  const parts = contentType.split(";").map((part) => part.trim().toLowerCase());
  return (
    parts[0] === "application/json" && (parts.length === 1 || (parts.length === 2 && parts[1] === "charset=utf-8"))
  );
}

function hasNoStore(headers: Headers): boolean {
  return (headers.get("cache-control") ?? "")
    .split(",")
    .map((directive) => directive.trim().toLowerCase())
    .includes("no-store");
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return;
  try {
    await body.cancel();
  } catch {
    // The response is already rejected; cancellation is best-effort.
  }
}

async function readBoundedUtf8Body(response: Response, maximumBytes: number): Promise<string | null> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^(?:0|[1-9][0-9]*)$/u.test(declaredLength) || Number(declaredLength) > maximumBytes)
  ) {
    await cancelBody(response.body);
    return null;
  }
  if (!response.body) return null;

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = response.body.getReader();
  } catch {
    return null;
  }

  const bytes = new Uint8Array(maximumBytes);
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength === 0 || value.byteLength > maximumBytes - total) {
        if (value instanceof Uint8Array) value.fill(0);
        try {
          await reader.cancel();
        } catch {
          // The response is already rejected; cancellation is best-effort.
        }
        return null;
      }
      bytes.set(value, total);
      total += value.byteLength;
      value.fill(0);
    }

    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, total));
    } catch {
      return null;
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // The response is already rejected; cancellation is best-effort.
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

function responseCameFrom(response: Response, expectedUrl: string): boolean {
  return !response.redirected && response.url === expectedUrl;
}

function hasExactKeys(value: object, expectedKeys: string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => keys.includes(key));
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validUuid(value: unknown, version4Only = false): value is string {
  return typeof value === "string" && (version4Only ? UUID_V4_PATTERN : UUID_PATTERN).test(value);
}

function validBigint(value: unknown): value is string {
  if (typeof value !== "string" || !POSITIVE_BIGINT_PATTERN.test(value)) return false;
  try {
    return BigInt(value) <= MAX_POSTGRES_BIGINT;
  } catch {
    return false;
  }
}

function committedResult(body: string): PushSubscriptionTransportResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (
    !isRecord(parsed) ||
    !hasExactKeys(parsed, ["bindingId", "consentEpoch", "consentId", "consentVersion", "kind", "version"]) ||
    parsed.kind !== "committed" ||
    parsed.version !== 1 ||
    !validUuid(parsed.bindingId, true) ||
    !validUuid(parsed.consentEpoch) ||
    !validBigint(parsed.consentId) ||
    !validBigint(parsed.consentVersion) ||
    JSON.stringify({
      bindingId: parsed.bindingId,
      consentEpoch: parsed.consentEpoch,
      consentId: parsed.consentId,
      consentVersion: parsed.consentVersion,
      kind: "committed",
      version: 1,
    }) !== body
  ) {
    return null;
  }
  return parsed as PushSubscriptionTransportResult;
}

function exactResponse(body: string, status: number): PushSubscriptionTransportResult | null {
  if (status === 200) return committedResult(body);
  if (status === 400 && body === INVALID_BODY) return { kind: "invalid", version: 1 };
  if (status === 409 && body === STALE_BODY) return { kind: "stale", version: 1 };
  if (status === 409 && body === ENDPOINT_UNAVAILABLE_BODY) return { kind: "endpoint-unavailable", version: 1 };
  if (status === 503 && body === UNAVAILABLE_BODY) return UNAVAILABLE_RESULT;
  return null;
}

async function cleanupTokenHash(token: unknown, cryptoRef: Crypto): Promise<string | null> {
  const bytes = decodeCanonicalCleanupToken(token);
  if (!bytes) return null;
  let digest: Uint8Array | null = null;
  try {
    digest = new Uint8Array(await cryptoRef.subtle.digest("SHA-256", bytes));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  } finally {
    bytes.fill(0);
    digest?.fill(0);
  }
}

export function createNotificationPushSubscriptionTransport({
  cryptoRef = globalThis.crypto,
  fetchRef = globalThis.fetch,
  locationRef = globalThis.location,
  subscriptionEndpoint,
}: PushSubscriptionTransportOptions) {
  const browserOrigin = exactHttpOrigin(locationRef?.origin);
  const endpoint = exactSubscriptionEndpoint(subscriptionEndpoint);
  if (!browserOrigin || !endpoint || !cryptoRef?.subtle || typeof fetchRef !== "function") {
    throw transportError(PUSH_SUBSCRIPTION_TRANSPORT_ERROR_CODES.INVALID_CONFIGURATION);
  }
  const subscriptionUrl = endpoint;
  const publicKeyUrl = new URL(PUSH_SUBSCRIPTION_PUBLIC_KEY_PATH, browserOrigin).href;

  async function loadPublicKey(signal?: AbortSignal): Promise<JsonWebKey> {
    try {
      if (signal?.aborted) throw new Error();
      const response = await fetchRef(publicKeyUrl, {
        cache: "no-store",
        credentials: "omit",
        headers: { accept: "application/json" },
        method: "GET",
        mode: "same-origin",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal,
      });
      if (
        response.status !== 200 ||
        !responseCameFrom(response, publicKeyUrl) ||
        !allowedJsonContentType(response.headers) ||
        !hasNoStore(response.headers)
      ) {
        await cancelBody(response.body);
        throw new Error();
      }
      const body = await readBoundedUtf8Body(response, PUSH_SUBSCRIPTION_PUBLIC_KEY_DOCUMENT_BYTES);
      if (body === null || new TextEncoder().encode(body).byteLength !== PUSH_SUBSCRIPTION_PUBLIC_KEY_DOCUMENT_BYTES) {
        throw new Error();
      }
      return (await parseCanonicalPushSubscriptionPublicKeyDocument(body, cryptoRef)) as JsonWebKey;
    } catch {
      throw transportError(PUSH_SUBSCRIPTION_TRANSPORT_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE);
    }
  }

  async function readResponse(response: Response): Promise<PushSubscriptionTransportResult> {
    if (
      !responseCameFrom(response, subscriptionUrl) ||
      !allowedJsonContentType(response.headers) ||
      !hasNoStore(response.headers)
    ) {
      await cancelBody(response.body);
      return UNAVAILABLE_RESULT;
    }
    if (response.status === 401) {
      await cancelBody(response.body);
      return UNAUTHORIZED_RESULT;
    }
    const body = await readBoundedUtf8Body(response, RESPONSE_BODY_LIMIT);
    return body === null ? UNAVAILABLE_RESULT : (exactResponse(body, response.status) ?? UNAVAILABLE_RESULT);
  }

  async function sendPayload(
    payload: object,
    authUserId: string,
    accessToken: string,
    signal?: AbortSignal
  ): Promise<PushSubscriptionTransportResult> {
    try {
      if (typeof accessToken !== "string" || accessToken.length === 0 || signal?.aborted) return UNAVAILABLE_RESULT;
      const publicKey = await loadPublicKey(signal);
      if (signal?.aborted) return UNAVAILABLE_RESULT;
      const envelope = await encryptPushSubscriptionEnvelope(payload, authUserId, publicKey, cryptoRef);
      const body = canonicalPushSubscriptionEnvelopeJson(envelope);
      if (
        body === null ||
        new TextEncoder().encode(body).byteLength > PUSH_SUBSCRIPTION_ENVELOPE_MAX_BYTES ||
        signal?.aborted
      ) {
        return UNAVAILABLE_RESULT;
      }
      const response = await fetchRef(subscriptionUrl, {
        body,
        cache: "no-store",
        credentials: "omit",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        method: "POST",
        mode: "cors",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal,
      });
      return await readResponse(response);
    } catch {
      return UNAVAILABLE_RESULT;
    }
  }

  async function sendEnable({
    accessToken,
    authUserId,
    predecessor,
    provisioning,
    signal,
    subscription,
  }: SendEnableInput): Promise<PushSubscriptionTransportResult> {
    const digest = await cleanupTokenHash(provisioning?.cleanupToken, cryptoRef);
    if (!digest) return UNAVAILABLE_RESULT;
    return sendPayload(
      {
        bindingId: provisioning.bindingId,
        cleanupTokenHash: digest,
        deviceId: provisioning.deviceId,
        kind: "enable",
        predecessor,
        subscription,
        version: 1,
      },
      authUserId,
      accessToken,
      signal
    );
  }

  async function sendRefresh({
    accessToken,
    authUserId,
    binding,
    signal,
    subscription,
  }: SendRefreshInput): Promise<PushSubscriptionTransportResult> {
    return sendPayload(
      {
        bindingId: binding?.bindingId,
        deviceId: binding?.deviceId,
        expectedConsent: binding?.serverConsent,
        kind: "refresh",
        subscription,
        version: 1,
      },
      authUserId,
      accessToken,
      signal
    );
  }

  return Object.freeze({ loadPublicKey, sendEnable, sendRefresh });
}
