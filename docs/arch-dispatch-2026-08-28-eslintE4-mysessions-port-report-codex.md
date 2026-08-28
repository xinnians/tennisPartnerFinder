# ESLint 恢復 Phase E-4：mySessions controller ports 4 筆＋G1/G2 回報（Codex）

- 日期：2026-08-28
- 開工 HEAD：`7b77ef8`；開工基準 parent：`e5ca551`（E-3 ACCEPTED）
- 開工狀態：`git status --porcelain` 無輸出。
- 結論：完成；交件維持 generator 紅簽章，未改 ledger、未重生 manifest、未 commit、未 push。
- BLOCKED：無。

## 1. 實作範圍

1. `src/controller/mySessionsController.ts`：只把
   `MySessionsControllerDependencies` 的四個 method signatures 改成 function properties。
2. `eslint.config.js`：Phase E scoped files 只追加精確路徑
   `src/controller/mySessionsController.ts`，並保持字典序；沒有 glob。
3. `scripts/generate-eslint-unbound-manifest.mjs`：只加入 G1 baseline bytes SHA pin 與
   G2 ledger `acceptanceDoc` 存在性檢查。

沒有修改 `sessionController.ts` construction site、其他 source、tests、baseline、ledger、
兩份 manifest、TS/package/lockfile、全域 off、databaseTypes override 或 bundle gate。

## 2. 四筆 scope 與 construction site 重驗

由 HEAD manifest 實際篩選結果：

```text
count=4
ebf46214044c39a47782e9fbb01a152a 88:3 onMySessionsChange factory:createMySessionsController
1957d00e0e6a2cb919662ff63d65c0c4 90:3 reconcileActiveChatParticipation factory:createMySessionsController
df2cdcfc865e2bfed69286f2c866996f 91:3 reconcileActiveDetailParticipation factory:createMySessionsController
bcb22c134f491515ce57c49fe82f1c8a 94:3 toast factory:createMySessionsController
```

`rg -n "createMySessionsController" src tests` 的 source 命中為：

```text
src/controller/mySessionsController.ts:85:export function createMySessionsController({
src/sessionController.ts:24:import { createMySessionsController } from "./controller/mySessionsController.ts";
src/sessionController.ts:48:type MySessionsControllerOptions = Parameters<typeof createMySessionsController>[0];
src/sessionController.ts:68:  action: ReturnType<ReturnType<typeof createMySessionsController>["actionFor"]>;
src/sessionController.ts:302:  const mySessionsController = createMySessionsController({
```

因此只有 `sessionController.ts:302` 一個 construction site；`:24` 是 import、`:48/:68`
是型別推導、controller 檔本身是 declaration。`sessionController.ts:302-312` object literal
shorthand 原文零 diff；沒有第二個 construction site。

## 3. 修改後 `:50-60` 原文

```ts
interface MySessionsControllerDependencies {
  api: MySessionsDataApi;
  blockedPlayerGate: ControllerRequestGate;
  onMySessionsChange: (state: ControllerMySessionsViewState) => void;
  participationGate: ControllerRequestGate;
  reconcileActiveChatParticipation: () => void;
  reconcileActiveDetailParticipation: () => void;
  rosterGate: ControllerRequestGate;
  store: Store<SessionControllerState, ControllerEventName>;
  toast: (message: string) => void;
}
```

成員順序、參數名與其餘五個 property signatures 未動；factory destructure、closure
implementations、object literal shorthand、呼叫順序與 callback identity 均未動。

selector 修改後原文：

```js
files: ["src/controller/mySessionsController.ts", "src/map.ts"],
```

## 4. generator G1／G2 強化

### 4.1 G1 baseline 完整性

新增固定值：

```js
const BASELINE_SHA256 = "14e56a1675ccf4939f2e0bc3e2685070b325a32a75ef778ea1ffa45b018fd207";
```

`loadLedgerState` 進入後先獨立 `readFileSync(BASELINE_PATH)` 取得原始 bytes，先算 SHA，
不符就 throw `baseline file drifted ...`；該步在 `readJson`、TypeScript program 與 ESLint
scan 之前。

### 4.2 G2 acceptanceDoc 存在性

每一 ledger row 在相對 repository path schema 通過後，執行：

```js
existsSync(path.join(ROOT, removal.acceptanceDoc))
```

缺檔即指名 row index 與原始 acceptanceDoc path。未新增依賴；`node:fs` 只追加
`existsSync` import。

改造後、尚未改 source 時的正常成功行逐字：

```text
eslint unbound manifest check passed: 244 findings/27 files; sessionController 63; duplicates 0; unresolved declarations 0; sha256:ce5a3e8a82e75dca710449d1c2d9c549448831573891cf6ffec230e380ccdd30
```

## 5. G1／G2 canary：紅 → SHA 還原 → 綠

