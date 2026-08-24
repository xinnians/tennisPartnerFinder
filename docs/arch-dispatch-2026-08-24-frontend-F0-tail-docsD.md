# 派工單：F0-6＋F0-4＋文件批 D（收尾小批，依序執行）

- 日期：2026-08-24
- 母派工單：`docs/arch-dispatch-2026-08-22-frontend.md`（F0-4、F0-6、文件批 D 條目）
- 開工基準：`04543bf`（批 2D ACCEPTED 之後）
- 三個子項彼此獨立、各自至少一個 commit，**依 F0-6 → F0-4 → D 順序執行**；
  任一子項退件不影響其他子項驗收。

## 開工前必讀（讀磁碟上的現行版本）

1. 母派工單總則＋驗收協定
2. `CLAUDE.md`（React 遷移邊界與文件維護規則）

**通用紅線**：不動 testid／DOM 結構／文案／既有測試斷言；不動
`sessionController.js`、`src/controller/`、`src/views/`、`syncCommit.ts`、
dataApi 邊界、`databaseTypes.ts`、`.claude/rules/`。

---

## F0-6 Node 版本前提工具化

**Ground truth**（2026-08-24 實測）：單元測試以 `node --test` 直載 `.ts`，依賴
Node 22.18+ 的 type stripping；`package.json` **無 `engines`**、repo **無 `.nvmrc`**、
`tests/ci-config.test.js` 對 engines／nvmrc **零斷言**。本機目前 v22.22.3。

**作法**：`package.json` 加 `engines`（`"node": ">=22.18"`）＋新增 `.nvmrc`
（一行主版本，如 `22`，與 engines 相容即可）；`ci-config.test.js` 加斷言釘住
兩者存在且語意一致（engines 下限 >= 22.18）。

**驗收**：
1. 兩檔落地；`ci-config.test.js` 新斷言。
2. **canary**：暫時把 engines 改成 `">=20"` → 新斷言紅（附輸出），還原綠。
3. `npm run test:ci:frontend` 全綠（engines 不得讓現行 CI node 版本裝不了依賴；
   如 CI 的 node 版本低於 22.18，先回報，不要硬改 workflow）。

## F0-4 focusable selector 收斂

**Ground truth**（2026-08-24 實測，母單的「三份」已因 F0-2 刪死碼變**兩份**）：

- `src/sheets.js:13`（`focusables()` 內的 selector 字串）
- `src/sheets/SessionDetailSheet.tsx:688`（`JOIN_STAGE_FOCUSABLE_SELECTOR`）
- 兩份字串**逐字相同**（驗收方已比對）。

**作法**：收斂成單一匯出常數。預設照母單（`sheets.js` 匯出、`.tsx` 端 import）；
若 React 邊界慣例（React 模組不回頭 import legacy `.js`）使此路不妥，可改放共用
葉子模組（`sessionPresentation.ts` 或新的小葉子），兩處都 import，回報說明選擇理由。
**selector 字串本身一個字元都不得改。**

**驗收**：
1. `grep -rn "button:not(\[disabled\])" src/ | wc -l` 由 **2 降為 1**（附前後輸出）。
2. focus 相關測試零修改全綠（`me-focus`、`react-page-focus`、sheets 殼 DOM 測試、
   smoke 的 focus 斷言）。
3. 本項動 runtime，收尾矩陣含 `test:local`。

## 文件批 D（純文件，不動 `src/`）

### D-1 架構決策索引

新檔（建議 `docs/architecture-decisions.md`）：ADR 式一頁清單，
**一行一決策：決策內容／狀態（生效・已翻案・已終結）／日期／出處連結**。
收斂下列四處的全部決策條目：

1. `docs/frontend-migration-plan-2026-08-18.md` 的「不在 scope」節
2. `docs/arch-dispatch-2026-08-21/00-overview.md` 的「非派工項」
3. `docs/arch-reports/final-verdict-2026-08-21.md` 的「未盡事項」
4. `docs/frontend-fix-plan-2026-08-20.md` 的 D1–D7
5. 母派工單 `docs/arch-dispatch-2026-08-22-frontend.md` 的「不派工」表
  （TanStack Query、React Router、Redux、CSS @layer、雙欄、SSR）

**驗收**：索引涵蓋上述五處**全部**條目（回報附「來源條目數 vs 索引列數」的
對照計數，數字用指令算）；每列有出處檔案連結；抽三條可在索引一眼定位到原文。

### D-2 歷史文件後註

1. `docs/frontend-fix-plan-2026-08-20.md`、`docs/frontend-migration-plan-2026-08-18.md`
   檔頭加終結註記（比照 repo 既有 batch-12 後註慣例：狀態、終結日期、後續去處）。
2. `docs/frontend-architecture-analysis-after-react-migration-2026-08-20.md` 的
   「`as unknown as`」與「測試資料污染」兩節加失效後註（指向已修復的批次紀錄）。

**驗收**：後註格式照既有慣例；原文**不刪不改**，只加註；
`git diff` 限上述三檔＋新索引檔。

---

## 不在範圍（不要順手做）

1. 批 3 全部（F3-0〜F3-3）；F0-7／F0-8（P2）。
2. 不重排、不改寫任何歷史文件的本文；D 批只加註與建索引。
3. 若認為某決策條目已過時該改狀態，在索引標注並回報，不要改原文。

## 回報要求

寫成 `docs/arch-dispatch-2026-08-24-frontend-F0-tail-docsD-report-codex.md`，
不列入實作 commit、不 push。每子項：改了什麼、驗收逐條附指令＋實際輸出、
canary 附紅→還原→綠、計數用指令算並逐字抄錄、未做明說。

**收尾必跑**（F0-4 動 runtime 的標準矩陣）：`npm run test:ci:frontend`、
`npm run test:db`、`npm run test:local`（did not run＝0）、`git diff --check`；
GOLDEN 兩張與 `data-testid` 集合對 `0be31a2` 維持已核可 hunk。
Playwright 不並發；DB 重置只可用 guarded 指令。
