# 批 8.6：球局群組聊天 sheet 遷移 React（sheet 批壓軸）＋ 批 8.5 rider 回報

日期：2026-08-19（Asia/Taipei）

Base HEAD：`5e53fb76d7a4ad5b5c2563e8225e5dd25a4ec25d`（`git log --oneline -1` = `5e53fb7 docs: 遷移計劃進度——批 8.5 完成,雙 writer 模式與有牙實證入檔,暫停待 compact`）

## 0. 防偽引用（batch-8.5.md「驗收方註記」節第一句原文）

> 1. **偏離三條裁決全數接受**：raw 字串 vs esc()（React 自 escape，與批 8.3 String() 結論同類）；
>    歸零 querySelector 移除（死碼）；session===null 時間欄位當下時間（既有行為忠實保留，
>    是否修復列 PM 觀察項、不開批）。

本批直接沿用該節第 2 點的裁決：generation key 語意的**持久測試**（序列 click → setCourts →
resolveDecide → 驗 disabled）列為 rider 併入本批，詳見 §10。

## 1. 結論

球局群組聊天 sheet 已在公開簽名、七個參數預設值、`mountSheet` 參數、
`{ ...mounted, setArchived, setState }` handle 形狀與同步語意零變更下，把 `mountSheet` surface
內的內容遷移到 strict TSX：

```text
openSessionChatSheet(session, { canWithdraw, courts, onBlock, onClose,   → { ...mounted, setArchived, setState }
                                onPost, onReport, onWithdraw })
```

`mountSheet` 仍唯一擁有 `#sheet-root`、backdrop、`section.surface`、focus trap、capture-phase
Escape、surface stack、dismiss、close、isolation 與 opener 焦點回復。React 只掛進
`mounted.surface` 的 child list。

**判準零搬移**：`acceptedChatRoster`、`sessionScheduleLabel`、`sessionVenuePresentation`、
`formatNtrp`、`taipeiDateTime`、`runAsyncAction`、`scrollFeedToLatest`、`setArchived`、`setState`
的量測／還原三拍、announcement 計數、composer 驗證與 feed click 委派判準**全部留在
`sessionViews.js`**，TSX 一條也沒複製——逐條清單見 §5。唯一新增的 presentation 是
`chatRosterPresentation` 與 `chatMessagesPresentation`（由退役的 `chatRosterMarkup`／
`chatMessagesMarkup` 逐字改寫成資料版），住在 `sessionViews.js`、經 `sessionChatSheetRuntime`
橋接，TSX 只消費結果。

`src/main.js`、`src/sessionController.js`、`src/sheets.js`、`src/domainTypes.ts`、
`src/sheets/DecideSessionSheet.tsx`、CSS、HTML、`.claude/rules/**`、`tests/session.spec.js`、
`tests/session-mobile.spec.js`、`tests/performance.spec.js` 全數零 diff
（`git diff --name-only HEAD -- …` 無輸出、exit 0，逐字見 §14）。
`tests/smoke.spec.js` 只有 rider 的 **71 行純新增、0 行刪除**（§10）。
未 commit、未 stage、未 push；本批**未**執行 DB reset（八道 gate 一次全綠）。

## 2. 殼／內容／handle 責任分界

factory 先同步建立原殼，`html` 改為空字串：

```js
const mounted = mountSheet({
  id: "session-chat-sheet",
  label: "球局群組聊天",
  className: "session-chat-sheet",
  onClose,
  html: "",
});
```

`id`、`label`、`className`、`onClose` 逐字不變。

殼／內容邊界：

```text
#sheet-root                                              mountSheet 擁有
├─ .surface-backdrop[data-surface-dismiss]               mountSheet 擁有
└─ section#session-chat-sheet.surface.surface--sheet.session-chat-sheet   mountSheet 擁有
   ├─ div.chat-v2__head                                  React 內容（含 [data-surface-close] 返回鈕）
   ├─ div.chat-v2__info                                  React 內容
   │  ├─ section.chat-session-summary                    React 內容（常數 props）
   │  ├─ section.chat-roster                             React 內容（外部 DOM writer 注入面，§6.5）
   │  │  └─ div[data-chat-roster]                        **React state：roster 列**
   │  ├─ p[data-chat-loading]                            React 內容（之後由 setState 直接改）
   │  └─ p[data-chat-error]                              React 內容（之後由四個 legacy writer 改）
   ├─ section.chat-feed[data-chat-feed]                  **React state：訊息列**（onClick 委派）
   ├─ p[data-chat-announcement]                          React 內容（之後由 setState 直接改）
   ├─ p[data-chat-archived-note]                         React 內容（之後由 setArchived 直接改）
   ├─ form.chat-composer                                 React 內容（native submit listener 保留）
   │  ├─ input#chat-message-input                        React 內容（uncontrolled、常數 disabled）
   │  └─ button[data-testid=chat-send]                   React 內容（常數 disabled）
   └─ button[data-chat-withdraw]（條件）                  React 內容（之後由 setArchived .remove()）
```

`createRoot(mounted.surface)` 每個 mount element 只呼叫一次；初次 render 以 `flushSync` commit，
所以 factory 內緊接著的 `mounted.root.querySelector("[data-chat-feed]")` 等七個查詢都取得到節點。

`mountSurface` 建殼時 content 尚空，因此它當下綁不到 `[data-surface-close]`。React 端保留該
attribute，click handler 只呼叫 adapter 傳入的 `mounted.close()`；真正的 closed guard、stack
remove、Escape listener remove、isolation release、`onClose({ reason })` 與 focus restore 仍全在
`mountSheet` handle。等價性同批 8.1 已論證：HEAD 的 `[data-surface-close]` listener 收到的是
`MouseEvent`，`close({ reason = "dismiss", restoreFocus = true } = {})` 解構它得到的兩個值就是
預設值，與 `close()` 完全相同。

### 2.1 只有兩塊 React state，其餘九個節點維持 imperative

沿用批 8.5 確立的雙 writer 分界：`setState`、`setArchived`、composer 驗證分支與
`runAsyncAction` 都是**既有的 DOM writer**，把它們的目標節點交給 React 當會變的 prop 會產生
「兩個 writer 搶同一個屬性」的新風險。因此：

| 節點 | React 給的 prop | 之後誰寫 | 為何 React 不會覆寫 |
| --- | --- | --- | --- |
| `p[data-chat-loading]` | children 為字面文案，**無** `hidden` prop | `setState` 改 `hidden`／`textContent` | 未宣告的屬性不進 props diff；children 為常數 → 不 patch |
| `p[data-chat-error]` | `hidden`（常數 true）、無 children | `setState`／`setArchived`／composer 驗證／`runAsyncAction` | prop 值恆定 → re-render 時零 patch |
| `p[data-chat-announcement]` | 無 children、無 `hidden` | `setState` 的新訊息 diff | 同上 |
| `p[data-chat-archived-note]` | `hidden={!archived}`（mount 時常數） | `setArchived` 設 `hidden = false` | prop 來自 mount 時的 `archived`，永遠不變 |
| `input#chat-message-input` | `disabled={archived}`（常數）、無 `value`／`defaultValue` | `setArchived`、`runAsyncAction`、`onSuccess` 的 `input.value = ""` | uncontrolled；prop 不變 → 不 patch |
| `button[data-testid=chat-send]` | `disabled={archived}`（常數） | `setArchived`、`runAsyncAction` | 同上 |
| `button[data-chat-withdraw]` | 由 `canWithdraw && !archived`（常數）決定要不要畫 | `setArchived` 的 `.remove()` | 頂層 children 清單每次 render 完全相同 → 無 placement → React 不會把已移除的節點重新插回 |
| `section.chat-roster` | `className`／`aria-labelledby`（常數）、**無 `style`／無 `data-*` 變數** | e2e 的 `page.evaluate` 外部注入 | 同上（§6.5 實證） |
| `section.chat-feed` | `className`／`aria-label`／`onClick`（常數） | `scrollFeedToLatest` 的 `scrollTop`、e2e 的 inline `maxHeight` | React 不宣告 `style`，`scrollTop` 不是 attribute |

handle 不擴張，只轉送原本就存在的兩個方法：

```ts
export interface SessionChatContentContract {
  setContent(roster: readonly SessionRosterEntry[], messages: readonly ChatMessage[]): void;
}
```

```js
return { ...mounted, setArchived, setState };
```

`setArchived` 的函式本體**一個 token 未改**；`setState` 只把兩行 innerHTML 換成一行
`content.setContent(participants, safeMessages)`，其餘七行（含量測／還原三拍與 announcement 計數）
逐字不變。content 端以 `flushSync` 包住 imperative 呼叫，方法返回前 DOM 已更新——這是
`setState` 緊接著要讀 `feed.scrollHeight` 並寫 `feed.scrollTop` 的前提。

### 2.2 時序凍結：初次 render 是「roster 讀取中 ＋ feed 完全空」

HEAD 的 `mountSheet` 產出的是
`<div data-chat-roster><p class="surface__copy">正在讀取參加者…</p></div>` 與
**完全沒有任何子節點**的 `<section class="chat-feed qm-scroll" data-chat-feed>`；
只有第一次 `setState()` 才會把兩者換掉（`refreshActiveChat` 於 `openSessionChat` 之後才呼叫）。

React 版照抄：state 初值是 `{ messages: null, roster: null }`，`roster === null` 畫那一行
「正在讀取參加者…」、`messages === null` 畫 `null`（不產生任何節點，連空狀態 `<p>` 都沒有）。

**這個選擇不是風格問題**：若初值改成「空陣列」，feed 會在 mount 當下就顯示
`目前還沒有訊息，從一句招呼開始吧。`，而 HEAD 是空白。probe 案例
`initial-mount-no-set-state` 逐屬性守住這一點（兩樹的 `[data-chat-feed]` `childOrder` 皆為 `[]`）。

## 3. `setState` 對映表

HEAD（`sessionViews.js` @ `5e53fb7`，逐字）：

