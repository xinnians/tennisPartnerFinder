# 批 3C-1 MePage 資料與 action 單源化回報（Codex）

- 日期：2026-08-26
- 開工基準：派工單指定 `5870262`；實際 HEAD `3cfe4db` 只是該基準上的 dispatch-only commit，production tree 與 `5870262` 相同。
- 開工狀態：`git status --short` 無輸出。
- 交付狀態：未 commit、未 push；working tree 留給驗收方。

## 1. 結果

MePage 的九個 sessionStore 權威欄已改為 `useMeState()` 單源；兩個 controller action 改為
`useMeActions()`；九個 app callback 與兩個建置常數改為 fail-closed `useMeAppActions()`。
`MePageOptions` 留下本批凍結的 `notificationSettings`、`presence`、`pageViewStore`、
`onStoreCommit`，並經補件恢復 bridge-scope-only `sessionStore` 型別欄；`rootElement` 仍由 App slot 注入，
MePage 本體不消費 `sessionStore`。

新增：

- `tests/fixtures/meAppHarness.tsx`：fake session store、fake page-view store、fake controller、fake
  `meApp` 經 `AppServicesProvider` 注入；pending commit 直接重用 production
  `setMySessionActionScope`／`syncPendingMySessionActions`。
- `tests/me-page-dom.test.js`：render、九欄 selector parity、兩個 controller action、九 callback＋兩常數
  全部逐值驗證；已註冊 `test:session-unit`。

## 2. services、hooks 與衍生欄

### `meApp` 精確接線

| 欄位 | 原 `mountMeDestination` 語意 | 新 `configureAppServicesInApp` 語意 |
| --- | --- | --- |
| `onEditProfile` | `() => openProfileCompletion({ mode: "standalone" })` | 逐字相同 |
| `onEnablePush` | `enablePushNotifications` | 同一函式 reference |
| `onLinkProvider` | `handleLinkProvider` | 同一函式 reference |
| `onSaveCourtSubscriptions` | `updateCourtSubscriptions` | 同一函式 reference |
| `onSaveNotificationPreferences` | `updateNotificationPreferences` | 同一函式 reference |
| `onSetOpenToGreeting` | `updateOpenToGreetingSetting` | 同一函式 reference |
| `onSetPresenceSharing` | `updatePresenceSharing` | 同一函式 reference |
| `onSignIn` | `() => openSafeLogin({ action: "me" })` | 逐字相同 |
| `onSignOut` | `handleSignOut` | 同一函式 reference |
| `lineProviderId` | `AUTH_LINE_PROVIDER_ID` | 同一常數 |
| `supportHref` | `supportContactHref()` | setup 時一次求值，與舊 mount-once 相同 |

`useMeAppActions()` 在 `meApp` 缺席時 throw，沒有 noop fallback。`useMeActions()` 直接保留
`controller.togglePlayerVisibility` 與 `controller.unblockPlayer` reference。

### `selectMeState` 九欄

| 欄位 | 搬移／投影來源 |
| --- | --- |
| `authSession` | `state.authSession` |
| `profile` | `state.profile` |
| `avatarUrl` | 原 `currentAuthAvatarUrl()`／Me fallback 的 `metadata.avatar_url ?? metadata.picture ?? ""`，現只在 selector 一處 |
| `linkedProviders` | 原 Me fallback 的 identities `flatMap`，provider 空值仍略過；`currentLinkedProviders` main import 因無其他 caller 移除 |
| `courts` | `state.courts` |
| `playerVisibility` | `selectControllerMySessionsView(state).isPublic`，未另寫 visibility derive |
| `blockedPlayers` | 同一 My Sessions selector projection |
| `blockedPlayersError` | 同一 My Sessions selector projection |
| `blockedPlayersStatus` | 同一 My Sessions selector projection |

`useMeState()` 仍只訂 `sessionStore` 的 `"me"` channel；沒有新增 `"courts"` subscription。
`ControllerAuthSession` 只補齊 runtime 已存在的 `identities`／`user_metadata` 型別，未改資料形狀。

## 3. main bag：26 → 5

`mountMeDestination` 經補件後最終傳：

1. `authSession`：只供凍結的 `pageViews.js` pending-action account scope fallback，MePage 不讀此 option；
2. `notificationSettings`；
3. `presence`；
4. `pageViewStore`。
5. `sessionStore`：bridge-scope-only，供 commit callback 每次 live 讀取目前 user id。

`rootElement` 與 `onStoreCommit` 仍由 App adapter/slot 注入。其餘九資料、十一 action、兩常數全離開
bag；`sessionStore` 僅以 bridge-scope-only 身分恢復，不是 MePage 資料來源。`currentAuthAvatarUrl` 因
profile orchestration 仍使用而保留；
`currentLinkedProviders` 的 main import 已移除；`supportContactHref()` 留作 `meApp` setup 常數。

