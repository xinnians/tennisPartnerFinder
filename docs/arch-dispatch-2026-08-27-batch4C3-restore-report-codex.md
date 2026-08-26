# 批 4C-3 回報：restore focus＋首幀 rAF 遷入 React surface system

- 日期：2026-08-27
- 派工單：`docs/arch-dispatch-2026-08-27-batch4C3-restore.md`
- 開工 HEAD：`a2a8fa5`；working tree 乾淨。
- 4C-2 accepted 基準：`1645569`。
- 結果：完成，無 BLOCKED；未 commit、未 push。
- 修改面：`src/app/SurfaceHost.tsx`、`src/sheets.js`、
  `tests/sheets-dom.test.js`，以及本回報文件。

## 1. 結論與計畫檢視

`captureRestoreTarget`、`resolveRestoreTarget`、close restore invocation 與首幀 rAF
已一起遷入 `SurfaceHost.tsx`。`focusableNodes` 在 source 中只剩 host 一份，供 Tab trap
與首幀聚焦共用；`sheets.js` 剩下 capture／focus／restore 的編排與 configure bridge，沒有
重新實作 focus 規則。

計畫有一項已預告、且實測成立的 guard 問題：把 C2-2 的 drawer 條件破壞成無條件 fallback
後，原先指定的 `account-settings-smoke.spec.js:619` 仍然通過。Chromium 不會把焦點移到
`[hidden]` drawer 內未渲染的按鈕，所以該 E2E 對這項 mutation 沒有辨識力。依派工單改在
happy-dom 增加「非抽屜 restore target 消失後不回退到 drawer 控制項」常駐 oracle；同一
mutation 隨即打紅。這是測試 guard 補強，沒有改產品 fallback 語意。

除此之外，計畫的責任切分可行，沒有需要改範圍或 BLOCKED 的問題。

## 2. Restore 語意單元搬遷對照

### 2.1 Descriptor 與 bridge

host 端 descriptor 收斂為強型別：

```ts
interface SurfaceRestoreTarget {
  drawerId: string | null;
  node: HTMLElement;
  sessionId: string | null;
}
```

`SurfaceKeyboardEntry.restoreFocus` 由 `unknown` 改為
`SurfaceRestoreTarget | null`。三欄原意不變：

- `node`：先試原 live node。
- `sessionId`：原 node 被重繪時找同 session 卡片。
- `drawerId`：限制 selector scope，且是允許 drawer collapse／toggle fallback 的語境證據。

新增獨立 `SurfaceFocusRegistry`，而非把 restore 邏輯塞進 keyboard registry：

```text
captureRestoreTarget(node)
focusInitial(entry)
restoreFocus(target)
```

這讓 `onSurfaceKeyDown` 不解析 descriptor，亦可保持派工凍結的
`surfaceKeyboardRegistry` 函式／物件本體逐字零 diff。production 由 eager host module-init
安裝一次 bridge；happy-dom harness 明確注入同一 host module instance。

`mountSurface` 在進入任何 DOM／isolation side effect 前先擷取 stable local
`focusRegistry` 並 fail closed，避免 bridge 缺失時留下半掛載狀態，也避免一次 mount 在生命週期
中途讀到不同 registry instance。

### 2.2 Capture 時機與 replace 繼承

搬遷前後次序等價：

```text
active = surfaces.get(root)
previousFocus = active?.restoreFocus
  ?? focusRegistry.captureRestoreTarget(document.activeElement)
closeSurface(root, { reason: "replace", restoreFocus: false })
```

因此 replacement 先繼承舊 entry 的 descriptor，再關閉舊 surface；不會 capture 即將被舊
surface 一併移除的卡片。replace close 仍明確使用 `restoreFocus: false`，不會產生中途跳焦。

### 2.3 Resolve 三段順序

host 的 `resolveRestoreTarget` 保持以下順序：

```text
1. target.node.isConnected → 原 live node
2. 同 scope 內 data-session-id 相同的 replacement card
3. full 專屬 [data-nearby-dialog] [data-nearby-close]
   → 僅 target.drawerId 有值時才允許 drawer collapse／toggle fallback
```

