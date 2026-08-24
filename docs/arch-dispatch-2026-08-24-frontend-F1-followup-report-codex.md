# 批 1 補件執行回報（F1-FU-1〜F1-FU-3）

- 日期：2026-08-24
- 派工單：`docs/arch-dispatch-2026-08-24-frontend-F1-followup.md`
- 原批基準：`0be31a2`
- 補件開工 HEAD：`7112d6d`
- 補件實作 HEAD：`70562a4`
- 分支：`claude/tennis-partner-finder-proto-xfrr6g`
- 結論：[已驗證] F1-FU-1 守門已補強，三條獨立 canary 皆紅；F1-FU-2 選擇 A（保留兩個 WeakMap）；F1-FU-3 已補齊原批 24 檔逐檔揭露及 DOM 契約差異。
- 交付邊界：[已驗證] 本補件只修改 `tests/react-surface-lifecycle.test.js`；未修改任何 production 檔、文案、testid 或 sheet 殼。
- 提交／推送：[已驗證] 程式修改已獨立 commit；本回報不列入實作 commit，未 push。

## 1. Commit 清單

```text
$ git log --oneline 7112d6d..HEAD
70562a4 test(arch-F1-FU-1): strengthen session lifecycle guard
```

```text
$ git show --stat --oneline 70562a4
70562a4 test(arch-F1-FU-1): strengthen session lifecycle guard
 tests/react-surface-lifecycle.test.js | 32 +++++++++++++++++++++++++++++---
 1 file changed, 29 insertions(+), 3 deletions(-)
```

## 2. F1-FU-1：補強 Session Detail lifecycle 守門

### 2.1 改了什麼

- `tests/react-surface-lifecycle.test.js`（F1-FU-1）：新增括號平衡的 `extractBracedBody`，先錨定 `mountSessionDetailSheetContent` 函式，再擷取其 `return { ... }` 契約，最後逐一擷取 `enterConfirming`、`handleEscape`、`setJoinPreview` 的方法體。
- [已驗證] 每個方法體各自必須含 `surfaceContent.commit(`，且回傳契約內的出現次數必須恰為 3；不再使用跨越整檔的 `［\s\S］*?`。
- [已驗證] 原本有牙的反向斷言 `assert.doesNotMatch(SESSION_VIEWS, /content\.renderStage|function renderStage/)` 保留不動。
- [已驗證] `src/sheets/SessionDetailSheet.tsx` 無最終 diff；不需要為測試錨點重排 production code。

對應現行行號：

- `tests/react-surface-lifecycle.test.js:12-27`：括號平衡擷取器。
- `tests/react-surface-lifecycle.test.js:80-95`：錨定 factory、回傳契約及三個方法體的守門。
- `src/sheets/SessionDetailSheet.tsx:821-837`：實際受守護的回傳契約。

### 2.2 還原後單元測試

指令：

```bash
node --test tests/react-surface-lifecycle.test.js
```

實際完整輸出：

```text
TAP version 13
# Subtest: all 14 React sheet adapters register tracked SurfaceHost portal content
ok 1 - all 14 React sheet adapters register tracked SurfaceHost portal content
  ---
  duration_ms: 2.418292
  type: 'test'
  ...
# Subtest: non-home pages and sheets stay behind explicit preloadable module boundaries
ok 2 - non-home pages and sheets stay behind explicit preloadable module boundaries
  ---
  duration_ms: 0.318084
  type: 'test'
  ...
# Subtest: surface close unmounts React before clearing DOM and remains idempotent
ok 3 - surface close unmounts React before clearing DOM and remains idempotent
  ---
  duration_ms: 0.090959
  type: 'test'
  ...
# Subtest: Session Detail blocks both direct and async commits after its surface dies
ok 4 - Session Detail blocks both direct and async commits after its surface dies
  ---
  duration_ms: 0.39875
  type: 'test'
  ...
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 44.998709
```

### 2.3 Canary 1：只移除 `enterConfirming` wrapper

暫時變更（其餘兩個 wrapper 不動）：

```diff
 enterConfirming(expectedAccepted) {
-  surfaceContent.commit(() => commands.current?.enterConfirming(expectedAccepted));
+  commands.current?.enterConfirming(expectedAccepted);
 },
```

指令：

