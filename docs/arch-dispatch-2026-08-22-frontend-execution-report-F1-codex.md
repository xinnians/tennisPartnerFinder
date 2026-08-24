# 前端架構批 1 執行報告（F1-1～F1-7）

- 派工單：`docs/arch-dispatch-2026-08-22-frontend.md`
- 執行分支：`claude/tennis-partner-finder-proto-xfrr6g`
- 基準：`0be31a2`
- 最終實作 HEAD：`7112d6d`
- 執行日期：2026-08-23（Asia/Taipei）
- 執行者：Codex

## 0. 結論摘要

- [已驗證] 依指定順序完成 F1-7 降解析度 → F1-1 → F1-2 → F1-3 → F1-4 → F1-5 → F1-6 → F1-7 升回全 payload；每項至少一個獨立 commit。
- [已驗證] 四頁已改為 React external-store 訂閱；`src/main.js` 三個 destination 分派呼叫由基準 34 降為 0。
- [已驗證] 四頁 generation-key remount、My Sessions/session-card wire 層、main 頁面焦點捕捉／還原層均已退役。
- [已驗證] Me 通知偏好、球場訂閱、presence 與 picker 展開態改為 React controlled state；`rootElement.querySelector` 為 0。
- [已驗證] Session Detail join 五態與 idle／confirming／success／error 事件來源已收進 React；confirming Escape 仍先退 idle，不關 sheet。
- [已驗證] 最終 GOLDEN 是與基準逐字相同的 124 筆完整 payload 表，不是批 1 過程中的 17 筆通道計數表。
- [已驗證] 最終 `npm run test:ci:frontend`：284 個 Node tests 全過、Playwright 268 passed／4 skipped、build 與 production bundle gate 通過。
- [已驗證] `sheets.js`、`SurfaceHost.tsx:57` 的 `flushSync`、`mountSurfaceContent`、13 個 lazy sheet 邊界、`.claude/rules/react-migration.md` 均未修改。
- [已驗證] `App.tsx` 的同步 page adapter commit 契約保留：最終為 `commitPageAdapterSynchronously()` → `flushSync(renderApp)`。
- [不確定] 未跑需要本機 Supabase 的 `npm run test:local`／`tests/session.spec.js`；本單要求的 mock frontend CI 與其中跨帳號路徑全綠。沒有 migration，未跑 DB reset／pgTAP。
- 本報告檔不在下列實作 commit 中；未 push。

## 1. Commit 清單與順序

```text
7c1d1bc test(arch-F1-7): lower dispatch golden resolution
a27b91f feat(arch-F1-1): subscribe React pages to session store
9754a4f refactor(arch-F1-2): stabilize React page slots
f228686 refactor(arch-F1-3): move page events into React
cd0b73d refactor(arch-F1-4): retire page focus restoration
4be7a53 refactor(arch-F1-5): control Me settings in React
9d4051d refactor(arch-F1-6): internalize session join state
7112d6d test(arch-F1-7): restore full dispatch golden
```

[已驗證] 每個 commit 前均執行 `npm run typecheck && npm run lint`，實際共同尾段為：

```text
> tsc --noEmit

> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts
（exit 0）
```

[已驗證] 每個 F 完成點均跑 `npm run test:ci:frontend`。F1-7 降級、F1-1、F1-2、F1-3 時為 Node 290 pass、Playwright 266 passed／4 skipped；F1-4 新增 focus gate 並退役 6 個舊 helper 單測後，F1-4、F1-5、F1-6、F1-7 收尾均為 Node 284 pass、Playwright 268 passed／4 skipped。各次 build／production bundle／`git diff --check` 亦為綠。

---

## 2. F1-7：GOLDEN 過渡解析度與恢復

### 2.1 先降解析度（`7c1d1bc`）

[已驗證] 完整 124 筆 `步驟|通道|payload` 暫時換成以下 17 筆「步驟＋通道次數」。逐筆變因只有解析度，不改 recorder、17-step 腳本或 controller：

