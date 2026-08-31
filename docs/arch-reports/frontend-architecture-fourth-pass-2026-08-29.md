# 最終候選方案——第四次確認

日期：2026-08-29
對象：`docs/arch-reports/frontend-architecture-final-candidate-2026-08-29.md`（以下稱「待審文件」）
基準：HEAD `a14e81e`

> **本輪方法與前三輪不同**：依使用者要求，**任何文件的訊息都不可靠**。
> ground truth 只有磁碟上的 `src/`、`supabase/`、`tests/`、`scripts/`、`node_modules/`、
> 設定檔與 `git` 輸出。`docs/` 底下的一切（含 roadmap 的 ACCEPTED 紀錄、本系列前三份文件、
> 待審文件自己）一律視為**待驗宣稱**。程式碼註解可引用，但只作為意圖而非行為的證據。
>
> 13 名 opus agent 依此規則查證，派工單明令禁止拿 `docs/` 內容當證據。
> 共回報 **73 條「文件宣稱與程式碼實況不符」**。本文只收錄主對話親自複驗過的部分。

---

## 0. 一句話結論

**待審文件的數字幾乎全對，問題出在沒有數字的句子。**

七個 bundle 餘裕、27 欄、13 個 CSS import、14 sheet／3 page、2 個 syncCommit caller、
方案 E 的三個量級——我逐一用指令重跑，全部精確複現。

但有**五處會直接卡住派工**（照字面實作第一次跑就失敗），以及一個我自己在第三份提出、
現在被推翻的建議。詳見 §1、§4。

---

## 1. 派工單發出前必須先改的五處

以下每一條我都親自開檔複驗過。

### 1.1 §5.2「controller DOM gate 現況應為零」——實際是 2 `[已驗證]`

用待審文件**自己列的掃描集**（第一項就是 `document`）跑：

```
src/controller/discoveryMapController.ts:105:  visibilityTarget = globalThis.document,
src/sessionController.ts:170:  visibilityTarget = globalThis.document,
```

兩處都是 `visibilityTarget` 的**預設參數**，用途是 `visibilitychange` 輪詢控制
（消費點在 `requestGate.ts:53/:56`）。

但 allowlist 要涵蓋的是**三處 Document 型別宣告**，不是兩處 `[已驗證]`：
`discoveryMapController.ts:72`、`sessionController.ts:128`，加上
**`chatController.ts:57` 的 `visibilityTarget: Document | undefined;`**（必填形式，非預設參數）。
本文首版只點名兩處，照抄會讓 allowlist 少一筆。

**照 §5.2 字面實作 Gate B，第一次跑就紅。** 這是全文最會直接卡住派工的一句。

修法：改成「零 DOM **寫入／查詢**操作；`globalThis.document` 有 2 筆 Document 型別注入預設值，
須明列 allowlist」，或把掃描目標從 `document` 字面改成 DOM 寫入 API 集合。

連帶更正本系列前三份反覆使用的「controller 全庫零 DOM 操作」：
以「查詢或變更 DOM」定義成立，但 **controller 層持有 Document 引用**，措辭要精確。

### 1.2 §14 指錯函式 `[已驗證]`

待審文件（承襲本系列第三份）說「`sessionIdentity()` 不應以 `access_token` 作 fallback
寫入 `history.state`」。實測：

| 函式 | 位置 | 實作 | 是否寫 history.state |
| --- | --- | --- | --- |
| `sessionIdentity` | `src/features/profile-auth/profileAuthFeature.ts:22` | `session?.user?.id ?? session?.access_token ?? null` | **否**（只做記憶體內比對） |
| `authIdentity` | `src/features/profile/profileOrchestrationFeature.ts:118-124` | **邏輯完全相同** | **是**（`main.js:424`） |

`main.js:424` 寫的是 `authIdentity(...)`：
`const state = { pageOwnerIdentity: authIdentity(getAppState().authSession) };`

**照文件字面只改 `sessionIdentity` 會完全沒動到問題點**，而且會漏掉這是**兩個重複實作**——
修 fallback 要改兩處。

