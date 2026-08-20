# 批 19：攔住前端執行期錯誤

日期：2026-08-20　基準：`293fe16`
對應工單：`docs/frontend-fix-plan-2026-08-20.md` 的 **P1-B**

## 1. 問題

專案原本有 18 個獨立 React root，但都沒有 Error Boundary。任一元件在 render 期間拋錯，
可能把整個局部介面清空；頁面也沒有統一接住 `window.error` 與
`unhandledrejection`。另外 8 個以 ref 檢查掛載結果的 sheet adapter，會在 React 已經攔住
錯誤後再拋一次「內容沒有掛載」，蓋掉真正原因。

## 2. 改動

- 新增共用 `AppErrorBoundary`，包住 4 個 page root 與 14 個 sheet/dialog root。
- render 錯誤時只讓該區塊顯示可關閉的降級畫面；sheet 關閉時仍沿用既有 backdrop
  關閉流程，常駐 page 則可收起提示。
- boundary 使用穩定的 `resetKey` 復原，不用替 child 加 key；因此正常更新不會把輸入、
  焦點或元件內狀態整棵重建。
- 8 個 ref adapter 會辨識 boundary 已接住的錯誤，不再用第二個例外蓋掉它。
- 全站一次安裝 `error` 與 `unhandledrejection` listener；相同 listener 可重複安裝而不疊加，
  也可移除。
- 新增可替換 transport，但預設是 no-op，**沒有選監控服務、沒有送資料的 endpoint、沒有
  source map 上傳**。
- transport payload 只允許 `kind`、`surface`、`errorName` 三個列舉／正規化欄位；不傳
  聯絡識別資料、位置、email、nickname、roster、原始訊息、stack 或 URL。
- 全域錯誤只顯示一個不含細節的可關閉提示，不把技術訊息或個資寫進 DOM。
- 新增 unit test、Playwright error-boundary spec，並把新 spec 明確註冊到兩個 Chromium
  mock project，避免「測試檔存在但 CI 沒跑」。

代價是目前 transport 刻意不送出，所以使用者不會整頁白屏，但團隊仍無法從遠端監控看見
錯誤。這符合工單「先建立安全介面，不先選服務商」的範圍。

## 3. canary 四拍

canary 只把 `CreateSessionSheet.tsx` 的 ref 守衛從：

```text
if (!contentRef.current && !boundaryFailed) throw ...
```

暫時改回：

```text
if (!contentRef.current) throw ...
```

1. 改動後、無 canary：新 error-boundary browser test 通過，boundary 顯示可關閉降級畫面，
   地圖仍可用且沒有 `pageerror`。
2. 加入 canary 後，精準執行「caught React sheet」測試為 exit 1，逐字關鍵輸出：

   ```text
   Error: page.evaluate: Error: CreateSessionSheet content did not mount.
   1 failed
   ```

3. 用精確 patch 加回 `&& !boundaryFailed` 後，同一測試重新為 `1 passed`、exit 0；
   新增的兩格跨 desktop/mobile、各重跑 3 次為 `12 passed`。
4. 以 `git archive 293fe16` 建改動前乾淨副本。舊版保留同一個無條件 ref throw；既有
   `profile and create sheets disclose public nickname use` 測試仍 `1 passed`、exit 0，
   表示舊 gate 對這個故障完全靜默。

## 4. 完整 gates

`npm run test:ci:frontend` 在最終樹執行：

| Gate                        | 結果                                               |
| --------------------------- | -------------------------------------------------- |
| courts seed `--check`       | 通過                                               |
| `npm run typecheck`         | exit 0                                             |
| `npm run lint`              | exit 0                                             |
| `npm run prettier:check`    | `All matched files use Prettier code style!`       |
| `npm run test:session-unit` | `259 passed / 0 failed`                            |
| Chromium mock e2e           | `262 passed / 4 skipped`（266）                    |
| Batch 19 穩定性取樣         | `12 passed`（兩格、兩個 project，各重跑 3 次）     |
| 回歸修正後焦點取樣          | `15 passed`（五格各重跑 3 次）                     |
| `npm run build`             | 主 JS `713.09 / 200.94 kB`；CSS `65.39 / 10.76 kB` |
| production bundle gate      | 12 output files；12 demo identifiers absent        |
| `git diff --check`          | exit 0                                             |

第一次完整 gate 揪出 Session Detail 把 boundary 以每次 commit 的 generation 當 key，造成
正常重繪也 remount child，讓五格焦點測試失敗。這是本批造成的真回歸，不是 flaky；已改成
穩定 boundary + `resetKey`，五格各重跑 3 次後為 `15 passed`，第二次完整 gate 全綠。

另以本機 mock server 做實際畫面檢查：首頁、地圖 fallback 與正常「開球局」流程都可用，
版面沒有重疊。console 只有假 Maps key 預期產生的 `InvalidKeyMapError`，與本批無關。

`npm run test:db`、`npm run test:local` 與 local browser project 豁免：本批只改 browser 端的
錯誤隔離、顯示及 mock browser tests，零 migration、RPC、`dataApi.js` 或 Supabase 契約變更。

## 5. 驗收條件

| 條件                                                   | 結果 |
| ------------------------------------------------------ | ---- |
| 18 個 React root 全部由共用 boundary 保護              | ✅   |
| sheet render 失敗只降級該區塊，背景地圖仍可操作        | ✅   |
| 降級畫面可關閉，且沒有把原始錯誤內容放入 DOM           | ✅   |
| 8 個 ref adapter 不再用第二個 throw 蓋掉 boundary 錯誤 | ✅   |
| `error` / `unhandledrejection` 可攔截、去重安裝、移除  | ✅   |
| transport failure 不會再造成新的未處理錯誤             | ✅   |
| payload 為三欄白名單，不含敏感資料、訊息、stack 或 URL | ✅   |
| 沒有設定遠端 endpoint，也沒有 source map 上傳          | ✅   |
| 新 browser spec 已列入 desktop/mobile Chromium project | ✅   |
| 正常重繪不 remount child，既有焦點語意保持             | ✅   |

## 6. 變更清單與偏離

- `src/appErrors.ts`
- `src/components/AppErrorBoundary.tsx`
- `src/main.js`
- `src/create-session.css`
- `src/pages/*.tsx`（4 個 root）
- `src/sheets/*.tsx`（14 個 root）
- `package.json`
- `playwright.config.js`
- `tests/app-errors.test.js`
- `tests/error-boundary.spec.js`
- `tests/ci-config.test.js`
- `docs/migration-reports/batch-19.md`

工單建議切兩個 commit，但遷移管線上層規則明訂「每批一個 commit」。本批依較高層級規則
維持單一 Batch 19 commit；全域攔截、boundary 與 gate 仍各自分檔，未來可以按檔案責任拆出。
其餘偏離只有把「18 個 root」依現行實際數量完整接線，沒有更動既有文案、aria、class、
testid 或正常流程 DOM；新增 UI 只會在錯誤路徑出現。
