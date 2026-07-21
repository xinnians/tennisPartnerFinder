# CLAUDE.md

## 專案定位

這是以 Vite 6 與原生 ES modules 製作的台北市網球公開球局 MVP。首頁是地圖，
使用者可瀏覽未來球局，依球局加入方式申請或直接加入；審核制由主揪核准後，已接受的主揪與
參與者才可互看 LINE ID。首發公開範圍是 **台北市、網球**；資料庫保留雙北球場目錄，但不可把
新北市球場開放為公開球局。

產品與資料模型的來源依序是：

1. `docs/mvp-plan.md`：目前範圍、上線門檻與維運流程。
2. `docs/superpowers/specs/2026-07-17-taipei-tennis-public-mvp-design.md`：產品與隱私決策。
3. `supabase/migrations/` 與 `supabase/tests/`：已實作的資料庫契約。

舊的 player-card、partner-request、quick-contact 文件僅可視為歷史，不可拿來擴充
目前產品。

## 不可破壞的產品與隱私邊界

- 不要爬取、儲存或轉貼私人 LINE／Facebook 社群內容或身分資料。
- 真實模式只呈現主揪自行建立的球局；`src/mockData.js` 只供本機 demo／測試。
- 公開探索只透過 `public.session_discovery`。與主揪相關的公開資料**只有**
  `host_nickname`、`host_ntrp`、`host_profile_complete`；不可增加 profile ID、連結、
  真名、LINE、電話、email、常打球場、歷史或 roster 資料。
- LINE 不是 UI 隱藏欄位。它只能由資料庫 definer view `public.session_contacts`
  回傳給同一球局中、雙方皆為 `accepted` 的 host/guest 配對。主揪可看各已接受
  guest；guest 只可看主揪，不能看其他 guest。
- raw `sessions`、`session_participants`、`profiles` 與私有 legacy tables 不是
  browser data API。所有前端讀寫都必須經過 `src/dataApi.js` 的 view/RPC 邊界。
- 請勿加入聊天、訂場、付款、候補、評分、另一城市或另一運動的 UI；未來多運動
  必須先有獨立產品與資料權限決策。

更多 RLS、view、RPC 與 migration 規則見 `.claude/rules/supabase.md`。

## 程式結構

- `src/main.js`：應用程式入口、頁面切換、Maps/Auth 接線。
- `src/sessionController.js`：探索、地圖 bounds、登入／檔案 gate、生命週期 refresh。
- `src/sessionViews.js`：抽屜、球局、建立表單、My Sessions 與 contact 顯示。
- `src/sheets.js`：可存取的 sheet/dialog 原語與焦點回復。
- `src/dataApi.js`：唯一瀏覽器資料邊界；公開 summary、私有 view 與 RPC mapper。
- `src/map.js` / `src/pins.js`：Google Maps 與球局／球場圖釘。
- `src/mockData.js`：安全、未來日期的本機 demo `SessionSummary`。
- `data/courts.json`：球場目錄單一來源；產生 migration／pgTAP fixture 的來源。

以 `innerHTML` 產生 DOM 時，所有動態內容都必須使用 `esc()`；沒有框架、TypeScript、
linter 或 formatter，勿虛構 `lint`／`tsc` 指令。UI 與註解使用繁體中文。

## Session 資料流程

公開流程：地圖 → 收合的「附近球局」抽屜 → 球局詳情 → 登入與完成檔案 →
依加入方式提出申請或直接加入 →（審核制）主揪接受或婉拒 → My Sessions 的已接受聯絡資訊。

- `create_session`：完整 profile 的主揪在台北市 active tennis court 建局；缺額 1–3，
  `join_mode` 可為 `approval`（審核制）或 `instant`（直接加入），同一主揪至多五個未來、
  open/full 的球局。
- `request_to_join_session`：完整 profile 不可加入自己的球局；`approval` 局建立申請並回傳
  `OK`，有缺額的 `instant` 局直接接受並回傳 `ACCEPTED`。
- `review_join_request`：只有主揪可接受／婉拒。最後缺額的接受是資料庫鎖定的原子操作。
- `withdraw_from_session`、`cancel_session`、`mark_session_played`、
  `confirm_session_attendance`、`create_report`：只用對應 RPC，失敗後以權威資料重整。
- `public.my_session_participations` 是登入者自己的生命週期清單；
  `public.session_participant_roster` 對 host 顯示該局 roster、對 guest 僅顯示自己與 host，
  但兩者都不含 LINE。
- `expire-stale-tennis-sessions` pg_cron 每 15 分鐘將開始後超過 24 小時的 open/full
  球局設為 expired；每個 lifecycle RPC 也立即檢查，UI 不可依賴 cron 延遲。

## 本機開發與驗證

```bash
npm install
cp .env.example .env.local
npm run dev

npx supabase start
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test  # 明確確認後才可重置本機測試 DB
npm run test:db
npm run test:mock
npm run test:local
TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium
node scripts/generate-courts-seed.mjs --check
npm run build
git diff --check
```

`npm test` 等同 `npm run test:mock`，**不會**重置資料庫；`npm run test:local` 也不會。
需要清空本機資料時，唯一標準入口是帶有 `CONFIRM_LOCAL_DB_RESET=1` 的 guarded 指令。
測試規則、ports、Fake Maps 與本機登入 fixture 見 `.claude/rules/testing.md`。

## 環境與 hosted 操作

`.env.local`（不提交）可設定：

```text
VITE_GOOGLE_MAPS_API_KEY=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SUPPORT_EMAIL=...
```

瀏覽器 Maps key 必須設定 HTTP referrer 限制；只放 localhost、穩定 preview 與正式
domain，不要把每個 immutable deploy URL 加進 allowlist。`VITE_SUPPORT_EMAIL` 在正式
環境必填，不能提交或杜撰公開信箱。

**部署一律用 git push 觸發，不要用 `vercel deploy`。** Vercel 有兩個各自獨立的穩定
別名：`...-git-<branch>-...`（只有 Git integration 建置會更新，這個才是加進 Maps
allowlist 與 Supabase Site URL 的 QA 入口）與 `...-xinnians-...`（CLI 部署才更新）。
用 CLI 部署會讓 QA 入口停在舊版；2026-07-20 就因此讓線上站在套用 migration 後仍是
舊前端，讀取路徑全失效。Supabase 的兩個 `VITE_SUPABASE_*` 只設在 Preview 且綁定
工作分支，Production 環境沒有（2026-07-20 以 `vercel env ls` 查證），推 production
會退回 mock 模式。

任何 hosted migration、環境變數、部署或社群發布前，先完成
`docs/mvp-plan.md` 的 release checklist：備份／count preflight、migration list 對齊、
匿名 REST allowlist、兩帳號 accepted-only contact、cron、OAuth、390px 慢網路與
support/privacy link 的人工檢查。未實際完成的 hosted gate 不可在文件中標記為完成。

## 球場目錄與文件維護

- 不可手改已套用的 generated catalogue migration；先改 `data/courts.json`，再以新 stamp
  產生 migration 與 `supabase/tests/courts_catalog.sql`，並執行 `--check`。
- `docs/tennis-ecosystem/README.md` 是 15 張官方來源球場研究卡模板；不得把私人社群傳聞
  或未證實的俱樂部佔場說法寫成資料。
- 保持本檔不超過 200 行；較細的資料庫／測試規則放在 `.claude/rules/`。
