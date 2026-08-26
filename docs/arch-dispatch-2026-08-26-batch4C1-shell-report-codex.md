# 批 4C-1 回報：React shell＋close／replacement／unmount＋isolation

- 日期：2026-08-27
- 派工單：`docs/arch-dispatch-2026-08-26-batch4C1-shell.md`
- 開工狀態：working tree 乾淨；HEAD `7a3f4d338ae1c9e3f48ea2e3199a0539002dca1f`，
  parent 為批 4B accepted `aaab2c5`，其後只有 4C-1 派工與 roadmap 文件 commit。
- 結果：完成，無 BLOCKED；未 commit、未 push。React shell、生命週期、isolation、
  DOM parity 與全部 gate 均通過。

## 1. 計畫疑義與實作決策

### 1.1 React 19 的 portal-target 限制

派工單指定 `section.surface` 以 `dangerouslySetInnerHTML` 渲染，同時 14 個 sheet adapter
與 login content 又會把 React portal 直接掛進該 section。真實 Chromium 首輪驗證發現 React
19.2.8 會把這個組合視為 runtime error：

```text
Cannot use a ref on a React element as a container to `createRoot` or `createPortal`
if that element also sets "dangerouslySetInnerHTML" using React. It should be a leaf
with no children. Otherwise it's ambiguous which children should be used.
```

把空模板改成 React text child 仍不合法，React 會改報 `sets "children" text content`。
最終採以下最小例外，沒有加 wrapper、沒有改最終 DOM：

- 非空 legacy `html` 繼續由 `SurfaceShell` 的 `dangerouslySetInnerHTML` 渲染。
- 所有直接把 `section.surface` 當 portal target 的 React content adapter 都掛入
  `html: ""` 的空殼；空殼 section 不宣告 React children／`dangerouslySetInnerHTML`，
  在同一次同步 React ref commit 補回舊模板的 `"\n      \n    "` 空白文字節點。
- portal target 因而是 React 規定的 leaf；空殼與非空模板的最終序列化 DOM 都仍與舊版逐 byte 相同。

反掃 14 adapter 的 loaded mount 與 `openLoginModal`：直接 portal 進 section 的路徑都使用
`html: ""`；唯一非空 loaded template 是 Session Detail，它把 portal 掛進 dangerous HTML
建立的 `.session-detail` descendant，而非把帶 dangerous props 的 section 當 target。其餘非空
`html` 是 loading／legacy template。修正後 auth login targeted e2e `1 passed`，完整 frozen e2e
`122 passed／2 skipped`，不再有上述 runtime error。

### 1.2 `sheets.js` 不可直接 import TSX

`sheets.js` 仍被 Node 測試與 legacy module graph 直接匯入。若它靜態 import
`SurfaceHost.tsx`，Node-only 路徑會被迫解析 TSX。實作改用一次性 bridge：

```text
SurfaceHost.tsx module init
  → configureSurfaceShellRenderer(mountSurfaceShell)
  → sheets.js 保存 renderer function
  → mountSheet/mountDialog 同步呼叫 renderer
```

production 的 eager `App.tsx` 會載入 `SurfaceHost.tsx` 並完成安裝；Node happy-dom harness
則明確注入該 test module instance 的 `mountSurfaceShell`。沒有改 `main.js` 或 App 的公開接線。

## 2. React shell 渲染設計

### 2.1 Registry shape 與單一 root

`SurfaceHost.tsx` 新增：

```text
shellRegistry: Map<rootElement, {
  id: number,
  props: Readonly<{ className, html, id, label }>,
  rootElement
}>
```

- 每次 mount 以 `Object.freeze` 建立新 props；沒有 update API，per-mount props 不可變。
- shell 同樣登記到既有 `slots` Map，`SurfaceHost` 以 portal 渲染 backdrop＋section；
  14 個既有 content slot 仍使用同一 Map、同一 App root。
- shell 先同步 commit，`mountSurface` 才查詢 `.surface`；content portal 隨後掛進已存在的
  section。關閉時反向先卸載 content slot，再卸載 shell slot。
- `mountSurfaceContent` 的 `render`／`unmount`／`commit`／`isSurfaceRootLive` 實作與契約未改。

