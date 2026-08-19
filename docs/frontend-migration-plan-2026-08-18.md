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

- 1a（**完成，2026-08-18**）：單一 runAsyncAction helper 收斂三胞胎＋10 個手寫 call site；
  withdraw 併回主路徑（保留同 turn dialog／不鎖背景鈕語意）；root.contains 24→3（餘 3 處逐一
  論證合法）、submit.disabled 手寫 4→0；rider（line_id public/ 零斷言）一併完成。
  驗收：雙 canary（重繪偵測拔除→紅、public line_id→紅）＋四 gate＋fresh-agent diff read-back
  逐 call site 比對（ACCEPT-WITH-NOTES：三筆窄邊界差異裁定接受——microtask→同步求值、
  錯誤渲染加重繪 gate（與新 markup 權威原則一致，舊行為是寫入 detach 節點的隱形 no-op）、
  create submitting gate 理論不可達；另修掉 chat 潛在強制解鎖 bug）。
  回報 `docs/migration-reports/batch-1a.md`。
- 1b（**完成，2026-08-18**）：新增 `src/requestGate.js`（createRequestGate 的 issue/capture/
  invalidate 三語意＋createForegroundPoller）；controller 7 counter＋requestId 32 處→0、
  main.js 9 處 epoch 樣板→0、openPlayer 三連抄→單一 predicate、兩套輪詢→共用 poller。
  tests/ 零改動全綠。驗收：雙 canary（永不過期→競態測試紅、拔前景條件→輪詢測試紅）＋四 gate＋
  read-back 逐站點審查（issue/capture 配對 40+ 站點零配錯；唯一真實差異：participation 重疊競態
  的第二 guard 補上了舊版漏掉的 counter 檢查——裁定接受，屬本批目標內的 latent race 修復）。
  回報 `docs/migration-reports/batch-1b.md`。
- 1c（**完成，2026-08-18**）：createSurfaceRegistry＋SURFACE_TRANSITIONS 宣告式轉場表；
  11 支 closeActiveX、16 個 active 變數、36 條直接 null 清理全歸零；setAuthState 關面改查表。
  tests/ 零改動全綠。驗收：轉場表 canary（移除一面→帳號切換測試紅）＋四 gate＋read-back
  （39 個 close/release 呼叫點 1:1 對照零漏；decision/edit hand-off 多清 confirmingAuth 經
  獨立驗證為不可達差異、屬防禦性改良，裁定接受）。回報 `docs/migration-reports/batch-1c.md`。
  **殘項（rider，併入批 1d）**：transition() 的 release 分支會把 options 落到 expected 參數位
  （現行不可達的 latent API 陷阱），需加防呆＋最小測試。
- 1d（**完成，2026-08-18**）：新增 `src/sessionCriteria.js`（候選/滿員/可加入/haversine 唯一定義）
  與 `src/taipeiTime.js`（台北時間唯一實作）；重複鏡像全歸一（候選 10→1、full/joinable 4→1、
  haversine 2→1、時區 3 套→1）；dataApi 18 處裸拋統一為 DataApiError（name/message/code/cause
  全保留，read-back 逐 caller 消費點核實零可見差異）；1c rider 防呆完成。tests/ 零改動全綠。
  驗收：雙 canary＋四 gate＋read-back（六筆差異全證不可達；controller Number(null)=0 滿員誤判
  順勢修正）。回報 `docs/migration-reports/batch-1d.md`（含驗收方 tally 修正註記）。
- **批 1 全部完成（B、0a、0b、1a-1d，2026-08-18）**——vanilla 收斂階段結束，下一站批 2。
- 每小批獨立驗收 commit；contract 變動批跑完整 gate。

### 批 2：TS ＋ React 基建（**完成，2026-08-18，經一次 REJECT→fix**）

實績：districts.js→ts spike（importer 慣例＝明寫 `.ts`）、批 0 fixture 編譯輸出下 15/15 存活、
tsconfig（strict/allowJs/Bundler）、ESLint flat＋Prettier（只掃 .ts/.tsx）、typecheck 掛
pretest:mock/local、react+react-dom＋vite plugin（production bundle 與批 1d **byte-identical**，
隔離 worktree cmp 驗證）、`src/domainTypes.ts`（read-back 欄位級不符＝零）、CLAUDE.md/testing.md
同步。**REJECT 事故**：轉檔漏掃 scripts/ consumer，`npm test` 的 pretest seed check 斷鏈——
Codex 與驗收方的 gate 清單都沒含 `npm test`，由 read-back 抓出；2-fix 單行修復＋全 repo sweep
補課。流程修正：驗收 gate 清單自此必含 `npm test`。
批 3+ 備忘（read-back 留）：(a) tsconfig types 只鎖 vite/client，用到 node API 要補
@types/node；(b) tests/ 不在 typecheck include；(c) 缺 eslint-plugin-react-hooks，批 3 必補；
(d) no-explicit-any 在遷移未型別化碼時會擋路，屆時逐案處理不裸關。

