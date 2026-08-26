import { createRoot, type Root } from "react-dom/client";

import { AppServicesProvider } from "../../src/app/AppServicesProvider.tsx";
import type {
  ControllerApi,
  ControllerMySessionGroups,
  SessionControllerState,
} from "../../src/controllerContracts.ts";
import type { CourtSummary, MySessionSummary, SessionRosterEntry } from "../../src/domainTypes.ts";
import { MySessionsPage, type MySessionsPageOptions } from "../../src/pages/MySessionsPage.tsx";
import type { PageViewStore } from "../../src/pageViewStore.ts";
import { createStore } from "../../src/sessionStore.ts";
import { syncCommit } from "../../src/syncCommit.ts";

interface MySessionsHarnessOptions extends MySessionsPageOptions {
  actionScopeKey?: unknown;
  authenticated?: boolean;
  courts?: CourtSummary[] | null;
  errorMessage?: string;
  groups?: Partial<ControllerMySessionGroups> | null;
  onAccept?(sessionId?: string, participantId?: string): unknown;
  onAcceptInvite?(sessionId?: string): unknown;
  onCancel?(sessionId?: string): unknown;
  onConfirmAttendance?(sessionId?: string): unknown;
  onCreateSession?(): unknown;
  onDecline?(sessionId?: string, participantId?: string): unknown;
  onDeclineInvite?(sessionId?: string): unknown;
  onDecide?(sessionId?: string): unknown;
  onEdit?(sessionId?: string): unknown;
  onMarkPlayed?(sessionId?: string): unknown;
  onOpenChat?(sessionId?: string): unknown;
  onOpenSession?(sessionId?: string): unknown;
  onRefresh?(): unknown;
  onReportParticipant?(sessionId?: string, profileId?: string): unknown;
  onReportSession?(sessionId?: string): unknown;
  onWithdraw?(sessionId?: string): unknown;
  pageViewStore?: PageViewStore;
  status?: string;
  sessionStore?: ControllerApi["sessionStore"];
}

export interface MySessionsAppHarness {
  root: Root;
  rootElement: HTMLElement;
  sessionStore: ControllerApi["sessionStore"];
  unmount(): void;
  update(options?: MySessionsHarnessOptions): void;
}

const harnesses = new WeakMap<HTMLElement, MySessionsAppHarness>();
const actionScopeKeys = new Map<unknown, number>();

function actionScopeEpoch(key: unknown): number {
  if (typeof key === "number") return key;
  if (!actionScopeKeys.has(key)) actionScopeKeys.set(key, actionScopeKeys.size + 1);
  return actionScopeKeys.get(key) ?? 1;
}

function sessionsFromGroups(groups: Partial<ControllerMySessionGroups> | null | undefined): {
  mySessionRosters: Map<string, SessionRosterEntry[]>;
  mySessions: MySessionSummary[];
} {
  const sessions = new Map<string, MySessionSummary>();
  const mySessionRosters = new Map<string, SessionRosterEntry[]>();
  const addSession = (session: Partial<MySessionSummary> | null | undefined, additions = {}) => {
    if (session?.sessionId == null) return;
    const key = String(session.sessionId);
    sessions.set(key, { ...(sessions.get(key) ?? {}), ...session, ...additions } as MySessionSummary);
  };

  for (const session of groups?.history ?? []) addSession(session);
  for (const session of groups?.upcoming ?? []) addSession(session);
  for (const entry of groups?.needsAction ?? []) {
    if (entry.kind === "host-request") {
      addSession(entry.session, {
        canCancel: entry.session.canCancel ?? true,
        status: entry.session.status ?? "open",
        viewerParticipantStatus: entry.session.viewerParticipantStatus ?? "accepted",
        viewerRole: entry.session.viewerRole ?? "host",
      });
      const key = String(entry.session.sessionId);
      mySessionRosters.set(key, [
        ...(mySessionRosters.get(key) ?? []),
        { role: "guest", status: "requested", ...entry.participant },
      ]);
      continue;
    }
    if (entry.kind === "invite") {
      addSession(entry.session, {
        canRespondInvite: entry.session.canRespondInvite ?? true,
        viewerParticipantStatus: "invited",
        viewerRole: "guest",
      });
      continue;
    }
    addSession(entry.session, {
      canWithdraw: entry.session.canWithdraw ?? true,
      viewerParticipantStatus: "requested",
      viewerRole: "guest",
    });
  }
  return { mySessionRosters, mySessions: [...sessions.values()] };
}

function createMySessionsHarnessState(options: MySessionsHarnessOptions): SessionControllerState {
  const { mySessionRosters, mySessions } = sessionsFromGroups(options.groups);
  return {
    authEpoch: actionScopeEpoch(options.actionScopeKey),
    authSession: options.authenticated === false ? null : { user: { id: "my-sessions-harness-user" } },
    blockedPlayers: [],
    blockedPlayersError: "",
    blockedPlayersStatus: "idle",
    bounds: { east: 121.7, north: 25.2, south: 24.9, west: 121.4 },
    courts: options.courts ?? [],
    courtsReady: true,
    discoveryMessage: "",
    discoveryStatus: "idle",
    drawerState: "collapsed",
    filters: { band: "all", dateKey: null, districts: new Set(), instantOnly: false, types: new Set() },
    locationBlocked: false,
    locationMessage: "",
    mapUnavailable: false,
    mySessionRosters,
    mySessions,
    mySessionsError: options.errorMessage ?? "",
    mySessionsStatus: (options.status ?? "ready") as SessionControllerState["mySessionsStatus"],
    playerLayerMessage: "",
    playerLayerOn: false,
    playerLayerStatus: "idle",
    players: [],
    profile: null,
    profileEligibility: { directory: true, isPublic: true, nickname: true, ntrp: true, status: "ready" },
    sessions: [],
    userLocation: null,
  };
}

