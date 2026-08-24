import { BANDS, DEFAULT_FILTER_STATE } from "./filters.js"; // eslint-disable-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
import { validProfileNtrp } from "./profile.js";
import { isUndecidedCandidate } from "./sessionCriteria.js";
import { mountDialog, mountSheet } from "./sheets.js";
import {
  taipeiClock,
  taipeiDateTime,
  taipeiDateTimeLocalValue,
  taipeiLocalDateTimeToIso,
  taipeiParts,
} from "./taipeiTime.js";
import { esc } from "./util.js";
import {
  runAsyncAction,
  runNotificationSettingAction, // eslint-disable-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
  runPresenceSettingAction, // eslint-disable-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
  setMySessionActionScope,
  syncPendingMySessionActions,
} from "./sessionActions.ts";
import {
  PROFILE_SLOTS,
  padTwo,
  sessionScheduleLabel,
  sessionVenuePresentation,
  taipeiCourts,
  taipeiDayWord, // eslint-disable-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
  taipeiTileDate,
} from "./sessionPresentation.ts";
export {
  avatarRuntime,
  courtPlayersSheetRuntime,
  decideSessionSheetRuntime,
  mePageRuntime,
  messagesFromGroups,
  mySessionsPageRuntime,
  nearbySessionsDrawerRuntime,
  nearbySessionsSummaryText,
  playerCardSheetRuntime,
  playerDirectorySheetRuntime,
  profileCompletionSheetRuntime,
  reportDialogRuntime,
  sessionCardRuntime,
  sessionChatSheetRuntime,
  sessionDetailSheetRuntime,
} from "./sessionPresentation.ts";

// One-way boundary: this legacy adapter may mount React and consume presentation
// helpers, while React modules import only sessionPresentation.ts and never reach
// back into this file.

// App shell、首頁附近抽屜與詳情 sheet 留在主 chunk；Node 22 unit tests 沒有
// document，會短路而不解析其不支援的 .tsx 副檔名。
const appModules = typeof document === "undefined" ? {} : import.meta.glob("./app/App.tsx", { eager: true });
const appModule = appModules["./app/App.tsx"];
const renderMePageInApp = appModule?.renderMePageInApp;
const renderMessagesPageInApp = appModule?.renderMessagesPageInApp;
const renderMySessionsPageInApp = appModule?.renderMySessionsPageInApp;
const renderNearbySessionsDrawerInApp = appModule?.renderNearbySessionsDrawerInApp;
const preloadMePageInApp = appModule?.preloadMePageInApp;
const preloadMessagesPageInApp = appModule?.preloadMessagesPageInApp;
const preloadMySessionsPageInApp = appModule?.preloadMySessionsPageInApp;
const sessionDetailSheetModules =
  typeof document === "undefined" ? {} : import.meta.glob("./sheets/SessionDetailSheet.tsx", { eager: true });
const mountSessionDetailSheetContent =
  sessionDetailSheetModules["./sheets/SessionDetailSheet.tsx"]?.mountSessionDetailSheetContent;
const nonHomeSheetModules =
  typeof document === "undefined"
    ? {}
    : import.meta.glob([
        "./sheets/CourtPlayersSheet.tsx",
        "./sheets/CourtSessionSheet.tsx",
        "./sheets/CreateSessionSheet.tsx",
        "./sheets/DecideSessionSheet.tsx",
        "./sheets/EditSessionSheet.tsx",
        "./sheets/FilterSheet.tsx",
        "./sheets/PlayerCardSheet.tsx",
        "./sheets/PlayerDirectorySheet.tsx",
        "./sheets/ProfileCompletionSheet.tsx",
        "./sheets/ReportDialog.tsx",
        "./sheets/SessionChatSheet.tsx",
        "./sheets/SessionUnavailableSheet.tsx",
        "./sheets/WithdrawSessionConfirmationDialog.tsx",
      ]);

let mountCreateSessionSheetContent;
let mountEditSessionSheetContent;
let mountSessionUnavailableSheetContent;
let mountCourtSessionSheetContent;
let mountCourtPlayersSheetContent;
let mountFilterSheetContent;
let mountPlayerDirectorySheetContent;
let mountPlayerCardSheetContent;
let mountProfileCompletionSheetContent;
let mountDecideSessionSheetContent;
let mountSessionChatSheetContent;
let mountWithdrawSessionConfirmationDialogContent;
let mountReportDialogContent;

function createMountPreloader(modulePath, exportName, assign) {
  let request = null;
  return () => {
    if (request) return request;
    const load = nonHomeSheetModules[modulePath];
    if (!load) return Promise.reject(new Error(`Lazy surface module is unavailable: ${modulePath}`));
    request = load().then((module) => {
      const mount = module?.[exportName];
      if (typeof mount !== "function") throw new Error(`Lazy surface export is unavailable: ${exportName}`);
      assign(mount);
    });
    return request;
  };
}

const preloadCreateSessionSheet = createMountPreloader(
  "./sheets/CreateSessionSheet.tsx",
  "mountCreateSessionSheetContent",
  (mount) => (mountCreateSessionSheetContent = mount)
);
const preloadEditSessionSheet = createMountPreloader(
  "./sheets/EditSessionSheet.tsx",
  "mountEditSessionSheetContent",
  (mount) => (mountEditSessionSheetContent = mount)
);
const preloadSessionUnavailableSheet = createMountPreloader(
  "./sheets/SessionUnavailableSheet.tsx",
  "mountSessionUnavailableSheetContent",
  (mount) => (mountSessionUnavailableSheetContent = mount)
);
const preloadCourtSessionSheet = createMountPreloader(
  "./sheets/CourtSessionSheet.tsx",
  "mountCourtSessionSheetContent",
  (mount) => (mountCourtSessionSheetContent = mount)
);
const preloadCourtPlayersSheet = createMountPreloader(
  "./sheets/CourtPlayersSheet.tsx",
  "mountCourtPlayersSheetContent",
  (mount) => (mountCourtPlayersSheetContent = mount)
);
const preloadFilterSheet = createMountPreloader(
  "./sheets/FilterSheet.tsx",
  "mountFilterSheetContent",
  (mount) => (mountFilterSheetContent = mount)
);
const preloadPlayerDirectorySheet = createMountPreloader(
  "./sheets/PlayerDirectorySheet.tsx",
  "mountPlayerDirectorySheetContent",
  (mount) => (mountPlayerDirectorySheetContent = mount)
);
const preloadPlayerCardSheet = createMountPreloader(
  "./sheets/PlayerCardSheet.tsx",
  "mountPlayerCardSheetContent",
  (mount) => (mountPlayerCardSheetContent = mount)
);
const preloadProfileCompletionSheet = createMountPreloader(
  "./sheets/ProfileCompletionSheet.tsx",
  "mountProfileCompletionSheetContent",
  (mount) => (mountProfileCompletionSheetContent = mount)
);
const preloadDecideSessionSheet = createMountPreloader(
  "./sheets/DecideSessionSheet.tsx",
  "mountDecideSessionSheetContent",
  (mount) => (mountDecideSessionSheetContent = mount)
);
const preloadSessionChatSheet = createMountPreloader(
  "./sheets/SessionChatSheet.tsx",
  "mountSessionChatSheetContent",
  (mount) => (mountSessionChatSheetContent = mount)
);
const preloadWithdrawSessionConfirmationDialog = createMountPreloader(
  "./sheets/WithdrawSessionConfirmationDialog.tsx",
  "mountWithdrawSessionConfirmationDialogContent",
  (mount) => (mountWithdrawSessionConfirmationDialogContent = mount)
);
const preloadReportDialog = createMountPreloader(
  "./sheets/ReportDialog.tsx",
  "mountReportDialogContent",
  (mount) => (mountReportDialogContent = mount)
);

function lazySurfaceHtml(label) {
  return `<div class="surface__head">
    <div><p class="surface__eyebrow">LOADING</p><h2>${esc(label)}</h2></div>
    <button type="button" class="surface__close" data-surface-close aria-label="關閉">×</button>
  </div>
  <p class="surface__copy" data-lazy-surface-status role="status" aria-live="polite" aria-atomic="true">正在載入…</p>`;
}

function deferSurfaceOpen({ className = "", id, label, load, methods = [], onClose = () => {}, open, type = "sheet" }) {
  let active = null;
  let live = true;
  let readyHandle = null;
  let replacing = false;
  const pendingCalls = [];
  const mount = type === "dialog" ? mountDialog : mountSheet;
  active = mount({
    id,
    label,
    className,
    html: lazySurfaceHtml(label),
    onClose: (detail) => {
      if (replacing) return;
      live = false;
      onClose(detail);
    },
  });

  const deferred = {
    close(options) {
      return active.close(options);
    },
    get root() {
      return active.root;
    },
    get surface() {
      return active.surface;
    },
  };
  for (const method of methods) {
    deferred[method] = (...args) => {
      if (readyHandle) return readyHandle[method]?.(...args);
      pendingCalls.push([method, args]);
    };
  }

  void load()
    .then(() => {
      if (!live) return;
      replacing = true;
      const next = open();
      replacing = false;
      active = next;
      readyHandle = next;
      for (const [method, args] of pendingCalls.splice(0)) readyHandle[method]?.(...args);
    })
    .catch(() => {
      replacing = false;
      if (!live) return;
      const status = active.root.querySelector("[data-lazy-surface-status]");
      if (status) status.textContent = "載入失敗，請關閉後再試。";
    });
  return deferred;
}

const authenticatedViewPreloads = [
  preloadMePageInApp,
  preloadMessagesPageInApp,
  preloadMySessionsPageInApp,
  preloadCreateSessionSheet,
  preloadEditSessionSheet,
  preloadCourtPlayersSheet,
  preloadPlayerDirectorySheet,
  preloadPlayerCardSheet,
  preloadProfileCompletionSheet,
  preloadDecideSessionSheet,
  preloadSessionChatSheet,
  preloadWithdrawSessionConfirmationDialog,
  preloadReportDialog,
];

