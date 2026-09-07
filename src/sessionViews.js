import { BANDS, DEFAULT_FILTER_STATE } from "./filters.ts"; // eslint-disable-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
import { configureLoginModalContent } from "./sheets.ts";
import { taipeiClock, taipeiDateTimeLocalValue } from "./taipeiTime.ts";
import { esc } from "./util.js";
import {
  runNotificationSettingAction, // eslint-disable-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
  runPresenceSettingAction, // eslint-disable-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
} from "./sessionActions.ts";
import {
  taipeiCourts,
  taipeiDayWord, // eslint-disable-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
} from "./sessionPresentation.ts";
import {
  bumpCreateTimeMinutes as bumpCreateTimeMinutesImpl,
  configureSessionFormViews,
  createCandidateWindowLocal as createCandidateWindowLocalImpl,
  createFixedStartAtLocal as createFixedStartAtLocalImpl,
  createSessionDonePresentation,
  createSessionFormCanPublish as createSessionFormCanPublishImpl,
  taipeiDateValue,
} from "./views/sessionFormViews.js";
import * as sessionFormViews from "./views/sessionFormViews.js";
import { configureDiscoverySurfaceViews } from "./views/discoverySurfaceViews.js";
import * as discoverySurfaceViews from "./views/discoverySurfaceViews.js";
import { configureProfileSurfaceView } from "./views/profileSurfaceView.js";
import * as profileSurfaceView from "./views/profileSurfaceView.js";
import { configureSessionSurfaceViews } from "./views/sessionSurfaceViews.js";
import * as sessionSurfaceViews from "./views/sessionSurfaceViews.js";
import {
  deferSurfaceOpen,
  lazySurfaceMounts,
  preloadCourtPlayersSheet,
  preloadCourtSessionSheet,
  preloadCreateSessionSheet,
  preloadDecideSessionSheet,
  preloadEditSessionSheet,
  preloadFilterSheet,
  preloadPlayerCardSheet,
  preloadPlayerDirectorySheet,
  preloadProfileCompletionSheet,
  preloadReportDialog,
  preloadSessionChatSheet,
  preloadSessionDetailSheet,
  preloadSessionUnavailableSheet,
  preloadWithdrawSessionConfirmationDialog,
} from "./views/surfaceLoaders.js";
export { messagesFromGroups, nearbySessionsSummaryText } from "./sessionPresentation.ts";

const PROFILE_PUBLIC_DISCLOSURE =
  "開球局後，這個暱稱與你的 NTRP 會顯示給瀏覽該球局的人；加入球局後，主揪與已接受球友可使用球局群組聊天。";
export const NTRP_SCALE_EXPLANATION =
  "NTRP 是網球程度自評分級：1.0 初學、2.5 能來回對打、3.5 能穩定控球、4.5 以上具比賽水準。";

export function validateCreateSessionInput(input = {}, { now = new Date() } = {}) {
  return sessionFormViews.validateCreateSessionInput(input, { now });
}

export function validateUpdateSessionInput(input = {}, { now = new Date() } = {}) {
  return sessionFormViews.validateUpdateSessionInput(input, { now });
}

export function openSessionChatSheet(...args) {
  return sessionSurfaceViews.openSessionChatSheet(...args);
}

export function openSessionSheet(...args) {
  return sessionSurfaceViews.openSessionSheet(...args);
}

export function openSessionUnavailableSheet() {
  return sessionSurfaceViews.openSessionUnavailableSheet();
}

export function openWithdrawSessionConfirmation({ onClose = () => {}, onConfirm = async () => {} } = {}) {
  return sessionSurfaceViews.openWithdrawSessionConfirmation({ onClose, onConfirm });
}

export function openReportDialog({ targetLabel = "這個項目", onClose = () => {}, onSubmit = () => {} } = {}) {
  return sessionSurfaceViews.openReportDialog({ targetLabel, onClose, onSubmit });
}

export function openProfileCompletionSheet({ ...options } = {}) {
  return profileSurfaceView.openProfileCompletionSheet(options);
}

export const CREATE_SLOT_OPTIONS = [...sessionFormViews.CREATE_SLOT_OPTIONS];

export const CREATE_NTRP_BANDS = [...sessionFormViews.CREATE_NTRP_BANDS];

export function deriveCreateVenueType(mode, booked) {
  return sessionFormViews.deriveCreateVenueType(mode, booked);
}

