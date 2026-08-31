# 整合決策草案——第三次確認

日期：2026-08-29
對象：`docs/arch-reports/frontend-architecture-consolidated-plan-2026-08-29.md`（以下稱「草案」）
基準：HEAD `a14e81e`
方法：草案 §15 的十八題，十一題派 opus agent 實測、五題由主對話拍板

> **本文已經過三名 opus agent 的 read-back 驗收**（137 + 45 + 22 項檢查，共 38 筆 FAIL）。
> 首版的錯誤已全部修正，逐筆紀錄見 §7。
> 讀本文時請注意 §1 的證據分級：**只有 §1 列出的 11 項是主對話親自複驗**，其餘為委派查證。

前置文件：`frontend-architecture-review-2026-08-29.md`（第一份）、
`frontend-architecture-review-second-pass-2026-08-29.md`（第二份）

---

## 0. 三個必須先於架構討論處理的發現

### 0.1 現存的跨帳號推播外洩（與重構無關，建議立刻修）

`[已驗證]` 這不是重構才會產生的風險，是**現在就成立的缺陷**。
read-back agent 獨立重建了整條鏈並做了六項主動反證，全部支持結論：

| 環節 | 證據 |
| --- | --- |
| `removePushSubscription` 在 **UI 層**零 caller | `src/` 全庫只有 6 筆，全在 `dataApi.ts:74/:75` → `dataRepository.ts:206/:246` → `privateDataRepository.ts:345/:346/:577` 的轉發鏈；`pages`／`sheets`／`features`／`controller`／`app`／`main.js`／`notificationPush.js` 全零。（`tests/notification-data-api.test.js:95` 有一個測試 caller） |
| 登出不解除訂閱 | UI 觸發點 `MePage.tsx:723` → 接線 `main.js:667` → `profileOrchestrationFeature.ts:177-184` 的 `handleSignOut()` 全文只有 `signOut()` + toast |
| 派送仍會找到該 endpoint | `notification-outbox-dispatch/index.ts:87-89` 依 `recipient_profile_id` 查 `push_subscriptions` |
| 訂閱不會自動失效 | 同檔 `:141-143` 只在 `result.removeSubscription` 時 delete，而 `dispatch.js:36` 只在 **404／410** 時回 true。`src/` 全庫**零 `pushManager.unsubscribe()`**，所以登出後瀏覽器端訂閱仍有效、push service 不回 410 |
| 第二個帳號無法接管 | `202607230001_notifications_web_push.sql:168-169` 的 `raise exception 'PUSH_ENDPOINT_OWNERSHIP'`；且 `notificationPush.js:30-35` 是 `existing ?? subscribe()`，B 拿到的就是 A 的同一個 endpoint |
| B 也刪不掉 A 的列 | 同 migration `:198-200` 的 delete 以 `profile_id = viewer_profile_id` 收斂 |

六項反證全部未推翻結論：`push_subscriptions` 無 TTL、無 cron 清理（只有 `profiles on delete cascade`）；
`notification_prefs` 三欄 `default true`；定案與取消恆送；`push-sw.js` 無 fetch handler／Cache API。

**外洩的內容範圍**（首版誇大，已更正）`[已驗證]`：
`chat_message` 的 payload message 是資料庫**硬寫的固定字串** `'群組有新訊息'`
（`202607270004_chat_block_hardening.sql:567`、`202607270003_session_chat.sql:350`），
而 `push-sw.js` 的 body 只取 `message` + `court`。**聊天內容從不進 payload** ——
這與 CLAUDE.md 的 Web Push 紅線一致。

所以實際落到 OS 通知列的是：**球場名、開始時間、缺額，以及 `#/session/:id` 深連結**。
仍屬私人活動軌跡外洩，但不是「群訊內容外洩」。

**建議修法**（read-back 補了兩項，缺任一項都不完整）：

1. 在 `handleSignOut()` 內、`signOut()` 之前，取 `pushManager.getSubscription()` 並依序呼叫
   `removePushSubscription(endpoint)` 與 `subscription.unsubscribe()`，兩者 best-effort。
2. **同批必須加**「登入後偵測 `permission === "granted"` 但無 subscription 時自動重新訂閱並 save」
   —— `enableBrowserPush` 的唯一觸發點是使用者按鈕，全庫無自動路徑，
   否則單人裝置登出再登入會**永久靜默**。
3. **必須明講此修法只縮小時間窗**：它不解決「不登出就換人」這個主場景。
   真正的接管需要動 migration（`remove_push_subscription` 只刪呼叫者自己的列、
   `save_push_subscription` 對他人 endpoint 直接拋例外）。

**與草案 §16 的關係**：這是 runtime 變更且落在 auth 路徑上，**不在草案 §16「可做」清單內**。
建議先出派工單、待核可後執行，不要當成可逕行處理的小修。

### 0.2 草案 §14 與 `.claude/rules/testing.md` 直接衝突

`[已驗證]` `.claude/rules/testing.md:51-52` 原文：

> 只要批次修改 `src/` 的 runtime 程式碼，就不得豁免 `npm run test:local`；只有純測試檔、
> CI 設定或文件批次可豁免。`npm run test:db` 維持零 migration 即可豁免的判準。

草案 §14 把 `npm run test:local` 放進「對 Supabase client、Auth 或 private cache 的變更，另需」
的條件區 —— 等於把它從預設必跑降級成條件必跑。照草案現況派工，每一批都會踩到同型誤判。

修法：把 `test:local` 移回共同驗收條件並照規則檔原文寫判準；`test:db` 留在條件區。
另建議把「相關 Node unit tests／相關 Playwright journeys」改成具名入口
（`npm run test:ci:frontend` 已含 `prettier:check`），「相關」二字讓執行者可以自選範圍。

### 0.3 調整 bundle gate 的門檻比草案理解的高

我在第二份文件把 gate 寫得像技術定律，草案 §1 批評得對。但草案 §6 結尾
「bundle gate 是專案維護政策，不是永遠不可調整的技術定律」在**本專案的規則體系裡仍然過寬**。

`[已驗證]` `.claude/rules/react-migration.md:46` 原文：

> 本次不解凍 `data-testid`、id、class、aria、文案與既有 e2e 斷言 oracle 語意、`dataApi` 邊界與
> 隱私 allowlist；**production bundle gate 不得任意放寬。這些契約仍是一票否決，任何批不得變更。**

