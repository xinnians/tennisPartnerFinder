# 批 11：收尾清理批（probe 常駐化＋死宣告刪除＋抽常數＋測試強化）

2026-08-19。基線 HEAD `dc795e9`（鏈上含批 10 `2fa00ed`）。開工前 `git status` 乾淨——
第一次查詢顯示 `M docs/frontend-migration-plan-2026-08-18.md`，但 `git diff` 為空，
`git update-index --refresh` 後該行消失，屬 stat cache 陳舊，非真實變更。

## 0. 防偽引用（`docs/migration-reports/batch-10.md`「驗收方註記」節第 4 條 (a) 的第一句原文）

> 報告 §8「順序反轉 0 對」的普遍句過強——Lens 2／3 獨立重算各發現同一組
> 12 對同特異性理論反轉（Me 頁卡片 h2 margin 叢集 ×10、discovery-empty flex ×2），
> 逐一讀 markup 證實現有 DOM 下不可能同元素（各卡片為兄弟 section 永不巢套），
> 加上幾何指紋經驗面覆蓋，視覺零變更結論不變；「對任何假想 markup 都等價」的
> 宣稱應理解為「對現有 markup 等價」。

## 1. 結論摘要

| 項 | 交付 | 有牙實證 | 結果 |
|---|---|---|---|
| A | `tests/session-controller-sequence.test.js`（純新增，503 行、122 筆 golden） | canary ×2（emit 值比對去重／authEpoch 繞過 store） | 兩發皆「113 條舊測試全綠、新測試紅」，還原後 SHA 逐字回復 |
| B | 三條死宣告刪除（`.time-tile--done` 整條、`.level-chip{font-weight:600}`、`.chip--district` 尺寸整條） | 幾何指紋 6 檔／380 元素／201,020 值 | 刪除前後 **DIFFS=0**；probe 自身 canary 紅 110 值 |
| C | `LOCATION_UNAVAILABLE_MESSAGE` 抽常數，5 處引用 | grep 計數 ＋ 位元組比對 | 字面 1 處定義／5 處引用，literal 位元組與 HEAD 完全相同 |
| D | `tests/smoke.spec.js` 緊鄰新增 1 個 block（84 行，0 刪除） | canary（`mountReportDialogContent` render→null） | 新測試紅、`:2780` 舊測試**仍綠**，缺口對照成立 |

Gate 七站全綠。未執行 guarded DB reset（見 §7 說明）。工作樹最終 7 個 modified
（`package.json`、`src/create-session.css`、`src/map-page.css`、`src/sessionController.js`、
`src/surfaces.css`、`src/vocabulary.css`、`tests/smoke.spec.js`）＋ 2 個 untracked
（新測試檔與本報告），無殘留臨時檔。四發 canary 動過的 `src/sessionStore.ts` 與
`src/sheets/ReportDialog.tsx` **不在** `git status` 中，即與 HEAD 位元組相同。

---

## 2. A：行為序列 probe 常駐化

### 2.1 檔案與 harness

新檔 `tests/session-controller-sequence.test.js`（node --test，503 行）。
**不 import、不修改 `tests/session-controller.test.js`**——自建等價 fake harness，
構造方式對照該檔 237–377 行的 `createHarness`（同樣把 `render`／`renderPins`／
`renderPlayers`／`onMySessionsChange`／各 `open*` factory 換成記錄用 fake，
`intentStore` 用記憶體版取代 `browserIntentStore()`）。差別只有兩點：

1. 本檔的 fake 不收集「最後狀態」，只往一條共用陣列 `entries` 逐筆追加呼叫紀錄。
2. `openCreateSession` 的 fake 額外實作 `setCourts`，以錄下通道 3 的把手直呼。

`package.json` 的 `test:session-unit` 加入本檔（否則新測試不會進 gate，見 §8 偏離 1）。

### 2.2 17 步腳本與 golden 設計

