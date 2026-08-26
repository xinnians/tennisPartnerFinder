# 批 3B 派工單：NearbyDrawer 焦點管道 React 化＋adapter 退役

- 日期：2026-08-26。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`；
  前置：批 3A ACCEPTED（`add101d`，驗收紀錄
  `docs/arch-reports/batch-3A-nearby-acceptance-2026-08-26.md`——其尾節三個移交觀察
  由本批處理）。治理底線：`docs/arch-q3-whitebox-triage-2026-08-26.md`。
- 開工基準：`add101d`（working tree 應乾淨，否則停手回報）。
- 本批完成後 NearbyDrawer 與 Messages／MySessions 同級：main.js 零 drawer mount 鏈、
  焦點管道單一 strict TS 來源。樣板：批 2B 對 MySessions 的做法
  （`src/mySessionsCreatedFocus.ts`＋直接 portal）。
- 你不 commit、不 push；working tree 交驗收方。

## 解凍清單（Q3 守則：未列即凍結）

- `main.js` `mountNearbyDestination`（`:306` 起）與 `:716` 呼叫點、
  `renderNearbySessionsDrawer` import。
- `sessionViews.js` facade：`renderNearbySessionsDrawer` export（`:68-71`，含
  F2D prettier-ignore 註解群）、`renderNearbySessionsDrawerInApp` wrapper（`:245`）
  與 `configurePageViews` 注入鍵（`:586`）。
- `pageViews.js` 的 drawer 全套（本批主體，約 150 行）：
  `renderNearbySessionsDrawer` bridge、`drawerFocusIntents`（`:13`）、
  `drawerLoadingFocusFallbacks`（`:15`）、`drawerBeforeStoreChangeCallbacks`（`:17`）、
  `DRAWER_ACTION_IDS`（`:25`）、`activeDrawerPanel`（`:50`）、
  `rememberFocusedSessionCard`（`:55`）、`beforeDrawerStoreChange`（`:77`）、
  `setDrawerFocusIntent`／`clearDrawerFocusIntent`（`:86-94`）、
  `drawerRecoveryTarget`（`:96`）、`focusDrawerLoadingFallback`（`:109`）、
  `restoreFocusedSessionCard`（`:122` 起）與 bridge commit callback。
- `App.tsx`：`nearbyDrawers` slot（`:31`、`:84`、`:807-809`）、
  `renderNearbySessionsDrawerInApp`（`:924-929`）、`NearbyDrawerDestination` 的
  slot 消費（`:290-293`）。
- 元件三個過渡欄：`rootElement`／`onStoreCommit`／`onBeforeStoreChange`
  （`NearbySessionsDrawer.tsx:26-28`）與 `useNearbyDrawerState` 的
  `beforeStoreChange` 過渡參數（`AppServicesProvider.tsx`，3A 註解已預告本批移除）。
- 對應白箱斷言與 harness 內因上述退役而失效的接線。

**仍凍結（一票否決）**：`performance.spec.js:325/:342` 兩測的 oracle——
**這是焦點管道唯一載重測試，本批遷移前後的紅綠對照就靠它們，不得先改寫、
不得弱化**（3A 驗收移交觀察 2）；`sheets-dom.test.js` 四個 DOM 字面
（`#nearby-sessions-drawer`／`#nearby-sessions-toggle`／`drawer-collapse`／
`data-session-id`）；`surface="nearby-sessions-drawer"`；
`className="nearby-sessions__cards"` 與 `data-testid="session-card"` anchor；
`#nearby-sessions-count-status`／`#map-data-status` 與 `renderDiscovery`；
`setDrawerState` 的三個切頁 caller 與 store 權威；NearbyDrawer 保持 eager
（`react-surface-lifecycle.test.js:139` 的 `=3` 不變）；三個 `syncCommit` caller
（`commitPageAdapterSynchronously` 仍服務 Me slot，**不可動**——Me 是批 3C）；
MePage 的一切；全部 testid／id／class／aria／文案。

## Ground truth（2026-08-26 開單時實測；動手前自行重驗）

- 焦點管道現況（`pageViews.js`，共 259 行，drawer 相關約 150 行）：
  - intent 形態四種：`"__drawer-toggle__"`、`"__drawer-close__"`、
    `"__drawer-action__:<id>"`（`DRAWER_ACTION_IDS` 白名單五個：discovery-reset／
    drawer-map-retry／discovery-expand／discovery-subscribe／discovery-first）、
    裸 `sessionId`。
  - 快照時機兩處：bridge 進入時與 store 變更前（`beforeDrawerStoreChange` 的
    WeakMap 穩定 callback）;還原時機：bridge commit callback 內
    `restoreFocusedSessionCard` → rAF → bail-out（新 sheet／焦點仍有效）→
    toggle／close／action／卡片四分支決策樹;另有 loading-fallback 特例
    （`drawerLoadingFocusFallbacks` WeakSet）。
  - 還原決策樹含 `drawerRecoveryTarget` 六段 querySelector 優先序與
    `activeDrawerPanel`（以 `#nearby-sessions-list` 的 `hidden` 判定）。
- 穿透鏈（3A 後）：bridge `onBeforeStoreChange: beforeDrawerStoreChange(root)` →
  slot spread → 元件 `:190` → `useNearbyDrawerState` 第五參數 →
  `sessionStore.ts` 訂閱的 `beforeStoreChange?.()`（`syncCommit(listener)` 前）。
