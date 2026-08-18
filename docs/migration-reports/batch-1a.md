# 批 1a 回報：統一 async 動作 helper（sessionViews 三胞胎收斂）

## 1. 結論

完成。`src/sessionViews.js` 現在只有一個 async 生命週期實作 `runAsyncAction`；原本的
`runMySessionAction`、`runNotificationSettingAction`、`runPresenceSettingAction` 已成為保留各自語意的薄包裝，另有 10 個手寫 async 動作接入同一 helper。

行為凍結結果：未改 controller、dataApi、CSS、DOM 結構、class、testid 或文案；`form-error` 字面數前後皆為 17。My Sessions withdraw 已移除事件委派中的自走 Promise 分支，改走 `runMySessionAction` 主路徑，但仍維持「同一 event turn 開確認 dialog、不把背景 withdraw 鈕掛入 pending、不 disable、不搶回 dialog 焦點」的既有確認流程。

四個指定 gate 全綠；未重建 local 測試庫；未 commit、未 push。

## 2. helper 介面設計

`src/sessionViews.js:1281–1357` 的 `runAsyncAction(options)` 介面分成六組：

- 執行範圍：`root`、`callback`、`current()`。`current()` 讓 My Sessions 的 account/profile epoch 在 stale promise 回來時直接失效。
- 控制項：`controls` 只記錄動作前原本可用者並統一 disable；`resolveControls()` 可在 finally 依語意重新找到目前控制項；`canRestoreControls()` 可保留 terminal/成功態；`restoreAfterRerender` 只供 My Sessions 已有 pending 契約的明確例外。
- 重繪偵測：`watchNodes` 加上原本可用控制項形成監看集合；`rerendered()` 只透過 helper 內唯一的 `belongsToRoot()` 判斷舊節點是否已離開 root。一般路徑一旦重繪，就不執行舊 DOM 的成功/錯誤/finally UI hook，也不解鎖新 markup。
- 錯誤 slot：`error`、`clearError`、`clearErrorText`、`errorMessage`、`errorFocus` 統一清理與 fallback 渲染；特殊錯誤政策用 `onError`。
- 生命週期 hook：`onSuccess`、`onError`、`onFinally`，另有三個顯式 `*AfterRerender` 開關。預設全部尊重新 markup 權威。
- 焦點掛點：`focus.capture(active)` 在動作前取得語意 intent，`focus.shouldRestore(context)` 與 `focus.restore(intent, context)` 在控制項還原後執行。notification/presence 因此不再各自手寫 root membership 與 finally。

helper 的 callback 會在呼叫 helper 的同一 event turn 被求值，之後才於 `await` 暫停；因此 withdraw 的同步 dialog 開啟時序沒有變。helper 自己攔截 rejected promise，使用 `void runAsyncAction(...)` 的 click 路徑不會產生 unhandled rejection。

## 3. 變更清單（最終行號）

### `src/sessionViews.js`

- `1281–1357`：新增唯一 async runner；集中 disable/clear/try-catch-finally/rerender/focus。
- `1359–1392`：`runMySessionAction` 改為薄包裝；保留 descriptor、pending scope、跨重繪語意按鈕解析與 lifecycle focus。withdraw 透過 `opensConfirmation` 保留既有不鎖背景鈕／不 pending／不搶焦點語意。
- `1441–1471`：success push prompt 接入 helper。
- `1527–1561`：notification wrapper 接入 helper，以 descriptor 重找同一通知控制項。
- `1574–1605`：presence wrapper 接入 helper，以 selector 重找同一在線控制項。
- `1840–1882` 附近：`[data-my-action]` 委派不再有 withdraw 自走 Promise 分支；所有 action 統一呼叫 `runMySessionAction`。
- `2342–2367`：chat composer send/input 雙控制項接入 helper。
- `2883–2910`：詳情頁「複製連結」與「檢舉」接入 helper。
- `3034–3053`：退出確認 dialog 接入 helper。
- `3084–3116`：檢舉表單接入 helper。
- `3352–3381`：個人檔案儲存接入 helper。
- `3994–4019`：建立球局接入 helper。
- `4078–4107`：候選球場定案（整組按鈕）接入 helper。
- `4221–4241`：編輯球局接入 helper。
- `4678–4705`：球友邀請接入 helper。

### `tests/session-data-boundary.test.js`

- `182`：從既有跨樹 sources 分出 `publicSources`。
- `219`：新增「`public/` 樹 `line_id` 出現次數必須為 0」斷言；既有斷言未修改。

### `docs/migration-reports/batch-1a.md`

- 本回報；新增檔。

## 4. grep 前後對照

