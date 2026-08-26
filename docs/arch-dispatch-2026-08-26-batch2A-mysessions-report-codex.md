# 批 2A 回報：MySessions 資料與 action 單源化

- 日期：2026-08-26
- 派工單：`docs/arch-dispatch-2026-08-26-batch2A-mysessions.md`
- 開工狀態：working tree 乾淨；實際 HEAD `100f8f8`。`736ec6c` 是 HEAD 的直接 parent，
  中間只有新增本派工單的 commit，accepted 批 1 implementation baseline 未漂移。
- 結果：完成，無 BLOCKED；未 commit、未 push。

## 1. 接線前後

### Before

- `mountMySessionsDestination()` 每次 mount 組 31 欄 options：7 資料、16 action、8 個
  page-view／非 controller 欄位。
- `MySessionsPage` 同時讀 controller store、pageViewStore 與資料 props fallback；controller
  action 由 16 個 props 注入。
- 測試以 7 檔 28 個 `renderMySessionsPage(...)` 直呼點直接餵 groups/action options。

### After

- `src/app/AppServicesProvider.tsx` 新增兩個具名 feature hooks：
  - `useMySessionsState()` 沿用 `selectControllerMySessionsView`，投影 groups、status、
    errorMessage、authenticated、actionScopeKey，加 courts channel；沒有第二套 derive。
  - `useMySessionsActions()` 從 `ControllerApi` 14 個方法組出 16 個 action 欄，並以穩定
    controller identity memoize；accepted／declined 四個 decision payload 逐字保留。
- `MySessionsPage` 的 controller 資料與 action 只來自 hooks；`pageViewStore` 與 8 個剩餘欄位
  仍走原 options／fallback 管道，留給 2B。
- `mountMySessionsDestination()` options bag 實測為 8 欄：`createdSessionId`、
  `highlightSessionId`、`notificationSettings`、`pageViewStore`、`onCreatedSessionFocus`、
  `onBack`、`onSignIn`、`onEnablePush`。
- 7 檔 28 個 production adapter 直呼全數改走 test-only Provider harness；
  `rg -o 'renderMySessionsPage\(' tests --no-filename | wc -l` 為 0。

### actionScopeKey 語意

`actionScopeKey` 離開 adapter options 後，頁面在既有 layout commit 尾端以 hook 的 live
`viewGeneration` 呼叫既有 `setMySessionActionScope`，再 `syncPendingMySessionActions`；如此帳號 epoch
切換仍會清掉舊 pending，而同 epoch store rerender 仍保留 pending。

`pageViews.renderMySessionsPage` 的函式名、參數、mount、focus commit 與 sync commit callback 都保留；
其中兩個舊 options-based action-scope 呼叫只在 legacy caller 仍傳 `actionScopeKey`／`sessionStore`
時執行，避免 2A 的 8 欄 caller 以 `null` 覆寫 hook 的 live scope。`setMySessionActionScope` 本體與
`scheduleMySessionsCreatedFocus` 本體零變更。

## 2. 30 個測試觸點逐條對照

派工 ground truth 明列的是 **28 個既有 adapter 直呼**；回報合約寫「30 處直呼」。本表以
28 個實際直呼逐一對帳，再列派工要求新增的 2 個 hooks unit 作第 29–30 項。兩者不是偽稱為
既有直呼；新的 React body DOM test 另列於表後。

