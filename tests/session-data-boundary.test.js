import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MY_PROFILE_SELECT,
  MY_SESSIONS_SELECT,
  PLAYER_DIRECTORY_SELECT,
  PLAYER_PRESENCE_DIRECTORY_SELECT,
  SESSION_CONTACTS_SELECT,
  SESSION_DISCOVERY_SELECT,
  SESSION_ROSTER_SELECT,
  SessionActionError,
  createDataApi,
  mapCurrentProfile,
  mapMySession,
  mapPlayerDirectoryRow,
  mapPlayerPresenceDirectoryRow,
  mapSessionContactRow,
  mapSessionRosterRow,
  mapSessionSummary,
  resolveInitialSession,
} from "../src/dataApi.js";
import { filterSessions, sortSessionsForDrawer } from "../src/filters.js";
import { MOCK_PLAYERS, MOCK_PLAYER_PRESENCE, MOCK_SESSIONS } from "../src/mockData.js";
import {
  PENDING_SESSION_INTENT_KEY,
  clearPendingIntent,
  readPendingIntent,
  savePendingIntent,
} from "../src/sessionIntent.js";

const SESSION_SUMMARY_KEYS = [
  "sessionId",
  "sportCode",
  "courtId",
  "court",
  "courtDistrict",
  "courtLat",
  "courtLng",
  "startAt",
  "playType",
  "ntrpMin",
  "ntrpMax",
  "slotsTotal",
  "slotsRemaining",
  "notes",
  "hostNickname",
  "hostNtrp",
  "hostProfileComplete",
  "status",
  "joinMode",
];

function session(overrides = {}) {
  return {
    sessionId: 10,
    sportCode: "tennis",
    courtId: 3,
    court: "示範球場",
    courtDistrict: "大安區",
    courtLat: 25.03,
    courtLng: 121.54,
    startAt: "2026-07-18T01:30:00.000Z",
    playType: "單打",
    ntrpMin: 3,
    ntrpMax: 3.5,
    slotsTotal: 2,
    slotsRemaining: 1,
    notes: "本機示範資料",
    hostNickname: "示範松果",
    hostNtrp: 3.5,
    hostProfileComplete: true,
    status: "open",
    joinMode: "approval",
    ...overrides,
  };
}

function sortedKeys(value) {
  return Object.keys(value).sort();
}

test("initial auth restoration distinguishes a definitive anonymous result from a recoverable error", async () => {
  const anonymousClient = {
    auth: {
      async getSession() {
        return { data: { session: null }, error: null };
      },
    },
  };
  assert.equal(await resolveInitialSession(anonymousClient, null), null);

  const restoreError = new Error("temporary refresh failure");
  const restoringClient = {
    auth: {
      async getSession() {
        return { data: { session: null }, error: null };
      },
      async setSession() {
        return { data: { session: null }, error: restoreError };
      },
    },
  };
  await assert.rejects(
    () => resolveInitialSession(restoringClient, JSON.stringify({ access_token: "access", refresh_token: "refresh" })),
    restoreError
  );
});

