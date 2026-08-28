# ESLint 恢復 Phase E-6：auth controller ports 12 筆回報（Codex）

- 日期：2026-08-28
- 開工 HEAD：`f46b2af`；開工基準 parent：`1cbe80e`（E-5 ACCEPTED）
- 開工狀態：`git status --porcelain` 無輸出。
- 結論：完成；交件維持 generator 紅簽章，不改 ledger、不重生 manifest、不 commit、不 push。
- BLOCKED：無。

## 1. Scope、construction 與 frozen mines 重驗

開工時 generator 正常成功行逐字：

```text
eslint unbound manifest check passed: 234 findings/25 files; sessionController 63; duplicates 0; unresolved declarations 0; sha256:221dfbad158d8cf6bd590e96a9b88122c188d05242991325355095440c3fd91f
```

HEAD manifest 對 `src/controller/authController.ts` 的實際篩選結果恰 12 筆，順序如下：

```text
e3756c71329c99ecce0faf2cf1fb90f0 58:3 clearIntent factory:createAuthController
34da16e02753441592963c60f9c1f92f 67:3 reloadParticipation factory:createAuthController
9cf1a1bf5de918b6f012db21e9448272 68:3 replaceMySessions factory:createAuthController
a04a92d2dbfb309588618abf80bee8a9 69:3 resumePendingIntent factory:createAuthController
5a005b71ad7f5043efe3fdab6f06cdfc 72:3 transitionSurfaces factory:createAuthController
cd3b31d43e48fe667f04b54ff0e6830d 59:3 clearPlayerDirectory factory:createAuthController
52c2ee79658beebfe1218e957221cc7c 60:3 clearPlayerLayer factory:createAuthController
509f4bf0b4e992c0bf2c222d8d37485e 61:3 isCurrentAuthSnapshot factory:createAuthController
862b5090ce883d3a2e69f05b4b9a6e13 62:3 notifyMySessions factory:createAuthController
eb8043a3396ced0e46fca111e5723768 64:3 publish factory:createAuthController
4a2f858cb237f19e8fbc0154c8a09e44 65:3 reconcileActiveChatParticipation factory:createAuthController
5c3954bc5387ad8b7428bd54f70d4abd 66:3 reconcileActiveDetailParticipation factory:createAuthController
```

`rg -n "createAuthController" src tests` 只有 import、`Parameters` 型別別名、
`sessionController.ts:468` direct call 與 factory declaration，所以 construction site 唯一為
`sessionController.ts:468-485`。該 object 的 12 個目標 port 全是 shorthand，整段零 diff；
`sessionController.ts:43` 的 `Parameters` 與 `:124` 的 public indexed access 也零 diff。

同檔 inline factory return type 的三個 method signatures 保持原文；其 findings 實際落在 frozen
`sessionController.ts:468`：

```text
cbe8f0200281fdf0b14c8dd95b7cb553 468:11 setAuthSession
75cd4020732a1733d8c57bde1aa0dea0 468:27 setAuthState
781cbd80fd64568ed8036d655435de14 468:41 setProfile
```

它們沒有被誤清，`sessionController` 保持 63 findings。`git diff --stat --
src/controller/authController.ts` 精確為 12 insertions／12 deletions。

## 2. 修改後 `:30-47` 逐字原文

```ts
interface AuthControllerDependencies {
  blockedPlayerGate: ControllerRequestGate;
  clearIntent: () => boolean;
  clearPlayerDirectory: (options?: { closeReason?: string }) => void;
  clearPlayerLayer: (options?: { closeReason?: string }) => void;
  isCurrentAuthSnapshot: (snapshot: { epoch: number; identity: string | null }) => boolean;
  notifyMySessions: () => void;
  onAuthIdentityChange?: AuthIdentityChangeHandler | null;
  publish: () => void;
  reconcileActiveChatParticipation: () => void;
  reconcileActiveDetailParticipation: () => void;
  reloadParticipation: (epoch: number, identity: string | null) => Promise<boolean>;
  replaceMySessions: (sessions: unknown) => void;
  resumePendingIntent: () => Promise<boolean>;
  store: Store<SessionControllerState, ControllerEventName>;
  surfaceRegistry: SurfaceRegistry;
  transitionSurfaces: (name: string, options?: SurfaceCloseOptions) => void;
}
```

