import assert from "node:assert/strict";
import test from "node:test";

import { MAP_IDLE_DEBOUNCE_MS } from "../src/config.js";
import * as mapModule from "../src/map.js";
import * as pinModule from "../src/pins.js";
import * as sessionController from "../src/sessionController.js";

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
  const playerDrawers = [];
  const playerCards = [];
  const playerRenders = [];
  const createSheets = [];
  const loginPrompts = [];
  const profilePrompts = [];
  const reportDialogs = [];
  const mySessionChanges = [];
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
    renderPlayers: (view) => playerRenders.push(view),
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
    openCourtPlayersDrawer: (court, players, handlers) => {
      const detail = createSurface();
      playerDrawers.push({ court, detail, handlers, players });
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
    toast: (message) => toasts.push(message),
  });
  return {
    api,
    confirmations,
    controller,
    courtDrawers,
    createSheets,
    loginPrompts,
    mySessionChanges,
    opened,
    pinBatches,
    playerCards,
    playerDrawers,
    playerRenders,
    profilePrompts,
    reportDialogs,
    renders,
    session,
    toasts,
  };
}

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
      await harness.controller.setAuthState({ user: { id: "player" } }, { complete: true, isPublic: true });
      return true;
    },
  });

  await harness.controller.setAuthState({ user: { id: "player" } }, { complete: true, isPublic: false });
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

  await harness.controller.setAuthState({ user: { id: "player" } }, { complete: true, isPublic: false });

  await assert.rejects(
    harness.controller.togglePlayerVisibility(),
    /球友卡設定已更新，但個人檔案同步失敗/
  );
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

  await harness.controller.setAuthState({ user: { id: "account-a" } }, { complete: true, isPublic: false });
  const toggled = harness.controller.togglePlayerVisibility();
  await flush();
  assert.equal(harness.controller.getMySessionState().isPublic, true);

  await harness.controller.setAuthState({ user: { id: "account-b" } }, { complete: true, isPublic: false });
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

  await harness.controller.setAuthState({ user: { id: "player" } }, { complete: true, isPublic: false });
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

  assert.equal(groups.pendingHostRequestCount, 2, "only host-owned requested guests receive a badge count");
  assert.deepEqual(
    groups.needsAction.map((entry) => [entry.kind, entry.session.sessionId, entry.participant?.participantId ?? null]),
    [
      ["host-request", 1, 71],
      ["host-request", 1, 72],
      ["guest-request", 2, null],
    ]
  );
  assert.deepEqual(groups.upcoming.map((entry) => entry.sessionId), [3, 1]);
  assert.deepEqual(groups.history.map((entry) => entry.sessionId), [4, 5, 6]);
  assert.equal(groups.history[1].canConfirmAttendance, true, "played history can retain its server-authorized attendance action");
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
  assert.deepEqual(groups.history.map((entry) => entry.sessionId), [8]);
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

test("My Sessions hydrates host-only rosters for the badge and defers contacts until the page requests them", async () => {
  const rosterCalls = [];
  const contactCalls = [];
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
      loadSessionContacts: async (sessionId) => {
        contactCalls.push(sessionId);
        return [{ counterpartProfileId: sessionId + 100, lineId: `line-${sessionId}`, nickname: `聯絡人-${sessionId}`, sessionId }];
      },
      loadSessionRoster: async (sessionId) => {
        rosterCalls.push(sessionId);
        return [
          { participantId: 1, profileId: 11, role: "host", status: "accepted" },
          { participantId: 72, profileId: 22, nickname: "待審核球友", role: "guest", status: "requested" },
        ];
      },
    },
  });

  await harness.controller.setAuthState({ user: { id: "host" } }, { complete: true });

  assert.deepEqual(rosterCalls, [51]);
  assert.deepEqual(contactCalls, [], "contacts are not fetched merely because a participant is accepted");
  assert.equal(harness.controller.getMySessionGroups().pendingHostRequestCount, 1);

  await harness.controller.refreshMySessionDetails({ includeContacts: true });

  assert.deepEqual(contactCalls.sort((left, right) => left - right), [51, 52]);
  assert.deepEqual(harness.controller.getSessionContacts(52), [
    { counterpartProfileId: 152, lineId: "line-52", nickname: "聯絡人-52", sessionId: 52 },
  ]);
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
        { participantId: 72, profileId: 22, nickname: "待審核球友", role: "guest", status: requested ? "requested" : "accepted" },
      ],
    },
  });

  await harness.controller.setAuthState({ user: { id: "host" } }, { complete: true });
  await harness.controller.reviewMySessionParticipant(61, 72, "accepted");

  assert.deepEqual(calls, [[61, 72]]);
  assert.equal(harness.controller.getMySessionGroups().pendingHostRequestCount, 0);
  assert.ok(harness.toasts.includes("已接受申請。"));
});

