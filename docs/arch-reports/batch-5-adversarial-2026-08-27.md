# 批 5 對立審查報告：syncCommit 條件式退役

- 日期：2026-08-27。審查對象：working tree（基準 `acd6fbb`，未 commit 的批 5 實作）。
- 受審文件：`docs/arch-dispatch-2026-08-27-batch5-synccommit-report-codex.md`（回報）、
  `docs/arch-reports/batch-5-synccommit-retention-2026-08-27.md`（理由書）。
- 審查立場：證偽。所有 mutation 皆已 byte-identical 還原（見 §7）。
- 開跑前確認 port 5174/5175 無平行 server（`lsof -iTCP:517{4,5} -sTCP:LISTEN` 空輸出）。

## 1. 殘留點「移除即紅」複跑（抽三）——PASS [已驗證]

### 1(a) `sessionStore.ts:102` `syncCommit(listener)` → `listener()`

- 紅：`TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/performance.spec.js
  --project=desktop-chromium --grep "a stale opening focus callback..." --repeat-each=3`
  → **3 failed（3/3 紅）**，失敗點與回報一致：

  ```text
  > 443 |   await expect(nextCard).toBeFocused();
  Expected: focused / unexpected value "inactive"
  ```

- 還原：`shasum -a 256 src/sessionStore.ts` =
  `3894d60f37e49f5d9934477ad5d7d1fcf8dc7b83302e24e140e4cc78a8d39d62`（等於回報 §11
  accepted hash）→ 同指令 **3 passed**。

### 1(b) `SurfaceHost.tsx:305` `commitSynchronously(update)` → `update()`

- 紅：`npx playwright test tests/map-and-bootstrap-smoke.spec.js --project=desktop-chromium
  --grep "refreshing the court catalogue during an in-flight decide detaches the buttons and
  leaves them locked after it resolves"`（即 `:377` 的測試）→ **1 failed**。
- 差異備註：我的 focused 單測失敗在 `:428` `toBeDisabled()`；回報的完整 mock 失敗在
  `:427` `isConnected` toBe(false)。同一測試、同一條同步 identity oracle 鏈的相鄰兩個
  斷言，紅的事實與歸因不變，不構成推翻。
- 還原：`src/app/SurfaceHost.tsx` SHA =
  `a0547f0b59273c293abc1cd12b49e3cce08c944a51110bc484111d99187b8f82`（等於回報 §11）
  → 同指令 **1 passed**。

### 1(c) `SurfaceHost.tsx:291` shell unmount 改裸 `commitSurfaceSlots()`

- 紅：`node --test tests/sheets-dom.test.js` → **`# tests 16 / # pass 8 / # fail 8`**，
  首兩條 `not ok 1 - surface isolation 在關閉與替換後 acquire/release 平衡`、
  `not ok 2 - sheets DOM 殼契約`。與回報 8/16 完全一致。
- 還原：SHA 回 `a0547f0b…` → **16/16 綠**。

## 2. 兩個移除點的判別力補測——PASS，移除裁定獨立確認 [已驗證]

### 2(a) `mountSurfaceContent` handle `.unmount()` 全消費者列舉

src 消費者（`rg -n '\.unmount\(|registerUnmount|unmountContent' src` 全掃）：

- `src/sessionViews.js` 15 處 `mounted.registerUnmount(content.unmount)`＋
  `src/sheets.js:133`（login modal）——全部把 unmount 交給 sheets.js 的 close chain。
- **close／replace 路徑**（`src/sheets.js:56` `unmountContent?.()` → `:63`
  `shell.unmount()`）：content 的非 flush slot delete 之後**同 stack 立即**進入保留的
  shell-unmount flush（`SurfaceHost.tsx:291`），latest snapshot 同時不含 content 與
  shell slot，`close()` 返回前 root 為空。1(c) 的 8/16 紅正是這條 flush 的載重證明。
  replace（`sheets.js:30` `closeSurface(root, { reason: "replace" })`）走同一 close。
- **error 路徑**：`close` 以 try/catch 分別收 unmountError 與 shellUnmountError
  （`sheets.js:54-75`），shell flush 在 rethrow **之前**執行完；caller 在 catch 裡看到
  的 DOM 已是 flush 後狀態。
- **closed 後補註冊路徑**（`sheets.js:42-45` 立即呼叫 unmount）：此時 shell flush 已把
  shell DOM（含 content root）整棵移出 document，standalone 的延後 renderer update 只
  清 detached 子樹，無人可觀測。`closeSurface` else 分支的 `root.innerHTML = ""`
  （`sheets.js:96`）作用在已空的 sheet-root 上，與 detached content root 的延後清理
  互不干涉（React 從自己保存的 container 引用移除子節點）。
- 無任何 sheet factory（`src/sheets/*.tsx`）在內部呼叫 `surfaceContent.unmount()`。

tests 消費者：`player-card-sheet-dom.test.js:83`（`act` 包裹，act 排空後才有下一個斷言，
非同步 DOM consumer）；`navigation-shell-smoke.spec.js:296`（messages harness 自己的
root unmount，走凍結 fixture 的 `syncCommit(root.render)`，與 SurfaceHost content
unmount 無關）；`app-errors.test.js:107` 只是掃描 predicate
（`/mountSurfaceContent\(/.test(...)`），非 runtime 消費者。

