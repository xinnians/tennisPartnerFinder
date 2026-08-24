# F0-9 補件（G-1）執行回報

- 日期：2026-08-24
- 派工單：`docs/arch-dispatch-2026-08-24-frontend-F0-9-followup.md`
- 開工 HEAD：`a3dac96`
- 實作 HEAD：`e7f7056`
- 分支：`claude/tennis-partner-finder-proto-xfrr6g`

## 1. 結論

[已驗證] G-1 已補完。`react-dom` 的 default import 與動態 import 現在都由
`no-restricted-syntax` 擋下，且同一組共用 selector 同時套用於一般 `src/**` 與
`src/data/**`／`src/dataApi.js` 兩個 flat-config block。

[已驗證] 既有具名 `flushSync` import、namespace import、三 caller allowlist 守門均未退化。
七個 canary 全部先紅、還原後回綠；完整 frontend gate 為 Node 285/285、Playwright
268 passed／4 skipped，production bundle guard 通過。

[已驗證] 最終實作只修改 `eslint.config.js`；沒有修改任何 `src/` 實作、
`src/syncCommit.ts`、測試或 allowlist 邏輯。

## 2. Commit 清單

```text
e7f7056 fix(arch-F0-9): close react-dom import bypasses
 eslint.config.js | 22 ++++++++++++++++------
 1 file changed, 16 insertions(+), 6 deletions(-)
```

本回報檔依派工要求不列入實作 commit，且未 push。

## 3. 修改檔案

- `eslint.config.js`：把 namespace、default、dynamic 三種 `react-dom` 語法限制整理成
  `reactDomSyntaxRestrictions` 共用陣列，並在一般 source 與 data source 兩個
  `no-restricted-syntax` rule array 中展開。

實際落點：

```text
$ rg -n 'reactDomSyntaxRestrictions|ImportDefaultSpecifier|ImportExpression\[source.value="react-dom"\]|no-restricted-syntax' eslint.config.js
12:const reactDomSyntaxRestrictions = [
18:    selector: 'ImportDeclaration[source.value="react-dom"] ImportDefaultSpecifier',
22:    selector: 'ImportExpression[source.value="react-dom"]',
138:      "no-restricted-syntax": [
140:        ...reactDomSyntaxRestrictions,
158:      "no-restricted-syntax": ["error", ...reactDomSyntaxRestrictions],
```

[已驗證] selector 使用精確的 `source.value="react-dom"`，不會涵蓋
`react-dom/client`。

## 4. 驗收 1：四個新增 canary

四個 canary 都是暫時注入，紅燈採證後立即以反向 patch 還原；沒有進入 commit。

### 4.1 一般 `src/`：default import

暫時注入 `src/sessionSelectors.ts`：

```ts
import ReactDOM from "react-dom";

export function f09DefaultImportCanary(fn: () => void): void {
  ReactDOM.flushSync(fn);
}
```

紅燈完整輸出：

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts


/Users/ian/tennisPartnerFinder/src/sessionSelectors.ts
  1:8  error  禁止 default 匯入 react-dom；請使用核可的具名匯入，並由 syncCommit.ts 呼叫同步 commit。  no-restricted-syntax

✖ 1 problem (1 error, 0 warnings)

EXIT=1
```

還原後綠燈完整輸出：

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

EXIT=0
```

### 4.2 data 範圍：default import

暫時注入 `src/dataApi.js`：

```js
import ReactDOM from "react-dom";

export function f09DataDefaultImportCanary(fn) {
  ReactDOM.flushSync(fn);
}
```

紅燈完整輸出：

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts


/Users/ian/tennisPartnerFinder/src/dataApi.js
  1:8  error  禁止 default 匯入 react-dom；請使用核可的具名匯入，並由 syncCommit.ts 呼叫同步 commit。  no-restricted-syntax

✖ 1 problem (1 error, 0 warnings)

EXIT=1
```

還原後綠燈完整輸出：

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

EXIT=0
```

### 4.3 一般 `src/`：動態 import

暫時注入 `src/sessionSelectors.ts`：

```ts
export async function f09DynamicImportCanary(fn: () => void): Promise<void> {
  const reactDom = await import("react-dom");
  reactDom.flushSync(fn);
}
```

紅燈完整輸出：

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts


