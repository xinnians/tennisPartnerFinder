# FA-03B13.3 Push UI／隱私前置確認

日期：2026-09-07
狀態：四項方案已於 2026-09-08 核可並完成本機實作；證據見
`frontend-architecture-fa-03b13-ui-privacy-mapping-2026-09-08.md`

## 白話結論

前一版把 Push v2 簡化成四種狀態，這不夠精確。實際程式有 **8 種本機狀態**，另外還有目前正式 App
正在使用的 legacy Push 狀態。兩套狀態不能直接混成一個「有開／沒開」，否則可能把尚未確認、等待清理或本機
資料損壞誤顯示成「已開啟」。

因此這批先不改畫面。安全作法是：先確認 8 種技術狀態如何翻成使用者看得懂的幾種畫面，再讓三個既有入口
共用同一份顯示規則。Push v2 仍固定關閉，legacy 功能也先保留。

## 已查證的正式畫面

目前「開啟推播」只有一條 legacy 動作，但會出現在三個地方：

1. 「我的」頁面設定按鈕：`src/pages/MePage.tsx`
2. 建立球局成功後的提示：`src/pages/MySessionsPage.tsx`
3. 加入球局成功後的提示：`src/sheets/SessionDetailSheet.tsx`

三個入口最後都呼叫 `src/main.js` 的同一個 `enablePushNotifications()`，再進入
`src/features/notifications/notificationFeature.ts`。現在的 legacy 狀態只有：

- `idle`：尚未完成開啟。
- `denied`：瀏覽器通知權限被拒絕。
- `unsupported`：環境或瀏覽器不能使用。
- `enabled`：legacy 訂閱已存入既有 RPC。

這個狀態只存在目前頁面記憶體，不是 Push v2 IndexedDB 的權威狀態。現有文案集中在
`src/sessionPresentation.ts`，所以後續也應在這裡建立單一顯示規則，不讓三個入口各自判斷。

## Push v2 實際 8 種狀態

以下名稱與意義直接來自 `src/notificationPushStorage.ts`；「建議畫面」只是待核可方案，不代表已實作。

| 技術狀態           | 程式目前能證明的事實                                       | 建議畫面／動作                                                      |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| `disabled`         | 沒有目前 binding；可能尚未有 logical device，也可能已有    | 顯示「尚未開啟」，提供使用者主動開啟                                |
| `enabled`          | 本機已成功提交 exact binding                               | 只有 server gate 與 dispatcher 也正式通過後，才顯示「此裝置已開啟」 |
| `auth-unverified`  | Auth 無法確認，已依契約關閉目前使用資格                    | 顯示「已暫停」，只能由使用者按「重新開啟」                          |
| `cleanup-required` | 舊 binding 已關閉，需建立 cleanup attempt                  | 顯示「正在停止舊推播」，先阻擋再次開啟                              |
| `cleanup-pending`  | 正好有一筆不可變的 cleanup attempt 等待處理                | 與上一項同組顯示；是否提供手動重試仍需決定                          |
| `provisioning`     | 開啟流程曾開始，但本機尚未確認完成                         | 顯示「尚未完成開啟」，只在使用者再次操作時重試，不自行背景重試      |
| `invalid`          | 本機資料格式不合法、損壞或來自不支援的未來版本；系統已關閉 | 顯示「此裝置的推播資料異常」；先提供聯絡／支援，不自動刪資料        |
| `unavailable`      | IndexedDB 或必要的本機能力目前不可讀                       | 顯示「此裝置目前無法讀取推播設定」；不能說成伺服器故障              |

另有一個容易混淆的名稱：HTTP transport 或 Edge 回傳的 `unavailable` 是**這一次操作失敗**，不是新的持久化
本機狀態。比如本機仍可能停在 `provisioning`。畫面可以顯示暫時錯誤，但不能自行把本機權威狀態改寫成「伺服器
無法使用」。

## 不能直接沿用「四種狀態」的原因

- `cleanup-required` 與 `cleanup-pending` 可以在畫面上合併成「正在停止舊推播」，但底層處理階段仍不同。
- `provisioning` 是尚未確認完成，不等於 cleanup pending，也不能自動重試。
- `invalid` 與 `unavailable` 的原因、恢復方法都不同：前者是資料不可信，後者是目前讀不到儲存空間。
- v2 的 `disabled` 不代表 legacy Push 也關閉；在切換完成前，畫面必須清楚知道自己顯示的是哪一套狀態。
- v2 本機 `enabled` 只證明本機提交成功。dispatcher／server gate 尚未啟用前，不能向使用者保證通知真的會送達。

