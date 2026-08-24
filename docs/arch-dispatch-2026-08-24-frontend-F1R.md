# F1R 派工單：修批 1 引入的 local 模式焦點迴歸（先診斷再動手）

- 日期：2026-08-24
- 事由來源：`docs/arch-reports/batch-F2A-acceptance-2026-08-24.md` §四
- 開工 HEAD：`e907c40`
- 優先度：**高於 2A 補件與 2B**。理由見下方「為什麼先做這個」。

## 開工前必讀（讀磁碟上的現行版本）

1. `docs/arch-reports/batch-F2A-acceptance-2026-08-24.md` §四（二分證據）
2. `docs/arch-reports/batch-F1-acceptance-2026-08-24.md`（批 1 的驗收範圍與當時未跑 test:local 的揭露）
3. `.claude/rules/react-migration.md`（同步語意與 DOM 凍結條款）
4. `.claude/rules/testing.md`

---

## 為什麼先做這個

1. **使用者可見的無障礙迴歸**：建立球局後鍵盤焦點不再落到新卡片。
   390px 鍵盤走查是 `docs/mvp-plan.md` release checklist 的明列項目。
2. **它讓 31 個 `test:local` 測試從不執行**（失敗即中止）。2A 補件要補的 RPC 參數型別洞、
   以及 2C／2D 要動的 controller 與 view render／focus 路徑，唯一會跑真 RPC 的安全網
   目前是死的。
3. 診斷所需的理解（F1-1 訂閱化如何改變焦點交付時機）與 2C 高度重疊，先做省一次來回。

---

## 事實（驗收方 2026-08-24 實測，直接用，不必重查）

### 失敗現象

```text
$ npm run test:local
✘ tests/session.spec.js:488 › a complete profile creates a Taipei session with an explicit
  Taipei ISO timestamp and focuses its upcoming card

  Error: expect(locator).toBeFocused() failed
  Locator:  locator('#my-upcoming-sessions [data-session-id]').first()
  Expected: focused
  Received: inactive
  Timeout:  5000ms
  14 × locator resolved to <button type="button" data-session-id="614"
       data-open-my-session="" class="session-secondary">查看球局</button>

  斷言位置 tests/session.spec.js:532
  1 failed / 11 skipped / 31 did not run / 10 passed
```

元素找得到、也沒 disabled——**只是沒有被 focus**。

### 已排除的解釋

| 假設 | 驗證 | 結果 |
| --- | --- | --- |
| 2A 造成 | 基準 `f4080f2` 跑同一套 | 完全相同的失敗 → 不是 2A |
| fixture 累積污染 | `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test` 後重跑 | 仍然相同 → 不是 DB 狀態 |
| flaky | `a27b91f` 上 `--repeat-each=3` | **3 failed** → 不是 flaky |

### 二分結果：引入點是 `a27b91f`（F1-1 store 訂閱化）

每次都在乾淨的 detached worktree 只跑該條測試：

```text
0be31a2  批 1 之前                                  → 1 passed
7c1d1bc  test(arch-F1-7) lower dispatch golden      → 1 passed
a27b91f  feat(arch-F1-1) subscribe React pages …    → 1 failed   ← 引入點
9754a4f  refactor(arch-F1-2) stabilize page slots   → 1 failed
f228686  refactor(arch-F1-3) move page events       → 1 failed
cd0b73d  refactor(arch-F1-4) retire focus restore   → 1 failed
7112d6d  批 1 收尾                                   → 1 failed
```

### 相關程式碼位置（現行 HEAD）

真正呼叫 `.focus()` 的地方在 **adapter 的 commit callback 裡**：

`src/sessionViews.js:652-681` `scheduleMySessionsCreatedFocus(root, options)`：

```js
  if (focusSessionId && (focusInUpcoming || focusInNeedsAction)) {
    requestAnimationFrame(() => {
      const target = root.querySelector(
        "[data-created-session] [data-open-my-session], [data-created-session] [data-my-action='withdraw']"
      );
      if (!target || !onCreatedSessionFocus()) return;
      target.focus({ preventScroll: true });
    });
  }
```

`src/sessionViews.js:684-693` — 它只在 `renderMySessionsPage` 的第三個參數
（commit callback）裡被呼叫：

