# React ownership 路線圖（2026-08-26 拍板）

- 依據：三輪審查全紀錄（`7a0a74d`）——批次骨架採 Codex 第三輪裁決
  `docs/frontend-design-architecture-final-recommendation-2026-08-26-codex.md`，
  加上 Claude 覆核 `docs/frontend-design-architecture-final-adjudication-2026-08-26-claude.md`
  的三項修正（批 0.5 同批解凍規則、`#9db3a4` 升為拍板項、批 4 附帶 SessionDetailSheet 重新 lazy 化）。
- 開工基準：`7a0a74d`（批 0 文件真實批已於 `91a84cc` 完成入版；working tree 乾淨）。
- 量化基準：一律以覆核文件 §3.4 更正基準表為準（`__importAppModule` 141、type-aware off 9、
  `syncCommit` caller 3、`#9db3a4` 7、main gzip 餘 1,088 B、total gzip 餘 2,516 B、
  mock 套件 286 passed／4 skipped）。首輪分析的 142／10／3 等數字已證誤，禁止再引用。
- 本文件是本輪唯一總控：批次狀態、拍板紀錄與 ACCEPTED 回填都在此維護。

## 拍板紀錄

| 編號 | 問題 | 拍板 | 日期 |
| --- | --- | --- | --- |
| Q1 | 批 0.5（新碼邊界 ADR＋分批解凍）是否核准 | 核准，派 Codex 起草；文本回傳驗收後，由負責人最終核准生效 | 2026-08-26 |
| Q2 | 第一個容器化試點範圍 | Messages-only | 2026-08-26 |
| Q7 | `#9db3a4` 收 token 是否翻案 | 維持慣例色，不收 token；此項關閉，不再排批 | 2026-08-26 |
| Q8 | 凍結條款解凍範圍與節奏 | 同意分批解凍：批 1 只解 Messages adapter、批 4 才解殼、批 5 才解同步 commit 契約 | 2026-08-26 |

待拍板（不阻擋批 0.5–批 2 開工）：

| 編號 | 問題 | 何時需要答案 |
| --- | --- | --- |
| Q3 | 白箱測試退役清單中，哪些有不可放棄的治理目的 | **已拍板（2026-08-26）**：三類分法核准，見 `docs/arch-q3-whitebox-triage-2026-08-26.md`（含 Q3-a 色票封條補入、Q3-b 量化只作觀察）；批 3 開工前提達成 |
| Q4 | 桌面雙欄需要多少桌面使用比例才啟動（NP-05 量化門檻） | 桌面雙欄啟動前 |
| Q5 | 是否計畫大量可被搜尋引擎索引的公開球局頁（SSR 重評條件） | 無期限；出現產品需求時 |
| Q6 | bundle gate（main 192,420／total 259,062 gzip）是否允許重編、由誰批准 | 首個確有收益的新依賴提案時 |

## 角色與流程

- **Claude**：寫派工單、驗收、寫驗收紀錄、commit（不 push）。**Codex**：依派工單實作、寫回報。
- 檔名配對（沿用既有慣例）：派工單 `docs/arch-dispatch-2026-08-26-<批名>.md` →
  Codex 回報 `<派工單檔名去 .md>-report-codex.md`（不列入實作 commit）→
  驗收紀錄 `docs/arch-reports/batch-<批名>-acceptance-<日期>.md`（判定字串 `ACCEPTED`／退件）。
- 每批固定 gate（全綠才可 commit）：`npm run typecheck`、`npm run lint`、`npm run build`、
  `npm run check:production-bundle`、`npm run test:mock`、`git diff --check`；
  依 `.claude/rules/testing.md` 判準決定是否加跑 `npm run test:local`。
  驗收由 Claude 本機重跑並逐條 read-back，不採信回報自證。
- 批次嚴格依序、不平行；退件走補件派工單（`-followup` 後綴）；每批 ACCEPTED 後回填本檔狀態欄。
- 派工單必含：Ground truth（開單時實測）、作法要求、不在範圍、收尾標準矩陣、回報合約、BLOCKED 判準。

## 批 0.5：新碼邊界 ADR＋分批解凍

- 狀態：**ACCEPTED（2026-08-26）**，負責人同日核准條文生效；驗收紀錄
  `docs/arch-reports/batch-0.5-acceptance-2026-08-26.md`（派工單
  `docs/arch-dispatch-2026-08-26-batch0.5.md`）。
