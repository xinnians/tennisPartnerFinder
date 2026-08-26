# 前端架構第三輪裁決覆核（Claude 審 Codex 裁決）

- 日期：2026-08-26
- 審查者：Claude（第三輪）
- 審查對象：`docs/frontend-design-architecture-final-recommendation-2026-08-26-codex.md`（Codex 第三輪裁決），
  並回溯核對三份前作（Codex 08-25 分析、Claude 08-25 分析、Claude 08-25 比較報告）
- 方法：**先獨立驗證程式碼、測試、設定與 git 歷史，之後才讀四份文件**。所有指定事實均以指令重跑；
  技術陳述附 [已驗證]／[推論]／[不確定]。本輪只新增本文件，未修改任何產品程式與原始報告。
- 驗證基準：working tree（HEAD `0fa5e8a`＋四份 untracked 分析文件）。本輪實跑且全數通過：
  `npm run typecheck`、`npm run lint`、`npm run build`、`npm run check:production-bundle`、
  `npm run test:mock`（286 passed／4 skipped，55.7s）、`npm audit`、`npm audit --omit=dev`。

---

## 1. 最終判斷摘要

**Codex 第三輪裁決成立，可以作為下一階段路線圖的基礎。**具體來說：

1. 使用者指定覆核的六項事實，我全部獨立重驗**成立**（§3 附指令與輸出）。
2. Codex 對 Claude 首輪五個數字的更正**全部正確**；且 git 考古顯示這些數字在 08-25 分析當時的
   HEAD 就已經是 Codex 的版本——**是 Claude 首輪數錯，不是後續 commit 造成的漂移**（§3.2）。
   比較報告「雙方事實全部互相印證、沒有事實衝突」的宣稱因此確實過度肯定：它只重驗了 Codex 的
   數字，沒有回頭重驗 Claude 自己的。
3. 八項建議：**七項同意、一項部分同意**（第 4 項 TanStack／bundle gate——方向對，但低估了
   total-JS 棘輪這個更緊的約束，§2）。
4. 未發現 Codex 裁決與任何生效 ADR（NP-01～06、D-03、D-04、MIG-06）衝突；發現**三處被忽略的
   相依**：`.claude/rules/react-migration.md` 的凍結條款需要正式解凍儀式、total-JS／單-lazy-chunk
   gate 對任何新依賴的約束、`#9db3a4` 其實是有文件記錄的刻意慣例色（§6）。
5. **批 0（文件真實批）已具備立即執行條件**；批 1（Messages-only 試點）在兩個負責人決定
   （批 0.5 ADR 核准＋Messages-only 確認）後即可開工（§7）。

---

## 2. 八項建議：同意／部分同意／不同意對照表

