# 批 6C 回報：surface contract leaf＋`sheets.ts`

- 日期：2026-08-27
- 派工單：`docs/arch-dispatch-2026-08-27-batch6C-sheets-ts.md`
- 開工 HEAD：`a25f40e`；前批 6B ACCEPTED：`8d4c1b2`。
- 開工 working tree：乾淨。
- 結果：完成；先建立零 runtime emit 的 `surfaceContracts.ts`，再將
  `sheets.js` 機械轉為 strict `sheets.ts` 並同步全部核准路徑。
- 唯一 runtime-token 差異：依驗收方核可，將 declare-then-assign 的
  `surfaceEntry` 合併為 `const`；其餘 erased runtime token 逐 token 全等。
- Git：未 commit、未 push。

## 1. 開工基準與計畫裁決

開工前重驗：7 個 static importer、lifecycle readFileSync、sheets-dom URL、2 個
註解及 repo 兩個規則／說明殘留都與派工單一致；`window.__importAppModule` 為 110，
auth smoke 有 4 個 `__importAppModule("sheets")` 呼叫點。

```text
$ npm run typecheck
EXIT_CODE=0

$ npm run build
✓ 508 modules transformed.
main 638939/187470
total JS 841563/257634
✓ built in 1.37s

$ npm run test:session-unit
# tests 346
# pass 346
# fail 0
EXIT_CODE=0
```

兩段式計畫合理，實作確實先完成 leaf／strict probe／綠燈，再開始 sheets 改名與
annotation。實作中發現 TypeScript type-aware ESLint 對 `.ts` 啟用 `prefer-const`，
而原 JS 的 `let surfaceEntry;`＋稍後賦值與此規則衝突；禁止 suppression、config
變更，因此先停手回報。驗收方查證後核可唯一例外：刪除 `let`，把原賦值改為
`const`。沒有採 `= null`，也沒有其他 runtime 改寫。

合併後原本的 `close: typeof surfaceEntry.close` 形成純型別循環；改以等價且可擦除的
`: void` 回傳標註解除推導環，沒有改動指定的 `const surfaceEntry = ...` 原文或 emit。

## 2. Stage 1：純型別 contract leaf

`src/surfaceContracts.ts` 只含下列 structural types，沒有 runtime import 或 statement：

| port | leaf 型別 | 呼叫面／實作面 modeling |
| --- | --- | --- |
| shell renderer | `SurfaceShellProps`、`SurfaceShellHandle`、`SurfaceShellRenderer` | `sheets.ts` 傳入 `root` 與 `{ className, html, id, label }`，取回 `{ surface, unmount }`；`SurfaceHost.tsx` 的 `mountSurfaceShell` 同形 |
| keyboard registry | `SurfaceKeyboardEntry`、`SurfaceKeyboardRegistry` | `sheets.ts` 註冊 `{ close, onEscape, restoreFocus, surface }` 並接收 unregister；`SurfaceHost.tsx` registry 同形 |
| focus registry | `SurfaceRestoreTarget`、`SurfaceFocusRegistry` | `captureRestoreTarget`／`focusInitial`／`restoreFocus` 與 `SurfaceHost.tsx` restore target 實況對齊 |
| login content | `LoginModalContentOptions`、`LoginModalContentHandle`、`LoginModalContentRenderer` | `sheets.ts` 呼叫面與 `App.tsx` 的 `mountLoginModalContentInApp` 人工核對 |

port 1–3 由 `SurfaceHost.tsx:330-332` 三個 configure 呼叫接受 strict 結構相容檢查，
typecheck 綠。port 4 的 wiring 位於未開 `checkJs` 的 `sessionViews.js:243`，人工核對：

- contract 需要 `action: string`、`lineProviderId: string`、`onClose(): void`、optional
  `onProvider`；實際 App options 接受同一形狀（action／lineProviderId 更寬為 optional）。
