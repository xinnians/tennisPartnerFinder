# ESLint 恢復 Phase A 回報：unsafe argument／call／return

- 日期：2026-08-28
- 開工 HEAD：`a66bb2b`（其 parent `3827d02` 為批 6F ACCEPTED）
- 結果：**完成，未 BLOCKED**
- Git：未 commit、未 push；working tree 留給驗收方

## 1. 結論與範圍

已從 `eslint.config.js` 移除三條 type-aware 規則的 off override，使其重新繼承
`recommendedTypeChecked` 的 error：

```text
@typescript-eslint/no-unsafe-return=[2]
@typescript-eslint/no-unsafe-call=[2]
@typescript-eslint/no-unsafe-argument=[2]
```

開工時暫時恢復規則，精準重現 frozen manifest 的 15 筆 finding，沒有多或少；暫時掃描後
`eslint.config.js` 回到原 SHA-256
`54d0866249f508a93b24a804e4240e333678a6bd0b860714f92c7582cf05c425`，才開始永久修改。

最終同口徑三規則均為 0 finding。只修改 config 與四個 runtime source；
`notificationFeature.ts` 的三筆由 `config.ts` 來源型別收斂自然消除，檔案本身零 diff。
沒有測試、importer、文案、dependency 或 runtime token 變更。

## 2. config diff 式樣與理由

採派工首選「刪行式」：恰刪六行，即三個 off rule 行與各自正上方的 debt comment。沒有新增
`"error"` 覆寫，也沒有碰相鄰六條 off。

```diff
-      // 既有 type-aware 型別債，本批不改變既有程式語意。
-      "@typescript-eslint/no-unsafe-return": "off",
-      // 既有 type-aware 型別債，本批不改變既有程式語意。
-      "@typescript-eslint/no-unsafe-call": "off",
...
-      // 既有 type-aware 型別債，本批不改變既有程式語意。
-      "@typescript-eslint/no-unsafe-argument": "off",
```

理由：現檔以「off 區塊＝尚未償還的債」維護；恢復就是移出債清單，讓
`recommendedTypeChecked` 單源決定 severity。effective config 已以 ESLint API 驗證三條皆
`[2]`，其餘六條皆 `[0]`。

## 3. 15 筆逐筆修法

| 開工位置／規則                           | 根因                                                                     | 修法                                                                                      | 性質            |
| ---------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------- |
| `dataRepository.ts:83:30` return         | `RepositoryOptions.now: unknown` 經 `typeof` 後落成 `Function`／不明回傳 | `now?: (() => Date) \| Date`                                                              | type annotation |
| `dataRepository.ts:83:58` call           | 同上                                                                     | 同一來源 port 收斂；原三元保留                                                            | type annotation |
| `notificationFeature.ts:64:32` call      | Vite env index signature 使 Web Push key 為 `any`                        | `AppImportMetaEnv` 明列五個 Vite keys，export 保留 `: string`                             | upstream type   |
| `notificationFeature.ts:83:36` call      | 同上                                                                     | 同上；`trim()` 原樣                                                                       | upstream type   |
| `notificationFeature.ts:159:10` call     | 同上                                                                     | 同上；gate 原樣                                                                           | upstream type   |
| `sessionPresentation.ts:126:3` return    | `Array.isArray` 對 readonly array 產生 `any[]`                           | collection cast `as CourtInput[]`                                                         | erasable cast   |
| `sessionPresentation.ts:127:72` argument | 同一 `court` 因上游 array 成為 `any`                                     | 同一 collection cast                                                                      | erasable cast   |
| `sessionPresentation.ts:128:21` return   | 同一 `court.name` 成為 `any`                                             | 同一 collection cast                                                                      | erasable cast   |
| `sessionPresentation.ts:251:30` return   | court catalogue value 被推成 `any`                                       | catalogue source `as CourtInput[]`；filtered names `as string[]` 保住既有 return contract | erasable casts  |
| `sessionPresentation.ts:500:3` return    | readonly roster 經 `Array.isArray` 成為 `any[]`                          | `as SessionRosterEntry[]`                                                                 | erasable cast   |
| `sessionPresentation.ts:526:45` argument | safe messages 陣列被推成 `any[]`                                         | `as ChatMessage[]`                                                                        | erasable cast   |
| `sessionPresentation.ts:582:3` return    | candidate court collection/value 型別遺失                                | catalogue source `as CourtInput[]`＋最終 `as CourtInput[]`                                | erasable casts  |
| `sessionPresentation.ts:583:23` return   | 同上                                                                     | 同一兩個 casts                                                                            | erasable casts  |
| `sessionPresentation.ts:638:3` return    | readonly courts 經 `Array.isArray` 成為 `any[]`                          | `as CourtInput[]`                                                                         | erasable cast   |
| `sheets.ts:82:7` call                    | `typeof` guard 後仍落成全域 `Function` 型別                              | `(unmount as () => void)()`                                                               | erasable cast   |

