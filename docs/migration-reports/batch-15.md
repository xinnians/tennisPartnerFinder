# 批 15：讓 app module 測試載入器支援 WebKit

日期：2026-08-20　基準：`5575476`
對應工單：`docs/frontend-fix-plan-2026-08-20.md` 的 **P0-E**

## 1. 問題

`tests/fixtures/appRuntime.js` 把動態 `import()` 直接定義在 `page.addInitScript` 注入的
函式裡。Chromium 可執行，但 WebKit 會回 `TypeError: Importing a module script failed.`；
原基準 129 個 mobile WebKit 案例因此有 82 個死在 harness，蓋住真正的 Safari 差異。

## 2. 改動

採工單方案 (b)：`addInitScript` 只建立一個等待 importer 的穩定 facade，接著插入真正的
`<script type="module">`。動態 `import()` 的函式由文件內 module script 建立，再透過一次性
resolver 交給 facade；所有既有 `window.__importAppModule(name)` 呼叫點與副檔名映射完全不改。

選 (b) 的理由：不用在每次 `page.goto` 後重掛，不改 120 多個呼叫點，也不需要 Node 端
`exposeFunction` 轉發。這仍是純測試 fixture，不進 production bundle。

## 3. canary 四拍與 WebKit 結果

### 四拍

canary 在同一個 `addInitScript` callback 暫時包裝 `Element.prototype.append`，只吞掉帶
`data-app-module-importer="true"` 的 module script，其他 DOM append 原樣代理。

1. 改動後、無 canary：Chromium 代表案例
   `My Sessions segment switching redraws from the latest rendered snapshot` → 1 passed、exit 0；
   同案 mobile WebKit 也 1 passed、exit 0。
2. 改動後 + canary：以 `--timeout=10000` 跑同一 Chromium 案例 → exit 1：

   ```text
   Test timeout of 10000ms exceeded.
   Error: page.evaluate: Test timeout of 10000ms exceeded.
   const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
   1 failed
   ```

3. 精確移除 canary 六行：同案回到 1 passed、exit 0；
   `rg "originalAppend|HTMLScriptElement" tests/fixtures/appRuntime.js` 零命中。
4. 改動前對照：以 `git archive 5575476` 建乾淨副本，加入**同一段** append canary；
   舊 Chromium importer 不使用標記 module script，因此 1 passed、exit 0。這證明 canary
   專門拔掉本批新增的接縫，不是任意弄壞頁面。

canary 全程以精確 patch 加減，未使用 `git checkout`。

### 完整 mobile WebKit 盤點

臨時 project 使用 `devices["iPhone 12"]`、390×844，跑 smoke + performance 共 129 案：

```text
6 failed / 120 passed / 3 skipped
Importing a module script failed: 0
```

剩餘六案全部不是 module import 錯誤，逐條分類如下：

| 案例 | 失敗斷言 | 分類 |
|---|---|---|
| slow discovery shell | 抽屜關閉鈕 `toBeFocused` | Safari 真實 focus 行為差異 |
| anonymous discovery | filter sheet 關閉後 trigger `toBeFocused` | Safari 真實 focus restore 差異 |
| drawer close / base pin | 抽屜關閉鈕 `toBeFocused` | Safari 真實 focus 行為差異 |
| failed presence setting | 重繪後 switch `toBeFocused` | Safari 真實 focus restore 差異 |
| notification preferences | checkbox uncheck 後 `toBeFocused` | 測試寫法假設 tap 會聚焦；iOS 不成立 |
| location denial | button click 後 `toBeFocused` | 測試寫法假設 tap 會聚焦；iOS 不成立 |

前四案需要在批 23 判定產品是否要為 iOS 鍵盤／程式化 focus 補兼容；後兩案應先改成
鍵盤觸發或顯式 `focus()` 再驗焦點契約。本批依工單只解 harness，不修改 app 或斷言。

## 4. 完整 gates

| Gate | 結果 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run prettier:check` | `All matched files use Prettier code style!`，exit 0 |
| `node scripts/generate-courts-seed.mjs --check` | `--check 通過`，exit 0 |
| `npm run test:session-unit` | `# tests 249`、`# pass 249`、`# fail 0`，exit 0 |
| `npm run test:mock` | `254 passed / 4 skipped`（258），exit 0 |
| 臨時 mobile WebKit project | `120 passed / 3 skipped / 6 focus failures`；import failure 0 |
| `npm run build` | 主 JS `713.77 kB / gzip 201.04 kB`，CSS `64.61 kB / gzip 10.65 kB`，exit 0 |
| `git diff --check` | exit 0 |

`npm run test:db`、`npm run test:local` 與 local browser project 豁免：本批只改 mock/local
共用的測試載入 fixture，沒有 app runtime、migration、`dataApi.js`、RPC 或 Supabase 契約變更；
Chromium 完整 mock 與 WebKit 全套 mock 已覆蓋風險，未重置資料庫。

## 5. 驗收條件

| 條件 | 結果 |
|---|---|
| Chromium 通過數維持 254 passed / 4 skipped | ✅ |
| WebKit import failures 82 → 0 | ✅ |
| 六個剩餘 WebKit 案逐條分類 | ✅ |
| 不修 Safari 行為、不把 WebKit 加進 `test:mock` | ✅ |
| 既有 `__importAppModule` 呼叫點零修改 | ✅ |
| production bundle hash 與大小維持不變 | ✅ |

## 6. 變更清單與偏離

- `tests/fixtures/appRuntime.js`
- `docs/migration-reports/batch-15.md`

沒有產品程式、Playwright 正式 project、e2e 斷言、DOM／文案／aria／class／testid 變更。
與工單的唯一實測差異是剩餘 focus 失敗為 6 案而非預估約 4 案；已逐條列明，留給批 23。
