import type {
  ChatMessage,
  MySessionSummary,
  Profile,
  SessionRosterEntry,
  SessionSummary,
  SurfaceCloseOptions,
  SurfaceLoadStatus,
} from "./domainTypes.ts";
// eslint-disable-next-line no-restricted-imports -- 既有 controller contract 純型別尚無可由 JavaScript facade 匯出的 type barrel。
import type { DataCourt, MyPlayerBlock, PlayerPresenceDirectoryEntry } from "./data/mappers/profileMappers.ts";
// eslint-disable-next-line no-restricted-imports -- 既有地圖 bounds 純型別尚無可由 JavaScript facade 匯出的 type barrel。
import type { MapBounds } from "./data/mappers/queryMappers.ts";
import type { Store } from "./sessionStore.ts";

export type ControllerIdentifier = number | string | null | undefined;
export type ControllerCallbackResult = unknown | Promise<unknown>;
export type ControllerDrawerState = "collapsed" | "open";
export type ControllerProfileGate = "directory" | "nickname" | "ntrp";

export interface ControllerCoordinates {
  lat: number;
  lng: number;
}

export interface ControllerFilters {
  band: string;
  dateKey: string | null;
  districts: Set<string>;
  instantOnly: boolean;
  types: Set<string>;
}

export interface ControllerAuthSession {
  access_token?: string | null;
  user?: { id?: string | null } | null;
}

/** `main.js/currentProfileEligibility()` 的實際輸出，不是完整私人 Profile。 */
export interface ControllerProfileEligibility {
  directory?: boolean;
  directoryStatus?: SurfaceLoadStatus;
  isPublic?: boolean;
  nickname?: boolean;
  ntrp?: boolean;
  ntrpValue?: number | null;
  status?: SurfaceLoadStatus;
}

export interface ControllerPlayer extends PlayerPresenceDirectoryEntry {
  isPresent: boolean;
}

export interface ControllerAppState {
  authSession: ControllerAuthSession | null;
  courts: DataCourt[];
  courtsReady: boolean;
  profile: Partial<Profile> | null;
}

/** `sessionController.js` 唯一 `createStore({...})` 的 27 個初始欄位。 */
export interface SessionControllerState {
  authEpoch: number;
  authSession: ControllerAuthSession | null;
  blockedPlayers: MyPlayerBlock[];
  blockedPlayersError: string;
  blockedPlayersStatus: SurfaceLoadStatus;
  bounds: MapBounds;
  courts: DataCourt[];
  courtsReady: boolean;
  discoveryMessage: string;
  discoveryStatus: SurfaceLoadStatus;
  drawerState: ControllerDrawerState;
  filters: ControllerFilters;
  locationBlocked: boolean;
  locationMessage: string;
  mapUnavailable: boolean;
  mySessionRosters: Map<string, SessionRosterEntry[]>;
  mySessions: MySessionSummary[];
  mySessionsError: string;
  mySessionsStatus: SurfaceLoadStatus;
  playerLayerMessage: string;
  playerLayerOn: boolean;
  playerLayerStatus: SurfaceLoadStatus;
  players: ControllerPlayer[];
  profile: Partial<Profile> | null;
  profileEligibility: ControllerProfileEligibility | null;
  sessions: SessionSummary[];
  userLocation: ControllerCoordinates | null;
}

export interface ControllerSessionWithRequests extends MySessionSummary {
  pendingRequests: SessionRosterEntry[];
}

export type ControllerMySessionAction =
  | { kind: "host-request"; participant: SessionRosterEntry; session: ControllerSessionWithRequests }
  | { kind: "guest-request" | "invite"; session: ControllerSessionWithRequests };

export interface ControllerMySessionGroups {
  hasUnread: boolean;
  history: ControllerSessionWithRequests[];
  needsAction: ControllerMySessionAction[];
  needsActionCount: number;
  upcoming: ControllerSessionWithRequests[];
}

export interface ControllerMySessionsViewState {
  authenticated: boolean;
  blockedPlayers: MyPlayerBlock[];
  blockedPlayersError: string;
  blockedPlayersStatus: SurfaceLoadStatus;
  error: string;
  groups: ControllerMySessionGroups;
  isPublic: boolean;
  status: SurfaceLoadStatus;
  viewGeneration: number;
}

