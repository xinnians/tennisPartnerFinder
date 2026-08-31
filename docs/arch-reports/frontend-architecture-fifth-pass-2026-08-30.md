# 前端架構第五次獨立驗證

日期：2026-08-30

檢查對象：`frontend-architecture-fourth-pass-2026-08-29.md`

程式基準：HEAD `a14e81ecf88fbdd87f7b7f77fe0ffcf4d22b6343`

## 0. 驗證規則

這份文件不把前四份架構文件當成事實來源。證據只取自：

- 目前工作樹的 `src/`、`supabase/`、`tests/`、`scripts/` 與設定檔
- 重新執行的 build、bundle 計算、TypeScript、ESLint 與 unit tests
- Git 物件內的歷史版本
- 安裝中的 Supabase 套件原始碼與官方 Supabase 文件

本文只使用三種標記：

- **已證實**：可由檔案、指令或測試直接重現
- **不成立**：目前程式碼能直接反證
- **不能當成事實**：屬優先級、好壞比較或尚未實作的設計判斷

## 1. 結論

第四輪報告的數字大多正確，列出的五個派工阻礙也大致成立；但它仍不能直接當最終派工單。

派工前至少還要修正四個地方：

1. Gate B 把 DOM mutation 與 `Document` port 混成同一條規則；若要管 browser port，
   掃描範圍還漏掉 `src/requestGate.ts`。
2. 推播的「永久損壞」與「P0」不是程式碼可直接證明的事實，應改成可驗證描述。
3. Sentry 分類 gate 的弱點成立，但仍受 total JS gate 限制，不能寫成可無限制吞掉回歸。
4. 隱私外送清單不完整；另外，Supabase 子套件是否可單獨使用已可由官方資料確認，不再是未知項。

因此，正確下一步是先產生一份修正版 final candidate，再決定是否派工；不應直接照第四輪的文字執行。

## 2. 第四輪五個阻礙的逐項判定

### 2.1 Gate B：問題成立，但第四輪建議仍不完整

**已證實：** final candidate 指定的掃描範圍 `src/controller/` 加 `src/sessionController.ts` 內，
小寫 `document` 目前有兩筆：

- `src/controller/discoveryMapController.ts:105`
- `src/sessionController.ts:170`

它們都是 `visibilityTarget = globalThis.document`，不是 DOM 查詢或寫入。

三個 `Document` 型別位置也已證實：

- `src/controller/discoveryMapController.ts:72`
- `src/controller/chatController.ts:57`
- `src/sessionController.ts:128`

`src/requestGate.ts:43` 也有 `visibilityTarget = globalThis.document`，但不在 final candidate 的
掃描範圍內。若 Gate B 只管 DOM 查詢／寫入，這不是違規；若它同時要管 controller 使用的
browser port，這就是漏掃。因此兩個目的不能混成一條文字 gate。

所以不能把「兩個 runtime 預設值」與「三個型別宣告」混成同一份 allowlist。建議拆成兩條規則：

- Gate B 只禁止 controller 的 DOM 查詢與寫入 API，例如 `querySelector`、`innerHTML`、
  `classList`、`textContent`、`createElement`
- 另立 browser port 規則，決定 `Document`／visibility adapter 可以出現在哪些檔案；
  這條必須包含 `src/requestGate.ts`

目前 controller 掃描範圍內沒有 DOM 查詢或寫入，這句成立；「完全沒有 document」不成立。

### 2.2 identity 函式指錯：已證實

兩個函式都有相同 fallback：

- `sessionIdentity()`：`src/features/profile-auth/profileAuthFeature.ts:22`
- `authIdentity()`：`src/features/profile/profileOrchestrationFeature.ts:118`

真正寫入 `history.state` 的是 `main.js:424` 呼叫的 `authIdentity()`。

修法應同時把兩個重複實作收斂成 `user.id ?? null`，不能只改 `sessionIdentity()`。
`main.js:495-500` 已對 null 做短路，所以不需要拿另一個可序列化識別值代替 access token。

安裝中的 `@supabase/auth-js` 2.110.0 `_isValidSession()` 只檢查 `access_token`、
`refresh_token`、`expires_at`，不檢查 `user`。所以正常 session 不會走 token fallback，
但被修改或不完整的 storage session 仍可能走到；第四輪對觸發條件的描述成立。

### 2.3 dead preload：已證實

兩個 runtime call site：

