# 批 8.3：球友目錄＋球友卡遷移 React 回報

日期：2026-08-19（Asia/Taipei）

Base HEAD：`1494d73966f5b2fe695925718f0448245c2cca31`

## 1. 結論

球友系相依的兩個 sheet 已在公開簽名、預設值、同步建立語意與回傳 handle 零變更下，把
`mountSheet` surface 內的內容遷移到 strict TSX：

```text
openPlayerDirectoryList({ onClose, onOpenPlayer, onRetry })  → { ...mounted, setDirectory }
openPlayerCardSheet(player, { courts, myInvitableSessions,   → { ...mounted, setInvitableSessions }
                              onClose, onCreate, onInvite, onSeeDirectory })
```

`mountSheet` 仍唯一擁有 `#sheet-root`、backdrop、`section.surface`、focus trap、capture-phase
Escape、surface stack、dismiss、close、isolation 與 opener 焦點回復。React 只掛進
`mounted.surface` 的 child list。

同時新增共用 `src/components/Avatar.tsx`：兩個 sheet 的 `.player-avatar` 由它單一產出。
legacy 字串版 `avatarMarkup()` **依派工單保留**（仍有 profile completion sheet 這個
consumer，屬批 8.4 範圍）；本批遷移後零 caller 的
`ntrpBrickSmMarkup`、`ntrpBrickMarkup`、`trustCountMarkup`、`playerDirectoryRowsMarkup`、
`playerInviteChoices`、`playerInviteOption` 六個字串 helper 一併退役。

`src/main.js`、`src/sessionController.js`、`src/sheets.js`、`src/modalIsolation.js`、
`src/domainTypes.ts`、CSS、HTML、`.claude/rules/**` 與 `tests/**` 全數零 diff。
未 commit、未 stage、未 push；本批未執行 DB reset。

## 2. 殼／內容／handle 責任分界

兩個 factory 都先同步建立原殼，`html` 改為空字串：

```js
const mounted = mountSheet({
  id: "player-directory-sheet",
  label: "球友名單",
  className: "player-directory-sheet",
  onClose,
  html: "",
});
```

```js
const mounted = mountSheet({
  id: "player-card-sheet",
  label: "球友卡",
  className: "player-card-sheet",
  onClose,
  html: "",
});
```

殼／內容邊界：

```text
#sheet-root                                     mountSheet 擁有
├─ .surface-backdrop[data-surface-dismiss]      mountSheet 擁有
└─ section#player-directory-sheet.surface       mountSheet 擁有
   ├─ .player-directory-sheet__grabber          React 內容
   ├─ .surface__head.player-directory-sheet__head  React 內容
   └─ .player-directory-sheet__scroll.qm-scroll React 內容

#sheet-root                                     mountSheet 擁有
├─ .surface-backdrop[data-surface-dismiss]      mountSheet 擁有
└─ section#player-card-sheet.surface            mountSheet 擁有
   ├─ .player-card-sheet__grabber               React 內容
   ├─ .surface__head                            React 內容
   ├─ .profile-brick-row--player                React 內容
   ├─ .player-profile                           React 內容
   ├─ .player-invite-form ／ .player-invite-empty ／（isSelf 無此節點）React 內容
   ├─ .player-card-sheet__actions               React 內容
   └─ .player-card-sheet__footnote              React 內容
```

`createRoot(mounted.surface)` 每個 mount element 只呼叫一次；初次 render 以 `flushSync`
commit，所以 factory 返回前 head／count／list 容器／invite 區塊都已在 DOM。

`mountSurface` 建殼時 content 尚空，因此它當下綁不到任何 `[data-surface-close]`。React 端
保留該 attribute，click handler 只呼叫 adapter 傳入的 `mounted.close()`——球友卡有兩個
`[data-surface-close]`（頭部 `×` 與底部「關閉」），兩顆都接同一個 `onClose`。真正的 closed
guard、stack remove、Escape listener remove、isolation release、`onClose({ reason })` 與
focus restore 仍全在 `mountSheet` handle，React 沒有重做。

handle 不擴張，只逐一轉送原本就存在的方法：

```ts
export interface PlayerDirectorySheetContentContract {
  setDirectory(next?: { players?: DirectoryPlayer[] | null; status?: SurfaceLoadStatus } | null): void;
}
export interface PlayerCardSheetContentContract {
  setInvitableSessions(sessions?: InvitableSession[] | null): void;
}
```

兩者都由 mount adapter 以 `flushSync` 包住 content ref 呼叫，方法返回時 DOM 已更新。

`openPlayerDirectoryList` 的時序凍結逐字保留：mount 後**先**呼叫
`content.setDirectory({ status: "loading" })`，**再** `return { ...mounted, setDirectory }`。

## 3. `setDirectory` 三態對映表

React state 分兩份：`state`（`{ players, status }` 或 `null`）與 `countLabel`（字串）。
`null` 專門模擬「mountSheet 建殼完、第一次 setDirectory 之前」那一刻的空 list——舊版此時
list 容器存在但 innerHTML 為空，而 `status` 從來不會是這個值，所以不會和任何真實 status
分支相撞。

