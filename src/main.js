/* global __TENNIS_DEPLOY_ENVIRONMENT__ */
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

import {
  AUTH_LINE_PROVIDER_ID,
  GOOGLE_MAPS_API_KEY,
  SUPPORT_EMAIL,
  PUSH_V2_ENABLED,
  PUSH_FUNCTIONS_URL,
  WEB_PUSH_VAPID_PUBLIC_KEY,
} from "./config.ts";
import { quarantinePushDevice } from "./dataApi.ts";
import { joinableSessionCount } from "./filters.ts";
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
} from "./map.ts";
import {
  acceptSessionParticipant,
  cancelSession,
  confirmSessionAttendance,
  createReport,
  createSession,
  decideSessionCourt,
  declineSessionParticipant,
  inviteToSession,
  isSupabaseConfigured,
  loadCourts,
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
  postSessionMessage,
  requestToJoinSession,
  respondToSessionInvite,
  setPlayerVisibility,
  setOpenToGreeting,
  setPlayerBlock,
  setPresenceSharing,
  updateSession,
  updateMyPresence,
  withdrawFromSession,
} from "./dataApi.ts";
import { installGlobalErrorHandlers, showGlobalErrorNotice } from "./appErrors.ts";
import { configureSentryErrorTransport } from "./sentryErrorTransport.ts";
import { createSessionController } from "./sessionController.ts";
import { createStore } from "./sessionStore.ts";
// Eager React app boundary: react-surface-lifecycle.test.js scans this explicit browser-entry import.
import * as appModule from "./app/App.tsx";
import {
  openCourtPlayersDrawer,
  openCourtSessionDrawer,
  openFilterSheet,
  openPlayerCardSheet,
  openPlayerDirectoryList,
  renderMapDataStatus,
  renderPlayerLayerToggle,
} from "./views/discoverySurfaceViews.js";
import { openCreateSessionSheet, openDecideSessionSheet, openEditSessionSheet } from "./views/sessionFormViews.js";
import { openProfileCompletionSheet } from "./views/profileSurfaceView.js";
import {
  openReportDialog,
  openSessionChatSheet,
  openSessionSheet,
  openSessionUnavailableSheet,
  openWithdrawSessionConfirmation,
} from "./views/sessionSurfaceViews.js";
import { nearbySessionsSummaryText } from "./sessionPresentation.ts";
import { openLoginModal } from "./sheets.ts";
import {
  createNotificationFeature,
  defaultNotificationSettings,
} from "./features/notifications/notificationFeature.ts";
import { createNotificationPushProductionShell } from "./notificationPushProductionShell.ts";
import { createNotificationPushSignOutContinuation } from "./notificationPushSignOutContinuation.ts";
import { createSessionChatOpener } from "./features/chat/chatSessionWiring.ts";
import { createPageRouteOwner } from "./features/navigation/pageRouteOwner.ts";
import { configureShareFeature, copySessionShareLink } from "./features/share/shareFeature.js";
import {
  authIdentity,
  configureProfileOrchestrationFeature,
  handleAuthIdentityChange,
  handleLinkProvider,
  handleSignOut,
  isProfileReady,
  openProfileCompletion,
  openSafeLogin,
  reloadCurrentProfile,
  restoreAuth,
} from "./features/profile/profileOrchestrationFeature.ts";
import {
  configurePresenceFeature,
  reconcilePresenceTracking,
  resetPresenceTracking,
  updateOpenToGreetingSetting,
  updatePresenceSharing,
} from "./features/presence/presenceFeature.ts";
import { eligibilityFromPrivateProfile } from "./profile.ts";
import { createRequestGate } from "./requestGate.ts";
import { sessionIdFromHash } from "./sessionRoute.js";
import {
  configureMapFilterToolbar,
  configureSessionViewModules,
  configureSessionViewSurfaces,
  preloadAuthenticatedViewsForAuth,
  renderBottomNavigation,
  renderMapFilterToolbar,
  renderToast,
} from "./views/sessionViewWiring.js";

const configuredErrorTransport = configureSentryErrorTransport({
  dsn: import.meta.env.VITE_SENTRY_DSN ?? "",
  environment: __TENNIS_DEPLOY_ENVIRONMENT__,
});
const restoreGlobalErrorHandlers = installGlobalErrorHandlers(globalThis.window, {
  onCaptured: () => showGlobalErrorNotice(document),
});
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    restoreGlobalErrorHandlers();
    configuredErrorTransport.restore();
  });
}