bridge 補正：原 3C-1 移除 `sessionStore` 後，`mountMeDestination` 的 mount-once closure 捕捉到登入前
`authSession = null`，所以「既有第二 fallback 仍取得相同 user id」的原聲稱不實。本補件恢復
`sessionStore` bridge-only 欄，讓凍結 bridge 的 commit callback 每次以
`options.sessionStore?.getState?.().authSession?.user?.id` live 讀目前帳號並維持跨帳號 pending 隔離；
MePage 本體仍不消費此 store。3C-2 隨 adapter 退役時，會把 scope 以 auth identity 為 key 搬進
MePage owner 並補 node-replacement 帳號切換 oracle。`renderMePage` bridge 本體零修改。

驗收紀錄的重要證偽亦納入後續規劃：`account-settings:141-146` 在 HEAD 刪除
`syncPendingMySessionActions` 的 canary 仍全 mock 綠，該斷言原本就不咬 bridge sync；實際載重是
React node identity 與 `runMySessionAction` imperative disable。因此 3C-2 必須新增 node-replacement
情境，不能沿用現有 Me rerender 情境當 scope/sync oracle。

## 4. 14 個 `renderMePage` 直呼逐點對照

| 舊位置 | before | after | 理由／oracle |
| --- | --- | --- | --- |
| account `:11` | adapter＋presence failure props | `renderMeAppHarness` | provider action，保留錯誤與 focus 斷言 |
| account `:57` | adapter rerender | harness `update` | 保留 pending disable、error、focus；commit callback 重用兩個 production pending/scope 函式 |
| account `:162` | adapter presence props | harness | profile 權威 slice 承載 greeting/share，參數斷言不變 |
| account `:196` | adapter notification/courts | harness | session/page-view 雙 fake store，六偏好與 court IDs oracle 不變 |
| account `:293` | adapter 11 courts | harness | 全選 11 座 oracle 不變 |
| account `:368` | adapter callback 內 rerender | harness `update` | 保留 rerender-authoritative disabled oracle |
| chat `:173` | adapter block list | harness | blocked slice＋unblock controller action |
| chat `:414` | adapter court subscriptions | harness | courts/store＋meApp callback |
| chat `:455` | adapter empty courts | harness | 仍只 emit `"me"`，未新增 courts channel |
| discovery `:283` | 點 subscribe 後 adapter＋手動 focus | 先在真 `#me-root` seed harness，再點真 drawer subscribe | 真 `onSubscribe`→`showMePage`→production rAF；刪手動 focus |
| discovery `:440` | adapter D8 profile | harness | profile/court/action 結構斷言不變 |
| discovery `:461` | adapter D8 rerender | 同一 harness `update` | NTRP null 反例不變 |
| auth forms `:88` | adapter login-method props | harness | identities derive、LINE 常數、link callback 單源 |
| react page focus `:28` | adapter rerender | harness `update` | 與同檔 MySessions 段一致，DOM node identity/focus oracle 不變 |

最終：`rg -n "renderMePage\\(" tests` 無輸出。沒有刪除或弱化 assertion。

## 5. `__importAppModule` 對帳

全庫 JS/TS importer：`119 → 107`，delta `−12`；全是 14 個 Me adapter call 搬走後真正不再需要的
`sessionViews` importer，兩處同時還需 preload 的 importer 保留，沒有換拼法。

| 檔案 | before | after | delta |
| --- | ---: | ---: | ---: |
| account-settings | 11 | 6 | −5 |
| chat-settings-filters | 18 | 15 | −3 |
| discovery-interactions | 17 | 14 | −3 |
| auth-forms | 31 | 30 | −1 |
| react-page-focus | 3 | 3 | 0 |

## 6. bundle 對照

Gate 未調整。

| 指標 | `5870262` baseline | 本批 | 淨變化 | gate 餘裕 |
| --- | ---: | ---: | ---: | ---: |
| main raw | 654,041 B | 653,562 B | −479 B | 5,305 B |
| main gzip | 191,023 B | 190,852 B | −171 B | 1,568 B |
| total JS raw | 840,637 B | 839,689 B | −948 B | 10,272 B |
| total JS gzip | 256,086 B | 255,829 B | −257 B | 3,233 B |
| MePage lazy | 16.13 kB / 5.12 kB | 15,654 B / 4,997 B（Vite 15.65/5.00 kB） | 下降 | gzip 503 B |

## 7. 凍結面自證

- `src/views/pageViews.js`、`src/meFocus.js`、`src/sessionActions.ts` 零 diff；bridge、scope、pending/error
  實作未改。
- `renderMePageInApp`、`mePages` slot、preload chain、`configurePageViews`、三個 production
  `syncCommit` caller均保留。
