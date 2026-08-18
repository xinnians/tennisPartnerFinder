# 批 1b 回報：request guard 與前景輪詢統一

## 1. 結論與原語介面

結論：controller 的 7 個 `latest*Request` counter 與 32 個含 `requestId` 的匹配行已歸零；main 的 9 個 `const epoch = authStateEpoch` 樣板已歸零；chat／discovery 的兩個手寫 `setInterval` 已收斂成共用 poller 內唯一一個 `setInterval`。既有 controller 方法、注入 callback、surface 鴨子型別、toast／錯誤文案、interval 值與 visibility 語意均未改動。

### `createRequestGate()`

位置：`src/requestGate.js:1–21`。

- `issue(isCurrent?)`：先推進 generation，再回傳本次 token；同一 gate 後發的 request 會讓先發 token 過期。
- `capture(isCurrent?)`：不推進 generation，只擷取目前 generation；用於 main auth epoch 薄變體及 openPlayer 卡片生命週期，彼此不互相取消。
- `invalidate()`：不發 request，只讓既有 token 全數過期；用於 player layer／directory 清除、chat close、帳號切換。
- token surface 只有 `isStale()`；它一次合併「是否仍為最新 generation」與呼叫端注入的 auth、profile、surface、bounds/context 等活性 predicate。

這個 `issue`／`capture` 分流保留兩種原本不同的語意：controller 的同類讀取是 latest-wins；main 的多個通知／presence 請求只在 auth epoch 改變時一起失效，不會因另一個同 epoch 請求開始而互相取消。

### `createForegroundPoller()`

位置：`src/requestGate.js:23–55`。

- 輸入：`intervalMs`、`visibilityTarget`、`isActive`、`onInterval`、`onVisible`。
- interval 僅在 `visibilityState !== "hidden"` 且 `isActive()` 時執行，並保留 Node timer `unref()`。
- `visibilitychange` 僅在狀態明確為 `visible` 且活性成立時執行。
- `stop()` 冪等移除 listener、清除 interval，chat close 由此完成原有 teardown。
- chat 保留 interval 的 quiet refresh 與回前景的 non-quiet refresh；discovery 兩種 trigger 都走 quiet refresh。

## 2. 變更清單（最終檔案行號）

- `src/requestGate.js:1–55`：新增唯一共用模組，包含 request gate 與 foreground poller。
- `src/sessionController.js:9、376–384`：引入原語，以 9 個 controller-scoped 具名 gate（含 join preview 與 openPlayer guard）取代散裝 counter；chat 的 per-context gate 另於 1306 建立。
- `src/sessionController.js:476–489、543–559、581–596、697–720`：join preview、roster、blocked-player、participation 改成 token `isStale()`。
- `src/sessionController.js:750–878`：player layer／directory 的 invalidate、latest-wins 與 auth/profile/surface predicate 收斂。
- `src/sessionController.js:891–951`：normal／quiet discovery 共用 `discoveryGate`；polling 活性集中為 `discoveryPollIsActive()`。
- `src/sessionController.js:1148–1210、1282–1322`：chat context 改持有 request gate 與 foreground poller；close 走 `invalidate()`＋`stop()`。
- `src/sessionController.js:1345–1403`：openPlayer 的五條件 guard 定義一次，三個判定點只呼叫 `request.isStale()`。
- `src/sessionController.js:2226–2266、2342、2370–2376`：geolocation callback、blocked-player 帳號切換 invalidation、discovery poller 接線。
- `src/main.js:99、118、824–830`：main 引入同一 gate，`captureAuthRequest()` 作為 auth/identity 薄變體。
- `src/main.js:265–310、835–955`：presence 與 notification 的 8 組 async 路徑改用 token。
- `src/main.js:1314–1324、1350–1412`：profile load 與 initial-session restore 改用 token；`applyAuthCandidate()` 以 `invalidate()` 取代 `authStateEpoch` increment。
- `docs/migration-reports/batch-1b.md`：本回報。
- `tests/`：零修改、零新增。

## 3. grep 前後對照

