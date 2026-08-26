# 批 2B 派工單：MySessions app 服務承載＋焦點管道收斂＋adapter 退役

- 日期：2026-08-26。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`；
  前置：批 2A ACCEPTED（`ee8e1ee`，驗收紀錄
  `docs/arch-reports/batch-2A-acceptance-2026-08-26.md`——其尾節三個移交觀察由本批收掉）。
- 開工基準：`ee8e1ee`（working tree 應乾淨，否則停手回報）。
- 本批新複雜度＝**第二 store（pageViewStore）的 provider 承載＋命令式 rAF 焦點管道
  React 化**。完成後 MySessions 與 Messages 同級：main.js 不再有 MySessions mount 鏈。
- 你不 commit、不 push；working tree 交驗收方。

## 解凍清單（依「React ownership 分批解凍」第 1 條明列，僅限 MySessions）

- `main.js` `mountMySessionsDestination`（`:436` 起）與其 `:738` 呼叫點、
  `renderMySessionsPage` import。
- `sessionViews.js` facade：`renderMySessionsPage` export（`:66-68`）、
  `renderMySessionsPageInApp` wrapper（`:249`）與 `configurePageViews` 注入鍵（`:591`）。
- `pageViews.js`：`renderMySessionsPage` bridge（`:243` 起）、
  `scheduleMySessionsCreatedFocus`（`:209-240`）、`hasAdapterActionScope` 死碼（`:245`）。
- `App.tsx`：`mySessionsPages` slot 機制（`:32`、`:85`、`:804-810`）、
  `renderMySessionsPageInApp`（`:931-936`）、`MySessionsPageOptions` 剩餘 8 欄與
  `onCreatedSessionCommit`／`onStoreCommit` 的 MySessions 專屬管道。
- 對應白箱斷言與 harness 內的 rAF clone（`mySessionsAppHarness.tsx:138-158`）。

**仍凍結（一票否決）**：`mountSheet` 殼（批 4）；三個 `syncCommit` caller——
`App.tsx` 的 `commitPageAdapterSynchronously` 仍服務 me／nearby slot，**不可動**（批 5）；
MePage 的一切（含其 options bag 與 `pageViewStore` 傳遞路徑 `App.tsx:213,246`）；
`preloadMySessionsPageInApp` 與 lazy 預熱鏈（`sessionViews.js:253,533,551,602`）；
`surface="my-sessions-page"`、全部 testid／`data-my-*`／id／class 字面／文案；
`#tab-my-sessions` route 與切頁；`pageViewStore` 的 shape 與 `publishPageView` 語意
（`src/pageViewStore.ts`、`main.js:208-223`——搬運不重造）。

## Ground truth（2026-08-26 開單時實測；動手前自行重驗）

- `pageViewStore` 是 main.js 模組級 store（`:208-213`），channel `"me" | "mySessions"`，
  由 `publishPageView`（`:215-223`）寫入；呼叫點 `:362`、`:410`、`:453`（
  `onCreatedSessionFocus` ack 內）、**`:525`（`showMySessionsPage` 內設定
  focus id／reason 後發布——本批焦點管道的上游觸發器）**與 Me 的
  `publishMePageView`（`:372`）。
  **MePage 與 MySessions 共用同一實例**；MePage 經自己的 options bag 取得（
  `App.tsx:213` 解構、`:246` 顯式傳入），該路徑本批不動。
- 批 2A 後 MySessions 剩餘 8 options 欄：`createdSessionId`、`highlightSessionId`、
  `notificationSettings`、`pageViewStore`、`onCreatedSessionFocus`、`onBack`、
  `onSignIn`、`onEnablePush`；其中前四者的權威已在 `pageViewStore`（options 僅
  mount 初值 fallback，`MySessionsPage.tsx` 的 `pageView` 解析）。
- `configureAppServicesInApp(controller)` 是批 1 新碼（`App.tsx:866` 區、
  `main.js:736` 呼叫），**非凍結 legacy adapter**，簽名可演進。
- Messages 直接 portal 樣板：`App.tsx` `messagesRoot` 的 `createPortal`（批 1 落地）。
- `setMySessionActionScope`／`syncPendingMySessionActions` 在 `pageViews.js` 尚有
  bridge 之外的 caller（`:40-46` auth 差分路徑等）——**改共享機制前列全 caller 清單**，
  逐一判定「隨 bridge 退役」vs「服務其他 surface 保留」，寫進回報。
- 測試面：`renderMySessionsPage(` 測試呼叫已為 0；harness rAF clone 是唯一
  `scheduleMySessionsCreatedFocus` 邏輯副本；`react-page-focus.spec.js` created-session
  測試（`:137` 附近）走 harness clone 管道；`tests/session.spec.js:532,884,928` 是
  local suite 的真路徑焦點覆蓋（不動）。
