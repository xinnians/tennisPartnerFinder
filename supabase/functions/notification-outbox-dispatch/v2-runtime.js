const HOSTED_RUNTIME_MARKERS = Object.freeze(["DENO_DEPLOYMENT_ID", "SB_REGION"]);
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const POSITIVE_DECIMAL_PATTERN = /^[1-9][0-9]*$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u;
const EVENT_TYPES = new Set([
  "chat_message",
  "court_new_session",
  "decide_reminder",
  "guest_invited",
  "guest_request_reviewed",
  "host_new_request",
  "session_cancelled",
  "session_decided",
  "session_reminder",
  "session_updated",
]);

export const DISPATCH_V2_RUNTIME_ERROR_CODES = Object.freeze([
  "DISPATCH_V2_COMPLETE_CONTRACT_INVALID",
  "DISPATCH_V2_DATABASE_CONTRACT_INVALID",
  "DISPATCH_V2_DATABASE_ROLE_INVALID",
  "DISPATCH_V2_FAILED",
  "DISPATCH_V2_FINALIZE_CONTRACT_INVALID",
  "DISPATCH_V2_FINISH_CONTRACT_INVALID",
  "DISPATCH_V2_MOCK_CONFIG_INVALID",
  "DISPATCH_V2_MOCK_ENDPOINT_REJECTED",
  "DISPATCH_V2_MOCK_MATERIAL_INVALID",
  "DISPATCH_V2_OUTCOME_POLICY_REQUIRED",
  "DISPATCH_V2_PREPARE_CONTRACT_INVALID",
  "DISPATCH_V2_RUNTIME_CONFIG_INVALID",
  "DISPATCH_V2_WEB_PUSH_CONFIG_INVALID",
]);
const DISPATCH_V2_RUNTIME_ERROR_CODE_SET = new Set(DISPATCH_V2_RUNTIME_ERROR_CODES);

function fixedError(code) {
  return new Error(code);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isPositiveBigintString(value) {
  if (typeof value !== "string" || !POSITIVE_DECIMAL_PATTERN.test(value)) return false;
  try {
    return BigInt(value) <= POSTGRES_BIGINT_MAX;
  } catch {
    return false;
  }
}

function isNonnegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isTimestampString(value) {
  return typeof value === "string" && value.length <= 40 && Number.isSafeInteger(Date.parse(value));
}

function isSafePayload(value) {
  if (!isObject(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = ["court", "message", "slots_remaining", "start_at", "url"];
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index]) &&
    typeof value.court === "string" &&
    value.court.trim().length > 0 &&
    typeof value.message === "string" &&
    value.message.trim().length > 0 &&
    Number.isInteger(value.slots_remaining) &&
    value.slots_remaining >= 0 &&
    typeof value.start_at === "string" &&
    value.start_at.trim().length > 0 &&
    typeof value.url === "string" &&
    value.url.trim().length > 0
  );
}

function requireDatabasePort(database) {
  if (
    !isObject(database) ||
    typeof database.beginWorker !== "function" ||
    typeof database.claimDelivery !== "function" ||
    typeof database.finalizeOutbox !== "function" ||
    typeof database.finishWorker !== "function" ||
    typeof database.withSendTransaction !== "function"
  ) {
    throw fixedError("DISPATCH_V2_DATABASE_CONTRACT_INVALID");
  }
}

function validateBeginResult(value, expectedGeneration) {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    value.kind !== "ready" ||
    !isUuid(value.workerToken) ||
    value.generation !== expectedGeneration ||
    !["disabled", "canary", "enabled"].includes(value.runtimeMode) ||
    typeof value.legacyWritesEnabled !== "boolean" ||
    typeof value.legacyOutboxHandled !== "boolean" ||
    !isTimestampString(value.startedAt) ||
    !isTimestampString(value.leaseUntil) ||
    !isTimestampString(value.databaseNow) ||
    !isPositiveBigintString(value.requestDeadlineMs) ||
    !isPositiveBigintString(value.deliveryLeaseMs) ||
    !Number.isInteger(value.maxDeliveryAttempts) ||
    value.maxDeliveryAttempts <= 0 ||
    (value.pushTtlSafetyBudgetMs !== null &&
      !isPositiveBigintString(value.pushTtlSafetyBudgetMs) &&
      value.pushTtlSafetyBudgetMs !== "0")
  ) {
    throw fixedError("DISPATCH_V2_DATABASE_CONTRACT_INVALID");
  }
  return value;
}

