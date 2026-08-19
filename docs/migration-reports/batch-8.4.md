# 批 8.4：個人檔案補齊／編輯 sheet 遷移 React ＋ avatar 收官回報

日期：2026-08-19（Asia/Taipei）

Base HEAD：`133e47f8ffb3e162d279e80670e062eab48c4825`

## 1. 結論

個人檔案 sheet 已在公開簽名、十個參數預設值、`mode` 兩語氣分支、intent 驅動的
gateHint／compactCreateGate、同步建立語意與回傳 handle 零變更下，把 `mountSheet` surface
內的內容遷移到 strict TSX：

```text
openProfileCompletionSheet({ avatarUrl, courts, courtsReady, onClose,      → { ...mounted, setCourts }
                             onSave, onSaved, intent, mode, profile,
                             returnSession })
```

`mountSheet` 仍唯一擁有 `#sheet-root`、backdrop、`section.surface`、focus trap、capture-phase
Escape、surface stack、dismiss、close、isolation 與 opener 焦點回復。React 只掛進
`mounted.surface` 的 child list。

**gate 判準零搬移**：`profileGateForIntent`、`profileGateHint`、`validateProfileForm`、
`validProfileNtrp`、`profileFormValue`、`runAsyncAction` 全部留在 `sessionViews.js`（`profile.js`
零修改），TSX 一條也沒複製——詳見 §5 的逐條清單。

Rider（avatar 單一來源收官）：

- profile sheet 的 avatar preview 改用共用 `src/components/Avatar.tsx`；字串版 `avatarMarkup()`
  與 `wireAvatarFallbacks()` caller 歸零後退役。
- `src/pages/MePage.tsx` 與 `src/sheets/SessionDetailSheet.tsx` 各自的私有 `PlayerAvatar`
  刪除、改用共用 `Avatar`；兩檔 DOM 輸出零變更（§7 有兩個獨立 probe 案例逐屬性為證）。
- 兩檔改用共用版後歸零的 frozen runtime 橋接欄位一併退役（§6 表格、§16 偏離 1）。

`src/main.js`、`src/sessionController.js`、`src/sheets.js`、`src/modalIsolation.js`、
`src/profile.js`、`src/domainTypes.ts`、CSS、HTML、`.claude/rules/**` 與 `tests/**` 全數零 diff
（`git diff --name-only HEAD -- …` exit 0，逐字見 §14）。
未 commit、未 stage、未 push；本批未執行 DB reset。

## 2. 殼／內容／handle 責任分界

factory 先同步建立原殼，`html` 改為空字串：

```js
const mounted = mountSheet({
  id: "profile-completion-sheet",
  label: standalone ? "編輯個人檔案" : "完成個人檔案",
  className: "profile-sheet",
  onClose: (detail = {}) => onClose({ ...detail, saved }),
  html: "",
});
```

`label`、`className`、`onClose` 的 `{ ...detail, saved }` payload 與 `saved` 的 closure 位置逐字
不變（`saved` 只在 `onSave` 成功後、`mounted.close({ reason: "complete" })` 之前被設為 true）。

殼／內容邊界：

```text
#sheet-root                                        mountSheet 擁有
├─ .surface-backdrop[data-surface-dismiss]         mountSheet 擁有
└─ section#profile-completion-sheet.surface        mountSheet 擁有
   ├─ .surface__head                               React 內容
   ├─ .profile-return-context（條件）              React 內容
   ├─ .form-hint（gateHint，條件）                 React 內容
   ├─ .profile-avatar-preview[data-profile-avatar] React 內容（內含共用 <Avatar/>）
   └─ form.profile-form                            React 內容
```

`createRoot(mounted.surface)` 每個 mount element 只呼叫一次；初次 render 以 `flushSync`
commit，所以 factory 返回前 head／avatar／表單／球場清單／status／error／submit 都已在 DOM。

`mountSurface` 建殼時 content 尚空，因此它當下綁不到 `[data-surface-close]`。React 端保留該
attribute，click handler 只呼叫 adapter 傳入的 `mounted.close()`；真正的 closed guard、stack
remove、Escape listener remove、isolation release、`onClose({ reason })` 與 focus restore 仍全在
`mountSheet` handle。

handle 不擴張，只轉送原本就存在的方法：

```ts
export interface ProfileCompletionContentContract {
  setCourts(courts: ProfileCompletionCourt[], options?: { ready?: boolean }): void;
}
```

```js
const setCourts = (nextCourts, { ready = true } = {}) => {
  content.setCourts(nextCourts, { ready });
};
return { ...mounted, setCourts };
```

adapter 的 `setCourts` 預設值 `{ ready = true } = {}` 與 HEAD 逐字相同；content 端以
`flushSync` 包住 imperative 呼叫，方法返回時 DOM 已更新。

### 時序凍結

HEAD 是「`mountSheet` 產出空的球場容器 → 同步呼叫一次 `setCourts(courts, { ready: courtsReady })`
→ 返回 handle」。React 版把該次呼叫的結果直接算進**初次 render 的 state**（`courts`／`courtsReady`
從 props 取，`selectedCourts` 初值 `new Set(initialSelectedCourts)`），因此 factory 返回時的可觀察
DOM 與 HEAD 相同。等價論證：HEAD 第一次呼叫 `selectedCourtCheckboxValues(courtsContainer, selectedCourts)`
時容器是空的 → `selected.size === 0` → 回傳 `new Set(selectedCourts)`，正是 React 的初值。

## 3. `setCourts` 對映表

React state 四份：`courts`、`courtsReady`、`selectedCourts`（Set）、`generation`（int）。

| 舊 imperative 寫入 | React state／render | 凍結結果 |
| --- | --- | --- |
| `updateCourtCheckboxes(container, …)` 開頭 `if (!container) return;` | `if (compactCreateGate) return;` | compact create gate 下沒有球場容器，`setCourts` 仍是 no-op |
| `selected: selectedCourtCheckboxValues(courtsContainer, selectedCourts)`（re-render **前**讀 live 勾選） | `setSelectedCourts(runtime().selectedCourtCheckboxValues(courtsContainerRef.current, initialSelectedCourts))`，同樣在 `setCourts()` 之前 | 判準函式**同一份**，沒有在 TSX 複製 |
| `const nextCourts = taipeiCourts(courts)` | `profileCourtOptionsPresentation()` 內部呼叫同一個 `taipeiCourts` | 新北市球場永遠不進 picker |
| `selected instanceof Set ? selected : new Set(selected ?? [])` | presentation 內同一行 | 傳非 Set 時語意不變 |
| `isChecked = selectedValues.has(String(court.id)) \|\| selectedValues.has(court.name)` | presentation 產出 `option.checked` | id／舊資料 name 雙重比對不變 |
| `container.innerHTML = ready && nextCourts.length ? … : ""` | `options: ready && nextCourts.length ? … : []` | 未就緒或無台北球場時容器完全空 |
| `status.hidden = ready && nextCourts.length > 0` | `hidden={courtOptions.statusHidden}` | `false` 時 React 不產生屬性，與 `el.hidden = false` 移除屬性一致 |
| `status.textContent = !ready ? "正在載入台北市球場…" : nextCourts.length ? "" : "目前沒有可選的台北市球場。"` | `{courtOptions.statusText}`，空字串不產生 text node | 逐字三態文案不變 |
| `innerHTML` 整段置換 → 倖存球場的 DOM checked 也被清掉 | `key={`${generation}:${option.id}`}`，`setCourts` 每次 `generation + 1` | 見下方 generation key |
| `{ ready = true } = {}` | adapter 原樣轉送，content 端 `Boolean(ready)` | 只用真假值，`Boolean()` 等價 |

