# FA-03B10 Push v2 enable／refresh 技術契約 v1

日期：2026-09-02
狀態：**review freeze；尚未實作**

這份文件是給下一輪實作與 Claude 複核使用的固定契約。它把「repo 已存在的事實」和「未來要做的設計」分開寫，
避免把提案誤當成已完成。

## 1. 本次已確認的產品決策

1. Auth 暫時無法驗證時，Push 先留在本機 `auth-unverified`，即使之後驗證成功也**不能自動恢復**。
2. 使用者必須再次按下啟用 Push，才可開始舊 binding cleanup 與新的 provisioning。
3. 本批只凍結契約、測試與 migration 邊界；不新增 migration、不接 production、不部署 hosted。

白話說：網路恢復不代表使用者重新同意。必須再按一次，系統才會清理舊狀態並建立新的 server consent epoch。

## 2. 已由 repo 證明的現況

以下是既有事實，不是本文件新發明的行為：

- `notificationPushStorage.ts` 已在任何 enable network 前建立 `deviceId`、`bindingId`、`localRevision` 與
  32-byte cleanup token；server 成功後只接受 `consentId`、`consentEpoch`、`consentVersion` 三個值。
- 本機狀態只有 `provisioning`、`enabled`、`auth-unverified`、`cleanup-required`；沒有 resume API。
- 本機 mutation 以 owner、binding 與 local revision 做 CAS；pending cleanup 未完成時不能建立新 binding。
- `private.push_device_consents` 已有帳號＋裝置唯一鍵、`enabled／paused／revoked`、consent epoch、version 與
  cleanup-token hash。
- `private.push_endpoint_registry` 已有 endpoint owner lock；owner 不可轉讓，owner 刪除後會變成不可逆 `deny`。
- `public.push_subscriptions` 已有 v2 consent、endpoint fingerprint、VAPID fingerprint 與 transport version 欄位，
  但沒有 v2 enable／refresh command。
- 既有 legacy `save_push_subscription`／`remove_push_subscription` 遇到 v2 registry 或 v2 transport 會拒絕，
  不能拿來假裝是 v2 API。
- `quarantine_push_device` 只給 authenticated owner 使用；`quarantine_push_by_token` 只給 service role，
  且只收到 cleanup token 的 SHA-256 digest，不收到 raw token。
- 現行 dispatcher 使用 `web-push@3.6.7`，直接把 DB endpoint 交給 `sendNotification()`；TTL 採套件預設四週，
  socket timeout 未設定。v2 runtime control 的 deadline、lease、attempt 與 TTL safety budget 仍是 null。
- 現行 dispatcher 不讀 v2 runtime control、consent 或 registry；所以本契約完成前不可啟用 v2 send。
- B9 Auth-failure coordinator 仍是 dormant；production 對它沒有 importer 或 caller。

第 3 節之後寫的是**已選定、尚待實作與驗證的未來契約**。其中的欄位、名稱、限制值與流程是設計決策，
不是在宣稱 repo 或 hosted 現在已具備這些能力；實作後仍要用本文件列出的測試逐項證明。

## 3. 不變的安全邊界

下列規則在後續實作時不能被放寬：

- Push 同意仍是「帳號＋logical device」；換帳號不得沿用。
- raw cleanup token 只留在 browser IndexedDB。enable API 只接收
  `SHA-256(decoded canonical 32-byte token)` 的 64 lowercase hex digest。
- endpoint 是 RFC 8030 定義的 capability URL；endpoint、`p256dh`、`auth`、cleanup token、JWT、解密後 request
  body 都不得進 log 或 error message。
- enable／refresh 的敏感 payload 必須先做 application-layer encryption；Edge gateway body 只能看到隨機 envelope。
- endpoint owner lock 不轉讓。不同 owner 或 `deny` 一律回相同的 generic conflict，不回傳舊 owner 身分。
- invalid、unknown、timeout、contract drift 與 stale response 一律 fail-closed；不得先把本機改成 `enabled`。
- 所有 bigint 在 browser／Edge JSON 中都用 canonical decimal string；不得轉成 JavaScript number。
- production provider allowlist、deadline、TTL、rate limit 沒有證據前保持未配置；未配置就不能進 canary。
- enable／refresh 不得直接使用 authenticated 可呼叫的 raw table DML。

