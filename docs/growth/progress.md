# 產品改善進度（接續先讀）

## 2026-09-11 分享卡提交與推送

- 使用者核可最終卡片並要求commit and push。提交範圍為逐局PNG、分享HTML串接、字型與授權、測試／打包檢查、實際預覽及對應規格。
- 使用者進一步核可通知／聊天與分享卡一起推送。改在main提交本批分享卡，再連同既有1680b98推送；該提交包含通知migration，但Git推送不代表已套用Hosted DB或部署Edge。其他成長草稿保留未提交。
- 沿用18項分享測試與已記錄驗證限制；本輪另驗提交差異、最終本機建置與函式打包。正式部署／實機LINE與成效尚未完成；push後確認遠端SHA。下一步確認main遠端SHA與CI／Vercel結果；Hosted DB／Edge及LINE實機驗證仍分開記錄。

## 2026-09-11 分享卡移除輔助文字、校準背景

- 依使用者要求，圖片移除年份／台北時間及「已訂場」文字；仍保留額滿、現場等場／未定案等必要狀態，HTML摘要與日期台北時區契約不變。模板revision升card-v3。
- 對照原圖空白背景區的色彩與紋理強度，調整既有底色及固定seed紋理透明度，未新增依賴／圖片素材或外部產圖服務；不宣稱與AI示意逐像素相同。五張PNG及比較頁截圖已更新，一般卡已目視確認文字移除與背景效果。
- 18項分享測試、變更檔lint／format與diff檢查通過；未重跑完整local或部署打包（本輪只改SVG內容），前述local探索資料量阻礙保留。未commit／push／部署／LINE實測，無產品成效。
- 下一步：使用者檢視本版卡片；發布前按既有流程完成檢查。

## 2026-09-11 分享卡視覺修正版完成，待使用者回饋

- 使用者否定第一版實際PNG的視覺忠實度，並核可依原示意稿重新校準。新增Noto Serif CJK TC Bold，放大日期／時間／球場、調整左邊界及資訊間距、重畫四條球場線、加入固定seed微紋理；模板revision升card-v2。未新增分享步驟或改資料邊界。
- 五張真實PNG已重產並逐張目視檢查，另提供[原稿與實作並排](share-card-preview/comparison.html)／[截圖](share-card-preview/comparison.png)，包含360px縮圖示意。原參考圖與程式產圖明確分開；視覺修正完成不代表使用者已驗收。
- 本輪18項分享測試、變更檔lint／format、Vercel本機build及隔離HTML／圖片bundle檢查通過（Regular／Bold兩檔皆確認）。PNG約1MiB；只增加server字型，不增加browser依賴。詳見[spec v2](session-share-image-2026-09-11.md)。上一輪local探索API資料量阻礙仍保留，本輪僅視覺模板調整未重跑local；未清庫。
- 未commit／push／部署／實機LINE驗收，沒有產品成效。下一步由使用者比較原稿與實際修正版；如視覺符合預期，再依既有發布流程處理必要檢查及LINE實機驗證。

## 2026-09-11 逐局連結預覽圖片第一版本機完成

- 使用者核可「先做一版看看」；A精修視覺已轉成固定server模板，`/s/:id`的og:image改為逐局PNG端點。沿用原分享文字／網址，不新增使用者步驟；深綠襯線卡包含日期時間、球場、玩法程度與場地狀態，長名／候選／額滿有對應排版。五張[實際PNG預覽](share-card-preview/README.md)使用虛構資料，非AI成品或真實球局。介面、來源、快取與限制見[本批spec](session-share-image-2026-09-11.md)。
- 與HTML共用匿名discovery讀取與窗口，失效／下架中性404、provider失敗503，不讀raw／私人資料；固定字型與resvg僅server打包，附字型授權。圖片no-store＋公開欄位revision，仍不保證外部平台刷新快取。
- 驗證：最終focused18 pass（含Vite HTTP→PNG）；完整unit第一次789 pass／5 skip，後加HTTP測試另以focused驗證；桌面Chrome／手機Chrome／WebKit選定分享相關browser12 pass。typecheck／lint／format／build／strict bundle通過，0 exceeded；五張PNG目視檢查。Vercel本機build與隔離HTML／圖片函式打包驗證通過，非hosted Linux驗收。
- `npm run test:local`為3 API pass／1 fail：探索fixture回DISCOVERY_TOO_BROAD，browser未啟動。未改探索API／清库／削弱斷言，保留阻礙；本批零migration。日誌與完整限制見spec，不宣稱local gate全綠。
- 實作與上述驗證完成；尚未commit／push／部署／實機LINE分享，沒有真實使用成效。下一步先檢視本版PNG；發布前處理／確認探索資料量阻礙及release checklist，發布後驗LINE與快取。其他session的既有修改保留。

## 2026-09-11 球局圖片分享討論（提案，未實作）

