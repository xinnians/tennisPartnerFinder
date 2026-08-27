# 批 6E 驗收紀錄（`sessionController.ts` 組裝層機械轉換）

- 日期：2026-08-27。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-27-batch6E-controller-ts.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-27-batch6E-controller-ts-report-codex.md`。
- 驗收方法：本機重跑完整 gate＋獨立擦除 token 對帳＋strict／橋探針親自複跑＋
  importer byte 級驗證＋唯讀對立審查 agent（26 hunks 逐段 diff）。

## 結論：**ACCEPTED**——批 6 最大單檔（711 行）零 runtime token 例外完成

## 通過項（全部本機重驗）

1. **annotation-only 無例外** [已驗證]：驗收方獨立 esbuild 擦除比對 HEAD，
   raw 逐 byte 全等；production chunk hash 不變，bundle 四項淨 0 B（total
   gzip 餘 1,435 B）。711 行全檔 lint 掃描零 `prefer-const` 類衝突（風險
   預期落空，無需裁決）。
2. **探針 ×2 親自複跑** [已驗證]：strict 紅指名（:843）；**橋有牙探針**
   （factory 回傳 `retryDiscovery` 改名）→ `controllerApiContract.ts`
   三重紅（missing＋extra＋return 結構檢查）→ byte-identical 還原綠——
   證明改名後 `ReturnType` 雙向 exact-key 橋仍載重。factory 回傳未標
   `: ControllerApi`（防 extra-key 提前抹除）[已驗證]。
3. **型別設計如實** [已驗證]：`SessionControllerOptions` 27 成員全 optional
   預設保留；subcontroller 接縫用 `Parameters<typeof createX>[0]` 推導；
   `SessionControllerDataPort`＝六路 `["api"]` 交集＋3 個檔內 optional
   method；`api!` ×6 組裝點皆對應原 shorthand 傳遞，無新 guard／fallback。
4. **shorthand 展開方法論裁定** [已驗證]：6 處 `api,`→`api: api!,` 是
   source 層語法展開；驗收方隔離實測 esbuild 擦除 `{api: api!}` 輸出即
   `{api}`，與 shorthand 逐 byte 相同——擦除對帳 oracle 成立，JS 語意
   `{api}` ≡ `{api: api}` 零差；對立審查的方法論疑慮關閉。
5. **JSDoc 5 anchor 全轉換** [已驗證]：`@type|@returns` 反掃歸零；敘述性
   註解抽查逐字保留。`:574` 預裁決精確執行（刪 suppression 註解＋
   `boolean | void` annotation，擦除後 `let reloaded=false` 原樣；`.ts`
   lint 綠證明規則不適用）。
6. **解凍面精確** [已驗證]：12 檔恰為解凍清單；5 importer＋9 註解字面
   byte 級僅副檔名；appRuntime 恰一鍵；七 subcontroller／surfaceRegistry／
   sessionStore／domainTypes／tsconfig／eslint／package 零 diff；
   `.claude/worktrees` 未觸碰。
7. **Gate 全綠一次過**：typecheck／lint／prettier／build／bundle／unit 346／
   mock 298/4／local 2/2＋45/11（無 reset）／`git diff --check`／反掃兩條
   全零／`__importAppModule` 110。
8. **對立審查（唯讀）六角度全 PASS**（兩項 [不確定] 均由驗收方實測關閉：
   shorthand 擦除、sha256 由親自 cmp byte-identical 取代）。

## 覆蓋債（記入）

- 未啟用 branch-coverage instrumentation：tolerant default／catch 分支無
  逐一專屬 case（由 token 全等＋116/1/3 controller unit＋mock/local 疊加守）。
- `api.loadSessionSummary` 型別歸屬於六路交集（呼叫點有 `typeof` 防禦，
  runtime 不受影響）。

## 6F 設計輸入（採納 Codex §11.5）

- 順序：`presenceFeature.js`（101 行，tracker 型別由
  `createPresenceTracker` 回傳推導）→`profileOrchestrationFeature.js`
  （261 行，重用 `ControllerAuthSession`／`ControllerProfileEligibility`／
  `ControllerApi`；dependencies 建 tolerant port 不反推巨型 interface）。
- **type-aware 9 條恢復不可一次全開**（實掃現況 325 findings）：批序＝
  no-unsafe-argument(2)/call(5)/return(8) 小批→redundant(9)/assertion(10)
  純型別批→assignment(12)/member-access(25) 資料邊界批→base-to-string(8)
  UI policy 批→**unbound-method(246) 專批**（需先分類 this-sensitive vs
  false-positive，不可機械 bind）。此拆批方案需回 roadmap 拍板——6F 範圍
  可能要縮為「兩 feature 檔＋恢復拆批方案落檔」，規則恢復另立批。
- 殘餘 `.js` 盤點：留待後續批＝`main.js`／`sessionViews.js`＋views／
  `mockData*`／`supabaseClient.js`；可隨相鄰小批轉＝`playerPresence`／
  `notificationPush`／`meFocus`／`sessionRoute`／`focusableSelector`／
  `util`／`modalIsolation`／`shareFeature`／`filterToolbarFeature`。