| # | Codex 建議 | 判定 | 依據與補充 |
| --- | --- | --- | --- |
| 1 | 第一個 React ownership 試點只做 MessagesPage，不同時做 MePage | **同意** | [已驗證] `MessagesPage.tsx` 121 行 vs `MePage.tsx` 800 行（`wc -l`）；Messages 的 options bag 只有 4 欄（`main.js:528-540`），且頁面**已經**直接訂閱 store（`MessagesPage.tsx:93-95` 的 `useStoreSelector`＋props fallback 雙源樣板）——試點只需收掉 fallback 與 adapter 鏈，是全站最薄的一條。MePage 同批會把「建樣板」和「最複雜設定頁」綁在一起，Codex 的拆法正確。補充一個誠實預期：Messages 的 adapter 直呼測試只有 `tests/react-page-focus.spec.js:21,54,57` 三處，批 1 對 `__importAppModule` 141 這個觀察指標的降幅會很小，大降幅在批 3–4 |
| 2 | 用 feature-specific typed hooks，不建大型 ControllerProvider／service locator | **同意** | [已驗證] 型別地基已存在：`controllerContracts.ts` 的 `ControllerApi`＋`controllerApiContract.ts:13-19` 的 exact-key 編譯期橋（缺鍵、多鍵都會編譯失敗），feature hook 的回傳型別可直接從它切片，不會另立權威。反例證據也充分：`App.tsx:218-249` MeDestination 逐項傳遞的 props 清單與 `main.js:492-524` 的 options bag 就是 props drilling 的現況成本。唯一提醒：hook 只做接線，selector 沿用 `sessionSelectors.ts` 既有層，避免 hook 內長出第二套 derive 邏輯 |
| 3 | 文件修正與產品 CSS token 調整拆成不同批次 | **同意，且要再加一道閘** | 拆批正確（比較報告曾把「`#9db3a4` 收 token」塞進批 0「順手」做，Codex 把它抽出來是對的）。但我發現一個三份報告都沒提的事實：`#9db3a4` 是**有文件記錄的刻意非 token 常數**——`ds-bundle/README.md:11`「深底(ink)上的非活躍字用 #9db3a4(慣例色,不循淺底映射)」、`docs/superpowers/plans/2026-08-07-scoreboard-batch-a.md:176`「深底專用常數，直接寫值並加註解」、`src/navigation.css:41`／`map-page.css:55` 的行內註解。收 token 等於翻案一個設計決策，且 ds-bundle 鏡像（`_ds_bundle.css` 7 處＋README＋BottomNav.html）要同步。此項應**升級為需要負責人拍板**，不是純工程小批（§8 Q7） |
| 4 | TanStack Query spike 期間維持現有 bundle gate，先測淨影響，採用後才議調門檻 | **部分同意（順序對，約束講輕了）** | [已驗證] 主 chunk gzip 餘裕 1,088 B（191,332／192,420）數字精確。但 Codex 步驟 4「確認它落在 main、lazy private chunk 或其他 chunk」暗示 lazy 放置可以躲過 gate——不行：**total-JS gzip 棘輪 256,546／259,062 只剩 2,516 B**，且單一 app lazy chunk 另有 18,000／5,500 gzip 上限（本輪 `check:production-bundle` 實跑輸出），TanStack Query 最小也約 11–13 KB gzip [推論：官方公布體積，未在本 repo 實測]。結論更強：**在現行棘輪下，Query 無論放哪個 chunk 都無法合併主線**，除非刪碼淨抵銷或負責人重編 gate。spike 在分支上做、紅燈不阻擋 spike 本身，所以 Codex 的順序仍然成立；另補：NP-01 要求提案附「mapper 防繞過方案」，spike 報告必含此節 |
| 5 | 行數／檔案數／事件數只作觀察指標，不寫成硬性測試門檻 | **同意** | 本 repo 正是字面封條成本的活教材：`src/session.css:7-18` 檔頭那套「頂格／單行／>10000 字元」約束曾實際扭曲檔案組合（現行測試已泛化，見 §3.3-e），`react-surface-lifecycle.test.js` 至今仍逐字掃 `main.js`／`sessionViews.js` 原始碼。現行測試裡的數字全是「防漏掃下限」（`legacy-style-scan.test.js:34-41` ≥65 檔＋目錄非空；`contrast-tokens.test.js:29-34` ≥13 CSS 檔），沒有任何行數上限 gate——Codex 主張維持這個紀律，正確 |
| 6 | 桌面版中間態需視覺與 Map viewport 驗證，不能稱零風險 | **同意（這是對比較報告的必要更正）** | 比較報告 §10.9 曾寫「零風險中間態」。[已驗證] `discoveryMapController.ts:135-136`：`loadDiscovery(bounds = read().bounds)`——附近球局清單由地圖 viewport bounds 驅動，改 max-width／置中會改變可視 bounds，直接影響探索結果集；底部導覽與抽屜是 fixed 定位，也需重新走查。Codex 要求 wireframe＋地圖可視面積驗證＋Analytics 決定值不值得，程序正確 |
| 7 | 保留 Vite + React，不改寫 Next.js／Remix 等 | **同意** | 三份報告零分歧，與生效 ADR NP-02／NP-03／NP-06（`docs/architecture-decisions.md:38-42`）一致；依賴現況（react 19.2.8、vite 6.4.3，無 SSR 需求、登入牆後地圖 app）沒有任何新事證需要翻案 |
| 8 | 先完成 React ownership 與 adapter 退役，再考慮 Router／Query／全域狀態／目錄大搬遷 | **同意** | 順序依據充分：目錄搬遷現在會撞 `legacy-style-scan.test.js:21-41` 的目錄封條與 `react-surface-lifecycle.test.js` 的字面掃描、`tests/fixtures/appRuntime.js` 副檔名表——這些會隨 adapter 退役自然瘦身，先搬等於搬兩次；Query 被 NP-01＋gate 雙重擋住；Router 對 4 分頁＋1 深連結是無病之藥。唯一缺口：批 4（sheet 殼）與批 5（syncCommit 歸零）**與 `.claude/rules/react-migration.md` 現行凍結條文直接衝突**（「mountSheet 專有 surface 殼…都不搬進 React」「殼遷移只限批 3B 實施」「handle 推 state 以 flushSync commit」），需要正式解凍儀式，見 §6-1 |

