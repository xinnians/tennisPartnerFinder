# 前端架構開發進度

最後更新：2026-09-01

這是前端架構開發的**單一進度入口**。新的 session 應先讀本文件，再讀
`frontend-architecture-final-v3-2026-08-31.md`；舊的審查報告只作歷史紀錄，不直接代表目前狀態。

## 目前狀態

| 項目 | 狀態 |
| --- | --- |
| 工作分支 | `codex/frontend-architecture-execution` |
| 開發基準 | `51dde9c`（16 份前端架構審查文件首次入版） |
| 目前批次 | `FA-03B7` dormant owner-quarantine RPC adapter 完成；production runtime 零 import／caller |
| 整體狀態 | `FA-00`、`FA-01`、`FA-02` 完成；FA-03 preflight、`FA-03A0`～`FA-03A3.1`、`FA-03B0`～`FA-03B7` 已完成 |
| runtime 變更 | Auth gate、DB dormant command、本機 Edge、public-key build boundary、dormant IndexedDB、bounded cleanup transport 與 owner-quarantine adapter 已落地；後三者尚未接 production，Auth／登出、SW、dispatcher 尚未接線 |
| migration 變更 | repo／本機共新增 11 份 foundation／compatible／hotfix migration；hosted 尚未套用 |
| bundle checker／CI 變更 | checker 已分成開發期 report 與 release enforce；CI 仍走 report |
| 下一步 | 分批建立 v2 enable／refresh command、Auth rejected cleanup 與 D2 local sign-out coordinator；SW／dispatcher 仍各自分批，仍不部署 hosted |

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
| D12 | cleanup raw token 不直接送進 Edge invocation log 可見的 request body；採 application-layer RSA-OAEP-SHA256 隨機加密封包 | `FA-03B3` codec／key rotation／真實 Edge 解密與 DB 狀態轉換完成；browser 尚未接線 |
| D13 | cleanup Edge 先採 local-only、預設關閉；完成 distributed limiter、hosted canary 與 hosted log 證據前，不得在 hosted 執行 | `FA-03B3` 以 runtime marker＋exact local mode 強制；沒有 hosted deploy／secret／請求 |
| D14 | cleanup current public key 由 build-only public env 產生固定 same-origin v1 JSON，HTTP `no-store`；不綁進 `VITE_*` JS 常數 | `FA-03B4` generator／headers 與 `FA-03B6` dormant loader 已完成；目前未配置 key，production 尚無 caller |
| D15 | browser 必須在 enable network 前先保存 logical device、binding 與 raw cleanup token；需要 cleanup 時先獨立提交本機 fail-closed，再用另一筆原子交易把 token 搬到 immutable pending attempt；壞資料或較新 DB version 不自動刪除／降版 | `FA-03B5` dormant storage boundary 已完成；production 零 caller |
| D16 | dormant cleanup transport 每次明確呼叫最多送出 2 次 POST；只有第一個 response 完全符合 `503`＋exact `{"outcome":"RETRY"}` 與 URL／header 契約，才重新抓 key、重新加密並送第二次。其他錯誤、不明結果或第二次 `RETRY` 都保留 pending，不立即重送 | `FA-03B6` 已完成；沒有自行猜 timeout、backoff 或跨呼叫重試次數，production 零 caller |
| D17 | dormant owner-quarantine adapter 每次有效呼叫只送 1 次既有 `quarantine_push_device` RPC；exact `OK` 才回 completed、exact `STALE_PUSH_DEVICE` 才回 stale，其餘回 pending。UUID／version 不合法時在 RPC 前 fail-closed | `FA-03B7` 已完成；沒有 retry、timeout、backoff 或排程，production 零 caller |

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
| FA-03 | Push runtime 與 migration | preflight、`FA-03A0`～`FA-03A3.1`、`FA-03B0`～`FA-03B7` 完成；compatible runtime 進行中 | expand、DB、browser、dispatcher、雙帳號測試通過；不可逆 contract 另行確認 |
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

## FA-03B2 v2 transport 與 quarantine DB boundary

已完成：

- 新增 compatible `011` migration，在既有 `public.push_subscriptions` 加入七個 nullable v2 metadata：
  `consent_id`、endpoint／VAPID fingerprint algorithm＋digest、`transport_version`、`updated_at`。既有
  legacy row 七欄全部維持 `NULL`，沒有 backfill、轉換或擦除 endpoint／keys。
- DB 以 all-or-none CHECK、exact endpoint UTF-8 SHA-256 CHECK、同 owner consent／registry composite FK、
  consent 與 endpoint fingerprint partial unique index固定 v2 transport。trigger 強制新 transport version
  從 `1` 開始，semantic update 才加一；caller 不能偽造 version／timestamp，也不能在 legacy／v2 間換模式。
- authenticated 的 raw subscription table／sequence 權限全部撤除；現行 app 實際使用的
  `save_push_subscription`／`remove_push_subscription` signature 保留。service role 權限精確收斂為舊
  dispatcher 目前必要的 `SELECT/DELETE`，沒有 sequence／raw insert／update。
- legacy RPC 每次先鎖 runtime control；`legacy_writes_enabled=false` 固定拒絕
  `PUSH_CLIENT_UPGRADE_REQUIRED`。開啟期間仍只寫七欄皆 `NULL` 的 legacy row；一旦 exact endpoint
  fingerprint 已進 registry，不論同 owner／不同 owner、active／quarantined／deny，一律要求升級，
  不能用舊 RPC 繞過 owner lock 或重新放回 send material。
