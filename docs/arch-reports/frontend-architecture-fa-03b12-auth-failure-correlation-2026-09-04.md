# FA-03B12.2 Auth failure correlation seam

日期：2026-09-04  
狀態：已完成；callback 尚未接 Push production caller

## 白話結論

Auth 驗證失敗時，現在可以安全通知下一層「失敗種類、這次驗證的 revision、之前確實驗證成功的帳號 ID」。通知不含
token、session、錯誤訊息或 Auth response。

這只是出口，不會自行清理 Push。若驗證結果在處理途中已被較新的登入事件取代，舊結果不會送出通知。

## 契約依據

- Push v2 contract v1.2 §11 要求 B1 failure callback 帶 `kind`、verification revision 與 optional
  `priorVerifiedAuthUserId`，而且不能帶 token。
- warm session 只有之前由 B1 真正發布過 verified proof，才有可信 prior owner。
- cold boot 沒有可信 prior owner 時不可猜值。
- superseded result 不得觸發 B9。

## 實作內容

`authRefreshCoordinator.ts` 新增 optional `onVerificationFailure(...)`：

- exact notice 只可能是 `{ kind, revision }` 或 `{ kind, priorVerifiedAuthUserId, revision }`。
- `kind` 保留 B1 原分類：`rejected`、`unavailable`、`superseded`。
- prior owner 只來自同一 coordinator 曾成功發布的 verified proof；`SIGNED_OUT` 與 confirmed anonymous 會清除它。
- notice 在交給 callback 前 freeze；callback throw 不會改變 Auth 的 fail-closed 行為。
- `applyCandidate(null)` 等待期間若 revision 已增加，原失敗被視為 superseded，不發布 callback。
- callback 預設為 no-op；目前 production composition 沒有提供 callback，因此沒有 B9 caller 或 Push side effect。

## 實測結果

- targeted Auth coordinator：32／32 passed。
- warm session 的 unavailable／rejected notice 都只含 kind、revision 與先前 verified owner。
- cold boot unavailable 只有 kind＋revision，沒有憑 local cache 猜 owner。
- error message 與 access token 不在 notice JSON。
- fail-close 等待期間插入較新 `SIGNED_IN`：舊 notice 為 0。
- 完整 frontend CI：Node 511 passed／1 skipped；Playwright 334 passed／4 skipped；build 509 modules。
- 本批因 B1 coordinator 本來就在 production graph，main 增加 222 raw／112 gzip，total gzip 從 260,430 增至
  260,555；main、最大 lazy、total raw 與 structural gate 仍通過。D8 development 模式只報告 total gzip 比舊門檻
  259,062 多 1,493 bytes，沒有改門檻。
- 完整 Supabase CI：DB 1,198／1,198、local API 4／4、desktop 45 passed／11 skipped、mobile 6／6、Edge 1／1。

## 明確沒有做的事

- 沒有把 callback 接到 B9、B5、B8、UI、Service Worker 或 production Push。
- 沒有把 cold-boot local binding owner 當成 Auth proof。
- 沒有加入 timer、retry 次數、backoff 或 scheduler。
- 沒有 migration、Hosted deploy、secret、request、DB 寫入或 Git remote push。

## 下一步

下一個 local-only 子批可以建立獨立的 correlation adapter：只在 notice revision 仍為 current 時處理；warm path 必須
比對 prior owner 與 B5 binding owner，cold path依 §11 分流，且 `superseded` 一律不交 B9。完成前仍不接
production composition。
