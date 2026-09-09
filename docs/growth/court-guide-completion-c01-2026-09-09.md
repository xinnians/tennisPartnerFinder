# C01 首批與 C02 北投／天母查核

2026-09-09；執行者 Codex，內容決策負責人 ian。使用者已核可建立目標並開始執行；工作分支 `codex/court-guide-completion-c01`。總進度見 [progress.md](progress.md)，逐場狀態見 [清冊](court-guide-completion-tracker.md)。

## 本批目標與處置

本批六座均重新查來源；C01 整體15篇與 C02 整體10候選尚未完成。沒有對外聯絡、送出表單、訂場、正式 DB 寫入或全台公開。

| 場地／既有 slug | 結論 | 本批內容 | 下一個可執行步驟 |
| --- | --- | --- | --- |
| 民權／minquan-park | 待補資訊 | 原指南維持；新 VBS 仍只有壘球租借按鈕 | 查現場公告或取得授權後向場地現況專線確認兩面輪流／費用 |
| 青年／youth-park | 待補資訊 | 補清楚優惠價的身分與一般民眾適用時段；時間／夜照疑義保留 | 比對後續營運公告；若授權聯絡，向網球櫃檯確認清晨開場及夜間附加費 |
| 道南／daonan-riverside | 待補資訊 | 將1–2／3號使用方式獨立列為 pending，不混在已查核場地區分 | 取得現行面號公告，或授權後向管理窗口確認現場使用／排隊及夜照 |
| 百齡／bailing-riverside | 待補資訊 | B區使用方式獨立列 pending，保留社子岸辨別 | 找對應網球區入口圖及現行 B 區使用公告；遊戲場入口不能當球場入口 |
| 北投／beitou-sports-center | 達新指南最低門檻，已發布 | 一樓預約／費率、五樓場館規範與假日公告交叉查核；新增指南 | 繳費期限、假日時段與附加費仍需確認 |
| 天母／tianmu-sports-park | 待補來源，未發布 | 今年公益使用文件佐證場地使用，不足以推定一般散客租借規則 | 從現行委外營運／主管機關公告找一般租借入口；取得授權才對外聯絡 |

## 逐場證據卡

下列來源實際查核日均為2026-09-09；除另註日期外，頁面未給適用日起日。保留既有 court_id／座標，不新增或合併場地。原始公開頁快照在 `/tmp/qiuka-c01/`；此文件保存持久的結論與來源，暫存不是唯一接續依據。完整覆核期限2026-12-08。

### 民權（松山區）