- contract 最小回傳只要求 `{ unmount(): void }`；實際 `SurfaceContentLifecycle` 另有
  `isSurfaceRootLive()`，是結構上更強的回傳值。
- `sessionViews.js:243` 原樣把 `appModule.mountLoginModalContentInApp` 傳給
  `configureLoginModalContent`。

login port 選擇自足的最小 `{ unmount }`，沒有 type-import implementor：leaf 描述
consumer 最小需求，不反向依賴 React implementor。也沒有新增 barrel、React
render/effect 或 runtime edge。

```text
surfaceContracts_emit_bytes=0
surfaceContracts_emit=""
```

## 3. Stage 2：`sheets.js` → `sheets.ts`

- type-only import leaf 四個 port；`modalIsolation.js` 與 `config.ts` runtime import
  路徑／順序不變。
- 補上 options、handle、bridge、WeakMap 與 callback 狀態型別；tolerant public inputs
  使用 `unknown`。
- 沒有新增 `any`、`@ts-ignore`、`eslint-disable`、enum、namespace 或 parameter
  property。
- assertions、non-null assertion 與 function annotations全部可擦除；close 序列、
  registerUnmount 即時閉合、replace previousFocus、mount-time click binding、
  closeSurface else、AggregateError 與單錯 rethrow 都保持原序。
- `SurfaceHost.tsx` 只有 import 字串及註解 `.js`→`.ts` 兩處 diff，其餘未動。

### 3.1 核可的唯一 erased-token 差異

| 位置 | before（HEAD `src/sheets.js` 原文） | after（`src/sheets.ts` 原文） |
| --- | --- | --- |
| 先行宣告 | `let surfaceEntry;` | 刪除，沒有替代行 |
| 原賦值 | `surfaceEntry = { close, onEscape, restoreFocus: previousFocus, surface };` | `const surfaceEntry = { close, onEscape, restoreFocus: previousFocus, surface };` |

未採 `let surfaceEntry = null` 或其他替代初始化。

esbuild 分別用 JS／TS loader 擦除型別並 minify whitespace；只做上述兩項唯一指定
正規化，沒有忽略其他 token：

```text
raw_erased_runtime_tokens_equal=false
before_declaration_matches=1
before_assignment_matches=1
after_const_matches=1
approved_surfaceEntry_normalized_tokens_equal=true
EXIT_CODE=0
```

因此原始比較只因核可例外為 false；移除那一個 `let surfaceEntry;`、僅把那一個
`surfaceEntry={` 改為 `const surfaceEntry={` 後，其餘 erased runtime token 全等。

### 3.2 宣告到賦值之間零引用（含完整 close 閉包）

HEAD 原檔定位：

```text
39  let surfaceEntry;
40  const registerUnmount = (unmount) => {
...
48  const close = ({ reason = "dismiss", restoreFocus = true } = {}) => {
...
76  };
77
78  surfaceEntry = { close, onEscape, restoreFocus: previousFocus, surface };
```

對原檔第 40–77 行執行 grep；範圍包含完整 `registerUnmount` 與 `close` closure：

```text
$ git show HEAD:src/sheets.js | sed -n '40,77p' | rg -n 'surfaceEntry'
(no output)
RG_EXIT_CODE=1
between_refs=0
```

第一次讀取仍在原下一行 `surfaceKeyboardRegistry.register(surfaceEntry)`；合併沒有
TDZ 或語意風險。

### 3.3 五則錯誤訊息原文

```text
65:  if (!focusRegistry) throw new Error("Surface focus registry is unavailable.");
71:  if (!mountReactSurfaceShell) throw new Error("Surface shell React renderer is unavailable.");
72:  if (!surfaceKeyboardRegistry) throw new Error("Surface keyboard registry is unavailable.");
80:    if (typeof unmount !== "function") throw new TypeError("Surface unmount callback must be a function.");
178:  if (!mountLoginModalContent) throw new Error("Login modal React content is unavailable.");
```

五則各恰一筆，類別維持 Error ×4、TypeError ×1。

