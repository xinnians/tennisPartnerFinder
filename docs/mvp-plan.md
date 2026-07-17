# 台北市網球公開球局 MVP 計畫

最後更新：2026-07-18

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
- local DB pgTAP、mock desktop/mobile、local desktop/mobile、build 與 generator check。

這些只代表本機驗證；不代表 hosted migration、OAuth、Maps referrer、production env 或手動
手機網路 QA 已完成。

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

## Hosted 發布 gate（人工、尚待授權執行）

所有項目需有完成紀錄；任一項失敗即停止發布。

1. **備份與差異**：備份 hosted DB，記錄 sessions/participants counts；跑 local gate。
2. **Migration**：`npx supabase migration list` 要求每個 local stamp 與 remote 相符；
   差異未釐清前不 push。套用後再次 list 驗證。
3. **匿名安全**：用匿名 REST client 驗證 `session_discovery` 精確 allowlist，只可看
   host nickname/NTRP/completion marker；raw sessions、participants、roster、contacts、
   retired discovery path 都必須被拒絕。
4. **兩帳號資料邊界**：accept 前雙方 zero contacts；accept 後只有該 host/guest pair；
   host 有多 guest 時彼此不可互看。
5. **到期**：確認 `expire-stale-tennis-sessions` cron job，執行 controlled stale-session
   check，確認 RPC 亦拒絕 stale state。
6. **穩定 preview 手動 QA**：Google OAuth callback、Maps referrer、初始無定位 prompt、
   位置成功／拒絕、約 5 km 視野、drawer loading/empty、create/join/review/contact、
   cancel/played/report、390px 慢網路（3 秒可用性）與鍵盤焦點。
7. **公開資訊**：設定 production `VITE_SUPPORT_EMAIL` 並驗證 rendered `mailto:`；加入經
   負責人／法律審核的 privacy link。不得杜撰支援信箱或 privacy policy。
8. **資料清理與發布**：移除所有 QA sessions，所有 gate 成功後才在核可的台北網球
   LINE／Facebook 社群分享連結。

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
