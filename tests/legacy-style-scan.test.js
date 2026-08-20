import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const SRC_DIR = fileURLToPath(new URL("../src", import.meta.url));
const SOURCE_EXTENSIONS = [".css", ".js", ".ts", ".tsx"];

// 遞迴掃 src/ 全部樣式與渲染來源,讓 pages/sheets/components 及未來新增的子目錄
// 自動納入封條,不必人工維護 FILES 清單。
function readSourceTree(directory = SRC_DIR, prefix = "src") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, pathToFileURL(`${directory}/`));
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return readSourceTree(fileURLToPath(entryUrl), path);
    return SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension)) ? [path] : [];
  });
}

const srcFiles = readSourceTree().sort();
const EXPECTED_SOURCE_DIRECTORIES = ["src", "src/components", "src/pages", "src/sheets"];

const SCAN_PATHS = [...srcFiles, "index.html"];
const FILES = SCAN_PATHS.map((path) => [path, readFileSync(new URL(`../${path}`, import.meta.url), "utf8")]);

// 計分板換皮(批 A)後不可回流的舊視覺常數;新增舊值前先讀 spec 2026-08-07。
// 批 B-8 清完地圖漸層 #dfeefa、backdrop rgba(11,28,50)、.player-layer-status 舊 rgba(20,44,75)
// 殘值後,將這兩組 rgba 數字家族補進封條,防止舊 navy 基底(rgb(11,28,50)/rgb(20,44,75))回流。
const BANNED = ["#d7f22a", "#2465bd", "#142c4b", "#eef4fb", "#64758b", "#d6e1ee", "Baloo", "20, 44, 75", "11, 28, 50"];

test("舊視覺常數不再出現於任何樣式來源", () => {
  // 目前基線是 64 個 src 檔 + index.html；貼近實數的下限會抓到單檔漏掃，
  // 逐目錄非空斷言則防止整個既有子目錄被遞迴器跳過。
  assert.ok(
    FILES.length >= 65,
    `掃描集過小(僅 ${FILES.length} 檔),readdir 可能漏掃 src/ 或路徑錯誤;掃到:${SCAN_PATHS.join(", ")}`
  );
  for (const directory of EXPECTED_SOURCE_DIRECTORIES) {
    const directChildren = srcFiles.filter((path) => path.slice(0, path.lastIndexOf("/")) === directory);
    assert.ok(directChildren.length > 0, `${directory} 沒有任何直接來源檔，遞迴掃描可能漏掉整個目錄`);
  }
  for (const [path, content] of FILES) {
    assert.ok(content.length > 100, `${path} 讀取異常,掃描集會漏檔`);
    for (const banned of BANNED) {
      assert.ok(!content.toLowerCase().includes(banned.toLowerCase()), `${path} 仍含舊視覺常數 ${banned}`);
    }
  }
});
