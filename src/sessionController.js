import { LOCATION_INITIAL_RADIUS_METERS, MAP_IDLE_DEBOUNCE_MS, TAIPEI_CITY_BOUNDS } from "./config.js";
import { DEFAULT_FILTER_STATE, filterSessions, sortSessionsForDrawer } from "./filters.js";
import { clearPendingIntent, readPendingIntent, savePendingIntent } from "./sessionIntent.js";

function cloneFilters() {
  return { ...DEFAULT_FILTER_STATE, types: new Set(DEFAULT_FILTER_STATE.types) };
}

function cloneBounds(bounds) {
  const candidate = bounds ?? TAIPEI_CITY_BOUNDS;
  return {
    south: Number(candidate.south),
    west: Number(candidate.west),
    north: Number(candidate.north),
    east: Number(candidate.east),
  };
}

function validBounds(bounds) {
  const values = [bounds?.south, bounds?.west, bounds?.north, bounds?.east].map(Number);
  return values.every(Number.isFinite) && values[0] <= values[2] && values[1] <= values[3];
}

function viewportCenter(bounds) {
  if (!validBounds(bounds)) return null;
  return {
    lat: (Number(bounds.south) + Number(bounds.north)) / 2,
    lng: (Number(bounds.west) + Number(bounds.east)) / 2,
  };
}

function viewportSpan(bounds) {
  if (!validBounds(bounds)) return null;
  return {
    lat: Number(bounds.north) - Number(bounds.south),
    lng: Number(bounds.east) - Number(bounds.west),
  };
}

/**
 * Google can report the post-fit viewport with padding, so expected idles
 * cannot use exact coordinate equality. Keep the center tight enough that a
 * real pan still wins, while accepting modest viewport expansion from fitBounds.
 */
function representsExpectedViewport(actual, expected) {
  const actualCenter = viewportCenter(actual);
  const expectedCenter = viewportCenter(expected);
  const actualSpan = viewportSpan(actual);
  const expectedSpan = viewportSpan(expected);
  if (!actualCenter || !expectedCenter || !actualSpan || !expectedSpan) return false;
  if (expectedSpan.lat <= 0 || expectedSpan.lng <= 0 || actualSpan.lat <= 0 || actualSpan.lng <= 0) return false;

  const latCenterTolerance = Math.max(0.001, Math.max(actualSpan.lat, expectedSpan.lat) * 0.05);
  const lngCenterTolerance = Math.max(0.001, Math.max(actualSpan.lng, expectedSpan.lng) * 0.05);
  const latScale = actualSpan.lat / expectedSpan.lat;
  const lngScale = actualSpan.lng / expectedSpan.lng;
  return (
    Math.abs(actualCenter.lat - expectedCenter.lat) <= latCenterTolerance &&
    Math.abs(actualCenter.lng - expectedCenter.lng) <= lngCenterTolerance &&
    latScale >= 0.5 &&
    latScale <= 2 &&
    lngScale >= 0.5 &&
    lngScale <= 2
  );
}

function boundsContainSession(bounds, session) {
  if (!validBounds(bounds)) return false;
  const lat = Number(session?.courtLat);
  const lng = Number(session?.courtLng);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= Number(bounds.south) &&
    lat <= Number(bounds.north) &&
    lng >= Number(bounds.west) &&
    lng <= Number(bounds.east)
  );
}

function sessionIdentity(session) {
  const value = session?.user?.id ?? session?.access_token ?? null;
  return value == null ? null : String(value);
}

function profileIsComplete(eligibility) {
  // Main reduces private profile data to this one boolean before it enters the
  // controller. It is never rendered or sent with a public action payload.
  return eligibility?.complete === true;
}

function profileIsPublic(eligibility) {
  return eligibility?.isPublic === true;
}

function profileReadiness(eligibility) {
  if (eligibility?.status === "loading") return "loading";
  if (eligibility?.status === "error") return "error";
  return "ready";
}

function profileUnavailableMessage(readiness) {
  return readiness === "loading"
    ? "正在讀取個人檔案，請稍候。"
    : "個人檔案暫時無法載入，請重新整理後再試。";
}

function terminalAction(session) {
  const status = String(session.status || "").toLowerCase();
  if (status === "cancelled") return "球局已取消";
  if (status === "expired") return "球局已結束";
  if (status === "started") return "球局已開始";
  return null;
}

const MY_SESSION_FINAL_STATUSES = new Set(["cancelled", "expired", "played"]);
const MY_SESSION_OPEN_STATUSES = new Set(["open", "full"]);
const KIND_ORDER = { "host-request": 0, invite: 1, "guest-request": 2 };
const DAY_MS = 24 * 60 * 60 * 1000;

function timeValue(value, fallback = 0) {
  const time = new Date(value ?? "").getTime();
  return Number.isFinite(time) ? time : fallback;
}

function compareSessionStart(left, right) {
  return timeValue(left?.startAt, Number.POSITIVE_INFINITY) - timeValue(right?.startAt, Number.POSITIVE_INFINITY) ||
    Number(left?.sessionId) - Number(right?.sessionId);
}

function compareHistorySession(left, right) {
  return (
    timeValue(right?.updatedAt, timeValue(right?.startAt)) - timeValue(left?.updatedAt, timeValue(left?.startAt)) ||
    timeValue(right?.startAt) - timeValue(left?.startAt) ||
    Number(right?.sessionId) - Number(left?.sessionId)
  );
}

/**
 * Arrange private My Sessions rows around the next safe action. Host request
 * rows are supplied by an already-authorized roster hydrate; public discovery
 * is never used to infer them.
 */
export function groupMySessions(items = [], now = new Date()) {
  const currentTime = timeValue(now, Date.now());
  const needsAction = [];
  const upcoming = [];
  const history = [];

  for (const session of Array.isArray(items) ? items : []) {
    const status = String(session?.status ?? "").toLowerCase();
    const viewerRole = String(session?.viewerRole ?? "").toLowerCase();
    const participantStatus = String(session?.viewerParticipantStatus ?? "").toLowerCase();
    const startedMoreThanADayAgo =
      MY_SESSION_OPEN_STATUSES.has(status) && timeValue(session?.startAt, Number.NEGATIVE_INFINITY) <= currentTime - DAY_MS;

    if (
      MY_SESSION_FINAL_STATUSES.has(status) ||
      startedMoreThanADayAgo ||
      (viewerRole === "guest" && (participantStatus === "declined" || participantStatus === "withdrawn"))
    ) {
      history.push(session);
      continue;
    }

    if (viewerRole === "guest" && participantStatus === "invited") {
      if (session?.canRespondInvite) needsAction.push({ kind: "invite", session });
      else history.push(session);
      continue;
    }

    if (viewerRole === "guest" && participantStatus === "requested") {
      if (session?.canWithdraw) needsAction.push({ kind: "guest-request", session });
      else history.push(session);
      continue;
    }

    if (!MY_SESSION_OPEN_STATUSES.has(status) || participantStatus !== "accepted") {
      history.push(session);
      continue;
    }

    upcoming.push(session);
    if (viewerRole !== "host" || !session?.canCancel) continue;
    const requests = (Array.isArray(session?.pendingRequests) ? session.pendingRequests : [])
      .filter((participant) => participant?.role === "guest" && participant?.status === "requested")
      .sort((left, right) => Number(left?.participantId) - Number(right?.participantId));
    for (const participant of requests) needsAction.push({ kind: "host-request", participant, session });
  }

  needsAction.sort((left, right) => {
    const kindOrder = (KIND_ORDER[left.kind] ?? 9) - (KIND_ORDER[right.kind] ?? 9);
    return (
      kindOrder ||
      compareSessionStart(left.session, right.session) ||
      Number(left.participant?.participantId ?? 0) - Number(right.participant?.participantId ?? 0)
    );
  });
  upcoming.sort(compareSessionStart);
  history.sort(compareHistorySession);
  return {
    history,
    needsAction,
    pendingHostRequestCount: needsAction.filter((entry) => entry.kind === "host-request").length,
    upcoming,
  };
}

