# ESLint 恢復 Phase CL 收攏批派工單：全庫 error 定形＋policy gate 交付＋generator 退役（管線最終批）

- 日期：2026-08-28。前提=R2 ACCEPTED（`ad1fa38`,manifest 0/0,scoped 28 檔
  =baseline 全 path）。要件源自 R2 驗收紀錄「下批要件」
  （`docs/arch-reports/eslintR2-sheets-lifecycle-leaves-acceptance-2026-08-28.md`,
  Codex Q5 盤點＋對立審查隔離副本實測）。
- 開工基準：`ad1fa38` 之後包含本派工單的最新 main HEAD。開工前 porcelain 空。
- **本批形狀與清 findings 批完全不同**:不清 finding(已零),而是
  ①config 手術②新 policy gate 交付(強制,非選配)③generator 退役。
  無紅簽章交件制——交件=新形狀全綠＋**gate 有牙三拍逐字記錄**。
- 你不 commit、不 push。

## 改動一:`eslint.config.js` 手術（恰兩處）

1. `:84` `"@typescript-eslint/unbound-method": "off",` → 改為
   `"error",`（**明寫 error,不採「刪行繼承 preset」**——可稽核＋防
   `recommendedTypeChecked` 未來漂移;對立審查已在隔離副本實測兩種
   寫法等價、全庫 lint 綠零命中,安全）。
2. 刪除整個 Phase E scoped 區塊（`:97-133`:兩行註解＋28-path files
   陣列＋rules）。`databaseTypes` 的其他規則 override 區塊獨立存在,
   **不動**。

改後全檔恰一處出現 `@typescript-eslint/unbound-method`（error）。

## 改動二:新 policy gate `tests/eslint-unbound-policy.test.js`（強制交付）

動機:整條 12 批管線存在的原因是這條規則曾被整庫關掉一次;generator
退役後必須有東西抓住「off 被加回」與「inline disable 繞過」（對立
審查實測:inline `eslint-disable-next-line @typescript-eslint/unbound-method`
可同時騙過 lint 與 generator——兩道閘門同放行的既有破口）。

node:test 檔,**三個斷言＋一條註解語意**:

1. **config 原文斷言**:讀 `eslint.config.js` 原文,該規則名出現恰
   **一次**且值為 `"error"`;不得出現 `"off"` 綁定該規則。
2. **無 scoped override 斷言**:全檔無「files 陣列＋該規則」的 scoped
   區塊形狀（斷言 1 的出現次數=1 已涵蓋,此處以註解說明語意即可,
   不必獨立斷言——避免脆弱的結構 parse）。
3. **全庫生效斷言**:以 `git ls-files -- src vite.config.ts` 列舉後在
   JS 端以副檔名過濾 `.ts`/`.tsx`（**不可用 `git ls-files
   'src/**/*.ts'`**——git 預設 wildmatch 下該 pattern 會**靜默漏掉全部
   30 個 top-level `src/*.ts(x)`**,含 sheets.ts／sessionController.ts
   等,read-back 已實測 54 vs 84;也**不可沿用 baseline 28 檔清單**）,
   逐檔用 ESLint API `new ESLint({cwd}).calculateConfigForFile(path)`
   斷言該規則 severity=error（ESLint 10 實測回傳陣列 `[2]`,`.js` 檔
   回 `undefined`——正規化後比對,`.js` 不列舉）;**斷言列舉集恰
   ≥ 70 檔**（現量實測 **84**;掃描式測試必 assert 掃描集非空且有
   下限）。84 檔逐檔實測約 0.6 秒,效能無虞。
4. **inline-disable 禁令斷言**:掃 `git ls-files 'src/**' 'vite.config.ts'`
   （此 pattern 正確,與斷言 3 的寫法**不對稱**——`src/**` 是「src/ 後
   接任意」故含 top-level,實測 115 檔、無二進位大檔）的檔案內容,
   零命中 `/eslint-disable[\s\S]{0,200}?@typescript-eslint\/unbound-method/`
   （**必須有界跨行**:read-back 實測跨行 block
   `/* eslint-disable\n @typescript-eslint/unbound-method */` 可壓掉
   規則且單行 regex 零命中——正是本 gate 要堵的破口;**不可用無界
   `[\s\S]*?`**,會把整檔任意兩處誤連成命中）;同樣 assert 掃描集
   非空。（採 grep gate 而非 `noInlineConfig`——src 有 15 處其他規則
   的合法 inline disable,`noInlineConfig` 會全部打死。）

**接線**:`package.json` 的 `test:session-unit` 明列清單**追加**
`tests/eslint-unbound-policy.test.js`（加在清單尾端即可——既有
`tests/ci-config.test.js:108-117` 以 sorted deepEqual 強制清單須含
每個 top-level `tests/*.test.js`,漏加會被它抓紅,新檔落地後不加清單
反而過不了 gate）。效能已實測 ~0.6s,無需逃生門。

## 改動三:generator 退役

1. **退役前最後驗證**（留證於回報）:先跑
   `node scripts/generate-eslint-unbound-manifest.mjs --check` 最後
   一次,逐字抄錄綠輸出（0 findings/0 files,sha256 `4f53cda1…`）——
   這同時是 G2 對 ledger 246 條所指向的 **10 個相異 acceptanceDoc**
   存在性的最後查核（`--check` 內含）。
2. 刪除 `scripts/generate-eslint-unbound-manifest.mjs`（git rm;歷史
   由 git 保存）。已確認 package.json／CI workflow／tests 均無引用,
   開工時自驗一次反向 grep。
