# 批 6C 派工單：surface contract leaf＋`sheets.ts` 機械轉換

- 日期：2026-08-27。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`
  （批 6 主體切批 6C）；前批：6B ACCEPTED（`8d4c1b2`）。
- 開工基準：`8d4c1b2` 之後的最新 main HEAD（working tree 應乾淨，否則停手回報）。
- 沿用 6A／6B 紀律：annotation-only（禁新增 `any`／`@ts-ignore`／
  `eslint-disable`；`sheets.js` 現況零既存 suppression）、importer 副檔名全同步、
  strict 納入探針三拍、型別擦除 token 對帳。
- **兩段式（6B 回報 §9.5 採納）**：先建純型別 contract leaf 並 typecheck 綠，
  再機械轉 `sheets.ts`；**不得同一步邊抽 contract 邊改 close／mount 邏輯**。
- bundle 硬約束：total gzip 餘 1,428 B；純型別 leaf 不產 chunk，預期淨 0 B，
  超 gate＝BLOCKED。
- 你不 commit、不 push；working tree 交驗收方。

## 範圍

### Stage 1：新檔 `src/surfaceContracts.ts`（純型別 contract leaf）

- 命名比照既有 `src/controllerContracts.ts`。**只含型別，零 runtime
  statement**；四個 port 各自獨立，不互相硬塞：
  1. shell renderer port：`(root, { className, html, id, label }) =>
     { surface, unmount }`（形狀以 `sheets.js` 呼叫面＋`SurfaceHost.tsx`
     `mountSurfaceShell` 實作面**兩端實測** modeling，不憑記憶）。
  2. keyboard registry port：`register(entry) => unregister`；entry＝
     `{ close, onEscape, restoreFocus, surface }`。
  3. focus registry port：`captureRestoreTarget`／`focusInitial`／
     `restoreFocus`（restore target 形狀對齊 SurfaceHost 的
     `SurfaceRestoreTarget`）。
  4. login modal content port：`(surface, { action, lineProviderId, onClose,
     onProvider }) => { unmount }`（獨立 content contract，不塞進 shell 三
     port）。modeling 依據：`sheets.js:127-133` 呼叫面＋實際 renderer
     `src/app/App.tsx:674` `mountLoginModalContentInApp`（回傳
     `SurfaceHost.tsx:13` **已 export** 的 `SurfaceContentLifecycle`＝
     `{ isSurfaceRootLive(): boolean; unmount(): void }`）；leaf 依呼叫面
     最小需求可只取 `{ unmount }`，或 `import type { SurfaceContentLifecycle }`
     防漂移，回報說明取捨。**注意**：此 port 的 wiring 在
     `sessionViews.js:243`（`.js`、`checkJs` 關閉），不受 strict 交叉檢查，
     型別寫錯不會被 gate 自動攔下，回報須附人工核對證據。
- port 1–3 一律自定最小 structural 型別：`SurfaceShellProps`／
  `SurfaceShellHandle`／`SurfaceKeyboardEntry`／`SurfaceKeyboardRegistry`／
  `SurfaceFocusRegistry`／`SurfaceRestoreTarget` 六型別在 `SurfaceHost.tsx`
  **均未 export**（該檔全檔凍結，不得加 `export`），不能 `import type` 重用
  ——已 export 的只有 `SurfaceContentLifecycle`／`SurfaceSlot`／
  `SurfaceHostSnapshot`。**leaf 不可 runtime import 任何模組**，尤其不可
  import `sheets.ts`（circular）。

### Stage 2：`src/sheets.js`（134 行）→ `src/sheets.ts`

- annotation-only：configure 三 bridge＋login content 的參數型別取自 leaf；
  `mountSurface` options、`surfaceEntry`、`unmountContent` 等內部狀態補註記。
- `import { pushSurfaceIsolation } from "./modalIsolation.js"` 維持 `.js`
  （modalIsolation 不在本批）；strict 對其推導若卡住，用可擦除的最小
  local 型別處理並回報，不得改 modalIsolation、不得 `any`。

## 紅線（一票否決，零行為變更）

- close 序列逐 token 保留：closed 冪等（`if (closed) return;`）→unregister
  keyboard→releaseIsolation→content unmount（catch）→`shell.unmount()`
  try/finally（surfaces.delete／onClose／restoreFocus）→AggregateError 雙錯
  →單錯 rethrow。
- `registerUnmount` 閉合後立即呼叫語意、replace 時保留 previousFocus 的
  註解與行為、`closeSurface` else 分支註解、mount-time click 綁定
  （`[data-surface-dismiss]`／`[data-surface-close]`，非 delegation）零變更。
- `openLoginModal` 公開簽名與 `AUTH_LINE_PROVIDER_ID` 預設、`html: ""`、
  `String(...)` 轉換、五則錯誤訊息字面零變更（`Error` ×4：`:25`／`:31`／
  `:32`／`:126`；`TypeError` ×1：`:41` registerUnmount）。
- **E 群常駐封條 anchor（`tests/react-surface-lifecycle.test.js:157-162`）**：
  `unmountContent?.();`、`shell.unmount();`、`if (closed) return;`、
  `return { root, surface, close, registerUnmount };` 四個字串是對 sheets
  source 的文字封條——annotation-only 下 runtime token 不變即自然保持匹配；
  若任何 anchor 因轉換不匹配＝**停手回報 BLOCKED**，不得改測試斷言遷就。
- **Node importability**：`sheets.ts` 必須維持 Node 直接 import（unit 與
  sheets-dom 是實證）；只可用 erasable syntax——禁 `enum`／`namespace`／
  constructor parameter properties。
- `SurfaceHost.tsx` 除 `:10` import 字串與 `:329` 註解副檔名外**全檔凍結**；
  其 `mountSurfaceShell`／registry 實作不動——typecheck 在 `:330-332` 三個
  configure 呼叫點對 typed 簽名的結構相容檢查，是 **port 1–3** 的 contract
  驗證；port 4 的 wiring 在 `sessionViews.js:243`（不受 strict 覆蓋），須
  另附人工核對。若不相容，修 leaf 型別使其如實反映兩端實況，不修任一端
  runtime。

## 解凍清單（Q3 守則：未列即凍結）

- 新檔 `src/surfaceContracts.ts`。
- `sheets.js` 本體（改名＋annotation）。
- 7 個 static importer 的 import 路徑副檔名字串（開單實測；動手前指令複驗）：
  `src/app/SurfaceHost.tsx:10`、`src/main.js:112`、`src/sessionViews.js:2`、
  `src/views/discoverySurfaceViews.js:2`、`src/views/profileSurfaceView.js:2`、
  `src/views/sessionFormViews.js:2`、`src/views/sessionSurfaceViews.js:1`。
- `tests/react-surface-lifecycle.test.js:13` readFileSync 路徑僅副檔名
  （改名即紅的 interlock，先改先綠）。
- `tests/sheets-dom.test.js:53` `new URL("../src/sheets.js")` 僅副檔名；
  其 query 隔離機制（`url.searchParams.set("dom-test", sequence)`＋plain
  `import(url.href)`）與 `vite.ssrLoadModule` 載 SurfaceHost 的雙軌**不可改**
  ——query 是模組實例隔離，移除會讓 WeakMap／configure singleton 跨 case
  污染。
- `tests/fixtures/appRuntime.js`：`APP_MODULE_EXTENSIONS` 補 `sheets: ".ts"`
  一鍵（`__importAppModule("sheets")` 於 `tests/auth-forms-smoke.spec.js`
  `:17`／`:43`／`:55`／`:128` 四呼叫點）。依 6B 驗收的 ground truth 更正
  （Vite dev 對 explicit `.js` 有 TS fallback，映射屬顯式路徑衛生非自然
  載重），**本批不再要求 404 攔截 canary**；以 auth-forms-smoke 相關測試
  實跑綠為證即可。
- 兩處註解字面僅副檔名：`src/app/SurfaceHost.tsx:329`、
  `tests/account-settings-smoke.spec.js:614`。
- `.claude/rules/react-migration.md` frontmatter `paths:` 內
  `"src/sheets.js"` 僅副檔名同步為 `"src/sheets.ts"`（不動其餘 glob 與
  規則內文）。
- `CLAUDE.md:62` 的 `src/sheets.js` 說明行僅副檔名同步。

**仍凍結**：`sheets` runtime 語意（見紅線）；`SurfaceHost.tsx` 其餘全部；
`modalIsolation.js`；E 群／sheets-dom 全部斷言語意；`mountSheet`／
`mountDialog`／`openLoginModal` 公開簽名與預設值；
`tsconfig`／`eslint.config.js`／`package.json`；bundle gate；`domainTypes.ts`。

## Ground truth（2026-08-27 開單實測；動手前自行重驗）

- `sheets.js` 對外接觸點（src／tests 內）恰 11 處：7 static import＋
  lifecycle `:13`＋sheets-dom `:53`＋2 註解。repo 全域另有 2 處已列入解凍
  清單的殘留：`.claude/rules/react-migration.md` frontmatter `paths:` 的
  `"src/sheets.js"`（**機制性**：這是 context-injection glob，不同步則
  `sheets.ts` 不再自動掛載該規則檔）與 `CLAUDE.md:62` 說明行。
- unit（node --test）直接 import `.ts` 已有既成事實（6B 後
  `tests/filters.test.js` 等直入 `../src/filters.ts`，346 綠）——Node type
  stripping 只接受 erasable syntax，與 annotation-only 紀律同界。
- 量化基準（6B 後，HEAD `8d4c1b2`）：main gzip 187,470（餘 4,950 B）；
  total 257,634（餘 1,428 B）；unit 346；mock 298 passed／4 skipped；
  `window.__importAppModule` 口徑 110（本批不改呼叫點，應不變）。
- `sheets.js`／`modalIsolation.js` 零既存 suppression。

## Strict 納入探針（×2 三拍逐字）

`src/surfaceContracts.ts` 與 `src/sheets.ts` 各加一行
`const probe: number = "x";` → typecheck 紅指名該檔:行 → byte-identical
還原（sha256）→ 綠。（leaf 是純型別檔，探針同時證明它真的進了 tsconfig
範圍，不是只被 import type 掃過。）

## 行為覆蓋盤點（必交付）

逐 export 列出載重測試（`sheets-dom.test.js` 16 條與 E 群為主；
`__importAppModule("sheets")` 的 auth-forms-smoke 四條；mock/local 的
sheet/dialog 流程），指令佐證非記憶；零覆蓋 export 如實標注。

## 不在範圍

- 6D–6F；`modalIsolation.js`／`sessionViews.js`／views 的 TS 化；拆檔；
  ESLint 規則恢復；SurfaceHost 內部重構；新依賴；UX／行為／文案變更。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／lint／prettier:check／build／check:production-bundle（對照基準＋
淨值，超 gate＝BLOCKED）／test:mock（≥298）／test:local（production import 面
變更，不豁免；污染紅依 guarded reset 三拍；偶發依取樣分類）／
`git diff --check`／反掃：`rg "sheets\.js" src tests` 在兩處註解改畢後
**全零**；型別擦除 token 對帳（esbuild，沿用 6A／6B 方法）；
`__importAppModule` 對帳 110。

## 回報合約

寫 `docs/arch-dispatch-2026-08-27-batch6C-sheets-ts-report-codex.md`（不
commit、不 push），必含：leaf 四 port 定義摘要與兩端 modeling 依據、
`sheets.ts` 轉換 diff 摘要（annotation-only 自證＋擦除對帳逐字）、importer
同步清單（指令產出）、appRuntime 處置、strict 探針 ×2 三拍逐字、E 群四
anchor 匹配自證（指令輸出）、行為覆蓋盤點表、反掃逐字、bundle 淨值、
收尾矩陣逐字輸出、Codex 五問（第 5 問答「對 6D `dataApi.ts` 的建議——
80 行 facade 與 `src/data/` 既有 strict 實作的型別接縫、factory／error
code／repository port contract 先凍事項、`p_line_id: null` 凍結呼叫點的
型別表達」）、未做／疑義／BLOCKED。