## 4. 整體流程

```text
使用者明確按下啟用
  -> B5 先建立或保留 provisioning 與 raw cleanup token
  -> browser 取得並驗證 PushSubscription
  -> Edge 驗 Auth、exact request、endpoint policy 與 key shape
  -> service-role-only DB command 在單一 transaction 做 owner／consent／transport CAS
  -> Edge 回 exact success snapshot
  -> browser 再驗 Auth snapshot 與 B5 local revision
  -> B5 commit 為 enabled
```

如果 Edge 已成功、browser 在 local commit 前 crash，原 provisioning 與同一 token 仍在。重試相同 request 必須回
同一份成功 snapshot，不得再建立 consent 或再次增加 version。

## 5. Auth unavailable 的手動恢復契約

### 5.1 驗證重新成功時

- Auth controller 只恢復一般私人畫面；Push 保持 `auth-unverified`。
- 不呼叫 B5 resume，不呼叫 enable／refresh Edge，也不把 Push UI 顯示成已啟用。
- UI 只能顯示「Push 已暫停，需要重新啟用」的狀態；正式文案另批確認。

### 5.2 使用者再次按下啟用時

1. 以 exact owner／binding／local revision，把舊 `auth-unverified` binding 轉為 cleanup attempt。
2. local reason 新增 `user_reenable`；這只是本機稽核原因，cleanup Edge 仍只收到 raw-token envelope。
3. 必須等 B8 回 `cleanup-completed`，才可以建立新的 provisioning。
4. 新 provisioning 必須產生新的 `bindingId` 與 cleanup token；不得重用舊 token。
5. DB enable command 若看到同帳號＋同裝置的 paused cleanup successor，或沒有 active transport 的 revoked
   consent，必須依下方規則旋轉 token hash 與 consent epoch。
6. 若 server 仍是 enabled，只能在 caller 提供的 predecessor consent identity 完整相符時，於同一 transaction
   先 pause 舊 epoch、再啟用新 epoch；不相符就回 stale。
7. cleanup pending、Edge unavailable、owner conflict 或 stale 時都維持關閉，不建立第二條 server transport。

這條路徑刻意不是 resume；它是一個新的 opt-in。

## 6. Browser storage 與 coordinator 契約

### 6.1 保留 B5 v1 儲存格式

本契約不增加 IndexedDB store、index 或 DB version。server snapshot 仍只有：

```ts
{
  consentEpoch: string;
  consentId: string;
  consentVersion: string;
}
```

為了讓 refresh 也能使用這個 CAS，未來 DB migration 必須把 consent `version` 定義成**統一 binding version**：
consent state、cleanup authority 或 transport 任一語意變更，都要遞增這個 version。純 no-op 不遞增。

### 6.2 新增但尚未實作的 B5 動作

- `beginExplicitPushReenable(...)`
  - 只接受 `auth-unverified`。
  - 以 exact owner／binding／revision 做 CAS。
  - 原子地產生 `user_reenable` cleanup attempt；不建立新 provisioning。
- cleanup 完成後沿用既有 `beginExplicitPushProvisioning(...)` 建立全新 binding。
- `cancelExplicitPushProvisioning(...)`
  - 只允許在 browser 能證明 enable network **尚未開始**時使用，例如 permission 在 request 前被拒絕。
  - 以 exact owner／binding／revision 刪除 provisioning，不建立 cleanup attempt。
  - 一旦 request 可能已送出，unknown／abort／crash 都必須保留原 provisioning，以同一 request 重試；不得取消。
- B5、B9 與 attempt validator 都必須同步加入 exact `user_reenable` reason；不能只改其中一份。

### 6.3 Browser orchestration

- 只有已由 B1 發布的 verified session 可以呼叫 enable／refresh。
- 每次 network 前後都要比較 Auth proof revision、`authUserId`、`bindingId` 與 `localRevision`。
- `navigator.serviceWorker.register()` 後必須等待 `navigator.serviceWorker.ready`，不能沿用 legacy 的立即取用。
- permission prompt 只能由使用者手勢觸發。
- request pending 時不得重複建立 subscription 或 cleanup token；跨 tab 依賴 B5 CAS 收斂為同一筆。
- 前景 reconciliation 可以呼叫 refresh，即使 subscription 看似沒變；DB exact no-op 必須不增加 version。
- SW `pushsubscriptionchange` 仍屬後續批次。現行 classic SW 不得複製另一份 validator。