| step | 過渡期指紋 |
| --- | --- |
| setCourts | render=1, pins=1, players=1 |
| initial-discovery | render=2, pins=2, players=2 |
| bounds-change | render=2, pins=2, players=2 |
| drawer | render=2, pins=2, players=2 |
| filters | render=4, pins=4, players=4 |
| sign-in | mySessions=5, render=2, pins=2, players=2 |
| courts-channel-with-open-form | surface:setCourts=2, render=2, pins=2, players=2 |
| blocks | mySessions=2 |
| player-layer-on | render=2, pins=2, players=2 |
| player-layer-off | render=1, pins=1, players=1 |
| gate-superseded | render=3, pins=3, players=3 |
| discovery-error | render=2, pins=2, players=2 |
| map-unavailable | render=1, pins=1, players=1 |
| location-denied | render=2, pins=2, players=2 |
| getters | 五個 getter 各 1 |
| sign-out | mySessions=1, render=1, pins=1, players=1 |
| sign-in-other-account | mySessions=5, render=2, pins=2, players=2 |

[已驗證] 檔頭同步寫明這是批 1 暫時解析度、不得為綠燈重錄、收尾必須恢復完整 payload。

### 2.2 收尾升回全 payload（`7112d6d`）

- [已驗證] 移除 `channelCountsByStep`，斷言恢復 `assert.deepEqual(entries, GOLDEN)`。
- [已驗證] `GOLDEN` 共 124 筆。
- [已驗證] 以 process-substitution `diff` 比對基準 `0be31a2` 與最終 HEAD 的 `const GOLDEN = [...]` 區段，空輸出；124 筆 payload、順序與字串均未重錄或改寫。
- [已驗證] 相對基準，本檔最終唯一差異是檔頭補記 2026-08-23 已恢復 2026-08-19 錄製表。

```text
$ node --test tests/session-controller-sequence.test.js
# tests 2
# pass 2
# fail 0
```

逐筆變因結論：降級時每一個 step 都只把 payload 與同 step 內次序壓成通道次數；升級時 17 筆粗指紋全部退役，124 筆原始 payload 全數原樣復位，因此沒有任何 controller payload 變因需要重錄。

---

## 3. F1-1：store 訂閱 hook（`a27b91f`）

### 3.1 實作

- `sessionStore` 新增逐通道 `{ state, version }` snapshot；每次 `emit` 都換 snapshot identity，即使 state、selector 結果或 mutable `filters` 引用沒變。
- `useStoreSelector` 以 `useSyncExternalStore` 訂閱具名通道；external-store listener 用 `flushSync` 保住公開 adapter 從 e2e 視角的同步 commit。
- MePage 訂閱 controller `me` 與 page-view `me`；MessagesPage 訂閱 `mySessions`；MySessionsPage 訂閱 controller `mySessions` 與 page-view `mySessions`；NearbySessionsDrawer 訂閱 `map`。
- `sessionSelectors.ts` 收斂 map／My Sessions view projection；`pageViewStore.ts` 承接 Me 與 My Sessions 的 view-only 狀態。
- main 的 activePage destination 重繪鏈退役；地圖 renderer 保留在 `map` 通道。

### 3.2 前後 grep

```text
$ git show 0be31a2:src/main.js | grep -c "renderMySessionsDestination()\|renderMeDestination()\|renderMessagesDestination()"
34

$ grep -c "renderMySessionsDestination()\|renderMeDestination()\|renderMessagesDestination()" src/main.js
0
```

### 3.3 「值沒變仍要重畫」逐通道處置

| 通道 | 處置 | 理由 |
| --- | --- | --- |
| `map` | 保留 | 每次既有 `publish()` 都 `emit("map")`；version 必增，不以 sessions／filters identity 去重。 |
| `mySessions` | 保留 | 每次 `notifyMySessions()` 都 emit；同值的權威 refresh 仍觸發 MySessionsPage 與 MessagesPage。 |
| `courts` | 保留 | 既有表單／surface 通道不改；`setCourts` 另明確 emit `me` 讓 Me 的清單同步。 |
| `me` | 明確化 | auth、profile、courts、mySessions/block 狀態變化均 emit；不依 selector value identity。 |
| page-view `me` | 保留 | notification／presence view push 每次 emit，hidden Me 也更新。 |
| page-view `mySessions` | 保留 | focus reason／session id 即使相同仍以 emit 世代交付。 |
| main activePage destination chain | 退役 | 四頁各自訂閱，不再由目前可見頁決定是否收到更新。 |

