# FA-03 Hosted migration 套用與驗證

最後更新：2026-09-04

狀態：**13 份 FA-03 migration 已套用並完成唯讀驗證；38 local／38 remote。Edge、env、secret、request 與
hosted hard gate 均未變更。**

這份文件只保存 aggregate／catalog 結果，不保存 endpoint、Push keys、payload、secret value、使用者 ID 或
project ref。

## 白話結論

- 使用者核可後，`supabase db push --linked --yes` 成功依序套用
  `202608310001`～`202608310011`、`202609030001`、`202609040001`，共 13 份 migration。
- 套用前即時 pre-check 與前一份 preflight 完全一致，沒有在資料已改變時硬套。
- 套用後 migration history 為 38 local／38 remote，沒有停在中間版本。
- 原本的 2 sessions、2 participants、2 messages、4 legacy Push rows 與 7 outbox rows 都還在。
- 1 筆 reminder outbox 已依 migration 寫入 legacy sentinel `source_version=0`；0 pending outbox。
- 4 筆 legacy Push row 都沒有被轉成 v2，也沒有被填入新的 transport metadata。
- 新 consent／registry／delivery／limiter tables 都是 0 rows；runtime-control 只有預期的 1 row，而且仍是
  `new_runtime_mode=disabled`。
- 沒有部署 `push-cleanup`、沒有設定 limiter policy／HMAC secret、沒有送 Hosted Edge request，也沒有移除
  hosted hard gate。

## 套用前最後檢查

Snapshot：`2026-09-04 10:09:51.006076+00`

| 項目 | 結果 |
| --- | --- |
| transaction | `REPEATABLE READ`、`transaction_read_only=on`、最後 rollback |
| migration | 25 remote／13 pending |
| 主要資料 | 2 sessions、2 participants、2 messages、4 legacy Push、7 outbox |
| outbox | 0 pending、1 reminder 需 sentinel 回填 |
| 舊 Push 異常 | blank／trim mismatch 0、owner orphan 0、exact endpoint cross-owner group 0 |
| 新 private tables | consent／registry／delivery／limiter 尚不存在 |
| 當下工作快照 | cron running 0、pg_net queue 0 |

## 實際套用

CLI 回報：

```text
dryRun=false
migrations=13
seeds=[]
roles=[]
message=Finished supabase db push.
exit code=0
```

本次 `db push` 是此批唯一的 Hosted 寫入。

## 套用後資料與 runtime

權威 post-check snapshot：`2026-09-04 10:11:42.754524+00`

| 項目 | 結果 |
| --- | --- |
| migration history | 38 local／38 remote，全數相同 |
| sessions | 2 rows；schedule／state version 異常 0 |
| participants | 2 rows；state version 異常 0 |
| messages | 2 rows |
| outbox | 7 legacy rows、0 pending、1 reminder sentinel row |
| Push transport | 4 legacy rows、0 v2 rows、legacy row 帶新 metadata 0 |
| consent／registry／delivery／limiter | 0／0／0／0 rows |
| runtime-control | 1 row；符合 disabled 初始值的 row 也是 1 |

## ACL 與 catalog

| 檢查 | 結果 |
| --- | --- |
| 7 張 private table 對 public／anon／authenticated／service_role 的 raw table privilege | 0 grants |
| limiter public RPC | service role 可執行；anon／authenticated 不可執行 |
| enable／refresh v2 RPC | service role 可執行 2／2；browser roles 可執行 0 |
| authenticated 對 `push_subscriptions` raw DML | SELECT／INSERT／UPDATE／DELETE 全 false |
| service role 對 `push_subscriptions` raw DML | 只保留 SELECT／DELETE；INSERT／UPDATE false |
| 7 張目標 private relation | 7／7 存在 |
| invalid indexes | 0 |
| disabled user triggers | 0 |
| 關鍵 definer function 的 owner／security-definer／empty-search-path mismatch | 0 |

目標 tables 共查到 1 個未 validated constraint：

```text
public.notification_outbox.notification_outbox_event_type_check
```

它就是 2026-08-31 preflight 已記錄的舊 constraint，不是這 13 份 migration 新增；所有本批新增並要求驗證的
constraint 都已 validated。

## Hosted schema diff 與 lint

`supabase db diff --linked --schema public,private --strict-coverage`：

```text
engine=pg-delta
diff_bytes=13,382
structural_ddl_present=false
default_privilege_statements=15
revoke_statements=57
grant_statements=57
drop_statements_reported=0
```

剩餘 diff 只有 Hosted 平台既有的 default privilege／ACL 環境差異；沒有 table、column、function、trigger、index、
type 或 schema 的結構 DDL。

`supabase db lint --linked --level warning`：`No schema errors found`，結果 0 項。

## Hosted Edge 狀態

套用後再次查 `supabase functions list`，仍只有：

```text
notification-outbox-dispatch  ACTIVE  version 6  verify_jwt=false
```

`push-cleanup` 不在 Hosted function list，因此 migration 完成不等於 endpoint 已公開。

## 查詢中的已知非功能錯誤

第一次 post-check 把兩支 v2 RPC 的參數 signature 寫錯，PostgreSQL 回 `function does not exist`；該查詢是
read-only，沒有資料變更。從 migration 原文取得正確 signature 後重跑，得到上列 2／2 service-role、0 browser-role
結果。

## 下一個停點

下一批仍需先在 repo／local 固定 Hosted canary 的最小開放方式與驗證內容，再另行取得下列 Hosted mutation 核可：

- 部署哪一支 Edge Function，以及 deployment allowlist。
- canary 所需 env／secret 名稱與生命週期。
- 如何只回傳／記錄 header 判斷結果，不輸出 raw IP 或 secret。
- 暫時 canary policy、測試 request 數量與停用方式。

在 canary 證明 gateway source headers、logs、latency／failure distribution 前，不設定 production threshold，
也不移除 hosted hard gate。
