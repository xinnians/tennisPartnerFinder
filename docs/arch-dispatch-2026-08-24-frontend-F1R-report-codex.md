# F1R 執行回報（codex）

- 日期：2026-08-24
- 開工基準：`e907c40`
- 最終實作 HEAD：`0f57c1b`
- 狀態：production 修復、守門測試、local／frontend／DB gates 全部完成
- push：未執行
- 本回報：依派工單要求不列入實作 commit

## 一、結論

[已驗證] F1R 共修復批 1 的兩條使用者可見焦點迴歸：

1. F1-1 後「建立球局 → store emit → My Sessions 新卡片」的 React commit 沒有把 live
   focus intent 送回 adapter。實際問題不是 commit callback 沒執行，而是 callback 持有 app
   開機時的 stale closure。
2. F1-5 把球場訂閱改成 controlled optimistic state 後，勾最後一座會在 RPC 完成前收合
   picker；原 checkbox 隱形後焦點短暫掉到 body。現在只在焦點位於即將隱藏的 picker 內時，
   同步交棒到 `toggle-court-picker`。

[已驗證] 最終 `npm run test:local` 為 `42 passed / 11 skipped`，53 項全部走完，
`did not run` 為 0。`npm run test:ci:frontend`、`npm run test:db`、GOLDEN、testid、
tracked worktree 與 `git diff --check` 也都通過。

## 二、commit 與檔案

### 實作 commit

- `e3a638f test(arch-F1R): update Me focus rerender oracle`
- `d59e72a fix(arch-F1R): deliver created-session focus after store commits`
- `0f57c1b fix(arch-F1R): hand off focus before picker collapse`

修訂文件 commit `4aa89a0`、`8921dd3` 由驗收方提交，不是 codex 實作 commit。

### 變更檔案

- `src/main.js`：一次性 focus acknowledgement 改為帶 expected session id，只有仍為同一目標才清除。
- `src/pages/MySessionsPage.tsx`：在 `useLayoutEffect` 將 live focus id 與 live groups 送回 adapter commit。
- `src/sessionViews.js`：把 live React commit 值合併進 created-session focus 排程，保留既有 action scope／pending sync。
- `tests/react-page-focus.spec.js`：新增一次 mount、store emit、React commit、focus／ack exactly-once 的 mock 迴歸測試。
- `tests/session.spec.js`：依修訂一更新一條失效 oracle；`session.spec.js:532` 未動。
- `src/pages/MePage.tsx`：依修訂二加入 picker 收合的條件式同步焦點交棒。

## 三、第一條迴歸：F1-1 created-session focus

### 3.1 runtime 診斷四題

#### 綠基準 `0be31a2`

指令：

```text
TENNIS_TEST_HARNESS_MODE=local npx playwright test tests/session.spec.js \
  --project=supabase-chromium \
  --grep "a complete profile creates a Taipei session"
```

臨時探針輸出（探針已刪除）：

```text
[F1R green show] {"createdSessionFocusId":19,"createdSessionFocusReason":"created","pageViewStore":"N/A before F1-1"}
[F1R green main.render] {"activePage":"my-sessions","createdSessionFocusId":19,"createdSessionFocusReason":"created","upcoming":[19]}
[F1R green adapter] {"createdSessionId":19,"highlightSessionId":19,"upcoming":[19]}
[F1R green commit] {"createdSessionId":19,"highlightSessionId":19,"upcoming":[19]}
[F1R green schedule] {"focusSessionId":19,"focusInUpcoming":true,"focusInNeedsAction":false,"upcoming":[19]}
[F1R green raf] {"targetFound":true}
[F1R green main.ack] {"accepted":true,"createdSessionFocusId":19,"focusSessionId":19}
[F1R green raf.ack] {"acknowledged":true}
[F1R green raf.focus] {"focused":true}
[F1R green raf] {"targetFound":true}
[F1R green main.ack] {"accepted":false,"createdSessionFocusId":null,"focusSessionId":19}
[F1R green raf.ack] {"acknowledged":false}
1 passed (5.8s)
```

#### 紅基準 `a27b91f`

同一條 targeted local 測試的臨時探針輸出：

