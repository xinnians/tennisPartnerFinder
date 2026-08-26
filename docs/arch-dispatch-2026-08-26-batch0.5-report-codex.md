# 批 0.5 回報：新碼邊界 ADR＋React ownership 分批解凍

- 日期：2026-08-26
- 派工單：`docs/arch-dispatch-2026-08-26-batch0.5.md`
- 開工狀態：working tree 乾淨；實際 HEAD 為 `2047777`。派工單記錄的 `7a0a74d` 是
  HEAD 的 ancestor（`git merge-base --is-ancestor 7a0a74d HEAD` exit 0）；中間只有
  `2047777 docs(plan): React ownership 路線圖拍板與批 0.5 派工單`，且未改動本批兩個
  實作目標檔。
- 結果：完成，待驗收方重跑與最終核准；未 commit、未 push。

## 1. `docs/architecture-decisions.md` 變更對照

更新日期已由 `2026-08-24` 改為 `2026-08-26`。既有 32 條決策文字未改，表格尾端
新增四條（最終檔案第 43–46 行）：

1. `RO-01`：「不新增 React-to-legacy portal adapter；存量 adapter 以逐批退役為方向。」
2. `RO-02`：「不新增依賴同步 DOM commit 才能工作的公開 adapter；現有 3 個 `syncCommit`
   caller 屬存量，依批 5 逐個退役、允許有書面理由的殘留。」
3. `RO-03`：「不新增未受 strict TypeScript 檢查的核心 controller 模組。」
4. `RO-04`：「native browser／Maps event listener 仍可使用；禁止的是為 legacy DOM bridge
   新增的 listener。」

四條的狀態均為「生效」、日期均為 `2026-08-26`，出處均指向
`arch-roadmap-2026-08-26-react-ownership.md` 的「批 0.5：新碼邊界 ADR＋分批解凍」節。

## 2. `.claude/rules/react-migration.md` 變更對照

在「批 3 解凍（2026-08-25）」之後、「Sheet 批固定模式」之前新增
「React ownership 分批解凍（2026-08-26）」。最終原文如下（第 41–46 行）：

1. 「adapter 簽名與 e2e 直呼點的凍結改為依批解凍：僅當某批派工單明列該 adapter
   於解凍清單時，該 adapter 的簽名、直呼點與對應白箱斷言才解凍；未到指定批次前仍視為凍結。」
2. 「批 1（Messages）先行解凍 `mountMessagesDestination` options bag、`pageViews.js` 的
   `renderMessagesPage` bridge、`App.tsx` 的 `renderMessagesPageInApp` 與 MessagesPage props
   fallback 雙源；其餘頁面與 sheet 的 adapter 仍凍結。」
3. 「允許把「以 adapter 為 harness」的既有 e2e 測試改寫為 UI 驅動，但行為 oracle
   （焦點還原、Escape、可見性等斷言語意）不得弱化或刪除。」
4. 「批 4 才解凍 `mountSheet` 專有 surface 殼：backdrop、focus trap、Escape、surface stack、
   關閉與焦點回復允許遷入 React surface system；批 4 之前仍凍結。」
5. 「批 5 才解凍 imperative handle 的 `flushSync`／同步 commit 契約並允許逐 caller 退役；
   每移除一個須以原始 race／focus 測試驗證，留存者需書面理由。」
6. 「本次不解凍 `data-testid`、id、class、aria、文案與既有 e2e 斷言 oracle 語意、
   `dataApi` 邊界與隱私 allowlist；production bundle gate 不得任意放寬。這些契約仍是一票否決，
   任何批不得變更。」

### 原凍結條文逐字保留證據

`git diff --unified=0 -- .claude/rules/react-migration.md` 只顯示在原檔第 38 行之後純新增
9 行，沒有任何刪除或修改。被差分覆蓋的四條原凍結文字如下：

- 開工檔第 21 行／最終檔第 21 行：「公開 legacy adapter 的函式名稱、參數、預設值、同步語意與
  callback payload 全部凍結；importer 與 e2e 直呼點不因內部改 React 而改。」
- 開工檔第 24 行／最終檔第 24 行：「每批凍結 testid、id、class、aria、文案、DOM 結構與全域 CSS；
  CSS Module 統一留到批 10。既有 e2e 斷言不得配合遷移修改。」
- 開工檔第 41 行／最終檔第 50 行：「factory 的公開簽名、預設值與 imperative handle 方法集合／
  payload／同步語意凍結；handle 推 React state 時以 `flushSync` commit，呼叫返回前 DOM 必須已更新。」
- 開工檔第 42 行／最終檔第 51 行：「`mountSheet` 專有 surface 殼：backdrop、focus trap、Escape、
  surface stack、關閉與焦點回復都不搬進 React；React 只掛進殼內既有的內容槽，且不得跨界改寫 sheet root。」

## 3. 收尾標準矩陣實跑輸出

### 變更範圍

以下是建立本回報檔之前的實作 scope snapshot。

```text
$ git status --short
 M .claude/rules/react-migration.md
 M docs/architecture-decisions.md

$ git diff --stat
 .claude/rules/react-migration.md | 9 +++++++++
 docs/architecture-decisions.md   | 6 +++++-
 2 files changed, 14 insertions(+), 1 deletion(-)
```

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

### 行為零影響

`npm run test:mock` 依派工要求未接 pipe；終端收尾輸出逐字如下：

```text
  4 skipped
  286 passed (53.8s)
```

指令 exit 0。其 pretest 亦重跑 `npm run typecheck` 並 exit 0。

### 空白

```text
$ git diff --check
```

無輸出，exit 0。

## 4. 未做

- 範圍內未完成項目：無。
- 未改 `src/`、`tests/`、其他實作 docs 檔或其他 `.claude/rules/` 檔；本回報檔是派工單
  明列的交付物。
- 未動 `#9db3a4`，未起草批 1 及後續批次內容，未改既有 ADR 條目或原凍結條文。
- 未 commit，未 push。

## 5. 疑義與 BLOCKED

- 疑義：無。
- BLOCKED：無。未發現新增條文與生效的 `NP-01`–`NP-06`、`D-*`、`MIG-*` 或其他
  `.claude/rules/` 規則有無法在本批範圍內調和的衝突。
