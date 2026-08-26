import { BANDS, DEFAULT_FILTER_STATE } from "./filters.js"; // eslint-disable-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
import { configureLoginModalContent, mountDialog, mountSheet } from "./sheets.js";
import { taipeiClock, taipeiDateTimeLocalValue } from "./taipeiTime.js";
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
export {
  avatarRuntime,
  courtPlayersSheetRuntime,
  decideSessionSheetRuntime,
  mePageRuntime,
  messagesFromGroups,
  mySessionsPageRuntime,
  nearbySessionsDrawerRuntime,
  nearbySessionsSummaryText,
  playerCardSheetRuntime,
  playerDirectorySheetRuntime,
  profileCompletionSheetRuntime,
  reportDialogRuntime,
  sessionCardRuntime,
  sessionChatSheetRuntime,
  sessionDetailSheetRuntime,
} from "./sessionPresentation.ts";

export const PROFILE_PUBLIC_DISCLOSURE =
  "開球局後，這個暱稱與你的 NTRP 會顯示給瀏覽該球局的人；加入球局後，主揪與已接受球友可使用球局群組聊天。";
export const NTRP_SCALE_EXPLANATION =
  "NTRP 是網球程度自評分級：1.0 初學、2.5 能來回對打、3.5 能穩定控球、4.5 以上具比賽水準。";

export function validateCreateSessionInput(input = {}, { now = new Date() } = {}) {
  return sessionFormViews.validateCreateSessionInput(input, { now });
}

export function validateUpdateSessionInput(input = {}, { now = new Date() } = {}) {
  return sessionFormViews.validateUpdateSessionInput(input, { now });
}

// F2D freezes the facade's top-level export declaration scan.
// prettier-ignore
export function openSessionChatSheet(
  ...args
) {
  return sessionSurfaceViews.openSessionChatSheet(...args);
}

