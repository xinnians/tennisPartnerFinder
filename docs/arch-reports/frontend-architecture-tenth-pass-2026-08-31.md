# 第九輪複核與第十輪裁決

日期：2026-08-31<br>
對象：`docs/arch-reports/frontend-architecture-ninth-pass-2026-08-31.md`<br>
程式基準：HEAD `a14e81ecf88fbdd87f7b7f77fe0ffcf4d22b6343`<br>
輸入文件 SHA-256：`381d16abb5668b31db6f5e33a1fd12d8786ad6f4e1a06664ec181c88f25573e5`

本輪只新增這份文件，沒有修改 runtime、migration、rules 或 bundle 上限。驗證來源只採目前 source、
Git tracked 內容、本機 Postgres catalog／rollback transaction、實際測試輸出與官方規格；前八輪文件只當待查線索。

---

## 0. 結論

第九輪有幾項重要更正是對的：`applyAuthCandidate` 確實存在、`Object.freeze` 的唯一性只限
`sessionViews.js` 單檔、第三輪確有 7 列 × 6 候選表、FK blocker 的 5+1 與一條間接路徑也可重現。

但第九輪**不能直接當 final-v3 的定稿依據**，因為仍有至少四個會影響派工的核心技術錯誤：

1. 同帳號 token refresh 不是固定「完全不 reconcile」。正常 profile reload 成功後仍會 reconcile。
2. 「不 migration 必然造成無界外洩」把有條件風險寫成必然結果，也把產品決策與技術選型混在一起。
3. browser port 的 10 個位置只是已知 seed，不是完整 inventory。
4. 第三輪比較表雖存在，但多個 cell 原文就標示未逐一複驗；只補交叉引用仍不足以支持「最佳候選」。

另外，第九輪 §3 把一批既有結論整組標成「已證實」也過強；其中有些數字成立，但統計名稱、適用範圍
或證據強度仍要收窄。因此第九輪的「技術事實層再無爭議」與「剩餘全部非技術」都不成立。

---

## 1. 逐項裁決

