# 前端架構優化派工單（2026-08-22）

來源：`docs/frontend-architecture-analysis-2026-08-22-claude.md`（經 codex 複測、v2 修訂）＋
`docs/frontend-architecture-analysis-2026-08-22-codex.md`（22 條主張 19 CONFIRMED/3 PARTIAL）。
兩份分析方向收斂，本單是可執行化的合併版。

分工：使用者指派 → codex 開發 → Claude 驗收。
派工基準 commit：`8213d33`（驗收時以此比對）。

## 拍板紀錄（2026-08-22，使用者採納 Claude 建議）

| 決策 | 裁決 | 生效方式 |
| --- | --- | --- |
| F3-0 規則修訂 | 原則核可 | 批 2 驗收通過後才執行；只放寬 surface stack 歸屬與 AppShell 接管區的 DOM 凍結，**testid 凍結保留** |
| F4-5 CSS @layer | **不翻案**，維持 batch-10 決策 | 項目撤銷；只保留 F4-4 token 單一來源 |
| F4-6 錯誤監控廠商 | **Sentry 免費方案** | 即日可派工；SDK 必須 lazy load、beforeSend 強制三欄 allowlist |
| openLoginModal 遷 React | **翻案核可** | 不單獨派工，併入 F3-2 範圍 |
| TanStack Query | 維持「TS 化後再議」 | 且屆時預設不引入，除非批 2 後有實際痛點提案 |

---

## 總則（每一批都適用）

**不可破壞（驗收一票否決）**：

1. CLAUDE.md 全部產品／隱私紅線（LINE 退役面、匿名公開面欄位、presence/GPS、
   `dataApi` 唯一資料邊界、`p_line_id: null` 凍結呼叫點）。
2. 單一 React root（全 src 僅 `src/app/App.tsx` 一處 `createRoot`，有守門測試）。
3. mock 排除三層防護（production alias／`mockData.empty.js` 契約／dist 黑名單掃描）。
4. `sheets.js` a11y 殼的行為契約（focus trap、Escape stack、inert、關閉焦點回復）——
   殼的歸屬變更只允許出現在批 3 且需先修規則（見 F3-0）。
5. 既有測試不得為變綠而刪改；GOLDEN 重錄須逐筆說明變因（檔頭紀律）；
   凍結測試（計數斷言、legacy-style-scan、contrast-tokens）的調整須在回報中單獨列節。

**回報交付形式（2026-08-22 起適用所有批次）**：回報一律寫成文件
`docs/arch-dispatch-2026-08-22-frontend-execution-report-<批次>-codex.md`（結構比照批 0 回報），
不列入實作 commit、不執行 push；驗收後由驗收方連同驗收紀錄一起收錄提交。

**回報格式（每項）**：

- 改了什麼（檔案清單＋每檔一句話）。
- 驗收條件逐條對照：每條附**指令＋實際輸出**（不是「已確認」三個字）。
- 技術陳述帶 [已驗證]／[推論]／[不確定] tag；「已刪除／已歸零」類聲稱附反向 grep 輸出。
- 動到守門類配置（lint 規則、gate、CI）時，附一個 canary 證明它會變紅（存量全綠不算證據）。
- 未做／做不了的項目明說原因，不可留白。

**每批收尾必跑**：`npm run test:ci:frontend`（含 typecheck/lint/prettier/單元/Playwright
mock/build/bundle gate）全綠，輸出貼進回報。

---

## 批次相依

```
批 0（安全網，項目間互相獨立，可平行）
  └→ 批 1（React 訂閱化；依賴 F0-1 的 DOM 單元層先落地）
       └→ 批 2（拆檔＋TS 化；依賴批 1 移除 remount 後的穩定 view 層）
            └→ 批 3（AppShell＋導覽；依賴 F3-0 規則修訂先行）
批 4（效能與收尾）：F4-1/F4-2/F4-4/F4-6 隨時可做；F4-3 依賴批 2；F4-5 已裁決不做
文件批 D：隨時可做
```

---

## 批 0：安全網（低風險、高槓桿，全部可獨立指派）