```bash
node --test tests/react-surface-lifecycle.test.js
```

實際完整紅燈輸出：

```text
TAP version 13
# Subtest: all 14 React sheet adapters register tracked SurfaceHost portal content
ok 1 - all 14 React sheet adapters register tracked SurfaceHost portal content
  ---
  duration_ms: 4.177125
  type: 'test'
  ...
# Subtest: non-home pages and sheets stay behind explicit preloadable module boundaries
ok 2 - non-home pages and sheets stay behind explicit preloadable module boundaries
  ---
  duration_ms: 0.316042
  type: 'test'
  ...
# Subtest: surface close unmounts React before clearing DOM and remains idempotent
ok 3 - surface close unmounts React before clearing DOM and remains idempotent
  ---
  duration_ms: 0.092916
  type: 'test'
  ...
# Subtest: Session Detail blocks both direct and async commits after its surface dies
not ok 4 - Session Detail blocks both direct and async commits after its surface dies
  ---
  duration_ms: 0.675208
  type: 'test'
  location: '/Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:80:1'
  failureType: 'testCodeFailure'
  error: |-
    The input did not match the regular expression /surfaceContent\.commit\(/. Input:

    '\n      commands.current?.enterConfirming(expectedAccepted);\n    '

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
  actual: |-

          commands.current?.enterConfirming(expectedAccepted);

  operator: 'match'
  stack: |-
    TestContext.<anonymous> (file:///Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:92:12)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
1..4
# tests 4
# suites 0
# pass 3
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 49.233458
```

### 2.4 Canary 2：只移除 `handleEscape` wrapper

暫時變更（其餘兩個 wrapper 已還原且保持不動）：

```diff
 handleEscape() {
   let handled = false;
-  surfaceContent.commit(() => {
-    handled = commands.current?.handleEscape() ?? false;
-  });
+  handled = commands.current?.handleEscape() ?? false;
   return handled;
 },
```

實際完整紅燈輸出：

```text
TAP version 13
# Subtest: all 14 React sheet adapters register tracked SurfaceHost portal content
ok 1 - all 14 React sheet adapters register tracked SurfaceHost portal content
  ---
  duration_ms: 4.045375
  type: 'test'
  ...
# Subtest: non-home pages and sheets stay behind explicit preloadable module boundaries
ok 2 - non-home pages and sheets stay behind explicit preloadable module boundaries
  ---
  duration_ms: 0.312375
  type: 'test'
  ...
# Subtest: surface close unmounts React before clearing DOM and remains idempotent
ok 3 - surface close unmounts React before clearing DOM and remains idempotent
  ---
  duration_ms: 0.089833
  type: 'test'
  ...
# Subtest: Session Detail blocks both direct and async commits after its surface dies
not ok 4 - Session Detail blocks both direct and async commits after its surface dies
  ---
  duration_ms: 0.707959
  type: 'test'
  location: '/Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:80:1'
  failureType: 'testCodeFailure'
  error: |-
    The input did not match the regular expression /surfaceContent\.commit\(/. Input:

    '\n' +
      '      let handled = false;\n' +
      '      handled = commands.current?.handleEscape() ?? false;\n' +
      '      return handled;\n' +
      '    '

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
  actual: |-

          let handled = false;
          handled = commands.current?.handleEscape() ?? false;
          return handled;

  operator: 'match'
  stack: |-
    TestContext.<anonymous> (file:///Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:92:12)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
1..4
# tests 4
# suites 0
# pass 3
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 50.141958
```

### 2.5 Canary 3：只移除 `setJoinPreview` wrapper

暫時變更（其餘兩個 wrapper 已還原且保持不動）：

```diff
 setJoinPreview(state) {
-  surfaceContent.commit(() => commands.current?.setJoinPreview(state));
+  commands.current?.setJoinPreview(state);
 },
```

實際完整紅燈輸出：

