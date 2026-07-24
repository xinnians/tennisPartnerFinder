const PAYLOAD_FIELDS = ["court", "message", "slots_remaining", "start_at", "url"];

function text(value) {
  return typeof value === "string" ? value : "";
}

/** Keep the encrypted browser payload independent of any private DB column. */
export function safePushPayload(payload = {}) {
  const safe = {};
  for (const field of PAYLOAD_FIELDS) {
    if (field === "slots_remaining") {
      const slots = Number(payload?.[field]);
      if (Number.isInteger(slots) && slots >= 0) safe[field] = slots;
      continue;
    }
    const value = text(payload?.[field]).trim();
    if (value) safe[field] = value;
  }

  if (Object.keys(safe).length !== PAYLOAD_FIELDS.length) {
    throw new Error("INVALID_NOTIFICATION_PAYLOAD");
  }
  return safe;
}

/** web-push 要求 { endpoint, keys: { p256dh, auth } };DB 列是扁平欄位,缺這層轉換會在發送前拋錯。 */
export function toWebPushSubscription(row) {
  const endpoint = text(row?.endpoint);
  const p256dh = text(row?.p256dh);
  const auth = text(row?.auth);
  if (!endpoint || !p256dh || !auth) throw new Error("INVALID_PUSH_SUBSCRIPTION_ROW");
  return { endpoint, keys: { p256dh, auth } };
}

export function classifyPushStatus(status) {
  if (status === 404 || status === 410) return { delivered: false, removeSubscription: true, retry: false };
  if (Number.isInteger(status) && status >= 200 && status < 300) {
    return { delivered: true, removeSubscription: false, retry: false };
  }
  return { delivered: false, removeSubscription: false, retry: true };
}

export function notificationTitle(eventType) {
  return (
    {
      district_new_session: "訂閱行政區有新球局",
      guest_invited: "你收到球局邀請",
      guest_request_reviewed: "加入申請結果更新",
      host_new_request: "有新的加入申請",
    }[eventType] ?? "球局通知"
  );
}