### 三胞胎與 helper 接點

改前：

```text
1276:function runMySessionAction(button, callback, root) {
1440:async function runNotificationSettingAction(root, callback) {
1503:async function runPresenceSettingAction(root, callback) {
```

改後：

```text
1281:async function runAsyncAction({
1359:function runMySessionAction(button, callback, root) {
1367:  void runAsyncAction({
1443:    void runAsyncAction({
1527:async function runNotificationSettingAction(root, callback) {
1531:  return runAsyncAction({
1574:async function runPresenceSettingAction(root, callback) {
1578:  return runAsyncAction({
2352:    await runAsyncAction({
2885:      await runAsyncAction({
2897:      await runAsyncAction({
3039:    await runAsyncAction({
3097:    await runAsyncAction({
3366:    await runAsyncAction({
4007:    await runAsyncAction({
4091:    await runAsyncAction({
4231:    await runAsyncAction({
4693:    await runAsyncAction({
```

共 14 個 call site；三胞胎以外另收斂 success push、chat、詳情雙動作、withdraw confirm、檢舉、個人檔案、建立、定案、編輯與邀請。

### `submit.disabled = true`

改前：

```text
3070:    submit.disabled = true;
3343:    submit.disabled = true;
4217:    submit.disabled = true;
4682:    submit.disabled = true;
```

改後：

```text
```

計數：`4 -> 0`；無合法殘留。

### `root.contains`

改前：24 處。逐字清單：

```text
689:  if (!(active instanceof HTMLElement) || !root.contains(active)) return;
1359:      if (!root.contains(prompt)) return;
1377:      if (!root.contains(prompt)) return;
1382:      if (root.contains(button) && !prompt.hidden && !terminalStatus) button.disabled = false;
1446:  const focusedDescriptor = root.contains(active) ? notificationControlDescriptor(active) : null;
1471:    const rerendered = unlockedControls.some((control) => !root.contains(control));
1508:  const focusedSelector = root.contains(active) ? presenceControlSelector(active) : null;
1537:    const rerendered = unlockedControls.some((control) => !root.contains(control));
2254:      if (requestId !== scrollRequestId || !mounted.root.contains(feed)) return;
2325:      if (mounted.root.contains(send) && !archived) {
2858:        if (mounted.root.contains(copyLinkButton)) copyLinkButton.disabled = false;
2872:        if (mounted.root.contains(reportButton)) reportButton.disabled = false;
3015:      if (mounted.root.contains(error)) {
3020:      if (mounted.root.contains(confirmButton)) {
3074:      if (mounted.root.contains(form)) {
3080:      if (mounted.root.contains(error)) {
3085:      if (mounted.root.contains(submit) && !form.hidden) {
3354:      if (mounted.root.contains(submit)) {
4000:      if (mounted.root.contains(publishButton)) publishButton.disabled = false;
4086:      if (!terminalState && mounted.root.contains(button)) {
4225:      if (mounted.root.contains(submit)) {
4685:      if (!mounted.root.contains(submit)) return;
4689:      if (!mounted.root.contains(submit)) return;
4693:      if (mounted.root.contains(submit)) submit.disabled = false;
```

改後：3 處。合法殘留逐一說明：

```text
689:  if (!(active instanceof HTMLElement) || !root.contains(active)) return;
1307:  const belongsToRoot = (node) => root.contains(node);
2291:      if (requestId !== scrollRequestId || !mounted.root.contains(feed)) return;
```

1. `689 rememberFocusedSessionCard`：這是 drawer 重繪「之前」同步擷取目前焦點 intent 的入口 guard，不是 async action，也沒有 disable/error/finally 生命週期；搬入 runner 會錯把 discovery render 變成 action。
2. `1307 runAsyncAction`：唯一保留的 async membership primitive；同時服務 focus capture 與 `rerendered()`，正是本批要求集中之處。
3. `2291 scrollFeedToLatest`：這是雙 `requestAnimationFrame` 捲動排程的 freshness/mount guard，必須和 `scrollRequestId` 在每一 frame 同時檢查；它不是 promise action，套 runner 無法保護第二 frame。

總計 `24 -> 3`；async-action call site 的手寫 `root.contains` 已歸零。

### DOM/error surface 佐證

```text
form-error before=17
form-error after=17
```

本批 diff 沒有修改任何 markup template、class 或 testid。

## 5. helper 有牙：重繪偵測紅綠

canary 前先記錄最終實作 SHA-256，暫時把 helper 內：

```js
const rerendered = () => watchedNodes.some((node) => !belongsToRoot(node));
```

改成：

```js
const rerendered = () => false;
```

