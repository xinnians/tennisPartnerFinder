# ESLint 恢復 Phase E-3：manifest ledger 機械化批回報（Codex）

- 日期：2026-08-28
- 開工 HEAD：`9c98d67`（其 parent `abd0cf1` 為 E-2 ACCEPTED）
- 結論：完成；未 commit、未 push、無 BLOCKED。
- 性質：純工具批。最終 `src/**`、`tests/**`、`eslint.config.js`、`tsconfig.json`、
  package/lockfile 與兩份既有 manifest 均零 diff。

## 1. 交付內容

1. 新增 `docs/arch-eslint-phaseE-baseline.json`：固化 E-1 的 246 筆
   `{stableId,path}` 有序基準。
2. 新增 `docs/arch-eslint-phaseE-removal-ledger.json`：初始只列 E-2 已接受的
   `src/map.ts` 兩筆 removal。
3. 改造 `scripts/generate-eslint-unbound-manifest.mjs`：移除 244／27／63 三個手調常數，
   改由 baseline − ledger 推導預期集合及三個計數；保留既有 schema、duplicate、
   unresolved、render、checksum、`--check` 與 gate 回傳形狀。
4. 加入 cleared／uncleared file 的 effective-config 雙向 assert；effective config 使用
   一顆獨立、無 `overrideConfig` 的 `new ESLint()`。

交付檔 SHA-256：

```text
14e56a1675ccf4939f2e0bc3e2685070b325a32a75ef778ea1ffa45b018fd207  docs/arch-eslint-phaseE-baseline.json
2fd1093815fa3fd302a3b82bc0d498c910e11f325814f7597e626e334d40bca6  docs/arch-eslint-phaseE-removal-ledger.json
f4969ed40da259fc2ad4be7a0362d86db8b39edd1e6a93db9642598e6109afa2  scripts/generate-eslint-unbound-manifest.mjs
```

## 2. baseline 提取與筆數自證

資料來源固定為：

```sh
git show 77365a0:docs/arch-eslint-phaseE-unbound-manifest.json
```

實際用下列讀法重新投影並逐序比較，沒有按現況重掃或重新排序：

```sh
node - <<'NODE'
const fs = require('node:fs');
const cp = require('node:child_process');
const source = JSON.parse(cp.execFileSync(
  'git',
  ['show', '77365a0:docs/arch-eslint-phaseE-unbound-manifest.json'],
  { encoding: 'utf8' }
));
const baseline = JSON.parse(
  fs.readFileSync('docs/arch-eslint-phaseE-baseline.json', 'utf8')
);
const projected = source.findings.map(({ stableId, path }) => ({ stableId, path }));
console.log(JSON.stringify(projected) === JSON.stringify(baseline.findings));
NODE
```

筆數與有序投影輸出逐字：

```text
source=77365a0
source findings=246; files=28; sessionController=63
baseline findingCount=246; rows=246
exact ordered {stableId,path} projection=true
```

baseline header 為 `schemaVersion: 1`、`sourceCommit: "77365a0"`、
`findingCount: 246`；findings 原陣列順序完整保留。generator 對 root 與 row 逐欄做
exact-key schema 驗證，並拒絕壞 JSON、讀檔失敗、壞 stable ID、重複 stable ID、
findingCount 不符、絕對／非正規相對 path 與 ledger path 不符，均 fail closed。

## 3. 集合推導與 scoped assert

令 `B` 為 baseline stable ID 集合、`L` 為 accepted-removal ledger、`A` 為目前強制
掃描所得集合：

```text
E = B − L
hard gate: A = E
```

先驗 `L ⊆ B` 且 `L` 內 stable ID 不重複，再做兩方向逐筆比對。兩個主要錯誤訊息
格式固定為：

```text
unexpected current finding outside baseline-minus-ledger: <stableId> (<path>)
expected finding missing from current scan: <stableId> (<path>)
```

若 stable ID 相同但 path 漂移，另以 `current finding path mismatch ...` 指名。findings、
files、sessionController 三數字都從 `E` 推導；本批為 `246 − 2 = 244` findings、
`src/map.ts` 全清後 27 files、sessionController 仍 63。

scope gate 取 baseline 的 28 個 path，對每一檔用獨立的 `new ESLint()` 呼叫
`calculateConfigForFile`；不重用帶 memory override 的掃描 instance。severity 接受
`[2]`、`2`、`"error"`，其餘正規化為 warn/off。判定為：

