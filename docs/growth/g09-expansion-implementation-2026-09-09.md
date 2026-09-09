# G09 擴充執行紀錄

2026-09-09 使用者已核可開始「台北指南 10–15 篇＋全台資料底稿與品質報告」。分支 `codex/g09-expansion-national-catalog`；沿用 frontend-testing-debugging 與既有依賴／容量設計。沒有全台開局授權，正式球場 seed 維持不變。

本批目標共 10 篇指南：既有青年、彩虹、台北網球中心，加大佳、美堤、華中、中正、古亭、道南、延平。新增七篇逐一核對新 VBS 可見網球區塊、場租入口與交通；舊面數不得直接沿用。索引維持靜態 HTML，不增加 Maps 或 JavaScript 載入。

全台待審區放在 `data/national/`，不進 `public/`、`src/`、正式 `data/courts.json` 或 migration。僅保留必要公開欄位，不提交管理人姓名、電話、照片或整頁介紹。來源 CSV 沒有場馆 ID，因此官方 ID 保留 null，另記來源列與原檔 hash；本地衍生鍵明確標示，不能偽裝官方穩定 ID。名稱／位置疑似重複只分組，不自動合併不同設施。

底稿分開分類、開放情形、租借情形、查核旗標、指南發布與約球開放狀態；全部維持未審／未發布。品質報告需包含縣市、關鍵字誤入、練習壁／軟網／共用、地理異常、缺漏、相似記錄、既有目錄對照及候選查核順序。年度資料不等於現場可用或即時空場。

驗證：來源鏈與內容單元測試、匯入邊界／資料品質測試、生成檔一致性、完整 frontend gate、local（runtime 對照檔改動時）、preview 桌面／手機與正式設定容量。零 migration，SQL 依既有規則；Git PR 必要 CI 通過後發布指南，正式匿名 smoke。真實成效維持未取得。

## 新指南來源查核結果

七頁均於 2026-09-09 以新系統可見內容逐頁確認「網球」區塊與場租入口，未登入或送出申請：

| 指南 | 官方場館頁 | 網球租借子編號 | 已確認的個別資訊 |
| --- | --- | --- | --- |
| 大佳 | https://vbs.sports.gov.taipei/venues/2 | 341 | 1–5 面、08–22；地址 10 號水門與交通段 7 號水門不一致，指南明示需核對入口 |
| 美堤 | https://vbs.sports.gov.taipei/venues/17 | 174 | 5 面、08–22；大直站 3 號出口官方步行參考 |
| 華中 | https://vbs.sports.gov.taipei/venues/21 | 239 | 列 1–13 面，1–5 標橋下；園區全天不推論網球全天；與舊目錄 10 面不同，先不改正式 seed |
| 中正 | https://vbs.sports.gov.taipei/venues/24 | 266 | 中正網球場 1–6 面、08–22；官方中文誤稱古亭站為板南線，指南不沿用錯誤線名 |
| 古亭 | https://vbs.sports.gov.taipei/venues/28 | 305 | 1–5 面、08–22；公館站與思源街進入方向 |
| 道南 | https://vbs.sports.gov.taipei/venues/22 | 425 | 1–2、4–6、3 號三區分列，僅 4–6 見場租入口；園區全天不推論網球全天 |
| 延平 | https://vbs.sports.gov.taipei/venues/31 | 324 | 1–3 面、08–22；公園範圍長，依面號確認集合位置 |

指南保留逐項來源與待確認條件，不把今天頁面「未開放租借」當永久停用／免費使用。索引 10 篇，沒有宣稱上述場館是熱門排行。

## 本機驗證與發布狀態

- `npm run check:national-courts`：離線重現一致、9 項匯入邊界測試通過。來源為 15,001 列，562 候選，其中 505 一般網球候選；86 組疑似同地點，不自動合併，所有待審資料皆不可直接發布。
- `npm run test:ci:frontend`：型別、lint、格式、775 unit passed／5 skipped、384 Chromium passed／4 skipped、build／結構容量檢查通過。CI 契約已納入新增的兩個資料一致性 gate；既有 gate 保留。
- `npm run test:preview:chromium`：16 passed。新增流程逐一點擊全部 10 篇指南的開局連結，確認指定球場草稿且沒有建立／改訂閱 RPC；桌面與 390px 均通過。索引數量斷言從舊三篇更新為發布清單數量。
- [本機畫面](g09-expansion-qa/local/) 保存十篇索引與指南正常／錯誤狀態；歷史 G09 初版 QA 圖保留不覆寫。
- `npm run test:local`：4 API、46 browser passed／12 skipped；`npm run test:local:mobile` 6 passed。零 migration，SQL 本機依規則豁免，遠端必要 CI 仍執行完整 Supabase gate。
- 正式設定 `check:production-bundle:release` 通過：main 385,456／119,297、root static 660,983／193,312、guide static 276,946／74,848、total 941,505／282,185 raw／gzip bytes；0 超限，index JS 0，指南無 Maps。
- Git 必要 CI 與正式部署尚未完成；產品成效未取得。

## Hosted 唯讀 preflight

2026-09-09：41 個 migration local／remote 對齊；profiles 3、sessions 3、participants 3、messages 2、reports 0、outbox 13，五個 cron active。匿名公開 view 維持既有 25 欄；公開 discovery REST 200，profiles／sessions／participants／chat feed／player directory／my profile 六個私有面 REST 401。

零 migration／hosted DB 寫入／Edge 變更，依既有純前端發布方式沒有新 DB dump；兩帳號 OAuth／群聊與 cron 業務執行沿用歷史驗證，不標成此次重新實測。僅為本工作分支暫設既有 Production 的兩個公開 Supabase 連線值作 Preview；正式環境設定未變，發布後清除分支設定。

## 下輪接續

1. 先審品質報告的地址／縣市衝突、廢除訊號、分類與疑似重複；不要依匯入缺漏停用既有球場。
2. 逐步查核其餘台北目錄與新北候選的公眾資格、現行官方租借方式；費率與照明仍需個別補證。
3. 進一步擴大公開指南前，先改善行政區／名稱查找及資訊回報流程。全台公開、跨縣市開局與自動查核排程須另定範圍；其他暫緩 G 項維持原決策。
