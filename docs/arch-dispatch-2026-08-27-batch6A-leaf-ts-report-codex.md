# 批 6A 回報：value leaf 四檔 TS 化

- 日期：2026-08-27
- 派工單：`docs/arch-dispatch-2026-08-27-batch6A-leaf-ts.md`
- 開工 HEAD：`fea5b1d`；前置批 6-pre ACCEPTED：`60aa676`。
- 開工 working tree：乾淨。
- 結果：完成，無 BLOCKED；四個 `.js` value leaf 改名為 `.ts`，runtime exports／
  邏輯／字面／順序不變。
- Git：未 commit、未 push。

## 1. Ground truth 與計畫檢視

動手前重驗：

| 模組                 | 原行數 |    真正 importer 檔數 |
| -------------------- | -----: | --------------------: |
| `config.js`          |     38 | 13（src 11＋tests 2） |
| `profile.js`         |     43 |                     6 |
| `sessionCriteria.js` |     41 |                    10 |
| `taipeiTime.js`      |    105 |                     7 |

`config` 的初次寬 regex 另命中三個測試裡的 `playwright.config.js`；改用路徑段
`/config.js` 後才得到派工單的 13。這是掃描口徑差異，不是計畫錯誤。

基準矩陣：

```text
$ npm run typecheck
EXIT_CODE=0

$ npm run build
✓ 508 modules transformed.
dist/assets/index-CHyqLqM4.js 638.94 kB | gzip: 187.47 kB
✓ built in 1.32s

$ npm run check:production-bundle
main 638939/187470; total JS 841563/257634
EXIT_CODE=0

$ npm run test:session-unit
# tests 346
# pass 346
# fail 0
EXIT_CODE=0
```

計畫整體可執行。實作中額外加入一個比測試更嚴格的 annotation-only 自證：用 esbuild
分別擦除 HEAD `.js` 與新 `.ts` 的型別，將 `taipeiTime` 唯一 import 副檔名正規化後比較
runtime tokens。這個檢查曾抓到一處行為等價、但會實際 emit optional chain 的寫法；改用
會被完全擦除的 non-null assertion 後，四檔全部 token-equal，並重跑完整矩陣。

## 2. 每檔轉換摘要與 annotation-only 自證

### 2.1 `config.js` → `config.ts`

- 僅把 `env` 標成既有 Vite `ImportMetaEnv`。
- 所有環境變數讀取、fallback 字面、bounds／center object、poll interval 與 export
  名稱順序不變。
- 沒有新增共用型別，也沒有改 `domainTypes.ts`。

### 2.2 `profile.js` → `profile.ts`

- 新增檔內 `PrivateProfileInput`、`CourtInput`、`EligibilityOptions` 三個 structural type。
- `validProfileNtrp`／`formatNtrp` 接受 `unknown`，維持既有 `String`／`Number`
  narrowing 語意。
- `eligibilityFromPrivateProfile` 只增加參數型別；`nick`、NTRP 1–7、Taipei active court、
  loading/error/ready 與 `isPublic === true` 判定完全不變。
- 唯一 `profile!` 是被前一個 `validProfileNtrp(profile?.ntrp)` 三元條件保護的 type-only
  assertion，emit 後不存在。

### 2.3 `sessionCriteria.js` → `sessionCriteria.ts`

- 新增檔內 `SessionCriteriaInput` 與 nullable alias；public predicate／distance 邊界接受
  `unknown`，再以 type assertion 讀既有 optional fields。
- `finiteCoordinate`、candidate/full/joinable 邏輯與 Haversine 運算順序不變。
- `lat1!`／`lat2!` 與 `session!` 都位於既有 null guard／`&&` 短路之後，只供 strict
  narrowing，emit 後不存在。
- `.ts` 規則不啟用 JS 的 `no-extra-boolean-cast`，原 inline suppression 會成為 unused
  directive；只移除該 lint 註解，`Boolean(...)` runtime 原文保留。

### 2.4 `taipeiTime.js` → `taipeiTime.ts`

- 新增檔內 `DateInput` 與 `TaipeiDateTimeLocalOptions`。
- 只標記 `padTwo`、九個函式參數與 options；所有 UTC+8 算式、正規式、calendar
  round-trip validation、Intl formatter options 與輸出字面不變。
- 自身 `./config.js` import 同步改為 `./config.ts`。

### 2.5 型別擦除後 runtime token 對帳

指令以 esbuild 分別用 `loader: "js"`／`loader: "ts"` 轉換，移除空白並只把
`./config.ts` 正規化回原 import 名：

```text
config: erased_runtime_tokens_equal=true
profile: erased_runtime_tokens_equal=true
sessionCriteria: erased_runtime_tokens_equal=true
taipeiTime: erased_runtime_tokens_equal=true
EXIT_CODE=0
```

