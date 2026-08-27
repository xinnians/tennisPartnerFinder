import { isSessionFull } from "../sessionCriteria.ts";
import { selectControllerMySessionsView } from "../sessionSelectors.ts";
import { MY_SESSION_OPEN_STATUSES, terminalAction } from "../features/session-lifecycle/sessionLifecycleFeature.ts";
import {
  authSnapshotForState,
  authSnapshotIsCurrent,
  sessionIdentity,
} from "../features/profile-auth/profileAuthFeature.ts";

import type {
  ControllerAuthSnapshot,
  ControllerEventName,
  ControllerIdentifier,
  ControllerMySessionGroups,
  ControllerMySessionsViewState,
  ControllerRequestGate,
  SessionControllerState,
} from "../controllerContracts.ts";
// eslint-disable-next-line no-restricted-imports -- controller 既有 block 型別尚無 facade type export。
import type { MyPlayerBlock } from "../data/mappers/profileMappers.ts";
import type { MySessionSummary, SessionRosterEntry, SessionSummary } from "../domainTypes.ts";
import type { Store } from "../sessionStore.ts";

interface MySessionsDataApi {
  loadMyPlayerBlocks?(): Promise<unknown>;
  loadMySessions?(): Promise<unknown>;
  loadSessionRoster?(sessionId: ControllerIdentifier): Promise<unknown>;
  setPlayerBlock?(profileId: number, blocked: boolean): Promise<unknown>;
}

interface MySessionsSnapshot extends ControllerAuthSnapshot {
  mySessionsVersion: number;
}

export interface LifecycleActionToken {
  generation: number;
  key: string;
  kind: string;
}

export interface ControllerSessionAction {
  disabled?: boolean;
  expectedAccepted?: boolean;
  kind: "chat" | "full" | "join" | "terminal" | "waiting";
  label: string;
  note?: string;
  secondaryLabel?: string;
}

interface MySessionsControllerDependencies {
  api: MySessionsDataApi;
  blockedPlayerGate: ControllerRequestGate;
  onMySessionsChange(state: ControllerMySessionsViewState): void;
  participationGate: ControllerRequestGate;
  reconcileActiveChatParticipation(): void;
  reconcileActiveDetailParticipation(): void;
  rosterGate: ControllerRequestGate;
  store: Store<SessionControllerState, ControllerEventName>;
  toast(message: string): void;
}

export interface MySessionsController {
  actionFor(session: SessionSummary): ControllerSessionAction;
  beginLifecycleAction(
    kind: string,
    sessionId: ControllerIdentifier,
    authSnapshot: ControllerAuthSnapshot
  ): LifecycleActionToken | null;
  captureAuthSnapshot(): ControllerAuthSnapshot;
  currentParticipation(sessionId: ControllerIdentifier): MySessionSummary | null;
  finishLifecycleAction(token: LifecycleActionToken | null | undefined): void;
  isCurrentAuthSnapshot(snapshot: ControllerAuthSnapshot | null | undefined): boolean;
  lifecycleActionIsInFlight(sessionId: ControllerIdentifier): boolean;
  mySessionGroups(): ControllerMySessionGroups;
  notifyMySessions(): void;
  refreshMyPlayerBlocks(snapshot?: ControllerAuthSnapshot): Promise<boolean>;
  refreshMySessions(): Promise<boolean>;
  reloadParticipation(epoch?: number, identity?: string | null): Promise<boolean>;
  replaceMySessions(sessions: unknown): void;
  sessionKey(sessionId: ControllerIdentifier): string;
  unblockPlayer(profileId: ControllerIdentifier): Promise<true>;
}

