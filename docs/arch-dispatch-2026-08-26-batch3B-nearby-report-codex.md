# 批 3B 回報：NearbyDrawer 焦點管道 React 化與 adapter 退役

- 日期：2026-08-26
- 派工單：`docs/arch-dispatch-2026-08-26-batch3B-nearby.md`
- 開工狀態：working tree 乾淨；實際 HEAD `aeca4ad`，其直接 parent 是要求的 accepted
  implementation baseline `add101d`。兩者差異只有本派工單／roadmap 文件，production baseline
  未漂移。
- 結果：完成，無 BLOCKED；未 commit、未 push。

## 1. 完成後 ownership 與 adapter 收線

### Before

```text
main.js mountNearbyDestination
  → sessionViews.js renderNearbySessionsDrawer facade
  → pageViews.js renderNearbySessionsDrawer bridge + WeakMap focus pipeline
  → App.tsx renderNearbySessionsDrawerInApp
  → AppSnapshot.nearbyDrawers slot
  → NearbyDrawerDestination(slot)
  → NearbySessionsDrawer(rootElement/onBeforeStoreChange/onStoreCommit)
```

### After

```text
main.js configureAppServicesInApp({ controller, nearbyDrawerApp, ... })
  → AppServicesProvider
  → App.tsx fixed createPortal(#nearby-sessions-drawer)
  → NearbyDrawerFocusProvider(rootElement)
  → NearbyDrawerDestination
  → NearbySessionsDrawer()
       ├─ useNearbyDrawerState / actions
       └─ nearbyDrawerFocus.ts strict TS state machine
```

- `main.js` drawer import、mount function 與 startup call 全刪。
- `sessionViews.js` facade、App export wrapper 與 `configurePageViews` 注入鍵全刪。
- `pageViews.js` drawer bridge／焦點管道整套刪除；只剩 Me adapter 與 map helper（259→62 行）。
- `AppSnapshot.nearbyDrawers`、slot 初值／consumer、`renderNearbySessionsDrawerInApp` 全刪。
- `NearbySessionsDrawerOptions` 整型退役；元件不再收 `rootElement`、`onStoreCommit`、
  `onBeforeStoreChange` options。
- `useNearbyDrawerState()` 無參數；pre-store capture 由 hook 內直接連到 strict TS focus owner。

### fixed portal 與 resetKey 選擇

採 MySessions 的 fixed-root 形式：`ensureAppRoot()` 第一次以 `??=` 捕捉 index.html 靜態
`#nearby-sessions-drawer`。這避免測試 harness 替換同 id 節點後，後續 App render 又把 production
portal 改指向測試 root而形成雙 mount；production 靜態 root identity 不變。

`NearbyDrawerDestination` 使用 `resetKey={0}`：adapter update/recovery key 已退役，destination
identity 由固定 portal key `"nearby"` 與固定 root 保持，與 direct MySessions destination 同理；
`surface="nearby-sessions-drawer"` error boundary 仍完整包住元件。

## 2. 焦點管道 strict TS 逐條保真

唯一 production source 現為 `src/nearbyDrawerFocus.ts`。除了 TypeScript 型別參數、root context
與新具名 export，selector 字串、謂詞、優先序、註解與 rAF 決策從 `pageViews.js` 機械搬移。