## 4. Importer、fixture 與舊路徑

```text
src/app/SurfaceHost.tsx:10
src/main.js:112
src/sessionViews.js:2
src/views/discoverySurfaceViews.js:2
src/views/profileSurfaceView.js:2
src/views/sessionFormViews.js:2
src/views/sessionSurfaceViews.js:1
tests/react-surface-lifecycle.test.js:13
tests/sheets-dom.test.js:53
tests/account-settings-smoke.spec.js:614
.claude/rules/react-migration.md:7
CLAUDE.md:62
```

static importer、lifecycle readFileSync 與 sheets-dom URL 都只改副檔名；sheets-dom 的
query sequence 及 `vite.ssrLoadModule`／plain import 雙軌未動。

appRuntime mapping 加入 `sheets: ".ts"`。實際 consumer：

```text
tests/auth-forms-smoke.spec.js:17
tests/auth-forms-smoke.spec.js:43
tests/auth-forms-smoke.spec.js:55
tests/auth-forms-smoke.spec.js:128

related test declarations: 3 passed (2.1s)
EXIT_CODE=0

$ rg -o 'window\.__importAppModule' src tests | wc -l
110
baseline=110
delta=0
```

舊路徑反掃：

```text
$ rg -n 'sheets\.js' src tests
(no output)
RG_EXIT_CODE=1
```

派工範圍外 `ds-bundle` 有兩筆歷史說明文字仍提到 `src/sheets.js`；不在解凍清單、
build 或本批反掃口徑，未擴張修改。

## 5. Strict 納入探針 ×2

### 5.1 `surfaceContracts.ts`

```text
probe: const batch6CStrictProbe: number = "x";

$ npm run typecheck
src/surfaceContracts.ts(54,7): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT_CODE=2

before_probe_sha256=f0ec4d2d67e5c797e1a4b898d84a9c7feab62824be8ec049fab979bea1c80840
restored_sha256=f0ec4d2d67e5c797e1a4b898d84a9c7feab62824be8ec049fab979bea1c80840
BYTE_IDENTICAL=true

$ npm run typecheck
EXIT_CODE=0
```

### 5.2 `sheets.ts`

核可例外與最終型別修正後重新 probe：

```text
probe: const batch6CStrictProbe: number = "x";

$ npm run typecheck
src/sheets.ts(188,7): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT_CODE=2

before_probe_sha256=3e965bf7ebcfe914362818bb1280023243427434eb19b71aa7e203dc67cdb972
restored_sha256=3e965bf7ebcfe914362818bb1280023243427434eb19b71aa7e203dc67cdb972
BYTE_IDENTICAL=true

$ npm run typecheck
EXIT_CODE=0
```

## 6. E 群 anchors 與 Node importability

```text
95:      unmountContent?.();
102:      shell.unmount();
88:    if (closed) return;
127:  return { root, surface, close, registerUnmount };
```

四個最終檔文字封條都匹配；close 順序不變。Node 直接 import：

```text
exports=configureLoginModalContent,configureSurfaceFocusRegistry,
configureSurfaceKeyboardRegistry,configureSurfaceShellRenderer,mountDialog,
mountSheet,openLoginModal
EXIT_CODE=0
```

## 7. 行為覆蓋盤點

