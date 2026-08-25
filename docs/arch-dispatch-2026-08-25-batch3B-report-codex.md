# Architecture Dispatch Batch 3B 執行回報

- Dispatch：`docs/arch-dispatch-2026-08-25-batch3B.md`
- 執行日期：2026-08-25
- Dispatch baseline：`e6269ce`
- 最後一個實作／測試 commit：`3af51e6`
- 結論：Batch 3B 的四個 React 邊界遷移與 `import.meta.glob` 退役均已完成，完整驗收矩陣通過。
- 發佈狀態：未 push。
- 本回報狀態：依 dispatch 要求保留為未提交檔案，不納入任何實作 commit。

## 執行摘要

本批次完成以下工作：

1. toast 內容與 timeout 狀態移入 `AppShell` React portal；`main.js` 的 `toast(message)` 公開簽名不變。
2. map topbar 的日期 chips、level chip 與 level popover 移入 React；舊 filter feature 的第三個 Escape listener 已移除。
3. bottom navigation 與 live status 移入 React，並由 React snapshot 輸出目前頁面的 `aria-current`。
4. login modal 保留 `mountDialog` 的 shell、focus trap、Escape layering 與 focus restoration，只將內容和 provider 狀態移入 React。
5. 三組 `import.meta.glob` bridge 退役，改成兩個 eager static imports 與一個明確的 lazy dynamic-import map。
6. frozen lifecycle 掃描改成驗證新 loader 結構，並新增 AppShell a11y contract 靜態防線。

沒有修改既有 Playwright spec，也沒有更動 surface manifest、GOLDEN fixtures、測試 id 集合或 bundle budget。

## Commit 清單

| Commit | 區域 | 內容 |
| --- | --- | --- |
| `b9c84df` | Toast | `refactor(shell): move toast content into React` |
| `b557e4a` | Topbar | `refactor(shell): move filter topbar into React` |
| `aaea4d9` | Bottom navigation | `refactor(shell): move bottom navigation into React` |
| `dcf9b3c` | Login modal | `refactor(auth): render login modal content with React` |
| `00d016e` | Loader bridges | `refactor(views): retire glob surface bridges` |
| `3af51e6` | Contract tests | `test(shell): guard AppShell accessibility contracts` |

每個要求的遷移區域都有獨立 commit，且每個區域完成後都執行並通過 `npm run test:session-unit`。

## 1. Toast → AppShell React portal

### 變更

- `index.html` 的既有 `#toast-root` 保留，包含既有 `aria-live="polite"` 與 `aria-atomic="true"`。
- toast 的 message、顯示狀態與 timeout 改由 `src/app/App.tsx` 管理。
- React 透過 portal 將原本的 child markup 輸出到同一個 root。
- `src/main.js` 的 `toast(message)` 函式名稱與參數簽名不變，現在只透過 session view bridge 委派 `renderToast`。

### DOM before / after

- Before：`#toast-root` 由 HTML 提供，child markup 與 timer 由 imperative DOM code 管理。
- After：同一個 `#toast-root`、live-region attributes、class names、icon 和文字結構均保留；child markup 與 timer 改由 React 管理。
- 對外可觀察的 selector、文字和 announcement root 不變。

## 2. Filter topbar、chips 與 level popover → React

### 變更

- `index.html` 的完整 topbar markup 改為 `#map-topbar-root` mount point。
- `src/app/App.tsx` 輸出品牌、城市、player directory button、日期 chips、level chip、level popover、即時狀態與 filter control。
- `src/features/filters/filterToolbarFeature.js` 不再建立／改寫 topbar DOM，也不再註冊 keydown listener；它只設定 React handlers 並同步 sheet state。
- level popover 的 Escape handler 現在由 React component 擁有，使用 capture phase，並呼叫 `preventDefault()` 與 `stopPropagation()` 後關閉 popover。
- 舊 filter feature 的第三個 Escape listener 已完全移除。

### DOM before / after