### `selectedCourtCheckboxValues` 的「不丟草稿」語意（派工單要求論證）

HEAD：

```js
function selectedCourtCheckboxValues(container, fallback = new Set()) {
  const selected = new Set(
    [...(container?.querySelectorAll("input[name='profile-courts']:checked") ?? [])].map((input) => input.value)
  );
  return selected.size ? selected : new Set(fallback);
}
```

三條語意都必須保住，本批一條都沒改寫：

1. **在 re-render 前 capture**：HEAD 是在 `updateCourtCheckboxes` 置換 innerHTML 之前把參數算好；
   React 版在 `useImperativeHandle` 的 `setCourts` 裡，於 `setCourts(nextCourts)` **之前**呼叫，
   讀的是 `courtsContainerRef.current`，即當下仍在 DOM 的舊節點。三個 `setState` 都在同一次
   `flushSync` 批次內，React 直到 commit 才動 DOM，所以讀到的一定是舊值。
2. **fallback 是「開局時的 profile.courts」，不是「上一次 capture 的結果」**：HEAD 的 fallback
   參數永遠是 factory 頂端算出的 `selectedCourts`；React 版傳的也是同一顆
   `initialSelectedCourts`（adapter 直接把 `selectedCourts` 交給 content，未複製、未累積）。
   因此「使用者把所有勾選取消 → 下一次 setCourts 會把 profile 原本的球場勾回來」這個 HEAD 行為
   被完整保留（probe 案例 `courts-hydrate-unchecked-falls-back-to-profile` 逐屬性為證）。
3. **判準本體不搬家**：函式仍住在 `sessionViews.js:2191`，只是多了一個 frozen runtime 出口。

### generation key：重現「innerHTML 置換清掉已勾選 checkbox」

若只用 `court.id` 當 key，倖存的球場節點會保留使用者的 DOM `checked` 狀態，
`selectedCourtCheckboxValues` 的 fallback 規則（上面第 2 點）就再也觸發不到——這是可觀察差異。
折入 refresh 世代後，每次 `setCourts` 都會重建全部 option 節點，與 innerHTML 置換等價：

```tsx
<label key={`${generation}:${option.id}`}>
```

容器 `[data-profile-courts]`、status `<p>`、error `<p>`、submit 按鈕本身**不**帶 generation，節點
identity 穩定——這是 §4 `runAsyncAction` 的 `rerendered()` 判準與 uncontrolled 草稿能成立的前提。

## 4. submit 非同步狀態機對映表

本批沿用批 7（Create／Edit 表單）的模式：**`runAsyncAction` 與所有驗證都留在 legacy**，React 只
把三個 DOM 節點交出來。

```tsx
const submitForm = (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  if (!errorRef.current || !formRef.current || !submitRef.current) return;
  void onSubmit({ error: errorRef.current, form: formRef.current, submit: submitRef.current });
};
```

| 舊 imperative 步驟 | 本批位置 | 凍結結果 |
| --- | --- | --- |
| `form.addEventListener("submit", …)` ＋ `event.preventDefault()` | React `onSubmit` 內 `event.preventDefault()` | 順序相同：先 preventDefault，再判 `saving` |
| `if (saving) return;` | adapter `onSubmit` 第一行（`saving` 仍是 factory closure 的 `let`） | 送出期間重複提交仍被擋 |
| `profileFormValue(form, profile, selectedCourts)` | adapter，讀 React 交出的 `form` 節點 | 讀 DOM 的那一行沒搬、沒複製 |
| `validateProfileForm(nextProfile, requiredGate, intent)` | adapter | NTRP 範圍／小數位／gate 判準零複製 |
| `error.hidden = false; error.textContent = message; return;` | adapter，同順序 | 驗證失敗不進 pending、不呼叫 `onSave` |
| `saving = true;` ＋ `runAsyncAction({ root: mounted.root, … })` | adapter，逐字相同的參數物件 | `root` 仍是 `#sheet-root`（不是 surface，理由同批 8.3 §15.4） |
| `controls: [submit]` → `control.disabled = true/false` | React 不把 `disabled` 當 prop，故 commit 時不會覆寫 | `runAsyncAction` 的 unlock／restore 邏輯照舊 |
| `error` 的 `hidden`／`textContent` 由 `runAsyncAction` 直接改 | React 的 `<p … hidden ref={errorRef} />` prop 值恆為 `true`、無 children | prop 值不變 → React re-render 時不 patch 該屬性；`setCourts` 重繪不會把錯誤訊息抹掉 |
| `callback` 內 `onSave` → `saved = true` → `mounted.close({ reason:"complete" })` → `onSaved(savedProfile ?? nextProfile)` | adapter 逐字相同 | close 在 `onSaved` 之前的順序不變 |
| `errorMessage: "個人檔案暫時無法儲存。"` | adapter | fallback 文案不變 |
| `onFinally: ({ controlsRestored }) => { if (controlsRestored) saving = false; }` | adapter | 只有真的解鎖控制項才放行下一次提交 |

probe 案例 `submit-nickname-validation-error`、`submit-gate-error-directory`、
`submit-save-failure-error-and-restore` 三種錯誤態的 DOM（含 `[data-profile-error]` 的
`hidden` 屬性與 hiddenProp、submit 的 `disabledProp`）與 HEAD 逐屬性一致。

## 5. gate 判準單一來源清單（TSX 零複製）

| 判準 | 位置（working tree） | TSX 有沒有複製 |
| --- | --- | --- |
| `profileGateForIntent(intent)` | `src/sessionViews.js:2243` | 否；adapter 呼叫後只把布林／字串結果當 prop |
| `profileGateHint(gate, intent)` | `src/sessionViews.js:2249` | 否；adapter 算好 `gateHintText` 傳入 |
| `validateProfileForm(profile, gate, intent)` | `src/sessionViews.js:2261` | 否；只在 adapter 的 `onSubmit` 呼叫 |
| `validProfileNtrp(ntrp)` | `src/profile.js`（本批零修改） | 否；adapter 算 `needsNtrp`，TSX 只收 `showNtrpField` 布林 |
| `profileFormValue(form, …)` / `selectedValues(form, name)` | `src/sessionViews.js:2226`／`:2222` | 否 |
| `compactCreateGate = intent?.action === "create"` | `src/sessionViews.js:2301` | 否；TSX 只收布林 prop |
| `needsNickname` / `needsNtrp` | `src/sessionViews.js:2302-2303` | 否；轉成 `showNicknameField`／`showNtrpField` |
| `standalone = mode === "standalone"` | `src/sessionViews.js:2295` | 否；TSX 只收布林，用它切三段文案 |
| `returnSession && !standalone` 的顯示條件 | `src/sessionViews.js:2353-2356` | 否；adapter 算好 `returnContextText`，空字串＝不畫 |
| `gateHint && !standalone` 的顯示條件 | `src/sessionViews.js:2320` | 否；adapter 算好 `gateHintText` |
| `taipeiCourts()`（台北市限定） | `src/sessionViews.js:2186`，經 `profileCourtOptionsPresentation` | 否 |
| 球場勾選比對 id／name 雙軌 | `src/sessionViews.js:2205` presentation | 否 |
| 「不丟草稿」的 live capture | `src/sessionViews.js:2191` `selectedCourtCheckboxValues` | 否；TSX 只呼叫 |
| `runAsyncAction` 的 disable／rerender／restore | `src/sessionViews.js:738` | 否 |
| avatar 的 `safeGoogleAvatarUrl`／`avatarInitial`／`showAvatarFallback` | `src/sessionViews.js:74/79/89`，經 `avatarRuntime` | 否；共用 `Avatar` lazy resolve |

