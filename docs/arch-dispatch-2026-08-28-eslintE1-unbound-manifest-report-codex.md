# ESLint 恢復 Phase E-1：unbound-method manifest 產出批回報（Codex）

- 日期：2026-08-28
- 開工 HEAD：`0c0d4d8`（parent `11c67e0 refactor(lint): Phase D ACCEPTED`）
- 結論：完成。只新增 generator、canonical JSON、reviewer Markdown 與本回報；未改
  `src/**`、`tests/**`、ESLint／TypeScript／package 設定，也未恢復規則或修 finding。
- 未 commit、未 push。

## 1. 交付物

- `scripts/generate-eslint-unbound-manifest.mjs`
- `docs/arch-eslint-phaseE-unbound-manifest.json`
- `docs/arch-eslint-phaseE-unbound-manifest.md`
- `docs/arch-dispatch-2026-08-28-eslintE1-unbound-manifest-report-codex.md`

## 2. Generator 設計摘要

### 2.1 掃描與 declaration 解析

- ESLint Node API 讀現行 flat config，再以記憶體 override 將
  `@typescript-eslint/unbound-method` 開為 error；固定掃
  `src/**/*.{ts,tsx}`、`vite.config.ts`，不寫暫存 config、不加依賴。
- TypeScript Program 直接讀 `tsconfig.json`；所有 `receiverType` 均以
  `ts.TypeFormatFlags.NoTruncation` 輸出。
- identifier、property access、element access、binding element 都經 TypeChecker symbol 解析；alias、
  shorthand forwarding、binding receiver 會遞迴追 declaration。無 initializer 的參數 ObjectPattern 標
  `parameter-pattern:<type>`；空物件預設值標 `default-empty-object:<type>`。
- declaration body 的 `this` 由 AST walk 判斷：arrow 繼承外層所以計入，巢狀 non-arrow function、class、
  method 有自己的 receiver 所以不計。無 body 的 source `MethodSignature` 與 `.d.ts` declaration 都誠實標
  `ambient-no-body`。

### 2.2 stable ID 正規化

- AST structural path 自 `SourceFile[0]` 起，每層為 `SyntaxKind[同型兄弟 0-based index]`。
  sibling 由 `ts.forEachChild()` 取得真正 AST children，不用會插入 `SyntaxList` wrapper 的
  `getChildren()`；index 缺失直接 fail closed。
- normalized expression 壓平空白；binding 同時保留 property 與 alias，例如
  `getPlayerGroups: playerGroups`；default 也保留 `= () => {}`。
- declaration fingerprint 固定為
  `POSIX declarationPath | SyntaxKind | declaration name | declaration structural path`，不含
  `typeToString`。
- stable ID 為
  `sha256(rule + NUL + path + NUL + AST path + NUL + expression + NUL + declaration fingerprint)`
  前 16 bytes（32 hex）；line／column 只導航、不入 ID。
- findings 依 `(path, astPath)` 排序，JSON key order 固定、LF、無 timestamp；Markdown 只由同一 manifest
  render，表格會跳脫 pipe／反引號／換行，長值以 `…` 截斷，完整資料保留在 JSON。

### 2.3 family 與 fix 判則

- 精準特例先判：API method extraction、repository injection、built-in static、callback default、
  `sessionController` factory result、真正的 surface lifecycle。
- `sessionController` 的 factory 會跨一層 identifier initializer 追到 `create*Controller(...)`，因此七組不會
  落入 catch-all。
- surface lifecycle 只收 `content.unmount` 與
  `surfaceContent.isSurfaceRootLive/unmount`；`sheets/*.tsx` 的一般 props 改歸
  `react-callback-contract`，不以路徑粗略把全部 61 筆混成 lifecycle。
- 其餘依 app／sheets React contract、page context action、controller callback port、listener／timer／
  promise／option bag、method reference 分類。
- `reads-this` → `behavior-batch`；無法解析 → `needs-review`；外部 node_modules declaration →
  `needs-review`；source MethodSignature／PropertySignature／CallSignature →
  `function-property-contract`；具 body 且不讀 `this` → `this-void-declaration`。

## 3. 硬 gate 與 canonical checksum

成功輸出逐字：