| 舊 imperative 寫入 | React state／render | 凍結結果 |
| --- | --- | --- |
| `currentPlayers = Array.isArray(players) ? players : []` | `playersRef.current = players` ＋ `state.players` | 陣列 identity 不複製 |
| `if (countLabel && status === "ready") countLabel.textContent = String(currentPlayers.length)` | 僅 `status === "ready"` 才 `setCountLabel(String(players.length))` | loading／error 沿用上一次 ready 的數字，初值 `"0"` |
| `list.innerHTML = '<p class="surface__copy" role="status">正在載入球友名單…</p>'` | `status === "loading"` 分支 | 逐字文案／class／role 不變 |
| `list.innerHTML = '<div class="form-error" role="alert">球友名單暫時無法載入。<button … data-player-directory-retry>重新載入</button></div>'` | `status === "error"` 分支，button `onClick={() => onRetry()}` | 逐字文案／class／role／data 屬性不變 |
| `list.innerHTML = playerDirectoryRowsMarkup(currentPlayers)` | `state.players.length ? rows : <p class="surface__copy">目前沒有公開的球友卡。</p>` | 空態逐字文案不變 |
| `wireRows()` 每次重綁 delegated listener | React per-row `onClick` | 沒有 native listener 累積 |

參數預設值逐字對齊舊的解構語意（只有 `undefined` 觸發預設，`null` 不觸發）：

```ts
const source = next && typeof next === "object" ? next : {};
const players = Array.isArray(source.players) ? source.players : [];
const status = source.status === undefined ? "ready" : source.status;
```

### row click 的 array identity 論證

舊版：`currentPlayers.find((candidate) => String(candidate.profileId) === row.dataset.playerId)`，
找到才 `onOpenPlayer(player)`。這裡有兩個語意要保：(a) 傳出去的是**呼叫端原本那顆
object**，不是 props snapshot 或 clone；(b) 同 id 重複時取**第一筆**。

React 版把「最近一次 setDirectory 收到的那個陣列本身」放進 `playersRef`（不 clone、不
map），row 的 `onClick` 帶回該列的 `data-player-id` 字串，再用同一條 `.find` 回查：

```ts
const handleOpenPlayer = useCallback(
  (id: string) => {
    const player = playersRef.current.find((candidate) => String(candidate.profileId) === id);
    if (player) onOpenPlayer(player);
  },
  [onOpenPlayer]
);
```

因此 identity 與「第一筆」規則都與 HEAD 相同，而且不需要 adapter 再包一層。e2e
`tests/smoke.spec.js:4704` 直接斷言 `onOpenPlayer` 收到的 `player.profileId` 是原始
number `8801`（不是字串化的 id），本批綠燈可證。

## 4. 邀請表單狀態機對映表

舊版狀態散在四處：`form` 的 native `submit` listener、`runAsyncAction`、`setInvitableSessions`
的 `innerHTML` 置換，以及 `wirePlayerCreate()` 重綁。React 版用四份 state：
`branch`（一次定案）、`invite`（`{ generation, sessions }`）、`pending`、`errorText`／`successText`。

| 舊 imperative 步驟 | React state／render | 凍結結果 |
| --- | --- | --- |
| `inviteSection` 由 `player.isSelf` ／ `myInvitableSessions.length` 三選一 | `useState(() => player.isSelf ? "self" : myInvitableSessions.length ? "form" : "empty")` | 分支只在 mount 當下決定，後續 `setInvitableSessions` 不會把 form 換成獨立 empty 區塊 |
| `error.hidden = true; error.textContent = ""` ＋ `success` 同上 | `setErrorText(""); setSuccessText("")` | `hidden={!errorText}`，空字串 render 不產生 text node |
| `if (!selected) { error.textContent = "請選擇一個球局。"; error.hidden = false; return; }` | 同判斷、同文案，不進 pending | 未選取時不呼叫 `onInvite` |
| `runAsyncAction({ controls: [submit] })` 的 `unlockedControls` | `const watched = submit && !submit.disabled ? [submit] : []` | 已 disabled 時不重複鎖、finally 也不解鎖 |
| `rerendered()` = `watchedNodes.some((node) => !root.contains(node))` | `superseded()` = `watched.some((node) => !sheetRoot.contains(node))`，`sheetRoot` 是 adapter 傳入的 `mounted.root` | 逐字同一判準 |
| `control.disabled = true` | `setPending(true)`；submit `disabled={pending}` | 送出期間防重複提交 |
| `onSuccess: success.textContent = "邀請已送出"; success.hidden = false` | `if (!superseded()) setSuccessText("邀請已送出")` | stale surface 不落地成功訊息 |
| `error.textContent = actionError?.message \|\| "邀請失敗，請稍後再試。"` | `if (!superseded()) setErrorText((err as Error)?.message \|\| "邀請失敗，請稍後再試。")` | fallback 文案不變 |
| `finally` 的 `controlsToRestore.forEach(c => c.disabled = false)` | `if (watched.length && !superseded()) setPending(false)` | `watched` 為空時舊版 `controlsToRestore` 也是空陣列，同樣不解鎖 |
| `options.innerHTML = playerInviteChoices(next, courts)` | `setInvite(prev => ({ generation: prev.generation + 1, sessions: next }))` | 見下方 generation key |
| `submit.hidden = nextSessions.length === 0` | `hidden={invite.sessions.length === 0}` | 初次 render 一定 > 0，因此初始無 `hidden` 屬性 |
| `if (!options \|\| !submit) return`（非 form 分支時 no-op） | `if (branch !== "form") return` | self／empty 分支呼叫 `setInvitableSessions` 仍是 no-op |
| `wirePlayerCreate()` 重綁 `[data-player-create]` | React `onClick={() => onCreate()}` | 置換選項後仍可觸發，且不重複疊 listener |

