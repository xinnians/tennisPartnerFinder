# ESLint 恢復 Phase D 派工單：no-base-to-string——證明制零行為路線

- 日期：2026-08-28。母文件：
  `docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md` §4D；設計輸入
  ＝Phase C 驗收紀錄的逐筆政策表。
- 開工基準：`de004ac`（Phase C ACCEPTED）之後的最新 main HEAD（working
  tree 應乾淨，否則停手回報）。
- **裁決先行（派工方拍板，取代 Phase C 回報的「4 站 runtime 裁決」初判）**：
  本批全 8 站走**證明制零行為路線**——每站以 construction-site manifest
  證明「實務值恆為 primitive」，然後以 erasable cast 收斂 `String()` 運算
  元；任一站證明失敗（存在真實 object 來源）＝該站 BLOCKED 交裁決，不得
  自行加 runtime guard。理由：
  1. [推論] `profile.ts` 門檻紅線（CLAUDE.md：三級門檻語意零變更）的工程
     推導——紅線文字未明寫防禦性輸入，但 runtime guard 會讓帶自訂
     `toString` 的輸入從「可能通過」變「必然拒絕」，屬 gate 行為變更，
     依零變更精神不採；
  2. `sessionPresentation:86` 的 object case 既有 runtime 已安全
     （`String(object)` 過不了 `GOOGLE_AVATAR_URL` regex→回 `""`）；
  3. 全管線零 runtime token 不變式維持，文案／行為零拍板需求。
     tolerant-cast 有批 6（sessionCriteria／filters unknown 入口）先例。
- 沿用 A–C 紀律：逐檔 esbuild 擦除 raw 全等硬 gate、禁新增 `any`／
  `@ts-ignore`／`eslint-disable`、canary 三拍。
- bundle 硬約束：total gzip 餘 1,435 B；預期淨 0 B，超 gate＝BLOCKED。
- 你不 commit、不 push；working tree 交驗收方。

## 範圍一：`eslint.config.js` 恢復 `no-base-to-string`

以規則名稱唯一字串 `@typescript-eslint/no-base-to-string` 定位（debt
註解文字各條相同，不可用註解定位）：恰刪兩行（該規則 off 行＋其正上方
一行註解），回 `recommendedTypeChecked` error。`unbound-method` off 與 databaseTypes
override 零變更。

## 範圍二：8 筆修復（manifest 開單凍結；動手前同法複驗，多一少一停手）

| 位置 | 運算元 | 修法（erasable cast） | 須交付的 construction-site 證明 |
| --- | --- | --- | --- |
| `profile.ts:22:31` | `value`（`== null` 守衛後） | `value as string \| number` 類 | callers 傳 ntrp：`my_profile` mapper 產出＋表單值——列全呼叫點 |
| `profile.ts:35:27` | `profile?.nick ?? ""` | nick 收斂 cast | `mapCurrentProfile` 產出 `nick: string`——引 mapper 原文 |
| `profile.ts:43:35`／`:60` | `court?.id ?? ""`／`court?.name ?? ""` | court 欄位 cast（**兩欄分開**） | catalogue 全經 `mapCourt`——`.name`＝`asText(row.name)`（string）；`.id`＝`asNumber(row.id)`（**number \| null，非 string**；`CourtSummary.id` 為 `number \| string \| null`）——cast 目標依此如實拆寫，`.id` 不可寫 string |
| `sessionController.ts:738:41` | `reason ?? ""` | `reason as string`（開單實測唯一觸發鏈 `sessionSurfaceViews.js:438-445` 在非空檢查後才呼叫，無 null 路徑；若你選保守 nullable 寫法須註明是介面保守選擇非來源實測） | 檢舉 dialog 的 radio `.value`（DOM string）——列 onSubmit 觸發鏈 |
| `sessionPresentation.ts:86:28` | `value ?? ""`（avatar URL） | cast | auth metadata `avatar_url` 來源＋**既有 regex fail-closed 說明**（object 案已安全） |
| `sessionPresentation.ts:91:21` | `nickname ?? ""` | cast | roster／preview mapper 產出 nickname: string——引 mapper 原文 |
| `taipeiTime.ts:73:24` | `value ?? ""` | cast | `taipeiLocalDateTimeToIso` 全部 callers＝`<input>.value` 字串——全庫列 caller |
- cast 形態自選（運算元或子表達式層），以「erased 後與 HEAD raw 全等」為
  硬判準；cast 目標型別必須如實反映證明到的來源集合（不可為省事全寫
  `string`——nullable 面照實）。