這條錯誤由本系列第三份引入（我照抄 agent 回報未複驗），待審文件繼承。

### 1.3 §6.1「刪除 dead preload 呼叫」用單數，實際有兩個 call site `[已驗證]`

```
src/main.js:643:      preloadAuthenticatedViewsForAuth(context.session);   ← 活的（onAuthIdentityChange 內）
src/main.js:687:  preloadAuthenticatedViewsForAuth(getAppState().authSession);  ← 死的
```

`:687` 的死因可證：`init()` 在 `void boot()` 之前執行，而 `restoreAuth()` 在 `boot()` 內，
此時 store 的 `authSession` 仍是初始 `null`（`sessionController.ts:196`），
`preloadAuthenticatedViewsForAuth` 對 null 直接 no-op。

**派工單必須指名 `:687`**，否則有誤刪 `:643` 的風險。

### 1.4 §4.2 的 aria-live 表漏了會被重建的那一個 `[已驗證]`

`src/sessionViews.js:485` 的 lazy-surface shell 以 innerHTML 產生：

```html
<p class="surface__copy" data-lazy-surface-status role="status" aria-live="polite" aria-atomic="true">正在載入…</p>
```

它由 surface 生命週期重建（`:499` 的 `html:` 選項產生 → `:538` 被實際內容取代）。

**但 read-back 指出首版的處置建議錯了，已更正**：這個節點是 lazy surface 的**載入佔位**，
本來就該被取代（`tests/react-unmount.spec.js:133` 只斷言它在載入期間存在）。
把它加進 §4.2 的「不得重建」表會**製造假契約**。
正確做法是把它併入 §5.1 Gate A 的 `html:` 後門討論，並**明確排除**「不得重建」測試。

§4.2 表格本身仍有兩處要修 `[已驗證]`：

- 表中**五列**（不是四列）：前四列是 `index.html` 的 React 外持久節點，
  第五列 `#my-sessions-badge-status` 標為「React 內」且位於 `src/app/App.tsx:591`，不在 `index.html`。
- `#player-layer-status` 的 owner 欄只標「React 外持久節點」，但它與 `#map-data-status`
  一樣由 legacy renderer 更新（`sessionViews.js:196` vs `:213`），兩列標註口徑不一致。

### 1.5 §19 與 §5.5／§6.2 對 CSS 順序 gate 的階段歸屬三處打架

- §5.5 把它放在**階段 0**（與三條 gate 同批）
- §19 的管線圖寫進**階段 1**「死碼／死 export／preload／CSS 順序清理」
- §6.2 自己又說「CSS 順序 gate 是新增守門，不是死碼清理」

三處互相矛盾，派工前必須擇一。

---

## 2. 推播風險：結論成立，但定性要改成兩個影響面

13 名 agent 中負責此題者從頭獨立重建時序並做了反證，我複驗了關鍵環節。

### 2.1 方向要講精確

**不是「B 竊取 A 的訂閱」**，而是兩件事同時發生：

1. **A 的訂閱列永遠留著**，A 的通知繼續送到現在由 B 使用的瀏覽器（隱私外洩）
2. **B 在這台瀏覽器永遠開不起推播**（功能永久損壞）

第 2 點待審文件只把 `PUSH_ENDPOINT_OWNERSHIP` 列為現象，沒指出後果是**永久性的**：
前端零 `pushManager.unsubscribe()`、Service Worker 無 `pushsubscriptionchange` handler、
dispatch 只在 404/410 刪列、四個 pg_cron job 無一清理 `push_subscriptions`、
migrations 無任何帳號刪除路徑——**endpoint 永不失效**。

這是與隱私外洩並列的第二個 P0，不只是隱私問題。

### 2.2 外洩的最敏感欄位不是文件列的前三項

`[委派查證·附指令]` 十種 event 全部走同一個 payload builder
（`202607230001_notifications_web_push.sql:288-298`），欄位恰為
`court` / `start_at` / `slots_remaining` / `message`（各呼叫點寫死的固定字串）/ `url`；
edge function 再用 5 欄 allowlist 過一次（`dispatch.js:1`）。
**無 profile ID、無暱稱、無 LINE、無座標、無聊天正文。**