### F0-1 DOM 單元測試層

- **目標／動機**：view 層目前零單元級安全網（無 jsdom；controller 測試把 render 換成
  記錄用 fake），焦點與 sheet 行為只由單 worker Playwright 守——批 1、2 的 view 重構
  需要更快的回饋層。
- **作法**：happy-dom 或 jsdom ＋現有 `node --test`（不引入 vitest）。先覆蓋：
  `sheets.js` 殼契約（mount/close 順序、Escape、focus trap、`registerUnmount` teardown）、
  `filters.js` 之外至少一個頁面的渲染與 wire 行為。
- **驗收**：新測試檔納入 `test:session-unit` 清單（`ci-config.test.js` 的防漏列斷言會查）；
  故意注入一個殼契約破壞（如調換 unmount/innerHTML 清理順序）證明新測試會紅（canary）；
  `npm run test:ci:frontend` 全綠。

### F0-2 死碼清除（四件）

- **目標／動機**：`sessionViews.js` 內零 caller 的 `renderDiscoveryEmpty`（其 innerHTML
  插值未過 `esc()`，留著是陷阱）、`successPushPromptMarkup`、`sessionHostInitial`、
  `dialogFocusable`。
- **Ground truth**（2026-08-22 反向 grep，僅定義行命中）：sessionViews.js:982/673/667/318。
- **驗收**：四符號與其 import/export 全刪；回報附刪除後 `grep -rn <symbol> src tests scripts`
  的空輸出（`sessionHostInitial` 允許 `MessagesPage.tsx` 命中——那是活的本地版，
  由 F0-3 處理）；`npm run test:ci:frontend` 全綠。

### F0-3 presentation helper 複本收斂

- **目標／動機**：`MessagesPage.tsx` 四個本地複本違反 react-migration「單一來源」規則。
- **Ground truth**：`taipeiDayWord`／`sessionVenuePresentation` 重複
  `sessionPresentation.ts:172/216`；`sessionScheduleLabel`／`sessionHostInitial` 重複
  `sessionViews.js:656/667`（`sessionPresentation.ts` 反向 grep 無後兩者）。
- **作法**：後兩者提升進 `sessionPresentation.ts`（單一來源），`MessagesPage.tsx` 與
  `sessionViews.js` 皆改 import；前兩者直接刪本地版改 import。
- **驗收**：`grep -n "function taipeiDayWord\|function sessionScheduleLabel\|function sessionHostInitial\|function sessionVenuePresentation" src/pages/MessagesPage.tsx` 空輸出；
  訊息頁 UI 文案零變化（Playwright mock 全綠）；不得反向 import `sessionViews.js`
  （session-presentation-boundary 測試會查）。

### F0-4 focusable selector 收斂（**ACCEPTED** 2026-08-25，`84a7131`，驗收紀錄 `docs/arch-reports/batch-F0-tail-docsD-acceptance-2026-08-25.md`）

- **目標／動機**：同一 selector 字串三份逐字複本（sheets.js:11、sessionViews.js:319〔死碼，
  F0-2 刪〕、sessionViews.js:1171），調整 focus trap 判準要改三處。
- **驗收**：`sheets.js` 匯出單一常數，餘處 import；
  `grep -rn "button:not(\[disabled\])" src/ | wc -l` 由 3 降為 1；focus 相關測試全綠。

### F0-5 lint／format 覆蓋擴張＋type-aware＋邊界規則

- **目標／動機**：7,867 行核心 .js 目前 typecheck／lint／prettier 三不管；ESLint 非
  type-aware 抓不到 `no-floating-promises` 這類 async RPC 專案最值錢的錯。
- **作法**：(a) lint/prettier 範圍擴到 `src/**/*.js`、`tests/`、`scripts/`、根設定檔
  （存量 .js 可先只套基本規則＋format）；(b) ts/tsx 升 `recommendedTypeChecked`＋
  projectService，優先收 `no-floating-promises`／`no-misused-promises`；
  (c) `no-restricted-imports` 禁止 `src/**`（`src/data/**` 除外）直接 import
  `supabaseClient` 與 `src/data/mappers|repositories` 深路徑。
