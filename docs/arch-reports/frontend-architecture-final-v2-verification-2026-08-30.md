# 前端架構 final-v2 獨立驗證報告

日期：2026-08-30

驗證對象：`docs/arch-reports/frontend-architecture-final-v2-2026-08-30.md`

對象 SHA-256：`3eabe9e5d34892ad72d19c3163a28b1825d3b87ae15d3004380f08564b656a0c`

程式基準：`a14e81ecf88fbdd87f7b7f77fe0ffcf4d22b6343`

結論：**final-v2 不能原樣當成派工規格；完成本文列出的修正後，再交下一輪確認。**

本次 repository authoring 只新增這份報告，沒有編輯 final-v2、runtime、測試或設定。
驗證期間有重新產生 `dist/`；`test:db` 在 transaction 內執行並 rollback，沒有提交 schema 或測試資料變更。

## 1. 先說結論

專案目前沒有需要更換 React 或 Vite 的證據。已查到的主要問題是：DOM 與資料 ownership
還沒完全收斂、測試 gate 有盲區、bundle 餘裕很小，以及 Web Push 的帳號生命週期不完整。
這些問題可以在現有框架內分階段修正；直接換 Next.js、Router 或 Query library 不會自動解決。

final-v2 的大方向可保留，但有三類問題必須先修：

1. Web Push 缺陷確實存在，但 §3.4 的修法不夠安全，也漏了瀏覽器訂閱更新、VAPID 輪替與失敗重試。
2. 多個數字或歷史敘述超出證據，例如 CSS「約 38 條」、七類外送出口、
   `ds-bundle` 的 8/17 決策，以及「雙環境 byte-identical」。
3. 部分說法和原始碼互相衝突，例如規則檔授權、方案 B 等同 E、
   `package.json` 精確鎖版、WebKit 本機指令非阻擋。
4. `17 檔／90 點` 只是文字 grep 結果，含註解誤判且漏掃其他 mutation API，不能凍結成正式基線。

因此，本報告的建議是：**保留架構路線，退回 final-v2 做事實修訂；Push 方案重寫後才可派工。**

## 2. 驗證規則

本文只使用以下證據：

- HEAD `a14e81e` 的原始碼、測試、migration、Git 歷史
- 本輪實際執行的 build、靜態檢查與測試結果
- 已安裝套件的實際程式碼與 lockfile
- W3C、Supabase 官方文件

前幾輪架構文件只算「待查主張」，不算獨立證據。正式環境流量、使用頻率、真實裝置表現、
未保存的口頭決策，以及未執行的命令，一律不推測。

本文標記：

- **已重現**：可由目前原始碼、Git、指令或測試直接重現
- **需更正**：final-v2 與直接證據不符，或措辭超出證據
- **未證實**：目前沒有足夠資料，不代表一定錯
- **設計建議**：未實作、未授權，必須另做 PoC 或取得決策
- **未執行**：本輪刻意沒有執行，不能寫成通過

## 3. 已重現的架構現況

