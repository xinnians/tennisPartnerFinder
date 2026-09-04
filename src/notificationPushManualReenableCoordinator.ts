export const PUSH_MANUAL_REENABLE_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: "PUSH_MANUAL_REENABLE_INVALID_CONFIGURATION",
});

export class NotificationPushManualReenableError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NotificationPushManualReenableError";
    this.code = code;
  }
}

interface PushServerConsentIdentity {
  readonly consentEpoch: string;
  readonly consentId: string;
  readonly consentVersion: string;
}

interface AuthUnverifiedBinding {
  readonly authUserId: string;
  readonly bindingId: string;
  readonly deviceId: string;
  readonly localRevision: string;
  readonly reason: "auth_unavailable";
  readonly serverConsent: PushServerConsentIdentity | null;
  readonly state: "auth-unverified";
}

interface PendingCleanupAttempt {
  readonly attemptId: string;
  readonly authUserId: string;
  readonly bindingId: string;
  readonly bindingRevision: string;
  readonly cleanupToken: string;
  readonly deviceId: string;
  readonly reason: "subscription_changed";
  readonly schemaVersion: 1;
  readonly serverConsent: PushServerConsentIdentity | null;
}

interface PushProvisioningBinding {
  readonly authUserId: string;
  readonly bindingId: string;
  readonly cleanupToken: string;
  readonly deviceId: string;
  readonly key: "current";
  readonly localRevision: string;
  readonly schemaVersion: 1;
  readonly serverConsent: null;
  readonly state: "provisioning";
}

interface PushManualReenableStoragePort {
  beginExplicitPushProvisioning: (input: {
    authUserId: string;
    deviceId: string;
    expectedCurrentRevision: null;
  }) => PromiseLike<PushProvisioningBinding>;
  beginExplicitPushReenable: (input: {
    authUserId: string;
    bindingId: string;
    expectedLocalRevision: string;
  }) => PromiseLike<PendingCleanupAttempt>;
}

interface PushCleanupPort {
  processPendingPushCleanup: (input: {
    attempt: PendingCleanupAttempt;
    signal?: AbortSignal;
  }) => PromiseLike<{ kind: "completed" } | { kind: "pending" }>;
}

interface PushEnablePort {
  enableProvisioning: (input: {
    authProofRevision: number;
    authUserId: string;
    predecessor: PushServerConsentIdentity | null;
    provisioning: PushProvisioningBinding;
    signal?: AbortSignal;
  }) => PromiseLike<{ kind: "committed" } | { kind: "pending" }>;
}

interface PushManualReenableOptions {
  cleanup: PushCleanupPort;
  enable: PushEnablePort;
  isVerifiedAuthProofCurrent: (proof: { authUserId: string; revision: number }) => boolean;
  storage: PushManualReenableStoragePort;
}

interface StartManualPushReenableInput {
  authProofRevision: number;
  authUserId: string;
  binding: AuthUnverifiedBinding;
  signal?: AbortSignal;
}

export type PushManualReenableResult = { kind: "committed" } | { kind: "pending" };

const COMMITTED_RESULT = Object.freeze({ kind: "committed" } as const);
const PENDING_RESULT = Object.freeze({ kind: "pending" } as const);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CLEANUP_TOKEN_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;
const POSITIVE_BIGINT_PATTERN = /^[1-9][0-9]*$/u;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

function coordinatorError(code: string): NotificationPushManualReenableError {
  return new NotificationPushManualReenableError(code);
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<PropertyKey, unknown>, expectedKeys: string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => keys.includes(key));
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

function validServerConsent(value: unknown): value is PushServerConsentIdentity {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["consentEpoch", "consentId", "consentVersion"]) &&
    validUuid(value.consentEpoch) &&
    validBigint(value.consentId) &&
    validBigint(value.consentVersion)
  );
}

function sameServerConsent(left: unknown, right: unknown): boolean {
  if (left === null || right === null) return left === right;
  return (
    validServerConsent(left) &&
    validServerConsent(right) &&
    left.consentEpoch === right.consentEpoch &&
    left.consentId === right.consentId &&
    left.consentVersion === right.consentVersion
  );
}