TSX 內唯一新增的「判斷」是三處純文案三元式（eyebrow／標題／submit 文字＋NTRP label），
它們是 HEAD 模板字串裡原本就寫在 view 層的同一組三元式，逐字搬過來，不是新判準。

## 6. avatar rider：helper 去留清單

### 開工 grep（HEAD ground truth，逐字）

```text
$ git show HEAD:src/sessionViews.js | grep -nE "avatarMarkup|wireAvatarFallbacks|updateCourtCheckboxes|selectedCourtCheckboxValues"
83:function avatarMarkup({ avatarUrl = "", nickname = "", size = "" } = {}) {
98:function wireAvatarFallbacks(root) {
126:// court.name,雙重比對沿用 updateCourtCheckboxes(既有個人檔案表單邏輯)同一寫法,
2211:function selectedCourtCheckboxValues(container, fallback = new Set()) {
2219:function updateCourtCheckboxes(container, status, courts, { ready = true, selected = new Set() } = {}) {
2333:      <div class="profile-avatar-preview" data-profile-avatar>${avatarMarkup({ avatarUrl, nickname: profile.nick })}<p>使用 Google 頭像，無法自訂</p></div>
2373:  wireAvatarFallbacks(mounted.root);
2379:    updateCourtCheckboxes(courtsContainer, courtsStatus, nextCourts, {
2381:      selected: selectedCourtCheckboxValues(courtsContainer, selectedCourts),
```

```text
$ git show HEAD:src/pages/MePage.tsx | grep -nE "mePageRuntime\.(avatarInitial|safeGoogleAvatarUrl|showAvatarFallback)"
127:  const safeUrl = mePageRuntime.safeGoogleAvatarUrl(avatarUrl);
135:          onError={(event) => mePageRuntime.showAvatarFallback(event.currentTarget)}
139:        {mePageRuntime.avatarInitial(nickname)}
$ git show HEAD:src/sheets/SessionDetailSheet.tsx | grep -nE "sessionDetailSheetRuntime\.(avatarInitial|safeGoogleAvatarUrl|showAvatarFallback)"
404:          {sessionDetailSheetRuntime.avatarInitial(session.hostNickname)}
447:  const safeUrl = sessionDetailSheetRuntime.safeGoogleAvatarUrl(participant.avatarUrl);
455:          onError={(event) => sessionDetailSheetRuntime.showAvatarFallback(event.currentTarget)}
459:        {sessionDetailSheetRuntime.avatarInitial(participant.nickname)}
```

### 去留判斷

| symbol | 本批後 caller | 處置 |
| --- | --- | --- |
| `avatarMarkup`（字串版） | 0 | **退役** |
| `wireAvatarFallbacks` | 0 | **退役** |
| `updateCourtCheckboxes` | 0 | **退役**，由 `profileCourtOptionsPresentation` 取代 |
| `mePageRuntime.avatarInitial` | 0 | 退役（見 §16 偏離 1） |
| `mePageRuntime.safeGoogleAvatarUrl` | 0 | 退役（同上） |
| `mePageRuntime.showAvatarFallback` | 0 | 退役（同上） |
| `sessionDetailSheetRuntime.safeGoogleAvatarUrl` | 0 | 退役（同上） |
| `sessionDetailSheetRuntime.showAvatarFallback` | 0 | 退役（同上） |
| `sessionDetailSheetRuntime.avatarInitial` | 1（`SessionDetailSheet.tsx:405` 的 `.host-row__avatar`，不是 `.player-avatar`） | **保留** |
| `selectedCourtCheckboxValues` | 1（新 `profileCompletionSheetRuntime`） | 保留 |
| `taipeiCourts` | `sessionFormSheetRuntime` ＋ `profileCourtOptionsPresentation` | 保留 |
| `avatarInitial`／`safeGoogleAvatarUrl`／`showAvatarFallback` 本體 | `avatarRuntime`（＋`avatarInitial` 的 detail host row） | 保留 |
| `esc` | 大量既有 markup | 保留 |

### 退役後 executable reverse grep（逐字）

```text
$ rg -n "avatarMarkup|wireAvatarFallbacks|updateCourtCheckboxes" src scripts supabase
src/sessionViews.js:2208: * `updateCourtCheckboxes()` used to encode inside its innerHTML string.
src/sheets/ProfileCompletionSheet.tsx:122:        // and updateCourtCheckboxes returned before touching anything.
exit=0
```

僅剩兩條**過去式註解**（說明新 presentation／no-op guard 對映的是哪一段舊碼），非 executable
caller。`avatarMarkup` 與 `wireAvatarFallbacks` 在 `src`／`scripts`／`supabase` 全數歸零。

```text
$ rg -n "PlayerAvatar" src tests scripts supabase
exit=1 (no matches)
```

```text
$ rg -n "mePageRuntime\.(avatarInitial|safeGoogleAvatarUrl|showAvatarFallback)" src tests
exit=1 (no matches)
$ rg -n "sessionDetailSheetRuntime\.(safeGoogleAvatarUrl|showAvatarFallback)" src tests
exit=1 (no matches)
```

全 repo（排除 `node_modules`、`dist`、`docs/migration-reports/**`）只剩 PM 計劃檔的兩條規劃敘述：

```text
./docs/frontend-migration-plan-2026-08-18.md:224:  avatarMarkup 留待批 8.4。probe serializer 升級為逐 text node 比對（抓到 JSX 複合文字拆分
./docs/frontend-migration-plan-2026-08-18.md:231:  DOM 與共用 Avatar 一致——批 8.4 退役 avatarMarkup 字串版時一併改用共用版。
```

該檔屬 PM 維護範圍，本批未修改（見 §16 偏離 4）。

### 新／改 frozen runtime

```js
export const avatarRuntime = Object.freeze({ avatarInitial, safeGoogleAvatarUrl, showAvatarFallback }); // 不變
export const profileCompletionSheetRuntime = Object.freeze({ profileCourtOptionsPresentation, selectedCourtCheckboxValues }); // 新增
```

`Avatar.tsx` 沿用批 8.3 已驗證的 lazy runtime resolve（`function runtime() { return avatarRuntime as …; }`），
`ProfileCompletionSheet.tsx` 同樣做法，避免 `sessionViews.js` eager glob → TSX → `sessionViews.js`
這條 circular edge 在初始化期 TDZ。