腳本沿用 `docs/migration-reports/batch-9a.md` §8 的 17 步表，步名逐字相同：
`setCourts` → `initial-discovery` → `bounds-change` → `drawer` → `filters` → `sign-in`
→ `courts-channel-with-open-form` → `blocks` → `player-layer-on` → `player-layer-off`
→ `gate-superseded` → `discovery-error` → `map-unavailable` → `location-denied`
→ `getters` → `sign-out` → `sign-in-other-account`。

派工單點名必含的七項全部涵蓋：初始化（step 1–2）、bounds（step 3）、filters（step 5）、
登入／登出 authEpoch 翻轉（step 6／16／17）、courts 通道（step 7）、player layer 開關
（step 9／10）、gate superseded（step 11）、非法值零派發（step 4 的 `setDrawerState("half")`）。

**斷言面＝呼叫序列，不是最終狀態。** 每一筆是一條字串
`步驟|通道|payload 指紋`，通道有六種：`render`、`pins`、`players`、`mySessions`、
`surface:createSession:setCourts`、`getter:*`，另有每步開頭的 `步驟|step|--` 標記。
指紋只取決定畫面的欄位，例如：

```text
sign-in|mySessions|auth=1 status=loading err="" public=0 gen=1 blocked=0:idle:"" needsAction=0 upcoming=[] history=[] unread=0
courts-channel-with-open-form|surface:createSession:setCourts|courts=[8,9] ready=1
player-layer-on|players|on=1 status=loading msg="正在載入在線球友…" groups=[]
```

golden 是 `assert.deepEqual(entries, GOLDEN)`，GOLDEN 122 筆逐字寫死在檔內
（自 2026-08-19 工作樹錄製後貼入，錄製用的臨時 dump 分支已從交付檔移除）。
因此「多派發一次」「少派發一次」「兩次派發被合併成一次」「次序對調」全都會紅——
這正是 113 條既有測試抓不到的面（9a §5 已盤出只有 3 處釘呼叫次數）。

**時間固定**：所有 `startAt` 是固定常數 `2099-01-02T02:00:00.000Z` 與
`2099-01-03T02:00:00.000Z`；2099 恆在未來，`isDiscoverableSession` 與
`sortSessionsForDrawer` 的結果與真實時鐘無關。filters 步刻意只動 `band`／`types`／
`districts`，不用 `dateKey`（`matchesDateKey` 依「今天／明天／週末」比對，會隨真實日期漂移）。
輪詢間隔設為 1 小時、`visibilityTarget: null`，不依賴時鐘與網路。連跑 5 次全綠，零 flake。

### 2.3 掃描集非空下限

第二條測試 `the recorded sequence covers every scripted step and is not an empty scan`
獨立斷言三件事：

- `entries.length > 50`（實際 122，指令自 golden 解析計得：17 個步驟標記＋105 筆實際呼叫；
  逐步分佈 `setCourts 3 / initial-discovery 6 / bounds-change 6 / drawer 6 / filters 12 /
  sign-in 10 / courts-channel-with-open-form 8 / blocks 2 / player-layer-on 6 /
  player-layer-off 3 / gate-superseded 9 / discovery-error 6 / map-unavailable 3 /
  location-denied 6 / getters 5 / sign-out 4 / sign-in-other-account 10`）；
- 17 個步驟標記按腳本次序 `deepEqual` 出現，一個不漏；
- **每一步都至少錄到 1 筆實際呼叫**（迴圈逐步 assert，不是總數 assert）——
  避免「某步整段沒跑到但總筆數仍過門檻」的假綠。

### 2.4 紅綠實證（canary 兩發）

還原一律用精確 Edit 逐字改回（**禁 `git checkout`**，批 10 事故教訓），
SHA 以 `shasum -a 256 | cut -c1-16` 記錄。

