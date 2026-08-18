# 批 1d 回報：重複判準收斂＋dataApi 錯誤形狀統一

## 1. 結論與共用模組設計

結論：未定案候選局、滿員／可加入、haversine、台北時區計算均已各自收斂到單一定義點；dataApi 的 17 個 `if (error) throw error;` 裸拋歸零，另將同形狀的 `restoreError` 裸拋一併收斂。既有 pin、篩選／排序、時間格式、toast／錯誤文字、retry 與 mock fallback 均維持不變。

基準為 `HEAD f2bdfeede7aaa47f6ace1514b97bd69b6052f391`。

### `src/sessionCriteria.js`

位置：`src/sessionCriteria.js:1–41`；零 import，不依賴 map 或 view。

- `isUndecidedCandidate(session)`：候選類型且 `decidedAt` 為 falsy。
- `isSessionFull(session)`：`status=full`，或 `slotsRemaining` 有值且數值小於等於 0；缺值不誤判滿員。
- `isJoinableSession(session)`：`status=open` 且不是滿員。
- `distanceMeters(left, right)`：唯一 haversine，接受 `{lat,lng}` 與 `{courtLat,courtLng}`，無有效座標回傳 `Infinity`。

`filters.js` 仍從原路徑 re-export `isJoinableSession`，因此既有 import surface 不變。

### `src/taipeiTime.js`

位置：`src/taipeiTime.js:1–105`；只 import `config.js` 的 `TAIPEI_TIME_ZONE`，不依賴 sessionViews 或 map。

- 固定 UTC+8 的 `taipeiParts/taipeiClock/taipeiHourRange/taipeiDateKey/isTaipeiWeekend` 共用同一 offset。
- `taipeiDateTime` 保留原本 `zh-TW`、Asia/Taipei、月／日／週／24 小時格式。
- `taipeiLocalDateTimeToIso/taipeiDateTimeLocalValue` 保留 datetime-local 的檢核、秒／毫秒與 ISO 轉換。
- `sessionViews.js` re-export `taipeiLocalDateTimeToIso`，既有測試與公開 import surface 不變。

### String() 寬鬆轉型取捨

最終採 filters 原本的 `String(session?.venueType) === "candidates"`。dataApi 的 `SessionSummary.venueType` mapper 與 mock fixture 都提供字串，所以對正常資料，map 原本的 strict equality 與 `String()` 完全等價；差異只存在於違反資料合約、但自訂 `toString()` 恰回傳 `"candidates"` 的物件。採 `String()` 同時保留 filters 的既有寬鬆語意，且不縮窄正常 map/controller/view 輸入。

### full／joinable 等價性

map 原本已明確保護 `slotsRemaining == null` 不判滿，filters 的既有測試也凍結相同語意；共同定義採此語意。正常 `SessionSummary` 的 `slotsRemaining` 是數字，故 controller 原本的 `Number(slotsRemaining) <= 0` 與共同函式等價。唯一差異是違反資料合約的 null 缺值：controller 現在與 map/filters 一致，不再因 `Number(null) === 0` 誤判滿員；正常使用者資料無可觀察差異。

## 2. 變更清單（最終檔案行號）

- `src/sessionCriteria.js:1–41`：新增唯一 session 判準與 haversine 模組。
- `src/taipeiTime.js:1–105`：新增唯一台北時間解析、顯示與 datetime-local 轉換模組。
- `src/filters.js:1–4、69–180`：改用共同候選判準、joinable、haversine 與台北日期 helper；保留 `isJoinableSession` re-export。
- `src/map.js:1–4、83–129`：候選 fan-out、full pin 與 pin 時間改用共用模組。
- `src/playerPresence.js:1、30`：50 公尺 throttle 改用共同 haversine。
- `src/sessionViews.js:1–17、512–911、1044、3973–4096`：移除本地 offset/Intl/候選鏡像，改 import 共用 helper；既有 `taipeiLocalDateTimeToIso` export 不變。
- `src/sessionController.js:10、263、372–378、762、1175、1907–1937`：full/候選判準改用共用 helper，並修正 registry release rider。
- `src/dataApi.js:193–211、567–574、640–1177`：新增共同錯誤基底／包裝器；17 個 exact 裸拋與 1 個 restore 裸拋改成 typed wrapper。
- `docs/migration-reports/batch-1d.md`：本回報。
- `tests/`：零修改、零新增。

