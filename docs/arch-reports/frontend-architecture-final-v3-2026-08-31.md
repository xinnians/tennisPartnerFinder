# 前端架構最終方案 v3

日期：2026-08-31
狀態：**開發計畫已啟動；產品決策已確認，但 runtime／migration 仍依批次授權**
程式基準：HEAD `a14e81e`；bundle 數字對應 8/30–8/31 的 fresh production build
（主 chunk `index-BWygPPVv.js`，經 in-memory Vite `write:false` 與 `dist/` 逐 byte 比對一致）

執行進度的單一來源：`docs/arch-reports/frontend-architecture-implementation-status.md`。
本文件描述目標與驗收；「已決策」不等於「已實作」。

## 版本沿革

取代 `final-candidate`（v1）與 `final-v2`。整合十一輪審查（Claude 與 Codex 交替）的全部
存活結論；前十一份文件保留為審查紀錄與待查輸入，不是證據。依第十一輪收斂終判產出：
**驗收條件全部內嵌本文，不使用跨文件索引**。

證據標記：

- **已重現**：可由 HEAD 原始碼、指令、測試或 W3C/官方文件直接重現，且至少兩方獨立驗過
- **待驗**：設計、估算或單方結果，需 PoC 或實測
- **需產品決策**：技術無法定案，由維護者拍板
- **未執行**：刻意未跑，不得寫成通過

---

# 第一層：已重現的技術事實

以下每條至少經兩輪獨立重現。統計名稱一律帶口徑限定詞。

## 1.1 架構現況

- 全 `src/` 唯一 `createRoot()` 在 `App.tsx:762`；Messages／Me／My Sessions／NearbyDrawer
  的 UI ownership 已收斂（`main.js` 零 mount 鏈、`pageViews.js` 不存在）
- `SurfaceHost` 管 portal／render／Escape／Tab／focus；`sheets.ts` 仍管 WeakMap／close／
  backdrop listeners／isolation／unmount 順序——**共享現況，非單一 owner**
- 14 個 sheet adapters、14 個 unmount registrations、14 lazy sheets、3 lazy pages、1 eager module
- `SessionControllerState`：interface 與初始 store object 都是 **27 個同名 properties**
  （controller state schema，不代表 27 個 server-state 欄）
- `sessionViews.js`：**55 個 export declarations**（39 本檔＋15 `sessionPresentation`
  re-export＋1 `taipeiTime`）；**23 個 production-consumed exports**（唯一 importer `main.js`）；
  12 個功能測試使用；20 個無 production／功能測試外部 consumer（其中 13 個 re-export 被
  相容性 gate 動態讀取、部分 declaration 檔內仍用——**移除 export ≠ 刪 declaration**）
- `sessionViews.js` 有 **6 個 top-level wiring effects**：4 個跨模組 configure
  （`:383/:424/:439/:640`）＋2 個 preload listeners（`:621/:622`）。真寫 DOM 的 export 僅 2 個
  （`renderPlayerLayerToggle:196`、`renderMapDataStatus:213`）
- 測試 harness 耦合：11 支 browser test 檔內 **86 個 `__importAppModule("sessionViews")`
  call expressions**（非 production callers）
- `Object.freeze`：`sessionViews.js` 檔內 1 次（`:628`）；`src/` 全庫 28 次。
  `session-presentation-boundary.test.js:147-157` 的計數斷言是**單檔**口徑
- HTML renderer 現況：`innerHTML =` 3 處（`sessionViews.js:220/:224`、`sheets.ts:137` 防禦分支）、
  `dangerouslySetInnerHTML` 1 處（`SurfaceHost.tsx:209`）、非空 surface `html:` 2 處
  （`sessionViews.js:499` lazy shell、`sessionSurfaceViews.js:286` session detail shell）；
  `insertAdjacentHTML`／`outerHTML`／`DOMParser`／`createContextualFragment`／
  `document.write`／`setHTMLUnsafe` 全 `src/` 零命中
- Controller DOM：DOM 查詢／寫入 API 集合在 `src/controller/**` ＋ `src/sessionController.ts`
  **零命中**。browser port **seed** 10 項（見 §0b），全庫 inventory 未完成
- mutation 舊 scope：**17 檔／89 個 AST nodes**（TypeScript AST，API 集合＝
  textContent/hidden/disabled/className/innerHTML 賦值＋setAttribute/removeAttribute/append/
  appendChild/removeChild/replaceChildren/classList 呼叫＋dangerouslySetInnerHTML）。
  已知漏掃 `value=""`（`sessionSurfaceViews.js:169`）與 `inert`（`modalIsolation.js:14/:22`）
  ——**只能當 seed，不是正式基線**
- 持久 live roots 具名 5 個：`#player-layer-status`（`index.html:81`，legacy renderer 更新）、
  `#map-data-status`（`:84`，legacy innerHTML 重建內容）、`#nearby-sessions-count-status`
  （`:89`，`main.js:315-317` 原地 textContent）、`#toast-root`（`:123`，容器外／內容 React portal）、
  `#my-sessions-badge-status`（`App.tsx:591`，React 內）。`src/`＋`index.html` 的 `aria-live` 21 行命中（含 tests 為 31、全 tracked 45）——
  **五列是選定長駐 roots，非 inventory**。`sessionViews.js:485` 的 lazy 佔位**排除**於
  「不得重建」契約。`main.js:311-313` 引用 `#my-sessions-badge-status` 的註解已過期
