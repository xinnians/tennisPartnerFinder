# 球局｜台北市網球

一個以地圖為起點的公開球局 MVP：想打球的人可找到附近、尚未開始的網球球局；
有場地但缺球伴的人可開局。主揪接受申請後，雙方才在「我的球局」看到彼此的 LINE。

首發範圍是 **台北市、網球**。球場目錄保留雙北資料，並不代表新北市球場已開放建局或
公開探索。

## 畫面與使用流程

1. 首頁先顯示台北市地圖與收合的「附近球局」抽屜；載入時仍可使用地圖與球場圖釘。
2. 瀏覽者可移動地圖、篩選行政區／球場／日期／程度／打法，或明確點選「使用我的位置」。
   初次進站不會自動要求定位；位置只留在記憶體，使用後約以 5 km 範圍調整視野。
3. 展開抽屜、點選球局卡，先看到球場、時間、打法、程度、缺額與主揪公開暱稱／NTRP。
4. 申請加入需 Google 登入與完成基本檔案。主揪在「我的球局」審核申請；可接受或婉拒。
5. 接受後，主揪與該 guest 才能在「我的球局」互看對方 LINE；guest 不會看到其他 guest。

本機 mock 模式使用安全的假球局，僅供瀏覽與測試；已設定 Supabase 時才會讀取主揪建立的
真實球局。

## 隱私與安全邊界

公開 `session_discovery` 只回傳球局／球場必要欄位與三個主揪欄位：
`host_nickname`、`host_ntrp`、`host_profile_complete`。它不包含 profile ID、LINE、
電話、email、真名、常打球場、roster 或 profile URL。

LINE 的 disclosure 由資料庫 `session_contacts` 強制：同一球局的 host 與 guest 都是
`accepted` 才能讀取對方；這不是前端藏欄位。完整 RLS／RPC 契約見
[supabase/README.md](supabase/README.md)。

請勿把私人 LINE／Facebook 社群貼文、名單或傳聞匯入本站；本站只承載主揪自行建立的球局。

## 本機啟動

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local` 不會提交。開啟 Google Maps 與 Supabase 時填入自己的本機或 hosted 值：

```text
VITE_GOOGLE_MAPS_API_KEY=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SUPPORT_EMAIL=...
```

保留兩個 Supabase 值為 `___` 可跑本機 mock。正式環境必須設定
`VITE_SUPPORT_EMAIL`；有值時 UI 才會顯示「聯絡支援」的 `mailto:` 連結。不要在 repo
留下真實支援信箱或任何 secret。

## Google Maps 與 OAuth

Google Maps JavaScript API key 是 browser key，必須在 Google Cloud Console 設定 HTTP
referrer 限制。只加入穩定入口，例如：

```text
http://localhost:5173/*
http://127.0.0.1:5173/*
https://<stable-preview-domain>/*
https://<production-domain>/*
```

不要為每一個 immutable deployment URL 新增 allowlist。登入採 Google OAuth；hosted QA
需檢查 Supabase callback、redirect allowlist，以及登入後的未完成檔案流程。這些是人工
release gate，並非本 README 宣稱已完成的 hosted 驗證。

## 測試與 build

需要 Docker 與 Supabase CLI 的完整本機流程：

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

`npm test` 是 mock suite，**不會**重置資料庫；`npm run test:local` 也不會。只有帶有
`CONFIRM_LOCAL_DB_RESET=1` 的 guarded command 可重建 local test DB。更多細節見
[.claude/rules/testing.md](.claude/rules/testing.md)。

## Hosted 發布前的人工 gate

本 repo 不會自動 push migration、設定 production env 或發布網站。獲得相應權限後，依
[docs/mvp-plan.md](docs/mvp-plan.md) 的順序執行：

1. 完成本機 gate、球場 generator check 與 `git diff --check`。
2. 備份並記錄現有 sessions／participants count，執行 `npx supabase migration list`，
   要求每個 local migration stamp 與 remote 一致後才可套用 migration。
3. 以匿名 REST 驗證 discovery allowlist 與 raw table denial；用兩個 QA 帳號驗證
   accepted-only contact；確認 `expire-stale-tennis-sessions` cron job。
4. 在穩定 preview 手動驗證 OAuth、390px 慢網路的地圖／抽屜、位置權限、建立／申請／
   審核／聯絡、取消／打成／檢舉、support link 與經核可的 privacy link。
5. 設定 production `VITE_SUPPORT_EMAIL`、驗證 rendered `mailto:`，且所有 gate 成功後才可
   對台北網球社群分享連結。QA 建立的球局要先清除，不能當作公開冷啟動內容。

## 專案地圖

```text
src/main.js                 入口、Auth/Maps/page 接線
src/sessionController.js    探索、定位、狀態與 lifecycle orchestration
src/sessionViews.js         抽屜、sheet、My Sessions、contact UI
src/dataApi.js              唯一 browser data API
supabase/migrations/        schema、view、RPC、cron
supabase/tests/             pgTAP privacy/RLS/lifecycle contracts
tests/                      mock、local Supabase、mobile、performance journeys
data/courts.json            球場目錄單一來源
docs/tennis-ecosystem/      官方來源球場研究卡模板
```

## 球場生態研究

研究有助於挑選初期社群與球場引導，但不是公開上線的替代品。使用
[docs/tennis-ecosystem/README.md](docs/tennis-ecosystem/README.md) 的 15 張官方來源
研究卡，記錄訂場、可驗證空檔與活動證據；不要抓私人群組或把未證實的俱樂部佔場說法
當成事實。
