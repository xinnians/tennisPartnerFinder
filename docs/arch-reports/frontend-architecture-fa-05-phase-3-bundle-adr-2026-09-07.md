# FA-05 Phase 3：Bundle ADR

日期：2026-09-07  
基準：`70d1dcd`（FA-05 phase 2）  
狀態：**採 A 維持現況；E 只保留為有條件的 App-level PoC，B／C／D 現階段不採用**

## 白話結論

目前不要為了壓 bundle，重寫 Supabase client 或用 alias 假裝成官方套件。

- 現況已通過 production preview、Auth／OAuth、local DB、Edge 與 bundle 結構檢查，風險最低。
- 把完整 client 改成 dynamic import 不會減少總下載量，而且 App 一開機就同時需要公開資料與 Auth，反而多一段等待。
- production-only alias 必須模仿官方套件的 export、class、錯誤型別與 token 行為；目前沒有足夠收益支持這個風險。
- 調高 gate 只是在改警報數字，不是優化。
- 直接組合 Auth＋PostgREST 確實可能拿掉 App 沒用到的 Realtime／Storage／Functions，但這不是官方
  `SupabaseClient` 等價路徑，必須先做完整 App-level PoC 才能再決定。

本批只寫決策與 PoC 驗收規格；沒有安裝依賴、修改 runtime、調整 gate 或建立 alias。

## 已查證現況

### 1. App 實際只用三類 Supabase 能力

- `src/data/authApi.ts` 只經 `client.auth` 使用 initialize、getSession、refreshSession、onAuthStateChange、
  signInWithOAuth、signOut 與 linkIdentity。
- `src/data/repositories/dataRepository.ts` 與 `privateDataRepository.ts` 只用 `from()` 與 `rpc()`。
- `src/` 沒有呼叫 Supabase Realtime、Storage、Functions、channel 或 schema API。

但 `@supabase/supabase-js` 2.110.0 的 `SupabaseClient` constructor 仍會建立 Realtime、PostgREST、Storage
與 Auth client，並註冊 Auth event listener。這是目前完整 client 進 main chunk 的直接原因，不是用
`manualChunks` 就會消失的下載量。

### 2. 完整 client 無法延後到互動後

`src/main.js` 的 `boot()` 同時啟動：

1. `loadCourtsImmediately()`；
2. `controller.loadDiscovery()`；
3. Google Maps；
4. `restoreAuth()`；
5. 初始 route。

前兩項需要 PostgREST，第四項立即需要 Auth。也就是未登入使用者第一次開 App 時，完整 client 已是啟動依賴；
把同一份 client 改成 dynamic import 只能改請求時序，不能等到使用者互動後才下載。

### 3. 目前 9 個 production source named imports

| 名稱                               | 種類             | 實際用途                                           |
| ---------------------------------- | ---------------- | -------------------------------------------------- |
| `createClient`                     | runtime function | 建立目前完整 Supabase client                       |
| `NavigatorLockAcquireTimeoutError` | runtime class    | browser lock 未取得時以 `new` 建立 exact SDK error |
| `processLock`                      | runtime function | 非 browser 的 Auth storage lock fallback           |
| `isAuthApiError`                   | runtime function | 分類明確 Auth API rejection                        |
| `isAuthRefreshDiscardedError`      | runtime function | 分類被較新 refresh 取代的結果                      |
| `isAuthRetryableFetchError`        | runtime function | 分類暫時網路不可用                                 |
| `isAuthSessionMissingError`        | runtime function | 區分本機無 session 與不明 server 結果              |
| `Provider`                         | type-only        | OAuth／link provider 參數                          |
| `SupabaseClient`                   | type-only        | Auth 與 repository client 型別                     |

測試另外直接從 umbrella package 使用 `GoTrueClient` 與四個 Auth error constructor，而且都有實際 `new`。
因此若 alias 不只作用在 production build，替身還要承擔這五個測試 runtime export。

### 4. `setAuth` 不能用猜的