- `notificationSettings`、`presence`、`pageViewStore`、`"me"` channel、`onStoreCommit`、
  `rootElement` 保留；3C-2 責任未提前。
- `surface="me-page"`、所有 testid/id/class/aria/文案與 `data-my-sessions-error` 節點零修改。
- `tests/react-surface-lifecycle.test.js`、`tests/fixtures/appRuntime.js`、`tests/me-focus.test.js`、
  `tests/performance.spec.js`、`tests/navigation-shell-smoke.spec.js` 零 diff。
- route、sheet 殼、CSS、UX、新依賴均未改。

## 8. Codex 五問

### 1. MePage 是否只剩單一 sessionStore 資料來源？

是。九欄都由 `useMeState()`／`selectMeState` 取得，MePage 已無對應 props 或 fallback；selector
parity test 逐值 `deepStrictEqual`。

### 2. action 與 app 常數是否 fail-closed 且語意保真？

是。兩 controller action 保留原 reference；九 callback／兩常數由必備 production `meApp` 一次注入，
hook 缺服務即 throw。DOM test 逐一轉呼並驗參數。

### 3. 測試是否仍能證偽 pending、focus 與 authority？

是。14 處全部經 Provider fake services；pending test 使用 production scope/sync 函式，rerender 中仍 disabled、
失敗仍顯示 error 並回焦；subscribe 測試不再手動 focus，而由真 UI callback/rAF 落點。完整 desktop/mobile
與 local 真 auth/store journeys 全綠。

### 4. bundle 是否退步？

沒有。main、total、MePage lazy 三組 raw/gzip 都下降；MePage gzip 4,997 B，低於 5,500 B gate 503 B。

### 5. 對 3C-2 管道收斂與 slot 全套拆除的建議

先新增 typed `useMePageView()`，讓 notification/presence 的跨 store投影只在 provider main chunk；再把
pending action scope移到 Me owner（以 auth identity/auth epoch 作 key），把 notification focus intent放入具名
Me focus provider。兩條 canary應先固定：subscribe 真 UI rAF focus，以及 pending action跨 rerender disable/error/focus。
完成後依序刪 `renderMePage` bridge、`renderMePageInApp`、`mePages` map/slot、adapter commit、
`configurePageViews` 與只服務 Me 的 preload glue；保留 Me lazy import與 authenticated preload intent，不要同批動
sheet 殼、route 或全域 `syncCommit`。

## 9. 收尾標準矩陣

所有 gate 直接實跑，未接 pipe。

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

Aggregate glob 不含 fixture TSX；另跑 `npx prettier --check tests/fixtures/meAppHarness.tsx`，
`All matched files use Prettier code style!`，exit 0。

### Build

```text
$ npm run build
✓ 509 modules transformed.
dist/assets/MePage-C6OXeLB2.js       15.65 kB │ gzip: 5.00 kB
dist/assets/MySessionsPage-aifVwc4a.js 16.48 kB │ gzip: 4.83 kB
dist/assets/index-CY3E8E2P.js       653.56 kB │ gzip: 190.85 kB
✓ built in 1.22s
exit 0
```

Vite main >500 kB 是既有 warning；固定 bundle gate 通過。

### Production bundle

```text
$ npm run check:production-bundle
production bundle check passed: development E2E hook present, production E2E hook absent; 30 files, 12 demo identifiers absent; main 653562/190852 within 658867/192420; largest app lazy MySessionsPage-aifVwc4a.js 16481/4833 within 18000/5500; total JS 839689/255829 within 849961/259062; private repository: privateDataRepository-CRA8Vl_R.js; Sentry: sentryBrowserSdk-Czz5dmkg.js
exit 0
```

### Mock

```text
$ npm run test:mock
unit: 335 tests, 335 pass, 0 fail
playwright: 4 skipped, 286 passed (50.6s)
exit 0
```

既有 unit Vite middleware `Port 24678 is already in use` 診斷仍出現但無 `not ok`；aggregate 通過。
`chat-settings-filters:468` 本次首次通過，未重跑。

### Local

```text
$ npm run test:local
local API: 2 passed, 0 failed
playwright: 11 skipped, 45 passed (1.5m)
exit 0
```

首次通過，無 fixture 污染，故不需 guarded reset 三拍。

### 空白

```text
$ git diff --check
(no output)
exit 0
```

## 10. 未做／疑義／BLOCKED

- 未做：pageView hook、scope/rAF owner 收斂、Me adapter/slot/preload/config 全套拆除；全部留給 3C-2。
- 疑義：無。production bag 保留 `authSession` closure fallback 與 bridge-scope-only `sessionStore` live fallback；
  兩者都不回流 MePage 資料 owner。
- BLOCKED：無。所有 hard gate 通過，MePage gzip 未超 5,500 B。
