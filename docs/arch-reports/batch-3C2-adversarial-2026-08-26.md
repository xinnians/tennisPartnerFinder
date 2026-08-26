# 批 3C-2 對立審查報告（2026-08-26）

- 審查對象：working tree 未 commit 的批 3C-2 實作（基準 `ec20cdd`，HEAD `4d050be` 只多文件）。
- Codex 回報：`docs/arch-dispatch-2026-08-26-batch3C2-me-report-codex.md`；派工單：
  `docs/arch-dispatch-2026-08-26-batch3C2-me.md`。
- 存底：開工前 `git diff ec20cdd -- src tests` 已存 scratchpad `3c2-baseline.patch`（747 行）；
  每次 canary 後與收尾均以 `cmp` 驗證 byte-identical（見第 9 項）。
- 所有計數皆由指令輸出抄錄，測試輸出為逐字抄錄關鍵行。

## 1. Canary 三拍複跑（scope 接線）— PASS

**oracle 測試本體檢查** [已驗證]：`tests/account-settings-smoke.spec.js:191`
「a Me account switch clears a replaced node's stale pending and error state」。

- node replacement 真斷言：`:218` `window.__meOriginalToggleConnected = original.isConnected;`
  在兩次 `harness.update(...)`（皆走 `syncCommit` 同步 render，`tests/fixtures/meAppHarness.tsx:171`）
  之後同步取值；`:227` `await expect.poll(() => page.evaluate(() => window.__meOriginalToggleConnected)).toBe(false);`
  —— 原 node `isConnected === false` 為真斷言。
- stale reject 在切帳號之後：`:226` 先 `__switchMeAccount()`，`:228-231` 先驗 B replacement toggle
  （`aria-checked="true"`、enabled、error hidden），`:233` 才
  `window.__rejectMeAccountA(new Error("帳號 A 的過期失敗"))`，`:234-236` 再驗 B 仍 enabled、無 error、
  `runtimeErrors` 空。順序正確。
- 載重機制 [已驗證]：`src/sessionActions.ts:107-113` `setMySessionActionScope` 在 scopeKey 改變時
  重建空 pending map；`:134-139` `syncPendingMySessionActions` 會把 pending descriptor 對到「當前 DOM」
  的按鈕重新 disable —— 刪 scope 行後 A 的 pending 存留，B 的 replacement node 會被 sync 重新 disable，
  故此測試咬的是 live account scope，不是單純 node identity。

**三拍實跑**（同一指令
`npx playwright test tests/account-settings-smoke.spec.js --project=desktop-chromium --grep "a Me account switch clears a replaced node's stale pending and error state"`）：

1. 完整接線（拍一）：

   ```text
   ✓  1 [desktop-chromium] › tests/account-settings-smoke.spec.js:191:1 › a Me account switch clears a replaced node's stale pending and error state (608ms)
   1 passed (1.6s)
   ```

2. 刪 `src/pages/MePage.tsx` 的 `setMySessionActionScope(props.rootElement, authSession?.user?.id ?? null);` 一行（拍二）：

   ```text
   Locator:  getByTestId('player-visibility-toggle')
   Expected: enabled
   Received: disabled
   14 × locator resolved to <button disabled type="button" role="switch" aria-checked="true" aria-label="球友卡：已開啟" ... data-testid="player-visibility-toggle" ...>已開啟</button>
   > 230 |   await expect(accountBToggle).toBeEnabled();
   1 failed
   ```

   失敗落點正是帳號 B 的 replacement toggle（`aria-checked="true"`＝B 的 playerVisibility:true 節點），
   與 Codex 回報的 `Expected: enabled / Received: disabled` 一致。

3. 還原該行後 `cmp` baseline patch 輸出 `CMP-IDENTICAL`（拍三），同指令：

   ```text
   ✓  1 [desktop-chromium] › tests/account-settings-smoke.spec.js:191:1 › ... (367ms)
   1 passed (1.2s)
   ```

Codex 的 canary 三拍聲稱成立。

## 2. Delegation 變更必要性證明 — PASS（變更確屬必要）

派工單指定的 `tests/navigation-smoke.spec.js` 不存在；實際導覽 spec 是
`tests/navigation-shell-smoke.spec.js`（真 app 啟動：`page.goto` + fake Maps，走完整 `main.js` init）。

**必要性 canary**：把 `src/main.js:697-715` 的兩段 delegation 暫時改回 `ec20cdd` 直掛原文
（取自 `git show ec20cdd:src/main.js` 逐字），跑
`npx playwright test tests/navigation-shell-smoke.spec.js --project=desktop-chromium`：