/** Owns private participation reads, roster hydration, blocks, and lifecycle in-flight gates. */
export function createMySessionsController({
  api,
  blockedPlayerGate,
  onMySessionsChange,
  participationGate,
  reconcileActiveChatParticipation,
  reconcileActiveDetailParticipation,
  rosterGate,
  store,
  toast,
}: MySessionsControllerDependencies): MySessionsController {
  const read = store.getState;
  let mySessionsVersion = 0;
  let lifecycleMutationGeneration = 0;
  const inFlightLifecycleActions = new Map<string, LifecycleActionToken>();

  function captureAuthSnapshot(): ControllerAuthSnapshot {
    return authSnapshotForState(read());
  }

  function isCurrentAuthSnapshot(snapshot: ControllerAuthSnapshot | null | undefined): boolean {
    return authSnapshotIsCurrent(snapshot, read());
  }

  function currentParticipation(sessionId: ControllerIdentifier): MySessionSummary | null {
    if (!read().authSession) return null;
    return read().mySessions.find((entry) => String(entry.sessionId) === String(sessionId)) ?? null;
  }

  function sessionKey(sessionId: ControllerIdentifier): string {
    return String(sessionId);
  }

  function mySessionGroups(): ControllerMySessionGroups {
    return selectControllerMySessionsView(read()).groups;
  }

  store.subscribe("mySessions", (current) => {
    onMySessionsChange(selectControllerMySessionsView(current));
  });

  function notifyMySessions(): void {
    store.emit("mySessions");
    store.emit("me");
  }

  function replaceMySessions(sessions: unknown): void {
    store.setState({
      mySessions: Array.isArray(sessions) ? (sessions as MySessionSummary[]) : [],
      mySessionRosters: new Map(),
    });
    mySessionsVersion += 1;
  }

  function isCurrentMySessionsSnapshot(snapshot: MySessionsSnapshot): boolean {
    return isCurrentAuthSnapshot(snapshot) && snapshot.mySessionsVersion === mySessionsVersion;
  }

  function hostSessionsNeedingRoster(): MySessionSummary[] {
    return read().mySessions.filter(
      (session) =>
        String(session.viewerRole) === "host" &&
        Boolean(session.canCancel) &&
        MY_SESSION_OPEN_STATUSES.has(String(session.status ?? "").toLowerCase())
    );
  }

  async function hydrateMySessionRosters(authSnapshot = captureAuthSnapshot()): Promise<boolean> {
    if (!isCurrentAuthSnapshot(authSnapshot)) return false;
    if (typeof api.loadSessionRoster !== "function") return true;
    const snapshot: MySessionsSnapshot = { ...authSnapshot, mySessionsVersion };
    const request = rosterGate.issue(() => isCurrentMySessionsSnapshot(snapshot));
    const targets = hostSessionsNeedingRoster();
    const results = await Promise.all(
      targets.map(async (session) => {
        try {
          const roster = await api.loadSessionRoster?.(session.sessionId);
          return {
            roster: Array.isArray(roster) ? (roster as SessionRosterEntry[]) : [],
            sessionId: session.sessionId,
          };
        } catch {
          return { roster: null, sessionId: session.sessionId };
        }
      })
    );
    if (request.isStale()) return false;
    const rosters = new Map<string, SessionRosterEntry[]>();
    let failed = false;
    for (const result of results) {
      if (result.roster) rosters.set(sessionKey(result.sessionId), result.roster);
      else failed = true;
    }
    store.setState({ mySessionRosters: rosters });
    if (failed) {
      store.setState({
        mySessionsError: "待審核申請暫時無法載入，請重新整理後再試。",
        mySessionsStatus: "error",
      });
    }
    notifyMySessions();
    return !failed;
  }

  async function refreshMySessions(): Promise<boolean> {
    const authSnapshot = captureAuthSnapshot();
    if (!isCurrentAuthSnapshot(authSnapshot)) return false;
    return reloadParticipation(authSnapshot.epoch, authSnapshot.identity);
  }

  async function refreshMyPlayerBlocks(authSnapshot = captureAuthSnapshot()): Promise<boolean> {
    if (!isCurrentAuthSnapshot(authSnapshot)) return false;
    if (typeof api.loadMyPlayerBlocks !== "function") return true;
    const request = blockedPlayerGate.issue(() => isCurrentAuthSnapshot(authSnapshot));
    store.setState({ blockedPlayersStatus: "loading", blockedPlayersError: "" });
    notifyMySessions();
    try {
      const rows = await api.loadMyPlayerBlocks();
      if (request.isStale()) return false;
      store.setState({
        blockedPlayers: Array.isArray(rows) ? (rows as MyPlayerBlock[]) : [],
        blockedPlayersStatus: "ready",
      });
      notifyMySessions();
      return true;
    } catch {
      if (request.isStale()) return false;
      store.setState({ blockedPlayersError: "封鎖清單暫時無法載入。", blockedPlayersStatus: "error" });
      notifyMySessions();
      return false;
    }
  }

  async function unblockPlayer(profileId: ControllerIdentifier): Promise<true> {
    const authSnapshot = captureAuthSnapshot();
    const normalizedProfileId = Number(profileId);
    if (
      !isCurrentAuthSnapshot(authSnapshot) ||
      !Number.isSafeInteger(normalizedProfileId) ||
      normalizedProfileId <= 0
    ) {
      throw new Error("封鎖清單已更新，請重新整理後再試。");
    }
    if (!read().blockedPlayers.some((row) => Number(row.blockedProfileId) === normalizedProfileId)) {
      throw new Error("封鎖清單已更新，請重新整理後再試。");
    }
    if (typeof api.setPlayerBlock !== "function") throw new Error("目前無法更新封鎖清單。");
    await api.setPlayerBlock(normalizedProfileId, false);
    if (!isCurrentAuthSnapshot(authSnapshot)) throw new Error("登入狀態已變更，請重新整理後再試。");
    if (!(await refreshMyPlayerBlocks(authSnapshot))) {
      throw new Error("已解除封鎖，但清單暫時無法重新載入。");
    }
    toast("已解除封鎖。");
    return true;
  }

  function actionFor(session: SessionSummary): ControllerSessionAction {
    const terminal = terminalAction(session);
    if (terminal) return { label: terminal, disabled: true, kind: "terminal" };
    const participation = currentParticipation(session.sessionId);
    if (participation?.viewerParticipantStatus === "accepted") return { label: "群組聊天", kind: "chat" };
    if (participation?.viewerParticipantStatus === "requested") {
      return { label: "申請等待中", disabled: true, secondaryLabel: "撤回申請", kind: "waiting" };
    }
    if (isSessionFull(session)) return { label: "已額滿", disabled: true, kind: "full" };
    const viewerNtrp = Number(read().profileEligibility?.ntrpValue);
    const hasViewerNtrp = read().profileEligibility?.ntrpValue != null && Number.isFinite(viewerNtrp);
    if (read().authSession && !hasViewerNtrp && read().profileEligibility?.ntrp === false) {
      return {
        label: "申請加入",
        note: "尚未填寫程度；補填 NTRP 可先確認是否符合球局範圍，仍可直接送出申請。",
        kind: "join",
        expectedAccepted: false,
      };
    }
    const sessionMin = Number(session.ntrpMin);
    const sessionMax = Number(session.ntrpMax);
    const hasSessionRange =
      session.ntrpMin != null && session.ntrpMax != null && Number.isFinite(sessionMin) && Number.isFinite(sessionMax);
    if (hasViewerNtrp && hasSessionRange && (viewerNtrp < sessionMin || viewerNtrp > sessionMax)) {
      return {
        label: "申請加入",
        note: "你的 NTRP 不在球局設定的 NTRP 範圍內，仍可送出申請由主揪審核。",
        kind: "join",
        expectedAccepted: false,
      };
    }
    if (String(session.joinMode) === "instant") {
      return { label: "直接加入", kind: "join", expectedAccepted: true };
    }
    return { label: "申請加入", kind: "join", expectedAccepted: false };
  }

  function lifecycleActionKey(
    sessionId: ControllerIdentifier,
    identity = sessionIdentity(read().authSession)
  ): string | null {
    if (!identity) return null;
    return JSON.stringify([String(identity), String(sessionId)]);
  }

  function beginLifecycleAction(
    kind: string,
    sessionId: ControllerIdentifier,
    authSnapshot: ControllerAuthSnapshot
  ): LifecycleActionToken | null {
    const key = lifecycleActionKey(sessionId, authSnapshot?.identity);
    if (!key || inFlightLifecycleActions.has(key)) return null;
    const token = { generation: ++lifecycleMutationGeneration, key, kind };
    inFlightLifecycleActions.set(key, token);
    return token;
  }

  function finishLifecycleAction(token: LifecycleActionToken | null | undefined): void {
    if (token && inFlightLifecycleActions.get(token.key) === token) inFlightLifecycleActions.delete(token.key);
  }

  function lifecycleActionIsInFlight(sessionId: ControllerIdentifier): boolean {
    const key = lifecycleActionKey(sessionId);
    return Boolean(key && inFlightLifecycleActions.has(key));
  }

  async function reloadParticipation(
    epoch = read().authEpoch,
    identity = sessionIdentity(read().authSession)
  ): Promise<boolean> {
    if (!read().authSession || !identity || typeof api.loadMySessions !== "function") return false;
    const request = participationGate.issue(
      () =>
        epoch === read().authEpoch && Boolean(read().authSession) && sessionIdentity(read().authSession) === identity
    );
    store.setState({ mySessionsStatus: "loading" });
    notifyMySessions();
    try {
      const sessions = await api.loadMySessions();
      if (request.isStale()) return false;
      replaceMySessions(sessions);
      store.setState({ mySessionsError: "" });
      notifyMySessions();
      const rosterReady = await hydrateMySessionRosters({ epoch, identity });
      if (!rosterReady || request.isStale()) return false;
      store.setState({ mySessionsStatus: "ready" });
      reconcileActiveDetailParticipation();
      reconcileActiveChatParticipation();
      notifyMySessions();
      return true;
    } catch {
      if (request.isStale()) return false;
      store.setState({ mySessionsError: "我的球局暫時無法載入。", mySessionsStatus: "error" });
      notifyMySessions();
      return false;
    }
  }

  return {
    actionFor,
    beginLifecycleAction,
    captureAuthSnapshot,
    currentParticipation,
    finishLifecycleAction,
    isCurrentAuthSnapshot,
    lifecycleActionIsInFlight,
    mySessionGroups,
    notifyMySessions,
    refreshMyPlayerBlocks,
    refreshMySessions,
    reloadParticipation,
    replaceMySessions,
    sessionKey,
    unblockPlayer,
  };
}
