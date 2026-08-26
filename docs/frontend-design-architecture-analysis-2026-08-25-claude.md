# 前端設計與程式架構分析（2026-08-25，Claude 獨立分析）

> 撰寫方式：本報告在**未閱讀** `docs/frontend-design-architecture-analysis-2026-08-25-codex.md`
> 的前提下獨立完成。所有判斷依據為工作樹程式碼、設定、測試、實際執行的驗證指令與
> mock 介面走查；技術陳述附 [已驗證]／[推論]／[不確定] 標記。驗證清單與未執行項見 §11。

---

## 1. 一句話結論

這是一個工程紀律罕見地高、且剛完成一整輪架構優化（F0–F4 全案）的 Vite + React 19 混合架構；
現在最大的成本不是技術選型錯誤，而是「遷移期契約」本身——adapter 間接層、模組級 snapshot、
全面 flushSync、142 個白箱測試字面呼叫點——讓每個新功能都要付「改 4–6 個檔案」的變更放大稅，
外加 README 仍在描述已退役的 LINE 聯絡流程；建議**不換框架**，把力氣花在「編排權移交 React
的最後一哩」與文件真實性上。

## 2. 現況架構圖

```text
index.html（靜態骨架：#tab-map 地圖殼、三個頁面 section+root、sheet/modal/toast root、導覽 root）
   │
   ▼
src/main.js（806 行組合根）[已驗證]
   ├── CSS ×13 檔：import 順序＝層疊順序，無 @layer（main.js:2-19 註解明文）
   ├── 手寫 hash 路由：PAGE_ROUTES 四分頁 + #/session/:id 深連結（main.js:190-246）
   ├── 頁面切換：直接 toggle section.hidden + history push/replace（main.js:542-553）
   ├── 模組級可變狀態：activePage / createdSessionFocusId / notificationSettings /
   │    presenceLocationStatus → 自製 pageViewStore（me / mySessions 兩通道）
   ├── configureX 依賴注入 ×6+（filters / presence / profile / notification / share / views）
   │
   ├─▶ sessionController.js（711 行 facade）
   │      ├── 自製 store（27 個欄位、courts/map/me/mySessions 四通道；controllerContracts.ts:62-90）
   │      ├── requestGate ×9（discovery/participation/roster/joinPreview/location/player/
   │      │    directory/blocked/playerCard；sessionController.js:107-114）
   │      ├── surfaceRegistry + 宣告式 SURFACE_TRANSITIONS 狀態表（:116-187）
   │      └── 七個子 controller（controller/*.ts：auth/chat/discoveryMap/intent/
   │           lifecycleActions/mySessions/playerDirectory，全 strict TS）
   │
   ├─▶ features/ ×10 模組（chat/discovery/filters/notifications/player-directory/
   │      presence/profile/profile-auth/session-lifecycle/share；純邏輯＋編排）
   │
   ├─▶ sessionViews.js（665 行 legacy adapter facade）
   │      ├── views/*.js ×5（1,825 行：頁面 adapter、焦點意圖還原、表單/surface 開啟器）
   │      ├── lazy sheet loader 顯式 import map + hover/focus 預載（:264-620）
   │      └── deferSurfaceOpen：載入殼→pending-call 佇列→實體 surface 置換（:479-533）
   │
   ├─▶ sheets.js（206 行 imperative 殼：backdrop、focus trap、Escape capture、
   │      surface stack、關閉焦點還原鏈）
   │
   └─▶ dataApi.js（80 行 facade，唯一資料邊界；ESLint no-restricted-imports 強制）
          └── src/data/：repositories（public eager／private lazy chunk 拆分）、
               mappers、authApi、生成 databaseTypes.ts（1,970 行）、select allowlist 常數

React 樹（單一 root #react-app-root）
   App.tsx（957 行）：模組級 snapshot ──renderApp()──▶ <App>
   ├── createPortal → 頁面 root ×4（Me/Messages/MySessions lazy import + 載入/失敗狀態）
   ├── createPortal → map topbar / 底部導覽 / toast（批 3B 遷入）
   ├── SurfaceHost → sheet 殼內的 React 內容槽（殼仍歸 sheets.js）
   ├── pages/ ×4 + sheets/ ×14 + components ×3（AppErrorBoundary/Avatar/SessionCard）
   └── useStoreSelector（useSyncExternalStore + 每次 emit 走 flushSync；sessionStore.ts:87-113）

同步 commit 邊界：syncCommit.ts 是唯一 flushSync 入口，全庫恰 3 個 caller
（sessionStore.ts:102、SurfaceHost.tsx:60、App.tsx:902）[已驗證：grep]
```

