# 批次 D4 回報：imperative 協調削減與 adapter 收斂

## 開工重盤

D3 commit 後重新量測 TSX 內的同步提交：

```text
$ rg -n 'flushSync\(' src --glob '*.tsx' | wc -l
28
```

28 處中，2 處是 App／SurfaceHost 的公開相容邊界；其餘 26 處散落在 14 個 sheet 內。sheet 內又可分為：14 次初始 portal render、11 次 ref 型 imperative 更新，以及 1 次建立球局表單的自訂日期內部更新。

## 變更與檔案意圖

- `src/app/SurfaceHost.tsx`
  - 增加集中式 `commit(update)`，由同一個存活檢查與同步相容邊界承接 sheet adapter 更新。
  - render／update／unmount 都只經過一個 `commitSynchronously()`；不再讓 14 個 sheet 各自匯入 `flushSync`。
- `src/app/App.tsx`
  - 頁面 adapter 的同步提交收斂成具名 `commitPageAdapterSynchronously()`，並在原地註明保留理由。
  - 修正舊註解：D4 後 legacy page container 仍是 portal target，直到 `sessionViews.js` 的原生 listener 完整 React 化為止。
- `src/sheets/*.tsx`（14 檔）
  - 全數移除直接 `flushSync` 與重複外層 wrapper。
  - 8 個仍提供 imperative ref 方法的 adapter 統一呼叫 `surfaceContent.commit()`；存活與同步語意由 SurfaceHost 單點負責。
  - `CreateSessionSheet` 的自訂日期捲動改為 `useLayoutEffect`，讓 React state 正常提交後再捲動，不再在元件事件內強制同步。
- `tests/react-surface-lifecycle.test.js`
  - 結構 gate 確認 14 個 sheet 不得自行使用 `flushSync`。
  - 確認 SurfaceHost 只有一個同步提交點，8 個 imperative ref adapter 都經過集中式 `commit()`。
- 新增本回報 `docs/arch-reports/batch-D4.md`。

沒有新增另一套 root 或 adapter 架構；舊的 26 個 sheet 同步 wrapper 已直接刪除。

## generation key 逐一檢視

| 位置 | 處置 | 保留理由 |
| --- | --- | --- |
| `src/app/App.tsx` 的 page slot generation | 保留 | `sessionViews.js` 仍在每次公開 render 返回後對新 DOM 綁原生 listener；remount 同時重置已觸發的 error boundary。這是頁面相容 adapter 的生命週期 key，不是第二個 React root。 |
| `DecideSessionSheet` | 保留 | `setCourts()` 要重建候選球場按鈕，等價於舊版替換整段選項 DOM，避免沿用舊 pending node。 |
| `ProfileCompletionSheet` | 保留 | court catalogue 延遲補入時重建球場 checkbox node，同時保留其他表單 draft。 |
| `PlayerCardSheet` | 保留 | 邀請目標刷新時重建邀請選項 node，避免過期 session 控制項殘留 identity。 |
| `SessionChatSheet` | 保留 | 背景刷新只重建 roster／message nodes；composer 與 imperative-owned node 留在 generation 外，捲動位置由既有流程保存。 |
| `SessionDetailSheet` 的 action generation | 保留 | 動作狀態機切換時重建 action subtree 並重置局部 error boundary；async 存活檢查不變。 |

這些 key 都有明確的局部 DOM／錯誤隔離用途，沒有用來製造額外 root；盲目刪除會改變 listener、pending、focus 或錯誤恢復契約。

## 量化收斂

```text
$ rg -n 'flushSync\(' src --glob '*.tsx'
src/app/SurfaceHost.tsx:57:  flushSync(update);
src/app/App.tsx:198:  flushSync(renderApp);

$ rg -n 'flushSync\(' src --glob '*.tsx' | wc -l
2
```

由 28 降為 2，共移除 26 處（92.9%）。

殘留逐一理由：

1. `App.tsx`：`sessionViews.js` 會在公開 page render 呼叫返回後立刻 query DOM 並綁原生 listener，因此相容邊界必須保證 DOM 已提交；React 元件內部更新不走此路徑。
2. `SurfaceHost.tsx`：`sheets.js` 仍依凍結規則擁有 imperative shell、focus trap、Escape 與 close lifecycle，公開 sheet adapter 返回前也必須有 DOM；所有 sheet 已集中共用此唯一邊界。

## Gate

最終版本的 `npm run typecheck`、`npm run lint`、`npm run prettier:check`：全綠。

`npm run test:session-unit`：

```text
1..279
# tests 279
# pass 279
# fail 0
# skipped 0
```

`npm run test:mock`：

```text
4 skipped
266 passed (2.5m)
```

第一次為並行蒐集輸出時，另一個仍在執行的同一 gate 暫占 `127.0.0.1:5174`；等原流程自然完成後，以單一乾淨流程重跑並取得以上全綠結果。這是測試執行衝突，不是產品案例失敗。

`npm run test:local`：

```text
API：2 passed，0 failed
Playwright：11 skipped，42 passed (1.5m)
```

沒有 fixture 資源耗盡，未執行 local DB reset。

`npm run build`：

```text
✓ 148 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-CgKsGA-d.css   65.39 kB │ gzip:  10.76 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-u1KdvfpQ.js   717.45 kB │ gzip: 201.26 kB
✓ built in 872ms
```

`npm run check:production-bundle`：

```text
production bundle check passed: 12 files, 12 demo identifiers absent
```

`git diff --check`：exit 0，無輸出。

## 非阻擋 WebKit

依規格只跑一次：

```text
6 failed
3 skipped
126 passed (2.0m)
```

數字與固定基準 126／6／3 完全相同。六項仍是 WebKit 的 focus timeout；正式 desktop/mobile Chromium 的對應焦點、Escape、SurfaceHost unmount 與 filter sheet 案例全綠，沒有 D4 退化。

## 反向掃描與白名單

- 14 個 `src/sheets/*.tsx` 均無 `flushSync`；結構測試掃描集固定為 14 且非空。
- SurfaceHost 只有一個 `flushSync` literal；App 只有一個頁面 adapter `flushSync` literal。
- 唯一 React root 與 18 個 error surface 的既有結構測試全綠。
- `git diff -- src/map.js src/pins.js src/dataApi.js src/features supabase/migrations supabase/tests data/courts.json`：輸出空。
- 沒有 push、deploy、改 `.env*`、reset DB 或套 migration。

## BLOCKED／偏差

- BLOCKED：無。
- 偏差：無；WebKit 數字與基準相同。
