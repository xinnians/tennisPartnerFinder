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
