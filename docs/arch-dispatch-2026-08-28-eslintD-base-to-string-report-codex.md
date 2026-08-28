# ESLint 恢復 Phase D 回報：no-base-to-string 證明制零行為路線

- 日期：2026-08-28
- 開工 HEAD：`1e144d8`（其 parent `de004ac` 為 Phase C ACCEPTED）
- 結果：**完成，未 BLOCKED**
- Git：未 commit、未 push；working tree 留給驗收方

## 1. 結論與範圍

已恢復 `@typescript-eslint/no-base-to-string`：

```text
@typescript-eslint/no-base-to-string=[2]
```

開工前以 ESLint API 記憶體覆寫精準重現 8 筆／4 檔 frozen manifest，沒有多或少。逐站追到
construction site 後，實務來源全部是 string／number／null／undefined primitive，沒有真實 object
來源，因此依派工裁決全數採 erasable cast，不新增 runtime guard。

4 個 source 檔的 `String()`、`?? ""`、`.trim()`、regex、`|| "球"`、throw 與全部 fallback
逐 token 保留；esbuild 擦除後完整 output byte-identical。沒有測試、importer、文案、dependency、
`src/data/**`、domain type、generated output 或 runtime statement 變更。

## 2. config diff

以規則名稱定位，恰刪 off 行及其正上方 debt comment，共兩行：

```diff
-      // 既有 type-aware 型別債，本批不改變既有程式語意。
-      "@typescript-eslint/no-base-to-string": "off",
```

effective config 實測一般 TS 的 base-to-string 為 `[2]`；唯一剩餘 `unbound-method` 仍為 `[0]`，
`databaseTypes.ts` 的 redundant scoped override 仍為 `[0]`。

## 3. 8 筆逐筆修法

| 開工位置 | before | after | 證明到的來源型別 |
| --- | --- | --- | --- |
| `profile.ts:22:31` | `String(value)` | `String(value as string \| number satisfies string \| number)` | null guard 後為表單 number 或 mapper number；測試另有 primitive string |
| `profile.ts:35:27` | `String(profile?.nick ?? "")` | `String((profile?.nick as string \| undefined) ?? "")` | `mapCurrentProfile.nick` 與表單 nickname 均為 string |
| `profile.ts:43:35` | `String(court?.id ?? "")` | `String((court?.id as number \| null \| undefined) ?? "")` | `mapCourt.id = asNumber(row.id)`，不是任意 string |
| `profile.ts:43:60` | `String(court?.name ?? "")` | `String((court?.name as string \| undefined) ?? "")` | `mapCourt.name = asText(row.name)` |
| `sessionController.ts:738:41` | `String(reason ?? "")` | `String((reason as string) ?? "")` | checked radio `.value`，且非空檢查後才呼叫 handler |
| `sessionPresentation.ts:86:28` | `String(value ?? "")` | `String((value as string \| null \| undefined) ?? "")` | auth metadata／preview avatar URL contract |
| `sessionPresentation.ts:91:21` | `String(nickname ?? "")` | `String((nickname as string \| null \| undefined) ?? "")` | profile、directory、roster、preview mapper 的 `asText` 結果 |
| `taipeiTime.ts:73:24` | `String(value ?? "")` | `String((value as string \| null \| undefined) ?? "")` | form composition、FormData 與 datetime-local input `.value` |

第一筆若只寫派工建議的 `value as string | number`，實測會被 Phase B 已恢復的
`no-unnecessary-type-assertion` 判為「receiver accepts original type」。在 assertion 外加同型別
`satisfies string | number` 後，base-to-string 與 assertion 兩條規則同時綠；`as` 與 `satisfies`
都由 emitter 擦除，raw gate 全等。這是唯一的規則交互，沒有改 function parameter contract。

## 4. construction-site manifest 與防偽原文

### 4.1 profile NTRP 與 nickname

全庫 symbol 掃描：