### 2.2 同步 commit 路徑

```text
mountSheet/mountDialog
  → mountSurface
  → mountReactSurfaceShell(root, frozen shell props)
  → slots.set(root, shell slot)
  → commitSynchronously(commitSurfaceSlots)
  → syncCommit(renderApp)
  → query live .surface
  → return { root, surface, close, registerUnmount }
```

`commitSynchronously(update)` 與 `commitSynchronously(commitSurfaceSlots)` 兩個 A 群要求字面
仍存在。`syncCommit` caller 白名單沒有新增檔案。

### 2.3 `[data-surface-close]` 綁定範圍

維持舊語意：shell commit 後只做一次
`root.querySelectorAll("[data-surface-close]")` 並綁定當下 template 節點；沒有改 delegation。

反掃證據顯示 14 個 React sheet 元件內共有 17 個 `data-surface-close` 出現處，另有 login
React content 1 處；這些按鈕都已有自己的 React `onClick`。若改 delegation，會把原本未被殼
listener 綁定的 18 個 React content 節點納入觸發面，因此不能宣稱等價。`sessionViews.js:483`
的 loading template close button 則仍在 mount 當下被原範圍綁到。

## 3. 生命週期逐步對照

| 順序 | 舊實作 | 新實作 | 結果 |
| ---: | --- | --- | --- |
| 1 | `if (closed) return` | 同一 guard | closed 冪等 |
| 2 | remove capture keydown | 原碼原位 | 語意不變 |
| 3 | splice `surfaceStack` | 原碼原位 | 語意不變 |
| 4 | `releaseIsolation()` | 原碼原位 | 先 release，再卸載 |
| 5 | `unmountContent?.()`，catch 暫存 | 原碼原位 | content cleanup 仍看得到殼 |
| 6 | `root.innerHTML = ""` | `shell.unmount()` 同步 React commit | React 銷毀殼 |
| 7 | `surfaces.delete(root)` | 原碼原位 | registry handle 失效 |
| 8 | `onClose({ reason })` | 原碼原位 | callback 時 DOM 已銷毀 |
| 9 | resolve／focus restore | 原碼原位 | 4C-3 前不搬 |
| 10 | rethrow `unmountError` | 原碼原位 | 錯誤不吞 |

- `registerUnmount` 在 closed 後收到 callback 時仍立即呼叫。
- replace 仍先繼承 `active.restoreFocus`，以 `{ reason: "replace", restoreFocus: false }`
  關舊殼；舊 isolation release 後，新殼再 acquire。
- `onMount` 呼叫點、首幀 rAF focus、capture `onKeyDown`、topmost 判定、Escape consume、
  Tab trap、`captureRestoreTarget`／`resolveRestoreTarget` 全部保持原碼與原位置。

## 4. DOM parity 逐字輸出

同一組 options 分別在改動前基線與 React shell 執行，兩側輸出逐字一致；測試已固化於
`tests/sheets-dom.test.js`。

### Sheet：className＋onEscape＋互動 html

```text
BASELINE SHEET="\n    <div class=\"surface-backdrop\" data-surface-dismiss=\"\"></div>\n    <section id=\"sheet<&amp;&quot;\" data-testid=\"sheet<&amp;&quot;\" class=\"surface surface--sheet extra\" role=\"dialog\" aria-modal=\"true\" aria-label=\"標籤<&amp;&quot;\" tabindex=\"-1\">\n      <button type=\"button\" data-surface-close=\"\">關閉 &amp; 繼續</button>\n    </section>"
REACT   SHEET="\n    <div class=\"surface-backdrop\" data-surface-dismiss=\"\"></div>\n    <section id=\"sheet<&amp;&quot;\" data-testid=\"sheet<&amp;&quot;\" class=\"surface surface--sheet extra\" role=\"dialog\" aria-modal=\"true\" aria-label=\"標籤<&amp;&quot;\" tabindex=\"-1\">\n      <button type=\"button\" data-surface-close=\"\">關閉 &amp; 繼續</button>\n    </section>"
```

### Dialog：className＋onEscape＋空 html

