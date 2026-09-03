# FA-03B10 複核結果與 FA-03A4 變動通知

日期：2026-09-02
收件者：`FA-03A4` 實作者（Codex）
來源：`frontend-architecture-fa-03b10-push-v2-contract-review-claude-2026-09-02.md`（複核報告）、
契約 `frontend-architecture-fa-03b10-push-v2-contract-2026-09-02.md` v1.2、
`frontend-architecture-implementation-status.md` D20–D26。

## 1. 複核結果一句話

契約 §2「已由 repo 證明的現況」11 條全部屬實；契約設計有 4 項 blocking 與 3 項需拍板，已全部於 v1.1 修訂；
使用者另補 2 項拍板成 v1.2。**A4 請以契約 v1.2 為唯一依據，不要再讀 v1（commit `6fb2d1c`）的版本。**

## 2. 相對 v1，A4 必須改做的事

| 契約節 | v1 寫法 | v1.2 寫法 | 對 A4 的影響 |
|---|---|---|---|
| §10.2 | A4 是 additive schema | additive 欄位＋四項既有物件替換 | migration 含 `create or replace` 兩支既有函式（trigger function 與 quarantine helper）與抽出一支新子 helper，pgTAP 既有斷言同批更新 |
| §10.2 | `client_binding_id` 可用 `gen_random_uuid()` backfill | `not null` 且不給 column default | fixture 由 pgTAP insert 明確補值 |
| §10.2 既有物件替換第 1 條 | 無 | `maintain_push_device_consent()` 的 `semantic_changed` 納入 `transport_revision`；`client_binding_id` 只在 `old.state <> 'enabled'` 且 `new.state = 'enabled'` 的 update 可改 | trigger function 替換 |
| §10.2 第 2 條 | 無 | `quarantine_locked_push_consent` reason 白名單加 `subscription_changed` | helper 替換 |
| §10.2 第 4 條 | 無 | 殘留清理（registry quarantine、transport 刪除、delivery cancel）抽成 private 子 helper；父 helper 先 pause 再呼叫；enable command 只在 predecessor null 的 paused／revoked rotation 與 old-device replacement 分支直接呼叫 | 新函式，security definer、空 `search_path`、ACL 與父 helper 相同，納入既有 pg_proc／ACL 斷言 |
| §10.3 rule 1 | 先 pause 再新 epoch，未指定 reason | pause reason 固定 `subscription_changed` | |
| §10.4 | predecessor null 且 server enabled 一律 stale | 同 verified owner＋同 device 可 rotation：`enabled` 經 helper pause 後轉 enabled；`paused`／`revoked` 直接轉 enabled；轉 enabled 時 `reason_code = 'user_enabled'` | 三態路徑各要測 |
| §10.4 | 無 | exact retry 定義為六欄全同；同 owner `quarantined` registry 回 `active` | |
| §10.4（v1.2） | 同 binding 非 exact retry 一律 stale | enabled、同 binding、**無 transport** 時直接重建 transport，version +1，不旋轉 hash／epoch／binding | 新分支＋測試 |
| §10.5（v1.2） | 只接受 enabled | 只接受 enabled 且仍有 transport；無 transport 回 `stale` | |
| §10.6 | 只寫鎖序 | caller 呼叫任何 helper 前必須已 `FOR UPDATE` consent；多筆 consent 依 `consent.id` 遞增；exact-retry／stale 判定讀鎖定後的 row；A4 前後 helper 順序兩個時點 | 靜態鎖序斷言 |
| §10.7 | 無理由 | runtime-disabled gate 承重理由：legacy dispatcher `index.ts:142` 以 endpoint 刪 row | |
| §13 DB（v1.2） | 「lock-order concurrency」一句 | 本機單一連線：取鎖述句順序斷言（錨點非空＋兩個 canary 驗紅）＋同 transaction 交錯呼叫收斂；真併發與三個搶插分支列入 dispatcher barrier 批（CI 加 `dblink`），A4 不得宣稱已覆蓋 | |
| §14 第 2 條 | additive | additive＋§10.2 既有物件替換第 1–4 條 | exact diff 回報要把兩類分開列 |

與 A4 無直接關係、但同批決策的變動：§5.2／§6.2 取消 `user_reenable`（沿用 `subscription_changed`）；§8 egress 放寬為
應用層充分條件；§9.0 AAD 綁定 `authUserId` 並釘死長度；§9.5 401 先經 authoritative lookup 複驗。這些屬 B11／B12。

## 3. 複核指出、契約已修但實作時仍要留意的點

- **predecessor 只是稽核資訊**：cleanup 完成到 enable 之間 predecessor 只在記憶體（B5 的 binding 與 attempt 不共存，
  `notificationPushStorage.ts:505`；cleanup 完成即刪 attempt，`:883`）。任何以 predecessor 為正確性前提的判斷都會鎖死。
- **鎖序陷阱**：現行 `quarantine_locked_push_consent` 自身順序是 registry → transport → consent
  （`202608310011:368-389`），只有 caller 先鎖 consent 才等於契約順序。A4 後父 helper 改為先 pause，子 helper 只取
  registry → transport → deliveries。
- **既有 trigger 會擋的路徑**：`PUSH_PAUSE_CANNOT_ROTATE_CONSENT`（`202608310008:106-108`）禁止 paused 旋轉，
  `PUSH_REVOKED_CONSENT_CANNOT_PAUSE`（`:133-135`）禁止 revoked → paused，enabled row 的 reason 必須是
  `user_enabled`（`:35-38`）。三態路徑的寫法在契約 §10.4 已依這些限制定稿。
- **既有 pgTAP 必紅點**：`push_lifecycle_private_foundation.sql:43` consent exact-column 斷言；
  `push_lifecycle_quarantine_commands.sql` 的 pg_proc count 與 ACL 斷言（完整區塊 `:116-138`、`:225-247`）；
  兩份檔共五處直接 insert consent 的 fixture 要帶 `client_binding_id`。
- **掃描類斷言要有牙**：殘留清理「只有一個實作點」的 `pg_get_functiondef` 掃描要用忽略空白的 regex 或多 token，
  以 statement 為範圍；PostgreSQL ARE 的 word boundary 是 `\y` 不是 `\b`；每條掃描斷言要用「內聯殘留清理」canary
  驗紅一次；`strpos` 找不到回 0，錨點必須先驗非空。

## 4. A4 交付前的驗證要求

```bash
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test
npm run test:db          # 三份 pgTAP 都看 1..N 與 ok N；plan 數以實跑為準
npm run test:local
npm run typecheck && npm run lint && npm run prettier:check && npm run build
git diff --check
```

canary 驗紅清單（每條紅一次再還原綠，缺一不可）：內聯殘留清理三段進 enable command；quarantine pgTAP 的
pg_proc count；registry 取鎖搬到 consent 鎖之前；刪掉 command 內 consent 的 `for update`；子 helper 內 registry 鎖搬到
transport 鎖之後；刪掉 trigger 的 `client_binding_id` 不可變分支。

hosted 套用前另需唯讀確認 `private.push_device_consents` 與 `private.push_endpoint_registry` 為空；不可用本機結果推論。

## 5. 回報格式

依 status 文件既有批次章節格式：已完成／精確邊界／本批驗證，並把 exact diff 分成「additive 欄位」與「既有物件替換
第 1–4 條」兩類列出；每個整數附產生它的指令。回報後由使用者核可才 commit。