```js
const nearBottom = !feedInitialized || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
const previousScrollTop = feed.scrollTop;
roster.innerHTML = chatRosterMarkup(participants);
feed.innerHTML = chatMessagesMarkup(safeMessages);
if (nearBottom) scrollFeedToLatest();
else feed.scrollTop = previousScrollTop;
```

React state 只有兩份：`rows`（`{ messages, roster }`，各自可為 `null`）與 `generation`（int）。

| 舊 imperative 寫入 | React state／render | 凍結結果 |
| --- | --- | --- |
| `loading.hidden = status !== "loading"` | **留在 adapter，逐字不動** | React 不宣告 `hidden` prop |
| `if (status === "loading") loading.textContent = …` | **留在 adapter，逐字不動** | React children 為同一句常數字面量 |
| `error.textContent = errorMessage; error.hidden = !errorMessage` | **留在 adapter，逐字不動** | 同 §2.1 |
| `const nearBottom = … < 48` ／ `const previousScrollTop = …` | **留在 adapter，逐字不動** | 量測在 `flushSync` **之前**，讀到的是舊 DOM |
| `roster.innerHTML = chatRosterMarkup(participants)` | `content.setContent(...)` → `chatRosterPresentation` → keyed `<span>` | `.join("")` 無分隔字元 → 新舊皆無空白節點 |
| `feed.innerHTML = chatMessagesMarkup(safeMessages)` | 同上 → `chatMessagesPresentation` → keyed `<article>` | 見 §6.1 generation key |
| `if (nearBottom) scrollFeedToLatest(); else feed.scrollTop = previousScrollTop` | **留在 adapter，逐字不動** | flushSync 之後才跑，DOM 已是新內容 |
| `Array.isArray(messages) ? messages : []` | **留在 adapter**（另在 presentation 內保留同一防呆） | 兩層 guard 都在，非陣列仍退化成空清單 |
| `esc(...)` × 11 處 → innerHTML | presentation 回 raw 字串，React 於 render 時 escape | 見 §16 偏離 1；probe `escaped-injection-body-and-nickname` 逐屬性為證 |
| `announcement.textContent = newMessageCount ? … : ""`、`knownMessageIds`、`feedInitialized` | **留在 adapter，逐字不動**（§6.4） | 計數狀態零 React 參與 |

## 4. `setArchived` 對映表：零 React 參與

HEAD 與本批**逐字相同**（本批一個 token 都沒改）：

```js
function setArchived(message = "") {
  archived = true;
  input.disabled = true;
  send.disabled = true;
  archivedNote.hidden = false;
  mounted.root.querySelector("[data-chat-withdraw]")?.remove();
  if (message) {
    error.textContent = message;
    error.hidden = false;
    error.focus({ preventScroll: true });
  }
  scrollFeedToLatest();
}
```

| HEAD 步驟 | 本批位置 | 凍結結果 |
| --- | --- | --- |
| 預設參數 `message = ""` | adapter（未動） | `sessionController.js:1552` 走預設（無 error 顯示）、`:1372` 傳 `error.message`，兩路皆同 |
| `archived = true` | adapter closure | composer submit 的 `if (archived …) return;` 與 `canRestoreControls: () => !archived` 都繼續生效 |
| `input.disabled` / `send.disabled` | adapter 直接改 React 產出的節點 | React 的 `disabled={archived}` 是 mount 時常數 prop，不會 patch 回去 |
| `archivedNote.hidden = false` | 同上 | React 的 `hidden={!archived}` 同為常數 prop |
| `[data-chat-withdraw]?.remove()` | 同上 | 節點從 DOM **消失**（非 hidden）；React 頂層 children 清單恆定、無 placement，不會重新插回。probe `set-archived-with-message-removes-withdraw` 的 `withdraw=0` 兩樹相同 |
| `error.textContent / hidden / focus()` | 同上 | probe 該案例的 `activeElement` 兩樹皆為 `p[class,data-chat-error,role,tabindex]` |
| `scrollFeedToLatest()` | adapter（未動） | 雙 rAF ＋ `scrollRequestId` 防過期邏輯一個 token 未改 |

## 5. 判準單一來源清單（TSX 零複製）

| 判準 | 位置（working tree） | TSX 有沒有複製 |
| --- | --- | --- |
| `acceptedChatRoster(roster)`（`status === "accepted"` 過濾） | `src/sessionViews.js:1483`（本批零修改） | 否；只被 `chatRosterPresentation` 呼叫 |
| 角色標籤／NTRP 後綴／暱稱 fallback | `src/sessionViews.js:1493` `chatRosterPresentation` | 否；TSX 只印 `row.text` |
| kind 正規化／isSelf／canGovern／senderInitial | `src/sessionViews.js:1511` `chatMessagesPresentation` | 否；TSX 只讀布林與字串欄位 |
| `formatNtrp(ntrp)` | `src/profile.js`（本批零修改） | 否 |
| `taipeiDateTime(createdAt)` | `src/taipeiTime.js:51`（本批零修改） | 否；adapter 端算好 `createdAtLabel` |
| `sessionScheduleLabel(session)`（header 副行） | `src/sessionViews.js:513`（本批零修改） | 否；adapter 算好 `headerSub` 當 prop |
| `sessionVenuePresentation(session, courts)` | `src/sessionViews.js:556`（本批零修改） | 否；adapter 只把 `badge`／`court`／`time` 三個字串當 prop |
| `archived` 三狀態判定（`cancelled`／`expired`／`played`） | `src/sessionViews.js:1556`（本批零修改） | 否；TSX 只收布林 prop |
| `runAsyncAction` 的 disable／rerender／restore | `src/sessionViews.js:746`（本批零修改） | 否 |
| composer 驗證（`!body \|\| body.length > 1000`） | `src/sessionViews.js:1651`（本批零修改） | 否 |
| feed click 委派（`event.target.closest(...)` ＋ 兩條 catch 文案） | `src/sessionViews.js:1672` `handleFeedClick` | 否；TSX 只把 prop 掛在 `[data-chat-feed]` 的 `onClick` |
| 捲動量測／還原三拍 | `src/sessionViews.js:1627` | 否 |
| announcement 新訊息計數 | `src/sessionViews.js:1632-1642` | 否 |
| `esc` | `src/util.js`（本批零修改） | 否；React 自己 escape（§16 偏離 1） |

TSX 內唯一的「判斷」是四個純 render 三元式（`rows.roster === null`／`length === 0`、
`rows.messages === null`／`length === 0`、`row.showAuthor`、`row.canGovern`）——前兩組是
HEAD 模板字串裡原本就寫在 view 層的空狀態分支，後兩個是 presentation 已經算好的布林欄位，
不是新判準。

## 6. 本批特有難題逐項論證

### 6.1 feed 捲動保留：選擇「重現 innerHTML 置換」（generation key 全重建）

派工單要求二擇一並論證。**本批選擇重現 innerHTML 置換**：`<article>` 與 roster `<span>` 的
key 都折入 `generation`，`setContent` 每次 `generation + 1`，因此每次 `setState` 都重建全部
訊息與 roster 節點，與 `innerHTML =` 等價；量測／還原三拍逐字照抄。

理由（派工單「不確定就選行為最保守的」）：

1. **捲動本身兩案皆等價，不是決定因素**。`nearBottom` 為真時走 `scrollFeedToLatest()`（明確
   寫 `feed.scrollTop = feed.scrollHeight`）；為假時走 `feed.scrollTop = previousScrollTop`。
   兩條分支都是**顯式賦值**，不依賴「重繪有沒有把 scrollTop 歸零」。所以保留節點也不會壞。
2. **真正的可觀察差異是焦點與選字**。HEAD 每 10 秒的安靜輪詢都會把 feed 整段換掉，使用者
   若正把焦點放在某則訊息的「檢舉」鈕上，焦點會掉回 `body`。保留節點會把這個行為變成
   「焦點留著」——是改善，但**是相對 HEAD 的行為變更**，且沒有任何既有測試覆蓋。
3. **對 `runAsyncAction` 語意的影響**：目前 feed 內沒有任何 `runAsyncAction` 控制項
   （report／block 走的是裸 `Promise.resolve(...).catch(...)`，不 disable 任何東西），所以
   今天兩案的 `rerendered()` 判定都不影響現存流程。但批 8.5 已證明「穩定 key 讓
   `rerendered()` 反轉」是一條會靜默改行為的路，feed 是未來最可能長出 pending 控制項的地方，
   保留 detach 語意是把這個風險留在原地而不是提前引入。
4. **既有測試兩案都會綠**，因此測試不能當判準——`expectChatFeedAtBottom`（`session.spec.js:85`）
   自己先 `feed.scrollTop = feed.scrollHeight` 再量，`smoke.spec.js:4901` 量的是首次
   `setState`（`feedInitialized === false` → 必走 `scrollFeedToLatest`）。這正是必須用 probe
   而非測試來鎖語意的原因。

**有牙實證**（避免重蹈批 8.5 「probe 涵蓋宣稱經 read-back 證偽」的覆轍）：probe 新增案例
`focus-in-feed-lost-on-refresh`（聚焦第一顆 `[data-chat-report]` → 再 `setState` 一次 →
比對 `document.activeElement`）。

- 現行 generation key：兩樹 `activeElement` 皆為 `{"tag":"body"}` → 0 mismatch。
- 臨時把 `<article>` 的 key 改成穩定的 `row.messageId` 後重跑同一支 probe：

```text
mismatchCount 2
{"key": "desktop::focus-in-feed-lost-on-refresh", "field": "activeElement", "head": {"tag": "body", "id": null, "testid": null, "attrNames": []}, "current": {"tag": "button", "id": null, "testid": null, "attrNames": ["class", "data-chat-report", "type"]}}
{"key": "mobile::focus-in-feed-lost-on-refresh", "field": "activeElement", "head": {"tag": "body", "id": null, "testid": null, "attrNames": []}, "current": {"tag": "button", "id": null, "testid": null, "attrNames": ["class", "data-chat-report", "type"]}}
```

