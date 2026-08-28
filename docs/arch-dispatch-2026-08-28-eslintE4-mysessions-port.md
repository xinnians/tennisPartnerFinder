# ESLint 恢復 Phase E-4 派工單：controller ports 首批（mySessionsController 4 筆）＋ledger 守門強化

- 日期：2026-08-28。母文件：
  `docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md` §4E；設計輸入＝
  E-3 驗收紀錄
  （`docs/arch-reports/eslintE3-manifest-ledger-acceptance-2026-08-28.md`）
  「E-4 流程拍板」與記帳 G1／G2／G6。
- 開工基準：`e5ca551`（E-3 ACCEPTED）之後包含本派工單的最新 main HEAD。
  開工前 `git status --porcelain` 應為空；有條目即停手回報。
- **本批＝controller ports 首批（修復面）＋兩個 generator 守門強化
  （工具面）**，兩面各自有驗收條件。零 runtime token、零行為變更。
- **交件判準與 E-2 不同（E-3 拍板）**：你交件時 generator 是**紅簽章**
  狀態（見下），ledger 追加與 manifest 重生由驗收方在 ACCEPTED 時原子
  完成——你**不改** ledger、**不重生** manifest。
- 你不 commit、不 push；working tree 交驗收方。

## 目標四筆（manifest stable ID 凍結；全檔恰 4 筆、單一 owner）

| stableId | 位置 | expression |
| --- | --- | --- |
| `ebf46214044c39a47782e9fbb01a152a` | `mySessionsController.ts:88:3` | `onMySessionsChange` |
| `1957d00e0e6a2cb919662ff63d65c0c4` | `:90:3` | `reconcileActiveChatParticipation` |
| `df2cdcfc865e2bfed69286f2c866996f` | `:91:3` | `reconcileActiveDetailParticipation` |
| `bcb22c134f491515ce57c49fe82f1c8a` | `:94:3` | `toast` |

## 修改一：`src/controller/mySessionsController.ts`（唯一 src 改動面）

`MySessionsControllerDependencies`（`:50-60`，未 export）的**恰四個**
method signature 改 function property：

```ts
// 修改前（現行原文）
  onMySessionsChange(state: ControllerMySessionsViewState): void;
  reconcileActiveChatParticipation(): void;
  reconcileActiveDetailParticipation(): void;
  toast(message: string): void;
// 修改後
  onMySessionsChange: (state: ControllerMySessionsViewState) => void;
  reconcileActiveChatParticipation: () => void;
  reconcileActiveDetailParticipation: () => void;
  toast: (message: string) => void;
```

- 成員順序、參數名、其餘五個成員（`api`／`blockedPlayerGate`／
  `participationGate`／`rosterGate`／`store`——本就是 property
  signature）一字不動；`:85-95` factory destructure 原文不動。
- construction site 唯一（開單實測，動手前自行重驗）：
  `src/sessionController.ts:302-312` object literal shorthand，傳入的是
  該檔 closure functions——與 function property 契約相容，**零 diff**。
  `sessionController.ts:48` 的
  `Parameters<typeof createMySessionsController>[0]` 推導對此改動透明。
  發現第二個 construction site 即停手回報。
- **已知非 construction site 的傳播面（不觸發停手條款）**：
  `sessionController.ts:123`／`:127` 以 indexed access
  （`MySessionsControllerOptions["onMySessionsChange"]`／`["toast"]`）
  轉出型別到 public options——函式型別形狀不變，僅 bivariance→
  contravariance;`createSessionController` 無 `.ts` caller（只有
  `src/main.js` 與 tests 的 `.js`,不進 checkJs）,零影響。
- 同檔其他 interface（`MySessionsDataApi`／`MySessionsController` 等）
  的 method signature **本批不动**——它們的 finding 屬後續批
  （factory results 63 報在 `sessionController.ts`），越界修會破壞
  紅簽章的「恰 4 筆」。

## 修改二：`eslint.config.js` scoped files 追加

現有 Phase E 區塊的 `files: ["src/map.ts"]` 改為：

```js
files: ["src/controller/mySessionsController.ts", "src/map.ts"],
```

（精確路徑、字典序；**禁用 glob**——`src/controller/*.ts` 會讓其他六個
controller 檔提前上線並觸發 generator 反向 assert。）注意 G6：hard gate
先於 scope gate throw，你交件的紅簽章裡**不會出現** scope gate 訊息;
selector 正確性由你的 `npm run lint` 綠自證（該檔 4 筆已修，規則對它
上線後應零報）。

## 修改三：generator 守門強化 ×2（`scripts/generate-eslint-unbound-manifest.mjs`）

E-3 驗收記帳 G1／G2，各自最小實作＋canary：

1. **G1 baseline 完整性**：新增常數
   `BASELINE_SHA256 = "14e56a1675ccf4939f2e0bc3e2685070b325a32a75ef778ea1ffa45b018fd207"`
   （開單實測之現值），`loadLedgerState` 開頭先以一次獨立
   `readFileSync(BASELINE_PATH)` 取原始 bytes 驗 sha256（**排在
   `readJson` 之前**，避免壞 JSON canary 先跳 parse error），不符即
   throw 指名「baseline file drifted」。手改 baseline 自此機械攔阻;
   未來若經裁決擴 baseline，必須同時改此常數（顯式 diff）。
2. **G2 acceptanceDoc 存在性**：ledger 每筆 `acceptanceDoc` 以
   `existsSync(path.join(ROOT, …))` 驗證存在，缺檔 throw 指名。
