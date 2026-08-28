import {
  DISCOVERY_POLL_INTERVAL_MS,
  LOCATION_INITIAL_RADIUS_METERS,
  MAP_IDLE_DEBOUNCE_MS,
  TAIPEI_CITY_BOUNDS,
} from "../config.ts";
import { DEFAULT_FILTER_STATE } from "../filters.ts";
import {
  cloneBounds,
  cloneFilters,
  representsExpectedViewport,
  selectVisibleSessions,
  validBounds,
} from "../features/discovery/discoveryFeature.ts";
import { createForegroundPoller } from "../requestGate.ts";
import { selectControllerMapView } from "../sessionSelectors.ts";

import type {
  ControllerEventName,
  ControllerFilters,
  ControllerMapViewPayload,
  ControllerPlayerGroup,
  ControllerPlayerLayerViewState,
  ControllerRequestGate,
  ControllerSurfaceHandle,
  SessionControllerState,
} from "../controllerContracts.ts";
// eslint-disable-next-line no-restricted-imports -- controller 既有 court 型別尚無 facade type export。
import type { DataCourt } from "../data/mappers/profileMappers.ts";
// eslint-disable-next-line no-restricted-imports -- controller 既有 bounds 型別尚無 facade type export。
import type { MapBounds } from "../data/mappers/queryMappers.ts";
import type { SessionSummary } from "../domainTypes.ts";
import type { Store } from "../sessionStore.ts";
import type { SurfaceRegistry } from "./surfaceRegistry.ts";

const EXPLICIT_VIEWPORT_IDLE_GRACE_MS = MAP_IDLE_DEBOUNCE_MS * 8;
const MAX_EXPECTED_EXPLICIT_VIEWPORTS = 6;

interface DiscoveryDataApi {
  loadSessionDiscovery(input: { bounds: MapBounds }): Promise<unknown>;
}

interface MapTools {
  fitTaipei?(): MapBounds | null | undefined;
  getMapBounds?(map: unknown): MapBounds | null | undefined;
  setUserLocation?(
    location: SessionControllerState["userLocation"],
    radiusMeters: number
  ): MapBounds | null | undefined;
  subscribeToMapIdle?(map: unknown, listener: () => void): void;
}

interface ExpectedViewport {
  bounds: MapBounds;
  expiresAt: number;
  generation: number;
}

interface DiscoveryMapDependencies {
  api: DiscoveryDataApi;
  discoveryGate: ControllerRequestGate;
  discoveryPollIntervalMs?: number;
  getPlayerGroups: () => ControllerPlayerGroup[];
  loadPlayers: (bounds: MapBounds) => Promise<boolean>;
  mapTools?: MapTools;
  reconcileActiveDetail: (bounds: MapBounds) => void;
  render: (view: ControllerMapViewPayload) => void;
  renderPins: (sessions: SessionSummary[]) => void;
  renderPlayers: (view: ControllerPlayerLayerViewState) => void;
  store: Store<SessionControllerState, ControllerEventName>;
  surfaceRegistry: SurfaceRegistry;
  visibilityTarget?: Document;
}

export interface DiscoveryMapController {
  attachMap: (map: unknown) => void;
  expandBounds: () => Promise<boolean | void> | void;
  getVisibleSessions: () => SessionSummary[];
  loadDiscovery: (bounds?: MapBounds | null) => Promise<boolean | void>;
  publish: () => void;
  refreshLocationViewport: (location: SessionControllerState["userLocation"]) => Promise<boolean | void> | void;
  resetFilters: () => void;
  retryDiscovery: () => Promise<boolean | void>;
  setCourts: (courts: DataCourt[], options?: { ready?: boolean }) => void;
  setDrawerState: (value: SessionControllerState["drawerState"]) => void;
  setFilter: <Key extends keyof ControllerFilters>(key: Key, value: ControllerFilters[Key]) => void;
  setMapUnavailable: () => void;
  startDiscoveryPolling: () => void;
}