- `main.js:643`：帳號 identity 改變後執行，仍有作用
- `main.js:687`：`init()` 內執行，此時 `boot()` 尚未開始、`restoreAuth()` 尚未執行，
  controller 初始 `authSession` 是 null，因此固定 no-op

只能刪 `main.js:687`，不能用模糊的「刪 preload 呼叫」派工。

### 2.4 aria-live：第四輪修正成立

React 外持久節點共有四個：

- `#player-layer-status`
- `#map-data-status`
- `#nearby-sessions-count-status`
- `#toast-root`

React 內另有 `#my-sessions-badge-status`，合計五列。

`#player-layer-status` 與 `#map-data-status` 都由 `sessionViews.js` 的 legacy renderer 更新，
owner 欄應使用相同口徑。

`sessionViews.js:485` 的 `[data-lazy-surface-status]` 是暫時 loading shell，成功載入後本來就會被
surface 內容取代。它應列入 HTML renderer 帳本，但不應加入「不得重建」契約。

### 2.5 CSS gate 階段衝突：已證實

final candidate 同時把 CSS import 順序 gate 放在階段 0 與階段 1，且又說它不是清理工作。

建議歸到**階段 0**。理由很直接：13 個 CSS import 的順序目前就是 cascade 契約，
gate 是後續清理前要先建立的保護，不是清理本身。

## 3. Web Push：可證明的風險與不能過度宣稱的部分

### 3.1 已證實的完整鏈條

- `handleSignOut()` 只呼叫 Supabase `signOut()`，沒有清除 push subscription
- 專案沒有 `pushManager.unsubscribe()`
- Service Worker 沒有 `pushsubscriptionchange` handler
- `removePushSubscription()` 有 data API 實作，但 `src/` 沒有 UI 或流程呼叫它
- `enableBrowserPush()` 會先用 `getSubscription()` 重用瀏覽器現存 endpoint
- `save_push_subscription` 遇到同 endpoint 的不同 profile 會拋 `PUSH_ENDPOINT_OWNERSHIP`
- `remove_push_subscription` 只能刪目前登入 profile 自己擁有的 endpoint
- dispatcher 仍依 A 的 profile 查詢並發送到 A 留下的 endpoint
- dispatcher 只在 push service 回 404 或 410 時刪 endpoint
- 四個 cron job 都沒有執行 push subscription 帳號生命週期清理

因此，在同一瀏覽器 profile 中 A 登出、B 登入，而且原 subscription 仍有效時：

1. A 的通知仍可能送到現在由 B 使用的瀏覽器。
2. B 再按「開啟推播」會重用相同 endpoint，並被 ownership RPC 拒絕。
3. 目前產品內沒有自動接管或恢復這個 endpoint 的流程。

### 3.2 「永久損壞」不成立為可驗證事實

程式碼只能證明「只要原 endpoint 仍有效，產品內沒有恢復路徑」。它不能證明永遠不會恢復；
dispatcher 本身就處理 push service 日後回傳 404／410 並刪除 endpoint 的情況，
但 repo 無法證明這何時或一定會發生。

因此文件應使用「持續性功能阻斷，且目前無產品內恢復路徑」，不要寫「永久無法開啟」。

「P0」也是專案優先級判斷，不是原始碼能證明的數據。可以把它排在第一優先，
但應把原因寫成已證實的跨帳號通知與無恢復路徑。

### 3.3 實際 payload

資料庫 payload 固定有五欄：

- `court`
- `start_at`
- `slots_remaining`
- `message`
- `url`

Edge Function 會再用相同五欄 allowlist 過濾。dispatcher 另依 `event_type` 產生 `title`。
Service Worker 顯示的通知 body 是 `message + court`，點擊目標使用 `url`。

已證實沒有 profile ID、暱稱、LINE、GPS 座標或聊天正文；chat push 的 message 是固定字串
「群組有新訊息」。但這不會消除跨帳號風險，因為 title、固定 message、球場、時間與
「這台裝置仍被當成 A」的關聯仍會透露 A 的邀請、加入結果與球局活動。

新建 profile 會嘗試訂閱全部台北市球場；`court_new_session` preference 固定為 true。
這是通知量的放大因子，但只有在球場清單已載入且 seed RPC 成功時才會發生。

## 4. Bundle 數字：Fresh build 精確結果

本輪先重新執行 `npm run build`，再依 `check-production-bundle.mjs` 的同一口徑重算。