### 3.1 `config.ts` 來源收斂

派工要求至少標註 `WEB_PUSH_VAPID_PUBLIC_KEY`，並建議同型 export 同批補齊。本批將五個 env
export 全部標成 `string`：Google Maps key/map ID、support email、Web Push key、LINE
provider ID。

只加 export annotation 會把下游 call 修好、卻把五筆 `any` assignment 留在來源。因此再以
local `AppImportMetaEnv` 精確列出同五個 optional string key，真正收斂
`ImportMetaEnv` index signature；沒有改 `??` fallback、字面或 env 讀取時序。這也使尚未恢復的
`no-unsafe-assignment` 不會把同一債重新報在 `config.ts`。

### 3.2 `dataRepository.ts` tolerant 契約

`now` 仍接受 function 或非函式 `Date`；`typeof now === "function" ? now() : now` 三元逐 token
保留，沒有新增 wrapper、guard 或 fallback。

## 4. erasable cast 清單

共九個 cast：

1. `profileCourtNames` 的 court collection。
2. `sessionVenuePresentation` 的 catalogue source。
3. 同函式 filtered candidate names result。
4. `acceptedChatRoster` 的 roster collection。
5. `chatMessagesPresentation` 的 messages collection。
6. `candidateCourtRows` 的 catalogue source。
7. 同函式 filtered rows result。
8. `taipeiCourts` 的 court collection。
9. `sheets.ts` guarded `unmount` callable。

沒有用 cast 把外部資料假裝已驗證；presentation casts只恢復函式參數原已宣告的 element type，
處理的是 TypeScript 對 `Array.isArray(readonly T[])` 的 narrowing 缺口。兩個 `.filter(Boolean)`
expression 沒有改成 runtime type predicate。

## 5. 五檔 erased-token 對帳

使用 esbuild TS loader，HEAD 與 working tree 均以 `format: "esm"`、
`minifyWhitespace: true`、`target: "esnext"`、`treeShaking: false` 正規化：

```text
{"file":"src/config.ts","equal":true,"oldBytes":1012,"newBytes":1012,"oldHash":"5f6240b078480f0a34c510867e1976435072dc36d08bc011eebb7ec648c8b74c","newHash":"5f6240b078480f0a34c510867e1976435072dc36d08bc011eebb7ec648c8b74c"}
{"file":"src/data/repositories/dataRepository.ts","equal":true,"oldBytes":7605,"newBytes":7605,"oldHash":"48e7f3f12b92f3cdf2d3b8a110c674f9724b2fc1930aa5c3db4dd851bf2ad3c1","newHash":"48e7f3f12b92f3cdf2d3b8a110c674f9724b2fc1930aa5c3db4dd851bf2ad3c1"}
{"file":"src/features/notifications/notificationFeature.ts","equal":true,"oldBytes":4449,"newBytes":4449,"oldHash":"2c7a12b6d1d085f92dbe772a44b75fe0550798c0f5724429ed9180086bdb74d8","newHash":"2c7a12b6d1d085f92dbe772a44b75fe0550798c0f5724429ed9180086bdb74d8"}
{"file":"src/sessionPresentation.ts","equal":true,"oldBytes":25653,"newBytes":25653,"oldHash":"ba55cd30e424f67aba61c3e23096101afb261cb02e36ec161099772dd14b3dfe","newHash":"ba55cd30e424f67aba61c3e23096101afb261cb02e36ec161099772dd14b3dfe"}
{"file":"src/sheets.ts","equal":true,"oldBytes":3923,"newBytes":3923,"oldHash":"5640ef710d56426b248c943d6540a409ff02f6ca4027c22ad22d15dcd2fd5209","newHash":"5640ef710d56426b248c943d6540a409ff02f6ca4027c22ad22d15dcd2fd5209"}
EXIT_CODE=0
```

