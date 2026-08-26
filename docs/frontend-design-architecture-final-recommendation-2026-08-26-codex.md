# 前端設計與架構最終建議（Codex 第三輪裁決）

- 日期：2026-08-26
- 專案：球咖｜台北市網球
- 分析者：Codex
- 目的：在 Codex、Claude 獨立分析與 Claude 比較報告之後，重新核對事實並整理成可執行的共同方向
- 本次範圍：只分析與規劃，不修改產品程式

## 參考文件

1. `docs/frontend-design-architecture-analysis-2026-08-25-codex.md`
2. `docs/frontend-design-architecture-analysis-2026-08-25-claude.md`
3. `docs/frontend-design-architecture-comparison-2026-08-25-claude-vs-codex.md`

## 最終結論

三份分析的共同方向成立：

- 保留 Vite + React 19。
- 不改寫成 Next.js、Remix 或其他 SSR 框架。
- 不立即加入 React Router、TanStack Query、Redux、Zustand、Tailwind 或大型 UI library。
- 保留 `dataApi → repositories/mappers → Supabase view/RPC` 資料與隱私邊界。
- 保留 controller、requestGate、auth identity epoch 與 authoritative refresh 的語意。
- 下一階段的核心是完成 React ownership，移除遷移期 adapter，而不是換技術棧。

目前最值得處理的問題不是「用了錯的框架」，而是同一個畫面更新仍可能經過：

```text
main.js
  → controller/store
  → sessionViews/pageViews adapter
  → App 模組級 snapshot
  → React portal
  → legacy DOM / sheet shell
```

這條路徑太長，使簡單功能也要修改多層接線。

## 重新驗證後的事實修正

Claude 的比較報告方向可信，但「沒有事實衝突」過度肯定。以下數字應修正：

| 項目 | Claude 文件 | 重新驗證結果 |
| --- | ---: | ---: |
| tests 中 `__importAppModule(...)` 字面呼叫點 | 142 | **141** |
| 關閉的 type-aware ESLint 規則 | 10 | **9** |
| CSS 中 `#9db3a4` 出現次數 | 3 | **7** |
| React sheet lazy loading | 14 個全 lazy | **13 個 lazy；SessionDetailSheet eager** |
| Error surface | 20 個 AppErrorBoundary | **19 個 React boundary + 1 個 global channel** |

完整 `npm audit` 的兩個 high 項目分別涉及 `nanoid` 與 `postcss`，都不在 production dependencies；`npm audit --omit=dev` 仍為 0。

這些修正不影響「不換框架、完成 React ownership」的主要判斷，但應先修正再把量化數字拿來當基準。

## Claude 對 Codex 原建議的有效修正

### 1. 不要現在單獨做「詳情取代 drawer」

這項視覺方向合理，但目前 drawer 持續存在是焦點還原鏈的一部分。直接取代會改到：

- `sheets.js` 的 restore target。
- drawer 卡片的 session id fallback。
- `pageViews.js` 的焦點意圖保存。
- 多條 drawer/detail/close Playwright 行為測試。

因此應等桌面雙欄設計時一併處理，不應先做獨立手機改版。

### 2. 不要先全面搬動 feature 目錄

Codex 原先提出的 `features/*/{api,model,ui}` 可以是長期參考，但近期全面搬目錄會同時影響：

- legacy style scan。
- surface manifest。
- 測試 runtime 的 module path。
- 白箱 import/export 掃描。

目前應先減少接線層，再根據新的所有權決定目錄；否則可能先搬一次，React ownership 完成後再搬第二次。

### 3. CSS import order 應列 P2，不是近期主線

13 個 CSS 檔案依賴順序確實有認知成本，但目前已有註解與測試，沒有高於 adapter、同步 commit 與型別斷層。

可以先抽出 tokens，但 `@layer` 或 CSS Modules 應等白箱測試瘦身後再評估。

### 4. README 與 CLAUDE.md 應升為立即處理

README 仍描述已退役的 LINE 聯絡交換，CLAUDE.md 仍描述 `map.js`、`pins.js` 與六個 feature，但實際結構已改變。

這不只是文件美化：錯誤規範會讓人或 AI 在後續開發重新加入已退役行為，因此應優先修正。

## 對 Claude 共同方案的進一步修正

### 1. 第一個容器化試點只做 MessagesPage

Claude 建議第一批同時處理 Messages 與 Me，但兩者風險並不相同：

- `MessagesPage.tsx` 約 121 行，互動與資料面較小。
- `MePage.tsx` 約 800 行，包含登入、個人檔案、球友目錄、位置、通知、球場訂閱、封鎖名單與身分連結。

因此第一個試點應只做 Messages：

1. 驗證 React 直接訂閱 store 的方式。
2. 驗證 controller action 注入方式。
3. 驗證能否移除該頁 options bag、portal slot 與同步 adapter。
4. 測量實際減少的檔案、測試與 bundle 變化。
5. 試點驗收後，才決定 Me 或 NearbyDrawer 誰是第二個。