test("an invited guest can accept through the authorized My Sessions row and receive refreshed contacts", async () => {
  const responses = [];
  const contactCalls = [];
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
      loadSessionContacts: async (sessionId) => {
        contactCalls.push(sessionId);
        return [{ counterpartProfileId: 99, lineId: "accepted-line", nickname: "邀請主揪", sessionId }];
      },
      respondToSessionInvite: async (sessionId, decision) => {
        responses.push([sessionId, decision]);
        participantStatus = decision;
        return { outcome: "OK", reloadRequired: false };
      },
    },
  });

  await harness.controller.setAuthState({ user: { id: "invited-guest" } }, { complete: true });
  await harness.controller.respondInvite(62, "accepted");

  assert.deepEqual(responses, [[62, "accepted"]]);
  assert.deepEqual(contactCalls, [62]);
  assert.deepEqual(harness.controller.getSessionContacts(62), [
    { counterpartProfileId: 99, lineId: "accepted-line", nickname: "邀請主揪", sessionId: 62 },
  ]);
  assert.deepEqual(harness.controller.getMySessionGroups().upcoming.map((session) => session.sessionId), [62]);
  assert.ok(harness.toasts.includes("已接受邀請。"));
});

test("an invited guest can decline without overfetching contacts", async () => {
  const responses = [];
  let participantStatus = "invited";
  let contactCalls = 0;
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
      loadSessionContacts: async () => {
        contactCalls += 1;
        return [];
      },
      respondToSessionInvite: async (sessionId, decision) => {
        responses.push([sessionId, decision]);
        participantStatus = decision;
        return { outcome: "OK", reloadRequired: false };
      },
    },
  });

  await harness.controller.setAuthState({ user: { id: "invited-guest" } }, { complete: true });
  await harness.controller.respondInvite(63, "declined");

  assert.deepEqual(responses, [[63, "declined"]]);
  assert.equal(contactCalls, 0);
  assert.deepEqual(harness.controller.getMySessionGroups().history.map((session) => session.sessionId), [63]);
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
  await harness.controller.setAuthState({ user: { id: "invited-guest" } }, { complete: true });
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
  await hostHarness.controller.setAuthState({ user: { id: "host" } }, { complete: true });
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
  await failedRefresh.controller.setAuthState({ user: { id: "refresh-failure" } }, { complete: true });
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
  await expired.controller.setAuthState({ user: { id: "expired-invite" } }, { complete: true });
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
  await rejected.controller.setAuthState({ user: { id: "rejected-invite" } }, { complete: true });
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

  await harness.controller.setAuthState({ user: { id: "account-a" } }, { complete: true });
  const pending = harness.controller.respondInvite(66, "accepted");
  currentIdentity = "account-b";
  await harness.controller.setAuthState({ user: { id: "account-b" } }, { complete: true });
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
      loadSessionContacts: async () => [{ counterpartProfileId: 20, lineId: "safe-line", nickname: "已核准球友" }],
      loadSessionRoster: async () => [{ participantId: 2, profileId: 20, nickname: "待審核球友", role: "guest", status: "requested" }],
    },
  });

  await harness.controller.setAuthState({ user: { id: "host" } }, { complete: true });
  await harness.controller.refreshMySessions({ includeContacts: true });
  assert.equal(harness.controller.getMySessionGroups().pendingHostRequestCount, 1);
  assert.deepEqual(harness.controller.getSessionContacts(71).map((contact) => contact.lineId), ["safe-line"]);

  rows = [];
  await harness.controller.refreshMySessions({ includeContacts: true });
  assert.equal(loads >= 3, true, "a manual refresh must re-read My Sessions rather than only cached details");
  assert.deepEqual(harness.controller.getMySessionGroups().upcoming, []);

  await harness.controller.setAuthState(null, null);
  assert.equal(harness.mySessionChanges.at(-1).authenticated, false, "sign-out publishes the anonymous My Sessions state");
  assert.equal(harness.mySessionChanges.at(-1).groups.pendingHostRequestCount, 0);
  assert.deepEqual(harness.mySessionChanges.at(-1).groups.upcoming, []);
  assert.deepEqual(harness.controller.getSessionContacts(71), []);
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

  await harness.controller.setAuthState({ user: { id: "host" } }, { complete: true });
  const state = harness.controller.getMySessionState();
  assert.equal(state.status, "error");
  assert.match(state.error, /待審核申請暫時無法載入/);
  assert.equal(state.groups.pendingHostRequestCount, 0);
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

  await harness.controller.setAuthState({ user: { id: "host" } }, { complete: true });
  await assert.rejects(
    harness.controller.reviewMySessionParticipant(76, 7, "accepted"),
    /球局狀態暫時無法重新載入/
  );
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

  await harness.controller.setAuthState({ user: { id: "host" } }, { complete: true });
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

  await harness.controller.setAuthState({ user: { id: "host" } }, { complete: true });
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

  await harness.controller.setAuthState({ user: { id: "guest" } }, { complete: true });
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

  await harness.controller.setAuthState({ user: { id: "guest" } }, { complete: true });
  await harness.controller.loadDiscovery();
  const detail = openAction(harness);
  detail.handlers.onPrimary();
  const confirmation = harness.confirmations.at(-1);
  const result = await confirmation.handlers.onConfirm(() => {});

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