### generation key：重現「innerHTML 置換清掉已勾選 radio」

舊版 `setInvitableSessions` 是整段 `innerHTML` 置換，所以**任何**已勾選的 radio 都會消失
（新節點預設 unchecked）。React 若只用 `sessionId` 當 key，倖存的 session 會保留 DOM
節點與其 checked 屬性——這是可觀察差異（下一次 submit 一邊會送出、一邊會顯示
「請選擇一個球局。」）。因此 key 折入 refresh 世代：

```tsx
<label className="player-invite-option" key={`${generation}:${identity}`}>
```

`identity` 沿用批 8.2 的 namespace 慣例（`id:` ／缺 id 時 `missing:index`），避免 fallback
index 與真實 id 相撞。容器 `[data-player-invite-options]` 與 submit 按鈕本身**不**帶
generation，節點 identity 保持不變——這是 `superseded()` 判準能成立的前提。

### radio 為何用 `defaultValue`

repo 既有慣例（`EditSessionSheet.tsx:135/223/236`、`CreateSessionSheet.tsx:684/697`）是
uncontrolled 欄位一律用 `defaultValue`；直接寫 `value` 而沒有 `onChange`／`readOnly` 會觸發
React dev 的 controlled-value `console.error`，而球友系 e2e 全都斷言 `runtimeErrors` 為空。
`defaultValue` 對 `<input>` 就是 `value` content attribute，DOM probe 已逐屬性確認
`value="…"` 與 HEAD 相同。選取值仍由 submit 當下的
`form.querySelector("input[name='player-invite-session']:checked").value` 讀取，與舊版同一行。

## 5. 共用 `Avatar` 與 helper 去留清單

`src/components/Avatar.tsx` 接受：

```ts
export interface AvatarProps {
  avatarUrl?: string;
  nickname?: string;
  size?: "" | "md" | "lg";
}
```

`className` 由 size 產出（`player-avatar` ／ `player-avatar player-avatar--md` ／
`player-avatar player-avatar--lg`），與字串版 `player-avatar${sizeClass}` 逐字相同；
`safeGoogleAvatarUrl`／`avatarInitial`／`showAvatarFallback` 走新的 `avatarRuntime`
frozen export，沒有在 TSX 複製既有判準。

### 開工 production grep（helper caller ground truth）

```text
src/sessionViews.js:75   avatarMarkup            ← :2337 profile completion、:2913 directory row、:3089 player card
src/sessionViews.js:90   ntrpBrickMarkup         ← :3093 player card（唯一）
src/sessionViews.js:96   ntrpBrickSmMarkup       ← :2917 directory row（唯一）
src/sessionViews.js:124  trustCountMarkup        ← :2922 directory row、:3096 player card
src/sessionViews.js:2905 playerDirectoryRowsMarkup ← :2977 setDirectory（唯一）
src/sessionViews.js:3024 playerInviteOption      ← :3037 playerInviteChoices（唯一）
src/sessionViews.js:3035 playerInviteChoices     ← :3062 初次 render、:3122 setInvitableSessions
```

### 去留判斷

| helper | 本批後 caller | 處置 |
| --- | --- | --- |
| `avatarMarkup` | 1（`sessionViews.js:2333` profile completion sheet） | **保留**，批 8.4 才退役 |
| `ntrpBrickMarkup` | 0 | 退役 |
| `ntrpBrickSmMarkup` | 0 | 退役 |
| `trustCountMarkup` | 0 | 退役 |
| `playerDirectoryRowsMarkup` | 0 | 退役 |
| `playerInviteChoices` | 0 | 退役 |
| `playerInviteOption` | 0 | 退役 |
| `ntrpBrickValue` | `mePageRuntime:1094`、兩個新 presentation | 保留 |
| `trustCountText` | `sessionDetailSheetRuntime:1828`、兩個新 presentation | 保留 |
| `avatarInitial`／`safeGoogleAvatarUrl`／`showAvatarFallback` | 三個 runtime export | 保留 |
| `wireAvatarFallbacks` | `sessionViews.js:2373`（profile completion） | 保留 |
| `playerSlotLabels`／`playerPresenceLabel`／`playerGreetingLabel` | `courtPlayerCardPresentation`、`mePageRuntime`、新 presentation | 保留 |

`ntrpBrickMarkup` 不在派工單列舉之內，但它與 `ntrpBrickSmMarkup` 同屬「唯一 caller 在本批
範圍」，依派工單「遷移後零 caller 者一併退役」處理；已寫入下方偏離節。

### 退役後 executable reverse grep（逐字）

```text
$ rg -n "ntrpBrickSmMarkup|ntrpBrickMarkup|trustCountMarkup|playerDirectoryRowsMarkup|playerInviteChoices|playerInviteOption\b" src scripts supabase
exit=1 (no matches)
```

全 repo（排除 `docs/migration-reports/**`、`node_modules`、其他 worktree、`dist`）逐字只剩一
條歷史規劃說明文字，不是 executable caller：

```text
./docs/superpowers/specs/2026-07-25-player-directory-off-map-redesign-design.md:81:  「邀請加入我的球局」。完全復用現有球友卡、`playerInviteChoices`、送出邀請流程。
```

### 新 frozen runtime

