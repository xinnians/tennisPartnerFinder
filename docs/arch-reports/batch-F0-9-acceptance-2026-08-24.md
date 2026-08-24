# F0-9（同步 commit 邊界收斂＋守門）驗收紀錄

- 驗收日期：2026-08-24　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-24-frontend-F0-9.md`
- 補件派工單：`docs/arch-dispatch-2026-08-24-frontend-F0-9-followup.md`
- 回報：`docs/arch-dispatch-2026-08-24-frontend-F0-9-report-codex.md`
- 補件回報：`docs/arch-dispatch-2026-08-24-frontend-F0-9-followup-report-codex.md`
- 驗收範圍：基準 `af78a2e` → 實作 `a3dac96` → 補件 `e7f7056`（共 2 個 commit）

## 最終結論：**ACCEPTED**（含補件，2026-08-24）

初驗為條件式退件一項（G-1，見 §二）；補件 `e7f7056` 落地後複驗全數通過（見 §四）。

| 事項 | 結案 |
| --- | --- |
| G-1 `react-dom` 的 **default 匯入**與**動態 import** 兩條繞路，lint 與靜態測試都放行 | ✅ `e7f7056` 修復；驗收方在**兩個 flat-config range** 各造 canary，並加測 re-export、default+named 混合、字串拼接三條額外繞路，共 11 個 canary 全紅 |

---

## 一、通過項目（全部由驗收方獨立重跑）

### 1. 交付邊界 [已驗證]

`git show --numstat a3dac96` 恰七檔，全部在派工範圍內：

```text
24	1	eslint.config.js
3	2	src/app/App.tsx
4	2	src/app/SurfaceHost.tsx
2	2	src/sessionStore.ts
1	1	src/sessionViews.js
10	0	src/syncCommit.ts
46	5	tests/react-surface-lifecycle.test.js
```

`src/sessionViews.js` 那一行是註解字面
（`// flushSync commit,` → `// synchronous commit,`），非行為變更，回報 §9 有主動揭露。

### 2. 收斂本身 [已驗證]

```text
$ grep -rn "flushSync" src/
src/syncCommit.ts:1:import { flushSync as reactDomFlushSync } from "react-dom";

$ grep -rn 'from "react-dom"' src/
src/syncCommit.ts:1:import { flushSync as reactDomFlushSync } from "react-dom";
src/app/App.tsx:2:import { createPortal } from "react-dom";
src/app/SurfaceHost.tsx:2:import { createPortal } from "react-dom";
```

`src/syncCommit.ts` 是 10 行葉子，除 `react-dom` 外零 import，檔頭註解明確寫出
「呼叫端仍自行決定何時需要同步 commit，本葉子只收斂 React DOM primitive」——
沒有把收斂說成相容層縮小，符合派工單對誠實限制的要求。

三個 caller 的 diff 逐一核對：**只是 `flushSync(x)` → `syncCommit(x)`**，
位置未動、條件未增減、三段原本說明「服務哪一類 imperative 呼叫者」的註解全部保留。

### 3. ESLint 守門（派工單要求的兩條）[已驗證]

驗收方自造 canary，注入 `src/sessionSelectors.ts` 後跑 `npm run lint`：

```text
A. import { flushSync } from "react-dom";        → EXIT=1
   1:10 error 'flushSync' import from 'react-dom' is restricted. …  no-restricted-imports

B. import * as ReactDOM from "react-dom";        → EXIT=1
   1:8 error * import is invalid because 'flushSync' from 'react-dom' is restricted. … no-restricted-imports
   1:8 error 禁止 namespace 匯入 react-dom；…                        no-restricted-syntax
```

namespace 那條被兩條規則各自獨立擋下（`importNames` 原生涵蓋 namespace specifier，
companion selector 再擋一次），符合派工單條件 5 的「二擇一」中較好的那一種。

**flat-config 的坑處理得對** [已驗證]：codex 注意到 flat config 的同名 rule array 是
**取代而非合併**，因此另開一個 block 讓 `src/data/**`／`src/dataApi.js`
（原本豁免 data facade 規則者）**仍受同步 commit 規則約束**（`eslint.config.js:144-150`）。
這是派工單沒點出、但如果漏掉就會留下的洞。

代價也有揭露（回報 §4 line 154）：`src/syncCommit.ts` 進了既有 block 的 `ignores`，
因此它同時豁免了 data facade 規則。補償控制是靜態測試鎖死它只能 import `react-dom`
——驗收方以探針確認該補償有效（見下方 G 探針）。

### 4. caller allowlist 守門（四種 canary，全部驗收方自造）[已驗證]