非抽屜 descriptor 沒有 `drawerId` 時，即使 document 中存在 drawer collapse／toggle，也不會
把焦點送過去；找不到 full 專屬 close 就不移動焦點。

### 2.4 Close 次序

最終 close 次序仍為：

```text
closed idempotent guard
→ unregister keyboard entry
→ release isolation
→ content unmount
→ shell unmount
→ surfaces.delete(root)
→ onClose({ reason })
→ 若 restoreFocus，host restoreFocus(previousFocus)
→ 單錯原樣／雙錯 AggregateError 重拋
```

restore invocation 仍在 shell `finally` 內、`onClose` 之後；content 或 shell unmount 拋錯不會
跳過 delete、onClose 或 restore。`restoreFocus: false` 則完全不呼叫 host restore。

## 3. 首幀 rAF 與 liveness 等價自證

原 `closed` closure 判斷改成 host 已擁有的 stack liveness：

```ts
if (surfaceKeyboardStack.includes(entry) && !entry.surface.contains(document.activeElement)) {
  (focusableNodes(entry.surface)[0] ?? entry.surface).focus({ preventScroll: true });
}
```

等價理由：

- mount 時 entry 在 `surfaces.set` 前同步註冊進 stack。
- 任一 close 路徑先同步 unregister，再做 isolation／content／shell cleanup。
- 所以 rAF 執行時 `stack.includes(entry)` 等價於該 entry 尚未 close；被 replacement 關掉的舊
  entry 也不會在下一幀搶焦。
- `onMount` 仍先執行，之後才排程 focus；若 `onMount` 或呼叫端已把焦點移入 surface，
  `surface.contains(document.activeElement)` 使 rAF 不覆寫。
- fallback、`preventScroll: true` 與原三行意圖註解完整保留。

新增「首幀聚焦不覆寫 onMount 內的主動焦點」oracle：在 `onMount` 內主動 focus 第二顆按鈕，
rAF 後仍必須是第二顆；拿掉 contains guard 時會紅。

## 4. `focusableNodes` 單源化與 C2-2 註解

source 反掃：

```text
$ rg -n 'function focusableNodes' src
src/app/SurfaceHost.tsx:88:function focusableNodes(surface: HTMLElement): HTMLElement[] {

$ rg -n 'FOCUSABLE_SELECTOR|function focusableNodes' src/sheets.js
(no output)
```

唯一 helper 同時服務既有 Tab trap 與本批首幀 focus；`FOCUSABLE_SELECTOR` 模組本身未改。
`src/sheets.js` 由 176 行降至 134 行。

C2-2 的 12 行修法紀錄註解與 resolve 單元一起搬入 host。以 accepted HEAD 中 sheets 的註解
區塊和最終 host 區塊逐字比較，exit 0、無輸出：

```text
$ diff <(git show HEAD:src/sheets.js | sed -n '/批 C2-2 fix round 1/,/命中);非抽屜語境/p') \
       <(sed -n '/批 C2-2 fix round 1/,/命中);非抽屜語境/p' src/app/SurfaceHost.tsx)
(no output)
EXIT_CODE=0
```

## 5. Oracle 覆蓋

最終 sheets-dom：

```text
$ node --test tests/sheets-dom.test.js
# tests 16
# pass 16
# fail 0
# cancelled 0
# skipped 0
# todo 0
EXIT_CODE=0
```

本批新增兩條常駐 oracle：

- 首幀 rAF 不覆寫 `onMount` 內的主動焦點。
- 非抽屜 restore target 消失後，不回退到 drawer collapse／toggle。

既有三段 restore oracle 仍逐段驗 replacement card、drawer collapse、drawer toggle。只把三次
結果先保存、在所有 surface 完整 close 後統一斷言，避免 mutation 紅燈在 cleanup 前中斷；三個
reference 語意均未弱化。

## 6. Mutation canary 三條三拍

每條 mutation 前、還原後與最終的 host SHA-256 都是：

