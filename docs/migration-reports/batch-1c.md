# 批 1c 回報：surface registry——active 把手與關閉順序收斂

## 1. 結論與 registry 介面

結論：11 個 surface handle 與 5 個附屬欄位已收斂到單一 registry；11 支 `closeActiveX`、16 個 `let activeXxx`、36 條 runtime 直接 `= null` 清理均歸零。聊天、建局入口、球友層、decision/edit 與 `setAuthState` 的跨面操作改由 `SURFACE_TRANSITIONS` 宣告順序。既有 controller 方法、注入 callback、surface 鴨子型別、關閉順序、`close(options)`、reconcile、toast／錯誤文案均未改動。

基準為 `HEAD ae36a69668c5cea0613663bc60c968cbc4f9fd4f`。

### `createSurfaceRegistry(definitions)`

位置：`src/sessionController.js:314–384`。

- `get(name)`／`set(name, handle, metadata)`：統一讀寫 surface handle；`set` 只更新明確提供的 metadata，保留 join resume 在 mount 前先擷取 `confirmingAuth` 的既有時序。
- `is(name, expected)`：供 callback 與 async guard 判斷 handle 是否仍為目前 surface。
- `meta(name, key)`／`update(name, metadata)`：集中讀寫 detail、profile prompt、player card 的附屬狀態。
- `release(name, expected?)`：唯一不呼叫 surface `close` 的釋放路徑；只有 expected handle 仍 active 才會原子清除 handle、該 surface 宣告的全部 metadata，並執行 `onRelease` teardown。
- `close(name, options, expected?)`：先走同一 `release`，再以鴨子型別呼叫 `close(options)`；除原本無預設值的 court drawer 保留 `undefined` 外，其餘未傳 options 時仍透傳 `{}`。chat 透過 definition 把 close 送到 `context.sheet`，並在 release 時 invalidate request gate、停止 poller。
- `transition(operations, options)`：按陣列順序執行 `close`／`release`，支援逐項固定 options、呼叫端共用 options 與條件式項目。

11 個定義位於 `src/sessionController.js:464–481`：`chat`、`courtDrawer`、`createSession`、`decisionSession`、`detail`、`editSession`、`playerCard`、`playerDirectory`、`playerDrawer`、`profilePrompt`、`reportDialog`。附屬欄位由定義宣告：detail 的 `session/actionKey/confirmingAuth`、player card 的 `gate`、profile prompt 的 `intent`。

### 宣告式跨面轉場

位置：`src/sessionController.js:484–526`；唯一執行入口 `transitionSurfaces()` 位於 529–531。

重要順序逐字保留：

```text
authIdentityChanged: createSession → decisionSession → editSession → profilePrompt → reportDialog → chat → detail
openChat:            chat → decisionSession → editSession → detail
openDecision:        decisionSession → editSession → release(detail)
openEdit:            editSession → decisionSession → release(detail)
openPlayerDirectory: playerDrawer → playerCard → playerDirectory
```

其餘組合（player layer/directory 清除、open court、open detail、open player、open player court、建局入口與各 auth gate 分支）也在同一表中；原本只忘記舊 handle、不可提前觸發 DOM close 的 hand-off 仍明確使用 `release`。

## 2. 變更清單（最終檔案行號）

- `src/sessionController.js:314–384`：新增 controller-local surface registry 原語。
- `src/sessionController.js:464–531`：以 11 個 surface definition 取代 16 個 active 變數，新增宣告式轉場表及單一執行入口。
- `src/sessionController.js:856–882、953–970`：player layer／directory 清理與 directory 開啟改走 registry／轉場表。
- `src/sessionController.js:997–1214`：court/detail handle、detail metadata 與 callback 清理改走 registry。
- `src/sessionController.js:1254–1410`：chat handle、poller teardown、跨面開 chat 改走 registry。
- `src/sessionController.js:1416–1508`：court/player/card/drawer 的 handle、gate metadata 與建局入口改走 registry／轉場表。
- `src/sessionController.js:1517–1618`：detail reconcile、profile prompt、join confirming metadata 改走 registry。
- `src/sessionController.js:1689–1790`：detail lifecycle close 與 current-handle 判斷改走 registry。
- `src/sessionController.js:1926–1997`：decision/edit 的關閉順序與 detail hand-off 改走 `openDecision`／`openEdit` 表項。
- `src/sessionController.js:2045–2148`：report/create handle 的 onClose、complete close 與存取改走 registry。
- `src/sessionController.js:2320–2364`：`setAuthState` 關面段改查 `authIdentityChanged/authNtrpLost/authNicknameLost/authProfileResolved` 表項；gate diff、epoch、reload 續行未動。
- `docs/migration-reports/batch-1c.md`：本回報。
- `tests/`：零修改、零新增。

## 3. grep 前後對照

同一組命令分別讀取 `git show HEAD:src/sessionController.js` 與工作樹：

