# 前端設計架構分析與 Codex 文件綜合驗證（Claude 版）

日期：2026-08-22　查證基準：working tree（分支 `claude/tennis-partner-finder-proto-xfrr6g`，與 origin 同步）
方法：9 個切面並行深讀（每個痛點附「檔案:行號＋逐字原文」證據），另一條線把
`docs/frontend-architecture-analysis-2026-08-22-codex.md` 拆成 22 條可查證主張逐條對 working tree 查證。
本文撰寫者在完成獨立分析前**未讀** codex 文件內文，比對段落才引入其內容，以避免錨定。
技術陳述標注 [已驗證]（有指令或逐字原文佐證）／[推論]／[不確定]。

---

## 一句話結論

架構的「骨架決策」都是對的（單一 React root、單一資料邊界、注入式 controller、測試護城河），
真正的病灶只有一個：**React 已經進場，但沒有拿到狀態與事件的主導權**——頁面每次更新都整棵
remount、事件靠 commit 後手工重綁、重繪靠人工呼叫網。其他多數痛點（數百行焦點還原機制、
雙軌事件、巨型 props bag）都是這一個病灶的併發症。不需要換框架，需要的是把 React 從
「模板引擎」升級成「狀態的訂閱者」，再沿既有縫線拆檔 TS 化。

這個結論與 codex 文件的最終建議**方向一致**；本文的增量價值在：(1) 逐條查證了 codex 的
22 條主張（19 CONFIRMED / 3 PARTIAL / 0 REFUTED，細節見 §6）；(2) 找出 codex 未覆蓋的
幾個重構前置條件與地雷，其中最關鍵的是 **e2e 白箱測試已把 `sessionViews.js` 的檔案路徑
凍結成測試 API，任何拆檔前必須先解開這個耦合**（§4-D）。

---

## 現況架構速寫（白話）

畫面由三方共管 [已驗證]：

1. **index.html** 靜態擁有 App 殼：topbar、四個頁面容器、底部導覽、toast/sheet root。
2. **main.js（1,483 行）** 是全站接線員：啟動五路並行流程、手動切頁（改 `hidden`）、
   手工渲染篩選 chips 與 popover、toast、三頁焦點還原、auth 與 Maps 接線。
3. **React（單一 root，`src/app/App.tsx:317`）** 以 portal 把頁面與 sheet「內容」投進
   legacy 容器；sheet 的殼（backdrop／focus trap／Escape）仍由 `sheets.js` 擁有。

狀態集中在 `sessionController.js`（2,149 行 closure）內的自製 store（`sessionStore.ts`，
寫入與派發刻意分離）；React 端**零訂閱、零 context** [已驗證：`src/pages`、`src/sheets`、
`src/app` 下 grep 不到 `useContext`/`useSyncExternalStore`]，資料一律由 main.js 讀快照後
整包塞 props。資料層已收斂為 `dataApi.js`（79 行 facade）→ `src/data/repositories` +
mappers + 生成型別，是全案最健康的一層。

---

## 不可破壞的資產（重構時的紅線）

這些是多輪實測與派工批次換來的，任何重構方案先保證不碰壞它們：

- **單一 React root 與單向 import 邊界** [已驗證]：全 src 僅 `App.tsx:317` 一處
  `createRoot`；TSX 零反向 import `sessionViews.js`（有守門測試）。
- **資料邊界三層防護** [已驗證]：select allowlist（`selects.ts`）→ 逐欄 mapper（沒寫的
  欄位到不了 UI，隱私紅線結構性成立）→ RPC outcome 白名單；production mock 排除有
  alias＋空模組契約＋dist 黑名單掃描三層，且被 `ci-config.test.js` 鎖成測試。
- **controller 的非同步 staleness 紀律** [已驗證]：requestGate 世代戳、authSnapshot
  （epoch＋identity）、mutation 後強制重讀權威資料再 reconcile 開著的 surface——
  `isCurrentAuthSnapshot` 出現 50 次不是壞味道，是多輪競態實測的產物，搬架構時要逐條保留語意。
- **sheets.js 的 a11y 殼單點**：focus trap、Escape stack、inert 隔離、關閉焦點回復集中一處，
  14 張 React sheet 零重造。
