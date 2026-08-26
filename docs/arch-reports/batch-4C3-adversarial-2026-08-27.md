# 批 4C-3 對立審查報告（restore focus＋首幀 rAF 遷入 SurfaceHost）

- 日期：2026-08-27。審查對象：working tree（未 commit，基準 `a2a8fa5`）與
  `docs/arch-dispatch-2026-08-27-batch4C3-restore-report-codex.md`。
- 派工單：`docs/arch-dispatch-2026-08-27-batch4C3-restore.md`。
- 紀律自證：開工即 `git diff a2a8fa5 -- src tests` 存底（14,713 bytes）；每條 canary
  後 byte-identical 還原；結束 `cmp` 存底＝`BYTE-IDENTICAL`（見 §8）。全程未
  commit、未 push。
- 前置對齊：`git diff --stat a2a8fa5 1645569 -- src/app/SurfaceHost.tsx src/sheets.js
  tests/sheets-dom.test.js` 空輸出——a2a8fa5 只是派工單 docs commit，src/tests 與
  4C-2 accepted `1645569` 完全相同，兩基準可互換。[已驗證]

## 1. Canary ×3 複跑 — PASS（一項回報保真瑕疵，見總評）

複跑前基準：`node --test tests/sheets-dom.test.js` → `# tests 16 / # pass 16 /
# fail 0`，exit 0。[已驗證]

### (A) 拿掉 `target.drawerId` 條件（無條件 drawer fallback）— PASS

mutation：`SurfaceHost.tsx:123-126` 三元式改為無條件
`scope.querySelector('[data-testid="drawer-collapse"]') ?? scope.querySelector("#nearby-sessions-toggle")`。

紅（exit 1，逐字）：

```text
not ok 13 - 非抽屜 restore target 消失後不回退到 drawer 控制項
  error: |-
    Expected values to be strictly equal:

    true !== false
  operator: 'strictEqual'
  stack: file:///Users/ian/tennisPartnerFinder/tests/sheets-dom.test.js:401:10
# tests 16
# pass 14
# fail 2
```

還原後綠（exit 0）：`ok 13 - 非抽屜 restore target 消失後不回退到 drawer 控制項`，
`# pass 16 / # fail 0`。還原 SHA：
`a8c89c3d5155051c593684b7ee2bbd75f5f2c4cf7b635928d9c88e79a72ef595`＝回報 §11。[已驗證]

**保真瑕疵**：回報 §6.1 引的紅燈錯誤是
`Expected "actual" not to be reference-equal to "expected"`（`notStrictEqual` 的訊息
格式）；最終版 oracle（`tests/sheets-dom.test.js:401`
`assert.equal(document.activeElement === collapse, false)`）實跑產生的是
`Expected values to be strictly equal: true !== false`。回報逐字稿是中間版斷言的
輸出，未對最終檔重錄。canary 有效性不受影響（本輪已對最終檔重跑三拍），但
「逐字抄錄」聲稱對此條不成立。[已驗證]

### (B) 刪 replacement resolve 區段 — PASS

mutation：刪 `SurfaceHost.tsx:107-110`（`restoredCard` find＋early return）。

紅（exit 1，逐字）：

```text
not ok 12 - 關閉 sheet 依序還原新卡片、抽屜收合按鈕與 toggle 的焦點
  error: |-
    Expected values to be strictly equal:

    false !== true
# tests 16
# pass 14
# fail 2
```

與回報 §6.2 逐字一致。還原後綠（exit 0，`ok 12`，16/16），SHA 回
`a8c89c3d…`。[已驗證]

### (C) 拿掉 rAF `contains` guard — PASS

mutation：`SurfaceHost.tsx:190` 條件改為只剩 `surfaceKeyboardStack.includes(entry)`。

紅（exit 1，逐字）：

```text
not ok 8 - 首幀聚焦不覆寫 onMount 內的主動焦點
  error: |-
    Expected values to be strictly equal:

    false !== true
# tests 16
# pass 14
# fail 2
```

與回報 §6.3 逐字一致。還原後綠（exit 0，`ok 8`，16/16），SHA 回
`a8c89c3d…`。[已驗證]

## 2. C2-2 逐字保真 — PASS

