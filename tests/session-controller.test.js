import assert from "node:assert/strict";
import test from "node:test";

import { MAP_IDLE_DEBOUNCE_MS } from "../src/config.js";
import { createSessionController } from "../src/sessionController.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function futureSession(overrides = {}) {
  return {
    sessionId: 41,
    sportCode: "tennis",
    courtId: 8,
    court: "示範球場",
    courtDistrict: "大安區",
    courtLat: 25.03,
    courtLng: 121.54,
    startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    playType: "單打",
    ntrpMin: 3,
    ntrpMax: 4,
    slotsTotal: 2,
    slotsRemaining: 1,
    notes: "測試球局",
    hostNickname: "示範松果",
    hostNtrp: 3.5,
    hostProfileComplete: true,
    status: "open",
    ...overrides,
  };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function withNavigatorGeolocation(geolocation, run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { geolocation } });
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
      else delete globalThis.navigator;
    });
}

function createIntentStore(initial = null) {
  let intent = initial;
  const events = [];
  return {
    clear() {
      events.push({ type: "clear" });
      intent = null;
    },
    events,
    read() {
      events.push({ type: "read" });
      return intent;
    },
    save(nextIntent) {
      events.push({ intent: nextIntent, type: "save" });
      intent = nextIntent;
      return intent;
    },
    value: () => intent,
  };
}

function createSurface(onClose = () => {}) {
  return {
    closeCalls: 0,
    courtUpdates: [],
    close(options) {
      this.closeCalls += 1;
      onClose(options);
    },
    setCourts(courts, options) {
      this.courtUpdates.push({ courts, options });
    },
  };
}

function createHarness(overrides = {}) {
  const renders = [];
  const pinBatches = [];
  const opened = [];
  const confirmations = [];
  const courtDrawers = [];
  const createSheets = [];
  const loginPrompts = [];
  const profilePrompts = [];
  const toasts = [];
  const session = overrides.session ?? futureSession();
  const api = {
    loadSessionDiscovery: async () => [session],
    loadMySessions: async () => [],
    requestToJoinSession: async () => ({ outcome: "OK", reloadRequired: false }),
    withdrawFromSession: async () => ({ outcome: "OK", reloadRequired: false }),
    ...overrides.api,
  };
  const controller = createSessionController({
    api,
    mapTools: overrides.mapTools,
    render: (view) => renders.push(view),
    renderPins: (sessions) => pinBatches.push(sessions),
    openSession: (openedSession, handlers) => {
      const detail = createSurface();
      opened.push({ detail, handlers, session: openedSession });
      return detail;
    },
    openJoinConfirmation: (openedSession, handlers) => {
      const detail = createSurface(handlers.onClose);
      confirmations.push({ detail, handlers, session: openedSession });
      return detail;
    },
    openCourtDrawer: (court, sessions, handlers) => {
      const detail = createSurface();
      courtDrawers.push({ court, detail, handlers, sessions });
      return detail;
    },
    openCreateSession: (handlers) => {
      const detail = createSurface(handlers.onClose);
      createSheets.push({ detail, handlers });
      return detail;
    },
    openLogin: (handlers) => {
      const detail = createSurface(handlers.onClose);
      loginPrompts.push({ detail, handlers });
      return detail;
    },
    promptProfile: (context) => {
      const detail = createSurface(context.onClose);
      profilePrompts.push({ ...context, detail });
      return detail;
    },
    intentStore: overrides.intentStore,
    toast: (message) => toasts.push(message),
  });
  return {
    api,
    confirmations,
    controller,
    courtDrawers,
    createSheets,
    loginPrompts,
    opened,
    pinBatches,
    profilePrompts,
    renders,
    session,
    toasts,
  };
}

function openAction(harness, sessionId = harness.session.sessionId) {
  harness.controller.openSession(sessionId);
  return harness.opened.at(-1);
}

test("expired join and withdrawal refresh authority without success toasts", async () => {
  let discoveryCalls = 0;
  let participationCalls = 0;
  let joinCalls = 0;
  const joinHarness = createHarness({
    api: {
      loadSessionDiscovery: async () => {
        discoveryCalls += 1;
        return [futureSession()];
      },
      loadMySessions: async () => {
        participationCalls += 1;
        return [];
      },
      requestToJoinSession: async () => {
        joinCalls += 1;
        return { outcome: "SESSION_EXPIRED", reloadRequired: true };
      },
    },
  });
  await joinHarness.controller.setAuthState({ user: { id: "guest" } }, { complete: true });
  await joinHarness.controller.loadDiscovery();
  const joinDetail = openAction(joinHarness);
  joinDetail.handlers.onPrimary();
  const joinConfirmation = joinHarness.confirmations.at(-1);
  let confirmationClosed = 0;
  await joinConfirmation.handlers.onConfirm(() => {
    confirmationClosed += 1;
  });

  assert.equal(joinCalls, 1);
  assert.ok(discoveryCalls >= 2, "expired join reloads discovery");
  assert.ok(participationCalls >= 2, "expired join reloads participation");
  assert.equal(confirmationClosed, 1);
  assert.equal(joinDetail.detail.closeCalls, 1, "expired result closes obsolete detail actions");
  assert.deepEqual(joinHarness.toasts, ["球局狀態已更新，請重新載入。"]);

  let withdrawCalls = 0;
  const withdrawHarness = createHarness({
    api: {
      loadMySessions: async () => [{ sessionId: 41, viewerParticipantStatus: "requested" }],
      withdrawFromSession: async () => {
        withdrawCalls += 1;
        return { outcome: "SESSION_EXPIRED", reloadRequired: true };
      },
    },
  });
  await withdrawHarness.controller.setAuthState({ user: { id: "guest" } }, { complete: true });
  await withdrawHarness.controller.loadDiscovery();
  const withdrawDetail = openAction(withdrawHarness);
  await withdrawDetail.handlers.onWithdraw();

  assert.equal(withdrawCalls, 1);
  assert.equal(withdrawDetail.detail.closeCalls, 1, "expired withdrawal closes obsolete detail actions");
  assert.deepEqual(withdrawHarness.toasts, ["球局狀態已更新，請重新載入。"]);
});

