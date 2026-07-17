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
import { getInitialSession, loadCourts, loadCurrentProfile, loadMySessions, loadSessionDiscovery, onAuthStateChange, requestToJoinSession, signInWithOAuthProvider, withdrawFromSession } from "./dataApi.js";
import { isSupabaseConfigured } from "./supabaseClient.js";
import { createSessionController } from "./sessionController.js";
import {
  openCourtSessionDrawer,
  openJoinSessionConfirmation,
  openSessionSheet,
  renderMapDataStatus,
  renderNearbySessionsDrawer,
} from "./sessionViews.js";
import { mountDialog, mountSheet, openLoginModal } from "./sheets.js";
import { esc } from "./util.js";

let google = null;
let map = null;
let courts = [];
let sessionMarkers = [];
let courtMarkers = [];
let controller;
let authStateEpoch = 0;
let currentAuthIdentity = null;

function toast(message) {
  const root = document.getElementById("toast-root");
  root.innerHTML = `<div class="toast">${esc(message)}</div>`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (root.innerHTML = ""), 2400);
}

function openSafeLogin() {
  openLoginModal({
    onProvider: async (provider) => {
      if (!isSupabaseConfigured) throw new Error("登入服務尚未啟用");
      await signInWithOAuthProvider(provider);
    },
  });
}

function openProfileCompletionPrompt() {
  mountDialog({
    id: "profile-completion-prompt",
    label: "完成個人檔案",
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">完成後即可申請</p><h2>請先完成個人檔案</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉提示">×</button>
      </div>
      <p class="surface__copy">個人檔案設定會在登入後的流程中提供。</p>`,
  });
}

function openCreatePrompt({ signedIn, onContinue }) {
  const mounted = mountSheet({
    id: "create-session-prompt",
    label: "開球局",
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">開球局</p><h2>建立你的下一場球局</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉開球局提示">×</button>
      </div>
      <p class="surface__copy">建立球局的表單會在${signedIn ? "完成個人檔案後" : "登入後"}提供。</p>
      <button type="button" class="session-primary" data-create-continue>${signedIn ? "完成個人檔案" : "登入後繼續"}</button>`,
  });
  mounted.root.querySelector("[data-create-continue]")?.addEventListener("click", () => {
    mounted.close();
    onContinue();
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
    controller.setCourts(courts);
    populateCourtFilters(courts);
    renderBaseCourtPins();
  } catch {
    courts = [];
    controller.setCourts([]);
    toast("球場資料暫時無法載入。");
  }
}

function eligibilityFromPrivateProfile(profile) {
  return {
    complete: Boolean(
      profile?.nick &&
        Number.isFinite(Number(profile?.ntrp)) &&
        profile?.lineId &&
        (profile?.courts?.size ?? 0) > 0 &&
        (profile?.types?.size ?? 0) > 0
    ),
  };
}

function authIdentity(session) {
  const value = session?.user?.id ?? session?.access_token ?? null;
  return value == null ? null : String(value);
}

function applyAuthCandidate(session) {
  const epoch = ++authStateEpoch;
  const identity = authIdentity(session);
  currentAuthIdentity = identity;
  // Clear prior participation immediately; profile loading must not leave an
  // earlier account's CTA state visible while it is in flight.
  void controller.setAuthState(session, null);
  if (!session) return;
  void (async () => {
    let eligibility = null;
    try {
      eligibility = eligibilityFromPrivateProfile(await loadCurrentProfile());
    } catch {
      eligibility = null;
    }
    if (epoch !== authStateEpoch || identity !== currentAuthIdentity) return;
    void controller.setAuthState(session, eligibility);
  })();
}

async function restoreAuth() {
  onAuthStateChange((session) => applyAuthCandidate(session));
  const initialEpoch = authStateEpoch;
  let initialSession = null;
  try {
    initialSession = await getInitialSession();
  } catch {
    initialSession = null;
  }
  if (initialEpoch !== authStateEpoch) return;
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
    api: { loadSessionDiscovery, loadMySessions, requestToJoinSession, withdrawFromSession },
    mapTools: { getMapBounds, subscribeToMapIdle, setUserLocation, fitTaipei: fitTaipeiBounds },
    render: renderDiscovery,
    renderPins: renderSessionMarkers,
    openSession: (session, handlers) => openSessionSheet(session, handlers),
    openJoinConfirmation: (session, handlers) => openJoinSessionConfirmation(session, handlers),
    openCourtDrawer: (court, sessions, handlers) => openCourtSessionDrawer(court, sessions, handlers),
    openCreatePrompt,
    openLogin: openSafeLogin,
    promptProfile: openProfileCompletionPrompt,
    toast,
  });
  wireFilters();
  document.getElementById("use-my-location").addEventListener("click", () => controller.requestCurrentLocation());
  document.getElementById("open-session").addEventListener("click", () => controller.openCreateIntent());

  // None of these awaits the others: court pins and discovery work before auth.
  loadCourtsImmediately();
  controller.loadDiscovery();
  restoreAuth();
  startMap();
}

init();
