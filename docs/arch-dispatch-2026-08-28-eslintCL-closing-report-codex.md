# ESLint 恢復 Phase CL 收攏批回報（Codex）

- 日期：2026-08-29
- 開工 HEAD：`f568e47`；R2 ACCEPTED 基準：`ad1fa38`
- 結論：`@typescript-eslint/unbound-method` 已定形為全庫明確 `error`；遷移期 28-path scoped override 已移除；永久 policy gate 已接入 session-unit；遷移 generator 已退役。
- 執行邊界：`src/**` 終態零 diff；四份歷史資產與 10 份 acceptance docs 零 diff；未 commit、未 push。
- 新增例外：零。未加 `any`、`@ts-ignore`、inline disable 或 wrapper。

## 1. 退役前最後查核

反向 grep `package.json`、`.github/**`、`tests/**`、`scripts/**`（排除 generator 自身）對 `generate-eslint-unbound-manifest` 與四資產 path 均無命中。

刪除前最後一次執行：

```text
$ node scripts/generate-eslint-unbound-manifest.mjs --check
eslint unbound manifest check passed: 0 findings/0 files; sessionController 0; duplicates 0; unresolved declarations 0; sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945
```

exit 0。此 gate 同時完成 G2 最後查核：ledger 實際 key 為 `acceptedRemovals`，共 246 筆，指向 10 個相異且全部存在的 acceptance docs：

```text
docs/arch-reports/eslintE2-map-callback-default-acceptance-2026-08-28.md
docs/arch-reports/eslintE4-mysessions-port-acceptance-2026-08-28.md
docs/arch-reports/eslintE5-discoverymap-port-acceptance-2026-08-28.md
docs/arch-reports/eslintE6-auth-port-acceptance-2026-08-28.md
docs/arch-reports/eslintE7-playerdirectory-port-acceptance-2026-08-28.md
docs/arch-reports/eslintE8-chat-port-acceptance-2026-08-28.md
docs/arch-reports/eslintE9-E11-controller-ports-finale-acceptance-2026-08-28.md
docs/arch-reports/eslintFR-factory-results-acceptance-2026-08-28.md
docs/arch-reports/eslintR1-app-pages-acceptance-2026-08-28.md
docs/arch-reports/eslintR2-sheets-lifecycle-leaves-acceptance-2026-08-28.md
```

之後刪除 `scripts/generate-eslint-unbound-manifest.mjs`；Git 以 `D` 呈現，歷史仍由 Git 保存。

## 2. config diff 逐字

```diff
diff --git a/eslint.config.js b/eslint.config.js
index c0c8fc6..9df804f 100644
--- a/eslint.config.js
+++ b/eslint.config.js
@@ -80,8 +80,8 @@ export default tseslint.config(
     rules: {
       "@typescript-eslint/no-floating-promises": "error",
       "@typescript-eslint/no-misused-promises": "error",
-      // 既有 type-aware 型別債，本批不改變既有程式語意。
-      "@typescript-eslint/unbound-method": "off",
+      // type-aware 恢復管線終態：本區塊規則全為專案明訂 error。
+      "@typescript-eslint/unbound-method": "error",
       "react-hooks/exhaustive-deps": "error",
       "react-hooks/rules-of-hooks": "error",
     },
@@ -94,43 +94,6 @@ export default tseslint.config(
       "@typescript-eslint/no-redundant-type-constituents": "off",
     },
   },
-  // Phase E unbound-method 逐批恢復：已清零的檔案以 scoped override 先上線，
-  // 全庫清零後移除本區塊與全域 off。
-  {
-    files: [
-      "src/app/App.tsx",
-      "src/app/AppServicesProvider.tsx",
-      "src/controller/authController.ts",
-      "src/controller/chatController.ts",
-      "src/controller/discoveryMapController.ts",
-      "src/controller/intentController.ts",
-      "src/controller/lifecycleActionsController.ts",
-      "src/controller/mySessionsController.ts",
-      "src/controller/playerDirectoryController.ts",
-      "src/data/repositories/privateDataRepository.ts",
-      "src/map.ts",
-      "src/mySessionsCreatedFocus.ts",
-      "src/pages/MePage.tsx",
-      "src/pages/MySessionsPage.tsx",
-      "src/pages/NearbySessionsDrawer.tsx",
-      "src/sessionController.ts",
-      "src/sheets.ts",
-      "src/sheets/CreateSessionSheet.tsx",
-      "src/sheets/DecideSessionSheet.tsx",
-      "src/sheets/EditSessionSheet.tsx",
-      "src/sheets/FilterSheet.tsx",
-      "src/sheets/PlayerCardSheet.tsx",
-      "src/sheets/PlayerDirectorySheet.tsx",
-      "src/sheets/ProfileCompletionSheet.tsx",
-      "src/sheets/ReportDialog.tsx",
-      "src/sheets/SessionChatSheet.tsx",
-      "src/sheets/SessionDetailSheet.tsx",
-      "src/sheets/WithdrawSessionConfirmationDialog.tsx",
-    ],
-    rules: {
-      "@typescript-eslint/unbound-method": "error",
-    },
-  },
   // Keep these ranges disjoint: flat-config rule arrays replace rather than merge.
   // Non-data source retains both the data boundary and the synchronous-commit boundary.
   {
```