所有 canary 均在 source 修復前執行；先抄 SHA，只用精確 `apply_patch` 修改／反向修改，
沒有使用 `git checkout`。兩次錯誤都發生在 writeFileSync 前，manifest 未被寫入。

### 5.1 G1 baseline 暫改一 byte

暫把 header `sourceCommit` 的 `77365a0` 改為 `77365a1`。exit 1 的核心輸出逐字：

```text
Error: baseline file drifted: expected sha256 14e56a1675ccf4939f2e0bc3e2685070b325a32a75ef778ea1ffa45b018fd207; received 5ebff92cf6779799d2716422f9af77563c8b8814e082a1af2f57fd4a7bb3e008
```

沒有 parse、scan 或 hard-gate 的第二項錯誤。第一次反向 patch 恢復字面後，SHA gate
另外抓到原檔 EOF 有雙換行、patch 中間態只剩單換行；沒有把這個 SHA 差異當作已還原。
再以 patch 精確補回原 EOF bytes 後，結果為：

```text
14e56a1675ccf4939f2e0bc3e2685070b325a32a75ef778ea1ffa45b018fd207  docs/arch-eslint-phaseE-baseline.json
eslint unbound manifest check passed: 244 findings/27 files; sessionController 63; duplicates 0; unresolved declarations 0; sha256:ce5a3e8a82e75dca710449d1c2d9c549448831573891cf6ffec230e380ccdd30
```

最終 `git diff -- docs/arch-eslint-phaseE-baseline.json` 無輸出。

### 5.2 G2 acceptanceDoc 不存在

暫把第一筆 acceptanceDoc 改為形狀合法但不存在的 `.missing.md`。exit 1 核心輸出逐字：

```text
Error: removal ledger.acceptedRemovals[0] acceptanceDoc does not exist: docs/arch-reports/eslintE2-map-callback-default-acceptance-2026-08-28.missing.md
```

精確還原後：

```text
2fd1093815fa3fd302a3b82bc0d498c910e11f325814f7597e626e334d40bca6  docs/arch-eslint-phaseE-removal-ledger.json
eslint unbound manifest check passed: 244 findings/27 files; sessionController 63; duplicates 0; unresolved declarations 0; sha256:ce5a3e8a82e75dca710449d1c2d9c549448831573891cf6ffec230e380ccdd30
```

最終 `git diff -- docs/arch-eslint-phaseE-removal-ledger.json` 無輸出。

## 6. 規則有牙三拍

候選 source 與 selector 完成後，第一次 `npm run lint` 無診斷、exit 0。候選 source SHA：

```text
9ae9c431d562960732bd29e484c6bc0fd5369ed3bfc32d253538f4948d155376  src/controller/mySessionsController.ts
```

保持 selector 上線，只暫退四行為 method signatures；`npm run lint` exit 1，紅四筆逐字：

```text
/Users/ian/tennisPartnerFinder/src/controller/mySessionsController.ts
  88:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. 
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  90:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. 
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  91:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. 
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  94:3  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. 
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method

✖ 4 problems (4 errors, 0 warnings)
```

反向 patch 精確恢復候選後：

```text
9ae9c431d562960732bd29e484c6bc0fd5369ed3bfc32d253538f4948d155376  src/controller/mySessionsController.ts
```

第二次 `npm run lint` 無診斷、exit 0。恰四筆、恰四個指定行號，沒有其他 rule 或
第五筆錯誤。

## 7. generator 紅簽章（交件狀態）

獨立執行：

```sh
node scripts/generate-eslint-unbound-manifest.mjs
```

exit 1；排除標頭與 stack trace後，錯誤恰六條、順序逐字：

```text
Error: manifest hard gate failed:
- expected finding missing from current scan: ebf46214044c39a47782e9fbb01a152a (src/controller/mySessionsController.ts)
- expected finding missing from current scan: 1957d00e0e6a2cb919662ff63d65c0c4 (src/controller/mySessionsController.ts)
- expected finding missing from current scan: df2cdcfc865e2bfed69286f2c866996f (src/controller/mySessionsController.ts)
- expected finding missing from current scan: bcb22c134f491515ce57c49fe82f1c8a (src/controller/mySessionsController.ts)
- findings expected 244, received 240
- files expected 27, received 26
```

沒有 sessionController 或 scope-gate 錯誤；hard gate 依 G6 先 throw。generator 在寫檔前
失敗，兩份 frozen manifest SHA 維持 HEAD：

```text
e2099713807801adcf0705dc71fb47cc52e99d769cfbb3b1c8036c8d05f10604  docs/arch-eslint-phaseE-unbound-manifest.json
5019bda46756fa6eb0825bcae7808080a2a7c0a45655143d5f2fcaa36918d005  docs/arch-eslint-phaseE-unbound-manifest.md
```

## 8. erased-token 對帳

