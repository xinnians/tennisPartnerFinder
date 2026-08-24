# 前端架構現況分析（React + TypeScript 遷移後）

日期：2026-08-20

## 一句話結論

這次遷移是成功的：畫面已大致改成 React + TypeScript，測試、外觀、無障礙與原本功能都有守住。

但目前比較像「React 畫面裝進舊 JavaScript 系統」，還不是完整的 React 架構。下一階段不該再繼續搬畫面，而是要處理相依循環、型別缺口、超大 Controller，以及一次載入全部 React 程式造成的 bundle 膨脹。

## 本次檢查範圍

- 入口、頁面、元件、Sheet、狀態、資料層與 CSS。
- React／TypeScript 相依方式與型別覆蓋範圍。
- `typecheck`、ESLint、Prettier、單元測試、Playwright 與正式 build。
- 1280 × 800 桌面版與 390 × 844 手機版實際操作。
- 本次沒有執行需要本機 Supabase 的 `test:db`、`test:local`，也沒有測試真正的 OAuth、推播與 Google Maps 金鑰流程。

## 現況評估

| 面向 | 現況 | 判斷 |
| --- | --- | --- |
| React 遷移 | 4 個主頁、14 個 Sheet／Dialog、2 個共用元件已使用 TSX | 畫面遷移完成度高 |
| TypeScript | TSX 為 strict，但核心 JS 不檢查型別 | 只完成一半 |
| 狀態管理 | 已加入小型 Store，但主要流程仍由大型 Controller 控制 | 過渡期架構 |
| CSS | 原本 1,429 行大檔已拆成 13 個語意檔 | 明顯改善 |
| 測試 | 單元、桌面與手機 Playwright 覆蓋很完整 | 專案強項 |
| 效能 | 主 bundle 約 714 KB，gzip 約 201 KB | 目前最大技術問題 |
| UI | 桌面與手機主要流程正常，主控台沒有錯誤 | 遷移沒有明顯退化 |

## 現在真正的架構

```text
index.html
   ↓
main.js
全站接線、導覽、登入、地圖與部分 DOM 操作
   ↓
sessionController.js
球局流程、請求競速控制、畫面狀態
   ↓
sessionStore.ts
集中保存部分執行中狀態
   ↓
sessionViews.js
舊介面相容層 + 顯示文字／資料轉換工具
   ↓
React TSX 頁面與 Sheet
   ↓
dataApi.js → Supabase／Mock
```

白話來說：React 現在主要負責「把畫面畫出來」，但何時更新、資料從哪裡來、開哪個 Sheet，仍多半由舊 JS 控制。

## 已經做得好的地方

### 1. 遷移方式很穩

每一批都有 DOM、`data-testid`、尺寸、焦點與流程回歸測試。這讓專案能逐頁換成 React，又不需要一次重寫全部功能。

### 2. React 程式本身乾淨

- 沒有看到 `any`、`@ts-ignore` 或 `dangerouslySetInnerHTML`。
- Props 與主要 UI 資料都有明確型別。
- 沒有濫用 `useEffect`。
- 列表 key、焦點與無障礙語意都有被保留。

### 3. 測試與資料隱私邊界很強

- 248 項 Node 單元測試通過。
- 完整桌面／手機 Playwright 測試通過。
- `typecheck`、Lint、Prettier 與 build 全部通過。
- Supabase 查詢仍有欄位白名單與資料邊界測試，沒有因 React 遷移被破壞。

### 4. CSS 拆分有效

樣式已依地圖、導覽、頁面、Sheet、響應式、動畫等拆成 13 個檔案。比舊版單一大檔容易找很多。

### 5. 實際畫面沒有明顯回歸

- 桌面與手機主要頁面能正常切換。
- 手機 390px 寬沒有水平溢位。
- 篩選 Sheet 可正常開啟、選擇與關閉。
- 選「今天」後，結果會由 104 場更新為 79 場，附近可加入數由 72 更新為 47。
- Google Maps 不可用時會顯示既有降級畫面，球局列表仍能用。
- 實測主控台沒有 error 或 warning。

## 主要問題

### P0：先確認測試資料是否進入正式環境

> **批 16–17 後註（2026-08-20）**：本節把本機 Supabase 的 `host-<時間戳>` fixture
> 誤當成可能的正式環境污染，該判讀已失效。批 16 保留並納入 CI 的 loopback-only
> 設定防護，批 17 另把 `mockData.js` 排除出 production bundle；見
> [批 16](migration-reports/batch-16.md) 與 [批 17](migration-reports/batch-17.md)。

實測目前連線資料時，畫面出現大量名稱像 `host-20260819T...` 的帳號與重複球局。這很像自動測試留下的資料。

如果這是本機專用 Supabase，影響不大；如果它連到正式環境，就要優先處理：

