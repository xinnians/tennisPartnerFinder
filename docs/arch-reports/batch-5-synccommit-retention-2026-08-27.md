# 批 5 `syncCommit` 殘留理由書

- 日期：2026-08-27
- 基準：批 4C-3 ACCEPTED `16c9344`，批 5 派工 HEAD `acd6fbb`。
- 結論：`src/sessionStore.ts` caller 保留；`src/app/SurfaceHost.tsx` caller
  保留，但其六個呼叫點由 6 減為 4。
- 原則：只保留已由「移除即紅、逐字還原綠」證明的同步觀察邊界。

## 1. `src/sessionStore.ts:102`

### 結論

保留 `useStoreSelector` subscription 中的 `syncCommit(listener)`，並 byte-identical
還原其 import、三行契約註解與呼叫。

### 同步觀察點

- `src/app/AppServicesProvider.tsx:277-285`：Nearby Drawer 的 `map` channel 在
  listener 前同步執行 `useBeforeNearbyDrawerStoreChange()` callback。
- `src/nearbyDrawerFocus.ts:41-72`：callback 從舊 DOM 的
  `document.activeElement` 擷取 session card／toggle／drawer action focus intent。
- `src/pages/NearbySessionsDrawer.tsx:199-203`：React commit 後的 layout effect
  立刻依新 DOM 執行 `restoreNearbyDrawerFocus(rootElement)`。
- `tests/performance.spec.js:430-443`：同一個 native stack 依序執行 filter click、
  close、drawer toggle、focus reset 與 reset click；每次 controller emit 後，下一個
  action 與 focus recovery 都必須看見上一個已 committed DOM。這是原始 race oracle，
  不是為批 5 新增或改寫的斷言。

其餘 production emit 清單經 `rg` 全掃：

```text
src/main.js:216 pageViewStore.emit(channel)
src/controller/discoveryMapController.ts:132 store.emit("map")
src/controller/discoveryMapController.ts:204 store.emit("courts")
src/controller/discoveryMapController.ts:205 store.emit("me")
src/controller/mySessionsController.ts:127 store.emit("mySessions")
src/controller/mySessionsController.ts:128 store.emit("me")
src/controller/authController.ts:95 store.emit("me")
src/controller/authController.ts:145 store.emit("me")
src/controller/authController.ts:180 store.emit("me")
```

除 Nearby Drawer 的 same-stack action／focus recovery 外，沒有找到 emit 返回後立刻
讀 React DOM 或焦點的 production consumer。Playwright 直接 emit 的 store 測試也都在
下一個 locator／`expect.poll` 讀結果；`react-page-focus.spec.js` 第一段的同步 DOM
語意來自 harness 自帶 `syncCommit(root.render)`，因此不能代替此 caller 的證據。

### 移除即紅三拍

mutation：只把 `syncCommit(listener)` 改為 `listener()`。

初步低判別力矩陣為綠，證明派工警示成立：

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test \
  tests/react-page-focus.spec.js --project=desktop-chromium --repeat-each=10
20 passed (6.8s)
EXIT_CODE=0

$ node --test tests/me-page-dom.test.js tests/messages-page-dom.test.js \
  tests/my-sessions-page-dom.test.js tests/nearby-drawer-dom.test.js
# tests 16
# pass 16
# fail 0
EXIT_CODE=0
```

原始 performance race 取樣紅，且連續三輪同一斷言失敗：

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test \
  tests/react-page-focus.spec.js tests/react-unmount.spec.js tests/performance.spec.js \
  --project=desktop-chromium --repeat-each=3

✘ tests/performance.spec.js:416:1
  › a stale opening focus callback cannot steal focus after an immediate drawer redraw

Error: expect(locator).toBeFocused() failed
Locator: locator('[data-testid=\'session-card\']').first()
Expected: focused
Received: inactive
Timeout: 5000ms

3 failed
3 skipped
60 passed (20.7s)
EXIT_CODE=1
```

byte-identical 還原後，`sessionStore.ts` 回到 accepted SHA-256：

```text
3894d60f37e49f5d9934477ad5d7d1fcf8dc7b83302e24e140e4cc78a8d39d62  src/sessionStore.ts
```

