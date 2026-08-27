export const SESSION_ACTION_CODES = Object.freeze([
  "PROFILE_INCOMPLETE",
  "SESSION_NOT_FOUND",
  "SESSION_NOT_OPEN",
  "SESSION_FULL",
  "SESSION_CANCELLED",
  "SESSION_EXPIRED",
  "SESSION_ARCHIVED",
  "SESSION_STARTED",
  "SESSION_LIMIT",
  "ALREADY_REQUESTED",
  "ALREADY_DECIDED",
  "NOT_SESSION_HOST",
  "NOT_ACCEPTED_PARTICIPANT",
  "NOT_SESSION_MEMBER",
  "INVALID_TRANSITION",
  "INVALID_VENUE_INPUT",
  "INVALID_DECISION",
  "INVITEE_NOT_AVAILABLE",
  "ALREADY_INVITED",
  "NOT_INVITED",
  "INVITE_LIMIT",
  "BLOCKED",
  // 刻意不揭露封鎖，不要改成「你已被封鎖」。
  "SESSION_UNAVAILABLE",
  "GUEST_UNAVAILABLE",
  "MESSAGE_NOT_VISIBLE",
  "INVALID_MESSAGE",
]);

interface DataApiErrorOptions {
  cause?: unknown;
  code?: unknown;
  name?: string;
}

interface ErrorShape {
  code?: unknown;
  message?: unknown;
  name?: unknown;
}

export class DataApiError extends Error {
  code: unknown;
  override cause: unknown;

  constructor(message = "", { cause = null, code = undefined, name = "DataApiError" }: DataApiErrorOptions = {}) {
    super(message);
    this.name = name;
    this.code = code;
    this.cause = cause;
  }
}

export class SessionActionError extends DataApiError {
  constructor(code: string, cause: unknown = null) {
    super("", { cause, code, name: "SessionActionError" });
  }
}

export class DataApiUnavailableError extends DataApiError {
  constructor(message = "此操作需要已設定的 Supabase 環境。") {
    super(message, { name: "DataApiUnavailableError" });
  }
}

function errorShape(error: unknown): ErrorShape | null {
  return typeof error === "object" && error !== null ? error : null;
}

function codeFromSupabaseError(error: unknown): string {
  const shape = errorShape(error);
  if (shape?.code !== "P0001" || typeof shape.message !== "string") {
    return "UNKNOWN_ACTION_ERROR";
  }
  return SESSION_ACTION_CODES.includes(shape.message) ? shape.message : "UNKNOWN_ACTION_ERROR";
}

export function asSessionActionError(error: unknown): SessionActionError {
  return error instanceof SessionActionError ? error : new SessionActionError(codeFromSupabaseError(error), error);
}

export function asDataApiError(error: unknown): DataApiError {
  if (error instanceof DataApiError) return error;
  const shape = errorShape(error);
  return new DataApiError(typeof shape?.message === "string" ? shape.message : "", {
    cause: error,
    code: shape?.code,
    name: typeof shape?.name === "string" ? shape.name : "DataApiError",
  });
}
