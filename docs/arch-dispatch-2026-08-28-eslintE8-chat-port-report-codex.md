# ESLint 恢復 Phase E-8：chat controller ports 11 筆回報（Codex）

- 日期：2026-08-28
- 開工 HEAD：`21da05d`；開工基準：`a795d10`（E-7 ACCEPTED）
- 開工狀態：`git status --porcelain` 無輸出。
- 結論：完成；交件維持 generator 紅簽章，不改 ledger、不重生 manifest、不 commit、不 push。
- BLOCKED：無。

## 1. Scope、body destructure、construction 與 frozen mine 重驗

開工 generator 成功行逐字：

```text
eslint unbound manifest check passed: 209 findings/23 files; sessionController 63; duplicates 0; unresolved declarations 0; sha256:000d8adbbb9c763877ea00de58505a65ca4ab65b92aecb11323036a9f85dba33
```

HEAD manifest 對 `src/controller/chatController.ts` 恰 11 筆，全部 owner 為
`factory:createChatController`、invocation style 為 `destructured-function`：

```text
e700dadac9062df874386df1a1eb2bc7 81:5 toast
d79fd5ad5211ca65be7b00a4daf62f24 82:5 transitionSurfaces
0bb560eeae89cf52c331fd23d606f51e 84:5 withdrawMySession
700002637db483e5d5cab91d567aca64 72:5 isCurrentAuthSnapshot
63a82b1a032be827ea0f3f1083178ddf 73:5 notifyMySessions
7e9f1007fe33058f35738036d82c1ab1 74:5 openChat
da1560bb7600a9b8512921a4b4bdf283 75:5 openReportForTarget
abb1fa02f2d369e6837b907aa1c225ba 76:5 readCourts
c4c01719deed2482bbcb76288ff49073 77:5 refreshMyPlayerBlocks
ee4c9bb35d8cfedb6ae4805024af2323 78:5 refreshMySessions
99a96b72c6cd05925bb962d0e5599f74 79:5 requireMySessionAction
```

`rg -n "createChatController" src tests` 只有 import、`Parameters`、`sessionController.ts:613`
direct call 與 factory declaration；construction site 唯一。`readCourts: () => read().courts` 是
唯一目標非 shorthand 傳入，全段零 diff。傳播面 `sessionController.ts:44/:51/:117/:159` 零 diff，
typecheck 全綠。

factory inline return type `openSessionChat` 原文未變；其 frozen finding 仍為：

```text
b5443c26d5d8f44f05321a8a506272f8 613:11 openSessionChat
```

因此沒有誤清 sessionController finding，總數維持 63。

## 2. 修改後 `:29-59` 逐字原文

```ts
interface ChatControllerDependencies {
  api: ChatDataApi;
  chatPollIntervalMs: number;
  isCurrentAuthSnapshot: (snapshot: ControllerAuthSnapshot) => boolean;
  notifyMySessions: () => void;
  openChat: (
    session: MySessionSummary,
    handlers: {
      canWithdraw: boolean;
      courts: unknown[];
      onBlock(profileId: ControllerIdentifier): Promise<true>;
      onClose(): void;
      onPost(body: unknown): Promise<unknown>;
      onReport(messageId: ControllerIdentifier): unknown;
      onWithdraw(): unknown;
    }
  ) => ControllerSurfaceHandle | null | undefined;
  openReportForTarget: (target: ReportTarget) => unknown;
  readCourts: () => unknown[];
  refreshMyPlayerBlocks: (snapshot: ControllerAuthSnapshot) => Promise<boolean>;
  refreshMySessions: () => Promise<boolean>;
  requireMySessionAction: (
    sessionId: ControllerIdentifier,
    predicate: (session: MySessionSummary | null | undefined) => boolean
  ) => { authSnapshot: ControllerAuthSnapshot; session: MySessionSummary };
  surfaceRegistry: SurfaceRegistry;
  toast: (message: string) => void;
  transitionSurfaces: (name: string) => void;
  visibilityTarget: Document | undefined;
  withdrawMySession: (sessionId: ControllerIdentifier) => unknown;
}
```

11 個目標只改 top-level 外層形狀；兩個多行 signatures 的參數與 handler object 原文不動。