以 `esbuild.transform` 同時處理 `git show HEAD:src/controller/mySessionsController.ts` 與
working tree source，兩邊參數完全相同：loader `ts`、format `esm`、target `esnext`、
`minifyWhitespace: true`、`treeShaking: false`。

輸出逐字：

```text
HEAD bytes=8851 sha256=13bf75b0b3579431b2af8950cf4a3c0feb69bba1a5bd14d51d9589bbb86bb026
current bytes=8851 sha256=13bf75b0b3579431b2af8950cf4a3c0feb69bba1a5bd14d51d9589bbb86bb026
byteEqual=true
```

因此四行改動為零 runtime token；沒有 wrapper、`.bind()`、新 arrow、identity 或行為變更。

## 9. 收尾矩陣

| Gate | 實跑結果 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 正常候選兩次皆無診斷、exit 0；暫退 canary 恰 4 errors |
| `npm run prettier:check` | `All matched files use Prettier code style!`；exit 0 |
| `npm run test:session-unit` | tests 346；pass 346；fail 0；exit 0 |
| `npm run test:mock` | 298 passed；4 skipped；exit 0 |
| `npm run test:local` API | tests 2；pass 2；fail 0 |
| `npm run test:local` Chromium | 45 passed；11 skipped；exit 0 |
| `npm run build` | 508 modules transformed；exit 0 |
| `npm run check:production-bundle` | main `638937/187466`；total JS `841561/257627`；exit 0 |
| bundle 對照 | main gzip `187466 − 187466 = 0 B`；total gzip `257627 − 257627 = 0 B` |
| erased-token | HEAD/current 8,851 bytes、SHA 相同、byteEqual true |
| generator 交件 | 預期 exit 1；恰六條紅簽章 |
| `git diff --check` | 無輸出、exit 0 |

`test:local` 首跑即綠，因此沒有執行 DB count 或 guarded reset。unit/mock 前置 unit 有既有、
非致命 `WebSocket server error: Port 24678 is already in use`，最終計數及 exit 0 不受影響，
沒有 retry。build 只有既有 >500 kB chunk warning。

production bundle 成功行逐字：

```text
production bundle check passed: development E2E hook present, production E2E hook absent; 32 files, 12 demo identifiers absent; main 638937/187466 within 658867/192420; largest app lazy MySessionsPage-Byp_C9FO.js 16476/4828 within 18000/5500; total JS 841561/257627 within 849961/259062; private repository: privateDataRepository-CfJqlfj0.js; Sentry: sentryBrowserSdk-Czz5dmkg.js
```

最終 frozen status（baseline、ledger、manifest、`sessionController.ts`、tests、
TS/package/lockfile）無輸出、exit 0。全庫 porcelain 恰四條，逐字：

```text
 M eslint.config.js
 M scripts/generate-eslint-unbound-manifest.mjs
 M src/controller/mySessionsController.ts
?? docs/arch-dispatch-2026-08-28-eslintE4-mysessions-port-report-codex.md
```

tracked diff stat 逐字：

```text
 eslint.config.js                             |  2 +-
 scripts/generate-eslint-unbound-manifest.mjs | 11 ++++++++++-
 src/controller/mySessionsController.ts       |  8 ++++----
 3 files changed, 15 insertions(+), 6 deletions(-)
```

最終候選 SHA：

```text
ce6808be54a596f0c4d0d92b2a23bda170764d6d623ba1b0e20e1dac500852ae  scripts/generate-eslint-unbound-manifest.mjs
9ae9c431d562960732bd29e484c6bc0fd5369ed3bfc32d253538f4948d155376  src/controller/mySessionsController.ts
8ac14401ccd5016223707e5329efa4559e7fc153b49ebda76d5f7912463a7e03  eslint.config.js
14e56a1675ccf4939f2e0bc3e2685070b325a32a75ef778ea1ffa45b018fd207  docs/arch-eslint-phaseE-baseline.json
2fd1093815fa3fd302a3b82bc0d498c910e11f325814f7597e626e334d40bca6  docs/arch-eslint-phaseE-removal-ledger.json
e2099713807801adcf0705dc71fb47cc52e99d769cfbb3b1c8036c8d05f10604  docs/arch-eslint-phaseE-unbound-manifest.json
5019bda46756fa6eb0825bcae7808080a2a7c0a45655143d5f2fcaa36918d005  docs/arch-eslint-phaseE-unbound-manifest.md
```

## 10. Codex 五問

### 1. 如何證明本批恰好修四筆、沒有多殺或漏殺？

HEAD manifest 對 `mySessionsController.ts` 的查詢恰四筆且單一 owner，stable ID、行列與
expression 全符。修復後 generator 強制掃描只少這四 ID，摘要只由 244/27 變成
240/26，紅簽章恰四個 missing ID 加兩個 derived-count 行；沒有 unexpected、session 或
第五筆。lint 暫退又精準恢復四筆，因此 scan 與真實 scoped config 兩條路徑互相佐證。