[新VBS30](https://vbs.sports.gov.taipei/venues/30)：地址富錦街359巷2弄及新中街口；兩面網球、網球06–22及夜間照明可確認。網球區未見租借入口，唯一 `id2nd=314` 在壘球區。未取得現場輪流、費用及免付費資格的可靠公告。搜尋到2019年論壇說法，非管理單位且年代久，不採為現行規則。原有 pending 不降級為已確認。

### 青年（萬華區）

[新VBS1098](https://vbs.sports.gov.taipei/venues/1098)仍列運博及網球專線02-2305-8735、園區08–22。[營運網球專頁](https://winpoweryouthpark.com.tw/場館介紹/網球場區/)仍列清晨05:30與頁尾06:00，未找到統一時段公告。可確認現場購票、不接受提前預約、六面戶外；日夜一般／優惠費率維持。新增優惠資格摘要，避免讀者以為所有人所有時段都能用最低價。夜照各面與額外費用未明；雨天地濕未開放不得自行使用。入口仍以原指南路線及現場辨別，未把園區交通說明當網球專屬入口。

### 道南（文山區）

[新VBS22](https://vbs.sports.gov.taipei/venues/22)：新光路一段166號旁，面號1–2、4–6及3號；唯一網球場租入口 `id2nd=425` 屬4–6。1–2／3使用與夜照未知。[現行申請須知FL086140](https://laws.gov.taipei/Law/LawSearch/LawArticleContent/FL086140)於2021-03-05修訂，規定一般申請與時段，沒有解答個別面號現場輪流。2017附表不能直接當2026年使用規則。園區全天不代表每面網球夜間可用。

### 百齡社子岸（士林區）

[新VBS1036](https://vbs.sports.gov.taipei/venues/1036)：1–8及A有場租入口（1042、1060），B未見。場館08–22、通河東街一段的兩岸概括地址及葫東重慶路口交通資訊未解決網球專屬集合入口。水利處搜尋結果的兒童遊戲場入口不採作網球入口。B資格／流程及各面夜照仍未知，不能靠一般收費表推論。

### 北投運動中心（北投區）

- [一樓預約與收費](https://www.btsport.org.tw/zh-TW/stadiums/id/15/)：一般民眾網球每場每小時06–18為750元、18–22為1,000元；現場／電話7天內，分機66，頁文列前三天繳費。
- [五樓介紹與規範](https://www.btsport.org.tw/zh-TW/stadiums/id/6/)：多功能球場含網球，06–22；一樓先完成租場，穿運動服鞋，禁止未准私人教學。地址石牌路一段39巷100號，電梯與五樓無障礙廁所。未由第三方聲稱推定兩面或全時段專用。
- [2025-10-24假日公告](https://www.btsport.org.tw/zh-TW/news-content/id/587/)：轉帳／匯款前2天、臨櫃前1天，與一樓前三天說明不一致，明列pending。導覽的一般尖峰說明與網球專屬費率表也有假日差異，指南要求預約時確認，不套用羽球價或部落格的假日全天尖峰說法。
- 公眾使用方式與網球費率有營運一手來源，達最低發布門檻；夜間附加費、取消／退款規則未取得。公益優惠表跨欄複雜，不自行推定所有人免費。
- **來源障礙更正**：一般瀏覽器此次仍只顯示頁首尾，但直接HTTPS回應、停用JavaScript的瀏覽器及搜尋工具均可讀完整場館內容；HTML含動畫/隱藏樣式。前次「只有外框」是渲染觀察，不能當來源內容不存在。使用官方HTML交叉驗證，不以搜尋摘要單獨認定。

### 天母運動公園（士林區）

[新VBS3](https://vbs.sports.gov.taipei/venues/3)：忠誠路二段77號，六面網球；園區08–22；無網球場租按鈕。[中崙高中轉知115年度公益申請](https://www.zlsh.tp.edu.tw/news/臺北市天母運動場區網球場115年度公益使用天數申/)（2025-10-20）及[體育局115年審查結果](https://www-ws.gov.taipei/001/Upload/340/relfile/10173/9528112/33b86e07-a0d9-4538-97c7-61fb203ecef6.pdf)只證明公益申請／活動安排。未將活動辦理或單日免費宣傳當一般公眾常態預約方式；未採用舊版公營票價或第三方轉載的營運者資訊。保留未發布。

## QA 與發布

本機 frontend：775 unit 通過／5 skipped、384 Chromium 通過／4 skipped；local：46通過／12 skipped；mobile：6通過。正式count preflight保持profiles3、sessions3、participants3、messages2、reports0、outbox13；41 migrations一致、5 cron active。匿名 discovery200、禁止欄位400、10個私有面401。零DB變更未新增備份；真實OAuth與兩帳號群聊未重跑，不冒用歷史驗證。

Chromium production-preview 20通過，WebKit production-preview 9通過。

Browser plugin not available，沿用 repo Playwright。已驗證流程：指南列表 → 北投區／名稱查找 → 北投詳情 → 指定球場開局 → 登入提示與取消；桌面及390px，並查來源、pending、no-JS、sitemap與未知頁404。容量上限不變，零migration。

正式設定 strict 容量通過：main 385,456／119,299、root static 661,296／193,443、guide static 277,259／74,976、total JS 942,854／282,858 raw／gzip bytes；index 1,036／543。未放寬預算。Runtime commit `11cac8d`；Git預覽與必要CI接續驗證，尚未標記正式上線。

### Git 預覽驗收

PR [#6](https://github.com/xinnians/tennisPartnerFinder/pull/6)，head `57ace4e20daed3130c02f1e95990232e448084f4`。Preview `dpl_G34nh9MMFQXjK4CDYErdUHK57pRZ` READY，穩定入口 `https://tennis-partner-finder-git-cod-c58ca1-xinnians-projects-c513dbd3.vercel.app`。

| 檢查 | 結果／證據 |
| --- | --- |
| 頁面識別、有內容、無錯誤覆蓋層 | 16篇HTTP200，4篇修改詳情×1280／390px，標題及正文正確 |
| Console／版面 | 0 error，無水平溢出；已看北投桌面／手機截圖 |
| 搜尋與鍵盤 | 北投區只有北投指南；名稱／行政區交集、零結果、清除與焦點回復通過 |
| 無JS及容量 | 16篇可讀、連結可走；列表只載1支1,036 raw／541 encoded bytes JS，無API／Maps |
| 開局互動 | 北投桌面／390px到登入，courtSlug正確；取消清空intent；無建立球局／訂閱寫入 |
| 爬蟲邊界 | 預覽sitemap刻意0；未知指南及全台底稿404 |

QA原始JSON、截圖及腳本：`/Users/ian/tennisPartnerFinder-qa/court-guide-c01-2026-09-09/preview/`。沿用`verify-hosted.mjs`、`verify-details.mjs`及`verify-entry.mjs`，對應最新16篇。正式OAuth、實際付款／租場、真實留存未測；Preview Maps referrer未擴充，不將預覽首頁Maps表現當正式效能。

### 遠端 CI 與合併

[Quality Gate 34339599561](https://github.com/xinnians/tennisPartnerFinder/actions/runs/34339599561)必要Frontend／Supabase成功。775 unit（5skip）、384 mock Chromium（4skip）、1,305 SQL、4 API、46 local（12skip）、6 mobile、20 preview及四組Edge整合通過。非阻擋Safari190pass／1fail／3skip：既有performance.spec.js首屏2,632ms超過2,500ms；preview WebKit9通過，未調整門檻。PR #6按已驗證head合併，merge `1aa41ca034c41af8104fccf103b4843a69440b33`；正式站驗證接續進行。


### 正式發布驗收完成

Vercel `dpl_4HaKw7ybmYrMQYTgvbgmXGGbVNUf` READY，Git merge `1aa41ca`，qiuka.tw已指向新版。16篇與索引200、sitemap18、未知指南及全台底稿404；同一組桌面1280×844／手機390×844搜尋、鍵盤／清除、無JS、北投登入intent／取消皆通過。4篇修改詳情共8次檢查無水平溢出／console／pageerror；正式北投截圖已檢視，沒有框架錯誤覆蓋層。分享GET／HEAD200、未知404、POST405均no-store。

正式首頁各3次首訪容量通過：最大本站JS788,254 raw／242,634 encoded bytes，門檻820,000／260,000；pageerror0。手機LCP中位數8,164ms、桌面648ms，既有Maps載入限制保留，未宣稱達2.5秒或留存改善。量測在其他browser QA完成後單獨執行。

原始證據：`/Users/ian/tennisPartnerFinder-qa/court-guide-c01-2026-09-09/production/`（report、detail-report、entry-report、performance JSON與截圖），測試及CI logs在同層`logs/`。臨時Preview兩項公開Supabase設定已移除，Production設定未改，Production env export已刪除。沒有對外訊息、真實訂場或hosted寫入。

本批目標完成：六座有來源查核處置；新增北投一篇、補強三篇，天母仍未發布，其餘未解疑義不標已解。清冊現為16篇發布／45筆台北未發布／28筆新北未發布，14篇18欄pending。C01/C02長期目標尚未全部完成，下一批接續復興、洲美、榮華；其他G項及全台公開仍暫緩。
