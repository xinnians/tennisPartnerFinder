# 批 5 回報：`syncCommit` caller 2→0 條件式退役審計

- 日期：2026-08-27
- 派工單：`docs/arch-dispatch-2026-08-27-batch5-synccommit.md`
- 開工 HEAD：`acd6fbb`；working tree 乾淨。
- 前置：批 4C-3 ACCEPTED `16c9344`。
- 結果：完成，無 BLOCKED；caller files 最終仍為 2，SurfaceHost 六個呼叫點由 6
  減為 4。未 commit、未 push。
- 殘留理由書：
  `docs/arch-reports/batch-5-synccommit-retention-2026-08-27.md`。

## 1. 結論與計畫檢視

本批沒有為了達成數字上的 2→0 而拔除載重同步邊界。逐 caller／逐呼叫點的最終結論：

| 範圍                              | 結論                                                             |
| --------------------------------- | ---------------------------------------------------------------- |
| `sessionStore.ts` subscription    | 保留；移除使既有 drawer focus race 3/3 紅                        |
| SurfaceHost shell mount           | 保留；移除使 sheets-dom 0/16                                     |
| SurfaceHost mount-failure cleanup | 移除；原始矩陣全綠，沒有同步 observer                            |
| SurfaceHost shell unmount         | 保留；移除使 close DOM／cleanup 8/16 紅                          |
| SurfaceHost `commit(update)`      | 保留；移除使 decision button identity desktop＋mobile 同時紅     |
| SurfaceHost content render        | 保留；移除使 player view binding 與 content mount fail-closed 紅 |
| SurfaceHost content unmount       | 移除；slot 先排程，後續 retained shell flush 維持 close order    |

計畫最重要的風險實際發生兩次，而且完整矩陣成功攔下：

1. caller A 暫時移除後，`react-page-focus` 10 輪和四頁 DOM unit 都綠；若只跑這些會
   誤判可退役。原始 `performance.spec.js:416` repeat 才連續 3/3 紅，證明 harness
   自帶 flush／重試型斷言確實會造成假綠。
2. SurfaceHost `commit(update)` 暫時移除後，detail/focus focused tests 也全綠；完整
   mock 的 `map-and-bootstrap-smoke.spec.js:377` 在 desktop／mobile 同時紅，證明
   decision sheet 還有返回前 DOM identity consumer。

因此計畫本身不用改案，但「focused green 不代表可移除」必須提升為後續審計紀律：
任何 shared synchronous boundary 都要跑完整原始 consumer matrix，不能只相信點名測試。

React best-practices 的 event ownership 原則也支持本次裁定：可以讓沒有 observer 的 update
回到 React batching，但 native same-stack action、imperative DOM handshake 與 frozen facade
尚未改成 React-owned event 前，不能先拿掉它們唯一的 committed boundary。

## 2. Caller A：`src/sessionStore.ts:102`

### 2.1 Production emit 與同步 observer 審計

以指令掃描，不手數：

```text
$ rg -n '\b(?:store|pageViewStore)\.emit\(' src/main.js src/sessionController.js \
  src/controller src/app src/features src/pages src/sessionViews.js

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

逐項結果：

- `pageViewStore`：publish 後的 page focus 是 rAF，沒有直接 DOM read。
- auth／courts／mySessions：controller 後續讀 store state、發另一 channel 或啟動 async
  refresh，沒有 emit 返回後直接 query DOM。
- `map` channel 有唯一載重 same-stack observer：
  `AppServicesProvider.tsx:277-285` 先以 `useBeforeNearbyDrawerStoreChange()` capture 舊
  active element；commit 後 `NearbySessionsDrawer.tsx` layout effect 在新 DOM 執行
  restore。`performance.spec.js:430-443` 於同一 native stack 串接 filter、close、toggle、
  reset focus／click，下一個 action 必須看見上一個 committed DOM。

### 2.2 測試側直接呼叫審計

`react-page-focus.spec.js` 中 store emit 後的 DOM／focus 結果都是下一個 Playwright
locator 或 `expect.poll`；第一段同一 `page.evaluate` 的同步 render 由
`meAppHarness`／`mySessionsAppHarness` 自帶 `syncCommit(root.render)` 提供，不能用來證明
production `sessionStore.ts:102` 可移除。

### 2.3 Mutation 三拍與結論

mutation：`syncCommit(listener)` → `listener()`。

假綠證據：

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

真正 race oracle 紅：

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test \
  tests/react-page-focus.spec.js tests/react-unmount.spec.js tests/performance.spec.js \
  --project=desktop-chromium --repeat-each=3

✘ tests/performance.spec.js:416:1
  › a stale opening focus callback cannot steal focus after an immediate drawer redraw
Error: expect(locator).toBeFocused() failed
Expected: focused
Received: inactive

3 failed
3 skipped
60 passed (20.7s)
EXIT_CODE=1
```