基準為 `HEAD fd465c5504b6c33b7d1a167dd07d2b05477b4f8e`；`requestId` 的派工數字 32 是 matching-line 數，若按 lexical token 計是 38，兩種算法最終都為 0。

```text
項目                                               HEAD   最終
sessionController: let latest[A-Za-z]*Request = 0     7      0
sessionController: requestId matching lines           32      0
sessionController: requestId lexical tokens            38      0
main: const epoch = authStateEpoch                       9      0
sessionController: setInterval calls                     2      0
requestGate shared poller: setInterval calls             0      1
openPlayer: activePlayerCard !== card anchors             3      0
```

HEAD counter 清單逐字：

```text
   375  let latestRequest = 0;
   376  let latestParticipationRequest = 0;
   377  let latestRosterRequest = 0;
   379  let latestLocationRequest = 0;
   380  let latestPlayerRequest = 0;
   381  let latestPlayerDirectoryRequest = 0;
   382  let latestBlockedPlayerRequest = 0;
```

HEAD main epoch 樣板清單逐字：

```text
   267          const epoch = authStateEpoch;
   281    const epoch = authStateEpoch;
   301    const epoch = authStateEpoch;
   836    const epoch = authStateEpoch;
   864    const epoch = authStateEpoch;
   883    const epoch = authStateEpoch;
   915    const epoch = authStateEpoch;
   934    const epoch = authStateEpoch;
  1318    const epoch = authStateEpoch;
```

`setInterval` 呼叫點：

```text
HEAD src/sessionController.js:1346  context.pollTimer = setInterval(() => {
HEAD src/sessionController.js:2413  const discoveryPollTimer = setInterval(() => {
FINAL src/requestGate.js:40          timer = setInterval(() => {
FINAL src/sessionController.js:1314 context.poller = createForegroundPoller({
FINAL src/sessionController.js:2370 createForegroundPoller({
```

openPlayer 三連抄：HEAD 的 `activePlayerCard !== card` 在 1413、1424、1435；最終為 0。五條件 predicate 現在只定義於 `src/sessionController.js:1356–1363`，三個 await 邊界／前置檢查在 1388、1393、1398 各自只有 `request.isStale()`。

實際 `visibilitychange` 的 add/remove 也只剩共用模組 `src/requestGate.js:38、50`；controller 中殘留的兩個 `visibilitychange` 字樣（1165、1180）均為既有說明註解，不是 listener 呼叫點。

## 4. request gate 有牙：永不過期 canary

暫時把 `src/requestGate.js:7` 改成 `isStale: () => false`，未修改任何測試。執行：

`node --test --test-name-pattern="the newest session detail preview wins when an older session request resolves last" tests/session-controller.test.js`

紅色輸出逐字（exit code 1）：

```text
TAP version 13
# Subtest: the newest session detail preview wins when an older session request resolves last
not ok 1 - the newest session detail preview wins when an older session request resolves last
  ---
  duration_ms: 5.818417
  type: 'test'
  location: '/Users/ian/tennisPartnerFinder/tests/session-controller.test.js:203:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      [
        {
          participants: [],
          status: 'loading'
        },
    +   {
    +     participants: [
    +       {
    +         avatarUrl: '',
    +         nickname: '第一局主揪',
    +         ntrp: 3.5,
    +         role: 'host',
    +         sessionId: 41
    +       }
    +     ],
    +     status: 'ready'
    +   }
      ]
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    0:
      participants:
      status: 'loading'
  actual:
    0:
      participants:
      status: 'loading'
    1:
      participants:
        0:
          avatarUrl: ''
          nickname: '第一局主揪'
          ntrp: 3.5
          role: 'host'
          sessionId: 41
      status: 'ready'
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/ian/tennisPartnerFinder/tests/session-controller.test.js:230:10)
    async Test.run (node:internal/test_runner/test:1054:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
  ...
1..1
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 54.563917
```

還原 production `isStale()` 後，同一命令綠色輸出逐字（exit code 0）：