**本文首版寫「這三欄邊際洩漏接近零」，read-back 推翻，已撤回**：

- `session_discovery` 的 where 限定 `status in ('open','full')` 且在時間窗內，
  所以 **cancelled／逾期下架／已封存局**的通知所帶 `court` + `start_at`，匿名端當下讀不到
- 更根本的是：真正的洩漏不是欄位值，而是**「這台裝置＝A」與該球局的關聯**
- 首版同一節舉的 `session_reminder` 高敏感例，正是由這兩個被說成「接近零」的欄位組成

待審文件 §3.2 明文拒絕把風險降級（「不能因沒有聊天正文而降級成一般架構債」），首版的說法是**倒退**。

私有增量有兩個，`title` 與 `message` **同級**：

- **`title`**（`dispatch.js:43-56` 依 event_type 查表）：「你收到球局邀請」「加入申請結果更新」
  「有新的加入申請」
- **`message`**（資料庫呼叫點寫死）：「有人申請加入你的球局。」「有球友直接加入你的球局。」
  「球局已取消。」——揭露的角色與生命週期資訊與 title 同級，且 `push-sw.js` 把它直接放進通知 body
- **`session_reminder`** 額外洩漏「A 一小時後會出現在某座具名球場」的人身時間地點

### 2.3 一個放大因子

`src/features/notifications/notificationFeature.ts:137-148` 的
`seedAllTaipeiCourtSubscriptions` 讓新帳號預設訂閱全部台北市 active 球場，
而 `court_new_session` 在 `notification_pref_enabled`（`202607270007:90`）是硬編 `true` **不可關閉**。
殘留裝置收到的是**高頻**而非偶發的 A 通知。

---

## 3. §8 Bundle：七個數字全對，但清單有漏

### 3.1 數字複現 `[已驗證]`

我用與 `check-production-bundle.mjs` **完全相同的口徑**（遞迴掃整個 `dist/`、
`zlib.gzipSync` 預設、entry 由 `index.html` 唯一 script 決定）重算，§8.1 七項逐一吻合，零偏差。

**`dist/` 的可信度也已證明**（這是前三份都沒檢查的前提）：working tree 對 `src/` 乾淨、
無任何 src 檔比 `dist/` 新、主 chunk 檔名 `index-BWygPPVv.js` 在對話期間被 agent 重建後**不變**
（hash 相同即內容相同）。

**但排序易誤導，且待審文件的七項不是全域排序** `[已驗證]`。
以 gate 實際強制的**全部** byte 上限排序，最緊的六個 gzip 約束是：

| 約束 | 餘裕 gzip |
| --- | ---: |
| MePage | **551** |
| SessionDetailSheet | 653 |
| MySessionsPage | 672 |
| CreateSessionSheet | 958 |
| Sentry chunk | 1,277 |
| total JS | **1,435** |

待審文件（與本文首版）只重排它自列的七項，漏掉中間三個 lazy chunk。

**引入 Router/Query 的真正約束是 total gzip 1,435 B**（因為新依賴會進 main chunk 或增加總量），
main chunk gzip 餘裕 4,954 相對它是 **3.45 倍**。
（本文首版寫「高估近 40 倍」是 raw 對 gzip 的口徑混用——19,930 raw ÷ 551 gzip；
同口徑為 8.99 倍。已更正。）

**漏列一項** `[已驗證]`：Sentry chunk 的 **raw 餘裕 2,025**（實測 87,975／上限 90,000）。
它與已列的 gzip 1,277 是同一個 chunk 的兩條獨立上限。

### 3.2 §8.2 漏掉整條 gate 最承重的一項 `[已驗證]`

`scripts/check-production-bundle.mjs:36-51` 會先跑一次 **development mode 的 Vite build**，
斷言 E2E hook **存在**：

```js
assert.ok(
  developmentJavaScript.includes(E2E_TEST_HOOK_IDENTIFIER),
  "development bundle must retain the E2E hook before production absence can be trusted"
);
```

