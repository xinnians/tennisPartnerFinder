# 批 8.5：候選局定案 sheet 遷移 React 回報

日期：2026-08-19（Asia/Taipei）

Base HEAD：`8eaef84564e925d0f307d524631bceee19018a8d`

## 1. 結論

候選局定案 sheet 已在公開簽名、四個參數預設值、`mountSheet` 參數、`{ ...mounted, setCourts, setTerminal }`
handle 形狀與同步語意零變更下，把 `mountSheet` surface 內的內容遷移到 strict TSX：

```text
openDecideSessionSheet(session, { courts, courtsReady, onClose, onDecide })  → { ...mounted, setCourts, setTerminal }
```

`mountSheet` 仍唯一擁有 `#sheet-root`、backdrop、`section.surface`、focus trap、capture-phase Escape、
surface stack、dismiss、close、isolation 與 opener 焦點回復。React 只掛進 `mounted.surface` 的 child list。

**判準零搬移**：`isUndecidedCandidate`（`sessionCriteria.js`）、`taipeiDateTimeLocalValue` 與
`taipeiLocalDateTimeToIso`（`taipeiTime.js`）、`runAsyncAction`、時間範圍驗證、`setTerminal`、`decide`
全部留在 `sessionViews.js`／原模組，TSX 一條也沒複製——詳見 §5 的逐條清單。唯一新增的 presentation
是 `decideCourtOptionsPresentation`（候選過濾＋三態 status），它住在 `sessionViews.js`、經
`decideSessionSheetRuntime` 橋接，TSX 只消費結果。

`src/main.js`、`src/sessionController.js`、`src/sheets.js`、`src/taipeiTime.js`、`src/sessionCriteria.js`、
`src/domainTypes.ts`、CSS、HTML、`.claude/rules/**` 與 `tests/**` 全數零 diff
（`git diff --name-only HEAD -- …` 無輸出、exit 0，逐字見 §13）。
未 commit、未 stage、未 push；本批**未**執行 DB reset（七道 gate 一次全綠，無需依 batch-8.4 §17.4 判髒度）。

## 2. 殼／內容／handle 責任分界

factory 先同步建立原殼，`html` 改為空字串：

```js
const mounted = mountSheet({
  id: "session-decision-sheet",
  label: "定案場地與時間",
  onClose,
  html: "",
});
```

`id`、`label`、`onClose` 逐字不變；HEAD 本來就沒傳 `className`，本批也沒補（`mountSheet` 仍自行套
`surface--sheet`，probe 的 `section` class 屬性逐字一致）。

殼／內容邊界：

```text
#sheet-root                                        mountSheet 擁有
├─ .surface-backdrop[data-surface-dismiss]         mountSheet 擁有
└─ section#session-decision-sheet.surface          mountSheet 擁有
   ├─ .surface__head                               React 內容
   ├─ p.surface__copy                              React 內容
   ├─ div[data-decision-controls]                  React 內容（殼，之後由 adapter 直接改 hidden）
   │  ├─ label.form-field > input#session-decision-time   React 內容（uncontrolled）
   │  ├─ div.candidate-decision-buttons[data-decision-courts]  React 內容（唯一有 state 的區塊）
   │  ├─ p[data-decision-courts-status]            React 內容
   │  └─ p[data-decision-error]                    React 內容（之後由 adapter／runAsyncAction 改）
   └─ p[data-decision-terminal]                    React 內容（之後由 setTerminal 直接改）
```

`createRoot(mounted.surface)` 每個 mount element 只呼叫一次；初次 render 以 `flushSync` commit，
所以 factory 返回前 head／copy／時間欄位／球場按鈕／status／error／terminal 都已在 DOM。

`mountSurface` 建殼時 content 尚空，因此它當下綁不到 `[data-surface-close]`。React 端保留該
attribute，click handler 只呼叫 adapter 傳入的 `mounted.close()`；真正的 closed guard、stack remove、
Escape listener remove、isolation release、`onClose({ reason })` 與 focus restore 仍全在 `mountSheet` handle。

### 2.1 只有一塊 React state，其餘四個節點維持 imperative

這是本批與批 8.4 最大的差異，也是刻意的：`runAsyncAction` 與 `setTerminal` 是**既有的 DOM writer**，
把它們的目標節點交給 React 當 props 會產生「兩個 writer 搶同一個屬性」的新風險。因此：

| 節點 | React 給的 prop | 之後誰寫 | 為何 React 不會覆寫 |
| --- | --- | --- | --- |
| `div[data-decision-controls]` | `hidden={unavailable}` | `setTerminal` 設 `controls.hidden = true` | prop 值來自 mount options，永遠不變 → React 每次 re-render 比對相同 → 不 patch |
| `p[data-decision-error]` | `hidden`（常數 true）、無 children | `decide` 與 `runAsyncAction` 改 `hidden`／`textContent` | 同上；批 8.4 §4 已驗證過同一手法 |
| `p[data-decision-terminal]` | `hidden={!unavailable}`、children 為字面文案 | `setTerminal` 改 `textContent`／`hidden`／`focus()` | 同上 |
| `input#session-decision-time` | `defaultValue`／`min`／`max`／`step`（全常數） | 使用者自己輸入 | uncontrolled；prop 不變 → React 不 patch（§4.3） |
| `div[data-decision-courts]` 內的按鈕 | `key={generation:id}`、文字、`data-*` | `renderCourtButtons` 與 `runAsyncAction` 只改 `disabled` | React **不**把 `disabled` 當 prop（§4.2） |

handle 不擴張，只轉送原本就存在的方法：

```ts
export interface DecideSessionContentContract {
  setCourts(courts: DecideSessionCourt[], options?: { ready?: boolean }): void;
}
```

```js
return { ...mounted, setCourts, setTerminal };
```

adapter 的 `setCourts` 與 `setTerminal` 逐字保留 HEAD 的函式本體與預設值；content 端以 `flushSync`
包住 imperative 呼叫，方法返回時 DOM 已更新（`renderCourtButtons` 緊接著要 `buttons()` 取到新節點）。

### 2.2 時序凍結

HEAD 是「`mountSheet` 產出**空的**球場容器與**空的** status → 同步呼叫一次
`setCourts(availableCourts, { ready: courtOptionsReady })` → 返回 handle」。

React 版**照抄**這個時序：初次 render 的 court state 是
`{ options: [], statusText: "" }`（＝ HEAD 初始 innerHTML 的空容器＋空 `<p>`），factory 尾端仍然是同一行
`setCourts(availableCourts, { ready: courtOptionsReady })`，透過 `flushSync` 同步 commit。