selector 只在字典序位置新增：

```js
      "src/controller/authController.ts",
      "src/controller/chatController.ts",
      "src/controller/discoveryMapController.ts",
```

## 3. nested、餘檔 byteEqual 與 selector 精確度

TypeScript AST 對帳結果：

```text
OUTER_TARGETS method->function-property 11/11
HANDLER openChat nestedMethods=5 rawEqual=true tokenSha=5a43ee0bce30fb3a5143160c2a87f86db9c5a4c32f39a55066e9857ca088a20a
REQUIRE_PARAMS rawEqual=true tokenSha=702e4a898c285763ee179afdde9bb5753eb9e16d9ed2288550863d4cacfb6215
FROZEN_MEMBER api rawEqual=true
FROZEN_MEMBER chatPollIntervalMs rawEqual=true
FROZEN_MEMBER surfaceRegistry rawEqual=true
FROZEN_MEMBER visibilityTarget rawEqual=true
FROZEN_INTERFACE ChatDataApi rawEqual=true
FROZEN_INTERFACE ReportTarget rawEqual=true
```

所以 nested `onBlock/onClose/onPost/onReport/onWithdraw` 五筆及 `canWithdraw/courts` 逐 token
全等。按固定 31 行切掉 `ChatControllerDependencies` `:29-59` 後，其餘檔案對帳：

```text
REST HEAD bytes=9429 sha256=138a9c7aa7029f02fc1a363b97cded9e4b42910a4a9212f3f2073e89dc8bfeff
REST current bytes=9429 sha256=138a9c7aa7029f02fc1a363b97cded9e4b42910a4a9212f3f2073e89dc8bfeff
REST byteEqual=true
```

因此 factory signature/inline return、body destructure、全部實作與其餘 interfaces 都未變。

獨立執行 `npx eslint --print-config` 並解析規則：

```text
src/controller/chatController.ts @typescript-eslint/unbound-method=[2]
src/controller/lifecycleActionsController.ts @typescript-eslint/unbound-method=[0]
```

chat 精確上線，未清 lifecycleActions 仍 off，沒有 glob 外溢。

## 4. 規則有牙三拍

候選 source/selector 完成後第一次 `npm run lint` 無診斷、exit 0。候選 SHA：

```text
f3eee694a08ad1279616fc579afb8864b88be8f4734e63997a48bae7e1bd7e11  src/controller/chatController.ts
471b439d49204d3022cc61ec7d44548e89bb9c1274f235df499189bb2b77fbeb  eslint.config.js
```

保持 selector，只暫退 11 個 dependency declarations；`npm run lint` exit 1，紅點逐字：

```text
/Users/ian/tennisPartnerFinder/src/controller/chatController.ts
  72:5  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  73:5  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  74:5  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  75:5  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  76:5  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  77:5  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  78:5  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  79:5  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  81:5  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  82:5  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  84:5  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method

✖ 11 problems (11 errors, 0 warnings)
```

所有紅點皆在 body destructure，不在 declaration。精確 `apply_patch` 還原後 source SHA 回到
`f3eee694…7e11`，第二次 lint 無診斷、exit 0。

## 5. 逐 stableId 三點對點

| stableId | member／宣告點改動 | lint 點（body） | generator 點 |
| --- | --- | ---: | --- |
| `e700dadac9062df874386df1a1eb2bc7` | `toast(...)` → `toast: (...)` | 81 | 同 ID/path missing |
| `d79fd5ad5211ca65be7b00a4daf62f24` | `transitionSurfaces(...)` → `transitionSurfaces: (...)` | 82 | 同 ID/path missing |
| `0bb560eeae89cf52c331fd23d606f51e` | `withdrawMySession(...)` → `withdrawMySession: (...)` | 84 | 同 ID/path missing |
| `700002637db483e5d5cab91d567aca64` | `isCurrentAuthSnapshot(...)` → `isCurrentAuthSnapshot: (...)` | 72 | 同 ID/path missing |
| `63a82b1a032be827ea0f3f1083178ddf` | `notifyMySessions()` → `notifyMySessions: ()` | 73 | 同 ID/path missing |
| `7e9f1007fe33058f35738036d82c1ab1` | `openChat(`/`):` → `openChat: (`/`) =>` | 74 | 同 ID/path missing |
| `da1560bb7600a9b8512921a4b4bdf283` | `openReportForTarget(...)` → `openReportForTarget: (...)` | 75 | 同 ID/path missing |
| `abb1fa02f2d369e6837b907aa1c225ba` | `readCourts()` → `readCourts: ()` | 76 | 同 ID/path missing |
| `c4c01719deed2482bbcb76288ff49073` | `refreshMyPlayerBlocks(...)` → `refreshMyPlayerBlocks: (...)` | 77 | 同 ID/path missing |
| `ee4c9bb35d8cfedb6ae4805024af2323` | `refreshMySessions()` → `refreshMySessions: ()` | 78 | 同 ID/path missing |
| `99a96b72c6cd05925bb962d0e5599f74` | `requireMySessionAction(`/`):` → `requireMySessionAction: (`/`) =>` | 79 | 同 ID/path missing |

