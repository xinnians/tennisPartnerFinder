import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MAP_IDLE_DEBOUNCE_MS } from "../src/config.js";
import * as mapModule from "../src/map.ts";
import * as pinModule from "../src/pins.ts";
import * as sessionController from "../src/sessionController.js";
import { PENDING_SESSION_INTENT_KEY } from "../src/sessionIntent.js";

const { createSessionController, groupMySessions } = sessionController;

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
    venueType: "booked",
    rangeEnd: "",
    candidateCourtIds: [],
    feeNote: "",
    decidedAt: "",
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

function withSessionStorage(storage, run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage });
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (descriptor) Object.defineProperty(globalThis, "sessionStorage", descriptor);
      else delete globalThis.sessionStorage;
    });
}

function withWindow(value, run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value });
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
      else delete globalThis.window;
    });
}

class MemorySessionStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  removeItem(key) {
    this.values.delete(key);
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
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
    // 批 C3-2:join 單層化後,detail sheet 自己就是確認態的容器,不再有獨立的
    // openJoinConfirmation fake——controller 改呼叫 detail.enterConfirming(...),
    // 這裡記錄每次呼叫的 payload(expectedAccepted 等)供白箱斷言取代原本的
    // harness.confirmations.at(-1).handlers.expectedAccepted。
    confirmingCalls: [],
    courtUpdates: [],
    joinPreviewUpdates: [],
    stateUpdates: [],
    close(options) {
      this.closeCalls += 1;
      onClose(options);
    },
    enterConfirming(options) {
      this.confirmingCalls.push(options);
    },
    setCourts(courts, options) {
      this.courtUpdates.push({ courts, options });
    },
    setJoinPreview(state) {
      this.joinPreviewUpdates.push(state);
    },
    setState(state) {
      this.stateUpdates.push(state);
    },
  };
}

test("configured Advanced Marker import failures reject and drive the map-unavailable fallback", async () => {
  const importFailure = new Error("forced marker library failure");
  const importLibraryCalls = [];
  let unavailableCalls = 0;
  const controller = {
    setMapUnavailable() {
      unavailableCalls += 1;
    },
  };

  const outcome = await withWindow(
    {
      google: {
        maps: {
          async importLibrary(name) {
            importLibraryCalls.push(name);
            throw importFailure;
          },
        },
      },
    },
    () =>
      mapModule
        .loadGoogleMaps("test-key", () => {}, "TEST_MAP_ID")
        .then(
          () => "resolved",
          (error) => {
            assert.equal(error.message, "Google Maps Advanced Marker library 載入失敗");
            assert.equal(error.cause, importFailure);
            controller.setMapUnavailable();
            return "rejected";
          }
        )
  );

  assert.equal(outcome, "rejected");
  assert.deepEqual(importLibraryCalls, ["marker"]);
  assert.equal(unavailableCalls, 1);

  const mainSource = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const startMapSource = mainSource.slice(
    mainSource.indexOf("async function startMap()"),
    mainSource.indexOf("async function boot()")
  );
  assert.match(startMapSource, /\.catch\(\(\) => \{[\s\S]*controller\.setMapUnavailable\(\);[\s\S]*\}\);/u);
});

test("authenticated detail and join confirmation load the accepted preview while anonymous detail stays silent", async () => {
  const previewLoads = [];
  const preview = [
    { avatarUrl: "", nickname: "已確認球友", ntrp: null, role: "guest", sessionId: 41 },
    { avatarUrl: "https://lh3.googleusercontent.com/a/host", nickname: "主揪", ntrp: 3.5, role: "host", sessionId: 41 },
  ];
  const authenticated = createHarness({
    api: {
      loadSessionJoinPreview: async (sessionId) => {
        previewLoads.push(sessionId);
        return preview;
      },
    },
  });
  await authenticated.controller.setAuthState(
    { user: { id: "join-preview-viewer" } },
    { directory: false, nickname: true, ntrp: true }
  );
  await authenticated.controller.loadDiscovery();
  authenticated.controller.openSession(41);
  await flush();

  assert.equal(authenticated.opened.at(-1).handlers.showJoinPreview, true);
  assert.deepEqual(authenticated.opened.at(-1).detail.joinPreviewUpdates, [
    { participants: [], status: "loading" },
    { participants: [preview[1], preview[0]], status: "ready" },
  ]);

  // 批 C3-2:join 確認併進同一張 detail,不再開第二層 confirmation surface,
  // 進 confirming 也不再重新拉一次 join preview——detail 打開當下就已經 hydrate
  // 過,confirming 只是原地切態,沿用同一份已載入的名單。
  authenticated.opened.at(-1).handlers.onPrimary();
  await flush();
  assert.deepEqual(authenticated.opened.at(-1).detail.confirmingCalls, [{ expectedAccepted: false }]);
  assert.deepEqual(authenticated.opened.at(-1).detail.joinPreviewUpdates, [
    { participants: [], status: "loading" },
    { participants: [preview[1], preview[0]], status: "ready" },
  ]);
  assert.deepEqual(previewLoads, [41]);

  const anonymous = createHarness({
    api: {
      loadSessionJoinPreview: async () => {
        throw new Error("anonymous detail must not request the authenticated preview");
      },
    },
  });
  await anonymous.controller.loadDiscovery();
  anonymous.controller.openSession(41);
  await flush();
  assert.equal(anonymous.opened.at(-1).handlers.showJoinPreview, false);
  assert.deepEqual(anonymous.opened.at(-1).detail.joinPreviewUpdates, []);
});

test("the newest session detail preview wins when an older session request resolves last", async () => {
  const firstPreview = deferred();
  const secondPreview = deferred();
  const sessions = [futureSession({ sessionId: 41 }), futureSession({ court: "第二球場", sessionId: 42 })];
  const harness = createHarness({
    api: {
      loadSessionDiscovery: async () => sessions,
      loadSessionJoinPreview: (sessionId) => (sessionId === 41 ? firstPreview.promise : secondPreview.promise),
    },
  });
  await harness.controller.setAuthState(
    { user: { id: "join-preview-detail-race" } },
    { directory: false, nickname: true, ntrp: true }
  );
  await harness.controller.loadDiscovery();

  harness.controller.openSession(41);
  const firstDetail = harness.opened.at(-1).detail;
  harness.controller.openSession(42);
  const secondDetail = harness.opened.at(-1).detail;

  const secondParticipants = [{ avatarUrl: "", nickname: "第二局主揪", ntrp: 4, role: "host", sessionId: 42 }];
  secondPreview.resolve(secondParticipants);
  await flush();
  firstPreview.resolve([{ avatarUrl: "", nickname: "第一局主揪", ntrp: 3.5, role: "host", sessionId: 41 }]);
  await flush();

  assert.deepEqual(firstDetail.joinPreviewUpdates, [{ participants: [], status: "loading" }]);
  assert.deepEqual(secondDetail.joinPreviewUpdates, [
    { participants: [], status: "loading" },
    { participants: secondParticipants, status: "ready" },
  ]);
});

