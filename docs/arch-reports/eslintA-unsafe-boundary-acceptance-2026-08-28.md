# ESLint 恢復 Phase A 驗收紀錄（unsafe argument／call／return）

- 日期：2026-08-28。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-28-eslintA-unsafe-boundary.md`；Codex
  回報：`docs/arch-dispatch-2026-08-28-eslintA-unsafe-boundary-report-codex.md`。
- 母文件：`docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md` §4A。
- 驗收方法：本機重跑完整 gate＋四檔獨立擦除對帳＋規則 canary ×3 親自複跑＋
  六條 debt 對照親自重掃＋唯讀對立審查 agent。

## 結論：**ACCEPTED**——九條 type-aware 債首三條清零

## 通過項（全部本機重驗）

1. **三規則真恢復且有牙** [已驗證]：config 恰刪六行（0 insertions，對立
   審查證），三規則回 `recommendedTypeChecked` error；驗收方親自 canary
   ×3——每條最小違例→lint 紅精準指名 rule ID→byte-identical 還原→綠。
2. **15 筆全數從來源修，零 runtime token** [已驗證]：四檔獨立 esbuild
   擦除比對 HEAD 逐 byte 全等；chunk hash 不變、bundle 淨 0 B；
   `notificationFeature.ts` 三筆由 `config.ts` 根因（`AppImportMetaEnv`
   五 key 收斂 index signature）修掉，該檔零 diff——比派工單「僅補
   `: string`」更徹底且仍純型別（Codex 回報疑義處置正確）。
3. **cast 誠實** [已驗證]（對立審查逐一查型別集合）：九個 erasable cast
   全部是「復原 `Array.isArray(readonly T[])`（lib.es5 `arg is any[]`）
   坍縮掉的既有宣告型別」；`as string[]`／`as CourtInput[]` 經
   `filter(Boolean)` 值域分析證明符合實況，非型別謊言，比原 `any` 更精確。
   `dataRepository:83` 三元容忍、`sheets:80` typeof 守衛原樣。
4. **六條 debt 漂移親自重掃逐數吻合** [已驗證]：member-access 25→**6**、
   assignment 12→**4**（env 來源＋typed collection 的正當副作用；現存
   findings 所在檔零 diff）；redundant 9／assertion 10／base-to-string 8／
   unbound-method 246 不變——關閉對立審查唯一 [不確定]。
5. **Gate 全綠**：typecheck／lint（真 config）／prettier／build／bundle／
   unit 346／mock 298/4／local 2/2＋45/11／`git diff --check`／tests 零
   diff／`__importAppModule` 110。
6. **對立審查（唯讀）六角度 PASS**；其觀察到的 config.ts 暫態殘留即驗收方
   平行 canary 的正常痕跡（數秒後自證還原）。

## 事件紀錄

- mock 單次紅＝已知存量 flake `chat-settings-filters-smoke:468`
  （task_d6de363e）：`--repeat-each=5` 取樣 1/5 紅與存量紅率一致，全套
  重跑 298 綠——與本批無關（純型別＋config）[已驗證]。
- test:local 紅→DB 272 筆（同型既往 272／270／253 事件）→guarded reset→
  0 筆→全綠三拍 [已驗證]。

## 量化更新

- type-aware 債：9 條 off→**6 條 off**；findings 325→**283**
  （15 修復＋27 連帶消除）。
- bundle／unit／mock／`__importAppModule` 基準全部不變。

## Phase B 設計輸入（採納 Codex §10.5）

- `databaseTypes.ts` 採 plan §5 方案一（generated scoped override），其
  redundant findings 明確留在 manifest；generator 後處理待 deterministic
  證明另批升級。
- assertion 移除逐檔 esbuild raw 全等硬 gate；emitter 括號差異先調整寫法，
  不全等停手裁決；需 runtime guard 者拆行為批。