即：穩定 key 下倖存的按鈕保住焦點、HEAD 掉到 body——這條案例**咬得住**，不是空覆蓋宣稱。
還原後 SHA 與最終版一致（§9.4）。

兩個捲動語意也各有一個獨立案例逐值鎖住（見 §8 的 `feedScroll` 引文）：
`scroll-restore-when-not-near-bottom`（捲到頂 → 刷新 → `scrollTop: 0`）與
`scroll-follows-when-near-bottom`（貼底 → 刷新 → `scrollTop: 1092` ＝ `1212 − 120`）。

### 6.2 runAsyncAction 對映：composer 節點必須穩定（批 8.5 的鏡像案例）

批 8.5 的球場按鈕與本批的 composer 是**同一條 `rerendered()` 規則的兩個相反面**：

```js
const rerendered = () => watchedNodes.some((node) => !belongsToRoot(node));
```

| | 批 8.5 decide 按鈕 | 批 8.6 composer `[send, input]` |
| --- | --- | --- |
| HEAD 的重繪會不會 detach 它？ | **會**（`courtButtons.innerHTML =` 就是它們的容器） | **不會**（`feed.innerHTML` / `roster.innerHTML` 都不含 composer） |
| 所以 HEAD 的 `rerendered()` 在刷新後 | `true` → 不還原控制項、`deciding` 停在 true | `false` → 正常還原、`onSuccess` 清空輸入框 |
| React 版要做的事 | 折入 generation key **強制重建** | **禁止**任何 generation／條件 key，維持 DOM identity |
| 做錯的後果 | 送出中刷新目錄 → 按鈕被不該地解鎖 | 傳訊中被輪詢打斷 → `rerendered()` 變 true → 輸入框與送出鈕**永久 disabled**、`input.value` 不會被清空 |

本批的作法：composer 的 `<form>`／`<label>`／`<input>`／`<button>` 全部是元件頂層的靜態
JSX，沒有 key、沒有條件、prop 全是 mount 時常數（`disabled={archived}`）。React state 只在
`[data-chat-roster]` 與 `[data-chat-feed]` 的 children 上，兩者都是 composer 的**兄弟以上**層級，
reconciliation 不會觸及它。

`controls: [send, input]` 是在 factory 頂端解析一次的節點參照（`mounted.root.querySelector`），
不是 live query——正因為節點 identity 穩定，這個 HEAD 寫法才能原封不動保留。

補充：`runAsyncAction({ root: mounted.root, ... })` 的 `root` 仍是 `#sheet-root`（不是
`mounted.surface`），與批 8.3 §15.4 同理——`mountSurface` 換頁時只做 `root.innerHTML = ""`，
`surface.contains(node)` 於 detach 後恆真。本批未動這一行。

實證：`session.spec.js:1675-1685`（local Supabase，真的送出→撞 `SESSION_ARCHIVED`→
`setArchived` 接手）在 `--repeat-each=3` 下 3/3 綠（§11）；probe 案例
`composer-empty-body-validation-error` 逐屬性確認驗證分支寫 error 節點後
`inputDisabled=false sendDisabled=false` 兩樹相同。

### 6.3 archived 三 writer

| writer | 觸發點 | 本批處置 |
| --- | --- | --- |
| ① 初始 render | `archived = ["cancelled","expired","played"].includes(...)` 於 factory 頂端算一次 | 以**常數 prop** 交付：`disabled={archived}` ×2、`hidden={!archived}`、`canWithdraw && !archived` |
| ② handle `setArchived(message)` | `sessionController.js:1372`（`SESSION_ARCHIVED` 錯誤，帶 `error.message`）與 `:1552`（authority change，走預設空字串） | 函式本體逐字不動（§4），直接寫 React 產出的節點 |
| ③ composer 的 `if (archived …) return` / `canRestoreControls: () => !archived` | 送出路徑 | `archived` 仍是 factory 的 `let`，②改它、③讀它，React 全程不參與 |

React 零 patch 的條件（三項同時成立，缺一不可）：

1. 這四個 prop 的值來自 mount 時就固定的 `archived`／`canWithdraw`，元件內部 state
   （`rows`／`generation`）不參與其計算——re-render 時 props diff 為空。
2. 元件頂層 children 清單每次 render 的長度與型別完全相同（withdraw 鈕的條件只依賴常數），
   因此 React 不會產生任何 placement，也就不會對已被 `.remove()` 的節點做 `insertBefore`。
3. `input` 是 uncontrolled（無 `value`／`defaultValue`／`onChange`），React 不管理它的 value。

`.remove()` 的「從 DOM 消失、不是 hidden」語意由 probe 直接鎖住：
`set-archived-with-message-removes-withdraw` 的 `withdraw=0`、
`can-withdraw-open-session` 的 `withdraw=1`，兩樹逐值相同。
既有 e2e 面：`smoke.spec.js:1151`（取消退出後 withdraw 鈕仍 enabled、可再開確認框）
在 desktop＋mobile `--repeat-each=3` 下 6/6 綠。

### 6.4 announcement 計數：狀態留閉包，零 React

`feedInitialized`、`knownMessageIds`、`scrollRequestId` 三個變數仍是 factory 的
`let`／`Set`，`setState` 內的 diff 區塊一個 token 未改：

```js
if (status === "ready") {
  const nextMessageIds = new Set(
    safeMessages.map((message) => String(message?.messageId ?? "")).filter(Boolean)
  );
  const newMessageCount = feedInitialized
    ? [...nextMessageIds].filter((messageId) => !knownMessageIds.has(messageId)).length
    : 0;
  announcement.textContent = newMessageCount ? `新增 ${newMessageCount} 則訊息` : "";
  knownMessageIds = nextMessageIds;
  feedInitialized = true;
}
```

歸屬決定：**不進 React state**。理由是這個計數同時是 `nearBottom` 首刷判定
（`!feedInitialized`）的來源，兩者必須看到同一個瞬時值；若拆一半進 React，`flushSync` 的
commit 邊界會在「量測」與「計數」之間切一刀，製造一個 HEAD 沒有的時序。留在閉包則語意
逐字等價。

probe 覆蓋：`status-loading-then-ready-announcement`（第一次 ready 不報數、第二次多一則報
`新增 1 則訊息`）、`ready-empty-feed-empty-roster`（空字串）、
`scroll-restore-when-not-near-bottom`／`scroll-follows-when-near-bottom`（各多一則 → `新增 1 則訊息`），
四案的 `[data-chat-announcement]` 文字兩樹逐字相同。
既有 e2e `smoke.spec.js:4912`／`:4931` 斷言 `""` → `新增 1 則訊息`，本批綠。

### 6.5 外部 DOM writer：`.chat-roster` 的注入屬性不可被抹掉

`tests/session.spec.js:1609-1623` 用 `MutationObserver` ＋ 兩層 `requestAnimationFrame`，
在第一則訊息出現後對 `document.querySelector(".chat-roster")` 寫入
`style.paddingBottom = "48px"` 與 `dataset.lateLayoutReady = "true"`，並在 `:1630` 斷言
`.chat-roster` 帶 `data-late-layout-ready="true"`。

注入面是外層的 `section.chat-roster`，**不是** React state 所在的內層
`div[data-chat-roster]`。安全條件：

1. `section.chat-roster` 的 JSX 只有 `className` 與 `aria-labelledby` 兩個常數 prop，
   **沒有 `style` prop、沒有任何 `data-*` prop**。React 只 patch 有變化的宣告 prop，
   未宣告的屬性完全不進 diff，因此外部寫入的 `style` 與 `data-late-layout-ready` 不會被清掉。
2. 該 `<section>` 不在任何帶 `generation` 的 key 之下，節點 identity 跨 re-render 穩定
   ——generation 只作用在 `div[data-chat-roster]` 與 `section.chat-feed` 的 **children**。

probe 案例 `external-attribute-injection-on-chat-roster` 直接重現這個序列（setState →
注入 style＋dataset → 再 setState 換 roster 與訊息），兩樹的 `.chat-roster` 屬性集合逐字相同：

```text
rosterAttrs=["aria-labelledby=chat-roster-title","class=chat-roster","data-late-layout-ready=true","style=padding-bottom: 48px;"]
members=["示範球友 · 球友 · NTRP 4.0","主揪暱稱 · 主揪 · NTRP 4.5"]
```

真實面則由 `session.spec.js:1566` 在 local Supabase `--repeat-each=3` 3/3 綠佐證。

### 6.6 feed click 委派 → React `onClick`（委派層級不變）

HEAD 是 `feed.addEventListener("click", handler)`——**委派在 feed 節點上**，所以訊息節點
被 innerHTML 重建也不用重綁。本批把同一個 handler 掛在同一個節點的 React `onClick`：

```jsx
<section className="chat-feed qm-scroll" data-chat-feed="" aria-label="群組訊息" onClick={onFeedClick}>
```

handler 本體從 inline 匿名函式改成 factory 內的 `const handleFeedClick = (event) => {...}`，
**內容一個 token 未改**（含 `event.target.closest("[data-chat-report]")`、
`Promise.resolve().then(() => onReport(...))` 的 microtask 語意、
`Promise.resolve(onBlock(...))` 的同步呼叫語意，以及兩條 catch 的 fallback 文案）。
`event.target` 在 React SyntheticEvent 上就是原生 `event.target`，`closest()` 判準因此不變；
委派層級沒有下移到按鈕，所以「點 feed 空白處不做事」也一樣。

**error 節點的 React 零 patch 條件**（派工單要求論證）：catch 分支寫的是
`error.textContent` 與 `error.hidden`。React 對該 `<p>` 宣告的是 `hidden`（常數 `true`）與
**零 children**；`textContent` 從來不是它的 prop，`hidden` 的 prop 值恆定。因此只要
① 該節點不在 generation key 之下（成立：它在 `div.chat-v2__info` 內、不屬 roster/feed children），
② 它的 props 不依賴 React state（成立），React 就永遠不會 patch 它。這與批 8.5
`[data-decision-error]` 是同一手法。