- 元件 `NearbySessionsDrawer.tsx` 372 行;`:195` `onStoreCommit` commit 回推;
  `:207`／`:236` 用 `options.rootElement` 掛 pointer listener 與查 toggle。
- 直接 portal 樣板：`App.tsx` 的 `messagesRoot`（每次 render `getElementById`）與
  `mySessionsPortalRoot`（`ensureAppRoot` 內 `??=` 快取）兩式並存,擇一並說明。
  drawer 根節點 `#nearby-sessions-drawer` 為 index.html 靜態節點。
- 測試面：`renderNearbySessionsDrawer(` 測試呼叫 0;`__importAppModule(`＝**119**;
  `performance.spec.js:325/:342` 是管道載重測試（canary 已實證）,`:364` 不是
  （React 節點穩定性使然,不可當管道證據——3A 移交觀察 3）;
  `session-lifecycle-smoke` 重寫後的 `__batch18DiscoveryLoads` 計數屬測試 plumbing
  （移交觀察 1,本批順手註明或移除,擇一回報）。
- 量化基準：main gzip 191,311（餘 1,109 B）、total 256,398（餘 2,664 B）;
  mock 286 passed／4 skipped;收掉 adapter 鏈預期再回收 main 餘裕,回報淨值。

## 作法要求

### A. 焦點管道搬 strict TS（單一來源,搬運不重造）

- 新模組（建議 `src/nearbyDrawerFocus.ts`）承載全套機制：intent 四形態、
  `DRAWER_ACTION_IDS` 白名單、快照（含 loading-fallback WeakSet 語意）、
  還原決策樹（bail-out、四分支、六段 recovery 優先序、`activeDrawerPanel` 判定）、
  rAF 時機——**selector 字串、謂詞、優先序、註解逐字保留**（比照批 2B
  `mySessionsCreatedFocus.ts` 的機械 diff 可驗標準）。
- 接線改由元件自持：store 變更前快照經 `useStoreSelector` 的 `beforeStoreChange`
  由元件（或 hook 內部）直接綁定新模組;commit 後還原由元件 commit effect 呼叫。
  完成後移除 `useNearbyDrawerState` 的過渡參數與元件三個過渡欄。
- WeakMap 以 root 為 key 的設計在單一 drawer root 下可簡化為模組內單例狀態,
  **允許**——但語意（intent 覆寫、clear、loading fallback 的 delete 時機）必須
  逐條對照保留,回報附對照表。

### B. adapter 全鏈退役

1. `App.tsx`：`NearbyDrawerDestination` 改直接 portal 到 `#nearby-sessions-drawer`
   （比照 Messages／MySessions;`resetKey` 處理說明）;刪 `nearbyDrawers` slot、
   `renderNearbySessionsDrawerInApp`、`NearbySessionsDrawerOptions` 的 slot 消費;
   `rootElement` 改由 portal 目標元素提供。
2. `main.js`：刪 `mountNearbyDestination`＋呼叫＋import。
3. `sessionViews.js`／`pageViews.js`：刪解凍清單所列全部項;
   `configurePageViews` 剩餘鍵（`preloadAuthenticatedViewsForAuth`、
   `renderMePageInApp`）**保留**——Me bridge 是批 3C。
4. 反掃：`renderNearbySessionsDrawer`／`renderNearbySessionsDrawerInApp`／
   `mountNearbyDestination`／`nearbyDrawers`／`drawerFocusIntents` 於 src＋tests
   應歸零（新 TS 模組內的新名稱除外）。

### C. 測試面

1. **遷移前後紅綠對照**：`performance.spec.js:325/:342` 原封不動,遷移後必須仍綠;
   回報附遷移後對新模組做 canary（破壞 selector 或快照時機）→ 這兩測轉紅 →
   還原 byte-identical 的三拍證據（比照批 2B）。
2. `nearby-drawer-dom.test.js`／harness：隨過渡欄移除同步更新;若 harness 需要
   焦點管道,import 新 TS 模組本尊,禁 clone。
3. `__importAppModule` 只准真退役、禁換拼法;回報逐檔對帳。
4. 移交觀察 1（`__batch18DiscoveryLoads` plumbing）處置並回報。

## 不在範圍（3C 或更後）

- MePage 的任何遷移（bridge、`renderMePageInApp`、`preloadAuthenticatedViewsForAuth`
  路徑全數保留）;路由;sheets 殼（批 4);`syncCommit`（批 5);新依賴;UX／文案／CSS。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄;同批 3A）

typecheck／lint／prettier:check／build／check:production-bundle（main／total 對照＋
淨值;超 gate＝BLOCKed 不得調 gate）／test:mock（≥286 passed;filter sheet 存量 flake
已立案不算本批紅,撞到就重跑並註明）／test:local（fixture 污染紅依標準 guarded reset
三拍）／`git diff --check`。

## 回報合約

寫 `docs/arch-dispatch-2026-08-26-batch3B-nearby-report-codex.md`（不 commit、不 push），
必含：焦點管道搬移逐條保真對照表（intent 形態／白名單／決策樹／時機）、WeakMap→
單例簡化（若採）的語意對照、canary 三拍證據、adapter 歸零反掃輸出、
`__importAppModule` 對帳、收尾矩陣逐字輸出、Codex 五問（第 5 問答「對批 3C Me 與
批 4 sheet 殼的建議」）、未做／疑義／BLOCKED。
