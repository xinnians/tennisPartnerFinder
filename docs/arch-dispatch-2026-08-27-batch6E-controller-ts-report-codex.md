# 批 6E 回報：`sessionController.ts` 組裝層機械轉換

- 日期：2026-08-27
- 開工 HEAD：`c3ebf27`（前批 6D：`eb9c73e` ACCEPTED）
- 結果：**完成，未 BLOCKED**
- Git：未 commit、未 push；working tree 留給驗收方

## 1. 結論與範圍

`src/sessionController.js` 已直接轉為 `src/sessionController.ts`，未拆檔。兩個 runtime
export `groupMySessions`／`createSessionController`、27 個 factory option、所有預設值、
執行順序、閉包與字面均保留。

永久變更只有：

1. 主檔改名、檔內型別宣告與 erasable annotation。
2. 5 個 static importer 的副檔名同步。
3. `tests/fixtures/appRuntime.js` 新增 `sessionController: ".ts"`。
4. 9 個核准位置的註解／文件副檔名字面同步。
5. 刪除原 `:574` 的既存 JS-only lint suppression 註解；下一行 runtime 原樣保留。

沒有改 `src/controller/**` 的 runtime／contract、`sessionStore.ts`、`domainTypes.ts`、
測試斷言語意、ESLint／TypeScript／package 設定或 bundle gate。

## 2. annotation-only 與 erased-token 自證

使用 esbuild 分別以 JS／TS loader 擦除 HEAD 的舊檔與 working tree 新檔，再以
`format: "esm"`、`minifyWhitespace: true`、`target: "esnext"`、
`treeShaking: false` 正規化。結果逐 byte 全等：

```text
{"equal":true,"oldBytes":19820,"newBytes":19820,"oldHash":"531a0d3263ebd5e2cb51940259daf792026177632585db7f530be85394df8fa0","newHash":"531a0d3263ebd5e2cb51940259daf792026177632585db7f530be85394df8fa0"}
EXIT_CODE=0
```

因此本批沒有 runtime-token 例外，不需正規化例外表；刪除 suppression 與 JSDoc 都是
comment-only，其餘新增內容全可擦除。production bundle 也以相同 chunk hash／bytes
交叉確認淨值 0 B。

## 3. `SessionControllerOptions` 與 data port 設計

### 3.1 tolerant factory option

檔內 `SessionControllerOptions` 保留全部 27 個 optional member：

- `api`、`mapTools`。
- 20 個 callback：`render`、`renderPins`、`renderPlayers`、`openSession`、
  `openCourtDrawer`、`openCourtPlayersDrawer`、`openPlayerDirectoryList`、
  `openPlayerCard`、`openCreateSession`、`openDecideSession`、`openEditSession`、
  `openChat`、`openLogin`、`openReport`、`openWithdrawConfirmation`、`promptProfile`、
  `reloadCurrentProfile`、`onMySessionsChange`、`onAuthIdentityChange`、
  `showCreatedSession`。
- `intentStore`、`toast`、`visibilityTarget`、`chatPollIntervalMs`、
  `discoveryPollIntervalMs`。

factory 的 `= {}` 與每個原預設函式／值均保留。callback 型別優先由七個既有
subcontroller 的 `Parameters<typeof createXController>[0]` property 推導；只有本組裝檔
獨有的 detail／report callback 以檔內最小 interface 描述。`reloadCurrentProfile` 容許
既有 default 的 `void` 與實作者的 boolean／Promise 結果。

### 3.2 最小 data port

`SessionControllerDataPort` 是六個實際帶 `api` 的 subcontroller option 之 `api` 交集，
再補本檔直接呼叫的三個 optional method：

```text
createReport?
loadSessionJoinPreview?
setPlayerVisibility?
```

未 import 70-export `dataApi` facade 型別，也未擴張 repository public contract。
`api` 在 option 上維持 optional；組裝呼叫點以 erasable non-null assertion 接既有
subcontroller contract，故不為了型別新增 fallback object 或改變 undefined 的 runtime
傳遞語意。

### 3.3 契約橋載重

factory 沒有標註成 `: ControllerApi`；`controllerApiContract.ts` 仍直接對
`ReturnType<typeof createSessionController>` 做 missing／extra key 雙向檢查。這避免
回傳 annotation 提前抹去 extra key，橋有牙探針也實證仍會載重。

## 4. 五個 JSDoc anchor 轉換