| 契約                  | Before                                                                             | After／保真證據                                                                           |
| --------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| intent 四形態         | `__drawer-toggle__`、`__drawer-close__`、`__drawer-action__:<id>`、裸 sessionId    | 常數和值逐字保留；intent 仍是 string                                                      |
| action 白名單         | reset、retry、expand、subscribe、first 五 id                                       | `DRAWER_ACTION_IDS` 五項與順序逐字保留                                                    |
| active panel          | `#nearby-sessions-list` 存在且 `!hidden`                                           | selector／hidden 謂詞／註解逐字保留                                                       |
| focus snapshot        | active 必須是 root 內 HTMLElement；toggle→close→action→closest card 分支           | 分支次序、matches/closest selectors與 session id string保存逐字保留                       |
| pre-store 時機        | store listener 的 `beforeStoreChange` 在 `syncCommit(listener)` 前                 | `useNearbyDrawerState()` 內取 stable root callback，仍作 `useStoreSelector` 第五參數      |
| bridge-entry snapshot | adapter 每次進入先 capture；3A 後 production 只剩無既有 drawer DOM 的 startup 單次 | 隨已無 caller 的 bridge 一起退役；所有權威更新仍由 pre-store capture承載，兩個 canary實證 |
| restore 時機          | bridge commit → component layout effect callback → restore → rAF                   | component 自己的 `useLayoutEffect` 直接 restore → 同一 rAF；少一層 callback，不改時機     |
| bail-out              | 新 sheet/modal；仍 connected 且非 body/html、非 hidden、非 loading fallback        | selector與完整布林式逐字保留                                                              |
| toggle 分支           | collapsed 回 toggle；open 交棒 close                                               | aria-expanded false/true、clear 時機與 focus options保留                                  |
| close 分支            | close優先、collapse handle次之                                                     | selector順序與 clear 時機保留                                                             |
| action 分支           | same approved action，否則 recovery；loading則暫時 fallback且保留 intent           | 白名單檢查、fallback與 clear/delete 時機保留                                              |
| card 分支             | 以字串化 session id找卡；不存在則 recovery/loading fallback                        | `String(...)` 比對與完整分支保留                                                          |
| recovery 六段         | retry → card → expand → subscribe → reset → first                                  | 六個 querySelector 優先序逐字保留                                                         |
| loading fallback      | close → collapse handle → toggle；WeakSet標記                                      | 三段優先序、add與 set/clear 時 delete 語意保留                                            |

### WeakMap 設計

本批**沒有**簡化為單例：保留以 root 為 key 的三份結構，strict 化為：

- `WeakMap<HTMLElement, string>`：每 root 一個 intent，後寫覆蓋前寫。
- `WeakSet<HTMLElement>`：每 root loading fallback標記；set/clear intent時先 delete。
- `WeakMap<HTMLElement, () => void>`：每 root穩定 before-store callback identity。

理由是 production雖只有一個固定 root，test harness會同頁建立多個獨立 drawer root；保留 WeakMap
可避免 cross-root intent污染，也最貼近搬運不重造。`NearbyDrawerFocusProvider` 只承載 direct portal
提供的 root，不承載資料/actions。

## 3. canary 三拍證據

`tests/performance.spec.js:325/:342` 全程零 diff。針對新 TS 模組執行：

1. **綠**：遷移前 `2 passed (3.9s)`；遷移完成後 `2 passed (3.7s)`。
2. **紅**：暫時把 `useBeforeNearbyDrawerStoreChange()` 改成 noop callback：
   - :325 expected `discovery-expand`，received `BODY`。
   - :342 expected close button focused，received `inactive`。
   - 收尾：`2 failed`。
3. **還原綠**：以 patch 還原原行，module SHA-256 回到
   `8c986b920621d93dca0accf8381b85fd547d02a065c1469ed84ec48cf1e4db88`，再跑
   `2 passed (3.5s)`。

hash 前後相同，證明 destructive canary 沒有殘留；這兩測確實載重新 strict TS 的快照時機。
`:364` 沒有被誤列為管道證據。

## 4. 測試／harness 與 3A 移交觀察

- harness 移除 `onBeforeStoreChange`／`onStoreCommit` clone wiring，改直接 import production
  `NearbyDrawerFocusProvider`；焦點機制沒有 test clone。
- `nearby-drawer-dom.test.js` render/state hook fixture 同樣包真 focus provider；四項 unit oracle不弱化。
- `performance.spec.js` 兩個載重 canary與所有 assertion原封不動。
- 3A 移交的 `__batch18DiscoveryLoads` 純 plumbing已刪：移除 local counter、getter與 1→2 poll；
  仍顯式呼叫 `__batch18QuietRefresh()`，並保留 session `18008` focus與 `scrollTop=200` 真 oracle。

