# 球場指南補完清冊

建立／更新：2026-09-09。對應 [補完計畫](court-guide-completion-plan.md)，總發布狀態見 [progress.md](progress.md)。C01首批與C02前兩座已開始重新查核，見[本批紀錄](court-guide-completion-c01-2026-09-09.md)；[C02後續8筆](court-guide-completion-c02-2026-09-09.md)已查核，4篇已正式發布；其他列承接既有基準。

本檔是逐場工作狀態的維護位置；發布內容仍以 `data/court-guides.json` 為準，正式目錄仍以 `data/courts.json` 為準。後續手動更新清冊，不重跑初始化腳本覆蓋人工結論。slug為既有識別，不另造court_id。

## 基準與使用方式

- 台北61筆：20篇已發布，41筆未發布（5筆C02待來源／現況，另36筆後續）；新北28筆未發布。合計89筆既有目錄，不代表全台總數。
- 優先度P0＝既有指南可能影響出發的疑義；P1＝既有其他缺口或C02候選；P2＝其餘台北；P3＝需留意校園等資格的台北候選；P4＝新北資料準備。排序不是需求量估計。
- 每次更新加上查核日期、處置理由及批次紀錄連結；如需拆分多欄問題，在批次查核卡追蹤，清冊保留主要下一步。
- 未發布列的「歷史來源」來自既有目錄，可能是舊租借系統，**未於本輪重驗**；不能直接拿來發指南。名稱看似學校只是排序線索，所有場地皆須查公眾資格。

## 台北行政區覆蓋快照

| 行政區 | 既有目錄 | 已發布指南 | 未發布 |
| --- | ---: | ---: | ---: |
| 中山區 | 4 | 2 | 2 |
| 中正區 | 2 | 2 | 0 |
| 信義區 | 2 | 0 | 2 |
| 內湖區 | 11 | 3 | 8 |
| 北投區 | 14 | 4 | 10 |
| 南港區 | 4 | 0 | 4 |
| 士林區 | 7 | 1 | 6 |
| 大同區 | 2 | 2 | 0 |
| 大安區 | 2 | 0 | 2 |
| 文山區 | 7 | 1 | 6 |
| 松山區 | 3 | 3 | 0 |
| 萬華區 | 3 | 2 | 1 |

## 已發布20篇：使用資訊補強

C01首批重新查核民權、青年、道南、百齡及北投，C02新增復興、榮華、洲美、迪化，其餘承接第二批紀錄。18篇有明示pending，共26欄；本批新增四篇共8欄。未解決問題沒有因此減少；兩篇無pending仍需定期覆核。下次完整查核期限2026-12-08。