```text
C. 加第四個 caller（sessionSelectors.ts 匯入並呼叫 syncCommit） → not ok 2 / # fail 1
D. 拿掉一個 caller（sessionStore 的 syncCommit(listener) → listener()） → not ok 2 / # fail 1
E. helper 改名（syncCommit → syncCommitRenamed）讓錨點消失          → not ok 2 / # fail 1
G. 【驗收方加測】helper 不再是葉子（多 import sessionPresentation.ts） → not ok 2 / # fail 1
還原後                                                              → # pass 5 / # fail 0
```

D 這條特別重要：證明它不是「≥3 就過」，而是精確清單。
G 是派工單沒要求的加測，證明「葉子純度」有實際守門，不只是文件約定。

掃描式斷言有非空保護（`assert.ok(sourceFiles.length > 0)` 與
`assert.ok(callers.length > 0)`），符合「空集合掃描也會綠」的既有教訓。

### 5. 行為零變化 [已驗證]

```text
$ git diff 0be31a2 HEAD -- tests/session-controller-sequence.test.js
（仍只有批 1 那個檔頭註解 hunk；GOLDEN 124 筆未動）

$ git diff --stat 0be31a2 HEAD -- tests/smoke.spec.js tests/performance.spec.js \
    tests/error-boundary.spec.js tests/react-unmount.spec.js
（空）

$ git diff --stat 7112d6d HEAD -- tests/react-page-focus.spec.js
（空）

全 src/ 的 data-testid 集合與 0be31a2 逐字相同（掃描集 70 個，非空）。
```

### 6. 完整 gate [已驗證]

驗收方無並發重跑：

```text
$ npm run test:ci:frontend        → EXIT=0
# tests 285 / # pass 285 / # fail 0
4 skipped / 268 passed (2.4m)
production bundle check passed: 28 files, 12 demo identifiers absent;
main chunk 632764/184215 bytes within 703886/203176
$ git diff --check                → EXIT=0
```

Node 由 284 升為 285＝新增的 allowlist subtest，變因對得上。
bundle 由 `632763/184198` 升為 `632764/184215`（+1 byte raw、+17 gzip，多一層模組包裝），
**回報 §8 貼的是升級後的數字，沒有沿用舊值**——數字誠實。

---

## 二、退件事項

### G-1（必修）兩條 `react-dom` 繞路沒被擋

本項的目的是讓「第四個同步 commit 入口」fail-closed。驗收方實測到**兩條路徑同時
繞過 lint 與靜態測試**：

**繞路一：default 匯入**

```ts
import ReactDOM from "react-dom";
export function evasion(fn: () => void): void { ReactDOM.flushSync(fn); }
```

```text
$ npm run lint                                   → EXIT=0（綠）
$ node --test tests/react-surface-lifecycle.test.js → EXIT=0  # pass 5 / # fail 0
$ grep -rn "flushSync" src/ | grep -v syncCommit.ts
src/sessionSelectors.ts:2:export function evasion(fn: () => void): void { ReactDOM.flushSync(fn); }
```

**繞路二：動態 import**

```ts
export async function dyn(fn: () => void): Promise<void> {
  const m = await import("react-dom");
  m.flushSync(fn);
}
```

```text
$ npm run lint                                   → EXIT=0（綠）
$ node --test tests/react-surface-lifecycle.test.js → EXIT=0  # pass 5 / # fail 0
```

**成因**：

- `no-restricted-imports` 的 `importNames` 涵蓋 named 與 namespace specifier，
  但**不涵蓋 default specifier**。
- companion selector 只鎖 `ImportNamespaceSpecifier`。
- allowlist 靜態測試只掃 `\bsyncCommit\(`，直接呼叫 `ReactDOM.flushSync(` 的檔案
  根本不會進入 caller 集合，因此 deepEqual 仍等於那三個核可檔。

也就是說：舊的 `grep -rn "flushSync" src/` 這個人工檢查看得到，但**兩個自動守門都看不到**。
本項存在的理由正是批 1 曾經無聲長出第四個入口——把最慣用的 `import ReactDOM from "react-dom"`
留著不擋，等於把當初的破口留一半。

**不算 codex 違約**：派工單條件 5 只點名 namespace 匯入，codex 照字面做到且做對了。
這是驗收方加壓後才發現的殘留洞。

**要求**：把兩條路徑都擋掉並各附 canary（紅→還原→綠）。
`no-restricted-syntax` 加 `ImportDefaultSpecifier` 與
`ImportExpression[source.value="react-dom"]` 兩個 selector 即可，機制自選。
**collateral 為零**：`src/` 目前沒有任何檔案 default 匯入或動態匯入 `react-dom`；
`createRoot` 走的是 `react-dom/client`，`source.value` 不同，不受影響。

