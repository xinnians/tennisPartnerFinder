# 前端架構強化派工總覽（arch-hardening 2026-08-21）

依據：`docs/frontend-architecture-review-2026-08-21-codex.md`（Codex 審查）＋ Claude 同日 12 項獨立複核（全數成立）。
本目錄是整個管線的單一協定來源；每個批次檔開頭都假設你已讀完本檔。

## 角色分工

- **Codex（你）**：依批次檔實作、跑 gate、每批 commit、寫回報檔。
- **Claude**：事後獨立驗收（重跑 gate、審 diff、反向 grep）；驗收不過會附失敗軌跡退回。
- **使用者**：push、hosted 操作、需要拍板的決策。你不做這三類事。

## 批次順序（嚴格依序，不平行）

```text
A（文件同步）
→ B1（DB 型別＋domain literal union）
→ B2（sessionActions TS 化，試點）
→ B3（dataApi 資料層拆分，可拆 B3a/B3b）
→ B4（Controller 契約型別）
→ C1–C6（Controller 依 feature 拆分）
→ D1–D4（單一 React App）
→ E1–E3（效能與 hardening）
```

建議停靠點：B4、C6、D4 完成後各交回驗收一次；若一次做完全部，每批 commit 仍必須獨立可回退。
D 批開工前若發現批次檔細節與 B/C 落地現況衝突，寫 BLOCKED 回報，不自行改設計。

## 共通紅線（每批適用，違反即退件）

1. **零 DB 變更**：禁動 `supabase/migrations/`、`supabase/tests/`、`data/courts.json`。判斷必須動時，停止該批並回報 BLOCKED。
2. **隱私紅線**（照專案 CLAUDE.md）：LINE 不得被 `src/` 讀取、映射、渲染；`save_my_profile` 的 `p_line_id: null` 呼叫點原樣保留；匿名面與各 view 的欄位 allowlist 不增減。
3. **資料邊界**：`.from(`／`.rpc(` 只允許存在於 `src/dataApi.js` facade 與（B3 起）`src/data/` 內。
4. **行為凍結**：testid、id、aria、中文文案、DOM 結構、公開 adapter 函式簽名與同步語意全凍結；例外必須由該批次檔「白名單」段明列。
5. **測試不得為變綠而弱化**：禁空斷言、禁刪 assert。字串掃描型契約測試允許「等語意演進」（掃描目標隨檔案搬移擴充），但演進後必須保持掃描集非空斷言，且回報附前後語意對照表。涵蓋／遷移類驗收寫對稱性論證，不用列舉。
6. **import 紀律**：importer 明寫實際副檔名（`.ts`／`.tsx`／`.js`）；型別用 `import type`；不建 barrel。
7. **不 push、不 `vercel deploy`、不動 `.env*`**；`.github/workflows/` 只有批次檔白名單明列時可動。
8. **本機 DB 異常不得自行 reset**。需要乾淨 fixture 只能執行 `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`，且僅限批次檔明示。

## 每批固定 gate（全綠才可 commit）

```bash
npm run typecheck
npm run lint
npm run prettier:check
npm run test:session-unit
npm run test:mock
npm run test:local        # 動到 src/ runtime 一律要跑，不可豁免
npm run build
npm run check:production-bundle
git diff --check
```

- `npm run test:db`：本管線零 migration，維持豁免。
- `npm run test:local` 需要 Docker 與 `npx supabase start`；純文件、純測試檔批次可豁免 test:local。
- `npm run test:mock:webkit`：非阻擋訊號，跑一次附數字即可；2026-08-21 基準 126 passed / 6 failed / 3 skipped，不得劣化。

## commit 紀律

- 每批（含子批）一個 commit，通過該批 gate 後才 commit。
- 訊息格式：`refactor(arch-<批號>): <意圖>`；純文件批用 `docs(arch-<批號>): ...`、純測試批用 `test(arch-<批號>): ...`。
- 用精確路徑 stage，禁 `git add -A`；commit 前列出全部變更逐一判斷是否屬於本批。
- 不 push。

## 回報合約

每批完成後寫 `docs/arch-reports/batch-<批號>.md`，隨該批一起 commit。內容要件：

- (a) 變更檔案清單，每檔一句意圖。
- (b) 各 gate 輸出末尾摘要**逐字抄錄**（測試數、bundle 大小等數字不得手數或改寫）。
- (c) 白名單使用情況：動了哪些凍結例外、為什麼。
- (d) 未動範圍自證：執行批次檔指定的反向 grep，貼上輸出。
- (e) BLOCKED／偏離事項與處置。

## BLOCKED 判準

以下情況停止該批、寫 BLOCKED 回報，不硬修：需動凍結範圍或 DB；同一假說被 runtime 證據推翻兩次；同一 gate 連續兩次同因失敗；批次檔前提與現況不符。

## 非派工項（你不做，列此避免誤揀）

本機 `node_modules/node_modules` symlink 清理與 `npm ci`；hosted preview 人工 QA（OAuth、Maps、Push、深連結、390px 慢網路）；CSP 從 Report-Only 切 enforcing；error transport 廠商選擇與接線；WebKit 六條差異的實機 Safari 分類；REL 與任何 push。
