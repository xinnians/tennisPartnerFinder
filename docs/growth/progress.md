# 產品改善進度（接續先讀）

最後更新：2026-09-09。第一批 G02／G03／G04 已上線；G09 視覺提案 v1 與 G10 計畫均已核可，已完成實作、必要 CI 與正式部署；正式站驗證及成效分開記錄。

## 當前狀態

- 使用者已核可依競品清單開始改善、建立目標與維護跨 session 進度。
- 最新範圍：G09 球場指南與 G10 逐局分享預覽均已核可並完成初版實作，必要回歸通過並已於 qiuka.tw 上線。G01、G05–G08、G11–G12 暫緩。
- [G09／G10 計畫](g09-g10-plan-2026-09-09.md) 及 [已核可視覺稿](g09-design/README.md) 是本批範圍；本輪無新增商業功能或 DB migration。
- 已建立計畫、第一批規格、試點基準模板與根目錄接續指引。
- 第一批 G02／G03／G04 已完成實作、必要 CI 與正式部署，qiuka.tw 已驗證新版；沒有真實成效結論。
- 使用者已於 2026-09-09 明確授權直接部署。PR #1 已合併，runtime commit `9c54f7e`，Vercel `dpl_7ctFBj2NXGzuKzdmP9BKJ5CLWEPQ` READY。詳細證據與未測範圍見 [發布紀錄](batch-1-release-2026-09-09.md)。本機已切回 main，後續文件更新亦提交保存。
- 原競品分析為同一任務新增的文件，應一併保留。
- 使用者另核可重新評估大小限制；本機 build／量測規則已更新，網站 runtime 未變。效能預算獨立提交為 `b9bb9d2`，本批 Git push 已保留這些變更；理由與驗證見 [效能預算重評](performance-budget-2026-09-09.md)。

| ID | 規格／準備 | 程式 | 本機 QA | 部署 | 成效 |
| --- | --- | --- | --- | --- | --- |
| G01 | 基準模板保留，實際試點暫緩 | 事件追蹤未實作，暫緩 | 不適用 | 不適用 | 未取得 |
| G02 | 完成 | 完成 | 通過 | 已部署 | 待觀察 |
| G03 | 完成 | 完成 | 通過 | 已部署 | 待觀察 |
| G04 | 完成 | 完成 | 通過 | 已部署 | 待觀察 |
| G05 | 使用者暫不考慮 | 暫緩 | 不適用 | 未部署 | 未取得 |
| G06 | 使用者暫不考慮 | 暫緩 | 不適用 | 未部署 | 未取得 |
| G07–G08 | 使用者暫緩，既有計畫保留 | 暫緩 | 不適用 | 未部署 | 未取得 |
| G09 | 核可；三篇官方來源查核完成 | 完成 | 通過 | 已部署 | 未取得 |
| G10 | 計畫已核可 | 完成 | 通過 | 已部署 | 未取得 |
| G11–G12 | 使用者暫緩，既有計畫保留 | 暫緩 | 不適用 | 未部署 | 未取得 |

## 2026-09-09 G09／G10 已上線

