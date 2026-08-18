# 前端設計架構分析與優化建議

日期：2026-08-18

## 結論

這個專案的視覺與產品流程已經相當成熟，但程式架構仍停留在「原生 JavaScript MVP」。功能繼續增加後，維護成本會快速上升。

建議保留 Supabase 資料邊界、地圖模組與現有測試，逐頁遷移成 React + TypeScript，不要整包重寫。

## 現在的前端架構

大致流程如下：

```text
index.html 靜態外殼
    ↓
main.js 全站接線、登入、分頁、地圖
    ↓
sessionController.js 球局狀態與操作流程
    ↓
sessionViews.js 產生 HTML、綁定事件
    ↓
dataApi.js 串接 Supabase／Mock
```

主要檔案：

- `src/main.js`：全站狀態與模組接線。
- `src/sessionController.js`：球局、登入、聊天、定位等流程。
- `src/sessionViews.js`：所有頁面、表單、Sheet 與 HTML。
- `src/dataApi.js`：Supabase 與 Mock 資料入口。
- `src/session.css`：設計 Token 與大部分元件樣式。

## 做得好的地方

- 品牌色、字體、按鈕、卡片與底部導覽很一致。
- 手機優先設計清楚，觸控尺寸與鍵盤焦點都有考慮。
- 地圖失效時仍能使用球局列表，降級策略很好。
- `dataApi` 有明確欄位白名單，隱私與 Supabase 權限邊界做得扎實。
- 測試非常完整；本次執行的 246 項單元測試全部通過。
- CSS 已有 Design Token、對比度測試與 reduced-motion 支援。

## 主要架構問題

### 1. 檔案過大

`main.js`、`sessionController.js`、`sessionViews.js` 合計約 8,772 行。

尤其 `sessionViews.js` 同時負責畫面、表單驗證、日期轉換、互動狀態與事件綁定，已經超出單一模組合理範圍。

### 2. 存在兩套狀態中心

`main.js` 有登入、Profile、頁面、通知等全域狀態；Controller 又有另一套登入、Profile、球局與畫面狀態。

兩邊靠 callback、epoch、generation counter 同步，容易發生競速問題，也讓開發者很難快速判斷哪一份才是最新狀態。

### 3. 每次更新都重建 HTML

例如球局抽屜會整段使用 `innerHTML` 重畫，再重新綁定事件。目前甚至需要額外保存焦點、恢復焦點與中止舊監聽器。

資料量小時可以正常運作，但球局數量增加後，效能與維護成本都會變差。

### 4. CSS 開始依賴層疊順序

CSS 註解中已多次解釋「這條一定要放在後面才不會被覆蓋」。這代表單一大型樣式檔已開始變得脆弱。

### 5. 缺少 TypeScript、Lint 與 Formatter

現在主要依靠測試防錯，但很多資料欄位、回呼參數與狀態組合，更適合在開發及編譯階段就檢查。

### 6. 桌面版仍像放大的手機版

實測 1280px 時，球局抽屜與導覽仍固定在中央約 520px。如果桌面版也是正式使用情境，建議改成左側球局列表、右側地圖的雙欄結構。

## 建議的目標架構

```text
src/
  app/                 # App、路由、全域 Provider
  features/
    discovery/         # 地圖探索、篩選、附近球局
    sessions/          # 詳情、建立、編輯、加入
    my-sessions/       # 我的球局
    chat/              # 訊息與聊天室
    profile/           # 我、登入、個人設定
  shared/
    api/               # Supabase client、資料 mapper
    ui/                # Button、Sheet、Card、Toast
    map/               # Google Maps adapter
    styles/            # Token、全域樣式
  domain/              # Session、Profile 型別與純規則
```

## 框架建議

推薦採用 **React + TypeScript + 現有 Vite**。

選擇理由：

- 可以逐區域導入，不需要一次重寫。
- 適合目前大量 Sheet、表單、狀態切換與列表畫面。
- 可以讓畫面依照狀態更新，不必自己整段重建 DOM 與重新綁定事件。
- TypeScript 能提早發現 API 欄位、狀態與 callback 參數錯誤。
- 現有 Vite、Supabase、Google Maps 與 Playwright 都能繼續使用。