同一 race 五輪全綠：

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/performance.spec.js \
  --project=desktop-chromium \
  --grep 'a stale opening focus callback cannot steal focus after an immediate drawer redraw' \
  --repeat-each=5
5 passed (1.9s)
EXIT_CODE=0
```

### 缺少的替代 handshake 與未來退役條件

目前 chained native actions 和 drawer focus recovery 沒有 awaitable commit handshake；
`emit()` 是唯一能保證下一個 same-stack action 看見新 DOM 的邊界。未來需把這段操作改成
React-owned event transition，或讓 public action 回傳可等待的 committed-generation token，
並把 focus intent 與 generation 綁定。原 performance race 在不使用 flush 時連續取樣全綠
後，才可退役此 caller。

## 2. `src/app/SurfaceHost.tsx`

### 總結

| 呼叫點                      | 最終結論 | 直接同步觀察者                                                         |
| --------------------------- | -------- | ---------------------------------------------------------------------- |
| shell mount                 | 保留     | `mountSurfaceShell` 立即 query／回傳 committed `.surface`              |
| mount-failure cleanup       | 移除     | 無；清掉 slot 後可排程 renderer update                                 |
| shell unmount               | 保留     | `close()` 返回前 root 必須為空；replace／restore 依賴同步殼銷毀        |
| imperative `commit(update)` | 保留     | decision／detail 等 imperative 方法返回前 DOM 必須更新                 |
| content render              | 保留     | frozen views 立即 query content 並綁 listener／保存節點                |
| content unmount             | 移除     | slot delete 先排程，緊接的 retained shell-unmount flush 提交完整 close |

### 2.1 保留：shell mount（`SurfaceHost.tsx:268`）

同步觀察點：`src/sheets.js:33-35` 必須在 `mountSheet`／`mountDialog` 同一 stack
取得 committed `surface`，才能 acquire isolation、註冊 keyboard entry、綁 close controls
並回傳 public handle。SurfaceHost 自身也在 commit 後立即
`rootElement.querySelector(".surface")`。

mutation：`commitSynchronously(commitSurfaceSlots)` → `commitSurfaceSlots()`。

```text
$ node --test tests/sheets-dom.test.js
error: 'Surface shell did not mount.'
# tests 16
# pass 0
# fail 16
EXIT_CODE=1
```

還原後：

```text
$ node --test tests/sheets-dom.test.js
# tests 16
# pass 16
# fail 0
EXIT_CODE=0
```

缺少的 handshake：`mountSurfaceShell` 是同步 public bridge，沒有 Promise／callback 可在
React commit 後交付 section。退役前須先把 `mountSheet` facade 與全部 callers 改為
awaitable mount contract；這屬批 6 之後的公開邊界變更。

### 2.2 保留：shell unmount（`SurfaceHost.tsx:291`）

同步觀察點：`src/sheets.js:46-75` 的 close chain 要在 `close()` 返回前完成 shell DOM
銷毀，再執行 onClose／restore／錯誤重拋。replace 同 stack 也依賴舊 shell 先消失。

mutation：shell slot delete 後改用非 flush 的 `commitSurfaceSlots()`。

```text
$ node --test tests/sheets-dom.test.js
# Subtest: 關閉 sheet 時先卸載內容再清空殼
not ok 1 - 關閉 sheet 時先卸載內容再清空殼
Expected values to be strictly equal:
+ '<div class="surface-backdrop" ...>...'
- ''

# tests 16
# pass 8
# fail 8
EXIT_CODE=1
```

還原後同一 sheets-dom 為 16/16 綠。

缺少的 handshake：public `close()` 沒有 completion Promise，onClose 與 restore 也都是
同步 callbacks。退役前須定義 async close completion，並遷移 replace、focus restore 與錯誤
傳遞 consumers。

### 2.3 保留：imperative `commit(update)`（`SurfaceHost.tsx:305`）

同步觀察點：`src/views/sessionFormViews.js` 的 decision handle 會在 court catalogue
refresh 與 in-flight decision 期間同步呼叫 `content.setCourts()`／`content.setTerminal()`；
`tests/map-and-bootstrap-smoke.spec.js:377-428` 在呼叫返回後直接檢查 refresh 前的
candidate button 已 detach，並要求 replacement button 維持 disabled。Session Detail 的
`enterConfirming`／`setJoinPreview`／`handleEscape` 也共用這個 boundary。

mutation：`commitSynchronously(update)` → `update()`。較窄的 detail/focus 取樣曾全綠，
但完整原始 mock matrix 在 desktop 與 mobile 同時紅：

```text
$ npm run test:mock
✘ tests/map-and-bootstrap-smoke.spec.js:377:1
  › refreshing the court catalogue during an in-flight decide detaches the buttons
    and leaves them locked after it resolves

