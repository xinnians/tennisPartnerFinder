# FA-03 dispatcher D0.1 dormant egress core 實作報告

日期：2026-09-07
狀態：完成；source-only、正式 dispatcher 未匯入

## 白話結論

已先完成 dispatcher 對外送信前最容易出安全問題的三個純核心：

1. endpoint 必須命中同一份 server-only provider allowlist。
2. DNS 查到的全部 IPv4／IPv6 都必須是 IANA 定義可從公網到達的位址，而且實際 HTTPS socket 只能使用剛剛
   通過檢查的位址。
3. Push TTL 只能由 DB deadline 減掉 request deadline 與 safety budget 算出，不內建任何猜測秒數。

新檔目前沒有被 Hosted dispatcher 的 `index.ts` 匯入，所以 production 行為完全不變。它也沒有 provider hostname、
TTL、timeout 或 retry 的 production 值。

## 實際變更

新增 `supabase/functions/notification-outbox-dispatch/v2-egress.js`。

### Provider policy

- 直接沿用 B11.1 的 `parseCanonicalProviderOriginsPolicy()` 與 `validateCanonicalEndpoint()`。
- allowlist 必須是 non-empty、sorted、unique、canonical HTTPS origin JSON。
- endpoint 結構合法但 origin 不在 allowlist，固定回 `DISPATCH_PROVIDER_POLICY_REJECTED`。
- 保存 SHA-256 policy digest，後續可讓 claim 與 send 比對 policy generation；本批不把完整 endpoint 寫進 log。

### DNS 全量檢查

- `resolveDispatcherAddresses()` 同時查 A 與 AAAA；兩個 resolver 都必須完成。
- 單一 family 只有 `ENODATA` 可以當成「沒有這種紀錄」；timeout、resolver error 或其他未知錯誤全部 fail-closed。
- A＋AAAA 合併後不得為空，且每一個結果都必須通過 public-address 檢查；public＋private 混合也整批拒絕。
- 位址會去重並固定排序，避免同一批 DNS 回覆因順序不同產生不同結果。
- IPv4／IPv6 特殊網段直接依 IANA special-purpose registry 的 `Globally Reachable` 欄位處理；IPv6
  `2001::/23` 的 IANA 公開例外逐一 allow，不把整段一概猜成 private 或 public。

來源：

- [IANA IPv4 Special-Purpose Address Registry](https://www.iana.org/assignments/iana-ipv4-special-registry/)
- [IANA IPv6 Special-Purpose Address Registry](https://www.iana.org/assignments/iana-ipv6-special-registry/)

### DNS pinning

- `createPinnedLookup()` 只接受原本 endpoint hostname；換 hostname 固定 `ENOTFOUND`。
- Node 要求 IPv4 或 IPv6 時，只能從已驗證的對應 family 回傳；沒有就 fail-closed。
- `all:true` 只回傳已驗證清單，不再查 DNS。
- `createPinnedHttpsAgent()` 使用這個 lookup、`keepAlive:false`、`maxSockets:1`，避免連線跨 delivery 共用。
- 這完成「先驗 DNS、socket 再使用同一批位址」的 source seam；Deno Edge 實際 socket canary 仍列在 D0.2，未把
  Node unit test 冒充 Hosted runtime 證據。

### TTL

公式固定為：

```text
floor(max(0, expiresAt - databaseNow - requestDeadline - safetyBudget) / 1000)
```

- 所有輸入必須是非負 safe-integer milliseconds。
- 剩餘不足或已過期時只回 `TTL=0`。
- 沒有預設 request deadline 或 safety budget；後續只能使用 DB control 與 canary 核可值。

## 工具鏈與來源邊界

- 新增 7 個 D0.1 tests，並加入既有 `test:session-unit` 聚合。
- ESLint／Prettier 只新增覆蓋 dormant `v2-egress.js`；沒有順手格式化 legacy `index.ts`。
- B11 source boundary 更新為：production graph 與 active dispatcher 仍不能引用 Push v2；唯一允許的 dispatcher
  reference 是 dormant `v2-egress.js`。
- active `index.ts`／`dispatch.js` 內容與 hash 都沒變，因此仍和本次查證的 Hosted version 14 byte-identical。

第一次完整 frontend CI 被既有「package scripts 必須 exact」canary 擋下；同步更新 exact lint／Prettier
script 斷言，並加上 dormant dispatcher 確實取得 `no-undef` error rule 的驗證後，targeted 與完整 CI 都通過。這不是
runtime 錯誤。

## 驗證結果

```text
targeted D0.1＋provider boundary＋CI config：44／44 passed

npm run test:ci:frontend：
- Node 594 passed／2 skipped（596 tests）
- Playwright 348 passed／4 skipped
- build 524 modules／32 output files
- TypeScript、ESLint、Prettier、git diff --check：通過

npm run test:ci:supabase：
- DB 1,198／1,198
- local API 4／4
- desktop 45 passed／11 skipped
- mobile 6／6
- cleanup Edge 1／1
- Push v2 browser-to-Edge 1／1

production bundle：
- main 650,134／191,175 raw/gzip
- 最大 app lazy 16,476／4,830 raw/gzip
- total 852,758／261,346 raw/gzip
- 與 B13.2 完全相同；D0.1 未進 Vite production graph

active dispatcher source：
- index.ts SHA-256 0d618f63deaf3d6042bfdc6f5468088ba5b92ce0a3084b33343496e392b246b6
- dispatch.js SHA-256 69fb037953e84e78ef87e2c4c74015e25ba2ea88478f222533d36d03c84ca717

Hosted deploy／migration／env／secret／request／DB write：未執行
```

## 尚未完成

- Deno Edge runtime 的 `node:https`／`node:dns` compatibility 與真實 pinned socket canary。
- 3xx、404／410、429／Retry-After、timeout／unknown 的固定 outcome mapping。
- worker 總 deadline、Abort 與 fixed-code redacted log boundary。
- generation／worker／delivery／finalizer DB commands 與雙連線 `dblink` 測試。
- active dispatcher import、local Edge integration、Hosted deploy 或 production config。

下一個不需 migration 的 D0.2 可先完成前三項。DB commands 屬 D1 additive migration，開始前仍需使用者明確核可。
