# 批次 C6R 回報：抽出 notifications 到 features

## 變更與範圍盤點

- 新增 `src/features/notifications/notificationFeature.ts`：集中六個通知 use case、五個通知 dataApi 呼叫與 Web Push 啟用接線，補上通知 state、push status、auth request 與 feature 介面型別。
- `src/main.js`：改為建立 notification feature，保留 UI composition、目前 auth／court／settings 狀態來源與五個同名薄轉發；移除通知 dataApi、VAPID 與 `notificationPush.js` 的直接接線。
- `tests/session-data-boundary.test.js`：把原本字面綁在 controller API block 的兩個通知能力，演進為直接掃描 notification feature 的五個完整資料能力；原 controller 掃描仍保留非空斷言與其餘八個 Stage 1–3 能力。
- 新增本回報 `docs/arch-reports/batch-C6R.md`。

`sessionController.js`、`sessionViews.js`、UI、dataApi facade、`notificationPush.js`、`ControllerApi`、migration、DB 測試與球場資料都沒有修改。

## 搬移對照

| `main.js` 原位置（C5 commit） | 新位置 | 說明 |
| --- | --- | --- |
| `main.js:335-350` | `notificationFeature.ts:56-71` | `defaultNotificationSettings` 六欄預設值與 VAPID configured 判斷不變 |
| `main.js:859-884` | `notificationFeature.ts:78-96` | 偏好與球場訂閱仍平行載入，auth／stale／錯誤分支與文案不變 |
| `main.js:886-902` | `notificationFeature.ts:98-116` | 六個 preference boolean 正規化、儲存、rerender 與 toast 次序不變 |
| `main.js:904-923` | `notificationFeature.ts:118-137` | 正整數去重、台北市可選球場上限、儲存與 toast 次序不變 |
| `main.js:925-951` | `notificationFeature.ts:139-166` | 新帳號全台北球場 best-effort 種入、空目錄跳過與 stale guard 不變 |
| `main.js:953-979` | `notificationFeature.ts:168-193` | VAPID、permission、subscription 儲存、push status 與 toast 分支不變 |

`main.js:837-870` 現在只建立 feature 並保留五個同名薄轉發；`defaultNotificationSettings` 直接由 feature 匯入。畫面 callback 名稱與呼叫點沒有改。

## `main.js` 行數

```text
$ git show HEAD^:src/main.js | wc -l
1580
$ wc -l src/main.js
1469 src/main.js
```

下降 111 行，符合本批只量 `main.js`、不量 controller 的判準。

## 資料、時序與契約

- `loadNotificationPreferences` 與 `loadCourtSubscriptions` 仍用 `Promise.all` 同時發出；React／UI 不會多一輪瀑布等待。
- 每次 async 完成後仍先檢查原本的 auth request stale guard，再更新通知 state；切換帳號不會發布前一帳號結果。
- `NotificationSettings` 只含 `courtIds`、`errorMessage`、六欄 `prefs`、`pushStatus`、`webPushConfigured`；沒有 LINE、身分或座標欄位。
- `savePushSubscription` 仍只收到 browser subscription 的 endpoint 與 keys 形狀；feature 無 log 或額外 payload。
- controller 的 42 個公開方法與 UI callback 契約不變。原先注入 controller 但完全未被使用的 `loadCourtSubscriptions`／`saveCourtSubscriptions` 已移除；通知 feature 成為唯一呼叫端。

## Source scan 語意演進

原測試只確認 `main.js` 的 controller API block 含 `loadCourtSubscriptions`、`saveCourtSubscriptions`，但 controller 沒有呼叫它們。搬移後：

1. controller API block 仍必須非空，並逐一驗八個非通知 Stage 1–3 能力；
2. notification feature 的 dataApi import block 必須非空；
3. 五個通知能力都必須同時「有 import」及「有實際呼叫」。

因此掃描目標跟著責任邊界移動，保護範圍由兩個未使用注入擴為五個實際通知資料接線，沒有以空字串通過。

## Gate

`npm run typecheck`、`npm run lint`、`npm run prettier:check`：全綠。

`npm run test:session-unit`：

```text
1..277
# tests 277
# pass 277
# fail 0
# skipped 0
# duration_ms 1940.240041
```

`npm run test:mock`：

```text
4 skipped
266 passed (2.5m)
```

`npm run test:local`：

```text
API：2 passed，0 failed
Playwright：11 skipped，42 passed (1.4m)
```

沒有 fixture 資源耗盡，未執行 `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`。

`npm run build`：

```text
✓ 147 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-CgKsGA-d.css   65.39 kB │ gzip:  10.76 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index--b_Acyqx.js   715.65 kB │ gzip: 200.94 kB
✓ built in 881ms
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

與 `00-overview.md` 的 126／6／3 基準完全相同；六項仍是既有 WebKit performance／focus 波動，其中通知案例也是 focus 斷言 timeout，正式 Chromium 與 local 通知案例全綠。依規格只跑一次，沒有重跑修飾數字。

## 反向掃描與白名單

- `rg -n '\bas any\b|:\s*any\b|<any>|@ts-ignore|@ts-expect-error' src/features/notifications src/main.js`：輸出空。
- `rg` 六個 use case：完整本體只在 `notificationFeature.ts`；`main.js` 只剩五個薄轉發，default 直接 import。
- `rg` 五個通知 dataApi 呼叫：呼叫只在 `notificationFeature.ts`；`main.js` 無殘留。
- `git diff -- src/sessionController.js src/sessionViews.js`：exit 0，無輸出。
- `git diff --name-only -- src/sessionController.js src/sessionViews.js src/dataApi.js src/notificationPush.js src/controllerContracts.ts supabase/migrations supabase/tests data/courts.json`：輸出空。
- 變更白名單只有 `src/main.js`、`src/features/notifications/notificationFeature.ts`、`tests/session-data-boundary.test.js` 與本回報。
- 沒有 push、deploy、改 `.env*`、reset 本機資料庫或套 migration。

## BLOCKED／偏差

- BLOCKED：無。
- 偏差：無。
