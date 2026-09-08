# FA-03B13.6a Hosted subscription source gate

日期：2026-09-08

狀態：**source-only 完成；Hosted 預設仍關閉，沒有部署或外部寫入。**

程式 commit：`34062b3`

## 白話結論

`push-subscription-v2` 現在已具備正式環境可用的「雙重門鎖」，但門仍然關著：

1. 必須真的在 Supabase Hosted runtime。
2. `PUSH_SUBSCRIPTION_V2_RUNTIME_MODE` 必須精確等於 `hosted-v1`。

少任何一項、值多一個空白、把 Hosted mode 放在本機、Origin 不合法，或 entrypoint 建立失敗，都固定回
`503 + {"kind":"unavailable","version":1}`。本機測試仍只接受原本的 `local-test-v1`，兩種 mode 不會互相借用。

`hosted-v1` 只是明確的 opt-in 名稱，不包含 rollout 比例、timeout、rate limit 或其他尚無證據的數字。現在 Hosted 根本沒有
這支 Function 與對應 Secret，因此本批不會改變 production 行為。

## 實作內容

- `runtime.js`
  - 新增固定 Hosted mode `hosted-v1`。
  - runtime access 同時輸出 `hostedEnabled`、`hostedRuntime`、`localTestEnabled`。
  - Hosted marker 加 local mode、local runtime 加 Hosted mode、大小寫或空白不符，全部 disabled。
- `entrypoint.js`
  - 集中組合 runtime gate、Origin、handler 與 runtime ports。
  - disabled 或任何建構錯誤都回同一個 data-free 503；沒有 log。
  - Hosted path 會把 `localTestEnabled=false` 傳入 adapter，所以 server URL 不會取得 local HTTP 例外。
- `index.ts`
  - 只負責讀 Deno env，並把單一 entrypoint 交給 `Deno.serve()`。
  - 不再在入口複製 unavailable response 或 local-only 分支。
- `supabase/config.toml`
  - 註解改成目前事實：Hosted 預設 unavailable，只有 exact `hosted-v1` 才可能建立 handler。

## 已驗證的 fail-closed 分支

- 完全沒有 mode：503。
- Hosted runtime 使用 `local-test-v1`：503。
- 本機 runtime 使用 `hosted-v1`：503。
- Hosted mode 尾端多空白：disabled。
- Hosted mode 正確但 Origin 缺失：503。
- Hosted mode＋Origin 都正確：進入真實 handler；GET 依 handler 契約回 400，證明不是假 success。
- local mode＋Origin 正確：維持既有真實 handler。
- 其他 key ring、provider policy、VAPID、Supabase Auth／service config 錯誤，仍由既有 handler／adapter 收斂為 unavailable，
  不把任意錯誤文字送給 client。

## 驗證結果

```text
targeted Node：28／28 passed
真實 local Edge → Auth → DB → IndexedDB：1／1 passed
完整 Node：730 tests，725 passed／5 skipped／0 failed
完整 mock Chromium：386 tests，382 passed／4 skipped／0 failed
TypeScript、ESLint、Prettier、courts seed、design-system、git diff --check：通過
build：535 modules

production bundle：
- main 653,283／192,738／160,678 raw／gzip／Brotli
- total JS 857,779／263,789／222,464 raw／gzip／Brotli
- 與 B13.5d 相同，因本批只改 Edge source／tests／config comment
- 既有開發期 byte 超額仍只報告；結構 gate 通過
```

本批沒有 migration、Supabase Function deploy、Secret mutation、Function request、DB write、Vercel env／deploy 或 production
runtime control 變更。

## 尚未完成

- Hosted 尚未部署 `push-subscription-v2`，也沒有它的 runtime mode、Origin、private key ring 或 provider policy Secret。
- DB runtime mode 仍 disabled，所以即使未來 Edge gate 打開，v2 command 仍會在 DB 層 fail closed。
- active dispatcher 的 Hosted entry、browser production config、UI v2 caller、deadline／telemetry 與 rollout evidence 仍未完成。

## 下一步

先做 `FA-03B13.6b` 唯讀複核 active dispatcher entry：確認「先部署 format-1 compatible legacy entry」與「加入 Hosted v2 entry」
必須拆成幾批，並鎖定每批在 mode disabled 時的精確行為。尚未證實前不直接改 Hosted dispatcher，更不填 lease／deadline／
attempt／TTL 數字。