**這個選擇不是風格問題**：`renderCourtButtons` 開頭有 `if (terminalState) return;`。unavailable
（含 `session === null`）時那次 `setCourts` 根本不會走到 content，若初始 state 改成「用 props 算
presentation」，status 會變成 `候選球場資料暫時無法載入，請稍後再試。`，而 HEAD 是空字串。
probe 案例 `unavailable-decided-candidate`／`unavailable-null-session` 逐屬性守住這一點。

## 3. `setCourts` 對映表

HEAD（`sessionViews.js` @ `8eaef84`，逐字）：

```js
const setCourts = (nextCourts, { ready = true } = {}) => {
  availableCourts = Array.isArray(nextCourts) ? nextCourts : [];
  courtOptionsReady = Boolean(ready);
  renderCourtButtons();
};
setCourts(availableCourts, { ready: courtOptionsReady });
```

```js
const renderCourtButtons = () => {
  if (terminalState) return;
  const candidateCourts = availableCourts.filter((court) => candidateIds.has(String(court.id)));
  courtButtons.innerHTML = candidateCourts.map((court) => `<button …>${esc(court.name)}</button>`).join("");
  buttons().forEach((button) => {
    button.disabled = deciding;
    button.addEventListener("click", decide);
  });
  courtsStatus.textContent = !courtOptionsReady ? "正在載入候選球場…"
    : candidateCourts.length === 0 ? "候選球場資料暫時無法載入，請稍後再試。" : "";
};
```

React state 只有兩份：`courtButtons`（`{ options, statusText }`）與 `generation`（int）。

| 舊 imperative 寫入 | React state／render | 凍結結果 |
| --- | --- | --- |
| `availableCourts = Array.isArray(nextCourts) ? nextCourts : []` | **留在 adapter，逐字不動** | 非陣列參數仍退化成空清單 |
| `courtOptionsReady = Boolean(ready)` | **留在 adapter，逐字不動** | content 端的 `{ ready = true } = {}` 只是防呆 |
| `renderCourtButtons()` 開頭 `if (terminalState) return;` | **留在 adapter**（terminalState 是 adapter closure） | 定案終局後 `setCourts` 仍只更新變數、不重繪（probe `set-courts-after-terminal-is-noop`） |
| `availableCourts.filter((court) => candidateIds.has(String(court.id)))` | `decideCourtOptionsPresentation` 內同一行 | 目錄比候選寬時仍只出候選局自己的球場 |
| `esc(court.id)` / `esc(court.name)` → innerHTML | presentation 回 `String(court.id)` / `String(court.name)`，React 於 render 時 escape | 見 §16 偏離 1；probe `escaped-injection-court-name` 逐屬性為證 |
| `courtButtons.innerHTML = …`（整段置換 → 舊按鈕 detach） | `key={`${generation}:${option.id}`}`，`setCourts` 每次 `generation + 1` | 見下方 generation key |
| `button.disabled = deciding` | **留在 adapter**：`content.setCourts(...)`（flushSync）之後 `buttons().forEach((b) => { b.disabled = deciding; })` | React 完全不碰 `disabled`，`runAsyncAction` 仍是另一個唯一 writer |
| `button.addEventListener("click", decide)` | React `onClick={onDecide}`，adapter 傳 `(event) => decide(event)` | `decide(event)` 簽名與 `event.currentTarget` 取用逐字不變 |
| `courtsStatus.textContent = 三態` | presentation 的 `statusText`，`{statusText}` 空字串不產生 text node | 逐字三態文案不變 |

### 3.1 generation key：重現「innerHTML 置換讓 `rerendered()` 為真」

若用 `court.id` 當穩定 key，倖存的按鈕節點**不會離開 DOM**。`runAsyncAction` 的

```js
const rerendered = () => watchedNodes.some((node) => !belongsToRoot(node));
```

會從 `true` 變 `false`，於是 finally 分支
`if (isCurrent && (!context.rerendered || restoreAfterRerender) && canRestoreControls(context))`
會從「不還原控制項、`onFinally` 也不呼叫、`deciding` 永遠停在 true」變成「還原並解鎖」——
這是使用者可觀察的行為差異（送出中的球局刷新目錄後，按鈕會不該地重新可按）。

折入 refresh 世代後，每次 `setCourts` 都重建全部按鈕節點，與 innerHTML 置換等價：

```tsx
<button key={`${generation}:${option.id}`} …>
```

容器 `[data-decision-courts]`、status `<p>`、error `<p>`、時間 `<input>`、controls `<div>`、terminal `<p>`
本身**不**帶 generation，節點 identity 穩定——這是 §2.1 四個 imperative 節點與 §4.3 uncontrolled
時間欄位能成立的前提。probe 案例 `decide-in-flight-then-set-courts` 逐屬性確認刷新後的新按鈕
`disabledProp` 仍為 `true`。

## 4. `setTerminal` 與 `decide` 狀態機對映表

### 4.1 `setTerminal`：零 React 參與

HEAD 與本批**逐字相同**（本批一個 token 都沒改）：

```js
const setTerminal = (message = "候選球局已逾期或下架，無法再定案。") => {
  terminalState = true;
  controls.hidden = true;
  terminal.textContent = message;
  terminal.hidden = false;
  terminal.focus({ preventScroll: true });
};
```

| HEAD 步驟 | 本批位置 | 凍結結果 |
| --- | --- | --- |
| 預設參數文案 | adapter（未動） | `sessionController.js:1955` 傳明確字串、`window.__stage4cDecisionSheet.setTerminal()` 走預設，兩路皆同 |
| `terminalState = true` | adapter closure | 之後 `decide` 立即 return、`renderCourtButtons` 早退、`canRestoreControls` 回 false |
| `controls.hidden = true` | adapter 直接改 React 產出的 `div` | React 的 `hidden={unavailable}` 為常數 prop，不會 patch 回去 |
| `terminal.textContent = message` | 同上 | React 的 children 為常數字面量，不會 patch 回去 |
| `terminal.hidden = false` | 同上 | 同上 |
| `terminal.focus({ preventScroll: true })` | 同上 | probe 的 `activeElement` 欄位在四個 terminal 案例都是 `p[data-decision-terminal]`，兩樹一致 |

**沒有在 handle 之外新增任何 terminal 相關 API**；`setTerminal` 之後球場按鈕仍留在（已隱藏的）
controls 裡，`buttons()` 依然找得到它們——這是 `canRestoreControls: () => !terminalState` 有意義的
前提，probe `decide-then-terminal-keeps-buttons-disabled` 守住它。

### 4.2 `decide`：零搬移

`decide` 函式本體本批**一個 token 都沒改**，只有註冊方式從 `addEventListener("click", decide)` 變成
React 的 `onClick`。`const button = event.currentTarget;` 在第一個 `await` 之前同步執行，取到的是真正的
DOM 節點，之後 React 把 SyntheticEvent 的 `currentTarget` 清空也不影響已捕獲的參照。