```text
- Array []
+ Array [
+   "Cannot read properties of null (reading 'addEventListener')",
+ ]
14 failed
```

**14/14 全紅**，runtime error 為 init 時
`Cannot read properties of null (reading 'addEventListener')` —— 印證：移除
`commitPageAdapterSynchronously` 後 React 首次 commit 是 concurrent（`App.tsx` `renderApp` 走
`ensureAppRoot().render(...)`，非同步 commit；舊時序靠 `mountMeDestination → renderMePage →
commitPageAdapterSynchronously → syncCommit(renderApp)` 的同步 flush 讓 `#map-tab` 等節點在
init 掛 listener 前已存在），direct `getElementById("map-tab")` 等在 init 時拿到 null 直接拋錯，
app 完全無法啟動。**不是「可能 stale node」的軟性風險，而是確定性 init 崩潰**——變更必要性成立，
非無故擴權。

還原 delegation 後 `cmp` 輸出 `CMP-IDENTICAL`，同指令：

```text
14 passed (5.8s)
```

**附帶證偽一項回報數字** [不確定→部分推翻]：Codex 稱「49-test focused matrix」。實測
`navigation-shell-smoke.spec.js` 為 desktop-chromium 14 tests、全 projects `Total: 42 tests in 1 file`
（14×3 projects）。無任何單一組合湊出 49；無法重建 Codex 的 49 這個數字（可能混入其他 spec 的
--grep 集合，回報未附指令）。necessity 結論不受影響（我自己的 14 紅／14 綠三拍已獨立成立）。

## 3. Delegation 等價性 — PASS（語意等價；邊緣差異均不可觀察或屬改善）

結構前提 [已驗證]：

- `index.html:34` `<div id="map-topbar-root"></div>`、`:119` `<div id="bottom-navigation-root"></div>`、
  `:102` `<div id="me-root"></div>` 均為靜態節點。
- `.app-brand`（`src/app/App.tsx:259` `<a className="app-brand" href="#tab-map" ...>`）與
  `#player-directory-open`（`App.tsx:284`）都在 `MapTopbar` 內，經 `App.tsx:728` portal 進
  `#map-topbar-root`；五 tab `<button>`（`App.tsx:500/513/535/558/578`：map／my-sessions／
  create-session／messages／me）都在 `BottomNavigation` 內，經 `App.tsx:729` portal 進
  `#bottom-navigation-root`。

七個行為逐一對照（ec20cdd 直掛 → 現行 delegation）：

| 行為 | ec20cdd | delegation | 判定 |
| --- | --- | --- | --- |
| `#map-tab` → `showMapPage()` | 直掛 | `closest("button")?.id === "map-tab"` | 等價 |
| `#create-session-tab` → `controller.openCreateIntent()` | 直掛 | 同左分支 | 等價 |
| `#my-sessions-tab` → `showMySessionsPage()` | 直掛 | 同左分支 | 等價 |
| `#messages-tab` → `showMessagesPage()` | 直掛 | 同左分支 | 等價 |
| `#me-tab` → `showMePage()` | 直掛 | 同左分支 | 等價 |
| `.app-brand`：`preventDefault()` + `showMapPage({ focus: true })` | 直掛於 anchor | `closest(".app-brand")` 才 preventDefault | 等價 |
| `#player-directory-open` → `controller.openPlayerDirectory()` | 直掛 | `closest("#player-directory-open")` | 等價 |

邊緣語意差（逐項列出）：

1. **fail-fast 消失**：直掛版節點缺失時 init 拋 TypeError；delegation 掛在靜態 host 永不拋。
   這正是本批要修的點（節點現在 async commit），host 由 index.html 靜態保證存在，不可觀察退化。
2. **`!(event.target instanceof Element)` guard**：新加；mouse/keyboard click 的 target 恆為
   Element，實務不可觸發。
3. **host 上其他 click 也進 handler**（topbar filter chips 等）：兩個 `closest` 都不中即 no-op、
   不 preventDefault，無可觀察差。
4. **stopPropagation 遮蔽風險**：App 子樹唯一 `stopPropagation` 在 `App.tsx:248`，是 popover 的
   `keydown` Escape handler，非 click 路徑 [已驗證：`rg stopPropagation src/app src/components` 僅此一筆]
   —— delegation 不會被既有程式碼吃掉事件。
