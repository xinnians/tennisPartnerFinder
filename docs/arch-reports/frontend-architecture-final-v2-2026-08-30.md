# 前端架構最終候選方案 v2

日期：2026-08-30
狀態：**待 Codex 驗證；尚未授權實作**
程式基準：HEAD `a14e81e`；`dist/` 為 8/30 fresh build（主 chunk `index-BWygPPVv`，
與 8/29 build byte-identical，雙環境交叉驗證）

## 版本沿革與輸入

本文取代 `frontend-architecture-final-candidate-2026-08-29.md`（v1）。整合輸入：

1. v1 全文骨架
2. 第四輪（`fourth-pass`）§7 的 17 條修訂
3. 第五輪（`fifth-pass`，Codex）的四個修正與三個新事實
4. 第六輪（`sixth-pass`）對第五輪的缺陷修正（§2 的 12 條——該文件自稱 14，read-back 實數 12）

前六份文件保留為證據與修正歷史，不應刪除。若本文與 `.claude/rules/` 衝突，規則檔優先。

證據標記沿用：**已證實**（可由檔案、指令或測試直接重現，本系列已至少一輪親驗）、
**待驗**（設計或估算，需 PoC 或實測）、**需產品決策**（技術無法定案）。

---

## 1. 摘要

專案不需要換框架，不需要重做已完成的 React 頁面遷移。工作順序：

```text
階段 -1  跨帳號 Web Push 修復（先出派工單，核可後執行）
階段 0a  純掃描 gate：Gate A（HTML renderer）、Gate B（controller DOM）、syncCommit canary、CSS order gate
階段 0b  需人工判定 owner 的守門：mutation 帳本（17 檔 90 點）、aria-live 持久性測試
階段 1   死碼／死 export／preload 清理
階段 2   build+preview Playwright project＋真實效能基線
階段 3   Bundle ADR（方案 A–E）
階段 4   結構 gate manifest 化＋wiring 移植
階段 5   blockedPlayers 零依賴 server-state facade 實驗
階段 6A  Chat server-state＋unread command
階段 6B  Messages route ownership＋bridge 退役
```

每階段必須能單獨驗收與回滾。成功標準：一項功能只有一條可追蹤的資料流，
每個 DOM 子樹只有一個明確 owner，私人資料有完整生命週期，
每建立一個新邊界都伴隨一個舊 bridge 的實際退役。

---

## 2. 已完成，不應重新派工（已證實，逐項可由程式碼與 git 獨立證明）

- 單一 React root（全 `src/` 唯一 `createRoot` 在 `App.tsx:762`）
- Messages／Me／My Sessions／NearbyDrawer 的 UI ownership（`main.js` 零 mount 鏈、
  `pageViews.js` 不存在、slot 機制在 `SurfaceHost` 外零命中）
- SurfaceHost 對 portal、surface stack、backdrop、Escape、focus trap、focus restore 的 ownership
- `sheets.js` → `sheets.ts`；批 6A–6F TypeScript 化；type-aware ESLint 恢復管線
- private repository 動態載入與 Sentry 條件載入（守門在 `check-production-bundle.mjs:89-108`，
  來源是 bundle 管線，非 React ownership roadmap）

「完成」只指 UI ownership 收斂；route ownership、server-state ownership、feature-first 目錄未完成。

已結案決策：不導入 `@layer`（batch-10 三個特異性反例）；不以 `syncCommit` 兩個 caller 歸零
為目標（批 5 有「移除即紅」oracle）；token 已集中於 `src/session.css`；不改 Next.js。

### 2.1 專案文件過時處（**無條件修正，不綁任何方案**；已證實共四條）

| 位置 | 過時描述 | 實況 |
| --- | --- | --- |
| `CLAUDE.md:73` | `check:production-bundle`「阻止示範暱稱」 | 另有 8 個 byte 上限＋12 個非 byte 斷言 |
| `.claude/rules/testing.md:42` | 同上「防止 mock 暱稱」 | 同上 |
| `.claude/rules/testing.md:49` | lint／prettier「只掃 `.ts/.tsx`」 | `package.json:30-31` 實掃 `src/**/*.{js,ts,tsx}` 與 tests/scripts 的 js/mjs |
| `.claude/rules/testing.md:56-57` | mock project 執行四支 spec | `playwright.config.js:48` 的 testMatch 為五支，多 `react-page-focus.spec.js` |

另一機制洞：`scripts/check-production-bundle.mjs` 不被任何規則檔 paths 涵蓋——
動 gate 常數的人機制上讀不到「不得任意放寬」規則。修法（納入 paths）同樣**無條件執行**。

---

## 3. 階段 -1：跨帳號 Web Push 修復

### 3.1 已證實的鏈條