```text
BASELINE DIALOG="\n    <div class=\"surface-backdrop\" data-surface-dismiss=\"\"></div>\n    <section id=\"empty-dialog\" data-testid=\"empty-dialog\" class=\"surface surface--dialog auth-dialog\" role=\"dialog\" aria-modal=\"true\" aria-label=\"空白對話框\" tabindex=\"-1\">\n      \n    </section>"
REACT   DIALOG="\n    <div class=\"surface-backdrop\" data-surface-dismiss=\"\"></div>\n    <section id=\"empty-dialog\" data-testid=\"empty-dialog\" class=\"surface surface--dialog auth-dialog\" role=\"dialog\" aria-modal=\"true\" aria-label=\"空白對話框\" tabindex=\"-1\">\n      \n    </section>"
```

屬性順序由 JSX 明列為 `id`→`data-testid`→`class`→`role`→`aria-modal`→`aria-label`→
`tabindex`；`ref` 與 content props 不序列化成 attribute。backdrop 與 section 之間及 section
內部空白用明確文字節點保留，因此 happy-dom 的 `innerHTML` byte-identical assertion 可直接鎖定。

## 5. Harness 與 oracle

### 5.1 happy-dom React harness 隔離策略

- 使用 `happy-dom`＋`react-dom/client.createRoot`＋live `SurfaceHost`，未用 static markup。
- 一個 middleware Vite server 轉換 TSX；`hmr: false`，不開 websocket。
- 每 case 對 `SurfaceHost.tsx?dom-test=N` 與 `sheets.js?dom-test=N` 使用不同 module identity；
  query 版 sheets 明確注入同 case host renderer。
- 每 case 重新建立 DOM、React root、renderer；cleanup 在 `act` 內 unmount root，再還原 globals。
- rAF 仍是同步 shim；`#app` 內含 sheet/modal/toast 與可驗 isolation 的 siblings。

### 5.2 五條既有 oracle 語意

以下五條未弱化，全部改為操作 React 已 commit 的 live DOM：

1. close 時 registered content unmount 仍看得到 `.surface`，之後 root 才空。
2. content unmount 拋錯時殼仍清空，原錯誤重拋。
3. Escape 只關 topmost dialog，再一個 Escape 才關底層 sheet。
4. Tab／Shift+Tab 在首尾 control 雙向循環。
5. restore focus 依序命中新卡、drawer collapse、drawer toggle 三段 fallback。

新增 isolation oracle 兩路徑：open→close 與 open→replace→close。它同時保留原本已帶
`inert` 的 sibling，並驗 page/modal sibling 在 release 後精確回到 `null`、toast 永不 inert。

最終 targeted 輸出：

```text
$ node --test tests/sheets-dom.test.js
# tests 8
# suites 0
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

## 6. Mutation canary 三拍

兩次 canary 前後 `src/sheets.js` SHA-256 均為：

```text
ca3faa956360df39c92cf37ca3fc651432af09a2b41a5ee6be6d67f7c64e256c  src/sheets.js
```

### 6.1 Canary A：把 `shell.unmount()` 移到 content unmount 前

紅（exit 1）：

```text
# Subtest: 關閉 sheet 時先卸載內容再清空殼
not ok 1 - 關閉 sheet 時先卸載內容再清空殼
  error: |-
    Expected values to be strictly equal:

    false !== true
  expected: true
  actual: false

# tests 8
# pass 6
# fail 2
EXIT_CODE=1
```

還原後雜湊相同，綠（exit 0）：

```text
# Subtest: 關閉 sheet 時先卸載內容再清空殼
ok 1 - 關閉 sheet 時先卸載內容再清空殼

# tests 8
# pass 8
# fail 0
EXIT_CODE=0
```

### 6.2 Canary B：移除 close 路徑的 `releaseIsolation()`

紅（exit 1）：

```text
$ node --test --test-name-pattern='surface isolation' tests/sheets-dom.test.js
# Subtest: surface isolation 在關閉與替換後 acquire/release 平衡
not ok 1 - surface isolation 在關閉與替換後 acquire/release 平衡
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
      [
        [
          'page-content',
    +     ''
    -     null
        ],
        ...
        [
          'modal-root',
    +     ''
    -     null
        ]
      ]
