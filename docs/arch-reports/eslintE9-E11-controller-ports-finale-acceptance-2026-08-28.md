# ESLint 恢復 Phase E-9~E-11 聯合驗收紀錄（controller ports 收官三批）

- 日期：2026-08-28。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-28-eslintE9-E11-controller-ports-finale.md`；
  Codex 回報：
  `docs/arch-dispatch-2026-08-28-eslintE9-E11-controller-ports-finale-report-codex.md`。
- 首個三 stage 單次交件批（user 拍板降轉交成本）。驗收方法：本機重跑
  完整 gate（含 test:local 三拍）＋親自複跑 37 條紅簽章／兩檔抽樣
  canary／erased ×2／hunk 論證＋唯讀對立審查 agent（opus，四面＋
  factory 分組複核）。

## 結論：**ACCEPTED**——controller-callback-port family 79/79 全數清零

## 通過項（全部本機重驗）

1. **紅簽章三十七條逐字複現** [已驗證]：missing×35 序列與 read-back
   預測完全一致（intent 22 前／lifecycle 13 後,extraction 先於
   ports）＋198/163＋22/20;manifest SHA=HEAD;對立審查亦獨立實跑
   `--check` 得逐字逐序相同輸出。
2. **規則有牙**（親自抽樣）:兩檔各暫退一筆→恰紅 2 筆於解構行
   `150:3`（intent）／`119:3`（lifecycle,+3 位移後）→SHA 還原逐字→
   綠;Codex 三 stage 全量 canary（13→2→13 差分／22 筆／2 筆）行號
   與 manifest 一致。
3. **erased ×2 全等** [已驗證]：intent 14,309／lifecycle 11,629
   bytes（對立審查獨立重算同值）;bundle 淨 0 B。
4. **hunk 論證** [已驗證]：lifecycle 六個 hunk 全落兩 interface 區
   （`:25-43`／`:59-81`,decline 展開 +3 位移符合派工單預告,`:233`
   原文=HEAD `:230` 逐 byte）;intent hunk 全落 `:47-91`。
5. **23 筆跨檔 finding 零漂移**（對立審查以 ad-hoc 對 sessionController
   實掃 63 筆與 manifest 雙向差集皆空）;同名陷阱正確迴避
   （`refreshAuthoritativeState` 等結果 interface 成員維持 method）;
   LifecycleDataApi 其餘 8 成員原樣。
6. **selector 雙向機器驗證**:generator 的 cleared/uncleared 兩條
   assert 在最終紅簽章中皆未出現=「該上線已上線、未清未提前」是機器
   強制而非自陳;`--print-config` 六檔矩陣正確。
7. **Gate 全綠**:9 標記（unit 346×2、mock 298/4、build、bundle 淨
   0 B）;**test:local 首跑紅=fixture 累積污染三拍**（DB 272 筆:
   open 162＋full 70,與 E-4 完全同型=五輪 local 的穩定累積水位→
   guarded reset→綠 API 2/2＋browser 45/11）。

## Factory results 63 分批裁決（方案 A 之下的分組,驗收方拍板）

**採對立審查替代分組 23/25/15,不採 Codex 的 36/23/4**。理由:
- Codex 分組未做評估（理由對任何分組都成立,實為照抄派工單示例）,
  且有一處事實錯誤:**auth 的宣告不是 inferred return object,是
  工廠簽名上的 inline 顯式回傳型別**（`authController.ts:73-76`,與
  chat `:66-68` 同構;兩檔都無具名結果 interface）。
- 36 超出已驗證單 stage 最大批量（22）64%;FR 批只有 ad-hoc 差分守門
  （sessionController selector 要最後一批才上線）,驗證強度弱於
  E-9~E-11,不宜放大批量。

| 批次 | 宣告檔 | 筆數 | 解構位置 | ad-hoc 遞減 | 紅簽章條目 |
| --- | --- | --- | --- | --- | --- |
| FR-A | mySessions 15＋playerDirectory 8 | 23 | `:314-328`／`:353-360` | 63→40 | 24 條（files 仍 20） |
| FR-B | discoveryMap 13＋intent 12 | 25 | `:379-391`／`:424-435` | 40→15 | 26 條（files 仍 20） |
| FR-C | lifecycleActions 11＋auth 3＋chat 1;**sessionController selector 上線** | 15 | `:455-465`／`:468`（單行三筆,cols 11/27/41）／`:613` | 15→0 | 17 條（files 20→19） |

FR 派工要件（對立審查產出）:auth 3 筆同行不同 col——canary 必逐
`line:col` 列舉;auth/chat 的切除區間以 AST 釘死 inline 回傳型別節點
（`:73-77`／`:66-69`）並凍結緊鄰 token;`sessionController.ts` 三批
全程不編輯,以 `git diff --stat` 空自證（比切區間更強）;每批
erased-token ×N 檔＋stableId→owner/member→line:col cross-table。

## Ledger 追加（本紀錄即 acceptanceDoc;batch 分標）

E-9×11（lifecycle ports）:`4500e451…`／`7f9eafaf…`／`d9244d7a…`／
`f70ddcdf…`／`65091efc…`／`2fd1b37c…`／`987535f9…`／`d8c2f571…`／
`3388ea60…`／`8fe7fe12…`／`9ef772e2…`。
E-10×22（intent）:`68bcd45f…`／`b06b01d2…`／`30b027aa…`／
`07150d83…`／`89342c0a…`／`3e3a3b20…`／`06658390…`／`156f8c70…`／
`d5945f03…`／`0bbe3ff8…`／`2e8dcfe2…`／`2b633044…`／`d41ddf19…`／
`61a99f77…`／`32a61647…`／`b9e9cf08…`／`c0964e8d…`／`879f40b8…`／
`36eaa31d…`／`4691d544…`／`b4065b3b…`／`487726c7…`。
E-11×2（extraction）:`935b4a87…`／`a3efe94c…`。
重生後 manifest=163／20／63。

## 量化更新

- `unbound-method`：198→**163**／22→**20** 檔;上線 8 檔（七個
  controller 檔＋map）;**controller-callback-port 79/79 清零、
  api-method-extraction 2/2 清零**。
- 剩餘 163=factory results 63＋React contracts 79（64＋15）＋
  method-ref 1＋surface-lifecycle 19＋injected-repository-callback 1
  （`privateDataRepository.ts:130 loadCourts`）。
- bundle／unit 346／mock 298／local 45 基準不變。