| HEAD 步驟 | 本批位置 | 凍結結果 |
| --- | --- | --- |
| `const button = event.currentTarget` | adapter（未動） | probe `decideCalls` 兩樹皆 `[[105,"2099-08-08T01:00:00.000Z"]]` |
| `if (deciding \|\| terminalState) return;` | adapter（未動） | 送出中重複點擊、終局後點擊仍被擋 |
| `taipeiLocalDateTimeToIso(timeInput?.value)` | adapter（未動），`timeInput` 是 React 產出的節點 | 讀 DOM 的那一行沒搬、沒複製 |
| `!startAt \|\| startMs < rangeStartMs \|\| startMs > rangeEndMs` | adapter（未動） | probe `decide-error-time-out-of-range`／`decide-error-time-cleared` |
| `error.textContent = "定案時間必須落在原本的時間範圍內。"; error.hidden = false; return;` | adapter（未動） | 驗證失敗不進 pending、不呼叫 `onDecide`（probe `decideCalls` 為 `[]`） |
| `deciding = true` ＋ `runAsyncAction({ root: mounted.root, … })` | adapter（未動） | `root` 仍是 `#sheet-root`（不是 surface），與批 8.3 §15.4 同理 |
| `controls: buttons()` / `resolveControls: buttons` | adapter（未動） | live query，React 產出的按鈕照樣被解析到 |
| `onError`（`if (terminalState) return;` ＋ 訊息 fallback `"定案失敗，請稍後再試。"`） | adapter（未動） | probe `decide-error-from-on-decide` |
| `canRestoreControls: () => !terminalState` | adapter（未動） | probe `decide-then-terminal-keeps-buttons-disabled`：resolve 後按鈕仍 disabled |
| `onFinally: ({ controlsRestored }) => { if (controlsRestored) deciding = false; }` | adapter（未動） | 只有真的解鎖控制項才放行下一次定案 |

### 4.3 時間欄位：uncontrolled，且刷新不丟已調整的值（派工單要求論證）

HEAD 的 `renderCourtButtons` **只**碰 `courtButtons.innerHTML` 與 `courtsStatus.textContent`；
`timeInput` 節點從建立到關閉都不曾被替換或重新賦值。所以 HEAD 的語意是：

> 主揪把時間從範圍起點改成別的值之後，任何 `setCourts`（球場目錄稍後才載入、controller 的
> `setCourts` 廣播）都不得把它改回去。

本批以三件事保住它：

1. `<input>` 只吃 `defaultValue`／`min`／`max`／`step` 四個**常數** prop，沒有 `value`／`onChange`。
   React 對 uncontrolled input 的 `defaultValue` 只在 mount 時寫 attribute；之後 prop 沒變，
   `updateProperties` 不產生任何 patch。
2. `<input>` 不在任何帶 `generation` 的 key 之下，節點 identity 跨 re-render 穩定（§3.1）。
3. React 的 state 更新只發生在 `[data-decision-courts]` 的 children 與 status 的 text——
   兩者都是 `<input>` 的**兄弟**，reconciliation 不觸及它。

probe 案例 `time-adjusted-then-set-courts-keeps-value`：先在 `courtsReady: false` 時把時間填成
`2099-08-08T10:30`，再 `setCourts(COURTS, { ready: true })`，兩樹的
`value` attribute（`2099-08-08T09:00:00.000`，＝ mount 時的範圍起點）與 `valueProp`
（`2099-08-08T10:30`，＝使用者改過的 live 值）逐字相同，`activeElement` 也同樣停在該 input。

## 5. 判準單一來源清單（TSX 零複製）

| 判準 | 位置（working tree） | TSX 有沒有複製 |
| --- | --- | --- |
| `isUndecidedCandidate(session)` | `src/sessionCriteria.js:15`（本批零修改） | 否；adapter 算出 `unavailable` 布林後才當 prop |
| `taipeiDateTimeLocalValue(v, { includeMilliseconds: true })` | `src/taipeiTime.js:92`（本批零修改） | 否；adapter 算好 `startAtLocal`／`rangeEndLocal` 字串傳入 |
| `taipeiLocalDateTimeToIso` | `src/taipeiTime.js`（本批零修改） | 否；只在 adapter 的 `decide` 呼叫 |
| 時間範圍驗證（`startMs < rangeStartMs \|\| startMs > rangeEndMs`） | `src/sessionViews.js:2709` | 否 |
| `runAsyncAction` 的 disable／rerender／restore | `src/sessionViews.js:738` | 否 |
| `setTerminal` 五步 | `src/sessionViews.js:2695` | 否 |
| `candidateIds` 建構（`new Set((session?.candidateCourtIds ?? []).map(String))`） | `src/sessionViews.js:2670` | 否；TSX 只收 `Set<string>` prop |
| 候選過濾 ＋ 三態 status | `src/sessionViews.js:2642` `decideCourtOptionsPresentation` | 否；TSX 經 `decideSessionSheetRuntime` 呼叫 |
| `esc` | `src/util.js`（本批零修改） | 否；React 自己 escape（§16 偏離 1） |

TSX 內唯一的「文字判斷」是零個——head、copy、terminal 三段文案都是 HEAD 模板字串裡逐字搬過來的
常數，沒有任何三元式。

## 6. 新增 frozen runtime

```js
/** Candidate court filtering and status rules shared with the React decision sheet. */
export const decideSessionSheetRuntime = Object.freeze({
  decideCourtOptionsPresentation,
});
```

`DecideSessionSheet.tsx` 沿用批 8.3／8.4 已驗證的 lazy runtime resolve
（`function runtime() { return decideSessionSheetRuntime as unknown as DecideSessionRuntime; }`），
避免 `sessionViews.js` eager glob → TSX → `sessionViews.js` 這條 circular edge 在初始化期 TDZ。

本批**沒有**任何 helper 因 caller 歸零而退役：`esc`、`taipeiCourts`、`runAsyncAction` 等都還有其他
caller；`renderCourtButtons` 是 factory 內的區域函式，仍存在（只是內容改成呼叫 content）。
反向 grep（executable caller，非註解）：

```text
$ grep -rn "renderCourtButtons" src tests scripts supabase
src/sessionViews.js:2638: * the status is the same three-state line the imperative `renderCourtButtons()`
src/sessionViews.js:2732:  const renderCourtButtons = () => {
src/sessionViews.js:2745:    renderCourtButtons();
src/sheets/DecideSessionSheet.tsx:71:  // call never happens because renderCourtButtons returns early — showing the
exit=0
```

## 7. HEAD／current DOM 逐屬性 probe