12 個目標成員均逐行原位改為 function properties；`blockedPlayerGate`、
`onAuthIdentityChange`、`store`、`surfaceRegistry` 四行一字不動。inline return type 與同檔其他
interface 零 diff。

ESLint scoped selector 修改後逐字：

```js
    files: [
      "src/controller/authController.ts",
      "src/controller/discoveryMapController.ts",
      "src/controller/mySessionsController.ts",
      "src/map.ts",
    ],
```

四個都是精確路徑、維持字典序，沒有 glob。

## 3. 規則有牙三拍

候選 source 與 selector 完成後，第一次 `npm run lint` 無診斷、exit 0。候選 SHA：

```text
641c2fcecb75091216d5d5745fb1758e9e7e70a3e412a55807cd691cf507f7a7  src/controller/authController.ts
06aa92f6ff2fbbe8048bcf21e9852ca18d5cf082044636685067b0951dd044a8  eslint.config.js
```

保持 selector 上線，只暫退 12 行為 method signatures；`npm run lint` exit 1，實際紅點逐字：

```text
/Users/ian/tennisPartnerFinder/src/controller/authController.ts
  58:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  59:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  60:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  61:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  62:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  64:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  65:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  66:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  67:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  68:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  69:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  72:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method

✖ 12 problems (12 errors, 0 warnings)
```

紅點恰為預測的 factory destructure `58/59/60/61/62/64/65/66/67/68/69/72`，沒有
第 13 筆。精確 `apply_patch` 還原後 source SHA 回到 `641c2fce…f7a7`，第二次
`npm run lint` 無診斷、exit 0。

## 4. generator 紅簽章（交件狀態）

獨立執行 `node scripts/generate-eslint-unbound-manifest.mjs --check`，exit 1。排除 source stack，
錯誤恰 14 條 `- ` 條目、順序逐字：

```text
Error: manifest hard gate failed:
- expected finding missing from current scan: e3756c71329c99ecce0faf2cf1fb90f0 (src/controller/authController.ts)
- expected finding missing from current scan: 34da16e02753441592963c60f9c1f92f (src/controller/authController.ts)
- expected finding missing from current scan: 9cf1a1bf5de918b6f012db21e9448272 (src/controller/authController.ts)
- expected finding missing from current scan: a04a92d2dbfb309588618abf80bee8a9 (src/controller/authController.ts)
- expected finding missing from current scan: 5a005b71ad7f5043efe3fdab6f06cdfc (src/controller/authController.ts)
- expected finding missing from current scan: cd3b31d43e48fe667f04b54ff0e6830d (src/controller/authController.ts)
- expected finding missing from current scan: 52c2ee79658beebfe1218e957221cc7c (src/controller/authController.ts)
- expected finding missing from current scan: 509f4bf0b4e992c0bf2c222d8d37485e (src/controller/authController.ts)
- expected finding missing from current scan: 862b5090ce883d3a2e69f05b4b9a6e13 (src/controller/authController.ts)
- expected finding missing from current scan: eb8043a3396ced0e46fca111e5723768 (src/controller/authController.ts)
- expected finding missing from current scan: 4a2f858cb237f19e8fbc0154c8a09e44 (src/controller/authController.ts)
- expected finding missing from current scan: 5c3954bc5387ad8b7428bd54f70d4abd (src/controller/authController.ts)
- findings expected 234, received 222
- files expected 25, received 24
```

沒有 unexpected、sessionController 或 scope-gate 錯誤。generator 在 write 前 throw，frozen
manifest 維持 HEAD bytes。

## 5. 常設判準三證

