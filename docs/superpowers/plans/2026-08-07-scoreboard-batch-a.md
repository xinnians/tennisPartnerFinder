# 批 A：計分板視覺重設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依已核可 spec（`docs/superpowers/specs/2026-08-07-scoreboard-visual-redesign-batch-a-design.md`）建立完整 design token 層並將全站換皮為「計分板」視覺，不動任何 DOM／class／文案／流程。

**Architecture:** `src/session.css` 頂部單一 `:root` token 層；九個區域各自一個 commit 逐區把宣告值換成 token；舊 token 過渡期保留、最終任務移除並以掃描測試封死回歸。

**Tech Stack:** 原生 CSS custom properties、Google Fonts、node:test（`tests/contrast-tokens.test.js` 型式）、Playwright mock projects。無框架、無 build pipeline、無 linter。

## Global Constraints

- 只改樣式值：不動 DOM 結構、class 名、文案、流程、RPC／view（spec §3、§4）。
- AA 底線：文字 4.5:1、非文字 3:1；44px 觸控目標不可退（spec §4）。
- mono 字體永不指定給中文內容；混排 text node 用 fallback chain（`"IBM Plex Mono","Noto Sans TC"`），禁止為 mono 加 span（那是動 DOM）。
- `--color-signal`（#DDF53C）只能作 ink 上的文字色或 ink 文字的底色，不可與白底相鄰承載文字（spec §7）。
- @media 斷點維持 700／460／390 字面量（spec §2.3）。
- 每個任務結尾：`npm run test:session-unit` 綠 → `npm run test:mock` 綠 → 依任務指定路徑 `git add`（禁 `-A`）→ commit。
- commit 訊息格式沿用 repo 現況：`style: 批 A-<n> <區域>換皮為計分板 token`。

### 全域映射表（每個區域任務照此逐值替換；「視覺明顯跑版」允許在相鄰一階內調整並於 commit 訊息註記）

色彩（session.css、style.css、pins.js 通用）：

| 舊值/舊 token | 新 token |
|---|---|
| `var(--navy)`、`#142c4b` | `var(--color-ink)` |
| `var(--blue)`、`#2465bd` | `var(--color-court)` |
| `var(--lime)`、`#d7f22a` | `var(--color-signal)` |
| `var(--mist)`、`#eef4fb`：大面積底 | `var(--color-surface-page)` |
| `var(--mist)`：提示框、泡泡、hover 態 | `var(--color-info-bg)` |
| `#fff`／`#ffffff` | `var(--color-surface-card)` |
| `var(--ink-muted)` `#64758b`、`var(--ink-muted-strong)`、裸 `#57677c` | `var(--color-text-secondary)` |
| `var(--line)`、`#d6e1ee` | `var(--color-line)` |
| `#a1241b`／`#fff0ef` | `var(--color-danger)`／`var(--color-danger-bg)` |
| `#2d6a30`、`#426713` | `var(--color-success)` |
| `#eef8e7`、`#e7f5bf`、`#f7fbe9`、`#f5f9e5` | `var(--color-success-bg)` |
| `#c8dc9d` 這類 success 邊框 | 廢止，改 `var(--border-thin)` |
| `#f8fbff`、`#e5f0ff`、`#dfeaf8`、`#dce8fa` 淺藍 | 底→`var(--color-surface-page)`；互動選中/hover→`var(--color-info-bg)` |
| `var(--shadow)` 與所有手寫 `box-shadow: … rgba(...)` | 浮動控制項→`var(--elevation-1)`；sheet/drawer/toast→`var(--elevation-2)`；按鈕陰影一律移除（實線框語言） |

字階（`font-size` 舊 px → token；`line-height` 僅在原規則已有時同步換）：

| 11 | 12,13 | 14 | 15,16 | 17,18 | 20,21 | 22–26 |
|---|---|---|---|---|---|---|
| `--text-xs` | `--text-sm` | `--text-base` | `--text-md` | `--text-lg` | `--text-xl` | `--text-2xl` |