- **凍結**：不為 lint 合規改寫存量 .js 邏輯；規則衝突以 disable 註記＋回報列表，不悄悄改碼。
- **驗收**：三個 canary（一個 floating promise、一個越界 import、一個未 format 的 .js）
  各自使對應檢查變紅，附輸出；`npm run test:ci:frontend` 全綠；`package.json` scripts
  的範圍變更同步 `ci-config.test.js`。

### F0-6 Node 版本前提工具化（**ACCEPTED** 2026-08-25，`4b3ece5`，同上驗收紀錄）

- **目標／動機**：單元測試以 node:test 直載 .ts，依賴 Node 22.18+ type stripping，
  目前無 engines／.nvmrc 護欄。
- **驗收**：`package.json` engines（`>=22.18`）＋`.nvmrc`；`ci-config.test.js` 加斷言。

### F0-7 靜態掃描計數斷言改清單推導（P2，可延後）

- **目標／動機**：14 個 sheet／eager 恰 2 等魔術數字散在多個測試檔，合法新增 sheet
  要同步改多處。
- **驗收**：單一清單常數餵 `react-surface-lifecycle` 與 `session-presentation-boundary`；
  故意在清單外加一個 sheet 檔證明仍會紅（canary）。

### F0-8 ci-config 分支名解耦（P2，可延後）

- **驗收**：分支名從單一常數或 workflow 推導；開新分支只改一處。

### F0-9 同步 commit 邊界收斂＋守門（2026-08-24 新增，獨立派工單）

- **由來**：批 1 驗收查出 F3-2 的「`flushSync` 僅剩兩處」是量錯東西的代理指標
  （三處是同一道 imperative 相容邊界的三個入口，且該邊界被 138 個 e2e 白箱直呼點
  釘死，批 3 一處也拿不掉）。詳見 `docs/arch-reports/batch-F1-acceptance-2026-08-24.md` §三.1。
- **派工單**：`docs/arch-dispatch-2026-08-24-frontend-F0-9.md`（完整目標、ground truth、
  驗收條件與 canary 要求都在該檔）。
- **摘要**：三處 `flushSync` 收斂成單一葉子模組＋`no-restricted-imports` 禁越界
  ＋呼叫點允許清單的 fail-closed 靜態守門。純重構，行為零變化。
- **狀態**：**ACCEPTED**（2026-08-24，含補件）。實作 `a3dac96`＋補件 `e7f7056`；
  驗收紀錄 `docs/arch-reports/batch-F0-9-acceptance-2026-08-24.md`。
- **與 F3-2 的關係**：F3-2 的 flushSync 驗收條件已依本項結果改寫（見下方 F3-2）。

---

## 批 1：React 訂閱化（治本的一刀；F1-1〜F1-4 建議同一人連續做）

### F1-1 store 訂閱 hook

- **目標／動機**：React 端零訂閱，重繪靠 main.js 依 activePage 的手動呼叫網，
  漏接即 silent stale（main.js:1444 註解自承隱藏頁殘留風險）。
- **作法**：`sessionStore` 暴露 subscribe 介面＋`useSyncExternalStore` hook
  （依通道＋selector）；頁面元件直接訂閱，main.js 的 `renderXDestination`
  分派鏈逐步退役。**不引入 Redux／Zustand／TanStack Query**（既有延後決策）。
- **驗收**：main.js 中依 activePage 分派重繪的呼叫點清零或僅剩地圖層
  （附前後 grep 計數）；跨帳號切換後隱藏頁無殘留（既有 e2e 全綠）；
  「值沒變仍要重畫」契約的變更逐通道列出並對照 GOLDEN 紀律。

### F1-2 移除頁面 generation-key remount

- **目標／動機**：`App.tsx:345` 每次 adapter render 都 generation+1 當 key，整棵 remount
  摧毀 React 狀態與焦點；此為數百行手工焦點機制的根因。範圍限四個頁面 slot
  （sheet 已是穩定 slot id，不動）。
