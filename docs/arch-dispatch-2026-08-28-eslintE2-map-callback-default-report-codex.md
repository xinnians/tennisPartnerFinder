# ESLint 恢復 Phase E-2：map callback-default 首修批回報（Codex）

- 日期：2026-08-28
- 開工 HEAD：`144068c`（parent `77365a0 chore(lint): Phase E-1 unbound-method manifest 產出批 ACCEPTED`）
- 開工狀態：clean
- 結論：完成。`callback-default` family 2 筆清零，`unbound-method` 已對 `src/map.ts` scoped 上線；
  runtime token、construction sites 與 bundle bytes 均未改。
- 未 commit、未 push。

## 1. 實作內容與解凍範圍

修改檔案恰為派工解凍五檔，另新增本回報：

1. `src/map.ts`：只把 `SessionPinHandlers` 的兩個 optional method signatures 改成 optional function
   properties。
2. `eslint.config.js`：只新增 `files: ["src/map.ts"]` 的 `unbound-method: error` scoped override。
3. `scripts/generate-eslint-unbound-manifest.mjs`：只改
   `EXPECTED_FINDINGS 246→244`、`EXPECTED_FILES 28→27`；session 63 不動。
4. `docs/arch-eslint-phaseE-unbound-manifest.json`／`.md`：只由 generator 重生。

`src/map.ts:104-107` 修改後防偽原文：

```ts
interface SessionPinHandlers {
  onCluster?: (court: MapCourtSummary, sessions: SessionSummary[]) => void;
  onSession?: (sessionId: SessionSummary["sessionId"]) => void;
}
```

runtime destructure/default 原文未動：

```ts
{ onSession = () => {}, onCluster = () => {} }: SessionPinHandlers = {}
```

construction site 重驗只有兩處：

- `src/main.js:286-289`：object literal 傳 `onSession`、`onCluster` 兩個 arrow。
- `tests/session-controller.test.js:3123-3125`：只傳 `onSession` arrow。

`git diff -- src/main.js tests/session-controller.test.js` 無輸出；沒有第三個 construction site，也沒有新增
`any`、`@ts-ignore`、inline disable。全域 `unbound-method: off`、databaseTypes override、`:470` runtime
原文都未改。

## 2. Scoped rule 有效性與有牙三拍

ESLint API 的 effective config 實測：

```text
@typescript-eslint/unbound-method: [2]
@typescript-eslint/no-floating-promises: [2]
@typescript-eslint/no-unsafe-assignment: [2]
react-hooks/exhaustive-deps: [2]
react-hooks/rules-of-hooks: [2]
```

可證後方 scoped block 只覆蓋同名規則，沒有沖掉 `map.ts` 的其他 type-aware／React Hooks 規則。

三拍：

1. 修復版 `npm run lint`：exit 0。
2. 暫時將兩個 function properties 退回 method signatures，`npm run lint`：exit 1，逐字輸出：

```text
/Users/ian/tennisPartnerFinder/src/map.ts
  470:5   error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method
  470:27  error  A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value.
If a function does not access `this`, it can be annotated with `this: void`  @typescript-eslint/unbound-method

✖ 2 problems (2 errors, 0 warnings)
```

3. 還原 function-property 修復後，`src/map.ts` SHA-256 回到
   `b96c8d8701866b9c5ad23260a4e48c7a00a37be0065d99b4fdb4707bc6dd2d02`，再次
   `npm run lint` exit 0。

沒有其他檔案或其他 rule 被 canary 打紅。

## 3. Erased-token 全等

HEAD 與 working tree 的完整 `src/map.ts` 分別交給同一版 esbuild，使用 TS loader、
`format: "esm"`、`target: "esnext"`、`minifyWhitespace: true`、`treeShaking: false`：

| 版本 | output bytes | SHA-256 |
| --- | ---: | --- |
| HEAD before | 12,504 | `b93b59d3384e1f5c8143226900bb52e29598183d79fa3e345fa70241cd1e60f4` |
| working tree after | 12,504 | `b93b59d3384e1f5c8143226900bb52e29598183d79fa3e345fa70241cd1e60f4` |

