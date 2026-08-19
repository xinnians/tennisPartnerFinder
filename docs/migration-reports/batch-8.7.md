# 批 8.7：mountDialog 系兩 surface 遷移 React（退出確認＋檢舉 dialog）

日期：2026-08-19（Asia/Taipei）

Base HEAD：`c349d33b8ebec1041bf05d8d24be4cb8554e9276`（`git log --oneline -1` = `c349d33 docs: 遷移計劃進度——批 8.6 完成,sheet 批壓軸收官,鏡像案例與 settle 教訓入檔`）

## 0. 防偽引用（batch-8.6.md「驗收方註記」節第 2 條第一句原文）

> 2. **獨立 canary（第五發，與 dev agent 四發皆不同角度）**：`data-chat-message-kind` 寫死
>    `"user"` → smoke `chat sheet escapes user bodies…` 的 `[data-chat-message-kind="system"]`
>    斷言紅（element not found）→ 還原後綠、`SessionChatSheet.tsx` SHA 逐字回復
>    `21217c7d…`。

本批直接沿用該節第 1 點裁決的兩條流程升級（幾何指紋前等 CSS 動畫 settle、被觀測面有 rAF
排程時等兩幀再取樣），並把「等 async 排空」延伸為兩輪 macrotask（§6）。

## 1. 結論

`mountDialog` 系的兩張 surface 已在公開簽名、參數預設值、回傳值與 close reason 語意零變更下，
把內容層遷到 strict TSX：

```text
openWithdrawSessionConfirmation({ onClose, onConfirm })              → mounted（無額外方法）
openReportDialog({ targetLabel = "這個項目", onClose, onSubmit })     → mounted（無額外方法）
```

`mountDialog`（＝`mountSurface(modalRoot())`）仍唯一擁有 `#modal-root`、backdrop、
`section.surface.surface--dialog`、focus trap、capture-phase Escape、surface stack、dismiss、
close、isolation 與 opener 焦點回復。React 只掛進 `mounted.surface` 的 child list。

**判斷邏輯零搬移**：`REPORT_REASONS`、radio 驗證（「請選擇檢舉原因。」）、兩處 submitting guard、
`runAsyncAction` 全套呼叫（`controls`／`error`／`errorMessage`／`onSuccess`／
`canRestoreControls`／`onFinally`）、`mounted.close({ reason: "complete" })` 成功路徑，
全部留在 `sessionViews.js` 的 factory 閉包，TSX 一條也沒複製。唯一新增的橋接是
`reportDialogRuntime`（`Object.freeze({ REPORT_REASONS })`），常數本體仍住 `sessionViews.js`。

**兩個元件皆零 React state、零 effect、零 imperative handle**，`render` 一生只呼叫一次
（§4 論證）。

`src/main.js`、`src/sessionController.js`、`src/sheets.js`、`src/domainTypes.ts`、
`src/session.css`、`index.html`、`tests/**`、`.claude/**`、`scripts/**`、`supabase/**` 全數零 diff
（`git diff --name-only HEAD -- …` 無輸出、exit 0，逐字見 §9）。
未 commit、未 stage、未 push；本批**未**執行 DB reset（七道 gate 一次全綠）。

批 8.x 的 surface 遷移到此收尾：`src/sessionViews.js` 內已無 `innerHTML` 字串 surface，
只剩 `src/sheets.js` 自身的 `openLoginModal`（觀察項，本批未碰）。

## 2. 變更清單

| 檔案 | 動作 | 數字（指令重算） |
| --- | --- | --- |
| `src/sessionViews.js` | 兩個 factory 的 `html` 改空殼＋掛 React；新增兩組 importer 與 `reportDialogRuntime` | `git diff --numstat` = **28 insertions / 28 deletions** |
| `src/sheets/WithdrawSessionConfirmationDialog.tsx` | 新增 | `wc -l` = **48** |
| `src/sheets/ReportDialog.tsx` | 新增 | `wc -l` = **68** |

```text
$ git diff --numstat
28	28	src/sessionViews.js

$ wc -l src/sheets/WithdrawSessionConfirmationDialog.tsx src/sheets/ReportDialog.tsx
      48 src/sheets/WithdrawSessionConfirmationDialog.tsx
      68 src/sheets/ReportDialog.tsx
     116 total

$ git status --porcelain
 M src/sessionViews.js
?? src/sheets/ReportDialog.tsx
?? src/sheets/WithdrawSessionConfirmationDialog.tsx
```

改動位置：