### 3.4 隱藏頁與跨帳號語意

[已驗證] lazy module 載入後，四個 page slot 仍長駐單一 App root；切頁只改 hidden／active 呈現，不 unmount。因此帳號切換時 `me` 與 `mySessions` emit 會同步送達隱藏元件，清掉前一帳號的 profile、roster、blocked list 與 messages。mock frontend CI 的跨帳號／scope 路徑全綠。

[推論] configured Supabase 跨帳號測試未在本機執行，但其公開 adapter、DOM/testid 與 dataApi 邊界沒有改；mock e2e 已驗證相同 render/切帳號接線。

---

## 4. F1-2：穩定頁面 slot（`9754a4f`）

- 四頁 slot key 改為穩定 `slot.id`；adapter render 只更新 props／resetKey，不再整樹 remount。
- `AppErrorBoundary` 改用顯式 `resetKey`；下一次 adapter render 仍可解除該頁 fallback。
- `commitPageAdapterSynchronously()` 與 `flushSync(renderApp)` 保留，未移除或靜默改變。
- `react-unmount.spec.js`、`error-boundary.spec.js` 零修改，全綠。

```text
$ grep -n "key={slot.generation}" src/app/App.tsx
（空輸出）
```

### Canary：頁面 render error → fallback → 下一次恢復

臨時測試 hook 讓 Me page render 拋錯，先斷言 page boundary fallback，再清除 hook 並呼叫下一次 `renderMePage`，正常內容恢復；臨時測試與 hook 均未提交。

```text
Running 1 test using 1 worker
✓ page boundary recovers after the next adapter render
1 passed
```

---

## 5. F1-3：React 事件收編（`f228686`）

- MySessionsPage action、segment、chat/session/open/create/back 與 success push 改為 React `onClick`。
- `SessionCard`、Nearby drawer cards、CourtSessionSheet cards 由 callback prop 直接接 React event。
- `wireMySessionsPage`、`wireSessionCards` 及全部呼叫點刪除；`data-my-action`、`data-open-session`、testid 與 DOM 結構保留。
- `smoke.spec.js` 零修改，全綠。

```text
$ grep -n "function wireMySessionsPage\|function wireSessionCards" src/sessionViews.js
（空輸出）

$ rg -n "wireMySessionsPage|wireSessionCards|querySelectorAll.*data-my-action|data-open-session.*addEventListener" src/sessionViews.js
（空輸出）
```

[已驗證] Nearby 的 pointer gesture／Escape listener 改由元件 effect 安裝，仍接在 frozen e2e 直接 dispatch 的既有 portal container；不是恢復 adapter 每次 commit 重綁。

---

## 6. F1-4：焦點機制退役（`cd0b73d`）

刪除 main 的 `captureMySessionsFocus`、`captureMeFocus`、`restoreMeFocus`、`captureMessagesFocus`、`suppressMeFocusRelease`，以及專屬 pending/generation/resolve 狀態。保留 async action helper 使用的通用 `canReceiveFocus`。

```text
$ grep -n "captureMeFocus\|restoreMeFocus\|captureMySessionsFocus\|captureMessagesFocus\|suppressMeFocusRelease" src/main.js
（空輸出）
```

### 焦點測試逐檔處置

| 檔案 | 處置 | 理由 |
| --- | --- | --- |
| `tests/me-focus.test.js` | 改寫／部分退役 | 刪除只測已退役 `shouldReleasePendingMeFocus` 的 6 案；保留 `canReceiveFocus` 5 案，因 notification/presence async action 仍使用。 |
| `tests/react-page-focus.spec.js` | 新增 | 直接驗證 Me、Messages、My Sessions adapter props update 後 focused DOM node identity 不變，不依 main restore。 |
| `playwright.config.js` | 納入新 spec | desktop Chromium、mobile Chromium、non-blocking mobile WebKit 覆蓋一致。 |
| `tests/ci-config.test.js` | 增加 inclusion guard | 防止新 focus spec 被 mock CI 靜默漏跑。 |
| `tests/smoke.spec.js`／`tests/performance.spec.js` | 保留、零修改 | 既有鍵盤／焦點旅程原樣全綠。 |

