# 批 3A 派工單：NearbyDrawer 資料與 action 單源化（樣板複製）

- 日期：2026-08-26。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`；
  治理底線：`docs/arch-q3-whitebox-triage-2026-08-26.md`（C 類解凍需明列，本批見下）。
- 批 3 切法（沿批 2 節奏）：**3A（本批）＝資料 6 欄＋action 7 欄改 hooks 單源、
  4 個測試直呼點改寫、補 jsdom dom test 安全網；3B（另批）＝焦點管道（約 145 行
  WeakMap 機制）搬 strict TS＋adapter 退役。** 本批不動焦點管道與 bridge 本體。
- 開工基準：`e70f4d3`（working tree 應乾淨，否則停手回報）。
- 你不 commit、不 push；working tree 交驗收方。

## 解凍清單（Q3 守則：未列即凍結）

允許自 `NearbySessionsDrawerOptions` 型別、`main.js` options bag 與 `pageViews.js`
bridge 轉發物件移除：

- 資料 6 欄：`courts`、`drawerState`、`filters`、`hasUserLocation`、`mapStatus`、
  `sessions`（含元件內 `subscribed ?? options` 的 options fallback 分支）。
- action 7 欄：`onExpandBounds`、`onOpenCreate`、`onOpenSession`、`onReset`、
  `onRetry`、`onToggle`（六者皆 ControllerApi 現成）＋`onSubscribe`（app callback，
  進 AppServices）。
- 基礎欄 2 個：`sessionStore`（store 改由 provider 供應）、`authenticated`
  （死欄——`pageViews.js:217` 解構即丟，從未進元件）。

**仍凍結（一票否決）**：`renderNearbySessionsDrawer` bridge 本體與 facade export、
`renderNearbySessionsDrawerInApp`、`nearbyDrawers` slot 機制、
`onBeforeStoreChange`／`onStoreCommit`／`rootElement` 三欄與其同步語意（焦點管道
接點，3B 才動）；`pageViews.js` 的 `drawerFocusIntents`／`drawerLoadingFocusFallbacks`
／`drawerBeforeStoreChangeCallbacks` 全套焦點機制；`surface="nearby-sessions-drawer"`
（`tests/app-errors.test.js:117` 鎖名）；`className="nearby-sessions__cards"` 與
`SessionCard` 的 `data-testid="session-card"`（`content-visibility-contract.test.js:19-24`
anchor）；`#nearby-sessions-drawer`／`#nearby-sessions-toggle`／
`data-testid="drawer-collapse"`／`data-session-id`（`sheets-dom.test.js:109-156` 三段
焦點 fallback oracle）；元件對 `sessionPresentation.ts` 的 import
（`surfaceManifest.presentationConsumers`）；`#nearby-sessions-count-status`／
`#map-data-status` live region 與 `main.js` `renderDiscovery`（React 樹外，勿動）；
**NearbyDrawer 保持 eager import——不得順帶改 lazy**（`react-surface-lifecycle.test.js:139`
的 lazy 計數 `=3` 本批必須不變）；全部 testid／id／class／aria／文案。

## Ground truth（2026-08-26 開單時實測；動手前自行重驗）

- `src/main.js:306-318` `mountNearbyDestination`：options bag **9 欄**（8 實＋1 死欄
  `authenticated`）；`:723` 唯一呼叫點（mount-once）；main.js **不傳任何資料欄**，
  資料 6 欄在 `pageViews.js:211-216` 吃預設、實際由元件 store 訂閱供應——
  **資料側已自足，本批只是收掉 fallback 支線**。
- `onSubscribe`（`:314`）＝`() => showMePage({ focusNotificationSettings: true })`，
  唯一非 controller action，性質同批 2B 的 `mySessionsApp`。
- 元件 `src/pages/NearbySessionsDrawer.tsx`（407 行）`:208-223`：
  `useStoreSelector(options.sessionStore, "map", selectControllerMapView, null,
  options.onBeforeStoreChange)`＋`subscribed ?? options` 雙源（`:223`）;`:224-226`
  `useLayoutEffect` 呼 `options.onStoreCommit`。Options 型別共 17 欄；`authenticated`
  死欄只存在於 main.js bag 與 pageViews 解構，不在 Options 型別內。
- selector 現成：`src/sessionSelectors.ts:19-29` `selectControllerMapView`
  （`"map"` channel，回傳 7 欄含 `locationMessage`——drawer 只需其中 6 欄）。
  **0 個欄位需要新 channel 或新 selector。**
- 6 個 controller action 皆在 `ControllerApi`：`expandBounds:265`、`openCreateIntent:275`、
  `openSession:282`、`resetFilters:291`、`retryDiscovery:294`、`setDrawerState:303`
  （`src/controllerContracts.ts`）。
- `setDrawerState` writer 恰 4 處（main.js `:315`＋三個切頁 `:498/:509/:529`）；
  drawer 收合權威 100% 在 sessionStore（`discoveryMapController.ts:209-213`），本批不動。
- 測試直呼 `renderNearbySessionsDrawer(`：**2 檔 4 處**（`session-lifecycle-smoke.spec.js
  :233/:282/:1151`、`chat-settings-filters-smoke.spec.js:526`；解構 import 行不計）。
  四處**都不傳 `sessionStore`**、全靠 options fallback——**本批收 fallback 後必須同批
  改寫**，否則元件無資料入口。
- **無 nearby 版 jsdom dom test**（Messages／MySessions 都有）——本批補上安全網。
- 量化基準：`__importAppModule(`＝122；main 654,646／gzip 191,489（**餘 931 B**）、
  total 256,554（餘 2,508 B）；mock 286 passed／4 skipped。NearbyDrawer 全鏈在
  main chunk（eager）。