test("public and My Sessions mappers keep an explicit allowlist", () => {
  const row = {
    session_id: 41,
    sport_code: "tennis",
    court_id: 8,
    court: "青年公園網球場",
    court_district: "萬華區",
    court_lat: "25.02306",
    court_lng: "121.506928",
    start_at: "2026-07-19T02:00:00.000Z",
    play_type: "雙打",
    ntrp_min: "3.0",
    ntrp_max: "4.0",
    slots_total: 3,
    slots_remaining: 2,
    notes: "公開球局備註",
    host_nickname: "示範海星",
    host_ntrp: "3.5",
    host_profile_complete: true,
    status: "open",
    join_mode: "instant",
    line_id: "must-not-leak",
    host_profile_id: 99,
    profile_id: 98,
    real_name: "must-not-leak",
    profile_url: "https://example.invalid/private",
    arbitrary_column: "must-not-leak",
    viewer_role: "host",
    viewer_participant_status: "accepted",
    viewer_played_confirmed: false,
    updated_at: "2026-07-17T00:00:00.000Z",
    can_cancel: true,
    can_withdraw: false,
    can_confirm_played: false,
    can_confirm_attendance: false,
    can_respond_invite: true,
  };

  const publicSummary = mapSessionSummary(row);
  assert.deepEqual(sortedKeys(publicSummary), [...SESSION_SUMMARY_KEYS].sort());
  assert.equal(publicSummary.hostNickname, "示範海星");
  assert.equal(publicSummary.hostNtrp, 3.5);
  assert.equal(publicSummary.hostProfileComplete, true);
  assert.equal(publicSummary.joinMode, "instant");
  assert.equal("lineId" in publicSummary, false);
  assert.equal("profileId" in publicSummary, false);
  assert.equal("realName" in publicSummary, false);
  assert.equal("profileUrl" in publicSummary, false);

  const mine = mapMySession(row);
  assert.deepEqual(sortedKeys(mine), [
    ...SESSION_SUMMARY_KEYS,
    "viewerRole",
    "viewerParticipantStatus",
    "viewerPlayedConfirmed",
    "updatedAt",
    "canCancel",
    "canWithdraw",
    "canConfirmPlayed",
    "canConfirmAttendance",
    "canRespondInvite",
  ].sort());
  assert.equal(mine.updatedAt, "2026-07-17T00:00:00.000Z");
  assert.equal(mine.canRespondInvite, true);
  assert.equal("lineId" in mine, false);
  assert.equal("profileId" in mine, false);
});

test("private roster/contact/profile mappers stay separate from public summaries", () => {
  const roster = mapSessionRosterRow({
    session_id: 41,
    participant_id: 8,
    profile_id: 99,
    nickname: "私有名單成員",
    ntrp: "3.5",
    play_types: ["單打"],
    home_courts: ["青年公園網球場"],
    role: "guest",
    status: "accepted",
    line_id: "must-not-leak-into-roster",
  });
  assert.deepEqual(sortedKeys(roster), [
    "sessionId",
    "participantId",
    "profileId",
    "nickname",
    "ntrp",
    "playTypes",
    "homeCourts",
    "role",
    "status",
  ].sort());
  assert.equal("lineId" in roster, false);

  const contact = mapSessionContactRow({
    session_id: 41,
    counterpart_profile_id: 99,
    nickname: "接受配對的球友",
    line_id: "accepted-pair-only",
    source_url: "must-not-leak-into-contact-model",
  });
  assert.deepEqual(sortedKeys(contact), ["sessionId", "counterpartProfileId", "nickname", "lineId"].sort());
  assert.equal(contact.lineId, "accepted-pair-only");

  const profile = mapCurrentProfile(
    {
      nickname: "本人",
      ntrp: "3.5",
      line_id: "private-form-only",
      court_ids: [7],
      play_types: ["單打"],
      slot_codes: ["we-m"],
      id: 99,
      user_id: "must-not-map",
      is_public: true,
    },
    [{ id: 7, name: "青年公園網球場" }]
  );
  assert.deepEqual(sortedKeys(profile), ["nick", "ntrp", "types", "courts", "slots", "lineId", "isPublic", "sharePresence", "openToGreeting"].sort());
  assert.equal("id" in profile, false);
  assert.equal("share" in profile, false);
  assert.equal(profile.isPublic, true);
  assert.equal(profile.sharePresence, false);
  assert.equal(profile.openToGreeting, false);
});