test("only the newest location callback can update discovery and map readiness replays it", async () => {
  const callbacks = [];
  const mapCalls = [];
  const discoveryBounds = [];
  let mapReady = false;
  const harness = createHarness({
    api: {
      loadSessionDiscovery: async ({ bounds }) => {
        discoveryBounds.push(bounds);
        return [futureSession()];
      },
    },
    mapTools: {
      setUserLocation(location) {
        mapCalls.push(location);
        return mapReady ? { south: location.lat - 0.04, west: location.lng - 0.05, north: location.lat + 0.04, east: location.lng + 0.05 } : null;
      },
      subscribeToMapIdle() {},
    },
  });

  await withNavigatorGeolocation(
    {
      getCurrentPosition(success, failure) {
        callbacks.push({ failure, success });
      },
    },
    async () => {
      harness.controller.requestCurrentLocation();
      harness.controller.requestCurrentLocation();
      harness.controller.requestCurrentLocation();
      callbacks[2].success({ coords: { latitude: 25.06, longitude: 121.58 } });
      callbacks[0].failure(new Error("stale denial"));
      callbacks[1].success({ coords: { latitude: 25.03, longitude: 121.55 } });
      await flush();

      assert.deepEqual(mapCalls, [{ lat: 25.06, lng: 121.58 }], "stale callbacks do not move the marker");
      harness.controller.requestCurrentLocation();
      assert.equal(callbacks.length, 4, "a stale denial cannot block a later explicit request");

      mapReady = true;
      harness.controller.attachMap({});
      await flush();
    }
  );

  assert.deepEqual(mapCalls.at(-1), { lat: 25.06, lng: 121.58 }, "map-ready replay uses only the newest coordinate");
  assert.ok(mapCalls.length >= 2, "map-ready replay fits the retained location");
  const replayBounds = discoveryBounds.at(-1);
  assert.ok(Math.abs(replayBounds.south - 25.02) < 0.000001);
  assert.ok(Math.abs(replayBounds.west - 121.53) < 0.000001);
  assert.ok(Math.abs(replayBounds.north - 25.1) < 0.000001);
  assert.ok(Math.abs(replayBounds.east - 121.63) < 0.000001);
});

test("an ephemeral location never reaches the join mutation payload", async () => {
  const callbacks = [];
  const mutationArgs = [];
  const harness = createHarness({
    api: {
      requestToJoinSession: async (...args) => {
        mutationArgs.push(args);
        return { outcome: "OK", reloadRequired: false };
      },
    },
    mapTools: {
      setUserLocation(location) {
        return { south: location.lat - 0.04, west: location.lng - 0.05, north: location.lat + 0.04, east: location.lng + 0.05 };
      },
    },
  });

  await harness.controller.setAuthState({ user: { id: "guest" } }, { complete: true });
  await harness.controller.loadDiscovery();
  await withNavigatorGeolocation(
    {
      getCurrentPosition(success, failure) {
        callbacks.push({ failure, success });
      },
    },
    async () => {
      harness.controller.requestCurrentLocation();
      callbacks[0].success({ coords: { latitude: 25.03, longitude: 121.55 } });
      await flush();
    }
  );

  const detail = openAction(harness);
  detail.handlers.onPrimary();
  await harness.confirmations.at(-1).handlers.onConfirm(() => {});
  assert.deepEqual(mutationArgs, [[harness.session.sessionId]]);
  assert.doesNotMatch(JSON.stringify(mutationArgs), /25\.03|121\.55/);
});

test("a bounds refresh clears stale cards and pins until the newest discovery result arrives", async () => {
  const first = deferred();
  const second = deferred();
  let discoveryCall = 0;
  const firstSession = futureSession({ sessionId: 1 });
  const secondSession = futureSession({ sessionId: 2, court: "新範圍球場" });
  const harness = createHarness({
    api: {
      loadSessionDiscovery: () => (discoveryCall++ === 0 ? first.promise : second.promise),
    },
  });

  const initial = harness.controller.loadDiscovery();
  first.resolve([firstSession]);
  await initial;
  const refresh = harness.controller.loadDiscovery({ south: 25.1, west: 121.6, north: 25.12, east: 121.62 });

  assert.deepEqual(harness.renders.at(-1).sessions, []);
  assert.deepEqual(harness.pinBatches.at(-1), []);
  second.resolve([secondSession]);
  await refresh;
  assert.deepEqual(harness.renders.at(-1).sessions.map((item) => item.sessionId), [2]);
});

