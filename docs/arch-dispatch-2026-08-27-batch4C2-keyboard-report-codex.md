# 批 4C-2 回報：surface stack＋topmost Escape＋Tab trap 遷入 React surface system

- 日期：2026-08-27
- 派工單：`docs/arch-dispatch-2026-08-27-batch4C2-keyboard.md`
- 開工 HEAD：`8742c9f`；working tree 乾淨。
- 4C-1 accepted 基準：`05635c9`。
- 結果：完成，無 BLOCKED；未 commit、未 push。
- 修改面：`.claude/rules/react-migration.md`、`src/app/SurfaceHost.tsx`、
  `src/sheets.js`、`tests/sheets-dom.test.js`，以及本回報文件。

## 1. 結論與計畫檢視

計畫的責任切分可行，沒有需要改派工範圍的架構問題。surface stack、top lookup、單一
document capture listener、Escape 與 Tab trap 已移入 `SurfaceHost.tsx`；restore chain 與
首幀 rAF 仍留在 `sheets.js`，沒有提前做 4C-3。

實作中發現一個 harness module identity 細節：happy-dom 測試以 Vite query 載入
`SurfaceHost.tsx`，但以 Node URL query 載入另一份 `sheets.js` instance；只依
SurfaceHost module-init bridge 時，測試 instance 會報：

```text
Error: Surface keyboard registry is unavailable.
```

因此 test harness 與既有 shell renderer 一樣，明確注入該次 host instance 的
`surfaceKeyboardRegistry`。production 仍由 eager `SurfaceHost.tsx` module init 一次性安裝，
沒有新增 App/main 接線或 runtime fallback。

此外，最後 code review 把 registry unavailable guard 提前到 shell mount 與 isolation acquire
之前；bridge 若真的缺失會 fail closed，不留下半掛載 DOM 或 isolation。

## 2. 三步原子遷移與 parity 錨點

開工前重驗：

```text
$ node --test tests/sheets-dom.test.js
# tests 8
# pass 8
# fail 0
```

### 2.1 先搬 stack

- `surfaceKeyboardStack`、push、splice 與 `at(-1)` top lookup 搬到
  `SurfaceHost.tsx`，與 `shellRegistry` 同模組。
- `sheets.js` 透過 configure bridge 登記 entry／取得 idempotent unregister callback，沒有
  靜態 import TSX。
- 此階段 imperative listener 暫留原位；處理上述 harness instance 注入後 parity：

```text
$ node --test tests/sheets-dom.test.js
# tests 8
# pass 8
# fail 0
```

### 2.2 再搬單一 listener 與 Escape

- module-level stable `onSurfaceKeyDown` 成為唯一 surface keyboard handler。
- stack 由 0→1 時安裝 `document.addEventListener("keydown", ..., true)`；1→0 時以同一
  function identity 移除。
- Escape 分支搬入，Tab 分支此中間態仍暫留原 owner；parity：

```text
$ node --test tests/sheets-dom.test.js
# tests 8
# pass 8
# fail 0
```

### 2.3 最後搬 Tab trap

- `FOCUSABLE_SELECTOR`、hidden 過濾、首尾 wrap 與零 focusable fallback 搬入 host。
- `sheets.js` 的同名 helper只保留給凍結的首幀 rAF 使用。
- 完成第三步、尚未增加新 oracle 時 parity：

```text
$ node --test tests/sheets-dom.test.js
# tests 8
# pass 8
# fail 0
```

最終加入缺口 oracle 與 hardening oracle 後：

```text
$ node --test tests/sheets-dom.test.js
# tests 14
# pass 14
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

## 3. Registry、entry shape 與 listener 時序

entry shape 位於 `src/app/SurfaceHost.tsx:43-48`：

```text
{
  close(options?): void,
  onEscape?: () => unknown,
  restoreFocus: unknown,
  surface: HTMLElement
}
```

- `close`：Escape 未被短路時同步關閉 top entry。
- `onEscape`：保留 confirming 等「先退一步」語意。
- `surface`：Tab trap 永遠讀 top entry 的 committed element。
- `restoreFocus`：本批只承載；供 4C-3 搬移 restore ownership 時沿用。

安裝／關閉時序：

```text
mount
  → fail-closed 檢查 shell renderer＋keyboard registry
  → mount shell
  → acquire isolation
  → registry.register(entry)
       → stack.push(entry)
       → 若原 stack 為空，安裝唯一 capture listener
  → surfaces.set(root, entry)