const BINDING_KEYS = ["authUserId", "bindingId", "deviceId", "localRevision", "reason", "serverConsent", "state"];
const ATTEMPT_KEYS = [
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
const PROVISIONING_KEYS = [
  "authUserId",
  "bindingId",
  "cleanupToken",
  "deviceId",
  "key",
  "localRevision",
  "schemaVersion",
  "serverConsent",
  "state",
];

function validBinding(value: unknown): value is AuthUnverifiedBinding {
  return (
    isRecord(value) &&
    hasExactKeys(value, BINDING_KEYS) &&
    validUuid(value.authUserId) &&
    validUuid(value.bindingId, true) &&
    validUuid(value.deviceId) &&
    validUuid(value.localRevision, true) &&
    value.reason === "auth_unavailable" &&
    (value.serverConsent === null || validServerConsent(value.serverConsent)) &&
    value.state === "auth-unverified"
  );
}

function validAttempt(value: unknown, binding: AuthUnverifiedBinding): value is PendingCleanupAttempt {
  return (
    isRecord(value) &&
    hasExactKeys(value, ATTEMPT_KEYS) &&
    validUuid(value.attemptId, true) &&
    value.authUserId === binding.authUserId &&
    value.bindingId === binding.bindingId &&
    value.bindingRevision === binding.localRevision &&
    typeof value.cleanupToken === "string" &&
    CLEANUP_TOKEN_PATTERN.test(value.cleanupToken) &&
    value.deviceId === binding.deviceId &&
    value.reason === "subscription_changed" &&
    value.schemaVersion === 1 &&
    sameServerConsent(value.serverConsent, binding.serverConsent)
  );
}

function validProvisioning(
  value: unknown,
  attempt: PendingCleanupAttempt,
  authUserId: string
): value is PushProvisioningBinding {
  return (
    isRecord(value) &&
    hasExactKeys(value, PROVISIONING_KEYS) &&
    value.authUserId === authUserId &&
    validUuid(value.bindingId, true) &&
    value.bindingId !== attempt.bindingId &&
    typeof value.cleanupToken === "string" &&
    CLEANUP_TOKEN_PATTERN.test(value.cleanupToken) &&
    value.cleanupToken !== attempt.cleanupToken &&
    value.deviceId === attempt.deviceId &&
    value.key === "current" &&
    validUuid(value.localRevision, true) &&
    value.schemaVersion === 1 &&
    value.serverConsent === null &&
    value.state === "provisioning"
  );
}

function exactKind(value: unknown, kind: string): boolean {
  return isRecord(value) && hasExactKeys(value, ["kind"]) && value.kind === kind;
}

export function createNotificationPushManualReenableCoordinator(options: PushManualReenableOptions) {
  const cleanup = options?.cleanup;
  const enable = options?.enable;
  const isVerifiedAuthProofCurrent = options?.isVerifiedAuthProofCurrent;
  const storage = options?.storage;
  if (
    !cleanup ||
    typeof cleanup.processPendingPushCleanup !== "function" ||
    !enable ||
    typeof enable.enableProvisioning !== "function" ||
    typeof isVerifiedAuthProofCurrent !== "function" ||
    !storage ||
    typeof storage.beginExplicitPushProvisioning !== "function" ||
    typeof storage.beginExplicitPushReenable !== "function"
  ) {
    throw coordinatorError(PUSH_MANUAL_REENABLE_ERROR_CODES.INVALID_CONFIGURATION);
  }

  async function startManualPushReenable(input: StartManualPushReenableInput): Promise<PushManualReenableResult> {
    try {
      if (!isRecord(input)) return PENDING_RESULT;
      const inputKeys = Reflect.ownKeys(input);
      const expectedInputKeys = inputKeys.includes("signal")
        ? ["authProofRevision", "authUserId", "binding", "signal"]
        : ["authProofRevision", "authUserId", "binding"];
      if (
        !hasExactKeys(input, expectedInputKeys) ||
        !Number.isSafeInteger(input.authProofRevision) ||
        input.authProofRevision < 0 ||
        !validUuid(input.authUserId) ||
        !validBinding(input.binding) ||
        input.binding.authUserId !== input.authUserId
      ) {
        return PENDING_RESULT;
      }

      const { authProofRevision, authUserId, binding, signal } = input;
      const proof = { authUserId, revision: authProofRevision };
      if (!isVerifiedAuthProofCurrent(proof)) return PENDING_RESULT;

      const attempt = await storage.beginExplicitPushReenable({
        authUserId,
        bindingId: binding.bindingId,
        expectedLocalRevision: binding.localRevision,
      });
      if (!validAttempt(attempt, binding) || !isVerifiedAuthProofCurrent(proof)) return PENDING_RESULT;

      const cleanupResult = await cleanup.processPendingPushCleanup({ attempt, signal });
      if (!exactKind(cleanupResult, "completed") || !isVerifiedAuthProofCurrent(proof)) return PENDING_RESULT;

      const provisioning = await storage.beginExplicitPushProvisioning({
        authUserId,
        deviceId: attempt.deviceId,
        expectedCurrentRevision: null,
      });
      if (!validProvisioning(provisioning, attempt, authUserId) || !isVerifiedAuthProofCurrent(proof)) {
        return PENDING_RESULT;
      }

      const enableResult = await enable.enableProvisioning({
        authProofRevision,
        authUserId,
        predecessor: attempt.serverConsent,
        provisioning,
        signal,
      });
      return exactKind(enableResult, "committed") && isVerifiedAuthProofCurrent(proof)
        ? COMMITTED_RESULT
        : PENDING_RESULT;
    } catch {
      return PENDING_RESULT;
    }
  }

  return Object.freeze({ startManualPushReenable });
}