test("authoritative discovery changes close a detail whose session fields are now stale", async () => {
  let discoveryCall = 0;
  const harness = createHarness({
    api: {
      loadSessionDiscovery: async () =>
        discoveryCall++ === 0 ? [futureSession({ slotsRemaining: 1, status: "open" })] : [futureSession({ slotsRemaining: 0, status: "full" })],
    },
  });

  await harness.controller.loadDiscovery();
  const staleDetail = openAction(harness);
  assert.equal(staleDetail.handlers.action.label, "申請加入");

  await harness.controller.retryDiscovery();
  assert.equal(staleDetail.detail.closeCalls, 1, "an obsolete CTA is not left interactive after a refresh");

  const freshDetail = openAction(harness);
  assert.equal(freshDetail.handlers.action.label, "已額滿");
  assert.equal(freshDetail.handlers.action.disabled, true);
});

test("a session disappearing from the same viewport closes its stale public detail", async () => {
  let discoveryCall = 0;
  const harness = createHarness({
    api: {
      loadSessionDiscovery: async () => (discoveryCall++ === 0 ? [futureSession()] : []),
    },
  });

  await harness.controller.loadDiscovery();
  const staleDetail = openAction(harness);
  await harness.controller.retryDiscovery();

  assert.equal(staleDetail.detail.closeCalls, 1, "a cancelled or expired session cannot keep its old CTA open");
});

test("a viewport refresh closes an active court drawer before its stale cards can target cleared sessions", async () => {
  const initial = deferred();
  const refresh = deferred();
  let discoveryCall = 0;
  const session = futureSession({ courtId: 8 });
  const harness = createHarness({
    api: {
      loadSessionDiscovery: () => (discoveryCall++ === 0 ? initial.promise : refresh.promise),
    },
  });

  const firstLoad = harness.controller.loadDiscovery();
  initial.resolve([session]);
  await firstLoad;
  harness.controller.openCourt({ id: 8, name: "示範球場" });
  const courtDrawer = harness.courtDrawers.at(-1);
  assert.deepEqual(courtDrawer.sessions.map((item) => item.sessionId), [session.sessionId]);

  const secondLoad = harness.controller.loadDiscovery({ south: 25.1, west: 121.6, north: 25.12, east: 121.62 });
  assert.equal(courtDrawer.detail.closeCalls, 1, "stale court cards are removed while the new viewport is loading");
  refresh.resolve([]);
  await secondLoad;
});

test("auth epochs clear stale participation on logout and account switches", async () => {
  const pendingParticipation = [];
  const harness = createHarness({
    api: {
      loadMySessions: () => {
        const next = deferred();
        pendingParticipation.push(next);
        return next.promise;
      },
    },
  });
  await harness.controller.loadDiscovery();

  const authA = harness.controller.setAuthState({ user: { id: "A" } }, { complete: true });
  await flush();
  const logout = harness.controller.setAuthState(null, null);
  pendingParticipation[0].resolve([{ sessionId: 41, viewerParticipantStatus: "requested" }]);
  await Promise.all([authA, logout]);
  let detail = openAction(harness);
  assert.equal(detail.handlers.action.label, "申請加入");

  const accountA = harness.controller.setAuthState({ user: { id: "A" } }, { complete: true });
  await flush();
  const accountB = harness.controller.setAuthState({ user: { id: "B" } }, { complete: true });
  await flush();
  pendingParticipation[2].resolve([{ sessionId: 41, viewerParticipantStatus: "accepted" }]);
  await accountB;
  pendingParticipation[1].resolve([{ sessionId: 41, viewerParticipantStatus: "requested" }]);
  await accountA;
  detail = openAction(harness);
  assert.equal(detail.handlers.action.label, "查看聯絡方式");
});

test("a delayed participation refresh closes a detail whose CTA would otherwise become stale", async () => {
  const participation = deferred();
  const harness = createHarness({
    api: { loadMySessions: () => participation.promise },
  });

  await harness.controller.loadDiscovery();
  const authUpdate = harness.controller.setAuthState({ user: { id: "account-a" } }, { complete: true });
  await flush();
  const staleDetail = openAction(harness);
  assert.equal(staleDetail.handlers.action.label, "申請加入");

  participation.resolve([{ sessionId: 41, viewerParticipantStatus: "requested" }]);
  await authUpdate;
  assert.equal(staleDetail.detail.closeCalls, 1, "the old join CTA is removed once participation is authoritative");
});

test("an account switch closes an open detail before its stale participation action survives", async () => {
  let participationLoad = 0;
  const harness = createHarness({
    api: {
      loadMySessions: async () => {
        participationLoad += 1;
        return participationLoad === 1 ? [{ sessionId: 41, viewerParticipantStatus: "requested" }] : [];
      },
    },
  });

  await harness.controller.loadDiscovery();
  await harness.controller.setAuthState({ user: { id: "account-a" } }, { complete: true });
  const staleDetail = openAction(harness);
  assert.equal(staleDetail.handlers.action.label, "申請等待中");

  await harness.controller.setAuthState({ user: { id: "account-b" } }, { complete: true });
  assert.equal(staleDetail.detail.closeCalls, 1, "the prior account's detail closes synchronously");

  const currentDetail = openAction(harness);
  assert.equal(currentDetail.handlers.action.label, "申請加入");
});

