# 前端架構現況分析與優化建議（React + TypeScript 調整後）

日期：2026-08-21  
分析者：Codex  
分析基準：本機 `claude/tennis-partner-finder-proto-xfrr6g` 分支，HEAD `dd13c51`

## 一句話結論

這次 React + TypeScript 調整是成功的，但目前完成的是「畫面層遷移」，還不是完整 React 架構。

白話來說：React 已負責大部分頁面與 Sheet 的畫面，但整個 App 的流程、登入、資料、地圖與
畫面開關，仍主要由舊 JavaScript 控制。

目前功能穩定、測試很強；下一階段不應繼續盲目搬 TSX，而是要處理核心型別、單一 React root、
大型 Controller 與 bundle。

## 1. 本次檢查範圍

- `src/` 的 JS、TS、TSX 與 CSS 結構。
- React root、`flushSync`、eager import 與 legacy DOM 混用方式。
- `main.js`、`sessionController.js`、`sessionViews.js`、`dataApi.js` 的責任。
- TypeScript、ESLint、資料存取與 Supabase 邊界。
- 最近 batches 24–28 的修正與獨立驗收報告。
- Git 分支、設計系統、錯誤處理、安全標頭與本機依賴狀態。

本次實際重跑：

```text
npm run typecheck           通過
npm run lint                通過
npm run test:session-unit   276 / 276 通過
git diff --check            通過
```

最近完整 gate 紀錄在 `docs/migration-reports/batch-28.md`，包含 Chromium、build、pgTAP 與
production bundle gate。本次沒有重新執行 hosted OAuth、真實 Google Maps、Push 或正式部署驗證。

## 2. 目前完成度

| 項目 | 現況 |
| --- | --- |
| React UI | 21 個 TSX 模組，包含 4 個頁面、14 個 Sheet／Dialog、3 個共用元件 |
| TypeScript | 6 個 `.ts`、21 個 `.tsx`，約 6,947 行 |
| JavaScript | 24 個 `.js`，約 9,406 行 |
| 型別覆蓋 | 依 JS／TS／TSX 程式行數約 42.5% |
| 核心 JS | 四個最大核心檔共 7,291 行，占全部 JS 約 77.5% |
| React root | 測試契約涵蓋 18 個 root |
| `flushSync()` | 約 30 個呼叫點 |
| eager React imports | `sessionViews.js` 有 18 個 eager `import.meta.glob` |
| 主 bundle | 714.34 kB，gzip 200.64 kB |
| 單元測試 | 276 通過 |
| Chromium mock e2e | 最近完整 gate：266 通過／4 跳過 |
| Supabase pgTAP | 最近完整 gate：799 通過 |
| WebKit | 三輪基準 126 通過／6 個穩定失敗／3 跳過；另有 1 個負載相依訊號 |

## 3. 現在真正的架構

```text
index.html
   ↓
main.js
登入、導覽、地圖、通知、全站接線、33 個頂層狀態
   ↓
sessionController.js
球局流程、請求競速、輪詢、Surface 狀態
   ↓
sessionStore.ts
小型自製 Store
   ↓
sessionViews.js
舊介面相容層、事件綁定、React 掛載
   ↓
18 個分散的 React root
   ↓
TSX 頁面與 Sheet

資料路徑：
Controller／main → dataApi.js → Supabase View／RPC
```

React 現在比較像嵌在舊 JavaScript 系統裡的畫面引擎，而不是整個應用程式的唯一 owner。

## 4. 已經做得好的地方

### 4.1 React 相依循環已解除

先前 14 個 TSX 會反向 import `sessionViews.js`。目前已改成：

```text
TSX → sessionPresentation.ts
sessionViews.js → sessionPresentation.ts
```

全部 TSX 都有遞迴靜態 gate，禁止重新建立對 `sessionViews.js` 的反向依賴。

### 4.2 React 程式品質不錯

- strict TypeScript。
- 沒有 explicit `any`、`@ts-ignore` 或 `dangerouslySetInnerHTML`。
- 幾乎沒有使用 `useEffect`，互動行為直接放在事件處理器。
- 關鍵子樹有合理的 `memo`、lazy `useState` initializer 與 stable callback。
- React surface 有 Error Boundary、正式 unmount 與非同步 stale commit 防護。

### 4.3 資料與隱私邊界很強

- `dataApi.js` 是唯一 Supabase `.from()`／`.rpc()` 的產品程式入口。
- 公開與登入後資料使用明確 select allowlist。
- raw sessions、profiles、chat 與 block tables 沒有被其他 browser source 直接存取。
- production build 會用空模組取代 mock data，並掃描產物是否殘留 demo 暱稱。
- Supabase RLS／RPC 契約有大量 pgTAP 測試。

### 4.4 測試是專案最大強項

測試不只驗功能，也驗：

