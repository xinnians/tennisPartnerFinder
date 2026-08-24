# 批 2D 派工單：view 層拆分（F2-3 sessionViews facade＋F2-4 main.js 拆分＋兩項小清理）

- 日期：2026-08-24
- 母派工單：`docs/arch-dispatch-2026-08-22-frontend.md`（批 2 切分表）
- 開工基準：`ed21ab4`（2C ACCEPTED 之後）
- 本批凍結面最大的是 **116 個 e2e 白箱直呼 `__importAppModule("sessionViews")`**
 （母派工單寫 107 是舊數，2026-08-24 實測 116）——facade 具名匯出集合零變化是
  一票否決條件。

## 開工前必讀（讀磁碟上的現行版本）

1. `.claude/rules/react-migration.md`（mount、import、焦點／Escape 混用規則）
2. `docs/arch-reports/batch-F1-acceptance-2026-08-24.md` §六.4／§六.5
  （churn 與命名殘留的原始觀察）
3. `docs/arch-reports/batch-F2C-acceptance-2026-08-24.md` §三（F2-2 契約，
   F2-4 動 main.js 時不得破壞）
4. 母派工單總則＋驗收協定

## Ground truth（2026-08-24 實測）

- `src/sessionViews.js` **1,978 行**、**39 個具名匯出**；e2e 白箱直呼 **116 處**。
- **`import.meta.glob` 橋接在 `sessionViews.js:54`／`:64`／`:70`**——glob 模式
  相對於所在檔案解析，**搬動即改行為**；它們也是批 3 的退役對象。
- `src/main.js` **1,239 行**（母派工單寫 1,483 是舊數）；沒有任何
  `__importAppModule("main")` 白箱點，但它是 Vite entry，路徑不變。
- `onBeforeStoreChange`：`sessionViews.js:711`（每次 adapter render 新建的
  inline arrow）→ `NearbySessionsDrawer.tsx:48`／`:214`（餵給
  `useStoreSelector`，identity 每 render 變 → 每次 commit 重訂閱；功能正確、
  屬 churn——批 1 驗收 §六.4 原文）。
- 命名殘留：`main.js:685` `rerenderVisibleNotificationSettings` 現在只是
  `publishPageView("me", "mySessions")`，"rerenderVisible" 已名不符實；
  `main.js:1175` 註解仍提到已退役的 `wireSuccess`。

## F2-3 sessionViews 拆檔（facade 承接）

### 作法約束

1. `src/sessionViews.js` 保留同名檔案，變為**薄 facade re-export**
  （`dataApi.js` 79 行 facade 是同 repo 前例）；**39 個具名匯出的名稱集合
   前後完全一致**（回報附兩版 `grep "^export " | sort` 的 diff，必須為空）。
2. **三個 `import.meta.glob` 橋接（`:54`／`:64`／`:70`）連同其模組層變數
   逐字留在 facade 檔內，不搬、不改**。依賴這些橋接的函式若拆出，橋接結果
   以注入或 re-export 方式提供，不得在新檔重寫 glob。
3. 拆分縫線建議依 surface 家族：nearby drawer／session 表單
  （create、edit、decide）／My Sessions 視圖／聊天視圖／對話框
  （report、withdraw、確認類）／共用 surface 助手。實際切法自選，回報說明。
4. 新模組**建議** `.ts` strict；若某模組因大量 DOM 字串或既有 JS 慣用法，
   strict 化需要成片斷言或改寫，**可以 `.js` 逐字搬移並列明理由**——
   優先序是「逐字搬移、行為零變化」高於「型別化」。不得為了湊 `.ts`
   改寫邏輯（那是拆錯，不是型別化）。
5. **無單檔超過 800 行**（facade 除外的所有新模組；facade 本身應遠小於此）。
6. **每拆一個模組跑一次 `npm run test:session-unit`**，每模組至少一個 commit。

### 驗收條件

