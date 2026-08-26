# 批 2B 回報：MySessions app 服務承載、焦點管道收斂與 adapter 退役

- 日期：2026-08-26
- 派工單：`docs/arch-dispatch-2026-08-26-batch2B-mysessions.md`
- 開工狀態：working tree 乾淨；實際 HEAD `ea9d7b2`，其直接 parent 是要求的 accepted
  implementation baseline `ee8e1ee`。兩者差異只有本派工單與 roadmap 文件更新，production
  baseline 未漂移。
- 結果：完成，無 BLOCKED；未 commit、未 push。

## 1. 接線前後

### Before

MySessions 的首次 mount／更新路徑為：

```text
main.js mountMySessionsDestination
  → sessionViews.js renderMySessionsPage facade
  → pageViews.js renderMySessionsPage bridge
  → App.tsx renderMySessionsPageInApp
  → AppSnapshot.mySessionsPages slot
  → MySessionsDestination
  → MySessionsPage(options + rootElement + commit callbacks)
```

- main 組 8 欄 options，另持有 focus ack closure。
- `pageViewStore` 已是權威，但頁面仍保留 options mount fallback。
- rAF 焦點演算法在 `pageViews.js`，harness 又有一份 clone。
- adapter commit callback 無條件再跑一次 pending sync。

### After

```text
main.js configureAppServicesInApp({ controller, pageViewStore, mySessionsApp })
  → AppServicesProvider
  → App.tsx direct createPortal(#my-sessions-root)
  → MySessionsDestination
  → MySessionsPage(rootElement)
       ├─ useMySessionsState / useMySessionsActions
       ├─ useMySessionsPageView
       ├─ useMySessionsAppActions
       └─ scheduleMySessionsCreatedFocus (strict TS single source)
```

- `main.js` 的 MySessions mount function、呼叫點與 facade import 全刪；main.js MySessions mount
  鏈為 0。
- `sessionViews.js` facade／App wrapper／`configurePageViews` 注入鍵與 `pageViews.js` bridge 全刪。
- `AppSnapshot.mySessionsPages`、slot、`renderMySessionsPageInApp` 與
  `MySessionsPageOptions` 整型退役。
- MySessions 直接 portal 與 Messages 同級；`AppErrorBoundary resetKey={0}`。沒有 adapter update
  recovery key 後，destination identity 由固定 portal key `"my-sessions"` 與固定 root 保持，故採
  Messages 的 resetKey 0 模式。
- `#my-sessions-root` 在 App root 建立時捕捉一次。這符合既有「page containers remain stable portal
  targets」契約，也避免後續 render 重新指向測試替換過的同 id container。

實作淨值（不含本回報）：8 個既有檔修改、1 個 strict TS 模組新增；production adapter chain
相關字面 `mountMySessionsDestination`／`renderMySessionsPageInApp`／`renderMySessionsPage`／
`mySessionsPages`／`hasAdapterActionScope` 在 `src/` 與 `tests/` 均為 0。

## 2. typed app services 與雙 store 承載

`AppServices` 是具名 typed bundle：

```text
controller: ControllerApi
pageViewStore: PageViewStore
mySessionsApp:
  onBack
  onCreatedSessionFocus
  onEnablePush
  onSignIn
```

- main 只在 controller 建立後一次注入既有 `pageViewStore` 實例；沒有重造第二 store。
- `configureAppServicesInApp` guard 仍以 bundle identity 防替換：已設定後傳另一個 bundle 直接 throw。
- 完整 services context 仍不 export；頁面只能用 feature hooks。
- `useMySessionsPageView()` 只回 `createdSessionFocusId`、`createdSessionFocusReason`、
  `notificationSettings`，只訂閱 `"mySessions"` channel。
- `useMySessionsAppActions()` 只回四個 app callback，沒有把完整 controller 或 page-view store
  暴露給頁面。
- controller-only Provider props 仍供 Messages 的既有 isolated tests 使用；MySessions hooks 缺
  page-view／app slice 時 fail closed，不會用假 default 隱藏 production 缺線。
- Me 仍經原 `MySessionsDestination` 之外的 options bag 收到同一個 `pageViewStore`；MePage 與
  `mountMeDestination` 對應程式零行修改。

main 的 ack callback 次序保留：

```text
expected id 比對，不符 → false
createdSessionFocusId = null
createdSessionFocusReason = null
publishPageView("mySessions")
return true
```