```text
TAP version 13
# Subtest: all 14 React sheet adapters register tracked SurfaceHost portal content
ok 1 - all 14 React sheet adapters register tracked SurfaceHost portal content
  ---
  duration_ms: 4.040042
  type: 'test'
  ...
# Subtest: non-home pages and sheets stay behind explicit preloadable module boundaries
ok 2 - non-home pages and sheets stay behind explicit preloadable module boundaries
  ---
  duration_ms: 0.3155
  type: 'test'
  ...
# Subtest: surface close unmounts React before clearing DOM and remains idempotent
ok 3 - surface close unmounts React before clearing DOM and remains idempotent
  ---
  duration_ms: 0.089625
  type: 'test'
  ...
# Subtest: Session Detail blocks both direct and async commits after its surface dies
not ok 4 - Session Detail blocks both direct and async commits after its surface dies
  ---
  duration_ms: 0.677375
  type: 'test'
  location: '/Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:80:1'
  failureType: 'testCodeFailure'
  error: |-
    The input did not match the regular expression /surfaceContent\.commit\(/. Input:

    '\n      commands.current?.setJoinPreview(state);\n    '

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
  actual: |-

          commands.current?.setJoinPreview(state);

  operator: 'match'
  stack: |-
    TestContext.<anonymous> (file:///Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:92:12)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
1..4
# tests 4
# suites 0
# pass 3
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 48.083375
```

### 2.6 Canary 還原與工作區證據

[已驗證] 三次 canary 後均以反向 patch 還原。以下檢查是在建立本補件報告之前執行：

```text
$ git diff --quiet -- src/sheets/SessionDetailSheet.tsx
（空輸出，exit 0）

$ git status --porcelain --untracked-files=no
（空輸出）
```

[已驗證] 派工要求的字面 `git status --porcelain` 無法呈現空輸出，原因不是 canary 殘留，而是開工前已存在三份刻意維持 untracked 的派工／驗收文件：

```text
$ git status --porcelain
?? docs/arch-dispatch-2026-08-22-frontend-execution-report-F1-codex.md
?? docs/arch-dispatch-2026-08-24-frontend-F1-followup.md
?? docs/arch-reports/batch-F1-acceptance-2026-08-24.md
```

因此以 tracked-only status 空輸出及 production 目標檔 `git diff --quiet` exit 0 證明 canary 已完全還原；未刪除、搬移或擅自提交這三份使用者／驗收方文件。

### 2.7 Async join 路徑現在由什麼承接

- [已驗證] `src/sheets/SessionDetailSheet.tsx:720-735` 的 async join 已位於 React 元件內；Promise resolve/reject 只呼叫元件自己的 `setStage`／`setSnapshot`。
- [已驗證] sheet unmount 時，`src/app/SurfaceHost.tsx:76-84` 先把 slot 判死並移除 portal；已卸載元件後抵達的 Promise 結果不再有可 commit 的 React 子樹。
- [已驗證] adapter imperative 路徑則由 `src/app/SurfaceHost.tsx:66-68` 的 `commit(update) { if (!isLive) return; ... }` 阻擋；本次三個靜態斷言正是確保每個公開 imperative command 都經過此入口。
- [已驗證] runtime `tests/react-unmount.spec.js:44-78` 刻意先讓 join 停在 pending，關閉 `#session-sheet` 後才 release Promise。實際關鍵斷言原文為：

```js
await expect(page.locator("#session-sheet")).toHaveCount(0);
await expect.poll(() => page.evaluate(() => globalThis.__surfaceContentUnmounts)).toEqual(["session-sheet"]);
await expect(page.locator("#app-error-notice")).toHaveCount(0);
expect(pageErrors).toEqual([]);
```

[推論] 這個 runtime 案例足以承接舊 `renderStage` async guard 的使用者可觀察語意：結果在 unmount 後才回來，sheet 不復活、portal 只卸載一次，也沒有 React/global error。它不覆蓋三個公開 imperative command 的逐方法 wiring，因此本次靜態 gate 仍必要；原批報告 §9.1「沒有刪掉 lifecycle 保護」應更正為「runtime 行為未破，但三個 imperative command 的靜態守門曾被改弱，已由 `70562a4` 補回」。

## 3. F1-FU-2：WeakMap 選項 A（保留）

### 3.1 決策

[已驗證] 保留 `src/sessionViews.js:305` 的 `drawerFocusIntents` 與 `:307` 的 `drawerScrollPositions`；本補件不改程式碼。

```text
$ git show 0be31a2:src/sessionViews.js | grep -n 'new WeakMap'
308:const drawerBindings = new WeakMap();
309:const drawerFocusIntents = new WeakMap();
311:const drawerScrollPositions = new WeakMap();
312:const mySessionsRenderOptions = new WeakMap();

$ grep -n 'new WeakMap' src/sessionViews.js
305:const drawerFocusIntents = new WeakMap();
307:const drawerScrollPositions = new WeakMap();
```

