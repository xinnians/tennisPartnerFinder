import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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

test("all 14 React consumers depend on TypeScript presentation instead of sessionViews", () => {
  for (const path of REACT_CONSUMERS) {
    const content = source(path);
    assert.match(content, /from "\.\.\/sessionPresentation\.ts";/, `${path} misses the presentation boundary`);
    assert.doesNotMatch(content, /from ["'][^"']*sessionViews\.js["']/, `${path} recreates the reverse edge`);
  }
});

test("the presentation boundary cannot reach back into the legacy view adapter", () => {
  const presentation = source("src/sessionPresentation.ts");
  assert.doesNotMatch(presentation, /sessionViews\.js|import\.meta\.glob|@ts-nocheck|:\s*any\b/);
  assert.equal((presentation.match(/Object\.freeze/g) ?? []).length, 13);
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
