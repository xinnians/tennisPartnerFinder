---
paths:
  - "supabase/**"
  - "src/dataApi.js"
  - "src/supabaseClient.js"
---

# Supabase：公開球局、隱私與資料庫契約

先讀 `supabase/migrations/202607170003_public_taipei_tennis_sessions.sql` 與
`supabase/tests/session_rls.sql`。已完成的 session-first schema 取代舊
quick-contact／`partner_requests` 路徑；legacy records 在 `private` schema，browser
role 不可讀寫。

## 只能使用的 browser 邊界

- 匿名公開探索：`public.session_discovery`；它是唯一匿名公開面。
- 登入且完整 profile 的球友目錄：`public.player_directory`（authenticated-only，不是公開面）。
- 登入者自己的清單：`public.my_session_participations`。
- roster：`public.session_participant_roster`。
- accepted-only LINE：`public.session_contacts`。
- 個人檔案表單：`public.my_profile` 與 `save_my_profile(...)`。
- 通知設定：本人 `notification_prefs`、`district_subscriptions` 的 explicit-column reads，及
  `save_push_subscription`、`remove_push_subscription`、`set_notification_prefs`、
  `set_district_subscriptions` RPC。
- lifecycle 寫入：`create_session`、`request_to_join_session`、
  `review_join_request`、`withdraw_from_session`、`cancel_session`、
  `mark_session_played`、`confirm_session_attendance`、`create_report`、
  `set_player_visibility`、`invite_to_session`、`respond_to_session_invite`。

不可讓前端直接 select／insert／update／delete raw `profiles`、`sessions`、
`session_participants`、`reports` 或 private legacy tables；`src/dataApi.js` 是唯一
前端資料邊界。

## Web Push 與通知 outbox

- `push_subscriptions`、`notification_prefs`、`district_subscriptions` 都是 owner-only；通知
  設定只要求登入，不得藉此取消既有球局／球友目錄的完整 profile gate。行政區只接受台北市
  12 區，browser 只以既有 RPC 儲存。
- `notification_outbox` 是 service-only queue：anon 與 authenticated 不可 select、insert、
  update、delete，也不可新增 browser view 或 RPC 旁路。它的欄位順序與 payload allowlist 受
  pgTAP 守護。
- 事件 `host_new_request`、`guest_request_reviewed`、`guest_invited`、`district_new_session`
  只能由既有 lifecycle RPC best-effort enqueue。payload 精確只用 `court`、`start_at`、
  `slots_remaining`、`message`、`url`；LINE／`line_id`、任何他人個資與 subscription key
  都不可進 payload 或 log。
- `notification-outbox-dispatch` Edge Function 以 service role 讀 outbox、每筆最多嘗試三次；
  410/404 必須刪除失效 endpoint。每分鐘 scheduler 只可經 pg_cron + pg_net，並在 Vault lookup
  project URL、publishable key、cron secret；不要把任何 secret 放進 migration 或 browser。

## 公開資料 allowlist

`session_discovery` 是 explicit security-definer view。它可回傳球局與球場必要欄位：

```text
id, session_id, sport_code, court_id, court, court_district, court_lat, court_lng,
start_at, play_type, ntrp_min, ntrp_max, slots_total, slots_remaining, notes,
host_nickname, host_ntrp, host_profile_complete, status, join_mode
```

`id` 與 `session_id` 同值，是 view 既有的冗餘欄位；`session_rls.sql` 以完整有序字串
比對這 20 欄，改動任何一欄都會讓測試失敗。`join_mode` 只可為 `approval` 或 `instant`：
前者由主揪審核加入申請，後者在有缺額時直接接受加入；它不會擴大任何 profile 或聯絡資料的
公開範圍。

其中主揪 profile 相關欄位**精確地只有** `host_nickname`、`host_ntrp`、
`host_profile_complete`。永遠不可增加 host/profile/participant ID、profile URL、真名、
LINE、電話、email、常打球場、可用時段、歷史或 roster。`session_discovery` 包含未來與開始後
兩小時內、open/full、active tennis、台北市 court 的球局；是否進行中一律由 `start_at` 推導，
不可新增欄位。

`player_directory` 是獨立的 authenticated-only security-definer view，DB 亦以
`private.has_complete_profile(auth.uid())` gate：不完整 viewer 即使已登入也只能得到 0 列。
其欄位有序 allowlist **精確為**：

```text
profile_id,nickname,ntrp,play_types,slot_codes,court_id,court_name,court_district,court_lat,court_lng,is_self
```

它只列出已 opt-in（`profiles.is_public=true`）、卡片本人完整 profile、台北市 active 常打球場的
球友；`is_public` 預設 false，只有完整 profile 本人可透過 `set_player_visibility(boolean)`
變更，關閉後立即從目錄下架。它明確不包含 LINE／`line_id`、真名、email 或歷史球局。

