# F0-7 執行回報：靜態掃描計數斷言改清單推導

- 日期：2026-08-25
- 派工單：`docs/arch-dispatch-2026-08-25-F0-7.md`
- 開工 HEAD：`422906a`
- 實作 HEAD：`e4dfc70`
- 實作基準：`422906a`（其前一 commit 為批 3A 驗收收錄 `55902f9`）
- 分支：`main`
- 結論：[已驗證] sheet adapter、unmount registration、eager module、lazy sheet、imperative adapter、presentation consumer 六組靜態契約已由單一具名 manifest 推導；掃描非空、無重複與逐元素比對均有守門，兩個方向的 canary 都會點名漂移項目。
- 提交／推送：[已驗證] 純測試重構已提交為 `e4dfc70`；本回報不列入實作 commit，未 push。

## 1. Commit 與變更檔案

```text
$ git log --oneline 422906a..HEAD
e4dfc70 test(arch): derive surface guards from manifest

$ git show --stat --oneline --summary e4dfc70
e4dfc70 test(arch): derive surface guards from manifest
 tests/fixtures/surfaceManifest.js           | 78 +++++++++++++++++++++++++++++
 tests/react-surface-lifecycle.test.js       | 40 ++++++++++++---
 tests/session-presentation-boundary.test.js | 31 +++++-------
 3 files changed, 123 insertions(+), 26 deletions(-)
 create mode 100644 tests/fixtures/surfaceManifest.js
```

| 檔案 | 一句話摘要 |
| --- | --- |
| `tests/fixtures/surfaceManifest.js` | 新增唯一 `SURFACE_MANIFEST`，以 frozen 具名路徑／識別字清單保存六組測試契約。 |
| `tests/react-surface-lifecycle.test.js` | sheet、unmount、imperative、eager、lazy 掃描改為非空＋無重複＋集合逐元素比對，既有逐檔行為斷言保留。 |
| `tests/session-presentation-boundary.test.js` | presentation consumer 改為掃描全部 TSX 的實際 import，再與 manifest 逐元素比對。 |

[已驗證] 本批沒有修改任何 `src/`、`.claude/rules/`、runtime、E2E 或 DB 檔案。

## 2. Manifest 形狀

唯一 manifest 匯出一個 frozen object；每個集合也經 `namedList()` freeze：

```text
SURFACE_MANIFEST
├─ sheetAdapters           repo-relative TSX paths
├─ unmountRegistrations    register*Content identifiers
├─ eagerModules            repo-relative TSX paths
├─ lazySheets              repo-relative TSX paths
├─ imperativeAdapters      repo-relative TSX paths
└─ presentationConsumers   repo-relative TSX paths
```

實際鍵位置：

```text
$ rg -n '^  (sheetAdapters|unmountRegistrations|eagerModules|lazySheets|imperativeAdapters|presentationConsumers):' tests/fixtures/surfaceManifest.js
4:  sheetAdapters: namedList([
20:  unmountRegistrations: namedList([
36:  eagerModules: namedList(["src/app/App.tsx", "src/sheets/SessionDetailSheet.tsx"]),
37:  lazySheets: namedList([
52:  imperativeAdapters: namedList([
62:  presentationConsumers: namedList([
```

`unmountRegistrations` 額外保存 identifier，是因原本 `registerUnmount` 的 14 只是一個 call count；若只改成 `sheetAdapters.length` 仍無法指出漏掉哪一個 registration。現在實際掃描 `register*Content` 名稱並逐元素比對。

共用的 `assertExactNamedScan(actual, expected, label)` 在每個掃描上依序驗證：

1. `actual.length > 0`，防止空集合假綠。
2. `new Set(actual).size === actual.length`，防止重複名稱被排序掩蓋。
3. 排序後 `deepEqual` manifest，缺一、多一都由 Node diff 顯示實際名稱。

兩個測試檔各保留一個小型 assertion helper，但所有契約資料只有 manifest 一份；沒有把清單複製回測試檔。

## 3. 計數字面：前後 grep

### 3.1 前