恰兩個 hunks：第一個 hunk 改終態註解及 `off→error`，第二個 hunk完整刪除 Phase E scoped block。`databaseTypes` override 原樣；全檔規則名恰出現一次。

## 3. 新 policy gate 全文

`tests/eslint-unbound-policy.test.js` 最終全文：

```js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ESLint } from "eslint";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const RULE = "@typescript-eslint/unbound-method";
const CONFIG_SOURCE = readFileSync(new URL("../eslint.config.js", import.meta.url), "utf8");

function trackedFiles(...pathspecs) {
  return execFileSync("git", ["ls-files", "--", ...pathspecs], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

function normalizedSeverity(value) {
  const severity = Array.isArray(value) ? value[0] : value;
  if (typeof severity === "number") return severity;
  return { off: 0, warn: 1, error: 2 }[severity];
}

const TYPESCRIPT_FILES = trackedFiles("src", "vite.config.ts").filter(
  (file) => file.endsWith(".ts") || file.endsWith(".tsx")
);

function assertCompleteTypeScriptFileSet() {
  assert.ok(
    TYPESCRIPT_FILES.length >= 70,
    `TypeScript policy scan unexpectedly found only ${TYPESCRIPT_FILES.length} files`
  );
}

test("unbound-method has one explicit global error binding", () => {
  const occurrences = CONFIG_SOURCE.match(/@typescript-eslint\/unbound-method/gu) ?? [];
  assert.equal(occurrences.length, 1, `${RULE} must occur exactly once in eslint.config.js`);
  assert.match(CONFIG_SOURCE, /"@typescript-eslint\/unbound-method":\s*"error"/u);
  assert.doesNotMatch(CONFIG_SOURCE, /"@typescript-eslint\/unbound-method":\s*"off"/u);
});

test("unbound-method is an error for every tracked TypeScript source file", async () => {
  assertCompleteTypeScriptFileSet();

  const eslint = new ESLint({ cwd: ROOT });
  for (const file of TYPESCRIPT_FILES) {
    const config = await eslint.calculateConfigForFile(file);
    assert.equal(normalizedSeverity(config.rules[RULE]), 2, `${file} does not enforce ${RULE} as an error`);
  }
});

test("inline configuration cannot suppress unbound-method findings", async () => {
  assertCompleteTypeScriptFileSet();
  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfig: { linterOptions: { noInlineConfig: true } },
  });
  const results = await eslint.lintFiles(TYPESCRIPT_FILES);
  const hits = results.flatMap((result) =>
    result.messages
      .filter((message) => message.ruleId === RULE)
      .map((message) => `${result.filePath}:${message.line}:${message.column}`)
  );
  assert.equal(hits.length, 0, `${RULE} findings hidden by inline configuration:\n${hits.join("\n")}`);
});
```

三個 cases 分別守住：config 唯一明確 error、84 個 tracked TS/TSX 的實際 severity，以及在 `noInlineConfig: true` 下對同一組 84 檔實際 lint 後仍不得有本規則 finding。第三個 case 判斷終端行為，不再依賴可繞過的文字 regex；其他規則的既有合法 inline disables 只產生非本規則訊息，會被 `ruleId === RULE` 精確過濾。