export interface ControllerPlayerGroup {
  court: {
    district: string;
    id: ControllerIdentifier;
    lat: number;
    lng: number;
    name: string;
  };
  players: ControllerPlayer[];
  presenceCount: number;
}

export interface ControllerPlayerLayerViewState {
  groups: ControllerPlayerGroup[];
  message: string;
  on: boolean;
  status: SurfaceLoadStatus;
}

export interface ControllerMapStatus {
  kind: "error" | "idle" | "loading" | "warning";
  message: string;
}

export interface ControllerMapViewPayload {
  courts: DataCourt[];
  drawerState: ControllerDrawerState;
  filters: ControllerFilters;
  hasUserLocation: boolean;
  locationMessage: string;
  mapStatus: ControllerMapStatus;
  sessions: SessionSummary[];
}

export interface ControllerCourtsViewPayload {
  courts: DataCourt[];
  ready: boolean;
}

/**
 * `store.emit()` 的完整 channel 集合。Store listener 實際收到同一份唯讀 state；
 * 各 listener 再投影成上面的 view payload，沒有隱藏的第四種事件。
 */
export interface ControllerStoreEventPayloads {
  courts: Readonly<SessionControllerState>;
  map: Readonly<SessionControllerState>;
  me: Readonly<SessionControllerState>;
  mySessions: Readonly<SessionControllerState>;
}

export type ControllerEventName = keyof ControllerStoreEventPayloads;

export type ControllerPendingIntent =
  { action: "create" | "directory" | "players" | "visibility" } | { action: "join"; sessionId: number };

export interface ControllerAuthSnapshot {
  epoch: number;
  identity: string | null;
}

export interface ControllerRequestGate {
  invalidate(): void;
  issue(isCurrent?: () => boolean): { isStale(): boolean };
}

export interface ControllerPoller {
  stop(): void;
}

/** Imperative surface 的共同現況；不同 surface 只實作自己需要的命令。 */
export interface ControllerSurfaceHandle {
  close(options?: SurfaceCloseOptions): void;
  enterConfirming?(options?: { expectedAccepted?: boolean }): void;
  setArchived?(message?: string): void;
  setContent?(...values: unknown[]): void;
  setCourts?(courts: DataCourt[], options?: { ready?: boolean }): void;
  setDirectory?(value: unknown): void;
  setInvitableSessions?(sessions?: MySessionSummary[] | null): void;
  setJoinPreview?(value: unknown): void;
  setState?(value: unknown): void;
  setTerminal?(message: string): void;
}

export interface ControllerChatSurfaceContext {
  authSnapshot: ControllerAuthSnapshot;
  lastMarkedMessageId: number | null;
  messages: ChatMessage[];
  poller: ControllerPoller | null;
  requestGate: ControllerRequestGate;
  roster: SessionRosterEntry[];
  session: MySessionSummary;
  sheet: ControllerSurfaceHandle | null | undefined;
}

export type ControllerSurfaceName =
  | "chat"
  | "courtDrawer"
  | "createSession"
  | "decisionSession"
  | "detail"
  | "editSession"
  | "playerCard"
  | "playerDirectory"
  | "playerDrawer"
  | "profilePrompt"
  | "reportDialog";

/** `createSurfaceRegistry()` 各 entry 的實際 handle 與 metadata。 */
export interface ControllerSurfaceContextMap {
  chat: { handle: ControllerChatSurfaceContext | null };
  courtDrawer: { handle: ControllerSurfaceHandle | null };
  createSession: { handle: ControllerSurfaceHandle | null };
  decisionSession: { handle: ControllerSurfaceHandle | null };
  detail: {
    actionKey: string | null;
    confirmingAuth: ControllerAuthSnapshot | null;
    handle: ControllerSurfaceHandle | null;
    session: SessionSummary | null;
  };
  editSession: { handle: ControllerSurfaceHandle | null };
  playerCard: { gate: ControllerProfileGate | null; handle: ControllerSurfaceHandle | null };
  playerDirectory: { handle: ControllerSurfaceHandle | null };
  playerDrawer: { handle: ControllerSurfaceHandle | null };
  profilePrompt: { handle: ControllerSurfaceHandle | null; intent: ControllerPendingIntent | null };
  reportDialog: { handle: ControllerSurfaceHandle | null };
}

