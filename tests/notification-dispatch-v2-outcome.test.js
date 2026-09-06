import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyProviderHttpResponse,
  classifyProviderTransportFailure,
  createRedactedDispatchLogRecord,
  parseRetryAfterTimestamp,
  runWithTotalDeadline,
  serializeRedactedDispatchLogRecord,
} from "../supabase/functions/notification-outbox-dispatch/v2-outcome.js";

const RECEIVED_AT_MS = Date.parse("Sun, 06 Nov 1994 08:49:37 GMT");

test("Retry-After accepts RFC delta-seconds and HTTP dates without accepting loose date text", () => {
  assert.equal(parseRetryAfterTimestamp("120", RECEIVED_AT_MS), RECEIVED_AT_MS + 120_000);
  assert.equal(parseRetryAfterTimestamp("Sun, 06 Nov 1994 08:51:37 GMT", RECEIVED_AT_MS), RECEIVED_AT_MS + 120_000);
  assert.equal(parseRetryAfterTimestamp("Sunday, 06-Nov-94 08:51:37 GMT", RECEIVED_AT_MS), RECEIVED_AT_MS + 120_000);
  assert.equal(parseRetryAfterTimestamp("Sun Nov  6 08:51:37 1994", RECEIVED_AT_MS), RECEIVED_AT_MS + 120_000);
  assert.equal(parseRetryAfterTimestamp("Sun, 06 Nov 1994 08:48:37 GMT", RECEIVED_AT_MS), RECEIVED_AT_MS);

  const receivedIn2026 = Date.parse("Fri, 06 Nov 2026 08:49:37 GMT");
  assert.equal(
    parseRetryAfterTimestamp("Sunday, 06-Nov-50 08:49:37 GMT", receivedIn2026),
    Date.parse("Sun, 06 Nov 2050 08:49:37 GMT")
  );
  assert.equal(parseRetryAfterTimestamp("Sunday, 06-Nov-77 08:49:37 GMT", receivedIn2026), receivedIn2026);

  for (const value of [
    null,
    "",
    " 120",
    "1.5",
    "tomorrow",
    "Mon, 06 Nov 1994 08:51:37 GMT",
    "Sun, 31 Feb 1994 08:51:37 GMT",
    "Sun, 06 Nov 1994 25:51:37 GMT",
    "Sun, 06 Nov 1994 08:51:37 UTC",
    "9".repeat(65),
  ]) {
    assert.equal(parseRetryAfterTimestamp(value, RECEIVED_AT_MS), null, String(value));
  }
});

test("2xx is accepted while every redirect is a controlled permanent failure", () => {
  assert.deepEqual(
    classifyProviderHttpResponse({
      providerPolicyVerified: true,
      receivedAtMs: RECEIVED_AT_MS,
      retryAfter: null,
      statusCode: 201,
    }),
    {
      deliveryErrorCode: null,
      deliveryState: "accepted",
      kind: "accepted",
      logCode: "provider_accepted",
      nextAttemptAtMs: null,
      persistable: true,
      quarantineProvider: false,
      statusCode: 201,
    }
  );
  for (const statusCode of [300, 301, 302, 307, 308, 399]) {
    const result = classifyProviderHttpResponse({
      providerPolicyVerified: true,
      receivedAtMs: RECEIVED_AT_MS,
      retryAfter: null,
      statusCode,
    });
    assert.equal(result.kind, "permanent");
    assert.equal(result.logCode, "provider_redirect_rejected");
    assert.equal(result.deliveryState, "failed");
    assert.equal(result.deliveryErrorCode, "provider_permanent");
  }
});

test("404 and 410 require verified provider policy and map to provider-stale quarantine", () => {
  for (const statusCode of [404, 410]) {
    assert.deepEqual(
      classifyProviderHttpResponse({
        providerPolicyVerified: true,
        receivedAtMs: RECEIVED_AT_MS,
        retryAfter: null,
        statusCode,
      }),
      {
        deliveryErrorCode: "provider_endpoint_inactive",
        deliveryState: "cancelled",
        kind: "provider-stale",
        logCode: "provider_endpoint_inactive",
        nextAttemptAtMs: null,
        persistable: true,
        quarantineProvider: true,
        statusCode,
      }
    );
    assert.throws(
      () =>
        classifyProviderHttpResponse({
          providerPolicyVerified: false,
          receivedAtMs: RECEIVED_AT_MS,
          retryAfter: null,
          statusCode,
        }),
      /DISPATCH_PROVIDER_POLICY_REQUIRED/
    );
  }
});

