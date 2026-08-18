# 批 2：TypeScript＋React 基建回報

日期：2026-08-18（Asia/Taipei）

## 1. 結論與行為凍結

批 2 已完成。第一動作先把依賴面最小的 `src/districts.js` 轉成
`src/districts.ts`，批 0 fixture e2e 獨立 gate 15/15 全綠後，才加入
TypeScript、React、Vite React plugin、ESLint flat config、typescript-eslint、
Prettier 與 domain 型別。既有頁面仍走原生 DOM；沒有新增 React mount、沒有改 DOM、
文案、資料流程或 runtime 分支。未 commit、未 push。

## 2. 第一動作與 importer 慣例

### 模組選擇

- 選 `src/districts.js`：純常數與一個無副作用函式、零 import、只有
  `src/sessionViews.js` 一個 importer。
- 不選 `src/sessionCriteria.js`：它同時被 `map.js`、`playerPresence.js`、
  `sessionController.js`、`filters.js`、`sessionViews.js` 使用，座標與 joinability
  行為的爆炸半徑較大。

### 慣例決定

後續批次在 source 中引用 `.ts` 模組，一律寫明實際 `.ts` 副檔名，例如：

```js
import { TAIPEI_DISTRICTS } from "./districts.ts";
```

理由：specifier 與工作樹實際檔名一一對應，不把 Vite 的 extension probing 當成隱性
契約；`moduleResolution: "Bundler"`、`noEmit: true` 與
`allowImportingTsExtensions: true` 明確支援此寫法。存量 `.js` import 維持 `.js`，不做
無關的全樹改寫。

browser e2e 的 `globalThis.__importAppModule(name)` 呼叫點維持不變；唯一組裝點
`tests/fixtures/appRuntime.js` 新增 `APP_MODULE_EXTENSIONS`，已轉換模組取 `.ts`，其餘
仍預設 `.js`。這是 tests 唯一修改。

## 3. 基建設計

### Dependencies 與 Vite

- dependencies：`react@^19.2.8`、`react-dom@^19.2.8`。
- devDependencies：`typescript@^6.0.3`、`@vitejs/plugin-react@^5.2.0`、
  `eslint@^10.8.1`、`typescript-eslint@^8.67.0`、`prettier@^3.9.6`，以及 TSX
  必需的 `@types/react`、`@types/react-dom`。
- repo 維持 Vite 6；`@vitejs/plugin-react` 5.2 支援 Vite 6。沒有為採用只接受
  Vite 8 的 plugin-react 6.x 而擴張 bundler major 版本。
- `vite.config.ts` 只掛 `react()` plugin；現有 entry 與 build 選項不變。

### `tsconfig.json`

- `strict: true`：所有新 `.ts/.tsx` 嚴格檢查。
- `allowJs: true`、`checkJs: false`：納入存量模組解析，但不逼 23 個既有 JS 模組
  在本批型別化。
- `noEmit: true`：`tsc` 只作 gate，production emit 仍由 Vite 負責。
- `moduleResolution: "Bundler"`、`module: "ESNext"`、
  `allowImportingTsExtensions: true`：對齊上節 importer 慣例。
- `jsx: "react-jsx"`、DOM/ES2022 libs：為批 3 起的 `.tsx` 準備。
- `isolatedModules: true`：確保每個 TS 模組可由 Vite 單檔轉譯。

### ESLint、Prettier 與 gate 掛點

- `eslint.config.js` 使用 flat config 與 `typescript-eslint` recommended，只套用
  `**/*.{ts,tsx}`。
- `prettier.config.js` 固定雙引號、2 spaces、semicolon、120 columns；
  `prettier:check` 只掃 `.ts/.tsx`。
- scripts：`typecheck`、`lint`、`prettier:check`。
- `pretest:mock` 與 `pretest:local` 都執行 `npm run typecheck`。因此無論直接跑
  `npm run test:mock` 或 `npm run test:local`，正式測試 gate 都不能繞過型別檢查；
  lint/Prettier 保持獨立 gate，避免重複執行。

## 4. Domain 型別

新增 `src/domainTypes.ts`，只 export 型別、不被現有 runtime import。shape 逐欄反推
`src/dataApi.js` allowlist mapper 與既有 sheet handle：

- `SessionSummary`
- `Profile`
- `SessionJoinPreview`、`SessionJoinPreviewState`
- `SessionRosterEntry`、`SessionRoster`
- `ChatMessage`
- `NotificationPreferences`
- `SurfaceCloseOptions`、`SurfaceContract`、`SessionDetailSurfaceContract`

數字 mapper 可能回 `null` 的欄位保留 `number | null`；`asText` 輸出維持 `string`；
profile 的集合維持 `Set<string>`。沒有把未受 mapper 保證的 status 字串過早收窄成 enum。

## 5. 變更清單

- `package.json`、`package-lock.json`：依賴與 scripts。
- `tsconfig.json`、`eslint.config.js`、`prettier.config.js`、`vite.config.ts`：工具鏈。
- `src/districts.js` → `src/districts.ts`：最小 TS 轉換；值與分支不變。
- `src/sessionViews.js`：唯一 importer 的一行 specifier。
- `src/domainTypes.ts`：後續遷移用的型別-only 模組。
- `tests/fixtures/appRuntime.js`：唯一副檔名解析點；零呼叫點修改。
- `CLAUDE.md`、`.claude/rules/testing.md`：技術棧與本機 gate 同步。
- `docs/migration-reports/batch-2.md`：本回報。