字重：`800`/`900`→`700`；`700` 保留；內文情境的 `500`/`400` 不動。
間距（gap/padding/margin 的 px）：`2,3,4,5→var(--space-1)`；`6,7,8,9,10→var(--space-2)`；`11,12,13→var(--space-3)`；`14,15,16→var(--space-4)`；`18,20→var(--space-5)`；`22,24→var(--space-6)`；`28,32→var(--space-7)`；`36,40→var(--space-8)`；複合值（如 `9px 10px`）各分量分別映射。
圓角：`4→var(--radius-sm)`；`8–18→var(--radius-md)`；`999px` 僅頭像類（`.player-avatar` 及圓形 icon 鈕）→`var(--radius-pill)`，其餘 999px→`var(--radius-md)`；徽章與表單輸入框→`var(--radius-sm)`。
z-index：`10→var(--z-header)`；`6→var(--z-map-controls)`；`18,20,21→var(--z-drawer)`（層內差用 `calc(var(--z-drawer) + 1)` 保序）；`30,31→var(--z-sheet)`（backdrop 用 `calc(var(--z-sheet) - 1)`）；`40→var(--z-toast)`；`0,1,4,7` 屬區域內部堆疊，保留裸值。

---

### Task 1: Token 層建立＋字體引入

**Files:**
- Modify: `src/session.css:1-15`（:root 區塊）
- Modify: `index.html:15`（Google Fonts link）
- Test: `tests/contrast-tokens.test.js`

**Interfaces:**
- Produces: 後續所有任務使用的 token 名（見 spec §2 全表；本任務貼出完整 :root）。舊 token（`--navy` 等）本任務**保留不動**，Task 9 才移除。

- [ ] **Step 1: 寫先紅的對比測試**

在 `tests/contrast-tokens.test.js` 頂部（`INK_MUTED` 宣告之後）新增讀取與測試：

```js
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
```

- [ ] **Step 2: 跑測試確認紅**

Run: `node --test tests/contrast-tokens.test.js`
Expected: FAIL，訊息「讀不到 --color-ink」。

- [ ] **Step 3: 在 :root 加入新 token（舊 token 原封不動保留在後）**

`src/session.css` :root 改為（`--bottom-navigation-*` 兩項與舊 token 保留）：

```css
:root {
  /* ==== 計分板 token 層(spec 2026-08-07 批 A);語意命名,dark mode 未來只翻此層 ==== */
  --color-ink: #12291c;
  --color-court: #1c5c3c;
  --color-signal: #ddf53c;
  --color-surface-page: #faf9f3;
  --color-surface-card: #ffffff;
  --color-text-primary: #12291c;
  --color-text-secondary: #46554b; /* 候選 #5c6a5f 對 success-bg 不足 4.5 時用此加深值;以 Step 4 實算為準 */
  --color-line: #cfd8cd;
  --color-danger: #a1241b;
  --color-danger-bg: #fff0ef;
  --color-success: #1c5c3c;
  --color-success-bg: #e8f2e3;
  --color-info-bg: #eef1e7;
  --font-body: "Noto Sans TC", sans-serif;
  --font-mono: "IBM Plex Mono", "Noto Sans TC", monospace;
  --font-display: "Barlow Condensed", "Noto Sans TC", sans-serif;
  --text-xs: 11px; --text-sm: 12px; --text-base: 14px; --text-md: 15px;
  --text-lg: 17px; --text-xl: 20px; --text-2xl: 24px;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-7: 32px; --space-8: 40px;
  --radius-sm: 4px; --radius-md: 8px; --radius-pill: 999px;
  --border-strong: 1.5px solid var(--color-ink);
  --border-thin: 1px solid var(--color-line);
  --elevation-1: 0 2px 8px rgba(18, 41, 28, 0.10);
  --elevation-2: 0 14px 32px rgba(18, 41, 28, 0.22);
  --z-header: 10; --z-map-controls: 6; --z-drawer: 20; --z-sheet: 31; --z-toast: 40;
  /* ==== 以下為舊 token,逐區退場,Task 9 移除 ==== */
  --navy: #142c4b;
  /* …(既有其餘舊 token 原樣保留) */
}
```

- [ ] **Step 4: 跑測試確認綠；`--color-text-secondary` 若有配對不足就加深後重跑**

