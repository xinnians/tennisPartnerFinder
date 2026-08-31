# 前端設計架構分析與優化建議

日期：2026-08-29<br>
用途：提供專案維護者與 Claude 進行二次架構確認<br>
範圍：前端架構、狀態管理、路由、UI ownership、CSS 與 bundle；不包含資料庫 schema 與產品功能重設

## 1. 結論摘要

本專案的資料安全、型別、測試與功能分層已有良好基礎。目前最主要的維護成本，不是缺少分層，而是 React 遷移後仍保留較厚的 legacy bridge，造成同一個畫面可能同時由 React、`main.js`、controller、DOM event listener 與 surface adapter 共同管理。

建議保留 Vite + React，不要只為了整理前端而改成 Next.js。下一階段應優先完成以下工作：

1. 讓 React 成為唯一的 UI owner。
2. 把伺服器資料與純 UI 狀態分開。
3. 用正式路由取代手動 hash、`hidden` 與 DOM 查詢。
4. 依產品功能重新整理目錄，而不是只依技術種類分目錄。
5. 漸進移除 `sessionViews`、surface mount bridge、module-level snapshot 與不再需要的同步 commit。
6. 在保留現有測試與隱私邊界的前提下，縮小初始 bundle 與 CSS 層疊風險。

這不是一次性重寫建議。較安全的做法是一次遷移一個完整功能切片，每完成一片就刪除對應 bridge，避免再建立第二套永久共存的架構。

## 2. 本次檢查方式

本次分析閱讀了以下主要範圍：

- `index.html`、`src/main.js` 與 `src/app/`
- `src/pages/`、`src/sheets/`、`src/components/`
- `src/sessionController.ts`、`src/controller/`、`src/features/`
- `src/sessionStore.ts`、`src/sessionSelectors.ts` 與 controller contracts
- `src/dataApi.ts`、`src/data/repositories/` 與 mapper
- 全部 `src/*.css`
- 既有 React ownership roadmap 與專案說明

執行的非破壞性檢查：

```text
npm run typecheck  通過
npm run lint       通過
npm run build      通過（輸出到 /tmp 暫存目錄）
```

production build 觀察值：

```text
主 JavaScript：638.94 KB，gzip 187.47 KB
CSS：65.87 KB，gzip 10.86 KB
最大一般 lazy chunk：約 16.48 KB
Sentry lazy chunk：87.98 KB，gzip 29.72 KB
```

Vite 對主 JavaScript 顯示超過 500 KB 的警告。這不代表產品目前不可用，但表示後續新增功能前應重新確認初始下載、parse 與執行成本。

## 3. 現有架構理解

```text
index.html 靜態容器
        │
        ▼
main.js：browser composition root
  ├─ Auth、Google Maps、通知與 browser event 接線
  ├─ 手動頁面切換與 hash route
  ├─ 建立 sessionController
  └─ 把 services 注入 React App
        │
        ├──────────────► Google Maps / 部分 DOM 直接操作
        │
        ▼
sessionController
  ├─ controller 子模組
  ├─ feature 純邏輯
  ├─ 自製 external store
  └─ dataApi → repository → Supabase
        │
        ▼
React App
  ├─ Portal 到 index.html 既有容器
  ├─ Pages
  ├─ Sheets / Dialogs
  └─ SurfaceHost ↔ sessionViews / sheets bridge
```

關鍵判斷：專案已做到「單一 React root」，但還沒做到「單一 UI owner」。

## 4. 現有優點

### 4.1 資料與隱私邊界清楚

- UI 不直接存取 raw Supabase tables。
- browser data API 統一經過 `src/dataApi.ts`。
- repository、mapper 與 generated database types 已分開。
- authenticated/private repository 已採動態載入。
- 現有 RLS、RPC、公開欄位與 LINE 資料紅線必須繼續保留。

這一層不建議因前端重構而改回元件直接查詢 Supabase。

### 4.2 React 遷移已經有成果

