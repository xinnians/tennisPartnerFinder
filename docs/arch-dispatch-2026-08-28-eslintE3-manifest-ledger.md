# ESLint 恢復 Phase E-3 派工單：manifest ledger 機械化批（不改 src）

- 日期：2026-08-28。母文件：
  `docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md` §4E；設計輸入＝
  E-2 驗收紀錄
  （`docs/arch-reports/eslintE2-map-callback-default-acceptance-2026-08-28.md`）
  「下批必要修正」第 2、4、5 點。
- 開工基準：`abd0cf1` 之後包含本派工單的最新 main HEAD。開工前
  `git status --porcelain` 應為空；出現任何條目即停手回報。
- **本批性質：純工具批。零 `src/**` diff、零 `tests/**` diff、零
  `eslint.config.js` diff、零 finding 修復**。目標＝把 generator 的手調
  常數（`:16-18`）換成「baseline＋removal ledger」推導，並把「清零檔必須
  scoped 上線」機械化——讓 controller ports 79 筆放量時不再手調、不再
  漏上線。
- 你不 commit、不 push；working tree 交驗收方。

## 動機（為何常數推導不夠、要集合推導）

手調常數只驗「數字對上」，證明不了「減 2 是修好而非漏掃」。本批改為
**集合等式**：`現掃 findings 的 stableId 集合 ＝ baseline 集合 −
ledger 集合`，雙向逐筆比對——多一筆、少一筆、換一筆都指名紅。E-2 驗收
的「零漂移指令複算」自此內建於 generator。

## 交付一：`docs/arch-eslint-phaseE-baseline.json`（一次性固化，之後凍結）

- 從 `git show 77365a0:docs/arch-eslint-phaseE-unbound-manifest.json`
  （E-1 ACCEPTED 版）以指令提取全部 246 筆的 `{stableId, path}`，依
  現行 manifest 排序原則（path，astPath——直接沿用原陣列順序即可）
  落檔；含 header 欄註明來源 commit `77365a0` 與筆數 246。
- 開單實測 [已驗證]：該版 246 筆／28 檔／sessionController 63。
- **此檔一經驗收即凍結**：它是 Phase E 全程的固定基準，任何後續批
  不得重算或改寫（防「移動球門」）。

## 交付二：`docs/arch-eslint-phaseE-removal-ledger.json`

- accepted removals 陣列，每筆
  `{stableId, path, batch, acceptanceDoc}`；初始內容恰 E-2 兩筆：
  `20cd603ceabcae4d0887599015c26831`／`761154dcdb4d5bda67d077b9bf89e588`
  （`src/map.ts`，batch "E-2"，acceptanceDoc 指向 E-2 驗收紀錄）。
- 之後每個修復批 ACCEPTED 時由該批追加；本批之後 generator 常數不再
  存在，ledger 是唯一的「已修」帳本。

## 交付三：generator 改造（`scripts/generate-eslint-unbound-manifest.mjs`）

1. **刪除 `:16-18` 三常數**，改為讀 baseline＋ledger 推導：
   - expected stableId 集合＝baseline − ledger（先驗 ledger ⊆ baseline、
     ledger 內無重複，違反即 exit 非 0 並指名）。
   - `validateHardGates` 改為集合等式：現掃每筆 stableId 必在 expected
     集合、expected 每筆必在現掃——**兩方向缺漏都逐筆指名 stableId＋
     path 後 exit 非 0**。findings／files／sessionController 三數字改由
     集合推導後仍印在成功行（口徑不變，供回報逐字）。
   - duplicate stableId 0、unresolved 0、schema 逐欄驗證全部保留。
2. **清零檔 scoped 上線 assert**：全清檔＝baseline 有該 path、現掃為
   0 筆的檔。對每個全清檔以 ESLint API `calculateConfigForFile` 驗
   `@typescript-eslint/unbound-method` severity 為 error，否則 exit 非 0
   指名檔案（本批應恰驗到 `src/map.ts` 一檔）。反向（未清零檔被提前
   上線）也 assert：現掃仍有 finding 的檔若 effective 已是 error，
   指名紅——這正是「清零門檻以檔計」的機械化（E-2 驗收「下批必要
   修正」第 2 點；[已驗證] 反向 assert 在現況 27 檔天然綠）。
   讀 effective config **必須另建一顆不帶 `overrideConfig` 的
   `new ESLint()`**；不可重用 `:649-651` 那顆掃描用 instance——實測該
   instance 會讓所有被掃檔案的 severity 都回報 `error`，正向 assert
   將淪為空斷言、反向 assert 將對 27 檔全紅。severity 取值需正規化
   （回傳為陣列如 `[2]`；接受 `2`／`"error"`，`undefined` 視為 off）。
   注意本 assert 對後續批強加順序約束：**先改 `eslint.config.js` 把
   清零檔上線，再重生 manifest**，否則 generator 在「已清零未上線」
   狀態硬失敗——這是設計意圖，不是 bug。
