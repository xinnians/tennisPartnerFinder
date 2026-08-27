import { DEFAULT_FILTER_STATE } from "../filters.ts";
import { mountSheet } from "../sheets.js";

let deferSurfaceOpen;
let lazyMounts;
let preloadCourtPlayersSheet;
let preloadCourtSessionSheet;
let preloadFilterSheet;
let preloadPlayerCardSheet;
let preloadPlayerDirectorySheet;
let registerCourtPlayersContent;
let registerCourtSessionContent;
let registerFilterContent;
let registerPlayerCardContent;
let registerPlayerDirectoryContent;

/** Configure facade-owned lazy mounts and surface registration callbacks. */
export function configureDiscoverySurfaceViews(dependencies) {
  ({
    deferSurfaceOpen,
    lazyMounts,
    preloadCourtPlayersSheet,
    preloadCourtSessionSheet,
    preloadFilterSheet,
    preloadPlayerCardSheet,
    preloadPlayerDirectorySheet,
    registerCourtPlayersContent,
    registerCourtSessionContent,
    registerFilterContent,
    registerPlayerCardContent,
    registerPlayerDirectoryContent,
  } = dependencies);
}

/** Open a session-only list for the selected base court or aggregate marker. */
export function openCourtSessionDrawer(court, sessions, { courts = [], onOpenSession = () => {} } = {}) {
  if (!lazyMounts.courtSession) {
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
  const content = lazyMounts.courtSession(mounted.surface, {
    court,
    courts,
    onClose: () => mounted.close(),
    onOpenSession,
    sessions,
  });
  registerCourtSessionContent(mounted, content);
  return mounted;
}

/** Open the public player-directory rows for one court. */
export function openCourtPlayersDrawer(court, players, { onClose = () => {}, onOpenPlayer = () => {} } = {}) {
  if (!lazyMounts.courtPlayers) {
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
  const content = lazyMounts.courtPlayers(mounted.surface, {
    court,
    onClose: () => mounted.close(),
    players,
  });
  registerCourtPlayersContent(mounted, content);
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
  if (!lazyMounts.playerDirectory) {
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
  const content = lazyMounts.playerDirectory(mounted.surface, {
    onClose: () => mounted.close(),
    onOpenPlayer,
    onRetry,
  });
  registerPlayerDirectoryContent(mounted, content);
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
  if (!lazyMounts.filter) {
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
  const content = lazyMounts.filter(mounted.surface, {
    filters,
    onClose: () => mounted.close(),
    onReset,
    onSetFilter,
    resultCount,
  });
  registerFilterContent(mounted, content);
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
  if (!lazyMounts.playerCard) {
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
  const content = lazyMounts.playerCard(mounted.surface, {
    courts,
    myInvitableSessions,
    onClose: () => mounted.close(),
    onCreate,
    onInvite,
    onSeeDirectory,
    player,
    sheetRoot: mounted.root,
  });
  registerPlayerCardContent(mounted, content);
  return { ...mounted, setInvitableSessions: content.setInvitableSessions };
}