```text
== baseline（C 已套用後） ==
sessionStore.ts      3f011476c57a3b89
sessionController.js 6212d4dceedab74f
既有 tests/session-controller.test.js: # pass 113 # fail 0
新 sequence 測試:                       # pass 2   # fail 0

== CANARY A1  emit 做逐欄值比對去重（＝9a canary 1 同型） ==
注入 sessionStore.ts SHA  ecc086981e6a7802
既有 113 條:  # pass 113 # fail 0   ← 全綠，未偵測
新 sequence:  # pass 1   # fail 1   ← 紅，17 筆 golden 條目分歧
              diff 開頭列出的分歧都是 filters 步的 `-`（expected 有、actual 沒有）：
              `filters|render` / `filters|pins` / `filters|players` 整組沒被派發
還原 sessionStore.ts SHA  3f011476c57a3b89   ← 逐字回復
還原後: # pass 115 # fail 0

== CANARY A2  authEpoch 寫入繞過 store（＝9a canary 3 同型） ==
注入：宣告 closure `let bypassAuthEpoch = 0`，把
      `store.setState({ authEpoch: read().authEpoch + 1 })` 改成 `bypassAuthEpoch += 1`
注入 sessionController.js SHA  b198ebd4b2e8ab4c
既有 113 條:  # pass 113 # fail 0   ← 全綠，未偵測
新 sequence:  # pass 1   # fail 1   ← 紅，24 筆 golden 條目分歧
              症狀與 9a 完全相同：mySessions 通道 viewGeneration 全部 gen=1/2/3 → gen=0
還原 sessionController.js SHA  6212d4dceedab74f   ← 逐字回復
還原後: # pass 115 # fail 0
```

分歧筆數的計法：`node --test` 的 deepEqual diff 輸出中，以 `+` 或 `-` 起首的行數
（`grep -c` 計得），再扣掉 `+ actual - expected` 那一行標頭——A1 為 18−1＝17，
A2 為 25−1＝24。

**這兩發就是本項的存在理由**：兩種缺陷都不改變任何單一斷言的最終值，113 條原有測試
會以「全綠」放行；只有呼叫序列面攔得下來。9a 用臨時 probe 證過一次，現在這條證據常駐了。

---

## 3. B：三條死宣告刪除

### 3.1 逐條死因（三件證據齊全）

三件證據＝(a) 殺手規則與特異性、(b) import 位序、(c) markup class 共現，
外加 (d) 幾何指紋實測值作為經驗面覆核。`src/main.js` 的 import 次序即層疊次序：
`style(1) map-page(2) discovery(3) surfaces(4) sheet-shells(5) navigation(6) pages(7)
session(8) create-session(9) responsive(10) vocabulary(11) player-sheets(12) motion(13)`。

**① `.time-tile--done { width: 60px; gap: 2px; }`（原 `src/create-session.css:125`）**

- (a) 殺手：`src/vocabulary.css:23` `.time-tile { … width: 64px; padding: 9px 0; gap: 3px; … }`，
  兩者同為 (0,1,0)。
- (b) `create-session.css` 位序 9 ＜ `vocabulary.css` 位序 11 → 後者勝。
- (c) `src/sheets/CreateSessionSheet.tsx:740` `<div className="time-tile time-tile--done">`
  ——兩個 class 共現於同一元素，`.time-tile` 必然同時命中。
- (d) 實測（desktop 與 390px 皆同）：`width=64px  row-gap=3px  column-gap=3px`，
  不是 60/2。
- **兩個宣告全死 → 刪整條。** `time-tile--done` class 名保留在 TSX 不動（class 名凍結）。

**② `.level-chip { … font-weight: 600 }`（原 `src/map-page.css:181`）**

- (a) 殺手：`src/vocabulary.css:53` `.chip { … font-size: 13.5px; font-weight: 500; … }`，同為 (0,1,0)。
- (b) `map-page.css` 位序 2 ＜ `vocabulary.css` 位序 11 → 後者勝。
- (c) `index.html:54` `<button type="button" id="level-chip" class="chip level-chip" …>`
  ——`chip` 與 `level-chip` 共現。
- (d) 實測 `#level-chip`：desktop `font-weight=500  height=36px  font-size=13.5px`；
  390px `font-weight=500  height=44px`。不是 600。
- **只刪 `font-weight: 600`，保留 `gap: 6px`**：`gap` 同樣輸給後位的 `.chip { gap: 6px }`，
  但兩者同值、刪不刪都零影響，且不在派工單點名範圍——**列為觀察項不自行擴大 scope**（§9-2）。