所以調 gate 不是「寫個 ADR 讓維護者批准」，而是**先修訂一條寫明「任何批不得變更」的規則檔**。
草案 §6.1 方案 D 應明寫這個前置步驟與批准者。

---

## 1. 證據分級

- `[已驗證]`——主對話本輪親自開檔複驗，附行號與原文。
- `[委派查證]`——agent 實測並附引用；主對話**未**逐條重跑。
- `[委派查證·已複驗]`——另有 read-back agent 獨立複驗過。
- `[推論]` / `[不確定]`——未實測，或需額外資訊才能定案。

**主對話親自複驗的共 11 項**：`react-migration.md:46`、`testing.md:51-52`、
`react-surface-lifecycle.test.js:109-118` 的 syncCommit gate、`index.html` 的四個 aria-live 節點、
方案 E 的 esbuild 對照、`PostgrestClient` 的 `rpc` 支援、RPC 單一收斂點、
`removePushSubscription` 零 UI caller 與 `handleSignOut` 不解除訂閱、
dispatch 的派送與清除條件、chat payload 的固定字串、
四個 lazy chunk 的 gate 餘裕、`ControllerApi` 的 `open*` 成員數。

**其餘結論皆為委派查證**，包含驅動 §5 管線調整的 Q3／Q4／Q9／Q11／Q14 等。
派工前應對要照抄進派工單的行號再複驗一次。

---

## 2. 十八題答覆

### Q1 「每個 DOM 子樹一個 owner」——**同意，這是草案最重要的改進**

第二份文件只指出「React 唯一 owner 在 Maps 處不可達成」，沒給替代原則；草案 §4 補上了缺口。

**但 aria-live 那條例外必須實名化，而且草案引用的理由已經過期。** `[已驗證]`
`index.html` 共 4 個 `aria-live` 節點：

| 節點 | 位置 | 現況 |
| --- | --- | --- |
| `#player-layer-status` | `index.html:81` | React 外 |
| `#map-data-status` | `index.html:84` | React 外，由 `sessionViews.js:213` 以 innerHTML 重建 |
| `#nearby-sessions-count-status` | `index.html:89` | React 外，由 `main.js:315-317` 原地更新 textContent |
| `#toast-root` | `index.html:123` | **容器在外、子節點由 React portal 擁有**（第四類） |

`main.js:311-313` 的註解拿 `#my-sessions-badge-status` 當同模式對照，但那個節點
**已經在 React 內**（`src/app/App.tsx:591`）——註解已過期。

建議：§4.1 改列上述實名清單並標註四者差異，同時對每個 React 外的 live region 補一條
**「不得被重建」測試**（現況只有屬性斷言）。這是第二份文件 §5 Q13 指出的缺口，應併進階段 0。

### Q2 §3.1 已完成清單是否準確——**準確，但漏列兩條大型管線**

`[委派查證]` §3.1 的 10 條逐條複驗全部屬實，無一需要重派；§3.2 的九條也全部仍然成立。

**漏列的兩條**（同樣屬於「已完成，不應重新派工」）：批 6（6A–6F）核心 TypeScript 化
全案完結（2026-08-28，12 檔轉 strict）；ESLint type-aware 恢復管線全案完結
（`a14e81e`，baseline 246 筆全清），驗收紀錄 `docs/arch-reports/eslintCL-closing-acceptance-2026-08-29.md`。

**兩條歸屬要修**：「private repository 動態載入」與「Sentry 獨立 lazy chunk」不屬於 roadmap 的
React ownership 驗收標準，來源是 F4-3／bundle 批，守門在 `check-production-bundle.mjs`。

**§3.2 兩條措辭低估現況**：路由早已是 `PAGE_ROUTES` 單一映射 + 單一寫入點 `setActivePage`
並帶跨帳號 owner 防護（`main.js:183/:416/:483/:495`）；CSS 已有掃描集覆蓋 gate
（`tests/contrast-tokens.test.js:29-34`），缺的只是**順序**守門。

### Q3 四條凍結 gate 是否都能低誤報實作——**三條可以，一條不行**

`[委派查證]`

| 條 | 可實作性 | 說明 |
| --- | --- | --- |
| (a) 不得新增 `innerHTML` renderer | 可，但**漏了後門** | surface mount 的 `html:` 選項會走 `SurfaceHost.tsx:209` 的 `dangerouslySetInnerHTML`，只擋 `innerHTML` 等於留後門 |
| (b) 不得新增 React 節點外部 mutation | **不可實作** | 「這個節點是不是 React 擁有」在原始碼文字裡不存在。`main.js:317` 的 `.textContent =` 是刻意的非 React 持久節點（自帶理由註解），`sessionSurfaceViews.js:129` 卻正是要禁的——**兩者字面完全一樣**。只能降級成「凍結基線帳本，只擋總數變多」 |
| (c) 不得新增 `syncCommit` caller | **已存在，不必新增** | `tests/react-surface-lifecycle.test.js:109-118` 用 `assert.deepEqual` 鎖 `approvedCallers`，`:114` 已有非空守門；`eslint.config.js` 另擋 `flushSync` 直接匯入。正確工作是加一顆 canary 證明它有牙 |
| (d) 不得新增 controller → DOM | 可 | 現況零命中，做成回歸鎖即可。**但必須 assert 掃描集非空** |

**allowlist 的表達方式要與 Q12 一致**：不能用 `file:line` 寫死。Q12 的階段 4 會把
`sessionViews.js` 的內容搬走，屆時所有行號錨定的 allowlist 會整批假紅。
(a) 與 (b) 都應改成**每檔計數或符號定位**。

實作陷阱 `[委派查證]`：(d) 若用 ESLint 實作，不能新增與 `src/**/*.{js,ts,tsx}` 重疊的 config 區塊
——`eslint.config.js:97` 明寫 flat-config rule arrays **replace rather than merge**，
重疊會靜默拔掉既有的 data facade 與 react-dom 邊界限制。

**草案的 allowlist 描述對不上實測**：草案說「Google Maps、pins、map data status 等命令式路徑」，
但 `src/pins.ts` 完全沒有 `innerHTML`、沒有 `syncCommit`、也不在 controller 層。
allowlist 必須**按 gate 分別列**。