export type ControllerSurfaceContext<Name extends ControllerSurfaceName> = ControllerSurfaceContextMap[Name];

export interface ControllerOpenSessionResult {
  session?: SessionSummary;
  status: "opened" | "unavailable";
}

type ControllerDiscoveryResult = Promise<boolean | void>;
type ControllerSurfaceResult = ControllerSurfaceHandle | null | undefined | void;

/** `createSessionController()` return object 的公開方法，名稱與同步／非同步邊界照現況。 */
export interface ControllerApi {
  attachMap(map: unknown): void;
  cancelMySession(sessionId: ControllerIdentifier): Promise<unknown>;
  capturePendingIntentVersion(): number;
  clearPendingIntent(): boolean;
  clearPendingIntentIfUnchanged(version: number): boolean;
  confirmMySessionAttendance(sessionId: ControllerIdentifier): Promise<unknown>;
  expandBounds(): ControllerDiscoveryResult | void;
  getAppState(): ControllerAppState;
  getMySessionGroups(): ControllerMySessionGroups;
  getMySessions(): MySessionSummary[];
  getMySessionState(): ControllerMySessionsViewState;
  getPlayerLayerState(): ControllerPlayerLayerViewState;
  getVisibleSessions(): SessionSummary[];
  loadDiscovery(bounds?: MapBounds | null): ControllerDiscoveryResult;
  markMySessionPlayed(sessionId: ControllerIdentifier): Promise<unknown>;
  openCourt(court: DataCourt, onlySessions?: SessionSummary[] | null): void;
  openCreateIntent(): void;
  openPlayerCourt(court: DataCourt, onlyPlayers?: ControllerPlayer[] | null): ControllerSurfaceResult;
  openPlayerDirectory(): Promise<boolean> | void;
  openRosterParticipantReport(
    sessionId: ControllerIdentifier,
    profileId: ControllerIdentifier
  ): ControllerSurfaceResult;
  openSession(sessionId: ControllerIdentifier): ControllerSurfaceResult;
  openSessionChat(sessionId: ControllerIdentifier): ControllerSurfaceResult;
  openSessionDecision(sessionId: ControllerIdentifier): Promise<ControllerSurfaceResult>;
  openSessionEdit(sessionId: ControllerIdentifier): ControllerSurfaceResult;
  openSessionFromLink(sessionId: ControllerIdentifier): Promise<ControllerOpenSessionResult>;
  openSessionReport(sessionId: ControllerIdentifier): ControllerSurfaceResult;
  refreshMyPlayerBlocks(): Promise<boolean>;
  refreshMySessions(): Promise<boolean>;
  requestCurrentLocation(): void;
  resetFilters(): void;
  respondInvite(sessionId: ControllerIdentifier, decision: "accepted" | "declined"): Promise<unknown>;
  resumePendingIntent(): Promise<boolean>;
  retryDiscovery(): ControllerDiscoveryResult;
  reviewMySessionParticipant(
    sessionId: ControllerIdentifier,
    participantId: ControllerIdentifier,
    decision: "accepted" | "declined"
  ): Promise<unknown>;
  setAuthState(session: ControllerAuthSession | null, profile?: ControllerProfileEligibility | null): Promise<void>;
  setAuthSession(session: ControllerAuthSession | null): void;
  setCourts(courts: DataCourt[], options?: { ready?: boolean }): void;
  setDrawerState(value: ControllerDrawerState): void;
  setFilter<Key extends keyof ControllerFilters>(key: Key, value: ControllerFilters[Key]): void;
  setMapUnavailable(): void;
  setProfile(profile: Partial<Profile> | null): void;
  sessionStore: Store<SessionControllerState, ControllerEventName>;
  togglePlayerLayer(): Promise<boolean> | void;
  togglePlayerVisibility(): Promise<void> | void;
  unblockPlayer(profileId: ControllerIdentifier): Promise<true>;
  withdrawMySession(sessionId: ControllerIdentifier): ControllerSurfaceResult;
}
