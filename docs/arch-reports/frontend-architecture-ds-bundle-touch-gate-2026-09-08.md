# `ds-bundle` 批次 D：行動版觸控尺寸 gate

日期：2026-09-08

## 白話結論

設計卡原本剩下的 16 筆小尺寸，已確認都是因為 Buttons／Chips 卡片少放了正式畫面使用的外層容器。補回真實容器後，9 張設計卡在 390×844 下共量到 84 個可操作項目，低於 44×44px 的數量為 0。

建立跨瀏覽器 gate 時另外查到一個真實問題：WebKit 會把「編輯球局」的兩個下拉選單畫成 22px 高。這不是猜測；設計卡和正式 React 畫面都能重現。現在已用限定在 `.create-session-sheet` 的規則修成 44px，並把正式畫面納入永久測試。

## 已確認的原始資料

- 批次 C 後的 Chromium 行動版卡片量測：
  - Buttons：10 筆不足 44px。
  - Chips：6 筆不足 44px。
  - 其他 7 張卡：0 筆。
- 16 筆全部可對到正式 DOM 脈絡：
  - `src/app/App.tsx`：`#player-directory-open`、`#band-options`。
  - `src/sheets/FilterSheet.tsx`：`.filter-sheet-band-grid`。
  - `src/pages/MySessionsPage.tsx`：`.my-session-card__actions`。
- 新增 WebKit gate 後，`Sheet.html` 的 `demo-edit-court` 與 `demo-edit-play-type` 都實測為 22px；同樣開啟正式 `EditSessionSheet` 時，`session-edit-court` 與 `session-edit-play-type` 也都是 22px。

## 本批變更

### 設計卡回到正式使用脈絡

- `Buttons.html`
  - primary／secondary／tertiary 範例放入 `.my-session-card__actions`。
  - 球友名單按鈕補上正式的 `#player-directory-open` 與 `data-testid`。
  - MapTopbar 程度選項補上 `#band-options`。
  - FilterSheet 程度選項補上 `.filter-sheet-band-grid`。
  - 文案改成直接指出真正 owner 與外層容器。
- `Chips.html`
  - 兩組 `.band-option` 分別放回 `#band-options` 與 `.filter-sheet-band-grid`。
  - FilterSheet 範例使用 production 的兩欄 grid，不再由 demo 樣式覆蓋。

### 新增真正會量尺寸的 gate

- 新增 `tests/fixtures/touchTargets.js`，production 與設計卡共用同一個掃描器。
- 掃描器只計算可見、可操作、未 disabled 的控制項；包住 input 的 label 只算外層一次，並把 `::before` 擴大的透明熱區算進去。
- 掃描範圍包含 button、link、input、select、textarea、可操作 label、summary、`role=button` 與 `role=switch`。
- 新增 `tests/design-system-cards-smoke.spec.js`：明確走訪 9 張卡，以 390×844 實際 computed size 檢查每個可操作項目。
- Tokens 卡只有 disabled 狀態範例，測試明確確認它不會被誤算成可操作項目。

### 修正 WebKit 真實缺口

- `src/surfaces.css` 對 `.create-session-sheet .form-field select` 加上明確 `height: 44px`。
- 作用域只涵蓋已能重現問題的 `.create-session-sheet`；現行 production 使用點是編輯球局 sheet，不改其他表單。
- `tests/touch-targets-smoke.spec.js` 新增正式 `EditSessionSheet` 情境，直接量正式 React DOM。
- 產生檔 `ds-bundle/_ds_bundle.css` 已由 `npm run sync:design-system` 同步，沒有手改。

## 驗證結果

### 卡片與 production 對稱測試

```text
TENNIS_TEST_HARNESS_MODE=mock npx playwright test \
  tests/design-system-cards-smoke.spec.js \
  tests/touch-targets-smoke.spec.js \
  --project=desktop-chromium \
  --project=mobile-chromium \
  --project=mobile-webkit

39 passed
```

其中包含：

- 9 張卡 × 3 個 browser project。
- 4 個 production 觸控情境 × 3 個 browser project。
- WebKit 正式編輯表單的兩個 select 均為 44px。

### 9 張卡完整量測

| viewport | HTTP 200 | 可操作項目 | runtime error | 小於 44px |
| --- | ---: | ---: | ---: | ---: |
| desktop 1280×900 | 9／9 | 84 | 0 | 22 |
| mobile 390×844 | 9／9 | 84 | 0 | 0 |

桌機的 22 筆分別是 Buttons 3、Chips 8、BottomNav 2、Sheet 9；這些是桌機密度，不套用本批的行動版 44px gate。

### 完整 frontend CI

```text
npm run test:ci:frontend

Node：672 passed / 5 skipped
Playwright Chromium：374 passed / 4 skipped
typecheck、lint、Prettier、build、design-system drift、bundle structure、git diff：全部通過
```

production JavaScript 最新報告：

- main：649121 raw／191416 gzip／159980 Brotli bytes。
- total：853560 raw／262432 gzip／221739 Brotli bytes。
- total 的 raw／gzip 仍只是開發期報告，分別高於目前參考值 3599／3370 bytes；release enforce 政策沒有在本批改動。

### 視覺確認

- 390px Buttons、Chips 與編輯表單截圖已逐張檢查。
- FilterSheet 程度選項為 production 相同的兩欄 grid。
- Chromium／WebKit 截圖檢查未見文字裁切、控制項重疊或水平溢出。

## 沒有做的事

- 沒有 migration、Hosted、secret、deploy、request、DB write 或 production runtime control 變更。
- 沒有改 Push 狀態、dispatcher 或 B13.3 UI。
- 沒有把 fake Google marker 納入通過結論；真實 marker 仍缺正式 Google runtime 證據。

## 後續入口

`ds-bundle` 的 deterministic sync、卡片內容與 mobile computed-size gate 已完成。下一步先做一輪只讀 completion audit，確認本機還有沒有不受產品／Hosted 邊界限制的架構工作；不會自行啟用 Push、呼叫 Hosted `dispatch` 或填入 production 值。
