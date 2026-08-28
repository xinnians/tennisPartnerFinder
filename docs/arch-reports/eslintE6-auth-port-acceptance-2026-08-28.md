# ESLint 恢復 Phase E-6 驗收紀錄（auth controller ports 12 筆）

- 日期：2026-08-28。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-28-eslintE6-auth-port.md`；Codex
  回報：`docs/arch-dispatch-2026-08-28-eslintE6-auth-port-report-codex.md`。
- 驗收方法：本機重跑完整 gate（含 test:local）＋親自複跑紅簽章／lint
  canary 三拍／erased-token＋唯讀對立審查 agent（opus，五面＋E-7
  凍結清單複算）。紅簽章模板第三輪。

## 結論：**ACCEPTED**

## 通過項（全部本機重驗）

1. **紅簽章十四條逐字複現** [已驗證]：missing×12 依表序＋234/222＋
   25/24;manifest／ledger SHA 維持 HEAD。
2. **規則有牙三拍** [已驗證]（親自複跑）：lint 綠→暫退十二行恰紅 12
   筆於 `:58-:72`（預測行號全中）→精確 Edit 還原 SHA `641c2fce…f7a7`
   逐字一致→綠。
3. **erased-token 全等** [已驗證]：3,984 bytes、SHA `344d7cdf…dfeb`
   （對立審查獨立複算同值）;bundle 淨 0 B。
4. **零越界含 `:73-77` 地雷**（對立審查交叉反證）：三個 inline 回傳
   型別 method signature 的 declaration 在 authController、finding 記在
   `sessionController.ts:468`——若越界,紅簽章必多條目且 63→60;實跑
   恰 14 條、無 sessionController 條目。diff --stat 恰 12/12。
5. **selector 精確不外溢**（`--print-config` 六檔矩陣）:auth/
   discoveryMap/map error,chat/playerDirectory/sessionController off。
6. **回報防偽全中**:七個 SHA、紅簽章順序、erased 數字全由對立審查
   獨立重算;§7 的「mock 執行中補充命令被 port 5174 拒絕」事件經
   playwright.config `reuseExistingServer:false` 核實為觀測面自招、
   如實揭露、無影響。
7. **Gate 9/9 全綠** [已驗證]:unit 346×2、mock 298/4、local API 2＋
   browser 45/11 首跑即綠、bundle 淨 0 B。

## E-7（playerDirectory 13 筆）派工輸入（對立審查凍結清單,已複算）

- 13 筆 stableId/member/finding 行/宣告行區間表=E-6 回報 §8.5（13/13
  複算全中）;**驗收條件改逐 stableId 三點對點**（宣告點/lint 點/
  generator 點）,不用行數自證——預期 17/17 非 12/12 且可能受
  prettier 重排偏移。
- **nested handler 10 筆凍結**（實際行號）:onOpenSession:51、
  onClose+onOpenPlayer **同在 :56（該行整行零 diff）**、
  onClose:64/onCreate:65/onInvite:66/onSeeDirectory:67、
  onClose:71/onOpenPlayer:72/onRetry:73。
- 非目標成員 6（api:45/playerCardGate:76/playerDirectoryGate:77/
  playerGate:78/store:82/surfaceRegistry:83）＋handler 內非 method
  property（courts:51,:62、myInvitableSessions:63）零 diff。
- **新傳播面（E-6 沒有的）**:`sessionController.ts:49` 別名＋
  `:110-113` 對四個**目標**成員的 indexed access——E-6 的 :124 是非
  目標成員,E-7 這四個是目標本身;consumer 全 `.js` 不進 checkJs,
  風險低但派工單必列並要求 typecheck 對點。
- 四個 forwarding arrows（:337/:344/:346 含 `as Promise<boolean> |
  void` cast/:350）原文保留;construction 唯一 `:331-351`,
  `api: api!` 在 `:332`。
- 紅簽章預期:missing×13＋`findings expected 222, received 209`＋
  `files expected 24, received 23`,共 15 條。

## Ledger 追加（本紀錄即 acceptanceDoc）

十二筆依 manifest 序：`e3756c71…`／`34da16e0…`／`9cf1a1bf…`／
`a04a92d2…`／`5a005b71…`／`cd3b31d4…`／`52c2ee79…`／`509f4bf0…`／
`862b5090…`／`eb8043a3…`／`4a2f858c…`／`5c3954bc…`
（`src/controller/authController.ts`，batch "E-6"）。重生後
manifest=222／24／63。

## 量化更新

- `unbound-method`：234→**222**／25→**24** 檔;上線 4 檔;
  controller-callback-port 69→57。
- bundle／unit 346／mock 298／local 45 基準不變。