function validateClaimResult(value) {
  if (!isObject(value) || value.version !== 1 || typeof value.kind !== "string") {
    throw fixedError("DISPATCH_V2_DATABASE_CONTRACT_INVALID");
  }
  if (
    value.kind === "empty" &&
    ["no_ready_delivery", "worker_capacity_exhausted"].includes(value.code) &&
    isTimestampString(value.databaseNow)
  ) {
    return Object.freeze({ kind: "empty" });
  }
  if (
    value.kind === "terminalized" &&
    ["attempts_exhausted", "event_expired"].includes(value.code) &&
    isPositiveBigintString(value.deliveryId) &&
    isPositiveBigintString(value.outboxId)
  ) {
    return Object.freeze({ deliveryId: value.deliveryId, kind: "terminalized", outboxId: value.outboxId });
  }
  if (
    value.kind === "claimed" &&
    isPositiveBigintString(value.deliveryId) &&
    isPositiveBigintString(value.outboxId) &&
    isPositiveBigintString(value.recipientProfileId) &&
    isUuid(value.claimToken) &&
    isUuid(value.notificationId) &&
    Number.isInteger(value.attempt) &&
    value.attempt > 0 &&
    isTimestampString(value.claimedAt) &&
    isTimestampString(value.leaseUntil) &&
    isTimestampString(value.expiresAt) &&
    isTimestampString(value.databaseNow)
  ) {
    return Object.freeze({
      claimToken: value.claimToken,
      deliveryId: value.deliveryId,
      kind: "claimed",
      notificationId: value.notificationId,
      outboxId: value.outboxId,
      recipientProfileId: value.recipientProfileId,
    });
  }
  throw fixedError("DISPATCH_V2_DATABASE_CONTRACT_INVALID");
}

function validatePrepareResult(value, claim) {
  if (!isObject(value) || value.version !== 1 || typeof value.kind !== "string") {
    throw fixedError("DISPATCH_V2_PREPARE_CONTRACT_INVALID");
  }
  if (
    (value.kind === "cancelled" || value.kind === "failed") &&
    value.deliveryId === claim.deliveryId &&
    value.outboxId === claim.outboxId &&
    typeof value.code === "string" &&
    (value.kind === "failed"
      ? value.code === "payload_invalid"
      : [
          "consent_epoch_changed",
          "consent_inactive",
          "event_expired",
          "recipient_ineligible",
          "source_invalid",
          "transport_unavailable",
        ].includes(value.code))
  ) {
    return Object.freeze({ code: value.code, kind: value.kind, outboxId: value.outboxId });
  }
  if (
    value.kind !== "ready" ||
    value.deliveryId !== claim.deliveryId ||
    value.outboxId !== claim.outboxId ||
    value.claimToken !== claim.claimToken ||
    value.notificationId !== claim.notificationId ||
    !isUuid(value.consentEpoch) ||
    !EVENT_TYPES.has(value.eventType) ||
    typeof value.endpoint !== "string" ||
    !value.endpoint ||
    typeof value.p256dh !== "string" ||
    !value.p256dh ||
    typeof value.auth !== "string" ||
    !value.auth ||
    value.endpointFingerprintAlgorithm !== "sha256-endpoint-utf8-v1" ||
    !SHA256_HEX_PATTERN.test(value.endpointFingerprintHex) ||
    value.vapidFingerprintAlgorithm !== "sha256-vapid-p256-uncompressed-v1" ||
    !SHA256_HEX_PATTERN.test(value.vapidFingerprintHex) ||
    !isPositiveBigintString(value.transportVersion) ||
    !isSafePayload(value.payload) ||
    !isTimestampString(value.expiresAt) ||
    !isTimestampString(value.databaseNow) ||
    !isPositiveBigintString(value.requestDeadlineMs) ||
    (value.pushTtlSafetyBudgetMs !== null &&
      !isPositiveBigintString(value.pushTtlSafetyBudgetMs) &&
      value.pushTtlSafetyBudgetMs !== "0")
  ) {
    throw fixedError("DISPATCH_V2_PREPARE_CONTRACT_INVALID");
  }
  return value;
}

