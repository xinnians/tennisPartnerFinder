# 批 3C-1 派工單：MePage 資料與 action 單源化（樣板複製，Me 第一段）

- 日期：2026-08-26。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`；
  治理底線：`docs/arch-q3-whitebox-triage-2026-08-26.md`。
- 批 3C 切兩段：**3C-1（本批）＝sessionStore 權威資料 9 欄＋11 個 action 改 hooks
  單源、meApp services 設計、14 個測試直呼點處置、補 me 安全網；3C-2（另批）＝
  pageViewStore 切片、scope／rAF 管道收斂、adapter 與整套 slot 機制退役。**
- 開工基準：`5870262`（working tree 應乾淨，否則停手回報）。
- 你不 commit、不 push；working tree 交驗收方。

## 解凍清單（Q3 守則：未列即凍結）

允許自 `MePageOptions`／`main.js` bag 與 MePage props fallback 移除：

- sessionStore 權威資料 9 欄：`authSession`、`profile`、`avatarUrl`、`linkedProviders`、
  `courts`、`playerVisibility`、`blockedPlayers`、`blockedPlayersError`、
  `blockedPlayersStatus`。
- action 11 欄：`onTogglePlayerVisibility`／`onUnblockPlayer`（ControllerApi 現成）＋
  `onEditProfile`、`onEnablePush`、`onLinkProvider`、`onSaveCourtSubscriptions`、
  `onSaveNotificationPreferences`、`onSetOpenToGreeting`、`onSetPresenceSharing`、
  `onSignIn`、`onSignOut`（9 欄進 `meApp`）。
- 建置期常數 2 欄：`lineProviderId`、`supportHref`——**一併進 `meApp`**（本批一次定
  services 形狀，3C-2 不再改）。
- `sessionStore` 欄（store 改由 provider 供應）。

**仍凍結（一票否決）**：`notificationSettings`／`presence`／`pageViewStore` 欄與
pageViewStore 的 `"me"` channel 語意（跨 store 複合，3C-2 處理）；
`onStoreCommit`／`rootElement`；`renderMePage` bridge 本體、`renderMePageInApp`、
`mePages` slot、`preloadAuthenticatedViewsForAuth`／preload 鏈、`configurePageViews`
（整套 3C-2 退役）；`main.js:499-506` 兩顆 rAF（`focus`／`focusNotificationSettings`
落點）；`pageViews.js` 的 `setMySessionActionScope`／`syncPendingMySessionActions`
橋（**`account-settings-smoke.spec.js:141-146` 是其唯一 oracle**）；`src/meFocus.js`
與 `sessionActions.ts` 共用 pending／error 機制（含 MePage 的
`data-my-sessions-error` 節點）；`surface="me-page"`；全部 testid（含
`player-visibility-toggle`）／id／class／aria／文案；三個 `syncCommit` caller
（`App.tsx` 的 `commitPageAdapterSynchronously` 仍服務 Me slot，3C-2 才隨 slot 消失）。

## Ground truth（2026-08-26 開單時實測；動手前自行重驗）

- `src/main.js:420-454` `mountMeDestination`：bag **26 欄**（13 資料＋11 action＋
  2 store）；`:711` 唯一呼叫點（mount-once）；`:453` 尾隨 `syncBottomNavigation()`。
- action 對應：`togglePlayerVisibility`（`controllerContracts.ts:309`）、
  `unblockPlayer`（`:310`）在 ControllerApi；其餘 9 個來自 notification／presence／
  profile 三個 feature 模組與 2 個 main.js 閉包（`onSignIn = openSafeLogin({action:"me"})`、
  `onEnablePush`）——**語意逐字搬進 `meApp` 注入，不改 feature 模組本體**。
- `src/pages/MePage.tsx`（800 行、12 子元件）`:709-712`：訂 sessionStore `"me"`
  channel（`(state) => state` 整包未切片）＋借用 `selectControllerMySessionsView` 取
  `isPublic`／`blockedPlayers*`＋pageViewStore `"me"` channel；`:713-733`／
  `:745-797` 雙源 fallback 逐欄；**無 `"courts"` channel 訂閱**（courts 只在 `"me"`
  emit 時更新——**本批沿用此語意，不加訂 courts channel**，行為凍結；
  `chat-settings-filters:455` 的 oracle 是裁判）。
- selector 現況：無 me 專屬 selector；`selectControllerPlayerLayerView` 是地圖球友
  圖層，**與 Me 的 `playerVisibility` 無關，勿誤用**。本批新增 `selectMeState`
  切片（`isPublic`／`blockedPlayers*` 可自 `selectControllerMySessionsView` 投影
  取得，不得另立第二套 derive）。
- bridge 現況（`pageViews.js:13-24`）：`:19` 的
  `options.sessionStore?.getState?.()...` 在 `sessionStore` 欄退役後自然失效，
  語意由既有第二 fallback `authSession?.user?.id` 承接（production 值相同）——
  **不改 bridge 本體**，回報說明即可。
- 測試直呼 `renderMePage(`：**5 檔 14 處**（account-settings 6、chat-settings 3、
  discovery-interactions 3、auth-forms 1、react-page-focus 1；行號開單盤點在
  `:11/:57/:162/:196/:293/:368`、`:173/:414/:455`、`:283/:440/:461`、`:88`、`:28`，
  動手前自行 rg）。**14 處全部不傳 `sessionStore`／`pageViewStore`**，收 fallback
  後必須同批處置。三條唯一 oracle 特別點名：
  - `account-settings:57` 群（`:141-146` pending disable 經 bridge commit callback）
    ——**依賴仍凍結的 bridge 管道，允許保留 adapter 直呼至 3C-2**。
  - `discovery-interactions:283`（`focusNotificationSettings` 唯一守門，rAF 打
    `#me-root`）——改寫必須走**真實 UI 驅動**（點 drawer subscribe→真 `showMePage`
    →真 `#me-root`），不可用自建 root harness（rAF query 會撲空）。
  - `react-page-focus:28`（焦點自存活）——比照同檔 Messages／MySessions 段改
    harness。
- 無 me 版 jsdom dom test——本批補 `tests/me-page-dom.test.js` 安全網。
- 量化基準：`__importAppModule(`＝119；main gzip 191,023（餘 1,397 B）、
  total 256,086（餘 2,976 B）；**MePage lazy chunk 16.13 kB／gzip 5.12 kB
  （gate 逐 chunk 5,500——餘 ≈380 B，全庫最緊）**；mock 286 passed／4 skipped。

## 作法要求

### A. services 與 hooks（`src/app/AppServicesProvider.tsx`，main chunk——**嚴禁放
MePage chunk，380 B 餘裕擋不住**）

- `meApp` 介面：9 個 app callback＋`lineProviderId`／`supportHref` 兩常數；main.js
  在 `configureAppServicesInApp` 一次注入，callback 語意與現行 bag 逐字相同。
- `useMeState()`：新 `selectMeState` 切片（authSession／profile／avatarUrl 衍生／
  linkedProviders 衍生／courts／isPublic→playerVisibility／blockedPlayers*）；
  衍生欄（avatarUrl、linkedProviders）的計算自 main.js／feature 現行邏輯**逐字搬移**
  進 selector 或 hook，單一來源，回報附對照。
- `useMeActions()`：2 個 ControllerApi action；`useMeAppActions()`：`meApp` 切片，
  fail-closed。

### B. `src/pages/MePage.tsx`

- 解凍 9 資料欄＋11 action 改 hooks 單源，刪對應 props fallback；
  `notificationSettings`／`presence`／`pageViewStore`／`onStoreCommit`／`rootElement`
  照舊（3C-2）。`MePageOptions` 同步縮欄。
- 刪除的 fallback 程式碼會縮 MePage chunk——回報 chunk 前後值。

### C. `src/main.js`

- bag 26 欄→**約 5 欄**（`notificationSettings`、`presence`、`pageViewStore`＋
  App 注入的 `rootElement`／`onStoreCommit` 除外的殘餘欄以實作為準，回報列清單）；
  刪除欄的接線碼（`currentAuthAvatarUrl` 等若無他用）一併清理並回報去向。

### D. 測試面（本批工作量主體）

1. 14 處直呼逐點處置，優先序：真實 UI 驅動＞`tests/fixtures/meAppHarness.tsx`
   （新增，仿既有三個 harness：fake store＋fake `meApp` 經 Provider 注入）＞
   保留 adapter 直呼（僅限依賴仍凍結管道者，如 `account-settings:57` 群）。
   回報附 14 處逐點 before→after 對照表與處置理由。oracle 不得弱化或刪除。
2. 新增 `tests/me-page-dom.test.js`（仿既有 dom test）：render 斷言＋`useMeState`
   與 selector 切片 `deepStrictEqual` 逐值＋`useMeActions`／`useMeAppActions` 轉呼
   與參數綁定逐一驗；註冊進 `package.json` `test:session-unit`（在範圍內）。
3. `__importAppModule` 只准真退役、禁換拼法；回報逐檔對帳。
4. 預期零變更：`react-surface-lifecycle`、`appRuntime`、`me-focus.test.js`、
   `performance`、`navigation-shell`。

## 不在範圍（3C-2 或更後）

- pageViewStore 欄與 `"me"` channel 切片（`useMePageView()`）；scope／rAF 管道
  收斂；adapter／slot／`configurePageViews`／preload 鏈退役；`pageViews.js` 刪檔；
  路由；sheets 殼；`syncCommit`；新依賴；UX／文案／CSS。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／lint／prettier:check／build／check:production-bundle（main／total／
**MePage chunk** 三組對照＋淨值；**MePage chunk gzip 超 5,500＝BLOCKED，不得調 gate**）
／test:mock（≥286 passed；`chat-settings-filters:468` 存量 flake 已立案不算本批紅，
撞到重跑並註明）／test:local（fixture 污染紅依標準 guarded reset 三拍）／
`git diff --check`。

## 回報合約

寫 `docs/arch-dispatch-2026-08-26-batch3C1-me-report-codex.md`（不 commit、不 push），
必含：14 處逐點對照表、`meApp` 9 callback＋2 常數語意逐字自證、衍生欄搬移對照、
bag 26→殘餘欄清單、bundle 三組數字、`__importAppModule` 對帳、凍結面自證、
收尾矩陣逐字輸出、Codex 五問（第 5 問答「對 3C-2 管道收斂與 slot 全套拆除的建議」）、
未做／疑義／BLOCKED。
