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

目前：實作完成，Chromium production-preview 20 passed；完整 frontend 通過（775 unit passed／5 skipped、384 Chromium passed／4 skipped，型別／lint／格式／架構與建置通過）。local／Safari 與必要 CI 已完成，詳見下方結果。正式設定嚴格容量通過：index 1,036 raw／543 gzip bytes，total 942,541／282,718 bytes；主入口 385,456／119,300、root static 660,983／193,317，均未提高上限。已正式發布，沒有產品成效數據。測試畫面暫存 `/tmp/qiuka-guide-search-qa/`；正式進度以 `progress.md` 為準。

本批發布後，下輪可逐批查核其餘台北與新北資料；全台底稿仍待審，其他暫緩 G 項維持原決策。回復時可以撤下索引程式及控制項，保留靜態十篇列表；不需變更 DB 或 G10 分享 handler。


## 本機與 Git 預覽結果

- Local：4 API、46 browser passed／12 skipped；mobile 6 passed。新篩選流程補拍畫面及無 API 斷言後 Chromium 4 passed；production-preview WebKit 9 passed。
- PR #4，head `ffa8299`；預覽 `dpl_6UXYLSqgvUUQFVkofDN4yVDv7Dq2` READY。1280×844／390×844 驗證頁名、完整內容、無 overlay、console／pageerror 0、首屏畫面與真實互動。
- 「河濱＋中山區」只留下大佳、美堤；「青年＋中山區」顯示 0；清除回 10 篇並聚焦名稱欄。Tab 到行政區／清除，Enter 清除；三個控制項皆至少 44px，沒有橫向溢出。停用 JavaScript 仍可看 10 篇並開啟指南。
- 預覽索引僅 1 個本站 JS：1,036 raw／541 CDN encoded bytes，無 Supabase、Maps 或私有模組請求。篩選後不改網址，不新增 SEO 查詢頁。
- Hosted 唯讀 preflight：41 migration local／remote 對齊；profiles 3、sessions 3、participants 3、messages 2、reports 0、outbox 13，既有匿名權限與五個 active cron 保持。零 migration／hosted DB 寫入／Edge 變更，因此無新 DB dump，正式 OAuth／群聊沿用歷史驗證，沒有標為此次重新實測。

| QA 檢查 | 預覽結果 |
| --- | --- |
| 頁面網址與標題 | 通過 |
| 非空內容／無錯誤 overlay | 通過 |
| Console／pageerror | 0 |
| 桌面／手機畫面與溢出 | 通過 |
| 搜尋、交集、零結果、清除、鍵盤 | 通過 |
| 停用 JavaScript 的指南瀏覽 | 通過 |

驗證工具為既有 Playwright（Browser plugin not available）；預覽畫面／JSON 與可重現的 hosted 檢查腳本保存於 `/Users/ian/tennisPartnerFinder-qa/g09-guide-search-2026-09-09/`（repo 外）。以上為合併前預覽結果；正式結果見下節，未取得使用者成效。


## 必要 CI 與合併

[PR #4](https://github.com/xinnians/tennisPartnerFinder/pull/4)，head `ffa8299e1c28abc40ec40653d75f532f5e8c8367` 通過 [Quality Gate 34331278570](https://github.com/xinnians/tennisPartnerFinder/actions/runs/34331278570) 的 Frontend／Supabase 必要 job，合併為 `9b5656cf9dafbf05dd824f3248feaa651c40775e`。

775 unit／384 Chromium、1,305 SQL、4 API、46 local browser、6 mobile、20 production-preview 與四組 Edge 整合通過；略過項目維持原有 unit 5／Chromium 4／local browser 12。非阻擋 WebKit 190 passed／1 failed／3 skipped；唯一失敗仍是既有 `performance.spec.js:59` 首屏可操作時間，2,900ms 超過 2,500ms。WebKit production-preview 9 passed。沒有調高時間或容量門檻，也未宣稱全瀏覽器全綠。


## 正式發布與 QA

Vercel Git production `dpl_GvP5C4E1AgUrqFiY9PakUzNgdZfz` READY，qiuka.tw alias 已更新。正式站 1280×844／390×844 重跑上述六類檢查全部通過，console／pageerror 0；每頁僅一個搜尋 JS，1,036 raw／541 CDN encoded bytes。沒有 Supabase／Maps／私有模組請求，也沒有 hosted 寫入。

十篇指南、索引、sitemap 與既有分享 GET／HEAD／404／405 皆通過；sitemap 維持 12 URLs。實測停用 JavaScript 時十篇可見且指南連結可用。正式畫面（初始／篩選／零結果）、JSON 與可重現腳本位於 `/Users/ian/tennisPartnerFinder-qa/g09-guide-search-2026-09-09/`，不將暫存 QA 圖覆蓋先前版本。

本機 production env export 及本分支臨時 Preview 的兩個公開 Supabase 設定已清除；Production 環境未修改。未重新量測全站 LCP／真實留存；既有 Maps 載入及 Safari 首屏效能限制仍保留。資料底稿維持待審，下一輪可依品質報告逐批查核其餘台北與新北場地。