### Canary：破壞 Me 穩定 key

臨時只把 Me 的 key 改回 `slot.resetKey`，新增 focus gate 立即紅；還原後同一案例通過。臨時破壞未提交。

```text
Expected: { me: true, messages: true, mySessions: true }
Received: { me: false, messages: true, mySessions: true }
```

---

## 7. F1-5：MePage controlled 化（`4be7a53`）

- presence sharing／open-to-greeting、六個 notification preferences、球場 id Set、全選與 picker expanded 均由 React state 控制。
- props 權威值改變時同步 local controlled state；送出時 optimistic 更新，callback 失敗則回復最後權威值。
- `runNotificationSettingAction`／`runPresenceSettingAction` 保留 loading、error、disabled restore 與 focus 契約；不再把 checkbox／hidden DOM 當真實狀態。

```text
$ grep -c "rootElement.querySelector" src/pages/MePage.tsx
0

$ npx playwright test tests/smoke.spec.js --grep "Me notification settings|Me presence settings|failed presence setting|rerender inside notification|subscribing to every|unloaded court" --project=desktop-chromium
Running 6 tests using 1 worker
6 passed
```

[已驗證] 完整 frontend CI 另覆蓋 desktop/mobile 的通知偏好、全選/細選、unloaded catalogue、authoritative rerender、presence gate 與 rollback，既有 e2e assertion 零修改。

---

## 8. F1-6：SessionDetailSheet join 狀態機內部化（`9d4051d`）

- `SessionDetailSheet` 以 `useState` 持有 idle／confirming／submitting／success／error、message、expectedAccepted 與 join preview。
- idle、confirming、success、error 的按鈕事件改為 React `onClick`；double-submit 由 component ref gate；stage commit 後以 layout effect 套用既有焦點順序。
- 公開 `openSessionSheet` 名稱、參數與同步 `enterConfirming`／`setJoinPreview` 語意保留；imperative commands 經 `surfaceContent.commit` 同步提交。
- `mountSheet`／`sheets.js`／`mountSurfaceContent` 契約未改；adapter 只保留殼建立、callback bag 與 content contract forwarding。

```text
$ grep -n "function wireIdle\|function wireConfirming\|function wireSubmitting\|function wireSuccess\|function wireError" src/sessionViews.js
（空輸出）

$ npx playwright test tests/performance.spec.js --grep "keyboard dialogs trap focus" --project=desktop-chromium
1 passed

$ npx playwright test tests/smoke.spec.js tests/react-unmount.spec.js --grep "join|session detail|hash session link|copy|withdrawal|report" --project=desktop-chromium
19 passed
```

[已驗證] 未修改的 performance gate 明確驗證：confirming 第一次 Escape 退 idle 且主 CTA 聚焦，第二次 Escape 才關 sheet。未修改的 `react-unmount.spec.js` 驗證 pending join 在 surface unmount 後不可 render。

---

## 9. 守門測試調整（單獨列示）

### 9.1 `tests/react-surface-lifecycle.test.js`

F1-6 第一次完整 gate 的唯一紅燈：

```text
not ok 72 - Session Detail blocks both direct and async commits after its surface dies
error: The input did not match the regular expression
/if \(!content\.isSurfaceRootLive\(\)\) return false;/
# pass 283
# fail 1
```

變因：該 regex 掃描的正是被派工要求退役的 adapter `renderStage`。調整如下，沒有刪掉 lifecycle 保護：

- 保留 `SessionDetailSheet.tsx` mount 前的 `isSurfaceRootLive` guard。
- 新增三筆靜態斷言：`enterConfirming`、`handleEscape`、`setJoinPreview` 都必經 `surfaceContent.commit`。
- 新增反向斷言：adapter 不得復活 `content.renderStage`／`function renderStage`。
- 實際 browser `react-unmount.spec.js` 零修改且全綠。

調整後：

