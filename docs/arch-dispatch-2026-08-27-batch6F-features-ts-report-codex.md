# 批 6F 回報：features 兩檔 TS 化＋type-aware ESLint 恢復方案

- 日期：2026-08-27
- 開工 HEAD：`e15ef67`（其 parent `9bdb320` 為批 6E ACCEPTED）
- 結果：**完成，未 BLOCKED**
- Git：未 commit、未 push；working tree 留給驗收方

## 1. 結論與範圍

依指定順序完成：

1. `src/features/presence/presenceFeature.js` → `presenceFeature.ts`。
2. `src/features/profile/profileOrchestrationFeature.js` →
   `profileOrchestrationFeature.ts`。
3. 新增 `docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md`，只落未來拆批方案，
   沒有恢復規則。
4. `src/main.js` 僅同步兩個 static import suffix。

兩個 runtime 檔均為 annotation-only：舊 JS／新 TS 經 esbuild 擦除後逐 byte 全等，
production bundle 也為 raw／gzip 淨 0 B。沒有新增 `any`、`@ts-ignore`、
`eslint-disable`、fallback dependencies、動態 import edge、依賴或設定變更。

派工單有一項 ground-truth 算術誤差：profile 段寫「恰 20 成員」，但同段實際列出 21 名，
原始碼也實際使用該 21 名。本批沒有刪掉任何真實依賴來迎合數字，而是建立 21-member
tolerant port；完整名單見 §3.2。

## 2. annotation-only 與 erased-token 自證

比較方式：從 HEAD 讀舊 `.js`，以 esbuild JS loader 擦除；working tree 新 `.ts` 以 TS
loader 擦除。兩者均使用 `format: "esm"`、`minifyWhitespace: true`、
`target: "esnext"`、`treeShaking: false`，再比 bytes 與 SHA-256。

```text
{"file":"src/features/presence/presenceFeature.ts","equal":true,"oldBytes":3665,"newBytes":3665,"oldHash":"780462110236edce141f489d96950c4e44c0a67e48d34799aca9b041ec264411","newHash":"780462110236edce141f489d96950c4e44c0a67e48d34799aca9b041ec264411"}
{"file":"src/features/profile/profileOrchestrationFeature.ts","equal":true,"oldBytes":8140,"newBytes":8140,"oldHash":"cfcfe1a08418e54cff7252a8e0eeec1ec5744d3064cde947db7f712ac4df4f41","newHash":"cfcfe1a08418e54cff7252a8e0eeec1ec5744d3064cde947db7f712ac4df4f41"}
EXIT_CODE=0
```

因此沒有 runtime-token 例外表。型別、interface、assertion、generic 與 suppression comment
刪除皆可擦除；所有原錯誤／toast 字面、預設值、分支、賦值順序與 closure 均保留。

禁止逃生語法反掃：

```text
$ rg -n '\bany\b|@ts-ignore|eslint-disable' \
  src/features/presence/presenceFeature.ts \
  src/features/profile/profileOrchestrationFeature.ts
(no output)
EXIT_CODE=1
```

## 3. dependencies port 設計

### 3.1 `PresenceFeatureDependencies`（11 members）

檔內最小 port 精確保留實際注入面：

```text
captureAuthRequest
currentProfileEligibility
defaultProfile
getAppState
getLocationStatus
openProfileCompletion
publishMePageView
publishMeSettingsPageView
setLocationStatus
setProfile
toast
```

`dependencies` 維持未初始化的 module-level binding；未先 configure 的 runtime failure 契約
不變。`presenceTracker` 使用最小 structural type `{ start(): boolean; stop(): void }`。
由於 JS `createPresenceTracker` 對 default callback 推導為零參數，呼叫點只加 erasable
function assertion，沒有轉 `playerPresence.js`，也沒有 wrapper 或 fallback object。

### 3.2 `ProfileOrchestrationDependencies`（21 members）

實際 21 名如下：

```text
captureAuthGateRequest
captureAuthRequest
currentAuthAvatarUrl
currentProfileEligibility
defaultProfile
getActivePage
getAppState
getController
invalidateAuthRequests
localDemoUnavailable
openLoginModal
openProfileCompletionSheet
reconcilePageRouteOwner
reconcilePresenceTracking
resetNotificationSettings
resetPresenceTracking
seedAllTaipeiCourtSubscriptions
setAuthSession
setProfile
showMePage
toast
```

這是依檔內使用面建立的 tolerant port，沒有從 `main.js` 反推巨型 application interface。
`ControllerApi`、`ControllerAuthSession`、`ControllerProfileEligibility`、
`ControllerAppState` 與 surface contract 均以 `import type` 重用；auth provider 與 profile
draft 則由 `dataApi.ts` function parameter 推導。

