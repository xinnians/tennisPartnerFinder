# 批次 D2 回報：SurfaceHost 收斂 sheet root

## 開工前提重盤

D1 後重新核對：runtime 是 1 個 App root 加 14 個 sheet root；`src/sheets.js` 仍擁有 backdrop、focus trap、Escape、surface stack、關閉與焦點回復，符合 D2 前提。`main.js` 維持 1469 行、33 個頂層 `let`，本批未提前處理 D3。

## 變更與檔案意圖

- 新增 `src/app/SurfaceHost.tsx`：集中保存 sheet 內容 slot，透過 `createPortal` 把 React 內容放回既有 imperative shell 的內容容器。
- `src/app/App.tsx`：把 `SurfaceHost` 納入唯一 App root，頁面與 sheet 共用同一個 render snapshot。
- 14 個 `src/sheets/*.tsx`：mount 接線由獨立 `createSurfaceRoot` 改為 `mountSurfaceContent`；原本的 props、ref adapter、error boundary 與同步 render 呼叫順序保留。
- 刪除 `src/sheets/surfaceRoot.ts`：不再建立 per-sheet React root，避免保留第二套架構。
- `tests/app-errors.test.js`、`tests/react-surface-lifecycle.test.js`：內部結構契約演進為單一 root＋14 個非空 SurfaceHost adapter，18 個隔離 error surface 與 14 個 unmount 註冊都不可縮水。
- `tests/react-unmount.spec.js`：測試 hook 改名以反映 portal lifecycle；關閉、替換與延遲結果不得回寫的原行為斷言不變。

`src/sheets.js`、`src/sessionViews.js`、Google Maps adapter、dataApi、features 與所有對外行為均未修改。

## SurfaceHost 設計與同步契約

- shell 仍先建立穩定內容槽，React 只 portal 內容，不取得 backdrop、focus trap、Escape 或 close 的所有權。
- 14 個 sheet mount 都取得同一種 `SurfaceContentLifecycle`：`render`、`isSurfaceRootLive`、`unmount`。
- `unmount()` 先把 slot 標為失效，再同步從 App snapshot 移除 portal；既有 shell 隨後清 DOM，因此不會讓 React 留在已清除容器。
- sheet 原本在 adapter 邊界的 `flushSync()` 保留，確保公開 mount／update 呼叫返回前 DOM 已更新；D4 再逐一檢視是否可退場。
- 每個 sheet 仍保有自己的 `AppErrorBoundary`，單一 portal render 失敗不會摧毀整個 App。

## 量化收斂

```text
$ rg -n 'createRoot\(' src
src/app/App.tsx:184:  appRoot = createRoot(host);

$ rg -n 'createSurfaceRoot|surfaceRoot\.ts' src tests
（無輸出）

$ rg -l 'mountSurfaceContent\(' src/sheets --glob '*.tsx' | wc -l
14

$ rg -n 'flushSync\(' src --glob '*.tsx' | wc -l
28
```

React root 已由 D1 後的 15 個收斂為 1 個。`flushSync` 比 D1 的 27 多 1 個，是 `SurfaceHost.unmount()` 在 shell 清 DOM 前同步提交 portal 移除；其餘 sheet adapter 的同步邊界留待 D4 逐項裁減。

## 針對性執行期驗證

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/react-unmount.spec.js tests/error-boundary.spec.js --project=desktop-chromium
4 passed (3.5s)

$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/performance.spec.js --project=desktop-chromium --grep "keyboard dialogs trap focus"
1 passed (1.7s)
```

確認 portal 關閉／替換各卸載一次、延遲 join 結果不回寫已關閉 sheet、錯誤邊界可關閉、鍵盤 focus trap 與焦點回復正常。

## Gate

`npm run typecheck`、`npm run lint`、`npm run prettier:check`：全綠。

`npm run test:session-unit`：

```text
1..277
# tests 277
# pass 277
# fail 0
# skipped 0
```

`npm run test:mock`：

```text
4 skipped
266 passed (2.5m)
```

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
dist/assets/index-mOi-t6NJ.js   716.03 kB │ gzip: 201.03 kB
✓ built in 890ms
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

與固定 126／6／3 基準相同，沒有劣化。六項皆是既有 WebKit focus timeout；D2 新增／演進的 `react-unmount` 兩項與 error-boundary 兩項全部通過。

## 反向掃描與白名單

- `rg -n 'createRoot\(' src`：只有 `src/app/App.tsx` 一筆。
- `rg -n 'createSurfaceRoot|surfaceRoot\.ts' src tests`：輸出空。
- `mountSurfaceContent` 的 sheet 掃描集為 14，且每個 sheet 都保留 `AppErrorBoundary` 與 lifecycle return。
- `git diff -- src/sheets.js src/sessionViews.js src/map.js src/pins.js src/dataApi.js src/features supabase/migrations supabase/tests data/courts.json`：輸出空。
- 沒有修改既有 e2e 行為斷言；只把測試 hook 與測試名稱從 root ownership 更新為 portal lifecycle。
- 沒有 push、deploy、改 `.env*`、reset DB 或套 migration。

## BLOCKED／偏差

- BLOCKED：無。
- 偏差：無；imperative shell 可在不搬進 React 的前提下保留，唯一 App root 與同步／焦點契約同時成立。