- 純文件批，只動 `docs/architecture-decisions.md`（新增 RO 系列 ADR）與
  `.claude/rules/react-migration.md`（追加分批解凍節）。零 `src/`／`tests/` 變更。
- 新碼邊界四條：不新增 React-to-legacy portal adapter；不新增依賴同步 DOM commit 的公開
  adapter；不新增未受 strict TypeScript 檢查的核心 controller；native browser／Maps listener
  仍可用，禁止的是為 legacy DOM bridge 新增的 listener。
- 解凍條文沿用「批 3 解凍（2026-08-25）」儀式：原凍結條文一字不改，追加節成對寫
  「解什麼＋仍不解什麼」，解凍節奏依 Q8 綁批。
- 生效條件：Claude 驗收通過後，負責人（使用者）最終核准條文，才視為生效並 commit。
- ACCEPTED 回填：（待）

## 批 1：Messages-only 容器化試點（開工條件：批 0.5 生效）

- 狀態：**ACCEPTED（2026-08-26，含同日補件）**——驗收紀錄
  `docs/arch-reports/batch-1-acceptance-2026-08-26.md`（主派工單
  `docs/arch-dispatch-2026-08-26-batch1-messages.md`、補件單
  `docs/arch-dispatch-2026-08-26-batch1-followup.md`）。樣板成立：Messages 更新路徑
  5 檔 5 層→3 檔 3 層；`__importAppModule` 新基準 **139**；main gzip 餘 748 B——
  批 2 起每次複製必同批刪對等 glue。
- 目標：建立「React 頁面直接訂閱 store＋feature 限定 typed action hook」可複製樣板，
  證明接線真的變少。範圍明細以覆核文件 §5「批 1」為底（接線鏈已逐檔驗證），
  派工單開單時以當日 HEAD 重驗行號。
- 要點：新增 `AppServicesProvider`＋`useMessagesState()`／`useMessagesActions()`
  （hook 型別自 `ControllerApi` 切片，selector 沿用 `sessionSelectors.ts`，不建大型
  service locator）；收掉 `mountMessagesDestination` options bag、`renderMessagesPage`
  bridge、`renderMessagesPageInApp` 與 MessagesPage props fallback 雙源。
- 測試紀律：`react-page-focus.spec.js` 是藉 adapter 進入的**行為測試**，必須改寫成
  UI 驅動保留，不可刪；`messages-page-dom.test.js` 注入 fake store 後沿用；
  `react-surface-lifecycle.test.js` 涉 messages bridge 的字面斷言同批退役。
- 凍結沿用：`#tab-messages` route、data-testid（`messages-row-*`）、lazy loading、
  AppErrorBoundary `surface="messages-page"`、空狀態文案。
- 驗收（Codex 五問＋量化）：接線檔案數前後對比；bundle 三 gate 數字不升；mock 全綠；
  `__importAppModule` 由 141 下降——**預期僅約 −3，屬正常，不得以降幅小退件**；
  模式可複製性判斷留給批 2 選頁。
- ACCEPTED 回填：（待）

## 批 2：MySessions（2026-08-26 拍板；切 2A／2B）

- 選頁拍板：**MySessions**（同 `mySessions` channel 樣板複製最直接、刪最大 options bag
  對 bundle 最有利）。因同時涉及兩種新複雜度，切子批：
- **批 2A**（狀態：**ACCEPTED（2026-08-26，一次通過）**，驗收紀錄
  `docs/arch-reports/batch-2A-acceptance-2026-08-26.md`；`__importAppModule` 新基準
  122；MySessions lazy chunk −143 B gzip、total −72 B、main ＋91 B 餘 657 B；
  三個非阻擋觀察移交 2B，見驗收紀錄尾節）：
  資料 7 欄＋16 個 action 欄（14 個 controller 方法）單源化（hooks 自 `ControllerApi`
  切片）、options bag 31→8、28 個白箱直呼點改寫；pageViewStore 與 adapter 不動。
  新複雜度＝最大 action surface。
- **批 2B**（狀態：**ACCEPTED（2026-08-26）**，驗收紀錄
  `docs/arch-reports/batch-2B-acceptance-2026-08-26.md`；派工單
  `docs/arch-dispatch-2026-08-26-batch2B-mysessions.md`）：AppServices typed bundle
  承載 `pageViewStore`＋4 app callback、焦點管道收斂 `src/mySessionsCreatedFocus.ts`
  單源（canary 實證）、adapter 全鏈歸零、2A 三移交觀察收畢。main gzip −274 B
  （餘 931 B）、total −225 B。**批 2 全案完結**——MySessions 與 Messages 同級。