Unit aggregate：

```text
1..326
# tests 331
# pass 331
# fail 0
```

## 5. adapter 歸零與 import 對帳

```text
$ rg -n "renderNearbySessionsDrawer|renderNearbySessionsDrawerInApp|mountNearbyDestination|nearbyDrawers|drawerFocusIntents" src tests

(no output)
```

新 TS 使用 `nearbyDrawerFocusIntents` 等新 strict 名稱，不保留舊 bridge symbol。

`__importAppModule`：

```text
before: 119
after:  119
delta:    0
```

3A 已把四個 drawer adapter test calls清零；本批刪的是 production facade／bridge／App export，
現有 tests沒有以 `__importAppModule` 消費它們，故沒有可真退役 importer。沒有換拼法或新增
`/src/` import來偽造下降。

## 6. 凍結面自證

- `performance.spec.js`、`sheets-dom.test.js`、`react-surface-lifecycle.test.js`、
  `app-errors.test.js`、`content-visibility-contract.test.js`、`SessionCard.tsx` 均零 diff。
- `surface="nearby-sessions-drawer"`、`className="nearby-sessions__cards"`、
  `data-testid="session-card"`、`#nearby-sessions-drawer`、`#nearby-sessions-toggle`、
  `drawer-collapse`、`data-session-id` 全保留。
- `#nearby-sessions-count-status`、`#map-data-status` 與 `renderDiscovery` 執行語意不變；只把已退役
  adapter 名稱的 live-region 註解改為「React 抽屜內容」，以滿足 adapter symbol零掃描。
- `setDrawerState` 三個切頁 caller與 store權威未動。
- NearbyDrawer 仍在 `App.tsx` eager import；lazy計數 `=3` test零 diff且 unit gate通過。
- `syncCommit` production caller仍恰三個：`sessionStore.ts`、`SurfaceHost.tsx`、`App.tsx`；
  `commitPageAdapterSynchronously` 留給 Me slot。
- `configurePageViews` 的 `preloadAuthenticatedViewsForAuth`／`renderMePageInApp`、Me bridge、
  page options、focus/pending scope均保留。
- route、sheet殼、CSS、UX／文案、data API、新依賴均零變更。

## 7. Codex 五問

### 1. adapter 是否真的退役？

是。main mount、sessionViews facade/wrapper/config key、pageViews bridge/focus source、App slot map/export
全刪，五個舊 symbol在 src＋tests為零。NearbyDrawer現在與 Messages／MySessions同級直接 portal。

### 2. 焦點管道是否仍是單一來源且依賴清楚？

是。strict TS模組是唯一 intent/recovery/rAF source；root透過具名 focus provider，資料仍透過
`useNearbyDrawerState()`，沒有 generic service locator。缺 focus root會 fail closed；harness import
production provider而非複製 scheduler。

### 3. bundle 是否增加？

沒有；adapter刪除抵銷新 strict module/context後仍淨下降，gate未調：

| 指標          | `add101d` baseline |    本批 | 淨變化 | gate餘裕 |
| ------------- | -----------------: | ------: | -----: | -------: |
| main raw      |            654,311 | 654,041 | −270 B |  4,826 B |
| main gzip     |            191,311 | 191,023 | −288 B |  1,397 B |
| total JS raw  |            840,907 | 840,637 | −270 B |  9,324 B |
| total JS gzip |            256,398 | 256,086 | −312 B |  2,976 B |

### 4. 測試是否真正證偽新 owner？

是。不可變的兩個 production performance tests在新 module snapshot callback斷線時同時紅，還原
byte-identical後同時綠；完整 mock desktop/mobile、331個 unit與 local真 auth/database journey全綠。
這比只驗 React node identity的 :364 更能證明 focus pipeline接線。

