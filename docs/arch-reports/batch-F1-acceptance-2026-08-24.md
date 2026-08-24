# 批 1（F1-1〜F1-7）驗收紀錄

- 驗收日期：2026-08-24（初驗）／2026-08-24（補件複驗）　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-22-frontend.md`
- 補件派工單：`docs/arch-dispatch-2026-08-24-frontend-F1-followup.md`
- 回報：`docs/arch-dispatch-2026-08-22-frontend-execution-report-F1-codex.md`
- 補件回報：`docs/arch-dispatch-2026-08-24-frontend-F1-followup-report-codex.md`
- 驗收範圍：基準 `0be31a2` → 批 1 HEAD `7112d6d`（8 個 commit）→ 補件 HEAD `70562a4`（+1）
- 基準說明：派工單原寫 `8213d33`，該 commit 早於批 0。批 1 疊在批 0 已驗收並 push 的
  `0be31a2` 之上，因此本次以 `0be31a2` 為比對基準，與回報一致。

## 最終結論：**ACCEPTED**（含補件，2026-08-24）

初驗為條件式退件（三項，見 §二）；補件 `70562a4` 落地後複驗全數通過（見 §六）。
另在複驗時**加驗出一項不阻擋的事實更正**（`drawerScrollPositions` 已成冗餘，
codex 的保留理由不成立），列為批 2 的具體待辦，見 §六.3。

> ## ⚠️ 後註（2026-08-24，批 2A 驗收時發現）：本紀錄的 ACCEPTED 判定漏檢一項迴歸
>
> 本批驗收時 Docker 未啟動，`npm run test:local` 未執行，我把它記成「REL 前必補跑」
> （見 §四）就給了 ACCEPTED。批 2A 驗收時 Docker 可用，發現
> `tests/session.spec.js:488`（建立球局後鍵盤焦點落到新卡片）是紅的，
> **二分確認引入點是本批的 `a27b91f`（F1-1 store 訂閱化）**：
>
> ```text
> 0be31a2  批 1 之前                             → 1 passed
> 7c1d1bc  test(arch-F1-7) lower dispatch golden → 1 passed
> a27b91f  feat(arch-F1-1) subscribe React pages → 1 failed   ← 引入點
> 7112d6d  批 1 收尾                              → 1 failed
> ```
>
> `--repeat-each=3` 為 3/3 紅（非 flaky）；`CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`
> 後仍紅（非 fixture 污染）。該紅燈另使 **31 個 `test:local` 測試從不執行**。
>
> 完整證據見 `docs/arch-reports/batch-F2A-acceptance-2026-08-24.md` §四；
> 修補派工單 `docs/arch-dispatch-2026-08-24-frontend-F1R.md`（2026-08-24 已發，優先度最高）。
>
> **本批其餘 ACCEPTED 結論不受影響**——F1-1〜F1-7 的功能目標、GOLDEN 逐字復位、
> testid 凍結、mock gate 全綠都經獨立重跑確認。受影響的只有「批 1 沒有引入迴歸」
> 這個隱含判斷，而它當初就沒有 `test:local` 的證據支撐。
>
> **後註補記（同日，F1R 驗收時）**：本批共查出**兩條**迴歸，第二條是 F1-5
> （`4be7a53`，MePage controlled 化）讓勾滿球場時 picker optimistic 收合產生
> 焦點掉 body 的 race（`4be7a53` 取樣 8/2、後續 HEAD 5/5）。兩條均已由 F1R
> （`e3a638f`／`d59e72a`／`0f57c1b`）修復並驗收 ACCEPTED，
> 見 `docs/arch-reports/batch-F1R-acceptance-2026-08-24.md`。

### 初驗退件三項與結案狀態

| 事項 | 類別 | 結案 |
| --- | --- | --- |
| F-A `react-surface-lifecycle.test.js` 三條新斷言無牙 | 守門退化＋回報陳述不實 | ✅ `70562a4` 修復，驗收方三條單條 canary＋兩個對抗性探針全紅 |
| F-B F1-4 的 sessionViews WeakMap 焦點／捲動機制未處置也未說明 | 驗收條件未對照 | ⚠️ 已交代（選項 A 保留），但其中 `drawerScrollPositions` 的理由經實測不成立，見 §六.3 |
| F-C 回報缺「改了什麼（檔案清單＋每檔一句話）」，5 檔完全未揭露 | 回報格式 | ✅ 24 檔逐檔補齊＋DOM 屬性差異可證偽腳本，驗收方獨立重跑一致 |

---

## 一、通過項目（全部由驗收方獨立重跑，不採信回報貼文）

### 1. 完整 gate [已驗證]

`npm run test:ci:frontend` 乾淨重跑 **exit 0**：

```text
# tests 284 / # pass 284 / # fail 0
4 skipped / 268 passed (2.4m)
production bundle check passed: 28 files, 12 demo identifiers absent;
main chunk 632763/184198 bytes within 703886/203176
$ git diff --check  → exit 0
```

三個數字與回報 §12 逐字吻合（Node 284、Playwright 268／4、bundle 632763/184198）。

**首次重跑曾出現 1 紅**（`mobile-chromium › smoke.spec.js:161 anonymous map discovery
renders only safe SessionSummary fields`，locator 30s timeout，call log 為
`element is not stable` ×4 → `element was detached from the DOM`）。追查結果為
**驗收方自造的機器負載**：我當時同時在跑 canary 的 `node --test`。證據兩則——

- 單獨 `--repeat-each=10 --retries=0` 取樣：10/10 通過（16.9s）。
- 全 gate 在無併發下重跑：exit 0。

依「單次綠紅都不算數」原則，判定非批 1 引入的迴歸。**但這條測試對機器負載敏感，
CI 上仍可能偶發**，建議後續批次留意（不列入本批退件事由）。

### 2. 回報指令逐條重跑 [已驗證] — 9/9 一致

| 回報位置 | 指令 | 重跑結果 |
| --- | --- | --- |
| §3.2 | `git show 0be31a2:src/main.js \| grep -c "renderMySessionsDestination()\|renderMeDestination()\|renderMessagesDestination()"` | `34` ✓ |
| §3.2 | 同上對 working tree | `0` ✓ |
| §4 | `grep -n "key={slot.generation}" src/app/App.tsx` | 空（`generation` 在 App.tsx 已完全消失） ✓ |
| §5 | `wireMySessionsPage\|wireSessionCards` 反向 grep（擴到 src tests scripts） | 空 ✓ |
| §6 | 五個 main 焦點符號反向 grep（擴到 src tests scripts） | 空 ✓ |
| §7 | `grep -c "rootElement.querySelector" src/pages/MePage.tsx` | `0` ✓ |
| §8 | 五個 join wire 符號反向 grep | 僅 `src/main.js:1179` 一則**註解**命中（見 §三觀察） ✓ |
| §11 | `wc -l`：main.js 1495→1242、sessionViews.js 2305→1998 | 逐字吻合 ✓ |
| §11 | `git diff --shortstat 0be31a2 HEAD` | `24 files changed, 1316 insertions(+), 1063 deletions(-)` 逐字吻合 ✓ |

追加自驗：`shouldReleasePendingMeFocus` 全 repo 反向 grep 為空（基準時存在於
main.js:108/962、meFocus.js:19、me-focus.test.js 五處）；`sessionViews.js` 的
`addEventListener` 由 45 降為 9；main.js 的 `activePage` 由 33 降為 10，殘留者為
`aria-current` 導覽狀態、四個頁面切換賦值、以及 main.js:488 一個 focus 守衛，
**零依 activePage 分派的重繪**——F1-1 驗收條件成立。

### 3. GOLDEN 復位 [已驗證] — 比回報的證據更強

回報用 process-substitution 只比對 `const GOLDEN = [...]` 區段。我改比整檔：

```text
$ git diff 0be31a2 HEAD -- tests/session-controller-sequence.test.js
（唯一 hunk 是檔頭註解：補記「2026-08-23 批 1 收尾恢復 2026-08-19 工作樹逐字錄製」）
```

整檔只有註解差異，因此 124 筆 payload、順序、字串與 `assert.deepEqual(entries, GOLDEN)`
斷言全部逐字復位，**不可能有為綠燈而重錄的空間**。過渡期 commit `7c1d1bc` 的檔頭
也確實寫明「批 1 收尾必須恢復完整 payload GOLDEN」（原文引自該 commit diff）。

### 4. DOM／testid 凍結 [已驗證]

全 `src/` 的 `data-testid` 集合在基準與 HEAD **byte 級相同**。sessionViews.js 少掉的
6 個（`drawer-collapse`、`join-cancel`、`join-confirm`、`join-open-my-sessions`、
`join-retry`、`join-success-title`）全部在 `SessionDetailSheet.tsx` 與 `sheets.js`
既有位置找得到，是重複渲染路徑退役而非契約流失。
`smoke.spec.js`、`performance.spec.js`、`error-boundary.spec.js`、`react-unmount.spec.js`
零修改（不在 diff 檔案清單內）。

### 5. 紅線與凍結面 [已驗證]

`git diff --name-only 0be31a2 HEAD` 過濾後**零命中**：`sheets.js`、`SurfaceHost.tsx`、
`dataApi.js`、`src/data/`、`.claude/rules/`、`package.json`／`package-lock.json`、
`supabase/`。追加：

- 單一 React root：`createRoot` 僅 `App.tsx:325`（`sessionViews.js:890` 是註解）。
- `SurfaceHost.tsx:57` 仍為 `flushSync(update);`（回報引用行號正確）。
- `App.tsx:338-340` 為 `commitPageAdapterSynchronously() { flushSync(renderApp); }`（引用正確）。
- `p_line_id: null` 仍在 `dataRepository.ts:420`；`src/` 除 `databaseTypes.ts`（生成檔）
  與該凍結呼叫點外無任何 `line_id` 消費者。
- 未引入 Redux／Zustand／TanStack Query（package.json 未動）。

### 6. 守門有牙（驗收方自造 canary） [已驗證]

**新增的 `tests/react-page-focus.spec.js`——三頁各自有牙**。我把 `App.tsx` 的
`key={slot.id}` 逐一改回會變動的 `key={slot.resetKey}`，一次只破壞一頁：

```text
canary me       (App.tsx:174) → EXIT=1  1 failed
canary messages (App.tsx:225) → EXIT=1  1 failed
canary mysessions (App.tsx:254) → EXIT=1  1 failed
```

回報只 canary 了 Me；三頁獨立覆蓋由本次驗收補證。canary 全部還原，`git status` 乾淨。

**`tests/ci-config.test.js` 的納入守衛有牙**。把 `react-page-focus` 從
playwright.config.js 三個 testMatch 移除：

```text
not ok 5 - both mock Chromium projects execute dedicated runtime safety specs
# pass 12 / # fail 1
```

### 7. 引用正確性抽查（防空殼引用） [已驗證]

回報 §8 宣稱「未修改的 performance gate 明確驗證 confirming 第一次 Escape 退 idle」。
實際 `tests/performance.spec.js:260-266` 原文：

```text
// 假設 1:confirming 態 Escape 先退回 idle,sheet 不關;第二次 Escape 才關閉。
await page.keyboard.press("Escape");
await expect(confirmation.locator('[data-join-stage="idle"]')).toBeVisible();
```

回報 §10 的計數宣稱亦可回溯到實際斷言：`react-surface-lifecycle.test.js` 的
14 個 sheet adapter（:18、:28）、13 個 lazy sheet（:47）、8 個 imperative adapter（:38）、
`eager: true` 恰 2（:45）、3 個頁面 lazy request（:49）——全部未被改動且綠。

### 8. 測試數字變因對得上 [已驗證]

Node 290 → 284：`me-focus.test.js` 恰刪 6 個只測已退役 `shouldReleasePendingMeFocus`
的案例（diff 逐案可數），production helper 確已不存在，屬合法退役而非為綠燈刪測。
Playwright 266 → 268：新 spec 在 desktop-chromium 與 mobile-chromium 各 1。

---

## 二、退件事項

### F-A（必修）`react-surface-lifecycle.test.js` 的三條新斷言是空的

`tests/react-surface-lifecycle.test.js:66-68` 新增：

```js
assert.match(detail, /enterConfirming\(expectedAccepted\)[\s\S]*?surfaceContent\.commit\(/);
assert.match(detail, /handleEscape\(\)[\s\S]*?surfaceContent\.commit\(/);
assert.match(detail, /setJoinPreview\(state\)[\s\S]*?surfaceContent\.commit\(/);
```

`[\s\S]*?` 無界，三條實際只證明「檔案裡某處存在一個 `surfaceContent.commit(`」，
沒有證明任何一個指令真的走 commit。更糟的是起點錨得太前：

- `handleEscape()` 首次命中在 **interface 宣告** `SessionDetailSheet.tsx:106`。
- `setJoinPreview(state)` 首次命中在**元件內 useImperativeHandle** `:747`。

兩者與 adapter 回傳契約區塊（`SessionDetailSheet.tsx:821-837`）完全無關。

**Canary（驗收方自造）**：只把 `setJoinPreview` 的 commit 包裝拔掉、其餘不動：

```text
    setJoinPreview(state) {
-     surfaceContent.commit(() => commands.current?.setJoinPreview(state));
+     commands.current?.setJoinPreview(state);
    },

$ node --test tests/react-surface-lifecycle.test.js
# tests 4 / # pass 4 / # fail 0   ← 仍綠
```

三條 commit 包裝**全部**拔掉才會紅（`not ok 4`, `# fail 1`）。也就是這條 gate 已退化成
「檔案裡至少有一個 `surfaceContent.commit(`」。

**加重情節**：被換掉的舊斷言（`if (!content.isSurfaceRootLive()) return false;`
與 `if (!renderStage(nextStage, message)) return;`）原本是這三個 imperative 指令的
唯一守門。runtime 面 `react-unmount.spec.js` 只有兩個案例，其中只有
`a pending join result cannot render after its detail sheet unmounts` 觸及此區，
**沒有覆蓋 `enterConfirming` / `handleEscape` / `setJoinPreview` 三個指令**。
因此回報 §9.1「沒有刪掉 lifecycle 保護」的陳述與事實不符。

runtime 行為本身沒破（`SurfaceHost.tsx:66-69` 的 `commit` 仍有 `if (!isLive) return;`），
所以這是**守門退化**而非功能迴歸。

**要求**：把斷言改成錨定的——例如先擷取 `mountSessionDetailSheetContent` 回傳物件那個
區塊，再對三個方法各自比對「方法體內」含 `surfaceContent.commit(`；或直接斷言該區塊內
`surfaceContent.commit(` 出現次數為 3。**並附自造 canary 證明單獨拔掉任一條會紅**
（單條 canary，不是三條全拔）。

### F-B（補件）F1-4 點名的 sessionViews WeakMap 焦點／捲動機制未處置也未說明

派工單 F1-4 原文：「main.js 的 captureMeFocus／…／suppressMeFocusRelease **與
sessionViews 的 WeakMap 焦點／捲動還原機制**失去存在理由」，驗收條件是「機制刪除後附
反向 grep」。

實際狀況（基準 4 個 WeakMap → 現在 2 個）：

| WeakMap | 現況 |
| --- | --- |
| `drawerBindings`（基準 :308） | 已刪 ✓ |
| `mySessionsRenderOptions`（基準 :312） | 已刪 ✓ |
| `drawerFocusIntents`（現 `sessionViews.js:305`） | **保留**，`:533/:538/:568/:570` 仍在用 |
| `drawerScrollPositions`（現 `sessionViews.js:307`） | **保留**，`:495/:499/:500` 仍在用 |

且 `renderNearbySessionsDrawer` 進場仍呼叫 `rememberFocusedSessionCard(root)` 與
`rememberDrawerScrollTop(root)`（`sessionViews.js:717-718`），commit callback 仍呼叫
`restoreFocusedSessionCard` / `restoreDrawerScrollTop`（`:746-747`）。

回報 §6 只列 main.js 五個符號，§13「未做事項」也未提及，違反回報格式
「未做／做不了的項目明說原因，不可留白」。

**我的傾向：保留可能是對的**——抽屜有 collapsed/open 切換與 60 秒靜默刷新，
`sessionViews.js:487-489` 的檔內註解（batch 18 覆蓋 batch 8 的 redraw-parity 決策）
說明捲動位置還原是刻意的產品行為，React 穩定 key 並不覆蓋這件事。
**要求：書面說明為什麼這兩個機制在 F1-2 穩定 key 之後仍有存在理由即可結案，
不必強行退役。**

### F-C（補件）回報缺「改了什麼（檔案清單＋每檔一句話）」

回報格式第一條要求逐檔一句話。實際 24 個改動檔中，下列 5 檔在整份回報**完全沒出現**：

- `src/sessionActions.ts`
- `src/controllerContracts.ts`
- `src/sessionPresentation.ts`
- `src/components/SessionCard.tsx`
- `src/sheets/CourtSessionSheet.tsx`

其中 `src/sessionActions.ts:361-364` 的改動帶了一個**新 DOM 屬性**
`data-notification-authoritative-disabled`（`MePage.tsx:424 / 439 / 534`）。
`.claude/rules/react-migration.md` 第 24 條「每批凍結 testid、id、class、aria、文案、
DOM 結構」。此屬性是加法、未動任何既有 e2e 斷言、testid 集合不變，**判定不構成違規**，
但屬於必須主動揭露的 DOM 變更。

**要求**：補上 24 檔清單與每檔一句話，並在其中明列此新屬性與它為何必要。

---

## 三、觀察事項（不阻擋本批，記錄給後續批次）

1. **`flushSync` 由 2 處增為 3 處**：新增 `src/sessionStore.ts:102`（external-store
   listener 內，用來保住公開 adapter 的同步 commit 契約）。回報 §3.1 有揭露設計，
   但沒點出影響：派工單 **F3-2 的驗收條件寫「`grep -rn "flushSync" src/` 僅剩（或少於）
   現有兩處」**，基準是 2 處。批 3 開工前要先決定這條驗收條件是否跟著改。
2. **新增的 `me` 通道不在 GOLDEN 指紋涵蓋範圍**：`sessionController.js` 五處新增
   `store.emit("me")`（`notifyMySessions`、`setCourts`、`setAuthSession`、`setProfile`、
   auth reconcile），但 sequence recorder 只錄 render／pins／players／mySessions。
   124 筆表逐字復位不等於覆蓋率不變——新通道目前零指紋。F1-7 沒要求擴表，
   但這是安全網的實際缺口，批 2 可考慮補。
3. **`controller.sessionStore = store`**（`sessionController.js:2172`）把原始 store
   併入 controller 公開 API。非紅線，但批 2 的 `ControllerApi` 契約要納入考量。
4. **`onBeforeStoreChange` 是每次 adapter render 新建的 inline arrow**
   （`sessionViews.js:728`），會讓 `useStoreSelector` 的 `subscribe` useCallback 每 render
   換 identity → 每次 commit 重新訂閱。功能正確（`useSyncExternalStore` 會重讀 snapshot），
   屬 churn，批 2 拆檔時順手處理即可。
5. **命名殘留**：`rerenderVisibleNotificationSettings`（`main.js:690`）現在只是
   `publishPageView("me", "mySessions")`，名稱裡的 "Visible" 已無意義；
   `main.js:1179` 註解仍提到已退役的 `wireSuccess`。
6. **`smoke.spec.js:161` 對機器負載敏感**（見 §一.1）。若 CI 上再出現同一條紅，
   優先懷疑 runner 負載而非邏輯。

---

## 四、未跑項目

- `npm run test:local`／`npm run test:db`：本批零 migration、零 `dataApi` 邊界變更、
  零 RPC 簽名變更，且 Docker daemon 未啟動。codex 已誠實揭露（回報 §0、§13）。
  **與批 0 同樣列入 REL 前必補跑**。
- WebKit（`npm run test:mock:webkit`）：非阻擋 job，本次未跑；
  `ci-config.test.js` 的 WebKit 鏡射斷言已涵蓋新 spec 的納入。

## 五、分歧線處置（2026-08-24 使用者拍板：不採計）

另一台機器的 `6534d6d`(F1-7)、`4eae743`(F1-1) **在本機 repo 不存在**：

```text
$ git cat-file -t 6534d6d → 致命錯誤: Not a valid object name
$ git cat-file -t 4eae743 → 致命錯誤: Not a valid object name
$ git log --all --oneline → 只有本機這條線
```

本機 8 個 commit 涵蓋 F1-1〜F1-7 **全部七項**（外加 F1-7 的降／升兩次），
是完整的一條線；另一台那 2 個 commit 只涵蓋 F1-1 與 F1-7 兩項，是同一批的部分重做。

**裁決（2026-08-24，使用者）**：那 2 個 commit 不記錄、不合併，**批 1 以本機這條線
（`0be31a2` → `7112d6d`）為唯一實作**。本檔不再追蹤該分歧線，後續批次亦不需回顧。

---

## 六、補件複驗（2026-08-24）

- 補件派工單：`docs/arch-dispatch-2026-08-24-frontend-F1-followup.md`
- 補件回報：`docs/arch-dispatch-2026-08-24-frontend-F1-followup-report-codex.md`
- 補件 commit：`70562a4 test(arch-F1-FU-1): strengthen session lifecycle guard`
- 交付邊界 [已驗證]：`git show --numstat 70562a4` 只有
  `29 3 tests/react-surface-lifecycle.test.js` 一檔，production code 零改動，
  與回報「未修改 production 檔」的聲稱一致。

### 6.1 F1-FU-1 守門補強：**PASS**

新作法（`tests/react-surface-lifecycle.test.js:12-27`、`:80-95`）以括號平衡的
`extractBracedBody` 三層錨定：factory → `return {` 契約 → 三個方法體，逐方法要求含
`surfaceContent.commit(`，另鎖契約內出現次數恰為 3。

**驗收方自造 canary（不採信回報貼文，全部重跑）**——三次各只拔一條 wrapper：

```text
canary enterConfirming → EXIT=1  not ok 4  # pass 3 / # fail 1
canary handleEscape    → EXIT=1  not ok 4  # pass 3 / # fail 1
canary setJoinPreview  → EXIT=1  not ok 4  # pass 3 / # fail 1
還原後                  → EXIT=0            # pass 4 / # fail 0
```

**追加兩個對抗性探針（派工單沒要求，驗收方自行加壓）**：

| 探針 | 手法 | 結果 |
| --- | --- | --- |
| 保 count 繞過 | 把 `setJoinPreview` 的 commit 拿掉，另在 `enterConfirming` 補一個冗餘 commit，讓契約內 count 仍為 3 | **紅**（`# fail 1`）——逐方法斷言擋下 |
| fail-closed | 把 `mountSessionDetailSheetContent` 改名讓錨點消失 | **紅**，錯誤訊息為 `missing source marker: export function mountSessionDetailSheetContent(`，不是靜默通過 |

canary 與探針全部還原，`git status --porcelain src/` 空輸出。

**async 路徑交代 [已驗證]**：回報 §2.7 的四處引用逐一核對原文，全部屬實——
`SessionDetailSheet.tsx:720-735` 的 `submitJoin` 確實只呼叫元件自己的 `setStage`；
`SurfaceHost.tsx:76-84` 的 `unmount` 先 `isLive = false` 再移除 portal；
`SurfaceHost.tsx:66-68` 的 `commit` 有 `if (!isLive) return;`；
`react-unmount.spec.js:44-78` 引用的四行斷言與檔內原文逐字相同。回報也主動更正了
原批 §9.1 的不實陳述。

### 6.2 F1-FU-3 逐檔揭露：**PASS**

24 檔 numstat 與逐檔一句話與 `git diff --numstat 0be31a2 7112d6d` 完全對得上。

`data-notification-authoritative-disabled` 的必要性**經驗收方獨立確認**：

- `tests/smoke.spec.js` 自基準以來**零修改**（`git diff --stat 0be31a2 HEAD -- tests/smoke.spec.js` 空）。
- 觸發此 marker 的測試 `a rerender inside a notification action stays authoritative
  over the disable restore` **在基準 `0be31a2` 就存在於同一行 2780**。

也就是說：F1-5 把 MePage 改成 controlled 之後，callback 內的權威重繪會替換節點，
舊的 disable-restore 邏輯會把 React 判定為權威 disabled 的新按鈕解鎖——這個 marker 是
為了讓一條**既有的凍結 e2e 斷言**繼續成立而加的，不是可有可無的裝飾。

回報 §5.1 的屬性集合 diff 腳本**由驗收方獨立重跑**（掃描集非空，18 個變動 src 檔）：

```text
files scanned: 18
data     baseline=55  head=56  added: data-notification-authoritative-disabled | removed: (none)
aria     baseline=11  head=11  added: (none) | removed: (none)
ids      baseline=24  head=24  added: (none) | removed: (none)
classes  baseline=183 head=183 added: (none) | removed: (none)
testids  baseline=26  head=26  added: (none) | removed: (none)
```

### 6.3 F1-FU-2 WeakMap：選項 A 已交代，但**一半的理由經實測不成立**

codex 選擇保留兩個 WeakMap 並各給理由，引用的六個測試名稱與行號**逐一核對屬實**
（`performance.spec.js:307/324/346/380` 四個 drawer 焦點測試、
`smoke.spec.js:1009/1069` 兩個 batch-18 捲動測試）。

派工單的選項 A 沒有要求 canary。驗收方仍自行做了載重測試，把「理由」從論述變成實測：

| 機制 | 手法 | 結果 |
| --- | --- | --- |
| `restoreFocusedSessionCard`（`drawerFocusIntents`） | 改成 no-op | **3 failed / 1 passed** → 確認載重，保留正確 [已驗證] |
| `restoreDrawerScrollTop`（`drawerScrollPositions`） | 改成 no-op | **2 passed** → 兩個 batch-18 測試照樣全綠 |

為了分辨「F1-2 讓它變冗餘」還是「這兩個測試本來就沒守到它」，在
`0be31a2` 的 detached worktree 做同一個實驗：

```text
基準 0be31a2 未動        → 2 passed
基準 0be31a2 restore no-op → 2 failed（含 smoke.spec.js:1115 的 toBe(200) 失敗）
批 1 後 70562a4 restore no-op → 2 passed
```

**結論 [已驗證]**：F1-2 的穩定 slot key 讓 `.nearby-drawer__scroll` 節點不再被替換，
瀏覽器自然保住 scrollTop，**`drawerScrollPositions` 與
`rememberDrawerScrollTop`／`restoreDrawerScrollTop` 已成冗餘**。
codex 在補件回報 §3.3 主張「穩定 key 並不能代替」——這半段不成立。

**為什麼不因此再退件一次**：

1. 補件派工單明列選項 A（保留＋書面理由）為合法路徑，沒有要求載重 canary；
   codex 的引用全部屬實，是推論的結論被更強的實驗推翻，不是造假或空殼引用。
2. 沒有任何東西壞掉——最壞情況是多餘的程式碼。
3. 現在動它屬於擴大範圍，且退役決策該在批 2 拆 `sessionViews.js` 時一併做。

**批 2 待辦（具體）**：退役 `drawerScrollPositions`、`rememberDrawerScrollTop`、
`restoreDrawerScrollTop` 三者，並保留 `drawerFocusIntents` 整套（已證明載重）。
兩個 batch-18 測試**不需要刪**：它們斷言的是使用者可觀察結果（refresh 後 scrollTop
仍為 200、短清單 clamp），這個結果退役後改由 React 的穩定 DOM 提供，測試照樣有意義——
只是不再釘住「哪個機制」提供它。

### 6.4 補件後完整 gate [已驗證]

驗收方在無並發下重跑：

```text
$ npm run test:ci:frontend        → EXIT=0
# tests 284 / # pass 284 / # fail 0
4 skipped / 268 passed (2.5m)
production bundle check passed: 28 files, 12 demo identifiers absent;
main chunk 632763/184198 bytes within 703886/203176
$ git diff --check                → EXIT=0
```

與補件回報 §7 逐字吻合。bundle 數字與批 1 初驗完全相同（補件只動測試檔，符合預期）。

---

## 七、後續動作

1. **本紀錄與三份 codex 文件於本次一併收錄提交**（2026-08-24 使用者拍板的提交時機）。
2. 批 1 共 9 個實作 commit（`0be31a2`..`70562a4`）**維持不 push**，push 由使用者執行。
3. 批 2 開工時處理 §六.3 的 `drawerScrollPositions` 退役，與 §三的六項觀察一併評估。
4. 批 3 開工前，先就 §三.1 的「`flushSync` 由 2 處增為 3 處 vs F3-2 驗收條件」拍板。
5. REL 前必補跑 `npm run test:local`／`npm run test:db`（與批 0 相同的既有待辦）。