這能避免第一批同時處理架構樣板與最複雜設定頁。

### 2. 避免建立一個巨大的 ControllerProvider

把全部 controller API 與 stores 放進單一 React context，可能只是把 props drilling 換成隱藏的 service locator。

推薦使用功能限定的 typed capability：

```text
AppServicesProvider
  ├── 穩定的 controller/store 實例
  └── feature hooks
       ├── useMessagesState()
       ├── useMessagesActions()
       ├── useProfileState()
       ├── useProfileActions()
       └── useDiscoveryActions()
```

原則：

- 頁面只看到自己需要的 selector 與 action。
- 不讓任何元件任意取得完整 controller。
- hook 的回傳型別就是功能契約。
- controller 仍負責 auth、stale request 與 lifecycle；hook 只負責接線。

### 3. 文件批與產品 CSS 變更分開

README、CLAUDE.md、session.css 過時註解屬文件真實性修正；`#9db3a4` token 化會改變產品 CSS 來源與對比契約。

即使計算色彩不變，仍應分成獨立小批，執行：

- contrast token tests。
- desktop/mobile screenshot comparison。
- build 與 CSS bundle gate。

不要在文件批中「順手」修改產品樣式。

### 4. TanStack Query spike 不應先放寬 bundle gate

現行主 bundle 距 gzip gate 只剩 1,088 B，這代表新增依賴需要小心，但不代表 spike 前要先放寬預算。

正確順序：

1. 保持現有 gate。
2. 在 spike 分支導入最小範圍。
3. 計算新增套件與被刪手寫程式的淨差異。
4. 確認它落在 main、lazy private chunk 或其他 chunk。
5. 只有 spike 的複雜度收益成立、且體積無法被抵銷時，才由產品負責人決定是否重新設定 gate。

現在沒有觸發 TanStack Query spike 的產品需求，因此不排入近期工作。

### 5. 數字應是觀察指標，不是新的硬封條

以下數字適合用來觀察趨勢：

- `main.js` 是否明顯縮小。
- `__importAppModule` 是否持續下降。
- legacy JS 是否持續減少。
- 新功能需要修改的接線檔案是否減少。
- 大型 page/sheet 是否更容易單獨理解。

不應直接寫成 fail-closed test：

- `main.js ≤300`。
- 每個 page `<400` 行。
- 每個新功能只能改 `≤3` 檔。
- legacy JS `<500` 行。

否則團隊可能為了通過數字而塞檔、拆出無意義 wrapper，重複目前白箱測試的問題。

真正的硬 gate 應是：

- TypeScript、Lint、build 通過。
- 隱私與 data boundary 測試通過。
- Auth identity 與 stale request 行為不退步。
- Focus、Escape、sheet restore 行為不退步。
- Production bundle gate 不被任意放寬。
- 使用者流程 Playwright 通過。

### 6. 「桌面中間態」不是零風險

桌面 max-width 或置中可能降低全幅地圖的可用面積，也可能改變控制項位置與 Maps viewport bounds。

因此可列為低風險設計候選，但仍要：

- 先做 wireframe 或 mockup。
- 驗證地圖可視面積。
- 檢查 drawer、控制項與底部導覽的位置。
- 用 Analytics 決定是否值得實作。

## 修正版目標架構

```text
main.ts
  ├── 建立 controller 與 stores
  ├── 啟動 public discovery / auth / map
  └── mount React App

React AppShell
  ├── typed app services
  ├── route/page ownership
  ├── topbar / navigation / toast
  ├── surface stack
  └── feature-specific state/action hooks

Controller layer
  ├── auth identity
  ├── request gates
  ├── lifecycle orchestration
  └── authoritative refresh

Data layer
  └── dataApi → repositories/mappers → Supabase
```

狀態分工：

- React local state：表單草稿、popover、區段展開等局部 UI。
- App UI state：route、sheet stack、toast、全站導覽狀態。
- Controller store：server-derived state、auth identity、lifecycle 與 refresh。
- URL：可分享與可回復的 route state。
- Supabase：最終資料權威。

每一份狀態只能有一個權威來源。

## 修正版執行順序

### 批 0：文件真實性

- 更新 README：群組聊天取代 LINE 聯絡交換。
- 品牌名稱對齊「球咖」。
- 更新專案地圖。
- 更新 CLAUDE.md：`map.ts`、`pins.ts`、10 個 features、controller/pages/sheets/views。
- 修正 session.css 過時檔頭。

限制：只改文件與註解，不改產品 CSS 計算值。

### 批 0.5：新碼邊界決策

以 ADR 或架構規則記錄：

- 不新增 React-to-legacy portal adapter。
- 不新增需要同步 DOM commit 才能工作的公開 adapter。
- 不新增未受型別檢查的核心 controller。
- native browser/Maps event listener 仍可使用；禁止的是為 legacy DOM bridge 新增的 listener。

### 批 1：Messages-only 容器化試點

- Messages page 直接訂閱 feature selector。
- 透過 typed message actions 呼叫 controller。
- 移除 Messages 的 options bag 與 page adapter。
- 保留既有 route、focus、error boundary、data-testid 與 lazy loading。
- 同批退役只為 Messages adapter 存在的白箱測試。