- Before：topbar 及 popover markup 靜態存在於 `index.html`，日期與 level options 由 imperative code 補入或更新。
- After：`index.html` 只保留 mount root；React 輸出相同的 ids、testids、classes、可見文字、ARIA 關係與 options。
- `band-options` 的 children 從 `innerHTML` 寫入改成 React children；使用者可觀察的選項內容與選取語意不變。

### Escape layering

- popover 開啟時，第一次 Escape 只關閉 popover。
- event 被標為 handled 並停止向外層 drawer/surface 傳播。
- `mountDialog` 與其他 surface 的 Escape layering 未被改寫。

## 3. Bottom navigation → React

### 變更

- `index.html` 的 navigation markup 與 live status 改為 `#bottom-navigation-root` mount point。
- `src/app/App.tsx` 輸出原本五個 navigation buttons、badge、unread dot 與 live status。
- active page 由 AppShell snapshot 驅動，React 在目前頁面輸出 `aria-current="page"`；非目前頁面不輸出 `aria-current`。
- `src/main.js` 的 `syncBottomNavigation` 只計算 count 與 `hasUnread`，再將狀態委派給 AppShell。

### DOM before / after

- Before：navigation 靜態存在，`main.js` 以 DOM mutation 更新 active class、badge、unread dot 與 `aria-current`。
- After：同一組五個 buttons、ids、testids、classes、SVG 結構、文字和 live status 由 React 輸出；active state 由 snapshot 宣告式渲染。
- hash navigation 與 click 行為仍使用既有 routing contract。

## 4. Login modal content → React，保留 `mountDialog` shell

### 變更

- `src/sheets.js` 的 `openLoginModal` 對外簽名保持不變。
- backdrop、dialog section、stack registration、focus trap、focus isolation、Escape handling、close lifecycle 與 focus restoration 仍由既有 `mountDialog` shell 負責。
- shell 使用空的 `html` content，然後呼叫已配置的 React content renderer。
- `src/app/App.tsx` 透過既有 surface-content host 輸出 login 內容。
- provider pending、success、failure 與訊息狀態改由 React state 管理。
- LINE provider 行為、標題、按鈕文案、status/live semantics 與既有測試契約不變。
- `login-dialog` 加入 App error surface，確保 content render failure 仍走既有 error boundary／fallback 路徑。

### DOM before / after

- Before：`mountDialog` 接收 login HTML string，並在建立 DOM 後掛 native listeners 更新內容。
- After：`mountDialog` 建立完全相同的 modal shell；內層 content 由 React 輸出與更新。
- shell ownership 沒有移動，因此 nested modal focus stack 和 Escape 優先序沒有擴大變更面。

## 5. `import.meta.glob` bridges 退役

### 新 loader 結構

- `src/main.js` 使用 eager static imports 載入：
  - `./app/App.tsx`
  - `./sheets/SessionDetailSheet.tsx`
- `src/main.js` 再透過 `configureSessionViewModules` 明確注入 eager dependencies。
- `src/sessionViews.js` 保持 Node-test importable，不直接依賴 Vite glob transform。
- 13 個 lazy sheets/pages 使用具名 `lazySurfaceLoaders` map，每個 entry 都是明確的 `import("…")`。
- `src/` 中已無 `import.meta.glob`。

### Reverse scan

```text
$ rg -n "import\.meta\.glob" src/
(no output)
```

`src/sessionViews.js` 從 baseline 637 行變為 665 行，增加 28 行；增加內容主要是明確 dependency configuration 與 loader map，沒有把 surface implementation 併回單體 bridge。

## Surface manifest 逐項說明

`tests/fixtures/surfaceManifest.js` 沒有變更，原因如下：