| # | 測試／原 call site | 原 oracle | Before → After |
| ---: | --- | --- | --- |
| 1 | react-page-focus：page adapter focus，首次 mount | MySessions segmented control 可聚焦 | adapter options → Provider harness fake store/services |
| 2 | 同測試，第二次 render | 同一 control node 保持 focus/connected | adapter rerender → 同 harness store emit/update |
| 3 | react-page-focus：created-session focus | 單次 mount 後 store emit 聚焦 8842，ack 恰一次 | custom controller store 經 harness Provider；test-only commit scheduler保留同一 rAF/ack oracle；真 adapter 路徑另由 local create flow 全綠覆蓋 |
| 4 | account-settings：Me owns visibility | MySessions 不出現已移走設定 | grouped adapter fixture → canonical empty store |
| 5 | account-settings：accept initial | accept 後焦點落更新卡 | `onAccept` prop → fake controller `reviewMySessionParticipant(...,"accepted")` |
| 6 | 同測試：account-a withdraw | pending action 跨 rerender | `onWithdraw` prop → fake controller action＋同 epoch store |
| 7 | 同測試：account-b replacement | 新 epoch 不繼承 pending/error | `actionScopeKey` prop → fake store `authEpoch` |
| 8 | account-settings：report dialog focus，初始卡 | 非 drawer dialog 關閉不偷 drawer focus | adapter fixture → Provider harness |
| 9 | 同測試：背景移除卡 | trigger 消失後 focus 規則不變 | adapter rerender → empty store emit |
| 10 | account-settings：report dialog content，初始卡 | 標題、radio、submit 完整 | adapter fixture → Provider harness |
| 11 | 同測試：背景移除卡 | dialog 內容不被背景重繪抹掉 | adapter rerender → empty store emit |
| 12 | session-lifecycle：cancel withdrawal | 取消 confirmation 後按鈕可重開 | `onWithdraw` prop → fake controller action |
| 13 | session-lifecycle：accepted joined focus | joined success 聚焦 upcoming card，無 create 文案 | adapter fixture → canonical accepted store |
| 14 | session-lifecycle：pending guest focus | requested outcome 聚焦 withdraw，無 create 文案 | adapter fixture → canonical requested store |
| 15 | session-lifecycle：join/create push | create success prompt 與 push action | data/action props → store＋controller action；notification options 保留 |
| 16 | session-lifecycle：undecided candidates | 四個 private surface 的候選球場／時間格式 | 非 canonical 同 session 多角色 fixture → 4 個等價 canonical session；文字 oracle不變 |
| 17 | session-lifecycle：decided candidates | 已定案球場／時間、無第二球場 | upcoming/invite 拆為等價 canonical session；文字 oracle不變 |
| 18 | session-lifecycle：pending cancel rerender | initiating button disabled、錯誤與 focus 保留 | closure adapter rerender → same harness update |
| 19 | session-lifecycle：escaped invite | payload escaped、stable testids/data attributes | pre-grouped invite → canonical invite store；invalid timestamp 改合法未來值，XSS payload oracle仍在其他顯示欄位 |
| 20 | session-lifecycle：invite response rerender | accept pending、失敗 alert focus、decline payload | callback props → `respondInvite` accepted/declined fake controller |
| 21 | session-lifecycle：declined history | neutral participation wording | adapter history fixture → canonical declined store |
| 22 | auth-forms：accepted chat access | accepted 可聊天、無 retired contacts | adapter groups → canonical accepted store |
| 23 | auth-forms：chat unread | 3 unread 與 0 unread 文案/aria | adapter groups → canonical store selector |
| 24 | auth-forms：host request NTRP | null NTRP 顯示「尚未填寫」，非 0.0 | pre-grouped host request → store roster；harness補 canonical guest/requested role/status |
| 25 | map-and-bootstrap：segment snapshot initial | 初始 hosted row 建立可排隊 click 的 node | adapter initial render → Provider harness mount |
| 26 | 同測試：latest snapshot | queued click 使用最新 store 內容 | adapter rerender → same harness update/store emit |
| 27 | navigation-shell：empty cases | 全空／部分空／history 三種 DOM oracle | adapter closure → harness closure，三種 canonical store state |
| 28 | chat-settings-filters：chat/block split | accepted chat、requested 無 chat、block list 只在 Me | MySessions data/action props → store＋`openSessionChat` fake service；Me adapter保留 |
| 29 | 新 `useMySessionsState` unit | selector/viewGeneration/error/status/groups/courts 逐值一致 | 新增 `deepStrictEqual`＋retry assertion |
| 30 | 新 `useMySessionsActions` unit | 14 controller methods與 4 decision binding payload | 新增 `deepStrictEqual`＋retry assertion |

