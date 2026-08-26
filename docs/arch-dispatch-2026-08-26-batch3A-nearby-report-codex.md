# 批 3A 回報：NearbyDrawer 資料與 action 單源化

- 日期：2026-08-26
- 派工單：`docs/arch-dispatch-2026-08-26-batch3A-nearby.md`
- 開工狀態：working tree 乾淨；實際 HEAD `e312705`。要求的 implementation baseline
  `e70f4d3` 是 HEAD 的直接 parent，差異只有本派工單與 roadmap 文件，production baseline
  未漂移。
- 結果：完成，無 BLOCKED；未 commit、未 push。

## 1. 接線前後

| 接點 | Before | After |
| --- | --- | --- |
| `main.js` `mountNearbyDestination` bag | 9 欄：`authenticated`、6 controller actions、`onSubscribe`、`sessionStore` | 0 欄；只保留 mount function 與 bridge 呼叫 |
| `configureAppServicesInApp` | `controller`、`mySessionsApp`、`pageViewStore` | 增加 narrow `nearbyDrawerApp: { onSubscribe }` |
| `NearbySessionsDrawerOptions` | 17 欄 | 3 欄：`rootElement`、`onStoreCommit`、`onBeforeStoreChange` |
| `pageViews.js` bridge 轉發物件 | 6 data、7 actions、`sessionStore` | 只剩過渡 `onBeforeStoreChange`；第三參數 commit callback 原樣保留 |
| Drawer 資料 | `subscribed ?? options` 雙源 | `useNearbyDrawerState(onBeforeStoreChange)` 單源 |
| Drawer actions | 7 個 options callbacks | 6 個 controller hook actions＋1 個 app hook action |

`authenticated` 死欄已從 main bag 與 bridge 解構退役。`mountNearbyDestination`、
`renderNearbySessionsDrawer` facade／bridge、`renderNearbySessionsDrawerInApp`、slot map 與
同步 commit 鏈仍在，留給 3B。

## 2. hooks 型別與 selector 同源自證

- `NearbyDrawerState` 是 `Pick<ControllerMapViewPayload, "courts" | "drawerState" |
  "filters" | "hasUserLocation" | "mapStatus" | "sessions">`。
- `useNearbyDrawerState(onBeforeStoreChange?)` 從 Provider 的同一個
  `controller.sessionStore` 訂閱 `"map"` channel；selector 先呼既有
  `selectControllerMapView`，只排除 drawer 不使用的 `locationMessage`。沒有新增 channel、
  selector 或第二份 derive。
- hook 的 fallback 是同一 session store 當下快照經同一 selector 投影，不再接受 component
  options fallback。
- `onBeforeStoreChange` 仍逐字穿透 `useStoreSelector` 第五參數；hook 註解明列它是 3B 搬焦點
  管道前的過渡接點。
- `NearbyDrawerServices` 由 `ControllerApi` Pick 六個方法：`expandBounds`、
  `openCreateIntent`、`openSession`、`resetFilters`、`retryDiscovery`、`setDrawerState`。
  `useNearbyDrawerActions()` 以 controller identity memoize，欄位名維持既有 UI 語意。
- `useNearbyDrawerAppActions()` 只回 `{ onSubscribe }`；未注入即 throw
  `NearbyDrawer app actions are unavailable.`，沒有 noop fallback。
- `tests/nearby-drawer-dom.test.js` 以 `deepStrictEqual` 證明 hook 六欄逐值等於既有 selector
  切片，另逐一驗六個 controller call、參數 binding、retry 回傳值與 app subscribe callback。

## 3. 四個測試直呼點逐點對照

新增 `tests/fixtures/nearbyDrawerAppHarness.tsx`：以 seeded fake `sessionStore`、`"map"`
channel emit、六個 fake controller actions 與 `nearbyDrawerApp` 掛真 Provider／真 drawer component。
更新走 `setState`＋`emit("map")`，不再以 options 重呼 production adapter。

| # | 原 call site | Before | After／oracle |
| ---: | --- | --- | --- |
| 1 | `session-lifecycle-smoke.spec.js` 原 :233 | 自建真 controller 的 `render(view)` 回呼重呼 adapter，另以 visibility event 觸發 quiet refresh | harness `publishDiscovery()` 寫 fake store 並 emit；仍驗 discovery loads 1→2、焦點 session `18008`、`scrollTop=200` |
| 2 | 同檔原 :282 | closure 以 `{ courts, drawerState, sessions }` 多次重呼 adapter | 同一 harness `update({ drawerState, sessions })`；仍驗首次 collapsed、雙 collapsed 不覆蓋記憶、重開 200、短列表 clamp |
| 3 | 同檔原 :1151 | 對真 `#nearby-sessions-drawer` 直呼 adapter 餵 candidate session/courts | harness 替換 app-owned test root後由 store emit render；detail sheet 仍走 production facade，候選三館、費用、未定案／已定案文字 oracle 不變 |
| 4 | `chat-settings-filters-smoke.spec.js` 原 :526 | filter callback 每次以 filters 結果重呼 adapter | 同一 harness 更新 `filters`＋`sessions` 並 emit；仍驗 7→2 場 summary 與 keyboard focus 不掉 body |