### 2. 如何證明 construction／runtime／callback identity 沒變？

全庫 source 只有 `sessionController.ts:302` 一個 construction call；該 object literal、
factory destructure、四個 closure implementations 與實際 call sites都零 diff。source diff
只改 interface punctuation，esbuild 擦除後 HEAD/current 完整 8,851 bytes 與 SHA 都相同。
沒有新增 wrapper、bind、arrow、memo/effect dependency 或 cleanup。

### 3. G1/G2 守門是否真的 fail closed，且沒有改 manifest 語意？

G1 在 JSON parse 前以原始 bytes SHA 阻止 baseline 漂移，連 EOF newline 差異都會紅；G2
逐 row 驗 acceptance record 真實存在。兩個 canary 都在 program/scan/write 前單一失敗，
還原後既有 244/27/63 check 綠。除 import、SHA constant、一次 raw read、exists check 與
兩個 throw 分支外 generator 零 diff；render/checksum/hard/scope gate 與 manifest bytes 未動。

### 4. 為何交件時 generator 紅仍是正確完成狀態？

ledger 只記 ACCEPTED removals，本批實作者不能預先追加。current scan 已少四筆，但 ledger
仍只含 E-2 兩筆，所以集合等式按設計以六行紅簽章證明「候選修復存在、尚未被接受記帳」。
驗收方建立 acceptance record、原子追加 E-4 四筆、重生 manifest 後，expected/current 才會
同為 240/26/63，並首次跑到 scope gate 驗 mySessions 檔 error。這不是未完成 gate，而是
實作與接受權責的機械簽章。

### 5. 下一個 consumer 檔如何沿用；factory results 63 的 scoped 空窗怎麼處理？

現行 manifest 顯示 `src/controller/discoveryMapController.ts` 恰六筆、同一 factory owner：

```text
1ed8b19ddfae0cdc2ecf7234a2069d51 96:3 getPlayerGroups
545214c04e96dec6589b97408d383638 97:3 loadPlayers
1b8f9d6f4ff0613167cf9610203242ee 99:3 reconcileActiveDetail
4ef06f27267ec8414004d40a450e2bcb 100:3 render
68f6f0bc444c826ad20bd5d2bb8a505c 101:3 renderPins
34af30da673a2ea64bbfff5a73fb2e16 102:3 renderPlayers
```

下一批可沿用同一模板，但先重驗 `createDiscoveryMapController` 唯一 construction site
（目前 direct call 在 `sessionController.ts:363`）及六種參數／Promise 回傳型別。只改
`DiscoveryMapDependencies` 六個 method signatures；整檔 6→0 後把精確 path 依字典序加進
scoped array。候選紅簽章應為六個 missing ID，再加 findings 240→234、files 26→25；
驗收方 ACCEPTED 時才追加六筆 ledger、重生 234/25/63。lint canary 要暫退六行並恰紅六筆；
erased-token、local 與 bundle 流程原樣複用。G1/G2 已是常駐守門，不需每批再改 generator，
但 canary 可在驗收時抽驗。

factory results 63 全報在 `src/sessionController.ts`，不能在中間子批把該 path scoped 上線：
只要還有一筆，真 config 開 error 就會使正常 lint 紅，generator 的 reverse assert 也會拒絕。
建議按 E-1 family/owner 切小批，每一接受批都由驗收方追加該批 stable IDs 到 ledger；
`sessionController.ts` 保持全域 off，不進 scoped array，直到第 63 筆清零的最後一批才在
generator 前加入精確 path。

中間的 npm-lint scope 確實尚未覆蓋該檔，但不是無守門：generator 每次都以 memory override
強制掃描 `sessionController.ts`，並要求 current stable-ID set 恰等於 baseline − accepted
ledger。已接受的 ID 若回流會成為 `unexpected current finding outside baseline-minus-ledger`，
未修 ID 若意外消失則成為 missing；每個候選批再用 method-signature 暫退與強制 scan 數量
驗 rule 有牙。最後 63→0 時同一候選同時加入 selector；接受方 ledger 原子追加後，hard gate
通過並首次讓 scope gate 驗該檔 effective error。這以 ledger 強掃補住持久守門，以批次 canary
補住真 config 尚未上線的 lint 空窗。

## 11. 未做／疑義／BLOCKED

- 未做：ledger E-4 四筆追加、manifest 重生／`--check` 綠、驗收紀錄、其他 236 筆 finding、
  其他 controller ports、factory results、tests/source 擴改、commit、push；前四項依派工由
  驗收方 ACCEPTED 時原子完成。
- 疑義：無；派工單已明確拍板紅簽章交件與 ledger 權責。
- BLOCKED：無。
