import webpush from "npm:web-push@3.6.7";

import {
  decodeCanonicalBase64Url,
  parseCanonicalProviderOriginsPolicy,
  validateCanonicalPushSubscription,
  vapidPublicKeyFingerprint,
} from "../_shared/push-subscription-v2-protocol.js";
import { notificationTitle, safePushPayload, toWebPushSubscription } from "./dispatch.js";
import { computePushTtlSeconds, prepareDispatcherEgress } from "./v2-egress.js";
import { classifyProviderHttpResponse, runWithTotalDeadline } from "./v2-outcome.js";
import {
  createValidatedWebPushRequest,
  createWebPushHttp1Head,
  dispatcherDatabaseTimestampMs,
  DISPATCH_V2_RESPONSE_HEADER_MAX_BYTES,
  findHttpHeaderTerminator,
  parseProviderHttp1ResponseHead,
  readDispatcherV2DenoWebPushConfig,
  safeIntegerFromCanonicalDecimal,
} from "./v2-web-push-core.js";

type PreparedDelivery = Record<string, unknown>;
type DispatcherAddress = { address: string; family: number };

function fixedError(code: string) {
  return new Error(code);
}

function isDenoNotFound(error: unknown) {
  return error instanceof Deno.errors.NotFound;
}

async function resolveDnsFamily(hostname: string, recordType: "A" | "AAAA") {
  try {
    return await Deno.resolveDns(hostname, recordType);
  } catch (error) {
    if (isDenoNotFound(error)) return [];
    throw fixedError(recordType === "A" ? "DISPATCH_DNS_IPV4_FAILED" : "DISPATCH_DNS_IPV6_FAILED");
  }
}

async function resolveDenoDispatcherAddresses(hostname: string) {
  const [ipv4, ipv6] = await Promise.all([resolveDnsFamily(hostname, "A"), resolveDnsFamily(hostname, "AAAA")]);
  return { ipv4, ipv6 };
}

async function writeAll(connection: Deno.TlsConn, bytes: Uint8Array) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = await connection.write(bytes.subarray(offset));
    if (written <= 0) throw fixedError("DISPATCH_V2_PROVIDER_RESPONSE_INVALID");
    offset += written;
  }
}

function appendBytes(left: Uint8Array, right: Uint8Array) {
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(left);
  combined.set(right, left.byteLength);
  return combined;
}

async function readProviderResponseHead(connection: Deno.TlsConn) {
  const buffer = new Uint8Array(2_048);
  let received = new Uint8Array();
  while (true) {
    const read = await connection.read(buffer);
    if (read === null) throw fixedError("DISPATCH_V2_PROVIDER_RESPONSE_INVALID");
    received = appendBytes(received, buffer.subarray(0, read));
    const terminator = findHttpHeaderTerminator(received);
    if (terminator >= 0) {
      if (terminator > DISPATCH_V2_RESPONSE_HEADER_MAX_BYTES) {
        throw fixedError("DISPATCH_V2_PROVIDER_RESPONSE_INVALID");
      }
      return parseProviderHttp1ResponseHead(received.slice(0, terminator));
    }
    if (received.byteLength >= DISPATCH_V2_RESPONSE_HEADER_MAX_BYTES) {
      throw fixedError("DISPATCH_V2_PROVIDER_RESPONSE_INVALID");
    }
  }
}

async function sendPinnedWebPushRequest({
  addresses,
  body,
  endpoint,
  headers,
  hostname,
  markRequestInvoked,
  signal,
}: {
  addresses: DispatcherAddress[];
  body: Uint8Array;
  endpoint: string;
  headers: Record<string, unknown>;
  hostname: string;
  markRequestInvoked: () => void;
  signal: AbortSignal;
}) {
  const selected = addresses.find((entry) => entry.family === 4) ?? addresses[0];
  if (!selected) throw fixedError("DISPATCH_DNS_RESULT_INVALID");

  let connection: Deno.TcpConn | Deno.TlsConn | null = null;
  const close = () => {
    try {
      connection?.close();
    } catch {
      // The deadline can close the same socket before this finally block.
    }
  };
  signal.addEventListener("abort", close, { once: true });
  try {
    connection = await Deno.connect({ hostname: selected.address, port: 443, signal, transport: "tcp" });
    const remoteAddress = connection.remoteAddr;
    if (remoteAddress.transport !== "tcp" || remoteAddress.hostname !== selected.address) {
      throw fixedError("DISPATCH_V2_PINNED_ADDRESS_MISMATCH");
    }
    connection = await Deno.startTls(connection, { alpnProtocols: ["http/1.1"], hostname });

    const head = createWebPushHttp1Head(endpoint, headers);
    markRequestInvoked();
    await writeAll(connection, head);
    await writeAll(connection, body);
    return await readProviderResponseHead(connection);
  } finally {
    signal.removeEventListener("abort", close);
    close();
  }
}

