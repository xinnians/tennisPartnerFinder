# 批 6E 派工單：`sessionController.ts`——組裝層機械轉換

- 日期：2026-08-27。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`
  （批 6 主體切批 6E）；前批：6D ACCEPTED（`eb9c73e`）。
- 開工基準：`eb9c73e` 之後的最新 main HEAD（working tree 應乾淨，否則停手
  回報）。
- 沿用 6A–6D 紀律：annotation-only（禁**新增** `any`／`@ts-ignore`／
  `eslint-disable`）、importer 副檔名全同步、strict 探針三拍、esbuild 擦除
  token 對帳。**直接機械轉，不拆檔**（6D 回報 §9.5 採納：拆分與 annotation
  同批會失去 token 對帳能力）。
- **`prefer-const` 類衝突處置（6C 先例，本檔 711 行風險高）**：type-aware
  ruleset 逼出 runtime 改寫時停手——但**一次掃完全檔、列全所有衝突點**（每
  點附「宣告-賦值間零引用」grep 自證與建議最小改法）一併交裁決，不逐點
  來回；裁決前不動 runtime。
- bundle 硬約束：total gzip 餘 1,435 B；無裁決例外時預期淨 0 B，超 gate＝
  BLOCKED。
- 你不 commit、不 push；working tree 交驗收方。

## 範圍：`src/sessionController.js`（711 行）→ `src/sessionController.ts`

- 2 個 runtime export：`groupMySessions`（`:34` re-export）、
  `createSessionController`（`:41`）。
- factory options destructure（`:41-69`）共 27 成員：`api`＋`mapTools`＋
  **20 個 callback 預設**（`:44` `render` 至 `:63` `showCreatedSession`，含
  `onAuthIdentityChange`）＋`intentStore`／`toast`／`visibilityTarget`／兩個
  poll interval——建檔內最小 `SessionControllerOptions`，**如實保留 tolerant
  預設**（unit fakes 大量注入部分實作，不得收窄成完整 DOM／Supabase 型別）。
  `api` 用最小 data port（依實際呼叫面或既有 subcontroller options 交集
  推導），**不得**引 70-export `dataApi` facade 型別作依賴。
- JSDoc 型別 anchor **共 5 處，窮舉勿漏**（開單實測）：`:75`
  `@type Store<SessionControllerState, ControllerEventName>`；`:397` 與
  `:455` 各自獨立的 `@returns ControllerSurfaceHandle | null | undefined`；
  `:463` `@returns Promise<ControllerOpenSessionResult>`；`:586`
  `@returns Promise<void> | void`——轉為等價 erasable TS annotation
  （JSDoc 註解行可刪）；**其他敘述性註解逐字保留**。
- 型別優先重用 `controllerContracts.ts` 既有 export（state 27 欄、event、
  surface、open-session result 等）與 `import type`；新增共用型別需說明
  落點理由。
- 難點順序（6D 回報 §9.5）：callback signatures→store 27 欄與 Map generic→
  surface transition union→7 個 subcontroller options 結構相容→async gate／
  auth snapshot narrowing→DOM visibility/timer port→catch `unknown`。每完成
  一層跑 typecheck，最後做單一全檔擦除對帳。

## 既存 suppression 預裁決

`:574` `// eslint-disable-next-line no-useless-assignment`：該規則來自 `.js`
ruleset（`js.configs.recommended` 面），`.ts` ruleset（typeChecked）不含之
——比照 **6A** `no-extra-boolean-cast` 先例
（`docs/arch-reports/batch-6A-leaf-ts-acceptance-2026-08-27.md` 偏差核可項，
`sessionCriteria.ts`），**移除該註解行**（comment-only，
無 runtime token；被註解的下一行 runtime 原樣保留），回報附 lint 綠證明；
若實測 `.ts` 下該規則仍會報（假設錯誤），停手回報，不得改 runtime 或留
unused directive。

## 紅線（一票否決）

- 兩個 export 的簽名、名稱、預設值零變更；`typecheckControllerApi` 橋
  （`controllerApiContract.ts:4-19` 的 `ReturnType`＋雙向 exact-key check）
  原樣保留——`:2` 只改 import 副檔名；**不得**讓 `sessionController.ts`
  反向 import `controllerApiContract.ts`。
- 所有 runtime 邏輯、字面、順序、閉包結構零變更（Prettier re-wrap 除外）；
  `state.` 27 欄、requestId／generation 守衛、poller 接線、intent resume、
  chat 輪詢、auth epoch 語意全部不動。
- `controllerContracts.ts`／`src/controller/*` 七個 subcontroller／
  `surfaceRegistry` 零 diff（型別接縫靠 typecheck 在組裝呼叫點自然檢查）。

## 解凍清單（Q3 守則：未列即凍結）

- `sessionController.js` 本體（改名＋annotation＋JSDoc→TS＋`:574` 預裁決）。
- 5 個 static importer 僅副檔名（開單實測；動手前指令複驗）：
  `src/controller/controllerApiContract.ts:2`（`import type`）、
  `src/main.js:83`、`tests/session-controller-auth.test.js:4`、
  `tests/session-controller-sequence.test.js:21`、
  `tests/session-controller.test.js:8`。
