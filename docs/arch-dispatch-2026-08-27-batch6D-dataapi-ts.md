# 批 6D 派工單：`dataApi.ts`——typed forwarding facade

- 日期：2026-08-27。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`
  （批 6 主體切批 6D）；前批：6C ACCEPTED（`cb41b85`）。
- 開工基準：`cb41b85` 之後的最新 main HEAD（working tree 應乾淨，否則停手回報）。
- 沿用 6A–6C 紀律：annotation-only（禁新增 `any`／`@ts-ignore`／
  `eslint-disable`；`dataApi.js` 現況零既存 suppression）、importer 副檔名全
  同步、strict 探針三拍、型別擦除 token 對帳（esbuild）。`prefer-const` 類
  `.ts` ruleset 衝突若再出現：先停手回報候選最小方案待裁決（6C 先例），
  不得自行選路。
- **本批是隱私邊界檔**：`dataApi` 是唯一瀏覽器資料邊界（CLAUDE.md／
  supabase.md 紅線）。型別化不得增刪任何 export、不得改任何 forwarding 目標。
- bundle 硬約束：total gzip 餘 1,435 B；預期近零，超 gate＝BLOCKED。
- 你不 commit、不 push；working tree 交驗收方。

## 範圍：`src/dataApi.js`（80 行）→ `src/dataApi.ts`

採 6C 回報 §9.5 的 typed forwarding surface 方案：

- 檔內推導 `type DataApi = ReturnType<typeof createDataApi>`；**不改**
  `src/data/repositories/dataRepository.ts`（不加 export type——src/data/ 全
  凍結，型別放 facade 檔內即可，縮小解凍面）。
- 38 條 forwarding arrow 逐條補 `(...args: Parameters<DataApi["<method>"]>)`
  ——`(...args)` 在 strict 下是 implicit any，必須逐條註記；回傳型別靠推導，
  不手寫（手寫模型會漂移）。方法名字串必須與 forwarding 目標同名（型別層
  自然強制：名字打錯即 typecheck 紅）。
- re-export 區塊（authApi ×6、`isSupabaseConfigured`、dataErrors ×4、
  profileMappers ×4、sessionMappers ×5、`createDataApi`、selects ×11）與
  `const defaultDataApi = createDataApi();` 逐 token 零變更；
  `from "./supabaseClient.js"` 維持 `.js`（supabaseClient 不在本批）。

## 紅線（一票否決）

- **export 面零增刪**：改名前後 export 名集合逐一相等（指令對帳，
  Node import 列舉前後比對）。
- 38 條 forwarding 的 runtime token 零變更（擦除後 `(...args)=>
  defaultDataApi.<m>(...args)` 原樣）；forwarding 目標方法名零改動。
- `src/data/**` 與 `src/supabaseClient.js` 全數零 diff——含
  `privateDataApiLoader = () => import("./privateDataRepository.ts")` 的
  lazy chunk 邊界（在 dataRepository.ts，本批零接觸）與
  `privateDataRepository.ts:324` 的 `p_line_id: null` 凍結呼叫點
  （CLAUDE.md 說「`src/dataApi.js` 仍必須傳」是指經此邊界的鏈路，實際
  呼叫點在 private repository，本批不動）。
- error contract（`SESSION_ACTION_CODES`／三個 error class identity）只
  re-export，不 wrap、不收窄、不新增型別別名。
- bundle：`privateDataRepository` 仍須是獨立 lazy chunk
  （check:production-bundle 輸出自證）。

## 解凍清單（Q3 守則：未列即凍結）

- `dataApi.js` 本體（改名＋annotation）。
- 9 個 import edge 副檔名字串（開單實測；動手前指令複驗）：
  - static 8 檔：`src/controller/intentController.ts`、
    `src/features/notifications/notificationFeature.ts`、
    `src/features/presence/presenceFeature.js`、
    `src/features/profile/profileOrchestrationFeature.js`、`src/main.js`、
    `tests/notification-data-api.test.js`、
    `tests/session-data-boundary.test.js`、
    `tests/session-data-local-api.test.js`；
  - 動態 1 行：`tests/session-presentation-boundary.test.js:46`
    `await import("../src/dataApi.js")`。
- `tests/fixtures/appRuntime.js`：`APP_MODULE_EXTENSIONS` 補 `dataApi: ".ts"`
  一鍵（`__importAppModule("dataApi")` 呼叫點：`tests/session.spec.js:358`、
  `tests/auth-forms-smoke.spec.js:1062`；依 6B ground truth，不要求 404
  canary，相關測試實跑綠即可）。
- `tests/session-data-boundary.test.js:440`：regex 內 `dataApi\.js` 副檔名
  字面同步為 `dataApi\.ts`（**僅副檔名**；不動其餘斷言邏輯、guard 與訊息
  文字——這是封條路徑同步，比照 lifecycle `:13` 先例）。
- `eslint.config.js` **僅兩處副檔名字面**（機制性，不同步則 lint 必假紅）：
  `:109` `ignores` 陣列與 `:156` `files` 陣列各一處 `"src/dataApi.js"`→
  `"src/dataApi.ts"`。背景：`:109` 讓 facade 豁免「禁 import
  supabaseClient／mappers／repositories」的邊界規則，`:156` 給它較窄的
  override——不同步則改名本身就讓 `dataApi.ts` 被套上它本應豁免的
  `no-restricted-imports`，lint 紅與程式邏輯無關。除這兩字面外
  `eslint.config.js` 其餘全凍結（規則語意零變更）。
- 註解／規則字面僅副檔名（6C 先例）：
  - `src/mockData.empty.js:1` 註解；
  - `CLAUDE.md:45`／`:67`／`:108` 三處；
  - `.claude/rules/supabase.md:4`（**機制性**：frontmatter `paths:` glob，
    不同步則 `dataApi.ts` 不再自動掛載該規則檔）、`:47`、`:138`；
  - `README.md:119`、`supabase/README.md:5` 兩處說明行。

**仍凍結**：`src/data/**` 全部；`src/supabaseClient.js`；所有測試斷言語意
（`:440` 只改 regex 副檔名字面）；`mountSheet` 等他檔；`tsconfig`／
`package.json`；`eslint.config.js` 除上列兩字面外全部；bundle gate；
`domainTypes.ts`。

## Ground truth（2026-08-27 開單實測；動手前自行重驗）

- `dataApi.js` 結構：1 runtime import＋**32** 個 re-export 名（authApi 6＋
  isSupabaseConfigured 1＋dataErrors 4＋profileMappers 4＋sessionMappers 5＋
  createDataApi 1＋selects 11）＋`defaultDataApi`＋38 條 forwarding arrow；
  零 suppression。38 個 forwarding 目標名與 `dataRepository.ts:222-259`
  回傳物件 key 集合逐字相同（開單指令對帳）。
- `createDataApi`（`dataRepository.ts:72`）：destructured options 帶預設
  （client／configured／五組 mock／`now`／`privateDataApiLoader`），
  `RepositoryOptions` 型別已存在於 strict 實作側。
- **一處文字封條連動**：`tests/session-data-boundary.test.js:440` 以
  readFile＋regex 掃 `notificationFeature.ts` 的
  `from "\.\.\/\.\.\/dataApi\.js"` import 區塊，且 `:442` 有非空 guard——
  importer 副檔名改 `.ts` 後 regex 不匹配即大聲紅；見解凍清單。
- 量化基準（6C 後，HEAD `cb41b85`）：main gzip 187,466（餘 4,954 B）；
  total 257,627（餘 1,435 B）；unit 346；mock 298 passed／4 skipped；
  `window.__importAppModule` 110（本批不改呼叫點，應不變）。

## Strict 納入探針（×1 三拍逐字）

`src/dataApi.ts` 加 `const probe: number = "x";` → typecheck 紅指名 → 
byte-identical 還原（sha256）→ 綠。另附**typed forwarding 有牙自證**：任選
一條 forwarding，暫時把 `Parameters<DataApi["X"]>` 的 `"X"` 改成不存在的
方法名 → typecheck 紅（證明 38 條註記真的綁到方法集合，不是裝飾字串）→
byte-identical 還原 → 綠。

## 行為覆蓋盤點（必交付）

逐類列出載重測試（session-data-boundary／notification-data-api／
session-data-local-api／session-presentation-boundary 的邊界斷言；mock／
local 的資料流 journey），指令佐證非記憶；export 面對帳輸出（前後列舉
diff 為空）視為覆蓋證據之一。

## 不在範圍

- 6E–6F；`src/data/` 任何變更；`supabaseClient.js`／`mockData*` TS 化；
  拆檔；ESLint 規則恢復；新依賴；UX／行為／錯誤碼變更。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／lint／prettier:check／build／check:production-bundle（對照基準＋
淨值＋`privateDataRepository` lazy chunk 仍在，超 gate＝BLOCKED）／
test:mock（≥298）／test:local（資料邊界檔，不豁免；污染紅依 guarded reset
三拍；偶發依取樣分類）／`git diff --check`／反掃三條全零：
`rg "dataApi\.js" src tests`、`rg "dataApi\.js" CLAUDE.md .claude`、
`rg "dataApi\.js" README.md supabase/README.md eslint.config.js`；
型別擦除 token 對帳（預期 raw 全等——本批無核可例外；若出現
`prefer-const` 類衝突，停手回報裁決）。

## 回報合約

寫 `docs/arch-dispatch-2026-08-27-batch6D-dataapi-ts-report-codex.md`（不
commit、不 push），必含：轉換 diff 摘要（annotation-only 自證＋擦除對帳
逐字）、export 面前後對帳、importer 同步清單（指令產出）、appRuntime 處置、
strict 探針＋forwarding 有牙自證各三拍逐字、行為覆蓋盤點表、反掃逐字、
bundle 淨值（含 lazy chunk 自證）、`__importAppModule` 對帳、收尾矩陣逐字、
Codex 五問（第 5 問答「對 6E `sessionController.js` TS 化的建議——檔案
規模與 edge 盤點、controllerApiContract 既有 strict 契約的接縫、是否需要
先拆或直接機械轉、預估難點順序」）、未做／疑義／BLOCKED。