function samePendingIntent(left, right) {
  if (!left || !right || left.action !== right.action) return false;
  return left.action !== "join" || String(left.sessionId) === String(right.sessionId);
}

function staleIntentMessage(session) {
  if (!session) return "球局已取消、結束或不再開放，已回到附近球局。";
  const status = String(session.status || "").toLowerCase();
  if (status === "full" || Number(session.slotsRemaining) <= 0) return "球局已額滿，已回到附近球局。";
  if (status === "cancelled") return "球局已取消，已回到附近球局。";
  if (status === "expired") return "球局已結束，已回到附近球局。";
  if (status === "started") return "球局已開始，已回到附近球局。";
  return null;
}

function browserIntentStore() {
  return {
    clear: () => clearPendingIntent(),
    read: () => readPendingIntent(),
    save: (intent) => savePendingIntent(intent),
  };
}

const SESSION_DETAIL_FIELDS = [
  "sessionId",
  "sportCode",
  "courtId",
  "court",
  "courtDistrict",
  "courtLat",
  "courtLng",
  "startAt",
  "playType",
  "ntrpMin",
  "ntrpMax",
  "slotsTotal",
  "slotsRemaining",
  "notes",
  "status",
  "hostNickname",
  "hostNtrp",
  "hostProfileComplete",
];

const EXPLICIT_VIEWPORT_IDLE_GRACE_MS = MAP_IDLE_DEBOUNCE_MS * 8;
const MAX_EXPECTED_EXPLICIT_VIEWPORTS = 6;

function sameSessionDetail(left, right) {
  return SESSION_DETAIL_FIELDS.every((key) => left?.[key] === right?.[key]);
}