### 共用 `Avatar` 的三個 size 呼叫點（本批後）

```text
src/sheets/SessionDetailSheet.tsx:478  <Avatar avatarUrl={participant.avatarUrl} nickname={participant.nickname} />   size ""  (40px)
src/sheets/ProfileCompletionSheet.tsx:163 <Avatar avatarUrl={avatarUrl} nickname={nickname} />                        size ""  (40px)
src/sheets/PlayerDirectorySheet.tsx:76 <Avatar nickname={player.nickname} size="md" />                                44px
src/sheets/PlayerCardSheet.tsx:238     <Avatar nickname={player.nickname} size="lg" />                                52px
src/pages/MePage.tsx:162               <Avatar avatarUrl={avatarUrl} nickname={nickname} size="lg" />                 52px
```

## 7. HEAD／current DOM 逐屬性 probe

以 `HEAD=133e47f8ffb3e162d279e80670e062eab48c4825` 建獨立 temp worktree（`cp -al` 硬連結
`node_modules` 後刪掉其 `.vite`、相同 `.env.local`），HEAD 與工作樹**依序**各啟一個 Vite
（5281／5282，不並行），probe 對目標容器每個 element 比較：

- `tag`
- 排序後完整 `attrs`
- **非純空白 text node 的逐字切分**（`meaningfulTextNodes`，批 8.3 的新 serializer）
- 只串接非空白 text node 的 `text`（見 §7.1）
- 非空白 child 交錯順序 `childOrder` 與 children 陣列長度／內容
- DOM **property**：`hiddenProp`、`checkedProp`、`valueProp`、`defaultCheckedProp`、
  `disabledProp`、`<img>` 的 `src` 屬性

fixture 刻意帶 `<img id="x-inject">&"'` 注入字串（球場名、暱稱、returnSession 球場名、
join preview 暱稱），同時驗 escape。24 個案例：

```json
{
  "cases": [
    "gate-default-no-intent",
    "gate-join-with-return-session",
    "gate-create-compact-empty-profile",
    "gate-create-compact-nickname-filled",
    "gate-create-compact-ntrp-filled",
    "gate-players",
    "gate-presence",
    "gate-directory",
    "standalone-suppresses-hint-and-return",
    "courts-loading",
    "courts-empty-taipei-catalogue",
    "courts-hydrate-preserves-draft",
    "courts-hydrate-keeps-checked-court",
    "courts-hydrate-unchecked-falls-back-to-profile",
    "courts-hydrate-noop-under-compact-create-gate",
    "submit-nickname-validation-error",
    "submit-gate-error-directory",
    "submit-save-failure-error-and-restore",
    "avatar-non-google-url-falls-back",
    "avatar-image-error-reveals-fallback",
    "rider-me-page-avatar-lg",
    "rider-me-page-avatar-lg-fallback",
    "rider-session-detail-join-preview-avatar",
    "rider-session-detail-join-preview-avatar-error"
  ],
  "matched": 24,
  "headConsoleErrors": [],
  "currentConsoleErrors": [],
  "headPageErrors": [],
  "currentPageErrors": [],
  "mismatchCount": 0,
  "mismatches": [],
  "whitespaceOnlyTextNodes": {
    "headBlankTextNodes": 470,
    "currentBlankTextNodes": 93,
    "nodesWithBlankDelta": 80
  }
}
```

派工單要求的涵蓋逐項對照：

| 派工單要求 | 案例 |
| --- | --- |
| gate 模式，含至少兩種 intent gateHint 變化 | `gate-join-with-return-session`（加入球局）、`gate-create-compact-*`（開球局）、`gate-players`（在線球友）、`gate-presence`（在線設定）、`gate-directory`（球友目錄）＝五種 gateHint |
| standalone 模式 | `standalone-suppresses-hint-and-return`（同時驗 hint 與 returnSession 兩段都被抑制） |
| 球場目錄 loading→ready 的 `setCourts`（含 draft 勾選保留） | `courts-loading` ＋ `courts-hydrate-preserves-draft`（loading 時填暱稱、勾「單打」後 `setCourts`）＋ `courts-hydrate-keeps-checked-court`（勾 court-8 後刷新仍勾）＋ `courts-hydrate-unchecked-falls-back-to-profile`（全取消後刷新落回 profile.courts）＋ `courts-hydrate-noop-under-compact-create-gate` |
| submit 錯誤態 | `submit-nickname-validation-error`、`submit-gate-error-directory`、`submit-save-failure-error-and-restore` |
| MePage avatar 段（rider 零變更） | `rider-me-page-avatar-lg`、`rider-me-page-avatar-lg-fallback`（target `#me-root`） |
| SessionDetailSheet avatar 段（rider 零變更） | `rider-session-detail-join-preview-avatar`、`rider-session-detail-join-preview-avatar-error` |

### 7.1 serializer 的一處必要修正

第一輪 probe 出現 100 條 mismatch，**全部**是 `text` 欄位，且 `attrs`／`meaningfulTextNodes`／
`childOrder`／`childCount`／property 六類**零** mismatch：

```text
mismatchCount: 100
nonText mismatches: []
```

原因是 `text` 原本用 `node.textContent.replace(/\s+/g," ")`：HEAD 的 innerHTML 縮排會在文字之間
留下一個空格，React 沒有。這是 serializer 自己造出來的假差異（不是產品差異）。修法是把 `text`
改成「只串接非空白 descendant text node」——與 `meaningfulTextNodes` 同一判準，只是攤平成一條
字串當交叉檢查。修正後兩棵樹重跑，`mismatchCount: 0`。

### 7.2 唯一剩餘差異：純空白 text node

HEAD 用 `innerHTML` 字串模板，換行與縮排留下 470 個純空白 text node；React 產出 93 個（全部來自
球場選項 label 內 `<input>` 與 `<span>` 之間刻意保留的 `{" "}`，以及 `mountSurface` 自己的殼）。
有 delta 的容器只有四種簽名（實算，非手數）：

```text
div.surface__head                                       head=60 current=0 nodes=20
form.profile-form                                       head=185 current=0 nodes=20
section.surface.surface--sheet.profile-sheet#profile-completion-sheet  head=90 current=0 nodes=20
span.player-avatar                                      head=42 current=0 nodes=20
```

不可觀察的論證：

- `src/session.css:345` `.surface__head { display: flex; }` — flex 規範明定純空白子字串不產生 item。
- `src/session.css:446-447` `.profile-form { display: grid; }` — 同上。
- `src/session.css:1022` `.player-avatar { display: inline-grid; }` — 同上。
- `section.surface`（`src/session.css:430`）是預設 `display: block`，其全部子節點都是 block-level
  box：`div.surface__head`、`p.profile-return-context`、`p.form-hint`、
  `div.profile-avatar-preview`（`display: flex`，仍是 block-level box）、
  `form.profile-form`（`display: grid`，同）。block-level box 之間只含可摺疊空白的匿名 inline box
  不產生 render box。

blank 數**相同**（因此不算 delta）的容器：`div#sheet-root`（44／44，`mountSurface` 共用殼）、
37 個球場選項 `label`（37／37，`{" "}`）、`label.court-subscribe-all`、
`label.presence-settings__greeting`、`p.host-row__ntrp`、`section#session-sheet`——後四者都在
本批未動的 React 面，兩側自然一致。

