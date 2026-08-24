# Frontend F2B 實作回報（codex）

日期：2026-08-24  
派工單：`docs/arch-dispatch-2026-08-24-frontend-F2B.md`  
實作基線：`238a830`（派工單 commit；前一批驗收 HEAD 為 `b09f6f0`）  
實作 HEAD：`4debd26`（含 B-5 驗收補件）

## 0. 結論

[已驗證] B-1～B-6 全部完成，六個子項各有獨立 implementation/test commit；另有一筆純格式 gate commit 與一筆 B-5 驗收補件 commit。最終完整矩陣結果如下：

- `npm run test:ci:frontend`：exit 0；Node 單元測試 302/302，mock Playwright 270 passed／4 expected skipped，build 與 production bundle scan 通過。
- `npm run test:db`：exit 0；7 files、799 tests，PASS。
- `npm run test:local`：exit 0；local API 2/2、local Playwright 42 passed／11 expected skipped，`did not run` = 0。
- `git diff --check`：exit 0，空輸出。
- 既有 `GOLDEN`：`0be31a2` 與 HEAD 都是 124 筆，逐筆 JSON byte-equivalent。
- 全 `src/` `data-testid` 集合：兩側都是 91 assignments／90 unique，added/removed 都為 0。
- 既有 `tests/*.spec.js`：相對 `b09f6f0` 零修改。

[已驗證] 未更動 RPC 簽名、`controller.sessionStore` 公開 API、第三個 `flushSync`、`.claude/rules/`、`CLAUDE.md`、`tests/session.spec.js:532` 或任何 e2e 斷言；未 push；未執行 DB reset。

## 1. B-1（批 1 遺留）退役 drawer scroll memory

Commit：`1d370d2 refactor(arch-F2B): retire drawer scroll memory`

### 改了什麼

- `src/sessionViews.js`：刪除 `drawerScrollPositions`、`rememberDrawerScrollTop`、`restoreDrawerScrollTop` 與全部呼叫點。
- `src/sessionViews.js:306-548`：`drawerFocusIntents` 完整保留。
- `src/sessionViews.js:725`：保留並更新 Batch 18 invariant 註解，明確記錄穩定 React slot 由原生 DOM 保有 `scrollTop`；只剩焦點需顯式記憶。

### 驗收

```text
$ rg -n "drawerScrollPositions|rememberDrawerScrollTop|restoreDrawerScrollTop" src tests scripts
（空輸出）
drawer scroll-memory identifier matches: 0
```

