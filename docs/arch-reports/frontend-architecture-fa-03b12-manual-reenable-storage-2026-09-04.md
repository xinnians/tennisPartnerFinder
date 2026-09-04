# FA-03B12.1 手動重新啟用的本機儲存起點

日期：2026-09-04  
狀態：已完成；只在 dormant 本機模組，尚未接 production

## 白話結論

使用者的 Push 因 Auth 暫時無法確認而關閉後，現在已有一個安全的本機起點可以處理「使用者再次按下啟用」。

這一步只做一件事：把舊綁定和原 cleanup token 原子轉成一筆 `subscription_changed` cleanup。它不會直接建立新
Push、不會連網，也不會因 Auth 後來恢復就自動執行。

## 已核對的契約依據

- `frontend-architecture-fa-03b10-push-v2-contract-2026-09-02.md` §1：Auth 恢復不能自動恢復 Push，必須由使用者再次
  明確啟用。
- 同文件 §5.2：舊 `auth-unverified` binding 必須先 cleanup；只有 B8 回 `cleanup-completed` 後才能建立新的
  provisioning，而且新 binding 與 cleanup token 都不得重用。
- 同文件 §6.2：`beginExplicitPushReenable(...)` 只接受 `auth-unverified`，以 owner、binding、local revision 做
  CAS，並原子產生 `subscription_changed` cleanup attempt。
- 同文件 §14：push-cleanup Hosted 尚未正式啟用前，B12 只能做 local composition。

## 實作內容

`src/notificationPushStorage.ts` 新增 `beginExplicitPushReenable(...)`：

1. 輸入只接受 exact `authUserId`、`bindingId`、`expectedLocalRevision`。
2. 只允許狀態為 `auth-unverified`、reason 為既有 `auth_unavailable` 的 exact binding。
3. 在同一個 IndexedDB transaction 內刪除舊 current binding，並加入 reason 固定為
   `subscription_changed` 的 pending cleanup。
4. cleanup attempt 保留原 binding、device、server consent 與 raw cleanup token；raw token 仍只存在 IndexedDB，
   不出現在 runtime state 或方法結果以外的 app 狀態。
5. 兩個分頁以同一份 exact CAS 同時操作時，第二個 transaction 會取得第一個已建立的相同 attempt，不會新增第二筆
   cleanup 或 token。
6. owner、binding、revision、狀態或 reason 不符時一律回既有 `PUSH_STORAGE_STALE`，不修補、不覆寫。
7. transaction 中斷時，刪除 current binding 與新增 attempt 會一起 rollback，原 `auth-unverified` binding 完整保留。

## 實測結果

- targeted `push-storage.spec.js`：10／10 passed。
- 兩分頁同時 re-enable：兩邊得到相同 attempt id；IndexedDB 只留一筆 pending cleanup。
- cleanup 前：runtime 為 `cleanup-pending`，不能建立新的 provisioning。
- cleanup 完成後：既有 B5 API 建立全新的 binding id 與 cleanup token；兩者都和舊值不同。
- 模擬 pending store 寫入中斷：回 `PUSH_STORAGE_UNAVAILABLE`，pending 為 0，原 binding id 與 local revision 不變。
- 完整 frontend CI：Node 509 passed／1 skipped；Playwright 334 passed／4 skipped；production build 509 modules。
- bundle：production bytes 完全不變；total gzip 仍是既有 report-only 超額 1,368 bytes，structural gate 通過。
- 完整 Supabase CI：DB 1,198／1,198、local API 4／4、desktop 45 passed／11 skipped、mobile 6／6、local Edge
  1／1，全部通過。

## 明確沒有做的事

- 沒有 production importer、UI caller、Auth callback wiring 或自動恢復。
- 沒有呼叫 B8 cleanup transport、enable／refresh Edge、provider 或 Hosted。
- 沒有新增 migration、IndexedDB store／index／version、timeout、retry、backoff 或 scheduler。
- 沒有設定 provider allowlist、TTL、timeout、UI 文案或任何 production secret。
- 沒有 deploy、遠端 request、遠端 DB 寫入或 push Git remote。

## 下一個安全批次

下一步仍只做 local composition：用注入式 coordinator 串起「使用者明確操作 → 本方法 → B8 exact cleanup → cleanup
完成後才建立新 provisioning」，並把 B1 verified proof revision 的前後比較做成可單測 port。正式 production wiring
仍要等 push-cleanup Hosted 前置條件完成；任何 timeout、排程、UI 文案或 Hosted 動作都不包含在此批。