function completionInput(providerOutcome) {
  if (!isObject(providerOutcome) || providerOutcome.persistable !== true) {
    throw fixedError("DISPATCH_V2_OUTCOME_POLICY_REQUIRED");
  }
  if (providerOutcome.kind === "accepted") {
    return Object.freeze({ errorCode: null, nextAttemptAt: null, outcome: "accepted" });
  }
  if (
    providerOutcome.kind === "rate-limited" &&
    providerOutcome.deliveryErrorCode === "provider_rate_limited" &&
    isNonnegativeSafeInteger(providerOutcome.nextAttemptAtMs)
  ) {
    return Object.freeze({
      errorCode: "provider_rate_limited",
      nextAttemptAt: new Date(providerOutcome.nextAttemptAtMs).toISOString(),
      outcome: "retry_pending",
    });
  }
  if (providerOutcome.kind === "provider-stale") {
    return Object.freeze({
      errorCode: "provider_endpoint_inactive",
      nextAttemptAt: null,
      outcome: "provider_endpoint_inactive",
    });
  }
  if (providerOutcome.kind === "permanent" && providerOutcome.deliveryErrorCode === "provider_permanent") {
    return Object.freeze({
      errorCode: "provider_permanent",
      nextAttemptAt: null,
      outcome: "failed",
    });
  }
  throw fixedError("DISPATCH_V2_OUTCOME_POLICY_REQUIRED");
}

function expectedCompletionStates(input) {
  if (input.outcome === "accepted") return new Set(["accepted"]);
  if (input.outcome === "provider_endpoint_inactive") return new Set(["cancelled"]);
  if (input.outcome === "failed") return new Set(["failed"]);
  return new Set(["pending", "cancelled", "failed"]);
}

function validateCompletionResult(value, input, claim) {
  const validCode =
    isObject(value) &&
    ((input.outcome === "accepted" && value.state === "accepted" && value.code === null) ||
      (input.outcome === "provider_endpoint_inactive" &&
        value.state === "cancelled" &&
        value.code === "provider_endpoint_inactive") ||
      (input.outcome === "failed" && value.state === "failed" && value.code === "provider_permanent") ||
      (input.outcome === "retry_pending" &&
        ((value.state === "pending" && value.code === "provider_rate_limited") ||
          (value.state === "cancelled" && value.code === "event_expired") ||
          (value.state === "failed" && value.code === "attempts_exhausted"))));
  if (
    !isObject(value) ||
    value.version !== 1 ||
    value.kind !== "completed" ||
    !expectedCompletionStates(input).has(value.state) ||
    !validCode ||
    value.deliveryId !== claim.deliveryId ||
    value.outboxId !== claim.outboxId ||
    !isTimestampString(value.databaseNow)
  ) {
    throw fixedError("DISPATCH_V2_COMPLETE_CONTRACT_INVALID");
  }
  return value;
}

function validateFinalizeResult(value, expectedOutboxId) {
  const validOutcome =
    isObject(value) &&
    ((value.kind === "finalized" &&
      ((value.outcome === "completed" && value.outcomeCode === "deliveries_terminal_with_acceptance") ||
        (value.outcome === "failed" && value.outcomeCode === "deliveries_terminal_failed") ||
        (value.outcome === "cancelled" && value.outcomeCode === "deliveries_terminal_cancelled")) &&
      isTimestampString(value.outcomeAt)) ||
      (value.kind === "incomplete" && value.code === "frozen_outbox_without_delivery") ||
      (value.kind === "pending" &&
        value.code === "deliveries_nonterminal" &&
        Number.isInteger(value.nonterminalCount) &&
        value.nonterminalCount > 0));
  if (
    !isObject(value) ||
    value.version !== 1 ||
    !["finalized", "incomplete", "pending"].includes(value.kind) ||
    value.outboxId !== expectedOutboxId ||
    !validOutcome
  ) {
    throw fixedError("DISPATCH_V2_FINALIZE_CONTRACT_INVALID");
  }
  return value;
}

function validateFinishResult(value, succeeded, workerToken, generation) {
  const expectedStates = succeeded ? ["completed"] : ["failed", "expired"];
  const expectedResultCode =
    isObject(value) && value.state === "expired"
      ? "hard_deadline_elapsed"
      : succeeded
        ? "normal_exit"
        : "controlled_failure";
  if (
    !isObject(value) ||
    value.version !== 1 ||
    value.kind !== "finished" ||
    !expectedStates.includes(value.state) ||
    value.workerToken !== workerToken ||
    value.generation !== generation ||
    value.resultCode !== expectedResultCode ||
    !isTimestampString(value.finishedAt) ||
    !isTimestampString(value.databaseNow)
  ) {
    throw fixedError("DISPATCH_V2_FINISH_CONTRACT_INVALID");
  }
}

export function dispatcherV2RuntimeAccess(readEnvironment) {
  if (typeof readEnvironment !== "function") throw fixedError("DISPATCH_V2_RUNTIME_CONFIG_INVALID");
  const hostedRuntime = HOSTED_RUNTIME_MARKERS.some((name) => Boolean(readEnvironment(name)));
  return Object.freeze({
    hostedRuntime,
    localTestEnabled: !hostedRuntime && readEnvironment("NOTIFICATION_DISPATCH_V2_RUNTIME_MODE") === "local-test-v1",
  });
}

