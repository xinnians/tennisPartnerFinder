# FA-03 Push preflight 去敏證據

最後更新：2026-08-31
用途：保存 `frontend-architecture-fa-03-push-preflight-2026-08-31.md` 的可重查依據。

這不是 hosted backup，也不含 endpoint、Push keys、payload、secret value、user/profile ID 或 project ref。
所有 DB 結果只保留 aggregate／catalog；Edge source 只保存本地與 hosted 的檔案 hash。

## E1. Linked project metadata

來源：`supabase projects list --output-format json`，在 shell 內先比對 linked ref，再只輸出去識別化欄位。

```text
cli_authenticated=yes
accessible_projects=2
linked_project_accessible=true
linked_project_status=ACTIVE_HEALTHY
linked_project_region=ap-southeast-1
```

## E2. Migration 完整比對

來源：`supabase migration list --linked --output-format json`，逐筆比較 `local == remote`。

```text
pair_count=25
mismatch_count=0
```

25 個 local／remote 都相同的版本：

```text
202607020001  202607080001  202607170001  202607170002  202607170003
202607170004  202607210001  202607210002  202607230001  202607230002
202607230003  202607230004  202607230005  202607270001  202607270002
202607270003  202607270004  202607270005  202607270006  202607270007
202607270008  202608050001  202608060001  202608080001  202608110001
```

## E3. 同一個 read-only snapshot

來源：一個 SQL request，開頭為
`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`，結尾為 `ROLLBACK`。

```json
{
  "snapshot_at": "2026-08-31 06:28:38.084608+00",
  "transaction_read_only": "on",
  "server_version": "17.6",
  "server_encoding": "UTF8",
  "database_timezone": "UTC",
  "cron_timezone": "GMT",
  "legacy_push_table_present": true,
  "outbox_table_present": true,
  "new_consent_table_present": false,
  "new_registry_table_present": false,
  "new_delivery_table_present": false,
  "schedule_version_present": false,
  "legacy_push_rows": 4,
  "legacy_push_owners": 3,
  "legacy_push_invalid_or_trim_rows": 0,
  "legacy_push_orphan_rows": 0,
  "exact_fingerprint_conflict_groups": 0,
  "canonical_policy_scan": "not_runnable_policy_not_implemented",
  "outbox_total": 7,
  "outbox_sent_at_non_null": 7,
  "outbox_pending_eligible": 0,
  "outbox_pending_exhausted": 0,
  "outbox_retired_event": 0,
  "outbox_orphans": 0,
  "outbox_known_payload_shape_invalid": 0,
  "sessions_to_backfill_version_1": 2,
  "reminders_to_backfill_version_0": 1,
  "reminder_duplicate_groups": 0,
  "event_constraint_validated": false,
  "cron_running_snapshot": 0,
  "pg_net_queue_snapshot": 0
}
```

同一 snapshot 的 outbox 分組：

```json
[
  {
    "event_type": "court_new_session",
    "total": 6,
    "sent_at_non_null": 6,
    "pending_eligible": 0,
    "pending_exhausted": 0
  },
  {
    "event_type": "session_reminder",
    "total": 1,
    "sent_at_non_null": 1,
    "pending_eligible": 0,
    "pending_exhausted": 0
  }
]
```

`sent_at_non_null` 只描述舊 DB 欄位，不代表 provider 接受、裝置收到或顯示。

同一 snapshot 的 cron／Vault metadata：