`cmp -s` exit 0，完整 output 逐 byte 全等。source SHA 改變只來自 erased type syntax；runtime
destructure/default arrows、呼叫次序與 callback identity 均未改。

production bundle 對照也為淨 0 B：main gzip `187466 - 187466 = 0 B`，total JS gzip
`257627 - 257627 = 0 B`。

## 4. Manifest 收斂與 deterministic 證據

generator 成功行（兩次相同）：

```text
eslint unbound manifest generated: 244 findings/27 files; sessionController 63; duplicates 0; unresolved declarations 0; sha256:ce5a3e8a82e75dca710449d1c2d9c549448831573891cf6ffec230e380ccdd30
```

反掃結果：

```text
20cd603ceabcae4d0887599015c26831: ABSENT
761154dcdb4d5bda67d077b9bf89e588: ABSENT
callback-default: 0
src/map.ts: 0
findings/files/session: 244/27/63
duplicates/unresolved: 0/0
```

兩次完整生成 SHA-256：

| 產物 | 第一次 | 第二次 |
| --- | --- | --- |
| JSON | `e2099713807801adcf0705dc71fb47cc52e99d769cfbb3b1c8036c8d05f10604` | `e2099713807801adcf0705dc71fb47cc52e99d769cfbb3b1c8036c8d05f10604` |
| Markdown | `5019bda46756fa6eb0825bcae7808080a2a7c0a45655143d5f2fcaa36918d005` | `5019bda46756fa6eb0825bcae7808080a2a7c0a45655143d5f2fcaa36918d005` |

canonical findings checksum：

```text
sha256:ce5a3e8a82e75dca710449d1c2d9c549448831573891cf6ffec230e380ccdd30
```

`--check` drift 三拍：

1. 暫將生成 Markdown 第一行多加一個 `!`。
2. 重跑 exit 1：

   ```text
   eslint unbound manifest check failed:
   - docs/arch-eslint-phaseE-unbound-manifest.md has drifted
   ```

3. 還原一 byte 後重跑 exit 0：

   ```text
   eslint unbound manifest check passed: 244 findings/27 files; sessionController 63; duplicates 0; unresolved declarations 0; sha256:ce5a3e8a82e75dca710449d1c2d9c549448831573891cf6ffec230e380ccdd30
   ```

## 5. 收尾矩陣

| Gate | 實測結果 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 修復版兩次 exit 0；canary 恰紅 2 筆 |
| `npm run prettier:check` | `All matched files use Prettier code style!`，exit 0 |
| `npm run build` | `508 modules transformed`，exit 0 |
| `npm run check:production-bundle` | exit 0；main `638937/187466`，total JS `841561/257627` |
| bundle 基準差 | main gzip 0 B；total gzip 0 B |
| `npm run test:session-unit` | `tests 346 / pass 346 / fail 0 / skipped 0`，exit 0 |
| `npm run test:mock` | unit 前置 346 通過；Playwright `298 passed / 4 skipped`，exit 0 |
| `npm run test:local` API | `2 passed / 0 failed` |
| `npm run test:local` browser | `45 passed / 11 skipped`，exit 0；未 reset、未 retry |
| generator ×2 | 兩次 244／27／63，輸出 SHA byte-identical |
| generator `--check` | 一-byte drift exit 1；還原 exit 0 |
| erased-token | 12,504 bytes、SHA 相同；`cmp` exit 0 |
| `git diff --check` | 無輸出，exit 0 |

unit／mock 的 Node DOM 階段出現既有非致命
`WebSocket server error: Port 24678 is already in use`，最終 346/346 與整體 exit 0 不受影響；沒有 retry。
build 只有既有 chunk-size warning。local 首跑即綠，所以未做 DB count／guarded reset 三拍。

## 6. Codex 五問

### 1. 如何證明這不是只把兩筆從 manifest 隱藏？

scoped config 對 `src/map.ts` 的 effective rule 是 `[2]`；把修復暫退時，真 config 的全庫 lint 精準在原本
兩個位置報 2 筆，還原後才綠。generator 又以自己的 memory override 強制全庫開規則，不受 config 的
global off／scoped error 影響，重掃後 stable IDs 消失。因此是型別 contract 真修復，不是排除掃描或改
manifest renderer。