### 7.3 rider 零變更的直接證據

`rider-me-page-avatar-lg`、`rider-me-page-avatar-lg-fallback`、
`rider-session-detail-join-preview-avatar`、`rider-session-detail-join-preview-avatar-error`
四個案例在**所有**比較欄位（含 `blankTextNodes`）都是零差異——`#me-root` 與 `#sheet-root`
子樹沒有出現在 §7.2 的 delta 清單裡。這證明刪私有 `PlayerAvatar`、改用共用 `Avatar` 之後，
兩檔的 DOM 輸出（class、`data-player-avatar`、`data-avatar-fallback`、`aria-hidden`、`hidden`、
`referrerpolicy`、`alt`、`src`、字首 fallback 文字）與 HEAD 位元相同。

## 8. React 接管 canary：兩發，各自紅 → 綠

canary 前 SHA：

```text
7c8a37763705ec1d770092e37225c797f7616ef6f30262e47f5164cc80457e14  src/sessionViews.js
9a4fa10fceb0d26ff0217197a6e9482f8fd6831a74a51d29d60778f0351b152e  src/sheets/ProfileCompletionSheet.tsx
203fd20031662d821714158d6fedb8775d55408273097bc82307a46c51eef9b9  src/components/Avatar.tsx
8764a5620160ccc9aa2558e49a1d08663e04a0109106f6b6e7503433d861fd2e  src/pages/MePage.tsx
bf783d9c4aa30bdab0a56e732ff5270ef03e7d2500335a74709b556ac791d46f  src/sheets/SessionDetailSheet.tsx
```

### Canary A：profile sheet 的 React 內容確實在驅動表單

在 `mountProfileCompletionSheetContent` 的 `flushSync(render(<…/>))` 之後多插一行
`flushSync(() => reactRoot.render(null))`（並讓 contract 退化成 no-op）：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep "profile sheet saves selected home courts via checkboxes|delayed Taipei court options hydrate open profile and create forms without losing drafts"
```

紅燈逐字（`grep -E '✘|✓|Error:|Locator:|Expected|Received|failed|passed'`）：

```text
  ✘  1 [desktop-chromium] › tests/smoke.spec.js:4446:1 › delayed Taipei court options hydrate open profile and create forms without losing drafts (5.2s)
  ✘  2 [desktop-chromium] › tests/smoke.spec.js:4573:1 › profile sheet saves selected home courts via checkboxes (30.0s)
    Error: expect(locator).toContainText(expected) failed
    Locator: locator('#profile-completion-sheet').locator('[data-profile-courts-status]')
    Expected substring: "正在載入台北市球場…"
    Error: element(s) not found
    Error: locator.check: Test timeout of 30000ms exceeded.
  2 failed
```

逐字還原後同命令：

```text
  ✓  1 [desktop-chromium] › tests/smoke.spec.js:4446:1 › delayed Taipei court options hydrate open profile and create forms without losing drafts (1.1s)
  ✓  2 [desktop-chromium] › tests/smoke.spec.js:4573:1 › profile sheet saves selected home courts via checkboxes (261ms)
  2 passed (2.4s)
```

### Canary B：rider 的兩檔確實走共用 `Avatar`

注入點刻意選在**兩個 rider 呼叫點本身**（不是共用 `Avatar` 內部），否則球友目錄／球友卡也會
一起紅，證明不到「MePage 與 SessionDetailSheet 換過來了」（教訓同批 7／批 8.3 §16.2：
canary 注入點必須對準測試實際斷言的那一面）：

- `src/pages/MePage.tsx`：`size="lg"` → `size="md"`（D8 測試斷言 `.player-avatar--lg` 恰一個）
- `src/sheets/SessionDetailSheet.tsx`：`avatarUrl={participant.avatarUrl}` → `avatarUrl=""`
  （join preview 測試斷言主揪 `img` 的 `src`）

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep "D8 profile card, directory row, and player card render the avatar|authenticated pre-join roster renders host first with escaped names"
```

紅燈逐字：

```text
  ✘  1 [desktop-chromium] › tests/smoke.spec.js:1456:1 › authenticated pre-join roster renders host first with escaped names, NTRP fallback, and avatar fallback (5.2s)
  ✘  2 [desktop-chromium] › tests/smoke.spec.js:3216:1 › D8 profile card, directory row, and player card render the avatar+NTRP-brick structure and show em dash for unset NTRP (5.2s)
    Error: expect(locator).toHaveAttribute(expected) failed
    Locator: locator('#session-sheet [data-session-join-preview]').locator('[data-join-preview-person]').first().locator('img')
    Expected: "https://lh3.googleusercontent.com/a/stage-t45-host"
    Error: element(s) not found
    Error: expect(locator).toHaveCount(expected) failed
    Locator:  getByTestId('me-identity-card').locator('.player-avatar--lg')
    Expected: 1
    Received: 0
  2 failed
```

逐字還原後同命令：

```text
  ✓  1 [desktop-chromium] › tests/smoke.spec.js:1456:1 › authenticated pre-join roster renders host first with escaped names, NTRP fallback, and avatar fallback (244ms)
  ✓  2 [desktop-chromium] › tests/smoke.spec.js:3216:1 › D8 profile card, directory row, and player card render the avatar+NTRP-brick structure and show em dash for unset NTRP (1.2s)
  2 passed (2.3s)
```

兩發還原後 `shasum -a 256 -c` 逐字（各自跑一次，輸出相同）：

```text
src/sessionViews.js: OK
src/sheets/ProfileCompletionSheet.tsx: OK
src/components/Avatar.tsx: OK
src/pages/MePage.tsx: OK
src/sheets/SessionDetailSheet.tsx: OK
```

## 9. profile／avatar e2e `--repeat-each=3`

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep "profile completion previews the current Google avatar|the profile sheet keeps its gate framing|D8 profile card, directory row|profile and create sheets disclose public nickname|profile completion explains targeted gate|profile NTRP accepts 1.0 and 7.0|an existing one-decimal NTRP|delayed Taipei court options|a mock profile save preserves existing courts|profile sheet saves selected home courts|the profile sheet still offers all four|authenticated pre-join roster renders host first" \
  --repeat-each=3