export function createNtrpRangeForBand(bandKey) {
  return sessionFormViews.createNtrpRangeForBand(bandKey);
}

export function createDateChipDate(key, now = new Date()) {
  return sessionFormViews.createDateChipDate(key, now);
}

export function resolveCreateDateValue(form, now = new Date()) {
  return sessionFormViews.resolveCreateDateValue(form, now);
}

export function bumpCreateTimeMinutes(time, deltaMinutes) {
  return sessionFormViews.bumpCreateTimeMinutes(time, deltaMinutes);
}

export function createFixedStartAtLocal(form, now = new Date()) {
  return sessionFormViews.createFixedStartAtLocal(form, now);
}

export function createCandidateWindowLocal(form, now = new Date()) {
  return sessionFormViews.createCandidateWindowLocal(form, now);
}

export function createSessionFormCanPublish(form) {
  return sessionFormViews.createSessionFormCanPublish(form);
}

export function createSessionFormRawInput(form, now = new Date()) {
  return sessionFormViews.createSessionFormRawInput(form, now);
}

export function openCreateSessionSheet({ ...options } = {}) {
  return sessionFormViews.openCreateSessionSheet(options);
}

export function openDecideSessionSheet(...args) {
  return sessionFormViews.openDecideSessionSheet(...args);
}

export function openEditSessionSheet(...args) {
  return sessionFormViews.openEditSessionSheet(...args);
}

export function openCourtSessionDrawer(court, sessions, { courts = [], onOpenSession = () => {} } = {}) {
  return discoverySurfaceViews.openCourtSessionDrawer(court, sessions, { courts, onOpenSession });
}

export function openCourtPlayersDrawer(court, players, { onClose = () => {}, onOpenPlayer = () => {} } = {}) {
  return discoverySurfaceViews.openCourtPlayersDrawer(court, players, { onClose, onOpenPlayer });
}

export function openPlayerDirectoryList({ onClose = () => {}, onOpenPlayer = () => {}, onRetry = () => {} } = {}) {
  return discoverySurfaceViews.openPlayerDirectoryList({ onClose, onOpenPlayer, onRetry });
}

export function openFilterSheet({ ...options } = {}) {
  return discoverySurfaceViews.openFilterSheet(options);
}

export function openPlayerCardSheet(...args) {
  return discoverySurfaceViews.openPlayerCardSheet(...args);
}

export function renderPlayerLayerToggle(button, { message = "", on = false, status = "idle" } = {}) {
  if (!button) return;
  button.setAttribute("aria-pressed", String(Boolean(on)));
  button.classList.toggle("is-active", Boolean(on));
  // 批 D3:toggle 改為控制直欄的 icon 鈕,可讀文字住在 visually-hidden span
  //(佈局不吃字寬,測試與 SR 讀到的字不變);找不到 span 時退回整鈕文字。
  const layerText = on ? "隱藏在線" : "顯示在線";
  const layerTextNode = button.querySelector("[data-player-layer-text]");
  if (layerTextNode) layerTextNode.textContent = layerText;
  else button.textContent = layerText;
  const statusRoot = document.getElementById("player-layer-status");
  if (!statusRoot) return;
  statusRoot.hidden = !message;
  statusRoot.textContent = message;
  statusRoot.setAttribute("role", status === "error" ? "alert" : "status");
}

export function renderMapDataStatus(
  root,
  { kind = "idle", message = "", onRetry = () => {}, locationMessage = "" } = {}
) {
  const visible = kind !== "idle" || Boolean(locationMessage);
  root.hidden = !visible;
  if (!visible) {
    root.innerHTML = "";
    return;
  }
  root.className = `map-data-status map-data-status--${esc(kind)}`;
  root.innerHTML = `
    ${message ? `<p>${esc(message)}</p>` : ""}
    ${kind === "error" ? '<button type="button" id="map-retry" class="session-secondary">重新載入</button>' : ""}
    ${locationMessage ? `<p id="location-feedback" class="location-feedback">${esc(locationMessage)}</p>` : ""}`;
  root.querySelector("#map-retry")?.addEventListener("click", onRetry);
}

// One-way boundary: this legacy adapter may mount React and consume presentation
// helpers, while React modules import only sessionPresentation.ts and never reach
// back into this file.

// main.js owns the browser-only eager TSX imports. This legacy facade receives
// them explicitly so Node unit tests can still import sessionViews.js without
// teaching Node to execute TSX.
let appModule = null;
let preloadMePageInApp = null;