```text
$ rg -n "validProfileNtrp|formatNtrp|eligibilityFromPrivateProfile" src tests --glob '*.{js,mjs,ts,tsx}'
src/profile.ts:21,27,28,31,36
src/views/profileSurfaceView.js:1,71,77,78,128
src/main.js:137,176
src/sessionPresentation.ts:11,97,510,712
src/pages/MySessionsPage.tsx:15,275
src/sheets/SessionDetailSheet.tsx:16,579,653
tests/session-data-boundary.test.js:34,579,583,600,610,619,621,625,635,643
```

權威 mapper 原文：

```ts
// src/data/mappers/valueMappers.ts:1-8
export function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// src/data/mappers/profileMappers.ts:171-173
return {
  nick: asText(row.nickname),
  ntrp: asNumber(row.ntrp),
```

production profile 的唯一 eligibility 呼叫是 `main.js:176`，輸入為 app state profile；remote
`my_profile` 由 `privateDataRepository.ts:284` 經 `mapCurrentProfile`，空狀態由 `defaultProfile()`
給 `nick: ""`、`ntrp: null`。表單路徑 `profileSurfaceView.js:38-44` 從
`HTMLInputElement.value.trim()` 產生 `ntrp: null | number` 與 string nickname。其他 NTRP presentation
callers 的 domain mapper 也都以 `asNumber` 落成 number／null；測試直呼只加入 string、number、null
primitive。沒有 object construction site。

### 4.2 court id 與 name

catalogue 的 mock 與 configured 分支都在 `dataRepository.ts:93`／`:104` 呼叫 `.map(mapCourt)`；
沒有其他 `mapCourt` caller。防偽原文：

```ts
// src/data/mappers/profileMappers.ts:154-162
export function mapCourt(row: CourtRow = {}): DataCourt {
  return {
    id: asNumber(row.id),
    name: asText(row.name),
    city: asText(row.city),
    district: asText(row.district),
    lat: asNumber(row.lat),
    lng: asNumber(row.lng),
  };
}
```

因此 `.id` 的實際 mapper 集合是 `number | null`，cast 沒有偷寫成 string；`.name` 是 string。
optional chaining 的理論 undefined 與原本 `?? ""` 仍保留。測試 catalogue fixture 同樣是 numeric id
與 string name。

### 4.3 report reason

全庫觸發鏈只有 `sessionSurfaceViews.js:440-452`：

```js
const reason = form.querySelector("[name='report-reason']:checked")?.value;
if (!reason) {
  error.textContent = "請選擇檢舉原因。";
  error.hidden = false;
  return;
}
// ...
callback: () => onSubmit(reason),
```

DOM radio `.value` 是 string；undefined 在 `if (!reason)` 已返回，故 handler 的實測來源只有非空
string。本批保守地保留 `reason: unknown` 介面與原本 `?? ""` runtime 容忍，只在 `String()` 運算元
加 string cast。

### 4.4 avatar URL 與 nickname

auth contract 與來源：

```ts
// src/controllerContracts.ts:34-40
user_metadata?: { avatar_url?: string | null; picture?: string | null } | null;

// src/main.js:260-264
const metadata = authSession?.user?.user_metadata ?? {};
return metadata.avatar_url ?? metadata.picture ?? "";
```

`safeGoogleAvatarUrl` 的唯一 caller 是 `components/Avatar.tsx:23`，而 `AvatarProps.avatarUrl?: string`。
join preview 的 `avatarUrl` 也在 `sessionMappers.ts:162`／`:173` 由 `asText` 產出 string。原本
`GOOGLE_AVATAR_URL` regex 完全未動；理論 object 仍先變成 `[object Object]`、regex fail-closed 回空字串，
本批沒有改這條 runtime 路徑。

nickname caller 清單是 `Avatar.tsx:35` 與 `SessionDetailSheet.tsx:571`。profile nickname 經
`mapCurrentProfile` 的 `asText`；directory／presence mappers 各自 `nickname: asText(...)`；session roster、
join preview、mock preview 與 chat mapper 的防偽原文分別在 `sessionMappers.ts:146,160,171,184`。
因此實務 nickname 是 string；原本理論 object 顯示 `[`、空值 fallback「球」的行為都未改。

### 4.5 Taipei datetime-local

全庫 caller 掃描：

