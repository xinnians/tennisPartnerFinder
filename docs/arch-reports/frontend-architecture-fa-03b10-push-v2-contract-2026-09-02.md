# FA-03B10 Push v2 enable／refresh 技術契約 v1.2

日期：2026-09-02
狀態：**review freeze v1.2；2026-09-02 依 Claude 複核與使用者拍板修訂為 v1.1，同日補兩項拍板為 v1.2；尚未實作**

這份文件是給下一輪實作與 Claude 複核使用的固定契約。它把「repo 已存在的事實」和「未來要做的設計」分開寫，
避免把提案誤當成已完成。

## 修訂紀錄

- v1（commit `6fb2d1c`，2026-09-02）：首次 review freeze。
- v1.1（2026-09-02）：依 `frontend-architecture-fa-03b10-push-v2-contract-review-claude-2026-09-02.md` 與使用者
  當日拍板修訂：
  1. 取消 v1 曾定義的 `user_reenable` local reason，全文改沿用既有 `subscription_changed`（§5.2、§6.2、§10.4）。
  2. §8 egress 放寬為應用層充分條件；平台 egress 層降為 nice-to-have；DNS 檢查改為 TOCTOU 減緩措辭；寫下殘餘風險。
  3. §9.0 AES-GCM AAD 綁定已驗證 `authUserId`；釘死 `encryptedKey`／`iv`／`keyId`／AES key 長度。
  4. §9.5 401 先經 Auth authoritative lookup 複驗，再分類為 `unavailable` 或 `rejected`。
  5. §10.2 明列既有物件替換；`client_binding_id` 改為 `not null` 且不給 column default。
  6. §10.3 rule 1 指定 pause reason 為 `subscription_changed`。
  7. §10.4 predecessor 為 null 時採 same-owner rotation；predecessor 降為稽核資訊；補 exact retry 六欄定義與
     `quarantined` registry 回 `active`。複核建議的「三態一律先 pause 再旋轉」在 DB 上不可行：
     `PUSH_PAUSE_CANNOT_ROTATE_CONSENT`（`202608310008_push_lifecycle_consent_registry.sql:106-108`）禁止 paused
     狀態旋轉 hash／epoch、helper 只更新 `state = 'enabled'` 的 row
     （`202608310011_push_lifecycle_quarantine_commands.sql:384-389`）、`PUSH_REVOKED_CONSENT_CANNOT_PAUSE`
     （`202608310008_push_lifecycle_consent_registry.sql:133-135`）禁止 revoked → paused；v1.1 因此改為 `enabled`
     經 pause、`paused`／`revoked` 直接轉 enabled，三條路徑轉 enabled 時都 `set reason_code = 'user_enabled'`。
  8. §10.6 補 caller 預鎖 consent 與多 consent 的 `consent.id` 遞增鎖序。
  9. §10.7 補 runtime-disabled gate 的承重理由。
  10. §13 補 crash 後 predecessor null、401 複驗、三態 rotation、lock order 併發、AAD 重放與長度 canary 測試。
  11. §14 A4 口徑改為 additive＋既有物件替換；B11 加 `/push-subscription-key-v1.json` header rule；新增
      push-cleanup hosted 啟用批次。
  12. §16 改為複核紀錄與仍開放的檢查點。
- v1.2（2026-09-02）：使用者補兩項拍板，只影響 §10.4、§10.5 與 §13 DB：
  1. §10.4 新增「enabled、同 binding、無 transport」的 transport 重建路徑，封掉同 binding 永遠 `stale` 的鎖死；
     §10.5 對應回 `stale` 交由 enable 收斂。
  2. §13 DB 的 lock-order 併發測試明訂本機 pgTAP 單一連線的替代斷言與 canary；真併發 deadlock 與寫入階段三種
     搶插分支列入 §14 第 6 條 dispatcher barrier 批。

## 1. 本次已確認的產品決策

1. Auth 暫時無法驗證時，Push 先留在本機 `auth-unverified`，即使之後驗證成功也**不能自動恢復**。
2. 使用者必須再次按下啟用 Push，才可開始舊 binding cleanup 與新的 provisioning。
3. 本批只凍結契約、測試與 migration 邊界；不新增 migration、不接 production、不部署 hosted。
4. provider egress 採應用層充分條件：exact provider-origin allowlist 加 send-time DNS public-IP 檢查即可進
   enabled；平台 egress 層 allowlist 為 nice-to-have。
5. Edge envelope 的 AES-GCM AAD 綁定已驗證 `authUserId`，並釘死 `encryptedKey`／`iv`／`keyId` 與 AES key 長度。
6. 不新增 local reason；手動重新啟用沿用既有 `subscription_changed`。

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
2. local reason 沿用既有的 `subscription_changed`，不新增 reason 值；這只是本機稽核原因、不離開裝置，cleanup Edge
   仍只收到 raw-token envelope。
3. 必須等 B8 回 `cleanup-completed`，才可以建立新的 provisioning。
4. 新 provisioning 必須產生新的 `bindingId` 與 cleanup token；不得重用舊 token。
5. DB enable command 若看到同帳號＋同裝置的既有 consent，在 predecessor 為 null 時依 §10.4 在同一 transaction 依
   server state 分流：`enabled` 先以 `subscription_changed` pause 舊 epoch，再以新 token hash 轉 enabled；
   `paused`／`revoked` 直接以新 token hash 轉 enabled，由現行 consent trigger 自動旋轉 epoch，不經 pause。唯一
   不可跨越的是 endpoint registry owner lock。
