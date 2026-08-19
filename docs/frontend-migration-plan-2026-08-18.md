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
- 批 8.2（**完成，2026-08-19**）：openFilterSheet → `src/sheets/FilterSheet.tsx`（286 行）。
  syncControls() 手寫同步與 surface click 委派退役；filters／result count 分離 state＋
  FilterControls memo＋穩定 callback（`filtersRef` 防 stale closure），setResultCount 不觸發
  chips 重繪、setFilters 保留聚焦 chip DOM identity（imperative probe `sameChipNode=true`）。
  handle `{ ...mounted, setFilters, setResultCount }` 以 content ref＋flushSync 包裝凍結；
  「不疊加 listener」由委派綁 surface 改為 React root 隨 surface 拋棄，e2e 三次開關專測不變綠。
  rider 完成：CourtPlayersSheet key 命名空間分離。驗收：幾何指紋三態逐值全同、雙 canary、
  五 lens read-back 32 項全 PASS（含 reset 時序批次語意與 memo 鏈論證）、七站 gate 綠。
  回報 `docs/migration-reports/batch-8.2.md`。
- 批 8.3（**完成，2026-08-19**）：openPlayerDirectoryList＋openPlayerCardSheet →
  `src/sheets/{PlayerDirectorySheet,PlayerCardSheet}.tsx`＋共用 `src/components/Avatar.tsx`。
  本批起實作者改為 Claude opus subagent（Codex token 用罄，user 拍板）。邀請表單狀態機
  忠實對映 runAsyncAction（superseded 用 mounted.root——surface.contains 於 detach 後恆真，
  偏離論證成立）；generation key 重現 innerHTML 置換清 radio；六個字串 helper 退役，
  avatarMarkup 留待批 8.4。probe serializer 升級為逐 text node 比對（抓到 JSX 複合文字拆分
  回歸並修正——前兩批 join(" ") 序列化會掩蓋此類差異，後續批沿用新 serializer）。
  驗收：幾何指紋逐 byte 相同、雙 canary（驗收方第一發假陰性：注入面要對準測試實際斷言的
  modifier class）、五 lens read-back 僅一 CONCERN（setDirectory(null) 整參數 null 由 HEAD
  crash 變容錯——裁決接受，latent hardening）、七站 gate 綠。
  回報 `docs/migration-reports/batch-8.3.md`（含驗收方註記 §16）。
  **rider（併批 8.4，已完成）**：MePage.tsx 與 SessionDetailSheet.tsx 各有私有 PlayerAvatar，
  DOM 與共用 Avatar 一致——已於批 8.4 退役 avatarMarkup 字串版時一併改用共用版。
- 批 8.4（**完成，2026-08-19**）：openProfileCompletionSheet → `src/sheets/ProfileCompletionSheet.tsx`。
  gate 判準零搬移（紅線 lens 全 PASS：profileGateForIntent／validateProfileForm／runAsyncAction
  全留 legacy，onSubmit 走批 7 {error,form,submit} 回呼）；setCourts 三條草稿語意凍結
  （live 勾選 capture／fallback 恆為開局 profile.courts／generation key 重現 innerHTML 置換）；
  avatar 收官（avatarMarkup／wireAvatarFallbacks／updateCourtCheckboxes 退役、兩檔私有
  PlayerAvatar 改共用版 DOM 零變更、Avatar 註解假陳述由驗收方修正）。
  驗收：幾何指紋六案例逐 byte 相同、雙 canary、五 lens read-back 僅 2 CONCERN（canary 後
  取證順序斷點＋註解假陳述，皆裁決接受並修正）、乾淨 DB 完整 gate 七站綠。
  **flaky 事故（root cause 與本批無關）**：test-local 的 notification court subscription 測試
  紅率隨驗收輪次攀升；二分實驗（HEAD 全檔同髒 DB 5/6 紅）定因**反覆 test:local 未 reset 的
  DB 資料累積**，guarded reset 後 6/6 綠。流程教訓入 memory：對照組實驗必控 DB 狀態變因；
  二分前先落 diff 備份（本次 checkout 失誤靠回報 SHA 重放恢復，byte 級一致）。
  回報 `docs/migration-reports/batch-8.4.md`（含驗收方註記 §17）。