```text
TAP version 13
# Subtest: the newest session detail preview wins when an older session request resolves last
ok 1 - the newest session detail preview wins when an older session request resolves last
  ---
  duration_ms: 5.101833
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 54.145334
```

## 5. foreground poller 有牙：移除 visibility／活性 canary

暫時把共用 poller 的 `canRun` 改為只檢查 `!stopped`，並移除 interval／visibility handler 的 `visibilityState` 判定；亦即同時拿掉 `isActive()` 與前景條件，未修改任何測試。執行：

`node --test --test-name-pattern="chat polls quietly for the other member's messages while open and stops after close" tests/session-controller.test.js`

紅色輸出逐字（exit code 1）：

```text
TAP version 13
# Subtest: chat polls quietly for the other member's messages while open and stops after close
not ok 1 - chat polls quietly for the other member's messages while open and stops after close
  ---
  duration_ms: 86.65775
  type: 'test'
  location: '/Users/ian/tennisPartnerFinder/tests/session-controller.test.js:3468:1'
  failureType: 'testCodeFailure'
  error: |-
    no reloads while the tab is hidden
    
    15 !== 12
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 12
  actual: 15
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/ian/tennisPartnerFinder/tests/session-controller.test.js:3511:10)
    runNextTicks (node:internal/process/task_queues:64:5)
    process.processTimers (node:internal/timers:518:9)
    async Test.run (node:internal/test_runner/test:1054:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
  ...
1..1
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 138.847708
```

還原 production visibility／活性判定後，同一命令綠色輸出逐字（exit code 0）：

```text
TAP version 13
# Subtest: chat polls quietly for the other member's messages while open and stops after close
ok 1 - chat polls quietly for the other member's messages while open and stops after close
  ---
  duration_ms: 115.484875
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 164.420834
```

## 6. canary SHA-256 還原對照

兩組 canary 前與兩組全部還原後的三個 src SHA-256 完全一致：

```text
                                              canary 前                                                         還原後
src/requestGate.js       fa832e498abb1d6a53017266fad3d8279fabae1b64fc55cbcee2fd5fdaa2d387  fa832e498abb1d6a53017266fad3d8279fabae1b64fc55cbcee2fd5fdaa2d387
src/sessionController.js ac61d9953f97aaec025d77dd18185c426ad2242fc02f5e408aa7ee24313f033b  ac61d9953f97aaec025d77dd18185c426ad2242fc02f5e408aa7ee24313f033b
src/main.js              24839cc13adcb4ce59c90c77326576c6fed4c07d338fbf6d834b0d60c7934b9e  24839cc13adcb4ce59c90c77326576c6fed4c07d338fbf6d834b0d60c7934b9e
```

## 7. 測試與四個最終 gate

獨立 controller 驗證：`node --test tests/session-controller.test.js` 為 113/113；完整 Node unit 集為 246/246。以下四項均在最終 production source（canary 還原後）執行。

### `npm run test:mock`

結尾輸出逐字（exit code 0）：

```text
  ✓  246 [mobile-chromium] › tests/smoke.spec.js:5082:1 › the profile sheet still offers all four practice types (143ms)
  ✓  247 [mobile-chromium] › tests/smoke.spec.js:5102:1 › the type filter offers three chips and no longer lists 對拉 (178ms)
  ✓  248 [mobile-chromium] › tests/smoke.spec.js:5115:1 › subscribing to every Taipei court collapses the picker and reopens on demand (200ms)
  ✓  249 [mobile-chromium] › tests/smoke.spec.js:5160:1 › an unloaded court catalogue shows no subscription count (129ms)
  ✓  250 [mobile-chromium] › tests/smoke.spec.js:5183:1 › openFilterSheet mounts a dialog with six data-filter groups and closes on Escape (145ms)
  ✓  251 [mobile-chromium] › tests/smoke.spec.js:5220:1 › the filter sheet applies a district change immediately to the background drawer summary and keeps keyboard focus off body (145ms)
  ✓  252 [mobile-chromium] › tests/smoke.spec.js:5286:1 › closing and reopening the filter sheet three times does not stack delegated listeners on the shared sheet root (479ms)
  ✓  253 [mobile-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.4s)
  ✓  254 [mobile-chromium] › tests/smoke.spec.js:5359:1 › the filter sheet traps Tab focus between its own first and last controls (209ms)

  4 skipped
  250 passed (2.2m)
```