[已驗證] 基準四個 WeakMap 中，`drawerBindings` 與 `mySessionsRenderOptions` 已退役；本節只為仍有行為責任的另外兩個結案。

React 穩定 key 保住的是：同一個 page/drawer slot 在一般 props 更新時，React 可沿用可對應的元件與 DOM identity，不再因 generation key 強制整棵 remount。

React 穩定 key 沒有保住的是：

- 權威資料讓原卡片消失、排序或清單縮短時，舊 DOM 節點仍會被合理移除；React 不知道應把鍵盤焦點移到哪個「同語意」卡片、empty-state action 或 fallback。
- drawer 在 collapsed/open 間切換、loading fallback 暫時接焦、或 60 秒 quiet refresh 改寫清單時，瀏覽器目前的 active element／scrollTop 不是 React component state，也不會由穩定 key 自動復原。
- scrollTop 必須在 focus callback 之後恢復並依新清單高度 clamp；單靠 DOM identity 無法表達這個順序及上限。

### 3.2 `drawerFocusIntents` 保留理由

- [已驗證] `src/sessionViews.js:509-529` 把 toggle、close、empty action 或 session id 記成「邏輯焦點意圖」，不是記住可能已斷線的 DOM node。
- [已驗證] `src/sessionViews.js:567-620` 在 requestAnimationFrame 後依新 DOM 還原；若原卡片消失，會選新的 action／recovery target，且有新 sheet 時不搶焦。
- [已驗證] `src/sessionViews.js:717-730` 在 adapter render 及 store change 前 capture，`:742-747` 在同步 React commit 後 restore。
- [已驗證] `tests/performance.spec.js:307-320` 驗證 stale card 消失後焦點交給 `discovery-expand`；`:324-343` 驗證 delayed refresh 的 loading fallback 之後回到原卡；`:346-376` 驗證 collapsed toggle 與 empty action 在重繪後仍保有焦點；`:380-395` 驗證 reset 後焦點交給新卡。

因此這個 WeakMap 補的是「跨 replacement 的語意焦點」，不是 F1-2 已解決的 generation remount。

### 3.3 `drawerScrollPositions` 保留理由

- [已驗證] `src/sessionViews.js:487-506` 明確保存 open drawer 的 reading position，collapsed redraw 不用隱藏 replacement element 的 0 覆寫有效位置，還原時 clamp 到新 `maxScrollTop`。
- [已驗證] `src/sessionViews.js:744-747` 明定先恢復 focus、再恢復 scroll，校正 focus 可能造成的 browser scroll。
- [已驗證] `tests/smoke.spec.js:1009-1066` 驗證 quiet refresh 後焦點仍是 session `18008` 且 `scrollTop` 仍為 200。
- [已驗證] `tests/smoke.spec.js:1069-1125` 驗證 first render、collapsed/open、多次 collapsed redraw 及短清單 clamp。

因此這個 WeakMap 補的是「跨 drawer state／權威清單 replacement 的 reading position」，穩定 key 並不能代替。

## 4. F1-FU-3：原批 24 檔完整揭露

以下清單固定比對原批 `0be31a2..7112d6d`，不把本補件 commit 混入原批 numstat。

```text
$ git diff --numstat 0be31a2 7112d6d
3	3	playwright.config.js
44	35	src/app/App.tsx
3	1	src/components/SessionCard.tsx
1	0	src/controllerContracts.ts
64	317	src/main.js
0	24	src/meFocus.js
21	0	src/pageViewStore.ts
132	83	src/pages/MePage.tsx
16	3	src/pages/MessagesPage.tsx
236	38	src/pages/MySessionsPage.tsx
173	19	src/pages/NearbySessionsDrawer.tsx
5	1	src/sessionActions.ts
13	46	src/sessionController.js
1	0	src/sessionPresentation.ts
41	0	src/sessionSelectors.ts
58	2	src/sessionStore.ts
75	382	src/sessionViews.js
3	1	src/sheets/CourtSessionSheet.tsx
332	69	src/sheets/SessionDetailSheet.tsx
8	1	tests/ci-config.test.js
1	35	tests/me-focus.test.js
80	0	tests/react-page-focus.spec.js
4	2	tests/react-surface-lifecycle.test.js
2	1	tests/session-controller-sequence.test.js
```