- `src/sessionViews.js:77-86`：兩組 `import.meta.glob` importer（副檔名明寫 `.tsx`）。
- `src/sessionViews.js:2050-2086`：`openWithdrawSessionConfirmation`。
- `src/sessionViews.js:2088-2090`：`REPORT_REASONS` 原地不動，其後新增
  `export const reportDialogRuntime = Object.freeze({ REPORT_REASONS });`
- `src/sessionViews.js:2092-2107`：`openReportDialog`。
- `src/sessionViews.js:2107-2146`：`form.addEventListener("submit", …)` 起的整段判斷**逐字未動**。

## 3. 殼／內容責任分界

```text
#modal-root                                                    mountDialog 擁有
├─ .surface-backdrop[data-surface-dismiss]                     mountDialog 擁有（click → close）
└─ section#withdraw-session-confirmation.surface.surface--dialog   mountDialog 擁有
   ├─ div.surface__head                                        React 內容
   │  ├─ div > p.surface__eyebrow ＋ h2                        React 內容
   │  └─ button.surface__close[data-surface-close]             React 內容（onClick → mounted.close()）
   ├─ p.surface__message                                       React 內容（常數文案）
   ├─ p.form-error[data-withdraw-error]                        React 內容（之後由 runAsyncAction 改）
   └─ div.session-detail__actions                              React 內容
      ├─ button.session-secondary[data-surface-close]「先不要」  React 內容（onClick → mounted.close()）
      └─ button.session-primary[data-confirm-withdraw]          React 內容（native click listener 留 factory）

#modal-root
└─ section#report-dialog.surface.surface--dialog                mountDialog 擁有
   ├─ div.surface__head（含 [data-surface-close] ×）            React 內容（onClick → mounted.close()）
   ├─ p.surface__copy                                          React 內容（targetLabel 文字節點）
   ├─ form.report-form[data-testid=report-form][novalidate]     React 內容（native submit listener 留 factory；
   │  │                                                          之後由 onSuccess 設 hidden）
   │  ├─ fieldset.form-fieldset > legend ＋ 四個 label>input    React 內容（radio uncontrolled）
   │  ├─ p.form-error[data-report-error]                       React 內容（之後由驗證分支／runAsyncAction 改）
   │  └─ button[data-testid=report-submit]                     React 內容（之後由 runAsyncAction 改 disabled）
   └─ p.surface__message[data-report-success]                   React 內容（之後由 onSuccess 設 hidden＋focus）
```

`id`、`label`、`onClose` 逐字不變；兩者都不帶 `className`（HEAD 也沒有），
`surface--dialog` 由 `mountDialog` 自己補。

## 4. 零 React state 設計論證（本批的核心主張）

兩個元件都是**純靜態 JSX**：無 `useState`、無 `useEffect`、無 `useImperativeHandle`、無
`forwardRef`，mount 函式回傳 `void`，`reactRoot.render(...)` 在 `flushSync` 內只被呼叫一次，
之後**沒有任何路徑會再觸發 re-render**（沒有 state setter、沒有新的 `render` 呼叫、
props 也不會再被送進來）。

因此批 8.5／8.6 反覆處理的「兩個 writer 搶同一屬性」風險在本批**結構上不存在**：不是
「React 宣告了常數 prop 所以 diff 為空」這種較弱的論證，而是「React 連 render 都不會再跑第二次」。
逐節點對照：

| 節點 | React 給的 prop | 之後誰寫 | 為何 React 不會覆寫 |
| --- | --- | --- | --- |
| `p[data-withdraw-error]` | `hidden`（字面 true）、無 children | `runAsyncAction` 的 `error.textContent`／`error.hidden` | 無 re-render 路徑 |
| `button[data-confirm-withdraw]` | 無 `disabled` prop | `runAsyncAction` 的 disable／restore | 同上；且未宣告的屬性本來就不進 diff |
| `form[data-testid=report-form]` | 無 `hidden` prop | `onSuccess` 的 `form.hidden = true` | 同上 |
| `p[data-report-error]` | `hidden`（字面 true）、無 children | 驗證分支的 `textContent`／`hidden`、`runAsyncAction` 的 clearError | 同上 |
| `p[data-report-success]` | `hidden`（字面 true）、children 為常數文案 | `onSuccess` 的 `hidden = false` 與 `focus()` | 同上 |
| `button[data-testid=report-submit]` | 無 `disabled` prop | `runAsyncAction` | 同上 |
| 四個 `input[name=report-reason]` | `type`／`name`／`value`，**無** `checked`／`defaultChecked`／`onChange` | 使用者互動、e2e 的 `.check()` | uncontrolled（React 對 radio 的 controlled 判定看 `checked` 而非 `value`），無 re-render |

