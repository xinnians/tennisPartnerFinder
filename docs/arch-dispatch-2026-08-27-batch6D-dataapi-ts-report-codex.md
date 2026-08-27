# 批 6D 回報：`dataApi.ts` typed forwarding facade

- 日期：2026-08-27
- 派工單：`docs/arch-dispatch-2026-08-27-batch6D-dataapi-ts.md`
- 開工 HEAD：`321fb0f`；前批 6C ACCEPTED：`cb41b85`。
- 開工 working tree：乾淨。
- 結果：完成；`src/dataApi.js` 已 annotation-only 轉為 strict `src/dataApi.ts`。
- Git：未 commit、未 push。

## 1. 基準與計畫檢視

開工前實測與派工單一致：原 facade 80 行、32 個 re-export 名、38 條 forwarding、
9 個 import edge、2 個 `__importAppModule("dataApi")` 呼叫點、零 suppression。

38 個 export 名與 forwarding target 逐列相同；target 與
`dataRepository.ts` 回傳 38 key 的集合相同。兩處排列順序不同，但集合沒有缺漏，
這不影響 facade 逐名轉送，亦未為了排序改動 runtime。

```text
forwarding_count=38
forwarding_name_target_equal=true
repository_return_key_count=38
forwarding_repository_key_sets_equal=true
only_forwarding=(none)
only_repository=(none)
```

開工基準：

```text
$ npm run typecheck
EXIT_CODE=0

$ npm run build
✓ 508 modules transformed.
dist/assets/index-BWygPPVv.js 638.94 kB | gzip: 187.47 kB
✓ built in 1.32s

$ npm run check:production-bundle
main 638937/187466; total JS 841561/257627
private repository: privateDataRepository-CfJqlfj0.js
EXIT_CODE=0

$ npm run test:session-unit
# tests 346
# pass 346
# fail 0
EXIT_CODE=0
```

派工方案可直接執行，沒有需要另行裁決的衝突；轉成 `.ts` 後也沒有出現 6C 類
`prefer-const` ruleset 差異。

## 2. 轉換摘要與 annotation-only 自證

`src/dataApi.ts` 只新增：

```ts
type DataApi = ReturnType<typeof createDataApi>;
```

以及 38 條對應標註：

```ts
(...args: Parameters<DataApi["同名方法"]>) => defaultDataApi.同名方法(...args)
```

- re-export 區塊、`createDataApi` runtime import、`supabaseClient.js` 路徑、
  `const defaultDataApi = createDataApi();` 及 38 個 forwarding target 均未改。
- 回傳型別全部由 repository factory 推導，沒有另寫會漂移的 facade 模型。
- 無 `any`、`@ts-ignore`、`eslint-disable`、enum、namespace、parameter property 或
  strict probe 殘留。
- `src/data/**` 與 `src/supabaseClient.js` 零 diff；error classes／codes 只照舊 re-export。

38 條型別連接自證：

```text
typed_forwarding_count=38
export_typekey_target_equal=true
```

每列均滿足 `export name === DataApi method key === defaultDataApi target`。

### 2.1 型別擦除 token 對帳

以 esbuild 的 JS／TS loader 分別擦除 HEAD 原檔與最終檔，target `esnext`、ESM、
minify whitespace；沒有正規化或例外：

```text
before_erased_bytes=5512
after_erased_bytes=5512
erased_runtime_tokens_equal=true
EXIT_CODE=0
```

本批 runtime token 全等，沒有 6C 類核可偏差。

## 3. Export 面前後對帳

HEAD 原檔以記憶體內 absolute import rewrite 載入，最終檔直接 Node import；只比較
`Object.keys(module).sort()`，沒有建立或修改 repository 檔案：

```text
before_export_count=70
after_export_count=70
export_names_equal=true
only_before=(none)
only_after=(none)
```

完整共同集合：

