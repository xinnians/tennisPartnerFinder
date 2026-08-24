# 批 2B 派工單：小項打包（F2-6〜F2-9＋兩項批 1 遺留）

- 日期：2026-08-24
- 母派工單：`docs/arch-dispatch-2026-08-22-frontend.md`（批 2 切分表）
- 開工基準：`b09f6f0`（2A 含補件 ACCEPTED 之後）
- 六個子項彼此獨立，各自至少一個 commit；任一子項退件不影響其他子項驗收。

## 開工前必讀（讀磁碟上的現行版本）

1. `CLAUDE.md`（通知偏好六欄、`p_line_id` 凍結、mock 三層防護）
2. `docs/arch-reports/batch-F1-acceptance-2026-08-24.md` §六.3（B-1 的證據）
3. `tests/session-controller-sequence.test.js` 檔頭紀律（B-2 動它旁邊）
4. 母派工單總則＋驗收協定

**通用紅線**：不動 `sessionController.js`／`main.js` 的結構（B-5 的顯示點小改除外）、
不動 testid／DOM 結構／既有 e2e 斷言、不動 `syncCommit.ts` 與各守門、
不動 `databaseTypes.ts`。本批動 `src/` runtime，**`test:local` 必跑**。

---

## B-1 退役 `drawerScrollPositions`（批 1 遺留，證據已齊）

**依據**（批 1 驗收 §六.3，驗收方實測）：F1-2 穩定 slot key 後
`.nearby-drawer__scroll` 節點不再被替換，瀏覽器自然保住 scrollTop。
把 `restoreDrawerScrollTop` 改 no-op 在基準 `0be31a2` 兩個 batch-18 測試紅、
在批 1 後綠——機制已冗餘。

**Ground truth**（現行行號）：`src/sessionViews.js:307`（WeakMap）、
`:490-495`（remember）、`:498-500`（restore）、呼叫點 `:724`／`:736`／`:753`。
**`drawerFocusIntents` 整套保留**（實測載重：no-op 後 performance.spec 3/4 紅）。

**驗收**：三符號＋WeakMap 反向 grep 空；`tests/smoke.spec.js:1009`／`:1069` 兩個
batch-18 測試**零修改仍綠**（它們斷言使用者可觀察結果，改由 React 穩定 DOM 提供）；
`:487-489` 的 Batch 18 註解隨機制退役可改寫，但不變量描述（開著的抽屜跨靜默刷新
保留閱讀位置）要留在某處。

## B-2 `me` 通道補進 GOLDEN 指紋（批 1 遺留的安全網缺口）

批 1 在 `sessionController.js` 新增五處 `store.emit("me")`
（`notifyMySessions`／`setCourts`／`setAuthSession`／`setProfile`／auth reconcile），
但 sequence recorder 只錄 render／pins／players／mySessions——`me` 通道零指紋。

**形狀約束（重要）**：**不得動既有 124 筆表**。recorder 若把 `me` 混進同一個
`entries` 陣列會交錯改變整表。改用**獨立的第二張 GOLDEN 表**（自己的收集陣列、
自己的 `assert.deepEqual`），只錄 `me` 通道的步驟＋次數或 payload（解析度自選，
說明理由）。既有 124 筆的驗收條件照舊：
`git diff 0be31a2 HEAD -- tests/session-controller-sequence.test.js` 只准出現
新增區塊，原表逐字不變。檔頭紀律同步補記第二張表的重錄規則。

**驗收**：新表落地＋檔頭補記；**canary**——暫時把某處 `emit("me")` 註解掉，
新表必紅（附輸出），還原後綠；既有 124 筆表逐字不變。

## B-3（F2-6）mock 路徑補 mapper

**Ground truth**：`dataRepository.ts:244`（player directory mock）與 `:263`
（presence mock）直接 `{ ...entry }` spread 回傳，未過任何 mapper；
對照 session 已有 `mapMockSessionSummary`／`mapMockSessionJoinPreviewRow`
（`sessionMappers.ts:67`／`:167`）前例。mock 資料是 camelCase
（`mockData.js:19-`、`:64-`），與 view 的 snake_case row 不同形。

**驗收**：兩條 mock 路徑過 mapMock*（比照 session 前例，含 literal guard 的套用，
讓 mock 與真實路徑產出同形 domain 物件）；各附單元測試（含未知 literal 值走
fallback 的案例）；mock e2e（球友卡、在線圖層）零修改全綠。