- 風險註記：MySessionsPage lazy chunk gzip 僅餘 566 B（全庫最緊）、main 餘 748 B；
  hooks 放 provider（main chunk），並以刪除 21 欄接線碼對沖。
- ACCEPTED 回填：（待）

## 批 3：頁面 ownership 收斂（NearbyDrawer 先、Me 後；Q3 前提已達成）

- 逐頁退役 page slot、snapshot options 與 `renderXInApp` adapter；React AppShell 直接擁有
  主頁面；controller／store 仍是 server state 權威。各頁 adapter 解凍由該頁派工單明列清單。
- **批 3A**（狀態：**ACCEPTED（2026-08-26，一次通過）**，驗收紀錄
  `docs/arch-reports/batch-3A-nearby-acceptance-2026-08-26.md`；`__importAppModule`
  新基準 119；main gzip −178 B 餘 1,109 B；焦點管道 canary 實證
  `performance.spec.js:325/:342` 為載重測試——3B 搬管道前不得先改寫；派工單
  `docs/arch-dispatch-2026-08-26-batch3A-nearby.md`）：
  NearbyDrawer 資料 6 欄＋action 7 欄 hooks 單源化（`"map"` channel＋
  `selectControllerMapView` 現成，零新 selector）、4 個測試直呼點改寫、
  補 `nearby-drawer-dom` 安全網；焦點管道（約 145 行 WeakMap 機制）與 adapter 不動。
- **批 3B**（狀態：**ACCEPTED（2026-08-26）**，驗收紀錄
  `docs/arch-reports/batch-3B-nearby-acceptance-2026-08-26.md`；派工單
  `docs/arch-dispatch-2026-08-26-batch3B-nearby.md`）：焦點管道收斂
  `src/nearbyDrawerFocus.ts` 單一來源（機械 diff 唯一差=Prettier 格式；canary 三拍）、
  adapter 全鏈歸零、直接 portal、pageViews.js 259→62 行、3A 三移交觀察全收。
  main gzip −288 B（餘 1,397 B）、total −312 B。**NearbyDrawer 全案完結**，
  與 Messages／MySessions 同級。
- **批 3C**（Me，壓軸；切兩段）：
  - **3C-1**（狀態：**ACCEPTED（2026-08-26，含同日補件）**，驗收紀錄
    `docs/arch-reports/batch-3C1-me-acceptance-2026-08-26.md`；`__importAppModule`
    新基準 107；MePage chunk gzip 餘 380→503 B、main 餘 1,568 B；退件補正=恢復
    bridge-scope-only `sessionStore` 欄（mount-once 時序教訓）；重要證偽=
    `account-settings:141-146` 在 HEAD 即不咬 bridge sync，**3C-2 canary 須用
    node-replacement 情境**。派工單 `docs/arch-dispatch-2026-08-26-batch3C1-me.md`）：
    sessionStore 權威資料 9 欄＋11 action（僅 2 個在 ControllerApi，9 欄＋2 常數建
    `meApp`）hooks 單源化、14 個測試直呼點處置（三條唯一 oracle 特別點名）、
    補 `me-page-dom` 安全網。風險註記：MePage lazy chunk gzip 餘 ≈380 B 全庫最緊，
    hooks 嚴禁放頁面 chunk。
  - **3C-2**（狀態：**ACCEPTED（2026-08-26）**，驗收紀錄
    `docs/arch-reports/batch-3C2-me-acceptance-2026-08-26.md`；對立審查
    `docs/arch-reports/batch-3C2-adversarial-2026-08-26.md`；派工單
    `docs/arch-dispatch-2026-08-26-batch3C2-me.md`）：
    `useMePageView()` 切片＋presence 組裝、scope 遷入 MePage（key＝live user id，
    3C-1 退件根治）＋node-replacement 帳號切換 oracle（canary 三拍實證）、
    adapter 退役＋**整套 slot 機制歸零**（`syncCommit` caller 3→2，
    `react-surface-lifecycle:109` 白名單同步一行）、`pageViews.js` 刪檔。
    派工外連帶變更核准：init listener 改靜態 host delegation（反向 canary 證必要
    ——slot 同步 flush 是 init 直掛的隱性保證；七行為等價）。勘誤：舊 auth 差分
    preload 是實質死觸發，新 `onAuthIdentityChange` 接線屬行為改善非等價搬移。
    main gzip −338 餘 1,906 B；total −416；MePage chunk −68 餘 571 B。
