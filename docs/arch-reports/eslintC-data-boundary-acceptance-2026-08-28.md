# ESLint 恢復 Phase C 驗收紀錄（unsafe assignment＋member-access）

- 日期：2026-08-28。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-28-eslintC-data-boundary.md`；Codex
  回報：`docs/arch-dispatch-2026-08-28-eslintC-data-boundary-report-codex.md`。
- 母文件：`docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md` §4C。
- 驗收方法：本機重跑完整 gate＋5 檔獨立擦除對帳＋canary ×2 親自複跑＋
  全開對照掃描＋唯讀對立審查 agent。

## 結論：**ACCEPTED**——type-aware 債剩 2 條 off（base-to-string／unbound-method）

## 通過項（全部本機重驗）

1. **兩規則真恢復且有牙** [已驗證]：config 恰刪四行零 insertions；canary
   ×2 親自複跑紅指名 rule ID→還原綠。
2. **10 筆零 runtime token** [已驗證]：5 檔獨立 esbuild 擦除比對 HEAD 逐
   byte 全等；diff 恰 8 行全型別層（2 `import type`＋2 port 宣告＋4
   collection cast；`sessionPresentation:687` 單一 cast 正確覆蓋下游三筆
   member-access）；bundle 淨 0 B。
3. **port 收斂=補回既有 mapper contract** [已驗證]：型別鏈
   （privateDataRepository→sessionMappers→domainTypes:77/:100）對立審查
   逐行復核；呼叫點 `typeof`／`Array.isArray` 容忍逐 token 原樣。
4. **全開對照掃描** [已驗證]：base-to-string 8＋ledger 2＋unbound-method
   246，兩條新恢復規則零殘留——handwritten 債單次掃描全對帳。
5. **Gate 全綠一次過**：typecheck／lint／prettier／build／bundle／unit 346
   ／mock 298/4／local 2/2＋45/11（無 reset）／`git diff --check`／tests・
   src/data・domainTypes・tsconfig・package 零 diff／`__importAppModule`
   110。
6. **對立審查（唯讀）六角度全 PASS**（canary 基準 hash、246/28 分布
   checksum 以指令加總等全部吻合）。

## 回報勘誤（驗收紀錄更正，不退件）

- 回報 §4「private repository 的 mock／configured 兩支都經具名 mapper」對
  `loadSessionMessages` 不實：其 `!configured` 分支
  （`privateDataRepository.ts:252`）直接回傳 `[]`，未經 mapper（
  `loadSessionJoinPreview` 才是兩支皆經 mapper）。空陣列可安全指派給
  `ChatMessage[]`，型別健全性結論不變；屬對稱性措辭誇大，記錄之。

## 量化更新

- type-aware 債：4 條 off→**2 條 off**；findings 266→**256**（254 待修＝
  base-to-string 8＋unbound-method 246，＋databaseTypes 2 記帳）。
- bundle／unit／mock／`__importAppModule` 基準全部不變。

## Phase D／E 設計輸入（採納 Codex §10.5，站點經對立審查逐筆查證）

- **Phase D（base-to-string 8 筆／4 檔）逐筆政策表已備**：zero-token 候選
  ＝`profile.ts:43` court.id/.name（先證 catalogue 全經 `mapCourt`）、
  `sessionController:738` reason（DOM radio value 收窄）、`taipeiTime:73`
  （caller manifest 先證全為 input.value 字串）；**runtime 裁決**＝
  `profile.ts:22/:35`（刻意 unknown validator／nickname gate，需 object
  case 測試與 fallback 明定）、`sessionPresentation:86/:91`（avatar URL／
  nickname initial 文案 fallback）。先產 8 筆 construction-site 表再拆
  zero-token 小批與 behavior 小批。
- **Phase E（unbound-method 246／28）**：先產 machine-readable manifest
  （stable ID＝rule+path+AST kind+fingerprint；欄位含 receiver type／是否
  讀 `this`／construction sites／callback identity；246/28 checksum 硬
  gate），依 contract family 五分法分群；先以 `sessionController.ts` 63 筆
  建準則＋三家族對立抽驗再擴全檔;manifest 階段不改碼。
