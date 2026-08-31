export const PUSH_AUTH_FAILURE_COORDINATOR_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: "PUSH_AUTH_FAILURE_COORDINATOR_INVALID_CONFIGURATION",
});

export class NotificationPushAuthFailureCoordinatorError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NotificationPushAuthFailureCoordinatorError";
    this.code = code;
  }
}

type AuthFailureKind = "rejected" | "unavailable";
type CurrentBindingState = "auth-unverified" | "cleanup-required" | "enabled" | "provisioning";

interface PushBindingCasSnapshot {
  readonly authUserId: string;
  readonly bindingId: string;
  readonly deviceId: string;
  readonly localRevision: string;
  readonly reason?: string;
  readonly serverConsent: unknown;
  readonly state: CurrentBindingState;
}

interface PushAuthFailureStoragePort<Attempt extends object> {
  suspendCurrentPushBinding: (input: {
    authUserId: string;
    bindingId: string;
    expectedLocalRevision: string;
    reason: "auth_rejected" | "auth_unavailable";
  }) => PromiseLike<{ attempt: Attempt | null; state: unknown }>;
}

interface PushCleanupCoordinatorPort<Attempt extends object> {
  processPendingPushCleanup: (input: {
    attempt: Attempt;
    signal?: AbortSignal;
  }) => PromiseLike<{ kind: "completed" } | { kind: "pending" }>;
}

interface PushAuthFailureCoordinatorOptions<Attempt extends object> {
  cleanup: PushCleanupCoordinatorPort<Attempt>;
  storage: PushAuthFailureStoragePort<Attempt>;
}

interface ProcessAuthFailureInput<Binding extends PushBindingCasSnapshot> {
  authUserId: string;
  binding: Binding;
  kind: AuthFailureKind;
  signal?: AbortSignal;
}

export type PushAuthFailureCoordinatorResult =
  { kind: "cleanup-completed" } | { kind: "local-closed" } | { kind: "pending" };

const CLEANUP_COMPLETED_RESULT = Object.freeze({ kind: "cleanup-completed" } as const);
const LOCAL_CLOSED_RESULT = Object.freeze({ kind: "local-closed" } as const);
const PENDING_RESULT = Object.freeze({ kind: "pending" } as const);
const SCHEMA_VERSION = 1;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const POSITIVE_BIGINT_PATTERN = /^[1-9][0-9]*$/u;
const CLEANUP_TOKEN_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;
const REJECTED_STATES = new Set<CurrentBindingState>([
  "auth-unverified",
  "cleanup-required",
  "enabled",
  "provisioning",
]);
const UNAVAILABLE_SUSPEND_STATES = new Set<CurrentBindingState>(["auth-unverified", "enabled", "provisioning"]);
const CLEANUP_REASONS = new Set([
  "account_changed",
  "auth_rejected",
  "permission_revoked",
  "subscription_changed",
  "user_logout",
]);
const SAFE_SUSPENDED_BINDING_KEYS = [
  "authUserId",
  "bindingId",
  "deviceId",
  "localRevision",
  "reason",
  "serverConsent",
  "state",
];
const SAFE_ACTIVE_BINDING_KEYS = SAFE_SUSPENDED_BINDING_KEYS.filter((key) => key !== "reason");
const SERVER_CONSENT_KEYS = ["consentEpoch", "consentId", "consentVersion"];
const PENDING_CLEANUP_ATTEMPT_KEYS = [
  "attemptId",
  "authUserId",
  "bindingId",
  "bindingRevision",
  "cleanupToken",
  "deviceId",
  "reason",
  "schemaVersion",
  "serverConsent",
];
const PROCESS_INPUT_KEYS = ["authUserId", "binding", "kind"];

function coordinatorError(code: string): NotificationPushAuthFailureCoordinatorError {
  return new NotificationPushAuthFailureCoordinatorError(code);
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKind(value: unknown, kind: string): boolean {
  return isRecord(value) && Reflect.ownKeys(value).length === 1 && value.kind === kind;
}

function exactSuspension(value: unknown): { attempt: object | null; state: Record<PropertyKey, unknown> } | null {
  if (!isRecord(value)) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 2 || !keys.includes("attempt") || !keys.includes("state") || !isRecord(value.state)) return null;
  const attempt = value.attempt;
  if (attempt !== null && !isRecord(attempt)) return null;
  return { attempt, state: value.state };
}

function hasExactStringKeys(value: Record<PropertyKey, unknown>, expectedKeys: string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => keys.includes(key));
}

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isCanonicalUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

function isCanonicalPostgresBigint(value: unknown): value is string {
  if (typeof value !== "string" || !POSITIVE_BIGINT_PATTERN.test(value)) return false;
  try {
    return BigInt(value) <= MAX_POSTGRES_BIGINT;
  } catch {
    return false;
  }
}

function isServerConsent(value: unknown): value is Record<PropertyKey, unknown> {
  return (
    isRecord(value) &&
    hasExactStringKeys(value, SERVER_CONSENT_KEYS) &&
    isCanonicalUuid(value.consentEpoch) &&
    isCanonicalPostgresBigint(value.consentId) &&
    isCanonicalPostgresBigint(value.consentVersion)
  );
}

function sameServerConsent(left: unknown, right: unknown): boolean {
  if (left === null || right === null) return left === right;
  return (
    isServerConsent(left) &&
    isServerConsent(right) &&
    left.consentEpoch === right.consentEpoch &&
    left.consentId === right.consentId &&
    left.consentVersion === right.consentVersion
  );
}

function hasValidBindingConsent(binding: PushBindingCasSnapshot): boolean {
  if (binding.state === "provisioning") return binding.serverConsent === null;
  if (binding.state === "enabled") return isServerConsent(binding.serverConsent);
  return binding.serverConsent === null || isServerConsent(binding.serverConsent);
}

