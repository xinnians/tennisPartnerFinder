# F0-9 執行回報：同步 commit 邊界收斂＋守門

- 日期：2026-08-24
- 派工單：`docs/arch-dispatch-2026-08-24-frontend-F0-9.md`
- 派工基準：`25ab143`
- 開工時 HEAD：`af78a2e`（只比 `25ab143` 多母派工條件註記與本派工單，無 source 變更）
- 實作 HEAD：`a3dac96`
- 分支：`claude/tennis-partner-finder-proto-xfrr6g`
- 結論：[已驗證] 三個既有同步 commit 呼叫時機已收斂到單一葉子 helper；ESLint 與 fail-closed caller allowlist 均有獨立 canary；frontend gate 全綠。
- 限制：[已驗證] 本項沒有減少同步 commit 的必要時機，也沒有宣稱相容層縮小；只是把 React DOM primitive 收斂為單一 choke point。
- 提交／推送：[已驗證] 程式修改已獨立 commit；本回報不列入實作 commit，未 push。

## 1. 基準與 commit

派工單本身在基準後以 docs-only commit 加入：

```text
$ git diff --name-status 25ab143 af78a2e
M	docs/arch-dispatch-2026-08-22-frontend.md
A	docs/arch-dispatch-2026-08-24-frontend-F0-9.md
```

[已驗證] 因此實作接在 `af78a2e` 後，仍是 `25ab143` 的直系後代，沒有回退或改寫 docs commit。

```text
$ git log --oneline af78a2e..HEAD
a3dac96 refactor(arch-F0-9): centralize synchronous React commits

$ git show --stat --oneline --summary a3dac96
a3dac96 refactor(arch-F0-9): centralize synchronous React commits
 eslint.config.js                      | 25 ++++++++++++++++-
 src/app/App.tsx                       |  5 ++--
 src/app/SurfaceHost.tsx               |  6 +++--
 src/sessionStore.ts                   |  4 +--
 src/sessionViews.js                   |  2 +-
 src/syncCommit.ts                     | 10 +++++++
 tests/react-surface-lifecycle.test.js | 51 +++++++++++++++++++++++++++++++----
 7 files changed, 90 insertions(+), 13 deletions(-)
 create mode 100644 src/syncCommit.ts
```

## 2. 改了什麼（完整七檔）

| 檔案 | 一句話摘要 |
| --- | --- |
| `src/syncCommit.ts` | 新增只 import `react-dom` 的 strict TypeScript 葉子 helper，集中唯一 React DOM synchronous primitive。 |
| `src/app/App.tsx` | 保留 page adapter 原函式、位置與註解，只把 `flushSync(renderApp)` 換成 `syncCommit(renderApp)`。 |
| `src/app/SurfaceHost.tsx` | 保留 sheet imperative adapter 的 wrapper、時機與註解，只把 `flushSync(update)` 換成 `syncCommit(update)`。 |
| `src/sessionStore.ts` | 保留 external-store listener 的條件、before callback 與註解，只把 `flushSync(listener)` 換成 `syncCommit(listener)`。 |
| `src/sessionViews.js` | 只把一行註解的 identifier 字面 `flushSync commit` 改成 `synchronous commit`，使 literal grep 真正只命中 choke point；沒有動 `import.meta.glob` 或行為。 |
| `eslint.config.js` | 禁止 helper 以外的 `flushSync` 具名／namespace 匯入，並用互斥 flat-config ranges 保留既有 data facade 邊界。 |
| `tests/react-surface-lifecycle.test.js` | 在既有測試檔加入非空遞迴 source scan、葉子 helper 錨點與三 caller 精確 allowlist；同步調整舊 SurfaceHost primitive 計數斷言。 |

選擇沿用既有 `tests/react-surface-lifecycle.test.js`，因此沒有新增 `tests/*.test.js`，也不需修改 `package.json` 的 `test:session-unit`。

## 3. A：收斂本身

### A1. `flushSync` literal 只剩單一模組一行

