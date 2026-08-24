# 批 1 補件派工單（F1-FU-1〜F1-FU-3）

- 日期：2026-08-24
- 對應派工單：`docs/arch-dispatch-2026-08-22-frontend.md`
- 對應執行報告：`docs/arch-dispatch-2026-08-22-frontend-execution-report-F1-codex.md`
- 驗收結論來源：`docs/arch-reports/batch-F1-acceptance-2026-08-24.md`（結論：條件式退件）
- 基準：`0be31a2`　現行 HEAD：`7112d6d`（8 個 commit，不 push）

## 開工前必讀（讀磁碟上的現行版本，不要用記憶或舊快照）

1. `CLAUDE.md`
2. `.claude/rules/react-migration.md`
3. `docs/arch-dispatch-2026-08-22-frontend.md`（總則＋驗收協定）
4. `docs/arch-reports/batch-F1-acceptance-2026-08-24.md`（本補件的事由與證據）

## 背景與定位

批 1 的**實作本體已通過驗收**：七項功能目標全達成、完整 gate 綠、紅線零觸碰、
GOLDEN 124 筆逐字復位、testid 集合 byte 級不變。

本補件**不要求回頭改實作邏輯**，只處理三件事：一條被改弱的守門測試（必修），
與兩處回報缺漏（可用書面說明結案）。

**範圍紅線**：除 F1-FU-1 允許修改 `tests/react-surface-lifecycle.test.js`（以及若
你判斷需要，`src/sheets/SessionDetailSheet.tsx` 內為了讓斷言可錨定而做的等價重排）
之外，**不得動任何其他實作檔**。不擴大範圍、不順手重構、不改文案、不改 testid。

---

## F1-FU-1（必修）把 `react-surface-lifecycle.test.js` 的三條斷言改成有牙的

### 目標與動機

`tests/react-surface-lifecycle.test.js` 的第 63〜70 行測試
`"Session Detail blocks both direct and async commits after its surface dies"`
在批 1 被改寫。原本的兩條斷言：

```js
assert.match(SESSION_VIEWS, /if \(!content\.isSurfaceRootLive\(\)\) return false;/);
assert.match(SESSION_VIEWS, /if \(!renderStage\(nextStage, message\)\) return;/);
```

被換成三條新斷言（現行 :66-68）：

```js
assert.match(detail, /enterConfirming\(expectedAccepted\)[\s\S]*?surfaceContent\.commit\(/);
assert.match(detail, /handleEscape\(\)[\s\S]*?surfaceContent\.commit\(/);
assert.match(detail, /setJoinPreview\(state\)[\s\S]*?surfaceContent\.commit\(/);
```

**問題：這三條是空的。** `[\s\S]*?` 無界，實際只證明「檔案裡某處存在一個
`surfaceContent.commit(`」，沒有證明任何一個指令真的走 commit。而且起點錨得太前：

- `handleEscape()` 的**首次**字面命中在 interface 宣告 `SessionDetailSheet.tsx:106`
  （`handleEscape(): boolean;`），與 adapter 契約無關。
- `setJoinPreview(state)` 的**首次**字面命中在元件內 `useImperativeHandle`
  的 `SessionDetailSheet.tsx:747`，同樣與 adapter 契約無關。

真正該被守住的是 `mountSessionDetailSheetContent`（`SessionDetailSheet.tsx:796`）
回傳物件那個區塊（**:821-837**）：

```js
  return {
    enterConfirming(expectedAccepted) {
      surfaceContent.commit(() => commands.current?.enterConfirming(expectedAccepted));
    },
    handleEscape() {
      let handled = false;
      surfaceContent.commit(() => {
        handled = commands.current?.handleEscape() ?? false;
      });
      return handled;
    },
    isSurfaceRootLive: surfaceContent.isSurfaceRootLive,
    setJoinPreview(state) {
      surfaceContent.commit(() => commands.current?.setJoinPreview(state));
    },
    unmount: surfaceContent.unmount,
  };
```

### 驗收方已做的 canary（這是退件的直接證據，不要重複爭論）

只把 `setJoinPreview` 的 commit 包裝拔掉、其餘兩條原封不動：