function createHarness(overrides = {}) {
  const renders = [];
  const pinBatches = [];
  const opened = [];
  const courtDrawers = [];
  const playerDrawers = [];
  const playerDirectories = [];
  const playerCards = [];
  const playerRenders = [];
  const createSheets = [];
  const decisionSheets = [];
  const editSheets = [];
  const chatSheets = [];
  const loginPrompts = [];
  const profilePrompts = [];
  const reportDialogs = [];
  const mySessionChanges = [];
  const toasts = [];
  const createdSessionCalls = [];
  const session = overrides.session ?? futureSession();
  const api = {
    loadSessionDiscovery: async () => [session],
    loadMySessions: async () => [],
    requestToJoinSession: async () => ({ outcome: "OK", reloadRequired: false }),
    withdrawFromSession: async () => ({ outcome: "OK", reloadRequired: false }),
    ...overrides.api,
  };
  const rawController = createSessionController({
    api,
    mapTools: overrides.mapTools,
    render: (view) => renders.push(view),
    renderPins: (sessions) => pinBatches.push(sessions),
    renderPlayers: (view) => playerRenders.push(view),
    openSession: (openedSession, handlers) => {
      // 批 C3-2:join 確認/送出中/成功都併進這張 detail(handlers.onClose 是
      // openSessionDetail 新接的意圖清除/自我歸零 hook),不再有獨立的
      // openJoinConfirmation fake。
      const detail = createSurface(handlers.onClose);
      opened.push({ detail, handlers, session: openedSession });
      return detail;
    },
    openWithdrawConfirmation: overrides.openWithdrawConfirmation ?? ((handlers) => handlers.onConfirm()),
    openCourtDrawer: (court, sessions, handlers) => {
      const detail = createSurface();
      courtDrawers.push({ court, detail, handlers, sessions });
      return detail;
    },
    openCourtPlayersDrawer: (court, players, handlers) => {
      const detail = createSurface();
      playerDrawers.push({ court, detail, handlers, players });
      return detail;
    },
    openPlayerDirectoryList: (handlers) => {
      const detail = createSurface(handlers.onClose);
      detail.directoryUpdates = [];
      detail.setDirectory = (state) => detail.directoryUpdates.push(state);
      playerDirectories.push({ detail, handlers });
      return detail;
    },
    openPlayerCard: (player, handlers) => {
      const detail = createSurface();
      detail.invitableUpdates = [];
      detail.setInvitableSessions = (sessions) => detail.invitableUpdates.push(sessions);
      playerCards.push({ detail, handlers, player });
      return detail;
    },
    openCreateSession: (handlers) => {
      const detail = createSurface(handlers.onClose);
      createSheets.push({ detail, handlers });
      return detail;
    },
    openDecideSession: (openedSession, handlers) => {
      const detail = createSurface(handlers.onClose);
      detail.terminalMessages = [];
      detail.setTerminal = (message) => detail.terminalMessages.push(message);
      decisionSheets.push({ detail, handlers, session: openedSession });
      return detail;
    },
    openEditSession: (openedSession, handlers) => {
      const detail = createSurface(handlers.onClose);
      editSheets.push({ detail, handlers, session: openedSession });
      return detail;
    },
    openChat: (openedSession, handlers) => {
      const detail = createSurface(handlers.onClose);
      detail.archivedUpdates = [];
      detail.setArchived = (message) => detail.archivedUpdates.push(message);
      chatSheets.push({ detail, handlers, session: openedSession });
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
    openReport: (context) => {
      const detail = createSurface(context.onClose);
      reportDialogs.push({ ...context, detail });
      return detail;
    },
    reloadCurrentProfile: overrides.reloadCurrentProfile,
    onMySessionsChange: (nextState) => mySessionChanges.push(nextState),
    intentStore: overrides.intentStore,
    showCreatedSession: (sessionId) => createdSessionCalls.push(sessionId),
    toast: (message) => toasts.push(message),
    visibilityTarget: overrides.visibilityTarget,
    chatPollIntervalMs: overrides.chatPollIntervalMs,
    discoveryPollIntervalMs: overrides.discoveryPollIntervalMs,
  });
  const controller = rawController;
  return {
    api,
    chatSheets,
    controller,
    courtDrawers,
    createdSessionCalls,
    createSheets,
    decisionSheets,
    editSheets,
    loginPrompts,
    mySessionChanges,
    opened,
    pinBatches,
    playerCards,
    playerDirectories,
    playerDrawers,
    playerRenders,
    profilePrompts,
    reportDialogs,
    renders,
    session,
    toasts,
  };
}

test("controller store owns the application courts, auth session, and private profile snapshot", async () => {
  const harness = createHarness();
  const courts = [{ city: "台北市", district: "大安區", id: 8, lat: 25.03, lng: 121.54, name: "示範球場" }];
  const authSession = { access_token: "fresh-token", user: { id: "app-state-owner" } };
  const profile = {
    courts: new Set(["8"]),
    isPublic: false,
    nick: "單一狀態球友",
    ntrp: 3.5,
    openToGreeting: false,
    sharePresence: false,
    slots: new Set(),
    types: new Set(),
  };

  assert.deepEqual(harness.controller.getAppState(), {
    authSession: null,
    courts: [],
    courtsReady: false,
    profile: null,
  });

  harness.controller.setCourts(courts, { ready: true });
  harness.controller.setProfile(profile);
  harness.controller.setAuthSession(authSession);
  assert.deepEqual(harness.controller.getAppState(), { authSession, courts, courtsReady: true, profile });

  await harness.controller.setAuthState(authSession, { directory: true, nickname: true, ntrp: true });
  assert.strictEqual(
    harness.controller.getAppState().profile,
    profile,
    "derived eligibility must not replace private profile"
  );
});

test("My Sessions visibility mutation commits the RPC-confirmed state before profile reconciliation finishes", async () => {
  const events = [];
  const profileReload = deferred();
  let harness;
  harness = createHarness({
    api: {
      setPlayerVisibility: async (visible) => {
        events.push(["visibility", visible]);
      },
    },
    reloadCurrentProfile: async () => {
      events.push(["reload"]);
      await profileReload.promise;
      await harness.controller.setAuthState(
        { user: { id: "player" } },
        { directory: true, nickname: true, ntrp: true, isPublic: true }
      );
      return true;
    },
  });

  await harness.controller.setAuthState(
    { user: { id: "player" } },
    { directory: true, nickname: true, ntrp: true, isPublic: false }
  );
  const toggled = harness.controller.togglePlayerVisibility();
  await flush();

  assert.deepEqual(events, [["visibility", true], ["reload"]]);
  assert.equal(harness.controller.getMySessionState().isPublic, true);
  assert.equal(harness.mySessionChanges.at(-1).isPublic, true);

  profileReload.resolve();
  await toggled;

  assert.equal(harness.controller.getMySessionState().isPublic, true);
  assert.equal(harness.mySessionChanges.at(-1).isPublic, true);
});

test("RPC success + profile reload failure keeps committed My Sessions visibility and reports reconciliation error", async () => {
  const harness = createHarness({
    api: {
      setPlayerVisibility: async () => {},
    },
    reloadCurrentProfile: async () => false,
  });

  await harness.controller.setAuthState(
    { user: { id: "player" } },
    { directory: true, nickname: true, ntrp: true, isPublic: false }
  );

  await assert.rejects(harness.controller.togglePlayerVisibility(), /球友卡設定已更新，但個人檔案同步失敗/);
  assert.equal(harness.controller.getMySessionState().isPublic, true);
  assert.equal(harness.mySessionChanges.at(-1).isPublic, true);
});

test("an account switch invalidates visibility reconciliation without publishing the prior account's committed value", async () => {
  const profileReload = deferred();
  const harness = createHarness({
    api: {
      setPlayerVisibility: async () => {},
    },
    reloadCurrentProfile: () => profileReload.promise,
  });

  await harness.controller.setAuthState(
    { user: { id: "account-a" } },
    { directory: true, nickname: true, ntrp: true, isPublic: false }
  );
  const toggled = harness.controller.togglePlayerVisibility();
  await flush();
  assert.equal(harness.controller.getMySessionState().isPublic, true);

  await harness.controller.setAuthState(
    { user: { id: "account-b" } },
    { directory: true, nickname: true, ntrp: true, isPublic: false }
  );
  profileReload.resolve(false);

  await assert.rejects(toggled, /登入狀態已變更/);
  assert.equal(harness.controller.getMySessionState().isPublic, false);
  assert.equal(harness.mySessionChanges.at(-1).isPublic, false);
});

test("a failed My Sessions visibility mutation preserves the authoritative public state", async () => {
  const harness = createHarness({
    api: {
      setPlayerVisibility: async () => {
        throw new Error("球友卡設定暫時無法更新。");
      },
    },
    reloadCurrentProfile: async () => {
      throw new Error("不應重新載入");
    },
  });

  await harness.controller.setAuthState(
    { user: { id: "player" } },
    { directory: true, nickname: true, ntrp: true, isPublic: false }
  );
  await assert.rejects(harness.controller.togglePlayerVisibility(), /球友卡設定暫時無法更新/);

  assert.equal(harness.controller.getMySessionState().isPublic, false);
});

function openAction(harness, sessionId = harness.session.sessionId) {
  harness.controller.openSession(sessionId);
  return harness.opened.at(-1);
}

test("My Sessions groups private lifecycle rows by the next safe action", () => {
  assert.equal(typeof groupMySessions, "function");
  if (typeof groupMySessions !== "function") return;
  const now = new Date("2026-07-17T04:00:00.000Z");
  const item = (overrides = {}) => ({
    ...futureSession({
      canCancel: false,
      canConfirmAttendance: false,
      canConfirmPlayed: false,
      sessionId: 100,
      startAt: "2026-07-20T01:00:00.000Z",
      updatedAt: "2026-07-17T01:00:00.000Z",
      viewerParticipantStatus: "accepted",
      viewerPlayedConfirmed: false,
      viewerRole: "guest",
    }),
    ...overrides,
  });
  const host = item({
    canCancel: true,
    pendingRequests: [
      { participantId: 72, nickname: "第二位申請者", role: "guest", status: "requested" },
      { participantId: 71, nickname: "第一位申請者", role: "guest", status: "requested" },
    ],
    sessionId: 1,
    startAt: "2026-07-19T01:00:00.000Z",
    viewerRole: "host",
  });
  const guestWaiting = item({
    canWithdraw: true,
    sessionId: 2,
    startAt: "2026-07-18T01:00:00.000Z",
    viewerParticipantStatus: "requested",
  });
  const acceptedGuest = item({ sessionId: 3, startAt: "2026-07-18T03:00:00.000Z" });
  const declinedGuest = item({
    sessionId: 4,
    updatedAt: "2026-07-17T03:00:00.000Z",
    viewerParticipantStatus: "declined",
  });
  const playedGuest = item({
    canConfirmAttendance: true,
    sessionId: 5,
    startAt: "2026-07-17T02:00:00.000Z",
    status: "played",
    updatedAt: "2026-07-17T02:00:00.000Z",
  });
  const staleOpenGuest = item({
    sessionId: 6,
    startAt: "2026-07-15T01:00:00.000Z",
    updatedAt: "2026-07-16T01:00:00.000Z",
  });

  const groups = groupMySessions([acceptedGuest, staleOpenGuest, host, guestWaiting, declinedGuest, playedGuest], now);

  assert.equal(
    groups.needsActionCount,
    groups.needsAction.length,
    "needsActionCount tracks the full needs-action queue (invite + guest-request + host-request), not just host requests"
  );
  assert.deepEqual(
    groups.needsAction.map((entry) => [entry.kind, entry.session.sessionId, entry.participant?.participantId ?? null]),
    [
      ["host-request", 1, 71],
      ["host-request", 1, 72],
      ["guest-request", 2, null],
    ]
  );
  assert.deepEqual(
    groups.upcoming.map((entry) => entry.sessionId),
    [3, 1]
  );
  assert.deepEqual(
    groups.history.map((entry) => entry.sessionId),
    [4, 5, 6]
  );
  assert.equal(
    groups.history[1].canConfirmAttendance,
    true,
    "played history can retain its server-authorized attendance action"
  );
});

test("My Sessions groups expose a hasUnread aggregate for any session with an unread chat count", () => {
  const now = new Date("2026-07-17T04:00:00.000Z");
  const readSession = futureSession({ sessionId: 20, unreadMessageCount: 0, viewerParticipantStatus: "accepted" });
  const unreadSession = futureSession({ sessionId: 21, unreadMessageCount: 3, viewerParticipantStatus: "accepted" });

  assert.equal(groupMySessions([], now).hasUnread, false);
  assert.equal(groupMySessions([readSession], now).hasUnread, false);
  assert.equal(groupMySessions([readSession, unreadSession], now).hasUnread, true);
});

test("My Sessions puts a responsive guest invitation in needs action as an invite", () => {
  const invitedSession = futureSession({
    canRespondInvite: true,
    sessionId: 7,
    startAt: "2026-07-18T02:00:00.000Z",
    viewerParticipantStatus: "invited",
    viewerRole: "guest",
  });

  const groups = groupMySessions([invitedSession], new Date("2026-07-17T04:00:00.000Z"));

  assert.deepEqual(
    groups.needsAction.map((entry) => [entry.kind, entry.session.sessionId]),
    [["invite", 7]]
  );
  assert.deepEqual(groups.history, []);
});

test("My Sessions puts an expired or cancelled guest invitation in history", () => {
  const invitedSession = futureSession({
    canRespondInvite: false,
    sessionId: 8,
    startAt: "2026-07-18T02:00:00.000Z",
    viewerParticipantStatus: "invited",
    viewerRole: "guest",
  });

  const groups = groupMySessions([invitedSession], new Date("2026-07-17T04:00:00.000Z"));

  assert.deepEqual(groups.needsAction, []);
  assert.deepEqual(
    groups.history.map((entry) => entry.sessionId),
    [8]
  );
});

test("My Sessions orders host requests, invites, then guest requests", () => {
  const hostSession = futureSession({
    canCancel: true,
    pendingRequests: [{ participantId: 71, role: "guest", status: "requested" }],
    sessionId: 9,
    startAt: "2026-07-20T02:00:00.000Z",
    viewerParticipantStatus: "accepted",
    viewerRole: "host",
  });
  const invitedSession = futureSession({
    canRespondInvite: true,
    sessionId: 10,
    startAt: "2026-07-18T02:00:00.000Z",
    viewerParticipantStatus: "invited",
    viewerRole: "guest",
  });
  const requestedSession = futureSession({
    canWithdraw: true,
    sessionId: 11,
    startAt: "2026-07-17T02:00:00.000Z",
    viewerParticipantStatus: "requested",
    viewerRole: "guest",
  });

  const groups = groupMySessions([requestedSession, invitedSession, hostSession], new Date("2026-07-17T01:00:00.000Z"));

  assert.deepEqual(
    groups.needsAction.map((entry) => [entry.kind, entry.session.sessionId]),
    [
      ["host-request", 9],
      ["invite", 10],
      ["guest-request", 11],
    ]
  );
});

test("My Sessions hydrates host-only rosters for the badge and refreshes details from authority", async () => {
  const rosterCalls = [];
  const hostSession = futureSession({
    canCancel: true,
    sessionId: 51,
    viewerParticipantStatus: "accepted",
    viewerRole: "host",
  });
  const acceptedGuestSession = futureSession({
    canWithdraw: true,
    sessionId: 52,
    viewerParticipantStatus: "accepted",
    viewerRole: "guest",
  });
  const harness = createHarness({
    api: {
      loadMySessions: async () => [hostSession, acceptedGuestSession],
      loadSessionRoster: async (sessionId) => {
        rosterCalls.push(sessionId);
        return [
          { participantId: 1, profileId: 11, role: "host", status: "accepted" },
          { participantId: 72, profileId: 22, nickname: "待審核球友", role: "guest", status: "requested" },
        ];
      },
    },
  });

  await harness.controller.setAuthState({ user: { id: "host" } }, { directory: true, nickname: true, ntrp: true });

  assert.deepEqual(rosterCalls, [51]);
  const groupsAfterRosterHydrate = harness.controller.getMySessionGroups();
  assert.equal(groupsAfterRosterHydrate.needsAction.length, 1);
  assert.deepEqual(
    groupsAfterRosterHydrate.needsAction.map((entry) => [
      entry.kind,
      entry.session.sessionId,
      entry.participant?.participantId ?? null,
    ]),
    [["host-request", 51, 72]]
  );
  assert.equal(groupsAfterRosterHydrate.needsActionCount, 1);

  await harness.controller.refreshMySessions();

  assert.deepEqual(rosterCalls, [51, 51]);
});

test("a host review uses an authorized roster request and refreshes My Sessions before reporting success", async () => {
  const calls = [];
  let requested = true;
  const hostSession = futureSession({
    canCancel: true,
    sessionId: 61,
    viewerParticipantStatus: "accepted",
    viewerRole: "host",
  });
  const harness = createHarness({
    api: {
      acceptSessionParticipant: async (sessionId, participantId) => {
        calls.push([sessionId, participantId]);
        requested = false;
        return { outcome: "OK", reloadRequired: false };
      },
      loadMySessions: async () => [hostSession],
      loadSessionRoster: async () => [
        { participantId: 1, profileId: 11, role: "host", status: "accepted" },
        {
          participantId: 72,
          profileId: 22,
          nickname: "待審核球友",
          role: "guest",
          status: requested ? "requested" : "accepted",
        },
      ],
    },
  });

  await harness.controller.setAuthState({ user: { id: "host" } }, { directory: true, nickname: true, ntrp: true });
  await harness.controller.reviewMySessionParticipant(61, 72, "accepted");

  assert.deepEqual(calls, [[61, 72]]);
  const groupsAfterAccept = harness.controller.getMySessionGroups();
  assert.deepEqual(
    groupsAfterAccept.needsAction,
    [],
    "the accepted request no longer needs action after the authoritative refresh"
  );
  assert.equal(groupsAfterAccept.needsActionCount, 0);
  assert.ok(harness.toasts.includes("已接受申請。"));
});

test("an invited guest can accept through the authorized My Sessions row and receive refreshed participation", async () => {
  const responses = [];
  let participantStatus = "invited";
  const invitedSession = futureSession({
    canRespondInvite: true,
    sessionId: 62,
    viewerParticipantStatus: participantStatus,
    viewerRole: "guest",
  });
  const harness = createHarness({
    api: {
      loadMySessions: async () => [
        {
          ...invitedSession,
          canRespondInvite: participantStatus === "invited",
          viewerParticipantStatus: participantStatus,
        },
      ],
      respondToSessionInvite: async (sessionId, decision) => {
        responses.push([sessionId, decision]);
        participantStatus = decision;
        return { outcome: "OK", reloadRequired: false };
      },
    },
  });

  await harness.controller.setAuthState(
    { user: { id: "invited-guest" } },
    { directory: true, nickname: true, ntrp: true }
  );
  await harness.controller.respondInvite(62, "accepted");

  assert.deepEqual(responses, [[62, "accepted"]]);
  assert.deepEqual(
    harness.controller.getMySessionGroups().upcoming.map((session) => session.sessionId),
    [62]
  );
  assert.ok(harness.toasts.includes("已接受邀請。"));
});

test("an invited guest can decline and move the invitation to history", async () => {
  const responses = [];
  let participantStatus = "invited";
  const invitedSession = futureSession({
    canRespondInvite: true,
    sessionId: 63,
    viewerParticipantStatus: participantStatus,
    viewerRole: "guest",
  });
  const harness = createHarness({
    api: {
      loadMySessions: async () => [
        {
          ...invitedSession,
          canRespondInvite: participantStatus === "invited",
          viewerParticipantStatus: participantStatus,
        },
      ],
      respondToSessionInvite: async (sessionId, decision) => {
        responses.push([sessionId, decision]);
        participantStatus = decision;
        return { outcome: "OK", reloadRequired: false };
      },
    },
  });

  await harness.controller.setAuthState(
    { user: { id: "invited-guest" } },
    { directory: true, nickname: true, ntrp: true }
  );
  await harness.controller.respondInvite(63, "declined");

  assert.deepEqual(responses, [[63, "declined"]]);
  assert.deepEqual(
    harness.controller.getMySessionGroups().history.map((session) => session.sessionId),
    [63]
  );
  assert.ok(harness.toasts.includes("已婉拒邀請。"));
});

test("invite responses require the current complete invited-guest authority and a supported decision", async () => {
  const calls = [];
  const baseApi = {
    loadMySessions: async () => [
      futureSession({
        canRespondInvite: true,
        sessionId: 64,
        viewerParticipantStatus: "invited",
        viewerRole: "guest",
      }),
    ],
    respondToSessionInvite: async (...args) => {
      calls.push(args);
      return { outcome: "OK", reloadRequired: false };
    },
  };
  const harness = createHarness({ api: baseApi });

  await assert.rejects(harness.controller.respondInvite(64, "accepted"), /登入或個人檔案狀態已變更/);
  await harness.controller.setAuthState(
    { user: { id: "invited-guest" } },
    { directory: true, nickname: true, ntrp: true }
  );
  await assert.rejects(harness.controller.respondInvite(64, "ignored"), /邀請已更新/);

  const hostHarness = createHarness({
    api: {
      ...baseApi,
      loadMySessions: async () => [
        futureSession({
          canRespondInvite: true,
          sessionId: 64,
          viewerParticipantStatus: "invited",
          viewerRole: "host",
        }),
      ],
    },
  });
  await hostHarness.controller.setAuthState({ user: { id: "host" } }, { directory: true, nickname: true, ntrp: true });
  await assert.rejects(hostHarness.controller.respondInvite(64, "accepted"), /球局的狀態已更新/);
  assert.deepEqual(calls, []);
});

test("invite response refresh failures, expiry, and server errors never announce success", async () => {
  const invitedSession = futureSession({
    canRespondInvite: true,
    sessionId: 65,
    viewerParticipantStatus: "invited",
    viewerRole: "guest",
  });

  let failedRefreshReads = 0;
  const failedRefresh = createHarness({
    api: {
      loadMySessions: async () => {
        failedRefreshReads += 1;
        if (failedRefreshReads > 1) throw new Error("read failed");
        return [invitedSession];
      },
      respondToSessionInvite: async () => ({ outcome: "OK", reloadRequired: false }),
    },
  });
  await failedRefresh.controller.setAuthState(
    { user: { id: "refresh-failure" } },
    { directory: true, nickname: true, ntrp: true }
  );
  await assert.rejects(failedRefresh.controller.respondInvite(65, "accepted"), /球局狀態暫時無法重新載入/);
  assert.equal(failedRefresh.toasts.includes("已接受邀請。"), false);

  let expiredReads = 0;
  const expired = createHarness({
    api: {
      loadMySessions: async () => {
        expiredReads += 1;
        return [invitedSession];
      },
      respondToSessionInvite: async () => ({ outcome: "SESSION_EXPIRED", reloadRequired: true }),
    },
  });
  await expired.controller.setAuthState(
    { user: { id: "expired-invite" } },
    { directory: true, nickname: true, ntrp: true }
  );
  await assert.rejects(expired.controller.respondInvite(65, "declined"), /球局狀態已更新，請重新載入/);
  assert.ok(expiredReads >= 2, "expired responses reload authoritative My Sessions");
  assert.equal(expired.toasts.includes("已婉拒邀請。"), false);

  let rejectionReads = 0;
  const rejected = createHarness({
    api: {
      loadMySessions: async () => {
        rejectionReads += 1;
        return [invitedSession];
      },
      respondToSessionInvite: async () => {
        throw new Error("邀請已由其他裝置處理。");
      },
    },
  });
  await rejected.controller.setAuthState(
    { user: { id: "rejected-invite" } },
    { directory: true, nickname: true, ntrp: true }
  );
  await assert.rejects(rejected.controller.respondInvite(65, "accepted"), /邀請已由其他裝置處理/);
  assert.ok(rejectionReads >= 2, "server rejections reload authoritative My Sessions");
  assert.equal(rejected.toasts.includes("已接受邀請。"), false);
});

test("a stale invite response cannot refresh or toast for the next account", async () => {
  const response = deferred();
  const loadIdentities = [];
  const invitedSession = futureSession({
    canRespondInvite: true,
    sessionId: 66,
    viewerParticipantStatus: "invited",
    viewerRole: "guest",
  });
  let currentIdentity = "account-a";
  const harness = createHarness({
    api: {
      loadMySessions: async () => {
        loadIdentities.push(currentIdentity);
        return currentIdentity === "account-a" ? [invitedSession] : [];
      },
      respondToSessionInvite: async () => response.promise,
    },
  });

  await harness.controller.setAuthState({ user: { id: "account-a" } }, { directory: true, nickname: true, ntrp: true });
  const pending = harness.controller.respondInvite(66, "accepted");
  currentIdentity = "account-b";
  await harness.controller.setAuthState({ user: { id: "account-b" } }, { directory: true, nickname: true, ntrp: true });
  const loadsAfterSwitch = loadIdentities.length;

  response.resolve({ outcome: "OK", reloadRequired: false });
  await assert.rejects(pending, /登入狀態已變更/);
  assert.equal(loadIdentities.length, loadsAfterSwitch, "the stale completion does not refresh account B");
  assert.deepEqual(harness.toasts, []);
});

test("My Sessions refresh rereads authoritative rows and clears private output on sign-out", async () => {
  let rows = [
    futureSession({
      canCancel: true,
      sessionId: 71,
      viewerParticipantStatus: "accepted",
      viewerRole: "host",
    }),
  ];
  let loads = 0;
  const harness = createHarness({
    api: {
      loadMySessions: async () => {
        loads += 1;
        return rows;
      },
      loadSessionRoster: async () => [
        { participantId: 2, profileId: 20, nickname: "待審核球友", role: "guest", status: "requested" },
      ],
    },
  });

  await harness.controller.setAuthState({ user: { id: "host" } }, { directory: true, nickname: true, ntrp: true });
  await harness.controller.refreshMySessions();
  const groupsAfterManualRefresh = harness.controller.getMySessionGroups();
  assert.equal(groupsAfterManualRefresh.needsAction.length, 1);
  assert.deepEqual(
    groupsAfterManualRefresh.needsAction.map((entry) => [
      entry.kind,
      entry.session.sessionId,
      entry.participant?.participantId ?? null,
    ]),
    [["host-request", 71, 2]]
  );
  assert.equal(groupsAfterManualRefresh.needsActionCount, 1);

  rows = [];
  await harness.controller.refreshMySessions();
  assert.equal(loads >= 3, true, "a manual refresh must re-read My Sessions rather than only cached details");
  assert.deepEqual(harness.controller.getMySessionGroups().upcoming, []);

  await harness.controller.setAuthState(null, null);
  assert.equal(
    harness.mySessionChanges.at(-1).authenticated,
    false,
    "sign-out publishes the anonymous My Sessions state"
  );
  const groupsAfterSignOut = harness.mySessionChanges.at(-1).groups;
  assert.deepEqual(groupsAfterSignOut.needsAction, [], "sign-out clears the private needs-action queue");
  assert.equal(groupsAfterSignOut.needsActionCount, 0);
  assert.deepEqual(harness.mySessionChanges.at(-1).groups.upcoming, []);
});

test("a failed roster read is visible as an error instead of a false zero-badge state", async () => {
  const hostSession = futureSession({
    canCancel: true,
    sessionId: 75,
    viewerParticipantStatus: "accepted",
    viewerRole: "host",
  });
  const harness = createHarness({
    api: {
      loadMySessions: async () => [hostSession],
      loadSessionRoster: async () => {
        throw new Error("roster unavailable");
      },
    },
  });

  await harness.controller.setAuthState({ user: { id: "host" } }, { directory: true, nickname: true, ntrp: true });
  const state = harness.controller.getMySessionState();
  assert.equal(state.status, "error");
  assert.match(state.error, /待審核申請暫時無法載入/);
  assert.deepEqual(state.groups.needsAction, [], "a failed roster read must not fabricate a pending host-request");
  assert.equal(state.groups.needsActionCount, 0);
  assert.equal(harness.mySessionChanges.at(-1).status, "error");
});

test("a lifecycle mutation never announces success when its authoritative refresh fails", async () => {
  let readCount = 0;
  const hostSession = futureSession({
    canCancel: true,
    sessionId: 76,
    viewerParticipantStatus: "accepted",
    viewerRole: "host",
  });
  const harness = createHarness({
    api: {
      acceptSessionParticipant: async () => ({ outcome: "OK", reloadRequired: false }),
      loadMySessions: async () => {
        readCount += 1;
        if (readCount > 1) throw new Error("temporary read failure");
        return [hostSession];
      },
      loadSessionRoster: async () => [{ participantId: 7, profileId: 8, role: "guest", status: "requested" }],
    },
  });

  await harness.controller.setAuthState({ user: { id: "host" } }, { directory: true, nickname: true, ntrp: true });
  await assert.rejects(harness.controller.reviewMySessionParticipant(76, 7, "accepted"), /球局狀態暫時無法重新載入/);
  assert.equal(harness.toasts.includes("已接受申請。"), false);
  assert.equal(harness.controller.getMySessionState().status, "error");
});

test("reporting accepts only public session targets or safe roster targets", async () => {
  const reports = [];
  const hostSession = futureSession({
    canCancel: true,
    sessionId: 81,
    viewerParticipantStatus: "accepted",
    viewerRole: "host",
  });
  const harness = createHarness({
    session: hostSession,
    api: {
      createReport: async (payload) => {
        reports.push(payload);
        return { reportId: reports.length };
      },
      loadMySessions: async () => [hostSession],
      loadSessionRoster: async () => [
        { participantId: 1, profileId: 11, role: "host", status: "accepted" },
        { participantId: 2, profileId: 22, nickname: "安全申請者", role: "guest", status: "requested" },
      ],
    },
  });

  await harness.controller.setAuthState({ user: { id: "host" } }, { directory: true, nickname: true, ntrp: true });
  await harness.controller.loadDiscovery();
  // The surface adapter is intentionally simple in this unit harness: submit
  // through the callback captured by the controller rather than browser DOM.
  harness.controller.openSessionReport(81);
  const sessionReport = harness.reportDialogs.at(-1);
  await sessionReport.onSubmit("不實球局");
  assert.deepEqual(reports[0], { reportedProfileId: null, reason: "不實球局", sessionId: 81 });

  await harness.controller.openRosterParticipantReport(81, 22);
  const profileReport = harness.reportDialogs.at(-1);
  await profileReport.onSubmit("不當行為");
  assert.deepEqual(reports[1], { reportedProfileId: 22, reason: "不當行為", sessionId: null });
  assert.throws(() => harness.controller.openRosterParticipantReport(81, 999), /申請者資料已更新/);
});

test("a My Sessions card can reopen its safe detail even after it is outside the current discovery viewport", async () => {
  const privateSession = futureSession({
    sessionId: 89,
    viewerParticipantStatus: "accepted",
    viewerRole: "host",
  });
  const harness = createHarness({
    api: {
      loadMySessions: async () => [privateSession],
      loadSessionDiscovery: async () => [],
    },
  });

  await harness.controller.setAuthState({ user: { id: "host" } }, { directory: true, nickname: true, ntrp: true });
  await harness.controller.loadDiscovery();
  harness.controller.openSession(89);
  assert.equal(harness.opened.at(-1).session.sessionId, 89);
});

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
  await joinHarness.controller.setAuthState({ user: { id: "guest" } }, { directory: true, nickname: true, ntrp: true });
  await joinHarness.controller.loadDiscovery();
  const joinDetail = openAction(joinHarness);
  joinDetail.handlers.onPrimary();
  await joinDetail.handlers.onConfirmJoin();

  assert.equal(joinCalls, 1);
  assert.ok(discoveryCalls >= 2, "expired join reloads discovery");
  assert.ok(participationCalls >= 2, "expired join reloads participation");
  // 批 C3-2:confirmation 併進 detail 後,兩者是同一顆 surface,SESSION_EXPIRED
  // 只會關這一顆(closeCalls===1),不再有獨立的第二顆 confirmation 要另外關。
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
  await withdrawHarness.controller.setAuthState(
    { user: { id: "guest" } },
    { directory: true, nickname: true, ntrp: true }
  );
  await withdrawHarness.controller.loadDiscovery();
  const withdrawDetail = openAction(withdrawHarness);
  await withdrawDetail.handlers.onWithdraw();

  assert.equal(withdrawCalls, 1);
  assert.equal(withdrawDetail.detail.closeCalls, 1, "expired withdrawal closes obsolete detail actions");
  assert.deepEqual(withdrawHarness.toasts, ["球局狀態已更新，請重新載入。"]);
});