6. caller 帶 predecessor 時，server 現況必須與 predecessor 完整相符（§10.3 的兩種 exact successor）：仍為
   `enabled` 的第一種於同一 transaction 先 pause 舊 epoch、再啟用新 epoch；one-step `paused／cleanup_quarantine`
   的第二種直接以新 token 啟用新 epoch、不經 pause。不相符就回 stale。predecessor 是偵測 client 狀態漂移的稽核
   資訊，正確性不依賴它。
7. cleanup pending、Edge unavailable、owner conflict 或 stale 時都維持關閉，不建立第二條 server transport。
8. predecessor 非 null 而收到 stale 時，browser 保留該 provisioning 與 raw cleanup token、不取消也不自動重試；
   下一次使用者明確按下啟用時，以 predecessor null、同一 `bindingId` 與同一 token 重送，依 §10.4 的 same-owner
   rotation 收斂。predecessor 只在同一次 coordinator invocation 有效，不跨使用者動作保留。

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
  - 原子地產生 reason 為 `subscription_changed` 的 cleanup attempt；不建立新 provisioning。
- cleanup 完成後沿用既有 `beginExplicitPushProvisioning(...)` 建立全新 binding。
- `cancelExplicitPushProvisioning(...)`
  - 只允許在 browser 能證明 enable network **尚未開始**時使用，例如 permission 在 request 前被拒絕。
  - 以 exact owner／binding／revision 刪除 provisioning，不建立 cleanup attempt。
  - 一旦 request 可能已送出，unknown／abort／crash 都必須保留原 provisioning，以同一 request 重試；不得取消。
- 本契約不新增任何 local reason 值。B5 `CLEANUP_REASONS`、B9 coordinator 與 DB consent reason 三邊都已支援
  `subscription_changed`，因此不需要改 attempt validator。理由：B5 validator 對未知 reason 一律判 `invalid`，而
  §6.1 禁止 bump IndexedDB version；若新增 reason，前端回滾到舊 bundle 後整個 push 子系統會讀成 `invalid`，
  raw token 鎖在讀不到的記錄裡。

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
- send-time 必須再次驗同一 policy 並禁止 redirect；DNS A／AAAA 全部為 public address 的檢查也在 send-time 執行，
  但它只是 TOCTOU 減緩：現行 dispatcher 呼叫 `sendNotification()` 未傳 `agent`
  （`supabase/functions/notification-outbox-dispatch/index.ts:49`），檢查用的解析結果與實際 socket 沒有綁定；
  `web-push@3.6.7` 允許自訂 `https.Agent`（`src/web-push-lib.js:210-216` 收 `options.agent`，`:360-361` 塞進
  `httpsOptions.agent`，`:369` 交給 `https.request`；來源
  <https://github.com/web-push-libs/web-push/blob/v3.6.7/src/web-push-lib.js>，行號依該 tag），是否以 agent
  `lookup` 綁定，留給 §14 第 6 條 dispatcher generation／canary barrier 批實測；這是 dispatcher 側行為。
  真正的保證來自 exact origin allowlist 與禁止 redirect。
- v2 進 enabled 的充分條件是應用層 exact provider-origin allowlist 加上 send-time DNS public-IP 檢查。平台 egress 層
  的相同 origin allowlist 是 nice-to-have，取得部署平台證據時再補上，不作為 gate。
- 殘餘風險：攻擊者必須能控制 provider origin 的 DNS 解析結果，才能把已通過 allowlist 的 origin 導向非預期位址。
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
- AES-GCM additional data 固定為 `qiuka.tw/push-subscription-v2/envelope/v1/` 後接已驗證 `authUserId` 的
  canonical lowercase UUID 字串，整體取 UTF-8 bytes。browser 以 B1 verified session 的 `authUserId` 組 AAD；
  Edge 以 JWT 驗證後的 `authUserId` 組 AAD 解密。兩者不符時 AES-GCM tag 驗證失敗，Edge 回 `invalid`，不進 DB。
  目的：threat model 含 gateway／log 觀察者；若 AAD 不綁定 caller 身分，觀察者可以用自己的合法 JWT 重放他人的
  envelope。
- 長度固定：`encryptedKey` decode 後恰 256 bytes（2048-bit RSA）；`iv` decode 後恰 12 bytes；`keyId` decode 後
  恰 32 bytes；RSA 解出的 AES key 恰 32 bytes。前三者在任何 crypto 運算前檢查，AES key 長度在 AES-GCM 解密前
  檢查；任一不符都判 `invalid`。
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
最後一次 local commit 的 server identity，不代表 cleanup 後的 current version。B8 cleanup 完成即刪除該 attempt，
因此 predecessor 只存在於同一次 coordinator invocation 的記憶體；crash 後重新啟用時 predecessor 為 null，依
§10.4 的 same-owner rotation 收斂。

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
- 401 由 Auth boundary 處理；browser 交回 B1，不能自行判定 anonymous。enable／refresh 收到 401 時，browser 不得
  直接分類為 `rejected`；必須先以 Auth authoritative lookup（`getUser` 類）複驗。session 仍有效時視為
  `unavailable`，只做 local close，保留 binding 與 token；只有 authoritative lookup 也判定 session 無效，才可產生
  `rejected`。理由：Edge 端 JWT secret 輪替或 clock skew 不得造成全體裝置自毀 binding。
