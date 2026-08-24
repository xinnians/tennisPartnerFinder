/* 批 10 CSS 收整:src/session.css(1429 行)依既有實體邊界切成下列各檔,宣告順序逐行保存。
   **這串 import 的次序就是層疊次序**(本專案未用 @layer,理由見
   docs/migration-reports/batch-10.md §3):同特異性時後 import 的檔勝出,
   調換次序會靜默改變視覺。新增樣式檔請先確認它該落在哪一段,再插進對應位置。
   session.css 只剩「設計 token + 球局詳情 + 群組聊天」三塊；
   tests/contrast-tokens.test.js 會自動讀取 src/ 全部 CSS,不再限制 token 所在檔。 */
import "./style.css"; /* 1 全域 reset/base */
import "./map-page.css"; /* 2 地圖頁殼、topbar、工具列 chips、程度 popover */
import "./discovery.css"; /* 3 附近球局 peek/抽屜、球局卡、badge、地圖狀態列 */
import "./surfaces.css"; /* 4 .surface 基底、表單語彙、篩選 sheet */
import "./sheet-shells.css"; /* 5 跨 sheet 共用殼(貼邊殼、全螢幕殼、拉把、註腳) */
import "./navigation.css"; /* 6 底部導覽、徽章、visually-hidden */
import "./pages.css"; /* 7 我的球局／訊息／我 三頁 */
import "./session.css"; /* 8 設計 token + 球局詳情 sheet + 群組聊天(組合原因見該檔檔頭) */
import "./create-session.css"; /* 9 開球局全螢幕流程與 toast */
import "./responsive.css"; /* 10 700px／390px 斷點覆寫 */
import "./vocabulary.css"; /* 11 D1 基礎語彙(time-tile／chip／toggle…) */
import "./player-sheets.css"; /* 12 球友名單與球友卡 sheet */
import "./motion.css"; /* 13 keyframes、按壓回饋、reduced-motion */

if (import.meta.env.PROD) {
  void import("@vercel/analytics").then(({ inject }) => {
    inject({ mode: "production" });
  });
}

import { AUTH_LINE_PROVIDER_ID, GOOGLE_MAPS_API_KEY, SUPPORT_EMAIL } from "./config.js";
import { joinableSessionCount } from "./filters.js";
import {
  configureFilterToolbarFeature,
  syncFilterToolbar,
  wireFilters,
} from "./features/filters/filterToolbarFeature.js";
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
  zoomMapBy,
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
  isSupabaseConfigured,
  linkLoginIdentity,
  loadCourts,
  loadCurrentProfile,
  loadMySessions,
  loadMyPlayerBlocks,
  loadPlayerDirectory,
  loadPlayerPresenceDirectory,
  loadSessionDiscovery,
  loadSessionMessages,
  loadSessionJoinPreview,
  loadSessionRoster,
  loadSessionSummary,
  markSessionChatRead,
  markSessionPlayed,
  onAuthStateChange,
  postSessionMessage,
  requestToJoinSession,
  respondToSessionInvite,
  saveCurrentProfile,
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
import { installGlobalErrorHandlers, showGlobalErrorNotice } from "./appErrors.ts";
import { createSessionController } from "./sessionController.js";
import { createStore } from "./sessionStore.ts";
import {
  openCourtSessionDrawer,
  openCourtPlayersDrawer,
  openCreateSessionSheet,
  openDecideSessionSheet,
  openEditSessionSheet,
  openFilterSheet,
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
  renderMessagesPage,
  renderMySessionsPage,
  renderNearbySessionsDrawer,
  nearbySessionsSummaryText,
} from "./sessionViews.js";
import { openLoginModal } from "./sheets.js";
import {
  createNotificationFeature,
  defaultNotificationSettings,
} from "./features/notifications/notificationFeature.ts";
import { configureShareFeature, copySessionShareLink } from "./features/share/shareFeature.js";
import {
  configurePresenceFeature,
  presenceSettingsForProfile,
  reconcilePresenceTracking,
  resetPresenceTracking,
  updateOpenToGreetingSetting,
  updatePresenceSharing,
} from "./features/presence/presenceFeature.js";
import { eligibilityFromPrivateProfile } from "./profile.js";
import { createRequestGate } from "./requestGate.js";
import { sessionIdFromHash } from "./sessionRoute.js";
import { esc } from "./util.js";