- 自行執行回報 §4 的 diff 指令（`git show HEAD:src/sheets.js` 註解塊 vs 現
  `SurfaceHost.tsx`）：無輸出、exit 0。該 sed 範圍只涵蓋 9 行；擴大到完整 12 行
  （含 3 行英文前言 `An authoritative refresh can remove a public card…`）重比：
  仍 exit 0，12 行逐字相同。[已驗證]
- resolve 三段與條件式 fallback 原文（`SurfaceHost.tsx:103-127`）：
  - 第一段 `:103` `if (target.node?.isConnected) return target.node;`
  - 第二段 `:107-110` `restoredCard` 同 sessionId 查找。
  - 第三段 `:123-127`：
    `const drawerCloseFallback = target.drawerId ? (scope.querySelector<HTMLElement>('[data-testid="drawer-collapse"]') ?? scope.querySelector<HTMLElement>("#nearby-sessions-toggle")) : null;`
    `return scope.querySelector<HTMLElement>("[data-nearby-dialog] [data-nearby-close]") ?? drawerCloseFallback;`
  - full 專屬選擇器仍是第一 fallback；drawer collapse／toggle 只在
    `target.drawerId` 有值時參與。與基準 `sheets.js:54-57` 唯一差異＝TS 泛型
    註記。[已驗證]

## 3. Keyboard 本體零 diff — PASS

以 `git show 1645569:src/app/SurfaceHost.tsx` 抽出兩本體與現版 `awk` 同範圍
diff（掃描集非空：`onSurfaceKeyDown` 34 行、`surfaceKeyboardRegistry` 17 行）：

```text
ONKEYDOWN_DIFF_EXIT=0
REGISTRY_DIFF_EXIT=0
```

兩本體逐字零 diff。`restoreFocus` 型別變更只在 `SurfaceKeyboardEntry`
interface（`:56` `restoreFocus: SurfaceRestoreTarget | null`），不在兩本體內；
`onSurfaceKeyDown` 內無任何 restore descriptor 解析。[已驗證]

## 4. rAF liveness 等價 — 獨立判定：等價成立

- (a) 每條 close 路徑先同步 unregister：`src/sheets.js:49-52`
  （`if (closed) return; closed = true; unregisterSurfaceKeyboard?.();
  unregisterSurfaceKeyboard = null;`）在 content／shell unmount 的 try 區塊
  （`:55-75`）**之前**——unmount 拋錯也已先出 stack。host 端 cleanup
  （`SurfaceHost.tsx:173-179`）同步 `splice`。`closeSurface` 的 else 分支
  （`sheets.js:93-97`）無 entry、無需 unregister。[已驗證]
- (b) 兩方向不可達論證：
  - 「includes true 但已 closed」：`closed = true` 與 stack splice 在同一次同步
    close 呼叫內完成，rAF callback 是 macro/frame 級非同步、不可能插進兩敘述之間；
    且 close 的所有觸達管道（Escape 走 stack、click 綁定 `:80-81`、`surfaces.set`
    `:82`、`onMount` 收到 close `:84`、回傳值）全部在 `:79` 註冊之後才存在，
    `unregisterSurfaceKeyboard` 屆時必非 null。[推論，依據上列行號的同步序]
  - 「includes false 但未 closed」：stack 移除唯一入口是 register 回傳的 cleanup
    （host `:173-179`），其唯一 caller 是 close（`sheets.js:51`）；
    `focusInitial(surfaceEntry)`（`:85`）用的正是 `:79` 註冊的同一 reference。
    未 closed ⇒ cleanup 未跑 ⇒ 仍在 stack。[推論，依全庫 grep：`focusInitial`
    僅此一個 caller]
  - 一個非等價但兩版一致的邊界：`onMount` 拋錯時 `focusInitial` 不會被呼叫
    ——舊版同樣不會排 rAF（舊 `sheets.js:119-127` rAF 在 onMount 之後），
    行為等價、非本批引入。[已驗證]
- (c) `focusInitial` 在 host 內以 `requestAnimationFrame` 排程
  （`SurfaceHost.tsx:186`），production 非同步語意不變；原三行註解逐字隨遷
  （`:187-189`，whitespace-normalized diff exit 0）：
  `// Do not overwrite an intentional focus move made immediately after a`
  `// surface opens (for example, a keyboard action selecting its primary`
  `// CTA before the next animation frame).`
  `focusableNodes(entry.surface)[0] ?? entry.surface` 與 `preventScroll: true`
  皆保留（`:191`）。[已驗證]