## 3. grep 前後對照

```text
項目                                                        HEAD   最終
未定案候選局直接 candidate+decidedAt 判準                    10      1
function distanceMeters 定義                                  2      1
台北時間計算模組／套數                                         3      1
TAIPEI_(UTC_)?OFFSET_MS 定義                                   2      1
dataApi: if (error) throw error;                              17      0
dataApi: if (restoreError) throw restoreError;                 1      0
full/joinable 的 status+slots 直接判準                          4      1
```

最終四個共用定義：

```text
src/sessionCriteria.js:15 export function isUndecidedCandidate(session) {
src/sessionCriteria.js:19 export function isSessionFull(session) {
src/sessionCriteria.js:24 export function isJoinableSession(session) {
src/sessionCriteria.js:28 export function distanceMeters(left, right) {
```

未定案候選局的 10 個 HEAD 直接鏡像分布為 filters 2、map 1、controller 3、sessionViews 4；最終全庫直接 `venueType+candidates+decidedAt` 只剩 `sessionCriteria.js:16` 一處。

> 驗收方修正（2026-08-18）：本節兩處 tally 原為手數 off-by-one（候選鏡像 9→10、controller 2→3；
> full/joinable HEAD 3→4，漏數 staleIntentMessage 站點與一處跨行站點），由 read-back 以指令計數
> 修正；working tree 收斂結果不受影響（反向 grep 零殘留）。

full/joinable 最終直接公式只剩 `sessionCriteria.js:20–21`。`filters.js:126` 的 `(status === "open" || status === "full")` 是探索面「哪些狀態仍顯示」的 allowlist，不讀 slots、不是 full/joinable 判準；`isOngoingSessionWithVacancy` 與 sessionViews 的 vacancy/scoreboard 是時間排序或純顯示格式，也不是加入資格，故保留。

台北時間最終計算 anchors 全在共用模組：

```text
src/taipeiTime.js:3  TAIPEI_UTC_OFFSET_MS
src/taipeiTime.js:16 UTC+8 parts conversion
src/taipeiTime.js:54 zh-TW Intl formatter
src/taipeiTime.js:89 datetime-local → ISO offset conversion
```

`config.js` 的 `TAIPEI_TIME_ZONE = "Asia/Taipei"` 是既有設定值，不是第二套計算實作。

dataApi 最終 18 個包裝點清單（17 個 `error`＋1 個 `restoreError`）：

```text
640, 662, 682, 701, 717, 728, 740, 756, 769,
780, 788, 801, 812, 1120, 1136, 1160, 1166, 1177
```

以上均為 `throw asDataApiError(...)`；`if (error) throw error;` 與 `if (restoreError) throw restoreError;` 最終清單皆為空。

## 4. 未定案候選判準有牙 canary

未修改測試。暫時把 `isUndecidedCandidate()` 改為恆回 false，執行：

`node --test --test-name-pattern='undecided candidate sessions fan out to valid candidate courts and collapse to the decided court' tests/session-controller.test.js`

紅色輸出逐字（exit code 1）：

```text
TAP version 13
# Subtest: undecided candidate sessions fan out to valid candidate courts and collapse to the decided court
not ok 1 - undecided candidate sessions fan out to valid candidate courts and collapse to the decided court
  ---
  duration_ms: 2.074375
  type: 'test'
  location: '/Users/ian/tennisPartnerFinder/tests/session-controller.test.js:2844:1'
  failureType: 'testCodeFailure'
  error: |-
    the scan must find both catalogue-backed candidate courts

    1 !== 2

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 2
  actual: 1
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/ian/tennisPartnerFinder/tests/session-controller.test.js:2856:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.start (node:internal/test_runner/test:944:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:296:17)
  ...
1..1
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 47.802584
```