- response body 額外 key、錯誤 content type、redirect 或其他 status 一律由 browser adapter 映射為 unavailable。
- response 不含 capability URL 或 subscription keys，可維持 plaintext；仍必須 `no-store` 且不得進應用 log。

## 10. DB command 契約

### 10.1 新增函式

- `public.enable_push_device_v2(...) returns jsonb`
- `public.refresh_push_transport_v2(...) returns jsonb`
- 共用 mutation 放在 `private` helper。

兩個 public wrapper 的 `EXECUTE` 只授予 service role；`public／anon／authenticated` 全部 revoke。它們使用
`security definer` 與空 `search_path`。browser 不能繞過 Edge 直接呼叫。

### 10.2 schema 變更：additive 欄位與既有物件替換

未來 migration 至少需要：

- `private.push_device_consents.client_binding_id uuid not null`：server 與 B5 binding 的明確 correlation。
  **不給 column default**；舊本機 fixture 由 pgTAP fixture 的 insert 明確補值，不用 `gen_random_uuid()` default
  backfill。理由：default 會讓忘記帶 binding 的 command 靜默拿到隨機值，refresh 的 binding CAS 因此失效。
- `private.push_device_consents.transport_revision uuid`：transport 語意變更時觸發 consent `version + 1`；
  browser 不需要保存這個值。
- exact constraint／trigger：
  - `profile_id`、`device_id` 維持既有無條件不可變。現行 `private.maintain_push_device_consent()`
    （`supabase/migrations/202608310008_push_lifecycle_consent_registry.sql:67`）在 update 分支比對這兩欄，
    任一 `is distinct from` 即 `raise exception 'PUSH_CONSENT_IDENTITY_IMMUTABLE'`（同檔 `:94-97`，raise 在
    `:96`）；此行為不變。
  - `client_binding_id`（同樣只在 update 分支比對）只允許在 `old.state <> 'enabled'` 且 `new.state = 'enabled'`
    （轉 enabled 的 hash 旋轉）時改變；`old.state = 'enabled'` 且 `new.state = 'enabled'` 時不可變，違反即 raise。此檢查由「既有物件替換」
    第 1 條的同一 trigger function 承擔；refresh command 的 where 條件另外比對 binding，兩層都要。

hosted 在套用前仍要唯讀確認 v2 table 是否為空。不能根據目前 local 結果假設 hosted 也是空的。

#### 既有物件替換

以下不是 additive，而是同一批 migration 必須一起完成的既有物件替換；`FA-03A4` 的 exact diff 回報要把它們與
additive 欄位分開列出：

1. `create or replace function private.maintain_push_device_consent()`：`semantic_changed` 納入 `transport_revision`
   變更，對應 §6.1 的統一 binding version。現行
   `semantic_changed := state_changed or epoch_changed or hash_changed;` 不含 transport，只加欄位不會讓 version
   遞增。同一次 replace 一併加入上述 `client_binding_id` 的條件不可變檢查，述詞與 additive 欄位段完全相同：只有
   `old.state <> 'enabled'` 且 `new.state = 'enabled'` 的 update 可改寫 binding，其餘 update 一律不得改寫。
2. `create or replace function private.quarantine_locked_push_consent(...)`：reason 白名單加入 `subscription_changed`。
   現行 helper 只接受 `user_logout`／`cleanup_quarantine`。
3. 同批更新 `supabase/tests/push_lifecycle_private_foundation.sql` 的 consent exact-column 斷言，納入新欄位；並為
   兩份 pgTAP 檔中直接 insert `private.push_device_consents` 的 fixture（`push_lifecycle_private_foundation.sql`
   `:571`、`:585` 兩處；`push_lifecycle_quarantine_commands.sql` `:530`、`:991`、`:1406` 三處）明確補上
   `client_binding_id`。`:571` 的 `PUSH_CONSENT_MUST_START_ENABLED` throws_ok 也一併帶值，使五處 fixture 一致；
   `push_device_consents_maintain` 是 `before insert or update` trigger
   （`supabase/migrations/202608310008_push_lifecycle_consent_registry.sql:180-182`），BEFORE trigger 先於 not-null
   檢查擲出（`:80-81`），不帶值也不會翻紅，帶值只為 fixture 一致。
