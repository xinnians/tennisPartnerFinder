# 批 6B 回報：state 三檔 TS 化

- 日期：2026-08-27
- 派工單：`docs/arch-dispatch-2026-08-27-batch6B-state-ts.md`
- 開工 HEAD：`731741c`；前批 6A ACCEPTED：`69d8c79`。
- 開工 working tree：乾淨。
- 結果：完成；`requestGate.js`、`sessionIntent.js`、`filters.js` 已依序改為
  strict `.ts`，runtime token 全等。
- Git：未 commit、未 push。

## 1. Ground truth、基準與計畫檢視

動手前重驗與派工單一致：

| 模組               | 原行數 |        importer 檔數 |
| ------------------ | -----: | -------------------: |
| `requestGate.js`   |     55 |           4（src 4） |
| `sessionIntent.js` |     78 |  4（src 1＋tests 3） |
| `filters.js`       |    214 | 11（src 9＋tests 2） |

三模組合計 19 個靜態 importer edge，落在 17 個唯一檔案（`main.js` 同時 import
filters/requestGate；`session-data-boundary.test.js` 同時 import filters/sessionIntent）。

開工基準：

```text
$ npm run typecheck
EXIT_CODE=0

$ npm run build
✓ 508 modules transformed.
dist/assets/index-CHyqLqM4.js 638.94 kB | gzip: 187.47 kB
✓ built in 1.26s

$ npm run check:production-bundle
main 638939/187470; total JS 841563/257634
EXIT_CODE=0

$ npm run test:session-unit
# tests 346
# pass 346
# fail 0
EXIT_CODE=0
```

計畫的三檔順序與型別策略合理，實作照 `requestGate` → `sessionIntent` →
`filters` 逐檔完成改名、importer、strict probe、還原及綠燈後才進下一檔。

唯一計畫問題在 appRuntime canary：Playwright `file:line` 必須指向 `test(...)`
宣告，派工單建議的 `:515` 是測試內 import 行，實際宣告在 `:505`；且 Vite
6.4.3 會將明寫 `/src/filters.js` 的 request fallback 到 `filters.ts`，因此缺 mapping
時自然測試仍綠，不會產生派工單預期的 404。§4 附原始結果與嚴格路徑替代 canary。

## 2. 每檔轉換摘要與 annotation-only 自證

### 2.1 `requestGate.js` → `requestGate.ts`

- 新增檔內 `CurrentPredicate`、最小 `VisibilityTarget`、
  `ForegroundPollerOptions` 與 `PollTimer` 型別。
- `PollTimer` 使用 `ReturnType<typeof setInterval>` 與 optional `unref` structural
  intersection；`as PollTimer` 完全擦除，保留 `timer?.unref?.()` 原 token。
- generation、capture／issue staleness、stop 冪等與所有 optional call chain 不變。
- interval tick 仍用 `visibilityState !== "hidden"`，visibilitychange 仍用
  `=== "visible"`，未將兩條刻意不同的條件「整理」成同一條。
- `visibilityTarget = globalThis.document` 預設 token 不變，tests fake 不被強制成
  完整 DOM `Document`。

### 2.2 `sessionIntent.js` → `sessionIntent.ts`

- 新增檔內 `PendingSessionIntent` discriminated union、只供未知輸入讀取的
  `PendingSessionIntentInput` 與最小 `SessionStoragePort`。
- `normalizedIntent` 入口為 `unknown`；所有 property access 只加可擦除 assertion。
- `Object.keys(intent).sort()`、keys length／逐鍵 exact match、safe integer＋`> 0`
  檢查逐 token 保留，沒有放寬未知 key。
- malformed JSON 清除、storage try/catch、optional remove call、錯誤字面與
  `PENDING_SESSION_INTENT_KEY` 全部不變。

### 2.3 `filters.js` → `filters.ts`

- type-only 引用既有 `SessionSummary`；新增檔內 `Band`、`FilterState`、
  tolerant input／court／location structural types，未修改 `domainTypes.ts`。
- `BANDS`／`DEFAULT_FILTER_STATE` 只加 `satisfies`；`new Set<string>()` 的 generic
  擦除後仍是原共享可變 `new Set()`，沒有 factory／readonly runtime 改寫。
