# 批 1 回報：Messages-only 容器化試點

- 日期：2026-08-26
- 派工單：`docs/arch-dispatch-2026-08-26-batch1-messages.md`
- 開工狀態：working tree 乾淨；實際 HEAD `3a15132`。`3c7c568` 是 HEAD 的 ancestor，
  中間只有新增本派工單的 `3a15132`，未改動本批 `src/`、`tests/` 或生效規則。
- 結果：完成，待驗收方重跑與裁決；未 commit、未 push。

## 1. 接線前後對照

### Before：一個 Messages 容器的建立／資料依賴有 5 檔、5 層

1. `src/main.js`：`mountMessagesDestination()` 讀取 courts、groups、controller action 與
   `sessionStore`，組成 options bag，經 `renderMessagesPage()` 主動推入。
2. `src/sessionViews.js`：facade export `renderMessagesPage()` 轉呼 `pageViews`。
3. `src/views/pageViews.js`：bridge 持有注入的 `renderMessagesPageInApp`，再轉呼 App。
4. `src/app/App.tsx`：`renderMessagesPageInApp()` 把 options 寫入 module-level `messagesPages`
   snapshot；`MessagesDestination` 再解 options 與預設值。
5. `src/pages/MessagesPage.tsx`：props 與 `sessionStore` selector 雙源 fallback，並從 props
   取得 `onOpenChat`。

既有 store emit 實際已能直接觸發 MessagesPage 內的 selector，所以上述鏈同時還存在
「初始 props 主動推送＋store 訂閱」雙主權，這才是本批刪除的核心。

### After：每次 Messages 資料更新只經 3 檔、3 層

1. controller 擁有的 `sessionStore` emit `mySessions`／`courts` channel。
2. `src/app/AppServicesProvider.tsx` 的 `useMessagesState()` 訂閱 channel，groups 逐字沿用
   `selectControllerMySessionsView`；`useMessagesActions()` 只暴露 `openSessionChat`。
3. `src/pages/MessagesPage.tsx` 消費 feature hooks，React 自然 rerender。

一次性建立只剩 `main.js` 在 controller 建立後呼叫
`configureAppServicesInApp(controller)`；`App.tsx` 以同一個穩定 controller 值包住 React root，
並直接對既有 `#messages-root` 建立 portal。這條設定路徑不在資料更新 hot path。

### 刪除的 export／import／主動接線

- `src/main.js`：刪 `renderMessagesPage` import、`mountMessagesDestination()` 與 init 呼叫。
- `src/sessionViews.js`：刪 public `renderMessagesPage` export、`renderMessagesPageInApp` wrapper
  與 `configurePageViews` injection key。
- `src/views/pageViews.js`：刪 `renderMessagesPageInApp` dependency slot，以及
  `renderMessagesPage` bridge export。
- `src/app/App.tsx`：刪 `MessagesPageOptions` import、`messagesPages` snapshot slot、
  `EMPTY_MESSAGES_GROUPS`，以及 `renderMessagesPageInApp` export。
- `src/pages/MessagesPage.tsx`：刪 `MessagesPageOptions`／`MessagesPageProps`、props fallback
  雙源與頁內直接 store prop。

收尾 `rg` 實測 `renderMessagesPage|renderMessagesPageInApp|mountMessagesDestination|`
`EMPTY_MESSAGES_GROUPS|MessagesPageOptions|messagesPages` 在 `src/`、`tests/` 皆為 0 matches。

## 2. Provider 與 feature hooks

- `AppServicesContext` 持有 `ControllerApi`，但讀它的 `useAppServices()` 不 export；元件無法
  直接取得完整 controller，不是 service locator。
- `MessagesServices = Pick<ControllerApi, "openSessionChat" | "sessionStore">`；
  `MessagesActions` 再以 `Pick` 只暴露 action。
- `MessagesState` 只包含 `courts`、`groups`；courts 讀 controller store 的 `courts` channel，
  沒有新 `dataApi` 或資料讀取邊界。
- state 與 action hooks 分開；action 物件以穩定 controller identity memoize，未訂閱 state。
- `loadMessagesPage()` 仍是 dynamic import，沒有把 MessagesPage 拉回 eager main chunk。

## 3. Codex 五問

### 1. 接線是否真的變少？

是。初始 options 推送鏈由 5 檔／5 層，收旂為唯一 store→hook→page 的
3 檔／3 層更新路徑。刪除 3 個 production export（`sessionViews.renderMessagesPage`、
`pageViews.renderMessagesPage`、`App.renderMessagesPageInApp`），並刪掉 main 的 mount function、
import、呼叫與 options bag。`__importAppModule(` 測試計數由 141 降至 136。

### 2. context／hook 是否隱藏了依賴？

沒有對元件暴露無邊界的完整 controller。Provider 的 root wiring 在 `App.tsx` 明寫，
MessagesPage 的依賴以具名 `useMessagesState()`／`useMessagesActions()` import 呈現，
hooks 返回型別只有 courts、groups、openSessionChat。context 內部細節被封裝，但功能依賴
沒有被一個 generic `useServices()` 隱藏。

