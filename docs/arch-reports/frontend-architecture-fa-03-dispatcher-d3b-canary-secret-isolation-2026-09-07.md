# FA-03 dispatcher D3B canary Secret 隔離

日期：2026-09-07
狀態：repo／local 完成；尚未設定 Hosted credential／Secret 或部署 Function

## 白話結論

獨立 canary 原本會讀到正式 dispatcher 也使用的 DB、generation、provider policy 與 transport Secret 名稱。這不會立刻
改變目前 Hosted legacy sender，但會讓後續部署正式 dispatcher 時，意外繼承 canary 設定。

本批已把這四個值改成 canary 專用名稱。獨立 canary 現在只共享原本就由兩條 sender 共用的三個 VAPID Secret，其他
未列入白名單的環境值一律讀不到。

此外，canary request 現在一定要明確指定動作：`database-probe` 只驗證專用 role 能否連線，成功只回
`{"kind":"ready","version":1}`，不建立 worker、不讀取工作、不寫 DB，也不送推播；只有明確指定 `dispatch` 才能進入
派送流程。缺少或拼錯動作一律回 400。

## Exact Hosted Secret 契約

canary 後續只使用以下六個專用名稱：

1. `NOTIFICATION_DISPATCH_V2_CANARY_DATABASE_URL`
2. `NOTIFICATION_DISPATCH_V2_CANARY_EXPECTED_GENERATION`
3. `NOTIFICATION_DISPATCH_V2_CANARY_MODE`
4. `NOTIFICATION_DISPATCH_V2_CANARY_SECRET`
5. `NOTIFICATION_DISPATCH_V2_CANARY_PROVIDER_ORIGINS_V1`
6. `NOTIFICATION_DISPATCH_V2_CANARY_TRANSPORT`

sender adapter 只把第五、六項映射到既有 sender core 所需的抽象名稱；三個
`WEB_PUSH_VAPID_*` Secret 可直接共用。通用 `NOTIFICATION_DISPATCH_DATABASE_URL`、
`NOTIFICATION_DISPATCH_V2_EXPECTED_GENERATION`、`PUSH_PROVIDER_ORIGINS_V1` 與 `WEB_PUSH_TRANSPORT` 即使存在，也不會被
獨立 canary 讀取。

## 驗證結果

- canary unit：5／5；包含通用值無法覆蓋 canary 專用值、未列入白名單的 `PUSH_TEST_URL` 回空值，以及動作名稱只接受
  exact `database-probe`／`dispatch`。
- local dispatcher Deno DNS／TLS canary：1／1。
- local outbox dispatcher：mock transaction-lock 1／1；Deno-native encrypted sender 1／1。整合測試先執行
  `database-probe` 並確認 worker 仍為 0，再用 explicit `dispatch` 完成既有兩條派送情境。
- 完整 frontend CI：通過；Playwright 348 passed／4 skipped；build 與 bundle structural gate 通過。
- 完整 Supabase CI：DB 1,290／1,290、local API 4／4、desktop 45 passed／11 skipped、mobile 6／6，四組
  Edge 為 1／1、1／1、1／1、2／2。
- lint、Prettier、typecheck 與 `git diff --check`：通過。
- production frontend bundle 沒有改變：total 852,758 raw／261,346 gzip；開發期仍只報告；main
  650,134／191,175 仍在目前參考值內。

## 本批沒有做的事

沒有 migration、Hosted DB write、credential、Secret mutation、Function deploy、request、runtime control、cron、generation、
legacy cutoff 或使用者資料變更。下一批必須先用專用 role 實際驗證平台 DB connection，再設定上述六個 Secret 並只部署
`notification-outbox-dispatch-v2-canary`；部署後只送 `database-probe`，不送 `dispatch`、不切換正式流量。
