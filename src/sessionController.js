import {
  CHAT_POLL_INTERVAL_MS,
  DISCOVERY_POLL_INTERVAL_MS,
  LOCATION_INITIAL_RADIUS_METERS,
  MAP_IDLE_DEBOUNCE_MS,
  TAIPEI_CITY_BOUNDS,
} from "./config.js";
import { DEFAULT_FILTER_STATE } from "./filters.js";
import {
  boundsContainSession,
  cloneBounds,
  cloneFilters,
  mapStatusForState,
  representsExpectedViewport,
  selectVisibleSessions,
  validBounds,
} from "./features/discovery/discoveryFeature.ts";
import {
  MY_SESSION_FINAL_STATUSES,
  MY_SESSION_OPEN_STATUSES,
  actionKey,
  groupMySessions,
  hostCanDecideSession,
  hostCanEditSession,
  sameSessionDetail,
  staleIntentMessage,
  terminalAction,
} from "./features/session-lifecycle/sessionLifecycleFeature.ts";
import { chatMemberSession, latestChatMessageId, visibleChatMessage } from "./features/chat/chatFeature.ts";
import {
  authSnapshotForState,
  authSnapshotIsCurrent,
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
import {
  groupPlayersByCourt,
  playerDirectoryRows,
  selectInvitableSessions,
} from "./features/player-directory/playerDirectoryFeature.ts";
import { createForegroundPoller, createRequestGate } from "./requestGate.js";
import { isSessionFull, isUndecidedCandidate } from "./sessionCriteria.js";
import { createStore } from "./sessionStore.ts";

// 批 11-C:requestCurrentLocation 的五個失敗分支(已封鎖/無 geolocation/座標非有限值/
// 使用者拒絕/呼叫拋錯)共用同一句文案,原本五處各寫一次字面。抽成常數只去重,文案逐字不變。
const LOCATION_UNAVAILABLE_MESSAGE = "無法取得位置；你仍可移動地圖或依球場尋找球局。";

/**
 * Arrange private My Sessions rows around the next safe action. Host request
 * rows are supplied by an already-authorized roster hydrate; public discovery
 * is never used to infer them.
 */
export { groupMySessions };

const EXPLICIT_VIEWPORT_IDLE_GRACE_MS = MAP_IDLE_DEBOUNCE_MS * 8;
const MAX_EXPECTED_EXPLICIT_VIEWPORTS = 6;

function createSurfaceRegistry(definitions) {
  const entries = Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => [
      name,
      Object.fromEntries([["handle", null], ...(definition.metadata ?? []).map((key) => [key, null])]),
    ])
  );

  function definitionFor(name) {
    const definition = definitions[name];
    if (!definition) throw new Error(`Unknown surface: ${name}`);
    return definition;
  }

  function entryFor(name) {
    definitionFor(name);
    return entries[name];
  }

  const registry = {
    close(name, options, expected = registry.get(name)) {
      const definition = definitionFor(name);
      const handle = registry.release(name, expected);
      if (!handle) return false;
      const closeOptions = options === undefined && definition.emptyOptionsByDefault !== false ? {} : options;
      (definition.close ?? ((surface, nextOptions) => surface?.close?.(nextOptions)))(handle, closeOptions);
      return true;
    },
    get(name) {
      return entryFor(name).handle;
    },
    is(name, expected) {
      return Boolean(expected) && registry.get(name) === expected;
    },
    meta(name, key) {
      return entryFor(name)[key];
    },
    release(name, expected = registry.get(name)) {
      const definition = definitionFor(name);
      const entry = entryFor(name);
      if (!expected || entry.handle !== expected) return null;
      const handle = entry.handle;
      entry.handle = null;
      for (const key of definition.metadata ?? []) entry[key] = null;
      definition.onRelease?.(handle);
      return handle;
    },
    set(name, handle, metadata = {}) {
      const definition = definitionFor(name);
      const entry = entryFor(name);
      entry.handle = handle ?? null;
      for (const key of definition.metadata ?? []) {
        if (Object.hasOwn(metadata, key)) entry[key] = metadata[key] ?? null;
      }
      return entry.handle;
    },
    transition(operations, options) {
      for (const item of operations ?? []) {
        const operation = typeof item === "string" ? { name: item } : item;
        if (operation.when && !operation.when(registry)) continue;
        const action = operation.action ?? "close";
        const expected = Object.hasOwn(operation, "expected") ? operation.expected : registry.get(operation.name);
        if (action === "release") registry.release(operation.name, expected);
        else
          registry.close(operation.name, Object.hasOwn(operation, "options") ? operation.options : options, expected);
      }
    },
    update(name, metadata) {
      const definition = definitionFor(name);
      const entry = entryFor(name);
      for (const key of definition.metadata ?? []) {
        if (Object.hasOwn(metadata, key)) entry[key] = metadata[key] ?? null;
      }
    },
  };
  return registry;
}

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
  let map = null;
  let idleTimer = null;
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
  let explicitViewportGeneration = 0;
  let expectedExplicitViewports = [];
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
  let lifecycleMutationGeneration = 0;
  let intentVersion = 0;
  const resumeInFlight = new Map();
  const inFlightLifecycleActions = new Map();

  function visibleSessions() {
    return selectVisibleSessions(read());
  }

  function playerGroups() {
    return groupPlayersByCourt(read().players);
  }

  function mapStatus() {
    return mapStatusForState(read());
  }

  // 通道 1「map」:球局列表、圖釘與球友圖層。派發一律由 publish() 顯式觸發,不做
  // 變更偵測——既有行為包含「值沒變仍要重畫」(例如 refreshAuthoritativeState 收尾
  // 的那次),偵測式派發會把它吃掉。
  store.subscribe("map", (current) => {
    const sessions = visibleSessions();
    render({
      sessions,
      drawerState: current.drawerState,
      hasUserLocation: Boolean(current.userLocation),
      filters: current.filters,
      courts: current.courts,
      mapStatus: mapStatus(),
      locationMessage: current.locationMessage,
    });
    renderPins(sessions);
    renderPlayers({
      groups: current.playerLayerOn ? playerGroups() : [],
      message: current.playerLayerMessage,
      on: current.playerLayerOn,
      status: current.playerLayerStatus,
    });
  });

  function publish() {
    store.emit("map");
  }

  function currentParticipation(sessionId) {
    if (!read().authSession) return null;
    return read().mySessions.find((entry) => String(entry.sessionId) === String(sessionId)) ?? null;
  }

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

  function sessionKey(sessionId) {
    return String(sessionId);
  }

  function mySessionItems() {
    return read().mySessions.map((session) => ({
      ...session,
      pendingRequests: [...(read().mySessionRosters.get(sessionKey(session.sessionId)) ?? [])],
    }));
  }

  function mySessionGroups() {
    return groupMySessions(mySessionItems());
  }

  // 通道 2「mySessions」:我的球局頁(含封鎖清單與球友卡公開設定)。
  store.subscribe("mySessions", (current) => {
    onMySessionsChange({
      authenticated: Boolean(current.authSession),
      blockedPlayers: [...current.blockedPlayers],
      blockedPlayersError: current.blockedPlayersError,
      blockedPlayersStatus: current.blockedPlayersStatus,
      error: current.mySessionsError,
      groups: mySessionGroups(),
      isPublic: profileIsPublic(current.profileEligibility),
      status: current.mySessionsStatus,
      viewGeneration: current.authEpoch,
    });
  });

  function notifyMySessions() {
    store.emit("mySessions");
  }

  function replaceMySessions(sessions) {
    store.setState({ mySessions: Array.isArray(sessions) ? sessions : [], mySessionRosters: new Map() });
    mySessionsVersion += 1;
  }

  function isCurrentMySessionsSnapshot(snapshot) {
    return isCurrentAuthSnapshot(snapshot) && snapshot?.mySessionsVersion === mySessionsVersion;
  }

  function hostSessionsNeedingRoster() {
    return read().mySessions.filter(
      (session) =>
        String(session?.viewerRole) === "host" &&
        Boolean(session?.canCancel) &&
        MY_SESSION_OPEN_STATUSES.has(String(session?.status ?? "").toLowerCase())
    );
  }

  async function hydrateMySessionRosters(authSnapshot = captureAuthSnapshot()) {
    if (!isCurrentAuthSnapshot(authSnapshot)) return false;
    if (typeof api?.loadSessionRoster !== "function") return true;
    const snapshot = { ...authSnapshot, mySessionsVersion };
    const request = rosterGate.issue(() => isCurrentMySessionsSnapshot(snapshot));
    const targets = hostSessionsNeedingRoster();
    const results = await Promise.all(
      targets.map(async (session) => {
        try {
          const roster = await api.loadSessionRoster(session.sessionId);
          return { roster: Array.isArray(roster) ? roster : [], sessionId: session.sessionId };
        } catch {
          return { roster: null, sessionId: session.sessionId };
        }
      })
    );
    if (request.isStale()) return false;
    const rosters = new Map();
    let failed = false;
    for (const result of results) {
      if (result.roster) rosters.set(sessionKey(result.sessionId), result.roster);
      else failed = true;
    }
    store.setState({ mySessionRosters: rosters });
    if (failed) {
      store.setState({
        mySessionsError: "待審核申請暫時無法載入，請重新整理後再試。",
        mySessionsStatus: "error",
      });
    }
    notifyMySessions();
    return !failed;
  }

  async function refreshMySessions() {
    const authSnapshot = captureAuthSnapshot();
    if (!isCurrentAuthSnapshot(authSnapshot)) return false;
    return reloadParticipation(authSnapshot.epoch, authSnapshot.identity);
  }

  async function refreshMyPlayerBlocks(authSnapshot = captureAuthSnapshot()) {
    if (!isCurrentAuthSnapshot(authSnapshot)) return false;
    if (typeof api?.loadMyPlayerBlocks !== "function") return true;
    const request = blockedPlayerGate.issue(() => isCurrentAuthSnapshot(authSnapshot));
    store.setState({ blockedPlayersStatus: "loading", blockedPlayersError: "" });
    notifyMySessions();
    try {
      const rows = await api.loadMyPlayerBlocks();
      if (request.isStale()) return false;
      store.setState({ blockedPlayers: Array.isArray(rows) ? rows : [], blockedPlayersStatus: "ready" });
      notifyMySessions();
      return true;
    } catch {
      if (request.isStale()) return false;
      store.setState({ blockedPlayersError: "封鎖清單暫時無法載入。", blockedPlayersStatus: "error" });
      notifyMySessions();
      return false;
    }
  }

  async function unblockPlayer(profileId) {
    const authSnapshot = captureAuthSnapshot();
    const normalizedProfileId = Number(profileId);
    if (
      !isCurrentAuthSnapshot(authSnapshot) ||
      !Number.isSafeInteger(normalizedProfileId) ||
      normalizedProfileId <= 0
    ) {
      throw new Error("封鎖清單已更新，請重新整理後再試。");
    }
    if (!read().blockedPlayers.some((row) => Number(row.blockedProfileId) === normalizedProfileId)) {
      throw new Error("封鎖清單已更新，請重新整理後再試。");
    }
    if (typeof api?.setPlayerBlock !== "function") throw new Error("目前無法更新封鎖清單。");
    await api.setPlayerBlock(normalizedProfileId, false);
    if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新整理後再試。");
    if (!(await refreshMyPlayerBlocks(authSnapshot))) {
      throw new Error("已解除封鎖，但清單暫時無法重新載入。");
    }
    toast("已解除封鎖。");
    return true;
  }

  function actionFor(session) {
    const terminal = terminalAction(session);
    if (terminal) return { label: terminal, disabled: true, kind: "terminal" };
    const participation = currentParticipation(session.sessionId);
    if (participation?.viewerParticipantStatus === "accepted") return { label: "群組聊天", kind: "chat" };
    if (participation?.viewerParticipantStatus === "requested") {
      return { label: "申請等待中", disabled: true, secondaryLabel: "撤回申請", kind: "waiting" };
    }
    if (isSessionFull(session)) {
      return { label: "已額滿", disabled: true, kind: "full" };
    }
    const viewerNtrp = Number(read().profileEligibility?.ntrpValue);
    const hasViewerNtrp = read().profileEligibility?.ntrpValue != null && Number.isFinite(viewerNtrp);
    if (read().authSession && !hasViewerNtrp && read().profileEligibility?.ntrp === false) {
      return {
        label: "申請加入",
        note: "尚未填寫程度；補填 NTRP 可先確認是否符合球局範圍，仍可直接送出申請。",
        kind: "join",
        expectedAccepted: false,
      };
    }
    const sessionMin = Number(session.ntrpMin);
    const sessionMax = Number(session.ntrpMax);
    const hasSessionRange =
      session.ntrpMin != null && session.ntrpMax != null && Number.isFinite(sessionMin) && Number.isFinite(sessionMax);
    if (hasViewerNtrp && hasSessionRange && (viewerNtrp < sessionMin || viewerNtrp > sessionMax)) {
      return {
        label: "申請加入",
        note: "你的 NTRP 不在球局設定的 NTRP 範圍內，仍可送出申請由主揪審核。",
        kind: "join",
        expectedAccepted: false,
      };
    }
    if (String(session.joinMode) === "instant") return { label: "直接加入", kind: "join", expectedAccepted: true };
    return { label: "申請加入", kind: "join", expectedAccepted: false };
  }

  function captureAuthSnapshot() {
    return authSnapshotForState(read());
  }

  function isCurrentAuthSnapshot(snapshot) {
    return authSnapshotIsCurrent(snapshot, read());
  }

  function lifecycleActionKey(sessionId, identity = sessionIdentity(read().authSession)) {
    if (!identity) return null;
    return JSON.stringify([String(identity), String(sessionId)]);
  }

  function beginLifecycleAction(kind, sessionId, authSnapshot) {
    const key = lifecycleActionKey(sessionId, authSnapshot?.identity);
    if (!key || inFlightLifecycleActions.has(key)) return null;
    const token = { generation: ++lifecycleMutationGeneration, key, kind };
    inFlightLifecycleActions.set(key, token);
    return token;
  }

  function finishLifecycleAction(token) {
    if (token && inFlightLifecycleActions.get(token.key) === token) inFlightLifecycleActions.delete(token.key);
  }

  function lifecycleActionIsInFlight(sessionId) {
    const key = lifecycleActionKey(sessionId);
    return Boolean(key && inFlightLifecycleActions.has(key));
  }

  async function reloadParticipation(epoch = read().authEpoch, identity = sessionIdentity(read().authSession)) {
    if (!read().authSession || !identity || typeof api?.loadMySessions !== "function") return false;
    const request = participationGate.issue(
      () =>
        epoch === read().authEpoch && Boolean(read().authSession) && sessionIdentity(read().authSession) === identity
    );
    store.setState({ mySessionsStatus: "loading" });
    notifyMySessions();
    try {
      const sessions = await api.loadMySessions();
      if (request.isStale()) return false;
      replaceMySessions(sessions);
      store.setState({ mySessionsError: "" });
      // Publish the cleared private cache before awaiting the roster read so
      // an old roster never survives in the rendered destination.
      notifyMySessions();
      const rosterReady = await hydrateMySessionRosters({ epoch, identity });
      if (!rosterReady || request.isStale()) return false;
      store.setState({ mySessionsStatus: "ready" });
      reconcileActiveDetailParticipation();
      reconcileActiveChatParticipation();
      notifyMySessions();
      return true;
    } catch {
      if (request.isStale()) return false;
      // A retryable read failure must not turn a known private list into an
      // empty state. Keep the last authoritative rows and surface an error to
      // the My Sessions page instead.
      store.setState({ mySessionsError: "我的球局暫時無法載入。", mySessionsStatus: "error" });
      notifyMySessions();
      return false;
    }
  }

  function clearPlayerDirectory({ closeReason = "player-directory-clear" } = {}) {
    playerDirectoryGate.invalidate();
    const options = { reason: closeReason, restoreFocus: false };
    transitionSurfaces("clearPlayerDirectory", options);
  }

  function clearPlayerLayer({ turnOff = true, closeReason = "player-layer-clear" } = {}) {
    playerGate.invalidate();
    const options = { reason: closeReason, restoreFocus: false };
    transitionSurfaces("clearPlayerLayer", options);
    if (turnOff) store.setState({ playerLayerOn: false });
    store.setState({ players: [], playerLayerStatus: "idle", playerLayerMessage: "" });
  }

  async function loadPlayers(bounds = read().bounds) {
    if (!read().playerLayerOn || !read().authSession || !profileMeetsGate(read().profileEligibility, "ntrp"))
      return false;
    const nextBounds = validBounds(bounds) ? cloneBounds(bounds) : cloneBounds(TAIPEI_CITY_BOUNDS);
    const authSnapshot = captureAuthSnapshot();
    const request = playerGate.issue(
      () =>
        read().playerLayerOn &&
        profileMeetsGate(read().profileEligibility, "ntrp") &&
        isCurrentAuthSnapshot(authSnapshot)
    );
    transitionSurfaces("clearPlayerLayer", { reason: "player-refresh", restoreFocus: false });
    store.setState({ players: [], playerLayerStatus: "loading", playerLayerMessage: "正在載入在線球友…" });
    publish();
    try {
      const presence =
        typeof api.loadPlayerPresenceDirectory === "function"
          ? await api.loadPlayerPresenceDirectory({ bounds: nextBounds })
          : [];
      if (request.isStale()) return false;
      store.setState({
        players: (Array.isArray(presence) ? presence : []).map((player) => ({ ...player, isPresent: true })),
        playerLayerStatus: "ready",
        playerLayerMessage: "",
      });
      publish();
      return true;
    } catch {
      if (request.isStale()) return false;
      store.setState({ players: [], playerLayerStatus: "error", playerLayerMessage: "在線資料暫時無法載入。" });
      publish();
      return false;
    }
  }

  async function loadPlayerDirectoryList() {
    if (!read().authSession || !profileMeetsGate(read().profileEligibility, "directory")) return false;
    const authSnapshot = captureAuthSnapshot();
    transitionSurfaces("openPlayerDirectory");
    let directory = null;
    directory = openPlayerDirectoryList({
      onClose: () => {
        surfaceRegistry.release("playerDirectory", directory);
      },
      onOpenPlayer: (player) => openPlayer(player, { gateLevel: "directory", requiresLayer: false }),
      onRetry: () => loadPlayerDirectoryList(),
    });
    surfaceRegistry.set("playerDirectory", directory?.close ? directory : null);
    const request = playerDirectoryGate.issue(
      () =>
        surfaceRegistry.is("playerDirectory", directory) &&
        profileMeetsGate(read().profileEligibility, "directory") &&
        isCurrentAuthSnapshot(authSnapshot)
    );
    directory?.setDirectory?.({ players: [], status: "loading" });
    try {
      const [directoryRows, presenceRows] = await Promise.all([
        api.loadPlayerDirectory(),
        typeof api.loadPlayerPresenceDirectory === "function" ? api.loadPlayerPresenceDirectory() : [],
      ]);
      if (request.isStale()) return false;
      directory?.setDirectory?.({ players: playerDirectoryRows(directoryRows, presenceRows), status: "ready" });
      return true;
    } catch {
      if (request.isStale()) return false;
      directory?.setDirectory?.({ players: [], status: "error" });
      return false;
    }
  }

  function openPlayerDirectory() {
    if (
      !read().authSession ||
      !profileIsReady(read().profileEligibility, "directory") ||
      !profileMeetsGate(read().profileEligibility, "directory")
    ) {
      return requireSessionAction({ action: "directory" });
    }
    return loadPlayerDirectoryList();
  }

  async function loadDiscovery(bounds = read().bounds) {
    const nextBounds = validBounds(bounds) ? cloneBounds(bounds) : cloneBounds(TAIPEI_CITY_BOUNDS);
    const request = discoveryGate.issue();
    // A court drawer is a snapshot of the prior viewport. Remove it before
    // clearing that snapshot so its cards cannot target now-unresolvable rows.
    surfaceRegistry.close("courtDrawer");
    // A viewport has changed, so rows from the previous one must not remain
    // visible while its authoritative response is still in flight.
    store.setState({ bounds: nextBounds, sessions: [], discoveryStatus: "loading", discoveryMessage: "" });
    const playerRefresh = read().playerLayerOn ? loadPlayers(nextBounds) : null;
    publish();
    try {
      const sessions = await api.loadSessionDiscovery({ bounds: nextBounds });
      if (request.isStale()) return false;
      store.setState({ sessions: Array.isArray(sessions) ? sessions : [], discoveryStatus: "ready" });
      reconcileActiveDetail(nextBounds);
    } catch {
      if (request.isStale()) return;
      store.setState({ sessions: [], discoveryStatus: "error", discoveryMessage: "球局資料暫時無法載入。" });
      // Keeping a stale action open after authority could not be refreshed is
      // less safe than asking the user to reopen it after a successful retry.
      surfaceRegistry.close("detail");
      publish();
      return false;
    }
    publish();
    if (playerRefresh) await playerRefresh;
    return true;
  }

  /** 安靜背景重抓探索資料(60 秒輪詢與回前景時):不清列表、不進 loading、不關
   *  drawer。任何 surface 開啟時跳過——背景替換資料會把使用者正在看的快照抽走
   *  (與深連結 sheet 被收掉是同一類 rug-pull),等 surface 關閉後下一 tick 再補。
   *  失敗靜默:保留現有畫面,由下一次正常載入訂正。 */
  function discoveryPollIsActive() {
    if (read().discoveryStatus === "loading") return false;
    if (
      surfaceRegistry.get("detail") ||
      surfaceRegistry.get("courtDrawer") ||
      surfaceRegistry.get("chat") ||
      surfaceRegistry.get("createSession") ||
      surfaceRegistry.get("decisionSession") ||
      surfaceRegistry.get("editSession")
    ) {
      return false;
    }
    if (typeof api?.loadSessionDiscovery !== "function") return false;
    return true;
  }

  async function quietRefreshDiscovery() {
    const request = discoveryGate.issue();
    try {
      const sessions = await api.loadSessionDiscovery({ bounds: read().bounds });
      if (request.isStale()) return false;
      store.setState({
        sessions: Array.isArray(sessions) ? sessions : [],
        discoveryStatus: "ready",
        discoveryMessage: "",
      });
      publish();
      return true;
    } catch {
      return false;
    }
  }

  // 通道 3「courts」:球場目錄鏡射給正開著的表單 surface。這是唯一一個語意上是
  // 「狀態鏡射」而非「surface 專屬命令」的把手直呼群組,所以收斂成通道;其餘直呼
  // (setJoinPreview/setDirectory/setState/setArchived/setTerminal/
  // setInvitableSessions)都是命令或 surface 私有資料,收斂會改變派送時機,維持原樣。
  store.subscribe("courts", (current) => {
    surfaceRegistry.get("createSession")?.setCourts?.(current.courts, { ready: current.courtsReady });
    surfaceRegistry.get("decisionSession")?.setCourts?.(current.courts, { ready: current.courtsReady });
    surfaceRegistry.get("editSession")?.setCourts?.(current.courts, { ready: current.courtsReady });
    surfaceRegistry.get("profilePrompt")?.setCourts?.(current.courts, { ready: current.courtsReady });
  });

  function setCourts(courts, { ready = true } = {}) {
    store.setState({ courts: Array.isArray(courts) ? courts : [], courtsReady: Boolean(ready) });
    store.emit("courts");
    publish();
  }

  function setAuthSession(session) {
    store.setState({ authSession: session ?? null });
  }

  function setProfile(profile) {
    store.setState({ profile: profile ?? null });
  }

  function setDrawerState(value) {
    if (value !== "collapsed" && value !== "open") return;
    store.setState({ drawerState: value });
    publish();
  }

  function setFilter(key, value) {
    // filters 物件維持同一個引用(HEAD 就是就地改欄位),換掉會改變 render payload
    // 的 filters identity;改完仍走 setState 讓寫入留在 store 通道上。
    const filters = read().filters;
    if (DEFAULT_FILTER_STATE[key] instanceof Set) {
      filters[key] = value instanceof Set ? new Set(value) : new Set(value ?? []);
    } else filters[key] = value;
    store.setState({ filters });
    publish();
  }

  function resetFilters() {
    store.setState({ filters: cloneFilters() });
    publish();
  }

  function setMapUnavailable() {
    // 地圖不可用時自動展開抽屜(v2 兩態:open 即非 modal,頁面殼維持可互動)。
    store.setState({ mapUnavailable: true, drawerState: "open" });
    publish();
  }

  function pruneExpectedExplicitViewports(now = Date.now()) {
    expectedExplicitViewports = expectedExplicitViewports.filter((entry) => entry.expiresAt > now);
  }

  function rememberExplicitViewport(bounds) {
    pruneExpectedExplicitViewports();
    expectedExplicitViewports = [
      ...expectedExplicitViewports,
      {
        bounds: cloneBounds(bounds),
        expiresAt: Date.now() + EXPLICIT_VIEWPORT_IDLE_GRACE_MS,
        generation: ++explicitViewportGeneration,
      },
    ].slice(-MAX_EXPECTED_EXPLICIT_VIEWPORTS);
  }

  function isExpectedExplicitViewport(bounds) {
    pruneExpectedExplicitViewports();
    return expectedExplicitViewports.some((entry) => representsExpectedViewport(bounds, entry.bounds));
  }

  function refreshExplicitViewport(moveCamera, fallbackBounds = null) {
    clearTimeout(idleTimer);
    const movedBounds = moveCamera?.();
    const bounds = validBounds(movedBounds) ? movedBounds : fallbackBounds;
    if (!validBounds(bounds)) {
      publish();
      return;
    }
    // Discovery starts from the known requested bounds immediately. Retain a
    // short, generation-tagged expected viewport list so any late fitBounds
    // idle is recognized by its own viewport instead of blindly swallowing
    // the next map idle (which might be a real user pan).
    if (map) rememberExplicitViewport(bounds);
    return loadDiscovery(bounds);
  }

  function refreshLocationViewport(location) {
    // Before Maps is ready the runtime safely returns no bounds; the retained
    // location is then replayed by attachMap() once a camera exists.
    return refreshExplicitViewport(() => mapTools.setUserLocation?.(location, LOCATION_INITIAL_RADIUS_METERS));
  }

  function attachMap(nextMap) {
    map = nextMap;
    store.setState({ mapUnavailable: false });
    mapTools.subscribeToMapIdle?.(map, () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        const bounds = mapTools.getMapBounds?.(map);
        if (!validBounds(bounds) || isExpectedExplicitViewport(bounds)) return;
        loadDiscovery(bounds);
      }, MAP_IDLE_DEBOUNCE_MS);
    });
    // A location chosen before Maps was ready remains controller-only state.
    // Subscribe first so both synchronous fakes and Google's later idle event
    // consume the same explicit-refresh suppression.
    if (read().userLocation) refreshLocationViewport(read().userLocation);
    else publish();
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

  // 批 C4-2:已讀游標只掛在這次開聊天期間存活的 context 上,不是跨 session 的全域
  // Map——每次 openSessionChat 重開都是新 context,重新標記一次也符合 RPC 冪等語意;
  // 節流只為壓掉同一次開啟期間 visibilitychange 等高頻重跑造成的重複呼叫。
  async function markActiveChatRead(context) {
    if (typeof api?.markSessionChatRead !== "function") return;
    const latestId = latestChatMessageId(context.messages);
    if (latestId == null || context.lastMarkedMessageId === latestId) return;
    if (Number(context.session.unreadMessageCount) !== 0) {
      context.session.unreadMessageCount = 0;
      notifyMySessions();
    }
    try {
      await api.markSessionChatRead(context.session.sessionId);
      context.lastMarkedMessageId = latestId;
    } catch {
      // Best-effort:失敗不可中斷已顯示的聊天內容,也不重丟例外。故意不還原上面的
      // 樂觀清零(短暫顯示 0 屬可接受),也不設定 lastMarkedMessageId,讓下一次
      // refreshActiveChat(例如下一次 visibilitychange)重試同一個 message id 的
      // mark_session_chat_read;真正的權威數字則交由下一次 reloadParticipation 訂正。
    }
  }

  async function refreshActiveChat(context = surfaceRegistry.get("chat"), { quiet = false } = {}) {
    if (!context || !surfaceRegistry.is("chat", context) || !isCurrentAuthSnapshot(context.authSnapshot)) return false;
    if (typeof api?.loadSessionMessages !== "function" || typeof api?.loadSessionRoster !== "function") return false;
    const request = context.requestGate.issue(
      () => surfaceRegistry.is("chat", context) && isCurrentAuthSnapshot(context.authSnapshot)
    );
    // quiet=背景輪詢:不進 loading 態,避免「正在讀取群組訊息…」每 tick 閃現。
    if (!quiet) context.sheet?.setState?.({ messages: context.messages, roster: context.roster, status: "loading" });
    try {
      const [messages, roster] = await Promise.all([
        api.loadSessionMessages(context.session.sessionId),
        api.loadSessionRoster(context.session.sessionId),
      ]);
      if (request.isStale()) return false;
      context.messages = Array.isArray(messages) ? messages : [];
      context.roster = Array.isArray(roster) ? roster : [];
      context.sheet?.setState?.({ messages: context.messages, roster: context.roster, status: "ready" });
      await markActiveChatRead(context);
      return true;
    } catch {
      if (request.isStale()) return false;
      context.sheet?.setState?.({
        errorMessage: "群組訊息暫時無法載入。",
        messages: context.messages,
        roster: context.roster,
        status: "error",
      });
      return false;
    }
  }

  function openChatMessageReport(context, messageId) {
    if (!context || !surfaceRegistry.is("chat", context) || !isCurrentAuthSnapshot(context.authSnapshot)) {
      throw new Error("群組狀態已更新，請重新開啟後再試。");
    }
    const message = visibleChatMessage(context, messageId);
    if (!message) throw new Error("這則訊息已無法查看。");
    return openReportForTarget({
      messageId: message.messageId,
      reportedProfileId: message.senderProfileId,
      sessionId: context.session.sessionId,
      targetLabel: `${message.senderNickname || "這位球友"} · 群組訊息`,
    });
  }

  async function blockChatSender(context, profileId) {
    const normalizedProfileId = Number(profileId);
    if (
      !context ||
      !surfaceRegistry.is("chat", context) ||
      !isCurrentAuthSnapshot(context.authSnapshot) ||
      !context.messages.some(
        (message) =>
          Number(message.senderProfileId) === normalizedProfileId && visibleChatMessage(context, message.messageId)
      )
    ) {
      throw new Error("群組狀態已更新，請重新開啟後再試。");
    }
    if (typeof api?.setPlayerBlock !== "function") throw new Error("目前無法更新封鎖設定。");
    await api.setPlayerBlock(normalizedProfileId, true);
    if (!surfaceRegistry.is("chat", context) || !isCurrentAuthSnapshot(context.authSnapshot)) {
      throw new Error("登入狀態已變更，請重新整理後再試。");
    }
    const [blocksReady] = await Promise.all([refreshMyPlayerBlocks(context.authSnapshot), refreshActiveChat(context)]);
    if (!blocksReady) throw new Error("封鎖已生效，但清單暫時無法重新載入。");
    toast("已封鎖這位球友。");
    return true;
  }

  async function postActiveChatMessage(context, body) {
    if (!context || !surfaceRegistry.is("chat", context) || !isCurrentAuthSnapshot(context.authSnapshot)) {
      throw new Error("群組狀態已更新，請重新開啟後再試。");
    }
    if (typeof api?.postSessionMessage !== "function") throw new Error("目前無法傳送群組訊息。");
    try {
      const result = await api.postSessionMessage(context.session.sessionId, body);
      if (!surfaceRegistry.is("chat", context) || !isCurrentAuthSnapshot(context.authSnapshot)) {
        throw new Error("登入狀態已變更，請重新整理後再試。");
      }
      await refreshActiveChat(context);
      return result;
    } catch (error) {
      if (
        surfaceRegistry.is("chat", context) &&
        isCurrentAuthSnapshot(context.authSnapshot) &&
        error?.code === "SESSION_ARCHIVED"
      ) {
        context.sheet?.setArchived?.(error.message);
        await refreshMySessions();
      }
      throw error;
    }
  }

  function openSessionChat(sessionId) {
    const { authSnapshot, session } = requireMySessionAction(sessionId, chatMemberSession);
    if (typeof api?.loadSessionMessages !== "function" || typeof api?.loadSessionRoster !== "function") {
      throw new Error("目前無法開啟群組聊天。");
    }
    transitionSurfaces("openChat");
    let context = null;
    const sheet = openChat(session, {
      canWithdraw: Boolean(session.canWithdraw),
      courts: read().courts,
      onBlock: (profileId) => blockChatSender(context, profileId),
      onClose: () => surfaceRegistry.release("chat", context),
      onPost: (body) => postActiveChatMessage(context, body),
      onReport: (messageId) => openChatMessageReport(context, messageId),
      onWithdraw: () => withdrawMySession(session.sessionId),
    });
    context = {
      authSnapshot,
      lastMarkedMessageId: null,
      messages: [],
      poller: null,
      requestGate: createRequestGate(),
      roster: [],
      session,
      sheet,
    };
    surfaceRegistry.set("chat", context);
    // 安靜輪詢:MVP 無 realtime 通道,對方訊息靠週期重讀;背景分頁跳過,關閉時
    // 由 registry release 清除。unref 讓 node 測試環境不被 timer 扣住事件圈。
    context.poller = createForegroundPoller({
      intervalMs: chatPollIntervalMs,
      isActive: () => surfaceRegistry.is("chat", context),
      onInterval: () => void refreshActiveChat(context, { quiet: true }),
      onVisible: () => void refreshActiveChat(context),
      visibilityTarget,
    });
    void refreshActiveChat(context);
    return sheet;
  }

  function openCourt(court, onlySessions = null) {
    transitionSurfaces("openCourt");
    const sessions =
      onlySessions ?? visibleSessions().filter((session) => String(session.courtId) === String(court.id));
    const drawer = openCourtDrawer(court, sessions, { courts: read().courts, onOpenSession: openSessionById });
    surfaceRegistry.set("courtDrawer", drawer?.close ? drawer : null);
  }

  function invitableSessions(now = Date.now()) {
    return selectInvitableSessions(read().mySessions, now);
  }

  function openPlayer(player, { gateLevel = "ntrp", requiresLayer = true } = {}) {
    if (
      (requiresLayer && !read().playerLayerOn) ||
      !read().authSession ||
      !profileMeetsGate(read().profileEligibility, gateLevel)
    ) {
      return null;
    }
    transitionSurfaces("openPlayer");
    const openedAuth = captureAuthSnapshot();
    let card = null;
    const request = playerCardGate.capture(
      () =>
        surfaceRegistry.is("playerCard", card) &&
        (!requiresLayer || read().playerLayerOn) &&
        profileMeetsGate(read().profileEligibility, gateLevel) &&
        profileMeetsGate(read().profileEligibility, "ntrp") &&
        isCurrentAuthSnapshot(openedAuth)
    );
    card = openPlayerCard(player, {
      courts: read().courts,
      myInvitableSessions: invitableSessions(),
      onClose: () => {
        surfaceRegistry.release("playerCard", card);
      },
      // 批 D8 映射決策 6:「看球友名單」重用既有 openPlayerDirectory 入口(與地圖
      // #player-directory-open 同一顆),不是新的 controller surface。它內部的
      // loadPlayerDirectoryList() 一開頭就會關閉 playerCard,所以這張卡
      // 會被自動關掉、名單接著開啟,不需要在這裡重複 card?.close()。未通過 directory
      // gate 時 openPlayerDirectory() 會走 requireSessionAction 導去補檔案,不是 no-op。
      onSeeDirectory: () => openPlayerDirectory(),
      onCreate: () => {
        if (surfaceRegistry.is("playerCard", card)) transitionSurfaces("openCreate");
        openCreateIntent();
      },
      onInvite: async (sessionId) => {
        const target = invitableSessions().find((session) => String(session.sessionId) === String(sessionId));
        if (request.isStale()) {
          throw new Error("登入狀態已變更，請重新開啟球友卡。");
        }
        if (!target) throw new Error("這個球局目前無法邀請球友。");
        const result = await api.inviteToSession(target.sessionId, player.profileId);
        if (request.isStale()) {
          throw new Error("登入狀態已變更，請重新開啟球友卡。");
        }
        if (result?.reloadRequired || result?.outcome === "SESSION_EXPIRED") {
          const refreshed = await reloadParticipation(openedAuth.epoch, openedAuth.identity);
          if (request.isStale()) {
            throw new Error("登入狀態已變更，請重新開啟球友卡。");
          }
          card?.setInvitableSessions?.(invitableSessions());
          if (!refreshed) throw new Error("球局狀態暫時無法重新載入，請稍後再試。");
          throw new Error("球局狀態已更新，請重新選擇可邀請的球局。");
        }
        return result;
      },
    });
    surfaceRegistry.set("playerCard", card?.close ? card : null, { gate: card?.close ? gateLevel : null });
    return card;
  }

  function openPlayerCourt(court, onlyPlayers = null) {
    if (!read().playerLayerOn || !read().authSession || !profileMeetsGate(read().profileEligibility, "ntrp"))
      return null;
    const players = onlyPlayers ?? read().players.filter((player) => String(player.courtId) === String(court.id));
    transitionSurfaces("openPlayerCourt", { restoreFocus: false });
    let drawer = null;
    drawer = openCourtPlayersDrawer(court, players, {
      onClose: () => {
        surfaceRegistry.release("playerDrawer", drawer);
      },
      onOpenPlayer: (player) => openPlayer(player, { gateLevel: "ntrp", requiresLayer: true }),
    });
    surfaceRegistry.set("playerDrawer", drawer?.close ? drawer : null);
    return drawer;
  }

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
      const message = error?.message || "申請失敗，請稍後再試。";
      // A stale discovery response can legitimately close the underlying
      // detail before its inline error is rendered. Announce that result
      // instead of silently discarding it.
      if (!surfaceRegistry.is("detail", detail)) toast(message);
      return { joinError: message };
    } finally {
      finishLifecycleAction(mutation);
    }
  }

  function withdraw(session, detail) {
    return openWithdrawConfirmation({ onConfirm: () => performDetailWithdrawal(session, detail) });
  }

  async function performDetailWithdrawal(session, detail) {
    const authSnapshot = captureAuthSnapshot();
    if (!isCurrentAuthSnapshot(authSnapshot)) return;
    const mutation = beginLifecycleAction("withdraw", session.sessionId, authSnapshot);
    if (!mutation) {
      toast("這個球局的操作正在處理中。");
      return;
    }
    try {
      const result = await api.withdrawFromSession(session.sessionId);
      if (!isCurrentAuthSnapshot(authSnapshot)) return;
      if (!(await refreshAuthoritativeState(authSnapshot))) {
        if (surfaceRegistry.is("detail", detail)) toast("球局狀態暫時無法重新載入，請重新整理後再試。");
        return;
      }
      if (result?.reloadRequired || result?.outcome === "SESSION_EXPIRED") {
        surfaceRegistry.close("detail", undefined, detail);
        toast("球局狀態已更新，請重新載入。");
        return;
      }
      surfaceRegistry.close("detail", undefined, detail);
      toast("已撤回申請。");
    } catch (error) {
      if (!isCurrentAuthSnapshot(authSnapshot)) return;
      await refreshAuthoritativeState(authSnapshot);
      toast(error?.message || "撤回失敗，請稍後再試。");
    } finally {
      finishLifecycleAction(mutation);
    }
  }

  function mySessionForAction(sessionId) {
    const session = read().mySessions.find((entry) => String(entry.sessionId) === String(sessionId));
    if (!session) throw new Error("這個球局已更新，請重新整理後再試。");
    return session;
  }

  function requireMySessionAction(sessionId, predicate) {
    const authSnapshot = captureAuthSnapshot();
    if (!isCurrentAuthSnapshot(authSnapshot) || !profileIsReady(read().profileEligibility)) {
      throw new Error("登入或個人檔案狀態已變更，請重新整理後再試。");
    }
    const session = mySessionForAction(sessionId);
    if (!predicate(session)) throw new Error("這個球局的狀態已更新，請重新整理後再試。");
    return { authSnapshot, session };
  }

  async function runMySessionMutation(kind, session, authSnapshot, execute, successMessage) {
    const mutation = beginLifecycleAction(kind, session.sessionId, authSnapshot);
    if (!mutation) throw new Error("這個球局的操作正在處理中。");
    let refreshed = false;
    try {
      const result = await execute();
      if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新整理後再試。");
      refreshed = await refreshAuthoritativeState(authSnapshot);
      if (!refreshed) throw new Error("球局狀態暫時無法重新載入，請重新整理後再試。");
      if (result?.reloadRequired || result?.outcome === "SESSION_EXPIRED") {
        throw new Error("球局狀態已更新，請重新載入。");
      }
      toast(successMessage);
      return result;
    } catch (error) {
      // Re-read authority even after a server-side rejection so a full,
      // cancelled, expired, or already-decided race never leaves stale actions.
      if (isCurrentAuthSnapshot(authSnapshot) && !refreshed) {
        await refreshAuthoritativeState(authSnapshot);
      }
      throw error;
    } finally {
      finishLifecycleAction(mutation);
    }
  }

  async function reviewMySessionParticipant(sessionId, participantId, decision) {
    const { authSnapshot, session } = requireMySessionAction(
      sessionId,
      (candidate) => String(candidate.viewerRole) === "host" && Boolean(candidate.canCancel)
    );
    const participant = (read().mySessionRosters.get(sessionKey(sessionId)) ?? []).find(
      (candidate) =>
        String(candidate.participantId) === String(participantId) &&
        candidate.role === "guest" &&
        candidate.status === "requested"
    );
    if (!participant || !["accepted", "declined"].includes(decision)) {
      throw new Error("這筆申請已更新，請重新整理後再試。");
    }
    const apiAction = decision === "accepted" ? api?.acceptSessionParticipant : api?.declineSessionParticipant;
    if (typeof apiAction !== "function") throw new Error("目前無法處理這筆申請。");
    return runMySessionMutation(
      decision === "accepted" ? "accept" : "decline",
      session,
      authSnapshot,
      () => apiAction(session.sessionId, participant.participantId),
      decision === "accepted" ? "已接受申請。" : "已婉拒申請。"
    );
  }

  async function respondInvite(sessionId, decision) {
    const { authSnapshot, session } = requireMySessionAction(
      sessionId,
      (candidate) =>
        String(candidate.viewerRole) === "guest" &&
        String(candidate.viewerParticipantStatus) === "invited" &&
        Boolean(candidate.canRespondInvite)
    );
    if (!["accepted", "declined"].includes(decision)) {
      throw new Error("這筆邀請已更新，請重新整理後再試。");
    }
    if (typeof api?.respondToSessionInvite !== "function") throw new Error("目前無法回覆這筆邀請。");
    return runMySessionMutation(
      decision === "accepted" ? "accept-invite" : "decline-invite",
      session,
      authSnapshot,
      () => api.respondToSessionInvite(session.sessionId, decision),
      decision === "accepted" ? "已接受邀請。" : "已婉拒邀請。"
    );
  }

  async function cancelMySession(sessionId) {
    const { authSnapshot, session } = requireMySessionAction(sessionId, (candidate) => Boolean(candidate.canCancel));
    if (typeof api?.cancelSession !== "function") throw new Error("目前無法取消這個球局。");
    return runMySessionMutation(
      "cancel",
      session,
      authSnapshot,
      () => api.cancelSession(session.sessionId),
      "已取消球局。"
    );
  }

  function withdrawMySession(sessionId) {
    return openWithdrawConfirmation({ onConfirm: () => performMySessionWithdrawal(sessionId) });
  }

  async function performMySessionWithdrawal(sessionId) {
    const { authSnapshot, session } = requireMySessionAction(sessionId, (candidate) => Boolean(candidate.canWithdraw));
    if (typeof api?.withdrawFromSession !== "function") throw new Error("目前無法退出這個球局。");
    return runMySessionMutation(
      "withdraw",
      session,
      authSnapshot,
      () => api.withdrawFromSession(session.sessionId),
      "已退出球局。"
    );
  }

  async function markMySessionPlayed(sessionId) {
    const { authSnapshot, session } = requireMySessionAction(sessionId, (candidate) =>
      Boolean(candidate.canConfirmPlayed)
    );
    if (typeof api?.markSessionPlayed !== "function") throw new Error("目前無法回報這個球局。");
    return runMySessionMutation(
      "played",
      session,
      authSnapshot,
      () => api.markSessionPlayed(session.sessionId),
      "已回報打成。"
    );
  }

  async function confirmMySessionAttendance(sessionId) {
    const { authSnapshot, session } = requireMySessionAction(
      sessionId,
      (candidate) => Boolean(candidate.canConfirmAttendance) && !candidate.viewerPlayedConfirmed
    );
    if (typeof api?.confirmSessionAttendance !== "function") throw new Error("目前無法確認到場。");
    return runMySessionMutation(
      "attendance",
      session,
      authSnapshot,
      () => api.confirmSessionAttendance(session.sessionId),
      "已確認到場。"
    );
  }

  async function openSessionDecision(sessionId) {
    const { authSnapshot, session } = requireMySessionAction(sessionId, hostCanDecideSession);
    if (typeof api?.loadSessionSummary !== "function" || typeof api?.decideSessionCourt !== "function") {
      throw new Error("目前無法定案這個候選球局。");
    }
    // eslint-disable-next-line no-useless-assignment -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
    let summary = null;
    try {
      summary = await api.loadSessionSummary(session.sessionId);
    } catch {
      throw new Error("候選球局暫時無法載入，請稍後再試。");
    }
    if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新整理後再試。");
    transitionSurfaces("openDecision");
    let sheet = null;
    const decisionSummary = isUndecidedCandidate(summary) ? summary : null;
    sheet = openDecideSession(decisionSummary, {
      courts: read().courts,
      courtsReady: read().courtsReady,
      onClose: () => {
        surfaceRegistry.release("decisionSession", sheet);
      },
      onDecide: async (courtId, startAt) => {
        if (!decisionSummary) return { outcome: "SESSION_EXPIRED", reloadRequired: true };
        if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新整理後再試。");
        const mutation = beginLifecycleAction("decide", session.sessionId, authSnapshot);
        if (!mutation) throw new Error("這個球局的操作正在處理中。");
        let refreshed = false;
        try {
          const result = await api.decideSessionCourt(session.sessionId, courtId, startAt);
          if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新整理後再試。");
          refreshed = await refreshAuthoritativeState(authSnapshot);
          if (result?.reloadRequired || result?.outcome === "SESSION_EXPIRED") {
            sheet?.setTerminal?.("候選球局已逾期或下架，無法再定案。");
            return result;
          }
          if (!refreshed) throw new Error("球局狀態暫時無法重新載入，請重新整理後再試。");
          surfaceRegistry.close("decisionSession", { reason: "complete" });
          toast("候選球局已定案。");
          return result;
        } catch (error) {
          if (isCurrentAuthSnapshot(authSnapshot) && !refreshed) await refreshAuthoritativeState(authSnapshot);
          throw error;
        } finally {
          finishLifecycleAction(mutation);
        }
      },
    });
    return surfaceRegistry.set("decisionSession", sheet?.close ? sheet : null);
  }

  function openSessionEdit(sessionId) {
    const { authSnapshot, session } = requireMySessionAction(sessionId, hostCanEditSession);
    if (typeof api?.updateSession !== "function") throw new Error("目前無法編輯這個球局。");
    transitionSurfaces("openEdit");
    let sheet = null;
    sheet = openEditSession(session, {
      courts: read().courts,
      courtsReady: read().courtsReady,
      onClose: () => {
        surfaceRegistry.release("editSession", sheet);
      },
      onSubmit: async (input) => {
        const result = await runMySessionMutation(
          "update",
          session,
          authSnapshot,
          () => api.updateSession({ sessionId: session.sessionId, ...input }),
          "已更新球局資訊。"
        );
        surfaceRegistry.close("editSession", { reason: "complete" });
        return result;
      },
    });
    return surfaceRegistry.set("editSession", sheet?.close ? sheet : null);
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
      if (error?.name === "DataApiUnavailableError") {
        // eslint-disable-next-line preserve-caught-error -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
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

  function retryDiscovery() {
    return loadDiscovery(read().bounds);
  }

  function expandBounds() {
    return refreshExplicitViewport(() => mapTools.fitTaipei?.(), TAIPEI_CITY_BOUNDS);
  }

  // 探索資料的 best-effort 更新(2026-08-17 拍板):前景輪詢+回前景即刷。controller
  // 與 app 同壽命,不需 teardown;unref 讓 node 測試不被 timer 扣住事件圈。
  createForegroundPoller({
    intervalMs: discoveryPollIntervalMs,
    isActive: discoveryPollIsActive,
    onInterval: () => void quietRefreshDiscovery(),
    onVisible: () => void quietRefreshDiscovery(),
    visibilityTarget,
  });

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
    getMySessionState: () => ({
      authenticated: Boolean(read().authSession),
      blockedPlayers: [...read().blockedPlayers],
      blockedPlayersError: read().blockedPlayersError,
      blockedPlayersStatus: read().blockedPlayersStatus,
      error: read().mySessionsError,
      groups: mySessionGroups(),
      isPublic: profileIsPublic(read().profileEligibility),
      status: read().mySessionsStatus,
      viewGeneration: read().authEpoch,
    }),
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
    togglePlayerVisibility,
    togglePlayerLayer,
    unblockPlayer,
    withdrawMySession,
  };
}