test("eligible instant sessions use a direct-join action while approval sessions keep the request action", async () => {
  const instantSession = futureSession({ joinMode: "instant" });
  const instantHarness = createHarness({ session: instantSession });
  await instantHarness.controller.loadDiscovery();
  assert.equal(openAction(instantHarness).handlers.action.label, "直接加入");

  const approvalSession = futureSession({ joinMode: "approval" });
  const approvalHarness = createHarness({ session: approvalSession });
  await approvalHarness.controller.loadDiscovery();
  assert.equal(openAction(approvalHarness).handlers.action.label, "申請加入");
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

test("player layer uses the existing anonymous and incomplete-profile intent gate and resumes automatically", async () => {
  const anonymousIntent = createIntentStore();
  const anonymous = createHarness({
    intentStore: anonymousIntent,
    api: {
      loadPlayerDirectory: async () => [{ profileId: 8, courtId: 3, courtName: "河濱球場", courtDistrict: "中山區", courtLat: 25.1, courtLng: 121.5 }],
    },
  });

  await anonymous.controller.togglePlayerLayer?.();
  assert.deepEqual(anonymousIntent.value(), { action: "players" });
  assert.equal(anonymous.loginPrompts.length, 1);
  assert.equal(anonymous.controller.getPlayerLayerState().on, false);

  await anonymous.controller.setAuthState({ user: { id: "player-a" } }, { complete: true });
  assert.equal(anonymous.playerRenders.at(-1)?.on, true);
  assert.deepEqual(anonymous.playerRenders.at(-1)?.groups.map((group) => group.players.map((player) => player.profileId)), [[8]]);
  assert.equal(anonymousIntent.value(), null, "a successfully resumed layer does not replay on every auth refresh");

  const incompleteIntent = createIntentStore();
  const incomplete = createHarness({
    intentStore: incompleteIntent,
    api: { loadPlayerDirectory: async () => [] },
  });
  await incomplete.controller.setAuthState({ user: { id: "player-b" } }, { complete: false });
  await incomplete.controller.togglePlayerLayer?.();
  assert.deepEqual(incompleteIntent.value(), { action: "players" });
  assert.equal(incomplete.profilePrompts.length, 1);
  assert.deepEqual(incomplete.profilePrompts[0].intent, { action: "players" });

  await incomplete.controller.setAuthState({ user: { id: "player-b" } }, { complete: true });
  assert.equal(incomplete.playerRenders.at(-1)?.on, true);
  assert.equal(incompleteIntent.value(), null);
});

test("player layer puts reciprocal presence rows first and carries an on-court count to the pin", async () => {
  const harness = createHarness({
    api: {
      loadPlayerDirectory: async () => [
        { profileId: 8001, nickname: "靜態同名", courtId: 101, courtName: "台北網球中心", courtDistrict: "內湖區", courtLat: 25.067446, courtLng: 121.596648 },
        { profileId: 8002, nickname: "常打球友", courtId: 101, courtName: "台北網球中心", courtDistrict: "內湖區", courtLat: 25.067446, courtLng: 121.596648 },
      ],
      loadPlayerPresenceDirectory: async () => [
        { profileId: 8001, nickname: "在場球友", ntrp: 3.5, openToGreeting: true, courtId: 101, courtName: "台北網球中心", courtDistrict: "內湖區", courtLat: 25.067446, courtLng: 121.596648, minutesAgo: 2, isSelf: false },
      ],
    },
  });

  await harness.controller.setAuthState({ user: { id: "presence-viewer" } }, { complete: true });
  await harness.controller.togglePlayerLayer();

  const group = harness.controller.getPlayerLayerState().groups[0];
  assert.equal(group.presenceCount, 1);
  assert.deepEqual(group.players.map((player) => player.profileId), [8001, 8002]);
  assert.equal(group.players[0].isPresent, true);
  assert.equal(group.players[0].minutesAgo, 2);
  assert.equal(group.players[0].openToGreeting, true);
});

test("player directory latest bounds wins and off, signout, and API errors cannot publish stale authorized data", async () => {
  const requests = [];
  const harness = createHarness({
    api: {
      loadPlayerDirectory: ({ bounds }) => {
        const request = deferred();
        requests.push({ bounds, request });
        return request.promise;
      },
    },
  });
  await harness.controller.setAuthState({ user: { id: "player-a" } }, { complete: true });

  const opening = harness.controller.togglePlayerLayer?.();
  await flush();
  const latestBounds = { south: 25.1, west: 121.6, north: 25.12, east: 121.62 };
  const refresh = harness.controller.loadDiscovery(latestBounds);
  await flush();
  assert.equal(requests.length, 2);
  requests[1].request.resolve([{ profileId: 2, courtId: 9, courtName: "新球場", courtDistrict: "北投區", courtLat: 25.11, courtLng: 121.61 }]);
  await refresh;
  requests[0].request.resolve([{ profileId: 1, courtId: 8, courtName: "舊球場", courtDistrict: "大安區", courtLat: 25.03, courtLng: 121.54 }]);
  await opening;
  assert.deepEqual(harness.playerRenders.at(-1)?.groups.flatMap((group) => group.players.map((player) => player.profileId)), [2]);

  const pendingOff = harness.controller.loadDiscovery({ south: 25, west: 121.5, north: 25.05, east: 121.55 });
  await flush();
  await harness.controller.togglePlayerLayer?.();
  requests[2].request.resolve([{ profileId: 3, courtId: 10, courtName: "晚到球場", courtDistrict: "信義區", courtLat: 25.02, courtLng: 121.53 }]);
  await pendingOff;
  assert.equal(harness.playerRenders.at(-1)?.on, false);
  assert.deepEqual(harness.playerRenders.at(-1)?.groups, []);

  const reopen = harness.controller.togglePlayerLayer?.();
  await flush();
  await harness.controller.setAuthState(null, null);
  requests[3].request.resolve([{ profileId: 4, courtId: 11, courtName: "私密球場", courtDistrict: "士林區", courtLat: 25.04, courtLng: 121.52 }]);
  await reopen;
  assert.equal(harness.playerRenders.at(-1)?.on, false);
  assert.deepEqual(harness.playerRenders.at(-1)?.groups, []);

  await harness.controller.setAuthState({ user: { id: "player-b" } }, { complete: true });
  const failed = harness.controller.togglePlayerLayer?.();
  await flush();
  requests[4].request.reject(new Error("permission denied"));
  await failed;
  assert.equal(harness.playerRenders.at(-1)?.status, "error");
  assert.match(harness.playerRenders.at(-1)?.message ?? "", /無法載入/);
});

test("same-court session and player pins have separate clickable anchors and player replacement preserves other layers", () => {
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
  const playerGroups = [{
    court,
    players: [{ profileId: 1 }, { profileId: 2 }],
  }];
  const sessionGroups = [{ court, sessions: [futureSession({ courtId: court.id })] }];
  const opened = { base: 0, playerIds: [], sessionIds: [] };

  const baseMarkers = mapModule.renderCourtBasePins(google, map, [court], () => { opened.base += 1; });
  const sessionMarkers = mapModule.renderSessionPins(
    google,
    map,
    sessionGroups,
    { onSession: (sessionId) => opened.sessionIds.push(sessionId) }
  );
  const playerMarkers = mapModule.renderPlayerPins(google, map, playerGroups, (_court, players) => {
    opened.playerIds.push(...players.map((player) => player.profileId));
  });
  const sessionMarker = sessionMarkers[0];
  const playerMarker = playerMarkers[0];

  assert.deepEqual(sessionMarker.options.position, playerMarker.options.position, "both remain associated with the exact court coordinate");
  const sessionVisualCenter = sessionMarker.options.icon.labelOrigin.x - sessionMarker.options.icon.anchor.x;
  const playerVisualCenter = playerMarker.options.icon.labelOrigin.x - playerMarker.options.icon.anchor.x;
  assert.ok(Math.abs(playerVisualCenter - sessionVisualCenter) >= 44, "visual anchors keep both full-size controls reachable");
  assert.equal(playerMarker.options.label.text, "2");
  assert.equal(playerMarker.options.optimized, false);
  sessionMarker.listener.callback();
  playerMarker.listener.callback();
  assert.deepEqual(opened.sessionIds, [41]);
  assert.deepEqual(opened.playerIds, [1, 2]);

  mapModule.renderPlayerPins(google, map, playerGroups, () => {}, playerMarkers);
  assert.deepEqual(playerMarker.setMapCalls, [null]);
  assert.deepEqual(sessionMarker.setMapCalls, [], "session markers are not detached when player markers refresh");
  assert.deepEqual(baseMarkers[0].setMapCalls, [], "base-court markers are not detached when player markers refresh");

  const pin = pinModule.playerPin?.(google, 2);
  assert.equal(pin?.label.text, "2");
  assert.match(pin?.icon.url ?? "", /svg/);

  const presencePin = pinModule.playerPin?.(google, 2, 1);
  assert.equal(presencePin?.label.text, "2", "the main label preserves the total player count when someone is present");
  assert.match(decodeURIComponent(presencePin?.icon.url ?? ""), /在1/, "a separate presence badge carries the on-court count");
});

test("player drawer offers open hosted sessions through the now-start window and keeps invitation authority in controller", async () => {
  const futureHost = futureSession({ sessionId: 71, viewerRole: "host", status: "open" });
  const futureGuest = futureSession({ sessionId: 72, viewerRole: "guest", status: "open" });
  const fullHost = futureSession({ sessionId: 73, viewerRole: "host", status: "full" });
  const pastHost = futureSession({ sessionId: 74, viewerRole: "host", status: "open", startAt: "2020-01-01T00:00:00.000Z" });
  const ongoingHost = futureSession({
    sessionId: 75,
    viewerRole: "host",
    status: "open",
    startAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  });
  const inviteCalls = [];
  const player = { profileId: 88, nickname: "球友", courtId: 8, courtName: "示範球場", courtLat: 25.03, courtLng: 121.54 };
  const harness = createHarness({
    api: {
      inviteToSession: async (...args) => {
        inviteCalls.push(args);
        return { outcome: "OK", reloadRequired: false };
      },
      loadMySessions: async () => [futureHost, futureGuest, fullHost, pastHost, ongoingHost],
      loadPlayerDirectory: async () => [player],
    },
  });
  await harness.controller.setAuthState({ user: { id: "host" } }, { complete: true });
  await harness.controller.togglePlayerLayer?.();
  const group = harness.playerRenders.at(-1)?.groups[0];
  harness.controller.openPlayerCourt?.(group.court, group.players);
  harness.playerDrawers.at(-1)?.handlers.onOpenPlayer(player);

  assert.deepEqual(harness.playerCards.at(-1)?.handlers.myInvitableSessions.map((session) => session.sessionId), [75, 71]);
  await harness.playerCards.at(-1)?.handlers.onInvite(71);
  assert.deepEqual(inviteCalls, [[71, 88]]);
});

test("SESSION_EXPIRED player invites refresh choices and reject inline without closing the current card", async () => {
  const hostSession = futureSession({ sessionId: 71, viewerRole: "host", status: "open" });
  const player = { profileId: 88, nickname: "球友", courtId: 8, courtName: "示範球場", courtLat: 25.03, courtLng: 121.54 };
  let mySessionLoads = 0;
  const harness = createHarness({
    api: {
      inviteToSession: async () => ({ outcome: "SESSION_EXPIRED", reloadRequired: true }),
      loadMySessions: async () => (++mySessionLoads === 1 ? [hostSession] : []),
      loadPlayerDirectory: async () => [player],
    },
  });
  await harness.controller.setAuthState({ user: { id: "host" } }, { complete: true });
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
  const player = { profileId: 88, nickname: "球友", courtId: 8, courtName: "示範球場", courtLat: 25.03, courtLng: 121.54 };
  const harness = createHarness({
    api: {
      inviteToSession: () => invitation.promise,
      loadMySessions: async () => [hostSession],
      loadPlayerDirectory: async () => [player],
    },
  });
  await harness.controller.setAuthState({ user: { id: "account-a" } }, { complete: true });
  await harness.controller.togglePlayerLayer();
  const firstGroup = harness.controller.getPlayerLayerState().groups[0];
  harness.controller.openPlayerCourt(firstGroup.court, firstGroup.players);
  harness.playerDrawers.at(-1).handlers.onOpenPlayer(player);
  const staleCard = harness.playerCards.at(-1);
  const pendingInvite = staleCard.handlers.onInvite(71);

  await harness.controller.setAuthState({ user: { id: "account-b" } }, { complete: true });
  assert.equal(staleCard.detail.closeCalls, 1);
  assert.equal(harness.controller.getPlayerLayerState().on, false);
  invitation.resolve({ outcome: "OK", reloadRequired: false });
  await assert.rejects(pendingInvite, /登入狀態已變更/);

  await harness.controller.togglePlayerLayer();
  const secondGroup = harness.controller.getPlayerLayerState().groups[0];
  harness.controller.openPlayerCourt(secondGroup.court, secondGroup.players);
  harness.playerDrawers.at(-1).handlers.onOpenPlayer(player);
  const eligibilityCard = harness.playerCards.at(-1);
  await harness.controller.setAuthState({ user: { id: "account-b" } }, { complete: false });
  assert.equal(eligibilityCard.detail.closeCalls, 1);
  assert.equal(harness.controller.getPlayerLayerState().on, false);
  assert.deepEqual(harness.controller.getPlayerLayerState().groups, []);
});
