# ESLint 恢復 Phase E-7：playerDirectory controller ports 13 筆回報（Codex）

- 日期：2026-08-28
- 開工 HEAD：`36abcef`；開工基準：`8007e3e`（E-6 ACCEPTED）
- 開工狀態：`git status --porcelain` 無輸出。
- 結論：完成；交件維持 generator 紅簽章，不改 ledger、不重生 manifest、不 commit、不 push。
- BLOCKED：無。

## 1. Scope、construction、傳播與 frozen mines 重驗

開工時 generator 正常成功行逐字：

```text
eslint unbound manifest check passed: 222 findings/24 files; sessionController 63; duplicates 0; unresolved declarations 0; sha256:8e69cf93e72cf21024a7ce117eed1dae6dd035a80b8322d4b08128fa60904c19
```

HEAD manifest 對 `src/controller/playerDirectoryController.ts` 恰 13 筆，全部 owner 為
`factory:createPlayerDirectoryController`、declaration kind 為 `MethodSignature`：

```text
eb04e759cc4cf6e905697e4b6ce2ee06 109:3 captureAuthSnapshot
3b8caa77050a0787e319652907aa7265 120:3 publish
c4409683140c0deed10a011b2ee14522 121:3 reloadParticipation
77882e87081d797558371271c5b99245 122:3 requireSessionAction
ddfc3fbebe89c821c0c1cb923020802c 125:3 transitionSurfaces
5db1cfcb66828b1ad35770cde90c1ac4 126:3 visibleSessions
614e224d354fee168352fc27e6aae982 110:3 isCurrentAuthSnapshot
5df8df592522cc83b0e9a9261dcd9e03 111:3 openCourtDrawer
f5e840372c0aee2407cb0e1a37a9d900 112:3 openCourtPlayersDrawer
e059c6c214384b533ee05809a3aad86f 113:3 openCreateIntent
cb489a441fd27ff9e499282e5c5d7395 114:3 openPlayerCard
73aef827bbad053d1251acb3d85dd9f8 115:3 openPlayerDirectoryList
0d0ccf3e15796e9eb1c985902254ae69 116:3 openSessionById
```

`rg -n "createPlayerDirectoryController" src tests` 只有 import、`Parameters` 型別別名、
`sessionController.ts:331` direct call 與 factory declaration。因此 construction 唯一為
`sessionController.ts:331-351`；`api: api!`、四個 forwarding arrows及其餘 shorthand 全段零 diff。

傳播面 `sessionController.ts:49` 與 `:110-113` 四個目標 indexed accesses 逐 byte 未變，
`npm run typecheck` 綠。exported `PlayerDirectoryController` 八個 method signatures 也逐字未變；
其 frozen findings 仍位於 `sessionController.ts:353-360`：

```text
7ebdcb29b9a1ee15eb9bfe242e922275 353:5 clearPlayerDirectory
f81c028cf652376abddd8b30060db6ba 354:5 clearPlayerLayer
5b17e82aca25514a7935291ae34eda39 355:5 getPlayerGroups: playerGroups
a78b9b24613fb613430c329ecc7d73ef 356:5 loadPlayerDirectoryList
e11912c61797d97c904fac8f6e31b998 357:5 loadPlayers
48f122f6cdec472220528fb9845da03d 358:5 openCourt
7d4d069b1610d7aa9ee6962ca962c23f 359:5 openPlayerCourt
dd4bba1a2e4a353675464a4322d1d2c6 360:5 openPlayerDirectory
```

它們未被誤清，`sessionController` 保持 63 findings。

## 2. 修改後 `:44-86` 逐字原文