目前 production source 沒有 `.setAuth()` caller。已安裝的 `@supabase/postgrest-js` 2.110.0
`PostgrestClient` 也沒有公開 `setAuth()`；完整 `SupabaseClient` 是在每次 fetch 前透過 `auth.getSession()`
取得 token，再補 `apikey` 與 `Authorization`。套件原始碼裡的 `setAuth()` 是 Realtime client 的呼叫，
不是 PostgREST API。

所以任何 C／E PoC 若宣稱「setAuth 可用」，必須先明確定義它是我們自己的 credential bridge，並用下一筆
PostgREST request 的 header 證明切換成功；不能把不存在的 PostgREST 方法寫進設計。

### 5. 當前大小與套件組成

Phase 2 的相同 production-equivalent build：

- main：650,257／191,204／159,809 raw／gzip／Brotli；
- total JS：852,881／261,345／220,847 raw／gzip／Brotli。

同一 build 的 Vite visualizer 把 Supabase module attribution 分成：

| package                  | modules | rendered bytes | per-module gzip bytes |
| ------------------------ | ------: | -------------: | --------------------: |
| `@supabase/auth-js`      |      18 |        384,674 |                74,709 |
| `@supabase/postgrest-js` |       1 |        106,100 |                21,456 |
| `@supabase/supabase-js`  |       1 |         34,630 |                 9,922 |
| `@supabase/functions-js` |       4 |         15,673 |                 3,956 |
| `@supabase/realtime-js`  |      14 |         94,306 |                24,982 |
| `@supabase/phoenix`      |       1 |         54,182 |                12,695 |
| `@supabase/storage-js`   |       1 |        106,059 |                19,369 |

這些是 module attribution，個別 gzip 相加不等於最後 chunk gzip，不能直接當成可省 bytes。它只證明目前完整
client 確實帶入 App 沒有呼叫的 package；實際可省多少只能由 App-level before／after build 回答。

目前 dependency tree 只有 `@supabase/supabase-js@2.110.0` 是 direct dependency；auth、postgrest、functions、
realtime、storage 都是它精確鎖定的 2.110.0 transitive dependency。

## A～E 比較與裁決

| 方案                                | 真正效果                                      | 目前風險                                                                                          | 裁決                               |
| ----------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------- |
| A 維持完整 client＋現有 facade      | 不改大小；保留官方整合語意與現有測試證據      | 最低                                                                                              | **採用**                           |
| B 完整 client dynamic import        | 可能把檔案拆開，但總 JS 不減；boot 仍立刻下載 | 多一個啟動 request／waterfall，沒有下載量收益                                                     | 不採用                             |
| C production-only 子套件替身／alias | 可能減大小                                    | 必須模仿 9 個 imports、constructor／error identity／token bridge；dev 與 prod 走不同 module graph | 不採用                             |
| D 調整正式 gate                     | 只改允許值，不改善載入                        | 容易把歷史超額包裝成已優化                                                                        | 不採用；依 D9 等 release candidate |
| E 明確直接組合 Auth＋PostgREST      | 有機會拿掉未用的 Realtime／Storage／Functions | 要自行承擔完整 client 原本的 Auth header、PKCE、refresh、lock 與 error 行為                       | 只保留條件式 PoC                   |

## Sentry 與 non-byte gate

final-v3 寫的「12 個 non-byte assertion call sites」是當時版本。現在 `70d1dcd` 已更強：

- `check-production-bundle.mjs` 有 14 個結構／內容 call sites；demo identifier 雖只有一個 call site，會逐一跑
  12 個字串。
- `productionBundlePolicy.mjs` 的 Sentry provenance 另有 8 個 call sites。
- Sentry 不再只看 `sentry_version` 字串分類；現在要求恰好 1 個 wrapper chunk、恰好 1 個含 `@sentry/`
  dependency 的 chunk、兩者為同一檔、沒有其他 app／第三方 module，也沒有 static／dynamic imports。
- checker 還會把 Vite 產物與 `dist` Sentry chunk 逐字比對，再驗 marker；private repository 仍要求不進 main
  且恰好 1 個 chunk。

未來任何 PoC 必須保留目前全部 22 個結構／provenance call sites 與既有 byte report／release 分流；不能只回到
final-v3 的舊 12 個最低基線。

## E 的可丟棄 App-level PoC 規格