### Q4 階段 1 七項是否真零風險——**分四類，不是同一等級**

`[委派查證]`

| 類別 | 項目 |
| --- | --- |
| 真零風險（4） | `main.js:687` 死 preload、`SurfaceSlot` 取消 export（interface 純型別，emit 0 B）、token 註解、`ds-bundle` 標唯讀 |
| 需同批改測試（1） | 刪 `sessionViews.js` 死 export（範圍見下方修正） |
| 需同批 reformat（1） | `prettier-ignore` 鷹架 — 不改測試，但 `prettier:check` 會紅 |
| 不是清理而是新增守門（1） | CSS 順序 gate — 零 bundle、零 runtime，但**必須自證有牙** |

兩個補充：

- 有兩個「零 caller」export **不可整條刪，只能拿掉 `export` 關鍵字**：
  `PROFILE_PUBLIC_DISCLOSURE`（檔內 `:433`／`:657` 消費）與 `sessionFormSheetRuntime`（`:667` 消費）。
- **草案誤稱守門位置**：擋路的是 `session-presentation-boundary.test.js`，不是
  `tests/fixtures/surfaceManifest.js`。

**首版的排序建議已撤回**（read-back 指出理由不成立）：若照上述處方——兩個零 caller export
只拿掉 `export` 關鍵字——`sessionViews.js` 的 `Object.freeze` 計數仍為 1、15 個 re-export
名字不變，`session-presentation-boundary.test.js:147-158` 與 `:160-167` **都不會翻紅**。
所以這一項可以留在階段 1；真正會踩到 gate 的是刪除 13 個 presentation re-export 那一批，
那批才需要同批改測試。

八個 bundle 常數全是 `<=` 上限，所以這七項只要是**刪碼方向就不可能撞 gate**。

### Q5 `ds-bundle/` 如何處置——**先問你一件事，不該由工程批次決定**

`[委派查證]` 它是一次性手工交付的下游快照，既不是 SoT 也不是生成物。程式碼 consumer 零命中、
不進 build、不影響 gate。git history 只有兩個 commit，都在 2026-08-21 同一小時內。

**關鍵發現**：這個目錄在 **2026-08-17 曾被拍板「不保留」並刪除過一次**，
08-21 又被重新建立並首次入版，**沒有任何文件記錄翻案理由**。需要你確認 08-17 的拍板是否仍有效。

技術面：它已 rot（對 HEAD 有 28 條 src-only 宣告缺漏、7 處引用 3 個不存在的檔案，
`README.md:32` 自稱「逐字複製」已是假的）；且是**不完整副本**（README 索引 19 張卡，本機只有 9 張）。
**不要選「移到文件區」**——要連帶改 `.design-sync/` 三份設定卻不解決任何 rot。
若刪除，同批必須改 `.design-sync/config.json:6` 與 `conventions.md:7,32`。

### Q6 效能基線缺什麼——**缺的是前置條件，不是某個指標**

`[委派查證]` `tests/performance.spec.js` 名為 performance，實際是「狀態／焦點／版面回歸」套件：
13 個 test 只有一條牆鐘時間斷言（`:112`），**零 PerformanceObserver、零 CDP、零網路節流**。

八個指標中有四個（JS parse/execute、四 sheet chunk 時序、preload waterfall、實際傳輸量）
在現有 harness（`npm run dev`）下量出來的數字**不可轉移到 production**。

最高槓桿的前置是**新增一個跑 `npm run preview` 的 Playwright project** —— 它一次解鎖那四個指標。
最低成本起手：**在 `check-production-bundle.mjs` 加 brotli**（`node:zlib` 內建，零新依賴）。

慢網路與慢 CPU 用 `context.newCDPSession(page)` + `Network.emulateNetworkConditions` +
`Emulation.setCPUThrottlingRate`，**不需新套件**；LCP 用 `PerformanceObserver`，**不需 web-vitals**。
四個情境中「OAuth callback 返回」**零 fixture 零測試**，是最大缺口。

**紀律提醒**：階段 2 的產出應是「記錄數字」而非「新增阻擋斷言」。既有唯一的時間預算之所以
留了 `TENNIS_DISCOVERY_SHELL_BUDGET_MS` 逃生門（`testing.md:40-41`），就是因為共用 runner
timing 不穩；新加的時間類指標若直接當 gate，會重演同一個問題。

### Q7 四個 bundle 方案是否完整——**不完整，且草案字面的第五方案省 0 bytes**，見 §3

### Q8 預算公式——**沿用 gate 自己已有的公式，只重設 baseline**

`[已驗證]` gate 註解裡已經寫著公式：`check-production-bundle.mjs:8` 是
「One 4 KiB raw / 1 KiB gzip maintenance window」，`:17` 是
「A 1% ceiling prevents split-induced growth」。所以不需要發明新公式：

```text
新上限 = 該次實測值 + 維護窗口（raw 4 KiB / gzip 1 KiB，或總量的 1%，取大者）
```

防止無限放寬，補三條約束：

1. 每次重設必須在 ADR 記錄「為什麼這個依賴值得這些 bytes」，並附**真實裝置效能對照**
2. 年度總預算：total gzip 一年內累計成長不得超過 10%，超過必須先還債
3. 一次只能為一個依賴重設，禁止「先預留空間」

加上 §0.3 的前置：修改 gate 常數前，必須先修訂 `.claude/rules/react-migration.md:46`。

### Q9 state 分類是否準確——**涵蓋面正確，單一歸屬錯誤**

`[委派查證]` 六類剛好把 27 欄不重不漏切完，可以當清單用；但逐欄實測後有 **10 欄同時具備
第二種以上身分**。三個必須修的分類錯誤：

