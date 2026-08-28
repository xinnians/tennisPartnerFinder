# ESLint 恢復 Phase E-1 派工單：unbound-method manifest 產出批（不改碼）

- 日期：2026-08-28。母文件：
  `docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md` §3／§4E；設計
  輸入＝Phase D 驗收紀錄（含 Codex §10.5 方案與七家族初判，經對立審查
  獨立重跑）。
- 開工基準：`11c67e0`（Phase D ACCEPTED）之後的最新 main HEAD（working
  tree 應乾淨，否則停手回報）。
- **本批性質：只讀分析＋deterministic 產出。零 `src/**` diff、零
  `eslint.config.js` diff、零測試 diff、零規則恢復、零修碼**——manifest 是
  Phase E 修復批的派工輸入,不是修復本身。
- 你不 commit、不 push；working tree 交驗收方。

## 交付一：`scripts/generate-eslint-unbound-manifest.mjs`

- 用當前 lockfile 的 ESLint Node API（flat config＋記憶體 override 開
  `@typescript-eslint/unbound-method`，**不寫暫存 config**）取得全部
  findings；**掃描範圍固定為 `src/**/*.{ts,tsx}` 與 `vite.config.ts`**
  （與 plan §1 同口徑，硬 gate 246／28 綁定此範圍）。再以 TypeScript
  Program／TypeChecker（讀現行 `tsconfig.json`）解析每筆：expression、
  receiver type、method declaration（path／kind）、`this` 引用判定。
- **Deterministic**：輸出無 wall-clock timestamp；findings 依
  （path，AST structural path）字典序；JSON key 順序固定；POSIX 相對
  路徑；LF 行尾。重跑兩次 byte-identical（回報附兩次 SHA-256）。
- `--check` 模式：重新產出至 temp，與 committed 版逐 byte 比對 JSON 與
  Markdown，任何差異 exit 非 0。
- **硬 gate（內建於 script，違反即 exit 非 0 並列明）**：findings 總數
  246、檔數 28、duplicate stableId 0、`unresolvedDeclarationCount`＝0
  （**僅指** `declarationPath`／`declarationKind` 無法定位者；
  `thisUsage: "unresolved"` 與 `proposedFixClass: "needs-review"` **不**
  計入此 gate——那是誠實紀律的合法出口，另出清單）、
  `src/sessionController.ts` 63；另對排序後 canonical findings 計
  SHA-256 寫入兩個輸出的 header 欄位。
- `stableId`＝`sha256(rule + POSIX path + AST structural path +
  normalized expression + declaration fingerprint)` 前 16 bytes hex；
  line／column 只作導航欄位，不入 ID。**三個正規化面的最小定義如下，
  其餘細節由你設計並回報**：
  - AST structural path：自 SourceFile 起的 `SyntaxKind` 名稱鏈，每層附
    同型兄弟節點 0-based 序號——序號必須存在（`sessionController.ts:468`
    一行三筆僅靠序號與名稱區分）。
  - normalized expression：必含被存取的 method／property 名稱與 alias
    （如 `getPlayerGroups: playerGroups` 兩者都留）；相同 shorthand 名稱
    靠 owner 與 structural path 去重。
  - declaration fingerprint：`declarationPath + declarationKind + 宣告
    名稱 + declaration 的 structural path`；**不得**放入 `typeToString`
    輸出。
  - 凡輸出型別字串的欄位（`receiverType` 等）一律傳
    `ts.TypeFormatFlags.NoTruncation`——預設 160 字元截斷會同時造成
    資訊喪失與 stableId 碰撞。
  - 無 receiver 情形給定值、**不**視為 unresolved：函式參數
    ObjectPattern（無 init，如 `privateDataRepository.ts:126-133`）標
    `parameter-pattern:<參數宣告型別>`；init 為空物件預設值（如
    `map.ts:470`）標 `default-empty-object:<contextual 型別>`。