以 `HEAD=8eaef84564e925d0f307d524631bceee19018a8d` 建獨立 temp worktree（`cp -al` 硬連結
`node_modules` 後刪掉其 `.vite`、相同 `.env.local`），HEAD 與工作樹**依序**各啟一個 Vite
（5281／5282，不並行；直接 spawn `<tree>/node_modules/.bin/vite`，不經 npx wrapper），
probe 對 `#sheet-root` 每個 element 比較：

- `tag`
- 排序後完整 `attrs`
- **非純空白 text node 的逐字切分**（`meaningfulTextNodes`，批 8.3 的 serializer）
- 只串接非空白 descendant text node 的 `text`（批 8.4 §7.1 的修正定義，本批直接沿用，未再出現假紅）
- 非空白 child 交錯順序 `childOrder` 與 children 陣列長度
- DOM **property**：`hiddenProp`、`disabledProp`、`checkedProp`、`defaultCheckedProp`、
  `valueProp`、`defaultValueProp`、`<img>` 的 `src`
- `document.activeElement` 指紋（tag／id／testid／屬性名集合）
- 注入的 `onDecide` 實際收到的 `[courtId, startAt]`（`decideCalls`）
- **幾何指紋**（本批新增，見 §7.2）：每個 element 的 `getBoundingClientRect` 與
  `display`／`font`／`margin`／`padding`／`visibility`，desktop 1280×900 與 mobile 390×844 各一份

`session === null` 分支會走到 `taipeiDateTimeLocalValue(undefined)` → 內部 `new Date()`，兩樹的
牆鐘時間不同會製造假差異，因此 probe 在開 sheet 前把 `window.Date` 換成固定時點的子類、開完立刻還原。

fixture 刻意帶 `<img id="x-inject">&"'` 注入字串當球場名，同時驗 escape。19 個案例：

```json
{
  "cases": [
    "ready-two-candidates",
    "ready-three-candidates",
    "courts-loading",
    "courts-ready-none-resolvable",
    "courts-loading-then-ready-hydrate",
    "escaped-injection-court-name",
    "unavailable-decided-candidate",
    "unavailable-null-session",
    "unavailable-null-session-set-courts-noop",
    "decide-error-time-out-of-range",
    "decide-error-time-cleared",
    "decide-error-from-on-decide",
    "decide-in-flight-buttons-disabled",
    "decide-in-flight-then-set-courts",
    "time-adjusted-then-set-courts-keeps-value",
    "after-set-terminal-default-message",
    "after-set-terminal-custom-message",
    "set-courts-after-terminal-is-noop",
    "decide-then-terminal-keeps-buttons-disabled"
  ],
  "matched": 19,
  "headConsoleErrors": [],
  "currentConsoleErrors": [],
  "headPageErrors": [],
  "currentPageErrors": [],
  "mismatchCount": 0,
  "nonTextMismatchCount": 0,
  "mismatches": [],
  "whitespaceOnlyTextNodes": {
    "headBlankTextNodes": 285,
    "currentBlankTextNodes": 38,
    "nodesWithBlankDelta": 57
  },
  "blankDeltaSignatures": [
    "section.surface.surface--sheet#session-decision-sheet head=5 current=0",
    "div.surface__head head=3 current=0",
    "div head=5 current=0"
  ]
}
```

掃描集非空（實算，非手數）：19 個案例、每個案例 desktop／mobile 各 350 條幾何列合計
（`geometry rows desktop total 350 mobile total 350 cases 19`），單案例 17–19 個 element。

派工單要求的涵蓋逐項對照：

| 派工單要求 | 案例 |
| --- | --- |
| 可定案態（候選球場 2–3 座） | `ready-two-candidates`（2 座）、`ready-three-candidates`（3 座，且目錄含一座非候選的台北球場與一座新北球場，驗過濾） |
| unavailable 態 | `unavailable-decided-candidate`（`decidedAt` 已填）、`unavailable-null-session`（controller 的 `decisionSummary = null` 真實路徑）、`unavailable-null-session-set-courts-noop` |
| courts loading／ready | `courts-loading`、`courts-ready-none-resolvable`、`courts-loading-then-ready-hydrate` |
| decide 錯誤態 | `decide-error-time-out-of-range`（超過 `rangeEnd`）、`decide-error-time-cleared`（`taipeiLocalDateTimeToIso` 回 null）、`decide-error-from-on-decide`（`onDecide` throw → `runAsyncAction` 的 `onError`） |
| setTerminal 後 | `after-set-terminal-default-message`（走預設參數）、`after-set-terminal-custom-message`（走 controller 那條明確字串）、`set-courts-after-terminal-is-noop`、`decide-then-terminal-keeps-buttons-disabled` |
| 時間已調整後 setCourts 的 value 保留 | `time-adjusted-then-set-courts-keeps-value`（§4.3） |
| （加碼）送出中的 disabled 權威狀態 | `decide-in-flight-buttons-disabled`、`decide-in-flight-then-set-courts` |
| （加碼）escape 注入 | `escaped-injection-court-name` |

幾個關鍵觀測值兩樹逐字相同（從 probe JSON 直接抄錄，非手寫）：

```text
ready-two-candidates
  buttons  [["105","decide-court-105","百齡河濱公園網球場",false],["109","decide-court-109","美堤河濱公園網球場",false]]
  time     ["2099-08-08T09:00:00.000","2099-08-08T09:00:00.000","2099-08-08T12:00:00.000","0.001","2099-08-08T09:00"]
escaped-injection-court-name
  buttons  [["105","decide-court-105","<img id=\"x-inject\">&\"'球場",false],["109","decide-court-109","美堤河濱公園網球場",false]]
unavailable-null-session
  controlsHidden true / terminal ["候選球局已逾期或下架，無法再定案。",false] / status ["",false]
decide-error-time-out-of-range
  error    ["定案時間必須落在原本的時間範圍內。",false,null]  calls []
decide-error-from-on-decide
  error    ["定案失敗（探針注入）。",false,null]  calls [[105,"2099-08-08T01:00:00.000Z"]]
decide-in-flight-then-set-courts
  buttons  [["105",…,true],["109",…,true]]   ← 刷新後的新節點仍 disabled
time-adjusted-then-set-courts-keeps-value
  time     [… value="2099-08-08T09:00:00.000" … valueProp="2099-08-08T10:30"]
after-set-terminal-custom-message
  terminal ["這個候選球局已被取消。",false]  activeElement p[data-decision-terminal]
set-courts-after-terminal-is-noop
  status   ["正在載入候選球場…",false]        ← setCourts 被 terminal 早退擋住
decide-then-terminal-keeps-buttons-disabled
  buttons  [["105",…,true],["109",…,true]]   ← resolve 後仍不還原
```

### 7.1 serializer 沿用批 8.4 的定義，未再出現假紅

批 8.4 §16.6 建議「`text` 只串接非空白 descendant text node」。本批直接以該定義起跑，
第一輪就 `mismatchCount: 0`、`nonTextMismatchCount: 0`——沒有再出現縮排空白造成的 100 條假差異。