test("a rejected detail withdrawal refreshes authority before leaving a retryable error", async () => {
  let discoveryCalls = 0;
  let participationCalls = 0;
  const publicSession = futureSession();
  const harness = createHarness({
    session: publicSession,
    api: {
      loadMySessions: async () => {
        participationCalls += 1;
        return [{ sessionId: 41, viewerParticipantStatus: "requested" }];
      },
      loadSessionDiscovery: async () => {
        discoveryCalls += 1;
        return [publicSession];
      },
      withdrawFromSession: async () => {
        throw new Error("撤回申請已被其他裝置處理。");
      },
    },
  });

  await harness.controller.setAuthState({ user: { id: "guest" } }, { directory: true, nickname: true, ntrp: true });
  await harness.controller.loadDiscovery();
  const detail = openAction(harness);
  await detail.handlers.onWithdraw();

  assert.ok(participationCalls >= 2, "server rejection still re-reads private participation authority");
  assert.ok(discoveryCalls >= 2, "server rejection still re-reads public session authority");
  assert.equal(detail.detail.closeCalls, 0, "a retryable rejection keeps the current detail surface available");
  assert.ok(harness.toasts.includes("撤回申請已被其他裝置處理。"));
  assert.equal(harness.toasts.includes("已撤回申請。"), false);
});

test("a stale join rejection announces its reason when authority refresh closes the confirmation", async () => {
  let discoveryCalls = 0;
  const harness = createHarness({
    api: {
      loadSessionDiscovery: async () => {
        discoveryCalls += 1;
        return discoveryCalls === 1 ? [futureSession()] : [];
      },
      requestToJoinSession: async () => {
        throw new Error("球局已額滿，無法送出申請。");
      },
    },
  });

  await harness.controller.setAuthState({ user: { id: "guest" } }, { directory: true, nickname: true, ntrp: true });
  await harness.controller.loadDiscovery();
  const detail = openAction(harness);
  detail.handlers.onPrimary();
  const result = await detail.handlers.onConfirmJoin();

  assert.match(result.joinError, /球局已額滿/);
  assert.equal(detail.detail.closeCalls, 1, "authoritative discovery removes the stale detail");
  assert.ok(harness.toasts.includes("球局已額滿，無法送出申請。"));
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
        return mapReady
          ? {
              south: location.lat - 0.04,
              west: location.lng - 0.05,
              north: location.lat + 0.04,
              east: location.lng + 0.05,
            }
          : null;
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
        return {
          south: location.lat - 0.04,
          west: location.lng - 0.05,
          north: location.lat + 0.04,
          east: location.lng + 0.05,
        };
      },
    },
  });

  await harness.controller.setAuthState({ user: { id: "guest" } }, { directory: true, nickname: true, ntrp: true });
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
  await detail.handlers.onConfirmJoin();
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
  assert.deepEqual(
    harness.renders.at(-1).sessions.map((item) => item.sessionId),
    [2]
  );
});