**結論：沒有找到「呼叫 content unmount 後同 stack 讀 DOM／斷言 root 空，且不隨後進入
shell unmount flush」的真實 consumer。回報聲稱成立。**

### 2(b) `react-unmount.spec.js` unmount-once oracle 機制

oracle 觀測的是 e2e hook `surfaceContentLifecycle.onUnmount`
（`tests/react-unmount.spec.js:46-48` push 進 `__surfaceContentUnmounts`），該 hook 在
`unmount()` 自身的 `finally` 內同步觸發（`SurfaceHost.tsx:321-324`），計數與 React
flush 完全無關；surface id 讀自 `rootElement.closest(".surface")`，hook 執行當下 shell
DOM 尚在（close chain 中 shell.unmount 還沒跑），flush 延後不影響 id 解析。斷言側全為
`expect.poll`／auto-retry locator。**flush 延後後 oracle 計數仍準確**——且本審查在
working tree（兩移除已生效）實跑 `react-unmount.spec.js --project=desktop-chromium`
= **7 passed**，`player-card-sheet-dom.test.js` = 1/1。

### 2(c) 最短探針（臨時檔，跑完已刪）

臨時測試 `tests/__b5-adversarial-probe.test.js`（happy-dom＋vite ssrLoadModule，仿
player-card unit 的 harness；因 scratchpad 無 node_modules，探針落在 repo 內跑完即刪）：

1. 控制組：`content.render(...)` 返回當下 `#probe-content` **已在 DOM**（保留的
   `:311` flush 同步可觀測）→ 證明探針有判別力。
2. 實驗組：`content.unmount()` 返回當下 `#probe-content` **仍在 DOM**（`:319` flush
   移除後，同 stack 延後窗口真實存在、可觀測）。
3. act 排空後節點清除（最終一致成立）。

結果 `# tests 1 / # pass 1 / # fail 0`。**這證明移除點的延後是「可觀測但無人觀測」，
而非「有人觀測但 oracle 不敏感」**——判別力由控制組背書，配合 2(a) 的全消費者列舉，
回報的「standalone content cleanup 沒有返回前 DOM consumer」裁定成立。

### 2(d) mount-failure 分支（`:279`）自癒路徑

`SurfaceShell`（`SurfaceHost.tsx:204-228`）恆渲染 `<section class="surface ...">`，
因此 `!surface` 分支只在 renderer 實質沒渲染任何東西時可達（renderer no-op／React root
已卸載；render 拋錯走的是 `:269-273` catch，該路徑本來就無 flush）。沒渲染 ⇒ rootElement
無 portal 子節點 ⇒ 被移除的 flush 本來就無事可清，也不存在 innerHTML 清場與延後
removeChild 的碰撞面。同 root 下一次 `mountSurfaceShell`：registry 已刪不擋路，
`slots.set` 後 `:268` 的保留 flush 會把 stale 未 flush snapshot 一併折入最新提交，
自癒成立。**無殘留問題。**[推論]（依 SurfaceShell 恆有 `.surface` 的原始碼結構推導；
production 中此分支近乎不可達，無既有測試直接覆蓋該分支移除後行為——與回報同觀察。）

## 3. 審計掃描完整性——PASS [已驗證]

- 全庫 `rg -n '\.emit\(' src`（不限目錄、不限 receiver 前綴）＝回報 §2.1 的 9 個呼叫點
  **加唯一一筆清單外命中** `src/controllerContracts.ts:176`——內容為 doc comment
  「``store.emit()`` 的完整 channel 集合」，非呼叫點，不影響結論。**無漏網 emit。**
- 「同步讀 DOM」反向掃：`rg -n 'document\.|querySelector|activeElement|getElementById|\.focus\(' src/controller src/sessionController.js` **零命中**（controller 層完全不碰
  DOM，emit 後同函式讀 DOM 在結構上不可能）；`src/features` 內 `setState|emit` **零命
  中**（features 無 store 寫入）。features 僅有兩處 DOM 觸碰：
  `shareFeature.js:17-25`（剪貼簿 textarea，與 store 無關）與
  `profileOrchestrationFeature.js:160-163`（save 後 focus `#me-root
  [data-testid="edit-profile"]`，但包在 `requestAnimationFrame` 內，非 same-stack 同步
  依賴；且它依賴的 caller A 本批保留，無風險）。**無 FAIL 級遺漏。**

## 4. 理由書品質——PASS（兩處小瑕疵）[已驗證]

逐點對照派工格式（同步觀察點 file:line＋移除即紅引用＋缺替代 handshake＋退役條件）：

- 五個保留點與兩個移除點七項俱全，無「React 需要」式空殼。抽驗引用皆屬實：
  `AppServicesProvider.tsx:277-285`（beforeStoreChange 接線）、
  `performance.spec.js:430-443`（同 stack 串接 click／focus，逐字核對）、
  `discoverySurfaceViews.js:84`、`sessionFormViews.js:479-487`、
  `sessionSurfaceViews.js:87-92`（皆為 factory 返回路徑上的立即 `querySelector`）。
