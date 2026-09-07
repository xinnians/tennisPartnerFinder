# 前端架構 post-FA-06 completion audit

日期：2026-09-08
盤點基準：`5210089`

## 白話結論

final-v3 排定的通用前端架構階段已完成：結構 gates、ownership ledger、低風險清理、production preview、Bundle
ADR、wiring 拆分、blockedPlayers、Chat 與 Messages 都已有實作與驗證。現在不需要為了「繼續重構」任意再換框架或
建立新 facade。

剩餘工作分成三類：

1. 可以直接安全往下做：`ds-bundle/` 全量重驗、WebKit 既有失敗診斷。
2. 要到 release candidate 才做：正式 hosting／裝置／網路／Web Vitals 基線與 bundle hard limits 重訂。
3. 需要產品或外部操作確認：Push v2 的八種技術狀態如何顯示、Hosted 真實 Push canary、active deploy／runtime
   control／legacy cutoff。

因此下一個安全批次選 `ds-bundle/` 全量重驗。這符合已確認的 D7「保留並持續用於 UI/UX 優化」，也不需要猜
production 行為。

## final-v3 原待辦逐項核對

| final-v3 待辦                     | 現況                                                               | 可重現證據                                                                                        |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Auth identity 與 refresh 分支     | 已由 FA-03B0／B1 的 fail-closed coordinator 取代舊流程並完成       | `profile-orchestration-auth.test.js`、`auth-refresh-coordinator.test.js`、本次合併 targeted 55/55 |
| browser port 正式 scope／manifest | 已完成且持續由 gate 驗證                                           | controller direct 1、platform adapters 26、UI globals 50、type-only 153                           |
| 正式 DOM mutation ledger          | 已完成且隨 Chat owner 退役更新                                     | 19 files／110 nodes／31 symbols／100 references                                                   |
| 第三輪候選表重驗                  | 已完成                                                             | FA-06 Stage 6 preflight 重新盤點 Chat／Messages 後才選第一個 slice                                |
| production preview project        | 已完成                                                             | desktop／mobile Chromium required project；WebKit 為 non-blocking project                         |
| 方案 E App-level PoC              | 現階段不做                                                         | D40／Bundle ADR 已選 A；只有正式效能證據成立才重開 E                                              |
| 真實 browser Push lifecycle       | 未完成                                                             | production 仍走 legacy；v2 browser／Edge／DB 只有 dormant 或 local composition                    |
| dispatcher active integration     | repo／local 已完成，Hosted active 未完成                           | D2／D3A local 通過；Hosted B 只做 no-write DB probe，未呼叫 `dispatch`                            |
| account delete 的 Push 邊界       | Push dormant schema 與真實 FK 測試已完成；全專案無條件刪帳仍未宣告 | FA-03A3 只保證 Push 不新增 blocker                                                                |
| production telemetry              | 未完成且現在不冒充 production 證據                                 | 目前只有 local production preview；無正式 hosting／真機／Web Vitals                               |

以上「已完成」以 implementation status 與現行測試為準。final-v3 第一層保留的是 2026-08-31 歷史基線，內含已
退役的 `sessionViews.js` 與舊數量，不應改寫成目前 production 現況。

## 現行架構 gate 實測

```text
frontend architecture + React lifecycle + Auth targeted：55 passed / 0 failed（55 tests）
imperative React surface adapters：7
DOM mutation ledger：19 files / 110 nodes / 31 symbols / 100 references
browser ports：controller 1 / platform adapters 26 / UI globals 50 / type-only 153
production controller legacy Chat callback：0
```

這些數字直接由目前 manifest 與測試讀出；沒有沿用 final-v3 的舊 seed 數字。

## 為什麼下一批是 `ds-bundle/`

本次只讀掃描已確認：

- production CSS 現在依固定順序載入 13 份檔案；`ds-bundle/_ds_bundle.css` 仍自稱只逐字複製
  `src/style.css + src/session.css` 的 2026-08-11 舊版本。
- `.design-sync/config.json` 仍寫「原生 ES modules、無 React」，但 production 已有 React root、pages 與 sheets。
- `ds-bundle/README.md` 的索引列出 `components/screens/*` 與 `components/foundations/Bricks/Bricks.html`；這些檔案
  不在目前 13 個 tracked `ds-bundle` files 中。
- README 與 conventions 仍以舊產品名稱「網球球局地圖設計系統」為標題；production 品牌已是「球咖」。
- `_ds_bundle.css` 為 102,371 bytes；目前 13 份 production CSS 合計 114,984 bytes。這只能證明兩邊不等長，尚不能
  直接把每一筆差異都判成視覺錯誤，所以下一批仍須逐項比對。

因此 `ds-bundle/` 現在不能當作「與產品同步」的可靠來源，但也不應刪除；先建立可重現的 drift inventory，再決定
哪些內容需要同步與如何避免再次漂移。

## 目前不直接做的項目

- 不自行把 Push 八種技術狀態壓成四種 UI；這會改變產品行為。
- 不部署 Function、不設定 secret、不送 Hosted `dispatch` request、不啟用 runtime control。
- 不因 development bundle 超過舊 total report 基準就提高上限或拆 Supabase；D8／D9 已固定判斷時點。
- 不把 7 個 WebKit 失敗直接標成產品 bug；先前結果落在多個非 Chat 範圍，必須另批重現與分類。

## 下一步

對 `ds-bundle/` 與 `.design-sync/` 做只讀全量 drift inventory：檔案完整性、CSS selector／token、示範 markup、文案、
React ownership、可及性與 390px render。先產出可重現清單，再做同步修改；不先改 production UI。
