import "./style.css";
import "./session.css";
import { GOOGLE_MAPS_API_KEY, SUPPORT_EMAIL } from "./config.js";
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
  acceptSessionParticipant,
  cancelSession,
  confirmSessionAttendance,
  createReport,
  createSession,
  declineSessionParticipant,
  getInitialSession,
  inviteToSession,
  loadCourts,
  loadCurrentProfile,
  loadMySessions,
  loadPlayerDirectory,
  loadSessionContacts,
  loadSessionDiscovery,
  loadSessionRoster,
  loadSessionSummary,
  markSessionPlayed,
  onAuthStateChange,
  requestToJoinSession,
  respondToSessionInvite,
  saveCurrentProfile,
  signInWithOAuthProvider,
  signOut,
  setPlayerVisibility,
  withdrawFromSession,
} from "./dataApi.js";
import { isSupabaseConfigured } from "./supabaseClient.js";
import { createSessionController } from "./sessionController.js";
import {
  openCourtSessionDrawer,
  openCreateSessionSheet,
  openJoinSessionConfirmation,
  openProfileCompletionSheet,
  openReportDialog,
  openSessionSheet,
  renderMapDataStatus,
  renderMySessionsPage,
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
let activePage = "map";
let createdSessionFocusId = null;
let mySessionsRenderGeneration = 0;
let pendingMySessionsFocus = null;

function toast(message) {
  const root = document.getElementById("toast-root");
  root.innerHTML = `<div class="toast">${esc(message)}</div>`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (root.innerHTML = ""), 2400);
}

function renderSupportContact() {
  const link = document.getElementById("support-link");
  if (!link) return;
  const address = SUPPORT_EMAIL.trim();
  link.hidden = !address;
  if (address) link.href = `mailto:${address}`;
  else link.removeAttribute("href");
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

function syncBottomNavigation() {
  const mapTab = document.getElementById("map-tab");
  const mySessionsTab = document.getElementById("my-sessions-tab");
  if (activePage === "map") mapTab?.setAttribute("aria-current", "page");
  else mapTab?.removeAttribute("aria-current");
  if (activePage === "my-sessions") mySessionsTab?.setAttribute("aria-current", "page");
  else mySessionsTab?.removeAttribute("aria-current");
  const badge = document.getElementById("my-sessions-badge");
  const mySessionState = controller?.getMySessionState?.();
  const count = mySessionState?.groups?.pendingHostRequestCount ?? 0;
  if (badge) {
    badge.hidden = count <= 0;
    badge.textContent = count > 0 ? String(count) : "";
    badge.setAttribute("aria-hidden", "true");
  }
  const badgeLabel = count > 0 ? `我的球局，${count} 位待審核申請者` : "我的球局";
  mySessionsTab?.setAttribute("aria-label", badgeLabel);
  const badgeStatus = document.getElementById("my-sessions-badge-status");
  if (badgeStatus) badgeStatus.textContent = count > 0 ? `${count} 位待審核申請者` : "沒有待審核申請者";
}

function captureMySessionsFocus(root) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  if (active.matches("#my-sessions-refresh")) return { kind: "refresh" };
  if (active.matches("[data-my-sessions-back]")) return { kind: "back" };
  if (active.matches("[data-my-sessions-heading]")) return { kind: "heading" };
  if (active.matches("[data-my-sessions-sign-in]")) return { kind: "sign-in" };
  if (active.matches("[data-retry-contacts]")) return { kind: "retry-contacts" };
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
  if (focus.kind === "retry-contacts") return root.querySelector("[data-retry-contacts]");
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

function renderMySessionsDestination() {
  if (!controller) return;
  const state = controller.getMySessionState();
  const createdSessionId = createdSessionFocusId;
  const root = document.getElementById("my-sessions-root");
  const focus = activePage === "my-sessions" ? captureMySessionsFocus(root) ?? pendingMySessionsFocus : null;
  if (focus) pendingMySessionsFocus = focus;
  else if (activePage !== "my-sessions") pendingMySessionsFocus = null;
  const generation = ++mySessionsRenderGeneration;
  renderMySessionsPage(root, {
    actionScopeKey: state.viewGeneration,
    authenticated: state.authenticated,
    contactsForSession: controller.getSessionContacts,
    contactsError: state.contactsError,
    createdSessionId,
    errorMessage: state.error,
    groups: state.groups,
    onAccept: (sessionId, participantId) => controller.reviewMySessionParticipant(sessionId, participantId, "accepted"),
    onBack: () => showMapPage({ focus: true }),
    onCancel: controller.cancelMySession,
    onConfirmAttendance: controller.confirmMySessionAttendance,
    onCreatedSessionFocus: () => {
      if (createdSessionFocusId !== createdSessionId) return false;
      createdSessionFocusId = null;
      return true;
    },
    onDecline: (sessionId, participantId) => controller.reviewMySessionParticipant(sessionId, participantId, "declined"),
    onMarkPlayed: controller.markMySessionPlayed,
    onOpenSession: controller.openSession,
    onRefresh: async () => {
      await controller.refreshMySessions({ includeContacts: true });
      renderMySessionsDestination();
    },
    onReportParticipant: controller.openRosterParticipantReport,
    onReportSession: controller.openSessionReport,
    onSignIn: () => openSafeLogin(),
    onSignOut: handleSignOut,
    onToggleVisibility: controller.togglePlayerVisibility,
    profileIsPublic: state.isPublic,
    status: state.status,
    onWithdraw: controller.withdrawMySession,
  });
  restoreMySessionsFocus(root, focus, generation);
  syncBottomNavigation();
}

function showMapPage({ focus = false } = {}) {
  activePage = "map";
  pendingMySessionsFocus = null;
  document.getElementById("tab-map").hidden = false;
  document.getElementById("my-sessions-page").hidden = true;
  syncBottomNavigation();
  if (focus) requestAnimationFrame(() => document.getElementById("map-tab")?.focus({ preventScroll: true }));
}

function showMySessionsPage(createdSessionId = null, { focus = false } = {}) {
  activePage = "my-sessions";
  if (createdSessionId != null) createdSessionFocusId = createdSessionId;
  controller.setDrawerExpanded(false);
  document.getElementById("tab-map").hidden = true;
  const page = document.getElementById("my-sessions-page");
  page.hidden = false;
  renderMySessionsDestination();
  // Contacts are private and are deliberately requested only after the
  // accepted-state page has rendered. A rerender then reveals those rows.
  void controller.refreshMySessions({ includeContacts: true }).then(() => {
    if (activePage === "my-sessions") renderMySessionsDestination();
  });
  if (focus) {
    requestAnimationFrame(() => {
      document.querySelector("#my-sessions-root [data-my-sessions-heading]")?.focus({ preventScroll: true });
    });
  }
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
    isPublic: profile?.isPublic === true,
    status,
  };
}