```text
$ for target_file in tests/react-surface-lifecycle.test.js tests/session-presentation-boundary.test.js; do
    git show "422906a:$target_file" | rg -n \
      'all 14 (React sheet|presentation)|sheetSources\.length, 14|registerUnmount.*length, 14|imperativeAdapters\.length, 8|eager: true.*length, 2|lazySheetList.*length, 13|REACT_CONSUMERS\.length, 14'
  done
40:test("all 14 React sheet adapters register tracked SurfaceHost portal content", () => {
46:  assert.equal(sheetSources.length, 14);
56:  assert.equal((SESSION_VIEWS.match(/mounted\.registerUnmount\(content\.unmount\)/g) ?? []).length, 14);
62:  assert.equal(imperativeAdapters.length, 8);
103:  assert.equal((SESSION_VIEWS.match(/eager: true/g) ?? []).length, 2, "only App and Session Detail stay eager");
105:  assert.equal((lazySheetList.match(/\.\/sheets\/.+?\.tsx/g) ?? []).length, 13);
111:test("all 14 presentation consumers depend on the TypeScript boundary", () => {
112:  assert.equal(REACT_CONSUMERS.length, 14);
```

### 3.2 後

```text
$ rg -n \
    'all 14 (React sheet|presentation)|sheetSources\.length, 14|registerUnmount.*length, 14|imperativeAdapters\.length, 8|eager: true.*length, 2|lazySheetList.*length, 13|REACT_CONSUMERS\.length, 14' \
    tests/react-surface-lifecycle.test.js tests/session-presentation-boundary.test.js
# no matches
```

[已驗證] 派工單點名的 14／13／8／2 計數與測試標題字面已歸零。

### 3.3 刻意保留的行為數字

`surfaceContent.commit` 的 3 依派工單允許保留，而且它驗的是 Session Detail 三個 imperative method body 的行為，不是 sheet manifest 成員數：

```text
$ rg -n 'assert\.(?:equal|ok)\([^\n]*(?:length|match)[^\n]*, (?:3|13|21)\b' \
    tests/react-surface-lifecycle.test.js tests/session-presentation-boundary.test.js
tests/react-surface-lifecycle.test.js:135:  assert.equal((APP.match(/Request \?\?= import\("\.\.\/pages\//g) ?? []).length, 3);
tests/react-surface-lifecycle.test.js:163:  assert.equal((contractBody.match(/surfaceContent\.commit\(/g) ?? []).length, 3);
tests/session-presentation-boundary.test.js:114:  assert.equal((presentation.match(/Object\.freeze/g) ?? []).length, 13);
```

[已驗證] 另兩個數字分別守 App 三個 non-home page dynamic imports 與 presentation runtime freeze 數，並非本單點名的 sheet／eager／consumer 集合。本批依「不順手擴充掃描涵蓋面」保留；若未來也要清單化，建議另立小項，避免把不同契約塞進 surface manifest。

## 4. 既有行為性斷言未弱化

- 每個 sheet 仍逐檔禁止獨立 React root 與直接 `flushSync`。
- 每個 sheet 仍逐檔驗證公開 unmount contract。
- 每個 imperative adapter 仍逐檔要求 `surfaceContent.commit(`。
- lazy glob 內的 `eager:` 禁令原樣保留。
- `surfaceContent.commit` 恰 3 與三個 method body 各自 commit 的斷言原樣保留。
- F0-9 的 sync helper、leaf import 與三個 approved callers 斷言未改。
- presentation consumer 守門由「只走訪手寫陣列」加強為「掃描所有 TSX 實際 consumer 後比對 manifest」，可同時抓新增未登錄與 manifest 殘留。

## 5. 聚焦基線

canary 前初始聚焦基線為 13/13 passed（`duration_ms 131.632125`）。以下保留 Canary B 還原後同一組兩檔測試的完整最終輸出；它也是後續標準矩陣前的乾淨基線：