按鈕本身仍帶 `data-chat-report={row.messageId}` 與
`data-chat-block={row.senderProfileId}` ＋ `data-testid={`block-message-sender-${row.senderProfileId}`}`；
HEAD 的 `esc(message.messageId)`／`esc(senderProfileId)` 寫進 attribute 後，讀 `dataset` 得到的
是未 escape 的原值，與 presentation 的 `String(...)` 相同（§16 偏離 1）。
canary C（§9.3）把 `block-message-sender-` 前綴改名，local Supabase 的封鎖旅程立刻紅——
證明這條 data 屬性面確實由 React 驅動。

## 7. 新增 frozen runtime

```js
/** Roster chip and message row rules shared with the React chat sheet. */
export const sessionChatSheetRuntime = Object.freeze({
  chatMessagesPresentation,
  chatRosterPresentation,
});
```

`SessionChatSheet.tsx` 沿用批 8.3／8.4／8.5 已驗證的 lazy runtime resolve
（`function runtime() { return sessionChatSheetRuntime as unknown as SessionChatRuntime; }`），
避免 `sessionViews.js` eager glob → TSX → `sessionViews.js` 這條 circular edge 在初始化期 TDZ。

退役 helper 的反向 grep（executable caller，非註解）：

```text
$ grep -rn "chatRosterMarkup\|chatMessagesMarkup" src tests scripts supabase index.html
src/sessionViews.js:1490: * `chatRosterMarkup()` encoded inside its HTML string; the row text stays raw
src/sessionViews.js:1504: * else's user message) are the same rules the imperative `chatMessagesMarkup()`
exit=0
```

僅剩兩條**過去式註解**（說明新 presentation 對映的是哪一段舊碼），非 executable caller。

`acceptedChatRoster` 保留（`chatRosterPresentation` 是它唯一 caller）；`esc`（同檔仍有 11 個
呼叫）、`formatNtrp`（同檔仍有 3 個呼叫）、`taipeiDateTime`、`sessionScheduleLabel`、
`sessionVenuePresentation`、`runAsyncAction` 全部保留。

## 8. HEAD／current DOM 逐屬性 probe

以 `HEAD=5e53fb7` 建獨立 temp worktree（`cp -al` 硬連結 `node_modules` 後刪掉其 `.vite`、
相同 `.env.local`），HEAD 與工作樹**依序**各啟一個 Vite（5281／5282，不並行；直接 spawn
`<tree>/node_modules/.bin/vite`，不經 npx wrapper），probe 對 `#sheet-root` 每個 element 比較：

- `tag`
- 排序後完整 `attrs`
- **非純空白 text node 的逐字切分**（`meaningfulTextNodes`，批 8.3 的 serializer）
- 只串接非空白 descendant text node 的 `text`（批 8.4 §7.1 的修正定義，本批直接沿用，未出現假紅）
- 非空白 child 交錯順序 `childOrder` 與 children 陣列長度
- DOM **property**：`hiddenProp`、`disabledProp`、`valueProp`、`defaultValueProp`
- `document.activeElement` 指紋（tag／id／testid／屬性名集合）
- **`[data-chat-feed]` 的 `scrollTop`／`scrollHeight`／`clientHeight`**（本批新增，捲動語意的直接觀測）
- 注入的 `onPost`／`onBlock`／`onReport`／`onWithdraw` 實際收到的參數（`chatActions`）
- `#sheet-root` 內的 `img`／`script` 元素數（XSS 面）
- **幾何指紋**：每個 element 的 `getBoundingClientRect` 與
  `display`／`font`／`margin`／`padding`／`visibility`，desktop 1280×900 與 mobile 390×844 各一份

`sessionScheduleLabel` 會走 `taipeiDayWord(value, now = new Date())`，兩樹依序啟動相隔數十秒
會製造「今天／明天／週X」假差異，因此 probe 在開 sheet 前把 `window.Date` 換成固定時點
（`2099-08-01T00:00:00.000Z`）的子類、開完立刻還原（批 8.5 §16.8 教訓）。
`.surface.session-chat-sheet` 有 `animation: qmSlide 0.3s`，第一輪 probe 因為在動畫進行中取樣
量到 1392 條純 x 位移差（width／height／display 全同）；加上 600ms settle 後歸零，
詳見 §16 偏離 4。

fixture 刻意帶 `<img id="x-inject">&"'` 與 `<img src=x onerror=...>` 注入字串當球場名、
訊息本體與暱稱，同時驗 escape。18 個案例 × 2 viewport：

```json
{
  "cases": [
    "initial-mount-no-set-state",
    "ready-empty-feed-empty-roster",
    "ready-mixed-messages",
    "ready-no-govern-missing-sender-profile",
    "escaped-injection-body-and-nickname",
    "status-loading",
    "status-error",
    "status-loading-then-ready-announcement",
    "archived-session-at-open",
    "can-withdraw-open-session",
    "set-archived-with-message-removes-withdraw",
    "set-archived-default-no-message",
    "composer-empty-body-validation-error",
    "undecided-candidate-summary",
    "scroll-restore-when-not-near-bottom",
    "scroll-follows-when-near-bottom",
    "focus-in-feed-lost-on-refresh",
    "external-attribute-injection-on-chat-roster"
  ],
  "caseCount": 18,
  "viewports": ["desktop", "mobile"],
  "comparedKeys": 36,
  "geometryRowsCompared": 1588,
  "headConsoleErrors": [],
  "currentConsoleErrors": [],
  "headPageErrors": [],
  "currentPageErrors": [],
  "mismatchCount": 0,
  "nonTextMismatchCount": 0,
  "geometryMismatchCount": 0,
  "mismatches": [],
  "whitespaceOnlyTextNodes": {
    "headBlankTextNodes": 1830,
    "currentBlankTextNodes": 2,
    "nodesWithBlankDelta": 546
  }
}
```

掃描集非空（實算，非手數）：18 案例 × 2 viewport ＝ 36 個比較 key；
`geometry rows desktop total 794 mobile total 794`，單案例 29–118 條幾何列
（`per-case geometry rows min 29 max 118`）；`desktop::ready-mixed-messages` 單案 49 個 element。

派工單要求的涵蓋逐項對照：

| 派工單要求 | 案例 |
| --- | --- |
| 空 feed | `initial-mount-no-set-state`（連空狀態 `<p>` 都沒有）、`ready-empty-feed-empty-roster`（有空狀態 `<p>`） |
| 多訊息（self／other／system 混合） | `ready-mixed-messages`（system ＋ other ＋ self 三則） |
| canGovern 鈕 | `ready-mixed-messages`（other 那則有 report／block）、反例 `ready-no-govern-missing-sender-profile`（`senderProfileId` 為 `null` 與 `0` 兩種都不給鈕） |
| archived 態 | `archived-session-at-open`（開局即 cancelled）、`set-archived-with-message-removes-withdraw`、`set-archived-default-no-message` |
| canWithdraw 態 | `can-withdraw-open-session`（有鈕）、`archived-session-at-open`（`canWithdraw: true` 但 archived → 不畫）、`set-archived-with-message-removes-withdraw`（畫了之後被 `.remove()`） |
| roster 多人 | `ready-mixed-messages`（host＋guest＋一位 `requested` 被過濾掉）、`external-attribute-injection-on-chat-roster`（兩人） |
| 錯誤態 | `status-error`（`setState` 的 errorMessage）、`composer-empty-body-validation-error`（composer 驗證分支） |
| （加碼）loading 態 | `status-loading` |
| （加碼）announcement 計數 | `status-loading-then-ready-announcement` |
| （加碼）捲動兩分支 | `scroll-restore-when-not-near-bottom`、`scroll-follows-when-near-bottom` |
| （加碼）焦點語意 | `focus-in-feed-lost-on-refresh`（§6.1 有牙實證） |
| （加碼）外部 DOM writer | `external-attribute-injection-on-chat-roster` |
| （加碼）候選局 summary | `undecided-candidate-summary` |
| （加碼）escape 注入 | `escaped-injection-body-and-nickname` |

幾個關鍵觀測值兩樹逐字相同（從 probe JSON 直接抄錄，非手寫）：

```text
initial-mount-no-set-state
  members=[]  msgs=[]  feed childOrder=[]  ann=""  err=["",true]
ready-mixed-messages
  members  ["主揪暱稱 · 主揪 · NTRP 4.5","示範球友 · 球友"]
  msgs     [["1","system","false"],["2","user","false"],["3","user","true"]]
  summary  "已訂場 示範球場 · 大安區8月3日週一 10:00 · 雙打"
escaped-injection-body-and-nickname
  members  ["<img id=\"roster-inject\">&\"' · 球友 · NTRP 4.0"]
  bodies   ["<img src=x onerror=\"window.__chatXss=1\">一起打球 & 喝水"]
  summary  "已訂場 <img id=\"x-inject\">&\"'球場 · 大安區8月3日週一 10:00 · 雙打 <b>&\"'"
  img=0
status-loading-then-ready-announcement
  ann      "新增 1 則訊息"
set-archived-with-message-removes-withdraw
  err      ["這個球局已封存，無法再傳送訊息。",false]  note=false  withdraw=0
  inputDisabled=true sendDisabled=true
  active   p[class,data-chat-error,role,tabindex]
archived-session-at-open
  note=false withdraw=0 inputDisabled=true sendDisabled=true
composer-empty-body-validation-error
  err      ["請輸入 1 至 1000 字的純文字訊息。",false]  inputDisabled=false sendDisabled=false
undecided-candidate-summary
  summary  "候選局 示範球場、第二球場8月3日週一 10:00 至 8月3日週一 13:00 · 雙打"
scroll-restore-when-not-near-bottom
  feedScroll {"clientHeight":120,"scrollHeight":1212,"scrollTop":0}      ← 回看歷史，位置保留
scroll-follows-when-near-bottom
  feedScroll {"clientHeight":120,"scrollHeight":1212,"scrollTop":1092}   ← 貼底，跟捲到最新
focus-in-feed-lost-on-refresh
  active   {"tag":"body"}                                                ← 與 innerHTML 置換同語意
external-attribute-injection-on-chat-roster
  rosterAttrs ["aria-labelledby=chat-roster-title","class=chat-roster","data-late-layout-ready=true","style=padding-bottom: 48px;"]
```

