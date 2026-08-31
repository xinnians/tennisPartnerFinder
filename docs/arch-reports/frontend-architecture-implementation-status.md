# 前端架構開發進度

最後更新：2026-08-31

這是前端架構開發的**單一進度入口**。新的 session 應先讀本文件，再讀
`frontend-architecture-final-v3-2026-08-31.md`；舊的審查報告只作歷史紀錄，不直接代表目前狀態。

## 目前狀態

| 項目 | 狀態 |
| --- | --- |
| 工作分支 | `codex/frontend-architecture-execution` |
| 開發基準 | `51dde9c`（16 份前端架構審查文件首次入版） |
| 目前批次 | `FA-03A1` Push additive expand：本機 DB foundation 設計與實作 |
| 整體狀態 | `FA-00`、`FA-01`、`FA-02` 完成；FA-03 pre-expand hosted 唯讀盤點完成，contract gate 尚未完成 |
| runtime 變更 | 無 |
| migration 變更 | 無 |
| bundle checker／CI 變更 | checker 已分成開發期 report 與 release enforce；CI 仍走 report |
| 下一步 | 先固定可由現有證據支持的 schema contract，再實作、測試並 commit 本機 additive expand；不部署 hosted，不進 destructive contract |

查實際 Git 狀態：

```bash
git status --short
git branch --show-current
git log --oneline --decorate -10
```

## 已確認決策

| ID | 決策 | 實作狀態 |
| --- | --- | --- |
| D1 | Push 同意採「帳號＋裝置」opt-in；換帳號必須重新同意 | Q2-A 已核可；FA-03 待實作 |
| D2 | 一般登出只停止目前裝置的登入與推播；其他裝置不受影響 | server-first cleanup＋local sign-out 已核可；FA-03 待實作 |
| D3 | Push cleanup 結果不明時採 durable quarantine；dispatcher 送出前重查狀態 | Q1-A／Q7-A 已核可；FA-03 待實作 |
| D4 | Q6-A 已取代原本無法由現有 stack 證明的精確界線：只承諾 DB transaction 持續有效時的 quarantine/send 排序；載入記憶體仍不算 handoff | 已核可 current-stack 條件式邊界；殘餘斷線空檔需保留監控與測試 |
| D5 | quarantine 的重新確認、保存期限與到期處理由 `FA-02` 提案後再核可；不先猜 30／90 天 | Q1-A 已核可：不設日曆期限，只依 server provider 證據解除 |
| D6 | session 缺少 `user.id` 時 fail-closed：視為無效、清私人狀態並要求重新登入 | 是 FA-03 前置或同批依賴；目前仍 fallback 到 access token |
| D7 | `ds-bundle/` 與 `.design-sync/` 保留並持續使用於 UI/UX 優化 | 已決策；同步前仍需全量重驗，不能假設自動同步 |
| D8 | 開發期 bundle bytes 只報告、不阻擋 CI；demo／E2E hook／隱私與拆包邊界仍 hard fail | `FA-01` 已完成 |
| D9 | 第一個 production release candidate 前，依 route、裝置、網路、gzip／Brotli 與 Web Vitals 基線重訂並啟用 hard byte limits | 待 production baseline |

## 授權邊界

- 使用者已設定持續開發目標：依本文件逐批執行，只有產品決策、migration 核可或不可逆操作才停下確認。
- 已完成 `FA-00`、`FA-01`、`FA-02`；FA-02 Q1–Q10 已全部核可，可進行 FA-03 的唯讀
  preflight、可逆 expand、runtime 與測試。
- 不可逆 contract 前必須回報 hosted 實際影響筆數並再次確認；目前核可不代表可以略過這個邊界。
- 不自行 push 遠端；每批以獨立 commit 保存。

## 批次總表