- `loadDiscovery`：`src/` 共 **7 個 name-based call expressions**（含 wrapper 與下游，非 7 個獨立入口）

## 1.2 auth reconcile：五種行為契約（token refresh 為兩階段）

| 行為 | 動作 | 證據 |
| --- | --- | --- |
| 一般 discovery load | 只 reconcile detail | `discoveryMapController.ts:143-149` |
| quiet discovery refresh | 不 reconcile；surface 開啟時不啟動新 poll，但**在途 request 晚到仍落 state** | `:162-192`／`:302-309`；`requestGate.ts:51-60` |
| mySessions roster reload | reconcile detail＋chat | `mySessionsController.ts:319-329` |
| auth state apply | 先 reconcile detail＋chat，再 async participation reload | `authController.ts:144-161` |
| 同帳號 token refresh（**兩階段**） | 同一次 `applyAuthCandidate`（`profileOrchestrationFeature.ts:309-325`）內：先 `setAuthSession`（立即分支只 setState＋emit，`authController.ts:179-180`），再對非 null session `await reloadCurrentProfile()`：成功（`:289`）或 profile 未 ready 的失敗（`:279-281`）→ `setAuthState` → **reconcile**；**不 reconcile 的兩個出口**＝已 ready profile 的 reload 失敗分支，與 `:273` 的 stale 請求提前返回 | `profileOrchestrationFeature.ts:263-291` |

現有 `tests/session-controller-auth.test.js` 只測直接 controller 分支；
三個 token-refresh 結果分支**各需測試**（未完成驗證，見第二層）。

`authIdentity()`（`profileOrchestrationFeature.ts:118`）與 `sessionIdentity()`
（`profileAuthFeature.ts:22`）是**同語意重複實作**，皆 `user.id ?? access_token ?? null`；
寫入 `history.state` 的是前者（`main.js:424`）。auth-js `_isValidSession()` 不檢查 `user`，
被竄改／不完整的 storage session 可觸發 access_token fallback。
已確認修法（**尚未實作**）：兩處一併只認 `user.id`；缺少 `user.id` 的 session 採
**fail-closed**，視為無效 session，清除私人 state／cache／在途結果，回到公開頁面並要求重新登入。
不得只依賴 `main.js:495-500` 的 null 短路繼續保留不明 owner 的頁面。

## 1.3 Web Push 缺陷鏈

**環節（全部已重現）**：

1. `handleSignOut()`（`profileOrchestrationFeature.ts:177-184`）只 `signOut()`＋toast；
   auth-js 預設 sign-out scope `global`（撤 refresh token，**不刪 `auth.users`**）
2. `removePushSubscription` UI 層零 caller（僅 dataApi 轉發鏈＋1 個測試）；
   前端零 `PushSubscription.unsubscribe()`；SW 無 `pushsubscriptionchange` handler
3. `enableBrowserPush`（`notificationPush.js:29-36`）重用瀏覽器現存 endpoint；
   `:29` 在 `register()` 後直接用 `pushManager`，**未等 `navigator.serviceWorker.ready`**
4. `save_push_subscription` 對他人 endpoint 拋 `PUSH_ENDPOINT_OWNERSHIP`
   （migration `202607230001:168-169`）；row 不存在時直接 insert（`:172-178`）；
   `remove` 只刪呼叫者自己的列（`:197-201`）；grant 皆 authenticated-only（`:803-804`）
5. dispatcher 依 `recipient_profile_id` 一次讀出全部 subscriptions（`index.ts:84-90`）後才逐筆送
   （**snapshot race**：任何新增 filter 都擋不住已入記憶體的 row）；只在 404/410 刪列
   （`dispatch.js:35-36`→`index.ts:141-143`，**delete error 未檢查**）；四個 pg_cron 無一清理；
   `push_subscriptions` 恰 **6 欄**、無狀態欄、**零欄位 alter**（`:49` 有 enable RLS 的 alter）、無 TTL
6. **A→B takeover 經 rollback transaction 實證**：A save `OK` → A remove `OK` → B save `OK`
   → owner=B；配合前端重用邏輯構成完整條件鏈（非 browser E2E）

**兩個影響面**：跨帳號通知外洩（A 的通知續送 B 使用的瀏覽器）；推播功能持續性阻斷
（B 開推播撞 ownership、產品內無恢復路徑；UI 只有通用訊息「通知設定暫時無法更新」
`sessionActions.ts:356`，無 ownership 專用說明）。阻斷持續條件是「瀏覽器持續回傳同一
endpoint」；瀏覽器換發新 endpoint 後手動重按可恢復——**產品沒有自動恢復**，非「永久無法恢復」。

**外洩內容**：payload 恆五欄 `court/start_at/slots_remaining/message/url`（單一 builder
`202607230001:288-298`＋edge allowlist）；無 profile ID／暱稱／LINE／GPS／聊天正文。
私有增量：`title`（`dispatch.js:43-56` 查表）與 `message`（呼叫點寫死）**同級**揭露 A 的
參與角色；`session_reminder` 揭露人身時間地點。`seedAllTaipeiCourtSubscriptions`
（`notificationFeature.ts:137-148`）＋`court_new_session` 恆送（`202607270007:90`）
使**範圍**廣（頻率無 telemetry，不宣稱「高頻」）。

**風險表述（條件式，非必然）**：unknown/timeout 分支保留 A 的 active row 時，系統沒有
application-enforced 的停止投遞時間上限；若 endpoint 仍 active 且 A 有新事件，
該瀏覽器可能繼續收到 A 的球局摘要。

