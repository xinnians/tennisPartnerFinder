import "./style.css";
import "./session.css";

if (import.meta.env.PROD) {
  void import("@vercel/analytics").then(({ inject }) => {
    inject({ mode: "production" });
  });
}

import { GOOGLE_MAPS_API_KEY, SUPPORT_EMAIL, WEB_PUSH_VAPID_PUBLIC_KEY } from "./config.js";
import { BANDS, countActiveFilters } from "./filters.js";
import {
  createMap,
  fitTaipeiBounds,
  getMapBounds,
  groupSessionsByCourt,
  loadGoogleMaps,
  renderCourtBasePins,
  renderPlayerPins,
  renderSessionPins,
  setUserLocation,
  subscribeToMapIdle,
} from "./map.js";
import {
  acceptSessionParticipant,
  cancelSession,
  confirmSessionAttendance,
  createReport,
  createSession,
  decideSessionCourt,
  declineSessionParticipant,
  getInitialSession,
  inviteToSession,
  loadCourts,
  loadCourtSubscriptions,
  loadCurrentProfile,
  loadMySessions,
  loadMyPlayerBlocks,
  loadNotificationPreferences,
  loadPlayerDirectory,
  loadPlayerPresenceDirectory,
  loadSessionDiscovery,
  loadSessionMessages,
  loadSessionJoinPreview,
  loadSessionRoster,
  loadSessionSummary,
  markSessionPlayed,
  onAuthStateChange,
  postSessionMessage,
  requestToJoinSession,
  respondToSessionInvite,
  saveCourtSubscriptions,
  saveCurrentProfile,
  saveNotificationPreferences,
  savePushSubscription,
  signInWithOAuthProvider,
  signOut,
  setPlayerVisibility,
  setOpenToGreeting,
  setPlayerBlock,
  setPresenceSharing,
  updateSession,
  updateMyPresence,
  withdrawFromSession,
} from "./dataApi.js";
import { isSupabaseConfigured } from "./supabaseClient.js";
import { createSessionController } from "./sessionController.js";
import {
  openCourtSessionDrawer,
  openCourtPlayersDrawer,
  openCreateSessionSheet,
  openDecideSessionSheet,
  openEditSessionSheet,
  openFilterSheet,
  openJoinSessionConfirmation,
  openProfileCompletionSheet,
  openPlayerCardSheet,
  openPlayerDirectoryList,
  openReportDialog,
  openSessionChatSheet,
  openSessionSheet,
  openSessionUnavailableSheet,
  openWithdrawSessionConfirmation,
  renderMapDataStatus,
  renderMePage,
  renderPlayerLayerToggle,
  renderMySessionsPage,
  renderNearbySessionsDrawer,
} from "./sessionViews.js";
import { openLoginModal } from "./sheets.js";
import { canReceiveFocus, shouldReleasePendingMeFocus } from "./meFocus.js";
import { enableBrowserPush } from "./notificationPush.js";
import { createPresenceTracker } from "./playerPresence.js";
import { eligibilityFromPrivateProfile } from "./profile.js";
import { sessionIdFromHash } from "./sessionRoute.js";
import { esc } from "./util.js";

let google = null;
let map = null;
let courts = [];
let courtsReady = false;
// openFilters() 開啟篩選 sheet 時的資料來源,亦是 renderFilters 判斷 badge N 的依據。
let latestFilters = null;
// 批 C1 Task 3:目前開著的篩選 sheet(未開時為 null)。renderFilters 靠它把地圖控件
// 的每次變動鏡像進 sheet;sheet 自己的變動已在 openFilterSheet 內部同步。
let activeFilterSheet = null;
let courtCatalogueStatus = "loading";
let sessionMarkers = [];
let courtMarkers = [];
let playerMarkers = [];
let latestPlayerLayerView = { groups: [], message: "", on: false, status: "idle" };
let controller;
let authStateEpoch = 0;
let currentAuthIdentity = null;
let authSession = null;
let currentProfile = null;
let activeProfileCompletion = null;

function currentProfileEligibility(profile = currentProfile) {
  return eligibilityFromPrivateProfile(profile, {
    courts,
    courtsReady,
    courtsStatus: courtCatalogueStatus,
  });
}
let profileLoadStatus = "idle";
let profileRevision = 0;
let activePage = "map";
let createdSessionFocusId = null;
let meRenderGeneration = 0;
let mySessionsRenderGeneration = 0;
let pendingMeFocus = null;
// renderMeDestination() 換血 root.innerHTML 期間為 true，讓 focusout 監聽器忽略那次自己
// 造成的合成事件；細節見 renderMeDestination() 內對應註解。
let suppressMeFocusRelease = false;
let pendingMySessionsFocus = null;
let notificationSettings = defaultNotificationSettings();
let presenceLocationStatus = "idle";
let presenceTracker = null;
let sessionHashRouteGeneration = 0;

function toast(message) {
  const root = document.getElementById("toast-root");
  root.innerHTML = `<div class="toast">${esc(message)}</div>`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (root.innerHTML = ""), 2400);
}