| 欄位 | 草案分類 | 實測 | 只按一類搬會壞掉什麼 |
| --- | --- | --- | --- |
| `profileEligibility` | 本地推導 | **授權投影**：`main.js:174-180` 在 store 外算出後物化寫入（`authController.ts:144`），且 `sessionController.ts:689` 有不重算的樂觀 patch | 換成即時推導的 selector 會刪掉刻意保留的樂觀路徑；它是全庫約 30 個授權判斷的唯一輸入 |
| `filters` | UI / query input | **純前端過濾**：從不進資料層，唯一消費是 `discoveryFeature.ts:109`。真正的 query key 只有 `bounds` | 兩者搬遷方式相反。另外 `setFilter` 以 `Object.assign` 就地變更同一物件（`discoveryMapController.ts:224-225`），先修可變性再談 key 化 |
| `discoveryMessage` | query 衛星狀態 | **死狀態**：4 個寫入點、**0 個讀取點**；使用者看到的錯誤字串是 `discoveryFeature.ts:116-117` 硬寫的 | §7.1「純三態樣板」若照抄這一欄，會把死碼一起樣板化 |

另外三點：

- **`authEpoch` 是五重語意**：identity 變更、profile gate 變更、readiness 變更、in-flight 取消 token、
  **React/DOM pending-action 重置鍵**。最後一項跨到命令式 DOM（`sessionActions.ts:107-112`），
  任何「authEpoch 只是 orchestration」的搬遷都會靜默壞掉按鈕殘留清除。
- **§7 只列 store 內 27 欄，漏了 store 外的查詢狀態**：`main.js:157` 的 `courtCatalogueStatus`
  與 `profileOrchestrationFeature.ts:109-112` 的 `profileLoadStatus` 等。其中 `courtsReady` 與
  `courtCatalogueStatus` 必須**成對消費**（`profile.ts:33/:50`）。
- **payload 落地與 surface 生命週期是同一個同步動作**：`sessions` 落地後同步呼叫
  `reconcileActiveDetail`（會關 detail sheet），`mySessions` 落地後同步呼叫
  `reconcileActiveChatParticipation`（會關 chat sheet）。搬進任何非同步 query cache 時
  必須同時搬走這條規則，否則 sheet 會停在過期權威資料上。

### Q10 不導入 Query 的最小 server-state 實驗

**首版推薦 `blockedPlayers` 三欄，兩條理由都被推翻，已重寫。** `[已驗證]`

| 首版理由 | 實測 |
| --- | --- |
| 「單一寫入者 `mySessionsController.ts:199-213`」 | **至少三個寫入者**：`mySessionsController.ts:199`／`:212`、`authController.ts:150-152`（identityChanged 時清空）、`sessionController.ts:203-205`（初始 seed） |
| 「同時被 MePage 與 MySessionsPage 讀，跨頁面」 | **不成立**：`grep blocked src/pages/MySessionsPage.tsx` 零命中，只有 MePage 消費 |

但這個推翻本身揭示了一件更有價值的事：**「單一寫入者」這個判準對任何私人資料的
server-state 都不成立**，因為帳號切換清除路徑必然是額外的寫入者，而且那條路徑是隱私必要的。

所以判準要改寫成：

```text
單一「載入」寫入者 + 一條帳號切換清除路徑 + status/error 為 1:1 + 不碰 Maps/GPS/route
```

用修正後的判準，`blockedPlayers` **仍是最好的候選**（它是唯一 status/error 完全 1:1 的三聯欄），
但驗收條件必須改成三條，且不得宣稱跨頁面解耦：

1. `SessionControllerState` 少掉這三欄
2. `mySessionsController` 對這三欄的 `setState` 呼叫歸零
3. **`authController.ts:150-152` 的帳號切換清除改由 facade 提供的顯式 API 完成**
   （不是消失——那條路徑是隱私必要的）

第 3 條是這個實驗真正要證明的東西：**facade 能不能把「載入」與「隱私清除」兩種寫入
表達成不同的 API，而不是都退化成 `setState`。** 這正是導入任何 server-state cache 前
必須先回答的問題（見 Q16）。

### Q11 結構 gate 改 manifest 要保留什麼——**兩支 gate 裡一條隱私契約都沒有**

`[委派查證]` 匿名 private repository 與 LINE 零殘留**都不在**這兩支測試內，它們分別在
`scripts/check-production-bundle.mjs` 與 `tests/session-data-boundary.test.js`。

必須保留的只有三類：**lazy-loading 名冊**（`eagerModules` 恰 1、`lazySheets` 14 且每個 key ===
自身 import 字面、`lazyPages` 3、preload 只在有 `authSession` 時 warm）、
**架構契約**（單一 React root、`flushSync` 只在 `syncCommit.ts` 出現一次且 caller 恰兩個、
14 個 surface 都註冊 unmount、close 先 unmount content 再 destroy shell）、
**可及性契約**（4 個導覽目的地、`aria-expanded`／`aria-controls`、Escape 的
`preventDefault`+`stopPropagation`、`#toast-root` 的 `aria-live`）。

**可直接退役的純字面凍結有 5 條**：`react-surface-lifecycle.test.js:138`／`:143`／`:180`、
`session-presentation-boundary.test.js:114` 與 `:138-144`。

**另有一支已經空轉的 gate**：`performance.spec.js:59-74` 的匿名 private repository 斷言
比對 `/src/data/repositories/privateDataRepository.ts` 這條 **dev server 路徑**
（`playwright.config.js:30` 跑 `npm run dev`）。改成 build+preview 會變成
`/assets/xxx-<hash>.js` 而永遠不 match；而且它**連一個 positive control 都沒有** ——
它現在就已經是「空集合掃描也綠」的形狀。這與 Q6 的 preview project 要一起處理。

### Q12 四個 configure 的搬移順序

`[委派查證]` 四者之間**沒有先後依賴**（`src/views/` 四檔互不 import），真正的約束在共用底座。
而且 top-level 副作用其實是 **5 個不是 4 個** —— `:620-623` 還有 pointerover/focusin listener。

**`AppServicesProvider` 不適合承接**：它是 `App.tsx:769` render 內的 React context，
而 configure 目標是 controller 呼叫的命令式模組，必須在首次 render 前完成 wiring。
正確 owner 是 `main.js`（已是 composition root）或它 import 的新 wiring 模組。

```text
步驟 0  先改 gate（:73-78 是 deepEqual 全名冊，舊 gate 站著時四個 configure 只能原子搬）
步驟 1  抽共用底座到 src/views/surfaceLoaders.js，sessionViews 改 re-export 維持相容
        （deferSurfaceOpen 必須維持 function 宣告或搬到使用點之前）
步驟 2  原子搬四個 configure：discovery → sessionSurfaces → profile → form（form 最後）
步驟 3  搬 listener 與 configureSessionViewModules
步驟 4  最後才刪 facade（86 個 e2e 呼叫點用 __importAppModule("sessionViews") 綁死檔名，最貴）
```