const namedViewPreloads = {
  chat: preloadSessionChatSheet,
  create: preloadCreateSessionSheet,
  filter: preloadFilterSheet,
  me: preloadMePageInApp,
  mySessions: preloadMySessionsPageInApp,
  withdraw: preloadWithdrawSessionConfirmationDialog,
};

export function preloadNonHomeViews(viewNames = Object.keys(namedViewPreloads)) {
  const names = Array.isArray(viewNames) ? viewNames : [viewNames];
  return Promise.all(names.map((name) => namedViewPreloads[name]?.()).filter(Boolean)).then(() => undefined);
}

function warmView(preload) {
  if (typeof preload === "function") void preload().catch(() => {});
}

function preloadAuthenticatedViews() {
  for (const preload of authenticatedViewPreloads) warmView(preload);
}

function preloadForIntent(target) {
  if (!(target instanceof Element)) return;
  if (target.closest("#me-tab")) warmView(preloadMePageInApp);
  if (target.closest("#messages-tab")) {
    warmView(preloadMessagesPageInApp);
    warmView(preloadSessionChatSheet);
  }
  if (target.closest("#my-sessions-tab")) warmView(preloadMySessionsPageInApp);
  if (target.closest("#create-session-tab")) warmView(preloadCreateSessionSheet);
  if (target.closest("#filter-sheet-open")) warmView(preloadFilterSheet);
  if (target.closest("#player-directory-open")) {
    warmView(preloadPlayerDirectorySheet);
    warmView(preloadPlayerCardSheet);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("pointerover", (event) => preloadForIntent(event.target), { passive: true });
  document.addEventListener("focusin", (event) => preloadForIntent(event.target));
}

export { taipeiLocalDateTimeToIso } from "./taipeiTime.js";

const drawerFocusIntents = new WeakMap();
const drawerLoadingFocusFallbacks = new WeakSet();
const drawerScrollPositions = new WeakMap();
const DRAWER_TOGGLE_FOCUS = "__drawer-toggle__";
const DRAWER_CLOSE_FOCUS = "__drawer-close__";
const DRAWER_ACTION_FOCUS_PREFIX = "__drawer-action__:";
const DRAWER_ACTION_IDS = new Set([
  "discovery-reset",
  "drawer-map-retry",
  "discovery-expand",
  "discovery-subscribe",
  "discovery-first",
]);

export const PROFILE_PUBLIC_DISCLOSURE =
  "開球局後，這個暱稱與你的 NTRP 會顯示給瀏覽該球局的人；加入球局後，主揪與已接受球友可使用球局群組聊天。";

/** 全站唯一一份 NTRP 說明,個人檔案與建局表單共用;兩處不可各寫一份。 */
export const NTRP_SCALE_EXPLANATION =
  "NTRP 是網球程度自評分級：1.0 初學、2.5 能來回對打、3.5 能穩定控球、4.5 以上具比賽水準。";

/** Mount or update the React account and service skeleton for the Me destination. */
export function renderMePage(root, options = {}) {
  if (!renderMePageInApp) throw new Error("MePage browser mount is unavailable.");
  const authSession = options.authSession ?? null;
  if (authSession) preloadAuthenticatedViews();
  setMySessionActionScope(root, authSession?.user?.id ?? null);
  renderMePageInApp(root, options, () => {
    setMySessionActionScope(
      root,
      options.sessionStore?.getState?.().authSession?.user?.id ?? authSession?.user?.id ?? null
    );
    syncPendingMySessionActions(root);
  });
}

// 新球局不再提供「對拉」（它的語意併入「練球」）。編輯仍須接受四值：DB 的 CHECK 沒變，
// 既有的對拉球局若在這裡被擋下，主揪連改時間都存不回去。
const CREATE_PLAY_TYPES = new Set(["單打", "雙打", "練球"]);
const EDIT_PLAY_TYPES = new Set(["單打", "雙打", "對拉", "練球"]);
const NOW_START_CREATE_GRACE_MS = 5 * 60 * 1000;

function ntrpEndpoint(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 7 && Number.isInteger(number * 2) ? number : null;
}

/** Validate the form before it crosses the data API boundary. */
export function validateCreateSessionInput(input = {}, { now = new Date() } = {}) {
  const errors = {};
  const venueType = String(input.venueType ?? "booked");
  const courtIdValue = Number(input.courtId);
  const courtId = Number.isSafeInteger(courtIdValue) && courtIdValue > 0 ? courtIdValue : null;
  const candidateInputs =
    input.candidateCourtIds instanceof Set
      ? [...input.candidateCourtIds]
      : Array.isArray(input.candidateCourtIds)
        ? input.candidateCourtIds
        : input.candidateCourtIds == null || input.candidateCourtIds === ""
          ? []
          : [input.candidateCourtIds];
  const candidateCourtIds = candidateInputs.map(Number);
  const joinMode = String(input.joinMode ?? "instant");
  const playType = String(input.playType ?? "");
  const slotsTotal = Number(input.slotsTotal);
  const notes = String(input.notes ?? "");
  const feeNote = String(input.feeNote ?? "");
  const startAt = taipeiLocalDateTimeToIso(input.startAtLocal);
  const rangeEndInput = String(input.rangeEndLocal ?? "");
  const rangeEnd = rangeEndInput ? taipeiLocalDateTimeToIso(rangeEndInput) : null;
  const minText = String(input.ntrpMin ?? "").trim();
  const maxText = String(input.ntrpMax ?? "").trim();
  const hasRange = Boolean(minText || maxText);
  const ntrpMin = minText ? ntrpEndpoint(minText) : null;
  const ntrpMax = maxText ? ntrpEndpoint(maxText) : null;

  if (venueType !== "candidates" && courtId == null) errors.courtId = "請選擇台北市球場。";
  if (!["booked", "walk_on", "candidates"].includes(venueType)) errors.venueType = "請選擇場地類型。";
  if (venueType === "candidates") {
    const candidateIdsAreValid = candidateCourtIds.every((id) => Number.isSafeInteger(id) && id > 0);
    if (!candidateIdsAreValid || candidateCourtIds.length < 2 || candidateCourtIds.length > 3) {
      errors.candidateCourtIds = "候選局請選擇 2 到 3 座台北市球場。";
    } else if (new Set(candidateCourtIds).size !== candidateCourtIds.length) {
      errors.candidateCourtIds = "候選球場不可重複。";
    }
    if (!rangeEnd || !startAt || new Date(rangeEnd).getTime() <= new Date(startAt).getTime()) {
      errors.rangeEndLocal = "範圍結束時間必須晚於範圍起點。";
    }
  } else {
    if (candidateCourtIds.length) errors.candidateCourtIds = "候選球場只有候選局可以填寫。";
    if (rangeEndInput) errors.rangeEndLocal = "範圍結束時間只有候選局可以填寫。";
  }
  if (!["approval", "instant"].includes(joinMode)) errors.joinMode = "請選擇加入方式。";
  if (!CREATE_PLAY_TYPES.has(playType)) errors.playType = "請選擇一種打法。";
  if (!Number.isInteger(slotsTotal) || slotsTotal < 1 || slotsTotal > 3) errors.slotsTotal = "缺額請填 1 到 3 位。";
  if (!startAt || new Date(startAt).getTime() < new Date(now).getTime() - NOW_START_CREATE_GRACE_MS) {
    errors.startAtLocal = "開始時間不可早於現在 5 分鐘。";
  }
  if (notes.length > 500) errors.notes = "備註最多 500 字。";
  if (feeNote.length > 500) errors.feeNote = "費用說明最多 500 字。";
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
      candidateCourtIds: venueType === "candidates" ? candidateCourtIds : null,
      courtId: venueType === "candidates" ? null : courtId,
      feeNote: feeNote.trim() || null,
      joinMode,
      ntrpMax: hasRange ? ntrpMax : null,
      ntrpMin: hasRange ? ntrpMin : null,
      notes: notes.trim() || null,
      playType,
      rangeEnd: venueType === "candidates" ? rangeEnd : null,
      slotsTotal,
      startAt,
      venueType,
    },
  };
}

/** Validate only the fields accepted by update_session. */
export function validateUpdateSessionInput(input = {}, { now = new Date() } = {}) {
  const errors = {};
  const courtIdValue = Number(input.courtId);
  const courtId = Number.isSafeInteger(courtIdValue) && courtIdValue > 0 ? courtIdValue : null;
  const feeNote = String(input.feeNote ?? "");
  const notes = String(input.notes ?? "");
  const minText = String(input.ntrpMin ?? "").trim();
  const maxText = String(input.ntrpMax ?? "").trim();
  const hasRange = Boolean(minText || maxText);
  const ntrpMin = minText ? ntrpEndpoint(minText) : null;
  const ntrpMax = maxText ? ntrpEndpoint(maxText) : null;
  const playType = String(input.playType ?? "");
  const slotsMissing = Number(input.slotsMissing);
  const startAt = taipeiLocalDateTimeToIso(input.startAtLocal);

  if (courtId == null) errors.courtId = "請選擇台北市球場。";
  if (!EDIT_PLAY_TYPES.has(playType)) errors.playType = "請選擇一種打法。";
  if (!Number.isInteger(slotsMissing) || slotsMissing < 1 || slotsMissing > 3)
    errors.slotsMissing = "缺額請填 1 到 3 位。";
  if (!startAt || new Date(startAt).getTime() < new Date(now).getTime() - NOW_START_CREATE_GRACE_MS) {
    errors.startAtLocal = "開始時間不可早於現在 5 分鐘。";
  }
  if (notes.length > 500) errors.notes = "備註最多 500 字。";
  if (feeNote.length > 500) errors.feeNote = "費用說明最多 500 字。";
  if (hasRange && (!ntrpMin || !ntrpMax)) {
    if (!ntrpMin) errors.ntrpMin = "NTRP 請填 1.0 到 7.0，並以 0.5 為間距。";
    if (!ntrpMax) errors.ntrpMax = "NTRP 請填 1.0 到 7.0，並以 0.5 為間距。";
  }
  if (ntrpMin != null && ntrpMax != null && ntrpMin > ntrpMax) errors.ntrpMax = "最高程度不可小於最低程度。";

  return {
    errors,
    valid: Object.keys(errors).length === 0,
    value: {
      courtId,
      feeNote: feeNote.trim() || null,
      notes: notes.trim() || null,
      ntrpMax: hasRange ? ntrpMax : null,
      ntrpMin: hasRange ? ntrpMin : null,
      playType,
      slotsMissing,
      startAt,
    },
  };
}