**③ `.chip--district { height: 38px; padding: 0 13px; font-size: 13px; }`（原 `src/surfaces.css:102`）**

- (a) 殺手：同一條 `src/vocabulary.css:53` `.chip { height: 36px; padding: 0 12px; font-size: 13.5px; }`，
  同為 (0,1,0)；另有同檔 `@media (max-width: 700px) { .chip { height: 44px } }`。
- (b) `surfaces.css` 位序 4 ＜ `vocabulary.css` 位序 11 → 後者勝。
- (c) `src/sheets/FilterSheet.tsx:151`
  `className={selectedClass("chip chip--district", selected, "is-selected")}` ——共現。
- (d) 實測 12 個行政區 chip：desktop `height=36px padding-left/right=12px font-size=13.5px`；
  390px `height=44px padding 12px font-size=13.5px`。從來不是 38/13/13。
- **三個宣告全死 → 刪整條。** 旁邊的 `.chip--district:active` **本批不動**（見 §3.4）。

三處原本的中文註解都描述「設計意圖」而非現況（批 10 §12 已點名），刪宣告後註解會變成
描述不存在的規則，故三處註解一併改寫成「原本有什麼、為什麼從未生效、實測值是多少」的
維護紀錄；`src/vocabulary.css` 檔頭那句「靠來源順序勝過 map-page.css 的 .level-chip 與
surfaces.css 的 .chip--district 同階宣告」在刪除後失準，也一併訂正（§8 偏離 2）。

### 3.2 幾何指紋：刪除前後逐值零差異

方法（沿用批 10 教訓：動畫 settle／rAF 兩幀／localhost dev）：臨時 probe
（`tests/tmp-batch11-fingerprint.spec.js` ＋ `playwright.tmp-batch11.config.js`，
兩檔量完即刪，最終 `git status` 已確認不殘留）在 dev server（127.0.0.1:5176）上，
對三個受影響 surface 各錄 root 與全部後代的 **完整 computed style（逐屬性）＋
getBoundingClientRect**，等待 700ms ＋ `requestAnimationFrame` 兩幀後才取樣。

覆蓋（3 surface × 2 viewport ＝ 6 檔）：

| surface | 錄製 root | 元素數 |
|---|---|---|
| 地圖 topbar 的 level-chip | `.map-toolbar` | 16 |
| 篩選 sheet 的 district chips | `#filters-sheet`（斷言 `.chip--district` 恰 12 個） | 49 |
| create-session sheet 成功頁的 time-tile | `#session-create-modal`（斷言 `.time-tile--done` 恰 1 個） | 125 |

viewport：`fp-desktop`（Desktop Chrome）與 `fp-390`（Pixel 5，390×844）。

結果（逐字抄自比對腳本輸出）：

```text
FINAL FILES=6 ELEMENTS=380 VALUES_COMPARED=201020 DIFFS=0
```

掃描集非空由 probe 內建 assert 保證（每個 surface `rows.length > 3`，且
district chips 恰 12、time-tile--done 恰 1）。

### 3.3 幾何指紋 probe 自身有牙（第三發 canary）

「零差異」若因為 probe 根本測不到東西也會是零。故對 probe 本身做一發三拍：

```text
== 基線 ==
vocabulary.css SHA f2ce3c8c73113842
fp-before vs fp-after（＝三條死宣告已刪）: VALUES_COMPARED=201020 DIFFS=0

== CANARY B  把 vocabulary.css 的 .chip { font-weight: 500 } 改成 600 ==
注入 vocabulary.css SHA f113521d2061ef1e
fp-before vs fp-canary: VALUES_COMPARED=199880 DIFFS=110   ← 紅

== 還原 ==
vocabulary.css SHA f2ce3c8c73113842   ← 逐字回復（精確 Edit，非 git checkout）
fp-before vs fp-after2: VALUES_COMPARED=199880 DIFFS=0
```

存量綠 → canary 違規驗紅 → 移除 canary 綠，三拍齊。
（canary 三行的 `VALUES_COMPARED` 是 199,880 而非 201,020：canary 用的是精簡比對腳本，
只比 rect ＋ computed style，未含每個元素的 3 個 meta 欄位；380 × 3 ＝ 1,140，差額吻合。）