```ts
interface PlayerDirectoryControllerDependencies {
  api: PlayerDataApi;
  captureAuthSnapshot: () => ControllerAuthSnapshot;
  isCurrentAuthSnapshot: (snapshot: ControllerAuthSnapshot) => boolean;
  openCourtDrawer: (
    court: DataCourt,
    sessions: SessionSummary[],
    handlers: { courts: DataCourt[]; onOpenSession(sessionId: ControllerIdentifier): unknown }
  ) => ControllerSurfaceHandle | null | undefined;
  openCourtPlayersDrawer: (
    court: DataCourt,
    players: ControllerPlayer[],
    handlers: { onClose(): void; onOpenPlayer(player: ControllerPlayer): unknown }
  ) => ControllerSurfaceHandle | null | undefined;
  openCreateIntent: () => void;
  openPlayerCard: (
    player: ControllerPlayer | PlayerDirectoryEntry,
    handlers: {
      courts: DataCourt[];
      myInvitableSessions: MySessionSummary[];
      onClose(): void;
      onCreate(): void;
      onInvite(sessionId: ControllerIdentifier): Promise<unknown>;
      onSeeDirectory(): unknown;
    }
  ) => ControllerSurfaceHandle | null | undefined;
  openPlayerDirectoryList: (handlers: {
    onClose(): void;
    onOpenPlayer(player: PlayerDirectoryEntry): unknown;
    onRetry(): Promise<boolean>;
  }) => ControllerSurfaceHandle | null | undefined;
  openSessionById: (sessionId: ControllerIdentifier) => unknown;
  playerCardGate: CapturingRequestGate;
  playerDirectoryGate: ControllerRequestGate;
  playerGate: ControllerRequestGate;
  publish: () => void;
  reloadParticipation: (epoch: number, identity: string | null) => Promise<boolean>;
  requireSessionAction: (intent: { action: "directory" }) => Promise<boolean> | void;
  store: Store<SessionControllerState, ControllerEventName>;
  surfaceRegistry: SurfaceRegistry;
  transitionSurfaces: (name: string, options?: SurfaceCloseOptions) => void;
  visibleSessions: () => SessionSummary[];
}
```

九個單行與四個多行目標只改 top-level 外層形狀；多行參數及 handler object 原文保留。

ESLint scoped selector只依字典序新增精確 path：

```js
      "src/controller/mySessionsController.ts",
      "src/controller/playerDirectoryController.ts",
      "src/map.ts",
```

## 3. nested、非目標與 construction 零 diff 自證

以 TypeScript AST 分別解析 `git show HEAD:...` 與 current source。13 個目標全部由 top-level
`MethodSignature` 轉為 `PropertySignature(FunctionTypeNode)`；四個 `handlers` type 的 raw text
相等且 token SHA 如下：

| handler | nested methods | rawEqual | token SHA-256 |
| --- | ---: | --- | --- |
| `openCourtDrawer.handlers` | 1 | true | `01d041ed8e1639d28edf590fbdcc5bc3347e3061a07fd27889df64b61a02cc78` |
| `openCourtPlayersDrawer.handlers` | 2 | true | `143ad31049c3d2a859fb831b57e00a6a748bdebacffaaa39c9872b71d5d76aab` |
| `openPlayerCard.handlers` | 4 | true | `7327dfd08fdd2ea37e892347073d7c0ea51ed26a247c0fa01c09f56223112bb6` |
| `openPlayerDirectoryList.handlers` | 3 | true | `a1078d50926e57ea916e8f8d3c11fc7fe612af99d203522b3948ce4e620ae5d0` |

因此 frozen nested 10 筆（1+2+4+3）及 handler 內 `courts`、`myInvitableSessions` 均逐 token
全等。六個非目標成員 `api`／`playerCardGate`／`playerDirectoryGate`／`playerGate`／`store`／
`surfaceRegistry` 各自 `rawEqual=true`。三個 frozen interfaces 也逐字全等：

```text
FROZEN_INTERFACE CapturingRequestGate rawEqual=true
FROZEN_INTERFACE PlayerDataApi rawEqual=true
FROZEN_INTERFACE PlayerDirectoryController rawEqual=true
SESSION_CONTROLLER byteEqual=true sha256=ca47ac4de8ebef7810db60f3b9cb9f6afd8abc8b0ed697f1cc2b4507bdf0792d
```