這是**反向 canary**——證明「production 不含 hook」這個斷言有牙的唯一機制。
沒有它，production 的「不存在」可能只是掃到空集合而假綠。

§8.2 的十條 bullet 覆蓋了 12 個非 byte assert 中的 11 個（其中一條合併了 `:80` 與 `:84`），
**唯一沒覆蓋的就是 `:48`** ——在 ADR 重寫 gate 時最容易被砍掉的那一條。

### 3.3 gate 本身的兩個結構弱點（非文件錯誤，但 ADR 要處理）

`[委派查證·附指令]`

1. **CSS 65,865 B 完全不在任何 byte limit 內**——只有 JS 有預算。
2. **Sentry 分類靠字串比對**（chunk 含 `sentry_version`）。若 Sentry 被合併進某個應用 lazy chunk，
   該 chunk 會自動改吃 90,000／31,000 的寬鬆預算而非 18,000／5,500，能靜默吞掉大幅回歸。
   且 `:94` 只斷言 `sentryChunks.length > 0`，不像 private repository 的 `:108` 斷言恰為 1——
   Sentry 可被切成多個各自低於 90 KB 的 chunk 而不翻紅。

---

## 4. 預算公式：本文首版的判斷被 read-back 推翻，已撤回

**首版寫「年度 10% 是被專案廢棄的舊公式復辟」——這是類別錯誤，已撤回。** `[已驗證]`

git 歷史屬實：

```
c5ee87e (2026-08-21) scripts/check-production-bundle.mjs:7
  // Keep 10% headroom for normal maintenance without allowing the main chunk to grow back unnoticed.
395f415 (2026-08-25) 現行
  :8   // One 4 KiB raw / 1 KiB gzip maintenance window …
  :17  // … A 1% ceiling prevents split-induced growth.
```

但這兩個 10% **不是同一件事**：

| | `c5ee87e` 的 10% | 待審文件的年度 10% |
| --- | --- | --- |
| 作用對象 | main chunk 的**靜態上限** | **total gzip** |
| 性質 | 一次性設定上限時的寬放乘數 | **年度累積**治理的觸發線 |
| 與現行窗口的關係 | 被 4 KiB／1 KiB 窗口**取代** | **疊加**於窗口之上 |

而且首版同一段內同時主張「復辟舊公式」與「憑空自訂」兩個互斥說法。

**更重要的是首版的建議會造成傷害**：現行的「4 KiB／1 KiB 窗口 + 每次 1% ceiling」
是 **per-change** 約束，對 **N 次累積成長沒有任何上限**。刪掉年度條款等於拿掉唯一針對累積的守門。

**修正後的建議**：**保留**年度累積治理的概念（形式可再議），並補一條 canary 要求
（放寬上限後必須證明新上限仍會翻紅——建立這條 gate 的 `1ec3b34` commit body 本來就有 Canary 欄位）。

方案 D 仍有三個實際問題 `[委派查證]`：

- 公式若照字面採 `max()`，會在**沒有任何新依賴**的情況下直接放寬 8 個常數中的 4 個
  （main raw +2,452、main gzip +890、lazy raw +3,008、lazy gzip +646），
  與方案 D 自己第 5 條「禁止預留未使用空間」自相矛盾。
- 「該類總量 1%」語意不明：對 lazy chunk 是單一 chunk 的 1% 還是所有 lazy chunk 總和的 1%？
  腳本現行對 lazy 是**逐 chunk** 比對（`:110-123`）。
- 方案 D 只要求改 `react-migration.md`，但**專案有兩處對這條 gate 的描述已經過時**（見 §5）。

---

## 5. 專案文件自身的過時處（非待審文件，但會誤導派工）

這三條是本輪「不採信文件」方法的副產品——連規則檔與 CLAUDE.md 都與程式碼不符。