### 7.2 唯一剩餘差異：純空白 text node（本批以幾何指紋實證，不只 CSS 論證）

HEAD 用 `innerHTML` 字串模板，換行與縮排留下 285 個純空白 text node；React 產出 38 個
（全部來自 `mountSurface` 自己的殼與 `#sheet-root` 本體）。有 delta 的容器只有三種簽名（實算）：

```text
section.surface.surface--sheet#session-decision-sheet  head=5 current=0
div.surface__head                                     head=3 current=0
div（＝[data-decision-controls]，無 class）            head=5 current=0
```

CSS 論證：

- `src/session.css:345` `.surface__head { display: flex; }` — flex 規範明定純空白子字串不產生 flex item。
- `.surface`（`src/session.css:430`）未宣告 `display`，＝ `block`；其全部子節點都是 block-level box：
  `div.surface__head`（flex）、`p.surface__copy`、`div[data-decision-controls]`（block）、
  `p.surface__message`。block-level box 之間只含可摺疊空白的匿名 inline box 不產生 render box。
- `div[data-decision-controls]` 無 CSS 規則，＝ `block`；子節點為
  `label.form-field`（`src/session.css:454` `display: grid`）、
  `div.candidate-decision-buttons`（`:452` `display: flex`）、`p.form-hint`、`p.form-error`，
  同樣全是 block-level box。

**實證**（本批新增，比 CSS 論證更強）：19 個案例 × 2 個 viewport（1280×900 與 390×844）×
每案例 17–19 個 element 的 `getBoundingClientRect` 與 `display`／`font`／`margin`／`padding`／
`visibility` 全部逐值比對，`mismatchCount: 0`。若那些空白 text node 真的產生 render box，
同層 flex／inline 佈局會位移下游元素——幾何零差異即證明不可觀察。

## 8. React 接管 canary：兩發，各自紅 → 綠

canary 前 SHA（與 §13 最終 SHA **完全相同**——canary 之後未再編輯任何 `src/` 檔，
時序見 §8.3；此為批 8.4 §17.1 裁決留下的紀律）：

```text
83604b7fcc87f8ea2ede4efc6d962bfec06d1d51632eb3cadcf377456c7b0cd6  src/sessionViews.js
803f3463eb2f1c236f3e33d1d8be87fd0c2834958e152c575c4d16c31fd4b51d  src/sheets/DecideSessionSheet.tsx
```

### Canary A：decision sheet 的 React 內容確實在驅動 status／按鈕（mock）

在 `mountDecideSessionSheetContent` 的 `flushSync(render(<…/>))` 之後多插一行
`flushSync(() => reactRoot.render(null))`（並讓 contract 的 `setCourts` 退化成 no-op）：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep "decision sheet waits for the court catalogue and renders candidate buttons after refill"
```

紅燈逐字（`grep -E '✘|✓|Error:|Locator:|Expected|Received|failed|passed'`）：

```text
  ✘  1 [desktop-chromium] › tests/smoke.spec.js:353:1 › decision sheet waits for the court catalogue and renders candidate buttons after refill (5.5s)
    Error: expect(locator).toHaveText(expected) failed
    Locator: locator('#session-decision-sheet').locator('[data-decision-courts-status]')
    Expected: "正在載入候選球場…"
    Error: element(s) not found
  1 failed
```

逐字還原後同命令：

```text
  ✓  1 [desktop-chromium] › tests/smoke.spec.js:353:1 › decision sheet waits for the court catalogue and renders candidate buttons after refill (232ms)
  1 passed (1.1s)
```

### Canary B：點擊確實接到 legacy `decide`（local Supabase 真實旅程）

Canary A 只證明「內容有被 React 畫出來」，那個 smoke 測試從頭到尾**沒有點過任何球場按鈕**。
決定路徑（`onClick` → `decide` → `runAsyncAction` → `decide_session_court`）要另外一發，
注入點刻意選在 TSX 按鈕的 `onClick={onDecide}`（刪除該 prop）：

```bash
TENNIS_TEST_HARNESS_MODE=local npx playwright test tests/session.spec.js \
  --project=supabase-chromium \
  --grep "a host decides a candidate session into one solid pin"
```

紅燈逐字：

```text
  ✘  1 [supabase-chromium] › tests/session.spec.js:606:1 › a host decides a candidate session into one solid pin and the database records decided_at (8.6s)
    Error: expect(locator).toBeHidden() failed
    Locator:  locator('#session-decision-sheet')
    Expected: hidden
    Received: visible
  1 failed
```

逐字還原後同命令：

```text
  ✓  1 [supabase-chromium] › tests/session.spec.js:606:1 › a host decides a candidate session into one solid pin and the database records decided_at (3.6s)
  1 passed (6.2s)
```

兩發還原後 `shasum -a 256 -c` 逐字（各自跑一次，輸出相同）：

```text
src/sessionViews.js: OK
src/sheets/DecideSessionSheet.tsx: OK
```

### 8.3 時序（批 8.4 §17.1 教訓）

```text
1. 實作 sessionViews.js ＋ DecideSessionSheet.tsx（最後一次 src 編輯）
2. typecheck / lint / prettier 綠
3. DOM probe（HEAD 5281、current 5282，依序）→ mismatch 0
4. 加幾何指紋後兩樹重跑 → mismatch 0
5. 記錄 canary 前 SHA（83604b7f… / 803f3463…）
6. Canary A 紅 → 還原 → shasum -c OK → 綠
7. Canary B 紅 → 還原 → shasum -c OK → 綠
8. repeat-each=3 ×2、bundle 對照、七道 gate
9. 最終 SHA = 步驟 5 的 SHA（§13）
```

步驟 3–9 全部針對同一份檔案內容（`83604b7f…` / `803f3463…`）取證；canary 之後零 `src/` 編輯。

## 9. decide 相關 e2e `--repeat-each=3`

mock（desktop ＋ mobile 兩跑道）：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium --project=mobile-chromium \
  --grep "decision sheet waits for the court catalogue|an undecided candidate session renders two dashed map pins|undecided candidate sessions keep their court list" \
  --repeat-each=3
```

逐字結尾：

```text
  ✓  16 [mobile-chromium] › tests/smoke.spec.js:319:1 › an undecided candidate session renders two dashed map pins from the court catalogue (194ms)
  ✓  17 [mobile-chromium] › tests/smoke.spec.js:353:1 › decision sheet waits for the court catalogue and renders candidate buttons after refill (209ms)
  ✓  18 [mobile-chromium] › tests/smoke.spec.js:1756:1 › undecided candidate sessions keep their court list and time range across private surfaces (279ms)

  18 passed (7.0s)
```

