import { isUsableAbortSignal, settleAbortableOperation } from "./abortableOperation.ts";

export const PUSH_SIGN_OUT_COORDINATOR_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: "PUSH_SIGN_OUT_COORDINATOR_INVALID_CONFIGURATION",
});

export class NotificationPushSignOutCoordinatorError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NotificationPushSignOutCoordinatorError";
    this.code = code;
  }
}

type CurrentBindingState = "auth-unverified" | "cleanup-required" | "enabled" | "provisioning";

interface PushServerConsentSnapshot {
  readonly consentEpoch: string;
  readonly consentId: string;
  readonly consentVersion: string;
}

export interface PushSignOutBindingSnapshot {
  readonly authUserId: string;
  readonly bindingId: string;
  readonly deviceId: string;
  readonly localRevision: string;
  readonly reason?: string;
  readonly serverConsent: PushServerConsentSnapshot | null;
  readonly state: CurrentBindingState;
}

interface PushSignOutStoragePort<Attempt extends object> {
  completePendingPushCleanup: (attempt: Attempt) => PromiseLike<unknown>;
  suspendCurrentPushBinding: (input: {
    authUserId: string;
    bindingId: string;
    expectedLocalRevision: string;
    reason: "user_logout";
  }) => PromiseLike<unknown>;
}

interface PushSignOutOwnerQuarantinePort {
  quarantineOwnedPushDevice: (input: {
    consentEpoch: string;
    consentVersion: string;
    deviceId: string;
    signal?: AbortSignal;
  }) => PromiseLike<unknown>;
}

interface PushSignOutCleanupPort<Attempt extends object> {
  processPendingPushCleanup: (input: { attempt: Attempt; signal?: AbortSignal }) => PromiseLike<unknown>;
}

interface PushSignOutBrowserPort {
  deactivateCurrentSubscription: (input?: { signal?: AbortSignal }) => PromiseLike<unknown>;
}

interface PushSignOutCoordinatorOptions<Attempt extends object> {
  readonly browser: PushSignOutBrowserPort;
  readonly cleanup: PushSignOutCleanupPort<Attempt>;
  readonly owner: PushSignOutOwnerQuarantinePort;
  readonly storage: PushSignOutStoragePort<Attempt>;
}

interface ProcessCurrentDeviceSignOutInput<Binding extends PushSignOutBindingSnapshot> {
  readonly authUserId: string;
  readonly binding: Binding;
  readonly signal?: AbortSignal;
}

export type PushSignOutCoordinatorResult = { kind: "completed" } | { kind: "pending" };

const COMPLETED_RESULT = Object.freeze({ kind: "completed" } as const);
const PENDING_RESULT = Object.freeze({ kind: "pending" } as const);
const SCHEMA_VERSION = 1;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const POSITIVE_BIGINT_PATTERN = /^[1-9][0-9]*$/u;
const CLEANUP_TOKEN_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;
const CLEANUP_REASONS = new Set([
  "account_changed",
  "auth_rejected",
  "permission_revoked",
  "subscription_changed",
  "user_logout",
]);
const ACTIVE_BINDING_KEYS = ["authUserId", "bindingId", "deviceId", "localRevision", "serverConsent", "state"];
const SUSPENDED_BINDING_KEYS = [...ACTIVE_BINDING_KEYS.slice(0, -1), "reason", "state"];
const SERVER_CONSENT_KEYS = ["consentEpoch", "consentId", "consentVersion"];
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

