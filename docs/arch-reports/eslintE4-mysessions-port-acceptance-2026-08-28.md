# ESLint 恢復 Phase E-4 驗收紀錄（mySessions controller ports 4 筆＋G1/G2）

- 日期：2026-08-28。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-28-eslintE4-mysessions-port.md`；Codex
  回報：`docs/arch-dispatch-2026-08-28-eslintE4-mysessions-port-report-codex.md`。
- 驗收方法：本機重跑完整 gate（含 test:local）＋親自複跑紅簽章／lint
  canary 三拍／erased-token＋唯讀對立審查 agent（opus，七項＋紅簽章
  偽造攻擊面分析）。
- 首個紅簽章流程批：ledger 四筆由驗收方於本紀錄落盤後原子追加，
  manifest 重生 240／26／63。

## 結論：**ACCEPTED**

## 通過項（全部本機重驗）

1. **紅簽章逐字複現** [已驗證]：generator exit 1、恰六條依序（missing
   ×4 依表序＋`findings expected 244, received 240`＋`files expected 27,
   received 26`）；manifest 兩檔 SHA 維持 HEAD（throw 早於寫檔）。
2. **規則有牙三拍** [已驗證]（親自複跑）：selector 上線後該檔 lint 綠→
   暫退四行恰紅 4 筆於 `:88/:90/:91/:94`→精確 Edit 還原後 SHA
   `9ae9c431…5376` 與候選逐字一致→綠。
3. **erased-token 全等** [已驗證]：HEAD／current 皆 8,851 bytes、SHA
   `13bf75b0…b026`（對立審查獨立複算同值）;bundle 淨 0 B。
4. **修法零越界**（對立審查）：diff 恰 8 行只動指定四成員;同檔
   `MySessionsDataApi`／`MySessionsController`（19 個 method signature,
   屬後續批）零 diff;`sessionController.ts` 零 diff。
5. **G1／G2 落地正確**（對立審查逐行）：raw bytes SHA 在 parse 前
   （Buffer 雜湊比 utf8 string 更嚴格,正確）;existsSync 在路徑 schema
   後無 traversal;canary received SHA `5ebff92c…` 可完全重現（含
   baseline EOF 雙換行事故——Codex 誠實處理,G1 有牙的正面證據）。
6. **selector 生效實測**（對立審查 `--print-config` 三檔）：
   mySessionsController `[2]`／discoveryMapController `[0]`／map.ts `[2]`。
7. **Gate 全綠**：typecheck／lint／prettier／unit 346×2／mock 298/4／
   build／bundle 淨 0 B／`git diff --check`;**test:local 首跑紅→
   分類=fixture 累積污染（DB 272 筆:open 162＋full 70,與 E-4 純型別
   改動無因果）→guarded reset→綠（API 2/2、browser 45/11）三拍完成**。

## 常設判準（新增，對立審查紅簽章攻擊面分析）

**紅簽章單獨不構成修復證據**——把目標檔排除出掃描可造出同構六條
（硬 gate 與 scope gate 均不可辨）。修復證明必須同時具備：
①真 config lint canary 恰紅 N 筆逐字（結構上免疫排除攻擊）;
②`eslint.config.js`／`SCAN_GLOBS`／ignores 的 diff 逐行檢查;
③erased-token 全等。後續批一律沿用。

## 記帳（不阻擋）

- G2 `existsSync` 不分檔案／目錄（`statSync().isFile()` 一行可收緊,
  後續順手批）。
- baseline EOF 雙換行是 patch 類工具的 canary 地雷（G1 會機械攔阻,
  屬已知陷阱備忘）。
- E-5（discoveryMapController 6 筆）派工單須明寫：
  `sessionController.ts:364` 是 `getPlayerGroups: playerGroups` 改名
  傳入（非 shorthand）;`DiscoveryMapDependencies` 另有
  `discoveryPollIntervalMs?`／`mapTools?` 帶預設 optional——皆非越界。

## Ledger 追加（本紀錄即 acceptanceDoc）

`ebf46214044c39a47782e9fbb01a152a`／`1957d00e0e6a2cb919662ff63d65c0c4`／
`df2cdcfc865e2bfed69286f2c866996f`／`bcb22c134f491515ce57c49fe82f1c8a`
（`src/controller/mySessionsController.ts`，batch "E-4"）。重生後
manifest=240 findings／26 files／sessionController 63;scope gate 首次
驗 mySessionsController cleared＋error。

## 量化更新

- `unbound-method`：244→**240**／27→**26** 檔;scoped 上線檔=
  `mySessionsController.ts`＋`map.ts`;controller-callback-port 79→75。
- bundle／unit 346／mock 298／local 45 基準不變。