# tests 1
# pass 0
# fail 1
EXIT_CODE=1
```

還原後雜湊相同，綠（exit 0）：

```text
$ node --test --test-name-pattern='surface isolation' tests/sheets-dom.test.js
ok 1 - surface isolation 在關閉與替換後 acquire/release 平衡
1..1
# tests 1
# pass 1
# fail 0
EXIT_CODE=0
```

## 7. E 群改寫前後

Before：

```js
const unmount = SURFACES.indexOf("unmountContent?.();");
const clearDom = SURFACES.indexOf('root.innerHTML = "";', unmount);
assert.ok(clearDom > unmount, "surface close clears DOM before React can clean up");
```

After：

```js
const unmount = SURFACES.indexOf("unmountContent?.();");
const destroyShell = SURFACES.indexOf("shell.unmount();", unmount);
assert.ok(destroyShell > unmount, "surface close destroys its React shell before content can clean up");
```

closed guard 與 `{ root, surface, close, registerUnmount }` shape 兩條仍保留。A/B/C/D/F 群未改。

## 8. Bundle 對照

| 指標 | 4B accepted | 4C-1 | 淨值 | gate／餘裕 |
| --- | ---: | ---: | ---: | --- |
| main raw | 637,109 | 638,216 | +1,107 B | ≤658,867，通過 |
| main gzip | 186,862 | 187,214 | +352 B | ≤192,420，餘 5,206 B |
| total JS raw | 839,733 | 840,840 | +1,107 B | ≤849,961，通過 |
| total JS gzip | 257,010 | 257,359 | +349 B | ≤259,062，餘 1,703 B |

largest app lazy 仍是 MySessionsPage `16,476／4,827`，未超 `18,000／5,500`。殼共用碼
進 main，因此 main 與 total raw 同增 1,107 B；所有 gate 未調整。

## 9. 死碼、計數與凍結面

### 9.1 dead export 與 importer

```text
$ rg -n '\b(closeSheet|closeModal)\b' --glob '!docs/**' .
(no output)
exit 1  # rg 無 match

window.__importAppModule=110
4B baseline=110
delta=0
```

### 9.2 frozen diff

以下命令 exit 0、無輸出：

```text
git diff --exit-code -- \
  tests/react-unmount.spec.js tests/performance.spec.js \
  tests/session-lifecycle-smoke.spec.js tests/chat-settings-filters-smoke.spec.js \
  tests/auth-forms-smoke.spec.js tests/account-settings-smoke.spec.js \
  tests/discovery-interactions-smoke.spec.js src/modalIsolation.js src/views \
  src/sheets src/sessionViews.js src/app/App.tsx
