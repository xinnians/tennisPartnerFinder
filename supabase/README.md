# Supabase local verification 與公開球局契約

本專案以 Supabase Auth、Postgres、RLS 與 pg_cron 實作台北市網球公開球局。前端只有在
`VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 都被設定時才使用 Supabase；否則使用
安全的 mock sessions。browser code 不可直接讀 raw tables，而是經過 `src/dataApi.js`。

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

`202607170003_public_taipei_tennis_sessions.sql` 建立：

- `sports`（目前只啟用 `tennis`）、`sessions`、`session_participants`、新的 `reports`。
- 台北市限制：公開 discovery 與 create/join 都要求 active `courts.city = '台北市'`。
- session 狀態：`open`、`full`、`cancelled`、`played`、`expired`；guest 狀態：
  `requested`、`accepted`、`declined`、`withdrawn`。
- complete profile requirement：nickname、LINE、NTRP、至少一種打法和一座台北市 active court。
- lifecycle RPC：`save_my_profile`、`create_session`、`request_to_join_session`、
  `review_join_request`、`withdraw_from_session`、`cancel_session`、
  `mark_session_played`、`confirm_session_attendance`、`create_report`。

舊 `partner_requests` 和舊 reports 已被封存到 `private` schema；它們不是公開 discovery 或
browser write path。不要重新授權、搬回 public 或以它們建立旁路。

## View 權限與 LINE secrecy

| View | 誰可讀 | 可用內容 |
| --- | --- | --- |
| `session_discovery` | anon、authenticated | 未來 open/full 台北 tennis session；球局／球場欄位，以及主揪 `host_nickname`、`host_ntrp`、`host_profile_complete`。 |
| `my_session_participations` | authenticated 自己 | 自己的 lifecycle、可執行 actions。 |
| `session_participant_roster` | authenticated 依角色 | host 看本局 roster；guest 僅看自己與 host；不含 LINE。 |
| `session_contacts` | accepted host/guest 配對 | 對方 nickname 與 LINE；host 可看每位 accepted guest，guest 只可看 host。 |
| `my_profile` | authenticated 自己 | 個人檔案表單必要欄位。 |

`session_discovery` 的完整 select list 是：

```text
session_id, sport_code, court_id, court, court_district, court_lat, court_lng,
start_at, play_type, ntrp_min, ntrp_max, slots_total, slots_remaining, notes,
host_nickname, host_ntrp, host_profile_complete, status
```

不得增加 profile ID、profile URL、真名、LINE、電話、email、常打球場、history 或 roster。
LINE 僅存在 `session_contacts`；資料庫以雙方 `accepted` 的 host ↔ guest 條件強制，不是 UI
隱藏規則。

## 到期與容量

`private.expire_stale_sessions()` 將開始後超過 24 小時的 open/full sessions 設成 expired。
`expire-stale-tennis-sessions` pg_cron job 每 15 分鐘執行該 function；每個 lifecycle RPC
也會 lock/check expiry，cron 延遲不得讓 stale session 被接受。

`review_join_request` 在資料庫內 lock session、計算 accepted guests。最後一個 vacancy 被接受
時會設為 full 並 decline remaining requested guests；兩個 host client 併發接受不能 overfill。

## pgTAP 與 browser coverage

`supabase/tests/session_rls.sql` 驗證 raw table denial、public allowlist、profile completion、
roster/contact disclosure、capacity/withdrawal、cancel/played/attendance、report 與台北市限制。
`courts_catalog.sql` 驗證 `data/courts.json` 產出的目錄，`my_profile_rls.sql` 驗證 owner-only
profile form contract。

`tests/session.spec.js` 使用 local users 驗證 create → request → review → accepted-only contact
以及 stale/error/race 路徑；`tests/session-mobile.spec.js` 覆蓋 390px critical journey。詳見
`.claude/rules/testing.md`。

## Hosted release runbook（人工、需授權）

不要從文件或 CI 自動執行以下操作。取得 hosted 權限後：

1. 先完成本機 gate，備份並記錄既有 sessions/participants count。
2. 執行 `npx supabase migration list`，要求每個 local migration stamp 與 remote 對齊；
   發現 drift 時停止，不要修改已套用 migration。
3. 套用 migration 後以匿名 REST 驗證 `session_discovery` 精確 allowlist，並確認 raw
   sessions/participants/roster/contacts、retired discovery path 都被拒絕。
4. 用兩個 QA 帳號確認 acceptance 前零 contact、acceptance 後只有 host ↔ accepted guest，
   並確認 `expire-stale-tennis-sessions` job 存在及 controlled stale-session 行為。
5. 移除 QA 球局，才可進行社群分享。不要把此清單未跑的項目寫成已完成。

## 球場目錄規則

`data/courts.json` 是 catalog 單一來源。不要手改已套用的 generated migration；新增或修正
球場時以新 stamp 產生 migration 與 pgTAP fixture，並執行：

```bash
node scripts/generate-courts-seed.mjs --check
```