- `quarantine_push_device(device_id, consent_epoch, expected_version)` 只給 authenticated owner；仍 enabled
  但 epoch/version 不符時回 `STALE_PUSH_DEVICE`，不把零變更說成成功。exact match 才走共同 private
  helper；不存在或本來已 inactive 則以 `OK` 冪等收斂。
- cleanup token 的 DB command 只給 service role，且只接收 64 字元 lowercase SHA-256 hex digest；DB
  不接 reusable raw token。invalid／unknown／replay 都只回固定 `OK`，不回 owner、device、epoch、hash
  或狀態。raw token 的 32-byte canonical base64url 驗證與 Web Crypto hash 明確留在下一批獨立 Edge
  endpoint，尚未假裝已完成。
- 共同 helper 依 `profile → consent → registry → transport → delivery` 取鎖，在同一 transaction 把
  consent 轉 paused、registry 保留 owner 並轉 quarantined、刪除 endpoint／keys、取消同 epoch 的
  `pending/processing/unknown` delivery；既有 terminal delivery 不改，也不鎖／更新 outbox。
- 新增 68 項 pgTAP，涵蓋 exact schema／ACL、legacy shim、owner／token／stale／rotation／replay、跨帳號
  owner-lock 繞過、三種 non-terminal cancellation、terminal preservation、強制最後一步失敗的完整
  rollback，以及真實 account delete 仍只留下最小 ownerless deny fingerprint。
- generated public DB types 已同步兩個 command 與七個欄位；舊 browser repository 仍只走相容 RPC。

精確邊界（不可過度宣稱）：

- `new_runtime_mode` 仍為 `disabled`；本批沒有 enable command、沒有建立 production v2 row，也沒有切
  cron／dispatcher。現行 dispatcher 仍讀 legacy subscription，未參與 consent／delivery lock，因此只能
  宣稱 DB transaction 內的 quarantine 原子性，不能宣稱 adapter handoff 已符合 Q6-A。
- cleanup Edge endpoint、canonical token codec、rate limit、request body／log 去敏尚未實作；
  `quarantine_push_by_token` 是 service-role-only digest boundary，不是 browser 可直接呼叫的完整 API。
- Auth `rejected` 尚未接 cleanup、IndexedDB 尚無 logical device／raw token／pending attempt，production
  sign-out 仍是 global；Service Worker 也尚未做 owner／epoch／expiry gate，所以 Q9 與 D2 都未完成。
- 本批沒有雙連線 deadlock／pooler canary、hosted default-privilege 實測或 production Edge canary；這些
  必須在 compatible dispatcher／Edge 接線後補。`canonical-endpoint-policy-v1` 仍是 enable／contract
  blocker，不因本批 exact fingerprint CHECK 就視為完成。

本批驗證：

```text
quarantine targeted pgTAP：68／68 passed
npm run test:db：13 files、1,092 tests，全數通過
本機 DB 從零重播：36 migrations 全部套用
npx supabase db lint --local --schema public,private：No schema errors found
strict pg-delta shadow replay：public/private diff 空白
notification data／Push／dispatcher Node tests：13／13 passed
npm run test:session-unit：381 top-level／398 total，全數通過
npm run test:local：local API 3／3；Supabase Chromium 45 passed／11 skipped
npm run test:local:mobile：6／6 passed
npm run db:gen-types／typecheck／lint／prettier:check：全數通過
npm run build：509 modules，通過
npm run check:production-bundle：結構 gate 通過；既有 total gzip 仍超額 1,324 bytes
git diff --check：通過
獨立 source／runtime 覆核：legacy owner-lock bypass 修正後 zero blockers
hosted migration／deploy／Edge 寫入：未執行
```

## FA-03B3 加密 cleanup Edge boundary（local-only）

已完成：