| 批次 | 內容 | 狀態 | 完成條件 |
| --- | --- | --- | --- |
| FA-00 | 建立進度單一來源、回填已確認決策 | 完成 | 文件差異與 whitespace 檢查通過；無非文件變更 |
| FA-01 | 文件／rules 對齊；bundle 結構 hard gate 與開發期 size report 分流 | 完成 | 非 byte 邊界仍可翻紅；bytes 可報告；release enforcement 路徑存在 |
| FA-02 | Push lifecycle、quarantine、consent、local sign-out 詳細設計 | 完成並核可 | state machine、資料模型、到期方案、RPC／SW／dispatcher／測試矩陣完整；十項決策已記錄 |
| FA-03 | Push runtime 與 migration | pre-expand 唯讀盤點與 `FA-03A0` 測試基線修正完成；additive expand 進行中 | expand、DB、browser、dispatcher、雙帳號測試通過；不可逆 contract 另行確認 |
| FA-04 | DOM／ownership gates 與正式 ledger／browser manifest | 未開始 | gate 有 canary；清單有明確 scope |
| FA-05 | 低風險清理、production preview、效能基線、Bundle ADR | 未開始 | before／after 可重現；未放寬未核可邊界 |
| FA-06 | `sessionViews` wiring、blockedPlayers、Chat／Messages ownership | 未開始 | 每個新 owner 都伴隨舊 bridge 刪除與完整回歸 |

## FA-00 實際內容

已做：

- 建立 `codex/frontend-architecture-execution` 分支。
- 建立本進度文件。
- 將 D1–D9 與 fail-closed 決策回填 final-v3。
- 保留 final-v3 的技術事實／待驗項目區分。

未做：

- 未改應用程式、資料庫、Service Worker、Edge Function、測試、rules 或 CI。
- 未執行 runtime test suite；本批沒有 runtime 變更。
- 未把 quarantine 保存天數寫死。

本批驗證：

```text
文件非空與 code fence 成對
git diff --check
git diff --name-only（只允許本進度文件與 final-v3）
```

## FA-01 實際內容

已做：

- 保留原本 8 個 raw／gzip byte 數值，集中到 `scripts/productionBundlePolicy.mjs`，沒有調高門檻。
- `npm run check:production-bundle` 改為開發期 report：超過 bytes 會列出差額，但不因此失敗。
- 新增 `npm run check:production-bundle:release` 與明確的 `--enforce-byte-limits` 參數；相同超額在
  release 模式會合併列出並 hard fail，未知參數也會失敗。
- demo identifier、E2E hook、輸出完整性、private repository 與 Sentry 拆包仍是 hard gate。
- Sentry 特例不再靠 `sentry_version` 字串分類；checker 另跑 production `write:false` build，要求
  `src/sentryBrowserSdk.ts` 與全部 `@sentry` module 只存在同一 chunk、不得混入其他 app module，
  也不得再 import 其他 chunk，並核對該 chunk 與磁碟 `dist` 內容相同。原 marker 只保留作第二層檢查。
- 在既有 `tests/ci-config.test.js` 補 report／enforce、邊界相等、未知參數與 Sentry provenance canary；
  沒有新增未被聚合 script 收錄的孤立 test file。
- 對齊 `CLAUDE.md` 與三份 `.claude/rules/` 的真實路徑、命令、CI job、Playwright 範圍及 byte 政策。

刻意未做：

- 未修改 `.github/workflows/quality-gate.yml`；frontend CI 原本就會在 build 後呼叫預設 checker，
  因此現在自然取得 report 行為。
- 未修改 app runtime、migration、Service Worker、Edge Function、任何 byte 數值，也未加入 Brotli 門檻。
- 未 push 遠端。

實測 bundle 基線（production、32 files、508 modules）：

| 範圍 | raw bytes | gzip bytes | 現有門檻 raw／gzip |
| --- | ---: | ---: | ---: |
| main | 638,937 | 187,466 | 658,867／192,420 |
| 最大一般 lazy（My Sessions） | 16,476 | 4,828 | 18,000／5,500 |
| Sentry | 87,975 | 29,723 | 90,000／31,000 |
| total JS | 841,561 | 257,627 | 849,961／259,062 |

