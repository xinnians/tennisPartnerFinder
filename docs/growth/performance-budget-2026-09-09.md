# JavaScript 效能預算重新評估

日期：2026-09-09。使用者在首批發布後要求重新評估大小限制。本次調整 build／量測工具與測試，不改網站 runtime、資料庫或畫面。

## 結論

舊門檻適合作為當時重構的防回歸基準，但不適合長期維持只有 18 bytes 的餘裕。保留固定上限與發布阻擋，改用較清楚的維護預算、98% 提醒及分層量測。門檻不會隨每次 build 自動上調。

全部 JS 總量不等於首訪下載量，也不能取代手機體驗驗證。新版同時檢查入口、靜態依賴、瀏覽器實際首訪下載和全部產物；既有 demo／E2E hook／私有資料／Sentry／Push 邊界繼續是 hard gate。

## 基準與來源

- 已發布 runtime `9c54f7e`，文件更新 `ca19bef`；正式環境 build main 653,830 raw／190,017 gzip，total 929,943／276,629，包含延後載入模組與 service worker。
- 原 total 上限由 2026-08 的 841,545／256,497 基準加約 1%，再於 Push v2 上線增加 80,000／18,000。原 main 上限則是早期重構基準加 4 KiB／1 KiB，並非從目前裝置／網路目標推導。
- 2026-09-09 正式站匿名冷啟動，390×844、CPU 4 倍、150ms RTT、200,000 bytes/s，依序三次：本站 JS 都是 8 個資源、779,985 raw／236,853 encoded bytes。這包含啟動期間動態載入的頁面／診斷模組；第三方 Maps、字型及圖磚另計，不把跨來源受限的資源大小 0 當成沒有下載。
- 觀察到地圖容器及字型就緒後再等 2 秒，尚未互動。不代表所有未來觸發的模組，也不保證每片地圖圖磚已完成。
- 最終可重現的六次量測（桌面／手機各三次）與驗證結果見文末及 [原始彙整](performance-budget-baseline-2026-09-09.json)。

## 採用的固定門檻

單位均為 decimal bytes（1 KB＝1,000 bytes、1 MB＝1,000,000 bytes）。gzip 是逐檔本機壓縮加總；encoded 是瀏覽器看到的實際 CDN 壓縮 body，不含 HTTP header。

| 範圍 | 原 raw／gzip 上限 | 新 raw／壓縮上限 | 理由 |
| --- | ---: | ---: | --- |
| Main | 658,867／192,420 | 680,000／200,000 gzip | 正式基準約 4.0%／5.3% 餘裕，限制立即執行程式的成長 |
| 入口＋靜態依賴 | 未獨立檢查 | 700,000／205,000 gzip | 對完整靜態圖去重加總，避免拆檔規避 main 檢查；不能冒稱所有首訪下載 |
| 匿名首訪本站 JS | 未獨立檢查 | 820,000／260,000 encoded | 約 5.1%／9.8% 餘裕，涵蓋在觀察窗內動態載入的模組 |
| 全部 JS | 929,961／277,062 | 1,000,000／300,000 gzip | 約 7.5%／8.4% 餘裕，容納後續功能維護，仍能攔下大型依賴或持續累積 |
| 一般非 main chunk | 18,000／5,500 | 維持 | 目前最大 MySessions 約 16,645／4,794，仍有合理餘裕 |
| Sentry | 90,000／31,000 | 維持 | 專用、來源驗證的 SDK 預算，不能借給其他模組 |
| Push runtime | 75,000／17,000 | 維持 | 專用、必須延後載入的功能預算 |

這些是基於目前產品的工程折衷，不是平台限制或通用「快速網站」標準。較小的首屏預算與較大的全站預算配合使用；不能以 1 MB 總額批准把全部模組放進首屏。

所有 byte budget 在 98% 至 100%（含上限）提醒但通過；超過上限時，開發 report 模式列出差額，release enforce 模式失敗。98% 是提早注意剩餘維護空間的操作提醒，並非測得使用者能感知的差異。

