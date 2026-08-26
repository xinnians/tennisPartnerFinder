# 批 4B 對立審查報告：SessionDetailSheet 重 lazy 化

- 日期：2026-08-26。審查對象：working tree（基準 `fa6a1a2`）與
  `docs/arch-dispatch-2026-08-26-batch4B-detail-lazy-report-codex.md`。
- 紀律自證：開工即存底 `git diff fa6a1a2 -- src tests`（14,253 bytes）；兩次破壞性
  canary 各自還原後 `cmp` 通過；結案時最終 diff 與存底 `cmp` 輸出
  `FINAL_TREE_BYTE_IDENTICAL`，`git stash list` 為 0。未 commit、未 push。
- 審查途中一次誤觸 `git stash -q --include-untracked`：`git stash list` 為空、
  working tree 與存底 cmp 相同（`TREE_INTACT`），確認未造成任何變動；其後改用
  `git grep <commit>` 做基準比對，不再碰 stash。

## 逐項判定

### 1. Canary 三拍複跑 — PASS [已驗證]

`src/views/sessionSurfaceViews.js:245` 的 `methods: ["setJoinPreview", "enterConfirming"]`
暫改為 `methods: ["setJoinPreview"]`（Edit 工具）。

紅（exit code 以落檔後 `$?` 取得，不接 pipe）：

```text
REAL_EXIT=1
✘  1 [desktop-chromium] › tests/react-unmount.spec.js:143:1 › detail commands queued during loading replay into the replacement once (212ms)
Error: page.evaluate: TypeError: detail.enterConfirming is not a function
    at eval (eval at evaluate (:303:30), <anonymous>:22:12)
    at async <anonymous>:329:30
    at /Users/ian/tennisPartnerFinder/tests/react-unmount.spec.js:148:14
1 failed
```

還原後 `git diff fa6a1a2 -- src tests` 與存底 cmp：`RESTORED_BYTE_IDENTICAL`。綠：

```text
REAL_EXIT=0
✓  1 [desktop-chromium] › tests/react-unmount.spec.js:143:1 › detail commands queued during loading replay into the replacement once (292ms)
1 passed (1.0s)
```

失敗訊息、行號與 Codex 回報 §4.3 逐字一致。Codex 此項聲稱成立。

### 2. 五條新 oracle 品質審查 — PASS（附兩點誠實保留）[已驗證]

先跑整檔基準：`tests/react-unmount.spec.js --project=desktop-chromium` 7 passed（
既有 2＋新 5）。

(a) pending-Escape oracle（spec :116）：route 接線原文（tests/react-unmount.spec.js:12-16）：

```js
  await page.route("**/src/sheets/SessionDetailSheet.tsx*", async (route) => {
    markRequested();
    await gate;
    await route.continue();
  });
```

真的攔 Vite module request（`await moduleLoad.requested` 是載重斷言——route 不匹配
會 timeout）；release 後（等到 response＋雙 rAF）斷言 `#session-sheet` 與
`[data-join-stage]` 皆 `toHaveCount(0)`（:139-140），且 loading 期 Escape 後
`__detailCloseCalls === 1`（:136）。

(b) FIFO replay oracle（:143）：load 前對 handle 呼叫 `setJoinPreview`（排隊球友
fixture）與 `enterConfirming({expectedAccepted:true})`（:153-157）；release 後斷言
`[data-join-stage="confirming"]` visible 與 preview 含「排隊球友」（:162-164），再以
兩次 Escape 驗 confirming→idle→close（:166-169）。

(c) onClose oracle（:173）：replacement 前 `toBe(0)`（:187）、替換完成
（`[data-join-stage="idle"]` visible）後仍 `toBe(0)`（:192）、真 Escape 關閉後
`toBe(1)`（:196）。