### `npm run test:local`

測試庫現況可直接通過，未執行 `db:reset:test`。結尾輸出逐字（exit code 0）：

```text
  ✓  41 [supabase-chromium] › tests/session.spec.js:1535:1 › a session deep link survives the auth restore that lands after the sheet opened (2.0s)
  ✓  42 [supabase-chromium] › tests/session.spec.js:1566:1 › accepted members exchange escaped chat, manage blocks, and retain archived read-only history (3.3s)
  ✓  43 [supabase-chromium] › tests/session.spec.js:1689:1 › a new chat message raises the recipient's unread badge and nav dot, and opening chat clears both against the real database (1.5s)
  ✓  44 [supabase-chromium] › tests/session.spec.js:1764:1 › blocking a sender drops their messages from both the unread count and the visible chat feed, keeping the two in lockstep (461ms)
  ✓  45 [supabase-chromium] › tests/session.spec.js:1837:1 › the Me profile entry edits without a gate and refreshes the identity card in place (517ms)
  ✓  46 [supabase-chromium] › tests/session.spec.js:1877:1 › every Me control keeps focus through a background rerender (10.9s)
  ✓  47 [supabase-chromium] › tests/session.spec.js:1955:1 › the discovery empty-state subscribe shortcut opens Me and focuses the notification settings heading on real auth (1.1s)
  ✓  48 [supabase-chromium] › tests/session.spec.js:1987:1 › checking the last court collapses the picker without dropping focus to body (482ms)
  ✓  49 [supabase-chromium] › tests/session.spec.js:2036:1 › neutral counts stay hidden at zero and appear on all three surfaces once a session is played (2.5s)
  ✓  50 [supabase-chromium] › tests/session.spec.js:2156:1 › a brand-new account is subscribed to every active Taipei court when it first saves a profile (637ms)
  ✓  51 [supabase-chromium] › tests/session.spec.js:2180:1 › N1 an existing zero-subscription account is never seeded by a later profile save (571ms)
  ✓  52 [supabase-chromium] › tests/session.spec.js:2199:1 › N2 an account that explicitly cleared every court stays at zero across later profile saves (972ms)
  ✓  53 [supabase-chromium] › tests/session.spec.js:2226:1 › N3 a failing subscription seed never fails the profile save (599ms)

  11 skipped
  42 passed (1.4m)
```

同一命令前段 local API 為 2/2；整體 exit code 0。

### `npm run build`

結尾輸出逐字（exit code 0）：

```text
> tennis-partner-finder@0.1.0 build
> vite build

vite v6.4.3 building for production...
transforming...
✓ 69 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-CedzbFXu.js   486.59 kB │ gzip: 131.27 kB
✓ built in 567ms
```

### `git diff --check`

完整輸出逐字（exit code 0）：

```text
```

## 8. diff、白名單與 tests 稽核

`git diff --stat`（tracked 檔；回報檔與新模組尚未追蹤，因此 Git 不會把它們列入此命令）：

```text
 src/main.js              |  78 ++++++++---------
 src/sessionController.js | 224 +++++++++++++++++++----------------------------
 2 files changed, 127 insertions(+), 175 deletions(-)
```

新模組的 no-index stat：

```text
 /dev/null => src/requestGate.js | 55 +++++++++++++++++++++++++++++++++++++++++
 1 file changed, 55 insertions(+)
```

最終 `git status --short` 只允許／預期出現：

```text
 M src/main.js
 M src/sessionController.js
?? docs/migration-reports/batch-1b.md
?? src/requestGate.js
```

`git diff -- tests` 與 `git status --short -- tests` 完整輸出皆為空；既有 tests 零修改，也未新增測試。未 commit、未 push。
