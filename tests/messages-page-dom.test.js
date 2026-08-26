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

function createMessagesStoreState({ courts = [], mySessions = [] } = {}) {
  return {
    authEpoch: 1,
    authSession: { user: { id: "messages-test-user" } },
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

async function loadMessagesTestModules(t) {
  const vite = await createServer({
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    root: new URL("../", import.meta.url).pathname,
    server: { middlewareMode: true },
  });
  t.after(() => vite.close());
  const [{ AppServicesProvider, useMessagesActions, useMessagesState }, { MessagesPage }, { createStore }, selectors] =
    await Promise.all([
      vite.ssrLoadModule("/src/app/AppServicesProvider.tsx"),
      vite.ssrLoadModule("/src/pages/MessagesPage.tsx"),
      vite.ssrLoadModule("/src/sessionStore.ts"),
      vite.ssrLoadModule("/src/sessionSelectors.ts"),
    ]);
  return {
    AppServicesProvider,
    createStore,
    MessagesPage,
    selectControllerMySessionsView: selectors.selectControllerMySessionsView,
    useMessagesActions,
    useMessagesState,
  };
}

test("MessagesPage 輸出訊息標題、可開啟的球局列與未讀提示", async (t) => {
  const { AppServicesProvider, createStore, MessagesPage } = await loadMessagesTestModules(t);
  const sessionStore = createStore(
    createMessagesStoreState({
      courts: [{ id: 1, name: "大安運動中心" }],
      mySessions: [
        {
          court: "大安運動中心",
          courtDistrict: "大安區",
          hostNickname: "小安",
          sessionId: 42,
          startAt: "2026-08-25T10:00:00+08:00",
          status: "open",
          unreadMessageCount: 2,
          viewerParticipantStatus: "accepted",
          viewerRole: "guest",
        },
      ],
    })
  );
  const controller = { openSessionChat: () => {}, sessionStore };

  const html = renderToStaticMarkup(createElement(AppServicesProvider, { controller }, createElement(MessagesPage)));

  assert.match(html, /<h1[^>]*>訊息<\/h1>/);
  assert.match(html, /data-testid="messages-row-42"/);
  assert.match(html, />大安運動中心</);
  // eslint-disable-next-line no-useless-escape -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
  assert.match(html, /aria-label="大安運動中心，[^\"]*，2 則未讀訊息"/);
});

test("useMessagesState 與既有 selector 產出同一份 Messages state 切片", async (t) => {
  const { AppServicesProvider, createStore, selectControllerMySessionsView, useMessagesState } =
    await loadMessagesTestModules(t);
  const sessionStore = createStore(
    createMessagesStoreState({
      courts: [{ id: 8, name: "訂閱測試球場" }],
      mySessions: [
        {
          court: "訂閱測試球場",
          sessionId: 8842,
          startAt: "2099-08-18T01:00:00.000Z",
          status: "open",
          unreadMessageCount: 1,
          viewerParticipantStatus: "accepted",
          viewerRole: "guest",
        },
      ],
    })
  );
  let observedState;
  function StateProbe() {
    observedState = useMessagesState();
    return null;
  }

  renderToStaticMarkup(
    createElement(
      AppServicesProvider,
      { controller: { openSessionChat: () => {}, sessionStore } },
      createElement(StateProbe)
    )
  );

  await retryAssertion(() => {
    assert.deepStrictEqual(observedState, {
      courts: sessionStore.getState().courts,
      groups: selectControllerMySessionsView(sessionStore.getState()).groups,
    });
  });
});

test("useMessagesActions 保留 ControllerApi openSessionChat 轉呼契約", async (t) => {
  const { AppServicesProvider, createStore, useMessagesActions } = await loadMessagesTestModules(t);
  const sessionStore = createStore(createMessagesStoreState());
  const opened = [];
  let actions;
  function ActionsProbe() {
    actions = useMessagesActions();
    return null;
  }

  renderToStaticMarkup(
    createElement(
      AppServicesProvider,
      { controller: { openSessionChat: (sessionId) => opened.push(sessionId), sessionStore } },
      createElement(ActionsProbe)
    )
  );
  await retryAssertion(() => assert.equal(typeof actions?.openSessionChat, "function"));
  actions.openSessionChat("42");
  await retryAssertion(() => assert.deepStrictEqual(opened, ["42"]));
});
