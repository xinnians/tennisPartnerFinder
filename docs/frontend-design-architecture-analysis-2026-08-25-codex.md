# 前端設計與架構分析（Codex）

- 日期：2026-08-25
- 專案：球咖｜台北市網球
- 分析者：Codex
- 目的：記錄目前前端設計與程式架構的判斷，供後續與 Claude 的獨立分析比較
- 本次範圍：只分析，不修改產品程式

## 一句話結論

這不是一個品質差的專案，而是一個「React 遷移成功，但新舊架構交界尚未完全拆除」的專案。

目前視覺設計、隱私邊界與測試安全網都很成熟；真正拖慢後續開發的，是 React state、模組外 snapshot、controller store、legacy DOM 與 portal 同時存在。下一步最值得做的不是重寫成另一套框架，而是完成 React ownership，讓 React 真正接管頁面、導覽與 sheet。

## 分析範圍與方法

本次檢查包含：

- `src/` 目錄、依賴、Vite 與 TypeScript 設定。
- App root、頁面、sheet、controller、feature、store 與 data repository。
- CSS token、響應式、導覽、抽屜與主要視覺語彙。
- 390 × 844 手機版與預設桌面 viewport 的本機 mock 畫面。
- 找球局、附近球局、球局詳情、我的球局、訊息、我等主要匿名流程。
- TypeScript、ESLint、production build、bundle gate、npm audit 與 mock Playwright 測試。
- 既有前端架構分析、執行報告與 2026-08-25 路線圖，避免重複提出已完成項目。

本次沒有執行：

- 本機 Supabase database test 與真實 OAuth 流程。
- 真實 Google Maps API 畫面；本機檢查使用既有地圖不可用降級狀態。
- 正式環境資料或效能量測。

## 驗證結果

| 項目 | 結果 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run check:production-bundle` | PASS |
| `npm run test:mock` | 286 passed、4 skipped、0 failed |
| `npm audit --omit=dev` | 0 vulnerabilities |
| 完整 `npm audit` | 2 個 high，皆在開發工具鏈的間接依賴 |
| Git working tree | 分析結束時 clean |

正式 build 的主要數字：

- 主 JavaScript：654.84 KB，gzip 191.33 KB。
- CSS：65.87 KB，gzip 10.86 KB。
- 總 JavaScript：841.95 KB，gzip 256.55 KB。
- 主 bundle 仍有 Vite 的 500 KB 警告，且距專案現行 gzip gate 只剩約 1 KB。

## 目前真正的架構

```text
index.html
   ↓
main.js
全站接線、導覽、Auth、Maps、頁面 mount
   ↓
sessionController.js
組裝 discovery、auth、intent、chat、lifecycle 等 controllers
   ↓
sessionStore.ts + pageViewStore
   ↓
App.tsx / React pages / React sheets
   ↓ createPortal
legacy page、sheet 與 dialog 容器

dataApi.js
   ↓
repositories + mappers + generated database types
   ↓