**帳號刪除**：`auth.users→profiles→push_subscriptions` cascade 存在；無自助刪帳 UI，
`privacy.html:178` 有來信刪帳路徑。直接 FK blocker **5 RESTRICT＋1 NO ACTION**
（`reports` 2、`private.legacy_*` 3、`session_messages.sender_profile_id` NO ACTION）；
沿 cascade 另 1 條：`profiles→sessions(CASCADE)→reports.session_id(RESTRICT)`
（rollback 實證 `blocked_constraint=reports_session_id_fkey`）。口徑限 FK；
trigger／stored procedure／hosted 未盤點。

**W3C 規格四條**：`unsubscribe()` resolve `false`＝該物件先前已 deactivated（非失敗）、
`true`＝UA 已排入平行 deactivation（Promise 不等 push service；service 側失敗規格為
SHOULD retry）——兩種回傳都不取代事後 `getSubscription()` 重讀；`/push-sw.js` 預設 scope `/`
屬 window-accessible，規格只強制非 window-accessible scope 在 unregister 時停用
（清站台資料行為仍需實機測試）；`Notification.permission` 是 origin 層，
repo 無帳號＋裝置 opt-in 記錄（`push_subscriptions` 無 consent 欄、`notification_prefs`
是六個 default true 的靜音旗標）；`p256dh` 是公鑰、私鑰不出 UA，
server 持有三元組不能證明瀏覽器持有私鑰。

## 1.4 Bundle 與 gate

fresh build **gate 相關列**（raw／gzip；上限；餘裕）。全 build 共 22 個 JS chunk，下表選列
有獨立上限或決策相關的 9 列；省略的 chunk（如 privateDataRepository 9,403/2,962、
EditSessionSheet 5,469/2,097、PlayerCardSheet 5,249/2,125 等）均在 lazy 上限內且計入 total：

| 項目 | raw | gzip | 上限 raw/gzip | 餘裕 raw/gzip |
| --- | ---: | ---: | --- | --- |
| main | 638,937 | 187,466 | 658,867 / 192,420 | 19,930 / 4,954 |
| total JS（含 push-sw.js） | 841,561 | 257,627 | 849,961 / 259,062 | 8,400 / **1,435** |
| MySessionsPage | 16,476 | 4,828 | 18,000 / 5,500 | **1,524** / 672 |
| SessionDetailSheet | 16,049 | 4,847 | 同上 | 1,951 / 653 |
| MePage | 15,473 | 4,949 | 同上 | 2,527 / **551** |
| CreateSessionSheet | 15,225 | 4,542 | 同上 | 2,775 / 958 |
| Sentry | 87,975 | 29,723 | 90,000 / 31,000 | 2,025 / 1,277 |
| SessionChatSheet | 5,277 | 2,079 | 18,000 / 5,500 | 12,723 / 3,421 |
| MessagesPage | 1,719 | 873 | 同上 | 16,281 / 4,627 |

CSS 65,865／10,857，**沒有 CSS byte-size gate**（demo-content 掃描仍含 CSS，
另有 CSS contract tests——不能寫「CSS 完全沒有 gate」）。

checker 口徑：**8 個 byte-limit constants；6 個 byte assertion call sites**（兩個逐 lazy chunk
執行）；**12 個 non-byte assertion call sites**（demo identifier 一個 site 迴圈 12 次），
含 `:48` 的 development build E2E hook 正向 canary（「production 不含 hook」可信的唯一前提）、
`:90/:104` 的 Sentry／private marker 不進 main、`:69` entry 恰 1、`:108` private chunk 恰 1。

**Sentry 分類弱點（canary 實證）**：分類只看 `sentry_version` 字串且只要求 ≥1 個命中；
checker 邏輯層可重放證實：帶 marker 的 chunk 會被歸 Sentry 桶套寬鬆上限，total gate 承重、
限制總增量但不擋分類錯置。（歷史 canary 記錄的 6,315 gzip／超上限 815 B 需 marker＋padding
兩步才能重現，該兩數字標**待驗**——單加 marker 僅 +20 B。）

**歷史 build 一致性**：9 份 tracked md 含 `index-BWygPPVv`（8 份 8/27–8/28 dispatch 報告
皆含精確 `638937/187466`）。8 字元 hash≈48 bits（單 pair 碰撞 ≈3.6×10⁻¹⁵；8 值任一 pair
≈9.9×10⁻¹⁴）——「高度一致的歷史紀錄」；因無歷史 artifact 雜湊，**不宣稱 byte-identical 已證明**
（殘餘風險含報告出處獨立性）。

**方案 E isolated probe**（esbuild 0.25.12，非 App PoC；探針 entry 內容影響逐位值，
跨環境重建差異約 ±60 B，**量級結論穩固、逐位數字標待驗**）：full `createClient`
約 209.9K/54.8K/46.2K（raw/gzip/brotli）vs `GoTrueClient+PostgrestClient`
約 113.3K/27.9K/24.0K，差約 96.5K/26.9K/22.2K。auth-js 與 postgrest-js 各自有官方
standalone 用法（auth-js JSDoc「Standalone import for bundle-sensitive environments」）；
**自行組合等價於 SupabaseClient 無官方保證**。兩者目前是 transitive（supabase-js 內部精確鎖
`2.110.0`；本專案 `package.json:53` 對 supabase-js 是 `^2.110.0`——兩層分開寫）。
RPC 全庫單一收斂點 `privateDataRepository.ts:146`；`PostgrestClient` 原生支援 `rpc`。

