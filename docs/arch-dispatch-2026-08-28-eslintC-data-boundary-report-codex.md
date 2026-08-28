# ESLint 恢復 Phase C 回報：unsafe assignment＋member access

- 日期：2026-08-28
- 開工 HEAD：`ac9cf9f`（其 parent `1ddceac` 為 Phase B ACCEPTED）
- 結果：**完成，未 BLOCKED**
- Git：未 commit、未 push；working tree 留給驗收方

## 1. 結論與範圍

已恢復兩條 type-aware 規則：

```text
@typescript-eslint/no-unsafe-assignment=[2]
@typescript-eslint/no-unsafe-member-access=[2]
```

開工前以 ESLint API 記憶體覆寫重掃，精準重現 10 筆 frozen manifest：assignment 4、member
access 6，沒有多或少。最終修正分成 4 筆由 typed mapper 載重的 local port 收斂，以及 6 筆
`Array.isArray` collection cast。

5 個 source 檔均只有 `import type`、port return type 或 assertion token 變更；逐檔 esbuild
擦除後 raw output byte-identical。沒有測試、importer、文案、dependency、runtime guard、
validator、statement、`src/data/**`、`domainTypes.ts` 或 generated output 變更。

## 2. config diff

恰刪兩個 off rule 行及各自正上方 debt comment，共四行；不新增顯式 `"error"` 覆寫：

```diff
-      // 既有 type-aware 型別債，本批不改變既有程式語意。
-      "@typescript-eslint/no-unsafe-member-access": "off",
-      // 既有 type-aware 型別債，本批不改變既有程式語意。
-      "@typescript-eslint/no-unsafe-assignment": "off",
```

effective config 實測一般 TS 的兩條規則皆為 `[2]`。`no-base-to-string`、`unbound-method`
仍為 `[0]`；`databaseTypes.ts` 的 redundant scoped override 仍為 `[0]`，零變更。

## 3. 10 筆逐筆修法

| 開工位置 | 規則 | 分類 | 修法 |
| --- | --- | --- | --- |
| `controller/chatController.ts:125:7` | assignment | port 收斂 | `loadSessionMessages` 由 `Promise<unknown>` 收成 `Promise<ChatMessage[]>`，並加入 `import type ChatMessage` |
| `features/chat/chatFeature.ts:8:32` | member | cast | `Array.isArray(messages) ? messages : []` collection 斷言為 `Partial<ChatMessage>[]` |
| `filters.ts:179:9` | assignment | cast | `filterSessions` 的 tolerant collection 斷言為 `SessionInput[]` |
| `filters.ts:242:9` | assignment | cast | `sortSessionsForDrawer` 的 tolerant collection 斷言為 `SessionInput[]` |
| `sessionController.ts:499:55` | assignment | port 收斂 | `loadSessionJoinPreview` 由 `Promise<unknown>` 收成 `Promise<SessionJoinPreview[]>`，並加入 `import type SessionJoinPreview` |
| `sessionController.ts:500:40` | member | port 收斂 | 同一 typed port 讓 sort callback 的 left element 保持 `SessionJoinPreview` |
| `sessionController.ts:500:72` | member | port 收斂 | 同一 typed port 讓 sort callback 的 right element 保持 `SessionJoinPreview` |
| `sessionPresentation.ts:689:76` | member | cast | courts collection 斷言為 `CourtInput[]`，恢復 `.id` element type |
| `sessionPresentation.ts:694:65` | member | cast | 同一 collection cast 恢復 `.id` element type |
| `sessionPresentation.ts:694:89` | member | cast | 同一 collection cast 恢復 `.name` element type |

逐筆分類合計：port 收斂 4、collection cast 6。原有 `typeof`、`Array.isArray`、spread、sort、
fallback 與 optional chaining 全部逐 token 保留。

## 4. port 型別落點與 lazy 委派證據

chat feed 的來源鏈：

```text
privateDataRepository.ts:265
rowsOrEmpty(data).map(mapSessionMessageRow).reverse()

sessionMappers.ts:179
mapSessionMessageRow(...): ChatMessage

dataRepository.ts:201
bindPrivateMethod("loadSessionMessages")
```

