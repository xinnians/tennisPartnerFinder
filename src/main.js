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
import { BANDS, countActiveFilters, joinableSessionCount } from "./filters.js";
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
import { canReceiveFocus, shouldReleasePendingMeFocus } from "./meFocus.js";
import {
  createNotificationFeature,
  defaultNotificationSettings,
} from "./features/notifications/notificationFeature.ts";
import { createPresenceTracker } from "./playerPresence.js";
import { eligibilityFromPrivateProfile } from "./profile.js";
import { createRequestGate } from "./requestGate.js";
import { sessionIdFromHash } from "./sessionRoute.js";
import { esc } from "./util.js";

installGlobalErrorHandlers(globalThis.window, {
  onCaptured: () => showGlobalErrorNotice(document),
});

let google = null;
let map = null;
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
// ("created"|"joined")。reason 只決定 renderMySessionsDestination() 要不要把它
// 當成 createdSessionId(觸發「球局已建立」文案＋create 專屬推播 prompt)往下傳；
// 卡片聚焦本身兩種 reason 都要做,見 renderMySessionsPage 的 highlightSessionId。
let createdSessionFocusReason = null;
let meRenderGeneration = 0;
let mySessionsRenderGeneration = 0;
let messagesRenderGeneration = 0;
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
  root.innerHTML = `<div class="toast"><svg class="toast__check" width="15" height="15" viewBox="0 0 15 15" aria-hidden="true"><path d="M2.5 8l3.2 3.2L12.5 4" fill="none" stroke="var(--color-signal)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>${esc(message)}</div>`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (root.innerHTML = ""), 2000);
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