### 3. bundle 是否增加？

有小幅增加，沒有隱瞞：

| 指標 | `3c7c568` baseline | 本批 | 淨變化 | gate 餘裕 |
| --- | ---: | ---: | ---: | ---: |
| main raw | 654,838 | 655,171 | +333 B | 3,696 B |
| main gzip | 191,332 | 191,672 | +340 B | 748 B |
| largest app lazy raw | 16,912 | 16,912 | 0 B | 1,088 B |
| largest app lazy gzip | 4,934 | 4,934 | 0 B | 566 B |
| total JS raw | 841,954 | 842,192 | +238 B | 7,769 B |
| total JS gzip | 256,546 | 256,851 | +305 B | 2,211 B |

增量來自 eager Provider／hook glue；Messages lazy chunk 本身仍存在，且直接量測本批產物為
1,719 raw／872 gzip。全部 gate 仍 within，但 main 只剩 748 B，後續批次需繼續精簡。

### 4. 測試是否更接近使用者行為？

是。`react-page-focus.spec.js` 的 Messages 部分不再直呼 adapter 推 options；
測試先注入 fake services，然後真實 click `messages-row-42`，action 觸發 store emit，
最後驗證同一 DOM node 仍 connected、仍持有焦點，並看到未讀 1→2。
`navigation-shell-smoke.spec.js` 先真實點 Messages tab 驗證 route／lazy 空狀態，
再以 fake services 驗證未讀列、host avatar、row click action；既有 oracle 未刪除或弱化。

### 5. 此模式是否適合複製到其他頁？

適合複製到「資料主權已在同一 store channel、action 可以由 `ControllerApi` 切片」的頁面。
可複製的核心是「root 一次注入、feature state/action hooks、既有 selector 單一來源」；
不應盲複製 Messages 的具體 groups 契約，也不應在未解凍的 Me／MySessions／sheet adapter
上提前套用。Bundle main 僅餘 748 B，所以批 2–3 每次複製必須同時刪掉對等存量 glue。

## 4. 測試變更

- `tests/messages-page-dom.test.js`：改為 fake controller/store 包在 `AppServicesProvider`
  下渲染；原標題、row、court、aria 斷言不變。
- 同檔新增 2 個 hooks unit：
  - `useMessagesState` 輸出與 `selectControllerMySessionsView(...).groups` 及 store courts 逐值一致。
  - `useMessagesActions().openSessionChat` 轉呼 controller 對應方法。
  - 兩者均使用有 timeout 的 retry assertion loop，沒有一次性 sleep。
- `tests/fixtures/messagesAppHarness.tsx`：只供 e2e 注入 fake services/store，不是 production
  export，不建立新 legacy adapter。
- `tests/react-page-focus.spec.js`：Messages rerender 改為 row click→action→store emit，focus
  identity oracle 保留。
- `tests/navigation-shell-smoke.spec.js`：發現派工 ground truth 未列的 2 處
  `renderMessagesPage` 直呼；為了刪除 production export 同批退役，未擴大 production scope。
- `tests/react-surface-lifecycle.test.js`、`tests/fixtures/appRuntime.js` 實際仍為零變更，符合預期。

`__importAppModule(` 實測：

```text
before: 141
after:  136
delta:   -5
```

其中 -3 來自 `react-page-focus.spec.js`，-2 來自 ground truth 未列的
`navigation-shell-smoke.spec.js` Messages adapter 直呼。

## 5. 凍結沿用自證

- route：`src/main.js:192` 仍是
  `messages: { elementId: "messages-page", hash: "#tab-messages" }`；route/history 狀態機未改。
- `data-testid`：`src/pages/MessagesPage.tsx:53` 仍是
  `data-testid` 的 `messages-row-${sessionId}` template。
- 文案：`src/pages/MessagesPage.tsx:23-25` 仍是「加入或開一場球局，／成局後群組聊天會出現在這裡。」；
  heading `CHATS`／「訊息」仍在 `:76-79`。
- error boundary：`src/app/App.tsx:265` 仍是 `AppErrorBoundary surface="messages-page"`。
- lazy：`src/app/App.tsx:114-127` 的 `loadMessagesPage()` 仍 dynamic import
  `../pages/MessagesPage.tsx`；`:150-152` preload export 保留。
- focus／Escape：mock 完整套件的 focus、navigation、surface 案例全綠；Messages
  row 跨 store rerender 仍是同一 focused DOM node。
- 其他 adapter：沒有修改 Me、NearbyDrawer、MySessions 頁面或任何 sheet adapter。
- sheet 殼：`src/sheets.js` 為零 diff。
- `syncCommit`：仍只有 3 個 caller：`src/sessionStore.ts:102`、
  `src/app/SurfaceHost.tsx:60`、`src/app/App.tsx:903`；三處皆未改。
- `dataApi`、CSS、文案、`#9db3a4`：零變更。

## 6. 收尾標準矩陣

