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

function createMySessionsStoreState({ courts = [], mySessions = [] } = {}) {
  return {
    authEpoch: 7,
    authSession: { user: { id: "my-sessions-test-user" } },
    blockedPlayers: [],
    blockedPlayersError: "",
    blockedPlayersStatus: "idle",
    courts,
    mySessionRosters: new Map(),
    mySessions,
    mySessionsError: "",
    mySessionsStatus: "ready",
    profileEligibility: { isPublic: true },
  };
}

async function loadMySessionsTestModules(t) {
  const vite = await createServer({
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    root: new URL("../", import.meta.url).pathname,
    server: { middlewareMode: true },
  });
  t.after(() => vite.close());
  const [
    { AppServicesProvider, useMySessionsActions, useMySessionsState },
    { MySessionsPage },
    { createStore },
    selectors,
  ] = await Promise.all([
    vite.ssrLoadModule("/src/app/AppServicesProvider.tsx"),
    vite.ssrLoadModule("/src/pages/MySessionsPage.tsx"),
    vite.ssrLoadModule("/src/sessionStore.ts"),
    vite.ssrLoadModule("/src/sessionSelectors.ts"),
  ]);
  return {
    AppServicesProvider,
    createStore,
    MySessionsPage,
    selectControllerMySessionsView: selectors.selectControllerMySessionsView,
    useMySessionsActions,
    useMySessionsState,
  };
}

function createController(sessionStore, overrides = {}) {
  const noop = () => {};
  return {
    cancelMySession: noop,
    confirmMySessionAttendance: noop,
    markMySessionPlayed: noop,
    openCreateIntent: noop,
    openRosterParticipantReport: noop,
    openSession: noop,
    openSessionChat: noop,
    openSessionDecision: noop,
    openSessionEdit: noop,
    openSessionReport: noop,
    refreshMySessions: noop,
    respondInvite: noop,
    reviewMySessionParticipant: noop,
    sessionStore,
    withdrawMySession: noop,
    ...overrides,
  };
}

test("MySessionsPage 輸出標題、分段控制與可開啟的球局卡", async (t) => {
  const { AppServicesProvider, createStore, MySessionsPage } = await loadMySessionsTestModules(t);
  const sessionStore = createStore(
    createMySessionsStoreState({
      courts: [{ id: 8, name: "大安運動中心" }],
      mySessions: [
        {
          court: "大安運動中心",
          hostNickname: "小安",
          sessionId: 8842,
          startAt: "2099-08-18T01:00:00.000Z",
          status: "open",
          viewerParticipantStatus: "accepted",
          viewerRole: "guest",
        },
      ],
    })
  );
  const rootElement = { querySelector: () => null };
  const html = renderToStaticMarkup(
    createElement(
      AppServicesProvider,
      { controller: createController(sessionStore) },
      createElement(MySessionsPage, { rootElement })
    )
  );

  assert.match(html, /<h1[^>]*>我的球局<\/h1>/);
  assert.match(html, /data-testid="my-sessions-seg-joined"/);
  assert.match(html, /data-testid="my-sessions-seg-hosted"/);
  assert.match(html, /class="my-session-card"/);
  assert.match(html, /data-session-id="8842"/);
  assert.match(html, />大安運動中心</);
});

test("useMySessionsState 與既有 selector 產出同一份 state 切片", async (t) => {
  const { AppServicesProvider, createStore, selectControllerMySessionsView, useMySessionsState } =
    await loadMySessionsTestModules(t);
  const sessionStore = createStore(
    createMySessionsStoreState({
      courts: [{ id: 8, name: "訂閱測試球場" }],
      mySessions: [
        {
          court: "訂閱測試球場",
          sessionId: 8842,
          startAt: "2099-08-18T01:00:00.000Z",
          status: "open",
          viewerParticipantStatus: "accepted",
          viewerRole: "guest",
        },
      ],
    })
  );
  let observedState;
  function StateProbe() {
    observedState = useMySessionsState();
    return null;
  }

  renderToStaticMarkup(
    createElement(AppServicesProvider, { controller: createController(sessionStore) }, createElement(StateProbe))
  );
  const view = selectControllerMySessionsView(sessionStore.getState());
  await retryAssertion(() => {
    assert.deepStrictEqual(observedState, {
      actionScopeKey: view.viewGeneration,
      authenticated: view.authenticated,
      courts: sessionStore.getState().courts,
      errorMessage: view.error,
      groups: view.groups,
      status: view.status,
    });
  });
});

test("useMySessionsActions 轉呼 14 個 controller 方法並綁定四個 decision payload", async (t) => {
  const { AppServicesProvider, createStore, useMySessionsActions } = await loadMySessionsTestModules(t);
  const sessionStore = createStore(createMySessionsStoreState());
  const calls = [];
  const record =
    (name) =>
    (...args) =>
      calls.push([name, ...args]);
  const controller = createController(sessionStore, {
    cancelMySession: record("cancelMySession"),
    confirmMySessionAttendance: record("confirmMySessionAttendance"),
    markMySessionPlayed: record("markMySessionPlayed"),
    openCreateIntent: record("openCreateIntent"),
    openRosterParticipantReport: record("openRosterParticipantReport"),
    openSession: record("openSession"),
    openSessionChat: record("openSessionChat"),
    openSessionDecision: record("openSessionDecision"),
    openSessionEdit: record("openSessionEdit"),
    openSessionReport: record("openSessionReport"),
    refreshMySessions: record("refreshMySessions"),
    respondInvite: record("respondInvite"),
    reviewMySessionParticipant: record("reviewMySessionParticipant"),
    withdrawMySession: record("withdrawMySession"),
  });
  let actions;
  function ActionsProbe() {
    actions = useMySessionsActions();
    return null;
  }

  renderToStaticMarkup(createElement(AppServicesProvider, { controller }, createElement(ActionsProbe)));
  await retryAssertion(() => assert.equal(typeof actions?.onAccept, "function"));
  actions.onAccept("1", "2");
  actions.onAcceptInvite("3");
  actions.onCancel("4");
  actions.onConfirmAttendance("5");
  actions.onCreateSession();
  actions.onDecline("6", "7");
  actions.onDeclineInvite("8");
  actions.onDecide("9");
  actions.onEdit("10");
  actions.onMarkPlayed("11");
  actions.onOpenChat("12");
  actions.onOpenSession("13");
  actions.onRefresh();
  actions.onReportParticipant("14", "15");
  actions.onReportSession("16");
  actions.onWithdraw("17");

  await retryAssertion(() => {
    assert.deepStrictEqual(calls, [
      ["reviewMySessionParticipant", "1", "2", "accepted"],
      ["respondInvite", "3", "accepted"],
      ["cancelMySession", "4"],
      ["confirmMySessionAttendance", "5"],
      ["openCreateIntent"],
      ["reviewMySessionParticipant", "6", "7", "declined"],
      ["respondInvite", "8", "declined"],
      ["openSessionDecision", "9"],
      ["openSessionEdit", "10"],
      ["markMySessionPlayed", "11"],
      ["openSessionChat", "12"],
      ["openSession", "13"],
      ["refreshMySessions"],
      ["openRosterParticipantReport", "14", "15"],
      ["openSessionReport", "16"],
      ["withdrawMySession", "17"],
    ]);
  });
});
