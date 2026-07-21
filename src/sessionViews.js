import { TAIPEI_TIME_ZONE } from "./config.js";
import { pushDrawerIsolation } from "./modalIsolation.js";
import { mountDialog, mountSheet } from "./sheets.js";
import { esc } from "./util.js";

const dialogFocusable =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const drawerBindings = new WeakMap();
const drawerIsolations = new WeakMap();
const drawerFocusIntents = new WeakMap();
const drawerLoadingFocusFallbacks = new WeakSet();
const mySessionActionStates = new WeakMap();
const MY_SESSION_LIFECYCLE_ACTIONS = new Set(["accept", "attendance", "cancel", "decline", "played", "refresh", "refresh-contacts", "withdraw"]);
const DRAWER_TOGGLE_FOCUS = "__drawer-toggle__";
const DRAWER_CLOSE_FOCUS = "__drawer-close__";
const DRAWER_ACTION_FOCUS_PREFIX = "__drawer-action__:";
const DRAWER_ACTION_IDS = new Set(["discovery-reset", "discovery-retry", "drawer-map-retry", "discovery-expand", "discovery-first"]);

export const PROFILE_PUBLIC_DISCLOSURE =
  "開球局後，這個暱稱與你的 NTRP 會顯示給瀏覽該球局的人；LINE ID 只會在同一球局的主揪與已接受球友之間互相顯示。";

const CREATE_PLAY_TYPES = new Set(["單打", "雙打", "對拉", "練球"]);
const TAIPEI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Convert a datetime-local value by the product's fixed Taipei wall time. */
export function taipeiLocalDateTimeToIso(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0"] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const localUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const local = new Date(localUtcMs);
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute ||
    local.getUTCSeconds() !== second
  ) {
    return null;
  }
  return new Date(localUtcMs - TAIPEI_UTC_OFFSET_MS).toISOString();
}

function ntrpEndpoint(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 7 && Number.isInteger(number * 2) ? number : null;
}

/** Validate the form before it crosses the data API boundary. */
export function validateCreateSessionInput(input = {}, { now = new Date() } = {}) {
  const errors = {};
  const courtId = Number(input.courtId);
  const joinMode = String(input.joinMode ?? "approval");
  const playType = String(input.playType ?? "");
  const slotsTotal = Number(input.slotsTotal);
  const notes = String(input.notes ?? "");
  const startAt = taipeiLocalDateTimeToIso(input.startAtLocal);
  const minText = String(input.ntrpMin ?? "").trim();
  const maxText = String(input.ntrpMax ?? "").trim();
  const hasRange = Boolean(minText || maxText);
  const ntrpMin = minText ? ntrpEndpoint(minText) : null;
  const ntrpMax = maxText ? ntrpEndpoint(maxText) : null;

  if (!Number.isSafeInteger(courtId) || courtId <= 0) errors.courtId = "請選擇台北市球場。";
  if (!["approval", "instant"].includes(joinMode)) errors.joinMode = "請選擇加入方式。";
  if (!CREATE_PLAY_TYPES.has(playType)) errors.playType = "請選擇一種打法。";
  if (!Number.isInteger(slotsTotal) || slotsTotal < 1 || slotsTotal > 3) errors.slotsTotal = "缺額請填 1 到 3 位。";
  if (!startAt || new Date(startAt).getTime() <= new Date(now).getTime()) errors.startAtLocal = "開始時間必須是未來的台北時間。";
  if (notes.length > 500) errors.notes = "備註最多 500 字。";
  if (hasRange && (!ntrpMin || !ntrpMax)) {
    if (!ntrpMin) errors.ntrpMin = "NTRP 請填 1.0 到 7.0，並以 0.5 為間距。";
    if (!ntrpMax) errors.ntrpMax = "NTRP 請填 1.0 到 7.0，並以 0.5 為間距。";
  }
  if (ntrpMin != null && ntrpMax != null && ntrpMin > ntrpMax) {
    errors.ntrpMax = "最高程度不可小於最低程度。";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
    value: {
      courtId,
      joinMode,
      ntrpMax: hasRange ? ntrpMax : null,
      ntrpMin: hasRange ? ntrpMin : null,
      notes: notes.trim() || null,
      playType,
      slotsTotal,
      startAt,
    },
  };
}

function rememberFocusedSessionCard(root) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return;
  if (active.matches("#nearby-sessions-toggle")) {
    setDrawerFocusIntent(root, DRAWER_TOGGLE_FOCUS);
    return;
  }
  if (active.matches("[data-nearby-close]")) {
    // The loading fallback is only a temporary reachable target. Preserve the
    // original card/action intent through the next authoritative rerender.
    if (!drawerLoadingFocusFallbacks.has(root)) setDrawerFocusIntent(root, DRAWER_CLOSE_FOCUS);
    return;
  }
  if (DRAWER_ACTION_IDS.has(active.id)) {
    setDrawerFocusIntent(root, `${DRAWER_ACTION_FOCUS_PREFIX}${active.id}`);
    return;
  }
  const card = active.closest("[data-session-id]");
  if (card?.dataset.sessionId) setDrawerFocusIntent(root, card.dataset.sessionId);
}

function setDrawerFocusIntent(root, intent) {
  drawerLoadingFocusFallbacks.delete(root);
  drawerFocusIntents.set(root, intent);
}

function clearDrawerFocusIntent(root) {
  drawerLoadingFocusFallbacks.delete(root);
  drawerFocusIntents.delete(root);
}

function drawerRecoveryTarget(root) {
  const panel = root.querySelector("[data-nearby-dialog]");
  if (!panel) return null;
  return (
    panel.querySelector("#discovery-retry") ??
    panel.querySelector("#drawer-map-retry") ??
    panel.querySelector("[data-session-id]") ??
    panel.querySelector("#discovery-reset") ??
    panel.querySelector("#discovery-expand") ??
    panel.querySelector("#discovery-first")
  );
}

function focusDrawerLoadingFallback(root) {
  const close = root.querySelector("[data-nearby-dialog] [data-nearby-close]");
  if (!close) return;
  drawerLoadingFocusFallbacks.add(root);
  close.focus({ preventScroll: true });
}

function restoreFocusedSessionCard(root) {
  if (!drawerFocusIntents.get(root)) return;
  requestAnimationFrame(() => {
    const focusIntent = drawerFocusIntents.get(root);
    if (!focusIntent) return;
    const active = document.activeElement;
    const hasNewSurface = Boolean(document.querySelector("#sheet-root .surface, #modal-root .surface"));
    if (hasNewSurface || (active?.isConnected && active !== document.body && active !== document.documentElement)) return;
    const toggle = root.querySelector("#nearby-sessions-toggle");
    if (focusIntent === DRAWER_TOGGLE_FOCUS) {
      if (toggle?.getAttribute("aria-expanded") === "false") {
        clearDrawerFocusIntent(root);
        toggle.focus({ preventScroll: true });
      } else if (toggle?.getAttribute("aria-expanded") === "true") {
        // Opening the drawer has its own deliberate first target: its close
        // control. Do not let a replaced opener compete with that hand-off.
        clearDrawerFocusIntent(root);
      }
      return;
    }
    const panel = root.querySelector("[data-nearby-dialog]");
    if (!panel) {
      clearDrawerFocusIntent(root);
      return;
    }
    if (focusIntent === DRAWER_CLOSE_FOCUS) {
      clearDrawerFocusIntent(root);
      panel.querySelector("[data-nearby-close]")?.focus({ preventScroll: true });
      return;
    }
    const actionId = focusIntent.startsWith(DRAWER_ACTION_FOCUS_PREFIX)
      ? focusIntent.slice(DRAWER_ACTION_FOCUS_PREFIX.length)
      : null;
    if (actionId) {
      const sameAction = DRAWER_ACTION_IDS.has(actionId) ? panel.querySelector(`#${actionId}`) : null;
      const nextAction = sameAction ?? drawerRecoveryTarget(root);
      if (!nextAction) {
        // Loading deliberately contains no stale card or recovery CTA. Keep
        // the intent for the authoritative result, but never leave keyboard
        // focus on document.body during that wait.
        focusDrawerLoadingFallback(root);
        return;
      }
      clearDrawerFocusIntent(root);
      nextAction.focus({ preventScroll: true });
      return;
    }
    const card = [...root.querySelectorAll("[data-session-id]")].find(
      (node) => String(node.dataset.sessionId) === String(focusIntent)
    );
    if (!card) {
      // During the loading render there is deliberately no stale card and no
      // retry action yet. Keep the intent through that transient state, then
      // hand focus to the first meaningful action in the final drawer state.
      const fallback = drawerRecoveryTarget(root);
      if (!fallback) {
        focusDrawerLoadingFallback(root);
        return;
      }
      clearDrawerFocusIntent(root);
      fallback.focus({ preventScroll: true });
      return;
    }
    clearDrawerFocusIntent(root);
    card.focus({ preventScroll: true });
  });
}

function taipeiDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "時間待確認";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TAIPEI_TIME_ZONE,
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function ntrpRange(session) {
  const min = Number(session.ntrpMin);
  const max = Number(session.ntrpMax);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "NTRP 不限";
  if (min === max) return `NTRP ${min.toFixed(1)}`;
  return `NTRP ${min.toFixed(1)}–${max.toFixed(1)}`;
}

function vacancyLabel(session) {
  const remaining = Number(session.slotsRemaining);
  if (!Number.isFinite(remaining) || remaining <= 0) return "已額滿";
  return `剩 ${remaining} 位`;
}

function completionLabel(session) {
  return session.hostProfileComplete ? "檔案已完成" : "檔案待完成";
}

function sessionCard(session, { compact = false } = {}) {
  return `<button type="button" class="session-card${compact ? " session-card--compact" : ""}" data-testid="session-card" data-session-id="${esc(
    session.sessionId
  )}">
    <span class="session-card__time">${esc(taipeiDateTime(session.startAt))}</span>
    <span class="session-card__court">${esc(session.court)} · ${esc(session.courtDistrict)}</span>
    <span class="session-card__meta">${esc(session.playType)} · ${esc(ntrpRange(session))} · ${esc(vacancyLabel(session))}</span>
    <span class="session-card__host">主揪 ${esc(session.hostNickname)} · NTRP ${esc(Number(session.hostNtrp).toFixed(1))}</span>
  </button>`;
}

function mySessionReason(session) {
  const status = String(session?.status ?? "").toLowerCase();
  const participantStatus = String(session?.viewerParticipantStatus ?? "").toLowerCase();
  if (participantStatus === "declined") return "主揪婉拒了你的申請";
  if (participantStatus === "withdrawn") return "你已退出這一局";
  if (status === "played") return "本局已回報打成";
  if (status === "cancelled") return "主揪已取消這一局";
  if (status === "expired") return "這一局已逾期結束";
  return "這一局已無可進行的動作";
}

function mySessionRole(session) {
  if (String(session?.viewerRole) === "host") return "我是主揪";
  const participantStatus = String(session?.viewerParticipantStatus ?? "").toLowerCase();
  if (participantStatus === "requested") return "申請中";
  if (participantStatus === "declined") return "未核准";
  if (participantStatus === "withdrawn") return "已退出";
  return participantStatus === "accepted" ? "已核准加入" : "參與者";
}

function mySessionStatus(session) {
  const status = String(session?.status ?? "").toLowerCase();
  const startTime = new Date(session?.startAt ?? "").getTime();
  if (["open", "full"].includes(status) && Number.isFinite(startTime) && startTime <= Date.now()) return "進行中";
  return (
    {
      cancelled: "已取消",
      expired: "已結束",
      full: "已額滿",
      open: "開放報名",
      played: "已打成",
      started: "已開始",
    }[status] ?? "狀態待確認"
  );
}

function mySessionActionButton(session, { action, label, testId }) {
  return `<button type="button" class="session-secondary" data-my-action="${esc(action)}" data-session-id="${esc(
    session.sessionId
  )}"${testId ? ` data-testid="${esc(testId)}"` : ""}>${esc(label)}</button>`;
}

function contactRows(session, contacts) {
  const safeContacts = Array.isArray(contacts) ? contacts : [];
  if (!safeContacts.length) return "";
  return `<section class="my-session-contacts" aria-label="已核准的聯絡方式">
    <h3>已核准的聯絡方式</h3>
    ${safeContacts
      .map(
        (contact) =>
          `<div id="session-contact-${esc(session.sessionId)}-${esc(contact.counterpartProfileId)}" class="session-contact" data-contact-profile-id="${esc(
            contact.counterpartProfileId
          )}" data-testid="session-contact-${esc(contact.counterpartProfileId)}">
            <strong>${esc(contact.nickname)}</strong>
            <label>LINE ID<input readonly value="${esc(contact.lineId)}" aria-label="${esc(contact.nickname)} 的 LINE ID" /></label>
            <div class="session-contact__copy-actions">
              <button type="button" class="session-secondary" data-copy-contact data-copy-kind="line">複製 LINE ID</button>
              <button type="button" class="session-secondary" data-copy-contact data-copy-kind="opening">複製開場訊息</button>
            </div>
            <p data-contact-opening>你好，我是球局「${esc(session.court)}」的${esc(mySessionRole(session))}。</p>
            <p data-contact-copy-status role="status" aria-live="polite"></p>
          </div>`
      )
      .join("")}
  </section>`;
}

async function copyContactText(text) {
  if (!text) throw new Error("沒有可複製的內容。");
  if (globalThis.navigator?.clipboard?.writeText) {
    try {
      await globalThis.navigator.clipboard.writeText(text);
      return;
    } catch {
      // Permission is often denied outside a direct user gesture. Fall back
      // to the selectable, readonly input path before asking for manual copy.
    }
  }
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.append(helper);
  helper.select();
  const copied = document.execCommand?.("copy");
  helper.remove();
  if (!copied) throw new Error("此瀏覽器無法複製，請手動選取文字。");
}

function wireContactCopy(root) {
  root.querySelectorAll("[data-copy-contact]").forEach((button) => {
    button.addEventListener("click", async () => {
      const contact = button.closest(".session-contact");
      const status = contact?.querySelector("[data-contact-copy-status]");
      const value =
        button.dataset.copyKind === "opening"
          ? contact?.querySelector("[data-contact-opening]")?.textContent?.trim()
          : contact?.querySelector("input")?.value;
      button.disabled = true;
      if (status) status.textContent = "";
      try {
        await copyContactText(value);
        if (status) status.textContent = "已複製。";
      } catch (copyError) {
        if (status) status.textContent = copyError?.message || "複製失敗，請手動選取文字。";
      } finally {
        if (root.contains(button)) button.disabled = false;
      }
    });
  });
}