- **測試護城河**：DOM-free controller 單元測試（114 test）、GOLDEN 派發序列凍結、雙 harness
  e2e、隱私 taint 注入、守門測試自帶「掃描集非空」自檢。

---

## 主要問題（依嚴重度）

### A（高）：generation-remount 三件套——React 被當成模板引擎

每次 adapter render 都把 slot 的 generation +1 並當作 React key，等於**每次更新整棵
remount** [已驗證：`src/app/App.tsx:345`「`generation: (previous?.generation ?? 0) + 1,`」、
`:254` 以 `key={slot.generation}` 掛載]；再以 `flushSync` 同步 commit（`App.tsx:331`、
`SurfaceHost.tsx:57`，全庫僅此兩處 [已驗證]），commit 後 `sessionViews.js` 對新 DOM
`querySelector`＋`addEventListener` 重綁事件。範圍修正 [已驗證]：整棵 remount 只適用於
**四個頁面 slot**；14 張 sheet 的內容以穩定 slot id 掛載（`SurfaceHost.tsx:42`
`key={slot.id}`＋memo）、開啟後經 imperative handle 更新，不隨每次更新 remount——僅部分
sheet（群聊 feed、詳情動作區）內部以 generation key 重建局部節點。連鎖代價：

- React 內部狀態與焦點每次歸零，main.js 因此養出數百行手工焦點 capture/restore 機制
  （`captureMeFocus`/`restoreMeFocus`/`captureMySessionsFocus` 等，估約 300 行 [推論]），
  且此機制本身已出過實測抓到的競態 bug（`main.js:968` 註解自載）。
- 事件雙軌制：`MySessionsPage`/`NearbySessionsDrawer` 的按鈕只輸出 `data-*` 屬性不掛
  onClick [已驗證：`MySessionsPage.tsx:112`、`sessionViews.js:770`]，callback 明明在
  props 裡卻繞出 React 再從 DOM dataset 讀回——selector 與元件輸出漂移就是 silent fail。
- 單次 `reloadParticipation` 會 emit 三次以上，每次都是「整頁 remount＋重綁＋焦點還原」
  乘上最多三個頁面（含隱藏頁）[已驗證：`sessionController.js:585`、`main.js:1447-1448`]。

註：這是 react-migration 混用期的**自覺取捨**（App.tsx:343-345 有註解），當時合理；
但它是目前一切 view 層複雜度的根源，也是下一步最該退役的契約。

### B（高）：重繪靠人工呼叫網，漏接就是 silent stale

沒有訂閱機制：十餘個狀態變動點各自依 `activePage` 分支呼叫正確的 `renderXDestination`，
還必須記得連隱藏頁一起重繪以防跨帳號資料殘留 [已驗證：`main.js:1444` 註解「Keep the
hidden destinations in sync as well…」]。漏接任何一處不會 compile error，只會畫面過期。
store 明明存在，卻只有 controller 在用。

### C（高）：7,867 行核心 JS 是「三不管地帶」

`allowJs: true` + `checkJs: false` [已驗證：tsconfig.json:4-5]，且 lint 與 prettier 都只掃
`.ts/.tsx` [已驗證：package.json:26-27、eslint.config.js:9]——三大核心檔（sessionViews 2,382、
sessionController 2,149、main 1,483）**typecheck、lint、format 三者皆不覆蓋**。
連鎖效應：main.js 手工組裝注入的 `api` 物件無型別，controller 以
`typeof api?.loadX !== "function"` duck-typing、缺方法時 silent no-op
[已驗證：`sessionController.js:424`]；`controllerContracts.ts` 沒有任何 TS 檔 import
sessionController.js 來驗證，契約只是文件。ESLint 也非 type-aware，抓不到
`no-floating-promises` 這類在大量 async RPC 專案裡最值錢的錯。

### D（高）：e2e 白箱已把「拆檔」鎖死——這是 codex 文件沒看到的最大前置