另新增 React body DOM test，鎖 heading、兩個 segment testid、`my-session-card` class、session id 與
球場文案。`tests/fixtures/mySessionsAppHarness.tsx` 只在 dev test import 可達；production build 不引用。

Targeted affected desktop suite 最終為 108 passed／1 skipped；完整 mock 的同批案例也在 mobile
Chromium 通過。初跑有 5 個 fixture 因 selector 單源化而紅：同一 session 同時扮演 host／invite／
request／accepted，以及 invalid `startAt` 被 canonical selector 分入 history。已拆成語意等價的
canonical sessions／合法時間；所有既有文字、安全、focus 與 pending oracle保留。

## 3. `__importAppModule` 指標

```text
before: 139
after:  122
delta:  -17
```

以上沿用派工的 call-expression 口徑：
`rg -o '__importAppModule\\(' tests --no-filename | wc -l`。這會自然排除
`tests/fixtures/appRuntime.js` 的 `globalThis.__importAppModule = …` 定義；該 fixture 本批零變更。

沒有把任何 `__importAppModule("x")` 改拼為 `/src/` direct import。只有當原 importer 的唯一
production 消費是 `renderMySessionsPage` 時才整行退役；仍需其他 production export 的 importer
逐字保留。

| 檔案 | before | after | delta | 來源 |
| --- | ---: | ---: | ---: | --- |
| `react-page-focus.spec.js` | 3 | 3 | 0 | 同行仍需 Me/create/controller exports |
| `account-settings-smoke.spec.js` | 18 | 11 | −7 | 7 個 only-MySessions import 真退役；混合 import 保留 |
| `session-lifecycle-smoke.spec.js` | 32 | 26 | −6 | 6 個 only-MySessions import 真退役；sheet exports 保留 |
| `auth-forms-smoke.spec.js` | 34 | 31 | −3 | 3 個 only-MySessions import 真退役 |
| `map-and-bootstrap-smoke.spec.js` | 7 | 7 | 0 | 同行仍需 preload export |
| `navigation-shell-smoke.spec.js` | 1 | 0 | −1 | 唯一 MySessions importer 真退役 |
| `chat-settings-filters-smoke.spec.js` | 18 | 18 | 0 | 同行仍需 Me export |
| 其餘 `tests/` | 26 | 26 | 0 | 零變化 |
| **全部** | **139** | **122** | **−17** | **全為真退役** |

## 4. 凍結面自證

- `renderMySessionsPage`、`renderMySessionsPageInApp` 名稱、facade/bridge export、函式參數與
  mount-once 呼叫點全保留；`mountMySessionsDestination()` 與其唯一 startup call、尾端
  `syncBottomNavigation()` 保留。
- `scheduleMySessionsCreatedFocus` rAF 函式本體零 diff；`onCreatedSessionCommit` 注入仍以 live
  commit 覆蓋 startup options；`onCreatedSessionFocus` one-shot ack payload不變。
- `pageViewStore` 型別、state shape、`publishPageView` 管道零變更；page 仍訂閱
  `pageViewStore` 的 `mySessions` channel，created/highlight/notification fallback 逐字保留。
- `onStoreCommit`／`slot.onCommit` 呼叫仍在 layout commit；`syncCommit` caller 仍恰 3 個：
  `sessionStore.ts`、`SurfaceHost.tsx`、`App.tsx`。
- `surface="my-sessions-page"` 保留。
- `my-sessions-list`／`my-action-card`／`my-session-card` 字面仍分別 6／6／5 處，且
  `content-visibility-contract.test.js` 零 diff。
