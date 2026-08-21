# 驗收協定（Claude 執行；對 Codex 透明公開）

Codex 完成交還後，Claude 依本檔驗收。寫在這裡是讓實作方預先知道會被如何檢查；
符合本檔不代表免驗，Codex 自跑的 gate 數字一律只當參考。

## 每批驗收步驟

1. `git log --oneline` 對照批次清單：一批一 commit、訊息格式正確、無跨批混雜
   （抽查 `git show --stat` 的檔案集合是否屬於該批白名單）。
2. **獨立重跑該批 gate**（完整組或該批縮減組），數字與回報檔逐字核對；不符即退件。
3. 執行該批驗收條件中的反向 grep，與回報檔輸出比對。
4. diff 超過 400 行的批次，加派 fresh read-back agent 對驗收條件逐項 PASS／FAIL
   （要求引用檔內原文，防空殼宣稱）。
5. 涵蓋／遷移類驗收看對稱性論證表，不接受列舉式證明。
6. 回報檔內所有數字必須可由指令重現；重現不了的數字視同未提供。

## 全管線終驗（全部批次完成後）

對照 2026-08-21 基線重跑複核指令：

```bash
# 型別覆蓋推進
for ext in js ts tsx; do rg --files src -g "*.${ext}" -0 | xargs -0 wc -l | tail -1; done
# 邊界不變量
rg -n '\.rpc\(' src
rg -n 'p_line_id' src
rg -n "sessionViews" src --glob '*.tsx'
# 收斂量化（D/E 批目標）
rg -c 'createRoot\(' src
rg -n 'flushSync\(' src --glob '*.tsx' | wc -l
rg -n '^let ' src/main.js | wc -l
rg -c 'eager: true' src/sessionViews.js
# 完整 gate
npm run typecheck && npm run lint && npm run prettier:check
npm run test:session-unit && npm run test:mock && npm run test:local
npm run build && npm run check:production-bundle
git diff --check
```

基線（供比對）：js 9,406 行／ts+tsx 6,947 行；18 root；30 flushSync；33 let；
18 eager glob；主 chunk 714.34 kB（gzip 200.64 kB）；Chromium 266P/4S；
WebKit 126P/6F/3S（不得劣化）；pgTAP 799（零 migration，不應變動）。

另抽驗：bundle gate 三拍證據可重現；`npm run db:gen-types` 重跑 diff 為空；
隱私紅線 sweep（LINE、匿名面欄位）與 `check:production-bundle` 綠。

## 退件流程

- 不過 → 附失敗軌跡與最小重現指令退回該批；同一批連兩次不過即停下重診斷，不無限重派。
- 驗收通過的批次不回頭重驗，除非後續批次觸及同一契約。