**方案 B ≠ E**：B（動態載入完整 client）只改載入時序、不減 total JS；且 boot 立即
`restoreAuth()`＋註冊 listener，「互動後才載 Auth」不符現況。

## 1.5 State、CSS、隱私、專案文件

- **state 六類**（工作分類，10 欄有多重身分）：遠端 payload 7（sessions/mySessions/
  mySessionRosters/blockedPlayers/players/profile/courts）；衛星 status/error 9；
  orchestration 2（authEpoch/authSession）；UI 4（filters/drawerState/playerLayerOn/bounds）；
  browser 4；投影 1（profileEligibility）
- `profileEligibility`：物化授權投影＋刻意 optimistic patch（`sessionController.ts:689`）；
  相關 helper **35 個靜態 call-site 行／6 檔**（排除定義檔的文字層計數，非 35 條獨立規則）
- `filters`：純前端過濾（`discoveryFeature.ts:109`）非 query key；`setFilter` 以
  `Object.assign` 就地變更（`discoveryMapController.ts:224-225`）
- `discoveryMessage`：**死狀態**（初值＋3 個 runtime 寫入、0 讀取）
- `courtsReady` 與 store 外 `courtCatalogueStatus`（`main.js:157`）成對消費（`profile.ts:33/:50`）
- payload 落地與 surface reconcile 是同步耦合（§1.2 的五種行為）
- **CSS**：13 個依序 imports（`main.js:8-20`）；50 個 custom-property declarations 全在
  `session.css`（`contrast-tokens` 測試以字母序 first-match 取值——此為載重前提，
  缺同名 token uniqueness gate）；`!important` 5 個 declarations（含 `motion.css:30`
  reduced-motion 必要用法）；`content-visibility` 契約是封閉集合（`CONTRACTS` 常數，4 selectors）；
  `@layer` 已於 batch-10 以三個特異性反例否決
- **blockedPlayers**：`refreshMyPlayerBlocks()` 恰 3 個 runtime call expressions
  （`main.js:458`、`chatController.ts:177` 於 `blockChatSender` 內、`mySessionsController.ts:234`）；
  auth identity reset 是**一筆 5-key setState**（`authController.ts:149-155`：blocked 3＋
  mySessions 2），`:148` 先 `blockedPlayerGate.invalidate()`；`mySessionsController.ts:228`
  有同步 `read().blockedPlayers.some(...)` 守衛；`me-page-dom.test.js:160` 鎖 `selectMeState` 9 keys
- **隱私出口**：已確認外送含 PostgREST GET query string（精確 bounds）、`update_my_presence`
  RPC body（raw GPS）、Google Maps JS、Vercel Analytics、Google Fonts、Sentry transport
  （DSN 有效時）、push 三元組入 Supabase、Supabase Auth 網路／OAuth redirect、
  Google avatar 圖片——**正式 egress manifest 未建，不宣稱固定總數**；
  access/refresh token 已在官方 session storage（`persistSession:true`），
  規則措辭必須排除官方 storage
- **專案文件過時四處**（性質不同）：`CLAUDE.md:73`／`testing.md:42` 字面仍真但漏 byte／
  結構 gates；`testing.md:49`（lint/prettier 實掃 js/mjs）與 `:56-57`（5 支 spec 非 4 支）不符；
  `check-production-bundle.mjs` 不命中任何 rules `paths`（精確結論：單獨讀改該檔時
  無規則自動載入保證）

---

# 第二層：未完成的技術驗證／實作

- token refresh 兩階段的三個結果分支測試（現有測試只蓋直接 controller 分支）
- browser port 正式 scope（四類：controller 禁止直讀 globals／可注入 platform adapters／
  UI 層合法 DOM globals／type-only references）與全庫 manifest——現有 10 項只是 seed
- mutation API 集合重定義（補 `value`、`inert` 等）與正式 symbol ledger
- 第三輪 7×6 候選表逐格重驗（舊表當 seed；其 `:515-519` 自帶「歸屬未逐一複驗」警語）
- 真實瀏覽器 Push lifecycle（清站台資料、permission 撤銷再授予、`pushsubscriptionchange`）、
  OAuth 雙帳號、takeover E2E
- dispatcher in-flight／delete failure／TTL 或 quarantine 的 integration tests
- production preview Playwright project；乾淨機器驗證（另需 Node ≥22.18、網路、Docker、
  `npm ci`、`npx playwright install --with-deps`）
- 方案 E 的 App-level PoC（門檻：Auth token 注入、PKCE、`detectSessionInUrl`、refresh、
  sign-out、`localSupabase.js` harness、production-equivalent 驗證；transitive→direct 依賴）
- FK 以外的 delete blocker（trigger／stored procedure／hosted schema）盤點
- 正式環境 telemetry（通知頻率、preload 使用率、LCP、interaction latency）

---

# 第三層：已確認的產品決策

