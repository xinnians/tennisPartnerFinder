import { createRoot, type Root } from "react-dom/client";

import { AppServicesProvider } from "../../src/app/AppServicesProvider.tsx";
import type {
  ControllerApi,
  ControllerDrawerState,
  ControllerFilters,
  ControllerMapStatus,
  SessionControllerState,
} from "../../src/controllerContracts.ts";
import type { CourtSummary, SessionSummary } from "../../src/domainTypes.ts";
import { NearbyDrawerFocusProvider } from "../../src/nearbyDrawerFocus.ts";
import { NearbySessionsDrawer } from "../../src/pages/NearbySessionsDrawer.tsx";
import { createStore } from "../../src/sessionStore.ts";
import { syncCommit } from "../../src/syncCommit.ts";

interface NearbyDrawerHarnessOptions {
  courts?: CourtSummary[] | null;
  drawerState?: ControllerDrawerState;
  filters?: ControllerFilters | null;
  hasUserLocation?: boolean;
  mapStatus?: ControllerMapStatus | null;
  onExpandBounds?(): unknown;
  onOpenCreate?(): unknown;
  onOpenSession?(sessionId?: string): unknown;
  onReset?(): unknown;
  onRetry?(): unknown;
  onSubscribe?(): unknown;
  onToggle?(state: ControllerDrawerState): unknown;
  sessions?: SessionSummary[] | null;
}

export interface NearbyDrawerAppHarness {
  root: Root;
  rootElement: HTMLElement;
  sessionStore: ControllerApi["sessionStore"];
  unmount(): void;
  update(options?: NearbyDrawerHarnessOptions): void;
}

const harnesses = new WeakMap<HTMLElement, NearbyDrawerAppHarness>();

function defaultFilters(): ControllerFilters {
  return { band: "all", dateKey: null, districts: new Set(), instantOnly: false, types: new Set() };
}

function discoveryStateFor(mapStatus: ControllerMapStatus | null | undefined): {
  discoveryStatus: SessionControllerState["discoveryStatus"];
  mapUnavailable: boolean;
} {
  if (mapStatus?.kind === "loading") return { discoveryStatus: "loading", mapUnavailable: false };
  if (mapStatus?.kind === "error") return { discoveryStatus: "error", mapUnavailable: false };
  if (mapStatus?.kind === "warning") return { discoveryStatus: "ready", mapUnavailable: true };
  return { discoveryStatus: "ready", mapUnavailable: false };
}

function createNearbyDrawerHarnessState(options: NearbyDrawerHarnessOptions): SessionControllerState {
  const discovery = discoveryStateFor(options.mapStatus);
  return {
    authEpoch: 1,
    authSession: { user: { id: "nearby-drawer-harness-user" } },
    blockedPlayers: [],
    blockedPlayersError: "",
    blockedPlayersStatus: "idle",
    bounds: { east: 121.7, north: 25.2, south: 24.9, west: 121.4 },
    courts: options.courts ?? [],
    courtsReady: true,
    discoveryMessage: "",
    discoveryStatus: discovery.discoveryStatus,
    drawerState: options.drawerState ?? "collapsed",
    filters: options.filters ?? defaultFilters(),
    locationBlocked: false,
    locationMessage: "",
    mapUnavailable: discovery.mapUnavailable,
    mySessionRosters: new Map(),
    mySessions: [],
    mySessionsError: "",
    mySessionsStatus: "idle",
    playerLayerMessage: "",
    playerLayerOn: false,
    playerLayerStatus: "idle",
    players: [],
    profile: null,
    profileEligibility: { directory: true, isPublic: true, nickname: true, ntrp: true, status: "ready" },
    sessions: options.sessions ?? [],
    userLocation: options.hasUserLocation ? { lat: 25.033, lng: 121.5654 } : null,
  };
}

function replaceAppOwnedRoot(rootElement: HTMLElement): HTMLElement {
  if (rootElement.id !== "nearby-sessions-drawer" || !rootElement.parentElement) return rootElement;
  const replacement = rootElement.cloneNode(false) as HTMLElement;
  rootElement.replaceWith(replacement);
  return replacement;
}

export function mountNearbyDrawerAppHarness(
  requestedRoot: HTMLElement,
  initialOptions: NearbyDrawerHarnessOptions = {}
): NearbyDrawerAppHarness {
  const existing = harnesses.get(requestedRoot);
  if (existing) {
    existing.update(initialOptions);
    return existing;
  }

  const rootElement = replaceAppOwnedRoot(requestedRoot);
  let options = initialOptions;
  const sessionStore = createStore(createNearbyDrawerHarnessState(options));
  let harness: NearbyDrawerAppHarness;
  const controller = {
    expandBounds: () => options.onExpandBounds?.(),
    openCreateIntent: () => options.onOpenCreate?.(),
    openSession: (sessionId?: string) => options.onOpenSession?.(sessionId),
    resetFilters: () => options.onReset?.(),
    retryDiscovery: () => options.onRetry?.(),
    sessionStore,
    setDrawerState: (drawerState: ControllerDrawerState) => {
      options = { ...options, drawerState };
      options.onToggle?.(drawerState);
      sessionStore.setState({ drawerState });
      sessionStore.emit("map");
    },
  } as unknown as ControllerApi;
  const nearbyDrawerApp = { onSubscribe: () => options.onSubscribe?.() };
  const root = createRoot(rootElement);

  syncCommit(() => {
    root.render(
      <AppServicesProvider controller={controller} nearbyDrawerApp={nearbyDrawerApp}>
        <NearbyDrawerFocusProvider rootElement={rootElement}>
          <NearbySessionsDrawer />
        </NearbyDrawerFocusProvider>
      </AppServicesProvider>
    );
  });

  harness = {
    root,
    rootElement,
    sessionStore,
    unmount: () => root.unmount(),
    update(nextOptions = {}) {
      options = { ...options, ...nextOptions };
      sessionStore.setState(createNearbyDrawerHarnessState(options));
      sessionStore.emit("map");
    },
  };
  harnesses.set(requestedRoot, harness);
  harnesses.set(rootElement, harness);
  return harness;
}

export function renderNearbyDrawerAppHarness(
  rootElement: HTMLElement,
  options: NearbyDrawerHarnessOptions = {}
): NearbyDrawerAppHarness {
  return mountNearbyDrawerAppHarness(rootElement, options);
}
