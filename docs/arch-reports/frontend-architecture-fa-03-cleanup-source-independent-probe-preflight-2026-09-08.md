# FA-03 push-cleanup independent public source probe preflight

日期：2026-09-08

狀態：**精確範圍已固定；Hosted 尚未執行。**

## 為什麼還要一次

第一個 canonical sentinel 沒有進入 Function，但只有一個樣本。要避免猜測，第二次改用 `8.8.8.8`；
[Google 官方文件](https://developers.google.com/speed/public-dns)確認這是 Google Public DNS，不屬於上一輪 sentinel
的服務商。它只放在 request header 作比較，不會向該位址建立連線。

## 固定範圍

沿用已 commit、35 tests 通過的 data-free probe，不再改程式：

1. 唯讀確認目前兩支 Function version 29／13、bundle hash、17 Secrets／0 cleanup 與 DB aggregate 基線。
2. 先設定 random canonical 32-byte canary token。
3. temporary deploy `push-cleanup`；mode 尚未設定，所以 Hosted 仍 hard-disabled。
4. 最後設定 exact `hosted-limiter-canary-v1` mode。
5. 只送 1 個已授權空 body POST；兩個比較 header 都帶 `8.8.8.8`。
6. 不設定 HMAC、policy 或 cleanup key；不允許 limiter、body、key、quarantine 或其他 DB write。
7. client 只輸出 status、content type、固定 body 分類、outcome／stage、耗時與 safe provider classification；不輸出 raw
   HTML、hostname、token 或任何實際 client IP。
8. 唯讀確認 DB 與 current unified logs count後，固定依 mode → Function → token 順序復原。
9. 最後獨立重查 Function／Secret／DB 基線；兩支既有 Function 只允許 version metadata 增加，hash 不得改變。

## 判讀規則

- 403／HTML、無自訂 header、Function exact-path log 0：本次不同服務商的 canonical client value 也停在 Function 前。
- `SOURCE_CF_NOT_CLIENT_VALUE`：request 進入 Function，但平台已改寫 reserved header。
- `SOURCE_CF_CLIENT_VALUE`：client value 穿透；source trust 不得放寬。
- 其他結果或任何 DB 變動：立即停損、完整復原，不猜原因。

使用者已要求依進度文件持續往下做，並在得知 temporary Hosted probe 與回滾方式後回覆繼續。本批仍不包含 production
policy、正式 cleanup、真實 Push、資料清除、runtime generation 或 legacy cutoff。
