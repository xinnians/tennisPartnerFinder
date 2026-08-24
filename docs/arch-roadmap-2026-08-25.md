# 整體路線圖（2026-08-25 拍板）

- 背景：前端架構優化管線批 0–2 全部 ACCEPTED（收錄至 `04543bf`）；F0-6＋F0-4＋
  文件批 D 已發（`870a016`，codex 執行中）。qiuka.tw 仍在跑 pre-React 舊版；
  REL checklist 剩 REL-10（穩定 preview 人工 QA）與 REL-11（QA fixtures 清理）。
- 本檔記錄 2026-08-25 使用者拍板的整體順序；各批開工時另發派工單，
  驗收協定沿用 `docs/arch-dispatch-2026-08-22-frontend.md`。

## 拍板紀錄（2026-08-25）

1. **順序：現在就上線**——先 push＋REL 讓批 0–2 成果上 production，
   加固項（Sentry 等）上線後第一批補。
2. **批 3 切兩張**：3A（F3-0 規則修訂＋F3-1 導覽＋F3-3 啟動編排）→
   3B（F3-2 殼遷入 AppShell＋glob 橋接退役）。
3. **收尾批全排入**：地圖批、bundle 拆分（批 3 後）、長列表節流（DB 半批另立）、
   守門收尾。
4. **種子供給（REL-12）先擱置**，發布時機另議；桌面雙欄維持「先查 analytics 再議」。

## 階段 0：上線（使用者執行，非派工）

依序，**push 後等 CI 綠才 merge main**：

1. push 開發分支（origin 目前停 `0be31a2`，之後 60+ commit 首次上 CI——
   紅了先修再前進）。
2. REL-10：穩定 preview 人工 QA（390px 慢網路、鍵盤焦點走查、
   support／privacy 連結實點）。
3. REL-11：清 QA fixtures；順帶補驗 REL-6 當時未重跑的「取消球局」流程。
4. merge main → push → qiuka.tw 換版。
5. 換版後小 QA：OAuth 兩帳號、推播（origin 綁定，換域後需重新授權）、地圖；
   Supabase Site URL 切 `https://qiuka.tw`（OPS-4）、Maps referrer 實測（OPS-5）。
6. 雜項核實：`npx supabase migration list` 實查 006–008 對齊
  （memory 記錄自相矛盾，OPS-10）；hosted 備份檔搬離 scratchpad（OPS-11）。
7. 回滾路徑：Vercel 可即時 rollback 至前一 deployment。

期間 F0-6＋F0-4＋文件批 D（已發）照常驗收，完成即併入後續部署。

## 階段 1：加固批（上線後第一批派工）

- F4-6 Sentry 錯誤監控（已拍板廠商；dynamic import、beforeSend 三欄 allowlist）
- F4-8 拔除 `__tennisE2ETestHooks` 出貨路徑（production define＋bundle canary）
- F4-2 AdvancedMarker 遷移＋Maps 版本釘選 quarterly（deprecated＋v=weekly 風險）

三項都直接服務線上穩定性；上線後盡快縮短無監控空窗。

## 階段 2：批 3A——導覽與啟動（F3-0 → F3-1 → F3-3）

F3-0 規則修訂先行（嚴守範圍：只放寬 surface stack 歸屬與 AppShell 接管區
DOM 凍結，**testid 凍結不動**）；F3-1 導覽狀態機＋hash 深連結；
F3-3 啟動編排顯式化。

## 階段 3：批 3B——殼遷入 AppShell（F3-2）

topbar／popover／底部導覽／toast／login modal 遷 React；
`import.meta.glob` 三橋退役；同步 commit 邊界不得擴張。

## 階段 4：地圖批（F4-1＋F4-9＋F4-4）

marker diff（不再每 60 秒全拆重建）＋map/pins TS 化＋pin 色票單一 token 來源。
同檔案區域合批省驗收；建立在階段 1 已換的 AdvancedMarker 之上。

## 階段 5：bundle 拆分（F4-3，必須在 3B 之後）

visualizer 出報告 → 未登入不載入私人功能 chunk → gate 基線更新。
排在殼遷移後，避免拆分成果被 3B 攪動。

## 階段 6：長列表節流（F4-7，切兩半）

- 前端半批：`content-visibility: auto`＋intrinsic size。
- DB 半批（另發、獨立驗收）：`session_message_feed` 等四個查詢面的
  limit／分頁，動 view 契約與 pgTAP。

## 彈性批：守門收尾（F0-7＋F0-8＋F4-10）

無依賴，可插在任何階段之間當緩衝批。

## 主要失敗風險與預防

1. **CI 首跑紅**（60+ commit 首次上 CI，環境差異如 node 版本）：
   push→CI 綠→才 merge main 是硬順序；F0-6 落地 engines 後此風險長期收斂。
2. **換版後 hosted 環境差異**（Site URL、referrer、推播 origin）：
   階段 0 第 5 步逐項小 QA；rollback 路徑先確認。
3. **上線初期無錯誤監控**（拍板接受的取捨）：階段 1 排最前縮短空窗。
4. **批 3 規則解凍削弱驗收武器**：F3-0 範圍限制寫死；3B 獨立成批、
   GOLDEN／testid 凍結照舊。
5. **白箱直呼耦合持續增長**（實測已 140 處，文件舊數 138）：批 3 不解此題；
   終局（改寫直呼點）不在本輪任何批次，列為長期債。

## 不做／擱置（本輪確認）

- 種子供給（REL-12）：擱置，發布前另議。
- TanStack Query／React Router／Redux／CSS @layer／SSR：維持既有「不做」裁決。
- 桌面雙欄：待 analytics 裝置比例。
