# 前端架構開發進度

最後更新：2026-08-31

這是前端架構開發的**單一進度入口**。新的 session 應先讀本文件，再讀
`frontend-architecture-final-v3-2026-08-31.md`；舊的審查報告只作歷史紀錄，不直接代表目前狀態。

## 目前狀態

| 項目 | 狀態 |
| --- | --- |
| 工作分支 | `codex/frontend-architecture-execution` |
| 開發基準 | `51dde9c`（16 份前端架構審查文件首次入版） |
| 目前批次 | `FA-03B1` Q9-A Auth boot refresh gate 完成；Q9 的 Push cleanup／quarantine 部分仍待實作 |
| 整體狀態 | `FA-00`、`FA-01`、`FA-02` 完成；FA-03 preflight、`FA-03A0`～`FA-03A3.1`、`FA-03B0`～`FA-03B1` 已完成 |
| runtime 變更 | D6 與 Q9-A Auth gate 已落地：只有 server refresh＋matching event 能開私人狀態；Push cleanup 尚未接上 |
| migration 變更 | repo／本機共新增 10 份 additive foundation／hotfix migration；hosted 尚未套用 |
| bundle checker／CI 變更 | checker 已分成開發期 report 與 release enforce；CI 仍走 report |
| 下一步 | 實作 rejected→cleanup-token quarantine、D2 local sign-out 與 private Push/SW fail-closed；不部署 hosted |

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
| D6 | session 缺少 `user.id` 時 fail-closed：視為無效、清私人狀態並要求重新登入 | `FA-03B0` 已完成；controller 與 orchestration 都只接受非空 `user.id` |
| D7 | `ds-bundle/` 與 `.design-sync/` 保留並持續使用於 UI/UX 優化 | 已決策；同步前仍需全量重驗，不能假設自動同步 |
| D8 | 開發期 bundle bytes 只報告、不阻擋 CI；demo／E2E hook／隱私與拆包邊界仍 hard fail | `FA-01` 已完成 |
| D9 | 第一個 production release candidate 前，依 route、裝置、網路、gzip／Brotli 與 Web Vitals 基線重訂並啟用 hard byte limits | 待 production baseline |
| D10 | 刪帳時清除 consent/device/token、transport、outbox/delivery/payload；只留 algorithm/hash/state/reason/version 的 ownerless deny registry row，時間欄清空 | `FA-03A3` dormant schema／真實 FK 測試完成；待 compatible runtime |
| D11 | `update_session` 的通知相關欄位完全沒變時，不建立 `session_updated` Push | `FA-03A3` DB-owned source version 完成；待 compatible RPC |

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
| FA-03 | Push runtime 與 migration | preflight、`FA-03A0`～`FA-03A3.1`、`FA-03B0`～`FA-03B1` 完成；compatible runtime 進行中 | expand、DB、browser、dispatcher、雙帳號測試通過；不可逆 contract 另行確認 |
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

## FA-03A1 schedule／outbox foundation

已完成：

- 新增 `sessions.notification_schedule_version bigint NOT NULL DEFAULT 1 CHECK (> 0)`；PG17 constant
  default 走 missing-value metadata path，不以 `UPDATE` 改動既有 `sessions.updated_at`。
- DB trigger 只在 `start_at/court_id/venue_type/range_end/decided_at` 真的改變，或 `status` 跨出／回到
  `open/full` 集合時單調加一；同一 UPDATE 多欄只加一次，no-op／無關欄不加，caller 也不能偽造版本。
- outbox 新增 nullable、無預設的 `expires_at` 與 `source_schedule_version`。既有及跨 DDL 的 legacy
  reminder 由 BEFORE INSERT trigger／backfill 固定成 sentinel `0`；非 reminder 必須維持 `NULL`。
