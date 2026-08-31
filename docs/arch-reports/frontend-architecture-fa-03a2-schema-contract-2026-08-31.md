# FA-03A2 Push 資料契約

最後更新：2026-08-31

## 1. 這一批要解決什麼

這份文件只固定下一批 migration 的資料形狀與安全邊界。它不啟用新版 Push、不改 browser、dispatcher、
cron 或現有 RPC，也不寫入 hosted。

以下規格來自已核可的 FA-02 決策、現有 migration／test 與本機 PostgreSQL 17 catalog。沒有證據的
timeout、lease、retry 次數與保存天數一律保持 `NULL`，不先猜數字。

## 2. 已查實的基線

- 現在只有 reminder 有正式版本：`sessions.notification_schedule_version` 從 `1` 起算；legacy reminder
  outbox 使用 sentinel `0`。
- 現在的 outbox 沒有一般 source、fan-out 邊界或 per-device delivery。
- `session_messages` 沒有 edit RPC、沒有 `updated_at`；目前 application lifecycle 是 insert、讀取與
  purge delete。但 hosted broad defaults 可能讓 `service_role` 取得 table UPDATE，所以固定 version `1`
  前仍須加 DB immutable trigger，不能只靠「app 沒呼叫」推論。
- 現在的 dispatcher 只要至少一個 subscription 成功，就把整筆 outbox 寫成 `sent_at`；因此新版聚合用
  「全部 device 結案後，至少一筆 accepted 才算 completed」最接近既有成功語意。
- 現有 `profiles -> sessions/outbox/push_subscriptions` 是 cascade。帳號刪除另有既存 reports／legacy
  RESTRICT、`session_messages.sender_profile_id` NO ACTION，以及 profiles→sessions→reports 的間接 blocker；
  本批只能保證 Push 不新增永久 blocker，不能宣稱整個專案已能無條件刪帳。
- PostgreSQL 17 core 已提供 `pg_catalog.gen_random_uuid()` 與 `pg_catalog.sha256(bytea)`；本設計不新增
  `uuid-ossp` 或 `pgcrypto` 依賴。

## 3. 固定的識別碼與雜湊

| 資料 | 固定格式 | 規則 |
| --- | --- | --- |
| table row ID | `bigint generated always as identity` | 延續 repo 慣例 |
| logical device ID | `uuid` | Browser 產 UUIDv4，存在 IndexedDB；只唯一於 `(profile_id, device_id)` |
| consent epoch | `uuid` | DB 產生；每次使用者明確 enable／re-enable 旋轉 |
| cleanup token | Browser 32 random bytes | Browser 只存 43 字元、無 padding base64url；server 只存 SHA-256 |
| cleanup hash tag | `sha256-cleanup-token-32-v1` | hash 必須正好 32 bytes；partial global unique |
| endpoint fingerprint tag | `sha256-endpoint-utf8-v1` | 對 DB 收到的 endpoint 原字串做 exact UTF-8 SHA-256；不 trim／normalize／parse |
| VAPID fingerprint tag | `sha256-vapid-p256-uncompressed-v1` | hash 解碼後 65-byte、首 byte `0x04` 的 P-256 public key |
| notification ID | `uuid` | 每筆 delivery 建立一次；retry／reclaim 不換 |
| claim token | nullable `uuid` | 每次成功 claim／reclaim 重新產生；離開 processing 就清掉 |
| DB-owned version | `bigint NOT NULL DEFAULT 1 CHECK (> 0)` | caller 只能帶 expected version，不能指定新值或 `NULL` |

同一 logical `device_id` 可以先後出現在不同帳號，所以不能做全域 unique。cleanup raw token、hash、endpoint、
keys 與 payload 都不能寫入 log 或 response。

## 4. Consent、registry 與 active transport

### 4.1 `private.push_device_consents`

最小欄位：

```text
id, profile_id, device_id
state, reason_code, consent_epoch, version
cleanup_token_hash_algorithm, cleanup_token_hash
cleanup_token_rotated_at, cleanup_token_revoked_at
created_at, updated_at, state_changed_at
```

固定狀態：

- `enabled -> user_enabled`
- `revoked -> user_disabled`
- `paused -> user_logout | cleanup_quarantine | permission_revoked | subscription_changed`

`enabled/paused` 必須保有 cleanup hash；`revoked` 必須清掉 hash並記 `cleanup_token_revoked_at`。pause 不旋轉
epoch；明確 re-enable 在同一 transaction 同時旋轉 epoch 與 cleanup token。HTTP retry 使用相同 cleanup
token 時，回傳既有 epoch/version，不可重複旋轉。

