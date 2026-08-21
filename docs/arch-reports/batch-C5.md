# 批次 C5 回報：抽出 player-directory 到 features

## 變更與範圍盤點

- 新增 `src/features/player-directory/playerDirectoryFeature.ts`：集中在線球友依球場分組、完整目錄與 presence 合併、可邀請球局 selector，引用 B1 mapper/domain type 與 B4 controller contract。
- `src/sessionController.js`：刪除三段 selector 本體並改為 typed import；載入、邀請、presence gate、封鎖、公開狀態與 surface orchestration 不動。
- 新增本回報 `docs/arch-reports/batch-C5.md`。

本 feature 涉及的 store 欄位是 `players`、`playerLayerOn`、`playerLayerStatus`、`playerLayerMessage`、`mySessions`、`authSession`、`profile`、`bounds` 與 `courts`。事件仍使用既有 `map` 與 `mySessions`；沒有新增 channel 或改 payload。

controller 內盤點到的 player-directory orchestration 是 `clearPlayerDirectory`、`clearPlayerLayer`、`loadPlayers`、`loadPlayerDirectoryList`、`openPlayerDirectory`、`openPlayer`、`openPlayerCourt`、`commitPlayerVisibility`、`togglePlayerVisibility`、`refreshMyPlayerBlocks`、`unblockPlayer` 與 chat sender block。這些段落牽涉 API、auth snapshot、request gate、surface identity、重新載入與 toast，全部留在 controller。

`main.js` 的 presence tracker 仍在 260–325，目錄／presence API 注入仍在 1491 附近，controller 公開呼叫點與 callback 不變。`sessionViews.js` 的 player directory sheet、player card sheet 與 UI mapping 零修改。

## 搬移對照

| controller 原位置（C4 commit） | 新位置 | 說明 |
| --- | --- | --- |
| `sessionController.js:308-329` | `playerDirectoryFeature.ts:21-42` | 依 courtId 分組、court 資料建立與 presenceCount 累加逐步不變 |
| `sessionController.js:665-708` | `playerDirectoryFeature.ts:44-90` | 目錄列去重、球場名稱／行政區聚合、presence 合併與排序不變 |
| `sessionController.js:1168-1177` | `playerDirectoryFeature.ts:92-101` | 只選 host＋open＋仍在 now-start window 內的球局，再依開始時間排序 |

`playerDirectoryRows` 的輸出新增明確 `PlayerDirectoryPresentation` 型別；它只是描述原本已存在的 `courtNames`、`courtDistricts`、`isPresent`、`minutesAgo`、`openToGreeting` 欄位，沒有增刪 runtime 資料。

## Controller 行數

```text
搬移前：2188 src/sessionController.js
搬移後：2119 src/sessionController.js
```

下降 69 行，符合單調下降要求。

## API、時序與測試契約

- `ControllerApi` 42 個方法未變；player layer、directory、court drawer、visibility 與 unblock 公開入口仍由 controller 提供。
- `main.js`、`sessionViews.js`、data facade、store 介面與 UI 零修改。
- presence request gate、auth snapshot、player card gate、invite 後 participation reload、card invitable list refresh 與 surface close 次序未變。
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
# duration_ms 2098.390625
```

`npm run test:mock`：

```text
4 skipped
266 passed (2.4m)
```

`npm run test:local` 最終完整結果：

```text
11 skipped
42 passed (1.7m)
```

首次完整 local 再次於第 33 案的 notification court picker 命中 C4 已證明存在於 C3 baseline 的 timing race，導致後續未執行；完整重跑後 42 項全綠，包含本批核心的球友目錄邀請、reciprocal presence、下架、chat 與封鎖案例。本批未修改凍結 UI／main／測試來掩蓋這項既有競速。

`npm run build`：

```text
✓ 146 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-CgKsGA-d.css   65.39 kB │ gzip:  10.76 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-BSLBnFIO.js   714.75 kB │ gzip: 200.74 kB
✓ built in 913ms
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

與 C1／C2 參考值一致；六項仍是既有 performance／focus 波動。依規格只跑一次，沒有重跑修飾數字。

## 反向掃描與白名單

- `rg -n '\bas any\b|:\s*any\b|<any>|@ts-ignore|@ts-expect-error' src/features/player-directory src/sessionController.js`：輸出空。
- `git diff --name-only -- src/main.js src/sessionViews.js src/dataApi.js tests supabase/migrations supabase/tests data/courts.json`：輸出空。
- 沒有修改測試、UI、data facade、migration、DB 測試、球場資料或 runtime LINE 欄位。
- 本機 Supabase 未 reset、未套 migration、未手動修改資料。

## BLOCKED／偏差

- BLOCKED：無。
- 偏差：首次 local 命中既有 notification picker timing race；完整重跑全綠，證據如上。
