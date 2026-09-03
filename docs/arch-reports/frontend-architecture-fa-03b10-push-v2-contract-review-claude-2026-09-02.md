# FA-03B10 Push v2 enable／refresh 契約 Claude 複核報告

日期：2026-09-02
複核對象：`docs/arch-reports/frontend-architecture-fa-03b10-push-v2-contract-2026-09-02.md`（commit `6fb2d1c`）
複核依據：`docs/arch-reports/frontend-architecture-implementation-status.md` 第 19 行「請 Claude 複核 `FA-03B10` 契約」
結論：**契約不可直接作為 `FA-03A4` 的實作依據；需先修訂 4 項 blocking，並由使用者拍板 3 項路線決策。**

## 0. 結論摘要

| 範圍 | 結果 |
|---|---|
| §2「已由 repo 證明的現況」11 條 | 11／11 PASS，無錯誤前提 |
| §16 複核者檢查點 7 項 | PASS 1、RISK 4、FAIL 2 |
| 內部一致性疑點 a–f 6 項 | PASS 4、RISK 1、FAIL 1 |
| 額外發現 X1–X5 | X1 blocking；X2、X3 需拍板；X4、X5 建議 |

Blocking（不改契約就會在 A4 或 B12 返工）：

1. §10.4 predecessor 為 null 且 server 仍 `enabled` 時一律 `stale`，會造成該裝置 Push 永久鎖死且無回復路徑。
2. §10.6 lock order 只描述 helper 名義順序，沒寫出「caller 必須預鎖 consent」與多筆 consent 的鎖序，會與既有 quarantine RPC 形成 ABBA deadlock。
3. §10.3 rule 1 的「先 pause 舊 epoch」沒指定 `reason_code`，而既有 helper 只接受 `user_logout`／`cleanup_quarantine`。
4. §10.2 把 A4 寫成「additive」，但要達成 §6.1 的統一 version 語意，必須替換既有 trigger function，且既有 pgTAP 的 exact-column 斷言必紅。

需使用者拍板（選錯返工超過 30 分鐘）：

5. §8 要求平台 egress 層 allowlist，但目前找不到 Supabase Edge Functions 提供這種能力的官方證據；照契約自己的規則 v2 永遠進不了 enabled。
6. §9.0 envelope 沒與已驗證 `authUserId` 綁定，存在被 log 觀察者重放到別的帳號的路徑。
7. §5.2 新增 local reason `user_reenable`，配合 §6.1 禁止 bump IndexedDB version，前端回滾後整個 push 子系統會變 `invalid`。

## 1. 查核方法

- 事實查核：一個唯讀 agent 逐條核對 §2 的 11 條 bullet，要求每條附 `檔案:行號` 與原文引用；否定存在性的斷言附全庫 grep。
- 對立審查：一個 opus agent 以攻擊方立場審 §16 的 7 項與我初讀時列出的 a–f 疑點，先讀 migrations 007／008／011、B5／B9／B1 源碼、pgTAP 與 cleanup handler 再下結論。
- 本人抽驗：對所有 blocking 結論引用的行號直接 `sed -n` 複驗（見附錄）。
- 兩份原始報告落在 scratchpad：`factcheck-s2.md`（250 行）、`adversarial-b10.md`（632 行）。

## 2. §2 現況查核：11／11 PASS

全部 11 條與 repo 一致，契約沒有把未來設計寫成現況。兩點補充，不影響判定：

- §2 說 dispatcher「TTL 採套件預設四週」：repo 只能證明 `sendNotification()` 呼叫時**未覆寫** TTL 與 timeout；四週是 web-push 套件文件的事實，不是 repo 內可查的常數。`[已驗證]` 呼叫點在 `supabase/functions/notification-outbox-dispatch/index.ts`。
- §2 第 2 條「本機狀態只有四種」指的是 binding 的 state；`notificationPushStorage.ts` 另有無 binding 時的 `PushRuntimeState`（`disabled`／`cleanup-pending`／`invalid`／`unavailable`），是不同層級，契約描述無誤。

`[已驗證]` 條目明細與 grep 輸出見 `factcheck-s2.md`。

## 3. §16 七項與 a–f 判定

