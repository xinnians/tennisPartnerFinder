# FA-03B13.1 Auth proof adapter 實作報告

日期：2026-09-07
狀態：完成（production Auth 邊界已補齊；Push v2 仍未接正式畫面）

## 白話結論

Push v2 現在可以向既有 Auth 管理器取得一份「剛由 server 驗證過、而且仍是目前版本」的登入證明。

這份證明只存在記憶體，包含帳號 ID、access token 與 Auth revision。只要有新的 Auth 事件、登出、驗證失敗或
帳號／token 改變，舊證明就立刻失效。Push v2 若收到 `401`，也只能拿完全相符的帳號與 revision 通知 Auth
重新驗證；過期或別人的通知不會觸發任何動作。

本批只補正式串接需要的 Auth 接口。`src/main.js` 還沒有接這些 callback，所以畫面仍走 legacy Push，沒有新增
Push v2 request、通知權限詢問或 Hosted 操作。

## 實際變更

### Auth authority

`src/features/profile-auth/authRefreshCoordinator.ts` 新增最小的 `AuthVerificationAuthority`：

- `readCurrentVerifiedAuthProof()`：只在目前 revision 仍有 verified proof 時回傳一份 frozen copy。
- `readVerifiedAuthProof(...)`：帳號與 revision 必須完全相符才回傳 proof。
- `isVerificationRevisionCurrent(...)`：只判斷 B1 自己的 Auth verification revision。
- `isVerifiedAuthProofCurrent(...)`：帳號、token、revision 與欄位集合都必須完全一致。
- `notifyUnauthorized(...)`：只有目前 verified owner／revision 的 `401` 才會先 fail-closed，再走原本 authoritative
  verification；stale／foreign notice 是 no-op。

access token 沒有寫入 localStorage、IndexedDB、文件、failure notice 或 log。

### Profile orchestration seam

`src/features/profile/profileOrchestrationFeature.ts` 新增兩個 optional callback：

- Auth event subscription 開始前先交出 authority，避免初始化期間遺失 revision 變化。
- 只轉交既有 privacy-safe failure notice：`kind`、`revision` 與有證據時才帶 prior owner；不外洩 Error 或 token。
- optional wiring 若拋錯會被隔離，不改變 Auth 原本的 fail-closed 行為。

目前 `src/main.js` 沒有提供這兩個 callback，因此 production Push graph 仍沒有 importer／caller。

## 競態複查

複查時實際找到並修正一個新接口會碰到的競態：同一份 `TOKEN_REFRESHED` 在 candidate 發布途中再次到達時，
既有登入結果雖然正確，但 proof 若保留前一個 revision，會被 current-check 判為過期。

現在相同 owner＋token 的重複 fresh event 會共用同一次 publication，最後收斂到最新 revision，不會重複 apply 或
重複發送 verified signal。測試固定重現並驗證 revision `3` 可讀。

## 驗證結果

```text
targeted Auth／orchestration：34 top-level／37 tests passed

npm run test:ci:frontend：
- Node 581 passed／2 skipped（583 tests）
- Playwright 348 passed／4 skipped
- build 509 modules
- TypeScript、ESLint、Prettier、git diff --check：通過

npm run test:ci:supabase：
- DB 1,198／1,198
- local API 4／4
- desktop 45 passed／11 skipped
- mobile 6／6
- cleanup Edge 1／1
- Push v2 browser-to-Edge 1／1

production bundle：
- main 648,934／190,804 raw/gzip，仍低於現行 main 門檻
- 最大 app lazy 16,476／4,830 raw/gzip，仍低於現行 lazy 門檻
- total 851,558／260,967 raw/gzip
- total 依 D8 為開發期 report-only，較參考值多 1,597／1,905 bytes，未阻擋 CI

Hosted deploy／migration／env／secret／request／DB write：未執行
```

第一次補跑 Supabase CI 前，本機 DB 已累積 184 筆同場地測試 session，超過 discovery 查詢 200 筆上限可保證
涵蓋新 fixture 的範圍，因此既有 map marker 測試讀不到自己新建的資料。確認原因後，只用 repo 的 guarded
`CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test` 重設 `http://127.0.0.1:54321`；38 份 migration 從零重播成功。
目前精確 source 隨後完整 Supabase CI 全部通過。這不是 production code drift，也沒有碰 Hosted DB。

## 精確邊界

- 正式 UI、legacy `save_push_subscription`、Service Worker 與 dispatcher 行為都沒有改。
- 沒有 import 或建立 Push v2 production composition，也沒有 browser network side effect。
- 沒有填 production provider origin、VAPID、RSA key、Function endpoint、timeout、TTL、retry 或 backoff。
- Edge Hosted hard gate 與 DB `new_runtime_mode = 'disabled'` 都沒有解除。
- cleanup Hosted、dispatcher barrier、privacy 更新與 production values 仍是正式啟用前的 blocker。

## 下一步

下一批是 `FA-03B13.2` default-off composition shell：以條件式 import 在 app 層只建立一次 wiring，接上本批 Auth
authority 與既有 dormant Push v2 modules。它仍必須預設關閉、不改 UI、不要求通知權限、不送 production request，
也不能繞過 Edge 與 DB 的 server gate。
