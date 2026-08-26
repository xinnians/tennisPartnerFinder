# 批 4C-2 對立審查報告（keyboard owner 遷移）

- 日期：2026-08-27。審查對象：working tree（基準 `8742c9f`，未 commit）＋
  `docs/arch-dispatch-2026-08-27-batch4C2-keyboard-report-codex.md`。
- 審查立場：證偽。結論先行：**八項全 PASS，無聲稱被推翻**；四個觀察項見 §9。
- 存底紀律：開始前 `git diff 8742c9f -- src tests .claude` 落底
  `scratchpad/4c2-baseline.patch`（20,210 bytes）；結束時重新產出 diff 與存底
  `cmp`，輸出 `CMP_BYTE_IDENTICAL`（§8）。全程未 commit、未 push。

## 1. Canary 複跑 ×4 —— PASS

四組皆親手重注入、實跑、還原；每次還原後 `src/app/SurfaceHost.tsx` SHA-256 均為
`7a7435f85966935375d8c6da62d6ec7dd576f718feff39b9af3038a0909f7d20`，與 Codex 回報
§6／§12 逐字一致。

### (A) `surfaceKeyboardStack.at(-1)` → `[0]`（SurfaceHost.tsx:79）

- 紅：`node --test tests/sheets-dom.test.js` → `EXIT_CODE=1`，
  `not ok 3 - Escape 只關閉最上層 surface`，`# tests 14 / pass 12 / fail 2`
  （第 2 個 fail 是父聚合 `not ok 2 - sheets DOM 殼契約`，與 Codex 數字一致）。
- 還原綠：`EXIT_CODE=0`，`# tests 14 / pass 14 / fail 0`。

### (B) 同時移除 `event.preventDefault()`＋`event.stopPropagation()`

- 跑前先確認 port 5174/5175 無平行 Vite server（`lsof` 皆空），排除既知的
  server 污染偽像。
- 紅：`TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/session-lifecycle-smoke.spec.js --project=desktop-chromium --grep "a top sheet consumes Escape"`
  → `EXIT_CODE=1`，`✘ session-lifecycle-smoke.spec.js:341 › a top sheet consumes
  Escape before the underlying nearby drawer`，關鍵斷言逐字：

  ```text
  Error: expect(received).toEqual(expected) // deep equality
  -   "drawerExpanded": "true",
  +   "drawerExpanded": "false",
  ```

  即 Escape 穿透、把底層抽屜收合——載重方向正確。
- 還原綠：`EXIT_CODE=0`，`1 passed (1.3s)`。
- 註：Codex 回報 §6.2 的 `Expected: "true" / Received: "false"` 是對此 deep-diff
  的濃縮改寫，非逐字（失敗 spec:行號與語意相同）；見 §9 觀察 1。

### (B') 只移除 `stopPropagation`

- 紅：sheets-dom → `EXIT_CODE=1`，`not ok 8 - surface Escape 阻斷 bubble，全部關閉
  後不再 consume`，`error: 1 !== 0`（bubble 探針收到 1 次），
  `# tests 14 / pass 12 / fail 2`。與 ground truth 預測一致：drawer guard 查
  `defaultPrevented`，單獨移除 `stopPropagation` 只有新探針 oracle 咬得到。
- 還原綠：`EXIT_CODE=0`，14/14。

### (C) Tab wrap first/last 對調

- 紅：sheets-dom → `EXIT_CODE=1`，`not ok 5 - sheet 將 Tab 焦點限制在第一個與
  最後一個可互動控制項`＋`not ok 6 - Tab trap 排除自身與祖先帶 hidden 的控制項`，
  `# tests 14 / pass 11 / fail 3`。兩條 reference oracle 同時紅，與 Codex §6.4 一致。
- 還原綠：`EXIT_CODE=0`，14/14。

## 2. 六條新 oracle 品質 —— PASS（載重性逐條判定）

檔案：`tests/sheets-dom.test.js`。

- (a) onEscape 短路（:126-145）：斷言 `escapeCalls===1`、`event.defaultPrevented===true`、
  `mounted.root.innerHTML` 非空（surface 留存）。**載重**。此路徑未斷
  `stopPropagation`，由 (d) 探針補位——組合覆蓋成立。