額外靜態覆核：`npm run build` 產物 `dist/assets/index-B9tb6YH3.css` 內
`.time-tile--done` 規則已完全不存在，`.chip--district` 只剩
`.chip--district:active{transform:scale(.95)}`，`.level-chip` 只剩 `{gap:6px}`。

### 3.4 新發現：批 10 驗收註記第 5 點與實測不符（本批不動，交 PM 裁決）

批 10 報告 §12 第 5 點把 `.chip--district:active { transform: scale(0.95) }` 記為
「四個 chip 修飾子裡只有這條倖存」，理由是「`.chip:active` 是 `.94`，但 district 那條較後，
仍生效」。**實測相反。**

在頁面內直接讀 CSSOM 的文件序（枚舉所有 stylesheet 的規則，取 `selectorText` 含
`:active` 且去掉 `:active` 後仍 `node.matches()` 的規則），輸出逐字為：

```text
ACTIVE_RULE_ORDER= [{"sheetIndex":4,"selector":".chip--district:active","transform":"scale(0.95)"},
                    {"sheetIndex":11,"selector":".chip:active","transform":"scale(0.94)"}]
```

`.chip--district:active` 在 sheet 4（`surfaces.css`，import 位序 4），
`.chip:active` 在 sheet 11（`vocabulary.css`，import 位序 11）；兩者同為 (0,2,0)，
**後者較後故 scale(0.94) 勝出** ——`.chip--district:active` 其實也是死宣告，是第四條。

本批**不刪**（超出派工單點名的三條，屬擴大 scope，依紀律交由 PM 決定），
但已把正確結論寫進 `src/surfaces.css` 的註解，避免下一個人照舊註解誤判。

---

## 4. C：位置錯誤訊息抽常數

`src/sessionController.js:156` 新增模組層常數：

```js
const LOCATION_UNAVAILABLE_MESSAGE = "無法取得位置；你仍可移動地圖或依球場尋找球局。";
```

`requestCurrentLocation` 內原本重複 5 次的字面全部改引用（已封鎖／無 geolocation／
座標非有限值／使用者拒絕／呼叫拋錯五個分支）。

**grep 計數（指令算，非手數）：**

```text
grep -c "無法取得位置" src/sessionController.js                       → 1   （常數定義那行）
grep -n "const LOCATION_UNAVAILABLE_MESSAGE" … | wc -l                → 1
grep -c "locationMessage: LOCATION_UNAVAILABLE_MESSAGE" …             → 5
```

**字面逐字不變的位元組證據**：`git show HEAD:src/sessionController.js` 與工作樹各自
取出該字串後 `od -c`，兩邊輸出完全相同（`347 204 241 346 263 225 …  343 200 202`，
`Buffer.byteLength(…, "utf8")` 計得 69 bytes）。

**相關測試斷言**：`tests/smoke.spec.js:3113`
`await expect(page.locator("#location-feedback")).toContainText("無法取得位置");`
在 `npm test` 全套中通過；新 sequence 測試的 golden 也把完整文案釘進
`location-denied` 與其後各步的 `locMsg=` 指紋（5 筆），文案若被改動會即刻紅。

零行為變更：`store.setState` 的呼叫位置、參數形狀與 `publish()` 時機完全未動。

---

## 5. D：smoke.spec.js:2780 補內容層斷言

### 5.1 新增內容

`tests/smoke.spec.js` **既有行零修改**（`git diff --numstat` 為 `84  0`，
刪除行數 0），在 `:2780` 那條測試的收尾 `});` 之後、`a pending withdrawal…` 之前
緊鄰新增一個 block：

`the non-drawer report dialog renders its full content and keeps it after the trigger card disappears`

沿用 `:2780` 的同一情境（My Sessions 卡片 → `openReportDialog`，非抽屜語境），斷言內容層：

- `dialog.getByRole("heading", { name: "回報問題" })` 可見；
- `targetLabel` 文案「青年公園網球場 · 週六上午」出現在 dialog 內；
- `report-form` 可見、其內 `role=group` 的「檢舉原因」fieldset 可見；
- `input[name='report-reason']` 恰 4 個，且 `type:value` 逐一等於
  `radio:與實際球局不符 / radio:不當行為 / radio:疑似詐騙 / radio:其他`；