## Roster 與 LINE

- `session_participant_roster`：host 可看同局 roster；guest 只可看自己與 host。這是
  申請審核所需的 nickname、NTRP、play types、home courts、role/status；沒有 LINE。
- `session_contacts`：僅 viewer 和 counterpart 都是 `accepted`，且配對必須是 host ↔ guest。
  Host 對每位已接受 guest 有一列；guest 只會有 host 一列，絕不會取得其他 guest 的資料。
- LINE 是資料庫強制的秘密，不是前端顯示層的 gate。任何擴充都必須先補 pgTAP 與 API
  allowlist test，再改 UI。

## 城市、完整檔案與生命週期

- 首發只允許 `courts.city = '台北市'` 且 `sports.code = 'tennis'` 的公開 session。
  雙北目錄的存在不代表新北可建局或被 discovery。
- `private.require_complete_profile()` 要求 nickname、LINE、有效 NTRP、至少一種打法與一座
  台北市 active court；create/join 由 RPC 強制，前端檢查不是授權。
- `sessions.status`：`open`、`full`、`cancelled`、`played`、`expired`；guest participant
  status：`requested`、`invited`、`accepted`、`declined`、`withdrawn`。`initiated_by='guest'`
  表示 guest request，`initiated_by='host'` 表示 host invite；host participant 的 status 固定為
  `accepted`。
- 接受最後一個缺額以 row lock 計算容量，並把其餘 pending `requested`／`invited` guests
  decline；不要在客戶端先判斷可用缺額後直接寫入。
- `create_session` 的 `join_mode` 只可為 `approval` 或 `instant`；開始時間可早至現在前 5 分鐘。
  同一主揪至多可有五個未來、`open`／`full` 的球局，超過時 RPC 回傳 `SESSION_LIMIT`；已開打的
  局不計入此未來球局上限。
- `request_to_join_session` 對 `approval` 局建立 `requested` participant 並回傳 `OK`；對
  `instant` 局在有缺額時直接轉為 `accepted` 並回傳 `ACCEPTED`。LINE 的可見性模型不變：
  仍只限雙方皆為 `accepted` 的 host ↔ guest 配對。申請、直接加入、主揪邀請與受邀回覆只可在
  開始後兩小時內進行；既有取消、退出與出席回報窗口不因此延長。
- `invite_to_session(session_id, profile_id)` 僅 host 可呼叫，對可發現、完整且 opt-in 的
  其他球友建立 `invited`／`initiated_by='host'`；受邀者可在開始後兩小時內回覆。同一 host 在其
  名下所有球局的 host-initiated
  invite 採滾動 24 小時計數，上限 10。migration 以該 host 的 profile-row lock 序列化此計數
  與新增。`respond_to_session_invite(session_id, accepted|declined)` 僅處理 viewer 自己的
  `invited` 列；接受沿用原子容量與補滿 cleanup，婉拒改為 `declined`。回傳成功皆為 `OK`；
  `my_session_participations.can_respond_invite` 只在 invited、open/full、未開打時為 true。
- 新錯誤碼：`INVITEE_NOT_AVAILABLE`、`ALREADY_INVITED`、`NOT_INVITED`、`INVITE_LIMIT`。
  既有 `ALREADY_REQUESTED`、`ALREADY_DECIDED`、`SESSION_FULL` 等契約仍適用。
- `withdraw_from_session` 對 accepted guest 在 pre-start full session 會重新開放；host 可在
  pre-start cancel，post-start 24 小時內 mark played，accepted users 可確認出席。

## 到期與 migration

`private.expire_stale_sessions()` 會把開始後超過 24 小時的 open/full sessions 設為
`expired`。migration 建立 `expire-stale-tennis-sessions` pg_cron job，每 15 分鐘直接執行
私有 function；每個 lifecycle RPC 同時呼叫 `lock_and_expire_session`，不能依賴 cron 時機。

Schema 變更一律 local-first：

```bash
npx supabase start
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test
npm run test:db
npm run test:local
```

已套用的 migration 不可修改。球場目錄只改 `data/courts.json`，用新 stamp 產生 migration
與 `courts_catalog.sql`；`node scripts/generate-courts-seed.mjs --check` 必須通過。

Hosted 推送屬人工、授權後操作：先備份並記錄 sessions/participants counts，再跑 local gate，
以 `npx supabase migration list` 確認每個 local stamp 與 remote 對齊，才可執行 migration。
之後重新驗證匿名 allowlist、raw table denial、accepted pair contact 與 cron job；不要把未跑的
hosted 檢查寫成已完成。