function actionKey(action) {
  return JSON.stringify([action?.label ?? "", Boolean(action?.disabled), action?.secondaryLabel ?? ""]);
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
  openJoinConfirmation = () => {},
  openCourtDrawer = () => {},
  openCourtPlayersDrawer = () => {},
  openPlayerCard = () => {},
  openCreateSession = () => {},
  openLogin = () => {},
  openReport = () => {},
  promptProfile = () => {},
  reloadCurrentProfile = async () => {},
  onMySessionsChange = () => {},
  showCreatedSession = () => {},
  intentStore = browserIntentStore(),
  toast = () => {},
} = {}) {
  const state = {
    bounds: cloneBounds(TAIPEI_CITY_BOUNDS),
    courts: [],
    courtsReady: false,
    sessions: [],
    filters: cloneFilters(),
    userLocation: null,
    locationBlocked: false,
    locationMessage: "",
    drawerExpanded: false,
    mapUnavailable: false,
    discoveryStatus: "idle",
    discoveryMessage: "",
    authSession: null,
    profile: null,
    mySessions: [],
    mySessionsError: "",
    mySessionContactsError: "",
    mySessionsStatus: "idle",
    mySessionContacts: new Map(),
    mySessionRosters: new Map(),
    playerLayerOn: false,
    playerLayerMessage: "",
    playerLayerStatus: "idle",
    players: [],
  };
  let map = null;
  let idleTimer = null;
  let latestRequest = 0;
  let latestParticipationRequest = 0;
  let latestRosterRequest = 0;
  let latestContactRequest = 0;
  let latestLocationRequest = 0;
  let latestPlayerRequest = 0;
  let authEpoch = 0;
  let mySessionsVersion = 0;
  let explicitViewportGeneration = 0;
  let expectedExplicitViewports = [];
  let activeDetail = null;
  let activeDetailSession = null;
  let activeDetailActionKey = null;
  let activeCourtDrawer = null;
  let activeJoinConfirmation = null;
  let activeJoinConfirmationSessionId = null;
  let activeCreateSession = null;
  let activeProfilePrompt = null;
  let activeReportDialog = null;
  let activePlayerDrawer = null;
  let activePlayerCard = null;
  let lifecycleMutationGeneration = 0;
  let intentVersion = 0;
  const resumeInFlight = new Map();
  const inFlightLifecycleActions = new Map();

  function visibleSessions() {
    return sortSessionsForDrawer(filterSessions(state.sessions, state.filters), state.userLocation);
  }

  function playerGroups() {
    const groups = new Map();
    for (const player of state.players) {
      const key = String(player?.courtId ?? "");
      if (!key) continue;
      const group = groups.get(key) ?? {
        court: {
          id: player.courtId,
          name: player.courtName,
          district: player.courtDistrict,
          lat: Number(player.courtLat),
          lng: Number(player.courtLng),
        },
        players: [],
      };
      group.players.push(player);
      groups.set(key, group);
    }
    return [...groups.values()];
  }

  function mapStatus() {
    if (state.mapUnavailable) return { kind: "warning", message: "地圖目前無法使用；你仍可瀏覽附近球局。" };
    if (state.discoveryStatus === "loading") return { kind: "loading", message: "正在載入球局資料…" };
    if (state.discoveryStatus === "error") return { kind: "error", message: "球局資料暫時無法載入。" };
    return { kind: "idle", message: "" };
  }

  function publish() {
    const sessions = visibleSessions();
    render({
      sessions,
      expanded: state.drawerExpanded,
      hasUserLocation: Boolean(state.userLocation),
      filters: state.filters,
      courts: state.courts,
      mapStatus: mapStatus(),
      locationMessage: state.locationMessage,
    });
    renderPins(sessions);
    renderPlayers({
      groups: state.playerLayerOn ? playerGroups() : [],
      message: state.playerLayerMessage,
      on: state.playerLayerOn,
      status: state.playerLayerStatus,
    });
  }

  function currentParticipation(sessionId) {
    if (!state.authSession) return null;
    return state.mySessions.find((entry) => String(entry.sessionId) === String(sessionId)) ?? null;
  }

  function sessionKey(sessionId) {
    return String(sessionId);
  }

  function mySessionItems() {
    return state.mySessions.map((session) => ({
      ...session,
      pendingRequests: [...(state.mySessionRosters.get(sessionKey(session.sessionId)) ?? [])],
    }));
  }

  function mySessionGroups() {
    return groupMySessions(mySessionItems());
  }

  function notifyMySessions() {
    onMySessionsChange({
      authenticated: Boolean(state.authSession),
      contactsError: state.mySessionContactsError,
      error: state.mySessionsError,
      groups: mySessionGroups(),
      isPublic: profileIsPublic(state.profile),
      status: state.mySessionsStatus,
      viewGeneration: authEpoch,
    });
  }

  function replaceMySessions(sessions) {
    state.mySessions = Array.isArray(sessions) ? sessions : [];
    state.mySessionContacts = new Map();
    state.mySessionContactsError = "";
    state.mySessionRosters = new Map();
    mySessionsVersion += 1;
  }

  function isCurrentMySessionsSnapshot(snapshot) {
    return isCurrentAuthSnapshot(snapshot) && snapshot?.mySessionsVersion === mySessionsVersion;
  }

  function hostSessionsNeedingRoster() {
    return state.mySessions.filter(
      (session) =>
        String(session?.viewerRole) === "host" &&
        Boolean(session?.canCancel) &&
        MY_SESSION_OPEN_STATUSES.has(String(session?.status ?? "").toLowerCase())
    );
  }

  function sessionsEligibleForContacts() {
    return state.mySessions.filter(
      (session) =>
        String(session?.viewerParticipantStatus) === "accepted" &&
        ["open", "full", "played"].includes(String(session?.status ?? "").toLowerCase())
    );
  }

  async function hydrateMySessionRosters(authSnapshot = captureAuthSnapshot()) {
    if (!isCurrentAuthSnapshot(authSnapshot)) return false;
    if (typeof api?.loadSessionRoster !== "function") return true;
    const requestId = ++latestRosterRequest;
    const snapshot = { ...authSnapshot, mySessionsVersion };
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
    if (requestId !== latestRosterRequest || !isCurrentMySessionsSnapshot(snapshot)) return false;
    const rosters = new Map();
    let failed = false;
    for (const result of results) {
      if (result.roster) rosters.set(sessionKey(result.sessionId), result.roster);
      else failed = true;
    }
    state.mySessionRosters = rosters;
    if (failed) {
      state.mySessionsError = "待審核申請暫時無法載入，請重新整理後再試。";
      state.mySessionsStatus = "error";
    }
    notifyMySessions();
    return !failed;
  }

  async function hydrateMySessionContacts(authSnapshot = captureAuthSnapshot()) {
    if (!isCurrentAuthSnapshot(authSnapshot)) return false;
    if (typeof api?.loadSessionContacts !== "function") return true;
    const requestId = ++latestContactRequest;
    const snapshot = { ...authSnapshot, mySessionsVersion };
    const targets = sessionsEligibleForContacts();
    const results = await Promise.all(
      targets.map(async (session) => {
        try {
          const contacts = await api.loadSessionContacts(session.sessionId);
          return { contacts: Array.isArray(contacts) ? contacts : [], sessionId: session.sessionId };
        } catch {
          return { contacts: null, sessionId: session.sessionId };
        }
      })
    );
    if (requestId !== latestContactRequest || !isCurrentMySessionsSnapshot(snapshot)) return false;
    const contacts = new Map();
    let failed = false;
    for (const result of results) {
      if (result.contacts) contacts.set(sessionKey(result.sessionId), result.contacts);
      else failed = true;
    }
    state.mySessionContacts = contacts;
    if (failed) {
      // Contact retrieval is deliberately secondary to the authoritative
      // lifecycle list. It must not hide a known host action badge or make a
      // successful accept/withdraw look like a failed mutation.
      state.mySessionContactsError = "聯絡方式暫時無法載入，請重新整理後再試。";
    } else {
      state.mySessionContactsError = "";
    }
    notifyMySessions();
    return !failed;
  }

  async function refreshMySessions({ includeContacts = true } = {}) {
    const authSnapshot = captureAuthSnapshot();
    if (!isCurrentAuthSnapshot(authSnapshot)) return false;
    return reloadParticipation(authSnapshot.epoch, authSnapshot.identity, { includeContacts });
  }

  async function refreshMySessionDetails({ includeContacts = false } = {}) {
    return refreshMySessions({ includeContacts });
  }

  function actionFor(session) {
    const terminal = terminalAction(session);
    if (terminal) return { label: terminal, disabled: true };
    const participation = currentParticipation(session.sessionId);
    if (participation?.viewerParticipantStatus === "accepted") return { label: "查看聯絡方式" };
    if (participation?.viewerParticipantStatus === "requested") {
      return { label: "申請等待中", disabled: true, secondaryLabel: "撤回申請" };
    }
    if (String(session.status).toLowerCase() === "full" || Number(session.slotsRemaining) <= 0) {
      return { label: "已額滿", disabled: true };
    }
    if (String(session.joinMode) === "instant") return { label: "直接加入" };
    return { label: "申請加入" };
  }

  function captureAuthSnapshot() {
    return { epoch: authEpoch, identity: sessionIdentity(state.authSession) };
  }

  function isCurrentAuthSnapshot(snapshot) {
    return (
      Boolean(snapshot?.identity) &&
      snapshot.epoch === authEpoch &&
      sessionIdentity(state.authSession) === snapshot.identity
    );
  }

  function lifecycleActionKey(sessionId, identity = sessionIdentity(state.authSession)) {
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

  async function reloadParticipation(epoch = authEpoch, identity = sessionIdentity(state.authSession), { includeContacts = false } = {}) {
    if (!state.authSession || !identity || typeof api?.loadMySessions !== "function") return false;
    const requestId = ++latestParticipationRequest;
    state.mySessionsStatus = "loading";
    notifyMySessions();
    try {
      const sessions = await api.loadMySessions();
      if (
        requestId !== latestParticipationRequest ||
        epoch !== authEpoch ||
        !state.authSession ||
        sessionIdentity(state.authSession) !== identity
      ) {
        return false;
      }
      replaceMySessions(sessions);
      state.mySessionsError = "";
      // Publish the cleared private caches before awaiting secondary reads so
      // an old roster or LINE row never survives in the rendered destination.
      notifyMySessions();
      const rosterReady = await hydrateMySessionRosters({ epoch, identity });
      if (!rosterReady || !isCurrentAuthSnapshot({ epoch, identity })) return false;
      if (includeContacts) await hydrateMySessionContacts({ epoch, identity });
      if (!isCurrentAuthSnapshot({ epoch, identity })) return false;
      state.mySessionsStatus = "ready";
      reconcileActiveDetailParticipation();
      notifyMySessions();
      // Contacts are non-authoritative enrichment. A failed contact request
      // leaves a localized retry message, but the current lifecycle snapshot
      // remains fresh and can safely complete an action.
      return true;
    } catch {
      if (
        requestId !== latestParticipationRequest ||
        epoch !== authEpoch ||
        !state.authSession ||
        sessionIdentity(state.authSession) !== identity
      ) {
        return false;
      }
      // A retryable read failure must not turn a known private list into an
      // empty state. Keep the last authoritative rows and surface an error to
      // the My Sessions page instead.
      state.mySessionsError = "我的球局暫時無法載入。";
      state.mySessionsStatus = "error";
      notifyMySessions();
      return false;
    }
  }

  function closeActivePlayerDrawer(options = {}) {
    const drawer = activePlayerDrawer;
    activePlayerDrawer = null;
    drawer?.close?.(options);
  }

  function closeActivePlayerCard(options = {}) {
    const card = activePlayerCard;
    activePlayerCard = null;
    card?.close?.(options);
  }

  function clearPlayerLayer({ turnOff = true, closeReason = "player-layer-clear" } = {}) {
    latestPlayerRequest += 1;
    const options = { reason: closeReason, restoreFocus: false };
    closeActivePlayerDrawer(options);
    closeActivePlayerCard(options);
    if (turnOff) state.playerLayerOn = false;
    state.players = [];
    state.playerLayerStatus = "idle";
    state.playerLayerMessage = "";
  }

  async function loadPlayers(bounds = state.bounds) {
    if (!state.playerLayerOn || !state.authSession || !profileIsComplete(state.profile)) return false;
    const nextBounds = validBounds(bounds) ? cloneBounds(bounds) : cloneBounds(TAIPEI_CITY_BOUNDS);
    const requestId = ++latestPlayerRequest;
    const authSnapshot = captureAuthSnapshot();
    closeActivePlayerDrawer({ reason: "player-refresh", restoreFocus: false });
    closeActivePlayerCard({ reason: "player-refresh", restoreFocus: false });
    state.players = [];
    state.playerLayerStatus = "loading";
    state.playerLayerMessage = "正在載入球友…";
    publish();
    try {
      const players = await api.loadPlayerDirectory({ bounds: nextBounds });
      if (
        requestId !== latestPlayerRequest ||
        !state.playerLayerOn ||
        !profileIsComplete(state.profile) ||
        !isCurrentAuthSnapshot(authSnapshot)
      ) {
        return false;
      }
      state.players = Array.isArray(players) ? players : [];
      state.playerLayerStatus = "ready";
      state.playerLayerMessage = "";
      publish();
      return true;
    } catch {
      if (
        requestId !== latestPlayerRequest ||
        !state.playerLayerOn ||
        !profileIsComplete(state.profile) ||
        !isCurrentAuthSnapshot(authSnapshot)
      ) {
        return false;
      }
      state.players = [];
      state.playerLayerStatus = "error";
      state.playerLayerMessage = "球友資料暫時無法載入。";
      publish();
      return false;
    }
  }

  async function loadDiscovery(bounds = state.bounds) {
    const nextBounds = validBounds(bounds) ? cloneBounds(bounds) : cloneBounds(TAIPEI_CITY_BOUNDS);
    const requestId = ++latestRequest;
    // A court drawer is a snapshot of the prior viewport. Remove it before
    // clearing that snapshot so its cards cannot target now-unresolvable rows.
    closeActiveCourtDrawer();
    state.bounds = nextBounds;
    // A viewport has changed, so rows from the previous one must not remain
    // visible while its authoritative response is still in flight.
    state.sessions = [];
    state.discoveryStatus = "loading";
    state.discoveryMessage = "";
    const playerRefresh = state.playerLayerOn ? loadPlayers(nextBounds) : null;
    publish();
    try {
      const sessions = await api.loadSessionDiscovery({ bounds: nextBounds });
      if (requestId !== latestRequest) return false;
      state.sessions = Array.isArray(sessions) ? sessions : [];
      state.discoveryStatus = "ready";
      reconcileActiveDetail(nextBounds);
    } catch {
      if (requestId !== latestRequest) return;
      state.sessions = [];
      state.discoveryStatus = "error";
      state.discoveryMessage = "球局資料暫時無法載入。";
      // Keeping a stale action open after authority could not be refreshed is
      // less safe than asking the user to reopen it after a successful retry.
      closeActiveDetail();
      publish();
      return false;
    }
    publish();
    if (playerRefresh) await playerRefresh;
    return true;
  }

  function setCourts(courts, { ready = true } = {}) {
    state.courts = Array.isArray(courts) ? courts : [];
    state.courtsReady = Boolean(ready);
    activeCreateSession?.setCourts?.(state.courts, { ready: state.courtsReady });
    activeProfilePrompt?.setCourts?.(state.courts, { ready: state.courtsReady });
    publish();
  }

  function setDrawerExpanded(expanded) {
    state.drawerExpanded = Boolean(expanded);
    publish();
  }

  function setFilter(key, value) {
    if (key === "types") state.filters.types = value instanceof Set ? new Set(value) : new Set(value ?? []);
    else state.filters[key] = value;
    publish();
  }

  function resetFilters() {
    state.filters = cloneFilters();
    publish();
  }

  function setMapUnavailable() {
    state.mapUnavailable = true;
    state.drawerExpanded = true;
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
    state.mapUnavailable = false;
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
    if (state.userLocation) refreshLocationViewport(state.userLocation);
    else publish();
  }

  function openSessionById(sessionId) {
    // mountSheet replaces a court drawer in the same root and preserves that
    // drawer's original opener for focus restoration. Forget the controller
    // reference without closing the surface ahead of that hand-off.
    activeCourtDrawer = null;
    const session =
      state.sessions.find((entry) => String(entry.sessionId) === String(sessionId)) ??
      state.mySessions.find((entry) => String(entry.sessionId) === String(sessionId));
    if (!session) return;
    const action = actionFor(session);
    let detail = null;
    detail = openSession(session, {
      action,
      onPrimary: () => startPrimaryAction(session, detail),
      canReport: Boolean(state.authSession && profileReadiness(state.profile) === "ready" && profileIsComplete(state.profile)),
      onReport: () => openSessionReport(session.sessionId),
      onWithdraw: () => withdraw(session, detail),
    });
    activeDetail = detail?.close ? detail : null;
    activeDetailSession = activeDetail ? session : null;
    activeDetailActionKey = activeDetail ? actionKey(action) : null;
  }

  function openCourt(court, onlySessions = null) {
    activePlayerDrawer = null;
    activePlayerCard = null;
    const sessions = onlySessions ?? visibleSessions().filter((session) => String(session.courtId) === String(court.id));
    closeActiveCourtDrawer({ restoreFocus: false });
    const drawer = openCourtDrawer(court, sessions, { onOpenSession: openSessionById });
    activeCourtDrawer = drawer?.close ? drawer : null;
  }

  function invitableSessions(now = Date.now()) {
    return state.mySessions
      .filter(
        (session) =>
          String(session?.viewerRole).toLowerCase() === "host" &&
          String(session?.status).toLowerCase() === "open" &&
          timeValue(session?.startAt, Number.NEGATIVE_INFINITY) > now
      )
      .sort(compareSessionStart);
  }

  function openPlayer(player) {
    if (!state.playerLayerOn || !state.authSession || !profileIsComplete(state.profile)) return null;
    activePlayerDrawer = null;
    const openedAuth = captureAuthSnapshot();
    let card = null;
    card = openPlayerCard(player, {
      myInvitableSessions: invitableSessions(),
      onClose: () => {
        if (activePlayerCard === card) activePlayerCard = null;
      },
      onCreate: () => {
        if (activePlayerCard === card) activePlayerCard = null;
        openCreateIntent();
      },
      onInvite: async (sessionId) => {
        const target = invitableSessions().find((session) => String(session.sessionId) === String(sessionId));
        if (
          activePlayerCard !== card ||
          !state.playerLayerOn ||
          !profileIsComplete(state.profile) ||
          !isCurrentAuthSnapshot(openedAuth)
        ) {
          throw new Error("登入狀態已變更，請重新開啟球友卡。");
        }
        if (!target) throw new Error("這個球局目前無法邀請球友。");
        const result = await api.inviteToSession(target.sessionId, player.profileId);
        if (
          activePlayerCard !== card ||
          !state.playerLayerOn ||
          !profileIsComplete(state.profile) ||
          !isCurrentAuthSnapshot(openedAuth)
        ) {
          throw new Error("登入狀態已變更，請重新開啟球友卡。");
        }
        if (result?.reloadRequired || result?.outcome === "SESSION_EXPIRED") {
          const refreshed = await reloadParticipation(openedAuth.epoch, openedAuth.identity);
          if (
            activePlayerCard !== card ||
            !state.playerLayerOn ||
            !profileIsComplete(state.profile) ||
            !isCurrentAuthSnapshot(openedAuth)
          ) {
            throw new Error("登入狀態已變更，請重新開啟球友卡。");
          }
          card?.setInvitableSessions?.(invitableSessions());
          if (!refreshed) throw new Error("球局狀態暫時無法重新載入，請稍後再試。");
          throw new Error("球局狀態已更新，請重新選擇可邀請的球局。");
        }
        return result;
      },
    });
    activePlayerCard = card?.close ? card : null;
    return card;
  }

  function openPlayerCourt(court, onlyPlayers = null) {
    if (!state.playerLayerOn || !state.authSession || !profileIsComplete(state.profile)) return null;
    const players = onlyPlayers ?? state.players.filter((player) => String(player.courtId) === String(court.id));
    closeActivePlayerDrawer({ restoreFocus: false });
    closeActivePlayerCard({ restoreFocus: false });
    let drawer = null;
    drawer = openCourtPlayersDrawer(court, players, {
      onClose: () => {
        if (activePlayerDrawer === drawer) activePlayerDrawer = null;
      },
      onOpenPlayer: openPlayer,
    });
    activePlayerDrawer = drawer?.close ? drawer : null;
    return drawer;
  }

  function closeActiveDetail(detail = activeDetail, options = {}) {
    if (!detail || activeDetail !== detail) return;
    const { preserveJoinConfirmation = false, ...closeOptions } = options;
    activeDetail = null;
    activeDetailSession = null;
    activeDetailActionKey = null;
    if (!preserveJoinConfirmation) closeActiveJoinConfirmation(undefined, closeOptions);
    detail.close?.(closeOptions);
  }

  function reconcileActiveDetail(bounds = state.bounds) {
    if (!activeDetail || !activeDetailSession) return;
    const freshSession = state.sessions.find((entry) => String(entry.sessionId) === String(activeDetailSession.sessionId));
    // A viewport result may omit a still-valid session simply because it is
    // now off-screen. Only close when this authoritative response actually
    // includes the detail session and its rendered fields have changed.
    if (freshSession && !sameSessionDetail(activeDetailSession, freshSession)) {
      closeActiveDetail();
    } else if (!freshSession && boundsContainSession(bounds, activeDetailSession)) {
      closeActiveDetail();
    }
  }

  function reconcileActiveDetailParticipation() {
    if (!activeDetail || !activeDetailSession) return;
    if (actionKey(actionFor(activeDetailSession)) !== activeDetailActionKey) closeActiveDetail();
  }

  function closeActiveCourtDrawer(options) {
    const drawer = activeCourtDrawer;
    activeCourtDrawer = null;
    drawer?.close?.(options);
  }

  function closeActiveJoinConfirmation(confirmation = activeJoinConfirmation, options = {}) {
    if (!confirmation || activeJoinConfirmation !== confirmation) return;
    activeJoinConfirmation = null;
    activeJoinConfirmationSessionId = null;
    confirmation.close?.(options);
  }

  function closeActiveCreateSession(options = {}) {
    const sheet = activeCreateSession;
    activeCreateSession = null;
    sheet?.close?.(options);
  }

  function closeActiveProfilePrompt(options = {}) {
    const sheet = activeProfilePrompt;
    activeProfilePrompt = null;
    sheet?.close?.(options);
  }

  function closeActiveReportDialog(options = {}) {
    const dialog = activeReportDialog;
    activeReportDialog = null;
    dialog?.close?.(options);
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
    closeActiveJoinConfirmation(undefined, options);
    closeActiveDetail(undefined, options);
    state.drawerExpanded = true;
    publish();
    toast(message);
  }

  function openJoinConfirmationForSession(session, detail = null) {
    const intent = { action: "join", sessionId: session.sessionId };
    if (lifecycleActionIsInFlight(session.sessionId)) {
      toast("這個球局的操作正在處理中。");
      return null;
    }
    if (activeJoinConfirmation && String(activeJoinConfirmationSessionId) === String(session.sessionId)) {
      return activeJoinConfirmation;
    }
    const confirmingAuth = captureAuthSnapshot();
    closeActiveJoinConfirmation();
    let confirmation = null;
    confirmation = openJoinConfirmation(session, {
      onClose: ({ reason = "dismiss" } = {}) => {
        if (activeJoinConfirmation === confirmation) {
          activeJoinConfirmation = null;
          activeJoinConfirmationSessionId = null;
        }
        if (reason === "dismiss") clearIntent(intent);
      },
      onConfirm: (close) => requestJoin(session, close, detail, confirmingAuth, confirmation),
    });
    activeJoinConfirmation = confirmation?.close ? confirmation : null;
    activeJoinConfirmationSessionId = activeJoinConfirmation ? session.sessionId : null;
    return confirmation;
  }

  function openProfileForIntent(intent, { returnSession = null } = {}) {
    if (activeProfilePrompt) return activeProfilePrompt;
    let sheet = null;
    sheet = promptProfile({
      courts: state.courts,
      courtsReady: state.courtsReady,
      intent,
      onClose: ({ reason = "dismiss", saved = false } = {}) => {
        if (activeProfilePrompt === sheet) activeProfilePrompt = null;
        if (!saved && reason === "dismiss") clearIntent(intent);
      },
      returnSession,
    });
    activeProfilePrompt = sheet?.close ? sheet : null;
    return activeProfilePrompt;
  }

  function requireSessionAction(intent, { detail = null, session = null } = {}) {
    const savedIntent = saveIntent(intent);
    if (!state.authSession) {
      openLogin({
        onClose: ({ reason = "dismiss" } = {}) => {
          if (reason === "dismiss") clearIntent(savedIntent);
        },
      });
      return;
    }
    const readiness = profileReadiness(state.profile);
    if (readiness !== "ready") {
      toast(profileUnavailableMessage(readiness));
      return;
    }
    if (!profileIsComplete(state.profile)) {
      openProfileForIntent(savedIntent, { returnSession: savedIntent.action === "join" ? session : null });
      return;
    }
    if (savedIntent.action === "players") {
      clearIntent(savedIntent);
      state.playerLayerOn = true;
      return loadPlayers(state.bounds);
    }
    if (savedIntent.action === "create") {
      openCreateSessionForIntent(savedIntent);
      return;
    }
    if (session) openJoinConfirmationForSession(session, detail);
  }

  function startPrimaryAction(session, detail) {
    const action = actionFor(session);
    if (action.disabled) return;
    const participation = currentParticipation(session.sessionId);
    if (participation?.viewerParticipantStatus === "accepted") {
      toast("聯絡方式會在我的球局流程中提供。");
      return;
    }
    requireSessionAction({ action: "join", sessionId: session.sessionId }, { detail, session });
  }

  async function refreshAuthoritativeState(authSnapshot, { includeContacts = false } = {}) {
    const [participationReady, discoveryReady] = await Promise.all([
      reloadParticipation(authSnapshot?.epoch, authSnapshot?.identity, { includeContacts }),
      loadDiscovery(state.bounds),
    ]);
    if (authSnapshot && !isCurrentAuthSnapshot(authSnapshot)) return false;
    publish();
    return Boolean(participationReady && discoveryReady);
  }

  async function requestJoin(session, close, detail, confirmingAuth, confirmation) {
    if (!isCurrentAuthSnapshot(confirmingAuth)) {
      close?.();
      closeActiveJoinConfirmation(confirmation);
      closeActiveDetail(detail);
      toast("登入狀態已變更，請重新開啟球局。");
      return { joinError: "登入狀態已變更，請重新開啟球局。" };
    }
    if (!profileIsComplete(state.profile)) {
      close?.();
      closeActiveJoinConfirmation(confirmation);
      closeActiveDetail(detail);
      requireSessionAction({ action: "join", sessionId: session.sessionId }, { session });
      return { joinError: "請先完成個人檔案。" };
    }
    const mutation = beginLifecycleAction("join", session.sessionId, confirmingAuth);
    if (!mutation) {
      close?.();
      closeActiveJoinConfirmation(confirmation);
      toast("這個球局的操作正在處理中。");
      return { joinError: "這個球局的操作正在處理中。" };
    }
    try {
      const result = await api.requestToJoinSession(session.sessionId);
      if (!isCurrentAuthSnapshot(confirmingAuth)) return { joinError: "登入狀態已變更，請重新開啟球局。" };
      clearIntent({ action: "join", sessionId: session.sessionId });
      if (result?.reloadRequired || result?.outcome === "SESSION_EXPIRED") {
        close?.();
        closeActiveJoinConfirmation(confirmation);
        closeActiveDetail(detail);
        await refreshAuthoritativeState(confirmingAuth);
        toast("球局狀態已更新，請重新載入。");
        return { joinError: "球局狀態已更新，請重新載入。" };
      }
      // Keep the deliberate confirmation visible as the success surface. The
      // detail sheet can close without implicitly dismissing that dialog.
      closeActiveDetail(detail, { reason: "join-submitted", preserveJoinConfirmation: true });
      if (!(await refreshAuthoritativeState(confirmingAuth))) {
        return { joinError: "球局狀態暫時無法重新載入，請重新整理後再試。" };
      }
      return { ...result, joinSubmitted: true };
    } catch (error) {
      if (!isCurrentAuthSnapshot(confirmingAuth)) return { joinError: "登入狀態已變更，請重新開啟球局。" };
      await refreshAuthoritativeState(confirmingAuth);
      const message = error?.message || "申請失敗，請稍後再試。";
      // A stale discovery response can legitimately close the underlying
      // detail (and therefore this confirmation) before its inline error is
      // rendered. Announce that result instead of silently discarding it.
      if (activeJoinConfirmation !== confirmation) toast(message);
      return { joinError: message };
    } finally {
      finishLifecycleAction(mutation);
    }
  }

  async function withdraw(session, detail) {
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
        if (activeDetail === detail) toast("球局狀態暫時無法重新載入，請重新整理後再試。");
        return;
      }
      if (result?.reloadRequired || result?.outcome === "SESSION_EXPIRED") {
        closeActiveDetail(detail);
        toast("球局狀態已更新，請重新載入。");
        return;
      }
      closeActiveDetail(detail);
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
    const session = state.mySessions.find((entry) => String(entry.sessionId) === String(sessionId));
    if (!session) throw new Error("這個球局已更新，請重新整理後再試。");
    return session;
  }

  function requireMySessionAction(sessionId, predicate) {
    const authSnapshot = captureAuthSnapshot();
    if (
      !isCurrentAuthSnapshot(authSnapshot) ||
      profileReadiness(state.profile) !== "ready" ||
      !profileIsComplete(state.profile)
    ) {
      throw new Error("登入或個人檔案狀態已變更，請重新整理後再試。");
    }
    const session = mySessionForAction(sessionId);
    if (!predicate(session)) throw new Error("這個球局的狀態已更新，請重新整理後再試。");
    return { authSnapshot, session };
  }

  async function runMySessionMutation(kind, session, authSnapshot, execute, successMessage, { includeContacts = true } = {}) {
    const mutation = beginLifecycleAction(kind, session.sessionId, authSnapshot);
    if (!mutation) throw new Error("這個球局的操作正在處理中。");
    let refreshed = false;
    try {
      const result = await execute();
      if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新整理後再試。");
      refreshed = await refreshAuthoritativeState(authSnapshot, { includeContacts });
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
        await refreshAuthoritativeState(authSnapshot, { includeContacts });
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
    const participant = (state.mySessionRosters.get(sessionKey(sessionId)) ?? []).find(
      (candidate) =>
        String(candidate.participantId) === String(participantId) && candidate.role === "guest" && candidate.status === "requested"
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

  async function cancelMySession(sessionId) {
    const { authSnapshot, session } = requireMySessionAction(sessionId, (candidate) => Boolean(candidate.canCancel));
    if (typeof api?.cancelSession !== "function") throw new Error("目前無法取消這個球局。");
    return runMySessionMutation("cancel", session, authSnapshot, () => api.cancelSession(session.sessionId), "已取消球局。");
  }

  async function withdrawMySession(sessionId) {
    const { authSnapshot, session } = requireMySessionAction(sessionId, (candidate) => Boolean(candidate.canWithdraw));
    if (typeof api?.withdrawFromSession !== "function") throw new Error("目前無法退出這個球局。");
    return runMySessionMutation("withdraw", session, authSnapshot, () => api.withdrawFromSession(session.sessionId), "已退出球局。");
  }

  async function markMySessionPlayed(sessionId) {
    const { authSnapshot, session } = requireMySessionAction(sessionId, (candidate) => Boolean(candidate.canConfirmPlayed));
    if (typeof api?.markSessionPlayed !== "function") throw new Error("目前無法回報這個球局。");
    return runMySessionMutation("played", session, authSnapshot, () => api.markSessionPlayed(session.sessionId), "已回報打成。");
  }

  async function confirmMySessionAttendance(sessionId) {
    const { authSnapshot, session } = requireMySessionAction(
      sessionId,
      (candidate) => Boolean(candidate.canConfirmAttendance) && !candidate.viewerPlayedConfirmed
    );
    if (typeof api?.confirmSessionAttendance !== "function") throw new Error("目前無法確認到場。");
    return runMySessionMutation("attendance", session, authSnapshot, () => api.confirmSessionAttendance(session.sessionId), "已確認到場。");
  }

  async function togglePlayerVisibility() {
    const authSnapshot = captureAuthSnapshot();
    if (
      !isCurrentAuthSnapshot(authSnapshot) ||
      profileReadiness(state.profile) !== "ready" ||
      !profileIsComplete(state.profile)
    ) {
      throw new Error("登入或個人檔案狀態已變更，請重新整理後再試。");
    }
    if (typeof api?.setPlayerVisibility !== "function") throw new Error("目前無法更新球友卡設定。");

    const nextVisibility = !profileIsPublic(state.profile);
    await api.setPlayerVisibility(nextVisibility);
    if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新整理後再試。");

    // The RPC is the authoritative write. Publish its committed value before
    // the secondary profile read so My Sessions does not revert to the old
    // consent setting when reconciliation is slow or unavailable.
    state.profile = { ...state.profile, isPublic: nextVisibility };
    notifyMySessions();

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

  function requireReportAccess() {
    const authSnapshot = captureAuthSnapshot();
    if (
      !isCurrentAuthSnapshot(authSnapshot) ||
      profileReadiness(state.profile) !== "ready" ||
      !profileIsComplete(state.profile)
    ) {
      throw new Error("請先登入並完成個人檔案後再檢舉。");
    }
    if (typeof api?.createReport !== "function") throw new Error("目前無法送出檢舉。");
    return authSnapshot;
  }

  function openReportForTarget({ sessionId = null, reportedProfileId = null, targetLabel }) {
    const authSnapshot = requireReportAccess();
    let dialog = null;
    dialog = openReport({
      targetLabel,
      onClose: () => {
        if (activeReportDialog === dialog) activeReportDialog = null;
      },
      onSubmit: async (reason) => {
        const normalizedReason = String(reason ?? "").trim();
        if (!normalizedReason) throw new Error("請選擇檢舉原因。");
        if (!isCurrentAuthSnapshot(authSnapshot) || !profileIsComplete(state.profile)) {
          throw new Error("登入或個人檔案狀態已變更，請重新開啟檢舉。");
        }
        const result = await api.createReport({ reportedProfileId, reason: normalizedReason, sessionId });
        if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新開啟檢舉。");
        toast("已送出檢舉，謝謝你的回報。");
        return result;
      },
    });
    activeReportDialog = dialog?.close ? dialog : null;
    return dialog;
  }

  function openSessionReport(sessionId) {
    const session =
      state.sessions.find((entry) => String(entry.sessionId) === String(sessionId)) ??
      state.mySessions.find((entry) => String(entry.sessionId) === String(sessionId));
    if (!session) throw new Error("這個球局已更新，請重新整理後再試。");
    return openReportForTarget({
      sessionId: session.sessionId,
      targetLabel: `${session.court} · ${session.startAt}`,
    });
  }

  function openRosterParticipantReport(sessionId, profileId) {
    const session = mySessionForAction(sessionId);
    const participant = (state.mySessionRosters.get(sessionKey(sessionId)) ?? []).find(
      (candidate) => String(candidate.profileId) === String(profileId)
    );
    if (!participant) throw new Error("申請者資料已更新，請重新整理後再試。");
    return openReportForTarget({
      reportedProfileId: participant.profileId,
      targetLabel: `${participant.nickname ?? "這位球友"} · ${session.court}`,
    });
  }

  async function submitCreateSession(input, close, sheet, openedAuthSnapshot = captureAuthSnapshot()) {
    const authSnapshot = openedAuthSnapshot;
    if (!isCurrentAuthSnapshot(authSnapshot) || !profileIsComplete(state.profile)) {
      throw new Error("登入或個人檔案狀態已變更，請重新開啟表單。");
    }
    try {
      const result = await api.createSession(input);
      if (!isCurrentAuthSnapshot(authSnapshot)) {
        throw new Error("登入狀態已變更，請重新開啟表單。");
      }
      clearIntent({ action: "create" });
      if (activeCreateSession === sheet) activeCreateSession = null;
      close?.();
      await Promise.all([
        loadDiscovery(state.bounds),
        reloadParticipation(authSnapshot.epoch, authSnapshot.identity),
      ]);
      if (!isCurrentAuthSnapshot(authSnapshot)) return result;
      showCreatedSession(result?.sessionId);
      toast("已建立球局。");
      return result;
    } catch (error) {
      if (error?.name === "DataApiUnavailableError") {
        throw new Error("本機示範資料僅供瀏覽；登入、儲存個人檔案與建立球局需在已設定服務的環境使用。");
      }
      throw error;
    }
  }

  function openCreateSessionForIntent(intent = { action: "create" }) {
    if (activeCreateSession) return activeCreateSession;
    const openedAuthSnapshot = captureAuthSnapshot();
    let sheet = null;
    sheet = openCreateSession({
      courts: state.courts,
      courtsReady: state.courtsReady,
      onClose: ({ reason = "dismiss" } = {}) => {
        if (activeCreateSession === sheet) activeCreateSession = null;
        if (reason === "dismiss") clearIntent(intent);
      },
      onSubmit: (input, close) => submitCreateSession(input, close, sheet, openedAuthSnapshot),
    });
    activeCreateSession = sheet?.close ? sheet : null;
    return activeCreateSession;
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

      if (intent.action === "create") {
        const readiness = profileReadiness(state.profile);
        if (readiness !== "ready") {
          if (readiness === "error") toast(profileUnavailableMessage(readiness));
          return false;
        }
        if (!profileIsComplete(state.profile)) {
          openProfileForIntent(intent);
          return true;
        }
        openCreateSessionForIntent(intent);
        return true;
      }

      if (intent.action === "players") {
        const readiness = profileReadiness(state.profile);
        if (readiness !== "ready") {
          if (readiness === "error") toast(profileUnavailableMessage(readiness));
          return false;
        }
        if (!profileIsComplete(state.profile)) {
          openProfileForIntent(intent);
          return true;
        }
        clearIntent(intent);
        state.playerLayerOn = true;
        return loadPlayers(state.bounds);
      }

      if (intent.action !== "join" || typeof api?.loadSessionSummary !== "function") return false;
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
      const readiness = profileReadiness(state.profile);
      if (readiness !== "ready") {
        if (readiness === "error") toast(profileUnavailableMessage(readiness));
        return false;
      }
      if (!profileIsComplete(state.profile)) {
        openProfileForIntent(intent, { returnSession: target });
        return true;
      }
      openJoinConfirmationForSession(target);
      return true;
    })();
    resumeInFlight.set(resumeKey, operation);
    return operation.finally(() => {
      if (resumeInFlight.get(resumeKey) === operation) resumeInFlight.delete(resumeKey);
    });
  }

  function requestCurrentLocation() {
    if (state.locationBlocked) {
      state.locationMessage = "無法取得位置；你仍可移動地圖或依球場尋找球局。";
      publish();
      return;
    }
    const requestId = ++latestLocationRequest;
    const geolocation = globalThis.navigator?.geolocation;
    if (!geolocation?.getCurrentPosition) {
      state.locationBlocked = true;
      state.locationMessage = "無法取得位置；你仍可移動地圖或依球場尋找球局。";
      publish();
      return;
    }
    try {
      geolocation.getCurrentPosition(
        ({ coords }) => {
          if (requestId !== latestLocationRequest) return;
          const lat = Number(coords?.latitude);
          const lng = Number(coords?.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            state.locationBlocked = true;
            state.locationMessage = "無法取得位置；你仍可移動地圖或依球場尋找球局。";
            publish();
            return;
          }
          state.userLocation = { lat, lng };
          state.locationBlocked = false;
          state.locationMessage = "";
          refreshLocationViewport({ lat, lng });
        },
        () => {
          if (requestId !== latestLocationRequest) return;
          state.locationBlocked = true;
          state.locationMessage = "無法取得位置；你仍可移動地圖或依球場尋找球局。";
          publish();
        },
        { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 }
      );
    } catch {
      if (requestId !== latestLocationRequest) return;
      state.locationBlocked = true;
      state.locationMessage = "無法取得位置；你仍可移動地圖或依球場尋找球局。";
      publish();
    }
  }

  function openCreateIntent() {
    requireSessionAction({ action: "create" });
  }

  function togglePlayerLayer() {
    if (!state.playerLayerOn) {
      if (!state.authSession || profileReadiness(state.profile) !== "ready" || !profileIsComplete(state.profile)) {
        return requireSessionAction({ action: "players" });
      }
      state.playerLayerOn = true;
      return loadPlayers(state.bounds);
    }
    clearPlayerLayer({ closeReason: "player-layer-off" });
    publish();
    return Promise.resolve(true);
  }

  async function setAuthState(session, profile = null) {
    const identity = sessionIdentity(session);
    const previousIdentity = sessionIdentity(state.authSession);
    const identityChanged = previousIdentity !== identity;
    const signedOut = Boolean(previousIdentity) && !identity;
    const accountChanged = Boolean(previousIdentity) && Boolean(identity) && previousIdentity !== identity;
    const previousEligible = profileIsComplete(state.profile);
    const nextEligible = profileIsComplete(profile);
    const previousReadiness = profileReadiness(state.profile);
    const nextReadiness = profileReadiness(profile);
    const eligibilityChanged = previousEligible !== nextEligible;
    const eligibilityWasLost = previousEligible && !nextEligible;
    const readinessChanged = previousReadiness !== nextReadiness;
    if (identityChanged || eligibilityChanged || readinessChanged) authEpoch += 1;
    const epoch = authEpoch;

    if (signedOut || accountChanged) clearIntent();
    if (signedOut || accountChanged || eligibilityWasLost) {
      clearPlayerLayer({ closeReason: signedOut || accountChanged ? "account-change" : "profile-incomplete" });
    }
    if (identityChanged) {
      const options = { reason: "account-change", restoreFocus: false };
      closeActiveCreateSession(options);
      closeActiveProfilePrompt(options);
      closeActiveReportDialog(options);
      closeActiveJoinConfirmation(undefined, options);
      closeActiveDetail(undefined, options);
    } else if (eligibilityWasLost) {
      const options = { reason: "profile-incomplete", restoreFocus: false };
      closeActiveCreateSession(options);
      closeActiveJoinConfirmation(undefined, options);
      closeActiveReportDialog(options);
      closeActiveDetail(undefined, options);
    } else if (eligibilityChanged && nextEligible) {
      // A previously incomplete profile may have completed in another tab or
      // after the sheet's RPC returned. Do not leave that stale form beneath
      // the resumed confirmation/create sheet.
      closeActiveProfilePrompt({ reason: "profile-resolved", restoreFocus: false });
    }

    state.authSession = session ?? null;
    state.profile = profile ?? null;
    if (identityChanged) {
      replaceMySessions([]);
      state.mySessionsError = "";
      state.mySessionsStatus = identity ? "loading" : "idle";
      // The private DOM may currently contain a roster or contact. Push the
      // empty snapshot synchronously, including on plain sign-out, before any
      // optional authenticated reload can run.
      notifyMySessions();
    }
    reconcileActiveDetailParticipation();
    publish();
    if (await reloadParticipation(epoch, identity)) publish();
    if (epoch === authEpoch && isCurrentAuthSnapshot({ epoch, identity })) await resumePendingIntent();
  }

  function retryDiscovery() {
    return loadDiscovery(state.bounds);
  }

  function expandBounds() {
    return refreshExplicitViewport(() => mapTools.fitTaipei?.(), TAIPEI_CITY_BOUNDS);
  }

  return {
    attachMap,
    cancelMySession,
    capturePendingIntentVersion: () => intentVersion,
    clearPendingIntent: () => clearIntent(),
    clearPendingIntentIfUnchanged: (version) => (version === intentVersion ? clearIntent() : false),
    confirmMySessionAttendance,
    expandBounds,
    getMySessions: () => [...state.mySessions],
    getMySessionGroups: () => mySessionGroups(),
    getMySessionState: () => ({
      authenticated: Boolean(state.authSession),
      contactsError: state.mySessionContactsError,
      error: state.mySessionsError,
      groups: mySessionGroups(),
      isPublic: profileIsPublic(state.profile),
      status: state.mySessionsStatus,
      viewGeneration: authEpoch,
    }),
    getSessionContacts: (sessionId) => [...(state.mySessionContacts.get(sessionKey(sessionId)) ?? [])],
    getPlayerLayerState: () => ({
      groups: state.playerLayerOn ? playerGroups() : [],
      message: state.playerLayerMessage,
      on: state.playerLayerOn,
      status: state.playerLayerStatus,
    }),
    getVisibleSessions: visibleSessions,
    loadDiscovery,
    markMySessionPlayed,
    openCourt,
    openPlayerCourt,
    openCreateIntent,
    openRosterParticipantReport,
    openSessionReport,
    openSession: openSessionById,
    requestCurrentLocation,
    refreshMySessionDetails,
    refreshMySessions,
    reviewMySessionParticipant,
    resetFilters,
    resumePendingIntent,
    retryDiscovery,
    setAuthState,
    setCourts,
    setDrawerExpanded,
    setFilter,
    setMapUnavailable,
    togglePlayerVisibility,
    togglePlayerLayer,
    withdrawMySession,
  };
}