| export | 直接／間接既有載重 | 明確空白 |
| --- | --- | --- |
| `configureSurfaceShellRenderer` | `SurfaceHost.tsx:330` strict connection；sheets-dom 每 case 安裝實作並測 replacement／雙 unmount error；E 群守 content-before-shell | 沒有錯誤 renderer 的 runtime case；由 strict contract 負責 |
| `configureSurfaceKeyboardRegistry` | `SurfaceHost.tsx:331`；topmost Escape、onEscape 短路、Tab trap、listener replace balance | 無獨立 spy-only unit；integration 直接載重 register/unregister |
| `configureSurfaceFocusRegistry` | `SurfaceHost.tsx:332`；initial focus、三階 fallback、非 drawer 消失、replace focus；mock/local focus journeys | 無獨立 registry fake API snapshot |
| `configureLoginModalContent` | `sessionViews.js:243` 人工核對；auth smoke provider／action／close；mock/mobile/local login gates | JS wiring 不受 strict，仍需人工核對或未來 TS 化 |
| `mountSheet` | sheets-dom 14 子測試大多數、isolation、E 群、react-unmount、mock/local create/detail/chat/filter/profile | 無零 DOM root 專用 case；保留既有 root 前提 |
| `mountDialog` | stacked dialog、DOM byte-identical、auth/report/filter/confirmation/error-boundary journeys | 無只驗 className trim 的 unit；DOM byte-identical 同時守輸出 |
| `openLoginModal` | auth smoke 四個動態 import 呼叫；完整 mock/mobile/local auth journey | 無 Node DOM-free 直接呼叫；Node import只守模組可載入 |

```text
$ node --test tests/react-surface-lifecycle.test.js tests/sheets-dom.test.js
# tests 22
# pass 22
# fail 0
EXIT_CODE=0

$ npx playwright test tests/auth-forms-smoke.spec.js:3 \
  tests/auth-forms-smoke.spec.js:34 tests/auth-forms-smoke.spec.js:121 \
  --project=desktop-chromium
3 passed (2.1s)
EXIT_CODE=0
```

## 8. Bundle 對帳

| 指標 | 6B 基準 | 6C 最終 | 淨值 | 上限 | 最終餘裕 |
| --- | ---: | ---: | ---: | ---: | ---: |
| main raw | 638,939 | 638,937 | −2 B | 658,867 | 19,930 B |
| main gzip | 187,470 | 187,466 | −4 B | 192,420 | 4,954 B |
| total JS raw | 841,563 | 841,561 | −2 B | 849,961 | 8,400 B |
| total JS gzip | 257,634 | 257,627 | −7 B | 259,062 | **1,435 B** |

2 raw bytes減少與唯一核可 `let`→合併 `const` 相符；type-only leaf 不產 chunk。

```text
production bundle check passed: development E2E hook present, production E2E hook absent;
32 files, 12 demo identifiers absent; main 638937/187466 within 658867/192420;
largest app lazy MySessionsPage-Byp_C9FO.js 16476/4828 within 18000/5500;
total JS 841561/257627 within 849961/259062;
private repository: privateDataRepository-CfJqlfj0.js;
Sentry: sentryBrowserSdk-Czz5dmkg.js
EXIT_CODE=0
```

## 9. Codex 五問

### 1. 如何證明 leaf 與 sheets 都真的受 strict 管理？

兩檔分別加入錯誤 probe，tsc 都精確指名檔案／行號；移除後 SHA-256 相同並回綠。
leaf 另以 esbuild 證明 emit 0 bytes。

### 2. 如何證明 runtime 行為只存在核可的一筆偏差？

raw erased token 比較只有 `surfaceEntry` 宣告／賦值形狀不同；腳本確認 before 宣告
1 次、before 賦值 1 次、after const 1 次，只正規化這兩個確切 token 後全等。grep
另證明兩位置間（含 close closure）零引用；E anchors、五訊息、DOM byte-identical、
unit、mock、local 與 bundle 共同守 source／產物／行為。

### 3. 為何四個 port 採最小 structural leaf？

`SurfaceHost.tsx` 凍結且 port 1–3 實作型別未 export。consumer-owned 最小 contract
可在 configure 呼叫檢查雙端相容，又不讓 React implementor 成為 leaf 依賴。login
實作回傳較強，本批只取 consumer 使用的 `unmount`。

### 4. 唯一 `prefer-const` 例外是否值得接受？

值得。suppression／ESLint config 違反紅線，`= null` 會改型別與多 runtime token。
核可方案有零中間引用直接證據，closure 只在稍後呼叫時讀值，產物只少 2 raw bytes；
它是 `.js`／type-aware `.ts` ruleset 差異的必要最小偏差。

