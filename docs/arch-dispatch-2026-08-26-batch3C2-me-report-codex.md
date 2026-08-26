# 批 3C-2 回報：Me 管道收斂＋adapter／slot 機制退役

- 日期：2026-08-26
- 開工基準：`ec20cdd`。實際 HEAD `4d050be` 只比 accepted baseline 多派工／roadmap 文件；
  `git diff ec20cdd..HEAD` 無 production code，開工 working tree 乾淨。
- 狀態：完成，無 BLOCKED；未 commit、未 push。

## 1. 結果摘要

- Me 已由 `App.tsx` 直接 portal 到固定 `#me-root`；`main.js` 的頁面 mount 鏈、五欄 options bag、
  facade、bridge 與 App slot 全數退役。
- `MePage` 現在以 `useMeState()` 取得 session store 九欄、以 `useMePageView()` 取得精確的
  `notificationSettings`／`presenceLocationStatus` 兩欄。presence 的 profile 布林值與 page-view
  location status 由 provider main chunk 的 `composeMePresence()` 單點組裝，沒有 props fallback 或 mirror。
- Me pending action scope／sync 已移入 `MePage` 的 layout commit，key 是 live
  `authSession?.user?.id ?? null`，不是 `authEpoch`。
- `PageSlot`、`renderPortals`、`renderPage`、`nextSlotId`、
  `commitPageAdapterSynchronously` 五件套歸零；production `syncCommit` caller 由 3 降為 2。
- `src/views/pageViews.js` 已刪除。它剩下的兩個 DOM helper 原樣遷入既有 facade
  `sessionViews.js`，避免為兩個 main 既有 import 新增另一層模組。
- 全部 static、bundle、mock 與 local gate 通過。

## 2. Scope 遷移與 node-replacement oracle

### 遷移前後

| 責任 | 遷移前 | 遷移後 |
| --- | --- | --- |
| account key | `main.js` 初始 bag 的 `authSession`，另以 `sessionStore` bridge fallback 補 live id | `MePage` 的 `useMeState()` live `authSession?.user?.id` |
| scope 落點 | `pageViews.js` bridge 組出 App slot commit callback | `MePage` 無 dependency array 的 layout effect |
| commit 動作 | `onStoreCommit` → `setMySessionActionScope` → `syncPendingMySessionActions` | owner 直接依序呼叫同兩個 production 函式 |
| node replacement | adapter callback 間接同步 | React owner 每次 layout commit 對當前 root 同步 |

實作中的 commit 順序是：

```text
setMySessionActionScope(props.rootElement, authSession?.user?.id ?? null);
syncPendingMySessionActions(props.rootElement);
```

新增 `account-settings-smoke.spec.js` oracle：帳號 A 的 visibility action 保持 pending，切到 signed-out
再切帳號 B，確認原 toggle node 已 `isConnected === false`；B 的 replacement node 必須立即 enabled、
顯示 B 的 checked state且沒有 error。之後才 reject A 的 stale promise，再驗 B 仍 enabled、無 error、無 runtime
console error。完整 mock matrix 也在 desktop／mobile 各跑一次此 oracle。

### Destructive canary 三拍

同一條 focused 指令：

```text
npx playwright test tests/account-settings-smoke.spec.js --project=desktop-chromium --grep "a Me account switch clears a replaced node's stale pending and error state"
```

1. 完整接線：綠，`1 passed`。
2. 只刪 `setMySessionActionScope(props.rootElement, authSession?.user?.id ?? null);` 一行：紅，
   `Expected: enabled / Received: disabled`，落在帳號 B replacement toggle，`1 failed (5.3s)`。
3. 以 `apply_patch` 還原同一行、內容 byte-identical：綠，`1 passed (1.3s)`。

因此此測試證偽的是 live account scope 接線，而不只是 React node identity。

## 3. Auth 差分 preload caller 對照

### Before

`preloadAuthenticatedViewsForAuth(authSession)` 是 `sessionViews.js` private 函式，production 唯一 caller
在 `pageViews.js` Me bridge。`mountMeDestination()` 的首次 render 提供 init auth snapshot；後續 adapter render
提供 auth 差分觸發。hover/focus intent 另走 `preloadForIntent`。

### After

| caller | 傳入值 | 對應語意 |
| --- | --- | --- |
| `main.js` init | `getAppState().authSession` | 等價取代首次 Me mount preload |
| controller `onAuthIdentityChange` callback | live `context.session` | 每次 sign-in／account identity change 的唯一 auth 差分觸發；signed-out 仍由既有 `if (authSession)` no-op |

