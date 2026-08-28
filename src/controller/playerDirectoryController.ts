import { TAIPEI_CITY_BOUNDS } from "../config.ts";
import { cloneBounds, validBounds } from "../features/discovery/discoveryFeature.ts";
import { profileIsReady, profileMeetsGate } from "../features/profile-auth/profileAuthFeature.ts";
import {
  groupPlayersByCourt,
  playerDirectoryRows,
  selectInvitableSessions,
} from "../features/player-directory/playerDirectoryFeature.ts";

import type {
  ControllerAuthSnapshot,
  ControllerEventName,
  ControllerIdentifier,
  ControllerPlayer,
  ControllerPlayerGroup,
  ControllerProfileGate,
  ControllerRequestGate,
  ControllerSurfaceHandle,
  SessionControllerState,
} from "../controllerContracts.ts";
// eslint-disable-next-line no-restricted-imports -- controller 既有 directory 型別尚無 facade type export。
import type { DataCourt, PlayerDirectoryEntry, PlayerPresenceDirectoryEntry } from "../data/mappers/profileMappers.ts";
// eslint-disable-next-line no-restricted-imports -- controller 既有 bounds 型別尚無 facade type export。
import type { MapBounds } from "../data/mappers/queryMappers.ts";
import type { MySessionSummary, SessionSummary, SurfaceCloseOptions } from "../domainTypes.ts";
import type { Store } from "../sessionStore.ts";
import type { SurfaceRegistry } from "./surfaceRegistry.ts";

interface CapturingRequestGate extends ControllerRequestGate {
  capture(isCurrent?: () => boolean): { isStale(): boolean };
}

interface PlayerDataApi {
  inviteToSession?(sessionId: ControllerIdentifier, profileId: ControllerIdentifier): Promise<unknown>;
  loadPlayerDirectory?(): Promise<unknown>;
  loadPlayerPresenceDirectory?(input?: { bounds: MapBounds }): Promise<unknown>;
}

interface MutationResult {
  outcome?: unknown;
  reloadRequired?: unknown;
}

interface PlayerDirectoryControllerDependencies {
  api: PlayerDataApi;
  captureAuthSnapshot: () => ControllerAuthSnapshot;
  isCurrentAuthSnapshot: (snapshot: ControllerAuthSnapshot) => boolean;
  openCourtDrawer: (
    court: DataCourt,
    sessions: SessionSummary[],
    handlers: { courts: DataCourt[]; onOpenSession(sessionId: ControllerIdentifier): unknown }
  ) => ControllerSurfaceHandle | null | undefined;
  openCourtPlayersDrawer: (
    court: DataCourt,
    players: ControllerPlayer[],
    handlers: { onClose(): void; onOpenPlayer(player: ControllerPlayer): unknown }
  ) => ControllerSurfaceHandle | null | undefined;
  openCreateIntent: () => void;
  openPlayerCard: (
    player: ControllerPlayer | PlayerDirectoryEntry,
    handlers: {
      courts: DataCourt[];
      myInvitableSessions: MySessionSummary[];
      onClose(): void;
      onCreate(): void;
      onInvite(sessionId: ControllerIdentifier): Promise<unknown>;
      onSeeDirectory(): unknown;
    }
  ) => ControllerSurfaceHandle | null | undefined;
  openPlayerDirectoryList: (handlers: {
    onClose(): void;
    onOpenPlayer(player: PlayerDirectoryEntry): unknown;
    onRetry(): Promise<boolean>;
  }) => ControllerSurfaceHandle | null | undefined;
  openSessionById: (sessionId: ControllerIdentifier) => unknown;
  playerCardGate: CapturingRequestGate;
  playerDirectoryGate: ControllerRequestGate;
  playerGate: ControllerRequestGate;
  publish: () => void;
  reloadParticipation: (epoch: number, identity: string | null) => Promise<boolean>;
  requireSessionAction: (intent: { action: "directory" }) => Promise<boolean> | void;
  store: Store<SessionControllerState, ControllerEventName>;
  surfaceRegistry: SurfaceRegistry;
  transitionSurfaces: (name: string, options?: SurfaceCloseOptions) => void;
  visibleSessions: () => SessionSummary[];
}

export interface PlayerDirectoryController {
  clearPlayerDirectory: (options?: { closeReason?: string }) => void;
  clearPlayerLayer: (options?: { closeReason?: string; turnOff?: boolean }) => void;
  getPlayerGroups: () => ControllerPlayerGroup[];
  loadPlayerDirectoryList: () => Promise<boolean>;
  loadPlayers: (bounds?: MapBounds) => Promise<boolean>;
  openCourt: (court: DataCourt, onlySessions?: SessionSummary[] | null) => void;
  openPlayerCourt: (
    court: DataCourt,
    onlyPlayers?: ControllerPlayer[] | null
  ) => ControllerSurfaceHandle | null | undefined;
  openPlayerDirectory: () => Promise<boolean> | void;
}