function mySessionCard(session, { createdSessionId = null, contacts = [] } = {}) {
  const actions = [
    `<button type="button" class="session-secondary" data-open-my-session data-session-id="${esc(session.sessionId)}">查看球局</button>`,
    session.canCancel ? mySessionActionButton(session, { action: "cancel", label: "取消球局" }) : "",
    session.canWithdraw ? mySessionActionButton(session, { action: "withdraw", label: "退出球局" }) : "",
    session.canConfirmPlayed ? mySessionActionButton(session, { action: "played", label: "回報打成" }) : "",
    session.canConfirmAttendance && !session.viewerPlayedConfirmed
      ? mySessionActionButton(session, { action: "attendance", label: "確認到場" })
      : "",
    `<button type="button" class="session-tertiary" data-my-action="report-session" data-session-id="${esc(
      session.sessionId
    )}" data-testid="report-session-${esc(session.sessionId)}">檢舉此球局</button>`,
  ]
    .filter(Boolean)
    .join("");
  return `<article class="my-session-card"${String(session.sessionId) === String(createdSessionId) ? ' data-created-session="true"' : ""}>
    <div class="my-session-card__head"><span class="my-session-card__role">${esc(mySessionRole(session))}</span><span class="my-session-card__status">${esc(
      mySessionStatus(session)
    )}</span></div>
    <p class="my-session-card__time">${esc(taipeiDateTime(session.startAt))}</p>
    <h3>${esc(session.court)} · ${esc(session.courtDistrict)}</h3>
    <p>${esc(session.playType)} · ${esc(ntrpRange(session))} · ${esc(vacancyLabel(session))}</p>
    <div class="my-session-card__actions">${actions}</div>
    ${contactRows(session, contacts)}
  </article>`;
}

function hostRequestCard({ participant, session }) {
  return `<article class="my-action-card" data-testid="participant-row" data-participant-id="${esc(participant.participantId)}">
    <p class="my-action-card__eyebrow">需要你處理 · ${esc(session.court)} · ${esc(taipeiDateTime(session.startAt))}</p>
    <h3>${esc(participant.nickname)} · NTRP ${esc(Number(participant.ntrp).toFixed(1))}</h3>
    <p>${esc((participant.playTypes ?? []).join("、") || "尚未填寫打法")} · ${esc((participant.homeCourts ?? []).join("、") || "尚未填寫常打球場")}</p>
    <div class="my-session-card__actions">
      <button type="button" class="session-primary" data-my-action="accept" data-session-id="${esc(session.sessionId)}" data-participant-id="${esc(
        participant.participantId
      )}" data-testid="accept-participant-${esc(participant.participantId)}">接受</button>
      <button type="button" class="session-secondary" data-my-action="decline" data-session-id="${esc(session.sessionId)}" data-participant-id="${esc(
        participant.participantId
      )}" data-testid="decline-participant-${esc(participant.participantId)}">婉拒</button>
      <button type="button" class="session-tertiary" data-my-action="report-participant" data-session-id="${esc(session.sessionId)}" data-profile-id="${esc(
        participant.profileId
      )}" data-testid="report-participant-${esc(participant.profileId)}">檢舉這位申請者</button>
    </div>
  </article>`;
}

function guestRequestCard({ session }) {
  return `<article class="my-action-card" data-guest-request-session="${esc(session.sessionId)}">
    <p class="my-action-card__eyebrow">等待主揪回覆</p>
    <h3>${esc(session.court)} · ${esc(taipeiDateTime(session.startAt))}</h3>
    <p>你的申請已送出，主揪回覆前可自行撤回。</p>
    <div class="my-session-card__actions">${mySessionActionButton(session, { action: "withdraw", label: "撤回申請" })}</div>
  </article>`;
}

function actionDescriptor(button) {
  return {
    action:
      button.dataset.myAction ??
      (button.hasAttribute("data-retry-contacts") ? "refresh-contacts" : button.id === "my-sessions-refresh" ? "refresh" : ""),
    participantId: button.dataset.participantId ?? "",
    profileId: button.dataset.profileId ?? "",
    sessionId: button.dataset.sessionId ?? "",
  };
}

function actionDescriptorKey(descriptor) {
  return JSON.stringify([descriptor.action, descriptor.sessionId, descriptor.participantId, descriptor.profileId]);
}

function pendingMySessionActionState(root) {
  let state = mySessionActionStates.get(root);
  if (!state) {
    state = { pending: new Map(), scopeKey: null };
    mySessionActionStates.set(root, state);
  }
  return state;
}

function pendingMySessionActions(root) {
  return pendingMySessionActionState(root).pending;
}

function setMySessionActionScope(root, scopeKey) {
  const state = pendingMySessionActionState(root);
  if (state.scopeKey === scopeKey) return;
  // A render for another account/profile epoch must not inherit a stale
  // promise's disabled button or error surface from the previous account.
  mySessionActionStates.set(root, { pending: new Map(), scopeKey });
}

function sameActionDescriptor(left, right) {
  return (
    left?.action === right?.action &&
    left?.sessionId === right?.sessionId &&
    left?.participantId === right?.participantId &&
    left?.profileId === right?.profileId
  );
}

function currentMySessionActionButton(root, descriptor) {
  if (descriptor.action === "refresh") return root.querySelector("#my-sessions-refresh");
  if (descriptor.action === "refresh-contacts") return root.querySelector("[data-retry-contacts]");
  return [...root.querySelectorAll("[data-my-action]")].find((button) => sameActionDescriptor(actionDescriptor(button), descriptor));
}

function syncPendingMySessionActions(root) {
  for (const descriptor of pendingMySessionActions(root).values()) {
    const button = currentMySessionActionButton(root, descriptor);
    if (button) button.disabled = true;
  }
}

function showMySessionActionError(root, message) {
  const error = root.querySelector("[data-my-sessions-error]");
  if (!error) return;
  error.textContent = message;
  error.hidden = false;
}

function focusMySessionActionResult(root, descriptor, { failed = false } = {}) {
  const currentButton = currentMySessionActionButton(root, descriptor);
  if (currentButton && !currentButton.disabled) {
    currentButton.focus({ preventScroll: true });
    return;
  }
  if (failed) {
    const error = root.querySelector("[data-my-sessions-error]");
    if (error && !error.hidden) {
      error.focus({ preventScroll: true });
      return;
    }
  }
  const nextAction = root.querySelector("#my-needs-action [data-my-action]:not([disabled])");
  if (nextAction) {
    nextAction.focus({ preventScroll: true });
    return;
  }
  const sessionCard = [...root.querySelectorAll("[data-open-my-session]")].find(
    (button) => String(button.dataset.sessionId) === String(descriptor.sessionId)
  );
  if (sessionCard) {
    sessionCard.focus({ preventScroll: true });
    return;
  }
  root.querySelector("#my-sessions-refresh")?.focus({ preventScroll: true });
}

function runMySessionAction(button, callback, root) {
  if (!callback || button.disabled) return;
  const descriptor = actionDescriptor(button);
  const descriptorKey = actionDescriptorKey(descriptor);
  const pending = pendingMySessionActions(root);
  pending.set(descriptorKey, descriptor);
  button.disabled = true;
  root.querySelector("[data-my-sessions-error]")?.setAttribute("hidden", "");
  let restoreActionFocus = false;
  Promise.resolve()
    .then(callback)
    .catch((actionError) => {
      if (pendingMySessionActions(root) !== pending) return;
      showMySessionActionError(root, actionError?.message || "操作暫時無法完成，請稍後再試。");
      // reloadParticipation can replace the original button before an error
      // arrives. Resolve the semantic action again in the current DOM so the
      // keyboard user stays in the same operational context.
      restoreActionFocus = true;
    })
    .finally(() => {
      if (pendingMySessionActions(root) !== pending) return;
      pending.delete(descriptorKey);
      const currentButton = currentMySessionActionButton(root, descriptor);
      if (currentButton) currentButton.disabled = false;
      if (MY_SESSION_LIFECYCLE_ACTIONS.has(descriptor.action)) {
        focusMySessionActionResult(root, descriptor, { failed: restoreActionFocus });
      }
    });
}