| 主題 | 本輪結果 | 證據範圍 |
| --- | --- | --- |
| 前端框架 | Vite + React；全 `src/` 只有一個 `createRoot()` | `package.json`、`src/app/App.tsx:762` |
| Surface ownership | `SurfaceSlot` 在 `SurfaceHost.tsx` 外零引用；舊 `pageViews.js` 不存在；14 個 sheet adapters、14 個 unmount registrations | 另有 14 個 lazy sheets、3 個 lazy pages、1 個 eager module；不代表 lifecycle 已全由 React 擁有 |
| HTML renderer | `innerHTML` 3 處、`dangerouslySetInnerHTML` 1 處、非空 surface `html:` 2 處 | `sessionViews.js`、`sheets.ts`、`SurfaceHost.tsx`、`sessionSurfaceViews.js` |
| 其他 HTML API | `insertAdjacentHTML`、`outerHTML` assignment、`DOMParser`、`createContextualFragment`、`document.write`、`setHTMLUnsafe` 皆零命中 | 全 `src/` 掃描 |
| Controller DOM gate | final-v2 所列 DOM API 集合在 `src/controller/**` 與 `src/sessionController.ts` 零命中 | 範圍限定掃描 |
| Browser port 基線 | 窄範圍可重現 `globalThis.document` 4、其餘 `Document` 型別 4、controller 直接 navigator 1；另有 `appErrors.ts:129` 的 global `HTMLElement` | 不能當全庫完整清單 |
| `syncCommit` | source caller 只有 `app/SurfaceHost.tsx`、`sessionStore.ts`；既有測試會鎖 caller | `react-surface-lifecycle.test.js:109-118` |
| CSS 載入順序 | `src/main.js:8-20` 共 13 個 CSS imports | 原始碼逐行核對 |
| Mutation 候選 | sixth-pass 的 grep union 可重現 17 檔、90 行；同一 API 集合的 AST 是 17 檔、89 個程式節點 | grep 含 1 個註解誤判，且 API 集合漏掃至少 3 個真實 mutation，不能當正式基線 |
| 持久 live roots | 可定位 5 個跨頁或持久節點，其中 4 個在 React root 外、1 個在 React 內 | `index.html:81,84,89,123`、`App.tsx:591` |
| top-level wiring | 4 個 configure 呼叫加 2 個 preload listener，共 6 個 | `sessionViews.js:383,424,439,621,622,640` |
| Surface manifest | 81 行、3 個直接 import consumer | `tests/fixtures/surfaceManifest.js` 與 tests imports |
| 舊 bridge 耦合 | `__importAppModule("sessionViews")` 有 86 個呼叫行，分布在 11 支測試 | 這是 test harness 耦合，不是 production runtime caller |
| blockedPlayers | `refreshMyPlayerBlocks()` 有 3 個 caller；auth reset 的單一 `setState` 寫 5 欄 | `main.js:458`、兩個 controller、`authController.ts:149-155` |
| Session state | 初始 state 27 欄；`discoveryMessage` 是初值加 3 個 runtime 寫入，runtime 讀取 0 | `controllerContracts.ts`、`sessionController.ts`、`discoveryMapController.ts` |
| Profile helper 使用量 | 排除 helper 定義檔後，四個 helper 名稱有 35 個靜態呼叫行 | 只是文字層 call-site 數，不能直接等同 35 個獨立授權規則 |
| Chat 現況 | 12 個名稱以 `open*` 開頭的 options 中 chat 佔 1、1/11 registry、2/15 transition、初始 store 0 個 chat 專屬欄位 | 另有不以 `open` 開頭的 `promptProfile` surface opener；計數只代表命名前綴 |
| CSS 現況 | 13 個依序 imports、0 個實際 `@layer`、50 個 custom-property declarations 全在 `session.css` | `!important` 為 5 個 declarations；content-visibility contract 為 4 個 selectors |
| dead preload | `main.js:687` 在 auth 還是初值 null 時執行，實際 auth preload 在 `:643` | 呼叫順序與同步流程核對 |
| 文件規則 | final-v2 §2.1 列的 4 個過時描述都成立；bundle checker 未被任何 rules path 涵蓋 | `CLAUDE.md`、`.claude/rules/testing.md`、各 rules frontmatter |

以上只證明目前狀態，不代表所有建議已獲授權。

### 3.1 final-v2 逐節判定

| final-v2 區段 | 判定 |
| --- | --- |
| §1 摘要 | 現有框架可續用；`17/90` 不可寫成正式帳本基線 |
| §2 已完成 | 單 root、surface 數量與既有 gate 大致成立；SurfaceHost 完整 lifecycle ownership 說得過頭 |
| §2.1 文件 | 4 個過時描述與 rules path 漏洞成立；「無條件修」和 §18 衝突 |
| §3 Push | 核心缺陷成立；影響措辭要縮小；§3.4 不可直接實作 |
| §4 Ownership | 原則屬合理設計；五列只可稱持久 roots，現況 lifecycle 仍有共享 owner |
| §5 Gate | Gate A 數量成立；Gate B 需說清楚 input 非空、violation 為空與掃描 scope |
| §6 帳本/live test | grep 數字可重現但帳本基線不成立；live root identity test 尚未存在 |
| §7 清理 | dead preload、檔內 export 等成立；`ds-bundle` 歷史、re-export 連動、preload 頻率需更正 |
| §8 效能 | dev-path 斷言與 positive control 問題成立；preview、CDP、LCP、brotli 都仍是提案 |
| §9 Bundle | fresh 數字與 checker 弱點成立；方案 B、E、版本與累積上限措辭需更正 |
| §10 Manifest/wiring | 81／3／86 與 6 個 side effects 成立；86 是 tests |
| §11 blockedPlayers | 3 callers、5 欄 reset、同步 guard 成立；facade 行為與拆分方式仍是設計 |
| §12 Chat/Messages | 多數結構數字成立；5/86 未完成語意分類，chunk 餘裕標示錯誤，「最佳」是判斷 |
| §13 State | 27 欄、dead state、mutable filters 成立；六類／10 跨類無可重跑基準 |
| §14 CSS | imports、tokens、`@layer` 現況成立；38 不可重現；contrast token 尚缺 uniqueness gate |
| §15 隱私 | auth identity fallback 風險成立；「外送出口精確七類」不成立；Query 規則是提案 |
| §16 驗收 | 本輪只證明 §8 的實跑項；local、mobile local、WebKit、乾淨機器不可標成通過 |
| §17 不建議事項 | 屬架構政策，需逐條帶回修正版；不是程式現況證明 |
| §18 授權 | 文件不能自行授權 runtime；全部應改成「建議授權範圍，待維護者核可」 |
| §19 驗證題 | 本文已逐項回答；其中 mutation 正式基線與乾淨機器結果不能給肯定答案 |