```text
a8c89c3d5155051c593684b7ee2bbd75f5f2c4cf7b635928d9c88e79a72ef595  src/app/SurfaceHost.tsx
```

### 6.1 Canary A：拿掉 `target.drawerId` 條件

先驗指定 guard：

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test \
  tests/account-settings-smoke.spec.js --project=desktop-chromium \
  --grep 'report dialog restores focus safely when its trigger card disappears'
1 passed (1.2s)
EXIT_CODE=0
```

如派工推演，既有 E2E 沒有紅，故未把它誤報為有效 canary。補入 happy-dom 專屬 oracle後，用
同一無條件 drawer fallback mutation 重跑，紅（exit 1）：

```text
# Subtest: 非抽屜 restore target 消失後不回退到 drawer 控制項
not ok 13 - 非抽屜 restore target 消失後不回退到 drawer 控制項
  error: Expected "actual" not to be reference-equal to "expected"

# tests 16
# pass 14
# fail 2
EXIT_CODE=1
```

還原條件後綠（exit 0）：

```text
# Subtest: 非抽屜 restore target 消失後不回退到 drawer 控制項
ok 13 - 非抽屜 restore target 消失後不回退到 drawer 控制項
# tests 16
# pass 16
# fail 0
EXIT_CODE=0
```

### 6.2 Canary B：刪除 session replacement resolve 區段

紅（exit 1）：

```text
# Subtest: 關閉 sheet 依序還原新卡片、抽屜收合按鈕與 toggle 的焦點
not ok 12 - 關閉 sheet 依序還原新卡片、抽屜收合按鈕與 toggle 的焦點
  error: |-
    Expected values to be strictly equal:

    false !== true

# tests 16
# pass 14
# fail 2
EXIT_CODE=1
```

還原 replacement 段後綠（exit 0）：

```text
# Subtest: 關閉 sheet 依序還原新卡片、抽屜收合按鈕與 toggle 的焦點
ok 12 - 關閉 sheet 依序還原新卡片、抽屜收合按鈕與 toggle 的焦點
# tests 16
# pass 16
# fail 0
EXIT_CODE=0
```

### 6.3 Canary C：拿掉 rAF contains guard

紅（exit 1）：

```text
# Subtest: 首幀聚焦不覆寫 onMount 內的主動焦點
not ok 8 - 首幀聚焦不覆寫 onMount 內的主動焦點
  error: |-
    Expected values to be strictly equal:

    false !== true

# tests 16
# pass 14
# fail 2
EXIT_CODE=1
```

還原 contains guard 後綠（exit 0）：

```text
# Subtest: 首幀聚焦不覆寫 onMount 內的主動焦點
ok 8 - 首幀聚焦不覆寫 onMount 內的主動焦點
# tests 16
# pass 16
# fail 0
EXIT_CODE=0
```

## 7. Keyboard／生命週期與凍結面自證

以 accepted HEAD 抽出 `onSurfaceKeyDown` 與 `surfaceKeyboardRegistry` 的函式／物件本體，和
最終檔案逐字比較；兩次 `diff` 都 exit 0、無輸出。唯一相關型別變更是解凍項
`restoreFocus: unknown` → `SurfaceRestoreTarget | null`。

因此 Escape／Tab／stack 仍保持：stable document capture listener、topmost `at(-1)`、
`preventDefault`、`stopPropagation`、`onEscape` 短路、Tab 首尾 wrap、hidden 排除、零
focusable fallback。restore descriptor 沒有進入 keyboard handler。

以下凍結檔案檢查 exit 0、無輸出：

```text
git diff --exit-code -- \
  tests/react-unmount.spec.js tests/performance.spec.js \
  tests/session-lifecycle-smoke.spec.js tests/chat-settings-filters-smoke.spec.js \
  tests/auth-forms-smoke.spec.js tests/account-settings-smoke.spec.js \
  tests/discovery-interactions-smoke.spec.js src/modalIsolation.js src/views \
  src/sheets src/sessionViews.js src/app/App.tsx