既有測試 `a rerender inside a notification action stays authoritative over the disable restore` 轉紅；關鍵輸出逐字：

```text
  ✘  1 [desktop-chromium] › tests/smoke.spec.js:2503:1 › a rerender inside a notification action stays authoritative over the disable restore (5.4s)

  1) [desktop-chromium] › tests/smoke.spec.js:2503:1 › a rerender inside a notification action stays authoritative over the disable restore

    Error: expect(locator).toBeDisabled() failed

    Locator:  getByTestId('enable-push')
    Expected: disabled
    Received: enabled
    Timeout:  5000ms

  1 failed
    [desktop-chromium] › tests/smoke.spec.js:2503:1 › a rerender inside a notification action stays authoritative over the disable restore
```

還原後同一測試轉綠；輸出逐字：

```text
Running 1 test using 1 worker

  ✓  1 [desktop-chromium] › tests/smoke.spec.js:2503:1 › a rerender inside a notification action stays authoritative over the disable restore (214ms)

  1 passed (1.0s)
```

SHA-256 對照：

```text
src/sessionViews.js
before 2a19849f8154963b02758db8f77db8794bd8d0f3886a1bb39589bdda7b382b2a
after  2a19849f8154963b02758db8f77db8794bd8d0f3886a1bb39589bdda7b382b2a
```

因此移除 helper 的重繪偵測會實際重現「新 markup disabled 被強制解鎖」事故，不是只測實作字面。

## 6. rider 有牙：`public/` line_id 紅綠

在 `public/push-sw.js` 暫加可執行 token `self.line_id = null;` 後，boundary 測試轉紅；關鍵輸出逐字：

```text
# Subtest: frontend source scan allows only the frozen LINE RPC parameter
not ok 2 - frontend source scan allows only the frozen LINE RPC parameter
  failureType: 'testCodeFailure'
  error: |-
    public/ must not contain line_id

    1 !== 0
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 1
  operator: 'strictEqual'
1..57
# tests 57
# suites 0
# pass 56
# fail 1
# cancelled 0
# skipped 0
# todo 0
```

還原後同一完整檔轉綠；結尾輸出逐字：

```text
1..57
# tests 57
# suites 0
# pass 57
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 115.664667
```

SHA-256 對照：

```text
public/push-sw.js
before 3393d4ff23c4b4a9db0d2750c2290742394604e8006dc6299e8c02db0e011fbc
after  3393d4ff23c4b4a9db0d2750c2290742394604e8006dc6299e8c02db0e011fbc
```

## 7. targeted 回歸

正式 gate 前另跑兩組 desktop Chromium targeted tests，共 25/25 綠，涵蓋：My Sessions 跨重繪錯誤與 focus、notification 重繪權威、presence 失敗 focus、withdraw 重開與單次送出、report、player invite stale surface、chat、success push、decision、create、profile 與 edit。

## 8. 四個 gate 結尾輸出

### `npm run test:mock`

Node TAP 結尾逐字：

```text
1..246
# tests 246
# suites 0
# pass 246
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1818.670208
```

Playwright 結尾逐字：

```text
  4 skipped
  250 passed (2.1m)
```

### `npm run test:local`

local API TAP 結尾逐字：

```text
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3533.321333
```

Supabase Playwright 結尾逐字：

```text
  11 skipped
  42 passed (1.3m)
```

首次即通過，未執行 `db:reset:test`。

### `npm run build`

```text
vite v6.4.3 building for production...
transforming...
✓ 68 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-BdCZOQfN.js   486.46 kB │ gzip: 131.05 kB
✓ built in 544ms
```

### `git diff --check`

```text
```

完整輸出為空；exit code 0。

## 9. 白名單與 `git diff --stat`

正式 tracked diff：

```text
 src/sessionViews.js                 | 604 ++++++++++++++++++------------------
 tests/session-data-boundary.test.js |   2 +
 2 files changed, 309 insertions(+), 297 deletions(-)
```

`git diff --stat` 不列未追蹤新增檔；另新增 358 行的白名單回報 `docs/migration-reports/batch-1a.md`。最終 `git status --short` 僅有 `M src/sessionViews.js`、`M tests/session-data-boundary.test.js`、`?? docs/migration-reports/batch-1a.md`；`tests/` 除 rider 的 2 行外零 diff，沒有新增測試檔，也沒有修改既有斷言。

## 10. canary 還原總結

- `src/sessionViews.js` helper canary：SHA 前後一致。
- `public/push-sw.js` rider canary：SHA 前後一致，最終不在 diff。
- 其餘 `src/` 未做暫改。
- `public/` 最終零 diff。
- 未 commit、未 push。