### Q13 先測 route 還是 server-state——**server-state 先**

1. route 需要新依賴（或自行實作），卡在 bundle 決策；server-state facade 可以零依賴先做
2. route 改動同時碰 deep link、OAuth callback、Vercel rewrite（目前無任何 rewrites）三個外部面
3. server-state facade 是純內部重構，可在單一 feature 內完成並驗證
4. Q10 已給出可開工的最小實驗與修正後的驗收條件

### Q14 第一個 vertical slice——**Chat + Messages**，見 §4

### Q15 CSS 暫定規則是否衝突——**不會整體衝突，但三條要加但書**

`[委派查證]`

1. **「responsive 規則優先放 feature 鄰近處」要加但書。** agent 把 `responsive.css` 的宣告
   逐條算過搬家後的層疊勝負，**flip 數 = 0**，所以今天可行；但這個安全是偶然的 ——
   所有競爭宣告都是 `(0,2,0)` 的 `.surface.<sheet>`，靠特異性贏、與檔序無關。
   應補但書：**只有當 feature 檔位於所有同特異性競爭宣告之後才可搬**。
   （首版把 `vocabulary.css` 的 `.chip` @media 稱為「方向相反的反例」是**誤讀** ——
   `.chip` 的定義本體就在該檔，把 @media 放進 feature 自己的檔正是草案建議的方向。已刪除該定性。）
2. **「避免跨 feature selector」只禁不給替代方案。** 既有的跨檔複合 selector
   （如 `pages.css:130` 的 `.me-sign-in-card .session-primary`，而 `.session-primary` 的家在
   `map-page.css`）正是全站按鈕覆寫的既有機制。只禁而同時又禁 `!important` 會形成無出路的雙禁。
   應改成「不新增**新的**跨 feature 耦合，既有的維持現狀」並給替代做法。
3. **「不新增 `!important`」缺 `prefers-reduced-motion` 例外**：`motion.css:30` 的
   `* { animation-duration: 0.01ms !important }` 是無法用特異性取代的必要用法。

**兩支測試的互動草案完全沒寫**：

- `tests/contrast-tokens.test.js`：「token 只在 session.css 定義」**是它正確性的載重前提** ——
  它把 CSS 檔按字母序串接後用 first-match 取 token，任何字母序更前的檔定義同名 token 會
  **靜默劫持**讀到的顏色值。草案把這條寫成整潔偏好，沒說明真正理由。
- `tests/content-visibility-contract.test.js:68` 是 `deepEqual` 封閉集合，任何新 CSS 出現
  `content-visibility: auto` 或 `contain-intrinsic-size:` 會**立刻翻紅**。

（首版在此節引用的三個 CSS 計數——responsive 宣告數、`__` 選擇器數、跨檔複合 selector 數
——經 read-back 以多種口徑重算皆無法復現，**已全部移除**。這些數字不影響上述結論，
但若要寫進派工單需先定義計算規則再重新產生。）

### Q16 Query 隱私規則是否足夠——**不足，但漏的不是 cache 層**

`[委派查證]` 九條在 QueryCache 這一層大致正確，但漏掉三個 QueryCache 管不到的面：

1. **push 訂閱**（見 §0.1）—— 目前唯一可證明成立的跨帳號外洩，且與 Query 無關。
2. **raw location 的真正風險在 query key 不在 MutationCache**：raw GPS 早已在 controller store
   （`intentController.ts:509`），而 discovery 天然以 `bounds` 為參數。§12 只要求 key 含 identity、
   **完全沒禁座標**。應改寫成「`userLocation` 與 `bounds` 的精確座標不得進入任何 query key、
   mutation variables 或錯誤上下文；需要 scope 時只能用不可逆的粗粒度代號」。
3. **`history.state` 夾帶 identity**：`main.js:424` 把 `sessionIdentity` 的結果寫進 history state，
   而它的 fallback 是 `access_token`。應補「access_token 不得出現在 history state、URL、
   query key 或任何序列化結構」。

反過來，草案擔心的幾件事**現況已有保護**：Sentry 只送三個 enum tag、
Service Worker 沒有 fetch handler／Cache API、sheet 關閉會真的 unmount、
MePage 本地 state 都有 `useEffect` 對權威值重同步。

另一條要改寫：§12 說「production 不得包含 Query Devtools」正確，但容易被誤讀成
「production 沒有可觀察狀態」。**React DevTools 擴充功能在 production build 一樣讀得到
component state**，而 chat 訊息就在 `SessionChatSheet.tsx:69` 的 `useState` 裡。

**`removeQueries` 的掛載點需要先盤點**（首版誤述，已更正）：首版寫「現況清除是
`authController.ts:121-158` 一整條，含 presence tracker、notification settings」，
但 read-back 實測該檔（184 行）對 `presence`／`notification` 零命中。
正確做法是**派工前先實際盤點帳號切換清除路徑的全部參與者**，再寫「Query 的 `removeQueries`
必須掛進同一條路徑並由同一個測試守住」。這與 Q10 第 3 條驗收是同一件事。

### Q17 是否把 gate 當成可過早調整的政策——**見 §0.3**

草案方向對（gate 是政策不是定律），但門檻寫得太低。缺的前置證據有三項：
修訂 `react-migration.md:46` 的批准者、真實裝置效能對照、以及「這個依賴為什麼值得這些 bytes」
的書面理由。

### Q18 草案中證據不足的句子——**17 處，5 處屬 blocking**

`[委派查證]` 五處 blocking 已分別寫進 §0.2、§0.3、§2 Q3、§2 Q4、§2 Q1。

草案在三個地方系統性失真：

1. **把第二份文件的硬結論改寫成軟措辭**：§6 的「Router 或 Query 套件在實測前不能直接加入」
   暗示量完就可能放行；正確表述是「任何使 `dist/` 全部 `.js` 的 gzip 總和增加超過 1,435 B 的
   新 runtime 依賴都會翻紅」——實測不會產生餘裕。
2. **把已存在的東西寫成待建工作**：syncCommit gate（已存在）、
   `tests/fixtures/surfaceManifest.js`（已存在，三支消費者）、CSS feature 前綴（已是慣例）。