git diff --exit-code -- tests/react-surface-lifecycle.test.js
```

結論：七份指定 E2E、`modalIsolation.js`、4 views、14 sheet content、
`sessionViews.js`、`App.tsx`、E/A/B/C/D/F lifecycle test 原檔零 diff；公開 API、click 綁定、
`surfaces` WeakMap 與 CSS／文案未改。

七份 frozen E2E：

```text
$ npx playwright test tests/react-unmount.spec.js tests/performance.spec.js \
  tests/session-lifecycle-smoke.spec.js tests/chat-settings-filters-smoke.spec.js \
  tests/auth-forms-smoke.spec.js tests/account-settings-smoke.spec.js \
  tests/discovery-interactions-smoke.spec.js --project=desktop-chromium
2 skipped
122 passed (1.1m)
EXIT_CODE=0
```

E 群／lifecycle 封條：

```text
$ node --test tests/react-surface-lifecycle.test.js
# tests 6
# pass 6
# fail 0
EXIT_CODE=0
```

## 8. Bundle 與 importer 對帳

### 8.1 Production bundle

| 指標          | 4C-2 基準 | 4C-3 最終 |   淨值 |    上限 |    最終餘裕 |
| ------------- | --------: | --------: | -----: | ------: | ----------: |
| main raw      |   638,784 |   638,943 | +159 B | 658,867 |    19,924 B |
| main gzip     |   187,359 |   187,462 | +103 B | 192,420 |     4,958 B |
| total JS raw  |   841,408 |   841,567 | +159 B | 849,961 |     8,394 B |
| total JS gzip |   257,545 |   257,597 |  +52 B | 259,062 | **1,465 B** |

逐字 gate 摘要：

```text
$ npm run check:production-bundle
production bundle check passed: development E2E hook present, production E2E hook absent;
32 files, 12 demo identifiers absent; main 638943/187462 within 658867/192420;
largest app lazy MySessionsPage-BDqio6ky.js 16476/4828 within 18000/5500;
total JS 841567/257597 within 849961/259062;
private repository: privateDataRepository-C87oiRX9.js;
Sentry: sentryBrowserSdk-Czz5dmkg.js
EXIT_CODE=0
```

total gzip 淨增 52 B，最終餘裕 **1,465 B**；沒有放寬 gate或新增 dependency。

### 8.2 `window.__importAppModule`

```text
$ rg -o 'window\.__importAppModule' tests | wc -l
110
4C-2 baseline=110
delta=0
```

## 9. Codex 五問

### 1. Restore ownership 是否真的進入 host，且沒有拆散語意？

是。capture、三段 resolve、restore invocation 和 descriptor 型別都在
`SurfaceHost.tsx`；`sheets.js` 只透過 stable registry 做 capture／focus／restore 編排。
capture 仍先於 replacement close，真正 restore 仍在 `onClose` 後。

### 2. C2-2 非抽屜保護與三段 fallback 是否保真？

是。12 行註解逐字搬遷；live node → replacement card → conditional fallback 的順序不變。
既有三段 oracle 全綠，拿掉 replacement 區段會紅；新增非抽屜 oracle 能抓到無條件 drawer
fallback。原 account-settings guard 對該 mutation 不敏感，已在回報中明列，沒有誤報。

### 3. 首幀 focus 與 keyboard trap 是否安全共存？

是。兩者共用唯一 `focusableNodes`；rAF 以 stack membership 判 entry liveness，仍保留
intentional-focus contains guard、第一個 focusable fallback 和 `preventScroll`。專屬 oracle 與
guard mutation 可紅／綠；keyboard handler 與 registry 本體則逐字零 diff。

### 4. 批 4 是否可視為完結？

可以。mountSurface 的 DOM／生命週期／isolation／stack-Escape-Tab／restore-rAF 五類機制本體
均已入 React surface system；凍結面、E 群、七 E2E、mock、local、bundle 全綠。
`sheets.js` 現為公開 API facade、bridge、mount/close 編排、click、unmount、WeakMap 與
`openLoginModal` 等批 6 才處理的殘餘。total gzip 只餘 1,465 B，後續仍需逐批量測。

### 5. 批 5 `syncCommit` 由 2 caller files 降到 0 的建議

目前 source scan：

```text
src/syncCommit.ts:8:export function syncCommit(...)
src/sessionStore.ts:102:            syncCommit(listener);
src/app/SurfaceHost.tsx:251:  syncCommit(update);
```

建議 caller-by-caller 分兩段退役，不要同批直接刪 leaf：

1. `SurfaceHost.tsx` 的退役條件：所有 `mountSurfaceShell` 呼叫端不再依賴函式 return 前 DOM 已
   commit，且 mount／update／unmount 的 imperative handle 能以 React-owned event/state 邊界或
   明確 async contract 表達；需重跑 lifecycle、DOM byte parity、focus／replace／error cleanup。
   若仍有呼叫端同步讀 `surfaceElement` 或立即 portal content，理由書應逐一列出是哪個 public
   adapter、同步觀察點與缺少的替代 handshake，不能只寫「React 需要」。
2. `sessionStore.ts` 的退役條件：`useSyncExternalStore` listener 不再需要在 legacy native event／
   public adapter 回傳前讓 DOM 可立即觀察；先找出 emit 後立刻讀 DOM、焦點、filter/page 狀態的
   callers，改成 React batching 可接受的事件邊界或 awaitable UI handshake，並補 race／focus
   oracle。殘留理由書應列出具體 emit 路徑與同步 DOM 讀取，和 SurfaceHost 分開判定。
3. 每移除一個 caller 就重跑 source scan與對應 focused matrix；兩個 caller 都歸零後才刪
   `syncCommit.ts`、更新 lifecycle allowlist／註解，再跑完整 mock、local、bundle。如此 2→1→0
   每一步都有獨立歸因，不會把兩種不同的同步依賴混成一個 React 19 問題。

## 10. 收尾標準矩陣

### Typecheck

```text
$ npm run typecheck
> tsc --noEmit
EXIT_CODE=0
```

### Lint

```text
$ npm run lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" ...
EXIT_CODE=0
```

### Prettier

```text
$ npm run prettier:check
Checking formatting...
All matched files use Prettier code style!
EXIT_CODE=0
```

### Build

```text
$ npm run build
vite v6.4.3 building for production...
✓ 508 modules transformed.
dist/assets/index-v_nk1RSY.js  638.94 kB │ gzip: 187.46 kB
✓ built in 1.42s
EXIT_CODE=0
```

### Unit／mock

```text
$ npm run test:session-unit
# tests 346
# pass 346
# fail 0
# skipped 0
# duration_ms 3565.714584
EXIT_CODE=0