- `unknown` 入口與檔內 assertions 保留非陣列 sessions、null／partial filters、
  Set／array selections 的現有容忍度。
- `startAt!` 只協助 TypeScript 理解既有 `Boolean(startAt) &&` guard，emit 後消失。
- `BANDS` 全部字面、開區間公式、badge 決策、default-state 判定、now-start window、
  candidate court distance、priority→distance→startAt→index 排序完全不變。
- annotation-only 對帳曾抓到一個行為等價但多出局部 `source` 的中途版本；已還原
  原始單一 return，重新 strict probe 與全矩陣後才交付。

### 2.4 型別擦除後 runtime token 對帳

使用 esbuild 分別以 JS／TS loader 擦除型別並 minify whitespace，比對 HEAD 原檔與
最終新檔：

```text
requestGate: erased_runtime_tokens_equal=true
sessionIntent: erased_runtime_tokens_equal=true
filters: erased_runtime_tokens_equal=true
EXIT_CODE=0
```

三個新 `.ts` 無 `any`、`@ts-ignore`、`eslint-disable` 或 strict probe 殘留；
`eslint.config.js` type-aware off 群零 diff。

## 3. Importer 副檔名同步

### 3.1 `requestGate.ts`（4 檔）

```text
src/controller/chatController.ts
src/controller/discoveryMapController.ts
src/main.js
src/sessionController.js
```

### 3.2 `sessionIntent.ts`（4 檔）

```text
src/features/profile-auth/profileAuthFeature.ts
tests/session-controller.test.js
tests/session-data-boundary.test.js
tests/session.spec.js
```

### 3.3 `filters.ts`（11 檔）

```text
src/app/App.tsx
src/controller/discoveryMapController.ts
src/features/discovery/discoveryFeature.ts
src/features/filters/filterToolbarFeature.js
src/main.js
src/pages/NearbySessionsDrawer.tsx
src/sessionViews.js
src/sheets/FilterSheet.tsx
src/views/discoverySurfaceViews.js
tests/filters.test.js
tests/session-data-boundary.test.js
```

另依解凍清單只改兩處註解副檔名：

```text
src/views/sessionFormViews.js:186  filters.js → filters.ts
tests/session-data-boundary.test.js:935  filters.js → filters.ts
```

所有 importer diff 均只有 `.js`→`.ts`；`main.js`、`sessionViews.js`、views 與測試
其餘內容／斷言零改。

## 4. appRuntime 映射與 canary

四名 ground truth：

```text
requestGate: __importAppModule users=0
sessionIntent: __importAppModule users=0
filters: __importAppModule users=3

tests/chat-settings-filters-smoke.spec.js:475
tests/chat-settings-filters-smoke.spec.js:515
tests/chat-settings-filters-smoke.spec.js:591
```

正式處置只在 `APP_MODULE_EXTENSIONS` 新增 `filters: ".ts"`；另外兩名不加。

### 4.1 派工單原始 canary 的兩個假設差異

```text
$ npx playwright test tests/chat-settings-filters-smoke.spec.js:515 --project=desktop-chromium
Error: No tests found.
EXIT_CODE=1
```

`:515` 是 import 行，不是 Playwright 可定位的 test declaration。改用相同測試的
`:505` 後，在 mapping 暫移狀態下：

```text
$ npx playwright test tests/chat-settings-filters-smoke.spec.js:505 --project=desktop-chromium
✓ 1 passed (1.6s)
EXIT_CODE=0
```

直接 HTTP 對帳說明為何沒有預期 404：

```text
filters.js status=200 content_type=text/javascript redirect=
filters.ts status=200 content_type=text/javascript redirect=
```

Vite dev server 對 explicit `.js` request 提供 TS fallback；因此自然測試不能證明
mapping 缺失必紅。這是派工 canary 環境假設不成立，不是 mapping 沒有寫入。

### 4.2 嚴格 extension 路徑替代 canary 三拍

為驗證映射確實控制 dynamic import 路徑，不改 repository 測試，僅在一次性 browser
probe 中將 `/src/filters.js` 明確回 404。

暫移 mapping：