## 7. PushSubscription canonical contract

### 7.1 endpoint

Edge 與 dispatcher 必須共用同一份 `canonical-endpoint-policy-v1` validator：

- input 必須是 browser 原樣提供的非空字串，不做 `trim()`。
- Edge 選定更嚴格的 UTF-8 4,096-byte 上限；既有 DB 的 4,096-character constraint 只作第二層防線，
  兩者不是同一種計數。
- 使用 WHATWG `URL` parser；不得用 SQL regex 或自行拆字串。
- 只接受 `https:`、非空 hostname、空 username、空 password、空 fragment、預設 443 port。
- `new URL(input).href` 必須與 input 完全相同；path 與 query 視為 opaque，不 decode、不重排。
- hostname 不得是 IP literal、localhost、private／loopback／link-local 名稱。
- `url.origin` 必須 exact 命中 production provider-origin allowlist。
- endpoint fingerprint 固定為 `SHA-256(UTF8(exact endpoint))`，沿用
  `sha256-endpoint-utf8-v1`。

### 7.2 `p256dh` 與 `auth`

- 只接受無 padding 的 canonical base64url。
- `p256dh` decode 後必須正好 65 bytes、第一 byte 為 `0x04`，並通過 P-256 curve point import／validation。
- `auth` decode 後必須正好 16 bytes。
- 額外 key、padding、非 canonical 重編碼或錯誤 curve 一律 invalid，DB command 前停止。

### 7.3 VAPID

- browser 必須確認 `subscription.options.applicationServerKey` 等於目前 build 所用的 VAPID public key。
- Edge 不信任 caller 提供的 VAPID fingerprint；它從 server-side 固定 public key 自行計算。
- fingerprint 固定為 `SHA-256(65-byte uncompressed P-256 public key)`，沿用
  `sha256-vapid-p256-uncompressed-v1`。
- VAPID key 不同時，browser 必須先 unsubscribe、重讀 `getSubscription()`，再明確建立新 subscription。

## 8. Provider egress policy

Push API 允許 user agent 選擇 push service，因此本文件**不猜** FCM、Mozilla 或 Apple hostname 清單。
契約改為固定「如何配置」，實際值由 production canary 證據填入：

- server-only env：`PUSH_PROVIDER_ORIGINS_V1`。
- 格式是 sorted、unique、non-empty 的 canonical JSON string array；每項只能是無 path／query／fragment／
  userinfo、預設 443 的 exact HTTPS origin。
- parser、canonical serializer 與 SHA-256 policy digest 必須放在 Edge／dispatcher 共用 module。
- allowlist 為空、JSON 非 canonical、重複、順序錯誤或含非法 origin時，enable 與 v2 dispatcher 都 hard-disable。
- release evidence 必須保存 policy digest 與各 browser／OS 實機取得的 origin；不得保存完整 endpoint。
- send-time 必須再次驗同一 policy，禁止 redirect，並驗 DNS A／AAAA 全部是 public address。
- 應用層驗證之外，production egress 層也必須限制相同 origins；若部署平台無法證明這層，v2 不進 enabled。
- 3xx、DNS drift、private IP、未列 origin 都算 permanent policy rejection，不跟隨、不 fallback legacy。

## 9. Edge API v1

建議固定 endpoint 名稱：`push-subscription-v2`。名稱可在實作前改一次，但 request／response shape 不再漂移。

### 9.0 Wire privacy

9.2／9.3 定義的是加密前 canonical payload。真正送到 Edge 的 body 只能是：

```ts
{
  ciphertext: string;    // AES-256-GCM ciphertext + 16-byte tag，canonical base64url
  encryptedKey: string;  // RSA-OAEP／SHA-256 encrypted 32-byte AES key
  iv: string;            // 12 random bytes，canonical base64url
  keyId: string;         // 32-byte JWK thumbprint，canonical base64url
  version: 1;
}
```

