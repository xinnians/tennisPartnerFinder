import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

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

function createMeStoreState() {
  return {
    authEpoch: 9,
    authSession: {
      user: {
        id: "me-dom-user",
        identities: [{ provider: "google" }, { provider: "custom:line" }, {}],
        user_metadata: { avatar_url: "https://example.test/avatar.png", picture: "ignored.png" },
      },
    },
    blockedPlayers: [{ blockedNickname: "封鎖球友", blockedProfileId: 31, createdAt: "2026-08-01" }],
    blockedPlayersError: "",
    blockedPlayersStatus: "ready",
    bounds: { east: 121.7, north: 25.2, south: 24.9, west: 121.4 },
    courts: [{ city: "台北市", district: "大安區", id: 8, isActive: true, name: "大安運動中心" }],
    courtsReady: true,
    discoveryMessage: "",
    discoveryStatus: "idle",
    drawerState: "collapsed",
    filters: { band: "all", dateKey: null, districts: new Set(), instantOnly: false, types: new Set() },
    locationBlocked: false,
    locationMessage: "",
    mapUnavailable: false,
    mySessionRosters: new Map(),
    mySessions: [],
    mySessionsError: "",
    mySessionsStatus: "ready",
    playerLayerMessage: "",
    playerLayerOn: false,
    playerLayerStatus: "idle",
    players: [],
    profile: {
      courts: new Set(["8"]),
      nick: "測試球友",
      ntrp: 3.5,
      openToGreeting: true,
      sharePresence: true,
      slots: new Set(["we-e"]),
    },
    profileEligibility: { directory: true, isPublic: true, nickname: true, ntrp: true, status: "ready" },
    sessions: [],
    userLocation: null,
  };
}

async function loadMeTestModules(t) {
  const vite = await createServer({
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    root: new URL("../", import.meta.url).pathname,
    server: { middlewareMode: true },
  });
  t.after(() => vite.close());
  const [services, { MePage }, { createStore }, selectors] = await Promise.all([
    vite.ssrLoadModule("/src/app/AppServicesProvider.tsx"),
    vite.ssrLoadModule("/src/pages/MePage.tsx"),
    vite.ssrLoadModule("/src/sessionStore.ts"),
    vite.ssrLoadModule("/src/sessionSelectors.ts"),
  ]);
  return { ...services, createStore, MePage, selectMeState: selectors.selectMeState };
}

function createController(sessionStore, overrides = {}) {
  return {
    sessionStore,
    togglePlayerVisibility: () => {},
    unblockPlayer: () => {},
    ...overrides,
  };
}

function createMeApp(overrides = {}) {
  return {
    lineProviderId: "custom:line",
    onEditProfile: () => {},
    onEnablePush: () => {},
    onLinkProvider: () => {},
    onSaveCourtSubscriptions: () => {},
    onSaveNotificationPreferences: () => {},
    onSetOpenToGreeting: () => {},
    onSetPresenceSharing: () => {},
    onSignIn: () => {},
    onSignOut: () => {},
    supportHref: "mailto:support@example.test",
    ...overrides,
  };
}

function createPageViewStore(createStore) {
  return createStore({
    createdSessionFocusId: null,
    createdSessionFocusReason: null,
    notificationSettings: { courtIds: [8], prefs: {}, pushStatus: "idle", webPushConfigured: true },
    presenceLocationStatus: "granted",
  });
}

test("MePage 輸出登入身分、設定區與服務連結", async (t) => {
  const { AppServicesProvider, createStore, MePage } = await loadMeTestModules(t);
  const sessionStore = createStore(createMeStoreState());
  const pageViewStore = createPageViewStore(createStore);
  const rootElement = { querySelector: () => null };
  const html = renderToStaticMarkup(
    createElement(
      AppServicesProvider,
      { controller: createController(sessionStore), meApp: createMeApp(), pageViewStore },
      createElement(MePage, { rootElement })
    )
  );

  assert.match(html, /<h1[^>]*>我<\/h1>/);
  assert.match(html, /data-testid="me-identity-card"/);
  assert.match(html, />測試球友</);
  assert.match(html, /data-testid="player-visibility-toggle"/);
  assert.match(html, /data-testid="blocked-player-list"/);
  assert.match(html, /mailto:support@example\.test/);
});

