# 批 6A 驗收紀錄（value leaf 四檔 TS 化・樣板批）

- 日期：2026-08-27。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-27-batch6A-leaf-ts.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-27-batch6A-leaf-ts-report-codex.md`。
- 驗收方法：本機重跑完整 gate＋四檔逐字 diff 審閱＋strict 探針 ×4 親自複跑＋
  importer byte 級驗證＋repo 全域反掃＋對立審查 agent（七攻擊面）。

## 結論：**ACCEPTED**——樣板批四紀律成立，6B 可依此開工

## 通過項（全部本機重驗）

1. **annotation-only 三重自證** [已驗證]：
   - 四檔新舊版逐字對照：僅新增型別註記／interface／`as`／`!`（皆可擦除）；
   - 25 個 importer 以「working tree 反向替換 `.ts`→`.js` 後與 HEAD `cmp`」
     byte 級驗證，全數只差副檔名字串；
   - production build 的 main chunk hash（`index-CHyqLqM4.js`）與 6-pre 基準
     **完全相同**——emit 產物 byte 級一致，是最強的零行為變更證據。
2. **strict 納入探針 ×4 親自複跑** [已驗證]：四檔各加 `number = "x"` 探針→
   `tsc` 指名該檔紅（exit 2）→byte-identical 還原（`cmp` 過）→綠。
3. **反掃** [已驗證]：src＋tests 舊路徑歸零；另做派工單以外的 **repo 全域掃**
   （scripts／.github／public／supabase／.claude／index.html／vite.config，
   排除 docs 與 node_modules）零殘留；`window.__importAppModule` 110 不變，
   四名零使用故 appRuntime 不加映射（正確）。
4. **Gate 全綠**：typecheck／lint／prettier／build／check:production-bundle
   （四項 byte 指標淨 0 B，total gzip 餘 1,428 B 未動）／unit 346／
   mock 298 passed／4 skipped（54.6s）／local 2＋45 passed／11 skipped／
   `git diff --check` 全 exit 0。
5. **對立審查 agent 七攻擊面全 PASS**：importer 盲區、型別謊言（`profile!`／
   `lat1!` 均在等價 null guard 之後）、profile 門檻語意、taipeiTime 時區語意、
   測試斷言零弱化、回報數字獨立重算全對帳（含 taipeiTime 探針 sha256 逐字元
   相符）、tsconfig include 涵蓋。config.ts 的 `ImportMetaEnv` 帶 index
   signature（`any`），`{}` fallback 不構成型別謊言——Vite 既有型別設計，
   非本批引入。

## 事件紀錄（驗收過程，非 Codex 問題）

- **mock 三輪紅→定案為平行負載暫態** [已驗證]：驗收方前三輪 test:mock 與
  對立審查 agent 在同 repo 平行跑 build／unit／mock 的窗口重疊（load 15+，
  兩套 Playwright 各 4 workers），失敗全為「element is not stable」／30s
  timeout 型且每輪集合不同；期間另清除一個前輪洩漏、佔住 port 5174 的孤兒
  vite webServer（母 Playwright 程序已死）。負載清空後全套 298 綠（54.6s
  恢復正常時長；紅輪皆 1.2m+），四條重複紅測試 `--repeat-each=3` 取樣
  24/24 綠。Codex 與對立審查 agent 的獨立 mock 各自全綠。
- 教訓：**對立審查 agent 與本機 gate 不可同時跑**——agent 會自行重跑
  build／test 造成互相污染；後續批次改為「gate 先跑完，或 agent 限唯讀指令」。

## 偏差核可（一項）

- `sessionCriteria` 既有 `// eslint-disable-line no-extra-boolean-cast` 移除：
  派工單原則是既存 suppression 保留，但 `.ts` ruleset（typeChecked extends）
  不含 core `js.configs.recommended`，該規則不適用→留下會成 unused disable
  directive warning（對立審查實測重現）。註解行無 runtime token，核可。

## 覆蓋債（記入，批 6 後續判斷）

- `config`：多數常數（`LAUNCH_CITY`／`MAP_CENTER`／`SUPPORT_EMAIL` 等）僅
  integration consumer 覆蓋，無逐 export literal oracle。
- `taipeiTime`：`TAIPEI_UTC_OFFSET_MS` 無獨立 literal assertion（由雙向轉換
  間接載重）。
- `profile`：`validProfileNtrp` 無獨立測試（由 formatter／eligibility 邊界
  全程間接使用）。

## 6B 設計輸入（採納 Codex 五問之 5）

順序 `requestGate`→`sessionIntent`→`filters`，逐檔獨立探針與 consumer
matrix；timer 用 `ReturnType<typeof setInterval>`；`sessionIntent` 保留
exact-key fail-closed 與 sessionId safe-integer 規則不得為型別方便放寬；
`filters` 以 `satisfies` 固定 `BANDS`／`DEFAULT_FILTER_STATE`。