本批驗證：

```text
node --test tests/ci-config.test.js：19 passed
npm run check:production-bundle：report mode，0 exceeded
npm run check:production-bundle:release：enforce mode，0 exceeded
npm run test:ci:frontend：通過；Playwright 298 passed / 4 skipped
wc -l CLAUDE.md：200
git diff --check：通過
```

補充：完整 CI 輸出曾出現 `WebSocket server error: Port 24678 is already in use` 警告，相關 unit
與整體聚合仍全部通過；本批沒有把這則警告誤寫成測試失敗，也沒有在未查因前宣稱已消失。

## FA-02 實際進度

設計文件：`frontend-architecture-fa-02-push-lifecycle-design-2026-08-31.md`

已完成：

- 逐檔核對 Push browser helper、auth、feature、RPC、migration、RLS、Service Worker、dispatcher、
  scheduler 與現有測試；另以本機 catalog 核對 schema／grant／cron。
- 確認目前沒有 account＋device consent、quarantine、disable、logout cleanup、subscription refresh，
  且一般 logout 仍使用 auth-js 預設 global scope。
- 確認 dispatcher 先取 subscription snapshot、只有 attempts CAS、沒有 lease；重疊 worker 可再次 claim，
  而多裝置任一成功會讓其他暫時失敗的裝置失去重試。
- 設計 consent、endpoint registry、active transport 三層資料模型，避免替 legacy row 偽造 device；另有
  server-first logout、cleanup-only token、RPC-only mutation、per-device delivery 與完整測試矩陣。
- 查明只做 send 前 SELECT 仍有 race；DB lock 只能提供有前提的排序，不能與外部 Push service
  形成共同 transaction，也不能把 request invoked 寫成 service accepted。
- 依 W3C 規格確認 expiration 可為 null、未知 timeout 不是 deactivation 證據，因此沒有虛構
  30／90 天的安全期限。
- 確認現行 web-push 預設 TTL 四週、沒有明確 socket timeout；endpoint 也只有長度檢查，形成
  authenticated-controlled outbound／SSRF boundary，已納入 FA-03 設計與測試。
- 經三個獨立唯讀 reviewer 反覆核對，補正 unsubscribe 只能算 client attestation、遠端 revoke 的
  client-detection 窗口、fan-out／quarantine lock ordering、legacy RPC shim、delivery state、event deadline
  matrix，以及 fingerprint identity 必須和 egress policy 分離。
- 所有新建 outbox 都要求非空 `expires_at`；Q8 只決定 Push service TTL。現況只有兩種 reminder 可由
  文案／query 確認截止語意，其餘 8 種的完整 deadline＋domain invalidation matrix 已列為 Q10-B
  新產品政策，沒有把操作窗口冒充成既有通知規則。
- reminder 改用從 1 起算的 DB schedule version；legacy outbox 的 0 只作 sentinel，避免改期後被舊
  cancelled row 永久擋住。prefs／block／court subscription 的 absent-row race 也有共用 transaction
  advisory guard 與固定 lock order。
- endpoint owner lock 採 exact UTF-8 SHA-256；另以 frozen canonical policy 擋 URL alias。hosted preflight
  只要發現 non-canonical／parse-fail／owner conflict，就停止不可逆擦除並回報，不假設 production 為零。

FA-02 結案當時尚未做（後續 hosted 盤點見 FA-03）：

- 沒有修改 runtime、migration、generated types、Edge Function、Service Worker 或測試。
- 沒有查證 hosted production row 數、grant、cron、Edge env 或 provider 行為；這些是 FA-03
  migration 前的只讀 preflight。
- 沒有執行不可逆的 legacy key 擦除或 pending outbox 取消。

已核可的實作選項：