- 已建立單一 React root。
- 主要頁面與 Sheet 已是 React 元件。
- 頁面與 Sheet 已有動態載入。
- Sentry 與 private repository 已獨立 chunk。
- `useSyncExternalStore` 已把舊 store 接到 React，而不是讓元件自行輪詢。

### 4.3 測試與可存取性成熟

- 有 TypeScript、ESLint、單元測試、Playwright、效能與資料庫契約測試。
- 已處理 focus restore、focus trap、Escape、ARIA live region 與 reduced motion。
- 長列表使用 `content-visibility`。

架構重構應保留這些既有行為，不應把它們當成可隨 bridge 一起刪除的舊實作。

## 5. 主要問題與原因

### 5.1 UI ownership 分散

目前畫面責任分布在：

- `index.html`：靜態頁面與 Portal 容器
- `src/main.js`：頁面顯示、browser event、初始化與大量接線
- `src/app/App.tsx`：module-level snapshot、lazy page registry、Portal 與手動 `renderApp()`
- `src/sessionViews.js`、`src/views/`：lazy surface adapter 與 legacy facade
- `src/app/SurfaceHost.tsx`、`src/sheets.ts`：surface shell、內容 mount 與焦點橋接
- controller：接收 `openSession`、`openChat`、`render` 等 view callback

直接影響：

- 修改一個流程前，需要理解多個模組的呼叫順序。
- UI 行為難以從單一 React component tree 追蹤。
- concurrency、focus 與非同步載入必須依靠額外同步邊界維持。
- 測試容易綁定舊 DOM 時序，讓 bridge 更難退役。

### 5.2 核心檔案責任過多

目前較大的核心檔案：

```text
src/sessionController.ts              841 行
src/sheets/SessionDetailSheet.tsx     835 行
src/sheets/CreateSessionSheet.tsx     823 行
src/app/App.tsx                       809 行
src/sessionPresentation.ts            772 行
src/pages/MySessionsPage.tsx          755 行
src/main.js                           722 行
src/pages/MePage.tsx                  729 行
src/sessionViews.js                   668 行
```

行數本身不是唯一問題。真正的問題是部分檔案同時負責：

- dependency wiring
- browser lifecycle
- server request orchestration
- UI state
- presentation mapping
- DOM 或 surface 開關

因此不建議單純為了降低行數切檔，而應依 ownership 與功能邊界拆分。

### 5.3 伺服器資料與 UI 狀態混在同一個 Store

`SessionControllerState` 約有 27 個欄位，包含：

- sessions、my sessions、rosters、players、profile 等遠端資料
- auth 與 request status
- filters、drawer state、map bounds、user location
- loading、error 與 player layer 狀態

目前 store 採 `setState()` 與 `emit(channel)` 分離，並以 `syncCommit()` 維持舊 caller 的同步觀察契約。這套設計在遷移期合理，但長期有以下成本：

- 每次 mutation 後必須人工判斷要 emit 哪個 channel。
- 容易出現資料已更新但某個畫面未收到通知。
- server cache、UI state 與 browser integration 無法各自使用最合適的更新模型。
- external store 的同步更新會限制 React transition 的發揮空間。

React 官方把 `useSyncExternalStore` 定位為整合 React 外部 store 的工具，並建議能使用 React 內建 state 時優先使用內建 state：

- https://react.dev/reference/react/useSyncExternalStore

因此這裡應把 external store 視為 migration bridge，而不是最終目標。

### 5.4 路由是手動實作

目前由 `main.js`：

- 解析 hash
- 更新 History API
- 設定各 section 的 `hidden`
- 手動處理返回後焦點
- 處理 `#/session/:id` 深連結

這在四個頁面時仍可控制，但增加頁面、登入保護、overlay route 或分享頁後，複雜度會快速上升。

### 5.5 CSS 仍依賴檔案順序

目前 13 個 CSS import 的順序就是層疊順序，專案註解也明確警告調換順序會改變畫面。

優點是歷史視覺已被凍結；缺點是：