close
  → closed idempotent guard
  → unregister keyboard entry
       → stack.splice(entry)
       → 若 stack 已空，移除唯一 capture listener
  → releaseIsolation
  → content unmount
  → shell unmount
  → surfaces.delete／onClose／restore
  → 重拋錯誤
```

source 反掃只有 host 兩處 surface keydown owner，`sheets.js` 為零：

```text
src/app/SurfaceHost.tsx:119: document.addEventListener("keydown", onSurfaceKeyDown, true)
src/app/SurfaceHost.tsx:126: document.removeEventListener("keydown", onSurfaceKeyDown, true)
```

replace 同 root 仍先 close 舊 entry；若它是唯一 entry，會同步 remove，再為 replacement 同步
add。兩層 stack 中替換其中一層時，另一 entry 使 listener 持續存在。unregister callback 本身
idempotent，close 重入不會二次 splice/remove。

## 4. Escape 與 Tab 字面語意自證

`src/app/SurfaceHost.tsx:78-110` 的 Escape 次序為：

```text
top entry = surfaceKeyboardStack.at(-1)
→ event.preventDefault()
→ opener 首幀焦點理由註解
→ event.stopPropagation()
→ 批 C3-2 逃生口註解
→ if (entry.onEscape?.()) return
→ entry.close()
```

兩段既有註解均隨碼搬遷，沒有刪改：

```text
// The opener can still own focus until this surface's first animation
// frame. Consume Escape here so that same event cannot close an
// underlying drawer after this top surface restores its opener.

// 批 C3-2:join 單層化——sheet 內部可以有自己的「先退一步」語意(例如
// confirming 態的 Escape 應該退回 idle,而不是整張 sheet 關掉)。onEscape
// 若回傳 true 代表呼叫端已經自行處理過這次 Escape,這裡就不再呼叫 close()。
```

Tab 語意仍為：

- 以 `FOCUSABLE_SELECTOR` 查 top entry 的 `surface`。
- 排除自身有 `hidden` 或位於 `[hidden]` ancestor 的節點。
- Shift+Tab 在第一個節點 wrap 到最後一個；Tab 在最後一個 wrap 到第一個。
- 零 focusable 時 `preventDefault()` 並 `surface.focus()`。

## 5. Oracle 覆蓋盤點

| 語意                  | 開工時 sheets-dom                   | 本批結果                                                              |
| --------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| topmost Escape        | 既有「Escape 只關閉最上層 surface」 | 保留原斷言，補 `finally` 只作 canary cleanup                          |
| `onEscape` 同步短路   | 無專屬 sheets-dom                   | 新增；驗 callback 一次、default prevented、surface 留存               |
| Tab 首尾循環          | 既有                                | 保留雙向 reference-equality 斷言；先 cleanup 再回報 assertion failure |
| hidden 排除           | 無專屬 oracle                       | 新增 direct hidden＋hidden ancestor，雙向 wrap                        |
| 零 focusable fallback | 無專屬 oracle                       | 新增 default prevented＋activeElement 是 surface                      |

另新增三個對稱／加固 oracle：

- surface 開啟時 document bubble probe 收不到 Escape；全部關閉後收到未
  `defaultPrevented` 的 Escape。
- replace→close 的 capture listener add/remove 為 `2/2`，關閉後 Escape 不再 consume。
- content 與 shell unmount 同時拋錯時，仍完成 onClose、restore、registry cleanup，並以
  `AggregateError` 保存兩個原錯誤；之後能重新 mount/close。

unit aggregate 由 338 增至 344，正好增加 6 個 top-level/subtest 計數。

## 6. Mutation canary 四組三拍

canary 修改前、每次還原後與最終的 `src/app/SurfaceHost.tsx` SHA-256 均為：

```text
7a7435f85966935375d8c6da62d6ec7dd576f718feff39b9af3038a0909f7d20  src/app/SurfaceHost.tsx
```

### 6.1 Canary A：`at(-1)` 改為 `[0]`

紅（exit 1）：

```text
# Subtest: Escape 只關閉最上層 surface
not ok 3 - Escape 只關閉最上層 surface
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    + '<div class="surface-backdrop" ... 上層 ...</section>'
    - ''

