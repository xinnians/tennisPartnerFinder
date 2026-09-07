import {
  parseCanonicalProviderOriginsPolicy,
  validateCanonicalEndpoint,
} from "../_shared/push-subscription-v2-protocol.js";
import { notificationTitle, safePushPayload, toWebPushSubscription } from "./dispatch.js";
import { computePushTtlSeconds } from "./v2-egress.js";
import { classifyProviderHttpResponse, runWithTotalDeadline } from "./v2-outcome.js";

const SAFE_INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/u;

function fixedError(code) {
  return new Error(code);
}

function safeIntegerFromDecimal(value, { positive = false } = {}) {
  if (typeof value !== "string" || !SAFE_INTEGER_PATTERN.test(value)) {
    throw fixedError("DISPATCH_V2_MOCK_MATERIAL_INVALID");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < (positive ? 1 : 0)) {
    throw fixedError("DISPATCH_V2_MOCK_MATERIAL_INVALID");
  }
  return parsed;
}

function databaseTimestampMs(value) {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?(?:Z|[+-][0-9]{2}:[0-9]{2})$/u.test(value)
  ) {
    throw fixedError("DISPATCH_V2_MOCK_MATERIAL_INVALID");
  }
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw fixedError("DISPATCH_V2_MOCK_MATERIAL_INVALID");
  return parsed;
}

function validateMockUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw fixedError("DISPATCH_V2_MOCK_CONFIG_INVALID");
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "host.docker.internal" ||
    !url.port ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw fixedError("DISPATCH_V2_MOCK_CONFIG_INVALID");
  }
  return url.href;
}

export function readDispatcherV2LocalMockConfig(readEnvironment) {
  if (
    typeof readEnvironment !== "function" ||
    readEnvironment("WEB_PUSH_TRANSPORT") !== "mock" ||
    !readEnvironment("PUSH_PROVIDER_ORIGINS_V1")
  ) {
    throw fixedError("DISPATCH_V2_MOCK_CONFIG_INVALID");
  }
  return Object.freeze({
    mockUrl: validateMockUrl(readEnvironment("PUSH_TEST_URL")),
    serializedProviderOrigins: readEnvironment("PUSH_PROVIDER_ORIGINS_V1"),
  });
}

export async function createDispatcherV2LocalMockSender({
  cryptoRef = globalThis.crypto,
  fetchRef = globalThis.fetch,
  mockUrl,
  serializedProviderOrigins,
}) {
  if (typeof fetchRef !== "function") throw fixedError("DISPATCH_V2_MOCK_CONFIG_INVALID");
  const targetUrl = validateMockUrl(mockUrl);
  const providerPolicy = await parseCanonicalProviderOriginsPolicy(serializedProviderOrigins, cryptoRef);

  return async function sendPrepared(prepared) {
    const endpoint = validateCanonicalEndpoint(prepared?.endpoint, providerPolicy.origins);
    if (!endpoint || endpoint !== prepared.endpoint) {
      throw fixedError("DISPATCH_V2_MOCK_ENDPOINT_REJECTED");
    }

    const databaseNowMs = databaseTimestampMs(prepared.databaseNow);
    const expiresAtMs = databaseTimestampMs(prepared.expiresAt);
    const requestDeadlineMs = safeIntegerFromDecimal(prepared.requestDeadlineMs, { positive: true });
    const safetyBudgetMs = safeIntegerFromDecimal(prepared.pushTtlSafetyBudgetMs);
    const ttlSeconds = computePushTtlSeconds({
      databaseNowMs,
      expiresAtMs,
      requestDeadlineMs,
      safetyBudgetMs,
    });
    const fixtureRequest = {
      consentEpoch: prepared.consentEpoch,
      eventType: prepared.eventType,
      kind: "local-dispatch-fixture-v1",
      notificationId: prepared.notificationId,
      payload: {
        ...safePushPayload(prepared.payload),
        title: notificationTitle(prepared.eventType),
      },
      subscription: toWebPushSubscription(prepared),
      ttlSeconds,
    };

    const transportResult = await runWithTotalDeadline({
      deadlineMs: requestDeadlineMs,
      operation: async ({ markRequestInvoked, signal }) => {
        markRequestInvoked();
        const response = await fetchRef(targetUrl, {
          body: JSON.stringify(fixtureRequest),
          headers: { "content-type": "application/json; charset=utf-8" },
          method: "POST",
          redirect: "manual",
          signal,
        });
        const result = {
          receivedAtMs: Date.now(),
          retryAfter: response.headers.get("retry-after"),
          statusCode: response.status,
        };
        await response.body?.cancel();
        return result;
      },
    });
    if (transportResult.kind !== "completed") return transportResult;
    return classifyProviderHttpResponse({
      providerPolicyVerified: true,
      ...transportResult.value,
    });
  };
}