4. 把 `private.quarantine_locked_push_consent(...)` 內的 active transport 查詢
   （`supabase/migrations/202608310011_push_lifecycle_quarantine_commands.sql:358-365`）、registry 與 transport 的
   `for update`（`:367-382`）、registry quarantine 與 transport 刪除（`:395-409`）、delivery 鎖定與 cancel
   （`:411-427`）抽成一個不檢查、不改寫 consent state 的 private 殘留清理子 helper，並保留 registry（`:368-375`）→
   transport（`:377-381`）→ deliveries（`:411-417`）的鎖序，行號與 §10.6 同口徑；`quarantine_locked_push_consent`
   改為先 pause consent 再呼叫該子 helper；v2 enable command 只在 §10.4 predecessor 為 null 的 `paused`／`revoked`
   rotation 路徑，以及 same-owner old-device replacement 的 `paused`／`revoked` 分支，直接呼叫同一個子 helper。
   predecessor 非 null 的 §10.3 rule 2（`paused`／`cleanup_quarantine`）依 §10.4 不呼叫子 helper，因為該狀態的殘留
   已由 token cleanup 清乾淨。殘留清理只允許這一個實作點；enable command 內不得另寫一份 registry＋transport＋delivery 三段。呼叫子 helper 前
   caller 仍須依 §10.6 已持有該 consent row 的
   `FOR UPDATE`。子 helper 的 security 模式、`search_path` 與 execute ACL 與父 helper 完全相同：建在 `private`、
   `language plpgsql`、`security definer`、`set search_path = ''`（父 helper 的實際值見
   `supabase/migrations/202608310011_push_lifecycle_quarantine_commands.sql:347-349`），owner 為 `postgres`，
   並比照 `:431-432` 對 `public, anon, authenticated, service_role` 全部 `revoke all on function`。

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
   server；enable command 必須在同 transaction 先以 `reason_code = 'subscription_changed'` pause 舊 epoch，再建立
   新 epoch。
2. 同 consent ID／epoch、`version === predecessor.version + 1`、state 為 paused、reason 為
   `cleanup_quarantine`。這是現有 token-cleanup command 唯一能產生的 successor；可以直接以新 token re-enable。

version 相差超過一、epoch 已變、ID 不同或 reason 不符合時一律 stale。不得用 `>=` 接受未知中間變更。以上兩條只適用
predecessor 非 null 的 request；predecessor 為 null 時依 §10.4 的 same-owner rotation 規則。

### 10.4 enable state transition

- 無 consent：建立 enabled consent、active registry 與 v2 transport。
- 判定順序：先比 request `bindingId` 與 stored `client_binding_id`。相等時只走 exact retry（no-op success）、
  無 transport 時的 transport 重建，或 stale，不進 rotation；不相等（新 provisioning 的新 `bindingId`）才依 predecessor 是否為 null 分流。
- predecessor 非 null 時，只接受 §10.3 的兩種 exact successor 狀態：exact enabled 於同一 transaction 先 pause 舊
  epoch，再以新 token／binding 啟用新 epoch，該 pause 必須經 `private.quarantine_locked_push_consent`
  （`reason_code = 'subscription_changed'`）執行，不得自寫第二份 registry＋transport＋delivery 三段；one-step
  `paused／cleanup_quarantine` 直接以新 token 啟用新 epoch，不需再呼叫 §10.2 第 4 條的子 helper——該
  `paused／cleanup_quarantine` 是既有 `public.quarantine_push_by_token` 經父 helper 產生的狀態
  （`supabase/migrations/202608310011_push_lifecycle_quarantine_commands.sql:554-559`），registry、transport 與
  delivery 的殘留在當時已清乾淨。不符回 stale。
- predecessor 為 null 且 request `bindingId` 不等於 stored `client_binding_id` 時，同一 verified auth user＋同一
  device 的既有 consent，不論有無 active transport，都可由明確 enable 動作在同一 transaction 內旋轉 cleanup hash
  與 consent epoch、建立新 binding；路徑依 server state 分流，唯一不可跨越的是 endpoint registry owner lock：
  - `enabled`：先經 `private.quarantine_locked_push_consent` 以 `subscription_changed` pause 舊 epoch（helper 內部
    經 §10.2 第 4 條的殘留清理子 helper 做 registry quarantine、transport 刪除與 delivery cancel），再以新 cleanup
    hash 與新 binding 轉 enabled，並同時 `set reason_code = 'user_enabled'`；trigger 在 old.state 不是 `enabled` 且
    hash 已變時自行產生新 epoch（`supabase/migrations/202608310008_push_lifecycle_consent_registry.sql:117-127`）。
  - `paused`：不再 pause。`PUSH_PAUSE_CANNOT_ROTATE_CONSENT`（同檔 `:106-108`）禁止在 paused 狀態旋轉 hash／
    epoch，且 helper 只更新 `state = 'enabled'` 的 row，對 paused row 是靜默 no-op
    （`supabase/migrations/202608310011_push_lifecycle_quarantine_commands.sql:384-393`）。command 在已持有 consent
    `FOR UPDATE` 的前提下呼叫 §10.2 第 4 條的殘留清理子 helper（不得自寫 registry／transport／delivery 三段），再以新
    hash 直接 update 為 enabled 並同時 `set reason_code = 'user_enabled'`，由 trigger 自動旋轉 epoch。
  - `revoked`：直接 revoked → enabled，不得經 paused（`PUSH_REVOKED_CONSENT_CANNOT_PAUSE`，
    `202608310008_push_lifecycle_consent_registry.sql:133-135`）；殘留清理呼叫與 `paused` 相同的子 helper，update 時
    同樣 `set reason_code = 'user_enabled'`。
  - 三條路徑轉 enabled 時都必須寫 `reason_code = 'user_enabled'`：`push_device_consents_state_shape` 要求 enabled row
    的 reason 恰為 `user_enabled`（`202608310008_push_lifecycle_consent_registry.sql:35-38`），而 helper pause 後的
    row 是 `subscription_changed`、`paused` 舊 row 是 `cleanup_quarantine`、`revoked` 是 `user_disabled`
    （同檔 `:52-55`）；只 `set state = 'enabled', cleanup_token_hash = ...` 會撞 check constraint。
    `cleanup_token_revoked_at` 由 trigger 自動清空（同檔 `:149-157`），command 不需再寫。
