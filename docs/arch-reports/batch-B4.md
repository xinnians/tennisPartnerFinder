# 批次 B4 回報：Controller state 與 API 契約型別

## 變更檔案與目的

- `src/controllerContracts.ts`：依 `sessionController.js` 現況定義 26 個 state 欄位、42 個公開 API、3 個 store channel、11 種 surface context，以及對外 view payload。
- `src/sessionStore.ts`：保留原 runtime 實作，只讓 state 泛型預設為 `SessionControllerState`、channel 泛型預設為 `ControllerEventName`。
- `src/pages/MySessionsPage.tsx`、`src/pages/MePage.tsx`：既有 controller callback 的鬆散回傳型別改引用共同契約；只有 type-only import。
- `docs/arch-reports/batch-B4.md`：保存本批驗收證據。

`src/sessionController.js`、`src/main.js`、`src/sessionViews.js` 完全未修改。本批沒有搬程式、沒有改 store runtime，也沒有新增狀態管理套件。

## State 一一對照

盤點來源：`sessionController.js:434-461` 的唯一 `createStore({...})`。型別依據除了初始值，也包含後續 `setState` 寫入、B1 domain types、B3 mapper 回傳型別與 `DEFAULT_FILTER_STATE`。

| State 欄位 | controller 初始行 | 契約行／型別依據 |
| --- | ---: | --- |
| `authEpoch` | 435 | 52；number，後續只做遞增與 generation 比對 |
| `bounds` | 436 | 57；`MapBounds`，來源是 `cloneBounds` |
| `courts` | 437 | 58；`DataCourt[]`，來源是 typed court mapper |
| `courtsReady` | 438 | 59；boolean |
| `sessions` | 439 | 76；`SessionSummary[]`，公開 discovery allowlist |
| `filters` | 440 | 63；`ControllerFilters`，逐欄對應 `DEFAULT_FILTER_STATE` |
| `userLocation` | 441 | 77；`{lat,lng} | null`，geolocation 成功分支 |
| `locationBlocked` | 442 | 64；boolean |
| `locationMessage` | 443 | 65；string |
| `drawerState` | 444 | 62；`"collapsed" | "open"`，與 setter guard 相同 |
| `mapUnavailable` | 445 | 66；boolean |
| `discoveryStatus` | 446 | 61；`SurfaceLoadStatus` |
| `discoveryMessage` | 447 | 60；string |
| `authSession` | 448 | 53；Supabase session 的實際讀取面或 null |
| `profile` | 449 | 75；`currentProfileEligibility()` 實際輸出／過渡狀態或 null |
| `mySessions` | 450 | 68；`MySessionSummary[]` |
| `mySessionsError` | 451 | 69；string |
| `mySessionsStatus` | 452 | 70；`SurfaceLoadStatus` |
| `mySessionRosters` | 453 | 67；`Map<string, SessionRosterEntry[]>` |
| `blockedPlayers` | 454 | 54；`MyPlayerBlock[]` |
| `blockedPlayersError` | 455 | 55；string |
| `blockedPlayersStatus` | 456 | 56；`SurfaceLoadStatus` |
| `playerLayerOn` | 457 | 72；boolean |
| `playerLayerMessage` | 458 | 71；string |
| `playerLayerStatus` | 459 | 73；`SurfaceLoadStatus` |
| `players` | 460 | 74；presence mapper row 加 controller 的 `isPresent` |

指令擷取兩邊欄位、排序後做 `diff -u`：exit 0，無輸出。

```text
26 /tmp/arch-b4-state-source.txt
26 /tmp/arch-b4-state-contract.txt
52 total
```

因此「controller 實際 state ⊆ 契約」與「契約 state ⊆ controller 實際 state」同時成立；第一次盤點漏掉的 `profile` 已由這個雙向 diff 在正式 gate 前抓出並補正。

## 公開 API 一一對照

