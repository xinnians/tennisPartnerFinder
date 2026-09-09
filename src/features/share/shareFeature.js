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
  }
}

export async function copySessionShareLink(sessionId, session) {
  const link = sessionShareLink(sessionId);
  const text = session ? sessionShareSummary(session, link) : link;
  try {
    if (globalThis.navigator?.clipboard?.writeText) await globalThis.navigator.clipboard.writeText(text);
    else if (!fallbackCopyText(text)) throw new Error("copy unavailable");
  } catch {
    if (!fallbackCopyText(text)) throw new Error("目前無法複製連結，請手動複製網址。");
  }
  toast(session ? "球局摘要已複製。" : "球局連結已複製。");
}