| 項 | 判定 | 標記 | 一句話 |
|---|---|---|---|
| 16.1 version 兼作 transport CAS | RISK | 已驗證 | `008:139` 的 `semantic_changed` 只含 state／reason／epoch／hash；只加 `transport_revision` 欄位不會讓 version 遞增，refresh CAS 會靜默失效 |
| 16.2 predecessor 覆蓋度 | **FAIL** | 已驗證 | cleanup 完成到 enable 送出之間 predecessor 只存在記憶體；crash 後落入 §10.4 的永久 `stale` |
| 16.3 lock order | **FAIL** | 已驗證 | helper 實際順序是 registry → transport → consent；契約沒寫 caller 必須預鎖 |
| 16.4 DNS 與 socket 綁定 | RISK | 已驗證＋推論 | web-push 走 Node `https.request`，無 `lookup` 注入點；§8 的「send-time 驗 DNS」只能是 TOCTOU 減緩，措辭過強 |
| 16.5 Supabase egress allowlist | RISK | 不確定 | 官方 limits 文件只寫禁 port 25／587；另有官方文章說明無法提供 static egress IP。找不到 outbound allowlist 的官方證據 |
| 16.6 cold-boot rejected 只靠 cleanup token | PASS | 已驗證 | DB 純以 hash 查列，攻擊者需 raw 32-byte token；本機竄改者本來就持有自己的 token，未擴權 |
| 16.7 hybrid envelope vs JWE | RISK | 已驗證 | 不必改 JWE（每 request 新 key 已消除 IV 重用）；但 AAD 為固定字串、inner payload 無 `authUserId`，可跨帳號重放 |
| a. `revoked` 是否終態 | PASS | 已驗證 | `008:133-135` 只禁 revoked → paused；revoked → enabled 由 enable command 旋轉，契約正確 |
| b. registry `quarantined`／`transport_replaced` 是否存在 | PASS | 已驗證 | 已存在，A4 不需新增 |
| c. rule 1 pause 的 reason | **FAIL** | 已驗證 | 契約未指定；`011:354-356` helper 拒絕 `user_logout`／`cleanup_quarantine` 以外的值 |
| d. 401 走 B1 還是 B9 | RISK | 已驗證 | 契約沒寫 401 對應 `rejected` 還是 `unavailable`；後者只做 local close，前者會消耗 cleanup token |
| e. legacy → v2 update 禁止 trigger | PASS | 已驗證 | `011:111-114` trigger 已存在 |
| f. DB 4,096 是 char 還是 octet | PASS | 已驗證 | `char_length`，與契約「兩者不是同一種計數」一致 |

## 4. Blocking 詳述

### B1. §10.4 predecessor-null 規則造成永久鎖死（對應 16.2）

證據 `[已驗證]`：

- `src/notificationPushStorage.ts:505`：`if (binding && attempts.length > 0) throw storageError(...INVALID)`，binding 與 pending attempt 不能共存。
- `src/notificationPushStorage.ts:883`：cleanup 完成時 `delete(attempt.attemptId)`，attempt 內的 `serverConsent`（即 predecessor）一併消失。
- §6.1 禁止新增 store／index／DB version，所以 predecessor 無處持久化，只能在記憶體橫跨「B8 回 completed」到「enable 送出」。
- 全庫 grep `push_device_consents` 在 `src/` 零命中，migrations 內也沒有 grant 或 view 讓 owner 讀回自己的 consent epoch／version。

事故：使用者在 cleanup 完成後、enable 前關閉分頁或被系統回收，之後每次按啟用都得到 `stale`，且沒有任何 UI 或 RPC 可讓 owner 重設。同一個洞另有三條觸發路徑（`quarantine_push_by_token` 對 unknown hash 也回 `OK`、legacy dispatcher 404／410 會刪 v2 transport 留下 enabled-without-transport、同 endpoint 的 registry 停在 `quarantined` 而 §10.4 沒寫同 owner 如何回到 `active`）。

安全論證：enable 只能由 Edge 帶已驗證 `authUserId` 呼叫（§9.1／§10.1），consent 以 (profile, device) 為鍵，跨帳號邊界由 registry owner lock 守（`008:282-283` `PUSH_ENDPOINT_OWNER_TRANSFER_FORBIDDEN`）。predecessor 檢查買不到額外安全，只買到鎖死。

建議修訂：§10.4 改為「predecessor 為 null 時，同一 verified auth user＋同一 device 的 consent，不論 enabled／paused／revoked、不論有無 active transport，都可由明確 enable 動作在同一 transaction 內 pause 舊 epoch 後旋轉；唯一不可跨越的是 registry owner lock」。predecessor 降級為偵測 client bug 的稽核資訊，不是正確性前提。同時補寫「同 owner 的 `quarantined` registry 由 enable command 回 `active`」（`supabase/tests/push_lifecycle_private_foundation.sql` 已有 registry reactivation 測試證明機制可行）。

