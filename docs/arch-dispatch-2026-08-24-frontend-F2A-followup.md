# 批 2A 補件派工單（A-1／A-2／A-3）

- 日期：2026-08-24
- 對應派工單：`docs/arch-dispatch-2026-08-24-frontend-F2A.md`
- 對應執行報告：`docs/arch-dispatch-2026-08-24-frontend-F2A-report-codex.md`
- 驗收結論來源：`docs/arch-reports/batch-F2A-acceptance-2026-08-24.md`
- 開工 HEAD：`e907c40`（若 F1R 已先落地，則接在 F1R 的 HEAD 之後）
- 順序建議：**F1R 先做**（見該派工單）；本補件其次。

## 開工前必讀（讀磁碟上的現行版本）

1. `docs/arch-reports/batch-F2A-acceptance-2026-08-24.md` §二（三項退件事由與實測證據）
2. `CLAUDE.md`（`dataApi.js` 唯一資料邊界、RPC 簽名凍結）
3. `docs/arch-dispatch-2026-08-24-frontend-F2A.md`（原派工單的範圍紅線仍全部適用）

## 定位

2A 的主體通過且品質高：十條 select 字串逐字未變、`as unknown as` 4→2、
`rowsAs`／`rowAs` 全數退役、九個 literal guard 用 `Record<Union, true>` 做到
fail-closed（驗收方 canary 確認）、accept-list 對 migration CHECK 逐項相符、
fallback 選擇保守、`instanceof` 反向 grep 乾淨、GOLDEN 與 testid 未動、
gate 295/295＋268/4、pgTAP 799 PASS。

要補的是**守門的實際涵蓋範圍**與**揭露完整性**，不是重做。

**範圍紅線**：不得回退 2A 已通過的部分。特別是
`selects.ts` 的字串 literal 形式（那是型別鏈能檢查欄位的前提）、
`literalGuards.ts` 的 `Record<Union, true>` 模式、
`supabaseClient.js` 的 JSDoc 路線，全部保留。

---

## A-1（必修）讓 RPC 參數受型別檢查，或明確承認做不到

### 事由

`src/data/repositories/dataRepository.ts:170-175`：

```ts
  async function callRpc(name: RpcName, params: Record<string, unknown>): Promise<unknown> {
    const activeClient = requireClient();
    // The shared wrapper intentionally accepts heterogeneous RPC argument
    // records; individual repository methods own their runtime normalization.
    const { data, error } = await activeClient.rpc(name, params as never);
```

`as never` 是基準沒有的新斷言（`f4080f2` 全庫零 `as never`），效果是**整個參數物件
跳過檢查**。驗收方 canary：

```text
p_chat_message_enabled 改名成 p_chat_message_enabled_typo
$ npm run typecheck → EXIT=0（綠）

p_chat_message_enabled 的值換成字串 "not-a-boolean"
$ npm run typecheck → EXIT=0（綠）
```

對照組（這兩個現在**會**紅，是 2A 的實質成果，要保住）：

```text
.select("id,not_a_real_column")        → TS2345 column 'not_a_real_column' does not exist on 'courts'
callLifecycleRpc("cancel_session_typo") → TS2345
```

**為什麼這件事在這個 repo 特別重要**：CLAUDE.md 把 RPC 簽名列為凍結契約
（`save_my_profile` 的 `p_line_id: null`、六參數 `set_notification_prefs` 等）。
RPC 參數是這條型別鏈最值錢的目標。mock 模式的 e2e 不打 RPC，唯一會抓到參數打錯的是
`test:local`／pgTAP——而 `test:local` 目前是紅的（見 F1R）。

回報 §2.4 的結論寫「證明 relation→select→mapper 型別鏈已接通」，
但沒有任何一處說明 RPC 參數不受檢查，`as never` 也沒進 §2.2 的斷言盤點。

### 作法約束

1. 首選：把 `callRpc` 改成按名稱推導參數，例如
   ```ts
   async function callRpc<N extends RpcName>(
     name: N,
     params: Database["public"]["Functions"][N]["Args"]
   ): Promise<unknown>
   ```
   若某些呼叫點因此需要 runtime 正規化才能滿足型別，**那正是要暴露的東西**——
   逐處說明你怎麼處理，不要用新的斷言把它蓋回去。
2. 不得把 `as never` 換成 `as any`／`as unknown as`／`@ts-expect-error`。
   若真的需要局部逃生口，必須是**單一 RPC 範圍內**的、有註解說明的，且在回報中列出。