```js
export const avatarRuntime = Object.freeze({ avatarInitial, safeGoogleAvatarUrl, showAvatarFallback });
export const playerDirectorySheetRuntime = Object.freeze({ playerDirectoryRowPresentation });
export const playerCardSheetRuntime = Object.freeze({ playerCardPresentation, playerInviteOptionPresentation });
```

排序／在線排前不在本批範圍——它住在 `sessionController.js` 的 `playerDirectoryRows()`
（`Number(right.isPresent) - Number(left.isPresent)` 再 `localeCompare`），view 端只負責呈現。
view 端的判準（`isPresent` → 「在線」chip、`isSelf` → 「這是你」chip、`trustCountText` 回 null
就整行不畫、`ntrpBrickValue` 的 `—` 空值語意、`常打／時段/打法/球場` 的 fallback 鏈）全部留在
上述 runtime，TSX 沒有複製任何一條。三個 component 都沿用批 8／8.1 已驗證的 lazy runtime
resolve（`function runtime() { return xxxRuntime as unknown as XxxRuntime; }`），避免
`sessionViews.js` eager glob → TSX → `sessionViews.js` 這條 circular edge 在初始化期 TDZ。

## 6. HEAD／current DOM 逐屬性 probe

以 `HEAD=1494d73966f5b2fe695925718f0448245c2cca31` 建獨立 temp worktree（自帶 clone 的
`node_modules`、相同 `.env.local`），HEAD 與工作樹**依序**各啟一個 Vite（5271／5272，不並行，
避免 `.vite` cache 污染），probe 對 `#sheet-root` 每個 element 比較：

- `tag`
- 排序後完整 `attrs`
- 直接文字 `text`（真串接後只正規化 whitespace）
- **非純空白 text node 的逐字切分**（`meaningfulTextNodes`）
- 非空白 child 交錯順序 `childOrder`
- 遞迴 children 陣列長度與內容

fixture 刻意帶 `<`、`&`、`"` 注入字串，同時驗 escape。15 個案例涵蓋派工單要求的目錄
loading／ready／error／空態、球友卡 isSelf／可邀／不可邀、邀請 error／success 態，另加
pending、未選取、`setInvitableSessions` 三種路徑與候選局選項：

```json
{
  "cases": [
    "directory-loading",
    "directory-ready",
    "directory-empty",
    "directory-error",
    "card-self",
    "card-no-sessions",
    "card-invitable",
    "card-invite-no-selection",
    "card-invite-pending",
    "card-invite-success",
    "card-invite-error",
    "card-invite-refreshed-empty",
    "card-invite-refreshed-one",
    "card-invite-refreshed-noop-on-empty-branch",
    "card-candidate-session"
  ],
  "matched": 15,
  "headConsoleErrors": [],
  "currentConsoleErrors": [],
  "mismatches": [],
  "whitespaceOnlyTextNodes": {
    "headBlankTextNodes": 526,
    "currentBlankTextNodes": 0,
    "nodesWithBlankDelta": 125
  }
}
```

### probe 抓到並已修掉的真實差異

第一輪 probe 紅了 11 個案例、42 條 mismatch，全部是同一類：React 把 HEAD 的單一 text node
拆成多段。例如 `打法：${x}` 在 JSX 寫成 `打法：{x}` 會產生兩個 text node。雖然 `textContent`
相同、既有 e2e 也仍綠，但這是 DOM 結構差異。修法是把每段複合文字改回單一 template
string（`{`打法：${presentation.playTypesText}`}`），涵蓋：球友卡的
`在線狀態：`／`打法：`／`時段：`／`常打球場：`、`profile-brick-row__copy` 的 `常打 X · Y`、
邀請選項的 `badge · court` 與 `playType · ntrpRange`、目錄列的 `常打 X · Y`，以及副行的
`{"開放名單的球友 · "}` ／ `{" 位"}`。修完後 `meaningfulTextNodes` 全數逐字一致。

### 唯一剩餘差異：純空白 text node

HEAD 用 `innerHTML` 字串模板，換行與縮排會留下 526 個純空白 text node；React 一個也沒有。
這是不可消除的產出形式差異，且不可觀察，論證如下——所有帶純空白 text node 的容器，其
子節點若含 inline box，容器一律是 flex／grid（flex／grid 規範明定純空白子字串不產生
item）：

```text
src/session.css:176  .player-directory-row          display: flex
src/session.css:180  .player-directory-row__body    display: grid
src/session.css:181  .player-directory-row__head    display: flex
src/session.css:173  .player-directory-list         display: grid
src/session.css:345  .surface__head                 display: flex
src/session.css:466  .form-fieldset                 display: grid
src/session.css:760  .profile-brick-row             display: flex
src/session.css:761  .profile-brick-row__copy       display: grid
src/session.css:1022 .player-avatar                 display: inline-grid
src/session.css:1098 .player-profile                display: grid
src/session.css:1101 .player-invite-options         display: grid
src/session.css:1102 .player-invite-option          display: grid
src/session.css:1106 .player-invite-empty           display: grid
src/session.css:1403 .player-card-sheet__actions    display: flex
```

其餘容器（`.surface`、`.player-directory-sheet__scroll`、`.player-invite-form`）的子節點全是
block-level box——兩個 grabber 都明寫 `display: block`
（`src/session.css:1381`／`src/session.css:1402`）——block 之間的空白 text node 不生成 box。
`.player-directory-sheet__sub` 那一行的 text node 是有意義的、已在 `meaningfulTextNodes` 比對
通過，不屬此類。