## 6. 第一動作 fixture 存活證據

在只有 `districts.ts`、唯一 importer 與 appRuntime extension table 改動、尚未展開其餘
基建時執行：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js tests/performance.spec.js --project=desktop-chromium --grep 'slow discovery keeps|in-context drawer retry|delayed discovery refresh|anonymous session artifacts strip tainted|filter sheet button stays enabled' --repeat-each=3
```

reporter 輸出逐字：

```text
Running 15 tests using 1 worker

  ✓   1 [desktop-chromium] › tests/performance.spec.js:54:1 › slow discovery keeps the map shell, base courts, and status usable before session rows arrive (3.4s)
  ✓   2 [desktop-chromium] › tests/performance.spec.js:148:1 › an in-context drawer retry replaces the semantic error state with results (601ms)
  ✓   3 [desktop-chromium] › tests/performance.spec.js:311:1 › a delayed discovery refresh keeps drawer focus on a durable target (2.1s)
  ✓   4 [desktop-chromium] › tests/smoke.spec.js:716:1 › anonymous session artifacts strip tainted source fields from HTML, data attributes, markers, and captured JSON (243ms)
  ✓   5 [desktop-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.4s)
  ✓   6 [desktop-chromium] › tests/performance.spec.js:54:1 › slow discovery keeps the map shell, base courts, and status usable before session rows arrive (3.2s)
  ✓   7 [desktop-chromium] › tests/performance.spec.js:148:1 › an in-context drawer retry replaces the semantic error state with results (563ms)
  ✓   8 [desktop-chromium] › tests/performance.spec.js:311:1 › a delayed discovery refresh keeps drawer focus on a durable target (2.1s)
  ✓   9 [desktop-chromium] › tests/smoke.spec.js:716:1 › anonymous session artifacts strip tainted source fields from HTML, data attributes, markers, and captured JSON (216ms)
  ✓  10 [desktop-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.1s)
  ✓  11 [desktop-chromium] › tests/performance.spec.js:54:1 › slow discovery keeps the map shell, base courts, and status usable before session rows arrive (3.1s)
  ✓  12 [desktop-chromium] › tests/performance.spec.js:148:1 › an in-context drawer retry replaces the semantic error state with results (585ms)
  ✓  13 [desktop-chromium] › tests/performance.spec.js:311:1 › a delayed discovery refresh keeps drawer focus on a durable target (2.1s)
  ✓  14 [desktop-chromium] › tests/smoke.spec.js:716:1 › anonymous session artifacts strip tainted source fields from HTML, data attributes, markers, and captured JSON (224ms)
  ✓  15 [desktop-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.4s)

  15 passed (24.0s)
```

taint、`delayMockCourts`、`delayMockDiscovery`、failure hook 與 taint 測試使用的
`__importAppModule("mockData")` 均經 Vite dev transform 後實際消費；app bootstrap 同時
實際載入 `sessionViews.js → districts.ts`，沒有假綠。

## 7. 工具鏈紅綠證據

兩組 canary 都只暫改已轉換的 `src/districts.ts`。

### TypeScript：錯誤時紅

暫加 `const TYPECHECK_CANARY: string = 42;` 後，逐字輸出（exit 2）：

```text
> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit

src/districts.ts(58,7): error TS2322: Type 'number' is not assignable to type 'string'.
```

還原後逐字輸出（exit 0）：

```text
> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit
```

### ESLint：違規時紅

暫加未使用的 `const LINT_CANARY = "unused";` 後，逐字輸出（exit 1）：

```text
> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{ts,tsx}" vite.config.ts


/Users/ian/tennisPartnerFinder/src/districts.ts
  58:7  error  'LINT_CANARY' is assigned a value but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (1 error, 0 warnings)
```

還原後逐字輸出（exit 0）：

```text
> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{ts,tsx}" vite.config.ts
```

## 8. 掃描面前後對照

前＝本批任何 src 改動前；後＝`districts.ts` 與 `domainTypes.ts` 均在位後。

| 掃描 | 前 | 後 | 差異 |
| --- | ---: | ---: | ---: |
| legacy-style：src 根層 `.css/.js/.ts/.tsx` | 25 | 26 | +1 |
| legacy-style：上列＋`index.html` | 26 | 27 | +1 |
| NTRP：src 遞迴 `.js/.ts/.tsx` | 23 | 24 | +1 |
| LINE：src 遞迴 scripts | 23 | 24 | +1 |
| LINE：src scripts＋public scripts | 24 | 25 | +1 |

轉檔讓 `districts.js` 的一筆換成 `districts.ts`，檔數不變；新增根層
`domainTypes.ts` 讓三套掃描各增加一筆。最終實掃 TS 清單逐字：

```text
src/districts.ts
src/domainTypes.ts
```

對應掃描測試關鍵輸出逐字：

```text
# Subtest: 舊視覺常數不再出現於任何樣式來源
ok 1 - 舊視覺常數不再出現於任何樣式來源
# Subtest: NTRP 說明只有一份來源,三個掛載點都引用同一個常數
ok 2 - NTRP 說明只有一份來源,三個掛載點都引用同一個常數
# Subtest: frontend source scan allows only the frozen LINE RPC parameter
ok 14 - frontend source scan allows only the frozen LINE RPC parameter
1..69
# tests 69
# pass 69
# fail 0
```

## 9. 文件 diff 全文

```diff
diff --git a/.claude/rules/testing.md b/.claude/rules/testing.md
index f242bba..c7d47f7 100644
--- a/.claude/rules/testing.md
+++ b/.claude/rules/testing.md
@@ -27,10 +27,16 @@ npm run test:mock
 npm run test:local
 TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium
 node scripts/generate-courts-seed.mjs --check