// 「目前開著的抽屜面板」查詢:collapsed 時 section 帶 hidden,回傳 null;
// v2 兩態下 open 就是唯一的開啟狀態,判準是 hidden 屬性。
function activeDrawerPanel(root) {
  const panel = root.querySelector("#nearby-sessions-list");
  return panel && !panel.hidden ? panel : null;
}

// Batch 18 deliberately overturns Batch 8's redraw-parity decision: an open
// drawer keeps its reading position across the 60-second quiet refresh. A
// collapsed redraw must not replace the last useful position with zero.
function rememberDrawerScrollTop(root) {
  const panel = activeDrawerPanel(root);
  if (panel?.dataset.drawerState !== "open") return;
  const scroll = panel.querySelector(".nearby-drawer__scroll");
  if (!(scroll instanceof HTMLElement) || scroll.clientHeight === 0) return;
  drawerScrollPositions.set(root, scroll.scrollTop);
}

function restoreDrawerScrollTop(root, drawerState) {
  if (drawerState !== "open" || !drawerScrollPositions.has(root)) return;
  const savedScrollTop = drawerScrollPositions.get(root);
  requestAnimationFrame(() => {
    const scroll = activeDrawerPanel(root)?.querySelector(".nearby-drawer__scroll");
    if (!(scroll instanceof HTMLElement)) return;
    const maxScrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    scroll.scrollTop = Math.min(savedScrollTop, maxScrollTop);
  });
}

function rememberFocusedSessionCard(root) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return;
  if (active.matches("#nearby-sessions-toggle")) {
    setDrawerFocusIntent(root, DRAWER_TOGGLE_FOCUS);
    return;
  }
  if (active.matches("[data-nearby-close], [data-testid='drawer-collapse']")) {
    // The loading fallback is only a temporary reachable target. Preserve the
    // original card/action intent through the next authoritative rerender.
    // ✕ 與把手都收斂回同一個 DRAWER_CLOSE_FOCUS 意圖。
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
  const panel = activeDrawerPanel(root);
  if (!panel) return null;
  return (
    panel.querySelector("#drawer-map-retry") ??
    panel.querySelector("[data-session-id]") ??
    panel.querySelector("#discovery-expand") ??
    panel.querySelector("#discovery-subscribe") ??
    panel.querySelector("#discovery-reset") ??
    panel.querySelector("#discovery-first")
  );
}

function focusDrawerLoadingFallback(root) {
  const panel = activeDrawerPanel(root);
  // full 有「×」關閉鈕;half 沒有,退而求其次用「收合」鈕;兩者都沒有(理論上不會發生,
  // 面板都開著卻連 toggle 都找不到)才退到抽屜自己的摘要條。
  const target =
    panel?.querySelector("[data-nearby-close]") ??
    panel?.querySelector("[data-testid='drawer-collapse']") ??
    root.querySelector("#nearby-sessions-toggle");
  if (!target) return;
  drawerLoadingFocusFallbacks.add(root);
  target.focus({ preventScroll: true });
}