export function configureSessionViewModules(modules) {
  appModule = modules.appModule;
  configureLoginModalContent(appModule.mountLoginModalContentInApp);
  preloadMePageInApp = appModule.preloadMePageInApp;
  if (typeof preloadMePageInApp !== "function") {
    throw new Error("App module export is unavailable: preloadMePageInApp");
  }
  authenticatedViewPreloads[0] = preloadMePageInApp;
  namedViewPreloads.me = preloadMePageInApp;
}

function requireAppExport(name) {
  const value = appModule?.[name];
  if (typeof value !== "function") throw new Error(`App module export is unavailable: ${name}`);
  return value;
}

const preloadMessagesPageInApp = () => requireAppExport("preloadMessagesPageInApp")();
const preloadMySessionsPageInApp = () => requireAppExport("preloadMySessionsPageInApp")();
const showToastInApp = (...args) => requireAppExport("showToastInApp")(...args);
const configureFilterToolbarInApp = (...args) => requireAppExport("configureFilterToolbarInApp")(...args);
const syncFilterToolbarInApp = (...args) => requireAppExport("syncFilterToolbarInApp")(...args);
const syncBottomNavigationInApp = (...args) => requireAppExport("syncBottomNavigationInApp")(...args);

configureSessionSurfaceViews({
  deferSurfaceOpen,
  lazyMounts: {
    get reportDialog() {
      return lazySurfaceMounts.reportDialog;
    },
    get sessionChat() {
      return lazySurfaceMounts.sessionChat;
    },
    get sessionDetail() {
      return lazySurfaceMounts.sessionDetail;
    },
    get sessionUnavailable() {
      return lazySurfaceMounts.sessionUnavailable;
    },
    get withdrawConfirmation() {
      return lazySurfaceMounts.withdrawConfirmation;
    },
  },
  preloadReportDialog,
  preloadSessionChatSheet,
  preloadSessionDetailSheet,
  preloadSessionUnavailableSheet,
  preloadWithdrawSessionConfirmationDialog,
  registerChatContent(mounted, content) {
    mounted.registerUnmount(content.unmount);
  },
  registerDetailContent(mounted, content) {
    mounted.registerUnmount(content.unmount);
  },
  registerReportContent(mounted, content) {
    mounted.registerUnmount(content.unmount);
  },
  registerUnavailableContent(mounted, content) {
    mounted.registerUnmount(content.unmount);
  },
  registerWithdrawContent(mounted, content) {
    mounted.registerUnmount(content.unmount);
  },
});

configureProfileSurfaceView({
  deferSurfaceOpen,
  lazyMounts: {
    get profileCompletion() {
      return lazySurfaceMounts.profileCompletion;
    },
  },
  ntrpScaleExplanation: NTRP_SCALE_EXPLANATION,
  preloadProfileCompletionSheet,
  profilePublicDisclosure: PROFILE_PUBLIC_DISCLOSURE,
  registerProfileContent(mounted, content) {
    mounted.registerUnmount(content.unmount);
  },
});

configureDiscoverySurfaceViews({
  deferSurfaceOpen,
  lazyMounts: {
    get courtPlayers() {
      return lazySurfaceMounts.courtPlayers;
    },
    get courtSession() {
      return lazySurfaceMounts.courtSession;
    },
    get filter() {
      return lazySurfaceMounts.filter;
    },
    get playerCard() {
      return lazySurfaceMounts.playerCard;
    },
    get playerDirectory() {
      return lazySurfaceMounts.playerDirectory;
    },
  },
  preloadCourtPlayersSheet,
  preloadCourtSessionSheet,
  preloadFilterSheet,
  preloadPlayerCardSheet,
  preloadPlayerDirectorySheet,
  registerCourtPlayersContent(mounted, content) {
    mounted.registerUnmount(content.unmount);
  },
  registerCourtSessionContent(mounted, content) {
    mounted.registerUnmount(content.unmount);
  },
  registerFilterContent(mounted, content) {
    mounted.registerUnmount(content.unmount);
  },
  registerPlayerCardContent(mounted, content) {
    mounted.registerUnmount(content.unmount);
  },
  registerPlayerDirectoryContent(mounted, content) {
    mounted.registerUnmount(content.unmount);
  },
});