5. **SVG／span 內部 target**：`closest` 由 SVG 子節點爬回 `<button>`，與 bubbling 到直掛節點等價。
6. disabled button：五 tab 無任何 disabled 屬性；且瀏覽器對 disabled button 本就不派發 click，
   兩版一致。
7. node replacement 存活：delegation 掛靜態 host，React 換掉子節點後 handler 仍活——相對直掛是
   行為改善（舊版靠 React reconciliation 保 node identity，屬隱性依賴）。

裁決建議：**必要且等價**。

## 4. Auth preload 真實等價審查 — Codex「Before」敘述被推翻；新接線屬行為改善

(a) **ec20cdd 的舊觸發是實質死觸發** [已驗證]：

- `renderMePage` 在 ec20cdd 的 production caller 只有一個：`main.js:423`（`mountMeDestination` 內），
  且 `mountMeDestination()` 只在 init 被呼叫一次（`main.js:704`）。`git grep renderMePage ec20cdd`
  無其他 production 呼叫點——**mount-once，沒有任何「後續 adapter render」**。
- bridge 觸發（`git show ec20cdd:src/views/pageViews.js:16`
  `preloadAuthenticatedViewsForAuth(authSession);`）因此只跑一次，參數是 init 當下
  `getAppState().authSession`。而 auth 恢復在 `boot()`（ec20cdd init 尾端 `void boot()`）→
  `restoreAuth()`（async，`await getInitialSession()`）之後才可能落地，init 同步階段
  authSession 恆為 null → `if (authSession) preloadAuthenticatedViews()`（sessionViews）恆 no-op。
  `preloadAuthenticatedViewsForAuth` 在 ec20cdd 也沒有其他 caller [已驗證：git grep 僅
  sessionViews 本體＋configurePageViews 注入]。**結論：ec20cdd 的 auth 差分 preload 從未在
  production 觸發過。**

(b) **新接線** [已驗證]：

- `src/main.js:644-647`：

  ```js
  onAuthIdentityChange: (context) => {
    preloadAuthenticatedViewsForAuth(context.session);
    return handleAuthIdentityChange(context);
  },
  ```

- 觸發鏈：`src/controller/authController.ts:172-178` `setAuthSession` 在
  `decision.identityChanged` 時呼叫 `onAuthIdentityChange(decision)`；`identityChanged =
  previousIdentity !== identity`（`:86`）。`decision.session` 是 `AuthIdentityChange` 具名欄
  （`:24`）。production 唯一進 `setAuthSession` 的路徑是
  `src/features/profile/profileOrchestrationFeature.js:218` `applyAuthCandidate` →
  `dependencies.setAuthSession(session)`，而 `restoreAuth()`（`:237`）把每個
  `onAuthStateChange` 事件都導進 `applyAuthCandidate`。因此：
  - 初次 session restore（null→user）：identityChanged=true → **preload 觸發**（帶 session）。
  - sign-in／切帳號：觸發（帶新 session）。
  - sign-out（user→null）：callback 觸發但 `context.session` null → preload no-op（正確）。
  - 同帳號 token refresh：identityChanged=false → 不觸發（正確，無重複）。
  - `setAuthState` 路徑（`main.js:519/527`、`profileOrchestrationFeature.js:157/191/199`）繞過
    callback，但這些呼叫點的 authSession 都是先前已經過 `setAuthSession` 的同一身分（courts
    載入後補 gate、profile 存檔後補 gate），無漏接情境 [已驗證：逐點檢視呼叫上下文]。
  - `main.js:689` init 直呼 `preloadAuthenticatedViewsForAuth(getAppState().authSession)`：
    init 時 authSession 恆 null（同 (a) 時序）→ 恆 no-op，等價保留舊 init 快照語意（都是 no-op）。

(c) **結論：修復了實質死觸發（行為改善），不是等價**。舊版 auth 差分 preload 在 production
從未生效；新版讓 sign-in／restore／切帳號真正觸發 authenticated views 預熱。**Codex 回報 §3
「Before：…後續 adapter render 提供 auth 差分觸發」被推翻**——mount-once 下不存在後續 adapter
render，舊觸發鏈整條是死的。回報的 After 對照表本身正確（init 呼叫標注「等價取代首次 Me mount
preload」誠實——兩者皆 no-op），但驗收紀錄應寫成「行為改善（修死觸發）」而非「等價落點」。

## 5. 反掃複跑 — PASS

- `rg -n "renderMePage|renderMePageInApp|mountMeDestination|mePages|renderPortals|renderPage\(|commitPageAdapterSynchronously|configurePageViews|PageSlot|nextSlotId" src tests`
  → 零 match（exit 1）。