3. **數字缺漏**：§6 的數字區塊漏了 Sentry chunk gzip 餘 1,277 B；
   §10 的 `src/` root 散檔只點名 13 個，實際是 42 個 `.js/.ts` + 13 個 `.css` = 55 檔。

另有兩處實測**完全成立、可直接沿用**：§8 的 preload 優先序倒置、§5.2 的 syncCommit 保留 2 個。

---

## 3. 方案 E：草案 §6.1 缺的選項

### 3.1 草案字面的「第五方案」省 0 bytes

`[已驗證]` 「保留 Supabase Auth、但讓匿名 discovery 走受控的較小 client」在本 repo
**無法省下任何 byte**：`src/supabaseClient.js` 在模組 top-level 就 `createClient()`，
而 `SupabaseClient` 的 constructor 靜態 import 並無條件 new 出 `PostgrestClient`
（`SupabaseClient.ts:4` / `:380`）、`RealtimeClient`（`:366`）、`StorageClient`（`:388`）。

只要 Auth 還走 `@supabase/supabase-js`，postgrest-js 就**已經在 main chunk 裡**。
匿名 discovery 改走手刻 fetch 不會少任何 byte，卻要失去 `.select()` 字面型別守門。

### 3.2 真正該補的是方案 E：直接組合 auth-js + postgrest-js

`[已驗證]` esbuild 同口徑對照（主對話與 read-back 各跑一次，工具版本口徑略有差異）：

| 組合 | raw | gzip | brotli |
| --- | ---: | ---: | ---: |
| 現況 `createClient(...)` | 約 209.9–210.0 K | 約 54,785–54,797 | 約 46,174–46,224 |
| 方案 E `GoTrueClient` + `PostgrestClient` | 約 113.4–113.5 K | 約 27,929–28,001 | 約 23,962–24,012 |
| **節省** | **約 96.5 K** | **約 26.8 K** | **約 22.2 K** |

逐位數字在不同執行環境會有數十 bytes 差異，**寫進 ADR 前需以單一環境重跑並標註量測條件**；
但「省約 26.8 KB gzip」的量級結論穩固。

可行性驗證狀態：

| 關鍵 | 狀態 |
| --- | --- |
| RPC 面 | `[已驗證]` 全庫 RPC 只有**單一收斂點** `privateDataRepository.ts:146`，且 `PostgrestClient` 原生支援 `rpc`（`postgrest-js/src/PostgrestClient.ts:371`） |
| 型別守門 | `[委派查證]` 用 `PostgrestClient<Database>` 實測，錯欄位仍會毒化 |
| auth token 注入 | `[不確定]` 現況由 `SupabaseClient.ts:359` 的 `fetchWithAuth` 包裝完成；方案 E 需自行提供 `fetch` 選項 |

**風險排序目前不可寫成結論。** read-back 指出第二份文件列的四項代價未被反駁，且新增一項：

1. `supabase-js` 對子套件是**精確版本鎖定** `"2.110.0"`（非 caret），拆開後升級相容性自己扛
2. 官方不支援拆用
3. 三處注入型別要手工重組
4. `tests/fixtures/localSupabase.js` 與 `test:local` 三條路徑（PKCE／`detectSessionInUrl`／
   token refresh）要重驗
5. **`@supabase/auth-js` 與 `@supabase/postgrest-js` 目前都只是 transitive 依賴**，
   方案 E 要把它們升為 `package.json` 直接依賴

**結論改為**：方案 E 是**待驗選項**，量級最大且不需非官方替身，應納入 ADR 比較；
但「E < B < C」的排序在上述五項代價評估完成前不成立。

方案 B（延遲載入 auth client）的前提在本 repo **不成立** `[委派查證]`：
`main.js:568` 的 `restoreAuth()` 與 publicStartup 同時啟動，
`profileOrchestrationFeature.ts:334/:345` 在 boot 就呼叫 `onAuthStateChange` 與 `getInitialSession`。

### 3.3 §6.1 漏了 gate 的非 byte 斷言（不只三條）

`[已驗證]` `check-production-bundle.mjs` 的 `assert` 中，非 byte-limit 類共 **12 個**，
其中對 chunk 重排方案最關鍵的有 8 條：

| 位置 | 斷言 |
| --- | --- |
| `:57` | `outputFiles.length >= 4` — **掃描集非空守門** |
| `:59` | `output.length > 100_000` — 同上 |
| `:61` | 12 個示範暱稱不得出現 |
| `:63` | E2E hook 不得出現 |
| `:69` | entry script 恰 1 |
| `:80` / `:84` | JS chunk 掃描集 ≥ 4、entry 必須在掃描集內 |
| `:90` | **Sentry marker 不得洩進 main chunk**（隱私性質） |
| `:94` | Sentry 獨立 chunk 必須存在 |
| `:104` / `:108` | **private repository marker 不得洩進 main chunk**、private chunk 恰 1 |

首版只列三條，且漏掉的 `:57` 正是「掃描集非空」——而本文 Q3(d) 自己在強調這件事。
**ADR 若照三條寫會遺漏最該先過的兩關（`:90` 與 `:104`）。**

順帶澄清：**Sentry 條件載入已經做完了**（DSN 無效就完全不載入），
剩下的槓桿只有改 gate 政策把 Sentry 排除在 TOTAL 之外；
**Google Maps 根本不在 dist 裡**（注入 `<script>` 從 maps.googleapis.com 載入）。

### 3.4 「最大 lazy chunk」在兩個維度是不同檔案

`[已驗證]` raw 維度最大的是 **MySessionsPage 16,476**（限 18,000，**餘 1,524**）；
gzip 維度最大的是 **MePage 4,949**（限 5,500，**餘 551**）。
兩個維度由不同檔案綁住，寫成單一「最大 lazy chunk」會誤導評估。

---

## 4. 第一個 vertical slice：Chat + Messages

`[委派查證]` 這個結論與我先前的說法相反（我曾說 chat 最脆弱、該留最後）。

**重要口徑說明**（首版此表有兩個分母錯誤與一格口徑不一致，已修正）：