/** Render the private, action-first My Sessions destination. */
export function renderMySessionsPage(
  root,
  {
    contactsForSession = () => [],
    contactsError = "",
    createdSessionId = null,
    groups = { history: [], needsAction: [], pendingHostRequestCount: 0, upcoming: [] },
    onAccept = () => {},
    onBack = () => {},
    onCancel = () => {},
    onConfirmAttendance = () => {},
    onCreatedSessionFocus = () => true,
    onDecline = () => {},
    onMarkPlayed = () => {},
    onOpenSession = () => {},
    onRefresh = () => {},
    onReportParticipant = () => {},
    onReportSession = () => {},
    onSignIn = () => {},
    onSignOut = () => {},
    onWithdraw = () => {},
    authenticated = false,
    actionScopeKey = null,
    status = "idle",
    errorMessage = "",
  } = {}
) {
  const needsAction = Array.isArray(groups.needsAction) ? groups.needsAction : [];
  const upcoming = Array.isArray(groups.upcoming) ? groups.upcoming : [];
  const history = Array.isArray(groups.history) ? groups.history : [];
  setMySessionActionScope(root, actionScopeKey);
  root.innerHTML = `
    <div class="my-sessions-shell__head">
      <div><p class="surface__eyebrow">我的球局</p><h1 tabindex="-1" data-my-sessions-heading>下一步行動</h1></div>
      <div class="my-sessions-shell__tools"><button type="button" id="my-sessions-refresh" class="session-secondary">重新整理</button><button type="button" class="session-secondary" data-my-sessions-back>回到地圖</button>${
        authenticated
          ? '<button type="button" class="session-secondary" data-my-sessions-sign-out>登出</button>'
          : ""
      }</div>
    </div>
    <p class="surface__copy">${
      createdSessionId ? "球局已建立；主揪身分已加入這一局。" : "依目前需要處理的事項與球局時間排序。"
    }</p>
    <p class="my-sessions-message" data-my-sessions-status role="status" aria-live="polite"${status === "loading" ? "" : " hidden"}>正在更新我的球局…</p>
    <p class="form-error" data-my-sessions-error role="alert" tabindex="-1"${errorMessage ? "" : " hidden"}>${esc(errorMessage)}</p>
    ${
      authenticated
        ? ""
        : '<section class="my-sessions-empty" aria-label="登入後查看我的球局"><h2>登入後查看與管理你的球局</h2><p class="surface__copy">你可以在這裡處理申請、查看已核准球友的聯絡方式，以及保留過去紀錄。</p><button type="button" class="session-primary" data-my-sessions-sign-in>登入</button></section>'
    }
    <section class="my-sessions-section" aria-labelledby="my-needs-action-title">
      <div class="my-sessions-section__head"><h2 id="my-needs-action-title">需要你處理</h2><span>${esc(needsAction.length)} 項</span></div>
      <div id="my-needs-action" class="my-sessions-list">${
        needsAction.length
          ? needsAction.map((entry) => (entry.kind === "host-request" ? hostRequestCard(entry) : guestRequestCard(entry))).join("")
          : '<p class="surface__copy">目前沒有需要立即處理的事項。</p>'
      }</div>
    </section>
    <section class="my-sessions-section" aria-labelledby="my-upcoming-sessions-title">
      <div class="my-sessions-section__head"><h2 id="my-upcoming-sessions-title">即將打球</h2><span>${esc(upcoming.length)} 場</span></div>
      <div id="my-upcoming-sessions" class="my-sessions-list">${
        upcoming.length
          ? upcoming
              .map((session) => mySessionCard(session, { contacts: contactsForSession(session.sessionId), createdSessionId }))
              .join("")
          : '<p class="surface__copy">目前沒有即將打球的球局。</p>'
      }</div>
      ${
        contactsError
          ? `<div class="form-error my-session-contacts-error" role="alert">${esc(
              contactsError
            )}<button type="button" class="session-secondary" data-retry-contacts>重新整理</button></div>`
          : ""
      }
    </section>
    <section class="my-sessions-section" aria-labelledby="my-history-title">
      <div class="my-sessions-section__head"><h2 id="my-history-title">過去紀錄</h2><span>${esc(history.length)} 場</span></div>
      <div id="my-history" class="my-sessions-list">${
        history.length
          ? history
              .map(
                (session) =>
                  `${mySessionCard(session, {
                    contacts: contactsForSession(session.sessionId),
                    createdSessionId,
                  })}<p class="my-history-reason">${esc(mySessionReason(session))}</p>`
              )
              .join("")
          : '<p class="surface__copy">尚無過去紀錄。</p>'
      }</div>
    </section>`;

  root.querySelector("[data-my-sessions-back]")?.addEventListener("click", onBack);
  root.querySelector("[data-my-sessions-sign-in]")?.addEventListener("click", onSignIn);
  root.querySelector("[data-my-sessions-sign-out]")?.addEventListener("click", onSignOut);
  root.querySelector("#my-sessions-refresh")?.addEventListener("click", () => runMySessionAction(root.querySelector("#my-sessions-refresh"), onRefresh, root));
  root.querySelector("[data-retry-contacts]")?.addEventListener("click", () =>
    runMySessionAction(root.querySelector("[data-retry-contacts]"), onRefresh, root)
  );
  root.querySelectorAll("[data-open-my-session]").forEach((button) => {
    button.addEventListener("click", () => onOpenSession(button.dataset.sessionId));
  });
  root.querySelectorAll("[data-my-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const sessionId = button.dataset.sessionId;
      const participantId = button.dataset.participantId;
      const profileId = button.dataset.profileId;
      const callbacks = {
        accept: () => onAccept(sessionId, participantId),
        attendance: () => onConfirmAttendance(sessionId),
        cancel: () => onCancel(sessionId),
        decline: () => onDecline(sessionId, participantId),
        played: () => onMarkPlayed(sessionId),
        "report-participant": () => onReportParticipant(sessionId, profileId),
        "report-session": () => onReportSession(sessionId),
        withdraw: () => onWithdraw(sessionId),
      };
      runMySessionAction(button, callbacks[button.dataset.myAction], root);
    });
  });
  wireContactCopy(root);
  syncPendingMySessionActions(root);
  if (createdSessionId && upcoming.some((session) => String(session.sessionId) === String(createdSessionId))) {
    requestAnimationFrame(() => {
      const target = root.querySelector("[data-created-session] [data-open-my-session]");
      if (!target || !onCreatedSessionFocus()) return;
      target.focus({ preventScroll: true });
    });
  }
}

/** Backward-compatible alias for Task 6's create success handoff. */
export function renderCreatedSessionDestination(root, { createdSessionId, onBack = () => {}, onOpenSession = () => {}, sessions = [] } = {}) {
  const groups = { history: [], needsAction: [], pendingHostRequestCount: 0, upcoming: sessions };
  renderMySessionsPage(root, { createdSessionId, groups, onBack, onOpenSession });
}

function wireSessionCards(root, onOpenSession) {
  root.querySelectorAll("[data-session-id]").forEach((card) => {
    card.addEventListener("click", () => onOpenSession(card.dataset.sessionId));
  });
}

function setDrawerModal(root, expanded) {
  const backdrop = document.getElementById("nearby-sessions-backdrop");
  const release = drawerIsolations.get(root);
  const toggle = root.querySelector("#nearby-sessions-toggle");
  if (expanded && !release) drawerIsolations.set(root, pushDrawerIsolation(toggle));
  if (!expanded && release) {
    release();
    drawerIsolations.delete(root);
  }
  if (backdrop) backdrop.hidden = !expanded;
}