test("player presence mapper keeps the exact reciprocal-directory allowlist", () => {
  const presenceRow = {
    profile_id: "8001",
    nickname: "示範山嵐",
    ntrp: "3.5",
    open_to_greeting: true,
    court_id: "101",
    court_name: "台北網球中心",
    court_district: "內湖區",
    court_lat: "25.067446",
    court_lng: "121.596648",
    minutes_ago: "3",
    is_self: false,
    line_id: "must-not-leak",
    raw_lat: "must-not-leak",
  };

  assert.deepEqual(PLAYER_PRESENCE_DIRECTORY_SELECT.split(","), [
    "profile_id",
    "nickname",
    "ntrp",
    "open_to_greeting",
    "court_id",
    "court_name",
    "court_district",
    "court_lat",
    "court_lng",
    "minutes_ago",
    "is_self",
  ]);
  assert.equal(PLAYER_PRESENCE_DIRECTORY_SELECT.includes("*"), false);
  assert.equal(PLAYER_PRESENCE_DIRECTORY_SELECT.includes("line_id"), false);
  assert.equal(PLAYER_PRESENCE_DIRECTORY_SELECT.includes("raw_lat"), false);
  assert.deepEqual(mapPlayerPresenceDirectoryRow(presenceRow), {
    profileId: 8001,
    nickname: "示範山嵐",
    ntrp: 3.5,
    openToGreeting: true,
    courtId: 101,
    courtName: "台北網球中心",
    courtDistrict: "內湖區",
    courtLat: 25.067446,
    courtLng: 121.596648,
    minutesAgo: 3,
    isSelf: false,
  });
});

test("player presence mock fixture is independently bounded and has no LINE field", async () => {
  assert.ok(MOCK_PLAYER_PRESENCE.length > 0);
  const api = createDataApi({ configured: false, mockPlayerPresence: MOCK_PLAYER_PRESENCE });
  const entries = await api.loadPlayerPresenceDirectory({
    bounds: { south: 25.06, west: 121.59, north: 25.08, east: 121.61 },
  });

  assert.deepEqual(entries.map((entry) => entry.profileId), [8001]);
  assert.equal("lineId" in entries[0], false);
  assert.notEqual(entries[0], MOCK_PLAYER_PRESENCE[0]);
});

test("player directory mapper keeps its exact public allowlist", () => {
  const directoryRow = {
    profile_id: "8001",
    nickname: "示範山嵐",
    ntrp: "3.5",
    play_types: ["單打", "對拉"],
    slot_codes: ["we-m", "we-a"],
    court_id: "101",
    court_name: "台北網球中心",
    court_district: "內湖區",
    court_lat: "25.067446",
    court_lng: "121.596648",
    is_self: false,
    line_id: "must-not-leak",
    real_name: "must-not-leak",
  };

  assert.deepEqual(PLAYER_DIRECTORY_SELECT.split(","), [
    "profile_id",
    "nickname",
    "ntrp",
    "play_types",
    "slot_codes",
    "court_id",
    "court_name",
    "court_district",
    "court_lat",
    "court_lng",
    "is_self",
  ]);
  assert.equal(PLAYER_DIRECTORY_SELECT.includes("*"), false);
  assert.equal(PLAYER_DIRECTORY_SELECT.includes("line_id"), false);
  assert.deepEqual(sortedKeys(mapPlayerDirectoryRow(directoryRow)), [
    "profileId",
    "nickname",
    "ntrp",
    "playTypes",
    "slotCodes",
    "courtId",
    "courtName",
    "courtDistrict",
    "courtLat",
    "courtLng",
    "isSelf",
  ].sort());
  assert.deepEqual(mapPlayerDirectoryRow(directoryRow), {
    profileId: 8001,
    nickname: "示範山嵐",
    ntrp: 3.5,
    playTypes: ["單打", "對拉"],
    slotCodes: ["we-m", "we-a"],
    courtId: 101,
    courtName: "台北網球中心",
    courtDistrict: "內湖區",
    courtLat: 25.067446,
    courtLng: 121.596648,
    isSelf: false,
  });
});

test("player directory mock data is cloned and constrained to requested bounds", async () => {
  assert.equal(MOCK_PLAYERS.length, 3);
  const api = createDataApi({ configured: false, mockPlayers: MOCK_PLAYERS });
  const entries = await api.loadPlayerDirectory({
    bounds: { south: 25.06, west: 121.59, north: 25.08, east: 121.61 },
  });

  assert.deepEqual(entries.map((entry) => entry.profileId), [8001, 8002]);
  assert.notEqual(entries[0], MOCK_PLAYERS[0]);
  assert.equal("lineId" in entries[0], false);
});

