# 批 6F 派工單：features 兩檔 TS 化＋type-aware ESLint 恢復拆批方案落檔

- 日期：2026-08-27。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`
  （批 6 主體切批 6F；範圍已依 6E 回報 §11.5 調整拍板：**規則恢復不在本批**，
  本批只交付兩檔轉換＋恢復計畫文件）。前批：6E ACCEPTED（`9bdb320`）。
- 開工基準：`9bdb320` 之後的最新 main HEAD（working tree 應乾淨，否則停手
  回報）。
- 沿用 6A–6E 紀律：annotation-only（禁**新增** `any`／`@ts-ignore`／
  `eslint-disable`）、importer 副檔名同步、strict 探針三拍、esbuild 擦除
  token 對帳、逐檔完成再進下一檔（presence→profile）。`prefer-const` 類
  衝突照 6E 流程一次列全裁決（開單靜態掃描預期零：兩檔所有 `let` 或跨
  scope 賦值、或多次賦值）。
- bundle 硬約束：total gzip 餘 1,435 B；預期淨 0 B，超 gate＝BLOCKED。
- 你不 commit、不 push；working tree 交驗收方。

## 交付一：`features/presence/presenceFeature.js`（101 行）→ `.ts`

- 建檔內最小 `PresenceFeatureDependencies` port（`configurePresenceFeature`
  注入面：getAppState／getLocationStatus／setLocationStatus／
  publishMePageView／publishMeSettingsPageView／captureAuthRequest／
  currentProfileEligibility／openProfileCompletion／setProfile／
  defaultProfile／toast——開單實測恰 11 成員，已列全）。
- `presenceTracker` 型別由 `createPresenceTracker`（`playerPresence.js:20`，
  **維持 `.js` import 不轉**）回傳推導；strict 對 JS 推導卡住時用可擦除的
  最小 structural type（`{ start(): boolean; stop(): void }` 類），不改
  `playerPresence.js`。
- 紅線：`configure...` 先注入的 runtime 契約不變（`dependencies` 未注入即
  呼叫＝照舊 throw，不加初始化 fallback）；`isSupabaseConfigured` gate、
  stale-request 檢查、三則錯誤／toast 字面零變更。

## 交付二：`features/profile/profileOrchestrationFeature.js`（261 行）→ `.ts`

- 型別優先重用 `controllerContracts.ts`（`ControllerApi`、
  `ControllerAuthSession`、`ControllerProfileEligibility`，`import type`；
  三者與檔內用法逐欄位吻合，開單已核）；`dependencies` 建檔內 tolerant
  port，**不得**反推成巨型 application interface。開單實測 `dependencies`
  實際用到恰 **20 成員**：captureAuthGateRequest／captureAuthRequest／
  currentAuthAvatarUrl／currentProfileEligibility／defaultProfile／
  getActivePage／getAppState／getController／invalidateAuthRequests／
  localDemoUnavailable／openLoginModal／openProfileCompletionSheet／
  reconcilePageRouteOwner／reconcilePresenceTracking／
  resetNotificationSettings／resetPresenceTracking／
  seedAllTaipeiCourtSubscriptions／setAuthSession／setProfile／showMePage／
  toast（依檔內實際使用面盤點，不從 `main.js` 反推）。
- 主要 narrowing 點（6E 回報 §11.5）：`bootAuthParams` module IIFE、
  `authIdentity(session)` 的 tolerant 入口、`activeProfileCompletion`／
  `mounted` self-reference closure、auth event string、
  `document.querySelector(...)?.focus()`、`sessionStorage` try/catch。
- **`:59` 既存 suppression 預裁決**：`// eslint-disable-next-line
  no-useless-assignment`（`resumeLinkReturn` 的 `let provider = null;`）——
  比照 6A／6E 先例**移除該註解行**（`.ts` ruleset 不含該規則；開單已驗
  `provider` 在 `:62` 有第二次賦值，移除後也不會觸發 `prefer-const`）；
  runtime 行原樣，回報附 lint 綠證明；若實測仍報，停手回報。
- 紅線：boot URL auth params 語意（module 載入時擷取）、link return
  sessionStorage 流程、`openProfileCompletion` 的 identity 比對三處、
  `profileRevision`／`profileLoadStatus`／`storedProfileExists` 狀態機、
  `restoreAuth` 的 candidate 序列化（`latestAuthCandidate`）與
  `bootRestoring` 時序、所有錯誤／toast 字面零變更。

## 交付三：type-aware ESLint 恢復拆批方案落檔（純文件，不動 config）

寫 `docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md`：

- 以 6E 回報 §11.5 的記憶體 override 掃描法**重新實掃**當下 src TS 面，
  逐規則列 findings 數／檔案清單（9 條全列，含 `unbound-method` 的
  this-sensitive vs false-positive 初步分類抽樣）。
- 落五段批序（小量 unsafe-argument/call/return→redundant/assertion 純型別→
  assignment/member-access 資料邊界→base-to-string UI policy→
  unbound-method 專批），每段附範圍、風險與驗收要求草案（沿用 token 對帳
  ＋canary 紀律）；`databaseTypes.ts` generated 檔的 override／generator
  策略列為待拍板項。
- 明文：**本批 `eslint.config.js` 零 diff**；此文件是未來批的派工基礎，
  不是核可執行。

## 解凍清單（Q3 守則：未列即凍結）

- 兩檔本體（改名＋annotation＋`:59` 預裁決）。
- importer 僅副檔名 2 行（開單實測，兩檔唯一 importer 都是 `main.js`）：
  `src/main.js:129`（profileOrchestrationFeature）、`:136`（presenceFeature）。
- 新文件 `docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md`。
- 開單實測為零、動手前自行複驗四口徑：兩名皆零 `__importAppModule`、零
  readFileSync／URL 封條、零註解／規則／文件字面（CLAUDE.md／README／
  `.claude/rules`／eslint.config 皆無）——批 6 最乾淨 edge，若複驗發現
  新增引用，先回報再動。

**仍凍結**：`playerPresence.js`；`src/main.js` 其餘內容；`dataApi.ts`；
`controllerContracts.ts`；所有測試斷言語意；`tsconfig`／`eslint.config.js`
／`package.json`；bundle gate；`domainTypes.ts`；`.claude/worktrees/` 一切。

## Ground truth（2026-08-27 開單實測；動手前自行重驗）

- 兩檔 import 面：presence 用 `dataApi.ts` 四名＋`playerPresence.js`；
  profile 用 `dataApi.ts` 八名；皆已是 `.ts` 邊界，無連鎖改名。
- `:59` 是兩檔唯一既存 suppression；零 `any`／`@ts-ignore`。
- 量化基準（6E 後，HEAD `9bdb320`）：main gzip 187,466（餘 4,954 B）；
  total 257,627（餘 1,435 B）；unit 346；mock 298 passed／4 skipped；
  `window.__importAppModule` 110（本批零 dynamic edge，應不變）。

## Strict 納入探針（×2 三拍逐字）

兩檔各加 `const probe: number = "x";` → typecheck 紅指名 → byte-identical
還原（sha256）→ 綠。

## 行為覆蓋盤點（必交付）

逐 export 列出載重測試（presence／profile 的 unit 面、mock／local 的
auth・profile completion・presence journey），指令佐證非記憶；零覆蓋
export 如實標注。

## 不在範圍

- ESLint 規則實際恢復（另立批，依交付三方案）；`playerPresence.js` 等
  「可隨鄰批」`.js` 的轉換；拆檔；新依賴；UX／行為／文案變更。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／lint／prettier:check／build／check:production-bundle（對照基準＋
淨值，超 gate＝BLOCKED）／test:mock（≥298）／test:local（production import
面變更，不豁免；污染紅依 guarded reset 三拍；偶發依取樣分類）／
`git diff --check`／反掃
`rg "(presenceFeature|profileOrchestrationFeature)\.js" src tests CLAUDE.md README.md .claude/rules eslint.config.js`
全零／esbuild 擦除 token 對帳（預期兩檔 raw 全等；有例外照 6C 格式）。

## 回報合約

寫 `docs/arch-dispatch-2026-08-27-batch6F-features-ts-report-codex.md`（不
commit、不 push），必含：兩檔轉換 diff 摘要（annotation-only 自證＋擦除
對帳逐字）、兩個 dependencies port 設計摘要、`:59` 處置證明、importer
同步（2 行）、strict 探針 ×2 三拍逐字、行為覆蓋盤點表、反掃逐字、bundle
淨值、`__importAppModule` 對帳、恢復方案文件的掃描數據摘要、收尾矩陣
逐字、Codex 五問（第 5 問答「批 6 收官盤點——對照 roadmap 批 6 目標，
還缺什麼？『可隨鄰批』九檔的優先序建議？下一條管線（ESLint 恢復批 vs
main.js/sessionViews 收尾 vs 其他）你會先做哪條、為什麼？」）、
未做／疑義／BLOCKED。
