# 整體路線圖（2026-08-25 拍板；同日依對立審查修訂 v2）

- 背景：前端架構優化管線批 0–2、F0-9、F1R、F0-6／F0-4／文件批 D 全部 ACCEPTED；
  本機 HEAD 未 push（origin 工作分支停 `0be31a2`，`main..HEAD` 84 commit）。
- **production 現況（2026-08-25 實查）**：qiuka.tw 自 **2026-08-22 13:21** 起即為
  React 版——使用者當日 push `main=76779be`（上一條 arch-hardening 管線的純前端 REL）
  觸發 Git integration 部署（deployment `fa5xqjq4j`，target=production）。
  08-25 01:48 的 `last-modified` 是 CDN 快取時間戳，**當晚沒有任何部署**
 （`vercel ls` 無對應紀錄）。本管線的 84 個 commit 尚未上線。
- REL checklist 剩兩個未勾項：穩定 preview 人工 QA、QA fixtures 清理。
- 修訂依據：`docs/arch-dispatch-2026-08-25-roadmap-review-report-codex.md`
 （對立審查，驗收通過）＋使用者 2026-08-25 三項追加拍板。

## 拍板紀錄

**2026-08-25（初版）**：① 上線先行；② 批 3 切 3A→3B；③ 地圖批、bundle 拆分、
長列表節流、守門收尾全排入；④ 種子供給擱置。

**2026-08-25（審查後追加）**：⑤ 「上線」拆兩個 gate——**REL-code**（程式部署，
照上線先行進行）與 **REL-public**（社群公開宣傳，發布前必須有真實球局供給，
方案屆時再定）；⑥ **MIG-06 正式翻案**（分頁狀態進 URL 納入 F3-1，翻案理由與
hash 命名空間設計寫進 F3-0 規則修訂）；⑦ F4-8 由 P2 提級進加固批，理由＝縮短
test-only 讀取路徑在 production 的暴露期（非母單「隨時可做」項，特此註記）。

## 階段 0：REL-code 程式部署（使用者執行，非派工）

**執行紀錄（2026-08-25）**：
- 步驟 2 備份：使用者拍板**跳過**（無真實使用者，待刪資料即 QA fixtures）。
- 步驟 3 CI：84 commit 首推全綠（run 32797465716）；WebKit 134 passed／0 failed——
  六條歷史失敗全數消失，優於基準，REL-10 的實機分類負擔解除。
- 步驟 4 REL-10：使用者人工 QA 完成。
- 步驟 5 REL-11：**已執行**（Claude 經 linked hosted DB）：刪 16 個 QA 球局
 （級聯 26 參與、25 訊息、7 候選場）、清空 notification_outbox 50 筆；
  court_subscriptions／push_subscriptions／三個 profile 保留（使用者拍板）；
  Test3 目錄 opt-in 下架（QA測試B 原本就未上架，Ian 維持）。
  反向驗證：七表歸零計數；production 匿名 REST `session_discovery` 回 `[]`、
  `player_directory` 與 raw `sessions` 對匿名 401。
- 步驟 6 merge＋部署：main push 至 `322da94`，production `fm4t1mjdn` 部署完成。
- 步驟 7 smoke：自動驗項全過（新 bundle、mock 排除、安全標頭、64 圖釘、匿名
  discovery `[]`、深連結 empty sheet、console 零錯誤）；main CI 三 job 全綠。
  三項登入檢查（OAuth 兩帳號、qiuka.tw 推播授權、建立→取消旅程）由使用者
  完成（2026-08-25）。**階段 0 REL-code 全案結案。**

原步驟清單：

1. **凍結現況（preflight）**：記錄 remote SHA（main `76779be`／工作分支 `0be31a2`）、
   production deployment（`fa5xqjq4j`，08-22 13:21）；確認 Vercel Analytics 已啟用
  （桌面雙欄決策與首波成效觀察都依賴它）；讀值確認 Supabase Site URL 與
   Maps referrer 現值（先讀再決定「改」或「確認」）。
   migration 對齊已於 2026-08-25 實查 **25/25、零 mismatch**（審查報告 §A6.5）。
