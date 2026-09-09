# 產品改善進度（接續先讀）

最後更新：2026-09-09。G02／G03／G04／G10 已上線；G09 已擴至 16 篇並加入名稱／行政區查找，均已正式部署，全台 562 筆待審底稿與品質報告已建立。正式站驗證及真實成效分開記錄。

## 2026-09-09 補完目標已啟動

- 使用者「建立相關目標開始進行」核可執行。已建立本批目標：C01 民權、青年、道南、百齡社子岸四座高影響疑義，以及 C02 北投運動中心、天母兩座來源查核。
- 工作分支 `codex/court-guide-completion-c01`；[六座本批查核](court-guide-completion-c01-2026-09-09.md)完成，北投指南及青年／道南／百齡補強已實作。天母維持未發布，其餘關鍵缺口保留；C01全部15篇及C02全部10候選仍未完成。
- 本機完整frontend／local／mobile／preview Chromium與WebKit、正式容量及hosted preflight通過。PR #6 head `57ace4e`，Git preview `dpl_G34nh9MMFQXjK4CDYErdUHK57pRZ` READY；必要CI成功，PR #6已合併，正式Vercel `dpl_4HaKw7ybmYrMQYTgvbgmXGGbVNUf` READY；qiuka.tw 16篇／sitemap18、桌面及390px搜尋／開局登入取消通過。

- 本批目標已完成：16篇已發布、台北45筆未發布；14篇18欄pending（含本批明列的既有疑義），沒有宣稱疑義清零。首訪容量最大788,254／242,634 raw／encoded bytes通過，手機LCP 8,164ms及Safari首屏2,632ms限制保留。臨時Preview設定與Production env export已清理。

## 當前狀態

- 使用者已核可依競品清單開始改善、建立目標與維護跨 session 進度。
- 最新範圍：G09 十六篇球場指南與名稱／行政區查找、全台待審底稿，以及已上線的 G10 逐局分享預覽；C01首批查核完成，北投及既有指南補強已於 qiuka.tw 上線。G01、G05–G08、G11–G12 暫緩。
- [G09／G10 計畫](g09-g10-plan-2026-09-09.md)、[已核可視覺稿](g09-design/README.md) 與 [本批擴充](g09-expansion-implementation-2026-09-09.md) 為範圍依據；本輪無新增商業功能或 DB migration。
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
| G09 | C01首批及C02前兩座有查核處置，部分資訊仍待確認 | 北投新增完成；全台底稿待審 | 必要檢查通過，Safari時間限制保留 | 十六篇已部署，底稿未公開 | 未取得 |
| G10 | 計畫已核可 | 完成 | 通過 | 已部署 | 未取得 |
| G11–G12 | 使用者暫緩，既有計畫保留 | 暫緩 | 不適用 | 未部署 | 未取得 |

## 2026-09-09 G09／G10 已上線