function mutationResult(value: unknown): MutationResult {
  return typeof value === "object" && value !== null ? value : {};
}

/** Owns the reciprocal presence layer, player directory, and player surfaces. */
export function createPlayerDirectoryController({
  api,
  captureAuthSnapshot,
  isCurrentAuthSnapshot,
  openCourtDrawer,
  openCourtPlayersDrawer,
  openCreateIntent,
  openPlayerCard,
  openPlayerDirectoryList,
  openSessionById,
  playerCardGate,
  playerDirectoryGate,
  playerGate,
  publish,
  reloadParticipation,
  requireSessionAction,
  store,
  surfaceRegistry,
  transitionSurfaces,
  visibleSessions,
}: PlayerDirectoryControllerDependencies): PlayerDirectoryController {
  const read = store.getState;

  function playerGroups(): ControllerPlayerGroup[] {
    return groupPlayersByCourt(read().players);
  }

  function clearPlayerDirectory({ closeReason = "player-directory-clear" } = {}): void {
    playerDirectoryGate.invalidate();
    transitionSurfaces("clearPlayerDirectory", { reason: closeReason, restoreFocus: false });
  }

  function clearPlayerLayer({ turnOff = true, closeReason = "player-layer-clear" } = {}): void {
    playerGate.invalidate();
    transitionSurfaces("clearPlayerLayer", { reason: closeReason, restoreFocus: false });
    if (turnOff) store.setState({ playerLayerOn: false });
    store.setState({ players: [], playerLayerStatus: "idle", playerLayerMessage: "" });
  }

  async function loadPlayers(bounds = read().bounds): Promise<boolean> {
    if (!read().playerLayerOn || !read().authSession || !profileMeetsGate(read().profileEligibility, "ntrp")) {
      return false;
    }
    const nextBounds = validBounds(bounds) ? cloneBounds(bounds) : cloneBounds(TAIPEI_CITY_BOUNDS);
    const authSnapshot = captureAuthSnapshot();
    const request = playerGate.issue(
      () =>
        read().playerLayerOn &&
        profileMeetsGate(read().profileEligibility, "ntrp") &&
        isCurrentAuthSnapshot(authSnapshot)
    );
    transitionSurfaces("clearPlayerLayer", { reason: "player-refresh", restoreFocus: false });
    store.setState({ players: [], playerLayerStatus: "loading", playerLayerMessage: "正在載入在線球友…" });
    publish();
    try {
      const presence =
        typeof api.loadPlayerPresenceDirectory === "function"
          ? await api.loadPlayerPresenceDirectory({ bounds: nextBounds })
          : [];
      if (request.isStale()) return false;
      store.setState({
        players: (Array.isArray(presence) ? (presence as PlayerPresenceDirectoryEntry[]) : []).map((player) => ({
          ...player,
          isPresent: true,
        })),
        playerLayerStatus: "ready",
        playerLayerMessage: "",
      });
      publish();
      return true;
    } catch {
      if (request.isStale()) return false;
      store.setState({ players: [], playerLayerStatus: "error", playerLayerMessage: "在線資料暫時無法載入。" });
      publish();
      return false;
    }
  }

  function invitableSessions(now = Date.now()): MySessionSummary[] {
    return selectInvitableSessions(read().mySessions, now);
  }

  function openPlayer(
    player: ControllerPlayer | PlayerDirectoryEntry,
    { gateLevel = "ntrp", requiresLayer = true }: { gateLevel?: ControllerProfileGate; requiresLayer?: boolean } = {}
  ): ControllerSurfaceHandle | null | undefined {
    if (
      (requiresLayer && !read().playerLayerOn) ||
      !read().authSession ||
      !profileMeetsGate(read().profileEligibility, gateLevel)
    ) {
      return null;
    }
    transitionSurfaces("openPlayer");
    const openedAuth = captureAuthSnapshot();
    let card: ControllerSurfaceHandle | null | undefined = null;
    const request = playerCardGate.capture(
      () =>
        surfaceRegistry.is("playerCard", card) &&
        (!requiresLayer || read().playerLayerOn) &&
        profileMeetsGate(read().profileEligibility, gateLevel) &&
        profileMeetsGate(read().profileEligibility, "ntrp") &&
        isCurrentAuthSnapshot(openedAuth)
    );
    card = openPlayerCard(player, {
      courts: read().courts,
      myInvitableSessions: invitableSessions(),
      onClose: () => {
        surfaceRegistry.release("playerCard", card);
      },
      onSeeDirectory: () => openPlayerDirectory(),
      onCreate: () => {
        if (surfaceRegistry.is("playerCard", card)) transitionSurfaces("openCreate");
        openCreateIntent();
      },
      onInvite: async (sessionId) => {
        const target = invitableSessions().find((session) => String(session.sessionId) === String(sessionId));
        if (request.isStale()) throw new Error("登入狀態已變更，請重新開啟球友卡。");
        if (!target) throw new Error("這個球局目前無法邀請球友。");
        if (typeof api.inviteToSession !== "function") throw new Error("這個球局目前無法邀請球友。");
        const result = await api.inviteToSession(target.sessionId, player.profileId);
        if (request.isStale()) throw new Error("登入狀態已變更，請重新開啟球友卡。");
        const outcome = mutationResult(result);
        if (outcome.reloadRequired || outcome.outcome === "SESSION_EXPIRED") {
          const refreshed = await reloadParticipation(openedAuth.epoch, openedAuth.identity);
          if (request.isStale()) throw new Error("登入狀態已變更，請重新開啟球友卡。");
          card?.setInvitableSessions?.(invitableSessions());
          if (!refreshed) throw new Error("球局狀態暫時無法重新載入，請稍後再試。");
          throw new Error("球局狀態已更新，請重新選擇可邀請的球局。");
        }
        return result;
      },
    });
    surfaceRegistry.set("playerCard", card?.close ? card : null, { gate: card?.close ? gateLevel : null });
    return card;
  }

  async function loadPlayerDirectoryList(): Promise<boolean> {
    if (!read().authSession || !profileMeetsGate(read().profileEligibility, "directory")) return false;
    const authSnapshot = captureAuthSnapshot();
    transitionSurfaces("openPlayerDirectory");
    let directory: ControllerSurfaceHandle | null | undefined = null;
    directory = openPlayerDirectoryList({
      onClose: () => {
        surfaceRegistry.release("playerDirectory", directory);
      },
      onOpenPlayer: (player) => openPlayer(player, { gateLevel: "directory", requiresLayer: false }),
      onRetry: () => loadPlayerDirectoryList(),
    });
    surfaceRegistry.set("playerDirectory", directory?.close ? directory : null);
    const request = playerDirectoryGate.issue(
      () =>
        surfaceRegistry.is("playerDirectory", directory) &&
        profileMeetsGate(read().profileEligibility, "directory") &&
        isCurrentAuthSnapshot(authSnapshot)
    );
    directory?.setDirectory?.({ players: [], status: "loading" });
    try {
      const [directoryRows, presenceRows] = await Promise.all([
        typeof api.loadPlayerDirectory === "function" ? api.loadPlayerDirectory() : [],
        typeof api.loadPlayerPresenceDirectory === "function" ? api.loadPlayerPresenceDirectory() : [],
      ]);
      if (request.isStale()) return false;
      directory?.setDirectory?.({
        players: playerDirectoryRows(
          Array.isArray(directoryRows) ? (directoryRows as PlayerDirectoryEntry[]) : [],
          Array.isArray(presenceRows) ? (presenceRows as PlayerPresenceDirectoryEntry[]) : []
        ),
        status: "ready",
      });
      return true;
    } catch {
      if (request.isStale()) return false;
      directory?.setDirectory?.({ players: [], status: "error" });
      return false;
    }
  }

  function openPlayerDirectory(): Promise<boolean> | void {
    if (
      !read().authSession ||
      !profileIsReady(read().profileEligibility, "directory") ||
      !profileMeetsGate(read().profileEligibility, "directory")
    ) {
      return requireSessionAction({ action: "directory" });
    }
    return loadPlayerDirectoryList();
  }

  function openCourt(court: DataCourt, onlySessions: SessionSummary[] | null = null): void {
    transitionSurfaces("openCourt");
    const sessions =
      onlySessions ?? visibleSessions().filter((session) => String(session.courtId) === String(court.id));
    const drawer = openCourtDrawer(court, sessions, { courts: read().courts, onOpenSession: openSessionById });
    surfaceRegistry.set("courtDrawer", drawer?.close ? drawer : null);
  }

  function openPlayerCourt(
    court: DataCourt,
    onlyPlayers: ControllerPlayer[] | null = null
  ): ControllerSurfaceHandle | null | undefined {
    if (!read().playerLayerOn || !read().authSession || !profileMeetsGate(read().profileEligibility, "ntrp")) {
      return null;
    }
    const players = onlyPlayers ?? read().players.filter((player) => String(player.courtId) === String(court.id));
    transitionSurfaces("openPlayerCourt", { restoreFocus: false });
    let drawer: ControllerSurfaceHandle | null | undefined = null;
    drawer = openCourtPlayersDrawer(court, players, {
      onClose: () => {
        surfaceRegistry.release("playerDrawer", drawer);
      },
      onOpenPlayer: (player) => openPlayer(player, { gateLevel: "ntrp", requiresLayer: true }),
    });
    surfaceRegistry.set("playerDrawer", drawer?.close ? drawer : null);
    return drawer;
  }

  return {
    clearPlayerDirectory,
    clearPlayerLayer,
    getPlayerGroups: playerGroups,
    loadPlayerDirectoryList,
    loadPlayers,
    openCourt,
    openPlayerCourt,
    openPlayerDirectory,
  };
}