- 舊三欄 reminder unique index 完全不動；新版 schedule-version dedupe 尚未啟用。
- 原本把 sessions 與 outbox 放同一 migration 的版本沒有提交。對立 reviewer 實測找出舊 reminder
  的反向鎖順序後，改成 `001` 只鎖 sessions、`002` 只鎖 outbox，移除可形成的 deadlock cycle。
- generated DB types 與 outbox 精確欄位 allowlist 已同步；trigger helpers 為 invoker security、空
  `search_path`，且 `anon/authenticated/service_role` 都不能直接 execute。

刻意未做：

- 沒有修改 browser runtime、dispatcher、cron、舊 save/remove RPC、service-role 既有 grants 或 reminder
  enqueue helper。
- 沒有建立 consent／registry／delivery／control／worker tables；它們仍有下節列出的精確契約待補。
- 沒有 hosted migration/deploy、legacy key 擦除、outbox 取消或其他 contract 操作。

本批驗證：

```text
新增 pgTAP：33／33 passed
npm run test:db：8 files、837 tests，全數通過
npx supabase db lint --local --schema public,private：No schema errors found
strict pg-delta shadow replay：27 migrations 全部套用，public/private diff 為空
npm run typecheck：通過
Push／dispatcher Node tests：13／13 passed
npm run db:gen-types：重跑產物一致
git diff --check：通過
三位獨立 reviewer：產品範圍、schema 契約與 lock-order 複查皆 zero blockers
```

## FA-03A2 schema contract

契約文件：`frontend-architecture-fa-03a2-schema-contract-2026-08-31.md`

已完成並經 PostgreSQL 17／三路 reviewer 查核：

- 固定 ID/hash/version、consent/registry/delivery state、outbox format 1/2、四種 source kind、10-event
  deadline/invalidation、control/worker admission、ACL 與 profile-first 的未來 lock gate。
- 修正兩個原設計缺口：outbox format 1 default 在 barrier 必須移除；message version `1` 必須由 DB
  immutable trigger 保證，不能只靠目前沒有 edit RPC。
- PG17 rollback-only fixture 證實 registry `SET NULL` 會觸發 child `BEFORE UPDATE` 並可轉 ownerless deny；
  delivery→consent 若是 immediate NO ACTION 會阻塞 profile delete，改成 deferred NO ACTION 才能依 final
  state 正確收斂。
- 新 registry owner composite FK 所需的 non-deferrable three-column UNIQUE、所有 version 的 NOT NULL，
  以及 worker register/barrier admission race 都已補回契約。

使用者於 2026-08-31 確認：

1. 刪帳時 cascade 清除 Push consent/device/token、transport、outbox/delivery/payload，只留下最小
   ownerless deny registry row。
2. `update_session` 的通知相關欄位與 DB 現值完全相同時，不建立 `session_updated` Push。

本輪未做 hosted migration/deploy、browser/dispatcher/runtime、legacy erase 或 pending cancel。

## FA-03A3 dormant Push schema

已完成：

- 新增 `003`～`009` 七份 additive migration，依 relation 拆開 source version、message immutable、outbox
  format、runtime control、consent/registry 與 delivery，避免不必要的跨表 DDL lock。
- `sessions.notification_state_version` 只在契約列出的 16 個 domain 欄位真變更時加一；participant
  version 只看 session/profile/role/status/initiated-by。多欄只加一次，no-op、只改 `updated_at`、caller
  傳 `NULL` 或偽造值都不能改寫 DB version。`session_messages` 的 UPDATE 由 DB 全面拒絕，固定 source
  version `1` 不再只是應用程式慣例。
- outbox 以明確 format `1/2` 區分 legacy 與新版資料；format 2 的 source triple、expiry、fan-out 與
  outcome 都有 validated CHECK，`NULL source_id/source_version` 也會 fail-closed。deferred constraint
  trigger 禁止以 `open` commit；舊三欄 reminder unique index保持原樣，尚未提前切換 runtime 語意。