- `tests/fixtures/appRuntime.js`：補 `sessionController: ".ts"` 一鍵
  （`__importAppModule("sessionController")` 呼叫點：
  `tests/react-page-focus.spec.js:146`、
  `tests/discovery-interactions-smoke.spec.js:654`、
  `tests/auth-forms-smoke.spec.js:1063`；依 6B ground truth 不要求 404
  canary，相關測試實跑綠即可）。
- 註解／文件字面僅副檔名（6C／6D 先例）：`CLAUDE.md:59`、`README.md:115`、
  `src/controllerContracts.ts:65`、`src/views/discoverySurfaceViews.js:212`、
  `src/main.js:471`／`:638`、`tests/session.spec.js:392`、
  `tests/session-controller.test.js:2292`／`:2574`。
- 開單實測：`eslint.config.js` 與各 rule 檔 frontmatter `paths:` **無**
  `sessionController` 字面（不需同步）；tests 無 readFileSync／URL 型封條
  指向本檔。動手前自行複驗四口徑（static／dynamic／readFile／comment）。

**仍凍結**：`controllerContracts.ts`（`:65` 註解副檔名除外）；
`src/controller/**` 其餘全部（`controllerApiContract.ts:2` 副檔名除外）；
`sessionStore.ts`；所有測試斷言語意；`tsconfig`／`eslint.config.js`／
`package.json`；bundle gate；`domainTypes.ts`。

## Ground truth（2026-08-27 開單實測；動手前自行重驗）

- `.claude/worktrees/` 下兩個殘留 git worktree 含大量 `sessionController.js`
  字面——它們是獨立 detached 工作樹（`.git/info/exclude` 已排除），**不在
  本批範圍，禁止觸碰**；反掃口徑排除之。
- `:574` 是全檔唯一既存 suppression；無 `any`／`@ts-ignore`。
- 量化基準（6D 後，HEAD `eb9c73e`）：main gzip 187,466（餘 4,954 B）；
  total 257,627（餘 1,435 B）；unit 346；mock 298 passed／4 skipped；
  `window.__importAppModule` 110（不改呼叫點，應不變）。

## Strict 納入探針（×1 三拍）＋契約橋有牙自證

- `sessionController.ts` 加 `const probe: number = "x";` → typecheck 紅指名
  → byte-identical 還原（sha256）→ 綠。
- **橋有牙自證**（本批專屬）：暫時把 factory 回傳物件中任一方法改名（如
  `refreshDiscovery` → `refreshDiscoveryX`）→ typecheck 應在
  `controllerApiContract.ts` 的 exact-key check 紅（missing＋extra 同時報）
  → byte-identical 還原 → 綠。證明改名後 `ReturnType` 橋仍載重。

## 行為覆蓋盤點（必交付）

三個 controller unit 檔（session-controller／-auth／-sequence）的載重面
逐類列出（指令佐證）；mock／local journey 對 factory 行為的間接覆蓋；
零覆蓋 export／分支如實標注。

## 不在範圍

- 6F；拆檔；subcontroller／store／contract 變更；ESLint 規則恢復；新依賴；
  UX／行為／文案變更；`.claude/worktrees/` 一切。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／lint／prettier:check／build／check:production-bundle（對照基準＋
淨值，超 gate＝BLOCKED）／test:mock（≥298）／test:local（production import
面變更，不豁免；污染紅依 guarded reset 三拍；偶發依取樣分類）／
`git diff --check`／反掃兩條全零（排除 `.claude/worktrees`）：
`rg "sessionController\.js" src tests eslint.config.js`、
`rg "sessionController\.js" CLAUDE.md README.md .claude/rules`／
esbuild 擦除 token 對帳（無裁決例外時預期 raw 全等；有裁決例外時逐點
正規化後全等，比照 6C 格式列 before/after）。

## 回報合約

寫 `docs/arch-dispatch-2026-08-27-batch6E-controller-ts-report-codex.md`（不
commit、不 push），必含：轉換 diff 摘要（annotation-only 自證＋擦除對帳
逐字）、`SessionControllerOptions`／data port 型別設計摘要（tolerant 保真
說明）、JSDoc→TS 轉換清單、`:574` 處置證明、importer 同步清單（指令產出）、
appRuntime 處置、strict 探針＋橋有牙自證各三拍逐字、行為覆蓋盤點表、
反掃逐字、bundle 淨值、`__importAppModule` 對帳、收尾矩陣逐字、Codex 五問
（第 5 問答「對 6F 的建議——features 兩檔（`profileOrchestrationFeature`／
`presenceFeature`）TS 化難點＋type-aware ESLint 9 條恢復的預估衝擊面與
建議順序＋批 6 殘餘盤點（還有哪些 `.js` 該留、哪些該入未來批）」）、
未做／疑義／BLOCKED。