- [球場指南](https://qiuka.tw/courts/)：青年公園、彩虹河濱、台北網球中心三篇；官方來源、待確認欄位、近期球局、指定球場開局及訂閱設定入口完成。登入返回保留場地／通知設定位置，不自動發布或改訂閱。
- G10：分享改為 `/s/:id`，伺服器提供逐局公開標題與摘要，沿用品牌圖；既有 `#/session/:id` 仍可開啟。不存在 404／上游失敗 503 使用中性摘要，no-store，僅查匿名 allowlist。
- [PR #2](https://github.com/xinnians/tennisPartnerFinder/pull/2) 已合併；runtime head `6c74c209e20ccf2682c044078009be64cd5a4c1f`，main merge `957dcbad1abda0c3e8d51ffb8c6208c8be840ee5`。Git production deployment `dpl_Ep3TqQ1A86iEDrhYDvU9xD85GHon` READY，qiuka.tw alias 已指向新版。零 migration／hosted DB 寫入／Edge 變更。
- 必要 CI [34323850447](https://github.com/xinnians/tennisPartnerFinder/actions/runs/34323850447) Frontend／Supabase 成功：775 unit、384 Chromium、1,305 SQL、4 API、46 local browser、6 mobile、14 production preview、四組 Edge 整合通過；略過項目及 Safari 結果見 [QA](g09-g10-qa-2026-09-09.md)。
- Safari 非阻擋組 190 passed／1 failed／3 skipped；失敗為既有殼可操作 2,598ms 超過 2,500ms。新功能 production-preview WebKit 6 passed。沒有全瀏覽器全綠宣稱。
- 正式設定嚴格容量 gate 通過：main 385,456／119,303；root static 660,635／193,194；guide static 276,598／74,725；total 941,157／282,086 raw／gzip bytes。索引 JS 0，指南無 Maps，未提高上限。
- 正式站桌面／390px smoke、三篇指南 HTTP、分享 GET／HEAD／404／405 通過；首頁各三次首訪容量最大 787,615 raw／242,287 encoded bytes，在核可上限內。手機首頁 LCP 中位數 8,164ms、指南單次 3,092ms，尚未達 2.5s 參考值。詳見 QA 及原始 JSON。
- 本分支臨時 Preview 公開 Supabase 設定與 Production env export 已清理；進度文件持續保存於 main。
- 真實 LINE／Facebook 對話卡片未代發驗證；沒有真實留存／轉換數據。其他暫緩 G 項不因本次上線自動啟動。

## 2026-09-09 租借系統入口更正

- 使用者指出場地租借 2.0；已核對體育局官方 2026 年 7 月起檔期切換說明。先前漏查切換公告，已修正現行指南內容。
- 彩虹改至 `/venues/19`，青年網球委外場地改至 `/venues/1098`；台北網球中心保留營運官網。舊版無法在新系統確認的固定場次／夜間及設施細節改為待確認。
- 詳細來源、範圍與維護規則見 [租借系統更正](g09-booking-system-correction-2026-09-09.md)。4 項 unit、build／嚴格容量 gate 已通過；桌面／390px 渲染、錯誤重試、零 Maps／console error 2 項通過；已 Git 部署並驗證正式站。內容 commit `05b6ca0`，Vercel `dpl_E2LMyHTUc1QfBMRxkN2UaQja96Hh` READY。兩篇正式 HTML 均 200、指向新系統且不再包含舊租借網址。

## 2026-09-09 G09 擴至十篇／全台底稿已建立

- 使用者「ok，請開始」已核可台北指南擴至 10–15 篇與全台待審底稿；沒有跨縣市開局核可。
- 既有正式目錄 89 座（台北 61、新北 28）維持不變，正式指南由 3 篇擴至 10 篇：新增大佳、美堤、華中、中正、古亭、道南、延平；逐頁查核場地租借 2.0。
- 已新增七篇指南，共 10 篇；全台來源 15,001 列篩出 562 筆待審候選，產生品質報告及離線驗證。正式球場 seed／DB 維持不變；底稿不進網站 bundle。
- 工作分支 `codex/g09-expansion-national-catalog` 已合併；[執行紀錄](g09-expansion-implementation-2026-09-09.md)、[品質報告](national-courts-quality-2026-09-09.md) 保存查核差異與接續方法。本機 frontend／local／mobile／preview 與正式容量均通過，PR #3 必要 CI 成功並已合併、Git 正式部署完成；其他暫緩 G 項仍不啟動。
- Runtime head `87ed4f8`，merge `1ef7ef4`，正式 Vercel `dpl_Ceey3tZy4Lja7pAgVm8t2XNfUHok` READY。十篇與索引 200、sitemap 12 URLs、待審資料路徑 404；正式桌面／390px 開局到登入、分享、剪貼簿與版面通過，無 hosted 寫入。
- CI 775 unit、384 Chromium、1,305 SQL、4 API、46 local browser、6 mobile、16 preview 及四組 Edge 通過；WebKit 190 pass／1 fail／3 skip，既有首屏時間 2,887ms 超過 2,500ms；新 preview WebKit 7 pass。詳細略過／量測限制見執行紀錄。
- 562 筆為候選來源列（505 一般網球候選），不是完整場館數；86 組疑似同地點、兩筆金門／連江代碼衝突及校園使用資格待查。全台公開與跨縣市開局尚未啟動。

- 正式首頁各三次首訪 JS 最大 787,963 raw／242,530 encoded bytes，未超過 820,000／260,000 上限；pageerror 0。手機 LCP 中位數 8,188ms，指南單次 3,092／3,100ms，既有效能限制仍在。臨時 Preview 設定、Production env export 與原始 CSV 暫存已清理，接續資料與 QA 保存於 main。

## 2026-09-09 指南查找已上線

- 使用者「ok，照你建議做」核可名稱搜尋、行政區篩選、篇數與清除；[本批規格與 QA](g09-guide-search-2026-09-09.md)。已實作，frontend、local／mobile、Chromium preview 20 項與 WebKit preview 9 項通過，正式容量及 PR #4 的 Git 預覽已驗證，必要 CI 成功並已合併與正式部署。
- Runtime `ffa8299`，main merge `9b5656c`，Vercel `dpl_GvP5C4E1AgUrqFiY9PakUzNgdZfz` READY。正式桌面／390px 搜尋、行政區交集、零結果、清除、鍵盤及無 JS 瀏覽通過；console／pageerror 0。索引 JS 1,036 raw／541 CDN encoded bytes，不載入 API、Maps 或私有模組。
- 必要 CI 775 unit、384 Chromium、1,305 SQL、4 API、46 local browser、6 mobile、20 preview 及四組 Edge 通過。WebKit 190 pass／1 fail／3 skip，既有首屏 2,900ms 超過 2,500ms；新 preview WebKit 9 pass。沒有提高預算或全瀏覽器全綠宣稱。
- 不新增指南／球場或公開全台底稿，其他暫緩 G 項維持。臨時 Preview 設定及 production env export 已清理，發布文件提交保存；真實成效仍未取得。

## 2026-09-09 G09 第二批十五篇已上線

- 使用者「ok，請繼續」核可先補強現有十篇，再查核新增 5–10 篇台北指南；資訊更正入口留待後續，不連帶啟動其他 G 項或全台公開。
- 工作分支 `codex/g09-guide-batch-two`；先以現行新租借系統及營運官網確認費率、照明、預約及入場條件，無證據保留待查，不套用舊系統價格。
- 十五篇內容完成；新增百齡社子岸、觀山、成美右岸、民權及台北網球場，補強既有十篇一般費率、預約與入場資訊。青年清晨時間衝突、河濱各面照明及民權現場使用方式仍 pending；天母、北投未取得足夠現行來源，未發布。
- Runtime `5657104`、PR #5 head `81cd213`；必要 Quality Gate 34335417749 成功，merge `3eee6f2`，Vercel `dpl_4YKCWdv6eX5VyG5H9Cq3MASHrds7` READY。正式十五篇／索引200、sitemap17、未知指南及全台底稿404；桌面1280×844／手機390×844搜尋、新行政區、零結果、清除、無JS與重點詳情頁通過，console／pageerror0，新增五篇匿名登入／取消共10次通過，無 hosted 寫入。
- CI 775 unit／384 Chromium、1,305 SQL、4 API、46 local browser、6 mobile、20 production-preview 及四組 Edge 通過。非阻擋 Safari 190 pass／1 fail／3 skip，仍是首屏時間 3,714ms > 2,500ms；production-preview WebKit9通過，未放寬門檻。
- 正式設定嚴格容量 gate 通過：total JS 942,801／282,839 raw／gzip；index1,036／543。臨時 Preview 公開 Supabase 設定已移除，Production 未改；發布／查核差異及待查項目見 [第二批紀錄](g09-guide-batch-two-2026-09-09.md)。產品成效未取得。

- 正式首頁各三次首訪容量通過：最大本站 JS 788,201 raw／242,609 encoded bytes，pageerror 0；手機 LCP 中位數 8,176ms，既有效能限制仍在。Production env export 已刪除，進度及發布證據保存於 main。

## 2026-09-09 球場指南補完計畫已建立

- 使用者要求建立相關補完計畫；已建立 [長期計畫](court-guide-completion-plan.md) 及 [89筆逐場清冊](court-guide-completion-tracker.md)。C00完成，C01–C08列出既有指南補缺、台北候選／校園資格、遺漏補查、新北資料準備、全台分批查核及更正維護規劃。
- 基準為台北61筆（15篇已發布、46筆未發布）及新北28筆；既有15篇有13篇／14欄明示pending。清冊逐列保留slug、優先度、查核／發布狀態、缺口與下一步；來源衝突及面號疑義另列，不把無pending當永久完整。
- 下一工作包C01：民權使用流程、青年時間衝突、道南／百齡面號與夜照；C02先查北投運動中心／天母來源障礙，完整10筆候選名單在計畫。台北61筆目標是逐筆有查核處置，不承諾全部做成公開指南。
- 本輪僅文件，未新增線上查核、產品程式、DB、指南或排程；全台公開、跨城市開局及其他暫緩G項未啟動。已檢查89個slug唯一且與目錄一致、61/15/46/28與13篇14欄基準一致、文件連結及git diff格式；純文件不跑產品測試。

## 下一步

1. 十六篇指南及查找已上線；下一批查C02復興、洲美、榮華，其餘待查來源保留於清冊。後續依 [補完計畫](court-guide-completion-plan.md) 與 [逐場清冊](court-guide-completion-tracker.md) 接續C01/C02，更新清冊及總進度。資訊更正入口仍在規劃，未實作。台北既有61座中16篇已發布，剩餘45筆須逐場查核資格，不承諾全部適合公開。不要把562筆全台候選自動發布或用來停用既有球場。依使用者實際回饋修正 G09／G10；若要取得轉換／留存數據，先重新確認是否啟動已暫緩的 G01，不把工程測試當產品成效。
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
