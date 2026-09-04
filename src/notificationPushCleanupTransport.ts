import {
  canonicalCleanupEnvelopeJson,
  CLEANUP_ENVELOPE_BYTES,
  CLEANUP_PUBLIC_KEY_DOCUMENT_BYTES,
  decodeCanonicalCleanupToken,
  encryptCleanupTokenEnvelope,
  parseCanonicalCleanupPublicKeyDocument,
} from "../supabase/functions/_shared/push-cleanup-protocol.js";
import { CLEANUP_PUBLIC_KEY_PATH } from "../supabase/functions/_shared/push-cleanup-public-key-path.js";

export const PUSH_CLEANUP_TRANSPORT_MAX_POSTS = 2;

const CLEANUP_ENDPOINT_PATH = "/functions/v1/push-cleanup";
const OK_RESPONSE_BODY = '{"outcome":"OK"}';
const RETRY_RESPONSE_BODY = '{"outcome":"RETRY"}';
const RESPONSE_BODY_LIMIT = Math.max(
  new TextEncoder().encode(OK_RESPONSE_BODY).byteLength,
  new TextEncoder().encode(RETRY_RESPONSE_BODY).byteLength
);
const LOCAL_HTTP_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

export const PUSH_CLEANUP_TRANSPORT_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: "PUSH_CLEANUP_TRANSPORT_INVALID_CONFIGURATION",
  INVALID_INPUT: "PUSH_CLEANUP_TRANSPORT_INVALID_INPUT",
  PUBLIC_KEY_UNAVAILABLE: "PUSH_CLEANUP_PUBLIC_KEY_UNAVAILABLE",
});

export class NotificationPushCleanupTransportError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NotificationPushCleanupTransportError";
    this.code = code;
  }
}

interface PushCleanupTransportOptions {
  cleanupEndpoint: string;
  cryptoRef?: Crypto;
  fetchRef?: typeof globalThis.fetch;
  locationRef?: Pick<Location, "origin">;
}

interface SendPushCleanupInput {
  cleanupToken: string;
  signal?: AbortSignal;
}

export type PushCleanupTransportResult = { kind: "completed" } | { kind: "pending" };

function transportError(code: string): NotificationPushCleanupTransportError {
  return new NotificationPushCleanupTransportError(code);
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

function exactCleanupEndpoint(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && (url.protocol !== "http:" || !LOCAL_HTTP_HOSTS.has(url.hostname))) ||
      url.username ||
      url.password ||
      url.pathname !== CLEANUP_ENDPOINT_PATH ||
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

function validCleanupToken(token: unknown): token is string {
  const bytes = decodeCanonicalCleanupToken(token);
  if (!bytes) return false;
  bytes.fill(0);
  return true;
}

export function createNotificationPushCleanupTransport({
  cleanupEndpoint,
  cryptoRef = globalThis.crypto,
  fetchRef = globalThis.fetch,
  locationRef = globalThis.location,
}: PushCleanupTransportOptions) {
  const browserOrigin = exactHttpOrigin(locationRef?.origin);
  const endpoint = exactCleanupEndpoint(cleanupEndpoint);
  if (!browserOrigin || !endpoint) {
    throw transportError(PUSH_CLEANUP_TRANSPORT_ERROR_CODES.INVALID_CONFIGURATION);
  }
  if (!cryptoRef?.subtle || typeof fetchRef !== "function") {
    throw transportError(PUSH_CLEANUP_TRANSPORT_ERROR_CODES.INVALID_CONFIGURATION);
  }
  const cleanupUrl = endpoint;
  const publicKeyUrl = new URL(CLEANUP_PUBLIC_KEY_PATH, browserOrigin).href;

  async function loadPublicKey(signal?: AbortSignal): Promise<JsonWebKey> {
    try {
      if (signal?.aborted) throw transportError(PUSH_CLEANUP_TRANSPORT_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE);
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
        throw transportError(PUSH_CLEANUP_TRANSPORT_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE);
      }

      const body = await readBoundedUtf8Body(response, CLEANUP_PUBLIC_KEY_DOCUMENT_BYTES);
      if (body === null || new TextEncoder().encode(body).byteLength !== CLEANUP_PUBLIC_KEY_DOCUMENT_BYTES) {
        throw transportError(PUSH_CLEANUP_TRANSPORT_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE);
      }
      const publicKey = (await parseCanonicalCleanupPublicKeyDocument(body, cryptoRef)) as JsonWebKey;
      return publicKey;
    } catch {
      throw transportError(PUSH_CLEANUP_TRANSPORT_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE);
    }
  }

  async function readCleanupOutcome(response: Response): Promise<"completed" | "retry" | "unknown"> {
    if (
      !responseCameFrom(response, cleanupUrl) ||
      !allowedJsonContentType(response.headers) ||
      !hasNoStore(response.headers)
    ) {
      await cancelBody(response.body);
      return "unknown";
    }
    const body = await readBoundedUtf8Body(response, RESPONSE_BODY_LIMIT);
    if (response.status === 200 && body === OK_RESPONSE_BODY) return "completed";
    if (response.status === 503 && body === RETRY_RESPONSE_BODY) return "retry";
    return "unknown";
  }

  async function sendPushCleanup({ cleanupToken, signal }: SendPushCleanupInput): Promise<PushCleanupTransportResult> {
    if (!validCleanupToken(cleanupToken)) {
      throw transportError(PUSH_CLEANUP_TRANSPORT_ERROR_CODES.INVALID_INPUT);
    }

    for (let post = 0; post < PUSH_CLEANUP_TRANSPORT_MAX_POSTS; post += 1) {
      try {
        if (signal?.aborted) return { kind: "pending" };
        const publicKey = await loadPublicKey(signal);
        if (signal?.aborted) return { kind: "pending" };
        const envelope = await encryptCleanupTokenEnvelope(cleanupToken, publicKey, cryptoRef);
        const body = canonicalCleanupEnvelopeJson(envelope);
        if (body === null || new TextEncoder().encode(body).byteLength !== CLEANUP_ENVELOPE_BYTES) {
          return { kind: "pending" };
        }
        if (signal?.aborted) return { kind: "pending" };

        const response = await fetchRef(cleanupUrl, {
          body,
          cache: "no-store",
          credentials: "omit",
          headers: { accept: "application/json", "content-type": "application/json" },
          method: "POST",
          mode: "cors",
          redirect: "error",
          referrerPolicy: "no-referrer",
          signal,
        });
        const outcome = await readCleanupOutcome(response);
        if (outcome === "completed") return { kind: "completed" };
        if (outcome !== "retry") return { kind: "pending" };
      } catch {
        return { kind: "pending" };
      }
    }
    return { kind: "pending" };
  }

  return Object.freeze({ loadPublicKey, sendPushCleanup });
}