test("an account switch invalidates a pending join confirmation before it can mutate for the next account", async () => {
  let requestCalls = 0;
  const harness = createHarness({
    api: {
      requestToJoinSession: async () => {
        requestCalls += 1;
        return { outcome: "OK", reloadRequired: false };
      },
    },
  });

  await harness.controller.loadDiscovery();
  await harness.controller.setAuthState({ user: { id: "account-a" } }, { complete: true });
  const detail = openAction(harness);
  detail.handlers.onPrimary();
  const staleConfirmation = harness.confirmations.at(-1);
  assert.ok(staleConfirmation, "eligible account A can open a confirmation");

  await harness.controller.setAuthState({ user: { id: "account-b" } }, { complete: true });
  assert.equal(staleConfirmation.detail.closeCalls, 1, "switching identity closes the pending confirmation");
  await staleConfirmation.handlers.onConfirm(() => {});
  assert.equal(requestCalls, 0, "a stale confirmation cannot send B's join RPC");
});

test("a same-account profile eligibility reset invalidates its pending join confirmation", async () => {
  let requestCalls = 0;
  const harness = createHarness({
    api: {
      requestToJoinSession: async () => {
        requestCalls += 1;
        return { outcome: "OK", reloadRequired: false };
      },
    },
  });

  await harness.controller.loadDiscovery();
  await harness.controller.setAuthState({ user: { id: "account-a" } }, { complete: true });
  const detail = openAction(harness);
  detail.handlers.onPrimary();
  const staleConfirmation = harness.confirmations.at(-1);

  await harness.controller.setAuthState({ user: { id: "account-a" } }, null);
  assert.equal(staleConfirmation.detail.closeCalls, 1, "profile loading cannot leave a previously eligible confirmation open");
  await staleConfirmation.handlers.onConfirm(() => {});
  assert.equal(requestCalls, 0, "the stale handler re-checks profile eligibility before an RPC");
});

test("an in-flight join cannot refresh or announce success after its account changes", async () => {
  const pendingJoin = deferred();
  let discoveryCalls = 0;
  const harness = createHarness({
    api: {
      loadSessionDiscovery: async () => {
        discoveryCalls += 1;
        return [futureSession()];
      },
      requestToJoinSession: () => pendingJoin.promise,
    },
  });

  await harness.controller.setAuthState({ user: { id: "account-a" } }, { complete: true });
  await harness.controller.loadDiscovery();
  const detail = openAction(harness);
  detail.handlers.onPrimary();
  const mutation = harness.confirmations.at(-1).handlers.onConfirm(() => {});
  await flush();

  await harness.controller.setAuthState({ user: { id: "account-b" } }, { complete: true });
  const discoveryCallsBeforeResolution = discoveryCalls;
  pendingJoin.resolve({ outcome: "OK", reloadRequired: false });
  await mutation;

  assert.equal(discoveryCalls, discoveryCallsBeforeResolution, "A's completion does not reload B's UI state");
  assert.equal(harness.toasts.includes("已送出申請。"), false);
});

test("an in-flight withdrawal cannot refresh or announce success after its account changes", async () => {
  const pendingWithdrawal = deferred();
  let discoveryCalls = 0;
  const harness = createHarness({
    api: {
      loadSessionDiscovery: async () => {
        discoveryCalls += 1;
        return [futureSession()];
      },
      loadMySessions: async () => [{ sessionId: 41, viewerParticipantStatus: "requested" }],
      withdrawFromSession: () => pendingWithdrawal.promise,
    },
  });

  await harness.controller.setAuthState({ user: { id: "account-a" } }, { complete: true });
  await harness.controller.loadDiscovery();
  const detail = openAction(harness);
  const mutation = detail.handlers.onWithdraw();
  await flush();

  await harness.controller.setAuthState({ user: { id: "account-b" } }, { complete: true });
  const discoveryCallsBeforeResolution = discoveryCalls;
  pendingWithdrawal.resolve({ outcome: "OK", reloadRequired: false });
  await mutation;

  assert.equal(discoveryCalls, discoveryCallsBeforeResolution, "A's completion does not reload B's UI state");
  assert.equal(harness.toasts.includes("已撤回申請。"), false);
});

test("a dismissed join confirmation cannot start a second lifecycle RPC for the same account and session", async () => {
  const pendingJoin = deferred();
  let joinCalls = 0;
  const harness = createHarness({
    api: {
      requestToJoinSession: () => {
        joinCalls += 1;
        return pendingJoin.promise;
      },
    },
  });

  await harness.controller.setAuthState({ user: { id: "account-a" } }, { complete: true });
  await harness.controller.loadDiscovery();
  const detail = openAction(harness);
  detail.handlers.onPrimary();
  const confirmation = harness.confirmations.at(-1);
  const mutation = confirmation.handlers.onConfirm(() => {});
  await flush();
  assert.equal(joinCalls, 1);

  // The dialog can be dismissed while the network is pending. Reopening the
  // same detail must not create another confirmation/RPC for this lifecycle.
  confirmation.detail.close();
  detail.handlers.onPrimary();
  await flush();
  assert.equal(harness.confirmations.length, 1);
  assert.equal(joinCalls, 1);
  assert.ok(harness.toasts.includes("這個球局的操作正在處理中。"));

  pendingJoin.resolve({ outcome: "OK", reloadRequired: false });
  await mutation;
});