+npm run typecheck
+npm run lint
+npm run prettier:check
 npm run build
 git diff --check
 ```
 
+`npm run test:mock` 與 `npm run test:local` 的 pre-script 都會先跑 `npm run typecheck`；
+`lint` 與 `prettier:check` 只掃 `.ts/.tsx`，不把存量 `.js` 納入本批改寫範圍。
+
 ## Playwright projects
 
 - `desktop-chromium`、`mobile-chromium`：mock mode，port 5174，執行
diff --git a/CLAUDE.md b/CLAUDE.md
index bb4f45b..076a6e8 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -2,7 +2,8 @@
 
 ## 專案定位
 
-這是以 Vite 6 與原生 ES modules 製作的台北市網球公開球局 MVP。首頁是地圖，
+這是以 Vite 6 與原生 ES modules 製作的台北市網球公開球局 MVP；React 19 與 TypeScript 6
+基建已安裝，既有頁面仍維持原生 DOM，後續才逐頁遷移。首頁是地圖，
 使用者可瀏覽未來與開打後兩小時內的球局，依球局加入方式申請或直接加入；已接受成員可使用球局群組聊天，
 前端不再提供 LINE 聯絡面。首發公開範圍是 **台北市、網球**；資料庫保留雙北球場目錄，但不可把
 新北市球場開放為公開球局。
@@ -58,12 +59,14 @@
 - `src/sessionViews.js`：抽屜、球局、建立／編輯／定案表單、My Sessions 與群聊。
 - `src/sheets.js`：可存取的 sheet/dialog 原語與焦點回復。
 - `src/dataApi.js`：唯一瀏覽器資料邊界；公開 summary、私有 view 與 RPC mapper。
+- `src/domainTypes.ts`：從 data API mapper 反推的共用 domain／surface 型別。
 - `src/map.js` / `src/pins.js`：Google Maps 與球局／球場圖釘。
 - `src/mockData.js`：安全的本機 demo `SessionSummary`。
 - `data/courts.json`：球場目錄單一來源；產生 migration／pgTAP fixture 的來源。
 
-以 `innerHTML` 產生 DOM 時，所有動態內容都必須使用 `esc()`；沒有框架、TypeScript、
-linter 或 formatter，勿虛構 `lint`／`tsc` 指令。UI 與註解使用繁體中文。
+既有頁面以 `innerHTML` 產生 DOM 時，所有動態內容都必須使用 `esc()`。新 `.ts/.tsx` 走
+strict TypeScript、ESLint flat config 與 Prettier；存量 `.js` 採 `allowJs`、不開 `checkJs`，
+不因工具鏈導入強制改寫。UI 與註解使用繁體中文。
 
 ## Session 資料流程
 
@@ -120,6 +123,9 @@ npm run test:mock
 npm run test:local
 TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium
 node scripts/generate-courts-seed.mjs --check
+npm run typecheck
+npm run lint
+npm run prettier:check
 npm run build
 git diff --check
 ```
```

`CLAUDE.md` 最終 185 行，仍低於既有 200 行限制。

## 10. Canary SHA-256 還原對照

兩組 canary 只暫改 `src/districts.ts`，前後完全一致：

```text
                     canary 前                                                         還原後
src/districts.ts     3270bef90e252edf096885cae36d266ed4059993670ff254d0cfee5e6ea03b86  3270bef90e252edf096885cae36d266ed4059993670ff254d0cfee5e6ea03b86
```

`TYPECHECK_CANARY` 與 `LINT_CANARY` 最終搜尋均為零命中；沒有其他 src 暫改。

## 11. 最終 gate 結尾輸出

local gate 前依派工單授權執行：

```bash
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test
```

guarded reset 僅命中 `127.0.0.1:54321` local Supabase，完整套用 migrations 後再測。

### `npm run test:mock`

結尾輸出逐字（exit 0）：

```text
  ✓  246 [mobile-chromium] › tests/smoke.spec.js:5082:1 › the profile sheet still offers all four practice types (127ms)
  ✓  247 [mobile-chromium] › tests/smoke.spec.js:5102:1 › the type filter offers three chips and no longer lists 對拉 (177ms)
  ✓  248 [mobile-chromium] › tests/smoke.spec.js:5115:1 › subscribing to every Taipei court collapses the picker and reopens on demand (200ms)
  ✓  249 [mobile-chromium] › tests/smoke.spec.js:5160:1 › an unloaded court catalogue shows no subscription count (129ms)
  ✓  250 [mobile-chromium] › tests/smoke.spec.js:5183:1 › openFilterSheet mounts a dialog with six data-filter groups and closes on Escape (138ms)
  ✓  251 [mobile-chromium] › tests/smoke.spec.js:5220:1 › the filter sheet applies a district change immediately to the background drawer summary and keeps keyboard focus off body (146ms)
  ✓  252 [mobile-chromium] › tests/smoke.spec.js:5286:1 › closing and reopening the filter sheet three times does not stack delegated listeners on the shared sheet root (971ms)
  ✓  253 [mobile-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.1s)
  ✓  254 [mobile-chromium] › tests/smoke.spec.js:5359:1 › the filter sheet traps Tab focus between its own first and last controls (185ms)

  4 skipped
  250 passed (2.2m)