[已驗證] 已刪除／歸零，不是只停用呼叫點。

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js --project=desktop-chromium --grep "batch 18"
Running 2 tests using 1 worker
2 passed
```

[已驗證] 兩條既有 Batch 18 e2e 零修改且全綠；完整 frontend gate 又在 desktop/mobile 各跑一次同一組既有測試。

## 2. B-2（批 1 遺留）Me channel 第二張 GOLDEN

Commit：`ab041ba test(arch-F2B): freeze me channel dispatch sequence`

### 改了什麼

- `tests/session-controller-sequence.test.js`：新增獨立 `meEntries` recorder 與 19 筆 `ME_GOLDEN`。
- recorder 只記 `step|me`，不與既有 124 筆 payload table 交錯，也不複製 payload coupling。
- 檔頭加上第二張表自己的重錄規則；既有 `GOLDEN` 本體逐字未動。

### 既有 GOLDEN 凍結證據

```text
$ node --input-type=module <GOLDEN comparison script>
baseline GOLDEN entries: 124
HEAD GOLDEN entries: 124
GOLDEN byte-equivalent JSON: true
```

[已驗證] 舊表筆數、順序與 payload 全部不變。

### canary：紅 → 還原 → 綠

Canary 只暫時刪除 `setCourts` 的 `store.emit("me")`；沒有修改新表，也沒有重錄 oracle。

```text
$ node --test tests/session-controller-sequence.test.js
TAP version 13
# Subtest: sessionController dispatches the frozen me-channel sequence independently
not ok 1 - sessionController dispatches the frozen me-channel sequence independently
  ---
  duration_ms: 7.271208
  type: 'test'
  location: '/Users/ian/tennisPartnerFinder/tests/session-controller-sequence.test.js:510:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected

      [
    -   'setCourts|me',
        'sign-in|me',
        'sign-in|me',
        'sign-in|me',
        'sign-in|me',
        'sign-in|me',
        'sign-in|me',
    -   'courts-channel-with-open-form|me',
    -   'courts-channel-with-open-form|me',
        'blocks|me',
        'blocks|me',
        'sign-out|me',
        'sign-out|me',
        'sign-in-other-account|me',
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    0: 'setCourts|me'
    1: 'sign-in|me'
    2: 'sign-in|me'
    3: 'sign-in|me'
    4: 'sign-in|me'
    5: 'sign-in|me'
    6: 'sign-in|me'
    7: 'courts-channel-with-open-form|me'
    8: 'courts-channel-with-open-form|me'
    9: 'blocks|me'
    10: 'blocks|me'
    11: 'sign-out|me'
    12: 'sign-out|me'
    13: 'sign-in-other-account|me'
    14: 'sign-in-other-account|me'
    15: 'sign-in-other-account|me'
    16: 'sign-in-other-account|me'
    17: 'sign-in-other-account|me'
    18: 'sign-in-other-account|me'
  actual:
    0: 'sign-in|me'
    1: 'sign-in|me'
    2: 'sign-in|me'
    3: 'sign-in|me'
    4: 'sign-in|me'
    5: 'sign-in|me'
    6: 'blocks|me'
    7: 'blocks|me'
    8: 'sign-out|me'
    9: 'sign-out|me'
    10: 'sign-in-other-account|me'
    11: 'sign-in-other-account|me'
    12: 'sign-in-other-account|me'
    13: 'sign-in-other-account|me'
    14: 'sign-in-other-account|me'
    15: 'sign-in-other-account|me'
# Subtest: sessionController dispatches the frozen call sequence across the 17-step lifecycle script
ok 2 - sessionController dispatches the frozen call sequence across the 17-step lifecycle script
# Subtest: the recorded sequence covers every scripted step and is not an empty scan
ok 3 - the recorded sequence covers every scripted step and is not an empty scan
1..3
# tests 3
# pass 2
# fail 1
# duration_ms 169.778542
EXIT=1
```

[已驗證] Canary 精確抓出一次 `setCourts` 與 open-form 階段兩次 courts-channel 的 Me 派發缺失；舊 124 筆表仍綠，證明第二張表是獨立補足盲區。

還原 production emit 後：

```text
$ node --test tests/session-controller-sequence.test.js
TAP version 13
ok 1 - sessionController dispatches the frozen me-channel sequence independently
ok 2 - sessionController dispatches the frozen call sequence across the 17-step lifecycle script
ok 3 - the recorded sequence covers every scripted step and is not an empty scan
1..3
# tests 3
# pass 3
# fail 0
# duration_ms 138.296833
```

```text
$ sed -n '762,767p' src/sessionController.js | rg -c 'store\.emit\("me"\)'
1
$ git status --short
（空輸出；canary production 改動已完整還原）
```

## 3. B-3（F2-6）mock player mapper 收斂

Commit：`f9637ff refactor(arch-F2B): map mock player data`

### 改了什麼

- `src/data/mappers/profileMappers.ts:96`：新增 `mapMockPlayerDirectoryRow`，把 camelCase mock allowlist 映為與 configured mapper 相同的 domain shape，並套用 play type／slot literal guards。
- `src/data/mappers/profileMappers.ts:131`：新增 `mapMockPlayerPresenceDirectoryRow`，明確列出 presence allowlist 並正規化數字與布林。
- `src/data/repositories/dataRepository.ts:246,265`：兩條 mock repository path 改走上述 mapper，不再 `{ ...entry }`。
- `tests/session-data-boundary.test.js`：各加一條單元測試；覆蓋 unknown play type／slot 被移除、unknown boolean-like presence 值 fallback 為 false，且私有額外欄位不外洩。

### 驗收

```text
$ rg -n '\{\s*\.\.\.entry\s*\}' src/data/repositories/dataRepository.ts
（空輸出）
repository direct entry-spread matches: 0
```

```text
$ npm run typecheck
> tsc --noEmit
exit 0

$ node --test tests/session-data-boundary.test.js
1..62
# tests 62
# pass 62
# fail 0
```

[已驗證] `player presence mock path normalizes camelCase values and rejects unknown boolean-like input` 與 `player directory mock path applies literal guards to camelCase arrays` 皆綠。

[已驗證] 完整 mock e2e 中球友卡、directory 與在線圖層既有旅程全綠，e2e 檔零修改。

## 4. B-4（F2-7）通知偏好預設值單點化

Commit：`50ddb97 refactor(arch-F2B): centralize notification defaults`  
純格式補件：`49c7016 style(arch-F2B): satisfy formatting gate`

### 改了什麼

- 新增 `src/notificationPreferences.ts`：集中六欄 keys、`defaultNotificationPreferences`、`notificationPreferencesForRead`、`notificationPreferencesForWrite`。
- `src/data/mappers/profileMappers.ts`、`src/data/repositories/dataRepository.ts`、`src/features/notifications/notificationFeature.ts`、`src/sessionPresentation.ts` 全部由單點推導。
- `tests/notification-data-api.test.js`：新增不對稱契約測試。

### 讀寫不對稱

[已驗證] 這是刻意保留的契約：

- read compatibility：缺欄位只有在明確 `false` 時才關閉；舊資料缺欄位仍視為 enabled。
- write safety：只有明確 `true` 才送 enabled；缺欄位一律送 false，避免 partial input 靜默開啟通知。

```text
$ rg -n '!== false|notifySessionNearby:\s*true|notifyCandidateNearby:\s*true|notifyJoinResult:\s*true|notifySessionChange:\s*true|notifyReminder:\s*true|notifyInvite:\s*true' \
  src/data/mappers/profileMappers.ts src/features/notifications/notificationFeature.ts src/sessionPresentation.ts
（空輸出）
former notification-default duplication matches: 0
```

```text
$ node --test tests/notification-data-api.test.js tests/session-data-boundary.test.js
# pass 74
# fail 0
```

[已驗證] 完整 mock e2e 的 Me notification settings、全台北市球場訂閱、unloaded catalog 與 collapse/reopen 旅程全部綠，既有測試零修改。

## 5. B-5（F2-8）`ACTION_MESSAGES` 上移 UI

Commit：`79d00e4 refactor(arch-F2B): move action messages to UI`  
純格式補件：`49c7016 style(arch-F2B): satisfy formatting gate`

### 改了什麼

- `src/data/dataErrors.ts`：移除中文 `ACTION_MESSAGES`；`SessionActionError` 只帶 stable `code`、`name`、`cause`，其 `message` 為空。
- `src/sessionActionMessages.ts`：新增完整 27-key UI literal table 與唯一 `sessionActionMessage(error, fallback)` resolver。
- `asSessionActionError` 的 P0001 exact-message → code whitelist 機制與 outcome 字串契約未動。
- `tests/session-presentation-boundary.test.js`：逐 key 釘住完整字面、與 `SESSION_ACTION_CODES + UNKNOWN_ACTION_ERROR` 的 key parity、所有 code 的 resolve、unknown action code fallback、一般 Error message 與 caller fallback。
- `tests/session-data-boundary.test.js`：契約改釘 stable code 與空 `message`，不再把 UI 文案當 data-layer contract。

### 顯示點盤點

派工單文字寫「共七處」，同段列出的座標實際為 3 + 3 + 2 = 八處；初版依該清單修完八處後，驗收方全樹掃描又找到第九處 `PlayerCardSheet`。補件後九處全部改走同一 resolver：

1. `src/sessionController.js:1071`：封存聊天室 `setArchived`。
2. `src/sessionController.js:1440`：join inline/toast error。
3. `src/sessionController.js:1480`：withdraw toast。
4. `src/sessionViews.js:880`：chat report error。
5. `src/sessionViews.js:885`：chat block error。
6. `src/sessionViews.js:1649`：court decision error。
7. `src/sessionActions.ts:242`：generic `runAsyncAction` error。
8. `src/sessionActions.ts:287`：My Sessions action error。
9. `src/sheets/PlayerCardSheet.tsx:178`：player invitation action error（補件 `4debd26`）。

```text
$ rg -n 'error\?\.message|reportError\?\.message|blockError\?\.message|decisionError\?\.message|actionError.*message|setArchived\?\.\(error\.message' \
  src/sessionController.js src/sessionViews.js src/sessionActions.ts
（空輸出）
former action-message consumer pattern matches: 0
```

### 中文 action 文案離開 data layer

掃描新 UI table 的每個完整 value，逐一反查 `src/data/**/*.{js,ts,tsx}`：

```text
action messages scanned: 27
src/data files scanned: 10
exact action-message matches in src/data: 0
```

[已驗證] 27 個 action 文案全部離開 `src/data/`。`src/data/dataErrors.ts` 仍有既有 `DataApiUnavailableError` 的環境設定提示；它不屬於本項 `ACTION_MESSAGES`／session action stable-code 集合，未擴張範圍改動。

```text
$ npm run typecheck && npm run lint && node --test tests/session-data-boundary.test.js tests/session-presentation-boundary.test.js
1..70
# tests 70
# pass 70
# fail 0
```

[已驗證] 完整 mock/local e2e 的封存聊天 `SESSION_ARCHIVED`、join、withdraw、report、block、decision、My Sessions 與 player invitation 顯示路徑全綠；UI 中文逐字未變。Player invitation 的漏網發現、全樹盤點、DOM test canary 與補件 gates 詳見 §8。

## 6. B-6（F2-9）profile save 只查一次 courts

Commit：`625151a refactor(arch-F2B): reuse courts during profile save`

### 改了什麼

- `src/data/repositories/dataRepository.ts:364-374`：抽出可接受既有 courts catalog 的權威 profile loader；普通 `loadCurrentProfile` 的「先查 profile、存在才查 courts」語意不變。
- `src/data/repositories/dataRepository.ts:397-414`：`saveCurrentProfile` 第一次取得 courts 後用於 selected IDs，RPC 完成後仍權威重查 `my_profile`，但把同一 catalog 傳入 mapper，不再第二次查 courts。
- `tests/session-data-boundary.test.js:1232-1280`：假 client 記錄 table 呼叫序列並釘住 `courts → my_profile`，因此 `from("courts")` 恰一次。

```text
$ node --test tests/session-data-boundary.test.js
ok 38 - nickname-only profile save normalizes optional fields for the RPC
1..62
# tests 62
# pass 62
# fail 0
```

該測試的精確斷言：

```js
assert.deepEqual(tableCalls, ["courts", "my_profile"], "profile save must query courts exactly once");
```

[已驗證] local API 與 local Playwright 的 profile save/gate/edit/court-preservation 旅程全部通過；回傳仍是 RPC 後的權威 `my_profile` domain shape。

## 7. 完整收尾矩陣

### 7.1 Frontend CI

第一次執行在 Prettier gate 停下：

```text
[warn] src/features/notifications/notificationFeature.ts
[warn] src/sessionActions.ts
[warn] tests/session-presentation-boundary.test.js
[warn] Code style issues found in 3 files. Run Prettier with --write to fix.
```

[已驗證] 只套用專案 formatter，形成純格式 commit `49c7016`；沒有語意或測試調整。之後從 gate 起點完整重跑：

```text
$ npm run test:ci:frontend
--check 通過:產出檔案與 data/courts.json 重生結果一致。
All matched files use Prettier code style!
1..296
# tests 301
# pass 301
# fail 0
Running 274 tests using 1 worker
4 skipped
270 passed (2.5m)
✓ 153 modules transformed.
✓ built in 923ms
production bundle check passed: 28 files, 12 demo identifiers absent; main chunk 633133/184420 bytes within 703886/203176
exit 0
```

### 7.2 DB

```text
$ npm run test:db
supabase/tests/courts_catalog.sql ........ ok
supabase/tests/my_profile_rls.sql ........ ok
supabase/tests/notification_rework.sql ... ok
supabase/tests/player_presence_rls.sql ... ok
supabase/tests/session_chat.sql .......... ok
supabase/tests/session_join_preview.sql .. ok
supabase/tests/session_rls.sql ........... ok
All tests successful.
Files=7, Tests=799
Result: PASS
```

### 7.3 Local Supabase

```text
$ npm run test:local
1..2
# tests 2
# pass 2
# fail 0
Running 53 tests using 1 worker
11 skipped
42 passed (1.3m)
exit 0
did not run: 0
```

[已驗證] Playwright 執行期間沒有並發其他測試；沒有 timeout 紅，因此不需要 `--repeat-each=10` 取樣，也不需要 reset local DB。

### 7.4 Diff 與凍結面

```text
$ git diff --check
（空輸出，exit 0）

$ git diff --stat b09f6f0 HEAD -- 'tests/*.spec.js'
（空輸出）
```

`data-testid` 集合掃描：

```text
baseline source files: 68
HEAD source files: 74
baseline data-testid assignments/set: 91/90
HEAD data-testid assignments/set: 91/90
added: (none)
removed: (none)
```

[已驗證] `data-testid` 集合與 `0be31a2` 相同；掃描非空。GOLDEN 比較見 §2，既有 124 筆相同。

## 8. B-5 驗收補件

Commit：`4debd26 fix(arch-F2B): preserve player invite action messages`

### 8.1 修復與防迴歸測試

- `src/sheets/PlayerCardSheet.tsx:6,178`：直接 import leaf `sessionActionMessage`，邀請 catch 改用 `sessionActionMessage(inviteError, "邀請失敗，請稍後再試。")`。
- `tests/player-card-sheet-dom.test.js`：以 Happy DOM + 真實 React `SurfaceHost` 掛載 Player Card；`onInvite` 丟 `SessionActionError("ALREADY_INVITED")`，送出後斷言可見 alert 逐字為「你已邀請過這位球友。」。
- `package.json`：新 DOM test 登錄 `test:session-unit`；`tests/ci-config.test.js` 的 top-level unit 完整性 gate 綠。

Canary 暫時把 production catch 改回舊 `.message || fallback`：

```text
$ node --test tests/player-card-sheet-dom.test.js
not ok 1 - Player Card resolves invite action codes before its generic fallback
Expected values to be strictly equal:
+ actual - expected
+ '邀請失敗，請稍後再試。'
- '你已邀請過這位球友。'
# tests 1
# pass 0
# fail 1
EXIT=1
```

還原 resolver 後：

```text
$ node --test tests/player-card-sheet-dom.test.js
ok 1 - Player Card resolves invite action codes before its generic fallback
1..1
# tests 1
# pass 1
# fail 0
```

[已驗證] 測試不是只釘 resolver 表；它真的掛載 `PlayerCardSheet`、觸發 submit/catch 並讀 rendered `role="alert"`，可以抓到本次漏接 consumer 的迴歸。

### 8.2 全 `src/` `.message` 消費者盤點

```text
$ rg -n "\.message" src --glob '*.{js,ts,tsx}'
```

逐項分類：

- [已驗證] `src/pages/NearbySessionsDrawer.tsx:182,189,380,382`：`mapStatus.message`／`resolvedMapStatus.message` 是 discovery view model，不是 Error。
- [已驗證] `src/pages/MySessionsPage.tsx:661`：`presentation.message` 是 push prompt presentation。
- [已驗證] `src/sheets/SessionDetailSheet.tsx:397,456,475`：`prompt.message`／`snapshot.message` 是已解析的 UI state；`:730` 只處理 `onConfirmJoin` 的意外 generic throw，正常 controller action error 已在 `sessionController.js:1440` resolve 後回 `joinError`。
- [已驗證] `src/sessionActionMessages.ts:45`：唯一 resolver 內部保留 generic Error message passthrough，正是既定契約。
- [已驗證] `src/data/dataErrors.ts:73,76,86`：P0001 exact-message → stable code 解碼與 generic data error transport，非 UI 顯示點。
- [已驗證] `sessionController.js`／`sessionViews.js`／`sessionPresentation.ts`／chat feature/mappers 的其餘命中都是 `messageId`、messages collection 或已命名 view state，不是 `Error.message` consumer。
- [已驗證] `src/sheets/PlayerCardSheet.tsx` 已不再直接讀 `inviteError.message`；全樹所有 action-code 顯示點現在共九處，皆走 `sessionActionMessage` 或先由 controller resolve 成 UI state。

Resolver 呼叫反查：

```text
src/sessionViews.js:880,885,1649
src/sessionController.js:1071,1440,1480
src/sessionActions.ts:242,287
src/sheets/PlayerCardSheet.tsx:178
```

### 8.3 Rendered Browser QA

測試 flow：`http://127.0.0.1:5173/` → 點「球友名單」→ player directory/login gate → player card invitation error。

- [已驗證] Codex in-app Browser；desktop viewport；URL `http://127.0.0.1:5173/`，title `球咖｜台北網球`。
- [已驗證] DOM snapshot 有完整 map、drawer、nav 與球友名單控制，非 blank page，無 Vite/framework error overlay。
- [已驗證] console warning/error：0。
- [已驗證] 點「球友名單」有狀態變化並出現「登入以查看球友名單」gate；未登入狀態無法經可見 UI 製造 `ALREADY_INVITED`，且 Browser read-only evaluate 不用來注入 app state。
- [已驗證] 精確 action-code error rendering 改由 §8.1 的真實 React DOM 測試驗證；完整 repo Playwright 仍照補件要求執行。

### 8.4 補件完整 gates

```text
$ npm run test:ci:frontend
# tests 302
# pass 302
# fail 0
4 skipped
270 passed (2.4m)
✓ built in 1.05s
production bundle check passed: 28 files, 12 demo identifiers absent; main chunk 633133/184420 bytes within 703886/203176
exit 0

$ npm run test:local
# local API tests 2
# pass 2
# fail 0
11 skipped
42 passed (1.4m)
did not run: 0
exit 0

$ git diff --check
（空輸出，exit 0）
```

[已驗證] 補件沒有修改任何 `tests/*.spec.js`、`data-testid`、RPC、DB schema 或文案字面；Playwright 期間未並發其他測試。

## 9. Commit 清單

```text
4debd26 fix(arch-F2B): preserve player invite action messages
49c7016 style(arch-F2B): satisfy formatting gate
625151a refactor(arch-F2B): reuse courts during profile save
79d00e4 refactor(arch-F2B): move action messages to UI
50ddb97 refactor(arch-F2B): centralize notification defaults
f9637ff refactor(arch-F2B): map mock player data
ab041ba test(arch-F2B): freeze me channel dispatch sequence
1d370d2 refactor(arch-F2B): retire drawer scroll memory
```

## 10. 未做事項與工作樹

- [已驗證] 未做 F2-1～F2-4 拆檔、`onBeforeStoreChange` churn 或命名殘留清理。
- [已驗證] 未改任何 RPC 簽名；`set_notification_prefs` 六參數與 `p_line_id: null` 保留。
- [已驗證] 未改 production 文案字面；B-5 只有搬移與 consumer resolution。
- [已驗證] 未新增／刪除／修改 e2e `.spec.js`。
- [已驗證] 未 push、未 reset DB。
- [已驗證] 本回報依派工單要求不列入實作 commit；交付時工作樹只有兩份文件：本回報，以及驗收方已落檔、由使用者擁有的 `docs/arch-reports/batch-F2B-acceptance-2026-08-24.md`。補件 commit 未混入兩者。

[推論] 本批不含 schema/query 變更；Supabase best-practices 的影響限於保留權威 RPC 後重讀、避免額外 courts round trip，並用 pgTAP/local API/local e2e 證實資料邊界沒有退化。

[不確定] 無。