## 4. Bundle 與建置的精確結果

本輪 fresh production build 通過，主檔為 `index-BWygPPVv.js`。目前 `dist/` 與另一份
in-memory production build 的 24 個 emitted outputs 可逐檔對上；這只能證明**本機本輪**結果，
不能證明 final-v2 所寫的「8/29、8/30 雙環境」歷史主張。

| 項目 | raw | gzip | 上限 | 剩餘 |
| --- | ---: | ---: | ---: | ---: |
| main | 638,937 | 187,466 | 658,867 / 192,420 | 19,930 / 4,954 |
| total JS | 841,561 | 257,627 | 849,961 / 259,062 | 8,400 / 1,435 |
| MySessionsPage | 16,476 | 4,828 | 18,000 / 5,500 | 1,524 / 672 |
| SessionDetailSheet | 16,049 | 4,847 | 18,000 / 5,500 | 1,951 / 653 |
| MePage | 15,473 | 4,949 | 18,000 / 5,500 | 2,527 / 551 |
| CreateSessionSheet | 15,225 | 4,542 | 18,000 / 5,500 | 2,775 / 958 |
| Sentry | 87,975 | 29,723 | 90,000 / 31,000 | 2,025 / 1,277 |
| Chat sheet | 5,277 | 2,079 | 18,000 / 5,500 | 12,723 / 3,421 |
| Messages page | 1,719 | 873 | 18,000 / 5,500 | 16,281 / 4,627 |

CSS 為 65,865 raw / 10,857 gzip，目前 checker 沒有 CSS byte gate。

`check-production-bundle.mjs` 有 8 個 byte-limit 常數，透過 6 個靜態 byte assertion call sites
執行；lazy raw/gzip 兩個 call sites 會逐 chunk 跑。另有 12 個非 byte 靜態 assertion call sites，
其中 demo identifier 的一個 call site 會在 loop 內執行 12 次。不能只寫成「12 個 assert」而不交代口徑。

Sentry 分類盲區已在 checker 邏輯層重現：一般 lazy chunk 加入 `sentry_version` 後會套用較寬的
Sentry 上限，而且目前只要求 Sentry chunk 數量大於 0。測試資料把 MePage gzip 從 4,949 增到
6,315，超過普通 lazy 上限 815 B，但 total 仍為 258,993，checker 仍可通過。
這是 deterministic checker canary；本輪沒有修改 source 再做完整 Vite A/B 實驗。

獨立 esbuild 探針也可重現，但它不是 App 的 Vite build：

| 探針 | raw | gzip | brotli |
| --- | ---: | ---: | ---: |
| `createClient` | 209,906 | 54,785 | 46,174 |
| `GoTrueClient + PostgrestClient` | 113,352 | 27,929 | 23,962 |
| 差額 | 96,554 | 26,856 | 22,212 |

精確重跑方式如下。esbuild 版本來自目前 lockfile（0.25.12）；options 是 `bundle + minify + ESM`，
未另設 platform/target；壓縮使用 Node `zlib` 的預設 `gzipSync`／`brotliCompressSync`：