**規模數據**（皆 [已驗證]）：src 共約 24,900 行；TS/TSX 15,395 行（不含生成型別）、
legacy JS 5,567 行（不含 mockData）、CSS 1,631 行；TS 化率約 73%。React 頁面＋sheet
共 6,044 行。git 歷史 626 commits。

## 3. 做得好的地方

1. **資料與隱私邊界是工程級落實，不是文件宣示** [已驗證]：`dataApi.js` facade＋ESLint
   `no-restricted-imports` 禁止直接 import supabaseClient／mappers／repositories
   （eslint.config.js:108-152），動態 import 必須字串 literal 以便靜態驗證；select 欄位
   allowlist 是常數（data/repositories/selects.ts）且被 pgTAP 逐欄比對。
2. **Stale request 防護是體系而非個案** [已驗證]：requestGate 世代機制、authSnapshot
   epoch+identity 比對、`pageOwnerIdentity` 寫進 history state 防跨帳號還原私人分頁
   （main.js:549-551、620-629）、auth identity 變更時的 SURFACE_TRANSITIONS 批次關閉
   （sessionController.js:137-146）。
3. **Bundle 治理有棘輪**：主 chunk 654,838 B（gzip 191,332）壓在 658,867/192,420 上限內；
   頁面與 14 個 sheet 全 lazy（0.98–16.9 kB）；private 資料層獨立 chunk（匿名首屏不載）；
   Sentry 87.98 kB lazy；`check:production-bundle` 同時擋 demo 暱稱與 e2e hook 出貨
   [已驗證：本次 build 實跑]。
4. **錯誤處理分層清楚**：20 個具名 surface 的 AppErrorBoundary（appErrors.ts:1-22）、
   Sentry wire 層只送三鍵 tag、明文禁止 exception/message/stack（D-03 隱私優先決策）。
5. **測試金字塔真的存在** [已驗證：本次實跑]：29 個 Node unit 檔 3.5 秒全綠；Playwright
   mock desktop+mobile 286 passed／4 skipped（56 秒）；另有 local Supabase、pgTAP、
   非阻擋 WebKit 訊號。mock 旅程強制 zero-console-error 與焦點走查斷言。
6. **設計 token 與品牌一致性**：計分板視覺（墨綠 #12291c＋螢光 #ddf53c＋Barlow Condensed
   ＋IBM Plex Mono 時間磚）在走查的每一面（卡片、詳情、篩選、空狀態、導覽）都一致；
   token 集中單一 `:root`（session.css:23-60），對比 gate 以 WCAG 公式自動實算
   （contrast-tokens.test.js）。
7. **決策治理可追溯**：32 條 ADR 索引（architecture-decisions.md）、路線圖含拍板紀錄與
   翻案儀式（MIG-06）、每批有驗收文件——「為什麼長這樣」幾乎都查得到。
8. **無障礙用心且誠實**：sheet focus trap＋Escape capture＋關閉焦點還原（sheets.js）、
   抽屜跨 rerender 焦點意圖還原（pageViews.js:21-213）、live region 掛在持久節點
   （main.js:330-338 註解說明 AT 註冊原理）；做不到的（focus 外框對比 1.95:1）明文記錄
   為已接受例外（testing.md:77-80、D-04）而不是假裝合規。
9. **Mock/真實模式單一開關**：`isSupabaseConfigured` 決定資料源，production build 以
   Vite alias 把 mockData 換成空模組＋bundle gate 雙保險 [已驗證：vite.config.ts:28-31]。

## 4. 問題清單（P0／P1／P2）

評分依 tech-debt 框架：Priority ≈ (Impact + Risk) × (6 − Effort)。

### P0（低成本、高影響，應立即處理）

- **P0-1 README 描述已退役的 LINE 聯絡流程，與隱私紅線相反** [已驗證]。
  README.md:4「主揪接受申請後，雙方才在『我的球局』看到彼此的 LINE」、:16「接受後…
  互看對方 LINE」、:27-29 以 `session_contacts` 描述現行機制——但 CLAUDE.md 與
  supabase 規則明定 LINE 前端面已退役、`session_contacts` 前端零 consumer、群聊取代
  聯絡交換。公開 repo 的第一份文件在宣傳一個「會交換 LINE」的產品，這是對外信任問題，
  不只是文件過時。README:108-116 的專案地圖也完全沒有 React／app／pages／sheets／
  controller／data 目錄。另 README 標題「球局｜台北市網球」與 index.html:16 的品牌
  「球咖｜台北網球」不一致。
