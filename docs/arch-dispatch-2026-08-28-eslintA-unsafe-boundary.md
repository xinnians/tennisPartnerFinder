# ESLint 恢復 Phase A 派工單：unsafe argument／call／return 三規則恢復

- 日期：2026-08-28。母文件：
  `docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md`（§4A，已隨 6F
  ACCEPTED 落檔）＋`docs/arch-roadmap-2026-08-26-react-ownership.md`（批 6
  完結後新管線首批）。
- 開工基準：`3827d02` 之後的最新 main HEAD（working tree 應乾淨，否則停手
  回報）。
- 本批性質與批 6 不同：**恢復三條 type-aware 規則並修 15 筆 findings**。
  紀律不變的部分：修法**零 runtime token**（erased-token 對帳逐檔 raw
  全等）、禁新增 `any`／`@ts-ignore`／`eslint-disable`、strict／canary
  三拍、超出裁決面＝停手回報。
- bundle 硬約束：total gzip 餘 1,435 B；零 token 修法預期淨 0 B，超 gate＝
  BLOCKED。
- 你不 commit、不 push；working tree 交驗收方。

## 範圍一：`eslint.config.js` 三條規則 off→恢復

- 恰刪六行（三條規則的 `"off"` 行＋各自上方「既有 type-aware 型別債」
  註解行）：`@typescript-eslint/no-unsafe-return`（現 `:88`，註解 `:87`）、
  `no-unsafe-call`（`:90`，註解 `:89`）、`no-unsafe-argument`（`:98`，
  註解 `:97`）——**以規則名稱字串比對定位，不依行號硬刪**（`:99` 是
  `unbound-method` 的註解行，删錯即傷及凍結面）。刪行後即回
  `recommendedTypeChecked` 的 error 預設（開單已查
  typescript-eslint 8.67.0 的 recommended-type-checked：三條皆 `'error'`）；**不用 `"error"` 覆寫行**（與
  既有 off 區塊的維護模式一致：恢復＝移出債清單）。其餘六條 off 與全部
  規則零變更。
- 若你評估「改 error 保留註解」比「刪行」更符合現檔慣例，可改採並回報
  理由；兩式擇一，不得混用。

## 範圍二：15 筆 findings 修復（manifest 開單凍結）

開單實測（暫時 enable→掃描→byte-identical 還原 config 取得；動手前以同法
複驗，**多一筆或少一筆都停手回報**）：

| 檔案 | 位置與規則 |
| --- | --- |
| `src/data/repositories/dataRepository.ts` | `:83:30` return＋`:83:58` call（`currentTime` 的 `now()`） |
| `src/features/notifications/notificationFeature.ts` | `:64:32`／`:83:36`／`:159:10` call（皆為 `WEB_PUSH_VAPID_PUBLIC_KEY.trim()`） |
| `src/sessionPresentation.ts` | `:126:3`／`:128:21`／`:251:30`／`:500:3`／`:582:3`／`:583:23`／`:638:3` return＋`:127:72`／`:526:45` argument |
| `src/sheets.ts` | `:82:7` call（registerUnmount 內 typeof 守衛後的 `unmount()`） |

### 修法優先序（plan §4A：由來源向下游，不在 consumer 堆 assertion）

1. **來源型別收斂（首選，零 token）**：
   - notification 三筆的根因是 `config.ts:6` 的 `ImportMetaEnv` index
     signature（`any`）讓 env 衍生 export 全部推導為 `any`——**解凍
     `config.ts`**：對 env 衍生 export 補 `: string` 註記（至少
     `WEB_PUSH_VAPID_PUBLIC_KEY`；同型的其餘 env export 建議同批補齊並
     回報列明，字面與 `??` fallback 零變更）。
   - dataRepository 兩筆：收斂 `RepositoryOptions.now` 的型別——現為顯式
     `unknown`（`:37`），經 `typeof` narrow 後落入全域 `Function` 型別面
     （無 call signature）故呼叫觸發 unsafe-call；注意 `:83` 的
     `typeof now === "function" ? now() : now` 三元是**刻意容忍非函式**，
     型別可如實寫 `(() => Date) | Date`，runtime 三元不動。
   - sessionPresentation 九筆：優先收斂檔內 input interface 欄位型別
     （court `name`／`id`／`city`、message 欄位等），讓 return 型別自然
     成立。
