# 前端架構開發進度

最後更新：2026-08-31

這是前端架構開發的**單一進度入口**。新的 session 應先讀本文件，再讀
`frontend-architecture-final-v3-2026-08-31.md`；舊的審查報告只作歷史紀錄，不直接代表目前狀態。

## 目前狀態

| 項目 | 狀態 |
| --- | --- |
| 工作分支 | `codex/frontend-architecture-execution` |
| 開發基準 | `51dde9c`（16 份前端架構審查文件首次入版） |
| 目前批次 | `FA-02` Push lifecycle 詳細設計 |
| 整體狀態 | `FA-00`、`FA-01` 完成；`FA-02` 技術草案完成，等待 10 項產品／migration 核可 |
| runtime 變更 | 無 |
| migration 變更 | 無 |
| bundle checker／CI 變更 | checker 已分成開發期 report 與 release enforce；CI 仍走 report |
| 下一批 | 核可 `FA-02` 十項決策後，排定 `FA-03` Push runtime／migration |

查實際 Git 狀態：

```bash
git status --short
git branch --show-current
git log --oneline --decorate -10
```

## 已確認決策

| ID | 決策 | 實作狀態 |
| --- | --- | --- |
| D1 | Push 同意採「帳號＋裝置」opt-in；換帳號必須重新同意 | `FA-02` 已提出 consent／device model；待核可後於 `FA-03` 實作 |
| D2 | 一般登出只停止目前裝置的登入與推播；其他裝置不受影響 | `FA-02` 已設計 server-first cleanup＋local sign-out；待核可 |
| D3 | Push cleanup 結果不明時採 durable quarantine；dispatcher 送出前重查狀態 | `FA-02` 已設計 endpoint registry tombstone 與條件式送出排序；待核可 |
| D4 | 只接受 quarantine 寫入前已交給外部 push service 的通知無法追回；不接受僅載入 dispatcher 記憶體後仍送出 | 現有 stack 無法證明原精確邊界；Q6 明列較弱 current-stack 邊界與停用／換基礎設施選項 |
| D5 | quarantine 的重新確認、保存期限與到期處理由 `FA-02` 提案後再核可；不先猜 30／90 天 | 已提案「只依事件解除、不設時間到期」；待 Q1 核可 |
| D6 | session 缺少 `user.id` 時 fail-closed：視為無效、清私人狀態並要求重新登入 | 是 FA-03 前置或同批依賴；目前仍 fallback 到 access token |
| D7 | `ds-bundle/` 與 `.design-sync/` 保留並持續使用於 UI/UX 優化 | 已決策；同步前仍需全量重驗，不能假設自動同步 |
| D8 | 開發期 bundle bytes 只報告、不阻擋 CI；demo／E2E hook／隱私與拆包邊界仍 hard fail | `FA-01` 已完成 |
| D9 | 第一個 production release candidate 前，依 route、裝置、網路、gzip／Brotli 與 Web Vitals 基線重訂並啟用 hard byte limits | 待 production baseline |

## 授權邊界

- 使用者已設定持續開發目標：依本文件逐批執行，只有產品決策、migration 核可或不可逆操作才停下確認。
- 已完成 `FA-00`、`FA-01`；可直接進行 `FA-02` 設計與唯讀查證。
- Push runtime／migration 必須先取得 FA-02 Q1–Q10 核可；不可逆 contract 前還要回報 hosted 實際影響筆數。
- 不自行 push 遠端；每批以獨立 commit 保存。

## 批次總表

| 批次 | 內容 | 狀態 | 完成條件 |
| --- | --- | --- | --- |
| FA-00 | 建立進度單一來源、回填已確認決策 | 完成 | 文件差異與 whitespace 檢查通過；無非文件變更 |
| FA-01 | 文件／rules 對齊；bundle 結構 hard gate 與開發期 size report 分流 | 完成 | 非 byte 邊界仍可翻紅；bytes 可報告；release enforcement 路徑存在 |
| FA-02 | Push lifecycle、quarantine、consent、local sign-out 詳細設計 | 草案完成，待核可 | state machine、資料模型、到期方案、RPC／SW／dispatcher／測試矩陣完整 |
| FA-03 | Push runtime 與 migration | 未授權 | `FA-02` 核可後另行開始；DB、browser、雙帳號測試通過 |
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

