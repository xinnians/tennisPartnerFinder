import { CHAT_POLL_INTERVAL_MS, DISCOVERY_POLL_INTERVAL_MS, TAIPEI_CITY_BOUNDS } from "./config.js";
import {
  boundsContainSession,
  cloneBounds,
  cloneFilters,
  validBounds,
} from "./features/discovery/discoveryFeature.ts";
import {
  MY_SESSION_FINAL_STATUSES,
  actionKey,
  groupMySessions,
  hostCanDecideSession,
  hostCanEditSession,
  sameSessionDetail,
  staleIntentMessage,
} from "./features/session-lifecycle/sessionLifecycleFeature.ts";
import { chatMemberSession } from "./features/chat/chatFeature.ts";
import {
  browserIntentStore,
  profileGateForIntent,
  profileIsPublic,
  profileIsReady,
  profileMeetsGate,
  profileReadiness,
  profileUnavailableMessage,
  samePendingIntent,
  sessionIdentity,
} from "./features/profile-auth/profileAuthFeature.ts";
import { DataApiUnavailableError } from "./dataApi.js";
import { sessionActionMessage } from "./sessionActionMessages.ts";
import { createRequestGate } from "./requestGate.js";
import { isUndecidedCandidate } from "./sessionCriteria.js";
import { createStore } from "./sessionStore.ts";
import { selectControllerMySessionsView } from "./sessionSelectors.ts";
import { createSurfaceRegistry } from "./controller/surfaceRegistry.ts";
import { createChatController } from "./controller/chatController.ts";
import { createDiscoveryMapController } from "./controller/discoveryMapController.ts";
import { createPlayerDirectoryController } from "./controller/playerDirectoryController.ts";
import { createMySessionsController } from "./controller/mySessionsController.ts";
import { createLifecycleActionsController } from "./controller/lifecycleActionsController.ts";

// 批 11-C:requestCurrentLocation 的五個失敗分支(已封鎖/無 geolocation/座標非有限值/
// 使用者拒絕/呼叫拋錯)共用同一句文案,原本五處各寫一次字面。抽成常數只去重,文案逐字不變。
const LOCATION_UNAVAILABLE_MESSAGE = "無法取得位置；你仍可移動地圖或依球場尋找球局。";

/**
 * Arrange private My Sessions rows around the next safe action. Host request
 * rows are supplied by an already-authorized roster hydrate; public discovery
 * is never used to infer them.
 */
export { groupMySessions };

/**
 * State and lifecycle boundary for the public discovery experience. It only
 * publishes `SessionSummary` rows to its renderer; private profile and
 * participation data stay in action-state calculation.
 */