- 清除正式環境的測試資料。
- 讓自動測試只能使用獨立 Supabase project 或 schema。
- CI 啟動時檢查 project URL，禁止測試指向 production。
- 測試資料加固定前綴與自動到期時間，方便安全清理。

### P1：主 bundle 變大，而且沒有真正分包

目前 build：

- JavaScript：約 713.77 KB，gzip 約 201.04 KB。
- CSS：約 64.61 KB，gzip 約 10.65 KB。
- Vite 已提示單一 chunk 超過 500 KB。

React 遷移前的主 JavaScript gzip 約 130 KB；現在約增加 54%。主要原因是 `sessionViews.js` 使用 18 個 `import.meta.glob(..., { eager: true })`，所有頁面與 Sheet 一開始就被載入。

建議先把非首頁功能改成使用時才載入：

1. 「我」、「訊息」、「我的球局」。
2. 建立／編輯球局 Sheet。
3. 球友名單、聊天、回報等次要 Sheet。
4. 首頁地圖與附近球局保留在初始 bundle。

### P1：`sessionViews.js` 與 React 元件互相匯入

> **批 12 後註（2026-08-20）**：本節記載的 `as unknown as` 雙重斷言已由批 12
> 全數移除，相關型別漂移重新交由 TypeScript 檢查；見
> [批 12 完成紀錄](migration-reports/batch-12.md)。以下保留原始分析供追溯。

目前是：

```text
sessionViews.js → 匯入 React 頁面
React 頁面 → 又匯入 sessionViews.js 的 runtime helper
```

共有 14 個 TSX 檔反向依賴 `sessionViews.js`。這是相依循環，會造成：

- 模組載入順序難理解。
- 很難做 lazy loading。
- 測試與重構容易牽一髮動全身。
- TSX 必須用 `as unknown as ...` 自己保證 JS 型別正確。

建議把 `sessionViews.js` 裡的純函式拆出去：

```text
features/sessions/presentation/
features/profile/presentation/
features/chat/presentation/
shared/presentation/
```

React 元件只依賴這些純函式；相容層也依賴它們，兩邊不再互相匯入。

### P1：strict TypeScript 目前只保護畫面層

專案約有：

- JavaScript：10,017 行。
- TypeScript：237 行。
- TSX：5,656 行。

`tsconfig` 雖然是 `strict: true`，但同時使用 `allowJs: true`、`checkJs: false`。所以 `main.js`、`sessionController.js`、`sessionViews.js`、`dataApi.js` 這些最重要的核心檔，其實沒有型別檢查。

建議轉換順序：

1. 先把 `dataApi` 的 mapper 與回傳 DTO 改成 TS。
2. 再定義 `SessionControllerState`、事件與 Store channel 型別。
3. 拆分 Controller 後逐個改成 TS。
4. `main.js` 最後才改，避免一次影響全站。

不建議立刻對全部舊 JS 開 `checkJs: true`，錯誤量會太大。可以逐檔加 `// @ts-check`，或另外建立 legacy typecheck 工作。

### P1：React 仍被當成可替換的 HTML 模板

為了保持舊版行為，現在很多頁面會：

- 自己建立 `createRoot`。
- 每次更新包 `flushSync`。
- 用遞增的 `key` 強迫整個 React 子樹重新掛載。
- 用 `ref` 暴露 `setContent()`、`setFilters()` 等命令給舊 JS。

這在遷移期很合理，但長期會失去 React 的優點：

- 元件內部狀態可能被重設。
- React batching 與並行更新難以發揮。
- root 與生命週期分散，很難追蹤。
- 每次資料改變可能做過多重畫。

下一步應建立單一 `<App />` root，並由 React 管理頁面、Sheet 與 Dialog；Google Maps 仍可保留 imperative adapter。

### P1：Controller 與相容層仍然太大

- `sessionController.js`：2,480 行。
- `sessionViews.js`：3,034 行。
- `main.js`：1,575 行。
- `dataApi.js`：1,178 行。

Store 的加入讓狀態比較集中，但沒有真正降低 Controller 的責任。建議依功能拆成：

```text
features/discovery/     地圖探索、附近球局、篩選
features/sessions/      建立、編輯、加入、退出、審核
features/my-sessions/   我的球局與待辦
features/chat/          群組、訊息、未讀
features/profile/       登入、個人資料、球友名單
```

共用的 request gate、surface registry 與錯誤轉換再放到 `shared`。

### P2：CSS 雖已拆檔，仍依賴 import 順序

目前 13 個 CSS 檔的勝負仍靠 `main.js` 的匯入順序。同一個 selector 權重時，只要有人換了 import 順序，畫面就可能悄悄改變。

短期先不要全面改 CSS Modules，因為現有 DOM 回歸測試很多。可以先：

- 加入 `@layer reset, base, components, utilities, overrides`。
- 新功能使用 feature 專屬 class 或 CSS Module。
- 保留 token 在單一來源。