- `data-testid`、`data-my-*`、section id、aria、文案與 DOM markup 沒有配合遷移修改。
- 5 個非 controller callback 全留：`onBack`、`onSignIn`、`onEnablePush`、
  `onCreatedSessionFocus`、adapter 注入的 `onCreatedSessionCommit`。
- `app-errors.test.js`、`content-visibility-contract.test.js`、`surfaceManifest.js`、
  `react-surface-lifecycle.test.js`、`appRuntime.js` 均零 diff。
- Me／NearbyDrawer、路由、sheet 殼、CSS、dataApi、privacy allowlist、新依賴均零變更。

## 5. Codex 五問

### 1. 接線是否真的變少？

是。main options 31→8，刪 23 欄重複資料/action wiring；MySessionsPage 的 23 個 props
fallback/action 欄退役。更新 hot path 收斂為 controller store emit → feature state hook → page，
action 收斂為 page → feature action hook → controller。pageViewStore／focus adapter 是 2B 明列範圍，
本批沒有假裝刪除。

### 2. context／hooks 是否隱藏依賴？

沒有 generic service locator export。完整 controller 仍只能由 provider 內部 `useAppServices()`
取得；頁面只 import 具名 `useMySessionsState()`／`useMySessionsActions()`。action 型別自
`ControllerApi` Pick/ReturnType 衍生，state 欄位具名且 selector 單一。

### 3. bundle 是否增加？

main 有小幅增加，但 MySessions lazy 與 total 淨下降，全部 within：

| 指標 | `736ec6c` baseline | 本批 | 淨變化 | gate 餘裕 |
| --- | ---: | ---: | ---: | ---: |
| main raw | 655,171 | 655,402 | +231 B | 3,465 B |
| main gzip | 191,672 | 191,763 | +91 B | 657 B |
| MySessions lazy raw | 16,912 | 16,282 | −630 B | 1,718 B |
| MySessions lazy gzip | 4,934 | 4,791 | −143 B | 709 B |
| total JS raw | 842,192 | 841,792 | −400 B | 8,169 B |
| total JS gzip | 256,851 | 256,779 | −72 B | 2,283 B |

hooks 放 main 的成本由頁面 selector/props/action glue 退役對沖；沒有調 gate。

### 4. 測試是否更接近使用者行為？

是。28 個 call site 不再直接把 controller-derived groups/action 注入 production adapter；
測試以 real page click/focus 配合 fake store emit/controller service dispatch。原先不可能由
`selectControllerMySessionsView` 產生的多角色 fixture 被拆為 canonical store state，讓 selector
也進入 oracle。完整 mock 286 passed 與 local 45 passed 包含真實 adapter/controller flow。

### 5. 2B 與批 3 的複製建議

- 2B 先明確設計 pageViewStore／route／notification 等非 controller app service 的 narrow
  provider slice，再搬 `scheduleMySessionsCreatedFocus`；不要把第二 store 偷塞進 controller context。
- 2B 退 adapter 前，保留 local create/join focus、ack one-shot、pending action scope 三組 canary；
  adapter 退役需讓這些走真 App tree，不只走 test harness。
- 批 3 複製時沿用「state/action 分 hook、selector 單源、main options 刪除量對沖 main chunk」；
  對 Me/NearbyDrawer 先分類 controller service、route service、page-local intent，不能複製一個肥
  `useServices()`。

## 6. 收尾標準矩陣

所有指令直接實跑，未接 pipe。

### Typecheck

```text
$ npm run typecheck

> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit

exit 0
```

### Lint

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

exit 0
```

### Prettier

```text
$ npm run prettier:check

> tennis-partner-finder@0.1.0 prettier:check
> prettier --check "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts package.json package-lock.json tsconfig.json vercel.json

Checking formatting...
All matched files use Prettier code style!

exit 0
```

新增的 `tests/fixtures/mySessionsAppHarness.tsx` 不在既有 tests glob，另以 targeted Prettier
write/check 格式化；typecheck 會涵蓋它。

### Build

```text
$ npm run build