| # | 已確認決策 | 尚待處理 |
| --- | --- | --- |
| P1 | Push 採「帳號＋裝置」opt-in；不能只靠 origin permission 自動替新帳號訂閱 | consent state／UI／RPC 由 FA-02 設計 |
| P2 | 一般登出只停止目前裝置的登入與推播；其他裝置不受影響 | 現行 auth-js 預設 global sign-out，需改成符合本機語意 |
| P3 | 換帳號必須重新 opt-in，不沿用上一帳號的同意 | identity switch 與 browser E2E 待建 |
| P4 | unknown／timeout 採 durable quarantine：立即停送、保留原 owner、暫不轉讓 endpoint | 需 migration／RPC／dispatcher filter／types／DB tests |
| P5 | dispatcher 送出前重查狀態；只接受 quarantine 寫入前已交給外部 push service 的通知無法追回 | snapshot race integration test 待建 |
| P6 | quarantine 保存期限、重新確認與到期處理不先猜數字；由 FA-02 提案後再核可 | 需先定義到期時刪除、延長封鎖或要求新 endpoint 的條件 |
| P7 | `ds-bundle/` 與 `.design-sync/` 保留並持續用於 UI/UX 優化 | 人工同步，使用前需對目前 UI/CSS 做全量重驗 |
| P8 | 開發期間 bundle bytes 只報告、不阻擋 CI；非 byte 的安全／隱私／拆包邊界仍 hard fail。第一個 production release candidate 前，以 route／裝置／網路／gzip／Brotli／Web Vitals 基線重訂並啟用 hard limits | FA-01 先做 checker 分流；正式數值待 production baseline |

---

# 第四層：分階段執行方案（實際狀態與授權以 implementation status 文件為準）

## 階段 -2：文件與規則對齊（授權類型：文字修正，不動 byte limits）

修 §1.5 四處過時＋checker 納 paths＋`main.js:311-313` 過期註解＋`session.css:12` token 註解措辭。
驗收：修正後描述與 `package.json`／`playwright.config.js`／checker 實況逐字相符。

## 階段 -1：Push 設計與派工單（授權類型：僅設計；runtime／migration 需另核可）

輸入：§1.3 全部事實＋第三層 P1–P6 的拍板結果。

**登出清理順序（六步，缺一不可）**：

1. A 尚有 session 時捕捉目前 `PushSubscription` 與舊 endpoint
2. 呼叫 `PushSubscription.unsubscribe()`
3. 解讀回傳：`false`＝該物件先前已停用；`true`＝平行 deactivation 已啟動（UA 隨即負有
   不再投遞義務，push service 側可能仍在重試）；例外／timeout＝unknown
4. 重讀 `getSubscription()`：null 或 endpoint 已不同 → 才刪捕捉到的舊 row；
   出現新 endpoint → 走 refresh reconciliation，不得掛給下一個帳號
5. unknown 或重讀仍同 endpoint → 進 durable quarantine：**立即停送、不刪 owner lock、不可轉讓**；
   保存期限與到期處理由 P6／FA-02 補齊
6. cleanup 成敗都不得阻止 `signOut()`

**同批必含**：登入後 auto-resubscribe 需 P1 的帳號層同意（不能只看
`Notification.permission`；技術檢查另用 `PushManager.permissionState()`）；
`serviceWorker.ready` 等待；`pushsubscriptionchange` handler（SW 內不可假設有 session，
留待前景已驗證流程同步）；VAPID key 比對；ownership error 的專用 UI 說明。

**驗收矩陣（分「既有」與「新建」）**：

既有（回歸鎖）：同帳號兩裝置 remove 單一 endpoint（DB/RPC rollback 已證）；
dispatcher 404/410 按 endpoint 刪（static/unit）；無 blocker fixture 的 auth cascade。

新建：A 正常登出（row 移除＋本機停用＋登出完成）；unsubscribe 失敗不轉讓 endpoint
（六步第 5 步）；server delete 失敗仍可登出＋殘留可被 404/410 或核可後的 quarantine policy 清；雙 cleanup 失敗有
提示與重試契約；A→B identity change 不外洩不誤訂；subscription refresh 同步；
permission 撤銷再授予可恢復；VAPID 輪替；間接 FK blocker（`reports.session_id`）情境。

## 階段 0a：純掃描 gate（授權類型：新增測試，不改 runtime）

- **Gate A（HTML renderer）**：AST 掃描 assignment/property，凍結 §1.1 現況六個 symbol；
  禁止面明列 `innerHTML=`／`insertAdjacentHTML`／`outerHTML=`／`dangerouslySetInnerHTML`／
  surface `html:`／`DOMParser`／`createContextualFragment`／`document.write`／`setHTMLUnsafe`；
  每種 API 一顆「加入即紅」canary
- **Gate B（controller DOM）**：掃 DOM API 集合（**不含 `document` 字面**——
  `visibilityTarget = globalThis.document` 注入預設值×2 在掃描範圍內屬合法 port）；
  斷言**被掃描的 source/AST input 非空**、違規結果為 0；ESLint 實作時不得新增與
  `src/**` 重疊的 config 區塊（flat config rules **replace 不 merge**，`eslint.config.js:97`）
- **syncCommit**：gate 已存在（`react-surface-lifecycle.test.js:109-118` 鎖
  `approvedCallers=["app/SurfaceHost.tsx","sessionStore.ts"]`＋`:114` 非空守門）——
  只補三拍 canary（現況綠→暫增第三 caller 紅→還原綠）
- **CSS import order**：固定 `main.js:8-20` 的 13 個順序；三拍（綠→交換任兩個紅→還原綠）

## 階段 0b：ownership 基線（授權類型：測試＋文件；owner 判定爭議報維護者）

- 先定義 mutation API 完整集合（§1.1 的舊 scope＋`value`／`inert`／其他），
  以 17/89 當人工查核輸入重建**正式 symbol ledger**（記檔案＋symbol＋API＋
  selector/ref 來源＋owner＋保留理由＋預定退役階段；**不用行號**）