join preview 的來源鏈：

```text
privateDataRepository.ts:248
rowsOrEmpty(data).map(mapSessionJoinPreviewRow)

sessionMappers.ts:156
mapSessionJoinPreviewRow(...): SessionJoinPreview

dataRepository.ts:200
bindPrivateMethod("loadSessionJoinPreview")
```

型別落點是既有 `domainTypes.ts:77` 的 `SessionJoinPreview` 與 `:100` 的 `ChatMessage`。
private repository 的 mock／configured 兩支都經具名 mapper；lazy binder 沒有轉換結果。因此 local
controller port 收窄是把既有 mapper contract 傳到 consumer，不是用 assertion 信任未驗證 row。
`src/data/**` 與 `domainTypes.ts` 本批皆零 diff。

## 5. 5 檔 erased-token 對帳

HEAD 與 working tree 均交給同一版 esbuild，使用 TS loader、`format: "esm"`、
`target: "es2022"`、無 sourcemap；比較完整 `.code` raw bytes 與 SHA-256：

```text
src/controller/chatController.ts BYTE_IDENTICAL 7477 4a0061cd3154af475139a31d4d646108d8ae0aa7d1b88d88cf7106d41b83e2cc 4a0061cd3154af475139a31d4d646108d8ae0aa7d1b88d88cf7106d41b83e2cc
src/features/chat/chatFeature.ts BYTE_IDENTICAL 735 9df162df97db962722e42249c542e7ce055489fc10847189b8bd004e0e9c7565 9df162df97db962722e42249c542e7ce055489fc10847189b8bd004e0e9c7565
src/filters.ts BYTE_IDENTICAL 6678 fb886303f143ee9014e4d13d1621db388ba63e236b98e64fac441d305926cc0e fb886303f143ee9014e4d13d1621db388ba63e236b98e64fac441d305926cc0e
src/sessionController.ts BYTE_IDENTICAL 24116 85e8f20076a22d76d16a4aefb9c436f7ee293f393e5a4a954c6ba03a2a9c202d 85e8f20076a22d76d16a4aefb9c436f7ee293f393e5a4a954c6ba03a2a9c202d
src/sessionPresentation.ts BYTE_IDENTICAL 29320 10a86d0aa3505d133594a50e857832f6ec913841c1249574f26af3fd50d0bc03 10a86d0aa3505d133594a50e857832f6ec913841c1249574f26af3fd50d0bc03
EXIT_CODE=0
```

五檔全等，沒有 runtime-token 例外表。

## 6. 規則 canary 三拍

共同 canary 檔修正後基準：

```text
32693f1bc5ae5aa41489b3c2fdd0c44e9042a5abdd433322652169895198a377  src/features/chat/chatFeature.ts
```

### 6.1 unsafe assignment

暫加：

```ts
export const eslintUnsafeAssignmentCanary: string[] = JSON.parse("[]");
```

紅燈逐字：

```text
src/features/chat/chatFeature.ts
  4:14  error  Unsafe assignment of an `any` value  @typescript-eslint/no-unsafe-assignment

✖ 1 problem (1 error, 0 warnings)
EXIT_CODE=1
```

移除後 SHA-256 回到 `32693f1b...a377`，單檔 lint `EXIT_CODE=0`。

### 6.2 unsafe member access

暫加：

```ts
export function eslintUnsafeMemberCanary(): void {
  void JSON.parse("{}").x;
}
```

紅燈逐字：

```text
src/features/chat/chatFeature.ts
  5:25  error  Unsafe member access .x on an `any` value  @typescript-eslint/no-unsafe-member-access

✖ 1 problem (1 error, 0 warnings)
EXIT_CODE=1
```

移除後 SHA-256 再次回到 `32693f1b...a377`，單檔 lint 與 `git diff --check` 均
`EXIT_CODE=0`。兩個 canary 沒有殘留。

## 7. 其餘兩條 off 與 generated ledger 對照

以 ESLint API 暫時在記憶體中設為 error；沒有改寫 config：