3. **四資產凍結為歷史,不刪不改**:`docs/arch-eslint-phaseE-baseline.json`
   ／`-removal-ledger.json`／`-unbound-manifest.json`／`-unbound-manifest.md`
   與全部 acceptance docs 保持零 diff。

## 硬驗收條件

**紀律**:canary/暫退前抄 SHA、精確還原、比 SHA、禁 `git checkout`。

1. **config diff 恰兩處**:`:84` 一行改值＋scoped 區塊整刪;
   `git diff eslint.config.js` 無其他 hunk。
2. **gate 有牙三拍 ×2（新 gate 上線必證明有牙,逐字記錄）**:
   - 拍組 A（off 回歸）:存量新測試綠→把 `error` 暫改回 `"off"`→
     新測試**紅**（斷言 1 或 3 失敗,抄錄失敗訊息）→精確還原→綠。
   - 拍組 B（inline disable 繞過）:任選一個 `src/**` 檔臨時插入
     `// eslint-disable-next-line @typescript-eslint/unbound-method`→
     新測試**紅**（斷言 4;此時 `npm run lint` 預期**仍 exit 0**、僅多
     一條 `Unused eslint-disable directive` warning——ESLint 10 預設
     行為,非異常,不必 BLOCKED）→精確移除→綠。**加做跨行形式**:
     插入 `/* eslint-disable\n   @typescript-eslint/unbound-method */`
     →斷言 4 亦須紅(證明有界跨行 regex 有牙)→移除→綠。
3. **全庫生效 canary**:
   - `npm run lint` 綠＋獨立零掃描:`npx eslint --rule
     '{"@typescript-eslint/unbound-method":"error"}'` 後接**展開的
     實際檔案參數**（斷言 3 同一列舉法,84 檔;不帶檔案參數會噴
     `could not find plugin` 而非空掃）→0 命中（列舉數入回報）。
   - **synthetic canary**:在**從未列入舊 28-path 清單**的目錄（如
     `src/features/` 下）臨時建一個含「interface method 被解構」模式
     的 `.ts` 檔→`npm run lint` 於精確 line:col 紅→刪除該檔→綠。
   - **真實暫退一拍**:暫退 `src/app/SurfaceHost.tsx:15` unmount 回
     method signature→lint 紅於九個 sheet 檔 unmount 行（R2 已證的
     紅點集合,抽錄至少三筆 line:col）→還原比 SHA→綠。
4. **四資產＋acceptance docs 零 diff**;`git status` 中 script 刪除以
   `D` 呈現。
5. **`--print-config` 抽驗**:`src/app/SurfaceHost.tsx`／`src/sheets.ts`
   ／`src/features/chat/chatFeature.ts`／`src/domainTypes.ts`／
   `vite.config.ts` 全 `[2]`;`src/main.js` 無該規則（非型別感知面,
   預期 undefined）。**路徑須先 `ls` 自驗存在**——`--print-config` 對
   不存在的路徑仍 exit 0 並印 config(幽靈檔假綠,read-back 實測)。
6. **無新增例外**:不加 `any`／`@ts-ignore`／inline disable／wrapper。

## 解凍清單（Q3 守則:未列即凍結）

- `eslint.config.js`:僅 `:84` 一行改值＋scoped 區塊整刪。
- `tests/eslint-unbound-policy.test.js`:新檔。
- `package.json`:僅 `test:session-unit` 清單追加一檔。
- `scripts/generate-eslint-unbound-manifest.mjs`:刪除。

**仍凍結**:四 docs 資產與全部 acceptance docs、`src/**` 全部（canary
臨時檔與暫退必須完整還原,終態零 diff）、`tests/**` 其餘、其他
scripts、`tsconfig.json`、`package-lock.json`、databaseTypes override、
bundle gate。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

- typecheck／lint／prettier:check（新測試檔須過 prettier）／build／
  check:production-bundle（淨 0 B——本批零 src 變更,必然）／
  **test:session-unit（346＋新測試檔的 case 數,回報實際總數與新檔
  case 明細）**／test:mock（≥298）／test:local（**本批零 src 變更,
  仍照單全跑**;基準=API 2＋browser 45/11）／`git diff --check`。
- gate 有牙三拍 ×2＋全庫 canary 三項＋print-config 抽驗逐字。
- porcelain 恰 **5 條**:`M eslint.config.js`／`M package.json`／
  `A(??) tests/eslint-unbound-policy.test.js`／
  `D scripts/generate-eslint-unbound-manifest.mjs`／`?? 回報`。

## 回報合約

寫 `docs/arch-dispatch-2026-08-28-eslintCL-closing-report-codex.md`
（不 commit、不 push）,必含:config diff 逐字、新測試檔全文（防偽）、
package.json diff 一行、generator 最後 `--check` 綠輸出逐字、有牙
三拍 ×2 逐字（含失敗訊息原文）、全庫 canary 三項逐字（synthetic 檔
內容＋紅點 line:col＋刪除自證;真實暫退紅點抽錄＋SHA 對）、
print-config 五檔＋main.js、收尾矩陣逐字、Codex 五問（第 5 問答
「unbound-method 管線終結後,`.claude/rules` 或 CLAUDE.md 是否需要
同步更新遷移期描述;以及 databaseTypes ledger 2 筆（§5 方案一）的
後續處置建議」）、未做／疑義／BLOCKED。

## 驗收方後續動作（記載供對照,非你的工作）

ACCEPTED 時驗收方原子完成:驗收紀錄落盤→進度表 §4E 回填（管線
**全案完結**）→一併 commit。無 ledger／manifest 動作（已凍結）。
