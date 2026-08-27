# 批 6B 派工單：狀態三檔 TS 化（requestGate／sessionIntent／filters）

- 日期：2026-08-27。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`
  （批 6 主體切批 6B）；前批：6A ACCEPTED（`69d8c79`，樣板四紀律成立）。
- 開工基準：`69d8c79` 之後的最新 main HEAD（working tree 應乾淨，否則停手回報）。
- 沿用 6A 四紀律：**annotation-only 轉換**（禁新增 `any`／`@ts-ignore`／
  `eslint-disable`；三檔現況零既存 suppression）、**importer 副檔名全同步**、
  **appRuntime 映射（本批有真實使用者，見下）**、**strict 納入探針三拍**。
- **順序紀律（6A 回報 §9.5 採納）**：`requestGate`→`sessionIntent`→`filters`，
  逐檔走完「改名→importer 同步→strict 探針→typecheck 綠」再進下一檔；
  不得三檔齊改再一次除錯（歸因會糊掉）。
- bundle 硬約束：total gzip 餘 1,428 B；預期近零變動（appRuntime 是 test
  fixture 不進 bundle），超 gate＝BLOCKED。
- 你不 commit、不 push；working tree 交驗收方。

## 範圍：三檔 `.js` → `.ts`

| 檔案 | 行數 | importer 檔數（開單實測，動手前指令複驗） |
| --- | ---: | --- |
| `src/requestGate.js` | 55 | 4（src 4：chatController／discoveryMapController／main.js／sessionController.js） |
| `src/sessionIntent.js` | 78 | 4（src 1：profileAuthFeature＋tests 3：session-controller.test.js／session-data-boundary.test.js／session.spec.js） |
| `src/filters.js` | 214 | 11（src 9＋tests 2：filters.test.js／session-data-boundary.test.js） |

三檔互不 import；`filters.js` 已 import 6A 的 `.ts` leaf（含 `:4` 的
`export { isJoinableSession } from "./sessionCriteria.ts"` re-export，保留原樣）。
全庫無這三名的動態 `import(`（開單實測）。

## appRuntime 映射（與 6A 的關鍵差異）

`__importAppModule("filters")` 有 **3 個真實呼叫點**：
`tests/chat-settings-filters-smoke.spec.js:475`／`:515`／`:591`。因此：

- `tests/fixtures/appRuntime.js` 的 `APP_MODULE_EXTENSIONS` **必補**
  `filters: ".ts"`（現表只有 districts／map／pins；不改任何呼叫點）。
- `requestGate`／`sessionIntent` 兩名 grep 為零使用（動手前複驗），**不加**。
- **映射載重 canary（三拍必附）**：改名＋補映射全部完成後，暫時移除
  `filters: ".ts"` 映射→單跑一條使用該映射的測試（建議
  `npx playwright test tests/chat-settings-filters-smoke.spec.js:515
  --project=desktop-chromium`）→紅（import `/src/filters.js` 404）→
  byte-identical 還原→綠。證明映射不是裝飾。
- 注意：同檔 `:468` 是已知存量 flake（獨立任務 task_d6de363e）；canary 目標
  是 `:515` 那條，若遇偶發紅用 `--repeat-each` 取樣分類，不可與 canary 結果
  混為一談。

## 各檔紅線（一票否決，零行為變更）

### `requestGate.js`

- generation／staleness 語意（`capture` 閉包比對＋`isCurrent()`）零變更。
- poller 兩處 visibility 條件是**刻意不同**的：interval tick 用
  `visibilityState !== "hidden"`（:41）、visibilitychange 用 `=== "visible"`
  （:35）——不得「統一」。
- `timer?.unref?.()`（:43）與所有 `?.` optional 呼叫鏈 token 不變。timer 型別
  是已知難點：跨 browser（number）／Node（Timeout）——建議
  `ReturnType<typeof setInterval> | null`；若 `unref` 存取需要 narrowing，用
  可擦除的結構型別 assertion，不得改 runtime 寫法。
- `visibilityTarget = globalThis.document` 預設值 token 不變；型別用最小
  structural interface（tests 傳 fake，不得強加 DOM `Document`）。

### `sessionIntent.js`（安全敏感：登入後續動作的唯一持久面）

- exact-key fail-closed 檢查逐字保留：`Object.keys(intent).sort()`＋
  `keys.length` 精確比對＋鍵名逐一比對；**不得為型別方便放寬未知 key**。
- `Number.isSafeInteger(intent.sessionId) && intent.sessionId > 0` 零變更。
- malformed JSON→清除（`removeItem`）語意、`sessionStorageOrNull` 的
  try/catch、`PENDING_SESSION_INTENT_KEY` 字面零變更。
- 建議 `PendingSessionIntent` discriminated union＋最小 Storage port
  interface（`getItem`／`setItem`／`removeItem`）；`JSON.parse` 後以
  narrowing／type predicate 表達現有檢查，不改檢查本體。

### `filters.js`

- `BANDS` 字面逐字元保留（en-dash「3.0–4.0」、「≤ 3.0」、「5.0 +」的空白
  與哨兵 0／9）；開區間公式 `sessionMax > band.min && sessionMin < band.max`
  （:89）零變更。
- 產品決策不可被「型別整理」波及：badge 只數 types＋districts
  （`countActiveFilters`）；`isDefaultFilters` 不得簡化為 badge===0；
  `NOW_START_DISCOVERY_WINDOW_MS` 與 undecided candidate 分支；sort 的
  priority→distance→startAt→index 穩定性 tiebreak。
- `DEFAULT_FILTER_STATE` 含共享可變 `new Set()` 參照——現況如此，**不得**
  借型別化改成 factory 或 readonly 化 runtime；建議以 `satisfies` 固定
  `BANDS`／`DEFAULT_FILTER_STATE` 形狀（6A 回報 §9.5）。
- `now = new Date()`／`filters = DEFAULT_FILTER_STATE` 等預設參數 token 不變。
- 入口 tolerant（sessions 可非陣列、filters 可 null／partial、types 可
  Set／array／其他）：優先檔內 structural input types；session 欄位型別可
  `import type { SessionSummary } from "./domainTypes.ts"`（:13 已有），但
  runtime 入口寬容度不得收窄；新增共用型別需說明落點理由（6A 紀律）。

## 解凍清單（Q3 守則：未列即凍結）

- 三檔本體（改名＋annotation）。
- 全部 importer 的 import 路徑副檔名字串（上表 19 檔，以指令列全不手數）。
- `tests/fixtures/appRuntime.js`：僅 `APP_MODULE_EXTENSIONS` 補 `filters: ".ts"`
  一鍵。
- 兩處指涉 `filters.js` 的**註解字面**同步改 `filters.ts`（僅副檔名）：
  `src/views/sessionFormViews.js:186`、`tests/session-data-boundary.test.js:935`
  ——讓裸字面反掃收斂歸零。
- 測試內寫死 `<name>.js` 路徑字面：除上列註解外開單實測為零；動手前複驗，
  有新增才解凍該行並逐一列出。

**仍凍結**：三檔 runtime 語意（見紅線）；importer 檔其餘內容；
`tsconfig`／`eslint.config.js`／`package.json`；所有測試斷言語意；bundle gate；
`domainTypes.ts`（`import type` 既有定義可用，不改其內容）。

## Ground truth（2026-08-27 開單實測；動手前自行重驗）

- `appRuntime.js:2`：`APP_MODULE_EXTENSIONS = Object.freeze({ districts: ".ts",
  map: ".ts", pins: ".ts" })`；缺映射 fallback `.js`，改名後未補映射的
  `__importAppModule("filters")` 會 404。
- 三檔零既存 `eslint-disable`／`@ts-ignore`／`any`；`.ts` ruleset 不含 core
  `js.configs.recommended`（6A 驗收確認），無 no-extra-boolean-cast 類問題。
- 量化基準（6A 後，HEAD `69d8c79`）：main gzip 187,470（餘 4,950 B）；
  total 257,634（餘 1,428 B）；unit 346；mock 298 passed／4 skipped；
  `window.__importAppModule` 口徑 110（本批不改呼叫點，應不變）。

## Strict 納入探針（三檔各一，三拍逐字輸出）

同 6A：任一行 `const probe: number = "x";` → `npm run typecheck` 紅且指名
該檔:行 → byte-identical 還原（sha256 前後比對）→ 綠。

## 行為覆蓋盤點（必交付）

逐檔列出覆蓋其行為的既有測試（測試檔:測試名，指令佐證非記憶）。特別注意：
**`requestGate.js` 零直接測試 importer**（開單實測）——其覆蓋只能來自
controller／e2e 間接面，如實盤點；若某 export 零行為覆蓋，如實標注記入
驗收紀錄，不強制補測。

## 不在範圍

- 6C–6F 各檔；拆檔；ESLint 規則恢復；`domainTypes.ts` 內容變更；新依賴；
  UX／行為／文案變更；`:468` 存量 flake 處理。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／lint／prettier:check／build／check:production-bundle（對照基準＋
淨值，超 gate＝BLOCKED）／test:mock（≥298）／test:local（production import 面
變更，不豁免；污染紅依 guarded reset 三拍；偶發依取樣分類）／
`git diff --check`／反掃：主掃
`rg "from ['\"][^'\"]*/(filters|requestGate|sessionIntent)\.js" src tests`
歸零；裸字面補掃 `rg "(filters|requestGate|sessionIntent)\.js" src tests`
在兩處註解改畢後應**全零**（本批無 playwright.config 類豁免），殘留逐筆說明。
已知範圍外殘留（不處理，回報如實記錄即可）：`ds-bundle/components/` 內
`Sheet.html:62`／`Chips.html:56`／`Buttons.html:77` 三處 `src/filters.js`
設計文件引文——不入任何 build／CI／測試守門，留待文件批。

## 回報合約

寫 `docs/arch-dispatch-2026-08-27-batch6B-state-ts-report-codex.md`（不 commit、
不 push），必含：每檔轉換 diff 摘要（annotation-only 自證；型別擦除 token
對帳沿用 6A 方法）、importer 同步清單（指令產出）、appRuntime 映射處置＋
**映射載重 canary 三拍逐字**、strict 探針 ×3 三拍逐字、行為覆蓋盤點表
（requestGate 間接覆蓋如實）、反掃逐字、bundle 淨值、`__importAppModule`
對帳、收尾矩陣逐字輸出、Codex 五問（第 5 問答「對 6C 的建議——sheets
contract leaf＋`sheets.ts` 機械轉換的難點：三個 configure* bridge 的型別
落點、`tests/react-surface-lifecycle.test.js:13` readFileSync 路徑連動、
E 群斷言、sheets-dom 動態 import 與 importer 面」）、未做／疑義／BLOCKED。