let google = null;
let map = null;
let courtCatalogueStatus = "loading";
let latestPlayerLayerView = { groups: [], message: "", on: false, status: "idle" };
let controller;
const authRequestGate = createRequestGate();
const notificationPushV2Shell = createNotificationPushProductionShell(
  PUSH_V2_ENABLED
    ? {
        mode: "enabled",
        runtimeOptions: {
          subscriptionEndpoint: `${PUSH_FUNCTIONS_URL}/push-subscription-v2`,
          cleanupEndpoint: `${PUSH_FUNCTIONS_URL}/push-cleanup`,
          vapidPublicKey: WEB_PUSH_VAPID_PUBLIC_KEY,
          quarantineRpc: quarantinePushDevice,
        },
      }
    : { mode: "disabled" }
);
const notificationPushSignOutContinuation = createNotificationPushSignOutContinuation({
  processPushSignOut: (input) =>
    notificationPushV2Shell.processCurrentDeviceSignOut({ signal: input?.signal ?? AbortSignal.timeout(15000) }),
  signOutCurrentDevice: handleSignOut,
});
configureSessionViewSurfaces();
configureSessionViewModules({ appModule });
function getAppState() {
  return controller?.getAppState?.() ?? { authSession: null, courts: [], courtsReady: false, profile: null };
}

configureFilterToolbarFeature({
  configureMapFilterToolbar,
  getAppState,
  getController: () => controller,
  openFilterSheet,
  renderMapFilterToolbar,
});

function currentProfileEligibility(profile = getAppState().profile) {
  const { courts, courtsReady } = getAppState();
  return eligibilityFromPrivateProfile(profile, {
    courts,
    courtsReady,
    courtsStatus: courtCatalogueStatus,
  });
}
function currentRouteHash() {
  return globalThis.location?.hash ?? "";
}

function historyPageOwnerIdentity() {
  return globalThis.history?.state?.pageOwnerIdentity;
}

function writePageHistory(mode, state, hash) {
  globalThis.history?.[mode === "replace" ? "replaceState" : "pushState"]?.(state, "", hash);
}

function setPageHidden(elementId, hidden) {
  document.getElementById(elementId).hidden = hidden;
}

function schedulePageFocus({ preventScroll, selector }) {
  requestAnimationFrame(() => document.querySelector(selector)?.focus({ preventScroll }));
}

function runPageEntryEffects(page) {
  if (page === "my-sessions") void controller.refreshMySessions();
  if (page !== "me") return;
  if (getAppState().authSession && isSupabaseConfigured) void reloadCurrentProfile().catch(() => {});
  void refreshNotificationSettings();
  void controller.blockedPlayers.refresh();
}

const pageRouteOwner = createPageRouteOwner({
  collapseDrawer: () => controller.setDrawerState("collapsed"),
  getAuthIdentity: () => authIdentity(getAppState().authSession),
  getHash: currentRouteHash,
  getHistoryOwnerIdentity: historyPageOwnerIdentity,
  onEnter: runPageEntryEffects,
  scheduleFocus: schedulePageFocus,
  setPageHidden,
  syncNavigation: () => syncBottomNavigation(),
  writeHistory: writePageHistory,
});

let createdSessionFocusId = null;
// 批 C3-3:createdSessionFocusId 現在同時服務 create 與 join 兩種來源
// ("created"|"joined")。reason 只決定 My Sessions 訂閱 selector 要不要把它
// 當成 createdSessionId(觸發「球局已建立」文案＋create 專屬推播 prompt)往下傳；
// 卡片聚焦本身兩種 reason 都要做,見 MySessionsPage 的 page-view focus 切片。
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
let bootAuthReady = Promise.resolve();

function toast(message) {
  renderToast(message);
}

configureShareFeature({ toast });

async function openSessionHashRoute() {
  const sessionId = sessionIdFromHash(currentRouteHash());
  if (!sessionId || !controller) return;
  pageRouteOwner.navigate("map", { historyMode: "none" });
  const result = await controller.openSessionFromLink(sessionId);
  if (sessionId !== sessionIdFromHash(currentRouteHash())) return;
  if (result?.status !== "opened") openSessionUnavailableSheet();
}

