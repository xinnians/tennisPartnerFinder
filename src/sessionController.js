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

  async function reloadParticipation() {
    if (!state.session || typeof api?.loadMySessions !== "function") {
      state.mySessions = [];
      return;
    }
    try {
      state.mySessions = await api.loadMySessions();
    } catch {
      state.mySessions = [];
    }
  }

  async function loadDiscovery(bounds = state.bounds) {
    const nextBounds = validBounds(bounds) ? cloneBounds(bounds) : cloneBounds(TAIPEI_CITY_BOUNDS);
    state.bounds = nextBounds;
    state.discoveryStatus = "loading";
    state.discoveryMessage = "";
    publish();
    const requestId = ++latestRequest;
    try {
      const sessions = await api.loadSessionDiscovery({ bounds: nextBounds });
      if (requestId !== latestRequest) return;
      state.sessions = Array.isArray(sessions) ? sessions : [];
      state.discoveryStatus = "ready";
    } catch {
      if (requestId !== latestRequest) return;
      state.sessions = [];
      state.discoveryStatus = "error";
      state.discoveryMessage = "球局資料暫時無法載入。";
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

  function attachMap(nextMap) {
    map = nextMap;
    state.mapUnavailable = false;
    mapTools.subscribeToMapIdle?.(map, () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        const bounds = mapTools.getMapBounds?.(map);
        if (validBounds(bounds)) loadDiscovery(bounds);
      }, MAP_IDLE_DEBOUNCE_MS);
    });
    publish();
  }

  function openSessionById(sessionId) {
    const session = state.sessions.find((entry) => String(entry.sessionId) === String(sessionId));
    if (!session) return;
    const action = actionFor(session);
    openSession(session, {
      action,
      onPrimary: () => startPrimaryAction(session),
      onWithdraw: () => withdraw(session),
    });
  }

  function openCourt(court, onlySessions = null) {
    const sessions = onlySessions ?? state.sessions.filter((session) => String(session.courtId) === String(court.id));
    openCourtDrawer(court, sessions, { onOpenSession: openSessionById });
  }

  function beginAnonymousIntent(intent) {
    try {
      savePendingIntent(intent, globalThis.sessionStorage);
    } catch {
      // Pending intent is a convenience only; never block the visible prompt.
    }
  }

  function startPrimaryAction(session) {
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
    openJoinConfirmation(session, { onConfirm: (close) => requestJoin(session, close) });
  }

  async function requestJoin(session, close) {
    try {
      await api.requestToJoinSession(session.sessionId);
      close?.();
      toast("已送出申請。");
      await Promise.all([reloadParticipation(), loadDiscovery(state.bounds)]);
    } catch (error) {
      toast(error?.message || "申請失敗，請稍後再試。");
    }
  }

  async function withdraw(session) {
    try {
      await api.withdrawFromSession(session.sessionId);
      toast("已撤回申請。");
      await Promise.all([reloadParticipation(), loadDiscovery(state.bounds)]);
    } catch (error) {
      toast(error?.message || "撤回失敗，請稍後再試。");
    }
  }

  function requestCurrentLocation() {
    if (state.locationBlocked) {
      state.locationMessage = "無法取得位置；你仍可移動地圖或依球場尋找球局。";
      publish();
      return;
    }
    const geolocation = globalThis.navigator?.geolocation;
    if (!geolocation?.getCurrentPosition) {
      state.locationBlocked = true;
      state.locationMessage = "無法取得位置；你仍可移動地圖或依球場尋找球局。";
      publish();
      return;
    }
    geolocation.getCurrentPosition(
      ({ coords }) => {
        const lat = Number(coords?.latitude);
        const lng = Number(coords?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          state.locationBlocked = true;
          state.locationMessage = "無法取得位置；你仍可移動地圖或依球場尋找球局。";
          publish();
          return;
        }
        state.userLocation = { lat, lng };
        state.locationMessage = "";
        const bounds = mapTools.setUserLocation?.({ lat, lng }, LOCATION_INITIAL_RADIUS_METERS);
        loadDiscovery(validBounds(bounds) ? bounds : state.bounds);
      },
      () => {
        state.locationBlocked = true;
        state.locationMessage = "無法取得位置；你仍可移動地圖或依球場尋找球局。";
        publish();
      },
      { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 }
    );
  }

  function openCreateIntent() {
    beginAnonymousIntent({ action: "create" });
    openCreatePrompt({
      signedIn: Boolean(state.session),
      onContinue: () => (state.session ? promptProfile() : openLogin()),
    });
  }

  async function setAuthState(session, profile = null) {
    state.session = session ?? null;
    state.profile = profile ?? null;
    await reloadParticipation();
    publish();
  }

  function retryDiscovery() {
    return loadDiscovery(state.bounds);
  }

  function expandBounds() {
    mapTools.fitTaipei?.();
    return loadDiscovery(TAIPEI_CITY_BOUNDS);
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