## B-4（F2-7）通知偏好預設值收斂單點

**Ground truth**：單一來源已存在——`profileMappers.ts:56`
`defaultNotificationPreferences()`（repository `:373` 已用）。另兩層各寫一次：
`sessionPresentation.ts:329-334`（六個 `!== false`）、
`notificationFeature.ts:62-`（六個 `true` 字面）。
讀寫不對稱一併處理：讀路徑缺欄位預設 true（`!== false`），寫路徑
`saveNotificationPreferences` 缺欄位送 false（`=== true`）——目前
`notificationFeature.ts:105-110` 送出前補齊六欄所以沒有實際破口，
收斂時不得把這個保護弄掉。

**驗收**：三層都從單一來源推導（附反向 grep：`!== false` 六連發與六個 `true`
字面消失或改引用單點）；讀寫不對稱在程式碼註解與回報中明文化；
Me 頁通知偏好 mock e2e 零修改全綠。

## B-5（F2-8）`ACTION_MESSAGES` 中文文案上移 UI 層

**Ground truth**：文案表在 `src/data/dataErrors.ts:31-`；`SessionActionError`
建構時就把中文塞進 `message`。UI 消費點共七處，全部是
`error?.message || fallback` 形：
`sessionController.js:1070`／`:1439`／`:1479`、
`sessionViews.js:906`／`:911`／`:1675`、`sessionActions.ts:241`／`:288`。

**作法約束**：data 層錯誤只帶 stable `code`（`SESSION_ACTION_CODES` 既有）；
code→中文表搬到 UI 層模組（建議 `sessionPresentation.ts`），七個顯示點改經
單一 resolve 函式。**顯示點以外不動那三個 .js 檔的結構**。
`asSessionActionError` 用 `message` 比對 code 的機制（`dataErrors.ts:106`）
與 DB 回傳的 outcome 字串契約不得變。

**驗收**：**UI 錯誤文案逐字不變**——(1) 單元測試釘住新表與舊 `ACTION_MESSAGES`
逐 key 相等（搬移當下可直接比對；表併走後改釘完整字面）；(2) 既有 e2e 零修改全綠
（含封存聊天 `SESSION_ARCHIVED` 文案路徑）；data 層反向 grep：中文文案離開
`src/data/`（附輸出）；七個顯示點逐一列出前後。

## B-6（F2-9）儲存個人檔案不再打兩次 courts

**Ground truth**：`saveCurrentProfile`（`dataRepository.ts:396-410`）先
`await loadCourts()`（`:397`），收尾 `return loadCurrentProfile()`，而
`loadCurrentProfile` 內部又 `await loadCourts()`（`:368`）——單次儲存打兩次
courts 查詢。

**驗收**：單次儲存只打一次 courts（假 client 記錄呼叫序列的單元測試，
比照 2A 補件 A-3 測試的形狀，斷言 `from("courts")` 恰一次）；
`saveCurrentProfile` 回傳形狀與語意不變（仍回權威 profile）；
`test:local` 的 profile 儲存旅程綠。

---

## 不在範圍（不要順手做）

1. F2-1〜F2-4 拆檔（2C／2D）；`onBeforeStoreChange` churn 與命名殘留（2D）。
2. `controller.sessionStore` 公開 API、第三個 `flushSync`——已裁決不動。
3. 不改任何 RPC 簽名（六參數 `set_notification_prefs`、`p_line_id: null` 凍結）。
4. 不動 `.claude/rules/`、CLAUDE.md、文案（B-5 是搬移不是改寫）。

若認為某項應提前處理，提出建議，不要靜默實作。

---

## 回報要求

寫成 `docs/arch-dispatch-2026-08-24-frontend-F2B-report-codex.md`，不列入實作
commit、不 push。每子項：改了什麼（檔案＋一句話）、驗收逐條附指令＋實際輸出、
`[已驗證]`／`[推論]`／`[不確定]` tag、「已刪除／歸零」附反向 grep、canary 附
紅→還原→綠完整輸出、未做明說。

**收尾必跑（動 runtime 的批次標準矩陣）**：`npm run test:ci:frontend`、
`npm run test:db`、`npm run test:local`（**did not run 必須為 0**）、
`git diff --check`；GOLDEN 既有 124 筆與 `data-testid` 集合對 `0be31a2` 不變。
Playwright 期間不並發其他測試；單次 timeout 紅先 `--repeat-each=10` 取樣。
需要重置本機 DB 只可用 `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`。