radio 維持 uncontrolled 是必要的：factory 的
`form.querySelector("[name='report-reason']:checked")?.value` 直接讀 DOM，任何 React 端狀態化
都會多一個真實來源。probe 的 `checkedProp`／`checkedReason` 兩欄實測兩樹逐值相同（§5）。

節點 identity 全程穩定：兩個元件都沒有 `key`、沒有條件 render、沒有陣列以外的動態結構
（四個 radio 的 `key={reason}` 來自常數陣列，一生不變）。`runAsyncAction` 的
`rerendered()` 靠 `root.contains(node)` 判斷——內容永不重建，所以 `rerendered()` 恆為 `false`，
與 HEAD 的 `innerHTML` 字串版完全一致（HEAD 也從不重建）。

## 5. close reason 語意論證（派工單指定專節）

### 5.1 三顆 close 鈕：HEAD 走 listener、現在走 onClick，值域相同

HEAD 由 `mountSurface` 在建殼時掃 `[data-surface-close]` 綁 `close`；空殼下掃不到 React 節點，
因此三顆鈕（withdraw 的 ×、withdraw 的「先不要」、report 的 ×）改成 `onClick={onClose}`，
其中 `onClose = () => mounted.close()`。

等價性（批 8.1 已論證，本批逐字沿用）：HEAD 的 listener 收到的實參是 `MouseEvent`，而
`close` 的簽名是

```js
const close = ({ reason = "dismiss", restoreFocus = true } = {}) => { … }
```

解構 `MouseEvent` 取 `.reason`／`.restoreFocus` 都是 `undefined` → 兩個預設值生效，
與無參數的 `close()` 完全相同。**「先不要」是動作鈕不是 ×，但它在 HEAD 也只是掛在同一條
`[data-surface-close]` 掃描上的普通按鈕**——HEAD 沒有給它任何專屬 handler，所以它的 close
reason 在改動前後同為預設 `"dismiss"`。

### 5.2 `mounted.close({ reason: "complete" })` 未被搬動，且被 probe 直接觀測

withdraw 成功路徑的 `mounted.close({ reason: "complete" })` 留在 factory 的
`runAsyncAction.callback` 內，**一個字也沒動**（`src/sessionViews.js:2075`）。

caller 盤點（全庫 grep，`openWithdrawSessionConfirmation` ／ `openWithdrawConfirmation`）：

| 呼叫點 | 是否傳 `onClose` | 是否讀 `reason` |
| --- | --- | --- |
| `src/main.js:1510` `openWithdrawConfirmation: openWithdrawSessionConfirmation` | 只是接線，不加參數 | — |
| `src/sessionController.js:1756` `openWithdrawConfirmation({ onConfirm: … })` | **否**（吃 `onClose = () => {}` 預設） | 否 |
| `src/sessionController.js:1883` `openWithdrawConfirmation({ onConfirm: … })` | **否** | 否 |
| `tests/session-controller.test.js:278/1513/1548` | 用 fake，不經真 DOM | 否 |
| `tests/smoke.spec.js:1128/1172/1226/2878` | 只傳 `onConfirm` | 否 |

`openReportDialog` 這側：`src/sessionController.js:2056` 的 `onClose` 只做
`surfaceRegistry.release("reportDialog", dialog)`，**簽名裡沒有解構 `reason`**，因此
dismiss／complete 兩種 reason 對它同樣是 release。

即使無 production consumer，本批仍把 reason 當凍結面驗證：probe 把 `onClose` 收到的
`payload?.reason` 逐次記進 `closeReasons`，`withdraw-double-click-guard-then-resolve` 案例
兩樹皆得到

```text
closeReasons  ["replace", "complete"]     ← 前一案的 surface 被 replace、本案成功後 complete
dialogActions [["confirm"]]               ← 兩次 click 只進一次 onConfirm（submitting guard）
modalChildCount 0                         ← close 後殼已把 #modal-root 清空
```

`mismatchCount: 0` 涵蓋 `closeReasons` 欄，因此 `"complete"` 語意有實測而非只有論證。

### 5.3 close 之後不 unmount React root

`close()` 會執行 `root.innerHTML = ""`，React root 所在的 `mounted.surface` 連同內容一起被移除，
不呼叫 `reactRoot.unmount()`——與批 8.1–8.6 全庫慣例一致，本批不新增例外。

## 6. HEAD／current DOM 逐屬性 probe

以 `HEAD=c349d33` 建獨立 temp worktree（`cp -al` 硬連結 `node_modules` 後刪掉其 `.vite`、
相同 `.env.local`），HEAD 與工作樹**依序**各啟一個 Vite（5283／5284，不並行；直接 spawn
`<tree>/node_modules/.bin/vite`），probe 對 `#modal-root` 每個 element 比較：