- 批 8.5（**完成，2026-08-19**）：openDecideSessionSheet → `src/sheets/DecideSessionSheet.tsx`。
  **雙 writer 分界模式確立**：React 只擁有球場按鈕區＋status；controls／error／terminal／
  時間 input 以常數 prop 交付後由 legacy adapter＋runAsyncAction 維持 imperative 寫入
  （read-back 逐 patch 路徑攻擊無可達覆蓋）。decide／setCourts／setTerminal 本體 token 級
  零改；generation key 保 rerendered() 語意——實作 agent 的 probe 涵蓋宣稱經 read-back 證偽
  （in-flight 快照咬不住），驗收方臨時探針紅綠實證有牙（穩定 key 行為反轉）。
  流程升級：agent 自帶幾何指紋（19 案例×2 viewport）進 probe、probe 凍結 Date 防
  「未提供時間→用現在」假紅。驗收：三發 canary、四 lens read-back、七站 gate 綠。
  回報 `docs/migration-reports/batch-8.5.md`（含驗收方註記——由驗收方追加）。
  **rider（併批 8.6）**：generation key「in-flight 刷新不還原 controls」語意補持久測試
  （序列：click → setCourts → resolveDecide → 驗 disabled）。
  觀察項（PM）：session===null 時 decide 時間欄位顯示當下時間（既有行為，未修）。
- ✅ 批 8.6（2026-08-19，d4b8cd3）：openSessionChatSheet 群聊 sheet 遷 React
  （`src/sheets/SessionChatSheet.tsx`），sheet 批壓軸完成。feed／roster 以 generation key
  全重建重現 innerHTML 置換——捲動兩分支在兩案下皆等價（還原是顯式賦值），**唯一可觀察
  差異是焦點**，由 probe `focus-in-feed-lost-on-refresh` 咬住（穩定 key 下 mismatch 2 的
  反例實證，未重蹈批 8.5 空覆蓋宣稱）。composer 節點維持 DOM identity——批 8.5 雙 writer
  的鏡像案例（decide 要「必須重建」，chat 要「必須不重建」，同一條 rerendered() 規則的
  兩面）。archived 三 writer 與 announcement 計數留閉包；`.chat-roster` 外部注入屬性因
  React 不 diff 未宣告屬性而存活。composer submit／withdraw click 保留 native
  addEventListener（節點穩定下比改 React 事件更保守）。chatRosterMarkup／
  chatMessagesMarkup 退役（presentation 資料化留 sessionViews）。
  流程升級×2（後續批標配）：幾何指紋取樣前等 CSS 動畫 settle（qmSlide 噪音 1392 條
  假紅教訓）；被觀測面有 rAF 排程時 probe 要加兩幀 settle 再量（否則捲動還原分支假綠）。
  rider 收口：generation key 持久測試入 tests/smoke.spec.js（純新增 71 行），穩定 key 下
  detach＋行為兩斷言皆紅的證偽實證入報告。
  驗收：probe 18 案例×2 viewport 零差異、五發 canary 紅→綠（dev 四發＋驗收方
  data-chat-message-kind 一發）、read-back 五 lens 全 PASS 零 concern、兩輪七站 gate 綠
  （第二輪對驗收方修正 handleFeedClick 註解後的最終版）。
  回報 `docs/migration-reports/batch-8.6.md`（含驗收方註記）。
  觀察項（PM）：message.body／createdAt 為 undefined 時顯示字面 "undefined"（既有行為，
  未修）。
- ✅ 批 8.7（2026-08-19，e43f0b7）：mountDialog 系 openWithdrawSessionConfirmation＋
  openReportDialog 遷 React（`src/sheets/{WithdrawSessionConfirmationDialog,ReportDialog}.tsx`），
  **sessionViews 的 surface 遷移全數收官**。兩元件零 React state 零 effect——render 一生
  一次，結構上無 re-render 路徑，比「常數 prop diff 為空」更強的不變量；legacy imperative
  writer（error／form.hidden／success／disabled）與 runAsyncAction controls 因此天然安全。
  close reason `"complete"` 語意由 probe `closeReasons` 欄直接實測；「先不要」動作鈕與 ×
  同走 React onClick→mounted.close()，dev canary B 直接證偽「空殼下殼還會綁
  [data-surface-close]」。驗收：probe 15 案例×2 viewport 零差異、五發 canary
  （dev 四發＋驗收方 data-confirm-withdraw 接線錨點一發）、read-back 三 lens 全 PASS
  （唯一 concern＝runtime shallow freeze vs readonly 型別宣稱，裁決接受——全庫既有慣例
  非本批退化）、七站 gate 全綠。回報 `docs/migration-reports/batch-8.7.md`（含驗收方註記）。
  觀察項（PM）：smoke.spec.js:2780 只斷 dialog 殼不碰內容（既有覆蓋事實）；
  runAsyncAction clearError 不清 textContent（失敗文字 hidden 留存，既有行為）。
