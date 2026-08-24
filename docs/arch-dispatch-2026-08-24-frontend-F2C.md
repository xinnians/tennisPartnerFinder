# 批 2C 派工單：sessionController 內部拆分＋auth 差分單一化（F2-1＋F2-2）

- 日期：2026-08-24
- 母派工單：`docs/arch-dispatch-2026-08-22-frontend.md`（批 2 切分表；F2-1 形狀已拍板）
- 開工基準：`8044327`（2B 含補件 ACCEPTED 之後）
- 本批是批 2 風險最高的一張。**GOLDEN 兩張表逐字不變是一票否決條件。**

## 開工前必讀（讀磁碟上的現行版本）

1. `docs/frontend-architecture-analysis-2026-08-22-claude.md` 的「不可破壞資產」節
2. `tests/session-controller-sequence.test.js` 檔頭紀律（兩張表）
3. `docs/arch-reports/batch-F2B-acceptance-2026-08-24.md` §二 B-2 的覆蓋觀察
4. 母派工單總則＋驗收協定

---

## 拍板（已定，不重議）

- **保持單一 `createSessionController` 工廠，只拆內部**。公開簽名與回傳物件的
  **46 個公開鍵**（2026-08-24 實數，早前文件寫 19 是錯的）完全凍結——名稱、參數、
  同步／非同步語意、回傳形狀都不變。
- `controller.sessionStore = store` 維持公開（批 1 引入），**不收窄**；報告說明現狀即可。
- 不引入 Redux／Zustand／TanStack Query。

## Ground truth（2026-08-24 實測）

- `src/sessionController.js` **2,180 行**；`controllerContracts.ts` 310 行、
  `sessionSelectors.ts` 41 行、`sessionStore.ts` 113 行。
- controller 單元測試 `tests/session-controller.test.js`：**114 tests 全綠**。
- e2e 白箱直呼 `__importAppModule("sessionController")` 共 **4 處**：
  `react-page-focus.spec.js:96`、`smoke.spec.js:1015`／`:3844`／`:5142`——
  模組路徑與 `createSessionController` 具名匯出不得變。
- GOLDEN 兩張：124 筆完整 payload 表＋2B 新增的 19 筆 `ME_GOLDEN`。
- **覆蓋警告**（2B 驗收 §二 B-2）：17 步腳本不呼叫 `setProfile`／`setAuthSession`，
  它們的 `emit("me")` **不在任何 GOLDEN 覆蓋面**——搬動這兩個函式時安全網是空的，
  請以逐字搬移＋單元測試自保，不要順手「整理」它們。

## F2-1 內部拆分

### 作法約束

1. 新模組一律 `.ts` strict，套 `domainTypes.ts`／`controllerContracts.ts` 型別；
   放置位置自選（建議 `src/controller/` 新目錄或併入 `src/features/` 慣例），
   `src/sessionController.js` 保留為組裝工廠（e2e 匯入路徑不變）。
2. 拆分縫線建議依既有通道註解：discovery-map（通道 1）、my-sessions-lifecycle
   （通道 2＋lifecycle action gate）、chat、players／directory；
   auth 區（`setAuthState` reconcile）建議最後動、且與 F2-2 同一個 commit 序列處理。
3. **無單檔超過 800 行**（含拆出的新模組與剩下的工廠）。
4. **每拆一個模組就跑一次 `node --test tests/session-controller.test.js
   tests/session-controller-sequence.test.js`**，不要全部拆完才跑——
   sequence 紅了才好定位是哪一刀切壞的。每個模組至少一個 commit。
5. **不可破壞資產逐條保留**：`publish()` 顯式派發（「值沒變仍要重畫」）、
   `captureAuthSnapshot`／`isCurrentAuthSnapshot` 的世代語意、
   `requestGate.capture`／`invalidate`、lifecycleAction 的 in-flight gate、
   `surfaceRegistry` 的 transition 語意、blockedPlayerGate。
   閉包共享變數改為模組間注入時，**讀取時機不得從同步變成跨 await**。

### 驗收條件

1. **114 個 controller 測試零修改全綠**（介面不變下不得重錄）。
2. **兩張 GOLDEN 逐字不變**（一票否決）：
   `git diff 0be31a2 HEAD -- tests/session-controller-sequence.test.js` 只准有
   批 1 檔頭 hunk＋2B 的 ME_GOLDEN 新增區塊——本批零新 hunk。