function restoreFocusedSessionCard(root) {
  if (!drawerFocusIntents.get(root)) return;
  requestAnimationFrame(() => {
    const focusIntent = drawerFocusIntents.get(root);
    if (!focusIntent) return;
    const active = document.activeElement;
    const hasNewSurface = Boolean(document.querySelector("#sheet-root .surface, #modal-root .surface"));
    const activeIsHiddenDrawerControl =
      active instanceof HTMLElement && root.contains(active) && Boolean(active.closest("[hidden]"));
    const activeIsLoadingFallback =
      drawerLoadingFocusFallbacks.has(root) &&
      active instanceof HTMLElement &&
      active.matches("[data-nearby-close], [data-testid='drawer-collapse']");
    if (
      hasNewSurface ||
      (active?.isConnected &&
        active !== document.body &&
        active !== document.documentElement &&
        !activeIsHiddenDrawerControl &&
        !activeIsLoadingFallback)
    )
      return;
    const toggle = root.querySelector("#nearby-sessions-toggle");
    if (focusIntent === DRAWER_TOGGLE_FOCUS) {
      if (toggle?.getAttribute("aria-expanded") === "false") {
        clearDrawerFocusIntent(root);
        toggle.focus({ preventScroll: true });
      } else if (toggle?.getAttribute("aria-expanded") === "true") {
        // v2:peek 在開啟後隱藏,開啟者的焦點交棒給抽屜的「✕」。非 modal 不設
        // trap,但鍵盤動線必須跟著進到新揭示的面板,不能落在 body。
        clearDrawerFocusIntent(root);
        activeDrawerPanel(root)?.querySelector("[data-nearby-close]")?.focus({ preventScroll: true });
      }
      return;
    }
    const panel = activeDrawerPanel(root);
    if (!panel) {
      clearDrawerFocusIntent(root);
      return;
    }
    if (focusIntent === DRAWER_CLOSE_FOCUS) {
      clearDrawerFocusIntent(root);
      (panel.querySelector("[data-nearby-close]") ?? panel.querySelector("[data-testid='drawer-collapse']"))?.focus({
        preventScroll: true,
      });
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

function scheduleMySessionsCreatedFocus(root, options = {}) {
  const {
    createdSessionId = null,
    groups = { history: [], needsAction: [], needsActionCount: 0, upcoming: [] },
    highlightSessionId = null,
    onCreatedSessionFocus = () => true,
  } = options;
  const needsAction = Array.isArray(groups.needsAction) ? groups.needsAction : [];
  const upcoming = Array.isArray(groups.upcoming) ? groups.upcoming : [];
  const focusSessionId = highlightSessionId ?? createdSessionId;
  // 批 C3-3:聚焦目標可能落在兩個互斥的清單之一——accepted(instant 加入／host
  // 自己)在 upcoming,走 SessionCard 的「查看球局」鈕;仍在等主揪審核的三種
  // outcome(approval／NTRP 缺／範圍外)在 needsAction 的 guest-request,走
  // GuestRequestCard 的「撤回申請」鈕(卡片內唯一可聚焦元素)。同一個 sessionId
  // 只會出現在其中一個群組,兩個 selector 用逗號並列,只有比對得上的那張卡會真的
  // 帶有 data-created-session。批 D6:這裡查的 needsAction/upcoming 是未過濾的
  // 完整 groups(不是 active.*)——resolveMySessionsSegment 已保證聚焦目標所在的
  // segment 就是 activeSegment,DOM 裡一定找得到,不需要重新過濾一次。
  const focusInUpcoming = upcoming.some((session) => String(session.sessionId) === String(focusSessionId));
  const focusInNeedsAction = needsAction.some(
    (entry) => entry.kind === "guest-request" && String(entry.session.sessionId) === String(focusSessionId)
  );
  if (focusSessionId && (focusInUpcoming || focusInNeedsAction)) {
    requestAnimationFrame(() => {
      const target = root.querySelector(
        "[data-created-session] [data-open-my-session], [data-created-session] [data-my-action='withdraw']"
      );
      if (!target || !onCreatedSessionFocus(focusSessionId)) return;
      target.focus({ preventScroll: true });
    });
  }
}

/** Mount or update the private, action-first My Sessions destination. */
export function renderMySessionsPage(root, options = {}) {
  if (!renderMySessionsPageInApp) throw new Error("MySessionsPage browser mount is unavailable.");
  setMySessionActionScope(root, options.actionScopeKey ?? null);
  renderMySessionsPageInApp(
    root,
    {
      ...options,
      onCreatedSessionCommit: (commit) => scheduleMySessionsCreatedFocus(root, { ...options, ...commit }),
    },
    () => {
      setMySessionActionScope(root, options.sessionStore?.getState?.().authEpoch ?? options.actionScopeKey ?? null);
      syncPendingMySessionActions(root);
    }
  );
}

/** Render the map-bound peek strip and its two-state (collapsed/open) drawer. */
export function renderNearbySessionsDrawer(
  root,
  {
    sessions = [],
    courts = [],
    drawerState = "collapsed",
    hasUserLocation = false,
    mapStatus = { kind: "idle", message: "" },
    filters = null,
    authenticated = false, // eslint-disable-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
    onToggle = () => {},
    onOpenSession = () => {},
    onReset = () => {},
    onExpandBounds = () => {},
    onOpenCreate = () => {},
    onRetry = () => {},
    onSubscribe = () => {},
    sessionStore,
  } = {}
) {
  rememberFocusedSessionCard(root);
  rememberDrawerScrollTop(root);
  if (!renderNearbySessionsDrawerInApp) throw new Error("NearbySessionsDrawer browser mount is unavailable.");
  renderNearbySessionsDrawerInApp(
    root,
    {
      courts,
      drawerState,
      filters,
      hasUserLocation,
      mapStatus,
      onBeforeStoreChange: () => {
        rememberFocusedSessionCard(root);
        rememberDrawerScrollTop(root);
      },
      onExpandBounds,
      onOpenCreate,
      onOpenSession,
      onReset,
      onRetry,
      onSubscribe,
      onToggle,
      sessions,
      sessionStore,
    },
    () => {
      const currentDrawerState = sessionStore?.getState?.().drawerState ?? drawerState;
      // Register focus first and scroll second. Both callbacks run after the
      // synchronous commit, so any focus-induced browser scroll is corrected last.
      restoreFocusedSessionCard(root);
      restoreDrawerScrollTop(root, currentDrawerState);
    }
  );
}

/** Open the accepted-member chat with an event-driven, authority-refreshed feed. */
export function openSessionChatSheet(
  session,
  {
    canWithdraw = false,
    courts = [],
    onBlock = () => {},
    onClose = () => {},
    onPost = () => {},
    onReport = () => {},
    onWithdraw = () => {},
  } = {}
) {
  if (!mountSessionChatSheetContent) {
    return deferSurfaceOpen({
      id: "session-chat-sheet",
      label: "球局群組聊天",
      className: "session-chat-sheet",
      load: preloadSessionChatSheet,
      methods: ["setArchived", "setState"],
      onClose,
      open: () =>
        openSessionChatSheet(session, { canWithdraw, courts, onBlock, onClose, onPost, onReport, onWithdraw }),
    });
  }
  let archived = ["cancelled", "expired", "played"].includes(String(session?.status).toLowerCase());
  const venue = sessionVenuePresentation(session, courts);
  // 批 D7:header 副行沿用抽取規格 §4 chatSub 語意(今天/明天/週X + 時刻 + 主揪
  // X/我),與既有 .chat-session-summary(下方保留,aria-label="球局資訊",供
  // 候選局/已定案文案等既有測試斷言)分工——前者是新視覺標題,後者是既有資訊卡。
  const headerSub = sessionScheduleLabel(session);
  const mounted = mountSheet({
    id: "session-chat-sheet",
    label: "球局群組聊天",
    className: "session-chat-sheet",
    onClose,
    html: "",
  });
  const content = mountSessionChatSheetContent(mounted.surface, {
    archived,
    canWithdraw,
    headerSub,
    onClose: () => mounted.close(),
    onFeedClick: (event) => handleFeedClick(event),
    playType: String(session.playType),
    venueBadge: venue.badge,
    venueCourt: venue.court,
    venueTime: venue.time,
  });
  mounted.registerUnmount(content.unmount);
  const feed = mounted.root.querySelector("[data-chat-feed]");
  const loading = mounted.root.querySelector("[data-chat-loading]");
  const error = mounted.root.querySelector("[data-chat-error]");
  const input = mounted.root.querySelector("[data-testid='chat-message-input']");
  const send = mounted.root.querySelector("[data-testid='chat-send']");
  const announcement = mounted.root.querySelector("[data-chat-announcement]");
  let feedInitialized = false;
  let knownMessageIds = new Set();
  let scrollRequestId = 0;

  function scrollFeedToLatest() {
    const requestId = ++scrollRequestId;
    const scroll = () => {
      if (requestId !== scrollRequestId || !mounted.root.contains(feed)) return;
      feed.scrollTop = feed.scrollHeight;
    };
    scroll();
    requestAnimationFrame(() => {
      scroll();
      requestAnimationFrame(scroll);
    });
  }

  function setArchived(message = "") {
    archived = true;
    // Keep React's DOM ownership coherent: the withdraw button is conditional
    // React output, so the archived transition must remove it through a render.
    // Imperatively detaching it makes a later root.unmount() call removeChild on
    // an already-removed node (the batch-20 archived-chat close regression).
    content.setArchived();
    if (message) {
      error.textContent = message;
      error.hidden = false;
      error.focus({ preventScroll: true });
    }
    scrollFeedToLatest();
  }

  function setState({ errorMessage = "", messages = [], roster: participants = [], status = "ready" } = {}) {
    const safeMessages = Array.isArray(messages) ? messages : [];
    loading.hidden = status !== "loading";
    if (status === "loading") loading.textContent = "正在讀取群組訊息…";
    error.textContent = errorMessage;
    error.hidden = !errorMessage;
    // 背景輪詢會週期重繪 feed:只有在使用者本來就貼近底部時才跟捲到底,回看歷史時
    // 保留原捲動位置(React 以 generation key 重建全部訊息節點,與舊 innerHTML 置換
    // 一樣會歸零 scrollTop,必須先量後還原)。
    const nearBottom = !feedInitialized || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
    const previousScrollTop = feed.scrollTop;
    content.setContent(participants, safeMessages);
    if (nearBottom) scrollFeedToLatest();
    else feed.scrollTop = previousScrollTop;
    if (status === "ready") {
      const nextMessageIds = new Set(safeMessages.map((message) => String(message?.messageId ?? "")).filter(Boolean));
      const newMessageCount = feedInitialized
        ? [...nextMessageIds].filter((messageId) => !knownMessageIds.has(messageId)).length
        : 0;
      announcement.textContent = newMessageCount ? `新增 ${newMessageCount} 則訊息` : "";
      knownMessageIds = nextMessageIds;
      feedInitialized = true;
    }
  }

  mounted.root.querySelector("[data-chat-composer]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (archived || send.disabled) return;
    const body = String(input.value ?? "").trim();
    error.hidden = true;
    if (!body || body.length > 1000) {
      error.textContent = "請輸入 1 至 1000 字的純文字訊息。";
      error.hidden = false;
      return;
    }
    await runAsyncAction({
      root: mounted.root,
      callback: () => onPost(body),
      controls: [send, input],
      error,
      clearError: false,
      errorMessage: "訊息暫時無法傳送，請稍後再試。",
      errorFocus: true,
      onSuccess: () => {
        input.value = "";
      },
      canRestoreControls: () => !archived,
    });
  });
  // 委派語意不變:onClick 宣告在 [data-chat-feed] 上(React 18 的原生 listener 掛在
  // createRoot 容器,feed 與容器之間無 stopPropagation),訊息節點被 generation key
  // 重建也不需要重新綁定,`event.target.closest()` 的判準與舊 addEventListener 版
  // 逐字相同。
  const handleFeedClick = (event) => {
    const reportButton = event.target.closest("[data-chat-report]");
    const blockButton = event.target.closest("[data-chat-block]");
    if (reportButton)
      void Promise.resolve()
        .then(() => onReport(reportButton.dataset.chatReport))
        .catch((reportError) => {
          error.textContent = reportError?.message || "目前無法開啟檢舉。";
          error.hidden = false;
        });
    if (blockButton)
      void Promise.resolve(onBlock(blockButton.dataset.chatBlock)).catch((blockError) => {
        error.textContent = blockError?.message || "封鎖設定暫時無法更新，請稍後再試。";
        error.hidden = false;
      });
  };
  mounted.root.querySelector("[data-chat-withdraw]")?.addEventListener("click", () => {
    onWithdraw();
  });

  return { ...mounted, setArchived, setState };
}

/** Mount or update the React CHATS destination without changing its public adapter. */
export function renderMessagesPage(root, options = {}) {
  if (!renderMessagesPageInApp) throw new Error("MessagesPage browser mount is unavailable.");
  renderMessagesPageInApp(root, options);
}

/**
 * Open a public session detail sheet with the privacy-reviewed field order.
 *
 * 批 C3-2:join 旅程單層化。動作區是就地切換的四態狀態機
 * (idle/confirming/submitting/success/error,容器帶 `data-join-stage`),不再開
 * 第二層 join confirmation dialog——舊的獨立確認 dialog 函式已整支退役。
 *
 * 批 D4b:視覺改 v2 計分板殼(dc L333-426),join 五態狀態機、資料契約與全部
 * data-testid 不動;canDecide 的「定案」動作搬進候選定案面板(渲染在
 * `.session-detail__actions` 之外,不隨五態重繪)。新增 isMine 參數(頭部
 * 「我主揪的」badge 與候選資訊列的 guest-only 條件用)。
 */
export function openSessionSheet(
  session,
  {
    action,
    canDecide = false,
    canEdit = false,
    canChat = false,
    canReport = false,
    isMine = false,
    showJoinPreview = false,
    courts = [],
    notificationSettings = {},
    initialStage = "idle",
    onCopyLink = () => {},
    onDecide = () => {},
    onEdit = () => {},
    onChat = () => {},
    onPrimary = () => {},
    onConfirmJoin = async () => ({}),
    onEnablePush = () => {},
    onViewMySessions = () => {},
    onReport = () => {},
    onWithdraw = () => {},
    onClose = () => {},
  } = {}
) {
  if (!mountSessionDetailSheetContent) throw new Error("SessionDetailSheet browser mount is unavailable.");
  const venue = sessionVenuePresentation(session, courts);
  let content = null;

  const mounted = mountSheet({
    id: "session-sheet",
    label: "球局詳情",
    className: "session-detail-sheet",
    onClose,
    onEscape: () => {
      // 假設 1(design spec):confirming 態 Escape 先退一步回 idle,sheet 不關;
      // 其餘四態(idle/submitting/success/error)交回 mountSheet 現行關閉語意。
      return content?.handleEscape() ?? false;
    },
    html: `
      <span class="session-detail-sheet__grabber"></span>
      <div class="session-detail"></div>`,
  });

  const contentRoot = mounted.root.querySelector(".session-detail");
  content = mountSessionDetailSheetContent(
    contentRoot,
    {
      action,
      canChat,
      canDecide,
      canEdit,
      canReport,
      courts,
      isMine,
      notificationSettings,
      session,
      showJoinPreview,
      venue,
    },
    {
      expectedAccepted: Boolean(action?.expectedAccepted),
      joinPreview: { participants: [], status: "loading" },
      message: "",
      stage: initialStage,
    },
    {
      onChat,
      onCloseSurface: () => mounted.close(),
      onConfirmJoin,
      onCopyLink,
      onDecide,
      onEdit,
      onEnablePush,
      onPrimary,
      onReport,
      onViewMySessions: (sessionId) => {
        mounted.close({ reason: "view-my-sessions", restoreFocus: false });
        onViewMySessions(sessionId);
      },
      onWithdraw,
    }
  );
  mounted.registerUnmount(content.unmount);
  const setJoinPreview = (state) => {
    if (content.isSurfaceRootLive()) content.setJoinPreview(state);
  };

  function enterConfirming({ expectedAccepted } = {}) {
    content.enterConfirming(expectedAccepted === undefined ? undefined : Boolean(expectedAccepted));
  }

  return { ...mounted, setJoinPreview, enterConfirming };
}

/** Explain a public deep link that no longer resolves to an available session. */
export function openSessionUnavailableSheet() {
  if (!mountSessionUnavailableSheetContent) {
    return deferSurfaceOpen({
      id: "session-unavailable-sheet",
      label: "找不到球局",
      load: preloadSessionUnavailableSheet,
      open: () => openSessionUnavailableSheet(),
    });
  }
  const mounted = mountSheet({
    id: "session-unavailable-sheet",
    label: "找不到球局",
    html: "",
  });
  const content = mountSessionUnavailableSheetContent(mounted.surface, () => mounted.close());
  mounted.registerUnmount(content.unmount);
  return mounted;
}

/** Require an explicit in-project warning before a member exits a session. */
export function openWithdrawSessionConfirmation({ onClose = () => {}, onConfirm = async () => {} } = {}) {
  if (!mountWithdrawSessionConfirmationDialogContent) {
    return deferSurfaceOpen({
      id: "withdraw-session-confirmation",
      label: "確認退出這一局？",
      load: preloadWithdrawSessionConfirmationDialog,
      onClose,
      open: () => openWithdrawSessionConfirmation({ onClose, onConfirm }),
      type: "dialog",
    });
  }
  const mounted = mountDialog({
    id: "withdraw-session-confirmation",
    label: "確認退出這一局？",
    onClose,
    html: "",
  });
  // mountDialog 建殼時內容還空著,綁不到 [data-surface-close];× 與「先不要」改由 React
  // onClick 呼叫同一個 mounted.close()。等價性見批 8.1:HEAD 的 listener 收到 MouseEvent,
  // close({ reason = "dismiss", restoreFocus = true } = {}) 解構它拿到的就是兩個預設值。
  const content = mountWithdrawSessionConfirmationDialogContent(mounted.surface, {
    onClose: () => mounted.close(),
  });
  mounted.registerUnmount(content.unmount);
  const confirmButton = mounted.root.querySelector("[data-confirm-withdraw]");
  const error = mounted.root.querySelector("[data-withdraw-error]");
  let submitting = false;
  confirmButton?.addEventListener("click", async () => {
    if (submitting) return;
    submitting = true;
    await runAsyncAction({
      root: mounted.root,
      callback: async () => {
        await onConfirm();
        mounted.close({ reason: "complete" });
      },
      controls: [confirmButton],
      error,
      errorMessage: "退出球局暫時無法完成，請稍後再試。",
      onFinally: ({ controlsRestored }) => {
        if (controlsRestored) submitting = false;
      },
    });
  });
  return mounted;
}

/** Collect a minimal, reviewable report without exposing any new profile data. */
export function openReportDialog({ targetLabel = "這個項目", onClose = () => {}, onSubmit = () => {} } = {}) {
  if (!mountReportDialogContent) {
    return deferSurfaceOpen({
      id: "report-dialog",
      label: "檢舉",
      load: preloadReportDialog,
      onClose,
      open: () => openReportDialog({ targetLabel, onClose, onSubmit }),
      type: "dialog",
    });
  }
  const mounted = mountDialog({
    id: "report-dialog",
    label: "檢舉",
    onClose,
    html: "",
  });
  // targetLabel 沿用 esc() 的 String() 語意(React 自己負責 escape);× 的 close 走
  // React onClick,理由同 openWithdrawSessionConfirmation。
  const content = mountReportDialogContent(mounted.surface, {
    onClose: () => mounted.close(),
    targetLabel: String(targetLabel),
  });
  mounted.registerUnmount(content.unmount);
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
    await runAsyncAction({
      root: mounted.root,
      callback: () => onSubmit(reason),
      controls: [submit],
      error,
      errorMessage: "檢舉暫時無法送出，請稍後再試。",
      onSuccess: () => {
        form.hidden = true;
        success.hidden = false;
        success.focus({ preventScroll: true });
      },
      canRestoreControls: () => !form.hidden,
      onFinally: ({ controlsRestored }) => {
        if (controlsRestored) submitting = false;
      },
    });
  });
  return mounted;
}

// 個人檔案的「常打類型」維持四值：既有使用者已勾選的「對拉」不該因為建局表單收斂而消失。
const PROFILE_PLAY_TYPES = ["單打", "雙打", "對拉", "練球"];
// 建局表單只提供三種；「對拉」的語意由「練球」涵蓋。
const CREATE_SESSION_PLAY_TYPES = ["單打", "雙打", "練球"];
const PLAY_TYPE_HINT = "單打｜一對一。雙打｜二對二。練球｜餵球、對拉、發球等不計分的練習。";

function selectedValues(form, name) {
  return new Set([...form.querySelectorAll(`[name="${name}"]:checked`)].map((input) => input.value));
}

function profileFormValue(form, fallbackProfile = {}, fallbackCourts = new Set()) {
  const courtInputs = form.querySelectorAll("[name='profile-courts']");
  const courts = courtInputs.length ? selectedValues(form, "profile-courts") : new Set(fallbackCourts);
  const nicknameInput = form.querySelector("[name='profile-nickname']");
  const ntrpInput = form.querySelector("[name='profile-ntrp']");
  const ntrpValue = ntrpInput?.value.trim();
  const typeInputs = form.querySelectorAll("[name='profile-types']");
  const slotInputs = form.querySelectorAll("[name='profile-slots']");
  return {
    courts,
    nick: nicknameInput ? nicknameInput.value.trim() : String(fallbackProfile.nick ?? "").trim(),
    ntrp: ntrpInput ? (ntrpValue === "" ? null : Number(ntrpValue)) : (fallbackProfile.ntrp ?? null),
    slots: slotInputs.length ? selectedValues(form, "profile-slots") : new Set(fallbackProfile.slots ?? []),
    types: typeInputs.length ? selectedValues(form, "profile-types") : new Set(fallbackProfile.types ?? []),
  };
}

function profileGateForIntent(intent) {
  if (["create", "players", "presence"].includes(intent?.action)) return "ntrp";
  if (["directory", "visibility"].includes(intent?.action)) return "directory";
  return "nickname";
}

function profileGateHint(gate, intent = null) {
  if (gate === "ntrp" && intent?.action === "presence") {
    return "要調整在線設定，請填寫公開暱稱與 NTRP（1.0–7.0）。";
  }
  if (gate === "ntrp" && intent?.action === "players") {
    return "要查看在線球友，請填寫公開暱稱與 NTRP（1.0–7.0）。";
  }
  if (gate === "ntrp") return "要開球局，請填寫公開暱稱與 NTRP（1.0–7.0）。";
  if (gate === "directory")
    return "要使用球友目錄或公開球友卡，請填寫公開暱稱、NTRP（1.0–7.0），並選擇至少一座台北市常打球場。";
  return "要加入球局，請填寫公開暱稱。";
}

function validateProfileForm(profile, requiredGate, intent = null) {
  if (!profile.nick) return "請填寫公開暱稱。";
  if (profile.ntrp != null && !validProfileNtrp(profile.ntrp)) {
    return "NTRP 請填寫 1.0 到 7.0，或留白。";
  }
  if (profile.ntrp != null && !Number.isInteger(Number(profile.ntrp) * 10)) {
    return "NTRP 最多一位小數，或留白。";
  }
  if (requiredGate === "ntrp" && !validProfileNtrp(profile.ntrp)) return profileGateHint("ntrp", intent);
  if (requiredGate === "directory" && (!validProfileNtrp(profile.ntrp) || !profile.courts.size))
    return profileGateHint("directory");
  return "";
}

/** Open the private profile-completion sheet without leaking profile fields to public renderers. */
export function openProfileCompletionSheet({
  avatarUrl = "",
  courts = [],
  courtsReady = true,
  onClose = () => {},
  onSave = async () => {},
  onSaved = async () => {},
  intent = null,
  mode = "gate",
  profile = {},
  returnSession = null,
} = {}) {
  if (!mountProfileCompletionSheetContent) {
    return deferSurfaceOpen({
      id: "profile-completion-sheet",
      label: mode === "standalone" ? "編輯個人檔案" : "完成個人檔案",
      className: "profile-sheet",
      load: preloadProfileCompletionSheet,
      methods: ["setCourts"],
      onClose: (detail = {}) => onClose({ ...detail, saved: false }),
      open: () =>
        openProfileCompletionSheet({
          avatarUrl,
          courts,
          courtsReady,
          intent,
          mode,
          onClose,
          onSave,
          onSaved,
          profile,
          returnSession,
        }),
    });
  }
  // standalone 是「我」頁的常駐編輯入口：同一份表單與驗證，只是不帶 gate 的催促語氣。
  const standalone = mode === "standalone";
  const selectedCourts = profile.courts instanceof Set ? profile.courts : new Set(profile.courts ?? []);
  const selectedTypes = profile.types instanceof Set ? profile.types : new Set(profile.types ?? []);
  const selectedSlots = profile.slots instanceof Set ? profile.slots : new Set(profile.slots ?? []);
  const requiredGate = profileGateForIntent(intent);
  const gateHint = intent ? profileGateHint(requiredGate, intent) : "";
  const compactCreateGate = intent?.action === "create";
  const needsNickname = !String(profile.nick ?? "").trim();
  const needsNtrp = !validProfileNtrp(profile.ntrp);
  let saved = false;
  let saving = false;
  const mounted = mountSheet({
    id: "profile-completion-sheet",
    label: standalone ? "編輯個人檔案" : "完成個人檔案",
    className: "profile-sheet",
    onClose: (detail = {}) => onClose({ ...detail, saved }),
    html: "",
  });

  const content = mountProfileCompletionSheetContent(mounted.surface, {
    avatarUrl,
    compactCreateGate,
    courts,
    courtsReady: Boolean(courtsReady),
    disclosure: PROFILE_PUBLIC_DISCLOSURE,
    gateHintText: gateHint && !standalone ? gateHint : "",
    initialSelectedCourts: selectedCourts,
    nickname: String(profile.nick ?? ""),
    ntrpDefaultValue: String(profile.ntrp ?? ""),
    ntrpExplanation: NTRP_SCALE_EXPLANATION,
    onClose: () => mounted.close(),
    onSubmit: async ({ error, form, submit }) => {
      if (saving) return;
      const nextProfile = profileFormValue(form, profile, selectedCourts);
      const message = validateProfileForm(nextProfile, requiredGate, intent);
      if (message) {
        error.hidden = false;
        error.textContent = message;
        return;
      }
      saving = true;
      await runAsyncAction({
        root: mounted.root,
        callback: async () => {
          const savedProfile = await onSave(nextProfile);
          saved = true;
          mounted.close({ reason: "complete" });
          await onSaved(savedProfile ?? nextProfile);
        },
        controls: [submit],
        error,
        errorMessage: "個人檔案暫時無法儲存。",
        onFinally: ({ controlsRestored }) => {
          if (controlsRestored) saving = false;
        },
      });
    },
    playTypes: PROFILE_PLAY_TYPES,
    returnContextText:
      returnSession && !standalone
        ? `完成後將回到：${returnSession.court}・${taipeiDateTime(returnSession.startAt)}`
        : "",
    selectedSlots,
    selectedTypes,
    showNicknameField: !compactCreateGate || needsNickname,
    showNtrpField: !compactCreateGate || needsNtrp,
    slotOptions: PROFILE_SLOTS,
    standalone,
  });
  mounted.registerUnmount(content.unmount);

  const setCourts = (nextCourts, { ready = true } = {}) => {
    content.setCourts(nextCourts, { ready });
  };

  return { ...mounted, setCourts };
}

// ============================================================
// 批 D5(v2 改版):開球局改全螢幕計分板流程。dc 抽取規格(§0-8)逐字值見批次
// 派工單;此區塊只放 create 表單專用的純函式(可單元測試),DOM 組裝在
// openCreateSessionSheet 內。CREATE_NTRP_BANDS 與 D4a 篩選 BANDS(filters.js)
// 的 0/9 哨兵無關,兩者刻意不共用——建局表單的「不限」要落地成 ntrpMin/Max
// 皆 null(既有 validateCreateSessionInput 的「選填」語意),不是字面 1..7,
// 否則詳情頁與篩選會把「不限」誤顯示成「NTRP 1.0–7.0」。
const CREATE_DATE_CHIP_KEYS = ["today", "tomorrow", "sat", "sun"];
const CREATE_DATE_CHIP_WORDS = { today: "今天", tomorrow: "明天", sat: "週六", sun: "週日" };
const CREATE_TIME_PRESETS = ["06:30", "08:00", "09:00", "14:00", "17:00", "18:00", "19:00", "20:00", "21:00"];
const CREATE_TIME_MIN_MINUTES = 360; // 06:00(dc bumpTime 邊界)
const CREATE_TIME_MAX_MINUTES = 1320; // 22:00 — 抽取規格明白指出不是 21:45
const CREATE_TIME_CUSTOM_DEFAULT = "19:30";
export const CREATE_SLOT_OPTIONS = [
  { endHour: 10, key: "morning", label: "早上 06–10", startHour: 6 },
  { endHour: 17, key: "afternoon", label: "下午 14–17", startHour: 14 },
  { endHour: 22, key: "evening", label: "晚上 18–22", startHour: 18 },
];
export const CREATE_NTRP_BANDS = [
  { key: "any", label: "不限", max: null, min: null },
  { key: "lo", label: "≤ 3.0", max: 3, min: 1 },
  { key: "mid", label: "3.0–4.0", max: 4, min: 3 },
  { key: "hi", label: "4.0–5.0", max: 5, min: 4 },
  { key: "pro", label: "5.0 +", max: 7, min: 5 },
];

function freshCreateSessionForm() {
  return {
    band: "any", // dc 預設 mid 是原型假資料;「不限」才符合現行選填語意,回報標注
    booked: false,
    candCourts: {},
    court: null,
    customDate: "",
    dateKey: "today",
    feeNote: "",
    instant: true,
    mode: "fixed",
    need: 2,
    note: "",
    nowStart: false,
    slot: null,
    time: null,
    timeCustom: false,
    type: "雙打",
  };
}

/** venueType 由「已定球場／先列候選」segmented + 「已訂場」toggle 推導,單元測試覆蓋。 */
export function deriveCreateVenueType(mode, booked) {
  if (mode === "cand") return "candidates";
  return booked ? "booked" : "walk_on";
}

/** 建局專用 NTRP 區間映射;'any' 回傳 null/null(=不限,對映 validateCreateSessionInput 的選填語意)。 */
export function createNtrpRangeForBand(bandKey) {
  const band = CREATE_NTRP_BANDS.find((candidate) => candidate.key === bandKey) ?? CREATE_NTRP_BANDS[0];
  return { ntrpMax: band.max, ntrpMin: band.min };
}

/** 日期 chip 推導出的實際日期(週六/週日=下一個該星期日,今天即週六則同今天)。 */
export function createDateChipDate(key, now = new Date()) {
  const parts = taipeiParts(now);
  if (!parts) return now;
  const daysAhead = { sat: (6 - parts.weekday + 7) % 7, sun: (0 - parts.weekday + 7) % 7, today: 0, tomorrow: 1 }[key];
  return daysAhead == null ? now : new Date(now.getTime() + daysAhead * 86_400_000);
}

function createDateChipLabel(key, now = new Date()) {
  const word = CREATE_DATE_CHIP_WORDS[key];
  if (!word) return "自訂";
  const parts = taipeiParts(createDateChipDate(key, now));
  return parts ? `${word} ${padTwo(parts.month)}/${padTwo(parts.day)}` : word;
}

function taipeiDateValue(value, now = new Date()) {
  const parts = taipeiParts(value ?? now);
  return parts ? `${parts.year}-${padTwo(parts.month)}-${padTwo(parts.day)}` : "";
}

/** 表單目前選中的日期(YYYY-MM-DD,Taipei);'custom' 用使用者填的 customDate。 */
export function resolveCreateDateValue(form, now = new Date()) {
  if (form.dateKey === "custom") return form.customDate || "";
  return taipeiDateValue(createDateChipDate(form.dateKey, now), now);
}

/** ±15 分鐘 stepper,邊界 06:00–22:00(見抽取規格「找不到/需注意」)。 */
export function bumpCreateTimeMinutes(time, deltaMinutes) {
  const [hourText, minuteText] = String(time || CREATE_TIME_CUSTOM_DEFAULT).split(":");
  let minutes = Number(hourText) * 60 + Number(minuteText) + deltaMinutes;
  minutes = Math.max(CREATE_TIME_MIN_MINUTES, Math.min(CREATE_TIME_MAX_MINUTES, minutes));
  return `${padTwo(Math.floor(minutes / 60))}:${padTwo(minutes % 60)}`;
}

/** 已定模式:日期＋時間組成 datetime-local 字串,交給既有 validateCreateSessionInput。 */
export function createFixedStartAtLocal(form, now = new Date()) {
  const dateValue = resolveCreateDateValue(form, now);
  if (!dateValue || !form.time) return "";
  return `${dateValue}T${form.time}`;
}

/** 候選模式:日期＋時段起訖組成 startAtLocal/rangeEndLocal。 */
export function createCandidateWindowLocal(form, now = new Date()) {
  const dateValue = resolveCreateDateValue(form, now);
  const slot = CREATE_SLOT_OPTIONS.find((option) => option.key === form.slot);
  if (!dateValue || !slot) return { rangeEndLocal: "", startAtLocal: "" };
  return {
    rangeEndLocal: `${dateValue}T${padTwo(slot.endHour)}:00`,
    startAtLocal: `${dateValue}T${padTwo(slot.startHour)}:00`,
  };
}

/** 底鈕守門(dc canPublish,§7):候選=候選≥2＋時段已選;已定=球場＋時間已選。 */
export function createSessionFormCanPublish(form) {
  if (form.mode === "cand") {
    const count = Object.values(form.candCourts).filter(Boolean).length;
    return count >= 2 && Boolean(form.slot);
  }
  return Boolean(form.court) && Boolean(form.time);
}

/** 把表單狀態轉成 validateCreateSessionInput 吃的原始欄位(字串/陣列),不改動該函式本身的契約。 */
export function createSessionFormRawInput(form, now = new Date()) {
  const isCandidate = form.mode === "cand";
  const venueType = deriveCreateVenueType(form.mode, form.booked);
  const { ntrpMax, ntrpMin } = createNtrpRangeForBand(form.band);
  const candidateWindow = isCandidate ? createCandidateWindowLocal(form, now) : null;
  return {
    candidateCourtIds: isCandidate ? Object.keys(form.candCourts).filter((id) => form.candCourts[id]) : [],
    courtId: isCandidate ? "" : (form.court ?? ""),
    feeNote: form.feeNote,
    joinMode: form.instant ? "instant" : "approval",
    notes: form.note,
    ntrpMax: ntrpMax == null ? "" : String(ntrpMax),
    ntrpMin: ntrpMin == null ? "" : String(ntrpMin),
    playType: form.type,
    rangeEndLocal: isCandidate ? candidateWindow.rangeEndLocal : "",
    slotsTotal: String(form.need),
    startAtLocal: isCandidate ? candidateWindow.startAtLocal : createFixedStartAtLocal(form, now),
    venueType,
  };
}

function createSessionDonePresentation(value, result, courts) {
  const isCandidate = value.venueType === "candidates";
  const courtId = isCandidate ? value.candidateCourtIds?.[0] : value.courtId;
  const court = courts.find((candidate) => String(candidate.id) === String(courtId));
  return {
    court: court?.name ?? "球場待確認",
    date: taipeiTileDate(value.startAt),
    meta: isCandidate
      ? `候選 ${value.candidateCourtIds?.length ?? 0} 座球場・${court?.district ?? "台北市"}`
      : `${value.playType}・${court?.district ?? "台北市"}`,
    need: `缺 ${value.slotsTotal}`,
    sessionId: result?.sessionId ?? null,
    time: taipeiClock(value.startAt),
  };
}

/** Shared pure/runtime dependencies injected into the strict React form sheets. */
export const sessionFormSheetRuntime = Object.freeze({
  bumpCreateTimeMinutes,
  createCandidateWindowLocal,
  createFixedStartAtLocal,
  createSessionDonePresentation,
  createSessionFormCanPublish,
  taipeiClock,
  taipeiCourts,
  taipeiDateTimeLocalValue,
  taipeiDateValue,
});

/** 開球局全螢幕流程(批 D5):計分板視覺,含成功頁;大量複用 D1/D4 語彙。 */
export function openCreateSessionSheet({
  courts = [],
  courtsReady = true,
  onClose = () => {},
  onSubmit = async () => {},
  onViewMySessions = () => {},
  toast = () => {},
} = {}) {
  if (!mountCreateSessionSheetContent) {
    return deferSurfaceOpen({
      id: "session-create-modal",
      label: "開球局",
      className: "create-v2",
      load: preloadCreateSessionSheet,
      methods: ["setCourts"],
      onClose,
      open: () => openCreateSessionSheet({ courts, courtsReady, onClose, onSubmit, onViewMySessions, toast }),
    });
  }
  const now = () => new Date();
  let submitting = false;
  let content;
  const mounted = mountSheet({
    id: "session-create-modal",
    label: "開球局",
    className: "create-v2",
    onClose,
    html: "",
  });

  content = mountCreateSessionSheetContent(mounted.surface, {
    bumpTime: sessionFormSheetRuntime.bumpCreateTimeMinutes,
    canPublish: sessionFormSheetRuntime.createSessionFormCanPublish,
    candidateWindow: sessionFormSheetRuntime.createCandidateWindowLocal,
    clock: sessionFormSheetRuntime.taipeiClock,
    config: {
      bands: CREATE_NTRP_BANDS,
      dateChips: CREATE_DATE_CHIP_KEYS.map((key) => ({ key, label: createDateChipLabel(key, now()) })),
      ntrpExplanation: NTRP_SCALE_EXPLANATION,
      playTypeHint: PLAY_TYPE_HINT,
      playTypes: CREATE_SESSION_PLAY_TYPES,
      profileDisclosure: PROFILE_PUBLIC_DISCLOSURE,
      slotOptions: CREATE_SLOT_OPTIONS,
      timeCustomDefault: CREATE_TIME_CUSTOM_DEFAULT,
      timePresets: CREATE_TIME_PRESETS,
    },
    courts: sessionFormSheetRuntime.taipeiCourts(courts),
    courtsReady: Boolean(courtsReady),
    dateValueNow: (value) => sessionFormSheetRuntime.taipeiDateValue(value, value),
    donePresentation: sessionFormSheetRuntime.createSessionDonePresentation,
    fixedStartAt: sessionFormSheetRuntime.createFixedStartAtLocal,
    initialForm: freshCreateSessionForm(),
    now,
    onBackToMap: () => mounted.close(),
    onClose: () => mounted.close(),
    onSubmit: async (form, { error, submit }) => {
      if (submitting) return;
      if (!sessionFormSheetRuntime.createSessionFormCanPublish(form)) {
        toast(form.mode === "cand" ? "先選 2–3 個候選球場與時段" : "先選好球場與開始時間");
        return;
      }
      const validation = validateCreateSessionInput(createSessionFormRawInput(form, now()));
      if (!validation.valid) {
        error.hidden = false;
        error.textContent = Object.values(validation.errors)[0];
        return;
      }
      submitting = true;
      await runAsyncAction({
        root: mounted.root,
        callback: () => onSubmit(validation.value),
        controls: [submit],
        error,
        clearErrorText: true,
        errorMessage: "建立球局失敗，請稍後再試。",
        onSuccess: (result) => content.showDone(validation.value, result),
        onFinally: () => {
          submitting = false;
        },
      });
    },
    onViewMySessions: (sessionId) => {
      mounted.close({ reason: "view-my-sessions", restoreFocus: false });
      onViewMySessions(sessionId);
    },
    toast,
  });
  mounted.registerUnmount(content.unmount);

  const setCourts = (nextCourts, { ready = true } = {}) => {
    content.setCourts(sessionFormSheetRuntime.taipeiCourts(nextCourts), { ready: Boolean(ready) });
  };

  return { ...mounted, setCourts };
}

/** Open the one-tap candidate decision sheet backed by a fresh SessionSummary. */
export function openDecideSessionSheet(
  session,
  { courts = [], courtsReady = true, onClose = () => {}, onDecide = async () => {} } = {}
) {
  if (!mountDecideSessionSheetContent) {
    return deferSurfaceOpen({
      id: "session-decision-sheet",
      label: "定案場地與時間",
      load: preloadDecideSessionSheet,
      methods: ["setCourts", "setTerminal"],
      onClose,
      open: () => openDecideSessionSheet(session, { courts, courtsReady, onClose, onDecide }),
    });
  }
  const candidateIds = new Set((session?.candidateCourtIds ?? []).map(String));
  const unavailable = !isUndecidedCandidate(session);
  const mounted = mountSheet({
    id: "session-decision-sheet",
    label: "定案場地與時間",
    onClose,
    html: "",
  });
  const content = mountDecideSessionSheetContent(mounted.surface, {
    candidateIds,
    onClose: () => mounted.close(),
    onDecide: (event) => decide(event),
    rangeEndLocal: taipeiDateTimeLocalValue(session?.rangeEnd, { includeMilliseconds: true }),
    startAtLocal: taipeiDateTimeLocalValue(session?.startAt, { includeMilliseconds: true }),
    unavailable,
  });
  mounted.registerUnmount(content.unmount);
  const controls = mounted.root.querySelector("[data-decision-controls]");
  const terminal = mounted.root.querySelector("[data-decision-terminal]");
  const error = mounted.root.querySelector("[data-decision-error]");
  const timeInput = mounted.root.querySelector("[data-testid='session-decision-time']");
  let availableCourts = Array.isArray(courts) ? courts : [];
  let courtOptionsReady = Boolean(courtsReady);
  let terminalState = unavailable;
  let deciding = false;
  const buttons = () => [...mounted.root.querySelectorAll("[data-decide-court]")];
  const setTerminal = (message = "候選球局已逾期或下架，無法再定案。") => {
    terminalState = true;
    controls.hidden = true;
    terminal.textContent = message;
    terminal.hidden = false;
    terminal.focus({ preventScroll: true });
  };
  const decide = async (event) => {
    const button = event.currentTarget;
    if (deciding || terminalState) return;
    const startAt = taipeiLocalDateTimeToIso(timeInput?.value);
    const startMs = new Date(startAt ?? "").getTime();
    const rangeStartMs = new Date(session.startAt).getTime();
    const rangeEndMs = new Date(session.rangeEnd).getTime();
    if (!startAt || startMs < rangeStartMs || startMs > rangeEndMs) {
      error.textContent = "定案時間必須落在原本的時間範圍內。";
      error.hidden = false;
      return;
    }
    deciding = true;
    await runAsyncAction({
      root: mounted.root,
      callback: () => onDecide(Number(button.dataset.decideCourt), startAt),
      controls: buttons(),
      error,
      onError: (decisionError) => {
        if (terminalState) return;
        error.textContent = decisionError?.message || "定案失敗，請稍後再試。";
        error.hidden = false;
      },
      canRestoreControls: () => !terminalState,
      resolveControls: buttons,
      onFinally: ({ controlsRestored }) => {
        if (controlsRestored) deciding = false;
      },
    });
  };
  const renderCourtButtons = () => {
    if (terminalState) return;
    // React owns the button/status markup now; `disabled` stays imperative so a
    // refresh during an in-flight decide reproduces the legacy authoritative
    // state, and runAsyncAction keeps being the only other writer.
    content.setCourts(availableCourts, { ready: courtOptionsReady });
    buttons().forEach((button) => {
      button.disabled = deciding;
    });
  };
  const setCourts = (nextCourts, { ready = true } = {}) => {
    availableCourts = Array.isArray(nextCourts) ? nextCourts : [];
    courtOptionsReady = Boolean(ready);
    renderCourtButtons();
  };
  setCourts(availableCourts, { ready: courtOptionsReady });
  return { ...mounted, setCourts, setTerminal };
}

/** Edit only the mutable single-court fields accepted by update_session. */
export function openEditSessionSheet(
  session,
  { courts = [], courtsReady = true, onClose = () => {}, onSubmit = async () => {} } = {}
) {
  if (!mountEditSessionSheetContent) {
    return deferSurfaceOpen({
      id: "session-edit-sheet",
      label: "編輯球局",
      className: "create-session-sheet",
      load: preloadEditSessionSheet,
      methods: ["setCourts"],
      onClose,
      open: () => openEditSessionSheet(session, { courts, courtsReady, onClose, onSubmit }),
    });
  }
  // 漸進式揭露反模式防呆:已填的選填欄位不可被預設收合藏起來,四欄任一有值就預設展開。
  const hasOptionalValues = [session.ntrpMin, session.ntrpMax, session.feeNote, session.notes].some(
    (value) => value != null && String(value).trim() !== ""
  );
  let saving = false;
  let content;
  const mounted = mountSheet({
    id: "session-edit-sheet",
    label: "編輯球局",
    className: "create-session-sheet",
    onClose,
    html: "",
  });

  content = mountEditSessionSheetContent(mounted.surface, {
    courts: sessionFormSheetRuntime.taipeiCourts(courts),
    courtsReady: Boolean(courtsReady),
    hasOptionalValues,
    ntrpExplanation: NTRP_SCALE_EXPLANATION,
    onClose: () => mounted.close(),
    onSubmit: async ({ error, form, submit }) => {
      if (saving) return;
      const validation = validateUpdateSessionInput(Object.fromEntries(new FormData(form).entries()));
      if (!validation.valid) {
        error.textContent = Object.values(validation.errors)[0];
        error.hidden = false;
        return;
      }
      saving = true;
      await runAsyncAction({
        root: mounted.root,
        callback: () => onSubmit(validation.value),
        controls: [submit],
        error,
        errorMessage: "更新球局失敗，請稍後再試。",
        onFinally: ({ controlsRestored }) => {
          if (controlsRestored) saving = false;
        },
      });
    },
    playTypeHint: PLAY_TYPE_HINT,
    playTypes: session.playType === "對拉" ? [...CREATE_SESSION_PLAY_TYPES, "對拉"] : CREATE_SESSION_PLAY_TYPES,
    session,
    startAtLocal: sessionFormSheetRuntime.taipeiDateTimeLocalValue(session.startAt, {
      includeMilliseconds: true,
    }),
  });
  mounted.registerUnmount(content.unmount);

  const setCourts = (nextCourts, { ready = true } = {}) => {
    content.setCourts(sessionFormSheetRuntime.taipeiCourts(nextCourts), { ready: Boolean(ready) });
  };

  return { ...mounted, setCourts };
}

/** Open a session-only list for the selected base court or aggregate marker. */
export function openCourtSessionDrawer(court, sessions, { courts = [], onOpenSession = () => {} } = {}) {
  if (!mountCourtSessionSheetContent) {
    return deferSurfaceOpen({
      id: "court-session-sheet",
      label: "球場球局",
      load: preloadCourtSessionSheet,
      open: () => openCourtSessionDrawer(court, sessions, { courts, onOpenSession }),
    });
  }
  const mounted = mountSheet({
    id: "court-session-sheet",
    label: "球場球局",
    html: "",
  });
  const content = mountCourtSessionSheetContent(mounted.surface, {
    court,
    courts,
    onClose: () => mounted.close(),
    onOpenSession,
    sessions,
  });
  mounted.registerUnmount(content.unmount);
  return mounted;
}

/** Open the public player-directory rows for one court. */
export function openCourtPlayersDrawer(court, players, { onClose = () => {}, onOpenPlayer = () => {} } = {}) {
  if (!mountCourtPlayersSheetContent) {
    return deferSurfaceOpen({
      id: "court-players-sheet",
      label: "球場球友",
      load: preloadCourtPlayersSheet,
      onClose,
      open: () => openCourtPlayersDrawer(court, players, { onClose, onOpenPlayer }),
    });
  }
  const mounted = mountSheet({
    id: "court-players-sheet",
    label: "球場球友",
    onClose,
    html: "",
  });
  const content = mountCourtPlayersSheetContent(mounted.surface, {
    court,
    onClose: () => mounted.close(),
    players,
  });
  mounted.registerUnmount(content.unmount);
  mounted.root.querySelectorAll("[data-player-id]").forEach((node) => {
    node.addEventListener("click", () => {
      const target = players.find((player) => String(player.profileId) === node.dataset.playerId);
      if (target) onOpenPlayer(target);
    });
  });
  return mounted;
}

/** Open the all-Taipei opt-in directory without coupling it to map bounds. */
export function openPlayerDirectoryList({ onClose = () => {}, onOpenPlayer = () => {}, onRetry = () => {} } = {}) {
  if (!mountPlayerDirectorySheetContent) {
    return deferSurfaceOpen({
      id: "player-directory-sheet",
      label: "球友名單",
      className: "player-directory-sheet",
      load: preloadPlayerDirectorySheet,
      methods: ["setDirectory"],
      onClose,
      open: () => openPlayerDirectoryList({ onClose, onOpenPlayer, onRetry }),
    });
  }
  const mounted = mountSheet({
    id: "player-directory-sheet",
    label: "球友名單",
    className: "player-directory-sheet",
    onClose,
    html: "",
  });
  const content = mountPlayerDirectorySheetContent(mounted.surface, {
    onClose: () => mounted.close(),
    onOpenPlayer,
    onRetry,
  });
  mounted.registerUnmount(content.unmount);
  content.setDirectory({ status: "loading" });
  return { ...mounted, setDirectory: content.setDirectory };
}

/**
 * Open a standalone filter sheet mirroring the map-topbar chips, isolated in
 * #sheet-root with content-scoped React event handlers. Controls identify
 * themselves via `data-filter` (never the topbar's ids, e.g. #level-chip) so
 * this can be mounted alongside the chips row without id/selector collisions
 * (see batch C1 task-2 ground truth §意外 4/6). `instantOnly` has no control
 * here by product decision (batch D4a): it only lives on the map topbar chip,
 * so this sheet's four sections never read or write it.
 */
export function openFilterSheet({
  filters = DEFAULT_FILTER_STATE,
  courts = [],
  resultCount = 0,
  onSetFilter = () => {},
  onReset = () => {},
  onClose = () => {},
} = {}) {
  if (!mountFilterSheetContent) {
    return deferSurfaceOpen({
      id: "filters-sheet",
      label: "篩選球局",
      className: "filter-sheet",
      load: preloadFilterSheet,
      methods: ["setFilters", "setResultCount"],
      onClose,
      open: () => openFilterSheet({ filters, courts, resultCount, onSetFilter, onReset, onClose }),
    });
  }
  const mounted = mountSheet({
    id: "filters-sheet",
    label: "篩選球局",
    className: "filter-sheet",
    onClose,
    html: "",
  });
  const content = mountFilterSheetContent(mounted.surface, {
    filters,
    onClose: () => mounted.close(),
    onReset,
    onSetFilter,
    resultCount,
  });
  mounted.registerUnmount(content.unmount);
  return {
    ...mounted,
    setFilters: content.setFilters,
    setResultCount: content.setResultCount,
  };
}

/** Open one public player card and, for non-self rows, its host invitation entry point. */
export function openPlayerCardSheet(
  player,
  {
    courts = [],
    myInvitableSessions = [],
    onClose = () => {},
    onCreate = () => {},
    onInvite = async () => {},
    onSeeDirectory = () => {},
  } = {}
) {
  if (!mountPlayerCardSheetContent) {
    return deferSurfaceOpen({
      id: "player-card-sheet",
      label: "球友卡",
      className: "player-card-sheet",
      load: preloadPlayerCardSheet,
      methods: ["setInvitableSessions"],
      onClose,
      open: () =>
        openPlayerCardSheet(player, {
          courts,
          myInvitableSessions,
          onClose,
          onCreate,
          onInvite,
          onSeeDirectory,
        }),
    });
  }
  const mounted = mountSheet({
    id: "player-card-sheet",
    label: "球友卡",
    className: "player-card-sheet",
    onClose,
    html: "",
  });
  // 映射決策 6:「看球友名單」不直呼 controller,只透過 onSeeDirectory 這條既有
  // callback 慣例;controller 端接的是既有 openPlayerDirectory 入口(sessionController.js
  // openPlayer() 已接線),它本身就會關掉這張卡再開名單,這裡不重複 close()。
  const content = mountPlayerCardSheetContent(mounted.surface, {
    courts,
    myInvitableSessions,
    onClose: () => mounted.close(),
    onCreate,
    onInvite,
    onSeeDirectory,
    player,
    sheetRoot: mounted.root,
  });
  mounted.registerUnmount(content.unmount);
  return { ...mounted, setInvitableSessions: content.setInvitableSessions };
}

/** Keep the persistent map chip synchronized with controller-owned layer state. */
export function renderPlayerLayerToggle(button, { message = "", on = false, status = "idle" } = {}) {
  if (!button) return;
  button.setAttribute("aria-pressed", String(Boolean(on)));
  button.classList.toggle("is-active", Boolean(on));
  // 批 D3:toggle 改為控制直欄的 icon 鈕,可讀文字住在 visually-hidden span
  //(佈局不吃字寬,測試與 SR 讀到的字不變);找不到 span 時退回整鈕文字。
  const layerText = on ? "隱藏在線" : "顯示在線";
  const layerTextNode = button.querySelector("[data-player-layer-text]");
  if (layerTextNode) layerTextNode.textContent = layerText;
  else button.textContent = layerText;
  const statusRoot = document.getElementById("player-layer-status");
  if (!statusRoot) return;
  statusRoot.hidden = !message;
  statusRoot.textContent = message;
  statusRoot.setAttribute("role", status === "error" ? "alert" : "status");
}

/** Render only user-facing, non-sensitive loading/error/location messages. */
export function renderMapDataStatus(
  root,
  { kind = "idle", message = "", onRetry = () => {}, locationMessage = "" } = {}
) {
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