```

逐字結尾：

```text
  ✓  25 [desktop-chromium] › tests/smoke.spec.js:1456:1 › authenticated pre-join roster renders host first with escaped names, NTRP fallback, and avatar fallback (254ms)
  ✓  26 [desktop-chromium] › tests/smoke.spec.js:1512:1 › profile completion previews the current Google avatar and explains that it cannot be customized (194ms)
  ✓  27 [desktop-chromium] › tests/smoke.spec.js:2463:1 › the profile sheet keeps its gate framing but drops it in standalone mode (203ms)
  ✓  28 [desktop-chromium] › tests/smoke.spec.js:3216:1 › D8 profile card, directory row, and player card render the avatar+NTRP-brick structure and show em dash for unset NTRP (630ms)
  ✓  29 [desktop-chromium] › tests/smoke.spec.js:3763:1 › profile and create sheets disclose public nickname use and retain a local-demo create failure (727ms)
  ✓  30 [desktop-chromium] › tests/smoke.spec.js:4027:1 › profile completion explains targeted gate requirements (251ms)
  ✓  31 [desktop-chromium] › tests/smoke.spec.js:4326:1 › an existing one-decimal NTRP can save a nickname-only edit unchanged (215ms)
  ✓  32 [desktop-chromium] › tests/smoke.spec.js:4361:1 › profile NTRP accepts 1.0 and 7.0 but rejects excess precision and out-of-range values (443ms)
  ✓  33 [desktop-chromium] › tests/smoke.spec.js:4446:1 › delayed Taipei court options hydrate open profile and create forms without losing drafts (808ms)
  ✓  34 [desktop-chromium] › tests/smoke.spec.js:4540:1 › a mock profile save preserves existing courts while the catalogue has no options (230ms)
  ✓  35 [desktop-chromium] › tests/smoke.spec.js:4573:1 › profile sheet saves selected home courts via checkboxes (235ms)
  ✓  36 [desktop-chromium] › tests/smoke.spec.js:5082:1 › the profile sheet still offers all four practice types (176ms)

  36 passed (15.2s)
```

（`a 390px profile sheet saves a nickname-only draft without horizontal overflow` 是
`mobile-chromium` 專屬 skip，已在 §13 的 `npm test` 全量 mobile 跑道覆蓋。）

## 10. Full-repo consumer sweep

### Production

```text
src/main.js:78            import openProfileCompletionSheet
src/main.js:421           唯一呼叫點 mounted = openProfileCompletionSheet({ … })
src/sessionController.js:1075  surfaceRegistry.get("profilePrompt")?.setCourts?.(state.courts, { ready: state.courtsReady })
```

以上呼叫點本批**零修改**（`git diff --name-only HEAD -- src/main.js src/sessionController.js` 無輸出）。

### 新內部 mount／runtime consumers

```text
src/sessionViews.js:65-68     browser-only eager glob ＋ mount symbol
src/sessionViews.js:2275-2278 profileCompletionSheetRuntime export
src/sessionViews.js:2293      mount 可用性 guard
src/sessionViews.js:2314      content mount call
src/sessionViews.js:2366      handle 轉送 setCourts
src/sheets/ProfileCompletionSheet.tsx:5,7,78,124,141,163,284  Avatar import／runtime import／lazy resolve／兩處 runtime 呼叫／Avatar 使用／mount export
src/pages/MePage.tsx:5,162                   Avatar import／size="lg" 使用
src/sheets/SessionDetailSheet.tsx:5,478      Avatar import／size 預設使用
```

### 既有 direct test consumers（零修改）

```text
tests/smoke.spec.js:1517-1518, 2471-2472, 3769-3770, 4033-4034, 4044-4045, 4056-4057,
                    4065-4066, 4332-4334, 4368-4370, 4411-4412, 4452-4453, 4546-4548,
                    4579-4581, 5087-5088   import ＋ direct openProfileCompletionSheet
tests/smoke.spec.js:4467, 4481, 4517       window.__delayedProfileSheet.setCourts(…)
tests/session.spec.js:319-325, 350-351, 367-370, 453-468, 1285, 1316-1319, 1356, 1400,
                    1455, 1852-1861, 2148-2152   #profile-completion-sheet 真實登入旅程
