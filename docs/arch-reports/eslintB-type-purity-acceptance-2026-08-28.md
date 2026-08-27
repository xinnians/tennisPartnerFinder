# ESLint 恢復 Phase B 驗收紀錄（redundant constituents＋unnecessary assertion）

- 日期：2026-08-28。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-28-eslintB-type-purity.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-28-eslintB-type-purity-report-codex.md`。
- 母文件：`docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md` §4B／§5。
- 驗收方法：本機重跑完整 gate＋13 檔獨立擦除對帳＋canary ×3 親自複跑＋
  全開對照掃描＋唯讀對立審查 agent。

## 結論：**ACCEPTED**——type-aware 債 6 條→4 條 off

## 通過項（全部本機重驗）

1. **兩規則真恢復且有牙** [已驗證]：config 恰刪四行；canary ×2 親自複跑
   紅指名 rule ID→還原→綠。
2. **generated scoped override 精確且載重** [已驗證]：block 恰一檔一規則、
   後置勝出；親自暫刪 override→lint 恰曝 `databaseTypes.ts:1933`／`:1949`
   兩筆→還原綠；`databaseTypes.ts` 零 diff（sha256 對帳）、可重生性保留。
3. **17 筆零 runtime token** [已驗證]：13 檔獨立 esbuild 擦除比對 HEAD 逐
   byte 全等；chunk hash 不變、bundle 淨 0 B。union 收斂 7 筆（onProvider
   三處同形同步、authApi 只動 union 成員保留 Promise 外殼）、assertion 10
   筆（guard／expression 原樣；`sessionStore:101` syncCommit 訂閱未動；
   `notificationFeature:164` 等價 annotation 改寫）——對立審查逐筆 diff
   核對＋家族反掃（`Promise<unknown> | unknown` 全庫歸零）。
4. **全開對照掃描交叉驗證** [已驗證]：九條全開（含翻開 override）＝
   base-to-string 8／assignment 4／member-access 6／unbound-method 246
   不變＋redundant 恰 2（＝記帳債）——handwritten 零殘留一次證明。
5. **Gate 全綠一次過**：typecheck／lint／prettier／build／bundle／unit 346／
   mock 298/4／local 2/2＋45/11（無 reset）／`git diff --check`／tests・
   domainTypes・tsconfig・package 零 diff／`__importAppModule` 110。
6. **對立審查（唯讀）六角度全 PASS**：五項 sha256／計數全部吻合；
   App.tsx `await onProvider(...)` 對 `unknown` 回傳仍可 await（相容性
   核過）；authApi 簽名摺行為 Prettier printWidth 副作用非夾帶。

## 量化更新

- type-aware 債：6 條 off→**4 條 off**；findings 283→**266**（264 待修＋
  databaseTypes 2 筆記帳債）。
- bundle／unit／mock／`__importAppModule` 基準全部不變。

## Phase C 設計輸入（採納 Codex §11.5，站點經對立審查抽驗）

- 10 筆＝member 6（chatFeature 1／sessionController 2／sessionPresentation 3）
  ＋assignment 4（chatController 1／filters 2／sessionController 1）；根因
  皆為 collection／source port 失型（`Promise<unknown>` data port、
  `Array.isArray(readonly T[])` 坍縮）。
- 初判全部零-token 可修（typed local port＋collection type，沿 Phase A
  先例）；**若追 construction site 發現 `loadSessionMessages`／
  `loadSessionJoinPreview` 實作非經 typed mapper 而需 runtime element
  validator，拆行為批，不混入 Phase C**。
