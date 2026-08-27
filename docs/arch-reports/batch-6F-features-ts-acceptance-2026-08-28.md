# 批 6F 驗收紀錄（features 兩檔 TS 化＋ESLint 恢復方案落檔）——批 6 收官

- 日期：2026-08-28。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-27-batch6F-features-ts.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-27-batch6F-features-ts-report-codex.md`。
- 驗收方法：本機重跑完整 gate＋獨立擦除 token 對帳 ×2＋strict 探針 ×2 親自
  複跑＋方案文件親審＋唯讀對立審查 agent（六角度）。

## 結論：**ACCEPTED**——批 6（6A–6F）全案完結

## 通過項（全部本機重驗）

1. **annotation-only 無例外 ×2** [已驗證]：兩檔獨立 esbuild 擦除比對 HEAD
   逐 byte 全等；chunk hash 不變、bundle 四項淨 0 B（total gzip 餘 1,435 B）；
   零 `prefer-const` 衝突（read-back 逐 `let` 靜態預判命中）。
2. **探針 ×2 親自複跑** [已驗證]：紅指名（presence:141／profile:362）→
   byte-identical 還原→綠——同時關閉對立審查對回報「探針 SHA 為 Prettier
   前快照」的 [不確定]（我的複跑就在最終檔上）。
3. **port 誠實** [已驗證]（對立審查逐名 diff）：presence 11=11、profile
   21=21 與 `dependencies.X` 實際使用面完全一致；controller 型別
   （`ControllerApi`／`ControllerAuthSession`／`ControllerProfileEligibility`
   ／`ControllerAppState` 等）全存在且用法吻合；tracker 結構型別與
   `playerPresence.js` 回傳同形（該檔維持 `.js` 零 diff）。
4. **`:59` 預裁決精確執行**：刪 suppression 註解＋`string | null` annotation，
   runtime token 不變，lint 綠。
5. **交付三方案文件親審合格**：325 加總吻合（9+10+8+5+25+12+8+2+246）；
   五段 A–E 恰覆蓋 9 條無重複無遺漏；`unbound-method` 八型抽樣分類附逐型
   處置；`databaseTypes.ts` 三策略明列待拍板；明文本批 `eslint.config.js`
   零 diff（實測 0 行）且無越權表述。9 條規則名與 config `off` 清單逐字
   相同（真實掃描非杜撰）。
6. **Gate 全綠一次過**：typecheck／lint／prettier／build／bundle／unit 346／
   mock 298/4／local 2/2＋45/11（無 reset）／`git diff --check`／反掃歸零／
   凍結面零 diff／`__importAppModule` 110。
7. **對立審查（唯讀）六角度全 PASS**：含覆蓋盤點表 18 個測試行號高密度
   抽查全部語意對應（強反造假證據）。

## 勘誤（驗收方側，記入）

- 派工單「恰 20 成員」：清單本身 21 名完整無誤，是 read-back agent 數錯、
  驗收方照抄——**自數錯誤這次發生在驗證方**；「自己數的數字一律用指令算」
  適用於管線每一方。Codex 依 ground truth 實作 21 名並回報疑義，處置正確。

## 覆蓋債（記入）

- `presenceSettingsForProfile` 零 consumer／零覆蓋 export [已驗證]——批 6
  後續清理候選（死碼判定先 git log）。
- 兩 feature 檔無 direct unit import（由 main bootstrap 的 mock／local
  journey＋token 全等守）。

## 批 6 全案量化（6A→6F）

- 轉換：`config`／`profile`／`sessionCriteria`／`taipeiTime`／`filters`／
  `requestGate`／`sessionIntent`／`sheets`（＋`surfaceContracts` 新 leaf）／
  `dataApi`／`sessionController`／`presenceFeature`／
  `profileOrchestrationFeature`——共 12 檔轉 strict＋1 新純型別 leaf。
- bundle 淨變化全程 −7 B（6C 的 const 合併），total gzip 餘 1,435 B；
  unit 346／mock 298 基準不變；`__importAppModule` 110 不變。
- runtime token 例外全程僅 1 筆（6C `const surfaceEntry`，事前裁決）。
- 暫不轉（拍板保留）：`main.js`、`sessionViews.js`＋views、`mockData*`、
  `supabaseClient.js`；「可隨鄰批」九檔優先序見 6F 回報 §11.5。

## 下一條管線建議（Codex §11.5，待拍板）

先 ESLint 恢復 Phase A（unsafe-argument 2＋call 5＋return 8，依
`docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md`）→鄰接 `.js`
小批（playerPresence→focusableSelector→meFocus→sessionRoute→…）→
最後 `main.js`／`sessionViews` 收尾；`unbound-method` 246 筆恆為獨立專批。