local Supabase（真實 `decide_session_court` 旅程）：

```bash
TENNIS_TEST_HARNESS_MODE=local npx playwright test tests/session.spec.js \
  --project=supabase-chromium \
  --grep "a host decides a candidate session into one solid pin" --repeat-each=3
```

```text
  ✓  1 [supabase-chromium] › tests/session.spec.js:606:1 › a host decides a candidate session into one solid pin and the database records decided_at (3.4s)
  ✓  2 [supabase-chromium] › tests/session.spec.js:606:1 › a host decides a candidate session into one solid pin and the database records decided_at (3.4s)
  ✓  3 [supabase-chromium] › tests/session.spec.js:606:1 › a host decides a candidate session into one solid pin and the database records decided_at (3.5s)

  3 passed (17.0s)
```

## 10. Full-repo consumer sweep

```text
$ grep -rn "openDecideSessionSheet|decideSessionSheetRuntime|decideCourtOptionsPresentation|mountDecideSessionSheetContent|DecideSessionSheet" src tests scripts supabase index.html
```

### Production 呼叫點（本批零修改）

```text
src/main.js:75            import openDecideSessionSheet
src/main.js:1505          openDecideSession: openDecideSessionSheet
src/sessionController.js:1938  sheet = openDecideSession(decisionSummary, { courts, courtsReady, onClose, onDecide })
src/sessionController.js:1955  sheet?.setTerminal?.("候選球局已逾期或下架，無法再定案。")
src/sessionController.js:1073  surfaceRegistry.get("decisionSession")?.setCourts?.(state.courts, { ready: state.courtsReady })
```

`git diff --name-only HEAD -- src/main.js src/sessionController.js` 無輸出。
`sessionController.js:1937` 的 `decisionSummary` 可能是 **null**（`isUndecidedCandidate(summary)` 為 false 時），
本批以 probe 案例 `unavailable-null-session`／`unavailable-null-session-set-courts-noop` 覆蓋這條真實路徑。

### 新內部 mount／runtime consumers

```text
src/sessionViews.js:69-72     browser-only eager glob ＋ mount symbol
src/sessionViews.js:2642      decideCourtOptionsPresentation
src/sessionViews.js:2660-2662 decideSessionSheetRuntime export
src/sessionViews.js:2669      mount 可用性 guard
src/sessionViews.js:2678      content mount call
src/sessionViews.js:2737      renderCourtButtons 內的 content.setCourts
src/sheets/DecideSessionSheet.tsx:6,55,88,158,164  runtime import／lazy resolve／runtime 呼叫／mount export
```

### 既有 direct test consumers（零修改）

```text
tests/smoke.spec.js:357-358   import ＋ direct openDecideSessionSheet，handle 存進 window.__stage4cDecisionSheet
tests/smoke.spec.js:371-383   #session-decision-sheet / [data-decision-terminal] / [data-decision-courts-status] / [data-decide-court]
tests/smoke.spec.js:378       window.__stage4cDecisionSheet.setCourts(COURTS, { ready: true })
tests/session.spec.js:655-674 [data-my-action="decide"] → #session-decision-sheet → session-decision-time → decide-court-<id> → DB decided_at
tests/session-controller.test.js:247,313  fake decision sheet（記錄 setTerminal 訊息），不觸及本批實作
```

`tests/smoke.spec.js`、`tests/session.spec.js` 的 SHA 開工／完工相同（§13）。

### `scripts/**`、`supabase/**`、`index.html`

以上 grep 在這三處零命中（輸出中無任何 `scripts/`、`supabase/`、`index.html` 行）。

## 11. 變更清單

- `src/sheets/DecideSessionSheet.tsx`（新增，172 lines）：sheet 內容、uncontrolled 時間欄位、
  候選按鈕 generation key、單一 imperative content contract（`setCourts`）。
- `src/sessionViews.js`（修改，+47 / −34）：eager glob ＋ mount symbol、
  `decideCourtOptionsPresentation`、`decideSessionSheetRuntime`、`openDecideSessionSheet` 的
  mount adapter；移除該 sheet 的整段 HTML 字串與兩個只服務它的 querySelector
  （`courtButtons`／`courtsStatus`）。`setTerminal`、`decide`、`setCourts` 三個函式本體一個 token 未改。
- `docs/migration-reports/batch-8.5.md`：本回報。

刻意未改：`main.js`、`sessionController.js`、`sheets.js`、`modalIsolation.js`、`profile.js`、
`taipeiTime.js`、`sessionCriteria.js`、`util.js`、`map.js`、`pins.js`、`domainTypes.ts`、HTML、CSS、
`.claude/rules/**`、`tests/**`、`docs/frontend-migration-plan-2026-08-18.md`。

## 12. Bundle 前後對照

HEAD temp worktree 與工作樹用相同 `.env.local`／同版本 `node_modules` 各跑 `npm run build`；
所有數字本批重算（Vite 報表逐字抄錄，raw／gzip bytes 以 `node` ＋ `zlib.gzipSync` 實算）：

| | Batch 8.4 HEAD | Batch 8.5 | delta |
| --- | ---: | ---: | ---: |
| transformed modules | 112 | 113 | +1 |
| Vite main JS | 707.67 kB | 709.15 kB | +1.48 kB |
| Vite gzip | 200.12 kB | 200.40 kB | +0.28 kB |
| exact raw bytes | 707,668 | 709,146 | +1,478 |
| `zlib.gzipSync` bytes | 200,118 | 200,398 | +280 |

before：

```text
✓ 112 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-CxqCkw3e.js   707.67 kB │ gzip: 200.12 kB
✓ built in 955ms
```

after：

```text
✓ 113 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-CEN-Llx8.js   709.15 kB │ gzip: 200.40 kB
✓ built in 916ms
```

新增一個 module（decision sheet content）；移除的 legacy markup 抵銷一部分 JSX，無異常膨脹。
CSS、HTML、小 analytics chunk 位元組不變（hash 亦不變：`index-Ckdsfrjg.css`、`index-Zt4BwSlo.js`）。
既有 500 kB warning 類型與 before 相同。

## 13. SHA-256 對照

Batch 開始（＝HEAD `8eaef84` 的工作樹狀態，`git status` 乾淨）：