---

## 3. 事實核對與修正

### 3.1 使用者指定的六項事實（全部成立）

| # | 待驗事實 | 我的獨立結果 | 驗證方式 |
| --- | --- | --- | --- |
| 1 | `__importAppModule(...)` 測試呼叫點＝141 | **成立** [已驗證]：tests/ 內 12 個檔案加總恰 141（auth-forms 34＋session-lifecycle 32＋chat-settings-filters 18＋account-settings 18＋discovery-interactions 17＋map-and-bootstrap 7＋session 3＋react-page-focus 3＋performance 3＋navigation-shell 3＋react-unmount 2＋error-boundary 1）；全 repo 156，其餘 15 處全在 docs/ | `rg -o '__importAppModule\(' --no-filename \| wc -l`＋`rg -c` 逐檔 |
| 2 | Type-aware ESLint off 規則＝9 條 | **成立** [已驗證]：`eslint.config.js:84-100`，type-checked block（`recommendedTypeChecked`）內恰 9 條 `"off"`（no-redundant-type-constituents、no-unnecessary-type-assertion、no-unsafe-return／call／member-access／assignment／argument、no-base-to-string、unbound-method） | `grep -c '"off"' eslint.config.js` → 9 |
| 3 | CSS 色碼 `#9db3a4` 出現 7 次 | **成立** [已驗證]：`src/*.css` 恰 7 處——vocabulary.css:33、:44、:84、discovery.css:37、navigation.css:41、create-session.css:67、map-page.css:55。（全 repo 27 次，其餘在 ds-bundle 鏡像與 docs 引用，不計入產品 CSS） | `rg -n -i '9db3a4' src` |
| 4 | 14 個 sheet、13 個 lazy、SessionDetailSheet 由 main.js eager import | **成立** [已驗證]：`ls src/sheets` 恰 14 個 .tsx；`sessionViews.js:265-277` 動態 import 表恰 13 項（唯獨缺 SessionDetailSheet）；`main.js:88` 靜態 `import { mountSessionDetailSheetContent } from "./sheets/SessionDetailSheet.tsx"` | `rg -n 'import\(' src`＋`rg -n 'SessionDetailSheet' src/main.js` |
| 5 | 19 個 React 隔離面＋1 個全域錯誤管道 | **成立** [已驗證]：`<AppErrorBoundary` JSX 掛載點恰 19（App.tsx 5 處：me／messages／my-sessions／nearby-drawer／login-dialog＋14 個 sheet 各 1）；全域管道＝`appErrors.ts:114-115` 的 `error`＋`unhandledrejection` listener，由 `main.js:152` 安裝。`APP_ERROR_SURFACES`（appErrors.ts:1-22）恰 20 名，第一名就是 `"global"`——Claude 首輪的「20」是把型別清單當 boundary 數，Codex 的 19＋1 分解才對 | `rg -n '<AppErrorBoundary' src`（21 個匹配中 2 個是 `AppErrorBoundaryProps/State` 型別泛型，非 JSX） |
| 6 | npm audit 兩個 high＝nanoid＋postcss 間接開發依賴 | **成立** [已驗證]：`npm audit` 恰 2 high（nanoid ≤3.3.17、postcss ≤8.5.22）；依賴鏈唯一：`vite@6.4.3 → postcss@8.5.16 → nanoid@3.3.15`，vite 是 devDependency；`npm audit --omit=dev` 為 `found 0 vulnerabilities` | `npm audit`＋`npm ls nanoid postcss`＋`npm audit --omit=dev` |