```text
$ node --test tests/react-surface-lifecycle.test.js tests/session-presentation-boundary.test.js
TAP version 13
# Subtest: all React sheet adapters register tracked SurfaceHost portal content
ok 1 - all React sheet adapters register tracked SurfaceHost portal content
  ---
  duration_ms: 1.8945
  type: 'test'
  ...
# Subtest: synchronous React commits stay behind one fail-closed helper and three approved callers
ok 2 - synchronous React commits stay behind one fail-closed helper and three approved callers
  ---
  duration_ms: 19.255833
  type: 'test'
  ...
# Subtest: non-home pages and sheets stay behind explicit preloadable module boundaries
ok 3 - non-home pages and sheets stay behind explicit preloadable module boundaries
  ---
  duration_ms: 0.255209
  type: 'test'
  ...
# Subtest: surface close unmounts React before clearing DOM and remains idempotent
ok 4 - surface close unmounts React before clearing DOM and remains idempotent
  ---
  duration_ms: 0.1415
  type: 'test'
  ...
# Subtest: Session Detail blocks both direct and async commits after its surface dies
ok 5 - Session Detail blocks both direct and async commits after its surface dies
  ---
  duration_ms: 0.361208
  type: 'test'
  ...
# Subtest: session action messages stay complete and exact in the UI layer
ok 6 - session action messages stay complete and exact in the UI layer
  ---
  duration_ms: 65.356834
  type: 'test'
  ...
# Subtest: every TSX module stays outside the legacy sessionViews dependency edge
ok 7 - every TSX module stays outside the legacy sessionViews dependency edge
  ---
  duration_ms: 1.086458
  type: 'test'
  ...
# Subtest: all presentation consumers depend on the TypeScript boundary
ok 8 - all presentation consumers depend on the TypeScript boundary
  ---
  duration_ms: 1.229958
  type: 'test'
  ...
# Subtest: the presentation boundary cannot reach back into the legacy view adapter
ok 9 - the presentation boundary cannot reach back into the legacy view adapter
  ---
  duration_ms: 0.25775
  type: 'test'
  ...
# Subtest: session schedule and host-initial presentation preserve chat labels
ok 10 - session schedule and host-initial presentation preserve chat labels
  ---
  duration_ms: 4.166916
  type: 'test'
  ...
# Subtest: batch 27 guard rationale and corrected acceptance claims stay explicit
ok 11 - batch 27 guard rationale and corrected acceptance claims stay explicit
  ---
  duration_ms: 1.00975
  type: 'test'
  ...
# Subtest: sessionViews keeps compatibility exports without redefining React runtimes
ok 12 - sessionViews keeps compatibility exports without redefining React runtimes
  ---
  duration_ms: 0.3245
  type: 'test'
  ...
# Subtest: sessionViews re-exports the exact presentation runtime objects
ok 13 - sessionViews re-exports the exact presentation runtime objects
  ---
  duration_ms: 3.925459
  type: 'test'
  ...
1..13
# tests 13
# suites 0
# pass 13
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 132.780208
```

## 6. Canary A：manifest 外新增假 sheet

以 `apply_patch` 暫加 `src/sheets/CanarySheet.tsx`，內容包含 `mountSurfaceContent(` 與 `return surfaceContent` adapter 樣板，但不修改 manifest。