```text
[F1R red main.mount] {"activePage":"map","createdSessionFocusId":null,"createdSessionFocusReason":null,"pageViewFocusId":null,"upcoming":[]}
[F1R red adapter] {"createdSessionId":null,"highlightSessionId":null,"pageViewFocusId":null,"upcoming":[]}
[F1R red show] {"createdSessionFocusId":20,"createdSessionFocusReason":"created"}
[F1R red publish] {"channels":["mySessions"],"createdSessionFocusId":20,"createdSessionFocusReason":"created"}
[F1R red react.commit] {"pageViewFocusId":20,"resolvedCreatedSessionId":20,"resolvedFocusSessionId":20,"upcoming":[20]}
[F1R red commit] {"createdSessionId":null,"highlightSessionId":null,"pageViewFocusId":20,"upcoming":[]}
[F1R red schedule] {"focusSessionId":null,"focusInUpcoming":false,"focusInNeedsAction":false,"upcoming":[]}
```

`react.commit`／`commit` 後續重複相同的 live-vs-stale 差異；結果：

```text
Error: expect(locator).toBeFocused() failed
Expected: focused
Received: inactive
14 × locator resolved
1 failed
```

四題答案：

1. [已驗證] F1-1 後 adapter `renderMySessionsPage` 只在 app 啟動 mount 呼叫一次；React store
   更新後 adapter 本身不重呼。
2. [已驗證] 派工單初步假說「commit callback 不執行」被推翻。callback 仍由 React
   `useLayoutEffect` 在每次 commit 執行；`scheduleMySessionsCreatedFocus` 也有呼叫，但收到
   `focusSessionId:null` 與空 groups，所以條件為 false，沒有排 rAF，也沒有 query DOM。
3. [已驗證] 當下 `pageViewStore.createdSessionFocusId` 是 `20`，React component 讀到的 live
   id／groups 也正確；stale 的是 adapter callback 閉包內 startup `options`。
4. [已驗證] 綠版 imperative rerender 每次把 live options 帶進 callback；紅版 store emit
   原地更新 React，但 callback 仍閉包住初始 options。`onCreatedSessionFocus` 在紅版根本未走到；
   綠版第一次回 true 並清除、第二次回 false，證明 one-shot 語意。

### 3.2 根因與修法

[已驗證] 真正根因是 adapter commit callback 的資料時效，不是 callback 的生命週期。
`MySessionsPage` 現在在 layout commit 回報 live `resolvedCreatedSessionId`、
`resolvedFocusSessionId` 與 groups；adapter 以 live 值覆蓋 startup options，再排 rAF。
ack 帶 expected session id，因此只有目前 intent 仍是該 session 時才 consume，沒有每次重繪搶焦。

### 3.3 mock 迴歸測試先紅後綠

新增測試走「單次 adapter mount → 真實 controller/store → create sheet CTA →
`showMySessionsPage` 等價 store emit → React commit」，沒有直呼第二次 adapter render。

修復前：

```text
Running 1 test using 1 worker
✘ created-session focus follows the subscribed store path after the one-time app mount
Error: expect(locator).toBeFocused() failed
Locator: locator('#my-upcoming-sessions [data-session-id=\'8842\'][data-open-my-session]')
Expected: focused
Received: inactive
14 × locator resolved
1 failed
```

修復後 targeted：

```text
✓ created-session focus follows the subscribed store path after the one-time app mount (1.3s)
1 passed (2.3s)
```

desktop＋mobile：

```text
4 passed (3.9s)
```

## 四、守門測試調整（修訂一）

### 4.1 變因與新 oracle

[已驗證] 舊 oracle 把 `watchedNode.isConnected === false` 當「背景重繪發生」的代理；
真正不變量是重繪後焦點不得掉到 body。現行 store emit 的目標語意是保留 DOM identity，
因此以節點斷線當成功條件與批 1 的目標互斥。

新 oracle 保留：

- 對稱掃描。
- `nonCourtTotal >= 15`、`total >= nonCourtTotal` 防縮水。
- 每輪改座標避開 50 公尺／60 秒節流。
- 每輪等待 `update_my_presence` response，再等雙 rAF。
- 斷言 response `ok()`、原節點仍 connected、而且仍為 `document.activeElement`。