11 列均同時通過宣告點、不同位置的 body lint 點與 generator 點。

## 6. generator 紅簽章（交件狀態）

`node scripts/generate-eslint-unbound-manifest.mjs --check` exit 1；排除 stack，恰 13 條 `- `：

```text
Error: manifest hard gate failed:
- expected finding missing from current scan: e700dadac9062df874386df1a1eb2bc7 (src/controller/chatController.ts)
- expected finding missing from current scan: d79fd5ad5211ca65be7b00a4daf62f24 (src/controller/chatController.ts)
- expected finding missing from current scan: 0bb560eeae89cf52c331fd23d606f51e (src/controller/chatController.ts)
- expected finding missing from current scan: 700002637db483e5d5cab91d567aca64 (src/controller/chatController.ts)
- expected finding missing from current scan: 63a82b1a032be827ea0f3f1083178ddf (src/controller/chatController.ts)
- expected finding missing from current scan: 7e9f1007fe33058f35738036d82c1ab1 (src/controller/chatController.ts)
- expected finding missing from current scan: da1560bb7600a9b8512921a4b4bdf283 (src/controller/chatController.ts)
- expected finding missing from current scan: abb1fa02f2d369e6837b907aa1c225ba (src/controller/chatController.ts)
- expected finding missing from current scan: c4c01719deed2482bbcb76288ff49073 (src/controller/chatController.ts)
- expected finding missing from current scan: ee4c9bb35d8cfedb6ae4805024af2323 (src/controller/chatController.ts)
- expected finding missing from current scan: 99a96b72c6cd05925bb962d0e5599f74 (src/controller/chatController.ts)
- findings expected 209, received 198
- files expected 23, received 22
```

沒有 sessionController、unexpected 或 scope-gate 額外條目；frozen manifest 未被寫入。

## 7. erased-token 與 frozen SHA

同一 `esbuild.transform` 記憶體流程，loader `ts`、format `esm`、target `esnext`、
`minifyWhitespace: true`、`treeShaking: false`：

```text
HEAD bytes=6273 sha256=48de8b43aa1db6c1670777efa7d4146ac5c9164cdceabf433add4455a346364e
current bytes=6273 sha256=48de8b43aa1db6c1670777efa7d4146ac5c9164cdceabf433add4455a346364e
byteEqual=true
```

generator、baseline、ledger、manifest 均保持 HEAD SHA：

```text
ce6808be54a596f0c4d0d92b2a23bda170764d6d623ba1b0e20e1dac500852ae  scripts/generate-eslint-unbound-manifest.mjs
14e56a1675ccf4939f2e0bc3e2685070b325a32a75ef778ea1ffa45b018fd207  docs/arch-eslint-phaseE-baseline.json
34ed7459fef2301bab01fbe679f3583db2bbb08c3aad13c6b521596746829562  docs/arch-eslint-phaseE-removal-ledger.json
41df4433f27452f610af10e0a20ef2585b1d7b2522f576906fd7772abacf8a1e  docs/arch-eslint-phaseE-unbound-manifest.json
92dd83743e18dde745ddbcd587d8cce310659549d2933f525a82bd25888c5a56  docs/arch-eslint-phaseE-unbound-manifest.md
```

## 8. 收尾矩陣