- **runtime 語意逐 token 凍結**：`String()`／`?? ""`／`.trim()`／regex／
  `|| "球"` fallback／`throw` 全部原樣；防禦性 object case 的既有行為
  （含 `[object Object]` 流過的理論路徑）不變。

## 規則 canary（×1 三拍逐字）

修復完成 lint 綠後暫加最小違例：`export const c = String({});`（空物件
字面量；**勿**加具名屬性或 `as object`——規則對字面量自帶 `toString`
屬性會判為使用者自訂而放行，Phase B 已有 canary 不觸發的先例）→lint 紅
指名 `no-base-to-string`→byte-identical 還原→綠；若此例仍不觸發，換規則
文件標準例並回報實測差異。

## 解凍清單（Q3 守則：未列即凍結）

- `eslint.config.js`：恰刪兩行。
- 4 個 source 檔（profile／sessionController／sessionPresentation／
  taipeiTime）：僅 erasable cast（含必要的 `import type`）。
- 開單實測：零測試／importer／文件字面變更；發現需要動即停手回報。

**仍凍結**：`unbound-method` off 與 override；所有測試斷言語意；4 檔全部
runtime 語意（profile 三級門檻紅線特別點名）；`src/data/**`（mapper 是
證明的 ground truth）；`tsconfig`／`package.json`；bundle gate；
`domainTypes.ts`（`import type` 可用不改內容）。

## Ground truth（2026-08-28 開單實測；動手前自行重驗）

- 8 筆 manifest 如上（4 檔；profile 4／sessionController 1／
  sessionPresentation 2／taipeiTime 1）。
- `sessionPresentation:84-92` 原文確認：avatar 有 `GOOGLE_AVATAR_URL`
  regex fail-closed（object 輸入必回 `""`，`"[object Object]"` 不以
  `https://lh` 開頭）；initial 的 `|| "球"` fallback **只對空字串生效**——
  object 輸入的現行為是顯示字元「`[`」（`String({}).trim()` 首字元為
  truthy），本批**維持此理論路徑不變、不裁決文案**（nickname 實務來源
  經 `asText` runtime 守衛恆為 string，object case 實務不可達——證明表
  須引 `valueMappers.ts` 原文）。
- 量化基準（Phase C 後，HEAD `de004ac`）：main gzip 187,466（餘 4,954 B）；
  total 257,627（餘 1,435 B）；unit 346；mock 298 passed／4 skipped；
  `window.__importAppModule` 110；債現況＝2 條 off／256（254 待修＋2
  記帳）。本批後預期：**1 條 off**（unbound-method）／248（246 待修＋2
  記帳）。
- 已知存量 flake `chat-settings-filters-smoke:468`；test:local 污染紅依
  guarded reset 三拍。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／lint（真 config 全綠）／prettier:check／build／
check:production-bundle（淨值，超 gate＝BLOCKED）／test:mock（≥298）／
test:local（不豁免）／`git diff --check`／**4 檔逐檔 esbuild 擦除 raw
全等（無例外表）**／`unbound-method`＋override 以暫時全開法重掃對照
（246／ledger 2；漂移逐筆解釋）。

## 回報合約

寫 `docs/arch-dispatch-2026-08-28-eslintD-base-to-string-report-codex.md`
（不 commit、不 push），必含：config diff、8 筆逐筆修法表＋**逐站
construction-site 證明**（指令產出的 caller／mapper 清單，防偽引用原文）、
4 檔擦除對帳逐字、規則 canary 三拍逐字、對照表、收尾矩陣逐字、Codex 五問
（第 5 問答「Phase E manifest 產出批的執行建議——以你在 Phase C §10.5
提的 stable ID／欄位方案為基礎，給出具體產出流程（工具、輸出檔、
checksum gate）與首批 `sessionController.ts` 63 筆的抽樣分類預覽」）、
未做／疑義／BLOCKED。