function wireDrawerInteractions(root, { expanded, focusOnOpen = false, onToggle }) {
  drawerBindings.get(root)?.abort();
  const bindings = new AbortController();
  drawerBindings.set(root, bindings);
  const { signal } = bindings;
  const panel = root.querySelector("[data-nearby-dialog]");
  const close = () => {
    onToggle(false);
    requestAnimationFrame(() => {
      const toggle = root.querySelector("#nearby-sessions-toggle");
      const active = document.activeElement;
      const hasNewSurface = Boolean(document.querySelector("#sheet-root .surface, #modal-root .surface"));
      // A user can move straight to a map pin before this deferred focus
      // restoration runs. Never steal that newer target (or a newly opened
      // sheet) just to restore the drawer's default opener.
      if (!toggle || toggle.getAttribute("aria-expanded") !== "false" || hasNewSurface) return;
      if (active?.isConnected && active !== document.body && active !== document.documentElement) return;
      toggle.focus({ preventScroll: true });
    });
  };

  if (expanded && panel) {
    panel.querySelector("[data-nearby-close]")?.addEventListener("click", close, { signal });
    document.getElementById("nearby-sessions-backdrop")?.addEventListener("click", close, { signal });
    panel.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
          return;
        }
        if (event.key !== "Tab") return;
        const nodes = [...panel.querySelectorAll(dialogFocusable)].filter((node) => !node.hasAttribute("hidden") && !node.closest("[hidden]"));
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      },
      { signal }
    );
    if (focusOnOpen) {
      const focusDrawerClose = () => {
        // This callback can survive a synchronous drawer redraw that replaced
        // the opening controls. A later render owns focus restoration, so an
        // aborted binding must never reclaim focus from it.
        if (signal.aborted) return;
        const active = document.activeElement;
        const opener = root.querySelector("#nearby-sessions-toggle");
        const livePanel = root.querySelector("[data-nearby-dialog]");
        const hasNewSurface = Boolean(document.querySelector("#sheet-root .surface, #modal-root .surface"));
        // The drawer needs an initial keyboard target, but that deferred move
        // must yield if the user already reached a card in the same frame.
        if (hasNewSurface || (active?.isConnected && active !== document.body && active !== document.documentElement && active !== opener)) return;
        livePanel?.querySelector("[data-nearby-close]")?.focus({ preventScroll: true });
      };
      // A render can replace the opener during the click event. Claim focus in
      // the next microtask, then once more after the frame so a concurrent
      // court/discovery rerender targets the live drawer rather than its
      // detached predecessor.
      queueMicrotask(focusDrawerClose);
      requestAnimationFrame(focusDrawerClose);
    }
  }

  let pointerStart = null;
  root.addEventListener(
    "pointerdown",
    (event) => {
      pointerStart = event.clientY;
    },
    { signal }
  );
  root.addEventListener(
    "pointerup",
    (event) => {
      if (pointerStart != null && pointerStart - event.clientY > 44) onToggle(true);
      pointerStart = null;
    },
    { signal }
  );
}

/** Render the map-bound session summary and its expandable, keyboard-safe drawer. */
export function renderNearbySessionsDrawer(
  root,
  {
    sessions = [],
    expanded = false,
    hasUserLocation = false,
    mapStatus = { kind: "idle", message: "" },
    onToggle = () => {},
    onOpenSession = () => {},
    onReset = () => {},
    onExpandBounds = () => {},
    onOpenCreate = () => {},
    onRetry = () => {},
  } = {}
) {
  // A render replaces the toggle node. Release its old inert state first, then
  // apply a fresh layer to the newly rendered node below.
  const wasExpanded = root.querySelector("#nearby-sessions-toggle")?.getAttribute("aria-expanded") === "true";
  rememberFocusedSessionCard(root);
  setDrawerModal(root, false);
  const count = sessions.length;
  const summary = `${hasUserLocation ? "附近" : "這個地圖範圍內"} ${count} 場可加入`;
  const nearest = sessions[0]
    ? `${taipeiDateTime(sessions[0].startAt)} · ${sessions[0].court} · ${sessions[0].playType} · ${vacancyLabel(sessions[0])}`
    : "移動地圖或調整篩選條件，查看可加入的球局。";
  const activeDrawerStatus =
    expanded && mapStatus?.kind === "warning" && mapStatus?.message
      ? `<div class="nearby-sessions__status" role="status" aria-live="polite" aria-atomic="true"><p>${esc(mapStatus.message)}</p></div>`
      : "";
  const drawerContent =
    mapStatus?.kind === "loading"
      ? `<div class="nearby-sessions__status" role="status" aria-live="polite" aria-atomic="true"><p>${esc(
          mapStatus.message || "正在載入球局資料…"
        )}</p></div>`
      : mapStatus?.kind === "error"
        ? `<div class="nearby-sessions__status" role="alert"><p>${esc(
            mapStatus.message || "球局資料暫時無法載入。"
          )}</p><button type="button" id="drawer-map-retry" class="session-secondary">重新載入</button></div>`
        : count
          ? sessions.map((session) => sessionCard(session)).join("")
          : renderDiscoveryEmpty({ onReset, onExpandBounds, onOpenCreate, onRetry, asMarkup: true });

  root.innerHTML = `
    <button type="button" id="nearby-sessions-toggle" class="nearby-sessions__toggle" aria-expanded="${expanded}" aria-controls="nearby-sessions-list">
      <span id="nearby-sessions-summary">${esc(summary)}</span>
      <span class="nearby-sessions__summary-detail">${esc(nearest)}</span>
      <span aria-hidden="true">${expanded ? "⌄" : "⌃"}</span>
    </button>
    <section id="nearby-sessions-list" class="nearby-sessions__list"${expanded ? "" : " hidden"} ${
      expanded ? 'role="dialog" aria-modal="true" aria-label="附近球局" tabindex="-1" data-nearby-dialog' : ""
    }>
      <div class="nearby-sessions__list-head">
        <div><p>附近球局</p><h2>${esc(summary)}</h2></div>
        <button type="button" class="surface__close" data-nearby-close aria-label="關閉附近球局">×</button>
      </div>
      ${activeDrawerStatus}
      <div class="nearby-sessions__cards">
        ${drawerContent}
      </div>
    </section>`;

  const toggle = root.querySelector("#nearby-sessions-toggle");
  toggle.addEventListener("click", () => onToggle(!expanded));
  wireSessionCards(root, onOpenSession);
  root.querySelector("#discovery-reset")?.addEventListener("click", onReset);
  root.querySelector("#discovery-expand")?.addEventListener("click", onExpandBounds);
  root.querySelector("#discovery-first")?.addEventListener("click", onOpenCreate);
  root.querySelector("#discovery-retry")?.addEventListener("click", onRetry);
  root.querySelector("#drawer-map-retry")?.addEventListener("click", onRetry);
  setDrawerModal(root, expanded);
  wireDrawerInteractions(root, { expanded, focusOnOpen: expanded && !wasExpanded, onToggle });
  restoreFocusedSessionCard(root);
}

/** Render the standard session-only empty state in the active drawer. */
export function renderDiscoveryEmpty({ onReset = () => {}, onExpandBounds = () => {}, onOpenCreate = () => {}, onRetry = () => {}, asMarkup = false } = {}) {
  const html = `<div id="discovery-empty" class="discovery-empty">
    <p>這個範圍暫時沒有可加入的球局</p>
    <div class="discovery-empty__actions">
      <button type="button" id="discovery-reset" class="session-secondary">清除篩選</button>
      <button type="button" id="discovery-retry" class="session-secondary">重新載入</button>
      <button type="button" id="discovery-expand" class="session-secondary">擴大地圖範圍</button>
      <button type="button" id="discovery-first" class="session-primary">開第一局</button>
    </div>
  </div>`;
  if (asMarkup) return html;
  return html;
}

