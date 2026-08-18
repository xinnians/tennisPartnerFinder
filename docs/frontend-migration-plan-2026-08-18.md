# 前端 React + TS 漸進遷移全盤計劃

日期：2026-08-18
狀態：進行中
角色分工：Claude（本計劃作者）負責產派工單與獨立驗收；Codex 負責實作；使用者負責轉貼 prompt、拍板與 push。

## 背景與依據

- 分析報告（Claude，10 agent 深讀＋三方辯論）：本文件的批次設計即其結論。
- 分析報告（Codex）：`docs/frontend-architecture-analysis-2026-08-18.md`，終點架構與逐頁順序採其建議。
- 病根：字串樣板＋innerHTML 整段重繪模型，逼出數百行焦點／pending／捲動補償與手刻競態防護。
- 終點：React（當前 stable）＋ TypeScript ＋ 現有 Vite；feature 資料夾結構；不上 Next.js、不換 bundler、不動 Supabase view/RPC 邊界與隱私紅線。

## 已拍板決策（2026-08-18）

1. 現在就開工，批次開發與首發 release checklist 並行；首發用現有已 QA 的 commit。
2. 兩個已驗證 bug（下方批 B）趕在首發前修。
3. 工具鏈：批 2 一次進 tsc gate ＋ ESLint ＋ Prettier，只掃新 .ts/.tsx，存量 .js 不回掃。

## 派工協定（每批固定流程）

1. Claude 產出自足式派工單，含四件套：**目標與動機／凍結白名單／驗收條件／回報格式**。
2. 使用者轉貼給 Codex；Codex 實作，**不 commit**，完成後把回報寫成檔案
   `docs/migration-reports/batch-<批號>.md`（內容要件同派工單的回報格式段），
   隨該批驗收後一起 commit 留審計軌跡；使用者只需告知 Claude 已完成。
3. Claude 獨立驗收：重跑 gate（Codex 自跑結果只當參考）、讀 diff、反向 grep、大 diff 加派 fresh agent read-back。
4. 驗收通過 → commit → 發下一批。不過 → 附失敗軌跡重派；同一批連兩次不過即停下重診斷，不無限重派。
5. 批次嚴格依序，不平行。testid、中文文案、容器 id 全程凍結，例外由該批派工單白名單明列。
6. 動到 CLAUDE.md／.claude/rules 描述範圍的批次（如工具鏈、測試機制），同批同步更新文件。

## 批次清單

### 批 B：首發前 bug 修正（完成，2026-08-18）

- (a) `sessionViews.js:1799`：分頁切換用掛載時 closure 的舊 options 重繪。per-root WeakMap 修法；
  驗收方獨立紅→綠（HEAD 紅、修正後 --repeat-each=3 綠）。
- (b) ~~隔離清單漂移~~ **重新定性為死碼**：批 D2 commit（c336e8c）明文拍板「抽屜非 modal、無 inert
  isolation」，`pushDrawerIsolation` 自此零呼叫者。原派工方向是驗收方框架錯誤（只驗 selector
  漂移、沒驗呼叫路徑）；B-fix 改為刪除死碼與兩個為它而寫的測試。
- 驗收紀錄：四 gate 由驗收方獨立重跑全綠（250＋42 passed）；回報檔 `docs/migration-reports/batch-B-fix.md`。
- 教訓入庫：定性 bug 前先驗呼叫路徑與 git 拍板紀錄，selector／欄位層面的漂移可能只是死碼。

### 批 0：測試債清償（引入編譯步驟前的前置）

實測盤點（2026-08-18 驗收批 B 時全面 grep）：
- 「編譯即死」×4——對 src/ 原始碼做文字改寫的 route fixture：`smoke.spec.js:17`
  installTaintedMockSessions（對 mockData.js 原文追加 taint 程式碼）、`smoke.spec.js:84`
  delayMockCourts（marker 字串替換注入延遲）、`performance.spec.js:38` delayMockDiscovery、
  `performance.spec.js:51` failFirstMockDiscovery。
- 「路徑耦合」×120+——tests 內 page.evaluate 直接 `import("/src/*.js")`，遍布
  smoke／performance／session 三個 spec，是 mock 套件的基本測試模式。
- 0a（**完成，2026-08-18**）：四處文字改寫 fixture 改顯式 test hook（未設 hook 時 prod 零差異；
  含消費自證 consumedCount/appliedCount 防「接縫被搬走→靜默假綠」）；122 處 `/src/` 動態 import
  收斂到 `tests/fixtures/appRuntime.js` 單一定義點。驗收紀錄 `docs/migration-reports/batch-0a.md`
  （含 0a-fix：消費自證補課＋撤回 route["fetch"] 的 grep 閃避寫法）。驗收方獨立脫鉤 canary 紅→綠
  ＋全 gate 重跑通過。教訓：驗收 grep 條件過寬會誘發「改寫語法閃避字面」，條件要對準機制而非字面。
- 0b：逐字掃描單元測試改行為式。實測盤點（2026-08-18）：
  (1) `session-data-boundary.test.js` LINE allowlist——deepEqual 斷言 8 組 {path, 原始碼整行}
  字面（含 import 行），拆檔／改 import 語法／formatter 換行即破；`line_id` 恰一次且路徑鎖死
  `src/dataApi.js`（批 2 拆檔即破）。
  (2) `session-create-form.test.js`——NTRP_SCALE_EXPLANATION 字面恰 1 次＋符號恰 4 次，
  鎖單檔 `sessionViews.js`。
  (3) `legacy-style-scan.test.js`——readdir 自動掃描設計良好，但副檔名 filter 只收 .css/.js，
  TS 進場後新檔自動漏掃，需擴 .ts/.tsx。
  目標：語意不弱化（新 LINE token 仍紅、literal 複製仍紅）、拆檔搬檔不誤報、掃描集非空自證。
