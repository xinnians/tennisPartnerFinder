# 批 B2：sessionActions.js → TypeScript（TS 化試點）

先讀 `00-overview.md`；共通紅線與回報合約適用。前置：B1 已 commit。

## 目標與動機

用最小、自足的檔案先驗證「存量 JS → strict TS」的搬遷模式，供 B3 大批沿用。
`src/sessionActions.js` 共 341 行，importer 只有兩個：`src/sessionViews.js`、
`src/sessionPresentation.ts`（2026-08-21 盤點）。

## 工作項

1. 開工先自行重盤：`rg -ln 'sessionActions' src tests`，若 importer 或測試引用超出上述
   兩個檔案，把差異寫進回報再繼續。
2. `git mv src/sessionActions.js src/sessionActions.ts`，補齊型別（用 B1 的
   `domainTypes`／`databaseTypes`），strict 通過；禁 explicit `any`。
3. 兩個 importer 的 import 路徑副檔名同步改為 `.ts`。
4. 若有契約測試以字面 `sessionActions.js` 掃描，等語意演進（改掃 `.ts`），保持掃描集非空。

## 凍結白名單

- 可動：`src/sessionActions.ts`（改名＋型別）、兩個 importer 的 import 行、
  字面綁副檔名的測試掃描目標。
- 禁動：sessionActions 的函式名、參數、回傳值、副作用順序（逐函式行為凍結）；
  `sessionPresentation.ts` 除 import 行外不動（它有 `Object.freeze` 數量等契約斷言）。

## 驗收條件

- 完整 gate 全綠。
- `rg -n 'sessionActions\.js' src tests` 歸零（回報附輸出）。
- diff 可讀為「搬移＋型別註記」而非重寫：函式本體邏輯 diff 應接近零；若某函式必須改寫
  才能過 typecheck，單獨列出理由。

## commit 與回報

- commit：`refactor(arch-B2): sessionActions 轉 TypeScript`
- 回報檔：`docs/arch-reports/batch-B2.md`。
