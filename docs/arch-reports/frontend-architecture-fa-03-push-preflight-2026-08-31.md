# FA-03 Push hosted preflight

最後更新：2026-08-31
狀態：**pre-expand 唯讀盤點完成；可開始本機 additive expand，尚未核可或執行 hosted migration／contract**
依據設計：`frontend-architecture-fa-02-push-lifecycle-design-2026-08-31.md`
去敏證據：`frontend-architecture-fa-03-push-preflight-evidence-2026-08-31.md`

這份文件只記錄查到的事實。沒有把 endpoint、Push keys、payload、secret value、使用者 ID 或專案
ref 保存進 repo 文件；CLI 會讀 linked project metadata，但輸出只保留去識別化結果。所有資料查詢只回
aggregate／catalog。權威數字在同一個 PostgreSQL
`REPEATABLE READ READ ONLY` transaction 內重跑，最後 `ROLLBACK`。

## 結論

- Hosted migration history 與 repo 的 25 個 migration 完全對齊，最後一版都是 `202608110001`。
- `public/private` schema 沒有結構 drift；strict pg-delta diff 只有 ACL／default privilege 差異。
- 現有資料可做 additive expand：4 筆 legacy subscription、7 筆 outbox 的 `sent_at` 非空、0 筆待送；
  沒有 orphan、空白 send material、exact fingerprint conflict 或 reminder duplicate。`sent_at` 非空不
  代表 provider 接受或裝置收到。
- **不能進 destructive contract**：`canonical-endpoint-policy-v1` 尚未實作，所以 parse-fail、
  non-canonical 與 canonical-alias owner conflict 現在沒有誠實數字。
- 目前 snapshot 的 0 筆 pending outbox 不是 contract 數字；Barrier 後必須重新查，再交使用者確認。
- 目前 0 筆 cron running／0 筆 pg_net queue 只代表查詢當下的 DB snapshot，不能證明零 in-flight Edge
  worker。

## 權威 snapshot

Snapshot：`2026-08-31 06:28:38.084608+00`（台北時間 14:28:38）

| 項目 | 查證結果 |
| --- | --- |
| PostgreSQL | `17.6`、UTF-8 |
| transaction | `REPEATABLE READ`、`transaction_read_only=on`、最後 rollback |
| DB／cron timezone | `UTC`／`GMT` |
| migration | 25 筆；local／remote 全部對齊；latest `202608110001` |
| 舊 `push_subscriptions` | 4 rows、3 owners |
| send material 基本完整性 | blank／trim mismatch 0、owner orphan 0 |
| exact UTF-8 SHA-256 | duplicate／cross-owner／不同 endpoint collision group 0 |
| frozen canonical scan | **未執行：policy 尚未實作** |
| `notification_outbox` | 7 total、7 筆 `sent_at` 非空、0 pending eligible、0 pending exhausted；不代表 provider delivery |
| outbox event | `court_new_session` 6、`session_reminder` 1；retired event 0 |
| outbox integrity | orphan 0、已知 payload shape invalid 0 |
| schedule version expand | 2 sessions 回填 current version 1；1 reminder 回填 legacy sentinel 0 |
| reminder 衝突 | duplicate group 0 |
| FA-03 新物件 | consent／registry／delivery tables 與 session schedule-version 欄位都尚不存在 |
| dispatch DB snapshot | active cron 1、running cron row 0、pg_net queue 0 |

## Hosted schema 與權限

已逐項確認：

- `notification_outbox` 仍是 8 欄舊模型，沒有 expiry、source、fan-out 或 lease。
- `push_subscriptions` 仍是 `id/profile_id/endpoint/p256dh/auth/created_at`。
- event-type constraint 仍是 `NOT VALID`；其他列出的 PK、FK、payload、length constraint 已 validated。
- reminder 唯一 index 仍是 `(session_id, recipient_profile_id, event_type)`，尚未含 schedule version。
- `push_subscriptions` 與 `notification_outbox` 都啟用 RLS；outbox 沒有 browser policy。
- `authenticated` 目前仍可直接 `SELECT/INSERT/DELETE push_subscriptions`，也可 execute 舊
  save／remove RPC。
- hosted 的 public-schema default privileges 會把新 table、sequence、function 廣泛 grant 給
  `anon/authenticated/service_role`。因此 FA-03 每個敏感物件必須在建立的同一個 migration 立即
  `REVOKE`，再只 grant 必要 command；不能依賴 RLS 或下一個 migration 補救。