test("a dismissed withdrawal sheet cannot start a second lifecycle RPC for the same account and session", async () => {
  const pendingWithdrawal = deferred();
  let withdrawalCalls = 0;
  const harness = createHarness({
    api: {
      loadMySessions: async () => [{ sessionId: 41, viewerParticipantStatus: "requested" }],
      withdrawFromSession: () => {
        withdrawalCalls += 1;
        return pendingWithdrawal.promise;
      },
    },
  });

  await harness.controller.setAuthState({ user: { id: "account-a" } }, { complete: true });
  await harness.controller.loadDiscovery();
  const firstDetail = openAction(harness);
  const firstMutation = firstDetail.handlers.onWithdraw();
  await flush();
  assert.equal(withdrawalCalls, 1);

  firstDetail.detail.close();
  const reopenedDetail = openAction(harness);
  const repeatedMutation = reopenedDetail.handlers.onWithdraw();
  await flush();
  assert.equal(withdrawalCalls, 1);
  assert.ok(harness.toasts.includes("這個球局的操作正在處理中。"));

  pendingWithdrawal.resolve({ outcome: "OK", reloadRequired: false });
  await Promise.all([firstMutation, repeatedMutation]);
});

test("an in-flight join blocks a conflicting withdrawal for the same account and session", async () => {
  const pendingJoin = deferred();
  let withdrawalCalls = 0;
  let participation = [];
  const harness = createHarness({
    api: {
      loadMySessions: async () => participation,
      requestToJoinSession: () => pendingJoin.promise,
      withdrawFromSession: async () => {
        withdrawalCalls += 1;
        return { outcome: "OK", reloadRequired: false };
      },
    },
  });

  await harness.controller.setAuthState({ user: { id: "account-a" } }, { complete: true });
  await harness.controller.loadDiscovery();
  const joinDetail = openAction(harness);
  joinDetail.handlers.onPrimary();
  const joinMutation = harness.confirmations.at(-1).handlers.onConfirm(() => {});
  await flush();

  // An external refresh can legitimately make the CTA look like a withdraw
  // before the original join RPC settles. It must still remain one lifecycle.
  participation = [{ sessionId: 41, viewerParticipantStatus: "requested" }];
  await harness.controller.setAuthState({ user: { id: "account-a" } }, { complete: true });
  const withdrawalDetail = openAction(harness);
  assert.equal(withdrawalDetail.handlers.action.secondaryLabel, "撤回申請");
  await withdrawalDetail.handlers.onWithdraw();
  assert.equal(withdrawalCalls, 0);
  assert.ok(harness.toasts.includes("這個球局的操作正在處理中。"));

  pendingJoin.resolve({ outcome: "OK", reloadRequired: false });
  await joinMutation;
});

test("a completed join closes only its own confirmation, not a newer confirmation for another session", async () => {
  const pendingJoin = deferred();
  const firstSession = futureSession({ sessionId: 41 });
  const secondSession = futureSession({ sessionId: 42, court: "另一座示範球場" });
  const harness = createHarness({
    session: firstSession,
    api: {
      loadSessionDiscovery: async () => [firstSession, secondSession],
      requestToJoinSession: () => pendingJoin.promise,
    },
  });

  await harness.controller.setAuthState({ user: { id: "account-a" } }, { complete: true });
  await harness.controller.loadDiscovery();
  const firstDetail = openAction(harness, firstSession.sessionId);
  firstDetail.handlers.onPrimary();
  const firstConfirmation = harness.confirmations.at(-1);
  const firstMutation = firstConfirmation.handlers.onConfirm(() => {});
  await flush();

  firstConfirmation.detail.close();
  const secondDetail = openAction(harness, secondSession.sessionId);
  secondDetail.handlers.onPrimary();
  const secondConfirmation = harness.confirmations.at(-1);
  assert.notEqual(secondConfirmation, firstConfirmation);

  pendingJoin.resolve({ outcome: "OK", reloadRequired: false });
  await firstMutation;
  assert.equal(secondConfirmation.detail.closeCalls, 0, "a stale completion must not close another session's confirmation");
});

test("a late map-ready location replay suppresses its own idle refresh", async () => {
  const callbacks = [];
  const discoveryBounds = [];
  let idleCallback = null;
  let mapReady = false;
  const location = { lat: 25.06, lng: 121.58 };
  const explicitBounds = { south: 25.02, west: 121.53, north: 25.1, east: 121.63 };
  const harness = createHarness({
    api: {
      loadSessionDiscovery: async ({ bounds }) => {
        discoveryBounds.push(bounds);
        return [futureSession()];
      },
    },
    mapTools: {
      getMapBounds: () => ({ south: 25.019, west: 121.529, north: 25.101, east: 121.631 }),
      setUserLocation(nextLocation) {
        if (!mapReady) return null;
        assert.deepEqual(nextLocation, location);
        queueMicrotask(() => idleCallback?.());
        return explicitBounds;
      },
      subscribeToMapIdle(_map, callback) {
        idleCallback = callback;
      },
    },
  });

  await withNavigatorGeolocation(
    {
      getCurrentPosition(success, failure) {
        callbacks.push({ failure, success });
      },
    },
    async () => {
      harness.controller.requestCurrentLocation();
      callbacks[0].success({ coords: { latitude: location.lat, longitude: location.lng } });
      await flush();
      assert.equal(discoveryBounds.length, 0, "the unready map cannot issue a viewport query");

      mapReady = true;
      harness.controller.attachMap({});
      await wait(MAP_IDLE_DEBOUNCE_MS + 40);
    }
  );

  assert.equal(discoveryBounds.length, 1, "the location fit and its late idle share one discovery refresh");
  assert.deepEqual(discoveryBounds[0], explicitBounds);
});