function sessionShareLink(sessionId) {
  const normalizedSessionId = Number(sessionId);
  if (!Number.isSafeInteger(normalizedSessionId) || normalizedSessionId <= 0) {
    throw new Error("目前無法產生這個球局的連結。");
  }
  return `${globalThis.location.origin}${globalThis.location.pathname}#/session/${normalizedSessionId}`;
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

async function copySessionShareLink(sessionId) {
  const link = sessionShareLink(sessionId);
  try {
    if (globalThis.navigator?.clipboard?.writeText) await globalThis.navigator.clipboard.writeText(link);
    else if (!fallbackCopyText(link)) throw new Error("copy unavailable");
  } catch {
    if (!fallbackCopyText(link)) throw new Error("目前無法複製連結，請手動複製網址。");
  }
  toast("球局連結已複製。");
}

async function openSessionHashRoute() {
  const sessionId = sessionIdFromHash(globalThis.location?.hash);
  if (!sessionId || !controller) return;
  const generation = ++sessionHashRouteGeneration;
  showMapPage();
  const result = await controller.openSessionFromLink(sessionId);
  if (generation !== sessionHashRouteGeneration || sessionId !== sessionIdFromHash(globalThis.location?.hash)) return;
  if (result?.status !== "opened") openSessionUnavailableSheet();
}

function supportContactHref() {
  const address = SUPPORT_EMAIL.trim();
  return address ? `mailto:${address}` : "";
}

const LOCAL_DEMO_UNAVAILABLE = "本機示範資料僅供瀏覽；登入、儲存個人檔案與建立球局需在已設定服務的環境使用。";

function defaultProfile() {
  return {
    courts: new Set(),
    nick: "",
    ntrp: null,
    slots: new Set(),
    openToGreeting: false,
    sharePresence: false,
    types: new Set(),
  };
}

function presenceSettingsForProfile() {
  return {
    locationStatus: presenceLocationStatus,
    openToGreeting: currentProfile?.openToGreeting === true,
    sharePresence: currentProfile?.sharePresence === true,
  };
}

function stopPresenceTracking() {
  presenceTracker?.stop();
  presenceTracker = null;
}

function updatePresenceLocationStatus(status) {
  presenceLocationStatus = status;
  if (activePage === "my-sessions") renderMySessionsDestination();
  else if (activePage === "me") renderMeDestination();
}

function reconcilePresenceTracking() {
  const eligible = currentProfileEligibility();
  const canTrack = Boolean(isSupabaseConfigured && authSession && eligible.ntrp && currentProfile?.sharePresence === true);
  if (!canTrack) {
    stopPresenceTracking();
    return false;
  }
  if (!presenceTracker) {
    presenceTracker = createPresenceTracker({
      onError: updatePresenceLocationStatus,
      onPosition: async ({ lat, lng }) => {
        const epoch = authStateEpoch;
        const identity = currentAuthIdentity;
        await updateMyPresence({ lat, lng });
        if (!notificationRequestIsCurrent({ epoch, identity })) return;
        updatePresenceLocationStatus("active");
      },
    });
  }
  const started = presenceTracker.start();
  if (started && presenceLocationStatus === "idle") presenceLocationStatus = "requesting";
  return started;
}

async function updatePresenceSharing(shared) {
  const epoch = authStateEpoch;
  const identity = currentAuthIdentity;
  if (!identity || !authSession || !isSupabaseConfigured) throw new Error("請先登入後再調整在線設定。");
  if (!currentProfileEligibility().ntrp) {
    openProfileCompletion({ intent: { action: "presence" } });
    return false;
  }
  await setPresenceSharing(shared === true);
  if (!notificationRequestIsCurrent({ epoch, identity })) throw new Error("登入狀態已變更，請重新整理後再試。");
  currentProfile = { ...(currentProfile ?? defaultProfile()), sharePresence: shared === true };
  if (shared) reconcilePresenceTracking();
  else {
    stopPresenceTracking();
    presenceLocationStatus = "idle";
  }
  rerenderVisibleNotificationSettings();
  toast(shared ? "已開啟在線分享。" : "已隱藏在線狀態。");
}

async function updateOpenToGreetingSetting(open) {
  const epoch = authStateEpoch;
  const identity = currentAuthIdentity;
  if (!identity || !authSession || !isSupabaseConfigured) throw new Error("請先登入後再調整在線設定。");
  if (!currentProfileEligibility().ntrp) {
    openProfileCompletion({ intent: { action: "presence" } });
    return false;
  }
  await setOpenToGreeting(open === true);
  if (!notificationRequestIsCurrent({ epoch, identity })) throw new Error("登入狀態已變更，請重新整理後再試。");
  currentProfile = { ...(currentProfile ?? defaultProfile()), openToGreeting: open === true };
  rerenderVisibleNotificationSettings();
  toast(open ? "已開啟接受現場問候。" : "已關閉接受現場問候。");
}

function defaultNotificationSettings() {
  return {
    courtIds: [],
    errorMessage: "",
    prefs: {
      chatMessageEnabled: true,
      guestInvitedEnabled: true,
      guestRequestReviewedEnabled: true,
      hostNewRequestEnabled: true,
      sessionReminderEnabled: true,
      sessionUpdatedEnabled: true,
    },
    pushStatus: "idle",
    webPushConfigured: Boolean(WEB_PUSH_VAPID_PUBLIC_KEY.trim()),
  };
}

function currentAuthAvatarUrl() {
  const metadata = authSession?.user?.user_metadata ?? {};
  return metadata.avatar_url ?? metadata.picture ?? "";
}

function openSafeLogin({ action = "", onClose = () => {} } = {}) {
  if (!isSupabaseConfigured) {
    onClose();
    toast(LOCAL_DEMO_UNAVAILABLE);
    return null;
  }
  return openLoginModal({
    action,
    onClose,
    onProvider: async (provider) => {
      await signInWithOAuthProvider(provider);
    },
  });
}

async function handleSignOut() {
  try {
    await signOut();
    toast("已登出。");
  } catch {
    toast("登出失敗，請稍後再試。");
  }
}

function closeActiveProfileCompletion(options = { reason: "account-change", restoreFocus: false }) {
  const mounted = activeProfileCompletion;
  activeProfileCompletion = null;
  mounted?.close?.(options);
}

function openProfileCompletion({
  courts: selectableCourts,
  courtsReady: formCourtsReady,
  intent,
  mode = "gate",
  onClose = () => {},
  returnSession,
} = {}) {
  const openedIdentity = authIdentity(authSession);
  let mounted = null;
  mounted = openProfileCompletionSheet({
    avatarUrl: currentAuthAvatarUrl(),
    courts: selectableCourts ?? courts,
    courtsReady: formCourtsReady ?? courtsReady,
    mode,
    onClose: (detail) => {
      if (activeProfileCompletion === mounted) {
        activeProfileCompletion = null;
      }
      onClose(detail);
    },
    onSave: async (draft) => {
      if (!isSupabaseConfigured) throw new Error(LOCAL_DEMO_UNAVAILABLE);
      if (!openedIdentity || openedIdentity !== authIdentity(authSession)) {
        throw new Error("登入狀態已變更，請重新開啟個人檔案。");
      }
      if (profileLoadStatus !== "ready") {
        throw new Error("個人檔案暫時無法載入，請重新整理後再試。");
      }
      const saved = await saveCurrentProfile(draft);
      if (openedIdentity !== authIdentity(authSession)) {
        throw new Error("登入狀態已變更，請重新開啟個人檔案。");
      }
      profileRevision += 1;
      profileLoadStatus = "ready";
      currentProfile = saved ?? draft;
      return currentProfile;
    },
    onSaved: async (savedProfile) => {
      if (openedIdentity !== authIdentity(authSession)) return;
      currentProfile = savedProfile ?? currentProfile ?? defaultProfile();
      if (!authSession) return;
      await controller.setAuthState(authSession, currentProfileEligibility());
      // 身分卡顯示暱稱與 NTRP，存檔後要立刻反映新值。
      if (activePage !== "me") return;
      renderMeDestination();
      // 存檔後還會再連著重繪三次（setAuthState 等），restoreMeFocus 的 generation 守衛會讓
      // 中間那次還原失效，而 focusout 早已清掉 pendingMeFocus，最後一次重繪便無焦點可還原。
      // 所以這裡仍要明確送回入口；captureMeFocus 的 edit-profile 分支負責的是另一件事：
      // 焦點停在入口時發生的背景重繪。實測見批 4 補件回報。
      if (mode === "standalone") {
        requestAnimationFrame(() => {
          document.querySelector('#me-root [data-testid="edit-profile"]')?.focus({ preventScroll: true });
        });
      }
    },
    intent,
    profile: currentProfile ?? defaultProfile(),
    returnSession: intent?.action === "join" ? returnSession : null,
  });
  activeProfileCompletion = mounted;
  return mounted;
}

function openCreateSession({ courts: selectableCourts, courtsReady: formCourtsReady, onClose, onSubmit } = {}) {
  return openCreateSessionSheet({
    courts: selectableCourts ?? courts,
    courtsReady: formCourtsReady ?? courtsReady,
    onClose,
    onSubmit,
  });
}

function renderFilterSheetButton(filters) {
  const button = document.getElementById("filter-sheet-open");
  if (!button) return;
  const count = countActiveFilters(filters);
  button.textContent = count > 0 ? `篩選 ⋅${count}` : "篩選";
  button.classList.toggle("is-active", count > 0);
  button.setAttribute("aria-label", count > 0 ? `篩選，已套用 ${count} 組條件` : "篩選");
}

// 同步樞紐:地圖控件(日期／程度)、主鈕徽章 N、以及 sheet 開著時的 sheet 控件,
// 三者都只從這裡的單一 filters 寫入,不論觸發來源是地圖還是 sheet 本身。
function renderFilters(filters) {
  const date = document.getElementById("date-filter");
  if (date) date.value = filters.date || "";
  document.getElementById("band-label").textContent = BANDS.find((band) => band.key === filters.band)?.label ?? "全部";
  document.querySelectorAll("[data-band]").forEach((button) => {
    const selected = button.dataset.band === filters.band;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  renderFilterSheetButton(filters);
  activeFilterSheet?.setFilters(filters);
}

// 批 C1 Task 3:openFilterSheet 的接線層包裝,接在 #filter-sheet-open 主鈕上。
// 回傳值存進 activeFilterSheet,讓 renderFilters 能在 sheet 開著時把地圖端變動鏡像進去。
function openFilters(handlers = {}) {
  return openFilterSheet({
    filters: latestFilters ?? undefined,
    courts,
    onSetFilter: (field, value) => controller.setFilter(field, value),
    onReset: () => controller.resetFilters(),
    onClose: (detail) => {
      activeFilterSheet = null;
      handlers.onClose?.(detail);
    },
  });
}

function renderSessionMarkers(sessions) {
  if (!google || !map) return;
  const groups = groupSessionsByCourt(courts, sessions);
  sessionMarkers = renderSessionPins(
    google,
    map,
    groups,
    {
      onSession: (sessionId) => controller.openSession(sessionId),
      onCluster: (court, groupedSessions) => controller.openCourt(court, groupedSessions),
    },
    sessionMarkers
  );
}

function renderPlayerLayer(view) {
  latestPlayerLayerView = view;
  renderPlayerLayerToggle(document.getElementById("player-layer-toggle"), view);
  if (!google || !map) return;
  playerMarkers = renderPlayerPins(
    google,
    map,
    view.on ? view.groups : [],
    (court, players) => controller.openPlayerCourt(court, players),
    playerMarkers
  );
}

function renderDiscovery(view) {
  latestFilters = view.filters;
  renderFilters(view.filters);
  renderNearbySessionsDrawer(document.getElementById("nearby-sessions-drawer"), {
    sessions: view.sessions,
    courts: view.courts,
    drawerState: view.drawerState,
    hasUserLocation: view.hasUserLocation,
    mapStatus: view.mapStatus,
    filters: view.filters,
    authenticated: Boolean(authSession),
    onToggle: controller.setDrawerState,
    onOpenSession: controller.openSession,
    onReset: controller.resetFilters,
    onExpandBounds: controller.expandBounds,
    onOpenCreate: controller.openCreateIntent,
    onRetry: controller.retryDiscovery,
    onSubscribe: () => showMePage({ focusNotificationSettings: true }),
  });
  renderMapDataStatus(document.getElementById("map-data-status"), {
    ...view.mapStatus,
    locationMessage: view.locationMessage,
    onRetry: controller.retryDiscovery,
  });
}

function syncBottomNavigation() {
  const mapTab = document.getElementById("map-tab");
  const mySessionsTab = document.getElementById("my-sessions-tab");
  const meTab = document.getElementById("me-tab");
  if (activePage === "map") mapTab?.setAttribute("aria-current", "page");
  else mapTab?.removeAttribute("aria-current");
  if (activePage === "my-sessions") mySessionsTab?.setAttribute("aria-current", "page");
  else mySessionsTab?.removeAttribute("aria-current");
  if (activePage === "me") meTab?.setAttribute("aria-current", "page");
  else meTab?.removeAttribute("aria-current");
  const badge = document.getElementById("my-sessions-badge");
  const mySessionState = controller?.getMySessionState?.();
  const count = mySessionState?.groups?.needsActionCount ?? 0;
  if (badge) {
    badge.hidden = count <= 0;
    badge.textContent = count > 0 ? String(count) : "";
    badge.setAttribute("aria-hidden", "true");
  }
  const badgeLabel = count > 0 ? `我的球局，${count} 項待處理` : "我的球局";
  mySessionsTab?.setAttribute("aria-label", badgeLabel);
  const badgeStatus = document.getElementById("my-sessions-badge-status");
  if (badgeStatus) badgeStatus.textContent = count > 0 ? `${count} 項待處理` : "沒有待處理事項";
}

function captureMySessionsFocus(root) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  if (active.matches("#my-sessions-refresh")) return { kind: "refresh" };
  if (active.matches("[data-my-sessions-back]")) return { kind: "back" };
  if (active.matches("[data-my-sessions-heading]")) return { kind: "heading" };
  if (active.matches("[data-my-sessions-sign-in]")) return { kind: "sign-in" };
  if (active.matches("[data-open-my-session]")) return { kind: "open-session", sessionId: active.dataset.sessionId };
  if (active.matches("[data-my-action]")) {
    return {
      action: active.dataset.myAction,
      kind: "action",
      participantId: active.dataset.participantId ?? "",
      profileId: active.dataset.profileId ?? "",
      sessionId: active.dataset.sessionId ?? "",
    };
  }
  return null;
}

function resolveMySessionsFocus(root, focus) {
  if (!focus) return null;
  if (focus.kind === "refresh") return root.querySelector("#my-sessions-refresh");
  if (focus.kind === "back") return root.querySelector("[data-my-sessions-back]");
  if (focus.kind === "heading") return root.querySelector("[data-my-sessions-heading]");
  if (focus.kind === "sign-in") return root.querySelector("[data-my-sessions-sign-in]");
  if (focus.kind === "open-session") {
    return [...root.querySelectorAll("[data-open-my-session]")].find(
      (button) => String(button.dataset.sessionId) === String(focus.sessionId)
    );
  }
  if (focus.kind === "action") {
    return [...root.querySelectorAll("[data-my-action]")].find(
      (button) =>
        button.dataset.myAction === focus.action &&
        String(button.dataset.sessionId ?? "") === String(focus.sessionId) &&
        String(button.dataset.participantId ?? "") === String(focus.participantId) &&
        String(button.dataset.profileId ?? "") === String(focus.profileId)
    );
  }
  return null;
}

function restoreMySessionsFocus(root, focus, generation) {
  if (!focus) return;
  requestAnimationFrame(() => {
    if (generation !== mySessionsRenderGeneration || activePage !== "my-sessions") return;
    if (document.querySelector("#sheet-root .surface, #modal-root .surface")) {
      pendingMySessionsFocus = null;
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && root.contains(active)) {
      pendingMySessionsFocus = null;
      return;
    }
    const target = resolveMySessionsFocus(root, focus);
    if (target && !target.disabled) target.focus({ preventScroll: true });
    else root.querySelector("[data-my-sessions-heading]")?.focus({ preventScroll: true });
    pendingMySessionsFocus = null;
  });
}

function captureMeFocus(root) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  if (active.matches("[data-me-heading]")) return { kind: "heading" };
  if (active.matches("[data-notification-settings-heading]")) return { kind: "notification-settings-heading" };
  if (active.matches('[data-testid="me-sign-in"]')) return { kind: "sign-in" };
  if (active.matches('[data-testid="me-sign-out"]')) return { kind: "sign-out" };
  if (active.matches('[data-testid="edit-profile"]')) return { kind: "edit-profile" };
  if (active.matches('[data-my-action="toggle-visibility"]')) return { kind: "player-visibility" };
  if (active.matches("[data-enable-push]")) return { kind: "enable-push" };
  if (active.matches("[data-notification-pref]")) return { kind: "notification-pref", preference: active.dataset.notificationPref };
  if (active.matches("[data-subscribe-all-courts]")) return { kind: "subscribe-all-courts" };
  if (active.matches("[data-court-picker-toggle]")) return { kind: "court-picker-toggle" };
  if (active.matches("[data-notification-court]")) return { courtId: active.value, kind: "notification-court" };
  if (active.matches("[data-set-presence-sharing]")) return { kind: "presence-sharing" };
  if (active.matches("[data-open-to-greeting]")) return { kind: "open-to-greeting" };
  if (active.matches(".me-service-links a")) return { href: active.getAttribute("href") ?? "", kind: "service-link" };
  // 封鎖清單的解除按鈕沒有專屬 selector，與 My Sessions 側一樣靠通用 fallback 接住。
  // 排在最後只是讓上面幾個控制項保有專屬 kind：toggle-visibility 就算被這裡接走也還原得回去，
  // 因為它三個 dataset 欄位皆缺，resolve 端正規化成空字串後仍會比對到同一顆按鈕（已實測）。
  if (active.matches("[data-my-action]")) {
    return {
      action: active.dataset.myAction,
      kind: "action",
      participantId: active.dataset.participantId ?? "",
      profileId: active.dataset.profileId ?? "",
      sessionId: active.dataset.sessionId ?? "",
    };
  }
  return null;
}

function resolveMeFocus(root, focus) {
  if (!focus) return null;
  if (focus.kind === "heading") return root.querySelector("[data-me-heading]");
  if (focus.kind === "notification-settings-heading") return root.querySelector("[data-notification-settings-heading]");
  if (focus.kind === "sign-in") return root.querySelector('[data-testid="me-sign-in"]');
  if (focus.kind === "sign-out") return root.querySelector('[data-testid="me-sign-out"]');
  if (focus.kind === "edit-profile") return root.querySelector('[data-testid="edit-profile"]');
  if (focus.kind === "player-visibility") return root.querySelector('[data-my-action="toggle-visibility"]');
  if (focus.kind === "enable-push") return root.querySelector("[data-enable-push]");
  if (focus.kind === "notification-pref") {
    return [...root.querySelectorAll("[data-notification-pref]")].find(
      (input) => input.dataset.notificationPref === focus.preference
    );
  }
  if (focus.kind === "subscribe-all-courts") return root.querySelector("[data-subscribe-all-courts]");
  if (focus.kind === "court-picker-toggle") return root.querySelector("[data-court-picker-toggle]");
  if (focus.kind === "notification-court") {
    return [...root.querySelectorAll("[data-notification-court]")].find(
      (box) => String(box.value) === String(focus.courtId)
    );
  }
  if (focus.kind === "presence-sharing") return root.querySelector("[data-set-presence-sharing]");
  if (focus.kind === "open-to-greeting") return root.querySelector("[data-open-to-greeting]");
  if (focus.kind === "service-link") {
    return [...root.querySelectorAll(".me-service-links a")].find((link) => link.getAttribute("href") === focus.href);
  }
  if (focus.kind === "action") {
    return [...root.querySelectorAll("[data-my-action]")].find(
      (button) =>
        button.dataset.myAction === focus.action &&
        String(button.dataset.sessionId ?? "") === String(focus.sessionId) &&
        String(button.dataset.participantId ?? "") === String(focus.participantId) &&
        String(button.dataset.profileId ?? "") === String(focus.profileId)
    );
  }
  return null;
}

function restoreMeFocus(root, focus, generation) {
  if (!focus) return;
  requestAnimationFrame(() => {
    if (generation !== meRenderGeneration || activePage !== "me") return;
    if (document.querySelector("#sheet-root .surface, #modal-root .surface")) {
      pendingMeFocus = null;
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && root.contains(active)) {
      pendingMeFocus = null;
      return;
    }
    const target = resolveMeFocus(root, focus);
    const courtPickerToggle = root.querySelector("[data-court-picker-toggle]");
    // 目標可能已被收合（球場清單勾滿後會自動收起），對隱形元素 focus() 是空操作。
    if (canReceiveFocus(target)) target.focus({ preventScroll: true });
    else if (canReceiveFocus(courtPickerToggle)) courtPickerToggle.focus({ preventScroll: true });
    else root.querySelector("[data-me-heading]")?.focus({ preventScroll: true });
    pendingMeFocus = null;
  });
}

function notificationRequestIsCurrent({ epoch, identity }) {
  return Boolean(authSession) && epoch === authStateEpoch && identity === currentAuthIdentity;
}

function rerenderVisibleNotificationSettings() {
  if (activePage === "my-sessions") renderMySessionsDestination();
  else if (activePage === "me") renderMeDestination();
}

async function refreshNotificationSettings() {
  const epoch = authStateEpoch;
  const identity = currentAuthIdentity;
  if (!identity || !authSession || !isSupabaseConfigured) return false;
  try {
    const [prefs, courtIds] = await Promise.all([
      loadNotificationPreferences(),
      loadCourtSubscriptions(),
    ]);
    if (!notificationRequestIsCurrent({ epoch, identity })) return false;
    notificationSettings = {
      ...notificationSettings,
      courtIds,
      errorMessage: "",
      prefs,
      webPushConfigured: Boolean(WEB_PUSH_VAPID_PUBLIC_KEY.trim()),
    };
  } catch {
    if (!notificationRequestIsCurrent({ epoch, identity })) return false;
    notificationSettings = {
      ...notificationSettings,
      errorMessage: "通知設定暫時無法載入，請稍後再試。",
    };
  }
  rerenderVisibleNotificationSettings();
  return true;
}

async function updateNotificationPreferences(preferences) {
  const epoch = authStateEpoch;
  const identity = currentAuthIdentity;
  if (!identity || !authSession) throw new Error("請先登入後再調整通知設定。");
  const nextPreferences = {
    chatMessageEnabled: preferences?.chatMessageEnabled === true,
    guestInvitedEnabled: preferences?.guestInvitedEnabled === true,
    guestRequestReviewedEnabled: preferences?.guestRequestReviewedEnabled === true,
    hostNewRequestEnabled: preferences?.hostNewRequestEnabled === true,
    sessionReminderEnabled: preferences?.sessionReminderEnabled === true,
    sessionUpdatedEnabled: preferences?.sessionUpdatedEnabled === true,
  };
  await saveNotificationPreferences(nextPreferences);
  if (!notificationRequestIsCurrent({ epoch, identity })) return;
  notificationSettings = { ...notificationSettings, errorMessage: "", prefs: nextPreferences };
  rerenderVisibleNotificationSettings();
  toast("通知偏好已儲存。");
}

async function updateCourtSubscriptions(courtIds) {
  const epoch = authStateEpoch;
  const identity = currentAuthIdentity;
  if (!identity || !authSession) throw new Error("請先登入後再調整通知設定。");
  const nextCourtIds = [
    ...new Set(
      (Array.isArray(courtIds) ? courtIds : [])
        .map(Number)
        .filter((courtId) => Number.isSafeInteger(courtId) && courtId > 0)
    ),
  ];
  const activeTaipeiCourtCount = courts.filter((court) => court?.city === "台北市").length;
  if (activeTaipeiCourtCount > 0 && nextCourtIds.length > activeTaipeiCourtCount) {
    throw new Error("訂閱球場數量超過目前可選的台北市球場。");
  }
  await saveCourtSubscriptions(nextCourtIds);
  if (!notificationRequestIsCurrent({ epoch, identity })) return;
  notificationSettings = { ...notificationSettings, courtIds: nextCourtIds, errorMessage: "" };
  rerenderVisibleNotificationSettings();
  toast("球場訂閱已儲存。");
}

async function enablePushNotifications() {
  const epoch = authStateEpoch;
  const identity = currentAuthIdentity;
  if (!identity || !authSession) throw new Error("請先登入後再開啟推播。");
  if (!WEB_PUSH_VAPID_PUBLIC_KEY.trim()) {
    notificationSettings = { ...notificationSettings, pushStatus: "unsupported" };
    rerenderVisibleNotificationSettings();
    return "unsupported";
  }
  const result = await enableBrowserPush({ vapidPublicKey: WEB_PUSH_VAPID_PUBLIC_KEY });
  if (!notificationRequestIsCurrent({ epoch, identity })) return;
  if (result.status !== "granted" || !result.subscription) {
    const pushStatus = result.status === "denied" ? "denied" : result.status === "unsupported" ? "unsupported" : "idle";
    notificationSettings = {
      ...notificationSettings,
      errorMessage: "",
      pushStatus,
    };
    rerenderVisibleNotificationSettings();
    return pushStatus;
  }
  await savePushSubscription(result.subscription);
  if (!notificationRequestIsCurrent({ epoch, identity })) return;
  notificationSettings = { ...notificationSettings, errorMessage: "", pushStatus: "enabled" };
  rerenderVisibleNotificationSettings();
  toast("已開啟推播通知。");
  return "enabled";
}

function renderMySessionsDestination() {
  if (!controller) return;
  const state = controller.getMySessionState();
  const createdSessionId = createdSessionFocusId;
  const root = document.getElementById("my-sessions-root");
  const focus = activePage === "my-sessions" ? captureMySessionsFocus(root) ?? pendingMySessionsFocus : null;
  if (focus) pendingMySessionsFocus = focus;
  else if (activePage !== "my-sessions") pendingMySessionsFocus = null;
  const generation = ++mySessionsRenderGeneration;
  renderMySessionsPage(root, {
    actionScopeKey: state.viewGeneration,
    authenticated: state.authenticated,
    courts,
    createdSessionId,
    errorMessage: state.error,
    groups: state.groups,
    onAccept: (sessionId, participantId) => controller.reviewMySessionParticipant(sessionId, participantId, "accepted"),
    onAcceptInvite: (sessionId) => controller.respondInvite(sessionId, "accepted"),
    onBack: () => showMapPage({ focus: true }),
    onCancel: controller.cancelMySession,
    onConfirmAttendance: controller.confirmMySessionAttendance,
    onCreatedSessionFocus: () => {
      if (createdSessionFocusId !== createdSessionId) return false;
      createdSessionFocusId = null;
      return true;
    },
    onDecline: (sessionId, participantId) => controller.reviewMySessionParticipant(sessionId, participantId, "declined"),
    onDeclineInvite: (sessionId) => controller.respondInvite(sessionId, "declined"),
    onDecide: controller.openSessionDecision,
    onEdit: controller.openSessionEdit,
    onEnablePush: enablePushNotifications,
    onMarkPlayed: controller.markMySessionPlayed,
    onOpenChat: controller.openSessionChat,
    onOpenSession: controller.openSession,
    onRefresh: async () => {
      await controller.refreshMySessions();
      renderMySessionsDestination();
    },
    onReportParticipant: controller.openRosterParticipantReport,
    onReportSession: controller.openSessionReport,
    onSignIn: () => openSafeLogin({ action: "my-sessions" }),
    notificationSettings,
    status: state.status,
    onWithdraw: controller.withdrawMySession,
  });
  restoreMySessionsFocus(root, focus, generation);
  syncBottomNavigation();
}

function renderMeDestination() {
  const root = document.getElementById("me-root");
  if (!root) return;
  if (root.dataset.meFocusTracking !== "true") {
    root.dataset.meFocusTracking = "true";
    root.addEventListener("focusin", () => {
      if (activePage === "me") pendingMeFocus = captureMeFocus(root);
    });
    root.addEventListener("focusout", (event) => {
      // 焦點還原改由 runPresenceSettingAction 明確托管，這裡不再為 disable 情境留後路：
      // 只要焦點離開 root 就放棄還原，避免背景重繪把焦點從頁面外搶回來。
      // suppressMeFocusRelease 期間跳過：那是本函式自己 renderMePage() 換血 DOM 造成的
      // 合成 focusout（relatedTarget 必為 null），不是使用者主動把焦點移出 root，見下方
      // renderMePage() 呼叫前後的說明。
      if (suppressMeFocusRelease) return;
      if (shouldReleasePendingMeFocus(root, event.relatedTarget)) pendingMeFocus = null;
    });
  }
  const focus = activePage === "me" ? captureMeFocus(root) ?? pendingMeFocus : null;
  if (focus) pendingMeFocus = focus;
  else if (activePage !== "me") pendingMeFocus = null;
  const generation = ++meRenderGeneration;
  const state = controller?.getMySessionState?.() ?? {};
  // renderMePage() 下面會整段換掉 root.innerHTML，若舊焦點節點正好在 root 內，瀏覽器會
  // 同步發出 focusout（relatedTarget=null）。這個訊號在既有 shouldReleasePendingMeFocus
  // 語意裡代表「使用者主動把焦點移出 root」，但這裡其實是本函式自己的 DOM 換血造成，不是
  // 使用者動作——JS 是單執行緒，使用者不可能在這段同步呼叫期間插入真正的焦點操作。放行的話，
  // 上面剛設好的 pendingMeFocus 會被自己的重繪立刻清空：連續兩個 renderMeDestination()
  // 在同一顆 rAF 之前接力發生時（例如 showMePage 同時觸發 reloadCurrentProfile 與
  // refreshNotificationSettings，兩者都在本機 Supabase 上快到搶在下一顆 rAF 前完成），
  // 第二次呼叫的 captureMeFocus 會看到 activeElement 已經掉回 body、pendingMeFocus 也被
  // 清空，焦點意圖永久遺失，即使兩邊都有各自對應的 kind 分支也救不回來
  // （fix round 1 實測抓到此案例，非臆測）。
  suppressMeFocusRelease = true;
  renderMePage(root, {
    authSession,
    avatarUrl: currentAuthAvatarUrl(),
    blockedPlayers: state.blockedPlayers,
    blockedPlayersError: state.blockedPlayersError,
    blockedPlayersStatus: state.blockedPlayersStatus,
    courts,
    notificationSettings,
    onEditProfile: () => openProfileCompletion({ mode: "standalone" }),
    onEnablePush: enablePushNotifications,
    onSaveCourtSubscriptions: updateCourtSubscriptions,
    onSaveNotificationPreferences: updateNotificationPreferences,
    onSetOpenToGreeting: updateOpenToGreetingSetting,
    onSetPresenceSharing: updatePresenceSharing,
    onSignIn: () => openSafeLogin({ action: "me" }),
    onSignOut: handleSignOut,
    onTogglePlayerVisibility: controller?.togglePlayerVisibility,
    onUnblockPlayer: controller?.unblockPlayer,
    playerVisibility: state.isPublic === true,
    presence: presenceSettingsForProfile(),
    profile: currentProfile ?? defaultProfile(),
    supportHref: supportContactHref(),
  });
  suppressMeFocusRelease = false;
  restoreMeFocus(root, focus, generation);
  syncBottomNavigation();
}

function showMapPage({ focus = false } = {}) {
  activePage = "map";
  pendingMeFocus = null;
  pendingMySessionsFocus = null;
  document.getElementById("tab-map").hidden = false;
  document.getElementById("my-sessions-page").hidden = true;
  document.getElementById("me-page").hidden = true;
  syncBottomNavigation();
  if (focus) requestAnimationFrame(() => document.getElementById("map-tab")?.focus({ preventScroll: true }));
}

function showMySessionsPage(createdSessionId = null, { focus = false } = {}) {
  activePage = "my-sessions";
  pendingMeFocus = null;
  if (createdSessionId != null) createdSessionFocusId = createdSessionId;
  controller.setDrawerExpanded(false);
  document.getElementById("tab-map").hidden = true;
  document.getElementById("me-page").hidden = true;
  const page = document.getElementById("my-sessions-page");
  page.hidden = false;
  renderMySessionsDestination();
  void controller.refreshMySessions().then(() => {
    if (activePage === "my-sessions") renderMySessionsDestination();
    else if (activePage === "me") renderMeDestination();
  });
  if (focus) {
    requestAnimationFrame(() => {
      document.querySelector("#my-sessions-root [data-my-sessions-heading]")?.focus({ preventScroll: true });
    });
  }
}

function showMePage({ focus = false, focusNotificationSettings = false } = {}) {
  activePage = "me";
  pendingMySessionsFocus = null;
  // reloadCurrentProfile／refreshNotificationSettings 下面都是 fire-and-forget，兩者完成
  // 時各自呼叫 renderMeDestination()。若在下面那顆 rAF 真的把焦點送進通知設定標題「之前」，
  // 這兩個背景重繪其中一個先跑，captureMeFocus 會看到 activeElement 還停在 body（因為
  // rAF 還沒排到），必須有 pendingMeFocus 這個字面種子讓 renderMeDestination 自己的
  // captureMeFocus(root) ?? pendingMeFocus 撿得到意圖，走既有的 restoreMeFocus／世代校驗
  // 管線把焦點送到（可能已經被重繪替換過的）新標題節點。沒有這行，兩個背景重繪前後夾殺時
  // 焦點會永久掉在 body——這是 fix round 1 實測抓到的既有機制邊界，不是單純漏一個 kind 分支。
  if (focusNotificationSettings) pendingMeFocus = { kind: "notification-settings-heading" };
  controller.setDrawerExpanded(false);
  document.getElementById("tab-map").hidden = true;
  document.getElementById("my-sessions-page").hidden = true;
  const page = document.getElementById("me-page");
  page.hidden = false;
  renderMeDestination();
  if (authSession && isSupabaseConfigured) void reloadCurrentProfile().catch(() => {});
  void refreshNotificationSettings();
  void controller.refreshMyPlayerBlocks();
  if (focus) requestAnimationFrame(() => document.querySelector("#me-root [data-me-heading]")?.focus({ preventScroll: true }));
  if (focusNotificationSettings) {
    // 這顆 rAF 是快樂路徑：多數情況下背景重繪還沒發生，它先把焦點送到位並讓頁面自然捲到
    // 通知設定區（preventScroll:false）。上面 seed 的 pendingMeFocus 則是兜底：就算它被
    // 背景重繪搶先一步，既有 restoreMeFocus 管線仍會用 preventScroll:true 把焦點送回正確
    // 節點，只是不保證那一次會自動捲動。
    requestAnimationFrame(() => {
      document.querySelector("#me-root [data-notification-settings-heading]")?.focus({ preventScroll: false });
    });
  }
}

function renderBaseCourtPins() {
  if (!google || !map) return;
  courtMarkers = renderCourtBasePins(google, map, courts, (court) => controller.openCourt(court), courtMarkers);
}

function wireFilters() {
  document.getElementById("date-filter").addEventListener("input", (event) => controller.setFilter("date", event.currentTarget.value || null));

  const chip = document.getElementById("level-chip");
  const popover = document.getElementById("level-popover");
  document.getElementById("band-options").innerHTML = BANDS.map(
    (band) =>
      `<button type="button" class="band-option${band.key === "all" ? " is-active" : ""}" data-band="${esc(
        band.key
      )}" aria-pressed="${band.key === "all"}">${esc(band.label)}</button>`
  ).join("");
  chip.addEventListener("click", () => {
    popover.hidden = !popover.hidden;
    chip.setAttribute("aria-expanded", String(!popover.hidden));
  });
  document.querySelectorAll("[data-band]").forEach((button) => {
    button.addEventListener("click", () => {
      controller.setFilter("band", button.dataset.band);
      popover.hidden = true;
      chip.setAttribute("aria-expanded", "false");
    });
  });

  document.getElementById("filter-sheet-open").addEventListener("click", () => {
    activeFilterSheet = openFilters();
  });
}

async function loadCourtsImmediately() {
  try {
    courts = await loadCourts();
    courtsReady = true;
    courtCatalogueStatus = "ready";
    controller.setCourts(courts, { ready: true });
    if (authSession && profileLoadStatus === "ready") {
      await controller.setAuthState(authSession, currentProfileEligibility());
    }
    renderBaseCourtPins();
    if (activePage === "my-sessions") renderMySessionsDestination();
    else if (activePage === "me") renderMeDestination();
  } catch {
    courts = [];
    courtsReady = false;
    courtCatalogueStatus = "error";
    controller.setCourts([], { ready: false });
    if (authSession && profileLoadStatus === "ready") {
      await controller.setAuthState(authSession, currentProfileEligibility());
    }
    if (activePage === "my-sessions") renderMySessionsDestination();
    else if (activePage === "me") renderMeDestination();
    toast("球場資料暫時無法載入。");
  }
}

function authIdentity(session) {
  const value = session?.user?.id ?? session?.access_token ?? null;
  return value == null ? null : String(value);
}

async function reloadCurrentProfile() {
  const epoch = authStateEpoch;
  const identity = currentAuthIdentity;
  const profileLoadRevision = profileRevision;
  let profile = null;
  let loadFailed = false;
  try {
    profile = await loadCurrentProfile();
  } catch {
    loadFailed = true;
  }
  if (epoch !== authStateEpoch || identity !== currentAuthIdentity || profileLoadRevision !== profileRevision) return false;
  if (loadFailed) {
    // A refresh failure must never turn a previously known profile into an
    // editable blank replacement form. Initial failures remain blocked
    // until the next successful auth/profile load.
    if (profileLoadStatus !== "ready") {
      profileLoadStatus = "error";
      await controller.setAuthState(authSession, { directory: false, nickname: false, ntrp: false, status: "error" });
    }
    throw new Error("個人檔案暫時無法載入，請重新整理後再試。");
  }
  currentProfile = profile ?? defaultProfile();
  profileLoadStatus = "ready";
  await controller.setAuthState(authSession, currentProfileEligibility());
  reconcilePresenceTracking();
  renderMeDestination();
  return true;
}

function applyAuthCandidate(session) {
  ++authStateEpoch;
  const identity = authIdentity(session);
  const previousIdentity = currentAuthIdentity;
  const identityChanged = previousIdentity !== identity;
  if (identityChanged) closeActiveProfileCompletion();
  currentAuthIdentity = identity;
  authSession = session ?? null;
  // Only a genuinely different account may clear the controller's profile
  // state. Auth token refreshes for the same account must not invalidate an
  // open confirmation or temporarily make an eligible profile unavailable.
  if (identityChanged) {
    stopPresenceTracking();
    presenceLocationStatus = "idle";
    profileRevision += 1;
    currentProfile = defaultProfile();
    notificationSettings = defaultNotificationSettings();
    profileLoadStatus = session ? "loading" : "idle";
    void controller.setAuthState(session, session ? { directory: false, nickname: false, ntrp: false, status: "loading" } : null);
  }
  if (!session) {
    stopPresenceTracking();
    presenceLocationStatus = "idle";
    currentProfile = defaultProfile();
    notificationSettings = defaultNotificationSettings();
    profileLoadStatus = "idle";
    renderMeDestination();
    return;
  }
  renderMeDestination();
  void reloadCurrentProfile().catch(() => {});
}

async function restoreAuth() {
  const bootstrapIntentVersion = controller.capturePendingIntentVersion();
  onAuthStateChange((session, event) => {
    if (!session && event === "SIGNED_OUT") controller.clearPendingIntent();
    applyAuthCandidate(session);
  });
  const initialEpoch = authStateEpoch;
  let initialSession = null;
  let initialSessionResolved = false;
  try {
    initialSession = await getInitialSession();
    initialSessionResolved = true;
  } catch {
    // Preserve a recoverable join/create return intent when a token refresh
    // or auth transport request is temporarily unavailable. A later auth
    // event can still complete restoration without pretending this was logout.
  }
  // getInitialSession waits for Supabase's URL/session initialization. Clear a
  // stale intent only after that result is definitively anonymous, so an OAuth
  // callback cannot lose its return intent during client startup.
  if (initialSessionResolved && !initialSession && !authSession) {
    controller.clearPendingIntentIfUnchanged(bootstrapIntentVersion);
  }
  if (!initialSessionResolved || initialEpoch !== authStateEpoch) return;
  applyAuthCandidate(initialSession);
}

function diagnoseMapFailure(message) {
  if (import.meta.env?.DEV) console.warn(message);
}

function startMap() {
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === "___") {
    controller.setMapUnavailable();
    return;
  }
  let authFailed = false;
  loadGoogleMaps(GOOGLE_MAPS_API_KEY, () => {
    authFailed = true;
    // Keep this deliberately diagnostic-only: the public UI has a list fallback.
    diagnoseMapFailure("Google Maps 驗證失敗；已切換為球局清單。");
    controller.setMapUnavailable();
  })
    .then((mapsApi) => {
      if (authFailed) return;
      google = mapsApi;
      map = createMap(google, document.getElementById("map"));
      controller.attachMap(map);
      renderBaseCourtPins();
      renderSessionMarkers(controller.getVisibleSessions());
      renderPlayerLayer(latestPlayerLayerView);
    })
    .catch(() => {
      diagnoseMapFailure("Google Maps 載入失敗；已切換為球局清單。");
      controller.setMapUnavailable();
    });
}

