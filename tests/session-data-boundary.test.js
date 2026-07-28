import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  MY_PROFILE_SELECT,
  MY_SESSIONS_SELECT,
  PLAYER_DIRECTORY_SELECT,
  PLAYER_PRESENCE_DIRECTORY_SELECT,
  SESSION_CONTACTS_SELECT,
  SESSION_DISCOVERY_SELECT,
  SESSION_ROSTER_SELECT,
  DataApiUnavailableError,
  SessionActionError,
  createDataApi,
  loadMyPlayerBlocks,
  loadSessionMessages,
  mapCurrentProfile,
  mapMySession,
  mapPlayerDirectoryRow,
  mapPlayerPresenceDirectoryRow,
  mapSessionContactRow,
  mapSessionRosterRow,
  mapSessionSummary,
  postSessionMessage,
  resolveInitialSession,
  setPlayerBlock,
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
  "venueType",
  "rangeEnd",
  "candidateCourtIds",
  "feeNote",
  "decidedAt",
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

async function readJavaScriptSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources = await Promise.all(
    entries.map((entry) => {
      const entryUrl = new URL(entry.name, directory);
      if (entry.isDirectory()) return readJavaScriptSources(new URL(`${entry.name}/`, directory));
      return entry.name.endsWith(".js") ? readFile(entryUrl, "utf8") : [];
    })
  );
  return sources.flat();
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
    venue_type: "booked",
    range_end: null,
    decided_at: null,
    fee_note: "每人 120 元",
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
    ...SESSION_SUMMARY_KEYS.filter((key) => key !== "candidateCourtIds" && key !== "decidedAt"),
    "viewerRole",
    "viewerParticipantStatus",
    "viewerPlayedConfirmed",
    "updatedAt",
    "canCancel",
    "canWithdraw",
    "canConfirmPlayed",
    "canConfirmAttendance",
    "canRespondInvite",
    "decidedAt",
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
  assert.ok(SESSION_DISCOVERY_SELECT.includes("venue_type,range_end,candidate_court_ids"));
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

test("discovery mapper exposes the Stage 4A venue decision contract without extra fields", () => {
  const mapped = mapSessionSummary({
    session_id: 8,
    venue_type: "candidates",
    range_end: "2026-07-19T03:00:00.000Z",
    candidate_court_ids: [12, "14"],
    decided_at: "2026-07-19T01:30:00.000Z",
  });
  assert.deepEqual(sortedKeys(mapped), [...SESSION_SUMMARY_KEYS].sort());
  assert.equal(mapped.venueType, "candidates");
  assert.equal(mapped.rangeEnd, "2026-07-19T03:00:00.000Z");
  assert.deepEqual(mapped.candidateCourtIds, [12, 14]);
  assert.equal(mapped.decidedAt, "2026-07-19T01:30:00.000Z");
});

test("mock discovery keeps both undecided and decided candidate timestamps", async () => {
  const api = createDataApi({ configured: false, mockSessions: MOCK_SESSIONS });
  const discovery = await api.loadSessionDiscovery();
  const candidates = discovery.filter((summary) => summary.venueType === "candidates");

  assert.ok(candidates.some((summary) => summary.decidedAt === ""));
  assert.ok(candidates.some((summary) => !Number.isNaN(Date.parse(summary.decidedAt))));
});