2. **清理前備份**：fresh `supabase db dump`（schema＋data）＋各表 counts＋checksum，
   存到非暫存目錄（0700/0600）並讀回確認。**必須在任何刪除動作之前。**
3. push 開發分支 → 等 `frontend`＋`supabase` CI 綠（84 commit 首次上 CI，紅了先修）；
   WebKit 非阻擋 job 仍對照既有六條基準，不接受新增失敗。
4. REL-10 穩定 preview 人工 QA（以 immutable preview URL 固定版本）：390px 慢網路、
   鍵盤焦點走查、support／privacy 連結、OAuth、Maps、push、console 零錯誤；
   **併入 WebKit 六條的實機 Safari 分類**（四條疑似 focus 差異、兩條測試模型問題，
   分類即可、不要求全修）。
5. 在 hosted 完成「取消球局」旅程（REL-6 當時未重跑項）後，執行 REL-11 清
   QA fixtures；清完驗匿名 discovery 無 QA 資料、目錄無 QA opt-in profile。
6. merge main（已確認 main 是 HEAD 祖先且 `main..HEAD` 零 migration，可 fast-forward）
   → git push 觸發 production 部署。
7. production smoke：核對 asset/SHA、匿名 discovery、OAuth 兩帳號、Maps、push
  （preview 與 qiuka.tw 的授權與 subscription **不共用**：在 qiuka.tw 查既有
   subscription，沒有才以使用者手勢申請）、`#/session/:id` 深連結、
   建立／取消球局最短可逆旅程。
8. **rollback 目標預先指定**：`fa5xqjq4j`（2026-08-22 production，React＋真實
   Supabase env）。不可泛稱「前一個 deployment」——回滾到 2026-08-14 前的
   deployment 會切成 mock 模式、公開假球局（fix-plan:550 既知限制）。

REL-public（社群發文）**不在階段 0**：受真實種子供給 gate（拍板 ⑤），
時機與方案由使用者另行拍板。

## 階段 1：加固批（部署後緊接派工，hot-follow）

**執行紀錄（2026-08-25）**：H-2／H-3 ACCEPTED（`57c5a33`／`6ac9914`＋D-03 落檔
`58c5d5c`）；H-1 Sentry **BLOCKED**——SDK on-wire 必帶 protocol metadata，無法符合
「精確三鍵」契約，依派工條款停手。後續走向 2026-08-25 拍板＝放寬契約後接線；**H-1R ACCEPTED**（`bf89206`，wire 層 8 欄枚舉容忍＋三 tags 精確＋PII 反向鎖；使用者已設 `VITE_SENTRY_DSN`，push 部署後生效）。
H-3 的 hosted Map ID 設定與走查待使用者執行（步驟見回報）。
驗收紀錄 `docs/arch-reports/batch-hardening-acceptance-2026-08-25.md`。


- F4-6 Sentry（08-22 已拍板廠商；dynamic import、beforeSend 三欄 allowlist；
  **派工單需顯式處置 D-03**——hidden source map 開或不開要落決策）
- F4-8 拔除 `__tennisE2ETestHooks` 出貨路徑（P2 提級，理由見拍板 ⑦；
  現有 6 個字面讀取點）
- F4-2 AdvancedMarker 遷移＋Maps 版本釘選 quarterly

## 階段 2：批 3A——導覽與啟動（F3-0 → F3-1 → F3-3）

**ACCEPTED（2026-08-25，一次通過）**：`a15d37e`..`bded000` 六 commit。規則解凍
恰七行含 MIG-06 翻案儀式；hidden 矩陣 9→0、router 10 行、`#tab-*` 接管既有
anchor；`bootDeepLinkReopenPending` 退役、session 深連結結構性等待 auth；
新增 8 條導覽／冷啟動 e2e（mock+local）。交界新設計＝page history entry 帶
`pageOwnerIdentity` 防跨帳號冷啟動還原私人分頁。
驗收紀錄 `docs/arch-reports/batch-3A-acceptance-2026-08-25.md`。


