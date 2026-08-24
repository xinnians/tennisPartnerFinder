# F0-9 補件派工單（G-1）：擋掉 `react-dom` 的兩條繞路

- 日期：2026-08-24
- 對應派工單：`docs/arch-dispatch-2026-08-24-frontend-F0-9.md`
- 對應執行報告：`docs/arch-dispatch-2026-08-24-frontend-F0-9-report-codex.md`
- 驗收結論來源：`docs/arch-reports/batch-F0-9-acceptance-2026-08-24.md`（條件式退件，一項）
- 開工 HEAD：`a3dac96`

## 開工前必讀（讀磁碟上的現行版本）

1. `docs/arch-reports/batch-F0-9-acceptance-2026-08-24.md` §二（本補件的事由與實測證據）
2. `docs/arch-dispatch-2026-08-24-frontend-F0-9.md`（原派工單的範圍紅線仍全部適用）

## 定位

F0-9 的收斂本身、三個 caller 的行為零變化、allowlist 守門的四種 canary、全 gate 綠
**全部通過**，且 flat-config 的「rule array 取代而非合併」那個坑處理得對。

只有一件事要補：ESLint 守門有兩條繞路沒擋到，而本項存在的目的正是讓「第四個同步
commit 入口」fail-closed。**這不算違約**——原派工單條件 5 只點名 namespace 匯入，
你照字面做到且做對了。這是驗收方加壓後才發現的殘留洞。

**範圍紅線**：只改 `eslint.config.js`（必要時加測試）。不得動 `src/` 任何實作檔、
不得動 `src/syncCommit.ts`、不得動已通過的 allowlist 測試邏輯。

---

## G-1：兩條繞路

驗收方實測，兩者都**同時**通過 `npm run lint` 與
`node --test tests/react-surface-lifecycle.test.js`：

### 繞路一：default 匯入

```ts
import ReactDOM from "react-dom";
export function evasion(fn: () => void): void { ReactDOM.flushSync(fn); }
```

```text
$ npm run lint                                      → EXIT=0（綠）
$ node --test tests/react-surface-lifecycle.test.js → EXIT=0  # pass 5 / # fail 0
```

### 繞路二：動態 import

```ts
export async function dyn(fn: () => void): Promise<void> {
  const m = await import("react-dom");
  m.flushSync(fn);
}
```

```text
$ npm run lint                                      → EXIT=0（綠）
$ node --test tests/react-surface-lifecycle.test.js → EXIT=0  # pass 5 / # fail 0
```

### 成因（不必重查）

- `no-restricted-imports` 的 `importNames` 涵蓋 named 與 namespace specifier，
  **不涵蓋 default specifier**。
- `reactDomNamespaceImportRestriction`（`eslint.config.js:12-15`）只鎖
  `ImportNamespaceSpecifier`。
- allowlist 靜態測試只掃 `\bsyncCommit\(`；直接寫 `ReactDOM.flushSync(` 的檔案
  不會進入 caller 集合，deepEqual 仍等於那三個核可檔。

結果：`grep -rn "flushSync" src/` 這個人工檢查看得到，**兩個自動守門都看不到**。

---

## 作法約束

1. 機制自選，但 `no-restricted-syntax` 加 `ImportDefaultSpecifier` 與
   `ImportExpression[source.value="react-dom"]` 兩個 selector 就夠。
2. **兩個 flat-config block 都要涵蓋**。`eslint.config.js:6-15` 的兩個常數同時被
   `src/**`（`:97` 起）與 `src/data/**`＋`src/dataApi.js`（`:145` 起）兩個 block 使用；
   只改一邊會讓資料層那個 range 留著同樣的洞。把新規則做成共用常數（陣列）比較不會漏。
3. **零 collateral**：`src/` 目前沒有任何檔案 default 匯入或動態匯入 `react-dom`
   （驗收方已反向 grep 確認為空）；`createRoot` 走 `react-dom/client`，
   `source.value` 不同，不受影響。因此不應該有任何存量需要 disable 註記。
4. `src/syncCommit.ts` 仍是唯一豁免。

---

## 驗收條件（每條附指令＋實際輸出）

1. **四個 canary 全紅**，各自附紅燈輸出與還原後綠燈輸出：
   - default 匯入注入**一般 `src/` 檔**（例如 `src/sessionSelectors.ts`）→ `npm run lint` 紅。
   - default 匯入注入**`src/data/**` 或 `src/dataApi.js`** → 紅。
   - 動態 `import("react-dom")` 注入一般 `src/` 檔 → 紅。
   - 動態 `import("react-dom")` 注入 `src/data/**` 或 `src/dataApi.js` → 紅。
2. **既有三條 canary 不得退化**：具名匯入、namespace 匯入、allowlist 加一
   各重跑一次確認仍紅（附輸出）。
3. `import { createPortal } from "react-dom"`（`App.tsx:2`、`SurfaceHost.tsx:2`）與
   `import { createRoot } from "react-dom/client"`（`App.tsx:3`）**不受影響**——
   由 `npm run lint` 存量綠證明即可。
4. 全部 canary 還原後 `git status --porcelain --untracked-files=no` 空輸出。
5. `npm run test:ci:frontend` 全綠＋`git diff --check` 空輸出，輸出貼進回報。

## 不在範圍

1. 不改母派工單 `docs/arch-dispatch-2026-08-22-frontend.md` 的 F3-2 條款
   （驗收方會在本補件通過後改）。
2. 不動 `src/` 任何實作檔、`src/syncCommit.ts`、allowlist 測試的判斷邏輯。
3. 不處理批 1 驗收紀錄 §三 的觀察與 §六.3 的 `drawerScrollPositions` 退役。
4. 不擴大到 `react-dom` 以外的模組邊界。

若你認為其中任何一項應該提前處理，**提出建議，不要靜默實作**。

---

## 回報要求

寫成 `docs/arch-dispatch-2026-08-24-frontend-F0-9-followup-report-codex.md`，
**不列入實作 commit、不執行 push**。程式碼修改做成 commit，接在 `a3dac96` 之後。

- 改了什麼（檔案清單＋每檔一句話）。
- 驗收條件逐條對照，每條附指令＋實際輸出，不是「已確認」三個字。
- 技術陳述帶 `[已驗證]`／`[推論]`／`[不確定]` tag。
- canary 附完整輸出（紅的那次與還原後綠的那次都要）。
- 未做／做不了的項目明說原因，不可留白。

執行注意：跑 Playwright 期間不要並發其他 `node --test` 或第二個 dev server；
單一 timeout 類紅燈先用 `--repeat-each=10 --retries=0` 取樣再下判斷。
`npm run test:local`／`test:db`／WebKit 同前不跑。
