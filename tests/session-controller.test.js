import assert from "node:assert/strict";
import test from "node:test";

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

function createHarness(overrides = {}) {
  const renders = [];
  const pinBatches = [];
  const opened = [];
  const confirmations = [];
  const courtDrawers = [];
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
      const detail = { closeCalls: 0, close() { this.closeCalls += 1; } };
      opened.push({ detail, handlers, session: openedSession });
      return detail;
    },
    openJoinConfirmation: (openedSession, handlers) => confirmations.push({ handlers, session: openedSession }),
    openCourtDrawer: (court, sessions, handlers) => courtDrawers.push({ court, handlers, sessions }),
    toast: (message) => toasts.push(message),
  });
  return { api, confirmations, controller, courtDrawers, opened, pinBatches, renders, session, toasts };
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