```js
export function renderMySessionsPage(root, options = {}) {
  renderMySessionsPageInApp(root, options, () => {
    setMySessionActionScope(root, ...);
    syncPendingMySessionActions(root);
    scheduleMySessionsCreatedFocus(root, options);
  });
}
```

而 `renderMySessionsPage` 的**唯一**呼叫點 `mountMySessionsDestination()`
（`src/main.js:721`）在整個 app 生命週期只被呼叫一次——開機時的 `src/main.js:1210`。

設定焦點目標的入口是 `src/main.js:839-846`：

```js
function showMySessionsPage(focusTarget = null, { focus = false } = {}) {
  activePage = "my-sessions";
  if (focusTarget?.sessionId != null) {
    createdSessionFocusId = focusTarget.sessionId;
    createdSessionFocusReason = focusTarget.reason ?? null;
    publishPageView("mySessions");
  }
```

`publishPageView`（`src/main.js:175-183`）寫進 `pageViewStore` 並 emit 通道；
`MySessionsPage.tsx:683` 以 `useStoreSelector(props.pageViewStore, "mySessions", …)` 訂閱。

### 驗收方的初步假說（**這是 [推論]，不是結論——不要當前提照抄**）

[推論] F1-1 之後，「建立球局 → 焦點落到新卡片」這條路徑走的是
`publishPageView("mySessions")` → store emit → React 重繪，**不再經過 imperative
`renderMySessionsPage` 呼叫**，因此 `renderMySessionsPageInApp` 的第三個 commit
callback 不會執行，`scheduleMySessionsCreatedFocus` 也就從未觸發。

[推論] mock 模式之所以全綠，是因為 mock e2e 大量以
`__importAppModule("sessionViews")` 直呼 `renderMySessionsPage`（全庫 115 處白箱直呼點），
走的正是仍然有效的 adapter 路徑；真實 app 的 store-emit 路徑沒有等價覆蓋。

**你的第一件事是驗證或推翻這兩個假說，不是照著它修。**

---

## 作法：先診斷，再動手

### 第一步：取得 runtime 證據

在 local harness 下加臨時探針（跑完刪除，不進 commit），至少回答：

1. 從「建立球局成功」到「My Sessions 頁呈現新卡片」之間，
   `renderMySessionsPage`（以及它的 commit callback）被呼叫了幾次？在哪個時點？
2. `scheduleMySessionsCreatedFocus` 有沒有被呼叫？若有，是在
   `focusInUpcoming || focusInNeedsAction` 判定為 true 之前還是之後？
   `root.querySelector("[data-created-session] …")` 當下找不找得到目標？
3. `pageViewStore` 的 `createdSessionFocusId` 在那個時點是什麼值？
   `onCreatedSessionFocus()` 有沒有被呼叫、回傳什麼？
4. 同一組探針在 `0be31a2`（綠）與 `a27b91f`（紅）各跑一次，**兩份輸出並列比對**。

**回報必須附這四題的實際 log 輸出。** 沒有 runtime 證據就直接改碼的修法會被退件——
這條路徑上有 `requestAnimationFrame`、store emit 世代、與 surface 存活判定三種時序，
猜錯抽象層會反覆。

### 第二步：修

修法自選，但必須滿足：

1. **不得回退 F1-1／F1-2 的訂閱化與穩定 key**。批 1 已 ACCEPTED，
   `key={slot.id}`、`useStoreSelector` 訂閱、`main.js` 已退役的 destination 分派鏈
   都不得復活。
2. **不得改任何既有 e2e 斷言、testid 或 DOM 結構**。`tests/session.spec.js:532`
   那條斷言一個字都不能改——它是要被修綠的目標，不是要被調整的對象。
   **（2026-08-24 修訂一）**：`session.spec.js:1948`（every Me control keeps focus
   through a background rerender）的 oracle 經查證與批 1 已驗收語意互斥，
   **依 `docs/arch-dispatch-2026-08-24-frontend-F1R-amendment-1.md` 的條件放行**；
   同根因的其他衝突依該修訂的窄預授權處理，其餘斷言禁令照舊。
3. 焦點交付的「一次性」語意要保留：`onCreatedSessionFocus()` 現行契約是
   「確認目標仍是同一個 sessionId 才清掉並回 true」（`src/main.js:744-750`），
   不可變成每次重繪都重新搶焦點。
