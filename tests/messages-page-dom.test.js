import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

function createMessagesStoreState({ courts = [], mySessions = [] } = {}) {
  return {
    authEpoch: 1,
    authSession: { user: { id: "messages-test-user" } },
    courts,
    mySessionRosters: new Map(),
    mySessions,
    mySessionsError: "",
    mySessionsStatus: "ready",
    profileEligibility: { isPublic: true },
  };
}

function legacyMessagesBoundaryFindings({ feature, page, provider }) {
  const findings = [];
  if (/\b(?:useMessagesState|useMessagesActions|MessagesServices|MessagesActions)\b/.test(provider)) {
    findings.push("app-services-messages-bridge");
  }
  if (/AppServicesProvider|\buseMessages(?:State|Actions)\b/.test(page)) {
    findings.push("messages-page-context-bridge");
  }
  if (/\b(?:mySessionRosters|groupMySessions|selectControllerMySessionsView)\b/.test(feature)) {
    findings.push("messages-selector-roster-coupling");
  }
  return findings;
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
  const [{ MessagesPage }, { createStore }, messagesFeature] = await Promise.all([
    vite.ssrLoadModule("/src/pages/MessagesPage.tsx"),
    vite.ssrLoadModule("/src/sessionStore.ts"),
    vite.ssrLoadModule("/src/features/messages/messagesFeature.ts"),
  ]);
  return {
    createStore,
    MessagesPage,
    messagesFromSessions: messagesFeature.messagesFromSessions,
    selectMessagesCourts: messagesFeature.selectMessagesCourts,
    selectMessagesSessions: messagesFeature.selectMessagesSessions,
  };
}

test("MessagesPage 輸出訊息標題、可開啟的球局列與未讀提示", async (t) => {
  const { createStore, MessagesPage } = await loadMessagesTestModules(t);
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
  const html = renderToStaticMarkup(createElement(MessagesPage, { onOpenChat: () => {}, sessionStore }));

  assert.match(html, /<h1[^>]*>訊息<\/h1>/);
  assert.match(html, /data-testid="messages-row-42"/);
  assert.match(html, />大安運動中心</);
  // eslint-disable-next-line no-useless-escape -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
  assert.match(html, /aria-label="大安運動中心，[^\"]*，2 則未讀訊息"/);
});

test("Messages 專用 selectors 只讀 mySessions 與 courts，且 roster 變動不影響結果", async (t) => {
  const { createStore, selectMessagesCourts, selectMessagesSessions } = await loadMessagesTestModules(t);
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
  const before = {
    courts: selectMessagesCourts(sessionStore.getState()),
    sessions: selectMessagesSessions(sessionStore.getState()),
  };
  sessionStore.setState({
    mySessionRosters: new Map([["8842", [{ participantId: 99, role: "guest", status: "requested" }]]]),
  });
  const after = {
    courts: selectMessagesCourts(sessionStore.getState()),
    sessions: selectMessagesSessions(sessionStore.getState()),
  };

  assert.deepStrictEqual(after, before);
  assert.deepStrictEqual(
    after.sessions.map((session) => session.sessionId),
    [8842]
  );
});

test("MessagesPage 直接使用 onOpenChat prop，不再經過 App services bridge", async (t) => {
  const { createStore, MessagesPage } = await loadMessagesTestModules(t);
  const sessionStore = createStore(createMessagesStoreState());
  const html = renderToStaticMarkup(createElement(MessagesPage, { onOpenChat: () => {}, sessionStore }));

  assert.match(html, /data-messages-heading/);
  const { readFile } = await import("node:fs/promises");
  const sources = {
    feature: await readFile(new URL("../src/features/messages/messagesFeature.ts", import.meta.url), "utf8"),
    page: await readFile(new URL("../src/pages/MessagesPage.tsx", import.meta.url), "utf8"),
    provider: await readFile(new URL("../src/app/AppServicesProvider.tsx", import.meta.url), "utf8"),
  };
  assert.deepStrictEqual(legacyMessagesBoundaryFindings(sources), []);

  assert.deepStrictEqual(
    legacyMessagesBoundaryFindings({
      ...sources,
      provider: `${sources.provider}\nexport function useMessagesState() {}`,
    }),
    ["app-services-messages-bridge"]
  );
  assert.deepStrictEqual(
    legacyMessagesBoundaryFindings({ ...sources, page: `${sources.page}\nuseMessagesActions();` }),
    ["messages-page-context-bridge"]
  );
  assert.deepStrictEqual(
    legacyMessagesBoundaryFindings({ ...sources, feature: `${sources.feature}\nstate.mySessionRosters;` }),
    ["messages-selector-roster-coupling"]
  );
});