`tests/smoke.spec.js` 有 **107 處** `__importAppModule("sessionViews")`（全 tests 共 138 處
`__importAppModule`）[已驗證：本文撰寫者親自 grep]，而 `appRuntime.js` 以
`baseUrl "/src/" + 模組名` 解析、只支援副檔名映射不支援路徑映射
[已驗證：`tests/fixtures/appRuntime.js:1,21`]。意思是：**拆檔計畫必須明寫 e2e 呼叫面的
承接方式**——標準解是拆分時保留同名薄 facade re-export（`dataApi.js` 79 行 facade 是同
repo 的成功前例），e2e 零改動；`appRuntime.js` 的「名稱→完整路徑」映射只是可選強化
（供未來想撤 facade 時用），且單靠映射無法把不同 export 分流到不同模組。

同類的重構摩擦還有兩個 [已驗證]：
- view/DOM 層**零單元級安全網**（無 jsdom；controller 測試把 render 換成純記錄 fake），
  焦點與 sheet 行為只由單 worker 的 Playwright 層守（`playwright.config.js:19`）——
  拆 view 時唯一保護是最慢的測試層。
- GOLDEN 序列表（約 124 筆逐字派發指紋）與「改動派發批次」的重構幾乎必然整表重錄
  （`tests/session-controller-sequence.test.js:480`），保護力與摩擦同源，重構期需要過渡解析度。

### E（中）：一個語意、兩份實作

- **auth 差分**：`main.js:1283` 與 `sessionController.js:1996` 各算一次 `identityChanged`，
  各管一半的重置清單，帳號切換語意要兩邊對齊 [已驗證]。
- **presentation helper**：`MessagesPage.tsx` 內有四個本地複本——`taipeiDayWord` 與
  `sessionVenuePresentation` 重複 `sessionPresentation.ts`（:172/:216）；`sessionScheduleLabel`
  與 `sessionHostInitial` 則重複 `sessionViews.js`（:656/:667，後者在該檔為死碼）
  [已驗證：MessagesPage.tsx:39/49/58/64；`sessionPresentation.ts` 反向 grep 無後兩者]，
  違反 react-migration「presentation helper 單一來源」規則。
- **死碼四件** [已驗證：本文撰寫者反向 grep，僅定義行命中]：`renderDiscoveryEmpty`
  （sessionViews.js:982，且其 innerHTML 插值未過 esc()，留著是陷阱）、
  `successPushPromptMarkup`（:673）、`sessionHostInitial`（:667）、`dialogFocusable`（:318）。
- **mySessions view payload**：通道訂閱者與 `getMySessionState` 各建構一份（
  sessionController.js:386 vs :2098），欄位人工同步。
- **通知偏好預設值**三層各寫一次（mapper `!== false`／presentation `!== false`／feature
  字面 `true`）[已驗證]。

### F（中）：型別鏈的其他斷點

- supabase client 未帶 `Database` 泛型，repository 以 `as unknown as` 接線、查詢結果
  `unknown` 再斷言 [已驗證：`dataRepository.ts:186,153`]——select 字串與 Row 型別無編譯關聯。
- enum 類欄位以裸 `as` 斷言窄化、無 runtime guard [已驗證：`sessionMappers.ts:43`]，
  後端新增值時前端拿到「型別上不可能」的值且無警訊。
- domain 型別的家分裂：`PlayerDirectoryEntry` 等定義在 mapper 檔深路徑，
  `domainTypes.ts` 首行註解仍宣稱 mapper 在 dataApi.js（已搬家）[已驗證]。
- `Profile.courts` 以球場「名稱」當識別、存取各反查一次（單次儲存打兩次 courts 查詢）
  [已驗證：`profileMappers.ts:135`、`dataRepository.ts:384,413,425`]。
- UI 中文文案內嵌在 data 層錯誤類（`dataErrors.ts:32,87`），未來 i18n 得動資料層。

### G（中低）：地圖、bundle、CSS

- 每次 publish 全量銷毀重建所有 marker（無 id diff）[已驗證：`map.js:117`]，且整個圖釘系統
  建立在 Google 已宣告 deprecated 的 legacy `google.maps.Marker` 上、API 鎖 `v=weekly`
  自動升版 [已驗證：`map.js:130,37`]——Google 收緊時線上先壞，而 Fake Maps 只 stub legacy
  Marker，測試感知不到。地圖狀態散在 map.js singleton 與 main.js 模組層變數兩處。