- 量化基準（2A 後）：`__importAppModule(`＝**122**；main gzip 191,763（餘 657 B）、
  MySessions lazy 16,282／4,791（餘 709 B）、total 256,779（餘 2,283 B）；
  mock 286 passed／4 skipped。**收掉 adapter 鏈預期回收 main 若干餘裕，回報淨值。**

## 作法要求

### A. AppServices 擴充（`src/app/AppServicesProvider.tsx`）

- `configureAppServicesInApp` 改收 typed services 物件（形狀可由你定，例如
  `{ controller, pageViewStore, mySessionsApp }`），main.js 在 `:736` 一次注入：
  - `pageViewStore`：現有實例，搬運不重造。
  - `mySessionsApp`（app 層 callback，非 controller）：`onBack`（`showMapPage`）、
    `onSignIn`（`openSafeLogin({action:"my-sessions"})`）、`onEnablePush`、
    `onCreatedSessionFocus`（現 `main.js:446-455` 的 ack closure，語意逐字保留：
    比對 id→清空模組變數→`publishPageView("mySessions")`→回 bool）。
- 新 hooks（feature 限定，維持「不暴露完整 services」原則）：
  - `useMySessionsPageView()`：訂閱 `pageViewStore` 的 `"mySessions"` channel，回傳
    focus id／reason／notificationSettings 切片。
  - `useMySessionsAppActions()`（或併入既有 `useMySessionsActions`，擇一並說明）：
    上列四個 app callback。
- 防替換 guard 沿用批 1 語意（同一組 services 不可換）。

### B. rAF 焦點管道 React 化（單一來源）

- 把 `scheduleMySessionsCreatedFocus` 的邏輯（selector 字串、guest-request 謂詞、
  one-shot ack 短路、`preventScroll` 全部逐字保留）移入 strict TS 模組（建議
  `src/mySessionsCreatedFocus.ts` 或頁面同檔），由 `MySessionsPage` 的 commit effect
  直接排程；刪除 `pageViews.js` 原件與 harness clone——全庫恢復單一來源。
- `onCreatedSessionCommit`／`onStoreCommit` 的 MySessions 專屬接線隨 adapter 退役；
  頁面 commit effect 已自持 scope 重設（2A 落地），順手移除 bridge 的無條件
  `syncPendingMySessionActions`（移交觀察 1）。

### C. 收線

1. `App.tsx`：`MySessionsDestination` 改直接 portal 到 `#my-sessions-root`
   （比照 Messages）；刪 `mySessionsPages` slot、`renderMySessionsPageInApp`、
   `MySessionsPageOptions` import 與剩餘 options 消費;`rootElement` 改由 portal 目標
   元素提供。`resetKey` 比照 Messages 處理並說明。
2. `MySessionsPage.tsx`：刪全部 options props;`pageView`／app actions 改 hooks 單源;
   `MySessionsPageOptions` 型別整個退役。
3. `main.js`：刪 `mountMySessionsDestination`＋呼叫＋import;
   `createdSessionFocusId`／`Reason` 模組變數與 `publishPageView` 機制保留原位。
4. `sessionViews.js`／`pageViews.js`：刪上列解凍項;`setMySessionActionScope` 其餘
   caller 依全清單判定處理。
5. 測試：created-session 測試改走 production 管道（真 `MySessionsPage`＋真焦點模組;
   oracle——8842 聚焦、ack 恰一次、console 零錯——逐字保留）;harness 刪 clone 後
   同步更新;`__importAppModule` 只准真退役（拼法禁令沿用）。

## 不在範圍

- MePage／NearbyDrawer 的任何遷移;Me 的 pageViewStore 消費路徑。
- `syncCommit` 三 caller、`mountSheet` 殼、路由、新依賴、UX／文案／CSS。
- `pageViewStore` shape 重設計或改 channel。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄;同批 2A）

typecheck／lint／prettier:check／build／check:production-bundle（main／MySessions lazy／
total 三組對照＋淨值,超 gate＝BLOCKED）／test:mock（≥286 passed）／test:local
（先 `npx supabase start`;若 fixture 污染紅,依標準 guarded reset 後重跑並回報三拍）／
`git diff --check`。

## 回報合約

寫 `docs/arch-dispatch-2026-08-26-batch2B-mysessions-report-codex.md`（不 commit、不 push），
必含：接線前後對照（main.js MySessions 鏈應歸零）、`setMySessionActionScope` 全 caller
清單與逐一判定、焦點管道搬移的逐字保真自證（selector／謂詞／ack 短路）、三個移交觀察
的收掉證明、`__importAppModule` 對帳、收尾矩陣逐字輸出、Codex 五問（第 5 問答
「此雙 store 承載模式對 Me／NearbyDrawer 的複製建議」）、未做／疑義／BLOCKED。
