# `ds-bundle` 完成稽核

日期：2026-09-08

## 白話結論

`ds-bundle/` 在本機 repo 的工作已閉環，可以繼續保留作為 UI/UX 設計同步資料：production CSS 有單一產生器，9 張手寫卡片有固定清單與來源檢查，行動版尺寸有真實瀏覽器 gate。這不代表遠端設計專案已同步；本批沒有遠端 read-back，所以不做該項聲明。

## 稽核依據

對照以下現行資料，不沿用舊報告的結論：

- `frontend-architecture-final-v3-2026-08-31.md` 的 P7 與階段 1。
- `scripts/designSystemBundle.mjs`、`package.json`、`playwright.config.js`。
- `ds-bundle/`、`.design-sync/` 現有 tracked files。
- 批次 preflight、A、B、C、D 的五份證據文件。
- 目前 branch `codex/frontend-architecture-execution` 的實際檔案與測試結果。

## 已閉環的項目

### CSS 與 token

- `src/main.js` 的 13 份 production CSS 是唯一輸入順序。
- `_ds_bundle.css` 與 `tokens/tokens.css` 都由同一支 script 產生，不再手抄。
- 實測 bundle 與產生結果 byte-identical，50 個 token 也 byte-identical。
- `npm run check:design-system` 已在 pretest 與 frontend CI 執行，production CSS 改了但未同步會直接失敗。

### 卡片與文件

- repo 有 9 張卡片，固定清單、README 索引與實際檔案相符。
- static gate 檢查 metadata、viewport、stylesheet、重複 ID、固定行號、退役 screen reference 與 source citation 是否存在。
- 9 張卡片的現行 source citation 全部能解析；不存在的歷史 Bricks／Screens 沒有被列成 repo 可交付內容。
- `.design-sync/config.json` 明確標示 hand-authored、production source 才是正典，而且沒有假裝存在 `_ds_sync.json` 或遠端 read-back。

### 行動版 computed size

- 9 張卡在 390×844 共 84 個可操作項目，低於 44×44px 為 0，HTTP 200 為 9／9，runtime error 為 0。
- Chromium 與 WebKit 使用同一個 scanner；production touch tests 也共用它。
- scanner 會排除 disabled、合併 wrapping label、納入 summary／ARIA role，並計算 `::before` 擴大的有效熱區。
- 新增永久 canary：43×43px 必須被抓到，30×30px 加四邊 7px 熱區必須算成 44×44px，disabled 控制項不可被誤算。

## 本次稽核補掉的兩個缺口

1. `.design-sync/NOTES.md` 的現行狀態仍寫「下一批才更新卡片」，已改成批次 B／D 完成後的事實。
2. `ds-bundle/README.md` 原本只寫 static check 與人工 render 流程，未指出 mobile computed-size gate；現在已補上 CI／WebKit 的實際操作入口。

這兩項都是文件與測試防線修正，沒有再改 production UI。

## 驗證

```text
npm run check:design-system
5 passed

TENNIS_TEST_HARNESS_MODE=mock npx playwright test \
  tests/design-system-cards-smoke.spec.js \
  --project=desktop-chromium \
  --project=mobile-chromium \
  --project=mobile-webkit
30 passed
```

```text
npm run test:ci:frontend

Node：672 passed / 5 skipped
Playwright Chromium：376 passed / 4 skipped
typecheck、lint、Prettier、build、design-system drift、bundle structure、git diff：全部通過
```

production JavaScript 沒有因本批文件／測試變更而增加：main 649121／191416／159980，total
853560／262432／221739 raw／gzip／Brotli bytes。total raw／gzip 仍是 report-only 的 3599／3370 bytes 超額，政策未改。

## 尚未完成但不屬於 `ds-bundle` 的項目

- 遠端設計專案狀態：沒有 read-back，不宣稱已同步。
- Google Maps marker 真實 hit area：mock marker 不能代表 Google runtime，仍缺正式 runtime 證據。
- Push B13.3 UI／隱私 mapping：需要四項產品決策。
- Hosted cleanup 最小重驗、Hosted dispatcher `dispatch`、production runtime／legacy cutoff：仍受既定 Hosted／production 操作邊界限制。
- Bundle byte hard limit：依 D8／D9，在第一個 production release candidate 前用正式基線重訂；目前維持 report-only。

## 下一個可執行入口

本機 `ds-bundle` 已沒有未完成的架構批次。下一步若要繼續本計畫，需先確認 B13.3 的顯示分組、dormant mapping、`invalid` 行為與隱私頁範圍；這些是產品與隱私文案決策，不是 migration，所以不套用 migration 的持續授權。
