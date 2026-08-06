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
- 通過 directory 門檻的登入者球友目錄：`public.player_directory`（authenticated-only，不是公開面）。
- 互惠在場目錄：`public.player_presence_directory`（authenticated-only）；匿名 SELECT 一律
  被拒，未通過 ntrp 門檻、或本人未開 `share_presence` 的登入 viewer 一律為 0 列。
- 登入者自己的清單：`public.my_session_participations`。
- roster：`public.session_participant_roster`。
- 退役聯絡面：`public.session_contacts` 與 `profiles.line_id` 因凍結 migration 暫留為技術債，
  但已不是 browser data API，`src/` 不得查詢、映射或渲染。
- 群聊與封鎖讀取：`public.session_message_feed`、`public.my_player_blocks`；寫入只能使用
  `post_session_message`、`set_player_block`、`create_report(..., p_message_id)` RPC。
- 登入者加入前名單：`public.session_join_preview`（authenticated-only，僅需登入；回傳該局
  host 與 accepted guests 的 `session_id,role,nickname,ntrp,avatar_url` 五欄，窗口同
  discovery，不過濾封鎖，不含 profile_id）。
- 個人檔案表單：`public.my_profile` 與 `save_my_profile(...)`。
- 在場設定／更新：`set_presence_sharing`、`set_open_to_greeting`、`update_my_presence` RPC。
- 通知設定：本人 `notification_prefs`（六個 enabled 欄）、`court_subscriptions` 的
  explicit-column reads，及 `save_push_subscription`、`remove_push_subscription`、
  `set_notification_prefs`（六參數）、`set_court_subscriptions`（台北市 active 球場、
  上限為當下符合條件的球場總數）RPC。行政區訂閱已於 202607270007 退役（表與 RPC 皆已 drop）。
- lifecycle 寫入：`create_session`、`request_to_join_session`、`review_join_request`、
  `invite_to_session`、`respond_to_session_invite`、`update_session`、
  `decide_session_court`、`withdraw_from_session`、`cancel_session`、
  `mark_session_played`、`confirm_session_attendance`、`create_report`、
  `post_session_message`、`set_player_block`、`set_player_visibility`。設定／個人狀態只走前述
  `save_my_profile`、presence、push、notification 與 court-subscription RPC。

不可讓前端直接 select／insert／update／delete raw `profiles`、`sessions`、
`session_participants`、`reports` 或 private legacy tables；`src/dataApi.js` 是唯一
前端資料邊界。

`session_messages`、`player_blocks` 對 browser role revoke all；聊天讀取只能走
`session_message_feed`，且 viewer 必須是 host 或 accepted guest。封存局成員仍可讀歷史，
`post_session_message` 只允許 open/full。雙向封鎖只過濾 user 訊息，system 訊息仍可見；
訊息本文不可進 outbox、push 或 log。

## Web Push 與通知 outbox

- `push_subscriptions`、`notification_prefs`、`court_subscriptions` 都是 owner-only；通知
  設定只要求登入，不得藉此取消既有球局／球友目錄的分級 profile gate。球場訂閱只接受台北市
  active 球場（上限為當下符合條件的球場總數），browser 只以既有 RPC 儲存。
- `notification_outbox` 是 service-only queue：anon 與 authenticated 不可 select、insert、
  update、delete，也不可新增 browser view 或 RPC 旁路。它的欄位順序與 payload allowlist 受
  pgTAP 守護。