現階段不必急著改成 Next.js。這是一個以地圖與登入後互動為主的 SPA，目前的主要問題是狀態管理與元件維護，不是伺服器渲染。

## 建議遷移順序

### 第一階段：先降低風險

1. 加入 TypeScript。
2. 加入 ESLint 與 Formatter。
3. 在 CI／build gate 加入 `tsc --noEmit`。
4. 建立共用的 Session、Profile、API Response 型別。
5. 保留所有現有測試。

### 第二階段：拆資料與功能邊界

將 `dataApi.js` 拆成：

```text
api/
  discoveryApi.ts
  sessionApi.ts
  chatApi.ts
  profileApi.ts
  notificationApi.ts
  authApi.ts
```

同時把 mapper 與 Supabase query 分開，讓資料轉換規則能獨立測試。

### 第三階段：漸進導入 React

建議依照耦合程度遷移：

1. 「訊息」頁。
2. 「我」頁。
3. 「我的球局」頁。
4. 球局詳情 Sheet。
5. 建立／編輯球局表單。
6. 地圖探索與附近球局抽屜。

地圖本身最後處理，並保留現在的 Map adapter，避免 React 元件直接操作 Google Maps 細節。

### 第四階段：統一狀態來源

- 登入者與 Profile 狀態只保留一份。
- 頁面、抽屜、Sheet 等純 UI 狀態放在 App／Feature 層。
- Supabase 回傳的資料視為 Server State，不和 UI 暫存狀態混在一起。
- 加入、退出、審核、聊天等流程各自建立明確狀態，而不是依靠多個布林值與 generation counter 組合。

### 第五階段：整理 CSS

- `tokens.css`：顏色、字體、間距、圓角與 z-index。
- `global.css`：reset、body、focus、無障礙共用規則。
- 各 Feature 使用自己的 CSS Module。
- 使用 `@layer` 控制樣式優先順序，減少依賴檔案位置。
- 補上真正的桌面版 breakpoint。

## 畫面上的優化建議

### 高優先

- 手機版頂部篩選列會把「篩選」按鈕推到畫面外，建議將它固定在最右側。
- 未登入的「我的球局」仍顯示三組 0 筆清單，建議只留登入說明，登入後再顯示分類。
- 「訊息」空狀態也應提供登入或找球局入口，和其他分頁保持一致。
- `86 場可加入` 與日期群組的 `94 場` 容易讓人以為數字錯誤，可改為「94 場，其中 86 場可加入」。

### 中優先

- 桌面版改為左側固定球局列表、右側地圖。
- 球局很多時採用分批渲染或虛擬化，不要一次建立全部卡片 DOM。
- 卡片第一層只強調時間、球場、程度與缺額；主揪等資料放到第二層，降低閱讀負擔。
- 分頁狀態可以放進 URL，讓重新整理、返回鍵與分享網址更自然。

### 效能

本次 build 結果：

- 主要 JavaScript bundle：約 485 KB，gzip 後約 130 KB。
- CSS：約 67 KB，gzip 後約 11 KB。

目前不算嚴重，但所有頁面與表單都集中在主要 bundle。未來可將 Profile、聊天、建立表單等功能改成使用時才載入。

## 最後判斷

這不是設計失敗，而是產品已經長大，原本的 MVP 架構開始撐不住。

最值得保留的是：

- Supabase 資料與隱私權限邊界。
- 現有單元測試與 Playwright 測試。
- 地圖 adapter。
- 設計 Token 與品牌視覺。
- 已完成的無障礙處理。

最需要逐步替換的是：

- 手動 `innerHTML` 重繪。
- 分散在 `main.js` 與 Controller 的兩套狀態。
- 過大的 `sessionViews.js` 與 `sessionController.js`。
- 單一大型 CSS 檔案。

建議採取「先拆分、再漸進遷移」的方式，而不是停止功能開發後整包重寫。