- predecessor 是偵測 client 狀態漂移的稽核資訊，不是正確性前提。crash、B8 回 `OK` 但 server 未變、legacy
  dispatcher 誤刪 transport 三種情境都靠 same-owner rotation 收斂。
- enabled 且 exact retry：no-op success。exact retry 的定義是 stored `client_binding_id`、`cleanup_token_hash`、
  endpoint fingerprint、`p256dh`、`auth`、VAPID fingerprint 全部相同。
- enabled、bindingId 等於 stored `client_binding_id`、仍有 transport 但內容不同：stale；改寫既有 binding 的
  transport 是 refresh 的職責，不是 enable。
- enabled、bindingId 等於 stored `client_binding_id`、且該 consent 完全沒有 transport（例如 legacy dispatcher 以
  endpoint 誤刪 v2 row）：enable command 以 request 的 subscription 直接重建 transport；不旋轉 cleanup hash、
  consent epoch 或 binding，consent version 依 §6.1 因 transport 語意變更遞增一次，回 `committed`。registry 仍走
  本節的 owner lock 與 `quarantined` 回 `active` 規則。使用者於 2026-09-02 拍板，用來封掉「同 binding 卻永遠
  `stale`」的鎖死路徑；§13 DB 有對應測試。
- endpoint registry different owner 或 deny：generic endpoint-unavailable；不得更新 owner。
- 同 owner、同 fingerprint 的 registry 若處於 `quarantined`，enable command 在同一 transaction 將其回 `active`；
  registry quarantined → active 的 trigger 轉換已有 pgTAP 覆蓋（`push_lifecycle_private_foundation.sql` 的
  `registry reactivation increments its semantic version once`），enable command 本身的路徑仍要在 `FA-03A4` 加測。
- 同 owner 的舊 device 正占用同一 endpoint：caller 先依 §10.6 以 `consent.id` 遞增順序鎖住新舊兩筆 consent，再依
  舊 device consent 鎖定後重讀的 state 分流（與本節既有三態分流一致）：
  - 舊 consent 為 `enabled`：經 `private.quarantine_locked_push_consent` 以 `reason_code = 'subscription_changed'`
    （§10.2「既有物件替換」第 2 條加入白名單）pause，殘留清理由 helper 內部經第 4 條子 helper 完成。
  - 舊 consent 為 `paused`／`revoked`：不 pause。父 helper 只更新 `state = 'enabled'` 的 row，對其他狀態是靜默
    no-op（`supabase/migrations/202608310011_push_lifecycle_quarantine_commands.sql:384-393`），因此改為在已持有
    該 consent `FOR UPDATE` 的前提下直接呼叫 §10.2 第 4 條的殘留清理子 helper，刪除殘留 transport 並 quarantine
    registry，consent 的 `reason_code` 不變。
  - 兩條分支之後才啟用新 device；整段必須是同一 transaction，不能留下兩個 active transport。舊 transport 若未被
    清掉，新 device 的 transport insert 會撞 `push_subscriptions_endpoint_fingerprint_idx`（同檔 `:72-77`）的
    unique violation，而不是本節規定的 generic endpoint-unavailable。

### 10.5 refresh state transition

- 只接受目前 enabled 且仍有 transport 的 consent；enabled 但無 transport 回 `stale`，由 §10.4 的同 binding
  transport 重建路徑收斂，refresh 不自行補建。
- endpoint 相同但 keys 不同，視為 transport change。
- endpoint 不同時，舊 registry 先變 `quarantined／transport_replaced`，新 registry 才能 active。
- 新 endpoint different owner／deny 時整筆 rollback，舊 transport 保持原狀但 caller 本機仍 fail-closed。
- refresh 不旋轉 cleanup token、不換 consent epoch、不換 binding ID。

### 10.6 lock order

所有 v2 mutation 固定：

```text
consent -> endpoint registry（fingerprint byte order） -> transport -> deliveries
```

不存在的 consent／registry 用 unique insert 收斂，再鎖住實際 row；不得為不同 code path 改變順序。

helper 的鎖序分兩個時點，兩者不同：

- `FA-03A4` 前（現行）：`private.quarantine_locked_push_consent` 自身不對 consent 預取 `FOR UPDATE`。它依序取
  registry 鎖（`202608310011:368-375`）、transport 鎖（`:377-381`），接著以 `update` 隱含鎖住 consent row
  （`:384-389`），最後鎖 deliveries（`:411-417`）；整段為 `202608310011:367-417`。實際順序是
  registry → transport → consent update → deliveries。caller 未預鎖 consent 時整體順序會退化成
  registry → transport → consent，與先鎖 consent 的 `quarantine_push_device`／`quarantine_push_by_token` 形成
  ABBA。既有這兩個 caller 都先鎖 consent 再呼叫 helper，整體順序才成立。
- `FA-03A4` 後（§10.2「既有物件替換」第 4 條）：`quarantine_locked_push_consent` 改為先 pause consent，再呼叫
  殘留清理子 helper；子 helper 只取 registry → transport → deliveries，不碰 consent。
