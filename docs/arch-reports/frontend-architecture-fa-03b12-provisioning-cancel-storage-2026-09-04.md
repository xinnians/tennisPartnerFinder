# FA-03B12.5 provisioning cancel storage action

日期：2026-09-04  
狀態：已完成；local-only storage prerequisite，production 零 caller

## 白話結論

enable 流程現在可以在「確定還沒送出 network request」時，安全取消剛建立的本機 provisioning。

這是給 permission 在送網路前被拒絕等情況使用。只要 request 可能已送出，就不能呼叫這個動作，必須保留原
binding 與 cleanup token，讓之後用同一 request 收斂。

## 契約依據

- Push v2 contract v1.2 §6.2：`cancelExplicitPushProvisioning(...)` 只允許在 browser 能證明 enable network 尚未開始
  時使用。
- 同節要求以 exact owner／binding／local revision 刪除 provisioning，且不得建立 cleanup attempt。
- request 可能已送出後的 unknown／abort／crash 必須保留 provisioning；本 storage action 不自行判斷 network
  狀態，責任留給未來 browser coordinator。

## 實作內容

- B5 storage 新增 `cancelExplicitPushProvisioning(...)`。
- input 只接受 exact `authUserId`、`bindingId`、`expectedLocalRevision` 三欄與 canonical UUID。
- 單一 IndexedDB readwrite transaction 先做 exact CAS，再確認 state 是 `provisioning`，最後只刪 current binding。
- 不刪 logical device，不新增 pending cleanup，不改 IndexedDB schema 或版本。
- 找不到 binding、revision 不符、已是 enabled 或重放已完成的取消時，一律回既有 `PUSH_STORAGE_STALE`。
- transaction abort 時 provisioning 完整保留。

## 驗證結果

- 真實 Chromium storage targeted：13／13 passed；涵蓋 exact cancel、stale revision、abort rollback、enabled 保護、
  invalid input、replay 與 pending cleanup 為零。
- 完整 frontend CI：Node 526 passed／1 skipped；Playwright 340 passed／4 skipped；build 509 modules。
- production bundle 不變：main 647,304／190,390 raw/gzip、total 849,928／260,555；total gzip 仍是既有
  report-only 超額 1,493 bytes。
- 完整 Supabase CI 在乾淨 local reset 後通過：DB 1,198／1,198、local API 4／4、desktop 45 passed／11 skipped、
  mobile 6／6、Edge 1／1。
- typecheck、ESLint、Prettier、bundle structural gate 與 `git diff --check` 全部通過。

## 測試環境說明

第一次 Supabase CI 的 DB 1,198 項通過，但 local API fixture 找不到新建球局。唯讀查證當時 7 日查詢窗已有 223 場
未來球局，超過 discovery 100 筆上限，新 fixture 被排序截掉。使用專案既有防呆 script 確認 target 為
`http://127.0.0.1:54321` 後重建本機測試 DB，再跑完整 Supabase CI 即全過。

這次 reset 只刪除不可復原的本機測試資料並重播 38 份 migration；沒有碰 Hosted／production。

## 明確沒有做的事

- 沒有讓 storage 自行猜 network 是否開始；只有 future browser coordinator 可以在已證明 pre-network 時呼叫。
- 沒有 production importer、UI caller、service worker、enable／refresh transport 或 Edge composition。
- 沒有 migration、Hosted deploy、secret、Hosted request、Hosted DB 寫入或 Git remote push。

## 下一步

建立 enable／refresh browser coordinator 的 local-only 結構，明確區分 pre-network 可取消與 network 可能已送出後
必須保留 provisioning 的兩條路徑；production 仍維持零 caller。