/Users/ian/tennisPartnerFinder/src/sessionSelectors.ts
  11:26  error  禁止動態匯入 react-dom；請使用核可的靜態具名匯入，並由 syncCommit.ts 呼叫同步 commit。  no-restricted-syntax

✖ 1 problem (1 error, 0 warnings)

EXIT=1
```

還原後綠燈完整輸出：

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

EXIT=0
```

### 4.4 data 範圍：動態 import

暫時注入 `src/dataApi.js`：

```js
export async function f09DataDynamicImportCanary(fn) {
  const reactDom = await import("react-dom");
  reactDom.flushSync(fn);
}
```

紅燈完整輸出：

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts


/Users/ian/tennisPartnerFinder/src/dataApi.js
  4:26  error  禁止動態匯入 react-dom；請使用核可的靜態具名匯入，並由 syncCommit.ts 呼叫同步 commit。  no-restricted-syntax

✖ 1 problem (1 error, 0 warnings)

EXIT=1
```

還原後綠燈完整輸出：

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

EXIT=0
```

[已驗證] 四個錯誤各自只由本次預期的 `no-restricted-syntax` selector 產生；一般與 data
兩個 flat-config 範圍都實際命中。

## 5. 驗收 2：既有三條 canary 不退化

### 5.1 具名 import

暫時注入 `src/sessionSelectors.ts`：

```ts
import { flushSync } from "react-dom";

export function f09NamedImportCanary(fn: () => void): void {
  flushSync(fn);
}
```

紅燈完整輸出：

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts


/Users/ian/tennisPartnerFinder/src/sessionSelectors.ts
  1:10  error  'flushSync' import from 'react-dom' is restricted. 禁止直接匯入 flushSync；請改由 syncCommit.ts 的單一同步 commit 邊界呼叫。  no-restricted-imports

✖ 1 problem (1 error, 0 warnings)

EXIT=1
```

還原後：

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

EXIT=0
```

### 5.2 namespace import

暫時注入 `src/sessionSelectors.ts`：

```ts
import * as ReactDOM from "react-dom";

export function f09NamespaceImportCanary(fn: () => void): void {
  ReactDOM.flushSync(fn);
}
```

紅燈完整輸出：

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts


/Users/ian/tennisPartnerFinder/src/sessionSelectors.ts
  1:8  error  * import is invalid because 'flushSync' from 'react-dom' is restricted. 禁止直接匯入 flushSync；請改由 syncCommit.ts 的單一同步 commit 邊界呼叫。  no-restricted-imports
  1:8  error  禁止 namespace 匯入 react-dom；請使用核可的具名匯入，並由 syncCommit.ts 呼叫同步 commit。                                                             no-restricted-syntax

✖ 2 problems (2 errors, 0 warnings)

EXIT=1
```

還原後：

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

EXIT=0
```

### 5.3 allowlist 加一個 caller

暫時注入 `src/sessionSelectors.ts`：

```ts
import { syncCommit } from "./syncCommit.ts";

export function f09AllowlistCanary(fn: () => void): void {
  syncCommit(fn);
}
```

紅燈完整輸出：

```text
$ node --test tests/react-surface-lifecycle.test.js
TAP version 13
# Subtest: all 14 React sheet adapters register tracked SurfaceHost portal content
ok 1 - all 14 React sheet adapters register tracked SurfaceHost portal content
  ---
  duration_ms: 2.102
  type: 'test'
  ...
# Subtest: synchronous React commits stay behind one fail-closed helper and three approved callers
not ok 2 - synchronous React commits stay behind one fail-closed helper and three approved callers
  ---
  duration_ms: 11.673458
  type: 'test'
  location: '/Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:68:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected

      [
        'app/App.tsx',
        'app/SurfaceHost.tsx',
    +   'sessionSelectors.ts',
        'sessionStore.ts'
      ]

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    0: 'app/App.tsx'
    1: 'app/SurfaceHost.tsx'
    2: 'sessionStore.ts'
  actual:
    0: 'app/App.tsx'
    1: 'app/SurfaceHost.tsx'
    2: 'sessionSelectors.ts'
    3: 'sessionStore.ts'
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:89:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
  ...
# Subtest: non-home pages and sheets stay behind explicit preloadable module boundaries
ok 3 - non-home pages and sheets stay behind explicit preloadable module boundaries
  ---
  duration_ms: 0.255958
  type: 'test'
  ...
# Subtest: surface close unmounts React before clearing DOM and remains idempotent
ok 4 - surface close unmounts React before clearing DOM and remains idempotent
  ---
  duration_ms: 0.068833
  type: 'test'
  ...
# Subtest: Session Detail blocks both direct and async commits after its surface dies
ok 5 - Session Detail blocks both direct and async commits after its surface dies
  ---
  duration_ms: 0.403042
  type: 'test'
  ...
1..5
# tests 5
# suites 0
# pass 4
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 57.570292
EXIT=1
```