- 兩個時點的共同規則：caller 在呼叫任何 helper（父 helper 或子 helper）前，必須已持有該 consent row 的
  `FOR UPDATE`；一個 transaction 需要鎖多筆 consent 時（same-owner old-device replacement），依 `consent.id`
  遞增順序取得；exact-retry 與 stale 判定必須讀鎖定後的 consent row，不得用鎖前讀到的快照；傳給父 helper 或子
  helper 的 `consent_epoch` 參數同樣必須取自鎖定後重讀的 row，用鎖前快照會讓父 helper 的
  `consent_row.consent_epoch = p_consent_epoch` 條件（`202608310011:388`）不成立而靜默 no-op。

### 10.7 legacy coexistence

- 現行 legacy dispatcher 會讀全部 `push_subscriptions`，不看 `consent_id`、registry 或 runtime control。
- v2 enable 遇到「相同 endpoint、相同 owner」的 legacy row 時，可以在同一 transaction 先刪 legacy row，再建立
  v2 row；trigger 禁止直接把 legacy row update 成 v2。
- 相同 endpoint 但 owner 不同時只回 endpoint-unavailable，不能轉讓。
- v2 DB command 在 legacy worker 尚未具備 generation／canary barrier 前必須回 runtime-disabled；不能先產生
  production v2 row，再假設舊 worker 不會送。理由：現行 legacy dispatcher 對 404／410 以 endpoint 刪
  `push_subscriptions` row（`supabase/functions/notification-outbox-dispatch/index.ts:142`），會誤刪 v2 transport，
  留下 enabled-without-transport 的 consent；這個 gate 是承重的。
- production browser wiring 可以先進 bundle，但 actual Edge call 必須被同一 server-controlled gate 關閉，直到
  legacy／v2 worker barrier、canary profile 與 rollback 流程完成。
- hosted 現有 legacy row 的轉換或刪除是另一個需核可的 migration／runtime 動作，不包含在 `FA-03A4`（additive
  欄位＋§10.2 既有物件替換）授權內。

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

既有凍結斷言（consent exact-column、private trigger helper 與 quarantine helper 的 security／ACL 斷言）必須同批
更新，不得留紅。

### Browser／unit

- Auth unavailable 後驗證成功不會自動呼叫 Push port。
- 手動 re-enable 必須 cleanup completed 才建立新 provisioning；pending／throw 都停住。
- cleanup 完成後、enable 送出前 crash，重新啟用時以 predecessor null 成功。
- predecessor 非 null 收到 stale 後保留 provisioning 與 token；下一次明確啟用以 predecessor null、同一 `bindingId`
  重送並成功。
- enable／refresh 收到 401，經 Auth authoritative lookup 複驗 session 仍有效時分類為 `unavailable`，只做 local
  close；lookup 也判定無效時才產生 `rejected`。
- 兩 tab 同時 enable 只使用一筆 B5 provisioning 與 cleanup token。
- Edge success 後 local commit crash，重試得到同一 consent snapshot。
- Auth／binding revision 在 network 中改變，response 不可 commit。
- endpoint parser 的 userinfo、fragment、port、IP literal、non-canonical、oversize 與額外 key canary。
- 65-byte valid／invalid P-256 point、16-byte auth 與 base64url canonical matrix。

### DB

- initial enable、exact retry、no-op、concurrent differing input、stale predecessor。
- paused／revoked／enabled manual re-enable 各自產生新 epoch。
- predecessor null 對 `enabled`／`paused`／`revoked` 三態各走 §10.4 的路徑（`enabled` 經 helper pause；
  `paused`／`revoked` 直接轉 enabled、不經 pause）都成功，且每次都只留一條 active transport；轉 enabled 後
  `reason_code = 'user_enabled'`、`cleanup_token_revoked_at is null`。
- 殘留清理只有一個實作點：pg_proc 斷言 §10.2 第 4 條的私有子 helper 存在，且 `quarantine_locked_push_consent` 與
  v2 enable command 的 `pg_get_functiondef` 都引用它；`pg_get_functiondef(enable command)` 不得含殘留清理三段的
  文字特徵，exact 特徵為：registry quarantine 的 `set state = 'quarantined'` 與 `reason_code = 'consent_paused'`
  （`202608310011:396-398`）、`delete from public.push_subscriptions` 同時出現對 `consent_id` 的相等或非 null 比較
  （`consent_id =`、`consent_id in`、`consent_id is not null` 任一，不綁右側運算元寫法；`202608310011:406-408`
  現行為 `consent_id = p_consent_id`），而 `consent_id is null` 作為唯一的 `consent_id` 述詞時一律不算命中、delivery cancel 的
  `update private.notification_deliveries ... set state = 'cancelled'` 加 `error_code = 'consent_inactive'`
  （`:419-424`）。比對口徑：`pg_get_functiondef` 回傳保留原始換行與縮排（三段特徵在來源都是跨行的），因此斷言
  不得以上列單行字面做子字串比對；必須以忽略空白差異的 regex 比對，或把每段拆成獨立 token 要求同時出現才判定
  命中（例如同時出現 `state = 'quarantined'` 與 `reason_code = 'consent_paused'` 即命中）。該斷言必須以「把殘留
  清理三段內聯進 enable command」的 canary 驗紅一次，證明它有牙。掃描範圍明確排除兩處合法的其他寫入：§10.4 的
  registry reactivation（同 owner、同 fingerprint 的 `quarantined` registry `set state = 'active'`）與 §10.7 的
  legacy row 刪除（以 endpoint fingerprint＋owner 為條件、且只針對 `consent_id is null` 的 legacy row 的
  `push_subscriptions` delete；`consent_id is null` 是它唯一的 `consent_id` 述詞，依上列 token 規則本來就不命中）；
  兩者都不算殘留清理。並以同一 fixture 驗
  `enabled` 經 helper 與 `paused` 直接路徑清理後的 registry state／reason、transport 列數、delivery state／
  `error_code` 逐欄相等。