- browser port manifest：先定四類 scope（§第二層），再重建清單；現有 seed 10 項
  ＝可注入 defaults ×5（`discoveryMapController.ts:105`／`sessionController.ts:170`／
  `requestGate.ts:46`／`pins.ts:135` 皆 `globalThis.document`；`playerPresence.js:21` 為
  geolocation default parameter）＋`Document` 型別 ×4（`discoveryMapController.ts:72`／
  `sessionController.ts:128`／`chatController.ts:57`／`appErrors.ts:127`）＋
  **未注入直讀 ×1**（`intentController.ts:492` 函式體內 geolocation）；
  已知另有 `appErrors.ts:129` HTMLElement realm check、`notificationPush.js`、
  `shareFeature.js`（`:25` `document.execCommand` 裸讀）、`authApi.ts` 等
- 4 個 React 外持久 live roots 的 **identity 測試**（頁面切換與資料更新後為同一 DOM 節點）

## 階段 1：已證明 dead／低風險清理（授權類型：runtime，限本清單）

| 項 | 連動 |
| --- | --- |
| 刪 `main.js:687` dead preload | 死因：`init()` 同步執行至 `:719` 才 `void boot()`，`:687` 時 `authSession` 恆 null、函式對 null no-op。**`:643` 是活的不可動** |
| `SurfaceSlot` 取消 export（`SurfaceHost.tsx:70`） | interface 純型別、零外部引用、emit 0 B |
| `PROFILE_PUBLIC_DISCLOSURE`／`sessionFormSheetRuntime` 只拿掉 `export` | 檔內 `:433/:657`／`:667` 仍消費；**不影響** `Object.freeze` 單檔計數 |
| 刪 13 個 presentation re-export（若做） | 須同批改 `session-presentation-boundary.test.js:21-35` `RUNTIME_EXPORTS` 與 `:147-158` 正則；freeze 計數預期值**不改** |
| 清 `prettier-ignore` 鷹架 | 其凍結的 F2D gate 已零殘留；同批重 format＋`prettier:check` |
| preload 清單調整 | 只改下載時機；**仍要 fresh build 驗證**（清單與事件邏輯改 main 程式碼，不保證 0 byte）；手機不依賴 hover |
| `ds-bundle` | 保留並持續維護；它是人工 design-sync 資料包，使用／同步前須對目前 UI/CSS 全量重驗 |

## 階段 2：production preview 與效能基線（授權類型：測試＋設定）

新增 build＋preview Playwright project（`package.json` 已有 `preview` script）。
同批修 `performance.spec.js:59-74`：dev 路徑斷言在 preview 下永不 match 且無 positive
control——改比 production chunk marker＋加「登入態下同一攔截器必須非空」的**正向對照（positive control）**。
`check-production-bundle.mjs` 加 brotli（`node:zlib` 內建）。
CDP 慢網路只當 Chromium 情境；WebKit 另用跨引擎方法或真機。
情境：未登入首進／已登入首進／OAuth callback 返回（零 fixture，最大缺口）／390px 慢網路／桌面。
產出是**記錄數字**，不新增時間類阻擋斷言。

## 階段 3：Bundle ADR（授權類型：僅設計＋PoC 設計；不安裝依賴、不改 gate、不建 alias）

分開比較：**A** 維持（facade 路線）；**B** 完整 client 動態載入（改時序不減 total；
現況 boot 即 restoreAuth）；**C** 子套件替身（高風險：9 具名 export＋可 `new`＋
`setAuth` 可用＋production-equivalent 執行測試，缺一不可）；**D** 正式調 gate（前置見 P8）；
**E** 直接組合（探針量級見 §1.4；PoC 門檻見第二層；不因省最多直接選定）。
ADR 須保留 checker 全部 12 個 non-byte assertions（含 `:48` dev canary）並處理
Sentry 分類弱點（斷言恰 1 或改 manifest 分類）。

## 階段 4：結構 gate manifest 化＋wiring 移植（授權類型：runtime，gate 先行）

- 把讀 `sessionViews.js` 字面的結構 gate 遷至既有 `tests/fixtures/surfaceManifest.js`
  （81 行、3 個 import consumers——**已存在勿重建**）
- 必保三類：lazy 名冊（eager 1／lazySheets 14 且 key===import 字面／lazyPages 3／
  authSession 才 warm）；架構契約（單一 root、flushSync 檔內唯一＋caller 恰 2、
  14 unmount registrations、close 順序）；可及性契約（4 導覽目的地、aria-expanded/controls、
  Escape preventDefault+stopPropagation、toast live region）
- 可退役純字面凍結 5 條：`react-surface-lifecycle.test.js:138/:143/:180`、
  `session-presentation-boundary.test.js:114/:138-144`
- 隱私契約（private/LINE/demo/E2E hook）在 checker 與 `session-data-boundary.test.js`，
  搬 gate 不得遺失
- wiring 順序：先改 gate → 抽共用 surface loader 底座（`deferSurfaceOpen` 維持 function
  宣告）→ 原子搬 4 個 configure（form 最後）→ 搬 2 個 listener 與
  `configureSessionViewModules` → 最後才評估 facade 退役（86 個 harness calls 綁檔名，最貴）
- 驗收固定：新 gate 綠 → 新 wiring 綠 → 舊 bridge 刪 → 舊 gate 退役
- 搬檔後 mutation ledger 按 symbol 重掛

## 階段 5：blockedPlayers 零依賴 facade PoC（授權類型：runtime）