主要 narrowing 均只用 erasable 型別完成：module-load `bootAuthParams` IIFE 原樣；
`authIdentity` 保留 tolerant `unknown` 入口與 optional-chain 行為；
`activeProfileCompletion`／`mounted` self-reference closure、auth candidate serialization、
profile revision/status state machine、`sessionStorage` try/catch 及
`querySelector<HTMLElement>()?.focus()` 的 runtime 次序不變。

## 4. profile 原 `:59` suppression 處置

before：

```js
// eslint-disable-next-line no-useless-assignment -- inherited JS lint debt; the guarded storage access is intentional.
let provider = null;
```

after：

```ts
let provider: string | null = null;
```

只刪除 comment 並加入 erasable type；`try` 內第二次賦值、`sessionStorage` guard 與 runtime
初始化完全保留。最終 `npm run lint` exit 0，沒有 `prefer-const`、
`no-useless-assignment` 或 unused directive 問題。

## 5. importer 與 frozen surface

`src/main.js` 僅有兩行 suffix 同步：

```text
src/main.js:129:} from "./features/profile/profileOrchestrationFeature.ts";
src/main.js:136:} from "./features/presence/presenceFeature.ts";
```

`eslint.config.js`、`tsconfig.json`、`package.json`、`package-lock.json`、
`controllerContracts.ts`、`dataApi.ts`、`domainTypes.ts`、`playerPresence.js`、測試與 bundle
gate 均零 diff。沒有修改 `src/main.js` 其他內容。

dynamic test hook 對帳：

```text
$ rg -o 'window\.__importAppModule' src tests | wc -l
110
```

與基準 110 相同；兩名 feature 都沒有新增 dynamic edge。

## 6. strict 納入探針 ×2

### 6.1 presence

探針前 SHA-256：

```text
9d42411546b6c2f383b3d08109e78a14e2f08ed47661b63621bdda9db04d0cd2  src/features/presence/presenceFeature.ts
```

暫加 `const probe: number = "x";`：

```text
src/features/presence/presenceFeature.ts(10,7): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT_CODE=2
```

移除後 SHA-256 回到
`9d42411546b6c2f383b3d08109e78a14e2f08ed47661b63621bdda9db04d0cd2`，
`npm run typecheck` exit 0。該 SHA 是逐檔探針當下、最終 Prettier 前的來源；還原本身為
byte-identical，最終 runtime 等價另由 §2 的 post-format token hash 證明。

### 6.2 profile

探針前 SHA-256：

```text
6a4dafa5c6e7b3fe7c0a47c6b3af00377c6726f833e5f276c28babf97c04439f  src/features/profile/profileOrchestrationFeature.ts
```

暫加 `const probe: number = "x";`：

```text
src/features/profile/profileOrchestrationFeature.ts(27,7): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT_CODE=2
```

移除後 SHA-256 回到
`6a4dafa5c6e7b3fe7c0a47c6b3af00377c6726f833e5f276c28babf97c04439f`，
`npm run typecheck` exit 0；同樣是探針當下 byte-identical 證據。

## 7. 行為覆蓋盤點（逐 export）

兩檔沒有被 unit test 直接 import；`tests/player-presence.test.js` 的 2 tests 直接載重的是仍
凍結的 `playerPresence.js` tracker。feature orchestration 的直接 runtime 載重來自完整
main bootstrap 後的 mock／local journeys。未啟用 branch coverage，以下不宣稱每一 tolerant
catch/default 都有獨立 case。