逐檔一句話：

| 檔案 | F 項 | 改動摘要 |
| --- | --- | --- |
| `playwright.config.js` | F1-4 | 把新的 React page focus runtime spec 納入兩個 Chromium project，並讓非阻擋 WebKit 鏡射 coverage。 |
| `src/app/App.tsx` | F1-1／F1-2／F1-3 | 將 controller/page-view stores 與 callbacks 傳入四頁 slot，頁面 key 改用穩定 slot id，error boundary 改顯式 resetKey。 |
| `src/components/SessionCard.tsx` | F1-3 | 新增 `onOpenSession` prop，保留既有 data attributes 並由 React `onClick` 開啟球局。 |
| `src/controllerContracts.ts` | F1-1 | 在 controller store event payload 型別加入 `me` 通道。 |
| `src/main.js` | F1-1／F1-4 | 退役 activePage 手動頁面重繪鏈及 Me/Messages/My Sessions capture/restore 焦點機制，改發布 store/page-view 更新。 |
| `src/meFocus.js` | F1-4 | 刪除只服務退役 pending-Me-focus 機制的 `shouldReleasePendingMeFocus`，保留通用 `canReceiveFocus`。 |
| `src/pageViewStore.ts` | F1-1 | 新增頁面 options 的 external store，讓 legacy adapter 同步發布、React page 訂閱。 |
| `src/pages/MePage.tsx` | F1-1／F1-2／F1-5 | 訂閱 controller/page-view store，將通知／球場／presence 控制化，並標示 React 權威 disabled 狀態。 |
| `src/pages/MessagesPage.tsx` | F1-1 | 直接訂閱 controller 與 page-view stores 以導出最新訊息頁 view/callbacks。 |
| `src/pages/MySessionsPage.tsx` | F1-1／F1-3 | 直接訂閱 stores，將分段、球局卡、邀請與 lifecycle action 事件收進 React handlers。 |
| `src/pages/NearbySessionsDrawer.tsx` | F1-1／F1-3 | 訂閱 session store，將 toggle、卡片、empty-state、close 與 gesture 事件收進 React。 |
| `src/sessionActions.ts` | F1-2 | async 通知 action 在 React replacement 後重新找 controls，且不重新啟用 React 判定為權威 disabled 的新節點。 |
| `src/sessionController.js` | F1-1 | 由 callback-driven conditional rerender 改為按通道 emit controller store 更新，並暴露 store 給 React adapter。 |
| `src/sessionPresentation.ts` | F1-3 | 將 `notificationPushHint` 加入 My Sessions presentation runtime，供 React-owned success prompt 使用單一來源。 |
| `src/sessionSelectors.ts` | F1-1 | 新增由 controller state 導出 Me、Messages、My Sessions 與 Nearby view 的純 selector。 |
| `src/sessionStore.ts` | F1-1 | 新增逐通道 subscribe/emit 與 `useSyncExternalStore` selector hook，並保留 legacy adapter 同步 commit 語意。 |
| `src/sessionViews.js` | F1-1／F1-3／F1-6 | adapter 改傳 stores/callbacks，刪除 My Sessions/session-card wire 層及 join stage/wire 狀態機；保留公開 facade。 |
| `src/sheets/CourtSessionSheet.tsx` | F1-3 | 將 `onOpenSession` 傳給 React `SessionCard`，不再依 adapter 重綁卡片事件。 |
| `src/sheets/SessionDetailSheet.tsx` | F1-6 | 以 `useState`／React `onClick` 內部化 join 五態、Escape 與四種 action wiring，公開 imperative contract 維持同步。 |
| `tests/ci-config.test.js` | F1-4 | 守住 Chromium 與 WebKit project 都包含 `react-page-focus.spec.js`。 |
| `tests/me-focus.test.js` | F1-4 | 刪除已退役 `shouldReleasePendingMeFocus` 的六案，保留仍在 production 使用的 `canReceiveFocus` 測試。 |
| `tests/react-page-focus.spec.js` | F1-4 | 新增 Me、Messages、My Sessions adapter update 不 remount、不需 main.js 還原仍保焦的 runtime gate。 |
| `tests/react-surface-lifecycle.test.js` | F1-6 | 原批將 join lifecycle 靜態守門改對應內部化 contract；該版三條 regex 過弱，本補件 `70562a4` 已另行補強。 |
| `tests/session-controller-sequence.test.js` | F1-7 | 先把 GOLDEN 降為通道／次數，收尾恢復 124 筆完整 payload；最終差異只留重錄紀律註記。 |