(d) 兩條匿名 intent oracle（:200、:214）：card 走真 UI
`#nearby-sessions-toggle` click →`getByTestId("session-card").first().hover()`；pin 走
`getByRole("button", { name: /地圖圖釘 球局 ·/ }).first().focus()`；兩者都
`await moduleLoad.requested`（module request 確實發出）且前後斷言 `#session-sheet`
count 0（不開 sheet）。

額外 canary（選 (a)）：把 defer 分支的 `onClose,` 從 `deferSurfaceOpen` 參數移除→

```text
REAL_EXIT=1
✘  1 › tests/react-unmount.spec.js:116:1 › Escape closes a loading detail shell and load resolution cannot late-mount it (5.1s)
Error: expect(received).toBe(expected)
Expected: 1
Received: 0
> 136 |   await expect.poll(() => page.evaluate(() => window.__detailCloseCalls)).toBe(1);
```

還原 cmp `RESTORED_BYTE_IDENTICAL_2`→綠（REAL_EXIT=0，292ms 1 passed）。oracle (a)
確實咬 production 語意。

誠實保留兩點（不構成 FAIL）：

- (b) 的「恰 replay 一次」是以最終 stage＋preview 內容間接斷言；若未來機制退化成
  重複 replay 兩次，畫面終態相同，此 oracle 抓不到。與派工單 D-2 自訂的斷言口徑
  一致，故判 PASS，但 4C 動殼時別把它當「恰一次」的強證據。
- (a) 的 late-mount 窗口靠 release 內「等 response＋雙 rAF」再斷言 count 0；理論上
  module evaluate 若晚於兩個 frame 才 mount 會漏抓。canary 2 證明它對 onClose 語意
  有牙；late-mount 分支本身的牙依賴 `deferSurfaceOpen` 既有 `live` guard（本批凍結、
  零 diff），風險可接受。

### 3. Caller 面掃描（回報未涵蓋處）— PASS，無行為缺口 [已驗證]

production caller 全集（`grep -rn "openSessionSheet" src`，排除定義處
`src/views/sessionSurfaceViews.js`）：

- `src/sessionViews.js:70-73`：re-export facade（`...args` 透傳，不碰 handle）。
- `src/main.js:100`（import）＋ `src/main.js:615`：`openSession` 接線，handle 原樣
  回傳給 controller。

handle 的下游使用逐一核對：

| 使用點 | 用法 | deferred handle 是否支援 |
|---|---|---|
| `src/sessionController.js:445-447` | `detail?.close` truthiness＋registry.set | 有 `close`，truthy ✓ |
| `src/controller/surfaceRegistry.ts:63-66` | `handle.close?.(closeOptions)`（"detail" 無自訂 close） | `close(options)` 轉發 `active.close` ✓ |
| `src/sessionController.js:381,388,392` | `surface?.setJoinPreview?.(...)` | methods 佇列 ✓ |
| `src/controller/intentController.ts:203` | `detail.enterConfirming?.({expectedAccepted})` | methods 佇列 ✓ |
| `intentController.ts:470-476`、registry `get/is/meta` | 只做同一性比對與 metadata | 不觸 handle 欄位 ✓ |

反掃 `rg "registerUnmount" src`：除 `src/sheets.js` 外全部 14 處都在
`sessionViews.js` 的 `registerXContent(mounted, content)` 註冊 callback 內，操作的是
loaded 分支內部的真 `mounted`（`sessionSurfaceViews.js:330` 的
`registerDetailContent(mounted, content)`），不是對外 handle。無任何 caller 讀
`.root`/`.surface`/`.registerUnmount`（controller 層 grep 零 hit）；deferred handle 其實
也備援了 `root`/`surface` getter（`sessionViews.js:511-516`）。

同步 DOM 依賴：`openSessionDetail`（sessionController.js:398-453）回傳後只做
registry.set 與 async `hydrateSessionJoinPreview`，`openSessionFromLink`
（:464-492）只查 registry；無「回傳後立即查詢 sheet DOM」的 caller。