- 單一 entry chunk 混裝 react + supabase-js + 全部舊層（實測 639.65 kB / gzip 184.51 kB），
  無 manualChunks，改版即全量失效快取；bundle gate 只約束 entry，lazy chunks 與 CSS 可無感成長。
- 13 個全域 CSS 檔的層疊靠 main.js import 次序（有明文檔頭），token 是 CSS/JS 雙源
  （pins.js 硬編碼色票靠註解同步）[已驗證：`pins.js:1`]。
- 其他小項：`__tennisE2ETestHooks` 測試後門隨 production bundle 出貨（風險低）；
  Node 22.18+ 前提（node:test 直載 .ts）無 engines/.nvmrc 護欄；`ci-config.test.js`
  硬編分支名成為開新分支的必改點。

### H（中）：文件與現況脫節（維運面）

- CLAUDE.md 落後一個世代（分析期間發現，**已由 commit `7f5c1b6` 修正**，保留於此作為
  當時的查證紀錄）：原稱「進入單一 App root 階段」（已於 08-21 完成）、程式結構未列
  `src/app`/`src/features`/`src/data`、dataApi.js 已是 79 行 facade、quality-gate
  「尚未 push」與 origin 現況不符。
- 已定案／已否決／待辦散落至少三份文件的「不做」清單，無單一決策索引；
  fix-plan 與 migration-plan 檔頭進度快照停在舊批次，照讀會誤判下一步。

---

## 優化建議（分階段路線圖）

先對齊歷史已定案決策（本次盤點自五代文件鏈，出處見 §7）：**不換 Next.js**（三度審視同結論）、
**Maps 保持 imperative adapter**、**不開全域 checkJs、逐檔轉 TS**、**現階段不加狀態庫**
（C 批派工批內禁令；08-21 審查將 TanStack Query／Router 列為「之後再議」附啟用條件）。
以下建議不重提已否決事項；涉及「翻案」的會明說。

### 第 0 批：鋪安全網（低風險、高槓桿，全部可獨立落地）

1. 定案 e2e 白箱呼叫面的承接方式：拆檔時以同名薄 facade re-export 承接 107 處呼叫
   （`dataApi.js` 前例）；`appRuntime.js` 名稱→路徑映射為可選強化（見 §4-D）。
2. 引入輕量 DOM 單元層（happy-dom/jsdom + 現有 node:test），先覆蓋 sheet 與頁面的
   關鍵渲染/焦點契約，讓後續 view 重構不必全押在單 worker e2e。
3. 清死碼四件；MessagesPage 四個 presentation 複本收斂回 `sessionPresentation.ts`；
   focusable selector 三份複本收斂成 sheets.js 匯出常數。
4. lint/prettier 範圍擴到 `src/**/*.js`、tests/、scripts/；ESLint 升 type-aware
   （優先收 `no-floating-promises`/`no-misused-promises`）；以 `no-restricted-imports`
   把 dataApi 邊界從測試掃描升級為 lint 期防護。
5. `package.json` 加 engines、repo 加 .nvmrc（>=22.18）。

### 第 1 批：讓 React 訂閱狀態（治本的一刀）

6. 在 `sessionStore` 上加 `useSyncExternalStore` hook，頁面元件直接訂閱通道——
   取代 main.js 依 activePage 手動分派的重繪責任鏈（問題 B）。
7. 移除 generation-key 整棵 remount，改穩定 key＋props 更新；MySessionsPage/
   NearbyDrawer 按鈕改接 options 裡既有 callback 為 React onClick（CreateSessionSheet
   已證明此型態可行）。此後可整批刪除 main.js 的焦點 capture/restore 機制與雙軌事件。
8. GOLDEN 序列測試在此批提供過渡解析度（先降成「通道＋次數」粗指紋，完成後再升回），
   依檔頭紀律逐筆說明變因。

### 第 2 批：拆檔＋TS 化（沿既有縫線）

9. `sessionController.js` 沿已抽出的 `src/features/` 縫線拆成 discovery/lifecycle/chat/
   players 數個共用 store 與 surfaceRegistry 的 orchestrator；新模組直接 .ts、
   套現有 domain type。auth 差分單一化到 controller（main.js 退化為轉發）。