test("mock sessions and discovery payloads include an ongoing local-demo-only SessionSummary", async () => {
  assert.equal(MOCK_SESSIONS.length, 6);
  assert.equal(MOCK_SESSIONS.find((mock) => mock.sessionId === 9002)?.joinMode, "instant");
  assert.ok(MOCK_SESSIONS.filter((mock) => mock.sessionId !== 9002).every((mock) => mock.joinMode === "approval"));
  assert.equal(MOCK_SESSIONS.filter((mock) => Date.parse(mock.startAt) <= Date.now()).length, 1);

  for (const mock of MOCK_SESSIONS) {
    assert.deepEqual(sortedKeys(mock), [...SESSION_SUMMARY_KEYS].sort());
    assert.ok(Date.parse(mock.startAt) > Date.now() - 2 * 60 * 60 * 1000, `${mock.sessionId} must be discoverable`);
    assert.match(mock.notes, /本機示範/);
    assert.equal("lineId" in mock, false);
    assert.equal("profileId" in mock, false);
    assert.equal("sourceUrl" in mock, false);
    assert.equal("realName" in mock, false);
    assert.equal("profileUrl" in mock, false);
  }

  const api = createDataApi({ configured: false, mockSessions: MOCK_SESSIONS });
  const discovery = await api.loadSessionDiscovery({
    bounds: { south: 24.95, west: 121.43, north: 25.18, east: 121.67 },
    startAfter: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    startBefore: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
  });
  assert.equal(discovery.length, MOCK_SESSIONS.length);
  assert.deepEqual(sortedKeys(discovery[0]), [...SESSION_SUMMARY_KEYS].sort());
  assert.equal("lineId" in discovery[0], false);
  assert.equal("profileId" in discovery[0], false);

  const taintedMock = {
    ...MOCK_SESSIONS[0],
    hostProfileId: "TAINT_HOST_PROFILE_ID",
    lineId: "TAINT_LINE_ID",
    profileId: "TAINT_PROFILE_ID",
    profileUrl: "TAINT_PROFILE_URL",
    realName: "TAINT_REAL_NAME",
    sourceUrl: "TAINT_SOURCE_URL",
    usualCourts: "TAINT_USUAL_COURTS",
  };
  const taintedDiscovery = await createDataApi({ configured: false, mockSessions: [taintedMock] }).loadSessionDiscovery({
    bounds: { south: 24.95, west: 121.43, north: 25.18, east: 121.67 },
  });
  const capturedPublicJson = JSON.stringify(taintedDiscovery);
  for (const value of [
    "TAINT_HOST_PROFILE_ID",
    "TAINT_LINE_ID",
    "TAINT_PROFILE_ID",
    "TAINT_PROFILE_URL",
    "TAINT_REAL_NAME",
    "TAINT_SOURCE_URL",
    "TAINT_USUAL_COURTS",
  ]) {
    assert.doesNotMatch(capturedPublicJson, new RegExp(value));
  }
});

test("session filters use Taipei local date, range overlap, and preserve source order", () => {
  const now = new Date("2026-07-17T00:00:00.000Z");
  const sessions = [
    session({ sessionId: 1, ntrpMin: 3, ntrpMax: 3.5, playType: "單打" }),
    session({
      sessionId: 2,
      startAt: "2026-07-18T04:00:00.000Z",
      ntrpMin: 3.8,
      ntrpMax: 4.2,
      playType: "對拉",
    }),
    session({
      sessionId: 3,
      courtId: 4,
      courtDistrict: "松山區",
      startAt: "2026-07-18T01:30:00.000Z",
      ntrpMin: null,
      ntrpMax: null,
      playType: "雙打",
      status: "full",
    }),
    session({ sessionId: 4, status: "cancelled" }),
    session({ sessionId: 5, startAt: "2026-07-16T01:30:00.000Z" }),
    session({ sessionId: 6, startAt: "2026-07-17T14:30:00.000Z" }),
  ];

  const narrowlyFiltered = filterSessions(
    sessions,
    {
      district: "大安區",
      courtId: 3,
      date: "2026-07-18",
      band: "mid",
      types: new Set(["單打"]),
    },
    now
  );
  assert.deepEqual(narrowlyFiltered.map((item) => item.sessionId), [1]);

  const overlapAndUnspecified = filterSessions(
    sessions,
    { district: "all", courtId: null, date: "2026-07-18", band: "hi", types: new Set() },
    now
  );
  assert.deepEqual(overlapAndUnspecified.map((item) => item.sessionId), [2, 3]);

  const allUpcoming = filterSessions(
    sessions,
    { district: "", courtId: "", date: null, band: "all", types: new Set() },
    now
  );
  assert.deepEqual(allUpcoming.map((item) => item.sessionId), [1, 2, 3, 6]);
});