`profile_id + device_id` 建立後不可改。table 另提供 `(id, profile_id)` unique 給 child composite FK。
`profile_id` 對 profiles 採 `ON DELETE CASCADE`，所以刪帳會清除 device ID、consent 與 cleanup token。

### 4.2 `private.push_endpoint_registry`

主鍵是 `(fingerprint_algorithm, endpoint_fingerprint)`；另有 `owner_profile_id、state、reason_code、version`
與 nullable `created_at/updated_at/state_changed_at`。table 另提供非 partial、非 deferrable 的
`UNIQUE (fingerprint_algorithm, endpoint_fingerprint, owner_profile_id)` constraint，供 active transport
用 composite FK 驗證 owner。

固定狀態：

- `active -> transport_active`，必須有 owner
- `quarantined -> consent_paused | consent_revoked | transport_replaced | provider_stale`，必須有 owner
- `deny -> owner_deleted`，owner 必須為 `NULL`

`active/quarantined` 的三個時間都必須非空；`deny` 的三個時間都必須為 `NULL`。`owner_profile_id` 對
profiles 採 `ON DELETE SET NULL`。同一個 row 的 `BEFORE UPDATE` trigger 必須把這次 FK 動作同步轉成
`deny/owner_deleted`、version `+1`，並清除三個時間；不能先留下不合法的 ownerless quarantine。兩個
非空 owner 間禁止直接轉讓；deny row 不能重新啟用，只能在 server provider 證據成立時整筆刪除。

這張表是帳號刪除後唯一刻意保留的 Push row。deny row 的非空內容只有 algorithm/hash、`deny` state、
固定 `owner_deleted` reason 與 DB concurrency version；不留 owner、device、時間、raw endpoint、keys、
payload 或 cleanup token，也沒有日曆到期日。使用者已於 2026-08-31 確認採此最小保留方案。

### 4.3 `public.push_subscriptions`

它仍是唯一保存 raw endpoint／`p256dh`／`auth` 的 active transport。未來相容 migration 會加：

```text
consent_id
endpoint_fingerprint_algorithm, endpoint_fingerprint
vapid_fingerprint_algorithm, vapid_fingerprint
transport_version, updated_at
```

legacy row 的新欄全部為 `NULL`；新版 row 的新欄必須全部非空。新版 row 一個 consent 最多一筆，endpoint
fingerprint 全域唯一。`(consent_id, profile_id)` composite FK 指向同 owner consent 並採 cascade；
`(fingerprint algorithm, fingerprint, profile_id)` 以 `MATCH SIMPLE` 指向同 owner registry，精確 action 是
`ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED ON DELETE RESTRICT`。`MATCH SIMPLE` 讓 metadata 全空的
legacy row 通過；shape CHECK 禁止半套 metadata。這讓 owner 一致性由 DB 驗證，而不是只相信 command。
registry 刪除前必須先移除 transport。

這些欄位不在 dormant migration 先加入，因為目前 authenticated 仍有 raw table insert 權限。它們必須和
legacy RPC shim、raw grant 撤除及新 command 同一批切換，避免舊 client 寫出偽造的新版 row。

## 5. 每個裝置一筆 delivery

`private.notification_deliveries` 固定保存：

```text
id, outbox_id, recipient_profile_id, consent_id, consent_epoch, notification_id
state, attempts, claim_token, claimed_at, lease_until, next_attempt_at, error_code
created_at, updated_at, state_changed_at
```

唯一鍵是 `(outbox_id, consent_id, consent_epoch)`；`notification_id` 全域 unique；非空 `claim_token` 也
partial unique。delivery 不複製 endpoint、keys 或 payload。

狀態與 error：

- `pending`：初始時 error/next-attempt 都空；retry 時只允許
  `provider_rate_limited | provider_transient`，且必須有 `next_attempt_at`
- `processing`：claim token、claimed time、lease 都非空，error 為空，`attempts > 0`
- `unknown`：固定 `adapter_outcome_unknown`，有下一次檢查時間
- `accepted`：error 為空，只代表 Push service 接受
- `cancelled`：`event_expired | consent_inactive | consent_epoch_changed | source_invalid |
  recipient_ineligible | transport_unavailable | provider_endpoint_inactive`
- `failed`：`payload_invalid | attempts_exhausted | provider_permanent`

