# 批 1 派工單：Messages-only 容器化試點

- 日期：2026-08-26。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`。
- 開工基準：`3c7c568`（批 0.5 已 ACCEPTED 生效；working tree 應乾淨，否則停手回報）。
- 解凍依據：`.claude/rules/react-migration.md`「React ownership 分批解凍（2026-08-26）」
  第 1–3 條。本批解凍清單=`mountMessagesDestination` options bag、`pageViews.js` 的
  `renderMessagesPage` bridge、`App.tsx` 的 `renderMessagesPageInApp`、MessagesPage props
  fallback 雙源。**清單外的 adapter、殼與同步 commit 契約仍凍結,一票否決。**
- 目標：建立「React 頁面直接訂閱 store＋feature 限定 typed action hook」的可複製樣板,
  並證明接線真的變少。這是批 2–3 逐頁複製的模,寧可小而乾淨,不求多。
- 你不 commit、不 push;working tree 交驗收方。

## Ground truth（2026-08-26 開單時實測;與覆核文件不符處以本節為準）

現況接線鏈（Messages 一條更新要經過的層）：

- `src/main.js:111` import `renderMessagesPage`;`:528-540` `mountMessagesDestination()`
  組 options bag（`courts: getAppState().courts`、`groups: state.groups`、
  `onOpenChat: (sessionId) => controller.openSessionChat(sessionId)`、
  `sessionStore: controller.sessionStore`）;`:780` 生命週期呼叫點;
  `:193` route 表 `messages: { elementId: "messages-page", hash: "#tab-messages" }`。
- `src/views/pageViews.js:6、:15、:316-318`:`renderMessagesPage` bridge,轉呼
  `renderMessagesPageInApp`,未注入時 throw。
- `src/app/App.tsx:930` `renderMessagesPageInApp`（module-level snapshot 入口）;
  `:254-279` `MessagesDestination` 消費 `slot.options`,帶預設值
  `courts = []、groups = EMPTY_MESSAGES_GROUPS、onOpenChat = noop`;
  `:115-117` `loadMessagesPage()` lazy import。
- `src/pages/MessagesPage.tsx:92-93`:props＋`useStoreSelector(sessionStore, "mySessions",
  selectControllerMySessionsView, null)` 雙源樣板;`:76` `data-testid="messages-row-…"`。
- 型別地基:`ControllerApi` 在 `src/controllerContracts.ts`;
  `src/controller/controllerApiContract.ts:13-19` 是 JS factory→strict TS 契約的
  exact-key 編譯期橋（缺鍵、多鍵都編譯失敗）。`openSessionChat` 實作在
  `src/controller/chatController.ts:208`,回傳 `ControllerSurfaceHandle | null | undefined`。
  selector 既有層在 `src/sessionSelectors.ts`。
- 測試面實況:
  - `tests/react-page-focus.spec.js` 的 `__importAppModule` 直呼在 **`:22`、`:96`、`:99`**
    （覆核文件寫 :21/54/57,行號已漂移,以此為準;共 3 處不變）。
  - `tests/messages-page-dom.test.js` 存在,測 React 元件本體。
  - `tests/react-surface-lifecycle.test.js` 與 `tests/fixtures/appRuntime.js` **實測皆無**
    messages 相關字面斷言/映射——與覆核文件預期不同,本批預期對這兩檔零變更;
    若實作中發現例外,回報說明,不擅自擴scope。
- 量化基準（覆核文件 §3.4）:tests 內 `__importAppModule(` 共 141;main chunk gzip
  191,332（gate 192,420,餘 1,088 B）;total gzip 256,546（gate 259,062,餘 2,516 B）;
  mock 286 passed／4 skipped。

## 作法要求

### A. AppServicesProvider（新碼,strict TS）

- 在 `src/app/` 新增 provider:main.js 建立 controller 後,把穩定的 controller／store
  實例**一次性**注入 React root（經 App mount 的 prop 或等價單一入口）。
- 原則（RO 邊界與覆核文件 §2-2）:任何元件**不得**經 context 取得完整 controller;
  provider 內部持有,對外只暴露 feature hooks。不建 service locator。

### B. feature hooks:`useMessagesState()`＋`useMessagesActions()`

- 回傳型別就是功能契約,自 `ControllerApi` 切片（`Pick`／衍生型別）,不另立權威。
- state 側:沿用 `sessionSelectors.ts` 既有 selector（`selectControllerMySessionsView`）,
  **hook 內不得長出第二套 derive 邏輯**;courts 來源改由 services 提供,不得繞過
  `dataApi` 邊界另闢讀取路。
- action 側:`openSessionChat` 等 Messages 所需 action,型別對齊 `ControllerApi`。

### C. 收線（本批的「減法」,是驗收主體）

1. `src/pages/MessagesPage.tsx`:移除 props fallback 雙源,單源自 hooks;
   `onOpenChat` 改由 `useMessagesActions()` 取得。
2. `src/app/App.tsx`:`MessagesDestination` 不再消費 `slot.options`（`EMPTY_MESSAGES_GROUPS`
   ／`noop` 預設值隨之退役;若仍被他處引用則保留並回報）;移除 `renderMessagesPageInApp`。
3. `src/views/pageViews.js`:移除 `renderMessagesPage` bridge 與對應注入位。
4. `src/main.js`:移除 `mountMessagesDestination`、`:111` import 與 `:780` 呼叫點;
   Messages 的資料更新改由 React 訂閱 store 自然驅動,main.js 不再推 options。
5. `tests/react-surface-lifecycle.test.js` 等白箱若有因上述移除而失效的字面斷言,
   同批退役（實測預期無;有就列清單回報）。

### D. 凍結沿用（不可變,驗收逐項比對）

- `#tab-messages` route 與切頁仍由 `main.js` 既有機制負責——路由狀態機**不在**本批。
- `data-testid`（`messages-row-*`）、`AppErrorBoundary surface="messages-page"`、
  lazy loading 行為（`loadMessagesPage`）、空狀態文案、焦點／Escape 行為全部不變。
- 不動其他頁面／sheet 的 adapter,不動 `sheets.js` 殼,不動 3 個 `syncCommit` caller。

### E. 測試面

1. `tests/react-page-focus.spec.js`（`:22/:96/:99` 直呼）:這是**藉 adapter 進入的
   行為測試**,守跨 rerender 焦點還原——改寫為 UI 驅動（真實操作觸發 rerender）,
   **斷言語意（oracle）不得弱化或刪除**;禁止直接刪測試。
2. `tests/messages-page-dom.test.js`:改為注入 fake store／services 後沿用,斷言語意不變。
3. 新增 hooks 的單元測試:至少覆蓋「state 切片與 selector 一致」「action 轉呼 controller
   對應方法」兩件事,使用會重試的斷言,不寫一次性 sleep。

## 不在範圍

- Me／NearbyDrawer／MySessions 等其他頁面（批 2 之後）;sheet 殼（批 4);
  `syncCommit`（批 5);TS 化存量 legacy（批 6)。