`notificationFeature.ts` 雖零 source diff，仍列入五檔對帳，因其三筆 finding 是本批 manifest
的一部分。五檔沒有 runtime-token 例外表。

## 6. 規則 canary ×3

三個 canary 均在最終實作後暫加於 `config.ts`。共同基準 SHA-256：

```text
3d77f025eca563fbba1c907da294d3f047b4610b7b20c525cc6394c1c4d7b800  src/config.ts
```

### 6.1 `no-unsafe-return`

暫加：

```ts
export const eslintUnsafeReturnCanary = () => JSON.parse("null");
```

```text
src/config.ts:48:47  error  Unsafe return of a value of type `any`  @typescript-eslint/no-unsafe-return
✖ 1 problem (1 error, 0 warnings)
EXIT_CODE=1
```

移除後 SHA 回到 `3d77f025...d7b800`，`npm run lint` exit 0。

### 6.2 `no-unsafe-call`

暫加：

```ts
export function eslintUnsafeCallCanary(): void {
  JSON.parse("null")();
}
```

```text
src/config.ts:49:3  error  Unsafe call of an `any` typed value  @typescript-eslint/no-unsafe-call
✖ 1 problem (1 error, 0 warnings)
EXIT_CODE=1
```

移除後 SHA 回到 `3d77f025...d7b800`，`npm run lint` exit 0。

### 6.3 `no-unsafe-argument`

暫加一個 `string` sink，並傳入 `JSON.parse("null")`：

```text
src/config.ts:53:28  error  Unsafe argument of type `any` assigned to a parameter of type `string`  @typescript-eslint/no-unsafe-argument
✖ 1 problem (1 error, 0 warnings)
EXIT_CODE=1
```

移除後 SHA 回到 `3d77f025...d7b800`，`npm run lint` exit 0。三個 canary 最終均無殘留。

## 7. 九條規則重掃與六條 debt 對照

| 規則                             | Phase A 前 findings / files | 最終 findings / files | 對帳            |
| -------------------------------- | --------------------------: | --------------------: | --------------- |
| `no-unsafe-return`               |                       8 / 2 |                 0 / 0 | 本批恢復        |
| `no-unsafe-call`                 |                       5 / 3 |                 0 / 0 | 本批恢復        |
| `no-unsafe-argument`             |                       2 / 1 |                 0 / 0 | 本批恢復        |
| `no-redundant-type-constituents` |                       9 / 6 |                 9 / 6 | 不變            |
| `no-unnecessary-type-assertion`  |                      10 / 8 |                10 / 8 | 不變            |
| `no-unsafe-member-access`        |                      25 / 4 |                 6 / 3 | 合法連帶下降 19 |
| `no-unsafe-assignment`           |                      12 / 7 |                 4 / 3 | 合法連帶下降 8  |
| `no-base-to-string`              |                       8 / 4 |                 8 / 4 | 不變            |
| `unbound-method`                 |                    246 / 28 |              246 / 28 | 不變            |

兩個漂移逐來源解釋：

- member-access：`WEB_PUSH_VAPID_PUBLIC_KEY` 成為 `string`，notification 的三個 `.trim`
  不再是 unsafe member；presentation array/court/message casts讓同一批被 `any[]` 污染的 member
  access 回復原參數 element type。現存 6 筆只在 chat、sessionController、
  sessionPresentation 三檔，均不是本批 15 筆。
- assignment：local env key interface 消除 config／notification／map 的 env-any 傳遞；
  presentation typed collections消除 array-any assignment。現存 4 筆只在 chatController 1、
  filters 2、sessionController 1，未碰這些檔。

這些下降都是修 Phase A 根因的型別層副作用，不是順手修改其他檔；其餘六條仍維持 off。

## 8. bundle 與 dynamic edge

production bundle 與基準完全相同：

```text
main: 638937 raw / 187466 gzip (淨值 0 / 0 B)
total JS: 841561 raw / 257627 gzip (淨值 0 / 0 B)
largest app lazy: MySessionsPage-Byp_C9FO.js 16476 / 4828
private repository: privateDataRepository-CfJqlfj0.js
Sentry: sentryBrowserSdk-Czz5dmkg.js
```

total gzip 仍低於 gate 1,435 B；沒有使用餘裕。

```text
$ rg -o 'window\.__importAppModule' src tests | wc -l
110
```

與基準相同；零 importer／dynamic edge 變更。

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
✓ built in 1.23s
EXIT_CODE=0

