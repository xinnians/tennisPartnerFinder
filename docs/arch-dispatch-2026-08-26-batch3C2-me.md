# 批 3C-2 派工單：Me 管道收斂＋adapter 與整套 slot 機制退役（批 3 收官）

- 日期：2026-08-26。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`；
  前置：批 3C-1 ACCEPTED（`ec20cdd`，驗收紀錄
  `docs/arch-reports/batch-3C1-me-acceptance-2026-08-26.md`——其「重要證偽」節是
  本批 oracle 設計的直接輸入）。治理底線：`docs/arch-q3-whitebox-triage-2026-08-26.md`。
- 開工基準：`ec20cdd`（working tree 應乾淨，否則停手回報）。
- 本批完成後：四頁全同級（main.js 零頁面 mount 鏈）、**整套 slot 機制歸零**、
  `syncCommit` caller 3→2（提前收掉批 5 的一個）。
- 你不 commit、不 push；working tree 交驗收方。

## 解凍清單（Q3 守則：未列即凍結）

- `main.js`：`mountMeDestination`（`:419-434`）與 `:704` 呼叫、`renderMePage` import
  （`:109`）、bag 殘餘 5 欄全部（含 3C-1 補件的 `sessionStore`／`authSession`
  bridge-scope 欄——本批根治後退役）。
- `sessionViews.js`：`renderMePage` facade（`:54-56`）、`renderMePageInApp`／
  `preloadMePageInApp` wrapper（`:236-237`）、`configurePageViews` 呼叫（`:574-577`）
  與 import（`:25`）。
- `pageViews.js`（62 行）：`renderMePage` bridge（`:13-25`，含 scope／sync commit
  callback 與 `preloadAuthenticatedViewsForAuth(authSession)` 觸發）、
  `configurePageViews`（`:8-11`）;**刪檔評估**:剩餘兩個純 DOM helper
  （`renderPlayerLayerToggle:28`、`renderMapDataStatus:46`）遷回 `sessionViews.js`
  或獨立模組,擇一並說明（`react-surface-lifecycle` 頂層 `readFileSync` 七檔
  **不含** `pageViews.js`,搬遷安全,但 main.js import 面同步）。
- `App.tsx` **整套 slot 機制**：`PageSlot`（`:20`）、`mePages`（`:30`／`:83`／
  `:724-725`）、`nextSlotId`（`:71`）、`renderPortals`（`:163`）、`renderPage`
  （`:843` 起）、`commitPageAdapterSynchronously`（`:839`，**`syncCommit` caller
  之一,隨 slot 退役**）、`renderMePageInApp`、`MeDestination` 的 slot 消費。
- `tests/react-surface-lifecycle.test.js` **僅一行**：B 群 `:109` `approvedCallers`
  白名單移除 `"app/App.tsx"`（3→2；`:114` 非空斷言仍成立）。B 群其餘與各群不動。
- Me 的 pending scope／sync：`setMySessionActionScope`／`syncPendingMySessionActions`
  的 Me 路徑遷入 `MePage.tsx`（機制本體 `sessionActions.ts` 不動）。
- `AppServicesProvider`：新增 `useMePageView()`（pageViewStore `"me"` 切片：
  `notificationSettings`＋`presenceLocationStatus`），與 presence 複合組裝。

**仍凍結（一票否決）**：`main.js` `showMePage` 的兩顆 rAF（`:479-486`——route 層
navigation intent,打穩定 `#me-root` data 屬性,與 adapter 無關,**本批不動**）;
`#me-root` 靜態節點、`data-me-heading`／`data-notification-settings-heading`、
`surface="me-page"`、全部 testid／文案;`pageViewStore` shape 與 `publishPageView`
語意;`sessionActions.ts`／`meFocus.js` 機制本體;hover 預熱鏈（`sessionViews.js:581`
`#me-tab` warm 與 `:517`／`:536` preload 表——`preloadMePageInApp` 改直接 import
`App.tsx` export,語意不變）;`react-surface-lifecycle` 除上列一行外全部（含 `:139`
lazy `=3`——MePage 仍 lazy、`:140-141` SESSION_VIEWS 字面——`pointerover…focusin`
與 `if (authSession) preloadAuthenticatedViews()` 必須留在 `sessionViews.js`）;
剩餘兩個 `syncCommit` caller（`sessionStore.ts`、`SurfaceHost.tsx`——批 5）;
MySessions／Messages／Nearby;路由;sheets 殼。

## Ground truth（2026-08-26 開單時實測;動手前自行重驗）

- bag 殘 5 欄：`authSession`（bridge preload＋scope 快照用）、`notificationSettings`、
  `presence`、`pageViewStore`、`sessionStore`（3C-1 補件,live scope fallback）。