- script 本身須過現行 lint（`scripts/**/*.{js,mjs}` 走
  `js.configs.recommended`＋node globals）與 prettier；風格比照
  `scripts/check-production-bundle.mjs`（ESM／`node:` 前綴匯入／成功時
  單行 summary）與 `scripts/generate-courts-seed.mjs`（`--check` 旗標
  解析、drift→`process.exit(1)` 先例）；**不改 `package.json`、不新增
  任何依賴**（`eslint`／`typescript`／`typescript-eslint` 皆已在
  devDependencies），以 `node scripts/generate-eslint-unbound-manifest.mjs`
  直呼，`--check` 為唯一旗標。

## 交付二：manifest 兩檔（由交付一實跑產出）

- `docs/arch-eslint-phaseE-unbound-manifest.json`（canonical）與
  `docs/arch-eslint-phaseE-unbound-manifest.md`（同一 JSON render 的
  reviewer 視圖：總表＋逐檔分組＋family 統計）。`.md` 表格欄位一律跳脫
  `|`／反引號／換行；長字串（`receiverType` 等）在 `.md` 截斷並標省略
  記號、完整值以 `.json` 為準；總表只放導航必要欄位。
- 每筆欄位（欄位缺漏＝schema 違規，script 直接 exit 非 0；與硬 gate 的
  `unresolvedDeclarationCount` 是兩件事）：`stableId`、`rule`、
  `messageId`（`unbound`／`unboundWithoutThisAnnotation`——規則輸出的
  現成訊號，直接支撐 `this-void-declaration` 分類）、
  `path`、`line`／`column`（導航）、`astPath`、`expressionFingerprint`、
  `owner`（factory／component／module 歸屬）、`receiverType`、
  `declarationPath`／`declarationKind`、`thisUsage`
  （`none`／`reads-this`／`ambient-no-body`／`unresolved`。判定分兩段：
  TypeChecker 負責跨檔／轉發匯入把 declaration 定位到正確節點——Phase D
  對立審查已註記字面 grep 抓不到轉發匯入的 receiver 依賴；是否引用
  `this` 則對 declaration body 做 AST walk 找 `ts.SyntaxKind.ThisKeyword`
  ——**TypeChecker 無現成 usesThis API**。walk 規則固定：巢狀 arrow 內
  的 `this` 計入；巢狀 `function`／class method／object method 內的不計
  （各有自身 receiver）。ambient／`.d.ts` declaration 無 body（如
  `lib.es5.d.ts` 的 `Array.isArray`）標 `ambient-no-body`，其
  `declarationPath` 允許 `node_modules/...` 相對路徑，不計入
  unresolved）、`transferSink`（prop／option bag／listener／
  timer／promise callback…）、`invocationStyle`、
  `identitySensitivity`（remove-listener／effect dep／memo 等）、
  `family`、`proposedFixClass`（`this-void-declaration`／
  `function-property-contract`／`behavior-batch`／`needs-review`）、
  `tests`（載重測試檔初判，可為空陣列）、`reviewStatus`（初值
  `machine-classified`）。
- **分類誠實紀律**：`thisUsage` 與 `proposedFixClass` 由機器判定＋規則
  化推導；無法確定者如實標 `needs-review`，**禁止**為了讓統計好看而
  樂觀歸類。`sessionController.ts` 63 筆與 Phase D 初判（七家族
  this-free closure）對照，不一致處逐筆列出說明。

## 抽樣人工核對（必交付，回報附逐筆）

