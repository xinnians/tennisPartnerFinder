# 批 6A 派工單：value leaf 四檔 TS 化（批 6 主體首批・樣板批）

- 日期：2026-08-27。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`
  （批 6 主體切批 6A）；前置：批 6 前置小批 ACCEPTED（`60aa676`——小檔門檻
  已改非空,新增小型 `.ts` 不會誤紅）。
- 開工基準：`60aa676` 之後的最新 main HEAD（working tree 應乾淨，否則停手回報）。
- 本批是**樣板批**：確立整個批 6 的 TS 化紀律（annotation-only 轉換、importer
  副檔名同步、appRuntime 映射、strict 納入探針）,後續 6B–6F 沿用。
- bundle 硬約束：total gzip 餘 1,428 B;副檔名改名預期近零變動,超 gate＝BLOCKED。
- 你不 commit、不 push；working tree 交驗收方。

## 範圍：四檔 `.js` → `.ts`

| 檔案 | 行數 | importer 檔數（src＋tests 口徑,開單實測,動手前指令複驗） |
| --- | ---: | ---: |
| `src/config.js` | 38 | 13（src 11＋tests 2） |
| `src/profile.js` | 43 | 6（src 5＋tests 1） |
| `src/sessionCriteria.js` | 41 | 10 |
| `src/taipeiTime.js` | 105 | 7 |

tests 內 3 行靜態 import（開單實測）：`tests/performance.spec.js:3`（config）、
`tests/session-controller.test.js:5`（config）、
`tests/session-data-boundary.test.js:34`（profile）——由解凍第 4 條涵蓋。
另 `taipeiTime.js:1` 自身 import `./config.js`,同步改。

## 核心紀律：annotation-only 轉換

- 只准新增：型別註記、`import type`、`export type`／`interface`、必要的
  `as const`／`satisfies`;**不准改**：任何 runtime 邏輯、預設值、字面、export
  名與 shape、檔內順序（Prettier 格式化除外）。回報附每檔「轉換 diff 摘要」,
  自證無邏輯變更。
- strict TypeScript、現行 ESLint 規則全過;**禁 `any`**——真有型別不可表達的
  邊界用 `unknown`＋narrowing,若仍卡住回報該點交裁決,不得**新增** `any` 或
  `@ts-ignore`／`eslint-disable`（既存者保留不算違規,如
  `sessionCriteria.js:16` 的 `eslint-disable-line no-extra-boolean-cast`）。
- type-aware off 規則群（`eslint.config.js:84` 起）本批**不動**（6F 恢復）。

## 紅線（一票否決）

- `src/profile.js` 是隱私三級門檻的前端同語意引導（CLAUDE.md：資料庫授權只以
  `private.require_profile_gate` 為準）——門檻判定語意零變更。
- `src/taipeiTime.js` 時區運算零行為變更（105 行是四檔中唯一有實質邏輯者）。
- `src/config.js` 的環境變數讀取與預設值零變更。
- 不動 `main.js`／`sessionViews.js`／`views/`（暫不轉清單）——它們作為
  importer 只改副檔名字串,不做其他任何修改。

## 解凍清單（Q3 守則：未列即凍結）

- 四檔本體（改名＋annotation）。
- 全部 importer 的 import 路徑副檔名字串（`.js`→`.ts`,依 react-migration
  importer 慣例明寫實際副檔名;含 `main.js`／`sessionViews.js`／`views/*.js`
  ／`sheets.js`／features／controller／data／pages／sheets 等,以指令列全,
  不手數）。
- `tests/fixtures/appRuntime.js` 副檔名表：**僅當** tests 有
  `__importAppModule("<name>")` 使用該名時補 `.ts` 映射（react-migration 慣例：
  不改既有呼叫點,只補映射;四名逐一 grep 並回報結果,零使用者不加）。
- 測試內若有寫死 `<name>.js` 路徑字面的引用（先 grep,有才解凍該行,逐一列出）。

**仍凍結**：四檔的 runtime 語意（見紅線）;importer 檔的其餘內容;
`tsconfig`／`eslint.config.js`／`package.json`;所有測試斷言語意;bundle gate;
`domainTypes.ts`（若四檔型別需要共用型別,優先 `import type` 既有定義,新增
共用型別需說明落點理由）。

## Ground truth（2026-08-27 開單時實測；動手前自行重驗）

- `appRuntime.js` 機制：`import(config.baseUrl + name + (config.extensions[name] ?? ".js"))`
  ——副檔名表缺映射時預設 `.js`,改名後未補映射的 `__importAppModule` 呼叫會
  404。
- `legacy-style-scan` 掃描含 `.js` 與 `.ts`,改名不影響計數（src 113 檔不變,
  `FILES` 含 index.html＝114）;`>=65` floor／逐目錄非空不受影響。
- `lifecycle` 頂層 readFileSync 七檔不含這四檔;`content-visibility` 只掃 `.css`。
- 量化基準（前置小批後）：main gzip 187,470（餘 4,950 B）;total 257,634
  （餘 1,428 B）;unit 346;mock 298 passed／4 skipped;
  `__importAppModule`（window 口徑）110。

## Strict 納入探針（三拍必附、逐字輸出）

改名不等於被 strict 檢查——證明四檔真的進了 typecheck 範圍：任選一檔暫時加入
一個型別錯誤（如 `const probe: number = "x";`）→ `npm run typecheck` 紅且指名
該檔:行 → byte-identical 還原 → 綠。四檔各做一次（便宜,`tsc` 秒級）。

## 行為覆蓋盤點（必交付）

逐檔列出覆蓋其行為的既有測試（測試檔:測試名,指令佐證非記憶）;若某檔存在
零行為覆蓋的 export,如實標注（不強制補測,記入驗收紀錄供批 6 後續判斷）。

## 不在範圍

- 6B–6F 各檔;拆檔;ESLint 規則恢復;`domainTypes.ts` 重構;新依賴;
  UX／行為變更。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／lint／prettier:check／build／check:production-bundle（main／total
對照＋淨值,超 gate＝BLOCKED）／test:mock（≥298）／test:local（production
import 面變更,不豁免;污染紅依 guarded reset 三拍;偶發依取樣分類）／
`git diff --check`／反掃：四個舊 `.js` import 路徑於 src＋tests 歸零——主掃用
`rg "from ['\"][^'\"]*/(config|profile|sessionCriteria|taipeiTime)\.js"`,另以
裸字面 `rg "(config|profile|sessionCriteria|taipeiTime)\.js" src tests` 補掃,
排除與四檔無關的命中（開單實測:現存 5 筆全是 `playwright.config.js` 字面,
在 ci-config／reset-local-test-db／local-supabase-config 三個測試檔）後逐筆
說明殘留。

## 回報合約

寫 `docs/arch-dispatch-2026-08-27-batch6A-leaf-ts-report-codex.md`（不 commit、
不 push），必含：每檔轉換 diff 摘要（annotation-only 自證）、importer 副檔名
同步清單（指令產出）、appRuntime 四名 grep 結果與映射處置、strict 探針 ×4
三拍逐字、行為覆蓋盤點表、舊路徑反掃逐字、bundle 淨值、`__importAppModule`
對帳、收尾矩陣逐字輸出、Codex 五問（第 5 問答「對 6B 狀態三檔的建議——
`filters.js`／`requestGate.js`／`sessionIntent.js` 各自的型別化難點與
建議順序」）、未做／疑義／BLOCKED。
