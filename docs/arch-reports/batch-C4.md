# 批次 C4 回報：抽出 profile-auth 到 features

## 變更與範圍盤點

- 新增 `src/features/profile-auth/profileAuthFeature.ts`：集中 auth identity、profile gate／readiness／公開狀態、錯誤文案、pending intent store／比對與 auth snapshot 純判斷。
- `src/sessionController.js`：刪除上述本體並改為 typed import；auth epoch、surface transition、私人狀態清空、reload 與 pending intent resume 的 orchestration 不動。
- 新增本回報 `docs/arch-reports/batch-C4.md`。

本 feature 涉及的 store 欄位是 `authEpoch`、`authSession`、`profile`、`mySessions`、`mySessionRosters`、`blockedPlayers` 與其 loading/error 狀態。事件仍只有既有 `map` 與 `mySessions`；登入身分變更時先同步清空私人資料並 emit、之後才非同步 reload 的順序沒有改。

controller 內盤點到的 profile/auth orchestration 是 `captureAuthSnapshot` wrapper、`isCurrentAuthSnapshot` wrapper、`requireReadyProfile`、`requireSessionAction`、`openProfileForIntent`、`resumePendingIntent` 與 `setAuthState`。其中 `setAuthState` 會依 identity、三層 gate 與 readiness 決定 auth epoch、關閉 surface、清 player cache、清 participation，再 reload；這段刻意留在 controller，避免改動跨 feature 時序。

`main.js` 仍負責 auth session 與完整 profile 的來源（1309–1403），並在 484、1310、1322、1353、1362、1391 呼叫 `controller.setAuthState`。`sessionViews.js` 仍只負責表單端 gate 提示，沒有改成依賴 controller feature。

## 搬移對照

| controller 原位置（C3 commit） | 新位置 | 說明 |
| --- | --- | --- |
| `sessionController.js:37-40` | `profileAuthFeature.ts:22-25` | `sessionIdentity`，user id 優先、access token fallback 的規則不變 |
| `sessionController.js:42-55` | `profileAuthFeature.ts:27-43` | profile gate、intent→gate 與公開狀態判斷 |
| `sessionController.js:57-82` | `profileAuthFeature.ts:45-72` | profile／court catalogue readiness 優先序與中文文案 |
| `sessionController.js:96-107` | `profileAuthFeature.ts:74-88` | pending intent 相等判斷與 browser store adapter |
| `sessionController.js:605-615` | `profileAuthFeature.ts:90-105` | auth snapshot 建立與 current 判斷；controller 保留一行 wrapper 讀當下 state |

JS `sessionIntent.js` 回傳值只在 feature boundary 斷言成 `ControllerPendingIntent` union；沒有 `any`、雙重斷言或忽略型別。runtime 的儲存、驗證與清除仍走原本三個函式。

## Controller 行數

```text
搬移前：2240 src/sessionController.js
搬移後：2188 src/sessionController.js
```

下降 52 行，符合單調下降要求。

## API、時序與測試契約

- `ControllerApi` 42 個方法未變；`setAuthState`、`resumePendingIntent` 與 pending intent 公開方法仍由 controller 提供。
- `main.js`、`sessionViews.js`、data facade、store 介面與 UI 零修改。
- auth epoch 增加、surface 關閉、同步清空私人畫面、participation reload、detail/chat reconcile、publish 與 resume 的先後順序未變。
- 沒有修改測試；正式 unit、Chromium mock、local Supabase、build 與 bundle gate 全綠。

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
# duration_ms 2079.728959
```

`npm run test:mock`：

```text
4 skipped
266 passed (2.5m)
```

`npm run test:local` 最終完整結果：

```text
11 skipped
42 passed (1.7m)
```

首次完整 local 在 `authenticated players persist the authoritative court subscription set` 發生 checkbox 被背景重繪後收合的 90 秒 timeout。針對案例重跑仍可重現；再以 C3 commit `14c4434` 的獨立乾淨程式副本跑同一案例，也在相同行為失敗，證明不是 C4 差異。之後重跑完整 local 全綠。這是該測試未等待初次 notification settings hydrate 的既有 timing race；本批未修改凍結的 `main.js`、UI 或測試，並保留此紀錄而非隱藏首次結果。

`npm run build`：

```text
✓ 145 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-CgKsGA-d.css   65.39 kB │ gzip:  10.76 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-BVSbl9K5.js   714.70 kB │ gzip: 200.75 kB
✓ built in 891ms
```

`npm run check:production-bundle`：

```text
production bundle check passed: 12 files, 12 demo identifiers absent
```

`git diff --check`：exit 0，無輸出。

## 非阻擋 WebKit

```text
7 failed
3 skipped
125 passed (2.1m)
```

與 C3 一致；七項仍是既有 performance／focus 波動。本批沒有修改 DOM、dialog、focus 或 UI，且 Chromium 必要 gate 全綠。依規格只跑一次，沒有重跑修飾數字。

## 反向掃描與白名單

- `rg -n '\bas any\b|:\s*any\b|<any>|@ts-ignore|@ts-expect-error' src/features/profile-auth src/sessionController.js`：輸出空。
- `git diff --name-only -- src/main.js src/sessionViews.js src/dataApi.js tests supabase/migrations supabase/tests data/courts.json`：輸出空。
- 沒有修改測試、UI、data facade、migration、DB 測試、球場資料或 runtime LINE 欄位。
- 本機 Supabase 未 reset、未套 migration、未手動修改資料。

## BLOCKED／偏差

- BLOCKED：無。
- 偏差：首次 local 命中既有 timing race；C3 基準同樣可重現，完整重跑全綠，未修改凍結檔案來掩蓋問題。
