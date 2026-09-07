# 球咖設計同步資料

這個目錄保留給 UI/UX 設計與外部設計工具使用。它是 production UI 的可攜式 HTML/CSS 參考，不是另一套前端，
也不是元件的真正 owner。

## 現行架構

- production app 使用 React pages／sheets，加上少量明確登記的 imperative adapters。
- production CSS 由 `src/main.js` 依固定順序載入 13 份檔案；層疊順序不能任意調換。
- 這裡的卡片仍使用純 HTML，目的是讓設計工具可以單獨開啟，不代表 production 沒有 React。
- production component／view source 決定 DOM、狀態與互動；本目錄只提供同步用示範。

## CSS 怎麼同步

每張卡片只要引入 `styles.css`。它會載入 Google Fonts、token 參考表與完整 production CSS mirror：

```text
styles.css
├── tokens/tokens.css
└── _ds_bundle.css
```

`_ds_bundle.css` 與 `tokens/tokens.css` 都是產生檔，不可手改：

```bash
npm run sync:design-system
npm run check:design-system
```

同步指令會從 `src/main.js` 讀出 production CSS 的真實順序，再逐檔產生 standalone bundle。檢查指令會在任何
production CSS、順序或 token 已變、但產生檔未更新時失敗。它也會驗證 9 張卡片的固定清單、viewport、stylesheet、
唯一 ID、現存 source 引用，並禁止容易漂移的固定行號與已退役 screen 引用。行動版實際尺寸另由
`tests/design-system-cards-smoke.spec.js` 在瀏覽器中計算；它與 production 觸控測試共用同一個 scanner。

## 視覺原則

- 手機優先，主要 QA viewport 為 390×844。
- 視覺語言是計分板：墨綠 ink、球場綠 court、optic 黃 signal、紙白底、清楚實線框與等寬數字。
- 顏色、字級、間距、圓角、陰影與 z-index 使用 `tokens/tokens.css` 的 custom properties，不新增近似色值。
- 對比維持 WCAG AA；`--color-text-secondary` 不任意調淡。
- 互動目標至少 44×44px；focus 使用全域 3px court 綠外框，不移除鍵盤焦點。
- 動效使用既有 easing／keyframes，並保留 `prefers-reduced-motion` 降級。
- 時間與數字使用 `--font-mono` 與 tabular numbers。

## 真相來源

| 內容                | 真正來源                                          |
| ------------------- | ------------------------------------------------- |
| CSS 載入順序        | `src/main.js`                                     |
| CSS 宣告            | `src/*.css`                                       |
| token               | production CSS 中含 `--color-ink` 的唯一 `:root`  |
| React DOM／狀態     | `src/components/`、`src/pages/`、`src/sheets/`    |
| imperative adapters | `src/views/` 與正式 architecture manifest／ledger |
| 同步設定與歷史      | `.design-sync/`                                   |

卡片裡若要說明來源，使用「檔案＋component／export 名稱」；不要寫容易因編輯而失效的固定行號。

## 目前 repo 可交付卡片

### 動作 Actions

- [Buttons](components/actions/Buttons/Buttons.html)
- [Chips](components/actions/Chips/Chips.html)

### 卡片 Cards

- [Session Card](components/cards/SessionCard/SessionCard.html)

### 聊天 Chat

- [Chat](components/chat/Chat/Chat.html)

### 回饋 Feedback

- [Error States](components/feedback/ErrorStates/ErrorStates.html)
- [Toast 與狀態](components/feedback/Toast/Toast.html)

### 基礎 Foundations

- [Design Tokens](components/foundations/Tokens/Tokens.html)

### 導覽 Navigation

- [Bottom Navigation](components/navigation/BottomNav/BottomNav.html)

### 面板 Surfaces

- [Sheet 與表單](components/surfaces/Sheet/Sheet.html)

本索引只列 repo 內實際存在的檔案。歷史筆記記載遠端設計專案曾有 Bricks 與 9 張 Screens，但本次沒有遠端
read-back 證據，所以不把它們列為目前可交付內容，也不拿舊檔冒充現況。

## 更新流程

1. 先修改並驗證 production UI/CSS。
2. 執行 `npm run sync:design-system`。
3. 依 production component／view 更新受影響的 HTML 卡片。
4. 執行 `npm run check:design-system` 與相關 Node tests。
5. 執行 `npm run test:mock`；它會在 Chromium 以 390×844 檢查 9 張卡片的可操作項目是否至少 44×44px。
6. 另外用 mobile WebKit 跑 `tests/design-system-cards-smoke.spec.js`，並以 desktop 1280×900、mobile 390×844
   複核受影響卡片的 render、console、focus、overflow 與互動。

不要從卡片反向猜 production 行為；缺少的狀態必須回到現行 source 確認。
