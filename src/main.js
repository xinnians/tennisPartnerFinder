import "./style.css";
import "./session.css";
import { GOOGLE_MAPS_API_KEY } from "./config.js";
import { BANDS } from "./filters.js";
import {
  createMap,
  fitTaipeiBounds,
  getMapBounds,
  groupSessionsByCourt,
  loadGoogleMaps,
  renderCourtBasePins,
  renderSessionPins,
  setUserLocation,
  subscribeToMapIdle,
} from "./map.js";
import {
  createSession,
  getInitialSession,
  loadCourts,
  loadCurrentProfile,
  loadMySessions,
  loadSessionDiscovery,
  loadSessionSummary,
  onAuthStateChange,
  requestToJoinSession,
  saveCurrentProfile,
  signInWithOAuthProvider,
  withdrawFromSession,
} from "./dataApi.js";
import { isSupabaseConfigured } from "./supabaseClient.js";
import { createSessionController } from "./sessionController.js";
import {
  openCourtSessionDrawer,
  openCreateSessionSheet,
  openJoinSessionConfirmation,
  openProfileCompletionSheet,
  openSessionSheet,
  renderCreatedSessionDestination,
  renderMapDataStatus,
  renderNearbySessionsDrawer,
} from "./sessionViews.js";
import { openLoginModal } from "./sheets.js";
import { esc } from "./util.js";

let google = null;
let map = null;
let courts = [];
let courtsReady = false;
let sessionMarkers = [];
let courtMarkers = [];
let controller;
let authStateEpoch = 0;
let currentAuthIdentity = null;
let authSession = null;
let currentProfile = null;
let activeProfileCompletion = null;
let profileLoadStatus = "idle";
let profileRevision = 0;

function toast(message) {
  const root = document.getElementById("toast-root");
  root.innerHTML = `<div class="toast">${esc(message)}</div>`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (root.innerHTML = ""), 2400);
}

const LOCAL_DEMO_UNAVAILABLE = "本機示範資料僅供瀏覽；登入、儲存個人檔案與建立球局需在已設定服務的環境使用。";

function defaultProfile() {
  return {
    courts: new Set(),
    lineId: "",
    nick: "",
    ntrp: 3.5,
    slots: new Set(["we-m"]),
    types: new Set(),
  };
}

function openSafeLogin({ onClose = () => {} } = {}) {
  if (!isSupabaseConfigured) {
    onClose();
    toast(LOCAL_DEMO_UNAVAILABLE);
    return null;
  }
  return openLoginModal({
    onClose,
    onProvider: async (provider) => {
      await signInWithOAuthProvider(provider);
    },
  });
}

function closeActiveProfileCompletion(options = { reason: "account-change", restoreFocus: false }) {
  const mounted = activeProfileCompletion;
  activeProfileCompletion = null;
  mounted?.close?.(options);
}

