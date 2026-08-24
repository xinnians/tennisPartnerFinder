export const SESSION_ACTION_MESSAGES = Object.freeze({
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
  // 刻意不揭露封鎖，不要改成「你已被封鎖」。
  SESSION_UNAVAILABLE: "這個球局目前無法加入。",
  GUEST_UNAVAILABLE: "這位球友目前無法加入這個球局。",
  MESSAGE_NOT_VISIBLE: "這則訊息目前無法檢舉。",
  INVALID_MESSAGE: "訊息不可為空白或超過 1000 字。",
  UNKNOWN_ACTION_ERROR: "球局操作失敗，請重新載入後再試。",
});

interface ErrorShape {
  code?: unknown;
  message?: unknown;
  name?: unknown;
}

export function sessionActionMessage(error: unknown, fallback: string): string {
  const shape = typeof error === "object" && error !== null ? (error as ErrorShape) : null;
  const code = typeof shape?.code === "string" ? shape.code : "";
  if (Object.hasOwn(SESSION_ACTION_MESSAGES, code)) {
    return SESSION_ACTION_MESSAGES[code as keyof typeof SESSION_ACTION_MESSAGES];
  }
  if (shape?.name === "SessionActionError") return SESSION_ACTION_MESSAGES.UNKNOWN_ACTION_ERROR;
  return (typeof shape?.message === "string" && shape.message) || fallback;
}
