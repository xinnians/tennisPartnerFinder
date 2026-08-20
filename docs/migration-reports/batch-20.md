# 批 20：sheet 關閉時卸載 React root

日期：2026-08-20　基準：`d54c098`
對應工單：`docs/frontend-fix-plan-2026-08-20.md` 的 **P1-D**

## 1. 問題

專案有 14 個 React sheet/dialog adapter，但關閉流程原本只執行
`root.innerHTML = ""`，全庫沒有任何 `reactRoot.unmount()`。目前元件尚未使用 `useEffect`，
所以沒有立即可見的 cleanup 洩漏；但往後第一個計時器、訂閱或事件 effect 就會在畫面關閉後
繼續存活。

另一個已能實際重現的風險是 Session Detail：`commit()` 在 root 卸載後再 `render()` 會丟
`Cannot update an unmounted root.`；加入球局的 Promise 也可能在使用者先關閉 sheet 後才回來，
沿 `submitJoin → setStage → renderStage → commit` 走到同一個錯誤。舊完整 gate 對這兩條路徑
沒有防線。

## 2. 改動

- 新增 `src/sheets/surfaceRoot.ts`，集中保存 React root 的 live/dead 狀態。
- 14 個 sheet/dialog adapter 全部改用 `createSurfaceRoot()`，並回傳
  `unmount()` 與 `isSurfaceRootLive()`；重複卸載是安全的 no-op。
- `mountSurface()` 新增 `registerUnmount()`。關閉或同一容器被新 surface 取代時，順序固定為
  「解除 modal isolation → React unmount → 清空 DOM → onClose → 還原焦點」。
- 即使 React cleanup 自己拋錯，surface 仍會完成 DOM、registry、onClose 與焦點清理，再把
  原錯誤交回既有全域錯誤攔截。
- `SessionDetailSheet` 的 `commit()` 在 root 已死時直接返回；`sessionViews.js` 的
  `renderStage()` 與 `setJoinPreview()` 也先檢查同一個 live 狀態，避免延遲 Promise 回來後繼續
  補 listener 或移動已離線節點的焦點。
- 新增單元掃描 gate，鎖住 14 個 adapter、14 次卸載註冊、unmount-before-clear 順序與兩層
  Session Detail guard。
- 新增 desktop/mobile Chromium browser gate，驗「replace 與 close 各卸載一次」及「加入
  結果晚到不會更新已關閉 sheet」；spec 已明確註冊到 Playwright config。

## 3. canary 四拍

canary 精確移除 Session Detail 掛載後的這一行：

```text
mounted.registerUnmount(content.unmount);
```

1. 改動後、無 canary：新 spec 在 desktop/mobile 為 `4 passed`、exit 0。
2. 加入 canary 後，精準執行 pending join 測試為 exit 1，逐字關鍵輸出：

   ```text
   - Array [
   -   "session-sheet",
   - ]
   + Array []
   Timeout 5000ms exceeded while waiting on the predicate
   1 failed
   ```

3. 用精確 patch 加回該行後，新 spec 兩格 × 兩 project × 3 次為 `12 passed`、exit 0。
4. 以 `git archive d54c098` 建改動前乾淨副本。舊版既有
   `a pending join confirmation accepts only one intentional submission` 測試仍
   `1 passed`、exit 0；它只驗雙擊防重，沒有在 Promise pending 時關閉，因此卸載缺口完全
   靜默。

## 4. 完整 gates

`npm run test:ci:frontend` 在最終樹執行：

| Gate                        | 結果                                               |
| --------------------------- | -------------------------------------------------- |
| courts seed `--check`       | 通過                                               |
| `npm run typecheck`         | exit 0                                             |
| `npm run lint`              | exit 0                                             |
| `npm run prettier:check`    | `All matched files use Prettier code style!`       |
| `npm run test:session-unit` | `262 passed / 0 failed`                            |
| Chromium mock e2e           | `266 passed / 4 skipped`（270）                    |
| Batch 20 穩定性取樣         | `12 passed`（兩格、兩個 project，各重跑 3 次）     |
| `npm run build`             | 主 JS `714.57 / 201.45 kB`；CSS `65.39 / 10.76 kB` |
| production bundle gate      | 12 output files；12 demo identifiers absent        |
| `git diff --check`          | exit 0                                             |

另以本機實際瀏覽器操作登入提示與 React 篩選 sheet：開啟、關閉後 dialog 數為 0，地圖
region 仍為 1；畫面截圖未見 modal、footer 或背景遮罩重疊。地圖因本機 key 無效而走既有
清單 fallback，與本批無關。

`npm run test:db`、`npm run test:local` 與 local browser project 豁免：本批只改 browser 端
React root 生命週期與 mock browser tests，零 migration、RPC、`dataApi.js` 或 Supabase
契約變更。

## 5. 驗收條件

| 條件                                                   | 結果 |
| ------------------------------------------------------ | ---- |
| 14 個 React sheet/dialog adapter 全部提供卸載契約      | ✅   |
| close 在清 DOM 前先呼叫 React unmount                  | ✅   |
| replace 先卸載舊 root，再掛新 surface                  | ✅   |
| 同一個 surface 重複 close/unmount 不重複 cleanup       | ✅   |
| Session Detail 直接 commit 在 root 已死時不執行        | ✅   |
| pending join 晚到時不 render、不補線、不移動離線焦點   | ✅   |
| 新 unit test 已列入 `test:session-unit`                | ✅   |
| 新 browser spec 已列入 desktop/mobile Chromium project | ✅   |
| 既有 DOM、文案、aria、class、testid 與正常焦點語意保持 | ✅   |

## 6. 變更清單與偏離

- `src/sheets.js`
- `src/sessionViews.js`
- `src/sheets/surfaceRoot.ts`
- `src/sheets/*.tsx`（14 個 sheet/dialog adapter）
- `tests/react-surface-lifecycle.test.js`
- `tests/react-unmount.spec.js`
- `tests/app-errors.test.js`
- `tests/ci-config.test.js`
- `package.json`
- `playwright.config.js`
- `docs/migration-reports/batch-20.md`

工單只明講 Session Detail 的兩條危險路徑，但真正的生命週期責任屬於 14 個 adapter，所以本批
用共用 helper 一次收斂，沒有只特判單一 sheet。測試 hook 只在
`__tennisE2ETestHooks.surfaceRootLifecycle` 明確存在時回報固定 surface id；正式環境沒有該
hook、沒有網路傳輸，也不接觸使用者資料。其餘沒有偏離。