```text
    setJoinPreview(state) {
-     surfaceContent.commit(() => commands.current?.setJoinPreview(state));
+     commands.current?.setJoinPreview(state);
    },

$ node --test tests/react-surface-lifecycle.test.js
# tests 4 / # pass 4 / # fail 0     ← 仍綠，gate 沒抓到
```

三條 commit 包裝**全部**拔掉才會紅（`not ok 4`、`# fail 1`）。也就是這條 gate 已
退化成「檔案裡至少有一個 `surfaceContent.commit(`」。

### 加重情節（必須在回報中正面回應）

被換掉的舊斷言，原本是這三個 imperative 指令在靜態層的**唯一**守門。runtime 面
`tests/react-unmount.spec.js` 全檔只有 2 個 `test(`：

```text
:18  closing and replacing sheets unmount each SurfaceHost portal exactly once
:44  a pending join result cannot render after its detail sheet unmounts
```

**沒有任何案例覆蓋 `enterConfirming` / `handleEscape` / `setJoinPreview` 三個指令
在 surface 死亡後被呼叫的情形。**

因此執行報告 §9.1 的「沒有刪掉 lifecycle 保護」是不成立的陳述，補件回報中請一併更正。

（釐清：runtime 行為本身沒破——`src/app/SurfaceHost.tsx:66-68` 的 `commit` 仍有
`if (!isLive) return;`。這是守門退化，不是功能迴歸，所以不需要改 runtime 邏輯。）

### 作法（不指定實作，只給邊界）

把三條斷言改成**錨定在回傳契約區塊內**的判準。可行方向舉例（擇一或自訂）：

- 先從 `detail` 擷取 `mountSessionDetailSheetContent` 的 `return {...};` 區塊，
  再對三個方法各自比對「該方法體內」含 `surfaceContent.commit(`；
- 或直接斷言該區塊內 `surfaceContent.commit(` 的出現次數恰為 3，並各自比對方法名
  與 commit 的相鄰關係。

**不要**用 `[\s\S]*?` 跨越整檔的寫法；**不要**放寬成「只要有一個就好」。
`assert.doesNotMatch(SESSION_VIEWS, /content\.renderStage|function renderStage/)`
這條反向斷言本身有牙，保留不動。

### 驗收條件（可觀察、可證偽）

1. **單條 canary 三次全紅**。回報必須附三段各自獨立的 canary：每次**只**拔掉一條
   commit 包裝（另外兩條保持原樣），跑 `node --test tests/react-surface-lifecycle.test.js`
   附完整輸出，三次都必須是 `not ok` + `# fail 1`。三條全拔的 canary **不算數**。
2. 三次 canary 之後還原，附 `git status --porcelain` 空輸出證明工作區乾淨。
3. 還原後 `node --test tests/react-surface-lifecycle.test.js` 為 `# pass 4 / # fail 0`。
4. **async 路徑覆蓋要交代清楚**：舊斷言 `if (!renderStage(nextStage, message)) return;`
   守的是 async join 結果回來時 surface 已死的情形。請以 `檔案:行號` 指出現在是哪個
   機制承接它（runtime 或靜態皆可），並說明為什麼足夠。若判定 `react-unmount.spec.js:44`
   已覆蓋，請引用該測試檔內的實際斷言原文佐證。
5. `npm run test:ci:frontend` 全綠，輸出貼進回報。

---

## F1-FU-2（補件）交代 `sessionViews.js` 的 WeakMap 焦點／捲動還原機制

### 目標與動機

派工單 F1-4 原文點名的範圍是：

> main.js 的 captureMeFocus／restoreMeFocus／captureMySessionsFocus／
> suppressMeFocusRelease **與 sessionViews 的 WeakMap 焦點／捲動還原機制**失去存在理由。
> **驗收**：機制刪除後附反向 grep；……

執行報告 §6 只處理了 main.js 那五個符號，`sessionViews` 這半段**既沒做、也沒說**，
§13「未做事項」同樣沒提。這違反總則的回報格式：「未做／做不了的項目明說原因，不可留白」。

### Ground truth（驗收方 2026-08-24 實測，直接用，不必重查）

基準 `0be31a2` 的 `src/sessionViews.js` 有 4 個 WeakMap：

```text
308:const drawerBindings = new WeakMap();
309:const drawerFocusIntents = new WeakMap();
311:const drawerScrollPositions = new WeakMap();
312:const mySessionsRenderOptions = new WeakMap();
```