construction 四個 forwarding arrows 原文仍為：

```ts
openCreateIntent: () => intentController.openCreateIntent(),
publish: () => discoveryMapController.publish(),
requireSessionAction: (intent) => intentController.requireSessionAction(intent) as Promise<boolean> | void,
visibleSessions: () => discoveryMapController.getVisibleSessions(),
```

## 4. 規則有牙三拍

候選 source 與 selector 完成後第一次 `npm run lint` 無診斷、exit 0。候選 SHA：

```text
dbcad72692bd934467df1bd77c69da1b2c39026485ba99e600031459b025b83b  src/controller/playerDirectoryController.ts
9f2c67c3b6ff0e291a8cccbc44698a12066a61fe037293b06d148e31ba235b50  eslint.config.js
```

保持 selector 上線，只暫退 13 個 top-level declarations；`npm run lint` exit 1，紅點逐字：

```text
/Users/ian/tennisPartnerFinder/src/controller/playerDirectoryController.ts
  109:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  110:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  111:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  112:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  113:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  114:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  115:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  116:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  120:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  121:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  122:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  125:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  126:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method

✖ 13 problems (13 errors, 0 warnings)
```

紅點恰為 109–116、120–122、125–126。精確 `apply_patch` 還原後 source SHA 回到
`dbcad726…b83b`，第二次 lint 無診斷、exit 0。

## 5. 逐 stableId 三點對點

| stableId | member／宣告改動 | canary 命中行 | generator 點 |
| --- | --- | ---: | --- |
| `eb04e759cc4cf6e905697e4b6ce2ee06` | `captureAuthSnapshot()` → `captureAuthSnapshot: ()` | 109 | 同 ID/path missing |
| `3b8caa77050a0787e319652907aa7265` | `publish()` → `publish: ()` | 120 | 同 ID/path missing |
| `c4409683140c0deed10a011b2ee14522` | `reloadParticipation(...)` → `reloadParticipation: (...)` | 121 | 同 ID/path missing |
| `77882e87081d797558371271c5b99245` | `requireSessionAction(...)` → `requireSessionAction: (...)` | 122 | 同 ID/path missing |
| `ddfc3fbebe89c821c0c1cb923020802c` | `transitionSurfaces(...)` → `transitionSurfaces: (...)` | 125 | 同 ID/path missing |
| `5db1cfcb66828b1ad35770cde90c1ac4` | `visibleSessions()` → `visibleSessions: ()` | 126 | 同 ID/path missing |
| `614e224d354fee168352fc27e6aae982` | `isCurrentAuthSnapshot(...)` → `isCurrentAuthSnapshot: (...)` | 110 | 同 ID/path missing |
| `5df8df592522cc83b0e9a9261dcd9e03` | `openCourtDrawer(`／`):` → `openCourtDrawer: (`／`) =>` | 111 | 同 ID/path missing |
| `f5e840372c0aee2407cb0e1a37a9d900` | `openCourtPlayersDrawer(`／`):` → `openCourtPlayersDrawer: (`／`) =>` | 112 | 同 ID/path missing |
| `e059c6c214384b533ee05809a3aad86f` | `openCreateIntent()` → `openCreateIntent: ()` | 113 | 同 ID/path missing |
| `cb489a441fd27ff9e499282e5c5d7395` | `openPlayerCard(`／`):` → `openPlayerCard: (`／`) =>` | 114 | 同 ID/path missing |
| `73aef827bbad053d1251acb3d85dd9f8` | `openPlayerDirectoryList(`／`):` → `openPlayerDirectoryList: (`／`) =>` | 115 | 同 ID/path missing |
| `0d0ccf3e15796e9eb1c985902254ae69` | `openSessionById(...)` → `openSessionById: (...)` | 116 | 同 ID/path missing |

13 列全部同時通過宣告點、lint 點與下節 generator 點；沒有用 diff 行數取代逐筆證據。

## 6. generator 紅簽章（交件狀態）

`node scripts/generate-eslint-unbound-manifest.mjs --check` exit 1；排除 stack，恰 15 條 `- `：