- **作法**：穩定 key＋props 更新；error boundary reset 改顯式 resetKey。
- **驗收**：`grep -n "key={slot.generation}" src/app/App.tsx` 空輸出；
  react-unmount.spec／error-boundary.spec 全綠；焦點行為由 F0-1 的 DOM 單元層
  ＋既有 e2e 驗證。

### F1-3 事件收編：wire 層退役

- **目標／動機**：MySessionsPage／NearbyDrawer 按鈕只輸出 `data-*`、由 sessionViews
  在每次 commit 後 querySelector 重綁（sessionViews.js:770），callback 明明在 props 裡；
  selector 漂移即 silent fail。CreateSessionSheet 已證明 React onClick 型態可行。
- **驗收**：`wireMySessionsPage`／`wireSessionCards` 整層刪除（附反向 grep）；
  對應 `data-my-action` 讀回邏輯刪除；e2e 斷言的 testid／DOM 契約不變（凍結規則）；
  全部測試綠。

### F1-4 焦點機制退役

- **目標／動機**：F1-2/F1-3 落地後，main.js 的 captureMeFocus／restoreMeFocus／
  captureMySessionsFocus／suppressMeFocusRelease 與 sessionViews 的 WeakMap 焦點
  ／捲動還原機制失去存在理由。
- **驗收**：機制刪除後附反向 grep；me-focus.test.js 等既有焦點測試改寫或保留的
  決策逐檔說明；390px 鍵盤走查（e2e）綠。

### F1-5 MePage controlled 化

- **目標／動機**：MePage 是 React 元件卻經 rootElement querySelector 讀寫 checkbox
  ／hidden（MePage.tsx:359-399），真實狀態存在 DOM、兩個 writer 並存。
- **驗收**：`grep -n "rootElement.querySelector" src/pages/MePage.tsx` 空輸出；
  通知偏好／球場訂閱／presence 開關行為與現況一致（e2e 綠）。

### F1-6 join 狀態機收進 SessionDetailSheet

- **目標／動機**：join 五態被劈成兩半——React 只重繪、stage 與 wireIdle/wireConfirming
  等接線留在 sessionViews（sessionViews.js:1365）。
- **驗收**：stage 狀態與四個 wire* 收進元件（useState＋onClick）；
  Escape 在 confirming 態退回 idle 不關 sheet 的契約保留（有既有測試）。

### F1-7 GOLDEN 過渡解析度

- **目標／動機**：124 筆逐字派發指紋與訂閱化幾乎必然衝突；為批 1 提供過渡保護而非整表作廢。
- **驗收**：先降成「通道＋次數」粗指紋（保留檔頭重錄紀律），批 1 完成後升回全
  payload 表；兩次變更各附逐筆變因說明。

---

## 批 2：拆檔＋TS 化（沿既有縫線）

### 批 2 切分與順序（2026-08-24 使用者拍板）

批 2 拆成**四張派工單依序執行**，每張獨立驗收後才發下一張（避免 ground truth 過時）：

| 派工單 | 範圍 | 狀態 |
| --- | --- | --- |
| **2A** 型別鏈地基 | F2-5 (a)(b)(c)(d) | 已發：`docs/arch-dispatch-2026-08-24-frontend-F2A.md` |
| **2B** 小項打包 | F2-6／F2-7／F2-8／F2-9 ＋ `drawerScrollPositions` 退役 ＋ `me` 通道補進 GOLDEN 指紋 | 已發：`docs/arch-dispatch-2026-08-24-frontend-F2B.md`（F1R 與 2A 均 ACCEPTED 後） |
| **2C** controller 拆分＋auth 差分 | F2-1 ＋ F2-2 | **ACCEPTED**（2026-08-24，`docs/arch-reports/batch-F2C-acceptance-2026-08-24.md`） |
| **2D** view 層拆分 | F2-3 ＋ F2-4 ＋ `onBeforeStoreChange` churn ＋ 命名殘留清理 | **ACCEPTED**（2026-08-24，`docs/arch-reports/batch-F2D-acceptance-2026-08-24.md`） |