/** Open a public session detail sheet with the privacy-reviewed field order. */
export function openSessionSheet(
  session,
  { action, canReport = false, onPrimary = () => {}, onReport = () => {}, onWithdraw = () => {} } = {}
) {
  const primaryDisabled = action?.disabled ? " disabled" : "";
  const mounted = mountSheet({
    id: "session-sheet",
    label: "球局詳情",
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">球局詳情</p><h2>可加入的網球球局</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉球局詳情">×</button>
      </div>
      <div class="session-detail">
        <p data-session-field="court"><strong>${esc(session.court)}</strong> · ${esc(session.courtDistrict)}</p>
        <p data-session-field="time">${esc(taipeiDateTime(session.startAt))}</p>
        <p data-session-field="details">${esc(session.playType)} · ${esc(ntrpRange(session))} · ${esc(vacancyLabel(session))}</p>
        <p data-session-field="host">主揪 ${esc(session.hostNickname)} · NTRP ${esc(Number(session.hostNtrp).toFixed(1))} · ${esc(
          completionLabel(session)
        )}</p>
        <p data-session-field="notes">${esc(session.notes || "沒有補充說明。")}</p>
        <p class="form-error" data-session-report-error role="alert" hidden></p>
        <div class="session-detail__actions">
          <button type="button" class="session-primary" data-session-action="primary"${primaryDisabled}>${esc(
            action?.label ?? "申請加入"
          )}</button>
          ${
            action?.secondaryLabel
              ? `<button type="button" class="session-secondary" data-session-action="secondary">${esc(action.secondaryLabel)}</button>`
              : ""
          }
          ${
            canReport
              ? '<button type="button" class="session-tertiary" data-session-action="report">檢舉此球局</button>'
              : ""
          }
        </div>
      </div>`,
  });
  mounted.root.querySelector('[data-session-action="primary"]')?.addEventListener("click", onPrimary);
  const reportButton = mounted.root.querySelector('[data-session-action="report"]');
  reportButton?.addEventListener("click", async () => {
    const error = mounted.root.querySelector("[data-session-report-error]");
    reportButton.disabled = true;
    error.hidden = true;
    try {
      await onReport();
    } catch (reportError) {
      error.textContent = reportError?.message || "目前無法開啟檢舉。";
      error.hidden = false;
    } finally {
      if (mounted.root.contains(reportButton)) reportButton.disabled = false;
    }
  });
  const secondaryButton = mounted.root.querySelector('[data-session-action="secondary"]');
  let withdrawing = false;
  secondaryButton?.addEventListener("click", async () => {
    if (withdrawing) return;
    withdrawing = true;
    secondaryButton.disabled = true;
    try {
      await onWithdraw();
    } finally {
      // A successful withdrawal closes this sheet. Restore the button only
      // after a recoverable failure while this exact surface still exists.
      if (mounted.root.contains(secondaryButton)) {
        withdrawing = false;
        secondaryButton.disabled = false;
      }
    }
  });
  return mounted;
}

/** Ask for an intentional confirmation before the join lifecycle RPC. */
export function openJoinSessionConfirmation(session, { onClose = () => {}, onConfirm = () => {}, onViewMySessions = () => {} } = {}) {
  let joined = false;
  const mounted = mountDialog({
    id: "join-session-confirmation",
    label: "確認申請加入",
    onClose: (detail) => {
      onClose(detail);
      // Joining closes the public detail beneath this dialog. When the user
      // dismisses the success state, that original trigger no longer exists,
      // so hand focus to a durable navigation target instead of document.body.
      if (joined) requestAnimationFrame(() => document.getElementById("my-sessions-tab")?.focus({ preventScroll: true }));
    },
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">確認申請</p><h2>申請加入這一局？</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉確認">×</button>
      </div>
      <form data-testid="session-join-form" class="join-session-form" novalidate>
        <div class="session-detail join-session-summary">
          <p data-join-field="court"><strong>${esc(session.court)}</strong> · ${esc(session.courtDistrict)}</p>
          <p data-join-field="time">${esc(taipeiDateTime(session.startAt))}</p>
          <p data-join-field="details">${esc(session.playType)} · ${esc(ntrpRange(session))} · ${esc(vacancyLabel(session))}</p>
          <p data-join-field="host">主揪 ${esc(session.hostNickname)} · NTRP ${esc(Number(session.hostNtrp).toFixed(1))} · ${esc(
            completionLabel(session)
          )}</p>
          <p data-join-field="notes">${esc(session.notes || "沒有補充說明。")}</p>
        </div>
        <p class="surface__copy">送出後，主揪會在球局流程中處理申請。</p>
        <p class="form-error" data-join-error role="alert" hidden></p>
        <button type="submit" class="session-primary" data-confirm-join data-testid="join-session">確認申請加入</button>
      </form>
      <p class="surface__message" data-join-success role="status" aria-live="polite" tabindex="-1" hidden>已送出申請，等待主揪回覆。</p>
      <div class="session-detail__actions" data-join-success-actions hidden><button type="button" class="session-primary" data-join-view-my-sessions>前往我的球局</button></div>`,
  });
  const form = mounted.root.querySelector("[data-testid='session-join-form']");
  const confirmButton = mounted.root.querySelector("[data-confirm-join]");
  const error = mounted.root.querySelector("[data-join-error]");
  const success = mounted.root.querySelector("[data-join-success]");
  const successActions = mounted.root.querySelector("[data-join-success-actions]");
  const viewMySessions = mounted.root.querySelector("[data-join-view-my-sessions]");
  let submitting = false;
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    confirmButton.disabled = true;
    error.hidden = true;
    try {
      const result = await onConfirm(mounted.close);
      if (result?.joinSubmitted && mounted.root.contains(form)) {
        joined = true;
        form.hidden = true;
        success.hidden = false;
        successActions.hidden = false;
        viewMySessions.focus({ preventScroll: true });
      } else if (result?.joinError && mounted.root.contains(error)) {
        error.textContent = result.joinError;
        error.hidden = false;
      }
    } catch (submitError) {
      if (mounted.root.contains(error)) {
        error.textContent = submitError?.message || "申請失敗，請稍後再試。";
        error.hidden = false;
      }
    } finally {
      // requestJoin keeps this dialog available after a recoverable failure;
      // restore one deliberate retry only if this is still the mounted dialog.
      if (mounted.root.contains(confirmButton) && !form.hidden) {
        submitting = false;
        confirmButton.disabled = false;
      }
    }
  });
  viewMySessions?.addEventListener("click", () => {
    mounted.close({ reason: "view-my-sessions", restoreFocus: false });
    onViewMySessions();
  });
  return mounted;
}

const REPORT_REASONS = ["與實際球局不符", "不當行為", "疑似詐騙", "其他"];