function matchingSuspendedState(
  value: Record<PropertyKey, unknown>,
  binding: PushBindingCasSnapshot,
  expectedState: "auth-unverified" | "cleanup-required",
  expectedReason: string
): boolean {
  return (
    hasExactStringKeys(value, SAFE_SUSPENDED_BINDING_KEYS) &&
    value.authUserId === binding.authUserId &&
    value.bindingId === binding.bindingId &&
    value.deviceId === binding.deviceId &&
    isCanonicalUuidV4(value.localRevision) &&
    value.reason === expectedReason &&
    sameServerConsent(value.serverConsent, binding.serverConsent) &&
    value.state === expectedState
  );
}

function attemptMatchesSuspension<Attempt extends object>(
  attempt: object,
  state: Record<PropertyKey, unknown>,
  binding: PushBindingCasSnapshot,
  reason: string
): attempt is Attempt {
  const value = attempt as Record<PropertyKey, unknown>;
  return (
    hasExactStringKeys(value, PENDING_CLEANUP_ATTEMPT_KEYS) &&
    isCanonicalUuidV4(value.attemptId) &&
    value.authUserId === binding.authUserId &&
    value.bindingId === binding.bindingId &&
    value.bindingRevision === state.localRevision &&
    CLEANUP_TOKEN_PATTERN.test(typeof value.cleanupToken === "string" ? value.cleanupToken : "") &&
    value.deviceId === state.deviceId &&
    value.reason === reason &&
    value.schemaVersion === SCHEMA_VERSION &&
    sameServerConsent(value.serverConsent, state.serverConsent)
  );
}

function bindingMatchesInput<Binding extends PushBindingCasSnapshot>(
  input: ProcessAuthFailureInput<Binding> | null | undefined
): input is ProcessAuthFailureInput<Binding> {
  if (!isRecord(input) || !isRecord(input.binding)) return false;
  const { authUserId, binding, kind } = input;
  const inputKeys = Reflect.ownKeys(input);
  const expectedInputKeys = inputKeys.includes("signal") ? [...PROCESS_INPUT_KEYS, "signal"] : PROCESS_INPUT_KEYS;
  const expectedBindingKeys =
    binding.state === "auth-unverified" || binding.state === "cleanup-required"
      ? SAFE_SUSPENDED_BINDING_KEYS
      : SAFE_ACTIVE_BINDING_KEYS;
  return (
    hasExactStringKeys(input, expectedInputKeys) &&
    hasExactStringKeys(binding, expectedBindingKeys) &&
    isCanonicalUuid(authUserId) &&
    binding.authUserId === authUserId &&
    isCanonicalUuidV4(binding.bindingId) &&
    isCanonicalUuid(binding.deviceId) &&
    isCanonicalUuidV4(binding.localRevision) &&
    hasValidBindingConsent(binding) &&
    (binding.state !== "auth-unverified" || binding.reason === "auth_unavailable") &&
    (binding.state !== "cleanup-required" ||
      (typeof binding.reason === "string" && CLEANUP_REASONS.has(binding.reason))) &&
    (kind === "rejected" || kind === "unavailable")
  );
}

export function createNotificationPushAuthFailureCoordinator<
  Attempt extends object,
  Binding extends PushBindingCasSnapshot,
>(options: PushAuthFailureCoordinatorOptions<Attempt>) {
  const cleanup = options?.cleanup;
  const storage = options?.storage;
  if (
    !cleanup ||
    typeof cleanup.processPendingPushCleanup !== "function" ||
    !storage ||
    typeof storage.suspendCurrentPushBinding !== "function"
  ) {
    throw coordinatorError(PUSH_AUTH_FAILURE_COORDINATOR_ERROR_CODES.INVALID_CONFIGURATION);
  }

  async function processAuthFailure(
    input: ProcessAuthFailureInput<Binding>
  ): Promise<PushAuthFailureCoordinatorResult> {
    try {
      if (!bindingMatchesInput(input)) return PENDING_RESULT;
      const { authUserId, binding, kind, signal } = input;

      if (kind === "unavailable" && binding.state === "cleanup-required") return PENDING_RESULT;
      const allowedStates = kind === "rejected" ? REJECTED_STATES : UNAVAILABLE_SUSPEND_STATES;
      if (!allowedStates.has(binding.state)) return PENDING_RESULT;

      const suspension = await storage.suspendCurrentPushBinding({
        authUserId,
        bindingId: binding.bindingId,
        expectedLocalRevision: binding.localRevision,
        reason: kind === "rejected" ? "auth_rejected" : "auth_unavailable",
      });
      const exact = exactSuspension(suspension);
      if (!exact) return PENDING_RESULT;
      if (kind === "unavailable") {
        return exact.attempt === null &&
          matchingSuspendedState(exact.state, binding, "auth-unverified", "auth_unavailable")
          ? LOCAL_CLOSED_RESULT
          : PENDING_RESULT;
      }
      const reason = binding.state === "cleanup-required" ? binding.reason : "auth_rejected";
      if (
        !reason ||
        !exact.attempt ||
        !matchingSuspendedState(exact.state, binding, "cleanup-required", reason) ||
        !attemptMatchesSuspension<Attempt>(exact.attempt, exact.state, binding, reason)
      ) {
        return PENDING_RESULT;
      }

      const cleanupResult = await cleanup.processPendingPushCleanup({ attempt: exact.attempt, signal });
      return hasExactKind(cleanupResult, "completed") ? CLEANUP_COMPLETED_RESULT : PENDING_RESULT;
    } catch {
      return PENDING_RESULT;
    }
  }

  return Object.freeze({ processAuthFailure });
}
