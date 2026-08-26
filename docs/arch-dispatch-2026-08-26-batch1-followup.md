# 批 1 補件派工單（B1-FU-1〜B1-FU-4，全在測試面）

- 日期：2026-08-26。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`；
  退件依據：`docs/arch-reports/batch-1-acceptance-2026-08-26.md`。
- 開工基準：`3a15132` ＋ **目前未提交的批 1 working tree**（批 1 主體已驗收通過，
  不得 revert、stash 或重做；本補件疊加其上）。
- 範圍：只動 `tests/react-page-focus.spec.js`、`tests/fixtures/messagesAppHarness.tsx`、
  `tests/messages-page-dom.test.js` 三檔。**零 `src/` 變更。**
- 你不 commit、不 push；完成後批 1＋補件一起由驗收方 commit。

## B1-FU-1：還原 `__importAppModule` 拼法（指標誠實性，主因）

`tests/react-page-focus.spec.js` 三處被改拼為 `await import("/src/….js")` 的載入
（`:21` 與 `:121-124` 附近兩處），一律還原為 `window.__importAppModule("<name>")` 拼法
（糖衣定義見 `tests/fixtures/appRuntime.js:12-22`，行為等價）。

- 理由：`__importAppModule` 計數是路線圖的觀察指標，口徑=「白箱耦合真退役才下降」。
  改拼法會讓耦合隱形、指標失去可比性；且 `:121-124` 兩處屬 created-session／MySessions
  測試，不在批 1 解凍清單內。
- 若還原後某處實際已無任何 src 模組載入需求（真退役），可整行刪除，但要在回報逐處
  說明「刪除 vs 還原」的判斷依據。
- 完成後重測 `rg -o '__importAppModule\(' tests --no-filename | wc -l`，回報新值並逐檔
  對帳（預期：navigation-shell −2 為真退役，react-page-focus 視還原結果而定）。
- 釐清：`:123` 附近的 `await import("/src/sessionStore.ts")` 是**存量**直呼（HEAD 原
  `:97` 已存在，非批 1 引入），不在本補件範圍，不要動它。

## B1-FU-2：補 rows→empty 同樹轉換覆蓋

批 1 改寫後，「已掛載列表→空狀態」的同樹 reconciliation 分支失去覆蓋。
在既有 harness 測試（`react-page-focus.spec.js` 或 `navigation-shell-smoke.spec.js`
的 harness 段擇一）補：

1. harness 已回傳 `sessionStore`；對其 `setState`＋`emit("mySessions")` 推入空 groups。
2. 斷言同一棵已掛載樹內：row count 歸 0、`.messages-page__empty` 出現且含既有文案。
3. 使用會重試的斷言（`expect.poll`／auto-retry），不加裸 sleep。

## B1-FU-3：`deepEqual` 改 `deepStrictEqual`

`tests/messages-page-dom.test.js` 兩個 hooks unit 的 `assert.deepEqual` 改
`assert.deepStrictEqual`（避免 `[42]` 過 `["42"]`）。改後實跑確認仍綠。

## B1-FU-4：清除死設定

`tests/react-page-focus.spec.js:6` 附近的 `installAppModuleImporter` beforeEach 若確認
已無消費者，整段移除；若仍有消費者，留下並回報消費點。

## 不在範圍

- 任何 `src/` 檔案；其他測試檔；文件。
- 不重做批 1 已通過的任何部分。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

| 檢查 | 指令 | 通過標準 |
| --- | --- | --- |
| 型別 | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Mock | `npm run test:mock` | 全綠，計數不低於 286 passed（B1-FU-2 可能 +N） |
| 空白 | `git diff --check` | 無輸出 |

（本補件零 src 變更，build／bundle／test:local 沿用批 1 已驗數字，不需重跑；
若你動到範圍外檔案則全套重跑並回報原因。）

## 回報合約

寫 `docs/arch-dispatch-2026-08-26-batch1-followup-report-codex.md`（不 commit、不 push），
必含：四項逐一的變更對照與判斷說明、`__importAppModule` 新計數與逐檔對帳、
收尾矩陣逐字輸出、「未做」清單、疑義／BLOCKED。