| Gate | 實跑結果 |
| --- | --- |
| `npm run typecheck` | exit 0（獨立一次，mock/local pretest 各再一次） |
| `npm run lint` | 候選兩次無診斷、exit 0；canary 恰 11 errors |
| `npm run prettier:check` | `All matched files use Prettier code style!`；exit 0 |
| `npm run test:session-unit` | tests 346；pass 346；fail 0；exit 0 |
| `npm run test:mock` | 298 passed；4 skipped；exit 0 |
| `npm run test:local` API | tests 2；pass 2；fail 0 |
| `npm run test:local` browser | 45 passed；11 skipped；exit 0 |
| `npm run build` | 508 modules transformed；exit 0 |
| `npm run check:production-bundle` | main `638937/187466`；total JS `841561/257627`；exit 0 |
| bundle 對照 | main gzip `187466 − 187466 = 0 B`；total gzip `257627 − 257627 = 0 B` |
| `--print-config` | chat `[2]`；lifecycleActions `[0]` |
| generator 交件 | 預期 exit 1；恰 13 條紅簽章 |
| 餘檔 byteEqual | HEAD/current 9,429 bytes、SHA 相同、true |
| erased-token | HEAD/current 6,273 bytes、SHA 相同、true |
| `git diff --check` | 無輸出、exit 0 |

`test:local` 首跑即綠，未執行 DB count/reset。unit 出現既有、非致命的
`WebSocket server error: Port 24678 is already in use`，最終 exit 0。build 只有既有 chunk warning。

production bundle 成功行逐字：

```text
production bundle check passed: development E2E hook present, production E2E hook absent; 32 files, 12 demo identifiers absent; main 638937/187466 within 658867/192420; largest app lazy MySessionsPage-Byp_C9FO.js 16476/4828 within 18000/5500; total JS 841561/257627 within 849961/259062; private repository: privateDataRepository-CfJqlfj0.js; Sentry: sentryBrowserSdk-Czz5dmkg.js
```

tracked diff stat（回報落盤前）：

```text
 eslint.config.js                 |  1 +
 src/controller/chatController.ts | 26 +++++++++++++-------------
 2 files changed, 14 insertions(+), 13 deletions(-)
```

最終 frozen diff（其餘 `src/**`，含 `sessionController.ts`、tests、scripts、baseline、ledger、
manifest、package/lockfile、tsconfig）無輸出、exit 0。全庫 porcelain 恰三條，逐字：

```text
 M eslint.config.js
 M src/controller/chatController.ts
?? docs/arch-dispatch-2026-08-28-eslintE8-chat-port-report-codex.md
```

## 9. Codex 五問

### 1. 如何證明 findings 在 body destructure，而非 declaration？

manifest 11 筆 invocation style 都是 `destructured-function`；canary 實際只紅
`72/73/74/75/76/77/78/79/81/82/84`，正是 `const {...} = dependencies` 的 member lines。
逐 stableId 表分別記錄 declaration 改動與 body lint 點，沒有混用行號。

### 2. 如何證明 nested handlers、factory 與 runtime 沒變？

`openChat.handlers` rawEqual 且五個 nested methods token SHA 固定；切除 dependencies 後餘檔
9,429 bytes 逐 byte相等，涵蓋 factory/body/implementation；`sessionController.ts` 零 diff。
erased output 6,273 bytes逐 byte相等，construction forwarding arrow原文不動。

### 3. 如何證明 selector 沒有提前上線其他 controller？

config diff 只加 chat 精確 path。真 `npx eslint --print-config` 顯示 chat rule `[2]`，仍有 13 筆
的 lifecycleActions 顯示 `[0]`；沒有 glob。generator/scan/baseline/ledger/manifest 全未改。

### 4. 為何 generator 紅是正確交件？

current 強掃為 198/22/63，但 ledger/manifest 停在 E-7 ACCEPTED 的 209/23/63；13 條紅簽章
表示 11 個候選未被驗收記帳。驗收方建立 E-8 acceptance、追加 ledger 並重生後才應轉綠。

### 5. lifecycle ports 11 批在不加 selector下如何設計驗收？