- 每次 request 產生新的 32-byte AES key 與 12-byte IV；不能重用。
- inner payload 使用固定欄位順序的 canonical JSON UTF-8，再以 AES-256-GCM 加密；`tagLength` 固定為
  128 bits，tag 附在 ciphertext 尾端。
- AES-GCM additional data 固定為 `qiuka.tw/push-subscription-v2/envelope/v1` 的 UTF-8 bytes。
- AES key 使用獨立的 2048-bit RSA-OAEP／SHA-256 public key 加密；OAEP label 固定為
  `qiuka.tw/push-subscription-v2/key/v1`。
- 不重用 cleanup key、cleanup public-key asset 或 cleanup OAEP label；新增獨立的 same-origin
  `/push-subscription-key-v1.json` 與 key ring。
- public-key document 沿用 B4 的 exact encrypt-only JWK、thumbprint、`no-store` 與 499-byte boundary pattern，
  但 protocol path、environment name、key material 全部獨立。
- outer envelope 與 inner payload 都驗 exact own keys、canonical base64url 與固定 version；任何 drift 在 DB 前停止。
- body 上限由「4,096-byte endpoint 的最大 canonical payload → AES-GCM → RSA envelope」fixture 精確算出並由測試
  鎖定；本文件不手填估算值。
- 每次 coordinator invocation 最多送 1 個 envelope。key unavailable／503／unknown 時保留 provisioning，由新的
  使用者動作或明確 retry 再產生新 envelope；DB idempotency 負責收斂，不在同一呼叫猜重試次數。

### 9.1 Auth

- 只接受 Supabase user JWT；publishable／secret key 不能當 user identity。
- 必須使用 server-side cryptographic verification 或 Auth `getUser` 類型的 authoritative lookup；只 decode JWT 不算。
- 驗證成功後只產生 `{ authUserId }` 內部值，不把 JWT 傳入 DB 或 log。
- Edge 用 server credential 呼叫 service-role-only DB command，並明確傳入已驗證的 `authUserId`。
- Browser request 的 `Origin` 必須與單一 production app origin 完全相等；CORS 只開 `POST／OPTIONS` 與實際需要的
  headers，不用 wildcard，也不反射任意 origin。

### 9.2 enable inner payload

```ts
{
  bindingId: string;              // UUIDv4，新 provisioning
  cleanupTokenHash: string;       // SHA-256(decoded 32-byte token)，64 lowercase hex
  deviceId: string;               // UUIDv4
  kind: "enable";
  predecessor: null | {
    consentEpoch: string;
    consentId: string;            // canonical bigint decimal
    consentVersion: string;       // canonical bigint decimal
  };
  subscription: {
    auth: string;
    endpoint: string;
    p256dh: string;
  };
  version: 1;
}
```

`predecessor` 只有手動 re-enable 可以非 null，而且必須來自被 cleanup 的同一筆 B5 attempt。它代表 cleanup 前
最後一次 local commit 的 server identity，不代表 cleanup 後的 current version。

### 9.3 refresh inner payload

```ts
{
  bindingId: string;
  deviceId: string;
  expectedConsent: {
    consentEpoch: string;
    consentId: string;
    consentVersion: string;
  };
  kind: "refresh";
  subscription: {
    auth: string;
    endpoint: string;
    p256dh: string;
  };
  version: 1;
}
```

refresh 不接 cleanup token/hash，不建立 consent，不轉換 owner，只能更新相同 enabled binding 的 transport。

### 9.4 success response

```ts
{
  bindingId: string;
  consentEpoch: string;
  consentId: string;
  consentVersion: string;
  kind: "committed";
  version: 1;
}
```

response 只回 B5 commit 真正需要的欄位。endpoint、keys、hash、profile ID、DB transport ID 都不回 browser。

### 9.5 non-success response

只允許下列 exact body：

```ts
{ kind: "endpoint-unavailable", version: 1 }
{ kind: "invalid", version: 1 }
{ kind: "stale", version: 1 }
{ kind: "unavailable", version: 1 }
```