## 工具與驗證方式

- `scripts/productionBundlePolicy.mjs`：固定預算、提醒與阻擋邏輯；靜態圖會去重、處理循環，遇到缺少的依賴或重複輸出名稱即失敗。
- `scripts/check-production-bundle.mjs`：以同一份 Vite 產物追蹤入口的靜態 imports，並逐檔核對 dist；Sentry／Push／私有 repository 不可躲在入口的傳遞依賴中。保留全部 JS raw／gzip hard gate 和 Brotli 報告。
- `scripts/measure-production-performance.mjs`：保留 LCP／CLS 與原 lab 目標；新增冷啟動本站 JS count、raw／encoded，取各條件三次的最大下載量作 byte 檢查。資料不可讀、沒有 script 或 app runtime error 不能當作 byte 成功。

標準指令：

```sh
npm run check:production-bundle:release
node scripts/measure-production-performance.mjs --runs 3 --enforce-startup-byte-limits --output /tmp/qiuka-startup-budget.json
node scripts/measure-production-performance.mjs --runs 3 --enforce-lab-targets --output /tmp/qiuka-lab-targets.json
```

後兩者是不同判定：大小通過不等於手機 LCP 達標。正式網路量測需單獨執行，避免同時 build／測試造成 CPU 競爭；不要把 live 網路波動直接引入原本 mock CI 的可重現檢查。

候選版應以 `--url` 指到該版本、且整合設定可用的穩定 preview；只量舊正式站不能證明新程式沒有增加首訪下載量。本機預設 env 與正式 env 的 bundle 大小也會不同，發布時仍須用正式設定檢查；本次歷史正式 build 基準與新本機檢查結果分開記錄。

## 體驗目標與後續

保留 LCP ≤2.5 秒、CLS ≤0.1 的 lab 目標；field 需依 mobile／desktop 的 p75 評估，INP ≤200ms 也需足量真實互動資料，不能用一次篩選點擊代替。目前沒有足量 field 證據，慢速手機完整 Maps LCP 約 8 秒的問題仍待解決。

下一個效能工作應先追 Maps 請求時機、字型與圖磚 waterfall、主執行緒，而不是再刪幾個 bytes 的文案。若接近警告或引入大型依賴，記錄新舊 chunk、首訪與手機數據後再決策；不得自行按比例滾動提高基準。

參考原則：[web.dev 效能預算](https://web.dev/articles/performance-budgets-101)建議結合容量與使用者體驗指標；[設定第一份預算](https://web.dev/articles/your-first-performance-budget)強調先量測關鍵頁面並因內容調整，其 2018 範例數字不直接當本產品標準；目前體驗定義採 [Core Web Vitals](https://web.dev/articles/vitals)。

## 本批驗證紀錄

| 驗證 | 結果 |
| --- | --- |
| Policy 測試 | 33 passed；包含 98%／100% 邊界、report／enforce、循環／共享靜態依賴、動態排除、缺少依賴與拆檔總量 |
| `npm run test:ci:frontend` | exit 0；typecheck、lint、format、unit 761 passed／5 skipped、Chromium 384 passed／4 skipped、build／結構／diff gate 通過 |
| `npm run check:production-bundle:release` | exit 0；0 exceeded。本機預設 env main 與靜態入口均 653,537／189,879；total 929,650／276,488 raw／gzip bytes |
| 首訪大小實測 | 新量測旗標 exit 0；桌面／手機各 3 次、依序執行。六次 script sizes 都可讀，最大 raw 779,985、encoded 236,853 bytes，pageerror 0 |
| 體驗實測 | 桌面 LCP 中位數 660ms；手機 8,164ms，仍未達 2,500ms。最大 CLS 0.00119 以下；本次沒有執行「通過 LCP 目標」的宣告 |

網站 runtime 未變；本批是 build／量測／測試工具與文件調整，依 repo 規則不需重跑 `test:local`／DB migration 測試，不另行部署網站。目前修改保留於本機工作區，尚未 commit／push；後續接續應保留這些差異。
