# 通知基礎:Web Push、行政區訂閱與球局深連結設計(Spec C)

日期:2026-07-23。狀態:user 已核可方向(管道 Web Push、廣播採行政區訂閱制、四種事件)。
本 spec 即 `2026-07-21-instant-join-mode-design.md` 非目標節預告的「Spec C」;是
`2026-07-17-taipei-tennis-public-mvp-design.md` 的增量變更,未提及之處沿用現行邊界。
實作順序:本件先行,`2026-07-23-now-start-sessions-design.md`(D)與
`2026-07-23-player-presence-design.md`(E)依賴或銜接本件。

## 問題

全站零通知,一切靠使用者自己回來看:主揪不知道有人申請、申請者不知道結果、
受邀者不知道被邀、新球局沒人知道。2026-07-17 spec 把通知列為第一版非目標並附重啟
條件(mvp-design.md:228);user 於 2026-07-23 正式改變該決策。另外全 src 無路由,
通知點開無法直達球局——深連結是通知的硬依賴,也是 2026-07-21 審視的 P0 之一。

## 決策

- 管道:**Web Push**(VAPID)。iOS 已知限制:須先「加入主畫面」(PWA)才能收;
  實作時以 Apple/MDN 官方文件驗證當前支援範圍與 manifest 需求,不憑記憶。
- 事件四種:
  1. `host_new_request`:有人申請我的球局 → 通知主揪。
  2. `guest_request_reviewed`:申請被接受/婉拒 → 通知申請者。
  3. `guest_invited`:被主揪邀請 → 通知受邀者。
  4. `district_new_session`:訂閱行政區內有新球局 → 通知訂閱者(含即時開打局)。
- 廣播採**訂閱制**:使用者自選台北市行政區(可多選);未訂閱者不收廣播。
  事件類(1-3)預設開啟、可各自關閉;廣播類(4)無訂閱即無通知。
- 深連結:hash 路由 `#/session/:id`。開啟後進入地圖並開啟該球局詳情 sheet;
  登入與 profile gate 行為照舊;球局不存在/已下架顯示明確 empty 狀態。
  球局詳情同時加「複製分享連結」。
- 推播 payload **不含 LINE、不含任何他人個資**;只含球局摘要(球場名、時間、
  缺額/事件說明)與深連結。

## 資料契約變更

- `push_subscriptions`:profile_id、endpoint(unique)、p256dh、auth、created_at。
  RLS:僅本人 insert/delete;不可讀他人。
- `notification_prefs`:profile_id 為主鍵,事件類三個 boolean(預設 true)。
- `district_subscriptions`:profile_id × district(台北市 12 區 check)。RLS 僅本人。
- `notification_outbox`:id、event_type、recipient_profile_id、session_id、payload、
  created_at、sent_at、attempts。**browser 角色完全不可讀寫**(service 專用);
  pgTAP 需驗 anon/authenticated 直讀直寫被拒。
- RPC:`save_push_subscription`、`remove_push_subscription`、
  `set_district_subscriptions`、`set_notification_prefs`(皆本人、需完整 profile 不強制——
  推播訂閱不涉他人資料,登入即可)。
- 事件寫入:`request_to_join_session`、`review_join_request`、`invite_to_session`
  內追加 outbox insert(尊重 prefs);`create_session` 對訂閱該局行政區者 fan-out
  insert(尊重訂閱)。全部同 transaction,失敗不阻斷主流程(outbox insert 例外時
  raise warning 不 raise exception,通知是 best-effort)。
- 派送:scheduled Edge Function(每分鐘)讀未送 outbox → web-push 發送 → 標
  sent_at/attempts;endpoint 410/404 即刪除該訂閱;attempts 上限 3 後放棄。

## UI

- 通知設定區(My Sessions 頁頂部,與球友卡開關同區):開啟推播(觸發瀏覽器
  權限請求)、行政區勾選、事件開關;iOS 顯示「加入主畫面」引導文案。
- 球局詳情:「複製連結」按鈕與複製成功 toast。
- 收到權限拒絕時的明確說明文案(如何到瀏覽器設定重新開啟)。

## 測試

- pgTAP:outbox 對 anon/authenticated 全拒;三事件 RPC 寫入 outbox 正確
  recipient;prefs 關閉即不寫;district fan-out 只命中訂閱者;非法 district 被拒。
  依 gate 紀律先紅後綠,掃描式斷言需驗集合非空。
- unit:`#/session/:id` 路由 parse 與非法 id;dataApi 新 RPC mapper。
- e2e(local):貼深連結直達球局 sheet;未登入走 gate 後回到該球局。
- Edge Function:本機 `supabase functions serve` 實測一次真實派送(或以 mock
  push service 驗 payload 結構),不可只寫不跑。

## 非目標

- email/LINE 官方帳號管道(候選後續,本版不做)。
- 站內通知中心/inbox、已讀狀態。
- 邀請回覆通知主揪(擴充點,加事件即可,本版不做)。

## 文件同步

CLAUDE.md(通知與深連結入產品範圍、payload 無 LINE 底線)、
`.claude/rules/supabase.md`(新表/RPC/outbox 邊界)。
