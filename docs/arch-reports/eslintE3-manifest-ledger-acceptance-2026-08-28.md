# ESLint 恢復 Phase E-3 驗收紀錄（manifest ledger 機械化批）

- 日期：2026-08-28。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-28-eslintE3-manifest-ledger.md`；Codex
  回報：`docs/arch-dispatch-2026-08-28-eslintE3-manifest-ledger-report-codex.md`。
- 驗收方法：本機重跑完整 gate＋親自複跑 baseline 投影／determinism／
  `--check`／三組 canary（全程精確 Edit 還原＋SHA 比對，遵守 E-2 教訓）
  ＋唯讀對立審查 agent（opus，七項＋fail-closed 攻擊面 33 分支）。

## 結論：**ACCEPTED**——修復批常數手調自此退場

## 通過項（全部本機重驗）

1. **baseline 固化正確** [已驗證]：`{stableId,path}` 有序投影與
   `git show 77365a0:` 版逐字相等（246 筆／28 檔／sessionController 63）；
   ledger 恰 E-2 兩筆。
2. **manifest 輸出零變更** [已驗證]：改造後重生兩檔與 HEAD
   byte-identical（SHA 三方一致）；`--check` 綠；render／checksum／
   summary 演算法 diff 零觸及（對立審查逐 hunk 核實）。
3. **三組 canary 親自複跑**：①ledger 少列→紅指名
   `761154dc…` missing＋245/244＋28/27→還原 SHA `2fd10938…` 綠;
   ②偽造 ID→紅 `not in baseline`（在 TS program／scan 之前擋下）;
   ③selector 失配→紅 `cleared file is not scoped to error: src/map.ts`→
   還原後 config SHA `64d55615…` 與 HEAD 一致、`git diff` 零輸出。
   紅訊息全部與回報逐字一致。
4. **集合等式雙向有牙**（對立審查）：current⊆expected 與
   expected⊆current 逐筆指名＋同 ID 換 path 分支;全檔 grep
   `244/27/63`／`EXPECTED_` 零殘留——數字全由推導。
5. **兩顆 ESLint instance 分離實證**（對立審查補做「反向有牙」）:
   誤用掃描 instance 會產生 27 條 premature 紅、正確 instance 0 條;
   scope gate 母體=baseline 28 path（全清檔不漏驗）。
6. **fail-closed 33 分支**（對立審查抽純函式實測）：路徑遍歷／絕對
   路徑／大寫 hex／額外鍵（含 `__proto__`）／重複 ID／findingCount
   不符全部 THROW；派工單點名的三項邊界全覆蓋。
7. **Gate 全綠** [已驗證]：9 標記 exit 0（typecheck／lint／prettier／
   unit 346×2／mock 298/4／build／bundle 淨 0 B／`git diff --check`／
   凍結面 porcelain 空）；`test:local` 豁免前提成立。

## 記帳（缺口清單，進後續批）

- **G1（下批必補）**：baseline 無完整性守門——`sourceCommit` 是死欄位,
  手改 baseline 可繞過 ledger 記帳（唯一實質「移動球門」殘留）。E-4
  順手補 `baselineChecksum` assert 或 git 再投影。
- **G2（下批必補）**：`acceptanceDoc` 只驗形狀不驗存在——補
  `existsSync` 即把「先有驗收紀錄才可記帳」機械化。
- **G5（設計意圖記帳）**：新增 unbound-method finding 無逃生門——
  baseline 凍結＋hard gate 會讓新增觸發點硬紅 generator。這是防新增債
  的 feature：紅=通知 PM 裁決（修掉或經裁決擴 baseline），母計畫以此
  為準。
- G3／G4：不可達的描述性瑕疵,不處理。
- **G6（E-4 派工單必寫）**：hard gate 先於 scope gate throw——實作者
  交件紅時永遠看不到 scope gate 訊息;selector 仍須實作者一併交出。

## E-4 流程拍板（採對立審查裁決:紅簽章＋驗收方原子追加）

- `acceptedRemovals` 語意守住,不加候選中間態。
- **實作者交件判準=紅簽章**：generator 輸出恰為 4 條
  `expected finding missing…`（逐字指名 4 個 stableId）＋
  `findings expected 244, received 240`＋`files expected 27, received 26`
  且**無其他錯誤行**——紅比綠更有證據力（證明恰好消滅 4 筆,無多殺
  少殺）。實作者手上唯一能綠的守門=selector 加入後的 `npm run lint`。
- 實作者擁有 `src/**`＋selector;**驗收方擁有 ledger 追加＋manifest
  重生**（純機械抄紅簽章 4 ID,立即被 L⊆B＋集合等式再驗,不違反
  驗證不自驗）。
- E-4 動 src → `test:local` 必跑,不得比照 E-3 豁免;複驗清單加
  「baseline 檔零 diff 自證」。

## 量化更新

- generator：三常數退場,改 baseline−ledger 集合推導＋scoped 正反
  assert;現值 244/27/63、checksum `ce5a3e8a…ccdd30` 不變。
- bundle／unit 346／mock 298 基準全部不變。
