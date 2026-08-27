import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url));
const REQUIRED_CSS_SOURCE_ANCHORS = ["src/style.css", "src/vocabulary.css", "src/sheet-shells.css"];

function readCssTree(directory = SRC_DIR, prefix = "src") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, pathToFileURL(`${directory}/`));
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return readCssTree(fileURLToPath(entryUrl), path);
    return entry.name.endsWith(".css") ? [[path, readFileSync(entryUrl, "utf8")]] : [];
  });
}

const CONTRACTS = [
  {
    selector: ".nearby-sessions__cards > .session-card",
    sourceAnchors: [
      ["src/pages/NearbySessionsDrawer.tsx", 'className="nearby-sessions__cards"'],
      ["src/components/SessionCard.tsx", 'data-testid="session-card"'],
    ],
  },
  {
    selector: ".my-sessions-list > .my-action-card",
    sourceAnchors: [
      ["src/pages/MySessionsPage.tsx", 'className="my-sessions-list"'],
      ["src/pages/MySessionsPage.tsx", 'className="my-action-card"'],
    ],
  },
  {
    selector: ".my-sessions-list > .my-session-card",
    sourceAnchors: [
      ["src/pages/MySessionsPage.tsx", 'className="my-sessions-list"'],
      ["src/pages/MySessionsPage.tsx", 'className="my-session-card"'],
    ],
  },
  {
    selector: ".player-directory-list > .player-directory-row",
    sourceAnchors: [
      ["src/sheets/PlayerDirectorySheet.tsx", 'className="player-directory-list"'],
      ["src/sheets/PlayerDirectorySheet.tsx", 'className="player-directory-row"'],
    ],
  },
];

const CSS_SOURCES = readCssTree().sort(([left], [right]) => left.localeCompare(right));
const CSS = CSS_SOURCES.map(([, source]) => source)
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const CONTAINMENT_RULES = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, declarations]) => ({ declarations, selector: selector.trim() }))
  .filter(({ declarations }) => /content-visibility\s*:\s*auto|contain-intrinsic-size\s*:/.test(declarations));

test("長列表 item selector 逐一綁定完整 content-visibility 契約", () => {
  assert.ok(CSS_SOURCES.length > 0, "CSS 掃描集不可為空");
  const cssSourcePaths = new Set(CSS_SOURCES.map(([path]) => path));
  for (const anchor of REQUIRED_CSS_SOURCE_ANCHORS) {
    assert.ok(cssSourcePaths.has(anchor), `CSS 掃描集缺少載重錨點 ${anchor}`);
  }
  assert.ok(CONTRACTS.length > 0, "長列表 selector 契約集不可為空");
  assert.ok(CONTAINMENT_RULES.length > 0, "CSS containment 掃描集不可為空");

  const expectedSelectors = CONTRACTS.map(({ selector }) => selector).sort();
  const scannedSelectors = CONTAINMENT_RULES.map(({ selector }) => selector).sort();
  assert.deepEqual(
    scannedSelectors,
    expectedSelectors,
    `containment selector 掃描漂移；實際=${scannedSelectors.join(", ")}；預期=${expectedSelectors.join(", ")}`
  );

  for (const { selector, sourceAnchors } of CONTRACTS) {
    const rules = CONTAINMENT_RULES.filter((rule) => rule.selector === selector);
    assert.equal(rules.length, 1, `${selector} 必須恰有一條 containment 規則，實際 ${rules.length} 條`);
    assert.match(rules[0].declarations, /content-visibility\s*:\s*auto\s*;/, `${selector} 缺 content-visibility:auto`);
    assert.match(
      rules[0].declarations,
      /contain-intrinsic-size\s*:\s*auto\s+\d+(?:\.\d+)?px\s*;/,
      `${selector} 缺 contain-intrinsic-size:auto <px>`
    );
    for (const [path, anchor] of sourceAnchors) {
      const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
      assert.ok(source.includes(anchor), `${selector} 的來源錨點 ${path}:${anchor} 不存在；markup selector 可能已改名`);
    }
  }
});