```text
Error: manifest hard gate failed:
- expected finding missing from current scan: eb04e759cc4cf6e905697e4b6ce2ee06 (src/controller/playerDirectoryController.ts)
- expected finding missing from current scan: 3b8caa77050a0787e319652907aa7265 (src/controller/playerDirectoryController.ts)
- expected finding missing from current scan: c4409683140c0deed10a011b2ee14522 (src/controller/playerDirectoryController.ts)
- expected finding missing from current scan: 77882e87081d797558371271c5b99245 (src/controller/playerDirectoryController.ts)
- expected finding missing from current scan: ddfc3fbebe89c821c0c1cb923020802c (src/controller/playerDirectoryController.ts)
- expected finding missing from current scan: 5db1cfcb66828b1ad35770cde90c1ac4 (src/controller/playerDirectoryController.ts)
- expected finding missing from current scan: 614e224d354fee168352fc27e6aae982 (src/controller/playerDirectoryController.ts)
- expected finding missing from current scan: 5df8df592522cc83b0e9a9261dcd9e03 (src/controller/playerDirectoryController.ts)
- expected finding missing from current scan: f5e840372c0aee2407cb0e1a37a9d900 (src/controller/playerDirectoryController.ts)
- expected finding missing from current scan: e059c6c214384b533ee05809a3aad86f (src/controller/playerDirectoryController.ts)
- expected finding missing from current scan: cb489a441fd27ff9e499282e5c5d7395 (src/controller/playerDirectoryController.ts)
- expected finding missing from current scan: 73aef827bbad053d1251acb3d85dd9f8 (src/controller/playerDirectoryController.ts)
- expected finding missing from current scan: 0d0ccf3e15796e9eb1c985902254ae69 (src/controller/playerDirectoryController.ts)
- findings expected 222, received 209
- files expected 24, received 23
```

沒有額外 missing、unexpected、sessionController 或 scope-gate 錯誤；generator 在 write 前 throw。

## 7. erased-token 對帳與常設三證

同一 `esbuild.transform` 記憶體流程：loader `ts`、format `esm`、target `esnext`、
`minifyWhitespace: true`、`treeShaking: false`。

```text
HEAD bytes=7747 sha256=953ada2862220336ccdd557d9e61a09817156e43b2ee69c1d81d4bc785774027
current bytes=7747 sha256=953ada2862220336ccdd557d9e61a09817156e43b2ee69c1d81d4bc785774027
byteEqual=true
```

常設三證為：§4 真 config canary 恰紅 13；config diff 只新增一個精確 path且 generator/
`SCAN_GLOBS`/baseline/ledger/manifest 零 diff；erased-token 逐 byte 全等。沒有新增 `any`、
`@ts-ignore`、inline disable、wrapper、`.bind()` 或 arrow。

frozen SHA：

```text
ce6808be54a596f0c4d0d92b2a23bda170764d6d623ba1b0e20e1dac500852ae  scripts/generate-eslint-unbound-manifest.mjs
14e56a1675ccf4939f2e0bc3e2685070b325a32a75ef778ea1ffa45b018fd207  docs/arch-eslint-phaseE-baseline.json
4c713a06558b881b5cce56fa302a03323910cfb8999d6c397dcf65bb609d17a0  docs/arch-eslint-phaseE-removal-ledger.json
1e38d820f2d4fed41567dc07e20e71bbe67df724c5e185808d8d530db064592e  docs/arch-eslint-phaseE-unbound-manifest.json
c6afabf1c94f16bf5ecd531790589b2dbe7734b7d4c8d8f661b0b9df02b47a2a  docs/arch-eslint-phaseE-unbound-manifest.md
```

## 8. 收尾矩陣