1. 真 config lint canary 恰紅 12 筆：見 §3，免疫把 scan 排除掉的假修復。
2. `eslint.config.js` diff 恰一處：只在 scoped files array 新增 auth 精確 path；
   `git diff -- scripts` 無輸出，generator、`SCAN_GLOBS`、baseline、ledger、manifest 零 diff。
3. erased-token 全等：見 §6；沒有 runtime wrapper、`.bind()` 或新 arrow。

generator 與 frozen 基準 SHA：

```text
ce6808be54a596f0c4d0d92b2a23bda170764d6d623ba1b0e20e1dac500852ae  scripts/generate-eslint-unbound-manifest.mjs
14e56a1675ccf4939f2e0bc3e2685070b325a32a75ef778ea1ffa45b018fd207  docs/arch-eslint-phaseE-baseline.json
9f8794ad100111bd5fc3c001e0f292dbbd5d0a183fa204ef9f8114320a716d9c  docs/arch-eslint-phaseE-removal-ledger.json
7d021a863aaf9fccfbc59082748f68d95894f26ae2a602bb39055131f7a39c15  docs/arch-eslint-phaseE-unbound-manifest.json
df8d1bb6cef2a377bceb6caed5620f615aaa4317b92b19698bcdb6b9ce1c6dd9  docs/arch-eslint-phaseE-unbound-manifest.md
```

## 6. erased-token 對帳

以同一個 `esbuild.transform` 在記憶體處理 `git show HEAD:...` 與 working source；兩側參數為
loader `ts`、format `esm`、target `esnext`、`minifyWhitespace: true`、
`treeShaking: false`。

```text
HEAD bytes=3984 sha256=344d7cdf8429bbe2b4d863091e08f420ab2d58293494b0090af725ffb179dfeb
current bytes=3984 sha256=344d7cdf8429bbe2b4d863091e08f420ab2d58293494b0090af725ffb179dfeb
byteEqual=true
```

因此 source 修改為零 runtime token；沒有新增 `any`、`@ts-ignore`、inline disable、wrapper、
`.bind()` 或 arrow。

## 7. 收尾矩陣

| Gate | 實跑結果 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 候選兩次無診斷、exit 0；暫退 canary 恰 12 errors |
| `npm run prettier:check` | `All matched files use Prettier code style!`；exit 0 |
| `npm run test:session-unit` | tests 346；pass 346；fail 0；exit 0 |
| `npm run test:mock` | 298 passed；4 skipped；exit 0 |
| `npm run test:local` API | tests 2；pass 2；fail 0 |
| `npm run test:local` browser | 45 passed；11 skipped；exit 0 |
| `npm run build` | 508 modules transformed；exit 0 |
| `npm run check:production-bundle` | main `638937/187466`；total JS `841561/257627`；exit 0 |
| bundle 對照 | main gzip `187466 − 187466 = 0 B`；total gzip `257627 − 257627 = 0 B` |
| generator 交件 | 預期 exit 1；恰 14 條紅簽章 |
| erased-token | HEAD/current 3,984 bytes、SHA 相同、byteEqual true |
| `git diff --check` | 無輸出、exit 0 |

`test:local` 首跑即綠，未執行 DB count/reset。unit 與 mock 前置 unit 出現既有、非致命的
`WebSocket server error: Port 24678 is already in use`，最終計數與 exit 0 不受影響。
原始、未接 pipe 的 `test:mock` 尚在執行時，為取得被工具截斷的摘要而過早啟動一次補充命令，
該補充命令因 5174 正由原始 run 合法占用而拒絕啟動；原始 run 隨後正常 pass，待 port 釋放後
再跑 dot reporter 摘要亦為 `298 passed / 4 skipped`。這不是產品測試失敗或 retry 修復。
build 只有既有 >500 kB chunk warning。

production bundle 成功行逐字：

```text
production bundle check passed: development E2E hook present, production E2E hook absent; 32 files, 12 demo identifiers absent; main 638937/187466 within 658867/192420; largest app lazy MySessionsPage-Byp_C9FO.js 16476/4828 within 18000/5500; total JS 841561/257627 within 849961/259062; private repository: privateDataRepository-CfJqlfj0.js; Sentry: sentryBrowserSdk-Czz5dmkg.js
```