# tests 14
# pass 12
# fail 2
EXIT_CODE=1
```

還原後綠（exit 0）：

```text
# Subtest: Escape 只關閉最上層 surface
ok 3 - Escape 只關閉最上層 surface
# tests 14
# pass 14
# fail 0
EXIT_CODE=0
```

第一次注入會讓被錯誤保留的 dialog 殘留；因此既有 test 加上 `finally` 關閉兩個 handle，
斷言本身未弱化。重新注入後取得上述可終止的紅燈。

### 6.2 Canary B：同時移除 `preventDefault`＋`stopPropagation`

命令：

```text
TENNIS_TEST_HARNESS_MODE=mock npx playwright test \
  tests/session-lifecycle-smoke.spec.js --project=desktop-chromium \
  --grep 'a top sheet consumes Escape'
```

紅（exit 1）：

```text
1) [desktop-chromium] › tests/session-lifecycle-smoke.spec.js:341:1
   › a top sheet consumes Escape before the underlying nearby drawer

Expected: "true"
Received: "false"

1 failed
EXIT_CODE=1
```

還原後綠（exit 0）：

```text
✓ 1 [desktop-chromium] › tests/session-lifecycle-smoke.spec.js:341:1
  › a top sheet consumes Escape before the underlying nearby drawer
1 passed (1.1s)
EXIT_CODE=0
```

### 6.3 Canary B'：只移除 `stopPropagation`

紅（exit 1）：

```text
# Subtest: surface Escape 阻斷 bubble，全部關閉後不再 consume
not ok 8 - surface Escape 阻斷 bubble，全部關閉後不再 consume
  error: |-
    Expected values to be strictly equal:

    1 !== 0

  expected: 0
  actual: 1

# tests 14
# pass 12
# fail 2
EXIT_CODE=1
```

還原後綠（exit 0）：

```text
# Subtest: surface Escape 阻斷 bubble，全部關閉後不再 consume
ok 8 - surface Escape 阻斷 bubble，全部關閉後不再 consume
# tests 14
# pass 14
# fail 0
EXIT_CODE=0
```

### 6.4 Canary C：Tab 首尾 wrap target 對調

紅（exit 1）：

```text
# Subtest: sheet 將 Tab 焦點限制在第一個與最後一個可互動控制項
not ok 5 - sheet 將 Tab 焦點限制在第一個與最後一個可互動控制項
  error: Expected "actual" to be reference-equal to "expected"

# Subtest: Tab trap 排除自身與祖先帶 hidden 的控制項
not ok 6 - Tab trap 排除自身與祖先帶 hidden 的控制項
  error: Expected "actual" to be reference-equal to "expected"