- 同 owner、同 fingerprint 的 `quarantined` registry 在 enable command 內回 `active`。
- exact retry 必須 `client_binding_id`、`cleanup_token_hash`、endpoint fingerprint、`p256dh`、`auth`、VAPID
  fingerprint 六欄全同才 no-op；任一不同不得回 no-op success。
- refresh endpoint、keys、VAPID change 都增加 transport 與 consent version；no-op 不增。
- different owner／deny 永不轉讓；same-owner old-device replacement 不留下雙 active transport；舊 consent 為
  `enabled` 時轉 paused 後 `reason_code = 'subscription_changed'`，舊 consent 為 `paused`／`revoked` 時 reason
  不變、僅做殘留清理。
- lock-order concurrency、rollback、account delete、registry deny 與 delivery cancellation；v2 command 與既有
  `quarantine_push_device`／`quarantine_push_by_token` 併發不 deadlock。本機 `npx supabase test db` 是單一連線、
  整份測試在一個 transaction 內，真正的雙連線 deadlock 無法觸發；A4 以兩類可證偽的替代斷言守（使用者於
  2026-09-02 拍板）：(a) 對 `pg_get_functiondef` 的取鎖述句順序斷言，每個錨點先驗非空，並以「把 registry 取鎖搬到
  consent `for update` 之前」與「刪掉 command 內 consent 的 `for update`」兩個 canary 各驗紅一次；(b) 同一
  transaction 內 v2 command 與既有 quarantine 指令交錯呼叫後狀態收斂。真正的雙連線 deadlock 測試，以及只有真併發
  才會走到的三個寫入階段分支（consent 被搶插、目標 registry 被搶插、cleanup hash 撞唯一索引），列入 §14 第 6 條
  dispatcher barrier 批並在 CI 加 `dblink`；A4 不得把這三個分支寫成已覆蓋。
- enabled、同 binding、無 transport 時 enable 重建 transport：回 `committed`、consent version 恰 +1、cleanup hash／
  epoch／binding 不變、registry 回 `active`；同情境 refresh 回 `stale`。
- `push_lifecycle_private_foundation.sql` 的 consent exact-column 斷言同批更新為含新欄位的清單；兩份 pgTAP 檔中
  直接 insert `private.push_device_consents` 的五處 fixture（§10.2 既有物件替換第 3 條）都明確帶 `client_binding_id`。
- `push_lifecycle_private_foundation.sql` 的三個 trigger helper invoker-security／empty search_path 斷言
  （`:169-180`）與 `push_lifecycle_quarantine_commands.sql` 的 `quarantine_locked_push_consent` security／ACL
  斷言（`:124-132`、`:233-243`），在 §10.2 的 `create or replace` 後必須仍綠。
- §10.2 第 4 條的殘留清理子 helper 納入 `push_lifecycle_quarantine_commands.sql` `:124-132`／`:233-243` 同型的
  pg_proc／ACL 斷言：`:124-132` 型的 owner `postgres`＋`prosecdef` 為真＋`proconfig @> array['search_path=""']`
  （該 count 由 4 改為 5，並把子 helper 加進 `proname` 的 security-definer 例外清單）；`:233-243` 型的 `anon`、
  `authenticated`、`service_role` 對子 helper 皆無 `execute`。
- public／anon／authenticated 無 execute；service role 可呼叫；raw table ACL 不放寬。

### Edge／egress

- exact inner／outer request、AES-GCM／RSA label、key rotation、bounded body、CORS、Auth、redacted log。
- 以另一使用者的合法 JWT 重放一份合法 envelope，Edge 回 `invalid`，DB 無寫入。
- `encryptedKey`／`iv`／`keyId`／AES key 各自的長度 off-by-one canary（多一 byte 與少一 byte）都判 `invalid`。
- AAD 只含固定字串、未綁 `authUserId` 的 envelope（v1 契約草案格式，repo 從未實作）判 `invalid`。
- hosted／local logs 不得命中 endpoint、keys、cleanup digest、inner payload、AES key 或 RSA private material。
- provider allowlist 空白、錯序、重複、DNS private result、3xx 與 policy drift 全部拒絕。
- browser validator、Edge validator、dispatcher validator 共用同一份 corpus，結果逐筆相等。

## 14. 實作批次與停點

1. `FA-03B10`：本契約 review freeze；只改文件。
2. `FA-03A4`：使用者核可後才做 additive schema＋§10.2「既有物件替換」第 1–4 條（含殘留清理子 helper 抽取）、
   private helper、service-role wrappers 與 pgTAP。
