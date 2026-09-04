# FA-03 push-cleanup Hosted canary 前置確認

最後更新：2026-09-04

狀態：**repo／official-doc 唯讀查證完成；尚未 deploy、設 env／secret 或送 Hosted request。等待 raw-IP log 與
retention 決策。**

## 白話結論

- Supabase 可以只部署指定的一支 Function；`supabase functions deploy push-cleanup` 不需要把其他 Functions 一起部署。
- 專案的 `supabase/config.toml` 已把 `push-cleanup` 設為 `verify_jwt=false`，所以一旦部署，它是公開 endpoint。
- 目前 handler 在 Hosted 一進來就固定回 `503 RETRY`，停在 rate limiter、body、key、crypto 與 DB 之前。
  因此第一階段可以只驗 gateway／platform logs，不會啟用 cleanup。
- 但 Supabase 官方文件明確列出 `cf-connecting-ip` 與 `x-real-ip` 會被平台自動收進 Edge／API logs。應用程式
  不輸出 IP、DB 只存 HMAC digest，都無法移除平台層這份 raw IP。
- Log retention 依方案而定；官方價格頁目前列出 Free／Pro／Team／Enterprise 分別為 1／7／28／90 天。
  CLI 不回傳專案方案，兩個可用瀏覽器也都沒有 Supabase Dashboard 登入狀態，所以本輪沒有猜目前是哪一種。
- 現行 `public/privacy.html` 只說 Vercel Web Analytics 不保留 IP；Supabase 段落只說提供登入／資料庫與新加坡
  儲存區域，沒有揭露 API／Edge access logs、raw IP 或 retention。正式開放 cleanup 前必須補文案，不能拿
  Vercel Analytics 的說明代替 Supabase logging disclosure。

## 已查證的 repo 邊界

| 項目 | 事實 |
| --- | --- |
| 個別部署 | CLI help 與官方文件都支援 `supabase functions deploy <name>` |
| Function config | `[functions.push-cleanup] verify_jwt = false` |
| Hosted hard gate | `hostedRuntime || !localTestEnabled` 時立即 `503 RETRY` |
| hard gate 之前的資料操作 | 無 limiter、body read、key load、crypto 或 DB call |
| Hosted 目前 Functions | 仍只有 `notification-outbox-dispatch` version 6 |
| Hosted limiter DB | migration 已套用；bucket table 目前 0 rows |

## 平台 logging 的限制

Supabase 的 allowed request-header log 清單包含：

```text
cf-connecting-ip
x-real-ip
```

因此「raw IP 不進本專案 DB」是成立的，但不能寫成「raw IP 不會被任何 Hosted log 保存」。canary 也不能把
token、cleanup envelope、endpoint、Push keys 或 private material 放進測試 request，避免擴大平台 log 風險。

即使 C0 只由開發者送測試 request，`verify_jwt=false` 的 endpoint 一部署就是公開網址，仍可能收到外部掃描流量；
這些來源 IP 也會進平台 logs。因此接受 C0 同時代表接受這個短期公開觀察風險，不能假設只有兩筆 log。

官方來源：

- [Supabase Logging／allowed headers](https://supabase.com/docs/guides/monitoring-and-debugging/logs)
- [Supabase Function deployment](https://supabase.com/docs/guides/functions/deploy)
- [Supabase Function configuration](https://supabase.com/docs/guides/functions/function-configuration)
- [Supabase pricing／log retention](https://supabase.com/pricing)

## 建議分成兩階段

### C0：hard-gated gateway observation

使用者接受平台 raw-IP log 與實際 retention 後，另行核可：

1. 只部署 `push-cleanup`，不設 cleanup key、rate-limit policy 或 HMAC secret。
2. 從同一個受控來源送 2 次空 body 的最小 POST；2 次只用來確認 header／status 可重現，不是壓測或限流門檻。
3. 預期兩次都固定回 `503 RETRY`，limiter table 仍為 0，其他 Push tables 不變。
4. 從 platform logs 只取去敏結果：兩個 source headers 是否都有、canonical 後是否相同、status、duration、
   gateway／function version；文件不保存 raw IP。
5. 掃描 logs 不得命中自訂 token、endpoint、Push keys、cleanup digest、envelope 或 private material；C0 request
   本身不包含這些值。

C0 無法量 limiter RPC latency，因為 hard gate 故意在 limiter 前。它只解決 gateway headers 與 platform logging
事實。

### C1：limiter-only canary

C0 通過後，才在 repo／local 設計受限的 Hosted canary mode，讓受控 request 只走 limiter RPC，不讀 cleanup
body、不解密、不 quarantine。暫時 policy、request 數量、停用方式與 env／secret 必須先形成 exact diff，再另行
核可。這些測試值只作 canary fixture，不是 production threshold。

## 目前需要使用者確認

1. 目前 Supabase 專案是 Free、Pro、Team 或 Enterprise，才能固定 raw-IP log 的實際保留天數。
2. 是否接受 Supabase 平台在該 retention 期間保存 `cf-connecting-ip`／`x-real-ip`。
3. 接受後，是否核可 C0 的「只部署 hard-gated `push-cleanup`＋2 次空 body POST＋唯讀 logs／DB 驗證」。

正式開放 cleanup 給使用者前，另需核可更新 `public/privacy.html`；這不包含在 C0。

若不接受平台 raw-IP log，就不能直接把依賴來源 IP 的公開 cleanup endpoint 部署在目前 Supabase Edge 架構；需
另開架構批次，評估會先去識別化來源的可信 proxy／gateway，並重新設計 source limiter。