3. **manifest 輸出零變更**：findings 內容、排序、兩檔 render、
   `findingsChecksum` 演算法全部不動。**改造後重生的兩份 manifest 必須
   與 HEAD 版 byte-identical（SHA 自證）**——這是「改造不影響產出」的
   最強證據。`--check` 語意不變。`validateHardGates` 的回傳形狀
   `{duplicateStableIdCount, fileCount, sessionControllerFindings,
   unresolvedDeclarationCount}` 一併凍結——`manifest.summary`
   （`:735-737`）直接消費它，改形狀即改輸出。
4. 風格與 lint 面同 E-1：過現行 `scripts/**` ruleset 與 prettier；
   不改 `package.json`、不加依賴；`--check` 仍是唯一旗標。baseline／
   ledger 讀檔失敗（缺檔、壞 JSON、schema 不符）一律 fail closed。

## 硬驗收條件（canary 三組，各自紅→SHA 還原→綠）

**E-2 驗收教訓（強制紀律）**：canary 前先抄下目標檔 SHA-256；清除一律
精確編輯還原，**禁 `git checkout`**——在未 commit 的 working tree 上
checkout 必回到錯誤基準（本批 canary 1／2 動的是未追蹤新檔，checkout
根本不適用；canary 3 也一律用精確編輯還原並比 SHA）。

1. **ledger 少列 canary**：暫時從 ledger 移除一筆（如 `761154dc…`）→
   generator 紅，指名該 stableId「expected 但現掃缺席」→還原綠。
2. **ledger 偽造 canary**：暫時加入一筆不存在的 stableId → 紅，指名
   「不在 baseline」（ledger ⊆ baseline 檢查）→還原綠。
3. **上線缺席 canary**：暫時把 `eslint.config.js` scoped 區塊的
   `"src/map.ts"` 改為不匹配（如改成 `"src/map.canary.ts"`）→ 紅，
   指名 `src/map.ts` 清零但未上線 → 還原綠（`eslint.config.js` 僅在
   此 canary 期間暫改，結束時 SHA byte-identical 還原）。
4. manifest 重生與 HEAD 版 byte-identical（兩次生成＋與 HEAD SHA 比對
   三份一致）；`--check` 綠。
5. 成功行三數字仍為 244／27／63（推導值與 E-2 驗收值一致）。

## 解凍清單（Q3 守則：未列即凍結）

- `scripts/generate-eslint-unbound-manifest.mjs`。
- 新檔 ×2：`docs/arch-eslint-phaseE-baseline.json`、
  `docs/arch-eslint-phaseE-removal-ledger.json`。

**仍凍結**：`src/**` 全部、`tests/**` 全部、`eslint.config.js`（除
canary 3 暫改並 SHA 還原）、`tsconfig.json`、`package.json`、
`package-lock.json`、manifest 兩檔（**重生後必須 byte-identical，任何
diff＝退件**）、bundle gate。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

- `git status --porcelain -- src tests eslint.config.js tsconfig.json
  package.json package-lock.json docs/arch-eslint-phaseE-unbound-manifest.json
  docs/arch-eslint-phaseE-unbound-manifest.md`＝**空**（凍結面自證，最高
  優先；test:local 豁免的前提）。全庫 porcelain 恰為解凍 3 檔（改造
  generator＋新 JSON ×2）＋回報，共 4 條。
- generator 兩次 byte-identical＋`--check` 綠＋三組 canary 逐字。
- lint／prettier:check（含改造後 script 與兩個新 JSON——注意
  `prettier:check` glob 不含 `docs/**`，新 JSON 不需也不得為過 prettier
  而調整 generator 讀取；script 本身必須 prettier-clean）。
- typecheck 綠（tsconfig 不含 scripts，跑一次自證）。
- test:session-unit（346）＋test:mock（≥298）smoke；**test:local 豁免
  ——前提＝上列凍結面零 diff 自證成立**。
- bundle 對照淨 0 B（跑一次自證）。

## 回報合約

寫 `docs/arch-dispatch-2026-08-28-eslintE3-manifest-ledger-report-codex.md`
（不 commit、不 push），必含：baseline 提取指令與筆數自證、推導邏輯
摘要（集合等式與兩個方向的錯誤訊息格式）、三組 canary 逐字（含還原
SHA）、manifest byte-identical 三份 SHA、成功行逐字、收尾矩陣逐字、
Codex 五問（第 5 問答「controller ports 首批
（`mySessionsController.ts` 4 筆）在 ledger 機制下的操作流程逐步演練
——修碼、追加 ledger、重生、上線 assert 各在哪一步發生、驗收方如何
複驗」）、未做／疑義／BLOCKED。