- 建立 private singleton control、worker ledger、空 canary allowlist；所有未查實的 lease/deadline/attempt/
  TTL safety 數值保持 `NULL`，沒有猜預設秒數或次數。
- consent、endpoint registry 與 per-device delivery 皆由 DB 維護 identity/version/timestamps；delivery
  只能從 pristine pending 建立，identity 不可換，terminal 結果不可復活。private tables 全部 RLS on、
  zero policy，PUBLIC/anon/authenticated/service_role 的 table、sequence、helper EXECUTE 全撤除。
- 真實 auth→profile→session→outbox/consent/registry/subscription/delivery/canary fixture 證實：一般直接
  刪 consent 會被 deferred audit FK 阻擋；刪 auth user 則清除 consent/device/token、raw subscription、
  outbox/payload、delivery、canary 與 session，只留下 algorithm/hash/state/reason/version 的 ownerless
  deny registry row，且三個時間欄皆為 `NULL`。
- generated public DB types 與 `notification_outbox` 精確欄位 allowlist 已同步。

刻意未做：

- 沒有新增或啟用 compatible command、browser consent UI、logout cleanup、dispatcher、cron 或新 grants。
- 沒有改舊 reminder scheduler 去重、移除 outbox format `DEFAULT 1`，也沒有啟用 format 2 writer。
- 沒有 hosted migration/deploy、legacy raw key 擦除、pending cancel 或其他不可逆 contract。

本批驗證：

```text
source-version pgTAP：60／60 passed
outbox-format pgTAP：33／33 passed
private-lifecycle pgTAP：84／84 passed
npm run test:db：11 files、1,014 tests，全數通過
npx supabase db lint --local --schema public,private：No schema errors found
strict pg-delta shadow replay：34 migrations 全部套用，public/private diff 為空
npm run db:gen-types：完成，差異只有核可的 public schema 欄位
npm run typecheck：通過
npm run lint：通過
Push／dispatcher Node tests：13／13 passed
git diff --check：通過
private schema 獨立覆核：兩個 Medium hardening 缺口修正後 zero blockers
全批最終覆核：INSERT version ownership blocker 修正並補真實 fixture 後 zero blockers
```

## FA-03A3.1 outbox deferred guard 相容性 hotfix

已完成：

- authenticated 邊界的 pre-fix 重現確認：test-only `SECURITY DEFINER` format 2 writer 返回後，deferred
  trigger 會以 `authenticated` 執行；原本 invoker-security helper 讀取 `notification_outbox` 時精準失敗為
  `42501 permission denied for table notification_outbox`。production writer 目前仍只寫 format 1，且因條件
  短路不會執行該 SELECT；本文件不把 test-only format 2 證據誤稱為現行 browser writer 行為。
- 新增 additive `010` migration，只把 `private.reject_open_notification_outbox_commit()` 改為
  `SECURITY DEFINER`，保留空 `search_path`，並再次撤除 PUBLIC、anon、authenticated、service_role 的
  直接 EXECUTE；沒有授予 browser role 任何 outbox SELECT。
- 新增 10 項 pgTAP，從 `authenticated` 邊界實證：helper owner 為 `postgres`、現行 `create_session`
  format 1 可提交、合法 frozen
  format 2 可提交、open format 2 仍以契約錯誤 `23514 NOTIFICATION_OUTBOX_FANOUT_OPEN` 被拒絕，且
  browser SELECT／直接呼叫 helper 持續禁止。
- 本機測試 DB 從零套用 35 份 migration（含 `001`～`010`），沒有修改 hosted 資料庫。

本批驗證：

```text
npm run test:db：12 files、1,024 tests，全數通過
npx supabase db lint --local --schema public,private：No schema errors found
npm run typecheck：通過
npm run lint：通過
npm run prettier:check：通過
git diff --check（migration／DB tests）：通過
```

## FA-03B0 auth identity fail-closed

已完成：