- 新增樣式需要先理解全域順序。
- ID selector、feature selector 與 responsive override 容易互相影響。
- tokens 分布在不只一個 `:root`。
- 未來設計系統與 feature CSS 可能出現兩個來源。

### 5.6 Lazy loading 的效益可能在登入後被提早消耗

目前頁面與 Sheet 已使用 dynamic import，方向正確。Vite 也會把 dynamic import 切成獨立 chunk：

- https://vite.dev/guide/features.html#dynamic-import

但 `authenticatedViewPreloads` 會在登入後預載大量頁面和 Sheet。這可改善後續操作速度，卻也可能在使用者根本沒進入這些功能時就下載多數 chunk。

是否保留應依真實使用數據決定，而不是假設「登入後全部都會用到」。

## 6. 建議的目標架構

```text
src/
  app/
    App.tsx
    AppShell.tsx
    router.tsx
    providers.tsx

  features/
    discovery/
      api/
      model/
      ui/
    sessions/
      api/
      model/
      ui/
    chat/
    profile/
    players/
    notifications/

  integrations/
    supabase/
    google-maps/
    sentry/
    web-push/

  shared/
    ui/
    hooks/
    lib/
    styles/
    types/
```

這是 feature-first 結構：完成一個球局功能時，相關 query、command、state、元件與測試集中在同一個功能範圍，不需要橫跨 `pages → controller → features → presentation → views` 才能理解。

不需要立即搬動所有檔案。只有當某個功能開始移除 bridge 時，再把它搬進目標位置。

## 7. 建議的狀態分工

### 7.1 遠端資料

適合放入 server-state cache 的內容：

- public discovery
- session summary
- my sessions
- roster 與 join preview
- profile 與 notification preferences
- player directory 與 presence
- chat messages

可評估 TanStack Query。它專門處理遠端資料的 fetching、cache、同步、背景更新與 invalidation：

- https://tanstack.com/query/latest/docs/framework/react/overview

導入時應注意：

- 不要讓元件直接知道 raw Supabase schema。
- query function 仍然呼叫既有 repository/data API。
- mutation 完成後依 feature query key 做精準 invalidation。
- auth identity 必須放進私人 query 的 scope，切換帳號時要清除私人 cache。
- 現有 request gate 與 authoritative reload 語意不能直接整批刪除，要逐流程驗證是否已由 query cancellation/invalidation 取代。

### 7.2 純 UI 狀態

以下內容優先使用 React state、`useReducer` 或小型 Context：

- drawer 展開狀態
- active route / active overlay
- filter form 草稿
- create、join、edit 的 stage
- toast
- sheet 內 pending/error

不要為了統一工具，把所有 UI state 再塞進另一個大型 global store。

### 7.3 Browser integration

以下可保留獨立 adapter：

- Google Maps instance
- Geolocation watcher
- Web Push
- Sentry
- OAuth callback

但 adapter 應回傳資料或 domain event，不應直接決定開哪一張 Sheet 或修改頁面 DOM。

## 8. 路由建議

可評估 React Router，目標路由例如：

```text
/
/sessions/:sessionId
/my-sessions
/messages
/me
```

React Router 支援 layout、巢狀 route 與動態參數：

- https://reactrouter.com/start/declarative/routing

建議做法：

- App Shell 擁有 bottom navigation。
- route 決定主要頁面。
- `/sessions/:sessionId` 可在地圖 layout 上開啟 detail overlay。
- 權限檢查放在 route/feature boundary，不在 `main.js` 手動跳頁。
- 如果暫時不想修改 Vercel rewrite，可先使用 hash router，再決定是否改為乾淨 URL。

## 9. Surface 與 Sheet 建議

最終應由 React 擁有：

- surface stack
- backdrop
- Escape
- focus trap
- focus restore
- enter/exit lifecycle
- lazy fallback

可建立單一 React `SurfaceProvider`：

```text
openSurface({ type, props, restoreTarget })
closeSurface(id)
replaceSurface(id, nextSurface)
```