- (b) hidden 排除（:173-201）：fixture 含 `#direct-hidden`（自身 hidden）與
  `<div hidden>` 包住的 `#nested-hidden`，雙向 wrap 用 reference equality。
  推演：若過濾器失效，`nodes.at(-1)` 變成 nested-hidden，從 `#visible-last` 按
  Tab 不再命中 wrap 條件、焦點不動 → `forwardTarget!==first` 必紅。**載重**
  （canary C 亦實證它會紅）。
- (c) 零 focusable fallback（:203-212）：斷 `defaultPrevented` 與
  `document.activeElement===mounted.surface`。**載重**（fallback 刪除即紅）。
- (d) bubble 探針對稱（:214-233）：探針掛 document bubble 段；開啟時 dispatch 到
  `mounted.surface`，capture listener 先跑、`stopPropagation` 使探針 0 次；全關後
  dispatch 到 `document.body`，斷 `defaultPrevented===false` 且探針恰 1 次。
  **載重**——B' canary 實證負向咬合；「全關後未 consume」同時咬 listener 移除。
- (e) listener 平衡（:235-261）：**觀測方式＝monkeypatch
  `document.addEventListener`／`removeEventListener`**（保存原函式、包一層計數、
  finally 還原），只計 `type==="keydown" && options===true`，與 SurfaceHost 的
  字面 `true` 第三參數吻合。replace→close 斷 `captureAdds===2 && captureRemoves===2`，
  再斷關閉後 Escape `defaultPrevented===false`。**判定：對「殘留 listener／
  加減不平衡」載重**（少一次 remove 即紅；尾斷言獨立再咬殘留）。限制見 §9 觀察 2：
  它**不能**區分單一 owner 與舊的 per-surface 模型（舊模型在同場景也是 2/2）；
  單一 owner 性質由 §6 的全庫 source 掃描承擔，Codex 回報 §10 Q1 也是引 source
  scan 而非此 oracle，無誇大。
- (f) AggregateError 雙錯（:263-305）：真讓 content 與 shell unmount 同拋，斷
  `error instanceof AggregateError` 且 `errors` 訊息序恰為
  `content unmount failed|shell unmount failed`、`closeCalls===1`、
  `document.activeElement===opener`（restore 已執行）、之後同 root 可重新
  mount/close。**載重**。renderer override 未包 finally，但每個 domTest 經
  `loadSheets` 拿全新 module instance（sequence query），無跨測污染。

既有「Escape 只關閉最上層」的 `finally` 只做 canary 收尾清理（idempotent close），
斷言語意零弱化——canary A 實證它照樣紅且可終止。

## 3. E 群相容 —— PASS

- `git diff 8742c9f --stat -- tests/react-surface-lifecycle.test.js` 空輸出、exit 0；
  全量 `name-status` 也只有 4 個已宣告檔案。[已驗證]
- 現版 `src/sheets.js` 以 `indexOf` 計：`unmountContent?.();`＝3989、
  `shell.unmount();`＝4142，content 先於 shell（try/finally 重構後 E 群封條語意
  仍成立）。[已驗證]
- `node --test tests/react-surface-lifecycle.test.js` → `EXIT_CODE=0`，
  `# tests 6 / pass 6 / fail 0`。[已驗證]

## 4. 時序等價審查 —— PASS（獨立判定：等價＋兩處核可改善）

比對 `git show 8742c9f:src/sheets.js`（落底 scratchpad）與現版全文：

- (a) close 順序：closed guard → `unregisterSurfaceKeyboard?.()`（splice＋stack
  空時移除 listener，sheets.js:86-87）→ `releaseIsolation()`（:88）→ content
  unmount try/catch（:90-94）→ shell unmount try/catch/finally（:97-105，finally
  內 `surfaces.delete`→`onClose`→restore）→ AggregateError／單錯重拋（:106-110）。
  與舊版逐步對齊；stack 移除仍在 releaseIsolation 與 content unmount **之前**
  （凍結條款成立）。舊版 per-surface listener 是無條件自移除、新版是 stack 歸零
  才移除——多層併存時舊 listener 本來就被 topmost 檢查短路，外部可觀察行為等價。
  [已驗證]
