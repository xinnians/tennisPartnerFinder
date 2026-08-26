# 批 2A 派工單：MySessions 資料與 action 單源化（樣板複製）

- 日期：2026-08-26。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`。
- 拍板：批 2 選頁＝**MySessions**（2026-08-26 負責人拍板）。因 MySessions 同時涉及
  「最大 action surface」與「第二個 store＋命令式焦點管道」兩種新複雜度，依
  「一次只加一種」紀律切成 2A／2B：**本批（2A）只做資料與 controller action 單源化；
  pageViewStore、焦點意圖管道與 adapter 退役留給 2B。**
- 開工基準：`736ec6c`（批 1 已 ACCEPTED；working tree 應乾淨，否則停手回報）。
- 你不 commit、不 push；working tree 交驗收方。

## 解凍清單（依 `.claude/rules/react-migration.md`「React ownership 分批解凍」第 1 條明列）

本批解凍（允許自 `MySessionsPageOptions` 型別、`main.js` options bag 與對應白箱斷言移除）：

- 資料欄 7 個：`courts`、`groups`、`status`、`errorMessage`、`authenticated`、
  `actionScopeKey`、`sessionStore`。
- controller action 欄 16 個（對應 14 個 controller 方法；`onAccept`／`onDecline` 共用
  `reviewMySessionParticipant`、`onAcceptInvite`／`onDeclineInvite` 共用 `respondInvite`）：
  `onAccept`／`onDecline`（`reviewMySessionParticipant`）、
  `onAcceptInvite`／`onDeclineInvite`（`respondInvite`）、`onCancel`、
  `onConfirmAttendance`、`onCreateSession`（`openCreateIntent`）、`onDecide`
  （`openSessionDecision`）、`onEdit`（`openSessionEdit`）、`onMarkPlayed`、
  `onOpenChat`、`onOpenSession`、`onRefresh`、`onReportParticipant`
  （`openRosterParticipantReport`）、`onReportSession`（`openSessionReport`）、
  `onWithdraw`。

**仍凍結（一票否決）**：`renderMySessionsPage`／`renderMySessionsPageInApp` 函式名與
mount-once 結構；剩餘 options 欄位（`createdSessionId`、`highlightSessionId`、
`notificationSettings`、`pageViewStore`、`onCreatedSessionFocus`、`onBack`、`onSignIn`、
`onEnablePush`）與 adapter 注入的 `onCreatedSessionCommit`；`onStoreCommit`／
`slot.onCommit` 同步 commit 語意；`pageViewStore` 的形狀與 `publishPageView` 管道
（與 MePage 共用，動它跨批）；`surface="my-sessions-page"`（`tests/app-errors.test.js:117`
鎖名）；`my-sessions-list`／`my-action-card`／`my-session-card` class 字面
（`tests/content-visibility-contract.test.js:26-36` 鎖原始碼）；全部 data-testid、
`data-my-*` 屬性、區塊 id 與文案。

## Ground truth（2026-08-26 開單時實測；動手前自行重驗）

- `src/main.js:446-487`：`mountMySessionsDestination` options bag **31 欄**
  （7 資料＋16 action＋8 其餘，加總以指令複算過）；`:765` 唯一
  呼叫點（**已是 mount-once**，資料更新本來就走 store 訂閱）；`:488` 尾隨
  `syncBottomNavigation()`。
- `src/pages/MySessionsPage.tsx`（853 行）`:687-708`：**三源訂閱已存在**——
  `sessionStore` 的 `mySessions`（`selectControllerMySessionsView`）＋`courts` channel、
  `pageViewStore` 的 `mySessions` channel、props fallback。本批只收掉**前兩者對應的
  props fallback**；`pageView` 訂閱與其 fallback 欄位保留給 2B。
- 14 個 action 全部存在於 `ControllerApi`（`src/controllerContracts.ts:260-311`）；
  5 個 callback **不在** controller（`onBack`＝路由、`onSignIn`＝profile-auth、
  `onEnablePush`＝notification feature、`onCreatedSessionFocus`／`onCreatedSessionCommit`
  ＝main.js 模組變數與 pageViews rAF 管道）——**本批一律保留原樣**。
- `src/app/App.tsx:271-296`：`MySessionsDestination` 整包 spread `slot.options`，無預設值；
  `:287` `surface="my-sessions-page"`；`:931-937` `renderMySessionsPageInApp`。
- selector 既有層：`src/sessionSelectors.ts:31-43` `selectControllerMySessionsView`
  （回傳含 `authenticated`／`error`／`groups`／`status`／`viewGeneration`）。
- 測試面：`renderMySessionsPage` 白箱直呼 **7 檔 28 處**（react-page-focus 3、
  account-settings 8、session-lifecycle 10、auth-forms 3、map-and-bootstrap 2、
  navigation-shell 1、chat-settings-filters 1；以 `grep -rno 'renderMySessionsPage('`
  計呼叫點，解構 import 行不計；行號開工時自行 rg）。
  `tests/` 尚無 MySessions 版 dom test。`react-surface-lifecycle.test.js` 與
  `appRuntime.js` 無 my-sessions 字面，預期零變更。
- 量化基準：`__importAppModule(` ＝ **139**（批 1 補件後新基準）；main gzip 191,672
  （餘 748 B）、total gzip 256,851（餘 2,211 B）、**MySessionsPage lazy chunk 16,912／
  4,934（gate 18,000／5,500，gzip 僅餘 566 B——全庫最緊）**；mock 286 passed／4 skipped。

## 作法要求

### A. feature hooks（放 `src/app/AppServicesProvider.tsx`，即 main chunk，不放頁面 chunk）

- `useMySessionsState()`：自 `selectControllerMySessionsView` 切片
  `groups`／`status`／`errorMessage`（=selector 的 `error`）／`authenticated`／
  `actionScopeKey`（=selector 的 `viewGeneration`），加 `courts` channel。
  **hook 內不得長出第二套 derive**；沿用既有 selector。
- `useMySessionsActions()`：上列 16 個 action 欄（自 14 個 controller 方法組成），
  型別自 `ControllerApi` `Pick`／衍生切片，
  以穩定 controller identity memoize。`onAccept`／`onDecline` 的 `"accepted"`／
  `"declined"` 參數綁定與 `onAcceptInvite`／`onDeclineInvite` 同理，比照 main.js
  現行 closure 語意，不改 payload。

### B. `src/pages/MySessionsPage.tsx`

- 資料與 action 改 hooks 單源；刪除對應的 props fallback（`:691-700` 中屬解凍欄者）
  與 `MySessionsPageOptions` 解凍欄位。
- **保留**：`pageViewStore` 訂閱（`:690`）與 `highlightSessionId`／`createdSessionId`／
  `notificationSettings` 的 pageView 解析（`:702-708`）、`:710-719` 的
  `onCreatedSessionCommit`／`onStoreCommit` commit 回推、`rootElement`、
  5 個非 controller callback。這些是 2B 的事。

### C. `src/main.js`

- options bag 31 欄 → **8 欄**：`createdSessionId`、`highlightSessionId`、
  `notificationSettings`、`pageViewStore`、`onCreatedSessionFocus`、`onBack`、
  `onSignIn`、`onEnablePush`（此清單即完整保留集）；刪除的 23 欄接線碼一併清掉。
- `mountMySessionsDestination` 本體、呼叫點與 `syncBottomNavigation()` 尾呼保留。

### D. 測試面（本批工作量主體）

1. 28 個直呼點逐測試處置，優先序：**(1) 真實 UI 驅動**（操作真實頁面觸發 store 變化）
   →**(2) fake store／services harness**（新增 `tests/fixtures/mySessionsAppHarness.tsx`，
   仿 `messagesAppHarness.tsx`：fake `sessionStore`＋`Pick` 出的 fake actions 經
   `AppServicesProvider` 注入；`pageViewStore` 與剩餘欄位仍可經 options 傳）
   →**(3) 保留 adapter 直呼**（僅限該測試只依賴仍凍結欄位時）。
2. **oracle 不得弱化或刪除**；回報必附 28 處逐條 before→after 對照表
   （測試標題＋守什麼＋處置方式）。無法在不弱化 oracle 下改寫的測試＝BLOCKED 回報，
   不得硬改。
3. `__importAppModule` 計數：新基準 **139**，只有真退役才可下降；
   **禁止把 `__importAppModule("x")` 改拼為 `await import("/src/…")`**（批 1 補件
   B1-FU-1 的教訓，這是退件級違規）；回報逐檔對帳降幅來源。
4. 新增 `tests/my-sessions-page-dom.test.js`（仿 `messages-page-dom.test.js`）：
   React 本體渲染斷言＋兩個 hooks unit（state 切片與 selector 逐值一致、action 轉呼
   controller 與參數綁定正確），用 `deepStrictEqual` 與 retry assertion。
5. 字面契約不可動：`app-errors.test.js`、`content-visibility-contract.test.js`、
   `tests/fixtures/surfaceManifest.js`、`react-surface-lifecycle.test.js`、
   `appRuntime.js`。

## 不在範圍（2B 或更後）

- `pageViewStore` 的任何設計變更、provider 擴充承載非 controller 服務。
- adapter 退役：`renderMySessionsPage` bridge、facade export、`mountMySessionsDestination`
  與 `renderMySessionsPageInApp` 都**保留**。
- `scheduleMySessionsCreatedFocus` rAF 焦點管道、`setMySessionActionScope`。
- Me／NearbyDrawer、路由、sheets、`syncCommit`、新依賴、UX／文案／CSS。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

| 檢查 | 指令 | 通過標準 |
| --- | --- | --- |
| 型別 | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Prettier | `npm run prettier:check` | exit 0 |
| Build | `npm run build` | exit 0 |
| Bundle | `npm run check:production-bundle` | 全部 within；main／total／**MySessionsPage lazy chunk** 三組數字與基準逐項對照、淨增減明列。**超 gate＝BLOCKED 回報，不得調 gate** |
| Mock | `npm run test:mock` | 全綠，計數不低於 286 passed |
| Local | `npm run test:local`（需 `npx supabase start`） | 全綠 |
| 空白 | `git diff --check` | 無輸出 |

## 回報合約

寫 `docs/arch-dispatch-2026-08-26-batch2A-mysessions-report-codex.md`（不 commit、不 push），
必含：30 處直呼逐條對照表、Codex 五問（第 5 問改答「2B 與批 3 的複製建議」）、
`__importAppModule` 新計數與逐檔對帳、凍結面自證（§解凍清單「仍凍結」逐項）、
收尾矩陣逐字輸出、「未做」清單、疑義／BLOCKED。