| 優先 | 場地／slug | 行政區 | 查核狀態 | 發布狀態 | 下一步／缺口 | 最近查核／紀錄 |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | 大佳河濱公園網球場／`dajia-riverside` | 中山區 | 待補資訊 | 已發布 | 7／10號水門衝突、各面夜照 | [2026-09-09](g09-guide-batch-two-2026-09-09.md) |
| P1 | 美堤河濱公園網球場／`meiti-riverside` | 中山區 | 待補資訊 | 已發布 | 各面夜間照明、開燈方式及可用條件 | [2026-09-09](g09-guide-batch-two-2026-09-09.md) |
| P1 | 中正河濱公園網球場／`zhongzheng-riverside` | 中正區 | 待補資訊 | 已發布 | 各面夜間照明、開燈方式及可用條件 | [2026-09-09](g09-guide-batch-two-2026-09-09.md) |
| P1 | 古亭河濱公園網球場／`guting-riverside` | 中正區 | 待補資訊 | 已發布 | 各面夜間照明、開燈方式及可用條件 | [2026-09-09](g09-guide-batch-two-2026-09-09.md) |
| P1 | 台北網球中心／`taipei-tennis-center` | 內湖區 | 已查核／待定期覆核 | 已發布 | 依期限覆核費率、預約規則及最新公告 | [2026-09-09](g09-guide-batch-two-2026-09-09.md) |
| P1 | 彩虹河濱公園網球場／`rainbow-riverside` | 內湖區 | 待補資訊 | 已發布 | 各面夜間照明、開燈方式及可用條件 | [2026-09-09](g09-guide-batch-two-2026-09-09.md) |
| P1 | 成美右岸河濱公園網球場／`chengmei-right-bank` | 內湖區 | 待補資訊 | 已發布 | 各面夜間照明、開燈方式及可用條件 | [2026-09-09](g09-guide-batch-two-2026-09-09.md) |
| P0 | 百齡河濱公園網球場／`bailing-riverside` | 士林區 | 待補資訊 | 已發布 | B區使用方式、各面夜照、社子岸集合入口 | [2026-09-09本批查核](court-guide-completion-c01-2026-09-09.md) |
| P1 | 延平河濱公園網球場／`yanping-riverside` | 大同區 | 待補資訊 | 已發布 | 各面夜間照明、開燈方式及可用條件 | [2026-09-09](g09-guide-batch-two-2026-09-09.md) |
| P0 | 道南河濱公園網球場／`daonan-riverside` | 文山區 | 待補資訊 | 已發布 | 1–2／3號使用方式、各面夜照 | [2026-09-09本批查核](court-guide-completion-c01-2026-09-09.md) |
| P1 | 台北網球場／`taipei-tennis-court` | 松山區 | 已查核／待定期覆核 | 已發布 | 依期限覆核費率、預約規則及最新公告 | [2026-09-09](g09-guide-batch-two-2026-09-09.md) |
| P0 | 民權公園網球場／`minquan-park` | 松山區 | 待補資訊 | 已發布 | 現場使用／輪流／費用；租借按鈕屬壘球 | [2026-09-09本批查核](court-guide-completion-c01-2026-09-09.md) |
| P1 | 觀山河濱公園網球場／`guanshan-riverside` | 松山區 | 待補資訊 | 已發布 | 各面夜間照明、開燈方式及可用條件 | [2026-09-09](g09-guide-batch-two-2026-09-09.md) |
| P1 | 華中河濱公園網球場／`huazhong-riverside` | 萬華區 | 待補資訊 | 已發布 | 各面夜間照明、開燈方式及可用條件 | [2026-09-09](g09-guide-batch-two-2026-09-09.md) |
| P0 | 青年公園網球場／`youth-park` | 萬華區 | 待補資訊 | 已發布 | 清晨05:30／06:00／08:00衝突、各面夜照與額外費用 | [2026-09-09本批查核](court-guide-completion-c01-2026-09-09.md) |
| P1 | 北投運動中心網球場／`beitou-sports-center` | 北投區 | 待補資訊 | 已發布 | 繳費期限、假日費率適用時段及夜間附加費 | [2026-09-09本批查核](court-guide-completion-c01-2026-09-09.md) |
| P1 | 復興公園網球場／`fuxing-park` | 北投區 | 待補資訊 | 已發布 | 清晨時間衝突、費用／輪替、夜照 | [2026-09-09 C02查核](court-guide-completion-c02-2026-09-09.md) |
| P1 | 洲美運動公園網球場／`zhoumei-sports-park` | 北投區 | 待補資訊 | 已發布 | 按人與逐人資格已釐清；夜照／取消／提前預約待補 | [2026-09-09 C02查核](court-guide-completion-c02-2026-09-09.md) |
| P1 | 榮華公園網球場／`ronghua-park` | 北投區 | 待補資訊 | 已發布 | 精確網球時間、費用／輪替、夜照 | [2026-09-09 C02查核](court-guide-completion-c02-2026-09-09.md) |
| P1 | 迪化休閒運動公園網球場／`dihua-sports-park` | 大同區 | 待補資訊 | 已發布 | 現場時段／輪替、開燈操作；C03已確認工程不關網球；入口提醒內容完成、待部署 | [2026-09-09 C02查核](court-guide-completion-c02-2026-09-09.md) |

## 台北未發布41筆

C02剩餘5筆依計畫順序排列：天母、南港、玉成、中研、新生皆已查核但來源／現況未解；另36筆中10筆C03查核中、26筆尚未開始本計畫查核。已發布四篇移至上表。