- 機器分類完成後抽 **12 筆**人工核對（防偽引用 declaration 原文）：
  七家族各 1（7 筆）＋七家族外 5 筆。**注意兩套分類體系不可混用**：
  「七家族」是 D 回報 §10.5 對 `sessionController.ts` 63 筆的內部分類；
  plan §3 是全庫 8 列風險分類。5 筆必含：plan §3 唯一標
  「this-sensitive 風險較高」的 `lifecycleActionsController.ts:230`
  （API method 擷取後呼叫）1 筆、「中等風險」的
  `privateDataRepository.ts` `loadCourts` injection 1 筆、「需查實作後
  判定」的 surface lifecycle 類（`sheets.ts` 或 `sheets/*.tsx`）2 筆、
  false-positive 對照組（如 `map.ts:470` callback default）1 筆。核對項：receiverType 正確、
  declaration 定位正確、thisUsage 判定正確、family 歸屬合理。

## 解凍清單（Q3 守則：未列即凍結）

- 新檔 ×3：`scripts/generate-eslint-unbound-manifest.mjs`、
  `docs/arch-eslint-phaseE-unbound-manifest.json`、同名 `.md`。

**仍凍結**：`src/**` 全部、`tests/**` 全部、`eslint.config.js`、
`tsconfig.json`、`package.json`、`package-lock.json`（不得新增依賴）、
bundle gate、`unbound-method` off 現況、databaseTypes override——
**全部零 diff**（這是本批最重要的驗收條件）。

## Ground truth（2026-08-28 開單實測；動手前自行重驗）

- 債現況（Phase D 後，HEAD `11c67e0`）：`unbound-method` 246 findings／
  28 檔（`sessionController.ts` 63）；generated ledger 2（redundant，
  `databaseTypes.ts:1933`／`:1949`）。
- 七家族行號（Phase D 回報 §10.5，對立審查抽驗過）：
  `sessionController.ts:314-328`／`:353-360`／`:379-391`／`:424-435`／
  `:455-465`／`:468`／`:613`；七個 controller 檔字面零 `this`。
- scripts lint 面：`eslint.config.js` 對 `scripts/**/*.{js,mjs}` 套
  `js.configs.recommended`＋node globals；prettier glob 含 scripts。
- 量化基準：main gzip 187,466；total 257,627（餘 1,435 B）；unit 346；
  mock 298 passed／4 skipped；`window.__importAppModule` 110——本批
  **不應**造成任何變動。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

- `git status --porcelain -- src tests eslint.config.js tsconfig.json
  package.json package-lock.json`＝**空**（涵蓋 staged／unstaged／未追蹤
  ——`git diff` 看不到已 staged 與新檔，不可用；凍結面自證，最高優先）。
  另跑全庫 `git status --porcelain` 確認未追蹤新檔恰為解凍清單 3 個＋
  回報檔。
- 產出兩次 byte-identical 自證（兩次 SHA-256）＋`--check` 綠；硬 gate
  五數字逐字。
- lint／prettier:check（含新 script）全綠；typecheck 綠（tsconfig 未含
  scripts，應天然不受影響，跑一次自證）。
- test:session-unit（346）＋test:mock（≥298）作 smoke；**test:local 豁免
  ——豁免前提＝上列凍結面零 diff 自證成立**，若任何 src／tests／config
  出現 diff 則豁免失效、全矩陣必跑。
- bundle 對照（淨 0 B——dist 不受 docs／scripts 影響，跑一次自證）。

## 回報合約

寫 `docs/arch-dispatch-2026-08-28-eslintE1-unbound-manifest-report-codex.md`
（不 commit、不 push），必含：script 設計摘要（AST structural path 與
fingerprint 的正規化規則、family 判則）、硬 gate 五數字逐字、兩次產出
SHA-256、`--check` 三拍（改一 byte→紅→還原→綠）、family 統計表（各
family 筆數＋proposedFixClass 分布）、`sessionController` 63 筆與七家族
初判的對照結果、12 筆抽樣核對表（防偽引用）、`needs-review` 清單、收尾
矩陣逐字、Codex 五問（第 5 問答「基於 manifest 實際統計的 Phase E 修復
切批建議——每小批的 family 範圍、預估筆數、zero-token 可行性、行為批
候選；以及第一個修復小批你會怎麼開」）、未做／疑義／BLOCKED。