- (b) mount 順序：capture previousFocus → replace-close → 雙 guard → shell mount
  → isolation → entry 建立 → `registry.register`（push＋首 entry 安裝 listener，
  時點對應舊版 push＋addEventListener）→ dismiss/close click 綁定（:115-116，
  凍結面原樣）→ `surfaces.set` → `onMount` → rAF。等價。[已驗證]
- (c) 單獨 rethrow 路徑逐一判定：
  - 只 content 錯：新舊完全一致（cleanup 全跑、重拋 content error）。**等價**。
  - 只 shell 錯：舊版直接拋、跳過 `surfaces.delete`／`onClose`／restore，且留下
    stale surfaces entry——同 root 下次 mount 會撞
    `Surface shell root is already mounted.`；新版 finally 保證 cleanup 後重拋。
    **改善**（正是加固項 1 的核可語意）。
  - 雙錯：舊版 content error 被 shell throw 吞掉；新版 AggregateError 保兩者。
    **改善（核可）**。
- 新語意只有三點，皆屬派工單核可範圍：registry fail-closed guard、shell 錯不再
  跳過 cleanup、雙錯 AggregateError。無未申報語意變更。

## 5. 凍結面 —— PASS

- (a) `git diff 8742c9f -U0 -- src/sheets.js` hunk 落點（舊行號）：8、9、14、62、
  68、80-82、91-119、121-128、129、132-136、157。`captureRestoreTarget`（舊 :21-26）
  與 `resolveRestoreTarget`（舊 :28-54）落在 14→62 的 hunk 空窗、rAF（舊 :142-149）
  落在 136→157 空窗——C2-2 修法與 rAF 零 diff。[已驗證] restore 的**呼叫行**
  （`resolveRestoreTarget(previousFocus)?.focus(...)`）字面不變但隨 try/finally
  移入 finally——屬加固項 1 核可重構，非修法變更。
- (b) 七份指定 e2e spec＋`src/views`＋`src/sheets`＋`sessionViews.js`＋`App.tsx`＋
  `modalIsolation.js`：`git diff 8742c9f --stat` 空輸出、exit 0。[已驗證]
- (c) `rg -n 'addEventListener\("keydown"' src` 全庫：恰 3 處——
  `SurfaceHost.tsx:119`（安裝）、`NearbySessionsDrawer.tsx:226`、`App.tsx:251`；
  removeEventListener 對稱 3 處（:126／:227／:252）。surface keydown owner 只在
  SurfaceHost，`sheets.js` 歸零；drawer 與 AppShell 兩檔零 diff（見 name-status），
  相對基準零變化。[已驗證]
- (d) `rg -n "syncCommit\(" src`：`syncCommit.ts:8`（helper）＋`sessionStore.ts:102`
  ＋`SurfaceHost.tsx:182`（2 caller）。恰 helper+2。[已驗證]
- (e) `rg -n "line_id|session_contacts" src`：12 行，與
  `git grep 8742c9f -- src` 相同行號、相同原文（databaseTypes.ts 9 行＋
  privateDataRepository.ts 3 行）。[已驗證]
- (f) `rg -o 'window\.__importAppModule\(' tests | wc -l` ＝ **110**，與 4C-1
  基準持平。[已驗證]

## 6. harness 注入設計 —— PASS

- sheets-dom 注入原文（`tests/sheets-dom.test.js:56-57`）：

  ```js
  sheets.configureSurfaceShellRenderer(host.mountSurfaceShell);
  sheets.configureSurfaceKeyboardRegistry(host.surfaceKeyboardRegistry);
  ```

  即測試對「Node URL query 載入的另一份 sheets.js instance」顯式注入該次
  host instance 的 registry——與回報 §1 的 module identity 說明相符。
- production 路徑（`src/app/SurfaceHost.tsx:261-262`，模組底部一次性）：

  ```ts
  configureSurfaceShellRenderer(mountSurfaceShell);
  configureSurfaceKeyboardRegistry(surfaceKeyboardRegistry);
  ```