test("drawer sorting places ongoing sessions with vacancies ahead of distance and start time", () => {
  const now = new Date("2026-07-17T00:00:00.000Z");
  const sessions = [
    session({ sessionId: 1, courtLat: 25.08, courtLng: 121.58, startAt: "2026-07-19T03:00:00.000Z" }),
    session({ sessionId: 2, courtLat: 25.031, courtLng: 121.541, startAt: "2026-07-19T05:00:00.000Z" }),
    session({ sessionId: 3, courtLat: 25.031, courtLng: 121.541, startAt: "2026-07-19T01:00:00.000Z" }),
    session({ sessionId: 4, courtLat: 25.09, courtLng: 121.59, startAt: "2026-07-16T23:30:00.000Z", slotsRemaining: 1 }),
    session({ sessionId: 5, courtLat: 25.0301, courtLng: 121.5401, startAt: "2026-07-16T23:40:00.000Z", slotsRemaining: 0 }),
  ];
  const original = structuredClone(sessions);

  assert.deepEqual(sortSessionsForDrawer(sessions, null, now).map((item) => item.sessionId), [4, 5, 3, 1, 2]);
  assert.deepEqual(
    sortSessionsForDrawer(sessions, { lat: 25.03, lng: 121.54 }, now).map((item) => item.sessionId),
    [4, 5, 3, 2, 1]
  );
  assert.deepEqual(sessions, original);
  assert.equal("distance" in sessions[0], false);
});

class MemorySessionStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

test("pending intents persist only the approved session-action shapes", () => {
  const storage = new MemorySessionStorage();

  assert.deepEqual(savePendingIntent({ action: "join", sessionId: 123 }, storage), { action: "join", sessionId: 123 });
  assert.deepEqual(JSON.parse(storage.getItem(PENDING_SESSION_INTENT_KEY)), { action: "join", sessionId: 123 });
  assert.deepEqual(readPendingIntent(storage), { action: "join", sessionId: 123 });

  assert.throws(
    () => savePendingIntent({ action: "join", sessionId: 123, lineId: "nope" }, storage),
    /Unsupported pending session intent/
  );
  assert.throws(
    () => savePendingIntent({ action: "create", note: "do not persist drafts" }, storage),
    /Unsupported pending session intent/
  );

  assert.deepEqual(savePendingIntent({ action: "create" }, storage), { action: "create" });
  assert.deepEqual(savePendingIntent({ action: "players" }, storage), { action: "players" });
  assert.deepEqual(readPendingIntent(storage), { action: "players" });
  storage.setItem(PENDING_SESSION_INTENT_KEY, JSON.stringify({ action: "join", sessionId: 4, location: { lat: 1, lng: 2 } }));
  assert.equal(readPendingIntent(storage), null);
  assert.equal(storage.getItem(PENDING_SESSION_INTENT_KEY), null);
  clearPendingIntent(storage);
});

function configuredDiscoveryClient(result) {
  const calls = [];
  const query = {
    select(value) {
      calls.push(["select", value]);
      return this;
    },
    gte(column, value) {
      calls.push(["gte", column, value]);
      return this;
    },
    lte(column, value) {
      calls.push(["lte", column, value]);
      return this;
    },
    gt(column, value) {
      calls.push(["gt", column, value]);
      return this;
    },
    lt(column, value) {
      calls.push(["lt", column, value]);
      return this;
    },
    order(column, options) {
      calls.push(["order", column, options]);
      return Promise.resolve(result);
    },
  };

  return {
    calls,
    from(table) {
      calls.push(["from", table]);
      return query;
    },
  };
}