## 5. `data-notification-authoritative-disabled` 揭露

- [已驗證] `src/sessionActions.ts:342-365` 的 `runNotificationSettingAction` 會先記錄 action 開始時未 disabled 的 controls，pending 期間暫時 disable；callback 內可能觸發 React 權威重繪，因此 finally 階段需按 descriptor 找「新節點」。
- [已驗證] `src/pages/MePage.tsx:424`、`:439`、`:534` 分別標示全球場 checkbox、球場 picker toggle、enable-push button 是否因當下 React props 而權威 disabled。
- [推論] 只看新節點的 `disabled` 無法分辨「action helper 暫時鎖住」與「React 根據無球場、push 已啟用／不支援等權威狀態鎖住」兩種來源；盲目 restore 會把 React 新 markup 解鎖。
- [推論] generic DOM action helper 不能直接讀 MePage local React state，且 callback 可能已 replacement 原節點；以 data marker 隨權威 markup 一起輸出，才能在跨 replacement 的 restore 時做可觀察且局部的判斷。
- [已驗證] `tests/smoke.spec.js:2780-2812` 的 `a rerender inside a notification action stays authoritative over the disable restore` 實際斷言 action 前 enabled、callback 只呼叫一次、重繪後文案為「此裝置已開啟」且按鈕保持 disabled。
- [已驗證] `rg -n 'notification-authoritative-disabled|notificationAuthoritativeDisabled' tests` 空輸出：既有 e2e 沒有依賴此新 marker；它們仍透過既有 testid 與使用者可觀察狀態斷言。

### 5.1 其他 DOM attribute／id／class／aria 比對

[已驗證] 對原批所有變動的 `src/` 檔，分別從 `0be31a2` 與 `7112d6d` 讀檔，抽取實際 markup 位置的 `data-*`／`aria-*` attribute 名、literal id、literal class token 與 literal testid 後做 set diff。可證偽檢查的實際輸出：

指令（`collect(ref)` 逐一 `git show <ref>:<changed-src-file>`，並以 `(?:^|[\\s<])` 排除 selector 字串）：

```bash
node --input-type=module <<'NODE'
import { execFileSync } from "node:child_process";
const baseline = "0be31a2";
const head = "7112d6d";
const files = execFileSync("git", ["diff", "--name-only", baseline, head, "--", "src"], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean);
function read(ref, file) {
  try {
    return execFileSync("git", ["show", `${ref}:${file}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}
function collect(ref) {
  const result = { data: new Set(), aria: new Set(), ids: new Set(), classes: new Set(), testids: new Set() };
  for (const file of files) {
    const source = read(ref, file);
    for (const match of source.matchAll(/(?:^|[\s<])(data-[A-Za-z0-9_-]+|aria-[A-Za-z0-9_-]+)\s*=/gm)) {
      result[match[1].startsWith("data-") ? "data" : "aria"].add(match[1]);
    }
    for (const match of source.matchAll(/(?:^|[\s<])(id|className|class)\s*=\s*(?:"([^"]*)"|'([^']*)')/gm)) {
      const value = match[2] ?? match[3];
      if (match[1] === "id") result.ids.add(value);
      else for (const token of value.split(/\s+/).filter(Boolean)) result.classes.add(token);
    }
    for (const match of source.matchAll(/(?:^|[\s<])data-testid\s*=\s*(?:"([^"]*)"|'([^']*)')/gm)) {
      result.testids.add(match[1] ?? match[2]);
    }
  }
  return result;
}
const before = collect(baseline);
const after = collect(head);
for (const key of ["data", "aria", "ids", "classes", "testids"]) {
  const added = [...after[key]].filter((value) => !before[key].has(value)).sort();
  const removed = [...before[key]].filter((value) => !after[key].has(value)).sort();
  console.log(`${key} added: ${added.length ? added.join(", ") : "(none)"}`);
  console.log(`${key} removed: ${removed.length ? removed.join(", ") : "(none)"}`);
}
NODE
```

```text
data added: data-notification-authoritative-disabled
data removed: (none)
aria added: (none)
aria removed: (none)
ids added: (none)
ids removed: (none)
classes added: (none)
classes removed: (none)
testids added: (none)
testids removed: (none)
```

[已驗證] 因此原批唯一新增／移除的 DOM attribute 名是新增 `data-notification-authoritative-disabled`；無其他 data attribute、aria attribute、literal id、literal class token 或 literal testid 集合差異。

## 6. Commit 前 gate

```text
$ npm run typecheck
> tsc --noEmit
（exit 0）