「controller 行」是 return object 的鍵；「契約行」是 `ControllerApi` 方法。呼叫點用 `rg -n 'controller\.<method>'` 產出。`sessionViews.js` 不持有 controller 物件，只接收 `main.js` 傳入的 callback，因此該欄全為 `—`；`rg -n 'controller\.' src/sessionViews.js` 也是空輸出。

| 公開方法 | controller 行 | 契約行 | `main.js` 呼叫／接線行 | `sessionViews.js` 直接呼叫行 |
| --- | ---: | ---: | --- | --- |
| `attachMap` | 2422 | 246 | 1458 | — |
| `cancelMySession` | 2423 | 247 | 1006 | — |
| `capturePendingIntentVersion` | 2424 | 248 | 1409 | — |
| `clearPendingIntent` | 2425 | 249 | 1411 | — |
| `clearPendingIntentIfUnchanged` | 2426 | 250 | 1432 | — |
| `confirmMySessionAttendance` | 2427 | 251 | 1007 | — |
| `expandBounds` | 2428 | 252 | 622 | — |
| `getMySessionGroups` | 2430 | 253 | — | — |
| `getMySessionState` | 2431 | 255 | 983、1121 | — |
| `getMySessions` | 2429 | 254 | — | — |
| `getPlayerLayerState` | 2442 | 256 | — | — |
| `getVisibleSessions` | 2448 | 257 | 1460 | — |
| `loadDiscovery` | 2449 | 258 | 1574 | — |
| `markMySessionPlayed` | 2450 | 259 | 1022 | — |
| `openCourt` | 2451 | 260 | 586、1243 | — |
| `openCreateIntent` | 2454 | 261 | 623、1016、1563 | — |
| `openPlayerCourt` | 2453 | 262 | 600 | — |
| `openPlayerDirectory` | 2452 | 263 | 1557 | — |
| `openRosterParticipantReport` | 2455 | 264 | 1029 | — |
| `openSession` | 2461 | 268 | 585、620、1024 | — |
| `openSessionChat` | 2459 | 269 | 1023、1127 | — |
| `openSessionDecision` | 2457 | 270 | 1019 | — |
| `openSessionEdit` | 2458 | 271 | 1020 | — |
| `openSessionFromLink` | 2456 | 272 | 227 | — |
| `openSessionReport` | 2460 | 273 | 1030 | — |
| `refreshMyPlayerBlocks` | 2463 | 274 | 1206 | — |
| `refreshMySessions` | 2464 | 275 | 1026、1174 | — |
| `requestCurrentLocation` | 2462 | 276 | 1552 | — |
| `resetFilters` | 2467 | 277 | 569、621 | — |
| `respondInvite` | 2465 | 278 | 1004、1018 | — |
| `resumePendingIntent` | 2468 | 279 | — | — |
| `retryDiscovery` | 2469 | 280 | 624、630 | — |
| `reviewMySessionParticipant` | 2466 | 281 | 1003、1017 | — |
| `setAuthState` | 2470 | 286 | 484、1310、1322、1353、1362、1391 | — |
| `setCourts` | 2471 | 287 | 1308、1320 | — |
| `setDrawerState` | 2472 | 288 | 619、1167、1197、1227 | — |
| `setFilter` | 2473 | 289 | 568、1251、1257、1276 | — |
| `setMapUnavailable` | 2474 | 290 | 1444、1452、1465 | — |
| `togglePlayerLayer` | 2476 | 291 | 1556 | — |
| `togglePlayerVisibility` | 2475 | 292 | — | — |
| `unblockPlayer` | 2477 | 293 | — | — |
| `withdrawMySession` | 2478 | 294 | 1034 | — |

六個沒有 `main.js` 直接呼叫點的方法仍是 controller 公開 return object 的既有成員，供內部 resume／測試 seam 或歷史相容面使用；本批照現況保留，不擅自刪除。