3. `FA-03B11`：shared canonical subscription／provider policy validator、獨立 hybrid envelope 與 Edge structural
   ports，先 dormant。交付物包含 `vercel.json` 對 `/push-subscription-key-v1.json` 的 `no-store` header rule 與
   `tests/security-headers.test.js` 的對應斷言；目前兩者都只涵蓋 `/push-cleanup-key-v1.json`。
4. push-cleanup hosted 啟用批次：distributed limiter 與 evidence-based 門檻完成後，才可移除 hosted 硬關閉。§5.2
   的手動重新啟用依賴 B8 在 production 回 `cleanup-completed`，因此這批未完成前，`FA-03B12` 只能停在 local
   composition。
5. `FA-03B12`：B5 manual re-enable、B1 correlation 與 enable／refresh browser coordinator，先 local composition。
6. dispatcher generation／canary barrier 與 legacy coexistence 先完成，仍維持 hosted disabled。含
   `sendNotification()` 傳入自訂 `https.Agent` 的 `lookup` 綁定 canary（local），與 §12 的 DNS／redirect
   egress test。
7. `FA-03B13`：production browser wiring、UI 狀態與 privacy 更新；server gate 預設關閉。
8. SW、hosted canary 與正式 cutover 各自獨立批次；每批獨立 commit。

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
- [web-push v3.6.7 `src/web-push-lib.js`](https://github.com/web-push-libs/web-push/blob/v3.6.7/src/web-push-lib.js)
  （§8 引用的 `:210-216`／`:360-361`／`:369` 行號依該 tag）
- [Supabase Edge Function authorization headers](https://supabase.com/docs/guides/functions/auth-headers)
- [Supabase Edge Function Auth guide](https://supabase.com/docs/guides/functions/auth)

## 16. 複核紀錄與仍開放的檢查點

2026-09-02 Claude 複核報告：`frontend-architecture-fa-03b10-push-v2-contract-review-claude-2026-09-02.md`。
v1 列出的七個檢查點，複核結果與 v1.1 的處理方式如下：

1. consent `version` 同時承擔 transport CAS：複核判 RISK。現行 `maintain_push_device_consent()` 的
   `semantic_changed` 不含 transport，只加 `transport_revision` 欄位不會讓 version 遞增；v1.1 於 §10.2 把該
   trigger function 列為既有物件替換。
2. `client_binding_id` 與 optional predecessor 的覆蓋度：複核判 FAIL。B8 cleanup 完成即刪 attempt，predecessor
   只存在記憶體，crash 後 v1 的 §10.4 會永久回 stale；v1.1 改為 predecessor null 時 same-owner rotation，
   predecessor 降為稽核資訊。複核建議的「三態一律先 pause（reason `subscription_changed`）再旋轉」在 DB 上不可行：
   `PUSH_PAUSE_CANNOT_ROTATE_CONSENT`（`202608310008_push_lifecycle_consent_registry.sql:106-108`）、helper 只更新
   `state = 'enabled'` 的 row（`202608310011_push_lifecycle_quarantine_commands.sql:384-389`）、
   `PUSH_REVOKED_CONSENT_CANNOT_PAUSE`（`202608310008_push_lifecycle_consent_registry.sql:133-135`）三者擋住
   paused／revoked 的 pause 路徑，v1.1 因此偏離複核建議，改為 `enabled` 經 pause、`paused`／`revoked` 直接轉
   enabled，殘留清理共用 §10.2 第 4 條的子 helper。
3. same-owner old-device replacement 與 quarantine 的 lock order：複核判 FAIL。helper 自身不鎖 consent，v1 沒寫
   caller 必須預鎖；v1.1 於 §10.6 明寫 caller 預鎖 consent 與多 consent 的 `consent.id` 遞增鎖序。
4. provider DNS public-IP 驗證與實際 socket 的綁定：複核判 RISK。現行 dispatcher 呼叫 `sendNotification()` 未綁定
   agent；v1.1 於 §8 把 DNS 檢查改為 TOCTOU 減緩。仍開放：DNS 與 socket 綁定的實測留給 §14 第 6 條的
   dispatcher generation／canary barrier 批（dispatcher 側行為）。
5. Supabase production runtime 的 outbound egress allowlist：複核判 RISK 且無法從官方文件證明；使用者於
   2026-09-02 拍板放寬，v1.1 於 §8 採應用層充分條件。仍開放：平台 egress 層證據屬 nice-to-have，有證據時補上。
6. B1 cold-boot rejected 只依 cleanup-token capability：複核判 PASS；v1.1 不變。
7. 獨立 hybrid envelope 是否需改採 JWE：複核判 RISK，不必改 JWE，但 v1 的固定字串 AAD 可跨帳號重放；使用者於
   2026-09-02 拍板，v1.1 於 §9.0 把已驗證 `authUserId` 綁進 AAD 並釘死長度。inner payload 仍不得改回 plaintext
   request body。

複核另外提出的項目：rule 1 未指定 pause reason（§10.3 已補）、401 分類未定（§9.5 已補）、§10.2 的 additive 不成立
（§10.2 已明列既有物件替換）、push-cleanup hosted 硬關閉（§14 已加前置批次）、新增 local reason 與 §6.1 衝突
（§5.2／§6.2 已改沿用 `subscription_changed`）。