```bash
printf '%s\n' 'import { createClient } from "@supabase/supabase-js";' \
  'console.log(createClient("https://x.supabase.co","k",{auth:{flowType:"pkce"}}));' \
  | npx esbuild --bundle --minify --format=esm --sourcefile=probe-a.mjs \
      --outfile=/tmp/tennis-probe-a.js --log-level=error
printf '%s\n' 'import { GoTrueClient } from "@supabase/auth-js";' \
  'import { PostgrestClient } from "@supabase/postgrest-js";' \
  'console.log(new GoTrueClient({url:"u"}), new PostgrestClient("u"));' \
  | npx esbuild --bundle --minify --format=esm --sourcefile=probe-b.mjs \
      --outfile=/tmp/tennis-probe-b.js --log-level=error
node -e 'const z=require("node:zlib"),f=require("node:fs");for(const n of ["a","b"]){const b=f.readFileSync("/tmp/tennis-probe-"+n+".js");console.log(n,b.length,z.gzipSync(b).length,z.brotliCompressSync(b).length)}'
```

## 5. final-v2 必須更正的內容

### 5.1 Web Push

1. **API 名稱錯誤**：§3.1 的 `pushManager.unsubscribe()` 應改為
   `PushSubscription.unsubscribe()`。
2. **帳號刪除描述過廣**：產品內沒有自助刪帳 UI，但資料庫有
   `auth.users → profiles → push_subscriptions` 的 cascade。應寫「沒有產品內自助刪帳路徑」，
   不能寫成資料庫完全沒有刪除路徑。
3. **UI 訊息不是零**：ownership error 會落到通用訊息「通知設定暫時無法更新，請稍後再試。」；
   真正缺的是 ownership 專用說明與恢復指引。
4. **不是自動恢復**：舊 subscription 失效後，使用者仍要再按一次「開啟推播」。登入、權限改變
   或取得新 endpoint 本身都不會觸發現有 `enableBrowserPush()`。
5. **不是永久靜默**：使用者可用既有按鈕重新建立 subscription。應寫「產品沒有自動恢復」，
   不應寫「永久無法恢復」。
6. **清除網站資料的結果完全待瀏覽器實測**：本專案 `/push-sw.js` 的預設 scope 是 `/`，
   屬 W3C 定義的 window-accessible scope。規格只強制「非 window-accessible scope」在
   registration 被移除時停用 subscription，不能把同一結論套到本專案。
7. **A→B 直接換帳號不是已證實的常態 UI 路徑**：可保留為多分頁、OAuth 或外部 session
   變更的邊界情境，但不能描述成目前 UI 的普通操作。
8. **「高頻」沒有資料**：預設訂閱全台北球場能證明通知範圍較廣，不能證明正式環境頻率。
9. **session reminder 的敘述過頭**：只能證明 A 是 accepted participant，不能證明 A 必然
   在該時間實際出現在球場。
10. **`permission === "granted"` 不等於帳號同意**：通知權限屬於 origin／裝置，資料庫目前
    沒有「帳號＋裝置」opt-in。照 §3.4 自動替 B 重訂，可能讓未主動開啟推播的 B 被訂閱。
11. **`p256dh + auth` 不能當強式持有證明**：`p256dh` 是公鑰；真正的 subscription 私鑰
    不會提供給網頁。`endpoint + p256dh + auth` 加上 application-server credentials
    才能完成發送；這些 sender-side 資料都不足以證明目前瀏覽器持有對應私鑰。
12. **「cleanup 失敗留重試」尚未設計**：A 登出後 JWT 失效，匿名或 B 不能重試 A 的
    owner-only remove RPC。重試資料放哪裡、用什麼身分執行，都還沒有答案。
13. **漏掉 subscription refresh**：Push 規格允許瀏覽器更新 subscription；目前
    `push-sw.js` 沒有 `pushsubscriptionchange` handler。
14. **首次安裝時序未處理**：`notificationPush.js:29` 在 `register()` 後直接使用
    `registration.pushManager`，沒有等待 `navigator.serviceWorker.ready`。
15. **VAPID key 輪替未處理**：現有 subscription 是否使用目前的 application server key，
    程式沒有核對或重建流程。

因此 §3.1 的缺陷鏈可保留，§3.2、§3.3 要收斂措辭，§3.4 必須重寫。

### 5.2 架構、數字與歷史

1. **舊報告不是證據**：版本沿革可以保留，但「前六份文件保留為證據」應改為
   「保留為審查紀錄與待查輸入」。
2. **雙環境 build 未證實**：本輪只證明目前本機 build 與目前 dist 對得上；沒有可驗證的
   8/29 第二環境紀錄。