反掃四檔沒有 `any`、`@ts-ignore` 或 `eslint-disable`；沒有新增 type-aware off 規則。

## 3. Importer 副檔名同步

指令：

```text
$ rg -n '(?:from|import\()\s*["'"'][^"'"']*(config|profile|sessionCriteria|taipeiTime)\.ts["'"']' src tests
```

### 3.1 `config.ts`（13 檔）

```text
src/controller/discoveryMapController.ts
src/controller/playerDirectoryController.ts
src/data/mappers/queryMappers.ts
src/data/repositories/dataRepository.ts
src/features/discovery/discoveryFeature.ts
src/features/notifications/notificationFeature.ts
src/main.js
src/map.ts
src/sessionController.js
src/sheets.js
src/taipeiTime.ts
tests/performance.spec.js
tests/session-controller.test.js
```

### 3.2 `profile.ts`（6 檔）

```text
src/main.js
src/pages/MySessionsPage.tsx
src/sessionPresentation.ts
src/sheets/SessionDetailSheet.tsx
src/views/profileSurfaceView.js
tests/session-data-boundary.test.js
```

### 3.3 `sessionCriteria.ts`（10 檔）

```text
src/controller/lifecycleActionsController.ts
src/controller/mySessionsController.ts
src/features/session-lifecycle/sessionLifecycleFeature.ts
src/filters.js
src/map.ts
src/pages/MySessionsPage.tsx
src/playerPresence.js
src/sessionController.js
src/sessionPresentation.ts
src/views/sessionFormViews.js
```

### 3.4 `taipeiTime.ts`（7 檔）

```text
src/filters.js
src/map.ts
src/pages/NearbySessionsDrawer.tsx
src/sessionPresentation.ts
src/sessionViews.js
src/views/profileSurfaceView.js
src/views/sessionFormViews.js
```

所有 importer 只改副檔名字串；凍結的 `main.js`、`sessionViews.js`、`views/*.js`、
測試斷言其餘內容均未改。

## 4. appRuntime 與 `__importAppModule` 對帳

四名逐一 grep：

```text
$ rg -n '__importAppModule\(\s*["'"'](config|profile|sessionCriteria|taipeiTime)["'"']' tests
(no output)
EXIT_CODE=1
```

四名都是零使用者，所以 `tests/fixtures/appRuntime.js` 的 extensions 表不新增映射；若添加
反而是無需求改動。全域 importer 口徑不變：

```text
$ rg -o 'window\.__importAppModule' tests | wc -l
110
baseline=110
delta=0
```

## 5. Strict 納入探針四組三拍

每次使用同一行：

```ts
const batch6AStrictProbe: number = "x";
```

### 5.1 `config.ts`

```text
$ npm run typecheck
src/config.ts(39,7): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT_CODE=2

# 移除 probe
before_probe_sha256=aab721df4a22d03286b2e3eb37b495de5298fbc9478facbb084c0de2c6513d5c
restored_sha256=aab721df4a22d03286b2e3eb37b495de5298fbc9478facbb084c0de2c6513d5c
BYTE_IDENTICAL=true
$ npm run typecheck
EXIT_CODE=0
```

### 5.2 `profile.ts`

```text
$ npm run typecheck
src/profile.ts(64,7): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT_CODE=2

# 移除 probe
before_probe_sha256=588fe27e1726f52915c129d175cb3000e9842a986cf1486c9f436d16e1e7d49d
restored_sha256=588fe27e1726f52915c129d175cb3000e9842a986cf1486c9f436d16e1e7d49d
BYTE_IDENTICAL=true
$ npm run typecheck
EXIT_CODE=0
```

### 5.3 `sessionCriteria.ts`

最終 type-only assertion 修正後重新取樣，確保還原的是交付版本：

```text
$ npm run typecheck
src/sessionCriteria.ts(65,7): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT_CODE=2

# 移除 probe
before_probe_sha256=ecca1d9636aaa8446c66200e73eaad0bf57b5e4891dc539db37a96ad7fd53ab0
restored_sha256=ecca1d9636aaa8446c66200e73eaad0bf57b5e4891dc539db37a96ad7fd53ab0
BYTE_IDENTICAL=true
$ npm run typecheck
EXIT_CODE=0
```

### 5.4 `taipeiTime.ts`

```text
$ npm run typecheck
src/taipeiTime.ts(113,7): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT_CODE=2

# 移除 probe
before_probe_sha256=4516ce24d746bbfa67f0bf7e203d51e2f56d62f0cbf36579f5708e5ecdbc83c3
restored_sha256=4516ce24d746bbfa67f0bf7e203d51e2f56d62f0cbf36579f5708e5ecdbc83c3
BYTE_IDENTICAL=true
$ npm run typecheck
EXIT_CODE=0
```