- 隱私欄位與 Supabase 邊界。
- 焦點、Escape、Tab trap 與 drawer/sheet ownership。
- React unmount、Error Boundary 與 stale async result。
- CSS token、對比與 legacy style 殘留。
- CI job 是否可被誤改成 non-blocking。
- 新增 unit test 是否漏登記。
- WebKit 與 Chromium 的測試分流。

### 4.5 CSS 拆分與設計語彙已有基礎

原本的大型 CSS 已依地圖、頁面、Surface、導覽、響應式與動效拆成 13 個檔案。色彩、間距、
字級與元件語彙已有 token 和 `ds-bundle` 文件。

## 5. 主要問題與風險

### P0：程式尚未整合進 main

本機 ref 顯示目前 HEAD 比 `main` 多 74 個 commit；本機又比遠端工作分支多 2 個
design-sync commit。

因此這份報告分析的是「目前工作分支」，不能直接代表 production。正式 OAuth、Maps、Push、
CSP 與部署狀態必須在 REL 流程另外驗證。

### P0：本機 `node_modules` 有異常自我連結

目前存在：

```text
node_modules/node_modules -> /Users/ian/tennisPartnerFinder/node_modules
```

這會讓 `npm ls --depth=0` 誤報所有 dependency missing；但實際 React、TypeScript、Playwright、
typecheck、lint 與單元測試仍可執行。

這是被 `.gitignore` 忽略的本機環境問題，不是版本庫原始碼問題。建議後續移除該精確 symlink，
再執行 `npm ci` 重建依賴。

### P1：最重要的核心程式仍沒有型別保護

| 檔案 | 行數 | 主要責任 |
| --- | ---: | --- |
| `sessionController.js` | 2,480 | 球局生命週期、輪詢、競速、Surface 狀態 |
| `sessionViews.js` | 2,053 | legacy adapter、事件與 React mount |
| `main.js` | 1,580 | App bootstrap、auth、navigation、Maps、通知 |
| `dataApi.js` | 1,178 | Supabase mapper、query、RPC、auth API |

`tsconfig.json` 雖然是 `strict: true`，但同時是：

```json
"allowJs": true,
"checkJs": false
```

因此 TypeScript 最需要保護的資料契約、登入與球局流程，反而沒有被檢查。TSX 也會直接 import
部分未檢查的 JS helper，使畫面看起來是 strict，邊界實際仍可能流入弱型別。

另外 `domainTypes.ts` 的 `status`、`joinMode`、`venueType`、`playType` 等欄位仍大量使用一般
`string`，尚未收斂成 literal union 或資料庫生成型別。

### P1：React 仍是「嵌入舊系統的畫面引擎」

現在有 18 個分散 root、30 個 `flushSync()`，部分頁面更新會用 generation key 重建子樹。

這在遷移期是合理且安全的，但長期會造成：

- root 與生命週期難以追蹤。
- React batching、transition 與正常 reconciliation 難以發揮。
- 焦點、捲動與非同步狀態需要大量手工協調。
- imperative adapter 與 React 可能同時認為自己擁有同一段 DOM。

批 24 修復的 archived chat `removeChild` 回歸，就是兩個 owner 同時操作節點的實例。修法正確，
但也證明這個混用邊界仍需逐步收斂。

### P1：主 bundle 太大，而且無法直接一行改成 lazy

`sessionViews.js` 有 18 個：

```js
import.meta.glob("...", { eager: true })
```

所以所有頁面與 Sheet 都會跟首頁一起進主 chunk，主 JS 約 714 kB，Vite 已警告超過 500 kB。

但不能只刪掉 `eager: true`：目前 adapter 的公開 API 是同步的，開啟 Sheet、DOM commit 與焦點
還原都假設 mount function 立即存在。直接 lazy loading 會改變行為契約。

較安全的順序是：

1. 先建立可等待的畫面載入邊界，或建立單一 React App root。
2. 再將「我／訊息／我的球局」與非首頁 Sheet 改成動態 import。
3. 對 hover、focus、登入完成等高機率下一步做 preload。
4. 加 bundle size gate，避免主 chunk 再長回去。

### P1：狀態有兩個主要 owner

`main.js` 有 33 個頂層 `let`；`sessionController` 內又有 Store。auth、profile、courts 等資料會在
main 與 Controller 之間同步。

現在依靠 auth epoch、request gate 與大量測試維持正確，但長期容易出現：

- 一邊更新，另一邊忘記更新。
- 登出或切換帳號後殘留上一個帳號資料。
- 較舊的非同步請求覆蓋較新的狀態。
- 隱藏頁面保留過期的 private DOM。

### P1：`sessionPresentation.ts` 責任正在變大

循環依賴已解決，但 `sessionPresentation.ts` 已有約 759 行，除了純文字／view model，也 import
`sessionActions.js` 並把 DOM action 放進 runtime object。