| Manifest variable | 結果與原因 |
| --- | --- |
| `sheetAdapters` | 維持 14。login modal 內容是 `App.tsx` 內的 AppShell content adapter，不是新增的 `src/sheets/*` adapter。 |
| `eagerModules` | 維持 `App.tsx` 與 `SessionDetailSheet.tsx`。只將載入機制從 glob 改為 `main.js` 明確 static imports，集合未變。 |
| `lazySheets` | 維持完全相同的 13 個 module。只將 glob 轉為明確 dynamic-import map，集合未變。 |
| `unmountRegistrations` | 集合未變。login content 仍透過既有 surface lifecycle 註冊 unmount。 |
| `imperativeAdapters` | 集合未變。本批次沒有新增 imperative sheet adapter。 |
| `presentationConsumers` | 集合未變。沒有移動或新增 presentation consumer。 |

因此不需要為了實作機制變更而修改 manifest；frozen test 仍以同一份 manifest 當集合真相來源。

## Frozen `react-surface-lifecycle` 掃描調整

此節獨立列出 dispatch 指定的 frozen-test 變更。

### `tests/react-surface-lifecycle.test.js`

- 新增對 `src/main.js` eager static imports 的掃描。
- 將 lazy glob 掃描改成解析 `lazySurfaceLoaders` 的明確 dynamic-import entries。
- 保留 non-empty 防線，並將實際 loader 集合與 manifest 做 exact equality；不是只驗證 subset。
- 原有三個 page dynamic-import count、pointerover preload、focusin preload 與 auth preload 驗證均保留。
- 新增 AppShell a11y contract 靜態測試，驗證：
  - 四個 navigation active-state binding 的 `aria-current`。
  - level chip 的 `aria-expanded` 與 `aria-controls`。
  - Escape handler 的 `preventDefault()` 與 `stopPropagation()`。
  - toast root 的 live-region attributes。

### 其他機制掃描調整

- `tests/session-data-boundary.test.js`：bottom navigation 的 source scan 從尋找 `main.js` DOM writes，改為驗證 `main.js` snapshot forwarding 與 `App.tsx` declarative markup。
- `tests/app-errors.test.js`：因新增 `login-dialog` error surface，isolated/global 計數與標題同步更新；沒有刪除或放寬 error assertions。
- 既有 Playwright specs 零修改。

## Accessibility contract 對照

| Contract | 保留方式 | 驗證 |
| --- | --- | --- |
| Bottom nav `aria-current` | App snapshot 對 active page 輸出 `page`，inactive 不輸出 | lifecycle 靜態 guard；既有 keyboard/navigation Playwright tests |
| Toast announcement | 保留 `#toast-root[aria-live="polite"][aria-atomic="true"]`，React portal 只接管 children | lifecycle 靜態 guard；既有 toast smoke/session tests |
| Level popover expanded state | chip 的 `aria-expanded` 隨 React open state 更新，`aria-controls` 指向原 popover id | lifecycle 靜態 guard；既有 Escape popover smoke test |
| Escape layering | popover capture handler prevent + stop 後關閉自己 | lifecycle 靜態 guard；既有 smoke test；紅綠 canary |
| Login modal status | provider 訊息保留 status/live semantics | 既有 nested login modal test；完整 frontend matrix |
| Dialog focus ownership | `mountDialog` shell、focus trap、surface stack、restore focus 保持原實作 | 既有 nested modal/focus tests；完整 frontend matrix |

## Canary 證據

### A. Loader scan bypass canary

暫時在 `lazySurfaceLoaders` 加入 manifest 不允許的 `SessionDetailSheet.tsx` entry：

```text
not ok 3 - lazy sheet module differs from surface manifest
actual:   manifest 13 modules + ./sheets/SessionDetailSheet.tsx
expected: manifest 13 modules
```

結果為紅燈，證明明確 loader scan 不會因為不再使用 glob 而漏掉額外 lazy module。撤回暫時變更後，同一命令 5/5 通過。

### B. Escape propagation canary

暫時移除 level popover handler 的 `preventDefault()` 與 `stopPropagation()`，執行既有 smoke test：

```text
Escape closes an open level popover
Expected drawer state: open
Received drawer state: collapsed
```

結果為紅燈，證明測試能偵測 Escape 穿透並誤關外層 drawer。恢復兩個 event guards 後，同一測試 1/1 通過。