### 8.1 唯一剩餘差異：純空白 text node（幾何指紋實證不可觀察）

HEAD 用 `innerHTML` 字串模板，換行與縮排留下 1830 個純空白 text node；React 產出 2 個
（來自 `#sheet-root` 本體與 `mountSurface` 自己的殼）。有 delta 的容器只有 14 種簽名（實算）：

```text
section.surface surface--sheet session-chat-sheet  head=258 current=0 nodes=36
div.chat-v2__head                                  head=108 current=0 nodes=36
button.chat-v2__back                               head=72  current=0 nodes=36
div.chat-v2__head-copy                             head=108 current=0 nodes=36
div.chat-v2__info                                  head=180 current=0 nodes=36
section.chat-session-summary                       head=108 current=0 nodes=36
section.chat-roster                                head=108 current=0 nodes=36
form.chat-composer                                 head=144 current=0 nodes=36
button.chat-v2__send                               head=72  current=0 nodes=36
article.chat-message chat-message--system          head=4   current=0 nodes=2
div.chat-message__bubble                           head=262 current=0 nodes=74
div.chat-message__meta                             head=220 current=0 nodes=74
article.chat-message chat-message--user            head=120 current=0 nodes=40
article.chat-message ... chat-message--self        head=64  current=0 nodes=32
```

CSS 論證（逐條對應 `src/session.css`，本批零修改）：

- `:1051` `.surface.session-chat-sheet { display: flex; flex-direction: column; }`
- `:1058` `.chat-v2__head { display: flex; }`
- `:1059` `.chat-v2__back { display: flex; }`
- `:1065` `.chat-session-summary { display: grid; }`
- `:1067` `.chat-roster { display: grid; }`
- `:1077` `.chat-message { display: flex; }`（三個 modifier 變體共用同一條）
- `:1087` `.chat-message__meta { display: flex; }`
- `:1090` `.chat-composer { display: flex; }`
- `:1094` `.chat-v2__send { display: flex; }`

以上九類都是 flex／grid，規範明定純空白子字串不產生 flex／grid item。
剩下兩類未宣告 `display`（＝`block`），其子節點全是 block-level box：

- `div.chat-v2__head-copy`：子節點為 `p.chat-v2__court`、`p.chat-v2__sub`。
- `div.chat-v2__info`：子節點為 `section.chat-session-summary`（grid）、`section.chat-roster`（grid）、
  `p[data-chat-loading]`、`p[data-chat-error]`。
- `div.chat-message__bubble`：子節點為 `p.chat-message__sender`、`p.chat-message__body`、
  `div.chat-message__meta`（flex，仍是 block-level box）。

block-level box 之間只含可摺疊空白的匿名 inline box 不產生 render box。

**實證**（比 CSS 論證更強）：18 案例 × 2 viewport × 每案 29–118 個 element 的
`getBoundingClientRect` 與 `display`／`font`／`margin`／`padding`／`visibility` 共 1588 條全部逐值
比對，`geometryMismatchCount: 0`。若那些空白 text node 真的產生 render box，同層 flex／inline
佈局會位移下游元素——幾何零差異即證明不可觀察。

特別注意 `.chat-session-summary` 內 `<strong>` 的那個**有意義**空格
（HEAD 是 `</span> ${esc(venue.court)}`）：TSX 用 `{\` ${venueCourt}\`}` 產生**單一** text node，
與 HEAD 的單一 text node 逐字相同（`meaningfulTextNodes` 零差異，非批 8.3 記過的「複合文字被
拆成多段」）。同理 `<span>{\`${venueTime} · ${playType}\`}</span>`。

## 9. React 接管 canary：四發，各自紅 → 綠

canary 前 SHA：

```text
3173540d2a1b62cd2891b89ead51deecd6ddf76b88febdf5f1231a8561a653a5  src/sessionViews.js
21217c7d93069d66f5c0be6692155fb0ec2beab977993ad257261d3b1ebb76ca  src/sheets/SessionChatSheet.tsx
01c59603867f29990a3b46755919a08046adcbdf1f9ff6a27c2119a4c9498615  tests/smoke.spec.js
```

### Canary A：React 內容確實在驅動整張 sheet（mock）

在 `mountSessionChatSheetContent` 的 `flushSync(render(<…/>))` 之後多插一行
`flushSync(() => reactRoot.render(null))`（並讓 contract 的 `setContent` 退化成 no-op）：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep "chat sheet escapes user bodies|cancelling chat withdrawal"
```

紅燈逐字（`grep -E '✘|✓|Error:|Locator:|Expected|Received|failed|passed'`）：

```text
  ✘  1 [desktop-chromium] › tests/smoke.spec.js:1151:1 › cancelling chat withdrawal keeps the action enabled and allows reopening confirmation (30.0s)
  ✘  2 [desktop-chromium] › tests/smoke.spec.js:4810:1 › chat sheet escapes user bodies, separates system messages, and becomes archived read-only (222ms)
    Error: locator.click: Test timeout of 30000ms exceeded.
    Error: page.evaluate: TypeError: Cannot read properties of null (reading 'style')
  2 failed
```

逐字還原後同命令：

```text
  ✓  1 [desktop-chromium] › tests/smoke.spec.js:1151:1 › cancelling chat withdrawal keeps the action enabled and allows reopening confirmation (676ms)
  ✓  2 [desktop-chromium] › tests/smoke.spec.js:4810:1 › chat sheet escapes user bodies, separates system messages, and becomes archived read-only (247ms)
  2 passed (1.8s)
```

### Canary B：轉義面確實靠 React 的文字節點（mock）

Canary A 只證明「內容有被畫出來」，證不到「訊息本體有被 escape」。第二發注入點刻意選在
訊息本體的轉義面——把 `<p className="chat-message__body">{row.body}</p>` 改成
`dangerouslySetInnerHTML={{ __html: row.body }}`（教訓同批 7／批 8.3 §16.2：注入點必須對準
測試實際斷言的那一面）：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium --grep "chat sheet escapes user bodies"
```

紅燈逐字：

```text
  ✘  1 [desktop-chromium] › tests/smoke.spec.js:4810:1 › chat sheet escapes user bodies, separates system messages, and becomes archived read-only (5.2s)
    Error: expect(locator).toHaveCount(expected) failed
    Locator:  getByTestId('session-chat-sheet').locator('img')
    Expected: 0
    Received: 1
  1 failed
```

逐字還原後同命令：

```text
  ✓  1 [desktop-chromium] › tests/smoke.spec.js:4810:1 › chat sheet escapes user bodies, separates system messages, and becomes archived read-only (287ms)
  1 passed (1.1s)
```

### Canary C：真實旅程（local Supabase）——送訊、封鎖、封存唯讀

前兩發都是 mock 直呼。第三發打真的資料庫旅程，注入點選在 block 鈕的 testid：
`block-message-sender-${id}` → `block-message-sender-x-${id}`：

```bash
TENNIS_TEST_HARNESS_MODE=local npx playwright test tests/session.spec.js \
  --project=supabase-chromium --grep "accepted members exchange escaped chat"
```

紅燈逐字：

```text
  ✘  1 [supabase-chromium] › tests/session.spec.js:1566:1 › accepted members exchange escaped chat, manage blocks, and retain archived read-only history (1.5m)
    Error: locator.click: Test timeout of 90000ms exceeded.
      - waiting for getByTestId('session-chat-sheet').getByTestId('block-message-sender-279').last()
  1 failed
```

逐字還原後同命令（併跑輪詢那一條）：

```text
  ✓  1 [supabase-chromium] › tests/session.spec.js:1491:1 › an open chat shows the other member's message via quiet polling without any user action (12.8s)
  ✓  2 [supabase-chromium] › tests/session.spec.js:1566:1 › accepted members exchange escaped chat, manage blocks, and retain archived read-only history (3.4s)
  2 passed (18.9s)
```

### 9.4 Canary D（probe 層）：generation key 的焦點語意有牙

見 §6.1。把 `<article>` 的 key 由 `` `${generation}:${index}` `` 改成穩定的 `row.messageId`，
同一支 probe 從 `mismatchCount 0` 變成 `mismatchCount 2`（desktop／mobile 各一條
`activeElement` 差異，逐字輸出見 §6.1）。還原後重跑 probe 回到 `mismatchCount 0`。

### 9.5 時序（批 8.4 §17.1／批 8.5 §8.3 教訓）

```text
1. 實作 sessionViews.js ＋ SessionChatSheet.tsx（最後一次功能性 src 編輯）
2. typecheck / lint / prettier 綠
3. rider 測試新增（tests/smoke.spec.js，純新增 71 行）
4. rider 有牙實證（DecideSessionSheet.tsx 暫改穩定 key → 紅 → 還原，SHA 802f… → 803f3463…，見 §10）
5. 第一輪 probe（HEAD 5281、current 5282，依序）→ DOM 0 mismatch、幾何 1392 條（動畫噪音）
6. probe 加 600ms 動畫 settle → mismatch 0
7. 記錄 canary 前 SHA（3173540d… / 21217c7d… / 01c59603…）
8. Canary A 紅 → 還原 → 綠
9. Canary B 紅 → 還原 → 綠
10. Canary C 紅（local Supabase）→ 還原 → 綠
11. --repeat-each=3 ×2（mock 42 passed、local 9 passed）
12. bundle 對照（HEAD worktree vs 工作樹）
13. 八道 gate 全綠，記錄最終 SHA（與步驟 7 完全相同）
14. probe 補 settle／focus 案例（**只改 scratchpad 的 probe 腳本，工作樹零編輯**）→ 18 案例 mismatch 0
15. Canary D（probe 層，工作樹暫改 key）紅 → 還原 → SHA 21217c7d… 逐字回復 → probe 重跑 mismatch 0
16. 還原後複驗：typecheck / lint / prettier / build / git diff --check 全綠，chat e2e 12 passed
```

