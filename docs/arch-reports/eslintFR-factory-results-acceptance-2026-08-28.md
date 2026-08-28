# ESLint 恢復 Phase FR-A/B/C factory results 驗收紀錄（ACCEPTED）

- 日期：2026-08-28。派工單：`docs/arch-dispatch-2026-08-28-eslintFR-factory-results.md`（3b32588）。
- Codex 回報:`docs/arch-dispatch-2026-08-28-eslintFR-factory-results-report-codex.md`。
- 結論：**ACCEPTED**。63 筆 factory-result findings（FR-A 23＋FR-B 25＋FR-C 15）全清,
  `src/sessionController.ts` selector 精確上線,scoped files 現為 9 檔。

## 驗收證據鏈（驗收方親自複跑）

- porcelain 恰 9 條（解凍 8 檔＋回報）;`git diff --stat -- src/sessionController.ts` 空
  （零 diff 自證,最高優先條件成立）。
- generator `--check` exit 1、恰 66 條 `- `,與回報第 4 節**逐字全等**（diff 零差異）;
  第 66 條 `sessionController findings expected 63, received 0` 如派工單預告。
- ad-hoc canary `npx eslint --rule '{"@typescript-eslint/unbound-method":"error"}'
  src/sessionController.ts` exit 0（63→0 終態）。
- `--print-config`:`src/sessionController.ts`=`[2]`、`src/sheets.ts`／`src/app/App.tsx`=`[0]`;
  `eslint.config.js` diff 恰一行,插入 scoped files 陣列末端（`src/map.ts` 之後）。
- erased-token ×7:驗收方以對稱口徑（兩側均 stdin 餵 `esbuild --loader=ts`,HEAD vs
  working）複跑,**七檔全等**——含唯一偏差檔 discoveryMap。註:非對稱口徑（一側在
  repo 內、一側在外）會因 esbuild 自動套 tsconfig 產生 `"use strict";` 假差異,複驗必須
  兩側同口徑。
- 七檔 `git diff -U0` hunk 全落結果契約區間＋`:135`;Dependencies interfaces 零 diff;
  `git diff --check` 乾淨;`sessionController.ts:68` `ReturnType<ReturnType<typeof
  createMySessionsController>["actionFor"]>` 原文在、typecheck 綠。
- 收尾矩陣全綠（逐項驗 exit code,不接 pipe）:typecheck／lint／prettier:check／build／
  check:production-bundle（main 638937/187466、total JS 841561/257627,淨 0 B）／
  test:session-unit 346/346／test:mock 298 passed＋4 skipped／test:local API 2/2＋
  browser 45 passed＋11 skipped（未需 reset）／`git diff --check`。
- 63 筆 stableId 分組邊界機械確認:紅簽章第 23/24/48/49/63 位分別為
  `dd4bba1a…`（playerDirectory 尾）／`2d84d1e8…`（discoveryMap 首）／`fa6d600b…`
  （intent 尾）／`10d5f363…`（lifecycle 首）／`b5443c26…`（chat）,與對點表一致。

## 對立審查（opus,唯讀,判定「無法否決」）

七攻擊面全 PASS,抽驗超規格:對點表做滿 63 筆（非抽 10）、防偽原文做滿 7 檔;
成員涵蓋 AST 實測 15+8+13+12+11+3+1=63,HEAD 63 MethodSignature→working 0,
凍結面空集合成立。另加做**隔離副本守門有牙三拍**（scratchpad 複製,不碰 repo）:
存量綠→退 `actionFor` 精確紅 `314:5`→退 auth＋chat 精確紅 `468:11`／`613:11`→
還原後綠且七檔 SHA 與 repo 全等。FR-C 還原 SHA 兩枚（lifecycle `3be13d91…`、auth
`72d88455…`）實算全中。React 79 拆批數字亦經其全查驗證（見下批要件）。

## 偏差記載（唯一,user 中途核可）

`src/controller/discoveryMapController.ts:135`:`async function loadDiscovery(bounds =
read().bounds)` → 加 `: MapBounds | null` 註記。成因=method→function property 後
strictFunctionTypes 逆變,state `bounds: MapBounds` 推斷過窄,而 HEAD 契約本就宣告
`bounds?: MapBounds | null`（審查確認 Codex 未放寬契約）。annotation-only,erased
全等機械證明零 runtime 變更;`validBounds` null 回退 Taipei bounds 行為不變。
`playerDirectoryController.ts:146` 同型檢查:契約不含 `null`,無連鎖。

## ACCEPTED 原子動作（本 commit 完成）

ledger 追加 63 筆（batch `FR-A`×23／`FR-B`×25／`FR-C`×15,path 全為
`src/sessionController.ts`,acceptanceDoc=本檔）→ 重生 manifest（預期
findings 100／files 19／sessionController 0）→ `--check` 綠 → 進度表 §4E 回填。

## 下批要件:React contracts 79 三批（數字經對立審查全查）

以本批 acceptance 後 manifest 100/19 為基準,累計紅簽章:

- **React-A app 22**:`App.tsx` 3（2 parameter-destructure＋1 passed-as-callback）＋
  `AppServicesProvider.tsx` 19（全 option-property,契約在 `controllerContracts.ts`
  `ControllerApi`）;簽章=missing 22＋findings 100→78＋files 19→17=**24 條**;兩檔
  全清才上線 selector。
- **React-B sheets 42**:10 個 sheet 各自 props 宣告,全 parameter-destructure
  （Create 14／Decide 2／Edit 2／Filter 6／PlayerCard 6／PlayerDirectory 6／Profile 2
  ／Report 1／SessionChat 2／Withdraw 1）;累計=missing 64＋findings 100→36＋files
  19→15=**66 條**;selector 只可上 `ReportDialog`／`WithdrawDialog`——其餘 8 檔各仍有
  surface-lifecycle 2 筆,不可因本族清零整批開。
- **React-C pages 15**:Me 9／MySessions 5／Nearby 1（10 destructured-function＋
  4 option-property＋1 passed-as-callback,宣告在 `AppServicesProvider`）;累計=
  missing 79＋findings 100→21＋files 19→12=**81 條**。
- **controller 模板不可沿用處**:declaration owner 與 finding file 常不同（canary 以
  finding files 為準,非宣告檔）;`ControllerApi` 與 context interfaces 含非目標成員,
  **不可整個 interface 全轉**（與 FR 批「凍結面空集合」相反,回到 E-9 式凍結陷阱）;
  sheet 同檔共存 surface-lifecycle family;無單一零 diff 自證檔;React props/context
  variance 可能再揭型別衝突（比照本批 :135 先例裁決）;lazy surface runtime 測試列
  核心 gate。