現行 HEAD 剩 2 個：

```text
305:const drawerFocusIntents = new WeakMap();
307:const drawerScrollPositions = new WeakMap();
```

`drawerBindings`、`mySessionsRenderOptions` 已刪 ✓。保留的兩個仍在使用：

```text
490:function rememberDrawerScrollTop(root)
498:function restoreDrawerScrollTop(root, drawerState)
509:function rememberFocusedSessionCard(root)
567:function restoreFocusedSessionCard(root)
495 / 499 / 500        drawerScrollPositions 讀寫
533 / 538 / 568 / 570  drawerFocusIntents 讀寫
717-718               renderNearbySessionsDrawer 進場呼叫 remember*
729-730               onBeforeStoreChange 內呼叫 remember*
746-747               commit callback 內呼叫 restore*
```

### 驗收方的傾向（供參考，不是指定答案）

我傾向**保留是對的**：抽屜有 collapsed／open 切換與 60 秒靜默刷新，
`sessionViews.js:487-489` 的檔內註解自陳「Batch 18 deliberately overturns Batch 8's
redraw-parity decision: an open drawer keeps its reading position across the
60-second quiet refresh」——捲動位置還原是刻意的產品行為，F1-2 的穩定 key 並不覆蓋它。

### 驗收條件（二擇一）

**選項 A：保留＋書面理由（預期路徑）**

- 在補件回報中單獨列節，逐一說明 `drawerFocusIntents` 與 `drawerScrollPositions`
  在 F1-2 穩定 key 落地之後**仍有存在理由**，每個理由附 `檔案:行號` 或測試名稱佐證。
- 明確回答：React 穩定 key 保住了什麼、沒保住什麼，這兩個 WeakMap 補的是哪一段。
- 不需要改任何程式碼。

**選項 B：退役**

- 附退役後的反向 grep 空輸出；
- 附一個 canary 證明抽屜的焦點意圖／捲動位置行為**確實**已由既有測試守住
  （否則等於把保護刪成裸奔）；
- `npm run test:ci:frontend` 全綠。

兩條路都可以，但**必須明確選一條並說明為什麼**。

---

## F1-FU-3（補件）補上「改了什麼」的 24 檔清單與新 DOM 屬性揭露

### 目標與動機

總則的回報格式第一條要求「改了什麼（檔案清單＋每檔一句話）」。現行執行報告是
依 F 項敘述的，沒有逐檔清單，導致下列 5 檔**在整份報告完全沒有出現過**：

```text
src/sessionActions.ts
src/controllerContracts.ts
src/sessionPresentation.ts
src/components/SessionCard.tsx
src/sheets/CourtSessionSheet.tsx
```

其中 `src/sessionActions.ts:361-364` 的改動帶進一個**新的 DOM 屬性**：

```js
    resolveControls: () =>
      unlockedDescriptors.map((descriptor) => {
        const control = findNotificationControl(root, descriptor);
        return control?.dataset.notificationAuthoritativeDisabled === "true" ? null : control;
      }),
```

對應 `src/pages/MePage.tsx:424`、`:439`、`:534` 新增
`data-notification-authoritative-disabled`。

**驗收方已判定這不構成違規**：它是加法、未修改任何既有 e2e 斷言、全 `src/` 的
`data-testid` 集合與基準 byte 級相同。但 `.claude/rules/react-migration.md` 第 24 條
「每批凍結 testid、id、class、aria、文案、DOM 結構與全域 CSS」，這類 DOM 變更屬於
**必須主動揭露**的項目，不能只在 diff 裡默默存在。

### Ground truth：本批 24 個改動檔（`git diff --numstat 0be31a2 HEAD`）