> tennis-partner-finder@0.1.0 build
> vite build

vite v6.4.3 building for production...
transforming...
✓ 507 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                              6.19 kB │ gzip:   2.52 kB
dist/assets/index-BUlzCa6l.css                              65.87 kB │ gzip:  10.86 kB
dist/assets/MessagesPage-DISdx87e.js                         1.72 kB │ gzip:   0.87 kB
dist/assets/MePage-B_zlJlAV.js                              16.13 kB │ gzip:   5.12 kB
dist/assets/MySessionsPage-C1l8PWLU.js                      16.28 kB │ gzip:   4.79 kB
dist/assets/sentryBrowserSdk-Czz5dmkg.js                    87.98 kB │ gzip:  29.72 kB
dist/assets/index-CmKMtSBm.js                              655.40 kB │ gzip: 191.76 kB
✓ built in 1.26s

exit 0
```

Vite 的 main >500 kB 提示是既有 warning；固定 production bundle gate 如下通過。

### Bundle

```text
$ npm run check:production-bundle

> tennis-partner-finder@0.1.0 check:production-bundle
> node scripts/check-production-bundle.mjs

production bundle check passed: development E2E hook present, production E2E hook absent; 30 files, 12 demo identifiers absent; main 655402/191763 within 658867/192420; largest app lazy MySessionsPage-C1l8PWLU.js 16282/4791 within 18000/5500; total JS 841792/256779 within 849961/259062; private repository: privateDataRepository-BO_l3teI.js; Sentry: sentryBrowserSdk-Czz5dmkg.js

exit 0
```

### Mock

新 unit 在聚合套件為 `ok 72`～`ok 74`。Playwright 收尾逐字：

```text
  4 skipped
  286 passed (51.8s)
```

exit 0。Node unit 期間 Vite middleware 曾輸出既有 dev WebSocket port 24678 已使用診斷，
但沒有 `not ok`，整體命令 exit 0。

### Local

`npx supabase start` exit 0；不在文件重複 local development keys。`npm run test:local`：

```text
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0

  11 skipped
  45 passed (1.5m)
```

exit 0。

### 空白

```text
$ git diff --check
```

無輸出，exit 0。

## 7. In-app Browser QA

流程：`http://127.0.0.1:5173/` → 點底部「我的球局」 →
`#tab-my-sessions` lazy page → 點「我主揪的 0」 → active＋pressed → 點「回到地圖」 →
`#tab-map`。

| 檢查 | 結果 |
| --- | --- |
| Page identity | title `球咖｜台北網球`；MySessions URL `#tab-my-sessions` |
| Not blank | heading、login region、三段列表與底部導覽皆在 DOM snapshot |
| Framework overlay | 無 |
| Console | 0 errors；1 個既有 `[data] session discovery reached its 200-row safety cap` warning |
| Interaction | hosted segment 變成 `[active] [pressed]`；回到地圖後 URL `#tab-map` |
| Screenshot | 已透過 in-app Browser 顯示 MySessions 首屏；未寫入 repo |

## 8. 未做

- 未退役 `renderMySessionsPage`／`renderMySessionsPageInApp`／facade／bridge／page slot／
  `mountMySessionsDestination`。
- 未改 pageViewStore 設計、shape、publish 管道或 Provider 承載非 controller service。
- 未搬 `scheduleMySessionsCreatedFocus`；未改 rAF query、ack payload 或 one-shot 條件。
- 未改 Me、NearbyDrawer、路由、sheets、CSS、文案、testid、data attributes、section id、
  `syncCommit`、dataApi、依賴或 bundle gate。
- 未 commit、未 push。

## 9. 疑義／BLOCKED

- 回報合約的「30 處直呼」與同派工 ground truth「28 處」數字不一致；已以 28 個實際直呼
  ＋2 個 required hooks unit 完整對帳，沒有虛構 call site。
- 無 BLOCKED。所有固定 gate 與 UI QA 均通過。