唯讀重驗 `lifecycleActionsController.ts` 現況共 13 findings：前兩筆是非 ports extraction，
其餘 11 筆是本批候選 ports：

```text
935b4a871e023b6e95762ff458fe80a2 230:49 api.acceptSessionParticipant api-method-extraction
a3efe94c1bb08d148764c4f2c3783ce7 230:80 api.declineSessionParticipant api-method-extraction
4500e4510b7a7d554218f8eedbd80850 108:3 beginLifecycleAction controller-callback-port
8fe7fe129236a63dbd4b6396d64095e5 119:3 toast controller-callback-port
9ef772e2211454c055d7dfb76970d334 120:3 transitionSurfaces controller-callback-port
7f9eafaf86f052e1ea15e32b5e395eb1 109:3 captureAuthSnapshot controller-callback-port
d9244d7a6c863395e13063a98c0006a1 110:3 finishLifecycleAction controller-callback-port
f70ddcdff97a9c195874e28a5caffb70 111:3 isCurrentAuthSnapshot controller-callback-port
65091efc930269d3532efef4dd2c1ee8 112:3 openDecideSession controller-callback-port
2fd1b37c0f88d35da7e88cbe478f783c 113:3 openEditSession controller-callback-port
987535f9fa42320940cfbad9cf7df3af 114:3 openWithdrawConfirmation controller-callback-port
d8c2f57104bc8e4f92a22ce394cb2273 115:3 refreshAuthoritativeState controller-callback-port
3388ea60fb76122bbe9aff704854a09c 116:3 sessionKey controller-callback-port
```

ports 11 修完後同檔仍有 extraction 2，故該批**不得修改 selector**；committed `npm run lint`
預期保持綠，但不能拿來證明 ports 有牙。應使用固定 ad-hoc command：

```sh
npx eslint --rule '{"@typescript-eslint/unbound-method":"error"}' src/controller/lifecycleActionsController.ts
```

本次唯讀 read-back 已驗證現況恰 13 errors：ports 在
`108/109/110/111/112/113/114/115/116/119/120`，extractions 固定在同一行
`230:49/230:80`。下一批三拍應改寫為：

1. 先完成 ports 11、**不改 config**；committed `npm run lint` 綠，`--print-config` 仍 `[0]`。
2. 候選上跑 ad-hoc override，必須只剩 `230:49/80` 兩 errors；暫退 11 個 declarations 後，
   同命令恰回到 13 errors；精確還原 candidate SHA 後再只剩 2。以 `13−2=11` 證明 ports 有牙。
3. generator 紅簽章只 missing 11 個 port stableIds，加
   `findings expected 198, received 187`；file 仍存在兩筆，所以**不得**出現 files count 差異，
   也不得有兩個 extraction missing。E-8 ACCEPTED 後的 ports acceptance 應重生為 187/22/63，
   仍不加 selector；待 extraction 2 另批清零時才把 lifecycleActions 精確 path 上線。

多行 target signatures 固定為 `beginLifecycleAction:58-62` 與 `openDecideSession:66-69`，只改
外層。inline nested `openWithdrawConfirmation.handlers.onConfirm:71` 必須凍結；此外
`DecideHandlers.onClose/onDecide:45-46`、`EditHandlers.onClose/onSubmit:52-53` 及所有
`LifecycleDataApi` optional methods 都是非 manifest ports，不得順手改。

construction site 唯一為 `sessionController.ts:438`，`api: api!` 原文保留，其餘 11 目標傳入
均 shorthand；`Parameters`/data-port/indexed-access 傳播與 exported controller factory-result
signatures 全部凍結。建議下一派工單同樣附逐 stableId 宣告點、ad-hoc red-point、generator 點三表。

## 10. 未做／疑義／BLOCKED

- 未做：E-8 ledger 11 筆、manifest 重生／`--check` 綠、驗收紀錄、lifecycle ports/extractions、
  其他 controller ports、factory results、任何 tests/source 擴改、commit、push；前三項依派工由
  驗收方 ACCEPTED 時原子完成。
- 建議：lifecycle ports 採 §9.5 的 2→13→2 ad-hoc canary，且不改 selector；這能同時證明
  ports 清零與 extraction 2 仍被保留。
- 疑義：無。
- BLOCKED：無。
