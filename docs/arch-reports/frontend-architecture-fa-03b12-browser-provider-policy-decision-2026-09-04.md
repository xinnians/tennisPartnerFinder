# FA-03B12.7 browser provider-policy contract decision

日期：2026-09-04  
狀態：**2026-09-06 使用者已選 A；契約升 v1.3，B11.1 dormant API 拆分已實作並驗證**

## 白話結論

原本不能直接實作 browser enable／refresh transport，因為契約與程式介面互相衝突：

- v1.2 明確說 provider origin allowlist 只能放在 server-only env。
- 但 B11 的 browser 加密函式必須先拿到這份 allowlist，否則連合法 payload 都無法序列化與加密。

這個衝突已由方案 A 解決：browser 只做結構驗證，provider allowlist 留在 server。production 值仍未填，且本批沒有
猜測或新增任何 hostname。

## 已查證證據

1. Push v2 contract v1.2 §8 明定 `PUSH_PROVIDER_ORIGINS_V1` 是 `server-only env`。
2. `validateCanonicalEndpoint(endpoint, providerOrigins)` 在 `providerOrigins` 不是 array 或 endpoint origin 未命中時回
   `null`。
3. `canonicalPushSubscriptionInnerJson(...)` 無條件呼叫上述 allowlist validator。
4. `encryptPushSubscriptionEnvelope(...)` 無條件先呼叫 `canonicalPushSubscriptionInnerJson(...)`，所以 browser 加密
   必須持有 provider origins。
5. production provider origin 實值目前仍為空，且既有決策 D27 禁止自行猜 FCM／Mozilla／Apple hostname。

## 方案 A（建議）

把「格式驗證」與「server policy 驗證」拆開：

- browser 只驗 endpoint 是 exact canonical HTTPS URL、不是 IP／localhost／special-use、符合 4,096 UTF-8 bytes，並
  驗證 `auth`／`p256dh`；不持有 provider allowlist。
- canonical serializer 與 browser encryption 使用這個結構驗證結果。
- Edge 解密後仍使用 server-only `PUSH_PROVIDER_ORIGINS_V1` 做完整 exact origin allowlist 驗證；未命中仍在 DB 前回
  `endpoint-unavailable`／`invalid`，依現有 response 契約實作。
- dispatcher send-time 仍使用同一份 server policy、DNS public-IP 檢查與禁止 redirect；安全承重點不變。

影響：需要把 Push v2 contract 升到 v1.3，並調整 B11 shared protocol API 與 canary。provider allowlist 不會公開，
也不需要 browser 猜值。這是我建議的選擇。

## 方案 B

把 provider origin allowlist 也做成 browser 可讀的 exact public asset／build config：

- browser、Edge、dispatcher 都拿同一份 canonical origins。
- 需要新增 public asset、header、build gate、三方 digest 同步與 rotation 規則。
- v1.2 的 `server-only env` 必須改成公開設定；清單本身通常不是秘密，但多一份公開設定會增加部署漂移與失效模式。

影響：變更面較大，而且 browser 檢查仍不是安全邊界；Edge／dispatcher 仍必須自己重驗，所以安全收益有限。

## 不接受的做法

- 不從實際 subscription endpoint 動態建立一筆「只包含自己」的假 allowlist；那不是 production policy。
- 不在 repo 寫死猜測的 provider hostname。
- 不把 server env 透過未定義機制偷偷注入 browser。
- 不因為 production 尚未啟用就略過 canonical／policy gate。

## 最終決策

使用者於 2026-09-06 選擇 `A`。已完成：

- Push v2 契約升為 v1.3。
- B11 shared protocol 拆成 browser structure 與 server provider-policy 兩層。
- browser serializer／encryption 不再需要 origins。
- Edge 解密後仍執行 exact server allowlist；未命中回 `endpoint-unavailable`，不進 DB。
- corpus 分別驗 structure 與 provider-policy 結果。

本決策沒有修改 migration、Hosted、production graph 或 production provider 值。