```text
eslint unbound manifest generated: 246 findings/28 files; sessionController 63; duplicates 0; unresolved declarations 0; sha256:bab42fb9f181522efb46d889e1e6db710262d503378edbdb2831a43b2828a959
```

五個硬 gate：

| Gate | 實測 |
| --- | ---: |
| findings | 246 |
| files | 28 |
| duplicate stableId | 0 |
| unresolved declarations | 0 |
| `src/sessionController.ts` findings | 63 |

補充統計：`unresolved this usage = 0`、`needs-review = 0`。246 筆皆由 TypeChecker 定位到 source
`MethodSignature`，所以 `thisUsage = ambient-no-body`、
`proposedFixClass = function-property-contract` 各 246；這代表 declaration 本身沒有 body，不等於機器曾
樂觀宣稱 concrete implementation 不讀 `this`。高風險類的 implementation 另以 §6 人工核對。

## 4. Determinism 與 `--check` 三拍

兩次完整生成後的檔案 SHA-256 完全相同：

| 產物 | 第一次 | 第二次 |
| --- | --- | --- |
| JSON | `102f7effbd0bc0b7d4d8dc4e2512fa1efb83b4c3bfab1aac03fb91cabc65c38b` | `102f7effbd0bc0b7d4d8dc4e2512fa1efb83b4c3bfab1aac03fb91cabc65c38b` |
| Markdown | `0b51127abd79a0d971fcf55c96ef6d85b812a37f253c684e3677c58e3d557be1` | `0b51127abd79a0d971fcf55c96ef6d85b812a37f253c684e3677c58e3d557be1` |

兩份輸出 header 內的 canonical findings checksum 都是：

```text
sha256:bab42fb9f181522efb46d889e1e6db710262d503378edbdb2831a43b2828a959
```

drift canary 三拍：

1. 將 Markdown 第一行由 `# Phase E unbound-method manifest` 暫改成多一個 `!`（一 byte）。
2. `node scripts/generate-eslint-unbound-manifest.mjs --check` → exit 1：

   ```text
   eslint unbound manifest check failed:
   - docs/arch-eslint-phaseE-unbound-manifest.md has drifted
   ```

3. 還原該 byte，重跑 → exit 0：

   ```text
   eslint unbound manifest check passed: 246 findings/28 files; sessionController 63; duplicates 0; unresolved declarations 0; sha256:bab42fb9f181522efb46d889e1e6db710262d503378edbdb2831a43b2828a959
   ```

## 5. Family 統計

| Family | 筆數 | proposedFixClass 分布 |
| --- | ---: | --- |
| `api-method-extraction` | 2 | `function-property-contract: 2` |
| `callback-default` | 2 | `function-property-contract: 2` |
| `context-hook-action` | 15 | `function-property-contract: 15` |
| `controller-callback-port` | 79 | `function-property-contract: 79` |
| `controller-factory-result:createAuthController` | 3 | `function-property-contract: 3` |
| `controller-factory-result:createChatController` | 1 | `function-property-contract: 1` |
| `controller-factory-result:createDiscoveryMapController` | 13 | `function-property-contract: 13` |
| `controller-factory-result:createIntentController` | 12 | `function-property-contract: 12` |
| `controller-factory-result:createLifecycleActionsController` | 11 | `function-property-contract: 11` |
| `controller-factory-result:createMySessionsController` | 15 | `function-property-contract: 15` |
| `controller-factory-result:createPlayerDirectoryController` | 8 | `function-property-contract: 8` |
| `injected-repository-callback` | 1 | `function-property-contract: 1` |
| `method-reference` | 1 | `function-property-contract: 1` |
| `react-callback-contract` | 64 | `function-property-contract: 64` |
| `surface-lifecycle` | 19 | `function-property-contract: 19` |
| **總計** | **246** | **`function-property-contract: 246`** |

`built-in-static-callback` 判則存在但本次實際 finding 為 0；原因與開單代表行落差見 §8。

## 6. `sessionController` 七家族對照與 12 筆人工核對

### 6.1 七家族全量對照