| Gate | 實跑結果 |
| --- | --- |
| `npm run typecheck` | exit 0（獨立一次，mock/local pretest 各再一次） |
| `npm run lint` | 候選兩次無診斷、exit 0；canary 恰 13 errors |
| `npm run prettier:check` | `All matched files use Prettier code style!`；exit 0 |
| `npm run test:session-unit` | tests 346；pass 346；fail 0；exit 0 |
| `npm run test:mock` | 298 passed；4 skipped；exit 0 |
| `npm run test:local` API | tests 2；pass 2；fail 0 |
| `npm run test:local` browser | 45 passed；11 skipped；exit 0 |
| `npm run build` | 508 modules transformed；exit 0 |
| `npm run check:production-bundle` | main `638937/187466`；total JS `841561/257627`；exit 0 |
| bundle 對照 | main gzip `187466 − 187466 = 0 B`；total gzip `257627 − 257627 = 0 B` |
| generator 交件 | 預期 exit 1；恰 15 條紅簽章 |
| erased-token | HEAD/current 7,747 bytes、SHA 相同、byteEqual true |
| `git diff --check` | 無輸出、exit 0 |

`test:local` 首跑即綠，未執行 DB count/reset。unit 出現既有非致命
`WebSocket server error: Port 24678 is already in use`，最終計數與 exit 0 不受影響。
build 只有既有 >500 kB chunk warning。

production bundle 成功行逐字：

```text
production bundle check passed: development E2E hook present, production E2E hook absent; 32 files, 12 demo identifiers absent; main 638937/187466 within 658867/192420; largest app lazy MySessionsPage-Byp_C9FO.js 16476/4828 within 18000/5500; total JS 841561/257627 within 849961/259062; private repository: privateDataRepository-CfJqlfj0.js; Sentry: sentryBrowserSdk-Czz5dmkg.js
```

tracked diff stat（回報落盤前）逐字：

```text
 eslint.config.js                            |  1 +
 src/controller/playerDirectoryController.ts | 34 ++++++++++++++---------------
 2 files changed, 18 insertions(+), 17 deletions(-)
```

最終 frozen diff（其餘 `src/**`，含 `sessionController.ts`、tests、scripts、baseline、ledger、
manifest、package/lockfile、tsconfig）無輸出、exit 0。全庫 porcelain 恰三條，逐字：

```text
 M eslint.config.js
 M src/controller/playerDirectoryController.ts
?? docs/arch-dispatch-2026-08-28-eslintE7-playerdirectory-port-report-codex.md
```

## 9. Codex 五問

### 1. 如何證明只改 13 個 top-level ports，沒有順手改 nested methods？

AST 逐一驗出 13/13 `MethodSignature → PropertySignature(FunctionTypeNode)`；四個 handlers raw text
全等，token SHA 固定，nested count 恰 10。六個非目標成員與三個 frozen interfaces raw text
全等。逐 stableId 表、canary 及 generator 三方皆只指向同一 13 筆。

### 2. 如何證明 construction、indexed propagation 與 runtime 沒變？

唯一 construction 在 `sessionController.ts:331`，四個 forwarding arrows（含 cast）原文保留；
`:49` 與 `:110-113` indexed access 零 diff且 typecheck 綠。整份 `sessionController.ts` byteEqual，
esbuild output 7,747 bytes 逐 byte 全等，故 callback identity與 runtime 行為不變。

### 3. 如何證明不是以 selector、scan 或例外假清零？

selector 只加 playerDirectory 精確 path；generator、`SCAN_GLOBS`、baseline、ledger、manifest
均維持 HEAD。暫退外層 declarations 後真 lint 恰紅 13，還原候選 SHA 後綠；無 glob、disable、
ignore、wrapper 或 bind。

### 4. 為何 generator 紅是正確交件狀態？

current 強掃為 209/23/63，但 ledger/manifest 仍停在 E-6 ACCEPTED 的 222/24/63。15 條紅簽章
表示 13 個候選尚未被驗收記帳；驗收方建立 E-7 acceptance、追加 ledger 並重生 manifest 後，
`--check` 才應綠。本批先改 ledger/manifest 會破壞紅簽章流程。

### 5. chat 11 筆批的差異點與 canary 應如何寫？