| 位置 | 現況描述 | 程式碼實況 |
| --- | --- | --- |
| `CLAUDE.md:73` | 「`npm run check:production-bundle` 阻止示範暱稱進入 `dist`」 | 它同時執行 **8 個 byte 上限**與 12 個非 byte 斷言，自 2026-08-21 加入 size gate 後描述即過時 `[已驗證]` |
| `.claude/rules/testing.md:42` | 「防止 mock 暱稱被打進正式產物」 | 同上 `[已驗證]` |
| `.claude/rules/testing.md:56-57` | mock project 執行 `smoke`／`performance`／`error-boundary`／`react-unmount` **四支** spec | `playwright.config.js:48` 的 `testMatch` 實際是**五支**，多 `react-page-focus.spec.js` `[已驗證]` |

還有一個機制洞 `[委派查證]`：`scripts/check-production-bundle.mjs` **不被任何規則檔的 paths glob
涵蓋**，所以要動那 8 個常數的人，在機制上讀不到 `react-migration.md` 那條一票否決規則。

---

## 6. 其餘題目的重點結論

### Q21／Q22 blockedPlayers facade

`[委派查證]` 它仍是四個候選中最佳，但待審文件有一個理由要修：

- **「單一主要載入者」函式層面成立，呼叫點有三處**：`main.js:458`（Me 頁開啟）、
  `chatController.ts:177`（在 `blockChatSender` 內，非「聊天開啟」）、
  `mySessionsController.ts:234`（解除封鎖後重讀）。facade 的 `load()`／`refresh()` 要接住這三個入口。

（首版另指控待審文件「把 `clearForAccountChange()` 當現況」——**這是對不存在敘述的更正，已撤回**。
`final-candidate:561-568` 明白把它列在「建立 feature-level facade，明確區分」之下，
`:826` 問的正是這個**待建** API 夠不夠。現況等價物是
`authController.ts:148` 的 `blockedPlayerGate.invalidate()` 加 `:149-155` 內聯 setState。）
- **「有必要的帳號切換清除路徑」反而是它比對照組差的地方**：`playerLayer`／`playerDirectory`
  已有具名清除函式（`clearPlayerLayer`／`clearPlayerDirectory`），形狀就是文件想要的；
  blockedPlayers 是唯一還停留在內聯 setState 的。

**Q22 的答案**：`clearForAccountChange()` 單靠自己不夠，必須把 `gate.invalidate()` 一起納入，
否則就是把唯一擋住「清除後 in-flight 回來覆寫」的機制拆掉。

驗收條件還要補兩條：`authController.ts:149-156` 那筆 setState **同時寫了三欄與
`mySessionsError`／`mySessionsStatus`**，抽走三欄必須把它拆成兩筆；
`mySessionsController.ts:228` 的 `read().blockedPlayers.some(...)` 同步守衛需要新的取得路徑。

### Q23–Q26 Chat + Messages

`[委派查證]` 仍是七維度中最輕的第一片，但有一個重要修正：

**「零 store 欄位」不等於「零 server state」。** chat 的 server state 藏在
`surfaceRegistry "chat"` 的 context（messages／roster／lastMarkedMessageId）
與 `mySessions[]` 元素上的 `unreadMessageCount`。

**Q24 的答案**：`chatController.ts:98` 的 `context.session.unreadMessageCount = 0` 是就地變異
store 陣列元素、繞過 `store.setState`。應改成 `mySessionsController` 擁有的
`clearMySessionUnread(sessionId)`，權威來源是 `public.my_session_participations` 的
derived 欄 `unread_message_count`。

**Q26 不可被 facade 取代的三件事**：`requestGate.issue()` 的「遞增世代＝取消上一次 in-flight」、
`authSnapshot` 的 epoch 比對（authEpoch 在 identity／gate／readiness 任一改變時 +1，
同一使用者掉了 NTRP 門檻也會失效——這是**授權語意不是快取語意**）、
`surfaceRegistry.is("chat", context)` 的 context identity 比對。

### Q27 §14 隱私規則不完整

`[已驗證]` **`access_token` 已經在 localStorage**：`src/supabaseClient.js:16` 的
`persistSession: true` 讓 supabase-js 把 access／refresh token 存進
`tennis-partner-finder-auth`，而 `src/data/authApi.ts:48` 直接讀它。