- `tag`、排序後完整 `attrs`
- **非純空白 text node 的逐字切分**（`meaningfulTextNodes`，批 8.3 serializer）
- 只串接非空白 descendant text node 的 `text`（批 8.4 §7.1 定義）
- 非空白 child 交錯順序 `childOrder` 與 children 陣列長度
- DOM property：`hiddenProp`、`disabledProp`、`valueProp`、`defaultValueProp`
- **本批新增**：`checkedProp`、`nameProp`、`typeProp`、`noValidateProp`、
  `labelControl`（`label.control` 的 `value` 屬性＋tagName，直接驗 `getByLabel` 依賴的
  label→input 關聯）
- `document.activeElement` 指紋（tag／id／testid／屬性名集合／前 40 字文字）
- `onConfirm`／`onSubmit` 實收參數（`dialogActions`）、`onClose` 實收 `reason`（`closeReasons`）
- `modalChildCount`（close 後殼是否已清空）、`checkedReason`（`:checked` 讀值）
- `#modal-root` 內 `img`／`script` 元素數與 `window.__reportXss`（XSS 面）
- **幾何指紋**：每個 element 的 `getBoundingClientRect` 與
  `display`／`font`／`margin`／`padding`／`visibility`，desktop 1280×900 與 mobile 390×844 各一份

probe 在開 dialog 前把 `window.Date` 換成固定時點（`2099-08-01T00:00:00.000Z`）的子類、
開完立刻還原（批 8.5 §16.8 教訓）；Google Maps／Fonts 以 `context.route` stub；
輪詢 ready 用 `http://localhost:<port>/`（非 `127.0.0.1`，批 8.6 §16.9 教訓）；
取樣前先等兩幀（rAF settle，批 8.6 §16.10）再 `waitForTimeout(600)` 等 surface 動畫 settle
（批 8.6 §16 偏離 4）。**本批新增的 settle 需求**：`runAsyncAction` 是 async，
`disabled` 還原與 `onSuccess` 的 hidden 交換排在 microtask／後續 tick；每個互動 step 後排空
**兩輪 macrotask**，否則會量到「還在 in-flight」的中間態。

15 個案例 × 2 viewport：

```json
{
  "caseCount": 15,
  "viewports": ["desktop", "mobile"],
  "comparedKeys": 30,
  "geometryRowsCompared": 536,
  "geometryRowsMin": 0,
  "geometryRowsMax": 22,
  "headConsoleErrors": [],
  "currentConsoleErrors": [],
  "headPageErrors": [],
  "currentPageErrors": [],
  "mismatchCount": 0,
  "nonTextMismatchCount": 0,
  "geometryMismatchCount": 0,
  "mismatches": [],
  "whitespaceOnlyTextNodes": {
    "headBlankTextNodes": 368,
    "currentBlankTextNodes": 0,
    "nodesWithBlankDelta": 104
  }
}
```

掃描集非空（實算，非手數）：15 案例 × 2 viewport ＝ 30 個比較 key；
withdraw 案例每案 12 條幾何列、report 案例每案 22 條，總計 536 條。
**唯一 0 列的案例是 `withdraw-double-click-guard-then-resolve`**——它以成功關閉收尾，
`#modal-root` 已被殼清空，兩樹同為 0 列；該案的證據面改由 DOM 欄
（`closeReasons`／`dialogActions`／`modalChildCount`，見 §5.2）承擔，非空白遺漏。

案例涵蓋對照（派工單要求逐項）：

| 派工單要求 | 案例 |
| --- | --- |
| withdraw 初始態 | `withdraw-initial` |
| withdraw 驗證後錯誤態（runAsyncAction 失敗路徑） | `withdraw-error-after-rejected-confirm`（有 message）、`withdraw-error-after-rejected-confirm-no-message`（走 `errorMessage` 預設文案） |
| report 初始態（四 radio 未選） | `report-initial-default-label`（預設 `targetLabel`）、`report-initial-with-label` |
| report 未選送出錯誤態 | `report-validation-error-no-reason` |
| report 選中後成功態（form hidden＋success 顯示＋focus） | `report-success-hides-form-and-focuses-status` |
| targetLabel 含 HTML 特殊字元的轉義 | `report-escaped-target-label` |
| （加碼）in-flight disabled 兩側 | `withdraw-pending-disabled`、`report-pending-submit-disabled` |
| （加碼）submitting guard ＋ close reason | `withdraw-double-click-guard-then-resolve` |
| （加碼）失敗後 form 保留、submit 還原 | `report-failure-keeps-form-and-restores-submit` |
| （加碼）失敗→再成功的連續兩拍 | `report-failure-then-success` |
| （加碼）radio 勾選狀態（未送出） | `report-checked-radio-not-submitted` |
| （加碼）`String()` 語意（非字串 targetLabel） | `report-numeric-target-label`（`42`） |