```text
$ node --test tests/react-surface-lifecycle.test.js
TAP version 13
# Subtest: all React sheet adapters register tracked SurfaceHost portal content
not ok 1 - all React sheet adapters register tracked SurfaceHost portal content
  ---
  duration_ms: 4.541125
  type: 'test'
  location: '/Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:51:1'
  failureType: 'testCodeFailure'
  error: |-
    React sheet adapter differs from the surface manifest
    + actual - expected

      [
    +   'src/sheets/CanarySheet.tsx',
        'src/sheets/CourtPlayersSheet.tsx',
        'src/sheets/CourtSessionSheet.tsx',
        'src/sheets/CreateSessionSheet.tsx',
        'src/sheets/DecideSessionSheet.tsx',
        'src/sheets/EditSessionSheet.tsx',

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    0: 'src/sheets/CourtPlayersSheet.tsx'
    1: 'src/sheets/CourtSessionSheet.tsx'
    2: 'src/sheets/CreateSessionSheet.tsx'
    3: 'src/sheets/DecideSessionSheet.tsx'
    4: 'src/sheets/EditSessionSheet.tsx'
    5: 'src/sheets/FilterSheet.tsx'
    6: 'src/sheets/PlayerCardSheet.tsx'
    7: 'src/sheets/PlayerDirectorySheet.tsx'
    8: 'src/sheets/ProfileCompletionSheet.tsx'
    9: 'src/sheets/ReportDialog.tsx'
    10: 'src/sheets/SessionChatSheet.tsx'
    11: 'src/sheets/SessionDetailSheet.tsx'
    12: 'src/sheets/SessionUnavailableSheet.tsx'
    13: 'src/sheets/WithdrawSessionConfirmationDialog.tsx'
  actual:
    0: 'src/sheets/CanarySheet.tsx'
    1: 'src/sheets/CourtPlayersSheet.tsx'
    2: 'src/sheets/CourtSessionSheet.tsx'
    3: 'src/sheets/CreateSessionSheet.tsx'
    4: 'src/sheets/DecideSessionSheet.tsx'
    5: 'src/sheets/EditSessionSheet.tsx'
    6: 'src/sheets/FilterSheet.tsx'
    7: 'src/sheets/PlayerCardSheet.tsx'
    8: 'src/sheets/PlayerDirectorySheet.tsx'
    9: 'src/sheets/ProfileCompletionSheet.tsx'
    10: 'src/sheets/ReportDialog.tsx'
    11: 'src/sheets/SessionChatSheet.tsx'
    12: 'src/sheets/SessionDetailSheet.tsx'
    13: 'src/sheets/SessionUnavailableSheet.tsx'
    14: 'src/sheets/WithdrawSessionConfirmationDialog.tsx'
  operator: 'deepStrictEqual'
  stack: |-
    assertExactNamedScan (file:///Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:44:10)
    TestContext.<anonymous> (file:///Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:57:3)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.start (node:internal/test_runner/test:944:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:296:17)
  ...
# Subtest: synchronous React commits stay behind one fail-closed helper and three approved callers
ok 2 - synchronous React commits stay behind one fail-closed helper and three approved callers
  ---
  duration_ms: 21.261833
  type: 'test'
  ...
# Subtest: non-home pages and sheets stay behind explicit preloadable module boundaries
ok 3 - non-home pages and sheets stay behind explicit preloadable module boundaries
  ---
  duration_ms: 0.343833
  type: 'test'
  ...
# Subtest: surface close unmounts React before clearing DOM and remains idempotent
ok 4 - surface close unmounts React before clearing DOM and remains idempotent
  ---
  duration_ms: 0.074084
  type: 'test'
  ...
# Subtest: Session Detail blocks both direct and async commits after its surface dies
ok 5 - Session Detail blocks both direct and async commits after its surface dies
  ---
  duration_ms: 0.346625
  type: 'test'
  ...
1..5
# tests 5
# suites 0
# pass 4
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 69.744333
exit=1
```

[已驗證] 紅燈訊息直接點名 manifest 外的 `src/sheets/CanarySheet.tsx`。

刪除暫存 canary 檔後，以相同指令還原為綠：

```text
$ node --test tests/react-surface-lifecycle.test.js
TAP version 13
# Subtest: all React sheet adapters register tracked SurfaceHost portal content
ok 1 - all React sheet adapters register tracked SurfaceHost portal content
  ---
  duration_ms: 2.025208
  type: 'test'
  ...
# Subtest: synchronous React commits stay behind one fail-closed helper and three approved callers
ok 2 - synchronous React commits stay behind one fail-closed helper and three approved callers
  ---
  duration_ms: 10.988
  type: 'test'
  ...
# Subtest: non-home pages and sheets stay behind explicit preloadable module boundaries
ok 3 - non-home pages and sheets stay behind explicit preloadable module boundaries
  ---
  duration_ms: 0.284917
  type: 'test'
  ...
# Subtest: surface close unmounts React before clearing DOM and remains idempotent
ok 4 - surface close unmounts React before clearing DOM and remains idempotent
  ---
  duration_ms: 0.15
  type: 'test'
  ...
# Subtest: Session Detail blocks both direct and async commits after its surface dies
ok 5 - Session Detail blocks both direct and async commits after its surface dies
  ---
  duration_ms: 0.383
  type: 'test'
  ...
1..5
# tests 5
# suites 0
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 58.344083
```