test("configured discovery stays empty and uses explicit bounds/time selects", async () => {
  const client = configuredDiscoveryClient({ data: [], error: null });
  const api = createDataApi({ configured: true, client, mockSessions: MOCK_SESSIONS });

  const discovered = await api.loadSessionDiscovery({
    bounds: { south: 25.0, west: 121.4, north: 25.2, east: 121.7 },
    startAfter: "2026-07-17T00:00:00.000Z",
    startBefore: "2026-07-31T00:00:00.000Z",
  });

  assert.deepEqual(discovered, []);
  assert.deepEqual(client.calls[0], ["from", "session_discovery"]);
  assert.ok(SESSION_DISCOVERY_SELECT.includes("host_nickname"));
  assert.equal(SESSION_DISCOVERY_SELECT.includes("*"), false);
  assert.equal(MY_SESSIONS_SELECT.includes("*"), false);
  assert.equal(SESSION_ROSTER_SELECT.includes("*"), false);
  assert.equal(SESSION_CONTACTS_SELECT.includes("*"), false);
  assert.equal(MY_PROFILE_SELECT.includes("*"), false);
  assert.ok(client.calls.some((call) => call[0] === "gte" && call[1] === "court_lat" && call[2] === 25));
  assert.ok(client.calls.some((call) => call[0] === "lte" && call[1] === "court_lng" && call[2] === 121.7));
  assert.ok(client.calls.some((call) => call[0] === "gt" && call[1] === "start_at"));
  assert.ok(client.calls.some((call) => call[0] === "lt" && call[1] === "start_at"));
});

test("configured player directory uses only its allowlist and four bounds predicates", async () => {
  const calls = [];
  const query = {
    select(value) {
      calls.push(["select", value]);
      return this;
    },
    gte(column, value) {
      calls.push(["gte", column, value]);
      return this;
    },
    lte(column, value) {
      calls.push(["lte", column, value]);
      return this;
    },
    then(resolve) {
      return Promise.resolve({
        data: [
          {
            profile_id: 8001,
            nickname: "示範山嵐",
            ntrp: 3.5,
            play_types: ["單打"],
            slot_codes: ["we-m"],
            court_id: 101,
            court_name: "台北網球中心",
            court_district: "內湖區",
            court_lat: 25.067446,
            court_lng: 121.596648,
            is_self: false,
          },
        ],
        error: null,
      }).then(resolve);
    },
  };
  const api = createDataApi({
    configured: true,
    client: {
      from(table) {
        calls.push(["from", table]);
        return query;
      },
    },
  });

  const entries = await api.loadPlayerDirectory({
    bounds: { south: 25, west: 121.5, north: 25.1, east: 121.7 },
  });

  assert.deepEqual(entries.map((entry) => entry.profileId), [8001]);
  assert.deepEqual(calls, [
    ["from", "player_directory"],
    ["select", PLAYER_DIRECTORY_SELECT],
    ["gte", "court_lat", 25],
    ["lte", "court_lat", 25.1],
    ["gte", "court_lng", 121.5],
    ["lte", "court_lng", 121.7],
  ]);
});

