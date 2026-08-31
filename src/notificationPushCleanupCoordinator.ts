export const PUSH_CLEANUP_COORDINATOR_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: "PUSH_CLEANUP_COORDINATOR_INVALID_CONFIGURATION",
});

export class NotificationPushCleanupCoordinatorError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NotificationPushCleanupCoordinatorError";
    this.code = code;
  }
}

interface PendingCleanupAttemptWithToken {
  readonly cleanupToken: string;
}

interface PushCleanupStoragePort<Attempt> {
  completePendingPushCleanup: (attempt: Attempt) => PromiseLike<boolean>;
}

interface PushCleanupTransportPort {
  sendPushCleanup: (input: {
    cleanupToken: string;
    signal?: AbortSignal;
  }) => PromiseLike<{ kind: "completed" } | { kind: "pending" }>;
}

interface PushCleanupCoordinatorOptions<Attempt extends PendingCleanupAttemptWithToken> {
  storage: PushCleanupStoragePort<Attempt>;
  transport: PushCleanupTransportPort;
}

interface ProcessPendingPushCleanupInput<Attempt> {
  attempt: Attempt;
  signal?: AbortSignal;
}

export type PushCleanupCoordinatorResult = { kind: "completed" } | { kind: "pending" };

const COMPLETED_RESULT = Object.freeze({ kind: "completed" } as const);
const PENDING_RESULT = Object.freeze({ kind: "pending" } as const);

function coordinatorError(code: string): NotificationPushCleanupCoordinatorError {
  return new NotificationPushCleanupCoordinatorError(code);
}

function hasExactKind(value: unknown, kind: PushCleanupCoordinatorResult["kind"]): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Reflect.ownKeys(value).length === 1 &&
    (value as { kind?: unknown }).kind === kind
  );
}

export function createNotificationPushCleanupCoordinator<Attempt extends PendingCleanupAttemptWithToken>(
  options: PushCleanupCoordinatorOptions<Attempt>
) {
  const storage = options?.storage;
  const transport = options?.transport;
  if (
    !storage ||
    typeof storage.completePendingPushCleanup !== "function" ||
    !transport ||
    typeof transport.sendPushCleanup !== "function"
  ) {
    throw coordinatorError(PUSH_CLEANUP_COORDINATOR_ERROR_CODES.INVALID_CONFIGURATION);
  }

  async function processPendingPushCleanup(
    input: ProcessPendingPushCleanupInput<Attempt>
  ): Promise<PushCleanupCoordinatorResult> {
    try {
      const attempt = input?.attempt;
      const signal = input?.signal;
      if (!attempt || typeof attempt !== "object" || Array.isArray(attempt)) {
        return PENDING_RESULT;
      }
      const cleanupToken = attempt.cleanupToken;
      if (typeof cleanupToken !== "string") return PENDING_RESULT;
      const transportResult = await transport.sendPushCleanup({ cleanupToken, signal });
      if (!hasExactKind(transportResult, "completed")) return PENDING_RESULT;

      const localCompletion = await storage.completePendingPushCleanup(attempt);
      return typeof localCompletion === "boolean" ? COMPLETED_RESULT : PENDING_RESULT;
    } catch {
      return PENDING_RESULT;
    }
  }

  return Object.freeze({ processPendingPushCleanup });
}