- `handleSignOut()`（`profileOrchestrationFeature.ts:177-184`）只呼叫 `signOut()` 加 toast
- `removePushSubscription` 在 UI 層零 caller（僅 dataApi 轉發鏈與一個測試）
- 前端零 `pushManager.unsubscribe()`；Service Worker 無 `pushsubscriptionchange` handler
- `enableBrowserPush`（`notificationPush.js:29-36`）重用瀏覽器現存 endpoint
- `save_push_subscription` 對他人 endpoint 拋 `PUSH_ENDPOINT_OWNERSHIP`
  （migration `202607230001:168-169`）；`remove_push_subscription` 只刪呼叫者自己的列（`:197-201`）
- dispatcher 依 `recipient_profile_id` 查訂閱（`index.ts:87-89`），只在 404/410 刪列
  （`dispatch.js:35-36`）；四個 pg_cron job 無一清理；無 TTL；無帳號刪除路徑

### 3.2 兩個影響面（同批處理）

1. **跨帳號通知外洩**：A 登出（或不登出換帳號）後，A 的通知持續送達現由 B 使用的瀏覽器。
2. **推播功能持續性阻斷**：B 按「開啟推播」會重用同一 endpoint 並被 ownership RPC 拒絕，
   產品內無恢復路徑，UI 無診斷訊息。

措辭精確化（第五輪修正 + 第六輪補充）：阻斷的持續條件是「**瀏覽器持續回傳同一 endpoint**」。
瀏覽器換發新 endpoint（清 site data、撤銷後再授予通知權限）時，`getSubscription()` 回 null →
`subscribe()` 產生無主 endpoint → ownership 檢查不會擋，即自動恢復——但這依賴使用者的
瀏覽器層操作，不是產品內路徑。「P0」屬優先級判斷；本文以「現存缺陷、使用者可感知、
建議列第一優先」描述。

### 3.3 外洩內容（已證實）

payload 恆為五欄 `court`／`start_at`／`slots_remaining`／`message`／`url`
（單一 builder，migration `202607230001:288-298`；edge function 以同五欄 allowlist 再過濾）。
無 profile ID、暱稱、LINE、GPS、聊天正文；chat 的 message 是固定字串「群組有新訊息」。

私有增量（`title` 與 `message` **同級**）：

- `title`（`dispatch.js:43-56` 依 event_type 查表）：「你收到球局邀請」「有新的加入申請」等
  ——揭露 A 的私人參與角色與生命週期狀態
- `message`（呼叫點寫死）：「有人申請加入你的球局。」「球局已取消。」等，
  `push-sw.js` 直接放進通知 body
- `session_reminder`：洩漏「A 一小時後會出現在某座具名球場」的人身時間地點

`court`／`start_at`／`slots_remaining` 對 open/full 且在窗口內的局可由匿名
`session_discovery` 取得，但 cancelled／過期局的通知內容匿名端讀不到；
且核心洩漏是「此裝置＝A」與球局的**關聯**，不是欄位值本身。

放大因子：`seedAllTaipeiCourtSubscriptions`（`notificationFeature.ts:137-148`）使新帳號
預設訂閱全台北市球場，`court_new_session` 硬編恆送（`202607270007:90`）——殘留裝置收到的是
高頻通知。

### 3.4 修法（三件缺一不可）＋設計待定項

1. 登出前 best-effort：`removePushSubscription(endpoint)` → `subscription.unsubscribe()` → `signOut()`
2. **同批**加「登入後偵測 `permission === "granted"` 但無 subscription 時自動重訂並 save」
   （`enableBrowserPush` 唯一觸發點是使用者按鈕，缺此則單人裝置登出再登入永久靜默）
3. 明講此修法只縮小時間窗，不解決「不登出就換人」——完整方案需設計
   identity-change 時的 subscription reconciliation 與 endpoint 歸屬／撤銷流程
   （可能涉及 migration），含威脅模型：**需產品決策**——「持有 subscription 的
   p256dh+auth key」能否作為接管證明。

原則：endpoint 與 keys 不進 log；cleanup 失敗不阻止登出但留重試；auto-resubscribe
不重新跳 permission prompt；不得讓同一 endpoint 同時屬於兩個 profile。

驗收矩陣沿用 v1 §3.5（11 項），另加：B 換發新 endpoint 後可正常訂閱。

授權：此階段是 auth 路徑上的 runtime 變更，**先出獨立派工單、取得核可後才可執行**。

---

## 4. Ownership 原則

### 4.1 每個 DOM 子樹一個 owner

- React 擁有 App Shell、頁面、Sheets、Dialogs 與 integration 外層
- Google Maps SDK 擁有 `#map` 內部與 marker DOM
- browser adapters 擁有 Geolocation、Web Push、OAuth、Sentry lifecycle
- React 外持久 live region 可保留，但必須實名列管並有「不得重建」測試

### 4.2 aria-live 實名表（已證實，五列）