# tests 14
# pass 11
# fail 3
EXIT_CODE=1
```

還原後綠（exit 0）：

```text
# Subtest: sheet 將 Tab 焦點限制在第一個與最後一個可互動控制項
ok 5 - sheet 將 Tab 焦點限制在第一個與最後一個可互動控制項
# Subtest: Tab trap 排除自身與祖先帶 hidden 的控制項
ok 6 - Tab trap 排除自身與祖先帶 hidden 的控制項
# tests 14
# pass 14
# fail 0
EXIT_CODE=0
```

## 7. 4C-1 加固項交付

### 7.1 `shell.unmount()` try/finally 與錯誤保存

`src/sheets.js:89-110`：content error 先暫存；shell error 另行暫存；shell 的 finally 必做
`surfaces.delete`、`onClose`、restore。單一錯誤原樣重拋；兩個錯誤同時存在時以
`AggregateError([content, shell])` 保留兩者，沒有吞錯。

專屬 oracle 實際讓兩個 unmount 都拋錯，並驗：

```text
AggregateError.errors = ["content unmount failed", "shell unmount failed"]
onClose calls = 1
document.activeElement = opener
後續 replacement mount/close = success
```

### 7.2 `closeSurface` else 不可達註解

`src/sheets.js:136-137` 已註明：registered React shell 必有 surfaces entry；else 代表沒有
live shell，只清 defensive stale DOM。

### 7.3 React leaf 規則

`.claude/rules/react-migration.md:54` 新增 2026-08-27 規則：

- 非空 legacy HTML 走 `dangerouslySetInnerHTML`。
- React content 只 portal 到該模板建立的 descendant。
- 直接以 section 為 portal target 時必須 `html: ""`，不可同時宣告 children/dangerous HTML。

這是 React 19 dev console error／zero-console-error oracle 的正式防線；沒有把它誤記為
production runtime 行為。

## 8. Bundle 與 importer 對帳

### 8.1 Production bundle

4C-1 accepted 基準與本批最終值：

| 指標          |    4C-1 |    4C-2 |   淨值 |    上限 |    最終餘裕 |
| ------------- | ------: | ------: | -----: | ------: | ----------: |
| main raw      | 638,216 | 638,784 | +568 B | 658,867 |    20,083 B |
| main gzip     | 187,214 | 187,359 | +145 B | 192,420 |     5,061 B |
| total JS raw  | 840,840 | 841,408 | +568 B | 849,961 |     8,553 B |
| total JS gzip | 257,359 | 257,545 | +186 B | 259,062 | **1,517 B** |

逐字 gate 摘要：

```text
$ npm run check:production-bundle
production bundle check passed: development E2E hook present, production E2E hook absent;
32 files, 12 demo identifiers absent; main 638784/187359 within 658867/192420;
largest app lazy MySessionsPage-C6VKuy9M.js 16476/4830 within 18000/5500;
total JS 841408/257545 within 849961/259062;
private repository: privateDataRepository-H6OIK6H2.js;
Sentry: sentryBrowserSdk-Czz5dmkg.js
EXIT_CODE=0
```

total gzip 增加 186 B，仍有 1,517 B；未放寬任何 gate，未新增 dependency。

### 8.2 `window.__importAppModule`

```text
$ rg -o 'window\.__importAppModule' tests | wc -l
110
4C-1 baseline=110
delta=0
```

## 9. 凍結面自證

以下命令 exit 0、無輸出：

```text
git diff --exit-code -- \
  tests/react-unmount.spec.js tests/performance.spec.js \
  tests/session-lifecycle-smoke.spec.js tests/chat-settings-filters-smoke.spec.js \
  tests/auth-forms-smoke.spec.js tests/account-settings-smoke.spec.js \
  tests/discovery-interactions-smoke.spec.js src/modalIsolation.js src/views \
  src/sheets src/sessionViews.js src/app/App.tsx

git diff --exit-code -- tests/react-surface-lifecycle.test.js
```

因此：

- 七份指定 e2e spec 原檔零 diff；完整 desktop matrix 為 `122 passed／2 skipped`。
- `modalIsolation.js`、4 個 views、14 個 sheet content、`sessionViews.js`、`App.tsx` 零 diff。
- lifecycle test 的 E/A/B/C/D/F 群整檔零 diff；D 群 AppShell popover oracle 未動。
- `git diff -U0 -- src/sheets.js` 在 `captureRestoreTarget`／`resolveRestoreTarget` 與
  `requestAnimationFrame` 區段沒有 hunk；C2-2 fallback 鏈、restore 呼叫與首幀 rAF 行為零 diff。
- stack unregister 仍在 `releaseIsolation()` 與 content unmount 之前。
- dismiss／close click 綁定、`surfaces` WeakMap、公開 handle、UX／文案／CSS均未改。

七份 frozen E2E：

```text
$ npx playwright test tests/react-unmount.spec.js tests/performance.spec.js \
  tests/session-lifecycle-smoke.spec.js tests/chat-settings-filters-smoke.spec.js \
  tests/auth-forms-smoke.spec.js tests/account-settings-smoke.spec.js \
  tests/discovery-interactions-smoke.spec.js --project=desktop-chromium