原始規劃（留檔）：

- tsc --noEmit 進 gate（allowJs，存量 .js 不強制轉）；ESLint＋Prettier 只掃 .ts/.tsx；vite react plugin。
- domain 型別：SessionSummary、Profile、API response、surface 合約。
- **第一動作**：只轉一個最小檔上 TS，實測批 0 的新 fixture 在編譯輸出下存活，紅了就地修，才准全面開工（pre-mortem 1 的對策）。
- 同批更新 CLAUDE.md「無框架無 TS 無 linter」段落與本機驗證指令清單。

### 批 3–8：逐頁遷移 React（每批一頁/一 surface，絕不半頁混用）

順序：訊息頁 → 我頁 → 我的球局 → 詳情 sheet → 建立/編輯表單 → 探索與附近球局抽屜（地圖 adapter 保持命令式，React 只透過 adapter 操作）。

每批固定要求：testid／文案／容器 id／class／DOM 結構凍結；既有 e2e 斷言零修改全綠；
390px 視覺比對（驗收方以 stash 基準對照）；混用期規則見 `.claude/rules/react-migration.md`。
**修正（2026-08-18）**：原「每批樣式搬 CSS Module」與 class 凍結矛盾——頁面批一律沿用既有
全域 class，CSS 收整統一延到批 10。

- 批 3（**完成，2026-08-18**）：訊息頁 → `src/pages/MessagesPage.tsx`。頁面批固定模式確立：
  adapter 簽名凍結（renderMessagesPage 內部改 React mount）、WeakMap per-root createRoot＋
  flushSync 同步 commit、eager glob 讓 Node unit tests 免改。main.js 與 tests 零改動。
  驗收：390px 視覺比對（stash 基準，逐元素一致）＋React 接管 canary＋完整 gate＋read-back
  （markup 逐屬性保真 PASS，唯一差異為無 consumer 的 whitespace text node）。
  bundle 首含 React（+62.7KB gzip）。回報 `docs/migration-reports/batch-3.md`。
  **rider（併入批 4）**：(a) MySessionSummary 繼承的 candidateCourtIds 對 mapMySession 過度
  承諾——改 Omit 或補欄位；(b) messagesFromGroups 在 sessionViews 的 exported 版已是死副本
  （UI 用 TSX private 版、unit test 測死副本）——收斂為單一來源並把測試指向活版。
- 批 8（**完成，2026-08-19**）：探索與附近球局抽屜 → `src/pages/NearbySessionsDrawer.tsx`
  （掛 index 持久 map-page 節點的 page-bound static mount，無 sheet 殼，故入 pages/ 非 sheets/）。
  generation remount 沿批 4 模式，逐項對照表論證與 innerHTML full-detach 契約等價（焦點
  intent、stale card、native listener 生命週期、`.nearby-drawer__scroll` scrollTop 歸零）；
  焦點／Escape 兩層讓位／AbortController 全留 legacy adapter，TSX 零 effect 零事件 props；
  sessionCardPresentation／drawerSessionGroups／discoveryEmptyActions 抽為 frozen
  `nearbySessionsDrawerRuntime` 單一來源，legacy sessionCard() 字串版共用同一 presentation。
  rider 完成：updateCourtSelect／selectedCourtValues 死碼刪除（反向 grep 零 match）。
  驗收：390px 幾何指紋兩態（open 21 組／collapsed 5 組 rect＋樣式）HEAD 對照逐值全同、
  雙 canary（Codex render(null)＋驗收方 session-card testid 注入，各自紅→綠）、五 lens
  read-back（markup／adapter 契約／焦點-Escape／回報覆核／TSX 品質）34 項全 PASS、完整
  gate 七站綠；Codex 另附八態 DOM 逐屬性 probe 8/8。回報 `docs/migration-reports/batch-8.md`。
  **批 3–8 主線收官**；剩餘 sheet/dialog 見批 8.x 盤點。