byte-identical 還原後 SHA-256 回到 accepted：

```text
3894d60f37e49f5d9934477ad5d7d1fcf8dc7b83302e24e140e4cc78a8d39d62  src/sessionStore.ts
```

同一 race 五輪：

```text
5 passed (1.9s)
EXIT_CODE=0
```

結論：caller A 保留。替代 handshake、同步觀察點與未來退役條件詳見理由書 §1。

## 3. Caller B：SurfaceHost 六個呼叫點

### 3.1 Shell mount：保留

同步 observer：`mountSurfaceShell` commit 後立即 query `.surface`；`sheets.js` 必須在
`mountSheet` 同一 stack 取得它才能建立 isolation、keyboard entry、close bindings 與 handle。

mutation 紅：

```text
$ node --test tests/sheets-dom.test.js
error: 'Surface shell did not mount.'
# tests 16
# pass 0
# fail 16
EXIT_CODE=1
```

還原綠：16/16。結論保留。

### 3.2 Mount-failure cleanup：移除

這一點只在 committed shell 仍找不到 `.surface` 的 fail-closed 分支執行。registry 與 slot
Map 已同步刪除；沒有 callback、DOM read 或下一個 public handle 會在 throw 前觀察 empty
React root。改成普通 `commitSurfaceSlots()` 後，sheets-dom 16/16 及最終完整矩陣全綠。

### 3.3 Shell unmount：保留

同步 observer：`close()` 返回前 root 必須為空；replace、onClose、restore 與錯誤重拋都在
同一同步 close chain。

mutation 紅：

```text
# Subtest: 關閉 sheet 時先卸載內容再清空殼
not ok 1 - 關閉 sheet 時先卸載內容再清空殼
Expected: ''
Received: '<div class="surface-backdrop" ...>...'

# tests 16
# pass 8
# fail 8
EXIT_CODE=1
```

還原綠：16/16。結論保留。

### 3.4 Imperative `commit(update)`：保留

第一次 focused mutation 取樣為綠：detail queued commands 10/10、三條 lifecycle focus
15/15。但完整 mock 在 decision sheet 原始 identity oracle 紅：

```text
$ npm run test:mock
✘ [desktop-chromium] tests/map-and-bootstrap-smoke.spec.js:377:1
✘ [mobile-chromium] tests/map-and-bootstrap-smoke.spec.js:377:1

Error: the in-flight refresh must detach the pre-refresh candidate button
Expected: false
Received: true
tests/map-and-bootstrap-smoke.spec.js:427:5

2 failed
4 skipped
296 passed (52.9s)
EXIT_CODE=1
```

byte-identical 還原 `commitSynchronously(update)` 後，同一 oracle desktop＋mobile 各五輪：

```text
10 passed (2.9s)
EXIT_CODE=0
```

第二次完整 mock 298/4 綠。結論保留。

### 3.5 Content render：保留

同步 observer 是 frozen views 在 content factory 返回後立即 query／保存節點並綁 native
handler；多個 factory 也立即檢查 imperative ref。