```text
mapping_absent_outcome=rejected: TypeError: Failed to fetch dynamically imported module:
http://127.0.0.1:4175/src/filters.js
requested=http://127.0.0.1:4175/src/filters.ts,http://127.0.0.1:4175/src/filters.js
EXIT_CODE=0  # probe 成功觀察到預期 rejection
```

byte-identical 還原：

```text
before_probe_sha256=087fcb7a4038630b9b609c3dcbaccb87d89c895fe236d0f017263f535ae36059
restored_sha256=087fcb7a4038630b9b609c3dcbaccb87d89c895fe236d0f017263f535ae36059
BYTE_IDENTICAL=true

mapping_restored_outcome=success
requested=http://127.0.0.1:4175/src/filters.ts
EXIT_CODE=0
```

正式 mapping 還原後，同一個真實 consumer 測試：

```text
$ npx playwright test tests/chat-settings-filters-smoke.spec.js:505 --project=desktop-chromium
✓ 1 passed (1.3s)
EXIT_CODE=0
```

全域呼叫點口徑保持：

```text
$ rg -o 'window\.__importAppModule' tests | wc -l
110
baseline=110
delta=0
```

## 5. Strict 納入探針三組三拍

每檔都暫加：

```ts
const batch6BStrictProbe: number = "x";
```

### 5.1 `requestGate.ts`

```text
$ npm run typecheck
src/requestGate.ts(75,7): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT_CODE=2

before_probe_sha256=0b5e69758b162d84480e4b8b89ceed8d8e79507d74a6c6d1fb165887261313ee
restored_sha256=0b5e69758b162d84480e4b8b89ceed8d8e79507d74a6c6d1fb165887261313ee
BYTE_IDENTICAL=true

$ npm run typecheck
EXIT_CODE=0
```

### 5.2 `sessionIntent.ts`

```text
$ npm run typecheck
src/sessionIntent.ts(98,7): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT_CODE=2

before_probe_sha256=9123fbc1e4a5154cb854049b302c1fad159043ed2325af526e765fa09fd104b7
restored_sha256=9123fbc1e4a5154cb854049b302c1fad159043ed2325af526e765fa09fd104b7
BYTE_IDENTICAL=true

$ npm run typecheck
EXIT_CODE=0
```

### 5.3 `filters.ts`

最終 annotation-only 修正後重新取樣：

```text
$ npm run typecheck
src/filters.ts(264,7): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT_CODE=2

before_probe_sha256=b29aa37a7690709bd466de8e33b3886fc3df65f99b5453da2000c502e2c013c3
restored_sha256=b29aa37a7690709bd466de8e33b3886fc3df65f99b5453da2000c502e2c013c3
BYTE_IDENTICAL=true

$ npm run typecheck
EXIT_CODE=0
```

## 6. 行為覆蓋盤點

| 模組               | 直接／間接既有覆蓋                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 明確空白                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requestGate.ts`   | 無直接 importer；`session-controller.test.js` 的「newest session detail preview wins」、「stale invite response」、「bounds refresh clears stale cards」、「auth epochs clear stale participation」、「online presence latest bounds wins」載重 generation/staleness；「chat refreshes on foreground visibility」、「chat polls quietly...and stops」、「discovery polls quietly in the foreground」載重 poller；local `session.spec.js`「open chat shows...via quiet polling」載重真實時間路徑 | `createRequestGate`／`createForegroundPoller` 沒有獨立 unit import，visibility 的 `hidden` 與非-`visible` 差異主要由 controller integration 間接覆蓋                                |
| `sessionIntent.ts` | `session-data-boundary.test.js`「pending intents persist only the approved session-action shapes」直接載重五種 allowlist shape、save 的 extra key 拒絕、read 的 overbroad JSON 清除與 clear；大量 controller tests 覆蓋 create/join/directory/visibility 保存、恢復、替換與清除；local `session.spec.js`「anonymous Join resumes...」、「hash session link survives...」、「initial signed-out bootstrap clears...」載重真實 sessionStorage                                                     | unsafe／非正整數 sessionId、語法損壞 JSON parse catch、無 storage fallback 及 `sessionStorage` getter 拋錯沒有獨立 oracle；本批不補測，靠原 token 全等與完整 consumer matrix 守行為 |
| `filters.ts`       | `filters.test.js` 13 條直接驗 default/badge/joinable/count/sort；`session-data-boundary.test.js` 驗 Taipei dateKey、band 開區間、source order、candidate window、ongoing/full priority、candidate court distance；`chat-settings-filters-smoke.spec.js` 驗 type chips、六群、district 即時 summary、重開 listener、focus；mock/local discovery consumers                                                                                                                                        | 所有 runtime export 都有直接或 consumer oracle；`BANDS` 每個 label 沒有單一逐字 snapshot，但 UI chip 與 band behavior 共同載重                                                      |

以上測試名由 `rg -n '^test\(' ...` 現場盤點，沒有為 TS 化修改任何 assertion。

## 7. 舊路徑反掃

```text
$ rg "from ['\"][^'\"]*/(filters|requestGate|sessionIntent)\.js" src tests
(no output)
EXIT_CODE=1