| 節點 | 位置 | Owner／更新方式 |
| --- | --- | --- |
| `#player-layer-status` | `index.html:81` | React 外；legacy renderer 更新（`sessionViews.js:196`） |
| `#map-data-status` | `index.html:84` | React 外；legacy renderer 以 innerHTML 重建內容（`sessionViews.js:213`） |
| `#nearby-sessions-count-status` | `index.html:89` | React 外；`main.js:315-317` 原地更新 textContent |
| `#toast-root` | `index.html:123` | 容器 React 外，子節點由 React portal 擁有 |
| `#my-sessions-badge-status` | `App.tsx:591` | **React 內** |

`main.js:311-313` 拿 `#my-sessions-badge-status` 當「React 外同模式」對照的註解**已過期**，需修正。

`sessionViews.js:485` 的 `[data-lazy-surface-status]` 是 lazy loading 佔位，
本來就會被取代——**列入 Gate A 的 `html:` 帳本，明確排除於「不得重建」契約**
（`react-unmount.spec.js:133` 只斷言載入期間存在）。

階段 0b 交付：React 外 live region「不得被 replace/recreate」測試（現況只有屬性斷言）、
owner manifest、過期註解修正。

### 4.3 應消除的雙重 ownership（含 v1 漏列的兩處）

- React portal 產生子節點、`main.js` 對同一容器做 delegated listener（`main.js:695-713`）
- React 元件 render 後由外部寫 `disabled`／`hidden`／`textContent`（`sessionActions.ts` 協定）
- controller 同時決定 server flow、surface 名稱、transition、focus reason 與 view setter
- top-level module side effect 完成其他 view 模組 wiring（`sessionViews.js:383/424/439/640`
  ＋ `:621-622` 兩個 preload listener）
- **`main.js:419` 寫 page section 的 `hidden`；`main.js:478` 對 React 產生的
  Messages heading 做 focus**（已證實，v1 漏列）

---

## 5. 階段 0a：純掃描 gate

### 5.1 Gate A：禁止新增 HTML renderer

掃描面（已證實現況命中）：

| 類別 | 現況 |
| --- | --- |
| `innerHTML =` | `sessionViews.js:220`、`:224`；`sheets.ts:137`（close 防禦分支） |
| `dangerouslySetInnerHTML` | `SurfaceHost.tsx:209` |
| 非空 surface `html:` | `sessionViews.js:499`（lazy shell）、`sessionSurfaceViews.js:286`（session detail shell） |
| `insertAdjacentHTML`／`outerHTML` | 零命中 |

實作要求（第五輪 §7.1 採納）：

1. AST 掃描 assignment／property name，不用純 grep 計數
2. 凍結上述既有 **symbol**（非行號、非檔案總數）
3. 每種禁止 API 做「加入後會紅」canary
4. 禁止面明列 `DOMParser`、`createContextualFragment`、`document.write`、`setHTMLUnsafe`、
   `insertAdjacentHTML`、`outerHTML`、surface `html:` 選項

### 5.2 Gate B：禁止 controller 直接操作 DOM

**掃描目標是 DOM 查詢／寫入 API 集合**（`querySelector`／`innerHTML`／`classList`／
`textContent`／`createElement`／`getElementById`／`addEventListener` 於 DOM 節點），
**不含 `document` 字面**——v1 用 `document` 字面會誤中 2 筆注入預設值，照字面實作第一次跑就紅。

現況（已證實）：此 API 集合在 `src/controller/` + `src/sessionController.ts` **零命中**。
測試必須 assert 掃描集合非空。

**Browser port 另立規則**（不與 Gate B 混寫）。已知清單（第六輪實測 + 本輪 read-back 補遺；
**不宣稱完整**，port 規則上線時須以全庫掃描重建並 assert 掃描集非空）：

- `globalThis.document` 預設注入 ×4：`discoveryMapController.ts:105`、`sessionController.ts:170`、
  `requestGate.ts:46`、`pins.ts:135`（注：`pins.ts:135` 同時是 `Pick<Document,...>` 型別引用，
  已計入本桶不重複計；照 sixth-pass 附錄指令重跑型別桶會看到 5 筆即此因）
- `Document` 型別引用 ×4：`discoveryMapController.ts:72`、`sessionController.ts:128`、
  `chatController.ts:57`、`appErrors.ts:127`
- 未注入的 browser global 直讀，**Gate B 掃描範圍內** ×1：`intentController.ts:492` 的
  `globalThis.navigator?.geolocation`
- **範圍外的同型直讀（read-back 補遺）**：`shareFeature.js:34` 的
  `globalThis.navigator?.clipboard?.writeText`、`shareFeature.js:25` 的
  `document.execCommand`（裸讀，不走 globalThis）；`playerPresence.js:21` 的
  `geolocation = globalThis.navigator?.geolocation` 屬注入預設值同型

