# `ds-bundle` deterministic CSS 同步

日期：2026-09-08  
實作基準：`0bbf00e`

## 白話結論

`ds-bundle` 的 CSS 已經跟 production 對齊，而且以後不會再只靠人工記得同步。

現在執行一個指令就會按 production 真實順序合併 13 份 CSS，另一個指令會檢查產生檔是否落後。這個檢查已接進
一般測試與 frontend CI；production CSS、載入順序或 token 有變但 bundle 沒更新時，檢查會直接失敗並告訴開發者
重新同步。

本批沒有修改 production UI 或 production CSS。卡片的舊內容、缺少 viewport meta 與 Toast 重複 ID 留在下一批
逐張更新，避免把 CSS 同步與 DOM 改寫混成一個難以查證的大批次。

## 實際改動

### 1. 單一產生器

新增 `scripts/designSystemBundle.mjs`：

- 從 `src/main.js` 直接讀取 `.css` imports，不另外手抄第二份順序。
- 要求 CSS path 非空且不重複。
- 按讀到的順序合併全部 production CSS，產生 `ds-bundle/_ds_bundle.css`。
- 從含 `--color-ink` 的唯一 production `:root` 取出 token block，產生 `ds-bundle/tokens/tokens.css`。
- 正規化換行與行尾空白；不修改 selector、property、value 或層疊順序。
- 產生檔有固定 header 與逐檔 source marker，不含時間戳，所以同一份 source 每次輸出相同。

使用方式：

```bash
npm run sync:design-system
npm run check:design-system
```

目前輸出：

```text
13 production CSS sources
50 tokens
_ds_bundle.css 115,547 bytes（含固定 generator header／source markers）
tokens/tokens.css 2,182 bytes
```

### 2. 漂移 gate

新增 `tests/design-system-bundle.test.js`，固定三個契約：

1. 產生器從 `src/main.js` 讀到的順序要等於正式 architecture manifest。
2. repo 內兩個產生檔要逐 byte 等於目前 source 應產生的結果。
3. 測試把 production 的 `30dvh` canary 改成 `29dvh` 後，gate 必須變紅；還原的真實檔案維持綠色。

`tests/ci-config.test.js` 另鎖定兩個 npm commands、pretest 與 unit aggregate，避免 checker 存在但沒有被執行。

`test:ci:frontend` 現在的前段順序是：

```text
generated court seed check
design-system drift check
typecheck
lint
Prettier
unit／browser tests
build
production bundle check
diff check
```

GitHub workflow 本身不用改，因為 required frontend job 原本就呼叫 `npm run test:ci:frontend`。

### 3. 文件與設定回到現況

- `ds-bundle/README.md` 改用品牌「球咖」，明確說 production 是 React app、卡片只是純 HTML 設計參考。
- README 索引只列 repo 內確實存在的 9 張卡片；沒有假設遠端歷史 Screens 仍存在。
- `.design-sync/config.json` 保留原 project ID，更新名稱、React 架構、generator 與遠端 read-back 邊界。
- `.design-sync/conventions.md` 改為現行樣式、source ownership 與 desktop／390px 驗證規則。
- `.design-sync/NOTES.md` 保留 2026-08 歷史，但在最上方註明「無 React」等描述只代表當時，不是現況。
- `ds-bundle/styles.css` 更新入口說明；Google Fonts 與兩個本地 import 沒有變。

本批沒有對遠端設計專案做 read-back 或寫入，因此只描述 repo 的確定狀態，不宣稱遠端名稱或檔案已同步。

## 對齊結果

使用和 preflight 相同的 CSS semantic audit 重跑：

| 比對項目                        | preflight | 本批完成後 |
| ------------------------------- | --------: | ---------: |
| production selector occurrences |       668 |        668 |
| bundle selector occurrences     |       640 |        668 |
| identical occurrences           |       648 |        668 |
| changed                         |         4 |          0 |
| bundle-only                     |         2 |          0 |
| production-only                 |        15 |          0 |
| token name/value drift          |         0 |          0 |

bundle 比 production 多 563 bytes，是固定 generator 註解與 source markers；rule occurrences、selector occurrences
與實際 declarations 全部相同，不是 CSS 行為差異。

## Render 複核

以更新後的完整 CSS mirror 重跑 9 張卡片 × desktop 1280×900／mobile 390×844，共 18 次：

- 18/18 HTTP 200、內容非空。
- console warning/error、page error、failed request、framework overlay、horizontal overflow 全部為 0。
- 有互動元件的卡片，第一個 control 都取得 3px solid focus outline。
- accessible name 與 form label 缺失都是 0。
- BottomNav 點擊品牌後正確導向 `#tab-map`。
- 重新檢視 Sheet 與 Buttons mobile screenshot，沒有截斷、重疊或錯誤遮罩。

preflight 已知的卡片問題仍可重現，符合本批沒有偷改 DOM 的預期：SessionCard／Chat／Sheet 缺 viewport meta、Toast
重複 ID，以及部分 demo controls 小於 44px。它們由下一批 B 依現行 production owner 逐張處理。

## 驗證

```text
npm run sync:design-system：13 CSS sources／50 tokens，passed
npm run check:design-system：passed
targeted design-system + CI config：34 passed / 0 failed
CSS semantic audit：668 identical；0 changed；0 bundle-only；0 production-only
card render：18/18 passed；0 console/page/request error；0 overlay；0 overflow
full Node：670 passed / 5 skipped（675 tests）
full mock Chromium：348 passed / 4 skipped（352 tests）
typecheck／lint／Prettier／build／bundle structural checks／diff check：passed
```

第一次 targeted test 執行時，新測試把正式 manifest 欄位誤寫成不存在的 `cssImports`，因此為 33/34；確認 fixture
後改成實際欄位 `cssImportOrder`，再跑 targeted 與完整 frontend CI 都通過。這是新增測試本身的修正，沒有改
production code。

完整 CI 仍出現既有 `Port 24678 is already in use` 與 Vite 500 kB chunk warning；所有測試與 build 都通過。本批
production bundle 數值沒有改變：main 649,121／191,413／159,896，total 853,560／262,410／221,605
raw／gzip／Brotli；development total raw／gzip 依 D8 只報告超過 3,599／3,348 bytes。

## 下一步

進入 `ds-bundle` 批次 B：逐張對照現行 component／view owner，更新 9 張卡片的說明與狀態，補 viewport meta、修
Toast 重複 ID，然後重跑 source reference、markup、desktop／390px render 與互動驗證。production UI 仍不先修改。