但它只應服務少數需要由 domain command 開啟的全域 surface。一般元件優先使用 route state 或本地 component state，不要把所有 dialog 都變成 service locator。

遷移時必須保留目前已驗證的 focus、Escape、巢狀 surface 與 stale-authority 行為。

## 10. CSS 建議

### 10.1 建立正式層級

逐步導入：

```css
@layer reset, tokens, base, components, features, utilities, overrides;
```

第一階段只包住新 CSS，不要立即重排全部舊規則。確認視覺與測試穩定後，再把舊檔逐片移入 layer。

### 10.2 建立唯一 token 來源

建議建立：

```text
shared/styles/tokens.css
```

顏色、字體、間距、radius、elevation、z-index 與 safe-area offset 統一放在這裡。

如果 `ds-bundle` 是正式維護的 design-system source，應由它產生 app tokens；如果它只是交付快照，就應明確標示唯讀，避免兩套 token 同時被修改。

### 10.3 新功能採局部樣式

可使用 CSS Modules 或 feature-scoped class。目標是逐步減少：

- ID selector
- 依 import 順序覆寫
- `!important`
- 一個 feature 修改另一個 feature 的 selector

## 11. Bundle 建議

優先順序：

1. 把 authenticated preload 改為 route、hover、focus 或使用者意圖導向。
2. 保留現有 pages、sheets、Sentry 與 private repository 的 dynamic import。
3. 量測 Supabase client 在主 bundle 中的實際成本。
4. 驗證是否能把只在登入後需要的 auth/private client 路徑延遲載入。
5. 若公開 discovery 改走更小的 REST client，必須保留既有 allowlist、mapper、error 與 RLS 契約；不能讓 UI 直接組 Supabase query。
6. 用真實瀏覽器量測 LCP、INP、JS parse/execute 與慢網路地圖可用時間。

不建議只用 `manualChunks` 把警告拆成多個檔案。它有助於快取，但不一定降低實際下載與執行量。

## 12. 是否改成 Next.js

目前結論：不建議因本次架構問題改成 Next.js。

原因：

- 主要體驗是地圖與登入後互動，天然偏 client-heavy。
- 資料與 Auth 已由 Supabase 提供。
- 現有問題是 UI ownership、bridge 與狀態邊界；換 framework 不會自動解決。
- 大規模 framework migration 會同時碰路由、Auth、部署、測試與 Google Maps，風險大於目前收益。

可重新評估 Next.js 的條件：

- 公開球局需要被搜尋引擎索引。
- 每場球局需要動態 Open Graph metadata 或分享圖片。
- 有明確的 server-side aggregation、BFF 或 SSR 首屏需求。
- 行銷內容與公開內容已成為產品核心，而不是單一 SPA 外殼。

在這些需求出現前，較合理的組合是：

```text
Vite + React + Router + server-state cache + 現有 Supabase data boundary
```

## 13. 漸進遷移順序

### 階段 A：建立新邊界，不改 UX

1. 建立 Router 與 App Shell。
2. 建立 feature 目錄規則。
3. 建立新的 SurfaceProvider，但先只接一個低風險 surface。
4. 凍結：新功能不得再新增 legacy renderer 或 `innerHTML` 路徑。

### 階段 B：從小功能開始搬

建議順序：

1. Messages
2. Me
3. My Sessions
4. Player Directory / Presence
5. Create / Edit / Join flows
6. Discovery drawer
7. Google Maps shell 與首頁

選 Messages 起手的理由是元件較小、路由單純，又能驗證私人 query、lazy route 與 chat surface 的新邊界。

### 階段 C：逐片刪除 bridge

每完成一個 feature，應同步刪除它不再需要的：

- `sessionViews` export
- `src/views/` adapter
- `mount*Content()` facade
- `main.js` event delegation
- controller view callback
- legacy DOM contract test；或改寫成使用者行為測試

若只新增新架構卻不刪除舊路徑，總複雜度會比現在更高。