- 批 7（**完成，2026-08-18**）：建局／編輯表單 → `src/sheets/CreateSessionSheet.tsx`＋
  `EditSessionSheet.tsx`。sync() 手寫 reconciliation 退役（19 條對映表，read-back 抽驗 14 條
  無漏）；自由文字欄位 uncontrolled（defaultValue＋ref、submit 讀值），IME 安全經結構驗證＋
  驗收方實測（composition 事件＋實際打字，節點/焦點/值/selection 全保留）；五個凍結純函式
  byte-identical；keyed detach 落實（form/done 常駐 sibling 切 hidden、語意鈕不重用）。
  視覺比對升級為幾何指紋數值比對（六元素逐 pixel 相同）。sessionViews 淨 -424 行。
  rider（併批 8）：updateCourtSelect/selectedCourtValues 已零 caller 的 dead code 清除。
  回報 `docs/migration-reports/batch-7.md`（含驗收方八欄誤數修正）。
- 批 6（**完成，2026-08-18**）：詳情 sheet → `src/sheets/SessionDetailSheet.tsx`（第一個 sheet 批，
  模式入規則檔）。殼/內容分界：mountSheet 保有 surface 殼全責，React 只掛 .session-detail 內容槽，
  [data-surface-close] 由 adapter 補線（等價性 read-back 逐位驗證）。五態 actions 用
  actionGeneration keyed detach（同態重入也遞增）——**Codex 自抓一個 reconciliation bug**：
  submitting 確認鈕被 index 比對重用成 success CTA、舊 native listener 誤發第二個 join RPC，
  keyed detach 根治並留 submitting guard 當第二道防線。memo 穩定性（stage 切換不動
  DetailMain/JoinPreview、setJoinPreview 不動 actions）經 read-back 引用鏈論證成立。
  驗收：390px 視覺比對（sheet 開啟態）＋canary＋完整 gate＋read-back 七項全 PASS。
  微 rider（併批 7）：NTRP 格多餘 {" "} 空白節點；initialSnapshot 的 actionGeneration 型別
  應標 optional。回報 `docs/migration-reports/batch-6.md`。
- 批 5（**完成，2026-08-18**）：我的球局頁 → `src/pages/MySessionsPage.tsx`（e2e 最重頁，
  smoke 45 處直呼）。generation remount＋wireMySessionsPage native 接線兼容層：segment 按鈕
  刻意用 native listener（非 React onClick）保住批 B「detached 按鈕佇列 click 讀最新 options」
  契約；pending 三段式與 12 個 wire callback 逐 key 凍結。main.js/index.html/CSS/tests 零 diff。
  驗收：390px 視覺比對＋canary＋批 B 契約 3/3＋完整 gate＋read-back（七項全 PASS；
  actionScopeKey 疑慮排除——HEAD 本就取自 options）。未來 rider：resolveMySessionsSegment
  副作用在 render 內，StrictMode/concurrent 導入前要遷出。回報 `docs/migration-reports/batch-5.md`。
- 批 4（**完成，2026-08-18**）：我頁 → `src/pages/MePage.tsx`（控制項密度最高頁）。與批 3 的
  關鍵差異：**generation remount**（每次 adapter 呼叫以新 key 整樹重建），精確重現 innerHTML
  detach 語意——main.js 焦點機制、syncPendingMySessionActions、defaultChecked 權威覆蓋三者
  都依賴它；read-back 判定此設計是必要而非偏差。helper 走 sessionViews 的 mePageRuntime
  單一來源（14 個，零複本）；兩 rider 完成；main.js/index.html/CSS/tests 零 diff。
  驗收：390px 視覺比對＋canary＋完整 gate＋read-back（markup 逐屬性 PASS）。
  **流程教訓**：驗收方 canary 與 read-back agent 並行改到同一檔，agent 中途看到 canary 殘影
  ——自此 canary 一律在派 read-back 之前或之後執行，agent 進行中凍結工作樹。
  回報 `docs/migration-reports/batch-4.md`。

### 批 8.x：剩餘 sheet／dialog 遷移（盤點 2026-08-19，批 9 前收齊）

盤點基準：`rg "mountSheet\(|mountDialog\(" src/`。已遷 3 個 sheet（詳情／建局／編輯）；
剩餘 11＋1 個 innerHTML surface，全數沿 sheet 批固定模式（mountSheet 殼不動、React 只掛內容槽）。
建議切批（小→大、相依同批；順序可由 user 調整）：