Strict pg-delta 以 repo migrations 建 shadow DB，再和 hosted 的 `public/private` 比對：

```text
engine: pg-delta
diff bytes: 13,961
structural DDL present: false
default-privilege statements: 15
revoke statements: 60
grant statements: 60
drop statements reported: 0
```

這代表結構對齊，不代表 ACL 對齊；ACL 差異已列入 expand migration 的明確 revoke/grant 驗收。

## Edge、cron 與 secret metadata

| 項目 | Hosted 實查 |
| --- | --- |
| `notification-outbox-dispatch` | `ACTIVE`、version 6、`verify_jwt=false`、bundle hash 存在 |
| hosted source vs repo | `index.ts`、`dispatch.js` 逐 byte 相同 |
| `NOTIFICATION_CRON_SECRET` | 名稱存在 |
| 3 個 VAPID secrets | 名稱都存在 |
| `WEB_PUSH_TRANSPORT` | 不存在；現行 code 因此走 web-push，不走 mock |
| `PUSH_TEST_URL` | 不存在 |
| `NOTIFICATION_OUTBOX_BATCH_SIZE` | 不存在；現行 code 使用 100 |
| `DATABASE_URL` | 不存在；新 dispatcher 尚未部署 |
| Vault 三項 cron secrets | 各 1 row，查詢時非空；沒有輸出 value |
| dispatch cron | 唯一、active、每分鐘、command shape 與 repo 相符 |
| reminder cron | 唯一、active、每 5 分鐘、command shape 與 repo 相符 |

最近 24 小時的 cron catalog 查到 dispatch 1,440 次、reminder 288 次，狀態都為 `succeeded`，沒有
未結束 row。這只表示 cron SQL 已完成；`pg_net` 是非同步，不能藉此宣稱 Edge／provider 已完成。
目前 retained `net._http_response` 查到 359 筆 HTTP 200 與 1 筆 timeout；該表沒有 URL foreign key，
因此不把這些 row 全部冒充成特定 function 的結果。

Vault 的 `notification_cron_secret` 與 Edge 的 `NOTIFICATION_CRON_SECRET` 只確認兩邊都存在，metadata
查詢不能證明值相同。現行 function 也沒有 side-effect-free healthcheck，所以本輪沒有直接呼叫 hosted
function，避免它真的 claim／送出通知。

## 現在仍不能聲稱已確認的項目

下列項目不是 SQL 可以推論，會在 compatible runtime／canary／Barrier 階段處理：

- frozen `canonical-endpoint-policy-v1` 的 parse-fail、non-canonical、canonical alias conflict 數字。
- provider origin allowlist、redirect／DNS rebinding／private-IP／port 防護與 404／410 真實語意。
- Edge plan 的 wall／CPU timeout、舊 invocation 最長生命週期、Supavisor pool limit 與可驗證的 safety
  budget；未查實前 Q8-A 的 TTL 必須退回 0。
- Chrome／Safari／Firefox、SW upgrade、A→B、兩裝置與 late-delivery canary。
- 真正零 in-flight Edge worker；`pg_stat_activity=0`、cron 完成或 pg_net queue=0 都不夠。

## 下一步與不可逆邊界

1. 只在 repo 實作並本機驗證 FA-03 additive expand；不擦資料、不關 cron、不改 hosted。
2. 實作 frozen canonical policy 與 count-only scanner，不能把 SQL regex 或 ambient URL parser 當答案。
3. 實作 compatible dispatcher、browser/SW 與測試，再另行安排 hosted deploy／canary。
4. Barrier 後重新取 exact counts；只有 canonical 零例外、worker 可證明為零、backfill 可分類且 canary
   通過，才回報實際擦除／取消筆數。
5. 未取得使用者再次確認前，不執行 legacy raw send material 擦除或 Q5-A 批次取消。

## 本輪使用的唯讀方式

```text
supabase projects list / migration list / functions list / secrets list
supabase db query：只送 SELECT；權威 snapshot 另包 REPEATABLE READ READ ONLY + ROLLBACK
supabase db diff --linked --schema public,private --strict-coverage
supabase functions download --use-api：只下載到暫存目錄作逐 byte 比對
```

沒有執行 `db push`、`db pull`、migration、function deploy、secret update、cron mutation 或資料更新。