## 4. package.json 接線 diff

`test:session-unit` 只有行尾追加一個檔案；其餘 script 原樣：

```diff
-    "test:session-unit": "node --test tests/session-controller.test.js tests/session-controller-auth.test.js tests/session-controller-sequence.test.js tests/session-create-form.test.js tests/session-data-boundary.test.js tests/session-route.test.js tests/local-supabase-config.test.js tests/ci-config.test.js tests/app-errors.test.js tests/sentry-error-transport.test.js tests/react-surface-lifecycle.test.js tests/security-headers.test.js tests/session-presentation-boundary.test.js tests/notification-data-api.test.js tests/notification-dispatch.test.js tests/notification-push.test.js tests/player-presence.test.js tests/me-focus.test.js tests/contrast-tokens.test.js tests/content-visibility-contract.test.js tests/list-query-contract.test.js tests/legacy-style-scan.test.js tests/public-brand-scan.test.js tests/reset-local-test-db.test.js tests/filters.test.js tests/sheets-dom.test.js tests/messages-page-dom.test.js tests/my-sessions-page-dom.test.js tests/me-page-dom.test.js tests/nearby-drawer-dom.test.js tests/player-card-sheet-dom.test.js tests/data-mapper-guards.test.js",
+    "test:session-unit": "node --test tests/session-controller.test.js tests/session-controller-auth.test.js tests/session-controller-sequence.test.js tests/session-create-form.test.js tests/session-data-boundary.test.js tests/session-route.test.js tests/local-supabase-config.test.js tests/ci-config.test.js tests/app-errors.test.js tests/sentry-error-transport.test.js tests/react-surface-lifecycle.test.js tests/security-headers.test.js tests/session-presentation-boundary.test.js tests/notification-data-api.test.js tests/notification-dispatch.test.js tests/notification-push.test.js tests/player-presence.test.js tests/me-focus.test.js tests/contrast-tokens.test.js tests/content-visibility-contract.test.js tests/list-query-contract.test.js tests/legacy-style-scan.test.js tests/public-brand-scan.test.js tests/reset-local-test-db.test.js tests/filters.test.js tests/sheets-dom.test.js tests/messages-page-dom.test.js tests/my-sessions-page-dom.test.js tests/me-page-dom.test.js tests/nearby-drawer-dom.test.js tests/player-card-sheet-dom.test.js tests/data-mapper-guards.test.js tests/eslint-unbound-policy.test.js",
```

`tests/ci-config.test.js` 的 top-level test deepEqual gate 隨後通過，證明清單完整。

## 5. gate 有牙三拍 ×2

原始 CL 拍組 A 的 canary SHA（FIX 單未要求重做）：

```text
7a7f3bcc7b35e0d51f34c3712248d34a6b03816b305cecec8aa35750ac45885c  eslint.config.js
f2950b4386df0a0618706b3a7b727fdc40da7bba1d3baf321da9bea905a3953d  src/domainTypes.ts
4cfb2940324ad9bbcc5201acf776fbf019619d641a03becc8981643a51f278d2  src/app/SurfaceHost.tsx
```

FIX 行為 gate 三攻擊拍前 SHA：

```text
773d143f3180b721dc5a2353a0506e232a15a6a953e15b8cbc2bd852675b6cbb  eslint.config.js
06887cc0997a177814eabeffe6fd2dd42aa3b399afe2b914e77ed0794a968cfe  tests/eslint-unbound-policy.test.js
f2950b4386df0a0618706b3a7b727fdc40da7bba1d3baf321da9bea905a3953d  src/domainTypes.ts
```

### A. `off` 回歸

1. 存量 policy test：3 passed。
2. 以 `apply_patch` 暫改唯一 binding `"error"→"off"`。
3. policy test exit 1，原始失敗核心：

```text
not ok 1 - unbound-method has one explicit global error binding
error: |-
  The input did not match the regular expression /"@typescript-eslint\/unbound-method":\s*"error"/u. Input:

not ok 2 - unbound-method is an error for every tracked TypeScript source file
error: |-
  src/app/App.tsx does not enforce @typescript-eslint/unbound-method as an error

  0 !== 2

# tests 3
# pass 1
# fail 2
```