- 「controller 注入 callback」的分母是 `SessionControllerOptions` 的 **12** 個 `open*`
  （`sessionController.ts:106-120`），不是 `ControllerApi` 的 11 個 —— 兩者是不同介面，
  首版混用了。下表各格歸屬為 agent 判定，**主對話未逐一複驗**，且各格相加不等於分母
  （有共用與跨屬），僅供相對比較，不可當精確配額。
- 「bundle 餘裕」欄全部是**餘裕**（上限 − 實測），首版 My Sessions 那格誤填 chunk 大小。

| 維度 | Chat+Messages | Player Dir | My Sessions | Me | Discovery drawer | Create-Edit-Join |
| --- | --- | --- | --- | --- | --- | --- |
| controller open* 歸屬 | **1** | 3 | 3 | 0 | 1 | 6 |
| surfaceRegistry（/11） | **1** | 3 | 2 | 0 | 1 | 4 |
| SURFACE_TRANSITIONS（/15） | **2** | 7 | 4 | 0 | 2 | 9 |
| store 欄位（/27） | **0** | 4 | 4 | 5 | 12 | 全共用 |
| route | `#tab-messages` | 無 | 有 | 有 | 無 | `#/session/:id` |
| **lazy chunk gzip 餘裕** `[已驗證]` | **Chat 3,421／Msg 4,627** | 3,375–4,790 | **672** | **551** | 無 lazy chunk | Detail 653／Create 958 |
| 測試呼叫點歸屬（分母 86） | **5** | 18 | 20 | 17+6 | 13 | **41** |

修正後 bundle 那一列的結論**更強而非更弱**：Chat（餘 3,421）與 Messages（餘 4,627）
確實是全表最寬鬆的兩個，而 My Sessions 其實是第二緊（672），僅次於 Me（551）。

它同時擁有**一條完整 route**（`PAGE_ROUTES` 4 條之一）與**一個沒有第二 consumer 的 server view**
（`session_message_feed`），所以能同時證明 route ownership 與 server-state 邊界。

**草案的排除理由方向反了**：草案說「Messages 的 UI ownership 已完成」所以不選它。
但 UI ownership 已完成**正是**讓 route + server-state 搬遷變小的原因 ——
UI 未完成的候選反而要一次付三份成本。

**最大風險（動工前必須先解）**：`unreadMessageCount` 不住在 chat 的資料面，而住在
`my_session_participations` 的 select 字串裡，且 `chatController.ts:97-99` 用**原地 mutate
共用 store 物件**的方式歸零（`context.session.unreadMessageCount = 0;` 接著 `notifyMySessions();`），
多個 consumer 同時讀它。

建議：動工前先把該處的原地 mutate 換成對上游（My Sessions）的顯式呼叫，讓 slice 只讀不寫該欄位。
另外 `reportDialog` 要明確排除在 slice 外 —— `openChatMessageReport` 與
`ControllerApi.openRosterParticipantReport` 共用同一張 dialog。

**第二順位**保留 Player Directory／Presence，但草案對它的排除理由要擴寫：不只是「與 Maps 耦合」，
而是「map 耦合 + surface 叢集最大 + 隱私面最重（兩張 authenticated-only view 加 raw GPS 紅線）」。

---

## 5. 建議的管線調整

草案 §9 的七階段骨架我同意，建議四處調整（首版第五處已撤回，見 §7）：

| 調整 | 理由 |
| --- | --- |
| **新增「階段 -1：推播訂閱修復」** | §0.1 是現存缺陷。但它是 auth 路徑上的 runtime 變更，**不在草案 §16「可做」清單內** —— 應先出派工單、待核可後執行 |
| 階段 0 從四條 gate 改為**三條 + 一本帳** | (c) 已存在只需加 canary；(b) 無法用掃描實作。allowlist 要用每檔計數或符號定位，不可用 `file:line`（會與 Q12 的搬檔衝突） |
| 階段 0 併入 **aria-live 持久性測試** | Q1 的缺口，且是階段 D 的前置 |
| 階段 3 的 ADR **補方案 E 與八條非 byte 斷言** | §3.2、§3.3 |

階段 2 與階段 4 有一個共用前置：**`npm run preview` 的 Playwright project**。
Q6 說它一次解鎖四個效能指標，Q11 說 `performance.spec.js:59-74` 的匿名 gate 必須配合它重寫
（現在比對 dev 路徑且無 positive control，已經空轉）。建議提前成階段 2 的第一項。

**與草案 §16／§17 的關係**（首版未回應）：本文 §7 以外的所有內容都屬草案 §16 的「可做」範圍
（只讀盤點、量測、建立派工文件、確認 dead exports）。唯一的例外是階段 -1，見上表。
本文的優先序與草案 §17 的原則一致，只在一處加嚴：§17 說「防止問題增生 → 清除死碼」，
本文主張把 §0.1 的隱私修復放在兩者之前，因為它是使用者可感知的現存缺陷而非技術債。

---

## 6. 我在前兩份文件中需要更正的地方

| 位置 | 原說法 | 更正 |
| --- | --- | --- |
| second-pass §6.3、§7 B1 | 「走 alias 替身，不走 client 重組」 | 方案 E（client 重組）量級更大且不需假模組，**應納入 ADR 比較**；但它的五項代價未評估完，不能直接宣告優於替身方案 |
| second-pass §4 | 把 bundle gate 寫成硬牆 | gate 是政策，但調整門檻比草案理解的高（§0.3） |
| second-pass §8、本輪初判 | 「Chat 留到最後」 | 七維度比較後 **Chat + Messages 是最佳第一片**（§4） |

---

## 7. 本文首版的 read-back 修正紀錄

三名 opus agent 共 204 項檢查、38 筆 FAIL、24 項 blocking。全部已處理：