## 7. React 接管 canary：紅 → 綠

canary 前 SHA：

```text
20851b033675b770b653adf2ace4316d1a9357d20ad040cdfcdb2b397e319cff  src/sessionViews.js
84c30035c4a21d691ffc9f564f5e533791fe3a5b7b9e5e6b98cf0f00e3d17515  src/components/Avatar.tsx
2c7ba0ed3ad284fc4fb490edd619c17c9cd2c36defaf241516715bcf44bf155a  src/sheets/PlayerDirectorySheet.tsx
83628ab8ee8e1bbd7817f004b21a2acd8dd6356d824d26fb0da33ce8447f1037  src/sheets/PlayerCardSheet.tsx
```

把兩個 content mount 的 `reactRoot.render(<… />)` 暫時改成 `reactRoot.render(null)`，各挑一條
真正斷言該 sheet 內容的既有 e2e：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep "player directory escapes every dynamic field|player invitation form escapes session fields"
```

紅燈逐字（`grep -E '✘|✓|Error:|Locator:|Expected|Received|failed|passed'`）：

```text
  ✘  1 [desktop-chromium] › tests/smoke.spec.js:3299:1 › player invitation form escapes session fields and is pending-safe across success, errors, and stale surfaces (30.0s)
  ✘  2 [desktop-chromium] › tests/smoke.spec.js:4704:1 › player directory escapes every dynamic field before opening the selected public card (5.2s)
    Error: locator.check: Test timeout of 30000ms exceeded.
    Error: expect(locator).toContainText(expected) failed
    Locator: locator('#player-directory-sheet')
    Expected substring: "<img id=\"directory-name-injection\">"
    Received string:    ""
  2 failed
```

球友卡那條的失敗點逐字：

```text
    Error: locator.check: Test timeout of 30000ms exceeded.
    Call log:
      - waiting for getByTestId('player-invite-session')

      3322 |   });
      3323 |   await expect(page.locator("#player-card-sheet img")).toHaveCount(0);
    > 3324 |   await page.getByTestId("player-invite-session").check();
           |                                                   ^
```

逐字還原後同命令：

```text
  ✓  1 [desktop-chromium] › tests/smoke.spec.js:3299:1 › player invitation form escapes session fields and is pending-safe across success, errors, and stale surfaces (2.6s)
  ✓  2 [desktop-chromium] › tests/smoke.spec.js:4704:1 › player directory escapes every dynamic field before opening the selected public card (530ms)
  2 passed (3.9s)
```

還原後 `shasum -a 256 -c` 逐字：

```text
src/sessionViews.js: OK
src/components/Avatar.tsx: OK
src/sheets/PlayerDirectorySheet.tsx: OK
src/sheets/PlayerCardSheet.tsx: OK
```

## 8. 球友系 e2e `--repeat-each=3`

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep "player drawer and card escape|D8 profile card, directory row|player invitation form escapes|SESSION_EXPIRED player invitation|mock online layer uses presence pins|player directory escapes every dynamic field|drawer-card focus survives discovery" \
  --repeat-each=3
```

逐字結尾：

```text
  ✓  15 [desktop-chromium] › tests/smoke.spec.js:3131:1 › drawer-card focus survives discovery rerenders and remains a logical sheet restore target (914ms)
  ✓  16 [desktop-chromium] › tests/smoke.spec.js:3154:1 › player drawer and card escape every public value and render self and empty invitation states (658ms)
  ✓  17 [desktop-chromium] › tests/smoke.spec.js:3216:1 › D8 profile card, directory row, and player card render the avatar+NTRP-brick structure and show em dash for unset NTRP (602ms)
  ✓  18 [desktop-chromium] › tests/smoke.spec.js:3299:1 › player invitation form escapes session fields and is pending-safe across success, errors, and stale surfaces (2.9s)
  ✓  19 [desktop-chromium] › tests/smoke.spec.js:3364:1 › SESSION_EXPIRED player invitation refreshes choices and renders an inline error instead of success (628ms)
  ✓  20 [desktop-chromium] › tests/smoke.spec.js:4618:1 › mock online layer uses presence pins while the full directory list opens cards and invitations (1.6s)
  ✓  21 [desktop-chromium] › tests/smoke.spec.js:4704:1 › player directory escapes every dynamic field before opening the selected public card (531ms)

  21 passed (28.2s)
```

## 9. Full-repo consumer sweep

### Production

```text
src/sessionViews.js:2918   openPlayerDirectoryList export（adapter）
src/sessionViews.js:2932   content.setDirectory({ status: "loading" }) 時序凍結點
src/sessionViews.js:2933   handle 轉送 setDirectory
src/sessionViews.js:3013   openPlayerCardSheet export（adapter）
src/sessionViews.js:3045   handle 轉送 setInvitableSessions
src/main.js:79-80          import
src/main.js:1502           openPlayerDirectoryList app adapter caller
src/main.js:1503           openPlayerCard app adapter caller
src/main.js:1535           #player-directory-open click → controller.openPlayerDirectory()
src/sessionController.js:406  openPlayerDirectoryList default injected dependency
src/sessionController.js:407  openPlayerCard default injected dependency
src/sessionController.js:961  controller factory caller（目錄）
src/sessionController.js:975  setDirectory loading
src/sessionController.js:982  setDirectory ready
src/sessionController.js:986  setDirectory error
src/sessionController.js:1456 controller factory caller（球友卡）
src/sessionController.js:1487 setInvitableSessions（SESSION_EXPIRED 路徑）
```

