# ESLint 恢復 Phase D 驗收紀錄（no-base-to-string 證明制零行為路線）

- 日期：2026-08-28。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-28-eslintD-base-to-string.md`；Codex
  回報：`docs/arch-dispatch-2026-08-28-eslintD-base-to-string-report-codex.md`。
- 母文件：`docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md` §4D。
- 驗收方法：本機重跑完整 gate＋4 檔獨立擦除對帳＋canary 親自複跑＋全開
  對照掃描＋唯讀對立審查 agent（六角度）。

## 結論：**ACCEPTED**——僅剩 `unbound-method` 一條 off

## 通過項（全部本機重驗）

1. **規則真恢復且有牙** [已驗證]：config 恰刪兩行（規則名定位）；canary
   `String({})` 親自複跑紅指名→還原綠（read-back 預改的樣例一次觸發）。
2. **8 站零 runtime token** [已驗證]：4 檔獨立 esbuild 擦除比對逐 byte
   全等（含 `as … satisfies …` 的擦除實證）；bundle 淨 0 B；`String`／
   `?? ""`／`.trim`／regex／`|| "球"`／throw 逐 token 原樣。
3. **construction-site 證明完整** [已驗證]（對立審查 4 站全庫 grep 抽驗
   零漏 caller）：nick／court 經 `asText`／`asNumber` runtime 守衛；reason
   非空檢查後唯一觸發鏈；datetime 全 caller 為 form／input string；avatar
   的 object 理論路徑由 regex fail-closed 兜底——8 站皆無 object
   construction site，證明制成立、零 BLOCKED。
4. **規則交互處置正確**：`:22` 的 `as string | number` 被 Phase B 已恢復
   的 `no-unnecessary-type-assertion` 反咬（`String()` 收 unknown），
   `satisfies` 疊加解法純擦除、全庫唯一一處，記錄清楚。
5. **全開對照掃描** [已驗證]：恰餘 `unbound-method` 246＋ledger 2，
   base-to-string 零殘留。
6. **Gate 全綠一次過**：typecheck／lint／prettier／build／bundle／unit 346
   ／mock 298/4／local 2/2＋45/11（無 reset）／`git diff --check`／凍結面
   零 diff／`__importAppModule` 110。

## 裁決記帳（cast 寬窄，不退件）

對立審查指出 3/8 站（`sessionPresentation:86`／`:91`、`taipeiTime:73`）
cast 含回報 §4 未逐一舉證的 `null`／`undefined` 成員。裁決 ACCEPTED，
理由：
- 方向安全——「比證明寬（朝 tolerance）」而非「比實況窄（掩蓋 object）」；
- 多出的成員恰是緊鄰 `?? ""` runtime token 所處理的集合：cast 寫入它們
  使既有 nullish 處理在型別層保持活性；反向寫死（如 reason 站的
  `as string`）會讓 `?? ""` 成型別死碼——兩種風格各有依據，本批混用是
  一致性瑕疵非誠實度缺陷，不值一輪返工；
- Phase E 之後若做 cast 風格統一批，以「nullish 成員＝該表達式 nullish
  運算子實際處理的集合」為準則。

## 量化更新

- type-aware 債：2 條 off→**1 條 off**（`unbound-method`）；findings
  256→**248**（246 待修＋2 記帳）。
- bundle／unit／mock／`__importAppModule` 基準全部不變。

## Phase E 設計輸入（採納 Codex §10.5；七家族行號與零-this 掃描經對立
審查獨立重跑）

- 先做**manifest 產出批**（不改 lint、不修碼）：
  `scripts/generate-eslint-unbound-manifest.mjs`（ESLint API 記憶體
  override＋TS TypeChecker）；deterministic 輸出
  `docs/arch-eslint-phaseE-unbound-manifest.json`＋render 的 `.md`（無
  timestamp、固定排序、LF）；`--check`＝重產 byte 比對；硬 gate＝246 筆／
  28 檔／dup 0／unresolved 0／sessionController 63＋canonical SHA-256。
- `sessionController.ts` 63 筆＝七個 factory-return destructuring 家族，
  七個 controller 檔字面零 `this`（高信心 this-free 初判；TypeChecker
  逐筆確認仍必做——字面掃描抓不到轉發匯入的 receiver 依賴）。
- 修復批候選＝宣告加 `this: void` 或 contract 改 function property，兩條
  零 runtime 路線比較後擇一；需 arrow／bind／identity 變更者另立行為批。
