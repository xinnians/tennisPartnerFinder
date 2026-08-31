# 前端架構整合決策草案

日期：2026-08-29<br>
狀態：**待 Claude 二次確認，不代表已授權實作**<br>
範圍：整合第一次架構分析、Claude second-pass 與 Codex 回讀後的修正版工作方向

參考文件：

- `docs/arch-reports/frontend-architecture-review-2026-08-29.md`
- `docs/arch-reports/frontend-architecture-review-second-pass-2026-08-29.md`
- `docs/arch-roadmap-2026-08-26-react-ownership.md`
- `docs/migration-reports/batch-10.md`
- `docs/arch-reports/batch-5-synccommit-retention-2026-08-27.md`
- `docs/arch-reports/bundle-composition-2026-08-25.md`

---

## 1. 這份文件解決什麼問題

第一份報告提出了正確的大方向，但低估了專案已完成的 React ownership 工作，也重提了幾個已經實證否決或結案的方案。

Claude second-pass 補上大量程式碼證據，修正了執行順序；但部分措辭仍可能讓人誤以為：

- 所有 DOM 都必須由 React 直接建立。
- bundle gate 是不可討論的技術定律。
- 沒有 Router 或 Query 套件就不能開始任何架構改善。

本文件把三方共識整理成可派工前的決策草案，重點是：

1. 什麼已完成，不要重做。
2. 什麼仍是問題。
3. 哪些方案已被否決或需要重新拍板。
4. 下一條工作管線應如何排序。
5. Claude 下一輪應確認哪些承重判斷。

---

## 2. 一句話結論

專案不需要換框架，也不需要重新進行已完成的頁面 React 遷移；現在應先清理已知死碼、補上防止 legacy 增生的 gate、建立真實效能基線，再以正式決策處理 bundle 預算，之後才選擇 route ownership 與 server-state 邊界的第一個 vertical slice。

---

## 3. 已確認的現況

### 3.1 已完成，不應重新派工

依既有 roadmap 的 React ownership 驗收標準，以下工作已完成：

- Messages 頁面 React ownership
- Me 頁面 React ownership
- My Sessions 頁面 React ownership
- Nearby / Discovery Drawer React ownership
- 單一 React root
- SurfaceHost 對 surface portal、focus trap、Escape、restore focus 的 ownership
- 舊 page slot 機制退役
- `sheets.js` 轉為 `sheets.ts`
- private repository 動態載入
- Sentry 獨立 lazy chunk

注意：這裡的「完成」只代表 UI ownership 已收斂，不代表 route ownership、server-state ownership 或 feature-first 目錄已完成。

### 3.2 仍然成立的問題

- UI 與 browser integration 的 ownership 邊界仍分散。
- controller 仍掌握大量 surface orchestration、轉場與 imperative setter。
- server payload、status/error、UI state 與 browser state 仍混在同一個 store。
- 頁面與 deep link 仍由 `main.js` 手動控制。
- `src/` root 有大量散檔，功能導航成本高。
- CSS 依賴固定 import 順序，且目前沒有自動守門。
- authenticated preload 與 intent preload 重疊。
- production bundle 的硬性餘裕很小。
- 未建立真實手機、慢網路、LCP、INP 與 parse/execute 基線。

### 3.3 現有品質基礎應保留

- Supabase view/RPC/data API 隱私邊界
- auth identity 與 auth epoch 防護
- mutation 結果落地前的 staleness gate
- 帳號切換時私人資料清除
- raw GPS 不進持久 cache 或 log
- focus、Escape、aria-live 與 restore focus 行為
- production bundle、private chunk、LINE 零殘留與 E2E hook gate
- TypeScript strict、ESLint、單元測試、Playwright 與 DB contract tests

---

## 4. 修正後的 ownership 原則

原本的「讓 React 成為唯一 UI owner」需要改成更精確的規則：

> 每一個 DOM 子樹只能有一個明確 owner；React 負責應用程式組合與資料介面，但第三方命令式系統可以擁有自己的封閉子樹。

### 4.1 合法的命令式 owner

- Google Maps 可以擁有 `#map` 內部節點與 marker DOM。
- Geolocation、Web Push、OAuth、Sentry 可以由 browser adapter 管理。
- 穩定且刻意不重建的 aria-live 節點可以保留在 React tree 外。

React 應負責這些 integration 的：

- 外層容器
- props / commands / event contract
- mount / unmount lifecycle
- 錯誤邊界
- 使用者可見狀態

React 不需要重新建立 Google Maps SDK 自己管理的 DOM。

### 4.2 應消除的雙重 ownership