4. 精確還原後 policy test 3 passed；config SHA 回到 `7a7f3bcc…`。

### B. inline configuration 三種繞過

乾淨樹先跑新 policy test：3 passed。三拍都在 tracked `src/domainTypes.ts` 末端暫加同一個真實 finding probe：

```ts
interface EslintUnboundPolicyCanaryOptions {
  callback(): void;
}

export function eslintUnboundPolicyCanary({ callback }: EslintUnboundPolicyCanaryOptions): void {
  callback();
}
```

#### B1. bare disable

probe 前暫加：

```ts
/* eslint-disable */
```

新斷言 3 exit 1，失敗原文：

```text
# Subtest: inline configuration cannot suppress unbound-method findings
not ok 3 - inline configuration cannot suppress unbound-method findings
  failureType: 'testCodeFailure'
  error: |-
    @typescript-eslint/unbound-method findings hidden by inline configuration:
    /Users/ian/tennisPartnerFinder/src/domainTypes.ts:150:45

    1 !== 0

  code: 'ERR_ASSERTION'
  expected: 0
  actual: 1
  operator: 'strictEqual'
1..3
# tests 3
# pass 2
# fail 1
```

以 `apply_patch` 精確移除 directive＋probe 後，新 test 3 passed；domainTypes SHA 回到 `f2950b43…`。

#### B2. 具名 disable，規則名 gap ≥210

probe 前暫加：

```ts
/* eslint-disable
   @typescript-eslint/no-floating-promises,
   @typescript-eslint/no-misused-promises,
   @typescript-eslint/no-redundant-type-constituents,
   @typescript-eslint/no-unnecessary-type-assertion,
   react-hooks/exhaustive-deps,
   react-hooks/rules-of-hooks,
   @typescript-eslint/unbound-method
*/
```

JS read-back 實測從 `eslint-disable` 起點到目標規則名為 275 characters。新斷言 3 exit 1，失敗原文：

```text
named-disable gap: 275
# Subtest: inline configuration cannot suppress unbound-method findings
not ok 3 - inline configuration cannot suppress unbound-method findings
  failureType: 'testCodeFailure'
  error: |-
    @typescript-eslint/unbound-method findings hidden by inline configuration:
    /Users/ian/tennisPartnerFinder/src/domainTypes.ts:158:45

    1 !== 0

  code: 'ERR_ASSERTION'
  expected: 0
  actual: 1
  operator: 'strictEqual'
1..3
# tests 3
# pass 2
# fail 1
```

精確移除後 3 passed；SHA 再次回到 `f2950b43…`。

#### B3. inline rule-config

probe 前暫加：

```ts
/* eslint @typescript-eslint/unbound-method: "off" */
```

新斷言 3 exit 1，失敗原文：

```text
# Subtest: inline configuration cannot suppress unbound-method findings
not ok 3 - inline configuration cannot suppress unbound-method findings
  failureType: 'testCodeFailure'
  error: |-
    @typescript-eslint/unbound-method findings hidden by inline configuration:
    /Users/ian/tennisPartnerFinder/src/domainTypes.ts:150:45

    1 !== 0

  code: 'ERR_ASSERTION'
  expected: 0
  actual: 1
  operator: 'strictEqual'
1..3
# tests 3
# pass 2
# fail 1
```

精確移除後 policy test 3 passed；`src/domainTypes.ts` SHA 第三次回到 `f2950b43…`。三拍均使用 `apply_patch`，未用 checkout；終態 `src/**` 零 diff。

## 6. 全庫生效 canary

### 獨立零掃描

以 `git ls-files -- src vite.config.ts` 在 JS 端過濾 `.ts/.tsx`，再以 `execFileSync` 把 84 個實際 path 逐一作為 ESLint arguments（不是空參數、不是 baseline 清單）：

```text
expanded TypeScript files: 84
independent unbound-method scan: 0 findings
```

等價執行核心為：

```js
execFileSync("npx", [
  "eslint",
  "--rule",
  JSON.stringify({ "@typescript-eslint/unbound-method": "error" }),
  ...files,
]);
```

`npm run lint` 同時為 PASS。