10. `sessionViews.js` 按職責拆檔（表單驗證純函式／焦點捲動機制／sheet adapters／preload
    基建）——第 0 批的路徑映射落地後，多數是搬移而非改寫。
11. main.js 拆 feature 模組（篩選工具列、分享剪貼簿、presence、profile 編排），
    比照既有 `features/notifications` 模式。

### 第 3 批：AppShell 與導覽

12. 頁面切換收斂成單一狀態機並接上 hash/history（四主分頁可深連結、返回鍵有語意；
    保留並相容 `#/session/:id`）。**自製 10 行內 hash router 即可，暫不需要 React Router**
    ——只有 4 個分頁＋1 種深連結，引大套件過重 [推論]。
13. index.html 靜態殼（topbar chips、popover、底部導覽、toast）遷入 React AppShell，
    結束三方分持；此時 flushSync 契約與 glob 橋接一併退役。啟動五路並行改為顯式編排
    （深連結「結構性等待」auth 定案，取代一次性旗標）。
    注意：此批觸及 react-migration.md 的 DOM/testid 凍結與「surface stack 不搬進 React」
    條款，**開工前先修訂規則檔**（比照 D6 翻案儀式落檔）。

### 第 4 批：效能與收尾（做之前先量測）

14. 地圖：marker 以 sessionId/courtId diff 取代全量重建；規劃 AdvancedMarkerElement 遷移
    批次（同批改 Fake Maps 替身契約）；`v=weekly` 改釘 quarterly。
15. bundle：先跑 rollup-plugin-visualizer 找主 chunk 實際大戶，再決定拆 repository／
    未登入不載私人功能／manualChunks（只當快取優化）；gate 擴充 per-chunk 與總量預算。
16. CSS：token 抽單一來源（同時餵 CSS 變數與 pins.js 常數，以測試 gate 取代註解同步）。
    @layer 化是**翻案項**（batch-10 有三個實證反例），若做必須分批＋每批 Playwright 回歸，
    且先對齊該決策。
17. 錯誤監控接線（廠商為使用者拍板項）：必須沿用 `appErrors.ts` 三欄 frozen allowlist。
18. TanStack Query 依 08-21 審查的啟用條件（dataApi/controller TS 化後）屆時再評估，
    並以 lint 邊界規則保證 queryFn 只呼叫 repository、不得繞過 mapper/allowlist。

### 明確不建議

- 換 Next.js／SSR、一次重寫、現在引入 Redux/Zustand（自製 store 已是 Zustand 形狀，
  等訂閱化完成後如需 devtools 可平移，屬可選）。
- 為現階段的清單過早上虛擬列表。但更正一項初版推論：探索、球友目錄、My Sessions 與群聊
  查詢目前都無 pagination／`.limit(`（[已驗證] `dataRepository.ts` 全檔無命中），
  「主揪至多五局」只約束單一主揪、約束不了全站總量——四個面都會隨使用者數成長，
  屆時應優先從資料層 limit／分頁下手，而非只靠前端節流。

---

## 與 Codex 文件的比對與綜合驗證

### 逐條查證結果：22 條主張，19 CONFIRMED / 3 PARTIAL / 0 REFUTED

codex 文件的事實基礎**高度可信**：行數統計、單一 root、flushSync 兩處、lazy 邊界、
checkJs、store 設計動機、controller 混存六類狀態、長列表全量 render、13 檔 CSS 層疊、
NOOP error transport、資料邊界收斂——全部經指令重現或逐字原文比對成立。

三條 PARTIAL 都是小數字級誤差，不影響論證：

| 條目 | 誤差 | 實況 [已驗證] |
| --- | --- | --- |
| C3 build 數字 | 主 chunk 639.90/184.71 kB 不可重現 | 實跑 639.65/184.51 kB（差約 0.25 kB，CSS 65.39 kB 吻合；文件自留「重跑確認」待辦） |
| C11/C19「二十多個 callback」 | 數字略高 | `MySessionsPageOptions` callback 恰 20 個（全部成員 29 個）；文件另一句「不要平鋪二十個 props」反而準確 |

### 觀點一致處（兩份獨立分析收斂的結論，可信度最高）