```text
COURT_SUBSCRIPTIONS_SELECT,DataApiError,DataApiUnavailableError,
MY_PLAYER_BLOCKS_SELECT,MY_PROFILE_SELECT,MY_SESSIONS_SELECT,
NOTIFICATION_PREFS_SELECT,PLAYER_DIRECTORY_SELECT,
PLAYER_PRESENCE_DIRECTORY_SELECT,SESSION_ACTION_CODES,
SESSION_DISCOVERY_SELECT,SESSION_JOIN_PREVIEW_SELECT,
SESSION_MESSAGE_FEED_SELECT,SESSION_ROSTER_SELECT,SessionActionError,
acceptSessionParticipant,cancelSession,confirmSessionAttendance,createDataApi,
createReport,createSession,decideSessionCourt,declineSessionParticipant,
getInitialSession,inviteToSession,isSupabaseConfigured,linkLoginIdentity,
loadCourtSubscriptions,loadCourts,loadCurrentProfile,loadMyPlayerBlocks,
loadMySessions,loadNotificationPreferences,loadPlayerDirectory,
loadPlayerPresenceDirectory,loadSessionDiscovery,loadSessionJoinPreview,
loadSessionMessages,loadSessionRoster,loadSessionSummary,mapCurrentProfile,
mapMyPlayerBlockRow,mapMySession,mapPlayerDirectoryRow,
mapPlayerPresenceDirectoryRow,mapSessionJoinPreviewRow,mapSessionMessageRow,
mapSessionRosterRow,mapSessionSummary,markSessionChatRead,markSessionPlayed,
onAuthStateChange,postSessionMessage,removePushSubscription,
requestToJoinSession,resolveInitialSession,respondToSessionInvite,
saveCourtSubscriptions,saveCurrentProfile,saveNotificationPreferences,
savePushSubscription,setOpenToGreeting,setPlayerBlock,setPlayerVisibility,
setPresenceSharing,signInWithOAuthProvider,signOut,updateMyPresence,
updateSession,withdrawFromSession
```

## 4. Importer、appRuntime 與字面同步

9 個 import edge：

```text
src/controller/intentController.ts:1
src/features/notifications/notificationFeature.ts:10
src/features/presence/presenceFeature.js:1
src/features/profile/profileOrchestrationFeature.js:10
src/main.js:80
tests/notification-data-api.test.js:4
tests/session-data-boundary.test.js:31
tests/session-data-local-api.test.js:5
tests/session-presentation-boundary.test.js:46  # dynamic import
```

所有 edge 只改 `.js`→`.ts`。另依解凍清單同步：

- `tests/session-data-boundary.test.js:440` regex 副檔名；其非空 guard 與斷言未動。
- `eslint.config.js:109` ignores 與 `:156` files 兩個機制性字面；規則內容零變更。
- `src/mockData.empty.js:1`、`CLAUDE.md` 三處、`.claude/rules/supabase.md`
  三處、`README.md:119`、`supabase/README.md:5` 僅副檔名字面。

`tests/fixtures/appRuntime.js` 新增：

```text
dataApi: ".ts",
```

呼叫點保持：

```text
tests/session.spec.js:358
tests/auth-forms-smoke.spec.js:1062
```

mock 呼叫點的測試單跑：

```text
$ npx playwright test tests/auth-forms-smoke.spec.js:1048 --project=desktop-chromium
1 passed (2.9s)
EXIT_CODE=0
```

local 呼叫點由完整 `test:local` 的 `session.spec.js:342` journey 載重並通過。

```text
$ rg -o 'window\.__importAppModule' src tests | wc -l
110
baseline=110
delta=0
```

## 5. Strict 與 forwarding 有牙探針

### 5.1 Strict 納入三拍

最終檔暫加：

```ts
const batch6DStrictProbe: number = "x";
```

```text
$ npm run typecheck
src/dataApi.ts(117,7): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT_CODE=2

before_probe_sha256=1ae96a040e686952546d4a2c4e78bb42062685a7185498c8ba1e2703b1243dcb
restored_sha256=1ae96a040e686952546d4a2c4e78bb42062685a7185498c8ba1e2703b1243dcb
BYTE_IDENTICAL=true

$ npm run typecheck
EXIT_CODE=0
```

### 5.2 Method key 有牙三拍

暫將 `loadCourts` 的 type key 由 `"loadCourts"` 改成不存在的
`"missingLoadCourts"`；runtime target 不動：

```text
$ npm run typecheck
src/dataApi.ts(45,56): error TS2339: Property 'missingLoadCourts' does not exist
on type '{ acceptSessionParticipant: ...; ... 35 more ...; withdrawFromSession: ...; }'.
EXIT_CODE=2

before_probe_sha256=1ae96a040e686952546d4a2c4e78bb42062685a7185498c8ba1e2703b1243dcb
restored_sha256=1ae96a040e686952546d4a2c4e78bb42062685a7185498c8ba1e2703b1243dcb
BYTE_IDENTICAL=true

$ npm run typecheck
EXIT_CODE=0
```