function init() {
  controller = createSessionController({
    api: {
      acceptSessionParticipant,
      cancelSession,
      confirmSessionAttendance,
      createReport,
      createSession,
      decideSessionCourt,
      declineSessionParticipant,
      loadMySessions,
      loadMyPlayerBlocks,
      loadPlayerDirectory,
      loadPlayerPresenceDirectory,
      loadSessionDiscovery,
      loadSessionMessages,
      loadSessionJoinPreview,
      loadSessionRoster,
      loadSessionSummary,
      markSessionPlayed,
      requestToJoinSession,
      inviteToSession,
      respondToSessionInvite,
      setPlayerVisibility,
      setPlayerBlock,
      setOpenToGreeting,
      setPresenceSharing,
      loadCourtSubscriptions,
      saveCourtSubscriptions,
      postSessionMessage,
      updateSession,
      updateMyPresence,
      withdrawFromSession,
    },
    mapTools: { getMapBounds, subscribeToMapIdle, setUserLocation, fitTaipei: fitTaipeiBounds },
    render: renderDiscovery,
    renderPins: renderSessionMarkers,
    renderPlayers: renderPlayerLayer,
    openSession: (session, handlers) =>
      openSessionSheet(session, {
        ...handlers,
        onCopyLink: () => copySessionShareLink(session.sessionId),
      }),
    openJoinConfirmation: (session, handlers) =>
      openJoinSessionConfirmation(session, {
        ...handlers,
        notificationSettings,
        onEnablePush: enablePushNotifications,
        onViewMySessions: () => showMySessionsPage(null, { focus: true }),
      }),
    openCourtDrawer: (court, sessions, handlers) => openCourtSessionDrawer(court, sessions, handlers),
    openCourtPlayersDrawer: (court, players, handlers) => openCourtPlayersDrawer(court, players, handlers),
    openPlayerDirectoryList: (handlers) => openPlayerDirectoryList(handlers),
    openPlayerCard: (player, handlers) => openPlayerCardSheet(player, handlers),
    openCreateSession,
    openDecideSession: openDecideSessionSheet,
    openEditSession: openEditSessionSheet,
    openChat: openSessionChatSheet,
    openLogin: openSafeLogin,
    openReport: (context) => openReportDialog(context),
    openWithdrawConfirmation: openWithdrawSessionConfirmation,
    promptProfile: openProfileCompletion,
    reloadCurrentProfile,
    showCreatedSession: showMySessionsPage,
    onMySessionsChange: () => {
      if (!controller) return;
      // Keep the hidden destination in sync as well. Otherwise an account
      // switch made from the map page could leave a prior account's private
      // roster values in a hidden DOM subtree.
      renderMySessionsDestination();
      if (activePage === "me") renderMeDestination();
    },
    toast,
  });
  renderMeDestination();
  wireFilters();
  document.getElementById("use-my-location").addEventListener("click", () => controller.requestCurrentLocation());
  document.getElementById("player-layer-toggle").addEventListener("click", () => controller.togglePlayerLayer());
  document.getElementById("player-directory-open").addEventListener("click", () => controller.openPlayerDirectory());
  document.querySelector(".app-brand").addEventListener("click", (event) => {
    event.preventDefault();
    showMapPage({ focus: true });
  });
  document.getElementById("map-tab").addEventListener("click", () => showMapPage());
  document.getElementById("create-session-tab").addEventListener("click", () => controller.openCreateIntent());
  document.getElementById("my-sessions-tab").addEventListener("click", () => showMySessionsPage());
  document.getElementById("me-tab").addEventListener("click", () => showMePage());
  globalThis.addEventListener("hashchange", () => {
    void openSessionHashRoute();
  });
  syncBottomNavigation();

  // None of these awaits the others: court pins and discovery work before auth.
  loadCourtsImmediately();
  controller.loadDiscovery();
  restoreAuth();
  startMap();
  void openSessionHashRoute();
}

init();