function validVapidSubject(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.href === value && (parsed.protocol === "https:" || parsed.protocol === "mailto:");
  } catch {
    return false;
  }
}

export async function createDispatcherV2DenoWebPushSender(config: {
  serializedProviderOrigins: string;
  vapidPrivateKey: string;
  vapidPublicKey: string;
  vapidSubject: string;
}) {
  if (
    !config ||
    !validVapidSubject(config.vapidSubject) ||
    decodeCanonicalBase64Url(config.vapidPrivateKey)?.byteLength !== 32
  ) {
    throw fixedError("DISPATCH_V2_WEB_PUSH_CONFIG_INVALID");
  }
  const [providerPolicy, configuredVapidFingerprint] = await Promise.all([
    parseCanonicalProviderOriginsPolicy(config.serializedProviderOrigins),
    vapidPublicKeyFingerprint(config.vapidPublicKey),
  ]);
  if (!configuredVapidFingerprint) throw fixedError("DISPATCH_V2_WEB_PUSH_CONFIG_INVALID");

  return async function sendPrepared(prepared: PreparedDelivery) {
    const requestDeadlineMs = safeIntegerFromCanonicalDecimal(prepared.requestDeadlineMs, { positive: true });
    const transportResult = await runWithTotalDeadline({
      deadlineMs: requestDeadlineMs,
      operation: async ({ markRequestInvoked, signal }) => {
        const subscription = await validateCanonicalPushSubscription(
          {
            auth: prepared.auth,
            endpoint: prepared.endpoint,
            p256dh: prepared.p256dh,
          },
          providerPolicy.origins
        );
        if (
          !subscription ||
          prepared.endpointFingerprintAlgorithm !== subscription.endpointFingerprintAlgorithm ||
          prepared.endpointFingerprintHex !== subscription.endpointFingerprint ||
          prepared.vapidFingerprintAlgorithm !== configuredVapidFingerprint.algorithm ||
          prepared.vapidFingerprintHex !== configuredVapidFingerprint.fingerprint
        ) {
          throw fixedError("DISPATCH_V2_WEB_PUSH_MATERIAL_INVALID");
        }

        const databaseNowMs = dispatcherDatabaseTimestampMs(prepared.databaseNow);
        const expiresAtMs = dispatcherDatabaseTimestampMs(prepared.expiresAt);
        const safetyBudgetMs = safeIntegerFromCanonicalDecimal(prepared.pushTtlSafetyBudgetMs);
        const ttlSeconds = computePushTtlSeconds({
          databaseNowMs,
          expiresAtMs,
          requestDeadlineMs,
          safetyBudgetMs,
        });
        const message = JSON.stringify({
          ...safePushPayload(prepared.payload),
          notificationId: prepared.notificationId,
          title: notificationTitle(String(prepared.eventType ?? "")),
        });
        const request = createValidatedWebPushRequest({
          endpoint: subscription.endpoint,
          generateRequestDetails: webpush.generateRequestDetails,
          message,
          subscription: toWebPushSubscription(subscription),
          ttlSeconds,
          vapidPrivateKey: config.vapidPrivateKey,
          vapidPublicKey: config.vapidPublicKey,
          vapidSubject: config.vapidSubject,
        });

        const egress = await prepareDispatcherEgress({
          endpoint: subscription.endpoint,
          resolveAddresses: resolveDenoDispatcherAddresses,
          serializedProviderOrigins: providerPolicy.serialized,
        });
        try {
          const response = await sendPinnedWebPushRequest({
            addresses: egress.addresses,
            body: request.body,
            endpoint: egress.endpoint,
            headers: request.headers,
            hostname: egress.hostname,
            markRequestInvoked,
            signal,
          });
          return classifyProviderHttpResponse({
            providerPolicyVerified: true,
            receivedAtMs: Date.now(),
            retryAfter: response.retryAfter,
            statusCode: response.statusCode,
          });
        } finally {
          egress.agent.destroy();
        }
      },
    });
    return transportResult.kind === "completed" ? transportResult.value : transportResult;
  };
}

export { readDispatcherV2DenoWebPushConfig };