補充：只移除 `stopPropagation()` 時，外層 handler 仍會因 `defaultPrevented` 忽略事件；因此最終 canary 同時移除兩個 guards，才真正模擬未處理的 Escape propagation。

所有 canary mutations 均已撤回，沒有留在 commit 或 worktree。

## Frozen assets 與相容性證據

### 既有 E2E assertions

```text
$ git diff --numstat e6269ce HEAD -- 'tests/*.spec.js'
(no output)
```

既有 Playwright spec 零修改。

### Surface manifest

```text
$ git diff --numstat e6269ce HEAD -- tests/fixtures/surfaceManifest.js
(no output)
```

### Test ID 集合

針對 `src` 與 `index.html` 的 `data-testid` assignments／set 比對：

```text
baseline assignments/set: 98 / 97
HEAD assignments/set:     98 / 97
added:   none
removed: none
```

### GOLDEN fixtures

以 dispatch baseline `e6269ce` 對 HEAD 做 byte comparison：

```text
GOLDEN bytes:    10141 / 10141; exact: true
ME_GOLDEN bytes:   456 /   456; exact: true
```

### `flushSync` reverse scan

```text
$ rg -n "flushSync" src/
src/syncCommit.ts:1:import { flushSync as reactDomFlushSync } from "react-dom";
```

`syncCommit` consumers 維持既有三個：

```text
src/app/App.tsx
src/app/SurfaceHost.tsx
src/sessionStore.ts
```

沒有新增第四個 caller，既有 allowlist test 未修改。

## 驗收結果

### 1. Frontend CI matrix

命令：

```text
npm run test:ci:frontend
```

結果：PASS。

```text
Node unit/integration:
  tests 309
  pass 309
  fail 0
  skipped 0

Playwright mock matrix:
  total 286
  passed 282
  skipped 4
  failed 0
  desktop + mobile Chromium
  workers: 1

Vite build:
  transformed modules 504
  dist/index.html 6.19 kB (gzip 2.52 kB)
  main chunk 658,143 bytes (gzip 191,844 bytes)

Bundle gate:
  main budget 703,886 bytes (gzip 203,176 bytes)
  29 files checked
  12 demo identifiers absent
  Sentry remains a lazy chunk
```

### 2. Database tests

命令：

```text
npm run test:db
```

結果：PASS，7 files、799 tests。

沒有執行 guarded DB reset；本次測試不需要 reset 才能通過。

### 3. Local API / Supabase matrix

命令：

```text
npm run test:local
```

結果：PASS。

```text
Direct local API: 2 passed, 0 skipped
Supabase Playwright: 44 passed, 11 skipped, 0 failed
Total Supabase cases: 55
workers: 1
```

沒有 did-not-run 或 cancelled cases。

### 4. Whitespace validation

命令：

```text
git diff --check
```

結果：PASS，無輸出。

## 針對性驗證

除每區域的 `npm run test:session-unit` 外，也執行以下既有 Playwright coverage：

- Toast：既有 frontend matrix 中的 toast smoke/session assertions。
- Topbar：Escape layering、filter badge/mirroring、map discovery。
- Bottom navigation：六個 nav/hash navigation cases。
- Login modal：三個 login／nested dialog cases。
- Lazy boundaries：七個 detail、login、report、create 等 boundary cases。

所有針對性驗證均通過。

## 未變更／刻意不擴張範圍

- 未修改 data API、controller 或 session store architecture。
- 未修改 `syncCommit` policy 或 allowlist。
- 除 login content adapter 外，未遷移其他 sheet/page content。
- 未改寫 `mountDialog` 的 surface stack、focus trap、Escape shell 或 focus restoration。
- 未修改 CSS contract、chunk strategy、bundle baseline 或 bundle budget。
- 未修改 GOLDEN、ME_GOLDEN、surface manifest 或既有 E2E spec。
- 未執行 DB reset。
- 未 push。

## 最終狀態

所有 dispatch 必要工作與驗收已完成。實作 commits 已建立；本回報檔依要求維持未提交，作為唯一預期的 report-only worktree 變更。