還原後綠燈完整輸出：

```text
$ node --test tests/react-surface-lifecycle.test.js
TAP version 13
# Subtest: all 14 React sheet adapters register tracked SurfaceHost portal content
ok 1 - all 14 React sheet adapters register tracked SurfaceHost portal content
  ---
  duration_ms: 2.096583
  type: 'test'
  ...
# Subtest: synchronous React commits stay behind one fail-closed helper and three approved callers
ok 2 - synchronous React commits stay behind one fail-closed helper and three approved callers
  ---
  duration_ms: 11.238417
  type: 'test'
  ...
# Subtest: non-home pages and sheets stay behind explicit preloadable module boundaries
ok 3 - non-home pages and sheets stay behind explicit preloadable module boundaries
  ---
  duration_ms: 0.263667
  type: 'test'
  ...
# Subtest: surface close unmounts React before clearing DOM and remains idempotent
ok 4 - surface close unmounts React before clearing DOM and remains idempotent
  ---
  duration_ms: 0.068375
  type: 'test'
  ...
# Subtest: Session Detail blocks both direct and async commits after its surface dies
ok 5 - Session Detail blocks both direct and async commits after its surface dies
  ---
  duration_ms: 0.423584
  type: 'test'
  ...
1..5
# tests 5
# suites 0
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 57.45275
EXIT=0
```

[已驗證] allowlist 邏輯未修改；canary 仍以實際 caller 檔案集合多出
`sessionSelectors.ts` 的精確差異失敗。

## 6. 驗收 3：核可 React DOM import 不受影響

存量完整 import 面：

```text
$ rg -n 'from "react-dom(?:/client)?"|import\("react-dom"\)' src --glob '*.{js,ts,tsx}'
src/syncCommit.ts:1:import { flushSync as reactDomFlushSync } from "react-dom";
src/app/SurfaceHost.tsx:2:import { createPortal } from "react-dom";
src/app/App.tsx:2:import { createPortal } from "react-dom";
src/app/App.tsx:3:import { createRoot, type Root } from "react-dom/client";
```

基準 lint：

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

EXIT=0
```

[已驗證] `createPortal` 的核可具名 import、`react-dom/client` 的 `createRoot`，以及唯一豁免
`src/syncCommit.ts` 都維持綠燈，沒有新增 disable 註記。

## 7. 驗收 4：全部 canary 還原與 worktree

commit 後、完整 gate 後各檢查一次 tracked worktree；輸出皆空。最終輸出：

```text
$ git status --porcelain --untracked-files=no
TRACKED_STATUS_BEGIN
TRACKED_STATUS_END
```

[已驗證] 沒有 canary 殘留。完整 `git status --short` 只列出原有、依派工流程保持
untracked 的三份輸入／前次回報文件；本回報建立後會再多本回報一份：

```text
?? docs/arch-dispatch-2026-08-24-frontend-F0-9-followup.md
?? docs/arch-dispatch-2026-08-24-frontend-F0-9-report-codex.md
?? docs/arch-reports/batch-F0-9-acceptance-2026-08-24.md
```

## 8. 驗收 5：完整 frontend gate 與 diff 檢查

完整命令無並發執行：

```text
$ npm run test:ci:frontend

> tennis-partner-finder@0.1.0 test:ci:frontend
> node scripts/generate-courts-seed.mjs --check && npm run typecheck && npm run lint && npm run prettier:check && npm run test:mock && npm run build && npm run check:production-bundle && git diff --check

--check 通過:產出檔案與 data/courts.json 重生結果一致。

> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

> tennis-partner-finder@0.1.0 prettier:check
> prettier --check "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts package.json package-lock.json tsconfig.json vercel.json

Checking formatting...
All matched files use Prettier code style!