唯讀重驗顯示 `ChatControllerDependencies` 位於 `chatController.ts:29-59`，11 個 manifest
findings 全為 `invocationStyle=destructured-function`。factory 不是 parameter destructuring：

```ts
export function createChatController(dependencies: ChatControllerDependencies): {
  openSessionChat(sessionId: ControllerIdentifier): ControllerSurfaceHandle | null | undefined;
} {
  const {
    // findings 位於這個 body destructure 的 :72-84
  } = dependencies;
```

11 筆依 manifest 固定順序為：

| stableId | member | body destructure finding 行 | declaration 行區間 |
| --- | --- | ---: | --- |
| `e700dadac9062df874386df1a1eb2bc7` | `toast` | 81 | 55 |
| `d79fd5ad5211ca65be7b00a4daf62f24` | `transitionSurfaces` | 82 | 56 |
| `0bb560eeae89cf52c331fd23d606f51e` | `withdrawMySession` | 84 | 58 |
| `700002637db483e5d5cab91d567aca64` | `isCurrentAuthSnapshot` | 72 | 32 |
| `63a82b1a032be827ea0f3f1083178ddf` | `notifyMySessions` | 73 | 33 |
| `7e9f1007fe33058f35738036d82c1ab1` | `openChat` | 74 | 34-45 |
| `da1560bb7600a9b8512921a4b4bdf283` | `openReportForTarget` | 75 | 46 |
| `abb1fa02f2d369e6837b907aa1c225ba` | `readCourts` | 76 | 47 |
| `c4c01719deed2482bbcb76288ff49073` | `refreshMyPlayerBlocks` | 77 | 48 |
| `ee4c9bb35d8cfedb6ae4805024af2323` | `refreshMySessions` | 78 | 49 |
| `99a96b72c6cd05925bb962d0e5599f74` | `requireMySessionAction` | 79 | 50-53 |

兩個多行 top-level signatures 是 `openChat:34-45` 與 `requireMySessionAction:50-53`；只能改
外層 `name(`/`): R` 為 `name: (`/`) => R`。`openChat.handlers` 內五個 nested methods
`onBlock:39`、`onClose:40`、`onPost:41`、`onReport:42`、`onWithdraw:43` 必須逐 token 凍結；
`canWithdraw:37`、`courts:38` 也零 diff。其餘非目標 dependency properties為 `api:30`、
`chatPollIntervalMs:31`、`surfaceRegistry:54`、`visibilityTarget:57`。

唯一 construction 是 `sessionController.ts:613`；目標中唯一非 shorthand 傳入必須原文保留：

```ts
readCourts: () => read().courts,
```

另需凍結 factory inline return type 的 `openSessionChat` method；其 finding 位於
`sessionController.ts:613:11`（stableId `b5443c26d5d8f44f05321a8a506272f8`），誤改會讓
sessionController 63→62並增加紅簽章。

canary 寫法應明訂：先加 chat 精確 selector並確認 lint 綠；保持 selector，只把 11 個 top-level
dependency declarations 暫退為 methods；lint 必須恰在 body destructure
`72/73/74/75/76/77/78/79/81/82/84` 出現 11 errors，而不是 declaration lines；精確還原
candidate SHA 後再綠。若 E-7 已 ACCEPTED，generator aggregate 預期由 209/23 降至 198/22；
missing 順序依上表 stableId，且不得出現 `openSessionChat` 或 sessionController derived error。

## 10. 未做／疑義／BLOCKED

- 未做：E-7 ledger 13 筆、manifest 重生／`--check` 綠、驗收紀錄、chat 11 筆、其他
  controller ports、factory results、任何 tests/source 擴改、commit、push；前三項依派工由驗收方
  ACCEPTED 時原子完成。
- 建議：chat 下一批沿用逐 stableId 三點表，但 canary 行必須固定在 body destructure，不可誤寫成
  declaration 行；同時加入 `openSessionChat` frozen mine 反證。
- 疑義：無。
- BLOCKED：無。