四點 targeted desktop 實跑：`4 passed (2.0s)`。完整 mock 的 desktop／mobile 對應案例也全綠。

新增 DOM safety test 共四項：provider state render 的 peek row／卡片／empty state、selector 六欄
同源、兩個 action hooks、app callback 缺線 fail-closed；fixture 有顯式非空 assertion。已接入
`test:session-unit`。

```text
$ rg -o 'renderNearbySessionsDrawer\(' tests --no-filename | wc -l
0
```

before 4 → after 0，無殘留理由。

## 4. `__importAppModule` 對帳

```text
before: 122
after:  119
delta:   -3
```

| 檔案 | before | after | delta | 理由 |
| --- | ---: | ---: | ---: | --- |
| `tests/session-lifecycle-smoke.spec.js` | 26 | 23 | −3 | quiet-refresh 的 controller＋drawer facade imports 退役；drawer-state 的 facade import 退役 |
| `tests/chat-settings-filters-smoke.spec.js` | 18 | 18 | 0 | 同行仍需 production `openFilterSheet`，故保留 |
| 其餘 `src/`＋`tests/` | 78 | 78 | 0 | 零變化 |
| **全部** | **122** | **119** | **−3** | **全為真退役** |

candidate test 的 importer 仍需 `openSessionSheet`，沒有為降低數字改拼法；filter test 同理。
沒有把任何 production importer 改成 `/src/` direct import。新增 harness 使用原生 test-only
`import()`，不是替換仍有 production export 消費的 `__importAppModule`。

## 5. 凍結面逐項自證

- `renderNearbySessionsDrawer` bridge 本體／facade export、`renderNearbySessionsDrawerInApp`、
  `nearbyDrawers` slot 機制均保留；只移除解凍欄位。
- `onBeforeStoreChange`、`onStoreCommit`、`rootElement` 三欄與同步語意保留；bridge 的
  `rememberFocusedSessionCard(root)`、before-store callback 及 commit 後
  `restoreFocusedSessionCard(root)` 次序保留。
- `drawerFocusIntents`、`drawerLoadingFocusFallbacks`、
  `drawerBeforeStoreChangeCallbacks` 與其 WeakMap/rAF 焦點機制零修改。
- `surface="nearby-sessions-drawer"`、`className="nearby-sessions__cards"`、
  `SessionCard data-testid="session-card"`、`#nearby-sessions-drawer`、
  `#nearby-sessions-toggle`、`data-testid="drawer-collapse"`、`data-session-id` 全保留。
- Drawer 對 `sessionPresentation.ts` 的 eager import 保留；`surfaceManifest` consumer 契約未動。
- `#nearby-sessions-count-status`、`#map-data-status` 與 main `renderDiscovery` 未動。
- NearbyDrawer 在 `App.tsx` 仍為 eager import；`react-surface-lifecycle.test.js` 零 diff，lazy
  計數 `=3` 未修改。
- 全部 testid／id／class／aria／文案與 CSS 零治理性改名。
- `tests/app-errors.test.js`、`tests/content-visibility-contract.test.js`、
  `tests/session-presentation-boundary.test.js`、`tests/react-surface-lifecycle.test.js`、
  `tests/sheets-dom.test.js` 均由 `git diff --name-only -- <files>` 證明零 diff。
- Me、route、sheets、`syncCommit`、data API、依賴均零變更。

## 6. Codex 五問

### 1. 接線是否真的變少？

是。main 的 Nearby bag 9→0；Drawer options 17→3；bridge 轉發只剩一個過渡 callback。
資料 hot path 現為 controller store → `"map"` selector hook → drawer，actions 為 drawer →
具名 hook → controller/app callback。3B 的 focus/adapter 接線明確保留，沒有把它假裝成已退役。

### 2. context／hooks 是否隱藏依賴？

沒有 export generic `useServices()`。Drawer 只看三個具名 feature hooks；state 型別直接從
`ControllerMapViewPayload` Pick，controller actions 直接從 `ControllerApi` Pick，app callback
是一欄 narrow slice且 fail closed。完整 controller/context 仍封裝在 Provider 內。

