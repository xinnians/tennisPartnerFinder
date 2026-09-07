import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createBlockedPlayersFacade } from "../src/features/blocked-players/blockedPlayersFacade.ts";

function deferred() {
  let reject;
  let resolve;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
}

function createHarness(loadMyPlayerBlocks) {
  let auth = { epoch: 1, identity: "account-a" };
  const facade = createBlockedPlayersFacade({
    api: { loadMyPlayerBlocks },
    captureAuthSnapshot: () => ({ ...auth }),
    isCurrentAuthSnapshot: (snapshot) => snapshot.epoch === auth.epoch && snapshot.identity === auth.identity,
  });
  return {
    facade,
    setAuth(next) {
      auth = next;
    },
  };
}

test("blockedPlayers facade publishes each three-field snapshot atomically", async () => {
  const rows = [{ blockedNickname: "封鎖球友", blockedProfileId: 31, createdAt: "2026-08-01" }];
  const { facade } = createHarness(async () => rows);
  const observed = [];
  const unsubscribe = facade.subscribe((snapshot) => observed.push(snapshot));

  assert.deepEqual(facade.getSnapshot(), {
    blockedPlayers: [],
    blockedPlayersError: "",
    blockedPlayersStatus: "idle",
  });
  assert.equal(await facade.load(), true);
  assert.deepEqual(
    observed.map(({ blockedPlayers, blockedPlayersError, blockedPlayersStatus }) => ({
      blockedPlayers,
      blockedPlayersError,
      blockedPlayersStatus,
    })),
    [
      { blockedPlayers: [], blockedPlayersError: "", blockedPlayersStatus: "loading" },
      { blockedPlayers: rows, blockedPlayersError: "", blockedPlayersStatus: "ready" },
    ]
  );
  assert.equal(Object.isFrozen(facade.getSnapshot()), true);
  assert.equal(Object.isFrozen(facade.getSnapshot().blockedPlayers), true);

  unsubscribe();
  facade.clearForAccountChange();
  assert.equal(observed.length, 2, "an unsubscribed observer receives no account-clear notification");
});

test("the newest same-account blockedPlayers refresh wins", async () => {
  const first = deferred();
  const second = deferred();
  const queue = [first, second];
  const { facade } = createHarness(() => queue.shift().promise);

  const firstRefresh = facade.refresh();
  const secondRefresh = facade.refresh();
  second.resolve([{ blockedNickname: "新資料", blockedProfileId: 2 }]);
  assert.equal(await secondRefresh, true);
  first.resolve([{ blockedNickname: "舊資料", blockedProfileId: 1 }]);
  assert.equal(await firstRefresh, false);
  assert.deepEqual(
    facade.getSnapshot().blockedPlayers.map((row) => row.blockedProfileId),
    [2]
  );
});

test("auth snapshot rejects a late response even without relying on request generation", async () => {
  const pending = deferred();
  const { facade, setAuth } = createHarness(() => pending.promise);
  const refresh = facade.refresh();

  setAuth({ epoch: 2, identity: "account-b" });
  pending.resolve([{ blockedNickname: "帳號 A", blockedProfileId: 1 }]);

  assert.equal(await refresh, false);
  assert.deepEqual(facade.getSnapshot().blockedPlayers, []);
  assert.equal(facade.getSnapshot().blockedPlayersStatus, "loading");
});

test("account clear invalidates the request generation and immediately hides prior-account rows", async () => {
  const pending = deferred();
  let call = 0;
  const { facade, setAuth } = createHarness(() => {
    call += 1;
    return call === 1 ? Promise.resolve([{ blockedNickname: "帳號 A", blockedProfileId: 1 }]) : pending.promise;
  });
  assert.equal(await facade.refresh(), true);
  const lateRefresh = facade.refresh();

  setAuth({ epoch: 2, identity: "account-b" });
  facade.clearForAccountChange();
  assert.deepEqual(facade.getSnapshot(), {
    blockedPlayers: [],
    blockedPlayersError: "",
    blockedPlayersStatus: "idle",
  });

  pending.resolve([{ blockedNickname: "帳號 A 延遲資料", blockedProfileId: 3 }]);
  assert.equal(await lateRefresh, false);
  assert.deepEqual(facade.getSnapshot().blockedPlayers, []);
});

