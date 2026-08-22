# 前端設計架構分析與優化建議

日期：2026-08-22

分析者：Codex

分析基準：分支 `claude/tennis-partner-finder-proto-xfrr6g`，HEAD `76779be`

## 一句話結論

這個專案目前功能穩定、測試完整、資料安全邊界也做得很好；主要問題不是 React 寫得差，而是
React 遷移還差最後一段：畫面多數已由 React 負責，但 App 殼、導航、狀態協調與 Sheet 生命週期
仍由舊式 JavaScript 控制。

下一階段建議保留 Vite、React 與 Supabase，不做全面重寫；優先讓 React 接管 App shell，並把
`main.js`、`sessionController.js`、`sessionViews.js` 依功能拆分及 TypeScript 化。

## 本次檢查範圍

- 應用程式入口、頁面切換、React root 與 Portal。
- Controller、Store、資料流與非同步請求處理。
- React 頁面、Sheet、Props 與命令式 adapter。
- Supabase repository、mapper 與 domain type 邊界。
- CSS、設計 token、響應式架構與 `ds-bundle`。
- 正式 bundle、型別檢查、Lint 與單元測試。

本次沒有重跑 Playwright、Supabase pgTAP、真實 Google Maps、OAuth、Web Push 或 hosted preview
人工測試，因此本文不對這些環境的現況做新的通過宣告。

## 驗證結果

本次實際執行：

```text
npm run typecheck                 通過
npm run lint                      通過
npm run test:session-unit         281 / 281 通過
npm run build                     通過
npm run check:production-bundle   通過
```

正式 build 的主要數字：

| 項目 | 結果 |
| --- | ---: |
| 主 JS chunk | 639.90 kB |
| 主 JS chunk（gzip） | 184.71 kB |
| CSS | 65.39 kB |
| CSS（gzip） | 10.76 kB |
| Vite 500 kB 警告 | 仍存在 |
| Production bundle gate | 通過 |

## 現況量化

| 類型 | 檔案數 | 行數 |
| --- | ---: | ---: |
| JavaScript | 23 | 7,867 |
| TypeScript | 22 | 6,082 |
| TSX | 23 | 6,045 |
| CSS | 13 | 1,626 |

以 JS／TS／TSX 行數粗算，TS + TSX 約占 60.7%。但其中
`src/data/databaseTypes.ts` 是約 1,970 行的生成檔，所以這個百分比不能直接代表核心流程已經受到
完整型別保護。

三個最大舊式核心檔：

| 檔案 | 行數 | 主要責任 |
| --- | ---: | --- |
| `src/sessionViews.js` | 2,382 | React 相容層、原生事件、Sheet 開關與部分表單流程 |
| `src/sessionController.js` | 2,149 | 探索、登入門檻、球局生命週期、聊天、球友與非同步競速 |
| `src/main.js` | 1,483 | App 啟動、導航、地圖、登入、通知與全站接線 |

三個檔案共 6,014 行，占全部 JavaScript 約 76.4%，是目前最明顯的維護集中點。

## 現在真正的前端架構

```text
index.html
  原生 App shell、地圖容器、底部導航與頁面容器
       ↓
main.js
  啟動、全站狀態、導航、Auth、Maps、通知與 dependency wiring
       ↓
sessionController.js + sessionStore.ts
  球局流程、遠端資料狀態、輪詢、request gate、surface registry
       ↓
sessionViews.js
  舊 API 相容層、原生事件綁定、lazy module 載入
       ↓
單一 React root + Portals
  React 頁面、Sheet、Dialog
       ↓
dataApi.js → data/repositories + mappers → Supabase View／RPC
```

白話來說，React 已經是主要的畫面引擎，但還不是整個應用程式的唯一管理者。

## 已經做得好的地方

### 1. React 遷移已經有明顯成果

- 全站已收斂成一個 `createRoot()`。
- TSX 不再反向 import `sessionViews.js`，循環依賴已解除。
- 非首頁頁面與大部分 Sheet 已有動態載入邊界。
- `flushSync()` 只剩兩個過渡用途，而不是散落在每個畫面。
- 各 React surface 仍保有獨立 Error Boundary。

