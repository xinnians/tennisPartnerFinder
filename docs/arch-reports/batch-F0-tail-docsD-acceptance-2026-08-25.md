# F0-6＋F0-4＋文件批 D 驗收紀錄

- 驗收日期：2026-08-25　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-24-frontend-F0-tail-docsD.md`
- 回報：`docs/arch-dispatch-2026-08-24-frontend-F0-tail-docsD-report-codex.md`
- 驗收範圍：基準 `870a016` → `ee49b74`（三個獨立 commit；驗收方的 roadmap commit
  `18f9487` 與本批並行落在其後，線性無分歧）

## 結論：**ACCEPTED**（三子項一次通過，無退件項）

## 一、F0-6 Node 版本前提 [已驗證]

- `package.json` engines `>=22.18`、`.nvmrc`＝`22`、lockfile 同步宣告；
  `ci-config.test.js` 新測試解析 inclusive lower bound、比對 `.nvmrc` major
  與 lockfile 一致性。
- **驗收方 canary（與 codex 的 engines 改值不同軸）**：把 `.nvmrc` 改成 `20` →
  新測試紅（`.nvmrc major must match the package engine lower bound`），
  還原綠。codex 自己的 engines `>=20` canary 輸出亦附於回報。

## 二、F0-4 focusable selector 收斂 [已驗證]

- 邊界選擇正確：不讓 `.tsx` 回頭 import legacy `sheets.js`，改立無副作用共用
  葉子 `src/focusableSelector.js`，兩個 consumer 直接 import——符合派工單
  預留的替代路徑，理由成立。
- selector 字串與基準**逐 byte 相同**（驗收方擷取兩版字面 diff 為空）；
  `grep -rn "button:not(\[disabled\])" src/` 由 2 降為 1，唯一命中即葉子。
- 兩個 consumer 的過濾語意不變（`hidden` 過濾與 `closest("[hidden]")` 保留）。

### 觀察（不阻擋）

驗收方 canary：把葉子 selector 拔掉 `[href]` 段 → `me-focus`＋`sheets-dom`
**仍綠**——selector 內容只被單元測試部分覆蓋（trap 測試未涵蓋 `[href]` 型節點）。
本批行為同一性由 byte 比對保證、不依賴測試載重，故不阻擋；但未來若有人改
selector 內容，unit 層抓不到 `[href]` 類回歸，記入覆蓋債。

## 三、文件批 D [已驗證]

- 索引 32 列、32 列皆附出處連結（指令計數）；來源分佈
  migration 7＋overview 6＋verdict 6＋fix-plan D1–D7 共 7＋母單不派工 6＝32
  （fix-plan 的 7 以表格列實數確認；驗收方首次 grep 型樣錯誤，非 codex 錯）。
- 三份歷史文件 diff **零刪除行**（只加註）；後註格式照既有慣例。
- 抽查 `D-06`／`D-07`／`NP-06` 三列：狀態判讀與出處連結正確
  （D-06 已終結→批 18、D-07 已終結→批 15／23、實機 Safari 分類仍留「生效」列）。

## 四、凍結面 [已驗證]

- 變更範圍恰為 11 檔：F0-6 三檔＋F0-4 三檔＋文件四檔＋ci-config 測試；
  `src/controller/`、`src/views/`、`syncCommit.ts`、dataApi、`.claude/rules/`
  等禁區零 diff。
- 首輪 local 的 `session.spec.js:1210` 單次 timeout：codex 依紀律處置
  （隔離 `--repeat-each=3` 全綠＋完整重跑全綠、未改測試未重置 DB），符合
  「單次紅先取樣」的既定流程。

## 五、驗收方獨立重跑

```text
test:ci:frontend  exit 0 — unit 304/304（含新 Node runtime 測試）、
                  Playwright 270／4 skipped、bundle 648016/188600（限額內）
test:db           799 PASS、exit 0
test:local        42 passed／11 skipped、did not run＝0、exit 0
git diff --check  乾淨
canary A          .nvmrc 改 20 → ci-config 紅；還原綠
canary B          selector 拔 [href] → focus unit 仍綠（記為覆蓋債觀察）
```

Playwright 未並發；未重置 DB。