function openProfileCompletion({ courts: selectableCourts, courtsReady: formCourtsReady, intent, onClose = () => {}, returnSession } = {}) {
  const openedIdentity = authIdentity(authSession);
  let mounted = null;
  mounted = openProfileCompletionSheet({
    courts: selectableCourts ?? courts,
    courtsReady: formCourtsReady ?? courtsReady,
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
      await controller.setAuthState(authSession, eligibilityFromPrivateProfile(currentProfile));
    },
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

function renderFilters(filters) {
  const district = document.getElementById("district-filter");
  const court = document.getElementById("court-filter");
  const date = document.getElementById("date-filter");
  if (district) district.value = filters.district || "";
  if (court) court.value = filters.courtId == null ? "" : String(filters.courtId);
  if (date) date.value = filters.date || "";
  document.getElementById("band-label").textContent = BANDS.find((band) => band.key === filters.band)?.label ?? "全部";
  document.querySelectorAll(".chip-type").forEach((button) => {
    const selected = filters.types.has(button.dataset.type);
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  document.querySelectorAll("[data-band]").forEach((button) => {
    const selected = button.dataset.band === filters.band;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
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

function renderDiscovery(view) {
  renderFilters(view.filters);
  renderNearbySessionsDrawer(document.getElementById("nearby-sessions-drawer"), {
    sessions: view.sessions,
    expanded: view.expanded,
    hasUserLocation: view.hasUserLocation,
    mapStatus: view.mapStatus,
    onToggle: controller.setDrawerExpanded,
    onOpenSession: controller.openSession,
    onReset: controller.resetFilters,
    onExpandBounds: controller.expandBounds,
    onOpenCreate: controller.openCreateIntent,
    onRetry: controller.retryDiscovery,
  });
  renderMapDataStatus(document.getElementById("map-data-status"), {
    ...view.mapStatus,
    locationMessage: view.locationMessage,
    onRetry: controller.retryDiscovery,
  });
}

function showMapPage() {
  document.getElementById("tab-map").hidden = false;
  document.getElementById("my-sessions-page").hidden = true;
}

function showMySessionsPage(createdSessionId = null) {
  document.getElementById("tab-map").hidden = true;
  const page = document.getElementById("my-sessions-page");
  page.hidden = false;
  renderCreatedSessionDestination(document.getElementById("my-sessions-root"), {
    createdSessionId,
    onBack: showMapPage,
    onOpenSession: controller.openSession,
    sessions: controller.getMySessions(),
  });
}

function populateCourtFilters(nextCourts) {
  const districts = [...new Set(nextCourts.map((court) => court.district).filter(Boolean))].sort();
  const district = document.getElementById("district-filter");
  const court = document.getElementById("court-filter");
  district.innerHTML = `<option value="">全部行政區</option>${districts.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join("")}`;
  court.innerHTML = `<option value="">全部球場</option>${nextCourts
    .map((entry) => `<option value="${esc(entry.id)}">${esc(entry.name)}</option>`)
    .join("")}`;
}

function renderBaseCourtPins() {
  if (!google || !map) return;
  courtMarkers = renderCourtBasePins(google, map, courts, (court) => controller.openCourt(court), courtMarkers);
}

function wireFilters() {
  document.getElementById("district-filter").addEventListener("change", (event) => controller.setFilter("district", event.currentTarget.value));
  document.getElementById("court-filter").addEventListener("change", (event) => controller.setFilter("courtId", event.currentTarget.value || null));
  document.getElementById("date-filter").addEventListener("input", (event) => controller.setFilter("date", event.currentTarget.value || null));
  document.getElementById("filters-reset").addEventListener("click", () => controller.resetFilters());

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
  document.querySelectorAll(".chip-type").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = new Set(
        [...document.querySelectorAll(".chip-type.is-active")].map((node) => node.dataset.type)
      );
      selected.has(button.dataset.type) ? selected.delete(button.dataset.type) : selected.add(button.dataset.type);
      controller.setFilter("types", selected);
    });
  });
}

async function loadCourtsImmediately() {
  try {
    courts = await loadCourts();
    courtsReady = true;
    controller.setCourts(courts, { ready: true });
    populateCourtFilters(courts);
    renderBaseCourtPins();
  } catch {
    courts = [];
    courtsReady = true;
    controller.setCourts([], { ready: true });
    toast("球場資料暫時無法載入。");
  }
}

function validNtrp(value) {
  const ntrp = Number(value);
  return Number.isFinite(ntrp) && ntrp >= 1 && ntrp <= 7 && Number.isInteger(ntrp * 2);
}

function eligibilityFromPrivateProfile(profile, { status = "ready" } = {}) {
  return {
    complete: Boolean(
      profile?.nick &&
        validNtrp(profile?.ntrp) &&
        profile?.lineId &&
        (profile?.courts?.size ?? 0) > 0 &&
        (profile?.types?.size ?? 0) > 0 &&
        (profile?.slots?.size ?? 0) > 0
    ),
    status,
  };
}

function authIdentity(session) {
  const value = session?.user?.id ?? session?.access_token ?? null;
  return value == null ? null : String(value);
}

function applyAuthCandidate(session) {
  const epoch = ++authStateEpoch;
  const identity = authIdentity(session);
  const previousIdentity = currentAuthIdentity;
  const identityChanged = previousIdentity !== identity;
  if (identityChanged) closeActiveProfileCompletion();
  currentAuthIdentity = identity;
  authSession = session ?? null;
  // Only a genuinely different account may clear the controller's profile
  // state. Auth token refreshes for the same account must not invalidate an
  // open confirmation or turn a complete profile transiently incomplete.
  if (identityChanged) {
    profileRevision += 1;
    currentProfile = defaultProfile();
    profileLoadStatus = session ? "loading" : "idle";
    void controller.setAuthState(session, session ? { complete: false, status: "loading" } : null);
  }
  if (!session) {
    currentProfile = defaultProfile();
    profileLoadStatus = "idle";
    return;
  }
  const profileLoadRevision = profileRevision;
  void (async () => {
    let profile = null;
    let loadFailed = false;
    try {
      profile = await loadCurrentProfile();
    } catch {
      loadFailed = true;
    }
    if (epoch !== authStateEpoch || identity !== currentAuthIdentity || profileLoadRevision !== profileRevision) return;
    if (loadFailed) {
      // A refresh failure must never turn a previously known profile into an
      // editable blank replacement form. Initial failures remain blocked
      // until the next successful auth/profile load.
      if (profileLoadStatus === "ready") return;
      profileLoadStatus = "error";
      void controller.setAuthState(authSession, { complete: false, status: "error" });
      return;
    }
    currentProfile = profile ?? defaultProfile();
    profileLoadStatus = "ready";
    void controller.setAuthState(authSession, eligibilityFromPrivateProfile(currentProfile));
  })();
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
    })
    .catch(() => {
      diagnoseMapFailure("Google Maps 載入失敗；已切換為球局清單。");
      controller.setMapUnavailable();
    });
}

function init() {
  controller = createSessionController({
    api: {
      createSession,
      loadMySessions,
      loadSessionDiscovery,
      loadSessionSummary,
      requestToJoinSession,
      withdrawFromSession,
    },
    mapTools: { getMapBounds, subscribeToMapIdle, setUserLocation, fitTaipei: fitTaipeiBounds },
    render: renderDiscovery,
    renderPins: renderSessionMarkers,
    openSession: (session, handlers) => openSessionSheet(session, handlers),
    openJoinConfirmation: (session, handlers) => openJoinSessionConfirmation(session, handlers),
    openCourtDrawer: (court, sessions, handlers) => openCourtSessionDrawer(court, sessions, handlers),
    openCreateSession,
    openLogin: openSafeLogin,
    promptProfile: openProfileCompletion,
    showCreatedSession: showMySessionsPage,
    toast,
  });
  wireFilters();
  document.getElementById("use-my-location").addEventListener("click", () => controller.requestCurrentLocation());
  document.getElementById("open-session").addEventListener("click", () => controller.openCreateIntent());
  document.getElementById("open-my-sessions").addEventListener("click", () => showMySessionsPage());

  // None of these awaits the others: court pins and discovery work before auth.
  loadCourtsImmediately();
  controller.loadDiscovery();
  restoreAuth();
  startMap();
}

init();
