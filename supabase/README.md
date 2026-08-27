# Supabase local verification 與公開球局契約

本專案以 Supabase Auth、Postgres、RLS 與 pg_cron 實作台北市網球公開球局。前端只有在
`VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 都被設定時才使用 Supabase；否則使用
安全的 mock sessions。browser code 不可直接讀 raw tables，而是經過 `src/dataApi.ts`。

## 前置條件

- Docker Desktop（或相容 runtime）
- Supabase CLI（可用 `npx supabase`）
- Node.js 與已安裝的 npm dependencies

官方參考：

- [Supabase local development](https://supabase.com/docs/guides/local-development/overview)
- [Supabase CLI](https://supabase.com/docs/reference/cli/introduction)
- [Supabase Cron](https://supabase.com/docs/guides/cron)

## 安全的本機工作流程

```bash
npx supabase start

# 僅在需要全新 local fixture 時執行；沒有確認值會拒絕重置。
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test

npm run test:db
npm run test:mock
npm run test:local
TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium
node scripts/generate-courts-seed.mjs --check
npm run build
git diff --check
```

`npm test` 與 `npm run test:local` 都是非破壞性預設，**不會**重設資料庫。只有
`npm run db:reset:test` 加上 `CONFIRM_LOCAL_DB_RESET=1` 才能重建 loopback local DB；
它會拒絕非 `127.0.0.1:54321` 的 API target。

若 Docker 沒啟動，`supabase start`／reset／pgTAP 會在容器前置階段失敗。Playwright local
瀏覽器專案使用 port 5175；mock 專案使用 port 5174。

## 已實作的 schema 邊界

`202607170003_public_taipei_tennis_sessions.sql` 建立核心 schema，後續 migration 逐步擴充：

- `sports`（目前只啟用 `tennis`）、`sessions`、`session_participants`、新的 `reports`。
- 台北市限制：公開 discovery 與 create/join 都要求 active `courts.city = '台北市'`。
- session 狀態：`open`、`full`、`cancelled`、`played`、`expired`；guest 狀態：
  `requested`、`invited`、`accepted`、`declined`、`withdrawn`。
- 個人檔案門檻採三級制（`202607270001` 起，授權只以 `private.require_profile_gate(level)`
  為準）：`nickname`＝非空暱稱；`ntrp`＝暱稱＋1.0–7.0 NTRP；`directory`＝ntrp＋至少一座
  台北市 active 常打球場。LINE、打法與可打時段都不是門檻必要欄位。
- 初版 lifecycle RPC：`save_my_profile`、`create_session`、`request_to_join_session`、
  `review_join_request`、`withdraw_from_session`、`cancel_session`、
  `mark_session_played`、`confirm_session_attendance`、`create_report`；後續 migration 增加
  邀請、候選定案、群聊、封鎖、在場與通知等 RPC，完整清單見 `.claude/rules/supabase.md`。

舊 `partner_requests` 和舊 reports 已被封存到 `private` schema；它們不是公開 discovery 或
browser write path。不要重新授權、搬回 public 或以它們建立旁路。

## View 權限、群聊與退役聯絡面

| View | 誰可讀 | 可用內容 |
| --- | --- | --- |
| `session_discovery` | anon、authenticated | 未來與開始後兩小時內的 open/full 台北 tennis session；球局／球場欄位，以及主揪 `host_nickname`、`host_ntrp`、`host_profile_complete`。 |
| `my_session_participations` | authenticated 自己 | 自己的 lifecycle、可執行 actions。 |
| `session_participant_roster` | authenticated 依角色 | host 看本局 roster；guest 僅看自己與 host；不含 LINE。 |
| `session_join_preview` | authenticated | 加入前名單：該局 host 與 accepted guests 的六欄摘要，不含 profile_id。 |
| `session_message_feed` | 該局 host 與 accepted guest | 球局群組聊天；寫入只走 `post_session_message`，封存後唯讀。 |
| `player_directory` | authenticated 且 viewer 通過 directory 門檻 | 已 opt-in 球友的目錄卡欄位；`is_public` 預設 false。 |
| `player_presence_directory` | authenticated 互惠 | 分享者在場狀態；viewer 須通過 ntrp 門檻且已開 `share_presence`，否則 0 列。 |
| `my_player_blocks` | authenticated 自己 | 本人封鎖清單。 |
| `my_profile` | authenticated 自己 | 個人檔案表單必要欄位。 |
| `session_contacts`（退役） | accepted host/guest 配對 | 凍結技術債：前端零 consumer，不得重新接回 browser API 或 UI；清理前既有 RLS 仍強制。 |

`session_discovery` 的完整 select list 是：

```text
id, session_id, sport_code, court_id, court, court_district, court_lat, court_lng,
start_at, play_type, ntrp_min, ntrp_max, slots_total, slots_remaining, notes,
host_nickname, host_ntrp, host_profile_complete, status, join_mode, venue_type,
range_end, candidate_court_ids, fee_note, decided_at
```

`id` 與 `session_id` 同值（view 的冗餘欄位）。`supabase/tests/session_rls.sql` 對這 25 欄
做完整有序比對，任何增刪都會讓 pgTAP 失敗。

不得增加 profile ID、profile URL、真名、LINE、電話、email、常打球場、history 或 roster。
LINE 前端聯絡面已退役：`profiles.line_id` 與 `session_contacts` 只因凍結 migration 暫留為
資料庫技術債。成局後協調一律走 `session_message_feed`／`post_session_message` 球局群組
聊天；成員資格（host 與 accepted guest）由資料庫強制，不是 UI 隱藏規則。

## 到期與容量

`private.expire_stale_sessions()` 將開始後超過 24 小時的 open/full sessions 設成 expired。
`expire-stale-tennis-sessions` pg_cron job 每 15 分鐘執行該 function；每個 lifecycle RPC
也會 lock/check expiry，cron 延遲不得讓 stale session 被接受。

`review_join_request` 在資料庫內 lock session、計算 accepted guests。最後一個 vacancy 被接受
時會設為 full 並 decline remaining requested guests；兩個 host client 併發接受不能 overfill。

## pgTAP 與 browser coverage

`supabase/tests/session_rls.sql` 驗證 raw table denial、public allowlist、個人檔案門檻、
roster 揭露與退役 `session_contacts` 的凍結 RLS、capacity/withdrawal、
cancel/played/attendance、report 與台北市限制。
`courts_catalog.sql` 驗證 `data/courts.json` 產出的目錄，`my_profile_rls.sql` 驗證 owner-only
profile form contract。

`tests/session.spec.js` 使用 local users 驗證 create → request → review → accepted 成員
群組聊天，以及 stale/error/race 路徑；`tests/session-mobile.spec.js` 覆蓋 390px critical journey。詳見
`.claude/rules/testing.md`。

## Hosted release runbook（人工、需授權）

不要從文件或 CI 自動執行以下操作。取得 hosted 權限後：

1. 先完成本機 gate，備份並記錄既有 sessions/participants count。
2. 執行 `npx supabase migration list`，要求每個 local migration stamp 與 remote 對齊；
   發現 drift 時停止，不要修改已套用 migration。
3. 套用 migration 後以匿名 REST 驗證 `session_discovery` 精確 allowlist，並確認 raw
   sessions/participants/roster/contacts、retired discovery path 都被拒絕。
4. 用兩個 QA 帳號確認球局群組聊天在 acceptance 前不可用、acceptance 後僅 host 與
   accepted guest 可讀寫，並確認 `expire-stale-tennis-sessions` job 存在及 controlled
   stale-session 行為。
5. 移除 QA 球局，才可進行社群分享。不要把此清單未跑的項目寫成已完成。

## 球場目錄規則

`data/courts.json` 是 catalog 單一來源。不要手改已套用的 generated migration；新增或修正
球場時以新 stamp 產生 migration 與 pgTAP fixture，並執行：

```bash
node scripts/generate-courts-seed.mjs --check
```
