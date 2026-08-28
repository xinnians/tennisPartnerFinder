# ESLint 恢復 Phase R1-A/B React app＋pages 驗收紀錄（ACCEPTED）

- 日期：2026-08-28。派工單：`docs/arch-dispatch-2026-08-28-eslintR1-app-pages.md`（62ca002）。
- Codex 回報:`docs/arch-dispatch-2026-08-28-eslintR1-app-pages-report-codex.md`。
- 結論：**ACCEPTED**。37 筆（R1-A app 22＋R1-B pages 15）全清,五個 finding 檔
  selector 精確上線,scoped files 現為 14 檔。**零 variance 偏差**——
  `typecheckControllerApi` 橋直接通過,annotation 預授權未動用。

## 驗收證據鏈（驗收方親自複跑）

- porcelain 恰 5 條;`git diff --stat -- src/pages/` 空（三 pages 檔零 diff 自證,
  最高優先條件成立）。
- generator `--check` exit 1、恰 39 條,與回報第 4 節**逐字全等**;分組邊界機械
  確認（前 22=App 3＋ASP 19、後 15=pages 9/5/1）。
- 五檔 ad-hoc canary 全 exit 0;`--print-config` 五檔=`[2]`、FilterSheet／
  CreateSessionSheet（尚有 findings 的有牙反例）=`[0]`;config diff 恰五行,
  字典序位置正確（app 兩條最前、pages 三條在 map 後 sessionController 前）。
- erased-token ×3 對稱複跑（stdin esbuild,ts/tsx loader）全等;
  `controllerContracts.ts` 純型別檔擦除後 **0 bytes**（零 runtime token 最強形式）。
- 三檔 `git diff -U0` hunk 全落核可區間;凍結行（App `onSetFilter:41`、ASP
  `onAccept:116-119`／`onDecline:124-127` 等）無一觸及;`git diff --check` 乾淨。
- 收尾矩陣全綠:typecheck／lint／prettier:check／build／check:production-bundle
  （main 638937/187466、total 841561/257627,淨 0 B）／session-unit 346/346／
  mock 298＋4 skipped（一次即綠）／local API 2/2＋browser 45/11（未需 reset）／
  `git diff --check`。

## 對立審查（opus,唯讀＋隔離副本,判定「無法否決」）

- 對點表全驗 ×37 零失配;AST 實測恰 35 成員 MethodSignature→PropertySignature,
  凍結面 48 筆 method signature（contracts 42＋ASP 5＋App 1）全數未動。
- 守門三拍＋**加驗兩拍**:①全量載重——三宣告檔整檔還原 HEAD 後 lint 恰 37 筆,
  line:col 集合與 manifest 完全相同（35 筆轉換全部載重,selector 覆蓋不多不少）;
  ②R1-A 中間態重建——僅還原 ASP 後 generator 恰 24 條與回報逐字全等。
- **Variance 載重 A/B canary**:放寬 `openSession` 參數後,function property 形狀
  →`controllerApiContract.ts(18,3) TS2322`;method signature（HEAD）形狀→tsc
  靜默通過。證明本批把 bivariance 換成 contravariance 實檢,非空話。
- R2 切法數字全查（見下批要件）。

## 記帳事項（兩則 nit,非退件）

- **N-1 erased 口徑**:回報 erased 表需加 `--format=esm` 才逐字重現
  （`esbuild --loader=tsx --format=esm < file`）;兩種口徑 byteEqual 皆成立,
  非偽造。後續批回報 erased 表應寫全指令。
- **N-2**:controllerContracts 的餘檔論證未列 hunk 行號集合,由 REST byteEqual
  （對立審查實算重現）覆蓋。

## ACCEPTED 原子動作(本 commit 完成)

ledger 追加 37 筆（batch `R1-A`×22／`R1-B`×15,path=各 finding 檔,
acceptanceDoc=本檔）→ 重生 manifest（預期 findings **63**／files **14**）→
`--check` 綠 → 進度表 §4E 回填。

## 下批要件:R2 三 stage 聯合批 63 筆（數字經對立審查全查）

以 R1 acceptance 後 manifest 63/14 為基準:

- **R2-A sheet contracts 42**:10 個 sheet 自檔 props（Create 14／Decide 2／
  Edit 2／Filter 6／PlayerCard 6／PlayerDirectory 6／Profile 2／Report 1／
  SessionChat 2／Withdraw 1,42 筆全自檔宣告）;簽章=missing 42＋findings
  63→21＋files 14→12=**44 條**（清空 Report＋Withdraw 兩檔）;selector 暫不
  分散上線,與 R2-B 合併。
- **R2-B surface lifecycle 19**:`SurfaceHost.tsx:13-16` 兩宣告
  （`isSurfaceRootLive`／`unmount`）fan-out 9 sheet 檔×2=18;
  `surfaceContracts.ts:45-47` `LoginModalContentHandle.unmount`→
  `sheets.ts:185:27` 1 筆;累計=missing 61＋findings 63→2＋files 14→2=
  **63 條**;完成後 **一次上線 12 檔**（sheets.ts＋10 contract sheets＋
  SessionDetail——SessionDetail 只有 lifecycle 2、無 contract finding）。
- **R2-C 零星 2**:`mySessionsCreatedFocus.ts:7 onCreatedSessionFocus`
  （method-reference）＋`privateDataRepository.ts:105 loadCourts`
  （injected-repository-callback）;累計=missing 63＋findings 63→0＋files
  14→0=**65 條**;兩自檔清零後各自上線。
- **R1 模板不可沿用處**:R2-A 宣告與 finding 同檔且同檔共存另一 family
  （8 檔在 R2-A 後各仍有 lifecycle 2,不可提前上 selector）;R2-B 是集中
  宣告 fan-out 19,canary 以 finding 檔驗;`SurfaceContentLifecycle` 被
  `SurfaceContentHandle` extends,typecheck 載重;R2-C 兩 leaf 分屬不同
  runtime 邊界,canary 與測試不可合併假設;風險面=sheets DOM、React
  unmount、session-data-boundary 三種,測試矩陣照常全跑。
- R2 全清後=**收攏批**:移除全域 off 與 scoped 區塊(全庫 error)、裁決
  generator/manifest/ledger 轉常規 gate 或退役。