- `rg -n "syncCommit\(" src` 逐字：

  ```text
  src/syncCommit.ts:8:export function syncCommit(update: () => void): void {
  src/sessionStore.ts:102:            syncCommit(listener);
  src/app/SurfaceHost.tsx:60:  syncCommit(update);
  ```

  除 helper 本體外只剩 `sessionStore.ts` 與 `SurfaceHost.tsx`，與 Codex 回報逐字一致。
- `rg -n "pageViews" src tests` → 零 match（exit 1；`pageViewStore` 為大寫 S，不落入此 pattern，
  已確認 rg 預設大小寫敏感下無誤中）。

## 6. 搬遷 helper 機械比對 — PASS（唯一差＝兩行 JSDoc 未搬）

以 `git show ec20cdd:src/views/pageViews.js` 抽出兩函式本體與現行 `src/sessionViews.js`
（`renderPlayerLayerToggle` :196-210、`renderMapDataStatus` :213-229）逐行 `diff`：

```text
=== toggle diff ===
1d0
< /** Keep the persistent map chip synchronized with controller-owned layer state. */
=== status diff ===
1d0
< /** Render only user-facing, non-sensitive loading/error/location messages. */
```

函式本體 byte-identical；唯一差是兩行 JSDoc 一句話註解被**捨棄**（未搬過去），非語意差。
派工允許「註解搬移」，捨棄註解嚴格說是超出「搬移」的損失，但無行為影響——列為 minor 備註。

**簽名展開查證** [已驗證]：ec20cdd 的 `pageViews.js` 內 `renderMapDataStatus` 原始簽名**本來就是
具名參數** `(root, { kind = "idle", message = "", onRetry = () => {}, locationMessage = "" } = {})`；
`...args`＋`// F2D freezes the facade's top-level export declaration scan.`＋`// prettier-ignore`
是 ec20cdd `sessionViews.js:206-212` 的 facade 轉發 wrapper。現版展開＝回到 pageViews 原形。
另反掃 tests 無任何 `renderMapDataStatus` 引用、無 "F2D" 掃描測試殘留 [已驗證：rg tests 零 hit]，
prettier-ignore 移除不觸發任何白箱斷言。`renderPlayerLayerToggle` 的測試消費端
（`tests/discovery-interactions-smoke.spec.js:717` 等）都 import 自 `sessionViews`，import 面不變。

## 7. 凍結面 — 全 PASS

- (a) `git diff ec20cdd -U0 -- src/main.js` 的 hunk 舊檔行號：`-104/-109/-134`（imports）、
  `-419,17`（mountMeDestination 刪除）、`-662`、`-704`、`-711,4`、`-716,5`——舊檔 436-661 區間
  （含 showMePage）零 hunk。現行 `showMePage` 在 `src/main.js:455-469`，兩顆 rAF 在 `:462`
  （`[data-me-heading]` focus）與 `:465-467`（`[data-notification-settings-heading]` focus），
  原文與 ec20cdd 相同。
- (b) `git diff ec20cdd --stat -- tests/react-surface-lifecycle.test.js` →
  `1 file changed, 1 insertion(+), 1 deletion(-)`，唯一變更行：
  `- const approvedCallers = ["app/App.tsx", "app/SurfaceHost.tsx", "sessionStore.ts"];`
  `+ const approvedCallers = ["app/SurfaceHost.tsx", "sessionStore.ts"];`（`:109`）。
- (c) lazy 斷言仍在：`tests/react-surface-lifecycle.test.js:139`
  `assert.equal((APP.match(/Request \?\?= import\("\.\.\/pages\//g) ?? []).length, 3);`；
  `:140` `assert.match(SESSION_VIEWS, /pointerover[\s\S]*focusin/);`、
  `:141` `assert.match(SESSION_VIEWS, /if \(authSession\) preloadAuthenticatedViews\(\)/);`。
  實跑 `node --test tests/react-surface-lifecycle.test.js`：

  ```text
  # tests 6
  # pass 6
  # fail 0
  ```

- (d) `rg -n "line_id|session_contacts" src` 的 hit 集合與 `git grep ... ec20cdd -- src` 逐行 diff
  → `PRIVACY-SET-IDENTICAL`（兩邊各 12 hits，檔案:行號集合完全相同）。隱私紅線無新增觸點。

## 8. Preload 時序風險 — 有語意差，但生產不可觀察（列出）

