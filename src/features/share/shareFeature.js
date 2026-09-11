import { sessionShareSummary } from "./sessionShareSummary.ts";

let toast;

/** Configure the entry-owned toast without coupling clipboard helpers to bootstrap state. */
export function configureShareFeature(dependencies) {
  ({ toast } = dependencies);
}

function sessionShareLink(sessionId) {
  const normalizedSessionId = Number(sessionId);
  if (!Number.isSafeInteger(normalizedSessionId) || normalizedSessionId <= 0) {
    throw new Error("目前無法產生這個球局的連結。");
  }
  return `${globalThis.location.origin}/s/${normalizedSessionId}`;
}

function fallbackCopyText(value) {
  const active = document.activeElement;
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  try {
    field.select();
    return document.execCommand?.("copy") === true;
  } finally {
    field.remove();
    if (active instanceof HTMLElement && active.isConnected) active.focus({ preventScroll: true });
  }
}

export async function copySessionShareLink(sessionId, session, { current = () => true } = {}) {
  const link = sessionShareLink(sessionId);
  const text = session ? sessionShareSummary(session, link) : link;
  try {
    if (globalThis.navigator?.clipboard?.writeText) await globalThis.navigator.clipboard.writeText(text);
    else if (!fallbackCopyText(text)) throw new Error("copy unavailable");
  } catch {
    if (!fallbackCopyText(text)) throw new Error("目前無法複製連結，請手動複製網址。");
  }
  if (current()) toast(session ? "球局摘要已複製。" : "球局連結已複製。");
}

/** 必須直接由點擊呼叫，保留系統分享所需的使用者操作權限。 */
export async function shareSession(sessionId, session, options) {
  const data = {
    title: "球咖｜球局資訊",
    text: sessionShareSummary(session),
    url: sessionShareLink(sessionId),
  };
  const navigator = globalThis.navigator;
  if (typeof navigator?.share !== "function" || (navigator.canShare && !navigator.canShare(data))) {
    return copySessionShareLink(sessionId, session, options);
  }
  try {
    await navigator.share(data);
  } catch (error) {
    if (error?.name === "AbortError") return;
    throw new Error("目前無法開啟分享，請稍後再試，或在「查看球局」複製球局摘要。", { cause: error });
  }
}
