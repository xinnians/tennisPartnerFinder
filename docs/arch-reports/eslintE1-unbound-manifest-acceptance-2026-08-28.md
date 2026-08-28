# ESLint 恢復 Phase E-1 驗收紀錄（unbound-method manifest 產出批）

- 日期：2026-08-28。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-28-eslintE1-unbound-manifest.md`；Codex
  回報：`docs/arch-dispatch-2026-08-28-eslintE1-unbound-manifest-report-codex.md`。
- 母文件：`docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md` §3／§4E。
- 驗收方法：本機重跑完整 gate＋親自複跑 generator determinism 與 `--check`
  三拍＋manifest 統計指令複算＋抽樣獨立核對＋唯讀對立審查 agent（opus，
  十項）。

## 結論：**ACCEPTED**——零修碼批，凍結面零 diff

## 通過項（全部本機重驗）

1. **凍結面自證** [已驗證]：`git status --porcelain -- src tests
   eslint.config.js tsconfig.json package.json package-lock.json` 為空；
   全庫 untracked 恰為 3 交付＋回報。`test:local` 豁免前提成立。
2. **Determinism** [已驗證]：本機重生兩份輸出 SHA-256 與回報逐字一致
   （JSON `102f7eff…`、MD `0b51127a…`）；canonical findings checksum
   `bab42fb9…8a959` 三處一致（兩輸出 header＋由 JSON 獨立重算）。
3. **`--check` 三拍** [已驗證]：綠→一 byte 改動紅（exit 1 指名檔案）→
   重生後綠且 SHA 復原。
4. **硬 gate 五數字** [已驗證]：246 findings／28 檔／duplicate stableId 0／
   unresolved declarations 0／`sessionController.ts` 63——本機輸出逐字；
   fail-closed 為 script 內建斷言（`validateHardGates` 累積 errors 後
   throw，`validateFindingSchema` 逐欄 20 欄），非只印數字（對立審查
   引原文核實）。
5. **統計複算** [已驗證]：15 個 family 筆數、thisUsage／proposedFixClass
   各 246、schema 零缺欄、node_modules declarationPath 0——指令複算與
   回報全部一致；§10.5 切批數字（79 按 consumer 檔 `4/6/11/11/12/13/22`、
   React 64＝app 22＋sheets 42、pages 15、七家族 `15/8/13/12/11/3/1`）
   對立審查由 JSON 逐一複算命中。
6. **抽樣核對**：我親核 #6（`:468` 三筆靠 `BindingElement[0/1/2]` 序號
   區分、stableId 唯一）與 #12（`map.ts:470` 兩筆 sentinel 吻合原文）；
   對立審查獨立重核 #8（`lifecycleActionsController.ts:230` 防偽引文
   逐字相符）與 #10（`sheets.ts:185`→`surfaceContracts.ts:45-47`），
   另抽 12 個不同檔的 declaration 全為無 body 的 MethodSignature——
   `ambient-no-body` 246 為誠實輸出，無「無 body 冒充不讀 this」反例。
7. **stableId 實作核實**（對立審查）：五段 `\0` 相接 sha256 前 16 bytes，
   line/column 不入 ID；sibling 用 `ts.forEachChild`（全檔零
   `getChildren`）；index 缺失 throw；`typeToString` 唯一呼叫點固定帶
   `NoTruncation`（`:468` receiverType 超 160 字元未截斷反證）。
8. **Gate 全綠一次過** [已驗證]：lint／prettier:check／typecheck／unit
   346（兩輪）／mock 298 passed 4 skipped／build／bundle（main gzip
   187,466、total 257,627，淨 0 B）／`git diff --check`——8 標記全 exit 0。
9. **新 script 過既有 lint 面**（對立審查實跑）：`npx --no-install
   eslint`／`prettier --check` 對 generator 皆綠；只用 node 內建與既有
   devDependencies。

## Ground truth 更正（母計畫 §3）

- `privateDataRepository.ts:135` 的 `Array.isArray` **不是**現行 finding
  [已驗證]：原文仍在、manifest 無此筆。機制（對立審查在
  `@typescript-eslint/eslint-plugin` `unbound-method.js:51-77` 找到）：
  `SUPPORTED_GLOBALS` 含 `Array`，經 `nativelyBoundMembers` 展開豁免
  built-in 靜態方法——是規則長期設計，非 lockfile 版本偶然。plan §3 該
  列為初判誤差；`built-in-static-callback` family 如實為 0。

## 記帳（不阻擋，Phase E 修復批需知）

1. **硬 gate 常數是寫死的 246/28/63**（`generate-eslint-unbound-manifest.mjs:16-18`）：
   任何修復批清掉 finding 後，generator 與 `--check` 都會 throw。**每個
   修復批的派工單必須明文列「同步更新三常數＋重生 manifest」為必要
   步驟**，否則 drift 檢查假紅。
2. 產出的 `.md` 非 prettier 格式：現行 `prettier:check` glob 不含
   `docs/**` 故無害；日後若把 docs 納入 prettier 會立刻讓 `--check`
   假紅，屆時需在 generator 內做 prettier-compatible render 或排除。
3. `classifyFamily` 的 `built-in-static-callback` 分支在現行規則下不可達
   （dead branch）；保留判則屬防禦性設計，記帳不動。
4. `structuralPath` 的 `if (!parent) break` 是靜默截斷路徑，與 index
   缺失的 throw 不對稱；本批 246 筆 astPath 全以 `SourceFile[0]/` 開頭
   未觸發。修復批若改 generator 可順手改成對稱 throw。

## Phase E 修復批設計輸入（採納 Codex §10.5，經對立審查複算）

- 切批序：callback defaults（2）→ controller callback ports（79，按
  consumer 檔 `4/6/11/11/12/13/22`）→ controller factory results（63，
  七家族）→ React/context contracts（app 22／sheets 42／pages 15）→
  method reference（1）＋surface lifecycle（19，共用
  `SurfaceContentLifecycle` 先驗實作）→ repository injection（1）＋API
  extraction（2）高風險殿後。
- 246 筆現階段全為 function-property contract 的 zero-runtime-token
  候選；每批仍必做 erased-token 全等，發現 concrete implementation 讀
  `this` 即移入行為批。
- 第一批建議：`map.ts:470` 兩筆（`SessionPinHandlers.onSession/onCluster`
  method signature 改 function property），最小、零 identity 變化，
  用以驗證後續 type-only 批的共用驗收模板；記得同步硬 gate 常數
  246→244、`map.ts` 檔數變動核實。
