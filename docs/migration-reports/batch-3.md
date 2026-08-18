# 批 3：訊息頁遷移 React 回報

日期：2026-08-18（Asia/Taipei）

## 1. 結論

訊息頁已由 React 19 接管，`renderMessagesPage(root, options)` 的名稱、兩參數簽名、main.js import／呼叫點與 smoke e2e 直呼點均未改。既有 testid、id、class、aria、文案、元素層級與全域 `session.css` 均保留；既有測試零修改。未 commit、未 push，也沒有執行本機 DB reset。

React best-practices 的直接模組 import、元件不在 render 內定義、每個 mount element 只初始化一次等規則已套用；本批沒有引入 barrel、effect 或額外資料請求。

## 2. Mount／adapter 設計

### 公開 adapter 不變

`src/sessionViews.js` 仍 export：

```js
export function renderMessagesPage(root, options = {}) {
  if (!mountMessagesPage) throw new Error("MessagesPage browser mount is unavailable.");
  mountMessagesPage(root, options);
}
```

Vite 以明寫 `.tsx` 的單檔 eager glob 同步載入 `src/pages/MessagesPage.tsx`。採這個組裝方式是因為存量 Node 22 unit tests 會直接 import `sessionViews.js`，但 Node 22 不辨識 `.tsx` 副檔名；在 Node（沒有 `document`）分支會短路，在 browser 則由 Vite 把 eager glob 轉為同步 import。因此不需改 unit test runner、main.js、appRuntime fixture 或公開 adapter 的同步語意。

### React root 與重複呼叫

- `WeakMap<HTMLElement, Root>` 以 mount element 為 key；同一個 `#messages-root` 只呼叫一次 `createRoot`。
- 每次 adapter 呼叫都重新解構最新 `courts`、`groups`、`onOpenChat`，再對既有 React root render 新 props。
- `flushSync` 保證 adapter return 前 DOM 已 commit，維持原 `innerHTML` renderer 的同步換頁與焦點時序。
- row 以 `sessionId` 為 key；click handler 使用當次 render 的 `onOpenChat`。既有 smoke 同一測試先 render 兩列、再以新 options render 空集合，已證明重複呼叫不是只吃第一次 props。
- JSX 的文字節點與 attribute 明確對齊舊 markup；動態字串由 React text/attribute escaping 處理，不再組 innerHTML。

### 檔案組織慣例

- 頁面元件與該頁 mount 實作放 `src/pages/<PageName>.tsx`；本批為 `src/pages/MessagesPage.tsx`。
- 既有公開函式留在原 legacy 模組作唯一 adapter；caller 不直接 import component。
- `.ts`／`.tsx`／`.js` importer 一律明寫真實副檔名；型別使用 `import type`。
- domain shape 從 `src/domainTypes.ts` 匯入。本批新增 `MySessionSummary` 與最小 `CourtSummary`。
- DOM/CSS 凍結與 innerHTML surface 混用規則已落在 `.claude/rules/react-migration.md`，後續批 4–8 沿用。

## 3. 焦點與 Escape

main.js 的輕量 messages focus capture **保留，未退役**，而且 main.js 最終 SHA 與批前相同。理由：React keyed reconciliation 能讓仍存在的同一列保住節點與焦點，但不能涵蓋兩個既有契約：

1. 被聚焦列從新資料消失時，回退聚焦 `[data-messages-heading]`。
2. sheet/modal 已開啟時，不得由背景頁重繪搶回焦點；generation 也要淘汰過期 rAF。

`flushSync` 讓既有 rAF restore 一定在 React commit 後執行。訊息 React 頁沒有新增 Escape listener；Escape 仍由最上層 sheet/dialog capture listener 處理，關閉後沿用既有 surface 焦點回復。這些混用期原則也已寫入規則檔。

## 4. 變更清單

- `src/pages/MessagesPage.tsx`：React 頁、列、空態、presentation helpers 與 per-root mount adapter。
- `src/sessionViews.js`：刪除 messages innerHTML/click listener renderer；公開 adapter 改委派 React mount，保留 `messagesFromGroups` 公開純函式供既有 unit consumer。
- `src/domainTypes.ts`：新增 `MySessionSummary`、`CourtSummary`。
- `eslint.config.js`：flat config 加 `eslint-plugin-react-hooks`，`rules-of-hooks`、`exhaustive-deps` 均為 error，且仍只套 `.ts/.tsx`。
- `package.json`、`package-lock.json`：加入 `eslint-plugin-react-hooks@^7.1.1`。
- `.claude/rules/react-migration.md`：importer、頁面批 1–4、焦點/Escape 混用期規則。
- `CLAUDE.md`：只加一行規則索引，總行數仍低於 200。
- `docs/migration-reports/batch-3.md`：本回報。