test("a current blockedPlayers error preserves rows and publishes one complete error snapshot", async () => {
  let shouldFail = false;
  const { facade } = createHarness(async () => {
    if (shouldFail) throw new Error("offline");
    return [{ blockedNickname: "既有資料", blockedProfileId: 8 }];
  });
  await facade.refresh();
  const observed = [];
  facade.subscribe((snapshot) => observed.push(snapshot));
  shouldFail = true;

  assert.equal(await facade.refresh(), false);
  assert.equal(observed.length, 2);
  assert.deepEqual(observed.at(-1), {
    blockedPlayers: [{ blockedNickname: "既有資料", blockedProfileId: 8 }],
    blockedPlayersError: "封鎖清單暫時無法載入。",
    blockedPlayersStatus: "error",
  });
});

function interfaceBody(source, name) {
  const match = source.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `${name} must remain declared`);
  return match[1];
}

function legacyOwnershipFindings(sources) {
  const findings = [];
  const stateBody = interfaceBody(sources.contracts, "SessionControllerState");
  for (const key of ["blockedPlayers", "blockedPlayersError", "blockedPlayersStatus"]) {
    if (new RegExp(`\\b${key}\\??:`).test(stateBody)) findings.push(`SessionControllerState.${key}`);
    if (new RegExp(`store\\.setState\\([\\s\\S]*?\\b${key}\\s*:`).test(sources.mySessions)) {
      findings.push(`mySessionsController.${key}`);
    }
    if (new RegExp(`store\\.setState\\([\\s\\S]*?\\b${key}\\s*:`).test(sources.auth)) {
      findings.push(`authController.${key}`);
    }
  }
  return findings;
}

test("blockedPlayers ownership gate keeps legacy controller state and writes retired", () => {
  const sources = {
    auth: readFileSync(new URL("../src/controller/authController.ts", import.meta.url), "utf8"),
    chat: readFileSync(new URL("../src/controller/chatController.ts", import.meta.url), "utf8"),
    contracts: readFileSync(new URL("../src/controllerContracts.ts", import.meta.url), "utf8"),
    main: readFileSync(new URL("../src/main.js", import.meta.url), "utf8"),
    mySessions: readFileSync(new URL("../src/controller/mySessionsController.ts", import.meta.url), "utf8"),
    session: readFileSync(new URL("../src/sessionController.ts", import.meta.url), "utf8"),
  };
  assert.deepEqual(legacyOwnershipFindings(sources), []);
  assert.match(sources.auth, /blockedPlayers\.clearForAccountChange\(\)/);
  assert.match(sources.mySessions, /blockedPlayers\.getSnapshot\(\)\.blockedPlayers/);
  assert.match(sources.mySessions, /blockedPlayers\.refresh\(authSnapshot\)/);
  assert.match(sources.main, /controller\.blockedPlayers\.refresh\(\)/);
  assert.match(sources.chat, /refreshBlockedPlayers\(context\.authSnapshot\)/);
  assert.match(sources.session, /refreshBlockedPlayers: \(snapshot\) => blockedPlayers\.refresh\(snapshot\)/);
  assert.doesNotMatch(
    [sources.auth, sources.chat, sources.main, sources.mySessions, sources.session].join("\n"),
    /refreshMyPlayerBlocks|blockedPlayerGate/
  );

  const canary = { ...sources, mySessions: `${sources.mySessions}\nstore.setState({ blockedPlayersStatus: "idle" });` };
  assert.deepEqual(legacyOwnershipFindings(canary), ["mySessionsController.blockedPlayersStatus"]);
});
