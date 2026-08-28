# ESLint 恢復 Phase E-5：discoveryMap controller ports 6 筆回報（Codex）

- 日期：2026-08-28
- 開工 HEAD：`9472b95`；開工基準 parent：`48dd6c6`（E-4 ACCEPTED）
- 開工狀態：`git status --porcelain` 無輸出。
- 結論：完成；交件維持 generator 紅簽章，不改 ledger、不重生 manifest、不 commit、不 push。
- BLOCKED：無。

## 1. Scope 與 construction site 重驗

開工時 generator 正常成功行逐字：

```text
eslint unbound manifest check passed: 240 findings/26 files; sessionController 63; duplicates 0; unresolved declarations 0; sha256:ee6ee497bf88745d8f3b20e8a96f6aa8ea93fb1afec719899c95e6ae92da100f
```

HEAD manifest 對 `src/controller/discoveryMapController.ts` 的實際篩選結果：

```text
count=6
1ed8b19ddfae0cdc2ecf7234a2069d51 96:3 getPlayerGroups factory:createDiscoveryMapController
545214c04e96dec6589b97408d383638 97:3 loadPlayers factory:createDiscoveryMapController
1b8f9d6f4ff0613167cf9610203242ee 99:3 reconcileActiveDetail factory:createDiscoveryMapController
4ef06f27267ec8414004d40a450e2bcb 100:3 render factory:createDiscoveryMapController
68f6f0bc444c826ad20bd5d2bb8a505c 101:3 renderPins factory:createDiscoveryMapController
34af30da673a2ea64bbfff5a73fb2e16 102:3 renderPlayers factory:createDiscoveryMapController
```

`rg -n "createDiscoveryMapController" src tests` 只有：

```text
src/sessionController.ts:22:import { createDiscoveryMapController } from "./controller/discoveryMapController.ts";
src/sessionController.ts:45:type DiscoveryMapControllerOptions = Parameters<typeof createDiscoveryMapController>[0];
src/sessionController.ts:363:  const discoveryMapController = createDiscoveryMapController({
src/controller/discoveryMapController.ts:92:export function createDiscoveryMapController({
```

因此 direct construction site 唯一為 `sessionController.ts:363`；`:22` 是 import、`:45`
是型別推導、controller 檔是 declaration。construction object 的 `api: api!` 與
`getPlayerGroups: playerGroups` 為非 shorthand，其餘傳入為 shorthand；全段零 diff。
public options 的 `mapTools`、`render`、`renderPins`、`renderPlayers` indexed access 及 data-port
`api` intersection 也全部零 diff。

## 2. 修改後 `:59-73` 逐字原文

```ts
interface DiscoveryMapDependencies {
  api: DiscoveryDataApi;
  discoveryGate: ControllerRequestGate;
  discoveryPollIntervalMs?: number;
  getPlayerGroups: () => ControllerPlayerGroup[];
  loadPlayers: (bounds: MapBounds) => Promise<boolean>;
  mapTools?: MapTools;
  reconcileActiveDetail: (bounds: MapBounds) => void;
  render: (view: ControllerMapViewPayload) => void;
  renderPins: (sessions: SessionSummary[]) => void;
  renderPlayers: (view: ControllerPlayerLayerViewState) => void;
  store: Store<SessionControllerState, ControllerEventName>;
  surfaceRegistry: SurfaceRegistry;
  visibilityTarget?: Document;
}
```

六行均在原位修改；`mapTools?: MapTools;` 仍夾在 `loadPlayers` 與
`reconcileActiveDetail` 之間。成員順序、參數名、回傳型別與其餘 property signatures 一字不動。
同檔 `DiscoveryDataApi`、`MapTools`、`DiscoveryMapController` 三個 interface 全部零 diff。

ESLint scoped selector 修改後原文：

```js
files: ["src/controller/discoveryMapController.ts", "src/controller/mySessionsController.ts", "src/map.ts"],
```

使用三個精確路徑、保持字典序，沒有 glob；Prettier 保持 112 字元單行。

## 3. 規則有牙三拍

候選 source 與 selector 完成後，第一次 `npm run lint` 無診斷、exit 0。候選 SHA：