| 題目 | 選項 | 已固定的行為 |
| --- | --- | --- |
| Q1 | A | owner-linked quarantine 不以天數自動釋放，只接受 server provider 證據 |
| Q2 | A | 同帳號、同 logical device 也要由使用者手動恢復 Push |
| Q3 | A | event 建立時固定 recipient 與 logical device |
| Q4 | A | canonical preflight 零例外才可隔離 legacy row 並擦除 raw send material；任何例外停止 contract |
| Q5 | A | UTC cutoff 前 pending legacy outbox 全部取消，保留稽核狀態 |
| Q6 | A | 採 current-stack 條件式 D4 邊界，明列並監控極小未觀察斷線空檔 |
| Q7 | A | 刪帳後保留 ownerless deny fingerprint，只有 server provider 證據可解除 |
| Q8 | A | TTL 用 DB remaining deadline 減 verified safety budget；未知 budget 時為 0 |
| Q9 | A | app boot 強制 Auth refresh；拒絕時 quarantine，離線／timeout 時 local fail-closed |
| Q10 | B | 啟用完整 10-event expiry matrix 與 domain invalidation 規則 |

FA-02 結案時實測：

```text
notification data／Push／dispatcher Node tests：13 passed（8 個直接屬 Push／dispatcher）
npm run test:db：804 tests，802 passed / 2 failed
```

DB 的兩個失敗已定位為 reminder fixture 使用全庫總數，被本機既有 candidate session 多算；不是
FA-02 程式變更造成。此測試問題已由下方 `FA-03A0` 修正。

## FA-03 pre-expand 唯讀盤點

詳細報告：`frontend-architecture-fa-03-push-preflight-2026-08-31.md`
去敏證據：`frontend-architecture-fa-03-push-preflight-evidence-2026-08-31.md`

已完成且沒有 hosted 寫入：

- local／remote 25 個 migration 全對齊；PostgreSQL `17.6`、UTF-8。
- strict pg-delta 確認 `public/private` 沒有 structural DDL drift；差異只在 hosted ACL／default
  privileges，而且 hosted 預設會廣泛 grant 新物件。
- `REPEATABLE READ READ ONLY` snapshot 實查 4 筆 legacy subscriptions／3 owners；7 筆 outbox 的
  `sent_at` 非空，pending 0、orphan 0、retired event 0。這不代表 provider 接受或裝置收到。
- exact UTF-8 SHA-256 conflict 0；但 frozen canonical policy 尚未實作，所以 canonical 例外**沒有數字**，
  不能進 contract。
- additive expand 會回填 2 個 session version 1、1 個 legacy reminder sentinel 0；duplicate group 0。
- hosted dispatcher 是 ACTIVE version 6、`verify_jwt=false`；下載後兩個 source file 與 repo 逐 byte
  相同。4 個 production custom secret 名稱存在，mock transport／test URL 名稱不存在。
- dispatch／reminder cron 唯一、active、command shape 相符；Vault 三個必要名稱各一筆且查詢時非空。
- 查詢當下 cron running 0、pg_net queue 0；這不等於零 in-flight Edge worker。

盤點結論：可開始**本機** additive expand 與測試；尚未核可 hosted migration/deploy。contract 仍須
frozen canonical scanner、platform timeout／provider／browser canary、maintenance barrier，以及 Barrier
後重新取數並再次取得使用者確認。

## FA-03A0 測試基線隔離

已完成：

- reminder pgTAP 的時鐘改到本機既有所有有限 session 起始時間之後，避免掃到非本測試建立的 session。
- 只刪除與統計本測試建立的 outbox；不再清空全表，也不以全庫總數當 fixture 斷言。
- 第一次 enqueue 必須精確回傳 `3`、第二次必須精確回傳 `0`，原本的 production 行為斷言沒有放寬。
- 獨立 reviewer 檢查未提交差異，結論為 zero blockers。

