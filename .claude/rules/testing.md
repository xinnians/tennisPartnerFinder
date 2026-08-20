---
paths:
  - "tests/**"
  - "playwright.config.js"
---

# 測試：非破壞性預設與 local Supabase 分流

`npm test` 等同 `npm run test:mock`，只跑 mock unit/Playwright，**不會重置任何資料庫**。
`npm run test:local` 也不重置資料庫。需要乾淨 local fixture 時，只能明確執行：

```bash
npx supabase start
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test
```

guarded reset 只接受 loopback Supabase API；不要以 `npx supabase db reset` 取代它，也不要
在 `beforeAll`／測試 script 中隱性清庫。

## 標準本機驗證

```bash
npx supabase start
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test
npm run test:db
npm run test:mock
npm run test:local
TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium
node scripts/generate-courts-seed.mjs --check
npm run typecheck
npm run lint
npm run prettier:check
npm run build
git diff --check
```

CI 由 `.github/workflows/quality-gate.yml` 分成 frontend 與 Supabase 兩個 job；聚合入口是
`npm run test:ci:frontend`、`npm run test:ci:supabase`。後者包含新增的
`npm run test:local:mobile`。CI 可用 `TENNIS_DISCOVERY_SHELL_BUDGET_MS=2500` 放寬共用 runner
的 shell timing 預算，本機預設仍是 1000ms；不得用這個變數放寬其他斷言。

`npm run test:mock` 與 `npm run test:local` 的 pre-script 都會先跑 `npm run typecheck`；
`lint` 與 `prettier:check` 只掃 `.ts/.tsx`，不把存量 `.js` 納入本批改寫範圍。

## Playwright projects

- `desktop-chromium`、`mobile-chromium`：mock mode，port 5174，執行
  `smoke.spec.js` 與 `performance.spec.js`。
- `supabase-chromium`：local Supabase mode，port 5175，執行 `session.spec.js` 與
  local-only `performance.spec.js`。
- `supabase-mobile-chromium`：local Supabase mode，port 5175，執行
  `session-mobile.spec.js`。

local project 需要 Docker 與 `npx supabase start`。兩個 local browser project 共用可變 DB，
因此 config 設為單 worker；若手動並行，先重置資料再查明資料污染。webServer 對測試注入
local URL/key 和 `VITE_GOOGLE_MAPS_API_KEY=e2e`，不依賴 `.env.local`。

## Fake Maps、時間與可及性

- 所有 browser test 使用 `tests/fixtures/fakeMaps.js`，不載入真實 Google Maps。
  Fake map 支援 bounds、idle、burst 與 base-court marker；改 Maps API 時先更新 fixture。
- `performance.spec.js` 覆蓋 2.5 秒 discovery delay、bounds debounce、REST four-predicate
  window、loading/error/empty state、keyboard focus、stale join 與 zero-console-error。
- mock 成功旅程必須收集 `console.error` 與 `pageerror`，並斷言為空。
- modal/drawer test 必須驗證 role/label、Tab trap、Escape、trigger restore；可替換 DOM 的
  drawer 要在 loading 與 stale data 中保留可用焦點，不可落在 `body`。
- 已知且接受的 focus 例外（2026-08-20）：`--color-court #1c5c3c` 疊在
  `--color-ink #12291c` 的實算值為 1.9457:1（約 1.95:1），影響 `.bottom-navigation` 與
  `#map-data-status`。產品以觸控為主、桌面鍵盤為次要情境，因此維持現色且不加 focus
  對比 gate；若日後要求 WCAG 1.4.11 合規，需重新拍板。
- 標題 grep 一律帶 `--project`，避免 mock/local 混跑。

## Local session fixture

`tests/fixtures/localSupabase.js` 以 local email/password 建立隔離帳號並把 session 放進
browser storage；這不是 hosted Google OAuth 測試。`tests/fixtures/sessionFactory.js` 只能用
合法 profile/RPC 建立資料，不能繞過 RLS 直接寫 raw lifecycle rows。

新的 lifecycle 或資料外洩風險必須同時補：

1. `supabase/tests/session_rls.sql` 的 pgTAP 授權／狀態契約；
2. `tests/session.spec.js` 的真實 local browser/API journey；
3. 視 public surface 而定的 mock privacy/console 回歸。
