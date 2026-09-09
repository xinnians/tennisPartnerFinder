# G09 第二批：使用資訊補強與五篇台北指南

使用者於 2026-09-09「ok，請繼續」核可先補強現有十篇，再新增 5–10 篇。此批新增五篇，總計十五篇；不實作資訊更正入口、不公開全台底稿、不擴大跨城市球局。其他暫緩 G 項不啟動。

## 查核方式與來源

2026-09-09 以 web search 查來源，並用正常 TLS HTTP／Playwright 讀官方公開頁面；新 VBS 清單需要等待 API 回應，初始的「0 個場地」不是實際查無場地。公開列表 API 僅用來定位官方頁面，不作前端依賴。未登入官方租借系統，未送出申請、聯絡人員或訂場。

- [現行開放式場地收費基準](https://laws.gov.taipei/Law/LawSearch/LawArticleContent/FL095531)：頁面所列現行修正 2022-07-28、2022-10-01 生效；從附件入口確認[費率 PDF](https://laws.gov.taipei/Law/File/0000320682)，並實際渲染看過表格。網球一般場地費每面每小時 140 元、照明 80 元另計；一般申請及繳費於使用日前十天完成。以「一般基準」呈現，實際申請適用性與面號需確認；不推論免費輪流、照明存在、空場或當日可訂。
- 新 VBS 彩虹網球「場租租借」連到 `/order?id2nd=201&ty=O`，匿名進入轉會員登入；指南提醒官方登入及申請不等於核准。
- [青年營運專頁](https://winpoweryouthpark.com.tw/場館介紹/網球場區/)：現場購票、不提前預約，六面、日夜一般／優惠費率及入場規則。專頁 05:30 與同站頁尾 06:00、新 VBS 園區 08:00 不一致，清晨時間仍 pending；照明費是否內含不自行推論。
- [網球中心室外](https://www.tsc.taipei/場館介紹/室外網球場outdoor/)與[室內](https://www.tsc.taipei/場館介紹/室內網球場indoor/)：室外尖離峰、照明另計、APP 十分鐘付款及電話預約期限；室內一般網球 2,000 元／面／小時、尖峰一次兩小時。與私人教學／商業費率區分。

## 現有十篇逐場結果

| 指南 | 本次查核來源 | 新增或確認 | 尚待確認 |
| --- | --- | --- | --- |
| 青年 | VBS 1098＋營運網球專頁 | 現場購票、費率、六面與入場 | 清晨時間衝突、各面照明及附加費 |
| 台北網球中心 | 營運室內／室外專頁 | 場租、照明費、尖離峰、付款、室外雨天退費 | 即時場況、賽事臨時調整需出發前再看公告 |
| 彩虹 | VBS 19＋現行基準及附件 | 17 面、官方登入、一般申請費／期限 | 各面夜間、開燈方式／封閉 |
| 大佳 | VBS 2＋現行基準及附件 | 1–5 面、一般申請費／期限 | 夜間；保留 7／10 號水門來源衝突提醒 |
| 美堤 | VBS 17＋現行基準及附件 | 五面、一般申請費／期限 | 各面夜間與開燈方式 |
| 華中 | VBS 21＋現行基準及附件 | 列 1–13、1–5 橋下、一般申請費／期限 | 公園全天非網球全天、夜間與開燈 |
| 中正 | VBS 24＋現行基準及附件 | 1–6、一般申請費／期限 | 各面夜間與開燈方式 |
| 古亭 | VBS 28＋現行基準及附件 | 1–5、一般申請費／期限 | 各面夜間；不能把同園區籃球施工當網球停用 |
| 道南 | VBS 22＋現行基準及附件 | 保留 1–2／4–6／3 分區及 4–6 入口、一般申請費／期限 | 其餘面號使用方式、夜間 |
| 延平 | VBS 31＋現行基準及附件 | 1–3、一般申請費／期限 | 各面夜間、實際集合水門 |

## 新增指南與暫緩候選

| 場地／slug | 官方來源 | 選擇及差異 |
| --- | --- | --- |
| 百齡／bailing-riverside | [VBS 1036 社子岸](https://vbs.sports.gov.taipei/venues/1036) | 新增士林；VBS 4 是另一岸且無網球區塊。社子岸分列 1–8、A、B；1–8 和 A 可見租借入口，B 仍待確認。正式目錄本來指向同一 1042 網球區塊，不另造球場 ID |
| 觀山／guanshan-riverside | [VBS 557](https://vbs.sports.gov.taipei/venues/557) | 新增松山；網球 1、2 面、基 6 號水門；與滾球區分 |
| 成美右岸／chengmei-right-bank | [VBS 29](https://vbs.sports.gov.taipei/venues/29) | A、B；確認內湖右岸，避免與南港左岸混淆；不採用同頁與場地不相符的大稻埕等英文公車資訊 |
| 民權／minquan-park | [VBS 30](https://vbs.sports.gov.taipei/venues/30) | 新增松山；官方網球時段 06–22、兩面及夜照。網球沒有租借入口，唯一場租按鈕屬壘球314；費用及輪流方式 pending，不宣稱免費 |
| 台北網球場／taipei-tennis-court | [營運介紹](https://www.taipeitenniscourt.com/about.php)、[費率](https://www.taipeitenniscourt.com/charges.php)、[交通](https://www.taipeitenniscourt.com/transportation.php) | 新增松山；六面硬地、06–22、按人／按面、開燈按夜價、無電話預訂；提醒不同於內湖網球中心 |
| 天母（暫緩） | [VBS 3](https://vbs.sports.gov.taipei/venues/3) | 六面但網球沒有租借入口；園區時間不能代替委外網球營業時間，舊公營費率不能套用，待現行營運來源 |
| 北投運動中心（暫緩） | [既有官網網址](https://www.btsport.org.tw/zh-TW/stadiums/id/15/) | 本次只渲染外框／共用頁尾，未取得網球專屬資訊，不把全館時間當網球時段 |

五篇均對應既有正式台北目錄；`data/courts.json`、89 筆 seed、DB／Edge 及全台 562 筆待審狀態不變。此批新涵蓋士林、松山，優先可查證且非校園資格不明的場地。公園有設施並不保證抵達時可下場。

## 介面與驗收

沿用已核可 G09 版型與查找，不改 UI／API 契約。更新內容 JSON 和 generated 已發布 slug/name 對照；調整既有測試預期為十五篇／十一篇名稱含河濱、台／臺北查出兩座不同球場。既有逐指南開草稿測試會遍歷十五篇且檢查無自動發局。

套用 frontend-testing-debugging；Browser plugin not available，使用專案 Playwright。目標流程：指南列表 → 名稱與新行政區篩選 → 新指南費率／待查內容 → 對應球場開局／登入；桌面1280×844、手機390×844檢查標題、非空、無 overlay、console、畫面與互動。截圖／暫存研究保存在 repo 外。

本批驗證與部署進行中；實際結果見後續補錄及 progress.md。沒有新增使用者追蹤或真實留存數據。

## 已完成的本機與發布前檢查

- `npm run test:ci:frontend`：775 unit passed／5 skipped、384 Chromium passed／4 skipped；型別、lint、格式、架構、全台底稿／球場 seed、build 與 bundle gate 通過。
- `npm run test:local`：4 API passed、46 browser passed／12 skipped；沒有重置或寫入 hosted DB。
- `npm run test:preview:chromium`：20 passed，包含十五篇逐一開啟自己的草稿、無自動發局，及名稱／行政區、台／臺、空結果、清除、無 JS。
- Hosted 唯讀 preflight：41 migrations local/remote 一致，profiles 3、sessions 3、participants 3、messages 2、reports 0、outbox 13；五個 cron active；匿名只有核可 discovery view，25 欄及既有私有 view 權限保持。零 migration／DB／Edge 改動，不另做 hosted dump；真實 OAuth／兩帳號群聊沿用歷史記錄，不標記本次新驗收。
- PR #5 已建立；為 Git 分支設定臨時 Preview 公開 Supabase URL/anon，Production 設定未改。必要 CI、正式環境容量、Git 預览與正式 QA 仍須完成後才合併發布。

## Git 預覽與正式設定容量

- Head `81cd213`，Vercel Git preview `dpl_6gPov6ytaQcZTayUjT7XqMysy9KE` READY。1280×844／390×844 的標題、非空內容、無 overlay、console／pageerror 0、搜尋／空結果／清除／鍵盤及無 JS 瀏覽通過；松山篩選三篇、士林篩選百齡一篇。
- 十五篇 HTTP 200、來源及內文逐一對照；未知指南與全台底稿 URL 404。預覽刻意 noindex／空 sitemap；正式才應為17 URLs。七個重點詳情頁各跑桌面與手機，共14次驗證，無橫向溢出，近期球局載入完成；純 URL 檢查與本機十五篇實際開草稿測試分別記錄。
- 臨時 QA 腳本初版將 Preview sitemap 誤期待為17及未限定主開局按鈕（空球局另有同名 CTA），修正檢查條件／selector 後重跑通過，產品沒有因此改動。
- `npm run test:preview:webkit` 9 passed，`npm run test:local:mobile` 6 passed。正式環境 `check:production-bundle:release` 通過：main 385,456／119,304、root static 661,243／193,418、guide static 277,206／74,948、total JS 942,801／282,839 raw／gzip bytes；index 1,036／543。未放寬任何上限。
- 匿名 REST 實測：核可25欄 select 200、line_id 400，十個私有 table/view 401；未輸出資料內容。正式 OAuth、群聊及真實發局未重跑，這批無 hosted 寫入。
- 截圖、HTTP／DOM檢查 JSON 與可重現腳本存於 `/Users/ian/tennisPartnerFinder-qa/g09-guide-batch-two-2026-09-09/`。詳細頁截圖含青年、民權、台北網球場的首屏與費率段落，已人工檢視手機與桌面樣本。
- 必要 CI：舊 `5657104` 的 workflow 34335313993 在取消後仍執行 always 清理／Safari後續步驟，讓新 PR run 等待；已取消完成。曾對相同新 head 觸發 workflow_dispatch 34335904285；待 PR run 開始後取消重複執行，正式以 PR run 34335417749 為驗收依據。

## 必要 CI 與合併

[PR #5](https://github.com/xinnians/tennisPartnerFinder/pull/5) 的 head `81cd213425f51251b44a7fd0cf5e66f6061f7110` 通過 [Quality Gate 34335417749](https://github.com/xinnians/tennisPartnerFinder/actions/runs/34335417749) 兩個必要 job。775 unit、384 Chromium、1,305 SQL、4 API、46 local browser、6 mobile、20 production-preview 及四組 Edge 整合通過。略過範圍仍為 unit 5、Chromium 4、local browser 12。

非阻擋 WebKit 190 passed／1 failed／3 skipped，唯一失敗仍在既有 `performance.spec.js:59` 首屏時間：3,714ms 超過2,500ms；production-preview WebKit 9 passed。保留失敗，不調高門檻，不宣稱全瀏覽器全綠。PR 已合併為 `3eee6f2b1db58273d40ead895bf5f65f445c7a3f`，由 Git 觸發正式建置。

## 正式發布結果

Vercel Git production `dpl_4YKCWdv6eX5VyG5H9Cq3MASHrds7` READY，qiuka.tw 已切至十五篇版本。十五篇 HTTP200、來源及內文對照、sitemap17、未知指南及待審底稿404通過。桌面1280×844／手機390×844搜尋、新行政區、零結果、清除／鍵盤、無JS均通過；七個重點詳情頁各兩尺寸共14次檢查無溢出或程式錯誤。新增五篇各兩尺寸共10次匿名開局至登入、取消清除 intent 通過，沒有發局或訂閱寫入。分享21 GET／HEAD200、未知404、POST405及no-store通過。

| 正式 QA | 結果 |
| --- | --- |
| 網址／標題 | 通過 |
| 非空內容／無 framework overlay | 通過 |
| Console／pageerror | 指南0；開局入口pageerror0 |
| 手機與桌面畫面／溢出 | 通過，已檢視正式手機松山篩選截圖 |
| 搜尋／新行政區／清除／無JS | 通過 |
| 新指南登入入口／取消 | 10次通過，無自動寫入 |

正式根頁各三次首訪實測 `--enforce-startup-byte-limits` 通過：最大本站 JS 788,201 raw／242,609 encoded bytes，低於820,000／260,000；pageerror0。手機LCP中位數8,176ms，桌面648ms；既有手機載入限制仍在，這是 lab 而非 field p75／留存成果。未因指南內容擴充宣稱改善首頁LCP。

臨時 Preview 的兩個公開 Supabase 設定已移除，production env export 已刪除；Production 設定未改。重現腳本、正式畫面及 JSON 保存在 repo 外上述 QA 目錄。發布與查核文件提交 main 保存，沒有新 DB migration、Edge 部署或真實 OAuth／群聊重測。

## 下一批接續

- 青年清晨時間、河濱各面夜照與民權現場使用流程仍需管理單位確認；未代替使用者聯絡或詢價。
- 天母／北投先找可確認的現行營運來源，再評估指南；不把頁面空白解讀成場地停業。
- 資訊更正入口尚未實作，可另行規劃；全台候選仍待審。已發布十五篇需於2026-12-08前再查核，沒有自動排程。
- 回復本批可 revert runtime `5657104`（內容、generated map及固定數量測試），保留既有G09模板與G10分享handler；不用回復DB。
