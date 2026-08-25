# bundle 批回報：F4-3 組成分析→拆分＋fail-closed unit 補測

- 日期：2026-08-25
- 開工基準：`991c3fe`（`origin/main`）
- 派工單：`docs/arch-dispatch-2026-08-25-bundle-batch.md`
- 結果：**完成，待驗收方裁決**。組成報告、依報告拆分、gate 擴充、附帶 unit 均依指定順序完成並各自 commit；收尾三套標準矩陣全綠，`did not run = 0`。
- 本回報依派工要求不列入實作 commit；未 push。

## 1. Commit 與順序

| 順序 | commit    | 子項                                                    | 當刀 `npm run test:session-unit` |
| ---: | --------- | ------------------------------------------------------- | -------------------------------- |
|    1 | `2822ac4` | `docs(bundle): report production chunk composition`     | 311/311 pass                     |
|    2 | `24561c2` | `perf(data): defer authenticated repository paths`      | 311/311 pass                     |
|    3 | `395f415` | `test(bundle): enforce lazy and total size budgets`     | 311/311 pass                     |
|    4 | `5f57957` | `test(map): cover advanced marker fail-closed fallback` | 312/312 pass                     |

順序為「先報告、再拆、最後擴 gate」；附帶地圖補測另立 commit。沒有先落拆分再回填分析。

## 2. F4-3-1 組成報告

完整報告：`docs/arch-reports/bundle-composition-2026-08-25.md`。

- 加入 devDependency `rollup-plugin-visualizer@7.1.1` 與 `npm run analyze:bundle`。
- visualizer 只在 `BUNDLE_ANALYZE=1` 啟用；分析仍走 Vite production mode，production mock alias 與兩個 compile-time define 保持相同。
- 原始 raw-data JSON 位於 `/tmp/tennis-partner-finder-bundle-composition-2026-08-25.json`，未入版。
- 分析後另跑普通 `npm run build`，仍產出 `index-Bsbq_1gq.js` 661,080 raw／192,693 gzip，證明分析插件沒有改普通 production 輸出。

主 chunk 最大宗與派工指定分類如下；visualizer 的 `renderedLength`／per-module gzip 是歸因量，不當作 emitted chunk bytes 相加：

| 分類                                   | rendered bytes | per-module gzip bytes |
| -------------------------------------- | -------------: | --------------------: |
| Supabase SDK                           |        790,851 |               165,748 |
| React runtime                          |        592,988 |               106,595 |
| `src/data/repositories`                |         20,747 |                 4,633 |
| 其他 `src/data`                        |         18,282 |                 5,367 |
| chat／notification／directory 私人功能 |          7,806 |                 2,572 |

前 20 大模組與完整分類小計已列在組成報告。結論是 repository monolith 具有低風險的 authenticated implementation 邊界；Supabase 與 React 則是匿名探索、auth restore、首屏 React shell 的 eager 依賴。

## 3. F4-3-2 依報告拆分

### 實作

新增 `src/data/repositories/privateDataRepository.ts`，把 profile、notification、directory、chat、session 私人讀寫與 mutation 實作移到 authenticated 時才觸發的 dynamic import。`dataRepository.ts` 保留匿名首屏所需的 courts、discovery、session summary eager 路徑，並維持既有 API signatures；未修改 `dataApi.js` 或 controller 公開契約。

### 預期與實際收益

| 指標                  |                  報告預期上限 |                        拆分 commit 實測 |                         最終 HEAD 實測 |
| --------------------- | ----------------------------: | --------------------------------------: | -------------------------------------: |
| main raw              | repository attribution 20,747 | 661,080 → 654,771；**-6,309 (-0.954%)** | 654,775；相對基線 **-6,305 (-0.954%)** |
| main gzip             |             attribution 4,633 | 192,693 → 191,396；**-1,297 (-0.673%)** | 191,398；相對基線 **-1,295 (-0.672%)** |
| private emitted chunk |        不直接等同 attribution |                   9,046 raw／2,835 gzip |                  9,046 raw／2,836 gzip |