function authIdentity(session) {
  const value = session?.user?.id ?? session?.access_token ?? null;
  return value == null ? null : String(value);
}

async function reloadCurrentProfile() {
  const epoch = authStateEpoch;
  const identity = currentAuthIdentity;
  const profileLoadRevision = profileRevision;
  let profile = null;
  let loadFailed = false;
  try {
    profile = await loadCurrentProfile();
  } catch {
    loadFailed = true;
  }
  if (epoch !== authStateEpoch || identity !== currentAuthIdentity || profileLoadRevision !== profileRevision) return false;
  if (loadFailed) {
    // A refresh failure must never turn a previously known profile into an
    // editable blank replacement form. Initial failures remain blocked
    // until the next successful auth/profile load.
    if (profileLoadStatus !== "ready") {
      profileLoadStatus = "error";
      await controller.setAuthState(authSession, { complete: false, status: "error" });
    }
    throw new Error("個人檔案暫時無法載入，請重新整理後再試。");
  }
  currentProfile = profile ?? defaultProfile();
  profileLoadStatus = "ready";
  await controller.setAuthState(authSession, eligibilityFromPrivateProfile(currentProfile));
  return true;
}

function applyAuthCandidate(session) {
  ++authStateEpoch;
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
  void reloadCurrentProfile().catch(() => {});
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
  renderSupportContact();
  controller = createSessionController({
    api: {
      acceptSessionParticipant,
      cancelSession,
      confirmSessionAttendance,
      createReport,
      createSession,
      declineSessionParticipant,
      loadMySessions,
      loadPlayerDirectory,
      loadSessionContacts,
      loadSessionDiscovery,
      loadSessionRoster,
      loadSessionSummary,
      markSessionPlayed,
      requestToJoinSession,
      inviteToSession,
      respondToSessionInvite,
      setPlayerVisibility,
      withdrawFromSession,
    },
    mapTools: { getMapBounds, subscribeToMapIdle, setUserLocation, fitTaipei: fitTaipeiBounds },
    render: renderDiscovery,
    renderPins: renderSessionMarkers,
    openSession: (session, handlers) => openSessionSheet(session, handlers),
    openJoinConfirmation: (session, handlers) =>
      openJoinSessionConfirmation(session, {
        ...handlers,
        onViewMySessions: () => showMySessionsPage(null, { focus: true }),
      }),
    openCourtDrawer: (court, sessions, handlers) => openCourtSessionDrawer(court, sessions, handlers),
    openCreateSession,
    openLogin: openSafeLogin,
    openReport: (context) => openReportDialog(context),
    promptProfile: openProfileCompletion,
    reloadCurrentProfile,
    showCreatedSession: showMySessionsPage,
    onMySessionsChange: () => {
      if (!controller) return;
      // Keep the hidden destination in sync as well. Otherwise an account
      // switch made from the map page could leave a prior account's private
      // roster/contact values in a hidden DOM subtree.
      renderMySessionsDestination();
    },
    toast,
  });
  wireFilters();
  document.getElementById("use-my-location").addEventListener("click", () => controller.requestCurrentLocation());
  document.getElementById("open-session").addEventListener("click", () => controller.openCreateIntent());
  document.getElementById("open-my-sessions").addEventListener("click", () => showMySessionsPage());
  document.querySelector(".app-brand").addEventListener("click", (event) => {
    event.preventDefault();
    showMapPage({ focus: true });
  });
  document.getElementById("map-tab").addEventListener("click", () => showMapPage());
  document.getElementById("create-session-tab").addEventListener("click", () => controller.openCreateIntent());
  document.getElementById("my-sessions-tab").addEventListener("click", () => showMySessionsPage());
  syncBottomNavigation();

  // None of these awaits the others: court pins and discovery work before auth.
  loadCourtsImmediately();
  controller.loadDiscovery();
  restoreAuth();
  startMap();
}

init();