installGlobalErrorHandlers(globalThis.window, {
  onCaptured: () => showGlobalErrorNotice(document),
});

let google = null;
let map = null;
let courtCatalogueStatus = "loading";
let sessionMarkers = [];
let courtMarkers = [];
let playerMarkers = [];
let latestPlayerLayerView = { groups: [], message: "", on: false, status: "idle" };
let controller;
const authRequestGate = createRequestGate();
// 資料庫裡是否已經有這個帳號的 profiles 列。
// 這是「這人有沒有表態過球場訂閱」的唯一可靠訊號:private.ensure_notification_profile()
// (202607230001:93)在任何通知 RPC 上都會 insert 一列 profiles,所以「沒有列」等價於
// 「從沒呼叫過 save_my_profile,也從沒呼叫過任何通知 RPC」——不可能表態過。
// 「零訂閱」本身分不出「從沒選過」與「明確選了零座」,不可拿來當判斷依據。
let storedProfileExists = false;
let activeProfileCompletion = null;

function getAppState() {
  return controller?.getAppState?.() ?? { authSession: null, courts: [], courtsReady: false, profile: null };
}

configureFilterToolbarFeature({
  getAppState,
  getController: () => controller,
  openFilterSheet,
});

function currentProfileEligibility(profile = getAppState().profile) {
  const { courts, courtsReady } = getAppState();
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
// 批 C3-3:createdSessionFocusId 現在同時服務 create 與 join 兩種來源
// ("created"|"joined")。reason 只決定 My Sessions 訂閱 selector 要不要把它
// 當成 createdSessionId(觸發「球局已建立」文案＋create 專屬推播 prompt)往下傳；
// 卡片聚焦本身兩種 reason 都要做,見 renderMySessionsPage 的 highlightSessionId。
let createdSessionFocusReason = null;
let notificationSettings = defaultNotificationSettings();
let presenceLocationStatus = "idle";
const pageViewStore = createStore({
  createdSessionFocusId,
  createdSessionFocusReason,
  notificationSettings,
  presenceLocationStatus,
});

function publishPageView(...channels) {
  pageViewStore.setState({
    createdSessionFocusId,
    createdSessionFocusReason,
    notificationSettings,
    presenceLocationStatus,
  });
  for (const channel of channels) pageViewStore.emit(channel);
}
let sessionHashRouteGeneration = 0;

function toast(message) {
  const root = document.getElementById("toast-root");
  root.innerHTML = `<div class="toast"><svg class="toast__check" width="15" height="15" viewBox="0 0 15 15" aria-hidden="true"><path d="M2.5 8l3.2 3.2L12.5 4" fill="none" stroke="var(--color-signal)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>${esc(message)}</div>`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (root.innerHTML = ""), 2000);
}

configureShareFeature({ toast });

async function openSessionHashRoute() {
  const sessionId = sessionIdFromHash(globalThis.location?.hash);
  if (!sessionId || !controller) return;
  const generation = ++sessionHashRouteGeneration;
  showMapPage();
  const result = await controller.openSessionFromLink(sessionId);
  if (generation !== sessionHashRouteGeneration || sessionId !== sessionIdFromHash(globalThis.location?.hash)) return;
  if (result?.status !== "opened") openSessionUnavailableSheet();
}

// 冷啟動深連結(推播點擊)與 auth 還原是純競速:sheet 常在 profile 落地前先開,
// CTA 註記(如「尚未填寫程度」)被記進 actionKey;profile-ready 的 setAuthState 觸發
// reconcile 時 actionKey 已變,sheet 被 stale-authority 保護收掉且不重開(2026-08-17
// 探針 4/4 重現,關閉發生在開啟後 300ms 內)。拍板修法「自動重開」:boot 帶深連結時,
// 首次 profile-ready 的 setAuthState 鏈(含 reloadParticipation 與 resumePendingIntent)
// 落地後重跑一次 hash route——被收掉就重開、倖存則就地升級(openSessionFromLink 對
// 已開的同 session 不重開)。一次性,不與使用者之後的手動關閉搶 sheet。
let bootDeepLinkReopenPending = Boolean(sessionIdFromHash(globalThis.location?.hash));

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

function currentAuthAvatarUrl() {
  const { authSession } = getAppState();
  const metadata = authSession?.user?.user_metadata ?? {};
  return metadata.avatar_url ?? metadata.picture ?? "";
}

