# ESLint 恢復 Phase E-5 驗收紀錄（discoveryMap controller ports 6 筆）

- 日期：2026-08-28。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-28-eslintE5-discoverymap-port.md`；Codex
  回報：`docs/arch-dispatch-2026-08-28-eslintE5-discoverymap-port-report-codex.md`。
- 驗收方法：本機重跑完整 gate（含 test:local）＋親自複跑紅簽章／lint
  canary 三拍／erased-token＋唯讀對立審查 agent（opus，含 E-6 五檔盤點
  複算）。紅簽章模板第二輪。

## 結論：**ACCEPTED**

## 通過項（全部本機重驗）

1. **紅簽章八條逐字複現** [已驗證]：missing×6 依表序＋240/234＋26/25;
   manifest SHA 維持 HEAD。
2. **規則有牙三拍** [已驗證]（親自複跑）：lint 綠→暫退六行恰紅 6 筆於
   `:96/:97/:99/:100/:101/:102`→精確 Edit 還原 SHA `4ede580f…8a31`
   逐字一致→綠。
3. **erased-token 全等** [已驗證]：5,990 bytes、SHA `25b91d95…dc4e`
   （對立審查獨立複算同值）;bundle 淨 0 B。
4. **修法零越界**（對立審查）：單一 hunk `@@ -60,13 +60,13 @@` 前後
   行號一致=零位移;`mapTools:65` 是未變 context 行（派工單「原位
   不動」風險守住）;同檔四個其他 interface 零 diff;selector
   `--print-config` 五檔矩陣=discovery/mySessions/map error、chat/
   sessionController off。
5. **回報防偽**：七行 SHA 全中;ledger `3f829c6d…`=E-4 commit 後版本;
   §8.5 五檔盤點逐項複算可追溯（construction 行號 :331/:363/:394/
   :438/:468/:613 全中）。
6. **Gate 全綠** [已驗證]：9 標記 exit 0;unit 346×2、mock 298/4、
   local API 2＋browser 45/11 首跑即綠、bundle 淨 0 B。

## E-6 拍板：改派 `authController.ts` 12 筆（對立審查建議採納）

- **auth 是五檔中唯一全單行 method signature、全 shorthand、無
  data-port `api` 交集的檔**——與 E-4/E-5 模板同形狀,「diff 恰 24 行
  /12 對」驗收條件可原樣沿用。
- chat／lifecycle／playerDirectory／intent 四檔含**多行 method
  signature**（如 chat `openChat:34-45`）,且多行簽名的 handler 物件
  字面值內部還有 **nested method signature（非 manifest findings,
  不得順手改;erased-token 抓不到,只有逐 stableId 對點抓得到）**——
  這四檔的驗收條件須改寫為：①逐 stableId 對點清單全中②非目標成員
  （含 nested handler）零 diff③erased-token 全等,並附多行簽名行區間。
- chat 的 finding 行是 **body 解構點 72-84**（`invocationStyle=
  destructured-function`,factory 收整顆 dependencies 後解構——與
  parameter-destructure 型不同）,canary 行號可寫死預測再實測。
- 必須原文保留的 construction 傳入（後續批）：chat
  `readCourts: () => read().courts`;playerDirectory 四個 forwarding
  arrow（`requireSessionAction` 含 `as Promise<boolean> | void` cast）;
  intent 三個 arrow＋`profilePrompt: promptProfile` 改名。
- lifecycle ports 11 批不加 selector（extraction 2 筆在 `:230` 同一行,
  另開小批）;紅簽章算式:auth −12→228/25;lifecycle ports −11 檔數
  不變。

## Ledger 追加（本紀錄即 acceptanceDoc）

`1ed8b19ddfae0cdc2ecf7234a2069d51`／`545214c04e96dec6589b97408d383638`／
`1b8f9d6f4ff0613167cf9610203242ee`／`4ef06f27267ec8414004d40a450e2bcb`／
`68f6f0bc444c826ad20bd5d2bb8a505c`／`34af30da673a2ea64bbfff5a73fb2e16`
（`src/controller/discoveryMapController.ts`，batch "E-5"）。重生後
manifest=234／25／63。

## 量化更新

- `unbound-method`：240→**234**／26→**25** 檔;上線=map＋mySessions＋
  discoveryMap;controller-callback-port 75→69。
- bundle／unit 346／mock 298／local 45 基準不變。
