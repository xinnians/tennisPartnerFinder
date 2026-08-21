# 批 B1：Supabase 產生型別＋domain literal union 收斂（型別基座）

先讀 `00-overview.md`；共通紅線與回報合約適用。前置：批 A 已 commit。

## 目標與動機

後續所有 TS 化批次都要有可靠的值域來源。目前 `src/domainTypes.ts`（127 行）的
`status`、`joinMode`、`venueType`、`playType` 等欄位是一般 `string`，漏 case 不會編譯錯誤。

## 工作項

1. **產生資料庫型別**：啟動 local stack（`npx supabase start`），執行
   `npx supabase gen types typescript --local` 輸出到 `src/data/databaseTypes.ts`
   （新目錄）。檔頭註記為 generated、禁手改；在 `package.json` 加 `db:gen-types` script
   固化這條指令。產出後人工檢視：不得含任何 secret、金鑰或連線字串。
2. **值域盤點**：以 `supabase/migrations/`（唯讀）的 enum／check constraint 與
   `src/dataApi.js` mapper 實際輸出值為準，列出每個欄位的合法值清單，放進回報檔。
   不得憑印象填值。
3. **literal union 收斂**：`src/domainTypes.ts` 上述欄位改為 literal union（或由
   `databaseTypes.ts` 衍生）。
4. **全 consumer 掃描**：`domainTypes` 目前有 16 個 importer。逐一核對用到這些欄位的
   switch／if 字串比對點；typecheck 抓不到的（存量 `.js` 內的比對）也要 grep 列入回報。

## 凍結白名單

- 可動：`src/domainTypes.ts`、`src/data/databaseTypes.ts`（新）、`package.json` scripts、
  受型別收斂影響的 `.ts`/`.tsx` **型別註記**。
- 禁動：任何 runtime 行為、`.js` 檔案內容、DB。

## 驗收條件

- `npm run typecheck` 綠，且不得以新增 `as`、`any`、`@ts-expect-error` 換綠
  （`rg -n 'as [A-Z]| any|@ts-expect' src/domainTypes.ts src/data/` 輸出附回報）。
- 回報附「欄位 → union 值域 → DB 來源（migration 檔名）→ mapper 來源（dataApi 行號）」對照表。
- 行為零變更：完整 gate 全綠。
- `src/data/databaseTypes.ts` 可由 `npm run db:gen-types` 重現（重跑一次 diff 為空）。

## gate

00-overview 完整 gate（需 Docker；`test:db` 維持豁免）。
CLI 基準：supabase CLI 2.115.0。gen types 失敗或版本不支援 → BLOCKED，不要改用手寫型別替代。

## commit 與回報

- commit：`refactor(arch-B1): 加入 DB 產生型別並收斂 domain literal union`
- 回報檔：`docs/arch-reports/batch-B1.md`。