| 類別 | 首版 | 本版 |
| --- | --- | --- |
| **決策依據錯誤** | §4 表格 My Sessions 的 bundle 欄填 4,828 | 那是 chunk 大小不是餘裕；**實際餘裕 672**，是全表第二緊而非最寬鬆 |
| **決策依據錯誤** | §4 表格「open* callback（/12）」 | 分母 12 是 `SessionControllerOptions`，不是 `ControllerApi`（11 個）；已改標題並註明各格為 agent 判定、不可當精確配額 |
| **前提被推翻** | Q10 說 `blockedPlayers` 是「單一寫入者」且「跨頁面」 | **兩條都不成立**（至少三個寫入者；MySessionsPage 對 blocked 零命中）。已改寫判準與驗收條件 |
| **誇大定性** | §0.1 說外洩「A 的球局摘要與群訊內容」 | chat payload 的 message 是硬寫固定字串 `'群組有新訊息'`，**聊天內容從不進 payload**。已改為球場名／開始時間／缺額／深連結 |
| **修法不完整** | §0.1 只建議登出時解除訂閱 | 補：同批需加「登入後自動重訂」（否則永久靜默）、並明講此修法不解決「不登出就換人」 |
| **對不存在的敘述做更正** | Q2「條數是 10 不是 11」、Q15「是 8 個 bullet 不是六條」 | 草案從未寫過 11 或六條。**兩處已刪除** |
| **低估數量** | §3.3「gate 另有三條結構硬斷言」 | 非 byte 斷言共 12 個，對 chunk 重排關鍵的有 8 條，漏掉的 `:90`／`:104` 是隱私守門 |
| **結論過強** | §3.2「風險排序 E < B < C」 | 降為**待驗選項**；補回 second-pass 的四項代價與新增的第五項（兩個子套件目前只是 transitive） |
| **不當比較** | §6 更正表的「26,796 vs 23,537 gzip」 | 前者是組合差值、後者是三個獨立 bundle 加總（原文已標 `[推論]`），口徑不同不可相比。已刪除該比較 |
| **理由不成立** | §5 調整 4（刪 export 移到階段 4 後） | 依本文自己的處方，那兩支測試不會翻紅。**該處調整已撤回** |
| **誤讀** | Q15 說 `vocabulary.css` 的 `.chip` @media 是「方向相反的反例」 | `.chip` 定義本體就在該檔，那正是草案建議的方向。定性已刪，但書保留 |
| **誤述** | Q16 說清除路徑含 presence tracker、notification settings | `authController.ts` 全檔對兩者零命中。已改為「派工前先實際盤點」 |
| **數字不可復現** | Q15 的 responsive 宣告數、`__` 選擇器數、跨檔 selector 數 | 多種口徑皆無法復現，**已全部移除** |
| **證據分級不自洽** | 前言稱「所有承重結論由主對話親自複驗」、§1 稱 14 條 | 正文 `[已驗證]` 僅 10 處且清單有重複。已改為 **11 項親驗、其餘委派**，並在前言明示 |
| **行號差一兩行** | `chatController.ts:97-98`、`check-production-bundle.mjs:18`、`discoveryMapController.ts:226-228`、`:107` | 依序更正為 `:97-99`、`:17`、`:224-225`、`:104`／`:108` |
| **遺漏回應** | 草案 §16／§17 全文零引用 | 已補入 §5 末段 |
| **allowlist 衝突** | Q3(a) 用 `file:line` 寫死 | 與 Q12 階段 4 搬檔衝突（搬完整批假紅），已改為每檔計數或符號定位 |

read-back 同時確認：**§0.1 的外洩結論成立**（agent 獨立重建證據鏈並做六項主動反證，
全部支持），首版 113 + 33 + 10 項檢查通過。

---

## 附錄：可複驗指令

```bash
# §0.1 推播外洩（五個環節）
grep -rn "removePushSubscription" src/ | grep -v "dataApi\|Repository"   # UI 層應為空
sed -n '177,184p' src/features/profile/profileOrchestrationFeature.ts
sed -n '87,89p;141,143p' supabase/functions/notification-outbox-dispatch/index.ts
sed -n '36p' supabase/functions/notification-outbox-dispatch/dispatch.js
sed -n '168,169p;198,200p' supabase/migrations/202607230001_notifications_web_push.sql
grep -rn "pushManager.unsubscribe" src/                                  # 應為空
sed -n '565,568p' supabase/migrations/202607270004_chat_block_hardening.sql   # 固定字串

# §0.2 / §0.3 兩條規則檔
sed -n '51,52p' .claude/rules/testing.md
sed -n '46p' .claude/rules/react-migration.md

# §3.3 gate 的非 byte 斷言
grep -nE "assert\.(ok|equal|deepEqual)" scripts/check-production-bundle.mjs | grep -v LIMIT_BYTES

# §3.4 / §4 lazy chunk 餘裕（全部四個候選）
node -e 'const fs=require("fs"),z=require("zlib");for(const f of ["MySessionsPage","MePage","SessionChatSheet","MessagesPage"]){const m=fs.readdirSync("dist/assets").find(x=>x.startsWith(f+"-"));const b=fs.readFileSync("dist/assets/"+m);const g=z.gzipSync(b).length;console.log(f.padEnd(18),"raw",b.length,"餘",18000-b.length,"| gzip",g,"餘",5500-g);}'

# §4 分母：兩個不同介面不可混用
awk '/^export interface ControllerApi/,/^}/' src/controllerContracts.ts | grep -cE "^  open"   # 11
sed -n '106,120p' src/sessionController.ts | grep -cE "^  open"                                # 12

# Q10 blockedPlayers 的全部寫入者
grep -rn "blockedPlayers" src/controller/ src/sessionController.ts | grep -E "setState|: \[\]"
grep -c "blocked" src/pages/MySessionsPage.tsx                                                 # 0

# §3.2 方案 E（探針放 repo root，跑完必刪；逐位數字會因環境略有差異）
printf 'import { createClient } from "@supabase/supabase-js";\nconsole.log(createClient("https://x.supabase.co","k",{auth:{flowType:"pkce"}}));\n' > .probe-a.mjs
printf 'import { GoTrueClient } from "@supabase/auth-js";\nimport { PostgrestClient } from "@supabase/postgrest-js";\nconsole.log(new GoTrueClient({url:"u"}), new PostgrestClient("u"));\n' > .probe-b.mjs
for f in a b; do npx esbuild .probe-$f.mjs --bundle --minify --format=esm --outfile=/tmp/p$f.js --log-level=error; done
node -e 'const z=require("zlib"),fs=require("fs");for(const f of ["a","b"]){const b=fs.readFileSync("/tmp/p"+f+".js");console.log(f,b.length,z.gzipSync(b).length,z.brotliCompressSync(b).length);}'
rm -f .probe-a.mjs .probe-b.mjs && ls .probe* 2>/dev/null || echo "探針已清除"
```