... Node 測試尾段 ...
1..280
# tests 285
# suites 0
# pass 285
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2129.993208

... Playwright 尾段 ...
  4 skipped
  268 passed (2.4m)

> tennis-partner-finder@0.1.0 build
> vite build

vite v6.4.3 building for production...
transforming...
✓ 150 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                             11.73 kB │ gzip:   3.53 kB
dist/assets/index-CgKsGA-d.css                              65.39 kB │ gzip:  10.76 kB
dist/assets/SessionUnavailableSheet-LgfPhPwE.js              0.77 kB │ gzip:   0.48 kB
dist/assets/CourtSessionSheet-BoxlIXdO.js                    0.98 kB │ gzip:   0.57 kB
dist/assets/WithdrawSessionConfirmationDialog-B4PNZXNV.js    1.11 kB │ gzip:   0.56 kB
dist/assets/CourtPlayersSheet-CJOVcUwH.js                    1.32 kB │ gzip:   0.71 kB
dist/assets/ReportDialog-Dd2rOU-2.js                         1.34 kB │ gzip:   0.68 kB
dist/assets/MessagesPage-BjDI72H5.js                         1.81 kB │ gzip:   0.92 kB
dist/assets/index-Zt4BwSlo.js                                1.93 kB │ gzip:   0.95 kB
dist/assets/DecideSessionSheet-BsoRB2LX.js                   2.40 kB │ gzip:   1.20 kB
dist/assets/PlayerDirectorySheet-BCB8CjM6.js                 3.77 kB │ gzip:   1.56 kB
dist/assets/ProfileCompletionSheet-CCci3ASM.js               4.44 kB │ gzip:   1.80 kB
dist/assets/FilterSheet-Q2Y1_uOd.js                          4.70 kB │ gzip:   1.76 kB
dist/assets/PlayerCardSheet-DTvl--cC.js                      5.23 kB │ gzip:   2.11 kB
dist/assets/SessionChatSheet-DnG4ZYGu.js                     5.28 kB │ gzip:   2.08 kB
dist/assets/EditSessionSheet-hT058pQg.js                     5.47 kB │ gzip:   2.10 kB
dist/assets/CreateSessionSheet-SbCjsRzq.js                  15.23 kB │ gzip:   4.54 kB
dist/assets/MePage-oxu7Jx1v.js                              15.79 kB │ gzip:   4.96 kB
dist/assets/MySessionsPage-CwPyVfCB.js                      16.81 kB │ gzip:   4.90 kB
dist/assets/index-lA-YypXZ.js                              632.76 kB │ gzip: 184.22 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 907ms

> tennis-partner-finder@0.1.0 check:production-bundle
> node scripts/check-production-bundle.mjs

production bundle check passed: 28 files, 12 demo identifiers absent; main chunk 632764/184215 bytes within 703886/203176
EXIT=0
```

獨立最終檢查：

```text
$ git diff --check
（空輸出）
EXIT=0
```

[已驗證] frontend CI 內含 typecheck、lint、Prettier、Node、desktop/mobile Chromium、build、
production bundle 與 `git diff --check`，全數完成且退出碼為 0。

## 9. 守門測試調整

[已驗證] 沒有修改任何測試，也沒有修改 `tests/react-surface-lifecycle.test.js` 的 allowlist
判斷邏輯或計數。唯一守門變因是 ESLint 新增兩個 selector，並把三個 React DOM selector
改為兩個 flat-config block 共用的陣列。

## 10. 範圍與未做事項

- [已驗證] 未改母派工單 `docs/arch-dispatch-2026-08-22-frontend.md`。
- [已驗證] 未改任何 `src/` 實作、`src/syncCommit.ts`、testid、文案、DOM 或 e2e 斷言。
  canary 對 `src/sessionSelectors.ts`／`src/dataApi.js` 的變更都只存在於暫時工作樹，且已還原。
- [已驗證] 未處理批 1 驗收觀察、`drawerScrollPositions` 或 `react-dom` 以外的模組邊界。
- [已驗證] 未跑 `npm run test:local`、`npm run test:db`：本補件零 data／migration 變更，且
  派工單明示沿用不跑。
- [已驗證] 未跑 WebKit：依派工單為非阻擋 job。
- [已驗證] 未 push。
- [不確定] 無。

