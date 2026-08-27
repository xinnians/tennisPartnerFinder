# 批 6 前置小批派工單：兩處零餘裕測試下限改寫（test-only）

- 日期：2026-08-27。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`
  （批 6 前置）；治理依據：`docs/arch-q3-whitebox-triage-2026-08-26.md`
  「兩處零餘裕下限（批 6 前置）」；設計輸入：批 5 回報 §9.5 的改寫建議
  （`docs/arch-dispatch-2026-08-27-batch5-synccommit-report-codex.md`）。
- 開工基準：`e9301bc` 之後的最新 main HEAD（working tree 應乾淨，否則停手回報）。
- 動機：批 6（TS 化＋拆檔）會新增小型 TypeScript contract leaf 檔並可能整併
  來源——兩處貼近實數的裸下限會把合法變更誤判為紅,先把它們改成「可證明掃描
  完整性」的形式,且**不降低 fail-closed 強度**（守門要驗載重:改完必須仍抓得到
  真漏掃）。
- 本批**零 production 變更**：`git diff` 最終只允許
  `tests/content-visibility-contract.test.js`、`tests/legacy-style-scan.test.js`
  與回報文件;canary 期間在 `src/` 建立的臨時探針檔跑完即刪,不得殘留。
- 你不 commit、不 push；working tree 交驗收方。

## 解凍清單（Q3 守則：未列即凍結）

- `tests/content-visibility-contract.test.js`：僅 `:57`
  `assert.ok(CSS_SOURCES.length >= 13, ...)` 一行的改寫（含新錨點常數的新增）。
- `tests/legacy-style-scan.test.js`：僅 `:43`
  `assert.ok(content.length > 100, ...)` 一行的改寫;`:32-33` 註解的 stale 數字
  勘誤（「64 個 src 檔」——實測已 113 檔＋index.html,改寫時引實測數並註明
  `>=65` floor 現有約 49 檔餘裕、非零餘裕,本批不動該 floor 斷言本體
  `:34-37`）。

**仍凍結（一票否決）**：兩檔其餘全部——`CONTRACTS` 四契約與 `sourceAnchors`、
containment `deepEqual` 對帳、`BANNED` 舊視覺常數清單、
`EXPECTED_SOURCE_DIRECTORIES` 逐目錄非空、`FILES.length >= 65` floor、
`readCssTree`／`readSourceTree` 掃描本體;全部 `src/`;其他測試;bundle gate。

## Ground truth（2026-08-27 開單時實測；動手前自行重驗）

- CSS 現況：恰 **13 檔、全部平鋪 `src/` 根層**（無子目錄 CSS）——
  `CSS_SOURCES.length >= 13` 現值恰 13,任何合法 CSS 整併立即紅。
- `src` 源檔（.css/.js/.ts/.tsx）實數 **113**＋`index.html`＝114;
  `FILES.length >= 65` 有約 49 檔餘裕（其註解數字 stale）。
- `:43` `content.length > 100`：現存所有掃描檔皆 >100 bytes;批 6 的小型
  type-only contract leaf（可能 <100 bytes）會被誤紅。該 guard 的本意是
  「讀取異常＝掃描集會漏檔」（見錯誤訊息原文）,非最小檔案大小政策。
- 兩檔已有的 fail-closed 疊層（改寫時不可弱化）：content-visibility 有
  `CONTRACTS`／`CONTAINMENT_RULES` 非空斷言＋selector `deepEqual` 對帳＋
  source anchors;legacy-style-scan 有 `>=65` floor＋逐目錄非空。

## 作法要求

### A. `content-visibility-contract.test.js:57`——計數改錨點

`>= 13` 裸計數改為**載重錨點對帳**：新增 frozen 錨點清單（建議至少
`src/style.css`＋`src/vocabulary.css`＋`src/sheet-shells.css` 三個不會消失的
載重檔,擇定後說明理由）,斷言 `CSS_SOURCES` 路徑集合**包含**全部錨點（缺一
指名紅）＋維持非空;不引入「恰 N 檔」的新裸數字,也不建立需要人工維護的
全量清單（合法整併／新增 CSS 不應觸紅——這正是本批目的;整併對象若是錨點檔
本身仍會紅,與選檔前提一致）。**偏離自認**：此法較批 5 回報 §9.5 字面的
「manifest 對帳」弱（僅證根層錨點被掃到）,配合漏掃 canary 仍 fail-closed;
`readCssTree` 對未來子目錄 CSS 的盲區與現行 `>=13` 相同,非退化。

### B. `legacy-style-scan.test.js:43`——大小門檻改非空

`content.length > 100` 改 `content.length > 0`,錯誤訊息語意同步（「讀取異常
＝空檔」）;`:34-35` stale 註解數字勘誤。

### C. Canary（三拍必附、逐字輸出;每條先驗 guard 再宣稱紅）

1. **漏掃 canary（A 的牙）**：用「排除單一錨點檔」變體（乾淨:containment
   規則在 discovery／map-page／pages 三檔非錨點,`deepEqual` 不受影響）→
   錨點斷言紅且指名缺檔 → 還原綠。若另跑「跳過全部 `.css`」變體,先撞非空
   斷言亦屬有效紅,但「指名缺檔」仍須以排除單一錨點檔變體證明。
2. **空檔 canary（B 的牙）**：在 `src/` 建臨時 0-byte `.css` 探針 → `:43`
   改寫版紅（讀取異常）→ 刪探針綠。
3. **小檔放行證明（B 的目的）**：在 `src/` 建臨時 ~50-byte 合法內容探針 →
   **改寫前**舊 `>100` 紅（證明舊門檻確實擋合法小檔）→ **改寫後**同探針綠
   → 刪探針,最終兩測試對真實 tree 綠。
   （探針內容不得含 `BANNED` 常數,也不得含 `content-visibility`／
   `contain-intrinsic-size` 宣告——否則撞 content-visibility 檔的 `deepEqual`
   產生無關紅;探針檔不被任何 import 引用。）

## 不在範圍

- `>= 65` floor 與逐目錄非空（有餘裕、設計刻意,不動）;批 6 本體;
  `src/` 任何永久變更;其他測試;bundle。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／lint／prettier:check／test:mock（含 unit;≥298＋兩檔目標測試綠）／
test:local（canary 探針動過 `src/`,比照批 5 不引用豁免,作為還原自證）／
`git diff --check`／範圍自證（`git diff --stat` 只含兩測試檔＋回報;
`git status` 無未追蹤探針殘留）。build／bundle 豁免：最終零 `src/` 變更且
探針從未被 import（回報中自證此前提）。

## 回報合約

寫 `docs/arch-dispatch-2026-08-27-batch6pre-thresholds-report-codex.md`
（不 commit、不 push），必含：兩處改寫前後對照（引用改後原文）、錨點擇定
理由、canary ×3 三拍逐字（含小檔放行的改寫前紅）、探針清除自證、收尾矩陣
逐字輸出、Codex 五問（第 5 問答「對批 6 主體切批的建議——contract leaf →
sheets.ts 機械轉換 → 逐 edge 拆檔三段之外,還有哪些存量 `.js` 值得優先 TS 化、
哪些不值得」）、未做／疑義／BLOCKED。
