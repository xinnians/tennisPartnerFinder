# 未確認資訊公開：33篇指南與狀態標示

2026-09-10使用者核可：未知欄位明示待確認後可發布；資格、位置或設施現況有疑義時，提供資料頁與醒目提醒，暫不提供該指南開局入口。此決策取代原補完計畫「資格或存在未確認即不發布」限制，不代表宣告33處皆可自由使用。

## 本批介面與範圍

- 新增既有台北33處資料頁，與28篇合計61篇。內容來自已保存的官方／營運查核紀錄，沿用原查核日期，不因寫文案刷新來源日期。歷史時段與費率不改寫成現行承諾。
- `accessStatus: unconfirmed`的23篇在列表與頁首先標明開放狀態待確認；保留官方來源、已知設施與具體疑義。移除指南開局／訂閱入口與近期球局區塊，避免用球局存在暗示已確認開放。
- 另外38篇（原28篇與新增10篇）保留既有指南動作；有pending資料者顯示資訊待確認提醒。費用、照明或詳細登記未知不直接阻擋閱讀與開局。
- `locationStatus: unconfirmed`不提供導航，避免原目錄座標誤導入口。其餘導航沿用既有目錄，仍提醒查官方入口。
- `bookingStatus: pending`在使用方法段顯示待確認；facts沿用verified／pending。已確認只是指來源記載，不是實地巡查或營運保證。
- generated catalogue保留61篇的名稱／slug，另產生受限制slug。`consumeGuideEntry`、pending intent解析與controller執行入口均檢查可開局狀態；網址與舊登入intent不能繞過指南限制。
- 這是指南入口限制，不改資料庫court active狀態、不停用其他既有球局、不擴大新北／全台約球範圍。未對外聯絡或提交表單。
- 公開來源排除tennislocal.app與jojotennis.com（渲染驗證亦拒絕）；直接引用原始官方／營運資料。

## 驗證結果與發布

使用 frontend-testing-debugging skill；Browser plugin not available，採既有 Playwright。操作路徑包含列表搜尋→正常／狀態待確認指南→來源與待確認標示→允許的開局與取消／拒絕受限制網址→返回列表。桌面1280與390px、no-JS、頁面身份／非空白／無overlay／無橫向溢出、pageerror及sitemap／未知404均檢查。

- 實作：新增33篇，合計61篇；23篇access unconfirmed、8篇location unconfirmed，38篇保留指南動作。60篇77個facts pending，另新增33篇booking pending。不是61篇完整驗證或皆可自由入場。
- 必要CI：[34432326956](https://github.com/xinnians/tennisPartnerFinder/actions/runs/34432326956)，runtime head `b6e425c7703bee548f49c28c97fdf05f77d1f987`，Frontend／Supabase兩組成功。781 unit總數（776 pass／5 skip）、384 Chromium、1305 SQL、4 API、46 browser、6 mobile、22 preview及四組Edge檢查通過。
- Git發布：[PR #12](https://github.com/xinnians/tennisPartnerFinder/pull/12)，merge `a02eb09d40a41e61a6f5753b48d6545919f4ac5c`。Production `dpl_ED1jNwxWFjCCrhqkQ14Cd3BZkyWf` READY，immutable URL `https://tennis-partner-finder-oq9ad9k11-xinnians-projects-c513dbd3.vercel.app`；已對qiuka.tw正式驗收。
- 正式：61頁HTTP200／內容／來源／提醒／受限CTA／位置導航規則、sitemap63、unknown與全台底稿404通過；1280與390四頁、新生搜尋→資料頁→返回、no-JS61篇及受限入口缺席通過。南港／明德×桌面／手機共4組匿名開局與取消通過，pageerror0，沒有送出球局或訂閱寫入。已目視新生手機與南港桌面截圖。
- Git預覽：61篇、桌面／手機、no-JS、4組匿名開局取消通過；本機preview Chromium22／WebKit10通過。首輪Chromium20 pass／2 fail是「臺北」舊預期3筆未納入北藝／北教，改成明確5個名稱後整組重跑通過。

## 容量及成效界線

release嚴格容量通過：initial663849 raw／194280 gzip，全部JS945407／283708，既有上限700000／205000及1000000／300000不變。

正式站真實網路、桌面及手機各3次，首訪最大790807 raw／243422 encoded bytes，低於820000／260000。桌面LCP中位648ms，手機3400ms；手機地圖容器中位6807ms。pageerror0、CLS0。此輪公開球局為空，不能與前批有球局時的LCP直接比較或宣稱效能改善；手機慢網路限制與真實留存／使用意願成效皆未宣告達標。

## 保留的失敗與驗證限制

- Safari mock本機兩輪182 pass／9 fail／3 skip，涉及焦點與shell timing。獨立worktree以部署前基準`c25fbc1`重跑同套，亦182 pass／完全相同9 fail／3 skip，未觀察本批新增mock失敗，既有問題仍未修復。CI Safari mock190 pass／1 fail／3 skip，shell3490ms超2500ms；非必要阻擋job，未放寬門檻。
- CI Safari preview9 pass／1 fail：61篇長列表在高DPR全頁截圖超WebKit32767像素上限。收尾將列表截圖改`scale: css`，保留完整列表與斷言；本機生成390×18588圖，對應靜態內容／錯誤重試測試通過。收尾整套8 pass／2 fail，因恢復本機215筆既有fixture後再遇discovery200筆overflow，分享dialog與shell未達正常狀態；不是截圖仍失敗。此前隔離fixture時同runtime WebKit10項通過；本次僅修測試證據擷取，不改正式runtime。
- 原始test:local因累積215筆example.test未來球局超過200筆完整性保護，39 pass／1 fail／12 skip／6未跑。保存215筆id／status後僅本機暫改cancelled，完整重跑4 API／46 browser／12 skip通過，mobile6通過；沒有DB reset。原215筆status已全部恢復（一般轉換trigger拒絕cancelled→open，初次還原transaction rollback；測試結束後本機transaction暫用replica還原215筆並commit，未用於測試或正式DB）。後續需先處理本機測試資料容量；不藉移除overflow保障讓測試過關。
- 正式分享沿用舊`/s/21`首跑預期200實為404；即時公開discovery為空，沒有可用200樣本。已驗證GET／HEAD／API404、未知404及POST405、no-store；200路徑本輪未重驗，沒有為此建立正式測試球局。必要CI的有效分享與路由契約通過。

## Hosted檢查、清理與接續

零DB migration／Edge／cron變更。已完成schema／data備份316738／519555 bytes，保存於`/Users/ian/tennisPartnerFinder-backups/20260910-guide-pending/`（私有備份，不在repo）；41 local／remote migrations對齊。備份counts：3 profiles／3 sessions／3 participants／3 messages／0 reports／15 outbox。匿名discovery200、禁止欄400、10私有端點401。未重跑hosted OAuth／兩帳號寫入／cron，本輪不列完成，沿用既有契約。

分支限定Preview兩個公開變數已移除，Production設定未改；env匯出檔已刪除，本機dev server已停止。未建立排程／聯絡場館，沒有新北／全台公開或DB場地停用。

QA logs、正式桌面／手機截圖與效能JSON保存於`/Users/ian/tennisPartnerFinder-qa/court-guide-pending-2026-09-10/`。維護人ian／Codex，下次完整覆核2026-12-08；實際資訊異動優先處理。下一步先補新生位置及開放、南港新舊規則適用、天母官方註冊／費時；其餘按清冊逐場補證。舊資料頁不因發布刷新查核日期，查明後再解除相應限制。
