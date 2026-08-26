# 批 5 派工單：`syncCommit` caller 2→0（審計先行；允許有書面理由的殘留）

- 日期：2026-08-27。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`
  （批 5）；前置：批 4 全案完結（4C-3 ACCEPTED `16c9344`，驗收紀錄
  `docs/arch-reports/batch-4C3-restore-acceptance-2026-08-27.md`）。設計輸入：
  4C-3 回報 §9.5 的 caller-by-caller 兩段退役方案（本單採納其骨架）。授權：
  `.claude/rules/react-migration.md`「分批解凍」第 5 條（批 5 解凍 imperative
  handle 的同步 commit 契約並允許逐 caller 退役;每移除一個須以原始 race／focus
  測試驗證,留存者需書面理由）。
- 開工基準：`16c9344` 之後的最新 main HEAD（working tree 應乾淨，否則停手回報）。
- **本批性質**：審計批＋條件式退役批。**兩個 caller 各自的結論（移除或殘留）
  都是合格產出**——判準是證據品質,不是歸零本身;禁止為了歸零而弱化任何
  oracle 或改寫凍結 e2e。
- bundle：total gzip 餘 1,465 B;退役預期回收,超 gate＝BLOCKED。
- 你不 commit、不 push；working tree 交驗收方。

## 核心紀律：殘留必須「移除即紅」實證，移除必須「原始矩陣全綠」

- **殘留 caller**：理由書不准只寫敘述——必附一次「暫時移除該 caller→指名哪條
  既有測試紅（逐字輸出）→byte-identical 還原綠」的三拍證據,證明同步契約是
  載重的而非 cargo cult;理由書逐項列出具體同步觀察點（哪個 public adapter／
  哪行 emit 後立即讀 DOM／焦點）與缺少的替代 handshake（4C-3 回報 §9.5 格式,
  不能只寫「React 需要」）。若暫時移除後全綠＝預設該 caller 沒有殘留理由,
  必須真移除——**唯一例外**：審計判定某 production consumer 會破,但既有矩陣
  對該 caller 無判別力（全綠非因無依賴,而因 oracle 不敏感——需具體論證,例如
  fixture 自帶 `syncCommit`、相關斷言全為重試型）;此時**不得逕行移除,回報
  BLOCKED 交裁決**,也不得自行新增弱化版 oracle 充當紅證據。
- **移除 caller**：跑原始 race／focus 載重矩陣（見 Ground truth 的測試清單）
  全綠;紅的斷言不得配合移除弱化（凍結 e2e 一票否決）。timing 類懷疑一律
  `--repeat-each` 取樣,單次綠紅都不算數;新增 oracle 用會重試的斷言。

## 兩個 caller（依序處理，每步獨立歸因）

### A. `src/sessionStore.ts:102`——`useStoreSelector` 訂閱內的 `syncCommit(listener)`

- 現場：每次 store channel emit 都同步 flush React;註解言明目的＝「Public page
  adapters are synchronous from the e2e caller's perspective」。
- **審計必交付**：列全「store 寫入後同步讀 DOM／焦點」的消費者清單——
  (1) production：`main.js`／controller／features 內呼叫會觸發 emit 的函式後
  立即讀 DOM 的位置（grep 全 caller,不憑 self-report）;(2) 測試側：e2e 以
  `__importAppModule` 直呼 adapter 後用 `page.evaluate` 同步讀 DOM 的位置
  （Playwright 自動重試的 `expect` 不算同步依賴）;(3) 逐項判定「React 批次化
  後會不會破」。
- 結論二擇一：移除（＋原始矩陣全綠＋取樣）或殘留（＋移除即紅三拍＋理由書）。

### B. `src/app/SurfaceHost.tsx:251`——`commitSynchronously` 與其六個呼叫點

- 現場（4C 殼遷移後）：`:268`／`:279`／`:291`（shell mount／mount 失敗清理／
  shell unmount）、`:305`（imperative `commit(update)`）、`:311`（content
  `render`）、`:319`（content `unmount`）。
- 已知結構性依賴（開單時判讀,審計時逐一驗證或推翻）：shell mount 同步＝
  `mountSheet` 返回後 4 個 views 立即 `mounted.root.querySelector(...)` 的
  facade 契約（views 凍結）;content unmount 同步＝E 群 close 序（unmount 先於
  shell 銷毀,同步鏈）;`commit(update)`＝F 群 detail sheet 三 imperative 方法
  返回前 DOM 已更新的契約。
- 六個呼叫點**逐點**判定移除／殘留,不整包處理;預期多數殘留——重點是把每點的
  「移除即紅」證據與同步觀察點寫實。

## 收尾連動（依結論分支）

- `tests/react-surface-lifecycle.test.js` B 群：
  - `:94` 標題 `"...and three approved callers"` 與現值 2 不一致——**無論結論
    如何本批必修**（改為不含數字的措辭或正確數字）。
  - 若 A 或 B 整檔移除：`:109` `approvedCallers` 同步;`:114`
    `assert.ok(callers.length > 0)` 是「退到零反而紅」的 fail-closed 設計——
    **若兩檔全移除**,B 群須改寫為「`syncCommit`／`flushSync` 全庫歸零」封條
    （非空斷言改為反向禁令,附論證）,且 lifecycle 頂層 `readFileSync` 七檔
    常數含 `syncCommit.ts`（`:15`）——刪 `syncCommit.ts` 前必須同步該常數,
    否則整檔 import 期炸掉。
  - 若兩檔都殘留：`:109` 不動,只修 `:94` 標題。
- 殘留理由書落檔：`docs/arch-reports/batch-5-synccommit-retention-2026-08-27.md`
  （若有殘留）,格式＝每 caller／呼叫點：同步觀察點清單（檔案:行號）＋移除即紅
  證據引用＋缺少的替代 handshake＋未來退役條件。

## 解凍清單（Q3 守則：未列即凍結）

- `src/sessionStore.ts`：`:102` 一行與其緊鄰註解（依結論移除或不動）。
- `src/app/SurfaceHost.tsx`：`commitSynchronously`（`:250-252`）與六呼叫點
  （依結論逐點）;A 群 `:80-81` 兩字面斷言若因移除失效,**只准隨真移除同步**,
  不得預先改。
- `src/syncCommit.ts`：僅在兩 caller 全歸零時刪除（連動三處：lifecycle `:15`
  常數、B 群改寫、**三個 harness fixture 的 import 與呼叫**——
  `tests/fixtures/meAppHarness.tsx:171`／`mySessionsAppHarness.tsx:215`／
  `nearbyDrawerAppHarness.tsx:128`,不同步會使 mock 矩陣 import 期炸）。
- `tests/fixtures/{me,mySessions,nearbyDrawer}AppHarness.tsx`：**僅於全歸零
  刪檔分支解凍**其 `syncCommit` import 與呼叫;替代寫法不得弱化 harness 的
  同步 render 語意（eslint 禁直接 import `flushSync`,替代方案需回報說明並
  交裁決,不得自行放寬 eslint）。
- `tests/react-surface-lifecycle.test.js`：B 群 `:94` 標題（必修）;`:109`／
  `:114` 依結論。
- 審計與理由書文件。

**仍凍結（一票否決）**：全部 e2e spec（含 `react-page-focus.spec.js`——批 1
確立為行為測試）與其斷言語意;4 views;14 sheet;`sessionViews.js`;`sheets.js`
（批 4 產物）;`mountSurfaceContent` 契約 shape;E／A（除隨移除連動）／C／D／F
群;`dataApi` 邊界;bundle gate;UI／文案。**不得為了讓移除通過而把任何同步
斷言改成輪詢或刪除。**

## Ground truth（2026-08-27 開單時實測；動手前自行重驗）

- `syncCommit` **src 現況**：helper `src/syncCommit.ts:8`＋`sessionStore.ts:102`
  ＋`SurfaceHost.tsx:251` 恰三處;**測試側另有三個 harness fixture caller**
  （`meAppHarness.tsx:171`／`mySessionsAppHarness.tsx:215`／
  `nearbyDrawerAppHarness.tsx:128`,以自帶 `syncCommit` 包 `root.render`）;
  B 群白名單 `:109` `["app/SurfaceHost.tsx", "sessionStore.ts"]`、`:114`
  非空 fail-closed。
- **caller A 判別力警示**：`react-page-focus.spec.js` 的同步讀段（單一
  `page.evaluate` 內讀 `document.activeElement`）其同步語意來自 harness
  fixture 自帶的 `syncCommit`,不是 production `:102`;真正走 `:102` 的
  store-emit 段斷言全為重試型——該檔對 caller A **判別力存疑,審計時實測**,
  這正是核心紀律 BLOCKED 例外要防的情境。
- 原始 race／focus 載重矩陣（移除時必跑）：`react-page-focus.spec.js`（直呼
  adapter 行為測試,判別力見上）、`performance.spec.js:199`（trap＋restore）、
  `react-unmount.spec.js`（unmount-once＋4B race oracle）、`sheets-dom`
  16 tests、`session-lifecycle-smoke` 全檔、`me`／`messages`／`my-sessions`／
  `nearby-drawer` 四頁 dom unit＋完整 mock desktop＋mobile、test:local。
- 量化基準（4C-3 後）：main gzip 187,462（餘 4,958 B）;total 257,597
  （餘 1,465 B）;unit 346;mock 298 passed／4 skipped;
  `__importAppModule`（window 口徑）110。
- 已知既往：`test:local` 偶發（`session.spec.js:1999` presence RPC 負載型
  timeout,4C-3 驗收已分類）;撞到依取樣＋分類處置,不算移除紅證據。

## 不在範圍

- 批 6 TS 化（含 `sheets.js` 殘餘 facade）;新依賴;UX／文案／CSS;
  bundle gate 調整;任何頁面／sheet 行為變更。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／lint／prettier:check／build／check:production-bundle（main／total
對照＋淨值）／test:mock（≥298;flake 撞到重跑註明）／test:local（污染紅依
guarded reset 三拍;偶發依取樣分類）／`git diff --check`。
**全殘留分支不得引用 testing.md 豁免條款**：即使最終 src/ 零 diff,「移除即紅」
實驗動過 src——test:local 仍必跑,作為 byte-identical 還原之外的還原自證。

## 回報合約

寫 `docs/arch-dispatch-2026-08-27-batch5-synccommit-report-codex.md`（不 commit、
不 push），必含：A／B 審計清單（同步觀察點逐項,指令產出不手數）、每 caller／
呼叫點的結論與證據（移除＝原始矩陣逐字＋取樣;殘留＝移除即紅三拍逐字＋理由書
連結）、B 群 `:94`／`:109`／`:114` 處置、bundle 淨值、`__importAppModule`
對帳、凍結面自證（e2e 零 diff、views／sheets 零 diff）、收尾矩陣逐字輸出、
Codex 五問（第 5 問答「對批 6 TS 化＋拆檔的建議——特別是 `sheets.js` 殘餘
facade 的 TS 化順序與兩處零餘裕測試下限的前置處理」）、未做／疑義／BLOCKED。