| 舊檔 anchor                                                    | 新檔 annotation                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `:75 @type Store<SessionControllerState, ControllerEventName>` | `:179 const store: Store<SessionControllerState, ControllerEventName>`，並顯式帶 `createStore` generic |
| `:397 @returns ControllerSurfaceHandle \| null \| undefined`   | `:511 openSessionDetail(...): ControllerSurfaceHandle \| null \| undefined`                            |
| `:455 @returns ControllerSurfaceHandle \| null \| undefined`   | `:576 openSessionById(...): ControllerSurfaceHandle \| null \| undefined`                              |
| `:463 @returns Promise<ControllerOpenSessionResult>`           | `:583 openSessionFromLink(...): Promise<ControllerOpenSessionResult>`                                  |
| `:586 @returns Promise<void> \| void`                          | `:704 togglePlayerVisibility(): Promise<void> \| void`                                                 |

最終反掃：

```text
$ rg -n '@type|@returns' src/sessionController.ts
(no output)
EXIT_CODE=1
```

其他主檔敘述性註解逐字保留。

## 5. `:574` suppression 處置

before：

```js
// eslint-disable-next-line no-useless-assignment -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
let reloaded = false;
```

after：

```ts
let reloaded: boolean | void = false;
```

只刪 suppression comment；`boolean | void` 是配合 tolerant
`reloadCurrentProfile` default 的 erasable annotation。擦除後仍是逐 token 全等的
`let reloaded=false`。`.ts` lint 實跑綠，證明 `no-useless-assignment` 沒有在此 ruleset
重新報錯，也沒有留下 unused directive。

```text
$ rg -n '\bany\b|@ts-ignore|eslint-disable' src/sessionController.ts
(no output)
EXIT_CODE=1

$ npm run lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts
EXIT_CODE=0
```

## 6. importer、appRuntime 與字面同步

### 6.1 五個 static importer

```text
src/controller/controllerApiContract.ts:2:import type { createSessionController } from "../sessionController.ts";
src/main.js:83:import { createSessionController } from "./sessionController.ts";
tests/session-controller-auth.test.js:4:import { createSessionController } from "../src/sessionController.ts";
tests/session-controller-sequence.test.js:21:import { createSessionController } from "../src/sessionController.ts";
tests/session-controller.test.js:8:import * as sessionController from "../src/sessionController.ts";
```

### 6.2 dynamic importer

`tests/fixtures/appRuntime.js:8` 新增：

```js
sessionController: ".ts",
```

三個呼叫點原樣：

```text
tests/react-page-focus.spec.js:146
tests/discovery-interactions-smoke.spec.js:654
tests/auth-forms-smoke.spec.js:1063
```

三者都由完整 mock matrix 實跑通過；沒有新增 404 canary。

### 6.3 核准 comment／doc suffix

已同步：`CLAUDE.md:59`、`README.md:115`、`src/controllerContracts.ts:65`、
`src/views/discoverySurfaceViews.js:212`、`src/main.js:471,638`、
`tests/session.spec.js:392`、`tests/session-controller.test.js:2292,2574`。

## 7. strict probe 與橋有牙自證

兩個探針開始前主檔 SHA-256：

```text
24901ffa6a12fb42a5be2b25a1303830e47cc7754762270fbb5697af69d1b108  src/sessionController.ts
```

### 7.1 strict 納入三拍

暫加 `const probe: number = "x";`：

```text
$ npm run typecheck
src/sessionController.ts(43,7): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT_CODE=2
```

移除後：

```text
24901ffa6a12fb42a5be2b25a1303830e47cc7754762270fbb5697af69d1b108  src/sessionController.ts
$ npm run typecheck
> tsc --noEmit
EXIT_CODE=0
```

### 7.2 exact-key 橋三拍

只在 factory return object 暫把 `retryDiscovery` 改名為
`retryDiscoveryX: retryDiscovery`：

```text
src/controller/controllerApiContract.ts(14,9): error TS2741: Property 'retryDiscovery' is missing in type '{}' but required in type 'Record<"retryDiscovery", never>'.
src/controller/controllerApiContract.ts(15,9): error TS2741: Property 'retryDiscoveryX' is missing in type '{}' but required in type 'Record<"retryDiscoveryX", never>'.
src/controller/controllerApiContract.ts(18,3): error TS2741: Property 'retryDiscovery' is missing in type '{ ... }' but required in type 'ControllerApi'.
EXIT_CODE=2
```

移除後 SHA-256 再次同為
`24901ffa6a12fb42a5be2b25a1303830e47cc7754762270fbb5697af69d1b108`，
typecheck `EXIT_CODE=0`。

## 8. 行為覆蓋盤點