test("lifecycle RPC wrappers preserve SESSION_EXPIRED as a reload-required outcome", async () => {
  const calls = [];
  const api = createDataApi({
    configured: true,
    client: {
      async rpc(name, params) {
        calls.push([name, params]);
        return { data: name === "request_to_join_session" ? "SESSION_EXPIRED" : "OK", error: null };
      },
    },
  });

  assert.deepEqual(await api.requestToJoinSession(44), {
    outcome: "SESSION_EXPIRED",
    accepted: false,
    reloadRequired: true,
  });
  assert.deepEqual(await api.acceptSessionParticipant(44, 91), { outcome: "OK", reloadRequired: false });
  assert.deepEqual(await api.declineSessionParticipant(44, 92), { outcome: "OK", reloadRequired: false });
  assert.deepEqual(await api.withdrawFromSession(44), { outcome: "OK", reloadRequired: false });
  assert.deepEqual(await api.cancelSession(44), { outcome: "OK", reloadRequired: false });
  assert.deepEqual(await api.markSessionPlayed(44), { outcome: "OK", reloadRequired: false });
  assert.deepEqual(await api.confirmSessionAttendance(44), { outcome: "OK", reloadRequired: false });
  assert.deepEqual(await api.inviteToSession(44, "91"), { outcome: "OK", reloadRequired: false });
  assert.deepEqual(await api.respondToSessionInvite(44, "accepted"), { outcome: "OK", reloadRequired: false });
  assert.deepEqual(await api.setPlayerVisibility(true), { outcome: "OK", reloadRequired: false });
  assert.deepEqual(calls.map(([name]) => name), [
    "request_to_join_session",
    "review_join_request",
    "review_join_request",
    "withdraw_from_session",
    "cancel_session",
    "mark_session_played",
    "confirm_session_attendance",
    "invite_to_session",
    "respond_to_session_invite",
    "set_player_visibility",
  ]);
  assert.deepEqual(calls[1][1], { p_session_id: 44, p_participant_id: 91, p_decision: "accepted" });
  assert.deepEqual(calls[7][1], { p_session_id: 44, p_profile_id: 91 });
  assert.deepEqual(calls[8][1], { p_session_id: 44, p_decision: "accepted" });
  assert.deepEqual(calls[9][1], { p_visible: true });
});

test("requestToJoinSession maps ACCEPTED outcome", async () => {
  const api = createDataApi({
    configured: true,
    client: { rpc: async () => ({ data: "ACCEPTED", error: null }) },
  });

  assert.deepEqual(await api.requestToJoinSession(9001), {
    outcome: "ACCEPTED",
    accepted: true,
    reloadRequired: false,
  });
});

test("createSession defaults joinMode to approval", async () => {
  const calls = [];
  const api = createDataApi({
    configured: true,
    client: {
      async rpc(name, params) {
        calls.push([name, params]);
        return { data: 81, error: null };
      },
    },
  });

  await api.createSession({
    courtId: 101,
    playType: "單打",
    startAt: "2026-07-19T01:00:00.000Z",
    slotsTotal: 1,
  });

  assert.deepEqual(calls, [
    [
      "create_session",
      {
        p_court_id: 101,
        p_play_type: "單打",
        p_start_at: "2026-07-19T01:00:00.000Z",
        p_ntrp_min: null,
        p_ntrp_max: null,
        p_slots_total: 1,
        p_notes: null,
        p_join_mode: "approval",
      },
    ],
  ]);
});

test("RPC failures are exposed as documented action codes", async () => {
  const api = createDataApi({
    configured: true,
    client: {
      async rpc() {
        return { data: null, error: { message: "SESSION_FULL" } };
      },
    },
  });

  await assert.rejects(
    () => api.requestToJoinSession(7),
    (error) => error instanceof SessionActionError && error.code === "SESSION_FULL"
  );

  const limitApi = createDataApi({
    configured: true,
    client: {
      async rpc() {
        return { data: null, error: { message: "SESSION_LIMIT" } };
      },
    },
  });

  await assert.rejects(
    () =>
      limitApi.createSession({
        courtId: 101,
        playType: "單打",
        startAt: "2099-07-19T01:00:00.000Z",
        slotsTotal: 1,
      }),
    (error) => {
      assert.ok(error instanceof SessionActionError);
      assert.equal(error.code, "SESSION_LIMIT");
      assert.equal(error.message, "你同時開放中的球局已達上限，請先處理現有球局。");
      return true;
    }
  );
});