- (d) replace：`mountSurface` 先繼承舊 entry descriptor（`sheets.js:29`）再
  `closeSurface(replace)`（`:30`）→ 舊 entry 同步出 stack；其 pending rAF
  （production）之後執行時 `includes(oldEntry)` 為 false，不在新殼搶焦——與舊
  `closed` closure 判定同結果。[推論，依 (a)(b) 的結構論證]

結論：`includes(entry)` 與舊 `!closed` 在 rAF callback 可觀察的所有時點真值相同，
等價聲稱成立。

## 5. 兩條新 oracle 品質 — PASS

- (a) 非抽屜 fallback oracle（`tests/sheets-dom.test.js:378-403`）：document 放置
  `nearby-sessions-drawer`＋collapse＋toggle；opener 在 `#page-content`（非抽屜、
  帶 `data-session-id`）；mount 後 `opener.remove()`、close。斷言原文（`:401-402`）：
  `assert.equal(document.activeElement === collapse, false);`
  `assert.equal(document.activeElement === toggle, false);`
  Canary A 證明它對無條件 fallback 實咬。[已驗證]
- (b) onMount 主動焦點 oracle（`:215-232`）：`onMount` 內
  `intentionalTarget.focus()`（第二顆按鈕）；harness rAF 同步，`mountSheet` 回傳時
  首幀聚焦已執行；斷言 `assert.equal(focusedAfterMount === intentionalTarget, true)`
  （`:231`）。Canary C 證明實咬。[已驗證]
- 既有三段 restore oracle 重構（`:327-376`）vs `1645569` 版：三段建構步驟逐字
  相同（含 stage-3 前置 `assert.equal(drawer.querySelector('[data-testid="drawer-collapse"]'), null)`
  保留於 `:364`）；差異僅「close 後立即 assert」改「立即取
  `document.activeElement` 存變數、結尾統一 assert」——取值時點相同，
  `assert.equal(x === y, true)` 是 reference 相等、不弱於舊 `assert.equal(a, b)`
  的 DOM loose 比對。語意零弱化。[已驗證]
- 觀察（非 FAIL）：兩條新 oracle 都是「不搶焦」反向語意；unit 層沒有「首幀
  auto-focus 確實發生」的正向專屬 oracle，正向覆蓋仍依賴 e2e（performance
  trap 組）。與派工單要求相符，僅記錄。

## 6. 凍結面 — 全項 PASS

- (a) `git diff --stat a2a8fa5 --` 七份指定 e2e spec＋`src/views`＋`src/sheets`
  （14 sheet .tsx）＋`sessionViews.js`＋`App.tsx`＋`modalIsolation.js`＋
  `react-surface-lifecycle.test.js`：空輸出，零 diff。[已驗證]
- (b) `rg -n "syncCommit\(" src`＝3 hits：`src/syncCommit.ts:8`（helper）＋
  `src/app/SurfaceHost.tsx:251`＋`src/sessionStore.ts:102`（2 caller）。[已驗證]
- (c) `rg -n "line_id|session_contacts" src` 12 hits，與 a2a8fa5 基準
  `git grep` 排序後 diff exit 0，完全相同（databaseTypes.ts 生成型別＋
  privateDataRepository.ts `p_line_id: null` 凍結呼叫點）。[已驗證]
- (d) `rg -o 'window\.__importAppModule' tests | wc -l`＝110＝基準。[已驗證]
- (e) `rg -n 'function focusableNodes|FOCUSABLE_SELECTOR' src`：`src/sheets.js`
  零 hit（含 `focusableNodes` 全字掃描，grep exit 1）；`function focusableNodes`
  唯一定義在 `SurfaceHost.tsx:88`；`FOCUSABLE_SELECTOR` 模組本體
  （`src/focusableSelector.js:1`）與另一既有 consumer
  `SessionDetailSheet.tsx`（凍結面零 diff）未動。[已驗證]
- (f) `wc -l src/sheets.js`＝134；SHA-256
  `5dfb7ae992f495640e5fda45ab821f8f09c773573b07743737b713a90be341f7`＝回報 §11。
  [已驗證]