Supabase view / RPC
```

白話來說，React 已負責大部分畫面，但「何時更新、資料如何刷新、要開哪個 sheet」仍多由舊 JavaScript 控制。React 像是已換上的新引擎，但方向盤和部分電路仍沿用舊系統。

## 做得好的地方

### 1. 視覺有自己的性格

深綠、螢光黃、計分板、時間磚、NTRP 數據磚與窄體英文標籤，都直接來自網球與賽事語彙。這不是一般 SaaS 模板，品牌辨識度高，建議保留。

### 2. 手機版操作成熟

- 主要操作都符合至少 44px 觸控尺寸。
- 底部導覽清楚，中央「開球局」是明確主操作。
- Sheet、drawer、焦點回復、Escape、空狀態都有測試。
- 390px 沒有整頁水平溢位。

### 3. 資料與隱私邊界清楚

- `dataApi.js` 是瀏覽器資料入口。
- repository 有欄位白名單與 mapper。
- Supabase 生成型別已接入 strict TypeScript 區域。
- 公開資料、私人資料、聊天室與位置資料的邊界都有測試保護。

### 4. 測試是專案強項

測試不只檢查 happy path，也處理：

- request race 與 stale response。
- focus trap 與焦點回復。
- Sheet 疊層與 Escape 優先順序。
- 權限改變後的 authoritative refresh。
- bundle、production mock 排除與資料欄位限制。

### 5. 遷移方式穩健

專案沒有一次性重寫，而是逐頁遷入 React，同時保留可回歸的契約。這個策略讓產品可持續交付，是合理且成功的做法。

## 主要問題與建議

### P1：React 與 legacy 雙軌仍是最大維護成本

現況：

- `App.tsx` 有模組外 `snapshot`。
- React component 自己也有 state。
- controller 另有 `sessionStore`。
- `main.js` 仍負責 mount 與頁面切換。
- `App.tsx` 透過 portal 掛回 legacy 容器。
- `sessionViews.js` 再透過相容 adapter 呼叫 React export。
- 原生事件需要依賴同步 commit 後再綁定。

影響：

- 同一份狀態可能有多個來源。
- 新功能需要理解 React、controller、adapter、surface registry 四層。
- 很容易產生「畫面看起來更新了，但舊 listener 或 controller metadata 沒更新」的問題。
- 測試必須大量處理實作細節，重構成本持續升高。

建議：

1. 讓 `App` 直接擁有主頁面、topbar、bottom navigation、drawer 與 sheet root。
2. 新功能禁止再新增 portal-to-legacy 或 native listener adapter。
3. 逐個 surface 把 open/close 改成 React state 或單一 UI store。
4. 最後移除 `sessionViews` 的 React bridge、`syncCommit` 與 page slot 機制。

### P1：多個超大檔案同時負責太多事情

主要檔案行數：

| 檔案 | 約略行數 |
| --- | ---: |
| `src/app/App.tsx` | 957 |
| `src/pages/MySessionsPage.tsx` | 853 |
| `src/sheets/SessionDetailSheet.tsx` | 835 |
| `src/sheets/CreateSessionSheet.tsx` | 823 |
| `src/main.js` | 806 |
| `src/pages/MePage.tsx` | 800 |
| `src/sessionPresentation.ts` | 768 |
| `src/sessionController.js` | 711 |

建議依功能拆分，而不是只依「page」拆分。例如：

```text
features/sessions/
  detail/
    SessionDetailSheet.tsx
    SessionDetailActions.tsx
    SessionScoreboard.tsx
    useSessionDetail.ts
  create/
    CreateSessionSheet.tsx
    VenueStep.tsx
    ScheduleStep.tsx
    createSessionForm.ts
  my-sessions/
    MySessionsPage.tsx
    NeedsActionSection.tsx
    UpcomingSection.tsx
    HistorySection.tsx
