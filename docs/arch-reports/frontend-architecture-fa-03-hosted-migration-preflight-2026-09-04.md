# FA-03 hosted migration 套用前唯讀複查

最後更新：2026-09-04

狀態：**唯讀複查完成；13 份 migration 尚未套用，Edge Function、env、secret 與 hosted hard gate 均未變更。**

這份文件只記錄 2026-09-04 當下實際查到的 aggregate／catalog 結果，不保存 endpoint、Push keys、payload、
secret value、使用者 ID 或 project ref。資料查詢在同一個 `REPEATABLE READ READ ONLY` transaction 內完成，
最後 `ROLLBACK`。

## 白話結論

- Hosted 目前仍停在原本 25 份 migration；repo 有 38 份，所以待套用的是完整 13 份 FA-03 migration。
- `supabase db push --linked --dry-run` 精確列出這 13 份，沒有 seed 或 role 檔案會一起套用。
- Hosted 現有資料很少，但不是空資料庫：2 場活動、2 筆參加資料、2 則訊息、4 筆舊 Push 訂閱、7 筆 outbox。
- 13 份 migration 不刪現有資料。唯一會直接 `UPDATE` 舊資料的是 1 筆 reminder outbox，將 legacy
  `source_version` 設成 sentinel `0`；另會建立 1 筆預設 runtime-control row。
- 4 筆舊 Push 訂閱會繼續以 legacy row 存在；migration 只加 nullable transport 欄位、相容 RPC／trigger 與較嚴格
  ACL，不會把它們自動轉成 v2、quarantine 或刪除。
- `push-cleanup` 尚未部署到 Hosted；limiter policy 與 HMAC secret 名稱也不存在。套 migration 不會自動開啟
  Edge endpoint，現有程式的 hosted hard gate 也不會被資料庫 migration 移除。

## 2026-09-04 權威快照

Snapshot：`2026-09-04 10:05:46.978505+00`（台北時間 18:05:46）

| 項目 | 實查結果 |
| --- | --- |
| transaction | `REPEATABLE READ`、`transaction_read_only=on`、最後 rollback |
| PostgreSQL | `17.6` |
| migration | 38 local／25 remote；13 份 pending |
| `sessions` | 2 rows |
| `session_participants` | 2 rows |
| `session_messages` | 2 rows |
| 舊 `push_subscriptions` | 4 rows／3 owners |
| 舊 Push 基本異常 | blank／trim mismatch 0、owner orphan 0、exact endpoint cross-owner group 0 |
| `notification_outbox` | 7 total、0 pending、1 reminder 需 sentinel 回填 |
| 新 private tables | consent／registry／delivery／limiter 全都尚不存在 |
| 執行中工作快照 | cron running 0、pg_net queue 0 |

`cron running=0` 與 `pg_net queue=0` 只代表該 transaction 的當下快照，不代表完全沒有 Edge／provider
in-flight request，因此不能拿來當正式切換保證。

## Dry-run 的精確套用清單

```text
202608310001_push_lifecycle_session_schedule_foundation.sql
202608310002_push_lifecycle_outbox_expand_foundation.sql
202608310003_push_lifecycle_session_state_version.sql
202608310004_push_lifecycle_participant_state_version.sql
202608310005_push_lifecycle_message_immutable.sql
202608310006_push_lifecycle_outbox_format_foundation.sql
202608310007_push_lifecycle_runtime_control.sql
202608310008_push_lifecycle_consent_registry.sql
202608310009_push_lifecycle_deliveries.sql
202608310010_notification_outbox_deferred_guard_security.sql
202608310011_push_lifecycle_quarantine_commands.sql
202609030001_push_subscription_v2_commands.sql
202609040001_push_cleanup_rate_limit.sql
```

Dry-run 回報：`dryRun=true`、`seeds=[]`、`roles=[]`。

## 既有資料的實際影響

| 既有資料 | 套用時會做什麼 | 已確認筆數 |
| --- | --- | --- |
| `sessions` | 加 schedule／state version 欄位與維護 trigger；constant default 為 `1` | 2 |
| `session_participants` | 加 state version 欄位與維護 trigger；constant default 為 `1` | 2 |
| `session_messages` | 加未來禁止 update 的 trigger；不改現有 row | 2 |
| `notification_outbox` | expand 欄位、驗證 constraint／index；legacy reminder 寫入 sentinel `0` | 7 total；直接 update 1 |
| `push_subscriptions` | 加 nullable legacy-compatible 欄位、trigger、RPC 與 ACL；不轉換或刪除 row | 4 |
| runtime control | 建表並 insert 預設 disabled 控制 row | 新增 1 |
| consent／registry／delivery／limiter | 建立新 private 空表與必要 function／ACL | 現有 0 |

對 13 份檔案做 top-level destructive／DML 靜態掃描，結果只有：

```text
202608310002：UPDATE public.notification_outbox
202608310007：INSERT private.notification_runtime_control
DELETE FROM／TRUNCATE／DROP TABLE／DROP COLUMN／DROP SCHEMA：0
```

## Hosted runtime 現況

- 目前只有 `notification-outbox-dispatch`：`ACTIVE`、version 6、`verify_jwt=false`。
- `push-cleanup` 尚未出現在 Hosted function list。
- Secret metadata 有既有 Supabase／VAPID／cron 名稱；沒有
  `PUSH_CLEANUP_RATE_LIMIT_POLICY_JSON` 或 `PUSH_CLEANUP_RATE_LIMIT_HMAC_KEY`。
- 本輪沒有讀取或保存任何 secret value。

## 建議的下一個核可邊界

下一步只核可「套用 13 份 migration」最容易驗證，也不會同時開放新 endpoint。若核可，執行後應立即做：

1. 重查 migration history 必須為 38 local／38 remote，且沒有中斷在中間版本。
2. 重查 1 筆 reminder sentinel、4 筆 legacy Push row 與 0 pending outbox；不得把 legacy row 自動轉 v2。
3. 重查新 private tables、function owner、empty `search_path`、raw table ACL 與 service-role-only RPC 權限。
4. 再跑 hosted schema diff；結果若不是預期 ACL／結構狀態就停止，不部署 Edge。
5. `push-cleanup` canary deploy、env／secret、測試 request、hard gate 移除與 production threshold 都留在另一個核可批次。

## 本輪沒有做的事

沒有執行 `db push`、migration apply、function deploy、secret update、env update、cron mutation、Hosted request
或資料寫入。首次長查詢曾卡在 CLI 建立登入角色階段而由本機中止；另一次因換行被當成字面字元而收到 SQL
syntax error，兩次都沒有開始 DB transaction。最後成功的權威查詢為上列 read-only transaction。
