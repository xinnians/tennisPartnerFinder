# ESLint 恢復 Phase R2-A/B/C sheets＋lifecycle＋leaves 驗收紀錄（ACCEPTED,清零批）

- 日期：2026-08-28。派工單：`docs/arch-dispatch-2026-08-28-eslintR2-sheets-lifecycle-leaves.md`（d923cdc）。
- Codex 回報:`docs/arch-dispatch-2026-08-28-eslintR2-sheets-lifecycle-leaves-report-codex.md`。
- 結論：**ACCEPTED**。63 筆（R2-A 42＋R2-B 19＋R2-C 2）全清,selector 分兩波上線
  14 檔,scoped 陣列達 **28 檔=baseline 全 path 集合**(機械證明相等)。
  **`unbound-method` 全庫清零**——manifest 歸零,只剩收攏批。零 variance 偏差。

## 驗收證據鏈（驗收方親自複跑）

- porcelain 恰 16 條;`sheets.ts`＋`SessionDetailSheet.tsx` 零 diff 自證。
- generator `--check` exit 1、恰 65 條,與回報第 3 節**逐字全等**;63 筆按
  family 分組恰 42/19/2。
- 14 個前 finding 檔 ad-hoc canary 全 exit 0;scoped 陣列恰 28 檔、字典序,
  與 `baseline.findings` 的 path 集合**完全相等**（守門覆蓋不多不少）。
- erased-token ×14 對稱複跑全等;14 檔 `-U0` hunk（真實 20 個）全落列名
  宣告行,凍結行零觸及;`git diff --check` 乾淨。
- 收尾矩陣全綠:typecheck／lint／prettier／build／bundle（淨 0 B）／
  session-unit 346/346／mock 298＋4（**一次即綠**——本批動 sheets DOM 與
  unmount 面,是載重訊號）／local API 2/2＋browser 45/11／diff --check。

## 對立審查（opus,唯讀＋隔離副本,判定「無法否決」）

- 對點表 ×63 零失配（5 組同名異宣告全分列）;AST 實測恰 **47 個宣告點**
  MethodSignature→function property,**簽名保真 47/47 零偏差**（參數／回傳
  ／optional／type params 無收窄放寬）;凍結面全數未動（含
  `SurfaceShellHandle.unmount` 同名 shell 契約未被順手轉）。
- 防偽原文 21 個 code block 全對;四資產 SHA=HEAD。
- **守門四拍**（比派工單多一拍）:①暫退 SurfaceHost `:15`→九檔各 unmount
  行精確紅、sheets.ts 不紅;②Create `:112`→`:173:3`;③privateDataRepository
  `:105`→`:130:3`;④**審查加做:暫退 surfaceContracts `:46`→
  `sheets.ts:185:27` 精確紅**——補上派工單探針設計缺口（原三拍碰不到
  sheets.ts 的守門）,28 檔全部證明有牙。
- 兩 stage 快照集合驗證（A⊂B⊂F 前綴、42=react-callback 集合、61=63−leaves）。

## 記帳事項（5 nit,非退件）

- 回報 hunk header block 是併行摘要非原始 git 輸出（內容實質正確）。
- 回報把三拍暫退合併一次做（聯集歸因無歧義;審查已補三次獨立暫退全吻合）。
- sheets.ts 守門探針缺口為派工單設計問題,由審查第四拍補齊（後續批探針
  設計需覆蓋每個新上線 selector 檔至少一拍）。
- R2-B canary 零計數未逐 line:col(與 63 條快照互證,實質無虞)。
- surfaceContracts erased 兩側 0 bytes 是空對空(由 AST 與 REST 覆蓋)。

## ACCEPTED 原子動作（本 commit 完成）

ledger 追加 63 筆（batch `R2-A`×42／`R2-B`×19／`R2-C`×2,acceptanceDoc=
本檔）→ 重生 manifest（預期 **0／0**,全庫歸零）→ `--check` 綠 →
進度表 §4E 回填。

## 下批要件:收攏批（管線最終批;含對立審查實測補強）

Codex 五問第 5 問盤點+對立審查實測意見,合併如下:

1. **移除面**:刪 scoped 28-path 區塊＋刪全域
   `"@typescript-eslint/unbound-method": "off"` 行——審查已在隔離副本
   實測:移除後 `recommendedTypeChecked` 供給 error、六個代表檔
   `--print-config` 全 `[2]`、`npm run lint` exit 0 零命中（全庫轉 error
   不炸 baseline 外新檔,安全）;`manifest.scanGlobs` 與型別感知區塊
   `files` 完全相同,「ESLint 已掃同樣範圍」等價論成立。
2. **缺口一（強制,非選配）**:generator 是 overrideConfig 強制開規則掃描,
   退役後沒有東西能抓「off 被加回」——**config regression test 必須與
   移除同批交付**（斷言 `calculateConfigForFile` 對代表檔回 error）;
   本管線存在的原因就是這規則曾被關掉一次。
3. **缺口二（實測證實的破口）**:inline
   `eslint-disable-next-line @typescript-eslint/unbound-method` 可同時
   騙過 lint 與 generator（審查實測兩道閘門同放行）——收攏批須堵:
   規則區塊加 `linterOptions: { noInlineConfig: true }` 或新增禁止
   `src/**` 出現 `eslint-disable.*unbound-method` 的 grep gate。
4. **canary 設計**:全庫生效驗證的檔案列舉來源必須 `git ls-files`,
   **不可沿用 baseline 28 檔清單**（換湯不換藥）;守門三拍照常
   （存量綠→退化一筆驗紅→還原綠）。
5. **四資產處置**:baseline／ledger／manifest 凍結為歷史（G1 SHA pin、
   G2 acceptanceDoc 檢查隨 generator 退役）;generator 退役或轉常規
   gate 由收攏批派工單拍板,傾向退役＋以第 2 點 regression test 接棒。