test("useMePageView 只投影 notificationSettings 與 presenceLocationStatus", async (t) => {
  const { AppServicesProvider, createStore, useMePageView } = await loadMeTestModules(t);
  const controller = createController(createStore(createMeStoreState()));
  const pageViewStore = createPageViewStore(createStore);
  let observedPageView;
  function PageViewProbe() {
    observedPageView = useMePageView();
    return null;
  }
  renderToStaticMarkup(createElement(AppServicesProvider, { controller, pageViewStore }, createElement(PageViewProbe)));
  await retryAssertion(() =>
    assert.deepStrictEqual(observedPageView, {
      notificationSettings: pageViewStore.getState().notificationSettings,
      presenceLocationStatus: pageViewStore.getState().presenceLocationStatus,
    })
  );
});

test("useMeState 與 selectMeState 產出同一份九欄切片", async (t) => {
  const { AppServicesProvider, createStore, selectMeState, useMeState } = await loadMeTestModules(t);
  const sessionStore = createStore(createMeStoreState());
  let observedState;
  function StateProbe() {
    observedState = useMeState();
    return null;
  }
  renderToStaticMarkup(
    createElement(AppServicesProvider, { controller: createController(sessionStore) }, createElement(StateProbe))
  );
  await retryAssertion(() => assert.deepStrictEqual(observedState, selectMeState(sessionStore.getState())));
  assert.deepStrictEqual(Object.keys(observedState).sort(), [
    "authSession",
    "avatarUrl",
    "blockedPlayers",
    "blockedPlayersError",
    "blockedPlayersStatus",
    "courts",
    "linkedProviders",
    "playerVisibility",
    "profile",
  ]);
});

test("useMeActions 轉呼兩個 controller action 並保留參數", async (t) => {
  const { AppServicesProvider, createStore, useMeActions } = await loadMeTestModules(t);
  const calls = [];
  const sessionStore = createStore(createMeStoreState());
  const controller = createController(sessionStore, {
    togglePlayerVisibility: (...args) => calls.push(["togglePlayerVisibility", ...args]),
    unblockPlayer: (...args) => calls.push(["unblockPlayer", ...args]),
  });
  let actions;
  function ActionsProbe() {
    actions = useMeActions();
    return null;
  }
  renderToStaticMarkup(createElement(AppServicesProvider, { controller }, createElement(ActionsProbe)));
  await retryAssertion(() => assert.equal(typeof actions?.onTogglePlayerVisibility, "function"));
  actions.onTogglePlayerVisibility();
  actions.onUnblockPlayer("31");
  assert.deepStrictEqual(calls, [["togglePlayerVisibility"], ["unblockPlayer", "31"]]);
});

test("useMeAppActions 暴露九個 callback 與兩個常數並逐一轉呼", async (t) => {
  const { AppServicesProvider, createStore, useMeAppActions } = await loadMeTestModules(t);
  const calls = [];
  const record =
    (name) =>
    (...args) =>
      calls.push([name, ...args]);
  const meApp = createMeApp({
    lineProviderId: "custom:test-line",
    onEditProfile: record("edit"),
    onEnablePush: record("push"),
    onLinkProvider: record("link"),
    onSaveCourtSubscriptions: record("courts"),
    onSaveNotificationPreferences: record("preferences"),
    onSetOpenToGreeting: record("greeting"),
    onSetPresenceSharing: record("presence"),
    onSignIn: record("sign-in"),
    onSignOut: record("sign-out"),
    supportHref: "mailto:test@example.test",
  });
  let actions;
  function ActionsProbe() {
    actions = useMeAppActions();
    return null;
  }
  const controller = createController(createStore(createMeStoreState()));
  renderToStaticMarkup(createElement(AppServicesProvider, { controller, meApp }, createElement(ActionsProbe)));
  await retryAssertion(() => assert.equal(actions?.lineProviderId, "custom:test-line"));
  const preferences = { chatMessageEnabled: false };
  actions.onEditProfile();
  actions.onEnablePush();
  actions.onLinkProvider("custom:test-line");
  actions.onSaveCourtSubscriptions([8, 9]);
  actions.onSaveNotificationPreferences(preferences);
  actions.onSetOpenToGreeting(true);
  actions.onSetPresenceSharing(false);
  actions.onSignIn();
  actions.onSignOut();
  assert.equal(actions.supportHref, "mailto:test@example.test");
  assert.deepStrictEqual(calls, [
    ["edit"],
    ["push"],
    ["link", "custom:test-line"],
    ["courts", [8, 9]],
    ["preferences", preferences],
    ["greeting", true],
    ["presence", false],
    ["sign-in"],
    ["sign-out"],
  ]);
});