function presenceSettingsForProfile() {
  const profile = getAppState().profile;
  return {
    locationStatus: presenceLocationStatus,
    openToGreeting: profile?.openToGreeting === true,
    sharePresence: profile?.sharePresence === true,
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
  const { authSession, profile } = getAppState();
  const eligible = currentProfileEligibility();
  const canTrack = Boolean(isSupabaseConfigured && authSession && eligible.ntrp && profile?.sharePresence === true);
  if (!canTrack) {
    stopPresenceTracking();
    return false;
  }
  if (!presenceTracker) {
    presenceTracker = createPresenceTracker({
      onError: updatePresenceLocationStatus,
      onPosition: async ({ lat, lng }) => {
        const request = captureAuthRequest();
        await updateMyPresence({ lat, lng });
        if (request.isStale()) return;
        updatePresenceLocationStatus("active");
      },
    });
  }
  const started = presenceTracker.start();
  if (started && presenceLocationStatus === "idle") presenceLocationStatus = "requesting";
  return started;
}

async function updatePresenceSharing(shared) {
  const request = captureAuthRequest();
  const { authSession, profile } = getAppState();
  if (!request.identity || !authSession || !isSupabaseConfigured) throw new Error("請先登入後再調整在線設定。");
  if (!currentProfileEligibility().ntrp) {
    openProfileCompletion({ intent: { action: "presence" } });
    return false;
  }
  await setPresenceSharing(shared === true);
  if (request.isStale()) throw new Error("登入狀態已變更，請重新整理後再試。");
  controller.setProfile({ ...(profile ?? defaultProfile()), sharePresence: shared === true });
  if (shared) reconcilePresenceTracking();
  else {
    stopPresenceTracking();
    presenceLocationStatus = "idle";
  }
  rerenderVisibleNotificationSettings();
  toast(shared ? "已開啟在線分享。" : "已隱藏在線狀態。");
}

async function updateOpenToGreetingSetting(open) {
  const request = captureAuthRequest();
  const { authSession, profile } = getAppState();
  if (!request.identity || !authSession || !isSupabaseConfigured) throw new Error("請先登入後再調整在線設定。");
  if (!currentProfileEligibility().ntrp) {
    openProfileCompletion({ intent: { action: "presence" } });
    return false;
  }
  await setOpenToGreeting(open === true);
  if (request.isStale()) throw new Error("登入狀態已變更，請重新整理後再試。");
  controller.setProfile({ ...(profile ?? defaultProfile()), openToGreeting: open === true });
  rerenderVisibleNotificationSettings();
  toast(open ? "已開啟接受現場問候。" : "已關閉接受現場問候。");
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

// 篩選 chip「永遠白底無選中態」(dc L106):badge 只在 count>0 時出現,不切換
// is-active——這點與舊版(反相底)刻意不同,見批 D4a 規格。badge 與文字之間留一個
// 字面空白字元,讓 Playwright toHaveText 的正規化文字仍是「篩選 ⋅N」。
function renderFilterSheetButton(filters) {
  const button = document.getElementById("filter-sheet-open");
  if (!button) return;
  const count = countActiveFilters(filters);
  button.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg><span>篩選</span>${
    count > 0 ? ` <span class="filter-chip__badge">⋅${count}</span>` : ""
  }`;
  button.setAttribute("aria-label", count > 0 ? `篩選，已套用 ${count} 組條件` : "篩選");
}

// 同步樞紐:地圖 chips(日期／程度／直接加入)、主鈕徽章 N、以及 sheet 開著時的
// sheet 控件,四者都只從這裡的單一 filters 寫入,不論觸發來源是地圖還是 sheet 本身。
function renderFilters(filters) {
  document.querySelectorAll("[data-date-chip]").forEach((button) => {
    const selected = button.dataset.dateChip === filters.dateKey;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  const levelChip = document.getElementById("level-chip");
  const bandActive = filters.band !== "all";
  levelChip?.classList.toggle("is-selected", bandActive);
  document.getElementById("band-label").textContent = BANDS.find((band) => band.key === filters.band)?.label ?? "全部";
  document.querySelectorAll("[data-band]").forEach((button) => {
    const selected = button.dataset.band === filters.band;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  const instantChip = document.getElementById("instant-only-chip");
  const instantOn = filters.instantOnly === true;
  instantChip?.classList.toggle("is-selected", instantOn);
  instantChip?.setAttribute("aria-pressed", String(instantOn));
  renderFilterSheetButton(filters);
  activeFilterSheet?.setFilters(filters);
}

// 批 C1 Task 3:openFilterSheet 的接線層包裝,接在 #filter-sheet-open 主鈕上。
// 回傳值存進 activeFilterSheet,讓 renderFilters 能在 sheet 開著時把地圖端變動鏡像進去。
function openFilters(handlers = {}) {
  return openFilterSheet({
    filters: latestFilters ?? undefined,
    courts: getAppState().courts,
    resultCount: controller?.getVisibleSessions?.().length ?? 0,
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

function renderDiscovery(view) {
  latestFilters = view.filters;
  renderFilters(view.filters);
  // 篩選 sheet footer 主鈕「看 N 場球局」與 peek/抽屜同一份 view.sessions,
  // 篩選一改就即時跟隨(dc L469)。
  activeFilterSheet?.setResultCount(view.sessions.length);
  renderNearbySessionsDrawer(document.getElementById("nearby-sessions-drawer"), {
    sessions: view.sessions,
    courts: view.courts,
    drawerState: view.drawerState,
    hasUserLocation: view.hasUserLocation,
    mapStatus: view.mapStatus,
    filters: view.filters,
    authenticated: Boolean(getAppState().authSession),
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
  // fix round 1(驗收退回,實測抓到):批 D8 新增的 identity card 整列可點入口
  // (me-profile-edit-trigger)跟既有「編輯」鈕(edit-profile)是兩顆各自獨立的
  // DOM 元素、同時並存,只接了 onEditProfile 同一個 handler,沒接進這個既有
  // capture/restore 清單——背景重繪時聚焦在它身上會被這個 capture 漏接,
  // 掉回 body。比照 edit-profile 同款寫法補上。
  if (active.matches('[data-testid="me-profile-edit-trigger"]')) return { kind: "profile-edit-trigger" };
  if (active.matches('[data-my-action="toggle-visibility"]')) return { kind: "player-visibility" };
  if (active.matches("[data-enable-push]")) return { kind: "enable-push" };
  if (active.matches("[data-notification-pref]"))
    return { kind: "notification-pref", preference: active.dataset.notificationPref };
  if (active.matches("[data-subscribe-all-courts]")) return { kind: "subscribe-all-courts" };
  if (active.matches("[data-court-picker-toggle]")) return { kind: "court-picker-toggle" };
  if (active.matches("[data-notification-court]")) return { courtId: active.value, kind: "notification-court" };
  if (active.matches("[data-set-presence-sharing]")) return { kind: "presence-sharing" };
  if (active.matches("[data-open-to-greeting]")) return { kind: "open-to-greeting" };
  if (active.matches(".me-service-links a")) return { href: active.getAttribute("href") ?? "", kind: "service-link" };
  if (active.matches("[data-link-provider]"))
    return { kind: "link-provider", provider: active.dataset.linkProvider ?? "" };
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
  if (focus.kind === "profile-edit-trigger") return root.querySelector('[data-testid="me-profile-edit-trigger"]');
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
  if (focus.kind === "link-provider") {
    return [...root.querySelectorAll("[data-link-provider]")].find(
      (button) => button.dataset.linkProvider === focus.provider
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

function captureAuthRequest(isCurrent = () => true) {
  const identity = authIdentity(getAppState().authSession);
  const token = authRequestGate.capture(
    () => Boolean(getAppState().authSession) && identity === authIdentity(getAppState().authSession) && isCurrent()
  );
  return { identity, isStale: token.isStale };
}

function rerenderVisibleNotificationSettings() {
  if (activePage === "my-sessions") renderMySessionsDestination();
  else if (activePage === "me") renderMeDestination();
}

const notificationFeature = createNotificationFeature({
  captureAuthRequest,
  getAuthSession: () => getAppState().authSession,
  getCourts: () => getAppState().courts,
  getSettings: () => notificationSettings,
  rerenderVisibleSettings: rerenderVisibleNotificationSettings,
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

function renderMySessionsDestination() {
  if (!controller) return;
  const state = controller.getMySessionState();
  // 批 C3-3:createdSessionFocusId 拆成兩個用途——highlightSessionId 給卡片聚焦
  // (create/joined 都要),createdSessionId 只在 reason==="created" 時才往下傳,
  // 避免 join 使用者看到 create 專屬的「球局已建立」文案與推播 prompt
  // (renderMySessionsPage 內兩處分支,見 ground truth 意外 3)。
  const focusSessionId = createdSessionFocusId;
  const createdSessionId = createdSessionFocusReason === "created" ? focusSessionId : null;
  const root = document.getElementById("my-sessions-root");
  const focus = activePage === "my-sessions" ? (captureMySessionsFocus(root) ?? pendingMySessionsFocus) : null;
  if (focus) pendingMySessionsFocus = focus;
  else if (activePage !== "my-sessions") pendingMySessionsFocus = null;
  const generation = ++mySessionsRenderGeneration;
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
    onCreatedSessionFocus: () => {
      if (createdSessionFocusId !== focusSessionId) return false;
      createdSessionFocusId = null;
      createdSessionFocusReason = null;
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
  const focus = activePage === "me" ? (captureMeFocus(root) ?? pendingMeFocus) : null;
  if (focus) pendingMeFocus = focus;
  else if (activePage !== "me") pendingMeFocus = null;
  const generation = ++meRenderGeneration;
  const state = controller?.getMySessionState?.() ?? {};
  const { authSession, courts, profile } = getAppState();
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
  });
  suppressMeFocusRelease = false;
  restoreMeFocus(root, focus, generation);
  syncBottomNavigation();
}

// 批 D7:訊息頁只有單一互動元素類型(列按鈕),不需要 My Sessions/Me 頁那套多欄位
// focus capture/restore 機制——這裡用同一個「記住 sessionId、重繪後找回同一顆
// 按鈕」的輕量版本,足以覆蓋「列表在背景重繪時使用者仍聚焦某一列」的情境。開啟
// 聊天室本身的回焦點交給 sheets.js 既有的 data-session-id 還原機制(不需要在這裡
// 額外處理)。
function captureMessagesFocus(root) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  if (active.matches("[data-message-row]")) return { sessionId: active.dataset.sessionId };
  return null;
}

function renderMessagesDestination() {
  if (!controller) return;
  const root = document.getElementById("messages-root");
  if (!root) return;
  const state = controller.getMySessionState();
  const focus = activePage === "messages" ? captureMessagesFocus(root) : null;
  const generation = ++messagesRenderGeneration;
  renderMessagesPage(root, {
    courts: getAppState().courts,
    groups: state.groups,
    onOpenChat: (sessionId) => controller.openSessionChat(sessionId),
  });
  if (focus) {
    requestAnimationFrame(() => {
      if (generation !== messagesRenderGeneration || activePage !== "messages") return;
      if (document.querySelector("#sheet-root .surface, #modal-root .surface")) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && root.contains(active)) return;
      const target = [...root.querySelectorAll("[data-message-row]")].find(
        (button) => String(button.dataset.sessionId) === String(focus.sessionId)
      );
      if (target) target.focus({ preventScroll: true });
      else root.querySelector("[data-messages-heading]")?.focus({ preventScroll: true });
    });
  }
  syncBottomNavigation();
}

function showMapPage({ focus = false } = {}) {
  activePage = "map";
  pendingMeFocus = null;
  pendingMySessionsFocus = null;
  document.getElementById("tab-map").hidden = false;
  document.getElementById("my-sessions-page").hidden = true;
  document.getElementById("messages-page").hidden = true;
  document.getElementById("me-page").hidden = true;
  syncBottomNavigation();
  if (focus) requestAnimationFrame(() => document.getElementById("map-tab")?.focus({ preventScroll: true }));
}

// 批 C3-3:第一參數泛化為 { sessionId, reason }(或 null/未傳＝無聚焦目標，例如底部
// 導覽「我的球局」分頁鈕)。reason 只決定 renderMySessionsDestination() 是否顯示
// create 專屬文案；卡片聚焦本身兩種 reason 都適用，見該函式內的 highlightSessionId。
function showMySessionsPage(focusTarget = null, { focus = false } = {}) {
  activePage = "my-sessions";
  pendingMeFocus = null;
  if (focusTarget?.sessionId != null) {
    createdSessionFocusId = focusTarget.sessionId;
    createdSessionFocusReason = focusTarget.reason ?? null;
  }
  controller.setDrawerState("collapsed");
  document.getElementById("tab-map").hidden = true;
  document.getElementById("messages-page").hidden = true;
  document.getElementById("me-page").hidden = true;
  const page = document.getElementById("my-sessions-page");
  page.hidden = false;
  renderMySessionsDestination();
  void controller.refreshMySessions().then(() => {
    if (activePage === "my-sessions") renderMySessionsDestination();
    else if (activePage === "messages") renderMessagesDestination();
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
  controller.setDrawerState("collapsed");
  document.getElementById("tab-map").hidden = true;
  document.getElementById("my-sessions-page").hidden = true;
  document.getElementById("messages-page").hidden = true;
  const page = document.getElementById("me-page");
  page.hidden = false;
  renderMeDestination();
  if (getAppState().authSession && isSupabaseConfigured) void reloadCurrentProfile().catch(() => {});
  void refreshNotificationSettings();
  void controller.refreshMyPlayerBlocks();
  if (focus)
    requestAnimationFrame(() => document.querySelector("#me-root [data-me-heading]")?.focus({ preventScroll: true }));
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

// 批 D7:訊息頁不新增 dataApi 呼叫——不像 showMySessionsPage 會另外
// void controller.refreshMySessions()。setAuthState() 在登入/還原 session 時已經
// 觸發過 reloadParticipation(見 sessionController.js),訊息頁只讀那份既有 state,
// 不重複打 RPC。
function showMessagesPage({ focus = false } = {}) {
  activePage = "messages";
  pendingMeFocus = null;
  pendingMySessionsFocus = null;
  controller.setDrawerState("collapsed");
  document.getElementById("tab-map").hidden = true;
  document.getElementById("my-sessions-page").hidden = true;
  document.getElementById("me-page").hidden = true;
  const page = document.getElementById("messages-page");
  page.hidden = false;
  renderMessagesDestination();
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

function wireFilters() {
  // 日期 chips(dc L102):單選,再點同顆已選中的 chip 會取消(dateKey 回 null)。
  document.querySelectorAll("[data-date-chip]").forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.dateChip;
      controller.setFilter("dateKey", latestFilters?.dateKey === value ? null : value);
    });
  });

  // 直接加入 toggle chip(dc L105):純布林開關,前置方點恆為 signal 黃(CSS 負責)。
  document.getElementById("instant-only-chip").addEventListener("click", () => {
    controller.setFilter("instantOnly", !(latestFilters?.instantOnly === true));
  });

  const chip = document.getElementById("level-chip");
  const popover = document.getElementById("level-popover");
  document.getElementById("band-options").innerHTML = BANDS.map(
    (band) =>
      `<button type="button" class="band-option${band.key === "all" ? " is-active" : ""}" data-band="${esc(
        band.key
      )}" aria-pressed="${band.key === "all"}"><span>${esc(
        band.label
      )}</span><svg class="band-option__check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-signal)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg></button>`
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
  // popover 不是 sheet/dialog,不掛 sheets.js 的 focus-trap 機制,得自己攔 Escape。
  // 用 capture(跟 sheets.js onKeyDown 同一招)保證比 sessionViews.js half 抽屜掛在
  // document 的 bubble-phase Escape 監聽器先跑,關掉 popover 後 stopPropagation,
  // 讓那次按鍵不會再往下收合抽屜——popover 開著時 Escape 只該關 popover。
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      if (popover.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      popover.hidden = true;
      chip.setAttribute("aria-expanded", "false");
    },
    true
  );

  document.getElementById("filter-sheet-open").addEventListener("click", () => {
    activeFilterSheet = openFilters();
  });
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
    if (activePage === "my-sessions") renderMySessionsDestination();
    else if (activePage === "messages") renderMessagesDestination();
    else if (activePage === "me") renderMeDestination();
  } catch {
    courtCatalogueStatus = "error";
    controller.setCourts([], { ready: false });
    const { authSession } = getAppState();
    if (authSession && profileLoadStatus === "ready") {
      await controller.setAuthState(authSession, currentProfileEligibility());
    }
    if (activePage === "my-sessions") renderMySessionsDestination();
    else if (activePage === "messages") renderMessagesDestination();
    else if (activePage === "me") renderMeDestination();
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
  renderMeDestination();
  if (bootDeepLinkReopenPending) {
    bootDeepLinkReopenPending = false;
    void openSessionHashRoute();
  }
  return true;
}