四檔都由 strict `tsc --noEmit` 指名打紅；沒有只改名但落在 typecheck 外的假納入。

## 6. 行為覆蓋盤點

以下測試名由 `rg -n '^test\(' ...` 與最終實跑對帳，不憑記憶：

| 模組                 | 既有載重測試                                                                                                                                                                                                                                                                                                                                                                                   | 明確空白                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config.ts`          | `performance.spec.js`「configured discovery uses one debounced, bounded viewport request」直接驗 `DISCOVERY_WINDOW_DAYS`／`MAP_IDLE_DEBOUNCE_MS`；`session-controller.test.js` 多條 rapid-location debounce；mock/local 覆蓋 env、map、auth、push、polling consumers                                                                                                                           | 其餘常數沒有逐 export 的精確字面 unit oracle；例如 `LAUNCH_CITY`、`LOCATION_INITIAL_RADIUS_METERS`、`MAP_CENTER`／`MAP_ZOOM`、`SUPPORT_EMAIL` 主要是 integration consumer 覆蓋 |
| `profile.ts`         | `session-data-boundary.test.js`：「NTRP formatting names an absent value...」、「NTRP formatting keeps one decimal...」、「private-profile eligibility enforces each nickname and NTRP boundary...」、「directory eligibility requires a stored court...」、「directory eligibility stays unavailable...」、「directory eligibility exposes a failed court catalogue...」；local profile gates | `validProfileNtrp` 沒有獨立 import 測試，但由 formatter／eligibility 的 boundary values 間接全程使用                                                                           |
| `sessionCriteria.ts` | `filters.test.js`：「isJoinableSession mirrors...」、「joinableSessionCount excludes full...」、「sortSessionsForDrawer sinks full...」；`session-data-boundary.test.js` 的 candidate discoverability／distance sorting；session lifecycle 與 map decision mock/local                                                                                                                          | 四個 export 都有 consumer oracle；`distanceMeters` 沒有直接單函式 import，而由 distance sorting／presence integration 覆蓋                                                     |
| `taipeiTime.ts`      | `session-create-form.test.js`「create form converts datetime-local as Asia/Taipei...」直接驗三組 ISO；`session-data-boundary.test.js` 的 Taipei filters；`session-presentation-boundary.test.js` 的 schedule labels；mock/local create/edit/display                                                                                                                                            | `TAIPEI_UTC_OFFSET_MS` 沒有獨立 literal assertion；其值由 local→ISO 與 parts/display 兩個方向間接載重                                                                          |

沒有為了 TS 化新增或改寫測試 oracle；空白如實留給後續決定，不冒充全 export unit coverage。

## 7. 舊路徑反掃

主掃：

```text
$ rg "from ['\"][^'\"]*/(config|profile|sessionCriteria|taipeiTime)\.js" src tests
(no output)
EXIT_CODE=1
```

裸字面補掃：

```text
$ rg "(config|profile|sessionCriteria|taipeiTime)\.js" src tests
tests/reset-local-test-db.test.js:8:import playwrightConfig from "../playwright.config.js";
tests/ci-config.test.js:5:import { createPlaywrightConfig } from "../playwright.config.js";
tests/ci-config.test.js:100:    'eslint ... playwright.config.js ...'
tests/ci-config.test.js:104:    'prettier ... playwright.config.js ...'
tests/local-supabase-config.test.js:3:import { createPlaywrightConfig } from "../playwright.config.js";
```

五筆都指 repository root 的 `playwright.config.js` 或其工具命令字面，與四個 leaf 無關；
沒有舊 leaf 路徑殘留。

## 8. Bundle 對帳

最終 annotation-only 修正後：

| 指標          | 6-pre 基準 | 6A 最終 | 淨值 |    上限 |    最終餘裕 |
| ------------- | ---------: | ------: | ---: | ------: | ----------: |
| main raw      |    638,939 | 638,939 |  0 B | 658,867 |    19,928 B |
| main gzip     |    187,470 | 187,470 |  0 B | 192,420 |     4,950 B |
| total JS raw  |    841,563 | 841,563 |  0 B | 849,961 |     8,398 B |
| total JS gzip |    257,634 | 257,634 |  0 B | 259,062 | **1,428 B** |

```text
production bundle check passed: development E2E hook present, production E2E hook absent;
32 files, 12 demo identifiers absent; main 638939/187470 within 658867/192420;
largest app lazy MySessionsPage-DhtT1sNf.js 16476/4829 within 18000/5500;
total JS 841563/257634 within 849961/259062;
private repository: privateDataRepository-DrYLuo9-.js;
Sentry: sentryBrowserSdk-Czz5dmkg.js
EXIT_CODE=0
```

Bundle topology、hash 名與四項 byte 指標均回到 baseline，沒有使用 1,428 B 餘裕。

## 9. Codex 五問

### 1. 如何證明這不是只改副檔名、實際沒有進 strict？

四檔各自加入同一個 `number = "x"` probe，四次 `tsc` 都指名新 `.ts` 的確切行號，
移除後 hash 回復且 typecheck 綠。這比只看 tsconfig glob 更直接。

### 2. 如何證明 runtime 語意真的沒改？

除了原始 unit/mock/local，全四檔另做型別擦除後 token 對照，四個
`erased_runtime_tokens_equal=true`；最終 build 的所有量化 byte 與 chunk hash 也與基準相同。
型別、assertion、interface 均不 emit，唯一 runtime 文字變更只是 importer `.js`→`.ts`，
由 Vite／Node 的實跑驗證。

### 3. 為何沒有新增 `domainTypes.ts` 共用型別？

這四檔需要的是各自 tolerant input boundary，而不是新的跨領域 canonical entity。
把 `PrivateProfileInput`、coordinate/date options 強塞進 `domainTypes.ts` 會擴大解凍面並讓
value leaf 反向耦合更大的 domain surface。檔內 interface 足以 strict，且 runtime 零成本。

### 4. 為何 appRuntime 不補四個 `.ts` mapping？

extensions 表只服務 `__importAppModule("name")`。四名 grep 全為零，所有實際 consumers
都是靜態 import；無使用者時加 mapping 沒有驗證價值，且違反「有才解凍」條件。

### 5. 對 6B 狀態三檔的建議

建議順序：`requestGate.js` → `sessionIntent.js` → `filters.js`，每檔獨立 strict probe 與
consumer matrix，不三檔一起補型別再一次除錯。

1. `requestGate.js` 最小但有兩個難點：`capture/issue` 的 `isCurrent` callback contract 應
   共用同一 token interface；timer 型別要用 `ReturnType<typeof setInterval>`，不要選
   browser `number` 或 Node `Timeout` 造成雙 runtime 偏置。`visibilityTarget` 應定義最小
   structural interface，避免把 DOM Document 強加給測試 fake。
2. `sessionIntent.js` 適合第二個：先定義 `PendingSessionIntent` discriminated union 與最小
   `Storage` port。難點是 `JSON.parse` 為 unknown 後的 property narrowing；應保留現在的
   exact-key fail-closed 檢查，用 type assertions／type predicate 表達，不能為了型別方便
   放寬未知 key 或 sessionId safe-integer 規則。
3. `filters.js` 最後：214 行同時跨 `FilterState`、`SessionSummary`、court geometry、location、
   Set-or-array tolerant inputs、sort stability 與 date inputs。6A 已先提供 typed criteria/time
   leaves；6B 應再用 `satisfies` 固定 `BANDS`／`DEFAULT_FILTER_STATE`，並區分 canonical
   `SessionSummary` 與 JS facade 的 `Partial` input，避免用一個過寬 interface 吞掉錯誤。

這個順序由小型 state-machine contract 漸進到 security-sensitive storage union，再進入最大
資料投影面，較容易維持 annotation-only 歸因。

## 10. 收尾標準矩陣

以下皆為最終 token-equal 版本重新實跑，不引用中途 optional-chain 版本結果。

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
✓ built in 1.42s
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
# duration_ms 4175.160042
EXIT_CODE=0

$ npm run test:mock
4 skipped
298 passed (56.5s)
EXIT_CODE=0
```

沒有失敗、重跑、flake 或豁免。

### Local

```text
$ npm run test:local
# local API
# tests 2
# pass 2
# fail 0
# duration_ms 4619.591792

# Supabase Chromium
11 skipped
45 passed (1.5m)
EXIT_CODE=0
```

沒有 reset、資料污染、presence timeout 或重跑。

## 11. 範圍、自證、未做與 BLOCKED

- 永久 source 變更只有四檔改名＋annotation、36 個 genuine importer 字串；測試僅三行
  靜態 import 副檔名。
- `tests/fixtures/appRuntime.js`、`domainTypes.ts`、tsconfig、eslint config、package、bundle
  gate、測試斷言、UX 全部零 diff。
- `main.js`／`sessionViews.js`／`views/*.js` 只有 import 字串，無其他變更。
- 未做：6B–6F、拆檔、type-aware off 規則恢復、新依賴、行為／文案／UI。
- 疑義：無。中途 token 對照發現的 optional-chain emit 已在最終矩陣前修正，不構成
  BLOCKED 或殘留風險。
- BLOCKED：無。
- Git：未 commit、未 push；working tree 留給驗收方。