- `sessionIdentity()` 與 page/profile 共用的 `authIdentity()` 不再 fallback 到 `access_token`；只接受非空
  `session.user.id`。
- auth controller 會把缺少有效 `user.id` 的 candidate 正規化成匿名狀態；即使 caller 直接繞過
  profile orchestration，也不能把 access token 存成 owner identity 或啟動私人 participation load。
- profile orchestration 在 profile／notification 私人讀取前攔截不完整 session，失效在途 auth request、
  清 presence/profile/notification state、關閉 profile completion、回公開頁並提示重新登入。
- 新增 controller 與 orchestration 回歸測試，明確驗證 access token 不能當 identity、零私人
  participation load、route force-public 與私人 state reset 順序。

刻意未做：

- 本批沒有改 boot session 取得方式；Q9-A 的強制 Auth refresh 與 `INITIAL_SESSION` 競態留在下一個獨立
  commit。
- 沒有新增 Push device/cleanup command、改 logout scope、啟用 Push runtime，或做 hosted 寫入。

本批驗證：

```text
targeted auth tests：5／5 passed
npm run test:session-unit：341 top-level／355 total tests，全數通過
npm run test:mock：Chromium 298 passed／4 skipped
npm run typecheck：通過
npm run lint：通過
npm run prettier:check：通過
npm run build：通過
npm run check:production-bundle：結構檢查通過、development report 0 exceeded
git diff --check：通過
獨立 diff 覆核：zero correctness/security blockers
```

## FA-03B1 Q9-A Auth boot refresh gate

已完成：

- boot 不再把 `getSession()` 的 local cache 當登入證明；它只用來確認是否有可 refresh 的 session，接著
  必須以 no-argument `refreshSession()` 向 Auth server 取得非空 `user.id`＋`access_token`，並和同一輪
  `TOKEN_REFRESHED` 的 identity／token 完全相符，才會開啟私人 state 與資料載入。
- Auth callback 只記錄事件並排到下一個 task，避免在 auth-js subscriber 內重入 refresh deadlock；
  `INITIAL_SESSION` 不授權。SIGNED_OUT、換帳號、不同 token、pending publish、superseded refresh 與延遲
  cross-tab 事件都有 revision/proof barrier。已驗證 state 收到同 identity 的 `TOKEN_REFRESHED` 才能接續
  token rotation；一般 `SIGNED_IN` 只有 identity＋access token 都完全相同才可在重驗期間保留，token
  不同會先關閉。登出後的 stale `SIGNED_IN → TOKEN_REFRESHED` 必須重新 server 驗證，不能靠 local event 復活。
- 明確 4xx rejection 只接受固定 Auth code；network、5xx、timeout／未知錯誤維持 local public 並可在
  `online` 事件重試，不猜成匿名。auth-js initialize 吞掉 `session_not_found` 的已驗證版本行為，另由 exact
  refresh endpoint observer 提供一次性證據。
- observer 只比對 configured origin、精確 path、POST 與 `grant_type=refresh_token`；遵守 Fetch 的
  `init.method` override。它不讀 request body、不讀成功 token response；失敗 response 只保存 frozen
  `revision/kind/status/code`，不保存 credential、message 或 response body。
- 全部 app-owned auth storage 操作共用 `lock:${SUPABASE_AUTH_STORAGE_KEY}`。Web Locks `0` 保留立即失敗，
  其他 timeout 固定為 `-1`，不 timeout／不 steal；缺少 Web Locks 或 callback 沒有取得真正 lock 時直接
  fail-closed。OAuth sign-in／identity linking 共用同一 lock，並以安裝中的真實 GoTrueClient 驗證 PKCE
  verifier 與 linking 都能完成；SDK 自己負責 sign-out 的同名 lock。
- 登出仍會清私人 state，但「我」頁是可安全顯示匿名登入入口的公開頁，因此留在原頁；「我的球局／訊息」
  仍會導回公開地圖。這個真實 local browser 回歸已固定。