### 3.2 git 考古：五個舊數字是「當時就錯」，不是漂移

在 08-25 分析定稿時點的 HEAD（`aad6d75`，08-25 17:58）重跑同樣指令 [已驗證]：

```text
git grep -o '__importAppModule(' aad6d75 -- tests | wc -l   → 141（Claude 首輪寫 142）
git grep -io '9db3a4' aad6d75 -- 'src/*.css' | wc -l        → 7  （Claude 首輪寫 3）
git show aad6d75:src/main.js | grep SessionDetailSheet       → :88 已 eager（Claude 首輪寫 14 個全 lazy）
git show f9f8a2c:eslint.config.js | grep -c '"off"'          → 9  （Claude 首輪寫 10）
```

- 之後的彈性批（`3c066f5` smoke 套件拆分）**沒有**改變 141 這個數。
- 唯一情有可原的是 sheet lazy：eager import 是 `00d016e`（08-25 13:40，retire glob surface
  bridges）當天引入的，若 Claude 的 grep 跑在中午前，「全 lazy」曾短暫為真 [推論]。
- 142 這個數字在 roadmap（自述 140）、`aad6d75`（141）、現行（141）任何抽驗節點都不存在，
  無法重現其來源 [已驗證：三節點抽驗]。
- **含意**：比較報告 §13 的量化完成標準（「142→<50」「unsafe 豁免 10→0」「#9db3a4 ×3」）
  繼承了錯誤基準；後續派工單引用量化目標時，一律以本文件 §3.4 的更正基準表為準。

### 3.3 Codex 裁決其餘可證偽聲稱的抽驗（全數成立）

- (a) 主 bundle 距 gzip gate 1,088 B [已驗證]：本輪實跑 `check:production-bundle` 輸出
  `main 654838/191332 within 658867/192420`，192,420−191,332＝1,088。
- (b) `syncCommit` 恰 3 個 caller [已驗證]：`sessionStore.ts:102`、`app/SurfaceHost.tsx:60`、
  `app/App.tsx:902`。
- (c) CSS 恰 13 檔且 import 順序＝層疊順序 [已驗證]：`main.js:8-20`，含逐檔序號註解。
- (d) README 仍描述已退役 LINE 聯絡面 [已驗證]：README.md:4「主揪接受申請後，雙方才在『我的
  球局』看到彼此的 LINE」、:15「接受後…互看對方 LINE」、隱私節仍以 `session_contacts` 描述
  現行機制；專案地圖（README.md:106-118）無 React／pages／sheets／controller 目錄，
  且把 sessionViews 描述為「contact UI」。品牌名 README「球局」vs `index.html:16`「球咖」不一致。