### 型別

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
dist/assets/MessagesPage-BbmiH-Oc.js                         1.72 kB │ gzip:   0.87 kB
dist/assets/MySessionsPage-BnA8L_bk.js                      16.91 kB │ gzip:   4.93 kB
dist/assets/sentryBrowserSdk-Czz5dmkg.js                    87.98 kB │ gzip:  29.72 kB
dist/assets/index-BUZat32T.js                              655.17 kB │ gzip: 191.67 kB
✓ built in 1.24s

exit 0
```

Vite 依既有 `chunkSizeWarningLimit` 顯示 main 大於 500 kB 提示；非失敗，bundle gate 如下通過。

### Bundle

`3c7c568` 以 `/tmp` detached worktree 在相同 dependency/runtime 重建，baseline gate 輸出：

```text
production bundle check passed: development E2E hook present, production E2E hook absent; 30 files, 12 demo identifiers absent; main 654838/191332 within 658867/192420; largest app lazy MySessionsPage-CSqL8GtW.js 16912/4934 within 18000/5500; total JS 841954/256546 within 849961/259062; private repository: privateDataRepository-vICWGoUd.js; Sentry: sentryBrowserSdk-Czz5dmkg.js
```

本批最終輸出：

```text
$ npm run check:production-bundle

> tennis-partner-finder@0.1.0 check:production-bundle
> node scripts/check-production-bundle.mjs

production bundle check passed: development E2E hook present, production E2E hook absent; 30 files, 12 demo identifiers absent; main 655171/191672 within 658867/192420; largest app lazy MySessionsPage-BnA8L_bk.js 16912/4934 within 18000/5500; total JS 842192/256851 within 849961/259062; private repository: privateDataRepository-BiMkLfsc.js; Sentry: sentryBrowserSdk-Czz5dmkg.js

exit 0
```

### Mock

`npm run test:mock` 未接 pipe。新 hooks unit 在聚合套件內為 `ok 69-71`；Playwright
收尾輸出逐字如下：

```text
  4 skipped
  286 passed (53.1s)
```

exit 0。基準為 286 passed／4 skipped，計數不變；本次 53.1s，約比前批回報的
53.8s 快 0.7s（時間只當環境訊號，不宣稱性能提升）。

### Local

`npx supabase start` exit 0；為避免在回報重複印出 local development keys，不轉載其
status JSON。`npm run test:local` 未接 pipe，關鍵輸出逐字如下：

```text
TAP version 13
# Subtest: loopback fixture exercises profile RPC, discovery allowlist, and lifecycle outcome
ok 1 - loopback fixture exercises profile RPC, discovery allowlist, and lifecycle outcome
# Subtest: third authenticated account sees only host and accepted guest in the live join preview
ok 2 - third authenticated account sees only host and accepted guest in the live join preview
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

無輸出，exit 0。另外 `npm run prettier:check` 亦 exit 0；新增的
`tests/fixtures/messagesAppHarness.tsx` 亦另以 Prettier targeted check 驗證。

## 7. In-app Browser UI QA

測試流程：`http://127.0.0.1:5173/` 載入 → 點擊底部「訊息」 →
`#tab-messages` 取得主權 → lazy MessagesPage 顯示既有空狀態。

| 檢查 | 結果 |
| --- | --- |
| Page identity | PASS；URL `http://127.0.0.1:5173/#tab-messages`，title「球咖｜台北網球」 |
| Not blank | PASS；heading「訊息」、CHATS 與空狀態可見 |
| Framework overlay | PASS；DOM/screenshot 無 Vite／React error overlay |
| Console health | PASS；0 error／0 warn |
| Interaction | PASS；Messages tab `aria-current="page"`，Messages 顯示、Map 隱藏 |
| Screenshot | PASS；可見空狀態、既有底部導覽與選中的 Messages tab |

Browser 當時未登入，所以使用者面的 rows/action 由完整 mock/local 套件與 fake-services
UI-driven e2e 驗證；Browser 驗證對應本批真正 production mount、route、lazy、boundary 與空狀態路徑。

## 8. 未做、疑義與 BLOCKED

### 未做

- 範圍內未完成項目：無。
- 未動 Me、NearbyDrawer、MySessions 或 sheet 的 adapter；未動 `sheets.js` 殼。
- 未動 route/history、UX、CSS、文案、`#9db3a4`、`dataApi` 或隱私 allowlist。
- 未動 3 個 `syncCommit` caller，未新增第三方依賴。
- 未 commit，未 push。

### 疑義

- 派工 ground truth 對 `react-page-focus.spec.js` 的行號描述是 `:22/:96/:99`，
  開工檔實際為 `:21/:96/:99`；不影響三處目標辨識。
- ground truth 未列 `navigation-shell-smoke.spec.js` 兩處 `renderMessagesPage` 直呼；
  這兩處會因本批明令刪除 export 而失效，因此依「以 adapter 為 harness 可改 UI-driven」
  解凍條款同批退役。只改 tests，未擴大 production 邊界。

### BLOCKED

- 無。未發現目標與未解凍的 adapter、殼、同步 commit、文案、testid、lazy、
  boundary 或 `dataApi` 契約衝突。