3. **`ds-bundle` 的 8/17 決策未證實**：Git 可證明 8/11 的 NOTES 寫「是否版本化由使用者決定」，
   並可證明 8/21 由 `260ef16`、`dd13c51` 加入目前 13 個 tracked files；找不到 8/17
   「已拍板不保留」的 repo 證據。另一路徑應完整寫成 `.design-sync/conventions.md`。
4. **五個 aria-live 不是全庫清單**：這五個是跨頁或持久 roots。React 內還有其他暫時性
   live/status 節點；標題應改成「持久 live roots 實名表」。
5. **Gate B 的非空 assertion 寫法不清楚**：現況 forbidden hits 本來就是 0；應斷言
   「被掃描的檔案或 AST 節點集合非空」，不能要求違規結果非空。
6. **Browser port 的 4+4+1 只屬窄範圍**：全庫另有 `shareFeature.js`、
   `playerPresence.js`、`notificationPush.js` 等 browser globals。final-v2 已寫不宣稱完整，
   後續 gate 名稱與 scope 也必須保留這個限制。
7. **SessionDetail 不是最大 app lazy chunk**：它是 raw 最大的 sheet；raw 最大 app lazy chunk
   是 MySessionsPage。「最常用」與 Report/Withdraw「罕用」都沒有 telemetry。
8. **preload 仍可能改 bundle bytes**：通常不改 dynamic import 邊界，但清單與事件邏輯會改
   main 程式碼。每次仍要 fresh build，不能保證「不影響 bundle 餘裕」。
9. **re-export 的測試連動寫多一項**：刪 13 個 object re-export 要改名稱清單與正則；
   `Object.freeze` 計數仍由 `sessionFormSheetRuntime` 產生，不應因此修改預期值。
10. **方案 B 不等於 E**：完整 supabase-js 可以動態載入成 auth chunk；這可能改善初始 main
    或下載時序，但不減 total JS。直接組合 auth-js + postgrest-js 才是另一個方案。
11. **固定 total gate 目前有累積上限**：在不改 gate 時，總 gzip 最多再增加 1,435 B。
    只有未來每次核准後都重設基準，才需要年度累積 ledger。
12. **Supabase 不是在 package.json 精確鎖版**：`package.json` 是 `^2.110.0`；
    `package-lock.json` 目前解析為 2.110.0。兩者要分開寫。
13. **官方支援的範圍要收斂**：auth-js 的 standalone import 和 PostgrestClient 直接使用都有
    官方公開用法；「兩者自行組合後完全等同 supabase-js」沒有官方保證，仍需 App PoC。
    兩者目前只是 supabase-js 帶入的 transitive packages；採方案 E 時必須改列 package.json
    direct dependencies，不能因本機目前可 import 就視為已正式宣告依賴。
14. **Chat 的 3,421/4,627 不是同一 chunk 的 raw/gzip**：前者是 Chat gzip 餘裕，
    後者是 Messages gzip 餘裕。兩者要分開標示。
15. **Chat 約 5/86 尚未驗證**：final-v2 已自註未逐點複驗，不應同時拿來支持「最輕」或
    「最佳」的已證實結論。
16. **Profile helper 應寫明掃描口徑**：本輪取得的是排除定義檔後 35 個靜態 call-site 行；
    這不能證明每一行都是獨立授權判斷，也不能只靠數量證明它是唯一輸入。
17. **CSS 約 38 條不能重現**：repo 沒有「跨 feature selector」的正式定義、manifest 或查詢，
    先前報告也記錄過該數字無法重現。刪除數字，只保留「不新增跨 feature selector」政策。
18. **外送出口不是完整七類**：final-v2 的七類至少漏了 Supabase Auth 網路／refresh／sign-out、
    OAuth provider redirect、PushManager 與瀏覽器 push service、Google-hosted avatar 圖片請求。
    建議建立正式 egress manifest，未建立前不要宣稱精確總數。
19. **新依賴不是單獨被 checker 計費**：checker 只看最後總量。正確條件是 final build
    `total gzip <= 259,062`；若同批刪掉其他程式，單一依賴增量可以大於 1,435 B。
