import { createRequestGate } from "../../requestGate.ts";

import type {
  BlockedPlayersFacade,
  BlockedPlayersSnapshot,
  ControllerAuthSnapshot,
} from "../../controllerContracts.ts";

type BlockedPlayer = BlockedPlayersSnapshot["blockedPlayers"][number];

interface BlockedPlayersDataApi {
  loadMyPlayerBlocks?(): Promise<unknown>;
}

interface BlockedPlayersFacadeDependencies {
  api?: BlockedPlayersDataApi;
  captureAuthSnapshot: () => ControllerAuthSnapshot;
  isCurrentAuthSnapshot: (snapshot: ControllerAuthSnapshot) => boolean;
}

const EMPTY_SNAPSHOT: Readonly<BlockedPlayersSnapshot> = Object.freeze({
  blockedPlayers: Object.freeze([]) as unknown as BlockedPlayer[],
  blockedPlayersError: "",
  blockedPlayersStatus: "idle",
});

/** Owns the blocked-player query state and its latest-request/account boundary. */
export function createBlockedPlayersFacade({
  api,
  captureAuthSnapshot,
  isCurrentAuthSnapshot,
}: BlockedPlayersFacadeDependencies): BlockedPlayersFacade {
  const requestGate = createRequestGate();
  const listeners = new Set<(snapshot: Readonly<BlockedPlayersSnapshot>) => void>();
  let snapshot = EMPTY_SNAPSHOT;

  function publish(next: BlockedPlayersSnapshot): void {
    snapshot = Object.freeze({
      ...next,
      blockedPlayers: Object.freeze([...next.blockedPlayers]) as unknown as BlockedPlayer[],
    });
    for (const listener of [...listeners]) listener(snapshot);
  }

  function getSnapshot(): Readonly<BlockedPlayersSnapshot> {
    return snapshot;
  }

  function subscribe(listener: (snapshot: Readonly<BlockedPlayersSnapshot>) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function clearForAccountChange(): void {
    requestGate.invalidate();
    publish({ blockedPlayers: [], blockedPlayersError: "", blockedPlayersStatus: "idle" });
  }

  async function load(authSnapshot = captureAuthSnapshot()): Promise<boolean> {
    if (!isCurrentAuthSnapshot(authSnapshot)) return false;
    if (typeof api?.loadMyPlayerBlocks !== "function") return true;
    const request = requestGate.issue(() => isCurrentAuthSnapshot(authSnapshot));
    publish({
      blockedPlayers: snapshot.blockedPlayers,
      blockedPlayersError: "",
      blockedPlayersStatus: "loading",
    });
    try {
      const rows = await api.loadMyPlayerBlocks();
      if (request.isStale()) return false;
      publish({
        blockedPlayers: Array.isArray(rows) ? (rows as BlockedPlayer[]) : [],
        blockedPlayersError: "",
        blockedPlayersStatus: "ready",
      });
      return true;
    } catch {
      if (request.isStale()) return false;
      publish({
        blockedPlayers: snapshot.blockedPlayers,
        blockedPlayersError: "封鎖清單暫時無法載入。",
        blockedPlayersStatus: "error",
      });
      return false;
    }
  }

  function refresh(authSnapshot = captureAuthSnapshot()): Promise<boolean> {
    return load(authSnapshot);
  }

  return { clearForAccountChange, getSnapshot, load, refresh, subscribe };
}