還原後同一命令綠色輸出逐字（exit code 0）：

```text
TAP version 13
# Subtest: undecided candidate sessions fan out to valid candidate courts and collapse to the decided court
ok 1 - undecided candidate sessions fan out to valid candidate courts and collapse to the decided court
  ---
  duration_ms: 2.231875
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 49.925459
```

## 5. haversine 有牙 canary

未修改測試。暫時把共同 haversine 的成功結果改成固定 0，執行：

`node --test --test-name-pattern='drawer distance sorting anchors undecided candidates to their nearest catalogue court' tests/session-data-boundary.test.js`

紅色輸出逐字（exit code 1）：

```text
TAP version 13
# Subtest: drawer distance sorting anchors undecided candidates to their nearest catalogue court
not ok 1 - drawer distance sorting anchors undecided candidates to their nearest catalogue court
  ---
  duration_ms: 1.816792
  type: 'test'
  location: '/Users/ian/tennisPartnerFinder/tests/session-data-boundary.test.js:857:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected

      [
    +   1,
        2,
    -   1
      ]

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    0: 2
    1: 1
  actual:
    0: 1
    1: 2
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/ian/tennisPartnerFinder/tests/session-data-boundary.test.js:876:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.start (node:internal/test_runner/test:944:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:296:17)
  ...
1..1
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 69.421625
```

還原後同一命令綠色輸出逐字（exit code 0）：

```text
TAP version 13
# Subtest: drawer distance sorting anchors undecided candidates to their nearest catalogue court
ok 1 - drawer distance sorting anchors undecided candidates to their nearest catalogue court
  ---
  duration_ms: 1.338084
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 67.649416
```

## 6. dataApi 錯誤形狀與 caller 影響分析

### 統一形狀

`DataApiError`（`src/dataApi.js:193–200`）是共同基底，固定提供 `message/name/code/cause`。`asDataApiError()`（567–574）對 view/auth 讀寫錯誤作最小型別包裝：

- `message` 原樣保留；沒有 message 時仍是空字串，caller 的既有 fallback 文案照常生效。
- `code` 原樣保留，chat 等 code 分支不變。
- 原生 `Error.name` 也保留；既有 `initial auth restoration...` 測試曾在第一輪抓到此合約，修正後原樣全綠。
- 原錯誤放在 `cause`，不丟失除錯資訊。

`SessionActionError` 與 `DataApiUnavailableError` 改繼承 `DataApiError`，但保留原 class、`instanceof`、name、message、code 與 cause。RPC 的 P0001 allowlist 及中文 `ACTION_MESSAGES` 映射沒有更動。

### 逐 catch 點前後行為