### 舊 28-path 外 synthetic canary

臨時建立 `src/features/eslintUnboundPolicyCanary.ts`，全文：

```ts
interface CanaryOptions {
  callback(): void;
}

export function eslintUnboundPolicyCanary({ callback }: CanaryOptions): void {
  callback();
}
```

`npm run lint` exit 1：

```text
/Users/ian/tennisPartnerFinder/src/features/eslintUnboundPolicyCanary.ts
  5:45  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.  @typescript-eslint/unbound-method

✖ 1 problem (1 error, 0 warnings)
```

以 `apply_patch` 刪除後，`test ! -e src/features/eslintUnboundPolicyCanary.ts` 通過，lint 再綠；終態沒有該檔。

### 真實 lifecycle 暫退

暫退 `src/app/SurfaceHost.tsx:15`：

```diff
-  unmount: () => void;
+  unmount(): void;
```

lint 精確紅九筆：

```text
src/sheets/CreateSessionSheet.tsx:821:14
src/sheets/DecideSessionSheet.tsx:165:14
src/sheets/EditSessionSheet.tsx:312:14
src/sheets/FilterSheet.tsx:297:14
src/sheets/PlayerCardSheet.tsx:308:14
src/sheets/PlayerDirectorySheet.tsx:218:14
src/sheets/ProfileCompletionSheet.tsx:284:14
src/sheets/SessionChatSheet.tsx:289:14
src/sheets/SessionDetailSheet.tsx:833:14
✖ 9 problems (9 errors, 0 warnings)
```

精確還原後 lint 綠，SurfaceHost SHA 回到 `4cfb2940…`。

## 7. print-config 抽驗

先以 `ls` 確認六個 path 全部存在，再以 `ESLint.calculateConfigForFile` 讀取：

```text
src/app/SurfaceHost.tsx [2]
src/sheets.ts [2]
src/features/chat/chatFeature.ts [2]
src/domainTypes.ts [2]
vite.config.ts [2]
src/main.js undefined
```

五個 type-aware 檔都是 error；`.js` 不在型別感知面，符合預期。

## 8. 凍結面與收尾矩陣

`git diff --stat -- src` 無輸出。四份歷史資產與 `docs/arch-reports/**` 的 diff stat 亦無輸出；最終 SHA：

```text
14e56a1675ccf4939f2e0bc3e2685070b325a32a75ef778ea1ffa45b018fd207  docs/arch-eslint-phaseE-baseline.json
6e8bf42efb76d0a96bee0053ec2bdd185a859d18715ffe3d6d5dd1f879228227  docs/arch-eslint-phaseE-removal-ledger.json
495e20547cb97203bc5af4bedc913e0f613b170ccdcf0acbe8d60740e4ba3d78  docs/arch-eslint-phaseE-unbound-manifest.json
b0d00e227e7423d4d244d30630268c9d629a2ec9ceb0ee39752081b06c6013e1  docs/arch-eslint-phaseE-unbound-manifest.md
```

| 驗證 | 實際結果 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS；全庫明確 error、0 findings |
| `npm run prettier:check` | PASS；All matched files use Prettier code style |
| `npm run build` | PASS；508 modules transformed |
| `npm run check:production-bundle` | PASS；32 files；main `638937/187466`、total JS `841561/257627`，淨 `0 B` |
| `npm run test:session-unit` | PASS；349 passed、0 failed（既有 346＋新 gate 3） |
| policy gate case 1 | PASS；唯一 explicit global error binding |
| policy gate case 2 | PASS；84 個 tracked TS/TSX 全為 severity 2 |
| policy gate case 3 | PASS；`noInlineConfig: true` 實際 lint 同一組 84 個 tracked TS/TSX，過濾後本規則 0 findings；bare／275-char gap／inline rule-config 三攻擊皆會紅 |
| `npm run test:mock` | PASS；298 passed、4 skipped |
| `npm run test:local` | PASS；API 2 passed；browser 45 passed、11 skipped；未 reset |
| `git diff --check` | PASS |
| generator 最後查核 | 刪除前 PASS；0/0、G2 246 rows／10 docs |
| frozen `src/**`／四資產／acceptance docs | PASS；零 diff |