### 5. 對 6D `dataApi.ts` 的建議

建議把 80 行 facade 視為 typed forwarding surface，不在同批改 repository 邏輯：

1. 先由 `dataRepository.ts` export `DataApi = ReturnType<typeof createDataApi>`（或等價
   contract），facade 每個 `(...args)` 用 `Parameters<DataApi["method"]>`；型別可擦除，
   保持 38 個 forwarding expression 原 token，不另手寫會漂移的模型。
2. 先凍結 `createDataApi` options／預設、lazy `privateDataApiLoader` rejection 後重試
   語意，以及 public＋private method keys。`RepositoryOptions`／loader shape 是 factory
   port；先決定是否 export 成穩定 contract，不順手搬 implementation 或改 lazy chunk。
3. error contract 凍結 `SESSION_ACTION_CODES` 字面／隱私語意、
   `UNKNOWN_ACTION_ERROR` fallback、三個 error class identity、空 message、cause 與
   code-only 行為。若新增 `SessionActionCode`，由既有字面推導且只作型別收窄。
4. `src/data/` 已 strict；facade type-import repository 推導型別，不可讓 repository
   反向 import facade，保持依賴方向與 private repository dynamic chunk。
5. `save_my_profile` 的 `p_line_id: null` 是凍結且唯一允許呼叫點。generated
   `Database` 欄位仍是 `string`，現有 `RepositoryDatabase`／`RpcArgs` 刻意把 RPC args
   widening 為 `T | null`；6D 沿用 contextual type 表達 `null`，不可改空字串、刪欄位、
   改 generated type，或為 facade 放寬 profile domain type。

## 10. 收尾標準矩陣

```text
$ npm run typecheck
> tsc --noEmit
EXIT_CODE=0

$ npm run lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts
EXIT_CODE=0

$ npm run prettier:check
> prettier --check "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts package.json package-lock.json tsconfig.json vercel.json

Checking formatting...
All matched files use Prettier code style!
EXIT_CODE=0

$ npm run build
vite v6.4.3 building for production...
✓ 508 modules transformed.
dist/assets/index-BWygPPVv.js 638.94 kB | gzip: 187.47 kB
✓ built in 1.27s
EXIT_CODE=0

$ npm run check:production-bundle
main 638937/187466; total JS 841561/257627
EXIT_CODE=0

$ git diff --check
(no output)
EXIT_CODE=0

$ npm run test:session-unit
# tests 346
# pass 346
# fail 0
# skipped 0
# duration_ms 3832.819583
EXIT_CODE=0

$ npm run test:mock
4 skipped
298 passed (54.3s)
EXIT_CODE=0

$ npm run test:local
# local API: 2 passed, 0 failed
# Supabase Chromium: 11 skipped, 45 passed (1.3m)
EXIT_CODE=0
```

Unit／mock 的 happy-dom Vite cases 仍有非致命
`WebSocket server error: Port 24678 is already in use`；所有 TAP cases 及 aggregate
exit 都為 0，沒有 retry。本批未改 Vite harness 或該埠。local 沒有 reset、資料污染、
presence timeout 或 retry。

## 11. 範圍、未做、疑義與 BLOCKED

- 永久 source 變更限於新 leaf、sheets 改名＋annotation＋唯一核可 const、7 個 static
  importer、2 個 test path、appRuntime mapping、2 個註解及 2 個規則／說明字面。
- `SurfaceHost.tsx` 除 import／comment 副檔名外、`modalIsolation.js`、tests assertion、
  query isolation、tsconfig、ESLint config、package、bundle gate、domainTypes 均零 diff。
- 未做：6D–6F、拆檔、React runtime 重構、新依賴、UX／文案／錯誤訊息變更、
  `ds-bundle` 歷史引文更新。
- 疑義：無未決；`prefer-const` 衝突已核可並完整對帳。
- BLOCKED：無。
- Git：未 commit、未 push；working tree 留給驗收方。