- ACCEPTED 回填：批 3 全案完結（3A `add101d`／3B `5870262`／3C-1 `ec20cdd`／3C-2 本批）。
  四頁（Messages／MySessions／NearbyDrawer／Me）全同級：hooks 單源＋直接 portal＋
  main.js 零頁面 mount 鏈；slot 機制歸零。

## 批 4：Sheet 殼 React 化（切三段，2026-08-26 盤點後拍板）

- 盤點依據：批 3 完結後 Explore 全面盤點（殼本體 `src/sheets.js` 206 行、私有
  `mountSurface` 一函式承擔背景／focus trap／Escape stack／restore／unmount 時序五責任；
  `closeSheet`／`closeModal` 是全庫零 caller 死 export；14 sheet 已 100% React portal，
  殼是唯一 imperative 遺留；open 入口只在 4 個 `src/views/*.js`）。
- **4A（前置，test＋docs only）**（狀態：**ACCEPTED（2026-08-26）**，驗收紀錄
  `docs/arch-reports/batch-4A-manifest-acceptance-2026-08-26.md`；派工單
  `docs/arch-dispatch-2026-08-26-batch4A-manifest.md`）：三份互不引用重複計數收斂為
  引用單一 `tests/fixtures/surfaceManifest.js`（`app-errors` 14/8 名冊化、
  lazyPages／navDestinations named scan、`:179` 引檔內清單）；manifest 欄位 6→8；
  四組 canary 三拍驗收方全數獨立複跑。navDestinations 結構弱化由
  `performance.spec.js:207-214` 行為 oracle 承接（驗收註記）。
- **4B**（狀態：**ACCEPTED（2026-08-26）**，驗收紀錄
  `docs/arch-reports/batch-4B-detail-lazy-acceptance-2026-08-26.md`；對立審查
  `docs/arch-reports/batch-4B-adversarial-2026-08-26.md`；派工單
  `docs/arch-dispatch-2026-08-26-batch4B-detail-lazy.md`）：SessionDetailSheet
  重 lazy 化完成——defer 分支對齊其餘 13 個樣板（Escape 同步、methods FIFO
  replay）、五條 race oracle＋canary ×2、匿名 intent 預熱、本體零 diff。
  main gzip −3,652 B 餘 5,558 B；新 chunk 4,850 落 gate；total gzip +1,597 B
  （code-splitting 固有成本，如實記錄）。eagerModules 2→1、lazySheets 13→14。
  hosted QA 待辦：真機驗證 map pin hover 是否觸發 chunk 預熱
  （AdvancedMarker title 事件路徑 [不確定]）。
- **4C**（切三段，2026-08-27 拍板：一次一責任、全 14 surface 共用碼徑同步移轉，
  不採雙殼並存——殼是單一 `mountSurface`＋單一 stack，雙殼會生暫態雙 keydown／
  雙 isolation 協調問題；遷移順序採 4B 回報 §9.5）：
  - **4C-1**（狀態：**ACCEPTED（2026-08-27）**，驗收紀錄
    `docs/arch-reports/batch-4C1-shell-acceptance-2026-08-27.md`；對立審查
    `docs/arch-reports/batch-4C1-adversarial-2026-08-27.md`；派工單
    `docs/arch-dispatch-2026-08-26-batch4C1-shell.md`）：殼 DOM 進 React
    （SurfaceHost、DOM parity 硬編基線經 probe 實證）＋生命週期時序（canary ×3）
    ＋isolation 平衡 oracle＋死 export 刪＋E 群改寫。React 19 leaf 例外核准
    （dev-only console.error 但 zero-console-error oracle 會紅，15 portal 路徑
    枚舉成立）。main gzip +352 餘 5,206 B；**total gzip 餘 1,703 B 現為最緊
    gate，4C-2 硬約束**。4C-2 加固項：shell.unmount 拋錯 try/finally、
    dangerous/leaf 規則入 react-migration.md。
  - **4C-2**（狀態：**ACCEPTED（2026-08-27）**，驗收紀錄
    `docs/arch-reports/batch-4C2-keyboard-acceptance-2026-08-27.md`；對立審查
    `docs/arch-reports/batch-4C2-adversarial-2026-08-27.md`；派工單
    `docs/arch-dispatch-2026-08-27-batch4C2-keyboard.md`）：stack＋Escape＋trap
    單一 owner 化入 SurfaceHost（keydown 全庫反掃只剩兩行）;Escape 字面序與
    註解逐字搬遷;canary ×4 親手複跑;oracle 補洞 ×6（unit 344）;4C-1 三加固項
    交付（shell 錯不跳 cleanup 屬實質改善）。total gzip 餘 **1,517 B**
    （連兩批收緊）。4C-3 必交付：`focusableNodes` 兩份單源化。
  - **4C-3**：restore focus 三段 fallback（批 C2-2 修法不可退步）＋收尾。
  原有 DOM、aria、testid 與焦點行為是凍結契約；`SurfaceHost` 的 `syncCommit`
  邊界凍結留批 5（A 群 `:80-81` 兩字面不動）。不在此批改 UX、不做「詳情取代
  drawer」。