```text
4ede580f7bb3d15c653b59c2a0f1965e0f4a09897b514fcf1cf0370da2888a31  src/controller/discoveryMapController.ts
35b7f78f04db3bd45e3d22db931e9de457be7dca7d842fbc2b3d2bf81559cbe5  eslint.config.js
```

保持 selector 上線，只暫退六行為 method signatures；`npm run lint` exit 1，實際紅點逐字：

```text
/Users/ian/tennisPartnerFinder/src/controller/discoveryMapController.ts
   96:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. 
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
   97:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. 
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
   99:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. 
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  100:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. 
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  101:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. 
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  102:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. 
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method

✖ 6 problems (6 errors, 0 warnings)
```

紅點恰為 factory destructure 的 `96/97/99/100/101/102`，不是 declaration 行；沒有第七筆。
精確反向 patch 後 source SHA 回到 `4ede580f…8a31`，第二次 `npm run lint` 無診斷、exit 0。

## 4. generator 紅簽章（交件狀態）

獨立執行 `node scripts/generate-eslint-unbound-manifest.mjs`，exit 1。排除標頭與 stack，
錯誤恰八條、順序逐字：

```text
Error: manifest hard gate failed:
- expected finding missing from current scan: 1ed8b19ddfae0cdc2ecf7234a2069d51 (src/controller/discoveryMapController.ts)
- expected finding missing from current scan: 545214c04e96dec6589b97408d383638 (src/controller/discoveryMapController.ts)
- expected finding missing from current scan: 1b8f9d6f4ff0613167cf9610203242ee (src/controller/discoveryMapController.ts)
- expected finding missing from current scan: 4ef06f27267ec8414004d40a450e2bcb (src/controller/discoveryMapController.ts)
- expected finding missing from current scan: 68f6f0bc444c826ad20bd5d2bb8a505c (src/controller/discoveryMapController.ts)
- expected finding missing from current scan: 34af30da673a2ea64bbfff5a73fb2e16 (src/controller/discoveryMapController.ts)
- findings expected 240, received 234
- files expected 26, received 25
```

沒有 unexpected、sessionController 或 scope-gate 錯誤。generator 在 write 前 throw，frozen
manifest 維持 HEAD bytes。

## 5. 常設判準三證

1. 真 config lint canary 恰紅六筆：見 §3，免疫把 scan 排除掉的假修復。
2. `eslint.config.js` diff 恰一處：只在 scoped files array 加一個精確 path；
   `git diff -- scripts` 無輸出，generator 與 `SCAN_GLOBS` 零 diff。
3. erased-token 全等：見 §6，證明不是以 runtime wrapper／bind／新 arrow 消除 findings。

generator 與 frozen manifest SHA：

```text
ce6808be54a596f0c4d0d92b2a23bda170764d6d623ba1b0e20e1dac500852ae  scripts/generate-eslint-unbound-manifest.mjs
774322448aad652030935d164749da6a00ef89fdf753f240640139cc556f89d4  docs/arch-eslint-phaseE-unbound-manifest.json
e88dbd71d38b5a7ee6f30cf915d25433b37171734bf97f08a331c00b5de02869  docs/arch-eslint-phaseE-unbound-manifest.md
```

## 6. erased-token 對帳

以同一個 `esbuild.transform` 在記憶體處理 `git show HEAD:...` 與 working source；兩側參數為
loader `ts`、format `esm`、target `esnext`、`minifyWhitespace: true`、
`treeShaking: false`。

```text
HEAD bytes=5990 sha256=25b91d955dd12250dbdc4638d9ef5642bfad89dce116828993c16c9a1653dc4e
current bytes=5990 sha256=25b91d955dd12250dbdc4638d9ef5642bfad89dce116828993c16c9a1653dc4e
byteEqual=true
```

因此 source 修改為零 runtime token；沒有新增 `any`、`@ts-ignore`、inline disable、wrapper、
`.bind()` 或 arrow。

## 7. 收尾矩陣

