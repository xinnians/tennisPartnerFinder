# 交還驗收判定（2026-08-21，批 A–C5＋C6 BLOCKED）

驗收方：Claude。範圍：commit `60af1f4`（批 A）至 `69ecc95`（C6 BLOCKED 回報）共 12 commit。

## 總判定

**A、B1、B2、B3a、B3b、B4、C1–C5 全部 ACCEPTED；C6 BLOCKED 成立，由
`06b-batch-C6R-notifications.md` 取代。** 可繼續 C6R → D → E。

## Gate 獨立重跑（Codex 數字只作參考）

- typecheck、lint、prettier:check、test:session-unit 276/276、test:mock Chromium 266
  passed、build、check:production-bundle、`git diff --check`：全綠。
- `test:local` 首跑紅：`session.spec.js:686` 於 fixture 前置
  「the court scan must find two unused Taipei courts」得 0。診斷為**本機 DB 累積污染**，
  非程式回歸——實測 local DB 有 399 筆存活 `session_discovery`（open 297＋full 130），
  61 座台北 active 球場經 `court_id`＋`candidate_court_ids` 全數佔用（11 批反覆跑
  `test:local` 未 reset 的累積）。guarded reset 後重跑：local API 2 passed、
  supabase-chromium 42 passed／11 skipped、supabase-mobile-chromium 6 passed，全綠。
  紅→reset→綠完成因果驗證。00-overview 紅線第 8 條已補此情境的明示授權。

## 靜態驗收（14 個獨立 agent＋C5 補驗）

- 11 批全 PASS：白名單零越界（B2 有一處註解字樣微幅超出字面白名單，已揭露、無 runtime
  影響，判可接受）；回報數字抽驗全部與指令重跑一致，無造假；C 批搬移抽驗（每批 3 函式
  新舊本體比對）皆為「搬移＋補型別」非重寫；controller 2,480→2,119 行、
  `main.js`／`sessionViews.js` 各批 diff 為空皆證實。
- 待補正（非阻擋）：`batch-C4.md` 的 `setAuthState` 呼叫點枚舉漏列 `main.js:1391`
  （程式本身無誤，屬回報遺漏），待 Codex 下輪補正。
- 跨批掃描：資料邊界（`.rpc`／supabase `.from` 全落在 facade＋`src/data/**`）、
  `p_line_id: null` 凍結、TSX 反向 import 歸零、migrations／supabase tests／courts.json
  零變更、tsconfig 三值未動：全 PASS。
- 測試完整性：整段區間 tests/ 僅 B1 動過一處（+9/−1）——`databaseTypes.ts` 因忠實列出
  凍結中的 `line_id` 欄位而觸發隱私掃描，新增精確單檔排除＋generated 檔頭補償斷言；
  驗收方親讀 diff 判合規，掃描集非空斷言保留。建議後續補強為「該檔僅含型別宣告」斷言。
- 型別逃逸觀察（WARN，非阻擋）：新 TS 檔含 56 處 `as`、6 處 `!`，集中在 data
  mapper／repository 的 DB 邊界轉換，屬預期寫法；未來可評估以 runtime schema 驗證取代。

## C6 BLOCKED 裁決

BLOCKED 正確且盤點誠實 [已驗證]：六個通知 use case 全在 `main.js`
（335／859／886／904／935／953 行逐字命中），controller 零命中。這是派工方（Claude）
的歸屬錯誤。處置：採 Codex 建議方案 1，新派工檔 `06b-batch-C6R-notifications.md`
改抽 `main.js` 通知責任，行數判準改量 `main.js`。