- React portal 產生子節點，但 `main.js` 對同一容器掛 delegated listener。
- React 元件 render 節點後，再由 `sessionActions.ts` 寫入該節點的 `disabled`、`hidden` 或 `textContent`。
- controller 同時決定 server flow、surface 名稱、focus reason 與 view setter。
- module import 的 top-level side effect 負責完成其他 view 模組的 wiring。

---

## 5. 已否決或不應直接執行的方案

### 5.1 不導入 `@layer`

`docs/migration-reports/batch-10.md` 已用三組跨檔 specificity 反例證明：現有 CSS 直接切 layer 會改變勝負。

因此目前的 CSS 方向是：

1. 先為 CSS import 順序補測試 gate。
2. 新樣式使用 feature 前綴或局部 selector，避免新增跨 feature 覆寫。
3. 如果未來要使用 CSS Modules 或 layer，先改寫相關結構測試與跨檔 specificity 依賴。

### 5.2 不以 `syncCommit` 歸零為目標

目前兩個 production caller 都有移除即失敗的原始測試證據。除非新架構已改掉被保護的同步契約，否則不重新開啟「直接刪除」工作。

正確目標是：

> 不新增新的 `syncCommit` caller；既有 caller 只有在其原始 race/focus 契約消失後才重新評估。

### 5.3 不重新建立 token 單一來源

token 定義已集中在 `src/session.css`。待辦只是修正「唯一 `:root`」的不精確註解，以及決定 `ds-bundle/` 的文件定位。

### 5.4 不直接換 Next.js

目前問題來自 ownership、routing 與 state boundary，換 framework 不會自動解決。

只有在以下產品需求成立時才重評：

- 公開球局需要 SEO 索引
- 每個球局需要動態 Open Graph metadata
- 有明確 SSR、BFF 或 server aggregation 需求
- 公開內容已成為主要產品入口

### 5.5 不直接把所有 server state 換成 TanStack Query

TanStack Query 不能直接取代：

- mutation 完成後的 live identity/gate 檢查
- geolocation 之類非 query 流程
- auth epoch 的 profile gate 降級語意
- 帳號切換時的私人資料立即移除
- raw GPS 不留存要求
- chat quiet/loud polling 與已讀副作用鏈

若未來導入 Query，必須逐類型遷移，不能整個 store 一次替換。

---

## 6. Bundle 現況與決策原則

目前 production gate 的主要數字：

```text
主 chunk raw 餘裕：19,930 B
主 chunk gzip 餘裕：4,954 B
全部 JS raw 餘裕：8,400 B
全部 JS gzip 餘裕：1,435 B
最大一般 lazy chunk gzip 餘裕：551 B
```

因此：

- 新 runtime dependency 即使 lazy-loaded，仍會計入 total JS gate。
- preload 改動只影響下載時機，不會釋放 gate 餘裕。
- Router 或 Query 套件在實測前不能直接加入。

但 bundle gate 是專案維護政策，不是永遠不可調整的技術定律。若新依賴帶來可證明的架構收益，可以透過正式決策重編預算。

### 6.1 Bundle 決策應比較的方案

#### 方案 A：維持目前 gate，不加 runtime dependency

優點：風險最低。<br>
缺點：route/query 架構只能使用既有工具或自行實作，可能繼續累積維護成本。

#### 方案 B：延遲載入 auth client

可能釋放的量級很大，但必須先回答：

- 匿名 discovery 如何建立 PostgREST client？
- PKCE callback 是否要求 auth client 在初始 boot 即存在？
- token restore、refresh 與 hosted callback 的時序是否可保持？
- production 與 local Supabase 測試如何覆蓋？

#### 方案 C：替換 Supabase 未使用子套件

理論上可移除 realtime、storage、functions 成本，但屬高風險：

- SupabaseClient 仍會建立或呼叫部分 client。
- Realtime 替身至少要支援 `setAuth()`。
- production-only alias 可能避開 dev、typecheck 與測試。
- token refresh 或 SIGNED_OUT 才可能觸發錯誤。

沒有 production-equivalent 登入、refresh 與 sign-out 測試前，不應實作。

#### 方案 D：正式調整 gate

若 Router 或 Query 的效益高於少量傳輸成本，可以：

1. 實測該依賴在本 repo 的 min/gzip/brotli。
2. 記錄增加量與真實效能影響。
3. 由維護者批准新的 byte budget。
4. 保留 growth ceiling，避免預算失控。

這比為了守住一個歷史數字而導入不受官方支援的 Supabase 替身更容易維護，但需要正式拍板。

---