API：`load()`／`refresh()`（接住 3 個既有入口）／`clearForAccountChange()`（**必含
`blockedPlayerGate.invalidate()` 語意**——gate 世代與 authEpoch 是兩層各自足夠的防護，
不得拆掉）／`getSnapshot()`／`subscribe()`。

驗收：`SessionControllerState` 移除三欄；`mySessionsController` 對三欄 setState 歸零；
**`authController.ts:149-155` 的一筆 5-key setState 拆成兩筆**（blocked 3 keys 走 facade、
mySessions 2 keys 留原位）；`mySessionsController.ts:228` 同步守衛有新取得路徑；
account switch 呼叫 `clearForAccountChange()` 且上一帳號資料不可讀；
MePage 行為不變（`me-page-dom.test.js:160` 的 9-key 斷言同批改）；
零新依賴；不改 route；不改 data API/RLS/RPC。
四不變量：account invalidation／request generation／auth snapshot／observable-state 原子性。
若無法在不增複雜度下完成→停止擴大 facade，不用 Query library 掩蓋。

## unread command（先於或同批於 6A）

`chatController.ts:98` 的 `context.session.unreadMessageCount = 0`（就地變異 store 陣列
元素、繞過 setState）改為 `mySessionsController` 擁有的 `clearMySessionUnread(sessionId)`；
權威來源 `my_session_participations.unread_message_count`。

## 階段 6A：Chat feed／server-state ownership（授權類型：runtime；不改 route）

Chat 是**低依賴候選**——「最佳」需 6A 開工前以下表為 seed **逐格重驗**後決定。
Seed 表（複製自第三輪；**各格歸屬為 agent 判定、未逐一複驗，各格相加不等於分母**
（有共用與跨屬），僅供相對比較，不可當精確配額；「bundle 餘裕」欄全部是餘裕＝上限−實測）：

| 維度 | Chat+Messages | Player Dir | My Sessions | Me | Discovery drawer | Create-Edit-Join |
| --- | --- | --- | --- | --- | --- | --- |
| controller open* 歸屬（分母＝`SessionControllerOptions` 的 12 個 `open*`，`sessionController.ts:106-120`） | **1** | 3 | 3 | 0 | 1 | 6 |
| surfaceRegistry（/11） | **1** | 3 | 2 | 0 | 1 | 4 |
| SURFACE_TRANSITIONS（/15） | **2** | 7 | 4 | 0 | 2 | 9 |
| store 欄位（/27） | **0** | 4 | 4 | 5 | 12 | 全共用 |
| route（定性維度） | `#tab-messages` | 無 | 有 | 有 | 無 | `#/session/:id` |
| lazy chunk gzip 餘裕 | Chat 3,421／Msg 4,627 | 3,375–4,790 | 672 | 551 | 無 lazy chunk | Detail 653／Create 958 |
| 測試呼叫點歸屬（分母 86） | **5** | 18 | 20 | 17+6 | 13 | **41** |
「零 store 欄」≠「零 server state」：chat server state 在
surfaceRegistry context（messages/roster/lastMarkedMessageId）與 `mySessions[]` 元素。

不可被 facade 取代的三機制：`requestGate.issue()` 遞增世代（取消上一次 in-flight）；
`authSnapshot` epoch 比對（identity/gate/readiness 任一變即失效——授權語意）；
`surfaceRegistry.is("chat", context)` 的 context identity 比對。
保留 quiet/loud polling、visibility、read cursor、archived 唯讀、account switch 清除。
`ReportDialog` 明確排除（與 `openRosterParticipantReport` 共用）。

## 階段 6B：Messages route ownership＋bridge 退役（授權類型：runtime）

Messages route 單一 source；back/forward 與 heading focus（`main.js:478`）單點控制；
刪對應 facade/bridge。驗收：`#tab-messages` deep link、browser back/forward、
未登入→登入→返回、account switch 清 chat state、stale polling 不落地、archived 唯讀、
unread 正確通知 My Sessions/Bottom Navigation、chat 正文不進 push payload、
focus/Escape/aria-live 不退步、對應 legacy 有實際刪除。

---

# 驗收規則（每個 runtime 批）

環境前置（乾淨機器另需 Node ≥22.18、網路、Docker daemon）：

```text
npm ci                                          # 已有 node_modules 可略
npx playwright install --with-deps chromium webkit
npx supabase start                              # test:local 前置
```

共同必跑（依 `testing.md:51-52`：改 `src/` runtime 即不得豁免 `test:local`）：

```text
node scripts/generate-courts-seed.mjs --check
npm run typecheck
npm run lint
npm run prettier:check
npm run test:mock
npm run test:mock:webkit        # 本機失敗仍回非零；CI 為 continue-on-error
npm run test:local
npm run test:local:mobile       # CI 無條件跑
npm run build
npm run check:production-bundle
git diff --check                # 不查 untracked；新文件另用 --no-index
```

（核心九條＝`test:ci:frontend` 的八條在 `test:mock` 後插入 `test:local`。
guarded reset 是「完整乾淨驗證」的標準前置、非每次重跑的技術必要，且屬破壞性操作
不得隱性執行。）

條件必跑：有 migration → `npm run test:db`；涉 Auth/Supabase client/push/private cache/
account switch → 另加人工或自動驗證（與指令分開列）：OAuth/PKCE/refresh/sign-out、雙帳號切換。