### P2：文件已落後程式

`CLAUDE.md` 仍寫著「既有頁面維持原生 DOM，後續才逐頁遷移」，但實際上頁面與 Sheet 已完成 React 遷移。這會誤導下一位開發者。

建議把文件改成：

> React 畫面遷移已完成；目前進入相依解耦、核心 TypeScript 化與單一 App root 階段。

## UI／產品層面的觀察

### 1. 手機頂部篩選列仍不夠直覺

390px 寬時，「篩選」按鈕在第一眼畫面外，要水平移動才看得到。功能可用，但使用者不一定知道這排可以捲。

建議把「篩選」固定在右側，或將較少用的條件收進同一個 Sheet。

### 2. 場次數字的意思不清楚

畫面同時出現「72 場可加入」、「今天 79 場」或 Sheet 的「看 104 場球局」。數字可能都正確，但使用者容易以為資料不一致。

建議改成完整文案，例如：

> 今天共 79 場，其中 47 場目前可加入。

### 3. 桌面版仍偏向放大的手機版

1280px 畫面中，主要抽屜與底部導覽仍集中在約 520px 寬。若桌面版是重要使用情境，可改成左側球局列表、右側地圖；若產品明確以手機為主，現在的設計可以先保留。

### 4. 大量球局需要考慮分批顯示

實測一次可出現數十筆球局。未來資料更多時，可採分頁、分批載入或虛擬列表，避免一次建立全部卡片。

## 建議的目標架構

```text
src/
  app/
    App.tsx
    AppRouter.tsx
    SurfaceHost.tsx
    providers.tsx

  features/
    discovery/
    sessions/
    my-sessions/
    chat/
    profile/

  domain/
    session.ts
    profile.ts
    chat.ts

  shared/
    api/
      supabase.ts
      mappers/
    ui/
    map/
    state/
    styles/

  legacy/
    sessionViewsAdapter.js
```

理想資料流：

```text
畫面事件
  ↓
feature action／use case
  ↓
typed repository
  ↓
Supabase
  ↓
mapper 驗證與轉換
  ↓
React state／server cache
  ↓
畫面更新
```

`legacy/` 只暫時存在。每完成一個 feature，就刪掉一段 adapter，而不是再往 `sessionViews.js` 加新功能。

## 是否需要換框架

目前繼續使用 **React + TypeScript + Vite** 是正確選擇，不建議現在改 Next.js。

原因很簡單：這是以地圖、登入後互動與即時資料為主的 SPA。現在的問題是模組邊界與狀態管理，不是 SEO 或伺服器渲染。換 Next.js 只會增加一次新的大遷移。

可考慮的輔助工具：

- Server state 變複雜時，再加入 TanStack Query，取代部分手寫快取與請求競速處理。
- 建立／編輯表單繼續變大時，再加入 Zod；React Hook Form 則視表單痛點決定。
- 需要網址分享、返回鍵與深連結時，再加入 React Router 或 TanStack Router。
- 不建議現在加入 Redux；現有小型 Store 足以支撐過渡期。

## 建議執行順序

### 第 1 階段：1～2 週，先降風險

1. 確認測試資料是否污染正式 Supabase。
2. 把 runtime helper 從 `sessionViews.js` 拆出，消除 TSX 循環依賴。
3. 先替非首頁頁面與 Sheet 做 lazy loading。
4. 更新 `CLAUDE.md` 與架構文件。

### 第 2 階段：2～4 週，讓型別真的保護核心

1. 將資料 mapper 與 DTO 改成 TypeScript。
2. 產生 Supabase Database type，但繼續保留查詢欄位白名單。
3. 替 Store 與 Controller state 建立明確型別。
4. 把 ESLint／typecheck 逐步延伸到舊 JS。

### 第 3 階段：4～8 週，建立真正的 React App

1. 建立單一 `App.tsx` root。
2. 用 React 管理主分頁與 SurfaceHost。
3. 逐步移除 `flushSync`、generation key 與命令式 ref API。
4. 依 feature 拆開 Controller 與 data API。
5. 地圖繼續透過 adapter 接 React，不必重寫 Google Maps 細節。

### 第 4 階段：持續改善

1. 對慢速手機量測首屏載入與互動時間。
2. 改善篩選列、數量文案與桌面版面。
3. 球局量變大後再導入虛擬列表或分頁。

## 最後判斷

專案不是「遷移失敗」，而是已完成第一階段：**畫面遷移成功，架構遷移尚未完成**。

現在最值得做的三件事是：

1. 消除 `sessionViews.js` 與 TSX 的循環相依。
2. 把主 bundle 拆小，非首頁功能改為使用時載入。
3. 讓資料層與 Controller 進入真正的 TypeScript 保護範圍。

完成這三項後，React + TypeScript 才會開始真正降低維護成本，而不只是換掉產生 HTML 的方式。