**2A 驗收結果（2026-08-24）**：條件式退件三項——RPC 參數被新增的 `as never` 完全跳過
型別檢查、`src/data/index.ts` barrel 開了 facade 繞路（page 可拿到 `createDataApi`，
lint 與 typecheck 全綠）、兩處 `?? sessionId` 行為變更未揭露。
補件單 `docs/arch-dispatch-2026-08-24-frontend-F2A-followup.md`，
驗收紀錄 `docs/arch-reports/batch-F2A-acceptance-2026-08-24.md`。

**F1R 插隊在 2A 補件之前（2026-08-24 拍板）**：2A 驗收時查出
`npm run test:local` 的紅燈是**批 1 `a27b91f`（F1-1）引入的迴歸**
（建立球局後鍵盤焦點不落到新卡片），二分確認、非 flaky、非 fixture 污染，
且該紅燈使 31 個 `test:local` 測試從不執行。
派工單 `docs/arch-dispatch-2026-08-24-frontend-F1R.md`。
執行順序改為 **F1R → 2A 補件 → 2B → 2C → 2D**：2C／2D 要動的正是 controller 與 view
的 render／focus 路徑，而唯一會跑真 RPC 的安全網（也是唯一能抓 2A 那個 RPC 參數洞的
測試套件）在 F1R 修好之前是死的。

**F2-1 的形狀（拍板）**：保持單一 `createSessionController` 工廠，**公開簽名與 19 個
公開方法完全凍結**，只拆內部模組。114 個 controller 測試與 3 個 e2e 白箱直呼點零改動，
124 筆 GOLDEN 逐字不變為一票否決條件。是否進一步拆成多個獨立 controller，
留到批 3 與 AppShell 一起談。

**`controller.sessionStore` 公開 API**（批 1 引入）：因公開 API 凍結，2C **不收窄它**，
只需在報告中說明現狀；真要收窄留到批 3。

**2026-08-24 實測的 ground truth 修正**（本檔 08-22 的數字多項已過時）：
`sessionController.js` 2,149→**2,178**、`sessionViews.js` 2,382→**1,998**、
`main.js` 1,483→**1,242**、e2e 白箱直呼 `sessionViews` 107→**115**、
`as unknown as` 剩 **4 處**（其中 2 處與 supabase 型別無關）、
`error?.name ===` 剩 **1 處**、`defaultNotificationPreferences()` 單一來源
**已存在**於 `src/data/mappers/profileMappers.ts:55`（另兩層沒用它）。
各張派工單以自己發出當下的實測值為準。


### F2-1 sessionController 拆分

- **目標／動機**：2,149 行單一 closure god-module；features/ 六模組縫線已存在。
- **作法**：拆成 discovery-map／my-sessions-lifecycle／chat／players 數個共用 store 與
  surfaceRegistry 的 orchestrator，新模組直接 .ts、套 `domainTypes.ts`／
  `controllerContracts.ts`。requestGate／authSnapshot／reconcile 語意逐條保留
  （分析文件「不可破壞資產」節）。
- **驗收**：controller 單元測試 114 test 全綠（介面不變下不重錄）；
  `wc -l` 顯示無單檔 >800 行的新 orchestrator；`ControllerApi` 契約由 TS 編譯驗證
  （不再只是鏡射文件）。

### F2-2 auth 差分單一化

- **目標／動機**：`identityChanged` 有兩份實作（main.js:1283 與 sessionController.js:1996），
  各管一半重置清單。
- **驗收**：差分與重置收斂到 controller；main.js 端退化為轉發；
  `grep -c "identityChanged" src/main.js` 為 0；帳號切換 e2e 綠。

### F2-3 sessionViews 拆檔（e2e 承接：facade）

- **目標／動機**：2,382 行混裝六種職責。**e2e 有 107 處白箱直呼
  `__importAppModule("sessionViews")`**，承接方式＝保留同名薄 facade re-export
  （`dataApi.js` 79 行 facade 是同 repo 前例），e2e 零改動。