最終 main 的 4 raw／2 gzip 差異來自後續獨立 fail-closed unit 為 `loadGoogleMaps` 增加可注入 Map ID 參數；拆分本身的收益以上一欄為準。兩個口徑都實質低於 661,080／192,693 驗收底線。

本批 `.env.local` 相同條件下重建 `991c3fe`，baseline 全 JS（含 `push-sw.js`）為 838,808 raw／254,939 gzip；最終為 841,549／256,507，增量 2,741 raw（0.327%）／1,568 gzip（0.615%）。拆分沒有宣稱總量下降；新增 async 邊界有獨立 chunk 與載入 metadata 成本，已由 1% total budget 鎖住。

### 評估後未拆

- Supabase SDK：雖為 790,851／165,748 歸因量，匿名 discovery、court catalogue 與 initial auth restore 均需要 client；延後會加 startup waterfall 或要求改 public transport，未做。
- React runtime：首屏 map shell、nearby drawer、bottom navigation 都由 React 擁有，未做。
- private feature helpers：只有 7,806／2,572 歸因量，且目前由 eager controller/main auth 初始化邊界觸達；移動 ownership 會超出「不動 controller」限制，成本高於孤立收益，未硬拆。
- `manualChunks`：0 筆。eager dependency 搬到另一檔仍會在 entry 執行前請求，只是快取拓撲，不算本批首屏收益。

## 4. F4-3-3 gate 擴充

`scripts/check-production-bundle.mjs` 現在同時檢查 main、每個 JS chunk、Sentry、全 dist JS 總量、production private marker 與既有 production safety markers。

### 預算與計算式

| gate                   | 建立 gate 時實測 |        headroom／計算 |         新上限 |       最終實測 |
| ---------------------- | ---------------: | --------------------: | -------------: | -------------: |
| main raw               |          654,771 |          +4,096 bytes |        658,867 |        654,775 |
| main gzip              |          191,396 |          +1,024 bytes |        192,420 |        191,398 |
| ordinary app lazy raw  |      最大 16,912 |              約 1 KiB |         18,000 |    最大 16,912 |
| ordinary app lazy gzip |       最大 5,122 |             378 bytes |          5,500 |     最大 5,123 |
| Sentry raw／gzip       |   87,975／29,721 |         獨立 SDK 預算 | 90,000／31,000 | 87,975／29,723 |
| total JS raw           |          841,545 | `ceil(actual × 1.01)` |        849,961 |        841,549 |
| total JS gzip          |          256,497 | `ceil(actual × 1.01)` |        259,062 |        256,507 |

main 固定 byte headroom 足以吸收小型 glue／hash 變動，但上限本身仍比舊 main 661,080 raw／192,693 gzip 更低，因此不能退回舊體積。total 使用 1% headroom，防止靠持續搬 chunk 掩蓋總量膨脹。Sentry 因 SDK 尺寸級別不同採獨立上限。

最終 production gate 輸出：

```text
production bundle check passed: development E2E hook present, production E2E hook absent; 30 files, 12 demo identifiers absent; main 654775/191398 within 658867/192420; largest app lazy MySessionsPage-BmaVCP6V.js 16912/4935 within 18000/5500; total JS 841549/256507 within 849961/259062; private repository: privateDataRepository-DSKb9fuK.js; Sentry: sentryBrowserSdk-Czz5dmkg.js
```

### 未登入 request 斷言與 canary

在 `tests/performance.spec.js` 純新增「anonymous discovery does not request the authenticated repository module」。它監看 Vite dev 的穩定 source URL `/src/data/repositories/privateDataRepository.ts`，等地圖 ready、探索 status 結束、匿名 Me 狀態與 network idle 後斷言 0 request。選 dev module request 是因為 source URL 穩定且直接；production 是否真的拆出則另由 marker gate 驗證，避免依賴 hashed filename。