20. **17 檔／90 點不可凍結成正式 mutation 基線**：文字 grep 把
    `sessionSurfaceViews.js:114` 註解裡的 `removeChild` 算成命中；同時漏掉
    `sessionSurfaceViews.js:169` 對 React 所 render input 的 `value = ""`，以及
    `modalIsolation.js:14,22` 的兩個 `inert` 寫入。應先定義完整 API 與 AST scope，再重建數字。
21. **SurfaceHost 並未單獨擁有全部 backdrop lifecycle**：它負責 portal、render、Escape、Tab
    與 focus；`sheets.ts` 仍管理 WeakMap、close、backdrop/close listeners、isolation 與 unmount
    順序。應把 ownership 寫成共享現況與待收斂邊界。
22. **State「六類涵蓋、10 欄跨類」未能獨立重現**：final-v2 沒附分類表或可重跑規則，
    只引用 v1。這兩個數字應補 manifest／規則，或降為待驗。
23. **State reconciliation 不能概括成同一行為**：一般 discovery load 只 reconcile detail；
    quiet load 本身不 reconcile；mySessions roster reload 才同時 reconcile detail/chat。
    搬 state ownership 時要把三條行為分別寫成測試契約。
24. **contrast token 還缺 uniqueness gate**：目前 50 個 custom-property declarations 都在
    `session.css`，但測試是把 CSS 按檔名字母序串接後取 first match，沒有直接阻止未來的同名
    token。既然它是載重前提，就應加「同名 token 不可重複」測試。
25. **Browser port 至少還漏一個明確 dependency**：`appErrors.ts:129` 使用
    `existing instanceof HTMLElement`，依賴全域 realm 的 `HTMLElement`。4+4+1 只能保留為
    已定義窄掃描的舊數字，不能稱為完整 inventory。
26. **「真零風險」是過度保證**：dead preload 可由目前 boot order 證明為 dead，其他清理也能
    各自說明連動；但程式碼不能證明任何變更是絕對零風險。標題應改成「已證明 dead／低風險」。

### 5.3 授權與驗收指令

1. **§2.1 與 §18 互相衝突**：前者說規則文件無條件修正，後者說階段 3 前全程不可改 rules。
   建議明列：階段 0 可修正過時文字與 checker 的 paths 涵蓋，但不得修改 byte limits；
   放寬 gate 仍需階段 3 的明確核可。
2. **目前沒有 runtime 實作授權**：這次使用者只要求驗證與文件。final-v2 §18 對階段 1、4、5、6
   所寫的「可改 runtime」是方案內的提案，不是本次對話授權。
3. **乾淨機器前置不完整**：還需 Node `>=22.18`、網路、Docker daemon；
   `playwright install --with-deps` 也可能需要系統套件權限，不能保證每台機器直接成功。
4. **WebKit 的「非阻擋」只存在 CI job 設定**：本機執行 `npm run test:mock:webkit` 若失敗，
   command 仍會回傳非零。
5. **完整 local Supabase 驗證會改本機狀態**：標準乾淨流程應明列
   `npx supabase start → CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test → npm run test:db →`
   `npm run test:local → npm run test:local:mobile`。reset 只可在明確核可後執行；沒有確認變數時
   script 會 fail closed。
6. **`git diff --check` 不檢查 untracked 新檔**：此系列文件目前是 untracked；新文件需另用
   `git diff --no-index --check /dev/null <file>`，或 staged 後檢查 cached diff。

## 6. Web Push 的安全修訂方向

本節是**設計建議，不是已完成實作，也不是 runtime 修改授權**。

### 6.1 需要先決定的產品規則

- 推播同意要定義在「帳號＋裝置」，還是只看瀏覽器 origin permission。
- 登出是否一定停用本裝置的該帳號推播。
- 同一瀏覽器換帳號時，是否要求新帳號重新明確 opt-in。
- cleanup 失敗時允許留下什麼本機重試資料；其中不得保存 access/refresh token。
- orphan subscription 保存多久；是否新增 `last_seen_at` 與 TTL cleanup。

沒有以上決策，不應實作 auto-resubscribe 或 endpoint 接管。

### 6.2 最小安全行為

1. 明確登出時，取得目前 `PushSubscription`，分開處理 server row removal 與
   `subscription.unsubscribe()`；cleanup 失敗不得阻止 `signOut()`。
2. A→B identity change 時，不把 A 的 endpoint 直接改掛 B。只有確認舊 subscription 已停用、
   `getSubscription()` 為 null，才能替 B 儲存新 subscription；若停用失敗，server 必須以
   tombstone／quarantine 阻止該 endpoint 被立即接管。B 仍要有自己的明確 opt-in。