- **P0-2 CLAUDE.md 結構描述落後現況一輪** [已驗證]。「src/map.js / src/pins.js」實際已是
  `map.ts`/`pins.ts`（地圖批 TS 化）；「六個 feature 純邏輯模組」實際 `src/features/` 有
  10 個目錄；未提及 `src/controller/`（七個子 controller）、`src/pages/`、`src/sheets/`、
  `src/views/`。CLAUDE.md 是每次 AI 協作的地基，漂移會直接放大後續派工的錯誤前提。

### P1（下一輪應排入的結構性成本）

- **P1-1 變更放大係數：一個頁面級功能要改 4–6 個檔案** [已驗證：依程式結構推導]。
  以「在『我』頁加一個設定」為例：controller state＋selector（sessionController.js）→
  main.js `mountMeDestination` props 接線（main.js:492-526）→ App.tsx `MeDestination`
  顯式 destructure＋逐一傳遞（App.tsx:188-249，26 個 props 逐項列舉）→ MePage.tsx
  options 介面與元件 → 測試。callback bag 也同樣肥大：MySessionsPageOptions 有 22 個
  `on*` callback（MySessionsPage.tsx:67-91）。這是「React 只當渲染引擎、編排權留在
  legacy」的直接代價；每批功能都在付利息。
- **P1-2 全面同步 commit 犧牲 React 批次能力** [已驗證：程式碼]。`useStoreSelector`
  在每次 store emit 都 `syncCommit`（=flushSync）觸發同步 re-render
  （sessionStore.ts:99-103）；adapter 的每次 renderPage 也同步 commit（App.tsx:901-924）。
  等於在全 app 範圍停用 React 18/19 的自動批次與併發特性。這是為了「公開 adapter 呼叫
  返回前 DOM 已更新」的 e2e 同步契約（註解明文）。現階段規模（單頁、列表 ≤200）尚可
  接受，長列表批也已用 content-visibility 補償；但它是效能規模化的天花板，且把
  「測試方便」的成本轉嫁到 runtime [推論]。
- **P1-3 白箱測試封條的維護稅** [已驗證]。tests/ 有 142 個 `__importAppModule` 字面
  呼叫點（grep 實測，路線圖風險 #5 自承「長期債」）；contrast-tokens.test.js 綁定
  session.css 的**檔案字面形狀**（正則要求選擇器頂格、規則體單行、檔案 >10,000 字元；
  session.css:7-18 檔頭自述）；react-surface-lifecycle.test.js 掃 main.js import 清單與
  facade export 宣告（sessionViews.js 為此加了多處 `prettier-ignore` 凍結，:70-128）。
  這些封條在遷移期擋住了真回歸，但也讓「搬一個檔案」「改一行 CSS 排版」都要同步改測試；
  結構性重構的邊際成本被它墊高。
- **P1-4 桌面版是手機版拉寬** [已驗證：1280×800 實測]。底部導覽浮在畫面中央下方、
  附近球局抽屜是貼底窄條、sheet 貼右下、兩側大量留白、「地圖目前無法使用」訊息孤立
  漂浮在左緣。決策上這是已知項（NP-05 等 Analytics 裝置比例），但現況桌面第一印象
  明顯弱於手機版。