指令擷取兩邊 API 名稱、排序後做 `diff -u`：exit 0，無輸出。

```text
42 /tmp/arch-b4-api-source.txt
42 /tmp/arch-b4-api-contract.txt
84 total
```

因此公開 API 的雙向集合完全等值；方法的同步／非同步邊界也依實作標成 `void`、surface handle 或 `Promise`，沒有先寫 C 批的理想版。

## Event 與 surface 對稱性

`rg -n 'store\.(emit|subscribe)\(' src/sessionController.js`：

```text
596:  store.subscribe("map", (current) => {
617:    store.emit("map");
660:  store.subscribe("mySessions", (current) => {
675:    store.emit("mySessions");
1081:  store.subscribe("courts", (current) => {
1090:    store.emit("courts");
```

契約的 `ControllerStoreEventPayloads` 也只有 `map`、`mySessions`、`courts`，listener payload 均為當下的 `Readonly<SessionControllerState>`。另外明確描述三條通道投影後的 map、My Sessions、player layer、courts view payload。

surface registry 的 source key 與 `ControllerSurfaceContextMap` 雙向 diff 也是 exit 0：

```text
11 /tmp/arch-b4-surfaces-source.txt
11 /tmp/arch-b4-surfaces-contract.txt
22 total
```

11 種 context 包含 chat 的 auth/request/poller/message/roster 狀態，以及 detail、playerCard、profilePrompt 的實際 metadata；沒有把 map instance、timer 或 request gate 誤塞進 `SessionControllerState`。

## Runtime 不變證據

- `git diff -- src/sessionController.js src/main.js src/sessionViews.js`：exit 0，無輸出。
- `sessionStore.ts` 的 object copy、listener Map、同步派發與回傳順序原樣保留，只縮窄泛型 channel。
- React 兩個頁面只有 `import type` 與刪除重複 type alias，編譯後不產生 import。
- production 主 JS 檔名與 B3b 相同：`index-BPQu-Mfd.js`，大小同為 `714.49 kB / 200.71 kB gzip`。

## Gate 輸出

`npm run typecheck`：

```text
> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit
```

`npm run lint`：

```text
> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{ts,tsx}" vite.config.ts
```

`npm run prettier:check`：

```text
Checking formatting...
All matched files use Prettier code style!
```

`npm run test:session-unit` 尾端摘要：

```text
1..276
# tests 276
# suites 0
# pass 276
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1931.878958
```

`npm run test:mock` 尾端摘要：

```text
4 skipped
266 passed (2.5m)
```

`npm run test:local` 尾端摘要：

```text
11 skipped
42 passed (1.6m)
```

`npm run build` 尾端摘要：

```text
✓ 141 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-CgKsGA-d.css   65.39 kB │ gzip:  10.76 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-BPQu-Mfd.js   714.49 kB │ gzip: 200.71 kB
✓ built in 852ms
```

`npm run check:production-bundle`：

```text
production bundle check passed: 12 files, 12 demo identifiers absent
```

`git diff --check`：exit 0，無輸出。

## 非阻擋 WebKit 訊號

`npm run test:mock:webkit`：

```text
6 failed
3 skipped
126 passed (2.0m)
```

與參考值相同，沒有劣化；六項仍是既有 WebKit timing/focus 差異。

## 隱私、白名單與反向掃描

- `rg -n '\bany\b|@ts-expect|@ts-ignore' src/controllerContracts.ts src/sessionStore.ts`：輸出空（exit 1）。
- `git diff --name-only -- supabase/migrations supabase/tests data/courts.json`：輸出空（exit 0）。
- 沒有新增 runtime LINE 讀取／映射／渲染，也沒有修改 data facade 或 `p_line_id: null`。
- 只動 B4 白名單的契約檔、store 型別、兩個 TSX type alias 與本回報。

## BLOCKED／偏差

- BLOCKED：無。
- 偏差：無。