AppShell 接管殼與切頁、useSyncExternalStore 過渡、controller 沿 use-case 拆檔＋新模組直接
.ts、不開 checkJs、main.js 終態縮成小入口、Maps 留 imperative、保留 Vite/React 19、
不換 Next.js、不加 Redux/Zustand、bundle 靠拆功能而非 manualChunks、長列表先
content-visibility 後虛擬化、錯誤監控必須沿用隱私 allowlist——**兩邊獨立得出相同方向**。

### 對 codex 建議需補充的條件（查證中發現、文件未提）

1. **「SurfaceProvider 作為唯一 sheet stack owner」牴觸現行規則** [已驗證]：
   `.claude/rules/react-migration.md` 明文 surface stack「不搬進 React」。方向可以走，
   但這是規則翻案項，開工前需修訂規則檔並落檔（文件未提此前置）。
2. **@layer 遷移牴觸 batch-10 的既有結論** [已驗證]：batch-10 §3 以三個實證反例證明
   layer 化會翻轉勝負，是行為變更而非整理。codex 的「分批＋每批回歸」正是所需補償，
   但採納前應先對齊該決策。另 token 搬 `src/styles/tokens.css` 技術上可行
   （contrast 測試已改遞迴掃描），但 `session.css` 檔頭的凍結說明需同步更新。
3. **TanStack Query 的定位**：不是被永久否決，而是 08-21 審查的「延後、附啟用條件」項
   （等 dataApi TS 化後）[已驗證：`docs/frontend-architecture-review-2026-08-21-codex.md:403`]；
   codex 排在第四階段與該條件相容，但落地時需配 lint 邊界防護（見上方建議 18）。
4. **feature hooks 改造會動到 adapter 凍結簽名** [已驗證]：react-migration.md 凍結
   legacy adapter 的參數與 callback payload，頁面改自行取數勢必改 options 形狀，
   需先修訂凍結規則或保留相容層——codex 未提此前置。

### 本文的增量發現（codex 未覆蓋）

- **e2e 白箱 107 處耦合是拆檔計畫必須明寫的前置**（§4-D，承接方式＝同名 facade
  re-export）——codex 第三階段拆分計畫沒有處理它。
- view 層零 DOM 單元安全網、GOLDEN 序列表的重構摩擦與過渡解析度方案。
- auth identity 差分雙份實作（main.js:1283 vs sessionController.js:1996）。
- presentation helper 四複本與死碼四件（本文親自反向 grep 確認）。
- 型別鏈細節：api 注入 duck-typing silent no-op、controllerContracts 零編譯驗證、
  supabase client 未帶 Database 泛型、enum 裸 as 無 runtime guard。
- lint/prettier 也不掃舊 JS（codex 只講了 checkJs——實際是「三不管」）。
- 地圖層：legacy Marker deprecated＋`v=weekly` 風險、marker 全量重建、Fake Maps 替身同步。
- 通知偏好預設三處重複、Profile.courts 名稱識別、ACTION_MESSAGES 文案位置。
- CLAUDE.md 與歷史文件脫節（§4-H）、決策索引缺失。

### codex 未覆蓋但本文也未查證的

- 主 chunk 內「最大實際模組」的組成分析（需 visualizer，列入建議 15）。[不確定]
- 390px/700px/桌面寬度的實際響應式表現與桌面雙欄取捨（需人工或瀏覽器查核）。[不確定]

### 回覆 codex 文件的「Claude 複查建議清單」