關鍵觀測值兩樹逐字相同（從 probe JSON 直接抄錄，非手寫；以下列 desktop）：

```text
withdraw-initial
  active   button ×          err ["", hidden=true]      confirm ["確認退出", disabled=false]
withdraw-pending-disabled
  actions  [["confirm"]]     confirm disabled=true      err hidden=true
withdraw-double-click-guard-then-resolve
  actions  [["confirm"]]     closeReasons ["replace","complete"]   modalChildCount 0
withdraw-error-after-rejected-confirm
  err      ["退出失敗（探針）", hidden=false]           confirm disabled=false
withdraw-error-after-rejected-confirm-no-message
  err      ["退出球局暫時無法完成，請稍後再試。", hidden=false]
report-initial-default-label
  copy     "這個項目"
  form     "檢舉原因與實際球局不符不當行為疑似詐騙其他送出檢舉"
  ok       ["已送出檢舉，謝謝你的回報。", hidden=true]
report-escaped-target-label
  copy     "<img id=\"report-inject\" src=x onerror=\"window.__reportXss=1\">&\"'球場"
  img=0  script=0  xss=false
report-numeric-target-label
  copy     "42"
report-validation-error-no-reason
  err      ["請選擇檢舉原因。", hidden=false]           actions []（未進 onSubmit）
report-checked-radio-not-submitted
  checkedReason "疑似詐騙"
report-success-hides-form-and-focuses-status
  actions  [["submit","與實際球局不符"]]
  form hidden=true   ok hidden=false   submit disabled=true
  active   p[aria-live,class,data-report-success,role,tabindex]   ← focus 落在 success
report-failure-keeps-form-and-restores-submit
  err      ["暫時無法送出（探針）", hidden=false]   form hidden=false   submit disabled=false
report-failure-then-success
  actions  [["submit","其他"],["submit","不當行為"]]
  err      ["暫時無法送出（探針）", hidden=true]    ← clearError 只設 hidden 不清文字（既有行為）
  form hidden=true   ok hidden=false
report-pending-submit-disabled
  actions  [["submit","不當行為"]]   submit disabled=true

四個 radio（兩樹逐字相同）
  attrs ["name=report-reason","type=radio","value=與實際球局不符"]  value/defaultValue 同值  checked=false
  label childOrder ["input","#text:與實際球局不符"]   labelControl "與實際球局不符|INPUT"
form
  attrs ["class=report-form","data-testid=report-form","novalidate="]   noValidate=true
```

`labelControl` 欄實測 React 版的 `<label><input/>{reason}</label>` 與 HEAD 的
`<label><input .../>文字</label>` 產生**同一條** label→input 隱式關聯，且 label 的 `childOrder`
是 `["input", "#text:…"]`——input 與文字直接相鄰、中間**沒有多出空白 text node**
（派工單特別注意事項 1 已驗，非只論證）。

### 6.1 唯一剩餘差異：純空白 text node（幾何指紋實證不可觀察）

HEAD 用字串模板，換行與縮排留下 368 個純空白 text node；React 產出 0 個。
有 delta 的容器只有 5 種簽名（實算）：

```text
section.surface surface--dialog   head=140 current=0 nodes=28
div.surface__head                 head=84  current=0 nodes=28
div.session-detail__actions       head=24  current=0 nodes=8
form.report-form                  head=80  current=0 nodes=20
fieldset.form-fieldset            head=40  current=0 nodes=20
```

CSS 論證（逐條對應 `src/session.css`，本批零修改）：

- `.surface__head`：`:345` `display: flex`。
- `.session-detail__actions`：`:987` `display: flex`。
- `.report-form`：`:579` `display: grid`。
- `.form-fieldset`：`:466` `display: grid`。

這四類是 flex／grid，規範明定純空白子字串不產生 flex／grid item。

第五類 `section.surface.surface--dialog` **未宣告 `display`**（`:430-441` 的規則裡沒有
`display`，`:443` 的 `.surface--dialog` 也只設 `top`／`left`／`transform`）＝`block`，
走的是批 8.6 §8.1 的另一條分支：其子節點全是 block-level box——

- withdraw：`div.surface__head`（flex）、`p.surface__message`、`p.form-error`、
  `div.session-detail__actions`（flex）。
- report：`div.surface__head`（flex）、`p.surface__copy`、`form.report-form`（grid）、
  `p.surface__message`。

block-level box 之間只含可摺疊空白的匿名 inline box 不產生 render box。