- 瑕疵一（不影響結論）：理由書 §1 引 `NearbySessionsDrawer.tsx:199-203` 為「layout
  effect 立刻 restore」——實際 layout effect 在 **`:188-189`**
  （`useLayoutEffect(() => { restoreNearbyDrawerFocus(rootElement); ...`）；`:199-203`
  是同檔另一段 rAF focus。機制真實存在、同檔、行號偏差 11 行。
- 瑕疵二（更小）：§2.2 引 `sheets.js:46-75` 為 close chain，精確範圍是 `:48-76`。

## 5. 凍結面——PASS [已驗證]

- (a) `git diff acd6fbb --stat`：恰 `src/app/SurfaceHost.tsx`＋
  `tests/react-surface-lifecycle.test.js` 兩檔（4 insertions, 4 deletions）；untracked
  恰兩份文件（回報＋理由書）。
- (b) lifecycle 唯一 diff＝`:94` 標題，改後原文逐字：
  `test("synchronous React commits stay behind one fail-closed helper and approved callers", () => {`；
  `:109` `approvedCallers = ["app/SurfaceHost.tsx", "sessionStore.ts"]`、`:114`
  `assert.ok(callers.length > 0, ...)`、`:15` `SYNC_COMMIT` 頂層 read 皆零 diff；
  `tests/fixtures` 整目錄零 diff。
- (c) 回報 §8 凍結清單自跑 `git diff --exit-code acd6fbb -- <九個 e2e spec、src/views、
  src/sheets、sessionViews.js、sheets.js、syncCommit.ts、tests/fixtures>` → 無輸出。
- (d) `rg -n "line_id|session_contacts" src`（12 行）與 `git grep` 基準逐行 diff 相同。
- (e) `rg -o 'window\.__importAppModule' tests | wc -l` = **110**。
- (f) 四檔 SHA-256 與回報 §11 逐字節相符（SurfaceHost `a0547f0b…`、sessionStore
  `3894d60f…`、syncCommit `c052ca73…`、lifecycle test `7efd82cc…`）。

## 6. B 群／A 群相容——PASS [已驗證]

- `node --test tests/react-surface-lifecycle.test.js` = **`# tests 6 / # pass 6 /
  # fail 0`**。
- A 群兩字面斷言（`:80` `/commitSynchronously\(commitSurfaceSlots\)/`、`:81`
  `/commitSynchronously\(update\)/`）由真實保留呼叫點背書，非殘影：working tree
  `SurfaceHost.tsx:268`／`:291`／`:311` 為 `commitSynchronously(commitSurfaceSlots)`，
  `:305` 為 `commitSynchronously(update)`（1(b)(c) 的 mutation 紅即其載重證明）。

## 7. 收尾——PASS [已驗證]

- 開工存底 `b5-baseline.patch`（1964 bytes，SHA `86c2a4c9…`）；結束時
  `git diff acd6fbb -- src tests` 重新落檔並 `cmp` → **CMP_BYTE_IDENTICAL**。
- 每次 mutation 後亦以 diff SHA 對回 `86c2a4c9…` 驗證還原。
- 探針 `tests/__b5-adversarial-probe.test.js` 已刪（`ls` 確認不存在）；`git status`
  僅剩批 5 原有兩檔修改＋兩份文件，repo 無殘留暫存檔。
- 審查過程一次誤操作：一條指令鏈誤含 `git stash`，當下即以 `git stash pop` 還原並以
  diff SHA `86c2a4c9…` cmp 存底確認 byte-identical，未損及任何檔案；之後所有 SHA／
  凍結檢查均在還原後重跑取證。

## 總評

- **被推翻的聲稱：無。** 三個抽測的「移除即紅」全數重現（3/3 紅、:377 紅、8/16 紅），
  還原 SHA 與回報一致；唯一觀察差異是 1(b) focused 單測紅在 `:428` 而回報完整 mock
  紅在 `:427`——同測試同鏈相鄰斷言，不構成推翻。
- **兩個移除點獨立判定：移除正確。** content unmount（:319）：全消費者列舉找不到
  「unmount 後同 stack 讀 DOM 且不進 shell flush」的路徑，探針證明延後窗口可觀測但
  無人觀測（控制組證明探針有判別力），unmount-once oracle 是 flush 無關的呼叫計數；
  mount-failure cleanup（:279）：`SurfaceShell` 恆渲染 `.surface` ⇒ 該分支可達時必無
  portal 子節點 ⇒ 無可觀測殘留，下一次 mount 的保留 flush 完成自癒。
- **審計掃描完整性裁決：成立。** 全庫寬鬆 emit 掃描僅多出一筆 doc comment；controller
  層零 DOM 觸碰、features 層零 store 寫入，「emit 後同步讀 DOM」在結構上只剩理由書已
  收錄的 Nearby Drawer 一路。
- 建議（不阻擋驗收）：理由書兩處行號小偏差（`:188-189` 與 `:48-76`）可在入版時順手
  修正。