4. 若修法牽動 `sessionViews.js` 或 `main.js` 的結構，**只做修好這個 bug 必需的最小改動**
   ——那兩個檔的拆分是 2C／2D，不要提前做。

### 第三步：補上會抓到同類 bug 的測試

現況是「mock 全綠、local 紅」——因為 mock e2e 走 adapter 直呼、真實路徑走 store emit。
只把 local 那條修綠，下次同樣的斷層還會再發生。

因此必須**新增一個 mock 模式的迴歸測試**，走真實路徑（建立球局 →
`showMySessionsPage` → store emit → 焦點落到新卡片），而不是直呼
`renderMySessionsPage`。這條測試在修好前必須紅、修好後綠。

---

## 驗收條件（每條附指令＋實際輸出）

1. **診斷證據**：第一步四題的 log，含 `0be31a2` 與 `a27b91f` 兩份並列比對。
2. **根因陳述**：用一段話說明實際機制，並標 `[已驗證]`；假說被推翻的部分也要寫出來。
3. **新增的 mock 迴歸測試**：
   - 在修復前的 HEAD（`e907c40`）上跑該測試 → **紅**，附輸出。
   - 修復後 → 綠，附輸出。
   - 若新增 `tests/*.spec.js`：同步 `playwright.config.js` 的三個 testMatch 與
     `tests/ci-config.test.js` 的納入守衛；若新增 `tests/*.test.js`：同步
     `package.json` 的 `test:session-unit`（`tests/ci-config.test.js:65-71` 會自動比對目錄）。
4. **`npm run test:local` 全綠**，且 `did not run` 為 0——附完整尾段輸出。
   這是本項的主要驗收標的：不只是那一條變綠，而是**原本沒跑的 31 個測試全部跑完且通過**。
   若其中又冒出別的紅燈，逐一判斷是既存問題還是本次引入，並附二分證據。
5. `npm run test:ci:frontend` 全綠（含新測試）。
6. `npm run test:db` 全綠。
7. 124 筆 GOLDEN 逐字不變：附
   `git diff 0be31a2 HEAD -- tests/session-controller-sequence.test.js`，
   應只有批 1 那個檔頭註解 hunk。
8. 全 `src/` 的 `data-testid` 集合與 `0be31a2` 相同（附可證偽的比對輸出，並確認掃描集非空）。
9. 臨時探針已全部移除：附 `git status --porcelain --untracked-files=no` 空輸出。
10. `git diff --check` 空輸出。

---

## 不在範圍（不要順手做）

1. 不動 2A 的四個 commit，也不做 2A 補件（A-1 RPC 參數型別、A-2 barrel 守門、A-3 揭露）
   ——那是另一張派工單。
2. 不做 F2-1〜F2-4 的拆檔（2C／2D）。
3. 不處理批 1 驗收紀錄 §三 的其他觀察與 §六.3 的 `drawerScrollPositions` 退役。
4. 不回退批 1 的任何已驗收成果。
5. 不改 `.claude/rules/`、CLAUDE.md、testid、既有文案。

若你認為其中任何一項應該提前處理，**提出建議，不要靜默實作**。

---

## 回報要求

寫成 `docs/arch-dispatch-2026-08-24-frontend-F1R-report-codex.md`，
**不列入實作 commit、不執行 push**。程式碼修改做成 commit，接在 `e907c40` 之後。

- 改了什麼（檔案清單＋每檔一句話）。
- 驗收條件逐條對照，每條附指令＋實際輸出，不是「已確認」三個字。
- 技術陳述帶 `[已驗證]`／`[推論]`／`[不確定]` tag。
- 診斷段落要寫出「哪個假說被推翻」，不要只寫最後成立的那個。
- 未做／做不了的項目明說原因，不可留白。

### 執行注意

- **本機 Supabase 與 Docker 目前是開著的**（驗收方 2026-08-24 確認），`test:local`
  與 `test:db` 都可跑，沒有理由跳過。
- 需要清空本機測試 DB 時，唯一入口是 `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`。
  驗收方已確認這條紅燈**不是** DB 狀態造成，reset 不會讓它變綠。
- 跑 Playwright 期間不要並發其他 `node --test` 或第二個 dev server。
  單一 timeout 類紅燈先用 `--repeat-each=10 --retries=0` 取樣再下判斷。