| Gate | 實跑結果 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 候選兩次無診斷、exit 0；暫退 canary 恰 6 errors |
| `npm run prettier:check` | `All matched files use Prettier code style!`；exit 0 |
| `npm run test:session-unit` | tests 346；pass 346；fail 0；exit 0 |
| `npm run test:mock` | 298 passed；4 skipped；exit 0 |
| `npm run test:local` API | tests 2；pass 2；fail 0 |
| `npm run test:local` browser | 45 passed；11 skipped；exit 0 |
| `npm run build` | 508 modules transformed；exit 0 |
| `npm run check:production-bundle` | main `638937/187466`；total JS `841561/257627`；exit 0 |
| bundle 對照 | main gzip `187466 − 187466 = 0 B`；total gzip `257627 − 257627 = 0 B` |
| generator 交件 | 預期 exit 1；恰八條紅簽章 |
| erased-token | HEAD/current 5,990 bytes、SHA 相同、byteEqual true |
| `git diff --check` | 無輸出、exit 0 |

`test:local` 首跑即綠，未執行 DB count/reset。unit 與 mock 前置 unit 出現既有、非致命
`WebSocket server error: Port 24678 is already in use`，最終計數及 exit 0 不受影響，沒有
retry。build 只有既有 >500 kB chunk warning。

production bundle 成功行逐字：

```text
production bundle check passed: development E2E hook present, production E2E hook absent; 32 files, 12 demo identifiers absent; main 638937/187466 within 658867/192420; largest app lazy MySessionsPage-Byp_C9FO.js 16476/4828 within 18000/5500; total JS 841561/257627 within 849961/259062; private repository: privateDataRepository-CfJqlfj0.js; Sentry: sentryBrowserSdk-Czz5dmkg.js
```

最終 frozen status（scripts、baseline、ledger、manifest、`sessionController.ts`、tests、
TS/package/lockfile）無輸出、exit 0。全庫 porcelain 恰三條，逐字：

```text
 M eslint.config.js
 M src/controller/discoveryMapController.ts
?? docs/arch-dispatch-2026-08-28-eslintE5-discoverymap-port-report-codex.md
```

tracked diff stat 逐字：

```text
 eslint.config.js                         |  2 +-
 src/controller/discoveryMapController.ts | 12 ++++++------
 2 files changed, 7 insertions(+), 7 deletions(-)
```

最終候選及 frozen SHA：

```text
4ede580f7bb3d15c653b59c2a0f1965e0f4a09897b514fcf1cf0370da2888a31  src/controller/discoveryMapController.ts
35b7f78f04db3bd45e3d22db931e9de457be7dca7d842fbc2b3d2bf81559cbe5  eslint.config.js
ce6808be54a596f0c4d0d92b2a23bda170764d6d623ba1b0e20e1dac500852ae  scripts/generate-eslint-unbound-manifest.mjs
14e56a1675ccf4939f2e0bc3e2685070b325a32a75ef778ea1ffa45b018fd207  docs/arch-eslint-phaseE-baseline.json
3f829c6def37aa0aca9a7f19875bb5958dd4574a59c4489a472833a179565073  docs/arch-eslint-phaseE-removal-ledger.json
774322448aad652030935d164749da6a00ef89fdf753f240640139cc556f89d4  docs/arch-eslint-phaseE-unbound-manifest.json
e88dbd71d38b5a7ee6f30cf915d25433b37171734bf97f08a331c00b5de02869  docs/arch-eslint-phaseE-unbound-manifest.md
```

## 8. Codex 五問

### 1. 如何證明只處理目標六筆，沒有動到另外三個 interface？

HEAD manifest 對該檔恰六筆且全部 owner 為 `factory:createDiscoveryMapController`。tracked source
diff 只含 `DiscoveryMapDependencies` 的六行；`mapTools` 原位不動，`DiscoveryDataApi`、
`MapTools`、`DiscoveryMapController` 零 diff。generator 紅簽章也只少六個指定 ID，沒有
sessionController 63→50 或第九條 derived error。

### 2. 如何證明 construction、傳播與 runtime 沒變？

唯一 construction call 是 `sessionController.ts:363`；兩個非 shorthand 與其餘 shorthand
原文全留。`:45/:52/:102-105` 的 Parameters、api intersection 與 indexed access 零 diff。
source 只有 type punctuation，esbuild 完整 output 5,990 bytes 逐 byte 全等，故 callback
identity、Promise 回傳、render 行為與 poll/viewport 流程不變。

### 3. 如何證明不是靠排除 scan 或擴大／縮小規則範圍假修？

