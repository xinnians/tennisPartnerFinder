# 批次 D1 回報：唯一 App root 與頁面收斂

## 開工重盤

在 C6R 與 C4 文件補正 commit 後重新量測：

```text
$ wc -l src/main.js
1469 src/main.js
$ rg -n '^let ' src/main.js | wc -l
33
$ rg -n 'create(?:Root|SurfaceRoot)\(' src --glob '*.tsx' | wc -l
18
$ rg -n 'flushSync\(' src --glob '*.tsx' | wc -l
30
```

18 個 root 的組成仍是 4 個頁面 `createRoot` 與 14 個 sheet `createSurfaceRoot`；D1 前提成立。Google Maps 仍由 `map.js`／`pins.js` 的 imperative adapter 管理。

## 變更與檔案意圖

- 新增 `src/app/App.tsx`：建立唯一 App root，以 portal 把 Me、Messages、My Sessions、Nearby Drawer 放回既有穩定容器。
- 四個 `src/pages/*.tsx`：刪除各自的 `createRoot`、`flushSync`、WeakMap 與 mount adapter，只保留 typed React component；Me／My Sessions props 介面改為 export 供 App 使用。
- `src/sessionViews.js`：原本四個 page glob 改為一個 App glob；公開 `render*Page` adapter、DOM wiring、focus／scroll 還原與同步返回語意不變。
- `tests/app-errors.test.js`：內部結構契約由「18 個分散 root」演進為「1 個 App root＋14 個 sheet root」，並明確驗四個頁面檔沒有 `createRoot`、四個頁面仍各有隔離的 error boundary。
- 新增本回報 `docs/arch-reports/batch-D1.md`。

`main.js`、`sheets.js`、14 個 sheet mount、focus trap、surface stack、Google Maps、dataApi 與 features 均未修改。

## App root 設計

- App root 使用一個空的 `#react-app-root` host；實際頁面 DOM 透過 portal 留在原本的 `me-root`、`messages-root`、`my-sessions-root`、`nearby-sessions-drawer`，因此既有 CSS selector、DOM 查詢與頁面 hidden 切換不變。
- 每一類頁面保留以 root element 為 key 的 slot map；測試或 runtime 同時掛不同容器時不互相覆蓋。
- 每個 slot 保留獨立 generation；同一頁更新仍用 key 完整替換子樹，native listener 重接、錯誤邊界 reset 與舊 adapter 語意不變。
- 四種 destination 用 `memo` 隔離；更新其中一個 slot 時，其餘未變 slot 不重畫。
- `sessionViews.js` 呼叫集中後的一次 `flushSync()`，所以公開 render adapter 返回前 DOM 仍已更新。

## 量化收斂

```text
$ rg -c 'createRoot\(' src
src/sheets/surfaceRoot.ts:1
src/app/App.tsx:1

$ rg -n 'createRoot\(' src/pages --glob '*.tsx'
（無輸出）

$ rg -n 'create(?:Root|SurfaceRoot)\(' src --glob '*.tsx' | wc -l
15

$ rg -n 'flushSync\(' src --glob '*.tsx' | wc -l
27
```

頁面級 `createRoot` 由 4 降為 0；目前 runtime root 組成是 1 個 App root＋D2 才處理的 14 個 sheet root。`flushSync` 由 30 降為 27，是四份 page flush 收斂成 App adapter 的一份。

## 行為與契約

- `renderMePage`、`renderMessagesPage`、`renderMySessionsPage`、`renderNearbySessionsDrawer` 的函式名稱、參數與同步 DOM 契約不變。
- My Sessions 的 native action wiring、pending scope、created focus；Me 的 focus capture／restore；Messages 的 row focus；Drawer 的 scroll、Escape、overlay 讓位都仍在原 adapter 原順序執行。
- 深連結、bottom navigation、sheet 開關與 Google Maps 都未改。
- 四個頁面仍各自使用原本的 `AppErrorBoundary` surface 名稱；某頁 render 失敗不會清掉其他 portal。

## Gate

`npm run typecheck`、`npm run lint`、`npm run prettier:check`：全綠。

`npm run test:session-unit`：

```text
1..277
# tests 277
# pass 277
# fail 0
# skipped 0
# duration_ms 1950.930208
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
dist/index.html                  11.73 kB │ gzip:   3.54 kB
dist/assets/index-CgKsGA-d.css   65.39 kB │ gzip:  10.76 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-CZB5TzQI.js   715.53 kB │ gzip: 200.87 kB
✓ built in 887ms
```

`npm run check:production-bundle`：

```text
production bundle check passed: 12 files, 12 demo identifiers absent
```

`git diff --check`：exit 0，無輸出。

## 非阻擋 WebKit

依規格只跑一次：

```text
7 failed
3 skipped
125 passed (2.1m)
```

固定參考是 126／6／3，本次多一個 `keyboard dialogs trap focus and return it to the trigger` 的既有 WebKit focus timeout；其餘六項與 C6R 相同。D1 未修改該 sheet、`sheets.js`、focus trap 或測試，正式 Chromium 同一案例全綠；歷史 C4 也曾記錄相同 125／7／3 波動。依 WebKit 非阻擋規則保留原始結果，不重跑修飾數字。

## 反向掃描與白名單

- `rg -n '\bas any\b|:\s*any\b|<any>|@ts-ignore|@ts-expect-error' src/app src/pages`：輸出空。
- `rg -n 'createRoot\(' src/pages --glob '*.tsx'`：輸出空。
- `git diff -- src/main.js src/sheets.js src/map.js src/pins.js src/dataApi.js src/features supabase/migrations supabase/tests data/courts.json`：輸出空。
- 沒有改 e2e 斷言；只演進綁 root 內部結構的 `tests/app-errors.test.js`，且 15-root 掃描與四頁面 surface 集合皆非空。
- 沒有 push、deploy、改 `.env*`、reset DB 或套 migration。

## BLOCKED／偏差

- BLOCKED：無。
- 偏差：單次非阻擋 WebKit 比固定參考多一項既有 focus timeout；必要 gate 與同案例 Chromium 均全綠，證據如上。