### 5. 對批 3C Me 與批 4 sheet 殼的建議

- **3C Me**：先盤點 `renderMePage` bridge的 auth preload、`setMySessionActionScope`與
  `syncPendingMySessionActions` 三種責任，分別搬到 typed app service／page owner，不能只刪 bridge。
  保留 Me lazy import與 `preloadAuthenticatedViewsForAuth` intent preload；Me與 MySessions共用同一
  `pageViewStore`，不要建立 mirror。直接 portal可沿 fixed-root樣板，但要先以「每個 Me control
  background rerender仍保焦」local test做 destructive canary。
- **批 4 sheet 殼**：先把 `mountSheet`／`SurfaceHost` 的 stack、Escape、focus trap、unmount-before-clear、
  fallback restore逐責任列圖，再分批退 imperative殼；不要把所有 sheet一次改寫。每個 lazy sheet
  chunk與 `surface` error boundary都應保留，且先建立「頂層 surface優先」與「trigger消失 fallback」
  canary。不要在同批動 `syncCommit`；那是批 5的全域同步邊界。

## 8. 收尾標準矩陣

所有 gate指令直接實跑，未接 pipe。

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

`tests/fixtures/nearbyDrawerAppHarness.tsx` 不在 aggregate Prettier tests glob，另以 targeted
Prettier write/check格式化；typecheck涵蓋它。

### Build

```text
$ npm run build

> tennis-partner-finder@0.1.0 build
> vite build

vite v6.4.3 building for production...
transforming...
✓ 509 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                              6.19 kB │ gzip:   2.52 kB
dist/assets/index-BUlzCa6l.css                              65.87 kB │ gzip:  10.86 kB
dist/assets/MessagesPage-f1yvDCiH.js                         1.72 kB │ gzip:   0.87 kB
dist/assets/MePage-Dx-HR2bO.js                              16.13 kB │ gzip:   5.12 kB
dist/assets/MySessionsPage-CA0TDTmG.js                      16.48 kB │ gzip:   4.83 kB
dist/assets/sentryBrowserSdk-Czz5dmkg.js                    87.98 kB │ gzip:  29.72 kB
dist/assets/index-C1NjD8Be.js                              654.04 kB │ gzip: 191.02 kB
✓ built in 1.29s

exit 0
```

Vite main >500 kB是既有 warning；固定 bundle gate如下通過。

### Bundle

```text
$ npm run check:production-bundle

> tennis-partner-finder@0.1.0 check:production-bundle
> node scripts/check-production-bundle.mjs

production bundle check passed: development E2E hook present, production E2E hook absent; 30 files, 12 demo identifiers absent; main 654041/191023 within 658867/192420; largest app lazy MySessionsPage-CA0TDTmG.js 16481/4832 within 18000/5500; total JS 840637/256086 within 849961/259062; private repository: privateDataRepository-KF-FgO4W.js; Sentry: sentryBrowserSdk-Czz5dmkg.js

exit 0
```

### Mock

```text
  4 skipped
  286 passed (53.5s)
```

exit 0。Node unit期間仍有既有 Vite middleware `Port 24678 is already in use` 診斷，但無
`not ok`；aggregate command通過。filter sheet :468本次通過，未重跑。

### Local

`npx supabase start` exit 0；不在報告複製 local development keys。`npm run test:local`：

```text
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4052.707041

  11 skipped
  45 passed (1.4m)
```

exit 0；首次即通過，沒有 fixture污染紅，故不需 guarded reset三拍。

### 空白

```text
$ git diff --check
```

無輸出，exit 0。

## 9. 未做／疑義／BLOCKED

- 未做：Me bridge／slot／preload遷移（3C）、sheet殼（批 4）、`syncCommit`（批 5）、route／CSS／UX。
- 疑義：無。bridge-entry capture隨唯一 startup-only bridge退役；pre-store capture及兩個 destructive
  canary證明所有權威 store更新仍載重 strict pipeline。
- BLOCKED：無。
