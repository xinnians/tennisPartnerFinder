import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createChatFeedFacade } from "../src/features/chat/chatFeedFacade.ts";

function deferred() {
  let reject;
  let resolve;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
}

function message(messageId, body = `訊息 ${messageId}`) {
  return {
    body,
    createdAt: "2026-09-07T01:00:00Z",
    isSelf: false,
    kind: "user",
    messageId,
    senderNickname: "球友",
    senderProfileId: 92,
    sessionId: 731,
  };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function facadeHarness({ api, intervalMs = 0, visibilityTarget } = {}) {
  let active = true;
  let auth = { epoch: 1, identity: "account-a" };
  const cleared = [];
  const published = [];
  const facade = createChatFeedFacade({
    api,
    authSnapshot: { ...auth },
    clearUnread: (sessionId) => {
      cleared.push(sessionId);
      return true;
    },
    initiallyArchived: false,
    intervalMs,
    isActive: () => active,
    isCurrentAuthSnapshot: (snapshot) => snapshot.epoch === auth.epoch && snapshot.identity === auth.identity,
    sessionId: 731,
    visibilityTarget,
  });
  facade.subscribe(() => published.push(facade.getSnapshot()));
  return {
    cleared,
    facade,
    published,
    setActive(value) {
      active = value;
    },
    setAuth(value) {
      auth = value;
    },
  };
}

test("chat feed loads messages and roster in parallel, then publishes one immutable ready snapshot", async () => {
  const messages = deferred();
  const roster = deferred();
  const calls = [];
  const marked = [];
  const harness = facadeHarness({
    api: {
      loadSessionMessages: (sessionId) => {
        calls.push(["messages", sessionId]);
        return messages.promise;
      },
      loadSessionRoster: (sessionId) => {
        calls.push(["roster", sessionId]);
        return roster.promise;
      },
      markSessionChatRead: async (sessionId) => marked.push(sessionId),
    },
  });

  const refresh = harness.facade.refresh();
  assert.deepEqual(calls, [
    ["messages", 731],
    ["roster", 731],
  ]);
  assert.deepEqual(
    harness.published.map(({ errorMessage, messages, roster: rows, status }) => ({
      errorMessage,
      messages,
      roster: rows,
      status,
    })),
    [{ errorMessage: "", messages: [], roster: [], status: "loading" }]
  );

  messages.resolve([message(4)]);
  roster.resolve([{ nickname: "球友", participantId: 92 }]);
  assert.equal(await refresh, true);
  assert.deepEqual(harness.facade.getSnapshot(), {
    archived: false,
    errorMessage: "",
    messages: [message(4)],
    revision: 2,
    roster: [{ nickname: "球友", participantId: 92 }],
    status: "ready",
  });
  assert.equal(Object.isFrozen(harness.facade.getSnapshot()), true);
  assert.equal(Object.isFrozen(harness.facade.getSnapshot().messages), true);
  assert.equal(Object.isFrozen(harness.facade.getSnapshot().roster), true);
  assert.equal(harness.published.at(-1).status, "ready");
  assert.deepEqual(marked, [731]);
  assert.deepEqual(harness.cleared, [731]);
});

test("newest refresh wins and quiet refresh does not publish a loading state", async () => {
  const firstMessages = deferred();
  const secondMessages = deferred();
  const firstRoster = deferred();
  const secondRoster = deferred();
  const messageQueue = [firstMessages, secondMessages];
  const rosterQueue = [firstRoster, secondRoster];
  const harness = facadeHarness({
    api: {
      loadSessionMessages: () => messageQueue.shift().promise,
      loadSessionRoster: () => rosterQueue.shift().promise,
    },
  });

  const first = harness.facade.refresh();
  const second = harness.facade.refresh({ quiet: true });
  secondMessages.resolve([message(2, "新資料")]);
  secondRoster.resolve([{ nickname: "新成員" }]);
  assert.equal(await second, true);
  firstMessages.resolve([message(1, "舊資料")]);
  firstRoster.resolve([{ nickname: "舊成員" }]);
  assert.equal(await first, false);

  assert.deepEqual(
    harness.published.map(({ status }) => status),
    ["loading", "ready"],
    "quiet refresh adds no second loading publication"
  );
  assert.deepEqual(
    harness.facade.getSnapshot().messages.map(({ body }) => body),
    ["新資料"]
  );
});

test("read cursor retries failure, suppresses a completed duplicate, and advances for a newer message", async () => {
  let messages = [message(5)];
  let shouldFail = true;
  const marked = [];
  const harness = facadeHarness({
    api: {
      loadSessionMessages: async () => messages,
      loadSessionRoster: async () => [],
      markSessionChatRead: async (sessionId) => {
        marked.push(sessionId);
        if (shouldFail) throw new Error("offline");
      },
    },
  });

  assert.equal(await harness.facade.refresh(), true);
  shouldFail = false;
  assert.equal(await harness.facade.refresh(), true);
  assert.equal(await harness.facade.refresh(), true);
  messages = [...messages, message(6)];
  assert.equal(await harness.facade.refresh(), true);

  assert.deepEqual(marked, [731, 731, 731]);
  assert.deepEqual(harness.cleared, [731, 731, 731]);
});

test("read cursor stays monotonic when two successful acknowledgements resolve newest first", async () => {
  const firstMark = deferred();
  const secondMark = deferred();
  const markQueue = [firstMark, secondMark];
  let messages = [message(5)];
  let marked = 0;
  const harness = facadeHarness({
    api: {
      loadSessionMessages: async () => messages,
      loadSessionRoster: async () => [],
      markSessionChatRead: () => {
        marked += 1;
        return markQueue.shift().promise;
      },
    },
  });

  const first = harness.facade.refresh();
  await flush();
  messages = [...messages, message(6)];
  const second = harness.facade.refresh();
  await flush();
  assert.equal(marked, 2);

  secondMark.resolve();
  assert.equal(await second, true);
  firstMark.resolve();
  assert.equal(await first, true);
  assert.equal(await harness.facade.refresh(), true);
  assert.equal(marked, 2, "the late older acknowledgement cannot move the cursor backwards");
});

test("stop invalidates a pending response even if the surrounding active predicate has not changed", async () => {
  const messages = deferred();
  const roster = deferred();
  const harness = facadeHarness({
    api: {
      loadSessionMessages: () => messages.promise,
      loadSessionRoster: () => roster.promise,
    },
  });
  const refresh = harness.facade.refresh();

  harness.facade.stop();
  messages.resolve([message(8)]);
  roster.resolve([{ nickname: "不應落地" }]);
  assert.equal(await refresh, false);
  assert.deepEqual(harness.facade.getSnapshot(), {
    archived: false,
    errorMessage: "",
    messages: [],
    revision: 1,
    roster: [],
    status: "loading",
  });
  assert.deepEqual(
    harness.published.map(({ status }) => status),
    ["loading"]
  );
});

test("auth change rejects a late response without relying only on request generation", async () => {
  const messages = deferred();
  const roster = deferred();
  const harness = facadeHarness({
    api: {
      loadSessionMessages: () => messages.promise,
      loadSessionRoster: () => roster.promise,
    },
  });
  const refresh = harness.facade.refresh();

  harness.setAuth({ epoch: 2, identity: "account-b" });
  messages.resolve([message(9)]);
  roster.resolve([]);
  assert.equal(await refresh, false);
  assert.deepEqual(harness.facade.getSnapshot(), {
    archived: false,
    errorMessage: "",
    messages: [],
    revision: 1,
    roster: [],
    status: "loading",
  });
});

test("surface identity change rejects a late response without relying on stop or auth change", async () => {
  const messages = deferred();
  const roster = deferred();
  const harness = facadeHarness({
    api: {
      loadSessionMessages: () => messages.promise,
      loadSessionRoster: () => roster.promise,
    },
  });
  const refresh = harness.facade.refresh();

  harness.setActive(false);
  messages.resolve([message(10)]);
  roster.resolve([]);
  assert.equal(await refresh, false);
  assert.deepEqual(harness.facade.getSnapshot(), {
    archived: false,
    errorMessage: "",
    messages: [],
    revision: 1,
    roster: [],
    status: "loading",
  });
});

test("archive is observable, immutable, and idempotent", () => {
  const harness = facadeHarness({ api: {} });
  let notifications = 0;
  const unsubscribe = harness.facade.subscribe(() => {
    notifications += 1;
  });

  harness.facade.archive();
  harness.facade.archive();
  assert.equal(harness.facade.getSnapshot().archived, true);
  assert.equal(Object.isFrozen(harness.facade.getSnapshot()), true);
  assert.equal(notifications, 1);

  unsubscribe();
  harness.facade.archive();
  assert.equal(notifications, 1);
});

test("start is idempotent and stop removes the owned visibility listener", async () => {
  const visibilityTarget = new EventTarget();
  Object.defineProperty(visibilityTarget, "visibilityState", { configurable: true, value: "visible", writable: true });
  let loads = 0;
  const harness = facadeHarness({
    api: {
      loadSessionMessages: async () => {
        loads += 1;
        return [];
      },
      loadSessionRoster: async () => [],
    },
    visibilityTarget,
  });

  harness.facade.start();
  harness.facade.start();
  await flush();
  assert.equal(loads, 1);
  visibilityTarget.dispatchEvent(new Event("visibilitychange"));
  await flush();
  assert.equal(loads, 2);

  harness.facade.stop();
  visibilityTarget.dispatchEvent(new Event("visibilitychange"));
  await flush();
  assert.equal(loads, 2);
});

function interfaceBody(source, name) {
  const match = source.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `${name} must remain declared`);
  return match[1];
}