刻意未改：`src/main.js`、`src/session.css`、`index.html`、`tests/**`、`tests/fixtures/appRuntime.js`、`vite.config.ts`。

## 5. React 有牙紅綠證據

最終組裝完成後，先建立全 `src/` SHA manifest，再把 adapter 暫時退成空實作（保留 guard，只把 `mountMessagesPage(root, options)` 換成 `void root; void options;`）。執行：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium --grep 'messages page marks only'
```

紅燈逐字關鍵輸出（exit 1）：

```text
Running 1 test using 1 worker

  ✘  1 [desktop-chromium] › tests/smoke.spec.js:541:1 › messages page marks only the unread row, wires row clicks to onOpenChat, and mutually excludes its empty state (5.2s)

    Error: expect(locator).toHaveCount(expected) failed

    Locator:  locator('.messages-row__unread')
    Expected: 1
    Received: 0
    Timeout:  5000ms

      588 |   const unreadRow = page.getByTestId("messages-row-601");
      589 |   const readRow = page.getByTestId("messages-row-602");
    > 590 |   await expect(page.locator(".messages-row__unread")).toHaveCount(1);
          |                                                       ^

  1 failed
    [desktop-chromium] › tests/smoke.spec.js:541:1 › messages page marks only the unread row, wires row clicks to onOpenChat, and mutually excludes its empty state
EXIT_CODE=1
```

還原同一行後，綠燈逐字輸出（exit 0）：

```text
Running 1 test using 1 worker

  ✓  1 [desktop-chromium] › tests/smoke.spec.js:541:1 › messages page marks only the unread row, wires row clicks to onOpenChat, and mutually excludes its empty state (281ms)

  1 passed (1.2s)
```

這條既有測試同時鎖住：未讀點、兩列 DOM/testid、host/guest 頭像字、click callback、再 render 空集合與空態互斥；沒有為 React 改任何斷言。

## 6. Canary SHA-256 還原證據

canary 前後均對 `find src -type f` 排序後的 27 檔逐檔 `shasum -a 256`。manifest 本身 SHA：

```text
before  1e4f93d0f52845658102e5b6621181c5ad54eb2369cd5fb025d05a96aa5f59ed
after   1e4f93d0f52845658102e5b6621181c5ad54eb2369cd5fb025d05a96aa5f59ed
SRC_MANIFEST_DIFF_EXIT=0
```

直接涉及 adapter 的三檔前後值亦相同：

```text
df9e68583e38b1f921cd6e5be750e7fa3be77f70d56cbb9faa439902a9df7f8c  src/sessionViews.js
24839cc13adcb4ce59c90c77326576c6fed4c07d338fbf6d834b0d60c7934b9e  src/main.js
0fdcd3e24c00e5c69999af5511258c3930bbd6f8c853343dbc00c89b65b47ead  src/pages/MessagesPage.tsx
```

`main.js` 的值也等於批前 baseline，證明最後沒有留下臨時 registration 或焦點改動。

## 7. Bundle 前後對照

兩次均由同一工作樹、同一套依賴執行 `npm run build`，再以 `stat` 與 `gzip -c | wc -c` 量主 entry JS：

| 狀態 | modules | 主 JS raw | 主 JS gzip | CSS gzip | 小 JS gzip |
| --- | ---: | ---: | ---: | ---: | ---: |
| 批前（React 未被 entry 消費） | 71 | 488,666 B | 131,186 B | 10,678 B | 971 B |
| 批後 | 96 | 686,114 B | 193,891 B | 10,678 B | 971 B |
| 差額 | +25 | +197,448 B | **+62,705 B** | 0 | 0 |

批後 Vite 顯示主 chunk `686.11 kB / gzip 194.59 kB` 並觸發既有 500 kB chunk warning。gzip 增量 62.7 kB 高於「約 40 kB」的中心值，但仍是 React 19.2 `react` + `react-dom/client` + scheduler/JSX runtime 首次進 bundle的單一 runtime 量級；`npm ls react react-dom --depth=1` 顯示 `react@19.2.8` 全部 deduped，沒有第二份 React 或額外 UI library。CSS 與原本的小 analytics chunk byte-for-byte size 不變，因此不是樣式或意外功能膨脹。後續頁面批會攤薄這筆一次性成本。

批前逐字 build 摘要：

```text
vite v6.4.3 building for production...
transforming...
✓ 71 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-D3iryHT3.js   488.67 kB │ gzip: 131.75 kB
✓ built in 602ms
```

批後逐字 build 摘要見第 9 節。

## 8. 全 repo consumer sweep

掃描範圍為 active repo 的 `src/`、`tests/`、`scripts/`、`supabase/functions/` 與 `index.html`；依賴目錄、歷史 worktree 與純文件提及不算 runtime consumer。

### `renderMessagesPage`／root 全部錨點

```text
index.html:114                       #messages-root
src/sessionViews.js:2353             export function renderMessagesPage(root, options = {})
src/main.js:89                       import renderMessagesPage（未改）
src/main.js:1097                     getElementById("messages-root")（未改）
src/main.js:1102                     renderMessagesPage(root, { ... })（未改）
src/main.js:1214                     heading focus query（未改）
tests/smoke.spec.js:549              __importAppModule("sessionViews")
tests/smoke.spec.js:550              messages-root
tests/smoke.spec.js:554              第一次 renderMessagesPage
tests/smoke.spec.js:602              第二次 __importAppModule("sessionViews")
tests/smoke.spec.js:603              messages-root＋第二次 renderMessagesPage
```

### 被動到的模組與 consumer

- `src/pages/MessagesPage.tsx`：唯一 runtime importer 是 `src/sessionViews.js:18–19` 的明寫 `.tsx` eager glob；type-only import `src/domainTypes.ts`，presentation 共用 `src/sessionCriteria.js`、`src/taipeiTime.js`。
- `src/sessionViews.js` production importer 只有 `src/main.js:93`。Node direct consumers 為 `tests/session-create-form.test.js:11`、`tests/session-data-boundary.test.js:34`、`tests/session-controller.test.js:2395–2450`；browser module-import consumers集中在 `tests/smoke.spec.js`，另有 `tests/performance.spec.js:218,259` 與 `tests/session.spec.js:350`。全部由最終 `npm test`／`test:local` 實際載入。
- `messagesFromGroups` 的既有直接 consumer 是 `tests/session-data-boundary.test.js:34,424`；export 與語意保留。
- `tests/fixtures/appRuntime.js` 仍把 `sessionViews` 解成 `.js`；TSX 是其 browser module graph 的內部節點，不需要 extension table 新項目。
- `scripts/`：零 `renderMessagesPage`、`mountMessagesPage`、`MessagesPage` consumer。
- `supabase/functions/`：零 consumer。

## 9. 全部 gate 結尾輸出（逐字）

### `npm test`（含 pretest）

先直接完整跑一次；最終碼再以 `set -o pipefail` 重跑並擷取尾端，exit 0：

```text
  ✓  253 [mobile-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.4s)
  ✓  254 [mobile-chromium] › tests/smoke.spec.js:5359:1 › the filter sheet traps Tab focus between its own first and last controls (226ms)

  4 skipped
  250 passed (2.2m)