Run: `node --test tests/contrast-tokens.test.js` → Expected: PASS（11 組全過）。

- [ ] **Step 5: index.html 加入新字體（Baloo 2 先保留，Task 2 移除）**

`index.html:15` 的 families 改為 `Baloo+2:wght@500;600;700;800`＋`Barlow+Condensed:wght@600;700`＋`IBM+Plex+Mono:wght@500;600`＋`Noto+Sans+TC:wght@400;500;700;900`。

- [ ] **Step 6: 全套測試與 commit**

Run: `npm run test:session-unit && npm run test:mock` → PASS。

```bash
git add src/session.css index.html tests/contrast-tokens.test.js
git commit -m "style: 批 A-1 建立計分板 token 層與字體引入(未套用)"
```

### Task 2: App header＋bottom navigation

**Files:**
- Modify: `src/session.css`（`.app-header` 行 17 起、`.app-brand`、`.bottom-navigation` 行 330 起、`.my-sessions-badge` 行 361 起）
- Modify: `index.html:15`（移除 Baloo 2）

**Interfaces:**
- Consumes: Task 1 全部 token。
- Produces: 深底導覽視覺契約——`.bottom-navigation` 底 `var(--color-ink)`、非活躍項文字 `#9db3a4`、活躍項 `var(--color-signal)`；後續任務不再動導覽。

- [ ] **Step 1: 區域盤點** — `grep -n "app-header\|app-brand\|bottom-navigation\|my-sessions-badge" src/session.css` 列出本區全部規則行號。
- [ ] **Step 2: 逐值替換** — 依全域映射表換色彩／字階／間距／圓角／z-index；此外：`.app-brand` 的 `font-family` 改 `var(--font-display)` 並加 `letter-spacing: 1px`；`.bottom-navigation` 背景改 `var(--color-ink)`、上邊框改 `var(--border-strong)`、項目文字色 `#9db3a4`、活躍態 `var(--color-signal)`（此二值為深底專用常數，直接寫值並加註解）；`.my-sessions-badge` 底改 `var(--color-signal)`、字 `var(--color-ink)`。
- [ ] **Step 3: 移除 Baloo 2** — index.html families 刪 `Baloo+2:wght@500;600;700;800`；`grep -rn "Baloo" src/ index.html` 應僅剩 0 筆。
- [ ] **Step 4: 區域殘值反掃** — `grep -n "navy\|--blue\|--lime\|--mist\|--ink-muted\|--line\b" src/session.css` 確認本區規則行號內已無舊 token（其他區尚有屬預期）。
- [ ] **Step 5: 測試** — `npm run test:session-unit && npm run test:mock` → PASS（smoke 斷言 console 零錯誤，字體 link 打錯會在此紅）。
- [ ] **Step 6: Commit**

```bash
git add src/session.css index.html
git commit -m "style: 批 A-2 header 與 bottom nav 換皮為計分板 token"
```

### Task 3: 地圖工具列＋圖釘

**Files:**
- Modify: `src/session.css`（`.map-toolbar` 行 109 起、`.location-button` 行 71、`.level-popover` 行 144、`#player-directory-open` 行 90、`.map-controls` 行 552、chips 行 61 起）
- Modify: `src/pins.js:1-4`（色常數）
- Test: `tests/contrast-tokens.test.js`（既有圖釘 3:1 測試自動重算）

**Interfaces:**
- Consumes: Task 1 token。
- Produces: `pins.js` 新常數值——後續無人再碰 pins.js。

- [ ] **Step 1: pins.js 色常數替換**

```js
const NAVY = "#12291c";   // 計分板 --color-ink;pins.js 無法讀 CSS 變數,值與 session.css 同步
const BLUE = "#1c5c3c";   // --color-court
const LIME = "#ddf53c";   // --color-signal
const SOFT_BLUE = "#e8f2e3"; // --color-success-bg(聚合底)
```