- 事件共十種：`host_new_request`、`guest_request_reviewed`、`guest_invited`、
  `court_new_session`、`session_updated`、`session_decided`、`session_cancelled`、
  `chat_message`、`session_reminder`、`decide_reminder`，由既有 lifecycle RPC 與
  `enqueue-session-reminders` pg_cron（每 5 分鐘，reminder 類以 partial unique index 冪等）
  best-effort enqueue；定案、取消、球場廣播與催定案恆送。payload
  精確只用 `court`、`start_at`、
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
host_nickname, host_ntrp, host_profile_complete, status, join_mode, venue_type,
range_end, candidate_court_ids, fee_note, decided_at
```

`id` 與 `session_id` 同值，是 view 既有的冗餘欄位；`session_rls.sql` 以完整有序字串
比對這 25 欄，改動任何一欄都會讓測試失敗。`join_mode` 只可為 `approval` 或 `instant`：
前者由主揪審核加入申請，後者在有缺額時直接接受加入；它不會擴大任何 profile 或聯絡資料的
公開範圍。

其中主揪 profile 相關欄位**精確地只有** `host_nickname`、`host_ntrp`、
`host_profile_complete`。永遠不可增加 host/profile/participant ID、profile URL、真名、
LINE、電話、email、常打球場、可用時段、歷史或 roster。`session_discovery` 包含未來與開始後
兩小時內、open/full、active tennis、台北市 court 的球局；是否進行中一律由 `start_at` 推導，
不可新增欄位。

`player_directory` 是獨立的 authenticated-only security-definer view，DB 亦以
`private.profile_meets_gate(..., 'directory')` gate：未通過 directory 門檻的 viewer
即使已登入也只能得到 0 列。
其欄位有序 allowlist **精確為**：

```text
profile_id,nickname,ntrp,play_types,slot_codes,court_id,court_name,court_district,court_lat,court_lng,is_self
```

它只列出已 opt-in（`profiles.is_public=true`）、卡片本人通過 directory 門檻、台北市 active 常打球場的
球友；`is_public` 預設 false，只有通過 directory 門檻的本人可透過 `set_player_visibility(boolean)`
變更，關閉後立即從目錄下架。它明確不包含 LINE／`line_id`、真名、email 或歷史球局。

`player_presence` 是 browser 不可直讀、直寫的 raw 狀態表；它**只**允許 definer RPC 寫入
`profile_id`、最近 active 台北球場的 `court_id` 與 `updated_at`。`update_my_presence` 收到的
GPS 座標不可被任何表、view、payload 或 log 保存，距離任一球場超過 100 公尺時不寫入。關閉
`set_presence_sharing(false)` 必須同步刪除本人列。`share_presence` 與
`open_to_greeting` 預設皆為 false，且 `save_my_profile` 不得覆寫這兩個獨立同意欄位。

`player_presence_directory` 是只 grant 給 `authenticated` 的 reciprocal definer view；匿名
SELECT 必須被拒。完整 viewer 只有在自身 `share_presence=true` 時才可取得 3 小時內的分享者
（含本人）資料。它的有序 allowlist **精確為**：

```text
profile_id,nickname,ntrp,open_to_greeting,court_id,court_name,court_district,court_lat,court_lng,minutes_ago,is_self
```

其中 `court_lat`／`court_lng` 是既有球場目錄座標，不是裝置 GPS；永遠不可加入 LINE、email、
真名、raw GPS 或 presence 歷史。pgTAP 必須以完整有序字串守護這個 allowlist。

## Roster 與退役聯絡面

- `session_participant_roster`：host 可看同局 roster；guest 只可看自己與 host。這是
  申請審核所需的 nickname、NTRP、play types、home courts、role/status；沒有 LINE。
- LINE 前端面已退役，新註冊流程不再蒐集；群組成員一律使用球局群聊協調。
- `session_contacts` 與 `profiles.line_id` 尚留在資料庫，只是待後續 drop migration 清理的技術債。
  不得重新加入 browser API 或 UI；清理前既有 RLS／definer 限制仍不可弱化。

## 城市、個人檔案門檻與生命週期

- 首發只允許 `courts.city = '台北市'` 且 `sports.code = 'tennis'` 的公開 session。
  雙北目錄的存在不代表新北可建局或被 discovery。
- 現行授權使用 `private.require_profile_gate(level)`：`nickname`＝非空暱稱；
  `ntrp`＝暱稱 + 1.0–7.0 NTRP；`directory`＝ntrp 門檻 + 至少一座台北市 active 常打球場。
  `request_to_join_session` 使用 nickname；`create_session`、在場設定／更新與邀請主揪使用
  ntrp；球友目錄、公開球友卡與被邀者資格使用 directory。LINE、打法與可打時段皆非這三層
  門檻的必要欄位；前端檢查不是授權。
- `sessions.status`：`open`、`full`、`cancelled`、`played`、`expired`；guest participant
  status：`requested`、`invited`、`accepted`、`declined`、`withdrawn`。`initiated_by='guest'`
  表示 guest request，`initiated_by='host'` 表示 host invite；host participant 的 status 固定為
  `accepted`。
- 接受最後一個缺額以 row lock 計算容量，並把其餘 pending `requested`／`invited` guests
  decline；不要在客戶端先判斷可用缺額後直接寫入。
- `create_session` 的 `venue_type` 只可為 `booked`、`walk_on`、`candidates`：前兩型使用單一
  台北市 active 球場；候選型保存 2–3 座有序候選球場與 `range_end > start_at`，只能由
  `decide_session_court` 選候選球場並把時間定在原範圍內。`join_mode` 只可為 `approval` 或
  `instant`；開始時間可早至現在前 5 分鐘。
  同一主揪至多可有五個仍在可加入窗口內的 `open`／`full` 球局（未來或開打後兩小時內），超過時
  RPC 回傳 `SESSION_LIMIT`；開打超過兩小時，或已是 `cancelled`、`played`、`expired` 的局不計入。
- `request_to_join_session` 使用 nickname gate；`approval` 局建立 `requested` 並回 `OK`。
  `instant` 局只有 viewer NTRP 已填且在局方範圍內時直接 `accepted`／回 `ACCEPTED`；未填或
  範圍外仍建立 `requested`，分別回 `OK_NTRP_MISSING`／`OK_NTRP_OUT_OF_RANGE`。未定案候選局
  的加入窗口只到範圍起點；其他局維持開始後兩小時。既有取消、退出與出席回報窗口不因此延長。
- `invite_to_session(session_id, profile_id)` 僅通過 ntrp gate 的 host 可呼叫，對通過 directory、可發現且 opt-in 的
  其他球友建立 `invited`／`initiated_by='host'`；受邀者可在開始後兩小時內回覆。同一 host 在其
  名下所有球局的 host-initiated
  invite 採滾動 24 小時計數，上限 10。migration 以該 host 的 profile-row lock 序列化此計數
  與新增。`respond_to_session_invite(session_id, accepted|declined)` 僅處理 viewer 自己的
  `invited` 列；接受沿用原子容量與補滿 cleanup，婉拒改為 `declined`。回傳成功皆為 `OK`；
  `my_session_participations.can_respond_invite` 只在 invited、open/full、未開打時為 true。
- 新錯誤碼：`INVITEE_NOT_AVAILABLE`、`ALREADY_INVITED`、`NOT_INVITED`、`INVITE_LIMIT`、
  `SESSION_ARCHIVED`、`NOT_SESSION_MEMBER`、`INVALID_MESSAGE`、`BLOCKED`、
  `MESSAGE_NOT_VISIBLE`、`SESSION_UNAVAILABLE`、`GUEST_UNAVAILABLE`。`SESSION_UNAVAILABLE` 與
  `GUEST_UNAVAILABLE` 是終局狀態：UI 不可誘導重試，也不可揭露封鎖關係；既有
  `ALREADY_REQUESTED`、`ALREADY_DECIDED`、`SESSION_FULL` 等契約仍適用。
- 封鎖方向的中性錯誤碼對應：呼叫者已封鎖對方時回 `BLOCKED`；呼叫者被對方封鎖時，
  `request_to_join_session`／`respond_to_session_invite` 回 `SESSION_UNAVAILABLE`，
  `invite_to_session` 回 `INVITEE_NOT_AVAILABLE`，`review_join_request` 回
  `GUEST_UNAVAILABLE`；雙向封鎖時回呼叫者側的 `BLOCKED`。`declined` 與 `withdrawn`
  決定不受封鎖阻擋。
- `withdraw_from_session` 對 accepted guest 在 pre-start full session 會重新開放；host 可在
  pre-start cancel，post-start 24 小時內 mark played，accepted users 可確認出席。

## 到期與 migration

`private.expire_stale_sessions()` 會把開始後超過 24 小時的 open/full sessions，以及已到
範圍起點仍未定案的候選局設為 `expired`。migration 建立 `expire-stale-tennis-sessions`
pg_cron job，每 15 分鐘直接執行私有 function；每個 lifecycle RPC 同時呼叫
`lock_and_expire_session`，不能依賴 cron 時機。

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
之後重新驗證匿名 allowlist、raw table denial 與 cron job；不要把未跑的
hosted 檢查寫成已完成。