tests/session-mobile.spec.js:344-363        #profile-completion-sheet 390px 幾何斷言
```

### `scripts/**`、`supabase/**`

```text
$ rg -n "openProfileCompletionSheet|profileCompletionSheetRuntime|profileCourtOptionsPresentation|selectedCourtCheckboxValues|Avatar" scripts supabase
exit=1 (no matches)
```

## 11. 變更清單

- `src/sheets/ProfileCompletionSheet.tsx`（新增，298 lines）：sheet 內容、gate/standalone 兩語氣、
  三段條件欄位、球場 picker generation key、uncontrolled 草稿、imperative content contract。
- `src/sessionViews.js`（修改，+88 / −132）：mount adapter、`profileCompletionSheetRuntime`、
  `profileCourtOptionsPresentation`；移除 profile sheet 的整段 HTML 字串與
  `avatarMarkup`／`wireAvatarFallbacks`／`updateCourtCheckboxes` 三個零 caller helper，
  並從 `mePageRuntime`／`sessionDetailSheetRuntime` 移除五個歸零的 avatar 橋接欄位。
- `src/components/Avatar.tsx`（修改，+7 / −3）：只改 doc comment——把「批 8.4 之前 avatarMarkup
  仍活著」這句已失效的敘述換成完整的 size 對照與 D8 隱私註記。JSX 一行未動。
- `src/pages/MePage.tsx`（修改，+2 / −20）：刪私有 `PlayerAvatar`、import 共用 `Avatar`、
  呼叫點加 `size="lg"`。
- `src/sheets/SessionDetailSheet.tsx`（修改，+3 / −21）：刪私有 `PlayerAvatar`、import 共用
  `Avatar`、呼叫點改傳 `avatarUrl`／`nickname`；連帶移除已不需要的 `SessionJoinPreview` type import。
- `docs/migration-reports/batch-8.4.md`：本回報。

刻意未改：`main.js`、`sessionController.js`、`sheets.js`、`modalIsolation.js`、`profile.js`、
`map.js`、`pins.js`、`domainTypes.ts`、HTML、CSS、`.claude/rules/**`、`tests/**`、
`docs/frontend-migration-plan-2026-08-18.md`。

## 12. Bundle 前後對照

HEAD temp worktree 與工作樹用相同 `.env.local`／同版本 `node_modules` 各跑 `npm run build`；
所有數字本批重算（Vite 報表逐字抄錄，raw／gzip bytes 以 `node`＋`zlib.gzipSync` 實算）：

| | Batch 8.3 HEAD | Batch 8.4 | delta |
| --- | ---: | ---: | ---: |
| transformed modules | 111 | 112 | +1 |
| Vite main JS | 706.71 kB | 707.67 kB | +0.96 kB |
| Vite gzip | 199.85 kB | 200.12 kB | +0.27 kB |
| exact raw bytes | 706,709 | 707,668 | +959 |
| `zlib.gzipSync` bytes | 199,846 | 200,118 | +272 |

before：

```text
✓ 111 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-kuXN1cEP.js   706.71 kB │ gzip: 199.85 kB
✓ built in 922ms
```

after：

```text
✓ 112 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-CxqCkw3e.js   707.67 kB │ gzip: 200.12 kB
✓ built in 1.12s
```

新增一個 module（profile sheet content）；移除的 legacy markup 與三個字串 helper 抵銷大部分
JSX，無異常膨脹。CSS、HTML、小 analytics chunk 位元組不變（hash 亦不變）。既有 500 kB warning
類型與 before 相同。

## 13. SHA-256 對照

Batch 開始（＝HEAD 133e47f 的工作樹狀態，`git status` 乾淨）：

```text
20851b033675b770b653adf2ace4316d1a9357d20ad040cdfcdb2b397e319cff  src/sessionViews.js
36dda9c8f3f3feef40b3b8776d188e15aa595375118b2f978406a6d5f7b198cc  src/sheets.js
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
84c30035c4a21d691ffc9f564f5e533791fe3a5b7b9e5e6b98cf0f00e3d17515  src/components/Avatar.tsx
16fdc2ba5122acbec8d6a76bd81c526c9d7a5b8153686715c9a03386db362ee0  src/pages/MePage.tsx
14c1de353be32a92d5644164bbbaf81550d42c0df3a1e706d76a49bcb8a38095  src/sheets/SessionDetailSheet.tsx
24839cc13adcb4ce59c90c77326576c6fed4c07d338fbf6d834b0d60c7934b9e  src/main.js
383ff7a5e039e3a17c6a9f71ef7561e4dfa069e695a6ba1daa1d24036fd4714a  src/sessionController.js
3bef9149f70f295e28a01be40b8b1207e88b2913d58b53fb4690b1b1ddfa90a4  .claude/rules/react-migration.md
```

（temp worktree 的 `src/sessionViews.js` 亦為 `20851b03…`，確認 HEAD baseline 對齊。）

最終：

```text
ca82134dbcbec65be11455f4b5cb6bdf7f2cefc3ab7eb21229a3488697a4dd26  src/sessionViews.js
9a4fa10fceb0d26ff0217197a6e9482f8fd6831a74a51d29d60778f0351b152e  src/sheets/ProfileCompletionSheet.tsx
203fd20031662d821714158d6fedb8775d55408273097bc82307a46c51eef9b9  src/components/Avatar.tsx
8764a5620160ccc9aa2558e49a1d08663e04a0109106f6b6e7503433d861fd2e  src/pages/MePage.tsx
bf783d9c4aa30bdab0a56e732ff5270ef03e7d2500335a74709b556ac791d46f  src/sheets/SessionDetailSheet.tsx
36dda9c8f3f3feef40b3b8776d188e15aa595375118b2f978406a6d5f7b198cc  src/sheets.js
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
24839cc13adcb4ce59c90c77326576c6fed4c07d338fbf6d834b0d60c7934b9e  src/main.js
383ff7a5e039e3a17c6a9f71ef7561e4dfa069e695a6ba1daa1d24036fd4714a  src/sessionController.js
3bef9149f70f295e28a01be40b8b1207e88b2913d58b53fb4690b1b1ddfa90a4  .claude/rules/react-migration.md
```

`sheets.js`、`domainTypes.ts`、`main.js`、`sessionController.js`、`.claude/rules/react-migration.md`
的 SHA 開工／完工完全相同。

凍結檔 diff：

```text
$ git diff --name-only HEAD -- src/main.js src/sessionController.js src/sheets.js src/modalIsolation.js src/session.css src/style.css index.html tests/ src/domainTypes.ts src/profile.js .claude/rules/
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
# duration_ms 1817.150375
```

desktop＋mobile：

```text
  ✓  250 [mobile-chromium] › tests/smoke.spec.js:5183:1 › openFilterSheet mounts a dialog with six data-filter groups and closes on Escape (174ms)
  ✓  251 [mobile-chromium] › tests/smoke.spec.js:5220:1 › the filter sheet applies a district change immediately to the background drawer summary and keeps keyboard focus off body (183ms)
  ✓  252 [mobile-chromium] › tests/smoke.spec.js:5286:1 › closing and reopening the filter sheet three times does not stack delegated listeners on the shared sheet root (517ms)
  ✓  253 [mobile-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.4s)
  ✓  254 [mobile-chromium] › tests/smoke.spec.js:5359:1 › the filter sheet traps Tab focus between its own first and last controls (224ms)

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
# duration_ms 4431.098416
```

Supabase Chromium：

```text
  ✓  49 [supabase-chromium] › tests/session.spec.js:2036:1 › neutral counts stay hidden at zero and appear on all three surfaces once a session is played (3.2s)
  ✓  50 [supabase-chromium] › tests/session.spec.js:2156:1 › a brand-new account is subscribed to every active Taipei court when it first saves a profile (1.1s)
  ✓  51 [supabase-chromium] › tests/session.spec.js:2180:1 › N1 an existing zero-subscription account is never seeded by a later profile save (1.0s)
  ✓  52 [supabase-chromium] › tests/session.spec.js:2199:1 › N2 an account that explicitly cleared every court stays at zero across later profile saves (1.5s)
  ✓  53 [supabase-chromium] › tests/session.spec.js:2226:1 › N3 a failing subscription seed never fails the profile save (1.0s)

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
> tennis-partner-finder@0.1.0 build
> vite build

vite v6.4.3 building for production...
transforming...
✓ 112 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-CxqCkw3e.js   707.67 kB │ gzip: 200.12 kB
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
EXIT_prettier=0
EXIT_build=0
EXIT_git_diff_check=0
```

## 15. `git diff --stat`／工作樹

tracked stat（報告落檔前）：

```text
 src/components/Avatar.tsx         |  10 +-
 src/pages/MePage.tsx              |  22 +---
 src/sessionViews.js               | 220 +++++++++++++++-----------------------
 src/sheets/SessionDetailSheet.tsx |  24 +----
 4 files changed, 100 insertions(+), 176 deletions(-)
```

`--numstat` 逐檔：

```text
7	3	src/components/Avatar.tsx
2	20	src/pages/MePage.tsx
88	132	src/sessionViews.js
3	21	src/sheets/SessionDetailSheet.tsx
```

Git 不把 untracked 納入 `git diff --stat`；另有（`wc -l` 實算）：

```text
?? src/sheets/ProfileCompletionSheet.tsx  298 lines
?? docs/migration-reports/batch-8.4.md    本回報
```

行數變化（`wc -l` vs `git show HEAD:<path> | wc -l`）：

```text
src/sessionViews.js               3080 → 3036  (−44)
src/components/Avatar.tsx           47 →   51  (+4，純註解)
src/pages/MePage.tsx               832 →  814  (−18)
src/sheets/SessionDetailSheet.tsx  586 →  568  (−18)
```

`git status --porcelain` 逐字（報告落檔前）：

```text
 M src/components/Avatar.tsx
 M src/pages/MePage.tsx
 M src/sessionViews.js
 M src/sheets/SessionDetailSheet.tsx
?? src/sheets/ProfileCompletionSheet.tsx
```

最終不 stage、不 commit、不 push。臨時 HEAD worktree 已 `git worktree remove --force` ＋
`git worktree prune` 清除（`git worktree list` 已無 `head84`），probe 用的兩個 Vite server 已停
（`pgrep -fl vite | wc -l` = 0）。

## 16. 偏離與發現

1. **五個 frozen runtime 橋接欄位一併退役（派工單未列舉）**。派工單只點名 `avatarMarkup()` 與
   `wireAvatarFallbacks()`。rider 把兩檔改用共用 `Avatar` 後，`mePageRuntime` 的
   `avatarInitial`／`safeGoogleAvatarUrl`／`showAvatarFallback` 與 `sessionDetailSheetRuntime` 的
   `safeGoogleAvatarUrl`／`showAvatarFallback` 全部歸零 caller（§6 反向 grep 為證），
   依批 8.3 已被裁定接受的「遷移後零 caller 者一併退役」處理。函式本體不動，仍由
   `avatarRuntime` 出口；`sessionDetailSheetRuntime.avatarInitial` 因 `.host-row__avatar`
   仍有一個 caller 故保留。**這五個欄位屬 sessionViews.js 內部橋接，不是公開 API**，
   但仍是派工單未列舉的移除，明列於此交驗收方裁決。

2. **`updateCourtCheckboxes` 退役、由 `profileCourtOptionsPresentation` 取代（派工單未列舉）**。
   它是 profile sheet 的專用 innerHTML 產生器，caller 歸零。判準（台北市過濾、id/name 雙軌
   比對、三態 status 文案、未就緒即空容器）逐字搬進 presentation，仍住在 `sessionViews.js`，
   TSX 只消費結果。`selectedCourtCheckboxValues` **未**改寫、未搬家，只多一個 runtime 出口。

3. **`data-profile-avatar` 上的 `wireAvatarFallbacks` 換成 React `onError`**。HEAD 用
   `image.addEventListener("error", …)`；共用 `Avatar` 用 `onError={(e) => showAvatarFallback(e.currentTarget)}`。
   兩者的處理函式是同一個 `showAvatarFallback`，probe 案例 `avatar-image-error-reveals-fallback`
   逐屬性確認 error 之後 `img[hidden]` 與 `[data-avatar-fallback]` 的狀態與 HEAD 相同。
   差別只在 listener 註冊方式（React 委派 vs native），無可觀察差異。

4. **PM 計劃檔的兩條敘述已過時，本批未改**。
   `docs/frontend-migration-plan-2026-08-18.md:224` 與 `:231` 仍寫「avatarMarkup 留待批 8.4」／
   「批 8.4 退役 avatarMarkup 字串版時一併改用共用版」。兩件事本批都已完成，但該檔屬 PM 維護
   範圍（`docs/migration-reports/` 才是實作者落檔處），依「不靜默擴大 scope」交 PM 更新。

5. **`Avatar.tsx` 的 doc comment 是本批唯一非 rider 之外的既有檔案文字改動**。原註解寫
   「legacy 字串 `avatarMarkup()` stays alive for the profile-completion sheet until batch 8.4」，
   本批之後為錯誤陳述，必須改；順手把原本掛在 `avatarMarkup()` 上的批 D8 size 對照與
   「球友資料庫層永遠不帶 avatarUrl」隱私註記移進來，避免退役 helper 時把該資訊一起弄丟。
   JSX 與 props 一行未動（`git diff` 只有註解 hunk）。

6. **probe serializer 的 `text` 欄位有一個會製造假紅的定義問題**（§7.1）。批 8.3 引入
   `meaningfulTextNodes` 逐 text node 比對，但同時保留的 `text = textContent` 正規化欄位會把
   HEAD 的縮排空白算成差異——本批第一輪 100 條 mismatch 全出於此，其餘六類欄位皆零。建議後續批
   直接採用本批的定義：`text` 只串接非空白 descendant text node。（本批已用修正後的 serializer
   重跑兩棵樹，`mismatchCount: 0`。）

7. **`courts-hydrate-unchecked-falls-back-to-profile` 揭露一個容易被 React 化改掉的 HEAD 行為**。
   使用者把球場全部取消勾選後，下一次 `setCourts` 會因 `selected.size === 0` 落回 fallback，
   把 `profile.courts` 的球場**重新勾上**。若 React 版用 `sessionId` 類穩定 key ＋ `defaultChecked`，
   倖存節點會保住「已取消」狀態，這條行為就消失了。本批用 generation key 保住它並加了 probe 案例。
   這是既有行為的忠實保留，不是本批的設計主張——若 PM 認為它其實是 bug，請另開修復批，
   本批不擅自改語意。

8. **probe 基礎設施**：沿用批 8.3 §15.7 的做法直接 spawn `<tree>/node_modules/.bin/vite`
   （不經 npx wrapper）才 kill 得乾淨；HEAD worktree 的 `node_modules` 用 `cp -al` 硬連結後
   立刻 `rm -rf node_modules/.vite`，避免兩棵樹共用 Vite dep cache。跑 gate 前已確認
   `pgrep -fl vite | wc -l` = 0。

## 17. 驗收方註記（2026-08-19）

1. **§8 canary 取證順序斷點**（read-back report-audit lens CONCERN）：canary 前的
   sessionViews.js SHA 與 §13 最終 SHA 不同、§6 一處 grep 引文行號漂移 5 行——代表 canary
   與該 grep 是對較早版本取證，之後 sessionViews.js 又被編輯，報告未說明順序。裁決：**接受**。
   canary 注入點不在 sessionViews（三個 TSX 前後 SHA 一致）、七道 gate 對最終版跑；驗收方另以
   profile-court testid 注入對**最終工作樹**跑過獨立 canary 紅→綠（smoke:4446 draft hydrate
   測試），已補位。教訓：canary 後再動工作樹必須在報告明列時序並重錄 SHA。
2. **Avatar.tsx 註解假陳述修正**（read-back rider-quality lens CONCERN）：實作版註解
   「md/lg 呼叫點永遠只會落回字首 fallback」與我頁 lg 會渲染 `<img>` 的事實矛盾
   （tests/session.spec.js:1148 hosted 測試為證）。驗收方已改寫為區分「目錄 md／球友卡 lg
   （非本人，無 avatar 欄位）」與「我頁 lg／profile sheet（本人，auth metadata）」，
   並對修正後工作樹重跑完整 gate。allowlist 隱私宣稱本身經 read-back 覆核屬實。
3. 其餘三 lens（markup／gate-adapter／draft-semantics）20 項全 PASS；§16 偏離 1-3、5-8
   覆核成立，偏離 4（PM 檔過時敘述）由驗收方隨本批 docs commit 更新。
4. **test-local flaky 調查（驗收期間，root cause 與本批無關）**：session.spec.js:1166
   （notification court subscription）在驗收 gate 第二輪起反覆 timeout（紅率隨輪次升至 6/6）。
   二分實驗：只還原 MePage 仍 6/6 紅；**HEAD 全檔在同一髒 DB 下 5/6 紅**——root cause 是
   反覆執行 test:local 未 reset 造成的 DB 資料累積（actors／subscriptions 膨脹使 me 頁
   save-refresh 變慢，`check()` 撞 90s timeout），屬既有測試脆弱性。以
   `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test` 重置後同測試 6/6 綠（28.3s），
   最終完整 gate 於乾淨 DB 重跑全綠。教訓：(a) 對照組實驗必須控制共享可變 DB 狀態，
   否則「HEAD 綠／工作樹紅」會誤導歸因（本次早期 HEAD 3/3 綠即是乾淨 DB 假象）；
   (b) 長驗收流程中多輪 test:local 需留意累積，紅了先確認 DB 髒度再歸因程式。
5. **驗收操作失誤與恢復**：二分實驗的 `git checkout HEAD -- src/pages/MePage.tsx` 意外
   丟棄 rider 變更（stash 已 pop、無備份）。依本回報 §12 記載的最終 SHA 重放三處變更後
   `shasum` 驗證與原版 byte 級一致（8764a562…）。教訓：二分實驗前先 `git diff > 備份檔`，
   不可依賴已 pop 的 stash。
