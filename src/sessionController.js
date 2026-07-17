import { LOCATION_INITIAL_RADIUS_METERS, MAP_IDLE_DEBOUNCE_MS, TAIPEI_CITY_BOUNDS } from "./config.js";
import { DEFAULT_FILTER_STATE, filterSessions, sortSessionsForDrawer } from "./filters.js";
import { savePendingIntent } from "./sessionIntent.js";

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

function terminalAction(session) {
  const status = String(session.status || "").toLowerCase();
  if (status === "cancelled") return "球局已取消";
  if (status === "expired") return "球局已結束";
  if (status === "started") return "球局已開始";
  return null;
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
  openSession = () => {},
  openJoinConfirmation = () => {},
  openCourtDrawer = () => {},
  openCreatePrompt = () => {},
  openLogin = () => {},
  promptProfile = () => {},
  toast = () => {},
} = {}) {
  const state = {
    bounds: cloneBounds(TAIPEI_CITY_BOUNDS),
    courts: [],
    sessions: [],
    filters: cloneFilters(),
    userLocation: null,
    locationBlocked: false,
    locationMessage: "",
    drawerExpanded: false,
    mapUnavailable: false,
    discoveryStatus: "idle",
    discoveryMessage: "",
    session: null,
    profile: null,
    mySessions: [],
  };
  let map = null;
  let idleTimer = null;
  let latestRequest = 0;
  let latestLocationRequest = 0;
  let authEpoch = 0;
  let explicitViewportGeneration = 0;
  let expectedExplicitViewports = [];
  let activeDetail = null;
  let activeDetailSession = null;
  let activeDetailActionKey = null;
  let activeCourtDrawer = null;
  let activeJoinConfirmation = null;
  let lifecycleMutationGeneration = 0;
  const inFlightLifecycleActions = new Map();

  function visibleSessions() {
    return sortSessionsForDrawer(filterSessions(state.sessions, state.filters), state.userLocation);
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
  }

  function currentParticipation(sessionId) {
    if (!state.session) return null;
    return state.mySessions.find((entry) => String(entry.sessionId) === String(sessionId)) ?? null;
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
    return { label: "申請加入" };
  }

  function captureAuthSnapshot() {
    return { epoch: authEpoch, identity: sessionIdentity(state.session) };
  }

  function isCurrentAuthSnapshot(snapshot) {
    return (
      Boolean(snapshot?.identity) &&
      snapshot.epoch === authEpoch &&
      sessionIdentity(state.session) === snapshot.identity
    );
  }

  function lifecycleActionKey(sessionId, identity = sessionIdentity(state.session)) {
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

  async function reloadParticipation(epoch = authEpoch, identity = sessionIdentity(state.session)) {
    if (!state.session || !identity || typeof api?.loadMySessions !== "function") return false;
    try {
      const sessions = await api.loadMySessions();
      if (epoch !== authEpoch || !state.session || sessionIdentity(state.session) !== identity) return false;
      state.mySessions = Array.isArray(sessions) ? sessions : [];
      reconcileActiveDetailParticipation();
      return true;
    } catch {
      if (epoch !== authEpoch || !state.session || sessionIdentity(state.session) !== identity) return false;
      state.mySessions = [];
      reconcileActiveDetailParticipation();
      return true;
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
    publish();
    try {
      const sessions = await api.loadSessionDiscovery({ bounds: nextBounds });
      if (requestId !== latestRequest) return;
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
    }
    publish();
  }

  function setCourts(courts) {
    state.courts = Array.isArray(courts) ? courts : [];
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
    const session = state.sessions.find((entry) => String(entry.sessionId) === String(sessionId));
    if (!session) return;
    const action = actionFor(session);
    let detail = null;
    detail = openSession(session, {
      action,
      onPrimary: () => startPrimaryAction(session, detail),
      onWithdraw: () => withdraw(session, detail),
    });
    activeDetail = detail?.close ? detail : null;
    activeDetailSession = activeDetail ? session : null;
    activeDetailActionKey = activeDetail ? actionKey(action) : null;
  }

  function openCourt(court, onlySessions = null) {
    const sessions = onlySessions ?? visibleSessions().filter((session) => String(session.courtId) === String(court.id));
    closeActiveCourtDrawer({ restoreFocus: false });
    const drawer = openCourtDrawer(court, sessions, { onOpenSession: openSessionById });
    activeCourtDrawer = drawer?.close ? drawer : null;
  }

  function closeActiveDetail(detail = activeDetail) {
    if (!detail || activeDetail !== detail) return;
    activeDetail = null;
    activeDetailSession = null;
    activeDetailActionKey = null;
    closeActiveJoinConfirmation();
    detail.close?.();
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

  function closeActiveJoinConfirmation(confirmation = activeJoinConfirmation) {
    if (!confirmation || activeJoinConfirmation !== confirmation) return;
    activeJoinConfirmation = null;
    confirmation.close?.();
  }

  function beginAnonymousIntent(intent) {
    try {
      savePendingIntent(intent, globalThis.sessionStorage);
    } catch {
      // Pending intent is a convenience only; never block the visible prompt.
    }
  }

  function startPrimaryAction(session, detail) {
    const action = actionFor(session);
    if (action.disabled) return;
    const participation = currentParticipation(session.sessionId);
    if (participation?.viewerParticipantStatus === "accepted") {
      toast("聯絡方式會在我的球局流程中提供。");
      return;
    }
    if (!state.session) {
      beginAnonymousIntent({ action: "join", sessionId: session.sessionId });
      openLogin();
      return;
    }
    if (!profileIsComplete(state.profile)) {
      beginAnonymousIntent({ action: "join", sessionId: session.sessionId });
      promptProfile();
      return;
    }
    if (lifecycleActionIsInFlight(session.sessionId)) {
      toast("這個球局的操作正在處理中。");
      return;
    }
    const confirmingAuth = captureAuthSnapshot();
    closeActiveJoinConfirmation();
    let confirmation = null;
    confirmation = openJoinConfirmation(session, {
      onConfirm: (close) => requestJoin(session, close, detail, confirmingAuth, confirmation),
    });
    activeJoinConfirmation = confirmation?.close ? confirmation : null;
  }

  async function refreshAuthoritativeState(authSnapshot) {
    await Promise.all([
      reloadParticipation(authSnapshot?.epoch, authSnapshot?.identity),
      loadDiscovery(state.bounds),
    ]);
    if (authSnapshot && !isCurrentAuthSnapshot(authSnapshot)) return false;
    publish();
    return true;
  }

  async function requestJoin(session, close, detail, confirmingAuth, confirmation) {
    if (!isCurrentAuthSnapshot(confirmingAuth)) {
      close?.();
      closeActiveJoinConfirmation(confirmation);
      closeActiveDetail(detail);
      toast("登入狀態已變更，請重新開啟球局。");
      return;
    }
    if (!profileIsComplete(state.profile)) {
      close?.();
      closeActiveJoinConfirmation(confirmation);
      closeActiveDetail(detail);
      promptProfile();
      return;
    }
    const mutation = beginLifecycleAction("join", session.sessionId, confirmingAuth);
    if (!mutation) {
      close?.();
      closeActiveJoinConfirmation(confirmation);
      toast("這個球局的操作正在處理中。");
      return;
    }
    try {
      const result = await api.requestToJoinSession(session.sessionId);
      if (!isCurrentAuthSnapshot(confirmingAuth)) return;
      close?.();
      closeActiveJoinConfirmation(confirmation);
      closeActiveDetail(detail);
      if (!(await refreshAuthoritativeState(confirmingAuth))) return;
      if (result?.reloadRequired || result?.outcome === "SESSION_EXPIRED") {
        toast("球局狀態已更新，請重新載入。");
        return;
      }
      toast("已送出申請。");
    } catch (error) {
      if (isCurrentAuthSnapshot(confirmingAuth)) toast(error?.message || "申請失敗，請稍後再試。");
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
      closeActiveDetail(detail);
      if (!(await refreshAuthoritativeState(authSnapshot))) return;
      if (result?.reloadRequired || result?.outcome === "SESSION_EXPIRED") {
        toast("球局狀態已更新，請重新載入。");
        return;
      }
      toast("已撤回申請。");
    } catch (error) {
      if (isCurrentAuthSnapshot(authSnapshot)) toast(error?.message || "撤回失敗，請稍後再試。");
    } finally {
      finishLifecycleAction(mutation);
    }
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
    beginAnonymousIntent({ action: "create" });
    openCreatePrompt({
      signedIn: Boolean(state.session),
      onContinue: () => (state.session ? promptProfile() : openLogin()),
    });
  }

  async function setAuthState(session, profile = null) {
    const epoch = ++authEpoch;
    const identity = sessionIdentity(session);
    const identityChanged = sessionIdentity(state.session) !== identity;
    const eligibilityWasLost = profileIsComplete(state.profile) && !profileIsComplete(profile);
    if (identityChanged || eligibilityWasLost) {
      closeActiveJoinConfirmation();
      closeActiveDetail();
    }
    state.session = session ?? null;
    state.profile = profile ?? null;
    state.mySessions = [];
    reconcileActiveDetailParticipation();
    publish();
    if (await reloadParticipation(epoch, identity)) publish();
  }

  function retryDiscovery() {
    return loadDiscovery(state.bounds);
  }

  function expandBounds() {
    return refreshExplicitViewport(() => mapTools.fitTaipei?.(), TAIPEI_CITY_BOUNDS);
  }

  return {
    attachMap,
    expandBounds,
    getVisibleSessions: visibleSessions,
    loadDiscovery,
    openCourt,
    openCreateIntent,
    openSession: openSessionById,
    requestCurrentLocation,
    resetFilters,
    retryDiscovery,
    setAuthState,
    setCourts,
    setDrawerExpanded,
    setFilter,
    setMapUnavailable,
  };
}