- 使用者選擇A連結預覽並要求更有質感；已用內建imagegen產出A精修概念，深森林綠／暖白、襯線日期與中文、細球場線條及少量網球黃，並排大卡與聊天縮圖。已目視檢查主要文案及層級；僅示意資料與對話預覽，未新增程式／專案素材、未跑產品測試、未部署，未宣稱實際App呈現或成效。下一步依精修稿回饋確認字體與版面，再補逐局OG圖片實作規格及長球場名稱／候選局等狀態設計。

- 後續使用者希望先看兩種感覺：已用內建imagegen產出並排聊天情境概念圖，A為橫式連結預覽、B為直式圖片附件另附網址，使用同一組明示假資料；檢視並修正左卡球場名稱生成錯字。圖片僅供對話預覽，不是實機截圖或已實作介面，未新增產品素材依賴。視覺完成，未做runtime／產品测试、未部署，無成效資料；下一步依使用者對兩種形式的回饋收斂設計與規格。

- 使用者希望討論純文字分享是否適合加入圖片。已檢視分享摘要、native payload及server OG：現有系統分享傳文字與網址，逐局預覽沿用共用 `/og.png`，尚無逐局資訊圖。
- 建議優先評估逐局連結預覽圖，保留可點網址及文字；可下載／直接分享的球局圖片作另一選項。圖片以時間、球場、玩法、程度、場地狀態為主，缺額若呈現需標明快照及最新資訊以連結為準。此為建議，未核可實作，無成效證據。
- 查閱MDN Web Share及Open Graph官方規格；本輪只更新進度，git diff --check驗證，未改runtime、未跑產品測試、未部署或代發。
- 下一步：確認使用者主要想改善聊天連結預覽或直接傳圖，再製作對應球局卡視覺示意與介面規格。

最後更新：2026-09-11。G02／G03／G04／G10 已上線；G09 已擴至 61 篇（23篇開放待確認）並加入名稱／行政區查找，均已正式部署，全台 562 筆待審底稿與品質報告已建立。正式站驗證及真實成效分開記錄。

## 2026-09-11 自建球局通知／聊天室返回修正（本機完成，未部署）

- 使用者核可第 1、3 項修正；[本批規格](self-notification-chat-back-2026-09-11.md)記錄介面、history／生命週期與派送邊界。第 2 項聊天期限不變。
- 通知產生端排除自訂閱主揪，涵蓋單一／候選球場、新舊格式；migration 202609110001 停止待送 legacy 自我廣播。舊 Edge 派送另使用 202609110002 service-only `filter_legacy_court_notification_ids` 查核，拒絕主揪本人與缺失來源，不放寬 sessions／profiles 原表權限，不新增 browser 讀取或 push payload 個資。
- chat app wiring 接上暫時 history ownership；兩個 React 入口明確聚焦，補足 Safari 點擊不自動聚焦；Back 關閉並回原入口／恢復焦點，dismiss 消耗 entry，快速 reopen 不被前次 popstate 誤關；權限撤銷與換帳號清除 ownership、不恢復私人聊天。保留 lazy cancellation 與 feed stop。
- SQL 1,313 通過；完整前端 gate（型別／lint／格式／unit 782 pass、5 skip／Chromium 386 pass、4 skip／build／bundle structural check）通過。服務資格 RPC 調整後追加 targeted unit 14 pass、lint／格式重驗通過；生成 DB types 只新增服務 RPC 型別。
- 最終前端 `npm run test:ci:frontend` 再跑通過（unit 782／5 skip、Chromium 386／4 skip）；型別、lint、格式、build、bundle structural check 與 diff check 通過。最終 JS total raw/gzip 948,125／284,509 bytes；沒有調高門檻。
- 真實本機登入 1280×844／390×844 的兩入口 Back、關閉、重開、焦點在 Chromium／WebKit 各兩項通過；最後 Chromium 定向組包含 quiet polling、傳訊／封鎖／封存唯讀共4項通過。Browser plugin not available，使用 Playwright；畫面存在、title／URL、無 Vite overlay、console error 檢查納入回歸。截圖在 /tmp，非發布產物。
- `npm run test:local` 曾取得 API4通過、browser40通過／12 skip，首次建檔訂閱 UI 同步失敗導致後7項未跑；這7項另跑通過。訂閱 UI 失敗也在未修改 HEAD 2417b84 的暫存 worktree 重現（同一本機 DB），記為獨立問題；該 worktree 已移除。後續重跑因測試球局累積超出探索上限，performance 隱藏狀態列及 API discovery 遇到 DISCOVERY_TOO_BROAD，完整套件不能標全綠；未放寬斷言或清庫。新增自我通知入列斷言在 discovery 前通過。實際 service RPC transport 成功、匿名呼叫42501。
- 尚未部署，兩支 migration 僅套用本機，未重置資料庫、未改 hosted 設定或發送真實推播；沒有產品成效宣稱。WebKit 是定向驗證，完整 Safari、iOS／Android 原生手勢及真實推播未驗證。
- 提交授權：使用者於本輪要求 commit；只提交本批修正、測試、規格及本批進度，其他分享圖片／成長文件維持未提交。本輪檢查 staged diff 與格式，沿用以上驗證；未 push／部署。
- 下一步：依 release checklist 依序發布兩支 migration、legacy Edge 與前端，再由實機確認通知及返回；另行處理首次建檔訂閱顯示同步及測試資料隔離問題。先前與本批無關的文件改動保留。