- `invalid`：400；request shape、canonical value 或 key 驗證失敗。
- `stale`：409；binding／consent CAS 不符。
- `endpoint-unavailable`：409；different owner、deny、provider policy rejection 使用同一結果。
- `unavailable`：503；runtime disabled、canary denied、DB／Auth dependency 或 unknown failure。
- 401 由 Auth boundary 處理；browser 交回 B1，不能自行判定 anonymous。
- response body 額外 key、錯誤 content type、redirect 或其他 status 一律由 browser adapter 映射為 unavailable。
- response 不含 capability URL 或 subscription keys，可維持 plaintext；仍必須 `no-store` 且不得進應用 log。

## 10. DB command 契約

### 10.1 新增函式

- `public.enable_push_device_v2(...) returns jsonb`
- `public.refresh_push_transport_v2(...) returns jsonb`
- 共用 mutation 放在 `private` helper。

兩個 public wrapper 的 `EXECUTE` 只授予 service role；`public／anon／authenticated` 全部 revoke。它們使用
`security definer` 與空 `search_path`。browser 不能繞過 Edge 直接呼叫。

### 10.2 additive schema

未來 migration 至少需要：

- `private.push_device_consents.client_binding_id uuid`：server 與 B5 binding 的明確 correlation。
- `private.push_device_consents.transport_revision uuid`：transport 語意變更時觸發 consent `version + 1`；
  browser 不需要保存這個值。
- exact constraint／trigger：binding identity、profile、device 不可被 refresh 改寫。

舊本機 fixture 的新增欄位可由 migration 以 `gen_random_uuid()` backfill；hosted 在套用前仍要唯讀確認 v2 table
是否為空。不能根據目前 local 結果假設 hosted 也是空的。

### 10.3 CAS 與 idempotency

- enable 以 verified auth user、device、new binding 與 optional predecessor 做 CAS。
- refresh 必須同時符合 auth user、device、binding、consent ID、epoch、version 與 enabled state。
- transport 的 endpoint／keys／VAPID 任一語意改變時，transport version 與 consent version 都各增一次。
- exact no-op 不增加任何 version 或 timestamp。
- 已成功 request 的 exact retry，即使帶舊 expected version，也要在所有 stored input 都完全相同時回同一成功 snapshot。
- 相同 expected version 但內容不同，只能有一筆成功；另一筆回 stale，不能 last-write-wins。
- DB 回傳 bigint 前先 cast text；Edge 不接收超過 PostgreSQL bigint 的值。

manual re-enable 的 predecessor successor 只接受以下兩種 server 現況：

1. 同 consent ID／epoch、`version === predecessor.version`、state 仍為 enabled。這代表 token cleanup 沒有改到
   server；enable command 必須在同 transaction 先 pause，再建立新 epoch。
2. 同 consent ID／epoch、`version === predecessor.version + 1`、state 為 paused、reason 為
   `cleanup_quarantine`。這是現有 token-cleanup command 唯一能產生的 successor；可以直接以新 token re-enable。

version 相差超過一、epoch 已變、ID 不同或 reason 不符合時一律 stale。不得用 `>=` 接受未知中間變更。

### 10.4 enable state transition

- 無 consent：建立 enabled consent、active registry 與 v2 transport。
- predecessor 非 null 時，只接受上一節的 exact enabled 或 one-step `paused／cleanup_quarantine` 狀態。
- predecessor 為 null 時，無 active transport 的 paused／revoked consent 可由同一 verified owner 的明確 enable
  動作旋轉 cleanup hash、consent epoch 並建立新 binding；enabled 且不是 exact retry 時仍回 stale。
- enabled 且 exact retry：no-op success。
- enabled 且符合 predecessor 的 exact current-state 規則、用途為 `user_reenable`：同 transaction 先 pause 舊
  epoch，再以新 token／binding 啟用新 epoch。
- enabled 但 binding／predecessor 不符：stale。
- endpoint registry different owner 或 deny：generic endpoint-unavailable；不得更新 owner。
- 同 owner 的舊 device 正占用同一 endpoint：先 quarantine 舊 consent／transport，再啟用新 device；整段必須是
  同一 transaction，不能留下兩個 active transport。

### 10.5 refresh state transition