替代方案（不建議）：把 predecessor 寫進新 provisioning 記錄。這需要改 B5 v1 record 形狀與 validator，會撞上 X3 同型的 rollback 陷阱。

### B2. §10.6 沒把「預鎖 consent」寫成規則（對應 16.3）

證據 `[已驗證]` `supabase/migrations/202608310011_push_lifecycle_quarantine_commands.sql`：

- `:368-375` registry `for update` → `:377-381` transport `for update` → `:384-389` consent `update`。helper 自身順序是 registry → transport → consent。
- 既有兩個 caller `quarantine_push_device`、`quarantine_push_by_token` 都先 `for update` 鎖 consent 才呼叫 helper，整體才等於契約宣稱的 consent → registry → transport → delivery。

事故：實作者照 §10.4 最後一條「先 quarantine 舊 consent／transport 再啟用新 device」，最自然寫法是鎖新 device 的 consent → 查 registry → 直接呼叫 helper 處理舊 consent，此時舊 consent 未預鎖。與同時發生的登出／token cleanup 構成 ABBA，Postgres 以 `40P01` abort 一邊，Edge 映射為 503，使用者可穩定觸發「另一台裝置登出時本機啟用失敗」。本機 pgTAP 抓不到。

建議修訂：§10.6 加兩條：「呼叫 `private.quarantine_locked_push_consent` 前 caller 必須已對該 consent row 取得 `FOR UPDATE`」；「一個 transaction 需鎖多筆 consent 時，依 `consent.id` 遞增順序取得」。

### B3. §10.3 rule 1 沒指定 pause 的 reason（對應 c）

證據 `[已驗證]`：

- `008:42-47` paused 允許值只有 `user_logout`／`cleanup_quarantine`／`permission_revoked`／`subscription_changed`。
- `011:354-356`：`if p_reason_code not in ('user_logout', 'cleanup_quarantine') then raise exception 'INVALID_PUSH_QUARANTINE_REASON'`。
- 全庫 grep `user_reenable` 在 `src/` 與 `supabase/` 為 0 命中。

事故：實作者只能硬用 `user_logout`（稽核語意錯）或繞過 helper 自寫 registry＋transport＋delivery 三段（產生兩份會漂移的實作）。

建議修訂：契約明訂 reason 用 `subscription_changed`；§10.2 加一條「A4 需 `create or replace function private.quarantine_locked_push_consent` 把 `subscription_changed` 納入允許清單」，並標明這是替換既有 function。

### B4. §10.2 的「additive」不成立（對應 16.1 與 X1）

證據 `[已驗證]`：

- `supabase/migrations/202608310008_push_lifecycle_consent_registry.sql:139`：`semantic_changed := state_changed or epoch_changed or hash_changed;`。要讓 transport 變更也遞增 version，必須 `create or replace` `private.maintain_push_device_consent()`。
- `supabase/tests/push_lifecycle_private_foundation.sql:43`：斷言 `push_device_consents` 的 exact column allowlist；加 `client_binding_id`、`transport_revision` 後必紅。

事故：A4 交付時 `npm run test:db` 直接紅，且 §13「必要測試」只列新測試，沒說既有凍結斷言要同批更新。

建議修訂：§10.2 明列兩項非 additive 變更（trigger function 替換、pgTAP exact-column 斷言更新），§14 對 A4 的措辭改為「additive schema＋指定既有物件替換」。

## 5. 需使用者拍板

### P1. §8 egress 層要求與 Supabase 平台能力（對應 16.5）`[不確定]`

契約 §8：「production egress 層也必須限制相同 origins；若部署平台無法證明這層，v2 不進 enabled。」對立審查查到的官方文件只寫禁 port 25／587，另有官方 troubleshooting 文章說明 Edge Functions 無法提供 static egress IP、建議自架 proxy；找不到任何「outbound host／origin allowlist」的官方證據。缺什麼證據才能翻案：一份官方文件明說 Edge Function 可設 outbound allowlist。

若不拍板：B11／B12／B13 做完、測試全綠後，最後一步 gate 依契約自己的規則打不開。

選項：

