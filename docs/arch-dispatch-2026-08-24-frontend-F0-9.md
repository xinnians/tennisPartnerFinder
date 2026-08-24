# F0-9 派工單：同步 commit 邊界收斂＋守門（獨立小項，可隨時開工）

- 日期：2026-08-24
- 母派工單：`docs/arch-dispatch-2026-08-22-frontend.md`（本項歸入批 0「安全網」性質：
  低風險、高槓桿、可獨立指派，不阻擋也不被批 2／批 3 阻擋）
- 開工基準：`25ab143`（批 1 驗收文件收錄後的 HEAD）
- 事由來源：`docs/arch-reports/batch-F1-acceptance-2026-08-24.md` §三.1

## 開工前必讀（讀磁碟上的現行版本，不要用記憶或舊快照）

1. `CLAUDE.md`
2. `.claude/rules/react-migration.md`（特別是第 21、22、34 條的同步語意凍結）
3. `docs/arch-dispatch-2026-08-22-frontend.md`（總則＋驗收協定）

---

## 背景：為什麼要做這一項

母派工單 F3-2 的驗收條件寫的是：

> `grep -rn "flushSync" src/` 僅剩（或少於）現有兩處並附理由

批 1 之後變成三處，照字面走批 3 一開工就不可能過。但驗收時查出**真正的問題不是批 1
破壞了條件，而是這條條件從一開始就在量錯東西**：

- [已驗證] 三處 `flushSync` 內容字面上都是 `flushSync(fn)`，做的是同一件事——保證
  「imperative 呼叫返回前 DOM 已更新」。它們是**同一道相容邊界的三個入口**，
  不是三種機制。
- [已驗證] 這道邊界的釘子是 **138 個 e2e 白箱直呼點**
  （`grep -rho "__importAppModule" tests/*.spec.js | wc -l` = 138，光 `smoke.spec.js`
  就 128 個），它們呼叫 adapter 後**立刻** `querySelector` 讀 DOM。
  母派工單總則凍結既有 e2e 斷言，`.claude/rules/react-migration.md:21` 凍結 adapter
  的「同步語意」。
- [推論] 因此批 3 的實際範圍（topbar chips、level popover、底部導覽、toast、
  openLoginModal 遷入 React——這些是 main.js 直接操作的 DOM）**一處也拿不掉**。
  批 3 真正能退役的相容層是 `import.meta.glob` 橋接
  （`src/sessionViews.js:53`、`:63`、`:69`），不是 flushSync。

本項要做的是把這道邊界**收斂成單一 choke point 並加上有牙的守門**，讓「同步 commit
入口」變成一個顯式、可數、加一個就會紅的東西。

**誠實的限制**：這不會減少需要同步 commit 的地方，它只讓邊界明確、指標誠實、
將來要退役時只有一個地方要改。不要在回報中把它說成「相容層縮小了」。

---

## 目標

1. 三處 `flushSync(fn)` 收斂到單一葉子模組（建議 `src/syncCommit.ts`，見下方約束）。
2. ESLint 禁止除該模組外從 `react-dom` 匯入 `flushSync`。
3. 靜態測試把「同步 commit 呼叫點清單」釘成 fail-closed 的允許清單。

**行為零變化**：這是純重構。三個呼叫點的**觸發時機、傳入的函式、呼叫順序**一律不變，
只是把 `flushSync(x)` 換成呼叫共用 helper。不得順手改變任何一處「何時同步 commit」。

---

## Ground truth（驗收方 2026-08-24 實測，直接用，不必重查）

### 三處現況

`src/app/App.tsx:2`、`:333-340`：

```tsx
import { createPortal, flushSync } from "react-dom";
...
/**
 * sessionViews wires native listeners immediately after each public render call,
 * so this compatibility boundary must expose committed DOM before it returns.
 * Internal React updates do not use this path.
 */
function commitPageAdapterSynchronously(): void {
  flushSync(renderApp);
}
```

`src/app/SurfaceHost.tsx:2`、`:55-58`：

```tsx
import { createPortal, flushSync } from "react-dom";
...
/** Imperative sheet adapters read their portal DOM before returning; React-owned event updates bypass this boundary. */
function commitSynchronously(update: () => void): void {
  flushSync(update);
}
```

`src/sessionStore.ts:2`、`:97-104`：

```ts
import { flushSync } from "react-dom";
...
        ? store.subscribe(channel, () => {
            beforeStoreChange?.();
            // Public page adapters are synchronous from the e2e caller's
            // perspective. Preserve that contract when an external-store
            // emit happens inside one native event stack.
            flushSync(listener);
          })
```

