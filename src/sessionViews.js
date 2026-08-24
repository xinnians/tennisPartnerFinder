import { BANDS, DEFAULT_FILTER_STATE } from "./filters.js"; // eslint-disable-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
import { mountDialog, mountSheet } from "./sheets.js";
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
  bumpCreateTimeMinutes,
  configureSessionFormViews,
  createCandidateWindowLocal,
  createFixedStartAtLocal,
  createSessionDonePresentation,
  createSessionFormCanPublish,
  taipeiDateValue,
} from "./views/sessionFormViews.js";
import { configurePageViews } from "./views/pageViews.js";
import { configureProfileSurfaceView } from "./views/profileSurfaceView.js";
import { configureSessionSurfaceViews } from "./views/sessionSurfaceViews.js";
export {
  renderMapDataStatus,
  renderMePage,
  renderMessagesPage,
  renderMySessionsPage,
  renderNearbySessionsDrawer,
  renderPlayerLayerToggle,
} from "./views/pageViews.js";
export { openProfileCompletionSheet } from "./views/profileSurfaceView.js";
export {
  openReportDialog,
  openSessionChatSheet,
  openSessionSheet,
  openSessionUnavailableSheet,
  openWithdrawSessionConfirmation,
} from "./views/sessionSurfaceViews.js";
export { NTRP_SCALE_EXPLANATION, PROFILE_PUBLIC_DISCLOSURE } from "./views/viewConstants.js";
export {
  CREATE_NTRP_BANDS,
  CREATE_SLOT_OPTIONS,
  bumpCreateTimeMinutes,
  createCandidateWindowLocal,
  createDateChipDate,
  createFixedStartAtLocal,
  createNtrpRangeForBand,
  createSessionFormCanPublish,
  createSessionFormRawInput,
  deriveCreateVenueType,
  openCreateSessionSheet,
  openDecideSessionSheet,
  openEditSessionSheet,
  resolveCreateDateValue,
  validateCreateSessionInput,
  validateUpdateSessionInput,
} from "./views/sessionFormViews.js";
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

// One-way boundary: this legacy adapter may mount React and consume presentation
// helpers, while React modules import only sessionPresentation.ts and never reach
// back into this file.

// App shell、首頁附近抽屜與詳情 sheet 留在主 chunk；Node 22 unit tests 沒有
// document，會短路而不解析其不支援的 .tsx 副檔名。
const appModules = typeof document === "undefined" ? {} : import.meta.glob("./app/App.tsx", { eager: true });
const appModule = appModules["./app/App.tsx"];
const renderMePageInApp = appModule?.renderMePageInApp;
const renderMessagesPageInApp = appModule?.renderMessagesPageInApp;
const renderMySessionsPageInApp = appModule?.renderMySessionsPageInApp;
const renderNearbySessionsDrawerInApp = appModule?.renderNearbySessionsDrawerInApp;
const preloadMePageInApp = appModule?.preloadMePageInApp;
const preloadMessagesPageInApp = appModule?.preloadMessagesPageInApp;
const preloadMySessionsPageInApp = appModule?.preloadMySessionsPageInApp;
const sessionDetailSheetModules =
  typeof document === "undefined" ? {} : import.meta.glob("./sheets/SessionDetailSheet.tsx", { eager: true });
const mountSessionDetailSheetContent =
  sessionDetailSheetModules["./sheets/SessionDetailSheet.tsx"]?.mountSessionDetailSheetContent;