步驟 15 的暫時編輯之後，`src/sheets/SessionChatSheet.tsx` 的 SHA 與步驟 7／13 **完全相同**
（`21217c7d93069d66f5c0be6692155fb0ec2beab977993ad257261d3b1ebb76ca`），
因此步驟 13 的 gate 證據對最終檔案內容成立；步驟 16 另做了一次快站複驗。

## 10. Rider（批 8.5 殘項）：generation key 語意的持久測試

### 10.1 新增測試

`tests/smoke.spec.js:390`（緊接在既有 `decision sheet waits for the court catalogue…` 之後，
比照該檔既有 decide sheet 測試的位置慣例）：

```text
test("refreshing the court catalogue during an in-flight decide detaches the buttons and leaves them locked after it resolves", …)
```

咬住的序列與驗收方指定的完全一致：

1. `openDecideSessionSheet(session, { courts: COURTS, courtsReady: true, onDecide })`，
   `onDecide` 回傳一個由 `window.__releaseDecideGeneration` 控制的 pending promise。
2. 點 `decide-court-105` → 進入 in-flight（`__decideGenerationCalls.length === 1`，兩顆鈕 disabled）。
3. 記下當下的 `[data-decide-court="105"]` 節點參照，再呼叫 handle 的
   `setCourts(COURTS, { ready: true })`（generation 遞增、按鈕重建）。
4. 斷言舊節點 `isConnected === false`——這正是 `runAsyncAction` 判定 `rerendered()` 的依據。
5. resolve decide promise，並用**兩輪 macrotask** 排空 microtask（讓「還原」若會發生就一定
   已經發生，最後的斷言不會在還原前假綠）。
6. 斷言 `[...document.querySelectorAll("[data-decide-court]")].map((b) => b.disabled)`
   逐值等於 `[true, true]`（另加掃描集非空下限斷言）。

`tests/smoke.spec.js` 的 diff 是 **71 insertions / 0 deletions**（`git diff --numstat` 逐字：
`71	0	tests/smoke.spec.js`；`git diff -U0 | grep -c '^-[^-]'` = `0`），既有行零修改。

### 10.2 有牙實證（紅 → 綠）

實證前 `src/sheets/DecideSessionSheet.tsx` SHA：

```text
803f3463eb2f1c236f3e33d1d8be87fd0c2834958e152c575c4d16c31fd4b51d  src/sheets/DecideSessionSheet.tsx
```

把 `key={\`${generation}:${option.id}\`}` 暫時改回穩定的 `key={option.id}`：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep "refreshing the court catalogue during an in-flight decide"
```

紅燈逐字（第一發，detach 斷言）：

```text
  ✘  1 [desktop-chromium] › tests/smoke.spec.js:390:1 › refreshing the court catalogue during an in-flight decide detaches the buttons and leaves them locked after it resolves (327ms)
    Error: the in-flight refresh must detach the pre-refresh candidate button
    Expected: false
    Received: true
  1 failed
```

為了證明**行為斷言**（而不只是 detach 斷言）也會紅，把該行暫時改成 `expect.soft` 讓測試
繼續跑到最後一步，同一個穩定 key 回歸下逐字：

```text
    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 2
    + Received  + 2

      Array [
    -   true,
    -   true,
    +   false,
    +   false,
      ]
```

即：穩定 key 下 `rerendered()` 變 false → `canRestoreControls` 放行 → `resolveControls: buttons`
把兩顆鈕都解鎖，行為與 generation key 版**完全相反**。這正是批 8.5 驗收方描述的反轉。

`expect.soft` 與 key 兩處改動逐字還原後同命令：

```text
  ✓  1 [desktop-chromium] › tests/smoke.spec.js:353:1 › decision sheet waits for the court catalogue and renders candidate buttons after refill (229ms)
  ✓  2 [desktop-chromium] › tests/smoke.spec.js:390:1 › refreshing the court catalogue during an in-flight decide detaches the buttons and leaves them locked after it resolves (268ms)
  2 passed (1.5s)
```

還原驗證（SHA 與批 8.5 最終版逐字相同，且 tracked diff 為空）：

```text
$ shasum -a 256 src/sheets/DecideSessionSheet.tsx
803f3463eb2f1c236f3e33d1d8be87fd0c2834958e152c575c4d16c31fd4b51d  src/sheets/DecideSessionSheet.tsx
$ git diff --name-only HEAD -- src/sheets/DecideSessionSheet.tsx
[no output] (exit 0)
```

## 11. chat／decide e2e `--repeat-each=3`

mock（desktop ＋ mobile 兩跑道）：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium --project=mobile-chromium \
  --grep "chat sheet escapes user bodies|cancelling chat withdrawal|390px primary map, filter, and chat governance|My Sessions exposes chat only to accepted members|undecided candidate sessions keep their court list|refreshing the court catalogue during an in-flight decide|decision sheet waits for the court catalogue" \
  --repeat-each=3
```

逐字結尾：

```text
  ✓  40 [mobile-chromium] › tests/smoke.spec.js:3597:1 › 390px primary map, filter, and chat governance targets are at least 44px (224ms)
  ✓  41 [mobile-chromium] › tests/smoke.spec.js:4810:1 › chat sheet escapes user bodies, separates system messages, and becomes archived read-only (233ms)
  ✓  42 [mobile-chromium] › tests/smoke.spec.js:4941:1 › My Sessions exposes chat only to accepted members while Me owns the authoritative block list (253ms)

  42 passed (15.3s)
```

local Supabase（真實 `post_session_message`／`set_player_block`／`cancel_session` 旅程 ＋ 10 秒輪詢）：

```bash
TENNIS_TEST_HARNESS_MODE=local npx playwright test tests/session.spec.js \
  --project=supabase-chromium \
  --grep "accepted members exchange escaped chat|an open chat shows the other member|a new chat message raises the recipient" \
  --repeat-each=3
```

```text
  ✓  7 [supabase-chromium] › tests/session.spec.js:1491:1 › an open chat shows the other member's message via quiet polling without any user action (12.8s)
  ✓  8 [supabase-chromium] › tests/session.spec.js:1566:1 › accepted members exchange escaped chat, manage blocks, and retain archived read-only history (3.3s)
  ✓  9 [supabase-chromium] › tests/session.spec.js:1689:1 › a new chat message raises the recipient's unread badge and nav dot, and opening chat clears both against the real database (1.6s)

  9 passed (1.0m)
```

## 12. Full-repo consumer sweep

```text
$ grep -rn "openSessionChatSheet|sessionChatSheetRuntime|chatRosterPresentation|chatMessagesPresentation|mountSessionChatSheetContent|SessionChatSheet" src tests scripts supabase index.html
```

### Production 呼叫點（本批零修改）

```text
src/main.js:82            import openSessionChatSheet
src/main.js:1507          openChat: openSessionChatSheet
src/sessionController.js:1386  const sheet = openChat(session, { canWithdraw, courts, onBlock, onClose, onPost, onReport, onWithdraw })
src/sessionController.js:1289/1298/1303  context.sheet?.setState?.({ … })   ← loading / ready / error 三態
src/sessionController.js:1372  context.sheet?.setArchived?.(error.message)  ← SESSION_ARCHIVED
src/sessionController.js:1552  activeChat.sheet?.setArchived?.()            ← authority change，走預設參數
```

`git diff --name-only HEAD -- src/main.js src/sessionController.js` 無輸出。

### 新內部 mount／runtime consumers

```text
src/sessionViews.js:73-76     browser-only eager glob ＋ mount symbol
src/sessionViews.js:1493      chatRosterPresentation
src/sessionViews.js:1511      chatMessagesPresentation
src/sessionViews.js:1537-1540 sessionChatSheetRuntime export
src/sessionViews.js:1555      mount 可用性 guard
src/sessionViews.js:1569      content mount call
src/sessionViews.js:1629      setState 內的 content.setContent
src/sheets/SessionChatSheet.tsx:6,35-36,65,98-99,273,279  runtime import／型別／lazy resolve／runtime 呼叫／mount export
```

### 既有 direct test consumers（零修改）

```text
tests/smoke.spec.js:1156-1158   import ＋ direct openSessionChatSheet（withdraw 確認框旅程）
tests/smoke.spec.js:1860-1882   candidate session 的 [aria-label='球局資訊'] 文案
tests/smoke.spec.js:1984-1998   同上（第二個候選局案例）
tests/smoke.spec.js:3603-3604   390px 治理鈕 44px 掃描（.chat-message__meta 內 report／block）
tests/smoke.spec.js:4816-4818   escapes／system／archived 主測試 ＋ window.__chatSheet handle
tests/session.spec.js:1491      10 秒安靜輪詢（local）
tests/session.spec.js:1566      escaped chat／block／archived read-only（local，含 .chat-roster 外部注入）
tests/session.spec.js:1689      未讀徽章閉環（local）
tests/session-mobile.spec.js:256  #session-chat-sheet 可見性（390px local）
```

`tests/session.spec.js`、`tests/session-mobile.spec.js` 的 SHA 開工／完工相同（§14）。

### `scripts/**`、`supabase/**`、`index.html`

以上 grep 在這三處零命中（輸出中無任何 `scripts/`、`supabase/`、`index.html` 行）。

## 13. 變更清單

- `src/sheets/SessionChatSheet.tsx`（新增，287 lines）：sheet 內容、roster／feed 兩塊 React state、
  generation key 全重建、九個 imperative 節點的常數 prop 交付、單一 imperative content contract
  （`setContent`）。