test("an explicit location viewport does not swallow a later manual map pan when no fit idle arrives", async () => {
  const callbacks = [];
  const discoveryBounds = [];
  const explicitBounds = { south: 25.02, west: 121.53, north: 25.1, east: 121.63 };
  const manualBounds = { south: 25.08, west: 121.61, north: 25.16, east: 121.71 };
  let currentBounds = explicitBounds;
  let idleCallback = null;
  const harness = createHarness({
    api: {
      loadSessionDiscovery: async ({ bounds }) => {
        discoveryBounds.push(bounds);
        return [futureSession()];
      },
    },
    mapTools: {
      getMapBounds: () => currentBounds,
      setUserLocation: () => explicitBounds,
      subscribeToMapIdle(_map, callback) {
        idleCallback = callback;
      },
    },
  });
  harness.controller.attachMap({});

  await withNavigatorGeolocation(
    {
      getCurrentPosition(success, failure) {
        callbacks.push({ failure, success });
      },
    },
    async () => {
      harness.controller.requestCurrentLocation();
      callbacks[0].success({ coords: { latitude: 25.06, longitude: 121.58 } });
      await flush();
    }
  );
  assert.deepEqual(discoveryBounds, [explicitBounds]);

  // The fitBounds idle never arrives. A later human pan must still query its
  // own viewport rather than be consumed as the missing explicit camera idle.
  currentBounds = manualBounds;
  idleCallback();
  await wait(MAP_IDLE_DEBOUNCE_MS + 40);
  assert.deepEqual(discoveryBounds, [explicitBounds, manualBounds]);
});

test("late idles from rapid explicit location moves do not duplicate discovery", async () => {
  const callbacks = [];
  const discoveryBounds = [];
  const firstBounds = { south: 25.02, west: 121.53, north: 25.1, east: 121.63 };
  const secondBounds = { south: 25.08, west: 121.6, north: 25.16, east: 121.7 };
  let currentBounds = firstBounds;
  let idleCallback = null;
  const harness = createHarness({
    api: {
      loadSessionDiscovery: async ({ bounds }) => {
        discoveryBounds.push(bounds);
        return [futureSession()];
      },
    },
    mapTools: {
      getMapBounds: () => currentBounds,
      setUserLocation(location) {
        return location.lat < 25.1 ? firstBounds : secondBounds;
      },
      subscribeToMapIdle(_map, callback) {
        idleCallback = callback;
      },
    },
  });
  harness.controller.attachMap({});

  await withNavigatorGeolocation(
    {
      getCurrentPosition(success, failure) {
        callbacks.push({ failure, success });
      },
    },
    async () => {
      harness.controller.requestCurrentLocation();
      callbacks[0].success({ coords: { latitude: 25.06, longitude: 121.58 } });
      await flush();
      harness.controller.requestCurrentLocation();
      callbacks[1].success({ coords: { latitude: 25.12, longitude: 121.65 } });
      await flush();
    }
  );
  assert.deepEqual(discoveryBounds, [firstBounds, secondBounds]);

  // Google can deliver both fitBounds idle events after the second move.
  // Each expected viewport is already represented by its direct discovery.
  currentBounds = firstBounds;
  idleCallback();
  await wait(MAP_IDLE_DEBOUNCE_MS + 40);
  currentBounds = secondBounds;
  idleCallback();
  await wait(MAP_IDLE_DEBOUNCE_MS + 40);
  assert.deepEqual(discoveryBounds, [firstBounds, secondBounds]);
});

test("expanding to Taipei treats the resulting camera idle as the same discovery refresh", async () => {
  const discoveryBounds = [];
  const fitBounds = { south: 24.95, west: 121.43, north: 25.18, east: 121.67 };
  let idleCallback = null;
  const harness = createHarness({
    api: {
      loadSessionDiscovery: async ({ bounds }) => {
        discoveryBounds.push(bounds);
        return [futureSession()];
      },
    },
    mapTools: {
      fitTaipei: () => fitBounds,
      getMapBounds: () => fitBounds,
      subscribeToMapIdle(_map, callback) {
        idleCallback = callback;
      },
    },
  });
  harness.controller.attachMap({});

  await harness.controller.expandBounds();
  assert.deepEqual(discoveryBounds, [fitBounds]);
  idleCallback();
  await wait(MAP_IDLE_DEBOUNCE_MS + 40);
  assert.deepEqual(discoveryBounds, [fitBounds]);
});

test("base-court drawers receive the same locally filtered session set as pins and rows", async () => {
  const matching = futureSession({ sessionId: 1, courtId: 8, playType: "單打" });
  const hiddenByType = futureSession({ sessionId: 2, courtId: 8, playType: "雙打" });
  const harness = createHarness({
    api: { loadSessionDiscovery: async () => [matching, hiddenByType] },
  });
  await harness.controller.loadDiscovery();
  harness.controller.setFilter("types", new Set(["單打"]));
  harness.controller.openCourt({ id: 8, name: "示範球場" });
  assert.deepEqual(harness.courtDrawers.at(-1).sessions.map((item) => item.sessionId), [1]);
});