3. 不得改任何 RPC 名稱、參數名稱或參數個數。這是凍結契約。
4. `src/data/databaseTypes.ts` 是生成檔，一行不准手改。

### 驗收條件

1. `grep -rn "as never" src/` 的輸出不再包含 `dataRepository.ts`
   （`PlayerCardSheet.tsx:144` 那筆是註解文字，不算）。附前後對照。
2. **兩個新 canary 各附紅→還原→綠**：
   - RPC 參數名稱打錯（例如 `p_chat_message_enabled` → `p_chat_message_enabled_typo`）
     → `npm run typecheck` 紅。
   - RPC 參數型別錯（boolean 位置放字串）→ `npm run typecheck` 紅。
3. **兩個既有 canary 不得退化**：錯欄位、錯 RPC 名稱各重跑一次確認仍紅。
4. `npm run test:ci:frontend`、`npm run test:db` 全綠。
5. 若判斷技術上做不到：**明說做不到的理由並附實測輸出**（例如你嘗試的型別寫法與
   tsc 的實際診斷），在 `dataRepository.ts` 留註解說明限制，
   並在回報中把「RPC 參數側未受型別保護」寫成明確的已知限制。
   **不接受只用文字聲稱「型別上無法收窄」。**

---

## A-2（必修）barrel 的 facade 繞路

### 事由

原派工單 (c) 的條件是「barrel 只可匯出型別，不得匯出 runtime 值」，
驗收條件 2 是「從 `src/pages/` 任一檔**透過新 barrel import 一個 runtime 值**，
證明守門會紅」。

回報 §4.2 做的是把型別 `SessionSummary` 當值用，得到
`TS2693 'SessionSummary' only refers to a type, but is being used as a value`。
**這只證明「型別不是值」，與 barrel 無關**——同樣的錯誤對任何檔案的任何型別都會發生。

驗收方做了派工單真正要求的 canary：在 `src/data/index.ts` 加
`export { createDataApi } from "./repositories/dataRepository.ts";`，
再從 `src/pages/MePage.tsx` import 並使用：

```text
$ npm run typecheck → EXIT=0（綠）
$ npm run lint      → EXIT=0（綠）
```

**page 拿到了 repository factory，兩個守門都沒紅。** 成因：

- `eslint.config.js` 的 facade 規則 block 是
  `files: ["src/**/*.{js,ts,tsx}"], ignores: ["src/data/**", "src/dataApi.js", "src/syncCommit.ts"]`
  ——`src/data/index.ts` 落在 `src/data/**` 內，barrel 自己可自由 import repository。
- page 端 import 的路徑 `../data/index.ts` 不匹配
  `**/data/mappers/**`／`**/data/repositories/**` 任何 restricted pattern。

這踩到 CLAUDE.md 紅線「所有前端讀寫都必須經過 `src/dataApi.js` 的 view/RPC 邊界」。

**加重情節**：barrel 目前**零消費者**
（`grep -rn 'data/index' src/ tests/` 空輸出），內容全是 `domainTypes.ts` 的再匯出，
而 `domainTypes.ts` 本來就到處可 import。現階段它沒帶來好處，只帶來一條沒守住的繞路。

### 作法：二擇一，並說明選擇理由

**選項 A：刪掉 barrel。** 原派工單 (c) 寫的是「domain 型別搬進 `domainTypes.ts`
**或** `src/data/index.ts` barrel」——型別已經全在 `domainTypes.ts`，
只保留 (c) 的另一半（`domainTypes.ts:1` 註解修正，已完成）是完全合規的收尾。
這是最省的路，而且消除繞路。

**選項 B：保留 barrel 並加 fail-closed 守門。** 可行做法：
- 改用 `@typescript-eslint/no-restricted-imports` 搭 `allowTypeImports: true`，
  把 `**/data/index*` 加進 restricted patterns（`import type` 放行、值 import 變紅）；
- 或加一條靜態測試斷言 `src/data/index.ts` 只含 `export type` 語句（fail-closed，
  形狀可比照 `tests/react-surface-lifecycle.test.js` 的既有清單斷言）。

### 驗收條件

**選項 A**：
1. `src/data/index.ts` 已刪除，附反向 grep 空輸出。
2. `npm run test:ci:frontend` 全綠。
3. 說明為什麼選 A（例如「barrel 零消費者、型別已集中、避免多一條 import 路徑」）。