// F2D freezes the facade's top-level export declaration scan.
// prettier-ignore
export function openSessionSheet(
  ...args
) {
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

// F2D freezes the facade's top-level export declaration scan.
// prettier-ignore
export function openProfileCompletionSheet({
  ...options
} = {}) {
  return profileSurfaceView.openProfileCompletionSheet(options);
}

// F2D freezes the facade's top-level export declaration scan.
// prettier-ignore
export const CREATE_SLOT_OPTIONS = [
  ...sessionFormViews.CREATE_SLOT_OPTIONS,
];

// F2D freezes the facade's top-level export declaration scan.
// prettier-ignore
export const CREATE_NTRP_BANDS = [
  ...sessionFormViews.CREATE_NTRP_BANDS,
];

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

// F2D freezes the facade's top-level export declaration scan.
// prettier-ignore
export function openCreateSessionSheet({
  ...options
} = {}) {
  return sessionFormViews.openCreateSessionSheet(options);
}

// F2D freezes the facade's top-level export declaration scan.
// prettier-ignore
export function openDecideSessionSheet(
  ...args
) {
  return sessionFormViews.openDecideSessionSheet(...args);
}

// F2D freezes the facade's top-level export declaration scan.
// prettier-ignore
export function openEditSessionSheet(
  ...args
) {
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

// F2D freezes the facade's top-level export declaration scan.
// prettier-ignore
export function openFilterSheet({
  ...options
} = {}) {
  return discoverySurfaceViews.openFilterSheet(options);
}

// F2D freezes the facade's top-level export declaration scan.
// prettier-ignore
export function openPlayerCardSheet(
  ...args
) {
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
let mountSessionDetailSheetContent;
let preloadMePageInApp = null;

export function configureSessionViewModules(modules) {
  appModule = modules.appModule;
  mountSessionDetailSheetContent = modules.mountSessionDetailSheetContent;
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

const lazySurfaceLoaders = {
  "./sheets/CourtPlayersSheet.tsx": () => import("./sheets/CourtPlayersSheet.tsx"),
  "./sheets/CourtSessionSheet.tsx": () => import("./sheets/CourtSessionSheet.tsx"),
  "./sheets/CreateSessionSheet.tsx": () => import("./sheets/CreateSessionSheet.tsx"),
  "./sheets/DecideSessionSheet.tsx": () => import("./sheets/DecideSessionSheet.tsx"),
  "./sheets/EditSessionSheet.tsx": () => import("./sheets/EditSessionSheet.tsx"),
  "./sheets/FilterSheet.tsx": () => import("./sheets/FilterSheet.tsx"),
  "./sheets/PlayerCardSheet.tsx": () => import("./sheets/PlayerCardSheet.tsx"),
  "./sheets/PlayerDirectorySheet.tsx": () => import("./sheets/PlayerDirectorySheet.tsx"),
  "./sheets/ProfileCompletionSheet.tsx": () => import("./sheets/ProfileCompletionSheet.tsx"),
  "./sheets/ReportDialog.tsx": () => import("./sheets/ReportDialog.tsx"),
  "./sheets/SessionChatSheet.tsx": () => import("./sheets/SessionChatSheet.tsx"),
  "./sheets/SessionUnavailableSheet.tsx": () => import("./sheets/SessionUnavailableSheet.tsx"),
  "./sheets/WithdrawSessionConfirmationDialog.tsx": () => import("./sheets/WithdrawSessionConfirmationDialog.tsx"),
};

let mountCreateSessionSheetContent;
let mountEditSessionSheetContent;
let mountSessionUnavailableSheetContent;
let mountCourtSessionSheetContent;
let mountCourtPlayersSheetContent;
let mountFilterSheetContent;
let mountPlayerDirectorySheetContent;
let mountPlayerCardSheetContent;
let mountProfileCompletionSheetContent;
let mountDecideSessionSheetContent;
let mountSessionChatSheetContent;
let mountWithdrawSessionConfirmationDialogContent;
let mountReportDialogContent;

function createMountPreloader(modulePath, exportName, assign) {
  let request = null;
  return () => {
    if (request) return request;
    const load = lazySurfaceLoaders[modulePath];
    if (!load) return Promise.reject(new Error(`Lazy surface module is unavailable: ${modulePath}`));
    request = load().then((module) => {
      const mount = module?.[exportName];
      if (typeof mount !== "function") throw new Error(`Lazy surface export is unavailable: ${exportName}`);
      assign(mount);
    });
    return request;
  };
}

const preloadCreateSessionSheet = createMountPreloader(
  "./sheets/CreateSessionSheet.tsx",
  "mountCreateSessionSheetContent",
  (mount) => (mountCreateSessionSheetContent = mount)
);
const preloadEditSessionSheet = createMountPreloader(
  "./sheets/EditSessionSheet.tsx",
  "mountEditSessionSheetContent",
  (mount) => (mountEditSessionSheetContent = mount)
);
const preloadSessionUnavailableSheet = createMountPreloader(
  "./sheets/SessionUnavailableSheet.tsx",
  "mountSessionUnavailableSheetContent",
  (mount) => (mountSessionUnavailableSheetContent = mount)
);
const preloadCourtSessionSheet = createMountPreloader(
  "./sheets/CourtSessionSheet.tsx",
  "mountCourtSessionSheetContent",
  (mount) => (mountCourtSessionSheetContent = mount)
);
const preloadCourtPlayersSheet = createMountPreloader(
  "./sheets/CourtPlayersSheet.tsx",
  "mountCourtPlayersSheetContent",
  (mount) => (mountCourtPlayersSheetContent = mount)
);
const preloadFilterSheet = createMountPreloader(
  "./sheets/FilterSheet.tsx",
  "mountFilterSheetContent",
  (mount) => (mountFilterSheetContent = mount)
);
const preloadPlayerDirectorySheet = createMountPreloader(
  "./sheets/PlayerDirectorySheet.tsx",
  "mountPlayerDirectorySheetContent",
  (mount) => (mountPlayerDirectorySheetContent = mount)
);
const preloadPlayerCardSheet = createMountPreloader(
  "./sheets/PlayerCardSheet.tsx",
  "mountPlayerCardSheetContent",
  (mount) => (mountPlayerCardSheetContent = mount)
);
const preloadProfileCompletionSheet = createMountPreloader(
  "./sheets/ProfileCompletionSheet.tsx",
  "mountProfileCompletionSheetContent",
  (mount) => (mountProfileCompletionSheetContent = mount)
);
const preloadDecideSessionSheet = createMountPreloader(
  "./sheets/DecideSessionSheet.tsx",
  "mountDecideSessionSheetContent",
  (mount) => (mountDecideSessionSheetContent = mount)
);
const preloadSessionChatSheet = createMountPreloader(
  "./sheets/SessionChatSheet.tsx",
  "mountSessionChatSheetContent",
  (mount) => (mountSessionChatSheetContent = mount)
);
const preloadWithdrawSessionConfirmationDialog = createMountPreloader(
  "./sheets/WithdrawSessionConfirmationDialog.tsx",
  "mountWithdrawSessionConfirmationDialogContent",
  (mount) => (mountWithdrawSessionConfirmationDialogContent = mount)
);
const preloadReportDialog = createMountPreloader(
  "./sheets/ReportDialog.tsx",
  "mountReportDialogContent",
  (mount) => (mountReportDialogContent = mount)
);

configureSessionSurfaceViews({
  deferSurfaceOpen,
  lazyMounts: {
    get reportDialog() {
      return mountReportDialogContent;
    },
    get sessionChat() {
      return mountSessionChatSheetContent;
    },
    get sessionDetail() {
      return mountSessionDetailSheetContent;
    },
    get sessionUnavailable() {
      return mountSessionUnavailableSheetContent;
    },
    get withdrawConfirmation() {
      return mountWithdrawSessionConfirmationDialogContent;
    },
  },
  preloadReportDialog,
  preloadSessionChatSheet,
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
      return mountProfileCompletionSheetContent;
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
      return mountCourtPlayersSheetContent;
    },
    get courtSession() {
      return mountCourtSessionSheetContent;
    },
    get filter() {
      return mountFilterSheetContent;
    },
    get playerCard() {
      return mountPlayerCardSheetContent;
    },
    get playerDirectory() {
      return mountPlayerDirectorySheetContent;
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

function lazySurfaceHtml(label) {
  return `<div class="surface__head">
    <div><p class="surface__eyebrow">LOADING</p><h2>${esc(label)}</h2></div>
    <button type="button" class="surface__close" data-surface-close aria-label="關閉">×</button>
  </div>
  <p class="surface__copy" data-lazy-surface-status role="status" aria-live="polite" aria-atomic="true">正在載入…</p>`;
}

function deferSurfaceOpen({ className = "", id, label, load, methods = [], onClose = () => {}, open, type = "sheet" }) {
  let active = null;
  let live = true;
  let readyHandle = null;
  let replacing = false;
  const pendingCalls = [];
  const mount = type === "dialog" ? mountDialog : mountSheet;
  active = mount({
    id,
    label,
    className,
    html: lazySurfaceHtml(label),
    onClose: (detail) => {
      if (replacing) return;
      live = false;
      onClose(detail);
    },
  });

  const deferred = {
    close(options) {
      return active.close(options);
    },
    get root() {
      return active.root;
    },
    get surface() {
      return active.surface;
    },
  };
  for (const method of methods) {
    deferred[method] = (...args) => {
      if (readyHandle) return readyHandle[method]?.(...args);
      pendingCalls.push([method, args]);
    };
  }

  void load()
    .then(() => {
      if (!live) return;
      replacing = true;
      const next = open();
      replacing = false;
      active = next;
      readyHandle = next;
      for (const [method, args] of pendingCalls.splice(0)) readyHandle[method]?.(...args);
    })
    .catch(() => {
      replacing = false;
      if (!live) return;
      const status = active.root.querySelector("[data-lazy-surface-status]");
      if (status) status.textContent = "載入失敗，請關閉後再試。";
    });
  return deferred;
}

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
  if (target.closest("#player-directory-open")) {
    warmView(preloadPlayerDirectorySheet);
    warmView(preloadPlayerCardSheet);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("pointerover", (event) => preloadForIntent(event.target), { passive: true });
  document.addEventListener("focusin", (event) => preloadForIntent(event.target));
}

export { taipeiLocalDateTimeToIso } from "./taipeiTime.js";

/** Shared pure/runtime dependencies injected into the strict React form sheets. */
export const sessionFormSheetRuntime = Object.freeze({
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
      return mountCreateSessionSheetContent;
    },
    get decideSession() {
      return mountDecideSessionSheetContent;
    },
    get editSession() {
      return mountEditSessionSheetContent;
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