以上 production 呼叫點本批**零修改**。

### Existing direct test consumers（零修改）

```text
tests/smoke.spec.js:1869-1870  import＋direct openPlayerCardSheet（候選局邀請選項）
tests/smoke.spec.js:3183       direct openPlayerCardSheet（isSelf）
tests/smoke.spec.js:3202       direct openPlayerCardSheet（無可邀球局）
tests/smoke.spec.js:3260-3262  import＋direct openPlayerDirectoryList＋setDirectory
tests/smoke.spec.js:3278-3280  import＋direct openPlayerCardSheet（D8 結構）
tests/smoke.spec.js:3308       direct（邀請 success）
tests/smoke.spec.js:3333       direct（邀請 error）
tests/smoke.spec.js:3347       direct（stale surface）
tests/smoke.spec.js:3402       controller injection openPlayerCard
tests/smoke.spec.js:4632       import 四個 symbol
tests/smoke.spec.js:4659-4660  controller injection（目錄＋球友卡）
tests/smoke.spec.js:4709-4715  import＋direct openPlayerDirectoryList＋setDirectory
tests/session-controller.test.js:291-301  harness duck type（setDirectory／setInvitableSessions）
```

### New internal mount／runtime consumers

```text
src/sessionViews.js:57-64            兩個 browser-only eager glob＋mount symbol
src/sessionViews.js:123              avatarRuntime export
src/sessionViews.js:2915             playerDirectorySheetRuntime export
src/sessionViews.js:3010             playerCardSheetRuntime export
src/sessionViews.js:2927             directory content mount call
src/sessionViews.js:3035             card content mount call
src/components/Avatar.tsx:1,21       avatarRuntime import＋lazy resolve
src/sheets/PlayerDirectorySheet.tsx:5,7,62,212  Avatar import／runtime import／lazy resolve／mount export
src/sheets/PlayerCardSheet.tsx:5,7,85,317       同上
```

### `scripts/**`、`supabase/**`

```text
$ rg -n "openPlayerDirectoryList|openPlayerCardSheet|avatarRuntime|playerDirectorySheetRuntime|playerCardSheetRuntime|Avatar" scripts supabase
exit=1 (no matches)
```

## 10. 變更清單

- `src/components/Avatar.tsx`（新增，47 lines）：共用 `.player-avatar` JSX、size modifier、lazy runtime bridge。
- `src/sheets/PlayerDirectorySheet.tsx`（新增，226 lines）：目錄殼內容、三態 body、count state、imperative content contract。
- `src/sheets/PlayerCardSheet.tsx`（新增，331 lines）：球友卡內容、三分支 invite 區塊、邀請表單狀態機、imperative content contract。
- `src/sessionViews.js`（修改）：兩個 mount adapter、三個 frozen runtime、兩組 presentation；移除兩段 string HTML 與六個零 caller 字串 helper。
- `docs/migration-reports/batch-8.3.md`：本回報。

刻意未改：`main.js`、`sessionController.js`、`sheets.js`、`modalIsolation.js`、`map.js`、`pins.js`、
`domainTypes.ts`、HTML、CSS、`.claude/rules/**`、`tests/**`。

## 11. Bundle 前後對照

HEAD temp worktree 與工作樹用相同 `.env.local`／同版本 `node_modules` 各跑 `npm run build`；
所有數字本批重算（Vite 報表逐字抄錄，raw／gzip bytes 以 node 實算）：

| | Batch 8.2 HEAD | Batch 8.3 | delta |
| --- | ---: | ---: | ---: |
| transformed modules | 108 | 111 | +3 |
| Vite main JS | 702.51 kB | 706.71 kB | +4.20 kB |
| Vite gzip | 199.08 kB | 199.85 kB | +0.77 kB |
| exact raw bytes | 702,513 | 706,709 | +4,196 |
| `zlib.gzipSync` bytes | 199,077 | 199,846 | +769 |

before：

```text
✓ 108 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-C6rdIkeQ.js   702.51 kB │ gzip: 199.08 kB
✓ built in 828ms
```

after：

```text
✓ 111 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-kuXN1cEP.js   706.71 kB │ gzip: 199.85 kB
✓ built in 827ms
```

新增三個 module（共用 Avatar＋兩個 sheet content）；移除的 legacy markup 抵銷部分 JSX，
無異常膨脹。CSS、HTML、小 analytics chunk 位元組不變。既有 500 kB warning 類型與 before 相同。

## 12. SHA-256 對照

Batch 開始：

```text
41176d80b688a25c8eb8bca7e178f54a70f3309631153452b88d6514166a6680  src/sessionViews.js
36dda9c8f3f3feef40b3b8776d188e15aa595375118b2f978406a6d5f7b198cc  src/sheets.js
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
50315720137eafa14443fc5c2522283d7d81eb32ae302cb72970daf2109e8d42  src/components/SessionCard.tsx
3bd926151593bce63e98354cc924756540b5380120237cc58b98416fa97d9e6b  src/sheets/FilterSheet.tsx
6fb72e8d4dd2dfcc548408c5ff64eeffb8cdacfe90441cb2fe76f1a9f7414ddb  src/sheets/CourtPlayersSheet.tsx
3bef9149f70f295e28a01be40b8b1207e88b2913d58b53fb4690b1b1ddfa90a4  .claude/rules/react-migration.md
```

最終：

