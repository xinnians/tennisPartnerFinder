# 批 6 前置小批驗收紀錄（兩處零餘裕測試下限改寫）

- 日期：2026-08-27。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-27-batch6pre-thresholds.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-27-batch6pre-thresholds-report-codex.md`。
- 驗收方法：本機重跑 gate＋diff 審閱＋三組 canary 全數親自複跑（test-only
  小批，未另派對立審查 agent，比照批 4A）。

## 結論：**ACCEPTED**——批 6 主體可開工

## 通過項（全部本機重驗）

1. **Gate 全綠一次過** [已驗證]：typecheck／lint／prettier／`git diff --check`
   exit 0；unit 346、mock 298／4、local 45／11（依派工單不豁免，作為探針
   還原自證）。
2. **範圍自證** [已驗證]：diff 恰兩測試檔＋回報；`src/` 零 diff、無探針殘留；
   build／bundle 豁免前提成立（CSS 只經 `main.js` import 進 bundle，探針從未
   被 import）。
3. **三組 canary 全數親自複跑三拍** [已驗證]：
   - 漏掃：discovery 排除 `src/style.css`→紅指名「缺少載重錨點 src/style.css」
     （未先撞非空／containment）→還原綠；
   - 空檔：0-byte 探針→紅「讀取異常（空檔）」→刪除綠；
   - 小檔放行：56-byte 合法探針在新 guard 綠、暫時回舊 `>100` guard 紅
     （證明舊門檻確實誤擋合法小檔——本批目的的直接證據）→還原。
   兩檔 hash 回到基準（`108c7afb…`／`edf9ae63…`）。
4. **改寫品質** [已驗證]：錨點三檔（`style`／`vocabulary`／`sheet-shells`）
   皆在 `main.js` import 鏈、跨全域／殼／語彙三載重層；無新裸數字、無全量
   清單；既有疊層（containment `deepEqual`／sourceAnchors／`>=65` floor／
   逐目錄非空）零 diff；`:32-33` stale 註解勘誤如實（64→113）。

## 量化更新

- 零餘裕下限歸零：CSS `>=13` 與每檔 `>100 bytes` 皆改為「掃描完整性」形式；
  `legacy-style-scan` 的 `>=65` floor（餘裕 49 檔）保留。
- 批 6 主體解鎖：小型 TS contract leaf 不再被大小門檻誤紅；CSS 整併不再被
  計數卡住。
- 批 6 設計輸入：Codex 回報 §5.5 的 `.js` TS 化優先序（leaf 四檔→狀態三檔→
  `dataApi`／`sessionController` 各自立批→features 殿後；`main.js`／
  `sessionViews.js`／views 明確列為暫不轉）採納為批 6 主體切批基礎。