常數名不改（避免動 JS 結構）；`#64758b`（基底球場圖釘描邊/內點）改 `#46554b` 與 `--color-text-secondary` 同步。
- [ ] **Step 2: 跑圖釘對比測試** — `node --test tests/contrast-tokens.test.js` → PASS（3:1 測試以新值重算；`#46554b` on 白 ≈ 7.5:1）。
- [ ] **Step 3: 工具列 CSS 逐值替換** — 依映射表；chips 選中態改 `background: var(--color-ink); color: var(--color-surface-card)`；`--shadow` 類浮動陰影→`var(--elevation-1)`。
- [ ] **Step 4: 測試** — `npm run test:session-unit && npm run test:mock` → PASS。
- [ ] **Step 5: Commit**

```bash
git add src/session.css src/pins.js
git commit -m "style: 批 A-3 地圖工具列與圖釘換皮為計分板 token"
```

### Task 4: 附近球局抽屜＋球局卡＋徽章

**Files:**
- Modify: `src/session.css`（`.nearby-sessions*` 行 194 起、`.session-card` 行 210 起、`.player-card` 行 217、`.session-badge--*` 行 221、`.session-primary/.session-secondary` 行 73/240）

**Interfaces:**
- Consumes: Task 1 token。
- Produces: 徽章視覺契約——`.session-badge--instant` 底 `var(--color-signal)` 字 `var(--color-ink)`；`.session-badge--ongoing` 底 `var(--color-ink)` 字 `var(--color-signal)`；按鈕契約——`.session-primary` 底 `var(--color-ink)` 字 `var(--color-signal)`、`.session-secondary` 透明底＋`var(--border-strong)` 框；Task 5-8 遇同名徽章/按鈕直接沿用不再重定義。

- [ ] **Step 1: 區域盤點** — `grep -n "nearby-sessions\|session-card\|player-card\|session-badge\|session-primary\|session-secondary" src/session.css`。
- [ ] **Step 2: 逐值替換**＋計分板特例：卡片時間類宣告（`.session-card` 下時間元素與 `.nearby-sessions__summary` 開頭時間）`font-family: var(--font-mono)`（mono 缺 CJK 自動 fallback Noto，中文不受影響）＋`font-variant-numeric: tabular-nums`；卡片 `font-weight: 900` 全數降 700；抽屜 `border-radius: 18px 18px 0 0`→`var(--radius-md) var(--radius-md) 0 0` 並加 `border-top: var(--border-strong)`。
- [ ] **Step 3: 測試** — `npm run test:session-unit && npm run test:mock` → PASS。
- [ ] **Step 4: Commit**

```bash
git add src/session.css
git commit -m "style: 批 A-4 抽屜、球局卡與徽章換皮為計分板 token"
```

### Task 5: Sheet／dialog surface＋球局詳情＋加入預覽

**Files:**
- Modify: `src/session.css`（`.surface` 行 262 起、`.session-detail` 行 478、`.join-preview` 行 485、`.player-avatar` 行 498、`.trust-count` 行 497）

**Interfaces:**
- Consumes: Task 1 token、Task 4 按鈕/徽章契約。
- Produces: `.surface` 圓角 `var(--radius-md)`、陰影 `var(--elevation-2)`＋`var(--border-strong)` 上框；`.player-avatar` 是全站唯一 `var(--radius-pill)` 使用點。

- [ ] **Step 1: 區域盤點** — `grep -n "\.surface\|session-detail\|join-preview\|player-avatar\|trust-count\|profile-return-context" src/session.css`。
- [ ] **Step 2: 逐值替換**；`.surface` 的 `border-radius: 18px`→`var(--radius-md)`；詳情列分隔線→`var(--border-thin)`；時間/NTRP 數字宣告同 Task 4 mono 規則。
- [ ] **Step 3: 測試** — `npm run test:session-unit && npm run test:mock` → PASS（modal/drawer 焦點測試在此把關）。
- [ ] **Step 4: Commit**

```bash
git add src/session.css
git commit -m "style: 批 A-5 sheet/dialog 與球局詳情換皮為計分板 token"
```

### Task 6: 表單族

**Files:**
- Modify: `src/session.css`（`.form-field` 行 281 起、`.form-fieldset` 行 289、`.option-grid--stacked` 行 306、`.slots-options` 行 315、`.form-hint/.form-disclosure/.form-error` 行 319-324）