- (i) 放寬 §8：接受應用層 exact-origin allowlist＋send-time DNS public-IP 檢查為充分條件，平台 egress 層列為 nice-to-have 並寫下殘餘風險。殘餘風險是攻擊者需能控制 provider 的 DNS 結果。
- (ii) 保留 §8，在 §14 加一批「獨立 push gateway 或固定 IP outbound proxy」，並承認成本。

### P2. §9.0 envelope 未綁定 caller 身分（對應 16.7）`[已驗證]`

§9.0 AAD 是固定字串 `qiuka.tw/push-subscription-v2/envelope/v1`，§9.2／§9.3 inner payload 不含 `authUserId`、nonce 或時間戳。契約 §3 自己把「Edge gateway body 有觀察者」納入 threat model，該觀察者取得 A 的 envelope 後用自己的合法 JWT 重送，Edge 會以攻擊者 `authUserId` 建立 consent／transport。若 A 的 endpoint 已在 registry，owner lock 擋下；若尚未註冊（首次 enable 失敗），攻擊者帳號會綁上 A 裝置的 endpoint。

建議：把已驗證 `authUserId` 放進 AES-GCM additional data，Edge 以 JWT 主體組 AAD 解密；不符即 `invalid`。成本極低，但改的是 wire contract，需拍板。另建議釘死長度：`encryptedKey` 恰 256 bytes、`iv` 恰 12 bytes、AES key 恰 32 bytes，對齊 B3 既有的 shape 驗證作法。

### P3. `user_reenable` 新 reason 與 §6.1 禁 bump version 的組合（對應 X3）`[已驗證]`

`src/notificationPushStorage.ts:40-46` `CLEANUP_REASONS` 是凍結清單，validator 對未知 reason 一律判 `INVALID`，`readPushRuntimeState` 回 `{ kind: "invalid" }`。§6.1 禁止 bump IndexedDB version。新版寫下 `user_reenable` 後前端回滾，舊 bundle 讀到未知 reason，整個 push 子系統變 `invalid`，raw token 鎖在讀不到的記錄裡，使用者只能清網站資料。

選項：

- (i) 不新增 reason，沿用 `subscription_changed`（B5、B9、DB 三邊已支援，`src/notificationPushStorage.ts:44`、`src/notificationPushAuthFailureCoordinator.ts:79`、`008:46`），零 rollback 風險。建議。
- (ii) 堅持 `user_reenable`，則放寬 §6.1 允許 bump `SCHEMA_VERSION`，並定義舊版遇未知 reason 的降級行為。

### P4. §5.2 依賴的 push-cleanup 在 hosted 是硬關閉（對應 X2）`[已驗證]`

`supabase/functions/push-cleanup/handler.js:113`：`if (hostedRuntime || !localTestEnabled) return retryResponse(corsOrigin);`，`hostedRuntime` 由 `DENO_DEPLOYMENT_ID`／`SB_REGION` 判定（`runtime.js:4,18`）。§5.2 第 3 條「必須等 B8 回 `cleanup-completed` 才可建立新 provisioning」在 production 永遠不成立。§14 沒有任何一批負責「替 push-cleanup 建 distributed limiter 並在 hosted 開啟」；§12 只把 limiter 列為 dispatcher 的前置。

建議：§14 明列「push-cleanup hosted 啟用（distributed limiter＋門檻證據）」為 B12／B13 的前置批次。不是 A4 blocker，但決定 B12 之後的批次順序。

## 6. 其他建議（不阻擋 A4）

- **d. 401 分類**：§9.5 明訂 enable／refresh 的 401 不得直接分類為 `rejected`；browser 先以 Auth authoritative lookup 複驗，session 仍有效時視為 `unavailable`。否則 Edge 端一次 JWT secret 輪替或 clock skew 會讓全體裝置走 B9 cleanup path（`src/notificationPushAuthFailureCoordinator.ts:282-293`）自毀 binding。
- **16.4 措辭**：§8「send-time 驗 DNS A／AAAA 全部 public」改寫為「盡力減緩 TOCTOU；真正的保證來自 exact provider-origin allowlist」。
- **X4**：`client_binding_id` 設 `not null` 且不給 default；backfill 改在 pgTAP fixture 的 insert 明確補值。以 column default 實作會讓忘記帶 binding 的 command 靜默拿到隨機值，refresh 的 binding CAS 失效。
- **X5**：§14 的 B11 交付物加上 `vercel.json` 對 `/push-subscription-key-v1.json` 的 `no-store` rule 與 `tests/security-headers.test.js` 斷言；目前 `vercel.json` 與該測試只涵蓋 `/push-cleanup-key-v1.json`。
- **§10.7 承重 gate**：契約應寫明 runtime-disabled gate 為什麼承重（legacy dispatcher `index.ts:142` 以 endpoint 刪 row，會誤刪 v2 transport）。