EXIT_CODE=0
```

同一次 gate 的 Node suite 在進入 Playwright 前為 246/246；`npm test` 的 pretest 亦先完成 seed `--check` 與 typecheck，否則 `&&` 鏈不會進入上述 Playwright 摘要。

### `npm run test:local`

local API 先 2/2，最終 Playwright 尾端（exit 0）：

```text
  ✓  51 [supabase-chromium] › tests/session.spec.js:2180:1 › N1 an existing zero-subscription account is never seeded by a later profile save (649ms)
  ✓  52 [supabase-chromium] › tests/session.spec.js:2199:1 › N2 an account that explicitly cleared every court stays at zero across later profile saves (960ms)
  ✓  53 [supabase-chromium] › tests/session.spec.js:2226:1 › N3 a failing subscription seed never fails the profile save (560ms)

  11 skipped
  42 passed (1.4m)
EXIT_CODE=0
```

未遇資料衝突，故未執行授權的 `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`。

### Typecheck

```text
> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit
```

### ESLint（含 React hooks）

```text
> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{ts,tsx}" vite.config.ts
```

### Prettier

```text
> tennis-partner-finder@0.1.0 prettier:check
> prettier --check "src/**/*.{ts,tsx}" vite.config.ts

Checking formatting...
All matched files use Prettier code style!
```

### Build

```text
> tennis-partner-finder@0.1.0 build
> vite build

vite v6.4.3 building for production...
transforming...
✓ 96 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-DXPQC_eP.js   686.11 kB │ gzip: 194.59 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 875ms
```

### `git diff --check`

```text
(no stdout)
EXIT_CODE=0
```

## 10. `git diff --stat` 與工作樹

`git diff --stat` 逐字輸出（Git 本身不列 untracked 新檔）：

```text
 CLAUDE.md           |  1 +
 eslint.config.js    |  8 +++++++
 package-lock.json   | 61 +++++++++++++++++++++++++++++++++++++++++++++++++++++
 package.json        |  1 +
 src/domainTypes.ts  | 13 ++++++++++++
 src/sessionViews.js | 50 ++++++++-----------------------------------
 6 files changed, 93 insertions(+), 41 deletions(-)
```

untracked 新檔另為：`.claude/rules/react-migration.md`（20 行）、`src/pages/MessagesPage.tsx`（196 行）、`docs/migration-reports/batch-3.md`（本檔）。`src/main.js` 最終零 diff；tests 全部零 diff。
