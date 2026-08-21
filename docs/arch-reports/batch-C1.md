# 批次 C1 回報：抽出 discovery 到 features

## 變更與範圍盤點

- 新增 `src/features/discovery/discoveryFeature.ts`：探索 filters 複製、bounds 正規化／驗證、Google viewport 容差、session bounds 判斷、可見球局 selector 與 map status selector。
- `src/sessionController.js`：刪除上述函式本體，改成明確 import；store、request gate、polling、surface reconcile、publish 時機與 42 個公開 API 不動。
- 新增本回報 `docs/arch-reports/batch-C1.md`。

本 feature 涉及的既有 store 欄位：`bounds`、`courts`、`sessions`、`filters`、`userLocation`、`mapUnavailable`、`discoveryStatus`、`discoveryMessage`、`drawerState`。事件只有 `map`；`mySessions` 與 `courts` 沒有改動。

`main.js` 呼叫點維持原位：`setFilter`（568、1251、1257、1276）、`resetFilters`（569、621）、`expandBounds`（622）、`retryDiscovery`（624、630）、`openCourt`（586、1243）、`attachMap`（1458）、`getVisibleSessions`（1460）、`setMapUnavailable`（1444、1452、1465）、`requestCurrentLocation`（1552）、`loadDiscovery`（1574）。`sessionViews.js` 不直接持有 controller。

## 搬移對照

| controller 原位置（B4 commit） | 新位置 | 說明 |
| --- | --- | --- |
| `sessionController.js:14-20` | `discoveryFeature.ts:24-30` | `cloneFilters`，Set 複製順序不變 |
| `sessionController.js:22-35` | `discoveryFeature.ts:32-45` | `cloneBounds`、`validBounds`，Number 轉換與四界判斷不變 |
| `sessionController.js:37-78` | `discoveryFeature.ts:47-88` | viewport center/span 與 Google padding 容差公式逐式搬移 |
| `sessionController.js:80-92` | `discoveryFeature.ts:90-105` | `boundsContainSession`，有限值與四界比較不變 |
| `sessionController.js:559-561` | `discoveryFeature.ts:107-109` | visible sessions 的 filter→sort 順序不變；controller 留一行 selector 轉發 |
| `sessionController.js:586-591` | `discoveryFeature.ts:111-118` | map warning/loading/error/idle 優先序與中文文案逐字不變 |

`filters.js` 仍是篩選與排序演算法唯一來源；feature 只加 typed boundary，不複製或改寫演算法。Google Maps imperative adapter、idle timer、expected viewport generation 與 discovery request gate 仍留在 controller，因它們是 orchestration／機械資源，不是純函式。

## Controller 行數

```text
搬移前：2480 src/sessionController.js
搬移後：2406 src/sessionController.js
```

下降 74 行，符合單調下降要求。

## API、時序與測試契約

- `ControllerApi` 42 個方法名稱未變；`main.js`、`sessionViews.js` 零修改。
- `loadDiscovery` 的 gate issue、先清 drawer、loading publish、資料寫入、detail reconcile、error close 與最後 publish 次序完全留在 controller。
- quiet polling、map idle debounce、explicit viewport generation 與 location refresh 呼叫順序完全留在 controller。
- 沒有修改測試；276 個 unit（含 17-step frozen sequence）、Chromium mock 與 local Supabase 全綠，代表不需演進任何斷言。

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
# duration_ms 1940.407792
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
✓ 142 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-CgKsGA-d.css   65.39 kB │ gzip:  10.76 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-D8NB-sOW.js   714.56 kB │ gzip: 200.75 kB
✓ built in 867ms
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

與參考值一致，沒有劣化；六項仍是既有 WebKit timing/focus 差異。

## 反向掃描與白名單

- `rg -n '\bany\b|@ts-expect|@ts-ignore' src/features/discovery src/controllerContracts.ts`：輸出空。
- `git diff --name-only -- supabase/migrations supabase/tests data/courts.json`：輸出空。
- 沒有修改 `main.js`、`sessionViews.js`、data facade、UI、測試或 DB。
- 沒有新增 runtime LINE 欄位、讀取、映射或渲染。

## BLOCKED／偏差

- BLOCKED：無。
- 偏差：無。
