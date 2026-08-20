# 批 18：保存附近球局抽屜的捲動位置

日期：2026-08-20　基準：`1ec3b34`
對應工單：`docs/frontend-fix-plan-2026-08-20.md` 的 **P1-C**

## 1. 問題

附近球局抽屜每次重繪都會換成新的 `.nearby-drawer__scroll` element，因此位置回到頂端。
60 秒安靜輪詢或回到前景時即使資料內容不變，也會打斷使用者正在瀏覽的首頁清單。

這不是 React 遷移造成的意外回歸，而是一次明確翻案：本批推翻批 8 的
`.nearby-drawer__scroll` parity 取捨。理由是 60 秒輪詢造成的跳回頂端，是首頁主要瀏覽面的
實際體驗問題；決策日為 **2026-08-20**。新產品規則改為「使用者滑到哪就停在哪」。

## 2. 改動

- `src/sessionViews.js` 以 root 為範圍保存開啟中抽屜的 `scrollTop`。
- 重繪前只量測目前確實開啟且有可視高度的捲動層；收合狀態重繪不會拿隱藏 element 的 0
  覆寫最後一次有效位置。
- React `flushSync` commit 完成後，先排入既有焦點還原，再排入捲動還原。兩者在同一個
  animation frame 依註冊順序執行，因此焦點可能造成的瀏覽器捲動會被最後校正。
- 新清單較短時，以 `scrollHeight - clientHeight` 為上限 clamp，不保留超出內容的值。
- 首次渲染沒有記憶值時維持瀏覽器預設 0，不拋錯。

目前產品是 v2 的兩態模型，不是計劃文字沿用的舊三態：

| 實際狀態 | 規則 |
|---|---|
| `collapsed` | 面板隱藏；連續收合重繪不讀、不寫、不還原。由 open 收合時先保存離開前的位置。 |
| `open` | 重繪前保存，commit 與焦點還原後恢復；首次開啟為 0，重新開啟則回到上次位置。 |

舊詞 `peek / half / full` 已不再是程式狀態；手勢與按鈕只在 `collapsed ↔ open` 間切換。

## 3. canary 四拍

canary 精確移除正式路徑最後一行：

```text
restoreDrawerScrollTop(root, drawerState);
```

1. 改動後、無 canary：Batch 18 的兩個 browser test 為 `2 passed`、exit 0；
   `--repeat-each=5` 為 `10 passed`、exit 0。
2. 改動後 + canary：exit 1，兩格都轉紅，逐字關鍵輸出：

   ```text
   Expected: 200
   Received: 0
   2 failed
   ```

   第一格同時證明焦點仍回到 `18008`，但 `scrollTop` 從預期 200 變 0；不是被其他斷言誤殺。
3. 用精確 patch 加回該呼叫：`--repeat-each=5` 再次 `10 passed`、exit 0；
   `rg` 與最終 diff 確認還原呼叫存在，沒有使用 `git checkout` 清 canary。
4. 以 `git archive 1ec3b34` 建改動前乾淨副本。舊版本身就是「不還原捲動」的同一缺陷；
   當時只有焦點測試，執行既有
   `open drawer: opening a session detail sheet...` 仍 `1 passed`、exit 0，缺陷完全靜默。

## 4. 完整 gates

`npm run test:ci:frontend` 在最終樹執行：

| Gate | 結果 |
|---|---|
| courts seed `--check` | 通過 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run prettier:check` | `All matched files use Prettier code style!` |
| `npm run test:session-unit` | `255 passed / 0 failed` |
| Chromium mock e2e | `258 passed / 4 skipped`（262） |
| Batch 18 穩定性取樣 | `10 passed`（兩格各重跑 5 次） |
| `npm run build` | 主 JS `708.12 / 199.37 kB`；CSS `64.61 / 10.65 kB` |
| production bundle gate | 12 output files；12 demo identifiers absent |
| `git diff --check` | exit 0 |

另以本機 mock server 做實際畫面檢查：桌面抽屜可捲到後段球局，抽屜、固定底部導覽與卡片
沒有視覺重疊。console 只有刻意使用假 Maps key 的 `InvalidKeyMapError`；清單 fallback 正常，
與本批程式無關。

`npm run test:db`、`npm run test:local` 與 local browser project 豁免：本批只改 browser 端的
DOM 重繪後狀態保存與 mock browser tests，零 migration、RPC、`dataApi.js` 或 Supabase 契約變更。

## 5. 驗收條件

| 條件 | 結果 |
|---|---|
| open 捲到 200，觸發 visibility 路徑的 `quietRefreshDiscovery` 後仍為 200 | ✅ |
| 卡片焦點與捲動位置同時還原 | ✅ |
| 清單縮短時 clamp 到新的合法上限 | ✅ |
| 連續 collapsed 重繪不污染記憶，重新 open 回到 200 | ✅ |
| 實際 v2 `collapsed / open` 兩態規則已定義並測到 | ✅ |
| 首次 collapsed 渲染為 0 且不拋錯 | ✅ |
| 批 8 parity 翻案原因與日期已落檔 | ✅ |
| DOM／文案／aria／class／testid 與既有 e2e 斷言零變更 | ✅ |

## 6. 變更清單與偏離

- `src/sessionViews.js`
- `tests/smoke.spec.js`
- `docs/migration-reports/batch-18.md`

偏離工單的只有狀態名稱校正：工單沿用 `peek / half / full`，但現行 v2 原始碼與既有測試只
接受 `collapsed / open`。本批沒有重新引入已退場的三態，而是把兩個真實狀態、首次開啟、
重新開啟、連續收合重繪與清單縮短全部測實；使用者可見的唯一刻意變更就是保存捲動位置。
