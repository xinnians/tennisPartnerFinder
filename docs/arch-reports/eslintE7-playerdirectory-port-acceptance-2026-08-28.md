# ESLint 恢復 Phase E-7 驗收紀錄（playerDirectory ports 13 筆，首個多行簽名批）

- 日期：2026-08-28。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-28-eslintE7-playerdirectory-port.md`；
  Codex 回報：
  `docs/arch-dispatch-2026-08-28-eslintE7-playerdirectory-port-report-codex.md`。
- 驗收方法：本機重跑完整 gate（含 test:local）＋親自複跑紅簽章／抽樣
  canary（單行＋多行各一）／erased-token＋唯讀對立審查 agent（opus，
  核心=nested 零 diff 獨立 AST 複驗,不採信回報宣稱）。

## 結論：**ACCEPTED**——多行簽名批模板成立

## 通過項（全部本機重驗）

1. **紅簽章十五條逐字複現** [已驗證]：missing×13 依表序＋222/209＋
   24/23;manifest／ledger SHA 維持 HEAD。
2. **規則有牙**（親自抽樣複跑）：lint 綠→暫退單行（captureAuthSnapshot）
   ＋多行（openPlayerDirectoryList）各一→恰紅 2 筆於 109/115（兩型態
   紅點皆正確）→精確 Edit 還原 SHA `dbcad726…b83b` 逐字一致→綠;
   Codex 全量 canary 13 筆行號與 manifest line 欄完全相同（對立審查
   比對）。
3. **erased-token 全等** [已驗證]：7,747 bytes、SHA `953ada28…4027`
   （對立審查獨立複算同值）;bundle 淨 0 B。
4. **nested/frozen 零 diff 獨立複驗**（對立審查自建 scanner 配方,不採
   信回報 token SHA）:13/13 MethodSignature→PropertySignature、四個
   handlers rawEqual＋tokenEqual（nested 恰 10）、六非目標＋三 frozen
   interface rawEqual、13+6=19=全成員（涵蓋性論證非列舉）;**最強反證=
   切掉整段 Dependencies 後餘檔 byteEqual（11,554 bytes）**;
   `sessionController.ts` byteEqual。
5. **selector 精確**（`--print-config`）:playerDirectory error、chat／
   intent off;ledger 24 筆分佈（2/4/6/12）核實。
6. **Gate 9/9 全綠** [已驗證]:unit 346×2、mock 298/4、local API 2＋
   browser 45/11 首跑即綠、bundle 淨 0 B。

## E-8（chat 11 筆）派工輸入（對立審查修正清單,已複算）

1. 11 筆表沿用 E-7 回報 §9.5（表序=manifest 陣列序=紅簽章 missing 序,
   經 baseline−ledger 序列全等證明:toast(81) 開頭）。
2. 凍結面:nested 5 筆 `:39-43`＋`canWithdraw:37`／`courts:38`＋非目標
   4（api:30/chatPollIntervalMs:31/surfaceRegistry:54/
   visibilityTarget:57）;11+4=15=全成員。
3. **補凍結 `chatController.ts:66-68` factory inline return type**
   （`openSessionChat:67`——mine `b5443c26…` finding 在
   `sessionController.ts:613:11`,誤改使 63→62）。
4. **補傳播面**:`sessionController.ts:44`（別名）／`:51`（data port
   交集）／`:117`（`openChat` indexed access——strict 下參數雙變轉
   逆變,現存 consumer=零參數預設值 `:159` 與 `.js`,風險低但以
   typecheck 綠實證）。
5. canary 序列明寫:port→加 selector→綠→暫退 11 筆→恰紅 11 於 body
   destructure `72-79/81/82/84`（非宣告行）→還原 SHA→綠。
6. 紅簽章恰 13 條:missing×11＋209/198＋23/22。
7. **採用 E-7 最強反證**:要求「切掉 `ChatControllerDependencies` 整段
   後餘檔 HEAD vs working byteEqual」自證。

## Ledger 追加（本紀錄即 acceptanceDoc）

十三筆依 manifest 序:`eb04e759…`／`3b8caa77…`／`c4409683…`／
`77882e87…`／`ddfc3fbe…`／`5db1cfcb…`／`614e224d…`／`5df8df59…`／
`f5e84037…`／`e059c6c2…`／`cb489a44…`／`73aef827…`／`0d0ccf3e…`
（`src/controller/playerDirectoryController.ts`，batch "E-7"）。重生後
manifest=209／23／63。

## 量化更新

- `unbound-method`：222→**209**／24→**23** 檔;上線 5 檔;
  controller-callback-port 57→44。
- bundle／unit 346／mock 298／local 45 基準不變。