const nonHomeSheetModules =
  typeof document === "undefined"
    ? {}
    : import.meta.glob([
        "./sheets/CourtPlayersSheet.tsx",
        "./sheets/CourtSessionSheet.tsx",
        "./sheets/CreateSessionSheet.tsx",
        "./sheets/DecideSessionSheet.tsx",
        "./sheets/EditSessionSheet.tsx",
        "./sheets/FilterSheet.tsx",
        "./sheets/PlayerCardSheet.tsx",
        "./sheets/PlayerDirectorySheet.tsx",
        "./sheets/ProfileCompletionSheet.tsx",
        "./sheets/ReportDialog.tsx",
        "./sheets/SessionChatSheet.tsx",
        "./sheets/SessionUnavailableSheet.tsx",
        "./sheets/WithdrawSessionConfirmationDialog.tsx",
      ]);

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
    const load = nonHomeSheetModules[modulePath];
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
  preloadProfileCompletionSheet,
  registerProfileContent(mounted, content) {
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

function warmView(preload) {
  if (typeof preload === "function") void preload().catch(() => {});
}

function preloadAuthenticatedViews() {
  for (const preload of authenticatedViewPreloads) warmView(preload);
}

function preloadAuthenticatedViewsForAuth(authSession) {
  if (authSession) preloadAuthenticatedViews();
}

configurePageViews({
  preloadAuthenticatedViewsForAuth,
  renderMePageInApp,
  renderMessagesPageInApp,
  renderMySessionsPageInApp,
  renderNearbySessionsDrawerInApp,
});

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
  preloadCreateSessionSheet,
  preloadDecideSessionSheet,
  preloadEditSessionSheet,
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

/** Open a session-only list for the selected base court or aggregate marker. */
export function openCourtSessionDrawer(court, sessions, { courts = [], onOpenSession = () => {} } = {}) {
  if (!mountCourtSessionSheetContent) {
    return deferSurfaceOpen({
      id: "court-session-sheet",
      label: "球場球局",
      load: preloadCourtSessionSheet,
      open: () => openCourtSessionDrawer(court, sessions, { courts, onOpenSession }),
    });
  }
  const mounted = mountSheet({
    id: "court-session-sheet",
    label: "球場球局",
    html: "",
  });
  const content = mountCourtSessionSheetContent(mounted.surface, {
    court,
    courts,
    onClose: () => mounted.close(),
    onOpenSession,
    sessions,
  });
  mounted.registerUnmount(content.unmount);
  return mounted;
}

/** Open the public player-directory rows for one court. */
export function openCourtPlayersDrawer(court, players, { onClose = () => {}, onOpenPlayer = () => {} } = {}) {
  if (!mountCourtPlayersSheetContent) {
    return deferSurfaceOpen({
      id: "court-players-sheet",
      label: "球場球友",
      load: preloadCourtPlayersSheet,
      onClose,
      open: () => openCourtPlayersDrawer(court, players, { onClose, onOpenPlayer }),
    });
  }
  const mounted = mountSheet({
    id: "court-players-sheet",
    label: "球場球友",
    onClose,
    html: "",
  });
  const content = mountCourtPlayersSheetContent(mounted.surface, {
    court,
    onClose: () => mounted.close(),
    players,
  });
  mounted.registerUnmount(content.unmount);
  mounted.root.querySelectorAll("[data-player-id]").forEach((node) => {
    node.addEventListener("click", () => {
      const target = players.find((player) => String(player.profileId) === node.dataset.playerId);
      if (target) onOpenPlayer(target);
    });
  });
  return mounted;
}

/** Open the all-Taipei opt-in directory without coupling it to map bounds. */
export function openPlayerDirectoryList({ onClose = () => {}, onOpenPlayer = () => {}, onRetry = () => {} } = {}) {
  if (!mountPlayerDirectorySheetContent) {
    return deferSurfaceOpen({
      id: "player-directory-sheet",
      label: "球友名單",
      className: "player-directory-sheet",
      load: preloadPlayerDirectorySheet,
      methods: ["setDirectory"],
      onClose,
      open: () => openPlayerDirectoryList({ onClose, onOpenPlayer, onRetry }),
    });
  }
  const mounted = mountSheet({
    id: "player-directory-sheet",
    label: "球友名單",
    className: "player-directory-sheet",
    onClose,
    html: "",
  });
  const content = mountPlayerDirectorySheetContent(mounted.surface, {
    onClose: () => mounted.close(),
    onOpenPlayer,
    onRetry,
  });
  mounted.registerUnmount(content.unmount);
  content.setDirectory({ status: "loading" });
  return { ...mounted, setDirectory: content.setDirectory };
}

/**
 * Open a standalone filter sheet mirroring the map-topbar chips, isolated in
 * #sheet-root with content-scoped React event handlers. Controls identify
 * themselves via `data-filter` (never the topbar's ids, e.g. #level-chip) so
 * this can be mounted alongside the chips row without id/selector collisions
 * (see batch C1 task-2 ground truth §意外 4/6). `instantOnly` has no control
 * here by product decision (batch D4a): it only lives on the map topbar chip,
 * so this sheet's four sections never read or write it.
 */
export function openFilterSheet({
  filters = DEFAULT_FILTER_STATE,
  courts = [],
  resultCount = 0,
  onSetFilter = () => {},
  onReset = () => {},
  onClose = () => {},
} = {}) {
  if (!mountFilterSheetContent) {
    return deferSurfaceOpen({
      id: "filters-sheet",
      label: "篩選球局",
      className: "filter-sheet",
      load: preloadFilterSheet,
      methods: ["setFilters", "setResultCount"],
      onClose,
      open: () => openFilterSheet({ filters, courts, resultCount, onSetFilter, onReset, onClose }),
    });
  }
  const mounted = mountSheet({
    id: "filters-sheet",
    label: "篩選球局",
    className: "filter-sheet",
    onClose,
    html: "",
  });
  const content = mountFilterSheetContent(mounted.surface, {
    filters,
    onClose: () => mounted.close(),
    onReset,
    onSetFilter,
    resultCount,
  });
  mounted.registerUnmount(content.unmount);
  return {
    ...mounted,
    setFilters: content.setFilters,
    setResultCount: content.setResultCount,
  };
}

/** Open one public player card and, for non-self rows, its host invitation entry point. */
export function openPlayerCardSheet(
  player,
  {
    courts = [],
    myInvitableSessions = [],
    onClose = () => {},
    onCreate = () => {},
    onInvite = async () => {},
    onSeeDirectory = () => {},
  } = {}
) {
  if (!mountPlayerCardSheetContent) {
    return deferSurfaceOpen({
      id: "player-card-sheet",
      label: "球友卡",
      className: "player-card-sheet",
      load: preloadPlayerCardSheet,
      methods: ["setInvitableSessions"],
      onClose,
      open: () =>
        openPlayerCardSheet(player, {
          courts,
          myInvitableSessions,
          onClose,
          onCreate,
          onInvite,
          onSeeDirectory,
        }),
    });
  }
  const mounted = mountSheet({
    id: "player-card-sheet",
    label: "球友卡",
    className: "player-card-sheet",
    onClose,
    html: "",
  });
  // 映射決策 6:「看球友名單」不直呼 controller,只透過 onSeeDirectory 這條既有
  // callback 慣例;controller 端接的是既有 openPlayerDirectory 入口(sessionController.js
  // openPlayer() 已接線),它本身就會關掉這張卡再開名單,這裡不重複 close()。
  const content = mountPlayerCardSheetContent(mounted.surface, {
    courts,
    myInvitableSessions,
    onClose: () => mounted.close(),
    onCreate,
    onInvite,
    onSeeDirectory,
    player,
    sheetRoot: mounted.root,
  });
  mounted.registerUnmount(content.unmount);
  return { ...mounted, setInvitableSessions: content.setInvitableSessions };
}