export function createSessionController({
  api,
  mapTools = {},
  render = () => {},
  renderPins = () => {},
  renderPlayers = () => {},
  openSession = () => {},
  openCourtDrawer = () => {},
  openCourtPlayersDrawer = () => {},
  openPlayerDirectoryList = () => {},
  openPlayerCard = () => {},
  openCreateSession = () => {},
  openDecideSession = () => {},
  openEditSession = () => {},
  openChat = () => {},
  openLogin = () => {},
  openReport = () => {},
  openWithdrawConfirmation = () => {},
  promptProfile = () => {},
  reloadCurrentProfile = async () => {},
  onMySessionsChange = () => {},
  showCreatedSession = () => {},
  intentStore = browserIntentStore(),
  toast = () => {},
  visibilityTarget = globalThis.document,
  chatPollIntervalMs = CHAT_POLL_INTERVAL_MS,
  discoveryPollIntervalMs = DISCOVERY_POLL_INTERVAL_MS,
} = {}) {
  // 渲染狀態的唯一容器。收進來的判準是「會出現在某條通道的 payload,或決定該
  // payload 的內容」;authEpoch 以 viewGeneration 之名進 My Sessions payload,所以
  // 一併收進來。其餘 let/Map(地圖實例、idle timer、請求 gate、併發與版本守衛)
  // 都不進任何 payload,是純機械資源,留在 closure——收進 store 只會製造沒有訂閱者
  // 關心的假更新。
  const store = createStore({
    authEpoch: 0,
    bounds: cloneBounds(TAIPEI_CITY_BOUNDS),
    courts: [],
    courtsReady: false,
    sessions: [],
    filters: cloneFilters(),
    userLocation: null,
    locationBlocked: false,
    locationMessage: "",
    drawerState: "collapsed",
    mapUnavailable: false,
    discoveryStatus: "idle",
    discoveryMessage: "",
    authSession: null,
    profile: null,
    profileEligibility: null,
    mySessions: [],
    mySessionsError: "",
    mySessionsStatus: "idle",
    mySessionRosters: new Map(),
    blockedPlayers: [],
    blockedPlayersError: "",
    blockedPlayersStatus: "idle",
    playerLayerOn: false,
    playerLayerMessage: "",
    playerLayerStatus: "idle",
    players: [],
  });
  /** 目前狀態快照。每次寫入都會換新的頂層物件,所以一律現讀,不跨 await 快取。 */
  const read = store.getState;
  const discoveryGate = createRequestGate();
  const participationGate = createRequestGate();
  const rosterGate = createRequestGate();
  const detailJoinPreviewGate = createRequestGate();
  const locationGate = createRequestGate();
  const playerGate = createRequestGate();
  const playerDirectoryGate = createRequestGate();
  const blockedPlayerGate = createRequestGate();
  const playerCardGate = createRequestGate();
  let mySessionsVersion = 0;
  const surfaceRegistry = createSurfaceRegistry({
    chat: {
      close: (context, options) => context.sheet?.close?.(options),
      onRelease: (context) => {
        context.requestGate.invalidate();
        context.poller?.stop();
        context.poller = null;
      },
    },
    courtDrawer: { emptyOptionsByDefault: false },
    createSession: {},
    decisionSession: {},
    detail: { metadata: ["session", "actionKey", "confirmingAuth"] },
    editSession: {},
    playerCard: { metadata: ["gate"] },
    playerDirectory: {},
    playerDrawer: {},
    profilePrompt: { metadata: ["intent"] },
    reportDialog: {},
  });
  const SURFACE_TRANSITIONS = Object.freeze({
    authIdentityChanged: [
      "createSession",
      "decisionSession",
      "editSession",
      "profilePrompt",
      "reportDialog",
      "chat",
      "detail",
    ],
    authNicknameLost: ["detail"],
    authNtrpLost: ["createSession"],
    authProfileResolved: ["profilePrompt"],
    clearPlayerDirectory: [
      "playerDirectory",
      { name: "playerCard", when: (registry) => registry.meta("playerCard", "gate") === "directory" },
    ],
    clearPlayerLayer: [
      "playerDrawer",
      { name: "playerCard", when: (registry) => registry.meta("playerCard", "gate") === "ntrp" },
    ],
    openChat: [
      { name: "chat", options: { reason: "chat-replaced", restoreFocus: false } },
      { name: "decisionSession", options: { reason: "open-chat", restoreFocus: false } },
      { name: "editSession", options: { reason: "open-chat", restoreFocus: false } },
      { name: "detail", options: { reason: "open-chat", restoreFocus: false } },
    ],
    openCourt: [
      { action: "release", name: "playerDrawer" },
      { action: "release", name: "playerCard" },
      { name: "courtDrawer", options: { restoreFocus: false } },
    ],
    openCreate: [{ action: "release", name: "playerCard" }],
    openDecision: [
      { name: "decisionSession", options: { restoreFocus: false } },
      { name: "editSession", options: { restoreFocus: false } },
      { action: "release", name: "detail" },
    ],
    openDetail: [{ action: "release", name: "courtDrawer" }],
    openEdit: [
      { name: "editSession", options: { restoreFocus: false } },
      { name: "decisionSession", options: { restoreFocus: false } },
      { action: "release", name: "detail" },
    ],
    openPlayer: [{ action: "release", name: "playerDrawer" }],
    openPlayerCourt: ["playerDrawer", "playerCard"],
    openPlayerDirectory: [
      { name: "playerDrawer", options: { reason: "player-directory-open", restoreFocus: false } },
      { name: "playerCard", options: { reason: "player-directory-open", restoreFocus: false } },
      { name: "playerDirectory", options: { reason: "player-directory-replace", restoreFocus: false } },
    ],
  });

  function transitionSurfaces(name, options) {
    surfaceRegistry.transition(SURFACE_TRANSITIONS[name], options);
  }

  // 批 C3-2:join 單層化——確認/送出中/成功都內嵌同一張 detail sheet,不再是獨立
  // confirmation surface。join 成功後 refreshAuthoritativeState 會讓 discovery/
  // participation 都反映剛加入的結果,若不暫停 reconcile,detail 會被自己剛做的
  // join 判成「資料已變」而被 registry 關掉,蓋掉正要顯示的成功卡。
  // 用 sessionId 範圍限制暫停,只在「這個 refresh 是為了顯示這個 session 剛完成的
  // join」這個精確窗口內生效,不影響其他 session 的 reconcile。
  let suppressReconcileSessionId = null;
  let intentVersion = 0;
  const resumeInFlight = new Map();

  const mySessionsController = createMySessionsController({
    api,
    blockedPlayerGate,
    onMySessionsChange,
    participationGate,
    reconcileActiveChatParticipation,
    reconcileActiveDetailParticipation,
    rosterGate,
    store,
    toast,
  });
  const {
    actionFor,
    beginLifecycleAction,
    captureAuthSnapshot,
    currentParticipation,
    finishLifecycleAction,
    isCurrentAuthSnapshot,
    lifecycleActionIsInFlight,
    mySessionGroups,
    notifyMySessions,
    refreshMyPlayerBlocks,
    refreshMySessions,
    reloadParticipation,
    replaceMySessions,
    sessionKey,
    unblockPlayer,
  } = mySessionsController;

  const playerDirectoryController = createPlayerDirectoryController({
    api,
    captureAuthSnapshot,
    isCurrentAuthSnapshot,
    openCourtDrawer,
    openCourtPlayersDrawer,
    openCreateIntent,
    openPlayerCard,
    openPlayerDirectoryList,
    openSessionById,
    playerCardGate,
    playerDirectoryGate,
    playerGate,
    publish: () => discoveryMapController.publish(),
    reloadParticipation,
    requireSessionAction,
    store,
    surfaceRegistry,
    transitionSurfaces,
    visibleSessions: () => discoveryMapController.getVisibleSessions(),
  });
  const {
    clearPlayerDirectory,
    clearPlayerLayer,
    getPlayerGroups: playerGroups,
    loadPlayers,
    openCourt,
    openPlayerCourt,
    openPlayerDirectory,
  } = playerDirectoryController;

  const discoveryMapController = createDiscoveryMapController({
    api,
    discoveryGate,
    discoveryPollIntervalMs,
    getPlayerGroups: playerGroups,
    loadPlayers,
    mapTools,
    reconcileActiveDetail,
    render,
    renderPins,
    renderPlayers,
    store,
    surfaceRegistry,
    visibilityTarget,
  });
  const {
    attachMap,
    expandBounds,
    getVisibleSessions: visibleSessions,
    loadDiscovery,
    publish,
    refreshLocationViewport,
    resetFilters,
    retryDiscovery,
    setCourts,
    setDrawerState,
    setFilter,
    setMapUnavailable,
    startDiscoveryPolling,
  } = discoveryMapController;

  const lifecycleActionsController = createLifecycleActionsController({
    api,
    beginLifecycleAction,
    captureAuthSnapshot,
    finishLifecycleAction,
    isCurrentAuthSnapshot,
    openDecideSession,
    openEditSession,
    openWithdrawConfirmation,
    refreshAuthoritativeState,
    sessionKey,
    store,
    surfaceRegistry,
    toast,
    transitionSurfaces,
  });
  const {
    cancelMySession,
    confirmMySessionAttendance,
    markMySessionPlayed,
    mySessionForAction,
    openSessionDecision,
    openSessionEdit,
    requireMySessionAction,
    respondInvite,
    reviewMySessionParticipant,
    withdraw,
    withdrawMySession,
  } = lifecycleActionsController;

  async function hydrateSessionJoinPreview(sessionId, surface, gate, authSnapshot = captureAuthSnapshot()) {
    if (!isCurrentAuthSnapshot(authSnapshot) || typeof api?.loadSessionJoinPreview !== "function") return false;
    const request = gate.issue(() => isCurrentAuthSnapshot(authSnapshot));
    surface?.setJoinPreview?.({ participants: [], status: "loading" });
    try {
      const participants = await api.loadSessionJoinPreview(sessionId);
      if (request.isStale()) return false;
      const ordered = (Array.isArray(participants) ? [...participants] : []).sort(
        (left, right) => Number(right?.role === "host") - Number(left?.role === "host")
      );
      surface?.setJoinPreview?.({ participants: ordered, status: "ready" });
      return true;
    } catch {
      if (request.isStale()) return false;
      surface?.setJoinPreview?.({ participants: [], status: "error" });
      return false;
    }
  }

  function setAuthSession(session) {
    store.setState({ authSession: session ?? null });
    store.emit("me");
  }

  function setProfile(profile) {
    store.setState({ profile: profile ?? null });
    store.emit("me");
  }

  function openSessionDetail(session, { initialStage = "idle" } = {}) {
    // mountSheet replaces a court drawer in the same root and preserves that
    // drawer's original opener for focus restoration. Forget the controller
    // reference without closing the surface ahead of that hand-off.
    transitionSurfaces("openDetail");
    if (!session) return;
    const action = actionFor(session);
    const participation = currentParticipation(session.sessionId);
    const hostCanManage = String(participation?.viewerRole) === "host" && Boolean(participation?.canCancel);
    const canDecide = hostCanManage && isUndecidedCandidate(session);
    const canEdit = hostCanManage && ["booked", "walk_on"].includes(session.venueType);
    const canChat = String(participation?.viewerParticipantStatus).toLowerCase() === "accepted";
    // 批 D4b:detail sheet 頭部的「我主揪的」badge 與候選資訊列的 guest-only
    // 條件用。刻意只看 viewerRole,不像 hostCanManage 那樣還要求 canCancel——
    // 一場自己主揪但目前不可管理的球局仍然「是我主揪的」。
    const isMine = String(participation?.viewerRole).toLowerCase() === "host";
    const showJoinPreview = Boolean(read().authSession);
    const previewAuthSnapshot = showJoinPreview ? captureAuthSnapshot() : null;
    let detail = null;
    detail = openSession(session, {
      action,
      courts: read().courts,
      canChat,
      canDecide,
      canEdit,
      isMine,
      showJoinPreview,
      initialStage,
      onDecide: () => openSessionDecision(session.sessionId),
      onEdit: () => openSessionEdit(session.sessionId),
      onChat: () => openSessionChat(session.sessionId),
      onPrimary: () => startPrimaryAction(session, detail),
      onConfirmJoin: () => requestJoin(session, detail, surfaceRegistry.meta("detail", "confirmingAuth")),
      canReport: Boolean(read().authSession && profileIsReady(read().profileEligibility)),
      onReport: () => openSessionReport(session.sessionId),
      onWithdraw: () => withdraw(session, detail),
      onClose: ({ reason = "dismiss" } = {}) => {
        surfaceRegistry.release("detail", detail);
        // requireSessionAction always saves a "join" intent before this sheet
        // ever reaches confirming (see its first line). A plain idle browse
        // never matches that intent, so this clear is a harmless no-op then;
        // once the sheet does represent an in-flight join attempt, an
        // intentional dismissal must abandon it so a later reload cannot
        // resume straight back into confirming.
        if (reason === "dismiss") clearIntent({ action: "join", sessionId: session.sessionId });
      },
    });
    const registeredDetail = surfaceRegistry.set("detail", detail?.close ? detail : null, {
      actionKey: detail?.close ? actionKey(action) : null,
      session: detail?.close ? session : null,
    });
    if (registeredDetail && previewAuthSnapshot) {
      void hydrateSessionJoinPreview(session.sessionId, registeredDetail, detailJoinPreviewGate, previewAuthSnapshot);
    }
    return registeredDetail;
  }

  function openSessionById(sessionId) {
    const session =
      read().sessions.find((entry) => String(entry.sessionId) === String(sessionId)) ??
      read().mySessions.find((entry) => String(entry.sessionId) === String(sessionId));
    return openSessionDetail(session);
  }

  async function openSessionFromLink(sessionId) {
    const normalizedSessionId = Number(sessionId);
    if (
      !Number.isSafeInteger(normalizedSessionId) ||
      normalizedSessionId <= 0 ||
      typeof api?.loadSessionSummary !== "function"
    ) {
      return { status: "unavailable" };
    }
    try {
      const session = await api.loadSessionSummary(normalizedSessionId);
      if (!session) return { status: "unavailable" };
      // 批 C3-2:main.js 的 hash 深連結開啟與 resumePendingIntent 的 join resume
      // 都不互相 await,兩條都可能在對方之後才把自己的 loadSessionSummary 讀完。
      // 單層化前兩者互不干擾(confirmation 是獨立 dialog root);單層化後都搶同一個
      // sheetRoot,晚到的一方若無條件 openSessionDetail 會把先到的一方蓋回 idle。
      // 這裡先查:若已經有這個 session 的 detail 開著(不論被誰、用哪個 stage 開的),
      // 就不要再蓋一次,保留它目前的狀態。
      const activeDetail = surfaceRegistry.get("detail");
      const activeDetailSession = surfaceRegistry.meta("detail", "session");
      if (activeDetail && activeDetailSession && String(activeDetailSession.sessionId) === String(session.sessionId)) {
        return { session, status: "opened" };
      }
      openSessionDetail(session);
      return { session, status: "opened" };
    } catch {
      return { status: "unavailable" };
    }
  }

  const { openSessionChat } = createChatController({
    api,
    chatPollIntervalMs,
    isCurrentAuthSnapshot,
    notifyMySessions,
    openChat,
    openReportForTarget,
    readCourts: () => read().courts,
    refreshMyPlayerBlocks,
    refreshMySessions,
    requireMySessionAction,
    surfaceRegistry,
    toast,
    transitionSurfaces,
    visibilityTarget,
    withdrawMySession,
  });

  function reconcileSuppressed(session) {
    return (
      suppressReconcileSessionId != null && session && String(session.sessionId) === String(suppressReconcileSessionId)
    );
  }

  function reconcileActiveDetail(bounds = read().bounds) {
    const activeDetail = surfaceRegistry.get("detail");
    const activeDetailSession = surfaceRegistry.meta("detail", "session");
    if (!activeDetail || !activeDetailSession || reconcileSuppressed(activeDetailSession)) return;
    const freshSession = read().sessions.find(
      (entry) => String(entry.sessionId) === String(activeDetailSession.sessionId)
    );
    // A viewport result may omit a still-valid session simply because it is
    // now off-screen. Only close when this authoritative response actually
    // includes the detail session and its rendered fields have changed.
    if (freshSession && !sameSessionDetail(activeDetailSession, freshSession)) {
      surfaceRegistry.close("detail", { reason: "stale-authority" });
    } else if (!freshSession && boundsContainSession(bounds, activeDetailSession)) {
      surfaceRegistry.close("detail", { reason: "stale-authority" });
    }
  }

  function reconcileActiveDetailParticipation() {
    const activeDetail = surfaceRegistry.get("detail");
    const activeDetailSession = surfaceRegistry.meta("detail", "session");
    if (!activeDetail || !activeDetailSession || reconcileSuppressed(activeDetailSession)) return;
    if (actionKey(actionFor(activeDetailSession)) !== surfaceRegistry.meta("detail", "actionKey")) {
      surfaceRegistry.close("detail", { reason: "stale-authority" });
    }
  }

  function reconcileActiveChatParticipation() {
    const activeChat = surfaceRegistry.get("chat");
    if (!activeChat) return;
    const session = currentParticipation(activeChat.session.sessionId);
    if (!chatMemberSession(session)) {
      surfaceRegistry.close("chat", { reason: "chat-authority-changed", restoreFocus: false });
      return;
    }
    activeChat.session = session;
    if (MY_SESSION_FINAL_STATUSES.has(String(session.status).toLowerCase())) activeChat.sheet?.setArchived?.();
  }

  function readIntent() {
    try {
      return intentStore?.read?.() ?? null;
    } catch {
      return null;
    }
  }

  function saveIntent(intent) {
    try {
      const savedIntent = intentStore?.save?.(intent) ?? intent;
      intentVersion += 1;
      return savedIntent;
    } catch {
      // An unavailable sessionStorage must not block the visible next step.
      intentVersion += 1;
      return intent;
    }
  }

  function clearIntent(expectedIntent = null) {
    const currentIntent = readIntent();
    if (expectedIntent && !samePendingIntent(currentIntent, expectedIntent)) return false;
    try {
      intentStore?.clear?.();
      intentVersion += 1;
      return true;
    } catch {
      return false;
    }
  }

  function closeForStaleIntent(message) {
    const options = { reason: "stale-intent", restoreFocus: false };
    surfaceRegistry.close("detail", options);
    // auto-expand 映射 v2 的 open(非 modal)。
    store.setState({ drawerState: "open" });
    publish();
    toast(message);
  }

  // 批 C3-2:join 單層化——「進入確認態」不再開第二層 dialog,而是讓 detail sheet
  // 就地切態。手動點擊路徑已經有開著的 detail,直接呼叫
  // 它的 enterConfirming;resume 路徑(見 resumePendingIntent)還沒有任何 sheet,
  // 走 else 分支以 initialStage:"confirming" 開一張新的。兩條路徑共用同一組
  // lifecycle in-flight 防呆與 confirmingAuth 快照時機。
  function enterJoinConfirming(session, detail = null) {
    if (lifecycleActionIsInFlight(session.sessionId)) {
      toast("這個球局的操作正在處理中。");
      return;
    }
    const expectedAccepted = Boolean(actionFor(session).expectedAccepted);
    surfaceRegistry.update("detail", { confirmingAuth: captureAuthSnapshot() });
    if (detail && surfaceRegistry.is("detail", detail)) {
      detail.enterConfirming?.({ expectedAccepted });
      return;
    }
    openSessionDetail(session, { initialStage: "confirming" });
  }

  function openProfileForIntent(intent, { returnSession = null } = {}) {
    if (surfaceRegistry.get("profilePrompt")) return surfaceRegistry.get("profilePrompt");
    let sheet = null;
    sheet = promptProfile({
      courts: read().courts,
      courtsReady: read().courtsReady,
      intent,
      onClose: ({ reason = "dismiss", saved = false } = {}) => {
        surfaceRegistry.release("profilePrompt", sheet);
        if (!saved && reason === "dismiss") clearIntent(intent);
      },
      returnSession,
    });
    return surfaceRegistry.set("profilePrompt", sheet?.close ? sheet : null, {
      intent: sheet?.close ? intent : null,
    });
  }

  function requireReadyProfile(level = null, { silentLoading = false } = {}) {
    const readiness = profileReadiness(read().profileEligibility, level);
    if (readiness.state === "ready") return true;
    if (!(silentLoading && readiness.state === "loading")) toast(profileUnavailableMessage(readiness));
    return false;
  }

  function requireSessionAction(intent, { detail = null, session = null } = {}) {
    const savedIntent = saveIntent(intent);
    if (!read().authSession) {
      openLogin({
        action: intent?.action ?? "",
        onClose: ({ reason = "dismiss" } = {}) => {
          if (reason === "dismiss") clearIntent(savedIntent);
        },
      });
      return;
    }
    const requiredGate = profileGateForIntent(savedIntent);
    if (!requireReadyProfile(requiredGate)) return;
    if (requiredGate && !profileMeetsGate(read().profileEligibility, requiredGate)) {
      openProfileForIntent(savedIntent, { returnSession: savedIntent.action === "join" ? session : null });
      return;
    }
    if (savedIntent.action === "players") {
      clearIntent(savedIntent);
      store.setState({ playerLayerOn: true });
      return loadPlayers(read().bounds);
    }
    if (savedIntent.action === "directory") {
      clearIntent(savedIntent);
      return loadPlayerDirectoryList();
    }
    if (savedIntent.action === "create") {
      openCreateSessionForIntent(savedIntent);
      return;
    }
    if (session) enterJoinConfirming(session, detail);
  }

  function startPrimaryAction(session, detail) {
    const action = actionFor(session);
    if (action.disabled) return;
    const participation = currentParticipation(session.sessionId);
    if (participation?.viewerParticipantStatus === "accepted") {
      return openSessionChat(session.sessionId);
    }
    requireSessionAction({ action: "join", sessionId: session.sessionId }, { detail, session });
  }

  async function refreshAuthoritativeState(authSnapshot) {
    const [participationReady, discoveryReady] = await Promise.all([
      reloadParticipation(authSnapshot?.epoch, authSnapshot?.identity),
      loadDiscovery(read().bounds),
    ]);
    if (authSnapshot && !isCurrentAuthSnapshot(authSnapshot)) return false;
    publish();
    return Boolean(participationReady && discoveryReady);
  }

  async function requestJoin(session, detail, confirmingAuth) {
    if (!isCurrentAuthSnapshot(confirmingAuth)) {
      surfaceRegistry.close("detail", undefined, detail);
      toast("登入狀態已變更，請重新開啟球局。");
      return { joinError: "登入狀態已變更，請重新開啟球局。" };
    }
    if (!profileMeetsGate(read().profileEligibility, "nickname")) {
      surfaceRegistry.close("detail", undefined, detail);
      requireSessionAction({ action: "join", sessionId: session.sessionId }, { session });
      return { joinError: "請先填寫公開暱稱。" };
    }
    const mutation = beginLifecycleAction("join", session.sessionId, confirmingAuth);
    if (!mutation) {
      toast("這個球局的操作正在處理中。");
      return { joinError: "這個球局的操作正在處理中。" };
    }
    try {
      const result = await api.requestToJoinSession(session.sessionId);
      if (!isCurrentAuthSnapshot(confirmingAuth)) return { joinError: "登入狀態已變更，請重新開啟球局。" };
      clearIntent({ action: "join", sessionId: session.sessionId });
      if (result?.reloadRequired || result?.outcome === "SESSION_EXPIRED") {
        surfaceRegistry.close("detail", undefined, detail);
        await refreshAuthoritativeState(confirmingAuth);
        toast("球局狀態已更新，請重新載入。");
        return { joinError: "球局狀態已更新，請重新載入。" };
      }
      // The detail sheet is itself the success surface now (single-layer
      // join). Do not close it — instead suppress the reconcile functions
      // for exactly this session while the refresh below legitimately
      // changes this session's own slotsRemaining/participation, so they
      // cannot mistake "my own join just landed" for "stale, close me".
      suppressReconcileSessionId = session.sessionId;
      try {
        if (!(await refreshAuthoritativeState(confirmingAuth))) {
          return { joinError: "球局狀態暫時無法重新載入，請重新整理後再試。" };
        }
      } finally {
        if (suppressReconcileSessionId === session.sessionId) suppressReconcileSessionId = null;
      }
      if (surfaceRegistry.is("detail", detail)) {
        const freshSession =
          read().sessions.find((entry) => String(entry.sessionId) === String(session.sessionId)) ?? session;
        surfaceRegistry.update("detail", {
          actionKey: actionKey(actionFor(freshSession)),
          session: freshSession,
        });
      }
      return { ...result, joinSubmitted: true };
    } catch (error) {
      if (!isCurrentAuthSnapshot(confirmingAuth)) return { joinError: "登入狀態已變更，請重新開啟球局。" };
      await refreshAuthoritativeState(confirmingAuth);
      const message = sessionActionMessage(error, "申請失敗，請稍後再試。");
      // A stale discovery response can legitimately close the underlying
      // detail before its inline error is rendered. Announce that result
      // instead of silently discarding it.
      if (!surfaceRegistry.is("detail", detail)) toast(message);
      return { joinError: message };
    } finally {
      finishLifecycleAction(mutation);
    }
  }

  async function commitPlayerVisibility() {
    const authSnapshot = captureAuthSnapshot();
    if (
      !isCurrentAuthSnapshot(authSnapshot) ||
      !profileIsReady(read().profileEligibility) ||
      !profileMeetsGate(read().profileEligibility, "directory")
    ) {
      throw new Error("登入或個人檔案狀態已變更，請重新整理後再試。");
    }
    if (typeof api?.setPlayerVisibility !== "function") throw new Error("目前無法更新球友卡設定。");

    const nextVisibility = !profileIsPublic(read().profileEligibility);
    await api.setPlayerVisibility(nextVisibility);
    if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新整理後再試。");

    // The RPC is the authoritative write. Publish its committed value before
    // the secondary profile read so My Sessions does not revert to the old
    // consent setting when reconciliation is slow or unavailable.
    store.setState({
      profile: read().profile ? { ...read().profile, isPublic: nextVisibility } : read().profile,
      profileEligibility: { ...read().profileEligibility, isPublic: nextVisibility },
    });
    notifyMySessions();

    // eslint-disable-next-line no-useless-assignment -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
    let reloaded = false;
    try {
      reloaded = await reloadCurrentProfile();
    } catch {
      if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新整理後再試。");
      throw new Error("球友卡設定已更新，但個人檔案同步失敗，請稍後重新整理。");
    }
    if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新整理後再試。");
    if (!reloaded) throw new Error("球友卡設定已更新，但個人檔案同步失敗，請稍後重新整理。");
  }

  function togglePlayerVisibility() {
    if (
      !read().authSession ||
      !profileIsReady(read().profileEligibility) ||
      !profileMeetsGate(read().profileEligibility, "directory")
    ) {
      return requireSessionAction({ action: "visibility" });
    }
    return commitPlayerVisibility();
  }

  function requireReportAccess() {
    const authSnapshot = captureAuthSnapshot();
    if (!isCurrentAuthSnapshot(authSnapshot) || !profileIsReady(read().profileEligibility)) {
      throw new Error("請先登入後再檢舉。");
    }
    if (typeof api?.createReport !== "function") throw new Error("目前無法送出檢舉。");
    return authSnapshot;
  }

  function openReportForTarget({ messageId = null, sessionId = null, reportedProfileId = null, targetLabel }) {
    const authSnapshot = requireReportAccess();
    let dialog = null;
    dialog = openReport({
      targetLabel,
      onClose: () => {
        surfaceRegistry.release("reportDialog", dialog);
      },
      onSubmit: async (reason) => {
        const normalizedReason = String(reason ?? "").trim();
        if (!normalizedReason) throw new Error("請選擇檢舉原因。");
        if (!isCurrentAuthSnapshot(authSnapshot) || !profileIsReady(read().profileEligibility)) {
          throw new Error("登入或個人檔案狀態已變更，請重新開啟檢舉。");
        }
        const reportInput = { reportedProfileId, reason: normalizedReason, sessionId };
        if (messageId != null) reportInput.messageId = messageId;
        const result = await api.createReport(reportInput);
        if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新開啟檢舉。");
        toast("已送出檢舉，謝謝你的回報。");
        return result;
      },
    });
    surfaceRegistry.set("reportDialog", dialog?.close ? dialog : null);
    return dialog;
  }

  function openSessionReport(sessionId) {
    const session =
      read().sessions.find((entry) => String(entry.sessionId) === String(sessionId)) ??
      read().mySessions.find((entry) => String(entry.sessionId) === String(sessionId));
    if (!session) throw new Error("這個球局已更新，請重新整理後再試。");
    return openReportForTarget({
      sessionId: session.sessionId,
      targetLabel: `${session.court} · ${session.startAt}`,
    });
  }

  function openRosterParticipantReport(sessionId, profileId) {
    const session = mySessionForAction(sessionId);
    const participant = (read().mySessionRosters.get(sessionKey(sessionId)) ?? []).find(
      (candidate) => String(candidate.profileId) === String(profileId)
    );
    if (!participant) throw new Error("申請者資料已更新，請重新整理後再試。");
    return openReportForTarget({
      reportedProfileId: participant.profileId,
      targetLabel: `${participant.nickname ?? "這位球友"} · ${session.court}`,
    });
  }

  // 批 D5:全螢幕流程改由 sheet 自己在同一張表單內切換「已發布」成功頁,
  // controller 不再自動 close()/showCreatedSession()——那兩個動作現在只在使用者
  // 點成功頁的「查看我的球局」/「回到地圖」時才由 sheet 觸發(見
  // openCreateSessionForIntent 的 onViewMySessions)。mutation 成功後若 auth 在
  // discovery/participation refresh 期間變了,一律 throw(不能悄悄略過)——sheet
  // 收到 throw 會走 inline error 分支,不會渲染成功頁,滿足「auth 變更時不得渲染
  // 成功頁」的不變量;此為既有「refresh 後 auth 不符就靜默 return」行為的刻意
  // 收斂,回報標注。
  async function submitCreateSession(input, openedAuthSnapshot = captureAuthSnapshot()) {
    const authSnapshot = openedAuthSnapshot;
    if (!isCurrentAuthSnapshot(authSnapshot) || !profileMeetsGate(read().profileEligibility, "ntrp")) {
      throw new Error("登入或個人檔案狀態已變更，請重新開啟表單。");
    }
    try {
      const result = await api.createSession(input);
      if (!isCurrentAuthSnapshot(authSnapshot)) {
        throw new Error("登入狀態已變更，請重新開啟表單。");
      }
      clearIntent({ action: "create" });
      await Promise.all([loadDiscovery(read().bounds), reloadParticipation(authSnapshot.epoch, authSnapshot.identity)]);
      if (!isCurrentAuthSnapshot(authSnapshot)) {
        throw new Error("登入狀態已變更，請重新整理後再試。");
      }
      toast("球局已發布！");
      return result;
    } catch (error) {
      if (error instanceof DataApiUnavailableError) {
        // eslint-disable-next-line preserve-caught-error -- 保留既有使用者文案與未附 cause 的錯誤語意。
        throw new Error("本機示範資料僅供瀏覽；登入、儲存個人檔案與建立球局需在已設定服務的環境使用。");
      }
      throw error;
    }
  }

  function openCreateSessionForIntent(intent = { action: "create" }) {
    if (surfaceRegistry.get("createSession")) return surfaceRegistry.get("createSession");
    const openedAuthSnapshot = captureAuthSnapshot();
    let sheet = null;
    sheet = openCreateSession({
      courts: read().courts,
      courtsReady: read().courtsReady,
      onClose: ({ reason = "dismiss" } = {}) => {
        surfaceRegistry.release("createSession", sheet);
        if (reason === "dismiss") clearIntent(intent);
      },
      onSubmit: (input) => submitCreateSession(input, openedAuthSnapshot),
      onViewMySessions: (sessionId) => showCreatedSession(sessionId),
    });
    return surfaceRegistry.set("createSession", sheet?.close ? sheet : null);
  }

  function resumePendingIntent() {
    const authSnapshot = captureAuthSnapshot();
    if (!isCurrentAuthSnapshot(authSnapshot)) return Promise.resolve(false);
    const intent = readIntent();
    if (!intent) return Promise.resolve(false);
    const resumeKey = JSON.stringify([
      authSnapshot.epoch,
      authSnapshot.identity,
      intent.action,
      intent.action === "join" ? intent.sessionId : null,
    ]);
    if (resumeInFlight.has(resumeKey)) return resumeInFlight.get(resumeKey);
    const operation = (async () => {
      if (!isCurrentAuthSnapshot(authSnapshot) || !samePendingIntent(readIntent(), intent)) return false;

      // create/join 靜默等待 profile gate 自動續行；players/directory/visibility 保留目前等待提示。

      if (intent.action === "create") {
        if (!requireReadyProfile("ntrp", { silentLoading: true })) return false;
        if (!profileMeetsGate(read().profileEligibility, "ntrp")) {
          openProfileForIntent(intent);
          return true;
        }
        openCreateSessionForIntent(intent);
        return true;
      }

      if (intent.action === "players") {
        if (!requireReadyProfile("ntrp")) return false;
        if (!profileMeetsGate(read().profileEligibility, "ntrp")) {
          openProfileForIntent(intent);
          return true;
        }
        clearIntent(intent);
        store.setState({ playerLayerOn: true });
        return loadPlayers(read().bounds);
      }

      if (intent.action === "directory") {
        if (!requireReadyProfile("directory")) return false;
        if (!profileMeetsGate(read().profileEligibility, "directory")) {
          openProfileForIntent(intent);
          return true;
        }
        clearIntent(intent);
        return loadPlayerDirectoryList();
      }

      if (intent.action === "visibility") {
        if (!requireReadyProfile("directory")) return false;
        if (!profileMeetsGate(read().profileEligibility, "directory")) {
          openProfileForIntent(intent);
          return true;
        }
        clearIntent(intent);
        await commitPlayerVisibility();
        return true;
      }

      if (intent.action !== "join" || typeof api?.loadSessionSummary !== "function") return false;
      // eslint-disable-next-line no-useless-assignment -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
      let target = null;
      try {
        target = await api.loadSessionSummary(intent.sessionId);
      } catch {
        if (isCurrentAuthSnapshot(authSnapshot) && samePendingIntent(readIntent(), intent)) {
          toast("暫時無法確認這個球局，請稍後再試。");
        }
        return false;
      }
      if (!isCurrentAuthSnapshot(authSnapshot) || !samePendingIntent(readIntent(), intent)) return false;

      const staleMessage = staleIntentMessage(target);
      if (staleMessage) {
        clearIntent(intent);
        closeForStaleIntent(staleMessage);
        return false;
      }
      if (!requireReadyProfile("nickname", { silentLoading: true })) return false;
      if (!profileMeetsGate(read().profileEligibility, "nickname")) {
        openProfileForIntent(intent, { returnSession: target });
        return true;
      }
      // 批 C3-2:resume 過去是直接開獨立 confirmation dialog(見 ground truth 意外
      // 2),與手動點擊路徑(先開 detail sheet 再進 confirming)不對稱。單層化後
      // resume 也走 enterJoinConfirming,以 initialStage:"confirming" 直接開一張
      // 已經是確認態的 detail sheet,gate 完成後一步到確認,不再閃過一層獨立
      // dialog。main.js 的 hash 深連結開啟跟這裡都不互相 await,可能已經先開好
      // 同一個 session 的 idle detail(見 openSessionFromLink 的對稱防呆)——這裡
      // 若發現 activeDetail 剛好就是同一個 session,直接升級那張既有的,不要另開
      // 一張新的蓋掉它。
      const activeDetail = surfaceRegistry.get("detail");
      const activeDetailSession = surfaceRegistry.meta("detail", "session");
      const existingDetail =
        activeDetail && activeDetailSession && String(activeDetailSession.sessionId) === String(target.sessionId)
          ? activeDetail
          : null;
      enterJoinConfirming(target, existingDetail);
      return true;
    })();
    resumeInFlight.set(resumeKey, operation);
    return operation.finally(() => {
      if (resumeInFlight.get(resumeKey) === operation) resumeInFlight.delete(resumeKey);
    });
  }

  function requestCurrentLocation() {
    if (read().locationBlocked) {
      store.setState({ locationMessage: LOCATION_UNAVAILABLE_MESSAGE });
      publish();
      return;
    }
    const request = locationGate.issue();
    const geolocation = globalThis.navigator?.geolocation;
    if (!geolocation?.getCurrentPosition) {
      store.setState({ locationBlocked: true, locationMessage: LOCATION_UNAVAILABLE_MESSAGE });
      publish();
      return;
    }
    try {
      geolocation.getCurrentPosition(
        ({ coords }) => {
          if (request.isStale()) return;
          const lat = Number(coords?.latitude);
          const lng = Number(coords?.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            store.setState({ locationBlocked: true, locationMessage: LOCATION_UNAVAILABLE_MESSAGE });
            publish();
            return;
          }
          store.setState({ userLocation: { lat, lng }, locationBlocked: false, locationMessage: "" });
          refreshLocationViewport({ lat, lng });
        },
        () => {
          if (request.isStale()) return;
          store.setState({ locationBlocked: true, locationMessage: LOCATION_UNAVAILABLE_MESSAGE });
          publish();
        },
        { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 }
      );
    } catch {
      if (request.isStale()) return;
      store.setState({ locationBlocked: true, locationMessage: LOCATION_UNAVAILABLE_MESSAGE });
      publish();
    }
  }

  function openCreateIntent() {
    requireSessionAction({ action: "create" });
  }

  function togglePlayerLayer() {
    if (!read().playerLayerOn) {
      if (
        !read().authSession ||
        !profileIsReady(read().profileEligibility, "ntrp") ||
        !profileMeetsGate(read().profileEligibility, "ntrp")
      ) {
        return requireSessionAction({ action: "players" });
      }
      store.setState({ playerLayerOn: true });
      return loadPlayers(read().bounds);
    }
    clearPlayerLayer({ closeReason: "player-layer-off" });
    publish();
    return Promise.resolve(true);
  }

  async function setAuthState(session, profile = null) {
    const identity = sessionIdentity(session);
    const previousIdentity = sessionIdentity(read().authSession);
    const identityChanged = previousIdentity !== identity;
    const signedOut = Boolean(previousIdentity) && !identity;
    const accountChanged = Boolean(previousIdentity) && Boolean(identity) && previousIdentity !== identity;
    const gateLevels = ["nickname", "ntrp", "directory"];
    const previousGates = Object.fromEntries(
      gateLevels.map((level) => [level, profileMeetsGate(read().profileEligibility, level)])
    );
    const nextGates = Object.fromEntries(gateLevels.map((level) => [level, profileMeetsGate(profile, level)]));
    const previousReadiness = profileReadiness(read().profileEligibility);
    const nextReadiness = profileReadiness(profile);
    const gatesChanged = gateLevels.some((level) => previousGates[level] !== nextGates[level]);
    const nicknameWasLost = previousGates.nickname && !nextGates.nickname;
    const ntrpWasLost = previousGates.ntrp && !nextGates.ntrp;
    const directoryWasLost = previousGates.directory && !nextGates.directory;
    const readinessChanged =
      previousReadiness.state !== nextReadiness.state || previousReadiness.source !== nextReadiness.source;
    if (identityChanged || gatesChanged || readinessChanged) store.setState({ authEpoch: read().authEpoch + 1 });
    const epoch = read().authEpoch;

    if (signedOut || accountChanged) clearIntent();
    if (signedOut || accountChanged || ntrpWasLost) {
      clearPlayerLayer({ closeReason: signedOut || accountChanged ? "account-change" : "ntrp-gate-lost" });
    }
    if (signedOut || accountChanged || ntrpWasLost || directoryWasLost) {
      clearPlayerDirectory({ closeReason: signedOut || accountChanged ? "account-change" : "directory-gate-lost" });
    }
    if (identityChanged) {
      const options = { reason: "account-change", restoreFocus: false };
      transitionSurfaces("authIdentityChanged", options);
    } else {
      if (ntrpWasLost) {
        transitionSurfaces("authNtrpLost", { reason: "ntrp-gate-lost", restoreFocus: false });
      }
      // 批 C3-2:join confirmation 已併入 detail sheet,不再是獨立 surface;失去
      // nickname gate 時改直接關掉 detail(若那張 detail 正代表一次 join 嘗試,
      // detail close 的 onClose 會一併清掉對應的 pending intent)。
      if (nicknameWasLost) {
        transitionSurfaces("authNicknameLost", { reason: "nickname-gate-lost", restoreFocus: false });
      }
      const promptGate = profileGateForIntent(surfaceRegistry.meta("profilePrompt", "intent"));
      if (surfaceRegistry.get("profilePrompt") && promptGate && !previousGates[promptGate] && nextGates[promptGate]) {
        transitionSurfaces("authProfileResolved", { reason: "profile-gate-resolved", restoreFocus: false });
      }
    }

    store.setState({ authSession: session ?? null, profileEligibility: profile ?? null });
    store.emit("me");
    if (identityChanged) {
      replaceMySessions([]);
      blockedPlayerGate.invalidate();
      store.setState({
        blockedPlayers: [],
        blockedPlayersError: "",
        blockedPlayersStatus: "idle",
        mySessionsError: "",
        mySessionsStatus: identity ? "loading" : "idle",
      });
      // The private DOM may currently contain a roster. Push the
      // empty snapshot synchronously, including on plain sign-out, before any
      // optional authenticated reload can run.
      notifyMySessions();
    }
    reconcileActiveDetailParticipation();
    reconcileActiveChatParticipation();
    publish();
    if (await reloadParticipation(epoch, identity)) publish();
    if (epoch === read().authEpoch && isCurrentAuthSnapshot({ epoch, identity })) await resumePendingIntent();
  }

  startDiscoveryPolling();

  return {
    attachMap,
    cancelMySession,
    capturePendingIntentVersion: () => intentVersion,
    clearPendingIntent: () => clearIntent(),
    clearPendingIntentIfUnchanged: (version) => (version === intentVersion ? clearIntent() : false),
    confirmMySessionAttendance,
    expandBounds,
    getAppState: () => ({
      authSession: read().authSession,
      courts: read().courts,
      courtsReady: read().courtsReady,
      profile: read().profile,
    }),
    getMySessions: () => [...read().mySessions],
    getMySessionGroups: () => mySessionGroups(),
    getMySessionState: () => selectControllerMySessionsView(read()),
    getPlayerLayerState: () => ({
      groups: read().playerLayerOn ? playerGroups() : [],
      message: read().playerLayerMessage,
      on: read().playerLayerOn,
      status: read().playerLayerStatus,
    }),
    getVisibleSessions: visibleSessions,
    loadDiscovery,
    markMySessionPlayed,
    openCourt,
    openPlayerDirectory,
    openPlayerCourt,
    openCreateIntent,
    openRosterParticipantReport,
    openSessionFromLink,
    openSessionDecision,
    openSessionEdit,
    openSessionChat,
    openSessionReport,
    openSession: openSessionById,
    requestCurrentLocation,
    refreshMyPlayerBlocks,
    refreshMySessions,
    respondInvite,
    reviewMySessionParticipant,
    resetFilters,
    resumePendingIntent,
    retryDiscovery,
    setAuthState,
    setAuthSession,
    setCourts,
    setDrawerState,
    setFilter,
    setMapUnavailable,
    setProfile,
    sessionStore: store,
    togglePlayerVisibility,
    togglePlayerLayer,
    unblockPlayer,
    withdrawMySession,
  };
}
