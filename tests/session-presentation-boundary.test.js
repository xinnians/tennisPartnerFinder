import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const SRC_DIR = fileURLToPath(new URL("../src", import.meta.url));
const EXPLICIT_ANY = /:\s*any\b|\bas\s+any\b|\bany\s*\[\s*\]|<\s*any\s*>/;

function readTsxTree(directory = SRC_DIR, prefix = "src") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, pathToFileURL(`${directory}/`));
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return readTsxTree(fileURLToPath(entryUrl), path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

const ALL_TSX = readTsxTree().sort();

const REACT_CONSUMERS = [
  "src/components/Avatar.tsx",
  "src/components/SessionCard.tsx",
  "src/pages/MePage.tsx",
  "src/pages/MessagesPage.tsx",
  "src/pages/MySessionsPage.tsx",
  "src/pages/NearbySessionsDrawer.tsx",
  "src/sheets/CourtPlayersSheet.tsx",
  "src/sheets/DecideSessionSheet.tsx",
  "src/sheets/PlayerCardSheet.tsx",
  "src/sheets/PlayerDirectorySheet.tsx",
  "src/sheets/ProfileCompletionSheet.tsx",
  "src/sheets/ReportDialog.tsx",
  "src/sheets/SessionChatSheet.tsx",
  "src/sheets/SessionDetailSheet.tsx",
];

const RUNTIME_EXPORTS = [
  "avatarRuntime",
  "courtPlayersSheetRuntime",
  "decideSessionSheetRuntime",
  "mePageRuntime",
  "mySessionsPageRuntime",
  "nearbySessionsDrawerRuntime",
  "playerCardSheetRuntime",
  "playerDirectorySheetRuntime",
  "profileCompletionSheetRuntime",
  "reportDialogRuntime",
  "sessionCardRuntime",
  "sessionChatSheetRuntime",
  "sessionDetailSheetRuntime",
];

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every TSX module stays outside the legacy sessionViews dependency edge", () => {
  assert.ok(ALL_TSX.length >= 21, `TSX scan unexpectedly small: ${ALL_TSX.length}`);
  for (const path of ALL_TSX) {
    assert.doesNotMatch(source(path), /from ["'][^"']*sessionViews\.js["']/, `${path} recreates the reverse edge`);
  }
});

test("all 14 presentation consumers depend on the TypeScript boundary", () => {
  assert.equal(REACT_CONSUMERS.length, 14);
  for (const path of REACT_CONSUMERS) {
    const content = source(path);
    assert.match(content, /from "\.\.\/sessionPresentation\.ts";/, `${path} misses the presentation boundary`);
  }
});

test("the presentation boundary cannot reach back into the legacy view adapter", () => {
  const presentation = source("src/sessionPresentation.ts");
  assert.doesNotMatch(presentation, /sessionViews\.js|import\.meta\.glob|@ts-nocheck/);
  assert.doesNotMatch(presentation, EXPLICIT_ANY);
  assert.equal((presentation.match(/Object\.freeze/g) ?? []).length, 13);
});

test("batch 27 guard rationale and corrected acceptance claims stay explicit", () => {
  const presentation = source("src/sessionPresentation.ts");
  assert.match(presentation, /Number\(null\).*0\.0/s);
  assert.match(presentation, /player-directory hosted assertions.*不可.*移除/s);
  assert.match(presentation, /player drawer and card escape every public value.*不可改計算方式/s);

  const batch16 = source("docs/migration-reports/batch-16.md");
  const batch21 = source("docs/migration-reports/batch-21.md");
  const batch22 = source("docs/migration-reports/batch-22.md");
  assert.match(batch16, /一處既有 e2e 斷言依工單參數化（本機門檻值不變）/);
  assert.doesNotMatch(batch16, /e2e 斷言零變更/);
  assert.match(batch21, /gate 只保證整條 policy.*不證明清單完備/);
  assert.match(batch22, /所有 `src\/\*\*\/\*\.tsx` 零反向 import/);
});

test("sessionViews keeps compatibility exports without redefining React runtimes", () => {
  const views = source("src/sessionViews.js");
  assert.match(
    views,
    /export \{[\s\S]*avatarRuntime[\s\S]*sessionDetailSheetRuntime[\s\S]*from "\.\/sessionPresentation\.ts";/
  );
  assert.equal(
    (views.match(/Object\.freeze/g) ?? []).length,
    1,
    "only the create/edit form runtime remains legacy-owned"
  );
});

test("sessionViews re-exports the exact presentation runtime objects", async () => {
  const [presentation, views] = await Promise.all([
    import("../src/sessionPresentation.ts"),
    import("../src/sessionViews.js"),
  ]);
  for (const name of RUNTIME_EXPORTS) assert.equal(views[name], presentation[name], `${name} was duplicated`);
  assert.equal(views.messagesFromGroups, presentation.messagesFromGroups);
  assert.equal(views.nearbySessionsSummaryText, presentation.nearbySessionsSummaryText);
});