遞迴 bag 完整性：簽名解構 21 個 option（sessionSurfaceViews.js:216-236）與遞迴
`open()` bag（:249-269）逐名比對，一一對應、無遺漏、無 rest。

### 4. 凍結面 — 全 PASS [已驗證]

- (a) `git diff fa6a1a2 -- src/sheets/SessionDetailSheet.tsx src/sheets.js | wc -c` = **0**。
- (b) `src/sessionViews.js` hunk 落點：`@@ -236`（configure 退役）、`@@ -276`（loader
  map）、`@@ -291`（mount 宣告）、`@@ -364`（preloader）、`@@ -396`（configure bag）、
  `@@ -603`（preloadForIntent）——不觸 deferSurfaceOpen；另以 awk 抽出
  `deferSurfaceOpen` 函式本體與 `git show fa6a1a2:` 版 cmp：`DEFER_BODY_IDENTICAL`。
- (c) 全 diff 中 `registerDetailContent` 出現 0 次。
- (d) `tests/react-surface-lifecycle.test.js` 唯一 hunk 是 `@@ -126,9 +126,9`（eager
  regex :129-131）；F 群（:165-181，`readFileSync` 直讀凍結 TSX）與 A/B/E 群逐行在
  hunk 範圍外，unchanged by construction。
- (e) `rg -n "line_id|session_contacts" src` working tree 12 hits，與
  `git grep fa6a1a2` 基準 diff 為空：`LINEID_HITSET_IDENTICAL`。

### 5. `__importAppModule` 對帳 — PASS（口徑已解謎）[已驗證]

- 裸符號 `__importAppModule`（含 appRuntime.js:12 的 `globalThis.__importAppModule`
  定義行）：fa6a1a2 = **108** → working tree = **111**。
- Codex 的口徑是 `window.__importAppModule`：fa6a1a2 = **107** → **110**，與其回報
  及派工單 ground truth 的 107 一致——不是數錯，是拼法口徑排除了定義行。
- 兩種口徑 delta 皆 **+3**，per-file diff 唯一變動 `tests/react-unmount.spec.js: 2→5`
  （三條 race oracle 各一）；production `grep -rn "__importAppModule" src` = **0**；
  `await import("/src/` 於 tests 計數 1→1 不變，無換拼法。

### 6. 預熱 selector 事實查核 — 卡片/按鈕/intent 架位 PASS；pin 對真實 Maps 標 [不確定]

- (a) `src/components/SessionCard.tsx:42`：`data-testid="session-card"`（:43 並有
  `data-session-id`）。PASS。
- (b) `src/pages/MySessionsPage.tsx:216`：`data-open-my-session=""`（「查看球局」
  按鈕）。PASS。
- (c) `src/map.ts:507-509`：`title: multiple ? \`球局 · ${court.name} · ${sessions.length} 場\`
  : \`球局 · ${court.name}${undecided ? " · 未定" : ""}\`` ——cluster／單一／候選三種
  session pin title 皆以 `球局 · ` 開頭。PASS。
- (d) intent 分支在 `preloadForIntent`（sessionViews.js:602-618，新增 :612-613）內；
  listener 在 module top-level `document.addEventListener("pointerover"/"focusin")`
  （:620-623），無 auth 條件；auth gate 只包 `preloadAuthenticatedViewsForAuth`
  （:598-600），detail 未加入 `authenticatedViewPreloads`（:544-558）。匿名可觸發。PASS。
