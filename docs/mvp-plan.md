# 台北市網球公開球局 MVP 計畫

最後更新：2026-07-20

這是目前產品、資料模型與發布決策的來源。實作細節以
`supabase/migrations/`、`supabase/tests/` 和
`docs/superpowers/specs/2026-07-17-taipei-tennis-public-mvp-design.md` 為準。

## 目標與首發範圍

解決兩件事：

- 想打球的人可在地圖上找到附近、未來、可加入的網球球局。
- 已找到場地但缺人者可快速開局，讓有興趣的人申請，由主揪決定是否接受。

首發是公開 Web、**台北市網球**。球場資料目錄可保留雙北，但公開 discovery、create 和
join 只允許台北市 active court 與 active tennis sport。多運動／另一城市需有新的產品、
容量、資料品質與 RLS 決策，不是資料表有 `sport_id` 就自動開放。

不做：私人社群爬蟲、站內聊天、付款／訂場、候補、推播、評分、教練媒合、原生 App。

## 已確認的使用者流程

```text
地圖（初始不索取定位）
  → 收合的附近球局抽屜
  → 球局詳情
  → Google 登入／完成檔案
  → 申請加入
  → 主揪接受或婉拒
  → 已接受 pair 在「我的球局」看到對方 LINE
```

- `使用我的位置` 是明確行為，位置只在記憶體中使用，約以 5 km 視野定位。
- 公開頁只顯示 session/court 必要資料，以及主揪 `host_nickname`、`host_ntrp`、
  `host_profile_complete`。
- LINE 是資料庫 `session_contacts` 的 accepted-only host ↔ guest secret，並非前端 gate。
- My Sessions 將主揪待審核請求放在最前面；accepted contacts 僅在 accepted state 載入。

## 資料與權限契約

| 項目 | 決策 |
| --- | --- |
| Public discovery | `session_discovery` 只含 explicit session/court fields 與三個 allowlisted host fields；沒有 profile ID、LINE、電話、email、常打球場或 roster。 |
| Roster | host 看該局 roster；guest 只看自己與 host；兩者都沒有 LINE。 |
| Contacts | `session_contacts` 只給同一球局的 accepted host/guest；host 可看各 accepted guest，guest 只看 host。 |
| 名額 | `slots_total` 1–3；最後缺額接受在 DB lock 下原子完成，不能 overfill。 |
| Lifecycle | RPC 處理 create/request/review/withdraw/cancel/played/attendance/report；失敗後 UI 重讀權威資料。 |
| 到期 | `expire-stale-tennis-sessions` pg_cron 每 15 分鐘處理開始後超過 24 小時的 open/full session；RPC 也立即檢查。 |
| Catalog | `data/courts.json` 是單一來源；已套用 generated migration 不可修改。 |

## 實作與本機驗證狀態

本機完成並已在本工作分支驗證：

- 台北市／網球 session schema、definer views、RLS、lifecycle RPC 與 pg_cron migration。
- 地圖優先 UI、收合 drawer、顯式定位、create/join/review/contacts/My Sessions。
- 2.5 秒 discovery delay、bounds debounce、keyboard dialog/focus、stale join、Google Maps
  failure fallback、兩 client 最後缺額併發。
- `VITE_SUPPORT_EMAIL` 有值時會渲染「聯絡支援」mail-to 入口；production 值仍須由部署者
  設定，不能提交預設信箱。
- 「我的球局」頁的登出（僅登入時渲染）；清理由 `setAuthState(null, null)` 既有分支處理。
- `public/privacy.html` 靜態隱私權政策頁與站內連結。
- local DB pgTAP、mock desktop/mobile、local desktop/mobile、build 與 generator check。

hosted 的執行狀況見下方「Hosted 發布 gate（2026-07-20 執行紀錄）」，該節逐項標示已驗與
未驗；本節只代表本機驗證。

## 本機 release gate

```bash
npx supabase start
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test
npm run test:db
npm run test:mock
npm run test:local
TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium
node scripts/generate-courts-seed.mjs --check
npm run build
git diff --check
```

`npm test` 與 `npm run test:local` 都不會清資料庫。只在需要乾淨 fixture 時，使用帶
`CONFIRM_LOCAL_DB_RESET=1` 的 local-only reset。

## Hosted 發布 gate（2026-07-20 執行紀錄）

首次 hosted 發布 gate 於 2026-07-20 執行。完整逐項輸出留存在執行者本機的
`~/tennisPartnerFinder-backups/20260720-143340/`（schema 與資料備份、gate-status.md）。
以下標記僅代表**該次實測**；未實際執行的子項一律標為未完成，不得因整關通過而視為已驗。

1. **備份與差異**：**完成**。`supabase db dump` 取得 schema 與資料備份；migration 前
   筆數 courts 85、profiles 1、partner_requests 1、reports 2。本機 gate 全綠。
2. **Migration**：**完成**。push 前 remote 僅有 `202607020001`、`202607080001`；套用
   `202607170001`–`202607170004` 後六個 stamp 全數 local 與 remote 相符。
3. **匿名安全**：**完成**。匿名 REST 實測：`session_discovery` 記載的 19 欄逐欄探測皆
   回 200，10 個敏感欄位（`line_id`、`host_id`、email、電話等）逐欄探測皆回 400 不存在。
   逐欄探測只證明這些欄位存在與不存在，「恰好是這 19 欄、不多不少」由本機
   `supabase/tests/session_rls.sql:269-277` 的完整有序比對保證。raw `sessions`、
   `session_participants`、`profiles`、`sports` 與 `session_contacts`、
   `session_participant_roster`、`my_session_participations`、`my_profile` 全數 401；
   `partner_requests`、`legacy_partner_requests`、`public_profile_discovery` 全數 404；
   八個 lifecycle RPC（`create_session`、`request_to_join_session`、
   `review_join_request`、`withdraw_from_session`、`cancel_session`、
   `mark_session_played`、`confirm_session_attendance`、`create_report`）以正確簽名
   呼叫皆回 401。
