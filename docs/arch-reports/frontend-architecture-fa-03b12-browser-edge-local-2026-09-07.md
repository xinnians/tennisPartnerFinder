# FA-03B12.9 browser → Edge → Auth → DB → IndexedDB 本機整合報告

日期：2026-09-07
狀態：完成（只限本機；正式環境保持關閉）

## 白話結論

上一批已分別證明 browser 組合與 Edge handler 能運作；這一批把兩邊真的接在一起。

現在有一條自動測試會用真實 Chromium 走完：

```text
IndexedDB provisioning
  → browser WebCrypto 加密
  → 真實跨 origin HTTP／CORS
  → 本機 Supabase Edge
  → Auth /user
  → A4 enable／refresh DB RPC
  → browser 驗證 response
  → IndexedDB CAS commit
```

enable 與 refresh 都成功，而且 Edge、DB 與 browser 本機狀態一致。這仍是測試專用 local path，沒有把功能接進
正式 App，也沒有開啟 Hosted runtime。

## 實際變更

擴充 `tests/push-subscription-v2-edge-local.test.js`，讓既有 smoke 不再只由 Node 直接組 envelope，而是啟動：

- 真實 Vite dev server，透過既有 public-key plugin 提供 exact same-origin
  `/push-subscription-key-v1.json`。
- 真實 Chromium。
- 真實 browser IndexedDB 與 WebCrypto。
- 既有 `notificationPushSubscriptionLocalComposition.ts` 的 storage、browser port、transport 與 coordinator。
- 真實本機 Supabase Edge、Auth `/user`、PostgREST RPC 與 PostgreSQL。

測試中的 `Notification` 與 `PushManager` 是 deterministic injected browser port，因為本機自動化不向真實 push
provider 建立 subscription；其餘加密、HTTP、CORS、Auth、DB 與 IndexedDB 都走實際實作。

## 已驗證行為

- browser 先在 IndexedDB 建立一筆 provisioning，才開始取得 subscription 或送 network。
- public RSA key 由 Vite 的固定 same-origin path 取得，沒有把 private key 放進 browser。
- enable request 使用真實 browser WebCrypto 產生 hybrid encrypted envelope。
- 跨 origin preflight 與 POST 經本機 Supabase gateway 到 Push v2 handler。
- Edge 用實際使用者 access token 呼叫 Auth `/user`，再以 server-only provider policy 解密及驗 endpoint。
- Edge 呼叫既有 A4 `enable_push_device_v2`；只有 exact committed response 才讓 browser 把 provisioning CAS 成
  enabled。
- 同一 browser binding 再走 refresh，A4 exact no-op 回同一 consent snapshot；IndexedDB 也保持相同 binding、
  consent 與 local revision。
- 兩個 POST body 都不含 plaintext endpoint 或 raw cleanup token。
- DB 最後是同一 `deviceId`、`bindingId`、endpoint 與 enabled consent。
- 既有 negative canary 仍驗 foreign provider `409`、invalid JWT `401`、惡意 Origin suffix `503`。
- Edge／Vite output 掃描未出現 access token、raw cleanup token、cleanup token hash、endpoint、private JWKS 或 RSA
  private values。
- 測試結束會關閉 Chromium、Vite、Edge，刪除自己的 Auth／DB／IndexedDB fixture，並恢復 runtime control。

## 重複性

新的 browser-to-DB smoke 連續三次通過：兩次 targeted 執行，加上一次完整 Supabase CI。這同時證明前一輪
teardown 後可以立刻再次執行，沒有依賴殘留 fixture。

## 完整 CI 額外發現

第一次完整 Supabase CI 在既有 court subscription 測試失敗，與 Push v2 production code 無關。

查證後確認測試在 Me 頁的初始 `court_subscriptions`／`notification_prefs` 權威讀取完成前就開始點 checkbox；DB
雖然已寫入，較晚回來的初始畫面狀態會讓測試看到舊的 0 座。先前只等待 checkbox enabled，仍可能把 optimistic
狀態誤認成已完成。

修正方式只改測試：

- 進 Me 頁後先等兩個初始 GET 完成。
- 每次勾選後同時等待 DB 中的 exact court ID set 與 UI 訂閱數。
- picker 若因 rerender 收合，下一次操作前明確重新展開。

production code 未改。isolated test 連續兩次通過，完整 Supabase CI 再通過一次；獨立 commit 為 `6f7d98a`。

## 驗證結果

```text
browser → real local Edge targeted：連續 2／2 次通過
court subscription isolated：連續 2／2 次通過

npm run test:ci:frontend：
- Node 578 passed／2 skipped（580 tests）
- Playwright 348 passed／4 skipped
- build 509 modules

npm run test:ci:supabase：
- DB 1,198／1,198
- local API 4／4
- desktop 45 passed／11 skipped
- mobile 6／6
- cleanup Edge 1／1
- Push v2 browser-to-Edge 1／1

TypeScript typecheck／ESLint／Prettier／git diff --check：通過
Hosted deploy／migration／env／secret／request／DB write：未執行
```

production bundle 完全不變：main `647,304／190,390`、最大 lazy `16,476／4,829`、total
`849,928／260,555` raw／gzip。total gzip 仍依 D8 只報告，超過目前參考值 1,493 bytes。

## 精確邊界

- 正式 App 沒有 import Push v2 composition；現行 Push UI 與 legacy dispatcher 行為不變。
- 自動測試沒有使用真實外部 Push provider，也沒有取得真實 provider endpoint。
- production Origin、provider allowlist、VAPID、RSA key ring 與 Function endpoint 都沒有填值。
- Hosted Push v2 handler 仍固定回 503，也沒有部署這支 Function。
- 沒有 migration、production DB write、UI、Service Worker production wiring、dispatcher、timeout、retry、backoff
  或 scheduler 變更。

## 下一步

local enable／refresh 的 browser-to-DB 路徑已完整。下一批先做 production wiring preflight，只整理仍缺的 Auth
adapter、runtime config、UI／SW importer、B1／B9 handoff 與 server-controlled gate；不直接填 production provider
或 key 值，也不解除 Hosted gate。
