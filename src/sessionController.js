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
import { createIntentController } from "./controller/intentController.ts";

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
    openCreateIntent: () => intentController.openCreateIntent(),
    openPlayerCard,
    openPlayerDirectoryList,
    openSessionById,
    playerCardGate,
    playerDirectoryGate,
    playerGate,
    publish: () => discoveryMapController.publish(),
    reloadParticipation,
    requireSessionAction: (intent) => intentController.requireSessionAction(intent),
    store,
    surfaceRegistry,
    transitionSurfaces,
    visibleSessions: () => discoveryMapController.getVisibleSessions(),
  });
  const {
    clearPlayerDirectory,
    clearPlayerLayer,
    getPlayerGroups: playerGroups,
    loadPlayerDirectoryList,
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

  const intentController = createIntentController({
    actionFor,
    api,
    beginLifecycleAction,
    captureAuthSnapshot,
    clearPlayerLayer,
    commitPlayerVisibility,
    currentParticipation,
    finishLifecycleAction,
    intentStore,
    isCurrentAuthSnapshot,
    lifecycleActionIsInFlight,
    loadDiscovery: () => discoveryMapController.loadDiscovery(),
    loadPlayerDirectoryList,
    loadPlayers: () => playerDirectoryController.loadPlayers(),
    locationGate,
    openCreateSession,
    openLogin,
    openSessionChat: (sessionId) => openSessionChat(sessionId),
    openSessionDetail,
    profilePrompt: promptProfile,
    publish,
    refreshLocationViewport,
    reloadParticipation,
    showCreatedSession,
    store,
    surfaceRegistry,
    toast,
  });
  const {
    capturePendingIntentVersion,
    clearIntent,
    clearPendingIntentIfUnchanged,
    isReconcileSuppressed: reconcileSuppressed,
    openCreateIntent,
    refreshAuthoritativeState,
    requestCurrentLocation,
    requestJoin,
    requireSessionAction,
    resumePendingIntent,
    startPrimaryAction,
    togglePlayerLayer,
  } = intentController;

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
    capturePendingIntentVersion,
    clearPendingIntent: () => clearIntent(),
    clearPendingIntentIfUnchanged,
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