mutation 紅：

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test \
  tests/discovery-interactions-smoke.spec.js --project=desktop-chromium \
  --grep 'player drawer and card escape every public value'
Received has value: undefined
tests/discovery-interactions-smoke.spec.js:369:69
1 failed
EXIT_CODE=1

$ node --test tests/player-card-sheet-dom.test.js
error: 'PlayerCardSheet content did not mount.'
EXIT_CODE=1
```

還原後 player/content 與完整矩陣綠。結論保留。

### 3.6 Content unmount：移除

`unmount()` 仍先同步將 content slot 從 Map 刪除並呼叫 renderer；正常 close 隨即進入保留的
shell-unmount flush，因此 queued content removal 會在 shell destroy 前一併提交。standalone
content cleanup 沒有返回前 DOM consumer。

mutation／最終驗證：`react-unmount` 原始 close oracle、player-card content unit、sheets-dom、
repeat-each race 與完整 mock/local 全綠。結論移除獨立 flush。

## 4. Lifecycle B 群與全歸零分支

- `tests/react-surface-lifecycle.test.js:94` 標題由錯誤的
  `three approved callers` 改為不含數字的 `approved callers`。
- production caller files 最終仍是原白名單：
  `app/SurfaceHost.tsx`、`sessionStore.ts`，所以 `approvedCallers` 不改。
- `assert.ok(callers.length > 0)` 保留；沒有誤走「全庫歸零」反向禁令分支。
- `SYNC_COMMIT` 頂層 read、`src/syncCommit.ts` 和三個 harness fixture 都保留且零 diff。
- A 群兩條 `commitSynchronously(...)` 字面斷言均仍成立，因 shell/content slot 與
  imperative update 都有真實 retained 呼叫。

```text
$ node --test tests/react-surface-lifecycle.test.js
# tests 6
# pass 6
# fail 0
EXIT_CODE=0
```

## 5. 最終 source scan

```text
$ rg -n '\bsyncCommit\(' src tests/fixtures
tests/fixtures/nearbyDrawerAppHarness.tsx:128:  syncCommit(() => {
tests/fixtures/mySessionsAppHarness.tsx:215:    syncCommit(() => {
tests/fixtures/meAppHarness.tsx:171:    syncCommit(() => {
src/syncCommit.ts:8:export function syncCommit(update: () => void): void {
src/sessionStore.ts:102:            syncCommit(listener);
src/app/SurfaceHost.tsx:251:  syncCommit(update);
```

SurfaceHost 內部六點最終：

```text
268 commitSynchronously(commitSurfaceSlots)  # 保留 shell mount
279 commitSurfaceSlots()                      # 移除 failure-cleanup flush
291 commitSynchronously(commitSurfaceSlots)  # 保留 shell unmount
305 commitSynchronously(update)               # 保留 imperative update
311 commitSynchronously(commitSurfaceSlots)  # 保留 content render
319 commitSurfaceSlots()                      # 移除 content-unmount flush
```

production caller files 仍為 2；SurfaceHost 同步呼叫點 6→4。

## 6. Race／focus 原始矩陣與取樣

最終 A 還原、B 兩點移除狀態：

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test \
  tests/react-page-focus.spec.js tests/react-unmount.spec.js tests/performance.spec.js \
  --project=desktop-chromium --repeat-each=3
3 skipped
63 passed (47.6s)
EXIT_CODE=0
```

四頁 DOM＋sheets＋PlayerCard focused aggregate：

```text
# tests 33
# pass 33
# fail 0
EXIT_CODE=0
```

完整 mock 與 local 見 §10。

## 7. Bundle 與 importer 對帳

### 7.1 Production bundle

| 指標          | 4C-3 基準 | 批 5 最終 |  淨值 |    上限 |    最終餘裕 |
| ------------- | --------: | --------: | ----: | ------: | ----------: |
| main raw      |   638,943 |   638,939 |  -4 B | 658,867 |    19,928 B |
| main gzip     |   187,462 |   187,470 |  +8 B | 192,420 |     4,950 B |
| total JS raw  |   841,567 |   841,563 |  -4 B | 849,961 |     8,398 B |
| total JS gzip |   257,597 |   257,634 | +37 B | 259,062 | **1,428 B** |

逐字 gate：

```text
production bundle check passed: development E2E hook present, production E2E hook absent;
32 files, 12 demo identifiers absent; main 638939/187470 within 658867/192420;
largest app lazy MySessionsPage-DhtT1sNf.js 16476/4829 within 18000/5500;
total JS 841563/257634 within 849961/259062;
private repository: privateDataRepository-DrYLuo9-.js;
Sentry: sentryBrowserSdk-Czz5dmkg.js
EXIT_CODE=0
```

沒有放寬 gate或新增 dependency。total gzip 仍只餘 1,428 B。

### 7.2 `window.__importAppModule`

```text
$ rg -o 'window\.__importAppModule' tests | wc -l
110
baseline=110
delta=0
```

## 8. 凍結面自證

以下檔案／目錄 `git diff --exit-code` 為 0、無輸出：

```text
tests/react-page-focus.spec.js
tests/react-unmount.spec.js
tests/performance.spec.js
tests/session-lifecycle-smoke.spec.js
tests/map-and-bootstrap-smoke.spec.js
tests/discovery-interactions-smoke.spec.js
tests/chat-settings-filters-smoke.spec.js
tests/auth-forms-smoke.spec.js
tests/account-settings-smoke.spec.js
src/views
src/sheets
src/sessionViews.js
src/sheets.js
```

另有：

- `src/sessionStore.ts` byte-identical 回 accepted hash。
- `src/syncCommit.ts`、三個 harness fixtures 零 diff。
- `mountSurfaceContent` handle shape、E/A/C/D/F 群未改；只修改 B 群標題髒點。
- views、14 sheets、public facade、data boundary、UI／文案／CSS皆未改。

## 9. Codex 五問

### 1. 兩個 caller 是否都以 production consumer，而不是自述理由完成審計？

是。A 由 same-stack drawer focus race 3/3 紅證明；B 四個 retained 點分別由 shell
mount、close DOM、decision identity、view binding／mount fail-closed 原始 oracle 打紅。
理由書逐項列出 consumer 行號與缺少的 handshake。

### 2. 哪些 flush 真正退役？為什麼可以？

SurfaceHost 的 mount-failure cleanup 與 content-unmount 獨立 flush 退役。前者在 throw 前
沒有 observer；後者的 slot delete 仍先排程，且正常 close 馬上由 retained shell flush
提交。原始 unmount、close、race、mock、local 全綠。

### 3. 為何 caller A 和 `commit(update)` 的 focused green 不足以批准移除？

因為 shared boundary 的 consumer 不只點名測試。A 的 focus 專檔被 harness flush 與 retry
遮蔽，真正 consumer 在 performance same-stack race；`commit(update)` 的 detail tests 沒覆蓋
decision-sheet button identity，完整 mock 才找到。兩次都以原始、不改寫的 oracle裁定。

### 4. 為何沒有刪 `syncCommit.ts` 或 fixture caller？

production caller files 沒歸零，不能進全歸零分支。刪 helper 或 fixture 不只越權，也會破壞
已證明載重的 A／B boundary 和 harness 同步 render 語意。lifecycle 的 non-empty fail-closed
設計因此正確保留。

### 5. 對批 6 TS 化＋拆檔的建議

`sheets.js` 建議順序：

1. 先把 `configureSurface*` registry、restore descriptor、mount options／handle／close options
   抽成無 runtime side effect 的 TypeScript contract leaf；避免 TS 化時把
   `SurfaceHost.tsx ↔ sheets` bridge 變成 runtime circular import。
2. 接著機械式將 `sheets.js` facade 轉 `sheets.ts`，保持 exports、public signatures、WeakMap、
   close／replace／restore 次序與 `openLoginModal` 行為；同步更新所有明寫 `.js` importer 和
   appRuntime 副檔名映射。此步不拆 ownership、不改 bundle topology。
3. 型別全綠後才按穩定責任拆：surface runtime state／bridge 編排與 auth login facade 分開。
   每次只拆一條 dependency edge，重跑 byte DOM、lifecycle、frozen E2E 與 bundle；不要為行數
   同時改 async contract。
4. 本批 retained 同步邊界先留在 SurfaceHost；批 6 若要改 facade async shape，另立明確
   migration 批並先提供 committed-generation／mount-ready／close-complete handshake。

批 6 開工前還要先處理 Q3 文件點名的兩處零餘裕下限：

- `content-visibility-contract.test.js:57` 的 CSS source `>=13`，現值恰 13。應改成可證明
  scan completeness 的目錄／manifest 對帳，並以漏掃一個已知 CSS 的 canary 證明會紅，
  避免合法合併 CSS 時被數字卡住。
- `legacy-style-scan.test.js:43` 的每檔 `>100 bytes` 會阻擋合理的小型 TypeScript contract
  leaf。應改驗「可讀、非空、在遞迴掃描／預期目錄中」，並以空檔／漏掃目錄 canary 保持
  fail-closed；先核准這個前置小批，不能在 TS 拆檔時順手弱化。

## 10. 收尾標準矩陣

### Typecheck／lint／Prettier／diff

```text
$ npm run typecheck
> tsc --noEmit
EXIT_CODE=0

$ npm run lint
> eslint ...
EXIT_CODE=0

$ npm run prettier:check
Checking formatting...
All matched files use Prettier code style!
EXIT_CODE=0

$ git diff --check
(no output)
EXIT_CODE=0
```

### Build／bundle

```text
$ npm run build
vite v6.4.3 building for production...
✓ 508 modules transformed.
dist/assets/index-CHyqLqM4.js  638.94 kB │ gzip: 187.47 kB
✓ built in 1.18s
EXIT_CODE=0

$ npm run check:production-bundle
production bundle check passed ...
EXIT_CODE=0
```

### Unit／mock

```text
$ npm run test:session-unit
# tests 346
# pass 346
# fail 0
# skipped 0
# duration_ms 3538.127167
EXIT_CODE=0

$ npm run test:mock
# unit phase: tests 346 / pass 346 / fail 0

4 skipped
298 passed (53.0s)
EXIT_CODE=0
```

第一次完整 mock 是有效 mutation 紅證據，不是 flake；還原後才取得上述第二次完整綠燈，
沒有豁免。

### Local

未撞資料污染，也未撞已知 presence timeout；沒有 reset／重跑豁免。

```text
$ npm run test:local
# local API
# tests 2
# pass 2
# fail 0

# Supabase Chromium
11 skipped
45 passed (1.4m)
EXIT_CODE=0
```

## 11. 最終 hashes、未做與 BLOCKED

```text
a0547f0b59273c293abc1cd12b49e3cce08c944a51110bc484111d99187b8f82  src/app/SurfaceHost.tsx
3894d60f37e49f5d9934477ad5d7d1fcf8dc7b83302e24e140e4cc78a8d39d62  src/sessionStore.ts
c052ca73a8a71ad1a190dda665370c9d9bd4ad8f3c7a8282e42ebf45cf9df2cb  src/syncCommit.ts
7efd82ccb5fd6a1d00dbc25f72cde403c87d3b803019de434dee387383774e97  tests/react-surface-lifecycle.test.js
```

- 未做：批 6 TS 化／拆檔、新依賴、UX／文案／CSS、bundle gate 調整、同步 facade
  contract 重設。
- 疑義：無。兩個 caller 的殘留都有「移除即紅」原始證據；不是 BLOCKED 例外。
- BLOCKED：無。
- Git：未 commit、未 push；working tree 留給驗收方。