- **P1-5 型別安全斷層集中在最核心的編排層** [已驗證]。`@typescript-eslint/no-unsafe-*`
  等 10 條 type-aware 規則整批關閉並註明「既有型別債」（eslint.config.js:83-100）；
  main.js（806）、sessionController.js（711）、sessionViews.js（665）、views/*.js
  （1,825）合計約 4,000 行編排程式碼仍是 `allowJs` 不 `checkJs` 的 JS——恰好是接線最
  複雜、最依賴人腦記契約的地方。controllerContracts.ts 以型別「描述」了這些 JS 的行為，
  但描述與實作可以漂移而 tsc 不會抓到 [推論]。

### P2（值得記錄、暫不優先）

- **P2-1 CSS 層疊依賴 13 檔 import 順序**，無 `@layer`（NP-04 裁決不翻案）。有註解與
  測試守護，但「新增樣式檔要人工判斷插入位置」（main.js:5-6 明文要求）是持續的認知稅。
  瀏覽器 @layer 支援已成熟，翻案成本低於批 10 當時；收益有限（已有守護），維持 P2。
- **P2-2 token 外硬編碼色票殘餘** [已驗證：grep]：`#9db3a4` 出現 3 次（discovery.css:37、
  vocabulary.css:44、:84）、`#fff`（discovery.css:174）、`#f7fbf1`（pages.css:17）。
  `#9db3a4` 應收進 token。
- **P2-3 store 通道粗粒度**：四通道 emit 整份 state、「值沒變仍要重畫」靠 version
  identity（sessionStore.ts:31、86-91 註解），selector 端無 memo 化誘因。規模小尚可。
- **P2-4 sheet 生命週期三段所有權**：sheets.js 殼 → deferSurfaceOpen 載入殼＋pending-call
  佇列 → React 內容槽。批 3 解凍條款已允許殼遷入 React（react-migration.md:33-37），
  這條收斂路徑已經鋪好，只是還沒走完。
- **P2-5 未登入的「我的球局」殘留空群組殼**：登入卡下方仍列出三個 0 項空區段
  （390px 實測），對未登入者是雜訊。
- **P2-6 球局卡的 SR 名稱冗長**：卡片 accessible name 是整張卡文字串接
  「21:19 08/25 二 台北網球中心 進行中 對拉…」[已驗證：JS 實測]，可用但囉嗦。

## 5. 視覺與 UX 問題（mock 介面實測）

做得好的：品牌識別強（球咖＋TPE 計分板語彙）、狀態 badge 體系清楚（進行中／直接加入／
缺 N 位／已訂場）、詳情 sheet 的 TYPE/NTRP/缺額三格計分板一目了然、mock 模式引導 toast
與深連結 empty sheet（「找不到球局」）文案得體、Escape 關閉後焦點正確回到開啟卡片
[皆已驗證：390px 走查]。

問題：

1. **390px 首頁 chips 列右緣裁切**：「直接加入」被切一半、「篩選」完全在視口外
   [已驗證：截圖]。chips 列是 `overflow-x: auto` 且刻意隱藏 scrollbar
   （map-page.css:165-176 `.map-toolbar::-webkit-scrollbar { display: none }`），
   又沒有 fade／箭頭提示——可捲動性只能靠使用者猜。篩選入口是核心操作，
   首屏不可見有流失風險 [推論]。
2. **桌面版整體**（見 P1-4）。
3. **底部導覽 focus 對比 1.95:1**：已接受例外（D-04），僅記錄不重評。
4. **未登入頁面的空區段雜訊**（見 P2-5）。
5. 進行中球局顯示「已開打 62 分鐘」很好；但卡片上的「進行中」badge 與時間磚 21:19
   並列時，資訊層級靠讀者自行推理（時間是開始時刻不是現在），屬小改進機會 [推論]。

## 6. 建議的目標架構

原則：**保留所有已驗證的邊界（dataApi、隱私、stale 防護、sheet 契約），把「編排權」
從 legacy 移交 React，讓 adapter 層從常態變成例外。**

```text
目標狀態（與現況差異處以 ★ 標記）
index.html 骨架（不變）
main.ts ★（<300 行：boot、路由、controller 建立、React root 掛載）
   └── AppShell（React）
        ├── ControllerProvider ★（context 提供 controller API + stores，一次注入）
        ├── Route destinations ★（頁面元件自行 useStoreSelector 訂閱，
        │     callback 直接呼叫 context 的 controller 方法；淘汰 renderXInApp options bag）
        ├── SurfaceHost ★（殼＋內容都在 React：focus trap/Escape/stack 以元件實作，
        │     沿用既有 DOM/aria/testid 契約；淘汰 deferSurfaceOpen 佇列，改 lazy+Suspense 語意）
        └── 現有 pages/sheets 元件（介面瘦身後沿用）
sessionController + controller/*.ts（不變；仍是狀態與生命週期的唯一權威）
dataApi + data/（不變）
sessionStore（不變，但 flushSync 降級 ★：同步 commit 只保留給仍存在的 imperative
   相容點，最終目標 0 caller；e2e 改以事件/等待斷言）
CSS（維持 13 檔；可選配 @layer 收斂順序風險）
```

狀態權威來源在目標架構中不變：server state＝controller store（RPC 後重讀權威資料）、
UI state＝React 元件內部、跨頁 intent＝intentStore、URL＝hash 路由。這套分工現在就是
對的，問題只在「接線的路徑太長」。

## 7. 架構方案比較（2–3 案）

| 方案 | 內容 | 優點 | 代價／風險 | 判定 |
| --- | --- | --- | --- | --- |
| A. 維持現狀＋只修文件 | P0 文件批＋小 token 收斂 | 零風險、半天完成 | P1-1/2/3 的利息持續累積，之後每個功能批都付變更放大稅 | 不足 |
| B. 編排權上移（推薦） | §9 的分批計畫：容器化→殼遷移→flushSync 降級→TS 化→測試重分類 | 保留全部測試資產與邊界；每批可獨立驗收回滾；結束後新功能觸碰檔案數 ≤3 | 需要 5–7 個派工批；白箱測試要逐批跟隨改寫（本來就是既定債） | **推薦** |
| C. 換框架重構（Next.js/Remix 或 TanStack Router+Query 全家桶） | 以框架慣例取代自製路由/store/adapter | 生態慣例、招人容易、devtools | SSR 對單頁地圖 app 無收益且與 PKCE browser auth、Maps client 渲染、Web Push SW 衝突面大；4,000+ 行 e2e 與 pgTAP 邊界全要重驗；bundle 未必變小（bundle 組成報告記載主 chunk 84% attribution 為 Supabase＋React 合法 eager——docs/arch-reports/bundle-batch-acceptance 所載數字，換框架不會消失）；隱私 allowlist 要在新資料層重建 | 不建議 |

## 8. 是否建議更換框架

**不建議更換。維持 Vite 6 + React 19 + 自製 hash 路由 + 自製 store。**具體理由：

1. **React Router**：路由需求是 4 個分頁＋1 個深連結命名空間，現有實作
   `PAGE_ROUTES`＋`sessionRoute.js` 合計不到 60 行且已含跨帳號防護（pageOwnerIdentity）
   [已驗證]。React Router 帶來的 nested routes/loader 生態在此無用武之地；NP-02 裁決正確。
2. **TanStack Query**：server state 的難點（stale 防護、auth epoch、失敗後重讀權威）
   已由 requestGate＋authSnapshot 體系解決，且語意比 Query 的 cache key 失效更貼合
   「RPC 後重讀 view」的資料流；引入 Query 反而要把 queryFn 塞回 dataApi 邊界內以免
   繞過 mapper（NP-01 的顧慮成立）。**重評條件**：若未來出現樂觀更新需求擴大、或
   cache 失效類 bug 重複發生，才值得再議 [推論]。
3. **Zustand/Redux**：自製 store 113 行、具名通道語意是為「渲染呼叫序列可重放」特製的
   （sessionStore.ts:6-11 註解），換成任何通用 store 都會失去這個測試契約，收益只有
   devtools；NP-03 維持。
4. **Next.js/Remix**：無 SEO 需求（內容在登入牆與地圖後）、無 SSR 收益（首屏是
   client 渲染的 Google Maps）、Web Push SW 與 PWA 已自管、Vercel 靜態部署已穩定；
   遷移會觸動隱私邊界重驗與全部 e2e。NP-06 維持。
5. **Tailwind/CSS Modules**：1,631 行 CSS、token 已集中、對比 gate 自動化；換寫法是
   風格偏好不是問題解決。CSS Modules 曾規劃在批 10 後（react-migration.md:24），
   建議維持「不做，除非元件庫化」。
6. **維持的前提**：上述判斷成立的邊界是「單城市單運動、頁面數 ≤6、無即時協作」。
   若產品範圍突破（多城市、realtime、原生 App 殼），另開評估，不在本輪。

## 9. 分階段執行順序

每批獨立可驗收、可回滾；批 1–2 之後每批都直接減少後續批的改動面。

| 批次 | 內容 | 驗收訊號 |
| --- | --- | --- |
| 0. 文件真實批（半天） | 重寫 README（群聊流程、React 結構、品牌名）；更新 CLAUDE.md 程式結構節（map.ts/pins.ts、10 features、controller/pages/sheets/views）；`#9db3a4` 收 token | README 零 LINE 聯絡字樣；CLAUDE.md 描述與 `ls src` 一致 |
| 1. 容器化批 I | Messages＋Me 頁改為 context 注入＋自行訂閱（兩頁最簡單、Messages 已是雙源訂閱樣板）；建立 ControllerProvider 模式 | 該兩頁的 renderXInApp options bag 退役；新增一個 Me 設定只碰 ≤3 檔 |
| 2. 容器化批 II | MySessions＋NearbyDrawer 容器化；焦點意圖機制（pageViews.js）改以元件內 effect 實作 | pageViews.js 行數減半以上；既有焦點 e2e 全綠 |
| 3. 殼遷移批 | sheets.js 殼 → React SurfaceHost（focus trap/Escape/stack 元件化；DOM/aria/testid 契約凍結沿用）；deferSurfaceOpen 換 lazy+Suspense 語意 | sheets.js 退役；surface e2e（trap/Escape/restore）全綠 |
| 4. flushSync 降級批 | e2e 同步契約改事件等待；syncCommit caller 3→1→0 | 零 flushSync；286 mock 測試改寫後全綠且時間不升 |
| 5. TS 化收尾批 | main.js／sessionController.js／sessionViews.js 殘餘／views 殘餘轉 TS；解開 eslint unsafe 豁免（逐檔） | src 內 legacy JS <500 行；unsafe 豁免清單歸零 |
| 6. 白箱測試重分類（與 3–5 併行） | 保留不變量封條（品牌色、對比、隱私、a11y、bundle）；退役結構鏡像（export scan、CSS 字面形狀、檔案長度下限、import 清單掃描），以行為測試補位 | `__importAppModule` 字面點 142 → <50；重構單檔搬移不再紅測試 |
| 7. 桌面中間態批（可先於任何批） | 低成本置中容器＋max-width，不做雙欄（雙欄仍等 NP-05 的 Analytics 數據）；修 390px chips 裁切提示 | 1280px 走查無孤立漂浮元素；chips 可發現性修復 |

## 10. 可量測的完成標準

- 新增一個頁面級設定／欄位，觸碰檔案數 ≤3（現況 4–6，依 §4 P1-1 路徑）。
- `src/main.js` ≤300 行（現 806）；`sessionViews.js` 與 `views/pageViews.js` 退役或
  合計 ≤200 行（現 1,021）。
- `flushSync`（syncCommit）caller：3 → 0；`grep -rn flushSync src` 只剩 syncCommit.ts
  自身或完全移除。
- tests 中 `__importAppModule` 字面呼叫點：142 → <50。
- src legacy `.js`（不含 mockData）：5,567 行 → <500 行；ESLint unsafe 豁免 10 條 → 0。
- bundle 棘輪不升：main gzip ≤192,420、total gzip ≤259,062（沿用現有 gate 數字）。
- mock suite 全綠且 wall-clock 不高於現基準（56 秒）。
- README／CLAUDE.md 與 `ls src`、實際使用者流程逐項對齊（人工 read-back）。

## 11. 實際執行的驗證與限制

本次分析實際執行（全部通過，[已驗證]）：

| 驗證 | 結果 |
| --- | --- |
| `npm run typecheck` | 通過（tsc --noEmit，零錯誤） |
| `npm run lint` | 通過 |
| `npm run prettier:check` | 通過 |
| `npm run build` | 通過（1.08s；主 chunk 654.84 kB／gzip 191.33 kB） |
| `npm run check:production-bundle` | 通過（demo 識別字 12 項不在 dist；棘輪內） |
| `npm run test:session-unit` | 29 檔全綠（3.5s） |
| Playwright mock（desktop+mobile chromium） | **286 passed／4 skipped（56.1s）** |
| mock 介面走查（launch.json `mock-design-audit`，port 5173） | 390×844：首頁地圖 fallback＋抽屜、球局詳情 sheet、申請加入 demo toast、篩選 sheet、我的球局（未登入）、訊息（空狀態）、我（未登入）、`#/session/99999` empty sheet、Escape 焦點還原；1280×800 桌面走查。全程 console error 為零 |

限制（未執行／未覆蓋）：

- **未跑** `npm run test:db`、`npm run test:local`（需 Docker＋local Supabase 且屬資料庫
  面；本次為前端唯讀稽核，且依指示不做任何 DB 操作）。Supabase 契約正確性引用自
  pgTAP／規則文件，未重新實證。
- **未跑** WebKit project（文件記錄為非阻擋訊號）。
- mock 模式無 Google Maps key，地圖走 fallback 清單；**真實地圖圖釘、cluster、
  AdvancedMarker 行為未實測**，僅依 map.ts／fakeMaps 測試契約推論。
- 登入後流程（建立／審核／群聊／通知）未人工走查，覆蓋依賴 Playwright local specs
  的存在與 mock suite 中的相關斷言 [推論]。
- 行動裝置實機（真 Safari）未測。
- hosted／production 一律未觸碰。
- 「每功能改 4–6 檔」為依程式結構的推導值，未以歷史 commit 統計實證 [推論]。
