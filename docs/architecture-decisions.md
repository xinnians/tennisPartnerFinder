# 前端架構決策索引

更新日期：2026-08-24

本頁把五份歷史文件的 32 個決策條目收斂成可追溯索引。為保留原始脈絡，跨來源重複的
未盡事項仍各列一行；狀態只使用「生效」、「已翻案」、「已終結」。日期是原決策日期，
不是本索引整理日期。

| ID | 決策內容 | 狀態 | 日期 | 出處 |
| --- | --- | --- | --- | --- |
| MIG-01 | 桌面雙欄版面留在遷移 scope 之外，另開產品 track。 | 生效 | 2026-08-18 | [遷移計劃：明確不在 scope](frontend-migration-plan-2026-08-18.md#明確不在-scope另開-track) |
| MIG-02 | 篩選鈕固定留在遷移 scope 之外，另開產品 track。 | 生效 | 2026-08-18 | [遷移計劃：明確不在 scope](frontend-migration-plan-2026-08-18.md#明確不在-scope另開-track) |
| MIG-03 | 空狀態統一留在遷移 scope 之外，另開產品 track。 | 生效 | 2026-08-18 | [遷移計劃：明確不在 scope](frontend-migration-plan-2026-08-18.md#明確不在-scope另開-track) |
| MIG-04 | 86／94 文案清單留在遷移 scope 之外，另開產品 track。 | 生效 | 2026-08-18 | [遷移計劃：明確不在 scope](frontend-migration-plan-2026-08-18.md#明確不在-scope另開-track) |
| MIG-05 | 列表虛擬化留在遷移 scope 之外，另開產品 track。 | 生效 | 2026-08-18 | [遷移計劃：明確不在 scope](frontend-migration-plan-2026-08-18.md#明確不在-scope另開-track) |
| MIG-06 | 分頁狀態進 URL 留在遷移 scope 之外，另開產品 track。 | 生效 | 2026-08-18 | [遷移計劃：明確不在 scope](frontend-migration-plan-2026-08-18.md#明確不在-scope另開-track) |
| MIG-07 | 多城市／多運動擴充須先有產品與資料權限決策。 | 生效 | 2026-08-18 | [遷移計劃：明確不在 scope](frontend-migration-plan-2026-08-18.md#明確不在-scope另開-track) |
| OV-01 | 本機 `node_modules/node_modules` symlink 清理與 `npm ci` 不派工。 | 生效 | 2026-08-21 | [總覽：非派工項](arch-dispatch-2026-08-21/00-overview.md#非派工項你不做列此避免誤揀) |
| OV-02 | hosted preview 的 OAuth、Maps、Push、深連結與 390px 慢網路人工 QA 不派工。 | 生效 | 2026-08-21 | [總覽：非派工項](arch-dispatch-2026-08-21/00-overview.md#非派工項你不做列此避免誤揀) |
| OV-03 | CSP 從 Report-Only 切為 enforcing 不派工。 | 生效 | 2026-08-21 | [總覽：非派工項](arch-dispatch-2026-08-21/00-overview.md#非派工項你不做列此避免誤揀) |
| OV-04 | error transport 廠商選擇與接線不派工。 | 生效 | 2026-08-21 | [總覽：非派工項](arch-dispatch-2026-08-21/00-overview.md#非派工項你不做列此避免誤揀) |
| OV-05 | WebKit 六條差異的實機 Safari 分類不派工。 | 生效 | 2026-08-21 | [總覽：非派工項](arch-dispatch-2026-08-21/00-overview.md#非派工項你不做列此避免誤揀) |
| OV-06 | REL 與任何 push 不派工。 | 生效 | 2026-08-21 | [總覽：非派工項](arch-dispatch-2026-08-21/00-overview.md#非派工項你不做列此避免誤揀) |
| FV-01 | REL／push 留待使用者執行。 | 生效 | 2026-08-21 | [最終裁決：未盡事項](arch-reports/final-verdict-2026-08-21.md#未盡事項全屬非派工項待使用者) |
| FV-02 | hosted preview 人工 QA 留待使用者執行。 | 生效 | 2026-08-21 | [最終裁決：未盡事項](arch-reports/final-verdict-2026-08-21.md#未盡事項全屬非派工項待使用者) |
| FV-03 | CSP Report-Only→enforcing 留待使用者拍板。 | 生效 | 2026-08-21 | [最終裁決：未盡事項](arch-reports/final-verdict-2026-08-21.md#未盡事項全屬非派工項待使用者) |
| FV-04 | error transport 廠商拍板與接線留待使用者。 | 生效 | 2026-08-21 | [最終裁決：未盡事項](arch-reports/final-verdict-2026-08-21.md#未盡事項全屬非派工項待使用者) |
| FV-05 | WebKit 六條差異的實機 Safari 分類留待使用者。 | 生效 | 2026-08-21 | [最終裁決：未盡事項](arch-reports/final-verdict-2026-08-21.md#未盡事項全屬非派工項待使用者) |
| FV-06 | 本機 `node_modules/node_modules` symlink 清理留待使用者。 | 生效 | 2026-08-21 | [最終裁決：未盡事項](arch-reports/final-verdict-2026-08-21.md#未盡事項全屬非派工項待使用者) |
| D-01 | REL 排在 P0 安全網全部完成之後。 | 生效 | 2026-08-20 | [修正計劃：D1](frontend-fix-plan-2026-08-20.md#05決策紀錄2026-08-20-維護者拍板) |
| D-02 | 錯誤上報端點暫時不做。 | 生效 | 2026-08-20 | [修正計劃：D2](frontend-fix-plan-2026-08-20.md#05決策紀錄2026-08-20-維護者拍板) |
| D-03 | production source map 不開，待錯誤上報重啟時再評估 hidden source map。 | 生效 | 2026-08-20 | [修正計劃：D3](frontend-fix-plan-2026-08-20.md#05決策紀錄2026-08-20-維護者拍板) |
| D-04 | focus 外框維持現況、不改色，對比缺口列為已接受例外。 | 生效 | 2026-08-20 | [修正計劃：D4](frontend-fix-plan-2026-08-20.md#05決策紀錄2026-08-20-維護者拍板) |
| D-05 | PWA 不支援離線；不加 fetch handler，但仍處理 `pushsubscriptionchange`。 | 生效 | 2026-08-20 | [修正計劃：D5](frontend-fix-plan-2026-08-20.md#05決策紀錄2026-08-20-維護者拍板) |
| D-06 | 抽屜捲動保存從 P2 升回 P1，翻案批 8 的 parity 決策。 | 已終結 | 2026-08-20 | [修正計劃：D6](frontend-fix-plan-2026-08-20.md#05決策紀錄2026-08-20-維護者拍板)；[批 18 完成紀錄](migration-reports/batch-18.md) |
| D-07 | 加入 Safari／WebKit 測試訊號。 | 已終結 | 2026-08-20 | [修正計劃：D7](frontend-fix-plan-2026-08-20.md#05決策紀錄2026-08-20-維護者拍板)；[批 23 完成紀錄](migration-reports/batch-23.md) |
| NP-01 | TanStack Query 維持延後；有實際痛點且有 mapper 防繞過方案才提案。 | 生效 | 2026-08-22 | [母派工單：不派工](arch-dispatch-2026-08-22-frontend.md#不派工需使用者先拍板或明確不做) |
| NP-02 | 不引入 React Router；沿用自製 hash router。 | 生效 | 2026-08-22 | [母派工單：不派工](arch-dispatch-2026-08-22-frontend.md#不派工需使用者先拍板或明確不做) |
| NP-03 | 不引入 Redux／Zustand；自製 store 有 devtools 實需時再議。 | 生效 | 2026-08-22 | [母派工單：不派工](arch-dispatch-2026-08-22-frontend.md#不派工需使用者先拍板或明確不做) |
| NP-04 | CSS `@layer` 裁決不翻案。 | 生效 | 2026-08-22 | [母派工單：不派工](arch-dispatch-2026-08-22-frontend.md#不派工需使用者先拍板或明確不做) |
| NP-05 | 桌面雙欄版面先查 analytics 裝置比例再決定。 | 生效 | 2026-08-22 | [母派工單：不派工](arch-dispatch-2026-08-22-frontend.md#不派工需使用者先拍板或明確不做) |
| NP-06 | 不做 Next.js、SSR 或一次重寫。 | 生效 | 2026-08-22 | [母派工單：不派工](arch-dispatch-2026-08-22-frontend.md#不派工需使用者先拍板或明確不做) |

## 狀態判讀

- `D-06` 已由批 18 完成產品規則翻案與捲動保存，故標為「已終結」。
- `D-07` 已由批 15 修好 WebKit harness、批 23 加入非阻擋 CI 訊號，故自動測試決策標為
  「已終結」；實機 Safari 分類仍由 `OV-05`／`FV-05` 保持「生效」。
- 其餘「不做／延後／留待使用者」決策沒有後續拍板推翻，維持「生效」。