每批不變條件：不改未核可 UX/文案/隱私 allowlist；account switch 不留私人 DOM/store/cache/
push endpoint ownership；deep link/back-forward/focus/Escape 不退步；raw GPS/LINE/
access token（除官方 session storage）不進可序列化結構；bundle 有 before/after
raw/gzip/brotli；lazy/private/Sentry chunk 邊界不退步；新 gate 必有 canary；
新架構有對應 legacy 刪除或明標前置批。

---

# 不建議做的事

不重寫全案；不重搬已完成的 UI ownership；不導入 `@layer`；不直接刪 `syncCommit`；
不為消 warning 提高 limit；不把 `manualChunks` 當下載量改善；不同時導入多個
Router/Query/state framework；不在 production-only alias 缺執行測試時替換 Supabase 子套件；
不因方案 E 省最多直接選定；UI 不直查 raw table；不把 Map SDK 內部 DOM 搬給 React；
不把 React 外持久 live roots 搬入會重建的 subtree（lazy 佔位不在此列）；
不刪白箱 gate 除非新 gate 已證涵蓋同一契約；不先搬資料夾再找 owner；
不用行號當 ledger/allowlist 基線；否定存在性必全庫掃；統計必附口徑與產生指令。

---

# 附錄：verifyCommand 集（抽樣）

```bash
# bundle 全表（與 checker 同口徑）
npm run build && npm run check:production-bundle
node -e 'const fs=require("fs"),z=require("zlib"),p=require("path");const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p.join(d,e.name)):[p.join(d,e.name)]);const js=walk("dist").filter(f=>f.endsWith(".js"));let R=0,G=0;for(const f of js){const b=fs.readFileSync(f);R+=b.length;G+=z.gzipSync(b).length;}console.log("total",R,G);'

# mutation 舊 scope 17/89（AST；正式 ledger 需先擴 API 集合）——完整腳本內嵌如下
node --input-type=module <<'NODE'
import fs from 'node:fs'; import path from 'node:path'; import ts from 'typescript';
const exts=new Set(['.js','.ts','.tsx']); const files=[];
(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const t=path.join(d,e.name);
if(e.isDirectory())walk(t);else if(exts.has(path.extname(e.name)))files.push(t);}})('src');
const asg=new Set(['textContent','hidden','disabled','className','innerHTML']);
const call=new Set(['setAttribute','removeAttribute','append','appendChild','removeChild','replaceChildren']);
let nodes=0; const touched=new Set();
for(const f of files){const k=f.endsWith('.tsx')?ts.ScriptKind.TSX:f.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS;
const src=ts.createSourceFile(f,fs.readFileSync(f,'utf8'),ts.ScriptTarget.Latest,true,k);
(function v(n){let hit=false;
if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(n.left)&&asg.has(n.left.name.text))hit=true;
if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)){if(call.has(n.expression.name.text))hit=true;
if(ts.isPropertyAccessExpression(n.expression.expression)&&n.expression.expression.name.text==='classList')hit=true;}
if(ts.isJsxAttribute(n)&&n.name.getText(src)==='dangerouslySetInnerHTML')hit=true;
if(ts.isPropertyAssignment(n)&&n.name.getText(src)==='dangerouslySetInnerHTML')hit=true;
if(hit){nodes+=1;touched.add(f);} ts.forEachChild(n,v);})(src);}
console.log(JSON.stringify({files:touched.size,nodes}));
NODE
# → {"files":17,"nodes":89}

# 其他統計
grep -c "registerUnmount" src/sessionViews.js                  # 14
sed -n '183,209p' src/sessionController.ts | grep -c ":"       # 27（初始 store properties）
grep -nE "^import \"\./.*css\"" src/main.js | wc -l            # 13
grep -rn "important" src/*.css | grep -v "註解\|/\*\| \* " | grep -c "!important"   # 宣告行 4（motion.css:30 一行含 2 個 declaration，共 5 個 declarations；另 discovery.css:7 為註解）
grep -oE "\-\-[a-z][a-z0-9-]*\s*:" src/session.css | grep -v "^\." | wc -l          # 50（declarations；一行可多個。全庫同 pattern 58 中 8 個為 .chip--x: 類 BEM selector 誤匹配）

# sessionViews 口徑
grep -c "^export " src/sessionViews.js   # 41（39 本檔 declarations＋:29 re-export 區塊起始＋:625 taipeiTime）
grep -rho '__importAppModule("sessionViews")' tests | wc -l    # 86
grep -n "Object.freeze" src/sessionViews.js                    # :628 唯一

# push 缺陷鏈
grep -rn "removePushSubscription" src/ | grep -v "dataApi\|Repository"   # UI 層空
grep -rn "pushsubscriptionchange\|serviceWorker.ready" src/ public/      # 空
sed -n '168,169p;172,178p;197,201p' supabase/migrations/202607230001_notifications_web_push.sql

# auth 兩階段
sed -n '309,325p' src/features/profile/profileOrchestrationFeature.ts
sed -n '263,291p' src/features/profile/profileOrchestrationFeature.ts
sed -n '172,181p' src/controller/authController.ts

# FK blocker（direct 5+1）
grep -rn "references public.profiles" supabase/migrations/*.sql | grep -iE "restrict|no action"
sed -n '57p;95p' supabase/migrations/202607170003_public_taipei_tennis_sessions.sql

# browser port seed
grep -rn "globalThis.document\|globalThis.navigator" src/ --include='*.ts' --include='*.js' --include='*.tsx'

# 行為契約五種
grep -rn "reconcileActiveDetail\|reconcileActiveChat" src/controller/ | grep -v "function\|:.*//"
```