- `src/sessionViews.js`（修改，+75 / −91）：eager glob ＋ mount symbol、
  `chatRosterPresentation`、`chatMessagesPresentation`、`sessionChatSheetRuntime`、
  `openSessionChatSheet` 的 mount adapter；移除該 sheet 的整段 HTML 字串、兩個只服務它的字串
  markup helper（`chatRosterMarkup`／`chatMessagesMarkup`）與一個歸零的區域 querySelector
  （`roster`）。`scrollFeedToLatest`、`setArchived`、composer submit、withdraw click 四段函式本體
  一個 token 未改；`setState` 只換掉兩行 innerHTML。
- `tests/smoke.spec.js`（修改，+71 / −0）：批 8.5 rider 的持久測試，純新增。
- `docs/migration-reports/batch-8.6.md`：本回報。

刻意未改：`main.js`、`sessionController.js`、`sheets.js`、`modalIsolation.js`、`profile.js`、
`taipeiTime.js`、`sessionCriteria.js`、`util.js`、`map.js`、`pins.js`、`domainTypes.ts`、
`sheets/DecideSessionSheet.tsx`、HTML、CSS、`.claude/rules/**`、
`tests/session.spec.js`、`tests/session-mobile.spec.js`、`tests/performance.spec.js`、
`docs/frontend-migration-plan-2026-08-18.md`。

## 14. SHA-256 對照

Batch 開始（＝HEAD `5e53fb7` 的工作樹狀態，`git status` 乾淨）：

```text
83604b7fcc87f8ea2ede4efc6d962bfec06d1d51632eb3cadcf377456c7b0cd6  src/sessionViews.js
36dda9c8f3f3feef40b3b8776d188e15aa595375118b2f978406a6d5f7b198cc  src/sheets.js
24839cc13adcb4ce59c90c77326576c6fed4c07d338fbf6d834b0d60c7934b9e  src/main.js
383ff7a5e039e3a17c6a9f71ef7561e4dfa069e695a6ba1daa1d24036fd4714a  src/sessionController.js
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
45eb6177856820790ac4b1772c29c4be6b6b331e00678830377f06f6257b84e8  src/session.css
3bef9149f70f295e28a01be40b8b1207e88b2913d58b53fb4690b1b1ddfa90a4  .claude/rules/react-migration.md
66e08bc22b50534ddf8bb8453984765124cba9f0dbec8f30c7fedc853c2d25a6  tests/smoke.spec.js
a0dc4df50da26a3439018e287602140384a95a954b3d7e7727286fadef93ff8d  tests/session.spec.js
803f3463eb2f1c236f3e33d1d8be87fd0c2834958e152c575c4d16c31fd4b51d  src/sheets/DecideSessionSheet.tsx
```

（temp worktree 的 `src/sessionViews.js` 亦為 `83604b7f…`，確認 HEAD baseline 對齊；
兩次建立 worktree 都重驗過同一個值。）

最終：

```text
3173540d2a1b62cd2891b89ead51deecd6ddf76b88febdf5f1231a8561a653a5  src/sessionViews.js
21217c7d93069d66f5c0be6692155fb0ec2beab977993ad257261d3b1ebb76ca  src/sheets/SessionChatSheet.tsx
803f3463eb2f1c236f3e33d1d8be87fd0c2834958e152c575c4d16c31fd4b51d  src/sheets/DecideSessionSheet.tsx
36dda9c8f3f3feef40b3b8776d188e15aa595375118b2f978406a6d5f7b198cc  src/sheets.js
24839cc13adcb4ce59c90c77326576c6fed4c07d338fbf6d834b0d60c7934b9e  src/main.js
383ff7a5e039e3a17c6a9f71ef7561e4dfa069e695a6ba1daa1d24036fd4714a  src/sessionController.js
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
45eb6177856820790ac4b1772c29c4be6b6b331e00678830377f06f6257b84e8  src/session.css
3bef9149f70f295e28a01be40b8b1207e88b2913d58b53fb4690b1b1ddfa90a4  .claude/rules/react-migration.md
01c59603867f29990a3b46755919a08046adcbdf1f9ff6a27c2119a4c9498615  tests/smoke.spec.js
a0dc4df50da26a3439018e287602140384a95a954b3d7e7727286fadef93ff8d  tests/session.spec.js
```

`sheets.js`、`main.js`、`sessionController.js`、`domainTypes.ts`、`session.css`、
`.claude/rules/react-migration.md`、`tests/session.spec.js`、`src/sheets/DecideSessionSheet.tsx`
的 SHA 開工／完工完全相同。`tests/smoke.spec.js` 的變化只來自 rider 的純新增。

凍結檔 diff：

```text
$ git diff --name-only HEAD -- src/main.js src/sessionController.js src/sheets.js src/modalIsolation.js src/session.css src/style.css index.html src/domainTypes.ts src/profile.js src/taipeiTime.js src/sessionCriteria.js src/util.js .claude/rules/ src/sheets/DecideSessionSheet.tsx tests/session.spec.js tests/session-mobile.spec.js tests/performance.spec.js
[no output] (exit 0)
```

## 15. Bundle 前後對照

HEAD temp worktree 與工作樹用相同 `.env.local`／同版本 `node_modules` 各跑 `npm run build`；
所有數字本批重算（Vite 報表逐字抄錄，raw／gzip bytes 以 `node` ＋ `zlib.gzipSync` 實算）：

| | Batch 8.5 HEAD | Batch 8.6 | delta |
| --- | ---: | ---: | ---: |
| transformed modules | 113 | 114 | +1 |
| Vite main JS | 709.15 kB | 711.16 kB | +2.01 kB |
| Vite gzip | 200.40 kB | 200.75 kB | +0.35 kB |
| exact raw bytes | 709,146 | 711,157 | +2,011 |
| `zlib.gzipSync` bytes | 200,398 | 200,753 | +355 |

before：

```text
✓ 113 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-CEN-Llx8.js   709.15 kB │ gzip: 200.40 kB
✓ built in 859ms
```

after：

```text
✓ 114 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-C-_huqGW.js   711.16 kB │ gzip: 200.75 kB
✓ built in 893ms
```

新增一個 module（chat sheet content）；移除的 legacy markup 抵銷一部分 JSX，無異常膨脹
（本批 JSX 量是 sheet 批最大的一張，+2.0 kB raw 屬合理）。CSS、HTML、小 analytics chunk
位元組不變（hash 亦不變：`index-Ckdsfrjg.css`、`index-Zt4BwSlo.js`）。
既有 500 kB warning 類型與 before 相同。

## 16. 完整 gate 結尾輸出（逐字）

執行前已確認：無任何 dev server 在跑（`pgrep -fl vite | wc -l` = 0），local Supabase 已在跑
（`http://127.0.0.1:54321/rest/v1/` = 200），**未執行 DB reset**（八道 gate 一次全綠，
無 batch 8.4 §17.4 的 DB 累積症狀）。

### `npm test`（含 pretest）

```text
--check 通過:產出檔案與 data/courts.json 重生結果一致。
```

unit：

```text
# tests 246
# pass 246
# fail 0
# skipped 0
```

desktop ＋ mobile：

```text
  ✓  256 [mobile-chromium] › tests/smoke.spec.js:5430:1 › the filter sheet traps Tab focus between its own first and last controls (262ms)

  4 skipped
  252 passed (2.3m)
```

（252 = 批 8.5 的 250 ＋ rider 新測試 × 兩個 project。）

### `npm run test:local`

API：

```text
# tests 2
# pass 2
# fail 0
# skipped 0
```

Supabase Chromium：

```text
  11 skipped
  42 passed (1.5m)
```

### `npm run typecheck`

```text
> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit
```

### `npm run lint`

```text
> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{ts,tsx}" vite.config.ts
```

### `npm run prettier:check`

```text
> tennis-partner-finder@0.1.0 prettier:check
> prettier --check "src/**/*.{ts,tsx}" vite.config.ts

Checking formatting...
All matched files use Prettier code style!
```

### `npm run build`

```text
✓ 114 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-C-_huqGW.js   711.16 kB │ gzip: 200.75 kB
```

### `git diff --check`

```text
[no output] (exit 0)
```

另跑 `node scripts/generate-courts-seed.mjs --check`（gate 清單同項）：

```text
--check 通過:產出檔案與 data/courts.json 重生結果一致。
```

八道 gate 的 exit code 逐字：

```text
EXIT_npm_test=0
EXIT_test_local=0
EXIT_typecheck=0
EXIT_lint=0
EXIT_prettier=0
EXIT_build=0
EXIT_git_diff_check=0
EXIT_courts_check=0
```

§9.5 步驟 16 的還原後複驗（同一份最終檔案內容）：

```text
typecheck=0
lint=0
prettier=0
build=0
git_diff_check=0
  12 passed (5.3s)   ← chat/decide e2e，desktop＋mobile
```

## 17. `git diff --stat`／工作樹

tracked stat（報告落檔前）：

```text
 src/sessionViews.js | 166 ++++++++++++++++++++++++----------------------------
 tests/smoke.spec.js |  71 ++++++++++++++++++++++
 2 files changed, 146 insertions(+), 91 deletions(-)
```

`--numstat` 逐檔：

```text
75	91	src/sessionViews.js
71	0	tests/smoke.spec.js
```

Git 不把 untracked 納入 `git diff --stat`；另有（`wc -l` 實算）：

```text
?? src/sheets/SessionChatSheet.tsx  287 lines
?? docs/migration-reports/batch-8.6.md 本回報
```

行數變化（`wc -l` vs `git show HEAD:<path> | wc -l`）：

```text
src/sessionViews.js  3049 → 3033  (−16)
tests/smoke.spec.js  5380 → 5451  (+71)
```

`git status --porcelain` 逐字（報告落檔前）：