| dataApi 路徑 | caller catch | 包裝前後可見行為 |
| --- | --- | --- |
| `loadCourts` | `main.js:1281–1306` | 同樣清空 catalogue、標 error、toast「球場資料暫時無法載入。」 |
| `loadSessionDiscovery` | `sessionController.js:998–1028` | normal load 同樣清 rows、關 detail、顯示「球局資料暫時無法載入。」 |
| `loadSessionDiscovery` | `sessionController.js:1054–1066` | quiet poll 同樣吞錯、保留既有畫面並回 false |
| `loadPlayerPresenceDirectory` | `sessionController.js:878–908` | 同樣清 player layer、顯示「在線資料暫時無法載入。」 |
| `loadPlayerDirectory`＋presence | `sessionController.js:956–988` | Promise 任一失敗仍設 directory `status:error`，不顯示 raw message |
| `loadSessionSummary` | `sessionController.js:1230–1253` | deep link 同樣回 `{status:"unavailable"}` |
| `loadSessionSummary` | `sessionController.js:1923–1933` | decision 同樣換成「候選球局暫時無法載入，請稍後再試。」 |
| `loadSessionSummary` | `sessionController.js:2212–2220` | intent resume 同樣保留判斷並 toast「暫時無法確認這個球局，請稍後再試。」 |
| `loadMySessions` | `sessionController.js:828–859` | 同樣保留舊 private rows、設「我的球局暫時無法載入。」 |
| `loadSessionRoster` | `sessionController.js:674–703` | per-row catch 同樣標 roster failure，最後顯示固定待審核錯誤 |
| `loadSessionMessages`＋roster | `sessionController.js:1282–1310` | chat 同樣保留舊 messages/roster，顯示「群組訊息暫時無法載入。」 |
| `loadSessionJoinPreview` | `sessionController.js:607–623` | 同樣切 preview `status:error`，不顯示 raw message |
| `loadMyPlayerBlocks` | `sessionController.js:712–732` | 同樣顯示「封鎖清單暫時無法載入。」 |
| `loadCurrentProfile` | `main.js:1314–1334` | 同樣轉成既有固定「個人檔案暫時無法載入…」；已知 profile 不被空白覆蓋 |
| `loadCurrentProfile`（profile save 後 reload） | `sessionController.js:2107–2132` → `sessionViews.js:1259–1277` | wrapper 保留 raw message，原本會顯示的 message 仍逐字相同；`DataApiUnavailableError` 專用 demo 文案分支仍成立 |
| notification prefs＋court subscriptions | `main.js:837–860` | Promise 任一失敗仍顯示固定「通知設定暫時無法載入，請稍後再試。」 |
| initial `getSession/setSession` | `main.js:1386–1405` | 同樣吞暫時錯誤、保留可恢復 intent；直接單元測試的 Error name/message 亦不變 |
| OAuth sign-in | `sessionViews.js:1259–1277` | login action 仍使用來源 message；wrapper 原樣保留 message/name/code |
| `signOut` | `main.js:394–400` | 同樣 toast「登出失敗，請稍後再試。」 |
| `linkIdentity` | `main.js:351–358` | 同樣清 return key、toast「連結啟動失敗，請稍後再試。」 |

RPC caller 的特殊分支也不變：例如 `sessionController.js:1370–1373` 仍以 `error.code === "SESSION_ARCHIVED"` 將聊天切 archived；join/withdraw/lifecycle/report/profile 表單仍讀相同 `error.message`。原因是 `SessionActionError` 只增加共同基底，既有 code/message 映射未改。

## 7. 批 1c rider

HEAD `transition()` 一律以 `(name, nextOptions)` 動態呼叫 action；對 `release(name, expected)` 而言，options 會錯落到 expected handle。最終 `src/sessionController.js:375–378` 先解析 action 與 declarative `expected`：

```text
release → registry.release(name, expected)
close   → registry.close(name, itemOptions 或 transitionOptions, expected)
```

現有 release 表項（openCourt/openCreate/openDecision/openDetail/openEdit/openPlayer）呼叫 `transitionSurfaces` 時都不帶共享 options，因此舊 bug 的第二參數實際是 `undefined`，會觸發 default expected，現行行為不受影響。唯一帶共享 options 的 `openPlayerCourt` 使用預設 close action，不走 release。故無既有可達路徑能把非 undefined options 餵進 release；若要寫 runtime 測試必須 export 私有 registry 或為測試加入無業務意義的 options，兩者都擴張 surface／改 production 路徑。本批不為 latent 私有 API 新增測試，以 code 分流及完整 113 controller 測試驗證。

## 8. canary SHA-256 還原對照

兩組 canary 都只暫改 `sessionCriteria.js`；下表仍對本批全部八個 source 逐檔核對，前後完全一致：