架構事實六項：**全部成立** [已驗證]（單一 createRoot、flushSync 恰兩處且屬相容層、TSX 零
反向 import、13 個 lazy sheet、index.html 仍擁有殼與導覽 DOM、大量 native listener——
sessionViews 45 處＋main.js 20 處 addEventListener）。
狀態與型別五項：前四項成立 [已驗證]；「更低風險的拆分順序」→ 有：先做本文第 0 批
（路徑映射＋DOM 單元層＋死碼/複本清理）再進入 codex 的階段一，風險更低。
資料與隱私四項：`.from()/.rpc()` 僅存在於 `src/data/authApi.ts` 與 `dataRepository.ts`
[已驗證]；TanStack Query 繞過風險的防護＝lint `no-restricted-imports`＋queryFn 只准呼叫
repository；mock alias 與 demo gate 有效且被測試鎖住 [已驗證]；錯誤監控建議與 allowlist
相容 [已驗證]。
效能與 UI 五項：build 重跑結果 639.65 kB（微幅漂移，見 PARTIAL 表）；manualChunks 判斷正確；
最大模組分析與響應式檢查未執行（見上）；長列表上限——除群聊 feed 外結構性受限 [推論]。
回歸風險四項：Sheet stack 接管需先修訂規則檔（見上）；React Router 非必要、自製 hash router
即可相容 `#/session/:id`；冷啟動競速**已有實際 bug 前科**（main.js 註解自載），AppShell
改造前應把啟動編排結構化並保留既有回歸測試；@layer 會改變勝負（batch-10 已實證）。

---

## 綜合結論

兩份獨立分析對「病灶與藥方」的判斷收斂：**沒有需要換框架的 P0 問題**，最值得投入的是
(1) 讓 React 真正接管狀態訂閱與事件（本文第 1 批＝codex 第二階段的核心），
(2) 沿 feature 縫線拆檔並 TS 化（本文第 2 批＝codex 第三階段）。

本文對 codex 路線圖的兩點修正：**在最前面插入「第 0 批安全網」**（e2e 路徑映射是
一切拆檔的前置，成本一張表）；以及**三個建議（SurfaceProvider、@layer、adapter 簽名）
是規則翻案項**，開工前先修訂 `.claude/rules/react-migration.md` 與對齊 batch-10 決策，
比照既有翻案儀式落檔，避免派工時被守門測試與凍結規則打回。

## 附：查證出處

- 22 條查證的逐條判定見**附錄 A**；9 切面盤點的逐字原文證據由本次多代理工作流程產出
  （工作檔未入 repo），但關鍵數字（行數、grep 計數、build 尺寸）均可用文中與附錄 A
  的指令於 working tree 重現。
- 歷史決策時間軸出處：`docs/frontend-migration-plan-2026-08-18.md`（不在 scope 清單）、
  `docs/frontend-fix-plan-2026-08-20.md` §0.5（D1–D7 拍板）、
  `docs/arch-dispatch-2026-08-21/00-overview.md`（非派工項）、
  `docs/arch-reports/final-verdict-2026-08-21.md`（未盡事項與量化終態）、
  `docs/migration-reports/batch-10.md` §3（@layer 反例）。

## 附錄 A：codex 22 條主張逐條判定矩陣

查證基準＝working tree；rec 類的判定對象是「建議所依據的前提」。每列的證據可依「重現」欄
指令自行重跑。