## 7. Canary B：manifest 刪除既有項

暫時只從 `SURFACE_MANIFEST.sheetAdapters` 移除 `src/sheets/CourtPlayersSheet.tsx`，來源檔保持不動：

```text
$ node --test tests/react-surface-lifecycle.test.js
TAP version 13
# Subtest: all React sheet adapters register tracked SurfaceHost portal content
not ok 1 - all React sheet adapters register tracked SurfaceHost portal content
  ---
  duration_ms: 2.021375
  type: 'test'
  location: '/Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:51:1'
  failureType: 'testCodeFailure'
  error: |-
    React sheet adapter differs from the surface manifest
    + actual - expected

      [
    +   'src/sheets/CourtPlayersSheet.tsx',
        'src/sheets/CourtSessionSheet.tsx',
        'src/sheets/CreateSessionSheet.tsx',
        'src/sheets/DecideSessionSheet.tsx',
        'src/sheets/EditSessionSheet.tsx',
        'src/sheets/FilterSheet.tsx',

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    0: 'src/sheets/CourtSessionSheet.tsx'
    1: 'src/sheets/CreateSessionSheet.tsx'
    2: 'src/sheets/DecideSessionSheet.tsx'
    3: 'src/sheets/EditSessionSheet.tsx'
    4: 'src/sheets/FilterSheet.tsx'
    5: 'src/sheets/PlayerCardSheet.tsx'
    6: 'src/sheets/PlayerDirectorySheet.tsx'
    7: 'src/sheets/ProfileCompletionSheet.tsx'
    8: 'src/sheets/ReportDialog.tsx'
    9: 'src/sheets/SessionChatSheet.tsx'
    10: 'src/sheets/SessionDetailSheet.tsx'
    11: 'src/sheets/SessionUnavailableSheet.tsx'
    12: 'src/sheets/WithdrawSessionConfirmationDialog.tsx'
  actual:
    0: 'src/sheets/CourtPlayersSheet.tsx'
    1: 'src/sheets/CourtSessionSheet.tsx'
    2: 'src/sheets/CreateSessionSheet.tsx'
    3: 'src/sheets/DecideSessionSheet.tsx'
    4: 'src/sheets/EditSessionSheet.tsx'
    5: 'src/sheets/FilterSheet.tsx'
    6: 'src/sheets/PlayerCardSheet.tsx'
    7: 'src/sheets/PlayerDirectorySheet.tsx'
    8: 'src/sheets/ProfileCompletionSheet.tsx'
    9: 'src/sheets/ReportDialog.tsx'
    10: 'src/sheets/SessionChatSheet.tsx'
    11: 'src/sheets/SessionDetailSheet.tsx'
    12: 'src/sheets/SessionUnavailableSheet.tsx'
    13: 'src/sheets/WithdrawSessionConfirmationDialog.tsx'
  operator: 'deepStrictEqual'
  stack: |-
    assertExactNamedScan (file:///Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:44:10)
    TestContext.<anonymous> (file:///Users/ian/tennisPartnerFinder/tests/react-surface-lifecycle.test.js:57:3)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.start (node:internal/test_runner/test:944:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:296:17)
  ...
# Subtest: synchronous React commits stay behind one fail-closed helper and three approved callers
ok 2 - synchronous React commits stay behind one fail-closed helper and three approved callers
  ---
  duration_ms: 21.199583
  type: 'test'
  ...
# Subtest: non-home pages and sheets stay behind explicit preloadable module boundaries
ok 3 - non-home pages and sheets stay behind explicit preloadable module boundaries
  ---
  duration_ms: 0.31275
  type: 'test'
  ...
# Subtest: surface close unmounts React before clearing DOM and remains idempotent
ok 4 - surface close unmounts React before clearing DOM and remains idempotent
  ---
  duration_ms: 0.071334
  type: 'test'
  ...
# Subtest: Session Detail blocks both direct and async commits after its surface dies
ok 5 - Session Detail blocks both direct and async commits after its surface dies
  ---
  duration_ms: 0.352917
  type: 'test'
  ...
1..5
# tests 5
# suites 0
# pass 4
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 70.448083
exit=1
```

