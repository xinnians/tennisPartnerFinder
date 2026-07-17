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

- 匿名或登入探索：`public.session_discovery`。
- 登入者自己的清單：`public.my_session_participations`。
- roster：`public.session_participant_roster`。
- accepted-only LINE：`public.session_contacts`。
- 個人檔案表單：`public.my_profile` 與 `save_my_profile(...)`。
- lifecycle 寫入：`create_session`、`request_to_join_session`、
  `review_join_request`、`withdraw_from_session`、`cancel_session`、
  `mark_session_played`、`confirm_session_attendance`、`create_report`。

不可讓前端直接 select／insert／update／delete raw `profiles`、`sessions`、
`session_participants`、`reports` 或 private legacy tables；`src/dataApi.js` 是唯一
前端資料邊界。

## 公開資料 allowlist

`session_discovery` 是 explicit security-definer view。它可回傳球局與球場必要欄位：

```text
session_id, sport_code, court_id, court, court_district, court_lat, court_lng,
start_at, play_type, ntrp_min, ntrp_max, slots_total, slots_remaining, notes,
host_nickname, host_ntrp, host_profile_complete, status
```

其中主揪 profile 相關欄位**精確地只有** `host_nickname`、`host_ntrp`、
`host_profile_complete`。永遠不可增加 host/profile/participant ID、profile URL、真名、
LINE、電話、email、常打球場、可用時段、歷史或 roster。`session_discovery` 僅包含未來、
open/full、active tennis、台北市 court 的球局。

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
  status：`requested`、`accepted`、`declined`、`withdrawn`。只有 host participant 是
  `accepted`。
- 接受最後一個缺額以 row lock 計算容量，並把其餘 requested guests decline；不要在客戶端
  先判斷可用缺額後直接寫入。
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