## 7. 對立審查查了但沒找到問題的部分

- 兩 tab 同時 enable：B5 CAS 收斂為同一筆，PASS。
- Edge 成功後 local commit 前 crash：原 provisioning 與 token 仍在，重試同 request，PASS。
- `revoked` 終態語意、registry `quarantined`／`transport_replaced` 存在、legacy → v2 update 禁止 trigger、`char_length` 計數：契約與 repo 一致。
- OAEP label 與獨立 key ring 的雙重隔離、keyId thumbprint 與 B4 一致：PASS。
- cold-boot rejected 的 threat model 自洽：PASS。

## 8. 建議的契約修訂清單（供下一輪文件批）

| 契約節 | 修訂 |
|---|---|
| §5.2 第 2 條、§6.2、§9.2 | 取消 `user_reenable`，改用 `subscription_changed`（待 P3 拍板） |
| §8 | 依 P1 拍板結果放寬或加批次；DNS 檢查措辭改為減緩 |
| §9.0 | AAD 納入已驗證 `authUserId`；釘死 `encryptedKey`／`iv`／AES key 長度（待 P2 拍板） |
| §9.5 | 401 不得直接視為 `rejected` |
| §10.2 | 明列 trigger function 替換、helper reason 白名單放寬、pgTAP exact-column 斷言更新；`client_binding_id` 不給 default |
| §10.3 rule 1 | 指定 pause reason |
| §10.4 | predecessor-null 改為同 owner＋device 可旋轉；補同 owner `quarantined` registry 回 `active` |
| §10.6 | 補 caller 預鎖規則與多 consent 鎖序 |
| §10.7 | 寫明 runtime-disabled gate 承重理由 |
| §13 | 加「既有凍結斷言同批更新」 |
| §14 | A4 措辭放寬；加 push-cleanup hosted 啟用批；B11 加 header rule 交付物 |

## 9. 對 A4 授權的影響

status 文件第 990 行寫「`FA-03A4` 開始前仍須回報 exact additive diff 並取得使用者確認」。依 B4，A4 的 diff 必然含 `create or replace` 既有 trigger function 與 helper、以及 pgTAP 斷言更新；使用者核可時應以「additive schema＋指定既有物件替換」的口徑審 diff，不能只看新增欄位。

## 附錄：可重跑的驗證指令

```bash
# §2 bullet 數
sed -n '17,37p' docs/arch-reports/frontend-architecture-fa-03b10-push-v2-contract-2026-09-02.md | grep -c '^- '
# → 11

# §16 檢查點數
sed -n '487,497p' docs/arch-reports/frontend-architecture-fa-03b10-push-v2-contract-2026-09-02.md | grep -c '^[0-9]\.'
# → 7

# B4：semantic_changed 不含 transport
sed -n '139p' supabase/migrations/202608310008_push_lifecycle_consent_registry.sql

# B3：helper reason 白名單
sed -n '354,356p' supabase/migrations/202608310011_push_lifecycle_quarantine_commands.sql

# B2：helper 鎖序
sed -n '368,389p' supabase/migrations/202608310011_push_lifecycle_quarantine_commands.sql

# B1：binding 與 attempt 不共存、attempt 完成即刪
sed -n '505p;883p' src/notificationPushStorage.ts

# B1：owner 無法讀回 consent
grep -rln 'push_device_consents' src/ | wc -l   # → 0
grep -n 'push_device_consents' supabase/migrations/*.sql | grep -i 'grant\|create view\|create or replace view' | wc -l   # → 0

# B3／P3：user_reenable 在程式碼零命中
grep -rn 'user_reenable' src supabase | wc -l   # → 0

# P4：hosted 硬關閉
sed -n '113p' supabase/functions/push-cleanup/handler.js

# B4：pgTAP exact-column 斷言
sed -n '43p' supabase/tests/push_lifecycle_private_foundation.sql

# 原始報告
ls -la /private/tmp/claude-501/-Users-ian-tennisPartnerFinder/71a1eb93-bcd5-428c-883e-2456fc495086/scratchpad/{factcheck-s2,adversarial-b10}.md
```