$ rg "(filters|requestGate|sessionIntent)\.js" src tests
(no output)
EXIT_CODE=1
```

派工單已知範圍外三筆保持原樣：

```text
ds-bundle/components/surfaces/Sheet/Sheet.html:62  src/filters.js
ds-bundle/components/actions/Chips/Chips.html:56  src/filters.js
ds-bundle/components/actions/Buttons/Buttons.html:77  src/filters.js
```

它們不在 src/tests、build 或 CI 守門，本批未擴張解凍面。

## 8. Bundle 對帳

| 指標          | 6A 基準 | 6B 最終 | 淨值 |    上限 |    最終餘裕 |
| ------------- | ------: | ------: | ---: | ------: | ----------: |
| main raw      | 638,939 | 638,939 |  0 B | 658,867 |    19,928 B |
| main gzip     | 187,470 | 187,470 |  0 B | 192,420 |     4,950 B |
| total JS raw  | 841,563 | 841,563 |  0 B | 849,961 |     8,398 B |
| total JS gzip | 257,634 | 257,634 |  0 B | 259,062 | **1,428 B** |

```text
production bundle check passed: development E2E hook present, production E2E hook absent;
32 files, 12 demo identifiers absent; main 638939/187470 within 658867/192420;
largest app lazy MySessionsPage-DhtT1sNf.js 16476/4829 within 18000/5500;
total JS 841563/257634 within 849961/259062;
private repository: privateDataRepository-DrYLuo9-.js;
Sentry: sentryBrowserSdk-Czz5dmkg.js
EXIT_CODE=0
```

所有 chunk hash 與 byte 皆回到 baseline；appRuntime fixture 不進 production bundle。

## 9. Codex 五問

### 1. 如何證明三檔真的納入 strict，而不是只改名？

三檔各自獨立加同一個錯誤 probe，`tsc` 都指名新 `.ts` 的精確行；移除後前後
SHA-256 相等、typecheck 綠。`filters` 在最後 annotation-only 修正後另重新 probe，
不是引用中途版本。

### 2. 如何證明零 runtime 行為變更？

三檔型別擦除後 runtime token 全等；build 的 main／total raw＋gzip 與 chunk hash
四項全為 0 B 淨值；unit、mock、local 全綠。這三層分別守 source token、產物與行為。

### 3. 為何型別放在檔內，只 type-import `SessionSummary`？

request gate fake、pending intent unknown JSON、filter partial input 都是模組邊界 port，
不是新的 canonical domain entity。只有 filters 的已正規化 session 欄位與現有
`SessionSummary` 同源，因此只做 type-only reuse；修改 `domainTypes.ts` 反而擴大凍結面。

### 4. appRuntime canary 為何沒有照派工單自然紅？

兩個獨立原因：`:515` 不是 test declaration；更正為 `:505` 後，Vite 對不存在的
explicit `.js` source 路徑仍以 TS fallback 回 200。報告沒有冒充 404，而是直接保留
自然綠與 HTTP 證據，再用 `.js` 嚴格 404 interceptor 證明 mapping absent 確實走錯
路徑、mapping restored 只走 `.ts`。建議未來 canary 固定攔截 legacy extension，
不要依賴 dev server 是否提供 extension fallback。

### 5. 對 6C sheets contract leaf＋`sheets.ts` 的建議

建議維持兩段：先建立純 type contract leaf，再機械轉 `sheets.js`；不要同一個 diff
邊抽 contract 邊改 close/mount 邏輯。

1. 三個 configure bridge 應落在 contract leaf：shell renderer、keyboard registry、
   focus registry 各自定義最小 structural port，並從 `SurfaceHost.tsx` type-import；
   contract leaf 不可 runtime import `sheets.ts`，否則 bridge 形成 circular edge。
   `configureLoginModalContent` 是內容 renderer，應另外定義最小 content contract，
   不要硬塞進三個 shell registry port。
2. `tests/react-surface-lifecycle.test.js:13` 的 `readFileSync("../src/sheets.js")`
   必須同步改 `.ts`；E 群目前依字面順序驗 `unmountContent?.()` 先於
   `shell.unmount()`、closed idempotence 與 return shape。型別／interface 插入可能讓
   regex index 改位但不應改封條語意，先跑 targeted lifecycle 再跑 aggregate。
3. `tests/sheets-dom.test.js` 的 `new URL("../src/sheets.js")`＋動態 `import(url.href)`
   必須改 `.ts`；它透過 Vite SSR loader 與 query sequence 隔離模組狀態，不能改成
   Node 直接 import 或移除 query，否則 WeakMap／configure singleton 會跨 case 污染。
4. importer 面至少含 `main.js`、`sessionViews.js`、五個 views／SurfaceHost；另逐一 grep
   appRuntime、readFileSync、URL/dynamic import 與裸字面，不能只掃 static `from`。
5. timer 類型已在 6B 證明 structural assertion 可零 emit；6C 同理應以最小 callback、
   surface handle、unmount function types 處理，避免為了型別把 optional call、try/finally、
   AggregateError 或 focus restore 次序重寫。

## 10. 收尾標準矩陣

### Static／build／bundle

```text
$ npm run typecheck
> tsc --noEmit
EXIT_CODE=0