```text
                             canary 前                                                         還原後
src/dataApi.js           bcf307c29be79f45f1c6347651afea29d05365fc79cb8a824d06c1f4f1d01335  bcf307c29be79f45f1c6347651afea29d05365fc79cb8a824d06c1f4f1d01335
src/filters.js           f6a1bfedbdd63f6f4bddb65fe597b137495ca60ad2ee2472010a1830e31ef288  f6a1bfedbdd63f6f4bddb65fe597b137495ca60ad2ee2472010a1830e31ef288
src/map.js               439cc16806e9b89f759c3d782f4b07a24913ac8a0ae575c3e74653f7c933c59b  439cc16806e9b89f759c3d782f4b07a24913ac8a0ae575c3e74653f7c933c59b
src/playerPresence.js    c5766a093e8bd078d121e0f2b4dc0869dc8ccadc9e0e4ac98ea2d6464bf274ff  c5766a093e8bd078d121e0f2b4dc0869dc8ccadc9e0e4ac98ea2d6464bf274ff
src/sessionController.js 383ff7a5e039e3a17c6a9f71ef7561e4dfa069e695a6ba1daa1d24036fd4714a  383ff7a5e039e3a17c6a9f71ef7561e4dfa069e695a6ba1daa1d24036fd4714a
src/sessionViews.js      1d8704121d96f7f39159564bb7ae3772b6e8eb818560b9cfa38d367a9f6a1491  1d8704121d96f7f39159564bb7ae3772b6e8eb818560b9cfa38d367a9f6a1491
src/sessionCriteria.js   8dd3b925c035465780a6400dc7a85272c52e6e0e01be5502bcf6f92e963fc71b  8dd3b925c035465780a6400dc7a85272c52e6e0e01be5502bcf6f92e963fc71b
src/taipeiTime.js        2630eee54c57dc8cf385e60b83e3e3be9f1b3fabab15eec1a9cda8d8b96c423f  2630eee54c57dc8cf385e60b83e3e3be9f1b3fabab15eec1a9cda8d8b96c423f
```

## 9. 測試與四個最終 gate

獨立 controller：113/113；完整 `npm run test:session-unit`：246/246。以下均在 canary 還原後的 production source 執行。

### `npm run test:mock`

結尾輸出逐字（exit code 0）：

```text
  ✓  246 [mobile-chromium] › tests/smoke.spec.js:5082:1 › the profile sheet still offers all four practice types (130ms)
  ✓  247 [mobile-chromium] › tests/smoke.spec.js:5102:1 › the type filter offers three chips and no longer lists 對拉 (186ms)
  ✓  248 [mobile-chromium] › tests/smoke.spec.js:5115:1 › subscribing to every Taipei court collapses the picker and reopens on demand (237ms)
  ✓  249 [mobile-chromium] › tests/smoke.spec.js:5160:1 › an unloaded court catalogue shows no subscription count (142ms)
  ✓  250 [mobile-chromium] › tests/smoke.spec.js:5183:1 › openFilterSheet mounts a dialog with six data-filter groups and closes on Escape (140ms)
  ✓  251 [mobile-chromium] › tests/smoke.spec.js:5220:1 › the filter sheet applies a district change immediately to the background drawer summary and keeps keyboard focus off body (147ms)
  ✓  252 [mobile-chromium] › tests/smoke.spec.js:5286:1 › closing and reopening the filter sheet three times does not stack delegated listeners on the shared sheet root (513ms)
  ✓  253 [mobile-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.4s)
  ✓  254 [mobile-chromium] › tests/smoke.spec.js:5359:1 › the filter sheet traps Tab focus between its own first and last controls (217ms)

  4 skipped
  250 passed (2.2m)
```

### `npm run test:local`

測試庫可直接通過，未執行 `db:reset:test`。結尾輸出逐字（exit code 0）：