`onBack` 仍為 `showMapPage({ focus: true })`；`onSignIn` 仍為
`openSafeLogin({ action: "my-sessions" })`；`onEnablePush` 仍為原
`enablePushNotifications`。

## 3. rAF 焦點管道逐字保真

唯一 production source 現為 `src/mySessionsCreatedFocus.ts`，由 `MySessionsPage` 的
`useLayoutEffect` 直接排程。`pageViews.js` 原件與 harness clone 均已刪。

| 契約 | 搬移後自證 |
| --- | --- |
| focus id | `highlightSessionId ?? createdSessionId` 原式保留 |
| upcoming 謂詞 | `String(session.sessionId) === String(focusSessionId)` 原式保留 |
| needs-action 謂詞 | 仍限定 `entry.kind === "guest-request"`，再比字串化 session id |
| 完整 groups | 仍直接檢查未經 active segment 過濾的 `groups.upcoming`／`groups.needsAction` |
| selector | `[data-created-session] [data-open-my-session], [data-created-session] [data-my-action='withdraw']` 逐字保留 |
| one-shot ack | `if (!target || !onCreatedSessionFocus(focusSessionId)) return`，false 短路保留 |
| focus | `target.focus({ preventScroll: true })` 逐字保留 |
| 排程 | 仍為 `requestAnimationFrame`，沒有 effect timer 或第二 scheduler |

`react-page-focus.spec.js` 的 production-path oracle 保留：8842 的 upcoming button 聚焦、ack 恰
一次、captured console errors 為空。targeted desktop 單測 1 passed；完整 mock 的 desktop／mobile
同案例均通過。local `session.spec.js` 真 create journey 也通過「建立球局後聚焦 upcoming card」。

## 4. `setMySessionActionScope`／pending sync 全 caller 清單

| Before caller | After | 判定 |
| --- | --- | --- |
| `pageViews.renderMePage` mount 前，以 `authSession.user.id` 設 scope | 保留 | 服務仍凍結 Me adapter |
| `pageViews.renderMePage` commit，以 live store auth id 設 scope | 保留 | 服務仍凍結 Me rerender/account 切換 |
| `pageViews.renderMePage` commit 的 `syncPendingMySessionActions` | 保留 | 服務 Me async controls |
| `pageViews.renderMySessionsPage` bridge mount 前的 adapter scope | 刪除 | 只服務已退役 bridge；`hasAdapterActionScope` 已零 caller |
| `pageViews.renderMySessionsPage` bridge commit 的 live adapter scope | 刪除 | 只服務已退役 bridge；頁面在 2A 已自持 live epoch |
| `pageViews.renderMySessionsPage` bridge commit 的無條件 pending sync | 刪除 | 移交觀察 1；不再有 bridge/page 雙 sync 與理論順序窗 |
| `MySessionsPage` layout effect：hook `actionScopeKey` 設 scope | 保留 | MySessions React owner；epoch 切換清 stale pending |
| `MySessionsPage` layout effect：scope 後 pending sync | 保留 | 同 commit 依 live DOM 恢復 pending disabled 狀態 |

改後 `setMySessionActionScope` 的 production calls 恰 3：Me 2、MySessions 1；
`syncPendingMySessionActions` calls 恰 2：Me 1、MySessions 1。函式本體零修改。

## 5. 批 2A 三個移交觀察已收掉

1. **bridge 無條件 sync 順序窗**：整個 MySessions bridge callback 刪除；頁面同一 layout commit
   內固定先設 live scope、再 sync pending。
2. **`hasAdapterActionScope` 死碼**：隨 bridge 整段刪除；全庫字面 0。
3. **harness rAF clone drift**：`scheduleCreatedSessionFocus`／`remainingPageOptions` 均刪；harness
   注入真 app services 與 page-view store，頁面直接呼叫 production strict TS scheduler。

廣泛 affected suite 初跑曾有 1 紅：direct App portal 在其他 surface render 後重新找到 harness
替換過的 `#my-sessions-root`，形成兩個 segment control。修正為 App root 建立時一次捕捉固定 portal
target；該案例 targeted 重跑 1 passed，完整 mock 再跑全綠。沒有增加 production test flag。

## 6. `__importAppModule` 對帳

```text
$ rg -o '__importAppModule\(' tests --no-filename | wc -l
122
```