### `src/` 全部的 `react-dom` 具名匯入

```text
$ grep -rn 'from "react-dom"' src/
src/sessionStore.ts:2:import { flushSync } from "react-dom";
src/app/App.tsx:2:import { createPortal, flushSync } from "react-dom";
src/app/SurfaceHost.tsx:2:import { createPortal, flushSync } from "react-dom";
```

`createRoot` 走 `react-dom/client`（`App.tsx:3`），與本項無關。

### ESLint 既有邊界規則的形狀（`eslint.config.js:83-113`）

```js
  {
    files: ["src/**/*.{js,ts,tsx}"],
    ignores: ["src/data/**", "src/dataApi.js"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [ /* supabaseClient、data/mappers、data/repositories */ ] },
      ],
      "no-restricted-syntax": [ "error", /* 動態 import 的對應封鎖 */ ],
    },
  }
```

**注意**：這個既有 block 的 `ignores` 是 `src/data/**`、`src/dataApi.js`，與本項需要的
豁免對象不同，**不能直接塞進同一個 block**——需要新增一個 flat-config block。

### 新測試檔的連帶義務

`tests/ci-config.test.js:65-71` 會**自動**從 `tests/` 目錄推導期望清單並與
`package.json` 的 `test:session-unit` 逐字比對：

```js
  const expected = readdirSync(new URL("./", import.meta.url))
    .filter((name) => name.endsWith(".test.js") && name !== localOnly)
    .map((name) => `tests/${name}`)
    .sort();
  const registered = (PACKAGE.scripts["test:session-unit"].match(/tests\/[^ ]+\.test\.js/g) ?? []).sort();
  assert.deepEqual(registered, expected);
```

所以：**新增任何 `tests/*.test.js` 就必須同步改 `package.json` 的 `test:session-unit`**，
否則這條斷言會紅。若把新斷言加進既有的 `tests/react-surface-lifecycle.test.js`，
則不需要動 `package.json`。兩種都可以，自己選並在回報說明理由。

### 靜態守門的既有形狀（可比照）

`tests/react-surface-lifecycle.test.js` 已有同類型的計數／清單斷言先例：
`:18`（14 個 sheet adapter）、`:28`、`:47`（13 個 lazy sheet）、`:38`（8 個 imperative
adapter）、`:45`（`eager: true` 恰 2）、`:49`（3 個頁面 lazy request）。
`70562a4` 新增的 `extractBracedBody`（`:12-27`）是括號平衡擷取的可用工具。

---

## 作法約束（不指定實作，只給邊界）

1. **葉子模組防循環**：`src/sessionStore.ts` 會被 `src/sessionController.js` 匯入，
   而 `src/app/App.tsx` 會（間接）匯入 pages → `sessionStore.ts`。因此共用 helper
   **必須是葉子模組**：除了 `react-dom` 之外不得 import 任何專案內模組。
   建議放 `src/syncCommit.ts`；放別處也行，但要滿足這個約束。
2. **保留現有的三段檔頭註解語意**。那三段註解各自說明「誰是 imperative 呼叫者、
   為什麼需要同步」，是這道邊界的文件。收斂後：helper 本身要有一段總說明，
   三個呼叫點各自保留（或改寫但不弱化）它原本那段「服務哪一類呼叫者」的說明。
3. **不得新增第四個同步 commit 入口**。
4. 新模組走 strict TypeScript（`.ts`），符合 CLAUDE.md 對新檔的規定。

---

## 驗收條件（可觀察、可證偽；每條附指令＋實際輸出）

### A. 收斂本身

1. `grep -rn "flushSync" src/` 的輸出**只剩該單一模組內的一處**（附完整輸出）。
2. `grep -rn 'from "react-dom"' src/` 只剩該模組匯入 `flushSync`；
   `App.tsx`／`SurfaceHost.tsx` 仍可匯入 `createPortal`（附前後對照）。
3. 三個呼叫點的觸發時機與傳入函式未變：附 `git diff` 顯示每處只是
   `flushSync(x)` → `syncCommit(x)`（或等價），沒有搬動位置、沒有增減條件判斷。

### B. ESLint 守門有牙（canary 由**你自己**造，存量全綠不算證據）

4. 在任一非豁免的 `src/` 檔加一行 `import { flushSync } from "react-dom";`
   → `npm run lint` 變紅，附錯誤輸出；還原後綠。
