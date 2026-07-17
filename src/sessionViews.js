import { TAIPEI_TIME_ZONE } from "./config.js";
import { pushDrawerIsolation } from "./modalIsolation.js";
import { mountDialog, mountSheet } from "./sheets.js";
import { esc } from "./util.js";

const dialogFocusable =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const drawerBindings = new WeakMap();
const drawerIsolations = new WeakMap();
const drawerFocusIntents = new WeakMap();

export const PROFILE_PUBLIC_DISCLOSURE =
  "開球局後，這個暱稱與你的 NTRP 會顯示給瀏覽該球局的人；LINE ID 只會在你核准加入者後顯示。";

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

/** Minimal Task-6 success destination; Task 7 expands it into full My Sessions grouping. */
export function renderCreatedSessionDestination(root, { createdSessionId, onBack = () => {}, onOpenSession = () => {}, sessions = [] } = {}) {
  const created = sessions.find((session) => String(session.sessionId) === String(createdSessionId)) ?? null;
  const ordered = created
    ? [created, ...sessions.filter((session) => String(session.sessionId) !== String(createdSessionId))]
    : sessions;
  root.innerHTML = `
    <div class="my-sessions-shell__head">
      <div><p class="surface__eyebrow">我的球局</p><h1>即將打球</h1></div>
      <button type="button" class="session-secondary" data-my-sessions-back>回到地圖</button>
    </div>
    <p class="surface__copy">${
      created
        ? "球局已建立，主揪身分已加入這一局。"
        : createdSessionId
          ? "球局已建立；正在更新你的球局清單。"
          : "在這裡查看即將打球的球局。"
    }</p>
    <div id="my-upcoming-sessions" class="nearby-sessions__cards">
      ${
        ordered.length
          ? ordered
              .map(
                (session) =>
                  `<div${String(session.sessionId) === String(createdSessionId) ? ' data-created-session="true"' : ""}>${sessionCard(session)}</div>`
              )
              .join("")
          : '<p class="surface__copy">尚未載入即將打球的球局。</p>'
      }
    </div>`;
  root.querySelector("[data-my-sessions-back]")?.addEventListener("click", onBack);
  wireSessionCards(root, onOpenSession);
  if (created) {
    requestAnimationFrame(() => {
      root.querySelector("[data-created-session] [data-session-id]")?.focus({ preventScroll: true });
    });
  }
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
export function openJoinSessionConfirmation(session, { onClose = () => {}, onConfirm = () => {} } = {}) {
  const mounted = mountDialog({
    id: "join-session-confirmation",
    label: "確認申請加入",
    onClose,
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
        <p class="form-hint">只有已核准的主揪／球友配對可看見你的 LINE ID。</p>
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