`accepted/cancelled/failed` 是 terminal；其他三種不是。subscription 或 registry 的一般清理沒有指向
delivery 的 cascade，因此不能抹掉 audit。outbox 另提供 `(id, recipient_profile_id)` unique；delivery 以
`(outbox_id, recipient_profile_id)` composite FK 對 outbox 採 cascade，並以
`(consent_id, recipient_profile_id)` composite FK 對 consent 採 deferred `NO ACTION`。這同時由 DB 驗證
outbox recipient 與 consent owner 相同。效果是：平常不能刪掉仍被 delivery 引用的 consent，但
profile/session/account cascade 同一 transaction 已先刪 outbox/delivery 時不會被 Push FK 擋住。

使用者已確認：帳號刪除後不長期保存 delivery、device、recipient 或 payload audit，只保留最小 deny
registry row。既有 outbox 的 account/session cascade 保持不變，delivery 依上述 composite FK 一起清除。

## 6. Outbox format 不能靠 `NULL` 猜

新增 `outbox_format_version smallint NOT NULL DEFAULT 1`：

- `1`：legacy writer；`fanout_state='legacy'`
- `2`：新版 event transaction；helper 必須明確寫 `2`，不可依賴 default

`DEFAULT 1` 只存在於 legacy-compatible window。Barrier 關閉 legacy writes 的同一 transaction 必須
`DROP DEFAULT`，並讓 control-aware trigger 拒絕任何 format 1 insert；所有新版 helper 都明寫 `2`。
否則漏欄位會在 cutoff 後靜默降級成 legacy，這是 contract blocker。

FA-03A1 的 `source_schedule_version` 在 hosted 尚未套用前改名為通用 `source_version`，避免 reminder
同時保存兩份可能不一致的 version。其餘新增欄位：

```text
source_kind, source_id
fanout_state, fanout_frozen_at
outcome, outcome_code, outcome_at
```

format 1 reminder 保留 `source_version=0`；其他 legacy event 的 source triple 維持 `NULL`。format 2 必須
有完整 source triple、`source_version > 0`、非空且晚於 `created_at` 的 `expires_at`。

format 2 的 `fanout_state` 只有 `open/frozen`。`open` 只允許存在於尚未 commit 的 event transaction；
deferred constraint trigger 會拒絕任何以 `open` commit 的 row。零裝置也要 freeze，並直接結案
`no_targets`。

outcome 固定四種：

- `no_targets`：fan-out 當下沒有 enabled consent
- `completed`：全部 delivery terminal，且至少一筆 accepted
- `failed`：全部 terminal、沒有 accepted，且至少一筆 failed
- `cancelled`：全部 terminal，且全部 cancelled

FA-02 前段漏列 `failed`，但同文件的 contract 明確要求 attempts exhausted legacy row 轉 `failed`；四種
outcome 是把文件內部矛盾修正成唯一可測契約，不代表 device 已收到或顯示。

固定 outcome code：

```text
fanout_no_targets
deliveries_terminal_with_acceptance
deliveries_terminal_failed
deliveries_terminal_cancelled
legacy_sent_at_recorded
legacy_attempts_exhausted
legacy_cutoff_cancelled
legacy_unclassifiable_cancelled
```

legacy `sent_at` 非空只可映射成 `completed/legacy_sent_at_recorded`，文件與 UI 都不能把它說成 provider
accepted 或 device delivered。

## 7. 十種 event 的 source 契約

`source_kind` 固定四種：`session_schedule | session_state | session_participant | session_message`。
`source_id` 用現有 row 的 `bigint id`；`source_version` 用 `bigint`。

| event | source | deadline | adapter 前仍須成立 |
| --- | --- | --- | --- |
| `session_reminder` | schedule / session ID / schedule version | `start_at` | open/full、版本相同、非未定案 candidate、未開始 |
| `decide_reminder` | schedule / session ID / schedule version | `start_at` | open/full+candidates+undecided、版本相同、未到候選起點 |
| `chat_message` | message / message ID / `1` | 未定案 candidate：`start_at`；其餘 `start_at+24h` | message 存在、recipient accepted、雙向無 block |
| `host_new_request` | participant / participant ID / participant version | 未定案 candidate：`start_at`；其餘 `start_at+2h` | 仍是當次 requested 或 instant-accepted；session 未取消/expired |
| `guest_invited` | participant / participant ID / participant version | 未定案 candidate：`start_at`；其餘 `start_at+2h` | 仍 invited、session 仍可回覆 |
| `guest_request_reviewed` | participant / participant ID / participant version | `start_at+24h` | 仍是 captured accepted/declined，且 participant owner 仍是 recipient |
| `court_new_session` | session state / session ID / state version | 未定案 candidate：`start_at`；其餘 `start_at+2h` | current discovery/join、名額與 recipient court subscription 仍符合 |
| `session_updated` | session state / session ID / state version | `start_at+24h` | current version 相同，且是該 recipient/session 最新 update event |
| `session_decided` | session state / session ID / state version | `start_at+24h` | version/decided_at 相同，未取消/expired |
| `session_cancelled` | session state / session ID / state version | `start_at+24h` | version 相同且仍 cancelled |