**Interfaces:**
- Consumes: Task 1 token。
- Produces: 輸入控件視覺契約——輸入框 `var(--radius-sm)`＋`var(--border-thin)`、focus 態 `border-color: var(--color-court)`；`.form-error` 用 danger 對、`.form-disclosure` 用 info-bg＋左框 `3px solid var(--color-court)`（原 lime 左框退場，signal 不與白底相鄰）。

- [ ] **Step 1: 區域盤點** — `grep -n "form-field\|form-fieldset\|option-grid\|slots-options\|form-hint\|form-disclosure\|form-error" src/session.css`。
- [ ] **Step 2: 逐值替換**（含上述特例；`:has(input:checked)` 選中態底→`var(--color-info-bg)`、框→`var(--border-strong)`）。
- [ ] **Step 3: 測試** — `npm run test:session-unit && npm run test:mock` → PASS。44px 高度宣告（min-height 類）逐條確認未被間距映射動到。
- [ ] **Step 4: Commit**

```bash
git add src/session.css
git commit -m "style: 批 A-6 表單族換皮為計分板 token"
```

### Task 7: My Sessions＋我頁

**Files:**
- Modify: `src/session.css`（`.my-session-card/.my-action-card` 行 461 起、`.me-identity-card` 等行 395 起、`.notification-settings` 行 428、`.blocked-player-row` 行 452、`.presence-settings` 行 94、`.success-push-prompt` 行 444）

**Interfaces:**
- Consumes: Task 1 token、Task 4 徽章契約。
- Produces: 無新契約；本任務結束後 `#f7fbe9`/`#c8dc9d` 應全站歸零。

- [ ] **Step 1: 區域盤點** — `grep -n "my-session-card\|my-action-card\|me-identity\|me-sign-in\|me-service\|notification-settings\|blocked-player\|presence-settings\|success-push-prompt\|player-visibility\|player-presence\|player-greeting" src/session.css`。
- [ ] **Step 2: 逐值替換**；`.presence-settings` 與 `.success-push-prompt` 的 `#f7fbe9`/`#c8dc9d` → `var(--color-success-bg)`／`var(--border-thin)`。
- [ ] **Step 3: 對比測試重算** — `node --test tests/contrast-tokens.test.js` → PASS（BACKGROUNDS 中 `.presence-settings` 底色自動改抓 success-bg 重算次要文字對比；不足即依 Task 1 Step 4 規則加深 `--color-text-secondary` 並重跑全部配對）。
- [ ] **Step 4: 測試** — `npm run test:session-unit && npm run test:mock` → PASS。
- [ ] **Step 5: Commit**

```bash
git add src/session.css
git commit -m "style: 批 A-7 My Sessions 與我頁換皮為計分板 token"
```

### Task 8: 群聊＋toast＋殘餘元件

**Files:**
- Modify: `src/session.css`（`.chat-message*` 行 512 起、`.chat-composer` 行 521、`.player-invite-option/.player-invite-success` 行 530-533、`.toast` 行 537、`.candidate-decision-buttons` 行 279、行 539 起三段 @media 內所有殘值）

**Interfaces:**
- Consumes: Task 1 token、Task 4/5 契約。
- Produces: 本任務結束後 session.css 規則區（:root 以外）應零舊 token／零散落 hex。

- [ ] **Step 1: 逐值替換** — 聊天泡泡：他人 `var(--color-info-bg)`、自己 `var(--color-success-bg)`、系統訊息文字 `var(--color-text-secondary)`；`.toast` 底 `var(--color-ink)` 字 `var(--color-surface-card)` 陰影 `var(--elevation-2)`。
- [ ] **Step 2: 全檔殘值反掃** — `grep -n "var(--navy)\|var(--blue)\|var(--lime)\|var(--mist)\|var(--ink-muted\|var(--line)\|var(--shadow)" src/session.css` 應僅命中 :root 定義行；`grep -cn "#2465bd\|#d7f22a\|#eef4fb\|#64758b\|#57677c\|#d6e1ee" src/session.css` 應為 0（`#142c4b` 僅剩 :root 舊 token 行）。
- [ ] **Step 3: 對比測試** — `node --test tests/contrast-tokens.test.js` → PASS（聊天泡泡底色換抓新值重算；「--ink-muted 確實不足」該測試此時若反轉，連同 Task 9 舊 token 移除一起處理：先在本任務把該測試改為 skip 並註記「Task 9 移除」）。
- [ ] **Step 4: 測試** — `npm run test:session-unit && npm run test:mock` → PASS。
- [ ] **Step 5: Commit**