function legacyChatOwnerFindings({ chatController, contracts }) {
  const findings = [];
  const legacyControllerPatterns = [
    ["activeChat", /\bactiveChat\b/],
    ["createForegroundPoller", /\bcreateForegroundPoller\b/],
    ["createRequestGate", /\bcreateRequestGate\b/],
    ["lastMarkedMessageId", /\blastMarkedMessageId\b/],
    ["latestChatMessageId", /\blatestChatMessageId\b/],
    ["refreshActiveChat", /\brefreshActiveChat\b/],
  ];
  for (const [name, pattern] of legacyControllerPatterns) {
    if (pattern.test(chatController)) findings.push(`chatController.${name}`);
  }
  const context = interfaceBody(contracts, "ControllerChatSurfaceContext");
  for (const key of ["lastMarkedMessageId", "messages", "poller", "requestGate", "roster"]) {
    if (new RegExp(`\\b${key}\\??:`).test(context)) findings.push(`ControllerChatSurfaceContext.${key}`);
  }
  return findings;
}

function legacyChatSurfaceCommandFindings({ chatController, sheet, view }) {
  const findings = [];
  const chatView = view.slice(
    view.indexOf("export function openSessionChatSheet"),
    view.indexOf("export function openSessionSheet")
  );
  const patterns = [
    ["chatController.surfaceStateCommand", /\b(?:sheet|context\.sheet)\??\.(?:setArchived|setState)\b/],
    ["SessionChatSheet.imperativeHandle", /\b(?:forwardRef|useImperativeHandle|SessionChatContentContract)\b/],
    ["sessionSurfaceViews.chatDomQuery", /\bquerySelector(?:All)?\s*\(/],
    ["sessionSurfaceViews.chatNativeListener", /\baddEventListener\s*\(/],
    ["sessionSurfaceViews.chatStateCommand", /\b(?:setArchived|setState)\b/],
  ];
  for (const [name, pattern] of patterns) {
    const source = name.startsWith("chatController")
      ? chatController
      : name.startsWith("SessionChatSheet")
        ? sheet
        : chatView;
    if (pattern.test(source)) findings.push(name);
  }
  return findings;
}

test("chat feed ownership gate keeps controller query, cursor, gate, and poller owners retired", () => {
  const sources = {
    chatController: readFileSync(new URL("../src/controller/chatController.ts", import.meta.url), "utf8"),
    contracts: readFileSync(new URL("../src/controllerContracts.ts", import.meta.url), "utf8"),
    facade: readFileSync(new URL("../src/features/chat/chatFeedFacade.ts", import.meta.url), "utf8"),
    session: readFileSync(new URL("../src/sessionController.ts", import.meta.url), "utf8"),
  };
  assert.deepEqual(legacyChatOwnerFindings(sources), []);
  assert.match(sources.chatController, /createChatFeedFacade\(\{/);
  assert.match(sources.session, /ControllerChatSurfaceContext\)\.feed\.stop\(\)/);
  for (const owner of [
    "lastMarkedMessageId",
    "createForegroundPoller",
    "createRequestGate",
    "messages",
    "poller",
    "roster",
  ]) {
    assert.match(sources.facade, new RegExp(`\\b${owner}\\b`));
  }

  const canary = { ...sources, chatController: `${sources.chatController}\nfunction refreshActiveChat() {}` };
  assert.deepEqual(legacyChatOwnerFindings(canary), ["chatController.refreshActiveChat"]);
});

test("chat surface state boundary keeps legacy commands and native DOM ownership retired", () => {
  const sources = {
    chatController: readFileSync(new URL("../src/controller/chatController.ts", import.meta.url), "utf8"),
    sheet: readFileSync(new URL("../src/sheets/SessionChatSheet.tsx", import.meta.url), "utf8"),
    view: readFileSync(new URL("../src/views/sessionSurfaceViews.js", import.meta.url), "utf8"),
  };
  assert.deepEqual(legacyChatSurfaceCommandFindings(sources), []);
  assert.match(sources.sheet, /useSyncExternalStore\(/);
  assert.match(sources.view, /feed,\s*headerSub,/);

  const controllerCanary = {
    ...sources,
    chatController: `${sources.chatController}\nfunction legacy(sheet) { sheet?.setState({}); }`,
  };
  assert.deepEqual(legacyChatSurfaceCommandFindings(controllerCanary), ["chatController.surfaceStateCommand"]);

  const sheetCanary = { ...sources, sheet: `${sources.sheet}\nconst legacy = useImperativeHandle;` };
  assert.deepEqual(legacyChatSurfaceCommandFindings(sheetCanary), ["SessionChatSheet.imperativeHandle"]);

  const viewCanary = {
    ...sources,
    view: sources.view.replace(
      "registerChatContent(mounted, content);",
      'mounted.surface.querySelector("[data-chat-feed]")?.addEventListener("click", () => {});\n' +
        "  registerChatContent(mounted, content);"
    ),
  };
  assert.deepEqual(legacyChatSurfaceCommandFindings(viewCanary), [
    "sessionSurfaceViews.chatDomQuery",
    "sessionSurfaceViews.chatNativeListener",
  ]);
});
