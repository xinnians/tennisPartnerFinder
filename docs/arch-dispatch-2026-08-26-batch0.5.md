# 批 0.5 派工單：新碼邊界 ADR＋react-migration.md 分批解凍（純文件批）

- 日期：2026-08-26。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`。
- 開工基準：`7a0a74d`（working tree 應乾淨；若有未提交變更先停手回報）。
- 本批**只改兩個檔案**：`docs/architecture-decisions.md`、`.claude/rules/react-migration.md`。
  零 `src/`／`tests/` 變更，零行為影響。
- 產出條文屬治理文本：**你不 commit、不 push**，留 working tree 交驗收方；
  驗收通過後由負責人最終核准才生效。

## Ground truth（2026-08-26 開單時實測；動手前請自行重驗）

- `.claude/rules/react-migration.md` 現行凍結面四處：
  - `:21`「公開 legacy adapter 的函式名稱、參數、預設值、同步語意與 callback payload 全部凍結；importer 與 e2e 直呼點不因內部改 React 而改。」
  - `:24`「每批凍結 testid、id、class、aria、文案、DOM 結構與全域 CSS；……既有 e2e 斷言不得配合遷移修改。」
  - `:41`「factory 的公開簽名、預設值與 imperative handle 方法集合／payload／同步語意凍結；handle 推 React state 時以 `flushSync` commit……」
  - `:42`「`mountSheet` 專有 surface 殼：backdrop、focus trap、Escape、surface stack、關閉與焦點回復都不搬進 React……」
- 解凍儀式先例：同檔 `:32-37`「## 批 3 解凍（2026-08-25）」——原條文一字不改、追加節差分覆蓋、
  逐項列解除範圍並用「其餘⋯⋯仍凍結」封閉外延、以「本次不解凍⋯⋯仍是一票否決」收尾。
- `docs/architecture-decisions.md`：32 條、單一 5 欄表格 `| ID | 決策內容 | 狀態 | 日期 | 出處 |`；
  狀態欄封閉字集「生效／已翻案／已終結」；ID 前綴＝來源文件系列（MIG／OV／FV／D／NP）；
  出處欄一律 relative Markdown link＋中文 anchor。`:3` 的「更新日期：2026-08-24」已落後表內
  08-25 條目，本批一併更新為 2026-08-26。
- `syncCommit` caller 恰 3 處（條文引用時以此為準）：`src/sessionStore.ts:102`、
  `src/app/SurfaceHost.tsx:60`、`src/app/App.tsx:902`。

## 作法要求

### A. `docs/architecture-decisions.md` 新增 RO 系列（React Ownership 新碼邊界）

在既有表格內追加四列，日期 2026-08-26、狀態「生效」、出處連結指向
`arch-roadmap-2026-08-26-react-ownership.md` 的「批 0.5」節（中文 anchor）：

- **RO-01**：不新增 React-to-legacy portal adapter；存量 adapter 以逐批退役為方向。
- **RO-02**：不新增依賴同步 DOM commit 才能工作的公開 adapter；現有 3 個 `syncCommit`
  caller 屬存量，依批 5 逐個退役、允許有書面理由的殘留。
- **RO-03**：不新增未受 strict TypeScript 檢查的核心 controller 模組。
- **RO-04**：native browser／Maps event listener 仍可使用；禁止的是為 legacy DOM bridge
  新增的 listener。

格式遵循現行慣例：決策內容單句斷言、句號結尾；同步更新 `:3` 更新日期。
不改動既有 32 條的任何文字。

### B. `.claude/rules/react-migration.md` 追加「React ownership 分批解凍（2026-08-26）」

以 H2 追加在「批 3 解凍（2026-08-25）」之後、「Sheet 批固定模式」之前（或檔尾，
以不打斷既有節順序為準）；**原凍結條文一字不改**。條文須成對寫「解什麼」與「仍不解什麼」：

解凍（依批生效，未到批次前仍視為凍結）：

1. **機制**：adapter 簽名與 e2e 直呼點的凍結改為「依批解凍」——僅當某批派工單明列該
   adapter 於解凍清單時，該 adapter 的簽名、直呼點與對應白箱斷言才解凍。
2. **批 1（Messages）先行列名**：`mountMessagesDestination` options bag、
   `pageViews.js` 的 `renderMessagesPage` bridge、`App.tsx` 的 `renderMessagesPageInApp`
   與 MessagesPage props fallback 雙源；其餘頁面與 sheet 的 adapter 仍凍結。
3. **e2e 測試進入方式**：允許把「以 adapter 為 harness」的既有測試改寫為 UI 驅動，
   但行為 oracle（焦點還原、Escape、可見性等斷言語意）不得弱化或刪除。
4. **批 4 才解**：`mountSheet` 專有 surface 殼（backdrop、focus trap、Escape、surface
   stack、關閉與焦點回復）允許遷入 React surface system；批 4 之前仍凍結。
5. **批 5 才解**：imperative handle 的 `flushSync`／同步 commit 契約允許逐 caller 退役；
   每移除一個須以原始 race／focus 測試驗證，留存者需書面理由。

仍不解凍（一票否決，任何批不得動）：

- `data-testid`、id、class、aria、文案與既有 e2e 斷言 oracle 語意。
- `dataApi` 邊界與隱私 allowlist。
- production bundle gate 不得任意放寬。

### 不在範圍

- 不改 `src/`、`tests/`、其他任何 docs 檔。
- 不動 `#9db3a4`（已於 2026-08-26 拍板維持慣例色，此項關閉）。
- 不起草批 1 及之後批次的任何內容。
- 不修改既有 ADR 條目與既有凍結條文的文字。

## 收尾標準矩陣（全部實跑，逐字抄錄輸出到回報）

| 檢查 | 指令／方式 | 通過標準 |
| --- | --- | --- |
| 變更範圍 | `git status --short`、`git diff --stat` | 只有上述兩檔 |
| 型別 | `npm run typecheck` | exit 0（不接 pipe） |
| Lint | `npm run lint` | exit 0 |
| 行為零影響 | `npm run test:mock` | 全綠（基準 286 passed／4 skipped） |
| 空白 | `git diff --check` | 無輸出 |

## 回報合約

寫 `docs/arch-dispatch-2026-08-26-batch0.5-report-codex.md`（不 commit、不 push），必含：

1. 兩檔變更逐條對照：每條新增條文引用最終原文；並引用被差分覆蓋的原凍結條文行號，
   證明原文未改。
2. 收尾標準矩陣實跑輸出逐字抄錄（含測試計數）。
3. 「未做」清單：範圍內未完成或刻意不做的項目，空集合也要明寫「無」。
4. 疑義與 BLOCKED：若發現條文與任何生效 ADR（NP-01～06、D-*、MIG-*）或
  `.claude/rules/` 其他規則衝突且無法在本批範圍內調和，停手列出衝突點回報，不自行裁決。