5. **命名空間匯入是否繞得過**：實測
   `import * as ReactDOM from "react-dom";` ＋ `ReactDOM.flushSync(...)`
   會不會被擋。附實際輸出，然後二擇一：
   - 擋得住 → 直接附輸出佐證；
   - 擋不住 → 補一條 `no-restricted-syntax` companion（`eslint.config.js:116-127`
     已有動態 import 的同型先例），再附 canary 證明補完會紅。
   **不接受只用文字聲稱「應該擋得住」。**

### C. 呼叫點清單守門有牙

6. 靜態測試把「呼叫共用 helper 的檔案集合」釘成允許清單（目前恰 3 個檔）。
   掃描式斷言**必須額外 assert 掃描集非空**（空集合掃描也會綠）。
7. 三個 canary，各自附紅燈輸出與還原後綠燈輸出：
   - **加一個**：在第四個 `src/` 檔呼叫 helper → 紅。
   - **拿掉一個**：把三個呼叫點之一改回不經 helper → 紅
     （證明它不是「≥3 就過」）。
   - **fail-closed**：把 helper 改名／模組移走讓錨點消失 → 紅，且錯誤訊息要能指出
     缺了什麼，不是靜默通過。

### D. 行為零變化

8. `git diff 0be31a2 HEAD -- tests/session-controller-sequence.test.js` 仍**只有**
   檔頭註解那一個 hunk（GOLDEN 124 筆未動）。
9. 全 `src/` 的 `data-testid` 集合與 `0be31a2` 相同（附可證偽的比對輸出；
   比照補件回報 §5.1 的腳本形狀，並確認掃描集非空）。
10. `tests/smoke.spec.js`、`tests/performance.spec.js`、`tests/error-boundary.spec.js`、
    `tests/react-unmount.spec.js`、`tests/react-page-focus.spec.js` **零修改**
    （附 `git diff --stat` 空輸出）。

### E. 收尾

11. `npm run test:ci:frontend` 全綠，輸出貼進回報；`git diff --check` 空輸出。
12. 若新增了 `tests/*.test.js`，附 `package.json` 的 `test:session-unit` 同步變更，
    並附 `node --test tests/ci-config.test.js` 綠燈。

---

## 不在範圍（不要順手做）

1. **不改母派工單 `docs/arch-dispatch-2026-08-22-frontend.md` 的 F3-2 條件文字。**
   本項驗收通過後，由驗收方改寫該條件（角色分工，不是你的工作）。
2. 不動 `src/sessionViews.js` 的 `import.meta.glob` 橋接（`:53`／`:63`／`:69`）——
   那是批 3 的事。
3. 不動 `sheets.js`、`dataApi.js`、`src/data/`、Supabase、`.claude/rules/`、
   任何 testid、文案或既有 e2e 斷言。
4. 不處理批 1 驗收紀錄 §三 的其他觀察（`me` 通道 GOLDEN 覆蓋、
   `controller.sessionStore` 公開 API、`onBeforeStoreChange` 訂閱 churn、
   命名殘留、`smoke.spec.js:161` 負載敏感）與 §六.3 的
   `drawerScrollPositions` 退役——那些留給批 2。
5. 不減少或增加「需要同步 commit 的時機」。這是純收斂。

若你認為其中任何一項應該提前處理，**提出建議，不要靜默實作**。

---

## 回報要求

### 交付形式

寫成 `docs/arch-dispatch-2026-08-24-frontend-F0-9-report-codex.md`，
**不列入實作 commit、不執行 push**。驗收後由驗收方連同驗收紀錄一起收錄提交。

程式碼修改照常做成 commit，接在 `25ab143` 之後。

### 每項回報格式

- 改了什麼（**檔案清單＋每檔一句話**，不要省略小檔）。
- 驗收條件逐條對照：每條附**指令＋實際輸出**，不是「已確認」三個字。
- 技術陳述帶 `[已驗證]`／`[推論]`／`[不確定]` tag；
  「已刪除／已歸零」類聲稱附反向 grep 輸出。
- canary 一律附完整輸出（紅的那次與還原後綠的那次都要）。
- 未做／做不了的項目明說原因，不可留白。

### 執行注意

- 跑 Playwright 期間**不要**同時跑其他 `node --test` 或第二個 dev server。
  批 1 驗收就因並發讓 `smoke.spec.js:161` 假紅
  （`element is not stable` → `element was detached from the DOM`）。
  遇到單一 timeout 類紅燈，先用 `--repeat-each=10 --retries=0` 取樣再下判斷，
  單次紅不算證據。
- 本機 Supabase／Docker 未啟動：`npm run test:local`、`npm run test:db` 不跑
  （本項零 migration、零 `dataApi` 邊界變更），沿用既有揭露方式即可。
- WebKit 為非阻擋 job，不強制跑。
