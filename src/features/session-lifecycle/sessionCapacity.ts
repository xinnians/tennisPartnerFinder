// 與既有 PostgreSQL integer RPC 的可表示範圍一致；不另設產品人數上限。
export const MAX_SESSION_CAPACITY = 2_147_483_647;

export function sessionCapacityError(value: unknown): string | null {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  if (!/^[0-9]+$/.test(text) || Number(text) < 1) return "請填寫至少 1 位的整數。";
  if (!Number.isSafeInteger(Number(text)) || Number(text) > MAX_SESSION_CAPACITY)
    return "人數過大，請輸入不超過 2,147,483,647 位。";
  return null;
}