- 只接受目前 enabled consent。
- endpoint 相同但 keys 不同，視為 transport change。
- endpoint 不同時，舊 registry 先變 `quarantined／transport_replaced`，新 registry 才能 active。
- 新 endpoint different owner／deny 時整筆 rollback，舊 transport 保持原狀但 caller 本機仍 fail-closed。
- refresh 不旋轉 cleanup token、不換 consent epoch、不換 binding ID。

### 10.6 lock order

所有 v2 mutation 固定：

```text
consent -> endpoint registry（fingerprint byte order） -> transport -> deliveries
```

不存在的 consent／registry 用 unique insert 收斂，再鎖住實際 row；不得為不同 code path 改變順序。這與既有
quarantine helper 的 consent → registry → transport → delivery 順序一致。

### 10.7 legacy coexistence

- 現行 legacy dispatcher 會讀全部 `push_subscriptions`，不看 `consent_id`、registry 或 runtime control。
- v2 enable 遇到「相同 endpoint、相同 owner」的 legacy row 時，可以在同一 transaction 先刪 legacy row，再建立
  v2 row；trigger 禁止直接把 legacy row update 成 v2。
- 相同 endpoint 但 owner 不同時只回 endpoint-unavailable，不能轉讓。
- v2 DB command 在 legacy worker 尚未具備 generation／canary barrier 前必須回 runtime-disabled；不能先產生
  production v2 row，再假設舊 worker 不會送。
- production browser wiring 可以先進 bundle，但 actual Edge call 必須被同一 server-controlled gate 關閉，直到
  legacy／v2 worker barrier、canary profile 與 rollback 流程完成。
- hosted 現有 legacy row 的轉換或刪除是另一個需核可的 migration／runtime 動作，不包含在 `FA-03A4` additive
  schema 授權內。

## 11. B1 → B9 correlation 契約

- B1 failure callback 必須帶 `kind`、verification revision 與 optional `priorVerifiedAuthUserId`；不帶 token。
- warm session 有 prior verified owner 時，必須與 B5 binding `authUserId` 相同才可呼叫 B9。
- cold boot 沒有 prior verified owner 時：
  - `unavailable` 只能做 B5 local close。
  - `rejected` 只能走 cleanup-token capability 的 B8 路徑。
  - 不得呼叫 authenticated owner RPC、enable 或 refresh。
- 這個 cold-boot 分支不宣稱 local `authUserId` 是 Auth proof；真正的 server authority 是不可猜測的 cleanup token。
- Auth result 被較新的 event supersede 時，不得觸發 B9。

## 12. Dispatcher 啟用前置條件

v2 enable／refresh 完成仍不代表可以送 Push。v2 dispatcher 還必須：

- 每次 send 前重讀 consent、epoch、registry 與 delivery lease，不使用先前載入記憶體的舊 snapshot。
- 使用同一 provider policy module；不允許 legacy row bypass。
- 對 `web-push@3.6.7` 明確傳入 TTL 與 timeout，不使用四週／undefined 預設。
- TTL、timeout、lease、attempt 與 safety budget 的值由 local／hosted canary latency 證據決定；本文件不猜秒數。
- 404／410 走 provider-stale quarantine，不直接用 endpoint-only delete。
- delete／quarantine failure 要進 delivery outcome，不能只增加 log counter。
- hosted distributed limiter、log-redaction canary、DNS／redirect egress test 通過後，才能從 disabled 進 canary。

## 13. 必要測試

### Browser／unit

- Auth unavailable 後驗證成功不會自動呼叫 Push port。
- 手動 re-enable 必須 cleanup completed 才建立新 provisioning；pending／throw 都停住。
- 兩 tab 同時 enable 只使用一筆 B5 provisioning 與 cleanup token。
- Edge success 後 local commit crash，重試得到同一 consent snapshot。
- Auth／binding revision 在 network 中改變，response 不可 commit。
- endpoint parser 的 userinfo、fragment、port、IP literal、non-canonical、oversize 與額外 key canary。
- 65-byte valid／invalid P-256 point、16-byte auth 與 base64url canonical matrix。

### DB