function applyAuthCandidate(session) {
  authRequestGate.invalidate();
  const identity = authIdentity(session);
  const previousIdentity = authIdentity(getAppState().authSession);
  const identityChanged = previousIdentity !== identity;
  if (identityChanged) closeActiveProfileCompletion();
  // Only a genuinely different account may clear the controller's profile
  // eligibility state. Auth token refreshes for the same account must not invalidate an
  // open confirmation or temporarily make an eligible profile unavailable.
  if (identityChanged) {
    stopPresenceTracking();
    presenceLocationStatus = "idle";
    profileRevision += 1;
    controller.setProfile(defaultProfile());
    storedProfileExists = false;
    notificationSettings = defaultNotificationSettings();
    profileLoadStatus = session ? "loading" : "idle";
    void controller.setAuthState(
      session,
      session ? { directory: false, nickname: false, ntrp: false, status: "loading" } : null
    );
  } else controller.setAuthSession(session);
  if (!session) {
    stopPresenceTracking();
    presenceLocationStatus = "idle";
    controller.setProfile(defaultProfile());
    storedProfileExists = false;
    notificationSettings = defaultNotificationSettings();
    profileLoadStatus = "idle";
    renderMeDestination();
    return;
  }
  renderMeDestination();
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
        // 批 C3-3:sheet 把剛加入的 sessionId 交回來(見 sessionViews.js 的
        // wireSuccess),用 reason:"joined" 聚焦新參與卡,不顯示 create 專屬的
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
    onMySessionsChange: () => {
      if (!controller) return;
      // Keep the hidden destinations in sync as well. Otherwise an account
      // switch made from the map page could leave a prior account's private
      // roster values (or unread chat rows) in a hidden DOM subtree.
      renderMySessionsDestination();
      renderMessagesDestination();
      if (activePage === "me") renderMeDestination();
    },
    toast,
  });
  renderMeDestination();
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