1. facade 化完成（回報附前後 `wc -l`）；具名匯出集合 diff 為空（一票否決）。
2. 116 個白箱直呼所在的 e2e 檔案**零修改全綠**（`tests/` 對開工基準零 diff）。
3. `data-testid` 集合、兩張 GOLDEN 對 `0be31a2` 維持已核可 hunk。
4. 文案逐字不變（`esc()` 紀律與現有註解裡的中文一併保留）。

## F2-4 main.js 拆 feature 模組

### 作法約束

1. 比照 `src/features/notifications` 前例，把篩選工具列接線、分享／剪貼簿、
   presence 編排、profile 載入儲存編排等拆成模組；`main.js` 降至
   bootstrap＋接線。切法自選，回報逐模組列出。
2. **F2-2 契約不得破壞**：`handleAuthIdentityChange`／`applyAuthCandidate`
   的接線可以搬，但 `grep -c "identityChanged" src/main.js` 與拆出模組**總和
   仍為 0**（identity 判定只在 controller）；
   `tests/session-controller-auth.test.js` 零修改全綠。
3. `main.js` 仍是唯一 entry；`index.html` 不動。
4. 每拆一模組跑一次 `npm run test:session-unit`，每模組至少一個 commit。

### 驗收條件

1. 回報附前後 `wc -l`；`main.js` 剩餘內容逐段說明為何屬 bootstrap／接線。
2. 全部拆出模組無單檔 >800 行。
3. 行為零變化：完整矩陣全綠（見回報要求）。

## 小項一：`onBeforeStoreChange` churn

把 `sessionViews.js:711` 的 inline arrow 改為 **identity 穩定**的傳遞
（module-level 函式、或呼叫端持有的穩定 closure 均可），讓
`NearbySessionsDrawer` 的 `useStoreSelector` 不再每次 commit 重訂閱。
語意凍結：store 變更前呼叫 `rememberFocusedSessionCard(root)`。

**驗收**：焦點類 e2e（batch-18 相關與 `react-page-focus.spec.js`）零修改全綠；
回報說明穩定化機制並論證「重訂閱已消失」（程式碼論證即可，不強制計數探針）。

## 小項二：命名殘留清理

1. `rerenderVisibleNotificationSettings` 改為名實相符的名稱（自選，例如
   `publishMeSettingsPageView`），同步更新 `main.js` 內三個引用與
   `createNotificationFeature` 的 `rerenderVisibleSettings` 參數名**是否**
   一併改：feature 模組簽名屬跨檔介面，若改需列出全部 caller；不改則說明。
2. `main.js:1175` 註解改寫，不再提及已退役的 `wireSuccess`；描述現行機制即可。

**驗收**：反向 grep `rerenderVisibleNotificationSettings`、`wireSuccess` 於
`src/` 歸零（或列出保留處與理由）；純改名不得改文案與 testid。

## 不在範圍（不要順手做）

1. `import.meta.glob` 橋接退役（批 3）。
2. F2-5 型別鏈細項（domain 型別搬家、錯誤分流 instanceof 化）。
3. `src/controller/` 模組與 `sessionController.js` 組裝檔的再調整。
4. `.js` 殼全面 `.ts` 化（另案）。
5. 不動 `sessionStore.ts`／`syncCommit.ts`／`sheets.js`／dataApi 邊界／
   `databaseTypes.ts`／`.claude/rules/`／testid／文案／任何既有測試斷言。
6. 若認為某匯出已零消費者可刪，**提出建議**（附反向 grep），不要靜默實作。

## 回報要求

寫成 `docs/arch-dispatch-2026-08-24-frontend-F2D-report-codex.md`，不列入實作
commit、不 push。逐模組列出：搬了哪些函式、匯出集合 diff、跑了哪些測試；
「已刪除／歸零」附反向 grep；未做明說。

**收尾必跑標準矩陣**：`npm run test:ci:frontend`、`npm run test:db`、
`npm run test:local`（did not run＝0）、`git diff --check`；
GOLDEN 兩張與 `data-testid` 集合對 `0be31a2` 的差異限已核可 hunk。
Playwright 不並發；timeout 紅先 `--repeat-each=10` 取樣；
DB 重置只可用 guarded 指令。