**選項 B**：
1. 附**驗收方那個 canary 的紅燈輸出**：在 barrel 加一行 runtime export
   （`export { createDataApi } from "./repositories/dataRepository.ts";`）
   並從 `src/pages/` 任一檔 import 使用 → lint 或 typecheck 紅。還原後綠。
2. 附**型別 import 不受影響**的證明：`import type { SessionSummary } from "../data/index.ts"`
   在 page 中仍然綠。
3. 若用靜態測試：另附「把 `export type` 改成 `export`」→ 測試紅的 canary。
4. `npm run test:ci:frontend` 全綠。
5. 說明 barrel 保留下來要給誰用（若答不出消費者，請改選 A）。

---

## A-3（補件）揭露兩處執行期行為變更與新斷言

回報全文沒有出現 `?? sessionId`、`as never`，也沒有任何行為變更說明。實際有三處：

**1. `loadSessionJoinPreview`**（`src/data/repositories/dataRepository.ts:308-310`）

```diff
- async function loadSessionJoinPreview(sessionId: unknown) {
-   const normalizedSessionId = asNumber(sessionId);
+ async function loadSessionJoinPreview(sessionId: number) {
+   const normalizedSessionId = asNumber(sessionId) ?? sessionId;
```

**2. `loadSessionMessages`**（`src/data/repositories/dataRepository.ts:329`）

```diff
-      .eq("session_id", asNumber(sessionId))
+      .eq("session_id", asNumber(sessionId) ?? sessionId)
```

`asNumber` 對非數值回傳 `null`（`src/data/mappers/valueMappers.ts:1-5`）。
改動後非數值輸入不再被正規化成 `null`，而是原樣傳給 PostgREST。
呼叫端 `sessionController.js` 是 `.js` 且未開 `checkJs`，
簽名從 `unknown` 收成 `number` **不產生任何編譯期強制**——
淨效果是「型別看起來變嚴、執行期正規化變鬆」。

**3.** `as never` 未列入 §2.2 的斷言盤點（見 A-1）。

### 驗收條件

1. 三處逐一揭露，每處說明改動理由。
2. 第 1、2 項另需明確選擇並說明：
   - 刻意接受這個失敗路徑差異（說明為什麼安全，附呼叫端證據）；或
   - 改成非數值直接拋錯；或
   - 保留 `asNumber` 的 `null` 語意（把型別問題用別的方式解決）。
3. 若選擇改動行為，附對應測試證明新行為，並確認沒有 e2e 依賴舊行為。
4. §2.2 的斷言盤點補上 `as never`（若 A-1 已讓它退役，則寫明「A-1 已退役」）。

---

## 不在範圍（不要順手做）

1. 不做 F1R（批 1 的 local 焦點迴歸）——那是獨立派工單。
2. 不回退 2A 已通過的部分：`selects.ts` 字串 literal、`literalGuards.ts` 的
   `Record<Union, true>`、`supabaseClient.js` 的 JSDoc 路線、`rowsOrEmpty`、
   `instanceof` 改動。
3. 不做 F2-6〜F2-9 與 `drawerScrollPositions` 退役（2B）。
4. 不做 F2-1〜F2-4 拆檔（2C／2D）。
5. 不動 `src/data/databaseTypes.ts`、`.claude/rules/`、CLAUDE.md、testid、既有文案。
6. 不動 `src/syncCommit.ts` 與 F0-9 建立的守門。

若你認為其中任何一項應該提前處理，**提出建議，不要靜默實作**。

---

## 回報要求

寫成 `docs/arch-dispatch-2026-08-24-frontend-F2A-followup-report-codex.md`，
**不列入實作 commit、不執行 push**。程式碼修改做成 commit。

- 改了什麼（檔案清單＋每檔一句話）。
- 驗收條件逐條對照，每條附指令＋實際輸出，不是「已確認」三個字。
- 技術陳述帶 `[已驗證]`／`[推論]`／`[不確定]` tag。
- canary 附完整輸出（紅的那次與還原後綠的那次都要）。
- 未做／做不了的項目明說原因，不可留白。

### 收尾必跑

`npm run test:ci:frontend`、`npm run test:db` 全綠＋`git diff --check` 空輸出。
`npm run test:local` 若 F1R 尚未落地會有一條既存紅燈（見 F1R），
請照實貼輸出並指明那條紅燈與本補件無關。

### 執行注意

跑 Playwright 期間不要並發其他 `node --test` 或第二個 dev server。
單一 timeout 類紅燈先用 `--repeat-each=10 --retries=0` 取樣再下判斷。