- 已知髒點（批 5 處理，批 4 不動）：`react-surface-lifecycle.test.js:94` 標題
  `"three approved callers"` 與 `:109` 現值 2 元素不一致。
- ACCEPTED 回填：（待）

## 批 5：同步 commit 降級（2→0）

- 逐個移除 `syncCommit` 剩餘兩個 caller（`sessionStore.ts`、`SurfaceHost.tsx`；
  `App.tsx` caller 已隨批 3C-2 slot 退役收掉），
  每移除一個都用原始 race／focus 測試驗證；允許「有書面理由的殘留」，不硬壓歸零。
- ACCEPTED 回填：（待）

## 批 6：核心 TypeScript 化＋大檔拆分

- 優先轉換仍存在的 orchestration contract；拆分已穩定介面的 presentation／form section／
  feature component；不為行數而拆檔；逐步恢復 9 條 type-aware ESLint 規則。
- ACCEPTED 回填：（待）

## 隨時可插的獨立小批

- 手機 chips：固定完整「篩選」入口，其餘 quick filters 橫向捲動。
- 匿名 My Sessions 只顯示單一登入引導。
- session card 的 screen-reader accessible name 精簡。
- `tests/*.tsx` harness fixture 納入靜態 gate（typecheck／lint／prettier 目前都不含
  `tests/` 的 `.tsx`；批 2A 引入 harness 後的缺口，2B 驗收勘誤記錄）。
- `chat-settings-filters-smoke.spec.js:468` filter sheet 一次性斷言 flake
  （4／10 存量紅，已立獨立會話任務 task_d6de363e）。

## 等觸發／不排

- 桌面雙欄：等 Analytics 裝置比例（Q4）；需 wireframe＋地圖可視 bounds 驗證，非零風險。
- 詳情取代 drawer：併入桌面雙欄與 focus contract 重設，不單獨做。
- TanStack Query spike：等 cache invalidation／optimistic update 痛點實際出現；受 NP-01
  （mapper 防繞過）＋total-JS 棘輪（餘 2,516 B gzip）雙重約束，「放 lazy chunk」不是逃生門。
- 匿名輕量 REST client：只有真實效能數據指出 Supabase SDK 是首屏瓶頸時才 spike。
- `#9db3a4` 收 token：**已於 2026-08-26 拍板不做**（維持慣例色），關閉。
- 沿用 `docs/arch-roadmap-2026-08-25.md` 尾節既有不排項：CSP enforcing、`profiles.line_id`
  DB 清理、REL-12 種子供給；`reports.status` 結案流程仍有
  「首個真實檢舉的 90 天 purge 窗前」硬期限，錨點為檢舉發生時間。

## 主要失敗風險與預防

1. 凍結條款未解凍就派工 → 批 0.5 先行，解凍成對寫、綁批生效。
2. 批 1 誤刪 adapter-harness 行為測試 → 派工單明文「改寫保留、不可刪」清單。
3. 觀察指標誤判退件 → 各批驗收條款預先寫明預期降幅（批 1 的 141 僅降約 3）。
4. bundle 餘裕耗盡 → 每批必跑 `check:production-bundle` 並回報淨增減。
5. 派工單引用已證誤數字 → 一律引覆核文件 §3.4 基準表。

## 修訂紀錄

- 2026-08-26：初版拍板（Q1／Q2／Q7／Q8），批 0.5 派工單同日發出。