$ npm run check:production-bundle
production bundle check passed: development E2E hook present, production E2E hook absent;
32 files, 12 demo identifiers absent; main 638937/187466 within 658867/192420;
largest app lazy MySessionsPage-Byp_C9FO.js 16476/4828 within 18000/5500;
total JS 841561/257627 within 849961/259062;
private repository: privateDataRepository-CfJqlfj0.js;
Sentry: sentryBrowserSdk-Czz5dmkg.js
EXIT_CODE=0

$ npm run test:session-unit
# tests 346
# pass 346
# fail 0
# skipped 0
EXIT_CODE=0

$ npm run test:mock
4 skipped
298 passed (51.9s)
EXIT_CODE=0

$ npm run test:local
# local API: 2 passed, 0 failed
# Supabase Chromium: 11 skipped, 45 passed (1.5m)
EXIT_CODE=0

$ git diff --check
(no output)
EXIT_CODE=0

$ git diff -- tests
(no output)
EXIT_CODE=0
```

獨立 unit 階段有一次既知非致命 `WebSocket server error: Port 24678 is already in use`；
346/346 與 exit 0 不受影響，未 retry。mock/local 沒有污染紅、guarded reset 或 retry。

## 10. Codex 五問

### 1. 如何證明三條規則真的恢復，而不是只把 manifest 消音？

effective config 顯示三條為 `[2]`，最終記憶體重掃皆 0；三個獨立 canary 又各自精準打出
目標 rule ID，byte-identical 移除後 lint 回綠。config 沒有加入新的 scoped/global disable。

### 2. 如何證明 15 筆是從來源修，而不是在 consumer 堆 assertion？

repository 用實際 tolerant contract `Date | (() => Date)`；notification 三筆只改
`config.ts` env source，consumer 零 diff。presentation casts則只處理
`Array.isArray(readonly T[])` 失去 element type 的 TypeScript 缺口；八個 cast分布在六個
collection/result expression，沒有逐 member 強轉或把外部 unknown 當已驗證資料。

### 3. 如何證明沒有 runtime／tolerant 行為變更？

五檔 esbuild output bytes/hash 全等；repository 三元、notification trim/gate、presentation
`Array.isArray`／`filter(Boolean)`、sheets `typeof` guard與立即 unmount順序全部保留。
production main/total bundle raw與gzip也都是淨 0 B，再由 unit/mock/local 疊加驗證。

### 4. 六條尚未恢復規則的下降是否越界？

沒有。只有 member-access 25→6、assignment 12→4；兩者都直接來自本批必要的 env source與
typed collection 收斂，而且沒有修改它們剩餘 finding 所在的凍結檔。其餘四條數量完全
不變。下降已按來源與現存檔案清單列於 §7，並未趁機恢復規則。

### 5. 對 Phase B 的建議

`databaseTypes.ts` generated 策略選 plan §5 **方案一：generated scoped override**。
Phase B 先在 handwritten TS 恢復 `no-redundant-type-constituents`；只有具固定 generated
header 的 `src/data/databaseTypes.ts` 暫時維持 off，將其 2 筆 finding明確留在 manifest。
理由是目前尚未證明 Supabase generator 後處理可跨版本 deterministic；直接手改會在下次
`db:gen-types` 被覆寫，而現在就改 generator pipeline 會把工具鏈風險混入純型別批。後續若
能以 `generate → zero diff` canary 證明穩定，再另批升級到方案二。

`no-unnecessary-type-assertion` 的 10 筆應逐檔移除 assertion／non-null token，必要時以
explicit annotation、generic 或 type-only import補回推導，不順手簡化 expression、guard或
default。每檔都以 HEAD/current esbuild raw全等為硬 gate；若 assertion 移除後括號在 emitter
留下差異，先調整 erasable type寫法，仍不全等就停手裁決。規則本身也做 canary
紅→SHA 還原→綠。任何需要新增 runtime guard 才能維持 typecheck 的位置，不屬 Phase B
annotation-only 修法，應拆出行為批。

## 11. 未做、疑義與 BLOCKED

- 未做：其餘六條規則恢復、Phase B、測試／importer／runtime／文案變更、新依賴、設定擴張。
- 疑義：派工預期 env annotation「可能消除」assignment；單獨 annotation 實測會留下五筆
  source assignment，因此本批用 local key interface真正收斂來源，仍是零-token type-only。
- runtime-token 例外：無。
- BLOCKED：無。
- Git：未 commit、未 push。