- 新增 `push-cleanup` Edge Function，但不是 production 功能：只有環境精確等於
  `PUSH_CLEANUP_RUNTIME_MODE=local-test-v1`，且不存在 hosted 的 `DENO_DEPLOYMENT_ID`／`SB_REGION`
  marker 時才會讀 request body；marker 名稱依
  [Supabase hosted environment variables](https://supabase.com/docs/guides/functions/secrets) 核對。預設、設定錯誤與
  hosted 都先固定回 `503 RETRY`，不載入密鑰、解密或碰 DB。
- cleanup token 維持 32 random bytes、43 字元 canonical unpadded base64url。browser 端 helper 先把 43 個 ASCII
  bytes 用 RSA-OAEP／SHA-256 與固定 label `qiuka.tw/push-cleanup-token/v1` 隨機加密；Edge 解密後才 decode
  成原本 32 bytes 並算 SHA-256 digest。incoming body 因此只含每次不同的 ciphertext、公開 `kid` 與 version。
- `kid` 按 [RFC 7638](https://www.rfc-editor.org/rfc/rfc7638) 對 `{e,kty,n}` 算 SHA-256 thumbprint；v1 精確限制 RSA 2048-bit、exponent `AQAB`、
  一到兩把 standard private JWKS current／previous key。載入時會實做 public encrypt → private decrypt 自我檢查；
  結構正確但 CRT 私密參數損壞的 key 也會被拒絕。
- v1 request 不是拍腦袋設上限：2048-bit ciphertext 固定 256 bytes／342 base64url 字元，加上 43 字元 `kid`
  與固定 canonical JSON 後，實算必須正好 425 UTF-8 bytes。1024／3072 key 都拒絕，若未來改 3072 必須升
  protocol version 並重算 body contract。
- 只接受 exact canonical JSON、`application/json`、無壓縮、exact allowed HTTP(S) Origin、`POST`。foreign、
  `null`、missing 與 suffix Origin 都在 body／crypto／DB 前回 `403`；其他 malformed body 固定回 `200 OK`
  且不碰 DB，避免把解析細節回傳給呼叫端。
- 已知 `kid` 但 OAEP／token 失敗時，先取新的 32-byte random fallback，再 hash 並走相同 DB RPC；成功與失敗
  HTTP 外觀相同。已移除的 `kid` 固定回 `503 RETRY` 且不碰 DB，未來 client 必須重抓 public key、重加密後
  有限次重試，不能無限重送舊 ciphertext。
- Edge 只呼叫固定的 service-role-only `quarantine_push_by_token`，只傳 lowercase digest。新式
  `SUPABASE_SECRET_KEYS.default` 與本機 legacy key 都只放 `apikey`，不放 `Authorization`；RPC fetch 禁止
  redirect；header 用法依 [Supabase auth headers](https://supabase.com/docs/guides/functions/auth-headers) 核對。
  程式沒有 application log，也不回傳 token、digest、ciphertext、owner 或內部錯誤。
- `verify_jwt=false` 是刻意的 cleanup-token bearer boundary，不是 anonymous DB 權限；真正授權資料是 256-bit
  cleanup token。Origin 只能限制正常 browser，不當作非瀏覽器攻擊者的身分驗證。
- 真實本機 smoke 會產生臨時 RSA key／token、建立真實帳號與 `enabled` consent、啟動 pinned Supabase CLI
  2.115.0 的完整 Functions runtime，送 encrypted body，再直接確認 DB 已變成
  `paused|cleanup_quarantine`。結束時刪臨時帳號／env file 並停止 Edge runtime。
- 同一 smoke 在 runtime 完全停止後，掃 child output 與本專案全部 local Supabase container logs；實測沒有
  raw token、digest、RSA 私密欄位／完整 JWKS、新式 `SECRET_KEY` 或 legacy `SERVICE_ROLE_KEY`。這項證據只限
  本機，不能外推 hosted。
- ESLint 現在真的對 Edge JS 套 Deno globals＋recommended rules，對 TS entry 套 TypeScript recommended；
  CI canary 會直接讀 ESLint resolved config，避免只有 glob、實際檔案卻被 ignored 的假守門。

精確邊界（不可過度宣稱）：

- browser／IndexedDB／Auth rejected／local sign-out 尚未呼叫此 endpoint，production 使用者目前不會送出
  cleanup envelope；Service Worker／dispatcher 也未接 v2 gate。
- 沒有 hosted deploy、secret、request 或 DB 寫入。[Supabase Edge logging](https://supabase.com/docs/guides/functions/logging)
  說 invocation log 會收 request／response metadata；目前只確認本機 logs，仍沒有證據保證 hosted Edge →
  PostgREST 的 outbound digest body 不會被記錄。
- distributed limiter、可量測的 threshold、hosted log canary 與 deployment allowlist 尚未完成，所以 D13
  維持 hosted hard-disabled。即使誤 bulk deploy，handler 仍不執行 cleanup，但公開 request 仍可能產生成本。
- 固定 response 與相同 DB control flow 只能降低直接 oracle，不能宣稱 RSA／DB 是 constant-time。retired `kid`
  的 `503` 會透露公開 key ring 是否包含該公開 id；token match／no-match timing 也可能不同。
- pinned 本機 gateway 實測會攔截所有 `OPTIONS`，對允許與惡意 suffix Origin 都回 `200`、`ACAO: *`；POST
  仍由 handler exact-Origin gate 把 suffix Origin 擋成 `403`。這只描述 local CLI 2.115.0，不能外推 hosted。
- `supabase functions serve` 實際會啟動全部本機 Functions，env 也屬該 runtime 共用；repo 搜尋確認只有
  `push-cleanup` 讀三個 `PUSH_CLEANUP_*` 名稱，但這不是平台層 secret isolation。
- RPC fetch 已禁止 redirect；沒有可靠 latency 基線可訂 timeout，本批沒有猜秒數。正式啟用前必須以 hosted
  canary／failure distribution 定出 timeout 與 limiter，不可沿用本機速度。
- JavaScript immutable string 不能主動清零；可變 token／ciphertext／plaintext buffer 已在 `finally` 清零，
  但 raw-token string、serialized JWKS 與 service key 仍只能等 GC。正式 hosted 前仍需 log canary。

本批驗證：

```text
Edge／CI targeted：44 passed / 1 local-only skipped
真實 local Edge → DB smoke：1／1 passed；enabled → paused|cleanup_quarantine
npm run test:ci:frontend：通過；Node 423 passed / 1 skipped；Chromium 304 passed / 4 skipped
npm run test:ci:supabase：通過；DB 1,092／1,092、local API 3／3、desktop 45 passed / 11 skipped、mobile 6／6、Edge 1／1
npm run typecheck／lint／prettier:check／build／git diff --check：均由完整 CI 通過
npm run check:production-bundle：結構 gate 通過；既有 total gzip 仍超額 1,324 bytes，依 D8 只報告
三路 protocol／CI reliability／security 獨立覆核：修正 corrupt-key blind spot、uniform-OK DB blind spot、
preflight gateway 誤判、log key 漏掃、teardown masking 與 Edge lint 假覆蓋後，zero blockers
hosted migration／deploy／secret／Edge request／DB 寫入：未執行
```

## FA-03B4 可輪替 cleanup public-key boundary（dormant）

已完成：

- 將 browser 需要的 base64url、RFC 7638 thumbprint、RSA-OAEP encrypt、canonical envelope 與 public-key
  validator 抽到 `supabase/functions/_shared/push-cleanup-protocol.js`。Edge private key ring、decrypt、fallback
  digest 仍只在 `push-cleanup/crypto.js`；shared source 明確沒有 private-key loader、decrypt 或 private env。
- public key 不放進 `VITE_*` 或 app config，避免已開啟的舊 tab 永久綁住舊 JS 常數。Vite 只在 build／dev
  server 端讀 public-only `PUSH_CLEANUP_PUBLIC_JWK_JSON`，並產生固定同源路徑
  `/push-cleanup-key-v1.json`。依 [Vite env 文件](https://vite.dev/guide/env-and-mode.html)，只有 `VITE_*`
  會自動暴露給 client；本批也以真實 build 證明 key、modulus 與 env 名稱都沒有進 JS chunk。
- v1 env 只能是 exact canonical 479-byte public JWK；document 固定為 499-byte
  `{"key":{...},"version":1}`，只發布 current encrypt key。額外／重複／private 欄位、錯誤 `kid`、欄位順序、
  空白、尾端換行與非 2048-bit key 全部 fail build，沒有自動修正或寬鬆 alias。
- 沒有設定 public key 時不產生 placeholder asset；實際 production build 已確認檔案不存在，因此目前仍是
  dormant。`.env.example` 只留空的 public env 名稱，沒有生成或提交任何真實 key。
- Vite dev middleware 對 exact path 提供 `Cache-Control: no-store`、`Pragma: no-cache`、JSON content type 與
  `nosniff`；query alias／其他 method 不視為同一路徑。Vercel exact path 也加入 `no-store/no-cache`，政策依
  [Vercel Cache-Control 文件](https://vercel.com/docs/caching/cache-control-headers)；尚未部署，所以沒有宣稱
  production response 已實測。
- build test 以真實 Vite/Rollup output 驗證 configured 時只多一份 byte-for-byte canonical JSON，未配置時
  零 asset；JS chunks 不含 public `kid/n`、public env 名或 private env 名。lint／Prettier 範圍也擴到
  `_shared`，並由 resolved ESLint config canary 證明不是假 glob。
- 同一份共用協定已由真實本機 Edge runtime 再跑完整 envelope → RPC → DB quarantine，確認抽檔後 Deno
  bundle 與既有行為相容。

精確邊界（不可過度宣稱）：

- `FA-03B6` 已有 dormant browser loader／transport，但 production 尚無 import 或 caller，也沒有 Auth wiring；
  因此現行舊 tab **仍不會**自動抓 key 或送 cleanup。只有未來明確接線後，舊 tab 才能在每次 attempt 重新抓
  fixed same-origin key；loader 已採 499-byte bounded stream read，沒有使用無上限 `response.text()`。
- 固定同源 URL 讓未來 stable-origin 舊 tab 可重新抓新 deployment，但 commit-specific preview URL 與 rollback
  仍可能指向舊 asset。正式 rotation 必須按 private ring `[new, old]` → new asset → canary → retire old 的順序；
  不能以猜測天數移除 old key，也不能把已疑似外洩的舊 private key 為 rollback 放回。
- build 只驗 public document 本身；尚未有 deployment canary 證明 published `kid` 確實存在 hosted private
  ring。hosted Edge 仍由 D13 hard-disable，本批沒有 deploy、env 寫入、hosted request 或 DB migration。
- `no-store` 目前由設定測試與本機 middleware 證明，尚未由真實 Vercel response 證明。production／preview
  是否共用 Supabase project、允許的 stable origins、可安全 rollback 的 deployment 都仍需部署前查實。

本批驗證：

```text
public-key／Edge／CI／header targeted：54／54 passed
真實 local Edge → DB smoke：1／1 passed
npm run test:ci:frontend：通過；Node 430 passed / 1 skipped；Chromium 304 passed / 4 skipped
npm run build：509 modules；未配置 key 時沒有 public-key asset
npm run check:production-bundle：結構 gate 通過；既有 total gzip 仍超額 1,324 bytes，依 D8 只報告
typecheck／lint／prettier:check／git diff --check：完整 frontend CI 全部通過
獨立安全／build 審查：公私鑰邊界、canonical fail-closed、Edge 語意與真實 Vite dev/build 均 zero blockers
DB schema／migration：未變更；hosted deploy／env／request／DB 寫入：未執行
```

## FA-03B5 dormant browser Push storage foundation

已完成：

- 新增未接 production 的 `notificationPushStorage.ts`。IndexedDB 固定為
  `tennis-partner-finder-push` v1，只有 `meta`、`current-binding`、`pending-cleanups` 三個 store；前兩個是
  singleton，pending 以 `bindingId` unique index 防止同一 binding 重複排隊。
- logical device 使用 Web Crypto UUIDv4。同一個 browser storage context 可跨 reload 與分頁共用；刪除整個
  IndexedDB 後才建立新 device。模組 import 本身不開 DB。
- future enable 必須先建立 `provisioning`：先用 Web Crypto 產 32 random bytes，再保存成 43 字元 canonical
  base64url cleanup token。server response 只能把同一筆 provisioning 提升為 `enabled`，不能替換 raw token；
  consent 的 PostgreSQL bigint ID／version 以 canonical decimal string 保存，避免 JavaScript number 精度遺失。
- mutation 以 exact auth user、binding 與隨機 local revision 做 CAS。兩個分頁同時建立 device／provisioning
  只會得到同一筆；同時 cleanup 只有一筆成功，舊 revision 固定回 `PUSH_STORAGE_STALE` 且零寫入。
- cleanup 分兩步：第一筆 transaction 先把本機改成 `cleanup-required`，立即 fail-closed；第二筆 transaction
  再把 current binding 刪除並以 `add` 搬成 immutable pending attempt。第二筆若 abort，刪除也會 rollback，
  `cleanup-required` 與原 token 都還在，不會回到 `enabled`。
- `auth-unverified` 專門表示 Auth 網路結果不明：本機停用但不宣稱 server 已 quarantine，也不先排 cleanup。
  它只能單向升級為真正 cleanup；本批沒有 resume API。
- current binding 與 pending attempt 不可共存；pending 未精確完成前不能建立新 provisioning。一般 runtime
  snapshot 不回 raw token，只有明確的 provisioning／pending transport API 可以讀取。完成 cleanup 只刪除
  所有欄位逐一相符的 attempt；修改內容或舊 response 都不能碰新的 current binding。
- 每次操作會檢查 DB version、exact store／index、record exact keys、UUID、token、bigint 與跨 record device
  關係。多餘 singleton row、壞資料或較新的 physical DB version 都 fail-closed，且不刪除、不修正、不降版。
  connection 每次 transaction 完成後關閉，並在 `versionchange` 立即關閉。
- production `src` 沒有其他檔案 import 此模組；模組也沒有 dataApi、Supabase client、network、Auth、UI、SW、
  `localStorage`、`sessionStorage` 或 `Math.random()` fallback。目前 production 行為完全不變。

精確邊界（不可過度宣稱）：

- IndexedDB 不是同源 XSS 的秘密保管箱；raw token 仍是 browser-held bearer secret。真正的損害限制仍來自
  token 只能 quarantine，不能讀取、啟用、刪除或轉讓 Push。
- `FA-03B6` 已有 dormant 499-byte bounded key loader、cleanup HTTP transport 與單次呼叫最多 2 POST 的有限重試；
  仍無 production caller、v2 enable／refresh command、Auth rejected、D2 local sign-out 或 SW display gate。
  `auth-unverified` 只證明本機 fail-closed。
- 現行 `public/push-sw.js` 是 classic Service Worker，不能直接 import 這份 TS／ESM module。SW 批次必須先
  選擇可 bundle 的 module worker 或單一共享 schema artifact，不能複製兩份 validator 後假設永遠同步。
- targeted tests 實測 Playwright desktop Chromium、Pixel 5 Chromium emulation 與 iPhone 12 WebKit emulation；
  這不是 Android／iPhone 實機證據，也尚未驗 Firefox、installed PWA 與各平台 storage partition matrix。
- 模組尚未進 production graph，所以本批沒有修改 privacy page；真正開始保存本機 Push 狀態前必須更新。
- 本批沒有 migration、hosted deploy、env、request 或 DB 寫入，也沒有配置 public key。

本批驗證：

```text
Push storage targeted Node／CI canary：29／29 passed
真實 browser IndexedDB targeted：15／15 passed（desktop Chromium、mobile Chromium、mobile WebKit 各 5）
npm run test:ci:frontend：通過；Node 432 passed / 1 skipped；Chromium 314 passed / 4 skipped
npm run build：509 modules；production output 不含 B5 DB name／error marker，bundle bytes 與 B4 相同
npm run check:production-bundle：結構 gate 通過；既有 total gzip 仍超額 1,324 bytes，依 D8 只報告
typecheck／lint／prettier:check／git diff --check：完整 frontend CI 全部通過
DB schema／migration：未變更；hosted deploy／env／request／DB 寫入：未執行
```

## FA-03B6 dormant bounded browser cleanup transport

已完成：

- 新增未接 production 的 `notificationPushCleanupTransport.ts`。建立 transport 不會開 DB 或發 request；只有
  明確呼叫 `loadPublicKey()` 或 `sendPushCleanup()` 才會產生網路行為。
- public-key loader 只讀 browser origin 下固定的 `/push-cleanup-key-v1.json`，使用 GET、
  `credentials: omit`、`cache: no-store`、禁止 redirect。只接受 HTTP 200、exact response URL、核可的 JSON
  Content-Type、`Cache-Control` 含 `no-store`，以及 canonical 且實際 UTF-8 長度恰為 499 bytes 的 document。
- response body 不使用無上限的 `response.text()`／`response.json()`。public key 最多讀 499 bytes；cleanup
  response 最多讀 19 bytes；超限會取消 stream，無效 UTF-8 或非 canonical 內容一律 fail-closed。讀取用的
  mutable byte buffers 會清零。
- cleanup token 先在本機驗證為 canonical 32-byte token，再以當次取得的 key 做 RSA-OAEP-SHA256 加密。
  POST body 只接受 canonical 且實際長度恰為 425 bytes 的 envelope；request URL、headers 與 body 都不含 raw
  cleanup token。shared protocol 也會清零 token decode bytes、plaintext 與 mutable ciphertext buffer。
- 每次明確呼叫最多送 2 次 POST。只有 exact URL／header、HTTP 503 與 exact
  `{"outcome":"RETRY"}` 同時成立，才重新抓 current key、重新加密並送第二次；exact HTTP 200＋exact
  `{"outcome":"OK"}` 才回 `completed`。網路錯誤、abort、redirect、header／URL／body 不符、response 超限
  或第二次 `RETRY` 都回 `pending`，不在同一次呼叫內繼續送。
- transport 沒有自行設定 timeout、backoff、jitter 或 timer，只接受 caller 傳入的 `AbortSignal`；也不自行刪除
  B5 IndexedDB attempt。browser 整合測試只在 exact `completed` 後，另外呼叫 B5 exact CAS completion。
- production `src` 沒有其他檔案 import transport；transport 也沒有 storage、Auth、UI、Service Worker、
  data API、Supabase client、session credential、log 或 persistence dependency。D13 hosted hard-disable 沒有變動，
  production runtime 行為不變。

精確邊界（不可過度宣稱）：

- 本批沒有接 v2 enable／refresh、Auth rejected、D2 local sign-out、Service Worker 或 dispatcher，也沒有
  production caller；不能寫成 production cleanup 已啟用。
- transport 只回 `completed`／`pending`，不會自行刪 IndexedDB attempt。每次呼叫最多 2 POST 不是跨呼叫的
  全域上限；未來 coordinator 若反覆呼叫，仍需另外定義持久化排程、租約與退避。
- transport 沒有內建 timeout。caller 未 abort 且底層 fetch 永久不結束時，呼叫也可能一直 pending；目前沒有
  證據支持自行猜 timeout 或 backoff 秒數。
- 499 是 public-key **實際解碼後 body** 的上限且 body 必須恰為 499 bytes；425 是 outgoing canonical envelope
  的精確大小；19 只是 cleanup response 的最大讀取量，不代表 OK response 必須是 19 bytes。
- `Content-Length` 可以不存在；存在時只拒絕格式錯誤或大於上限，不要求它等於 browser 解碼後的 body 長度。
  browser 可能先處理 HTTP compression，所以本批也沒有猜測性地禁止 `Content-Encoding`；目前證據不能宣稱
  bounded reader 可限制瀏覽器在 JavaScript 取得 decoded stream 前的解壓資源成本。
- cleanup endpoint 只限制 HTTPS（loopback 可 HTTP）與 exact `/functions/v1/push-cleanup` path，尚未建立
  Supabase project hostname allowlist。兩個分頁也沒有共用 Web Lock，可能同時送同一 attempt；server
  idempotency 與 B5 exact CAS 可避免誤刪，但不是 traffic deduplication。
- browser 測試使用注入的 fake fetch／Response；實測的是 browser WebCrypto、ReadableStream 與 IndexedDB，
  不是真實 Vercel asset、Supabase gateway、local Edge 或 hosted end-to-end 證據。mobile Chromium／WebKit 是
  Playwright Pixel 5／iPhone 12 emulation，不是 Android／iPhone 實機。
- public key 仍未配置或部署，也沒有真實 hosted asset／response-header canary。distributed limiter、hosted log、
  stable origin／preview-to-production mapping、private key ring 對齊與有證據的 timeout 都仍缺；hosted handler
  因此繼續 hard-disabled。
- raw token 是 JavaScript string，語言本身無法可靠清零；本批只清零可控制的 mutable byte buffers。同源 XSS
  仍可能讀取 browser-held token，B5 所列 bearer-secret 風險沒有消失。

本批驗證：

```text
cleanup transport／Edge／CI targeted Node：68／68 passed（transport 本身 11／11）
真實 browser crypto／stream／IndexedDB targeted：12／12 passed（desktop Chromium、mobile Chromium、mobile WebKit 各 4）
browser repeat-each 壓力重跑：60／60 passed；Node transport 21 輪共 231／231 passed
npm run test:ci:frontend：通過；Node 445 passed / 1 skipped；Chromium 322 passed / 4 skipped
npm run build：509 modules；production output 不含 B6 transport／error marker，未配置 key 時仍無 public-key asset
npm run check:production-bundle：結構 gate 通過；total gzip 超額 1,324 bytes，依 D8 只報告
typecheck／lint／prettier:check／git diff --check：完整 frontend CI 全部通過
獨立程式／安全／測試審查：最新版 zero blockers；exact-response、same-key re-encrypt 與 token 不跨 browser test boundary 均已複查
DB schema／migration：未變更；hosted deploy／env／request／DB 寫入：未執行
```

## FA-03B7 dormant owner-quarantine RPC adapter

已完成：

- 新增未接 production 的 `notificationPushOwnerQuarantine.ts`。factory 只接受注入的 RPC function；建立 adapter
  本身不呼叫 RPC，也不讀 Auth、storage 或 network。
- `deviceId` 與 `consentEpoch` 必須是 lowercase canonical UUID；`consentVersion` 必須是
  `1`～`9223372036854775807` 的 canonical PostgreSQL bigint 十進位字串。缺欄位、number、前導零、符號、
  小數、超過 bigint 上限或非 canonical UUID 都在 RPC 前以固定錯誤拒絕，錯誤內容不夾帶輸入。
- 每次有效呼叫固定只呼叫既有 `quarantine_push_device` 一次，參數只包含 `p_device_id`、
  `p_consent_epoch`、`p_expected_version`；version 全程保留 string，不轉成不安全的 JavaScript number。
- 只有 `{ data: "OK", error: null }` 回 `completed`；只有 exact `STALE_PUSH_DEVICE` 回 `stale`。RPC throw、
  error 非 null／缺失、未知或非 exact outcome、無效 response 都回 `pending`，不重試，也不把底層錯誤傳出去。
- 新單元測試已納入 `test:session-unit`；source canary 同時要求 production graph 零 import，且 adapter 沒有
  secret、storage、直接 network、log、timer、timeout 或 random dependency。
- 真實本機 Supabase Data API 已把最大 bigint 字串送入現有 RPC 並收到 exact `OK`，證明目前
  Supabase／PostgREST boundary 可解析完整 int64 字串，不需要經過 JavaScript number。

精確邊界（不可過度宣稱）：

- adapter 本身不驗證 Auth/session；owner 權限仍由未來注入的 authenticated RPC client，以及資料庫既有 ACL
  與函式內 owner check 執行。注入 seam 不代表 production Data API 已完成接線。
- DB 的 `OK` 是刻意不洩漏資料的結果：不存在、非 owner 或已非 enabled 的 row 也可回 `OK`。因此
  `completed` 只表示 RPC 已接受並完成它的既定流程，不證明原本一定存在一筆裝置或真的發生狀態轉換。
- owner RPC 只適用於仍有有效 owner session、且 caller 已確認目前 user 與本機 binding owner 相同的路徑。
  換帳號或 Auth 已 rejected 時仍應走 cleanup-token 路徑；本批沒有建立這個 coordinator。
- `stale` 只表示 enabled owner row 的 epoch／version 不符，不表示 cleanup 完成；`pending` 也沒有由本 adapter
  寫進 B5 durable storage 或安排重試。本批沒有 import B5／B6、標記本機 fail-closed、unsubscribe、sign-out，
  或刪除任何 pending attempt。
- 本機 max bigint 測試使用不存在的隨機 device，證明的是 string 穿過 PostgREST bigint parser；matching row、
  stale 與跨 owner 的 DB 語意另由既有 68 項 quarantine pgTAP fixture 證明，不能混成同一項證據。
- generated `databaseTypes.ts` 目前仍把 RPC bigint 參數表示為 `number`。B7 刻意使用 string 保留精度；未來
  production wiring 必須增加 typed wrapper 與真實 bound-client integration test，不能轉回 `Number()`。
- 本批沒有 v2 enable／refresh、Auth rejected、D2 local sign-out、Service Worker、dispatcher 或 production
  caller；現行 production Push 與 global sign-out 行為沒有改變。
- 本批沒有 migration、schema、hosted deploy、env 或 hosted request。public key 仍未配置，D13 hosted
  hard-disable、distributed limiter、hosted canary／log 與 canonical endpoint policy blocker 都沒有解除。

本批驗證：

```text
owner-quarantine／Push／CI targeted Node：38／38 passed（adapter 本身 5／5）
真實 local Supabase Data API max-bigint string：1／1 passed
既有 quarantine command pgTAP：68／68 passed
npm run test:ci:frontend：通過；Node 452 passed / 1 skipped；Chromium 322 passed / 4 skipped
npm run build：509 modules；production JS byte totals 與 B6 相同，沒有 B7 RPC／error marker
npm run check:production-bundle：結構 gate 通過；total gzip 超額 1,324 bytes，依 D8 只報告
typecheck／lint／prettier:check／git diff --check：完整 frontend CI 全部通過
獨立程式／安全／測試複核：最新版 zero blockers
DB schema／migration：未變更；hosted deploy／env／request／DB 寫入：未執行
```

## 已知阻塞與風險

- 最新 development bundle 的 main 647,038／190,258 與最大 lazy 16,476／4,828 raw/gzip 均在現有門檻；
  total raw 849,662 也在 849,961 內，但 total gzip 260,386 超過 259,062 共 1,324 bytes。D8 允許開發期
  report 繼續，release enforce 已實測 hard fail；第一個 production candidate 前仍須依 D9 重訂正式基線。
- 現行 browser／dispatcher 仍只讀寫 legacy `push_subscriptions`；repo／本機已有 v2 transport metadata、
  dormant quarantine command 與 local-only encrypted Edge，但沒有 enable／browser wiring，不能誤稱已啟用
  或已停止 production send。
- outbox source/fanout/outcome、control/worker、account-delete audit 與 no-op source version 已完成本機
  migration／測試；compatible runtime、barrier 與 hosted 套用仍未做。
- 現行一般登出走 auth-js 預設 global scope，與 D2 尚未一致。
- D6 與 Q9-A Auth boot gate、quarantine DB digest boundary、local-only encrypted Edge 已完成；但 explicit
  rejection 尚未由 browser 呼叫 Edge，SW/private Push 與 dispatcher 也未接 gate，因此 Q9 整體仍未完成。
- Auth 跨頁安全依賴符合規格的 Web Locks 與目前固定的 auth-js 2.110.0 call shape；舊版 tab／外部 client
  不受新 lock 約束。`-1` 無期限等待避免 timeout-steal，但持鎖 request 若永久 pending 也會讓後續 auth/data
  等待；目前沒有未經證據自行設定 network timeout。
- 現行 dispatcher 沒有 delivery lease，且多裝置只有一個 outbox outcome；不能只加 quarantine filter。
- Web Push 與 PostgreSQL 沒有共同 transaction；Q6-A 已核可較弱但可實作的條件式邊界，仍須測試、
  監控並明列無法完全消除的斷線空檔。
- 現行 web-push 預設 TTL 四週且沒有明確 timeout；endpoint 可控制 Edge outbound target。兩者都是
  FA-03 deployment blocker，不能沿用隱含預設。
- Hosted public-schema default privileges 對 app roles 過寬；`011` 已在 migration 內把 subscription ACL
  精確重設為 authenticated 無 raw 權限、service role 只有舊 dispatcher 必需的 SELECT／DELETE，但 hosted
  尚未套用，其他後續 public schema 物件也仍須維持相同部署邊界。
- cleanup raw-token codec、application-layer encryption、local Edge、本機 log 去敏、build-time public-key
  asset、dormant IndexedDB、bounded browser transport 與 owner-quarantine adapter 已完成；但 production graph
  對三個 browser foundation 都是零 import／caller，Auth／登出／SW／dispatcher 尚未接線，distributed limiter
  與 hosted log 證據仍缺。hosted handler 因此 hard-disabled，不能把本機結果外推為完整 production cleanup API。
- public-key dev server 的 query alias 會落到既有 SPA fallback 並回 `200 text/html`，不是 key response、也沒有
  洩漏 key。dormant loader 已固定無 query 的 same-origin URL，並驗 `Content-Type`、`no-store`、499-byte body 與
  canonical JSON；正式 Vercel response、compression 與 stable-origin 行為仍待 hosted canary。
- 本機 gateway 對 preflight／response 會覆寫 `ACAO: *`；handler exact Origin gate 已由惡意 suffix POST
  實測為 `403`，但 Origin 不是非瀏覽器身分驗證，真正 bearer authorization 仍是 256-bit cleanup token。
- `supabase functions deploy`／`serve` 會涵蓋多個 Functions；即使 hosted handler 不執行 DB，誤部署仍可能
  帶來公開請求成本。正式啟用前仍需 deployment allowlist、distributed limiter、hosted log canary 與有證據的
  RPC timeout；目前只先禁止 redirect，沒有猜測 timeout 秒數。
- `canonical-endpoint-policy-v1` 尚未實作，不能用 SQL regex／ambient URL parser 猜 canonical 例外；
  這不阻擋 additive expand，但會阻擋 destructive contract。
- Vault 與 Edge 的 cron secret 目前只證明兩邊存在，metadata 不能證明值相同；現行 function 沒有
  side-effect-free healthcheck，因此本輪刻意沒有直接呼叫 hosted dispatcher。
- `ds-bundle/` 是人工同步資料包；繼續使用前要確認與目前 UI/CSS 一致。

## 下一個 session 的起點

1. 確認分支為 `codex/frontend-architecture-execution`，先讀本文件、FA-02 設計與 FA-03 preflight 報告。
2. 確認 `FA-03A2` contract、`FA-03A3` dormant schema、`FA-03A3.1` hotfix、`FA-03B1` Auth gate、
   `FA-03B2` quarantine DB boundary、`FA-03B3` local-only encrypted Edge、`FA-03B4` public-key asset、
   `FA-03B5` dormant IndexedDB storage、`FA-03B6` bounded browser cleanup transport 與 `FA-03B7` dormant
   owner-quarantine adapter 都存在；不要重做已完成的 003～011、Auth gate、transport linkage、RSA envelope、
   key generator、browser storage schema、key loader、owner result mapping 或 bigint string boundary。
3. 以 `npm run test:db` 的 1,092／1,092 作為 compatible runtime 的最新 DB 基線；36 migration 從零重播、
   DB lint clean 與 strict pg-delta diff 空白是目前 schema 證據。
4. `FA-03B5`～`FA-03B7` 已建立 dormant storage、bounded cleanup transport 與 owner RPC adapter；下一批分批
   建立 v2 enable／refresh command、Auth rejected cleanup 與 D2 local sign-out coordinator。SW／dispatcher 仍
   各自分批完成並建立獨立 commit；沒有 hosted limiter／canary／log 證據前，不可移除 local-only gate。
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
| 2026-08-31 | FA-03B2 | v2 transport linkage、legacy shim／ACL 與 owner／token-digest quarantine DB boundary 完成；owner-lock bypass 修正，1,092 DB tests 通過；Edge／browser／dispatcher 仍未接線。 |
| 2026-08-31 | FA-03B3 | 使用者核可 encrypted envelope＋local-only；RSA-OAEP v1、hosted hard gate、真實 Edge→DB quarantine 與本機全 logs 敏感值掃描完成；browser／hosted／dispatcher 未接線。 |
| 2026-08-31 | FA-03B4 | fixed same-origin v1 public-key asset、public-only canonical generator、encrypt-only shared protocol 與 no-store headers 完成；未配置 key、未接 browser、未部署 hosted。 |
| 2026-09-01 | FA-03B5 | dormant IndexedDB logical device、persistent provisioning、local fail-closed 與 immutable pending cleanup foundation 完成；production 零 caller、零 network、零 hosted 寫入。 |
| 2026-09-01 | FA-03B6 | dormant 499-byte key loader、425-byte encrypted cleanup POST 與每次呼叫最多 2 POST 的 exact RETRY transport 完成；production 零 caller、未配置 key、未部署 hosted。 |
| 2026-09-01 | FA-03B7 | dormant owner-quarantine RPC adapter、exact OK／STALE／pending mapping 與 bigint string boundary 完成；production 零 caller，Auth rejected／D2 sign-out／hosted 均未接。 |