```text
20851b033675b770b653adf2ace4316d1a9357d20ad040cdfcdb2b397e319cff  src/sessionViews.js
84c30035c4a21d691ffc9f564f5e533791fe3a5b7b9e5e6b98cf0f00e3d17515  src/components/Avatar.tsx
2c7ba0ed3ad284fc4fb490edd619c17c9cd2c36defaf241516715bcf44bf155a  src/sheets/PlayerDirectorySheet.tsx
83628ab8ee8e1bbd7817f004b21a2acd8dd6356d824d26fb0da33ce8447f1037  src/sheets/PlayerCardSheet.tsx
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
36dda9c8f3f3feef40b3b8776d188e15aa595375118b2f978406a6d5f7b198cc  src/sheets.js
3bef9149f70f295e28a01be40b8b1207e88b2913d58b53fb4690b1b1ddfa90a4  .claude/rules/react-migration.md
```

完整 sorted `src/**` path-keyed manifest diff（HEAD worktree vs 工作樹）只有：

```text
src/components/Avatar.tsx            added
src/sessionViews.js                  modified
src/sheets/PlayerCardSheet.tsx       added
src/sheets/PlayerDirectorySheet.tsx  added
```

凍結檔 `git diff --name-only HEAD -- src/main.js src/sessionController.js src/sheets.js src/modalIsolation.js src/session.css src/style.css index.html tests/ src/domainTypes.ts .claude/rules/` 無輸出（exit 0）。

## 13. 完整 gate 結尾輸出（逐字）

執行前已確認：無任何 dev server 在跑（`ps -eo pid,command | grep -cE "[v]ite"` = 0），
local Supabase 已在跑（`http://127.0.0.1:54321/rest/v1/` = 200），**未執行 DB reset**。

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
# duration_ms 1820.694541
```

desktop＋mobile：

```text
  ✓  250 [mobile-chromium] › tests/smoke.spec.js:5183:1 › openFilterSheet mounts a dialog with six data-filter groups and closes on Escape (163ms)
  ✓  251 [mobile-chromium] › tests/smoke.spec.js:5220:1 › the filter sheet applies a district change immediately to the background drawer summary and keeps keyboard focus off body (176ms)
  ✓  252 [mobile-chromium] › tests/smoke.spec.js:5286:1 › closing and reopening the filter sheet three times does not stack delegated listeners on the shared sheet root (484ms)
  ✓  253 [mobile-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.4s)
  ✓  254 [mobile-chromium] › tests/smoke.spec.js:5359:1 › the filter sheet traps Tab focus between its own first and last controls (243ms)

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
# duration_ms 4299.456917
```

Supabase Chromium：

```text
  ✓  49 [supabase-chromium] › tests/session.spec.js:2036:1 › neutral counts stay hidden at zero and appear on all three surfaces once a session is played (3.0s)
  ✓  50 [supabase-chromium] › tests/session.spec.js:2156:1 › a brand-new account is subscribed to every active Taipei court when it first saves a profile (1.0s)
  ✓  51 [supabase-chromium] › tests/session.spec.js:2180:1 › N1 an existing zero-subscription account is never seeded by a later profile save (832ms)
  ✓  52 [supabase-chromium] › tests/session.spec.js:2199:1 › N2 an account that explicitly cleared every court stays at zero across later profile saves (1.5s)
  ✓  53 [supabase-chromium] › tests/session.spec.js:2226:1 › N3 a failing subscription seed never fails the profile save (805ms)

  11 skipped
  42 passed (1.6m)
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
vite v6.4.3 building for production...
transforming...
✓ 111 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-kuXN1cEP.js   706.71 kB │ gzip: 199.85 kB
✓ built in 827ms
```

### `git diff --check`

```text
[no output] (exit 0)
```

七道 gate 的 exit code 逐字：

```text
EXIT_npm_test=0
EXIT_test_local=0
EXIT_typecheck=0
EXIT_lint=0
EXIT_prettier:check=0
EXIT_build=0
EXIT_git_diff_check=0
```

## 14. `git diff --stat`／工作樹

tracked stat（報告落檔前）：

```text
 src/sessionViews.js | 263 +++++++++++++++-------------------------------------
 1 file changed, 77 insertions(+), 186 deletions(-)
```

Git 不把 untracked 納入 `git diff --stat`；另有（`wc -l` 實算）：

```text
?? src/components/Avatar.tsx              47 lines
?? src/sheets/PlayerDirectorySheet.tsx   226 lines
?? src/sheets/PlayerCardSheet.tsx        331 lines
?? docs/migration-reports/batch-8.3.md    本回報
```

`src/sessionViews.js` 由 3189 行降為 3080 行。

`git status --porcelain` 逐字（報告落檔前）：

```text
 M src/sessionViews.js
