# FA-03B12.6 refresh commit storage action

日期：2026-09-04  
狀態：已完成；local-only storage prerequisite，production 零 caller

## 白話結論

refresh 在 server 成功後，現在可以安全把新的 consent version 寫回本機 enabled binding。

本機只接受兩種結果：server 明確 no-op，版本完全不變；或 transport 真的改變，版本恰好加一。consent ID、epoch、
owner、device、binding 或 local revision 只要有任何漂移，都不會覆蓋本機資料。

## 契約依據

- Push v2 contract v1.2 §6.1：consent version 是統一 binding version，transport 語意改變必須遞增。
- §10.3：refresh 必須同時符合 auth user、device、binding、consent ID、epoch、version 與 enabled state。
- §10.3／§13：exact no-op 不增加 version；transport 語意改變時 consent version 恰好增加一次；response 在 local
  commit 前必須再次經 binding revision gate。

## 實作內容

- B5 storage 新增 `commitPushRefresh(...)`。
- input 只接受 exact owner／binding／device／local revision、完整 expected consent 與 server 回傳 consent。
- server 回傳必須保持同 consent ID／epoch，version 只能等於 expected version 或 `expected + 1`。
- 單一 IndexedDB readwrite transaction 先驗 exact enabled binding 與舊 consent CAS。
- exact no-op 直接回現有 safe binding，不改 local revision、不寫 IndexedDB。
- version `+1` 才更新 server consent 並產生新 local revision。
- local commit 後重放同一成功 response 會收斂到已存結果，不會再次增加 local revision。
- stale、語意漂移、非法 bigint／UUID 或 transaction abort 都保留舊 enabled binding。

## 驗證結果

- 真實 Chromium storage targeted：15／15 passed；涵蓋 no-op、version +1、exact replay、stale consent／revision、
  非法 epoch 與 abort rollback。
- 完整 frontend CI：Node 526 passed／1 skipped；Playwright 344 passed／4 skipped；build 509 modules。
- production bundle 不變：main 647,304／190,390 raw/gzip、total 849,928／260,555；total gzip 仍是既有
  report-only 超額 1,493 bytes。
- 完整 Supabase CI：DB 1,198／1,198、local API 4／4、desktop 45 passed／11 skipped、mobile 6／6、Edge 1／1。
- typecheck、ESLint、Prettier、bundle structural gate 與 `git diff --check` 全部通過。

## 明確沒有做的事

- 沒有取得或變更 PushSubscription，也沒有送出 refresh network request。
- 沒有 production importer、UI caller、service worker、browser transport、Edge HTTP/Auth/DB composition 或 provider
  request。
- 沒有 migration、Hosted deploy、secret、Hosted request、Hosted DB 寫入或 Git remote push。

## 下一步

建立 enable／refresh browser coordinator 的 local-only 結構，使用 B12.5 的 pre-network cancel 與本批 refresh commit
完成網路前後的 fail-closed storage handoff；production 仍維持零 caller。