Error: the in-flight refresh must detach the pre-refresh candidate button
Expected: false
Received: true
tests/map-and-bootstrap-smoke.spec.js:427:5

2 failed
4 skipped
296 passed (52.9s)
EXIT_CODE=1
```

這是兩個 project 的同一同步斷言，不是 flake。byte-identical 還原後的 focused 取樣與
完整 mock 綠燈記錄見批 5 主回報。

缺少的 handshake：imperative methods 都回傳 `void`／boolean，view 沒有可等待的
committed-generation token。退役前須將 decision/detail command 改成 React-owned action，
或回傳明確 commit completion；原 button identity oracle 必須在不 flush 時仍全綠。

### 2.4 保留：content render（`SurfaceHost.tsx:311`）

同步觀察點包括：

- `src/views/discoverySurfaceViews.js:84`：立即掃 `[data-player-id]` 並綁 click。
- `src/views/sessionFormViews.js:479-487`：立即保存 decision controls／error／time input／buttons。
- `src/views/sessionSurfaceViews.js:87-92`、`:150`、`:194`、`:387-390`、
  `:435-440`：立即保存 chat／withdraw／report nodes 並綁 native handlers。
- 多個 content factory 在 `surfaceContent.render(...)` 返回後立刻檢查 imperative ref；例如
  `src/sheets/PlayerCardSheet.tsx` 的 mount fail-closed guard。

mutation：content slot 設定後改用非 flush 的 `commitSurfaceSlots()`。

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test \
  tests/discovery-interactions-smoke.spec.js --project=desktop-chromium \
  --grep 'player drawer and card escape every public value'

Error: expect(received).toContain(expected)
Received has value: undefined
tests/discovery-interactions-smoke.spec.js:369:69
1 failed
EXIT_CODE=1

$ node --test tests/player-card-sheet-dom.test.js
error: 'PlayerCardSheet content did not mount.'
EXIT_CODE=1
```

還原後 focused content／view matrix 為 33/33 綠，完整 race/focus 取樣亦為
63 passed／3 skipped。

缺少的 handshake：frozen views 仍以同步 function return 作為 content-ready 訊號。
退役前要把 native binding 收進 React event handlers，並讓需要 imperative refs 的 factory
取得明確 layout-ready callback／Promise；不得只把既有 query 改成可空而吞掉功能。

## 3. 已移除的 SurfaceHost 呼叫點

以下 mutation 專屬與最終原始矩陣均綠，因此依派工規則真移除：

- mount-failure cleanup：registry／slots 已同步刪除，renderer 空 snapshot 不再強制 flush。
- content unmount：先同步把 slot 從 Map 刪除並排程 renderer；正常 close 緊接著由保留的
  shell-unmount flush 提交，維持 content-before-shell ordering。standalone content cleanup
  沒有同步 DOM consumer。

最終 repeat 取樣：

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test \
  tests/react-page-focus.spec.js tests/react-unmount.spec.js tests/performance.spec.js \
  --project=desktop-chromium --repeat-each=3
3 skipped
63 passed (47.6s)
EXIT_CODE=0
```

## 4. Caller 掃描與退役門檻

最終 production caller files 仍為：

```text
src/sessionStore.ts
src/app/SurfaceHost.tsx
```

`syncCommit.ts` 因 caller 未歸零而保留；三個 test harness fixture 亦未解凍、未改。
下批不得以一次 bulk replacement 拔除。應先處理 sessionStore 的 committed-generation
handshake，再將 frozen surface views 的 native DOM binding／imperative refs 移入 React
ownership，最後才可能移除 SurfaceHost 的四個同步邊界。
