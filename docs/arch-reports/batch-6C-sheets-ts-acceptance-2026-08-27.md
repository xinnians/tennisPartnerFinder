# 批 6C 驗收紀錄（surface contract leaf＋`sheets.ts` 機械轉換）

- 日期：2026-08-27。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-27-batch6C-sheets-ts.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-27-batch6C-sheets-ts-report-codex.md`。
- 驗收方法：本機重跑完整 gate＋獨立型別擦除 token 對帳＋strict 探針 ×2 親自
  複跑＋port 4 人工核對＋importer byte 級驗證＋唯讀對立審查 agent（七攻擊面，
  與 gate 平行、零污染）。

## 結論：**ACCEPTED**

## 核可例外（本批唯一 runtime token 差異，事前裁決）

- `.ts` ruleset 經 typescript-eslint `eslint-recommended-raw:41` 開啟
  `prefer-const`（error），對 declare-then-assign 必報——驗收方以探針檔重現
  [已驗證]。suppression／改 config 皆違紅線，`= null` 初始化會改型別再加一個
  token 差異。
- 核可形式：刪 `let surfaceEntry;` 行、賦值行改
  `const surfaceEntry = { close, onEscape, restoreFocus: previousFocus, surface };`
  （`sheets.ts:117`）。安全前提 [已驗證]：宣告至賦值間（含完整
  `registerUnmount`／`close` 閉包）零 `surfaceEntry` 引用（HEAD 40–77 行
  grep 無輸出），首次讀取在合併行之後，無 TDZ／語意風險。
- 對帳 [已驗證]：驗收方獨立 esbuild 擦除比對，raw=false；只做「刪該 let 行＋
  該賦值加 const」單一正規化後**逐 byte 全等**——其餘 token 零差異。
  bundle main −2 raw／−4 gzip 與此相符。

## 通過項（全部本機重驗）

1. **contract leaf** [已驗證]：`src/surfaceContracts.ts` 純型別、emit 0 bytes
   （esbuild 擦除實測）；四 port 與兩端實況逐欄位相符（對立審查：與
   SurfaceHost 未 export 的同名 interface 逐字相同）。
2. **port 4 人工核對** [已驗證]（無 strict 覆蓋的唯一接縫）：
   `App.tsx:674` 實作參數更寬（optional，逆變安全）、回傳
   `SurfaceContentLifecycle` 為 `{unmount}` 超集；`sessionViews.js:243`
   wiring 未被本批觸碰。
3. **strict 探針 ×2 親自複跑** [已驗證]：紅指名（surfaceContracts:54／
   sheets:188）→byte-identical 還原→綠。
4. **E 群四 anchor** [已驗證]:於 `sheets.ts` 各唯一（:88／:95／:102／:127），
   `unmountContent` index 先於 `shell.unmount`；targeted
   lifecycle＋sheets-dom 22/22 綠（同時證 Node 直接 import `.ts`）。
5. **Gate 全綠一次過**：typecheck／lint／prettier／build／bundle
   （main 638,937/187,466；total 841,561/257,627；total gzip 餘 **1,435 B**，
   本批 +7 B 回收）／unit 346／mock 298/4／local 2/2＋45/11（無 reset）／
   `git diff --check`／反掃 src＋tests 與 repo 全域歸零（含
   react-migration.md frontmatter paths 與 CLAUDE.md:62 機制性同步）／
   `__importAppModule` 110。
6. **對立審查（唯讀）七攻擊面全 PASS**：close 十步、五則錯誤訊息、
   `as Error`／`!` 純擦除、mount-time 綁定、sheets-dom query 隔離未動、
   回報六項抽查誠實。其「短暫讀到探針殘留」為驗收方平行跑探針的讀取競態，
   最終檔兩度獨立確認乾淨＋cmp byte-identical，非交付物問題。

## 覆蓋債（記入）

- port 4（login modal content contract）依賴人工核對；`sessionViews.js`
  TS 化（暫不轉清單）前無 strict 交叉檢查。
- `openLoginModal` 無 Node DOM-free 直接呼叫 oracle（模組可載入＋e2e journey
  間接守）。

## 6D 設計輸入（採納 Codex §9.5）

facade 視為 typed forwarding surface：`DataApi = ReturnType<typeof
createDataApi>`＋`Parameters<...>` 推導，不手寫會漂移的模型；先凍
`createDataApi` options／lazy `privateDataApiLoader` 重試語意／public+private
method keys／`SESSION_ACTION_CODES` 與三個 error class identity；
`save_my_profile` 的 `p_line_id: null` 凍結呼叫點沿用 contextual `T | null`
widening 表達，不可改空字串、刪欄位或動 generated type；依賴方向=facade
type-import repository，不可反向。