function coordinatorError(): NotificationPushSignOutCoordinatorError {
  return new NotificationPushSignOutCoordinatorError(PUSH_SIGN_OUT_COORDINATOR_ERROR_CODES.INVALID_CONFIGURATION);
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<PropertyKey, unknown>, expectedKeys: string[]): boolean {
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

function isServerConsent(value: unknown): value is PushServerConsentSnapshot {
  return (
    isRecord(value) &&
    hasExactKeys(value, SERVER_CONSENT_KEYS) &&
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

function validBinding(value: unknown): value is PushSignOutBindingSnapshot {
  if (!isRecord(value)) return false;
  const state = value.state;
  const suspended = state === "auth-unverified" || state === "cleanup-required";
  if (!hasExactKeys(value, suspended ? SUSPENDED_BINDING_KEYS : ACTIVE_BINDING_KEYS)) return false;
  if (
    !isCanonicalUuid(value.authUserId) ||
    !isCanonicalUuidV4(value.bindingId) ||
    !isCanonicalUuid(value.deviceId) ||
    !isCanonicalUuidV4(value.localRevision)
  ) {
    return false;
  }
  if (state === "enabled") return isServerConsent(value.serverConsent);
  if (state === "provisioning") return value.serverConsent === null;
  if (state === "auth-unverified") {
    return (
      value.reason === "auth_unavailable" && (value.serverConsent === null || isServerConsent(value.serverConsent))
    );
  }
  return (
    state === "cleanup-required" &&
    typeof value.reason === "string" &&
    CLEANUP_REASONS.has(value.reason) &&
    (value.serverConsent === null || isServerConsent(value.serverConsent))
  );
}

function validInput<Binding extends PushSignOutBindingSnapshot>(
  value: unknown
): value is ProcessCurrentDeviceSignOutInput<Binding> {
  if (!isRecord(value)) return false;
  const expectedKeys = Reflect.ownKeys(value).includes("signal")
    ? ["authUserId", "binding", "signal"]
    : ["authUserId", "binding"];
  if (!hasExactKeys(value, expectedKeys) || !isCanonicalUuid(value.authUserId) || !validBinding(value.binding)) {
    return false;
  }
  if (value.authUserId !== value.binding.authUserId) return false;
  return !Reflect.ownKeys(value).includes("signal") || value.signal === undefined || isUsableAbortSignal(value.signal);
}

function isAborted(signal: AbortSignal | undefined): boolean {
  try {
    return signal?.aborted === true;
  } catch {
    return true;
  }
}

function expectedReason(binding: PushSignOutBindingSnapshot): string {
  return binding.state === "cleanup-required" && binding.reason ? binding.reason : "user_logout";
}

function exactAttempt<Attempt extends object>(
  value: unknown,
  state: Record<PropertyKey, unknown>,
  binding: PushSignOutBindingSnapshot
): value is Attempt {
  if (!isRecord(value) || !hasExactKeys(value, ATTEMPT_KEYS)) return false;
  const reason = expectedReason(binding);
  return (
    isCanonicalUuidV4(value.attemptId) &&
    value.authUserId === binding.authUserId &&
    value.bindingId === binding.bindingId &&
    value.bindingRevision === state.localRevision &&
    typeof value.cleanupToken === "string" &&
    CLEANUP_TOKEN_PATTERN.test(value.cleanupToken) &&
    value.deviceId === binding.deviceId &&
    value.reason === reason &&
    value.schemaVersion === SCHEMA_VERSION &&
    sameServerConsent(value.serverConsent, binding.serverConsent)
  );
}

function exactSuspension<Attempt extends object>(value: unknown, binding: PushSignOutBindingSnapshot): Attempt | null {
  if (!isRecord(value) || !hasExactKeys(value, ["attempt", "state"]) || !isRecord(value.state)) return null;
  const state = value.state;
  if (
    !hasExactKeys(state, SUSPENDED_BINDING_KEYS) ||
    state.authUserId !== binding.authUserId ||
    state.bindingId !== binding.bindingId ||
    state.deviceId !== binding.deviceId ||
    !isCanonicalUuidV4(state.localRevision) ||
    state.reason !== expectedReason(binding) ||
    !sameServerConsent(state.serverConsent, binding.serverConsent) ||
    state.state !== "cleanup-required"
  ) {
    return null;
  }
  return exactAttempt<Attempt>(value.attempt, state, binding) ? value.attempt : null;
}

function hasExactKind(value: unknown, kind: string): boolean {
  return isRecord(value) && hasExactKeys(value, ["kind"]) && value.kind === kind;
}

export function createNotificationPushSignOutCoordinator<
  Attempt extends object,
  Binding extends PushSignOutBindingSnapshot,
>(options: PushSignOutCoordinatorOptions<Attempt>) {
  const browser = options?.browser;
  const cleanup = options?.cleanup;
  const owner = options?.owner;
  const storage = options?.storage;
  if (
    !browser ||
    typeof browser.deactivateCurrentSubscription !== "function" ||
    !cleanup ||
    typeof cleanup.processPendingPushCleanup !== "function" ||
    !owner ||
    typeof owner.quarantineOwnedPushDevice !== "function" ||
    !storage ||
    typeof storage.completePendingPushCleanup !== "function" ||
    typeof storage.suspendCurrentPushBinding !== "function"
  ) {
    throw coordinatorError();
  }

  async function processCurrentDeviceSignOut(
    input: ProcessCurrentDeviceSignOutInput<Binding>
  ): Promise<PushSignOutCoordinatorResult> {
    if (!validInput<Binding>(input)) return PENDING_RESULT;

    const { authUserId, binding, signal } = input;
    let attempt: Attempt | null = null;
    let result: PushSignOutCoordinatorResult = PENDING_RESULT;
    try {
      const suspensionResult = await settleAbortableOperation(
        () =>
          storage.suspendCurrentPushBinding({
            authUserId,
            bindingId: binding.bindingId,
            expectedLocalRevision: binding.localRevision,
            reason: "user_logout",
          }),
        signal
      );
      if (suspensionResult.kind === "completed") {
        attempt = exactSuspension<Attempt>(suspensionResult.value, binding);
      } else if (suspensionResult.kind === "failed") {
        // A valid owner snapshot can still close the server side. Without an
        // exact attempt, however, local completion must remain pending.
      }

      const consent = binding.serverConsent;
      if (!isAborted(signal) && consent) {
        const ownerResult = await settleAbortableOperation(
          () =>
            owner.quarantineOwnedPushDevice({
              consentEpoch: consent.consentEpoch,
              consentVersion: consent.consentVersion,
              deviceId: binding.deviceId,
              ...(signal ? { signal } : {}),
            }),
          signal
        );
        if (ownerResult.kind === "completed" && hasExactKind(ownerResult.value, "completed")) {
          if (attempt) {
            const capturedAttempt = attempt;
            const localCompletion = await settleAbortableOperation(
              () => storage.completePendingPushCleanup(capturedAttempt),
              signal
            );
            if (localCompletion.kind === "completed" && typeof localCompletion.value === "boolean") {
              result = COMPLETED_RESULT;
            } else if (localCompletion.kind === "failed" && !isAborted(signal)) {
              const cleanupResult = await settleAbortableOperation(
                () => cleanup.processPendingPushCleanup({ attempt: capturedAttempt, signal }),
                signal
              );
              if (cleanupResult.kind === "completed" && hasExactKind(cleanupResult.value, "completed")) {
                result = COMPLETED_RESULT;
              }
            }
          }
        } else if (!isAborted(signal) && attempt) {
          const capturedAttempt = attempt;
          const cleanupResult = await settleAbortableOperation(
            () => cleanup.processPendingPushCleanup({ attempt: capturedAttempt, signal }),
            signal
          );
          if (cleanupResult.kind === "completed" && hasExactKind(cleanupResult.value, "completed")) {
            result = COMPLETED_RESULT;
          }
        }
      } else if (!isAborted(signal) && attempt) {
        const capturedAttempt = attempt;
        const cleanupResult = await settleAbortableOperation(
          () => cleanup.processPendingPushCleanup({ attempt: capturedAttempt, signal }),
          signal
        );
        if (cleanupResult.kind === "completed" && hasExactKind(cleanupResult.value, "completed")) {
          result = COMPLETED_RESULT;
        }
      }
    } finally {
      await settleAbortableOperation(
        () => browser.deactivateCurrentSubscription(signal ? { signal } : undefined),
        signal
      );
      // Server closure and the durable retry record are authoritative. A
      // browser failure or caller abort must not erase either result.
    }
    return result;
  }

  return Object.freeze({ processCurrentDeviceSignOut });
}