tracked diff stat（回報落盤前）逐字：

```text
 eslint.config.js                 |  7 ++++++-
 src/controller/authController.ts | 24 ++++++++++++------------
 2 files changed, 18 insertions(+), 13 deletions(-)
```

最終候選 SHA：

```text
641c2fcecb75091216d5d5745fb1758e9e7e70a3e412a55807cd691cf507f7a7  src/controller/authController.ts
06aa92f6ff2fbbe8048bcf21e9852ca18d5cf082044636685067b0951dd044a8  eslint.config.js
```

最終 frozen diff（其餘 `src/**`，含 `sessionController.ts`、tests、scripts、baseline、ledger、
manifest、package/lockfile、tsconfig）無輸出、exit 0。全庫 porcelain 恰三條，逐字：

```text
 M eslint.config.js
 M src/controller/authController.ts
?? docs/arch-dispatch-2026-08-28-eslintE6-auth-port-report-codex.md
```

## 8. Codex 五問

### 1. 如何證明只處理目標 12 筆，沒有踩到三個 factory-result mines？

HEAD manifest 對 auth path 恰 12 筆，全部 owner 為 `factory:createAuthController`。source diff
只含 `AuthControllerDependencies` 的 12 行，精確 12/12；inline return type 的
`setAuthSession`／`setAuthState`／`setProfile` 零 diff。generator 紅簽章只少指定 12 IDs，仍保留
`sessionController 63`，沒有多出三個 missing 或 `63→60` derived error。

### 2. 如何證明 construction、傳播與 runtime 沒變？

唯一 direct construction 是 `sessionController.ts:468`，12 個傳入全 shorthand 且零 diff；
`:43` 的 `Parameters` 與 `:124` 的非目標 `onAuthIdentityChange` indexed access 也零 diff。
esbuild output 3,984 bytes 逐 byte 全等，因此 callback identity、Promise 回傳、auth reconciliation
順序與 runtime 行為都沒變。

### 3. 如何證明不是靠排除 scan 或擴大／縮小規則範圍假修？

generator、`SCAN_GLOBS`、baseline、ledger、manifest SHA 與 diff 全不變；config 只新增精確 auth
path。暫退 12 個 type-only 修復後，真 `npm run lint` 立刻在 12 個 factory destructure 點紅，
精確還原後綠；沒有 controller glob、disable、ignore 或 wrapper。

### 4. 為何 generator 紅仍是正確交件？

current 強掃已是 222/24/63，但 ledger/manifest 仍停在 E-5 ACCEPTED 的 234/25/63；14 條紅簽章
機械表達「12 筆候選尚未被驗收記帳」。驗收方建立 acceptance record、原子追加 E-6 12 筆並
重生 manifest 後，`--check` 才應轉綠；本批先改 ledger/manifest 反而會破壞紅簽章制。

### 5. playerDirectory 13 筆批的差異點如何具體化？

HEAD manifest 對 `playerDirectoryController.ts` 恰 13 筆；建議下一派工單凍結下表，不能只寫
「改 13 個 interface members」：

