# 批 0（F0-1／F0-2／F0-3／F0-5）驗收紀錄

- 驗收日期：2026-08-22　驗收者：Claude
- 派工單：`docs/arch-dispatch-2026-08-22-frontend.md`
- 回報：`docs/arch-dispatch-2026-08-22-frontend-execution-report-codex.md`
- 驗收範圍：基準 `1f0979a` → 實作 HEAD `7d1fb66`（7 個 commit）

## 結論：**ACCEPTED**（四項全過，零退件事項）

## 驗收方法與結果

依派工單「驗收協定」執行，全部獨立重跑、不採信回報貼文：

1. **完整 CI 重跑** [已驗證]：`npm run test:ci:frontend` exit 0；Playwright 266 passed／
   4 skipped、bundle gate main chunk 639827/184520 bytes——與回報 §7.3 逐字吻合。
2. **回報指令逐條重跑** [已驗證]：§10 全部指令（歷史 commit 的 git grep、最終 grep、
   三個 node --test、lint／prettier／typecheck）輸出與回報一致，9/9 PASS。
3. **「純 formatting」聲稱** [已驗證]：commit `406bc4d` 實際觸及恰 29 檔與回報清單一致；
   29/29 逐檔以「父 commit 內容套 Prettier」byte 級比對重現，零差異。
4. **「不改語意」聲稱** [已驗證]：`785c58c` 對表列檔案只新增 eslint-disable 註解行；
   `15d2c41` 僅 eslint.config.js＋兩處 void（MePage、PlayerCardSheet，無 await／
   catch／finally 變更）；`7d1fb66` 僅 curated re-export 與 import 來源切換（同一
   binding）。11/11 PASS。
5. **引用正確性抽查** [已驗證]：29 筆 JS lint disable（檔案:行號＋規則＋繁中理由）、
   9 個暫關 type-aware 規則（eslint.config.js:62-78）、5 個 type-only 逐行白名單、
   ci-config 新自檢、presentation 契約案例——逐筆核對無一虛列。
6. **紅線掃描** [已驗證]：全 diff 無 LINE／隱私面觸碰；happy-dom 在 devDependencies、
   零新增 runtime dependency；單一 createRoot 不變；`.from(`/`.rpc(` 仍僅存在
   data 層兩檔；新測試 import 真實 src 模組、無永真斷言。
7. **守門有牙（驗收方自造 canary，非採信回報）** [已驗證]：
   - 調換 sheets.js 卸載／清殼順序 → `tests/sheets-dom.test.js` 4 pass／2 fail（紅）。
   - floating promise → `@typescript-eslint/no-floating-promises` error。
   - 靜態 import supabaseClient → `no-restricted-imports` error。
   - 動態 import 資料層 → `no-restricted-syntax` error。
   - type-only 新消費者 import mapper → `no-restricted-imports` error（白名單 fail-closed）。
   - 未格式化 .js → prettier:check 變紅。
   全部 canary 事後還原，`git status` 乾淨。

## 附帶紀錄

- [不確定→接受] `npm run test:local` 因 Docker daemon 未啟動而未跑（codex 誠實揭露，
  非測試失敗）。批 0 無 migration、runtime 變更極小且 mock e2e 全綠；**下次 REL 前
  必須補跑 local suite**，列入 release checklist 前置。
- 遺留的 9 個暫關 type-aware 規則（合計 117 個既有 finding）與 29 個 JS lint disable
  是已登記的型別債清單，屬批 2 TS 化的自然素材，不構成本批退件事由。
- codex 對 reviewer 的一次技術性 pushback（MessagesPage DOM test 不加 click，
  依派工原文範圍）判定合理。

## 對後續批次的影響

- F0-4、F0-6 尚未執行，仍可獨立指派；F0-2 完成使 F0-4 的三份複本只剩兩份。
- 批 1 前置（F0-1 DOM 單元層）已就緒；F4-1／F4-2／F4-4／F4-6 隨時可派。