所以 §14 的「access token 不得進…任何可序列化結構」**以字面而言在現況即不成立、
且無法達成**。必須改寫成「除 supabase-js 官方 session storage 之外」，
否則是一條註定違反、無法當 gate 的規則。

`[委派查證]` §14 的十一條全部落在「未來 cache 函式庫 + history/URL」，
漏掉四個**實際會把資料送出瀏覽器**的出口：PostgREST GET query string（精確 bounds）、
`update_my_presence` RPC POST body（raw GPS）、Google Maps JS 第三方、Vercel Analytics。
**前兩者已經在跑**，不是未來風險。

### Q28 access_token fallback 的觸發條件

`[委派查證]` auth-js 的 `_isValidSession()` 只檢查 `access_token`／`refresh_token`／`expires_at`，
**不檢查 `user`**。所以任何被竄改、被截斷或來自舊格式的 localStorage session 都會通過
`getSession()`，此時 `user?.id` 為 undefined，`access_token` 就被寫進
`history.state.pageOwnerIdentity`（瀏覽器會結構化複製並持久化）。

**正常流程不可觸發、異常流程可觸發。** 安全替代值：`session?.user?.id ?? null`，
移除 access_token 分支即可——唯一消費者 `main.js:495-500` 已有 `pageOwnerIdentity &&` 的
null 短路，行為與目前登出狀態一致。**不可用 authEpoch 之類的 per-load 序號取代**，
因為 history.state 會跨 reload 存活，序號會誤判為換帳號而把使用者彈回地圖。

### Q29 §15 驗收規則

`[委派查證]` 沒有錯誤指令。

**首版寫「前八條逐字等於 `npm run test:ci:frontend` 的組成」是假的，已更正** `[已驗證]`：
待審文件 §15.1 的 code fence 共九行，第 6 行是 `npm run test:local`（不屬於 `test:ci:frontend`），
而 `test:ci:frontend` 的第 8 步 `git diff --check` 落在第 9 行、被「前八條」排除。
正確說法是「**九條 = `test:ci:frontend` 的八條，在 `test:mock` 之後插入 `npm run test:local`**」。

（這條首版掛 `[委派查證]` 卻寫成肯定句——與本文 §1.2 自陳「第三份照抄 agent 未複驗」
是同一個機制第二次發生。）

四個實質問題：

1. **缺前置**：`npm run test:local` 沒有 `npx supabase start` 與 guarded reset 會直接丟錯
   （`tests/fixtures/localSupabaseConfig.js:53-58` 在 status 非 0 時 throw）
2. 缺 `npm run test:mock:webkit`
3. 把 `supabase-mobile-chromium` 從 testing.md 的**無條件**標準清單降級成條件必跑，
   **比它自稱依循的規則寬鬆**（CI 的 `test:ci:supabase` 是無條件跑的）
4. §15.2 第二個 code fence 混入兩行不是指令的人工驗證項

「重複執行 typecheck」確實存在（顯式一次 + `pretest:mock` + `pretest:local` 共三次），
但實測 typecheck 僅約 2.5 秒，屬可忽略。

### Q30 內部一致性

`[委派查證]` §2.1「已完成」清單**逐項用程式碼與 git 驗過全部成立**，不需引用 roadmap。
但要補一句文件沒寫的現況：**`main.js` 仍持有頁面容器的 `hidden`（`:419`）與
heading focus（`:478`）** `[已驗證]`——這正是 §4.3 自己定義的雙重 ownership，卻沒列進清單。

**§18 的「可做／不可直接做」與 §19 的九個階段不對齊**：階段 0、階段 1（ds-bundle 以外）、
階段 2、階段 4 既不在可做也不在不可直接做，**實作授權留白**。
而 §18「可做」只授權「不改 runtime 的測試／gate 草案」與「preview performance 設計」，
但階段 0／2 的實際交付物是會落檔的測試與 Playwright project。