這證明 `Parameters<DataApi["X"]>` 會受 factory method 集合約束，不是裝飾字串。

## 6. 行為覆蓋盤點

| 類別 | 既有載重 | 明確空白 |
| --- | --- | --- |
| facade export／forwarding | Node 前後 70 export 對帳；`session-data-boundary` 驗 module-level chat／join preview forwarding、main capability 集合、private loader failure 後 retry | 38 條 wrapper 沒有逐條獨立 spy test；名稱三向對帳＋token 全等補足 |
| auth／error／presentation re-export | `session-presentation-boundary` 驗 error code/message 完整性；`session-data-boundary` 驗 auth restore、code-only、P0001 allowlist 與三 error identity 路徑 | 每個 auth re-export 沒有 facade-only identity assertion；export 集合與全矩陣守護 |
| notification／presence | `notification-data-api` 5 條直接驗 read/write selects/RPC/presence；boundary regex 驗 notification feature import block | 無針對 facade rest tuple 的 compile-time fixture；38 key 探針與 typecheck涵蓋 |
| public／private repositories | `session-data-boundary` 涵蓋 discovery、mappers、lists、profile、chat、block、report、lifecycle、lazy retry；local API 2 條與 local 45 journeys 載重真 Supabase | repository 實作本批凍結，未新增測試 |
| dynamic appRuntime | mock online layer載重 `createDataApi`；local profile-before-courts 載重 `saveCurrentProfile` | 未做 404 canary；依派工單沿用 Vite fallback ground truth |

針對性 Node 測試：

```text
$ node --test tests/session-data-boundary.test.js \
  tests/notification-data-api.test.js tests/session-presentation-boundary.test.js
# tests 79
# pass 79
# fail 0
EXIT_CODE=0
```

## 7. 凍結面與反掃

```text
$ git diff --exit-code -- src/data src/supabaseClient.js
(no output)
EXIT_CODE=0
frozen_data_and_supabase_diff=0

$ rg 'dataApi\.js' src tests
(no output)
RG_EXIT_CODE=1
src_tests_legacy=0

$ rg 'dataApi\.js' CLAUDE.md .claude
(no output)
RG_EXIT_CODE=1
claude_legacy=0

$ rg 'dataApi\.js' README.md supabase/README.md eslint.config.js
(no output)
RG_EXIT_CODE=1
docs_eslint_legacy=0
```

凍結呼叫點與 lazy import 原樣存在：

```text
src/data/repositories/dataRepository.ts:81:
  privateDataApiLoader = () => import("./privateDataRepository.ts"),
src/data/repositories/privateDataRepository.ts:324:
  p_line_id: null,
```

## 8. Bundle 對帳

| 指標 | 6C 基準 | 6D 最終 | 淨值 | 上限 | 最終餘裕 |
| --- | ---: | ---: | ---: | ---: | ---: |
| main raw | 638,937 | 638,937 | 0 B | 658,867 | 19,930 B |
| main gzip | 187,466 | 187,466 | 0 B | 192,420 | 4,954 B |
| total JS raw | 841,561 | 841,561 | 0 B | 849,961 | 8,400 B |
| total JS gzip | 257,627 | 257,627 | 0 B | 259,062 | **1,435 B** |

所有 production chunk hash／bytes 與基準相同：

```text
production bundle check passed: development E2E hook present, production E2E hook absent;
32 files, 12 demo identifiers absent; main 638937/187466 within 658867/192420;
largest app lazy MySessionsPage-Byp_C9FO.js 16476/4828 within 18000/5500;
total JS 841561/257627 within 849961/259062;
private repository: privateDataRepository-CfJqlfj0.js;
Sentry: sentryBrowserSdk-Czz5dmkg.js
EXIT_CODE=0
```

`privateDataRepository-CfJqlfj0.js` 仍是獨立 9.40 kB／gzip 2.96 kB lazy chunk。

## 9. Codex 五問

### 1. 如何證明這不是只把副檔名改成 `.ts`？

strict probe 指名 `dataApi.ts`；method-key probe 又證明不存在的 factory method 會紅。
38 列掃描確認 export／type key／runtime target 三者同名，typecheck 綠後才移除探針。

### 2. 如何證明隱私邊界 export 沒有漂移？

Node 實際載入前後模組各列出 70 個 export，集合完全相同；`src/data/**`、
`supabaseClient.js`、error contract、lazy loader 與 `p_line_id: null` 全部零 diff。

