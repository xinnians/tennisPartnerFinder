# C04校園合格候選發布批（2026-09-09）

分支`codex/court-guide-completion-c04-final`，base ee727b8。正式26篇，本機候選28篇。新增台科大週末一般使用、木柵國小兩面季租；範圍沿已核可台北目錄，零DB／migration，不開放全台底稿。來源全文與費表閱圖見[六筆查核](court-guide-completion-c04-schools-final-2026-09-09.md)。

## 本輪新證據

- 台科體育室首頁curl已取得最新2026-09-09項目。2026-08-28[連假公告](https://www.sport.ntust.edu.tw/p/406-1069-151067,r1475.php?Lang=zh-tw)全文確認9/25–28、10/9–11、10/24–26休館，加入日期明確的2026秋季休館欄；英文把9/25寫Saturday、中文Friday，採日期本身不轉貼錯誤星期。
- [台科官方配置圖](https://www.ntust.edu.tw/p/412-1000-102.php?Lang=zh-tw)現行圖檔20251205，以瀏覽器實際閱圖（/tmp/qiuka-c04-final/map-browser.png），網球位於運動場旁、T4及籃球場附近；仍不猜校門可通行時間。舊圖／華夏校區不混用。網球週末400元/面時由2025-09-23專項表確認，活動包場另列；外賓換證種類、指定入校／開燈操作保留pending。
- 木柵市府租借頁本輪再讀仍列受理2026/07/01–14，未找到下一季確切日程；指南明示已過期、須確認下一季，不能自動預約。2024-08-28PDF第5頁實際閱圖確認兩面合計440元/時；頁面220單位寫法有歧義，保留pending而不把兩面寫220。季租資格與流程可讀，費率、夜照單元與下一季日期的未知公開標示。

## 實作／驗證狀態

JSON候選28篇，生成slug map新增ntust／muzha-elementary；索引count26→28，臺北／台北搜尋仍三篇、河濱13不變。初次check因尚未產生catalog失敗，隨後--write再執行unit及格式驗證；不修改驗收門檻。

後續完整frontend、原始test:local、mobile及production-preview按原規則執行；實際結果接續記錄。不重置DB；產生src有變所以test:local不豁免。Browser plugin not available，沿用先前已載入frontend-testing-debugging skill的Playwright fallback，保留桌面／390px、來源／HTTP／sitemap、逐slug開局及容量驗收。

長期目標仍active。台北61筆已有首輪處置，但本批兩篇尚未發布；其他具體待來源項目與維護期限保持清冊，不能以未查核0當資訊完整。

## 本機與部署前驗證

- frontend全入口通過：775 unit、384 Chromium，typecheck／lint／Prettier／catalog／national／build與結構容量檢查成功。
- 原始test:local 4 API、46 browser／12 skipped通過，mobile6、preview Chromium20及WebKit9通過；零migration故本機SQL沿既有豁免，CI仍執行完整SQL。未清理fixture或重置DB。
- Production env嚴格建置：total JS943402 raw／283106 gzip，initial661844／193708；全部在既有門檻內，沒有調高預算。
- 本機28篇HTTP／逐fact及來源一致、sitemap30、未知指南404、桌面／390px搜尋、鍵盤清除焦點、44px/no-JS、兩新篇4組長文檢查通過，pageerror／console0。實際閱木柵手機圖，長文換行正常。QA：`/Users/ian/tennisPartnerFinder-qa/court-guide-c04-final-2026-09-09/local`。
- Hosted read-only preflight：41 migration對齊，3 profiles／3 sessions／3 participants／2 messages／0 reports／15 outbox，5 cron active；discovery25欄、公開查詢200／禁止欄400／10私有端點401。未重新執行hosted OAuth及兩帳號寫入旅程，不列為本輪完成。
- 清冊89唯一slug與目錄完全相符，61台北列都有2026-09-09批次證據與具體處置；明德由查核中改待補來源，原因為學校現行申請／時段仍未取得，沒有擅自發布。候選JSON27篇44欄pending。

Git預覽、CI、正式发布及容量網路量測尚待執行；長期目標仍active。