| 項目 | 實際 raw | raw 上限 | raw 餘裕 | 實際 gzip | gzip 上限 | gzip 餘裕 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| main | 638,937 | 658,867 | 19,930 | 187,466 | 192,420 | 4,954 |
| total JS | 841,561 | 849,961 | 8,400 | 257,627 | 259,062 | 1,435 |
| MePage | 15,473 | 18,000 | 2,527 | 4,949 | 5,500 | **551** |
| SessionDetailSheet | 16,049 | 18,000 | 1,951 | 4,847 | 5,500 | 653 |
| MySessionsPage | 16,476 | 18,000 | **1,524** | 4,828 | 5,500 | 672 |
| CreateSessionSheet | 15,225 | 18,000 | 2,775 | 4,542 | 5,500 | 958 |
| Sentry | 87,975 | 90,000 | **2,025** | 29,723 | 31,000 | 1,277 |

第四輪的這組數字全部可重現。CSS 是 65,865 raw／10,857 gzip，沒有 byte gate。

### 4.1 非 byte gate

`check-production-bundle.mjs` 有 12 個非 byte `assert` 呼叫點；其中 development build 的
E2E hook 正向 canary 是 final candidate 唯一漏列的一項。第四輪這個判斷成立。

### 4.2 Sentry 分類弱點的正確定性

已證實：

- Sentry chunk 只靠 `sentry_version` 字串分類
- 只要求至少一個 Sentry chunk，不要求恰好一個
- 被判為 Sentry 的每個 chunk 都套用較大的 per-chunk 上限

但第四輪的「可吞掉大幅回歸」少了一個限制：total JS raw/gzip gate 仍會套用，
目前 total gzip 只剩 1,435 B。這個洞會讓 chunk 分布異常不易被發現，
但不能在總量沒有同步下降時無限制增加 bundle。

### 4.3 年度 10% 與 `max()` 公式

已證實舊 10% 是 main chunk 靜態 headroom；final candidate 的年度 10% 是 total gzip 累積治理，
兩者不是同一規則。保留累積治理概念是合理的。

第四輪列出的 `+2,452 / +890 / +3,008 / +646` 也能算出來，但它使用腳本註解中的歷史基準
`654,771 / 191,396 / 16,912 / 5,122`。final candidate 寫的是「實際引入後的穩定基準」，
沒有指定一定使用這四個歷史數字。

所以「沒有新依賴也一定直接放寬四個常數」不能當成已證實結論。真正問題是公式沒有定義：

- 基準取哪次 build
- lazy 的 1% 是每個 chunk 還是所有 lazy 總和
- 修改上限後的 failure canary
- 年度 total gzip 的起算點與紀錄位置

這四項先定義，方案 D 才能評估。

### 4.4 方案 E 探針與官方使用狀態

使用本機 esbuild `0.25.12`、相同 stdin、minify 與 ESM 條件重跑：

| 組合 | raw | gzip | brotli |
| --- | ---: | ---: | ---: |
| `createClient()` | 209,906 | 54,785 | 46,174 |
| `GoTrueClient + PostgrestClient` | 113,352 | 27,929 | 23,962 |
| 差額 | **96,554** | **26,856** | **22,212** |

數字成立，但仍只是獨立探針，不是真實 app build 的節省量。

「子套件是否受官方支援」已有答案：安裝中的 `auth-js` 原始碼明列
`Standalone import for bundle-sensitive environments`，`postgrest-js` README 也提供直接安裝與
`new PostgrestClient()` 範例。Supabase 官方 repo 將兩者列為官方 feature client。

因此可以說「單獨使用套件是官方提供的用法」；但本專案自行組合 auth token、apikey、PKCE、
refresh、OAuth callback 與 PostgREST fetch wrapper 的正確性，仍要由 PoC 和 local tests 證明。

官方參考：

