# 批 B3：dataApi 資料層 TypeScript 化與拆分（本管線最大批）

先讀 `00-overview.md`；共通紅線與回報合約適用。前置：B2 已 commit。
**必拆兩個子批 B3a、B3b，各自過 gate、各自 commit。**

## 目標與動機

`src/dataApi.js`（1,178 行）是唯一瀏覽器資料邊界，卻在 `checkJs: false` 範圍外。
目標：內部拆成 typed mapper／repository／auth API，**對外 facade 與行為完全凍結**。

## 契約測試現況（開工前必讀；2026-08-21 由驗收方實測）

`tests/session-data-boundary.test.js`（1,100+ 行）的三類斷言與本批的實際關係：

1. **mapper allowlist 測試**（如第 249 行起「keep an explicit allowlist」系列）：從
   `../src/dataApi.js` import **實際函式**並斷言回傳物件的 key 集合——是 runtime 斷言，
   不是原始碼掃描。只要 facade 公開符號與行為凍結，這些測試應保持綠；變紅代表你動到了
   不該動的行為，不是「預期內的搬移紅」。
2. **LINE token／`line_id` 原始碼掃描**（第 170-219 行）：經 `readFrontendScriptSources`
   遞迴讀整個 `src/` 與 `public/` 樹，新增的 `src/data/**` 會被自動涵蓋，預期不需要改
   測試。開工時先讀該 helper 確認遞迴範圍沒有目錄過濾；若有過濾導致 `src/data/**` 未被
   涵蓋，演進它並附語意對照。
3. **source scan 類**（第 403-469 行的 `readFile` 呼叫）：掃描對象是 `src/main.js`
   （controller API 區塊、bottom navigation 等），與 dataApi 拆分無關；本批禁動
   `main.js`，這些測試不應變紅——若變紅，當成越界警報處理，不是演進對象。

結論：本批預期的測試變動**遠小於大規模演進**。任何變紅的測試先分類
（行為回歸／越界警報／真正需要演進），分類表進回報，再決定處置。

## 其他已知地雷

- `save_my_profile` 呼叫點必須原樣傳 `p_line_id: null`（凍結簽名），不得省略、不得改值。
- select allowlist 逐字保留：公開匿名面欄位不增減。

## 工作項

**B3a：mapper 抽出＋TS 化（facade 不變）**

1. 建 `src/data/mappers/`，把 dataApi 內純轉換函式搬出並補型別（用 B1 型別）；
   `src/dataApi.js` 改為 import 這些 mapper，公開符號與行為不變。
2. 變紅測試依上節分類處理；真正需要演進的（例如字面綁 `src/dataApi.js` 路徑的斷言）
   保持非空斷言與等語意。

**B3b：repository／auth 拆分＋facade 化**

1. 建 `src/data/repositories/`（`.from()`／`.rpc()` 呼叫）與 `src/data/authApi.ts`；
   `src/dataApi.js` 變成 thin facade，原樣 re-export 既有公開符號。
2. 公開符號集合以現有測試的 import 清單為準（`tests/session-data-boundary.test.js` 第 30 行
   起的 `from "../src/dataApi.js"` import 區塊）；一個都不得增刪改名。
3. 「`src/` 其他區域零 supabase 呼叫」的驗收 sweep：`.rpc(` 與 supabase client 的 `.from(`
   只允許落在 facade＋`src/data/**`。注意 `src/notificationPush.js:10` 的 `Uint8Array.from`
   是 regex 假陽性，sweep pattern 要能區分。

## 若需演進契約測試時的規則

- 先在回報寫「原斷言語意 → 新斷言語意」對照，兩者必須等價或更嚴。
- 掃描集非空斷言一律保留；新增掃描目錄也要有非空保護。
- allowlist 類測試逐字等值搬移，不得趁機增減欄位。

## 凍結白名單

- 可動：`src/dataApi.js`（內部結構）、`src/data/**`（新）、分類後確認需演進的契約測試。
- 禁動：facade 公開符號集合與簽名、所有 allowlist 欄位、`p_line_id: null`、RPC 名稱集合、
  `src/main.js`、任何 UI／controller 檔案。

## 驗收條件（每子批）

- 完整 gate 全綠。
- `rg -n '\.rpc\(' src` 與 supabase client 的 `.from(` 呼叫全部落在 facade＋`src/data/**`
  （回報附輸出）。
- facade 公開符號 diff 為零：回報附「拆分前後 export 清單」對照表（用指令產出，不手抄）。
- `p_line_id` grep 仍存在且值為 null（回報附 `rg -n 'p_line_id' src` 輸出）。
- 變紅測試分類表完整；被歸類為「演進」的測試附語意對照。

## commit 與回報

- commit：`refactor(arch-B3a): 抽出 typed mappers`、`refactor(arch-B3b): 拆分 repository 與 auth facade`
- 回報檔：`docs/arch-reports/batch-B3a.md`、`batch-B3b.md`。