ESLint 實作注意（已證實）：flat config 的 rule arrays **replace 而非 merge**
（`eslint.config.js:97`），不得新增與 `src/**/*` 重疊的 config 區塊。

### 5.3 Gate C：syncCommit canary

gate **已存在**（`react-surface-lifecycle.test.js:109-118`，deepEqual 鎖
`approvedCallers = ["app/SurfaceHost.tsx", "sessionStore.ts"]`，`:114` 非空守門；
ESLint 另擋 `flushSync` 直接匯入）。本階段只補三拍 canary：現況綠 → 暫增第三 caller 紅 → 還原綠。

### 5.4 CSS import 順序 gate

歸**階段 0a**（v1 在 §5.5／§6.2／§19 三處歸屬矛盾，本文裁定：它是清理前要先建立的保護）。
固定 `main.js:8-20` 的 13 個 import 順序；三拍驗收：現況綠 → 交換任兩個 import 紅 → 還原綠。

---

## 6. 階段 0b：mutation 帳本與 aria-live 測試

### 6.1 Mutation 帳本

「React 節點外部 mutation」無法靠文字掃描判定 owner（`main.js:317` 的刻意寫入與
`sessionSurfaceViews.js:129` 的待禁寫入字面相同），改凍結帳本。

基線（已證實，grep union 可重跑，指令見 sixth-pass 附錄）：**17 檔、90 個候選點**。
分佈前五：`sessionSurfaceViews.js` 19、`sessionFormViews.js` 12、`sessionViews.js` 12、
`sessionActions.ts` 9、`appErrors.ts` 8。

帳本每筆記：檔案與 symbol、mutation API、selector/ref 來源、節點 owner、保留理由、預定退役階段。
新增必須更新帳本並經人工審核。**不用行號**（搬檔即假紅）；階段 4 wiring 搬檔後帳本按 symbol 重掛。

### 6.2 aria-live 持久性測試

見 §4.2。驗證四個 React 外節點在頁面切換與資料更新後為**同一個 DOM 節點**。

---

## 7. 階段 1：清理

### 7.1 真零風險（4）

- 刪 `main.js:687` 的 dead preload（死因已證實：`init()` 同步執行至 `:719` 的 `void boot()`
  才啟動 `restoreAuth()`，`:687` 時 store `authSession` 恆為初值 null，函式對 null no-op。
  **`main.js:643` 是活的，不可動**）
- `SurfaceSlot` 取消 export（`SurfaceHost.tsx:70`，interface 純型別，零外部引用）
- 修 `session.css:12` token 註解
- `ds-bundle/` 標唯讀快照（**需產品決策**：2026-08-17 曾拍板不保留、08-21 重新入版且無翻案紀錄；
  是否刪除由維護者決定；若刪須同批改 `.design-sync/config.json:6` 與 `conventions.md:7,32`）

### 7.2 需同批處理（各附連動）

- `PROFILE_PUBLIC_DISCLOSURE`（`:433/:657` 檔內消費）與 `sessionFormSheetRuntime`（`:667`）
  只拿掉 `export` 不刪 declaration
- 刪 13 個 presentation re-export 須同批改 `session-presentation-boundary.test.js:21-35`
  的 `RUNTIME_EXPORTS` 與 `:147-158` 的正則＋`Object.freeze` 計數
- 清 `prettier-ignore` 鷹架（其凍結的 F2D gate 在 tests/ 已零殘留）後重新 format 並跑
  `prettier:check`

### 7.3 Preload 調整

- 登入後 13 項預載縮為小型 idle 集合；優先 SessionDetailSheet（最大最常用，反而不在清單）
  與 ProfileCompletionSheet；罕用 Report/Withdraw 改父 surface 開啟時 warm
- 桌面保留 pointerover/focusin；手機用 idle-time（pointerover 於觸控幾乎與 tap 同時）
- preload 只改下載時機，**不影響 bundle gate 餘裕**

---

## 8. 階段 2：build+preview 與效能基線

1. 新增跑 `npm run build` + `npm run preview` 的 Playwright project——
   JS parse/execute、chunk 時序、preload waterfall、實際傳輸量四指標的共同前置
2. 同批修 `performance.spec.js:59-74` 的匿名 private repository 斷言：
   它比對 dev server 路徑（`/src/data/repositories/privateDataRepository.ts`），
   preview 下永不 match，且**無 positive control**——現在就是空集合也綠的形狀。
   改比 production chunk marker，並加「登入態下同一攔截器必須非空」的反向 control
3. 最低成本起手：`check-production-bundle.mjs` 加 brotli（`node:zlib` 內建）
4. 情境：未登入首進／已登入首進／OAuth callback 返回（**零 fixture，最大缺口**）／
   390px 慢網路（CDP `Network.emulateNetworkConditions`，零新依賴）／桌面