所有事件共同重查 expiry、pref、consent epoch、recipient access 與 source existence。event transaction 對
當下所有 `enabled` consent 建 delivery，即使 active transport 正在 refresh 也先凍結 logical device；
adapter 前仍找不到 transport 才以 `transport_unavailable` 取消。之後才 enable 的 consent 不補發。

現有 chat 五分鐘 throttle 保留。使用者已確認：session update 的所有通知相關欄位與 DB 現值完全相同時，
RPC 仍可回成功，但不建立 `session_updated` outbox；只改 `updated_at` 或 caller 偽造 version 也不算更新。
有任一實際 domain 變更時，source version 只加一次並建立一次 event。這項行為在 compatible runtime
實作，dormant migration 只先提供 DB-owned version。

## 8. 一般 source version

新增 `sessions.notification_state_version`，只在目前所有 domain 欄位真的改變時 `+1`：

```text
sport_id, host_profile_id, court_id, play_type, start_at,
ntrp_min, ntrp_max, slots_total, notes, status,
join_mode, venue_type, range_end, decided_at, fee_note, archived_at
```

排除 `id/created_at/updated_at/notification_schedule_version/notification_state_version`。同一 UPDATE 多欄只
加一次；no-op 不加；caller 指定值會被覆寫。

新增 `session_participants.notification_state_version`，在
`session_id/profile_id/role/status/initiated_by` 真的改變時 `+1`。現行 transition trigger 已禁止前三者
改動，但仍列入 counter 的防守邊界。`played_confirmed` 不影響 request/invite/review source，所以不加。

message source 固定 immutable version `1`。Dormant migration 先加 `BEFORE UPDATE` trigger 拒絕任何
message UPDATE；現有 insert、讀取、report FK 與 purge DELETE 不受影響。若未來要做訊息編輯，功能
啟用前必須先移除 immutability、新增 message version 與相應 invalidation，不能沿用 `1`。

candidate-court set 目前只有 session create 時 insert，沒有 edit path；court/catalog 與 candidate rows
在 adapter 前 fresh-check，不假裝它們已被 session trigger 覆蓋。

## 9. Runtime control 與 worker ledger

`private.notification_runtime_control` 只有 singleton `1`：

```text
worker_generation
dispatch_enabled
new_runtime_mode = disabled | canary | enabled
legacy_writes_enabled, legacy_outbox_handled, legacy_cutoff_at
worker_lease_duration, request_deadline_duration, delivery_lease_duration
max_delivery_attempts, push_ttl_safety_budget
updated_at
```

初始值固定為：generation `1`、dispatch `true`、new runtime `disabled`、legacy writes `true`、legacy
outbox handled `false`、cutoff 與所有數值 `NULL`。`dispatch=true` 只記錄舊 dispatcher 現況；舊程式尚未
讀這張表，所以不能把它當成已存在的 kill switch。

`canary/enabled` 必須先有已查實的 lease/deadline/attempt 設定。TTL safety budget 若仍為 `NULL`，Q8-A
固定送 `TTL=0`，不能取 web-push 預設四週。

`private.notification_dispatch_workers` 保存 worker token、generation、
`running/completed/failed/expired`、開始／硬 lease／結束時間與固定 result code。Barrier 不能只看
heartbeat；它要先鎖 control、關 dispatch/legacy writes、記 UTC cutoff、增加 generation，並確認舊
generation 沒有仍在硬 lease 內的 running worker。

worker code 固定為：`running -> NULL`、`completed -> normal_exit`、
`failed -> controlled_failure`、`expired -> hard_deadline_elapsed`。第三方原始 error 不進 DB。

worker admission 不能分成「先讀 generation、稍後 insert」兩步。register command 必須在同一 transaction
鎖 control、重查 dispatch/mode/generation，再先寫 running ledger 才可返回。每次 adapter 前再鎖 control
並重查 worker token、generation 與 dispatch；依 Q6-A 的狹窄例外，這個 transaction 持鎖直到單筆 adapter
結果已分類。Barrier 的 control UPDATE 因而會等待已進入 send boundary 的 worker，也不會漏掉尚未登記的
舊 generation worker。