test("player invitation RPC failures retain their documented error codes and messages", async () => {
  const cases = [
    ["INVITEE_NOT_AVAILABLE", "這位球友目前未開放邀請。"],
    ["ALREADY_INVITED", "你已邀請過這位球友。"],
    ["NOT_INVITED", "找不到你的邀請，球局狀態可能已更新。"],
    ["INVITE_LIMIT", "24 小時內邀請次數已達上限。"],
  ];

  for (const [code, message] of cases) {
    const api = createDataApi({
      configured: true,
      client: { rpc: async () => ({ data: null, error: { message: code } }) },
    });
    await assert.rejects(
      () => api.inviteToSession(44, 91),
      (error) => error instanceof SessionActionError && error.code === code && error.message === message
    );
  }
});

test("session creation, reporting, and profile save use only their RPC contracts", async () => {
  const rpcCalls = [];
  const ephemeralLocation = { lat: 25.031234, lng: 121.551234 };
  const profileRow = {
    nickname: "安全表單",
    ntrp: 3.5,
    line_id: "private-form-value",
    court_ids: [101],
    play_types: ["單打"],
    slot_codes: ["we-m"],
  };
  const courtRows = [
    { id: 101, name: "青年公園網球場", city: "台北市", district: "萬華區", lat: 25.02306, lng: 121.506928 },
  ];
  const client = {
    async rpc(name, params) {
      rpcCalls.push([name, params]);
      if (name === "create_session") return { data: 81, error: null };
      if (name === "create_report") return { data: 91, error: null };
      if (name === "save_my_profile") return { data: 101, error: null };
      return { data: null, error: { message: "INVALID_TRANSITION" } };
    },
    from(table) {
      if (table === "courts") {
        const query = {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return Promise.resolve({ data: courtRows, error: null });
          },
        };
        return query;
      }
      if (table === "my_profile") {
        return {
          select() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve({ data: profileRow, error: null });
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
  const api = createDataApi({ configured: true, client });

  assert.deepEqual(
    await api.createSession({
      courtId: 101,
      playType: "單打",
      startAt: "2026-07-19T01:00:00.000Z",
      ntrpMin: 3,
      ntrpMax: 4,
      slotsTotal: 1,
      notes: "safe note",
      joinMode: "instant",
      location: ephemeralLocation,
    }),
    { sessionId: 81 }
  );
  assert.deepEqual(
    await api.createReport({ sessionId: 81, reportedProfileId: null, reason: "reason", location: ephemeralLocation }),
    { reportId: 91 }
  );
  const saved = await api.saveCurrentProfile({
    nick: "安全表單",
    ntrp: 3.5,
    lineId: "private-form-value",
    courts: new Set(["青年公園網球場"]),
    types: new Set(["單打"]),
    slots: new Set(["we-m"]),
    share: true,
    location: ephemeralLocation,
  });

  assert.deepEqual(saved.courts, new Set(["青年公園網球場"]));
  assert.equal("share" in saved, false);
  assert.deepEqual(rpcCalls, [
    [
      "create_session",
      {
        p_court_id: 101,
        p_play_type: "單打",
        p_start_at: "2026-07-19T01:00:00.000Z",
        p_ntrp_min: 3,
        p_ntrp_max: 4,
        p_slots_total: 1,
        p_notes: "safe note",
        p_join_mode: "instant",
      },
    ],
    ["create_report", { p_session_id: 81, p_reported_profile_id: null, p_reason: "reason" }],
    [
      "save_my_profile",
      {
        p_nickname: "安全表單",
        p_ntrp: 3.5,
        p_line_id: "private-form-value",
        p_court_ids: [101],
        p_play_types: ["單打"],
        p_slot_codes: ["we-m"],
      },
    ],
  ]);
  const capturedMutationJson = JSON.stringify(rpcCalls);
  assert.doesNotMatch(capturedMutationJson, /25\.031234|121\.551234/);
});

test("data API contains no direct browser lifecycle or profile-join writes", async () => {
  const source = await readFile(new URL("../src/dataApi.js", import.meta.url), "utf8");
  assert.doesNotMatch(
    source,
    /\.from\(\s*["'](?:sessions|session_participants|reports|profiles|profile_courts|profile_play_types|profile_slots)["']\s*\)\s*\.(?:insert|update|delete)\b/
  );
});