## 7. 修正後的狀態分類

`SessionControllerState` 目前可先理解為：

| 類別 | 內容 |
| --- | --- |
| 遠端 payload | sessions、mySessions、mySessionRosters、blockedPlayers、players、profile、courts |
| query 衛星狀態 | discovery、mySessions、blockedPlayers、playerLayer 的 status/error/message，加上 courtsReady |
| orchestration | authEpoch、authSession |
| UI / query input | filters、drawerState、playerLayerOn、bounds |
| browser integration | userLocation、locationBlocked、locationMessage、mapUnavailable |
| 本地推導 | profileEligibility |

這個分類只用來安排重構，不代表每一列可直接搬進某個 library。

### 7.1 可先抽離的候選

- discovery last-write-wins 讀取
- detail join preview
- 純三態 loading/error/data 樣板
- `mySessionsError` 中混合的主查詢錯誤與 roster 部分錯誤
- 純表單衍生與 validation 邏輯

### 7.2 必須保留或重新設計

- mutation 結果落地前的 identity/gate 檢查
- authEpoch 的多重語意
- account switch 私人資料立即清除
- chat polling、read cursor 與 archived state
- profile optimistic patch
- courtsReady 與 directory gate 的關係
- raw GPS mutation variables 的生命週期

---

## 8. Preload 決策

目前有兩套機制：

1. 登入後一次預載 13 個 view/surface。
2. pointerover/focusin 的 intent-based preload。

已知問題：

- 登入 preload 與 intent preload 有多項重複。
- 登入時會和 Google Maps、discovery request、Sentry 搶頻寬。
- 罕用 dialog 被預載，常用 SessionDetailSheet 卻不在登入清單。
- `main.js` 另有一個永遠拿到 null authSession 的死 preload 呼叫。
- 觸控裝置的 pointerover 幾乎沒有預熱時間。

建議策略：

- 移除死 preload 呼叫。
- 登入後只保留非常小的 idle preload 集合。
- 桌面保留 pointerover/focusin。
- 手機以 idle-time 或已知下一步預載，不依靠 hover。
- 每個 preload 都要有「預期會在多快之內被使用」的理由。

這是首屏網路競爭改善，不是 bundle gate 改善。

---

## 9. 下一條工作管線

### 階段 0：凍結新增 legacy 路徑

新增掃描 gate：

- 新功能不得新增 `innerHTML` renderer。
- 新功能不得新增 React 節點外部 mutation。
- 新功能不得新增 `syncCommit` caller。
- 新功能不得新增 controller → DOM 直接操作。

既有 Google Maps、pins、map data status 等命令式路徑採明確 allowlist，不做模糊 regex 全面放行。

驗收：

1. 現況通過。
2. 人工加入一個禁止模式時測試失敗。
3. 還原後再次通過。

### 階段 1：零風險清理

候選內容：

- 刪除 `main.js` 的 dead preload 呼叫。
- `SurfaceSlot` 取消不必要 export。
- 刪除 `sessionViews.js` 零 caller exports/re-exports，並同步更新對應 manifest gate。
- 移除已無 consumer 的凍結註解與 `prettier-ignore` 鷹架。
- 新增 CSS import 順序 gate。
- 修正 token 註解。
- 將 `ds-bundle/` 標為唯讀快照；是否刪除另行批准。

這一階段不得改 UX、路由、資料流或 bundle budget。

### 階段 2：量測基線

至少建立：

- 390px 手機慢網路首頁可用時間
- Google Maps 可互動時間
- LCP
- INP
- JS parse / execute
- 登入後 preload 的 request waterfall
- 首次開啟 SessionDetail、My Sessions、Me、Chat 的 chunk 時序
- gzip 與 brotli 實際傳輸量

測試應區分：

- 未登入首次進站
- 已有登入 session 的首次進站
- OAuth callback 返回
- 手機與桌面

### 階段 3：Bundle ADR

建立一份 Architecture Decision Record，正式比較 §6.1 的四個方案。

ADR 必須包含：

- 現況與真實裝置基線
- 每個候選的實際 Vite build 體積
- gzip 與 brotli
- production-equivalent 驗證設計
- OAuth、refresh、sign-out、匿名 discovery 的影響
- 維護與升級成本
- 最終 byte budget 與批准者

沒有 ADR 結論前，不加入 Router、Query 或 Supabase production alias。

### 階段 4：結構 gate 與 wiring 移植

先做：

- 把讀取 `sessionViews.js` 字面的結構測試改成讀穩定 manifest/contract。
- 建立新 gate，確認 private repository lazy boundary、surface 名冊與 production chunk 邊界。