- initial enable、exact retry、no-op、concurrent differing input、stale predecessor。
- paused／revoked／enabled manual re-enable 各自產生新 epoch。
- refresh endpoint、keys、VAPID change 都增加 transport 與 consent version；no-op 不增。
- different owner／deny 永不轉讓；same-owner old-device replacement 不留下雙 active transport。
- lock-order concurrency、rollback、account delete、registry deny 與 delivery cancellation。
- public／anon／authenticated 無 execute；service role 可呼叫；raw table ACL 不放寬。

### Edge／egress

- exact inner／outer request、AES-GCM／RSA label、key rotation、bounded body、CORS、Auth、redacted log。
- hosted／local logs 不得命中 endpoint、keys、cleanup digest、inner payload、AES key 或 RSA private material。
- provider allowlist 空白、錯序、重複、DNS private result、3xx 與 policy drift 全部拒絕。
- browser validator、Edge validator、dispatcher validator 共用同一份 corpus，結果逐筆相等。

## 14. 實作批次與停點

1. `FA-03B10`：本契約 review freeze；只改文件。
2. `FA-03A4`：使用者核可後才做 additive DB migration、private helper、service-role wrappers 與 pgTAP。
3. `FA-03B11`：shared canonical subscription／provider policy validator、獨立 hybrid envelope 與 Edge structural
   ports，先 dormant。
4. `FA-03B12`：B5 manual re-enable、B1 correlation 與 enable／refresh browser coordinator，先 local composition。
5. dispatcher generation／canary barrier 與 legacy coexistence 先完成，仍維持 hosted disabled。
6. `FA-03B13`：production browser wiring、UI 狀態與 privacy 更新；server gate 預設關閉。
7. SW、hosted canary 與正式 cutover 各自獨立批次；每批獨立 commit。

任何 migration、hosted write、provider allowlist 實值、TTL／timeout 數字或 UI 文案，都需要各自的證據與核可，
不包含在本次文件授權內。

## 15. 查核來源

Repo：

- `src/notificationPushStorage.ts`
- `src/notificationPushAuthFailureCoordinator.ts`
- `src/features/profile-auth/authRefreshCoordinator.ts`
- `src/data/authApi.ts`
- `supabase/migrations/202608310007_push_lifecycle_runtime_control.sql`
- `supabase/migrations/202608310008_push_lifecycle_consent_registry.sql`
- `supabase/migrations/202608310011_push_lifecycle_quarantine_commands.sql`
- `supabase/functions/notification-outbox-dispatch/index.ts`
- `supabase/functions/push-cleanup/handler.js`

外部一手規格／官方文件：

- [W3C Push API](https://www.w3.org/TR/push-api/)
- [RFC 8030: Generic Event Delivery Using HTTP Push](https://www.rfc-editor.org/rfc/rfc8030.html)
- [RFC 8291: Message Encryption for Web Push](https://www.rfc-editor.org/rfc/rfc8291.html)
- [WHATWG URL Standard](https://url.spec.whatwg.org/)
- [W3C Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/)
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [web-push 3.x API reference](https://github.com/web-push-libs/web-push/blob/master/README.md)
- [Supabase Edge Function authorization headers](https://supabase.com/docs/guides/functions/auth-headers)
- [Supabase Edge Function Auth guide](https://supabase.com/docs/guides/functions/auth)

## 16. 複核者應特別檢查

1. consent `version` 同時承擔 transport CAS，是否有被任何既有 trigger／test 隱含限制。
2. `client_binding_id` 與 optional predecessor 是否足以覆蓋 crash、retry、cold boot 與兩 tab。
3. same-owner old-device endpoint replacement 的 lock order 是否仍可能和 quarantine deadlock。
4. provider DNS public-IP 驗證如何與真正送出的 socket 綁定，避免 check／connect 使用不同 DNS 結果。
5. Supabase production runtime 是否能提供可證明的 outbound egress allowlist；若不能，是否需要獨立 push gateway。
6. B1 cold-boot rejected 只依 cleanup-token capability 是否符合既有 threat model。
7. 獨立 hybrid envelope 是否需要採標準 JWE library，或現有 Web Crypto exact protocol 足以降低 implementation
   risk；無論選哪個，都不能把 inner payload 改回 plaintext request body。