test("429 schedules only from valid Retry-After and other transient statuses invent no backoff", () => {
  assert.deepEqual(
    classifyProviderHttpResponse({
      providerPolicyVerified: true,
      receivedAtMs: RECEIVED_AT_MS,
      retryAfter: "120",
      statusCode: 429,
    }),
    {
      deliveryErrorCode: "provider_rate_limited",
      deliveryState: "pending",
      kind: "rate-limited",
      logCode: "provider_rate_limited",
      nextAttemptAtMs: RECEIVED_AT_MS + 120_000,
      persistable: true,
      quarantineProvider: false,
      statusCode: 429,
    }
  );
  assert.equal(
    classifyProviderHttpResponse({
      providerPolicyVerified: true,
      receivedAtMs: RECEIVED_AT_MS,
      retryAfter: null,
      statusCode: 429,
    }).kind,
    "retry-policy-required"
  );
  for (const statusCode of [500, 502, 503, 504]) {
    const result = classifyProviderHttpResponse({
      providerPolicyVerified: true,
      receivedAtMs: RECEIVED_AT_MS,
      retryAfter: null,
      statusCode,
    });
    assert.equal(result.kind, "retry-policy-required");
    assert.equal(result.logCode, "provider_transient");
    assert.equal(result.deliveryState, null);
    assert.equal(result.nextAttemptAtMs, null);
    assert.equal(result.persistable, false);
  }
});

test("408 remains unknown without a retry schedule while known non-retry responses fail permanently", () => {
  const requestTimeout = classifyProviderHttpResponse({
    providerPolicyVerified: true,
    receivedAtMs: RECEIVED_AT_MS,
    retryAfter: null,
    statusCode: 408,
  });
  assert.equal(requestTimeout.kind, "unknown");
  assert.equal(requestTimeout.persistable, false);
  assert.equal(requestTimeout.deliveryState, null);

  for (const statusCode of [400, 401, 403, 413, 418, 422, 501, 505]) {
    const result = classifyProviderHttpResponse({
      providerPolicyVerified: true,
      receivedAtMs: RECEIVED_AT_MS,
      retryAfter: null,
      statusCode,
    });
    assert.equal(result.kind, "permanent");
    assert.equal(result.deliveryErrorCode, "provider_permanent");
  }
  assert.throws(
    () =>
      classifyProviderHttpResponse({
        providerPolicyVerified: true,
        receivedAtMs: RECEIVED_AT_MS,
        retryAfter: null,
        statusCode: 199,
      }),
    /DISPATCH_PROVIDER_RESPONSE_INVALID/
  );
});

test("transport loss is unknown only after request invocation", () => {
  assert.equal(classifyProviderTransportFailure({ requestInvoked: true }).kind, "unknown");
  assert.equal(classifyProviderTransportFailure({ requestInvoked: true }).persistable, false);
  assert.equal(classifyProviderTransportFailure({ requestInvoked: true }).deliveryState, null);
  assert.equal(classifyProviderTransportFailure({ requestInvoked: false }).kind, "not-invoked");
  assert.equal(classifyProviderTransportFailure({ requestInvoked: false }).deliveryState, null);
});

test("total deadline aborts and never returns raw operation errors", async () => {
  assert.deepEqual(await runWithTotalDeadline({ deadlineMs: 50, operation: async () => "done" }), {
    kind: "completed",
    value: "done",
  });
  const beforeInvocation = await runWithTotalDeadline({
    deadlineMs: 5,
    operation: ({ signal }) => new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })),
  });
  assert.equal(beforeInvocation.kind, "not-invoked");

  const poison = "https://secret-push.example/token?key=private";
  const afterInvocation = await runWithTotalDeadline({
    deadlineMs: 5,
    operation: ({ markRequestInvoked, signal }) => {
      markRequestInvoked();
      return new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error(poison)), { once: true })
      );
    },
  });
  assert.equal(afterInvocation.kind, "unknown");
  assert.equal(afterInvocation.persistable, false);
  assert.doesNotMatch(JSON.stringify(afterInvocation), /secret-push|private/u);
});

test("redacted logs accept only fixed code, status, and count", () => {
  assert.deepEqual(createRedactedDispatchLogRecord({ code: "provider_rate_limited", count: 2, statusCode: 429 }), {
    code: "provider_rate_limited",
    count: 2,
    statusCode: 429,
  });
  assert.equal(
    serializeRedactedDispatchLogRecord({ code: "adapter_outcome_unknown", count: 1, statusCode: null }),
    '{"code":"adapter_outcome_unknown","count":1,"statusCode":null}'
  );
  for (const record of [
    { code: "raw-error", count: 1, statusCode: 500 },
    { code: "provider_permanent", count: 1, endpoint: "https://secret.example/token", statusCode: 400 },
    { code: "provider_permanent", count: 1, message: "secret", statusCode: 400 },
  ]) {
    assert.throws(() => createRedactedDispatchLogRecord(record), /DISPATCH_LOG_RECORD_INVALID/);
  }
});