```

同一命令的 unit 段為 246/246；`pretest:mock` 的 typecheck 先通過。

### `npm run test:local`

結尾輸出逐字（exit 0）：

```text
  ✓  41 [supabase-chromium] › tests/session.spec.js:1535:1 › a session deep link survives the auth restore that lands after the sheet opened (2.0s)
  ✓  42 [supabase-chromium] › tests/session.spec.js:1566:1 › accepted members exchange escaped chat, manage blocks, and retain archived read-only history (3.6s)
  ✓  43 [supabase-chromium] › tests/session.spec.js:1689:1 › a new chat message raises the recipient's unread badge and nav dot, and opening chat clears both against the real database (1.4s)
  ✓  44 [supabase-chromium] › tests/session.spec.js:1764:1 › blocking a sender drops their messages from both the unread count and the visible chat feed, keeping the two in lockstep (440ms)
  ✓  45 [supabase-chromium] › tests/session.spec.js:1837:1 › the Me profile entry edits without a gate and refreshes the identity card in place (495ms)
  ✓  46 [supabase-chromium] › tests/session.spec.js:1877:1 › every Me control keeps focus through a background rerender (10.6s)
  ✓  47 [supabase-chromium] › tests/session.spec.js:1955:1 › the discovery empty-state subscribe shortcut opens Me and focuses the notification settings heading on real auth (1.1s)
  ✓  48 [supabase-chromium] › tests/session.spec.js:1987:1 › checking the last court collapses the picker without dropping focus to body (407ms)
  ✓  49 [supabase-chromium] › tests/session.spec.js:2036:1 › neutral counts stay hidden at zero and appear on all three surfaces once a session is played (2.4s)
  ✓  50 [supabase-chromium] › tests/session.spec.js:2156:1 › a brand-new account is subscribed to every active Taipei court when it first saves a profile (526ms)
  ✓  51 [supabase-chromium] › tests/session.spec.js:2180:1 › N1 an existing zero-subscription account is never seeded by a later profile save (518ms)
  ✓  52 [supabase-chromium] › tests/session.spec.js:2199:1 › N2 an account that explicitly cleared every court stays at zero across later profile saves (779ms)
  ✓  53 [supabase-chromium] › tests/session.spec.js:2226:1 › N3 a failing subscription seed never fails the profile save (507ms)

  11 skipped
  42 passed (1.4m)
```

同一命令前段 local API 為 2/2；`pretest:local` 的 typecheck 先通過。

### `npm run typecheck`、`npm run lint`、`npm run prettier:check`

完整輸出逐字（全部 exit 0）：

```text
> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit


> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{ts,tsx}" vite.config.ts


> tennis-partner-finder@0.1.0 prettier:check
> prettier --check "src/**/*.{ts,tsx}" vite.config.ts

Checking formatting...
All matched files use Prettier code style!
```

### `npm run build`

完整輸出逐字（exit 0）：

```text
> tennis-partner-finder@0.1.0 build
> vite build

vite v6.4.3 building for production...
transforming...
✓ 71 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-D3iryHT3.js   488.67 kB │ gzip: 131.75 kB
✓ built in 557ms
```

### `git diff --check`

完整輸出逐字（exit 0）：

```text
```

## 12. `git diff --stat`、白名單與 tests 稽核

tracked diff stat：

```text
 .claude/rules/testing.md     |    6 +
 CLAUDE.md                    |   12 +-
 package-lock.json            | 1996 ++++++++++++++++++++++++++++++++++++++++--
 package.json                 |   16 +-
 src/districts.js             |   60 --
 src/sessionViews.js          |    2 +-
 tests/fixtures/appRuntime.js |   10 +-
 7 files changed, 1961 insertions(+), 141 deletions(-)
```

未追蹤新檔 no-index stat：

```text
 /dev/null => eslint.config.js | 11 +++++++++++
 /dev/null => prettier.config.js | 9 +++++++++
 /dev/null => src/districts.ts | 56 +++++++++++++++++++++++++++++++++++++++++++
 /dev/null => src/domainTypes.ts | 107 ++++++++++++++++++++++++++++++++++++++++
 /dev/null => tsconfig.json | 20 ++++++++++++++++++++
 /dev/null => vite.config.ts | 6 ++++++
 /dev/null => docs/migration-reports/batch-2.md | 455 +++++++++++++++++++++++++
 1 file changed, 455 insertions(+)
```

最終 `git status --short`：

```text
 M .claude/rules/testing.md
 M CLAUDE.md
 M package-lock.json
 M package.json
 D src/districts.js
 M src/sessionViews.js
 M tests/fixtures/appRuntime.js
?? docs/migration-reports/batch-2.md
?? eslint.config.js
?? prettier.config.js
?? src/districts.ts
?? src/domainTypes.ts
?? tsconfig.json
?? vite.config.ts
```

`git diff --name-only -- tests` 與 `git status --short -- tests` 分別只有：

```text
tests/fixtures/appRuntime.js
 M tests/fixtures/appRuntime.js