| 第九輪主張 | 裁決 | 精確修正 |
| --- | --- | --- |
| `applyAuthCandidate` 存在 | **成立** | 定義在 `profileOrchestrationFeature.ts:309`，呼叫在 `:336/:358`。第八輪把「不在 authController」誤寫成「全庫不存在」。 |
| `applyAuthCandidate → setAuthSession → applyAuthState` | **部分成立** | `authController.ts:174-176` 只在 identity 改變時走；同 identity 立即走 `:179-180`。之後是否 reconcile 要看 profile reload 結果。 |
| token refresh 完全不 reconcile | **不成立** | 只描述了直接呼叫 `controller.setAuthSession()` 的第一階段，漏掉 production auth orchestration 的 `reloadCurrentProfile → setAuthState → applyAuthState`。 |
| 行為契約固定分成五種 | **需改寫** | 可保留五列方便測試，但 token refresh 必須寫成「兩階段、依 reload 結果分支」，不能固定標 no-reconcile。 |
| `loadDiscovery` 有 7 個 caller | **數字成立、名稱不精確** | `src/` 有 7 個 name-based call expressions；其中含 adapter/wrapper 與同一 runtime 鏈的下游呼叫。應叫「7 個 source call expressions」，不是 7 個獨立入口。 |
| 不 migration 必然留下無界外洩窗口 | **不成立** | 現況沒有 application-enforced 的停止時間上限，但實際投遞還要同時滿足 row 保留、endpoint 仍 active、A 後續有通知事件等條件。 |
| durable quarantine 需要 migration | **有限定時成立** | 若硬需求是「server 立即停送，同時保留 endpoint ownership lock」，現有 row 存在／不存在兩態不夠，需新增 durable state；但 migration 不是所有風險處理方案的唯一選項。 |
| W3C `unsubscribe()` 語意 | **方向成立、再精修** | `true` 表示該物件先前未 deactivated，UA 已排入平行 deactivation；Promise 不等待 push service 完成。`false` 只描述該物件，不能證明 scope 沒有 refresh 後的新 subscription。 |
| 8 字元 hash 約 48 bits、單一 pair 碰撞約 `3.55×10^-15` | **成立，需寫假設** | 這是均勻輸出的單一 pair 模型。若問 8 個值中任一 pair，近似值是 `C(8,2)/2^48 ≈ 9.95×10^-14`。兩者都不是內容相等證明。 |
| 8 份報告與 0.01 kB 證據口徑 | **需修正** | 限定為 8/27–8/28 且含該 hash 的 Codex dispatch reports 時確為 8 份，但八份也都有精確 `main 638937/187466`；全 repo tracked Markdown 則有 9 份含該 hash。不能只拿四捨五入值評價證據強度。 |
| 第三輪有 7 維度 × 6 候選表 | **成立** | `third-pass:521-529` 是 7 個 data rows、6 個候選欄。 |
| 第八輪也誤判成只有 6 維度 | **不成立** | 第八輪原文說的是 final-v2 正文列了「六個量化欄位」；route 是第七個定性維度。這句本身沒有否定 route。 |
| 正確處方只需補第三輪交叉引用 | **不充分** | 第三輪 `:515-519` 自己警告 cell 歸屬未逐一複驗、數字只供相對比較。可用舊表當 seed，但 final-v3 前仍要逐格重驗。 |
| browser port 是 10 項完整清單 | **不成立** | 10 個具名位置可重現，但至少還漏 `appErrors.ts:129`、`notificationPush.js:12/:17/:18`、`shareFeature.js:13/:17/:22/:25/:34`、`authApi.ts:48/:63/:80` 等 browser dependencies。 |
| `Object.freeze` 是檔內唯一性 | **成立** | `src/sessionViews.js` 為 1 次；`src/` 全庫為 28 次。測試先讀單檔，再對該字串計數。 |
| `sessionViews` 是 55 = 23 + 12 + 20 | **數字成立、名稱要修正** | 55 是 39 個本檔 exports + 16 個 re-exports；23 應叫 production-consumed exports，12 是功能測試外部使用，20 是無 production／功能測試外部 consumer。20 之中仍有相容性 gate 或檔內使用，不能直接叫 dead code。 |
| `sessionViews` 有 6 個 top-level side effects | **窄口徑成立** | 精確名稱是 4 個跨模組 configure calls + 2 個 preload listeners，共 6 個 top-level wiring effects。模組層 AST CallExpression 實為 21，不能說全部 side effects 只有 6 個。 |
| 測試有 86 個 `sessionViews` caller | **數字成立、名稱不精確** | 是 11 支 browser test files 內 86 個 `__importAppModule("sessionViews")` harness call expressions，不是 86 個 exports、production callers 或獨立行為。 |
| session controller state 是 27 欄 | **成立、需限定** | interface 與初始 store object 都是 27 個同名 properties；這是 controller state/schema，不代表 27 個 server-state 欄。 |
| blocked-player reload 有 3 個 callers，5-field reset 應拆開 | **前半成立、後半是提案** | runtime call expressions 正好 3 個；現況是 auth identity reset 的**一筆** `setState` 寫 5 keys，其中 blocked-player 3 keys、my-sessions 2 keys。拆成兩筆尚未實作。 |
| 5 個 `aria-live` owner 已完整盤點 | **具名表成立、完整性不成立** | 五個選定的長駐 live roots 都能對到 owner/update path；但 `index.html` + `src` 另有其他 live/status markup。這不是全庫 `aria-live` inventory。 |
| §5.2 遺失驗收內容 | **成立，但「約十二項」不可重現** | 內容流失可逐組證明；「十二」沒有固定計數規則，不應再凍結成數字。 |
| 直接 FK blocker 是 5 RESTRICT + 1 NO ACTION，另有一條間接路徑 | **成立，限 FK scope** | local catalog 與 migration 一致；不能擴大成 trigger 或業務邏輯的完整 delete blocker 盤點。 |
| 剩餘全部是非技術問題 | **不成立** | Option E PoC、preview、乾淨機器、OAuth browser matrix、mutation API scope、browser manifest 與候選表重驗都是技術工作。 |

