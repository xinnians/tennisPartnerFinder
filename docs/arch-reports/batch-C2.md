# 批次 C2 回報：抽出 session-lifecycle 到 features

## 變更與範圍盤點

- 新增 `src/features/session-lifecycle/sessionLifecycleFeature.ts`：集中球局終止文案、我的球局分組／排序、pending intent 失效文案、detail 比對、action key，以及主揪定案／編輯權限判斷。
- `src/sessionController.js`：刪除上述純函式本體，改成明確 import；建立、編輯、定案、加入、審核、取消、退出、回報打成與確認到場的非同步流程仍由 controller 編排。
- 新增本回報 `docs/arch-reports/batch-C2.md`。

本 feature 涉及的既有 store 欄位是 `sessions`、`authSession`、`profile`、`mySessions`、`mySessionsError`、`mySessionsStatus`、`mySessionRosters`、`courts` 與 `courtsReady`。更新事件是 `map` 與 `mySessions`；事件名稱、payload 與發送時機都沒有改動。

controller 內盤點到的生命週期 orchestration 包括：`refreshMySessions`、`reloadParticipation`、`openSessionDetail`、`openSessionById`、`openSessionFromLink`、`join`、`withdraw`、`runMySessionMutation`、`reviewMySessionParticipant`、`respondInvite`、`cancelMySession`、`withdrawMySession`、`markMySessionPlayed`、`confirmMySessionAttendance`、`openSessionDecision`、`openSessionEdit`、`submitCreateSession` 與 `openCreateSessionForIntent`。這些函式牽涉 API、request gate、auth snapshot、surface 或 publish 時序，因此本批刻意留在 controller，不改寫流程。

`main.js` 的既有呼叫點維持原位：deep link（227）、地圖／列表開球局（585、620）、建立球局（623、1016、1563）、我的球局狀態（983、1121）、審核／邀請回覆／取消／到場／定案／編輯／回報打成／退出（1003–1034）、refresh（1026、1174）與球局回報（1030）。`sessionViews.js` 不直接持有 controller。

## 搬移對照

| controller 原位置（C1 commit） | 新位置 | 說明 |
| --- | --- | --- |
| `sessionController.js:70-76` | `sessionLifecycleFeature.ts:47-53` | `terminalAction`，status 判斷順序與中文文案逐字不變 |
| `sessionController.js:78-81` | `sessionLifecycleFeature.ts:9-13` | 我的球局 final/open status、action 排序與一天門檻常數 |
| `sessionController.js:87-103` | `sessionLifecycleFeature.ts:55-73` | `timeValue`、開始時間排序與歷史排序公式 |
| `sessionController.js:115-186` | `sessionLifecycleFeature.ts:75-147` | `groupMySessions` 的分類、排序與輸出欄位；改以 B4 typed contract 表達相同資料 |
| `sessionController.js:193-201` | `sessionLifecycleFeature.ts:149-157` | pending intent 遇到額滿／取消／結束／開始時的文案 |
| `sessionController.js:211-245` | `sessionLifecycleFeature.ts:14-38,159-173` | detail 比對欄位、`sameSessionDetail` 與 action presentation key |
| `sessionController.js:1851-1865` | `sessionLifecycleFeature.ts:175-185` | 主揪可定案／可編輯的純權限判斷 |

TypeScript 對 union action 的 participant 讀取使用 `"participant" in action` 做型別縮窄；guest action 仍取 `0`，排序值與原本 optional chaining 完全相同。沒有改寫業務演算法。

## Controller 行數

```text
搬移前：2406 src/sessionController.js
搬移後：2263 src/sessionController.js
```

下降 143 行，符合單調下降要求。

## API、時序與測試契約

- `ControllerApi` 的 42 個方法名稱與輸入輸出未變；`groupMySessions` 仍由 `sessionController.js` re-export，既有 import 不需修改。
- `main.js`、`sessionViews.js` 零修改；data facade、store 公開介面與 UI 也未修改。
- API mutation、auth snapshot、request gate、roster hydrate、refresh、surface transition、publish 與 pending intent 清除時序都留在 controller。
- 沒有修改測試；276 個 unit（含 frozen sequence）、Chromium mock 與 local Supabase 必要 gate 全綠。

`git diff -- src/main.js src/sessionViews.js`：exit 0，無輸出。

## Gate

`npm run typecheck`、`npm run lint`、`npm run prettier:check`：全綠。

`npm run test:session-unit`：

```text
1..276
# tests 276
# pass 276
# fail 0
# skipped 0
# duration_ms 2093.814042
```

`npm run test:mock`：

```text
4 skipped
266 passed (2.5m)
```

`npm run test:local`：

```text
11 skipped
42 passed (1.6m)
```

`npm run build`：

```text
✓ 143 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-CgKsGA-d.css   65.39 kB │ gzip:  10.76 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-DMxy1f71.js   714.61 kB │ gzip: 200.75 kB
✓ built in 890ms
```

`npm run check:production-bundle`：

```text
production bundle check passed: 12 files, 12 demo identifiers absent
```

`git diff --check`：exit 0，無輸出。

## 非阻擋 WebKit

```text
6 failed
3 skipped
126 passed (2.0m)
```

數量與 C1 參考值一致，沒有劣化。六項仍是已知的 WebKit performance／focus 波動；依規格只跑一次並照實記錄，沒有重跑修飾結果。

## 反向掃描與白名單

- `rg -n '\bas any\b|:\s*any\b|<any>|@ts-ignore|@ts-expect-error' src/sessionController.js src/features/session-lifecycle/sessionLifecycleFeature.ts`：輸出空。
- `git diff --name-only -- src/main.js src/sessionViews.js src/dataApi.js tests supabase/migrations supabase/tests data/courts.json`：輸出空。
- 沒有修改測試、migration、DB 測試、球場資料或 runtime LINE 欄位。
- 本機 Supabase 測試只使用既有測試流程，沒有 reset、migration 或手動資料變更。

## BLOCKED／偏差

- BLOCKED：無。
- 偏差：無。