- 路由／history、UX、文案、CSS、`#9db3a4`（已拍板關閉）。
- 任何新第三方依賴。

## 收尾標準矩陣（全部實跑、不接 pipe、逐字抄錄輸出）

| 檢查 | 指令 | 通過標準 |
| --- | --- | --- |
| 型別 | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |
| Bundle | `npm run check:production-bundle` | 全部 within;main／total／最大 lazy chunk 三數字與基準對照,淨增減明列 |
| Mock | `npm run test:mock` | 全綠;時間與 286/4 基準對照 |
| Local | `npm run test:local`（需 `npx supabase start`） | 全綠——本批動 React 條件渲染接線,不得以「零 migration/RPC」豁免 |
| 空白 | `git diff --check` | 無輸出 |

## 回報合約

寫 `docs/arch-dispatch-2026-08-26-batch1-messages-report-codex.md`（不 commit、不 push),必含:

1. **接線前後對照**:Messages 一條更新經過的檔案數與層數,before/after 列表（含被刪的
   export／import 清單）。
2. **Codex 五問逐題作答**:接線是否真的變少?context/hook 是否隱藏了依賴?bundle 是否
   增加?測試是否更接近使用者行為?此模式是否適合複製到其他頁?——答案須引具體證據。
3. 收尾標準矩陣逐字輸出;`rg -o '__importAppModule\(' tests --no-filename | wc -l` 前後值
   （預期 141→約 138,降幅小屬正常）。
4. 每項凍結沿用（§D）的自證:指出對應 testid／文案／lazy／boundary 在改後程式中的位置。
5. 「未做」清單與疑義;BLOCKED 判準:凍結契約與目標衝突且解凍清單未涵蓋、或需要動
   不在範圍檔案時,停手回報,不自行裁決。