| ID | 類型 | 主張摘要 | 判定 | 關鍵證據／重現 |
| --- | --- | --- | --- | --- |
| C1 | fact | 三大檔 2,382/2,149/1,483 行，合計 6,014、占 JS 76.4% | CONFIRMED | `wc -l src/{sessionViews,sessionController,main}.js`；分母 `find src -name '*.js'` 23 檔 7,867 行 |
| C2 | fact | JS/TS/TSX＝7,867/6,082/6,045 行、TS+TSX 60.7%；databaseTypes.ts 1,970 行生成檔高估覆蓋 | CONFIRMED | `wc -l` 逐項吻合；扣生成檔後 56.3% |
| C3 | fact | build 主 chunk 639.90 kB／gzip 184.71 kB | PARTIAL | 實跑 `npm run build`＝639.65/184.51 kB（差約 0.25 kB）；CSS 65.39 kB 吻合、500 kB 警告仍在 |
| C4 | fact | 單一 createRoot；React root 掛 body 後 portal 進 index.html 容器 | CONFIRMED | `grep -rn "createRoot(" src/`＝App.tsx:317 唯一；index.html 仍持殼與導覽 |
| C5 | fact | TSX 零反向 import sessionViews；flushSync 僅兩處 | CONFIRMED | 反向 grep 零命中；App.tsx:331、SurfaceHost.tsx:57（有守門測試） |
| C6 | fact | 非首頁頁面＋13 個 sheet 為 lazy module | CONFIRMED | App.tsx:59/75/91 動態 import；非 eager `import.meta.glob` 恰 13 個 |
| C7 | fact | commit 後重查 DOM 綁原生事件；generation key 重建子樹；DOM 多方共管 | CONFIRMED | App.tsx:326/331/343-345；sessionViews.js:746-791；batch-20 regression 註解自載 |
| C8 | fact | allowJs+checkJs:false 使三大檔未受 TS 驗證；controllerContracts 無法約束 JS | CONFIRMED | tsconfig.json:4-5；`grep` 證實零 JS 檔引用 controllerContracts |
| C9 | fact | setState 不派發、emit 顯式，為舊 renderer 呼叫序設計 | CONFIRMED | sessionStore.ts:2-6 檔頭註解逐字明載設計理由 |
| C10 | fact | controller 混存遠端資料/畫面狀態/輪詢/gate/surface handle/authEpoch，靠大量版本守衛 | CONFIRMED | `grep -c isCurrentAuthSnapshot`＝50、`isStale()`＝23；store 欄位 181-208 行 |
| C11 | fact | MySessionsPageOptions「二十多個 callback」 | PARTIAL | callback 實數恰 20（全成員 29）；MePage 多類操作 props 半句屬實 |
| C12 | fact | 四類長列表全量 render、無節流/虛擬化 | CONFIRMED | 四面皆 `.map` 全量；`content-visibility`/virtualization/`.limit(` 反向 grep 全空 |
| C13 | fact | 13 個 CSS 檔、import 順序即層疊契約 | CONFIRMED | `ls src/*.css`＝13；main.js:2-4 檔頭明文 |
| C14 | fact | 有 Error Boundary＋allowlist，但 production transport 是 NOOP | CONFIRMED | appErrors.ts:55；`configureAppErrorTransport` 零 production 呼叫點；無監控 SDK |
| C15 | fact | 資料存取集中 facade＋src/data；mock 排除三層防護 | CONFIRMED | `.from(`/`.rpc(` 僅 authApi.ts 與 dataRepository.ts；alias＋空模組＋dist 黑名單 |
| C16 | rec | AppShell 接管殼與切頁；SurfaceProvider 當唯一 stack owner | 前提成立 | 但 SurfaceProvider 牴觸 react-migration.md「stack 不搬進 React」凍結，需先修規則（§6） |
| C17 | rec | controller 依 use case 拆檔＋新模組 .ts；不開 checkJs | 前提成立 | 與 CLAUDE.md 方向一致；features/ 六模組已部分落地 |
| C18 | rec | 狀態三分；過渡用 useSyncExternalStore；不加 Redux/Zustand | 前提成立 | C9/C10 前提屬實；TanStack Query 為 08-21 延後附條件項（§6） |
| C19 | rec | feature hooks＋action object 取代 props 平鋪 | PARTIAL | 「二十多」實為 20；且會動到 adapter 凍結簽名，需先修 react-migration 規則 |
| C20 | rec | 拆 repository／私人功能 lazy 降 bundle；manualChunks 僅快取優化 | 前提成立 | build 實測前提成立；vite.config 無 manualChunks；判斷正確 |
| C21 | rec | 長列表先 content-visibility，延後虛擬化 | 前提成立 | 現況零節流實作；延後虛擬化合理（另見「明確不建議」節的總量更正） |
| C22 | rec | token 搬 src/styles/＋@layer 分批遷移 | 前提成立 | 但 @layer 牴觸 batch-10 實證結論，屬翻案項；token 搬移技術上可行（contrast 測試已遞迴掃描） |

## 修訂紀錄

- 2026-08-22 v2：依 codex 複測回饋修訂六處——(1) §4-H 補「已由 `7f5c1b6` 修正」後註；
  (2) remount 範圍限縮至四個頁面 slot（sheet 以穩定 slot id 掛載）；(3) 撤回「清單結構性
  受限、唯群聊無界」推論，更正為四面皆無 limit、隨使用者數成長；(4) e2e 承接方式由
  「必要的映射表升級」改為「同名 facade re-export 為標準解、映射表可選」；(5) MessagesPage
  helper 複本歸因更正（2 個對 sessionPresentation.ts、2 個對 sessionViews.js）；
  (6) 補附錄 A 完整 22 條判定矩陣，修復稽核鏈。