**實證**（比 CSS 論證更強）：15 案例 × 2 viewport × 每案 12 或 22 個 element 的
`getBoundingClientRect` 與 `display`／`font`／`margin`／`padding`／`visibility` 共 **536 條**逐值比對，
`geometryMismatchCount: 0`。若那些空白 text node 真的產生 render box，同層 flex／grid 佈局會位移
下游元素——幾何零差異即證明不可觀察。

## 7. React 接管 canary：四發，各自紅 → 綠

canary 前 SHA（`2026-08-19 15:43:14 CST`）：

```text
179e00922c584eb038a466a19e59dcb1ca2d975f49d7e75e82e22fdeee692810  src/sheets/ReportDialog.tsx
b9eedaf5abfe1ad1a991202dcf78f2f98c36edc33ea9e53ad1774d9f747866a8  src/sheets/WithdrawSessionConfirmationDialog.tsx
8c1402c9e7dac98cbb579eb1726ecd0ee1027fbf557a011ebd12a9f8b8dd9f64  src/sessionViews.js
```

四發全部**先讀測試找斷言面再選注入點**：

### Canary A：React 內容確實在驅動 report dialog

`mountReportDialogContent` 的 `flushSync(render(<ReportDialog/>))` 之後多插一行
`flushSync(() => reactRoot.render(null))`：

```text
> await expect(dialog.getByTestId("report-form")).toBeVisible();
Error: element(s) not found
1 failed  smoke.spec.js:2743 report dialog requires a reason, preserves failures, and acknowledges a successful report
1 passed
```

還原後兩測試綠、`ReportDialog.tsx` SHA 逐字回復 `179e0092…`。

**附帶發現（觀察項）**：同批跑的 `smoke.spec.js:2780`（非抽屜 report dialog 焦點回復）在
canary A 下仍綠——它只斷言 `#report-dialog` 這個**殼**的可見性與焦點，不碰內容。既有覆蓋事實，
非本批引入，列觀察項不開批。

### Canary B：三顆 close 鈕的 React onClick 是真正的關閉路徑

移除 `WithdrawSessionConfirmationDialog.tsx` 中「先不要」鈕的 `onClick={onClose}`
（`data-surface-close` 屬性保留，模擬「以為殼還會綁」的錯誤）：

```text
> await expect(confirmation).toBeHidden();
Expected: hidden  Received: visible
  14 × locator resolved to <section role="dialog" … id="withdraw-session-confirmation">…</section>
2 failed  smoke.spec.js:1151 cancelling chat withdrawal…
          smoke.spec.js:1192 cancelling My Sessions withdrawal…
```

這一發直接證偽「空殼下 `[data-surface-close]` 還會被殼綁到」這個假設。
還原後兩測試綠、SHA 逐字回復 `b9eedaf5…`。

### Canary C：`REPORT_REASONS` 單一來源真的是 `sessionViews.js`

把 `src/sessionViews.js:2088` 的 `"其他"` 改成 `"其它"`（只動 factory 側常數，TSX 不動）：

```text
> await dialog.getByLabel("其他").check();
Error: locator.check: Test timeout of 30000ms exceeded.
  - waiting for locator('#report-dialog').getByLabel('其他')
1 failed  smoke.spec.js:2743
```

證明 TSX 渲染的四個選項確實經 `reportDialogRuntime` 讀自 `sessionViews.js`，不是 TSX 自帶副本。
還原後綠、`sessionViews.js` SHA 逐字回復 `8c1402c9…`。

### Canary D：withdraw 的凍結文案由 React 文字節點產出

把 `退出後將無法再次申請這一局。` 改成 `退出後仍可再次申請這一局。`：

```text
> await expect(confirmation).toContainText("退出後將無法再次申請這一局。");
1 failed  smoke.spec.js:1116 withdrawal requires an in-project confirmation that warns the member cannot apply again
```

還原後綠。

### 7.1 時序（批 8.4 §17.1／批 8.5 §8.3 教訓）

```text
15:40  建 HEAD worktree（c349d33）、跑 dialogProbe → mismatchCount 0
15:43:14  記錄 canary 前三檔 SHA
15:43–15:45  canary A → 還原驗綠 → B → 還原驗綠 → C → 還原驗綠 → D → 還原驗綠
15:45:23  三檔 SHA 與 canary 前逐字相同（diff exit 0，印出 SHA-IDENTICAL-TO-PRE-CANARY）
15:45 之後  只跑 gate 與撰寫本報告，src/** 零再修改
```

`git diff` 對 canary 前後的 `src/**` 為空，**canary 後未再動工作樹**，因此 §6 的 probe 結果
（在 canary 前取得）仍對應最終版本；不需要重錄。

## 8. Full-repo consumer sweep

