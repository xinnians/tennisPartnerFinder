# 通知修正正式部署紀錄

2026-09-11，使用者明確要求補完Hosted DB migration與Edge部署。部署來源為已推送main的`1680b98`（通知／聊天）與`68b3c2a`（分享卡），未改正式環境變數、通知偏好或排程。

## 備份與部署

- 正式Supabase專案：`ttjzxhihctrtoqdsqxdb`。初查41/43 migration，缺202609110001與202609110002；legacy dispatcher原為ACTIVE v45。
- 備份目錄：`/Users/ian/tennisPartnerFinder-backups/20260911-notification-release/`，包含schema.sql（309KiB）、data.sql（719KiB）、舊版Edge原始碼、部署前後計數／權限／排程證據與新版下載原始碼。SQL備份0600，未提交。首次dump暫時登入驗證失敗，序列重試後schema/data均成功。
- 前後counts相同：profiles3、sessions5、participants5、messages3、reports0、outbox27、push_subscriptions4；可重試legacy自我通知前後均0。本次未建立球局、訊息或通知測試資料。
- dry-run確認只包含兩支指定migration，`supabase db push --yes`實際套用202609110001（排除主揪／耗盡舊自我通知）及202609110002（service-only eligibility RPC）。事後43/43 local↔remote完全對齊。
- `supabase functions deploy notification-outbox-dispatch`成功，ACTIVE v46、verify_jwt=false，沿用應用層cron secret守門。下載新版index.ts與dispatch.js逐byte比對與repo相同。部署器對local-only依賴的外部JSON路徑提出warning；正式排程HTTP200驗證通過，不把warning當作未部署。

## 驗證

- 本機pgTAP 1,313 pass、通知dispatch unit6 pass。未清库；前述local探索資料量與訂閱UI限制沒有被本輪修復或重新宣告通過。
- 正式SQL：主揪排除條件已安裝；新RPC anon/authenticated不可執行、service_role可執行，空ID清單回0列。
- 正式REST：匿名discovery選定公開欄位200，raw sessions／participants／outbox及join preview均401；新RPC匿名401、service role空ID清單200且空結果。
- Edge無驗證GET405／POST401，未手動帶cron secret觸發派送。既有五個cron維持active；cron紀錄succeeded，pg_net實際legacy派送回應在07:53 UTC為HTTP200、timed_out=false、claimed0／sent0。這證明部署後空批次可執行，不等同真實裝置已收到通知。
- GitHub Quality Gate 34575793326 completed/success；Vercel對68b3c2a狀態success。未另以CLI部署前端。

## 完成與限制

Hosted DB及Edge更新已完成，無待執行的本批部署步驟。未代發訊息、未主動派送測試通知；主揪不收到而其他訂閱者正常收到的邏輯已有本機測試，仍需下一次真實使用時觀察裝置端收訊。未重做正式兩帳號OAuth／群聊或完整手機慢網路旅程，不把歷史checklist當本輪新結果。没有真實成局／留存成效。

部署紀錄與進度為本機接續文件，尚未另行commit／push。