再做：

- 搬出 `sessionViews.js` 的 top-level configure side effects。
- 讓 composition root 明確呼叫 wiring。
- 每搬一條 wiring，就刪除一條不再需要的 facade。

固定順序：

```text
新 gate 綠 → 新 wiring 綠 → 舊 bridge 刪除 → 舊 gate 刪除或降級
```

### 階段 5：route / server-state 小型實驗

依 ADR 結論選擇：

- 第三方 Router
- 保留 hash 但建立內部 route contract
- 第三方 Query cache
- 先用既有 store 抽出 feature server-state facade

這個實驗必須只選一個範圍，不同時導入多套 state/router 工具。

驗收應至少覆蓋：

- deep link
- browser back/forward
- focus restore
- auth redirect
- account switch
- private state 清除
- stale mutation 不落地
- mobile lazy loading

### 階段 6：第一個 vertical slice

vertical slice 的完成定義：

- 有明確 route ownership，或有書面理由證明不需要獨立 route。
- server payload、UI state 與 orchestration 邊界清楚。
- controller 不再直接選擇該功能的 surface 實作。
- 新 wiring 取代舊 facade。
- 對應 legacy bridge 有實際刪除。
- 原有隱私、race、focus 與 bundle gate 全部保留。

目前不先指定 Messages、Me、My Sessions 或 Player Directory，因為前三者的 UI ownership 已完成，Player Directory 又與 Maps 命令式層高度耦合。

候選應在階段 3–5 完成後，依實測耦合與 bundle 結果重新挑選。

---

## 10. Feature-first 結構仍是長期方向

建議目標：

```text
src/
  app/
  features/
    discovery/
    sessions/
    chat/
    profile/
    players/
    notifications/
  integrations/
    google-maps/
    supabase/
    sentry/
    web-push/
  shared/
    ui/
    hooks/
    lib/
    styles/
    types/
```

但禁止只為了目錄好看做全案搬檔。只有在功能 ownership 真正移動時才搬檔。

第一個可先整理的區域不是已完成的 page，而是 `src/` root 的散檔：

- session action / criteria / intent / selectors / presentation / route
- map / pins
- filters / profile
- me / nearby / my sessions focus helper

搬移條件：

- 新目錄能說明 owner。
- importer 數量與方向變得更清楚。
- 不引入新的 barrel import。
- 動態載入邊界不被意外打平。
- bundle hash/size 變化可解釋。

---

## 11. CSS 的暫定規則

在 `@layer` 或 CSS Modules 另行評估前：

- 維持現有 13 檔 import 次序。
- 新增 CSS 前先決定屬於哪個既有實體邊界。
- 新 feature 使用清楚前綴，例如 `.session-detail-*`、`.player-directory-*`。
- 避免新增 ID selector。
- 避免跨 feature selector。
- 不新增 `!important`，除非有註解與實證理由。
- token 只在 `src/session.css` 定義。
- responsive 規則優先放在 feature 鄰近處；若因既有順序必須放 `responsive.css`，要附理由。

若未來導入 CSS Modules，必須先處理依賴全域 class 字面的測試，而不是先讓測試整批失效。

---

## 12. Query 導入時的隱私與生命週期規則

若 ADR 最後允許使用 Query cache，必須先寫入以下不可變規則：

- raw GPS 不得進 MutationCache variables。
- 不得使用 cache persister 儲存私人資料。
- production 不得包含 Query Devtools。
- auth identity 改變時使用 `removeQueries` 清除上一帳號私人資料，不能只 invalidate。
- query key 必須包含足以區分帳號與資料 scope 的 identity。
- authEpoch 不直接整個塞進所有 query key；需先拆出 identity epoch 與 profile/gate epoch。
- mutation 完成後仍需驗證 live identity 與 profile gate。
- private query 的 cacheTime/gcTime 要有明確理由。
- query function 只能呼叫既有 data API/repository，不能直接存取 raw table。

---

## 13. 不建議做的事

- 不重寫整個專案。
- 不重新搬已完成的 React 頁面 ownership。
- 不為消除 Vite warning 單純提高 warning limit。
- 不把 `manualChunks` 當成減少下載量。
- 不加入多個狀態或路由 framework 一次試驗。
- 不直接刪除 `syncCommit`。
- 不導入 `@layer`。
- 不讓 UI 直接查 raw Supabase table。
- 不在 production-only alias 沒有執行測試時替換 Supabase 子套件。
- 不先搬資料夾再找 ownership 理由。
- 不把 Map SDK 內部 DOM 搬給 React。
- 不把穩定 aria-live 節點搬入可能重建的 React subtree，除非已有 AT 驗證。
- 不刪白箱 gate，除非新 gate 已先證明能守住相同契約。