前：

```text
$ git grep -n 'flushSync' af78a2e -- src
af78a2e:src/app/App.tsx:2:import { createPortal, flushSync } from "react-dom";
af78a2e:src/app/App.tsx:339:  flushSync(renderApp);
af78a2e:src/app/SurfaceHost.tsx:2:import { createPortal, flushSync } from "react-dom";
af78a2e:src/app/SurfaceHost.tsx:57:  flushSync(update);
af78a2e:src/sessionStore.ts:2:import { flushSync } from "react-dom";
af78a2e:src/sessionStore.ts:102:            flushSync(listener);
af78a2e:src/sessionViews.js:745:      // flushSync commit, so any focus-induced browser scroll is corrected last.
```

後：

```text
$ grep -rn 'flushSync' src/
src/syncCommit.ts:1:import { flushSync as reactDomFlushSync } from "react-dom";
```

[已驗證] import 將 primitive alias 為 `reactDomFlushSync`，因此 literal identifier 只有 helper import 一處；實際呼叫在 `src/syncCommit.ts:9`。

### A2. `react-dom` 匯入邊界

前：

```text
$ git grep -n 'from "react-dom"' af78a2e -- src
af78a2e:src/app/App.tsx:2:import { createPortal, flushSync } from "react-dom";
af78a2e:src/app/SurfaceHost.tsx:2:import { createPortal, flushSync } from "react-dom";
af78a2e:src/sessionStore.ts:2:import { flushSync } from "react-dom";
```

後：

```text
$ grep -rn 'from "react-dom"' src/
src/app/App.tsx:2:import { createPortal } from "react-dom";
src/app/SurfaceHost.tsx:2:import { createPortal } from "react-dom";
src/syncCommit.ts:1:import { flushSync as reactDomFlushSync } from "react-dom";
```

[已驗證] `App.tsx`／`SurfaceHost.tsx` 只留 `createPortal`；只有 `syncCommit.ts` 匯入 `flushSync`。

### A3. 三 caller 時機與參數不變

```text
$ git diff af78a2e HEAD -- src/app/App.tsx src/app/SurfaceHost.tsx src/sessionStore.ts
@@ src/app/App.tsx
-import { createPortal, flushSync } from "react-dom";
+import { createPortal } from "react-dom";
+import { syncCommit } from "../syncCommit.ts";
...
 function commitPageAdapterSynchronously(): void {
-  flushSync(renderApp);
+  syncCommit(renderApp);
 }

@@ src/app/SurfaceHost.tsx
-import { createPortal, flushSync } from "react-dom";
+import { createPortal } from "react-dom";
+import { syncCommit } from "../syncCommit.ts";
...
 function commitSynchronously(update: () => void): void {
-  flushSync(update);
+  syncCommit(update);
 }

@@ src/sessionStore.ts
-import { flushSync } from "react-dom";
+import { syncCommit } from "./syncCommit.ts";
...
-            flushSync(listener);
+            syncCommit(listener);
```

[已驗證] 三處只替換 import／callee；函式、條件、位置、傳入的 `renderApp`／`update`／`listener` 與呼叫順序均未變。
[已驗證] `App.tsx:331-340` 的 page adapter 說明、`SurfaceHost.tsx:56-59` 的 imperative sheet 說明、`sessionStore.ts:98-102` 的 external-store/e2e 說明均保留原語意；`syncCommit.ts:3-9` 另補 choke point 總說明。

```text
$ grep -rn 'syncCommit(' src/
src/app/App.tsx:340:  syncCommit(renderApp);
src/app/SurfaceHost.tsx:59:  syncCommit(update);
src/sessionStore.ts:102:            syncCommit(listener);
src/syncCommit.ts:8:export function syncCommit(update: () => void): void {
```

## 4. B：ESLint 守門與 canary

### B1. Flat-config 範圍

