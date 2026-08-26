# 批 1 補件回報：B1-FU-1〜B1-FU-4

- 日期：2026-08-26
- 派工單：`docs/arch-dispatch-2026-08-26-batch1-followup.md`
- 開工基準：HEAD `3a15132` ＋目前未提交的批 1 working tree；未 revert、stash 或重做批 1 主體。
- 結果：四項補件完成，無 BLOCKED；未 commit、未 push。
- 實作範圍：補件只改 `tests/react-page-focus.spec.js` 與
  `tests/messages-page-dom.test.js`。`tests/fixtures/messagesAppHarness.tsx` 已具備本補件所需的
  `sessionStore` 回傳契約，無須再改。另依回報合約新增本文件；零補件 `src/` 變更。

## 1. B1-FU-1：還原 `__importAppModule` 拼法

`tests/react-page-focus.spec.js` 三處全部判定為「還原」，沒有任何一處可刪除：

1. 第一個 focus 測試仍需從 `sessionViews` 取得 `preloadNonHomeViews`、`renderMePage`、
   `renderMySessionsPage`；只有 Messages adapter 消費已真退役，因此載入整行不能刪。
2. created-session 測試仍需從 `sessionController` 取得 `createSessionController`，所以還原為
   `window.__importAppModule("sessionController")`。
3. 同一 created-session 測試仍需從 `sessionViews` 取得 `openCreateSessionSheet`、
   `preloadNonHomeViews`、`renderMySessionsPage`，所以還原為
   `window.__importAppModule("sessionViews")`。

派工單特別凍結的 `await import("/src/sessionStore.ts")` 是 HEAD 存量直呼，本補件未動。

### 計數與逐檔對帳

實跑指令：

```text
$ rg -o '__importAppModule\(' tests --no-filename | wc -l
     139
```

| 檔案／範圍 | HEAD `3a15132` | 批 1 補件前 | 補件後 | 對帳 |
| --- | ---: | ---: | ---: | --- |
| `tests/react-page-focus.spec.js` | 3 | 0 | 3 | 三處仍有 src 模組消費，全部還原；淨退役 0 |
| `tests/navigation-shell-smoke.spec.js` | 3 | 1 | 1 | 批 1 的 Messages adapter 兩處真退役；本補件未改此檔，淨退役 −2 |
| 其餘 `tests/` | 135 | 135 | 135 | 零變化 |
| **全部 `tests/`** | **141** | **136** | **139** | **相對 HEAD 真退役 −2** |

因此前份批 1 回報的 141→136 不再採用；新基準是 141→139，唯一下降來自
`navigation-shell-smoke.spec.js` 的兩處真退役。

## 2. B1-FU-2：補 rows→empty 同樹轉換

覆蓋加在 `tests/react-page-focus.spec.js` 的既有 Messages focus harness 段：

1. 將 `mountMessagesAppHarness(...)` 的既有回傳值保存在
   `globalThis.__messagesFocusHarness`；沒有新增 production adapter。
2. 在已呈現 row、完成 click→action→store emit 與同 node focus oracle 後，呼叫回傳的
   `sessionStore.setState({ mySessions: [] })`，再 `emit("mySessions")`。
3. 以 Playwright auto-retry／`expect.poll` 斷言：`.messages-row` 數量歸 0、
   `.messages-page__empty` 可見且包含既有「成局後群組聊天會出現在這裡」文案，以及原 harness
   host 仍是同一個 connected DOM node。

沒有裸 sleep、沒有 unmount/remount；因此實際走已掛載 React tree 的 rows→empty
reconciliation 分支。`tests/fixtures/messagesAppHarness.tsx` 原本已回傳 `sessionStore`，本項無須修改它。

## 3. B1-FU-3：改用 `deepStrictEqual`

`tests/messages-page-dom.test.js` 兩個 hooks unit 均已由 `assert.deepEqual` 改為
`assert.deepStrictEqual`：

- `useMessagesState` 與既有 selector/state 切片的比較。
- `useMessagesActions().openSessionChat` 實際轉呼參數陣列的比較。

Targeted 實跑逐字收尾：

```text
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

exit 0。

## 4. B1-FU-4：死設定判斷

`installAppModuleImporter` beforeEach **保留**。B1-FU-1 還原後的實際消費點就是
`tests/react-page-focus.spec.js` 內上述三處 `window.__importAppModule(...)`；若移除 beforeEach，
這三處不會取得糖衣 importer。故驗收紀錄所見「補件前零消費者」只描述當時被改拼法的狀態，
不適用於修正後的誠實計數版本。

## 5. 收尾標準矩陣

所有指令均直接實跑，未接 pipe。

### 型別

```text
$ npm run typecheck

> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit

exit 0
```

### Lint

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

exit 0
```

### Mock

```text
$ npm run test:mock

> tennis-partner-finder@0.1.0 pretest:mock
> npm run typecheck

> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit

> tennis-partner-finder@0.1.0 test:mock
> npm run test:session-unit && TENNIS_TEST_HARNESS_MODE=mock playwright test --project=desktop-chromium --project=mobile-chromium

  4 skipped
  286 passed (53.7s)

exit 0
```

新 rows→empty branch 包含在 desktop 與 mobile 的 `react-page-focus.spec.js` 案例內；hooks unit
在聚合套件為 `ok 69`～`ok 71`。執行期間 Node 測試輸出過一則既有 dev WebSocket port
24678 已使用的診斷訊息，但沒有 `not ok`，完整命令仍以 exit 0 收尾。

### 空白

```text
$ git diff --check
```

無輸出，exit 0。

## 6. 未做

- 未修改任何 `src/` 檔；批 1 既有 production working-tree diff 原樣保留。
- 未修改 `tests/navigation-shell-smoke.spec.js`；其批 1 既有兩處真退役只用於指標對帳。
- 未修改 `tests/fixtures/messagesAppHarness.tsx`，因它已回傳 `sessionStore`。
- 未改存量 `await import("/src/sessionStore.ts")`。
- 未重跑 build、bundle、`test:local`；派工單明定沿用批 1 已驗數字。
- 未重做或弱化批 1 已通過的 focus、route、lazy、error-boundary 等 oracle。
- 未 commit、未 push。

## 7. 疑義／BLOCKED

無。四項補件與指定矩陣均完成。