- 現版：`src/sessionViews.js:240` `let preloadMePageInApp = null;`；`:246-251`
  `configureSessionViewModules` 賦值並檢查 `typeof !== "function"` 即 throw
  （`"App module export is unavailable: preloadMePageInApp"`），同時補寫
  `authenticatedViewPreloads[0]`／`namedViewPreloads.me`（兩者在 `:538-561` 建構時捕捉到的是
  null 初值，必須補寫——已補，正確）。`warmView`（`:584-586`）`typeof preload === "function"`
  → null 為 **silent no-op**。
- ec20cdd 舊版：`preloadMePageInApp = () => requireAppExport("preloadMePageInApp")()` 恆為函式，
  configure 前被 `warmView` 呼叫會**同步 throw**（fail-fast，可觀察為 uncaught error）。
- **語意差**：configure 前的 `preloadForIntent`（`#me-tab` hover/focusin）與
  `preloadNonHomeViews("me")` 由 fail-fast 變 silent no-op。
- **可觀察性判定**：production 不可達 [推論，依據如下]——`main.js:87` 靜態
  `import * as appModule from "./app/App.tsx"`，`main.js:163` 頂層
  `configureSessionViewModules(...)`；sessionViews 模組評估（`:612-614` 裝 document listener）與
  main.js 頂層在同一個同步 module-evaluation task 內完成，事件無法在其間派發，故「configure 前
  hover」窗口不存在。測試消費端（`tests/react-page-focus.spec.js:24` 等）都在真 app 啟動後呼叫，
  mock 全綠佐證 patched entry 有效。
- 新版把 fail-fast 提早到 configure 時點（export 缺失在啟動即 throw，早於舊版「第一次 hover 才
  throw」），屬防護強化；但與同檔其他 preload wrapper（messages/mySessions 仍走 requireAppExport
  throw 風格）形成兩種風格並存——風格債，非行為風險。

## 9. 收尾 — PASS

- 三次 `cmp`（canary 1 還原後、canary 2 還原後、收尾）皆輸出 `CMP-IDENTICAL`；收尾輸出逐字：
  `FINAL-CMP-IDENTICAL`（`cmp 3c2-baseline.patch 3c2-final.patch` 無差異）。
- `git status --short` 與開工時完全一致（10 個 M/D 檔＋唯一 untracked
  `docs/arch-dispatch-2026-08-26-batch3C2-me-report-codex.md`，為 Codex 既有回報）。
- 無 commit、無 push、無 stash 操作；比對用暫存檔全在 session scratchpad（repo 外）；
  `test-results/` 為 gitignored（`.gitignore:5`）且最後一輪綠跑後無殘留失敗 artifact。

## 總評

**被推翻的 Codex 聲稱**：

1. §3「Before：…後續 adapter render 提供 auth 差分觸發」——不成立。ec20cdd 是 mount-once，
   `renderMePage` 僅 init 跑一次且當下 authSession 恆 null，舊 auth 差分 preload 是**實質死觸發**，
   從未在 production 生效（第 4 項證據鏈）。
2. 「49-test focused matrix」——數字無法重建：`navigation-shell-smoke.spec.js` 是 14 tests/project、
   42 tests 全 projects；回報未附指令無從對帳（第 2 項）。necessity 結論不受影響。

**成立的 Codex 聲稱**：canary 三拍（紅點落 B replacement toggle、`Expected: enabled / Received:
disabled` 逐字吻合）；oracle 真斷言 node replacement 且 stale reject 在切帳號後；slot 五件套與
pageViews 反掃歸零；`syncCommit` 3→2 且逐字輸出吻合；helper 搬遷 byte-identical（僅兩行 JSDoc
捨棄）；showMePage 兩顆 rAF 零 hunk；lifecycle 測試僅一行 diff 且 6/6 綠；隱私 hit 集合不變。

**Delegation 裁決建議**：**必要且等價**。必要性以 destructive canary 證明（直掛版 14/14 紅、
init 拋 `Cannot read properties of null (reading 'addEventListener')`，還原後 14/14 綠）；等價性
逐行為對照成立，列出的邊緣差（fail-fast 消失、Element guard、host 級 no-op passthrough）均不可
觀察或屬改善。

**驗收紀錄措辭建議**：auth 差分 preload 一節應記為「修復實質死觸發（行為改善）」，不要沿用
Codex 的「等價落點」敘述；另建議 minor 備註兩行 JSDoc 損失與 preload wrapper 風格並存（皆不擋
驗收）。

**working tree 狀態**：已還原 byte-identical（`FINAL-CMP-IDENTICAL`），未 commit、未 push。