| stableId | member | finding/canary 行 | dependency 宣告行區間 |
| --- | --- | --- | --- |
| `eb04e759cc4cf6e905697e4b6ce2ee06` | `captureAuthSnapshot` | `109:3` | `46` |
| `3b8caa77050a0787e319652907aa7265` | `publish` | `120:3` | `79` |
| `c4409683140c0deed10a011b2ee14522` | `reloadParticipation` | `121:3` | `80` |
| `77882e87081d797558371271c5b99245` | `requireSessionAction` | `122:3` | `81` |
| `ddfc3fbebe89c821c0c1cb923020802c` | `transitionSurfaces` | `125:3` | `84` |
| `5db1cfcb66828b1ad35770cde90c1ac4` | `visibleSessions` | `126:3` | `85` |
| `614e224d354fee168352fc27e6aae982` | `isCurrentAuthSnapshot` | `110:3` | `47` |
| `5df8df592522cc83b0e9a9261dcd9e03` | `openCourtDrawer` | `111:3` | `48-52` |
| `f5e840372c0aee2407cb0e1a37a9d900` | `openCourtPlayersDrawer` | `112:3` | `53-57` |
| `e059c6c214384b533ee05809a3aad86f` | `openCreateIntent` | `113:3` | `58` |
| `cb489a441fd27ff9e499282e5c5d7395` | `openPlayerCard` | `114:3` | `59-69` |
| `73aef827bbad053d1251acb3d85dd9f8` | `openPlayerDirectoryList` | `115:3` | `70-74` |
| `0d0ccf3e15796e9eb1c985902254ae69` | `openSessionById` | `116:3` | `75` |

四段多行 top-level method signatures 必須整段只改外層標點與 function-property 所需形狀，行區間
固定為 `openCourtDrawer:48-52`、`openCourtPlayersDrawer:53-57`、
`openPlayerCard:59-69`、`openPlayerDirectoryList:70-74`。其中 nested handler method signatures
不是 manifest findings，必須列為明確 frozen 清單：

```text
openCourtDrawer.handlers.onOpenSession
openCourtPlayersDrawer.handlers.onClose
openCourtPlayersDrawer.handlers.onOpenPlayer
openPlayerCard.handlers.onClose
openPlayerCard.handlers.onCreate
openPlayerCard.handlers.onInvite
openPlayerCard.handlers.onSeeDirectory
openPlayerDirectoryList.handlers.onClose
openPlayerDirectoryList.handlers.onOpenPlayer
openPlayerDirectoryList.handlers.onRetry
```

也就是 10 個 nested methods（不是 13 個目標）必須逐 token 零 diff；erased-token 無法單獨抓出
這類 type-only 越界，所以必須另做 source-diff 對點。

唯一 construction site 是 `sessionController.ts:331`；非 port `api: api!` 與其餘 shorthand 全部
凍結，四個 forwarding arrows 必須原文保留：

```ts
openCreateIntent: () => intentController.openCreateIntent(),
publish: () => discoveryMapController.publish(),
requireSessionAction: (intent) => intentController.requireSessionAction(intent) as Promise<boolean> | void,
visibleSessions: () => discoveryMapController.getVisibleSessions(),
```

依 E-5 acceptance record 的裁決，建議把下一批「逐 stableId 對點三條」明寫為每一列都要同時通過：

1. **宣告點**：該 stableId 對應的 top-level dependency method 精確改為 function property；多行參數、
   回傳型別及 nested handlers 逐 token 全等，非目標成員零 diff。
2. **lint 點**：selector 上線後，單筆/整批反向 canary 應在表列 factory destructure 行命中同一
   member；13 筆總計恰 13 errors，還原候選 SHA 後全綠。
3. **generator 點**：紅簽章逐列出現同一 stableId/path 且沒有額外 missing；若基準已接受 E-6，
   aggregate 應由 `222/24` 精確變成 `209/23`，接受前則必須按當時 manifest/ledger 基準重算，
   不可硬抄總數。

最後仍須附 erased-token 全等、13 個 top-level declaration diff 全中、上述 10 個 nested methods
零 diff與四個 forwarding arrows 原文零 diff。這比只用 13/13 行數或 erased-token 更能攔住
多行簽名的 type-only 越界。

## 9. 未做／疑義／BLOCKED

- 未做：E-6 ledger 12 筆、manifest 重生／`--check` 綠、驗收紀錄、playerDirectory 13 筆、
  其他 controller ports、factory results、任何 tests/source 擴改、commit、push；前三項依派工由
  驗收方 ACCEPTED 時原子完成。
- 建議：playerDirectory 下一批採 §8.5 的逐 stableId 三點表與 nested handler frozen 清單；
  E-6 本身無需改計畫。
- 疑義：無。
- BLOCKED：無。