| export                                 | consumer／載重證據                                                                         | 判定                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `configurePresenceFeature`             | `main.js` bootstrap；所有 presence mock/local journey                                      | 間接覆蓋                                 |
| `presenceSettingsForProfile`           | 除宣告外無 consumer                                                                        | **零覆蓋 export**                        |
| `stopPresenceTracking`                 | 檔內由 reset/reconcile/update paths 呼叫；local `1319`、`1377`、`1465`                     | 間接覆蓋，無外部 consumer                |
| `resetPresenceTracking`                | `main.js` 注入 profile orchestration；auth/account reset journeys                          | 間接覆蓋                                 |
| `reconcilePresenceTracking`            | `main.js`、profile reload/save；local `1465` reciprocal presence                           | 覆蓋                                     |
| `updatePresenceSharing`                | `main.js` Me action；account-settings `:3`、`:155`，local `1319`、`1377`、`1465`           | 覆蓋                                     |
| `updateOpenToGreetingSetting`          | `main.js` Me action；account-settings presence settings，local `1421` gate                 | 覆蓋                                     |
| `configureProfileOrchestrationFeature` | `main.js` bootstrap；所有 auth/profile journeys                                            | 間接覆蓋                                 |
| `authIdentity`                         | `main.js` request/page-owner gates及檔內三次 identity recheck；local account/auth journeys | 覆蓋                                     |
| `isProfileReady`                       | `main.js` controller/profile gate；auth restore與save journeys                             | 覆蓋                                     |
| `currentLinkedProviders`               | 僅 `resumeLinkReturn` 內部使用；無外部 consumer                                            | 間接覆蓋；export binding 無直接 consumer |
| `handleLinkProvider`                   | `main.js` Me action；auth-forms `:77` login methods wiring                                 | 覆蓋                                     |
| `openSafeLogin`                        | `main.js` auth gates；auth-forms `:3`、`:34`、`:121`，local `:264`                         | 覆蓋                                     |
| `handleSignOut`                        | `main.js` Me action；local `:1161` sign-out journey                                        | 覆蓋                                     |
| `openProfileCompletion`                | `main.js` gates/edit；auth-forms profile cases、account-settings `:367`、local `:320` 等   | 覆蓋                                     |
| `reloadCurrentProfile`                 | `main.js` bootstrap/controller callback；local `:432` stale read及save/restore journeys    | 覆蓋                                     |
| `handleAuthIdentityChange`             | controller callback；account switch與local signed-out bootstrap                            | 間接覆蓋                                 |
| `restoreAuth`                          | `main.js` boot；local `:1593`、`:1624`、`:1640` late auth restore                          | 覆蓋                                     |

載重矩陣摘要：

- unit：346 passed；其中 tracker direct unit 2 passed，profile feature 無 direct unit import。
- mock：auth provider、link wiring、profile gate/save、standalone edit、presence failure/settings/
  online layer；298 passed、4 skipped。
- local：login gate、signed-out bootstrap、profile save/stale read、account sign-out、presence
  controls/gates/reciprocal visibility、late auth restore、standalone edit、court subscription seeding；
  API 2 passed，browser 45 passed／11 skipped。

## 8. type-aware ESLint 恢復方案

新增的 plan 以現行 flat config 的記憶體 override 重掃 `src/**/*.{ts,tsx}` 與
`vite.config.ts`；未寫暫存 config，正式 `eslint.config.js` 零 diff。總計 325 findings，
本批兩個新 `.ts` 均為零 finding：

| 規則                             | findings / files |
| -------------------------------- | ---------------: |
| `no-redundant-type-constituents` |            9 / 6 |
| `no-unnecessary-type-assertion`  |           10 / 8 |
| `no-unsafe-return`               |            8 / 2 |
| `no-unsafe-call`                 |            5 / 3 |
| `no-unsafe-member-access`        |           25 / 4 |
| `no-unsafe-assignment`           |           12 / 7 |
| `no-base-to-string`              |            8 / 4 |
| `no-unsafe-argument`             |            2 / 1 |
| `unbound-method`                 |         246 / 28 |

方案落成五段：A 小量 unsafe argument/call/return；B redundant/assertion 純型別；C
assignment/member-access 資料邊界；D base-to-string UI policy；E unbound-method 專批。
`unbound-method` 已抽樣區分 React callback/context/controller closure 高機率 false positive、
surface/repository 待查與 API method this-sensitive 高風險；正式執行前須做完整 246 筆
classification manifest。

`databaseTypes.ts` 為 generated 檔，plan 建議先用具 generated header 的 scoped override，
handwritten TS 先恢復；generator 後處理只有在可證明可重生且 deterministic 時才採用，
不直接手改 generated output。這些都仍是待拍板方案，本批沒有實作。

## 9. 反掃與 bundle 對帳

### 9.1 舊 suffix

```text
$ rg '(presenceFeature|profileOrchestrationFeature)\.js' \
  src tests CLAUDE.md README.md .claude/rules eslint.config.js
(no output)
EXIT_CODE=1
```

開工複驗與收尾都沒有兩名的 `__importAppModule`、`readFileSync`／URL seal 或文件／規則
字面；因此沒有解凍額外 importer、fixture、comment 或 docs。

### 9.2 bundle

基準與最終完全相同：

```text
main: 638937 raw / 187466 gzip (淨值 0 / 0 B)
total JS: 841561 raw / 257627 gzip (淨值 0 / 0 B)
largest app lazy: MySessionsPage-Byp_C9FO.js 16476 / 4828
private repository: privateDataRepository-CfJqlfj0.js
Sentry: sentryBrowserSdk-Czz5dmkg.js
```

total gzip 仍低於 gate 1,435 B；沒有使用餘裕。

## 10. 收尾標準矩陣

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
✓ built in 1.22s
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
298 passed (52.6s)
EXIT_CODE=0

$ npm run test:local
# local API: 2 passed, 0 failed
# Supabase Chromium: 11 skipped, 45 passed (1.4m)
EXIT_CODE=0

$ git diff --check
(no output)
EXIT_CODE=0