test("nickname-only profile save normalizes optional fields for the RPC", async () => {
  const calls = [];
  const api = createDataApi({
    configured: true,
    client: {
      async rpc(name, params) {
        calls.push([name, params]);
        return { data: 7, error: null };
      },
      from(table) {
        if (table === "courts") {
          return { select() { return this; }, eq() { return this; }, order: async () => ({ data: [], error: null }) };
        }
        if (table === "my_profile") {
          return { select() { return this; }, maybeSingle: async () => ({ data: null, error: null }) };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    },
  });

  await api.saveCurrentProfile({ nick: "暱稱即可" });
  assert.deepEqual(calls, [["save_my_profile", {
    p_nickname: "暱稱即可",
    p_ntrp: null,
    p_line_id: null,
    p_court_ids: [],
    p_play_types: [],
    p_slot_codes: [],
  }]]);
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

test("session messages load only from the ordered safe feed and map its allowlist", async () => {
  const calls = [];
  const query = {
    select(value) {
      calls.push(["select", value]);
      return this;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    order(column, options) {
      calls.push(["order", column, options]);
      return this;
    },
    then(resolve) {
      return Promise.resolve({
        data: [
          {
            message_id: "901",
            session_id: "81",
            sender_profile_id: "92",
            sender_nickname: "示範山嵐",
            kind: "message",
            body: "一起打球嗎？",
            created_at: "2026-07-27T01:30:00.000Z",
            is_self: false,
            line_id: "must-not-leak",
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

  assert.deepEqual(await api.loadSessionMessages("81"), [
    {
      messageId: 901,
      sessionId: 81,
      senderProfileId: 92,
      senderNickname: "示範山嵐",
      kind: "message",
      body: "一起打球嗎？",
      createdAt: "2026-07-27T01:30:00.000Z",
      isSelf: false,
    },
  ]);
  assert.deepEqual(calls, [
    ["from", "session_message_feed"],
    ["select", "message_id,session_id,sender_profile_id,sender_nickname,kind,body,created_at,is_self"],
    ["eq", "session_id", 81],
    ["order", "created_at", { ascending: true }],
    ["order", "message_id", { ascending: true }],
  ]);
  assert.deepEqual(await createDataApi({ configured: false }).loadSessionMessages(81), []);
});

test("my player blocks load only from the ordered safe view and map its allowlist", async () => {
  const calls = [];
  const query = {
    select(value) {
      calls.push(["select", value]);
      return this;
    },
    order(column, options) {
      calls.push(["order", column, options]);
      return this;
    },
    then(resolve) {
      return Promise.resolve({
        data: [
          {
            blocked_profile_id: "92",
            blocked_nickname: "示範山嵐",
            created_at: "2026-07-28T01:30:00.000Z",
            line_id: "must-not-leak",
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

  assert.deepEqual(await api.loadMyPlayerBlocks(), [
    {
      blockedProfileId: 92,
      blockedNickname: "示範山嵐",
      createdAt: "2026-07-28T01:30:00.000Z",
    },
  ]);
  assert.deepEqual(calls, [
    ["from", "my_player_blocks"],
    ["select", "blocked_profile_id,blocked_nickname,created_at"],
    ["order", "created_at", { ascending: false }],
  ]);
  assert.deepEqual(await createDataApi({ configured: false }).loadMyPlayerBlocks(), []);
});

test("postSessionMessage uses only its exact RPC contract and preserves Stage 3 action codes", async () => {
  const calls = [];
  const api = createDataApi({
    configured: true,
    client: {
      async rpc(name, params) {
        calls.push([name, params]);
        if (name === "post_session_message") return { data: "OK", error: null };
        throw new Error(`Unexpected RPC ${name}`);
      },
    },
  });

  assert.deepEqual(await api.postSessionMessage("81", " 一起打球嗎？ "), { outcome: "OK" });
  assert.deepEqual(calls, [["post_session_message", { p_session_id: 81, p_body: "一起打球嗎？" }]]);

  const archivedApi = createDataApi({
    configured: true,
    client: { rpc: async () => ({ data: "SESSION_ARCHIVED", error: null }) },
  });
  await assert.rejects(
    () => archivedApi.postSessionMessage(81, "封存局訊息"),
    (error) => error instanceof SessionActionError && error.code === "SESSION_ARCHIVED"
  );

  const nonMemberApi = createDataApi({
    configured: true,
    client: { rpc: async () => ({ data: null, error: { code: "P0001", message: "NOT_SESSION_MEMBER" } }) },
  });
  await assert.rejects(
    () => nonMemberApi.postSessionMessage(81, "非成員訊息"),
    (error) => error instanceof SessionActionError && error.code === "NOT_SESSION_MEMBER"
  );

  const invalidMessageApi = createDataApi({
    configured: true,
    client: { rpc: async () => ({ data: "INVALID_MESSAGE", error: null }) },
  });
  await assert.rejects(
    () => invalidMessageApi.postSessionMessage(81, "   "),
    (error) => error instanceof SessionActionError && error.code === "INVALID_MESSAGE"
  );

  const poisonedDetailsApi = createDataApi({
    configured: true,
    client: {
      rpc: async () => ({
        data: null,
        error: { code: "P0001", message: "database validation failed", details: "user text says BLOCKED and SESSION_EXPIRED" },
      }),
    },
  });
  await assert.rejects(
    () => poisonedDetailsApi.postSessionMessage(81, "正常訊息"),
    (error) => error instanceof SessionActionError && error.code === "UNKNOWN_ACTION_ERROR"
  );
});

test("setPlayerBlock uses only its exact RPC contract and accepts only OK", async () => {
  const calls = [];
  const api = createDataApi({
    configured: true,
    client: {
      async rpc(name, params) {
        calls.push([name, params]);
        return { data: "OK", error: null };
      },
    },
  });

  assert.deepEqual(await api.setPlayerBlock("92", true), { outcome: "OK" });
  assert.deepEqual(calls, [["set_player_block", { p_profile_id: 92, p_blocked: true }]]);

  const failedBlockApi = createDataApi({
    configured: true,
    client: { rpc: async () => ({ data: "ALREADY_BLOCKED", error: null }) },
  });
  await assert.rejects(
    () => failedBlockApi.setPlayerBlock(92, false),
    (error) => error instanceof SessionActionError && error.code === "UNKNOWN_ACTION_ERROR"
  );
});

test("message reports use their exact RPC contract and preserve MESSAGE_NOT_VISIBLE", async () => {
  const calls = [];
  const api = createDataApi({
    configured: true,
    client: {
      async rpc(name, params) {
        calls.push([name, params]);
        return { data: 902, error: null };
      },
    },
  });

  assert.deepEqual(
    await api.createReport({ sessionId: 81, reportedProfileId: 92, reason: " 不當訊息 ", messageId: "901" }),
    { reportId: 902 }
  );
  assert.deepEqual(calls, [
    ["create_report", { p_session_id: null, p_reported_profile_id: 92, p_reason: "不當訊息", p_message_id: 901 }],
  ]);

  const hiddenMessageApi = createDataApi({
    configured: true,
    client: { rpc: async () => ({ data: null, error: { code: "P0001", message: "MESSAGE_NOT_VISIBLE" } }) },
  });
  await assert.rejects(
    () => hiddenMessageApi.createReport({ sessionId: 81, reportedProfileId: 92, reason: "不當訊息", messageId: 901 }),
    (error) => error instanceof SessionActionError && error.code === "MESSAGE_NOT_VISIBLE"
  );
});

test("lifecycle wrappers preserve BLOCKED instead of replacing it with UNKNOWN_ACTION_ERROR", async () => {
  const api = createDataApi({
    configured: true,
    client: { rpc: async () => ({ data: null, error: { code: "P0001", message: "BLOCKED" } }) },
  });

  await assert.rejects(
    () => api.requestToJoinSession(81),
    (error) => error instanceof SessionActionError && error.code === "BLOCKED"
  );
});

test("neutral block-unavailable action codes use their terminal non-disclosing messages", () => {
  assert.equal(new SessionActionError("SESSION_UNAVAILABLE").message, "這個球局目前無法加入。");
  assert.equal(new SessionActionError("GUEST_UNAVAILABLE").message, "這位球友目前無法加入這個球局。");
  assert.notEqual(new SessionActionError("SESSION_UNAVAILABLE").message, new SessionActionError("UNKNOWN_ACTION_ERROR").message);
  assert.notEqual(new SessionActionError("GUEST_UNAVAILABLE").message, new SessionActionError("UNKNOWN_ACTION_ERROR").message);
});

test("Supabase error decoding accepts only exact P0001 session action messages", async () => {
  const cases = [
    ["exact BLOCKED", { code: "P0001", message: "BLOCKED" }, "BLOCKED"],
    ["exact SESSION_UNAVAILABLE", { code: "P0001", message: "SESSION_UNAVAILABLE" }, "SESSION_UNAVAILABLE"],
    ["exact GUEST_UNAVAILABLE", { code: "P0001", message: "GUEST_UNAVAILABLE" }, "GUEST_UNAVAILABLE"],
    ["exact existing INVALID_MESSAGE", { code: "P0001", message: "INVALID_MESSAGE" }, "INVALID_MESSAGE"],
    ["missing SQLSTATE", { message: "BLOCKED" }, "UNKNOWN_ACTION_ERROR"],
    ["wrong SQLSTATE", { code: "23503", message: "BLOCKED" }, "UNKNOWN_ACTION_ERROR"],
    ["prefixed action", { code: "P0001", message: "failure: BLOCKED" }, "UNKNOWN_ACTION_ERROR"],
    ["suffixed action", { code: "P0001", message: "BLOCKED failure" }, "UNKNOWN_ACTION_ERROR"],
    ["lowercase action", { code: "P0001", message: "blocked" }, "UNKNOWN_ACTION_ERROR"],
    ["action only in hint", { code: "P0001", message: "database validation failed", hint: "BLOCKED" }, "UNKNOWN_ACTION_ERROR"],
    ["action only in details", { code: "P0001", message: "database validation failed", details: "BLOCKED" }, "UNKNOWN_ACTION_ERROR"],
    ["actions only in hint and details", { code: "P0001", message: "database validation failed", hint: "SESSION_EXPIRED", details: "BLOCKED" }, "UNKNOWN_ACTION_ERROR"],
    ["player block FK collision", { code: "23503", message: "player_blocks_blocked_profile_id_fkey" }, "UNKNOWN_ACTION_ERROR"],
  ];

  for (const [label, rpcError, expectedCode] of cases) {
    const api = createDataApi({
      configured: true,
      client: { rpc: async () => ({ data: null, error: rpcError }) },
    });
    await assert.rejects(
      () => api.requestToJoinSession(81),
      (error) => error instanceof SessionActionError && error.code === expectedCode,
      label
    );
  }
});

test("module-level chat exports forward to the project default data API", async () => {
  assert.deepEqual(await loadSessionMessages(81), []);
  assert.deepEqual(await loadMyPlayerBlocks(), []);
  await assert.rejects(() => postSessionMessage(81, "預設 API 訊息"), DataApiUnavailableError);
  await assert.rejects(() => setPlayerBlock(92, true), DataApiUnavailableError);
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
        p_venue_type: "booked",
        p_candidate_court_ids: null,
        p_range_end: null,
        p_fee_note: null,
      },
    ],
  ]);
});

test("createSession maps the candidates venue contract and both requested NTRP outcomes", async () => {
  const calls = [];
  const joinOutcomes = ["OK_NTRP_MISSING", "OK_NTRP_OUT_OF_RANGE"];
  const api = createDataApi({
    configured: true,
    client: {
      async rpc(name, params) {
        calls.push([name, params]);
        if (name === "create_session") return { data: 82, error: null };
        if (name === "request_to_join_session") return { data: joinOutcomes.shift(), error: null };
        throw new Error(`Unexpected RPC ${name}`);
      },
    },
  });

  assert.deepEqual(
    await api.createSession({
      courtId: null,
      playType: "雙打",
      startAt: "2026-09-01T01:00:00.000Z",
      slotsTotal: 2,
      venueType: "candidates",
      candidateCourtIds: [101, "102"],
      rangeEnd: "2026-09-01T03:00:00.000Z",
      feeNote: "每人 120 元",
    }),
    { sessionId: 82 }
  );
  assert.deepEqual(calls[0], [
    "create_session",
    {
      p_court_id: null,
      p_play_type: "雙打",
      p_start_at: "2026-09-01T01:00:00.000Z",
      p_ntrp_min: null,
      p_ntrp_max: null,
      p_slots_total: 2,
      p_notes: null,
      p_join_mode: "approval",
      p_venue_type: "candidates",
      p_candidate_court_ids: [101, 102],
      p_range_end: "2026-09-01T03:00:00.000Z",
      p_fee_note: "每人 120 元",
    },
  ]);
  assert.deepEqual(await api.requestToJoinSession(82), { outcome: "OK_NTRP_MISSING", accepted: false, reloadRequired: false });
  assert.deepEqual(await api.requestToJoinSession(83), { outcome: "OK_NTRP_OUT_OF_RANGE", accepted: false, reloadRequired: false });
});

test("updateSession and decideSessionCourt use only their Stage 2 RPC contracts", async () => {
  const calls = [];
  const api = createDataApi({
    configured: true,
    client: {
      async rpc(name, params) {
        calls.push([name, params]);
        return { data: "OK", error: null };
      },
    },
  });

  assert.deepEqual(
    await api.updateSession({
      sessionId: "91",
      startAt: "2026-09-01T02:00:00.000Z",
      courtId: "102",
      slotsMissing: "3",
      ntrpMin: "3",
      ntrpMax: "4.5",
      playType: "雙打",
      feeNote: "每人 120 元",
      notes: "請提早到",
    }),
    { outcome: "OK", reloadRequired: false }
  );
  assert.deepEqual(await api.decideSessionCourt("92", "103", "2026-09-01T02:30:00.000Z"), { outcome: "OK", reloadRequired: false });
  assert.deepEqual(calls, [
    [
      "update_session",
      {
        p_session_id: 91,
        p_start_at: "2026-09-01T02:00:00.000Z",
        p_court_id: 102,
        p_slots_missing: 3,
        p_ntrp_min: 3,
        p_ntrp_max: 4.5,
        p_play_type: "雙打",
        p_fee_note: "每人 120 元",
        p_note: "請提早到",
      },
    ],
    ["decide_session_court", { p_session_id: 92, p_court_id: 103, p_start_at: "2026-09-01T02:30:00.000Z" }],
  ]);
});

test("RPC failures are exposed as documented action codes", async () => {
  const api = createDataApi({
    configured: true,
    client: {
      async rpc() {
        return { data: null, error: { code: "P0001", message: "SESSION_FULL" } };
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
        return { data: null, error: { code: "P0001", message: "SESSION_LIMIT" } };
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
      client: { rpc: async () => ({ data: null, error: { code: "P0001", message: code } }) },
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
        p_venue_type: "booked",
        p_candidate_court_ids: null,
        p_range_end: null,
        p_fee_note: null,
      },
    ],
    ["create_report", { p_session_id: 81, p_reported_profile_id: null, p_reason: "reason", p_message_id: null }],
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

test("browser source keeps raw lifecycle, chat, block, and report tables outside all src access", async () => {
  const source = (await readJavaScriptSources(new URL("../src/", import.meta.url))).join("\n");
  assert.doesNotMatch(
    source,
    /\.from\(\s*["'](?:sessions|session_participants|reports|profiles|profile_courts|profile_play_types|profile_slots)["']\s*\)\s*\.(?:insert|update|delete)\b/
  );
  assert.doesNotMatch(source, /\.from\(\s*["'](?:session_messages|player_blocks|reports)["']\s*\)/);
});