## 2026-09-11 測試回報三項初查（評估，未修正）

- 本輪依使用者要求確認是否需調整，靜態追查通知 SQL／Edge、聊天 RPC／controller／sheet 與 history 接線。
- 自建球局通知：舊 `try_enqueue_court_new_session` 未排除主揪；202609070001 新版 dispatcher 的 court_new_session recipient eligibility 已排除 host。應修正自我通知體驗，但根因仍須核對回報環境的 migration／Edge／派送版本及該次事件，不能把舊 enqueue 缺口直接認定為新版實際送出原因。
- 過時聊天：現行規格為 cancelled／played／expired 後唯讀；一般球局 start_at + 24h 到期，未定案候選局在範圍起點到期。post_session_message 先 lock_and_expire_session，再拒絕封存局。僅超過開始時間仍可聊天符合目前規格；建議明示可聊天期限，若已封存或超過 24h 仍成功寫入，需按實際事件另查。前端在 participation refresh 或 RPC SESSION_ARCHIVED 後更新唯讀。
- 手勢返回：chatSessionWiring／surface 開啟未建立 history entry，main 接 hashchange 而沒有聊天室專屬返回狀態。建議串接返回歷史，確保返回關閉聊天室、回原入口及保留焦點／清理輪詢；手機原生邊緣返回仍需實機驗證。
- 本輪未改 runtime／migration、未執行產品測試、未重現真實推播或手機手勢、未部署，無產品成效證據。只新增本段進度並以 git diff --check 檢查。
- 下一步：核對回報的環境與通知派送版本；實作自我通知防護及聊天室返回修正前補對應 spec／回歸案例，聊天期限若要縮短則先明訂產品規則。

## 2026-09-11 第3點摘要與標題提交

- 使用者要求commit and push；本批提交新版摘要、統一「球咖｜球局資訊」標題、對應測試及分享規格／進度，其他文章與成長規劃草稿保留未提交。
- 本輪僅Git整理，runtime與測試未再改動，沿用下方最後一次標題調整驗證及既有local訂閱UI失敗限制；檢查提交差異、文件連結與diff格式。
- 已fetch確認main與origin/main無分岔。提交後推送並核對遠端SHA及CI／Vercel狀態；推送不代表部署或實機驗收完成，沒有使用者成效數據。
- 下一步：確認本批CI與部署結果，上線後實機檢查分享／複製格式；既有訂閱UI問題仍待獨立追查。

## 2026-09-11 分享標題調整（本機完成，未提交／部署）

- 使用者同意改為「球咖｜球局資訊」；摘要首行與Web Share title均已同步，保留第3點新版排列、台北時間及產品範圍。無DB／按鈕／路由修改，其他工作區內容保留。
- 驗證：沿用並更新既有測試，growth unit5 pass；桌面Chrome、手機Chrome／WebKit分享及複製共6 pass，包含native title與摘要首行相同。typecheck（local pre-script）、變更檔lint／format、build、strict bundle及diff通過；initial664833／194522、total947017／284047 raw／gzip，0 exceeded。
- 必要local整合：4 API pass，完整browser40 pass／1 fail／5未執行／12原skip；再補跑serial未執行5項全過，合計45 pass／1既有失敗。失敗仍是前批已在修改前HEAD重現的新帳號全部球場訂閱UI勾選，未更動其程式或斷言，不宣稱local gate全綠。未清庫、零migration免schema測試；本輪未重跑完整mock套件。
- [規格](native-session-share-2026-09-11.md)示例與標題要求已同步；日誌為 `/tmp/qiuka-title-browser.log`、`/tmp/qiuka-title-local.log`、`/tmp/qiuka-title-local-remaining.log`、`/tmp/qiuka-title-build.log`、`/tmp/qiuka-title-bundle.log`。沒有使用者成效數據或實機目標App驗證。
- 尚未commit／push／部署。下一步將本次標題與第3點格式整理為同批提交；既有訂閱UI問題另行追查，發布後再由本人檢查實機貼上格式。

## 2026-09-11 第3點摘要格式補完（本機完成，未提交／部署）

