# C04校園合格候選發布批（2026-09-09）

分支`codex/court-guide-completion-c04-final`，base ee727b8。正式26篇，本機候選28篇。新增台科大週末一般使用、木柵國小兩面季租；範圍沿已核可台北目錄，零DB／migration，不開放全台底稿。來源全文與費表閱圖見[六筆查核](court-guide-completion-c04-schools-final-2026-09-09.md)。

最新狀態：PR #11已正式發布28篇，詳細驗收與限制見文末；下方本機／待發布敘述保留為歷史。

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

已推送程式81691e2，並為本分支設定兩個Preview Supabase公開變數；接續Git建置。Production設定未變。

## Git候選驗證

PR #11 head `296f32c18795533097f7205ef757d6b9e1bbe6a6`，CI34353541132進行中。Git Preview `dpl_72q8wiVNqUzNaoiYTSootEZVnfEJ` READY，穩定入口 https://tennis-partner-finder-git-cod-eeb92c-xinnians-projects-c513dbd3.vercel.app 。

28篇內容／來源HTTP、桌面／390px搜尋、no-JS、兩新篇4組畫面通過，index單一JS、未載Maps／私有資料模組；preview sitemap刻意0，未知指南與全台底稿404。開局首跑重現Google Maps65/14a getRootNode錯誤（完整stack在/tmp/qiuka-c04-final/preview-entry.log）；原斷言不改，後兩輪各4組通過且無發布／訂閱寫入，不宣稱偶發錯誤已修復。分享QA首版寫錯不存在/share/session路徑得到404；對照vercel.json修正為/s/與/api/share，200／404／405及no-store通過，未改產品路由。

## 正式發布與收尾

PR #11必要CI34353541132成功，head296f32c，merge `d597158e5438cd1ae3c99e8049c48fc42aab85e6`。Production `dpl_2p2zwrRVHcak4JSiS96h348gDGPx` READY，qiuka.tw別名已確認。CI775 unit／384 Chromium、1305 SQL、4 API、46 browser／12skip、6 mobile、20 preview、四組Edge(1/1/1/2)通過。Safari mock189 pass／2 fail／3 skip：shell2763ms>2500、nearby drawer立即點球局焦點inactive；preview Safari9 pass。整體success來自既定非阻擋設定，不代表所有測試通過。

正式28篇逐fact／來源HTTP、sitemap30、未知指南及全台底稿404、搜尋／鍵盤清除／44px／no-JS、两新篇4組內容及開局意圖／取消清除通過；沒有送出球局或訂閱。分享/s/21 GET／HEAD與/api/share?id=21皆200，未知404、POST405，全部no-store。正式pageerror及console0，QA在`/Users/ian/tennisPartnerFinder-qa/court-guide-c04-final-2026-09-09/production`。

獨立首訪各裝置3次，最大788802 raw／242900 encoded bytes <820000／260000；桌面LCP中位628ms、手機8164ms，pageerrors0。容量合格不等於效能成效達標，手機及既有Safari／Maps風險保留。

本分支兩個Preview公開變數已移除，env ls確認無分支變數；Production環境未改。Production env臨時匯出檔已刪除。台北28篇正式、33筆未發布（32待來源、1待現況），27篇44欄pending。61筆都有具體處置，不宣稱所有資訊齊全。完整[C01–C04驗收](court-guide-completion-acceptance-2026-09-09.md)記錄剩餘維護；不啟動新北／全台公開或其他G項。