3. `wc -l` 前後對照：無單檔 >800 行。
4. **ControllerApi 契約由 TS 編譯驗證**（母派工單 F2-1 驗收原文）：
   公開 46 鍵表面要有型別（`controllerContracts.ts` 內的 interface 或等價），
   工廠回傳與之對上。**canary**：暫時從型別拿掉一個方法（或改一個參數型別）→
   `npm run typecheck` 紅；還原綠。附輸出。
5. 4 個 e2e 白箱直呼點零修改全綠。

## F2-2 auth 差分單一化

### Ground truth

兩份 identity 差分並存：

- `src/sessionController.js:2033-2100` `setAuthState`：算 `identityChanged`／
  `signedOut`／`accountChanged`／三級 gate 差分／readiness，負責 authEpoch、
  surface transition、controller state 重置。
- `src/main.js:1034-1062` `applyAuthCandidate`：**自己再算一次**
  `identityChanged`，負責 main 持有的重置（`closeActiveProfileCompletion`、
  `stopPresenceTracking`、`presenceLocationStatus`、`profileRevision`、
  `storedProfileExists`、`notificationSettings`、`publishPageView`、
  `profileLoadStatus`），然後才呼叫 `controller.setAuthState` 或 `setAuthSession`。

### 作法約束

1. **差分只算一次，算在 controller**。main 持有的那組重置不必搬進 controller
   （它們是 main／pageViewStore 的狀態），但觸發依據必須來自 controller 的判定——
   可行機制自選（例如工廠 options 加 `onAuthIdentityChange` callback，或
   main 訂閱既有 store 通道拿到判定），不得讓 main 重新推導 identity。
2. `applyAuthCandidate` 現有的時序語意保留：identity 變更時 main 的重置在
   `controller.setAuthState` **之前**完成（現行順序），token refresh
 （同 identity）仍走 `setAuthSession` 輕路徑、不得觸發重置。
3. 不改 `setAuthState` 的 reconcile 行為本身（那是 F2-1 auth 區的搬移對象，
   語意凍結）。

### 驗收條件

1. `grep -c "identityChanged" src/main.js` 為 **0**（附前後輸出；現為 3）。
2. main 的 identity 派生函式（`authIdentity` 對 `getAppState().authSession` 的
   差分用途）不再用於「判斷是否換帳號」；若仍有其他正當用途，逐一列出。
3. 帳號切換行為零變化：local 的跨帳號 e2e＋mock 的 scope 測試零修改全綠；
   token refresh 不觸發重置（引用既有測試或補一個單元測試證明輕路徑仍在）。
4. 兩張 GOLDEN 的 `sign-out`／`sign-in-other-account` 步驟逐字不變（含在條件 F2-1-2 內）。

---

## 不在範圍（不要順手做）

1. F2-3／F2-4（sessionViews facade、main.js 拆分）——2D。
2. `onBeforeStoreChange` churn、命名殘留（`rerenderVisibleNotificationSettings`、
   `main.js` 提到 `wireSuccess` 的註解）——2D。
3. 不動 `sessionStore.ts`／`syncCommit.ts`／`sheets.js`／`dataApi` 邊界／
   `databaseTypes.ts`／`.claude/rules/`／testid／文案／任何既有測試斷言。
4. 不擴 17 步腳本、不動兩張 GOLDEN 的內容（除非某刀真的改了派發行為——
   那代表拆錯了，回頭重拆，不是重錄）。
5. 若認為 `setProfile`／`setAuthSession` 的 emit 該補進覆蓋面，**提出建議**
  （含對兩張表的影響評估），不要靜默實作。

## 回報要求

寫成 `docs/arch-dispatch-2026-08-24-frontend-F2C-report-codex.md`，不列入實作
commit、不 push。逐模組列出：搬了哪些函式、注入了什麼、跑了哪些測試；
canary 附紅→還原→綠；「已刪除／歸零」附反向 grep；未做明說。

**收尾必跑標準矩陣**：`npm run test:ci:frontend`、`npm run test:db`、
`npm run test:local`（did not run＝0）、`git diff --check`；
GOLDEN 兩張與 `data-testid` 集合對 `0be31a2` 的差異限已核可 hunk。
Playwright 不並發；timeout 紅先 `--repeat-each=10` 取樣；
DB 重置只可用 guarded 指令。