| 規則 | Phase C 前 findings / files | 最終 findings / files | 對帳 |
| --- | ---: | ---: | --- |
| `no-base-to-string` | 8 / 4 | 8 / 4 | 不變 |
| `unbound-method` | 246 / 28 | 246 / 28 | 不變 |
| `no-redundant-type-constituents` generated ledger | 2 / 1 | 2 / 1 | 不變 |

generated 兩筆仍精準位於：

```text
src/data/databaseTypes.ts:1933:42  'never' is overridden by other types in this union type
src/data/databaseTypes.ts:1949:5   'never' is overridden by other types in this union type
```

最終一般待修為 254 筆（base-to-string 8＋unbound-method 246），另加 generated ledger 2 筆；
符合派工單預期的 2 條 off／256 findings 記帳方式。

`unbound-method` 的 246 筆／28 檔分布 checksum：

```text
63 sessionController.ts; 22 intentController.ts; 19 AppServicesProvider.tsx;
16 CreateSessionSheet.tsx; 13 lifecycleActionsController.ts; 13 playerDirectoryController.ts;
12 authController.ts; 11 chatController.ts; 9 MePage.tsx; 8 FilterSheet.tsx;
8 PlayerCardSheet.tsx; 8 PlayerDirectorySheet.tsx; 6 discoveryMapController.ts;
5 MySessionsPage.tsx; 4 mySessionsController.ts; 4 DecideSessionSheet.tsx;
4 EditSessionSheet.tsx; 4 ProfileCompletionSheet.tsx; 4 SessionChatSheet.tsx;
3 App.tsx; 2 map.ts; 2 SessionDetailSheet.tsx; 其餘 6 檔各 1 筆。
```

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
✓ built in 1.43s
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
# browser: 4 skipped, 298 passed (52.6s)
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

unit 階段有既知非致命 `WebSocket server error: Port 24678 is already in use` 訊息；346/346 與
exit 0 不受影響，未 retry。既知 `chat-settings-filters-smoke:468` 本次通過；mock／local 沒有
污染紅、guarded reset 或 retry。

## 10. Codex 五問

### 1. 如何證明兩條規則真的恢復？

一般 TS effective config 的兩條規則皆為 `[2]`，真 config 全庫 lint 綠。兩個最小 canary
各自只報指定 rule ID；移除後檔案 SHA-256 byte-identical 還原並回綠。config 本體則恰刪派工單
指定四行，沒有以另一個 override 把規則關回去。

### 2. 為何兩個 port 可以由 unknown 收窄？

兩個 private repository 實作的 mock／configured 分支都落在 typed mapper；mapper return type
分別是 `ChatMessage` 與 `SessionJoinPreview`，lazy binder 只保留呼叫與回傳。controller port
收斂只是補回這條既有來源型別，且 typecheck 驗證所有 TS 注入點相容。原本 consumer 的
`typeof` 與 `Array.isArray` 防禦仍原樣保留。

### 3. 如何證明修復沒有改 runtime 行為？

5 個 source 檔的完整 esbuild output bytes 與 hash 逐檔全等；port 宣告、`import type` 與 casts
全在 erase layer。production main、total 與 lazy chunk raw／gzip 也全部淨 0 B，unit、mock、
local suite 再交叉驗證實際行為。

### 4. 如何證明沒有擴張解凍面或掩蓋其他債？

source diff 恰為 manifest 的五檔，另只有 config 與本報告；tests、`src/data/**`、
`domainTypes.ts`、package／tsconfig 皆零 diff。沒有 `any`、disable、ignore、validator 或新 runtime
statement。記憶體全開重掃仍精準得到 base 8、unbound 246、generated ledger 2，沒有數字漂移。

### 5. 對 Phase D 與 Phase E 的建議

Phase D 的逐筆初判如下。原則是 null／undefined 延續既有空值或 fallback；object 不應顯示或
參與比對為預設 `[object Object]`。只有能從 construction site 證明 primitive contract 的項目
才可用型別收窄做 zero-token；刻意接受 `unknown` 的 tolerant boundary 必須用行為批決定 object
fallback，不應用 annotation 掩掉。

