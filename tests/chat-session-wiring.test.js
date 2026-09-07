import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createSessionChatOpener } from "../src/features/chat/chatSessionWiring.ts";

function chatModelHarness() {
  const calls = [];
  const closeListeners = new Set();
  const model = {
    block: async () => true,
    canWithdraw: true,
    courts: [{ id: 8, name: "示範球場" }],
    feed: { getSnapshot: () => ({}) },
    post: async () => ({ outcome: "OK" }),
    release: () => calls.push("release"),
    report: () => undefined,
    session: { sessionId: 731 },
    start: () => calls.push("start"),
    subscribeClose(listener) {
      calls.push("subscribe-close");
      closeListeners.add(listener);
      return () => {
        calls.push("unsubscribe-close");
        closeListeners.delete(listener);
      };
    },
    withdraw: () => undefined,
  };
  return {
    calls,
    emitClose(options) {
      for (const listener of closeListeners) listener(options);
    },
    model,
  };
}

test("app Chat wiring opens one concrete surface, subscribes lifecycle, then starts the model", () => {
  const harness = chatModelHarness();
  let options;
  const surface = { close: () => {} };
  const openSessionChat = createSessionChatOpener({
    createSessionChat: (sessionId) => {
      harness.calls.push(["create", sessionId]);
      return harness.model;
    },
    openChatSurface: (session, nextOptions) => {
      harness.calls.push(["open-surface", session.sessionId]);
      options = nextOptions;
      return surface;
    },
  });

  assert.equal(openSessionChat(731), surface);
  assert.deepEqual(harness.calls, [["create", 731], ["open-surface", 731], "subscribe-close", "start"]);
  assert.equal(options.feed, harness.model.feed);
  assert.equal(options.onBlock, harness.model.block);
  assert.equal(options.onPost, harness.model.post);
  assert.equal(options.onReport, harness.model.report);
  assert.equal(options.onWithdraw, harness.model.withdraw);

  options.onClose();
  assert.deepEqual(harness.calls.slice(-2), ["unsubscribe-close", "release"]);
});

test("controller lifecycle requests close the app-owned surface with the same options", () => {
  const harness = chatModelHarness();
  let options;
  const closeCalls = [];
  const surface = {
    close(closeOptions) {
      closeCalls.push(closeOptions);
      options.onClose();
    },
  };
  const openSessionChat = createSessionChatOpener({
    createSessionChat: () => harness.model,
    openChatSurface: (_session, nextOptions) => {
      options = nextOptions;
      return surface;
    },
  });

  openSessionChat(731);
  harness.emitClose({ reason: "chat-authority-changed", restoreFocus: false });
  assert.deepEqual(closeCalls, [{ reason: "chat-authority-changed", restoreFocus: false }]);
  assert.deepEqual(harness.calls.slice(-2), ["unsubscribe-close", "release"]);

  harness.emitClose({ reason: "stale-second-close" });
  assert.equal(closeCalls.length, 1, "the surface listener is detached after close");
});

test("a missing or failed concrete surface releases the model without starting it", () => {
  const cases = [
    { error: null, openChatSurface: () => null },
    {
      error: /mount failed/,
      openChatSurface: () => {
        throw new Error("mount failed");
      },
    },
  ];
  for (const { error, openChatSurface } of cases) {
    const harness = chatModelHarness();
    const openSessionChat = createSessionChatOpener({ createSessionChat: () => harness.model, openChatSurface });
    if (!error) assert.equal(openSessionChat(731), null);
    else assert.throws(() => openSessionChat(731), /mount failed/);
    assert.deepEqual(harness.calls, ["release"]);
  }
});

test("a lifecycle-start failure closes an already-mounted surface and releases the model", () => {
  const harness = chatModelHarness();
  harness.model.start = () => {
    harness.calls.push("start");
    throw new Error("start failed");
  };
  const closeCalls = [];
  const surface = { close: (options) => closeCalls.push(options) };
  const openSessionChat = createSessionChatOpener({
    createSessionChat: () => harness.model,
    openChatSurface: () => surface,
  });

  assert.throws(() => openSessionChat(731), /start failed/);
  assert.deepEqual(closeCalls, [{ reason: "chat-open-failed", restoreFocus: false }]);
  assert.deepEqual(harness.calls, ["subscribe-close", "start", "unsubscribe-close", "release"]);
});

function legacyConcreteChatWiringFindings({ chatController, contracts, main, provider, sessionController }) {
  const findings = [];
  const patterns = [
    ["SessionControllerOptions.openChat", sessionController, /\bopenChat\??:\s*ChatControllerOptions\["openChat"\]/],
    ["ChatControllerDependencies.openChat", chatController, /\bopenChat:\s*\(/],
    ["chatController.openChatCall", chatController, /\bconst\s+sheet\s*=\s*openChat\s*\(/],
    ["main.concreteOpenChatMapping", main, /\bopenChat:\s*openSessionChatSheet\b/],
    ["ControllerApi.openSessionChat", contracts, /\bopenSessionChat:\s*\(/],
    ["AppServices.controllerOpenSessionChat", provider, /\bcontroller\.openSessionChat\b/],
  ];
  for (const [name, source, pattern] of patterns) {
    if (pattern.test(source)) findings.push(name);
  }
  return findings;
}

test("Chat app-wiring gate keeps concrete surface selection outside controllers", () => {
  const sources = {
    chatController: readFileSync(new URL("../src/controller/chatController.ts", import.meta.url), "utf8"),
    contracts: readFileSync(new URL("../src/controllerContracts.ts", import.meta.url), "utf8"),
    main: readFileSync(new URL("../src/main.js", import.meta.url), "utf8"),
    provider: readFileSync(new URL("../src/app/AppServicesProvider.tsx", import.meta.url), "utf8"),
    sessionController: readFileSync(new URL("../src/sessionController.ts", import.meta.url), "utf8"),
  };
  assert.deepEqual(legacyConcreteChatWiringFindings(sources), []);
  assert.match(sources.chatController, /createSessionChat:/);
  assert.match(sources.main, /createSessionChatOpener\(\{/);
  assert.match(sources.provider, /openSessionChat: AppServices\["openSessionChat"\]/);

  const canaries = [
    ["sessionController", '\ninterface Canary { openChat?: ChatControllerOptions["openChat"]; }'],
    ["chatController", "\ninterface Canary { openChat: () => void; }"],
    ["chatController", "\nconst sheet = openChat();"],
    ["main", "\nconst canary = { openChat: openSessionChatSheet };"],
    ["contracts", "\ninterface Canary { openSessionChat: () => void; }"],
    ["provider", "\nconst canary = controller.openSessionChat;"],
  ];
  for (const [key, injection] of canaries) {
    const drifted = { ...sources, [key]: `${sources[key]}${injection}` };
    assert.equal(legacyConcreteChatWiringFindings(drifted).length, 1, `${key} canary stayed green`);
  }
});
