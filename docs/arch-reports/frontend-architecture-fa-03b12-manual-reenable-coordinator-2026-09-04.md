# FA-03B12.4 manual re-enable coordinator

日期：2026-09-04  
狀態：已完成；local-only composition，production 零 caller

## 白話結論

使用者手動重新啟用 Push 時，現在已有一個本機流程協調器，會嚴格依序做：

1. 確認目前仍是同一份已驗證登入證明。
2. 把舊的 `auth-unverified` binding 轉成 cleanup attempt。
3. 等舊 binding cleanup 明確完成。
4. 才建立全新的 binding 與 cleanup token。
5. 把新 provisioning 交給尚未實作的 enable port。

任何資料不符、登入證明過期、cleanup 未明確完成或下游結果不明，都只回 `pending`，不會繼續往下猜。

## 契約依據

- Push v2 contract v1.2 §5.2：手動重新啟用必須先完成舊 binding cleanup，才能建立新 provisioning。
- §5.2／§6.2：新 provisioning 必須使用新的 `bindingId` 與 cleanup token；本機原因沿用
  `subscription_changed`。
- §9.2：`predecessor` 只能來自同一筆被 cleanup 的 attempt，且只存在同一次 coordinator invocation 的記憶體。
- §13：cleanup pending／throw 必須停住；Auth proof 在 async boundary 改變時不可繼續或 commit。

## 實作內容

新增無 import 的 `notificationPushManualReenableCoordinator.ts`：

1. 所有能力都由建構參數注入：B12.1 storage、B8 cleanup、future enable port 與 verified Auth proof check。
2. 固定流程為 `proof → re-enable storage → proof → cleanup → proof → new provisioning → proof → enable → proof`。
3. cleanup attempt 必須和原 binding 的 owner、binding、revision、device、server consent 完全相符，reason 必須是
   `subscription_changed`。
4. 只有 exact `{kind: "completed"}` 才會建立 provisioning；`pending`、額外欄位、throw 或不明結果都停住。
5. 新 provisioning 必須沿用同一 logical device，但 `bindingId` 與 cleanup token 都必須和舊 attempt 不同。
6. 舊 attempt 的 server consent 只以 `predecessor` 參數傳給同一次 enable 呼叫，不寫入新 provisioning。
7. 只有 enable 回 exact `{kind: "committed"}`，且最後一次 Auth proof 仍有效，才回 `committed`；其他一律回
   detail-free `pending`。

## 驗證結果

- coordinator 單元測試涵蓋正常順序、每個 Auth proof 邊界、cleanup 未完成、identity 重用、錯誤與非 exact 結果。
- 真實 Chromium 組合測試使用實際 B5 IndexedDB storage 與 B8 cleanup coordinator，證明 cleanup 完成後才 enable、
  舊新 binding／token 不同、pending cleanup 歸零。
- 完整 frontend CI：Node 526 passed／1 skipped；Playwright 336 passed／4 skipped；build 509 modules。
- production bundle 與 B12.3 完全相同：main 647,304／190,390 raw/gzip、total 849,928／260,555；本 dormant
  coordinator 沒有進 production graph，沒有增加 byte。total gzip 仍為既有 report-only 超額 1,493 bytes。
- 完整 Supabase CI：DB 1,198／1,198、local API 4／4、desktop 45 passed／11 skipped、mobile 6／6、Edge 1／1。
- typecheck、ESLint、Prettier、bundle structural gate 與 `git diff --check` 全部通過。

## 明確沒有做的事

- 沒有 production importer、UI caller、B1 callback wiring 或 production Push 啟用。
- `enableProvisioning` 目前只是 injected port；本批沒有實作 enable／refresh browser transport、Edge HTTP/Auth/DB
  composition 或真實 provider request。
- Chromium 組合測試中的 enable port 只模擬本機 commit，不是 server enable 證據。
- 沒有 timer、retry、scheduler、migration、Hosted deploy、secret、request、DB 寫入或 Git remote push。
- 沒有跨 tab 的 network 去重；只沿用 B5 已有的原子 storage 收斂能力。

## 下一步

下一個 local-only 子批是 enable／refresh browser coordinator：把 B11 的 validator／envelope、A4 command contract 與
B5 provisioning CAS 組成具體流程。仍要保持 production graph 零 caller；cleanup Hosted、provider 真實值、timeout
與 production wiring 未核可前，不得啟用正式路徑。