- `report-submit` 可見且文字為「送出檢舉」；
- 背景重繪抽掉觸發卡片後（與 `:2780` 同一步驟），form／4 個 radio／submit 仍在。

### 5.2 缺口對照實證（canary）

注入＝批 8.7 canary A 同型：把 `src/sheets/ReportDialog.tsx` 的
`flushSync(() => reactRoot.render(<ReportDialog {...options} />))` 改成
`flushSync(() => reactRoot.render(null))`。

```text
== baseline ==
ReportDialog.tsx SHA 179e00922c584eb0
-g "report dialog" → 3 passed（:2743 / :2780 / 新測試）

== CANARY D  render → null ==
注入 ReportDialog.tsx SHA 36869d3584e556dc
2 failed:  smoke.spec.js:2743（既有的 report dialog 行為測試）
           smoke.spec.js:2854（本批新增的內容層測試）  ← 紅
1 passed:  smoke.spec.js:2780（非抽屜焦點回復測試）    ← 仍綠，缺口對照成立
首個紅斷言：`dialog.getByRole("heading", { name: "回報問題" })` 找不到

== 還原 ==
ReportDialog.tsx SHA 179e00922c584eb0   ← 逐字回復（精確 Edit）
3 passed
```

`:2780` 在內容整個消失時照樣綠——這正是派工單引述的批 8.7 實證，本批獨立重現了一次，
新測試補上的就是這塊。

---

## 6. canary／注入時序總表

| # | 目標 | 檔 | 基線 SHA | 注入 SHA | 還原 SHA | 舊測試 | 目標測試 |
|---|---|---|---|---|---|---|---|
| A1 | emit 逐欄值比對去重 | `src/sessionStore.ts` | `3f011476c57a3b89` | `ecc086981e6a7802` | `3f011476c57a3b89` | 113 全綠 | **紅**（17 筆分歧） |
| A2 | authEpoch 繞過 store | `src/sessionController.js` | `6212d4dceedab74f` | `b198ebd4b2e8ab4c` | `6212d4dceedab74f` | 113 全綠 | **紅**（24 筆分歧） |
| B | `.chip{font-weight}` 改值 | `src/vocabulary.css` | `f2ce3c8c73113842` | `f113521d2061ef1e` | `f2ce3c8c73113842` | — | 指紋 **紅**（110 值） |
| D | ReportDialog render→null | `src/sheets/ReportDialog.tsx` | `179e00922c584eb0` | `36869d3584e556dc` | `179e00922c584eb0` | `:2780` 綠 | **紅** |

四發的還原全部以精確 Edit 逐字改回，SHA 位元組級回復；`git status` 最終不含
`src/sessionStore.ts` 與 `src/sheets/ReportDialog.tsx`，反證兩檔與 HEAD 完全相同。

工作樹最終 SHA：

```text
6212d4dceedab74f  src/sessionController.js
3f011476c57a3b89  src/sessionStore.ts          （＝HEAD）
179e00922c584eb0  src/sheets/ReportDialog.tsx  （＝HEAD）
31bbfb610966a0ce  src/create-session.css
43926857ab412429  src/map-page.css
c8fdc173406af710  src/surfaces.css
2b6f4ad44256e431  src/vocabulary.css
176789e08f6c4234  tests/smoke.spec.js
7cc76d9df539a9c5  tests/session-controller-sequence.test.js
14afff0c27a91fd6  package.json
```

---

## 7. 完整 gate 七站（最終工作樹，逐字結尾）

兩個會起 dev server 的站（`npm test`、`npm run test:local`）啟動前各查一次
`pgrep -f vite | wc -l`，皆為 `0`；批 11-B 的臨時指紋 probe 啟動前亦查過一次，同為 `0`。

**1. `npm test`**（pretest 含 `generate-courts-seed.mjs --check` 與 `typecheck`）

