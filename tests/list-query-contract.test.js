import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const REPOSITORY_SOURCES = new Map(
  ["dataRepository.ts", "privateDataRepository.ts"].map((filename) => [
    filename,
    readFileSync(new URL(`../src/data/repositories/${filename}`, import.meta.url), "utf8"),
  ])
);
const LIMITS_SOURCE = readFileSync(new URL("../src/data/repositories/listQueryLimits.ts", import.meta.url), "utf8");

const QUERY_SITES = [
  ["dataRepository.ts", "loadCourts", "courts"],
  ["dataRepository.ts", "loadSessionDiscovery", "session_discovery"],
  ["dataRepository.ts", "loadSessionSummary", "session_discovery"],
  ["privateDataRepository.ts", "loadPlayerDirectory", "player_directory"],
  ["privateDataRepository.ts", "loadPlayerPresenceDirectory", "player_presence_directory"],
  ["privateDataRepository.ts", "loadMySessions", "my_session_participations"],
  ["privateDataRepository.ts", "loadSessionRoster", "session_participant_roster"],
  ["privateDataRepository.ts", "loadSessionJoinPreview", "session_join_preview"],
  ["privateDataRepository.ts", "loadSessionMessages", "session_message_feed"],
  ["privateDataRepository.ts", "loadMyPlayerBlocks", "my_player_blocks"],
  ["privateDataRepository.ts", "loadCurrentProfileWithCourts", "my_profile"],
  ["privateDataRepository.ts", "loadNotificationPreferences", "notification_prefs"],
  ["privateDataRepository.ts", "loadCourtSubscriptions", "court_subscriptions"],
];

const CAPPED_LIST_CONTRACTS = [
  {
    file: "dataRepository.ts",
    functionName: "loadSessionDiscovery",
    limit: "SESSION_DISCOVERY_LIMIT",
    orders: ['.order("start_at", { ascending: true })', '.order("session_id", { ascending: true })'],
    table: "session_discovery",
  },
  {
    file: "privateDataRepository.ts",
    functionName: "loadPlayerDirectory",
    limit: "PLAYER_DIRECTORY_LIMIT",
    orders: [
      '.order("nickname", { ascending: true })',
      '.order("profile_id", { ascending: true })',
      '.order("court_id", { ascending: true })',
    ],
    table: "player_directory",
  },
  {
    file: "privateDataRepository.ts",
    functionName: "loadMySessions",
    limit: "MY_SESSIONS_LIMIT",
    orders: ['.order("updated_at", { ascending: false })', '.order("session_id", { ascending: false })'],
    table: "my_session_participations",
  },
  {
    file: "privateDataRepository.ts",
    functionName: "loadSessionMessages",
    limit: "SESSION_MESSAGES_LIMIT",
    orders: ['.order("created_at", { ascending: false })', '.order("message_id", { ascending: false })'],
    table: "session_message_feed",
  },
];

function functionBodies(source) {
  const bodies = new Map();
  for (const match of source.matchAll(/async function\s+(\w+)\s*\([^)]*\)\s*{/g)) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    for (let cursor = start; cursor < source.length; cursor += 1) {
      if (source[cursor] === "{") depth += 1;
      if (source[cursor] === "}") depth -= 1;
      if (depth === 0) {
        bodies.set(match[1], source.slice(start + 1, cursor));
        break;
      }
    }
  }
  return bodies;
}

function validateListQueryContracts(sources) {
  const bodiesByFile = new Map([...sources].map(([file, source]) => [file, functionBodies(source)]));
  const scannedSites = [...sources].flatMap(([file, source]) =>
    [...functionBodies(source)].flatMap(([functionName, body]) =>
      [...body.matchAll(/\.from\("([^"]+)"\)/g)].map((match) => [file, functionName, match[1]])
    )
  );

  assert.ok(scannedSites.length > 0, "repository query scan must be nonempty");
  assert.deepEqual(
    scannedSites.map((site) => site.join(":")).sort(),
    QUERY_SITES.map((site) => site.join(":")).sort(),
    "repository query-site set drifted; classify every new query so uncapped list reads cannot arrive silently"
  );
  assert.deepEqual(
    CAPPED_LIST_CONTRACTS.map(({ table }) => table).sort(),
    ["my_session_participations", "player_directory", "session_discovery", "session_message_feed"],
    "the capped-list contract must remain the exact approved four-view set"
  );

  for (const contract of CAPPED_LIST_CONTRACTS) {
    const body = bodiesByFile.get(contract.file)?.get(contract.functionName);
    assert.ok(body, `${contract.functionName} source body is missing`);
    assert.ok(body.includes(`.from("${contract.table}")`), `${contract.functionName} changed its view`);
    for (const order of contract.orders) {
      assert.ok(body.includes(order), `${contract.functionName} is missing order contract ${order}`);
    }
    assert.ok(body.includes(`.limit(${contract.limit})`), `${contract.functionName} is missing its safety limit`);
  }
}

test("four approved list queries have deterministic order and safety limits", () => {
  assert.match(LIMITS_SOURCE, /SESSION_DISCOVERY_LIMIT\s*=\s*200;/);
  assert.match(LIMITS_SOURCE, /PLAYER_DIRECTORY_LIMIT\s*=\s*200;/);
  assert.match(LIMITS_SOURCE, /MY_SESSIONS_LIMIT\s*=\s*100;/);
  assert.match(LIMITS_SOURCE, /SESSION_MESSAGES_LIMIT\s*=\s*200;/);
  validateListQueryContracts(REPOSITORY_SOURCES);
});

test("list-query scanner fails closed when a limit is removed or an unknown query appears", () => {
  const missingLimit = new Map(REPOSITORY_SOURCES);
  missingLimit.set(
    "dataRepository.ts",
    missingLimit.get("dataRepository.ts").replace(".limit(SESSION_DISCOVERY_LIMIT)", "")
  );
  assert.throws(() => validateListQueryContracts(missingLimit), /loadSessionDiscovery is missing its safety limit/);

  const unknownListQuery = new Map(REPOSITORY_SOURCES);
  unknownListQuery.set(
    "dataRepository.ts",
    `${unknownListQuery.get("dataRepository.ts")}\nasync function canaryUncappedList() { return client.from("new_uncapped_list").select("id"); }\n`
  );
  assert.throws(() => validateListQueryContracts(unknownListQuery), /query-site set drifted/);
});