| 載重面                                                                                                                   | 直接覆蓋                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 主 controller 組裝、store、detail/join、visibility、lifecycle、location/discovery、intent、player、chat、report、polling | `tests/session-controller.test.js`：116 個 top-level tests、3 個 factory assembly；涵蓋成功、失敗、stale gate、auth epoch、surface replacement、poller stop 與錯誤字面 |
| auth identity/account switch/token refresh/reset/reconciliation                                                          | `tests/session-controller-auth.test.js`：1 個整合式 top-level test、1 個 factory assembly                                                                              |
| channel 與跨 controller 呼叫序列                                                                                         | `tests/session-controller-sequence.test.js`：3 個 top-level tests、1 個 factory assembly；含 frozen me channel 與 17-step lifecycle script                             |
| dynamic module importer + factory/browser 行為                                                                           | `react-page-focus`、`discovery-interactions-smoke`、`auth-forms-smoke` 三處直接動態 import；完整 mock 298 passed                                                       |
| production data/auth/lifecycle/chat/presence                                                                             | local API 2 passed；Supabase Chromium 45 passed／11 skipped，實際載入 main → controller                                                                                |

兩個 runtime export 都不是零覆蓋：`createSessionController` 由上述 direct／browser matrix
載重，`groupMySessions` 由 My Sessions grouping tests 直接載重。未啟用 branch-coverage
instrumentation，因此不宣稱每個 tolerant default／catch 分支都有獨立 coverage；本批的
零 runtime-token diff、unit sequence、mock 與 local 疊加為行為等價證據。

## 9. 反掃與凍結範圍

### 9.1 舊 suffix 反掃

```text
$ rg 'sessionController\.js' src tests eslint.config.js
(no output)
EXIT_CODE=1

$ rg 'sessionController\.js' CLAUDE.md README.md .claude/rules
(no output)
EXIT_CODE=1
```

`.claude/worktrees/` 未掃入、未觸碰。

### 9.2 目前 TS suffix ground truth

static importer、核准註解與文件共 13 行，全部已列於 §6；dynamic 呼叫仍恰 3 處。
tests/source 中沒有 `readFileSync`／`new URL` 指向 controller 的封條。

### 9.3 dynamic importer 總量

```text
window.__importAppModule=110
```

與基準 110 相同；本批只改 extension map，不改呼叫點。

### 9.4 凍結檔案

七個 subcontroller、`surfaceRegistry.ts`、`sessionStore.ts`、`domainTypes.ts`、
`tsconfig.json`、`eslint.config.js`、`package.json` 的凍結 diff 掃描無輸出。
`controllerApiContract.ts` 只有核准的 import suffix；`controllerContracts.ts` 只有核准的
註解 suffix。

## 10. bundle 對帳

基準與最終完全相同：

```text
main: 638937 raw / 187466 gzip (淨值 0 / 0 B)
total JS: 841561 raw / 257627 gzip (淨值 0 / 0 B)
largest app lazy: MySessionsPage-Byp_C9FO.js 16476 / 4828
private repository: privateDataRepository-CfJqlfj0.js
Sentry: sentryBrowserSdk-Czz5dmkg.js
```

total gzip 仍低於 gate 1,435 B；沒有使用餘裕。

## 11. Codex 五問

### 1. 如何證明這不是只改副檔名？

`SessionControllerOptions`、六路 data-port 交集、store generic、五個 anchor 與所有 implicit
parameter 都進 strict typecheck；錯型 strict probe 指名新 `.ts`。另有 exact-key probe
證明 factory `ReturnType` 橋仍同時抓 missing／extra。

### 2. 如何證明 tolerant factory 與七個 subcontroller 接縫沒有被收窄？

全部 option 仍 optional、原 default 不變；callback 多數直接由 subcontroller parameter
property 推導，沒有改成完整 DOM／Supabase implementation。`api` 仍可缺省，只有型別層
以 non-null assertion 接現存 subcontroller port；擦除後沒有 fallback object 或 guard
差異。116+1+3 個 direct controller tests 的 partial fakes 全綠。

### 3. 如何證明 runtime 零變更？

舊 JS／新 TS 經 esbuild 擦除後同為 19,820 bytes 且 SHA-256 完全相同；production
main／total bundle raw+gzip 均 0 B 淨值。unit 346、mock 298、local API 2、local browser
45 全綠。

### 4. 這批還有哪些已知覆蓋或設計限制？

沒有零覆蓋 export，但沒有 branch-coverage instrumentation，不能把 aggregate green 解讀為
每一個 default callback／catch 都有專屬 case。`SessionControllerDataPort` 故意留在組裝檔內，
因為它是七個 controller 接縫與三個本地 method 的 implementation port，不是應公開的新
domain contract。這批也刻意不拆 841 行 TS 檔；先保住 token 對帳，ownership 拆分另立批。

### 5. 對 6F 的建議

#### 兩個 feature 檔

1. 先轉 `features/presence/presenceFeature.js`（101 行）。難點是 module-level
   `dependencies`／`presenceTracker`、Geolocation tracker callback、auth request stale guard、
   profile patch 與 `currentProfileEligibility()` narrowing。建檔內最小
   `PresenceFeatureDependencies`，tracker 型別從 `createPresenceTracker` 回傳推導；維持
   `configure...` 先注入的 runtime 契約，不用初始化 fallback 改語意。
