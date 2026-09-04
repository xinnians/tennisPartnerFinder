# FA-03B12.3 Auth failure correlation adapter

日期：2026-09-04  
狀態：已完成；dormant local composition，production 零 caller

## 白話結論

B1 的 Auth failure notice 現在有一個獨立轉接器，會先確認 notice 沒過期，再讀 B5 的本機 Push 狀態，最後才決定
是否交給 B9。

有可信舊帳號時，舊帳號必須和 B5 binding owner 完全一樣；cold boot 沒有可信帳號時，不會自行猜一個 Auth owner。
`superseded` 或過期 revision 都不會進 B9。

## 契約依據

- Push v2 contract v1.2 §11：warm session 要比對 prior verified owner；cold unavailable 只能 local close，cold
  rejected 只能走 cleanup-token capability；superseded 不得觸發 B9。
- B9 現有行為：`unavailable` 只做 B5 local close；`rejected` 把 B5 exact pending attempt 交 B8 token cleanup，沒有
  authenticated owner RPC。

## 實作內容

新增無 import 的 `notificationPushAuthCorrelation.ts`：

1. 建構時只收三個 injected ports：revision current check、B5 runtime read、B9 `processAuthFailure`。
2. notice 只接受 exact keys、非負 safe-integer revision、固定 kind；optional prior owner 必須是 canonical UUID。
3. 在讀 B5 前與讀完後各檢查一次 revision，避免 storage await 期間出現新 Auth event 後仍進 B9。
4. warm notice 的 prior owner 與 binding owner 不同時回 `ignored`，B9 call 為 0。
5. cold notice 只把 binding owner 當成本機 CAS identity 傳給 B9，不宣稱它是 Auth proof；因此 downstream 仍只能是
   unavailable local close 或 rejected token cleanup。
6. `superseded`、disabled、cleanup-pending、invalid、malformed input 都不進 B9。
7. port throw 或非 exact B9 result 固定回 `pending`，不帶下游細節。

## 驗證結果

- adapter＋governance targeted：22／22 passed。
- 完整 frontend CI：Node 518 passed／1 skipped；Playwright 334 passed／4 skipped；build 509 modules。
- production bundle 與 B12.2 完全相同：main 647,304／190,390 raw/gzip、total 849,928／260,555；本 dormant
  adapter 沒有進 production graph，沒有增加 byte。total gzip 仍為既有 report-only 超額 1,493 bytes。
- 完整 Supabase CI：DB 1,198／1,198、local API 4／4、desktop 45 passed／11 skipped、mobile 6／6、Edge 1／1。

## 明確沒有做的事

- 沒有 production importer、B1 callback wiring、B5／B8／B9 concrete composition 或 UI caller。
- 沒有 Auth API、Supabase client、network、IndexedDB、log、timer、retry loop 或 scheduler direct dependency。
- 沒有 authenticated owner RPC；cold boot 不把 local owner 當 Auth proof。
- 沒有 migration、Hosted deploy、secret、request、DB 寫入或 Git remote push。

## 下一步

下一個 local-only 子批是 explicit manual re-enable coordinator：exact `auth-unverified` snapshot 先經 B12.1 形成 cleanup
attempt，只把該 attempt 交 B8 一次；只有 exact `cleanup-completed` 才用同一 logical device 建立新 provisioning。
predecessor 只保留在同一次 invocation 的記憶體，不能另存或跨使用者動作沿用。