Production bundle gate 逐字：

```text
production bundle check passed: development E2E hook present, production E2E hook absent; 32 files, 12 demo identifiers absent; main 638937/187466 within 658867/192420; largest app lazy MySessionsPage-Byp_C9FO.js 16476/4828 within 18000/5500; total JS 841561/257627 within 849961/259062; private repository: privateDataRepository-CfJqlfj0.js; Sentry: sentryBrowserSdk-Czz5dmkg.js
```

## 9. Codex 五問

### 1. 為何明寫 `error`，而不是只刪除 `off`？

兩者目前都會由 `recommendedTypeChecked` 得到 severity 2，但明寫 `error` 把專案政策固定在本地 config，不會因未來 preset 變動而靜默漂移；新 gate 的原文與逐檔 config 斷言又同時守住這個決策。

### 2. 新 gate 是否會漏掉 top-level TypeScript 或 inline configuration？

不會。全庫 severity 與 anti-suppression gate 共用 `git ls-files -- src vite.config.ts` 後在 JS 過濾出的 84 檔，包含 30 個 top-level `src/*.ts(x)`。原先 `0..200` 有界 regex 確實有設計缺陷：bare `/* eslint-disable */`、規則名距 directive 超過 200 characters 的具名清單，以及 `/* eslint rule: "off" */` 都能繞過。FIX 改為 ESLint API 在 `noInlineConfig: true` 下實際 lint 全 84 檔，再只取 `ruleId === @typescript-eslint/unbound-method` 的 findings；三種攻擊均以真實 probe 證明會紅，因此不再依賴註解文字長相。

### 3. generator 退役後是否失去 findings 回歸防護？

沒有。常規 lint 直接對完整 source glob 執行，policy gate 又防止 global off、scoped 縮限與 inline disable；synthetic canary 證明舊 28-path 外也會紅。generator 的 baseline-minus-ledger 職責已在 0/0 終態完成，留下它只會重複 ESLint 並維持遷移期脆弱依賴。

### 4. 如何證明本批沒有改 runtime 或 source？

終態 `git diff --stat -- src` 空；所有 canary 都精確移除並以 SHA／不存在檢查復原。build/bundle 完全等於既有基準，unit/mock/local 全綠。永久修改只有 config、package test 接線、新 policy test，以及 generator 刪除。

### 5. `.claude/rules`／CLAUDE.md 與 databaseTypes ledger 2 筆後續

搜尋 `CLAUDE.md` 與 `.claude/rules/*.md`，沒有 `unbound-method`、Phase E 或 generator 的遷移期描述，因此本批**不需同步修改**，也不存在會誤導後續 agent 的舊說法。`CLAUDE.md` 已有「strict TypeScript、ESLint flat config 與 Prettier」的一般政策；若未來想讓永久 gate 更醒目，可另案在 `.claude/rules/testing.md` 加一句 `test:session-unit` 會驗全庫 unbound policy，但不是 correctness 必要條件，也不應在本批越界。

`databaseTypes.ts` 的兩筆是另一條規則 `no-redundant-type-constituents` 的 generated debt，與本次 unbound 管線無關。建議維持目前單檔 scoped override，不手改 generated file；另立小批評估 Supabase 新版輸出是否已消失。若仍存在，只有在 `db:gen-types` 後處理能 deterministic、可重生且有 `generate → git diff --exit-code` gate 時才採方案二；否則保留 override 並在進度文件持續明列兩筆，不要塞進已退役的 unbound ledger/generator。

## 10. 最終差異與未做／疑義／BLOCKED

最終 porcelain 應恰五條：

```text
 M eslint.config.js
 M package.json
 D scripts/generate-eslint-unbound-manifest.mjs
?? docs/arch-dispatch-2026-08-28-eslintCL-closing-report-codex.md
?? tests/eslint-unbound-policy.test.js
```

- 未做：未 commit、未 push；未修改任何 `src/**`、其他 tests/scripts、package-lock、tsconfig、databaseTypes override、四份歷史資產、acceptance docs 或 `.claude/**`。
- 疑義：無。ledger 實際 schema key 是 `acceptedRemovals`，數量與派工合約的 246／10 完全相符。
- BLOCKED：否。