（首版在此指控 §11.1 轉述第三份比較表時「丟掉保留語」——**已撤回**。
`§11.1` 三條全部是相對敘述（「相對較少」「相對充足」「低於其他主要候選」），
正是第三份保留語允許的用法；且 `§11.2` 第 3 點已把「複驗第三輪比較表中的
production caller、surface、transition 與測試數量」列為動工前置。
首版另寫「沒標已驗證的那四列」也錯——第三份該表未標 `[已驗證]` 的實為六列。）

---

## 7. 建議的修訂清單

派工前必改（§1 五處）：

1. §5.2 Gate B 的「現況應為零」→ 改寫；allowlist 要涵蓋**三處** Document 型別宣告
   （`discoveryMapController.ts:72`、`sessionController.ts:128`、`chatController.ts:57`），
   其中兩處是預設參數
2. §14 的 `sessionIdentity()` → `authIdentity()`，並註明是兩個重複實作
3. §6.1 的 dead preload → 指名 `main.js:687`，附死因證明
4. §4.2 aria-live 表 → **不要**把 `sessionViews.js:485` 加進「不得重建」表（那是載入佔位，
   會製造假契約）；改把它併入 §5.1 Gate A 的 `html:` 後門討論。表本身要修：五列不是四列、
   統一 `#player-layer-status` 與 `#map-data-status` 的 owner 欄口徑
5. §19／§5.5／§6.2 的 CSS gate 階段歸屬 → 擇一

應補正：

6. §8.1 補 Sentry raw 餘裕 2,025；重排時要涵蓋**全部** byte 上限
   （最緊六個依序：MePage 551、SessionDetailSheet 653、MySessionsPage 672、
   CreateSessionSheet 958、Sentry 1,277、total 1,435），不是只重排自列的七項
7. §8.2 補 `check-production-bundle.mjs:48` 的 development build 反向 canary
8. §8.3 方案 D **保留**年度累積治理條款（現行窗口是 per-change，對 N 次累積無上限），
   補 canary 要求與「該類總量 1%」的消歧
9. §14 的 access token 條款改寫成「除 supabase-js 官方 session storage 之外」，
   並補四個實際外送出口
10. §15.1 補 `npx supabase start` 與 guarded reset 前置、補 `test:mock:webkit`；
    §15.2 的 `supabase-mobile-chromium` 改回無條件；分離人工驗證項。
    口徑：**九條 = `test:ci:frontend` 的八條在 `test:mock` 後插入 `test:local`**
11. §10 blockedPlayers 的「單一主要載入者」改寫為三個呼叫點；驗收補兩條
    （`authController.ts:149-155` 那筆 setState 要拆成兩筆；
    `mySessionsController.ts:228` 的同步守衛需新取得路徑）
12. §3.2 外洩範圍補 `title` **與 `message`**（同級）、`session_reminder` 的人身時間地點，
    並補第二個影響面（B 在該裝置功能永久損壞）
13. §4.3 雙重 ownership 清單補 `main.js:419`／`:478`
14. §18 與 §19 對齊，補齊**五個**階段的授權狀態（階段 0／1／2／4／5）

專案文件（非待審文件）：

16. `CLAUDE.md:73`、`.claude/rules/testing.md:42` 對 `check:production-bundle` 的描述補上 byte 上限
17. `.claude/rules/testing.md:56-57` 的 spec 清單補 `react-page-focus.spec.js`
18. 把 `scripts/check-production-bundle.mjs` 納入某個規則檔的 paths 涵蓋範圍

---

## 8. 覆蓋範圍、證據狀態與 read-back 結果

### 8.1 覆蓋缺口（首版未揭露）

待審文件 §17 提出 **30 題**。本文只系統回答 **Q21–Q30**；
**Q3–Q8、Q11–Q14、Q16–Q18 未答，且首版沒有揭露這個缺口。**

這有實際後果：**Q7（mutation 帳本能否低誤報）與 Q8（Gate A 掃描面是否仍有後門）
正是階段 0 的放行條件**。§1 的「派工單發出前必須先改的五處」在缺這兩題答案的情況下，
**不足以放行階段 0**。

（注意撞號：本文 §4 提到的「第三份的 Q8」是預算公式那題，與待審文件的 Q8 不同。）