generator/SCAN_GLOBS SHA 與 diff 都不變；真 config files array 只新增精確 discovery path。
暫退 type 修復後正常 `npm run lint` 立刻在六個 destructure 點紅，還原後綠。若使用 controller
glob，其餘五檔會被提前上線而讓 lint 與 generator reverse assert 紅；現行 diff 沒有 glob。

### 4. 為何 generator 紅仍是正確交件？

current 強掃已是 234/25/63，但 ledger 仍只記 E-2＋E-4 的 ACCEPTED removals，所以 expected
仍是 240/26/63。八行紅簽章機械表達「六筆候選修復尚未接受記帳」。驗收方建立 acceptance
record、原子追加 E-5 六筆並重生後才應綠，scope gate 屆時會驗 discoveryMap effective error。

### 5. 剩餘五個 controller ports 批的已知差異與全清判定

以下 construction site 均由 TypeScript AST 對 `sessionController.ts` 的 direct call 重驗；每批
仍需在開工時重跑，不把本表當永久事實。

| 檔案／ports | 唯一 construction call | 目標 port 中的非 shorthand 傳入 | indexed-access 轉出 | 何時 scoped 上線 |
| --- | --- | --- | --- | --- |
| `chatController.ts` 11 | `createChatController` `:613` | `readCourts: () => read().courts`；另有非 port `api: api!` | data-port `api`；public `openChat` | 11 筆全清即加精確 path |
| `lifecycleActionsController.ts` ports 11 | `createLifecycleActionsController` `:438` | 11 ports 均 shorthand；另有非 port `api: api!` | data-port `api`；`openDecideSession`、`openEditSession`、`openWithdrawConfirmation` | **不得**在 ports 11 清零時加；同檔仍有 extraction 2 |
| `authController.ts` 12 | `createAuthController` `:468` | 12 ports 均 shorthand | public `onAuthIdentityChange`；無 data-port api | 12 筆全清即加精確 path |
| `playerDirectoryController.ts` 13 | `createPlayerDirectoryController` `:331` | `openCreateIntent`、`publish`、`requireSessionAction`、`visibleSessions` 是 forwarding arrows；另有非 port `api: api!` | data-port `api`；四個 public open callbacks | 13 筆全清即加精確 path |
| `intentController.ts` 22 | `createIntentController` `:394` | `loadDiscovery`、`loadPlayers`、`openSessionChat` 是 forwarding arrows；`profilePrompt: promptProfile` 是改名傳入；另有非 port `api: api!` | data-port `api`；`openCreateSession`、`openLogin`、`profilePrompt`、`showCreatedSession`、`intentStore` | 22 筆全清即加精確 path |

所有既有 forwarding arrows 都必須原文保留；port 修復仍只改 dependency interface，不新增 wrapper。
chat 的 factory 參數是整顆 `dependencies` 後再解構，lint 紅點可能與前兩批的直接 parameter
destructure 不同，應先以 canary 實測行號再凍結回報。

`lifecycleActionsController.ts` 是唯一特殊檔：現行共 13 findings，其中 callback-port 11，另有
`api-method-extraction` 2，皆在 `reviewMySessionParticipant` 的
`api.acceptSessionParticipant`／`api.declineSessionParticipant`（同一 source line）。若先修 ports
11，檔案仍有 2 筆，所以 derived files 數不會下降、config 不得加該 path，generator reverse
assert 也要求它保持未 scoped。驗收方接受 ports 批後 ledger 只追加 11 筆；另開 extraction 2
小批，待最後兩筆也消失時才在該批加入精確 selector。最後一批的紅簽章才會同時出現 files
下降；ACCEPTED ledger 到位後 scope gate 才能首次驗該檔 error。

其餘四檔的 ports 數就是該檔全部 findings，故各自 ports 全清時同批加入精確 selector；不以
「某個 interface 全改完」代替「manifest 該 path current scan 為 0」的判定。

## 9. 未做／疑義／BLOCKED

- 未做：E-5 ledger 六筆、manifest 重生／`--check` 綠、驗收紀錄、剩餘 ports、lifecycle
  extraction、factory results、任何 tests/source 擴改、commit、push；前三項依派工由驗收方
  ACCEPTED 時原子完成。
- 疑義：無。
- BLOCKED：無。