before 122 → after 122，delta 0。2A 已將 28 個 adapter test calls 清零；本批刪的是 production
facade／bridge／App export，現有測試沒有再透過 `__importAppModule` 取它們，故無可真退役 importer。
新增行沒有 `await import("/src/…")` 替換任何 `__importAppModule`。`renderMySessionsPage(` 測試
呼叫仍為 0。

## 7. 凍結面自證

- `preloadMySessionsPageInApp`、`namedViewPreloads.mySessions`、authenticated preload 與
  `#my-sessions-tab` intent preload 全保留。
- `surface="my-sessions-page"` 保留；error boundary 仍包住 lazy page。
- `#tab-my-sessions` route、`showMySessionsPage`、`setActivePage` 與 bottom-navigation click 零語意修改。
- `pageViewStore.ts` 零 diff；main 的 store shape、`publishPageView` setState＋按 channel emit、
  created focus module variables均保留。
- MePage、NearbyDrawer、Me 的 pageView options、`mountSheet`、sheets、CSS、dataApi、新依賴均零 diff。
- `syncCommit` caller 仍恰 3：`sessionStore.ts`、`SurfaceHost.tsx`、`App.tsx`；
  `commitPageAdapterSynchronously` 仍服務 Me／Nearby slots。
- `my-sessions-list`／`my-action-card`／`my-session-card` 字面仍分別 6／6／5；全部 testid、
  `data-my-*`、id、class、aria、DOM markup 與文案沒有因 ownership 搬移而改名或刪除。
- `preloadMySessionsPageInApp` lazy chunk 仍獨立，沒有把 MySessionsPage eager 搬進 main。

## 8. Codex 五問

### 1. 接線是否真的變少？

是。更新 hot path 從 6 層 adapter/slot 鏈縮為 Provider hooks → page；main 的 MySessions mount
function、facade、bridge、App wrapper、slot map、options 型別與兩個 commit callback 全退役。
main 現只負責一次注入 app services 與既有 route/publish 上游。

### 2. context／hooks 是否隱藏依賴？

沒有。完整 context hook 不 export；controller、page-view、app callbacks 分成具名 feature hooks。
MySessions 缺第二 store 或 app callbacks 會直接 throw，不能悄悄用 noop。`AppServices` typed bundle
清楚列出兩個 store owner 與四個 app boundary callbacks。

### 3. bundle 是否增加？

MySessions lazy 因 strict scheduler 與兩個 hooks增加 199 raw／40 gzip，但 main 回收
756 raw／274 gzip，total 淨減 550 raw／225 gzip；三 gate 全部 within，且未調 gate。

### 4. 測試是否更接近使用者行為？

是。created-session 測試不再執行 harness clone，而是 page subscription → production layout
effect → production TS scheduler → main-equivalent ack。完整 local create/join 路徑、mock desktop/mobile、
segment、pending、account epoch 與 focus oracle均通過；另新增 app hooks 切片/callback unit。

### 5. 此雙 store 承載模式對 Me／NearbyDrawer 的複製建議

- **Me**：適合複製 `controller + pageViewStore + meApp callbacks` 的 narrow slices；Me 與 MySessions
  必須持續共用同一 `pageViewStore` 實例，不要建立 page-local mirror。先拆 Me controller state/actions，
  再搬 focus/settings page-view，最後退 adapter。
- **NearbyDrawer**：controller discovery store 與 drawer-local focus intent 的更新頻率不同，宜維持分 hook
  訂閱，避免一個 context value 讓每次 map/discovery emit 重畫所有 app actions。其 before-store-change
  focus capture 必須先搬進 React owner，不能直接照抄 MySessions 的單一 layout effect。
- 兩者都應沿用 immutable configure guard、direct portal fixed root、feature hooks fail closed、adapter
  test 改真 Provider harness，再以 bundle gate驗證 main 回收是否抵銷 lazy 增量。

## 9. 收尾標準矩陣

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

`tests/fixtures/mySessionsAppHarness.tsx` 不在既有 tests Prettier glob，另以 targeted
`npx prettier --write` 格式化；typecheck 涵蓋它。

### Build