### 3. bundle 是否增加？

沒有；main 與 total 都淨下降，gate 未調整：

| 指標 | `e70f4d3` baseline | 本批 | 淨變化 | gate 餘裕 |
| --- | ---: | ---: | ---: | ---: |
| main raw | 654,646 | 654,311 | −335 B | 4,556 B |
| main gzip | 191,489 | 191,311 | −178 B | 1,109 B |
| total JS gzip | 256,554 | 256,398 | −156 B | 2,664 B |

hooks 因 eager Drawer 進 main，但 options/bridge/main glue 退役量已對沖；test harness 不在
production import graph。

### 4. 測試是否更接近使用者行為？

是。四個 tests 不再用 props 偽造 controller-derived view，而是對真 Provider／真 component
寫 session store 並 emit `"map"`；互動仍透過真 DOM focus/click。完整 mock 286 passed 與 local
45 passed 同時覆蓋 production App/bridge/controller 路徑，新 unit 再鎖 selector/action boundary。

### 5. 對 3B 焦點管道搬遷與 Me 遷移的建議

- 3B 應把三個 WeakMap、before-store capture、loading fallback 與 commit restore 一次搬進 strict
  TS 的 drawer owner/hook；必須保留「emit 前同步 capture → React layout commit → rAF/fallback」
  次序，再退 bridge/slot。不要先拆 adapter，否則會失去 capture 接點。
- 3B 的 canary 應保留 stale card、loading→retry、collapsed toggle、sheet/modal 優先權、scroll
  memory 與 Escape/collapse 六組焦點 oracle；harness 不應複製 production focus scheduler。
- Me 建議另開批，先像 2A/3A 分離 controller state/actions，再像 2B 承載共用
  `pageViewStore` 與 narrow `meApp` callbacks，最後搬 focus/adapter。Me 與 MySessions 必須共用同一
  page-view store，不建立 page-local mirror，也不與 3B 混批。

## 7. 收尾標準矩陣

所有 gate 指令直接實跑，未接 pipe。

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

`tests/fixtures/nearbyDrawerAppHarness.tsx` 不在既有 Prettier tests glob，另以 targeted
Prettier write/check 格式化；typecheck 涵蓋該 TSX。

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
dist/assets/MessagesPage-DH6_QR11.js                         1.72 kB │ gzip:   0.87 kB
dist/assets/MePage-mANHWwX2.js                              16.13 kB │ gzip:   5.12 kB
dist/assets/MySessionsPage-aW8z2FQH.js                      16.48 kB │ gzip:   4.83 kB
dist/assets/sentryBrowserSdk-Czz5dmkg.js                    87.98 kB │ gzip:  29.72 kB
dist/assets/index-B6H3_S-h.js                              654.31 kB │ gzip: 191.31 kB
✓ built in 1.19s

exit 0
```

Vite 的 main >500 kB 是既有 warning；固定 production bundle gate 如下通過。

### Bundle

```text
$ npm run check:production-bundle

> tennis-partner-finder@0.1.0 check:production-bundle
> node scripts/check-production-bundle.mjs

production bundle check passed: development E2E hook present, production E2E hook absent; 30 files, 12 demo identifiers absent; main 654311/191311 within 658867/192420; largest app lazy MySessionsPage-aW8z2FQH.js 16481/4833 within 18000/5500; total JS 840907/256398 within 849961/259062; private repository: privateDataRepository-BgE20sPA.js; Sentry: sentryBrowserSdk-Czz5dmkg.js

exit 0
```

### Mock

新 Nearby unit 四項均為 `ok`。完整命令收尾逐字：

```text
  4 skipped
  286 passed (53.3s)
```

exit 0。Node unit 的並行 Vite middleware 輸出既有 `WebSocket server error: Port 24678 is
already in use` 診斷，但沒有 `not ok`，聚合命令 exit 0。`chat-settings-filters:468` 本次通過，
沒有重跑或 guarded reset。

### Local

`npx supabase start` exit 0；服務成功啟動／確認，不在報告複製 local development keys。
`npm run test:local`：

```text
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3796.537959

  11 skipped
  45 passed (1.4m)
```

exit 0；首次即通過，沒有 fixture 污染紅，故不需 guarded reset 三拍。

### 空白

```text
$ git diff --check
```

無輸出，exit 0。

## 8. 未做／疑義／BLOCKED

- 未做：3B 的焦點 WeakMap 管道搬遷、adapter／bridge／slot 退役、direct portal、Me 遷移；
  均依派工留後批。
- 疑義：無。開工 HEAD 與 baseline 的唯一差異已證明是 dispatch/roadmap 文件。
- BLOCKED：無。

