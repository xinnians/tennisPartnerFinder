# 球咖設計同步慣例

## 定位

- production 是 React app；`ds-bundle/` 的純 HTML 卡片只負責設計同步與獨立預覽。
- production source 是唯一正典。卡片不能覆蓋、推測或另創 runtime 狀態。
- UI 文案使用品牌「球咖」；舊名稱只可留在有日期的歷史紀錄。

## 樣式

- 手機優先，主要 QA viewport 為 390×844。
- 視覺語言：墨綠 ink、球場綠 court、optic 黃 signal、紙白底、清楚實線框、等寬時間與數字。
- 顏色、字級、間距、圓角、陰影與 z-index 使用既有 token，不新增近似色值。
- 對比維持 WCAG AA；互動目標至少 44×44px。
- 不移除 `:focus-visible`；動效必須保留 `prefers-reduced-motion` 降級。
- 時間與數字使用 `--font-mono` 及 `font-variant-numeric: tabular-nums`。

## CSS 邊界

- production CSS 的檔案與層疊順序由 `src/main.js` 決定。
- `ds-bundle/_ds_bundle.css` 與 `ds-bundle/tokens/tokens.css` 是產生檔，不可直接修改。
- 更新 production CSS 後執行 `npm run sync:design-system`；提交前執行 `npm run check:design-system`。
- 卡片只引入 `ds-bundle/styles.css`，不各自複製 production declarations。

## 結構與說明

- DOM、狀態與互動要逐項對照現行 `src/components/`、`src/pages/`、`src/sheets/` 與 `src/views/`。
- source citation 使用檔案與 component／export 名稱，不使用固定行號。
- 動態 class 要先查 template expression；不能因 repo 沒有完整字面就判成廢棄。
- README 索引只列 repo 內實際存在的卡片。遠端是否仍有歷史 Screens，必須 read-back 後才能描述。

## 驗證

- 每次同步至少驗 desktop 1280×900 與 mobile 390×844。
- 確認內容非空、無錯誤遮罩、console/page/request error、橫向 overflow、重複 ID 或缺少 accessible name。
- 至少操作一條受影響的互動流程；只有看 screenshot 不算完整互動驗證。
- 測試截圖放在 repo 外的暫存目錄，除非另有明確交付需求。
