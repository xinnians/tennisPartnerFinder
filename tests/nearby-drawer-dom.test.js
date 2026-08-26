import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const COURTS = [{ city: "台北市", district: "大安區", id: 8, name: "大安運動中心" }];
const SESSIONS = [
  {
    court: "大安運動中心",
    courtDistrict: "大安區",
    courtId: 8,
    courtLat: 25.02,
    courtLng: 121.54,
    feeNote: "每人 100 元",
    hostNickname: "附近球友",
    hostNtrp: 3.5,
    hostProfileComplete: true,
    joinMode: "approval",
    ntrpMax: 4,
    ntrpMin: 3,
    playType: "雙打",
    sessionId: 8301,
    slotsRemaining: 2,
    startAt: "2099-08-26T02:00:00.000Z",
    status: "open",
  },
];

async function retryAssertion(assertion, { timeoutMs = 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}

function createNearbyStoreState(overrides = {}) {
  return {
    authEpoch: 1,
    authSession: { user: { id: "nearby-drawer-test-user" } },
    blockedPlayers: [],
    blockedPlayersError: "",
    blockedPlayersStatus: "idle",
    bounds: { east: 121.7, north: 25.2, south: 24.9, west: 121.4 },
    courts: COURTS,
    courtsReady: true,
    discoveryMessage: "",
    discoveryStatus: "ready",
    drawerState: "collapsed",
    filters: { band: "all", dateKey: null, districts: new Set(), instantOnly: false, types: new Set() },
    locationBlocked: false,
    locationMessage: "",
    mapUnavailable: false,
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
    sessions: SESSIONS,
    userLocation: null,
    ...overrides,
  };
}

function createController(sessionStore, overrides = {}) {
  const noop = () => {};
  return {
    expandBounds: noop,
    openCreateIntent: noop,
    openSession: noop,
    resetFilters: noop,
    retryDiscovery: noop,
    sessionStore,
    setDrawerState: noop,
    ...overrides,
  };
}

async function loadNearbyDrawerTestModules(t) {
  const vite = await createServer({
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    root: new URL("../", import.meta.url).pathname,
    server: { middlewareMode: true },
  });
  t.after(() => vite.close());
  const [services, { NearbyDrawerFocusProvider }, { NearbySessionsDrawer }, { createStore }, selectors] =
    await Promise.all([
      vite.ssrLoadModule("/src/app/AppServicesProvider.tsx"),
      vite.ssrLoadModule("/src/nearbyDrawerFocus.ts"),
      vite.ssrLoadModule("/src/pages/NearbySessionsDrawer.tsx"),
      vite.ssrLoadModule("/src/sessionStore.ts"),
      vite.ssrLoadModule("/src/sessionSelectors.ts"),
    ]);
  return {
    ...services,
    createStore,
    NearbyDrawerFocusProvider,
    NearbySessionsDrawer,
    selectControllerMapView: selectors.selectControllerMapView,
  };
}

function renderDrawer({
  AppServicesProvider,
  NearbyDrawerFocusProvider,
  NearbySessionsDrawer,
  controller,
  nearbyDrawerApp,
}) {
  const rootElement = {};
  return renderToStaticMarkup(
    createElement(
      AppServicesProvider,
      { controller, nearbyDrawerApp },
      createElement(NearbyDrawerFocusProvider, { rootElement }, createElement(NearbySessionsDrawer))
    )
  );
}

test("NearbySessionsDrawer renders the peek row, session card, and empty state from provider state", async (t) => {
  const modules = await loadNearbyDrawerTestModules(t);
  const { AppServicesProvider, NearbyDrawerFocusProvider, NearbySessionsDrawer, createStore } = modules;
  assert.ok(SESSIONS.length > 0, "nearby drawer fixture must contain at least one session");
  const nearbyDrawerApp = { onSubscribe: () => {} };
  const sessionStore = createStore(createNearbyStoreState());
  const html = renderDrawer({
    AppServicesProvider,
    NearbyDrawerFocusProvider,
    NearbySessionsDrawer,
    controller: createController(sessionStore),
    nearbyDrawerApp,
  });

  assert.match(html, /id="nearby-sessions-toggle"/);
  assert.match(html, /class="nearby-peek"/);
  assert.match(html, /class="nearby-sessions__cards"/);
  assert.match(html, /data-testid="session-card"/);
  assert.match(html, /data-session-id="8301"/);

  const emptyStore = createStore(createNearbyStoreState({ drawerState: "open", sessions: [] }));
  const emptyHtml = renderDrawer({
    AppServicesProvider,
    NearbyDrawerFocusProvider,
    NearbySessionsDrawer,
    controller: createController(emptyStore),
    nearbyDrawerApp,
  });
  assert.match(emptyHtml, /class="nearby-peek nearby-peek--empty"/);
  assert.match(emptyHtml, /id="discovery-empty"/);
  assert.match(emptyHtml, /這個範圍暫時沒有可加入的球局/);
});

test("useNearbyDrawerState matches the six-field selectControllerMapView slice", async (t) => {
  const { AppServicesProvider, NearbyDrawerFocusProvider, createStore, selectControllerMapView, useNearbyDrawerState } =
    await loadNearbyDrawerTestModules(t);
  const sessionStore = createStore(
    createNearbyStoreState({
      drawerState: "open",
      locationMessage: "location-only selector field",
      userLocation: { lat: 25.033, lng: 121.5654 },
    })
  );
  let observedState;
  function StateProbe() {
    observedState = useNearbyDrawerState();
    return null;
  }

  renderToStaticMarkup(
    createElement(
      AppServicesProvider,
      { controller: createController(sessionStore) },
      createElement(NearbyDrawerFocusProvider, { rootElement: {} }, createElement(StateProbe))
    )
  );
  const { courts, drawerState, filters, hasUserLocation, mapStatus, sessions } = selectControllerMapView(
    sessionStore.getState()
  );
  await retryAssertion(() => {
    assert.deepStrictEqual(observedState, { courts, drawerState, filters, hasUserLocation, mapStatus, sessions });
  });
});

test("nearby drawer action hooks forward six controller calls and the app subscribe callback", async (t) => {
  const { AppServicesProvider, createStore, useNearbyDrawerActions, useNearbyDrawerAppActions } =
    await loadNearbyDrawerTestModules(t);
  const sessionStore = createStore(createNearbyStoreState());
  const calls = [];
  const record =
    (name, result) =>
    (...args) => {
      calls.push([name, ...args]);
      return result;
    };
  const retryResult = Promise.resolve(true);
  const controller = createController(sessionStore, {
    expandBounds: record("expandBounds"),
    openCreateIntent: record("openCreateIntent"),
    openSession: record("openSession"),
    resetFilters: record("resetFilters"),
    retryDiscovery: record("retryDiscovery", retryResult),
    setDrawerState: record("setDrawerState"),
  });
  const nearbyDrawerApp = { onSubscribe: record("onSubscribe") };
  let actions;
  let appActions;
  function ActionsProbe() {
    actions = useNearbyDrawerActions();
    appActions = useNearbyDrawerAppActions();
    return null;
  }

  renderToStaticMarkup(
    createElement(AppServicesProvider, { controller, nearbyDrawerApp }, createElement(ActionsProbe))
  );
  await retryAssertion(() => assert.equal(typeof actions?.onRetry, "function"));
  actions.onExpandBounds();
  actions.onOpenCreate();
  actions.onOpenSession("8301");
  actions.onReset();
  assert.equal(actions.onRetry(), retryResult);
  actions.onToggle("open");
  appActions.onSubscribe();
  assert.deepStrictEqual(calls, [
    ["expandBounds"],
    ["openCreateIntent"],
    ["openSession", "8301"],
    ["resetFilters"],
    ["retryDiscovery"],
    ["setDrawerState", "open"],
    ["onSubscribe"],
  ]);
});

test("useNearbyDrawerAppActions fails closed when the app callback is not injected", async (t) => {
  const { AppServicesProvider, createStore, useNearbyDrawerAppActions } = await loadNearbyDrawerTestModules(t);
  const controller = createController(createStore(createNearbyStoreState()));
  function AppActionsProbe() {
    useNearbyDrawerAppActions();
    return null;
  }
  assert.throws(
    () => renderToStaticMarkup(createElement(AppServicesProvider, { controller }, createElement(AppActionsProbe))),
    /NearbyDrawer app actions are unavailable/
  );
});