- **實作**：依使用者要求補齊第3點，共用摘要改為「中性標題 → 時間｜球場 → 玩法｜程度｜缺額或狀態 → 場地狀態 → 最新資訊連結」。分享／複製同源，native網址不重複；未定案不承諾球場，已定案不冒稱訂場，取消／額滿等不顯示缺人。
- **介面／規格**：[規格補充](native-session-share-2026-09-11.md)有完整示例及狀態契約。只修改 `sessionShareSummary` 的文字／排列與對應測試，既有分享按鈕、API、路由、隱私allowlist及焦點／生命週期不變；未新增DB或SDK。
- **驗證完成**：frontend gate通過778 unit／5 skip、386 Chromium／4 skip；手機WebKit分享／複製2 pass；local 4 API、46 browser／12 skip全過。型別／lint／format／build／diff與strict bundle通過，initial664833／194512、total947017／284051 raw／gzip，0 exceeded。未清庫，零migration免schema測試。前批訂閱UI失敗本輪未重現，但未修改或宣稱修復該問題。
- **部署／成效**：本次格式修改尚未commit／push／部署；前批已推送的分享入口不等於新版摘要已上線。測試使用分享API stub，未代發訊息，無真實分享或成局成效。其他文章與成長草稿保留原未提交狀態。
- **下一步**：將本批摘要、對應測試及規格納入後續提交／發布；上線後以實機LINE／複製貼上檢查格式，依使用回饋微調。

## 2026-09-11 第3點摘要格式完成範圍更正

- 使用者詢問第3點是否完成；查核已推送的 `68b12dd` 後確認：系統分享／複製已共用 `sessionShareSummary`，native網址不重複，但摘要文字與排列沿用原版，尚未套用先前初步確認的第3點新格式。不能以分享入口完成代表摘要文案調整也完成。
- 本輪只讀取提交差異並更正進度，未改runtime／新增commit／部署；先前驗證只支持已提交的共用摘要與分享行為。下一步補齊第3點摘要文案與格式，沿用中性語氣及公開欄位限制。

## 2026-09-11 分享與指南提交已推送