3. 自動重訂必須有帳號＋裝置 opt-in，不能只看 `Notification.permission`。技術權限檢查還要
   針對相同 options 使用 `PushManager.permissionState()`；兩者都不能取代帳號同意。
4. 首次訂閱等待 `navigator.serviceWorker.ready`。
5. 處理 `pushsubscriptionchange`、啟動、登入後、回到前景與 VAPID key 輪替的 reconciliation。
   `pushsubscriptionchange` 發生在 Service Worker，不能假設當下有 Supabase session；應通知
   window 或留下待同步狀態，再由已驗證身分的前景流程更新 owner row。
6. 保留 dispatcher 的 404/410 清理，另評估 TTL，處理永遠收不到下一封通知的 orphan rows。
7. ownership error 顯示可操作的說明，不只顯示通用錯誤。

### 6.3 必跑驗收矩陣

| 情境 | 必須證明 |
| --- | --- |
| A 開啟推播後正常登出 | A 的 row 被移除；本機 subscription 停用；登出完成 |
| server delete 成功、unsubscribe 失敗 | 不會把舊 endpoint 轉給 B；有明確恢復路徑 |
| server delete 失敗、unsubscribe 成功 | 登出完成；失效 endpoint 可被 404/410 或 TTL 清理 |
| 兩個 cleanup 都失敗 | 風險有清楚提示；重試身分與時點已定義 |
| A→B 的 auth identity change | B 不會收到 A 通知，也不會未經 opt-in 被自動訂閱 |
| 瀏覽器 refresh subscription | 新 endpoint/keys 能同步；舊 row 能退役 |
| 撤銷再授予 permission | UI 與 server 狀態可恢復，不依賴猜測特定瀏覽器行為 |
| VAPID key 輪替 | 舊 key subscription 可被辨識並安全重建 |
| 同帳號兩台裝置 | 一台登出不誤刪另一台 subscription |
| dispatcher 收到 404/410 | 只清除正確 endpoint，不影響同帳號其他裝置 |
| 帳號真的從 auth.users 刪除 | cascade 會移除 profile 與 subscriptions |