```text
# tests 248
# pass 248
# fail 0
# skipped 0

  4 skipped
  254 passed (2.4m)
```

（單元 248＝原 246 ＋ 本批 2——246 是本批以 HEAD 的 15 個檔名單實跑重算的，不是抄的；
mock Playwright 254＝252 ＋ 本批新測試 ×2 project，其中 252 引自批 10 驗收方註記，
本批未另行在 HEAD 上重跑驗證）

**2. `npm run test:local`**

```text
  11 skipped
  42 passed (1.5m)
```

**3. `npm run typecheck`**

```text
> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit
（無輸出，exit 0）
```

**4. `npm run lint`**

```text
> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{ts,tsx}" vite.config.ts
（無輸出，exit 0）
```

**5. `npm run prettier:check`**

```text
Checking formatting...
All matched files use Prettier code style!
```

**6. `npm run build`**

```text
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-Ddb_WTIS.js   713.77 kB │ gzip: 201.04 kB
✓ built in 855ms
```

**7. `git diff --check`**

```text
（無輸出，exit 0）
```

**guarded DB reset：未執行。** `npm run test:local` 首跑即 42 passed／11 skipped，
沒有出現疑似資料累積的紅，依派工單兩態規則「否則不跑並聲明」，本批不跑
`CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`。

---

## 8. 偏離清單

1. **`package.json` 的 `test:session-unit` 加入新測試檔**（派工單未列為可動檔）。
   `test:session-unit` 是逐檔列舉式的 node --test 呼叫，不加就等於新測試永遠不進 gate，
   「常駐化」形同虛設。改動僅 1 行、只新增一個檔名，未動其他檔序。
2. **三處被刪宣告旁的中文註解一併改寫，並訂正 `src/vocabulary.css` 檔頭一句。**
   派工單寫的是「刪宣告」，但那三段註解描述的正是被刪的規則（批 10 §12 已指出它們寫的
   是設計意圖非現況），留著會變成描述不存在規則的假資訊；`vocabulary.css` 檔頭那句
   「靠來源順序勝過 …`.level-chip` 與 …`.chip--district` 同階宣告」在刪除後直接失準，
   而它是批 10 刻意留下的 import 次序警告，錯了比沒有更危險。改寫內容只陳述已實測的事實。
   零 computed 值影響（幾何指紋在註解改寫**之後**重跑，仍 DIFFS=0）。
3. **A 的 17 步腳本步名與步數未裁剪，但實際呼叫筆數比 9a 少 2**（本批 105 vs 9a 的 107，
   總筆數 122 vs 124）。逐步比對（指令自 golden 計得，非手數）：**17 步中 15 步與
   9a §8 表逐列同值**，只有 `sign-in` 與 `sign-in-other-account` 各為 10（9a 各 11），
   差額 2 全數落在這兩步的 mySessions 通道。9a 的臨時 probe 已不存在（該批註明跑完即移除
   worktree），本批未重建它逐筆對照，因此**不宣稱這 2 筆的成因**，只記錄事實。
   派工單允許裁剪，七項必含面（初始化／bounds／filters／登入登出 authEpoch／
   courts 通道／player layer／gate superseded／非法值零派發）全數保留。
4. **`.level-chip` 的 `gap: 6px` 未刪。** 它同樣輸給後位的 `.chip { gap: 6px }`，
   技術上也是死宣告，但兩者同值、刪不刪零影響，且不在派工單點名的三條內——
   不自行擴大 scope，列入 §9 觀察項。

---

## 9. 觀察項（交 PM 裁決，本批不改）

1. **第四條死宣告：`.chip--district:active { transform: scale(0.95) }`。**
   §3.4 已用 CSSOM 文件序實測證明它輸給 `vocabulary.css` 的
   `.chip:active { transform: scale(0.94) }`。這同時修正了批 10 報告 §12 第 5 點
   （原記為「四個 chip 修飾子裡只有這條倖存」）。要刪要留是同一類清理決策，
   但已超出本批點名範圍。
2. **第五條（同類、零影響）：`.level-chip { gap: 6px }`** ——輸給 `.chip { gap: 6px }`，
   同值故無視覺差。