本批驗證：

```text
npm run test:db：7 files、804 tests，全數通過
git diff --check：通過
```

## 已知阻塞與風險

- 開發期 bytes 已改為 report；release hard limits 仍沿用歷史數值，必須在第一個 production
  release candidate 前依真實裝置、網路、gzip／Brotli 與 Web Vitals 重訂，不能把目前通過當成正式基線。
- 現行 `push_subscriptions` 只有 active row，沒有 quarantine／consent／expiry state。
- 現行一般登出走 auth-js 預設 global scope，與 D2 尚未一致。
- 現行 identity helpers 仍以 `access_token` fallback，與 D6 尚未一致。
- 現行 dispatcher 沒有 delivery lease，且多裝置只有一個 outbox outcome；不能只加 quarantine filter。
- Web Push 與 PostgreSQL 沒有共同 transaction；Q6-A 已核可較弱但可實作的條件式邊界，仍須測試、
  監控並明列無法完全消除的斷線空檔。
- 現行 web-push 預設 TTL 四週且沒有明確 timeout；endpoint 可控制 Edge outbound target。兩者都是
  FA-03 deployment blocker，不能沿用隱含預設。
- Hosted public-schema default privileges 對 app roles 過寬；FA-03 新 table／sequence／function 必須在
  同一 migration 立即 revoke，再做最小 grant，不能留下部署空窗。
- `canonical-endpoint-policy-v1` 尚未實作，不能用 SQL regex／ambient URL parser 猜 canonical 例外；
  這不阻擋 additive expand，但會阻擋 destructive contract。
- Vault 與 Edge 的 cron secret 目前只證明兩邊存在，metadata 不能證明值相同；現行 function 沒有
  side-effect-free healthcheck，因此本輪刻意沒有直接呼叫 hosted dispatcher。
- `ds-bundle/` 是人工同步資料包；繼續使用前要確認與目前 UI/CSS 一致。

## 下一個 session 的起點

1. 確認分支為 `codex/frontend-architecture-execution`，先讀本文件、FA-02 設計與 FA-03 preflight 報告。
2. 先把現有證據不足以唯一決定的 schema contract 分開列出；只實作已固定的 control／consent／registry／
   delivery schema、schedule version、legacy compatibility shim、最小 ACL 與 isolated pgTAP tests；不套用 hosted。
3. reminder pgTAP fixture 已隔離；以 `npm run test:db` 的 804／804 作為 FA-03 additive expand 基線。
4. 之後依 compatible runtime → barrier → disabled deploy → canary → contract → enable 分批實作、測試、
   更新本文件並建立獨立 commit。
5. contract 前重跑 hosted canonical／影響筆數；未再次確認前不得擦除、批次取消或直接 push 遠端。

## 進度紀錄

| 日期 | 批次 | 紀錄 |
| --- | --- | --- |
| 2026-08-31 | FA-00 | 建立執行分支、單一進度入口，寫入已確認產品與開發政策。 |
| 2026-08-31 | FA-01 | Bundle 結構 hard gate 與 byte report／release enforce 分流完成，rules 與測試同步。 |
| 2026-08-31 | FA-02 | 完成 Push 現況稽核與詳細設計草案；runtime／migration 未動，等待十項核可。 |
| 2026-08-31 | FA-02 | 使用者核可 `1A、2A、3A、4A、5A、6A、7A、8A、9A、10B`；FA-03 可開始，contract 前仍須回報 hosted 實際影響。 |
| 2026-08-31 | FA-03 | 完成 hosted pre-expand 唯讀盤點：4 legacy subscriptions、7 筆 `sent_at` 非空／0 pending outbox；結構無 drift、ACL 有差異；未做 hosted 寫入。 |
| 2026-08-31 | FA-03A0 | reminder pgTAP 改用隔離時鐘與 fixture-scoped outbox 斷言；完整 DB 測試 804／804 通過。 |
