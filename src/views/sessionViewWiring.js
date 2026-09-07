import { taipeiCourts } from "../sessionPresentation.ts";
import { configureLoginModalContent } from "../sheets.ts";
import { taipeiClock, taipeiDateTimeLocalValue } from "../taipeiTime.ts";
import { configureDiscoverySurfaceViews } from "./discoverySurfaceViews.js";
import { configureProfileSurfaceView } from "./profileSurfaceView.js";
import {
  bumpCreateTimeMinutes,
  configureSessionFormViews,
  createCandidateWindowLocal,
  createFixedStartAtLocal,
  createSessionDonePresentation,
  createSessionFormCanPublish,
  taipeiDateValue,
} from "./sessionFormViews.js";
import { configureSessionSurfaceViews } from "./sessionSurfaceViews.js";
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
} from "./surfaceLoaders.js";

const PROFILE_PUBLIC_DISCLOSURE =
  "開球局後，這個暱稱與你的 NTRP 會顯示給瀏覽該球局的人；加入球局後，主揪與已接受球友可使用球局群組聊天。";
export const NTRP_SCALE_EXPLANATION =
  "NTRP 是網球程度自評分級：1.0 初學、2.5 能來回對打、3.5 能穩定控球、4.5 以上具比賽水準。";

/** Shared pure/runtime dependencies injected into the strict React form sheets. */
const sessionFormSheetRuntime = Object.freeze({
  bumpCreateTimeMinutes,
  createCandidateWindowLocal,
  createFixedStartAtLocal,
  createSessionDonePresentation,
  createSessionFormCanPublish,
  taipeiClock,
  taipeiCourts,
  taipeiDateTimeLocalValue,
  taipeiDateValue,
});

let appModule = null;
let preloadMePageInApp = null;
let preloadListenersInstalled = false;

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

function warmView(preload) {
  if (typeof preload === "function") void preload().catch(() => {});
}

function preloadAuthenticatedViews() {
  for (const preload of authenticatedViewPreloads) warmView(preload);
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

function installSessionViewPreloadListeners() {
  if (preloadListenersInstalled || typeof document === "undefined") return;
  preloadListenersInstalled = true;
  document.addEventListener("pointerover", (event) => preloadForIntent(event.target), { passive: true });
  document.addEventListener("focusin", (event) => preloadForIntent(event.target));
}

export function configureSessionViewModules(modules) {
  appModule = modules.appModule;
  configureLoginModalContent(appModule.mountLoginModalContentInApp);
  preloadMePageInApp = appModule.preloadMePageInApp;
  if (typeof preloadMePageInApp !== "function") {
    throw new Error("App module export is unavailable: preloadMePageInApp");
  }
  authenticatedViewPreloads[0] = preloadMePageInApp;
  namedViewPreloads.me = preloadMePageInApp;
  installSessionViewPreloadListeners();
}

export function preloadNonHomeViews(viewNames = Object.keys(namedViewPreloads)) {
  const names = Array.isArray(viewNames) ? viewNames : [viewNames];
  return Promise.all(names.map((name) => namedViewPreloads[name]?.()).filter(Boolean)).then(() => undefined);
}

export function preloadAuthenticatedViewsForAuth(authSession) {
  if (authSession) preloadAuthenticatedViews();
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

/** Configure every legacy-to-React surface boundary from the browser composition root. */
export function configureSessionViewSurfaces() {
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
}