```

每個模組應能用一句話回答：「它負責什麼、怎麼用、依賴什麼」。

### P1：存量 JavaScript 沒有真正被 TypeScript 檢查

`tsconfig` 雖然 `allowJs: true`，但 `checkJs: false`。因此 TSX 很嚴格，核心 `main.js`、controller 與部分 feature 卻仍靠人工維持契約。

建議轉換順序：

1. `main.js` 的 route、mount options 與 app adapters。
2. `sessionController.js` 公開 API。
3. `sessionViews.js` 剩餘 adapter。
4. profile、presence、filter 等較小 feature。

不建議一次全改；應以「一個功能垂直切片」為單位轉換。

### P1：CSS 拆檔後仍依賴固定載入順序

目前 13 個全域 CSS 檔案的 import 順序就是層疊順序，調換可能靜默改變畫面。這比過去單一大檔好，但仍不是穩定邊界。

建議分兩階段：

第一階段：

- 把 token 移到獨立 `styles/tokens.css`。
- 基礎 reset、layout、component vocabulary 與 feature styles 分開。
- 新元件禁止依靠另一個 feature CSS 的載入順序才能正確顯示。

第二階段：

- 在既有凍結測試放寬後，評估 CSS Modules 或 `@layer`。
- 不需要立刻導入 Tailwind；目前 BEM 與 token 已足夠，只是所有權需要更清楚。

### P1：部分測試過度鎖定內部實作

現有測試會檢查檔案長度、選擇器字面、匯入位置、consumer 數量與 module path。這些測試在遷移期很有價值，但遷移完成後會變成重構阻力。

建議：

- 保留隱私、欄位白名單、bundle 與可及性 fail-closed gate。
- 把純內部形狀測試逐步換成 component contract 或使用者行為測試。
- 每刪掉一段 adapter，就同步刪掉只為 adapter 存在的白箱測試。
- 不要為了讓測試不變而永久保留不合理的檔案組合。

### P2：主 bundle 已接近現行上限

目前 lazy splitting 已經做過，私人 repository、頁面與多個 sheet 都有獨立 chunk。剩餘主 bundle 很大一部分是 React 與 Supabase 合法 eager 依賴，不能只靠 `manualChunks` 真正減少下載量。

建議：

- 不要只為消除 Vite 500 KB warning 而拆 chunk。
- 新增 TanStack Query、Router 或大型 UI library 前先量 bundle。
- 評估匿名首頁是否能使用較輕的 REST discovery client，登入或私人操作時再載入完整 Supabase SDK；這需要 spike 驗證，不能直接實作。
- 以真實 LCP、interaction delay 與慢網路資料決定是否值得增加複雜度。

### P2：README 與目前產品規則不一致

`README.md` 仍說 accepted 後可互看 LINE，但目前前端聯絡面已退役，改成球局群組聊天。

影響：

- 新開發者可能依錯誤文件重新加入已退役功能。
- Claude 或其他分析工具可能被 README 誤導。

建議優先修正，並讓 README 只保留目前有效流程，歷史決策移至 archived 文件。

## 實際視覺與互動觀察

### 值得保留

- 品牌標誌、城市 chip 與比分板式資訊層級。
- 深色底部導覽和螢光黃主操作。
- Session card 的時間、場地、缺額閱讀順序。
- Sheet 內的 44px 操作與清楚的成功／失敗文案。
- 空狀態用行動引導，而不是只有裝飾插圖。

### 建議改善

#### 1. 手機篩選列的可發現性

390px 時 toolbar client width 約 366px，內容 scroll width 約 463px。水平滑動本身不是 bug，而且已有測試，但初次畫面看不到最右側篩選按鈕，也沒有提示後面還有內容。

可選方案：

- 最右側加入淡出漸層或半露出的 chip。
- 把「篩選」固定在右側，其餘 quick filters 橫向捲動。
- 第一次使用時顯示一次短暫滑動提示。

推薦固定「篩選」按鈕，其餘 quick filters 滾動，因為完整篩選入口不應被藏住。

#### 2. 桌面版空間利用率低

桌面仍採手機 bottom sheet，列表只佔畫面中央小區域，地圖兩側有大量空白。

建議桌面寬度足夠時改為：

```text
┌───────────────────────────────┬──────────────────┐
│                               │ 附近球局／詳情   │
│            地圖               │ 固定側欄         │
│                               │                  │
└───────────────────────────────┴──────────────────┘
```

手機維持 bottom sheet，桌面使用右側固定欄。是否優先實作可參考 Analytics 裝置比例。

#### 3. Sheet 層級偏重

打開球局詳情時，附近球局 drawer 仍在底下，詳情 sheet 再覆蓋一層。功能與 focus contract 正常，但視覺上同時存在兩張白色 sheet，層級較重。

建議讓詳情取代 drawer 內容，關閉後再回復列表與原卡片焦點；桌面版則可直接在右側欄切換列表／詳情。

#### 4. 匿名「我的球局」資訊重複

未登入時已出現登入說明，但下方仍顯示「需要你處理、即將打球、過去紀錄」三個全空區塊。

建議匿名時只顯示一個登入引導；登入且資料載入完成後再出現三個區段。

## 建議的目標架構

```text
src/
  app/
    App.tsx
    AppRouter.tsx
    AppProviders.tsx
    AppShell.tsx
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
    notifications/
    player-directory/
  shared/
    ui/
    styles/
    lib/
    types/
  data/
    repositories/
    mappers/
    databaseTypes.ts