### 8.2 證據狀態

- **主對話親自複驗**（`[已驗證]`）：§1.1–§1.4（§1.5 為文件比對，未標）、
  §3.1 的 bundle 對帳與 `dist/` 可信度、§3.2 的 development canary、§4 的 git 歷史、
  §5 的三條過時描述、§6 的 access_token 在 localStorage、§6 Q30 的 `main.js:419/:478`。
- **委派查證**（`[委派查證]`）：其餘結論，每筆附 agent 的行號與 `verifyCommand`，主對話未逐一重跑。
- 附錄 A 的指令**未涵蓋 per-chunk 數字**（Sentry raw 2,025、MePage 551 等），
  這些請用 §3.1 表格下方的 node 一行式自行重算。

### 8.3 read-back 結果與前三輪的比較

三名 opus agent、95 項檢查、**23 筆 FAIL**（含對立審查組的 14 筆）。首版錯誤已於本版修正。

| 輪次 | 檢查項 | FAIL | 比率 |
| --- | ---: | ---: | ---: |
| 第二份 | 97 | 21 | 21.6% |
| 第三份 | 194 | 38 | 19.6% |
| 第四份（本文） | 95 | 23 | 24.2% |

**比率沒有下降。** 更重要的是 read-back 明確標出 **11 條與前兩輪同型的錯誤複發**，
涵蓋前輪已知六類的**全部**：數字口徑混用／分母錯（4 筆）、對不存在的敘述做更正（2 筆）、
證據分級不自洽、誇大定性（3 筆）、委派結論未複驗當自己結論、引用二手舊狀態，
外加一類新的（對立面誤等同，即 §4 的兩個 10%）。

三份文件在落盤前寫下的紀律（數字用指令產生、二手要複驗、介面語意讀宣告）
**沒有阻止同型錯誤複發**。read-back 的觀察是：凡有 `verifyCommand` 產生的數字全部精確複現，
失準的都是**手數且未附指令的枚舉**（表格列數、allowlist 筆數、清單項次）
與**沒有數字的定性句**。

---

## 附錄：可複驗指令

```bash
# §1.1 Gate B 的現況
grep -rnE "document" src/controller/ src/sessionController.ts | grep -v "//"   # → 2 筆

# §1.2 兩個 identity 函式
grep -rn "sessionIdentity\|authIdentity" src/ | grep -E "export function|main.js:424"

# §1.3 兩個 preload call site
grep -n "preloadAuthenticatedViewsForAuth" src/main.js   # → :103 import, :643 活, :687 死

# §1.4 被遺漏的 aria-live
sed -n '485p' src/sessionViews.js

# §3.1 bundle 對帳（與 gate 同口徑：遞迴掃 dist，含 push-sw.js）
node -e '
const fs=require("fs"),z=require("zlib"),p=require("path");
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p.join(d,e.name)):[p.join(d,e.name)]);
const js=walk("dist").filter(f=>f.endsWith(".js"));
let R=0,G=0;for(const f of js){const b=fs.readFileSync(f);R+=b.length;G+=z.gzipSync(b).length;}
console.log("total raw",R,"gzip",G,"| 餘裕",849961-R,259062-G);'

# §3.1 dist 可信度
git status --short src/ ; find src -type f -newer dist/assets/index-BWygPPVv.js | head

# §3.2 development build 反向 canary
sed -n '36,51p' scripts/check-production-bundle.mjs

# §4 10% 廢棄史
git show c5ee87e:scripts/check-production-bundle.mjs | grep -n "10%"
sed -n '8p;17p' scripts/check-production-bundle.mjs

# §5 專案文件過時處
grep -n "check:production-bundle" CLAUDE.md .claude/rules/testing.md
sed -n '56,57p' .claude/rules/testing.md ; grep -n testMatch playwright.config.js | head -1

# §6 access_token 落地
grep -n "persistSession" src/supabaseClient.js ; sed -n '48p' src/data/authApi.ts

# §6 Q30 雙重 ownership
sed -n '419p;478p' src/main.js
```