```text
$ rg -n "taipeiLocalDateTimeToIso" . --glob '!node_modules/**' --glob '!dist/**' --glob '*.{js,mjs,ts,tsx}'
src/views/sessionFormViews.js:70   validate create startAtLocal
src/views/sessionFormViews.js:72   已先 String() 的 rangeEndInput
src/views/sessionFormViews.js:145  validate update startAtLocal
src/views/sessionFormViews.js:498  timeInput?.value
src/sessionViews.js:625            re-export，非 caller
tests/session-create-form.test.js:60-62  string literals
```

`:70` 的 production input 由 `createSessionFormRawInput()` 組成 string；候選值由 template literal
生成，固定值由日期與時間字串 template 生成。`:145` 的 production input 來自
`Object.fromEntries(new FormData(form).entries())`，對應 datetime-local control 是 string；`:498` 明確是
`HTMLInputElement.value | undefined`。測試 caller 全是 datetime string literal。沒有 object 來源。

## 5. 4 檔 erased-token 對帳

沿 A–C 既有 gate：同一版 esbuild、TS loader、`format: "esm"`、`target: "esnext"`、
`minifyWhitespace: true`、`treeShaking: false`，比較 HEAD 與 working tree 完整 `.code` raw bytes／
SHA-256：

```text
src/profile.ts BYTE_IDENTICAL 1335 520c969792c5acb2e551ed83f5f13c104f6d3db9e5cce2cdf581a899174b11d6 520c969792c5acb2e551ed83f5f13c104f6d3db9e5cce2cdf581a899174b11d6
src/sessionController.ts BYTE_IDENTICAL 19820 531a0d3263ebd5e2cb51940259daf792026177632585db7f530be85394df8fa0 531a0d3263ebd5e2cb51940259daf792026177632585db7f530be85394df8fa0
src/sessionPresentation.ts BYTE_IDENTICAL 25653 ba55cd30e424f67aba61c3e23096101afb261cb02e36ec161099772dd14b3dfe ba55cd30e424f67aba61c3e23096101afb261cb02e36ec161099772dd14b3dfe
src/taipeiTime.ts BYTE_IDENTICAL 3059 f32ca70a097046a8e344e3ebfbab7e95b2645e90b8a8901299e775b27269ee8f f32ca70a097046a8e344e3ebfbab7e95b2645e90b8a8901299e775b27269ee8f
EXIT_CODE=0
```

沒有 emitter 或 runtime-token 例外表。

## 6. 規則 canary 三拍

canary source 基準：

```text
8adbfa5f141483c1897973815f922bd5232094f3711cd8dfc57f0d818a05f849  src/taipeiTime.ts
```

依派工暫加：

```ts
export const c = String({});
```

紅燈逐字：

```text
src/taipeiTime.ts
  3:25  error  '{}' will use Object's default stringification format ('[object Object]') when stringified  @typescript-eslint/no-base-to-string

✖ 1 problem (1 error, 0 warnings)
EXIT_CODE=1
```

移除後 SHA-256 byte-identical 回到 `8adbfa5f...f849`，單檔 lint 與 `git diff --check` 均
`EXIT_CODE=0`；canary 沒有殘留。

## 7. 剩餘規則與 generated ledger 對照

以 ESLint API 在記憶體中暫時設為 error，沒有改寫 config：

| 規則 | Phase D 前 findings / files | 最終 findings / files | 對帳 |
| --- | ---: | ---: | --- |
| `unbound-method` | 246 / 28 | 246 / 28 | 不變 |
| `no-redundant-type-constituents` generated ledger | 2 / 1 | 2 / 1 | 不變 |

generated 兩筆仍位於：

```text
src/data/databaseTypes.ts:1933:42  'never' is overridden by other types in this union type
src/data/databaseTypes.ts:1949:5   'never' is overridden by other types in this union type
```

最終為 1 條 off／246 筆一般待修，另加 generated ledger 2 筆，合計記帳 248。

## 8. bundle 與 dynamic edge