5. 指標：LCP（`PerformanceObserver`，零新依賴）、interaction latency、Maps 可互動時間、
   parse/execute、waterfall、gzip/brotli 傳輸量、preload 頻寬競爭、lazy chunk 首開等待
6. 紀律：本階段產出是**記錄數字**，不新增時間類阻擋斷言
   （`TENNIS_DISCOVERY_SHELL_BUDGET_MS` 的教訓）

---

## 9. 階段 3：Bundle ADR

### 9.1 現況餘裕（已證實，fresh build 重現；完整表見 fifth-pass §4）

最緊的六個 gzip 約束依序：**MePage 551**、SessionDetailSheet 653、MySessionsPage 672、
CreateSessionSheet 958、Sentry 1,277、**total 1,435**。raw 最緊：MySessionsPage 1,524、
SessionDetailSheet 1,951、Sentry 2,025。main chunk 餘裕（19,930/4,954）不是約束所在。
CSS 65,865/10,857 **無 byte gate**。

引入任何新 runtime 依賴的硬條件：**total gzip 增量 ≤ 1,435 B 否則翻紅**；
lazy 化不是逃生門（total 是總量上限）。

### 9.2 非 byte gate（12 個 assert，缺一不可）

含 v1 漏列的 **`:48` development build E2E hook 正向 canary**——它是「production 不含 hook」
可信的唯一前提。其餘：掃描集非空（`:57`／`:59`）、demo identifiers（`:61`）、hook 不進
production（`:63`）、entry 恰 1（`:69`）、chunk 掃描集（`:80`／`:84`）、Sentry marker 不進
main（`:90`）、Sentry chunk ≥1（`:94`）、private marker 不進 main（`:104`）、
private chunk 恰 1（`:108`）。

Sentry 分類弱點（結構部分已證實；canary 數字待驗）：分類靠 `sentry_version` 字串；帶該字串的
app lazy chunk 自動改吃 90,000/31,000 寬鬆上限，**在 total 餘裕內完全不會被 gate 發現**
（A/B canary 委派實測：可超 5,500 gzip 上限 815 B 而全綠；此數字屬**待驗**——
ADR 動工時以 canary 重現一次）；且 `:94` 不要求恰一個，Sentry 可被切成多個
chunk 不翻紅。ADR 必須處理：Sentry chunk 改斷言恰 1，或分類改 manifest。

### 9.3 方案

- **A 維持現況**：零風險；route/server-state 用既有工具做 facade（階段 5 即此路線）。
- **B 延遲載入 auth client**：前提不成立（`main.js:568` 的 `restoreAuth` 與 publicStartup
  同時啟動；boot 即呼叫 `onAuthStateChange`／`getInitialSession`）。若重開等於方案 E。
- **C 子套件替身**：高風險。替身須 9 個具名 export、可 `new`、`RealtimeClient.setAuth` 可用
  （`_listenForAuthEvents` 必然執行）；且 `vite.config.ts:28-31` 既有 alias 模式只在
  production build 生效——**缺 production-equivalent 執行測試不得開工**。
- **D 正式調整 gate**。前置七項：
  1. 先修訂 `.claude/rules/react-migration.md` 的「production bundle gate 不得任意放寬…
     任何批不得變更」條文（**引條文文字勿引行號**，該檔已被改 8 次）
  2. 明定批准者為 repo 負責人
  3. 真實裝置 before/after（依賴階段 2）
  4. 一次一個依賴；禁止預留未使用空間
  5. canary：放寬後證明新上限仍會翻紅（建 gate 的 `1ec3b34` 本有 Canary 欄位）
  6. §2.1 的文件修正與 paths 涵蓋**須已完成**（它們是無條件項，不因 ADR 選 A 或 E 而免除；
     列於此僅表示「調 gate 前必為已完成狀態」）
  7. 公式待定義四件事：基準取哪次 build；lazy 的 1% 是逐 chunk 還是總和（腳本現行逐 chunk）；
     **`max(4KiB, 1%)` 恆預留 ≥4KiB、與「禁止預留空間」自相矛盾，需先解**；
     年度累積治理（**保留概念**——現行窗口是 per-change，對 N 次累積無上限）需新增
     持久化基準資產，起算點與紀錄位置待定
- **E 直接組合 auth-js + postgrest-js**：**官方支援已證實**（auth-js JSDoc 明列
  「Standalone import for bundle-sensitive environments」；postgrest-js README 提供
  直接用法）。探針量級：省約 96.5K raw／26.9K gzip／22.2K brotli（雙環境逐位重現，
  但**是獨立探針非真實 Vite build**）。RPC 單一收斂點（`privateDataRepository.ts:146`）、
  `PostgrestClient` 原生支援 `rpc`。PoC 待驗：auth token 注入（`fetchWithAuth` 自組）、
  PKCE／`detectSessionInUrl`／refresh／sign-out、`RepositoryDatabase` 泛型重組、
  `localSupabase.js` harness、兩套件升 package.json 直接依賴（現為 transitive、
  supabase-js 精確鎖 2.110.0，升級責任轉移屬**需產品決策**）。