// 連結登入方式(manual identity linking)。回跳意圖走 sessionStorage flag,
// 不進 sessionIntent 的 action 白名單——那條管線是「登入後接續某個球局操作」,語意不同。
const LINK_RETURN_KEY = "tennis-link-return";

// linkIdentity 失敗時 GoTrue 只會把 error 參數帶回 redirect URL;supabase-js 初始化後會
// 清理 URL,所以在模組載入當下同步抓一份,只供連結回報使用。
const bootAuthParams = (() => {
  const merged = new URLSearchParams(globalThis.location?.search ?? "");
  for (const [key, value] of new URLSearchParams((globalThis.location?.hash ?? "").replace(/^#/, "")))
    merged.set(key, value);
  return merged;
})();

function currentLinkedProviders() {
  const { authSession } = getAppState();
  return (authSession?.user?.identities ?? []).map((identity) => identity.provider);
}

async function handleLinkProvider(provider) {
  try {
    sessionStorage.setItem(LINK_RETURN_KEY, provider);
    await linkLoginIdentity(provider);
  } catch {
    sessionStorage.removeItem(LINK_RETURN_KEY);
    toast("連結啟動失敗，請稍後再試。");
  }
}

function resumeLinkReturn() {
  // eslint-disable-next-line no-useless-assignment -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
  let provider = null;
  try {
    provider = sessionStorage.getItem(LINK_RETURN_KEY);
    if (provider) sessionStorage.removeItem(LINK_RETURN_KEY);
  } catch {
    return;
  }
  if (!provider) return;
  showMePage();
  if (currentLinkedProviders().includes(provider)) {
    toast("已連結新的登入方式。");
  } else if (bootAuthParams.get("error") || bootAuthParams.get("error_description")) {
    toast("連結未完成：這個帳號可能已綁定其他使用者。");
  }
  // 既未成功也無錯誤參數時不回報——token 可能還在換發,以「登入方式」列表狀態為準。
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
  const openedIdentity = authIdentity(getAppState().authSession);
  let mounted = null;
  // 判斷點取在「存檔前」:存檔本身會建立 profiles 列,存檔後再問就永遠是 true。
  let seedCourtSubscriptionsAfterSave = false;
  mounted = openProfileCompletionSheet({
    avatarUrl: currentAuthAvatarUrl(),
    courts: selectableCourts ?? getAppState().courts,
    courtsReady: formCourtsReady ?? getAppState().courtsReady,
    mode,
    onClose: (detail) => {
      if (activeProfileCompletion === mounted) {
        activeProfileCompletion = null;
      }
      onClose(detail);
    },
    onSave: async (draft) => {
      if (!isSupabaseConfigured) throw new Error(LOCAL_DEMO_UNAVAILABLE);
      if (!openedIdentity || openedIdentity !== authIdentity(getAppState().authSession)) {
        throw new Error("登入狀態已變更，請重新開啟個人檔案。");
      }
      if (profileLoadStatus !== "ready") {
        throw new Error("個人檔案暫時無法載入，請重新整理後再試。");
      }
      const wasFirstStoredProfile = !storedProfileExists;
      const saved = await saveCurrentProfile(draft);
      if (openedIdentity !== authIdentity(getAppState().authSession)) {
        throw new Error("登入狀態已變更，請重新開啟個人檔案。");
      }
      profileRevision += 1;
      profileLoadStatus = "ready";
      storedProfileExists = true;
      seedCourtSubscriptionsAfterSave = wasFirstStoredProfile;
      const profile = saved ?? draft;
      controller.setProfile(profile);
      return profile;
    },
    onSaved: async (savedProfile) => {
      if (openedIdentity !== authIdentity(getAppState().authSession)) return;
      controller.setProfile(savedProfile ?? getAppState().profile ?? defaultProfile());
      const { authSession } = getAppState();
      if (!authSession) return;
      // 種入排在存檔成功之後、重繪之前:存檔結果已經定案,種入失敗影響不到它,
      // 而重繪能立刻反映訂到全部後的收合態。
      if (seedCourtSubscriptionsAfterSave) {
        seedCourtSubscriptionsAfterSave = false;
        await seedAllTaipeiCourtSubscriptions();
      }
      await controller.setAuthState(authSession, currentProfileEligibility());
      // 身分卡顯示暱稱與 NTRP，存檔後要立刻反映新值。
      if (activePage !== "me") return;
      // standalone 編輯完成後明確送回入口；這是 sheet 旅程的完成落點，
      // 與頁面 store 更新時由 React 自然保留的焦點互不重疊。
      if (mode === "standalone") {
        requestAnimationFrame(() => {
          document.querySelector('#me-root [data-testid="edit-profile"]')?.focus({ preventScroll: true });
        });
      }
    },
    intent,
    profile: getAppState().profile ?? defaultProfile(),
    returnSession: intent?.action === "join" ? returnSession : null,
  });
  activeProfileCompletion = mounted;
  return mounted;
}

function openCreateSession({
  courts: selectableCourts,
  courtsReady: formCourtsReady,
  onClose,
  onSubmit,
  onViewMySessions,
} = {}) {
  return openCreateSessionSheet({
    courts: selectableCourts ?? getAppState().courts,
    courtsReady: formCourtsReady ?? getAppState().courtsReady,
    onClose,
    onSubmit,
    onViewMySessions,
    toast,
  });
}

function renderSessionMarkers(sessions) {
  if (!google || !map) return;
  const groups = groupSessionsByCourt(getAppState().courts, sessions);
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

function mountNearbyDestination() {
  renderNearbySessionsDrawer(document.getElementById("nearby-sessions-drawer"), {
    authenticated: Boolean(getAppState().authSession),
    onExpandBounds: controller.expandBounds,
    onOpenCreate: controller.openCreateIntent,
    onOpenSession: controller.openSession,
    onReset: controller.resetFilters,
    onRetry: controller.retryDiscovery,
    onSubscribe: () => showMePage({ focusNotificationSettings: true }),
    onToggle: controller.setDrawerState,
    sessionStore: controller.sessionStore,
  });
}

function renderDiscovery(view) {
  syncFilterToolbar(view.filters, view.sessions.length);
  // 篩選 sheet footer 主鈕「看 N 場球局」與 peek/抽屜同一份 view.sessions,
  // 篩選一改就即時跟隨(dc L469)。
  renderMapDataStatus(document.getElementById("map-data-status"), {
    ...view.mapStatus,
    locationMessage: view.locationMessage,
    onRetry: controller.retryDiscovery,
  });
  // #nearby-sessions-count-status 是 index.html 裡固定不動的持久節點,不在
  // renderNearbySessionsDrawer 每次 innerHTML 整段重建的範圍內——比照
  // #my-sessions-badge-status(見 syncBottomNavigation)的模式,只在原地更新
  // textContent,螢幕閱讀器才能可靠收到這顆 live region 的計數變動播報;掛在會被
  // 摧毀重建的節點上,新節點帶著 aria-live 屬性一起被建立時,AT 不保證會註冊到它。
  const countStatus = document.getElementById("nearby-sessions-count-status");
  if (countStatus)
    countStatus.textContent = nearbySessionsSummaryText(joinableSessionCount(view.sessions), view.hasUserLocation);
}

function syncBottomNavigation() {
  const mapTab = document.getElementById("map-tab");
  const mySessionsTab = document.getElementById("my-sessions-tab");
  const messagesTab = document.getElementById("messages-tab");
  const meTab = document.getElementById("me-tab");
  if (activePage === "map") mapTab?.setAttribute("aria-current", "page");
  else mapTab?.removeAttribute("aria-current");
  if (activePage === "my-sessions") mySessionsTab?.setAttribute("aria-current", "page");
  else mySessionsTab?.removeAttribute("aria-current");
  if (activePage === "messages") messagesTab?.setAttribute("aria-current", "page");
  else messagesTab?.removeAttribute("aria-current");
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
  // 批 C4-2 起:未讀圓點是獨立於 needsActionCount 的第二個聚合信號(任一局
  // unread>0),不取代、也不合併進數字徽章本身——兩者可同時出現。圓點對 AT 一律
  // 靜默(aria-hidden,比照數字徽章)。批 D7 起圓點與其播報改隸屬「訊息」格
  // (dc chatsBadge 語意)——my-sessions-tab 的 aria-label 不再帶「有未讀訊息」段,
  // 改由 messages-tab 承載,跟既有 #my-sessions-badge-status live region 的分工
  // 模式一致(各自 tab 自己的 aria-label 負責播報自己的聚合信號)。
  const hasUnread = mySessionState?.groups?.hasUnread === true;
  const unreadDot = document.getElementById("my-sessions-unread-dot");
  if (unreadDot) unreadDot.hidden = !hasUnread;
  const badgeLabel = `我的球局${count > 0 ? `，${count} 項待處理` : ""}`;
  mySessionsTab?.setAttribute("aria-label", badgeLabel);
  const badgeStatus = document.getElementById("my-sessions-badge-status");
  if (badgeStatus) badgeStatus.textContent = count > 0 ? `${count} 項待處理` : "沒有待處理事項";
  const messagesLabel = `訊息${hasUnread ? "，有未讀訊息" : ""}`;
  messagesTab?.setAttribute("aria-label", messagesLabel);
}

function captureAuthRequest(isCurrent = () => true) {
  const identity = authIdentity(getAppState().authSession);
  const token = authRequestGate.capture(
    () => Boolean(getAppState().authSession) && identity === authIdentity(getAppState().authSession) && isCurrent()
  );
  return { identity, isStale: token.isStale };
}

function publishMeSettingsPageView() {
  publishPageView("me", "mySessions");
}

configurePresenceFeature({
  captureAuthRequest,
  currentProfileEligibility,
  defaultProfile,
  getAppState,
  getLocationStatus: () => presenceLocationStatus,
  openProfileCompletion: (...args) => openProfileCompletion(...args),
  publishMePageView: () => publishPageView("me"),
  publishMeSettingsPageView,
  setLocationStatus: (status) => {
    presenceLocationStatus = status;
  },
  setProfile: (profile) => controller.setProfile(profile),
  toast,
});

const notificationFeature = createNotificationFeature({
  captureAuthRequest,
  getAuthSession: () => getAppState().authSession,
  getCourts: () => getAppState().courts,
  getSettings: () => notificationSettings,
  rerenderVisibleSettings: publishMeSettingsPageView,
  setSettings: (settings) => {
    notificationSettings = settings;
  },
  toast,
});

function refreshNotificationSettings() {
  return notificationFeature.refreshNotificationSettings();
}

function updateNotificationPreferences(preferences) {
  return notificationFeature.updateNotificationPreferences(preferences);
}

function updateCourtSubscriptions(courtIds) {
  return notificationFeature.updateCourtSubscriptions(courtIds);
}

function seedAllTaipeiCourtSubscriptions() {
  return notificationFeature.seedAllTaipeiCourtSubscriptions();
}

function enablePushNotifications() {
  return notificationFeature.enablePushNotifications();
}

function mountMySessionsDestination() {
  if (!controller) return;
  const state = controller.getMySessionState();
  // 批 C3-3:createdSessionFocusId 拆成兩個用途——highlightSessionId 給卡片聚焦
  // (create/joined 都要),createdSessionId 只在 reason==="created" 時才往下傳,
  // 避免 join 使用者看到 create 專屬的「球局已建立」文案與推播 prompt
  // (renderMySessionsPage 內兩處分支,見 ground truth 意外 3)。
  const focusSessionId = createdSessionFocusId;
  const createdSessionId = createdSessionFocusReason === "created" ? focusSessionId : null;
  const root = document.getElementById("my-sessions-root");
  renderMySessionsPage(root, {
    actionScopeKey: state.viewGeneration,
    authenticated: state.authenticated,
    courts: getAppState().courts,
    createdSessionId,
    highlightSessionId: focusSessionId,
    errorMessage: state.error,
    groups: state.groups,
    onAccept: (sessionId, participantId) => controller.reviewMySessionParticipant(sessionId, participantId, "accepted"),
    onAcceptInvite: (sessionId) => controller.respondInvite(sessionId, "accepted"),
    onBack: () => showMapPage({ focus: true }),
    onCancel: controller.cancelMySession,
    onConfirmAttendance: controller.confirmMySessionAttendance,
    onCreatedSessionFocus: (expectedSessionId = focusSessionId) => {
      if (createdSessionFocusId !== expectedSessionId) return false;
      createdSessionFocusId = null;
      createdSessionFocusReason = null;
      publishPageView("mySessions");
      return true;
    },
    // 批 D6:「我主揪的」分頁空狀態「開球局」鈕——沿用底部導覽 create-session-tab
    // 同一個入口(controller.openCreateIntent 已含 auth/profile gate),不重新實作。
    onCreateSession: () => controller.openCreateIntent(),
    onDecline: (sessionId, participantId) =>
      controller.reviewMySessionParticipant(sessionId, participantId, "declined"),
    onDeclineInvite: (sessionId) => controller.respondInvite(sessionId, "declined"),
    onDecide: controller.openSessionDecision,
    onEdit: controller.openSessionEdit,
    onEnablePush: enablePushNotifications,
    onMarkPlayed: controller.markMySessionPlayed,
    onOpenChat: controller.openSessionChat,
    onOpenSession: controller.openSession,
    onRefresh: () => controller.refreshMySessions(),
    onReportParticipant: controller.openRosterParticipantReport,
    onReportSession: controller.openSessionReport,
    onSignIn: () => openSafeLogin({ action: "my-sessions" }),
    notificationSettings,
    pageViewStore,
    sessionStore: controller.sessionStore,
    status: state.status,
    onWithdraw: controller.withdrawMySession,
  });
  syncBottomNavigation();
}

function mountMeDestination() {
  const root = document.getElementById("me-root");
  if (!root) return;
  const state = controller?.getMySessionState?.() ?? {};
  const { authSession, courts, profile } = getAppState();
  renderMePage(root, {
    authSession,
    avatarUrl: currentAuthAvatarUrl(),
    blockedPlayers: state.blockedPlayers,
    blockedPlayersError: state.blockedPlayersError,
    blockedPlayersStatus: state.blockedPlayersStatus,
    courts,
    lineProviderId: AUTH_LINE_PROVIDER_ID,
    linkedProviders: currentLinkedProviders(),
    notificationSettings,
    onEditProfile: () => openProfileCompletion({ mode: "standalone" }),
    onEnablePush: enablePushNotifications,
    onLinkProvider: handleLinkProvider,
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
    profile: profile ?? defaultProfile(),
    supportHref: supportContactHref(),
    pageViewStore,
    sessionStore: controller?.sessionStore,
  });
  syncBottomNavigation();
}

function mountMessagesDestination() {
  if (!controller) return;
  const root = document.getElementById("messages-root");
  if (!root) return;
  const state = controller.getMySessionState();
  renderMessagesPage(root, {
    courts: getAppState().courts,
    groups: state.groups,
    onOpenChat: (sessionId) => controller.openSessionChat(sessionId),
    sessionStore: controller.sessionStore,
  });
  syncBottomNavigation();
}

function showMapPage({ focus = false } = {}) {
  activePage = "map";
  document.getElementById("tab-map").hidden = false;
  document.getElementById("my-sessions-page").hidden = true;
  document.getElementById("messages-page").hidden = true;
  document.getElementById("me-page").hidden = true;
  syncBottomNavigation();
  if (focus) requestAnimationFrame(() => document.getElementById("map-tab")?.focus({ preventScroll: true }));
}

// 批 C3-3:第一參數泛化為 { sessionId, reason }(或 null/未傳＝無聚焦目標，例如底部
// 導覽「我的球局」分頁鈕)。reason 只決定 My Sessions 是否顯示
// create 專屬文案；卡片聚焦本身兩種 reason 都適用，見該函式內的 highlightSessionId。
function showMySessionsPage(focusTarget = null, { focus = false } = {}) {
  activePage = "my-sessions";
  if (focusTarget?.sessionId != null) {
    createdSessionFocusId = focusTarget.sessionId;
    createdSessionFocusReason = focusTarget.reason ?? null;
    publishPageView("mySessions");
  }
  controller.setDrawerState("collapsed");
  document.getElementById("tab-map").hidden = true;
  document.getElementById("messages-page").hidden = true;
  document.getElementById("me-page").hidden = true;
  const page = document.getElementById("my-sessions-page");
  page.hidden = false;
  syncBottomNavigation();
  void controller.refreshMySessions();
  if (focus) {
    requestAnimationFrame(() => {
      document.querySelector("#my-sessions-root [data-my-sessions-heading]")?.focus({ preventScroll: true });
    });
  }
}

function showMePage({ focus = false, focusNotificationSettings = false } = {}) {
  activePage = "me";
  controller.setDrawerState("collapsed");
  document.getElementById("tab-map").hidden = true;
  document.getElementById("my-sessions-page").hidden = true;
  document.getElementById("messages-page").hidden = true;
  const page = document.getElementById("me-page");
  page.hidden = false;
  syncBottomNavigation();
  if (getAppState().authSession && isSupabaseConfigured) void reloadCurrentProfile().catch(() => {});
  void refreshNotificationSettings();
  void controller.refreshMyPlayerBlocks();
  if (focus)
    requestAnimationFrame(() => document.querySelector("#me-root [data-me-heading]")?.focus({ preventScroll: true }));
  if (focusNotificationSettings) {
    // React 保留標題節點；這顆 rAF 只負責 navigation intent 的初始落點與捲動。
    requestAnimationFrame(() => {
      document.querySelector("#me-root [data-notification-settings-heading]")?.focus({ preventScroll: false });
    });
  }
}

// 批 D7:訊息頁不新增 dataApi 呼叫——不像 showMySessionsPage 會另外
// void controller.refreshMySessions()。setAuthState() 在登入/還原 session 時已經
// 觸發過 reloadParticipation(見 sessionController.js),訊息頁只讀那份既有 state,
// 不重複打 RPC。
function showMessagesPage({ focus = false } = {}) {
  activePage = "messages";
  controller.setDrawerState("collapsed");
  document.getElementById("tab-map").hidden = true;
  document.getElementById("my-sessions-page").hidden = true;
  document.getElementById("me-page").hidden = true;
  const page = document.getElementById("messages-page");
  page.hidden = false;
  syncBottomNavigation();
  if (focus) {
    requestAnimationFrame(() => {
      document.querySelector("#messages-root [data-messages-heading]")?.focus({ preventScroll: true });
    });
  }
}

function renderBaseCourtPins() {
  if (!google || !map) return;
  courtMarkers = renderCourtBasePins(
    google,
    map,
    getAppState().courts,
    (court) => controller.openCourt(court),
    courtMarkers
  );
}

async function loadCourtsImmediately() {
  try {
    const courts = await loadCourts();
    courtCatalogueStatus = "ready";
    controller.setCourts(courts, { ready: true });
    const { authSession } = getAppState();
    if (authSession && profileLoadStatus === "ready") {
      await controller.setAuthState(authSession, currentProfileEligibility());
    }
    renderBaseCourtPins();
  } catch {
    courtCatalogueStatus = "error";
    controller.setCourts([], { ready: false });
    const { authSession } = getAppState();
    if (authSession && profileLoadStatus === "ready") {
      await controller.setAuthState(authSession, currentProfileEligibility());
    }
    toast("球場資料暫時無法載入。");
  }
}

function authIdentity(session) {
  const value = session?.user?.id ?? session?.access_token ?? null;
  return value == null ? null : String(value);
}

async function reloadCurrentProfile() {
  const profileLoadRevision = profileRevision;
  const request = captureAuthRequest(() => profileLoadRevision === profileRevision);
  let profile = null;
  let loadFailed = false;
  try {
    profile = await loadCurrentProfile();
  } catch {
    loadFailed = true;
  }
  if (request.isStale()) return false;
  if (loadFailed) {
    // A refresh failure must never turn a previously known profile into an
    // editable blank replacement form. Initial failures remain blocked
    // until the next successful auth/profile load.
    if (profileLoadStatus !== "ready") {
      profileLoadStatus = "error";
      const { authSession } = getAppState();
      await controller.setAuthState(authSession, { directory: false, nickname: false, ntrp: false, status: "error" });
    }
    throw new Error("個人檔案暫時無法載入，請重新整理後再試。");
  }
  // loadCurrentProfile 在沒有 my_profile 列時回 null(dataApi.js:757);
  // store profile 隨即被 defaultProfile() 補齊,所以 null 這個訊號要在這裡就留下來。
  storedProfileExists = profile !== null;
  controller.setProfile(profile ?? defaultProfile());
  profileLoadStatus = "ready";
  const { authSession } = getAppState();
  await controller.setAuthState(authSession, currentProfileEligibility());
  reconcilePresenceTracking();
  if (bootDeepLinkReopenPending) {
    bootDeepLinkReopenPending = false;
    void openSessionHashRoute();
  }
  return true;
}

function handleAuthIdentityChange({ session }) {
  closeActiveProfileCompletion();
  resetPresenceTracking();
  profileRevision += 1;
  controller.setProfile(defaultProfile());
  storedProfileExists = false;
  notificationSettings = defaultNotificationSettings();
  publishPageView("me", "mySessions");
  profileLoadStatus = session ? "loading" : "idle";
  return session ? { directory: false, nickname: false, ntrp: false, status: "loading" } : null;
}

function applyAuthCandidate(session) {
  authRequestGate.invalidate();
  // Only a genuinely different account may clear the controller's profile
  // eligibility state. Auth token refreshes for the same account must not invalidate an
  // open confirmation or temporarily make an eligible profile unavailable.
  controller.setAuthSession(session);
  if (!session) {
    resetPresenceTracking();
    controller.setProfile(defaultProfile());
    storedProfileExists = false;
    notificationSettings = defaultNotificationSettings();
    publishPageView("me", "mySessions");
    profileLoadStatus = "idle";
    return;
  }
  void reloadCurrentProfile().catch(() => {});
  if (bootAuthParams.get("error") || bootAuthParams.get("error_description")) resumeLinkReturn();
}

async function restoreAuth() {
  const bootstrapIntentVersion = controller.capturePendingIntentVersion();
  onAuthStateChange((session, event) => {
    if (!session && event === "SIGNED_OUT") controller.clearPendingIntent();
    applyAuthCandidate(session);
    // 連結成功的回跳一定帶 SIGNED_IN(code 交換後的新 session 才有新 identities);
    // 失敗路徑沒有 SIGNED_IN,由 applyAuthCandidate 的 error 參數分支處理。
    if (session && event === "SIGNED_IN") resumeLinkReturn();
  });
  const initialRequest = authRequestGate.capture();
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
  if (initialSessionResolved && !initialSession && !getAppState().authSession) {
    controller.clearPendingIntentIfUnchanged(bootstrapIntentVersion);
  }
  if (!initialSessionResolved || initialRequest.isStale()) return;
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
      markSessionChatRead,
      markSessionPlayed,
      requestToJoinSession,
      inviteToSession,
      respondToSessionInvite,
      setPlayerVisibility,
      setPlayerBlock,
      setOpenToGreeting,
      setPresenceSharing,
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
      // 批 C3-2:join 確認/送出中/成功都內嵌同一張 detail sheet,不再有獨立的
      // openJoinConfirmation 接線——這裡把原本只給那條路徑的 notificationSettings/
      // onEnablePush/onViewMySessions 併入唯一的 openSession 接線。
      openSessionSheet(session, {
        ...handlers,
        notificationSettings,
        onCopyLink: () => copySessionShareLink(session.sessionId),
        onEnablePush: enablePushNotifications,
        // 批 C3-3:sheet 的成功 callback 把剛加入的 sessionId 交回來,
        // 用 reason:"joined" 聚焦新參與卡,不顯示 create 專屬的
        // 「球局已建立」文案——不再只聚焦頁面標題。
        onViewMySessions: (sessionId) => showMySessionsPage({ sessionId, reason: "joined" }),
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
    // 批 C3-3:controller 仍只傳原始 sessionId(見 sessionController.js 的
    // showCreatedSession(result?.sessionId))；這裡在接線邊界補上 reason:"created"，
    // controller 本身不需要知道 reason 字串這個 view 層概念。
    showCreatedSession: (sessionId) => showMySessionsPage({ sessionId, reason: "created" }),
    onAuthIdentityChange: handleAuthIdentityChange,
    onMySessionsChange: () => {
      if (!controller) return;
      // Keep the hidden destinations in sync as well. Otherwise an account
      // switch made from the map page could leave a prior account's private
      // roster values (or unread chat rows) in a hidden DOM subtree.
      syncBottomNavigation();
    },
    toast,
  });
  mountNearbyDestination();
  mountMySessionsDestination();
  mountMessagesDestination();
  mountMeDestination();
  wireFilters();
  document.getElementById("use-my-location").addEventListener("click", () => controller.requestCurrentLocation());
  // 批 D3:右下控制直欄縮放;地圖不可用(fallback 模式)時為安全 no-op。
  document.getElementById("map-zoom-in")?.addEventListener("click", () => zoomMapBy(1));
  document.getElementById("map-zoom-out")?.addEventListener("click", () => zoomMapBy(-1));
  document.getElementById("player-layer-toggle").addEventListener("click", () => controller.togglePlayerLayer());
  document.getElementById("player-directory-open").addEventListener("click", () => controller.openPlayerDirectory());
  document.querySelector(".app-brand").addEventListener("click", (event) => {
    event.preventDefault();
    showMapPage({ focus: true });
  });
  document.getElementById("map-tab").addEventListener("click", () => showMapPage());
  document.getElementById("create-session-tab").addEventListener("click", () => controller.openCreateIntent());
  document.getElementById("my-sessions-tab").addEventListener("click", () => showMySessionsPage());
  document.getElementById("messages-tab").addEventListener("click", () => showMessagesPage());
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