```

- 七份指定 e2e spec 原檔零 diff；其完整 desktop matrix 為 `122 passed／2 skipped`。
- `modalIsolation.js`、4 個 `src/views/*.js`、14 個 `src/sheets/*.tsx`、`sessionViews.js`、
  `App.tsx` 原檔零 diff。
- `deferSurfaceOpen`、14 content adapters、`onKeyDown`、restore chain、rAF focus 均未修改。
- `commitSynchronously(update)=true`；`commitSynchronously(commitSurfaceSlots)=true`。
- `mountSheet`／`mountDialog` 公開簽名、options 與 return shape、`openLoginModal` 無 return 均保留。

## 10. Codex 五問

### 1. 殼是否真的由 React 擁有，且回傳時 DOM 已 live？

是。registry slot 由 `SurfaceHost` portal 渲染，且只經既有 `commitSynchronously`→`syncCommit`
路徑；DOM oracle 在 mount 返回後立即查到 surface/buttons，14 adapters 與 views 的同步呼叫全綠。

### 2. close／replace／unmount／isolation 時序是否保真？

是。逐步對照只把 `root.innerHTML = ""` 換成同步 `shell.unmount()`；content cleanup、onClose、
restore 與錯誤重拋順序不變。兩個 mutation canary 分別證明卸載順序與 release 平衡不是假綠。

### 3. DOM 與事件觸發面是否擴大？

沒有。sheet＋dialog 的 exact `innerHTML` 逐 byte 相同；`data-surface-close` 仍只在 mount 後查
一次，沒有 delegation，因此 React content 的 18 個同名節點仍只走各自 React onClick。

### 4. 成本與例外是否透明？

是。main gzip +352 B、total gzip +349 B，總量餘裕只剩 1,703 B。React 19 不允許 portal
target 同時宣告 dangerous HTML／text child，因此空殼以 ref commit 補原 whitespace；非空模板仍
走 `dangerouslySetInnerHTML`。這是為同時滿足無 runtime error、無 wrapper 與 byte parity 的必要例外。

### 5. 對 4C-2 stack／Escape／trap 遷移的建議

建議讓現有 shell registry 成為唯一 stack source，並以一個穩定的 document capture listener
讀取 top entry；不要讓每個 React shell 各自裝 effect listener，也不要暫時保留雙 listener。
註冊與解除必須維持同步 mount/close 契約：第一個 entry 時安裝、最後一個移除。

4C-2 的原子順序建議：

1. 先搬 stack push/splice 與 top lookup，保留 imperative listener 行為作 parity canary。
2. 再把單一 capture listener owner 移入 SurfaceHost module；逐字保留 Escape 的
   `preventDefault`→`stopPropagation`→同步 `onEscape?.()` consume→close。
3. 最後搬 Tab trap，直接使用 top entry 的 committed `surface` 與現有
   `FOCUSABLE_SELECTOR`；保留 hidden filtering、首尾循環、零 control focus surface。
4. 4C-3 前不碰 capture/resolve restore 與 rAF focus。

必要 canary：兩層只關頂層；confirming 第一次 Escape 只回 idle；同一 Escape 不得穿透 drawer；
Tab/Shift+Tab 首尾；hidden 排除；零 control fallback；replace 後舊 entry/listener 不得殘留。

## 11. 收尾矩陣逐字輸出

### Typecheck／lint／Prettier／whitespace

```text
$ npm run typecheck
> tsc --noEmit
exit 0

$ npm run lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts
exit 0

$ npm run prettier:check
Checking formatting...
All matched files use Prettier code style!
exit 0

$ git diff --check
(no output)
exit 0
```

### Unit

```text
$ npm run test:session-unit
1..332
# tests 338
# suites 0
# pass 338
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3513.2855
exit 0
```

### 指定 frozen e2e matrix

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test \
  tests/react-unmount.spec.js tests/performance.spec.js \
  tests/session-lifecycle-smoke.spec.js tests/chat-settings-filters-smoke.spec.js \
  tests/auth-forms-smoke.spec.js tests/account-settings-smoke.spec.js \
  tests/discovery-interactions-smoke.spec.js --project=desktop-chromium

2 skipped
122 passed (26.3s)
exit 0
```

### 完整 mock

```text
$ npm run test:mock
# unit phase: tests 338 / pass 338 / fail 0

4 skipped
298 passed (52.0s)
exit 0
```

### Build／production bundle

```text
$ npm run build
vite v6.4.3 building for production...
✓ 508 modules transformed.
dist/assets/index-BEh3L-pw.js  638.22 kB │ gzip: 187.21 kB
✓ built in 1.18s
exit 0

$ npm run check:production-bundle
production bundle check passed: development E2E hook present, production E2E hook absent;
32 files, 12 demo identifiers absent; main 638216/187214 within 658867/192420;
largest app lazy MySessionsPage-D5X7PqBZ.js 16476/4827 within 18000/5500;
total JS 840840/257359 within 849961/259062;
private repository: privateDataRepository-DTBKSfGL.js;
Sentry: sentryBrowserSdk-Czz5dmkg.js
exit 0
```

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
45 passed (1.4m)
exit 0
```

## 12. 未做／疑義／BLOCKED

- 未做：4C-2 stack／Escape／Tab trap 遷 React；4C-3 restore focus；批 5 syncCommit 退役；
  14 sheet content、views、`modalIsolation.js`、UX／文案／CSS、依賴與 bundle gate 調整。
- 疑義：派工單把 `dangerouslySetInnerHTML section` 與「React portal 直接進該 section」同時列為
  必要路徑，但 React 19 明確拒絕。已採 §1.1 的空殼 ref-commit 例外並以 frozen auth e2e 證明；
  建議後續派工把「非空 legacy html 走 dangerous、空 portal target 不宣告 children/danger」寫成正式規則。
- BLOCKED：無。