- [Supabase auth-js README](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/README.md)
- [Supabase postgrest-js package](https://github.com/supabase/supabase-js/tree/master/packages/core/postgrest-js)
- [Supabase 官方 client library 清單](https://github.com/supabase/supabase)

## 5. blockedPlayers 與 Chat + Messages

### 5.1 blockedPlayers

已證實 `refreshMyPlayerBlocks()` 有三個呼叫點：

- `main.js:458`：開啟 Me 頁
- `chatController.ts:177`：封鎖 chat sender 後
- `mySessionsController.ts:234`：解除封鎖後

facade 若實作，必須保留：

- `blockedPlayerGate.invalidate()` 的帳號切換取消語意
- `mySessionsController.ts:228` 的同步 membership read
- `authController.ts:149-155` 中 blockedPlayers 與 mySessions 狀態拆開寫入

所以 facade 可以做，但 `clearForAccountChange()` 必須同時 invalidate in-flight request；
不能只把三個 store 欄位清空。

### 5.2 Chat + Messages

已證實 chat server state 目前不全在 `SessionControllerState`：

- messages、roster、lastMarkedMessageId 在 `surfaceRegistry` 的 chat context
- unreadMessageCount 在 `mySessions[]` 元素
- `chatController.ts:98` 直接改 `context.session.unreadMessageCount = 0`

把這筆 mutation 改成 `mySessionsController.clearMySessionUnread(sessionId)` 是正確 ownership 方向。
但 request generation、authSnapshot epoch 與 surface context identity 都是授權／取消機制，
不能被一般 cache facade 取代。

「Chat + Messages 是最佳第一片」不能當成可驗證事實；它是架構選擇。
目前可證明的是：它已有獨立 lazy page/chunk、具名 chat controller、surface context 與現成測試，
因此是低依賴、可切割的候選。是否為最佳，仍要和其他候選使用同一比較表決定。

## 6. 其餘枚舉與既有成果

下列數字已由目前程式碼或測試 manifest 重算：

| 宣稱 | 結果 |
| --- | --- |
| `SessionControllerState` 27 欄 | 27，成立 |
| `main.js` CSS imports | 13，成立 |
| React sheet adapters | 14，成立 |
| lazy pages | 3：Me、Messages、MySessions，成立 |
| production `syncCommit` callers | 2：`sessionStore.ts`、`SurfaceHost.tsx`，成立 |
| React app root | 1，unit gate 成立 |

final candidate §2.1／§2.2 的完成項目也能由目前程式與測試支持：主要 pages/sheets 已是 React、
SurfaceHost 管 portal 與 surface lifecycle、舊 page slot 檔已不存在、`sheets.ts` 已完成、
private repository 與 Sentry 均為 lazy chunk、type-aware ESLint 規則目前通過。

另有一個確實存在但原清單未實名列出的雙 ownership：`main.js:419` 寫 page section 的 `hidden`，
`main.js:478` 對 React 產生的 Messages heading 做 focus。

final candidate §18 的授權清單與 §19 階段表也確實沒有逐階段對齊。這是文件內部矛盾，
修正版必須把每個階段標成「只可設計」、「可落測試／gate」或「可改 runtime」。

## 7. Gate A 與 mutation 帳本：補答第四輪未完成的 Q7／Q8

### 7.1 Gate A

目前 production source 的 HTML renderer 路徑可實名列出：

- `sessionViews.js`：兩筆 `innerHTML =`
- `sheets.ts`：close 時一筆 `innerHTML = ""`
- `SurfaceHost.tsx`：一筆 `dangerouslySetInnerHTML`
- 非空 surface `html:`：lazy loading shell 與 session detail shell 各一處

final candidate 的掃描集合能找到這些現況，但純文字掃描仍可被 computed property、alias 或新的
DOM parser API 繞過。可接受的做法是：

1. 用 AST 掃描 assignment／property name，不用單純 grep 計數。
2. 凍結上述既有 symbol，而不是只凍結檔案總數。
3. 對每種禁止 API 做「加入後會紅」的 canary。
4. 明列 `DOMParser`、`createContextualFragment`、`document.write`、`setHTMLUnsafe`、
   `insertAdjacentHTML` 與 `outerHTML`。

在 gate 尚未實作並完成 canary 前，不能宣稱 Gate A 已可放行。

### 7.2 Mutation 帳本

本輪用 TypeScript AST 掃描 final candidate 指定類型的超集合（另含 `className`、HTML 與結構 mutation），
得到 **17 檔、90 個候選點**。
這個數字包含合法的 App/SurfaceHost/Maps adapter，也包含 React 節點被外部 imperative code 更新的點。

因此只記「每檔幾筆」仍不足以判斷 ownership。帳本最少要記：

- 檔案與 symbol
- mutation API
- selector／ref 來源
- 節點 owner
- 保留理由與預定退役階段

這樣能把誤報壓低；若只用 regex 與每檔總數，不能作為可靠 gate。

## 8. 隱私與外送邊界

`persistSession: true` 會把 Supabase session 放進指定 storage；這是現有登入機制的一部分。
所以規則應寫成：access/refresh token 除 Supabase 官方 session storage 與必要 Authorization header 外，
不得進 URL、history.state、log、analytics、自建 cache key 或錯誤 payload。

本輪最少確認到下列實際外送：

- PostgREST GET query string：地圖 bounds 與時間窗
- `update_my_presence` RPC body：原始 lat/lng
- Google Maps JavaScript
- production Vercel Analytics
- Google Fonts（`fonts.googleapis.com`／`fonts.gstatic.com`）
- 設定有效 DSN 時的 Sentry event transport
- Push endpoint、p256dh 與 auth key 經 RPC 存入 Supabase

第四輪列到前四類，但漏了其餘三類，不能稱為完整外送清單。

`history.pushState`／`replaceState` 會把 state 做 structured serialization 並存入 session history entry，
因此 access token 不應拿來當 page owner identity。參考
[WHATWG HTML Standard](https://html.spec.whatwg.org/multipage/nav-history-apis.html#dom-history-pushstate-dev)。

## 9. 專案規則文件的實際過時處

第四輪列的三項都成立：

- `CLAUDE.md:73` 只把 bundle checker 描述成 demo nickname gate
- `.claude/rules/testing.md:42` 同樣漏掉 byte 與其他結構 gate
- `.claude/rules/testing.md:56-57` 寫四類 mock spec，Playwright regex 實際有五類，
  多 `react-page-focus.spec.js`

另新增一項已證實的過時描述：`.claude/rules/testing.md:49` 說 lint 與 Prettier 只掃 TS/TSX，
但目前 package scripts 也掃 `src/**/*.js`、`tests/**/*.js|mjs` 與 `scripts/**/*.js|mjs`。

`.claude/rules/react-migration.md`、`testing.md`、`supabase.md` 的 paths 都沒有涵蓋
`scripts/check-production-bundle.mjs`。若要讓 bundle gate 的禁止放寬規則自動生效，必須補 path。

## 10. 測試命令的精確說法

`test:ci:frontend` 有八個步驟；final candidate 的九行是這八步中插入 `test:local`。
第四輪這項更正成立。

`npx supabase start` 是 local tests 的必要環境前置。guarded reset 是專案「完整乾淨驗證」的
標準前置，但它不是每次重跑 `test:local` 的技術必要條件，而且是破壞性操作，不能隱性執行。

完整驗收清單還應包含：

- `npm run test:mock:webkit`
- `npm run test:local:mobile`，或等價的 `supabase-mobile-chromium`
- 人工驗證項與 shell 指令分開

## 11. 第四輪本身無法獨立驗證的數字

以下是第四輪對自身工作流程的描述，不存在可由 repo 重跑的原始紀錄：

- 13 名 agent
- 73 條不符
- 95 項 read-back
- 23 筆 FAIL
- 11 條同型錯誤複發
- 第二／三／四輪的 FAIL 比率

這些數字不能被本輪標成「已證實」，也不應拿來決定技術方案。本文已直接重跑相關程式與數字，
不使用上述 agent 統計作為證據。

第四輪也明說沒有完整回答 final candidate 的全部 30 題。本文補了最直接影響階段 0 的 Q7／Q8，
但沒有把「30 題全部回答」當成完成條件；尚未做 PoC 或尚未實作的 gate，只能保留為待驗設計。

## 12. 本輪實際執行結果

已執行並通過：

- `npm run build`
- `npm run check:production-bundle`
- `npm run typecheck`
- `npm run lint`
- `npm run test:session-unit`：349 tests passed、0 failed
- `git diff --check`
- 新文件另以 `git diff --no-index --check` 檢查

Local Supabase status 可正常讀取，API 指向 `127.0.0.1:54321`。本輪沒有執行 guarded reset、
pgTAP 或 local Playwright，因為本次工作是唯讀文件驗證，未取得清除／改寫本機測試資料的授權。

## 13. 可派工版本應採用的順序

1. 先把本文件列出的事實修正回 final candidate。
2. Web Push 另立一份小型設計與測試矩陣，先定 endpoint 在登出、換帳號、多分頁與失效事件下的 owner。
3. 階段 0 先實作 Gate A、Gate B、syncCommit canary、mutation manifest、aria-live contract 與 CSS order gate。
4. gates 實際三拍通過後，再做 dead preload、export 與註解清理。
5. 建立 preview performance baseline 後再裁決 bundle ADR。
6. blockedPlayers facade 與 Chat + Messages 都保留為候選，但不再使用「最佳」或「零 server state」等無法直接證明的字句。

整體框架仍建議保留 Vite + React。現有問題集中在 ownership、生命週期、route、server-state 與 gate，
目前沒有證據顯示改成 Next.js 能直接解決這些問題。