- 其餘 generator 邏輯零 diff——明文放行的例外僅：上述一次
  `readFileSync`、`node:fs` import 追加 `existsSync`、兩個 throw 分支
  與常數。兩強化各配 canary（見驗收條件 3）。
- 備忘：generator 在 `buildManifest` 內 throw（早於 `:974-975` 的
  `writeFileSync`），紅簽章與 canary 都**不會弄髒 manifest 兩檔**——
  「manifest 維持 HEAD 版」凍結因此可自證。

## 硬驗收條件

**E-2 教訓（強制紀律）**：canary 前先抄目標檔 SHA-256；清除一律精確
編輯還原、禁 `git checkout`；還原後比 SHA。

1. **紅簽章（交件狀態的 generator 輸出，逐字抄錄）**：
   `node scripts/generate-eslint-unbound-manifest.mjs` exit 非 0，錯誤
   **恰為六條 `- ` 條目、順序固定**（標頭 `manifest hard gate failed:`
   與 stack trace 不計）：`expected finding missing from current scan:
   <上表四 stableId 依表序> (src/controller/mySessionsController.ts)`
   ×4 → `findings expected 244, received 240` →
   `files expected 27, received 26`——**無其他錯誤條目**
   （sessionController 63 不變故無該行；多一條或少一條都表示多殺／
   少殺／越界）。
2. **規則有牙三拍**：selector 追加後 `npm run lint` 全綠→暫 revert
   四行回 method signature→lint 恰紅 **4 筆**指名
   `@typescript-eslint/unbound-method` 於 `:88/:90/:91/:94`（逐字）→
   精確還原 SHA→綠。
3. **強化 canary ×2（在動 src 修復之前跑）**：①baseline 暫改一 byte→
   generator 紅、輸出恰一條 drifted 錯誤（`loadLedgerState` 階段 throw,
   早於掃描與 hard gate,不會出現其他條目）→精確還原 SHA→綠
   （`244 findings/27 files; sessionController 63`）;②ledger 暫把一筆
   `acceptanceDoc` 改成形狀合法但不存在的路徑→紅恰一條指名→精確還原
   SHA→綠。兩個 canary 完成後才進行修改一的 src 修復。
4. **erased-token 全等**：HEAD 與修改後的 `mySessionsController.ts`
   以 A–D 口徑 esbuild（loader ts、format "esm"、target "esnext"、
   minifyWhitespace true、treeShaking false）逐 byte 全等。
5. **無新增例外**：不加 `any`／`@ts-ignore`／inline disable／wrapper／
   `.bind()`／新 arrow。

## 解凍清單（Q3 守則：未列即凍結）

- `src/controller/mySessionsController.ts`：僅 `:53`／`:55`／`:56`／
  `:59` 四個成員宣告形狀（`onMySessionsChange`／
  `reconcileActiveChatParticipation`／`reconcileActiveDetailParticipation`
  ／`toast`——以名稱為準）。
- `eslint.config.js`：僅 scoped 區塊 `files` 陣列。
- `scripts/generate-eslint-unbound-manifest.mjs`：僅 G1／G2 兩強化。

**仍凍結**：其餘 `src/**` 全部（含 `sessionController.ts`）、`tests/**`
全部、`docs/arch-eslint-phaseE-baseline.json`（**零 diff 自證**，canary
暫改除外）、`docs/arch-eslint-phaseE-removal-ledger.json`（**你不追加
——驗收方原子完成**；canary 暫改除外）、manifest 兩檔（**你不重生;
交件時維持 HEAD 版**）、`tsconfig.json`、`package.json`、
`package-lock.json`、全域 off 行、databaseTypes override、bundle gate。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

- typecheck／lint／prettier:check／build／check:production-bundle
  （main 與 total gzip 淨 0 B）／test:session-unit（346）／test:mock
  （≥298）／**test:local（動 src，必跑；紅時先數 DB 再 guarded reset
  三拍分類）**／`git diff --check`。
- 紅簽章逐字＋規則三拍＋強化 canary ×2＋erased-token。
- `git status --porcelain` 全庫：恰為解凍 3 檔＋回報，共 4 條;
  baseline／ledger／manifest 三者零 diff 自證（最高優先）。

## 回報合約

寫 `docs/arch-dispatch-2026-08-28-eslintE4-mysessions-port-report-codex.md`
（不 commit、不 push），必含：修改後 `:50-60` 逐字原文（防偽引用）、
紅簽章六行逐字、lint canary 紅 4 筆逐字、強化 canary ×2 逐字（含還原
SHA）、erased-token 對帳、收尾矩陣逐字、Codex 五問（第 5 問答「下一批
（discoveryMapController 6 筆或其他 consumer 檔）沿用本模板時的差異
點;以及 controller ports 79 筆全數走完後,factory results 63（全報
sessionController.ts）批的 scoped 上線策略——該檔要 63 筆全清才能上線,
中間批的守門空窗如何處理」）、未做／疑義／BLOCKED。

## 驗收方後續動作（記載於此供對照，非你的工作）

ACCEPTED 時驗收方原子完成：寫驗收紀錄→ledger 追加四筆
`{stableId, path, batch: "E-4", acceptanceDoc: <驗收紀錄路徑>}`→重生
manifest（預期 240／26／63 全綠，scope gate 首次驗到
`mySessionsController.ts` cleared 且 error）→`--check` 綠→一併 commit。
