# 彈性批派工單：F0-8 分支名解耦＋F4-10 測試基建

- 日期：2026-08-25
- 路線圖：`docs/arch-roadmap-2026-08-25.md` 彈性批節；母派工單 F0-8／F4-10
- 開工基準：以當前 origin HEAD 為準（`aad6d75` 之後）
- 兩子項互不依賴，各自至少一個 commit；建議 F0-8 先（小）、F4-10 後（大）。

## Ground truth（2026-08-25 實測）

- **F0-8**：分支名 `claude/tennis-partner-finder-proto-xfrr6g` 散落 3 處——
  `.github/workflows/quality-gate.yml` ×2、`tests/ci-config.test.js` ×1。
  GitHub workflow 的 `branches` 過濾器吃不到外部常數（YAML 也無 anchor
  可用），「只改一處」有結構上限；目標是把可省的重複省掉並用測試鎖一致性。
- **F4-10**：`playwright.config` 第 19 行全域 `workers: 1`；
  `tests/smoke.spec.js` **6,034 行**；mock 套件（286 tests）在 workers=1
  實測 wall-clock 2.6–2.7 分鐘（驗收方今日三輪實測）；local 套件共用可變
  DB，恆為單 worker。三個 mock project 的 `testMatch` 是**未錨定** regex
  `/(?:smoke|performance|…)\.spec\.js/`——`<surface>-smoke.spec.js` 這類
  命名天然匹配、不需動 testMatch（提示，命名自選但 testMatch 逐字不變
  是驗收條件）。
- mock 與 local 已是分開指令（`test:mock`／`test:local`），平行度可在
  指令或 config 層分流，不必發明 per-project workers 機制。

## F0-8 ci-config 分支名解耦

1. 盤點「開新工作分支」時所有需要改分支名的位置，收斂到最少；JS 側
   （測試／腳本）只允許一個常數來源。
2. `tests/ci-config.test.js` 改為推導式守門：workflow 內所有分支名出現點
   必須彼此一致且等於該常數；不一致 → 紅（fail-closed，附 canary：
   改掉 workflow 其中一處 → 紅→還原→綠）。
3. 回報列出最終「開新分支要改幾處、各在哪」；workflow 結構性重複
   （push＋PR 過濾器）如省不掉，明說即可。
4. 不改 workflow 的 job 結構、觸發條件語意與 gate 內容。

## F4-10 測試基建：smoke 拆檔＋mock 平行化

1. **smoke.spec.js 按 surface 拆檔**（地圖／探索、session 生命週期、
   sheet／表單、聊天、導覽／殼……切法自提）；共用 helper 抽到
   `tests/fixtures/`（或等價）共用模組。
2. **搬移零改寫**：每條 test 的 title 與本體逐字搬移，不改斷言、不改
   testid、不併測試、不刪測試。**搬移保真自證**：回報附方法與結果——
   拆檔前後全套件 test title 多重集合逐字相同（附計數），並以標準化
   （僅容忍 import／helper 引用差異）的 per-test 本體比對或等價機制
   證明零改寫；方法自選但掃描集非空自證照舊。
3. **mock 平行化**：mock 套件開多 worker（幅度自訂，附機器核數依據）；
   **local 兩個 project 恆 workers=1**（共用可變 DB，硬限制）；WebKit
   非阻擋 job 平行度自選。
4. **驗收核心**：mock 套件 wall-clock 較基線 2.6–2.7 分鐘實質下降
   （附前後三輪取樣，單輪不算數）；全綠。若平行揭露既有測試互依或
   flake：逐案揭露並修測試隔離（不得弱化斷言）；若有無法在本批安全
   隔離的案例，該案例可留單 worker 並說明，不可靜默。
5. `testMatch` 五個 project 的 regex 逐字不變；`test:mock`／`test:local`
   ／`test:ci:*` 指令對外語意不變（跑的測試集合相同）。
6. 拆檔後 `npm run test:mock` 三輪全綠（flake 取樣）；GOLDEN／
   `data-testid` 值零變動。

## 不在範圍

1. 不改任何斷言語意、不刪測試、不動 unit 測試檔。
2. 不動 src/ 產品碼（純測試與 CI 設定批）。
3. 不動 local DB fixture 策略、不重置 DB（若撞 fixture 污染訊號，
   依慣例先數 DB → guarded reset → 揭露）。
4. 不動 Vercel／hosted。

## 驗收與回報

寫成 `docs/arch-dispatch-2026-08-25-flex-batch-report-codex.md`，不列入
實作 commit、不 push。逐子項：F0-8 最終改動位置清單與 canary、F4-10
拆檔對照表（原行段 → 新檔）、搬移保真證明、平行化 worker 數與三輪
前後時間、互依／flake 處置清單、未做明說。

**收尾標準矩陣**：`npm run test:ci:frontend`、`npm run test:db`、
`npm run test:local`（did not run＝0）、`git diff --check`；
`data-testid`／GOLDEN 零變動。純測試批但 `test:local` 照跑
（Playwright 設定變動影響 local project 載入）。Playwright 兩套不並發。