## 作法要求

### A. AppServices 與 hooks（`src/app/AppServicesProvider.tsx`，main chunk）

- services 加 `nearbyDrawerApp: { onSubscribe }`（比照 `mySessionsApp` 樣板；
  main.js 注入 `() => showMePage({ focusNotificationSettings: true })`，語意逐字保留）。
- `useNearbyDrawerState(onBeforeStoreChange?)`：自 provider 的 `sessionStore` 訂閱
  `"map"` channel，沿用 `selectControllerMapView` 切出 drawer 需要的 6 欄；
  **`onBeforeStoreChange` 作為可選參數穿透到 `useStoreSelector` 第五參數**——這是
  焦點管道的過渡接點，3B 收管道時移除，hook 註解明寫此過渡性質。
- `useNearbyDrawerActions()`：6 個 controller action 自 `ControllerApi` `Pick` 切片，
  穩定 memoize；`useNearbyDrawerAppActions()`：`{ onSubscribe }`（fail-closed，
  缺注入即 throw，比照批 2B）。

### B. `src/pages/NearbySessionsDrawer.tsx`

- 資料與 action 改 hooks 單源；刪 `subscribed ?? options` fallback 與解凍欄位；
  Options 型別剩 `rootElement`／`onStoreCommit`／`onBeforeStoreChange`（過渡三欄）。
- `onBeforeStoreChange` 仍由 options 進、轉交 `useNearbyDrawerState`；
  `:223-225` 的 `onStoreCommit` commit 回推不動。
- 凍結面（§解凍清單「仍凍結」）逐項不動。

### C. `src/main.js`／`src/views/pageViews.js`

- main.js bag 9 欄 → **0 資料/action 欄**：只剩注入 `nearbyDrawerApp` 進
  `configureAppServicesInApp`；`mountNearbyDestination` 與 bridge 呼叫本體保留
  （轉發物件同步縮欄），adapter 鏈 3B 才退。
- bridge 轉發物件（`pageViews.js:230-248`）同步移除解凍欄；焦點機制與
  `:249-253` commit callback 一行不動。

### D. 測試面（本批工作量主體）

1. **4 個直呼點逐點改寫**，oracle 不弱化，回報附逐點 before→after 對照：
   - 新增 `tests/fixtures/nearbyDrawerAppHarness.tsx`（仿 `mySessionsAppHarness`）：
     fake `sessionStore`（seeded `"map"` channel state）＋fake actions＋
     `nearbyDrawerApp` 經 `AppServicesProvider` 注入；驅動改 store `setState`＋
     `emit("map")`（比 options 重呼更貼 production 高頻更新路徑）。
   - `session-lifecycle-smoke.spec.js:233`（自建 controller `render` 回呼驅動）：
     改為 fake store emit 驅動；`:282`（drawerState 切換）與 `:1151`（真實節點）、
     `chat-settings-filters:526` 同理逐點處置；只依賴仍凍結欄位的測試才可保留直呼。
2. **新增 `tests/nearby-drawer-dom.test.js`**（仿 `my-sessions-page-dom.test.js`）：
   render 斷言（卡片、空狀態、peek 列）＋`useNearbyDrawerState` 與
   `selectControllerMapView` 切片逐值一致＋兩個 action hooks 轉呼與參數綁定逐一驗；
   `deepStrictEqual`＋retry assertion＋fixture 非空；**註冊進 `package.json`
   `test:session-unit`**（此接線在範圍內）。
3. `__importAppModule` 計數：基準 122，只准真退役、禁換拼法（退件級）；
   回報逐檔對帳。`renderNearbySessionsDrawer(` 測試呼叫預期 4→0 或列殘留理由。
4. 字面契約不可動：`app-errors`、`content-visibility-contract`、`surfaceManifest`、
   `react-surface-lifecycle`（本批預期**零變更**，尤其 `:139` 的 `=3`）、
   `sheets-dom.test.js`（四個 DOM 字面保留即不撞）。

## 不在範圍（3B 或更後）

- 焦點管道搬遷（`drawerFocusIntents` 全套）、adapter／bridge／slot 退役、
  直接 portal 化、`onBeforeStoreChange`／`onStoreCommit`／`rootElement` 退役。
- MePage 的任何遷移；`renderDiscovery` 與 live region;路由;sheets;`syncCommit`;
  新依賴;UX/文案/CSS。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／lint／prettier:check／build／check:production-bundle（main／total 對照＋
淨值明列;hooks 進 main chunk、刪接線對沖;超 gate＝BLOCKED 不得調 gate）／
test:mock（≥286 passed;若撞 filter sheet 存量 flake `chat-settings-filters:468`,
重跑並註明,該 flake 已立案不算本批紅）／test:local（先 `npx supabase start`;
fixture 污染紅依標準 guarded reset 重跑並回報三拍）／`git diff --check`。

## 回報合約

寫 `docs/arch-dispatch-2026-08-26-batch3A-nearby-report-codex.md`（不 commit、不 push），
必含：4 直呼點逐點對照表、接線前後對照（bag 9→剩餘欄）、hooks 型別與 selector
同源自證、凍結面逐項自證（含 `react-surface-lifecycle` 零 diff 證明）、
`__importAppModule` 對帳、收尾矩陣逐字輸出、Codex 五問（第 5 問答「對 3B 焦點管道
搬遷與 Me 遷移的建議」）、未做／疑義／BLOCKED。
