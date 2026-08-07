import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const FILES = ["src/session.css", "src/style.css", "src/pins.js", "index.html"].map((path) => [
  path,
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
]);

// 計分板換皮(批 A)後不可回流的舊視覺常數;新增舊值前先讀 spec 2026-08-07。
const BANNED = ["#d7f22a", "#2465bd", "#142c4b", "#eef4fb", "#64758b", "#d6e1ee", "Baloo"];

test("舊視覺常數不再出現於任何樣式來源", () => {
  assert.equal(FILES.length, 4, "掃描集非空:四個樣式來源都讀到");
  for (const [path, content] of FILES) {
    assert.ok(content.length > 100, `${path} 讀取異常,掃描集會漏檔`);
    for (const banned of BANNED) {
      assert.ok(!content.toLowerCase().includes(banned.toLowerCase()), `${path} 仍含舊視覺常數 ${banned}`);
    }
  }
});