- **驗收**：`src/sessionViews.js` 變為純 re-export facade（回報附行數）；
  smoke.spec 470+ 斷言零修改全綠；公開簽名凍結（react-migration 規則）。

### F2-4 main.js 拆 feature 模組

- **目標／動機**：1,483 行入口混裝八種職責；比照 `features/notifications` 模式拆
  篩選工具列／分享剪貼簿／presence／profile 編排。
- **驗收**：main.js 降至 bootstrap＋接線（回報附前後 `wc -l`）；行為零變化（全測試綠）。

### F2-5 型別鏈修補（可再細拆）

- (a) `supabaseClient` 帶 `Database` 泛型，repository 移除 `as unknown as`／`rowsAs` 斷言；
- (b) SessionStatus／PlayType 等 literal union 加 runtime guard（未知值走明確 fallback）；
- (c) domain 型別搬進 `domainTypes.ts` 或 `src/data/index.ts` barrel，修正 domainTypes
  首行過時註解；
- (d) controller 錯誤分流改 instanceof／型別 predicate（現為 `error?.name` 字串比對）。
- **驗收**：每小項附前後 grep 計數（`as unknown as`、`error?.name ===`）；
  typecheck 綠；pgTAP／local e2e 綠（select 字串與型別建立編譯關聯後不可漏欄位）。

### F2-6〜F2-9（小項，可搭車）

- F2-6 mock 路徑一律過 mapper（player directory／presence 補 mock mapper）。
- F2-7 通知偏好預設值收斂單點（現三層各寫一次 `!== false`／`true`）。
- F2-8 `ACTION_MESSAGES` 中文文案上移 UI 層，data 層錯誤只帶 stable code。
- F2-9 `loadCurrentProfile`／`saveCurrentProfile` 共用 courts 結果（單次儲存現打兩次）。
- **驗收**：各附對應單元測試；F2-8 需證明 UI 錯誤文案逐字不變（e2e 斷言）。

---

## 批 3：AppShell 與導覽（翻案項——F3-0 未完成前不得開工）

### F3-0 規則修訂（前置；已原則核可 2026-08-22，批 2 驗收通過後執行）

- **目標**：批 3 觸及 `.claude/rules/react-migration.md` 的凍結條款
  （DOM/testid 凍結、「surface stack 不搬進 React」、flushSync 同步語意）。
  比照 D6 翻案儀式：修訂規則檔＋在批次報告落檔翻案理由。
- **範圍限制（拍板條款）**：只放寬 (a) surface stack 歸屬、(b) AppShell 接管區域的
  DOM 凍結；**testid 凍結保留不動**（470+ e2e 斷言依賴）。批 0〜2 期間不得先改。
- **驗收**：規則檔 diff 符合上述範圍限制；受影響的守門測試清單與處置方案。

### F3-1 頁面導覽狀態機＋hash 深連結

- **目標／動機**：四個 showXPage 各自硬編 hidden 矩陣（O(N²)）；分頁不進 URL／history，
  無法深連結、重整回地圖、返回鍵無作用。
- **作法**：單一 `setActivePage` 狀態機→接 hash/history；**自製 10 行內 hash router，
  不引入 React Router**；`#/session/:id` 完全相容（sessionRoute.js 純函式保留）。
- **驗收**：四主分頁可深連結＋重整保位＋返回鍵有語意（新增 e2e）；
  `#/session/:id` 既有 e2e 零修改全綠；hidden 矩陣收斂為單點。

### F3-2 index.html 殼遷入 AppShell

- **目標／動機**：結束 index.html／main.js／React 三方分持 UI；topbar chips、
  level popover、底部導覽、toast 遷入 React；此時 `import.meta.glob` 橋接可退役。
  **含 openLoginModal 遷 React**（最後一張全內容 innerHTML surface；2026-08-22
  翻案核可，殼機制不動、只換內容）。