### 2. React 元件本身品質良好

- strict TypeScript。
- 沒有發現 `dangerouslySetInnerHTML`、`@ts-ignore` 或大量濫用 `any`。
- 互動大多放在事件處理器，沒有用大量 Effect 模擬事件。
- 表單、Sheet 與非同步 surface 有 stale commit 和正式 unmount 防護。

### 3. 資料與隱私邊界很強

- Supabase 資料存取已集中在 facade 與 `src/data/**`。
- repository 使用生成的資料庫型別、明確 select allowlist 與 mapper。
- 公開 discovery、私人 profile、roster、chat 和 block 資料有清楚分界。
- Production build 會移除 mock data，另有掃描 gate 防止 demo 身分進正式 bundle。

這一層不建議因前端重構而改弱。未來即使採用 TanStack Query，也應繼續呼叫現有 repository，
不要讓 React 元件直接對 Supabase `.from()` 或 `.rpc()`。

### 4. 測試是專案的重要資產

現有測試不只驗畫面結果，也涵蓋：

- 非同步競速與舊請求不得覆蓋新狀態。
- React surface unmount、Error Boundary 與焦點回復。
- Supabase 欄位 allowlist、隱私欄位與 LINE 退役界線。
- CSS token、對比、舊品牌樣式回流與 production mock 洩漏。

因此適合漸進式重構，不需要高風險的一次性重寫。

### 5. 視覺語言已有一致基礎

- 墨綠、球場綠、螢光黃與紙白的「計分板」識別明確。
- 色彩、字級、間距、圓角、陰影、z-index 與 safe-area 已有 token。
- 有 44px 觸控目標、全域 focus-visible、AA 對比與 reduced-motion 規範。
- 球局卡、時間磚、NTRP 磚、狀態 badge、Sheet 與底部導航已有共用語彙。

## 主要問題與優化建議

### P1：React 與舊 DOM 仍共同擁有畫面

目前雖然只有一個 React root，但它是建立在 `body` 後，再用 Portal 掛進 `index.html` 已存在的
頁面容器。`sessionViews.js` 會在 React commit 後重新查 DOM、綁原生事件；更新頁面時又利用
generation key 重建子樹。

這套方式在遷移期合理，但長期問題是：

- React、`main.js` 與 `sessionViews.js` 可能同時認為自己擁有相同 DOM。
- 焦點、捲動、事件解除與非同步生命週期需要大量人工協調。
- React batching、正常 reconciliation、transition 與 declarative event handler 難以發揮。
- 新增一個互動常常要同時修改 TSX、adapter 與 controller。

建議：

1. 將 `index.html` 內的 topbar、頁面容器、底部導航、toast root 搬進 `<AppShell />`。
2. 讓 React 直接以 JSX 管理頁面顯示，不再使用 `hidden` 加手動 DOM 切頁。
3. Sheet 外殼可先保留現有 `sheets.js`，但建立 React `SurfaceProvider` 作為唯一 stack owner。
4. 一個 surface 完全 React 化後，再移除對應的命令式 adapter，不要一次全部拔掉。
5. Google Maps 保留命令式 adapter；只要求 React 擁有 `<MapCanvas />` 容器與生命週期。

### P1：核心流程仍集中在三個未檢查的 JavaScript 大檔

`tsconfig.json` 使用 `allowJs: true` 與 `checkJs: false`。因此即使 TSX 和 repository 是 strict，
最複雜的 `main.js`、`sessionController.js`、`sessionViews.js` 實作仍沒有被 TypeScript 驗證。

目前的 `controllerContracts.ts` 能描述狀態與部分 surface 契約，但無法確認 JavaScript 實作真的遵守
這些介面。

建議轉換順序：

1. `sessionController.js` 先依功能拆檔，不要直接把 2,149 行原封不動改副檔名。
2. 優先抽出 `discovery`、`session-lifecycle`、`chat`、`profile-auth`、`player-directory` use case。
3. 每個新模組直接使用 `.ts`，在輸入／輸出邊界套上現有 domain type。
4. `sessionViews.js` 只保留尚未遷移的 surface adapter，隨 React 接管逐段縮小。
5. `main.js` 最後改為小型 `main.tsx`，理想上只負責建立 root、安裝 provider 與啟動 App。