test("an anonymous Join intent restores the same target into confirmation without sending a request", async () => {
  const intentStore = createIntentStore();
  let targetLoads = 0;
  let joinRequests = 0;
  const harness = createHarness({
    intentStore,
    api: {
      loadSessionSummary: async (sessionId) => {
        targetLoads += 1;
        assert.equal(sessionId, 41);
        return futureSession();
      },
      requestToJoinSession: async () => {
        joinRequests += 1;
        return { outcome: "OK", reloadRequired: false };
      },
    },
  });

  await harness.controller.loadDiscovery();
  openAction(harness).handlers.onPrimary();
  assert.deepEqual(intentStore.value(), { action: "join", sessionId: 41 });
  assert.equal(harness.loginPrompts.length, 1);

  await harness.controller.setAuthState({ user: { id: "guest-a" } }, { complete: true });
  assert.equal(targetLoads, 1);
  assert.equal(harness.confirmations.length, 1);
  assert.equal(harness.confirmations[0].session.sessionId, 41);
  assert.equal(joinRequests, 0, "resume must still require an intentional confirmation");
});

test("an incomplete profile retains Join context and resumes only after profile completion", async () => {
  const intentStore = createIntentStore();
  const harness = createHarness({
    intentStore,
    api: { loadSessionSummary: async () => futureSession() },
  });

  await harness.controller.setAuthState({ user: { id: "guest-a" } }, null);
  await harness.controller.loadDiscovery();
  openAction(harness).handlers.onPrimary();

  assert.deepEqual(intentStore.value(), { action: "join", sessionId: 41 });
  assert.equal(harness.profilePrompts.length, 1);
  assert.deepEqual(harness.profilePrompts[0].intent, { action: "join", sessionId: 41 });
  assert.equal(harness.profilePrompts[0].returnSession.court, "示範球場");

  await harness.controller.setAuthState({ user: { id: "guest-a" } }, { complete: true });
  assert.equal(harness.confirmations.length, 1);
  assert.equal(intentStore.value().sessionId, 41);
});

test("a signed-in incomplete profile resumes an existing Join intent into profile completion", async () => {
  const intentStore = createIntentStore({ action: "join", sessionId: 41 });
  const harness = createHarness({
    intentStore,
    api: { loadSessionSummary: async () => futureSession() },
  });

  await harness.controller.setAuthState({ user: { id: "guest-a" } }, null);

  assert.equal(harness.profilePrompts.length, 1);
  assert.deepEqual(harness.profilePrompts[0].intent, { action: "join", sessionId: 41 });
  assert.equal(harness.profilePrompts[0].returnSession.court, "示範球場");
  assert.deepEqual(intentStore.value(), { action: "join", sessionId: 41 });
});

test("a same-account auth refresh cannot strand an in-flight Join intent", async () => {
  const intentStore = createIntentStore({ action: "join", sessionId: 41 });
  const target = deferred();
  const harness = createHarness({
    intentStore,
    api: { loadSessionSummary: () => target.promise },
  });

  const firstAuth = harness.controller.setAuthState({ user: { id: "guest-a" } }, { complete: true });
  await flush();
  const refresh = harness.controller.setAuthState({ user: { id: "guest-a" } }, { complete: true });
  await flush();
  target.resolve(futureSession());
  await Promise.all([firstAuth, refresh]);

  assert.equal(harness.confirmations.length, 1);
  assert.equal(harness.confirmations[0].session.sessionId, 41);
  assert.deepEqual(intentStore.value(), { action: "join", sessionId: 41 });
});

test("a same-account auth refresh keeps an already-open confirmation actionable", async () => {
  let joinRequests = 0;
  const harness = createHarness({
    api: {
      requestToJoinSession: async () => {
        joinRequests += 1;
        return { outcome: "OK", reloadRequired: false };
      },
    },
  });

  await harness.controller.setAuthState({ user: { id: "guest-a" } }, { complete: true });
  await harness.controller.loadDiscovery();
  openAction(harness).handlers.onPrimary();
  const confirmation = harness.confirmations.at(-1);

  await harness.controller.setAuthState({ user: { id: "guest-a" } }, { complete: true });
  assert.equal(confirmation.detail.closeCalls, 0);
  await confirmation.handlers.onConfirm(() => {});
  assert.equal(joinRequests, 1);
});

test("the newest same-account participation refresh wins over an older late response", async () => {
  const pendingLoads = [];
  const harness = createHarness({
    api: {
      loadMySessions: () => {
        const next = deferred();
        pendingLoads.push(next);
        return next.promise;
      },
    },
  });

  const first = harness.controller.setAuthState({ user: { id: "guest-a" } }, { complete: true });
  await flush();
  const second = harness.controller.setAuthState({ user: { id: "guest-a" } }, { complete: true });
  await flush();
  assert.equal(pendingLoads.length, 2);

  pendingLoads[1].resolve([{ sessionId: 41, viewerParticipantStatus: "accepted" }]);
  await second;
  pendingLoads[0].resolve([]);
  await first;

  assert.deepEqual(harness.controller.getMySessions(), [{ sessionId: 41, viewerParticipantStatus: "accepted" }]);
});

test("profile loading and profile-load errors preserve intent without opening an editable blank form", async () => {
  const intentStore = createIntentStore();
  const harness = createHarness({ intentStore });

  await harness.controller.setAuthState({ user: { id: "guest-a" } }, { complete: false, status: "loading" });
  harness.controller.openCreateIntent();
  assert.equal(harness.profilePrompts.length, 0);
  assert.ok(harness.toasts.includes("正在讀取個人檔案，請稍候。"));
  assert.deepEqual(intentStore.value(), { action: "create" });

  await harness.controller.setAuthState({ user: { id: "guest-a" } }, { complete: false, status: "error" });
  assert.equal(harness.profilePrompts.length, 0);
  assert.ok(harness.toasts.includes("個人檔案暫時無法載入，請重新整理後再試。"));
  assert.deepEqual(intentStore.value(), { action: "create" });
});

