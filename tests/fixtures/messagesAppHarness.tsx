import { createRoot, type Root } from "react-dom/client";

import { AppServicesProvider } from "../../src/app/AppServicesProvider.tsx";
import type { ControllerApi, SessionControllerState } from "../../src/controllerContracts.ts";
import type { CourtSummary, MySessionSummary } from "../../src/domainTypes.ts";
import { MessagesPage } from "../../src/pages/MessagesPage.tsx";
import { createStore } from "../../src/sessionStore.ts";

interface MessagesHarnessOptions {
  courts?: CourtSummary[];
  mySessions?: MySessionSummary[];
  onOpenChat?(sessionId: string, sessionStore: ControllerApi["sessionStore"]): void;
}

interface MessagesHarness {
  root: Root;
  sessionStore: ControllerApi["sessionStore"];
  unmount(): void;
}

function createMessagesHarnessState({ courts = [], mySessions = [] }: MessagesHarnessOptions): SessionControllerState {
  return {
    authEpoch: 1,
    authSession: { user: { id: "messages-harness-user" } },
    blockedPlayers: [],
    blockedPlayersError: "",
    blockedPlayersStatus: "idle",
    bounds: { east: 121.7, north: 25.2, south: 24.9, west: 121.4 },
    courts,
    courtsReady: true,
    discoveryMessage: "",
    discoveryStatus: "idle",
    drawerState: "collapsed",
    filters: { band: "all", dateKey: null, districts: new Set(), instantOnly: false, types: new Set() },
    locationBlocked: false,
    locationMessage: "",
    mapUnavailable: false,
    mySessionRosters: new Map(),
    mySessions,
    mySessionsError: "",
    mySessionsStatus: "ready",
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

export function mountMessagesAppHarness(
  rootElement: HTMLElement,
  options: MessagesHarnessOptions = {}
): MessagesHarness {
  const sessionStore = createStore(createMessagesHarnessState(options));
  const controller = {
    openSessionChat: (sessionId: string) => options.onOpenChat?.(sessionId, sessionStore),
    sessionStore,
  } as ControllerApi;
  const root = createRoot(rootElement);
  root.render(
    <AppServicesProvider controller={controller}>
      <MessagesPage />
    </AppServicesProvider>
  );
  return { root, sessionStore, unmount: () => root.unmount() } as MessagesHarness;
}