```text
ca82134dbcbec65be11455f4b5cb6bdf7f2cefc3ab7eb21229a3488697a4dd26  src/sessionViews.js
36dda9c8f3f3feef40b3b8776d188e15aa595375118b2f978406a6d5f7b198cc  src/sheets.js
24839cc13adcb4ce59c90c77326576c6fed4c07d338fbf6d834b0d60c7934b9e  src/main.js
383ff7a5e039e3a17c6a9f71ef7561e4dfa069e695a6ba1daa1d24036fd4714a  src/sessionController.js
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
2630eee54c57dc8cf385e60b83e3e3be9f1b3fabab15eec1a9cda8d8b96c423f  src/taipeiTime.js
8dd3b925c035465780a6400dc7a85272c52e6e0e01be5502bcf6f92e963fc71b  src/sessionCriteria.js
3bef9149f70f295e28a01be40b8b1207e88b2913d58b53fb4690b1b1ddfa90a4  .claude/rules/react-migration.md
66e08bc22b50534ddf8bb8453984765124cba9f0dbec8f30c7fedc853c2d25a6  tests/smoke.spec.js
a0dc4df50da26a3439018e287602140384a95a954b3d7e7727286fadef93ff8d  tests/session.spec.js
```

（temp worktree 的 `src/sessionViews.js` 亦為 `ca82134d…`，確認 HEAD baseline 對齊。）

最終：

```text
83604b7fcc87f8ea2ede4efc6d962bfec06d1d51632eb3cadcf377456c7b0cd6  src/sessionViews.js
803f3463eb2f1c236f3e33d1d8be87fd0c2834958e152c575c4d16c31fd4b51d  src/sheets/DecideSessionSheet.tsx
36dda9c8f3f3feef40b3b8776d188e15aa595375118b2f978406a6d5f7b198cc  src/sheets.js
24839cc13adcb4ce59c90c77326576c6fed4c07d338fbf6d834b0d60c7934b9e  src/main.js
383ff7a5e039e3a17c6a9f71ef7561e4dfa069e695a6ba1daa1d24036fd4714a  src/sessionController.js
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
2630eee54c57dc8cf385e60b83e3e3be9f1b3fabab15eec1a9cda8d8b96c423f  src/taipeiTime.js
8dd3b925c035465780a6400dc7a85272c52e6e0e01be5502bcf6f92e963fc71b  src/sessionCriteria.js
3bef9149f70f295e28a01be40b8b1207e88b2913d58b53fb4690b1b1ddfa90a4  .claude/rules/react-migration.md
66e08bc22b50534ddf8bb8453984765124cba9f0dbec8f30c7fedc853c2d25a6  tests/smoke.spec.js
a0dc4df50da26a3439018e287602140384a95a954b3d7e7727286fadef93ff8d  tests/session.spec.js
```

`sheets.js`、`main.js`、`sessionController.js`、`domainTypes.ts`、`taipeiTime.js`、`sessionCriteria.js`、
`.claude/rules/react-migration.md`、`tests/smoke.spec.js`、`tests/session.spec.js` 的 SHA
開工／完工完全相同。

凍結檔 diff：

```text
$ git diff --name-only HEAD -- src/main.js src/sessionController.js src/sheets.js src/modalIsolation.js src/session.css src/style.css index.html tests/ src/domainTypes.ts src/profile.js src/taipeiTime.js src/sessionCriteria.js .claude/rules/
[no output] (exit 0)
```

## 14. 完整 gate 結尾輸出（逐字）

執行前已確認：無任何 dev server 在跑（`pgrep -fl vite | wc -l` = 0），local Supabase 已在跑
（`http://127.0.0.1:54321/rest/v1/` = 200），**未執行 DB reset**。

### `npm test`（含 pretest）

```text
> tennis-partner-finder@0.1.0 pretest
> node scripts/generate-courts-seed.mjs --check

--check 通過:產出檔案與 data/courts.json 重生結果一致。
```

unit：

```text
1..246
# tests 246
# suites 0
# pass 246
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1828.813833
```

desktop ＋ mobile：

```text
  ✓  250 [mobile-chromium] › tests/smoke.spec.js:5183:1 › openFilterSheet mounts a dialog with six data-filter groups and closes on Escape (177ms)
  ✓  251 [mobile-chromium] › tests/smoke.spec.js:5220:1 › the filter sheet applies a district change immediately to the background drawer summary and keeps keyboard focus off body (186ms)
  ✓  252 [mobile-chromium] › tests/smoke.spec.js:5286:1 › closing and reopening the filter sheet three times does not stack delegated listeners on the shared sheet root (514ms)
  ✓  253 [mobile-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.4s)
  ✓  254 [mobile-chromium] › tests/smoke.spec.js:5359:1 › the filter sheet traps Tab focus between its own first and last controls (230ms)

  4 skipped
  250 passed (2.3m)
```

### `npm run test:local`

API：

```text
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4245.572625
```

Supabase Chromium：

```text
  ✓  49 [supabase-chromium] › tests/session.spec.js:2036:1 › neutral counts stay hidden at zero and appear on all three surfaces once a session is played (3.1s)
  ✓  50 [supabase-chromium] › tests/session.spec.js:2156:1 › a brand-new account is subscribed to every active Taipei court when it first saves a profile (728ms)
  ✓  51 [supabase-chromium] › tests/session.spec.js:2180:1 › N1 an existing zero-subscription account is never seeded by a later profile save (658ms)
  ✓  52 [supabase-chromium] › tests/session.spec.js:2199:1 › N2 an account that explicitly cleared every court stays at zero across later profile saves (927ms)
  ✓  53 [supabase-chromium] › tests/session.spec.js:2226:1 › N3 a failing subscription seed never fails the profile save (642ms)

  11 skipped
  42 passed (1.4m)
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
> tennis-partner-finder@0.1.0 build
> vite build

vite v6.4.3 building for production...
transforming...
✓ 113 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-CEN-Llx8.js   709.15 kB │ gzip: 200.40 kB
```

### `git diff --check`

```text
[no output] (exit 0)
```

另跑 `node scripts/generate-courts-seed.mjs --check`（gate 清單同項）：

```text
--check 通過:產出檔案與 data/courts.json 重生結果一致。
```

七道 gate 的 exit code 逐字：

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

## 15. `git diff --stat`／工作樹

tracked stat（報告落檔前）：

```text
 src/sessionViews.js | 81 +++++++++++++++++++++++++++++++----------------------
 1 file changed, 47 insertions(+), 34 deletions(-)
```

`--numstat` 逐檔：

```text
47	34	src/sessionViews.js
```

Git 不把 untracked 納入 `git diff --stat`；另有（`wc -l` 實算）：

```text
?? src/sheets/DecideSessionSheet.tsx  172 lines
?? docs/migration-reports/batch-8.5.md 本回報
```

行數變化（`wc -l` vs `git show HEAD:<path> | wc -l`）：

```text
src/sessionViews.js  3036 → 3049  (+13)
```

`git status --porcelain` 逐字（報告落檔前）：

```text
 M src/sessionViews.js
?? src/sheets/DecideSessionSheet.tsx
```

最終不 stage、不 commit、不 push。臨時 HEAD worktree 已 `git worktree remove --force` ＋
`git worktree prune` 清除（`git worktree list` 已無 `head85`），probe 用的兩個 Vite server 已停
（`pgrep -fl vite | wc -l` = 0）。