/** Collect a minimal, reviewable report without exposing any new profile data. */
export function openReportDialog({ targetLabel = "這個項目", onClose = () => {}, onSubmit = () => {} } = {}) {
  const mounted = mountDialog({
    id: "report-dialog",
    label: "檢舉",
    onClose,
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">檢舉</p><h2>回報問題</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉檢舉">×</button>
      </div>
      <p class="surface__copy">${esc(targetLabel)}</p>
      <form data-testid="report-form" class="report-form" novalidate>
        <fieldset class="form-fieldset"><legend>檢舉原因</legend>
          ${REPORT_REASONS.map(
            (reason) =>
              `<label><input type="radio" name="report-reason" value="${esc(reason)}" />${esc(reason)}</label>`
          ).join("")}
        </fieldset>
        <p class="form-error" data-report-error role="alert" hidden></p>
        <button type="submit" class="session-primary" data-testid="report-submit">送出檢舉</button>
      </form>
      <p class="surface__message" data-report-success role="status" aria-live="polite" tabindex="-1" hidden>已送出檢舉，謝謝你的回報。</p>`,
  });
  const form = mounted.root.querySelector("[data-testid='report-form']");
  const submit = mounted.root.querySelector("[data-testid='report-submit']");
  const error = mounted.root.querySelector("[data-report-error]");
  const success = mounted.root.querySelector("[data-report-success]");
  let submitting = false;
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    const reason = form.querySelector("[name='report-reason']:checked")?.value;
    if (!reason) {
      error.textContent = "請選擇檢舉原因。";
      error.hidden = false;
      return;
    }
    submitting = true;
    submit.disabled = true;
    error.hidden = true;
    try {
      await onSubmit(reason);
      if (mounted.root.contains(form)) {
        form.hidden = true;
        success.hidden = false;
        success.focus({ preventScroll: true });
      }
    } catch (submitError) {
      if (mounted.root.contains(error)) {
        error.textContent = submitError?.message || "檢舉暫時無法送出，請稍後再試。";
        error.hidden = false;
      }
    } finally {
      if (mounted.root.contains(submit) && !form.hidden) {
        submitting = false;
        submit.disabled = false;
      }
    }
  });
  return mounted;
}

const PROFILE_PLAY_TYPES = ["單打", "雙打", "對拉", "練球"];
const PROFILE_SLOTS = [
  ["wd-m", "平日早上"],
  ["wd-a", "平日下午"],
  ["wd-e", "平日晚上"],
  ["we-m", "週末早上"],
  ["we-a", "週末下午"],
  ["we-e", "週末晚上"],
];

function taipeiCourts(courts) {
  return (Array.isArray(courts) ? courts : []).filter((court) => court?.city === "台北市");
}

function selectedCourtValues(select, fallback = new Set()) {
  const selected = new Set([...(select?.selectedOptions ?? [])].map((option) => option.value));
  return selected.size ? selected : new Set(fallback);
}

/** Replace only court options so delayed data never discards the user's draft. */
function updateCourtSelect(select, status, courts, { ready = true, selected = new Set(), multiple = false } = {}) {
  if (!select) return;
  const nextCourts = taipeiCourts(courts);
  const selectedValues = selected instanceof Set ? selected : new Set(selected ?? []);
  const options = nextCourts
    .map((court) => {
      const isSelected = selectedValues.has(String(court.id)) || selectedValues.has(court.name);
      return `<option value="${esc(court.id)}"${isSelected ? " selected" : ""}>${esc(court.name)}${
        multiple ? "" : ` · ${esc(court.district ?? "台北市")}`
      }</option>`;
    })
    .join("");
  select.innerHTML = multiple ? options : `<option value="">請選擇球場</option>${options}`;
  select.disabled = !ready || nextCourts.length === 0;
  if (!status) return;
  status.hidden = ready && nextCourts.length > 0;
  status.textContent = !ready ? "正在載入台北市球場…" : nextCourts.length ? "" : "目前沒有可選的台北市球場。";
}

function selectedValues(form, name) {
  return new Set([...form.querySelectorAll(`[name="${name}"]:checked`)].map((input) => input.value));
}

function profileFormValue(form) {
  const courts = new Set([...form.querySelectorAll("[name='profile-courts'] option:checked")].map((option) => option.value));
  return {
    courts,
    lineId: form.querySelector("[name='profile-line-id']")?.value.trim() ?? "",
    nick: form.querySelector("[name='profile-nickname']")?.value.trim() ?? "",
    ntrp: Number(form.querySelector("[name='profile-ntrp']")?.value),
    slots: selectedValues(form, "profile-slots"),
    types: selectedValues(form, "profile-types"),
  };
}

function validateProfileForm(profile) {
  if (!profile.nick) return "請填寫公開暱稱。";
  if (!Number.isFinite(profile.ntrp) || profile.ntrp < 1 || profile.ntrp > 7 || !Number.isInteger(profile.ntrp * 2)) {
    return "NTRP 請選擇 1.0 到 7.0。";
  }
  if (!profile.lineId) return "請填寫 LINE ID。";
  if (!profile.courts.size) return "請至少選一座常打球場。";
  if (!profile.types.size) return "請至少選一種打法。";
  if (!profile.slots.size) return "請至少選一個可打時段。";
  return "";
}

function profileNtrpOptions(selected) {
  return Array.from({ length: 13 }, (_, index) => 1 + index * 0.5)
    .map((value) => `<option value="${value}"${Number(selected) === value ? " selected" : ""}>${value.toFixed(1)}</option>`)
    .join("");
}

/** Open the private profile-completion sheet without leaking profile fields to public renderers. */
export function openProfileCompletionSheet({
  courts = [],
  courtsReady = true,
  onClose = () => {},
  onSave = async () => {},
  onSaved = async () => {},
  profile = {},
  returnSession = null,
} = {}) {
  const selectedCourts = profile.courts instanceof Set ? profile.courts : new Set(profile.courts ?? []);
  const selectedTypes = profile.types instanceof Set ? profile.types : new Set(profile.types ?? []);
  // The service requires one playable time slot. It is visible and editable,
  // never an invisible default injected at submit time.
  const selectedSlots = profile.slots instanceof Set && profile.slots.size ? profile.slots : new Set(["we-m"]);
  let saved = false;
  const mounted = mountSheet({
    id: "profile-completion-sheet",
    label: "完成個人檔案",
    className: "profile-sheet",
    onClose: (detail = {}) => onClose({ ...detail, saved }),
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">完成後即可繼續</p><h2>完成個人檔案</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉個人檔案">×</button>
      </div>
      ${
        returnSession
          ? `<p class="profile-return-context">完成後將回到：${esc(returnSession.court)}・${esc(taipeiDateTime(returnSession.startAt))}</p>`
          : ""
      }
      <form class="profile-form" data-testid="profile-form" novalidate>
        <label class="form-field" for="profile-nickname"><span>公開暱稱</span><input id="profile-nickname" name="profile-nickname" required value="${esc(
          profile.nick ?? ""
        )}" autocomplete="nickname" /></label>
        <p class="form-disclosure">${esc(PROFILE_PUBLIC_DISCLOSURE)}</p>
        <label class="form-field" for="profile-ntrp"><span>NTRP 程度</span><select id="profile-ntrp" name="profile-ntrp">${profileNtrpOptions(
          profile.ntrp ?? 3.5
        )}</select></label>
        <label class="form-field" for="profile-line-id"><span>LINE ID</span><input id="profile-line-id" name="profile-line-id" required value="${esc(
          profile.lineId ?? ""
        )}" autocomplete="off" /></label>
        <p class="form-hint">只有同一球局的主揪與已接受球友之間可看見彼此的 LINE ID。</p>
        <fieldset class="form-fieldset"><legend>常打球場</legend><select name="profile-courts" multiple size="4" aria-label="常打球場" disabled></select><p class="form-hint" data-profile-courts-status role="status" aria-live="polite"></p></fieldset>
        <fieldset class="form-fieldset"><legend>常打類型</legend><div class="option-grid">${PROFILE_PLAY_TYPES.map(
          (type) =>
            `<label><input type="checkbox" name="profile-types" value="${esc(type)}"${selectedTypes.has(type) ? " checked" : ""} /> ${esc(
              type
            )}</label>`
        ).join("")}</div></fieldset>
        <fieldset class="form-fieldset"><legend>可打時段</legend><div class="option-grid">${PROFILE_SLOTS.map(
          ([value, label]) =>
            `<label><input type="checkbox" name="profile-slots" value="${esc(value)}"${selectedSlots.has(value) ? " checked" : ""} /> ${esc(
              label
            )}</label>`
        ).join("")}</div></fieldset>
        <p class="form-error" data-profile-error role="alert" hidden></p>
        <button type="submit" class="session-primary" data-testid="profile-save">儲存並繼續</button>
      </form>`,
  });
  const form = mounted.root.querySelector("[data-testid='profile-form']");
  const error = mounted.root.querySelector("[data-profile-error]");
  const submit = mounted.root.querySelector("[data-testid='profile-save']");
  const courtSelect = mounted.root.querySelector("[name='profile-courts']");
  const courtsStatus = mounted.root.querySelector("[data-profile-courts-status]");
  const setCourts = (nextCourts, { ready = true } = {}) => {
    updateCourtSelect(courtSelect, courtsStatus, nextCourts, {
      multiple: true,
      ready,
      selected: selectedCourtValues(courtSelect, selectedCourts),
    });
  };
  setCourts(courts, { ready: courtsReady });
  let saving = false;
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    const nextProfile = profileFormValue(form);
    const message = validateProfileForm(nextProfile);
    if (message) {
      error.hidden = false;
      error.textContent = message;
      return;
    }
    saving = true;
    submit.disabled = true;
    error.hidden = true;
    try {
      const savedProfile = await onSave(nextProfile);
      saved = true;
      mounted.close({ reason: "complete" });
      await onSaved(savedProfile ?? nextProfile);
    } catch (saveError) {
      error.hidden = false;
      error.textContent = saveError?.message || "個人檔案暫時無法儲存。";
    } finally {
      if (mounted.root.contains(submit)) {
        saving = false;
        submit.disabled = false;
      }
    }
  });
  return { ...mounted, setCourts };
}

