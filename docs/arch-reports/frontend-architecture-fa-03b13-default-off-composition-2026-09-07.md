# FA-03B13.2 default-off composition shell 實作報告

日期：2026-09-07
狀態：完成（正式入口已接殼，但功能固定關閉）

## 白話結論

正式 App 現在有 Push v2 的組裝位置，但開關在程式裡明確寫死為 `disabled`。

因此 Auth 可以把 B13.1 的 authority 與 failure notice 交給這個殼，但殼不會載入重型 Push v2 模組、不會開
IndexedDB、不會註冊 Service Worker、不會詢問通知權限，也不會發出任何 Push request。畫面的「開啟推播」仍
完整走 legacy 路徑。

這批的價值是把未來正式切換的位置固定下來，避免之後直接把一串 Push 模組塞進 `main.js` 或 React effect。

## 實際變更

### App-level disabled shell

新增 `src/notificationPushProductionShell.ts`，並在 `src/main.js` 建立一次：

```text
createNotificationPushProductionShell({ mode: "disabled" })
```

- profile orchestration 會把 Auth authority 安裝到 shell。
- Auth failure notice 會交給 shell，但 disabled mode 固定回 `ignored`。
- shell 只有在 enabled 且真的需要 runtime 時才執行 dynamic import。
- 同一個 Auth authority 的並行讀取共用同一個 runtime promise。
- Auth authority 若在 import 途中被替換，舊 authority 綁定的 runtime 不得發布；新 authority 會建立自己的
  composition。
- module 載入失敗時回 `pending`，不自行猜重試次數或啟動 retry loop。

### 單一 runtime composition

新增 `src/notificationPushRuntimeComposition.ts`，集中組合既有模組：

```text
B1 Auth authority
  ├─ subscription local composition（storage／browser／encrypted transport／enable-refresh coordinator）
  ├─ cleanup transport → cleanup coordinator
  ├─ B9 Auth-failure coordinator → B1 correlation
  └─ manual re-enable coordinator
```

所有模組共用同一份 IndexedDB storage 與 Auth authority。manual re-enable 只用 owner＋revision 向 B1 重新讀取
目前 proof，不把 access token 傳進該 coordinator。

`beginExplicitPushReenable()` 的回傳型別也收窄為實作已保證的 `subscription_changed` attempt，讓完整 composition
不需要 type cast；既有 runtime 行為沒有改。

## 零副作用與 bundle 證據

自動測試確認：

- disabled shell 即使收到 authority 與 failure notice，dynamic loader 呼叫次數仍是 `0`。
- 建立完整 runtime composition 時，fetch、IndexedDB open、通知權限與 Service Worker register 次數都為 `0`。
- `main.js` 沒有 eager import runtime composition；唯一入口是 shell 內的 dynamic import。
- production build 雖分析了 524 modules，但輸出仍為 32 files；重型 runtime 的固定 error identifiers 不存在於任何
  production asset，證明 disabled 常數已讓它們從產物移除。
- production main 只增加 shell：相較 B13.1 增加 1,200 raw／371 gzip bytes，仍低於現行 main 門檻。

第一次完整 unit run 有 6 個舊的「完全沒有任何 reference」測試如預期翻紅；實際 reference 全部且只指向新的
`notificationPushRuntimeComposition.ts`。測試契約已收窄為「只能由 lazy composition 引用」，targeted 與完整 CI
隨後通過。這是刻意的架構邊界更新，不是 production runtime 失敗。

## 驗證結果

```text
shell／composition targeted：6／6 passed
Push source-boundary targeted：27／27 passed

npm run test:ci:frontend：
- Node 587 passed／2 skipped（589 tests）
- Playwright 348 passed／4 skipped
- build 524 modules／32 output files
- TypeScript、ESLint、Prettier、git diff --check：通過

npm run test:ci:supabase：
- DB 1,198／1,198
- local API 4／4
- desktop 45 passed／11 skipped
- mobile 6／6
- cleanup Edge 1／1
- Push v2 browser-to-Edge 1／1

production bundle：
- main 650,134／191,175 raw/gzip，低於 658,867／192,420 門檻
- 最大 app lazy 16,476／4,830 raw/gzip，低於 18,000／5,500 門檻
- total 852,758／261,346 raw/gzip
- total 依 D8 為 report-only，較參考值多 2,797／2,284 bytes，未阻擋 CI

Hosted deploy／migration／env／secret／request／DB write：未執行
```

## 精確邊界

- production mode 仍是 hard-coded `disabled`，不是環境變數，也沒有 browser 可切換的 flag。
- legacy Push UI／RPC、Service Worker、dispatcher、sign-out cleanup 與通知狀態文案都沒有改。
- 沒有填 production provider origin、VAPID、RSA key、Function endpoint、timeout、TTL、retry 或 backoff。
- Edge Hosted hard gate 與 DB `new_runtime_mode = 'disabled'` 都沒有解除。
- production asset 沒有包含完整 v2 runtime；原始碼中的 dynamic path 留給後續核可批次。

## 下一步與需要確認的項目

下一批 `FA-03B13.3` 會開始影響使用者看到的 Push 狀態與隱私文案，不能沿用目前 legacy 的單一「已開啟」說法。
開始前需要確認：

1. `auth-unverified`、cleanup pending、server unavailable 與 enabled 四種狀態要顯示的白話文案與操作。
2. 是否先做 UI 狀態投影與隱私頁、仍保持 v2 disabled；還是同批準備 production config 但不啟用。
3. legacy 按鈕切換時機。cleanup Hosted 與 dispatcher barrier 尚未完成前，不能直接切到 v2 真實 request。
