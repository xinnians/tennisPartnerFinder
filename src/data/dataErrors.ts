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

const ACTION_MESSAGES: Record<string, string> = {
  PROFILE_INCOMPLETE: "請先完成個人檔案。",
  SESSION_NOT_FOUND: "找不到這個球局。",
  SESSION_NOT_OPEN: "這個球局目前無法操作。",
  SESSION_FULL: "這個球局已額滿。",
  SESSION_CANCELLED: "這個球局已取消。",
  SESSION_EXPIRED: "球局狀態已更新，請重新載入。",
  SESSION_ARCHIVED: "這個球局已封存，無法再傳送訊息。",
  SESSION_STARTED: "球局已超過可加入時間。",
  SESSION_LIMIT: "你同時開放中的球局已達上限，請先處理現有球局。",
  ALREADY_REQUESTED: "你已申請加入這個球局。",
  ALREADY_DECIDED: "你先前已退出或未通過這一局，無法再次申請。",
  NOT_SESSION_HOST: "只有主揪可以執行這個操作。",
  NOT_ACCEPTED_PARTICIPANT: "只有已接受的參與者可以執行這個操作。",
  NOT_SESSION_MEMBER: "只有這個球局的成員可以傳送訊息。",
  INVALID_TRANSITION: "目前的球局狀態不允許這個操作。",
  INVALID_VENUE_INPUT: "場地或候選球場資料不符合規則。",
  INVALID_DECISION: "候選球場或定案時間不符合規則。",
  INVITEE_NOT_AVAILABLE: "這位球友目前未開放邀請。",
  ALREADY_INVITED: "你已邀請過這位球友。",
  NOT_INVITED: "找不到你的邀請，球局狀態可能已更新。",
  INVITE_LIMIT: "24 小時內邀請次數已達上限。",
  BLOCKED: "此操作因封鎖關係無法完成。",
  SESSION_UNAVAILABLE: "這個球局目前無法加入。",
  GUEST_UNAVAILABLE: "這位球友目前無法加入這個球局。",
  MESSAGE_NOT_VISIBLE: "這則訊息目前無法檢舉。",
  INVALID_MESSAGE: "訊息不可為空白或超過 1000 字。",
  UNKNOWN_ACTION_ERROR: "球局操作失敗，請重新載入後再試。",
};

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
    super(ACTION_MESSAGES[code] ?? ACTION_MESSAGES.UNKNOWN_ACTION_ERROR, { cause, code, name: "SessionActionError" });
  }
}

export class DataApiUnavailableError extends DataApiError {
  constructor(message = "此操作需要已設定的 Supabase 環境。") {
    super(message, { name: "DataApiUnavailableError" });
  }
}

function errorShape(error: unknown): ErrorShape | null {
  return typeof error === "object" && error !== null ? (error as ErrorShape) : null;
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