- [已驗證] `eslint.config.js:6-15` 定義 `flushSync` import restriction 及 namespace selector。
- [已驗證] `eslint.config.js:94-142` 對非 data、非 helper source 同時保留既有 data facade 規則與新同步 commit 規則。
- [已驗證] `eslint.config.js:143-150` 對原本豁免 data facade 規則的 `src/data/**`／`src/dataApi.js` 仍套用同步 commit 規則。
- [推論] 讓兩個 range 互斥可避免 ESLint flat config 的同名 rule array 互相覆寫；`src/syncCommit.ts` 是唯一豁免，靜態測試另鎖它只能 import `react-dom`。

### B2. 具名匯入 canary

暫時在非豁免 `src/sessionPresentation.ts` 加：

```ts
import { flushSync } from "react-dom";
void flushSync;
```

指令與完整紅燈輸出：

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

/Users/ian/tennisPartnerFinder/src/sessionPresentation.ts
  1:10  error  'flushSync' import from 'react-dom' is restricted. 禁止直接匯入 flushSync；請改由 syncCommit.ts 的單一同步 commit 邊界呼叫。  no-restricted-imports

✖ 1 problem (1 error, 0 warnings)
```

還原後完整綠燈輸出：

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

（exit 0，無 lint 診斷）
```

### B3. Namespace 匯入 canary

暫時加入派工指定形狀：

```ts
import * as ReactDOM from "react-dom";
ReactDOM.flushSync(() => {});
```

指令與完整紅燈輸出：

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

/Users/ian/tennisPartnerFinder/src/sessionPresentation.ts
  1:8  error  * import is invalid because 'flushSync' from 'react-dom' is restricted. 禁止直接匯入 flushSync；請改由 syncCommit.ts 的單一同步 commit 邊界呼叫。  no-restricted-imports
  1:8  error  禁止 namespace 匯入 react-dom；請使用核可的具名匯入，並由 syncCommit.ts 呼叫同步 commit。                                                             no-restricted-syntax

✖ 2 problems (2 errors, 0 warnings)
```

[已驗證] namespace 路徑擋得住；`no-restricted-imports` 本身已紅，companion `no-restricted-syntax` 也獨立紅。

還原後：

```text
$ npm run lint && git diff --quiet -- src/sessionPresentation.ts

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

（exit 0；目標檔 diff 亦為 exit 0）
```

## 5. C：caller allowlist 守門與三個 canary

### C1. 守門內容

`tests/react-surface-lifecycle.test.js:68-100`：

- [已驗證] 遞迴掃描 `src/` 的 `.js/.ts/.tsx`，先 assert 掃描集非空（`:69-70`）。
- [已驗證] fail-closed 錨定 `src/syncCommit.ts`，assert helper 存在、只 import `react-dom`、export 名稱及 primitive call 都存在（`:72-81`）。
- [已驗證] 呼叫檔集合逐字等於 `app/App.tsx`、`app/SurfaceHost.tsx`、`sessionStore.ts`，且 caller scan 額外 assert 非空（`:83-99`）。

### C2. Canary：加第四個 caller

只在 `src/sessionPresentation.ts` 暫加 helper import 與 `syncCommit(() => {})`。

完整紅燈輸出：

```text
TAP version 13
# Subtest: all 14 React sheet adapters register tracked SurfaceHost portal content
ok 1 - all 14 React sheet adapters register tracked SurfaceHost portal content
  ---
  duration_ms: 1.918
  type: 'test'
  ...