$ npm run lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts
（exit 0）

$ npm run prettier:check
Checking formatting...
All matched files use Prettier code style!
```

## 7. 最終完整 frontend gate

指令（Playwright 期間未並行執行其他 node test 或 dev server）：

```bash
npm run test:ci:frontend
```

實際輸出首段與尾段：

```text
> tennis-partner-finder@0.1.0 test:ci:frontend
> node scripts/generate-courts-seed.mjs --check && npm run typecheck && npm run lint && npm run prettier:check && npm run test:mock && npm run build && npm run check:production-bundle && git diff --check

--check 通過:產出檔案與 data/courts.json 重生結果一致。

> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

> tennis-partner-finder@0.1.0 prettier:check
Checking formatting...
All matched files use Prettier code style!

...
1..279
# tests 284
# suites 0
# pass 284
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2065.199375

Running 272 tests using 1 worker
...
  4 skipped
  268 passed (2.4m)

> tennis-partner-finder@0.1.0 build
> vite build

vite v6.4.3 building for production...
✓ 149 modules transformed.
...
dist/assets/index-nercfJ3_.js  632.76 kB │ gzip: 184.20 kB
✓ built in 891ms

> tennis-partner-finder@0.1.0 check:production-bundle
> node scripts/check-production-bundle.mjs

production bundle check passed: 28 files, 12 demo identifiers absent; main chunk 632763/184198 bytes within 703886/203176
```

[已驗證] `test:ci:frontend` exit 0；其中 desktop 與 mobile 的 `react-unmount.spec.js:44` 均通過，`smoke.spec.js:2780` 的 notification authoritative rerender 案亦在兩 project 通過。

```text
$ git diff --check
（空輸出，exit 0）
```

## 8. 守門測試調整（單獨列節）

本補件只有一項守門調整：

| 檔案 | 變因 | 保護強度 |
| --- | --- | --- |
| `tests/react-surface-lifecycle.test.js` | F1-6 已把 join wiring 由 sessionViews 移入 `SessionDetailSheet`，原批替換後的三條無界 regex 無法逐方法定位 | 改為 factory → return contract → method body 三層錨定；三個單條 canary 已證明任一 wrapper 遺失都會紅，並另鎖 contract 內 commit 次數恰為 3 |

[已驗證] 未刪除或調整其他 lifecycle、GOLDEN、計數、Playwright 或 e2e 斷言；`assert.doesNotMatch(...renderStage...)` 保留。

## 9. 未做與不在範圍

- [已驗證] 未處理驗收觀察的六項：第三個 `flushSync`、`me` 通道 GOLDEN、`controller.sessionStore` 公開 API、inline `onBeforeStoreChange` 訂閱 churn、兩個命名／註解殘留、`smoke.spec.js:161` 負載敏感；派工明定本補件不要順手處理。
- [已驗證] 未修改 `src/sheets/SessionDetailSheet.tsx` 最終內容、`src/app/SurfaceHost.tsx`、`src/sheets.js`、`src/dataApi.js`、任何 `src/data/`、Supabase、規則、文案或 testid。
- [已驗證] 未跑 `npm run test:local`／`npm run test:db`：本補件零 migration、零 data API/RPC 邊界變更，且派工揭露本機 Supabase／Docker 未啟動。
- [已驗證] 未跑 `npm run test:mock:webkit`：派工列為非阻擋；`ci-config.test.js` 仍守住 WebKit coverage mirror。
- [已驗證] 未 push；本回報不 commit。