驗收後必須回答：

- 接線是否真的變少？
- context/hook 是否隱藏了依賴？
- bundle 是否增加？
- 測試是否更接近使用者行為？
- 此模式是否適合複製到其他頁？

### 批 2：選擇第二個頁面

依批 1 結果，在以下選一個，不預先綁死：

- Me：驗證高 callback、高設定密度頁面。
- NearbyDrawer：驗證 focus intent 與高頻 store 更新。
- MySessions：驗證最大 action surface 與生命週期。

一次只遷移一種新複雜度。

### 批 3：頁面 ownership 收斂

- 逐頁移除 page slot、snapshot options 與 renderXInApp adapter。
- React AppShell 直接擁有主頁面。
- 保留 controller/store 作為 server state 權威。

### 批 4：Sheet shell React 化

- 把 focus trap、Escape、stack 與 restore metadata 遷入 React surface system。
- 一次遷移一類 surface。
- 原有 DOM、aria、testid 與焦點行為是凍結契約。
- 不在此批改 UX 或改成「詳情取代 drawer」。

### 批 5：同步 commit 降級

- Adapter 消失到足夠程度後，逐個移除三個 `syncCommit` caller。
- 每移除一個，都用原始 race/focus 測試驗證。
- 不以「一定歸零」壓過正確性；若某個 browser integration 確實需要同步語意，要寫明原因與範圍。

### 批 6：核心 TypeScript 化與大檔拆分

- 優先轉換仍存在的 orchestration contract。
- 拆分已穩定介面的 presentation、form section 與 feature component。
- 不為行數而拆檔。
- 逐步恢復 type-aware ESLint 規則。

### 可獨立插入的小批

- 修正手機 chips：固定完整「篩選」入口，其餘 quick filters 橫向捲動。
- 匿名 My Sessions 只顯示單一登入引導。
- 把 `#9db3a4` 等重複色票收成 token，但與文件批分開。
- 簡化 session card 的 screen-reader accessible name。

### 等資料或觸發條件

- 桌面雙欄：等裝置比例與使用數據。
- 詳情取代 drawer：併入桌面雙欄與 focus contract 重設。
- TanStack Query：等 cache invalidation 或 optimistic update 問題實際出現。
- 匿名輕量 REST client：只有真實效能數據指出 Supabase SDK 是首屏瓶頸時才做 spike。

## 白箱測試處置原則

### 保留

- Supabase/dataApi 邊界。
- 公開欄位 allowlist。
- production mock 排除。
- bundle 棘輪。
- WCAG 對比實算。
- 安全標頭與錯誤 payload allowlist。
- focus、Escape、surface restore 等使用者行為。

### 隨 adapter 退役而移除或改寫

- module path 字面掃描。
- facade export 清單鏡像。
- portal consumer 計數。
- `__importAppModule` 直呼。
- 只為固定檔案位置或格式存在的斷言。

原則不是「刪白箱測試」，而是把它們改成保護真正不變量的測試。

## 框架與套件裁決

| 選項 | 現在的判定 | 重評條件 |
| --- | --- | --- |
| Vite + React 19 | 保留 | 無 |
| 自製 hash router | 保留 | nested route 或公開 SEO 頁面明顯增加 |
| 自製 controller store | 保留 | 無法再清楚區分 channel，或出現重複狀態 bug |
| TanStack Query | 不導入 | cache invalidation／optimistic update 問題重複出現 |
| React Router | 不導入 | route 數量與巢狀關係顯著增加 |
| Redux／Zustand | 不導入 | 現有 store 無法表達新需求且有具體證據 |
| Next.js／Remix | 不改寫 | 大量公開 SEO 頁面成為核心產品需求 |
| Tailwind | 不導入 | 現有 token/BEM 無法管理元件庫規模 |
| CSS Modules／@layer | 延後評估 | adapter 與白箱測試瘦身後 |

## 需要產品負責人決定的事項

1. 是否核准文件真實批與新碼邊界 ADR。
2. 第一個容器化試點是否採 Messages-only。
3. 哪些現有白箱測試有不可放棄的治理目的。
4. 桌面雙欄需要多少桌面使用比例才啟動。
5. 未來是否計畫大量公開、可被搜尋引擎索引的球局頁。
6. 若未來新依賴確有收益，bundle gate 是否允許重新設定，以及由誰批准。

## 最終建議

最安全且收益最高的路徑是：

```text
先修文件真實性
→ 禁止新增遷移期 bridge
→ 用 Messages 做單頁 React ownership 試點
→ 驗收模式後逐頁擴大
→ 最後遷移 sheet shell 與移除同步 commit
→ 再做 TypeScript 與大檔收尾
```

不要把共同分析直接變成大型重構專案。先用一個低風險頁面證明新邊界確實讓接線更少、測試更接近使用者行為，再決定後續批次。這比一次性改框架、搬目錄或拆完所有大檔更可控。