?? src/components/Avatar.tsx
?? src/sheets/PlayerCardSheet.tsx
?? src/sheets/PlayerDirectorySheet.tsx
```

最終不 stage、不 commit、不 push。臨時 HEAD worktree 已 `git worktree remove --force` ＋
`git worktree prune` 清除，probe 用的兩個 Vite server 已停（`grep -cE "[v]ite"` = 0）。

## 15. 偏離與發現

1. **`ntrpBrickMarkup` 一併退役（派工單未列舉）**。派工單只點名 `ntrpBrickSmMarkup`；實際
   grep 顯示 `ntrpBrickMarkup`（`sessionViews.js:90`）的唯一 caller 也在本批範圍
   （`:3093` 球友卡 NTRP 磚）。依派工單「遷移後零 caller 者一併退役」處理，反向 grep 為證。
   `ntrpBrickValue` 保留（`mePageRuntime` 仍用）。

2. **`trustCountMarkup` 有兩個 caller、都在本批內**。`sessionViews.js:117` 的註解寫「三個呼叫
   點（加入前名單主揪列、球友名單列、球友卡）」，但加入前名單那一點在批 8 已改走
   `sessionDetailSheetRuntime.trustCountText`，實際 `trustCountMarkup` 只剩兩個 caller。因此本批
   後歸零可退役，`trustCountText` 保留。註解描述的是設計意圖，grep 才是 ground truth。

3. **`onRetry`／`onCreate`／`onSeeDirectory` 的 callback 參數**。HEAD 以
   `addEventListener("click", cb)` 綁定，實際會把 native `MouseEvent` 當第一個參數傳給
   callback。React 無法產生同型 native event（只有 SyntheticEvent），本批改為
   `onClick={() => cb()}`，即傳零參數。三個 callback 的所有現存 production／test 呼叫點都不讀
   參數（`sessionController.js:966` onRetry、`:1467` onSeeDirectory、`:1468` onCreate、
   smoke `onCreate: () => { … }`），因此無行為差異；
   但這是相對 HEAD 的 payload 差異，明列於此。

4. **`superseded()` 用 `mounted.root.contains()` 而非 surface**。舊 `runAsyncAction` 的
   `belongsToRoot` 是 `root.contains(node)`，`root` 是 `#sheet-root`。若改用
   `mounted.surface.contains(node)` 會有 bug：`mountSurface` 換頁時只做
   `root.innerHTML = ""`，surface 連同子樹被整段 detach，`surface.contains(submit)` **仍為 true**。
   因此 adapter 明確把 `mounted.root` 以 `sheetRoot` prop 傳進 content，判準逐字不變。

5. **DOM probe 抓到 React text node 拆分**（詳見 §6）。這是既有回報方法沒暴露的類別——
   批 8.1／8.2 的 probe 對直接文字做 `join(" ")` 後正規化，剛好把這類拆分掩蓋掉；本批把
   serializer 改為真串接＋逐 text node 比對才發現。建議後續批沿用本批的 serializer。

6. **建議但未做（scope 擴大，交驗收方決定）**：`src/pages/MePage.tsx:126-142` 與
   `src/sheets/SessionDetailSheet.tsx:446-462` 各自有一份自己的 `PlayerAvatar` component，與新的
   `src/components/Avatar.tsx` 產出的 DOM 完全一致（差別只在 size class 與屬性書寫順序，
   後者不影響 DOM）。把兩處改成 `<Avatar … />` 即可讓 React 側真正單一來源，但那會動到批 7／8
   已驗收的兩個檔案，超出本批範圍，故未執行。批 8.4 退役字串版 `avatarMarkup()` 時一併處理
   最自然。

7. **probe 基礎設施小坑**：以 `spawn("npx", ["vite", …])` 起 server 時，`child.kill()` 只殺掉 npx
   wrapper，vite 會被 re-parent 成孤兒繼續佔 port——正是 memory 記過的「平行 Vite server 污染
   gate」風險來源。改為直接 spawn `<tree>/node_modules/.bin/vite` 後 kill 才乾淨。跑 gate 前已
   逐一確認 `grep -cE "[v]ite"` = 0。

## 16. 驗收方註記（2026-08-19）

1. **§3「只有 undefined 觸發預設，null 不觸發」的精確化**（read-back handle-behavior lens 唯一
   CONCERN）：該敘述在「欄位層」成立（`{players:null}`／`{status:null}` 兩版行為一致），但在
   「整參數層」不成立——`setDirectory(null)` 在 HEAD 是解構 null 直接 TypeError，TSX 版正規化
   為 `{}` → ready 空清單。裁決：**接受**。舊版對此輸入是 crash 而非有意義行為，新版屬 latent
   hardening（與批 1b／批 8 兩度裁定「補 guard 屬 latent 修復」同類）；全部現存 caller
   （sessionViews.js:2932、tests 直呼點）皆傳 object，不可達。
2. **驗收方獨立 canary 過程紀錄**：第一發注入 Avatar base class（`player-avatar`→`player-avatar-x`）
   假陰性——D8 測試實際斷言的是 `.player-avatar--md`／`--lg` modifier；改注入 modifier
   （`player-avatar-x--${size}`）後紅→綠成立。教訓同批 7：canary 注入點必須對準測試實際斷言的
   面，選錯面會假陰性。
3. 其餘四 lens（markup／async-machine／report-audit／tsx-quality）與 handle-behavior 其他 12 項
   全 PASS；§15 偏離 1-5 逐一覆核成立、偏離 6 轉批 8.4 rider。

> **批 12 後註（2026-08-20）**：本節記載的 `as unknown as` 雙重斷言寫法已全面移除。
> 實測顯示它會吞掉 `sessionViews.js` 的 runtime 匯出漂移（改名或改回傳形狀，`tsc` 都靜默通過）。
> 根因是 `sessionCardPresentation` 的 `courts = []` 被推成 `never[]`，已改以 JSDoc 標註修正，
> 10 處斷言全部可直接刪除。新程式碼請勿再沿用此寫法，詳見 `docs/migration-reports/batch-12.md`。