/** Owns discovery requests, the map viewport, filters, and map/court publishes. */
export function createDiscoveryMapController({
  api,
  discoveryGate,
  discoveryPollIntervalMs = DISCOVERY_POLL_INTERVAL_MS,
  getPlayerGroups,
  loadPlayers,
  mapTools = {},
  reconcileActiveDetail,
  render,
  renderPins,
  renderPlayers,
  store,
  surfaceRegistry,
  visibilityTarget = globalThis.document,
}: DiscoveryMapDependencies): DiscoveryMapController {
  const read = store.getState;
  let map: unknown = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let explicitViewportGeneration = 0;
  let expectedExplicitViewports: ExpectedViewport[] = [];

  function visibleSessions(): SessionSummary[] {
    return selectVisibleSessions(read());
  }

  // 通道 1「map」:球局列表、圖釘與球友圖層。派發一律由 publish() 顯式觸發,不做
  // 變更偵測——既有行為包含「值沒變仍要重畫」,偵測式派發會把它吃掉。
  store.subscribe("map", (current) => {
    const view = selectControllerMapView(current);
    render(view);
    renderPins(view.sessions);
    renderPlayers({
      groups: current.playerLayerOn ? getPlayerGroups() : [],
      message: current.playerLayerMessage,
      on: current.playerLayerOn,
      status: current.playerLayerStatus,
    });
  });

  function publish(): void {
    store.emit("map");
  }

  async function loadDiscovery(bounds: MapBounds | null = read().bounds): Promise<boolean | void> {
    const nextBounds = validBounds(bounds) ? cloneBounds(bounds) : cloneBounds(TAIPEI_CITY_BOUNDS);
    const request = discoveryGate.issue();
    surfaceRegistry.close("courtDrawer");
    store.setState({ bounds: nextBounds, sessions: [], discoveryStatus: "loading", discoveryMessage: "" });
    const playerRefresh = read().playerLayerOn ? loadPlayers(nextBounds) : null;
    publish();
    try {
      const sessions = await api.loadSessionDiscovery({ bounds: nextBounds });
      if (request.isStale()) return false;
      store.setState({
        sessions: Array.isArray(sessions) ? (sessions as SessionSummary[]) : [],
        discoveryStatus: "ready",
      });
      reconcileActiveDetail(nextBounds);
    } catch {
      if (request.isStale()) return;
      store.setState({ sessions: [], discoveryStatus: "error", discoveryMessage: "球局資料暫時無法載入。" });
      surfaceRegistry.close("detail");
      publish();
      return false;
    }
    publish();
    if (playerRefresh) await playerRefresh;
    return true;
  }

  function discoveryPollIsActive(): boolean {
    if (read().discoveryStatus === "loading") return false;
    if (
      surfaceRegistry.get("detail") ||
      surfaceRegistry.get("courtDrawer") ||
      surfaceRegistry.get("chat") ||
      surfaceRegistry.get("createSession") ||
      surfaceRegistry.get("decisionSession") ||
      surfaceRegistry.get("editSession")
    ) {
      return false;
    }
    return typeof api.loadSessionDiscovery === "function";
  }

  async function quietRefreshDiscovery(): Promise<boolean> {
    const request = discoveryGate.issue();
    try {
      const sessions = await api.loadSessionDiscovery({ bounds: read().bounds });
      if (request.isStale()) return false;
      store.setState({
        sessions: Array.isArray(sessions) ? (sessions as SessionSummary[]) : [],
        discoveryStatus: "ready",
        discoveryMessage: "",
      });
      publish();
      return true;
    } catch {
      return false;
    }
  }

  store.subscribe("courts", (current) => {
    for (const name of ["createSession", "decisionSession", "editSession", "profilePrompt"]) {
      (surfaceRegistry.get(name) as ControllerSurfaceHandle | null)?.setCourts?.(current.courts, {
        ready: current.courtsReady,
      });
    }
  });

  function setCourts(courts: DataCourt[], { ready = true } = {}): void {
    store.setState({ courts: Array.isArray(courts) ? courts : [], courtsReady: Boolean(ready) });
    store.emit("courts");
    store.emit("me");
    publish();
  }

  function setDrawerState(value: SessionControllerState["drawerState"]): void {
    if (value !== "collapsed" && value !== "open") return;
    store.setState({ drawerState: value });
    publish();
  }

  function setFilter<Key extends keyof ControllerFilters>(key: Key, value: ControllerFilters[Key]): void {
    const filters = read().filters;
    const defaultValue = DEFAULT_FILTER_STATE[key];
    const nextValue =
      defaultValue instanceof Set
        ? value instanceof Set
          ? new Set(value)
          : new Set((value ?? []) as Iterable<string>)
        : value;
    Object.assign(filters, { [key]: nextValue });
    store.setState({ filters });
    publish();
  }

  function resetFilters(): void {
    store.setState({ filters: cloneFilters() });
    publish();
  }

  function setMapUnavailable(): void {
    store.setState({ mapUnavailable: true, drawerState: "open" });
    publish();
  }

  function pruneExpectedExplicitViewports(now = Date.now()): void {
    expectedExplicitViewports = expectedExplicitViewports.filter((entry) => entry.expiresAt > now);
  }

  function rememberExplicitViewport(bounds: MapBounds): void {
    pruneExpectedExplicitViewports();
    expectedExplicitViewports = [
      ...expectedExplicitViewports,
      {
        bounds: cloneBounds(bounds),
        expiresAt: Date.now() + EXPLICIT_VIEWPORT_IDLE_GRACE_MS,
        generation: ++explicitViewportGeneration,
      },
    ].slice(-MAX_EXPECTED_EXPLICIT_VIEWPORTS);
  }

  function isExpectedExplicitViewport(bounds: MapBounds): boolean {
    pruneExpectedExplicitViewports();
    return expectedExplicitViewports.some((entry) => representsExpectedViewport(bounds, entry.bounds));
  }

  function refreshExplicitViewport(
    moveCamera: () => MapBounds | null | undefined,
    fallbackBounds: MapBounds | null = null
  ): Promise<boolean | void> | void {
    if (idleTimer) clearTimeout(idleTimer);
    const movedBounds = moveCamera?.();
    const bounds = validBounds(movedBounds) ? movedBounds : fallbackBounds;
    if (!validBounds(bounds)) {
      publish();
      return;
    }
    if (map) rememberExplicitViewport(bounds);
    return loadDiscovery(bounds);
  }

  function refreshLocationViewport(location: SessionControllerState["userLocation"]): Promise<boolean | void> | void {
    return refreshExplicitViewport(() => mapTools.setUserLocation?.(location, LOCATION_INITIAL_RADIUS_METERS));
  }

  function attachMap(nextMap: unknown): void {
    map = nextMap;
    store.setState({ mapUnavailable: false });
    mapTools.subscribeToMapIdle?.(map, () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        const bounds = mapTools.getMapBounds?.(map);
        if (!validBounds(bounds) || isExpectedExplicitViewport(bounds)) return;
        void loadDiscovery(bounds);
      }, MAP_IDLE_DEBOUNCE_MS);
    });
    if (read().userLocation) void refreshLocationViewport(read().userLocation);
    else publish();
  }

  function retryDiscovery(): Promise<boolean | void> {
    return loadDiscovery(read().bounds);
  }

  function expandBounds(): Promise<boolean | void> | void {
    return refreshExplicitViewport(() => mapTools.fitTaipei?.(), TAIPEI_CITY_BOUNDS);
  }

  function startDiscoveryPolling(): void {
    createForegroundPoller({
      intervalMs: discoveryPollIntervalMs,
      isActive: discoveryPollIsActive,
      onInterval: () => void quietRefreshDiscovery(),
      onVisible: () => void quietRefreshDiscovery(),
      visibilityTarget,
    });
  }

  return {
    attachMap,
    expandBounds,
    getVisibleSessions: visibleSessions,
    loadDiscovery,
    publish,
    refreshLocationViewport,
    resetFilters,
    retryDiscovery,
    setCourts,
    setDrawerState,
    setFilter,
    setMapUnavailable,
    startDiscoveryPolling,
  };
}