- (e) session.css 檔頭過時 [已驗證]：檔頭（session.css:7-18）自述 contrast 測試「直讀本檔、
  選擇器頂格、規則體單行、>10000 字元、tests/** 零修改凍結」——現行
  `tests/contrast-tokens.test.js:13-34` 已改為遞迴掃全部 src CSS（≥13 檔、去註解合併 >70,000
  字元），凍結早已解除。比較報告 §12 勘誤正確。
- (f) CLAUDE.md 漂移 [已驗證]：寫 `src/map.js`／`src/pins.js`（實為 `map.ts`／`pins.ts`）、
  「六個 feature 純邏輯模組」（實為 10 個：多 filters、presence、profile、share）、
  「dataApi.js 79 行」（實為 80）、程式結構節未列 `src/controller|pages|sheets|views|components`。
- (g) MessagesPage 121 行／MePage 800 行 [已驗證：wc -l]；MePage 內容涵蓋登入、身分連結、
  球場訂閱、通知、封鎖名單等與 `main.js:505-524` options bag 一致 [已驗證：抽樣]。
- (h) mock 套件 286 passed／4 skipped [已驗證：本輪實跑 55.7s，全綠]。

**結論：Codex 第三輪裁決中，我沒有找到任何一項可證偽陳述是錯的。**它的缺口在「遺漏」而非
「錯誤」，見 §6。

### 3.4 更正後量化基準表（後續批次的測量起點，2026-08-26）

| 指標 | 基準值 | 來源 |
| --- | --- | --- |
| tests 內 `__importAppModule(` 字面呼叫點 | **141** | rg -o 實測 |
| type-aware ESLint off 規則 | **9** | eslint.config.js:84-100 |
| `syncCommit` caller | **3** | grep 實測 |
| src CSS 中 `#9db3a4` | **7** | rg 實測 |
| 全域 CSS 檔數 | **13** | main.js:8-20 |
| main chunk | 654,838 B／gzip 191,332（gate 658,867／192,420，餘 1,088） | check:production-bundle |
| total JS | 841,954 B／gzip 256,546（gate 849,961／259,062，餘 2,516） | 同上 |
| 最大 app lazy chunk | MySessionsPage 16,912／gzip 4,934（gate 18,000／5,500） | 同上 |
| mock 套件 | 286 passed／4 skipped，55.7s | 本輪實跑 |
| legacy JS 主檔 | main.js 806、sessionController.js 711、sessionViews.js 665 行 | wc -l |

---

## 4. 建議的最終執行順序

Codex 的批次骨架（批 0 → 0.5 → 1 → 2 → 3 → 4 → 5 → 6＋插批＋等觸發）**維持不變**，
只做三個修正：

1. **批 0.5 擴充**：除了「新碼邊界 ADR」，必須同批**修訂 `.claude/rules/react-migration.md`**：
   現行條文明定「公開 legacy adapter 簽名凍結、importer 與 e2e 直呼點不因內部改 React 而改」
   「既有 e2e 斷言不得配合遷移修改」「mountSheet 殼不搬進 React（殼遷移只限批 3B）」
   「imperative handle 以 flushSync commit」。這些是為**上一輪遷移**設的凍結面，批 1／4／5 每一批
   都會撞到；不先正式解凍，執行者要嘛違規要嘛卡死。專案已有解凍儀式先例
   （react-migration.md「批 3 解凍（2026-08-25）」與 MIG-06 翻案），照做即可。
2. **「`#9db3a4` 收 token」從可獨立小批移到「需負責人拍板後」**（理由見 §2-3：它翻案一個
   有文件記錄的慣例色決策，並牽動 ds-bundle 鏡像）。
3. **批 3／4 附帶收益補記**：SessionDetailSheet 的 eager import（`00d016e`，為了讓
   sessionViews.js 保持 Node-importable，見 main.js:85-87 註解）在 adapter 退役後失去存在理由，
   可重新 lazy 化——SessionDetailSheet.tsx 835 行，估可釋回數 KB gzip 的 main-bundle 餘裕
   [推論：未實測拆分後體積]，直接緩解 1,088 B 的窘迫。

修正後全序：

```text
批0    文件真實批（README／CLAUDE.md／session.css 檔頭／品牌名；零產品 CSS 變更）
批0.5  新碼邊界 ADR ＋ react-migration.md 凍結條款正式解凍（負責人核准）
批1    Messages-only 容器化試點（範圍見 §5）
批2    依批 1 結果選第二頁（Me／NearbyDrawer／MySessions 三選一，一次只加一種複雜度）
批3    頁面 ownership 收斂（逐頁退 slot／snapshot／renderXInApp）
批4    Sheet 殼 React 化（含 SessionDetailSheet 重新 lazy 化評估）
批5    syncCommit 3→0（逐個，允許「有理由的殘留」）
批6    核心 TS 化＋大檔拆分＋逐步恢復 type-aware 規則
隨時插批：chips 釘住「篩選」、匿名 My Sessions 簡化、SR 名稱精簡
拍板後插批：#9db3a4 等色票收 token（含 ds-bundle 同步）
等觸發：桌面雙欄（Analytics）、詳情取代 drawer（併雙欄）、TanStack spike（痛點出現）、
        輕量 REST client spike（效能數據）
```

---

## 5. 第一個實作批次的明確範圍

### 批 0（文件真實批，可立即執行，約半天）

只改文件與註解，零程式行為變更：

- `README.md`：刪除全部 LINE 聯絡敘述（:4、:15、隱私節的 `session_contacts` 段），改寫為
  球局群組聊天流程；專案地圖補 `src/app|pages|sheets|views|controller|components|data|features`；
  品牌名對齊「球咖」。
- `CLAUDE.md` 程式結構節：`map.ts`／`pins.ts`、10 個 features、補列 controller／pages／sheets／
  views／components、dataApi 80 行。
- `src/session.css:7-18` 檔頭：改為描述現行泛化測試（遞迴掃描、≥13 檔、>70,000 字元），
  刪除「tests/** 零修改凍結」等已失效敘述。
- **不做**：`#9db3a4` 收 token（待拍板）、任何 CSS 計算值變更。
- 驗收：`rg -i 'line' README.md` 無聯絡面語意殘留；CLAUDE.md 敘述與 `ls src` 逐項一致；
  `npm run test:mock` 全綠（證明純文件批零行為影響）。

### 批 1（Messages-only 試點，批 0.5 核准後執行）

目標：建立「React 頁面直接訂閱 store＋typed action hook」的可複製樣板，並證明接線真的變少。

- 動的檔（現況接線鏈已逐一確認 [已驗證]）：
  - `src/main.js:528-540`（`mountMessagesDestination` 的 options bag）與 `:780` 呼叫點、
    `:111` import。
  - `src/views/pageViews.js:6、:15、:316-318`（`renderMessagesPage` bridge）。
  - `src/app/App.tsx:930`（`renderMessagesPageInApp`）、`:254-279`（MessagesDestination
    的 slot.options 消費）。
  - `src/pages/MessagesPage.tsx`：移除 props fallback 雙源（:93-95），`onOpenChat` 改由
    typed hook 取得（hook 型別自 `ControllerApi` 切片）。
  - 新增：`AppServicesProvider`＋`useMessagesState()`／`useMessagesActions()`（feature 限定，
    不暴露完整 controller）。
- 測試面：
  - `tests/react-page-focus.spec.js:21,54,57`：這是**用 adapter 當 harness 的焦點行為測試**，
    要改寫成 UI 驅動，不可直接刪（行為契約必須保留）。
  - `tests/messages-page-dom.test.js`：測的是 React 元件本體（vite ssrLoadModule），
    改為注入 fake store 後沿用。
  - `tests/react-surface-lifecycle.test.js` 中涉及 messages bridge 的字面斷言同批退役。
  - `tests/fixtures/appRuntime.js` 副檔名表若有 messages 映射同批清理。
- 凍結沿用：`#tab-messages` route（仍由 main.js 切頁）、data-testid（`messages-row-*`）、
  lazy loading（App.tsx:117）、AppErrorBoundary `surface="messages-page"`、空狀態文案。
- 驗收（沿用 Codex 五問，補量化）：接線檔案數實測前後對比；bundle 三 gate 數字不升；
  mock 套件全綠且時間不升於 55.7s 基準；`__importAppModule` 由 141 降（預期僅 −3 左右，
  屬正常）；模式可複製性由批 2 選頁報告回答。

---

## 6. 被忽略的風險、相依與（微小的）文件缺口

1. **規則凍結條款是批 1／4／5 的前置相依（Codex 裁決未列）**：`.claude/rules/react-migration.md`
   的 adapter 簽名凍結、「e2e 直呼點不改」、sheet 殼禁遷、flushSync 契約，與新路線圖批 1／4／5
   一一對撞。解法不是繞過而是照 MIG-06／批 3 解凍的既有儀式正式修訂——已納入 §4 修正 1。
2. **Total-JS 與單-lazy-chunk gate 對新依賴的約束（Codex 講輕了）**：詳 §2-4。任何新套件
   （Query、UI library、甚至大型 polyfill）都受 2,516 B total gzip 餘裕約束，「放 lazy chunk」
   不是逃生門。
3. **`#9db3a4` 是刻意慣例色**：詳 §2-3。工程上可做，決策上要翻案。
4. **`react-page-focus.spec.js` 誤分類風險**：批 1 若照字面執行「同批退役只為 adapter 存在的
   白箱測試」，可能把這個「藉 adapter 進入的行為測試」一起刪掉——它守的是跨 rerender 焦點
   還原，必須改寫保留。
5. **觀察指標的預期管理**：141 這個數的大宗在 auth-forms（34）與 session-lifecycle（32）等
   smoke 套件，批 1 只動 3 處；若把「數字明顯下降」當批 1 驗收會誤判失敗。
6. **機會（正向）**：SessionDetailSheet 重新 lazy 化（§4 修正 3）；以及 messages 試點成功後，
   `EMPTY_MESSAGES_GROUPS` 之類 slot 預設值可隨 slot 一起退役。
7. 與 ADR 的衝突檢查結果：**零衝突** [已驗證]。NP-01（Query 延後＋mapper 防繞過）、NP-02／03
   （Router／store 不換）、NP-04（@layer 不翻案；Codex「延後評估」與之相容）、NP-05（雙欄等
   Analytics）、NP-06（不改寫 SSR）、D-03／D-04、MIG-06（已翻案）全數對齊。

---

## 7. Ready to execute 結論

**是——批 0 現在就能開工；批 1 差兩個決定。**

- 品質基線本輪全綠 [已驗證]：typecheck／lint／build／bundle gate／test:mock 286 passed／
  prod audit 0，working tree 除四份分析文件外乾淨，沒有任何技術性阻擋。
- 批 0 的每一條修正內容都已被本輪逐字證實是真漂移，做完即消除「文件教人重新加入退役功能」
  的現行風險。
- 批 0.5 的 ADR 文本與 react-migration.md 修訂可以立刻起草，生效需負責人核准（§8 Q1）。
- 批 1 範圍已可寫成派工單（§5），開工條件＝Q1＋Q2 兩個答案。
- 不 Ready 的部分也明確：token 化（Q7）、TanStack spike（無觸發）、桌面雙欄（無數據）、
  目錄大搬遷（批 3 之後再議）。

---

## 8. 需要產品負責人回答的問題

沿用 Codex 六問（編號 1–6），追加兩問（7–8）：

1. 是否核准批 0 文件真實批與批 0.5 新碼邊界 ADR？
2. 第一個容器化試點是否採 Messages-only？（本裁決建議：是）
3. 現有白箱測試退役清單中，哪些有你不願放棄的治理目的？（比較報告 §9 的保留／退役清單為底）
4. 桌面雙欄需要多少桌面使用比例才啟動（NP-05 的量化門檻）？
5. 未來是否計畫大量可被搜尋引擎索引的公開球局頁（影響 SSR 重評條件）？
6. 若未來新依賴確有收益，bundle gate（main 192,420／total 259,062 gzip）是否允許重編、
   由誰批准？
7. **（新增）`#9db3a4` 收 token 是否翻案「深底慣例色不入 token」的既有設計決策？**
   若翻案，token 命名與 ds-bundle 鏡像同步一併拍板。
8. **（新增）`.claude/rules/react-migration.md` 凍結條款的解凍範圍**：是否同意在批 0.5 以
   正式修訂條文的方式，解凍「adapter 簽名／e2e 直呼點／sheet 殼／flushSync 契約」四項，
   解凍節奏綁定各批（批 1 只解 Messages adapter、批 4 才解殼、批 5 才解 flushSync）？

（沿用路線圖既有待辦，非本輪新增：CSP enforcing、`profiles.line_id` DB 清理、REL-12 種子
供給、`reports.status` 結案流程——最後一項有「首個真實檢舉 90 天 purge 窗前」的硬期限，
見 `docs/arch-roadmap-2026-08-25.md` 尾節。）