- Playwright 永久測試以同一 context 的兩個真實 page、共用 storage key 與安裝中的 GoTrueClient 驗證：
  refresh A 未完成時，B 換帳號或 local sign-out 必須等鎖，最終不能被 A 覆寫或復活。

精確邊界（不可過度宣稱）：

- 這是 Q9-A 的 **Auth boot／local private fail-closed 部分**，不是完整 Q9。`rejected` 尚未接到
  cleanup-token quarantine、Service Worker/private Push display gate 或 dispatcher；D2 production
  sign-out 也仍是 SDK 預設 global scope。
- observer 是單一 tab、latest／one-use 證據，尚未和未來 cleanup device／attempt 綁定；連接 server
  Push state 前必須補這層關聯。
- lock 保證只涵蓋目前 app-owned 呼叫；舊版分頁、外部 client、直接改 localStorage 或不用同名 lock 的
  程式不在保證內。SDK 固定為 `supabase-js/auth-js 2.110.0`；升級時必須重驗 lock name、refresh request、
  error code 與 event ordering。
- 不支援或錯誤實作 Web Locks 的 browser 會安全失敗；而 Supabase data request 也可能因取不到 auth
  session 而不可用。`-1` 是刻意無期限等待，沒有自行猜 timeout；持鎖 network request 若永久 pending，
  後續 auth/data 也會等待，private state 維持關閉。
- 真實 browser lock 測試涵蓋 desktop/mobile Chromium 與 Playwright WebKit，但 Auth HTTP 為 mock；沒有
  hosted Auth、Firefox、實體 Safari／裝置或真實 OAuth provider E2E。
- auth／online subscription 目前符合 app boot 只執行一次的 lifecycle；若未來支援 HMR/re-entry，需先補
  teardown ownership。

本批驗證：

```text
targeted Auth／lock／orchestration：43／43 passed
npm run test:session-unit：381 top-level／398 total，全數通過
npm run test:mock：Chromium 304 passed／4 skipped
真實雙分頁 GoTrueClient lock：desktop Chromium、mobile Chromium、mobile WebKit 共 9／9 passed
npm run test:local：local API 2／2；Supabase Chromium 45 passed／11 skipped
npm run test:local:mobile：6／6 passed
npm run typecheck／lint／prettier:check：全數通過
npm run build：509 modules，通過
npm run check:production-bundle：結構 gate 通過；development report 只有 total gzip 超額 1,324 bytes
npm run check:production-bundle:release：按 D8 預期 hard fail（260,386 > 259,062）
git diff --check：通過
兩路 Auth 獨立覆核：null-lock 與 stale cross-tab barrier 修正後 zero blockers
hosted migration／deploy／Auth 寫入：未執行
```

## 已知阻塞與風險

- 最新 development bundle 的 main 647,038／190,258 與最大 lazy 16,476／4,828 raw/gzip 均在現有門檻；
  total raw 849,662 也在 849,961 內，但 total gzip 260,386 超過 259,062 共 1,324 bytes。D8 允許開發期
  report 繼續，release enforce 已實測 hard fail；第一個 production candidate 前仍須依 D9 重訂正式基線。
- 現行 runtime 仍只讀寫 legacy `push_subscriptions` active row；新 consent／registry／delivery schema 已在
  repo／本機 dormant 建立，但尚無 public command 或 browser wiring，不能誤稱已啟用。
- outbox source/fanout/outcome、control/worker、account-delete audit 與 no-op source version 已完成本機
  migration／測試；compatible runtime、barrier 與 hosted 套用仍未做。
- 現行一般登出走 auth-js 預設 global scope，與 D2 尚未一致。
- D6 與 Q9-A Auth boot gate 已完成；但 explicit rejection 尚未觸發 cleanup-token quarantine，SW/private
  Push 與 dispatcher 也未接 gate，因此 Q9 整體仍未完成。