---

## 2. 最重要的修正：token refresh 是兩階段流程

實際 production 路徑如下：

```text
auth event / initial session
  → applyAuthCandidate()
    → setAuthSession()
      → identity 改變：void applyAuthState()，立即 reconcile
      → identity 相同：只更新 authSession + emit("me")
    → reloadCurrentProfile()
      → 成功：setAuthState() → applyAuthState() → detail/chat reconcile
      → 失敗且先前 profile 尚未 ready：setAuthState(error) → 仍會 reconcile
      → 失敗且先前 profile 已 ready：丟錯後被 catch；沒有第二次 reconcile
```

直接證據：

- `profileOrchestrationFeature.ts:309-325`：每個非 null auth candidate 都會等 `reloadCurrentProfile()`。
- `profileOrchestrationFeature.ts:263-291`：成功在 `:289` 呼叫 `controller.setAuthState()`；失敗時只有
  `profileLoadStatus !== "ready"` 會在 `:279-281` 呼叫它。
- `authController.ts:158-161`：`applyAuthState()` 先 reconcile detail/chat，再 reload participation。
- `authController.ts:172-180`：同 identity 的**立即分支**才只有 setState + emit。
- `tests/session-controller-auth.test.js:10-50` 只測直接 controller 分支，沒有覆蓋
  `restoreAuth → applyAuthCandidate → reloadCurrentProfile` 的完整流程。

final-v3 建議把第五列寫成：

> 同帳號 token refresh：立即更新 session 時不 reconcile；profile reload 成功或 loading/error 分支失敗時，
> 後續會經 `setAuthState` reconcile；只有已 ready profile 的 reload 失敗分支沒有後續 reconcile。

這三條結果都要各有測試，不能只保留現有「keeps token refresh light」單元測試。

另外，`sessionIdentity()` 在 `user.id` 缺失時會 fallback 到 `access_token`
（`profileAuthFeature.ts:22-24`）；這類不完整 session 換 token 時甚至會被分類成 identity change。
此處只記錄現行行為，不推測它是否會在正式 Supabase session 發生。

---

## 3. Push：應改成條件風險，不是必然外洩

### 3.1 目前可以證明的事

- 一般登出只走 `handleSignOut → authApi.signOut → client.auth.signOut()`，沒有清 push row 或呼叫
  `PushSubscription.unsubscribe()`（`profileOrchestrationFeature.ts:177-183`、`authApi.ts:68-71`）。
- installed auth-js 的預設 sign-out scope 是 `global`；它撤銷 refresh token、清本機 session，
  **不等於刪除 `auth.users`**，因此不會觸發帳號刪除 cascade。
- dispatcher 在 `index.ts:84-90` 只按 recipient profile 讀全部 subscription，沒有 status 或 TTL filter。
- 只有未來真的送出，且 `classifyPushStatus()` 得到 404/410 時，才在 `index.ts:141-143` 刪 endpoint。
  這不是定期 stale-row sweep，也沒有時間上限；該 delete response 的 error 目前亦未檢查。
- 實際 push payload 被限在 `court/message/slots_remaining/start_at/url` 五欄，測試確認 `line_id`
  不會進 payload。風險是球局摘要、時間、球場與關聯資訊，不應誇大成任意帳號資料外洩。

所以精確句子應是：

> 在 unknown/timeout 分支保留 A 的 active row 時，系統沒有 application-enforced 的停止投遞時間上限。
> 若 endpoint 仍 active，且 A 後續產生通知事件，該瀏覽器可能繼續收到 A 的球局摘要。

「必然」不成立，因為 unsubscribe 可能稍後完成、UA/push service 可讓 subscription 失效、未來 send
可能得到 404/410、帳號也可能真的被刪除，而且沒有新通知事件時就沒有實際 payload 被送出。

### 3.2 migration 與產品決策要分開

產品先決定的是安全不變量：登出是否停本機推播、是否影響其他裝置、換帳號是否重新 opt-in、
可接受多少 in-flight／residual window、orphan 保存多久。

