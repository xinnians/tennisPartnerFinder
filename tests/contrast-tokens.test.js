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

// 底色一律從 CSS 現況取,不寫死——底色被改動時這支測試會自己重算而不是繼續驗舊值。
const BACKGROUNDS = [
  ["他人的聊天泡泡 .chat-message", MIST],
  ["自己的聊天泡泡 .chat-message--self", cssValue(/\.chat-message--self \{[^}]*background:\s*(#[0-9a-f]{6})/i, ".chat-message--self 背景")],
  ["球局摘要 .chat-session-summary", MIST],
  ["封存提示 .chat-archived-note", cssValue(/\.chat-archived-note \{[^}]*background:\s*(#[0-9a-f]{6})/i, ".chat-archived-note 背景")],
  ["在場設定 .presence-settings", cssValue(/\.presence-settings \{[^}]*background:\s*(#[0-9a-f]{6})/i, ".presence-settings 背景")],
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

test("四個套用點都改用加深後的 token", () => {
  assert.ok(CSS.length > 10_000, "CSS 讀取失敗時計數會全部歸零,先確認掃描集非空");
  for (const selector of [
    ".presence-settings .form-hint",
    ".chat-session-summary span",
    ".chat-archived-note",
    ".chat-message__meta",
  ]) {
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