/** A single, scrollable Taipei create-session sheet with all required fields first. */
export function openCreateSessionSheet({ courts = [], courtsReady = true, onClose = () => {}, onSubmit = async () => {} } = {}) {
  const mounted = mountSheet({
    id: "session-create-modal",
    label: "開球局",
    className: "create-session-sheet",
    onClose,
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">開球局</p><h2>建立你的下一場球局</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉開球局">×</button>
      </div>
      <form class="create-session-form" data-testid="session-form" novalidate>
        <div class="form-field"><label for="session-court">台北市球場</label><select id="session-court" name="courtId" data-testid="session-court" required disabled></select><p class="form-hint" data-create-courts-status role="status" aria-live="polite"></p></div>
        <label class="form-field" for="session-start-at"><span>台北時間</span><input id="session-start-at" name="startAtLocal" data-testid="session-start-at" type="datetime-local" required /></label>
        <label class="form-field" for="session-play-type"><span>打法</span><select id="session-play-type" name="playType" data-testid="session-play-type" required><option value="">請選擇打法</option>${PROFILE_PLAY_TYPES.map(
          (type) => `<option value="${esc(type)}">${esc(type)}</option>`
        ).join("")}</select></label>
        <label class="form-field" for="session-slots-total"><span>缺額</span><select id="session-slots-total" name="slotsTotal" data-testid="session-slots-total" required><option value="">請選擇缺額</option><option value="1">1 位</option><option value="2">2 位</option><option value="3">3 位</option></select></label>
        <fieldset class="form-fieldset"><legend>加入方式</legend>
          <label><input type="radio" name="joinMode" value="approval" checked /> 需審核（你逐一核准申請者）</label>
          <label><input type="radio" name="joinMode" value="instant" /> 直接加入（先到先得，立即成局）</label>
          <p class="form-hint">選擇直接加入後，任何完成檔案的球友加入即成局，你們將互相看到 LINE ID。</p>
        </fieldset>
        <fieldset class="form-fieldset"><legend>適合程度（選填）</legend><div class="form-row"><label class="form-field" for="session-ntrp-min"><span>最低 NTRP</span><input id="session-ntrp-min" name="ntrpMin" type="number" min="1" max="7" step="0.5" inputmode="decimal" /></label><label class="form-field" for="session-ntrp-max"><span>最高 NTRP</span><input id="session-ntrp-max" name="ntrpMax" type="number" min="1" max="7" step="0.5" inputmode="decimal" /></label></div></fieldset>
        <label class="form-field" for="session-notes"><span>備註（選填，最多 500 字）</span><textarea id="session-notes" name="notes" maxlength="500" rows="4"></textarea></label>
        <p class="form-disclosure">${esc(PROFILE_PUBLIC_DISCLOSURE)}</p>
        <p class="form-error" data-create-error role="alert" hidden></p>
        <button type="submit" class="session-primary" data-testid="session-submit">建立球局</button>
      </form>`,
  });
  const form = mounted.root.querySelector("[data-testid='session-form']");
  const error = mounted.root.querySelector("[data-create-error]");
  const submit = mounted.root.querySelector("[data-testid='session-submit']");
  const courtSelect = mounted.root.querySelector("[data-testid='session-court']");
  const courtsStatus = mounted.root.querySelector("[data-create-courts-status]");
  const setCourts = (nextCourts, { ready = true } = {}) => {
    updateCourtSelect(courtSelect, courtsStatus, nextCourts, {
      ready,
      selected: selectedCourtValues(courtSelect),
    });
  };
  setCourts(courts, { ready: courtsReady });
  let submitting = false;
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    const formData = new FormData(form);
    const validation = validateCreateSessionInput(Object.fromEntries(formData.entries()));
    if (!validation.valid) {
      error.hidden = false;
      error.textContent = Object.values(validation.errors)[0];
      return;
    }
    submitting = true;
    submit.disabled = true;
    error.hidden = true;
    try {
      await onSubmit(validation.value, () => mounted.close({ reason: "complete" }));
    } catch (submitError) {
      error.hidden = false;
      error.textContent = submitError?.message || "建立球局失敗，請稍後再試。";
    } finally {
      if (mounted.root.contains(submit)) {
        submitting = false;
        submit.disabled = false;
      }
    }
  });
  return { ...mounted, setCourts };
}

/** Open a session-only list for the selected base court or aggregate marker. */
export function openCourtSessionDrawer(court, sessions, { onOpenSession = () => {} } = {}) {
  const mounted = mountSheet({
    id: "court-session-sheet",
    label: "球場球局",
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">${esc(court.district || court.city || "台北市")}</p><h2>${esc(court.name)}</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉球場球局">×</button>
      </div>
      <div class="nearby-sessions__cards">
        ${sessions.length ? sessions.map((session) => sessionCard(session, { compact: true })).join("") : '<p class="surface__copy">這座球場目前沒有可加入的球局。</p>'}
      </div>`,
  });
  wireSessionCards(mounted.root, onOpenSession);
  return mounted;
}

/** Render only user-facing, non-sensitive loading/error/location messages. */
export function renderMapDataStatus(root, { kind = "idle", message = "", onRetry = () => {}, locationMessage = "" } = {}) {
  const visible = kind !== "idle" || Boolean(locationMessage);
  root.hidden = !visible;
  if (!visible) {
    root.innerHTML = "";
    return;
  }
  root.className = `map-data-status map-data-status--${esc(kind)}`;
  root.innerHTML = `
    ${message ? `<p>${esc(message)}</p>` : ""}
    ${kind === "error" ? '<button type="button" id="map-retry" class="session-secondary">重新載入</button>' : ""}
    ${locationMessage ? `<p id="location-feedback" class="location-feedback">${esc(locationMessage)}</p>` : ""}`;
  root.querySelector("#map-retry")?.addEventListener("click", onRetry);
}