# Subtest: synchronous React commits stay behind one fail-closed helper and three approved callers
not ok 2 - synchronous React commits stay behind one fail-closed helper and three approved callers
  ---
  duration_ms: 11.497333
  type: 'test'
  location: '/Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:68:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected

      [
        'app/App.tsx',
        'app/SurfaceHost.tsx',
    +   'sessionPresentation.ts',
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
    2: 'sessionPresentation.ts'
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
  duration_ms: 0.288458
  type: 'test'
  ...
# Subtest: surface close unmounts React before clearing DOM and remains idempotent
ok 4 - surface close unmounts React before clearing DOM and remains idempotent
  ---
  duration_ms: 0.077708
  type: 'test'
  ...
# Subtest: Session Detail blocks both direct and async commits after its surface dies
ok 5 - Session Detail blocks both direct and async commits after its surface dies
  ---
  duration_ms: 0.43175
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
# duration_ms 55.696667
```

還原後完整綠燈輸出：

```text
TAP version 13
# Subtest: all 14 React sheet adapters register tracked SurfaceHost portal content
ok 1 - all 14 React sheet adapters register tracked SurfaceHost portal content
  ---
  duration_ms: 2.075542
  type: 'test'
  ...
# Subtest: synchronous React commits stay behind one fail-closed helper and three approved callers
ok 2 - synchronous React commits stay behind one fail-closed helper and three approved callers
  ---
  duration_ms: 10.919417
  type: 'test'
  ...
# Subtest: non-home pages and sheets stay behind explicit preloadable module boundaries
ok 3 - non-home pages and sheets stay behind explicit preloadable module boundaries
  ---
  duration_ms: 0.23875
  type: 'test'
  ...
# Subtest: surface close unmounts React before clearing DOM and remains idempotent
ok 4 - surface close unmounts React before clearing DOM and remains idempotent
  ---
  duration_ms: 0.069209
  type: 'test'
  ...
# Subtest: Session Detail blocks both direct and async commits after its surface dies
ok 5 - Session Detail blocks both direct and async commits after its surface dies
  ---
  duration_ms: 0.383
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
# duration_ms 54.289375
```

### C3. Canary：拿掉一個 caller

只把 `App.tsx` wrapper 內 `syncCommit(renderApp)` 暫改為 `renderApp()`；另外兩個 caller 不動。

完整紅燈輸出：

```text
TAP version 13
# Subtest: all 14 React sheet adapters register tracked SurfaceHost portal content
ok 1 - all 14 React sheet adapters register tracked SurfaceHost portal content
  ---
  duration_ms: 1.799667
  type: 'test'
  ...
# Subtest: synchronous React commits stay behind one fail-closed helper and three approved callers
not ok 2 - synchronous React commits stay behind one fail-closed helper and three approved callers
  ---
  duration_ms: 10.869667
  type: 'test'
  location: '/Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:68:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected

      [
    -   'app/App.tsx',
        'app/SurfaceHost.tsx',
        'sessionStore.ts'
      ]

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    0: 'app/App.tsx'
    1: 'app/SurfaceHost.tsx'
    2: 'sessionStore.ts'
  actual:
    0: 'app/SurfaceHost.tsx'
    1: 'sessionStore.ts'
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
  duration_ms: 0.247583
  type: 'test'
  ...
# Subtest: surface close unmounts React before clearing DOM and remains idempotent
ok 4 - surface close unmounts React before clearing DOM and remains idempotent
  ---
  duration_ms: 0.103792
  type: 'test'
  ...
# Subtest: Session Detail blocks both direct and async commits after its surface dies
ok 5 - Session Detail blocks both direct and async commits after its surface dies
  ---
  duration_ms: 0.370375
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
# duration_ms 53.928083
```

還原後完整綠燈輸出：

```text
TAP version 13
# Subtest: all 14 React sheet adapters register tracked SurfaceHost portal content
ok 1 - all 14 React sheet adapters register tracked SurfaceHost portal content
  ---
  duration_ms: 1.736417
  type: 'test'
  ...
# Subtest: synchronous React commits stay behind one fail-closed helper and three approved callers
ok 2 - synchronous React commits stay behind one fail-closed helper and three approved callers
  ---
  duration_ms: 10.320333
  type: 'test'
  ...
# Subtest: non-home pages and sheets stay behind explicit preloadable module boundaries
ok 3 - non-home pages and sheets stay behind explicit preloadable module boundaries
  ---
  duration_ms: 0.268167
  type: 'test'
  ...
# Subtest: surface close unmounts React before clearing DOM and remains idempotent
ok 4 - surface close unmounts React before clearing DOM and remains idempotent
  ---
  duration_ms: 0.071667
  type: 'test'
  ...
# Subtest: Session Detail blocks both direct and async commits after its surface dies
ok 5 - Session Detail blocks both direct and async commits after its surface dies
  ---
  duration_ms: 0.4375
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
# duration_ms 57.385208
```

### C4. Canary：fail-closed helper rename

只把 helper export 暫改成 `renamedSyncCommit`，路徑及 caller 不動。

完整紅燈輸出：

```text
TAP version 13
# Subtest: all 14 React sheet adapters register tracked SurfaceHost portal content
ok 1 - all 14 React sheet adapters register tracked SurfaceHost portal content
  ---
  duration_ms: 2.173916
  type: 'test'
  ...
# Subtest: synchronous React commits stay behind one fail-closed helper and three approved callers
not ok 2 - synchronous React commits stay behind one fail-closed helper and three approved callers
  ---
  duration_ms: 4.301375
  type: 'test'
  location: '/Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:68:1'
  failureType: 'testCodeFailure'
  error: |-
    The input did not match the regular expression /export function syncCommit\(update: \(\) => void\): void \{/. Input:

    'import { flushSync as reactDomFlushSync } from "react-dom";\n' +
      '\n' +
      '/**\n' +
      ' * Compatibility choke point for imperative adapters that must observe committed\n' +
      ' * React DOM before returning. Callers retain responsibility for deciding when a\n' +
      ' * synchronous commit is required; this leaf only centralizes the React DOM primitive.\n' +
      ' */\n' +
      'export function renamedSyncCommit(update: () => void): void {\n' +
      '  reactDomFlushSync(update);\n' +
      '}\n'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
  actual: |-
    import { flushSync as reactDomFlushSync } from "react-dom";

    /**
     * Compatibility choke point for imperative adapters that must observe committed
     * React DOM before returning. Callers retain responsibility for deciding when a
     * synchronous commit is required; this leaf only centralizes the React DOM primitive.
     */
    export function renamedSyncCommit(update: () => void): void {
      reactDomFlushSync(update);
    }

  operator: 'match'
  stack: |-
    TestContext.<anonymous> (file:///Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:80:10)
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
  duration_ms: 0.26675
  type: 'test'
  ...
# Subtest: surface close unmounts React before clearing DOM and remains idempotent
ok 4 - surface close unmounts React before clearing DOM and remains idempotent
  ---
  duration_ms: 0.070792
  type: 'test'
  ...
# Subtest: Session Detail blocks both direct and async commits after its surface dies
ok 5 - Session Detail blocks both direct and async commits after its surface dies
  ---
  duration_ms: 0.363334
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
# duration_ms 48.640083
```

[已驗證] 錯誤直接指出缺少 `export function syncCommit(...)`，不是空集合靜默通過。

還原後完整綠燈輸出：

```text
TAP version 13
# Subtest: all 14 React sheet adapters register tracked SurfaceHost portal content
ok 1 - all 14 React sheet adapters register tracked SurfaceHost portal content
  ---
  duration_ms: 1.785167
  type: 'test'
  ...
# Subtest: synchronous React commits stay behind one fail-closed helper and three approved callers
ok 2 - synchronous React commits stay behind one fail-closed helper and three approved callers
  ---
  duration_ms: 10.280375
  type: 'test'
  ...
# Subtest: non-home pages and sheets stay behind explicit preloadable module boundaries
ok 3 - non-home pages and sheets stay behind explicit preloadable module boundaries
  ---
  duration_ms: 0.238417
  type: 'test'
  ...
# Subtest: surface close unmounts React before clearing DOM and remains idempotent
ok 4 - surface close unmounts React before clearing DOM and remains idempotent
  ---
  duration_ms: 0.0665
  type: 'test'
  ...
# Subtest: Session Detail blocks both direct and async commits after its surface dies
ok 5 - Session Detail blocks both direct and async commits after its surface dies
  ---
  duration_ms: 0.38775
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
# duration_ms 52.67625
```

## 6. D：行為零變化證據

### D1. GOLDEN 124 筆未動

```text
$ git diff 0be31a2 HEAD -- tests/session-controller-sequence.test.js
diff --git a/tests/session-controller-sequence.test.js b/tests/session-controller-sequence.test.js
index 1e96557..f5bdc4a 100644
--- a/tests/session-controller-sequence.test.js
+++ b/tests/session-controller-sequence.test.js
@@ -347,7 +347,8 @@ async function driveSequence() {
 }

 /**
- * 自 2026-08-19 工作樹錄製後逐字寫入。要改這張表,只有兩種正當理由:
+ * 2026-08-23 批 1 收尾恢復 2026-08-19 工作樹逐字錄製的完整 payload 表。要改這張表,
+ * 只有兩種正當理由:
  * (1) 刻意改了 controller 的派發行為,或 (2) 刻意改了本檔的腳本/指紋欄位。
  * 兩者都要在報告裡說明「哪一筆為什麼變」——不可為了讓測試變綠而重錄。
  */
```

[已驗證] 仍只有批 1 已揭露的檔頭註解 hunk；GOLDEN payload 表無 diff。

### D2. 全 `src/` testid 集合相同且掃描非空

比對腳本使用 `git ls-tree -r --name-only <ref> -- src`，先拒絕空 source file set，再從 markup 位置抽取 literal／expression `data-testid` assignments，對 `0be31a2` 與 `HEAD` 做集合差：

```bash
node --input-type=module <<'NODE'
import { execFileSync } from "node:child_process";
const refs = ["0be31a2", "HEAD"];
function filesAt(ref) {
  return execFileSync("git", ["ls-tree", "-r", "--name-only", ref, "--", "src"], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((file) => /\.(?:js|ts|tsx)$/.test(file));
}
function collect(ref) {
  const files = filesAt(ref);
  if (!files.length) throw new Error(`${ref} source scan is empty`);
  const values = new Set();
  let assignments = 0;
  for (const file of files) {
    const source = execFileSync("git", ["show", `${ref}:${file}`], { encoding: "utf8" });
    for (const match of source.matchAll(/(?:^|[\s<])data-testid\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}\n]+)\})/gm)) {
      assignments += 1;
      values.add(match[1] ?? match[2] ?? `{${match[3].trim()}}`);
    }
  }
  return { assignments, fileCount: files.length, values };
}
const before = collect(refs[0]);
const after = collect(refs[1]);
const added = [...after.values].filter((value) => !before.values.has(value)).sort();
const removed = [...before.values].filter((value) => !after.values.has(value)).sort();
console.log(`baseline source files: ${before.fileCount}`);
console.log(`HEAD source files: ${after.fileCount}`);
console.log(`baseline data-testid assignments/set: ${before.assignments}/${before.values.size}`);
console.log(`HEAD data-testid assignments/set: ${after.assignments}/${after.values.size}`);
console.log(`added: ${added.length ? added.join(", ") : "(none)"}`);
console.log(`removed: ${removed.length ? removed.join(", ") : "(none)"}`);
if (added.length || removed.length) process.exitCode = 1;
NODE
```

```text
baseline source files: 68
HEAD source files: 71
baseline data-testid assignments/set: 91/90
HEAD data-testid assignments/set: 91/90
added: (none)
removed: (none)
```

[已驗證] 兩側掃描集均非空，testid assignment 數與集合大小完全相同。

### D3. 五個凍結 e2e 檔零修改

```text
$ git diff --stat 25ab143 HEAD -- tests/smoke.spec.js tests/performance.spec.js tests/error-boundary.spec.js tests/react-unmount.spec.js tests/react-page-focus.spec.js
（空輸出）
```

[已驗證] 既有 e2e 斷言零修改。背景白箱直呼數亦重算一致：

```text
$ grep -rho '__importAppModule' tests/*.spec.js | wc -l
138
$ grep -o '__importAppModule' tests/smoke.spec.js | wc -l
128
```

## 7. 守門測試調整（單獨列節）

| 變更 | 變因 | 處置 |
| --- | --- | --- |
| `react-surface-lifecycle` 的 SurfaceHost primitive 計數 | primitive 合法移到 `src/syncCommit.ts`，舊斷言掃 SurfaceHost 會成為假紅 | 改鎖 helper 內 `reactDomFlushSync(update)` 恰一次；既有 14 sheet／8 imperative／13 lazy 等計數不動 |
| 新增 caller allowlist subtest | 三 caller 收斂後需要防止加一、少一或 helper 錨點消失 | 遞迴 source scan＋非空斷言＋精確三檔清單；三個獨立 canary 均證明有牙 |

[已驗證] 沒有刪除既有測試、沒有調整 e2e、GOLDEN、DOM 或其他計數以求變綠。

## 8. E：收尾完整 gate

### E1. Commit 前快速 gate

```text
$ npm run typecheck
> tsc --noEmit
（exit 0）

$ npm run lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts
（exit 0）

$ npm run prettier:check
Checking formatting...
All matched files use Prettier code style!

$ node --test tests/react-surface-lifecycle.test.js
1..5
# tests 5
# pass 5
# fail 0
```

### E2. `npm run test:ci:frontend`

執行期間沒有並行其他 node test 或第二個 dev server。

```text
> tennis-partner-finder@0.1.0 test:ci:frontend
> node scripts/generate-courts-seed.mjs --check && npm run typecheck && npm run lint && npm run prettier:check && npm run test:mock && npm run build && npm run check:production-bundle && git diff --check

--check 通過:產出檔案與 data/courts.json 重生結果一致。
...
1..280
# tests 285
# suites 0
# pass 285
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2021.256417

Running 272 tests using 1 worker
...
  4 skipped
  268 passed (2.4m)

> tennis-partner-finder@0.1.0 build
> vite build

vite v6.4.3 building for production...
✓ 150 modules transformed.
...
dist/assets/index-lA-YypXZ.js  632.76 kB │ gzip: 184.22 kB
✓ built in 917ms

> tennis-partner-finder@0.1.0 check:production-bundle
> node scripts/check-production-bundle.mjs

production bundle check passed: 28 files, 12 demo identifiers absent; main chunk 632764/184215 bytes within 703886/203176
```

[已驗證] 完整 frontend gate exit 0；Node 因既有 test 檔新增一個 subtest，由 284 增為 285，Playwright 數量不變。

```text
$ git diff --check
（空輸出，exit 0）
```

### E3. 工作區

在建立本報告前：

```text
$ git status --porcelain
（空輸出）
```

[已驗證] 五個 canary 全部還原，沒有 canary 殘留。本報告建立後按派工要求維持 untracked。

## 9. 未做與不在範圍

- [已驗證] 未改母派工單 F3-2 條件；`af78a2e` 的 docs 變更是開工前既有 commit。
- [已驗證] 未動 `src/sessionViews.js` 的 `import.meta.glob` 橋接；該檔只有一行非行為註解改字。
- [已驗證] 未動 `sheets.js`、`dataApi.js`、`src/data/`、Supabase、`.claude/rules/`、testid、文案或 e2e 斷言。
- [已驗證] 未處理 `me` GOLDEN、controller 公開 API、訂閱 churn、命名殘留、負載敏感或 drawer scroll 退役等批 2 事項。
- [已驗證] 未新增或移除同步 commit 時機；沒有把此收斂描述為相容層縮小。
- [已驗證] 未跑 `npm run test:local`／`npm run test:db`：本項零 migration、零 data API/RPC 變更且本機 Supabase／Docker 未啟動。
- [已驗證] 未跑非阻擋 `npm run test:mock:webkit`。
- [已驗證] 未修改 `package.json`：沒有新增 top-level test 檔，完整 CI 中 `ci-config.test.js` 已綠。
- [已驗證] 未 push；本報告不 commit。