不因 E 省最多就直接選定；ADR 欄位沿用 v1 §8.4。

---

## 10. 階段 4：結構 gate manifest 化＋wiring 移植

### 10.1 Manifest 化

把讀 `sessionViews.js` 字面的結構 gate 遷到既有 `tests/fixtures/surfaceManifest.js`
（81 行、三支消費者——**已存在，勿重建**）。

必保三類：lazy 名冊（eagerModules 恰 1、lazySheets 14 且 key===import 字面、lazyPages 3、
authSession 才 warm）；架構契約（單一 root、flushSync 唯一出現＋caller 恰 2、
14 surface 註冊 unmount、close 順序）；可及性契約（4 導覽目的地、aria-expanded/controls、
Escape preventDefault+stopPropagation、toast live-region）。

可退役純字面凍結 5 條：`react-surface-lifecycle.test.js:138/:143/:180`、
`session-presentation-boundary.test.js:114/:138-144`。

隱私契約（private 不進 main、LINE 零 consumer、demo identifiers、E2E hook）**不在這兩支
結構測試內**（在 `check-production-bundle.mjs` 與 `session-data-boundary.test.js`），
搬 gate 不得遺失。

### 10.2 Wiring 搬移

top-level 副作用共 **6 個**：四個 configure（`:383/:424/:439/:640`）＋
**兩個** preload listener（`:621` pointerover、`:622` focusin）。
owner 是 `main.js` composition root 或專用 wiring 模組——**不是** `AppServicesProvider`
（React render 內，晚於命令式模組需求時點）。

順序：先改 gate → 抽共用 surface loader 底座 → 原子搬四個 configure（form 最後）→
搬 listener 與 `configureSessionViewModules` → 最後才評估 facade 退役
（86 個 `__importAppModule("sessionViews")` 呼叫點綁檔名，最貴）。
驗收固定：新 gate 綠 → 新 wiring 綠 → 舊 bridge 刪 → 舊 gate 退役。

---

## 11. 階段 5：blockedPlayers facade 實驗

理由（修正後）：單一載入函式 `refreshMyPlayerBlocks()` 但**三個呼叫點**
（`main.js:458` Me 頁、`chatController.ts:177` 於 `blockChatSender` 內、
`mySessionsController.ts:234` 解除封鎖後）；status/error 為 1:1 三聯欄；
不碰 Maps／GPS／route／surface stack。

facade API：`load()`／`refresh()`／`clearForAccountChange()`（**待建**，非現況；
現況等價物是 `authController.ts:148` 的 `blockedPlayerGate.invalidate()` ＋ `:149-155`
內聯 setState）／`getSnapshot()`／`subscribe()`。

**`clearForAccountChange()` 必須內含 gate.invalidate() 語意**——單清三欄不擋
「清除後 in-flight 回來覆寫」；gate 世代與 authEpoch 是兩層各自足夠的防護，facade 不得拆掉。

驗收：

- `SessionControllerState` 移除三欄；`mySessionsController` 對三欄 setState 歸零
- **`authController.ts:149-155` 那筆單一 setState（同時寫 blockedPlayers 三欄＋
  mySessionsError/Status）須拆成兩筆**——blockedPlayers 側走 facade、mySessions 側留原位
  （fifth-pass §5.1 此處語意反轉，以本文為準）
- `mySessionsController.ts:228` 的同步 `read().blockedPlayers.some(...)` 守衛有新取得路徑
- account switch 呼叫 `clearForAccountChange()`；上一帳號資料不可讀
- MePage 行為不變（注意 `me-page-dom.test.js:160` 鎖 `selectMeState` 九個 key，會紅，同批改）
- 零新依賴；不改 route；不改 data API/RLS/RPC

若無法在不增加複雜度下完成，停止擴大 facade，而非改用 Query library 掩蓋。

---

## 12. 階段 6：Chat + Messages vertical slice

定位：**低依賴、可切割的候選**（在七維度比較中最輕：1/12 callback、1/11 registry、
2/15 transitions、0/27 store 欄位、測試呼叫點歸屬約 5/86（**此格為 agent 語彙歸屬判定，
未逐點複驗**；其餘五格已逐位重算）、chunk 餘裕 3,421/4,627 最寬），
有完整 route 與無第二 consumer 的 server view。「最佳」屬架構選擇，動工前依 §12.2 複驗。

注意：「0 store 欄位」≠「零 server state」——chat 的 server state 在 surfaceRegistry
context（messages/roster/lastMarkedMessageId）與 `mySessions[]` 元素的 `unreadMessageCount`。

### 12.1 動工前置