W3C Push API 明確指出 subscription endpoint 唯一識別訂閱；新訂閱會產生新 key pair，
私鑰不會暴露給網頁；user agent 也可以更新 subscription。依據：
[W3C Push API](https://www.w3.org/TR/push-api/)。

## 7. 修正後的前端執行順序

以下是**建議順序**，不是本次授權：

1. **階段 0：文件與規則對齊**
   先修 §2.1 的過時描述、rules path 漏洞與授權衝突；不動 byte limits。
2. **階段 -1：Push 設計與威脅模型**
   把 §6 的產品決策與驗收矩陣寫成獨立派工單，核可後才改 Auth/runtime。
3. **階段 0a：純 gate**
   建 HTML renderer AST gate、controller DOM gate、CSS import order gate；保留現有 syncCommit gate。
4. **階段 0b：人工 ownership 基線**
   先定義完整 mutation AST scope，再以 17 檔／90 行 grep 結果作人工查核輸入，重建正式
   symbol 帳本；另加 4 個 React 外持久 live roots 的 identity 測試。
5. **階段 1：可證明的清理**
   只處理 dead preload、純檔內 export、錯誤註解與已確認的 re-export；`ds-bundle` 另做產品決策。
6. **階段 2：production preview 基線**
   新增 build+preview Playwright project，修 private chunk positive control。
   CDP 慢網路只能當 Chromium 情境；WebKit 另用跨引擎可用的方法或真實裝置驗證。
7. **階段 3：Bundle ADR**
   分開比較 A（維持）、B（完整 client 動態載入）、D（正式調 gate）、E（直接組合子套件）。
   E 必須通過 Auth、PKCE、refresh、sign-out、local harness 與 production-equivalent PoC。
8. **階段 4：manifest 與 wiring**
   gate 先遷移，再搬 6 個 top-level wiring side effects，最後才能刪 bridge。
9. **階段 5：blockedPlayers facade PoC**
   保留 account invalidation、request generation、auth snapshot 與可觀察狀態的原子性。
10. **階段 6：Chat/Message vertical slice**
    先把 unread mutation 收回單一 owner，再搬 server state 與 route ownership。

建議的長期目錄方向是保留現有 Vite/React，只把責任分清楚：

```text
src/app/        composition root、route/surface orchestration
src/features/   以功能為單位的 UI、commands、selectors
src/platform/   Service Worker、Push、Maps、Geolocation、OAuth、Sentry adapters
src/data/       repositories、mappers、Supabase client boundary
src/shared/     無業務狀態的 UI、types、utilities
```

這是目標結構，不建議一次搬完。每搬一個 feature，必須同批刪掉對應舊 bridge，避免形成第二套架構。

## 8. 本輪實際執行結果

| 指令 | 結果 |
| --- | --- |
| `npm run typecheck` | 通過 |
| `npm run lint` | 通過 |
| `npm run prettier:check` | 通過 |
| `npm run test:session-unit` | 349 passed、0 failed |
| `node --test tests/react-surface-lifecycle.test.js tests/session-presentation-boundary.test.js` | 14 passed、0 failed |
| `npm run test:mock` | unit 通過；Playwright 298 passed、4 skipped |
| `npm run test:db` | 7 個 SQL test files、804 assertions 全部通過；測試以 transaction rollback 收尾 |
| `npm run build` | 通過；Vite 6.4.3，508 modules transformed |
| `npm run check:production-bundle` | 通過；數字見 §4 |
| `git diff --check` | 通過；注意不含 untracked 文件 |
| `npx supabase status` | exit 0；本機主要服務可用，選配服務有停止項目 |
| `node --test tests/notification-data-api.test.js tests/notification-dispatch.test.js tests/notification-push.test.js` | 13 passed、0 failed |

執行環境：Node 22.22.3、npm 10.9.8、Playwright 1.61.1、Supabase CLI 2.115.0。
`package.json` 要求 Node `>=22.18`。

測試期間看到 Playwright harness 的 `Port 24678 already in use` WebSocket warning，
但相關測試最後 exit 0；本文只記錄現象，不推測原因，也不把 warning 寫成已修復。

## 9. 本輪未執行、不能宣稱通過

- `npm run test:local`
- `npm run test:local:mobile`
- `npm run test:mock:webkit`
- guarded local DB reset
- `npx playwright install --with-deps ...` 的實際安裝
- 真正的乾淨機器驗證；只做過 `npm ci --dry-run --ignore-scripts`
- OAuth callback、PKCE、token refresh、雙帳號與多分頁的完整 browser matrix
- 各瀏覽器「清除網站資料」對 Push／Service Worker 的實機行為
- 正式環境通知頻率、preload 使用率、LCP、interaction latency
- 方案 E 的 App-level Vite/Auth PoC
- Sentry 分類弱點的 source-level Vite A/B canary

沒有跑 local browser batch，是因為它會建立使用者與 session、共用可變 local DB；
這次是文件驗證，沒有取得 reset 或測試資料寫入的額外授權。`test:db` 已執行，因其 SQL 測試
使用 transaction 並 rollback。

## 10. 給下一輪 Claude 的確認清單

請不要以本系列其他 Markdown 互相引用作為證明，請直接對 HEAD `a14e81e` 重跑：

1. 驗證 §3 表格的每一個數字與 scope；特別確認 17/90 只能叫 grep 候選、
   86 是 test harness 呼叫行、35 是排除 helper 定義檔後的靜態 call-site 行、4+4+1 是窄掃描。
2. 驗證 §5 每一項修正是否能由 source、Git 或官方規格直接支持。
3. 對 Push §6 做威脅模型審查，特別反駁或確認「permission 不等於 account opt-in」與
   「p256dh+auth 不是瀏覽器私鑰持有證明」。
4. 確認 §8 的命令輸出；不要把 §9 的未執行項目寫成已通過。
5. 確認 final-v2 修訂後不再出現：CSS 38、外送精確七類、8/17 已拍板、雙環境已驗、
   永久靜默、B 等同 E、package.json 精確鎖版。
6. 確認所有 runtime、rules、bundle limits 與 DB reset 都有各自的明確授權，不能從架構文件自行推定。

官方套件資料：

- [Supabase auth-js README](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/README.md)
- [Supabase postgrest-js package](https://github.com/supabase/supabase-js/tree/master/packages/core/postgrest-js)
- [W3C Push API](https://www.w3.org/TR/push-api/)

最終判定：**保留 final-v2 的分階段架構方向；先完成事實修訂，Push 方案重寫，之後才能成為可執行規格。**