$ rg '(presenceFeature|profileOrchestrationFeature)\.js' src tests CLAUDE.md README.md .claude/rules eslint.config.js
(no output)
EXIT_CODE=1
```

獨立重跑 unit 時出現一次非致命 `WebSocket server error: Port 24678 is already in use`；
346/346 與 aggregate exit 仍為 0，未 retry。mock/local 無污染紅、guarded reset 或 retry。

## 11. Codex 五問

### 1. 如何證明不是只改副檔名？

presence 建立 11-member port、tracker/callback structural types；profile 建立 21-member
tolerant port並重用 controller/domain contracts，所有 public function、module state、surface
callback、auth candidate 與 tolerant input 都進 strict typecheck。兩個故意錯型探針均精準
指名新 `.ts` 後 byte-identical 還原。

### 2. 如何證明 dependencies 與 auth/presence 時序沒有被改窄？

ports 只描述原檔實際呼叫面；module-level `dependencies` 都沒有 fallback 初始化。
`bootAuthParams` 仍在 module load 擷取，profile revision/load/stored state、mounted closure、
latest candidate serialization、presence stale request與 tracker start/stop 次序均保留。
最強機械證據是兩檔擦除後 bytes/hash 全等；mock/local 再載重 auth、profile、presence journey。

### 3. suppression 與字面如何守住？

只移除原 `:59` suppression comment，`let provider = null` runtime token 不變，lint 綠且沒有
其他 ruleset 衝突。兩檔擦除後全等代表所有 throw/toast 字面也逐 token 保留；沒有新增
inline disable、`any` 或 ignore。

### 4. 目前還有哪些覆蓋或設計限制？

`presenceSettingsForProfile` 是明確零 consumer／零覆蓋 export；
`currentLinkedProviders` 與 `stopPresenceTracking` 只有檔內 consumer，沒有直接 import test。
feature 本體也沒有 direct unit import；目前信心來自 runtime token 全等、main bootstrap 的
mock/local journeys及底層 tracker unit，不宣稱 branch coverage。profile dependency 數字的
20/21 矛盾已依原始碼修正為 21，這是派工文件算術問題，不是 runtime scope 擴張。

### 5. 批 6 收官盤點與下一條管線建議

對照 roadmap 與已拍板的 6F 調整，批 6 核准的核心 TS 轉換 A–F 已完成；本批原先可能
連帶的九條 ESLint 規則恢復已明文移出，故那 325 findings 是後續工作，不是本批缺件。
`main.js`、`sessionViews.js`／四個 legacy view、mock data與 Supabase bootstrap 也仍是刻意
保留的後續邊界。

「可隨鄰批」九檔建議優先序：

1. `playerPresence.js`：直接消除本批 presence 的 JS callback 推導 assertion，且已有 direct unit。
2. `focusableSelector.js`：2 行 constant，已有兩個 TSX consumer，最小風險先封邊。
3. `meFocus.js`：兩個 TS consumer與 direct unit，能移除 presentation/action 的 JS edge。
4. `sessionRoute.js`：7 行 pure parser、已有 direct unit，容易做 token 全等。
5. `notificationPush.js`：notification TS 的直接 dependency且有 unit；因 Web Push/API boundary，晚於 pure helpers。
6. `modalIsolation.js`：`sheets.ts` 的直接 dependency，但牽涉焦點與 isolation lifecycle，需完整 surface tests。
7. `features/filters/filterToolbarFeature.js`：main feature port，適合在 callback contract 穩定後處理。
8. `features/share/shareFeature.js`：main-only orchestration，與 entrypoint 收尾相鄰。
9. `util.js`：目前只服務 legacy `sessionViews.js`，留給 view facade 批可減少重複 suffix churn。

下一條管線建議先做 ESLint 恢復 Phase A（2 unsafe-argument＋5 unsafe-call＋8
unsafe-return），再做上述小型 JS boundary 批，最後才碰 `main.js/sessionViews`。理由是核心 TS
面已穩定，先修最小量資料/call boundary 可建立更可信的型別基線，也避免 main/view 大檔在
九條規則仍關閉時擴大 findings；`unbound-method` 246 筆則必須維持最後獨立專批，不能與
entrypoint 轉換混做。

## 12. 未做、疑義與 BLOCKED

- 未做：九條 ESLint 規則實際恢復、九個鄰接 `.js` 轉換、`main.js`／legacy views 收尾、
  拆檔、新依賴、UX／文案／資料行為變更、設定或測試語意變更。
- 疑義：派工單 profile 依賴數寫 20、實列及實際使用為 21；已按 ground truth 實作並明列。
- runtime 改寫裁決點：無；全檔 lint 沒有 `prefer-const` 類衝突。
- BLOCKED：無。
- Git：未 commit、未 push。
