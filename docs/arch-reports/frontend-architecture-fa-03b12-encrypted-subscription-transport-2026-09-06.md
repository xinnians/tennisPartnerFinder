# FA-03B12.7.3 browser encrypted subscription transport

日期：2026-09-06  
狀態：已完成並通過完整 CI；dormant，未接 production／Hosted

## 白話結論

browser 現在已有一個獨立的 enable／refresh 傳輸元件，但正式網站還不會呼叫它。

它會先從同網域讀取固定 499-byte Push v2 公鑰，把 endpoint、subscription keys 與 enable cleanup token digest 放進
加密 envelope，再以使用者 bearer JWT 對固定 `push-subscription-v2` endpoint 送出一次 POST。provider allowlist 不在
browser，仍由 Edge 解密後驗證。

## 已完成

- endpoint 只接受 exact `/functions/v1/push-subscription-v2`；production 必須 HTTPS，本機測試只開 loopback HTTP。
- public key 只從 `/push-subscription-key-v1.json` 讀取，要求 exact URL、200、JSON、`no-store`、無 redirect、
  499 UTF-8 bytes 與 canonical encrypt-only JWK。
- enable 在 browser 將 canonical 32-byte cleanup token 做 SHA-256，只把 64 lowercase hex digest 放進加密 payload；
  raw token 不離開本機。
- enable／refresh 都使用 B11 hybrid encryption 與綁定 `authUserId` 的 AAD；request body 只有 outer envelope。
- 每次呼叫最多一個 POST，沒有自動 retry、timeout、backoff 或 scheduler。
- response 要求 exact URL、無 redirect、JSON、`no-store`、bounded UTF-8 與 status/body 配對；任何 drift 都回
  `unavailable`。
- exact 401 只回 `unauthorized` 給 coordinator／Auth；transport 不自行判定登入失效，也不讀未定義的 gateway body。
- governance test 證明 production graph 零 importer，且 transport 不持有 provider origins、不存資料、不記錄秘密。

## 驗證

```text
transport Node targeted：9／9 passed
desktop Chromium＋mobile WebKit real WebCrypto transport：2／2 passed
npm run test:ci:frontend：Node 558 passed／1 skipped；Playwright 346 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
typecheck／ESLint／Prettier／bundle structural gate／git diff --check：通過
Hosted deploy／migration／env／request／DB write：未執行
```

production bundle 數字完全不變：main 647,304／190,390 raw/gzip，最大 lazy 16,476／4,829，total
849,928／260,555。total gzip 仍是既有 D8 開發期 report-only 超額 1,493 bytes。

## 尚未完成

- transport 尚未與 browser subscription port、B12.7.1 coordinator、B1 Auth 或 B5 storage 組成 concrete local port。
- Edge HTTP handler、CORS、authoritative JWT verification 與 DB command mapping 尚未實作。
- production provider origins、keys、env、UI、SW、dispatcher 與 Hosted 仍未啟用。

下一批只做 local-only composition 與真實 browser 組合測試，不接 production。