## 建議的實作邊界

核可後，B13.3 可以先做以下可逆變更，同時保持 Push v2 disabled 與 legacy 功能不變：

1. 在 `sessionPresentation.ts` 建立一個 typed presentation mapping，集中把技術狀態翻成文案與可用動作。
2. `PageNotificationSettings` 只帶已整理過的顯示狀態，不把 cleanup token、binding 或 consent 原始資料交給 UI。
3. 三個既有入口共用同一 mapping；不要各寫一份條件與文案。
4. React render 直接由目前狀態算出畫面，不用 effect 再複製一份 state。
5. 通知權限、Service Worker、IndexedDB 寫入與 network 仍只能由明確按鈕事件啟動。
6. legacy 與 v2 在正式切換前保持分開；不得因加入顯示結構就改走 v2 request。

這符合目前 App-level shell 只建立一次、重型 runtime 按需載入的架構，也不會讓三個畫面出現彼此不同的判斷。

## 隱私頁已查證的缺口

`public/privacy.html` 現在只寫：

- Supabase 提供登入與資料庫，資料存於新加坡區域。
- localStorage 保存登入狀態。
- sessionStorage 暫存登入前的動作。

它尚未寫到下列已存在或 Push v2 啟用後會發生的事：

1. 已完成的 cleanup C0 實測證明：本專案的 Supabase Edge request 平台紀錄會保存 raw
   `cf-connecting-ip` 與 `x-real-ip`；使用者已確認 Free 方案並接受 1 天 retention。應用層把來源 IP 做 HMAC，
   只能避免 raw IP 進入本專案資料表，不能消除 Supabase 平台紀錄。
2. Push v2 第一次正式寫入時會使用 IndexedDB 保存 logical device、binding、cleanup token 與 consent snapshot。
   這些是本機 Push 狀態，不應繼續用「只使用 localStorage／sessionStorage」概括。

這份盤點只採用本專案 C0 實測與已完成的 storage 程式碼；沒有把一次 Edge canary 擴大推論成所有 Supabase
服務都保存完全相同的欄位。實際隱私文案仍需要產品確認後才修改。

## 建議開發順序

1. 核可下方四項產品決策。
2. 先加入 dormant UI presentation mapping 與測試；legacy 仍是正式動作，v2 仍 disabled。
3. 同批或獨立小批更新隱私頁，最晚必須在第一次 production v2 IndexedDB 寫入／Edge request 前完成。
4. 完成 cleanup Hosted 與 dispatcher generation／canary barrier。
5. 另行準備 production config、server gates 與 canary；通過後才討論 legacy 切換。

## 需要使用者確認

1. 是否採用上表的顯示分組與動作：`cleanup-required`／`cleanup-pending` 同組，其餘分開？
2. 是否先做 dormant UI mapping＋隱私更新，同時保留 legacy 正式功能與 v2 disabled？
3. `invalid` 是否先只顯示異常與聯絡支援，不提供會刪除本機 Push 資料的「重設」按鈕？
4. 是否同意隱私頁只寫已查證範圍：Supabase Edge 平台可能短期保存來源 IP；Push v2 會把裝置／訂閱管理資料
   存在瀏覽器 IndexedDB；不加入未查證的廣泛法律或平台敘述？

在以上項目核可前，不修改 UI 與隱私文案，也不自行猜 production 文案。

## 2026-09-08 決策結果

使用者回覆「四項都同意」。實作依上列四項完成：兩個 cleanup state 同畫面分組、其他 state 分開；先做 dormant
mapping 與隱私更新；`invalid` 只有支援動作；隱私頁只加入已查證的 Edge source-IP 與 IndexedDB 範圍。legacy
正式功能與 Push v2 disabled 均保持不變。

## 前置盤點當批邊界

- 沒有修改 runtime、React UI、隱私頁、測試、migration、Service Worker 或設定。
- 沒有 Hosted deploy、env／secret、request 或 DB write。
- Push v2 production shell 仍 hard-coded `disabled`；legacy UI／RPC 行為不變。