Canary 只能對明確 allowlist 的測試 profile 生效；allowlist 預設空，`profile_id` 對 profiles 採
`ON DELETE CASCADE`。不能把全域 `canary` 字串當成帳號隔離機制，也不能讓 allowlist 成為刪帳 blocker
或跨刪帳留下第二種 Push row。

## 10. 鎖順序修正

compatible runtime 完成後的共同順序是：

```text
sorted profiles FOR KEY SHARE
-> session
-> participant/message
-> notification-pref / player-block / court-subscription advisory guards
-> consent
-> endpoint registry
-> active subscription
-> delivery
```

profile 必須在最前面。否則 sender 先鎖 session、account delete 先鎖 profile，兩邊之後各自等待對方，
會形成反向 cycle。cleanup-token 路徑可先無鎖查出 profile ID，再鎖 profile，接著重新讀 token/consent；
第一次無鎖查詢不能當授權結果。

這個順序目前尚未成立：現有部分 RPC 是先鎖 session，再鎖 profile；participant cascade trigger 也可能在
child 已鎖後回頭更新 session。Dormant schema 不會假裝修好它。進 canary 前必須逐一改寫相關 RPC／trigger，
加入 sorted profile pre-lock，再重讀 session/participant；完成 lock-order integration test 前不能宣稱
全系統 deadlock-free。

domain mutation 不鎖舊 outbox；只取消 delivery。event transaction 只能更新自己尚未公開的新 outbox。
finalizer 只鎖 outbox，不回頭鎖 domain／consent。這保留 FA-03A1 已修掉的 outbox↔session 反向鎖原則。

## 11. ACL 與 role provisioning

- 新敏感 table 全放 `private`、啟用 RLS且沒有 policy。
- 每支 migration 在同一 transaction 立即從 `PUBLIC/anon/authenticated/service_role` revoke table、sequence、
  function 權限，避免 hosted broad default privileges 留下空窗。
- 不建立 password、不提交 secret，也不假設 Edge 可以使用自訂 login role。
- 後續 Edge 只取得核可的 security-definer command EXECUTE；不直接取得 private table 權限。
- `push_subscriptions` 的既有 service-role raw read/delete 在 compatible dispatcher 就緒前不能撤；
  authenticated raw insert/delete 必須和 legacy shim 同批撤。

## 12. 本批刻意不決定的數字

以下全部要等官方平台上限與 hosted canary，現在維持 `NULL`：

- worker hard lifetime
- request deadline
- delivery lease
- max attempts
- 非 429 retry/backoff
- TTL safety budget

audit 不建自動清理 cron，也不猜 30／90 天。provider quarantine／ownerless deny 仍依 Q1-A/Q7-A：只由
server provider 證據解除。

## 13. 實作與驗證順序

1. 各自獨立 migration 加 session version、participant version、outbox format/source/fan-out/outcome；所有
   version 都要精確驗證 `NOT NULL DEFAULT 1 CHECK (>0)` 與 caller 傳 `NULL` 也無法偽造。
2. 建 private control/worker/canary allowlist、consent/registry/delivery；依已確認的刪帳政策使用
   outbox cascade + consent deferred NO ACTION。每批只鎖必要的既有 relation。
3. 對 `session_messages` 加 DB immutable UPDATE trigger，讓 message source version `1` 成為 constraint，
   不是應用程式慣例。
4. pgTAP 驗證欄位、CHECK、FK、trigger、RLS、ACL、partial index、legacy default 與 format 2 fail-closed。
5. 用真實 FK transaction fixture 驗證：一般 consent delete 會被 audit 擋；profile cascade 可清
   consent/outbox/delivery、registry 留 ownerless deny，且 Push 不新增 delete blocker。
6. compatible runtime 批次逐一改寫舊 RPC／trigger 的 profile-first lock 順序；canary 前用並行 fixture
   證明沒有已知的 profile↔session/participant 反向 cycle。
7. Barrier 同一 transaction 關 legacy writes、移除 outbox format `DEFAULT 1` 並啟用 legacy-insert reject；
   以 crossing-write concurrency test 證明 cutoff 後沒有靜默 format 1。
8. 跑完整 DB tests、lint、shadow replay、generated types、typecheck 與 Push/dispatcher regression。
9. 更新單一進度文件並建立獨立 commit；仍不 apply hosted。

只有 compatible runtime 與測試完成後，才進 maintenance barrier。任何 hosted migration、raw material
擦除、legacy pending cancel 或 grant contract，都仍需重新盤點實際筆數並再次取得使用者確認。