- 0b（**完成，2026-08-18**）：LINE allowlist 改四類核可語意 pattern（span 覆蓋防同行搭便車＋
  殭屍 pattern 守門）、NTRP 改「全樹唯一定義＋消費端必 import/re-export」契約、legacy 掃描擴
  .ts/.tsx 且下限收緊到 23。驗收方獨立雙向 canary（三重違規全紅、拆檔消費端不誤報）＋全 gate
  重跑通過。回報 `docs/migration-reports/batch-0b.md`。
  **殘項（rider，併入批 1a）**：`line_id` 掃描收窄成只掃 src/——需補「public/ 樹 line_id 為零」
  斷言，恢復原本 src+public 全覆蓋。
- 驗收：韌性模擬（搬檔不紅）＋有牙 canary（違規必紅）雙向證明；全 gate 綠。

### 批 1：框架無關 vanilla 收斂（拆 4 小批，遷移後全數存活）

- 1a：統一 async 動作 helper（收斂 runMySessionAction 三胞胎與各 sheet 手寫 disabled/error/finally 樣板、withdraw 特例併回主路徑、24 處 root.contains guard 收斂進 helper）。
- 1b：統一 request guard（controller 7 個 counter＋32 處 requestId 樣板、main.js 9 處 epoch 樣板）與前景輪詢 poller（chat／discovery 兩套收斂為一）。
- 1c：surface registry（11 個 active-surface 把手＋11 支 closeActiveX 收斂為單一表＋宣告式關閉順序；setAuthState 關面邏輯改查表）。
- 1d：重複判準收斂（undecidedCandidate ×3、full/joinable ×3、haversine ×2、時區處理 ×3）；dataApi 讀寫錯誤形狀統一。
- 每小批獨立驗收 commit；contract 變動批跑完整 gate。

### 批 2：TS ＋ React 基建

- tsc --noEmit 進 gate（allowJs，存量 .js 不強制轉）；ESLint＋Prettier 只掃 .ts/.tsx；vite react plugin。
- domain 型別：SessionSummary、Profile、API response、surface 合約。
- **第一動作**：只轉一個最小檔上 TS，實測批 0 的新 fixture 在編譯輸出下存活，紅了就地修，才准全面開工（pre-mortem 1 的對策）。
- 同批更新 CLAUDE.md「無框架無 TS 無 linter」段落與本機驗證指令清單。

### 批 3–8：逐頁遷移 React（每批一頁/一 surface，絕不半頁混用）

順序：訊息頁 → 我頁 → 我的球局 → 詳情 sheet → 建立/編輯表單 → 探索與附近球局抽屜（地圖 adapter 保持命令式，React 只透過 adapter 操作）。

每批固定要求：該頁樣式一併搬 CSS Module；testid／文案／容器 id 凍結；對應 e2e 段落全綠；390px 視覺比對；混用期跨制契約（焦點、Escape、inert）規則寫進 `.claude/rules/`。

### 批 9：controller 狀態 store 化＋測試 harness 改接

- 25 欄 state ＋ 35 個 closure 變數收斂為 store；三通道更新（publish／notifyMySessions／surface 把手直呼）收斂為訂閱。
- 113 條 controller 單元測試：只改 harness 接線，不改斷言語意；爆了整批退回不影響已遷頁面（pre-mortem 3 的對策）。

### 批 10：CSS 收尾

- token/global 分檔、`@layer` 取代來源順序依賴、清除批次時序組織遺留的重複樣板（sheet grabber ×5、頁頭 ×3 等）。

## 明確不在 scope（另開 track）

- Codex 報告的 UI/UX 清單：桌面雙欄、篩選鈕固定、空狀態統一、86/94 文案、列表虛擬化、分頁狀態進 URL。
- 多城市／多運動擴充（需先過產品與資料權限決策）。

## Pre-mortem（已知最可能失敗點與對策）

1. 批 0 fixture 重設計無法在編譯輸出存在前實證 → 批 2 第一動作最小檔實測。
2. React 與 innerHTML surface 混跑期的焦點／Escape／inert 隱性契約 regression → 整頁為單位遷移＋e2e 焦點斷言守門＋規則落檔。
3. 批 9 harness 改接爆量 → 排最後、只改接線、可整批退回。

## 進度紀錄

- 2026-08-18：計劃建立；三項決策拍板；批 B 派工單已發。
- 2026-08-18：批 B（含 B-fix）驗收通過並 commit；批 0 盤點完成、0a 派工單已發。
- 2026-08-18：批 0a（含 0a-fix）驗收通過並 commit；0b 盤點完成（含 legacy-style-scan 副檔名
  漏掃 .ts/.tsx 的新發現）、派工單已發。
- 2026-08-18：批 0b 驗收通過並 commit（line_id public 覆蓋殘項轉 rider）；批 1a 派工單已發。
  流程備忘：Codex 於 local gate 前自行執行 guarded DB reset（testing 規則標準入口，屬合規），
  後續派工單改為明列此授權，避免默契依賴。