$ npm run test:mock
# unit phase: tests 346 / pass 346 / fail 0

4 skipped
298 passed (53.6s)
EXIT_CODE=0
```

沒有 flake，沒有重跑豁免。

### Local

未撞資料污染，未 reset。

```text
$ npm run test:local
# local API
# tests 2
# pass 2
# fail 0

# Supabase Chromium
11 skipped
45 passed (1.5m)
EXIT_CODE=0
```

`tests/session.spec.js:218` 在此矩陣實跑通過。

### Diff check

```text
$ git diff --check
(no output)
EXIT_CODE=0
```

## 11. 最終 hashes、未做與 BLOCKED

```text
a8c89c3d5155051c593684b7ee2bbd75f5f2c4cf7b635928d9c88e79a72ef595  src/app/SurfaceHost.tsx
5dfb7ae992f495640e5fda45ab821f8f09c773573b07743737b713a90be341f7  src/sheets.js
61f296ef88662e96392153783a36b5f485a5b6c601cf2a3763346f43a2fda486  tests/sheets-dom.test.js
```

- 未做：批 5 `syncCommit` 退役、批 6 TS 化、14 sheet content／views、UX／文案／CSS、
  dependency 與 bundle gate 調整。
- 疑義：無。僅提醒 total gzip 最終餘裕為 1,465 B。
- BLOCKED：無。
- Git：未 commit、未 push；working tree 留給驗收方。