- **驗收**：
  1. **同步 commit 邊界不得擴張**（2026-08-24 改寫，取代原本的「flushSync 僅剩兩處」）：
     `grep -rn "flushSync" src/` 仍只有 `src/syncCommit.ts` 一處；
     `tests/react-surface-lifecycle.test.js` 的
     `synchronous React commits stay behind one fail-closed helper and three approved callers`
     維持恰三個核可 caller，**本批不得新增第四個**。要新增必須在批次報告單獨立節論證。
  2. `import.meta.glob` 橋接（`sessionViews.js:53`／`:63`／`:69`）退役，附反向 grep。
  3. 第三套 popover Escape capture listener 刪除。
  4. a11y 契約（aria-current、live region、Escape 分層）逐條對照測試。
- **為什麼不再用「flushSync 減少」當判準**（依批 1 驗收 §三.1 與 F0-9 驗收紀錄）：
  flushSync 服務的是 imperative adapter 相容邊界，而該邊界被 **138 個 e2e 白箱直呼點**
  釘死（總則凍結既有 e2e 斷言、`.claude/rules/react-migration.md:21` 凍結 adapter 同步
  語意），**批 3 一處也拿不掉**。F0-9 已把它收斂成單一 `src/syncCommit.ts`＋
  `no-restricted-imports`／`no-restricted-syntax` 守門＋caller 允許清單，
  因此判準改為「不得擴張」而非「必須減少」。真正的退役前提是改寫那 138 個直呼點，
  不在批 3 範圍。

### F3-3 啟動編排顯式化

- **目標／動機**：五路互不 await 的啟動競速已有實際 bug 前科（2026-08-17 探針 4/4 重現，
  main.js 註解自載）；現行 `bootDeepLinkReopenPending` 一次性旗標是事後補丁。
- **驗收**：boot() 顯式描述依賴與匯合點；深連結「結構性等待」auth 定案；
  一次性旗標與世代計數退役（附反向 grep）；冷啟動深連結 e2e 綠。

---

## 批 4：效能與收尾（先量測再動手）

### F4-1 marker diff

- **目標／動機**：每次 publish 全量銷毀重建所有 marker（map.js:117），60 秒輪詢也照拆。
- **驗收**：以 sessionId/courtId diff，資料不變時零 DOM 操作（fakeMaps snapshot 斷言）；
  performance.spec 綠。

### F4-2 AdvancedMarkerElement 遷移＋版本釘選

- **目標／動機**：legacy `google.maps.Marker` 已 deprecated（Google 官方文件，codex 已
  獨立確認）；`v=weekly` 讓行為變更每週自動到貨。
- **驗收**：AdvancedMarker＋`importLibrary`；同批同步改寫 `tests/fixtures/fakeMaps.js`
  替身契約；`v` 改釘 quarterly；鍵盤可及性 e2e 綠（marker 是 DOM 這點 AdvancedMarker 原生支援）。

### F4-3 bundle 組成分析→拆分（依賴批 2）

- **作法順序**：先 rollup-plugin-visualizer 出報告（回報附截圖或 JSON 摘要）→
  依報告決定拆 `dataRepository.ts`／未登入不載入私人功能（chat、notification 設定、
  directory mutation）→ manualChunks 只當快取優化；gate 擴充 per-chunk 與 dist 總量預算。
- **驗收**：主 chunk 較基線（639,896 raw）實質下降並更新 gate 基線；
  未登入首屏網路面板無私人功能 chunk（e2e 斷言）。

### F4-4 pin 色票單一 token 來源

- **驗收**：JS 常數與 CSS 變數同源產出；故意改一側證明 gate 會紅（canary）；
  contrast-tokens 測試綠。

### F4-5 CSS @layer（已裁決不做，2026-08-22）

- **裁決理由**：batch-10 §3 有三個實證反例，@layer 化是行為變更而非整理；現行 13 檔
  import 順序有明文檔頭與兩個自動 gate 守著，只在調動 import 順序時才有風險，
  回歸成本不成比例。維持 batch-10 決策不翻案。
- **保留的便宜半套**：token 雙源問題由 F4-4 解決；AppShell 完成後若要重談，另立提案。

