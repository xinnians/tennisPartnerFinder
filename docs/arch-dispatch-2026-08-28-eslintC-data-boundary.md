# ESLint 恢復 Phase C 派工單：unsafe assignment＋member-access

- 日期：2026-08-28。母文件：
  `docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md` §4C；設計輸入
  ＝Phase B 驗收紀錄（站點經對立審查抽驗）。
- 開工基準：`1ddceac`（Phase B ACCEPTED）之後的最新 main HEAD（working
  tree 應乾淨，否則停手回報）。
- 沿用 Phase A／B 紀律：修法零 runtime token（逐檔 esbuild 擦除 raw 全等
  硬 gate）、禁新增 `any`／`@ts-ignore`／`eslint-disable`、canary 三拍、
  超出裁決面＝停手回報。
- bundle 硬約束：total gzip 餘 1,435 B；預期淨 0 B，超 gate＝BLOCKED。
- 你不 commit、不 push；working tree 交驗收方。

## 範圍一：`eslint.config.js` 兩條恢復

字串比對定位（現況 `no-unsafe-member-access` `:84`／註解 `:83`、
`no-unsafe-assignment` `:86`／註解 `:85`）：恰刪四行，回
`recommendedTypeChecked` error（8.67.0 皆 `'error'`，A／B 已驗方法同源）。
其餘兩條 off（base-to-string／unbound-method）與 databaseTypes scoped
override 零變更。

## 範圍二：10 筆修復（manifest 開單凍結；動手前同法複驗，多一少一停手）

| 位置 | 規則 | 根因（開單實測） |
| --- | --- | --- |
| `src/controller/chatController.ts:125:7` | assignment | `loadSessionMessages` port 回 `Promise<unknown>`，`Array.isArray` 後成 `any[]` 賦給 `ChatMessage[]` |
| `src/features/chat/chatFeature.ts:8:32` | member | `.messageId` on any（readonly Partial<ChatMessage>[] 經 `Array.isArray` 坍縮） |
| `src/filters.ts:179:9`／`:242:9` | assignment | tolerant `sessions: unknown` 經 `Array.isArray` 成 `any[]` 賦給 `SessionInput[]` |
| `src/sessionController.ts:499:55` | assignment | `loadSessionJoinPreview` 結果 spread of any |
| `src/sessionController.ts:500:40`／`:72` | member ×2 | 同源 `.role` on any |
| `src/sessionPresentation.ts:689:76`／`:694:65`／`:694:89` | member ×3 | courts collection `.id`／`.name` on any（Phase A 同款坍縮殘餘站點） |

### 修法（由來源向下游；Phase B §11.5 初判已由開單查證確立）

1. **data port 收斂（chatController／sessionController 四筆的根治）**：
   **分岔條款已關閉**——開單實測兩個 port 的 private 實作皆經 typed
   mapper（`privateDataRepository.ts:265`
   `rowsOrEmpty(data).map(mapSessionMessageRow)`→`ChatMessage`；`:248`
   `.map(mapSessionJoinPreviewRow)`→`SessionJoinPreview`，mapper 簽名
   `sessionMappers.ts:156`／`:179`），**無需 runtime validator、不觸發
   行為批**。將 local port 宣告收斂：`chatController.ts:15`
   `loadSessionMessages?(...): Promise<unknown>`→`Promise<ChatMessage[]>`；
   `sessionController.ts:63` `loadSessionJoinPreview?(...)`→
   `Promise<SessionJoinPreview[]>`（型別落點開單已確認：`domainTypes.ts:77`
   `export interface SessionJoinPreview`、`:100` `export interface
   ChatMessage`——直接 `import type`，不需另尋）。runtime `typeof` 防禦與
   `Array.isArray` 容忍全數原樣。注意 unit fakes 在 `.js` 測試（`checkJs`
   關）不受影響——若 typecheck 在任何 `.ts` 注入點紅，如實回報處置。
2. **collection cast（其餘六筆）**：沿 Phase A `sessionPresentation` 先例
   `(Array.isArray(x) ? x : []) as T[]`——filters 兩處
   `as SessionInput[]`、chatFeature、sessionPresentation 三處 courts。
3. **禁止（＝BLOCKED 交裁決）**：runtime guard／wrapper／validator／新
   statement；任何 erased-token 差異。

## 規則 canary（×2 三拍逐字）

修復完成 lint 綠後逐條暫加最小違例（assignment：
`const v: string[] = JSON.parse("[]");`；member-access：
`export const m = (JSON.parse("{}") ).x;` 類）→lint 紅指名 rule ID→
byte-identical 還原→綠。

## 解凍清單（Q3 守則：未列即凍結）

- `eslint.config.js`：恰刪四行。
- manifest 上的 **5 個 source 檔**（chatController／chatFeature／filters／
  sessionController／sessionPresentation）：僅型別層變更（port 宣告收斂／
  collection cast／必要的 `import type`）。
- 開單實測：零測試／importer／文件字面變更；發現需要動即停手回報。

**仍凍結**：base-to-string／unbound-method 兩條 off 與 databaseTypes
override；所有測試斷言語意；5 檔全部 runtime 語意（`Array.isArray` 容忍、
`typeof` 防禦、`filter(Boolean)`）；`src/data/**`（mapper 是 ground truth
不是解凍面）；`tsconfig`／`package.json`；bundle gate；`domainTypes.ts`
（`import type` 可用，不改內容；需新 export 名＝停手回報）。

## Ground truth（2026-08-28 開單實測；動手前自行重驗）

- 10 筆 manifest 如上（assignment 4／member 6；5 檔）。
- 兩 port 的 typed mapper 鏈證據見修法 1（`bindPrivateMethod` lazy 委派，
  型別流經 `dataRepository.ts:200-201`）。
- 量化基準（Phase B 後，HEAD `1ddceac`）：main gzip 187,466（餘 4,954 B）；
  total 257,627（餘 1,435 B）；unit 346；mock 298 passed／4 skipped；
  `window.__importAppModule` 110；債現況＝4 條 off／266 findings（264 待修
  ＋2 記帳）。本批後預期：2 條 off／256（254 待修＝base-to-string 8＋
  unbound-method 246，＋2 記帳）。
- 已知存量 flake `chat-settings-filters-smoke:468`；test:local 污染紅依
  guarded reset 三拍。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／lint（真 config 全綠）／prettier:check／build／
check:production-bundle（淨值，超 gate＝BLOCKED）／test:mock（≥298）／
test:local（不豁免）／`git diff --check`／**5 檔逐檔 esbuild 擦除 raw
全等（無例外表）**／其餘兩條 off＋override 以暫時全開法重掃對照
（base-to-string 8／unbound-method 246／redundant 記帳 2；漂移逐筆解釋）。

## 回報合約

寫 `docs/arch-dispatch-2026-08-28-eslintC-data-boundary-report-codex.md`
（不 commit、不 push），必含：config diff、10 筆逐筆修法表（port 收斂 vs
cast 分類）、port 型別落點說明、5 檔擦除對帳逐字、規則 canary ×2 三拍
逐字、兩條 off 對照表、收尾矩陣逐字、Codex 五問（第 5 問答「對 Phase D
（base-to-string 8 筆／4 檔）的建議——逐筆的 null／undefined／object
顯示政策初判、哪些可 zero-token、哪些必然要 runtime 文案裁決；以及對
Phase E unbound-method 246 筆分類 manifest 的產出方式建議」）、未做／
疑義／BLOCKED。