$ npm run lint
> eslint ...
EXIT_CODE=0

$ npm run prettier:check
Checking formatting...
All matched files use Prettier code style!
EXIT_CODE=0

$ npm run build
vite v6.4.3 building for production...
✓ 508 modules transformed.
dist/assets/index-CHyqLqM4.js 638.94 kB | gzip: 187.47 kB
✓ built in 1.25s
EXIT_CODE=0

$ npm run check:production-bundle
production bundle check passed ...
EXIT_CODE=0

$ git diff --check
(no output)
EXIT_CODE=0
```

### Unit／mock

```text
$ npm run test:session-unit
# tests 346
# pass 346
# fail 0
# skipped 0
# duration_ms 3663.87125
EXIT_CODE=0

$ npm run test:mock
4 skipped
298 passed (55.0s)
EXIT_CODE=0
```

Unit 與 mock 內嵌 unit 的 happy-dom/Vite cases 會輸出非致命
`WebSocket server error: Port 24678 is already in use`，但全部 TAP cases 綠、兩次
aggregate exit 均為 0；沒有 retry 或測試失敗。本批沒有改 Vite harness 或該埠。

### Local

```text
$ npm run test:local
# local API
# tests 2
# pass 2
# fail 0
# duration_ms 4500.046833

# Supabase Chromium
11 skipped
45 passed (1.5m)
EXIT_CODE=0
```

沒有 reset、資料污染、presence timeout 或 retry。

## 11. 範圍、未做、疑義與 BLOCKED

- 永久 source 變更只有三檔改名＋annotation、19 個 importer edge、兩處註解副檔名；
  test fixture 只新增 `filters: ".ts"` 一鍵。
- `domainTypes.ts`、tsconfig、eslint config、package、bundle gate、測試斷言、UX
  與三檔 runtime 全部零 diff。
- 未做：6C–6F、拆檔、type-aware 規則恢復、新依賴、`:468` 存量 flake、
  `ds-bundle` 三筆設計文件引文。
- 疑義：派工 canary 的 `:515` 定位及「Vite 缺 mapping 必 404」假設不成立；已用
  不改 repository 的嚴格 extension probe 補足 mapping path 的紅／還原／綠證據。
- BLOCKED：無。正式 mapping、完整 matrix 與 runtime token 均已驗證。
- Git：未 commit、未 push；working tree 留給驗收方。