```text
$ npm run build

> tennis-partner-finder@0.1.0 build
> vite build

vite v6.4.3 building for production...
transforming...
✓ 508 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                              6.19 kB │ gzip:   2.52 kB
dist/assets/index-BUlzCa6l.css                              65.87 kB │ gzip:  10.86 kB
dist/assets/MessagesPage-BUsk_-5N.js                         1.72 kB │ gzip:   0.87 kB
dist/assets/MePage-CFm0Vz6C.js                              16.13 kB │ gzip:   5.12 kB
dist/assets/MySessionsPage-CRrTq4R7.js                      16.48 kB │ gzip:   4.83 kB
dist/assets/sentryBrowserSdk-Czz5dmkg.js                    87.98 kB │ gzip:  29.72 kB
dist/assets/index-D1vk_kdW.js                              654.65 kB │ gzip: 191.49 kB
✓ built in 1.30s

exit 0
```

Vite 的 main >500 kB 是既有 warning；固定 production bundle gate 如下通過。

### Bundle

```text
$ npm run check:production-bundle

> tennis-partner-finder@0.1.0 check:production-bundle
> node scripts/check-production-bundle.mjs

production bundle check passed: development E2E hook present, production E2E hook absent; 30 files, 12 demo identifiers absent; main 654646/191489 within 658867/192420; largest app lazy MySessionsPage-CRrTq4R7.js 16481/4831 within 18000/5500; total JS 841242/256554 within 849961/259062; private repository: privateDataRepository-wXB-BhJH.js; Sentry: sentryBrowserSdk-Czz5dmkg.js

exit 0
```

| 指標 | `ee8e1ee` baseline | 本批 | 淨變化 | gate 餘裕 |
| --- | ---: | ---: | ---: | ---: |
| main raw | 655,402 | 654,646 | −756 B | 4,221 B |
| main gzip | 191,763 | 191,489 | −274 B | 931 B |
| MySessions lazy raw | 16,282 | 16,481 | +199 B | 1,519 B |
| MySessions lazy gzip | 4,791 | 4,831 | +40 B | 669 B |
| total JS raw | 841,792 | 841,242 | −550 B | 8,719 B |
| total JS gzip | 256,779 | 256,554 | −225 B | 2,508 B |

### Mock

新 app hooks unit 在 aggregate 為 `ok 75`。Playwright 收尾逐字：

```text
  4 skipped
  286 passed (54.5s)
```

exit 0。Node unit 期間 Vite middleware 曾輸出既有 dev WebSocket port 24678 已使用診斷，
但沒有 `not ok`，整體命令 exit 0。

### Local

`npx supabase start` exit 0；不在文件重複 local development keys。首次
`npm run test:local` 即全綠，不需要 guarded reset：

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
  45 passed (1.3m)
```

exit 0。

### 空白

```text
$ git diff --check
```

無輸出，exit 0。

## 10. In-app Browser QA

目標流程：`http://127.0.0.1:5173/` → 底部「我的球局」 → direct portal lazy page →
「我主揪的 0」→「回到地圖」。

| 檢查 | 結果 |
| --- | --- |
| Environment | in-app Browser；desktop 1280×720；Vite `127.0.0.1:5173` |
| Page identity | title `球咖｜台北網球`；MySessions URL `#tab-my-sessions` |
| Not blank | heading、login region、segment group、三段列表與底部導覽均在 fresh DOM snapshot |
| Framework overlay | 無 |
| Console | error／warn logs 均為空 |
| Screenshot | 1280×720 首屏清楚顯示 MySessions direct portal，無重疊／裁切／重複 control |
| Interaction | 點 hosted 後按鈕為 `[active] [pressed]`；點「回到地圖」後 URL `#tab-map` 且 map DOM 恢復 |

Browser QA 後已停止本次 Vite dev server；Supabase local stack維持既有開發狀態。

## 11. 未做

- 未遷 MePage、NearbyDrawer 或其 options／focus 管道。
- 未動三個 `syncCommit` caller、`commitPageAdapterSynchronously`、`mountSheet` 或 sheet 殼。
- 未改 `pageViewStore` shape/channel/publish 語意，未新建第二 store。
- 未改 route/hash/history、UX、文案、CSS、testid、data attributes、id、class、aria。
- 未改 preload/lazy 鏈、dataApi、DB/RPC、privacy allowlist、依賴或 bundle gate。
- 未 commit、未 push。

## 12. 疑義／BLOCKED

- 開工 HEAD 是派工 commit `ea9d7b2`，不是 parent `ee8e1ee`；因 working tree 乾淨且 HEAD 對
  parent 只有派工/roadmap docs，依批 2A 相同 accepted baseline 慣例視為 production baseline
  未漂移並記錄於本報告。
- 無 BLOCKED。所有固定 gate、真 DB journey 與 UI QA 均通過。