F3-0 規則修訂範圍**新增 MIG-06 正式翻案**（拍板 ⑥）：翻案理由、hash 命名空間、
與 `#/session/:id` 相容性設計一併落檔；其餘照原範圍（surface stack 歸屬、
AppShell 接管區 DOM 凍結，testid 凍結不動）。F3-1 導覽狀態機＋hash 深連結；
F3-3 啟動編排顯式化（與 F3-1 同批鎖冷啟動深連結交界）。

## 階段 2.5：F0-7 計數斷言清單化（排 F3-0 後、3B 前）

原「彈性批」定位修正（審查 §B3）：F0-7 綁 sheet／eager／consumer 集合，
而 3B 正好會改這些集合——先清單化，3B 只改單一 manifest 並說明變因。

## 階段 3：批 3B——殼遷入 AppShell（F3-2）

topbar／popover／底部導覽／toast／login modal 遷 React；`import.meta.glob`
三橋退役；同步 commit 邊界不得擴張。

## 階段 4：地圖批（F4-1＋F4-9＋F4-4）

建立在階段 1 已換的 AdvancedMarker 之上；派工單的 F4-1 驗收需以
AdvancedMarker 形狀改寫（keyed create／update／detach 計數，fakeMaps 替身
同步改契約——審查 §B2 的具體清單照抄進派工單）。

## 階段 5：bundle 拆分（F4-3，**建議**在 3B 後）

軟依賴修正（審查 §A4）：母單硬依賴只有「批 2」（已具備）；排 3B 後是避免
殼遷移攪動 chunk 基線的重工控制，若 3B 受阻，本項可提前。

## 階段 6：長列表節流（F4-7，切兩半）

前端半批（content-visibility）＋DB 半批（limit／分頁，另發、動 view 契約與 pgTAP）。

## 彈性批與測試基建

- F0-8 分支名解耦：真彈性，任何階段可插。
- F4-10 測試基建（smoke 拆檔、mock 平行化）：排 **3A 前或 3B 後**，
  不夾在 3A／3B 之間（避免與新增 navigation e2e 大面積互改）。

## 明確不排／待使用者（審查 §C3 補入）

| 項目 | 處置 |
| --- | --- |
| CSP Report-Only → enforcing | 不排；仍待使用者拍板（OV-03／FV-03）。現況無 violation 收集通道，enforcing 前需先設計收集方式 |
| `reports.status` 無法結案 | 另立 DB／治理批，**最晚在首個真實檢舉的 90 天 purge 窗前**完成 close/dismiss 流程；否則明文接受無限期保留 |
| `profiles.line_id` DB 清理 | 不排；屆時需獨立 migration 批（backup preflight＋RPC 簽名＋生成型別），不得與 F4-7 DB 半批合併 |
| 種子供給（REL-12） | REL-public 的前置 gate，方案待拍板 |
| 桌面雙欄 | 待 Analytics 裝置比例（階段 0 第 1 步確認 Analytics 已啟用） |

## 主要失敗風險與預防

1. **CI 首跑紅**（84 commit 首次上 CI）：push→CI 綠→才 merge main 硬順序。
2. **release 基準漂移**：階段 0 第 1 步凍結 SHA／deployment 快照；QA 用
   immutable preview URL，不用會移動的 alias。
3. **上線初期無錯誤監控**（拍板接受）：階段 1 定位為 hot-follow，部署後緊接派工。
4. **批 3 規則解凍削弱驗收武器**：F3-0 範圍寫死（含 MIG-06 翻案儀式）；3B 獨立。
5. **白箱直呼耦合**（實測 140 個字面呼叫點）：批 3 不解此題，長期債。
6. **rollback 誤指向 mock 模式 deployment**：目標已釘死 `fa5xqjq4j`。

## 不做（本輪確認）

TanStack Query／React Router／Redux／CSS @layer／SSR 維持既有裁決；F4-5 不做。

## 修訂紀錄

- v2（2026-08-25）：依 codex 對立審查（報告 §七的 10 項建議全數採納或依實查修正）
  ＋使用者追加拍板 ⑤⑥⑦ 改寫。與審查結論的一處差異：審查推定 01:48 發生過
  deployment，經 `vercel ls`／`inspect` 實查推翻——production 自 08-22 13:21 即為
  React 版，無不明部署。OPS 臨時編號全數移除，改引 repo 來源。