2. **erasable cast（次選）**：如 `sheets.ts:82` 的
   `(unmount as () => void)()`——esbuild 以 AST 印出，erase 後不留括號
   （6E shorthand 先例同理），仍屬 raw 全等；每筆 cast 回報列明位置。
3. **禁止（＝BLOCKED 交裁決）**：新增 runtime guard／wrapper／`String()`
   包裹／新 statement／改分支；任何 erased-token 差異（含括號殘留）。

## 規則 canary（×3 三拍逐字，證明規則真的開了且有牙）

修復完成、lint 綠之後，逐條規則暫加一筆最小違例（如
`const p = JSON.parse("null"); export const q: string = p;` 類，或各規則
文件範例）→ `npm run lint` 紅且指名該規則與檔:行 → byte-identical 還原
→ 綠。三條各一次。

## 解凍清單（Q3 守則：未列即凍結）

- `eslint.config.js`：恰上述六行（或等價 error 式，擇一）。
- 四個 finding 檔＋`config.ts`：**僅型別層變更**（註記／interface 欄位／
  erasable cast）；runtime token 逐檔 raw 全等。
- 開單實測：15 筆修復預期**零測試變更**、零 importer 變更、零文件字面
  變更；若實作中發現需要動任何測試或其他檔，停手回報。

**仍凍結**：其餘六條 off 規則；所有測試斷言語意；`tsconfig`／`package.json`
；bundle gate；`domainTypes.ts`；四檔＋config 的全部 runtime 語意（含
`dataRepository:83` 三元容忍、sessionPresentation 的 tolerant 入口、
`sheets` registerUnmount 契約）。

## Ground truth（2026-08-28 開單實測；動手前自行重驗）

- off 區塊現況：9 條全 off（`eslint.config.js:84-100` 區），每條上方一行
  相同註解。
- 15 筆 manifest 如上表；`vite.config.ts` 與其餘 TS 檔零 finding。
- CLI `--rule` 在 flat config 下無法引用 plugin namespace——manifest
  複驗用「暫時改 config→掃→byte-identical 還原」法。
- 量化基準（6F 後，HEAD `3827d02`）：main gzip 187,466（餘 4,954 B）；
  total 257,627（餘 1,435 B）；unit 346；mock 298 passed／4 skipped；
  `window.__importAppModule` 110。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／**lint（真 config，三規則已恢復，全綠）**／prettier:check／
build／check:production-bundle（淨值，超 gate＝BLOCKED）／test:mock
（≥298）／test:local（production 檔型別變更，不豁免；污染紅依 guarded
reset 三拍；偶發依取樣分類）／`git diff --check`／**逐檔 esbuild 擦除
token 對帳（五檔全 raw 全等，無例外表）**／同口徑重掃三規則＝零 finding
／其餘六條 off 規則以記憶體 override 重掃，findings 數與 plan §2 對照
（修復不得順手動到其他規則的債，數字漂移逐筆解釋。已知預期漂移：
`config.ts` env 型別收斂極可能連帶消除同檔 `no-unsafe-assignment`
findings——屬修根因的正當副作用，如實列出即可，非範圍外變更）。

## 回報合約

寫 `docs/arch-dispatch-2026-08-28-eslintA-unsafe-boundary-report-codex.md`
（不 commit、不 push），必含：config diff 式樣與理由、15 筆逐筆修法表
（位置／根因／修法／型別層或 cast）、erasable cast 清單、五檔擦除對帳
逐字、規則 canary ×3 三拍逐字、六條未恢復規則的 findings 對照表、收尾
矩陣逐字、Codex 五問（第 5 問答「對 Phase B（redundant-type-constituents
9＋unnecessary-type-assertion 10）的建議——`databaseTypes.ts` generated
策略你會選 plan §5 哪一案、為什麼；assertion 移除與 6C/6E token 對帳
紀律的相容做法」）、未做／疑義／BLOCKED。
