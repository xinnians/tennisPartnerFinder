import { setMySessionActionScope, syncPendingMySessionActions } from "../sessionActions.ts";
import { esc } from "../util.js";

let preloadAuthenticatedViewsForAuth;
let renderMePageInApp;
let renderMySessionsPageInApp;
let renderNearbySessionsDrawerInApp;

/** Configure facade-owned App mounts while keeping page adapters independently testable. */
export function configurePageViews(dependencies) {
  ({ preloadAuthenticatedViewsForAuth, renderMePageInApp, renderMySessionsPageInApp, renderNearbySessionsDrawerInApp } =
    dependencies);
}

const drawerFocusIntents = new WeakMap();

const drawerLoadingFocusFallbacks = new WeakSet();

const drawerBeforeStoreChangeCallbacks = new WeakMap();

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

/** Mount or update the React account and service skeleton for the Me destination. */
export function renderMePage(root, options = {}) {
  if (!renderMePageInApp) throw new Error("MePage browser mount is unavailable.");
  const authSession = options.authSession ?? null;
  preloadAuthenticatedViewsForAuth(authSession);
  setMySessionActionScope(root, authSession?.user?.id ?? null);
  renderMePageInApp(root, options, () => {
    setMySessionActionScope(
      root,
      options.sessionStore?.getState?.().authSession?.user?.id ?? authSession?.user?.id ?? null
    );
    syncPendingMySessionActions(root);
  });
}

// 「目前開著的抽屜面板」查詢:collapsed 時 section 帶 hidden,回傳 null;
// v2 兩態下 open 就是唯一的開啟狀態,判準是 hidden 屬性。
function activeDrawerPanel(root) {
  const panel = root.querySelector("#nearby-sessions-list");
  return panel && !panel.hidden ? panel : null;
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

function beforeDrawerStoreChange(root) {
  let callback = drawerBeforeStoreChangeCallbacks.get(root);
  if (!callback) {
    callback = () => rememberFocusedSessionCard(root);
    drawerBeforeStoreChangeCallbacks.set(root, callback);
  }
  return callback;
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
  if (!renderNearbySessionsDrawerInApp) throw new Error("NearbySessionsDrawer browser mount is unavailable.");
  renderNearbySessionsDrawerInApp(
    root,
    {
      courts,
      drawerState,
      filters,
      hasUserLocation,
      mapStatus,
      onBeforeStoreChange: beforeDrawerStoreChange(root),
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
      // Batch 18 invariant: the stable React drawer slot keeps the native
      // scrollTop across quiet refreshes; only focus needs an explicit restore.
      restoreFocusedSessionCard(root);
    }
  );
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