export function readDispatcherV2LocalConfig(readEnvironment) {
  const access = dispatcherV2RuntimeAccess(readEnvironment);
  const batchSizeText = readEnvironment("NOTIFICATION_OUTBOX_BATCH_SIZE");
  const expectedGeneration = readEnvironment("NOTIFICATION_DISPATCH_V2_EXPECTED_GENERATION");
  const batchSize = Number(batchSizeText);
  if (
    !access.localTestEnabled ||
    !isPositiveBigintString(expectedGeneration) ||
    !/^[1-9][0-9]*$/u.test(batchSizeText) ||
    !Number.isSafeInteger(batchSize) ||
    batchSize > 100
  ) {
    throw fixedError("DISPATCH_V2_RUNTIME_CONFIG_INVALID");
  }
  return Object.freeze({ batchSize, expectedGeneration });
}

export function safeDispatcherV2RuntimeErrorCode(error) {
  const candidate = error instanceof Error ? error.message : "";
  return DISPATCH_V2_RUNTIME_ERROR_CODE_SET.has(candidate) ? candidate : "DISPATCH_V2_FAILED";
}

export async function runDispatcherV2Batch({ batchSize, database, expectedGeneration, sendPrepared }) {
  requireDatabasePort(database);
  if (
    !Number.isSafeInteger(batchSize) ||
    batchSize <= 0 ||
    batchSize > 100 ||
    !isPositiveBigintString(expectedGeneration) ||
    typeof sendPrepared !== "function"
  ) {
    throw fixedError("DISPATCH_V2_RUNTIME_CONFIG_INVALID");
  }

  const begin = validateBeginResult(await database.beginWorker(expectedGeneration), expectedGeneration);
  const workerToken = begin.workerToken;
  const counts = { accepted: 0, cancelled: 0, claimed: 0, failed: 0, finalized: 0, terminalized: 0 };
  let batchExhausted = true;
  let succeeded = false;
  let result;
  let runError = null;

  try {
    for (let index = 0; index < batchSize; index += 1) {
      const claim = validateClaimResult(await database.claimDelivery(workerToken));
      if (claim.kind === "empty") {
        batchExhausted = false;
        break;
      }
      if (claim.kind === "terminalized") {
        counts.terminalized += 1;
        const finalized = validateFinalizeResult(await database.finalizeOutbox(claim.outboxId), claim.outboxId);
        if (finalized.kind === "finalized") counts.finalized += 1;
        continue;
      }

      counts.claimed += 1;
      const attempt = await database.withSendTransaction(
        { claimToken: claim.claimToken, workerToken },
        async (transaction) => {
          if (
            !isObject(transaction) ||
            typeof transaction.prepare !== "function" ||
            typeof transaction.complete !== "function"
          ) {
            throw fixedError("DISPATCH_V2_DATABASE_CONTRACT_INVALID");
          }
          const prepared = validatePrepareResult(await transaction.prepare(), claim);
          if (prepared.kind === "cancelled" || prepared.kind === "failed") return prepared;

          const providerOutcome = await sendPrepared(prepared);
          const input = completionInput(providerOutcome);
          const completed = validateCompletionResult(await transaction.complete(input), input, claim);
          return Object.freeze({
            kind: completed.state,
            logCode: providerOutcome.logCode,
            outboxId: completed.outboxId,
          });
        }
      );

      if (!isObject(attempt) || !isPositiveBigintString(attempt.outboxId)) {
        throw fixedError("DISPATCH_V2_DATABASE_CONTRACT_INVALID");
      }
      if (attempt.kind === "accepted") counts.accepted += 1;
      else if (attempt.kind === "failed") counts.failed += 1;
      else if (attempt.kind === "cancelled") counts.cancelled += 1;

      const finalized = validateFinalizeResult(await database.finalizeOutbox(attempt.outboxId), attempt.outboxId);
      if (finalized.kind === "finalized") counts.finalized += 1;
    }
    succeeded = true;
    result = Object.freeze({ batchExhausted, kind: "completed", version: 1, ...counts });
  } catch (error) {
    runError = error;
  }

  try {
    validateFinishResult(await database.finishWorker(workerToken, succeeded), succeeded, workerToken, begin.generation);
  } catch (error) {
    runError ??= error;
  }
  if (runError) throw runError;
  return result;
}