- bridge `pageViews.js:13-25`：`:16` `preloadAuthenticatedViewsForAuth(authSession)`
  （**auth 差分 preload 的唯一觸發點**,bridge 死後需等價落點——建議 main.js 在
  auth identity change 與 init 兩處直呼 `sessionViews` 的既有函式,列全 caller 對照）;
  `:17`／`:19-23` scope＋sync commit callback。
- **scope 遷移設計（本批核心）**：比照 `MySessionsPage.tsx:634-635` 的 commit effect
  樣板,但 **key＝live `authSession?.user?.id`（自 `useMeState()` 的 store 訂閱,
  天然 live——正是 3C-1 退件的根治）,不是 `authEpoch`,不可照抄**。
- **oracle 設計（3C-1 驗收「重要證偽」）**：`account-settings:141-146` 型的 Me
  rerender 情境**不咬** scope／sync（載重是 React node identity）。本批必補
  **node-replacement 帳號切換測試**：pending action 進行中→切帳號→原卡片節點被
  替換→斷言新帳號 render 不繼承 stale disabled／error（比照 session-lifecycle
  「stay pending across replacement」模式）。**遷移後 canary 三拍必附**：破壞新
  scope 接線一行→此測試紅→還原 byte-identical 綠。
- slot 機制現況：`renderPortals` 唯一呼叫 `:724`（mePages）;`renderPage` 唯一呼叫
  `renderMePageInApp`;`commitPageAdapterSynchronously:839` 是 `syncCommit` 三 caller
  之一。直接 portal 樣板：Messages（每 render `getElementById`）或 MySessions／
  Nearby（`??=` 快取）擇一並說明;`resetKey=0` 同前例。
- `useMePageView()`：pageViewStore `"me"` channel 切 `notificationSettings`＋
  `presenceLocationStatus`;presence 複合＝profile 側（`useMeState`）＋
  locationStatus（pageView）,組裝落點（hook 或元件）擇一說明,**單一來源**。
- 量化基準：`__importAppModule(`＝**107**;`renderMePage(` 測試呼叫＝0;main gzip
  190,852（餘 1,568 B）、total 255,829、MePage chunk gzip ≈4,997（餘 ≈503 B,
  hooks 仍嚴禁放頁面 chunk）;mock 286 passed／4 skipped。slot 全套退役預期再回收
  main 餘裕,回報淨值。

## 作法要求

### A. `useMePageView()`＋presence 組裝（provider,main chunk）

### B. scope 遷移進 MePage（live user id key）＋node-replacement oracle＋canary 三拍

### C. adapter 與 slot 全套退役

1. `MeDestination` 改直接 portal 到 `#me-root`;`notificationSettings`／`presence`
   改 hooks;bag 歸零、`mountMeDestination` 死。
2. slot 機制五件套（`PageSlot`／`renderPortals`／`renderPage`／`nextSlotId`／
   `commitPageAdapterSynchronously`）全刪;`react-surface-lifecycle:109` 白名單
   同步一行。
3. facade／bridge／`configurePageViews` 退役;auth 差分 preload 等價落點
   （列全 caller 對照,`:140-141` 字面留在 sessionViews.js）;`pageViews.js`
   刪檔評估執行。
4. 反掃：`renderMePage`／`renderMePageInApp`／`mountMeDestination`／`mePages`／
   `renderPortals`／`renderPage(`／`commitPageAdapterSynchronously`／
   `configurePageViews` 於 src＋tests 歸零（新落點的新名稱除外）。

### D. 測試面

harness／dom test 隨過渡欄退役同步;`__importAppModule` 只准真退役、禁換拼法;
node-replacement oracle 為新增必交付項。

## 不在範圍

- 兩顆 rAF;路由;sheets 殼（批 4);剩餘兩個 `syncCommit` caller（批 5);
  TS 化存量（批 6);新依賴;UX／文案／CSS。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄;同 3C-1）

typecheck／lint／prettier:check／build／check:production-bundle（main／total／MePage
chunk 三組對照＋淨值,超 gate＝BLOCKED）／test:mock（≥286＋新 oracle;存量 flake
已立案不算紅,撞到重跑註明）／test:local（污染紅依標準 guarded reset 三拍）／
`git diff --check`。

## 回報合約

寫 `docs/arch-dispatch-2026-08-26-batch3C2-me-report-codex.md`（不 commit、不 push），
必含：scope 遷移對照＋canary 三拍、auth 差分 preload 全 caller 對照、slot 五件套
歸零反掃、`pageViews.js` 處置說明、bundle 三組淨值、`__importAppModule` 對帳、
凍結面自證（兩顆 rAF／`:139`／`:140-141` 零 diff 或仍過）、收尾矩陣逐字輸出、
Codex 五問（第 5 問答「對批 4 sheet 殼的建議」）、未做／疑義／BLOCKED。