```text
main: 638937 raw / 187466 gzip（淨值 0 / 0 B）
total JS: 841561 raw / 257627 gzip（淨值 0 / 0 B）
largest app lazy: MySessionsPage-Byp_C9FO.js 16476 / 4828
private repository: privateDataRepository-CfJqlfj0.js
Sentry: sentryBrowserSdk-Czz5dmkg.js
```

total gzip 仍低於 gate 1,435 B，沒有使用餘裕。

```text
$ rg -o 'window\.__importAppModule' src tests | wc -l
110
```

與基準相同；零 importer 或 dynamic edge 變更。

## 9. 收尾標準矩陣

```text
$ npm run typecheck
> tsc --noEmit
EXIT_CODE=0

$ npm run lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts
EXIT_CODE=0

$ npm run prettier:check
Checking formatting...
All matched files use Prettier code style!
EXIT_CODE=0

$ npm run build
vite v6.4.3 building for production...
✓ 508 modules transformed.
dist/assets/index-BWygPPVv.js 638.94 kB | gzip: 187.47 kB
✓ built in 1.34s
EXIT_CODE=0

$ npm run check:production-bundle
production bundle check passed: development E2E hook present, production E2E hook absent;
32 files, 12 demo identifiers absent; main 638937/187466 within 658867/192420;
largest app lazy MySessionsPage-Byp_C9FO.js 16476/4828 within 18000/5500;
total JS 841561/257627 within 849961/259062;
private repository: privateDataRepository-CfJqlfj0.js;
Sentry: sentryBrowserSdk-Czz5dmkg.js
EXIT_CODE=0

$ npm run test:mock
# unit: 346 passed, 0 failed
# browser: 4 skipped, 298 passed (53.2s)
EXIT_CODE=0

$ npm run test:local
# local API: 2 passed, 0 failed
# Supabase Chromium: 11 skipped, 45 passed (1.4m)
EXIT_CODE=0

$ git diff --check
(no output)
EXIT_CODE=0

$ git diff -- tests src/data src/domainTypes.ts tsconfig.json package.json package-lock.json
(no output)
EXIT_CODE=0
```

unit 階段出現既知非致命 `WebSocket server error: Port 24678 is already in use`；346/346 與 exit 0
不受影響，未 retry。既知 `chat-settings-filters-smoke:468` 本次通過；mock／local 沒有污染紅、
guarded reset 或 retry。

## 10. Codex 五問

### 1. 如何證明規則真的恢復？

一般 TS effective config 為 `[2]`，真 config 全庫 lint 綠；config 恰刪指定兩行。空物件標準
canary 精準報 `no-base-to-string`，移除後 source SHA byte-identical 並回綠，沒有用另一個 override、
disable 或寬型別把規則關回去。

### 2. 如何證明 8 個 cast 沒有掩蓋真實 object？

每站都從 caller 追到 construction：profile／court／roster／preview 經 `asNumber`／`asText`；reason
來自已通過非空檢查的 DOM radio value；auth metadata 有 string/null contract；datetime 來自 form string、
FormData 或 input value。報告列出全庫 caller 與 mapper 防偽原文；沒有任何 object construction site。

### 3. 如何證明 runtime 與三級 profile gate 沒變？

四檔完整 esbuild bytes/hash 全等，`String`、nullish fallback、trim、regex、avatar initial 與 gate
boolean expression 原樣；bundle raw/gzip 淨 0 B。346 unit、298 mock browser、2 local API 與 45 local
browser 全數通過，包含 profile gate、avatar、create/edit/decision time 與 report journey。

### 4. `as ... satisfies ...` 是否偏離派工或形成新契約？

沒有。它只出現在 null guard 後的 String operand，assertion 目標仍是證明到的 `string | number`；
`satisfies` 重複檢查同一型別，沒有改參數宣告或 caller assignability。採用原因是直接 assertion 會與
Phase B 規則衝突；兩個 token 都被擦除，raw gate 證明沒有 runtime 差異。其餘 source 只含派工列出的
casts，frozen paths 零 diff。

### 5. Phase E manifest 產出批的具體建議

建議先做一個只讀、deterministic 的產出批，不同時修 lint：