test("an account switch closes account-bound create and profile forms before they can be reused", async () => {
  let createCalls = 0;
  const createFlow = createHarness({
    api: {
      createSession: async () => {
        createCalls += 1;
        return { sessionId: 99 };
      },
    },
  });

  await createFlow.controller.setAuthState({ user: { id: "account-a" } }, { complete: true });
  createFlow.controller.openCreateIntent();
  const staleCreate = createFlow.createSheets.at(-1);
  await createFlow.controller.setAuthState({ user: { id: "account-b" } }, { complete: true });

  assert.equal(staleCreate.detail.closeCalls, 1);
  await assert.rejects(staleCreate.handlers.onSubmit({ courtId: 8 }, () => {}), /登入或個人檔案狀態已變更/);
  assert.equal(createCalls, 0);

  const profileHarness = createHarness();
  await profileHarness.controller.setAuthState({ user: { id: "account-a" } }, null);
  profileHarness.controller.openCreateIntent();
  const staleProfile = profileHarness.profilePrompts.at(-1);
  await profileHarness.controller.setAuthState({ user: { id: "account-b" } }, { complete: true });

  assert.equal(staleProfile.detail.closeCalls, 1);
});

test("active profile and create forms receive courts loaded after they open", async () => {
  const taipeiCourts = [{ id: 8, city: "台北市", district: "大安區", name: "示範球場" }];
  const createFlow = createHarness();
  await createFlow.controller.setAuthState({ user: { id: "account-a" } }, { complete: true });
  createFlow.controller.openCreateIntent();
  const createForm = createFlow.createSheets.at(-1);
  createFlow.controller.setCourts(taipeiCourts);
  assert.deepEqual(createForm.detail.courtUpdates.at(-1).courts, taipeiCourts);

  const profileHarness = createHarness();
  await profileHarness.controller.setAuthState({ user: { id: "account-a" } }, null);
  profileHarness.controller.openCreateIntent();
  const profileForm = profileHarness.profilePrompts.at(-1);
  profileHarness.controller.setCourts(taipeiCourts);
  assert.deepEqual(profileForm.detail.courtUpdates.at(-1).courts, taipeiCourts);
});

test("unavailable or full resume targets clear intent and leave the nearby drawer usable", async () => {
  const fullIntent = createIntentStore({ action: "join", sessionId: 41 });
  const fullHarness = createHarness({
    intentStore: fullIntent,
    api: { loadSessionSummary: async () => futureSession({ slotsRemaining: 0, status: "full" }) },
  });
  await fullHarness.controller.setAuthState({ user: { id: "guest-a" } }, { complete: true });
  assert.equal(fullIntent.value(), null);
  assert.deepEqual(fullHarness.toasts, ["球局已額滿，已回到附近球局。"]);
  assert.equal(fullHarness.renders.at(-1).expanded, true);
  assert.equal(fullHarness.confirmations.length, 0);

  for (const [status, message] of [
    ["cancelled", "球局已取消，已回到附近球局。"],
    ["expired", "球局已結束，已回到附近球局。"],
    ["started", "球局已開始，已回到附近球局。"],
  ]) {
    const intentStore = createIntentStore({ action: "join", sessionId: 41 });
    const harness = createHarness({
      intentStore,
      api: { loadSessionSummary: async () => futureSession({ status }) },
    });
    await harness.controller.setAuthState({ user: { id: `guest-${status}` } }, { complete: true });
    assert.equal(intentStore.value(), null, `${status} clears the original intent`);
    assert.deepEqual(harness.toasts, [message]);
    assert.equal(harness.confirmations.length, 0);
  }

  const unavailableIntent = createIntentStore({ action: "join", sessionId: 41 });
  const unavailableHarness = createHarness({
    intentStore: unavailableIntent,
    api: { loadSessionSummary: async () => null },
  });
  await unavailableHarness.controller.setAuthState({ user: { id: "guest-a" } }, { complete: true });
  assert.equal(unavailableIntent.value(), null);
  assert.deepEqual(unavailableHarness.toasts, ["球局已取消、結束或不再開放，已回到附近球局。"]);
  assert.equal(unavailableHarness.renders.at(-1).expanded, true);
});

test("closing login or a recovered join confirmation clears only its matching intent", async () => {
  const intentStore = createIntentStore();
  const harness = createHarness({ intentStore, api: { loadSessionSummary: async () => futureSession() } });
  await harness.controller.loadDiscovery();
  openAction(harness).handlers.onPrimary();
  harness.loginPrompts[0].handlers.onClose();
  assert.equal(intentStore.value(), null);

  intentStore.save({ action: "join", sessionId: 41 });
  await harness.controller.setAuthState({ user: { id: "guest-a" } }, { complete: true });
  harness.confirmations[0].handlers.onClose();
  assert.equal(intentStore.value(), null);
});

test("replacing a login surface keeps its pending intent, while a dismissal clears it", async () => {
  const intentStore = createIntentStore();
  const harness = createHarness({ intentStore });
  await harness.controller.loadDiscovery();
  openAction(harness).handlers.onPrimary();

  harness.loginPrompts[0].handlers.onClose({ reason: "replace" });
  assert.deepEqual(intentStore.value(), { action: "join", sessionId: 41 });

  harness.loginPrompts[0].handlers.onClose({ reason: "dismiss" });
  assert.equal(intentStore.value(), null);
});
