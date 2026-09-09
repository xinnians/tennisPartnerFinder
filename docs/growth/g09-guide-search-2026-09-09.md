# G09 球場指南名稱與行政區查找

2026-09-09 使用者已核可實作名稱搜尋、行政區篩選、符合筆數、清除條件。沿用已發布 10 篇指南；不新增場地、全台公開資料或跨縣市約球。分支 `codex/guide-index-search`。

## 行為與範圍

- `/courts/` 列表上方提供名稱輸入與行政區下拉，兩條件以 AND 合併。行政區選項只取已發布指南，保留「全部行政區」。
- 名稱採部分比對，處理空白、Unicode 正規化與台／臺；中文輸入法組字完成後更新。按 Enter 保持目前結果，不送出表單或跳頁。
- 顯示符合／全部篇數並以 polite live region 宣告；零結果提供改條件或清除提示。清除兩條件並將焦點放回名稱欄；篩選不替換卡片／連結 DOM。
- 原生搜尋欄、下拉與按鈕皆有標籤、鍵盤焦點樣式及至少 48px 高度；手機名稱一列，下列放行政區與清除。
- HTML 預先保留所有已發布卡片與 canonical。控制項在獨立程式初始化後才顯示；停用或無法載入 JavaScript 仍能瀏覽全部指南。
- 不記錄搜尋文字、不呼叫 API、不載入 Maps、React、登入或私有資料模組；此次不新增 URL 查詢參數或搜尋歷史。

## 結構與容量

索引由先前 0 JS 增加獨立 `guideIndexClient.ts`；build gate 要求無靜態／動態 imports、只含本模組、HTML 只引用此入口。沿用一般獨立模組 18,000 raw／5,500 gzip 及全站總量上限，不提高既有預算。DOM mutation／browser port manifest 登記新控制項、卡片隱藏與計數更新的所有權及文件生命週期，既有架構 canary 不放寬。

## 驗證與接續

套用 frontend-testing-debugging；Browser plugin not available，因此使用專案 Playwright。測試流程：列表 → 名稱／行政區交集 → 零結果 → 清除與焦點 → 指南連結；另驗證中文輸入法、台／臺、空白與停用 JavaScript。桌面及 390px 的頁面識別、非空內容、無錯誤 overlay、console、畫面與互動均需留下結果。

目前：實作完成，Chromium production-preview 20 passed；完整 frontend 通過（775 unit passed／5 skipped、384 Chromium passed／4 skipped，型別／lint／格式／架構與建置通過）。local／Safari 與必要 CI 進行中。正式設定嚴格容量通過：index 1,036 raw／543 gzip bytes，total 942,541／282,718 bytes；主入口 385,456／119,300、root static 660,983／193,317，均未提高上限。尚未正式發布，沒有產品成效數據。測試畫面暫存 `/tmp/qiuka-guide-search-qa/`；正式進度以 `progress.md` 為準。

本批發布後，下輪可逐批查核其餘台北與新北資料；全台底稿仍待審，其他暫緩 G 項維持原決策。回復時可以撤下索引程式及控制項，保留靜態十篇列表；不需變更 DB 或 G10 分享 handler。