工程才決定如何做到：

- 若要求 server 立即停止 A dispatch，同時保留 endpoint lock 防 B 接管，需有 durable 第三狀態；
  現行 schema 沒有 status。在目前 repo 的 Postgres boundary 內，這代表要用 migration 增加狀態／新表；
  或另外引入 server-side ownership store。兩者目前都不存在。
- 不 migration 仍可評估 client-only guard、刪 row 後禁止 B 重用，或改用既有 `created_at` 做
  lease/TTL 與定期 refresh。這些都尚未實作或驗證，而且 client-only guard **不能**提供 durable server
  停送保證；它們只足以證明「不 migration 就必然已發生外洩」不是邏輯必然。

另有一個第九輪沒列的 race：dispatcher 在 `index.ts:84-98` 先一次讀出 subscriptions，之後才於
`:103-147` 逐筆送。即使新增 `active/revoking` filter，已被這次 dispatcher 讀入記憶體的 row 仍可能
送一次。final-v3 必須明訂是否接受 one in-flight push；若不接受，需設計 send 前重查、lease/version
等機制，且仍不能把跨 push service 的撤銷描述成原子操作。

### 3.3 W3C 與 takeover 證據的正確強度

[W3C Push API 的 unsubscribe 演算法](https://www.w3.org/TR/push-api/#dom-pushsubscription-unsubscribe)
可支持以下表述：`false` 是 captured object 先前已 deactivated；`true` 是 UA 已排入平行 deactivation，
Promise 不等待 push service 完成。進入 deactivation 後 UA 不得再投遞；push-service request 失敗時，規格是
`SHOULD` 在合理時間內重試，並非 `MUST`。兩種回傳值都不能取代對目前 registration 再做
`getSubscription()`。

本輪重跑 rollback transaction 得到：A save `OK`、A remove `OK`、B save `OK`，最後 owner 是 B，
交易 `ROLLBACK`。這只與 `notificationPush.js:29-36` 的「重用 existing subscription」靜態證據合起來，
證明 takeover 的**條件鏈可成立**；它不是瀏覽器／OAuth E2E。

### 3.4 另外三條 Web 規格結論也要保留限定

- `/push-sw.js` 沒傳 scope option，依 Service Worker 規格其 default scope 由 script URL 的 `./` 推得根路徑
  `/`；Push 規格把 `/` 視為 window-accessible。只有 non-window-accessible registration 的 unregister
  有強制 deactivation 條文；這不等於 root scope 永遠不會被 browser 提早清掉，清站台資料仍要實機測試。
- Permissions 預設 permission key 是 origin，Push 沒另行覆寫；repo 也沒有 account + device 的 opt-in
  紀錄。因此 `Notification.permission === "granted"` 不能當成「目前帳號已同意」的證據。
- `p256dh` 是公開金鑰；private key 留在 subscription 的內部 slot，不提供給 app。server 已存
  endpoint／`p256dh`／`auth`，仍不能證明目前 browser 持有相符私鑰。

官方依據：[Push API](https://www.w3.org/TR/push-api/#push-subscription)、
[Service Worker scope](https://www.w3.org/TR/service-workers/#service-worker-registration-scope)、
[Permissions](https://www.w3.org/TR/permissions/#permissions)。

專案沒有產品內自助刪帳功能；但 `public/privacy.html:178` 有來信刪帳說明，所以不能擴寫成「專案完全
沒有帳號刪除路徑」。

---

## 4. Browser port、候選表與驗收內容

### 4.1 10 個位置只能叫 seed

第九輪的 10 是：4 個 `globalThis.document` defaults、4 個額外且不重複的 `Document` type locations、
`intentController.ts:492` 與 `playerPresence.js:21`。這個窄口徑可重現。

但 final-v2 `:212-225` 已明寫「不宣稱完整」，而且已列過 `playerPresence.js:21`；它不是第九輪才發現的
新第十項。全庫還有 `HTMLElement` realm check、Push、clipboard、location、localStorage、history 等依賴。

正確做法是先定義 manifest scope，例如分成：

1. controller 層禁止直讀的 runtime globals；
2. 可注入的 platform adapters；
3. UI layer 合法 DOM globals；
4. type-only DOM references。

scope 尚未定義前，不再宣稱 9、10 或任何固定總數是「完整清單」。

### 4.2 第三輪表可以沿用，但要重驗

`third-pass:521-529` 的確有 7 列 × 6 候選。第七列 route 是定性維度；final-v2 把它放在數字後的散文，
所以「六個量化欄位 + 一個定性 route」與「七維度」可以同時為真。

問題不是表不存在，而是第三輪 `:515-519` 明寫多個歸屬 cell 沒由主對話逐一複驗，且加總不能當精確
配額。final-v3 應複製該表作 seed，逐格附查詢與結果後再選 vertical slice；只加交叉引用不足。

### 4.3 §5.2 的內容流失是真的，但不要再手數「十二項」

第八輪 §5.2 只保留派工順序，沒有保留下列具體驗收內容：

- 0a：HTML renderer AST、controller DOM、CSS import order、syncCommit canary 四組 gate；
- 0b：完整 mutation scope／symbol ledger、4 個持久 live roots 的 identity tests；
- 階段 2：private chunk positive control 與 Chromium/WebKit 驗證限制；
- 階段 3：A/B/D/E 分開比較，以及 E 的 Auth、PKCE、refresh、sign-out、local harness、
  production-equivalent PoC 門檻；
- 階段 4：gate 先遷移 → 搬 6 個 top-level wiring side effects → 才能刪 bridge；
- 階段 5：account invalidation、request generation、auth snapshot、observable-state atomicity 四個不變量。

這是多組條件，不同拆法會得到不同數量。final-v3 應直接內嵌完整清單，不要只提供跨六份舊報告的
索引，否則下一輪仍會繼續流失內容。

### 4.4 `Object.freeze`

本輪重跑結果：

- `src/sessionViews.js`：1 次；
- `src/` 的 `.js/.ts/.tsx`：28 次。

`session-presentation-boundary.test.js:147-157` 先只讀 `src/sessionViews.js`，再對該單檔字串計數，
所以第九輪把「全庫唯一」修成「檔內唯一」是正確的。

### 4.5 `sessionViews`、state 與 live region 的精確口徑

- `sessionViews.js` 的 export declarations 共 55：39 個本檔 declarations，另 re-export
  `sessionPresentation` 15 個、`taipeiTime` 1 個。
- production 唯一 importer 是 `main.js`；它 named-import 23 個，而且 23 個都有檔外 reference。
  部分只是 callback 注入，因此統一叫「23 個 production-consumed exports」，不要叫 23 個直接 callers。
- 另外 12 個 exports 有功能測試 consumer；20 個沒有 production／功能測試外部 consumer。但這 20 個
  仍含 13 個被相容性 gate 動態讀取的 re-exports，以及檔內仍在用的 declarations。移除 export 與刪除
  declaration 是兩件事，不能直接標 dead code。
- 可重現的 6 個是 4 個跨模組 configure calls（`:383/:424/:439/:640`）加 2 個 preload listeners
  （`:621/:622`）。這叫 top-level wiring effects；若計全部模組層 CallExpression，AST 是 21。
- tests 內共有 86 個 `__importAppModule("sessionViews")` call expressions，分布在 11 支 browser harness
  tests。這是 harness 耦合量，不是 86 個 production callers。
- `SessionControllerState` interface 與初始 store object 都是 27 個同名 properties。
  `refreshMyPlayerBlocks()` 的 runtime call expressions 是 3 個：`main.js:458`、
  `chatController.ts:177`、`mySessionsController.ts:234`。
- `authController.ts:149-155` 現況是一筆 5-key identity reset；其中 blocked-player 3 keys、my-sessions
  2 keys。把它拆成兩個 domain reset 是架構提案，不是已落地事實。
- 第九輪表中的五個具名 live roots 都存在，但不能叫全庫 inventory。本輪搜尋得到 21 行
  `aria-live` 命中，其中 `main.js:314` 是註解；其餘 20 個 markup literals 裡仍有 15 個不在該表。

---

## 5. FK blocker 與 hash 證據

### 5.1 FK blocker 已可收斂，但要限定口徑

本輪直接查 local Postgres `pg_constraint`，並與 migration 對讀。對 `public.profiles` 的直接 blocker 是：

| ON DELETE | FK |
| --- | --- |
| NO ACTION | `session_messages.sender_profile_id` |
| RESTRICT | `private.legacy_partner_requests.profile_id` |
| RESTRICT | `private.legacy_reports.reported_profile_id` |
| RESTRICT | `private.legacy_reports.reporter_profile_id` |
| RESTRICT | `reports.reported_profile_id` |
| RESTRICT | `reports.reporter_profile_id` |

沿 CASCADE 邊遞迴後，另有一條 blocker：

```text
profiles → sessions (CASCADE) → reports.session_id (RESTRICT)
```

本輪另建最小 fixture 後嘗試刪除 host 的 `auth.users`，Postgres 實際回報
`blocked_constraint=reports_session_id_fkey`；host user 仍存在，最後整筆 transaction rollback。

因此「主揪的球局被 session report 引用時，帳號 cascade 會被擋」已由 catalog、migration 與 rollback
三邊確認。這只叫 **FK blocker 盤點完成**；若要宣稱所有 delete blocker 都完成，還要另查 trigger、
stored procedure 與產品刪帳流程。

第九輪一面把 FK 5+1 與間接路徑列為已證實，一面又把「FK 全盤點完成」列為待辦，應改成上述限定句，
不要同時寫完成與未完成。

### 5.2 Hash 的正確證據強度

Rollup installed source 顯示預設 hash 長度是 8 字元，檔名 hash 由 content hash 產生後截斷。
以 64 字元 base64url 空間估算是 48 bits：

- 一個指定 pair 偶然相撞：`2^-48 ≈ 3.5527×10^-15`；
- 8 個彼此獨立、均勻值中任一 pair 相撞：`C(8,2)/2^48 ≈ 9.9476×10^-14`。

這些只是機率模型，xxHash 也不是 byte identity 的證明工具。

Git 口徑也要寫清楚：

- 限 8/27–8/28、檔名為 `*-report-codex.md`、且內文含 `index-BWygPPVv`：8 份；
- 全 repo tracked Markdown 含該 hash：9 份，另一本是
  `docs/arch-reports/batch-6D-dataapi-ts-acceptance-2026-08-27.md`；
- 八份 dispatch reports 都同時保存精確 `main 638937/187466`，不是只保存 0.01 kB 四捨五入值。

能下的結論仍只有「歷史文字紀錄高度一致」。repo 沒保存各輪完整 artifact、SHA-256 或歷史 `cmp`，
而且無法證明八份報告彼此獨立，所以不能寫成歷史產物已證明 byte-identical。

### 5.3 Bundle、方案 B／D／E 與 `ds-bundle`

本輪重新跑 `npm run check:production-bundle` 與 production Vite `write:false`，兩者都通過；24 個 Vite
outputs 與目前 dist 對應檔案的 bytes 一致。精確口徑如下：

- checker 有 8 個 byte-limit constants；byte assertions 是 6 個靜態 call sites，其中兩個會逐 lazy
  chunk 執行。另有 12 個 non-byte 靜態 assertion call sites，其中一個會逐 12 個 demo identifiers
  執行。不要把 static call-site 數當成 runtime assertion 次數。
- 當前 main 是 `638,937 / 187,466` raw/gzip；最大 app lazy `16,476 / 4,828`；Sentry
  `87,975 / 29,723`；JS total（含 `public/push-sw.js`）`841,561 / 257,627`；CSS
  `65,865 / 10,857`。
- 精確說法是「沒有 CSS byte-size gate」。checker 的全 dist demo-content scan 仍含 CSS，repo 也有 CSS
  contract tests，所以不能籠統寫「CSS 完全沒有 gate」。
- Sentry 分類只看 `sentry_version` marker，且只要求至少一個命中。無改檔 canary 把 MePage 從
  `15,473 / 4,949` 增到 `16,901 / 6,315`：普通 lazy gate 失敗，被分類成 Sentry 時通過；整體 total
  仍通過。這證明 classifier 可讓該 chunk 超過普通 gzip 上限 815 bytes，但 total gate 仍限制總增量，
  不是無限繞過。
- 方案 E 的 isolated esbuild probe 可逐 byte 重現：full `createClient` 是
  `209,906 / 54,785 / 46,174`，`GoTrueClient + PostgrestClient` 是
  `113,352 / 27,929 / 23,962`，依序為 raw/gzip/brotli。這只證明 isolated entry 差異，不能當成 App
  Vite PoC 或實際可省 bytes。
- installed `auth-js` 與 `postgrest-js` 各自文件都提供 bundle-sensitive standalone import；這只支持
  兩個個別 client 的用法，不保證自行組合後與 `SupabaseClient` 等價。兩套件目前也只是 transitive
  dependencies，root `package.json` 沒直接宣告；token injection、PKCE、refresh、sign-out 都仍要 App PoC。
- 方案 B 的 dynamic-import 完整 client 只改載入時序；方案 E 會改 client 組成與 total，兩者確實不同。
  而且目前 boot 立即 `restoreAuth()` 並註冊 listener／讀 initial session，所以「互動後才載 Auth」不符合現況。
- `baseline + max(4 KiB, 1%)` 不存在於現行 source 或 Git history 搜尋結果；它只是一個方案 D 草案。
  它若又要求「完全不得預留未用空間」會有數學上的條件式衝突，但不能寫成目前 checker 已有的矛盾。
- `ds-bundle` 有 13 個 tracked files，production `write:false` build 的 292 modules 中命中 0；但
  `.design-sync/config.json`、`.design-sync/conventions.md` 與 `NOTES.md` 仍引用它。故可說「不進 runtime
  bundle、去留待維護者決定」，不能叫 dead/orphan 後直接刪除。

### 5.4 專案文件與 Claude rules

第九輪說有四處專案文件落後，方向成立，但四處不是同一種錯：

- `CLAUDE.md:73`、`.claude/rules/testing.md:42` 說 checker 會阻擋 demo 暱稱，字面仍為真，只是漏寫
  現有 byte、chunk、Sentry、total 等其他 gates。
- `.claude/rules/testing.md:49` 說 lint/Prettier 只掃 TS/TSX，與 `package.json:30-31` 的 JS／MJS scope
  不符。
- `.claude/rules/testing.md:56-57` 只列 4 支 mock specs；`playwright.config.js:48/:53/:62` 實為 5 支，
  多了 `react-page-focus`。

另外，`scripts/check-production-bundle.mjs` 不命中目前三份 project rule frontmatter 的任何 `paths`。
[Claude Code 的 path-scoped rules](https://code.claude.com/docs/en/memory#path-specific-rules) 只有在處理
matching files 時才會自動進 context，所以精確結論是「單獨讀／改 checker script 時，沒有規則自動載入
保證」，不是「Claude 在機制上絕對讀不到規則」。

---

## 6. final-v3 應如何分層

### 已在本輪重現的技術事實

- mutation 舊 scope：17 檔／89 AST nodes；
- profile helper：35 個靜態 call-site 行／6 檔；
- Vite `write:false`：24 outputs（22 chunks + 2 assets）、目前 dist 32 files、`failures=[]`；
- `Object.freeze`：`sessionViews.js` 1、`src/` 28；
- `sessionViews`：55 exports、23 production-consumed、12 功能測試使用、20 無上述外部 consumer；
- `sessionViews` wiring：6 個具名 effects；test harness：86 calls／11 files；
- session controller state：interface／initial object 都是同名 27 properties；
- blocked-player reload：3 個 runtime calls；auth identity reset 現為一筆 5-key update；
- 五個具名 live roots 可對到 owner，但不是完整 `aria-live` inventory；
- `loadDiscovery`：`src/` 7 個 name-based call expressions；
- FK：直接 5 RESTRICT + 1 NO ACTION；沿 cascade 另 1 個 RESTRICT blocker；
- Push takeover 與無 blocker fixture 的 auth cascade rollback 結果；
- bundle checker：8 個 byte constants、6 個 byte assert sites、12 個 non-byte assert sites；
- 方案 E isolated probe、Sentry classifier canary、`ds-bundle` runtime-module 0；
- focused Node suites 分別為 25/25、88/88、13/13；scope 有重疊，不相加成總測試數。

### 仍未完成的技術驗證／實作

- production auth-event token refresh 的完整 orchestration tests；
- browser port 的正式 scope 與全庫 manifest；
- 第三輪 7 × 6 候選表逐格重驗；
- 真實 browser Push lifecycle、OAuth 雙帳號與 takeover E2E；
- dispatcher in-flight、delete failure、TTL/quarantine integration tests；
- production preview、乾淨機器、方案 E App PoC；
- mutation API 集合重定義與正式 symbol ledger；
- hosted production schema／trigger／刪帳流程核對；
- Push root-scope 的 browser 清站台資料行為與 account+device consent model。

### 產品決策

- Push 同意是 origin permission，還是帳號＋裝置 opt-in；
- 登出要停本機、全部裝置，或不動推播；
- 換帳號是否強制重新 opt-in；
- 可接受的 in-flight／residual window 與 orphan TTL；
- `ds-bundle` 去留與 bundle gate 重編政策。

產品決策與技術驗證都還存在，所以 final-v3 不得再用「剩餘全部非技術」作結。

---

## 7. 本輪實際執行與未執行

已執行：

- HEAD、輸入 SHA、source、installed Vite/Rollup/auth-js、Git tracked reports 對讀；
- 17/89、35/6、Vite 24/32 比對、freeze 28/1、hash report scope 重跑；
- production bundle checker、Sentry in-memory classifier canary、方案 E isolated esbuild probe；
- `sessionViews` export/consumer/wiring/harness AST、state name-set、live markup scope 重跑；
- local `pg_constraint` 直接與 cascade-recursive 查詢；
- 三組 transaction-safe DB 驗證：takeover、兩裝置＋auth cascade、間接 FK blocker；全部 `ROLLBACK`；
- W3C Push API `unsubscribe()`／deactivation 與 RFC 8030 expired subscription 404 語意核對；
- 三組獨立挑選的 focused Node suites：25/25、88/88、13/13；測試檔有重疊，不合併計數。

本輪未執行：

- 完整 `typecheck`、`lint`、`test:mock`、`test:local`、`test:db`；
- 真實 Chrome/Safari/Firefox Push、OAuth 雙帳號、hosted production DB；
- 方案 E PoC、production preview、乾淨機器；
- 歷史 artifact 的逐 byte 比對，因 repo 沒有保存那些檔案。

以上未執行項目一律不能在 final-v3 標成已通過。

---

## 8. 給 Claude 下一輪確認的最短清單

1. 直接走一次完整 `restoreAuth → applyAuthCandidate → reloadCurrentProfile`，確認第 2 節三個結果分支。
2. 反駁或確認第 3 節 Push 的條件風險、global sign-out、dispatcher snapshot race 與 payload 實際範圍。
3. 用 `pg_constraint` 重跑直接 5+1 與 cascade-recursive 1；口徑只限 FK blocker。
4. 用 Git pathspec 分別重跑「8 份 dispatch reports」與「9 份 tracked Markdown」，確認精確 bytes 也存在。
5. 確認 browser port 的 10 只是 seed；先定 scope，再談完整總數。
6. 逐格重驗第三輪 7 × 6 表；不得只靠舊表交叉引用宣稱 Chat 是最佳候選。
7. final-v3 內嵌第 4.3 節驗收條件，別再讓讀者跨六份文件拼接。
8. 把 final-v3 分成「已證實技術事實／未完成技術驗證／產品決策／授權」，撤回「技術零爭議」。
9. 逐項確認第 4.5、5.3、5.4 的統計名稱與限定，不要只核對數字後沿用過寬標籤。