- 批 8.1（**完成，2026-08-19**）：openCourtSessionDrawer＋openCourtPlayersDrawer＋
  openSessionUnavailableSheet → `src/sheets/{CourtSessionSheet,CourtPlayersSheet,
  SessionUnavailableSheet}.tsx`；共用 `src/components/SessionCard.tsx`（compact prop，
  modifier class 只由 presentation 輸出），NearbySessionsDrawer 改用共用版 DOM 零變更；
  sessionCard()／sessionTimeTileMarkup() 字串版退役。殼分界确立：`html: ""` 空殼＋factory 內
  flushSync 掛內容，rAF 初焦時內容已在；close 鈕 onClick→mounted.close() 與 HEAD 的
  [data-surface-close] listener 同 reason 預設（click event 解構取預設，等價論證入 read-back）。
  驗收：幾何指紋（nearby 對批 8 存檔＋三 surface HEAD 對照）逐值全同、雙 canary、五 lens
  read-back 僅一 CONCERN、七站 gate 綠。回報 `docs/migration-reports/batch-8.1.md`。
  **rider（併批 8.2）**：CourtPlayersSheet.tsx:74 key fallback 用裸 index，與純數字 profileId
  命名空間相交（實際不可達，僅 dev 警告面）——改複合 key 比照 CourtSessionSheet.tsx:44。
- 批 8.2：openFilterSheet（:3038）——六 data-filter groups，e2e 覆蓋最密的 sheet。
- 批 8.3：openPlayerDirectoryList（:2949）＋openPlayerCardSheet（:3218）——球友系相依
  （目錄開球友卡）。
- 批 8.4：openProfileCompletionSheet（:2314）——三級 gate 表單，沿批 7 uncontrolled 模式。
- 批 8.5：openDecideSessionSheet（:2698)——候選定案表單。
- 批 8.6：openSessionChatSheet（:1569）——最大（feed＋輸入＋輪詢），壓軸。
- 批 8.7（或併入 8.1 當 rider）：mountDialog 系 openWithdrawSessionConfirmation（:2094）＋
  openReportDialog（:2137）。
- 觀察項：sheets.js 內 openLoginModal（:175）屬 surface 殼模組自身內容，是否遷移待批 8.x
  收尾時再議，不擋批 9。

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
- 2026-08-18：批 1a（含 rider）驗收通過並 commit；批 1b 派工單已發。
- 2026-08-18：批 1b 驗收通過並 commit（差異 A 裁定為 latent race 修復並接受）；批 1c 派工單已發。
- 2026-08-18：批 1c 驗收通過並 commit（transition release 參數位陷阱轉 rider）；批 1d 派工單已發。
- 2026-08-18：批 1d 驗收通過並 commit——**批 1 收官**；批 2（TS＋React 基建）派工單已發。
- 2026-08-18：批 2 首輪 REJECT（read-back 抓到 scripts/ consumer 斷鏈）→ 2-fix 通過並 commit；
  驗收 gate 清單升級（必含 `npm test`）；批 3（訊息頁 React 遷移）派工單已發。
- 2026-08-18：批 3 驗收通過並 commit——第一個 React 頁面上線，頁面批模式與視覺比對流程定型；
  兩條 rider 併批 4；批 4（我頁）派工單已發。
- 2026-08-18：批 4 驗收通過並 commit（generation remount 模式入庫；canary 與 read-back
  並行的流程教訓入檔）；批 5（我的球局頁）派工單已發。
- 2026-08-18：批 5 驗收通過並 commit——頁面三連戰完成（訊息/我/我的球局）；批 6（詳情 sheet，
  第一個 sheet 批）派工單已發。
- 2026-08-18：批 6 驗收通過並 commit（sheet 批模式入規則檔；keyed detach 防 stale listener
  教訓入檔）；批 7（建局／編輯表單）派工單已發。備忘：批 8 之後仍有 chat／filter／decide／
  profile／report／player 系列 sheet 未遷，屆時以批 8.x 逐一列批。
- 2026-08-18：批 7 驗收通過並 commit（IME 實測＋幾何指紋比對入流程；dead code rider 轉批 8）；
  批 8（探索與附近球局抽屜）派工單已發。
- 2026-08-19：批 8 驗收通過並 commit（4f60ad8）——**批 3–8 主線收官**，rider 死碼清除完成；
  剩餘 11＋1 個 sheet/dialog 盤點入批 8.x（8.1–8.7 建議切批），批 8.1 待拍板後發派工單。
- 2026-08-19：批 8.1 驗收通過並 commit（7653324）——sessionCard 單一來源收官；players key
  fallback 疵點轉 rider 併批 8.2；批 8.2（filter sheet）派工單已發。