- (e) **真實 Maps pin 有效性**：
  - [已驗證] production 走 AdvancedMarkerElement 路徑：map.ts:247
    `if (GOOGLE_MAPS_MAP_ID && AdvancedMarkerElement) advancedMarkerMaps.add(runtimeMap)`；
    地圖批回報記載 production 設有 Map ID `c5bc78564f912d8bded98797`
    （docs/arch-dispatch-2026-08-25-map-batch-report-codex.md:120）。`title` 由
    map.ts:299-306 傳入 constructor、:367 於 update 時同步。
  - [已驗證] Fake Maps 把 title 放成 `<button title="…">`（tests/fixtures/fakeMaps.js:
    212-216 advanced、:138-144 legacy），所以兩條 intent oracle 在測試環境為真。
  - [不確定] 真實 `gmp-advanced-marker` 的 DOM 是否把 `title` 落成 hover/focus 事件
    路徑上的 `title` **attribute**，repo 內無法證明；Google 文件描述 title 為
    rollover text（原生 tooltip 通常意味某層帶 title attribute），但若內容在 shadow
    DOM 且 attribute 不在 host 上，`closest('[title^="球局 · "]')` 會 miss。
  - [推論] legacy fallback（無 Map ID 或降級，map.ts:320-328 `optimized: false`）的
    marker 是自有 DOM 節點且 title 落 attribute（documented tooltip 行為），hover 可命中。
  - **裁決建議**：miss 的後果只是 pin hover 不預熱，開 pin 時落回 deferSurfaceOpen
    loading 殼，無正確性風險；card 與 my-sessions 兩條預熱不受影響。驗收紀錄應寫
    「pin 預熱已在 Fake Maps 證實；對 production AdvancedMarker 是否生效未證，列入
    hosted QA 檢查項（devtools 看 gmp-advanced-marker 是否帶 title attribute）」，
    不應照 Codex 五問 §3 的口氣寫成 production 已確立。

### 7. 深連結＋navigation 抽查 — PASS [已驗證]

`TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/navigation-shell-smoke.spec.js
--project=desktop-chromium`：**14 passed (6.0s)，REAL_EXIT=0**（exit code 落檔取得，
不接 pipe）；含 `:98` `cold boot opens an anonymous session hash`（冷載入 defer 分支）。

### 8. 收尾 — PASS [已驗證]

最終 `git diff fa6a1a2 -- src tests` 與存底 `cmp`：`FINAL_TREE_BYTE_IDENTICAL`；
`git status --porcelain` 僅剩批 4B 的七個預期項（含 Codex 回報 doc）；`test-results/`
為 gitignored（`!!`），repo 內無審查殘留暫存檔；所有審查中間產物在 session scratchpad。

## 總評

- **被推翻的聲稱：無。** 十一項核心聲稱（canary 三拍、五 oracle、import 面遷移、
  凍結面五款、對帳 delta、深連結）全數複驗成立；canary 錯誤訊息逐字一致。
- **兩處紀錄修正（非 FAIL）**：(1) `__importAppModule` 絕對值依口徑而異——裸符號
  108→111、`window.` 前綴 107→110；Codex 與派工單用後者，delta +3 兩口徑一致。
  (2) Codex 五問 §3「匿名 pin 會預熱」在 production 只到 [不確定]——測試層為真
  （Fake Maps title 是 fixture 自己放的 button attribute），真實 AdvancedMarker DOM
  未驗證。
- **caller 面裁決**：無缺口。deferred handle 露出面（close/root/surface＋兩佇列
  方法）嚴格覆蓋所有 production caller 的實際使用（close、setJoinPreview?.、
  enterConfirming?.、truthiness/identity）；`registerUnmount` 只被內部 `mounted` 用，
  不經對外 handle；無 caller 同步依賴回傳後 sheet DOM 已存在。
- **pin 預熱裁決**：接受實作，驗收紀錄降級為「測試已證、production 待 hosted QA
  證」，並把 gmp-advanced-marker title attribute 檢查掛進 release checklist 的人工
  QA 項；毋需返工（miss 時 fallback 是 loading 殼，非破壞）。
- 建議 ACCEPT；後續批次注意：oracle (b) 的「恰一次」是弱斷言，4C 改殼機制時若動
  replay 路徑，需補一條計數型 oracle。