`openWithdrawSessionConfirmation` ／ `openReportDialog` ／ `openWithdrawConfirmation` ／
`openReport` 全庫 grep（`src/`、`tests/`、`scripts/`、`index.html`）：

| 呼叫點 | 本批動作 |
| --- | --- |
| `src/main.js:81` / `:85` import | 零修改 |
| `src/main.js:1509` `openReport: (context) => openReportDialog(context)` | 零修改 |
| `src/main.js:1510` `openWithdrawConfirmation: openWithdrawSessionConfirmation` | 零修改 |
| `src/sessionController.js:413/414` 預設值 | 零修改 |
| `src/sessionController.js:1756/1883` withdraw 確認 | 零修改 |
| `src/sessionController.js:2054` `openReport({ targetLabel, onClose, onSubmit })` | 零修改 |
| `tests/smoke.spec.js:1121/1128/1156/1172/1197/1226/2748/2750/2823/2824/2854/2878` | 零修改 |
| `tests/session.spec.js:914-944`（host 檢舉 roster＋球局的 local 旅程） | 零修改 |
| `tests/session-controller.test.js:278/339/1513/1548`（fake，不經真 DOM） | 零修改 |

`mountDialog` consumer 也一併掃過：除本批兩個 factory 外只剩 `src/sheets.js:176`
的 `openLoginModal`（觀察項，本批未碰）。

新增的內部 consumer 只有兩條 importer 與 `reportDialogRuntime`（僅 `src/sheets/ReportDialog.tsx`
一個 consumer）。

## 9. 零 diff 逐字驗證

```text
$ git diff --name-only HEAD -- src/main.js src/sessionController.js src/sheets.js \
    src/domainTypes.ts src/session.css index.html tests/ .claude/ scripts/ supabase/
$ echo $?
0
```

（無輸出、exit 0。）

```text
$ git diff --name-only HEAD
src/sessionViews.js
```

## 10. Bundle 前後對照

| 產物 | HEAD（c349d33 worktree） | 本批 | 差 |
| --- | --- | --- | --- |
| `dist/assets/index-*.js`（主 chunk） | 711,157 B（gzip 200.75 kB） | 712,771 B（gzip 200.82 kB） | **+1,614 B**（+0.23%） |
| `dist/assets/index-*.css` | 67,426 B（`index-Ckdsfrjg.css`） | 67,426 B（`index-Ckdsfrjg.css`） | 0（同 hash） |
| `dist/assets/index-Zt4BwSlo.js` | 1,932 B | 1,932 B | 0（同 hash） |

CSS 產物 hash 相同即證明本批零 CSS 變更。

## 11. 完整 gate 結尾輸出（逐字）

跑 gate 前 `pgrep -f vite | wc -l` = `0`。本批**未**執行 DB reset。

### `npm test`（含 pretest）

```text
> tennis-partner-finder@0.1.0 pretest
> node scripts/generate-courts-seed.mjs --check

--check 通過:產出檔案與 data/courts.json 重生結果一致。

…
  ✓  256 [mobile-chromium] › tests/smoke.spec.js:5430:1 › the filter sheet traps Tab focus between its own first and last controls (267ms)

  4 skipped
  252 passed (2.3m)
```

exit=0

### `npm run test:local`

```text
> tennis-partner-finder@0.1.0 pretest:local
> npm run typecheck

> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit

…
  ✓  53 [supabase-chromium] › tests/session.spec.js:2226:1 › N3 a failing subscription seed never fails the profile save (754ms)

  11 skipped
  42 passed (1.6m)
```

exit=0

### `npm run typecheck`

```text
> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit

exit=0
```

### `npm run lint`

```text
> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{ts,tsx}" vite.config.ts

exit=0
```

### `npm run prettier:check`

```text
> tennis-partner-finder@0.1.0 prettier:check
> prettier --check "src/**/*.{ts,tsx}" vite.config.ts

Checking formatting...
All matched files use Prettier code style!
exit=0
```

### `npm run build`

```text
> tennis-partner-finder@0.1.0 build
> vite build

vite v6.4.3 building for production...
transforming...
✓ 116 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-rPJE_fh0.js   712.77 kB │ gzip: 200.82 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
…
✓ built in 986ms
exit=0
```

（500 kB 警告是既有狀態，HEAD 亦同。）

### `git diff --check`

```text
exit=0
```

（無輸出。）

## 12. 偏離清單

