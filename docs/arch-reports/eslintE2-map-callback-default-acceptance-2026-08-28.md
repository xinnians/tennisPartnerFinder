# ESLint 恢復 Phase E-2 驗收紀錄（map callback-default 首修批）

- 日期：2026-08-28。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-28-eslintE2-map-callback-default.md`；
  Codex 回報：
  `docs/arch-dispatch-2026-08-28-eslintE2-map-callback-default-report-codex.md`。
- 驗收方法：本機重跑完整 gate（含 test:local）＋親自複跑 rule canary／
  generator determinism／`--check` 三拍／erased-token 對帳＋manifest 零漂移
  指令複算＋唯讀對立審查 agent（opus，六項）。

## 結論：**ACCEPTED**——unbound-method 首度上線（scoped `src/map.ts`），246→244

## 通過項（全部本機重驗）

1. **diff 面恰為解凍五檔** [已驗證]：`src/map.ts` 恰 2 行（method
   signature→function property）、`eslint.config.js` 恰 8 行（scoped
   override，插於 databaseTypes 區塊後、disjoint 註解前，未拆散註解）、
   generator 恰 2 常數（246→244、28→27；63 不動）、manifest 兩檔重生。
2. **規則有牙三拍** [已驗證]（親自複跑）：修復版 lint 綠→暫 revert 兩行
   →恰紅 2 筆指名 `@typescript-eslint/unbound-method` 於 470:5／470:27→
   還原後 SHA `b96c8d87…6dd2d02` 與 Codex 修復版逐 byte 一致→綠。
3. **erased-token 全等** [已驗證]：HEAD 與 working tree 的 `map.ts` 以
   A–D 口徑 esbuild 擦除皆 12,504 bytes、SHA 相同（對立審查獨立複現同
   值）；bundle main gzip 187,466／total 257,627 淨 0 B。
4. **manifest 零漂移** [已驗證]（指令複算）：恰移除目標兩筆 stableId
   （`20cd603c…`／`761154dc…`）、零新增、其餘 244 筆內容逐字零變動；
   generator 兩次 byte-identical、`--check` 三拍綠紅綠；summary／五組
   統計欄與 findings 實體複算全等（對立審查）；`callback-default` 自
   familyStatistics 消失（非記 0）。
5. **scoped override 語意正確**（對立審查以 `calculateConfigForFile`
   六檔矩陣複驗）：`map.ts` unbound-method=2 且其他 type-aware／React
   Hooks 規則全保持 2；四個非 map 檔仍 off 無外溢；databaseTypes
   override 未被破壞。
6. **map.ts 為封閉單元**（對立審查）：`SessionPinHandlers` 未 export、
   構造點恰兩處零 diff；檔內其餘 method signature 皆 Google Maps runtime
   介面直呼形狀，manifest 母體（generator 強制全開口徑）該檔 0 筆——
   無「宣告在 map.ts、報錯在他檔」漏網面。
7. **Gate 全綠一次過** [已驗證]：typecheck／lint／prettier／unit 346×2／
   mock 298 passed 4 skipped／build／bundle 淨 0 B／test:local（API 2＋
   browser 45 passed 11 skipped，首跑即綠未 reset）／`git diff --check`
   ——9 標記全 exit 0。

## 驗收事故記帳（驗收方自誤，已無痕修復）

canary 清除時我誤用 `git checkout -- src/map.ts`——但修復尚未 commit，
HEAD 是修復前版本，等於把 Codex 的修復蓋掉。以精確 Edit 重建兩行後
SHA 回到 `b96c8d87…` 逐 byte 一致、lint 綠。**教訓重演確認：canary
清除一律精確編輯還原，禁 `git checkout`——在未 commit 的 working tree
上 checkout 必然回到錯誤基準**（memory 已有此教訓，本次驗證方自己
踩中；後續驗收 canary 前先抄下目標 SHA，清除只用 Edit）。

## 下批（controller ports）派工單必要修正（對立審查第 5 項 PARTIAL）

1. **declaration:consumer 在 controller-callback-port family 為 1:1**
   [已驗證複算]（七 contract 各只 1 個 consumer 檔）——「按 consumer 檔
   切批」與 declaration 邊界不錯位；Codex「shared contract 一次消除多
   consumer」的顧慮在此 family 無實據（surface-lifecycle 的
   `SurfaceContentHandle` 9 檔×2 才是該情形）。
2. **清零門檻以「檔」計非以 family 計**：`lifecycleActionsController.ts`
   全檔 13 筆（port 11＋api-method-extraction 2）——family 數字 11 修完
   即上線會立刻紅；派工單必須列「該檔全部 finding 清零才把精確路徑加入
   scoped files」並附每檔全量數。
3. **同檔雙 contract 耦合**：七個 controller 檔各宿主 input ports（報
   自檔）＋factory result（63 筆全報 `sessionController.ts`）。修 input
   ports 批不動 factory result;若順手同修會使常數手調極易算錯——批範圍
   要明文禁止越界。
4. **scoped files 是報錯位置語意**：某檔上線≠該檔宣告的 contract 受
   保護（`SurfaceHost.tsx` 上線也護不到報在 9 個 sheet 檔的 18 筆）。
5. **ledger 機械化建議**（Codex 五問＋對立審查同向）：以 E-1 baseline
   246/28/63＋accepted-removal ledger（`{stableId, path}`）推導 expected
   常數並逐筆 assert 消失，取代手調。第一 controller 批
   （`mySessionsController.ts` 4 筆，經資料驗證＝全檔恰 4 筆單一 owner）
   量級仍可手調＋stableId 反掃；79 筆放量前應先落 ledger 機械化。

## 量化更新

- `unbound-method`：246→**244** findings／28→**27** 檔；首個 scoped
  上線檔=`src/map.ts`；`callback-default` family 清零。
- manifest checksum：`bab42fb9…8a959`→`ce5a3e8a…ccdd30`。
- bundle／unit 346／mock 298／local 45 基準全部不變。
