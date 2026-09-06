# FA-03B13 Push v2 production wiring 前置盤點

日期：2026-09-07
狀態：完成（只讀 repo；沒有接 production、沒有 Hosted 操作）

## 白話結論

新 Push v2 的本機路徑已經走通，但現在還不能直接把它接到畫面的「開啟推播」。

原因不是 production code 對不上，而是正式串接還缺五個明確接點：

1. Auth 只在 B1 內部知道「這份 session 已經由 server 驗證」及其 revision；Push v2 還讀不到這份 proof。
2. 畫面按鈕仍走 legacy `save_push_subscription`，不能原地換成 v2 後就宣稱已完成。
3. cleanup Hosted path 尚未正式啟用，手動重新啟用與 Auth rejected cleanup 不能接真實 server。
4. legacy dispatcher 還沒有 generation／canary barrier；DB 因此刻意把 v2 command 擋在 runtime-disabled。
5. 正式 provider、兩套 RSA key、VAPID 對應、timeout／TTL 與隱私文案都還沒有完整 production 證據。

所以下一批先補 Auth proof adapter。這是 production wiring 的必要地基，但仍不 import Push v2 composition、不改 UI、
不送 Edge request，也不碰 Hosted。

## 已確認的現行路徑

### UI 與 legacy Push

- `src/pages/MePage.tsx`、`src/pages/MySessionsPage.tsx` 都只呼叫 injected `onEnablePush`。
- `src/main.js` 把這些 callback 全部接到同一個 `enablePushNotifications()`。
- `src/features/notifications/notificationFeature.ts` 會呼叫 `enableBrowserPush()`，再呼叫
  `savePushSubscription()`。
- `src/notificationPush.js` 註冊 `/push-sw.js`、取得 browser subscription。
- `src/data/repositories/privateDataRepository.ts` 最後呼叫 legacy `save_push_subscription` RPC。

因此目前按鈕顯示「已開啟」只代表 legacy subscription 已存成功，不代表 v2 consent／binding／IndexedDB 已完成。

### Auth

- `src/features/profile-auth/authRefreshCoordinator.ts` 只有 matching `TOKEN_REFRESHED` 與 authoritative refresh
  都成立後，才把 session 發布為 verified。
- coordinator 內部已有 verification revision、verified owner 與 access token，但目前沒有提供 Push 使用的讀取／
  current-check port。
- B12.2 的 `onVerificationFailure` 已存在；`src/features/profile/profileOrchestrationFeature.ts` 建立 coordinator 時沒有
  傳入它，所以 production 對 B9 仍是零 caller。
- `controller.authEpoch` 是 controller UI ownership epoch，不是 B1 verification revision；兩者不能互相代替。

### runtime config 與 server gate

- browser 現在只有 legacy `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`。
- v2 envelope public key 已有獨立 build asset：`PUSH_SUBSCRIPTION_PUBLIC_JWK_JSON` 產生
  `/push-subscription-key-v1.json`。
- v2 transport 要求完整且 canonical 的 `/functions/v1/push-subscription-v2` URL；目前 production config 沒有
  export 這個 endpoint。
- Edge `supabase/functions/push-subscription-v2/index.ts` 在 Hosted 固定回 `503`。
- DB `enable_push_device_v2`／`refresh_push_transport_v2` 另讀
  `private.notification_runtime_control.new_runtime_mode`；目前基準是 `disabled`。
- browser role 不能讀 private runtime-control table，這個 ACL 不應為了 UI 放寬。

### Service Worker

- `/public/push-sw.js` 目前只處理 `push` 與 `notificationclick`。
- browser subscription port 會沿用同一路徑註冊 worker，所以 initial enable 不需要另一支 SW。
- contract 明列 `pushsubscriptionchange` 是後續獨立批次；目前不能宣稱 subscription rotation 已自動處理。

### 登出與 Auth failure

- `handleSignOut()` 現在先執行 local-scope Supabase sign-out；沒有先做 browser unsubscribe 或 server cleanup。
- B10.2 的 capture／unsubscribe／reread、B5～B9 cleanup foundation 與 B12.3 correlation adapter 都存在，但 production
  沒有 composition／caller。
- 這表示「只登出目前裝置」已完成，D2 的 Push cleanup 部分尚未完成。

## 不可以直接做的接法

- 不可把 `controller.authEpoch` 當 Auth proof revision。
- 不可從 `getAppState().authSession` 直接讀 token 後跳過 B1 current-proof 檢查。
- 不可在 module import 或 React mount 時自動要求通知權限；明確啟用只能留在使用者 click handler。
- 不可 eager import 整套 v2 composition 進主 bundle；正式 gate 未開前應保持條件式載入。
- 不可把 server-only provider origins 放進 `VITE_*` 或 public key asset。
- 不可讓 browser 讀 private runtime-control table，也不可只靠 browser flag 取代 Edge＋DB gate。
- 不可在 cleanup Hosted 尚未可用時接上會把舊 binding 當成已清完的 manual re-enable。
- 不可沿用未核對的 legacy VAPID 值，假設它和 v2 Edge 的 `WEB_PUSH_VAPID_PUBLIC_KEY` 相同。

## 建議批次順序

### FA-03B13.1：Auth proof adapter

- 由 B1 coordinator 暴露最小能力：讀取目前 verified proof、檢查 proof revision 是否仍 current、處理 v2 401 後的
  authoritative retry、轉交 privacy-safe failure notice。
- access token 只在呼叫時由記憶體讀取，不寫 storage、不進 callback notice、不 log。
- 新 Auth event、SIGNED_OUT、fail-closed 或 proof 被取代時，舊 proof 立即失效。
- 先用 unit／race canary 驗證；不 import Push v2 composition，不改 UI 或 production bundle 行為。

### FA-03B13.2：default-off composition shell

- 以條件式 import 建立一次 app-level composition，不放進 React effect。
- 組合 subscription storage／coordinator、cleanup／B9、B1 correlation 與 manual re-enable。
- browser gate 預設關閉；即使日後打開，Edge 與 DB gate 仍各自 fail-closed。
- 本批不能啟用按鈕或送 production request。

### FA-03B13.3：UI／狀態／隱私

- 把單一 `onEnablePush` owner 從 legacy 切到 v2，並從 IndexedDB authoritative state 對應 UI。
- `auth-unverified`、cleanup pending、server unavailable 與 enabled 需要產品文案；實作前另請使用者確認。
- 正式開始保存 v2 local state／呼叫公開 cleanup endpoint 前，更新 `public/privacy.html` 的 Supabase Edge access log
  與 Free plan 1 天 raw-IP retention 說明。
- legacy 切換、canary profile 與 rollback 必須有 E2E；不能同批刪 legacy RPC 或資料。

### 之後的獨立批次

- dispatcher generation／canary barrier、send-time DNS／redirect、TTL／timeout／lease 實測。
- cleanup Hosted canary 與 production policy。
- `pushsubscriptionchange` SW flow。
- Hosted v2 canary、server gate 切換與 legacy contract；每個 Hosted write 仍需另行核可。

## 本輪沒有做的事

- 沒有修改 source、UI、Service Worker、env、secret、migration 或 runtime gate。
- 沒有執行 Hosted deploy、request、DB read/write 或 log 查詢。
- 沒有填入或推測 production Origin、provider、key、TTL、timeout、retry、backoff 或 scheduler 數值。