### 3. 如何證明 runtime 零變更？

esbuild 擦除後 5,512 bytes 逐 token 相等；production 所有 chunk hash／bytes 0 B
淨值；unit 346、mock 298、local API 2 與 local browser 45 全綠。

### 4. 為何 `DataApi` 留在 facade 檔內，不從 repository export？

本批只需把 forwarding args 綁到既有 factory 回傳值；檔內
`ReturnType<typeof createDataApi>` 已提供單一真相。從 repository 新增 export 會擴張
凍結的 `src/data/` 面，還會製造不必要的 public type contract。

### 5. 對 6E `sessionController.js` TS 化的建議

建議直接機械轉，不要先拆檔；拆分與 annotation 同批會失去 token 對帳能力。

1. 規模／edge：主檔 711 行、14 個檔內 function/arrow assembly 節點、2 個 runtime
   export（`groupMySessions`、`createSessionController`）。static edge 至少有 `main.js`、
   `controllerApiContract.ts`、3 個 controller unit；另有 3 個 appRuntime dynamic call，
   以及多處 source-comment seal。開單需用 static／dynamic／readFile／comment 四口徑盤點。
2. strict 接縫：`controllerApiContract.ts` 已以
   `ReturnType<typeof createSessionController>` 對 `ControllerApi` 做 missing／extra key
   雙向 exact check。6E 只需同步 import `.ts` 並保留這座橋；不要讓 assembly 反向 import
   `controllerApiContract.ts`。狀態、surface context、request gate、poller、open-session
   result 等優先重用 `controllerContracts.ts`。
3. factory inputs 建議在主檔建立最小 `SessionControllerOptions`，如實保留約 28 個注入
   callback／default；不要直接把所有 callback 收窄成完整 DOM／Supabase implementation，
   以免 unit fakes 失配。`api` 應建最小 data port，或從現有 subcontroller options 的交集
   推導，避免把 70-export data facade 當成依賴型別。
4. 難點順序預估：factory callback signatures／tolerant fakes → store 27 欄與 Map generic →
   surface transition metadata union → 7 個 subcontroller options 的結構相容 → async gate／
   auth snapshot narrowing → DOM visibility/timer port → error catch `unknown`。建議每完成一層
   就 typecheck，最後再做單一全檔 erased-token 對帳。
5. JSDoc 已提供 `Store<SessionControllerState, ControllerEventName>`、
   `ControllerOpenSessionResult`、`Promise<void> | void` 三個 anchor；轉換時先將它們改成
   erasable TS annotation，再處理 implicit-any。若 type-aware lint 逼出 runtime 改寫，沿
   6C 流程停手裁決，不以 suppression 或拆檔繞過。

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
✓ built in 1.63s
EXIT_CODE=0

$ npm run check:production-bundle
main 638937/187466; total JS 841561/257627;
private repository: privateDataRepository-CfJqlfj0.js
EXIT_CODE=0

$ git diff --check
(no output)
EXIT_CODE=0

$ npm run test:session-unit
# tests 346
# pass 346
# fail 0
# skipped 0
# duration_ms 3669.769333
EXIT_CODE=0

$ npm run test:mock
4 skipped
298 passed (51.9s)
EXIT_CODE=0

$ npm run test:local
# local API: 2 passed, 0 failed; duration_ms 4345.637042
# Supabase Chromium: 11 skipped, 45 passed (1.4m)
EXIT_CODE=0
```

Unit／mock 的 happy-dom Vite cases 仍可能輸出非致命
`WebSocket server error: Port 24678 is already in use`；所有 TAP cases 與 aggregate
exit 均為 0，沒有 retry。本批未改 Vite harness 或該埠。local 沒有 reset、資料污染、
presence timeout 或 retry。

## 11. 範圍、未做、疑義與 BLOCKED

- 永久變更限於 facade 改名＋annotation、9 個 import edge、appRuntime mapping、regex
  封條副檔名、ESLint 兩字面及核准的註解／文件副檔名。
- `src/data/**`、`supabaseClient.js`、tests assertion 語意、tsconfig、package、bundle
  gate、domainTypes 均零 diff。
- 未做：6E–6F、repository／error 重構、facade 拆檔、ESLint 規則恢復、新依賴、
  UX／錯誤碼／隱私行為變更。
- 疑義：無。
- BLOCKED：無。
- Git：未 commit、未 push；working tree 留給驗收方。