- Auth 跨頁安全依賴符合規格的 Web Locks 與目前固定的 auth-js 2.110.0 call shape；舊版 tab／外部 client
  不受新 lock 約束。`-1` 無期限等待避免 timeout-steal，但持鎖 request 若永久 pending 也會讓後續 auth/data
  等待；目前沒有未經證據自行設定 network timeout。
- 現行 dispatcher 沒有 delivery lease，且多裝置只有一個 outbox outcome；不能只加 quarantine filter。
- Web Push 與 PostgreSQL 沒有共同 transaction；Q6-A 已核可較弱但可實作的條件式邊界，仍須測試、
  監控並明列無法完全消除的斷線空檔。
- 現行 web-push 預設 TTL 四週且沒有明確 timeout；endpoint 可控制 Edge outbound target。兩者都是
  FA-03 deployment blocker，不能沿用隱含預設。
- Hosted public-schema default privileges 對 app roles 過寬；本批 private table／sequence／helper 已在各自
  migration 同步 revoke，後續 compatible command／public schema 物件仍須維持相同部署邊界。
- `canonical-endpoint-policy-v1` 尚未實作，不能用 SQL regex／ambient URL parser 猜 canonical 例外；
  這不阻擋 additive expand，但會阻擋 destructive contract。
- Vault 與 Edge 的 cron secret 目前只證明兩邊存在，metadata 不能證明值相同；現行 function 沒有
  side-effect-free healthcheck，因此本輪刻意沒有直接呼叫 hosted dispatcher。
- `ds-bundle/` 是人工同步資料包；繼續使用前要確認與目前 UI/CSS 一致。

## 下一個 session 的起點

1. 確認分支為 `codex/frontend-architecture-execution`，先讀本文件、FA-02 設計與 FA-03 preflight 報告。
2. 確認 `FA-03A2` contract、`FA-03A3` dormant schema、`FA-03A3.1` hotfix 與 `FA-03B1` Auth gate
   commit 都存在；不要重做已完成的 003～010 或 boot refresh gate。
3. 以 `npm run test:db` 的 1,024／1,024 作為 compatible runtime 的最新 DB 基線；A3 當時的 DB lint
   clean 與 strict shadow diff 空白仍是 schema foundation 證據，`010` hotfix 另有從零 replay 證據。
4. 從 rejected→cleanup-token quarantine、D2 local sign-out、SW/private Push gate 開始，再依 compatible
   command/browser/dispatcher → barrier → disabled deploy → canary → contract → enable 分批實作、測試，
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
| 2026-08-31 | FA-03A1 | sessions schedule version 與 outbox nullable/sentinel foundation 分成兩個無反向鎖序的 migration；837／837 通過，hosted 未套用。 |
| 2026-08-31 | FA-03A2 | schema contract 三路複查完成；使用者核可刪帳最小保留與 no-op 不推播，準備獨立 commit；hosted 未寫入。 |
| 2026-08-31 | FA-03A3 | 003～009 dormant schema、177 項新增 pgTAP 與真實刪帳 FK 測試完成；全套 DB 1,014／1,014、strict diff 空白，hosted 未套用。 |
| 2026-08-31 | FA-03A3.1 | 010 將 deferred outbox guard 收斂為 postgres-owned empty-path definer helper，browser 權限不放寬；從零 replay 與 DB 1,024／1,024 通過，hosted 未套用。 |
| 2026-08-31 | FA-03B0 | auth identity 只認非空 `user.id`；不完整 session 在私人 RPC 前 fail-closed，完整單元回歸 355／355、Chromium 298 passed。 |
| 2026-08-31 | FA-03B1 | boot 只接受 server refresh＋matching event；Web Locks 防跨頁覆寫，stale sign-out barrier 與真實 GoTrueClient 測試完成；Q9 Push cleanup 部分仍待實作。 |