`sessionViews.js` 的字面 `if (authSession) preloadAuthenticatedViews();` 保留。配置 App module 時，Me 的
兩個 preload table entry 都改綁 `App.tsx` 的直接 export reference；沒有改名規避 scanner：

- `authenticatedViewPreloads[0] = preloadMePageInApp`
- `namedViewPreloads.me = preloadMePageInApp`
- `pointerover`／`focusin` listener與 `#me-tab` intent仍在 `sessionViews.js`
- Messages／MySessions preload wrapper未改

## 4. Adapter、slot 與 pageViews 處置

刪除的 Me 鏈：

```text
main.mountMeDestination
  -> sessionViews.renderMePage
  -> pageViews.renderMePage/configurePageViews
  -> App.renderMePageInApp
  -> renderPage/mePages slot/onCommit
  -> MePage props bag
```

現在是：

```text
App fixed #me-root portal
  -> MeDestination lazy/error boundary
  -> MePage typed store/page-view hooks
```

`App.tsx` 採 MySessions／Nearby 的 fixed-root cache 樣板：`mePortalRoot ??=`，portal key `"me"`，
`resetKey={0}`；Me lazy loader與 `surface="me-page"` error boundary保留。

移除 App synchronous adapter commit 後，首次 concurrent portal commit可能晚於 `main.js` 的 direct child
listener attachment。為保留既有行為，只有 attachment boundary 改成從固定靜態
`#map-topbar-root`／`#bottom-navigation-root` delegation；五個 route action與參數、home logo action與
player-directory action完全相同。navigation focused suite與完整 desktop/mobile matrix均通過。

`pageViews.js` 的處置是刪檔：Me bridge/configuration已無責任，僅餘
`renderPlayerLayerToggle`／`renderMapDataStatus`。兩者搬到已經對 main export同名 facade 的
`sessionViews.js`，保留 DOM、ARIA、文案與 retry listener語意；main import面不需改。

### Reverse scans

以下掃描於 `src`＋`tests` 無輸出（exit 1＝零 match）：

```text
rg -n "renderMePage|renderMePageInApp|mountMeDestination|mePages|renderPortals|renderPage\(|commitPageAdapterSynchronously|configurePageViews|PageSlot|nextSlotId" src tests
```

`syncCommit` production scan逐字輸出：

```text
src/syncCommit.ts:8:export function syncCommit(update: () => void): void {
src/sessionStore.ts:102:            syncCommit(listener);
src/app/SurfaceHost.tsx:60:  syncCommit(update);
```

除 helper 本體外只有兩個 approved caller。`tests/react-surface-lifecycle.test.js` 僅依派工解凍修改
`approvedCallers` 那一行，其他 assertion未動。

## 5. Bundle 與 import 對帳

Accepted baseline取自 `ec20cdd`／3C-1驗收產物；本批 gate不調整。

| 指標 | baseline | 本批 | 淨值 | gate餘裕 |
| --- | ---: | ---: | ---: | ---: |
| main raw | 653,562 B | 652,480 B | −1,082 B | 6,387 B |
| main gzip | 190,852 B | 190,514 B | −338 B | 1,906 B |
| total JS raw | 839,689 B | 838,388 B | −1,301 B | 11,573 B |
| total JS gzip | 255,829 B | 255,413 B | −416 B | 3,649 B |
| MePage raw | 15,654 B | 15,439 B | −215 B | 2,561 B |
| MePage gzip | 4,997 B | 4,929 B | −68 B | 571 B |

MePage exact artifact：`MePage-DCsBEXcJ.js 15439/4929`。最大 app lazy chunk仍是 MySessions
`16476/4830`，也在 `18000/5500` gate內。

`__importAppModule(` 對帳：

```text
baseline 107
current  107
delta      0
```

本批沒有可退役的 test runtime dynamic-import call；沒有換拼法或把 hook塞進 Me lazy chunk。

## 6. 凍結面自證

- `showMePage` 兩顆 requestAnimationFrame仍在 `main.js:462`、`:465`；
  `git diff ec20cdd --unified=0 -- src/main.js` 對該 function body無 hunk。
- `#me-root`、`data-me-heading`、`data-notification-settings-heading`、
  `surface="me-page"`、Me testid／文案均保留。
- `react-surface-lifecycle` 的 lazy `=3` 與 SESSION_VIEWS
  `pointerover`／`focusin`、`if (authSession) preloadAuthenticatedViews()` assertion未改且 unit gate通過。