| consumer 範圍 | family | 初判／實測 | 結果 |
| --- | --- | ---: | --- |
| `314-328` | `createMySessionsController` | 15 / 15 | 一致 |
| `353-360` | `createPlayerDirectoryController` | 8 / 8 | 一致；alias 保留 |
| `379-391` | `createDiscoveryMapController` | 13 / 13 | 一致；alias 保留 |
| `424-435` | `createIntentController` | 12 / 12 | 一致；alias 保留 |
| `455-465` | `createLifecycleActionsController` | 11 / 11 | 一致 |
| `468` | `createAuthController` | 3 / 3 | 一致；同列三筆 stable ID 唯一 |
| `613` | `createChatController` | 1 / 1 | 一致 |
| **總計** |  | **63 / 63** | **無不一致筆** |

七個實作檔的字面自證：

```text
$ rg -n "\bthis\b" src/controller/{mySessionsController,playerDirectoryController,discoveryMapController,intentController,lifecycleActionsController,authController,chatController}.ts
(no output)
```

### 6.2 十二筆防偽抽樣

共同判讀：以下 TypeChecker declaration 均為列出的 source `MethodSignature`，沒有 body，因此機器
`thisUsage = ambient-no-body` 正確；人工欄另追 concrete implementation，避免把「interface 無 body」誤寫成
「implementation 已由機器證明無 this」。receiverType、declaration、thisUsage、family 四項均核對通過。

| # | stableId／finding | receiver／declaration 原文 | 實作防偽原文與人工判定 |
| ---: | --- | --- | --- |
| 1 | `7070bcce055e4ba65a309b97a384bf6f`<br>`sessionController.ts:314 actionFor` | `MySessionsController`；`src/controller/mySessionsController.ts`：`actionFor(session: SessionSummary): ControllerSessionAction;` | `function actionFor(...)`，return object 為 shorthand `actionFor`；無 `this`；`createMySessionsController` family 正確。 |
| 2 | `5b17e82aca25514a7935291ae34eda39`<br>`sessionController.ts:355 getPlayerGroups: playerGroups` | `PlayerDirectoryController`；`getPlayerGroups(): ControllerPlayerGroup[];` | `function playerGroups()`，return 為 `getPlayerGroups: playerGroups`；alias fingerprint 與 family 正確、無 `this`。 |
| 3 | `7fd5382e5ac09e4bbef26951d4026bf2`<br>`sessionController.ts:381 getVisibleSessions: visibleSessions` | `DiscoveryMapController`；`getVisibleSessions(): SessionSummary[];` | `function visibleSessions()`，return 為 `getVisibleSessions: visibleSessions`；alias 與 family 正確、無 `this`。 |
| 4 | `dd0103e607dd5cd49375c7639f746a3a`<br>`sessionController.ts:424 capturePendingIntentVersion` | `IntentController`；`capturePendingIntentVersion(): number;` | return 原文 `capturePendingIntentVersion: () => intentVersion`；closure 無 receiver、family 正確。 |
| 5 | `10d5f36331028b3b71ba1179fc5bfa20`<br>`sessionController.ts:455 cancelMySession` | `LifecycleActionsController`；`cancelMySession(sessionId: ControllerIdentifier): Promise<unknown>;` | `async function cancelMySession(...)` 後以 shorthand 回傳；無 `this`、family 正確。 |
| 6 | `cbe8f0200281fdf0b14c8dd95b7cb553`<br>`sessionController.ts:468 setAuthSession` | `createAuthController` anonymous return type；`setAuthSession(session: ControllerAuthSession \| null): void;` | `function setAuthSession(...)`，return 原文 `{ setAuthSession, setAuthState, setProfile }`；同列三筆靠 structural index 分開、無 `this`。 |
| 7 | `b5443c26d5d8f44f05321a8a506272f8`<br>`sessionController.ts:613 openSessionChat` | `createChatController` anonymous return type；`openSessionChat(sessionId: ControllerIdentifier): ControllerSurfaceHandle \| null \| undefined;` | `function openSessionChat(...)`，return 原文 `{ openSessionChat }`；無 `this`、family 正確。 |
| 8 | `935b4a871e023b6e95762ff458fe80a2`<br>`lifecycleActionsController.ts:230 api.acceptSessionParticipant` | `LifecycleDataApi`；`acceptSessionParticipant?(sessionId: ControllerIdentifier, participantId: ControllerIdentifier): Promise<unknown>;` | 擷取原文 `decision === "accepted" ? api.acceptSessionParticipant : api.declineSessionParticipant`。construction path 的 `bindPrivateMethod` 回傳 arrow，private repository 是具名 async closure；目前不讀 `this`，但因 port 可替換，維持高風險獨立小批。 |
| 9 | `7b8644385cfb62eaa602651f632ea263`<br>`privateDataRepository.ts:130 loadCourts` | `parameter-pattern:PrivateDataRepositoryOptions`；`loadCourts(city?: string): Promise<DataCourt[]>;` | 唯一 production construction site 在 `createDataApi`，傳入同 scope 的 `async function loadCourts(...)`；目前無 `this`。injection contract 可替換，故中風險 family 正確。 |
| 10 | `de0fd8fa7e2a7ba061b2eeea15e7e72b`<br>`sheets.ts:185 content.unmount` | `LoginModalContentHandle`；`src/surfaceContracts.ts`：`unmount(): void;` | `mountLoginModalContentInApp` 直接回傳 `mountSurfaceContent(...)`；其 `unmount()` body 只讀 closure locals，無 `this`。surface lifecycle 正確。 |
| 11 | `8d1b89c1171adab8bbac1aef20fd70db`<br>`CreateSessionSheet.tsx:821 surfaceContent.unmount` | `SurfaceContentHandle`；`src/app/SurfaceHost.tsx`：`unmount(): void;` | `mountSurfaceContent` 的 return object `unmount() { ... }` 只讀 `isLive/id/rootElement/slots` closure，無 `this`；surface lifecycle 正確。 |
| 12 | `20cd603ceabcae4d0887599015c26831`<br>`map.ts:470 onSession = () => {}` | `default-empty-object:SessionPinHandlers`；`onSession?(sessionId: SessionSummary["sessionId"]): void;` | default 原文為 arrow `onSession = () => {}`；receiver sentinel、callback-default family 與 false-positive 判定正確。 |