- baseline 有而 current scan 為 0 的 cleared file，effective rule 必須是 error；
- current scan 仍有 finding 的 uncleared file，effective rule 不得提前是 error。

現況恰為 `src/map.ts` cleared 且 error，另外 27 檔 uncleared 且未提前上線。

## 4. 三組 canary：紅 → 精確還原 SHA → 綠

所有暫改皆先記 SHA，以 `apply_patch` 做精確反向編輯；沒有使用 `git checkout`。

### 4.1 ledger 少列

暫移除 `761154dcdb4d5bda67d077b9bf89e588` 後，指令 exit 1，錯誤逐字：

```text
Error: manifest hard gate failed:
- expected finding missing from current scan: 761154dcdb4d5bda67d077b9bf89e588 (src/map.ts)
- findings expected 245, received 244
- files expected 28, received 27
```

精確還原後：

```text
2fd1093815fa3fd302a3b82bc0d498c910e11f325814f7597e626e334d40bca6  docs/arch-eslint-phaseE-removal-ledger.json
eslint unbound manifest check passed: 244 findings/27 files; sessionController 63; duplicates 0; unresolved declarations 0; sha256:ce5a3e8a82e75dca710449d1c2d9c549448831573891cf6ffec230e380ccdd30
```

### 4.2 ledger 偽造 ID

暫加入格式合法但不存在於 baseline 的全零 stable ID 後，指令 exit 1，錯誤逐字：

```text
Error: removal ledger stableId 00000000000000000000000000000000 is not in baseline (src/map.ts)
```

精確還原後：

```text
2fd1093815fa3fd302a3b82bc0d498c910e11f325814f7597e626e334d40bca6  docs/arch-eslint-phaseE-removal-ledger.json
eslint unbound manifest check passed: 244 findings/27 files; sessionController 63; duplicates 0; unresolved declarations 0; sha256:ce5a3e8a82e75dca710449d1c2d9c549448831573891cf6ffec230e380ccdd30
```

此 canary 在建立 TypeScript program／執行 ESLint scan 前即由 `L ⊆ B` gate 擋下。

### 4.3 cleared file 未 scoped 上線

暫把 `eslint.config.js` 的精確 selector 從 `src/map.ts` 改成
`src/map.canary.ts` 後，指令 exit 1，錯誤逐字：

```text
Error: scoped unbound-method gate failed:
- cleared file is not scoped to error: src/map.ts (effective severity: off)
```

精確還原後：

```text
64d556154f7cde0625c73c01d9d50d40b72981526d01bda9387a7b39eb2ce874  eslint.config.js
eslint unbound manifest check passed: 244 findings/27 files; sessionController 63; duplicates 0; unresolved declarations 0; sha256:ce5a3e8a82e75dca710449d1c2d9c549448831573891cf6ffec230e380ccdd30
```

## 5. manifest byte identity 與成功行

兩次真實生成、兩次工作樹 SHA、再由 `git show HEAD:...` 算 HEAD SHA；三份一致：

```text
# generation 1
e2099713807801adcf0705dc71fb47cc52e99d769cfbb3b1c8036c8d05f10604  docs/arch-eslint-phaseE-unbound-manifest.json
5019bda46756fa6eb0825bcae7808080a2a7c0a45655143d5f2fcaa36918d005  docs/arch-eslint-phaseE-unbound-manifest.md

# generation 2
e2099713807801adcf0705dc71fb47cc52e99d769cfbb3b1c8036c8d05f10604  docs/arch-eslint-phaseE-unbound-manifest.json
5019bda46756fa6eb0825bcae7808080a2a7c0a45655143d5f2fcaa36918d005  docs/arch-eslint-phaseE-unbound-manifest.md

# HEAD
e2099713807801adcf0705dc71fb47cc52e99d769cfbb3b1c8036c8d05f10604  docs/arch-eslint-phaseE-unbound-manifest.json
5019bda46756fa6eb0825bcae7808080a2a7c0a45655143d5f2fcaa36918d005  docs/arch-eslint-phaseE-unbound-manifest.md
```

生成成功行逐字（兩次相同）：