canary 暫時加回 eager side-effect import 後，該測試如期紅：

```text
Expected: []
Received: ["http://127.0.0.1:5174/src/data/repositories/privateDataRepository.ts"]
```

還原後 targeted 1/1 pass，完整 mock desktop/mobile 也全綠。

### bundle gate canary

暫時把 private implementation 改回 eager runtime import，重建後 main 回升至 663,454 raw，gate 如期紅：

```text
AssertionError: production main chunk raw size 663454 bytes exceeds 658867 bytes
```

還原 dynamic import、重新 `npm run build` 後 gate 回綠；沒有以舊 `dist/` 假綠。

## 5. 附帶 b42707e fail-closed unit

新增 unit 以 fake `window.google.maps.importLibrary("marker")` reject，並以第三參數注入 `TEST_MAP_ID`：

- `loadGoogleMaps` 必須 reject `Google Maps Advanced Marker library 載入失敗`，且保留原 error 為 `cause`。
- 呼叫端 catch 必須呼叫一次 `setMapUnavailable()`；同時靜態守住 `main.js` 的既有 `startMap().catch(...controller.setMapUnavailable())` 降級接線。
- production 預設仍取既有 `GOOGLE_MAPS_MAP_ID`；無 Map ID legacy fallback 沒有刪除。

canary 暫時把 `map.ts` catch 從 reject 改為 resolve，targeted test 如期紅：

```text
Expected values to be strictly equal:
+ actual - expected
+ 'resolved'
- 'rejected'
```

還原 reject 後 targeted 1/1 pass，完整 unit 312/312 pass。

## 6. 載入語意、凍結面與反向檢查

### 載入語意／不在範圍

- `git diff --exit-code 991c3fe HEAD -- src/sessionViews.js` 為空：13 個 lazy surface loader、pointerover／focusin warmup、`deferSurfaceOpen` 延遲與失敗文案、登入後 preload 語意均未動。
- `git diff --name-only 991c3fe HEAD -- src/sessionController.js src/dataApi.js index.html public/push-sw.js vercel.json` 為空：controller、dataApi、殼、CSP／index、Service Worker 均未動。
- Sentry wiring／error transport 未改；production gate 仍要求 Sentry marker 只在獨立 lazy chunk。
- production mock alias 與 defines 保留；完整 production gate 驗證 12 個 demo identifier 均不在輸出。
- F4-7 長列表節流／虛擬化未做；未改 preload hint。

### 已刪除／歸零的反向 grep

```text
$ rg -n 'manualChunks' vite.config.ts
(0 matches)

$ rg -n 'privateDataRepository' src/data/repositories/dataRepository.ts
20: import type ... from "./privateDataRepository.ts";
147: privateDataApiRequest = import("./privateDataRepository.ts").then(...)
```

亦即 runtime static/eager import 為 0；只剩 type-only import 與唯一 conditional dynamic import。production marker `tennis_private_data_repository_v1` 在 main 為 0、在一個 lazy chunk 恰為 1，由 gate 強制。

### GOLDEN、`data-testid`、既有 e2e assertion

```text
GOLDEN:    0be31a2=10141 bytes, 991c3fe=10141, HEAD=10141；124 筆逐字未動
ME_GOLDEN: 0be31a2 尚不存在；991c3fe=456 bytes, HEAD=456；19 筆逐字未動

991c3fe: 97 data-testid assignments / 96 unique
HEAD:     97 data-testid assignments / 96 unique
本批 added 0 / removed 0

0be31a2: 91 assignments / 90 unique
HEAD:     97 assignments / 96 unique
相對舊基準仍只有已核可 6 個：
create-session-tab, map-tab, me-tab, messages-tab, my-sessions-tab, player-directory-open
```

對 `0be31a2..HEAD` 的 tests diff，只取 `data-testid|GOLDEN|ME_GOLDEN` 變動行，checksum 仍為：