```text
項目                                                       HEAD   最終
^\s*function closeActive[A-Z]                                11      0
^\s*let active[A-Z]                                          16      0
^\s*active[A-Z][A-Za-z]+\s*=\s*null; runtime statements      36      0
closeActive[A-Z] 全檔 matching lines                          58      0
setAuthState 關面段 closeActive(...) 實際呼叫                  10      0
openSessionDecision/Edit 的 activeDetail* 直接 null statements  6      0
```

11 支 HEAD close helper 清單：

```text
731  function closeActivePlayerDrawer(options = {}) {
737  function closeActivePlayerCard(options = {}) {
744  function closeActivePlayerDirectory(options = {}) {
1156 function closeActiveChat(options = {}) {
1429 function closeActiveDetail(detail = activeDetail, options = {}) {
1475 function closeActiveCourtDrawer(options) {
1481 function closeActiveCreateSession(options = {}) {
1487 function closeActiveDecisionSession(options = {}) {
1493 function closeActiveEditSession(options = {}) {
1499 function closeActiveProfilePrompt(options = {}) {
1506 function closeActiveReportDialog(options = {}) {
```

最終 `closeActive[A-Z]` 清單為空。runtime 直接 null 清理也由 36 條降為 0；初始化 null 現由 registry entry 建立，釋放只存在 `release()` 一條路徑，無殘留理由。

`setAuthState` 關面段由 HEAD `2317–2336` 的 20 行、10 個直接 close 呼叫，改為最終 `2347–2364` 的 18 行、4 個具名 transition 查表；關面表本身集中在 484–490。這裡只有 dispatch 改寫，之前與之後的 gate diff／epoch／reload 邏輯保持原樣。

HEAD decision/edit 的不一致點：

```text
1896 activeDetail = null;
1897 activeDetailSession = null;
1898 activeDetailActionKey = null;
1942 activeDetail = null;
1943 activeDetailSession = null;
1944 activeDetailActionKey = null;
```

最終以上六條為 0；兩處分別在 `src/sessionController.js:1933、1974` dispatch 到表內的 `release(detail)`。

## 4. detail 欄位清理統一與行為差異分析

HEAD 有兩種 detail 清理：

- `closeActiveDetail` 清 `activeDetail`、`activeDetailSession`、`activeDetailActionKey`、`activeDetailConfirmingAuth` 四項，然後呼叫 `detail.close(options)`。
- `openSessionDecision`／`openSessionEdit` 為共用 sheet root 的 hand-off，僅直接清前三項，不清 `activeDetailConfirmingAuth`，也刻意不呼叫舊 detail 的 `.close()`。

最終 registry 在 detail definition 宣告全部三個 metadata；decision/edit 以 `release(detail)` 原子清 handle 與 `session/actionKey/confirmingAuth`，但仍不呼叫 `.close()`。因此 mounted UI 的 root 交接、close callback 次數、options 與 focus restore 都與 HEAD 一致；正常使用者操作沒有可觀察差異。

唯一可觀察邊界是外部測試或程式若私下保留已被 decision/edit 取代的舊 detail `onConfirmJoin` callback，並在它已不在 UI 後仍直接呼叫：HEAD 遺留的 `activeDetailConfirmingAuth` 可能讓該 callback 通過 auth snapshot、進一步呼叫 join RPC；最終會因 `confirmingAuth === null` 在 RPC 前回報既有的「登入狀態已變更，請重新開啟球局。」而停止。這是讓 stale、不可由正常 UI 點擊的 handler 失效，不改變仍 active surface 的行為。

## 5. registry 有牙：setAuthState 關面表 canary

未修改測試。canary 前先記錄 SHA-256，暫時從 `authIdentityChanged` 陣列移除 `createSession`，執行：

`node --test --test-name-pattern='an account switch closes account-bound create and profile forms before they can be reused' tests/session-controller.test.js`

紅色輸出逐字（exit code 1）：

```text
TAP version 13
# Subtest: an account switch closes account-bound create and profile forms before they can be reused
not ok 1 - an account switch closes account-bound create and profile forms before they can be reused
  ---
  duration_ms: 3.864875
  type: 'test'
  location: '/Users/ian/tennisPartnerFinder/tests/session-controller.test.js:2305:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    
    0 !== 1
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 1
  actual: 0
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/ian/tennisPartnerFinder/tests/session-controller.test.js:2321:10)
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
# duration_ms 53.871792
```

還原 `createSession` 後，同一命令綠色輸出逐字（exit code 0）：

```text
TAP version 13
# Subtest: an account switch closes account-bound create and profile forms before they can be reused
ok 1 - an account switch closes account-bound create and profile forms before they can be reused
  ---
  duration_ms: 4.244333
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
# duration_ms 52.928125
```

## 6. canary SHA-256 還原對照

```text
                              canary 前                                                         還原後
src/sessionController.js  a3a304841fabd774b7cef6b120573cbde0832978e22d58c57c4cf4ce6b826cd1  a3a304841fabd774b7cef6b120573cbde0832978e22d58c57c4cf4ce6b826cd1
```

SHA 完全一致，src 暫改已全數還原。

## 7. 測試與四個最終 gate