```text
3	3	playwright.config.js
44	35	src/app/App.tsx
3	1	src/components/SessionCard.tsx
1	0	src/controllerContracts.ts
64	317	src/main.js
0	24	src/meFocus.js
21	0	src/pageViewStore.ts
132	83	src/pages/MePage.tsx
16	3	src/pages/MessagesPage.tsx
236	38	src/pages/MySessionsPage.tsx
173	19	src/pages/NearbySessionsDrawer.tsx
5	1	src/sessionActions.ts
13	46	src/sessionController.js
1	0	src/sessionPresentation.ts
41	0	src/sessionSelectors.ts
58	2	src/sessionStore.ts
75	382	src/sessionViews.js
3	1	src/sheets/CourtSessionSheet.tsx
332	69	src/sheets/SessionDetailSheet.tsx
8	1	tests/ci-config.test.js
1	35	tests/me-focus.test.js
80	0	tests/react-page-focus.spec.js
4	2	tests/react-surface-lifecycle.test.js
2	1	tests/session-controller-sequence.test.js
```

### 驗收條件

1. 補件回報含**完整 24 檔清單**，每檔一句話說明改了什麼、屬於哪個 F 項。
2. 單獨列節說明 `data-notification-authoritative-disabled`：為什麼需要它、
   它解決什麼問題、為什麼不能用既有屬性或 React state 表達、
   以及它不影響任何既有 e2e 斷言的證據。
3. 順帶確認並回報：本批是否還有其他**新增／移除的 DOM 屬性、id、class 或 aria**。
   若有，逐一列出；若沒有，附一個可證偽的檢查（例如對變動檔比對
   `data-*` 屬性集合的 baseline↔HEAD diff）證明「沒有」。

---

## 不在本補件範圍（驗收方已記錄，不要順手處理）

下列六項是驗收紀錄 §三的觀察，**不阻擋批 1**，也**不要**在本補件動它們：

1. `flushSync` 由 2 處增為 3 處（新增 `src/sessionStore.ts:102`）——與批 3 的 F3-2
   驗收條件相衝，由使用者在批 3 開工前另行拍板。
2. 新增的 `me` 通道不在 GOLDEN 指紋涵蓋範圍（`sessionController.js` 五處
   `store.emit("me")`）——留給批 2 評估。
3. `controller.sessionStore = store`（`sessionController.js:2172`）併入公開 API——
   批 2 的 `ControllerApi` 契約議題。
4. `onBeforeStoreChange` 是每次 render 新建的 inline arrow（`sessionViews.js:728`）
   造成重複訂閱 churn——批 2 拆檔時順手處理。
5. 命名殘留：`rerenderVisibleNotificationSettings`（`main.js:690`）、
   `main.js:1179` 提到已退役 `wireSuccess` 的註解。
6. `smoke.spec.js:161` 對機器負載敏感（驗收方首跑曾因並發而假紅，
   `--repeat-each=10` 10/10 過、無並發全跑 exit 0）。

若你認為其中任何一項應該提前處理，**提出建議，不要靜默實作**。

---

## 回報要求

### 交付形式

寫成新文件 `docs/arch-dispatch-2026-08-24-frontend-F1-followup-report-codex.md`，
**不列入實作 commit、不執行 push**。驗收後由驗收方連同批 1 執行報告與驗收紀錄
一併收錄提交。

程式碼修改（F1-FU-1）照常做成 commit，接在 `7112d6d` 之後。

### 每項回報格式

- 改了什麼（檔案清單＋每檔一句話）。
- 驗收條件逐條對照：每條附**指令＋實際輸出**，不是「已確認」三個字。
- 技術陳述帶 `[已驗證]`／`[推論]`／`[不確定]` tag；「已刪除／已歸零」類聲稱附反向 grep 輸出。
- canary 一律附完整輸出（紅的那次與還原後綠的那次都要）。
- 未做／做不了的項目明說原因，不可留白。

### 收尾必跑

`npm run test:ci:frontend` 全綠＋`git diff --check` 空輸出，輸出貼進回報。

**注意**：跑 Playwright 期間不要同時跑其他 `node --test` 或第二個 dev server。
驗收方首次重跑就因並發造成 `smoke.spec.js:161` 假紅（`element is not stable`
→ `element was detached from the DOM`）。若遇到單一 timeout 類紅燈，先用
`--repeat-each=10 --retries=0` 取樣再下判斷，單次紅不算證據。

### 已知環境前提

- 本機 Supabase／Docker 未啟動，`npm run test:local`、`npm run test:db` 本批不跑
  （零 migration、零 `dataApi` 邊界變更、零 RPC 簽名變更），沿用批 1 的揭露即可。
- WebKit 是非阻擋 job，不強制跑。