```text
 M src/sessionViews.js
 M tests/smoke.spec.js
?? src/sheets/SessionChatSheet.tsx
```

最終不 stage、不 commit、不 push。臨時 HEAD worktree 已 `git worktree remove --force` ＋
`git worktree prune` 清除（`git worktree list` 已無 `head86`），probe 用的兩個 Vite server 已停
（`pgrep -fl vite | wc -l` = 0）。

## 18. 偏離與發現

1. **presentation 回傳 raw 字串而非 `esc()` 後的字串（語意等價，但值不同）**。同批 8.5 §16.1、
   批 8.3 的既有裁決：HEAD 的 11 處 `esc()` 是因為它在組 HTML 字串；React 在 render 時自己
   escape，若 presentation 再 `esc()` 一次，帶 `&`、`<`、`"` 的訊息本體會**看得見**地變成
   `&amp;lt;img&amp;gt;`。因此兩個 presentation 回 `String(...)`。probe
   `escaped-injection-body-and-nickname` 逐屬性為證（文字為字面
   `<img src=x onerror="window.__chatXss=1">一起打球 & 喝水`，且 `imgCount` 兩樹皆 0）。
   `data-chat-report`／`data-chat-block`／`data-testid` 三個屬性也同理：HEAD 寫的是
   `esc(id)`，瀏覽器解析後 `dataset` 讀到的仍是原值，與 `String(id)` 相同。

2. **`chatRosterMarkup` 與 `chatMessagesMarkup` 退役（派工單已授權「presentation 資料化」，
   但未逐字列舉退役）**。兩者是 chat sheet 專用的 innerHTML 產生器，caller 歸零。判準
   （accepted 過濾、角色標籤、NTRP 後綴、kind 正規化、isSelf、canGovern、senderInitial、
   空狀態文案）逐字搬進兩個 presentation，仍住在 `sessionViews.js`，TSX 只消費結果。
   `acceptedChatRoster` **未**改寫、未搬家。反向 grep 見 §7。

3. **移除一個區域 querySelector（派工單未列舉）**。`roster`（`[data-chat-roster]`）在 React
   接管後 caller 歸零，屬 factory 內部區域變數、非公開 API，一併刪除。
   `feed`／`loading`／`error`／`input`／`send`／`archivedNote`／`announcement` 七個仍保留，
   因為 `setState`／`setArchived`／composer／`runAsyncAction` 還在用。

4. **composer submit 與 withdraw click 刻意保留 native `addEventListener`（未改成 React 事件 prop）**。
   HEAD 是 `mounted.root.querySelector("[data-chat-composer]")?.addEventListener("submit", …)` 與
   `[data-chat-withdraw]?.addEventListener("click", …)`。因為內容以 `flushSync` 同步掛載，這兩個
   `querySelector` 在 factory 內就找得到節點，且兩個節點的 DOM identity 全程穩定（§6.2／§6.3），
   所以 HEAD 的寫法可以**一個 token 不改**地保留——這比改成 `onSubmit`／`onClick` 更保守
   （不引入 native listener 與 React root 委派的觸發順序差異）。唯一改成 React 事件的是
   ① 返回鈕的 `onClick`（`mountSurface` 在空殼下綁不到 `[data-surface-close]`，別無選擇）與
   ② feed 的 `onClick`（委派層級與 HEAD 相同，見 §6.6）。

5. **probe 第一輪的 1392 條幾何差異全是開場動畫噪音，不是版面差異**。
   `.surface.session-chat-sheet` 帶 `animation: qmSlide 0.3s var(--ease-brand)`（`session.css:1056`），
   兩棵樹在動畫的不同進度取樣，量到的 `x` 相差約 170px 而 `width`／`height`／`display`／
   `font`／`margin`／`padding` 全同。加 600ms settle 後歸零。**建議後續批沿用**：凡是目標
   surface 帶 CSS 動畫／transition，幾何指紋取樣前必須等它結束，否則會得到大量假紅。

6. **`focus-in-feed-lost-on-refresh` 是本批唯一咬得住 generation key 的觀測面**（§6.1／§9.4）。
   捲動兩分支在穩定 key 下也會綠（因為還原邏輯是顯式賦值），既有 e2e 更是兩案皆綠——
   若沒有這個焦點案例，本批就會重蹈批 8.5「涵蓋宣稱經 read-back 證偽」的覆轍。
   建議驗收方特別覆核這一格。

7. **`setState` 的量測／還原三拍在 React 版其實已經「防禦性冗餘」，但本批刻意保留**。
   `nearBottom` 為真時走 `scrollFeedToLatest()`（顯式寫到底）、為假時走
   `feed.scrollTop = previousScrollTop`（顯式寫回），兩條分支都不依賴「重繪有沒有歸零
   scrollTop」。也就是說即使未來有人把 generation key 拿掉，捲動仍然正確。這是既有程式碼
   的穩健寫法，本批一個 token 未改；列在此只是說明「捲動」不能拿來當 key 決策的證據。

8. **`chatMessagesPresentation` 對 `undefined` 欄位的行為與 HEAD 逐字相同，但看起來像未被
   注意到的副作用**。`String(message.body)`／`String(message.createdAt)` 對 `undefined` 會產出
   字面 `"undefined"`，與 HEAD 的 `esc(undefined)` 完全一致（`esc` 內部就是
   `String(value).replace(...)`）。本批忠實保留，未加 fallback；若 PM 認為應該顯示空字串或
   「時間待確認」，請另開修復批。列此交 PM 判斷。

9. **probe 基礎設施兩個坑**：(a) 沿用批 8.3 §15.7／批 8.4 §16.8 的做法直接 spawn
   `<tree>/node_modules/.bin/vite`（不經 npx wrapper）才 kill 得乾淨；HEAD worktree 的
   `node_modules` 用 `cp -al` 硬連結後立刻 `rm -rf node_modules/.vite`。
   (b) 本機 Vite 只監聽 `localhost`（IPv6 `::1`），probe 若用 `http://127.0.0.1:<port>/`
   會一直連不上而誤判「server never became ready」——要用 `http://localhost:<port>/`。
   Google Maps／Fonts 兩個外部來源以 `context.route` stub 掉（理由同 `tests/fixtures/fakeMaps.js`
   的註解：gstatic 子集檔偶發 404 會污染 console-error 觀測）。
   跑 gate 前已確認 `pgrep -fl vite | wc -l` = 0。

10. **probe 需要「rAF settle」步驟，否則捲動案例會假綠**。`scrollFeedToLatest` 是
    「同步 ＋ rAF ＋ 巢狀 rAF」三拍；若在同一個 `page.evaluate` 內連續跑多個步驟，前一步
    排隊的 rAF 會在後面的步驟**之後**才生效，把要觀測的還原結果蓋掉。本批第一版的
    `scroll-restore-when-not-near-bottom` 就因此在兩樹都量到 `scrollTop: 1092`（貼底），
    看起來零差異、實際上根本沒走到還原分支。加入 `settle` 步驟（等兩幀）後才量到正確的
    `scrollTop: 0`。凡是被觀測面有 rAF 排程的批次都要注意這點。

## 驗收方註記（2026-08-19）

1. **偏離十條全數接受**：1–3 與批 8.3／8.5 既有裁決同型（raw 字串、零 caller helper 退役、
   死碼 querySelector 刪除）；4（composer submit 與 withdraw click 保留 native
   `addEventListener`）是比改 React 事件 prop 更保守的正確判斷；5（幾何指紋前等 CSS 動畫
   settle）與 10（rAF settle 防假綠）入 memory 為後續批標配；8（`String(undefined)` 字面
   `"undefined"`）維持既有行為列 PM 觀察項，不開批。
2. **獨立 canary（第五發，與 dev agent 四發皆不同角度）**：`data-chat-message-kind` 寫死
   `"user"` → smoke `chat sheet escapes user bodies…` 的 `[data-chat-message-kind="system"]`
   斷言紅（element not found）→ 還原後綠、`SessionChatSheet.tsx` SHA 逐字回復
   `21217c7d…`。
3. **Read-back 五 lens（凍結面逐屬性／imperative writer 可達性／token 級等價／rider 測試
   品質／接線與型別）全 PASS，零 blocker 零 concern**。Lens 2 以 fiber 層論證補強 §6.3 的
   「React 零 patch」宣稱：re-render 觸發路徑唯一（setContent），withdraw 鈕被 `.remove()`
   後 prop-identical update 無 Placement，不會被插回。Lens 3 自我糾正一次 sed 空對空假綠後
   重做，(a)–(f) 全數確認。Lens 4 確認 rider 測試兩個獨立斷言在穩定 key 下都會紅、
   兩輪 macrotask 排空不 flaky、既有行零修改。
4. **驗收方唯一修改**：`sessionViews.js` handleFeedClick 上方註解原稱 React onClick
   「掛在同一個 [data-chat-feed] 節點上」——機制描述不精確（React 18 事件委派掛在
   createRoot 容器），行為結論不受影響；比照批 8.4 Avatar 註解前例改寫為精確描述，
   並重跑完整七站 gate（第二輪，全綠後才 commit）。dev agent 報告中的 SHA
   `3173540d…`（sessionViews.js）因此僅對應註解修正前的版本，probe／canary 證據面
   （可執行 token）不受影響。
5. 兩輪七站 gate 全綠（第一輪對 dev agent 原版：mock 252 passed／local 42 passed；
   第二輪對含註解修正的最終版）。

> **批 12 後註（2026-08-20）**：本節記載的 `as unknown as` 雙重斷言寫法已全面移除。
> 實測顯示它會吞掉 `sessionViews.js` 的 runtime 匯出漂移（改名或改回傳形狀，`tsc` 都靜默通過）。
> 根因是 `sessionCardPresentation` 的 `courts = []` 被推成 `never[]`，已改以 JSDoc 標註修正，
> 10 處斷言全部可直接刪除。新程式碼請勿再沿用此寫法，詳見 `docs/migration-reports/batch-12.md`。