因此 request 沒發生會 timeout fail-closed；identity 或 focus 任一回歸也會失敗。

### 4.2 canary

[已驗證] 依修訂文字先嘗試暫改 `key={slot.resetKey}`，但該 canary **沒有紅**：

```text
1 passed (7.4s)
```

[已驗證] 原因是此 store-only presence 路徑不重呼 adapter，`slot.resetKey` 沒變，故這個
指定 canary 本身不會造成 remount。這點與修訂一「必須紅」的預期不一致，沒有偽報。

改用等價且確實變動的暫時 canary：在 Me subtree 使用
`key={pageView?.presenceLocationStatus}`。它在 requesting → active 時 remount，結果如預期紅：

```text
Error: 背景 commit 後未保留同節點焦點的控件：[{"connected":false,"focused":false,"focusLanded":true,"testId":"me-profile-edit-trigger"}]
1 failed
```

還原後：

```text
1 passed (7.2s)
```

所有 canary 與探針均已還原，未進 commit。

### 4.3 歷史邊界的實測更正

[已驗證] `0be31a2` 舊 oracle targeted 通過：

```text
1 passed (15.2s)
```

[已驗證] 但修訂一要求附的「`a27b91f` 起紅 10/10」無法重現；2026-08-24 最終補跑
得到相反結果：

```text
a27b91f: 10 passed (1.1m)
9754a4f: 10 passed (1.2m)
4be7a53: 10 passed (1.2m)
7112d6d: 1 passed (8.8s)
e907c40: 1 passed (7.8s)
```

[已驗證] 在 oracle 修訂前的工作 HEAD，舊 oracle 曾穩定 10/10 因
`背景重繪必須真的發生` timeout 而紅；但以上 detached revision 重跑沒有把第一個紅點
定位到修訂所稱的 `a27b91f`。

[不確定] 這組歷史差異可能含 local runtime／資料時序變因；目前可確定的是「現行 identity
保留語意與舊 oracle 機制互斥」及有效 remount canary，不能把未重現的 `a27b91f` 紅寫成事實。

## 五、第二條迴歸：F1-5 picker 收合焦點空窗（修訂二）

### 5.1 二分與 race 取樣

修復前版本對照：

```text
0be31a2: 10 passed (41.6s)
a27b91f: 10 failed（當時較早的 subscribe-all checked 功能斷言先紅）
cd0b73d: 同一較早功能斷言穩定紅
4be7a53: 8 passed / 2 failed (41.5s)
           失敗均為「勾到最後一座後焦點掉到 body」
現行修復前 HEAD 取樣: 5 passed / 5 failed
```

[已驗證] 因此實際 body-focus race 從 F1-5 controlled optimistic 收合出現；這是批 1 的
第二條迴歸，與 F1-1 created-session focus 分列。

修復後要求的取樣：

```text
TENNIS_TEST_HARNESS_MODE=local npx playwright test tests/session.spec.js \
  --project=supabase-chromium \
  --grep "checking the last court collapses" \
  --repeat-each=10 --retries=0

✓ 1 ...
✓ 2 ...
✓ 3 ...
✓ 4 ...
✓ 5 ...
✓ 6 ...
✓ 7 ...
✓ 8 ...
✓ 9 ...
✓ 10 ...
10 passed (44.6s)
```

mock 既有球場訂閱流程：

```text
npx playwright test tests/smoke.spec.js --project=desktop-chromium \
  --grep "subscribing to every Taipei court collapses the picker and reopens on demand"

1 passed (1.2s)
```

### 5.2 條件式交棒機制

[已驗證] `saveCourtSelection` 先判斷：

- 這次選擇是否會收合 picker；且
- `document.activeElement` 是否位於 `[data-notification-courts]` 內，或就是
  `[data-notification-court]`。

只有兩者皆真才交棒。外層「全台北市球場」checkbox 不在 picker 內，不會被搶焦。

臨時探針另外證明，若在 `runNotificationSettingAction` 前直接 focus toggle，
`runAsyncAction` 隨後會 imperative `disabled = true`，又把焦點清到 body。最終順序因此是：