| 優先 | 場地／slug | 行政區 | 查核狀態 | 發布狀態 | 下一步 | 來源／證據 |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | 天母運動公園網球場／`tianmu-sports-park` | 士林區 | 待補來源 | 未發布 | 找現行委外營運／租借規則，不套用舊公營費率 | [2026-09-09本批查核](court-guide-completion-c01-2026-09-09.md) |
| P1 | 南港公園網球場／`nangang-park` | 南港區 | 待補來源 | 未發布 | 網球現場使用／輪替及費用規則未取得 | [2026-09-09 C02查核](court-guide-completion-c02-2026-09-09.md) |
| P1 | 玉成公園網球場／`yucheng-park` | 南港區 | 待補來源 | 未發布 | 網球現場流程、工程是否影響球場 | [2026-09-09 C02查核](court-guide-completion-c02-2026-09-09.md) |
| P1 | 中研公園網球場／`zhongyan-park` | 南港區 | 待補來源 | 未發布 | 網球現場流程／費用／夜照，不能套籃球時間 | [2026-09-09 C02查核](court-guide-completion-c02-2026-09-09.md) |
| P0 | 新生公園網球場／`xinsheng-park` | 中山區 | 待釐清現況 | 未發布 | P0：新生館改建新聞拆除／保留描述不一；查最新網球現況 | [2026-09-09 C02查核](court-guide-completion-c02-2026-09-09.md) |
| P3 | 實踐大學網球場／`shih-chien-university` | 中山區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P3 | 台北醫學大學網球場／`tmu` | 信義區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P3 | 松山高中網球場／`songshan-senior-high` | 信義區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://service.gov.taipei/rental/VenueDetail/e13d57cdaf90) |
| P3 | 三民國中網球場／`sanmin-junior-high` | 內湖區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P3 | 德明財經科技大學網球場／`takming-university` | 內湖區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P2 | 煙波庭公園網球場／`yanboting-park` | 內湖區 | 查核中 | 未發布 | 官方設施對照已取得；接續使用流程／費率／資格查核 | [2026-09-09 C03底稿](court-guide-completion-c03-2026-09-09.md) |
| P2 | 瑞湖公園網球場／`ruihu-park` | 內湖區 | 查核中 | 未發布 | 官方設施對照已取得；接續使用流程／費率／資格查核 | [2026-09-09 C03底稿](court-guide-completion-c03-2026-09-09.md) |
| P2 | 石潭公園網球場／`shitan-park` | 內湖區 | 查核中 | 未發布 | 官方設施對照已取得；接續使用流程／費率／資格查核 | [2026-09-09 C03底稿](court-guide-completion-c03-2026-09-09.md) |
| P2 | 碧湖公園網球場／`bihu-park` | 內湖區 | 查核中 | 未發布 | 官方設施對照已取得；接續使用流程／費率／資格查核 | [2026-09-09 C03底稿](court-guide-completion-c03-2026-09-09.md) |
| P2 | 葫蘆洲運動公園網球場／`huluzhou-sports-park` | 內湖區 | 可發布 | 內容完成 | 已讀2026-06-30營運須知；已核對相對位置；按人或面費率與照明pending | [2026-09-09 C03底稿](court-guide-completion-c03-2026-09-09.md) |
| P3 | 西湖國中網球場／`xihu-junior-high` | 內湖區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P3 | 台北藝術大學網球場／`tnua` | 北投區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P2 | 大豐公園網球場／`dafeng-park` | 北投區 | 查核中 | 未發布 | 已取得iPlay現場使用／08–22；待改造實際施工及網球移位 | [2026-09-09 C03底稿](court-guide-completion-c03-2026-09-09.md) |
| P2 | 天溪綠地網球場／`tianxi-green-space` | 北投區 | 查核中 | 未發布 | 官方設施對照已取得；接續使用流程／費率／資格查核 | [2026-09-09 C03底稿](court-guide-completion-c03-2026-09-09.md) |
| P3 | 文林國小網球場／`wenlin-elementary` | 北投區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P3 | 新民國中網球場／`xinmin-junior-high` | 北投區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://service.gov.taipei/rental/VenueDetail/431c7decfa8c) |
| P3 | 明德國中網球場／`mingde-junior-high` | 北投區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P2 | 觀海公園網球場／`guanhai-park` | 北投區 | 可發布 | 未發布 | iPlay23071網球專欄確認隨到隨用、08–22；費用／輪替／夜照操作待補 | [2026-09-09 C03底稿](court-guide-completion-c03-2026-09-09.md) |
| P3 | 逸仙國小網球場／`yixian-elementary` | 北投區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P3 | 陽明大學山下網球場／`yangming-university-foothill` | 北投區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P3 | 陽明大學山頂網球場／`yangming-university-hilltop` | 北投區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P3 | 中華科技大學網球場／`cust` | 南港區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P2 | 天壽公園網球場／`tianshou-park` | 士林區 | 查核中 | 未發布 | 官方設施對照已取得；接續使用流程／費率／資格查核 | [2026-09-09 C03底稿](court-guide-completion-c03-2026-09-09.md) |
| P3 | 東吳大學網球場／`soochow-university` | 士林區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P3 | 至善國中網球場／`zhishan-junior-high` | 士林區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://service.gov.taipei/rental/VenueDetail/7609a1c8ed2f) |
| P2 | 蘭興公園網球場／`lanxing-park` | 士林區 | 查核中 | 未發布 | 已找到GymID23055；直接402，待專屬使用規則及面數核對 | [2026-09-09 C03底稿](court-guide-completion-c03-2026-09-09.md) |
| P3 | 銘傳大學網球場／`ming-chuan-university` | 士林區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P3 | 台北教育大學網球場／`ntue` | 大安區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P3 | 台灣科技大學網球場／`ntust` | 大安區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P3 | 政治大學網球場／`nccu` | 文山區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P3 | 景美女中網球場／`jingmei-girls-high` | 文山區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P2 | 景美河濱公園網球場／`jingmei-riverside` | 文山區 | 待查核 | 未發布 | 核對網球設施、使用資格、現行租借／現場流程及位置 | [歷史來源](https://vbs.sports.taipei/venues/?K=489) |
| P3 | 木柵國小網球場／`muzha-elementary` | 文山區 | 待查核 | 未發布 | 先查一般民眾資格及時段，再查網球場地／費用／入口 | [歷史來源](https://service.gov.taipei/rental/VenueDetail/1ba2075d5fe7) |
| P2 | 溪洲(福和)河濱公園網球場／`xizhou-riverside` | 文山區 | 待查核 | 未發布 | 核對網球設施、使用資格、現行租借／現場流程及位置 | [歷史來源](https://vbs.sports.taipei/venues/?K=352) |
| P2 | 萬有二號公園網球場／`wanyou-no2-park` | 文山區 | 待查核 | 未發布 | 核對網球設施、使用資格、現行租借／現場流程及位置 | [歷史來源](https://vbs.sports.taipei/venues/?K=849) |
| P2 | 雙園河濱公園網球場／`shuangyuan-riverside` | 萬華區 | 待查核 | 未發布 | 核對網球設施、使用資格、現行租借／現場流程及位置 | [歷史來源](https://vbs.sports.taipei/venues/?K=210) |

## 新北28筆：資料準備

本輪未開始逐筆查核；全台底稿中的42列新北候選另行交叉比對，不直接相加。指南公開及跨城市開局尚未啟動。

| 優先 | 場地／slug | 行政區 | 查核狀態 | 發布狀態 | 下一步 | 來源線索 |
| --- | --- | --- | --- | --- | --- | --- |
| P4 | 三和國中網球場／`sanhe-junior-high` | 三重區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 新北高中網球場／`new-taipei-senior-high` | 三重區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 明志國中網球場／`mingzhi-junior-high` | 三重區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 龍門網球場／`longmen` | 三重區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://www.hrcm.ntpc.gov.tw/Facility/TypeAssets/%E5%90%84%E9%A1%9E%E7%90%83%E5%A0%B4/%E7%B6%B2%E7%90%83%E5%A0%B4/%E9%BE%8D%E9%96%80%E7%B6%B2%E7%90%83%E5%A0%B4) |
| P4 | 秀山國小網球場／`xiushan-elementary` | 中和區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 錦和運動公園網球場／`jinhe-sports-park` | 中和區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 水興宮網球場／`shuixing-temple` | 八里區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://www.hrcm.ntpc.gov.tw/Facility/TypeAssets/%E5%90%84%E9%A1%9E%E7%90%83%E5%A0%B4/%E7%B6%B2%E7%90%83%E5%A0%B4/%E6%B0%B4%E8%88%88%E5%AE%AE%E7%B6%B2%E7%90%83%E5%A0%B4) |
| P4 | 土城綜合球場網球場／`tucheng-sports-complex` | 土城區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 媽祖田網球場／`mazutian` | 土城區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://www.hrcm.ntpc.gov.tw/Facility/TypeAssets/%E5%90%84%E9%A1%9E%E7%90%83%E5%A0%B4/%E7%B6%B2%E7%90%83%E5%A0%B4/%E5%AA%BD%E7%A5%96%E7%94%B0%E7%B6%B2%E7%90%83%E5%A0%B4) |
| P4 | 宏國德霖科技大學網球場／`hungkuo-delin-university` | 土城區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 小碧潭網球場／`xiaobitan` | 新店區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://www.hrcm.ntpc.gov.tw/Facility/TypeAssets/%E5%90%84%E9%A1%9E%E7%90%83%E5%A0%B4/%E7%B6%B2%E7%90%83%E5%A0%B4/%E5%B0%8F%E7%A2%A7%E6%BD%AD%E7%B6%B2%E7%90%83%E5%A0%B4) |
| P4 | 景文科技大學網球場／`jinwen-university` | 新店區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 新莊網球場／`xinzhuang` | 新莊區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 民生公園網球場／`minsheng-park` | 板橋區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 湳仔溝抽水站旁網球場／`nanzaigou` | 板橋區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://www.hrcm.ntpc.gov.tw/Facility/TypeAssets/%E5%90%84%E9%A1%9E%E7%90%83%E5%A0%B4/%E7%B6%B2%E7%90%83%E5%A0%B4/%E6%B9%B3%E4%BB%94%E6%BA%9D%E6%8A%BD%E6%B0%B4%E7%AB%99%E6%97%81%E7%B6%B2%E7%90%83%E5%A0%B4) |
| P4 | 致理科技大學網球場／`chihlee-university` | 板橋區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 林口第二運動公園網球場／`linkou-no2-sports-park` | 林口區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 林口高中網球場／`linkou-senior-high` | 林口區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 樹林體育園區網球場／`shulin-sports-park` | 樹林區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 福和網球場／`fuhe` | 永和區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://www.hrcm.ntpc.gov.tw/Facility/TypeAssets/%E5%90%84%E9%A1%9E%E7%90%83%E5%A0%B4/%E7%B6%B2%E7%90%83%E5%A0%B4/%E7%A6%8F%E5%92%8C%E7%B6%B2%E7%90%83%E5%A0%B4) |
| P4 | 綠寶石網球場／`emerald` | 永和區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://www.hrcm.ntpc.gov.tw/Facility/TypeAssets/%E5%90%84%E9%A1%9E%E7%90%83%E5%A0%B4/%E7%B6%B2%E7%90%83%E5%A0%B4/%E7%B6%A0%E5%AF%B6%E7%9F%B3%E7%B6%B2%E7%90%83%E5%A0%B4) |
| P4 | 文化國小網球場／`wenhua-elementary` | 淡水區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 淡江大學網球場／`tamkang-university` | 淡水區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 真理大學網球場／`aletheia-university` | 淡水區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 聖約翰科技大學網球場／`st-johns-university` | 淡水區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 忠義國小網球場／`zhongyi-elementary` | 蘆洲區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |
| P4 | 蘆堤網球場／`weifeng-canal` | 蘆洲區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://www.hrcm.ntpc.gov.tw/Facility/TypeAssets/%E5%90%84%E9%A1%9E%E7%90%83%E5%A0%B4/%E7%B6%B2%E7%90%83%E5%A0%B4/%E8%98%86%E5%A0%A4%E7%B6%B2%E7%90%83%E5%A0%B4) |
| P4 | 鶯歌國小網球場／`yingge-elementary` | 鶯歌區 | 待查核 | 未發布 | 核對資格、現行使用規則、位置並比對待審底稿 | [歷史來源](https://data.gov.tw/dataset/22849) |

## 全台工作入口

562筆逐列候選仍在 `data/national/inventory.json`，品質統計見 [品質報告](national-courts-quality-2026-09-09.md)，本檔不複製562列。C07開始時先選一個縣市／最多10筆，建立獨立人工查核批次檔；保留來源快照日期、sourceRow及候選hash對照，不把hash當永久場館ID，也不覆寫可重建的來源快照。

## 本輪變更日誌

- 2026-09-09：C00完成。以89筆目錄及15篇指南建立清冊、優先序與下一步；全部狀態承接既有文件，未新增場地、未更動發布狀態、未進行新的外部查核。
- 下一步：C01高影響缺口與C02前兩筆來源障礙；更新後在此追加日期及對應批次紀錄，並同步progress.md。

- 2026-09-09：C01四座及C02前兩座完成本批來源查核，北投內容完成待QA／部署；其餘五座待補資訊／來源，詳見[批次紀錄](court-guide-completion-c01-2026-09-09.md)。內容候選為16篇（正式仍15篇），其中14篇／18欄pending；新增2欄為將道南、百齡既有疑義明列，另2欄屬北投，沒有宣稱缺口已清零。

- 2026-09-09：PR #6完成必要CI、Git發布及正式驗收；北投移入已發布表。現為16篇已發布／45筆台北未發布／新北28筆未發布。下批接續C02復興、洲美、榮華；既有疑義保留，C01/C02整體未完成。
