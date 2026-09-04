export const PUSH_AUTH_CORRELATION_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: "PUSH_AUTH_CORRELATION_INVALID_CONFIGURATION",
});

export class NotificationPushAuthCorrelationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NotificationPushAuthCorrelationError";
    this.code = code;
  }
}

type AuthFailureKind = "rejected" | "superseded" | "unavailable";
type CorrelatableAuthFailureKind = Exclude<AuthFailureKind, "superseded">;
type CurrentBindingState = "auth-unverified" | "cleanup-required" | "enabled" | "provisioning";

interface AuthFailureNotice {
  readonly kind: AuthFailureKind;
  readonly priorVerifiedAuthUserId?: string;
  readonly revision: number;
}

interface SafePushBinding {
  readonly authUserId: string;
  readonly bindingId: string;
  readonly deviceId: string;
  readonly localRevision: string;
  readonly reason?: string;
  readonly serverConsent: unknown;
  readonly state: CurrentBindingState;
}

type PushRuntimeState =
  | { readonly binding: SafePushBinding; readonly deviceId: string; readonly kind: CurrentBindingState }
  | { readonly kind: string };

interface PushAuthCorrelationStoragePort {
  readPushRuntimeState: () => PromiseLike<PushRuntimeState>;
}

interface PushAuthFailurePort {
  processAuthFailure: (input: {
    authUserId: string;
    binding: SafePushBinding;
    kind: CorrelatableAuthFailureKind;
    signal?: AbortSignal;
  }) => PromiseLike<{ kind: "cleanup-completed" } | { kind: "local-closed" } | { kind: "pending" }>;
}

interface PushAuthCorrelationOptions {
  authFailure: PushAuthFailurePort;
  isVerificationRevisionCurrent: (revision: number) => boolean;
  storage: PushAuthCorrelationStoragePort;
}

interface ProcessAuthFailureNoticeInput {
  notice: AuthFailureNotice;
  signal?: AbortSignal;
}

export type PushAuthCorrelationResult =
  { kind: "cleanup-completed" } | { kind: "ignored" } | { kind: "local-closed" } | { kind: "pending" };

const CLEANUP_COMPLETED_RESULT = Object.freeze({ kind: "cleanup-completed" } as const);
const IGNORED_RESULT = Object.freeze({ kind: "ignored" } as const);
const LOCAL_CLOSED_RESULT = Object.freeze({ kind: "local-closed" } as const);
const PENDING_RESULT = Object.freeze({ kind: "pending" } as const);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CORRELATABLE_RUNTIME_KINDS = new Set<CurrentBindingState>([
  "auth-unverified",
  "cleanup-required",
  "enabled",
  "provisioning",
]);

function correlationError(code: string): NotificationPushAuthCorrelationError {
  return new NotificationPushAuthCorrelationError(code);
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<PropertyKey, unknown>, expectedKeys: string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => keys.includes(key));
}

function validNotice(value: unknown): value is AuthFailureNotice {
  if (!isRecord(value)) return false;
  const hasPriorOwner = Reflect.ownKeys(value).includes("priorVerifiedAuthUserId");
  const expectedKeys = hasPriorOwner ? ["kind", "priorVerifiedAuthUserId", "revision"] : ["kind", "revision"];
  return (
    hasExactKeys(value, expectedKeys) &&
    (value.kind === "rejected" || value.kind === "superseded" || value.kind === "unavailable") &&
    Number.isSafeInteger(value.revision) &&
    Number(value.revision) >= 0 &&
    (!hasPriorOwner ||
      (typeof value.priorVerifiedAuthUserId === "string" && UUID_PATTERN.test(value.priorVerifiedAuthUserId)))
  );
}

function correlatableBinding(value: PushRuntimeState): SafePushBinding | null {
  if (
    !isRecord(value) ||
    !("binding" in value) ||
    typeof value.kind !== "string" ||
    !CORRELATABLE_RUNTIME_KINDS.has(value.kind)
  ) {
    return null;
  }
  if (!isRecord(value.binding) || value.binding.state !== value.kind) return null;
  const binding = value.binding as unknown as SafePushBinding;
  return typeof binding.authUserId === "string" && UUID_PATTERN.test(binding.authUserId) ? binding : null;
}

function exactResult(value: unknown): PushAuthCorrelationResult {
  if (!isRecord(value) || !hasExactKeys(value, ["kind"])) return PENDING_RESULT;
  if (value.kind === "cleanup-completed") return CLEANUP_COMPLETED_RESULT;
  if (value.kind === "local-closed") return LOCAL_CLOSED_RESULT;
  return PENDING_RESULT;
}

export function createNotificationPushAuthCorrelation(options: PushAuthCorrelationOptions) {
  const authFailure = options?.authFailure;
  const isVerificationRevisionCurrent = options?.isVerificationRevisionCurrent;
  const storage = options?.storage;
  if (
    !authFailure ||
    typeof authFailure.processAuthFailure !== "function" ||
    typeof isVerificationRevisionCurrent !== "function" ||
    !storage ||
    typeof storage.readPushRuntimeState !== "function"
  ) {
    throw correlationError(PUSH_AUTH_CORRELATION_ERROR_CODES.INVALID_CONFIGURATION);
  }

  async function processAuthFailureNotice(input: ProcessAuthFailureNoticeInput): Promise<PushAuthCorrelationResult> {
    try {
      if (!isRecord(input)) return IGNORED_RESULT;
      const inputKeys = Reflect.ownKeys(input);
      const expectedInputKeys = inputKeys.includes("signal") ? ["notice", "signal"] : ["notice"];
      if (!hasExactKeys(input, expectedInputKeys) || !validNotice(input.notice)) return IGNORED_RESULT;
      const { notice, signal } = input;
      if (notice.kind === "superseded" || !isVerificationRevisionCurrent(notice.revision)) return IGNORED_RESULT;

      const runtime = await storage.readPushRuntimeState();
      const binding = correlatableBinding(runtime);
      if (!binding || !isVerificationRevisionCurrent(notice.revision)) return IGNORED_RESULT;
      if (notice.priorVerifiedAuthUserId && notice.priorVerifiedAuthUserId !== binding.authUserId) {
        return IGNORED_RESULT;
      }

      return exactResult(
        await authFailure.processAuthFailure({
          authUserId: binding.authUserId,
          binding,
          kind: notice.kind,
          signal,
        })
      );
    } catch {
      return PENDING_RESULT;
    }
  }

  return Object.freeze({ processAuthFailureNotice });
}