1. `chatController.ts:98` 的 `context.session.unreadMessageCount = 0`（就地變異 store 陣列
   元素、繞過 setState）改為 `mySessionsController` 擁有的 `clearMySessionUnread(sessionId)`；
   權威來源是 `my_session_participations` 的 `unread_message_count`
2. 排除共用 `ReportDialog`（與 `openRosterParticipantReport` 共用）
3. 複驗七維度數字
4. 盤點 quiet/loud polling、visibility、read cursor、archived state、identity 變更關閉流程

### 12.2 不可被 facade 取代的三件事（已證實）

- `requestGate.issue()` 的遞增世代＝取消上一次 in-flight
- `authSnapshot` 的 epoch 比對（identity／gate／readiness 任一變即失效——授權語意非快取語意）
- `surfaceRegistry.is("chat", context)` 的 context identity 比對（同 session 重開產生新 context）

### 12.3 拆批

6A：chat feed facade＋unread command，保留 polling/staleness/mark-read/account-switch，不改 route。
6B：Messages route 單一 source、back/forward 與 focus 單點控制、刪對應 facade/bridge。
Route 與 chat server state 本已分離（`showMessagesPage` 零 dataApi 呼叫），唯一鉸鏈是
unreadMessageCount，故前置 1 必須先於或同批於 6A。ADR 未允許 Router 前可先建內部 route contract。

驗收沿用 v1 §11.4。

---

## 13. State 分類（27 欄，六類涵蓋、10 欄跨類）

主分類表沿用 v1 §12.1。特殊欄位（已證實）：

- `profileEligibility`：物化授權投影＋刻意 optimistic patch（`sessionController.ts:689`），
  不能改純 selector；約 30 個授權判斷的唯一輸入
- `filters`：純前端過濾（`discoveryFeature.ts:109`），非 query key；`setFilter` 以
  `Object.assign` 就地變更（`discoveryMapController.ts:224-225`），先修可變性
- `discoveryMessage`：**死狀態**（4 寫入 0 讀取），確認後刪除，勿搬進 facade
- `authEpoch`：五重語意（identity／profile gate／readiness／in-flight 取消／
  DOM pending-action 重置鍵，末項跨到 `sessionActions.ts:107-112`）
- `courtsReady` 與 store 外 `courtCatalogueStatus`（`main.js:157`）成對消費（`profile.ts:33/:50`）
- sessions/mySessions 落地後同步 reconcile active detail/chat surface——搬 payload 必同搬此規則

store 外狀態另列：`courtCatalogueStatus`、`profileLoadStatus`、chat context、join preview、
notification preferences。

---

## 14. CSS 規則

沿用 v1 §13 十條，含三個但書（fourth-pass Q15）：

- responsive 規則搬 feature 檔的前提是該檔位於**所有同特異性競爭宣告之後**
- 「避免跨 feature selector」指**不新增**新耦合；既有 38 條左右維持現狀，需要共用視覺時
  先建 shared vocabulary class
- `!important` 例外：`prefers-reduced-motion` 類必要全域覆寫（`motion.css:30`），附理由

「token 只在 `session.css` 定義」是 `contrast-tokens.test.js` 正確性的**載重前提**
（字母序串接 first-match，字母序更前的檔定義同名 token 會靜默劫持）。
新增 `content-visibility`／`contain-intrinsic-size` 前必先更新
`content-visibility-contract.test.js` 的封閉集合（集合本體是該檔的 `CONTRACTS` 常數，
`:68` 是消費它的 deepEqual 斷言——編輯位置在前者）。

---

## 15. 隱私與外送邊界

- access/refresh token：**除 supabase-js 官方 session storage（`persistSession:true` 的
  localStorage）與必要 Authorization header 外**，不得進 URL、history.state、log、
  analytics、自建 cache key 或錯誤 payload
- **`authIdentity()` 修法**（v1 指錯函式）：寫入 `history.state` 的是
  `profileOrchestrationFeature.ts:118` 的 `authIdentity()`（`main.js:424`），
  與 `profileAuthFeature.ts:22` 的 `sessionIdentity()` 是**兩個重複實作**，
  修 fallback 須兩處一併收斂為 `user.id ?? null`。
  觸發條件：auth-js `_isValidSession()` 不檢查 `user`，被竄改／不完整的 storage session
  可使 `user?.id` 為 undefined 而落入 access_token 分支。
  `main.js:495-500` 已有 null 短路，但 null 是 **fail-open**（該 entry 不再做 owner 比對），
  屬可接受降級而非等價替換——修法文件應載明
- 實際外送出口七類（已證實）：PostgREST GET query string（bounds 與時間窗）、
  `update_my_presence` RPC body（raw lat/lng）、Google Maps JS、Vercel Analytics、
  Google Fonts、Sentry transport（DSN 有效時）、push endpoint+keys 經 RPC 入 Supabase