async function openAuthReadySessionHashRoute(expectedSessionId) {
  await bootAuthReady;
  if (expectedSessionId !== sessionIdFromHash(currentRouteHash())) return;
  await openSessionHashRoute();
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

function currentAuthAvatarUrl() {
  const { authSession } = getAppState();
  const metadata = authSession?.user?.user_metadata ?? {};
  return metadata.avatar_url ?? metadata.picture ?? "";
}

function openCreateSession({
  courts: selectableCourts,
  courtsReady: formCourtsReady,
  repeatSource,
  onClose,
  onSubmit,
  onViewMySessions,
} = {}) {
  return openCreateSessionSheet({
    courts: selectableCourts ?? getAppState().courts,
    courtsReady: formCourtsReady ?? getAppState().courtsReady,
    repeatSource,
    onClose,
    onSubmit,
    onViewMySessions,
    toast,
  });
}

function renderSessionMarkers(sessions) {
  if (!google || !map) return;
  const groups = groupSessionsByCourt(getAppState().courts, sessions);
  renderSessionPins(google, map, groups, {
    onSession: (sessionId) => controller.openSession(sessionId),
    onCluster: (court, groupedSessions) => controller.openCourt(court, groupedSessions),
  });
}

function renderPlayerLayer(view) {
  latestPlayerLayerView = view;
  renderPlayerLayerToggle(document.getElementById("player-layer-toggle"), view);
  if (!google || !map) return;
  renderPlayerPins(google, map, view.on ? view.groups : [], (court, players) =>
    controller.openPlayerCourt(court, players)
  );
}

function renderDiscovery(view) {
  const discoveryComplete = view.mapStatus.kind === "idle" || view.mapStatus.kind === "warning";
  syncFilterToolbar(view.filters, discoveryComplete ? view.sessions.length : null);
  // 篩選 sheet footer 主鈕「看 N 場球局」與 peek/抽屜同一份 view.sessions,
  // 篩選一改就即時跟隨(dc L469)。
  renderMapDataStatus(document.getElementById("map-data-status"), {
    ...view.mapStatus,
    locationMessage: view.locationMessage,
    onRetry: controller.retryDiscovery,
  });
  // #nearby-sessions-count-status 是 index.html 裡固定不動的持久節點,不在
  // React 抽屜內容每次更新的範圍內——比照
  // #my-sessions-badge-status(見 syncBottomNavigation)的模式,只在原地更新
  // textContent,螢幕閱讀器才能可靠收到這顆 live region 的計數變動播報;掛在會被
  // 摧毀重建的節點上,新節點帶著 aria-live 屬性一起被建立時,AT 不保證會註冊到它。
  const countStatus = document.getElementById("nearby-sessions-count-status");
  if (countStatus)
    countStatus.textContent = discoveryComplete
      ? nearbySessionsSummaryText(joinableSessionCount(view.sessions), view.hasUserLocation)
      : view.mapStatus.message;
}

function syncBottomNavigation() {
  const mySessionState = controller?.getMySessionState?.();
  const count = mySessionState?.groups?.needsActionCount ?? 0;
  // 批 C4-2 起:未讀圓點是獨立於 needsActionCount 的第二個聚合信號(任一局
  // unread>0),不取代、也不合併進數字徽章本身——兩者可同時出現。圓點對 AT 一律
  // 靜默(aria-hidden,比照數字徽章)。批 D7 起圓點與其播報改隸屬「訊息」格
  // (dc chatsBadge 語意)——my-sessions-tab 的 aria-label 不再帶「有未讀訊息」段,
  // 改由 messages-tab 承載,跟既有 #my-sessions-badge-status live region 的分工
  // 模式一致(各自 tab 自己的 aria-label 負責播報自己的聚合信號)。
  const hasUnread = mySessionState?.groups?.hasUnread === true;
  renderBottomNavigation({ activePage: pageRouteOwner.getActivePage(), hasUnread, needsActionCount: count });
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
  pushV2: notificationPushV2Shell,
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

configureProfileOrchestrationFeature({
  captureAuthRequest,
  currentAuthAvatarUrl,
  currentProfileEligibility,
  defaultProfile,
  getActivePage: pageRouteOwner.getActivePage,
  getAppState,
  getController: () => controller,
  invalidateAuthRequests: () => authRequestGate.invalidate(),
  localDemoUnavailable: LOCAL_DEMO_UNAVAILABLE,
  onAuthVerificationAuthority: (authority) => notificationPushV2Shell.installAuthVerificationAuthority(authority),
  onAuthVerificationFailure: (failure) => {
    void notificationPushV2Shell.processAuthVerificationFailure(failure);
  },
  openLoginModal,
  openProfileCompletionSheet,
  reconcilePageRouteOwner: pageRouteOwner.reconcile,
  reconcilePresenceTracking,
  resetNotificationSettings: () => {
    notificationSettings = defaultNotificationSettings();
    publishPageView("me", "mySessions");
  },
  resetPresenceTracking,
  seedAllTaipeiCourtSubscriptions: () => notificationFeature.seedAllTaipeiCourtSubscriptions(),
  setAuthSession: (session) => controller.setAuthSession(session),
  setProfile: (profile) => controller.setProfile(profile),
  showMePage: () => pageRouteOwner.navigate("me"),
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

function enablePushNotifications() {
  return notificationFeature.enablePushNotifications();
}

const openSessionChat = createSessionChatOpener({
  createSessionChat: (sessionId) => controller.createSessionChat(sessionId),
  openChatSurface: openSessionChatSheet,
});

// 批 C3-3:第一參數泛化為 { sessionId, reason }(或 null/未傳＝無聚焦目標，例如底部
// 導覽「我的球局」分頁鈕)。reason 只決定 My Sessions 是否顯示
// create 專屬文案；卡片聚焦本身兩種 reason 都適用，見該函式內的 highlightSessionId。
function showMySessionsPage(focusTarget = null, { focus = false, historyMode = "push" } = {}) {
  if (focusTarget?.sessionId != null) {
    createdSessionFocusId = focusTarget.sessionId;
    createdSessionFocusReason = focusTarget.reason ?? null;
    publishPageView("mySessions");
  }
  pageRouteOwner.navigate("my-sessions", { focusTarget: focus ? "page" : null, historyMode });
}

// 批 D7:訊息頁不新增 dataApi 呼叫——不像 showMySessionsPage 會另外
// void controller.refreshMySessions()。setAuthState() 在登入/還原 session 時已經
// 觸發過 reloadParticipation(見 sessionController.ts),訊息頁只讀那份既有 state,
// 不重複打 RPC。
function routeCurrentHash() {
  const hash = currentRouteHash();
  const sessionId = sessionIdFromHash(hash);
  if (sessionId) return openAuthReadySessionHashRoute(sessionId);
  return pageRouteOwner.routeCurrentHash();
}

function renderBaseCourtPins() {
  if (!google || !map) return;
  renderCourtBasePins(google, map, getAppState().courts, (court) => controller.openCourt(court));
}

async function loadCourtsImmediately() {
  try {
    const courts = await loadCourts();
    courtCatalogueStatus = "ready";
    controller.setCourts(courts, { ready: true });
    const { authSession } = getAppState();
    if (authSession && isProfileReady()) {
      await controller.setAuthState(authSession, currentProfileEligibility());
    }
    renderBaseCourtPins();
  } catch {
    courtCatalogueStatus = "error";
    controller.setCourts([], { ready: false });
    const { authSession } = getAppState();
    if (authSession && isProfileReady()) {
      await controller.setAuthState(authSession, currentProfileEligibility());
    }
    toast("球場資料暫時無法載入。");
  }
}

function diagnoseMapFailure(message) {
  if (import.meta.env?.DEV) console.warn(message);
}

async function startMap() {
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === "___") {
    controller.setMapUnavailable();
    return;
  }
  let authFailed = false;
  await loadGoogleMaps(GOOGLE_MAPS_API_KEY, () => {
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

async function boot() {
  // Court data, public discovery, and Maps are intentionally auth-independent
  // and start together. Each path owns its existing fallback UI.
  const publicStartup = Promise.allSettled([loadCourtsImmediately(), controller.loadDiscovery(), startMap()]);
  // A session hash alone depends on the initial auth/profile candidate. The
  // router awaits this promise before opening that session exactly once.
  bootAuthReady = restoreAuth();
  const routeStartup = routeCurrentHash();
  await bootAuthReady;
  await Promise.all([publicStartup, routeStartup]);
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
    openSession: (session, handlers) => {
      // 批 C3-2:join 確認/送出中/成功都內嵌同一張 detail sheet,不再有獨立的
      // openJoinConfirmation 接線——這裡把原本只給那條路徑的 notificationSettings/
      // onEnablePush/onViewMySessions 併入唯一的 openSession 接線。
      const openChat = () => openSessionChat(session.sessionId);
      return openSessionSheet(session, {
        ...handlers,
        notificationSettings,
        onCopyLink: () => copySessionShareLink(session.sessionId, session),
        onChat: openChat,
        onEnablePush: enablePushNotifications,
        onPrimary: handlers.action?.kind === "chat" ? openChat : handlers.onPrimary,
        // 批 C3-3:sheet 的成功 callback 把剛加入的 sessionId 交回來,
        // 用 reason:"joined" 聚焦新參與卡,不顯示 create 專屬的
        // 「球局已建立」文案——不再只聚焦頁面標題。
        onViewMySessions: (sessionId) => showMySessionsPage({ sessionId, reason: "joined" }),
      });
    },
    openCourtDrawer: (court, sessions, handlers) => openCourtSessionDrawer(court, sessions, handlers),
    openCourtPlayersDrawer: (court, players, handlers) => openCourtPlayersDrawer(court, players, handlers),
    openPlayerDirectoryList: (handlers) => openPlayerDirectoryList(handlers),
    openPlayerCard: (player, handlers) => openPlayerCardSheet(player, handlers),
    openCreateSession,
    openDecideSession: openDecideSessionSheet,
    openEditSession: openEditSessionSheet,
    openLogin: openSafeLogin,
    openReport: (context) => openReportDialog(context),
    openWithdrawConfirmation: openWithdrawSessionConfirmation,
    promptProfile: openProfileCompletion,
    reloadCurrentProfile,
    // 批 C3-3:controller 仍只傳原始 sessionId(見 sessionController.ts 的
    // showCreatedSession(result?.sessionId))；這裡在接線邊界補上 reason:"created"，
    // controller 本身不需要知道 reason 字串這個 view 層概念。
    showCreatedSession: (sessionId) => showMySessionsPage({ sessionId, reason: "created" }),
    onAuthIdentityChange: (context) => {
      preloadAuthenticatedViewsForAuth(context.session);
      return handleAuthIdentityChange(context);
    },
    onMySessionsChange: () => {
      if (!controller) return;
      // Keep the hidden destinations in sync as well. Otherwise an account
      // switch made from the map page could leave a prior account's private
      // roster values (or unread chat rows) in a hidden DOM subtree.
      syncBottomNavigation();
    },
    toast,
  });
  appModule.configureAppServicesInApp({
    controller,
    openSessionChat,
    meApp: {
      lineProviderId: AUTH_LINE_PROVIDER_ID,
      onEditProfile: () => openProfileCompletion({ mode: "standalone" }),
      onEnablePush: enablePushNotifications,
      onLinkProvider: handleLinkProvider,
      onSaveCourtSubscriptions: updateCourtSubscriptions,
      onSaveNotificationPreferences: updateNotificationPreferences,
      onSetOpenToGreeting: updateOpenToGreetingSetting,
      onSetPresenceSharing: updatePresenceSharing,
      onSignIn: () => openSafeLogin({ action: "me" }),
      onSignOut: notificationPushSignOutContinuation.processCurrentDeviceSignOut,
      supportHref: supportContactHref(),
    },
    mySessionsApp: {
      onBack: () => pageRouteOwner.navigate("map", { focusTarget: "page" }),
      onCreatedSessionFocus: (expectedSessionId = createdSessionFocusId) => {
        if (createdSessionFocusId !== expectedSessionId) return false;
        createdSessionFocusId = null;
        createdSessionFocusReason = null;
        publishPageView("mySessions");
        return true;
      },
      onEnablePush: enablePushNotifications,
      onSignIn: () => openSafeLogin({ action: "my-sessions" }),
    },
    nearbyDrawerApp: {
      onSubscribe: () => pageRouteOwner.navigate("me", { focusTarget: "notification-settings" }),
    },
    pageViewStore,
  });
  syncBottomNavigation();
  wireFilters();
  document.getElementById("use-my-location").addEventListener("click", () => controller.requestCurrentLocation());
  // 批 D3:右下控制直欄縮放;地圖不可用(fallback 模式)時為安全 no-op。
  document.getElementById("map-zoom-in")?.addEventListener("click", () => zoomMapBy(1));
  document.getElementById("map-zoom-out")?.addEventListener("click", () => zoomMapBy(-1));
  document.getElementById("player-layer-toggle").addEventListener("click", () => controller.togglePlayerLayer());
  // These controls are React portal children now; delegate from stable static hosts so concurrent first render
  // and later node replacement cannot leave main.js attached to a stale node.
  document.getElementById("map-topbar-root").addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("#player-directory-open")) controller.openPlayerDirectory();
    if (event.target.closest(".app-brand")) {
      event.preventDefault();
      pageRouteOwner.navigate("map", { focusTarget: "page" });
    }
  });
  document.getElementById("bottom-navigation-root").addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const destination = event.target.closest("button")?.id;
    if (destination === "create-session-tab") controller.openCreateIntent();
    const page = pageRouteOwner.pageFromTabId(destination);
    if (page === "my-sessions") showMySessionsPage();
    else if (page) pageRouteOwner.navigate(page);
  });
  globalThis.addEventListener("hashchange", () => {
    void routeCurrentHash();
  });
  syncBottomNavigation();

  void boot();
}

init();
