import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const CSS = readFileSync(new URL("../src/session.css", import.meta.url), "utf8");

/** WCAG 2.1 相對亮度。https://www.w3.org/TR/WCAG21/#dfn-relative-luminance */
function luminance(hex) {
  const value = hex.replace("#", "");
  const parts = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
}

/** WCAG 2.1 對比度。https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio */
function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** 從 CSS 取出 token 或宣告值,取不到就讓測試紅,不回退成預設值。 */
function cssValue(pattern, label) {
  const match = CSS.match(pattern);
  assert.ok(match, `讀不到 ${label};選擇器或 token 改名時要一併更新這支測試`);
  return match[1].toLowerCase();
}

const INK_MUTED = cssValue(/--ink-muted:\s*(#[0-9a-f]{6})/i, "--ink-muted");
const INK_MUTED_STRONG = cssValue(/--ink-muted-strong:\s*(#[0-9a-f]{6})/i, "--ink-muted-strong");
const MIST = cssValue(/--mist:\s*(#[0-9a-f]{6})/i, "--mist");

const COLOR_INK = cssValue(/--color-ink:\s*(#[0-9a-f]{6})/i, "--color-ink");
const COLOR_COURT = cssValue(/--color-court:\s*(#[0-9a-f]{6})/i, "--color-court");
const COLOR_SIGNAL = cssValue(/--color-signal:\s*(#[0-9a-f]{6})/i, "--color-signal");
const COLOR_SURFACE_PAGE = cssValue(/--color-surface-page:\s*(#[0-9a-f]{6})/i, "--color-surface-page");
const COLOR_SURFACE_CARD = cssValue(/--color-surface-card:\s*(#[0-9a-f]{6})/i, "--color-surface-card");
const COLOR_TEXT_SECONDARY = cssValue(/--color-text-secondary:\s*(#[0-9a-f]{6})/i, "--color-text-secondary");
const COLOR_DANGER = cssValue(/--color-danger:\s*(#[0-9a-f]{6})/i, "--color-danger");
const COLOR_DANGER_BG = cssValue(/--color-danger-bg:\s*(#[0-9a-f]{6})/i, "--color-danger-bg");
const COLOR_SUCCESS = cssValue(/--color-success:\s*(#[0-9a-f]{6})/i, "--color-success");
const COLOR_SUCCESS_BG = cssValue(/--color-success-bg:\s*(#[0-9a-f]{6})/i, "--color-success-bg");
const COLOR_INFO_BG = cssValue(/--color-info-bg:\s*(#[0-9a-f]{6})/i, "--color-info-bg");

test("計分板 token:文字組合全數達 AA 4.5:1", () => {
  const PAIRS = [
    ["主文字 on 頁底", COLOR_INK, COLOR_SURFACE_PAGE],
    ["主文字 on 卡片", COLOR_INK, COLOR_SURFACE_CARD],
    ["次要文字 on 頁底", COLOR_TEXT_SECONDARY, COLOR_SURFACE_PAGE],
    ["次要文字 on 卡片", COLOR_TEXT_SECONDARY, COLOR_SURFACE_CARD],
    ["次要文字 on info 底", COLOR_TEXT_SECONDARY, COLOR_INFO_BG],
    ["次要文字 on success 底", COLOR_TEXT_SECONDARY, COLOR_SUCCESS_BG],
    ["court 強調 on 卡片", COLOR_COURT, COLOR_SURFACE_CARD],
    ["signal 文字 on ink", COLOR_SIGNAL, COLOR_INK],
    ["ink 文字 on signal", COLOR_INK, COLOR_SIGNAL],
    ["danger on danger-bg", COLOR_DANGER, COLOR_DANGER_BG],
    ["success on success-bg", COLOR_SUCCESS, COLOR_SUCCESS_BG],
  ];
  assert.equal(PAIRS.length, 11, "掃描集非空且涵蓋十一組配對");
  for (const [label, fg, bg] of PAIRS) {
    const ratio = contrast(fg, bg);
    assert.ok(ratio >= 4.5, `${label}:${fg} on ${bg} 只有 ${ratio.toFixed(4)}:1`);
  }
});

// 底色一律從 CSS 現況取,不寫死——底色被改動時這支測試會自己重算而不是繼續驗舊值。
const BACKGROUNDS = [
  ["他人的聊天泡泡 .chat-message", MIST],
  ["自己的聊天泡泡 .chat-message--self", cssValue(/\.chat-message--self \{[^}]*background:\s*(#[0-9a-f]{6})/i, ".chat-message--self 背景")],
  ["球局摘要 .chat-session-summary", MIST],
  ["封存提示 .chat-archived-note", cssValue(/\.chat-archived-note \{[^}]*background:\s*(#[0-9a-f]{6})/i, ".chat-archived-note 背景")],
  ["在場設定 .presence-settings", COLOR_SUCCESS_BG], // 批 A-7 起改用 var(--color-success-bg),不再是可 regex 抓的字面 hex,比照上方 .chat-message 直接引用 token 常數
];

test("次要文字 token 在每一個實際底色上都達 AA 4.5:1", () => {
  assert.equal(BACKGROUNDS.length, 5, "掃描集非空且涵蓋五種底色");
  for (const [label, background] of BACKGROUNDS) {
    const ratio = contrast(INK_MUTED_STRONG, background);
    assert.ok(
      ratio >= 4.5,
      `${label}(${background}):--ink-muted-strong ${INK_MUTED_STRONG} 只有 ${ratio.toFixed(4)}:1`
    );
  }
});

test("--ink-muted 在這些底色上確實不足,證明加深那一階是必要的而非多餘", () => {
  const failures = BACKGROUNDS.filter(([, background]) => contrast(INK_MUTED, background) < 4.5);
  assert.equal(
    failures.length,
    BACKGROUNDS.length,
    `若 --ink-muted 已足夠,--ink-muted-strong 就該併回去;目前不足的有 ${failures.length}/${BACKGROUNDS.length}`
  );
});

test("三個套用點都改用加深後的 token", () => {
  // 批 A-7 前是四個(含 .presence-settings .form-hint);批 A-7 把該選擇器改用
  // var(--color-text-secondary),不再是 --ink-muted-strong,移出此清單(改由上方
  // PAIRS 測試的「次要文字 on success 底」涵蓋)。其餘三個待 Task 8(群聊/toast)換皮後
  // 一併移除。
  assert.ok(CSS.length > 10_000, "CSS 讀取失敗時計數會全部歸零,先確認掃描集非空");
  const selectors = [".chat-session-summary span", ".chat-archived-note", ".chat-message__meta"];
  assert.equal(selectors.length, 3, "掃描集非空且涵蓋三個套用點");
  for (const selector of selectors) {
    const rule = CSS.match(new RegExp(`\\n${selector.replace(/[.]/g, "\\.")} \\{([^}]*)\\}`));
    assert.ok(rule, `讀不到 ${selector} 的規則`);
    assert.match(rule[1], /var\(--ink-muted-strong\)/, `${selector} 沒有改用 --ink-muted-strong`);
  }
});

test("球場圖釘的描邊與內點都達非文字元素的 3:1", () => {
  const pins = readFileSync(new URL("../src/pins.js", import.meta.url), "utf8");
  const courtPin = pins.match(/const COURT_PIN_URL = svgToDataUri\(`([\s\S]*?)`\);/);
  assert.ok(courtPin, "讀不到 COURT_PIN_URL");
  // 3 碼與 6 碼 hex 都要收:圖釘的白底寫成 #fff,只收 6 碼會讓掃描集少一項。
  const colours = [...courtPin[1].matchAll(/(?:stroke|fill)="(#[0-9a-f]{3,6})"/gi)].map((match) =>
    match[1].toLowerCase()
  );
  assert.equal(colours.length, 3, "圖釘顏色掃描集:白底 + 描邊 + 內點,共三個");
  const inked = colours.filter((value) => !/^#(fff|ffffff)$/.test(value));
  assert.equal(inked.length, 2, "白底以外應剩描邊與內點兩個著色元素");
  for (const colour of inked) {
    const ratio = contrast(colour, "#ffffff");
    assert.ok(ratio >= 3, `圖釘顏色 ${colour} 對自身白底只有 ${ratio.toFixed(4)}:1`);
  }
});