## 16. 偏離與發現

1. **presentation 回傳 raw 字串而非 `esc()` 後的字串（語意等價，但值不同）**。HEAD 的
   `renderCourtButtons` 用 `esc(court.id)`／`esc(court.name)` 是因為它在組 HTML 字串；React 在 render
   時自己 escape，若 presentation 再 `esc()` 一次，帶 `&`、`<`、`"` 的球場名會**看得見**地變成
   `&amp;lt;img&amp;gt;`。因此 `decideCourtOptionsPresentation` 回 `String(court.id)`／`String(court.name)`。
   `String()` 與 `esc()` 對不含特殊字元的值輸出相同，對含特殊字元的值則由 React 產出與 HEAD
   **相同的最終 DOM**——probe `escaped-injection-court-name` 逐屬性為證（文字為字面
   `<img id="x-inject">&"'球場`，且該案例的幾何列數與乾淨案例同為 19，沒有多出被解析的 `img`）。

2. **移除兩個區域 querySelector（派工單未列舉）**。`courtButtons`（`[data-decision-courts]`）與
   `courtsStatus`（`[data-decision-courts-status]`）在 React 接管後 caller 歸零，屬 factory 內部區域
   變數、非公開 API，一併刪除。`controls`／`terminal`／`error`／`timeInput` 四個仍保留，因為
   `setTerminal`／`decide`／`runAsyncAction` 還在用。

3. **`disabled` 刻意不進 React props**。HEAD 的 `button.disabled = deciding` 與 `runAsyncAction` 的
   `control.disabled = true/false` 是同一個屬性的兩個 imperative writer。本批把「render 後設一次
   `disabled`」留在 adapter（`content.setCourts()` 之後緊接 `buttons().forEach(...)`），React 完全不宣告
   該 prop，避免混用期出現第三個 writer。這是批 8.4 §4 已被接受的模式，本批只是把它用在
   list item 上。

4. **generation key 是必要的，不是保險**（§3.1）。與批 8.4 的理由不同：那批是為了重現「innerHTML
   置換清掉 checkbox 的 DOM checked」，本批是為了重現「舊節點 detach 讓 `runAsyncAction.rerendered()`
   為真」。若改用穩定 key，送出中刷新目錄會從「保持鎖住」變成「解鎖」——這條差異沒有既有 e2e
   覆蓋，只有 probe 案例 `decide-in-flight-then-set-courts` 抓得到。建議驗收方特別覆核這一格。

5. **`session === null` 是 production 的真實路徑，本批補了 probe 覆蓋**。
   `sessionController.js:1937` 的 `const decisionSummary = isUndecidedCandidate(summary) ? summary : null;`
   會把 null 交給 factory；HEAD 靠 `session?.` 與 `taipeiDateTimeLocalValue` 的 `value = new Date()`
   預設值撐住，時間欄位會顯示**當下時間**（三個 datetime 值相同）。這是既有行為，本批忠實保留
   （probe `unavailable-null-session` 兩樹逐字相同），但它看起來比較像未被注意到的副作用而非設計，
   列在此交 PM 判斷是否另開修復批；本批不擅自改語意。

6. **canary A 涵蓋不到點擊路徑，因此加了 canary B**。`tests/smoke.spec.js:353` 全程沒點過球場按鈕，
   只有 `tests/session.spec.js:606` 會真的點下去並驗 DB `decided_at`。單靠 canary A 會讓
   「`onClick` 沒接上」這種錯誤逃過紅燈——教訓同批 7／批 8.3 §16.2：canary 注入點必須對準測試實際
   斷言的那一面，覆蓋不到就再補一發。

7. **本批新增「幾何指紋」進 probe 流程**（§7.2）。前幾批對「純空白 text node 不可觀察」只有 CSS
   規範論證。本批對 19 案例 × 2 viewport × 全部 element 比對 rect 與五個 computed style，
   `mismatchCount: 0`——這是可執行的實證，建議後續批沿用（成本只多約 20% probe 時間）。

8. **probe 需要凍結 `Date`**。`session === null` 分支會落到 `taipeiDateTimeLocalValue` 的
   `value = new Date()` 預設值，兩樹依序啟動相隔數十秒會製造假紅。probe 在 `openDecideSessionSheet`
   呼叫前後暫時把 `window.Date` 換成固定時點的子類（`static now()` 一併覆寫），開完立刻還原；
   `src/` 零改動。凡是 fixture 會走到「未提供時間 → 用現在」的批次都要注意這點。

9. **probe 基礎設施**：沿用批 8.3 §15.7／批 8.4 §16.8 的做法直接 spawn
   `<tree>/node_modules/.bin/vite`（不經 npx wrapper）才 kill 得乾淨；HEAD worktree 的
   `node_modules` 用 `cp -al` 硬連結後立刻 `rm -rf node_modules/.vite`，避免兩棵樹共用 Vite dep cache。
   Google Maps／Fonts 兩個外部來源以 `context.route` stub 掉（理由同
   `tests/fixtures/fakeMaps.js` 的註解：gstatic 子集檔偶發 404 會污染 console-error 觀測）。
   跑 gate 前已確認 `pgrep -fl vite | wc -l` = 0。

## 驗收方註記（2026-08-19）

1. **偏離三條裁決全數接受**：raw 字串 vs esc()（React 自 escape，與批 8.3 String() 結論同類）；
   歸零 querySelector 移除（死碼）；session===null 時間欄位當下時間（既有行為忠實保留，
   是否修復列 PM 觀察項、不開批）。
2. **generation key 涵蓋宣稱修正**（read-back dual-writer lens 唯一 CONCERN）：實作面四重論證
   正確，但本報告宣稱「probe 案例 `decide-in-flight-then-set-courts` 抓得到」不成立——該案例
   snapshot 在 in-flight 中拍，穩定 key 的倖存按鈕同樣被 disable，序列化結果相同，穩定 key
   回歸下照樣綠。**驗收方已以臨時探針完成紅綠實證**（咬住序列：click → setCourts →
   resolveDecide → 驗 disabled）：generation key 版 resolve 後按鈕保持 disabled 且舊鈕
   detached（綠）；臨時改穩定 key 後舊鈕存活、resolve 後全部解鎖（紅，行為反轉），還原後
   SHA 與最終版一致。此語意的**持久測試**（e2e 或 probe 案例補上述序列）列 rider 併批 8.6。
3. 其餘三 lens（markup-behavior／report-audit／tsx-quality）16 項全 PASS；
   雙 writer 分界經逐 patch 路徑攻擊無可達覆蓋。驗收方另做獨立 canary
   （data-decide-court 屬性注入紅→綠）與 390px 一態抽驗（HEAD 逐 byte 相同）。