## 7. 殘餘面確認（批 4 完結聲稱）— PASS

現版 `src/sheets.js`（134 行）全文盤點，逐項對照派工單殘餘清單：

| 行號 | 內容 | 對照清單 |
| --- | --- | --- |
| 1-2 | `pushSurfaceIsolation`、`AUTH_LINE_PROVIDER_ID` import | 編排／openLoginModal 附屬 |
| 4-5 | `sheetRoot`／`modalRoot` | API facade 附屬 |
| 6 | `surfaces` WeakMap | 清單內 |
| 11-21 | configure bridge ×3（shell renderer／keyboard registry／focus registry） | 清單內（focus registry 是本批新增第三條，依作法要求 1 的既有 bridge 模式） |
| 23-87 | `mountSurface` 編排：isolation acquire `:35`／release `:53`、close 編排 `:48-76`、`registerUnmount` `:40-47`、click 綁定 `:80-81`、capture/restore/focusInitial 呼叫點 `:29/:69/:85` | 清單內 |
| 89-98 | `closeSurface`（含 defensive `innerHTML=""` 分支） | 清單內 |
| 101-108 | `mountSheet`／`mountDialog` facade | 清單內 |
| 110-134 | `configureLoginModalContent`＋`openLoginModal` | 清單內（批 6 處理） |

機制本體反掃：`rg "requestAnimationFrame|\.focus\(|resolveRestoreTarget"
src/sheets.js` 僅剩 `:29` 的 registry 呼叫點，無任何 focus／keyboard／restore
機制本體殘留；清單外零機制。「批 4 完結」聲稱在 code 面成立。[已驗證]

補充語意檢視：`mountSurface` 現於任何 side effect 前先取 stable local
`focusRegistry` 並 fail closed（`:24-25`）——比基準（其他兩 bridge 檢查在
`closeSurface(replace)` 之後，`:31-32` 沿襲）更早失敗，無新增風險面；
production 依賴 host module-init（`SurfaceHost.tsx:330-332`）與既有兩條 bridge
同構。[已驗證]

## 8. 收尾 — PASS

- `git diff a2a8fa5 -- src tests` 重出與開工存底 `cmp`：**byte-identical**
  （`4c3-baseline.patch` vs `4c3-final.patch`，cmp 無輸出）。[已驗證]
- 三檔 SHA 對回報 §11：`a8c89c3d…`（SurfaceHost.tsx）／`5dfb7ae9…`（sheets.js）
  ／`61f296ef…`（sheets-dom.test.js）三檔全符。[已驗證]
- `git status --porcelain`＝開工時同一集合（三個 M＋回報 untracked），repo 內
  無殘留暫存檔；審查暫存全在 session scratchpad。[已驗證]

## 總評

- **被推翻的聲稱**：無實質推翻。唯一保真瑕疵＝回報 §6.1 Canary A 紅燈逐字稿
  引用了中間版斷言（`notStrictEqual` 訊息）而非最終版 oracle 的
  `strictEqual: true !== false` 輸出——「逐字抄錄」對該條不成立；canary 結論
  本身經本輪對最終檔複跑三拍後維持有效。
- **rAF liveness 等價**：獨立判定成立（§4）——`surfaceKeyboardStack.includes(entry)`
  與舊 `!closed` 在 rAF 可觀察時點真值相同；close 全路徑同步 unregister 且先於
  unmount try 區塊；replace 舊 entry 不搶焦。
- **批 4 完結聲稱**：成立。restore／rAF 機制本體已全數入 host，`sheets.js` 殘餘
  逐行對照派工單清單無清單外機制；keyboard 兩本體逐字零 diff；C2-2 修法 12 行
  註解與條件語意逐字保真；凍結面（七 e2e、views、sheets、App、modalIsolation、
  lifecycle test、syncCommit、line_id、importAppModule 110）全數零 diff／同基準。
- 本輪未複跑項（採信回報，屬回報收尾矩陣範圍）：bundle gate 數字（total gzip
  餘 1,465 B）、test:mock／test:local 全量、七 e2e 實跑。[不確定]——本審查
  聚焦驗收條件 1-8，上述由驗收方視需要抽驗。
- 裁決建議：**ACCEPT**（附上開保真瑕疵記錄）。