```

tests 只有獲准的 appRuntime 單一定義點，沒有改其他 test 或新增測試。上述全部路徑均在
派工單白名單內；未 commit、未 push。

## §12 批 2-fix：districts 轉檔漏掃 consumer 修復

### 修復說明

批 2 的 caller sweep 錯誤地只查 `src/` 與 `tests/`，漏掉可執行 consumer
`scripts/generate-courts-seed.mjs:24`。因此批 2 原回報在未執行 seed generator 與
`npm test` 的情況下聲稱「全綠」並不成立；本節取代該聲稱。

唯一程式修復是：

```diff
-import { cityOf } from "../src/districts.js";
+import { cityOf } from "../src/districts.ts";
```

Node 22 直接載入 `districts.ts`，沒有增加 wrapper 或第二個相容入口。

### 全 repo caller sweep

掃描範圍是目前 git worktree 的 repo-owned 檔案（tracked 與未忽略的 untracked），涵蓋
hidden rules、`scripts/`、`supabase/`、`public/`、`docs/`、`src/`、`tests/`；排除
`.git`、dependencies、build/test artifacts 與另立的 ignored worktrees。以下 snapshot
在修復程式碼後、追加本節前取得，因此本節自己的 evidence 文字不會造成遞迴自命中。

`districts` sweep 命令：

```bash
rg -n --hidden --sort path --glob '!.git/**' --glob '!node_modules/**' --glob '!dist/**' --glob '!test-results/**' --glob '!playwright-report/**' 'districts'
```

完整 91 筆命中逐字：

```text
docs/migration-reports/batch-2.md:7:批 2 已完成。第一動作先把依賴面最小的 `src/districts.js` 轉成
docs/migration-reports/batch-2.md:8:`src/districts.ts`，批 0 fixture e2e 獨立 gate 15/15 全綠後，才加入
docs/migration-reports/batch-2.md:17:- 選 `src/districts.js`：純常數與一個無副作用函式、零 import、只有
docs/migration-reports/batch-2.md:28:import { TAIPEI_DISTRICTS } from "./districts.ts";
docs/migration-reports/batch-2.md:94:- `src/districts.js` → `src/districts.ts`：最小 TS 轉換；值與分支不變。
docs/migration-reports/batch-2.md:103:在只有 `districts.ts`、唯一 importer 與 appRuntime extension table 改動、尚未展開其餘
docs/migration-reports/batch-2.md:136:實際載入 `sessionViews.js → districts.ts`，沒有假綠。
docs/migration-reports/batch-2.md:140:兩組 canary 都只暫改已轉換的 `src/districts.ts`。
docs/migration-reports/batch-2.md:150:src/districts.ts(58,7): error TS2322: Type 'number' is not assignable to type 'string'.
docs/migration-reports/batch-2.md:169:/Users/ian/tennisPartnerFinder/src/districts.ts
docs/migration-reports/batch-2.md:184:前＝本批任何 src 改動前；後＝`districts.ts` 與 `domainTypes.ts` 均在位後。
docs/migration-reports/batch-2.md:194:轉檔讓 `districts.js` 的一筆換成 `districts.ts`，檔數不變；新增根層
docs/migration-reports/batch-2.md:198:src/districts.ts
docs/migration-reports/batch-2.md:288:兩組 canary 只暫改 `src/districts.ts`，前後完全一致：
docs/migration-reports/batch-2.md:292:src/districts.ts     3270bef90e252edf096885cae36d266ed4059993670ff254d0cfee5e6ea03b86  3270bef90e252edf096885cae36d266ed4059993670ff254d0cfee5e6ea03b86
docs/migration-reports/batch-2.md:409: src/districts.js             |   60 --
docs/migration-reports/batch-2.md:420: /dev/null => src/districts.ts | 56 +++++++++++++++++++++++++++++++++++++++++++
docs/migration-reports/batch-2.md:435: D src/districts.js
docs/migration-reports/batch-2.md:441:?? src/districts.ts
docs/superpowers/plans/2026-07-08-batch-1-courts-catalog.md:26:- Node script 只准 import `node:*` 與 `src/districts.js`／`src/util.js`；**禁止 import `src/config.js`**（`import.meta.env` 在 Node 下炸）。
docs/superpowers/plans/2026-07-08-batch-1-courts-catalog.md:62:- Create: `data/courts.json`（球場目錄 SoT）、`src/districts.js`（雙北行政區常數＋cityOf）、`scripts/generate-courts-seed.mjs`（產生器）、`src/courtPicker.js`（profile 選單元件）
docs/superpowers/plans/2026-07-08-batch-1-courts-catalog.md:68:### Task 1: `src/districts.js`＋`data/courts.json` 雛形（6 座）
docs/superpowers/plans/2026-07-08-batch-1-courts-catalog.md:70:**Files:** Create `src/districts.js`、`data/courts.json`
docs/superpowers/plans/2026-07-08-batch-1-courts-catalog.md:90:- [ ] **Step 1**：寫 `src/districts.js`（純常數、零 import；雙北行政區名無重複，district→city 唯一推導）：
docs/superpowers/plans/2026-07-08-batch-1-courts-catalog.md:104:- [ ] **Step 3**：驗證 `node -e "import('./src/districts.js').then(m=>console.log(m.cityOf('板橋區'), m.cityOf('大安區'), m.cityOf('X')))"` → `新北市 台北市 null`；`npm test` 全綠（零行為變更）。
docs/superpowers/plans/2026-07-08-batch-1-courts-catalog.md:116:  3. `city ∈ {台北市, 新北市}`；district 屬於該 city（用 `src/districts.js`）。
docs/superpowers/plans/2026-07-08-batch-1-courts-catalog.md:240:import { TAIPEI_DISTRICTS, NEW_TAIPEI_DISTRICTS } from "./districts.js";
docs/superpowers/plans/2026-07-08-batch-1-courts-catalog.md:280:    for (const [city, districts] of [["台北市", TAIPEI_DISTRICTS], ["新北市", NEW_TAIPEI_DISTRICTS]]) {
docs/superpowers/plans/2026-07-08-batch-1-courts-catalog.md:281:      const groups = districts
scripts/generate-courts-seed.mjs:24:import { cityOf } from "../src/districts.ts";
src/filters.js:20:// input」三組退場,district 單選改 districts 多選,新增 dateKey 列舉與 instantOnly
src/filters.js:28:  districts: new Set(),
src/filters.js:38: * the two multi-select dimensions (打法 types、行政區 districts), summed as
src/filters.js:46:  return selectedTypes(filters.types).size + selectedTypes(filters.districts).size;
src/filters.js:110:function matchesDistricts(session, districts) {
src/filters.js:111:  const chosen = selectedTypesSet(districts);
src/filters.js:146:      matchesDistricts(session, state.districts)
src/sessionController.js:17:    districts: new Set(DEFAULT_FILTER_STATE.districts),
src/sessionViews.js:2:import { TAIPEI_DISTRICTS } from "./districts.ts";
src/sessionViews.js:4333:    districts: new Set(source.districts instanceof Set ? source.districts : (source.districts ?? [])),
src/sessionViews.js:4417:                  `<button type="button" class="chip chip--district" data-filter="districts" data-value="${esc(
src/sessionViews.js:4456:    surface.querySelectorAll('[data-filter="districts"]').forEach((button) => {
src/sessionViews.js:4457:      const selected = currentFilters.districts.has(button.dataset.value);
src/sessionViews.js:4489:    } else if (field === "districts") {
src/sessionViews.js:4490:      currentFilters.districts = toggledFilterSet(currentFilters.districts, target.dataset.value);
src/sessionViews.js:4491:      onSetFilter("districts", currentFilters.districts);
supabase/migrations/202607230001_notifications_web_push.sql:245:create or replace function public.set_district_subscriptions(p_districts text[])
supabase/migrations/202607230001_notifications_web_push.sql:254:  if p_districts is null
supabase/migrations/202607230001_notifications_web_push.sql:257:      from unnest(p_districts) as requested_district(district)
supabase/migrations/202607230001_notifications_web_push.sql:272:    from unnest(p_districts) as requested_district(district)
tests/filters.test.js:15:  assert.equal(isDefaultFilters({ ...DEFAULT_FILTER_STATE, types: new Set(), districts: new Set() }), true);
tests/filters.test.js:32:  assert.equal(isDefaultFilters({ ...DEFAULT_FILTER_STATE, districts: new Set(["大安區"]) }), false);
tests/filters.test.js:42:  assert.equal(countActiveFilters({ ...DEFAULT_FILTER_STATE, types: new Set(), districts: new Set() }), 0);
tests/filters.test.js:45:// 批 D4a 拍板:badge N 只計 types+districts 選取數,不含 dateKey/band/instantOnly——
tests/filters.test.js:57:test("countActiveFilters sums selections across types and districts", () => {
tests/filters.test.js:64:      districts: new Set(["大安區"]),
tests/fixtures/appRuntime.js:2:const APP_MODULE_EXTENSIONS = Object.freeze({ districts: ".ts" });
tests/performance.spec.js:25:  await page.locator('#filters-sheet [data-filter="districts"][data-value="文山區"]').click();
tests/performance.spec.js:395:    document.querySelector('#filters-sheet [data-filter="districts"][data-value="文山區"]')?.click();
tests/session-controller.test.js:2052:  harness.controller.setFilter("districts", callerOwned);
tests/session-controller.test.js:2054:  assert.deepEqual([...harness.renders.at(-1).filters.districts], ["內湖區"]);
tests/session-controller.test.js:2057:  const firstReset = harness.renders.at(-1).filters.districts;
tests/session-controller.test.js:2062:  assert.deepEqual([...harness.renders.at(-1).filters.districts], []);
tests/session-data-boundary.test.js:744:// 批 D4a:filters.js 篩選模型改版(dateKey 列舉、districts 多選、band 開區間公式)。
tests/session-data-boundary.test.js:782:      districts: new Set(["大安區"]),
tests/session-data-boundary.test.js:790:    { dateKey: "tomorrow", band: "hi", instantOnly: false, types: new Set(), districts: new Set() },
tests/session-data-boundary.test.js:797:    { dateKey: null, band: "all", instantOnly: false, types: new Set(), districts: new Set() },
tests/session-data-boundary.test.js:826:  const base = { band: "all", dateKey: null, instantOnly: false, types: new Set(), districts: new Set() };
tests/smoke.spec.js:87:// 批 D4a:退場的 #date-filter 曾是「一鍵強制零結果」的最簡單控件。新模型下 districts
tests/smoke.spec.js:93:  await page.locator('#filters-sheet [data-filter="districts"][data-value="文山區"]').click();
tests/smoke.spec.js:188:  await expect(filterSheet.locator('[data-filter="districts"]').first()).toHaveAttribute("aria-pressed", "false");
tests/smoke.spec.js:189:  // 預設 band 就是 "all",開啟 sheet 時應已是選中態(不像 types/districts 預設全空)。
tests/smoke.spec.js:193:  await filterSheet.locator('[data-filter="districts"][data-value="內湖區"]').click();
tests/smoke.spec.js:194:  await expect(filterSheet.locator('[data-filter="districts"][data-value="內湖區"]')).toHaveAttribute("aria-pressed", "true");
tests/smoke.spec.js:199:  // 只計 types+districts 選取數(=2),不含 band,所以不是 3。
tests/smoke.spec.js:205:  await expect(filterSheet.locator('[data-filter="districts"][data-value="內湖區"]')).toHaveAttribute("aria-pressed", "false");
tests/smoke.spec.js:249:// 批 D4a:badge N 改為只計 types+districts 選取數(dc L913 拍板),dateKey/band 兩者
tests/smoke.spec.js:252:test("the filter badge counts only types+districts and mirrors dateKey/band both ways with the sheet", async ({ page }) => {
tests/smoke.spec.js:284:  await filterSheet.locator('[data-filter="districts"][data-value="內湖區"]').click();
tests/smoke.spec.js:288:  // 只有 types/districts 清空才讓 badge 消失。
tests/smoke.spec.js:289:  await filterSheet.locator('[data-filter="districts"][data-value="內湖區"]').click();
tests/smoke.spec.js:313:  await page.locator('#filters-sheet [data-filter="districts"][data-value="內湖區"]').click();
tests/smoke.spec.js:5181:// 球局」主鈕(data-filter="apply")——六組:dateKey、band、types、districts、
tests/smoke.spec.js:5193:      filters: { ...DEFAULT_FILTER_STATE, types: new Set(), districts: new Set() },
tests/smoke.spec.js:5212:  expect(new Set(fieldGroups)).toEqual(new Set(["dateKey", "band", "types", "districts", "reset", "apply"]));
tests/smoke.spec.js:5238:    let testFilters = { ...DEFAULT_FILTER_STATE, types: new Set(), districts: new Set() };
tests/smoke.spec.js:5264:  const districtChip = page.locator('#filters-sheet [data-filter="districts"][data-value="內湖區"]');
tests/smoke.spec.js:5270:    await page.evaluate(() => document.activeElement === document.querySelector('#filters-sheet [data-filter="districts"][data-value="內湖區"]'))
tests/smoke.spec.js:5299:        filters: { ...DEFAULT_FILTER_STATE, types: new Set(), districts: new Set() },
tests/smoke.spec.js:5314:  await page.locator('#filters-sheet [data-filter="districts"][data-value="內湖區"]').click();
tests/smoke.spec.js:5347:  await expect(sheet.locator('.filter-sheet-chips--district [data-filter="districts"]')).toHaveCount(12);
```

逐一判讀：兩個實際 source consumer 是 generator 與 `sessionViews.js`，均已指向
`.ts`；fixture extension table 正確；其餘是 filters 欄位、測試、SQL identifier 或歷史
文件，不是當前 module consumer。`public/` 無命中。歷史 plan 中的 `.js` 僅描述當時狀態，
不會執行。

批 2 其他改名／新增檔 sweep 命令：

```bash
rg -n --hidden --sort path --glob '!.git/**' --glob '!node_modules/**' --glob '!dist/**' --glob '!test-results/**' --glob '!playwright-report/**' 'domainTypes(?:\.ts)?|vite\.config(?:\.ts)?|tsconfig\.json|eslint\.config\.js|prettier\.config\.js'
```

完整 29 筆命中逐字：

```text
CLAUDE.md:62:- `src/domainTypes.ts`：從 data API mapper 反推的共用 domain／surface 型別。
docs/migration-reports/batch-2.md:50:- `vite.config.ts` 只掛 `react()` plugin；現有 entry 與 build 選項不變。
docs/migration-reports/batch-2.md:52:### `tsconfig.json`
docs/migration-reports/batch-2.md:65:- `eslint.config.js` 使用 flat config 與 `typescript-eslint` recommended，只套用
docs/migration-reports/batch-2.md:67:- `prettier.config.js` 固定雙引號、2 spaces、semicolon、120 columns；
docs/migration-reports/batch-2.md:76:新增 `src/domainTypes.ts`，只 export 型別、不被現有 runtime import。shape 逐欄反推
docs/migration-reports/batch-2.md:93:- `tsconfig.json`、`eslint.config.js`、`prettier.config.js`、`vite.config.ts`：工具鏈。
docs/migration-reports/batch-2.md:96:- `src/domainTypes.ts`：後續遷移用的型別-only 模組。
docs/migration-reports/batch-2.md:166:> eslint "src/**/*.{ts,tsx}" vite.config.ts
docs/migration-reports/batch-2.md:179:> eslint "src/**/*.{ts,tsx}" vite.config.ts
docs/migration-reports/batch-2.md:184:前＝本批任何 src 改動前；後＝`districts.ts` 與 `domainTypes.ts` 均在位後。
docs/migration-reports/batch-2.md:195:`domainTypes.ts` 讓三套掃描各增加一筆。最終實掃 TS 清單逐字：
docs/migration-reports/batch-2.md:199:src/domainTypes.ts
docs/migration-reports/batch-2.md:259:+- `src/domainTypes.ts`：從 data API mapper 反推的共用 domain／surface 型別。
docs/migration-reports/batch-2.md:363:> eslint "src/**/*.{ts,tsx}" vite.config.ts
docs/migration-reports/batch-2.md:367:> prettier --check "src/**/*.{ts,tsx}" vite.config.ts
docs/migration-reports/batch-2.md:418: /dev/null => eslint.config.js | 11 +++++++++++
docs/migration-reports/batch-2.md:419: /dev/null => prettier.config.js | 9 +++++++++
docs/migration-reports/batch-2.md:421: /dev/null => src/domainTypes.ts | 107 ++++++++++++++++++++++++++++++++++++++++
docs/migration-reports/batch-2.md:422: /dev/null => tsconfig.json | 20 ++++++++++++++++++++
docs/migration-reports/batch-2.md:423: /dev/null => vite.config.ts | 6 ++++++
docs/migration-reports/batch-2.md:439:?? eslint.config.js
docs/migration-reports/batch-2.md:440:?? prettier.config.js
docs/migration-reports/batch-2.md:442:?? src/domainTypes.ts
docs/migration-reports/batch-2.md:443:?? tsconfig.json
docs/migration-reports/batch-2.md:444:?? vite.config.ts
package.json:20:    "lint": "eslint \"src/**/*.{ts,tsx}\" vite.config.ts",
package.json:21:    "prettier:check": "prettier --check \"src/**/*.{ts,tsx}\" vite.config.ts",
tsconfig.json:19:  "include": ["src/**/*.js", "src/**/*.ts", "src/**/*.tsx", "vite.config.ts"]
```

判讀：`domainTypes.ts` 是刻意沒有 runtime consumer 的 type-only 契約；Vite 自動發現
`vite.config.ts`，package scripts 與 tsconfig 已涵蓋它；tsconfig、ESLint 與 Prettier
config 的其餘命中都是 scripts 或文件。沒有第二個搬檔後仍引用舊檔名的 executable。

另跑 executable-only stale specifier sweep：

```bash
rg -n --hidden --sort path --glob '!.git/**' --glob '!node_modules/**' --glob '!dist/**' --glob '!test-results/**' --glob '!playwright-report/**' --glob '*.{js,mjs,cjs,jsx,ts,tsx}' '(?:from|import\()[^\n]*districts\.js'
```

完整輸出為空（exit 1＝零命中）。

### Gate 1：seed generator

`node scripts/generate-courts-seed.mjs --check` 逐字結尾（exit 0）：

```text
--check 通過:產出檔案與 data/courts.json 重生結果一致。
```

### Gate 2：完整 `npm test`

實際執行 `npm test`，僅用 output filter 保留 lifecycle 與摘要；`set -o pipefail` 確保
upstream `npm test` 任一失敗會使整條命令失敗。逐字證據（exit 0）：

```text
> tennis-partner-finder@0.1.0 pretest
> node scripts/generate-courts-seed.mjs --check
--check 通過:產出檔案與 data/courts.json 重生結果一致。
> tennis-partner-finder@0.1.0 test
> npm run test:mock
> tennis-partner-finder@0.1.0 pretest:mock
> npm run typecheck
> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit
> tennis-partner-finder@0.1.0 test:mock
> npm run test:session-unit && TENNIS_TEST_HARNESS_MODE=mock playwright test --project=desktop-chromium --project=mobile-chromium
> tennis-partner-finder@0.1.0 test:session-unit
> node --test tests/session-controller.test.js tests/session-create-form.test.js tests/session-data-boundary.test.js tests/session-route.test.js tests/local-supabase-config.test.js tests/notification-data-api.test.js tests/notification-dispatch.test.js tests/notification-push.test.js tests/player-presence.test.js tests/me-focus.test.js tests/contrast-tokens.test.js tests/legacy-style-scan.test.js tests/public-brand-scan.test.js tests/reset-local-test-db.test.js tests/filters.test.js
1..246
# tests 246
# suites 0
# pass 246
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1853.35975
Running 254 tests using 1 worker
  4 skipped
  250 passed (2.2m)
```

### Fix-scope `git diff --stat`

批 2-fix 開工前 `batch-2.md` 已是 455 行未追蹤檔；本節從第 456 行起純追加。
tracked code stat 與 report append-only stat：

```text
 scripts/generate-courts-seed.mjs | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
 /dev/fd/11 => docs/migration-reports/batch-2.md | 241 ++++++++++++++++++++++++
 1 file changed, 241 insertions(+)
```

對照開工前後 status，唯一新增 tracked change 是
`scripts/generate-courts-seed.mjs`；另一個變動是原已未追蹤的
`docs/migration-reports/batch-2.md` 追加本節。兩者都在批 2-fix 白名單，其餘 batch 2
worktree 內容未碰。未 commit、未 push。
