import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

// 批 A 計分板換皮涵蓋 src/ 與 index.html(見 legacy-style-scan.test.js),
// 但 public/ 三檔(manifest、icon、privacy)當時漏掃,殘留舊 navy/blue 配色。
// 此檔比照 legacy-style-scan 形式,專掃 public/ 三檔,防止舊色再分岔進 build 輸出。
// eslint-disable-next-line no-unused-vars -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

const SCAN_PATHS = ["manifest.webmanifest", "icon.svg", "privacy.html"];
const FILES = SCAN_PATHS.map((name) => [name, readFileSync(new URL(`../public/${name}`, import.meta.url), "utf8")]);
const PRIVACY_HTML = FILES.find(([name]) => name === "privacy.html")?.[1] ?? "";
const PRIVACY_TEXT = PRIVACY_HTML.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ");

// 舊 navy/blue 品牌色與其對應底色 token;新增舊值前先讀
// docs/superpowers/specs 計分板換皮 spec 確認未被其他情境合法使用。
const BANNED = ["#142c4b", "#2465bd", "#d7f22a", "#eef4fb"];

test("public/ 三檔不再殘留舊品牌色", () => {
  assert.equal(FILES.length, 3, `掃描集數量不對,預期 3 檔,實得 ${FILES.length}`);
  for (const [name, content] of FILES) {
    assert.ok(content.length > 0, `public/${name} 讀取異常或為空檔,掃描集會漏檔`);
    for (const banned of BANNED) {
      assert.ok(!content.toLowerCase().includes(banned.toLowerCase()), `public/${name} 仍含舊品牌色 ${banned}`);
    }
  }
});

// 球咖改名工程:品牌自稱不得再以「球局」形式殘留在 public/ 三檔。名詞「球局」
// (開球局、球局資料……)在 privacy.html 合法存在,掃描模式必須帶分隔符,不可裸掃「球局」。
const BRAND_RESIDUE = ["球局｜", "球局地圖"];

test("public/ 三檔不再殘留舊品牌自稱「球局」", () => {
  for (const [name, content] of FILES) {
    for (const residue of BRAND_RESIDUE) {
      assert.ok(!content.includes(residue), `public/${name} 仍含舊品牌自稱「${residue}」`);
    }
  }
});

test("manifest theme_color 與 index.html theme-color meta 一致", () => {
  const manifest = JSON.parse(readFileSync(new URL(`../public/manifest.webmanifest`, import.meta.url), "utf8"));
  const indexHtml = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
  const match = indexHtml.match(/<meta\s+name="theme-color"\s+content="(#[0-9a-fA-F]{6})"\s*\/?>/);
  assert.ok(match, "index.html 找不到 theme-color meta,無法比對");
  assert.equal(
    manifest.theme_color,
    match[1],
    `manifest theme_color(${manifest.theme_color}) 與 index.html theme-color meta(${match[1]}) 不一致`
  );
});

test("隱私頁只揭露已查證的 Edge IP 與 dormant Push v2 本機資料範圍", () => {
  assert.match(PRIVACY_TEXT, /生效日期：2026 年 9 月 8 日/u);
  assert.match(PRIVACY_TEXT, /Supabase Edge Function.*請求來源 IP/u);
  assert.match(PRIVACY_TEXT, /Free 方案.*保留 1 天/u);
  assert.match(PRIVACY_TEXT, /HMAC.*不保存原始 IP.*不會移除 Supabase 平台本身的短期紀錄/u);
  assert.match(PRIVACY_TEXT, /新版推播目前尚未正式啟用/u);
  assert.match(PRIVACY_TEXT, /IndexedDB.*邏輯識別.*推播訂閱.*清理憑證.*推播同意狀態/u);
});