4. **兩帳號資料邊界**：**完成（一項限制）**。兩個 Google 帳號實測：accept 前雙方
   `session_contacts` 皆 0 筆且主揪 LINE 字串未出現於任何回應；accept 後雙方各 1 筆且
   精確為對方；roster 全程無 `line_id`；guest 直接讀 raw table 得 403。
   **未驗**：host 有多位 guest 時彼此不可互看——該次測試缺額為 1，僅有單一 guest。
   此項目前由 `supabase/tests/session_rls.sql` 與 `session_contacts` 的 host↔guest
   配對條件保證，尚未在 hosted 以三帳號實測。
5. **到期**：**部分完成**。`expire-stale-tennis-sessions` job 存在、`*/15 * * * *`、
   `active=true`。**未驗**：hosted 的 controlled stale-session check 與 RPC 拒絕 stale
   state（本機 pgTAP 已覆蓋）。
6. **穩定 preview 手動 QA**：**部分完成**。已驗：Google OAuth callback（四次往返皆導回
   穩定網址）、Maps referrer、drawer 空狀態、create／join／review 的 accept 分支／
   accepted-only contact 顯示、支援與隱私連結、console 無 error。
   **未驗**：review 的婉拒（decline）分支、初始無定位 prompt 與位置成功／拒絕分支、
   約 5 km 視野、cancel/played/report、390px 慢網路 3 秒可用性、hosted 鍵盤焦點
   （末四項本機 E2E 已覆蓋，但未在 hosted 重跑）。
7. **公開資訊**：**完成**。production `VITE_SUPPORT_EMAIL` 已設定，實測渲染
   `mailto:` 正確；`/privacy.html` 已上線並經負責人審核。政策內容以兩個 subagent
   對照 migration 與 `src/` 逐條查核，並據此補正六處揭露不足。
8. **資料清理與發布**：**技術面完成**。QA 球局與 QA profile 已刪除、QA auth 帳號已移除、
   hosted email signup 已關閉（`/auth/v1/signup` 回 `email_provider_disabled`）；
   匿名 discovery 為 0 筆。**社群分享連結尚未執行**，由負責人決定時機。

發布前若要補齊上述「未驗」項目，需再跑一次對應子項並更新本節，不可沿用本次紀錄。

## Hosted migration 執行紀錄（2026-07-22：join_mode＋球友層）

`202607210001_session_join_mode`、`202607210002_player_directory_invites` 於
2026-07-22 套用至 hosted（負責人授權並親自執行 `supabase db push`）。備份與逐項輸出
留存於 `~/tennisPartnerFinder-backups/20260722-153251/`。

1. **備份與 count preflight**：**完成**。schema 與 data dump；migration 前筆數
   courts 85、profiles 1、legacy_partner_requests 1、legacy_reports 2，與 2026-07-20
   基線一致；sessions／session_participants 0 筆。
2. **Migration list 對齊**：**完成**。套用前 remote 六個 stamp 無 drift；套用後八個
   stamp local 與 remote 全數相符。
3. **匿名安全（本次增量面）**：**完成**。匿名 REST 實測：`session_discovery` 的
   `join_mode` 欄回 200；`line_id` 探測回 400（42703 不存在）；`player_directory`
   回 401（42501 permission denied）；`set_player_visibility`、`invite_to_session`、
   `respond_to_session_invite` 三個新 RPC 匿名呼叫皆回 401（42501）。
4. **未驗（本次未執行）**：登入帳號的 `player_directory` 讀取與 opt-in 下架、兩帳號
   邀請旅程（邀請 → 接受 → accepted-only 互看 LINE）、instant join 兩帳號旅程、
   preview 前端手動 QA（Vercel 已由 git push 自動建置新前端）、cron 對新增球局的
   到期驗證。以上均有本機 pgTAP 與 e2e 覆蓋，但未在 hosted 實測。

本計畫不授權自動 deployment、hosted DB reset、環境變數寫入、migration push 或社群發文。

## 首兩週的社群與指標

先只在已核可的台北網球社群發布，文案要清楚說明「開局／申請／主揪核准後才互露 LINE」。
不要由私人群組匯入貼文，也不要拿 QA 假資料填滿地圖。

每週用有權限的安全查詢彙整：

| 漏斗 | 最小指標 |
| --- | --- |
| 進站與啟用 | 實際使用者數、完成檔案數 |
| 供給 | 建立球局數、未來 open session 數 |
| 配對 | 申請數、accepted joins、accept rate |
| 結果 | played reports、出席確認、取消／退出原因 |

每週只選一個有證據的摩擦點改進，例如開局表單、抽屜發現、登入恢復或主揪審核；不要在樣本
不足時擴張城市或功能。

## 球場生態研究（非上線前置）

了解台北網球生態有助於選擇初期分發與球場引導，但不應延後安全、生命週期與 hosted QA。
使用 `docs/tennis-ecosystem/README.md` 的 15 張官方來源卡，記錄訂場方式、可驗證空檔與
固定活動／課程。禁止抓取私人群組，或把未被官方來源佐證的俱樂部佔場說法寫成事實。
