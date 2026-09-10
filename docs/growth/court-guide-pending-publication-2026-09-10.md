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

## 驗證流程

Browser plugin not available，採既有Playwright。測試路徑：列表搜尋→正常／狀態待確認指南→來源與待確認標示→允許的開局與取消／拒絕受限制網址→返回列表；桌面與390px、no-JS、console、sitemap與未知404都需驗證。

單元已驗證61篇靜態內容、來源與禁止網域、受限制CTA缺席、位置待確認無導航、URL／pending intent拒絕。完整frontend與local Supabase正在執行；尚未完成Git預覽／CI／部署，正式仍28篇。最終結果寫入progress及本文件。


## 本機驗證更新

- frontend聚合完成：776 unit、384 Chromium、typecheck／lint／格式／目錄／build與bundle結構通過。release嚴格容量亦通過：initial 663849 raw／194280 gzip，全部JS945407／283708，未提高上限。
- 原始local測試因累積215筆example.test未來球局觸發200筆完整性保護，39 pass／1 fail／12 skip／6未跑；已保存215筆id／status並僅在本機暫時改cancelled，沒有重置DB。完整重跑4 API／46 browser／12 skip通過；mobile6通過。所有DB測試完成後須恢復原215筆狀態。
- 本機1280及390四頁內容／無橫向溢出／頁面身份／無overlay／pageerror0、列表搜尋與返回、no-JS61篇及受限制入口缺席通過。截圖在/tmp/qiuka-guide-pending-20260910，已目視手機新生提醒與導覽。
- WebKit mock首輪182 pass／9 fail／3 skip，失敗為焦點與shell timing，完整log保存；不宣稱Safari全通過。preview Chromium／WebKit仍進行中。
- Hosted schema／data備份已取得（316738／519555 bytes）；41 migrations對齊。counts：3 profiles／3 sessions／3 participants／3 messages／0 reports／15 outbox。匿名discovery200、禁止欄400、10私有端點401。零DB變更，未重跑hosted OAuth／兩帳號寫入／cron，本輪不列完成；沿用既有已驗證契約。
- 分支先推送既有研究commit後，已新增兩個分支限定Preview公開變數；先前branch不存在的設定嘗試失敗，確認遠端分支存在後成功，未改Production設定。
