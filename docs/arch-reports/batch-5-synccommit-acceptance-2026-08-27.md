# 批 5 驗收紀錄（`syncCommit` 條件式退役審計）

- 日期：2026-08-27。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-27-batch5-synccommit.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-27-batch5-synccommit-report-codex.md`；殘留理由書：
  `docs/arch-reports/batch-5-synccommit-retention-2026-08-27.md`。
- 驗收方法：本機重跑全套 gate＋production diff 審閱＋對立審查 agent（三個殘留點
  移除即紅複跑＋兩個移除點判別力探針補測＋審計掃描完整性查核），對立審查報告：
  `docs/arch-reports/batch-5-adversarial-2026-08-27.md`。

## 結論：**ACCEPTED**——caller files 維持 2（皆載重）、SurfaceHost 同步點 6→4

批 5 的產出不是歸零而是**證據**：兩個 caller 檔與四個保留呼叫點全部附「移除即紅」
原始 oracle 實證；兩個移除點附「延後窗口可觀測但無人觀測」的探針實證。
沒有為了數字弱化任何同步邊界或 oracle。

## 通過項（全部本機重驗或對立審查實證）

1. **Gate 全綠一次過** [已驗證]：typecheck／lint／prettier／build／bundle／
   `git diff --check` exit 0；unit 346、mock 298／4、local 45／11（無污染、
   無偶發）。
2. **caller A（`sessionStore.ts:102`）保留有據** [已驗證，對立審查複跑]：
   mutation→`performance.spec.js:416`（stale opening focus race）3/3 紅→
   SHA 還原→綠。審計並實證了派工單預判的假綠情境：`react-page-focus` 10 輪＋
   四頁 dom unit 在 mutation 下全綠（harness 自帶 flush＋重試型斷言遮蔽），
   真 consumer 在 same-stack drawer focus race——「focused green 不足以批准
   移除」由本批實例確立。
3. **SurfaceHost 四保留點各有紅證據** [已驗證，抽三複跑]：shell mount→
   sheets-dom 0/16；shell unmount→8/16；`commit(update)`→
   `map-and-bootstrap:377` decision identity（desktop＋mobile,完整 mock 才咬到
   ——第二個假綠實例）；content render→discovery e2e＋player-card unit。
4. **兩移除點獨立判定成立** [已驗證，對立審查最重項]：mount-failure cleanup
   （throw 前無 observer,下次 mount 保留 flush 自癒）與 content-unmount 獨立
   flush（slot 非同步 delete 後同 stack 立即進保留的 shell flush;`.unmount()`
   全消費者 15＋1 處列舉皆走 close chain）;探針＋控制組證明延後窗口
   「可觀測但無人觀測」,unmount-once oracle 為 flush 無關的 hook 計數不受影響。
5. **審計掃描完整性** [已驗證]：全庫寬鬆 `\.emit\(` 比對僅多一筆 doc comment;
   controller 層零 DOM 觸碰、features 零 store 寫入,無漏網類別。
6. **理由書品質** [已驗證]：七點皆含同步觀察點行號＋紅證據引用＋缺少的
   handshake＋未來退役條件（兩處行號小瑕由對立審查勘正,不影響結論）。
7. **凍結面** [已驗證]：diff 恰 2 src/tests 檔;lifecycle 唯一 diff＝`:94` 標題
   髒點修正（"three approved callers"→"approved callers"）;`:109`／`:114`／
   `SYNC_COMMIT` 常數／三 harness fixtures 零 diff;A 群兩字面由真實保留呼叫
   背書;凍結 e2e／views／sheets 零 diff;`__importAppModule` 110;
   `line_id|session_contacts` 與基準相同。

## 程序註記

對立審查揭露其執行中一條指令鏈誤含 `git stash`,當下 `git stash pop` 還原並以
cmp 取證無損,後續凍結檢查均在還原後重跑——處置正確,記錄留痕。

## Bundle

main gzip 187,470（+8 B，餘 4,950 B）；total gzip **257,634（+37 B，
餘 1,428 B）**。批 5 淨變動近零（移除兩個 flush、註解改寫）。批 6 開單續列
硬約束；若逼近 gate 走 Q6 重編程序。

## 批 6 前置（Codex 回報 §9.5 建議，採納入批 6 規劃）

1. TS 化順序：contract leaf 先行（避免 bridge 變 runtime circular import）→
   `sheets.ts` 機械轉換（不拆 ownership）→按責任逐 edge 拆檔。
2. **兩處零餘裕下限前置小批**（Q3 既列）：`content-visibility-contract.test.js:57`
   `>=13` 改 manifest 對帳＋漏掃 canary；`legacy-style-scan.test.js:43`
   `>100 bytes` 改「可讀、非空、在掃描範圍」＋空檔 canary——否則 TS 拆小檔
   會被裸數字卡住。
3. 保留的同步邊界留在 SurfaceHost；若批 6 後要改 facade async shape，另立
   明確 migration 批。

## 量化更新（新基準）

- `syncCommit`：helper＋2 caller 檔（皆有載重證據）;SurfaceHost 同步呼叫點
  **4**（shell mount／shell unmount／imperative update／content render）。
- main gzip 187,470（餘 4,950 B）;total 257,634（餘 1,428 B）;unit 346;
  mock 298／4;`__importAppModule` 110。
- 審計紀律升級（本批教訓,由兩次實例確立）：**shared synchronous boundary 的
  退役判定必須跑完整原始 consumer matrix,focused green 不算數**。