### 階段 D：收尾

目標結果：

- `main` 只負責建立 root 與 providers。
- `App` 是正常 component tree，不使用 module-level snapshot 手動 render。
- controller 不直接控制 DOM 或 surface。
- server data 有明確 query ownership。
- `sessionViews.js`、`src/views/` 與多數 mount bridge 可以刪除。
- `syncCommit` 只保留有實證必要的 browser integration，最好最終歸零。
- CSS 不再依靠 13 個 import 的精確順序。

## 14. 不建議做的事

- 不要一次重寫整個專案。
- 不要先搬資料夾再處理 ownership；只搬路徑不會改善架構。
- 不要讓 React 元件直接呼叫 raw Supabase table。
- 不要為了減少行數把大型檔案切成沒有 ownership 的 helper 集合。
- 不要同時導入 Router、Query、Zustand、XState 與新 UI framework；先以最少工具驗證邊界。
- 不要刪除 focus、Escape、stale request 與 auth epoch 防護，除非已有等價測試證明新架構涵蓋。
- 不要只為消除 Vite 警告改 chunk 名稱或提高 warning limit。
- 不要在沒有 SEO/SSR 產品需求時進行 Next.js 全案遷移。

## 15. 建議 Claude 二次確認的問題

請 Claude 以程式碼為準，特別確認以下判斷：

1. 「單一 React root，但多個 UI owner」是否準確？是否有被忽略的 ownership 邊界？
2. `sessionViews.js`、`src/views/`、`SurfaceHost.tsx` 與 `sheets.ts` 中，哪些 bridge 已可安全刪除，哪些仍有真實 caller？
3. Messages 是否真的是最低風險的第一個 vertical slice？若不是，請提出更好的起手功能與理由。
4. 哪些 controller state 是 server state，哪些必須保留為 orchestration/client state？
5. TanStack Query 是否會和現有 authoritative reload、auth epoch、request gate 或 polling 語意衝突？
6. 現有 `syncCommit` caller 是否仍有原始 race/focus 測試證明不能移除？
7. React Router 導入後，`#/session/:id`、OAuth callback、Web Push deep link 與 Vercel rewrite 需要哪些相容處理？
8. `authenticatedViewPreloads` 在真實登入流程中會下載哪些 chunks，是否值得改為 intent-based preload？
9. production 主 bundle 中，Supabase、React、app code 各自實際佔多少 minified/gzip bytes？最值得處理的是哪一部分？
10. CSS `@layer` 能否漸進導入而不改變目前凍結的 specificity 與 source-order 契約？
11. `ds-bundle` 是正式 source、生成物還是一次性交付？應如何避免雙重 token ownership？
12. 本文件是否低估了既有 `docs/arch-roadmap-2026-08-26-react-ownership.md` 已完成的工作？有哪些建議其實已落地？
13. 是否存在安全、隱私、效能或可存取性因素，使本文建議的遷移順序不適合？

## 16. 建議的驗收條件

每個 vertical slice 完成時至少應符合：

- 原有使用者流程與 UI 文案沒有未核可變更。
- TypeScript、ESLint 與相關單元測試通過。
- desktop/mobile Playwright 相關 journey 通過。
- focus、Escape、返回鍵與 deep link 行為通過。
- auth account switch 不會留下上一個帳號的私人 DOM 或 cache。
- 不增加公開資料欄位，也不繞過既有 data API/RLS/RPC。
- bundle 沒有無理由成長。
- 新架構的加入伴隨對應 legacy bridge 的刪除。
- 文件更新實際 ownership，不只紀錄檔案搬移。

## 17. 最終建議

此專案不需要推倒重來。現有測試、資料邊界、React 元件與 controller 拆分可以保留；需要改變的是它們之間的 ownership。

最值得投入的方向不是「換一個更大的框架」，而是：

> 讓一個功能只有一條可追蹤的資料流、一個 UI owner，以及一個清楚的刪除舊 bridge 路徑。