2. 再轉 `features/profile/profileOrchestrationFeature.js`（261 行）。它同時承載 boot URL
   auth params、OAuth link return、profile completion surface、revision/request gate、
   auth event callback 與 controller resume，型別風險高於 presence。優先重用
   `ControllerAuthSession`、`ControllerProfileEligibility`、`ControllerApi`、Profile／surface
   contract；`dependencies` 應建立 tolerant port，不要從 `main.js` 反推成巨型 application
   interface。`activeProfileCompletion`、`mounted` self-reference closure、auth event string、
   `document.querySelector(...).focus()` 是主要 narrowing 點。

兩檔仍應 annotation-only 各自做 importer 同步、strict 三拍與 erased-token 對帳；若
`prefer-const` 或既存 `no-useless-assignment` suppression 在 `.ts` ruleset 產生 runtime
改寫需求，沿 6C／6E 紀律一次掃全檔後停手裁決。

#### 九條 type-aware ESLint 規則的現況與順序

本批以記憶體 override（未改 config）對目前 `src/**/*.{ts,tsx}`＋`vite.config.ts` 實掃：

| 規則                             | findings / files | 建議                                                                                       |
| -------------------------------- | ---------------: | ------------------------------------------------------------------------------------------ |
| `no-unsafe-argument`             |            2 / 1 | 最先；單檔 `sessionPresentation.ts`，可先收斂輸入 boundary                                 |
| `no-unsafe-call`                 |            5 / 3 | 第二；先補 repository／notification／sheets callable guard                                 |
| `no-unsafe-return`               |            8 / 2 | 與 call 同小批；先定 repository mapper 回傳契約                                            |
| `no-redundant-type-constituents` |            9 / 6 | 純型別清理可早做，但 `databaseTypes.ts` 為 generated 檔，需先決定 override／generator 策略 |
| `no-unnecessary-type-assertion`  |           10 / 8 | 逐檔移除；需保留 6C/6E token audit，避免順手改 runtime                                     |
| `no-base-to-string`              |            8 / 4 | 需逐個定義 null/object 的 UI 字串政策，晚於 mapper contract                                |
| `no-unsafe-assignment`           |           12 / 7 | 先消來源 `any`，否則會連鎖到 member/call                                                   |
| `no-unsafe-member-access`        |           25 / 4 | 與 assignment 同批，集中在 chat/notification/controller/presentation                       |
| `unbound-method`                 |         246 / 28 | 最後且獨立；量級最大，需先分類真正 this-sensitive 與 false-positive，不可機械 bind 全部    |

實作批序建議：小量 presentation/repository rules → redundant/assertion 純型別批 →
assignment/member-access 資料邊界批 → base-to-string UI policy 批 → `unbound-method`
專批。一次全開會產生 325 個 finding，無法維持可審核的 runtime 等價證據。

#### 批 6 後殘餘 `.js` 盤點

- 應留待明確後續批：`main.js`（side-effect root）、`sessionViews.js`＋`src/views/*.js`
  （legacy/frozen presentation facade）、`mockData.js`／`mockData.empty.js`（等 repository
  contract 提供 `satisfies` 目標）、`supabaseClient.js`（環境 bootstrap boundary）。
- 可隨相鄰 consumer 小批轉：`playerPresence.js`（建議與 presence 同批評估）、
  `notificationPush.js`、`meFocus.js`、`sessionRoute.js`、`focusableSelector.js`、`util.js`、
  `modalIsolation.js`、`features/share/shareFeature.js`、
  `features/filters/filterToolbarFeature.js`。
- 6F 主體：`profileOrchestrationFeature.js`、`presenceFeature.js`。

## 12. 收尾標準矩陣

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
298 passed (51.5s)
EXIT_CODE=0

$ npm run test:local
# local API: 2 passed, 0 failed
# Supabase Chromium: 11 skipped, 45 passed (1.4m)
EXIT_CODE=0

$ git diff --check
(no output)
EXIT_CODE=0

$ rg 'sessionController\.js' src tests eslint.config.js
(no output)
EXIT_CODE=1

$ rg 'sessionController\.js' CLAUDE.md README.md .claude/rules
(no output)
EXIT_CODE=1
```

mock unit 階段仍有非致命 `WebSocket server error: Port 24678 is already in use` 訊息；
aggregate exit 為 0，未 retry。local 沒有 reset、污染紅或 retry。

## 13. 未做、疑義與 BLOCKED

- 未做：6F、controller 拆檔、subcontroller/store/contract runtime 變更、ESLint 規則恢復、
  新依賴、UX／文案／資料行為變更、`.claude/worktrees/` 一切。
- 疑義：無。
- runtime 改寫裁決點：無；全檔 lint 掃描沒有 `prefer-const` 類衝突。
- BLOCKED：無。
- Git：未 commit、未 push。