不建議現在直接對全部舊 JS 開啟 `checkJs: true`，這會一次產生大量雜訊，且不會改善模組責任。

### P1：狀態管理方式是為舊 renderer 設計，不是為 React 設計

`sessionStore.ts` 的 `setState()` 不會自動通知，呼叫端必須另外 `emit("map")`、
`emit("mySessions")`。這是為了保留舊 renderer 的呼叫順序；對舊系統很安全，但 React 很難直接使用。

另外，Controller 內同時保存遠端資料、畫面狀態、輪詢器、request gate、surface handle 和 auth epoch。
遠端資料與純 UI 狀態混在一起，使登出、切帳號與較慢請求需要很多版本守衛。

建議分成三類：

| 狀態類型 | 建議 owner |
| --- | --- |
| Supabase 遠端資料、loading、error、polling | TanStack Query |
| 當前頁面、開啟的 Sheet、表單暫存 | React local state／Context |
| Google Maps instance、marker、watchPosition | imperative adapter／ref |

過渡期間可以先用 `useSyncExternalStore()` 將現有 Store 接進 React，等各 feature 改用 query hook 後再
逐步淘汰舊通道。現階段不需要額外加入 Redux 或 Zustand。

### P1：頁面 Props 過大，是責任外置的訊號

`MySessionsPageOptions` 有二十多個 callback；`MePage` 也同時接收登入、通知、球場訂閱、presence、
visibility、block 與 identity linking 等操作。

這會造成：

- 上層 wiring 很長。
- callback 簽名容易退化成 `unknown`。
- 一個功能改動會牽動多個 adapter。
- 頁面很難單獨測試 feature 行為。

建議：

- 讓頁面呼叫 `useMySessions()`、`useProfile()`、`useNotificationSettings()` 等 feature hooks。
- 共用操作收斂成小型 action object，例如 `sessionActions.accept()`，不要平鋪二十個 props。
- 純展示元件仍使用 props，資料取得和 mutation 只放在 page/container 層。

### P1：主 bundle 仍偏大

目前非首頁頁面和多數 Sheet 已分包，代表「加上 dynamic import」這一階段已經做過。主 chunk 仍有
639.90 kB，下一步應處理主 chunk 裡的集中式模組，而不是只設定 `manualChunks` 美化輸出。

優先建議：

1. 將 `dataRepository.ts` 依 discovery、profile、session、chat、notification 拆分。
2. 未登入時不要載入 chat、notification settings、player directory mutation 等私人功能。
3. 將 App shell 改為 React 後，依 route／surface 使用正常 `lazy()` 或 dynamic import。
4. 在 hover、focus、登入成功及即將開啟功能時 preload，避免首次點擊明顯等待。
5. 保留現有 bundle gate；每完成一批，重新量測主 chunk，而不是先預設一定會變小。

`manualChunks` 可以改善長期快取，但不會減少使用者首次需要下載的總量，不能當成主要修法。

### P2：長列表尚未做渲染節流

附近球局、我的球局、訊息與球友目錄目前會直接 render 全部項目。資料量不大時完全合理，但若地圖
範圍或使用量增加，會讓 React 同時建立大量卡片。

建議順序：

1. 先為長列表容器加入 `content-visibility: auto` 與合理的 intrinsic size。
2. 確認資料量與裝置效能真的成為問題後，再加入虛擬列表。
3. 不要為只有數十筆的清單過早引入複雜 virtualization。

### P2：CSS 拆檔後仍依賴 import 順序

目前 13 個 CSS 檔案的順序就是層疊契約。只要調動 import，同權重規則就可能靜默改變結果。

建議：

1. 將 token 移到 `src/styles/tokens.css`，並保證最先載入。
2. 新樣式先使用 `@layer reset, base, components, features, utilities, overrides`。
3. 舊 CSS 分批移入 layer，每批都跑 Playwright 視覺與互動回歸，不要一次全面重排。
4. 新 feature 使用清楚的 feature scope 或 CSS Module，避免繼續增加全域 selector 競爭。
5. 現有 BEM class 不必為了追求 CSS Module 而全面改名。