---

## 14. 每批共同驗收條件

- `npm run typecheck`
- `npm run lint`
- 相關 Node unit tests
- 相關 Playwright desktop/mobile journeys
- `npm run build`
- `npm run check:production-bundle`
- `git diff --check`
- account switch 不留下私人 DOM、store 或 cache
- deep link、back/forward 與 focus restore 不退步
- raw GPS、LINE 與 private repository 邊界不退步
- bundle 變化有 before/after 數字
- 新架構有對應 legacy 刪除，或明確標示本批只是前置工作

對 Supabase client、Auth 或 private cache 的變更，另需：

- `npm run test:db`
- `npm run test:local`
- mobile local Supabase journey
- OAuth、token refresh、sign-out 人工或自動驗證

---

## 15. 請 Claude 第三次確認的問題

請 Claude 以 HEAD 程式碼、既有 roadmap 與測試為準，逐題回答：

1. 本文件用「每個 DOM 子樹一個 owner」取代「React 是唯一 owner」，是否更符合 Google Maps、aria-live 與 modal isolation 的現況？
2. §3.1 的已完成清單是否準確？是否還有已 ACCEPTED 但本文件誤列為待辦的項目？
3. 階段 0 的四條凍結 gate 是否都能用低誤報的掃描方式實作？建議的既有 allowlist 是什麼？
4. 階段 1 的候選是否確實都屬低風險？哪些項目其實會碰 bundle、測試或 runtime contract？
5. `ds-bundle/` 應標唯讀、移到文件區、還是刪除？請提供 consumer 與 git history 證據。
6. 階段 2 的效能基線是否缺少重要情境或指標？現有 Playwright performance test 可重用多少？
7. §6.1 的四個 bundle 方案是否完整？是否有更安全的第五方案，例如保留 Supabase Auth、但讓匿名 discovery 走受控的較小 client？
8. 若正式調整 bundle gate，如何設定新上限才不會變成無限放寬？請提出可量測的預算公式。
9. §7 的 state 分類是否準確？哪些欄位同時具有兩種 ownership，不能只放一類？
10. 在不導入 TanStack Query 的前提下，能否先建立 feature-level server-state facade，並實際降低 controller 耦合？請提出最小實驗。
11. 結構 gate 從讀取 `sessionViews.js` 字面改為 manifest 時，哪些隱私與 lazy-loading 契約必須保留？
12. `sessionViews.js` 四個 top-level configure side effect 的安全搬移順序是什麼？
13. 階段 5 應優先測 route ownership 還是 server-state ownership？兩者能否分批，避免一次引入兩個變數？
14. 第一個真正 vertical slice 應選哪個功能？請以 production caller、surface、store、route、privacy、bundle 與測試耦合量化比較。
15. §11 的暫定 CSS 規則是否會與既有 source-order/specificity 契約衝突？
16. §12 的 Query 隱私規則是否足夠？是否仍會留下跨帳號資料或 raw location 的風險？
17. 本文件是否錯把 bundle gate 當成可過早調整的政策？既有批准規則還缺哪些前置證據？
18. 請標出本文件所有「方向正確但證據不足」的句子，並列出最低成本的複驗方式。

---

## 16. 等待確認期間可做與不可做

### 可做

- 只讀盤點
- 量測
- 建立派工文件
- 建立不改 runtime 的掃描 gate 草案
- 確認 dead exports/callers
- 整理 bundle ADR 的選項與驗證矩陣

### 不可直接做

- 安裝 Router 或 Query dependency
- 修改 bundle byte limits
- 建立 production-only Supabase alias
- 刪除 `ds-bundle/`
- 導入 `@layer`
- 刪除 `syncCommit`
- 改 deep-link URL
- 改 Auth boot、PKCE 或 token refresh
- 全案搬成 feature-first 目錄

---

## 17. 最終決策原則

後續架構工作的優先順序應是：

```text
防止問題增生
  → 清除已知死碼與死契約
  → 建立真實效能基線
  → 正式決定 bundle 預算
  → 移植結構 gate 與 wiring
  → 小型 route/state 實驗
  → 第一個真 vertical slice
```

成功標準不是「用了新的框架」或「資料夾變漂亮」，而是：

> 一項功能只有一條可追蹤的資料流，每個 DOM 子樹只有一個 owner，私人資料有明確生命週期，而且每新增一個新邊界，都伴隨一個舊 bridge 的實際退役。