2 skipped
122 passed (1.2m)
EXIT_CODE=0
```

## 10. Codex 五問

### 1. keyboard owner 是否真的單一化？

是。stack 與 stable handler 只存在於 `SurfaceHost.tsx`；source scan 只有首 entry add、末 entry
remove 兩行，`sheets.js` 不再建立 per-surface keydown closure/listener。

### 2. topmost、confirming 與穿透語意是否保真？

是。Escape 字面順序與兩段註解完整搬移；topmost、同步 `onEscape`、bubble probe、drawer
穿透 e2e 四層 oracle 都綠，且 A/B/B' 三個 canary 分別能精準打紅。

### 3. Tab trap 是否只換 owner、沒有換語意？

是。selector 與兩個 hidden 條件相同；雙向首尾、hidden、zero fallback oracle 均綠，對調
wrap target 會讓兩個 reference oracle 同時紅。

### 4. close hardening 與範圍是否安全？

是。unregister 先於 isolation/content；shell error 不阻 cleanup；雙錯誤都保留。凍結 source、
七 e2e 與 lifecycle 群零 diff。bundle 未超 gate，但 total gzip 餘裕已由 1,703 B 降至
1,517 B，後續批次仍應把它視為高風險預算。

### 5. 對 4C-3 restore focus 遷移的建議

建議把 `captureRestoreTarget`、`resolveRestoreTarget` 與 restore invocation 視為一個不可拆的
語意單元再搬，尤其逐字保留 C2-2 修法：只有 `target.drawerId` 存在時，才允許 fallback 到
drawer collapse/toggle；非抽屜 surface 不得被送到 drawer toggle。

`previousFocus` 已在 keyboard entry 中承載，4C-3 可讓 host registry entry 持有強型別的
restore descriptor，但不要在 keyboard handler 內解析它。replace 必須先繼承舊 entry 的
`restoreFocus`，再以 `restoreFocus: false` 關舊 surface；真正 close 時仍要在 shell cleanup／
`onClose` 後 resolve＋focus。首幀 rAF 與 trap 共用的 focusable 規則可在 4C-3 單一來源化，
但必須保留「使用者已主動移動焦點就不覆寫」guard，並用 `session.spec.js:218`、drawer card
消失 fallback、非 drawer report 三種 oracle 驗證。

## 11. 收尾矩陣

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
dist/assets/index-DkTXURz9.js  638.78 kB │ gzip: 187.36 kB
✓ built in 1.16s
EXIT_CODE=0
```

### Unit／mock

```text
$ npm run test:session-unit
# tests 344
# pass 344
# fail 0
# skipped 0
EXIT_CODE=0

$ npm run test:mock
# unit phase: tests 344 / pass 344 / fail 0

4 skipped
298 passed (50.3s)
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

`tests/session.spec.js:218` 的 anonymous Join→confirmation→Escape 兩段流程在此矩陣實跑通過。

### Diff check

```text
$ git diff --check
(no output)
EXIT_CODE=0
```

## 12. 最終 hashes、未做與 BLOCKED

```text
7a7435f85966935375d8c6da62d6ec7dd576f718feff39b9af3038a0909f7d20  src/app/SurfaceHost.tsx
9a243a2e6e83c14192911bb8ff2032e5040ba76991f7a23131cae396600e19bb  src/sheets.js
9e86f6a2e76d0f58f329740b512d115b103038ff376f5c87051c5d1f866f1be1  tests/sheets-dom.test.js
```

- 未做：4C-3 restore/rAF 遷移、批 5 syncCommit 退役、14 sheet content／views、UX／文案／
  CSS、依賴、bundle gate 調整。
- 疑義：無。僅提醒 total gzip 最終餘裕 1,517 B，下一批應持續逐次量測。
- BLOCKED：無。
- Git：未 commit、未 push；working tree 留給驗收方。