### P2：`ds-bundle` 不是正式元件庫

目前 `ds-bundle` 是 HTML 與 CSS 展示包，樣式是產品 CSS 的複製品。這對設計交接有幫助，但存在
雙份真相與 drift 風險。

建議：

- token 與正式 CSS 只保留一份來源。
- `ds-bundle` 改為從 `src/styles` 產生或直接引用正式 CSS。
- 重複出現的 SessionCard、Avatar、Button、SheetHeader、EmptyState 才整理成正式 React 共用元件。
- Storybook 或其他展示工具是可選項，不是目前必要的框架更換。

### P2：桌面版仍偏向單欄手機介面

目前底部導航最大寬度 520px，主要內容頁約 680px。若產品主要使用情境是手機，這是可以接受的；
若桌面瀏覽是重要場景，建議在較大斷點改成：

```text
左側：篩選與球局列表
右側：固定地圖
底部導航：改成左側導覽或頂部功能列
```

這是產品選擇，不應只因螢幕變寬就自動做。建議先查看 analytics 的裝置比例再決定。

### P2：正式錯誤監控仍待接線

前端已經有 Error Boundary、全域錯誤提示與固定隱私 allowlist，但 production transport 仍是 NOOP。
正式上線後若沒有監控，使用者會看到錯誤，團隊卻不一定知道。

可以接 Sentry 或其他服務，但必須沿用既有固定欄位，不可傳 raw message、聊天、暱稱、座標、
access token 或完整 Supabase payload。

## 建議的目標目錄

```text
src/
  app/
    App.tsx
    AppShell.tsx
    router.tsx
    providers/

  features/
    discovery/
      api.ts
      hooks.ts
      model.ts
      ui/
    sessions/
      api.ts
      hooks.ts
      model.ts
      ui/
    my-sessions/
    chat/
    profile/
    player-directory/
    notifications/

  shared/
    ui/
    styles/
    types/
    lib/

  infrastructure/
    supabase/
    maps/
    push/
```

原則：

- `app` 只負責組裝，不放球局商業規則。
- `features` 各自擁有資料、狀態、操作與 UI。
- `shared` 不得反向 import 任一 feature。
- `infrastructure` 包裝第三方服務，不決定產品畫面。
- 資料庫 allowlist 與 mapper 邊界保留，不能因導入 query library 被繞過。

## 框架與套件建議

### 建議保留

- Vite
- React 19
- TypeScript
- Supabase
- Google Maps 命令式 adapter

### 建議考慮加入

- React Router：管理頁面、deep link、返回行為與 route-level lazy loading。
- TanStack Query：管理 Supabase 遠端資料、快取、輪詢、mutation 與失效重讀。

### 目前不建議

- Next.js：這是地圖與登入後互動為主的 SPA，SSR／RSC 的額外複雜度目前沒有明顯回報。
- Redux／Zustand：先分清遠端狀態與 UI 狀態，現階段不需要再加一個全域 store。
- 全面更換 UI library：現有視覺語言、焦點與 Sheet 契約已成熟，全面替換的回歸風險高。
- 一次重寫：現有測試與功能值得保留，應按 feature 漸進替換。

## 建議執行順序

### 第一階段：建立 React App shell

- 新增 `main.tsx`、`AppShell.tsx` 與 router。
- 將導航、頁面顯示、toast host 搬進 React。
- 保留現有 Controller、repository、Maps 與 Sheet 外殼。
- 用現有 Playwright 契約確保 DOM、焦點與操作不變。

完成條件：`activePage` 與主要 `document.getElementById(...).addEventListener(...)` 導航接線消失。

### 第二階段：建立 React 可訂閱狀態邊界

- 先以 `useSyncExternalStore()` 包裝現有 Store。
- 頁面從 store selector 取得狀態，不再由 `main.js` 手動重傳完整 props。
- 統一 auth identity change 時的 private state 清理。

完成條件：主要頁面更新不再經過 `renderMePage()`、`renderMySessionsPage()` 等命令式 adapter。

### 第三階段：Controller 依功能拆分並 TypeScript 化