| finding | null／undefined 政策 | object 政策 | 初判批次 |
| --- | --- | --- | --- |
| `profile.ts:22` `validProfileNtrp(value)` | invalid，沿用「尚未填寫 NTRP」／gate false | invalid；不可讓 custom/default stringify 變成有效 NTRP | **runtime 裁決**：這是刻意接 unknown 的 validator，需 guard 與 object case 測試 |
| `profile.ts:35` `profile.nick` | missing，nickname gate false | missing；不可因 `[object Object]` 成為已填暱稱 | **runtime 裁決**：private-profile tolerant boundary，需明定 fallback |
| `profile.ts:43` `court.id` | 不加入有效比對 key | 忽略，不得靠 stringify 命中訂閱值 | **zero-token 候選**：先證明所有 catalogue construction 都經 `mapCourt`，再把 local shape 對齊 `CourtSummary`；若仍允許外部 unknown row，改行為批 |
| `profile.ts:43` `court.name` | 不加入有效比對 key | 忽略，不得產生 `[object Object]` key | **zero-token 候選**：與 court.id 同一 contract family、同批處理 |
| `sessionController.ts:738` `reason` | empty，維持「請選擇檢舉原因。」 | 拒絕並走同一既有錯誤，不送出 object 字串 | **zero-token 候選**：DOM checked radio `.value` 是 `string \| undefined`，可同步收窄 `ReportDialogHandlers`；若保留 unknown API，則需 runtime guard |
| `sessionPresentation.ts:86` avatar URL | empty，不渲染 image | empty，不可允許 object `toString` 產生 URL | **runtime 裁決**：auth metadata 是不可信輸入，建議 primitive guard；既有空字串 fallback 不改文案 |
| `sessionPresentation.ts:91` nickname initial | fallback「球」 | fallback「球」，不可顯示 `[` | **runtime 文案裁決**：確認「球」為 object／空白共同 fallback，補 object case |
| `taipeiTime.ts:73` local datetime | invalid，回 `null` | invalid，回 `null`，不可接受 object `toString` | **zero-token 候選**：construction sites 都是 `HTMLInputElement.value` 字串；收窄參數前先以 caller manifest 證明完整性 |

建議 Phase D 先產出 8 筆 construction-site 表，再拆成「primitive contract 可證明」的
zero-token 小批與「unknown tolerance 是公開行為」的 behavior 小批；後者逐項加入
`null`／`undefined`／plain object／custom `toString` 測試，文案只沿用表中既有 fallback。

Phase E 不宜直接對 246 行逐行改。建議先用固定 ESLint／TypeScript 版本產生 machine-readable
manifest（JSON）與 reviewer Markdown，stable ID 由 `rule + path + AST kind + expression
fingerprint` 組成，line／column 只作導航。每筆至少記錄 receiver type、method declaration、
是否讀取 `this`、construction sites、傳遞 sink、呼叫方式、callback identity／remove-listener
敏感度、擬議分類與所需測試；輸出總數 246、檔數 28、逐檔 counts 與 checksum 作硬 gate。

人工作業再依 contract family 分群，而不是照檔案盲修：

1. 宣告可證明不使用 `this`：優先評估 declaration 上的 `this: void`，通常 zero-token。
2. 需要 receiver 的 instance method：箭頭 wrapper 或 bind 會產生 runtime function／identity 差異，另立行為批。
3. option bag／controller port 只傳函式：考慮把 method signature 改成 function property，但要同步所有 contract construction sites。
4. React event prop、timer、listener、Promise callback：特別標記 identity、cleanup 與 argument-shape 風險。
5. repository lazy method 與外部 library method：先追來源和 receiver 壽命，不用全域 disable 或 assertion。

先抽最高密度的 `sessionController.ts` 63 筆建立分類準則，再用 22／19／16 筆三個家族做
對立抽驗；準則穩定後才擴到全部 28 檔。manifest 應是 Phase E 派工輸入，不在掃描階段改碼。

## 11. 未做、疑義與 BLOCKED

- 未做：Phase D／E 規則恢復、generated generator 後處理、測試／importer／runtime／文案變更、新依賴。
- 疑義：無；開工 manifest、mapper 鏈、effective config 與預期 debt 都精準吻合。
- runtime-token 例外：無。
- BLOCKED：無。
- Git：未 commit、未 push。