- 使用者明確要求push；已fetch確認遠端無分岔，推送 `main` 的 `d81b8fb`（三場指南補證）及 `68b12dd`（球局系統分享）。`git ls-remote`確認origin/main為 `68b12dd10892642226753afe8cc89deab3884a3c`，未force push，未包含未提交的文章／成長規劃。
- 本輪僅Git推送與狀態查核，未改runtime或重跑測試；前輪frontend／分享／bundle通過，以及修改前版本也會失敗的local訂閱UI測試限制維持，沒有把push指令視為測試修復或人工發布QA通過。
- [Quality Gate 34566549517](https://github.com/xinnians/tennisPartnerFinder/actions/runs/34566549517)查核時in_progress；部署與正式站新版本尚未驗證，不宣稱已上線。無hosted DB／環境設定變更，無使用者成效數據。
- 下一步：查看該commit的CI／Vercel最終結果及正式站版本，再做實機分享驗收；既有訂閱UI失敗另行追查。本段為前批push後接續紀錄，隨本次摘要格式提交保存。

## 2026-09-11 開局後系統分享完成（本機，未部署）

- **實作**：使用者核可先做再試用。成功畫面加入主要「分享球局」，我的球局主揪卡提供相同入口；支援時直接開系統選單，無支援改複製摘要，取消安靜結束，不宣稱已傳送。文字及 `/s/:id` 共用、避免native重複網址，不輸出名單／備註／私人ID。
- **介面／保障**：[規格及QA](native-session-share-2026-09-11.md)記錄adapter／app callback新增及browser manifest更新。分享保留user activation、防連點、焦點、卸載與auth epoch保障；一併修正桌面成功畫面沿用表單捲動造成圖示裁切。未新增DB／SDK／追蹤事件，未代發，保留其他工作區內容。
- **驗證完成**：最終frontend gate通過777 unit／5 skip、386 Chromium／4 skip；定向分享桌面Chrome、390px Chrome／WebKit共3 pass，頁面識別／無overlay／console0／截圖目視通過。strict bundle initial664803／194509、total946987／284044 raw／gzip，0 exceeded；型別／lint／format／build／diff通過，未調高預算。零migration免DB schema測試，沒有reset。
- **本機整合限制**：第一輪4 API／46 browser通過；最後source完整local重跑有1項「新帳號全部球場訂閱」UI勾選失敗，資料庫資料斷言已過。修改前HEAD `d81b8fb`亦重現相同失敗；另補跑serial未執行5項全過。最終4 API、45 browser通過／1既有失敗／12原skip，不宣稱local gate全綠，根因仍待釐清。日志與重現命令見QA。
- **部署／成效**：本次依使用者要求提交分享功能、測試與本批紀錄；未push、未部署；系統sheet以API stub驗證，實機LINE／複製選項與貼上格式尚待試用。沒有真實分享／加入／成局成效。文章仍草稿，其他G項不啟動。
- **提交檢查**：本輪僅整理commit範圍及更新文件，檢查staged diff／文件連結；runtime與測試未再改動，沿用上述驗證結果。其他文章／成長規劃保持未提交。
- **下一步**：發布前先處理或獨立核定既有訂閱UI測試失敗，再走Git release流程；上線後由本人在手機試用分享，依實際內容格式與操作感受調整。


## 2026-09-11 原址與現排補充（未部署）

- 使用者確認新生為原址，已記錄於查核文件及清冊，不再把是否搬遷列作未解問題；不是新增官方或實地勘查證據。沿用只採官方來源規則，JSON精確位置與指南限制本輪未調整，入口對應另待補。
- 南港使用文案改直接說明採現場輪流、不走網球線上預約，依據前輪已讀官方來源；排隊登記、輪替時長、費用與照明仍待確認。更新對應unit及規格。
- 驗證：指南unit、測試檔Prettier及git diff --check通過；本輪僅文字／文件，不重跑前輪完整前端及browser驗證。未部署、未改城市／DB，沒有產品成效。
- 提交：使用者要求commit，本次僅提交三場指南、對應測試、清冊／查核／規格與本次進度；不包含其他文章或成長規劃，未push或部署。
- 下一步：補官方新生入口與座標對應，以及兩場尚缺的具體使用規則；本機改動上線仍待Git發布流程。


## 2026-09-11 三場官方補證完成（本機，未部署）

- **實作／證據**：更新`data/court-guides.json`新生、南港、天母三篇及[逐場清冊](court-guide-completion-tracker.md)、[規格補充](court-guide-pending-publication-2026-09-10.md)。新生取得官方九月季租資格、戶外館址、費時／報到／雨天；南港成功展開iPlay23084網球專欄，確認對象無限制及新版兩面不租借；天母取得官方圖片→會員表單直接鏈路，確認免費註冊後櫃檯驗證。完整來源、日期／筆誤及取捨見[本輪查核與QA](court-guide-official-check-2026-09-11.md)。
- **安全界線**：新生原目錄座標／入口及戶外共用仍未知，維持指南動作與導航限制；天母2021舊價目／預約圖片未升格現行費時。南港輪替時長、現場費用／夜照待補；不套籃球入口或舊活動租借費。三篇booking pending不變；61篇、23篇access unconfirmed、8篇位置unconfirmed、60篇77個facts pending未變。只刷新實際重讀來源日期，完整覆核期限仍2026-12-08；公開城市、seed、DB及其他58篇未動。
- **驗證完成**：完整前端gate通過，777 unit／5 skip、384 Chromium／4 skip；新增三篇preview旅程桌面Chrome、390px Chrome／Safari共3 pass，console／pageerror0，無溢出，新生入口限制保留，兩張截圖已目視。typecheck／lint／format／seed與catalogue／build／strict bundle／diff通過；嚴格total JS945092／283490 raw／gzip、0 exceeded。沙箱EPERM與preview產物環境不一致的初次失敗及重跑記錄保存在QA。零src runtime／migration，本輪未跑DB／API整合或全套Safari mock。
- **部署／成效**：未commit／push／部署，正式站仍為前批；未對外聯絡、提交會員表單、訂場或改hosted設定，沒有新增真實使用成效。保留本輪開始前及其他工作中的文章／成長文件修改。
- **下一步**：取得新生網球平面圖與原座標對應、當期臨租及第四季受理；取得南港逐面輪替／夜照公告；取得天母現行價目及預約／取消規則。資料更新上線須另走既有Git發布驗證；不能把本機QA標成已上線。

## 2026-09-10 待確認指南公開（61篇已正式部署）

- **實作**：依使用者核可新增33篇，61篇皆可查閱；23篇開放狀態待確認，無指南開局／訂閱／近期球局；8篇位置有疑義無導航。38篇保留指南動作。URL／登入intent／controller均檢查受限指南；不改DB場地狀態或其他既有約球入口。公開來源排除tennislocal／jojotennis，原始來源日期保留。
- **驗證**：PR #12 head`b6e425c`，必要CI34432326956前端及Supabase成功（776 unit／384 Chromium、1305 SQL、4 API、46 browser、6 mobile、22 preview、四組Edge）。本機預覽Chrome22／Safari10通過。Safari mock本機9項失敗在上線前基準亦相同；CI mock1項shell3490ms未過2500ms。CI Safari preview另有長列表截圖像素上限失敗，收尾改CSS像素並驗證該測試通過，未改runtime。完整失敗紀錄見[規格與QA](court-guide-pending-publication-2026-09-10.md)。
- **已上線**：merge`a02eb09d40a41e61a6f5753b48d6545919f4ac5c`；Production`dpl_ED1jNwxWFjCCrhqkQ14Cd3BZkyWf` READY。qiuka.tw61篇／sitemap63／未知404、桌面及390px／搜尋返回／no-JS／4組正常指南開局取消均通過，pageerror0。正式公開球局為空，分享404／405與no-store通過，200路徑本輪未重驗。
- **容量**：嚴格build initial663849／194280 raw／gzip、total945407／283708；正式首訪各裝置3次最大790807 raw／243422 encoded bytes，均過原上限且未調高。桌面LCP中位648ms、手機3400ms（地圖容器6807ms）；空球局情境不同，不宣稱相比前批改善。
- **成效與未完成**：60篇77個facts及新增33篇booking pending，發布不等於資料齊全或皆可入場；使用意願／留存成效未取得。新北28及全台562底稿未公開。完整覆核期限2026-12-08。
- **清理／下一步**：兩個分支Preview變數、Production env匯出檔及臨時dev server已清理；215筆本機原fixture狀態已恢復，後續測試需先處理容量。下一步先補新生位置／開放、南港規則適用、天母官方註冊與費時，再按[清冊](court-guide-completion-tracker.md)補其餘未知資訊。沒有排程或對外聯絡。

以下28篇／33筆未發布為當時歷史紀錄，最新狀態以本段及清冊為準。

## 2026-09-10 公開來源補充與南港新證據

使用者指定jojotennis.com/courts不列公開頁面來源，VBS609及iPlay23084可引用；已保存至補完計畫。檢查data、src及既有研究文件未找到jojotennis引用，無需移除runtime來源。VBS609早已是南港目錄sourceUrl，iPlay已用於其他指南，但既有紀錄未證明讀過23084全文。

本次重讀[VBS609](https://vbs.sports.taipei/venues/?K=609)，用途段明列不開放線上預約者供現場民眾輪流、禁止營利；修正先前籠統的「沒有現場流程來源」描述。仍需與新VBS514確認適用情形，輪替細節、個人費用／夜照未解。iPlay23084本次直接讀取失敗，搜尋未取得該場網球全文，不宣稱已確認。下一步優先取得23084原始內容並交叉核對南港。只更新文件，git diff --check通過；正式28篇未變，未部署。

## 2026-09-10 使用者指定來源原則

不將 tennislocal.app 本身納入資料來源或佐證；僅可沿用其列出的原始來源連結，直接讀取並獨立查核後引用原始來源。此原則已寫入補完計畫，後續session沿用。本次只更新文件，git diff --check通過；未改公開內容、未部署，發布數與補證狀態不變。下一步依此原則接續官方來源補證。

## 2026-09-10 原未發布33筆第二輪補證（研究歷史）

使用者已要求補足33筆證據；本輪先深查天母、新生及8座公園，另補政大新學期公告，共11筆有本輪實讀的官方／營運公開內容；其餘22筆未完成第二輪。完整[補證紀錄](court-guide-evidence-followup-2026-09-10.md)保存來源、日期、取捨及詢問稿，逐場狀態已更新清冊。不能把「找到更多來源」當作「全部達發布門檻」。

天母已取得會員表單所載首次訂場流程，待直接官方連結確認表單歸屬；市府PDF已視覺核對粉專身份。新生2026-07-27開幕新聞明列網球，仍缺原目錄位置對應及網球實際使用流程；8公園新VBS的「未開放租借」不足以判斷現場規則。政大仍需環山專屬位置／時段。正式維持28篇、33筆未發布（32待來源、1待現況），27篇44欄pending未變；本輪未改指南JSON／runtime，未部署，沒有成效數據。

已實讀8個新版VBS渲染頁、天母公開粉專及空白表單、市府開幕全文／PDF、政大公告，未送表單或對外聯絡。研究文件通過本地連結存在檢查與git diff --check；不以應用測試代替來源驗證。工作分支codex/court-guide-evidence-followup-20260910。下一步：優先核對天母官方表單連結；新生與8公園需要網球專屬現行規則。其後查明德／國北教大／陽明兩區及政大位置時段，對外詢問稿已備妥但尚未寄送；完整覆核期限仍2026-12-08。前述C01–C04首輪完成屬歷史里程碑，本次追加補證尚未完成。

## C01–C04首輪補完完成（首輪歷史，當時28篇正式）

台北61筆皆有具體查核處置；28篇已發布，32筆待補來源、1筆待釐清現況，沒有合格待發布項。27篇仍有44欄pending，不宣稱61筆資訊齊全或使用／留存成效達標。逐項[目標驗收](court-guide-completion-acceptance-2026-09-09.md)、[清冊](court-guide-completion-tracker.md)及[PR11發布證據](court-guide-completion-c04-final-2026-09-09.md)已保存。下方各批「下一步／未發布」為歷史，接續以本段為準。

新增台科大週末使用及木柵國小兩面季租。PR11 head296f32c、merge d597158e，必要CI34353541132成功；Production dpl_2p2zwrRVHcak4JSiS96h348gDGPx READY。正式28篇／sitemap30／搜尋／no-JS／桌面與390px新指南及開局取消／分享狀態均通過，pageerror0。首訪各裝置3次最大788802 raw／242900 encoded bytes，在既有820000／260000上限內；手機LCP8164ms限制保留。Safari mock189 pass／2 fail／3 skip（shell2763ms及drawer焦點），preview Safari9 pass；預覽首跑Maps錯誤後兩輪通過，未宣稱修復。

臨時Preview兩變數與Production env匯出檔已清理。維護人ian／Codex，下次完整覆核2026-12-08；營運異動即優先處理。後續先查新生現況、木柵下一季受理、台科入校／換證及清冊所列具體缺口。新北28與全台562候選未公開，C05–C08與其他暫緩G項未連帶啟動，沒有排程或對外聯絡。

## 長期目標：台北61筆逐場補完

- 使用者「請建立一個長期目標並繼續」已核可持續執行C01–C04。已建立持續目標，完成標準為61筆皆有可靠來源查核處置、合格內容已驗證發布、未解決疑義及維護方法完整保存；不是承諾61篇全部公開。
- C02歷史里程碑：當時20篇已發布，41筆未發布。C02本批8筆已查核，復興／榮華／洲美／迪化四篇已正式上線，其餘4筆待來源／現況；[證據與QA](court-guide-completion-c02-2026-09-09.md)已保存。PR #7必要CI及Safari全通過，merge `b380a6a`、production `dpl_3n4WgYsnX5sAmv39pg6G8tJmVGcE` READY；qiuka.tw 20篇／sitemap22及桌面／390px開局取消通過。首訪容量最大788439／242763 raw／encoded bytes通過；手機LCP8160ms限制保留。本批18篇26欄pending，長期目標仍進行中。
- C03十筆已有[逐場處置](court-guide-completion-c03-2026-09-09.md)：葫蘆洲內容與迪化入口提醒完成，Git預覽21篇通過內容／搜尋QA；觀海可發布待實作，另8筆待具體來源。迪化工程公告明示網球照常使用，但部分入口封閉、未確認竣工。開局首跑偶發Maps getRootNode錯誤，重查通過仍保留風險；正式仍20篇。
- 全台公開、跨城市開局及其他暫緩G項不連帶啟動；沒有建立排程或對外聯絡。

## C03 最新狀態（已正式部署）

- 新增葫蘆洲指南、補上迪化工程入口提醒，正式21篇、台北40筆未發布；19篇28欄pending。
- PR #8 head64e4df9，必要CI34345785799及Safari全通過；merge `aa2e77fdb8e036570133d5d8533629dec67b8177`，Production `dpl_7FPdpKMdKCT3gh1fJWjzDbGgp4rW` READY。qiuka.tw全21篇HTTP200、sitemap23、未知指南／全台底稿404，桌面與390px搜尋／清除焦點／no-JS、兩篇4組內容／開局取消、分享200/404/405及no-store均通過；正式pageerror0。
- 預覽入口首跑一次Maps getRootNode錯誤（stack已保存），後兩輪及正式均通過，沒有宣稱偶發錯誤已修復。原始local測試在清理192筆本次產生的local fixture後通過，未重置DB或保留測試替代路徑。完整結果見[C03證據](court-guide-completion-c03-2026-09-09.md)。
- 已移除本分支兩個Preview公開變數、刪除Production env臨時匯出檔。首訪各裝置3次容量最大788495／242659 raw／encoded bytes，低於820000／260000上限；桌面LCP中位612ms、手機8152ms，pageerror0。手機慢網路效能缺口保留，上限不變。
- 下一步：觀海已符合基本公開門檻，草稿 `/tmp/qiuka-c03/guanhai-guide-draft.json`；套入JSON前核對來源，走必要測試／Git發布。另8筆已列待補來源、26筆台北未查核及C01其餘11篇覆核接續；長期目標保持進行。

## C04 最新狀態（已正式部署）

觀海／溪洲／雙園三篇已正式發布，現24篇、台北37筆未發布。PR #9 merge `f0bcedddeee144da707e06159b005340e7c760d1`、Production `dpl_8stP3nFiVwUCuEueBj7sxfvmh8n8` READY。CI34348031374前端／Supabase成功；Safari mock190 passed／1 failed／3 skipped（shell3175ms>2500ms），preview Safari9 passed。正式24篇／sitemap26、搜尋／no-JS、三篇6組長文及開局取消、分享200/404/405全部通過，pageerror0。首訪最大788644／242736 bytes過既有上限，手機LCP中位8172ms限制保留；預覽偶發Maps錯誤未宣稱修復。完整本機／來源與QA見[C04紀錄](court-guide-completion-c04-2026-09-09.md)。分支Preview兩個變數與env匯出檔已清理。候選三民與北醫接續實作，其他待來源與校園查核持續。

C01九座河濱的新版VBS頁已覆核，逐筆處置與夜照原則／大佳入口新來源見[覆核紀錄](court-guide-completion-c01-followup-2026-09-09.md)。PR9已發布，接續更新適用文案，逐面夜照未知仍保留。C01兩座營運球場亦完成覆核：中心可補繳費期限、網球場新增取消條件差異；C04校園16筆已皆有首輪處置，台科／木柵為下一批候選（尚待實作），見[校園紀錄](court-guide-completion-c04-schools-2026-09-09.md)，並非長期目標完成。

## C04補強最新狀態（26篇已正式部署）

新增三民／北醫，九河濱夜照、大佳入口及兩營運球場預約／取消補強已發布。PR10 head02a8349、merge471d70b，Production `dpl_88EvseZfdvb4uSJ6TuZa7UDDMhwp` READY。必要CI34351291388成功（775 unit／384 Chromium、1305 SQL、4 API、46 browser、6 mobile、20 preview、四組Edge）；Safari mock189 pass／2 fail／3 skip（shell3744ms>2500與nearby drawer焦點），preview Safari9 pass。失敗保留，不宣稱全綠。

qiuka.tw 26篇內容來源、sitemap28、搜尋／no-JS／鍵盤、兩新篇4組長文及開局取消、分享200/404/405/no-store通過，正式pageerror0。首訪各裝置3次容量最大788723 raw／242817 encoded bytes，低於820000／260000上限；桌面LCP中位692ms、手機8168ms，手機效能缺口保留。臨時分支Preview兩變數與env匯出檔已清理。詳見[本批發布證據](court-guide-completion-c04-followup-2026-09-09.md)。

台北61筆已全部有首輪查核處置，26篇發布、35筆未發布，25篇39欄pending；不能解讀為61筆資訊齊全。下一步：[最後六筆證據](court-guide-completion-c04-schools-final-2026-09-09.md)中的台科大週末使用／木柵國小季租指南候選，草稿`/tmp/qiuka-c04-schools-final/guides-draft.json`。先核對台科近期臨停與場地位置、木柵下一季受理，保留未確定欄位，再走必要驗證及Git發布。其他待來源皆有具體下一步；長期目標仍active。

## C04校園最後候選（本機28篇、未發布）

台科大／木柵國小基本指南已寫入JSON與生成catalog；最新台科連假休館與校園圖已查核，木柵下一季日期、兩面費用寫法及夜照單元仍明示pending。正式26篇未變；接續完整必要驗證與Git發布。見[本批狀態](court-guide-completion-c04-final-2026-09-09.md)。

## 2026-09-09 補完目標已啟動

- 使用者「建立相關目標開始進行」核可執行。已建立本批目標：C01 民權、青年、道南、百齡社子岸四座高影響疑義，以及 C02 北投運動中心、天母兩座來源查核。
- 工作分支 `codex/court-guide-completion-c01`；[六座本批查核](court-guide-completion-c01-2026-09-09.md)完成，北投指南及青年／道南／百齡補強已實作。天母維持未發布，其餘關鍵缺口保留；C01全部15篇及C02全部10候選仍未完成。
- 本機完整frontend／local／mobile／preview Chromium與WebKit、正式容量及hosted preflight通過。PR #6 head `57ace4e`，Git preview `dpl_G34nh9MMFQXjK4CDYErdUHK57pRZ` READY；必要CI成功，PR #6已合併，正式Vercel `dpl_4HaKw7ybmYrMQYTgvbgmXGGbVNUf` READY；qiuka.tw 16篇／sitemap18、桌面及390px搜尋／開局登入取消通過。

- 本批目標已完成：16篇已發布、台北45筆未發布；14篇18欄pending（含本批明列的既有疑義），沒有宣稱疑義清零。首訪容量最大788,254／242,634 raw／encoded bytes通過，手機LCP 8,164ms及Safari首屏2,632ms限制保留。臨時Preview設定與Production env export已清理。

## 當前狀態

- 使用者已核可依競品清單開始改善、建立目標與維護跨 session 進度。
- 最新範圍：G09 二十六篇球場指南與名稱／行政區查找、全台待審底稿，以及已上線的 G10 逐局分享預覽；C01首批與C02查核完成處置，北投及本批四座公園指南已於 qiuka.tw 上線，部分疑義保留。G01、G05–G08、G11–G12 暫緩。
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
| G09 | C01首批／C02／C03有逐場處置，其餘接續 | 二十四篇完成；全台底稿待審 | 必要CI／Safari及正式頁面通過 | 二十四篇已部署，底稿未公開 | 未取得 |
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

C02發布收尾：兩個分支限定Preview公開變數與本機Production環境匯出檔已清理；正式部署設定不變。下一批接續C03證據文件，長期目標仍進行中。