```

建議的狀態分工：

- React local state：popover、表單欄位、區段展開等局部 UI。
- App-level UI state：目前頁面、開啟中的 sheet、toast。
- Server state：球局、profile、roster、chat、directory 與 polling。
- Supabase repository：唯一資料讀寫邊界，繼續保留。

重點不是一定要換狀態套件，而是每份狀態只能有一個權威來源。

## 框架選擇

### 方案 A：保留 Vite + React 19，完成架構收尾（推薦）

做法：

- 保留現有 build、部署與 Supabase 邊界。
- 完成 React ownership。
- 按 feature 垂直拆分。
- 逐步移除 adapter 與 legacy DOM。

優點：

- 風險最低。
- 能保留現有測試與功能。
- 不需要重做 Google Maps、Auth 與 push。
- 直接處理真正問題，而不是搬家。

缺點：

- 過渡期需要一段時間。
- 必須嚴格禁止新增 legacy pattern，否則收尾永遠不會完成。

### 方案 B：Vite + React Router + TanStack Query

適用條件：

- 頁面和 nested route 繼續增加。
- polling、cache invalidation、loading/error state 的手寫成本持續上升。
- 有能力先移除足夠舊碼，抵銷新增依賴的 bundle 成本。

建議：

- React Router 暫時不是必要條件；目前四分頁與 session hash router 仍可維護。
- TanStack Query 比 Router 更可能帶來實質效益，因為專案已有多套 request gate、poller 與 authoritative refresh。
- 若導入 TanStack Query，只用它管理 server state；不要把表單與所有 UI state 都塞進 query cache。
- 導入前必須做 bundle 與 auth identity 切換 spike。

### 方案 C：改寫成 Next.js 或 Remix（目前不推薦）

原因：

- 產品是地圖優先、高互動、主要在登入後操作的 SPA。
- SSR 對目前主要流程幫助有限。
- 會增加 Google Maps client boundary、Supabase Auth、service worker、push 與部署設定複雜度。
- 重寫期間很容易失去目前成熟的 focus、race condition 與隱私測試。

只有未來需要大量可被搜尋引擎索引的公開球局頁、內容頁或多城市 landing page，才值得重新評估 SSR。也可以先做獨立公開 landing，而不是整個 App 換框架。

## 建議執行順序

### 第一階段：低風險收斂

1. 修正 README 與產品規則不一致。
2. 建立 feature 目錄規則與新碼邊界。
3. 拆分 `MySessionsPage`、`MePage`、`SessionDetailSheet`、`CreateSessionSheet`。
4. 把純 presentation 函式按功能拆開。
5. 新增規則：不得增加新的 portal-to-legacy、native listener 或未檢查 JS controller。

### 第二階段：React ownership

1. App 直接管理主路由與 page render。
2. App 直接管理 topbar、bottom navigation、drawer 與 sheet stack。
3. Surface registry 只保留必要的 focus metadata，或收斂成 React context/store。
4. 移除 page slot、`syncCommit` 與 bridge export。
5. 刪除對應白箱測試，保留行為測試。

### 第三階段：資料狀態簡化

1. 盤點每個 request gate、poller 與 refresh 的實際用途。
2. 先挑 discovery 或 chat 做 TanStack Query spike，不直接全站導入。
3. 驗證 auth identity 切換、cache 清除、stale request 與 bundle。
4. 只有 spike 確實減少複雜度才擴大使用。

### 第四階段：版面優化

1. 手機篩選入口固定或加入可滑動提示。
2. 匿名 My Sessions 簡化。
3. 詳情取代底層 drawer。
4. 有足夠桌面流量後導入地圖＋側欄雙欄版。

## 建議的完成標準

架構優化不應只以「檔案搬完」判定完成，可用以下指標：

- App 只有一個 UI state 權威來源。
- 主頁與 sheet 不再透過 portal 掛入 legacy page 容器。
- `main.js` 不再負責 render 或 mount React 頁面。
- 新功能不需要修改 `main + controller + sessionViews + App` 四層才完成。
- 主要 page/sheet 檔案控制在可一次理解的範圍，建議低於約 400 行。
- 白箱 module-path 測試明顯減少，使用者行為測試維持或增加。
- bundle、隱私、focus 與 race condition gate 不退步。
- 390px 與桌面版都有清楚且不重疊的資訊層級。

## 給 Claude 分析後的比較檢核表

建議先讓 Claude 在不閱讀本文件的情況下完成獨立分析，再比較以下問題：

1. Claude 是否也把 React／legacy 雙軌列為首要問題？
2. Claude 認為最大狀態問題是 controller、store、snapshot，還是其他位置？
3. Claude 是否建議換框架？若建議，具體解決哪個現有問題？
4. Claude 是否有評估主 bundle 只剩約 1 KB gate 空間？
5. Claude 是否保留 `dataApi → repository → Supabase` 邊界？
6. Claude 如何處理 request gate、poller、auth identity 與 stale response？
7. Claude 是否注意到 CSS import order 與白箱測試對重構的限制？
8. Claude 是否認為桌面雙欄應立即做，還是等待 Analytics？
9. Claude 是否發現 README 的 LINE 流程已過期？
10. Claude 的方案是否能逐步落地，還是需要長時間停止產品開發？

比較時建議以四個標準評分：

| 標準 | 要問的問題 |
| --- | --- |
| 問題命中率 | 是否處理真實痛點，而不是泛用建議？ |
| 落地風險 | 能否保留現有測試、隱私與功能？ |
| 複雜度收益 | 新增的框架或抽象是否真的讓總複雜度下降？ |
| 驗證方式 | 是否提出可量測、可回歸的完成標準？ |

## 最終建議

優先選擇方案 A：保留 Vite + React 19，完成 React ownership 與 feature 化。等相容層縮小、bundle 有空間後，再用小型 spike 評估 TanStack Query；不要先換 Next.js，也不要先加 Redux、Tailwind 或大型 UI framework。

這個專案目前最需要的不是另一個框架，而是更少的權威來源、更清楚的功能邊界，以及讓已成功的 React 遷移真正結束。