3. **「讓死宣告生效」的另一條路線仍在檯面上。** 批 10 §12-4 指出正解是把
   `vocabulary.css` 移到消費它的檔案**之前**，再逐一確認各修飾子恢復生效後的視覺。
   本批走的是刪除路線（維持現狀視覺），該路線未被關閉，但它是視覺變更批。
4. **新 golden 的維護契約已寫進檔內註解**：改動 golden 只有兩種正當理由（刻意改派發
   行為、刻意改腳本／指紋欄位），且必須在報告說明哪一筆為什麼變，不可為了轉綠重錄。
   建議日後驗收把「golden 被整批重寫」視為紅旗。
5. **臨時 probe 未入版。** `tests/tmp-batch11-fingerprint.spec.js` 與
   `playwright.tmp-batch11.config.js` 量完即刪（`ls` 已確認兩檔不存在）；指紋 JSON 全部
   落在 scratchpad，不在 repo。`test-results/` 與 `dist/` 由 `.gitignore` 第 5／3 行忽略
   （`git check-ignore -v` 已驗），是每次 playwright／build 的正常產物。
   最終 `git status` 為 7 個 modified ＋ 2 個 untracked（新測試檔與本報告）。
   若日後要常駐幾何指紋，需要先決定它放哪個 project、以及 golden 存放方式，
   那是另一個決策，不在本批。

## 驗收方註記（2026-08-19）

1. **偏離四條全數接受**：package.json 納新檔（必要）；被刪宣告旁註解與 vocabulary.css
   檔頭訂正（維護者須知非施工註解，且指紋重跑零差異）；105 vs 107 不宣稱成因（誠實，
   由驗收方 read-back 定案，見下）；`.level-chip{gap:6px}` 同值不刪（符合「輸掉且值不同
   才刪」政策）。
2. **105 vs 107 差額經 read-back Lens 1 定案＝fake 構造差異,非行為變更**：
   `git diff 92152d6..HEAD -- src/sessionController.js src/sessionStore.ts` 為空
   （位元組級排除行為變更假說）；成因是新測試 api fake 缺 `loadSessionRoster`，
   `hydrateMySessionRosters` 於 sessionController.js:698 提前 return，跳過 :726 的
   收尾 `notifyMySessions()`——恰好使兩個 sign-in 步各少一拍 mySessions 通道通知。
3. **驗收方修正 ×2（修後重跑七站 gate）**：(a) api fake 補 `loadSessionRoster:
   async () => []`（fixture 全 guest 局 hydrate targets 恆空，fake 不會被呼叫但讓收尾
   派發路徑走到底），golden 補回兩筆重複 loading 拍——實跑 diff 恰出兩筆、與 Lens 1
   預測逐字吻合，補後 2/2 綠、golden 回到批 9a 全量 107 呼叫，roster hydrate 收尾拍
   自此入凍結面；(b) surfaces.css 註解「批 10 驗收註記」訂正為「批 10 報告觀察項」
   （錯句實際在 dev 撰的 §12 觀察項節，非驗收方註記節）。
4. **獨立 canary（角度＝golden 對 payload 內容的咬合，dev 兩發〔emit 去重／authEpoch
   繞過〕之外的第三向）**：`LOCATION_UNAVAILABLE_MESSAGE` 字面改一字 → sequence 測試紅
   （golden locMsg 不符）→ 還原綠、SHA 逐字回復——同時實證 C 項字面等價與 A 項測試
   對文案面的凍結力。
5. **Read-back 三 lens 全 PASS**：B 項三條死宣告四件證據獨立 CSSOM 推演全成立、無存活
   路徑（含 ≤700px media 區間）；第四條死宣告 `.chip--district:active` 確認屬實，批 10
   報告 §12 第 5 點確實記反；D 項缺口前提（:2780 只斷殼）經 HEAD 原文確認；C 項字面
   byte 級、範圍零越界、gate 數學一致（248=246+2、254=252+2）。
6. 兩輪七站 gate 全綠（第二輪對驗收方修正後的最終版）。`.chip--district:active` 第四條
   死宣告是否刪除,列入下批 PM 觀察項。
