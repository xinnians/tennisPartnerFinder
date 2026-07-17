import { TAIPEI_TIME_ZONE } from "./config.js";
import { pushDrawerIsolation } from "./modalIsolation.js";
import { mountDialog, mountSheet } from "./sheets.js";
import { esc } from "./util.js";

const dialogFocusable =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const drawerBindings = new WeakMap();
const drawerIsolations = new WeakMap();
const drawerFocusIntents = new WeakMap();

function rememberFocusedSessionCard(root) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return;
  const card = active.closest("[data-session-id]");
  if (card?.dataset.sessionId) drawerFocusIntents.set(root, card.dataset.sessionId);
}

function restoreFocusedSessionCard(root) {
  const sessionId = drawerFocusIntents.get(root);
  if (!sessionId) return;
  requestAnimationFrame(() => {
    const active = document.activeElement;
    const hasNewSurface = Boolean(document.querySelector("#sheet-root .surface, #modal-root .surface"));
    if (hasNewSurface || (active && active !== document.body && active !== document.documentElement)) return;
    const card = [...root.querySelectorAll("[data-session-id]")].find(
      (node) => String(node.dataset.sessionId) === String(sessionId)
    );
    if (!card) return;
    drawerFocusIntents.delete(root);
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
      if (active && active !== document.body && active !== document.documentElement) return;
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
        const nodes = [...panel.querySelectorAll(dialogFocusable)].filter((node) => !node.hasAttribute("hidden"));
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
      requestAnimationFrame(() => {
        const active = document.activeElement;
        const opener = root.querySelector("#nearby-sessions-toggle");
        const hasNewSurface = Boolean(document.querySelector("#sheet-root .surface, #modal-root .surface"));
        // The drawer needs an initial keyboard target, but that deferred move
        // must yield if the user already reached a card in the same frame.
        if (hasNewSurface || (active && active !== document.body && active !== document.documentElement && active !== opener)) return;
        panel.querySelector("[data-nearby-close]")?.focus({ preventScroll: true });
      });
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
    expanded && mapStatus?.kind !== "idle" && mapStatus?.message
      ? `<div class="nearby-sessions__status" role="status" aria-live="polite" aria-atomic="true">
          <p>${esc(mapStatus.message)}</p>
          ${mapStatus.kind === "error" ? '<button type="button" id="drawer-map-retry" class="session-secondary">重新載入</button>' : ""}
        </div>`
      : "";

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
        ${
          count
            ? sessions.map((session) => sessionCard(session)).join("")
            : renderDiscoveryEmpty({ onReset, onExpandBounds, onOpenCreate, onRetry, asMarkup: true })
        }
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
export function openSessionSheet(session, { action, onPrimary = () => {}, onWithdraw = () => {} } = {}) {
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
        <div class="session-detail__actions">
          <button type="button" class="session-primary" data-session-action="primary"${primaryDisabled}>${esc(
            action?.label ?? "申請加入"
          )}</button>
          ${
            action?.secondaryLabel
              ? `<button type="button" class="session-secondary" data-session-action="secondary">${esc(action.secondaryLabel)}</button>`
              : ""
          }
        </div>
      </div>`,
  });
  mounted.root.querySelector('[data-session-action="primary"]')?.addEventListener("click", onPrimary);
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
export function openJoinSessionConfirmation(session, { onConfirm = () => {} } = {}) {
  const mounted = mountDialog({
    id: "join-session-confirmation",
    label: "確認申請加入",
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">確認申請</p><h2>申請加入這一局？</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉確認">×</button>
      </div>
      <p class="surface__copy">${esc(session.court)} · ${esc(taipeiDateTime(session.startAt))}</p>
      <p class="surface__copy">送出後，主揪會在球局流程中處理申請。</p>
      <button type="button" class="session-primary" data-confirm-join>確認申請加入</button>`,
  });
  const confirmButton = mounted.root.querySelector("[data-confirm-join]");
  let submitting = false;
  confirmButton?.addEventListener("click", async () => {
    if (submitting) return;
    submitting = true;
    confirmButton.disabled = true;
    try {
      await onConfirm(mounted.close);
    } finally {
      // requestJoin keeps this dialog available after a recoverable failure;
      // restore one deliberate retry only if this is still the mounted dialog.
      if (mounted.root.contains(confirmButton)) {
        submitting = false;
        confirmButton.disabled = false;
      }
    }
  });
  return mounted;
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