只有正式 hosting／裝置／Web Vitals 證據指出 bundle 是實際瓶頸，或 release candidate 依 D9 設出的限制無法滿足，
才建立隔離 worktree 做以下 PoC。PoC 不直接合併。

### 實作界線

- 將 `@supabase/auth-js`、`@supabase/postgrest-js` 以與 umbrella client 相同的精確版本列為 direct dependency；
  不從 transitive 路徑偷 import。
- 不建 Vite alias。由一個明確的 app client module 組合 `GoTrueClient` 與 `PostgrestClient`，對外只提供
  `auth`、`from()`、`rpc()` 與有明確契約的 credential bridge。
- repository 與 auth layer 改用窄型別，不用 `as SupabaseClient` 假裝完整相容。
- 保留目前 Auth storage key、PKCE、`detectSessionInUrl`、auto refresh、local sign-out、custom refresh observer、
  Web Locks／`processLock` 與 `lockAcquireTimeout: -1`。
- PostgREST fetch 每次都要使用當下 Auth session token；無有效 session 時才退回 public key。不得覆寫 caller
  明確給的 Authorization，不得讀取、記錄或複製 refresh token。

### 必過驗證

1. 9 個 production import 契約與測試需要的 class／error identity 全部有明確去向；沒有 production-only 假 module。
2. Auth：anonymous boot、PKCE callback、refresh success／rejected／unavailable／superseded、同帳號 refresh、
   local sign-out、OAuth sign-in、identity link、跨分頁 lock 全部通過。
3. credential bridge：匿名 request、登入後 request、token refresh 後下一筆 request、登出後下一筆 request 的
   `apikey`／`Authorization` 都以攔截器驗 exact 行為；測試輸出不得包含 token。
4. Data：`from()` 的 public discovery、private RLS，以及 `rpc()` 的讀寫路徑全部跑 local Supabase；
   `tests/fixtures/localSupabase.js` 既有 harness journeys 不得失效。
5. production preview：phase 2 的 5 個情境與三次重跑通過；anonymous private chunk 0、authenticated positive
   control 1 的同 probe 契約不變。
6. bundle：目前 22 個 non-byte／Sentry provenance call sites 全保留；raw／gzip／Brotli 用相同環境至少重建三次，
   報 main、total、request 數與 phase 2 A 基線差異。不得先設一個猜測的省量門檻。
7. 完整 frontend、Supabase、Chromium required 與非阻擋 WebKit signals 都跑；任何 Auth／RLS／OAuth／lock
   語意差異直接停止 PoC。

### 停損條件

- 需要讀 SDK private field、複製 refresh token、弱化 current-session refresh、改 storage key 或放寬 lock。
- 需要 production-only alias、`any`／unsafe cast 才能假裝 `SupabaseClient`。
- production preview 多出啟動 waterfall，或 raw／gzip／Brotli 任一沒有實際下降。
- 22 個 non-byte gate、private chunk、Sentry provenance 任一必須被刪除或放寬才能通過。

## 何時重開決策

只有兩類新證據會重開：

1. D9 的真實 production hosting／裝置／網路／Web Vitals 顯示 Supabase bundle 是主要瓶頸；
2. 官方提供可直接取代目前 `SupabaseClient` 行為的較小、受支援 client 入口。

沒有這些證據前，維持 A。若日後執行 E PoC，是否接受額外維護成本與實測省量，必須以新 ADR 決定；本文件
沒有預先批准 runtime migration。

## 本批驗證

```text
TypeScript AST 讀取兩個 production import：9 個 named imports
TypeScript AST 計數 checker：14 個結構／內容 assert call sites
TypeScript AST 計數 identifySentryChunk：8 個 provenance assert call sites
npm ls：umbrella／auth／postgrest／functions／realtime／storage 都是 2.110.0；只有 umbrella 是 direct
src 全庫 Supabase API sweep：只有 auth／from／rpc；零 setAuth／realtime／storage／functions caller
installed postgrest source／type sweep：零 setAuth method
production-equivalent Vite visualizer：上表 7 個 package attribution 已由當次 JSON 重新計算
Prettier／git diff --check：通過
```