1. async action 先同步 capture 原 checkbox 並鎖定 notification controls；
2. 僅對條件式 handoff，把純本地 disclosure toggle 重新 enable；
3. 在同一事件 turn 聚焦 toggle；
4. React optimistic commit 隱藏 picker。

[已驗證] `sessionActions.ts` 完全未動。RPC 完成後既有 fallback 先看
`focusIsLoose`；焦點已在 toggle 時為 false，所以不會二次跳焦。fallback 仍保留給 loose／rollback
路徑。

## 六、完整驗收矩陣

### 6.1 local 主驗收

```text
$ npm run test:local

# local API
1..2
# tests 2
# pass 2
# fail 0

# Playwright
Running 53 tests using 1 worker
...
✓ 46 every Me control keeps focus through a background rerender
✓ 48 checking the last court collapses the picker without dropping focus to body
...
11 skipped
42 passed (1.4m)
```

[已驗證] `did not run` 為 0。

### 6.2 frontend CI

```text
$ npm run test:ci:frontend

All matched files use Prettier code style!
# unit
# tests 295
# pass 295
# fail 0

# Playwright
4 skipped
270 passed (2.4m)

✓ 151 modules transformed.
✓ built in 932ms
production bundle check passed: 28 files, 12 demo identifiers absent;
main chunk 633420/184464 bytes within 703886/203176
```

### 6.3 DB

```text
$ npm run test:db
All tests successful.
Files=7, Tests=799
Result: PASS
```

### 6.4 GOLDEN

```text
$ git diff 0be31a2 HEAD -- tests/session-controller-sequence.test.js
@@ -347,7 +347,8 @@ async function driveSequence() {
- * 自 2026-08-19 工作樹錄製後逐字寫入。要改這張表,只有兩種正當理由:
+ * 2026-08-23 批 1 收尾恢復 2026-08-19 工作樹逐字錄製的完整 payload 表。要改這張表,
+ * 只有兩種正當理由:
```

[已驗證] 唯一差異仍是既有檔頭註解；124 筆 GOLDEN payload 沒有變動。

### 6.5 `data-testid` 集合

以 `git ls-tree` 列出兩版全 `src/`，讀取每檔並收集：

- 非 selector 的 `data-testid="..."`／JSX template assignment；
- config `testId: "..."`；
- 動態 expression 正規化為 `${…}` pattern。

```text
0be31a2 files 81 static 77 dynamic 18
HEAD     files 86 static 77 dynamic 18
$ diff baseline-static head-static
（空）
$ diff baseline-dynamic head-dynamic
（空）
```

[已驗證] 掃描集非空，static 與 dynamic 集合都逐字相同。

### 6.6 tracked worktree、格式與探針

在建立本回報前：

```text
$ git status --porcelain --untracked-files=no
（空）
$ git diff --check
（空）
```

[已驗證] 所有 codex 臨時探針、canary 與臨時 worktree 已移除。現有其他 worktree 均為
開工前既存，不屬於 F1R。工作目錄另有三份使用者既有的 F2A untracked 文件，未修改、未加入
任何 commit。本回報本身也保持 untracked。

## 七、rendered Browser QA

使用 Codex in-app Browser 連到 `http://127.0.0.1:5174/`：

```text
URL: http://127.0.0.1:5174/
title: 球咖｜台北網球
Me snapshot: heading「我」、登入卡、站務卡、五項底部導覽
console error/warn: []
```

[已驗證] 頁面非空、沒有 framework overlay、Me 導覽互動正常，截圖視覺上沒有 clipping／
overlap。in-app Browser 沒有 Playwright fixture 的 authenticated actor，故沒有用它重做會寫 local
DB 的精確 picker 流程；該流程由真 Supabase local targeted 10/10 與完整 local suite 驗證。

## 八、未做／限制

- 未 push（派工單禁止）。
- 未修改 `session.spec.js:532`、任何 testid、GOLDEN payload、`sessionActions.ts` fallback。
- 未做 2A 補件、2C／2D 拆檔或其他不在範圍的整理。
- [不確定] 修訂一指定的 `a27b91f` 舊 oracle 紅邊界無法重現；實測反而 10/10 綠，詳見 §4.3。