```json
{
  "cron_jobs": [
    {"jobname":"dispatch-notification-outbox","schedule":"* * * * *","active":true,"command_matches":true},
    {"jobname":"enqueue-session-reminders","schedule":"*/5 * * * *","active":true,"command_matches":true},
    {"jobname":"expire-stale-tennis-sessions","schedule":"*/15 * * * *","active":true,"command_matches":true},
    {"jobname":"purge-archived-session-messages","schedule":"30 3 * * *","active":true,"command_matches":true}
  ],
  "vault_required_secrets": [
    {"name":"notification_cron_secret","rows":1,"nonempty":1},
    {"name":"notification_project_url","rows":1,"nonempty":1},
    {"name":"notification_publishable_key","rows":1,"nonempty":1}
  ],
  "cron_last_24h": [
    {"jobname":"dispatch-notification-outbox","status":"succeeded","run_count":1440,"rows_without_end_time":0},
    {"jobname":"enqueue-session-reminders","status":"succeeded","run_count":288,"rows_without_end_time":0}
  ],
  "net_retained_last_24h": [
    {"status_bucket":"<null>","timed_out":true,"has_error":true,"response_count":1},
    {"status_bucket":"200","timed_out":false,"has_error":false,"response_count":359}
  ]
}
```

Cron `succeeded` 只代表 cron SQL 完成；pg_net response 沒有 URL foreign key，因此不能把 retained rows
全部歸因到 dispatcher，也不能用 DB snapshot 證明零 in-flight Edge worker。

## E4. Schema diff 與 ACL

來源：
`supabase db diff --linked --schema public,private --strict-coverage --output-format json`，再只輸出分類計數。

```json
{
  "engine": "pg-delta",
  "schemas": ["public", "private"],
  "diff_bytes": 13961,
  "structural_ddl_present": false,
  "default_privilege_statements": 15,
  "revoke_statements": 60,
  "grant_statements": 60,
  "drop_statements_reported": 0
}
```

Hosted `postgres` role 在 public schema 的 default ACL 實查：

```text
functions: anon/authenticated/service_role = EXECUTE
sequences: anon/authenticated/service_role = SELECT,UPDATE,USAGE
tables: anon/authenticated/service_role = DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
```

既有 Push 物件的直接 ACL 實查：

```text
push_subscriptions: authenticated = DELETE,INSERT,SELECT
push_subscriptions_id_seq: anon/authenticated/service_role = SELECT,UPDATE,USAGE
push_subscriptions: service_role = full relation privileges
notification_outbox: service_role = full relation privileges
save_push_subscription/remove_push_subscription: authenticated + service_role EXECUTE
private enqueue/pref helpers: anon/authenticated/service_role 無 EXECUTE
```

## E5. Edge function 與 secrets

來源：`supabase functions list`、`supabase secrets list`；secret 只保留名稱是否存在。

```json
{
  "dispatcher": {
    "status": "ACTIVE",
    "version": 6,
    "verify_jwt": false,
    "has_bundle_hash": true
  },
  "secret_presence": {
    "NOTIFICATION_CRON_SECRET": true,
    "WEB_PUSH_VAPID_SUBJECT": true,
    "WEB_PUSH_VAPID_PUBLIC_KEY": true,
    "WEB_PUSH_VAPID_PRIVATE_KEY": true,
    "WEB_PUSH_TRANSPORT": false,
    "PUSH_TEST_URL": false,
    "NOTIFICATION_OUTBOX_BATCH_SIZE": false,
    "DATABASE_URL": false
  }
}
```

Hosted source 以 `supabase functions download --use-api` 下載到暫存目錄後用 `cmp` 比對，兩檔都 identical：

```text
dispatch.js sha256 = 69fb037953e84e78ef87e2c4c74015e25ba2ea88478f222533d36d03c84ca717
index.ts    sha256 = 0d618f63deaf3d6042bfdc6f5468088ba5b92ce0a3084b33343496e392b246b6
```

暫存下載已移到 macOS 垃圾桶；專案 worktree 沒有留下 source copy。

## E6. 無法由目前 evidence 得出的結論

- Canonical scan 尚未執行；SQL regex／`btrim` 不能替代 frozen policy。
- Vault 與 Edge cron secret 兩邊存在，不等於值相同。
- Cron／pg_net 完成不等於 provider 接受或 device delivery。
- Expand 前 snapshot 不能替代 Barrier 後的 contract recount。
- 此 evidence 沒有授權任何 hosted write、deploy 或 destructive contract。
