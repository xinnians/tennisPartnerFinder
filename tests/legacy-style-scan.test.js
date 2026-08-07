import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SRC_DIR = fileURLToPath(new URL("../src", import.meta.url));

// readdir 掃 src/ 全部 .css/.js 檔(而非寫死清單),批 A fix wave(2026-08-07)才擴面;
// 之後 src/ 新增樣式或渲染檔會自動納入掃描,不必記得手動加進 FILES。
const srcFiles = readdirSync(SRC_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && (entry.name.endsWith(".css") || entry.name.endsWith(".js")))
  .map((entry) => `src/${entry.name}`)
  .sort();

const SCAN_PATHS = [...srcFiles, "index.html"];
const FILES = SCAN_PATHS.map((path) => [path, readFileSync(new URL(`../${path}`, import.meta.url), "utf8")]);

// 計分板換皮(批 A)後不可回流的舊視覺常數;新增舊值前先讀 spec 2026-08-07。
// 批 B-8 清完地圖漸層 #dfeefa、backdrop rgba(11,28,50)、.player-layer-status 舊 rgba(20,44,75)
// 殘值後,將這兩組 rgba 數字家族補進封條,防止舊 navy 基底(rgb(11,28,50)/rgb(20,44,75))回流。
const BANNED = ["#d7f22a", "#2465bd", "#142c4b", "#eef4fb", "#64758b", "#d6e1ee", "Baloo", "20, 44, 75", "11, 28, 50"];

test("舊視覺常數不再出現於任何樣式來源", () => {
  // 下限抓 src/ 目前 22 個 .css/.js 檔 + index.html = 23 的保守值,
  // 抓太緊 readdir 增檔會誤報,抓太鬆 readdir 壞掉(例如目錄改名)也偵測不到。
  assert.ok(
    FILES.length >= 15,
    `掃描集過小(僅 ${FILES.length} 檔),readdir 可能漏掃 src/ 或路徑錯誤;掃到:${SCAN_PATHS.join(", ")}`
  );
  for (const [path, content] of FILES) {
    assert.ok(content.length > 100, `${path} 讀取異常,掃描集會漏檔`);
    for (const banned of BANNED) {
      assert.ok(!content.toLowerCase().includes(banned.toLowerCase()), `${path} 仍含舊視覺常數 ${banned}`);
    }
  }
});