const authenticatedViewPreloads = [
  preloadMePageInApp,
  preloadMessagesPageInApp,
  preloadMySessionsPageInApp,
  preloadCreateSessionSheet,
  preloadEditSessionSheet,
  preloadCourtPlayersSheet,
  preloadPlayerDirectorySheet,
  preloadPlayerCardSheet,
  preloadProfileCompletionSheet,
  preloadDecideSessionSheet,
  preloadSessionChatSheet,
  preloadWithdrawSessionConfirmationDialog,
  preloadReportDialog,
];

const namedViewPreloads = {
  chat: preloadSessionChatSheet,
  create: preloadCreateSessionSheet,
  filter: preloadFilterSheet,
  me: preloadMePageInApp,
  mySessions: preloadMySessionsPageInApp,
  withdraw: preloadWithdrawSessionConfirmationDialog,
};

export function preloadNonHomeViews(viewNames = Object.keys(namedViewPreloads)) {
  const names = Array.isArray(viewNames) ? viewNames : [viewNames];
  return Promise.all(names.map((name) => namedViewPreloads[name]?.()).filter(Boolean)).then(() => undefined);
}

export function renderToast(message) {
  showToastInApp?.(String(message));
}

export function configureMapFilterToolbar(handlers) {
  configureFilterToolbarInApp?.(handlers);
}

export function renderMapFilterToolbar(filters) {
  syncFilterToolbarInApp?.(filters);
}

export function renderBottomNavigation(navigation) {
  syncBottomNavigationInApp?.(navigation);
}

function warmView(preload) {
  if (typeof preload === "function") void preload().catch(() => {});
}

function preloadAuthenticatedViews() {
  for (const preload of authenticatedViewPreloads) warmView(preload);
}

export function preloadAuthenticatedViewsForAuth(authSession) {
  if (authSession) preloadAuthenticatedViews();
}

function preloadForIntent(target) {
  if (!(target instanceof Element)) return;
  if (target.closest("#me-tab")) warmView(preloadMePageInApp);
  if (target.closest("#messages-tab")) {
    warmView(preloadMessagesPageInApp);
    warmView(preloadSessionChatSheet);
  }
  if (target.closest("#my-sessions-tab")) warmView(preloadMySessionsPageInApp);
  if (target.closest("#create-session-tab")) warmView(preloadCreateSessionSheet);
  if (target.closest("#filter-sheet-open")) warmView(preloadFilterSheet);
  if (target.closest('[data-testid="session-card"], [data-open-my-session], [title^="球局 · "]'))
    warmView(preloadSessionDetailSheet);
  if (target.closest("#player-directory-open")) {
    warmView(preloadPlayerDirectorySheet);
    warmView(preloadPlayerCardSheet);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("pointerover", (event) => preloadForIntent(event.target), { passive: true });
  document.addEventListener("focusin", (event) => preloadForIntent(event.target));
}

export { taipeiLocalDateTimeToIso } from "./taipeiTime.ts";

/** Shared pure/runtime dependencies injected into the strict React form sheets. */
const sessionFormSheetRuntime = Object.freeze({
  bumpCreateTimeMinutes: bumpCreateTimeMinutesImpl,
  createCandidateWindowLocal: createCandidateWindowLocalImpl,
  createFixedStartAtLocal: createFixedStartAtLocalImpl,
  createSessionDonePresentation,
  createSessionFormCanPublish: createSessionFormCanPublishImpl,
  taipeiClock,
  taipeiCourts,
  taipeiDateTimeLocalValue,
  taipeiDateValue,
});

configureSessionFormViews({
  deferSurfaceOpen,
  lazyMounts: {
    get createSession() {
      return lazySurfaceMounts.createSession;
    },
    get decideSession() {
      return lazySurfaceMounts.decideSession;
    },
    get editSession() {
      return lazySurfaceMounts.editSession;
    },
  },
  ntrpScaleExplanation: NTRP_SCALE_EXPLANATION,
  preloadCreateSessionSheet,
  preloadDecideSessionSheet,
  preloadEditSessionSheet,
  profilePublicDisclosure: PROFILE_PUBLIC_DISCLOSURE,
  registerCreateContent(mounted, content) {
    mounted.registerUnmount(content.unmount);
  },
  registerDecideContent(mounted, content) {
    mounted.registerUnmount(content.unmount);
  },
  registerEditContent(mounted, content) {
    mounted.registerUnmount(content.unmount);
  },
  sessionFormSheetRuntime,
});