- fail-closed 雙 guard（`src/sheets.js:66-67`）：

  ```js
  if (!mountReactSurfaceShell) throw new Error("Surface shell React renderer is unavailable.");
  if (!surfaceKeyboardRegistry) throw new Error("Surface keyboard registry is unavailable.");
  ```

  兩行都在 shell mount（:68 `mountReactSurfaceShell(root, ...)`）與 isolation
  acquire（:70 `pushSurfaceIsolation(root)`）**之前**——回報 §1「提前到 shell
  mount 與 isolation acquire 之前」聲稱屬實。[已驗證] 註：replace-close（:65）
  在 guard 之前，但這與基準的 renderer guard 相對位置相同，非本批引入。

## 7. focusableNodes 重複 —— 現況確認＋觀察項

- 兩份並存：`src/sheets.js:19-23`（供凍結的 rAF 首幀聚焦）與
  `src/app/SurfaceHost.tsx:72-76`（供 Tab trap）。selector 同源
  `focusableSelector.js`，filter 述詞逐字節相同
  （`(node) => !node.hasAttribute("hidden") && !node.closest("[hidden]")`）；
  函式整體因 TS 型別註記非 byte 相同，**邏輯等價**。[已驗證]
- 判定：漂移風險真實存在（改其一不改其二時，rAF 首焦點與 trap 邊界會挑到不同
  節點）但目前無測試缺口逼近它；**4C-3 單源化是正確歸宿**——派工單已預告、
  Codex §10.5 也承諾，4C-3 驗收應把「單一來源＋rAF 行為零變更」列為必查項。

## 8. 收尾 —— PASS

- `cmp scratchpad/4c2-baseline.patch scratchpad/4c2-final.patch` →
  `CMP_BYTE_IDENTICAL`（審查前後 working tree 對基準 diff 逐字節相同）。
- 三檔 SHA-256 與 Codex 回報 §12 逐字一致：
  `7a7435f8…`（SurfaceHost.tsx）／`9a243a2e…`（sheets.js）／
  `9e86f6a2…`（sheets-dom.test.js）。
- `git status --porcelain`：僅 4 個已宣告修改檔＋未追蹤的 Codex 回報文件；
  repo 內無審查殘留。gitignored `test-results/.last-run.json`（45B）是任何
  playwright 執行的標準狀態檔（Codex 收尾矩陣同樣會產生），非 canary 殘留。

## 9. 總評

**被推翻的聲稱：無。** 四組 canary 全數以三拍重現、SHA 對齊；六條新 oracle 逐條
判定載重；時序等價的獨立結論與 Codex 一致（等價＋兩處核可改善）。觀察項：

1. **回報引用非逐字（輕微）**：§6.2 canary B 的紅燈證據
   `Expected: "true" / Received: "false"` 是對 `toEqual` deep-diff
   （`drawerExpanded: "true"→"false"`，spec:361）的濃縮，派工單要求「逐字抄錄」。
   失敗測試、行號、語意皆真，不影響驗收，但下批回報應貼原始斷言塊。
2. **listener 平衡 oracle 的邊界**：2/2 計數＋尾 Escape 斷言對「殘留／不平衡」
   載重，但無法區分單一 owner 與 per-surface 模型（後者同場景也是 2/2）；
   「單一 owner」性質目前由 source 掃描（§5(c)）承擔。可接受——建議 4C-3 之後
   若要把此性質變成行為 oracle，可在雙層 stack 場景斷 add 次數為 1。
3. **給 4C-3**：restore 呼叫行已位於 close 的 finally 內，搬遷 restore ownership
   時注意保持「shell 錯誤下仍 restore」這一新承諾；`focusableNodes` 單源化時
   rAF 首幀「使用者已主動移焦不覆寫」guard 與 trap 的 hidden 過濾必須同一份。
4. **bundle 餘裕**：本批未重跑 gate（非本審查驗收項，readback 側覆核）；Codex
   自報 total gzip 餘裕 1,703→1,517 B，若屬實則下一批（4C-3）開單前應把最新
   餘裕寫進派工單硬約束。