test("authoritative discovery changes close a detail whose session fields are now stale", async () => {
  let discoveryCall = 0;
  const harness = createHarness({
    api: {
      loadSessionDiscovery: async () =>
        discoveryCall++ === 0
          ? [futureSession({ slotsRemaining: 1, status: "open" })]
          : [futureSession({ slotsRemaining: 0, status: "full" })],
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

test("eligible instant sessions use a direct-join action while approval sessions keep the request action", async () => {
  const instantSession = futureSession({ joinMode: "instant" });
  const instantHarness = createHarness({ session: instantSession });
  await instantHarness.controller.setAuthState(
    { user: { id: "instant-in-range" } },
    { directory: false, nickname: true, ntrp: true, ntrpValue: 3.5 }
  );
  await instantHarness.controller.loadDiscovery();
  const instantDetail = openAction(instantHarness);
  assert.equal(instantDetail.handlers.action.label, "直接加入");
  instantDetail.handlers.onPrimary();
  assert.deepEqual(instantDetail.detail.confirmingCalls, [{ expectedAccepted: true }]);

  const approvalSession = futureSession({ joinMode: "approval" });
  const approvalHarness = createHarness({ session: approvalSession });
  await approvalHarness.controller.setAuthState(
    { user: { id: "approval-in-range" } },
    { directory: false, nickname: true, ntrp: true, ntrpValue: 3.5 }
  );
  await approvalHarness.controller.loadDiscovery();
  const approvalDetail = openAction(approvalHarness);
  assert.equal(approvalDetail.handlers.action.label, "申請加入");
  approvalDetail.handlers.onPrimary();
  assert.deepEqual(approvalDetail.detail.confirmingCalls, [{ expectedAccepted: false }]);
});

test("join actions preflight missing and out-of-range viewer NTRP without blocking either join mode", async () => {
  for (const joinMode of ["approval", "instant"]) {
    const missing = createHarness({ session: futureSession({ joinMode }) });
    await missing.controller.setAuthState(
      { user: { id: `missing-${joinMode}` } },
      { directory: false, nickname: true, ntrp: false, ntrpValue: null }
    );
    await missing.controller.loadDiscovery();
    const missingAction = openAction(missing).handlers.action;
    assert.equal(missingAction.label, "申請加入");
    assert.equal(missingAction.disabled, undefined);
    assert.match(missingAction.note, /補填 NTRP/);
    const missingDetail = openAction(missing);
    missingDetail.handlers.onPrimary();
    assert.deepEqual(missingDetail.detail.confirmingCalls, [{ expectedAccepted: false }]);

    const outOfRange = createHarness({ session: futureSession({ joinMode }) });
    await outOfRange.controller.setAuthState(
      { user: { id: `outside-${joinMode}` } },
      { directory: false, nickname: true, ntrp: true, ntrpValue: 5.5 }
    );
    await outOfRange.controller.loadDiscovery();
    const outOfRangeAction = openAction(outOfRange).handlers.action;
    assert.equal(outOfRangeAction.label, "申請加入");
    assert.equal(outOfRangeAction.disabled, undefined);
    assert.match(outOfRangeAction.note, /不在球局設定的 NTRP 範圍/);
    const outOfRangeDetail = openAction(outOfRange);
    outOfRangeDetail.handlers.onPrimary();
    assert.deepEqual(outOfRangeDetail.detail.confirmingCalls, [{ expectedAccepted: false }]);
  }
});

test("join preflight notes stay stable across discovery arrays and close stale detail when profile NTRP changes", async () => {
  const session = futureSession({ candidateCourtIds: [8, 9], joinMode: "instant", venueType: "candidates" });
  const harness = createHarness({
    api: { loadSessionDiscovery: async () => [{ ...session, candidateCourtIds: [...session.candidateCourtIds] }] },
  });
  const auth = { user: { id: "profile-preflight" } };
  await harness.controller.setAuthState(auth, {
    directory: false,
    nickname: true,
    ntrp: true,
    ntrpValue: 5.5,
  });
  await harness.controller.loadDiscovery();
  const detail = openAction(harness);
  assert.match(detail.handlers.action.note, /不在球局設定的 NTRP 範圍/);

  await harness.controller.loadDiscovery();
  assert.equal(detail.detail.closeCalls, 0, "a new candidate ID array alone is not a detail change");

  await harness.controller.setAuthState(auth, {
    directory: false,
    nickname: true,
    ntrp: true,
    ntrpValue: 3.5,
  });
  assert.equal(detail.detail.closeCalls, 1, "the action note participates in actionKey reconciliation");
});

test("session detail reconciliation tracks four venue scalars but ignores candidate array identity", async () => {
  const original = futureSession({
    candidateCourtIds: [8, 9],
    feeNote: "",
    joinMode: "approval",
    rangeEnd: "2099-07-19T05:00:00.000Z",
    venueType: "candidates",
  });

  for (const [field, value] of [
    ["venueType", "booked"],
    ["rangeEnd", "2099-07-19T06:00:00.000Z"],
    ["feeNote", "每人 150 元"],
    ["joinMode", "instant"],
  ]) {
    let sessions = [{ ...original, candidateCourtIds: [...original.candidateCourtIds] }];
    const harness = createHarness({ api: { loadSessionDiscovery: async () => sessions } });
    await harness.controller.loadDiscovery();
    const detail = openAction(harness);

    sessions = [{ ...original, candidateCourtIds: [...original.candidateCourtIds], [field]: value }];
    await harness.controller.loadDiscovery();
    assert.equal(detail.detail.closeCalls, 1, `${field} closes a stale detail`);
  }
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
  assert.deepEqual(
    courtDrawer.sessions.map((item) => item.sessionId),
    [session.sessionId]
  );

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

  const authA = harness.controller.setAuthState({ user: { id: "A" } }, { directory: true, nickname: true, ntrp: true });
  await flush();
  const logout = harness.controller.setAuthState(null, null);
  pendingParticipation[0].resolve([{ sessionId: 41, viewerParticipantStatus: "requested" }]);
  await Promise.all([authA, logout]);
  let detail = openAction(harness);
  assert.equal(detail.handlers.action.label, "申請加入");

  const accountA = harness.controller.setAuthState(
    { user: { id: "A" } },
    { directory: true, nickname: true, ntrp: true }
  );
  await flush();
  const accountB = harness.controller.setAuthState(
    { user: { id: "B" } },
    { directory: true, nickname: true, ntrp: true }
  );
  await flush();
  pendingParticipation[2].resolve([{ sessionId: 41, viewerParticipantStatus: "accepted" }]);
  await accountB;
  pendingParticipation[1].resolve([{ sessionId: 41, viewerParticipantStatus: "requested" }]);
  await accountA;
  detail = openAction(harness);
  assert.equal(detail.handlers.action.label, "群組聊天");
});

test("accepted members use the primary CTA to open the existing group chat", async () => {
  const harness = createHarness({
    api: {
      loadMySessions: async () => [{ sessionId: 41, viewerParticipantStatus: "accepted" }],
      loadSessionMessages: async () => [],
      loadSessionRoster: async () => [],
    },
  });
  await harness.controller.setAuthState(
    { user: { id: "accepted-chat-member" } },
    { directory: false, nickname: true, ntrp: true, ntrpValue: 3.5 }
  );
  await harness.controller.loadDiscovery();

  const detail = openAction(harness);
  assert.equal(detail.handlers.action.label, "群組聊天");
  detail.handlers.onPrimary();
  assert.equal(harness.chatSheets.length, 1);
  assert.equal(harness.chatSheets[0].session.sessionId, 41);
});

test("detail withdrawals enter the shared confirmation before calling the lifecycle RPC", async () => {
  const confirmations = [];
  let withdrawalCalls = 0;
  const harness = createHarness({
    openWithdrawConfirmation: (handlers) => {
      confirmations.push(handlers);
      return createSurface(handlers.onClose);
    },
    api: {
      loadMySessions: async () => [{ sessionId: 41, viewerParticipantStatus: "requested" }],
      withdrawFromSession: async () => {
        withdrawalCalls += 1;
        return { outcome: "OK", reloadRequired: false };
      },
    },
  });
  await harness.controller.setAuthState(
    { user: { id: "withdraw-confirmation" } },
    { directory: false, nickname: true, ntrp: true, ntrpValue: 3.5 }
  );
  await harness.controller.loadDiscovery();

  const detail = openAction(harness);
  detail.handlers.onWithdraw();
  assert.equal(confirmations.length, 1);
  assert.equal(withdrawalCalls, 0);
  await confirmations[0].onConfirm();
  assert.equal(withdrawalCalls, 1);
});

test("My Sessions and chat withdrawals use the same confirmation boundary", async () => {
  const confirmations = [];
  let withdrawalCalls = 0;
  const acceptedSession = futureSession({
    canWithdraw: true,
    viewerParticipantStatus: "accepted",
    viewerRole: "guest",
  });
  const harness = createHarness({
    openWithdrawConfirmation: (handlers) => {
      confirmations.push(handlers);
      return createSurface(handlers.onClose);
    },
    api: {
      loadMySessions: async () => [acceptedSession],
      loadSessionMessages: async () => [],
      loadSessionRoster: async () => [],
      withdrawFromSession: async () => {
        withdrawalCalls += 1;
        return { outcome: "OK", reloadRequired: false };
      },
    },
  });
  await harness.controller.setAuthState(
    { user: { id: "withdraw-all-surfaces" } },
    { directory: false, nickname: true, ntrp: true, ntrpValue: 3.5 }
  );
  await harness.controller.loadDiscovery();

  harness.controller.withdrawMySession(acceptedSession.sessionId);
  assert.equal(confirmations.length, 1);
  assert.equal(withdrawalCalls, 0);
  await confirmations[0].onConfirm();
  assert.equal(withdrawalCalls, 1);

  harness.controller.openSessionChat(acceptedSession.sessionId);
  harness.chatSheets.at(-1).handlers.onWithdraw();
  assert.equal(confirmations.length, 2);
  assert.equal(withdrawalCalls, 1);
  await confirmations[1].onConfirm();
  assert.equal(withdrawalCalls, 2);
});

test("a delayed participation refresh closes a detail whose CTA would otherwise become stale", async () => {
  const participation = deferred();
  const harness = createHarness({
    api: { loadMySessions: () => participation.promise },
  });

  await harness.controller.loadDiscovery();
  const authUpdate = harness.controller.setAuthState(
    { user: { id: "account-a" } },
    { directory: true, nickname: true, ntrp: true }
  );
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
  await harness.controller.setAuthState({ user: { id: "account-a" } }, { directory: true, nickname: true, ntrp: true });
  const staleDetail = openAction(harness);
  assert.equal(staleDetail.handlers.action.label, "申請等待中");

  await harness.controller.setAuthState({ user: { id: "account-b" } }, { directory: true, nickname: true, ntrp: true });
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
  await harness.controller.setAuthState({ user: { id: "account-a" } }, { directory: true, nickname: true, ntrp: true });
  const detail = openAction(harness);
  detail.handlers.onPrimary();
  assert.equal(detail.detail.confirmingCalls.length, 1, "eligible account A can enter confirming");

  await harness.controller.setAuthState({ user: { id: "account-b" } }, { directory: true, nickname: true, ntrp: true });
  // 批 C3-2:confirmation 就是這張 detail 本身,身分切換關掉的是同一顆 surface。
  assert.equal(detail.detail.closeCalls, 1, "switching identity closes the pending confirmation");
  await detail.handlers.onConfirmJoin();
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
  await harness.controller.setAuthState({ user: { id: "account-a" } }, { directory: true, nickname: true, ntrp: true });
  const detail = openAction(harness);
  detail.handlers.onPrimary();

  await harness.controller.setAuthState({ user: { id: "account-a" } }, null);
  assert.equal(detail.detail.closeCalls, 1, "profile loading cannot leave a previously eligible confirmation open");
  await detail.handlers.onConfirmJoin();
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

  await harness.controller.setAuthState({ user: { id: "account-a" } }, { directory: true, nickname: true, ntrp: true });
  await harness.controller.loadDiscovery();
  const detail = openAction(harness);
  detail.handlers.onPrimary();
  const mutation = detail.handlers.onConfirmJoin();
  await flush();

  await harness.controller.setAuthState({ user: { id: "account-b" } }, { directory: true, nickname: true, ntrp: true });
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

  await harness.controller.setAuthState({ user: { id: "account-a" } }, { directory: true, nickname: true, ntrp: true });
  await harness.controller.loadDiscovery();
  const detail = openAction(harness);
  const mutation = detail.handlers.onWithdraw();
  await flush();

  await harness.controller.setAuthState({ user: { id: "account-b" } }, { directory: true, nickname: true, ntrp: true });
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

  await harness.controller.setAuthState({ user: { id: "account-a" } }, { directory: true, nickname: true, ntrp: true });
  await harness.controller.loadDiscovery();
  const detail = openAction(harness);
  detail.handlers.onPrimary();
  const mutation = detail.handlers.onConfirmJoin();
  await flush();
  assert.equal(joinCalls, 1);

  // The sheet can be dismissed while the network is pending. Reopening the
  // same detail must not create another confirmation surface/RPC for this
  // lifecycle (批 C3-2:confirmation 併進 detail,「reopen」就是再開一次
  // openSessionDetail——in-flight 防呆要讓它不落地)。
  detail.detail.close();
  detail.handlers.onPrimary();
  await flush();
  assert.equal(harness.opened.length, 1);
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

  await harness.controller.setAuthState({ user: { id: "account-a" } }, { directory: true, nickname: true, ntrp: true });
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

  await harness.controller.setAuthState({ user: { id: "account-a" } }, { directory: true, nickname: true, ntrp: true });
  await harness.controller.loadDiscovery();
  const joinDetail = openAction(harness);
  joinDetail.handlers.onPrimary();
  const joinMutation = joinDetail.handlers.onConfirmJoin();
  await flush();

  // An external refresh can legitimately make the CTA look like a withdraw
  // before the original join RPC settles. It must still remain one lifecycle.
  participation = [{ sessionId: 41, viewerParticipantStatus: "requested" }];
  await harness.controller.setAuthState({ user: { id: "account-a" } }, { directory: true, nickname: true, ntrp: true });
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

  await harness.controller.setAuthState({ user: { id: "account-a" } }, { directory: true, nickname: true, ntrp: true });
  await harness.controller.loadDiscovery();
  const firstDetail = openAction(harness, firstSession.sessionId);
  firstDetail.handlers.onPrimary();
  const firstMutation = firstDetail.handlers.onConfirmJoin();
  await flush();

  firstDetail.detail.close();
  const secondDetail = openAction(harness, secondSession.sessionId);
  secondDetail.handlers.onPrimary();
  assert.notEqual(secondDetail.detail, firstDetail.detail);

  pendingJoin.resolve({ outcome: "OK", reloadRequired: false });
  await firstMutation;
  assert.equal(secondDetail.detail.closeCalls, 0, "a stale completion must not close another session's confirmation");
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
  assert.deepEqual(
    harness.courtDrawers.at(-1).sessions.map((item) => item.sessionId),
    [1]
  );
});

test("district filter Sets are cloned on input and every reset starts from an unpolluted default", async () => {
  const harness = createHarness();
  await harness.controller.loadDiscovery();
  const callerOwned = new Set(["內湖區"]);

  harness.controller.setFilter("districts", callerOwned);
  callerOwned.add("大安區");
  assert.deepEqual([...harness.renders.at(-1).filters.districts], ["內湖區"]);

  harness.controller.resetFilters();
  const firstReset = harness.renders.at(-1).filters.districts;
  assert.deepEqual([...firstReset], []);
  firstReset.add("中山區");

  harness.controller.resetFilters();
  assert.deepEqual([...harness.renders.at(-1).filters.districts], []);
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

  // 批 C3-2:resume 現在直接以 initialStage:"confirming" 開一張新的 detail
  // sheet(見 sessionController.js 的 resumePendingIntent → enterJoinConfirming),
  // 不再開獨立的 confirmation surface;第一個 opened 是匿名時的 idle 詳情,
  // 第二個才是 resume 開的確認態。
  await harness.controller.setAuthState({ user: { id: "guest-a" } }, { directory: true, nickname: true, ntrp: true });
  assert.equal(targetLoads, 1);
  assert.equal(harness.opened.length, 2);
  assert.equal(harness.opened.at(-1).session.sessionId, 41);
  assert.equal(harness.opened.at(-1).handlers.initialStage, "confirming");
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

  // 真實 DOM:promptProfile 的 profile sheet 掛在 sheet root,mountSurface 會以
  // reason:"replace" 關掉底下的 detail sheet(controller 的 activeDetail 隨之歸零,
  // 但 replace ≠ dismiss,不清 intent)。fake 沒有 root 概念,這裡手動重現該替換,
  // resume 才會如實開出第二張 initialStage:"confirming" 的 sheet,而不是命中
  // resumePendingIntent 針對 hash 深連結競態的 existingDetail 重用分支。
  harness.opened.at(-1).detail.close({ reason: "replace", restoreFocus: false });

  await harness.controller.setAuthState({ user: { id: "guest-a" } }, { directory: true, nickname: true, ntrp: true });
  assert.equal(harness.opened.length, 2);
  assert.equal(harness.opened.at(-1).session.sessionId, 41);
  assert.equal(harness.opened.at(-1).handlers.initialStage, "confirming");
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

  const firstAuth = harness.controller.setAuthState(
    { user: { id: "guest-a" } },
    { directory: true, nickname: true, ntrp: true }
  );
  await flush();
  const refresh = harness.controller.setAuthState(
    { user: { id: "guest-a" } },
    { directory: true, nickname: true, ntrp: true }
  );
  await flush();
  target.resolve(futureSession());
  await Promise.all([firstAuth, refresh]);

  // resumeInFlight 用 [epoch, identity, action, sessionId] 去重,兩次同帳號、
  // 同 gate 的 setAuthState 只會讓 resume 真正落地一次(opened 只多一筆)。
  assert.equal(harness.opened.length, 1);
  assert.equal(harness.opened.at(-1).session.sessionId, 41);
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

  await harness.controller.setAuthState({ user: { id: "guest-a" } }, { directory: true, nickname: true, ntrp: true });
  await harness.controller.loadDiscovery();
  const detail = openAction(harness);
  detail.handlers.onPrimary();

  await harness.controller.setAuthState({ user: { id: "guest-a" } }, { directory: true, nickname: true, ntrp: true });
  assert.equal(detail.detail.closeCalls, 0);
  await detail.handlers.onConfirmJoin();
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

  const first = harness.controller.setAuthState(
    { user: { id: "guest-a" } },
    { directory: true, nickname: true, ntrp: true }
  );
  await flush();
  const second = harness.controller.setAuthState(
    { user: { id: "guest-a" } },
    { directory: true, nickname: true, ntrp: true }
  );
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

  await harness.controller.setAuthState(
    { user: { id: "guest-a" } },
    { directory: false, nickname: false, ntrp: false, status: "loading" }
  );
  harness.controller.openCreateIntent();
  assert.equal(harness.profilePrompts.length, 0);
  assert.ok(harness.toasts.includes("正在讀取個人檔案，請稍候。"));
  assert.deepEqual(intentStore.value(), { action: "create" });

  await harness.controller.setAuthState(
    { user: { id: "guest-a" } },
    { directory: false, nickname: false, ntrp: false, status: "error" }
  );
  assert.equal(harness.profilePrompts.length, 0);
  assert.ok(harness.toasts.includes("個人檔案暫時無法載入，請重新整理後再試。"));
  assert.deepEqual(intentStore.value(), { action: "create" });
});

test("create intent resume is silent while profile loads, reports errors, and opens after readiness", async () => {
  const session = { user: { id: "create-resume-readiness" } };
  const loadingIntent = createIntentStore({ action: "create" });
  const loading = createHarness({ intentStore: loadingIntent });

  await loading.controller.setAuthState(session, {
    directory: false,
    nickname: false,
    ntrp: false,
    status: "loading",
  });
  assert.deepEqual(loading.toasts, []);
  assert.equal(loading.createSheets.length, 0);
  assert.deepEqual(loadingIntent.value(), { action: "create" });

  await loading.controller.setAuthState(session, {
    directory: false,
    nickname: true,
    ntrp: true,
    status: "ready",
  });
  assert.equal(loading.createSheets.length, 1);

  const failed = createHarness({ intentStore: createIntentStore({ action: "create" }) });
  await failed.controller.setAuthState(
    { user: { id: "create-resume-error" } },
    {
      directory: false,
      nickname: false,
      ntrp: false,
      status: "error",
    }
  );
  assert.deepEqual(failed.toasts, ["個人檔案暫時無法載入，請重新整理後再試。"]);
});

test("join intent resume is silent while profile loads, reports errors, and opens after readiness", async () => {
  const session = { user: { id: "join-resume-readiness" } };
  const loadingIntent = createIntentStore({ action: "join", sessionId: 41 });
  const loading = createHarness({
    intentStore: loadingIntent,
    api: { loadSessionSummary: async () => futureSession() },
  });

  await loading.controller.setAuthState(session, {
    directory: false,
    nickname: false,
    ntrp: false,
    status: "loading",
  });
  assert.deepEqual(loading.toasts, []);
  assert.equal(loading.opened.length, 0);
  assert.deepEqual(loadingIntent.value(), { action: "join", sessionId: 41 });

  await loading.controller.setAuthState(session, {
    directory: false,
    nickname: true,
    ntrp: true,
    status: "ready",
  });
  assert.equal(loading.opened.length, 1);
  assert.equal(loading.opened.at(-1).handlers.initialStage, "confirming");

  const failed = createHarness({
    intentStore: createIntentStore({ action: "join", sessionId: 41 }),
    api: { loadSessionSummary: async () => futureSession() },
  });
  await failed.controller.setAuthState(
    { user: { id: "join-resume-error" } },
    {
      directory: false,
      nickname: false,
      ntrp: false,
      status: "error",
    }
  );
  assert.deepEqual(failed.toasts, ["個人檔案暫時無法載入，請重新整理後再試。"]);
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

  await createFlow.controller.setAuthState(
    { user: { id: "account-a" } },
    { directory: true, nickname: true, ntrp: true }
  );
  createFlow.controller.openCreateIntent();
  const staleCreate = createFlow.createSheets.at(-1);
  await createFlow.controller.setAuthState(
    { user: { id: "account-b" } },
    { directory: true, nickname: true, ntrp: true }
  );

  assert.equal(staleCreate.detail.closeCalls, 1);
  await assert.rejects(
    staleCreate.handlers.onSubmit({ courtId: 8 }, () => {}),
    /登入或個人檔案狀態已變更/
  );
  assert.equal(createCalls, 0);

  const profileHarness = createHarness();
  await profileHarness.controller.setAuthState({ user: { id: "account-a" } }, null);
  profileHarness.controller.openCreateIntent();
  const staleProfile = profileHarness.profilePrompts.at(-1);
  await profileHarness.controller.setAuthState(
    { user: { id: "account-b" } },
    { directory: true, nickname: true, ntrp: true }
  );

  assert.equal(staleProfile.detail.closeCalls, 1);
});

// 批 D5:submitCreateSession 不再自動 close()/showCreatedSession()——sheet 留
// 在原地渲染自己的成功頁,只有使用者點成功頁的「查看我的球局」才觸發
// onViewMySessions(見 sessionController.js 的 openCreateSessionForIntent)。
test("create session publish keeps the sheet open for its own success page and defers My Sessions navigation to onViewMySessions", async () => {
  const created = [];
  const harness = createHarness({
    api: {
      createSession: async (input) => {
        created.push(input);
        return { sessionId: 4242 };
      },
    },
  });
  await harness.controller.setAuthState({ user: { id: "host" } }, { directory: true, nickname: true, ntrp: true });
  harness.controller.openCreateIntent();
  const sheet = harness.createSheets.at(-1);

  const input = {
    courtId: 8,
    playType: "雙打",
    slotsTotal: 2,
    startAt: "2099-07-18T01:00:00.000Z",
    venueType: "walk_on",
  };
  const result = await sheet.handlers.onSubmit(input);

  assert.deepEqual(created, [input]);
  assert.equal(result.sessionId, 4242);
  assert.equal(sheet.detail.closeCalls, 0);
  assert.deepEqual(harness.createdSessionCalls, []);
  assert.deepEqual(harness.toasts, ["球局已發布！"]);

  sheet.handlers.onViewMySessions(result.sessionId);
  assert.deepEqual(harness.createdSessionCalls, [4242]);
});

test("create session publish still refreshes public and private authority before toasting", async () => {
  const calls = [];
  const harness = createHarness({
    api: {
      createSession: async () => {
        calls.push(["create"]);
        return { sessionId: 1 };
      },
      loadSessionDiscovery: async () => {
        calls.push(["public"]);
        return [];
      },
      loadMySessions: async () => {
        calls.push(["private"]);
        return [];
      },
    },
  });
  await harness.controller.setAuthState({ user: { id: "host" } }, { directory: true, nickname: true, ntrp: true });
  harness.controller.openCreateIntent();
  const sheet = harness.createSheets.at(-1);
  calls.length = 0;
  await sheet.handlers.onSubmit({ courtId: 8 });
  assert.ok(calls.some(([kind]) => kind === "public"));
  assert.ok(calls.some(([kind]) => kind === "private"));
});

// 批 D5 決策 8/2/13/4-5 的純函式單元覆蓋(venueType 推導、NTRP band 映射、
// canPublish 守門、日期＋時間組合)——sessionViews.js 是瀏覽器 ESM 模組但函式
// 本身無 DOM 依賴,node:test 可直接 import 執行。
test("D5 venueType derivation: fixed+booked=booked, fixed+not booked=walk_on, cand=candidates regardless of booked", async () => {
  const { deriveCreateVenueType } = await import("../src/sessionViews.js");
  assert.equal(deriveCreateVenueType("fixed", true), "booked");
  assert.equal(deriveCreateVenueType("fixed", false), "walk_on");
  assert.equal(deriveCreateVenueType("cand", true), "candidates");
  assert.equal(deriveCreateVenueType("cand", false), "candidates");
});

test("D5 create-form NTRP band mapping: 'any' is null/null (unlimited), others are the labelled numeric range", async () => {
  const { createNtrpRangeForBand } = await import("../src/sessionViews.js");
  assert.deepEqual(createNtrpRangeForBand("any"), { ntrpMax: null, ntrpMin: null });
  assert.deepEqual(createNtrpRangeForBand("lo"), { ntrpMax: 3, ntrpMin: 1 });
  assert.deepEqual(createNtrpRangeForBand("mid"), { ntrpMax: 4, ntrpMin: 3 });
  assert.deepEqual(createNtrpRangeForBand("hi"), { ntrpMax: 5, ntrpMin: 4 });
  assert.deepEqual(createNtrpRangeForBand("pro"), { ntrpMax: 7, ntrpMin: 5 });
});

test("D5 canPublish gate: fixed needs court+time, candidates needs >=2 courts and a slot", async () => {
  const { createSessionFormCanPublish } = await import("../src/sessionViews.js");
  assert.equal(createSessionFormCanPublish({ court: null, mode: "fixed", time: "09:00" }), false);
  assert.equal(createSessionFormCanPublish({ court: 8, mode: "fixed", time: null }), false);
  assert.equal(createSessionFormCanPublish({ court: 8, mode: "fixed", time: "09:00" }), true);
  assert.equal(createSessionFormCanPublish({ candCourts: { 8: true }, mode: "cand", slot: "morning" }), false);
  assert.equal(createSessionFormCanPublish({ candCourts: { 8: true, 9: true }, mode: "cand", slot: null }), false);
  assert.equal(createSessionFormCanPublish({ candCourts: { 8: true, 9: true }, mode: "cand", slot: "morning" }), true);
});

test("D5 fixed-mode date+time combination converts to the datetime-local string validateCreateSessionInput expects", async () => {
  const { createFixedStartAtLocal } = await import("../src/sessionViews.js");
  const now = new Date("2026-08-10T04:00:00.000Z"); // 2026-08-10 12:00 Taipei,週一
  assert.equal(createFixedStartAtLocal({ dateKey: "today", time: "19:00" }, now), "2026-08-10T19:00");
  assert.equal(createFixedStartAtLocal({ dateKey: "tomorrow", time: "06:30" }, now), "2026-08-11T06:30");
  // 週六 chip:下一個週六;今天(週一)不是週六,故往前推算到 08/15。
  assert.equal(createFixedStartAtLocal({ dateKey: "sat", time: "09:00" }, now), "2026-08-15T09:00");
  assert.equal(
    createFixedStartAtLocal({ customDate: "2099-01-01", dateKey: "custom", time: "21:00" }, now),
    "2099-01-01T21:00"
  );
  assert.equal(createFixedStartAtLocal({ dateKey: "today", time: null }, now), "");
});

test("D5 candidate-mode date+slot combination derives both startAtLocal and rangeEndLocal from the same day", async () => {
  const { createCandidateWindowLocal } = await import("../src/sessionViews.js");
  const now = new Date("2026-08-10T04:00:00.000Z");
  assert.deepEqual(createCandidateWindowLocal({ dateKey: "today", slot: "morning" }, now), {
    rangeEndLocal: "2026-08-10T10:00",
    startAtLocal: "2026-08-10T06:00",
  });
  assert.deepEqual(createCandidateWindowLocal({ dateKey: "today", slot: "evening" }, now), {
    rangeEndLocal: "2026-08-10T22:00",
    startAtLocal: "2026-08-10T18:00",
  });
  assert.deepEqual(createCandidateWindowLocal({ dateKey: "today", slot: null }, now), {
    rangeEndLocal: "",
    startAtLocal: "",
  });
});

test("D5 custom start-time stepper clamps to 06:00-22:00 in 15-minute steps", async () => {
  const { bumpCreateTimeMinutes } = await import("../src/sessionViews.js");
  assert.equal(bumpCreateTimeMinutes("19:30", 15), "19:45");
  assert.equal(bumpCreateTimeMinutes("19:30", -15), "19:15");
  assert.equal(bumpCreateTimeMinutes("05:50", -15), "06:00");
  assert.equal(bumpCreateTimeMinutes("21:50", 15), "22:00");
});

test("active profile and create forms receive courts loaded after they open", async () => {
  const taipeiCourts = [{ id: 8, city: "台北市", district: "大安區", name: "示範球場" }];
  const createFlow = createHarness();
  await createFlow.controller.setAuthState(
    { user: { id: "account-a" } },
    { directory: true, nickname: true, ntrp: true }
  );
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
  await fullHarness.controller.setAuthState(
    { user: { id: "guest-a" } },
    { directory: true, nickname: true, ntrp: true }
  );
  assert.equal(fullIntent.value(), null);
  assert.deepEqual(fullHarness.toasts, ["球局已額滿，已回到附近球局。"]);
  // 批 D2:v2 兩態,closeForStaleIntent 的 auto-expand 映射 open(非 modal,地圖可見)。
  assert.equal(fullHarness.renders.at(-1).drawerState, "open");
  assert.equal(fullHarness.opened.length, 0);

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
    await harness.controller.setAuthState(
      { user: { id: `guest-${status}` } },
      { directory: true, nickname: true, ntrp: true }
    );
    assert.equal(intentStore.value(), null, `${status} clears the original intent`);
    assert.deepEqual(harness.toasts, [message]);
    assert.equal(harness.opened.length, 0);
  }

  const unavailableIntent = createIntentStore({ action: "join", sessionId: 41 });
  const unavailableHarness = createHarness({
    intentStore: unavailableIntent,
    api: { loadSessionSummary: async () => null },
  });
  await unavailableHarness.controller.setAuthState(
    { user: { id: "guest-a" } },
    { directory: true, nickname: true, ntrp: true }
  );
  assert.equal(unavailableIntent.value(), null);
  assert.deepEqual(unavailableHarness.toasts, ["球局已取消、結束或不再開放，已回到附近球局。"]);
  assert.equal(unavailableHarness.renders.at(-1).drawerState, "open");
});

test("setDrawerState accepts the two-value enum and ignores illegal values", () => {
  const harness = createHarness();
  const { controller } = harness;

  assert.equal(
    typeof controller.setDrawerExpanded,
    "undefined",
    "setDrawerExpanded wrapper is retired; callers use setDrawerState directly"
  );

  controller.setDrawerState("open");
  assert.equal(harness.renders.at(-1).drawerState, "open");

  controller.setDrawerState("collapsed");
  assert.equal(harness.renders.at(-1).drawerState, "collapsed");

  const rendersBeforeIllegal = harness.renders.length;
  // 批 D2:v2 兩態,舊三態的 half/full 也屬非法值,一併驗證被忽略。
  controller.setDrawerState("half");
  controller.setDrawerState("full");
  controller.setDrawerState("expanded");
  controller.setDrawerState(true);
  controller.setDrawerState(null);
  controller.setDrawerState(undefined);
  assert.equal(harness.renders.length, rendersBeforeIllegal, "illegal values are ignored and do not publish");
  assert.equal(harness.renders.at(-1).drawerState, "collapsed", "state is unchanged by illegal values");
});

test("closing login or a recovered join confirmation clears only its matching intent", async () => {
  const intentStore = createIntentStore();
  const harness = createHarness({ intentStore, api: { loadSessionSummary: async () => futureSession() } });
  await harness.controller.loadDiscovery();
  openAction(harness).handlers.onPrimary();
  harness.loginPrompts[0].handlers.onClose();
  assert.equal(intentStore.value(), null);

  intentStore.save({ action: "join", sessionId: 41 });
  await harness.controller.setAuthState({ user: { id: "guest-a" } }, { directory: true, nickname: true, ntrp: true });
  // 批 C3-2:resume 開的是一張新的、initialStage:"confirming" 的 detail
  // sheet——它自己的 onClose(openSessionDetail 接的那個)才是現在唯一會清 intent
  // 的地方,不再有獨立的 confirmation surface。
  harness.opened.at(-1).handlers.onClose();
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

test("online layer uses the NTRP gate, reads only reciprocal presence, and resumes automatically", async () => {
  const anonymousIntent = createIntentStore();
  const presenceLoads = [];
  const anonymous = createHarness({
    intentStore: anonymousIntent,
    api: {
      loadPlayerDirectory: async () => {
        throw new Error("the online layer must not read player_directory");
      },
      loadPlayerPresenceDirectory: async (input) => {
        presenceLoads.push(input);
        return [
          { profileId: 8, courtId: 3, courtName: "河濱球場", courtDistrict: "中山區", courtLat: 25.1, courtLng: 121.5 },
        ];
      },
    },
  });

  await anonymous.controller.togglePlayerLayer?.();
  assert.deepEqual(anonymousIntent.value(), { action: "players" });
  assert.equal(anonymous.loginPrompts.length, 1);
  assert.equal(anonymous.controller.getPlayerLayerState().on, false);

  await anonymous.controller.setAuthState(
    { user: { id: "player-a" } },
    { directory: false, nickname: true, ntrp: true }
  );
  assert.equal(anonymous.playerRenders.at(-1)?.on, true);
  assert.deepEqual(
    anonymous.playerRenders.at(-1)?.groups.map((group) => group.players.map((player) => player.profileId)),
    [[8]]
  );
  assert.equal(presenceLoads.length, 1);
  assert.ok(presenceLoads[0]?.bounds, "the online layer keeps its viewport-bounded presence query");
  assert.equal(
    anonymous.profilePrompts.length,
    0,
    "a missing directory court does not block the NTRP-level online layer"
  );
  assert.equal(anonymousIntent.value(), null, "a successfully resumed layer does not replay on every auth refresh");

  const incompleteIntent = createIntentStore();
  const incomplete = createHarness({
    intentStore: incompleteIntent,
    api: { loadPlayerPresenceDirectory: async () => [] },
  });
  await incomplete.controller.setAuthState(
    { user: { id: "player-b" } },
    { directory: false, nickname: false, ntrp: false }
  );
  await incomplete.controller.togglePlayerLayer?.();
  assert.deepEqual(incompleteIntent.value(), { action: "players" });
  assert.equal(incomplete.profilePrompts.length, 1);
  assert.deepEqual(incomplete.profilePrompts[0].intent, { action: "players" });

  await incomplete.controller.setAuthState(
    { user: { id: "player-b" } },
    { directory: false, nickname: true, ntrp: true }
  );
  assert.equal(incomplete.playerRenders.at(-1)?.on, true);
  assert.equal(incompleteIntent.value(), null);
});

test("online layer groups only reciprocal presence rows and carries their count to the pin", async () => {
  const harness = createHarness({
    api: {
      loadPlayerPresenceDirectory: async () => [
        {
          profileId: 8001,
          nickname: "在線球友",
          ntrp: 3.5,
          openToGreeting: true,
          courtId: 101,
          courtName: "台北網球中心",
          courtDistrict: "內湖區",
          courtLat: 25.067446,
          courtLng: 121.596648,
          minutesAgo: 2,
          isSelf: false,
        },
      ],
    },
  });

  await harness.controller.setAuthState(
    { user: { id: "presence-viewer" } },
    { directory: true, nickname: true, ntrp: true }
  );
  await harness.controller.togglePlayerLayer();

  const group = harness.controller.getPlayerLayerState().groups[0];
  assert.equal(group.presenceCount, 1);
  assert.deepEqual(
    group.players.map((player) => player.profileId),
    [8001]
  );
  assert.equal(group.players[0].isPresent, true);
  assert.equal(group.players[0].minutesAgo, 2);
  assert.equal(group.players[0].openToGreeting, true);
});

test("player directory loads without bounds, aggregates home courts, and puts online profiles first", async () => {
  const directoryCalls = [];
  const presenceCalls = [];
  const harness = createHarness({
    api: {
      loadPlayerDirectory: async (...args) => {
        directoryCalls.push(args);
        return [
          {
            profileId: 8002,
            nickname: "離線球友",
            ntrp: 4,
            playTypes: ["雙打"],
            slotCodes: ["we-a"],
            courtId: 102,
            courtName: "第二球場",
            courtDistrict: "中山區",
            isSelf: false,
          },
          {
            profileId: 8001,
            nickname: "在線球友",
            ntrp: 3.5,
            playTypes: ["單打"],
            slotCodes: ["we-m"],
            courtId: 101,
            courtName: "第一球場",
            courtDistrict: "內湖區",
            isSelf: true,
          },
          {
            profileId: 8001,
            nickname: "在線球友",
            ntrp: 3.5,
            playTypes: ["單打"],
            slotCodes: ["we-m"],
            courtId: 103,
            courtName: "第三球場",
            courtDistrict: "大安區",
            isSelf: true,
          },
        ];
      },
      loadPlayerPresenceDirectory: async (...args) => {
        presenceCalls.push(args);
        return [{ profileId: 8001, minutesAgo: 3, openToGreeting: true }];
      },
    },
  });
  await harness.controller.setAuthState(
    { user: { id: "directory-viewer" } },
    { directory: true, nickname: true, ntrp: true }
  );

  const opened = harness.controller.openPlayerDirectory();
  await opened;

  assert.deepEqual(directoryCalls, [[]], "the list loads all Taipei directory rows without map bounds");
  assert.deepEqual(presenceCalls, [[]], "online badges use the all-Taipei reciprocal presence snapshot");
  const updates = harness.playerDirectories.at(-1).detail.directoryUpdates;
  assert.equal(updates[0].status, "loading");
  assert.equal(updates.at(-1).status, "ready");
  assert.deepEqual(
    updates.at(-1).players.map((player) => player.profileId),
    [8001, 8002]
  );
  assert.deepEqual(updates.at(-1).players[0].courtNames, ["第一球場", "第三球場"]);
  assert.equal(updates.at(-1).players[0].isPresent, true);
  assert.equal(updates.at(-1).players[0].isSelf, true);
});

test("player directory retains the directory gate while the online layer remains available at NTRP level", async () => {
  const harness = createHarness({ api: { loadPlayerPresenceDirectory: async () => [] } });
  await harness.controller.setAuthState(
    { user: { id: "ntrp-only-player" } },
    { directory: false, nickname: true, ntrp: true }
  );

  await harness.controller.togglePlayerLayer();
  assert.equal(harness.controller.getPlayerLayerState().on, true);
  assert.equal(harness.profilePrompts.length, 0);

  harness.controller.openPlayerDirectory();
  assert.deepEqual(harness.profilePrompts.at(-1).intent, { action: "directory" });
  assert.equal(harness.playerDirectories.length, 0);
});

test("online presence latest bounds wins and off, signout, and API errors cannot publish stale authorized data", async () => {
  const requests = [];
  const harness = createHarness({
    api: {
      loadPlayerPresenceDirectory: ({ bounds }) => {
        const request = deferred();
        requests.push({ bounds, request });
        return request.promise;
      },
    },
  });
  await harness.controller.setAuthState({ user: { id: "player-a" } }, { directory: false, nickname: true, ntrp: true });

  const opening = harness.controller.togglePlayerLayer?.();
  await flush();
  const latestBounds = { south: 25.1, west: 121.6, north: 25.12, east: 121.62 };
  const refresh = harness.controller.loadDiscovery(latestBounds);
  await flush();
  assert.equal(requests.length, 2);
  requests[1].request.resolve([
    { profileId: 2, courtId: 9, courtName: "新球場", courtDistrict: "北投區", courtLat: 25.11, courtLng: 121.61 },
  ]);
  await refresh;
  requests[0].request.resolve([
    { profileId: 1, courtId: 8, courtName: "舊球場", courtDistrict: "大安區", courtLat: 25.03, courtLng: 121.54 },
  ]);
  await opening;
  assert.deepEqual(
    harness.playerRenders.at(-1)?.groups.flatMap((group) => group.players.map((player) => player.profileId)),
    [2]
  );

  const pendingOff = harness.controller.loadDiscovery({ south: 25, west: 121.5, north: 25.05, east: 121.55 });
  await flush();
  await harness.controller.togglePlayerLayer?.();
  requests[2].request.resolve([
    { profileId: 3, courtId: 10, courtName: "晚到球場", courtDistrict: "信義區", courtLat: 25.02, courtLng: 121.53 },
  ]);
  await pendingOff;
  assert.equal(harness.playerRenders.at(-1)?.on, false);
  assert.deepEqual(harness.playerRenders.at(-1)?.groups, []);

  const reopen = harness.controller.togglePlayerLayer?.();
  await flush();
  await harness.controller.setAuthState(null, null);
  requests[3].request.resolve([
    { profileId: 4, courtId: 11, courtName: "私密球場", courtDistrict: "士林區", courtLat: 25.04, courtLng: 121.52 },
  ]);
  await reopen;
  assert.equal(harness.playerRenders.at(-1)?.on, false);
  assert.deepEqual(harness.playerRenders.at(-1)?.groups, []);

  await harness.controller.setAuthState({ user: { id: "player-b" } }, { directory: false, nickname: true, ntrp: true });
  const failed = harness.controller.togglePlayerLayer?.();
  await flush();
  requests[4].request.reject(new Error("permission denied"));
  await failed;
  assert.equal(harness.playerRenders.at(-1)?.status, "error");
  assert.match(harness.playerRenders.at(-1)?.message ?? "", /無法載入/);
});

test("same-court session and player pins have separate clickable anchors and unchanged player reconciliation preserves every layer", () => {
  const created = [];
  class Marker {
    constructor(options) {
      this.options = options;
      this.setMapCalls = [];
      created.push(this);
    }
    addListener(event, callback) {
      this.listener = { callback, event };
    }
    setMap(value) {
      this.setMapCalls.push(value);
    }
  }
  class Point {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
  }
  class Size {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }
  }
  const google = { maps: { Marker, Point, Size } };
  const map = {};
  const court = { id: 8, name: "示範球場", lat: 25.03, lng: 121.54 };
  const playerGroups = [
    {
      court,
      players: [{ profileId: 1 }, { profileId: 2 }],
      presenceCount: 2,
    },
  ];
  const sessionGroups = [{ court, sessions: [futureSession({ courtId: court.id })] }];
  const opened = { base: 0, playerIds: [], sessionIds: [] };

  const baseMarkers = mapModule.renderCourtBasePins(google, map, [court], () => {
    opened.base += 1;
  });
  const sessionMarkers = mapModule.renderSessionPins(google, map, sessionGroups, {
    onSession: (sessionId) => opened.sessionIds.push(sessionId),
  });
  const playerMarkers = mapModule.renderPlayerPins(google, map, playerGroups, (_court, players) => {
    opened.playerIds.push(...players.map((player) => player.profileId));
  });
  const sessionMarker = sessionMarkers[0];
  const playerMarker = playerMarkers[0];

  assert.deepEqual(
    sessionMarker.options.position,
    playerMarker.options.position,
    "both remain associated with the exact court coordinate"
  );
  const sessionVisualCenter = sessionMarker.options.icon.labelOrigin.x - sessionMarker.options.icon.anchor.x;
  const playerVisualCenter = playerMarker.options.icon.labelOrigin.x - playerMarker.options.icon.anchor.x;
  assert.ok(
    Math.abs(playerVisualCenter - sessionVisualCenter) >= 44,
    "visual anchors keep both full-size controls reachable"
  );
  assert.equal(playerMarker.options.label.text, "2");
  assert.equal(playerMarker.options.title, "在線 · 示範球場 · 2 人");
  assert.equal(playerMarker.options.optimized, false);
  sessionMarker.listener.callback();
  playerMarker.listener.callback();
  assert.deepEqual(opened.sessionIds, [41]);
  assert.deepEqual(opened.playerIds, [1, 2]);

  const reconciledPlayerMarkers = mapModule.renderPlayerPins(google, map, playerGroups, () => {}, playerMarkers);
  assert.equal(reconciledPlayerMarkers[0], playerMarker, "unchanged player marker keeps its instance");
  assert.deepEqual(playerMarker.setMapCalls, []);
  assert.deepEqual(sessionMarker.setMapCalls, [], "session markers are not detached when player markers refresh");
  assert.deepEqual(baseMarkers[0].setMapCalls, [], "base-court markers are not detached when player markers refresh");

  const pin = pinModule.playerPin?.(google, 2);
  assert.equal(pin?.label.text, "2");
  assert.match(pin?.icon.url ?? "", /svg/);

  const presencePin = pinModule.playerPin?.(google, 2, 1);
  assert.equal(presencePin?.label.text, "2", "the main label preserves the total player count when someone is present");
  assert.match(
    decodeURIComponent(presencePin?.icon.url ?? ""),
    /線1/,
    "a separate online badge carries the on-court count"
  );
});

test("legacy marker keyed diff makes a repeated poll a zero-op and updates exactly one changed court", () => {
  const created = [];
  const ops = { create: 0, detach: 0, update: 0 };
  const updated = new Set();
  function recordUpdate(marker) {
    if (updated.has(marker)) return;
    updated.add(marker);
    ops.update += 1;
  }
  class Marker {
    constructor(options) {
      this.options = options;
      created.push(this);
      ops.create += 1;
    }
    addListener(event, callback) {
      this.listener = { callback, event };
    }
    setIcon(icon) {
      recordUpdate(this);
      this.options.icon = icon;
    }
    setLabel(label) {
      recordUpdate(this);
      this.options.label = label;
    }
    setMap(value) {
      if (value === null) ops.detach += 1;
      else recordUpdate(this);
      this.options.map = value;
    }
    setPosition(position) {
      recordUpdate(this);
      this.options.position = position;
    }
    setTitle(title) {
      recordUpdate(this);
      this.options.title = title;
    }
    setZIndex(zIndex) {
      recordUpdate(this);
      this.options.zIndex = zIndex;
    }
  }
  class Point {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
  }
  class Size {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }
  }
  const google = { maps: { Marker, Point, Size } };
  const map = {};
  const courts = [
    { id: 8, name: "甲球場", lat: 25.03, lng: 121.54 },
    { id: 9, name: "乙球場", lat: 25.04, lng: 121.55 },
  ];
  const first = mapModule.renderCourtBasePins(google, map, courts);
  assert.equal(created.length, 2, "scan set is nonempty");

  Object.assign(ops, { create: 0, detach: 0, update: 0 });
  updated.clear();
  const unchanged = mapModule.renderCourtBasePins(
    google,
    map,
    courts.map((court) => ({ ...court }))
  );
  assert.deepEqual(ops, { create: 0, detach: 0, update: 0 });
  assert.deepEqual(unchanged, first, "60-second equivalent data keeps both instances");

  Object.assign(ops, { create: 0, detach: 0, update: 0 });
  updated.clear();
  const changed = mapModule.renderCourtBasePins(google, map, [{ ...courts[0], lat: 25.031 }, courts[1]]);
  assert.deepEqual(ops, { create: 0, detach: 0, update: 1 });
  assert.deepEqual(changed, first, "one data change updates in place without rebuilding");
  assert.deepEqual(changed[0].options.position, { lat: 25.031, lng: 121.54 });
});

test("undecided candidate sessions fan out to valid candidate courts and collapse to the decided court", () => {
  const courts = [
    { id: 8, name: "甲球場", lat: 25.03, lng: 121.54 },
    { id: 9, name: "乙球場", lat: 25.08, lng: 121.58 },
  ];
  const undecided = futureSession({
    candidateCourtIds: [8, 999, 9],
    decidedAt: "",
    venueType: "candidates",
  });
  const undecidedGroups = mapModule.groupSessionsByCourt(courts, [undecided]);

  assert.equal(undecidedGroups.length, 2, "the scan must find both catalogue-backed candidate courts");
  assert.deepEqual(
    undecidedGroups.map(({ court }) => court.id),
    [8, 9]
  );
  assert.ok(undecidedGroups.every((group) => group.undecidedCandidateSessionIds.includes(41)));

  const decidedGroups = mapModule.groupSessionsByCourt(courts, [
    { ...undecided, courtId: 9, decidedAt: "2026-07-19T01:00:00Z" },
  ]);
  assert.deepEqual(
    decidedGroups.map(({ court }) => court.id),
    [9]
  );
  assert.deepEqual(decidedGroups[0].undecidedCandidateSessionIds, []);
});

test("host decision uses summary candidate authority and refreshes both public and private state", async () => {
  const candidate = futureSession({
    canCancel: true,
    candidateCourtIds: [],
    decidedAt: "",
    rangeEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    venueType: "candidates",
    viewerParticipantStatus: "accepted",
    viewerRole: "host",
  });
  const calls = [];
  const summary = { ...candidate, candidateCourtIds: [8, 9] };
  const harness = createHarness({
    api: {
      decideSessionCourt: async (...args) => {
        calls.push(["decide", ...args]);
        return { outcome: "OK", reloadRequired: false };
      },
      loadMySessions: async () => {
        calls.push(["private"]);
        return [candidate];
      },
      loadSessionDiscovery: async () => {
        calls.push(["public"]);
        return [{ ...summary, courtId: 9, decidedAt: "2026-07-19T01:00:00Z" }];
      },
      loadSessionSummary: async (sessionId) => {
        calls.push(["summary", sessionId]);
        return summary;
      },
    },
  });
  await harness.controller.setAuthState({ user: { id: "host" } }, { nickname: true, ntrp: true });
  calls.length = 0;

  await harness.controller.openSessionDecision(candidate.sessionId);
  assert.equal(harness.decisionSheets.length, 1);
  assert.deepEqual(harness.decisionSheets[0].session.candidateCourtIds, [8, 9]);
  await harness.decisionSheets[0].handlers.onDecide(9, summary.startAt);

  assert.deepEqual(calls[0], ["summary", candidate.sessionId]);
  assert.deepEqual(calls[1], ["decide", candidate.sessionId, 9, summary.startAt]);
  assert.ok(calls.some(([kind]) => kind === "private"));
  assert.ok(calls.some(([kind]) => kind === "public"));
  assert.equal(harness.decisionSheets[0].detail.closeCalls, 1);
});

test("decision sheet stays nonterminal while courts load and receives the ready catalogue", async () => {
  const candidate = futureSession({
    canCancel: true,
    decidedAt: "",
    rangeEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    venueType: "candidates",
    viewerRole: "host",
  });
  const summary = { ...candidate, candidateCourtIds: [8, 9] };
  const harness = createHarness({
    api: {
      decideSessionCourt: async () => ({ outcome: "OK", reloadRequired: false }),
      loadMySessions: async () => [candidate],
      loadSessionSummary: async () => summary,
    },
  });
  await harness.controller.setAuthState({ user: { id: "host" } }, { nickname: true, ntrp: true });

  await harness.controller.openSessionDecision(candidate.sessionId);
  const sheet = harness.decisionSheets[0];
  assert.equal(sheet.session, summary, "an unloaded court catalogue must not erase authoritative session data");
  assert.deepEqual(sheet.handlers.courts, []);
  assert.equal(sheet.handlers.courtsReady, false);

  const courts = [
    { id: 8, name: "甲球場" },
    { id: 9, name: "乙球場" },
  ];
  harness.controller.setCourts(courts, { ready: true });
  assert.deepEqual(sheet.detail.courtUpdates, [{ courts, options: { ready: true } }]);
  assert.deepEqual(sheet.detail.terminalMessages, []);
});

test("decision expiry becomes a terminal sheet state after authoritative refresh", async () => {
  const candidate = futureSession({
    canCancel: true,
    decidedAt: "",
    rangeEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    venueType: "candidates",
    viewerRole: "host",
  });
  const harness = createHarness({
    api: {
      decideSessionCourt: async () => ({ outcome: "SESSION_EXPIRED", reloadRequired: true }),
      loadMySessions: async () => [candidate],
      loadSessionDiscovery: async () => [],
      loadSessionSummary: async () => ({ ...candidate, candidateCourtIds: [8, 9] }),
    },
  });
  await harness.controller.setAuthState({ user: { id: "host" } }, { nickname: true, ntrp: true });
  await harness.controller.openSessionDecision(candidate.sessionId);
  const sheet = harness.decisionSheets[0];
  await sheet.handlers.onDecide(8, candidate.startAt);

  assert.equal(sheet.detail.closeCalls, 0);
  assert.match(sheet.detail.terminalMessages.at(-1), /逾期|下架/);
});

test("a missing or already-decided summary opens the terminal decision state and candidates never enter editing", async () => {
  const candidate = futureSession({
    canCancel: true,
    decidedAt: "",
    venueType: "candidates",
    viewerRole: "host",
  });
  const harness = createHarness({
    api: {
      decideSessionCourt: async () => ({ outcome: "OK", reloadRequired: false }),
      loadMySessions: async () => [candidate],
      loadSessionSummary: async () => null,
    },
  });
  await harness.controller.setAuthState({ user: { id: "host" } }, { nickname: true, ntrp: true });

  await harness.controller.openSessionDecision(candidate.sessionId);
  assert.equal(harness.decisionSheets.length, 1);
  assert.equal(harness.decisionSheets[0].session, null);
  assert.throws(() => harness.controller.openSessionEdit(candidate.sessionId), /狀態已更新/);
});

test("host session detail exposes decision or edit management without changing the join action", async () => {
  const candidate = futureSession({ canCancel: true, decidedAt: "", venueType: "candidates", viewerRole: "host" });
  const harness = createHarness({
    api: { loadMySessions: async () => [candidate], loadSessionSummary: async () => candidate },
  });
  await harness.controller.setAuthState({ user: { id: "host" } }, { nickname: true, ntrp: true });
  harness.controller.openSession(candidate.sessionId);
  assert.equal(harness.opened[0].handlers.canDecide, true);
  assert.equal(harness.opened[0].handlers.canEdit, false);

  const booked = futureSession({ canCancel: true, sessionId: 42, viewerRole: "host" });
  const bookedHarness = createHarness({ api: { loadMySessions: async () => [booked] } });
  await bookedHarness.controller.setAuthState({ user: { id: "host" } }, { nickname: true, ntrp: true });
  bookedHarness.controller.openSession(booked.sessionId);
  assert.equal(bookedHarness.opened[0].handlers.canDecide, false);
  assert.equal(bookedHarness.opened[0].handlers.canEdit, true);
});

test("single-court host editing sends only the nine RPC fields and refreshes authority", async () => {
  const hosted = futureSession({ canCancel: true, viewerRole: "host" });
  const calls = [];
  const harness = createHarness({
    api: {
      loadMySessions: async () => {
        calls.push(["private"]);
        return [hosted];
      },
      loadSessionDiscovery: async () => {
        calls.push(["public"]);
        return [hosted];
      },
      updateSession: async (input) => {
        calls.push(["update", input]);
        return { outcome: "OK", reloadRequired: false };
      },
    },
  });
  await harness.controller.setAuthState({ user: { id: "host" } }, { nickname: true, ntrp: true });
  calls.length = 0;
  harness.controller.openSessionEdit(hosted.sessionId);
  const sheet = harness.editSheets[0];
  const input = {
    courtId: 9,
    feeNote: "每人 200",
    notes: "帶新球",
    ntrpMax: 4,
    ntrpMin: 3,
    playType: "雙打",
    slotsMissing: 3,
    startAt: hosted.startAt,
  };
  await sheet.handlers.onSubmit(input);

  assert.deepEqual(calls[0], ["update", { sessionId: hosted.sessionId, ...input }]);
  assert.equal("venueType" in calls[0][1], false);
  assert.equal("joinMode" in calls[0][1], false);
  assert.ok(calls.some(([kind]) => kind === "private"));
  assert.ok(calls.some(([kind]) => kind === "public"));
  assert.equal(sheet.detail.closeCalls, 1);
});

test("player drawer offers open hosted sessions through the now-start window and keeps invitation authority in controller", async () => {
  const futureHost = futureSession({ sessionId: 71, viewerRole: "host", status: "open" });
  const futureGuest = futureSession({ sessionId: 72, viewerRole: "guest", status: "open" });
  const fullHost = futureSession({ sessionId: 73, viewerRole: "host", status: "full" });
  const pastHost = futureSession({
    sessionId: 74,
    viewerRole: "host",
    status: "open",
    startAt: "2020-01-01T00:00:00.000Z",
  });
  const ongoingHost = futureSession({
    sessionId: 75,
    viewerRole: "host",
    status: "open",
    startAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  });
  const inviteCalls = [];
  const player = {
    profileId: 88,
    nickname: "球友",
    courtId: 8,
    courtName: "示範球場",
    courtLat: 25.03,
    courtLng: 121.54,
  };
  const harness = createHarness({
    api: {
      inviteToSession: async (...args) => {
        inviteCalls.push(args);
        return { outcome: "OK", reloadRequired: false };
      },
      loadMySessions: async () => [futureHost, futureGuest, fullHost, pastHost, ongoingHost],
      loadPlayerPresenceDirectory: async () => [player],
    },
  });
  await harness.controller.setAuthState({ user: { id: "host" } }, { directory: true, nickname: true, ntrp: true });
  await harness.controller.togglePlayerLayer?.();
  const group = harness.playerRenders.at(-1)?.groups[0];
  harness.controller.openPlayerCourt?.(group.court, group.players);
  harness.playerDrawers.at(-1)?.handlers.onOpenPlayer(player);

  assert.deepEqual(
    harness.playerCards.at(-1)?.handlers.myInvitableSessions.map((session) => session.sessionId),
    [75, 71]
  );
  await harness.playerCards.at(-1)?.handlers.onInvite(71);
  assert.deepEqual(inviteCalls, [[71, 88]]);
});

test("SESSION_EXPIRED player invites refresh choices and reject inline without closing the current card", async () => {
  const hostSession = futureSession({ sessionId: 71, viewerRole: "host", status: "open" });
  const player = {
    profileId: 88,
    nickname: "球友",
    courtId: 8,
    courtName: "示範球場",
    courtLat: 25.03,
    courtLng: 121.54,
  };
  let mySessionLoads = 0;
  const harness = createHarness({
    api: {
      inviteToSession: async () => ({ outcome: "SESSION_EXPIRED", reloadRequired: true }),
      loadMySessions: async () => (++mySessionLoads === 1 ? [hostSession] : []),
      loadPlayerPresenceDirectory: async () => [player],
    },
  });
  await harness.controller.setAuthState({ user: { id: "host" } }, { directory: true, nickname: true, ntrp: true });
  await harness.controller.togglePlayerLayer();
  const group = harness.controller.getPlayerLayerState().groups[0];
  harness.controller.openPlayerCourt(group.court, group.players);
  harness.playerDrawers.at(-1).handlers.onOpenPlayer(player);
  const card = harness.playerCards.at(-1);

  await assert.rejects(card.handlers.onInvite(71), /球局狀態已更新/);
  assert.equal(mySessionLoads, 2, "expired outcome rereads the authoritative host-session choices");
  assert.equal(card.detail.closeCalls, 0, "the card remains mounted so its form can render the inline error");
  assert.deepEqual(card.detail.invitableUpdates, [[]]);
});

test("account switches and profile eligibility loss close player surfaces and reject late invitation success", async () => {
  const invitation = deferred();
  const hostSession = futureSession({ sessionId: 71, viewerRole: "host", status: "open" });
  const player = {
    profileId: 88,
    nickname: "球友",
    courtId: 8,
    courtName: "示範球場",
    courtLat: 25.03,
    courtLng: 121.54,
  };
  const harness = createHarness({
    api: {
      inviteToSession: () => invitation.promise,
      loadMySessions: async () => [hostSession],
      loadPlayerPresenceDirectory: async () => [player],
    },
  });
  await harness.controller.setAuthState({ user: { id: "account-a" } }, { directory: true, nickname: true, ntrp: true });
  await harness.controller.togglePlayerLayer();
  const firstGroup = harness.controller.getPlayerLayerState().groups[0];
  harness.controller.openPlayerCourt(firstGroup.court, firstGroup.players);
  harness.playerDrawers.at(-1).handlers.onOpenPlayer(player);
  const staleCard = harness.playerCards.at(-1);
  const pendingInvite = staleCard.handlers.onInvite(71);

  await harness.controller.setAuthState({ user: { id: "account-b" } }, { directory: true, nickname: true, ntrp: true });
  assert.equal(staleCard.detail.closeCalls, 1);
  assert.equal(harness.controller.getPlayerLayerState().on, false);
  invitation.resolve({ outcome: "OK", reloadRequired: false });
  await assert.rejects(pendingInvite, /登入狀態已變更/);

  await harness.controller.togglePlayerLayer();
  const secondGroup = harness.controller.getPlayerLayerState().groups[0];
  harness.controller.openPlayerCourt(secondGroup.court, secondGroup.players);
  harness.playerDrawers.at(-1).handlers.onOpenPlayer(player);
  const eligibilityCard = harness.playerCards.at(-1);
  await harness.controller.setAuthState(
    { user: { id: "account-b" } },
    { directory: false, nickname: false, ntrp: false }
  );
  assert.equal(eligibilityCard.detail.closeCalls, 1);
  assert.equal(harness.controller.getPlayerLayerState().on, false);
  assert.deepEqual(harness.controller.getPlayerLayerState().groups, []);
});

test("explicit profile gates allow nickname-only joins and NTRP-ready creation without legacy complete", async () => {
  let joinRequests = 0;
  const joinHarness = createHarness({
    api: {
      requestToJoinSession: async () => {
        joinRequests += 1;
        return { outcome: "OK_NTRP_MISSING", reloadRequired: false };
      },
    },
  });

  await joinHarness.controller.setAuthState(
    { user: { id: "nickname-only" } },
    { directory: false, nickname: true, ntrp: false }
  );
  await joinHarness.controller.loadDiscovery();
  const joinDetail = openAction(joinHarness);
  joinDetail.handlers.onPrimary();
  assert.equal(joinDetail.detail.confirmingCalls.length, 1, "a nickname-only profile reaches confirming");
  await joinDetail.handlers.onConfirmJoin();
  assert.equal(joinRequests, 1, "the Join request reaches its nickname-gated RPC");

  const createHarnessForNtrp = createHarness();
  await createHarnessForNtrp.controller.setAuthState(
    { user: { id: "ntrp-ready" } },
    { directory: false, nickname: true, ntrp: true }
  );
  createHarnessForNtrp.controller.openCreateIntent();
  assert.equal(createHarnessForNtrp.createSheets.length, 1, "nickname plus NTRP reaches the create sheet");
});

test("a nickname-only profile is prompted for NTRP instead of opening the create sheet", async () => {
  const harness = createHarness();
  await harness.controller.setAuthState(
    { user: { id: "nickname-only-create" } },
    { directory: false, nickname: true, ntrp: false }
  );

  harness.controller.openCreateIntent();

  assert.equal(harness.profilePrompts.length, 1);
  assert.deepEqual(harness.profilePrompts[0].intent, { action: "create" });
  assert.equal(harness.createSheets.length, 0);
});

test("saving the missing create-profile fields resumes into the create sheet for the same account", async () => {
  const intentStore = createIntentStore();
  const harness = createHarness({ intentStore });
  const session = { user: { id: "create-profile-resume" } };
  await harness.controller.setAuthState(session, { directory: false, nickname: true, ntrp: false });

  harness.controller.openCreateIntent();
  const profilePrompt = harness.profilePrompts.at(-1);
  assert.deepEqual(profilePrompt.intent, { action: "create" });
  assert.equal(harness.createSheets.length, 0);

  await harness.controller.setAuthState(session, { directory: false, nickname: true, ntrp: true });

  assert.equal(profilePrompt.detail.closeCalls, 1);
  assert.equal(harness.createSheets.length, 1, "the saved NTRP resumes the pending create intent");
  assert.deepEqual(intentStore.value(), { action: "create" });
});

test("a directory action waits for the court catalogue instead of opening profile completion", async () => {
  const harness = createHarness();
  await harness.controller.setAuthState(
    { user: { id: "directory-catalogue-loading" } },
    { directory: false, directoryStatus: "loading", nickname: true, ntrp: true }
  );

  await harness.controller.openPlayerDirectory();

  assert.deepEqual(harness.toasts, ["正在讀取球場資料，請稍候。"]);
  assert.equal(harness.profilePrompts.length, 0);
  assert.equal(harness.controller.getPlayerLayerState().on, false);
});

test("a directory action attributes profile failures to the private profile", async () => {
  const harness = createHarness();
  await harness.controller.setAuthState(
    { user: { id: "directory-profile-error" } },
    { directory: false, directoryStatus: "ready", nickname: false, ntrp: false, status: "error" }
  );

  await harness.controller.openPlayerDirectory();

  assert.deepEqual(harness.toasts, ["個人檔案暫時無法載入，請重新整理後再試。"]);
  assert.equal(harness.profilePrompts.length, 0);
  assert.equal(harness.controller.getPlayerLayerState().on, false);
});

test("a directory action attributes catalogue failures to the court catalogue", async () => {
  const harness = createHarness();
  await harness.controller.setAuthState(
    { user: { id: "directory-catalogue-error" } },
    { directory: false, directoryStatus: "error", nickname: true, ntrp: true, status: "ready" }
  );

  await harness.controller.openPlayerDirectory();

  assert.deepEqual(harness.toasts, ["球場資料暫時無法載入，請稍後再試。"]);
  assert.equal(harness.profilePrompts.length, 0);
  assert.equal(harness.controller.getPlayerLayerState().on, false);
});

test("a persisted online-layer intent reports profile loading while it waits to resume", async () => {
  const intentStore = createIntentStore({ action: "players" });
  const harness = createHarness({ intentStore });

  await harness.controller.setAuthState(
    { user: { id: "directory-resume-profile-loading" } },
    { directory: false, directoryStatus: "ready", nickname: false, ntrp: false, status: "loading" }
  );

  assert.deepEqual(harness.toasts, ["正在讀取個人檔案，請稍候。"]);
  assert.deepEqual(intentStore.value(), { action: "players" });
  assert.equal(harness.profilePrompts.length, 0);
  assert.equal(harness.controller.getPlayerLayerState().on, false);
});

test("the production controller consumes explicit gates instead of a legacy complete flag", async () => {
  const prompts = [];
  const controller = createSessionController({
    api: { loadMySessions: async () => [] },
    promptProfile: (context) => {
      prompts.push(context);
      return createSurface(context.onClose);
    },
  });

  await controller.setAuthState({ user: { id: "explicit-gates-only" } }, { complete: true });
  controller.openCreateIntent();

  assert.deepEqual(
    prompts.map((prompt) => prompt.intent),
    [{ action: "create" }]
  );
});

test("a persisted visibility intent resumes once after the directory gate is restored", async () => {
  await withSessionStorage(new MemorySessionStorage(), async () => {
    const visibilityWrites = [];
    const controller = createSessionController({
      api: {
        loadMySessions: async () => [],
        setPlayerVisibility: async (visible) => visibilityWrites.push(visible),
      },
      promptProfile: (context) => createSurface(context.onClose),
      reloadCurrentProfile: async () => true,
    });

    await controller.setAuthState(
      { user: { id: "visibility-resume" } },
      { directory: false, isPublic: false, nickname: true, ntrp: true }
    );
    controller.togglePlayerVisibility();
    assert.equal(
      globalThis.sessionStorage.getItem(PENDING_SESSION_INTENT_KEY),
      JSON.stringify({ action: "visibility" })
    );

    await controller.setAuthState(
      { user: { id: "visibility-resume" } },
      { directory: true, isPublic: false, nickname: true, ntrp: true }
    );

    assert.deepEqual(visibilityWrites, [true]);
    assert.equal(globalThis.sessionStorage.getItem(PENDING_SESSION_INTENT_KEY), null);
  });
});

test("directory actions prompt for the directory gate while reporting and lifecycle actions retain their own authority", async () => {
  const directoryHarness = createHarness({
    api: {
      loadPlayerPresenceDirectory: async () => [],
      setPlayerVisibility: async () => {
        throw new Error("the directory gate must prompt before writing");
      },
    },
  });
  await directoryHarness.controller.setAuthState(
    { user: { id: "directory-missing" } },
    { directory: false, nickname: true, ntrp: true }
  );
  await directoryHarness.controller.togglePlayerLayer();
  assert.equal(directoryHarness.controller.getPlayerLayerState().on, true);
  assert.equal(directoryHarness.profilePrompts.length, 0);
  await directoryHarness.controller.openPlayerDirectory();
  assert.deepEqual(directoryHarness.profilePrompts.at(-1).intent, { action: "directory" });
  directoryHarness.profilePrompts.at(-1).detail.close({ reason: "dismiss" });
  await directoryHarness.controller.togglePlayerVisibility();
  assert.deepEqual(directoryHarness.profilePrompts.at(-1).intent, { action: "visibility" });

  const hostSession = futureSession({
    canCancel: true,
    sessionId: 411,
    viewerParticipantStatus: "accepted",
    viewerRole: "host",
  });
  const lifecycleCalls = [];
  const lifecycleHarness = createHarness({
    session: hostSession,
    api: {
      cancelSession: async (sessionId) => {
        lifecycleCalls.push(sessionId);
        return { outcome: "OK", reloadRequired: false };
      },
      createReport: async () => ({ reportId: 1 }),
      loadMySessions: async () => [hostSession],
    },
  });
  await lifecycleHarness.controller.setAuthState(
    { user: { id: "authority-only" } },
    { directory: false, nickname: false, ntrp: false }
  );
  await lifecycleHarness.controller.loadDiscovery();
  const detail = openAction(lifecycleHarness, 411);
  assert.equal(detail.handlers.canReport, true, "reporting has no profile gate in its RPC");
  lifecycleHarness.controller.openSessionReport(411);
  await lifecycleHarness.reportDialogs.at(-1).onSubmit("不實球局");
  await lifecycleHarness.controller.cancelMySession(411);
  assert.deepEqual(lifecycleCalls, [411], "a host lifecycle action keeps its server-side authority check");
});

test("an open discovery detail refreshes when a candidate decision timestamp changes", async () => {
  let sessions = [futureSession({ decidedAt: "", sessionId: 601, venueType: "candidates" })];
  const harness = createHarness({ api: { loadSessionDiscovery: async () => sessions } });

  await harness.controller.loadDiscovery();
  const opened = openAction(harness, 601);
  sessions = [futureSession({ decidedAt: "2026-07-19T01:30:00.000Z", sessionId: 601, venueType: "candidates" })];
  await harness.controller.loadDiscovery();

  assert.equal(opened.detail.closeCalls, 1, "a decided candidate cannot leave an old detail sheet open");
});

test("accepted members alone receive chat entry authority from private participation", async () => {
  const acceptedSession = futureSession({
    canWithdraw: true,
    sessionId: 701,
    viewerParticipantStatus: "accepted",
    viewerRole: "guest",
  });
  const requestedSession = futureSession({
    canWithdraw: true,
    sessionId: 702,
    viewerParticipantStatus: "requested",
    viewerRole: "guest",
  });
  const harness = createHarness({
    session: acceptedSession,
    api: {
      loadMySessions: async () => [acceptedSession, requestedSession],
      loadSessionMessages: async () => [],
      loadSessionRoster: async () => [],
    },
  });

  await harness.controller.setAuthState(
    { user: { id: "accepted-chat-member" } },
    { directory: false, nickname: true, ntrp: true }
  );
  await harness.controller.loadDiscovery();

  const acceptedDetail = openAction(harness, acceptedSession.sessionId);
  assert.equal(acceptedDetail.handlers.canChat, true);
  assert.equal(acceptedDetail.handlers.onChat(), harness.chatSheets.at(-1).detail);

  harness.opened.length = 0;
  // eslint-disable-next-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
  const requestedDetail = harness.controller.openSession(requestedSession.sessionId);
  assert.equal(harness.opened.at(-1).handlers.canChat, false);
  assert.throws(() => harness.controller.openSessionChat(requestedSession.sessionId), /球局的狀態已更新/);
});

test("chat refreshes on foreground visibility and after posting", async () => {
  const visibilityTarget = new EventTarget();
  Object.defineProperty(visibilityTarget, "visibilityState", { configurable: true, value: "hidden", writable: true });
  const session = futureSession({
    canWithdraw: true,
    sessionId: 711,
    viewerParticipantStatus: "accepted",
    viewerRole: "guest",
  });
  const messageLoads = [];
  const rosterLoads = [];
  const posts = [];
  const harness = createHarness({
    session,
    visibilityTarget,
    api: {
      loadMySessions: async () => [session],
      loadSessionMessages: async (sessionId) => {
        messageLoads.push(sessionId);
        return [
          {
            body: "球場見",
            createdAt: "2026-08-03T01:00:00Z",
            isSelf: false,
            kind: "user",
            messageId: 1,
            senderNickname: "球友",
            senderProfileId: 92,
            sessionId,
          },
        ];
      },
      loadSessionRoster: async (sessionId) => {
        rosterLoads.push(sessionId);
        return [{ nickname: "球友", profileId: 92, role: "guest", status: "accepted" }];
      },
      postSessionMessage: async (sessionId, body) => {
        posts.push([sessionId, body]);
        return { outcome: "OK" };
      },
    },
  });

  await harness.controller.setAuthState(
    { user: { id: "chat-refresh-member" } },
    { directory: false, nickname: true, ntrp: true }
  );
  const sheet = harness.controller.openSessionChat(session.sessionId);
  await flush();
  assert.deepEqual(messageLoads, [711]);
  assert.deepEqual(rosterLoads, [711]);
  assert.equal(sheet.stateUpdates.at(-1).messages.length, 1, "the message scan is nonempty");

  visibilityTarget.visibilityState = "visible";
  visibilityTarget.dispatchEvent(new Event("visibilitychange"));
  await flush();
  assert.deepEqual(messageLoads, [711, 711]);

  await harness.chatSheets.at(-1).handlers.onPost("回前景後送訊");
  assert.deepEqual(posts, [[711, "回前景後送訊"]]);
  assert.deepEqual(messageLoads, [711, 711, 711]);
});

test("chat polls quietly for the other member's messages while open and stops after close", async () => {
  const visibilityTarget = new EventTarget();
  Object.defineProperty(visibilityTarget, "visibilityState", { configurable: true, value: "visible", writable: true });
  const session = futureSession({
    canWithdraw: true,
    sessionId: 715,
    viewerParticipantStatus: "accepted",
    viewerRole: "guest",
  });
  const messageLoads = [];
  const harness = createHarness({
    chatPollIntervalMs: 5,
    session,
    visibilityTarget,
    api: {
      loadMySessions: async () => [session],
      loadSessionMessages: async (sessionId) => {
        messageLoads.push(sessionId);
        return [
          {
            body: "球場見",
            createdAt: "2026-08-03T01:00:00Z",
            isSelf: false,
            kind: "user",
            messageId: 1,
            senderNickname: "球友",
            senderProfileId: 92,
            sessionId,
          },
        ];
      },
      loadSessionRoster: async () => [{ nickname: "球友", profileId: 92, role: "guest", status: "accepted" }],
    },
  });

  await harness.controller.setAuthState(
    { user: { id: "chat-poll-member" } },
    { directory: false, nickname: true, ntrp: true }
  );
  const sheet = harness.controller.openSessionChat(session.sessionId);
  await flush();
  const initialLoads = messageLoads.length;
  assert.ok(initialLoads >= 1, "the initial chat load ran (nonempty scan)");

  // 輪詢:不需要任何使用者動作,訊息會被週期重讀。
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.ok(
    messageLoads.length > initialLoads,
    `poll ticks reload messages without user action (${messageLoads.length} > ${initialLoads})`
  );

  // 安靜:輪詢 tick 不得進 loading 態(只有初始載入那一次 loading)。
  const loadingUpdates = sheet.stateUpdates.filter((update) => update.status === "loading").length;
  assert.equal(loadingUpdates, 1, "poll ticks never flash the loading state");

  // 背景分頁時暫停輪詢。
  visibilityTarget.visibilityState = "hidden";
  await new Promise((resolve) => setTimeout(resolve, 20));
  const hiddenLoads = messageLoads.length;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(messageLoads.length, hiddenLoads, "no reloads while the tab is hidden");
  visibilityTarget.visibilityState = "visible";

  // 關閉聊天後 timer 停止,不再重讀。
  harness.chatSheets.at(-1).handlers.onClose();
  const closedLoads = messageLoads.length;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(messageLoads.length, closedLoads, "polling stops after the chat closes");
});

test("discovery polls quietly in the foreground without flashing loading or clearing sessions", async () => {
  const visibilityTarget = new EventTarget();
  Object.defineProperty(visibilityTarget, "visibilityState", { configurable: true, value: "visible", writable: true });
  const session = futureSession({ sessionId: 815 });
  let discoveryCalls = 0;
  const harness = createHarness({
    discoveryPollIntervalMs: 5,
    visibilityTarget,
    api: {
      loadSessionDiscovery: async () => {
        discoveryCalls += 1;
        return [session];
      },
    },
  });

  await harness.controller.loadDiscovery();
  const initialCalls = discoveryCalls;
  const rendersAfterInitial = harness.renders.length;

  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.ok(
    discoveryCalls > initialCalls,
    `poll refetches discovery without user action (${discoveryCalls} > ${initialCalls})`
  );

  // 安靜:輪詢 tick 不得閃 loading、清單持續保留(掃描集非空)。
  const laterViews = harness.renders.slice(rendersAfterInitial);
  assert.ok(laterViews.length > 0, "quiet refresh published views (nonempty scan)");
  assert.ok(
    laterViews.every((view) => view.mapStatus?.kind !== "loading"),
    "no loading flash during quiet ticks"
  );
  assert.ok(
    laterViews.every((view) => view.sessions.length === 1),
    "sessions stay rendered through quiet ticks"
  );

  // 背景分頁暫停輪詢。
  visibilityTarget.visibilityState = "hidden";
  await new Promise((resolve) => setTimeout(resolve, 20));
  const hiddenCalls = discoveryCalls;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(discoveryCalls, hiddenCalls, "no refetch while the tab is hidden");
});

test("opening chat marks it read, optimistically zeroes the unread count, and throttles duplicate RPC calls until a newer message arrives", async () => {
  const session = futureSession({
    canWithdraw: true,
    sessionId: 731,
    unreadMessageCount: 2,
    viewerParticipantStatus: "accepted",
    viewerRole: "guest",
  });
  const visibilityTarget = new EventTarget();
  Object.defineProperty(visibilityTarget, "visibilityState", { configurable: true, value: "visible", writable: true });
  let messageBatch = [
    {
      body: "先到先贏",
      createdAt: "2026-08-08T01:00:00Z",
      isSelf: false,
      kind: "user",
      messageId: 1,
      senderNickname: "球友",
      senderProfileId: 92,
      sessionId: 731,
    },
    {
      body: "球場見",
      createdAt: "2026-08-08T01:05:00Z",
      isSelf: false,
      kind: "user",
      messageId: 2,
      senderNickname: "球友",
      senderProfileId: 92,
      sessionId: 731,
    },
  ];
  const markReadCalls = [];
  const harness = createHarness({
    session,
    visibilityTarget,
    api: {
      loadMySessions: async () => [session],
      loadSessionMessages: async () => messageBatch,
      loadSessionRoster: async () => [],
      markSessionChatRead: async (sessionId) => {
        markReadCalls.push(sessionId);
        return { outcome: "OK" };
      },
    },
  });

  await harness.controller.setAuthState(
    { user: { id: "unread-clear-member" } },
    { directory: false, nickname: true, ntrp: true }
  );
  harness.controller.openSessionChat(session.sessionId);
  await flush();

  assert.deepEqual(markReadCalls, [731], "opening chat marks the session read exactly once");
  assert.equal(
    harness.controller.getMySessionState().groups.upcoming.find((entry) => entry.sessionId === 731)?.unreadMessageCount,
    0,
    "the optimistic clear zeroes the unread count before the authoritative reload lands"
  );
  assert.equal(harness.controller.getMySessionState().groups.hasUnread, false);

  // 同一批訊息(同一個最新 message id)重跑 refreshActiveChat(visibilitychange 等高頻
  // 重跑場景)不應重打 mark_session_chat_read——冪等節流以「這次開聊天期間已標過的最新
  // message id」為準,不是每次重跑都無條件再呼叫一次。
  visibilityTarget.dispatchEvent(new Event("visibilitychange"));
  await flush();
  assert.deepEqual(markReadCalls, [731], "an unchanged message feed does not repeat the mark-read RPC");

  // 新訊息進來後,節流游標前進,下一次重跑理應再標一次已讀。
  messageBatch = [
    ...messageBatch,
    {
      body: "新訊息",
      createdAt: "2026-08-08T01:10:00Z",
      isSelf: false,
      kind: "user",
      messageId: 3,
      senderNickname: "球友",
      senderProfileId: 92,
      sessionId: 731,
    },
  ];
  visibilityTarget.dispatchEvent(new Event("visibilitychange"));
  await flush();
  assert.deepEqual(
    markReadCalls,
    [731, 731],
    "a newer message resets the throttle and triggers another mark-read call"
  );
});

test("a failing mark-read RPC does not interrupt the chat sheet and is retried on the next refresh", async () => {
  const session = futureSession({
    canWithdraw: true,
    sessionId: 732,
    unreadMessageCount: 1,
    viewerParticipantStatus: "accepted",
    viewerRole: "guest",
  });
  const visibilityTarget = new EventTarget();
  Object.defineProperty(visibilityTarget, "visibilityState", { configurable: true, value: "visible", writable: true });
  const message = {
    body: "打不打",
    createdAt: "2026-08-08T01:00:00Z",
    isSelf: false,
    kind: "user",
    messageId: 5,
    senderNickname: "球友",
    senderProfileId: 92,
    sessionId: 732,
  };
  let markReadCalls = 0;
  let markReadShouldFail = true;
  const harness = createHarness({
    session,
    visibilityTarget,
    api: {
      loadMySessions: async () => [session],
      loadSessionMessages: async () => [message],
      loadSessionRoster: async () => [],
      markSessionChatRead: async () => {
        markReadCalls += 1;
        if (markReadShouldFail) throw new Error("網路暫時失敗");
        return { outcome: "OK" };
      },
    },
  });

  await harness.controller.setAuthState(
    { user: { id: "unread-retry-member" } },
    { directory: false, nickname: true, ntrp: true }
  );
  const sheet = harness.controller.openSessionChat(session.sessionId);
  await flush();

  assert.equal(markReadCalls, 1, "the failing RPC is still attempted once");
  assert.equal(
    sheet.stateUpdates.at(-1).status,
    "ready",
    "a failing best-effort mark-read must not surface a chat load error"
  );
  assert.equal(
    harness.controller.getMySessionState().groups.upcoming.find((entry) => entry.sessionId === 732)?.unreadMessageCount,
    0,
    "the optimistic clear still applies even though the RPC failed; the next authoritative reload corrects it if wrong"
  );

  markReadShouldFail = false;
  visibilityTarget.dispatchEvent(new Event("visibilitychange"));
  await flush();
  assert.equal(markReadCalls, 2, "an earlier failure keeps the throttle open so the next refresh retries the RPC");
});

test("chat governance reports the exact visible message, blocks its sender, and reloads authority", async () => {
  const session = futureSession({
    canWithdraw: true,
    sessionId: 721,
    viewerParticipantStatus: "accepted",
    viewerRole: "guest",
  });
  const visibleMessage = {
    body: "不當內容",
    createdAt: "2026-08-03T01:00:00Z",
    isSelf: false,
    kind: "user",
    messageId: 901,
    senderNickname: "待處理球友",
    senderProfileId: 92,
    sessionId: 721,
  };
  const reports = [];
  const blocks = [];
  let blockRows = [{ blockedNickname: "待處理球友", blockedProfileId: 92, createdAt: "2026-08-03T01:00:00Z" }];
  const harness = createHarness({
    session,
    api: {
      createReport: async (input) => {
        reports.push(input);
        return { reportId: 1 };
      },
      loadMyPlayerBlocks: async () => blockRows,
      loadMySessions: async () => [session],
      loadSessionMessages: async () => [visibleMessage],
      loadSessionRoster: async () => [],
      setPlayerBlock: async (profileId, blocked) => {
        blocks.push([profileId, blocked]);
        if (!blocked) blockRows = [];
        return { outcome: "OK" };
      },
    },
  });

  await harness.controller.setAuthState(
    { user: { id: "chat-governance-member" } },
    { directory: false, nickname: true, ntrp: true }
  );
  harness.controller.openSessionChat(session.sessionId);
  await flush();

  harness.chatSheets.at(-1).handlers.onReport(visibleMessage.messageId);
  await harness.reportDialogs.at(-1).onSubmit("騷擾");
  assert.deepEqual(reports, [{ messageId: 901, reason: "騷擾", reportedProfileId: 92, sessionId: 721 }]);

  await harness.chatSheets.at(-1).handlers.onBlock(visibleMessage.senderProfileId);
  assert.deepEqual(blocks, [[92, true]]);
  assert.equal(harness.controller.getMySessionState().blockedPlayers.length, 1, "the blocked-player scan is nonempty");

  await harness.controller.unblockPlayer(92);
  assert.deepEqual(blocks, [
    [92, true],
    [92, false],
  ]);
  assert.deepEqual(harness.controller.getMySessionState().blockedPlayers, []);
});
