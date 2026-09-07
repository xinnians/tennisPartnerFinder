import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { SURFACE_MANIFEST } from "./fixtures/surfaceManifest.js";

const SRC_DIR = fileURLToPath(new URL("../src", import.meta.url));
const EXPLICIT_ANY = /:\s*any\b|\bas\s+any\b|\bany\s*\[\s*\]|<\s*any\s*>/;

function readCodeTree(directory = SRC_DIR, prefix = "src") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, pathToFileURL(`${directory}/`));
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return readCodeTree(fileURLToPath(entryUrl), path);
    return /\.(?:js|ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const ALL_SOURCE = readCodeTree().sort();
const ALL_TSX = ALL_SOURCE.filter((path) => path.endsWith(".tsx"));
const TEST_DIR = fileURLToPath(new URL("../tests", import.meta.url));
const ALL_TEST_CODE = readCodeTree(TEST_DIR, "tests").filter(
  (path) => path !== "tests/session-presentation-boundary.test.js"
);

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function assertExactNamedScan(actual, expected, label) {
  assert.ok(actual.length > 0, `${label} scan unexpectedly found no matches`);
  assert.equal(new Set(actual).size, actual.length, `${label} scan contains duplicate names`);
  assert.deepEqual([...actual].sort(), [...expected].sort(), `${label} differs from the surface manifest`);
}

test("session action messages stay complete and exact in the UI layer", async () => {
  const { SESSION_ACTION_CODES, SessionActionError } = await import("../src/dataApi.ts");
  const { SESSION_ACTION_MESSAGES, sessionActionMessage } = await import("../src/sessionActionMessages.ts");
  const expected = {
    PROFILE_INCOMPLETE: "請先完成個人檔案。",
    SESSION_NOT_FOUND: "找不到這個球局。",
    SESSION_NOT_OPEN: "這個球局目前無法操作。",
    SESSION_FULL: "這個球局已額滿。",
    SESSION_CANCELLED: "這個球局已取消。",
    SESSION_EXPIRED: "球局狀態已更新，請重新載入。",
    SESSION_ARCHIVED: "這個球局已封存，無法再傳送訊息。",
    SESSION_STARTED: "球局已超過可加入時間。",
    SESSION_LIMIT: "你同時開放中的球局已達上限，請先處理現有球局。",
    ALREADY_REQUESTED: "你已申請加入這個球局。",
    ALREADY_DECIDED: "你先前已退出或未通過這一局，無法再次申請。",
    NOT_SESSION_HOST: "只有主揪可以執行這個操作。",
    NOT_ACCEPTED_PARTICIPANT: "只有已接受的參與者可以執行這個操作。",
    NOT_SESSION_MEMBER: "只有這個球局的成員可以傳送訊息。",
    INVALID_TRANSITION: "目前的球局狀態不允許這個操作。",
    INVALID_VENUE_INPUT: "場地或候選球場資料不符合規則。",
    INVALID_DECISION: "候選球場或定案時間不符合規則。",
    INVITEE_NOT_AVAILABLE: "這位球友目前未開放邀請。",
    ALREADY_INVITED: "你已邀請過這位球友。",
    NOT_INVITED: "找不到你的邀請，球局狀態可能已更新。",
    INVITE_LIMIT: "24 小時內邀請次數已達上限。",
    BLOCKED: "此操作因封鎖關係無法完成。",
    SESSION_UNAVAILABLE: "這個球局目前無法加入。",
    GUEST_UNAVAILABLE: "這位球友目前無法加入這個球局。",
    MESSAGE_NOT_VISIBLE: "這則訊息目前無法檢舉。",
    INVALID_MESSAGE: "訊息不可為空白或超過 1000 字。",
    UNKNOWN_ACTION_ERROR: "球局操作失敗，請重新載入後再試。",
  };

  assert.deepEqual(SESSION_ACTION_MESSAGES, expected);
  assert.deepEqual(
    Object.keys(SESSION_ACTION_MESSAGES).sort(),
    [...SESSION_ACTION_CODES, "UNKNOWN_ACTION_ERROR"].sort()
  );
  for (const code of Object.keys(expected)) {
    assert.equal(sessionActionMessage(new SessionActionError(code), "fallback"), expected[code]);
  }
  assert.equal(
    sessionActionMessage(new SessionActionError("NOT_A_REAL_CODE"), "fallback"),
    expected.UNKNOWN_ACTION_ERROR
  );
  assert.equal(sessionActionMessage(new Error("原始錯誤"), "fallback"), "原始錯誤");
  assert.equal(sessionActionMessage(null, "fallback"), "fallback");
});

test("every TSX module stays outside the retired session view facade dependency edge", () => {
  assert.ok(ALL_TSX.length >= 21, `TSX scan unexpectedly small: ${ALL_TSX.length}`);
  for (const path of ALL_TSX) {
    assert.doesNotMatch(source(path), /from ["'][^"']*sessionViews\.js["']/, `${path} recreates the reverse edge`);
  }
});

test("all presentation consumers depend on the TypeScript boundary", () => {
  const reactConsumers = ALL_TSX.filter((path) => /from ["'][^"']*sessionPresentation\.ts["'];/.test(source(path)));
  assertExactNamedScan(reactConsumers, SURFACE_MANIFEST.presentationConsumers, "sessionPresentation consumer");
  for (const path of reactConsumers) {
    const content = source(path);
    assert.match(content, /from "\.\.\/sessionPresentation\.ts";/, `${path} misses the presentation boundary`);
  }
});

test("the presentation boundary cannot reach back into the retired view adapter", () => {
  const presentation = source("src/sessionPresentation.ts");
  assert.doesNotMatch(presentation, /sessionViews\.js|import\.meta\.glob|@ts-nocheck/);
  assert.doesNotMatch(presentation, EXPLICIT_ANY);
});

test("session schedule and host-initial presentation preserve chat labels", async () => {
  const presentation = await import("../src/sessionPresentation.ts");
  const candidateSession = {
    hostNickname: "阿玲",
    rangeEnd: "2024-01-01T03:00:00.000Z",
    startAt: "2024-01-01T01:30:00.000Z",
    venueType: "candidates",
  };

  assert.equal(presentation.sessionScheduleLabel(candidateSession), "週一 09:30–11:00 · 主揪 阿玲");
  assert.equal(presentation.sessionHostInitial({ viewerRole: "host" }), "我");
  assert.equal(presentation.sessionHostInitial({ hostNickname: " 阿玲 " }), "阿");
  assert.equal(presentation.sessionHostInitial({}), "主");
});

test("batch 27 guard rationale stays explicit", () => {
  const presentation = source("src/sessionPresentation.ts");
  assert.match(presentation, /Number\(null\).*0\.0/s);
  assert.match(presentation, /player-directory hosted assertions.*不可.*移除/s);
  assert.match(presentation, /player drawer and card escape every public value.*不可改計算方式/s);
});

test("the legacy session view facade stays deleted from source and test imports", () => {
  const legacyModuleName = ["session", "Views"].join("");
  assert.equal(existsSync(new URL(`../src/${legacyModuleName}.js`, import.meta.url)), false);
  const sourceImportPattern = new RegExp(`(?:from\\s*["'][^"']*|import\\(["'][^"']*)${legacyModuleName}\\.js`);
  const harnessImportPattern = new RegExp(`__importAppModule\\(["']${legacyModuleName}["']\\)`);
  for (const path of ALL_SOURCE) {
    assert.doesNotMatch(source(path), sourceImportPattern, `${path} restores the deleted facade import`);
  }
  for (const path of ALL_TEST_CODE) {
    assert.doesNotMatch(source(path), sourceImportPattern, `${path} imports the deleted facade`);
    assert.doesNotMatch(source(path), harnessImportPattern, `${path} restores the deleted facade harness name`);
  }
});