```text
$ node --test tests/react-surface-lifecycle.test.js
# tests 4
# pass 4
# fail 0
```

### 9.2 焦點守門

- `tests/me-focus.test.js`：因 production helper 已退役，6 個只測該 helper 的單測同步退役；5 個仍活著的 `canReceiveFocus` 測試保留。
- 新增 `tests/react-page-focus.spec.js`，把守門目標從「main 是否會補救 remount」改為「React props update 是否根本保住同一 focused node」。
- `playwright.config.js` 與 `tests/ci-config.test.js` 只負責確保新 spec 在相同 browser matrix 內，不放寬既有 testMatch。
- 計數變因：Node 290 → 284；Playwright 266 → 268（新 spec 在兩個 required Chromium project 各 1）。

### 9.3 GOLDEN

F1-7 兩次變更與 17 筆／124 筆變因已在第 2 節逐筆列出。最終 124 筆表與基準完全一致，沒有為綠燈改 payload。

### 9.4 未調整的既有 e2e

`tests/smoke.spec.js`、`tests/performance.spec.js`、`tests/error-boundary.spec.js`、`tests/react-unmount.spec.js` 均零修改；既有 testid／DOM assertion 沒有刪改。

---

## 10. 紅線與邊界核對

- [已驗證] 單一 React root 與 18 個 error surfaces 守門全綠。
- [已驗證] 14 個 React sheet adapter 與 13 個 non-home lazy sheet 邊界計數不變。
- [已驗證] `src/sheets.js`、`src/app/SurfaceHost.tsx` 未出現在 `0be31a2..7112d6d` diff。
- [已驗證] `SurfaceHost.tsx:57` 仍為 `flushSync(update)`。
- [已驗證] `App.tsx` 同步 adapter commit 保留；沒有移除論證需求。
- [已驗證] `.claude/rules/react-migration.md` 未修改。
- [已驗證] `dataApi`／Supabase import boundary、RPC 與資料 privacy allowlist 未修改。
- [已驗證] 公開 `renderMySessionsPage`、`renderMePage`、`openSessionSheet` 等 adapter export 名稱與參數保留。

---

## 11. 刪除量與最終靜態驗收

```text
                       baseline 0be31a2   final 7112d6d   net
src/main.js                         1495            1242  -253
src/sessionViews.js                 2305            1998  -307
```

對應 numstat：

```text
src/main.js          +64  -317
src/sessionViews.js  +75  -382
```

其他必要 grep：

```text
main destination dispatch calls: 0
App key={slot.generation}:        empty
main retired focus symbols:       empty
MePage rootElement.querySelector: 0
sessionViews page wire symbols:    empty
sessionViews join wire symbols:    empty
```

[已驗證] 全批 diff：24 files changed, 1316 insertions, 1063 deletions。兩個 legacy orchestration 檔合計淨減 560 行；新增量主要是 typed store/selectors、React-owned state/event handlers 與新 focus guard。

---

## 12. 最終驗收輸出

```text
$ npm run test:ci:frontend
...
1..279
# tests 284
# pass 284
# fail 0
...
Running 272 tests using 1 worker
4 skipped
268 passed (2.5m)
...
✓ 149 modules transformed.
✓ built in 906ms
production bundle check passed: 28 files, 12 demo identifiers absent; main chunk 632763/184198 bytes within 703886/203176
```

```text
$ git diff --check
（空輸出；exit 0）
```

## 13. 未做事項

- 沒有 push。
- 沒有修改 `.claude/rules/react-migration.md`。
- 沒有移除 App／SurfaceHost 的 `flushSync`。
- 沒有修改 `sheets.js`、sheet shell、`mountSurfaceContent` 或 lazy sheet 數量。
- 沒有引入 Redux、Zustand、TanStack Query。
- 沒有修改既有 Playwright assertions、testid 或刻意改 DOM 結構。
- 沒有跑需要本機 Supabase／Docker 的 `npm run test:local`、DB reset 或 pgTAP。
- 工作環境起初缺 `happy-dom`，依既有 lockfile 執行 `npm install`；package／lockfile 無 tracked 變更。npm 顯示既有 2 個 high severity audit findings，本批未擴張至 dependency/security 修復。