---

## 三、觀察（不阻擋）

1. `src/syncCommit.ts` 因進了 `ignores` 而同時豁免 data facade 規則。目前由靜態測試的
   「只能 import react-dom」deepEqual 補償，驗收方探針 G 確認補償有效。若日後放寬那條
   deepEqual，這個豁免就會變成真的洞——批 2 若動這個檔要記得一起看。
2. 本項如預期**沒有減少**需要同步 commit 的時機（三個入口原樣保留）。這是收斂不是縮減，
   回報也沒有誇大，符合派工單的誠實限制要求。

---

## 四、補件複驗（2026-08-24）：**PASS**

- 補件 commit：`e7f7056 fix(arch-F0-9): close react-dom import bypasses`
- 交付邊界 [已驗證]：`git show --numstat e7f7056` 只有 `16 6 eslint.config.js`
  一檔，`src/` 與測試零改動，符合補件派工單的範圍紅線。

### 4.1 作法

`reactDomNamespaceImportRestriction` 單一常數改成 `reactDomSyntaxRestrictions` 陣列
（`eslint.config.js:12-25`），含三個 selector：`ImportNamespaceSpecifier`、
`ImportDefaultSpecifier`、`ImportExpression[source.value="react-dom"]`，
以 spread 同時注入 `src/**` 與 `src/data/**`＋`src/dataApi.js` 兩個 block
（`:140`、`:158`）。這正是補件派工單點名的坑——**兩個 range 都要涵蓋**，做對了。

### 4.2 驗收方自造 canary（11 個，全部獨立重跑）

| # | canary | 注入位置 | 結果 |
| --- | --- | --- | --- |
| 1 | default 匯入 `react-dom` | `src/sessionSelectors.ts` | lint 紅（`no-restricted-syntax`） |
| 2 | default 匯入 `react-dom` | `src/dataApi.js` | lint 紅 |
| 3 | 動態 `import("react-dom")` | `src/sessionSelectors.ts` | lint 紅 |
| 4 | 動態 `import("react-dom")` | `src/dataApi.js` | lint 紅 |
| 5 | 回歸：具名匯入 `flushSync` | `src/sessionSelectors.ts` | lint 紅（`no-restricted-imports`） |
| 6 | 回歸：namespace 匯入 | `src/sessionSelectors.ts` | lint 紅（兩條規則各自紅） |
| 7 | 回歸：allowlist 加第四個 caller | `src/sessionSelectors.ts` | 測試紅 `not ok 2` |
| 8 | **【加測】** `export { flushSync } from "react-dom"` re-export | `src/sessionSelectors.ts` | lint 紅（`no-restricted-imports`） |
| 9 | **【加測】** `import ReactDOM, { createPortal } from "react-dom"` 混合 | `src/sessionSelectors.ts` | lint 紅 |
| 10 | **【加測】** `import("react-" + "dom")` 字串拼接 | `src/sessionSelectors.ts` | lint 紅（既有的「動態 import 路徑必須使用字串 literal」規則接住） |
| 11 | 還原後基線 | — | lint EXIT=0、`# pass 5 / # fail 0` |

第 8、9、10 是補件派工單沒要求的加測。三條都被擋住，代表這道邊界目前**沒有已知的
靜態繞路**：具名、namespace、default、re-export、混合、動態 literal、動態拼接全紅，
加上 allowlist 精確清單守著 `syncCommit(` 這一路。

### 4.3 完整 gate [已驗證]

驗收方無並發重跑：

```text
$ npm run test:ci:frontend        → EXIT=0
# tests 285 / # pass 285 / # fail 0
4 skipped / 268 passed (2.4m)
production bundle check passed: 28 files, 12 demo identifiers absent;
main chunk 632764/184215 bytes within 703886/203176
$ git diff --check                → EXIT=0
```

bundle 與 `a3dac96` 逐字相同（本次只動 `eslint.config.js`，符合預期）。

---

## 五、後續動作

1. **母派工單 F3-2 的 flushSync 條款已於本次改寫**
   （`docs/arch-dispatch-2026-08-22-frontend.md`）：由「flushSync 僅剩兩處」改為
   「同步 commit 邊界不得擴張」——`grep` 仍只有 `src/syncCommit.ts` 一處、
   caller 允許清單維持恰三個、本批不得新增第四個；並把批 3 真正該退役的目標
   寫成 `import.meta.glob` 橋接。
2. F0-9 的四份文件（執行回報、補件派工單、補件回報、本紀錄）連同 F3-2 條款改寫
   於本次一併收錄提交。
3. 全部未 push；push 由使用者在所有批次完成後執行。
4. 批 2 開工時記得帶上 §三 的兩項觀察。