### F4-6 錯誤監控接線（廠商已拍板：Sentry 免費方案，2026-08-22；即日可派工）

- **前置**：接線步驟見 `docs/error-transport-wiring.md`。
- **必要條件（拍板條款）**：(a) Sentry SDK 以 dynamic import 延遲載入，不得進主 chunk
  （bundle gate 驗證）；(b) `beforeSend` 強制只放行 `errorName/kind/surface` 三欄。
- **驗收**：只送三欄 frozen allowlist（app-errors 測試綠）；raw message／stack 不出境
  （canary：故意丟含 PII 的 error 證明被濾掉）；`check:production-bundle` 主 chunk
  尺寸未因 SDK 上升。

### F4-7 長列表節流

- **作法**：先 `content-visibility: auto`＋intrinsic size；資料層評估
  `session_message_feed` 等查詢的 limit／分頁（四個清單面目前皆無 `.limit(`，
  總量隨使用者數成長）。不過早虛擬化。
- **驗收**：390px 慢網路走查；資料層 limit 需同步 pgTAP 與 view 契約評估（另立 DB 批）。

### F4-8 測試後門出貨修補（P2）

- **驗收**：production build 以 define／條件編譯拔除 `__tennisE2ETestHooks` 讀取路徑；
  `check:production-bundle` 加 canary 斷言證明有牙；mock e2e 不受影響。

### F4-9 地圖層 TS 化＋狀態所有權收斂（可併批 2）

- **驗收**：map.js／pins.js 轉 .ts；map singleton 與 main.js 的 marker 陣列合併成單一
  map-view 模組；`appRuntime.js` 副檔名表同步（e2e 零改動）。

### F4-10 測試基建（P2）

- Playwright per-project workers（mock 可平行、local 維持 1）＋smoke.spec 按 surface 拆檔。
- **驗收**：mock 套件 wall-clock 下降（附前後時間）；testMatch 不變、全綠。

---

## 文件批 D（**ACCEPTED** 2026-08-25，`ee49b74`，索引落地 `docs/architecture-decisions.md`）

- **D-1 架構決策索引**：一頁 ADR 式清單（一行一決策：狀態／日期／出處），收斂
  migration-plan「不在 scope」、00-overview「非派工項」、final-verdict「未盡事項」、
  fix-plan D1–D7。驗收：任一歷史決策可在 30 秒內從索引找到出處。
- **D-2 歷史文件後註**：fix-plan／migration-plan 檔頭加終結註記；08-20 codex 分析的
  `as unknown as` 與測試資料污染兩處加失效後註。驗收：照 batch-12 既有後註慣例。

---

## 不派工（需使用者先拍板或明確不做）

| 項目 | 狀態 |
| --- | --- |
| TanStack Query | 維持延後（2026-08-22 重申）；預設不引入，批 2 後有實際痛點才提案，且需配 no-restricted-imports 防繞過 mapper |
| React Router | 不建議——自製 hash router 足夠（F3-1） |
| Redux／Zustand | 不加；自製 store 訂閱化後如需 devtools 再議 |
| CSS @layer | 2026-08-22 裁決不翻案（見 F4-5） |
| 桌面雙欄版面 | 先查 analytics 裝置比例再決定（codex 建議，同意） |
| Next.js／SSR／一次重寫 | 三度審視同結論：不做 |

---

## 驗收協定（Claude 執行）

1. 以回報中的指令逐條重跑，輸出不符即退件；「已刪除／歸零」類聲稱缺反向 grep 輸出即退件。
2. 空殼引用（結論對但引不出檔內原文＋行號）視為假 Read，退件。
3. 守門類改動（lint 規則、gate、CI、新測試）驗「有牙」：驗收方自行製造一個違規 canary
   確認變紅。
4. 判「需不需要改」看派工基準 commit（`git show 8213d33:<path>`），判「最終呈現」看
   working tree。
5. 每批收尾核對 `npm run test:ci:frontend` 全綠＋`git diff --check`；批 1 起加驗
   「凍結測試變更是否逐筆說明變因」。