```bash
git add src/session.css tests/contrast-tokens.test.js
git commit -m "style: 批 A-8 群聊、toast 與殘餘元件換皮完成"
```

### Task 9: style.css 併入＋舊 token 移除＋回歸封死

**Files:**
- Modify: `src/style.css`（字面量→token）
- Modify: `src/session.css`（:root 舊 token 區塊刪除）
- Modify: `tests/contrast-tokens.test.js`（移除 `--ink-muted*` 相關測試與 skip 殘留）
- Create: `tests/legacy-style-scan.test.js`

**Interfaces:**
- Consumes: 全部前置任務完成。
- Produces: `tests/legacy-style-scan.test.js`——永久回歸封條。

- [ ] **Step 1: 寫先紅的掃描測試**

```js
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
```

Run: `node --test tests/legacy-style-scan.test.js` → Expected: FAIL（:root 舊 token 尚在）。
- [ ] **Step 2: 移除 session.css :root 舊 token 區塊**；`src/style.css` 的 `#142c4b`／`#f5f8fb` 等字面量改 `var(--color-text-primary)`／`var(--color-surface-page)`；同步把 `tests/contrast-tokens.test.js` 的 `--ink-muted*` 讀取與兩支相關測試刪除。
- [ ] **Step 3: 掃描測試轉綠** — `node --test tests/legacy-style-scan.test.js` → PASS。
- [ ] **Step 4: Canary 三拍** — 在 `src/session.css` 任意規則塞 `color: #d7f22a;` → 跑掃描測試 → Expected: FAIL（證明有牙）→ 移除 canary → 再跑 → PASS。三拍結果記入 commit 訊息。
- [ ] **Step 5: 全套測試** — `npm run test:session-unit && npm run test:mock && npm run build && git diff --check` → 全 PASS。
- [ ] **Step 6: Commit**

```bash
git add src/session.css src/style.css tests/contrast-tokens.test.js tests/legacy-style-scan.test.js
git commit -m "style: 批 A-9 舊 token 退場,legacy 掃描封死回歸(canary 三拍已驗)"
```

### Task 10: 批次驗收（orchestrator／user checkpoint）

**Files:** 無程式變更；產出截圖對照集於 session scratchpad。

- [ ] **Step 1:** mock 模式起 dev server，390px 與桌面各截：地圖首頁、抽屜展開、球局詳情、My Sessions、我頁（比照基線審計截圖集）。
- [ ] **Step 2:** 與批 A 前基線截圖並排對照，逐畫面確認：無漏網舊色、字重層級生效、44px 觸控未退化。
- [ ] **Step 3:** `TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium`（Docker 可用時）補跑 local journey。
- [ ] **Step 4:** 390px 手動走查探索→詳情→登入 gate 動線；發現問題開修正 commit，不回滾整批。
- [ ] **Step 5:** 向 user 回報對照結果，批 A 驗收由 user 拍板；通過後才進批 B spec。

## Self-Review 紀錄

- Spec 覆蓋：§2 token 全表→Task 1；§3 九步→Task 1-9 一一對應；§5 驗收五項→Task 1(對比)/9(canary/殘值)/10(截圖與手檢)。無缺口。
- Placeholder 掃描：各任務替換規則皆錨定全域映射表與明確特例，無 TBD。
- 一致性：深底導覽的 `#9db3a4` 只出現在 Task 2 並定義為深底專用常數；`--color-text-secondary` 的加深回路在 Task 1/7 用同一規則；mono fallback 規則在 Global Constraints 定一次、Task 4/5 引用。
- 已知張力：時間 text node 若中英數混排，mono 效果靠 font fallback，視覺節奏不完美屬已接受折衷（spec §7），批 C 重排時再議。