獨立 controller 驗證 `node --test tests/session-controller.test.js` 為 113/113；完整 `npm run test:session-unit` 為 246/246。以下四項均在 canary 還原後的 production source 執行。

### `npm run test:mock`

結尾輸出逐字（exit code 0）：

```text
  ✓  246 [mobile-chromium] › tests/smoke.spec.js:5082:1 › the profile sheet still offers all four practice types (127ms)
  ✓  247 [mobile-chromium] › tests/smoke.spec.js:5102:1 › the type filter offers three chips and no longer lists 對拉 (153ms)
  ✓  248 [mobile-chromium] › tests/smoke.spec.js:5115:1 › subscribing to every Taipei court collapses the picker and reopens on demand (194ms)
  ✓  249 [mobile-chromium] › tests/smoke.spec.js:5160:1 › an unloaded court catalogue shows no subscription count (126ms)
  ✓  250 [mobile-chromium] › tests/smoke.spec.js:5183:1 › openFilterSheet mounts a dialog with six data-filter groups and closes on Escape (141ms)
  ✓  251 [mobile-chromium] › tests/smoke.spec.js:5220:1 › the filter sheet applies a district change immediately to the background drawer summary and keeps keyboard focus off body (138ms)
  ✓  252 [mobile-chromium] › tests/smoke.spec.js:5286:1 › closing and reopening the filter sheet three times does not stack delegated listeners on the shared sheet root (981ms)
  ✓  253 [mobile-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.4s)
  ✓  254 [mobile-chromium] › tests/smoke.spec.js:5359:1 › the filter sheet traps Tab focus between its own first and last controls (185ms)

  4 skipped
  250 passed (2.2m)
```

### `npm run test:local`

測試庫現況可直接通過，未執行 `db:reset:test`。結尾輸出逐字（exit code 0）：

```text
  ✓  41 [supabase-chromium] › tests/session.spec.js:1535:1 › a session deep link survives the auth restore that lands after the sheet opened (2.1s)
  ✓  42 [supabase-chromium] › tests/session.spec.js:1566:1 › accepted members exchange escaped chat, manage blocks, and retain archived read-only history (3.0s)
  ✓  43 [supabase-chromium] › tests/session.spec.js:1689:1 › a new chat message raises the recipient's unread badge and nav dot, and opening chat clears both against the real database (1.4s)
  ✓  44 [supabase-chromium] › tests/session.spec.js:1764:1 › blocking a sender drops their messages from both the unread count and the visible chat feed, keeping the two in lockstep (425ms)
  ✓  45 [supabase-chromium] › tests/session.spec.js:1837:1 › the Me profile entry edits without a gate and refreshes the identity card in place (479ms)
  ✓  46 [supabase-chromium] › tests/session.spec.js:1877:1 › every Me control keeps focus through a background rerender (11.3s)
  ✓  47 [supabase-chromium] › tests/session.spec.js:1955:1 › the discovery empty-state subscribe shortcut opens Me and focuses the notification settings heading on real auth (1.1s)
  ✓  48 [supabase-chromium] › tests/session.spec.js:1987:1 › checking the last court collapses the picker without dropping focus to body (476ms)
  ✓  49 [supabase-chromium] › tests/session.spec.js:2036:1 › neutral counts stay hidden at zero and appear on all three surfaces once a session is played (2.4s)
  ✓  50 [supabase-chromium] › tests/session.spec.js:2156:1 › a brand-new account is subscribed to every active Taipei court when it first saves a profile (677ms)
  ✓  51 [supabase-chromium] › tests/session.spec.js:2180:1 › N1 an existing zero-subscription account is never seeded by a later profile save (604ms)
  ✓  52 [supabase-chromium] › tests/session.spec.js:2199:1 › N2 an account that explicitly cleared every court stays at zero across later profile saves (1.1s)
  ✓  53 [supabase-chromium] › tests/session.spec.js:2226:1 › N3 a failing subscription seed never fails the profile save (579ms)

  11 skipped
  42 passed (1.4m)
```

同一命令前段 local API 測試亦通過；整體 exit code 0。

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
dist/assets/index-DqQL1VJk.js   489.66 kB │ gzip: 132.12 kB
✓ built in 567ms
```

### `git diff --check`

完整輸出逐字（exit code 0）：

```text
```

## 8. diff、白名單與 tests 稽核

`git diff --stat`（tracked 檔；未追蹤的本回報不會列入）：

```text
 src/sessionController.js | 492 +++++++++++++++++++++++++----------------------
 1 file changed, 260 insertions(+), 232 deletions(-)
```

本回報的 no-index stat：

```text
 /dev/null => docs/migration-reports/batch-1c.md | 283 ++++++++++++++++++++++++
 1 file changed, 283 insertions(+)
```

最終 `git status --short` 只允許／預期出現：

```text
 M src/sessionController.js
?? docs/migration-reports/batch-1c.md
```

`git diff -- tests`、`git status --short -- tests` 完整輸出皆為空；既有 tests 零修改，也未新增測試。白名單外零改動；未 commit、未 push。