1. 新增 `scripts/generate-eslint-unbound-manifest.mjs`，用目前 lockfile 的 ESLint Node API 以記憶體
   override 打開 `unbound-method`，取得 rule、path、range、message；再用 TypeScript Program／
   TypeChecker 定位 expression、receiver type、method declaration 與 `this` reference。
2. 產出 canonical `docs/arch-eslint-phaseE-unbound-manifest.json`，並由同一份 JSON render
   `docs/arch-eslint-phaseE-unbound-manifest.md`。JSON 不寫 wall-clock timestamp；固定 key order、POSIX
   relative path 與 LF，確保重跑 byte-identical。
3. 每筆欄位至少含：`stableId`、rule、path、AST structural path、expression fingerprint、owner factory／
   component、receiver type、declaration path／kind、`this` 使用、transfer sink、invocation／cleanup、callback
   identity sensitivity、family、proposed fix class、tests、review status。
4. stable ID 取 `sha256(rule + path + AST structural path + normalized expression + declaration
   fingerprint)` 前 16 bytes；不把 line／column 放入 ID，兩者只作導航。相同 shorthand 名稱靠 owner 與
   structural path 去重。
5. script 支援 `--check`：重新產出至 temp、逐 byte 比 JSON／Markdown；硬 gate 為 findings 246、files
   28、duplicate ID 0、unresolved declaration 0、`sessionController.ts` 63。另對排序後 canonical findings
   計 SHA-256，checksum 寫入 Markdown header；任一數字或 hash 漂移即失敗並要求重新審查。

`sessionController.ts` 63 筆的首批抽樣預覽不是 63 種獨立問題，而是七個 factory-return
destructuring 家族：

| consumer 位置 | factory | 筆數 | 抽樣 expression | 初步分類 |
| --- | --- | ---: | --- | --- |
| `314-328` | `createMySessionsController` | 15 | `actionFor`, `captureAuthSnapshot`, `reloadParticipation` | closure function 從回傳物件解構；來源檔無 `this` |
| `353-360` | `createPlayerDirectoryController` | 8 | `getPlayerGroups: playerGroups`, `openCourt` | alias destructuring；來源檔無 `this` |
| `379-391` | `createDiscoveryMapController` | 13 | `getVisibleSessions: visibleSessions`, `publish`, `setFilter` | alias／plain destructuring；來源檔無 `this` |
| `424-435` | `createIntentController` | 12 | `isReconcileSuppressed: reconcileSuppressed`, `requestJoin` | alias／plain destructuring；來源檔無 `this` |
| `455-465` | `createLifecycleActionsController` | 11 | `cancelMySession`, `requireMySessionAction`, `withdraw` | closure function 從回傳物件解構；來源檔無 `this` |
| `468` | `createAuthController` | 3 | `setAuthSession`, `setAuthState`, `setProfile` | 同一行三個 factory function；來源檔無 `this` |
| `613` | `createChatController` | 1 | `openSessionChat` | 單一 factory function；來源檔無 `this` |

```text
$ rg -n "\bthis\b" src/controller/{mySessionsController,playerDirectoryController,discoveryMapController,intentController,lifecycleActionsController,authController,chatController}.ts
(no output)
```

因此這 63 筆應先標為「高信心 this-free factory closure」，而不是先加 `.bind()` 或 wrapper。Phase E
產出批仍需讓 TypeChecker 對每個 declaration 做逐筆確認；修復批再比較兩條零 runtime 候選：在具名
function declaration補 `this: void`，或在 factory return contract 把 method signature 明定成帶
`this: void` 的 function property。任何會新增 arrow／bind、改 function identity 或 cleanup 行為的方案另立
behavior 批，不能混入 manifest 產出。

## 11. 未做、疑義與 BLOCKED

- 未做：Phase E 程式／manifest、generated generator 後處理、測試／importer／runtime／文案變更、新依賴。
- 疑義：直接 `value as string | number` 與 `no-unnecessary-type-assertion` 衝突；已用同型別
  `satisfies` 的 erasable 寫法解決並完整記錄，沒有未決事項。
- runtime-token 例外：無。
- BLOCKED：無。
- Git：未 commit、未 push。