- `pageViewStore` shape、`publishPageView`、`sessionActions.ts`、`meFocus.js`均零 diff。
- MySessions、Messages、Nearby、CSS、data API、新依賴與 sheet殼未改。
- route functions、hash semantics與 action arguments未改；只把 transient React child上的 startup listener改綁
  stable portal host delegation，原因與驗證見 §4。

## 7. Codex 五問

### 1. 接線是否真的變少？

是。五階段 `main -> sessionViews -> pageViews -> App slot -> MePage props` 更新鏈收斂為
`Provider typed hook -> MePage`，並刪掉 main mount、五欄 bag、三層 Me facade/bridge/export以及整套 App
slot。反掃十個退役 symbol均為零；production `syncCommit` caller 3→2。

### 2. context／hook 是否隱藏了依賴？

沒有。MePage明寫 `useMeState`、`useMePageView`、`useMeActions`、`useMeAppActions` 四個具名依賴；
`useMePageView` 返回型別只有兩欄且缺 `pageViewStore` 立即 throw。presence 組裝是明確 pure function，
沒有 generic service locator、全 state暴露、props fallback或第二份 mirror。

### 3. bundle 是否增加？

沒有。main raw/gzip、total raw/gzip、MePage raw/gzip六個數字全下降；gate無調整。main gzip回收
338 B，MePage gzip回收 68 B。

### 4. 測試是否更接近使用者行為？

是。新 oracle真實點擊 Me toggle製造 pending，經 signed-out再登入 B造成 node replacement，最後延遲 reject
A promise，直接驗使用者看到的 enabled/checked/error狀態。刪 scope一行便穩定紅，還原即綠；完整 mock在
desktop/mobile都執行，local真 auth/store journey也全綠。

### 5. 對批 4 sheet 殼的建議

先把現有 sheet責任拆成可驗收清單：stack／topmost Escape、focus trap、trigger restore與 trigger消失時
fallback、unmount-before-clear、lazy loader、各 surface error boundary。以固定 shell root＋typed snapshot/action
接口逐一遷移，不要一次改完所有 sheet種類；每遷一類先做 destructive canary，至少覆蓋「頂層 surface先關」、
「replacement/unmount只一次」與「trigger消失不把焦點丟到 body」。保留現有 `SurfaceHost` 的
`syncCommit` 邊界給批 5專門處理，批 4不要同時改 route、文案或資料層。

## 8. 收尾標準矩陣

所有 gate直接實跑，未接 pipe；mock/local未重跑單一 flake，local未做 guarded reset。

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
Checking formatting...
All matched files use Prettier code style!
exit 0
```

### Build

```text
$ npm run build
vite v6.4.3 building for production...
✓ 508 modules transformed.
dist/assets/MePage-DCsBEXcJ.js   15.44 kB │ gzip: 4.93 kB
dist/assets/index-D_2P2V7g.js   652.48 kB │ gzip: 190.51 kB
✓ built in 1.22s
exit 0
```

### Production bundle

```text
$ npm run check:production-bundle
production bundle check passed: development E2E hook present, production E2E hook absent; 30 files, 12 demo identifiers absent; main 652480/190514 within 658867/192420; largest app lazy MySessionsPage-TcUV2e8q.js 16476/4830 within 18000/5500; total JS 838388/255413 within 849961/259062; private repository: privateDataRepository-DVISkPxh.js; Sentry: sentryBrowserSdk-Czz5dmkg.js
exit 0
```

### Mock

```text
$ npm run test:mock
# tests 336
# pass 336
# fail 0
# skipped 0
Running 292 tests using 4 workers
4 skipped
288 passed (51.1s)
exit 0
```

相較 286/4 baseline，新增 oracle在 desktop/mobile各增加一個 passed test。

### Local

```text
$ npm run test:local
# tests 2
# pass 2
# fail 0
# duration_ms 4191.432333
Running 56 tests using 1 worker
11 skipped
45 passed (1.5m)
exit 0
```

### Diff hygiene

```text
$ git diff --check
<no output>
exit 0
```

## 9. 未做、疑義與 BLOCKED

- 未做：commit、push；批 4 sheet殼；批 5剩餘兩個 `syncCommit` caller；批 6 TS化；任何 UX／
  文案／CSS／route/data API變更。
- 疑義：direct portal首 render不再由已退役的 App `syncCommit` 保證 child立即存在，因此把既有 child
  click handlers等價 delegation到固定 static portal hosts。沒有改 route intent；49-test focused matrix、完整 mock
  desktop/mobile與 local均證明行為保真。
- BLOCKED：無。全部 required gate通過，bundle三組皆下降。