```text
eslint unbound manifest generated: 244 findings/27 files; sessionController 63; duplicates 0; unresolved declarations 0; sha256:ce5a3e8a82e75dca710449d1c2d9c549448831573891cf6ffec230e380ccdd30
```

最終 `--check` 成功行逐字：

```text
eslint unbound manifest check passed: 244 findings/27 files; sessionController 63; duplicates 0; unresolved declarations 0; sha256:ce5a3e8a82e75dca710449d1c2d9c549448831573891cf6ffec230e380ccdd30
```

`findingsChecksum` 為 canonical findings checksum；上方 SHA-256 則是完整輸出檔 SHA，
兩者用途不同且演算法都未改。

## 6. 收尾矩陣

| Gate | 結果 |
| --- | --- |
| frozen status | 無輸出，exit 0 |
| generator generation ×2 | 兩次 244／27／63，兩檔各自與 HEAD byte-identical |
| generator `--check` | exit 0；成功行見 §5 |
| canary ×3 | 三組皆預期 exit 1、精確還原 SHA、再 exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run prettier:check` | `All matched files use Prettier code style!`，exit 0 |
| `npm run test:session-unit` | tests 346；pass 346；fail 0；exit 0 |
| `npm run test:mock` | 298 passed；4 skipped；exit 0 |
| `npm run build` | 508 modules transformed；exit 0 |
| `npm run check:production-bundle` | main `638937/187466`；total JS `841561/257627`；exit 0 |
| bundle 對照 | main gzip `187466 − 187466 = 0 B`；total gzip `257627 − 257627 = 0 B` |
| `git diff --check` | 無輸出，exit 0 |
| `test:local` | 依派工單豁免；前提 frozen status 零 diff 已成立 |

`prettier:check` 的既有 glob 不含 `docs/**`；兩個新 JSON 由 generator 的 exact-key／
逐欄 schema gate 實際讀入驗證，未為了格式檢查擴改 package script 或 generator 語意。

unit 與 mock 前置 unit 都出現既有、非致命的
`WebSocket server error: Port 24678 is already in use`；最終 346/346、mock 298/4 與
兩個程序 exit 0，沒有 retry。build 只有既有 >500 kB chunk warning。

production bundle gate 成功行逐字：

```text
production bundle check passed: development E2E hook present, production E2E hook absent; 32 files, 12 demo identifiers absent; main 638937/187466 within 658867/192420; largest app lazy MySessionsPage-Byp_C9FO.js 16476/4828 within 18000/5500; total JS 841561/257627 within 849961/259062; private repository: privateDataRepository-CfJqlfj0.js; Sentry: sentryBrowserSdk-Czz5dmkg.js
```

最終 frozen status 指令：

```sh
git status --porcelain -- src tests eslint.config.js tsconfig.json package.json package-lock.json docs/arch-eslint-phaseE-unbound-manifest.json docs/arch-eslint-phaseE-unbound-manifest.md
```

輸出為空、exit 0。全庫 porcelain 逐字，恰為解凍三檔加本回報共四條：

```text
 M scripts/generate-eslint-unbound-manifest.mjs
?? docs/arch-dispatch-2026-08-28-eslintE3-manifest-ledger-report-codex.md
?? docs/arch-eslint-phaseE-baseline.json
?? docs/arch-eslint-phaseE-removal-ledger.json
```

## 7. Codex 五問

### 1. 如何證明 baseline 沒有隨 current scan 移動球門？

baseline 唯一來源是 Git object `77365a0` 中的 E-1 ACCEPTED manifest，不是當前 lint
結果；246 筆 `{stableId,path}` 直接沿用原陣列順序。重抽投影與新 baseline 逐序相等，
並獨立複算 246／28／63。後續 expected 只允許以 accepted-removal ledger 從這份固定集合
扣除，不提供重算 baseline 的 code path。

### 2. 如何證明不是只把 244／27／63 換一種方式手調？

數字只是集合推導後的摘要。hard gate 同時逐筆要求 current ⊆ expected 與
expected ⊆ current；多一筆、少一筆、以另一筆替換或同 stable ID 換 path 都會指名。
ledger 少列 canary 證明「修好但未記帳」會紅，偽造 canary 證明「憑空記帳」也會在
掃描前紅，因此只湊總數無法過 gate。

### 3. 如何證明本批遵守解凍清單？

實質程式 diff 只有 generator；另有 baseline、ledger、回報三份 docs 新檔。`src/**`、
tests、ESLint config、TS config、package/lockfile 與 frozen manifest 均零 diff。config 唯一
暫改只存在於 canary 3，並以 SHA `64d556…e874` 精確還原。沒有 finding 修復、依賴變更、
commit 或 push。

### 4. 如何證明 scoped assert 不是被強制掃描 override 騙過？

強制掃描與 effective-config 查詢使用兩顆 ESLint instance：前者帶 rule=error memory
override 以發現全庫存量，後者完全不帶 override，逐檔讀真實 config。若誤重用前者，27
個未清檔都會被視為 error；現況反向 assert 綠、且把唯一 selector 改成不匹配後能精準
指出 `src/map.ts` 為 off，證明正反兩邊都有實際約束力。

### 5. `mySessionsController.ts` 4 筆在 ledger 機制下如何逐步操作與複驗？

先凍結這四筆 scope：

```text
ebf46214044c39a47782e9fbb01a152a  onMySessionsChange
1957d00e0e6a2cb919662ff63d65c0c4  reconcileActiveChatParticipation
df2cdcfc865e2bfed69286f2c866996f  reconcileActiveDetailParticipation
bcb22c134f491515ce57c49fe82f1c8a  toast
```

建議流程：

1. 開工時先由 frozen manifest 與強制 scan 複驗四 ID 都在
   `src/controller/mySessionsController.ts`，且該檔總數恰 4；盤點 interface declaration、
   destructure、construction sites 與 tests。
2. 只把 `MySessionsControllerDependencies` 的四個 method signatures 改成對應 function
   properties；不加 wrapper、`.bind()` 或新 arrow。做 erased-token byte equality、typecheck、
   指定 unit 與 method-signature canary。
3. source 修好後，強制 scan 應顯示上述四 ID 全消失且沒有新 ID。因為整檔由 4→0，將
   **精確路徑** `src/controller/mySessionsController.ts` 追加到既有 scoped `files`；不可用
   `src/controller/*.ts`。此 config 變更必須在下一次 generator 前到位，否則 cleared-file
   assert 會按設計紅。
4. 驗收方確認修復與 runtime/token 證據後，建立該批 acceptance record，並由接受步驟在
   ledger 追加四筆 `{stableId,path,batch,acceptanceDoc}`；`acceptanceDoc` 指向已建立的接受
   紀錄。四筆與 source/config 應視為同一個接受原子，不接受只補 ledger 的變更。
5. ledger 到位後重生 manifest。推導值應為 240 findings／26 files／sessionController 63；
   generator 先驗四 ID 都屬 baseline，再驗 current 恰等於 baseline − ledger，最後驗
   `mySessionsController.ts` effective severity 是 error、其餘 26 個未清檔不是 error。
6. 驗收方再獨立執行：baseline/ledger schema 與 subset 檢查、四 ID 強制反掃為 0、
   method-signature 暫退 canary、scope selector 暫退 canary、兩次生成＋HEAD/候選 SHA、
   `--check`、erased-token、typecheck/lint/Prettier、unit/mock/local 與 bundle；每次暫改都以
   SHA 精確還原。

這裡有一個應在下一張修復派工單寫清楚的權責細節：ledger 名為
`acceptedRemovals`，所以不宜由實作者在獨立驗收前把候選修復宣稱為 accepted；最一致的
做法是「實作者先交 source/config 與 forced-scan 證據，驗收方建立 acceptance record 後
原子追加 ledger 並重生 manifest」。若未來仍要求實作者交件時 generator 必須全綠，就需
明文允許候選 ledger entry 在尚未 ACCEPTED 的 working tree 中暫存，否則兩項要求有時序
矛盾。本批兩筆都已由 E-2 接受，因此不受此疑義影響，也不需要在 E-3 擴 schema。

## 8. 未做／疑義／BLOCKED

- 未做：任何 `src/**` finding 修復、tests/config/package/lockfile 修改、全域
  `unbound-method` 恢復、local Supabase 矩陣、commit、push。
- 疑義：只有 §7.5 所述未來批次的「候選 ledger 與 ACCEPTED 時點」權責／時序需在下一張
  修復派工單明文化；不影響本批正確性或驗收。
- BLOCKED：無。