```text
5f4e88a2423f06297ea0e68f61566eec48ea9bb8679e9f18b68a86bb54cf9868
```

`991c3fe..HEAD` 的 `tests/*.spec.js` diff 只有 performance spec 的 18 行純新增 request 測試；沒有刪除或改寫任何既有 e2e assertion。`src/` 的 `data-testid` diff 為空。

## 7. 最終驗收矩陣

Playwright 全程序列執行，未與另一套 Playwright 並發。沒有執行 DB reset；`did not run = 0`。

| 指令                       | 最終結果                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:ci:frontend` | exit 0；seed check、typecheck、lint、Prettier、312/312 unit、mock Playwright 286 passed／4 expected skipped、production build、bundle gate、diff check 全綠 |
| `npm run test:db`          | exit 0；7 files／799 tests，PASS                                                                                                                            |
| `npm run test:local`       | exit 0；local API 2/2；local Playwright 45 passed／11 expected skipped                                                                                      |
| `git diff --check`         | exit 0，空輸出                                                                                                                                              |

## 8. 未做／交付狀態

- 未採用 `manualChunks`，未做快取拓撲重排。
- 未拆 Supabase、React 或 controller-owned private features；理由見 §3。
- 未修改 CSP、Service Worker、Sentry wiring、error transport、controller、`dataApi.js` 或 13 surface loading semantics。
- 未 push。
- 本回報檔刻意保持 uncommitted；其餘實作工作樹乾淨。

## 9. 驗收退件修正（2026-08-25）

驗收紀錄 `docs/arch-reports/bundle-batch-acceptance-2026-08-25.md` 退件一項：private dynamic import 的 rejected promise 會永久快取，且 native `TypeError` 可能直出 UI。已以獨立 commit `28945b3`（`fix(bundle): retry failed private module loads`）修正：

- private module load 失敗時先把 `privateDataApiRequest` 清回 `null`，下一個私人操作會重新 import；成功後仍共用同一 fulfilled promise。
- native import error 包成既有 `DataApiError`，保留原 error 為 `cause`，使用者面固定顯示「此功能暫時無法載入，請重新整理後再試。」；不再顯示英文 dynamic-import 技術訊息。
- `createDataApi` 增加只供依賴注入的 `privateDataApiLoader` option，production 預設仍是唯一的 `import("./privateDataRepository.ts")`，因此 split 與匿名首屏語意不變。
- 補回搬移時遺失的兩行 `p_line_id: null` 凍結紅線註解。
- 新增 unit：第一次 loader reject，斷言 `DataApiError`／cause／localized `sessionActionMessage`；第二次呼叫成功且 import attempt 恰為 2。

### 修正 canary

1. 暫時移除 `privateDataApiRequest = null`，targeted test 紅；第二次呼叫再次收到同一個 `DataApiError`，loader 沒有重試。還原後 1/1 綠。
2. 暫時把 localized wrapper 改回 `asDataApiError(error)`，targeted test 紅：

```text
actual:   Failed to fetch dynamically imported module
expected: 此功能暫時無法載入，請重新整理後再試。
```

還原後 targeted 1/1、完整 unit 313/313 綠。

### 修正後 production 與完整矩陣

```text
production bundle check passed: main 654837/191395 within 658867/192420;
total JS 841611/256497 within 849961/259062;
private repository: privateDataRepository-Wtx9hpeI.js;
Sentry: sentryBrowserSdk-Czz5dmkg.js
```

- anonymous discovery request targeted e2e：1/1 pass，private module request 仍為 0。
- `npm run test:ci:frontend`：exit 0；313/313 unit、286 browser passed／4 expected skipped、build／bundle gate 全綠。
- `npm run test:db`：exit 0；7 files／799 tests。
- `npm run test:local`：exit 0；local API 2/2、local browser 45 passed／11 expected skipped，`did not run = 0`。
- `git diff --check`：exit 0。
- 未 push；本 §9 回報更新保持 uncommitted，等待驗收方重驗。