### 2. 如何證明沒有 runtime／identity 變更？

唯一 source diff 是 interface 的 `method(): void` → `property: (...) => void`；`:470` destructure/default
arrows 與兩個 construction sites 原文零 diff。esbuild 擦除後完整 output 12,504 bytes、SHA 與 bytes 全等，
bundle gzip 也淨 0 B。沒有 wrapper、`.bind()`、新 arrow、memo/effect dependency 或 listener cleanup 變化。

### 3. 如何證明 scoped override 沒擴大或削弱其他規則？

files selector 是單一精確路徑 `src/map.ts`，全域 off 原文保留；effective config 同時顯示
`unbound-method`、`no-floating-promises`、`no-unsafe-assignment`、兩條 React Hooks 規則都為 `[2]`。
canary 只紅 `map.ts:470` 兩筆，其他 244 筆仍由全域 off 留待後續批，沒有一次恢復全庫。

### 4. 如何證明 manifest ledger 與工作範圍沒有漂移？

generator 只改兩個預期常數，session 63 不動；重生固定為 244／27／63、duplicate 0、unresolved 0，
`map.ts` 整檔與 `callback-default` family 都從 canonical findings 消失。兩次檔案 SHA 相同且 `--check`
canary 有牙。最終 diff 除兩份生成檔外，只含指定 map 兩行、config 八行與 generator 兩常數。

### 5. 哪些驗收模板可原樣複用到 controller ports 79 批，哪些要調整？

可原樣複用：

1. 以 E-1 stable IDs 凍結 batch scope，先列 construction sites／declaration owners。
2. method signature 改 function property，禁止 wrapper／bind；逐檔做 HEAD/current esbuild byte equality。
3. scoped rule 的存量綠→method-signature canary 紅→SHA 還原→綠三拍。
4. generator 重生、stable ID 反掃、兩次 SHA、`--check` 一-byte drift 三拍。
5. typecheck、lint、Prettier、unit、mock、local、bundle 與 frozen-diff 收尾。

controller ports 79 筆需調整：

- 79 筆分布為 `mySessions 4 / discoveryMap 6 / chat 11 / lifecycleActions 11 / auth 12 /
  playerDirectory 13 / intent 22`。應按實際清零的 consumer 檔切小批，不能因 family 同名一次改七檔。
- scoped override 的 `files` 陣列只在某檔所有 unbound findings 已清零後，才把該**精確路徑**加入現有
  array；保持排序且不要提前用 `src/controller/*.ts` glob。如此任何漏修會由 lint 立即打紅。若某批只修
  一個 interface、但該 consumer 檔尚有其他 finding，就先不把該檔加入上線陣列。
- canary 不再只需退兩行；應從每個修改過的 contract owner 抽至少一筆，並核對報錯數與 stable ID
  對應，避免 shared dependency contract 一次消除多個 consumer 時漏算。
- tests 要依 controller family 增加 call-order、stale gate、surface／poller cleanup 與 callback identity
  載重，不可只依通用 map pin journey。
- manifest 常數不能永遠靠心算。後續可另批把 E-1 baseline 與 accepted-removal ledger 機械化：每個
  accepted batch 記 `{stableId, path}`，由 baseline `246/28/63` 加上已清零 stable IDs／fully-cleared paths
  推導 expected totals，並逐筆 assert 已消失。這能避免 79 筆跨檔時手調 total/file count 出錯；本批沒有
  越界修改 generator 結構，只依派工更新兩常數。

第一個 controller port 子批建議從 `mySessionsController.ts` 的 4 筆開始：最小、同一 owner、載重已有
session controller unit；清零整檔後才把精確路徑追加到 scoped `files`，再更新 ledger／manifest。

## 7. 未做／疑義／BLOCKED

- 未做：其餘 244 筆修復、全域 off 移除、其他 controller scoped 上線、測試或 construction site 修改、
  dependency 更新、commit、push。
- 疑義：無；開單所列兩個 construction sites、兩個 stable IDs 與預期 244／27／63 均重驗一致。
- BLOCKED：無。