function scheduleCreatedSessionFocus(
  rootElement: HTMLElement,
  options: MySessionsHarnessOptions,
  commit: Parameters<NonNullable<MySessionsPageOptions["onCreatedSessionCommit"]>>[0]
): void {
  const focusSessionId = commit.highlightSessionId ?? commit.createdSessionId;
  const focusInUpcoming = commit.groups.upcoming?.some(
    (session) => String(session.sessionId) === String(focusSessionId)
  );
  const focusInNeedsAction = commit.groups.needsAction?.some(
    (entry) => entry.kind === "guest-request" && String(entry.session.sessionId) === String(focusSessionId)
  );
  if (!focusSessionId || (!focusInUpcoming && !focusInNeedsAction)) return;
  requestAnimationFrame(() => {
    const target = rootElement.querySelector<HTMLElement>(
      "[data-created-session] [data-open-my-session], [data-created-session] [data-my-action='withdraw']"
    );
    if (!target || options.onCreatedSessionFocus?.(focusSessionId) === false) return;
    target.focus({ preventScroll: true });
  });
}

function remainingPageOptions(options: MySessionsHarnessOptions, rootElement: HTMLElement): MySessionsPageOptions {
  return {
    createdSessionId: options.createdSessionId,
    highlightSessionId: options.highlightSessionId,
    notificationSettings: options.notificationSettings,
    onBack: options.onBack,
    onCreatedSessionCommit:
      options.onCreatedSessionCommit ?? ((commit) => scheduleCreatedSessionFocus(rootElement, options, commit)),
    onCreatedSessionFocus: options.onCreatedSessionFocus,
    onEnablePush: options.onEnablePush,
    onSignIn: options.onSignIn,
    onStoreCommit: options.onStoreCommit,
    pageViewStore: options.pageViewStore,
  };
}

function replaceAppOwnedRoot(rootElement: HTMLElement): HTMLElement {
  if (rootElement.id !== "my-sessions-root" || !rootElement.parentElement) return rootElement;
  const replacement = rootElement.cloneNode(false) as HTMLElement;
  rootElement.replaceWith(replacement);
  return replacement;
}

export function mountMySessionsAppHarness(
  requestedRoot: HTMLElement,
  initialOptions: MySessionsHarnessOptions = {}
): MySessionsAppHarness {
  const existing = harnesses.get(requestedRoot);
  if (existing) {
    existing.update(initialOptions);
    return existing;
  }

  const rootElement = replaceAppOwnedRoot(requestedRoot);
  let options = initialOptions;
  const ownsSessionStore = !options.sessionStore;
  const sessionStore = options.sessionStore ?? createStore(createMySessionsHarnessState(options));
  const controller = {
    cancelMySession: (sessionId: string) => options.onCancel?.(sessionId),
    confirmMySessionAttendance: (sessionId: string) => options.onConfirmAttendance?.(sessionId),
    markMySessionPlayed: (sessionId: string) => options.onMarkPlayed?.(sessionId),
    openCreateIntent: () => options.onCreateSession?.(),
    openRosterParticipantReport: (sessionId: string, profileId: string) =>
      options.onReportParticipant?.(sessionId, profileId),
    openSession: (sessionId: string) => options.onOpenSession?.(sessionId),
    openSessionChat: (sessionId: string) => options.onOpenChat?.(sessionId),
    openSessionDecision: (sessionId: string) => options.onDecide?.(sessionId),
    openSessionEdit: (sessionId: string) => options.onEdit?.(sessionId),
    openSessionReport: (sessionId: string) => options.onReportSession?.(sessionId),
    refreshMySessions: () => options.onRefresh?.(),
    respondInvite: (sessionId: string, decision: "accepted" | "declined") =>
      (decision === "accepted" ? options.onAcceptInvite : options.onDeclineInvite)?.(sessionId),
    reviewMySessionParticipant: (sessionId: string, participantId: string, decision: "accepted" | "declined") =>
      (decision === "accepted" ? options.onAccept : options.onDecline)?.(sessionId, participantId),
    sessionStore,
    withdrawMySession: (sessionId: string) => options.onWithdraw?.(sessionId),
  } as unknown as ControllerApi;
  const root = createRoot(rootElement);

  const render = () => {
    const pageOptions = remainingPageOptions(options, rootElement);
    syncCommit(() => {
      root.render(
        <AppServicesProvider controller={controller}>
          <MySessionsPage {...pageOptions} rootElement={rootElement} />
        </AppServicesProvider>
      );
    });
  };

  const harness: MySessionsAppHarness = {
    root,
    rootElement,
    sessionStore,
    unmount: () => root.unmount(),
    update(nextOptions = {}) {
      options = nextOptions;
      if (ownsSessionStore) sessionStore.setState(createMySessionsHarnessState(options));
      render();
      if (ownsSessionStore) {
        sessionStore.emit("mySessions");
        sessionStore.emit("courts");
      }
    },
  };
  harnesses.set(requestedRoot, harness);
  harnesses.set(rootElement, harness);
  render();
  return harness;
}

export function renderMySessionsAppHarness(
  rootElement: HTMLElement,
  options: MySessionsHarnessOptions = {}
): MySessionsAppHarness {
  return mountMySessionsAppHarness(rootElement, options);
}
