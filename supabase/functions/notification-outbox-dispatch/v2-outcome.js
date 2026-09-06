const TRANSIENT_HTTP_STATUSES = Object.freeze(new Set([500, 502, 503, 504]));
const IMF_FIXDATE_PATTERN =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), ([0-9]{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([0-9]{4}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) GMT$/u;
const RFC850_DATE_PATTERN =
  /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), ([0-9]{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-([0-9]{2}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) GMT$/u;
const ASCTIME_DATE_PATTERN =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (?:([0-9]{2})| ([0-9])) ([0-9]{2}):([0-9]{2}):([0-9]{2}) ([0-9]{4})$/u;
const SHORT_WEEKDAYS = Object.freeze(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
const LONG_WEEKDAYS = Object.freeze(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
const MONTHS = Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);

export const DISPATCH_LOG_CODES = Object.freeze([
  "adapter_outcome_unknown",
  "provider_accepted",
  "provider_endpoint_inactive",
  "provider_permanent",
  "provider_rate_limited",
  "provider_redirect_rejected",
  "provider_retry_policy_required",
  "provider_transient",
  "request_not_invoked",
]);
const DISPATCH_LOG_CODE_SET = new Set(DISPATCH_LOG_CODES);

function fixedError(code) {
  return new Error(code);
}

function exactKeys(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function createUtcTimestamp({ day, hour, minute, month, second, weekday, year }, weekdayNames) {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(hour, minute, second, 0);
  const timestamp = date.getTime();
  if (
    !Number.isSafeInteger(timestamp) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    weekdayNames[date.getUTCDay()] !== weekday
  ) {
    return null;
  }
  return timestamp;
}

function resolveObsoleteTwoDigitYear(year, receivedAtMs, parts) {
  const received = new Date(receivedAtMs);
  let candidateYear = Math.floor(received.getUTCFullYear() / 100) * 100 + year;
  const futureLimitYear = received.getUTCFullYear() + 50;
  const candidateRemainder = [parts.month, parts.day, parts.hour, parts.minute, parts.second];
  const limitRemainder = [
    received.getUTCMonth(),
    received.getUTCDate(),
    received.getUTCHours(),
    received.getUTCMinutes(),
    received.getUTCSeconds(),
  ];
  const beyondLimitWithinYear = candidateRemainder.some(
    (value, index) =>
      value !== limitRemainder[index] &&
      candidateRemainder.slice(0, index).every((prior, priorIndex) => prior === limitRemainder[priorIndex]) &&
      value > limitRemainder[index]
  );
  if (candidateYear > futureLimitYear || (candidateYear === futureLimitYear && beyondLimitWithinYear)) {
    candidateYear -= 100;
  }
  return candidateYear;
}

function parseHttpDate(value, receivedAtMs) {
  const imf = IMF_FIXDATE_PATTERN.exec(value);
  if (imf) {
    return createUtcTimestamp(
      {
        day: Number(imf[2]),
        hour: Number(imf[5]),
        minute: Number(imf[6]),
        month: MONTHS.indexOf(imf[3]),
        second: Number(imf[7]),
        weekday: imf[1],
        year: Number(imf[4]),
      },
      SHORT_WEEKDAYS
    );
  }

  const obsolete = RFC850_DATE_PATTERN.exec(value);
  if (obsolete) {
    const parts = {
      day: Number(obsolete[2]),
      hour: Number(obsolete[5]),
      minute: Number(obsolete[6]),
      month: MONTHS.indexOf(obsolete[3]),
      second: Number(obsolete[7]),
    };
    return createUtcTimestamp(
      {
        ...parts,
        weekday: obsolete[1],
        year: resolveObsoleteTwoDigitYear(Number(obsolete[4]), receivedAtMs, parts),
      },
      LONG_WEEKDAYS
    );
  }

  const asctime = ASCTIME_DATE_PATTERN.exec(value);
  if (!asctime) return null;
  return createUtcTimestamp(
    {
      day: Number(asctime[3] ?? asctime[4]),
      hour: Number(asctime[5]),
      minute: Number(asctime[6]),
      month: MONTHS.indexOf(asctime[2]),
      second: Number(asctime[7]),
      weekday: asctime[1],
      year: Number(asctime[8]),
    },
    SHORT_WEEKDAYS
  );
}

function outcome(kind, statusCode, logCode, extra = {}) {
  return Object.freeze({ kind, logCode, statusCode, ...extra });
}

/** RFC 9110 Retry-After: delta-seconds or one of the three HTTP-date forms. */
export function parseRetryAfterTimestamp(value, receivedAtMs) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    !value ||
    value.length > 64 ||
    !validTimestamp(receivedAtMs)
  ) {
    return null;
  }

  if (/^[0-9]+$/u.test(value)) {
    const seconds = Number(value);
    const delayMs = seconds * 1000;
    const timestamp = receivedAtMs + delayMs;
    return Number.isSafeInteger(seconds) && Number.isSafeInteger(delayMs) && Number.isSafeInteger(timestamp)
      ? timestamp
      : null;
  }

  const timestamp = parseHttpDate(value, receivedAtMs);
  if (timestamp === null) return null;
  return Math.max(receivedAtMs, timestamp);
}

/**
 * Classifies only observed provider evidence. It never invents a retry time:
 * 429 needs Retry-After; other transient responses remain policy-required until
 * a canary-backed retry schedule is injected by the future DB command layer.
 */
export function classifyProviderHttpResponse({ providerPolicyVerified, receivedAtMs, retryAfter, statusCode }) {
  if (
    typeof providerPolicyVerified !== "boolean" ||
    !validTimestamp(receivedAtMs) ||
    (retryAfter !== null && typeof retryAfter !== "string") ||
    !Number.isInteger(statusCode) ||
    statusCode < 200 ||
    statusCode > 599
  ) {
    throw fixedError("DISPATCH_PROVIDER_RESPONSE_INVALID");
  }

  if (statusCode >= 200 && statusCode < 300) {
    return outcome("accepted", statusCode, "provider_accepted", {
      deliveryErrorCode: null,
      deliveryState: "accepted",
      nextAttemptAtMs: null,
      persistable: true,
      quarantineProvider: false,
    });
  }

  if (statusCode >= 300 && statusCode < 400) {
    return outcome("permanent", statusCode, "provider_redirect_rejected", {
      deliveryErrorCode: "provider_permanent",
      deliveryState: "failed",
      nextAttemptAtMs: null,
      persistable: true,
      quarantineProvider: false,
    });
  }

  if (statusCode === 404 || statusCode === 410) {
    if (!providerPolicyVerified) throw fixedError("DISPATCH_PROVIDER_POLICY_REQUIRED");
    return outcome("provider-stale", statusCode, "provider_endpoint_inactive", {
      deliveryErrorCode: "provider_endpoint_inactive",
      deliveryState: "cancelled",
      nextAttemptAtMs: null,
      persistable: true,
      quarantineProvider: true,
    });
  }

  if (statusCode === 429) {
    const nextAttemptAtMs = parseRetryAfterTimestamp(retryAfter, receivedAtMs);
    if (nextAttemptAtMs === null) {
      return outcome("retry-policy-required", statusCode, "provider_retry_policy_required", {
        deliveryErrorCode: null,
        deliveryState: null,
        nextAttemptAtMs: null,
        persistable: false,
        quarantineProvider: false,
      });
    }
    return outcome("rate-limited", statusCode, "provider_rate_limited", {
      deliveryErrorCode: "provider_rate_limited",
      deliveryState: "pending",
      nextAttemptAtMs,
      persistable: true,
      quarantineProvider: false,
    });
  }

  if (TRANSIENT_HTTP_STATUSES.has(statusCode)) {
    return outcome("retry-policy-required", statusCode, "provider_transient", {
      deliveryErrorCode: null,
      deliveryState: null,
      nextAttemptAtMs: null,
      persistable: false,
      quarantineProvider: false,
    });
  }

  if (statusCode === 408) {
    return outcome("unknown", statusCode, "adapter_outcome_unknown", {
      deliveryErrorCode: null,
      deliveryState: null,
      nextAttemptAtMs: null,
      persistable: false,
      quarantineProvider: false,
    });
  }

  return outcome("permanent", statusCode, "provider_permanent", {
    deliveryErrorCode: "provider_permanent",
    deliveryState: "failed",
    nextAttemptAtMs: null,
    persistable: true,
    quarantineProvider: false,
  });
}

export function classifyProviderTransportFailure({ requestInvoked }) {
  if (typeof requestInvoked !== "boolean") throw fixedError("DISPATCH_TRANSPORT_EVIDENCE_INVALID");
  return requestInvoked
    ? outcome("unknown", null, "adapter_outcome_unknown", {
        deliveryErrorCode: null,
        deliveryState: null,
        nextAttemptAtMs: null,
        persistable: false,
        quarantineProvider: false,
      })
    : outcome("not-invoked", null, "request_not_invoked", {
        deliveryErrorCode: null,
        deliveryState: null,
        nextAttemptAtMs: null,
        persistable: false,
        quarantineProvider: false,
      });
}

/** Total wall-clock deadline. Raw operation errors never cross this boundary. */
export async function runWithTotalDeadline({ deadlineMs, operation }) {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0 || typeof operation !== "function") {
    throw fixedError("DISPATCH_DEADLINE_INPUT_INVALID");
  }

  const controller = new AbortController();
  let requestInvoked = false;
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(classifyProviderTransportFailure({ requestInvoked }));
    }, deadlineMs);
  });
  const completed = Promise.resolve()
    .then(() =>
      operation({
        markRequestInvoked() {
          if (controller.signal.aborted) throw fixedError("DISPATCH_DEADLINE_ELAPSED");
          requestInvoked = true;
        },
        signal: controller.signal,
      })
    )
    .then(
      (value) => Object.freeze({ kind: "completed", value }),
      () => classifyProviderTransportFailure({ requestInvoked })
    );

  try {
    return await Promise.race([completed, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Accepts only a fixed, non-sensitive three-field log record. */
export function createRedactedDispatchLogRecord(value) {
  if (
    !exactKeys(value, ["code", "count", "statusCode"]) ||
    !DISPATCH_LOG_CODE_SET.has(value.code) ||
    !Number.isSafeInteger(value.count) ||
    value.count < 0 ||
    (value.statusCode !== null &&
      (!Number.isInteger(value.statusCode) || value.statusCode < 200 || value.statusCode > 599))
  ) {
    throw fixedError("DISPATCH_LOG_RECORD_INVALID");
  }
  return Object.freeze({ code: value.code, count: value.count, statusCode: value.statusCode });
}

export function serializeRedactedDispatchLogRecord(value) {
  return JSON.stringify(createRedactedDispatchLogRecord(value));
}