## 7. `needs-review` 清單

空清單（0）。這不是把風險消失：API extraction 2 與 repository injection 1 已保留獨立 family，人工核對
目前 construction path 都是 closure；後續仍應單獨修、單獨驗證。若未來 declaration 解析不到、讀到
`this` 或落在 node_modules，generator 會分別輸出 `unresolved`／`behavior-batch`／`needs-review`，而不是
硬塞進零 runtime 類。

## 8. 開單疑義：`Array.isArray` 代表行並非現行 finding

母計畫 §3 列 `privateDataRepository.ts:135 Array.isArray` 為 built-in/static callback 代表，但同一 lockfile
直接以 ESLint Node API 掃該檔，實際只回：

```text
@typescript-eslint/unbound-method unboundWithoutThisAnnotation 130 3 130 13
```

亦即該檔只有 `loadCourts`，`Array.isArray` 沒有 finding；全庫總量仍精準為 246／28。沒有為湊分類數字
自行製造一筆。generator 保留 built-in/static 判則，以免規則版本或型別宣告日後改變；本批 family 統計
如實為 0。派工允許 false-positive 對照用 `map.ts:470`，故第 12 筆採該點。

## 9. 收尾矩陣

| Gate | 結果 |
| --- | --- |
| frozen status：`git status --porcelain -- src tests eslint.config.js tsconfig.json package.json package-lock.json` | 空，exit 0 |
| 全庫 status | 僅本批 3 個新檔＋本回報，共 4 個 untracked |
| generator ×2 | 兩次成功；JSON／Markdown SHA 各自 byte-identical |
| `--check` canary | 改一 byte exit 1；還原 exit 0 |
| `npm run lint` | exit 0 |
| `npm run prettier:check` | `All matched files use Prettier code style!`，exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run test:session-unit` | `tests 346 / pass 346 / fail 0 / skipped 0`，exit 0 |
| `npm run test:mock` | unit 前置 346 通過；Playwright `298 passed / 4 skipped`，exit 0 |
| `npm run build` | 508 modules transformed，exit 0 |
| `npm run check:production-bundle` | exit 0；main `638937/187466`，total JS `841561/257627` |
| bundle 基準差 | main gzip `187466 - 187466 = 0 B`；total gzip `257627 - 257627 = 0 B` |
| `npm run test:local` | 依派工豁免；前提 frozen status 空已成立 |
| `git diff --check` | 無輸出，exit 0 |

unit 執行期間出現既有非致命 `WebSocket server error: Port 24678 is already in use`；最終
346/346 與 exit 0 不受影響，未 retry。build 的既有 chunk-size warning 也未造成失敗。

## 10. Codex 五問

### 1. 如何證明 manifest 完整且可重生？

ESLint 使用固定 scan globs 與當前 lockfile，script 對 246、28、63、duplicate 0、declaration unresolved 0
全部 fail closed；schema 每欄逐筆驗證。兩次輸出的檔案 SHA 相同，canonical findings checksum 相同，
`--check` 又經真實一-byte drift 紅綠三拍，因此不是手工整理或只看行號的快照。

### 2. 如何證明分類沒有把「無 body」冒充「不讀 this」？

246 筆 declaration 都是 source MethodSignature，所以機器一律寫 `ambient-no-body`，不寫 `none`；
`proposedFixClass` 是「改 contract 為 function property」的候選，不是 implementation 行為宣告。七家族與
五個跨族樣本另追具體 return/construction site；API、repository、surface 即使目前實作無 `this`，仍保留各自
風險 family，沒有併入一般 false-positive。

### 3. 如何證明 stable ID 不靠脆弱行號且不碰撞？

ID 不含 line／column，包含 rule、POSIX path、真 AST sibling path、保留 alias/default 的 expression、
declaration structural fingerprint。特別核對 `sessionController.ts:468` 同列三筆均唯一；全庫 duplicate
為 0。開發中曾發現 `getChildren()` 的 `SyntaxList` wrapper 會破壞 parent sibling index，因此成品改用
`forEachChild()` 並在找不到 index 時直接失敗。

### 4. 如何證明本批沒有改 runtime 或越過凍結面？

`src/**`、tests、ESLint／TS／package 與 lockfile status 全空；新增內容只有 script/docs。typecheck、lint、
Prettier、346 unit、298 mock 與 build 全綠；production main 與 total gzip 都和基準完全相同。沒有恢復
`unbound-method`、沒有改 override、沒有新增 dependency，也沒有 commit/push。

### 5. 基於實際統計，Phase E 如何切批；第一批怎麼開？

建議依 manifest stable ID 凍結每批，再按下列順序處理；括號是本 manifest finding 數，不代表 declaration
修改行數：

1. callback defaults（2）先做最小模板批。
2. controller callback ports（79），按 consumer 檔再切 `4/6/11/11/12/13/22`，每批只改 contract。
3. controller factory results（63），依七家族 `15/8/13/12/11/3/1` 分批。
4. React/context contracts（64 + 15），再切 app 22、sheets props 42、pages 15；避免跨 React dependency／
   memo 邊界一次全改。
5. lone method reference（1）與 surface lifecycle（19）；surface 依共用 `SurfaceContentLifecycle` contract
   先驗實作再擴到 9 組 handle。
6. repository injection（1）與 API extraction（2）最後獨立高風險批。

上述 246 筆目前都可先走 function-property contract 的 zero-runtime-token 候選；現有抽樣沒有已知必須
wrapper／bind 的 behavior candidate。但每批仍要做 erased-token 全等，任何 concrete implementation 新發現
讀 `this` 就立即移入 behavior batch，不以型別改寫硬過。

第一個修復小批建議只開 `map.ts:470` 兩筆：將 `SessionPinHandlers.onSession/onCluster` method signature 改為
function property，保持既有 destructure 與 default arrows 原文不動；用 stable ID 精準凍結 2→0、只對
`map.ts` 開規則、做 erased-token byte equality、map/session unit 與 mock pin journey，最後才評估是否把同一
模式推到其他 contract。這批最小、零 identity 變化，也能先驗證後續所有 type-only 批共用的驗收模板。

## 11. 未做／疑義／BLOCKED

- 未做：任何 finding 修復、規則恢復、source/test/config/package 修改、local Supabase 矩陣、commit、push。
- 疑義：`Array.isArray` 開單代表行不是現行 rule finding，已在 §8 以直接 Node API 證據揭露；不影響 246／28
  硬 gate與本批完成。
- BLOCKED：無。