短期能維持相容；長期建議拆成：

```text
presentation/   純格式化與 view model
ui-actions/     DOM／焦點／pending action bridge
contracts/      React adapter 型別
```

避免新的「presentation 大總管」取代舊 `sessionViews.js`。

### P1：錯誤 UI 已有，但正式監控尚未接線

Error Boundary 與全域錯誤提示已完成，並有隱私 allowlist；但 `appErrors.ts` 的 production
transport 目前仍是 NOOP。

結果是使用者會看到錯誤提示，團隊卻未必收到錯誤。正式上線前可接 Sentry 或其他 transport，
但只能傳目前核可的固定欄位，不可傳 raw message、stack 中的敏感資料、暱稱、聊天或位置。

### P2：安全標頭尚未完成 enforcing 階段

`vercel.json` 已有 CSP、nosniff、frame、referrer 與 permissions policy，但 CSP 仍是
Report-Only，並因 Google Maps 包含 `unsafe-inline`／`unsafe-eval`。

這是合理的第一階段；下一步必須先在 preview 觀察違規，再分階段切 enforcing，不應直接在
未驗證情況下強制啟用。

### P2：設計系統目前仍是複製品

`ds-bundle` 是 HTML＋CSS 展示包，不是產品實際 import 的 React component library。它會複製
正式樣式，而且 `.design-sync/NOTES.md` 已記錄多輪人工校正。

目前可以使用，但長期有 drift 風險。建議讓 token／CSS bundle 從 `src` 自動產生，或在真正需要
跨頁面重用 React UI 時，建立共用元件展示與視覺回歸流程。

### P2：CSS 仍依賴 import 順序

13 個 CSS 檔雖已拆開，但勝負仍依靠 `main.js` 的 import 順序。任何人調換順序，都可能靜默改變
同 specificity selector 的結果。

短期先鎖住順序；新 feature 可以逐步使用 CSS `@layer`、feature namespace 或 CSS Module。

### P2：WebKit 仍有六條穩定差異

目前六條主要是 Safari／iOS 的程式化焦點與觸控 click 後 focus 模型差異；另外有一條
`performance.spec.js:175` 負載相依訊號。

WebKit job 維持 non-blocking 是合理的。升級為 required 前，應用 Safari 實機鍵盤與 VoiceOver
確認哪些是產品問題，哪些只是 Playwright iPhone input model 差異。

### P2：文件仍有過期描述

`CLAUDE.md` 開頭仍寫「既有頁面仍維持原生 DOM，後續才逐頁遷移」，已不符合現況。

建議改成：

> React 畫面遷移已大致完成；目前進入核心 TypeScript 化、單一 App root 與功能模組拆分階段。

## 6. 建議目標架構

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
    notifications/

  domain/
    session.ts
    profile.ts
    chat.ts

  infrastructure/
    supabase/
      client.ts
      repositories/
      mappers/

  shared/
    ui/
    map/
    state/
    styles/

  legacy/
    sessionViewsAdapter.js
```

Google Maps 不需要硬改成 React 元件；保留 imperative map adapter 會更安全。

理想資料流：

```text
React UI event
   ↓
feature action／use case
   ↓
typed repository
   ↓
Supabase View／RPC
   ↓
allowlisted mapper／runtime validation
   ↓
server state／App state
   ↓