尚未做：

- 沒有修改 runtime、migration、generated types、Edge Function、Service Worker 或測試。
- 沒有查證 hosted production row 數、grant、cron、Edge env 或 provider 行為；這些是 FA-03
  migration 前的只讀 preflight。
- 沒有執行不可逆的 legacy key 擦除或 pending outbox 取消。

等待使用者確認：

1. quarantine 採事件解除或時間解除。
2. 同帳號同 logical device 重新登入時，手動或自動恢復 Push。
3. 一般 notification 在事件建立時或送出時固定接收裝置。
4. legacy subscription 是否在 hosted canonical preflight 零例外時全部隔離並刪除 raw send material；
   任一例外都會停下另行核可。
5. cutover 前 pending outbox 要取消，或另做會覆寫一般 fan-out 規則的 legacy 特例設計。
6. D4 接受較弱的 current-stack 條件式邊界，或維持嚴格定義並先停用／更換基礎設施。
7. 帳號刪除後保留 ownerless deny fingerprint、完整刪除，或等待 deactivation 才刪帳。
8. Push service TTL 用 DB 剩餘時間扣安全 budget（接受 RFC transit 仍可能晚到），或固定為 0；兩者的
   DB row 都會到期。
9. 遠端 session revoke 採 app boot 強制 Auth refresh、明確被拒後暫停（離線期間仍有 server 窗口），
   或先停 FA-03、另設計 server-side auth session 綁定／撤銷訊號。
10. 先只開兩種 reminder、其餘 8 種 Push fail-closed，或核可完整 deadline＋domain invalidation matrix
    作為新的產品規則。

本輪已實測：

```text
notification data／Push／dispatcher Node tests：13 passed（8 個直接屬 Push／dispatcher）
npm run test:db：804 tests，802 passed / 2 failed
```

DB 的兩個失敗已定位為 reminder fixture 使用全庫總數，被本機既有 candidate session 多算；不是
FA-02 程式變更造成，但必須在 FA-03 前修成資料隔離斷言。

## 已知阻塞與風險

- 開發期 bytes 已改為 report；release hard limits 仍沿用歷史數值，必須在第一個 production
  release candidate 前依真實裝置、網路、gzip／Brotli 與 Web Vitals 重訂，不能把目前通過當成正式基線。
- 現行 `push_subscriptions` 只有 active row，沒有 quarantine／consent／expiry state。
- 現行一般登出走 auth-js 預設 global scope，與 D2 尚未一致。
- 現行 identity helpers 仍以 `access_token` fallback，與 D6 尚未一致。
- 現行 dispatcher 沒有 delivery lease，且多裝置只有一個 outbox outcome；不能只加 quarantine filter。
- Web Push 與 PostgreSQL 沒有共同 transaction；原 D4 的精確邊界尚未能滿足，必須先完成 Q6 決策。
- 現行 web-push 預設 TTL 四週且沒有明確 timeout；endpoint 可控制 Edge outbound target。兩者都是
  FA-03 deployment blocker，不能沿用隱含預設。
- `ds-bundle/` 是人工同步資料包；繼續使用前要確認與目前 UI/CSS 一致。

## 下一個 session 的起點

1. 確認分支為 `codex/frontend-architecture-execution`，並讀本文件與 FA-02 設計文件。
2. 取得 FA-02 Q1–Q10 的使用者答案；未核可前不修改 Push runtime 或 migration。
3. 核可後先把答案回填兩份文件，再對 hosted 專案做只讀 preflight 並輸出實際影響筆數。
4. migration 執行前再確認不可逆的 legacy raw endpoint／keys 擦除與 pending outbox 取消。
5. FA-03 必須依設計分批實作、測試、更新本文件並建立獨立 commit；不得直接推遠端。

## 進度紀錄

| 日期 | 批次 | 紀錄 |
| --- | --- | --- |
| 2026-08-31 | FA-00 | 建立執行分支、單一進度入口，寫入已確認產品與開發政策。 |
| 2026-08-31 | FA-01 | Bundle 結構 hard gate 與 byte report／release enforce 分流完成，rules 與測試同步。 |
| 2026-08-31 | FA-02 | 完成 Push 現況稽核與詳細設計草案；runtime／migration 未動，等待十項核可。 |