- 若導入 Query/cache：raw `userLocation` 與精確 `bounds` 不進 query key／mutation variables／
  error context／log（位置 scope 只用粗粒度代號）；不用 private persister；
  production 不含 Query Devtools（**注意 React DevTools 在 production 一樣可讀 component
  state，勿誤以為無 Devtools＝不可觀察**）；identity change 用 remove 非 invalidate，
  掛進 `authController` 既有清除路徑並由同一測試守護；authEpoch 拆 identity 與 gate 語意
  再進 key；mutation 完成仍驗 live identity 與 profile gate；UI 不直查 raw table

---

## 16. 驗收規則

### 16.1 runtime 批共同必跑

依 `testing.md:51-52`：修改 `src/` runtime 即不得豁免 `test:local`。

```text
npm ci                        # 乾淨機器前置；已有 node_modules 可略
npx playwright install --with-deps chromium webkit   # 乾淨機器前置
npx supabase start          # test:local 的環境前置
node scripts/generate-courts-seed.mjs --check
npm run typecheck
npm run lint
npm run prettier:check
npm run test:mock
npm run test:mock:webkit    # 非阻擋
npm run test:local
npm run test:local:mobile   # 等價 supabase-mobile-chromium；CI 無條件跑
npm run build
npm run check:production-bundle
git diff --check
```

口徑：核心九條＝`test:ci:frontend` 的八條在 `test:mock` 後插入 `test:local`。
guarded reset（`CONFIRM_LOCAL_DB_RESET=1`）是「完整乾淨驗證」的標準前置但**非每次重跑的
技術必要**，且屬破壞性操作不得隱性執行。

### 16.2 條件必跑

有 migration：`npm run test:db`。
涉及 Auth／Supabase client／push／private cache／account switch，另加人工或自動驗證
（與指令分開列）：OAuth／PKCE／refresh／sign-out；雙帳號切換。
涉及 hosted：依 release checklist。

### 16.3 每批不變條件

沿用 v1 §15.3，其中 access token 條款依 §15 修正版；push endpoint ownership 不退步。

---

## 17. 不建議做的事

沿用 v1 §16 十五條，修正兩條：

- 「不把 React 外 live region 搬入會重建的 subtree」的標的是 §4.2 的**四個持久節點**；
  lazy loading 佔位不在此列
- 補一條：**不在 mutation 帳本用行號當基線**（搬檔即全面假紅；用檔案＋symbol）

---

## 18. 授權邊界（逐階段標定，v1 留白處補齊）

| 階段 | 授權 |
| --- | --- |
| -1 Push 修復 | **只可設計**：派工單＋威脅模型＋測試矩陣；runtime 修改需核可 |
| 0a 純掃描 gate | **可落測試/gate**（不改 runtime src/） |
| 0b 帳本＋aria-live 測試 | **可落測試**；帳本文件可落；owner 判定爭議項報維護者 |
| 1 清理 | **可改 runtime**（限本文列名項；`ds-bundle` 刪除除外——需產品決策） |
| 2 preview＋基線 | **可落測試/設定**（新 Playwright project、brotli 進 checker）；不改 src/ |
| 3 Bundle ADR | **只可設計**：ADR 文件＋方案 E PoC 設計；不安裝依賴、不改 gate、不建 alias |
| 4 manifest＋wiring | **可改 runtime**（gate 先行、依 §10.2 順序） |
| 5 blockedPlayers facade | **可改 runtime**（依 §11 驗收） |
| 6A/6B Chat+Messages | **可改 runtime**（前置完成後；Router 安裝仍受階段 3 結論約束） |

全程不可：安裝 Router/Query、修改 bundle byte limits 或規則檔（除階段 3 核可後）、
production Supabase alias、刪 `ds-bundle/`、導入 `@layer`、刪 `syncCommit`、
改 deep-link URL、改 Auth boot/PKCE/refresh（除階段 -1 核可後）。

---

## 19. 請 Codex 驗證的重點

1. §3.2 的措辭（持續性阻斷＋瀏覽器換發即自動恢復）是否與程式碼一致？
2. §5.2 的 browser port 清單（4+4+1）是否完整？有無第 10 筆？
3. §11 的 `authController.ts:149-155` 拆兩筆方案——請開檔確認現況是單一筆 setState 寫**五欄**
   （blockedPlayers 三欄＋mySessionsError/Status 兩欄）。
4. §9.3 方案 D 前置七項有無遺漏？`max()` 預留矛盾的解法建議？
5. §6.1 的 90 點基線用附錄指令重跑是否仍為 17 檔 90 點？
6. §16.1 的指令清單在乾淨機器上逐條可執行嗎（`supabase start` 前置順序）？
7. 本文所有行號（HEAD `a14e81e`）抽驗至少 20 處。
8. 標出本文所有「待驗」與「需產品決策」項，確認沒有被誤標為「已證實」。