- [球場指南](https://qiuka.tw/courts/)：青年公園、彩虹河濱、台北網球中心三篇；官方來源、待確認欄位、近期球局、指定球場開局及訂閱設定入口完成。登入返回保留場地／通知設定位置，不自動發布或改訂閱。
- G10：分享改為 `/s/:id`，伺服器提供逐局公開標題與摘要，沿用品牌圖；既有 `#/session/:id` 仍可開啟。不存在 404／上游失敗 503 使用中性摘要，no-store，僅查匿名 allowlist。
- [PR #2](https://github.com/xinnians/tennisPartnerFinder/pull/2) 已合併；runtime head `6c74c209e20ccf2682c044078009be64cd5a4c1f`，main merge `957dcbad1abda0c3e8d51ffb8c6208c8be840ee5`。Git production deployment `dpl_Ep3TqQ1A86iEDrhYDvU9xD85GHon` READY，qiuka.tw alias 已指向新版。零 migration／hosted DB 寫入／Edge 變更。
- 必要 CI [34323850447](https://github.com/xinnians/tennisPartnerFinder/actions/runs/34323850447) Frontend／Supabase 成功：775 unit、384 Chromium、1,305 SQL、4 API、46 local browser、6 mobile、14 production preview、四組 Edge 整合通過；略過項目及 Safari 結果見 [QA](g09-g10-qa-2026-09-09.md)。
- Safari 非阻擋組 190 passed／1 failed／3 skipped；失敗為既有殼可操作 2,598ms 超過 2,500ms。新功能 production-preview WebKit 6 passed。沒有全瀏覽器全綠宣稱。
- 正式設定嚴格容量 gate 通過：main 385,456／119,303；root static 660,635／193,194；guide static 276,598／74,725；total 941,157／282,086 raw／gzip bytes。索引 JS 0，指南無 Maps，未提高上限。
- 正式站桌面／390px smoke、三篇指南 HTTP、分享 GET／HEAD／404／405 通過；首頁各三次首訪容量最大 787,615 raw／242,287 encoded bytes，在核可上限內。手機首頁 LCP 中位數 8,184ms、指南單次 3,092ms，尚未達 2.5s 參考值。詳見 QA 及原始 JSON。
- 本分支臨時 Preview 公開 Supabase 設定與 Production env export 已清理；進度文件持續保存於 main。
- 真實 LINE／Facebook 對話卡片未代發驗證；沒有真實留存／轉換數據。其他暫緩 G 項不因本次上線自動啟動。

## 下一步

1. 依使用者實際回饋修正 G09／G10；若要取得轉換／留存數據，先重新確認是否啟動已暫緩的 G01，不把工程測試當產品成效。
2. G01、G05–G08、G11–G12 保持暫緩；Maps 手機 LCP 與 Safari 首屏時間仍是已知效能限制。
3. 指南於 2026-12-08 前重新查核官方來源，更新 `data/court-guides.json` 並重建發布；90 天提示是 build-time，不是自動背景查核。
4. 若日後回復 G10，保留已散佈 `/s/:id` 的 handler 或相容轉址。發布證據及未測範圍見 QA 文件。

## 決策與變更日誌

### 2026-09-09：G09 視覺稿核可，開始 G10／G09 實作

- 使用者明確表示「ok，同意」，核可 G09 視覺提案；連同既有 G10 授權按計畫開發，不再要求重複確認。
- 以 `codex/court-guides-share-preview` 分支工作，先 G10，再 G09；沿用既有視覺與 React／前端測試 skills。原有未提交效能預算及文件保留。
- 下一步：完成 share handler／模板打包／路由與測試，再做靜態指南及既有流程連接；實作、QA、部署與成效各自記錄。

### 2026-09-09：G09 視覺提案 v1 完成

- 使用者「ok」承接先做手機／桌面視覺稿的建議；本輪採 `frontend-app-builder` 的 Concept Review Mode 與 `imagegen` built-in 工具，未實作網站。
- 產出指南索引與青年公園指南各手機／桌面四張，加載入／空／錯誤／待確認狀態一張；最終 PNG、精確 prompts 與審閱說明保存於 `docs/growth/g09-design/`。
- 已檢視圖片，手機初稿橘色缺額改回深綠。示意球局與待查內容明確記錄，未宣稱真實供給或完整官方成稿。
- `git diff --check` 通過；未執行產品／browser 測試、未改 runtime／DB／環境、未部署。其他工作區修改保留。
- 下一步：請使用者確認 G09 視覺提案或提供修改；G10 核可狀態維持，不以 G09 待確認否定其授權。

### 2026-09-09：G10 核可，G09 先了解 UI 設計

- 使用者表示「G10 ok」，核可逐局文字預覽＋既有品牌圖片計畫，不再要求同一項確認。
- 使用者詢問 G09 UI 是否有規劃；補充索引、手機單欄、桌面雙欄、動作層級與狀態設計建議，明確區分已完成的結構規劃與尚未製作的視覺稿。G09 未核可程式實作。
- 本輪只改計畫與進度文件，`git diff --check` 通過；未改 runtime、未跑產品測試、未部署。
- 下一步：G10 可獨立按核可計畫開發；G09 先確認 UI 方向與視覺稿。

### 2026-09-09：G09／G10 規劃完成，依使用者要求等待確認

- 已讀並套用 `react-best-practices` 與 `frontend-testing-debugging`；檢視可用工具、原始碼、公開 view 與部署／測試規則，未安裝插件或使用 sub-agent。
- 新增具體計畫，包含三座候選指南、內容來源、逐局 OG 公開欄位、舊連結相容、錯誤／快取／登入狀態、工作包、驗收、效能預算與回復方式；README 及總計畫加入入口。
- 以 web 與正常 TLS HTTP 讀取查核官方資料；部分 web 抓取失敗，青年與台北網球中心室外頁經本機 HTTP 工具取得。室內詳情等未查完欄位保留待查，未把研究初查標成發布成稿。
- 本輪只更新文件；`git diff --check` 通過。未執行產品測試、未變更 runtime／DB／環境、未部署；現有未提交效能預算修改保留。
- 下一步：向使用者確認完整計畫及建議順序；確認前不進入開發。這個停點來自使用者本輪明確要求，不是 skill 的額外審批。

### 2026-09-09：聚焦 G09、G10，其餘未完成項目暫緩

- 使用者表示「目前對 G09、G10 比較有興趣，其他先暫緩」，因此將 G09／G10 列為優先評估方向，未宣告開始實作或完成規格。
- G01、G05–G08、G11–G12 暫緩；G02–G04 維持已部署。G01 已有模板保留，跨 session 進度維護繼續。
- 更新計畫與進度的現行狀態、依賴及下一步，保留歷史決策；`git diff --check` 通過。僅文件變更，未執行產品測試、未部署。
- 下一步：檢視 G09 的球場研究及 G10 的分享／路由現況，整理最小規格與驗收條件。

### 2026-09-09：G05 也暫緩，一併了解其餘項目

- 使用者表示「G05 也暫緩」，因此 G05、G06 均保持暫緩，不進行首頁或信任／玩法調整。
- 本次整理 G01、G07–G12 的方案說明；不視為使用者已選定或同意實作這些項目。G02–G04 維持已部署狀態。
- 僅更新計畫與進度文件，以 `git diff --check` 檢查格式；未改動產品程式、未執行產品測試、未部署。
- 下一步：待使用者選定方向後，細化對應規格與驗收條件。

### 2026-09-09：G06 暫緩，先了解 G05

- 使用者表示「G06 先不考慮」，因此暫緩費用／玩法／信任文案調整。
- 使用者目前詢問 G05 內容；此階段提供方案說明，不視為已接受首頁改版或列表預設展開。

### 2026-09-09：重新評估大小限制

- 明確區分平台限制與自行設定的工程預算，原數字保存於首批發布紀錄，不覆寫歷史。
- 採固定維護餘裕、98% 提醒、release 超額阻擋；既有一般 lazy／Sentry／Push 專用上限保留，不按每次 build 滾動提高。
- 新增入口 transitive static imports 去重與 dist 一致性檢查，防止拆檔漏算，以及將 private repository／Sentry／Push 放進靜態依賴。
- 量測工具新增首訪本站 JS raw／CDN encoded bytes 與獨立驗證旗標；不把外部 Maps／字型缺少的大小資料當成 0，也不把 static graph 當全部首訪下載。
- 完整前端 gate 通過：761 unit passed／5 skipped、384 Chromium passed／4 skipped；33 項 policy 測試與嚴格 release gate 通過，0 exceeded。
- 正式站桌面／手機各三次首訪大小驗證通過，最大本站 JS 779,985 raw／236,853 encoded bytes；手機 LCP 中位數 8,164ms 仍未達標。原始量測與重現方式保存在效能預算文件，未改 runtime 或另行部署。

### 2026-09-09：第一批已部署

- PR #1 的 Frontend／Supabase CI 通過；SQL 1,305、API 4、local browser 46、mobile 6、production-preview 4 及四組 Edge 整合通過。
- Safari 非阻擋組：190 passed／1 failed／3 skipped，唯一失敗為殼可操作耗時 2,569ms 超過 2,500ms；production-preview WebKit 1 passed。保留失敗，不標示全瀏覽器全綠。
- 正式站 1280×844／390×844 驗新版加入提示、真實剪貼簿摘要、支援與隱私連結、頁面標題與畫面。Application console／pageerror 為 0；headless Google Maps 各出現一次 vector→raster fallback，已分開記錄。
- 正式站 smoke 全程匿名，不建立球局、不發訊息或通知；登入後重開的新局建立與原局不變由本機實際 RPC 驗證。成效、試點與事件追蹤尚未完成。
- 同一版本慢速手機 lab 單次 LCP 8,160ms，仍有既有 Maps 瓶頸；不宣稱本批已改善手機 LCP。

### 2026-09-09：授權發布

- 使用者明確表示「可以直接部署上去」。授權包含本批 commit、推送、合併與正式部署。
- 範圍僅第一批 G02／G03／G04 與進度文件；零 migration，不改 Hosted DB／Edge／環境設定。既有兩帳號／OAuth／cron 歷史結果不重寫為本批新驗收。
- 確認 main、工作分支與目前正式站基線皆為 `770efcf`；Vercel production branch 為 main。Migration 41／41 local↔remote 對齊。
- 正式環境 build 初次超過自行設定的 raw JS 總量上限 283 bytes（約 0.03%）。共用新建／重開初值、候選狀態判斷、場地名稱與日期解析後，正式設定嚴格 gate 通過：raw 929,943 bytes、gzip 276,629 bytes；功能規格不變，現場等場採用既有名稱。
- Vercel env export 的 JSON 值需用 Vite `loadEnv` 解析；Node `--env-file` 的引號解析會使公鑰格式檢查失敗。已使用 Vite 原生解析重建，沒有修改 hosted 公鑰或環境值。

### 2026-09-09：啟動

- 已建立 [執行計畫](plan-2026-09-09.md)、[首批規格](batch-1-spec.md)、[試點模板](pilot-baseline.md)。
- G03 首批只產生草稿，明確重選日期時間並重設訂場；歷史候選資料不足時要求重選，保留原資料權限。
- G04 只複製公開球局摘要，沒有代發訊息。G01 只有量測設計，事件追蹤仍待實作。

### 2026-09-09：第一批本機完成

- G02 登入加入提示說清楚程度與審核差異。
- G03 主揪卡「照這局再開」帶入可編輯設定；新日期時間必填、訂場不沿用；候選資料不足需重選。開啟草稿不呼叫建立 RPC，送出沿用既有授權與驗證。
- G04「複製球局摘要」只輸出公開欄位、台北時間、狀態與相容深連結，不含私人文字／成員資料。
- 修正新重開入口關閉表單後的焦點回復問題，1280×844 與 390×844 真實本機 RPC 旅程均通過。
- `npm run test:ci:frontend` 通過：unit 759 passed／5 skipped、Chromium 384 passed／4 skipped；型別、lint、format、build、結構檢查通過。
- `npm run test:local` 通過：API 4 passed、browser 46 passed／12 skipped；`npm run test:local:mobile` 通過：6 passed。
- `npm run check:production-bundle:release` 通過；total JS raw 929,951／929,961 bytes，未放寬上限。零 migration，`test:db` 依規則豁免。
- 詳細命令、畫面與限制見 [QA 紀錄](batch-1-qa-2026-09-09.md)。未部署、未測正式 OAuth／真實 Maps／Safari；未招募、未新增追蹤事件，沒有留存數據。