- ✅ 觀察項裁決（2026-08-19，user 拍板）：sheets.js 內 openLoginModal **不遷**——殼模組
  自身內容、單一靜態 dialog、零輪詢零 state，遷移收益趨零且要動殼模組凍結區；留 innerHTML，
  批 10 CSS 收整時一併檢視。

### 批 9：controller 狀態 store 化＋測試 harness 改接

2026-08-19 user 拍板：拆 **9a（store 化）→ 9b（harness 改接）** 兩子批依序；store 用
**自製 minimal store**（`src/sessionStore.ts`，subscribe／getState／set 約 50 行，
strict TS 零依賴——批 9 目標是收斂寫入通道不是引框架，React context 接法批 10 後再議）。

- ✅ 9a（2026-08-19，92152d6）：25 欄 state＋authEpoch 收斂 `src/sessionStore.ts`
  （54 行零依賴；**setState 只寫不派發、emit 顯式派發保序**——盤點證明 HEAD 四型態行為
  〔值未變仍派發／多欄批次寫／派發被中間呼叫切開／單面通知〕使「寫入即通知」定義上不可
  等價）；publish 24／notify 11 呼叫點逐行對位改薄轉發；setCourts 四行把手直呼收斂為
  courts 通道；其餘 13 個把手直呼判定為 command 原樣保留。**113 條原樣全綠達成**，9b
  的 harness 改接需求消失。核心證據＝行為序列 probe（17 步 124 筆 HEAD 對照逐次零差異）；
  四發 canary 中兩發（合併派發／繞過 store）僅 probe 可偵測——實證既有 113 條只有 3 處
  釘呼叫次數的覆蓋缺口。read-back 四 lens 全 PASS（跨 await 快取縫隙攻擊零命中）。
  回報 `docs/migration-reports/batch-9a.md`（含盤點附錄四項與驗收方註記）。
  觀察項（PM）：位置錯誤訊息字面重複 5 次可抽常數（dev 提出後主動回退，待拍板）。
- 9b：**原定「harness 改接」經 9a 證明不需要**；9b 改為承接 9a 留下的五項
  （setInvitableSessions 通道化＝行為變更、intentVersion 進 store、selector 訂閱、
  chat context 狀態化、序列 probe 常駐化＝需新增 tests/**），**每項皆需 user 拍板
  取捨後才發單**；批 10（CSS）不依賴 9b。

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
- 2026-08-19：批 8.2 驗收通過並 commit（47a42f6）——syncControls 模式退役，rider 收口；
  批 8.3（球友目錄＋球友卡）派工單已發。
- 2026-08-19：**管線角色變更**——Codex token 用罄，user 拍板實作者改為 Claude opus
  subagent（同 session 內派單→實作→驗收，「做事的 agent 不驗收」不變）。
- 2026-08-19：批 8.3 驗收通過並 commit（a4645c0）——probe serializer 升級入流程；
  PlayerAvatar 統一 rider 併批 8.4；批 8.4（profile completion sheet）派工單已發。
- 2026-08-19：批 8.4 驗收通過並 commit（b054148）——avatar 單一來源收官；test-local flaky
  定因 DB 累積並 reset 收口；批 8.5（decide sheet）派工單已發。
- 2026-08-19：批 8.5 驗收通過並 commit（0dc2cfc）——雙 writer 分界模式確立；generation key
  有牙紅綠實證；依 user 指示暫停派發，批 8.6（chat 壓軸）待 compact 後發單。
- 2026-08-19：批 8.6 驗收通過並 commit（d4b8cd3）——sheet 批壓軸收官，批 8.5 rider 收口；
  雙 writer 鏡像案例（composer 必須不重建）與焦點語意有牙實證；幾何指紋動畫／rAF settle
  兩教訓入流程。批 8.7（mountDialog 系兩 surface）派工單已發。
- 2026-08-19：批 8.7 驗收通過並 commit（e43f0b7）——**sessionViews surface 遷移全數收官**，
  零 state 純靜態模式確立。
- 2026-08-19：批 9 三題拍板（9a／9b 拆批、自製 minimal store、openLoginModal 不遷）；
  批 9a 派工單已發。
- 2026-08-19：批 9a 驗收通過並 commit（92152d6）——store 化完成、113 條原樣全綠、
  行為序列 probe 成為 controller 批的核心證據面。**9b 縮為五項留置項（每項需 user
  拍板）；批 10（CSS 收整）不依賴 9b,可先行**。