React render
```

## 7. 建議執行順序

### 階段 0：先整理開發與發布狀態（1–2 天）

1. 精確移除異常 `node_modules/node_modules` symlink，再執行 `npm ci`。
2. 更新 `CLAUDE.md` 的 React 遷移描述。
3. 確認工作分支、遠端工作分支與 `main` 的 REL 路徑。
4. 在 preview 重新跑 OAuth、Maps、Push、深連結、390px 慢網路與 CSP 觀察。

### 階段 1：先讓型別保護核心（1–2 週）

1. 將 `dataApi.js` 拆成 typed mapper、repository、auth API。
2. 使用 Supabase 產生的 Database types，但保留目前的查詢欄位 allowlist。
3. 外部資料若需要 runtime validation，只在 Supabase／網路邊界使用 Zod 等工具。
4. 將 `sessionActions.js` 改成 TypeScript。
5. 定義 `SessionControllerState`、`ControllerApi`、surface context 與事件型別。
6. 不要一次對全部舊 JS 開 `checkJs: true`；逐檔轉換或逐檔加受控 `@ts-check`。

### 階段 2：拆大型 Controller（2–4 週）

依功能拆分：

```text
features/discovery
features/session-lifecycle
features/chat
features/profile-auth
features/player-directory
features/notifications
```

先拆純函式、use case 與 typed interface，再決定是否導入狀態套件。不要在責任仍混雜時直接換
Redux、Zustand 或 TanStack Query，否則只是把大 Controller 搬到另一個容器。

### 階段 3：建立單一 React App（2–4 週）

1. 建立唯一 `<App />` root。
2. 導覽、頁面與 `SurfaceHost` 交給 React 管理。
3. 逐步移除 `main.js` 的重複 auth/profile/courts view state。
4. 減少 imperative ref、generation key 與 `flushSync()`。
5. Google Maps 繼續使用 imperative adapter。
6. 每完成一個 feature，就刪除一段 legacy adapter，不建立第二套永久架構。

### 階段 4：效能與 production hardening（1–2 週）

1. 對非首頁頁面與次要 Sheet 做 lazy loading。
2. 加入主 chunk raw／gzip budget。
3. 量測慢速手機首屏與互動時間，不只看 bundle 大小。
4. 接上隱私安全的 error transport。
5. 分階段將 CSP 從 Report-Only 推進到 enforcing。
6. 以實機 Safari 處理六條穩定 WebKit 差異。

## 8. 是否需要換框架

建議繼續使用 **React + TypeScript + Vite**，不建議現在換 Next.js。

原因：這是以地圖、登入後互動與即時資料為主的 SPA。目前問題是模組邊界、狀態與型別，不是
SSR 或 SEO。換 Next.js 會多一次大遷移，但不會自動解決 Controller、資料流或 bundle 問題。

輔助工具建議：

- **TanStack Query**：等 `dataApi` TypeScript 化後，再用於 server state、輪詢與 request dedupe。
- **React Router／TanStack Router**：等頁面網址、返回鍵與深連結需求增加後再導入。
- **Zod**：只放在外部資料邊界。
- **Redux**：目前不需要。
- **Storybook**：如果 `ds-bundle` 要正式成為可重用元件系統，再考慮。

## 9. 我認為最值得先做的五件事

1. 把 `dataApi.js` 的 mapper 與 repository TypeScript 化。
2. 定義 Controller state／API 型別，再依 feature 拆 `sessionController.js`。
3. 規劃單一 `App.tsx`／`SurfaceHost`，逐步減少 18 個 root 與 30 個 `flushSync()`。
4. 解開同步 adapter 限制後，將 18 個 eager imports 改成按需載入。
5. 完成工作分支進 main、preview 人工驗證、錯誤監控與 CSP staged rollout。

## 10. 請 Claude 獨立複核的重點

請不要直接接受本報告結論，建議至少獨立確認：

1. 重新計算 JS／TS／TSX 行數與 42.5% 型別覆蓋估算。
2. 確認四個核心 JS 是否確實共 7,291 行，以及它們是否仍在 `checkJs: false` 範圍。
3. 確認所有 TSX 已無 `sessionViews.js` 反向 import。
4. 確認 `sessionPresentation.ts` 是否仍透過 `sessionActions.js` 持有 DOM action 責任。
5. 確認 18 個 eager glob、18 個 React roots 與約 30 個 `flushSync()` 的判讀。
6. 評估 lazy loading 是否真的必須先改同步 adapter 契約，避免提出無法落地的一行式修法。
7. 確認 `main.js` 的 33 個頂層狀態是否與 Controller store 有重疊 owner。
8. 確認 `dataApi.js` 以外沒有產品程式直接 `.from()`／`.rpc()`。
9. 確認 error transport 目前 production 沒有實際接線。
10. 確認 CSP 仍是 Report-Only，且沒有把本機設定誤稱為線上已驗證。
11. 重新判斷「保留 Vite、不換 Next.js」是否符合此地圖型 SPA 的產品需求。
12. 區分工作分支、main 與 production；不要把本機 HEAD 誤當正式站版本。

建議重現指令：

```bash
git status --short --branch
git rev-list --left-right --count main...HEAD
git rev-list --left-right --count origin/claude/tennis-partner-finder-proto-xfrr6g...HEAD

for extension in js ts tsx; do
  rg --files src -g "*.${extension}" -0 | xargs -0 wc -l | tail -1
done

rg -n 'import.meta.glob' src/sessionViews.js
rg -n 'flushSync\(' src --glob '*.tsx'
rg -n '^let ' src/main.js
rg -n 'from ".*sessionViews.js"' src --glob '*.tsx'
rg -n '\.from\(|\.rpc\(' src --glob '*.{js,ts,tsx}'
rg -n 'configureAppErrorTransport' src tests --glob '*.{js,ts,tsx}'

npm run typecheck
npm run lint
npm run test:session-unit
```

## 最後判斷

這個專案不是 React 遷移失敗，而是已完成第一個重要階段：

> 畫面遷移大致成功，核心架構遷移尚未完成。

目前最有價值的方向不是換框架，也不是增加更多 UI library，而是讓資料、狀態與功能邊界真正
進入 TypeScript，再把分散的 React islands 收斂成單一 App。