```text
  ✓  41 [supabase-chromium] › tests/session.spec.js:1535:1 › a session deep link survives the auth restore that lands after the sheet opened (2.1s)
  ✓  42 [supabase-chromium] › tests/session.spec.js:1566:1 › accepted members exchange escaped chat, manage blocks, and retain archived read-only history (3.2s)
  ✓  43 [supabase-chromium] › tests/session.spec.js:1689:1 › a new chat message raises the recipient's unread badge and nav dot, and opening chat clears both against the real database (1.6s)
  ✓  44 [supabase-chromium] › tests/session.spec.js:1764:1 › blocking a sender drops their messages from both the unread count and the visible chat feed, keeping the two in lockstep (498ms)
  ✓  45 [supabase-chromium] › tests/session.spec.js:1837:1 › the Me profile entry edits without a gate and refreshes the identity card in place (554ms)
  ✓  46 [supabase-chromium] › tests/session.spec.js:1877:1 › every Me control keeps focus through a background rerender (11.3s)
  ✓  47 [supabase-chromium] › tests/session.spec.js:1955:1 › the discovery empty-state subscribe shortcut opens Me and focuses the notification settings heading on real auth (1.6s)
  ✓  48 [supabase-chromium] › tests/session.spec.js:1987:1 › checking the last court collapses the picker without dropping focus to body (475ms)
  ✓  49 [supabase-chromium] › tests/session.spec.js:2036:1 › neutral counts stay hidden at zero and appear on all three surfaces once a session is played (2.5s)
  ✓  50 [supabase-chromium] › tests/session.spec.js:2156:1 › a brand-new account is subscribed to every active Taipei court when it first saves a profile (760ms)
  ✓  51 [supabase-chromium] › tests/session.spec.js:2180:1 › N1 an existing zero-subscription account is never seeded by a later profile save (766ms)
  ✓  52 [supabase-chromium] › tests/session.spec.js:2199:1 › N2 an account that explicitly cleared every court stays at zero across later profile saves (1.2s)
  ✓  53 [supabase-chromium] › tests/session.spec.js:2226:1 › N3 a failing subscription seed never fails the profile save (675ms)

  11 skipped
  42 passed (1.4m)
```

同一命令前段 local API 測試亦通過；整體 exit code 0。

### `npm run build`

結尾輸出逐字（exit code 0）：

```text
> tennis-partner-finder@0.1.0 build
> vite build

vite v6.4.3 building for production...
transforming...
✓ 71 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-D3iryHT3.js   488.67 kB │ gzip: 131.75 kB
✓ built in 559ms
```

### `git diff --check`

完整輸出逐字（exit code 0）：

```text
```

## 10. diff、白名單與 tests 稽核

`git diff --stat`（tracked source；未追蹤的新模組與回報不會列入）：

```text
 src/dataApi.js           |  64 ++++++++++++++++++------------
 src/filters.js           |  82 +++++++-------------------------------
 src/map.js               |  32 +++------------
 src/playerPresence.js    |  17 +-------
 src/sessionController.js |  18 +++++----
 src/sessionViews.js      | 100 +++++++++--------------------------------------
 6 files changed, 90 insertions(+), 223 deletions(-)
```

新模組 no-index stat：

```text
 /dev/null => src/sessionCriteria.js | 41 +++++++++++++++++++++++++++++++++++++
 1 file changed, 41 insertions(+)
 /dev/null => src/taipeiTime.js | 105 +++++++++++++++++++++++++++++++++++++++++
 1 file changed, 105 insertions(+)
```

本回報 no-index stat：

```text
 /dev/null => docs/migration-reports/batch-1d.md | 423 ++++++++++++++++++++++++
 1 file changed, 423 insertions(+)
```

最終 `git status --short`：

```text
 M src/dataApi.js
 M src/filters.js
 M src/map.js
 M src/playerPresence.js
 M src/sessionController.js
 M src/sessionViews.js
?? docs/migration-reports/batch-1d.md
?? src/sessionCriteria.js
?? src/taipeiTime.js
```

全部路徑均在凍結白名單內。`git diff -- tests` 與 `git status --short -- tests` 完整輸出皆為空；tests 零修改、零新增。未 commit、未 push。