[已驗證] 反向漂移同樣紅燈，且點名被 manifest 漏掉的既有檔案。還原該 manifest 項後，兩個聚焦測試檔完整重跑；完整逐 subtest TAP 輸出已保留於 §5，終端摘要如下：

```text
$ node --test tests/react-surface-lifecycle.test.js tests/session-presentation-boundary.test.js
1..13
# tests 13
# suites 0
# pass 13
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

[已驗證] 兩個 canary mutation 均已完全還原，未進 commit。

## 8. 標準矩陣

### 8.1 Frontend

```text
$ npm run test:ci:frontend
typecheck: PASS
lint: PASS
prettier:check: PASS
unit: 308 passed, 0 failed
Playwright: 282 passed, 4 skipped, 1 worker
build: 504 modules transformed
production bundle check passed
main chunk: 651949 / 190267 bytes within 703886 / 203176
exit=0
```

### 8.2 DB

```text
$ npm run test:db
/Users/ian/tennisPartnerFinder/supabase/tests/courts_catalog.sql ........ ok
/Users/ian/tennisPartnerFinder/supabase/tests/my_profile_rls.sql ........ ok
/Users/ian/tennisPartnerFinder/supabase/tests/notification_rework.sql ... ok
/Users/ian/tennisPartnerFinder/supabase/tests/player_presence_rls.sql ... ok
/Users/ian/tennisPartnerFinder/supabase/tests/session_chat.sql .......... ok
/Users/ian/tennisPartnerFinder/supabase/tests/session_join_preview.sql .. ok
/Users/ian/tennisPartnerFinder/supabase/tests/session_rls.sql ........... ok
All tests successful.
Files=7, Tests=799
Result: PASS
```

### 8.3 Diff

```text
$ git diff --check 422906a HEAD
# no output; exit=0
```

## 9. `src`、testid 與 GOLDEN 凍結面

本批 changed paths 恰為 manifest 與兩個點名測試：

```text
$ git diff --name-status 422906a HEAD
A tests/fixtures/surfaceManifest.js
M tests/react-surface-lifecycle.test.js
M tests/session-presentation-boundary.test.js
```

`src` 整棵 tree 與 GOLDEN 檔 blob 在基準／HEAD 相同：

```text
src base/head: b0bebf11a81b827cc4eb15756cc56e049e1fac97 b0bebf11a81b827cc4eb15756cc56e049e1fac97
GOLDEN base/head: 83607a7208ef84b083208db86b1e6e960f005ded 83607a7208ef84b083208db86b1e6e960f005ded

$ git diff --name-only 422906a HEAD -- src .claude/rules tests/session-controller-sequence.test.js
# no output

$ git diff 422906a HEAD | rg 'data-testid|\bGOLDEN\b|\bME_GOLDEN\b'
# no output
```

[已驗證] 因 `src` tree identity 完全相同，產品 `data-testid` 集合不可能改變；兩張 GOLDEN 所在檔也逐 blob 相同，沒有重錄或註解 hunk。

## 10. 未做與最終狀態

- [已驗證] 未跑 `npm run test:local`：派工單明確豁免，且本批沒有 runtime 變更。
- [已驗證] 未做 3B／F3-2，未動 `src/` 或 `.claude/rules/`。
- [已驗證] 未把其他測試檔或其他用途的數字順手清單化；保留項已於 §3.3 列明。
- [已驗證] 未 push。

```text
$ git status --short --branch
## main...origin/main [ahead 10]
?? docs/arch-dispatch-2026-08-25-F0-7-report-codex.md
```

`ahead 10` 包含尚未同步到本機 tracking ref 的既有派工／驗收／實作 commits，以及本批 `e4dfc70`。本回報依要求保持未提交。