- 先拆 discovery 與 session lifecycle。
- 再拆 chat、profile/auth、player directory 與 notification。
- 每拆一個 feature，就移除 Controller 中對應的 request gate、surface metadata 與 wiring。

完成條件：`sessionController.js` 不再是跨功能大總管，或已完全退役。

### 第四階段：導入遠端資料管理

- 從 discovery query 開始導入 TanStack Query。
- 接著處理 My Sessions、profile、chat polling 與 notification settings。
- mutation 成功後使用明確 query invalidation／authoritative reload。
- 所有 query function 仍只呼叫 repository。

完成條件：大部分 loading、error、polling、stale request 處理不再由手寫 gate 重複實作。

### 第五階段：效能與設計系統收尾

- 依 feature 拆 repository 與 lazy chunk。
- 壓低主 bundle 並收緊 bundle gate。
- 建立 CSS layer、單一 token 來源與正式共用元件。
- 若桌面使用比例足夠，再做雙欄地圖版面。

## Claude 複查建議清單

請複查者不要只閱讀本文，應直接以目前 HEAD 驗證下列項目：

### 架構事實

- [ ] 全站是否確實只有一個 `createRoot()` 呼叫點。
- [ ] `flushSync()` 是否確實只剩兩個呼叫點，且都是相容層需求。
- [ ] TSX 是否仍完全不 import `sessionViews.js`。
- [ ] 非首頁頁面與 13 個非首頁 Sheet 是否仍為 lazy module。
- [ ] `index.html` 是否仍擁有 App shell 與 navigation DOM。
- [ ] `main.js`／`sessionViews.js` 是否仍綁定大量 native listener。

### 狀態與型別

- [ ] `checkJs: false` 是否使三個核心 JS 實作未被 TypeScript 驗證。
- [ ] `controllerContracts.ts` 是否只描述契約，無法檢查 JS 實作完整性。
- [ ] Store 的 `setState()`／`emit()` 分離是否主要服務舊 renderer 呼叫順序。
- [ ] My Sessions 與 Me 頁的大量 callback props 是否仍是現況。
- [ ] 是否存在比本文建議更低風險的 feature 拆分順序。

### 資料與隱私

- [ ] 所有產品 Supabase `.from()`／`.rpc()` 是否仍只存在於核可 data boundary。
- [ ] 引入 TanStack Query 的建議是否可能繞過 mapper／allowlist；若會，請提出防護方式。
- [ ] Production mock alias 與 demo identifier gate 是否仍有效。
- [ ] Error transport 建議是否遵守固定隱私 allowlist。

### 效能與 UI

- [ ] 重跑 build，確認 639.90／184.71 kB 是否可重現。
- [ ] 找出主 chunk 最大的實際模組，驗證拆 repository／private feature 是否真的能降低初始下載。
- [ ] 驗證 `manualChunks` 只能改善快取、不能單獨降低首次總下載的判斷。
- [ ] 以 390px、700px、桌面寬度檢查現有響應式版面，再判斷桌面雙欄是否值得做。
- [ ] 評估長列表的實際資料上限，確認 `content-visibility` 或 virtualization 的優先度。

### 回歸風險

- [ ] React 接管 Sheet stack 時，Escape、backdrop、focus trap、焦點回復是否都能維持。
- [ ] React Router 是否會破壞 `#/session/:id` 推播與分享 deep link。
- [ ] Auth callback、pending intent 與冷啟動 deep link 的競速測試是否必須先補強。
- [ ] CSS `@layer` 遷移是否會改變目前依 import order 維持的 selector 勝負。

## 最終建議

目前沒有需要全面換框架或停止開發的 P0 架構問題。最值得投入的兩件事是：

1. **讓 React 真正接管 App shell、導航與頁面生命週期。**
2. **把三個大型核心 JS 依 feature 拆分，並在拆分過程中 TypeScript 化。**

TanStack Query、React Router、CSS layer 與 bundle 拆分都應服務這兩個方向，而不是單獨導入後
讓架構多出另一層。只要維持現有測試與資料 allowlist，這個專案適合逐步收斂，不需要推倒重來。