1. **`targetLabel` 以 `String(targetLabel)` 在 adapter 邊界轉字串**：HEAD 是
   `esc(targetLabel)`，而 `esc` 的第一動作就是 `String(value)`（`src/util.js:7`）。React 的
   `{targetLabel}` 對 `null`／`undefined` 會渲染空、對數字會渲染數字，與 `String()` 不同；
   在 adapter 補 `String()` 才逐字等價。沿用批 8.3／8.6 既有裁決，並以
   `report-numeric-target-label`（`42` → `"42"`）實測。
   （既有行為觀察項不變：`String(undefined)` 會渲染字面 `"undefined"`。）
2. **`esc()` 退場**：兩個 factory 不再呼叫 `esc`；`sessionViews.js` 其餘 10 處 `esc(` 仍在用，
   import 未變成死碼。
3. **兩個 factory 各新增一行 mount 可用性 guard**（`throw new Error("… browser mount is
   unavailable.")`），與 §1 的其他 11 個 sheet factory 同型；Node unit test 沒有 `document`
   時 importer 短路為 `undefined`，但這兩個 factory 本來就只在 browser 被呼叫，
   實際不會觸發（`npm test` 252 綠即證）。
4. **`reportDialogRuntime` 新增為公開 export**：派工單指定的 frozen runtime 橋接。
   `Object.freeze({ REPORT_REASONS })` 只轉送常數，不含任何判準函式；唯一 consumer 是
   `src/sheets/ReportDialog.tsx`。
5. **confirm click 與 form submit 保留 native `addEventListener`**：節點 identity 穩定，
   改成 React 事件 prop 只會多一層委派而無收益（批 8.6 偏離 4 同型裁決）。
6. **probe 新增 5 個比較欄與「兩輪 macrotask」settle**：`checkedProp`／`nameProp`／
   `typeProp`／`noValidateProp`／`labelControl` 是本批 surface 特有的行為面
   （radio 與 `getByLabel` 關聯）；macrotask settle 理由見 §6。
7. **本批未執行 DB reset**：`test:local` 一次全綠，無需動用 guarded reset 入口。

## 13. 觀察項（PM）

1. `smoke.spec.js:2780`（非抽屜 report dialog 焦點回復）只斷言殼，不碰 React 內容——
   canary A 下仍綠。既有覆蓋事實，非本批引入。是否補內容層斷言由 PM 決定，本批未動 `tests/**`。
2. `runAsyncAction` 的 `clearError` 只把 `error.hidden` 設回 `true`，**不清 `textContent`**
   （`clearErrorText` 預設 `false`）。因此 report 的「失敗後再成功」情境下，
   `[data-report-error]` 仍留著上一次的失敗文字（只是 hidden）。既有行為，兩樹逐字相同，本批未修。
3. `src/sheets.js:175` 的 `openLoginModal` 是 surface 殼模組自身的內容，仍是 `innerHTML`
   字串；批 8.x 的其餘 surface 到本批已全數遷完。是否遷移待批 9 前再議（原盤點即列觀察項）。

## 驗收方註記（2026-08-19）

1. **偏離七條全數接受**：`String(targetLabel)`／esc() 兩處退場（批 8.3／8.6 既有裁決同型，
   esc 差額 12→10 處經 Lens 3 逐處對帳）；mount guard 與 `reportDialogRuntime` 是既有同型
   模式；confirm click／form submit 保留 native listener（節點穩定下更保守，同批 8.6 偏離 4
   裁決）；probe 升級與未執行 DB reset 照實記錄。
2. **獨立 canary（第五發，角度＝React↔閉包接線錨點，dev 四發未覆蓋）**：TSX 的
   `data-confirm-withdraw` 暫改 `data-confirm-withdraw-canary` → factory `querySelector`
   落空、confirm 無 handler → smoke `withdrawal requires an in-project confirmation…` 紅 →
   還原後綠、SHA 逐字回復 `b9eedaf5…`。
3. **Read-back 三 lens（凍結面逐屬性／閉包接線完整性／consumer sweep 與型別邊界）全
   PASS**。Lens 2 確認同步語意鏈（mountDialog 同步建殼 → flushSync commit → querySelector
   必命中）無 silent-null 縫隙、兩元件結構上零 re-render 路徑;Lens 1 確認 radio
   `key={reason}` 在四值互異下安全、targetLabel 對 null／數字／undefined 三型輸入與
   `esc()` 等價。
4. **唯一 concern 裁決＝接受不改**：`ReportDialogRuntime` 介面的 `readonly string[]` 宣稱
   強於 `Object.freeze` 的 shallow freeze 保證——與全庫 8 個既有 *Runtime 同型、無 consumer
   寫入路徑，非本批引入的退化;若要收斂屬全庫 pattern 級調整，不開批。
5. 驗收方七站 gate 複跑全綠（mock 252 passed／local 42 passed）；驗收期間工作樹零修改
   （canary 還原後 SHA 實證）。
