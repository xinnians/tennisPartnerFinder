import { mountDialog, mountSheet } from "../sheets.ts";
import { esc } from "../util.js";

const lazySurfaceLoaders = {
  "../sheets/CourtPlayersSheet.tsx": () => import("../sheets/CourtPlayersSheet.tsx"),
  "../sheets/CourtSessionSheet.tsx": () => import("../sheets/CourtSessionSheet.tsx"),
  "../sheets/CreateSessionSheet.tsx": () => import("../sheets/CreateSessionSheet.tsx"),
  "../sheets/DecideSessionSheet.tsx": () => import("../sheets/DecideSessionSheet.tsx"),
  "../sheets/EditSessionSheet.tsx": () => import("../sheets/EditSessionSheet.tsx"),
  "../sheets/FilterSheet.tsx": () => import("../sheets/FilterSheet.tsx"),
  "../sheets/PlayerCardSheet.tsx": () => import("../sheets/PlayerCardSheet.tsx"),
  "../sheets/PlayerDirectorySheet.tsx": () => import("../sheets/PlayerDirectorySheet.tsx"),
  "../sheets/ProfileCompletionSheet.tsx": () => import("../sheets/ProfileCompletionSheet.tsx"),
  "../sheets/ReportDialog.tsx": () => import("../sheets/ReportDialog.tsx"),
  "../sheets/SessionChatSheet.tsx": () => import("../sheets/SessionChatSheet.tsx"),
  "../sheets/SessionDetailSheet.tsx": () => import("../sheets/SessionDetailSheet.tsx"),
  "../sheets/SessionUnavailableSheet.tsx": () => import("../sheets/SessionUnavailableSheet.tsx"),
  "../sheets/WithdrawSessionConfirmationDialog.tsx": () => import("../sheets/WithdrawSessionConfirmationDialog.tsx"),
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
let mountSessionDetailSheetContent;
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

export const preloadCreateSessionSheet = createMountPreloader(
  "../sheets/CreateSessionSheet.tsx",
  "mountCreateSessionSheetContent",
  (mount) => (mountCreateSessionSheetContent = mount)
);
export const preloadEditSessionSheet = createMountPreloader(
  "../sheets/EditSessionSheet.tsx",
  "mountEditSessionSheetContent",
  (mount) => (mountEditSessionSheetContent = mount)
);
export const preloadSessionUnavailableSheet = createMountPreloader(
  "../sheets/SessionUnavailableSheet.tsx",
  "mountSessionUnavailableSheetContent",
  (mount) => (mountSessionUnavailableSheetContent = mount)
);
export const preloadCourtSessionSheet = createMountPreloader(
  "../sheets/CourtSessionSheet.tsx",
  "mountCourtSessionSheetContent",
  (mount) => (mountCourtSessionSheetContent = mount)
);
export const preloadCourtPlayersSheet = createMountPreloader(
  "../sheets/CourtPlayersSheet.tsx",
  "mountCourtPlayersSheetContent",
  (mount) => (mountCourtPlayersSheetContent = mount)
);
export const preloadFilterSheet = createMountPreloader(
  "../sheets/FilterSheet.tsx",
  "mountFilterSheetContent",
  (mount) => (mountFilterSheetContent = mount)
);
export const preloadPlayerDirectorySheet = createMountPreloader(
  "../sheets/PlayerDirectorySheet.tsx",
  "mountPlayerDirectorySheetContent",
  (mount) => (mountPlayerDirectorySheetContent = mount)
);
export const preloadPlayerCardSheet = createMountPreloader(
  "../sheets/PlayerCardSheet.tsx",
  "mountPlayerCardSheetContent",
  (mount) => (mountPlayerCardSheetContent = mount)
);
export const preloadProfileCompletionSheet = createMountPreloader(
  "../sheets/ProfileCompletionSheet.tsx",
  "mountProfileCompletionSheetContent",
  (mount) => (mountProfileCompletionSheetContent = mount)
);
export const preloadDecideSessionSheet = createMountPreloader(
  "../sheets/DecideSessionSheet.tsx",
  "mountDecideSessionSheetContent",
  (mount) => (mountDecideSessionSheetContent = mount)
);
export const preloadSessionChatSheet = createMountPreloader(
  "../sheets/SessionChatSheet.tsx",
  "mountSessionChatSheetContent",
  (mount) => (mountSessionChatSheetContent = mount)
);
export const preloadSessionDetailSheet = createMountPreloader(
  "../sheets/SessionDetailSheet.tsx",
  "mountSessionDetailSheetContent",
  (mount) => (mountSessionDetailSheetContent = mount)
);
export const preloadWithdrawSessionConfirmationDialog = createMountPreloader(
  "../sheets/WithdrawSessionConfirmationDialog.tsx",
  "mountWithdrawSessionConfirmationDialogContent",
  (mount) => (mountWithdrawSessionConfirmationDialogContent = mount)
);
export const preloadReportDialog = createMountPreloader(
  "../sheets/ReportDialog.tsx",
  "mountReportDialogContent",
  (mount) => (mountReportDialogContent = mount)
);

export const lazySurfaceMounts = Object.freeze({
  get courtPlayers() {
    return mountCourtPlayersSheetContent;
  },
  get courtSession() {
    return mountCourtSessionSheetContent;
  },
  get createSession() {
    return mountCreateSessionSheetContent;
  },
  get decideSession() {
    return mountDecideSessionSheetContent;
  },
  get editSession() {
    return mountEditSessionSheetContent;
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
  get profileCompletion() {
    return mountProfileCompletionSheetContent;
  },
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
});

function lazySurfaceHtml(label) {
  return `<div class="surface__head">
    <div><p class="surface__eyebrow">LOADING</p><h2>${esc(label)}</h2></div>
    <button type="button" class="surface__close" data-surface-close aria-label="關閉">×</button>
  </div>
  <p class="surface__copy" data-lazy-surface-status role="status" aria-live="polite" aria-atomic="true">正在載入…</p>`;
}

export function deferSurfaceOpen({
  className = "",
  id,
  label,
  load,
  methods = [],
  onClose = () => {},
  open,
  type = "sheet",
}) {
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
