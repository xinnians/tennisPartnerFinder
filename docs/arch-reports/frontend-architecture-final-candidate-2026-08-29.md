# 前端架構最終候選方案

日期：2026-08-29<br>
狀態：**待 Claude 第四次驗證；尚未授權實作**<br>
用途：整合前三輪審查後，作為後續派工與決策的最新候選版本

## 文件優先順序

本文件是目前最新提案。下列文件保留作為證據、反證與修正歷史，不應刪除或覆蓋：

1. `frontend-architecture-review-2026-08-29.md`
2. `frontend-architecture-review-second-pass-2026-08-29.md`
3. `frontend-architecture-consolidated-plan-2026-08-29.md`
4. `frontend-architecture-third-pass-2026-08-29.md`

既有專案決策仍以以下文件為準：

- `docs/arch-roadmap-2026-08-26-react-ownership.md`
- `docs/migration-reports/batch-10.md`
- `docs/arch-reports/batch-5-synccommit-retention-2026-08-27.md`
- `docs/arch-reports/bundle-composition-2026-08-25.md`
- `.claude/rules/testing.md`
- `.claude/rules/react-migration.md`

若本文件與規則檔衝突，規則檔優先；本文件必須修訂後才能派工。

---

## 1. 最終摘要

專案不需要換成 Next.js，也不需要重新進行已完成的 React 頁面遷移。

最新工作順序應是：

```text
修復現存跨帳號推播風險
  → 防止 legacy 與雙重 ownership 繼續增生
  → 清除已確認的死碼與死契約
  → 建立 build+preview 與真實裝置效能基線
  → 正式決定 bundle 路線與預算
  → 移植結構 gate 與 wiring
  → 進行零依賴 server-state facade 實驗
  → 以 Chat + Messages 作為第一個完整 vertical slice
```

最終成功標準不是使用了新的框架，而是：

> 一項功能只有一條可追蹤的資料流，每個 DOM 子樹只有一個明確 owner，私人資料有完整生命週期，而且每建立一個新邊界，都伴隨一個舊 bridge 的實際退役。

---

## 2. 已完成，不應重新派工

### 2.1 React ownership

- 單一 React root
- Messages 頁面 React ownership
- Me 頁面 React ownership
- My Sessions 頁面 React ownership
- Nearby / Discovery Drawer React ownership
- SurfaceHost 對 portal、surface stack、backdrop、Escape、focus trap 與 focus restore 的 ownership
- 舊 page slot 機制退役
- 主要 Pages 與 Sheets 已改為 React 元件

上述「完成」只代表 UI ownership 已收斂，不代表 route ownership、server-state ownership 或 feature-first 目錄已完成。

### 2.2 TypeScript、ESLint 與 bundle 管線

- 批 6A–6F 核心 TypeScript 化已完成
- type-aware ESLint 恢復管線已完成
- `sheets.js` 已轉成 `sheets.ts`
- private repository 已動態載入
- Sentry 已依 DSN 條件載入並維持獨立 chunk
- production bundle、private repository 與 E2E hook gate 已存在

private repository 與 Sentry 的成果來自 bundle 管線，不應誤列成 React ownership roadmap 的驗收項目。

### 2.3 已結案的技術決策

- 不直接導入 `@layer`
- 不以現有兩個 `syncCommit` caller 歸零為短期目標
- token 定義已集中在 `src/session.css`
- 不為本次架構整理改成 Next.js

---

## 3. 最優先：跨帳號 Web Push 風險

### 3.1 現況

目前同一瀏覽器裝置存在以下流程：

```text
帳號 A 開啟推播
  → browser subscription endpoint 儲存於 A 的 profile
  → A 登出或瀏覽器切換到帳號 B
  → browser subscription 仍存在
  → DB 仍把 endpoint 視為 A 所有
  → A 的通知可能繼續顯示在該裝置
  → B 嘗試儲存同一 endpoint 時會遇到 PUSH_ENDPOINT_OWNERSHIP
```

已確認的原因：

- `handleSignOut()` 沒有移除 server subscription。
- UI 層沒有 `removePushSubscription()` caller。
- 前端沒有呼叫 `pushManager.unsubscribe()`。
- dispatch 只有在 Push Service 回傳 404／410 時才移除 endpoint。
- `save_push_subscription` 不允許另一個 profile 接管既有 endpoint。
- `remove_push_subscription` 只能刪除目前登入 profile 自己的 endpoint。
- browser `getSubscription()` 會回傳現存 subscription，不會自動建立新 endpoint。

### 3.2 實際外洩範圍

通知可能包含：

- 球場名稱
- 開始時間
- 缺額
- 球局深連結
- 固定事件文案

聊天訊息正文不進 payload；chat event 使用固定字串「群組有新訊息」。

這仍屬私人活動軌跡外洩，不能因沒有聊天正文而降級成一般架構債。

### 3.3 修復不能只處理登出按鈕

登出前依序 best-effort 執行：

1. `removePushSubscription(endpoint)`
2. `subscription.unsubscribe()`
3. `signOut()`

只能縮小明確登出時的風險，無法完整涵蓋：

- OAuth callback 直接形成新 identity
- session 被外部更新
- 多分頁帳號狀態變更
- 沒有按登出就切換帳號
- server row 已屬於舊帳號，但新帳號只能看到現有 browser subscription

因此完整方案必須同時設計：

- auth identity change 時的 subscription reconciliation
- endpoint 的安全重新歸屬或撤銷流程
- 登入後 permission 已 granted、但 browser subscription 不存在時的自動重訂
- DB/RPC migration 是否需要支援裝置 endpoint handoff
- 多帳號、多分頁與 OAuth return 的測試矩陣

### 3.4 修復原則

- endpoint 與 push keys 視為敏感資料，不進 log。
- server handoff 不得只相信任意傳入的 endpoint 字串。
- 需要定義「目前瀏覽器持有 subscription」能否作為接管證明，以及其威脅模型。
- sign-out cleanup 失敗不應阻止使用者登出，但必須留下可重試策略。
- auto-resubscribe 必須在使用者已授權的前提下進行，不重新跳 permission prompt。
- 修復不得讓同一 endpoint 同時屬於兩個 profile。

### 3.5 階段 -1 驗收

至少驗證：

- A 開啟推播 → 登出 → A 的 server row 被移除
- A 開啟推播 → 登出 → browser subscription 被解除
- A 登出後重新登入 A → permission granted 時可恢復 subscription
- A → B 帳號切換 → B 不會收到 A 的通知
- A → B 帳號切換 → endpoint 不會卡在無法接管狀態
- 多分頁 identity change
- OAuth callback identity change
- remove server row 失敗時仍可安全登出
- unsubscribe 失敗時仍可安全登出
- 404／410 stale cleanup 仍正常
- payload 不包含聊天正文、LINE、profile ID 或 raw GPS

這一批涉及 runtime、Auth 與可能的 migration，必須先出獨立派工單並取得核可。

---

## 4. Ownership 的最終原則

### 4.1 每個 DOM 子樹一個 owner

不再使用「所有 DOM 都由 React 建立」作為目標。

合理分工：

- React 擁有 App Shell、頁面、Sheets、Dialogs 與 integration 外層。
- Google Maps SDK 擁有 `#map` 內部節點與 marker DOM。
- browser adapters 擁有 Geolocation、Web Push、OAuth 與 Sentry lifecycle。
- React 外持久 live region 可保留，但必須明確列名並有不得重建的測試。

### 4.2 現存 aria-live 節點需實名管理

目前主要節點：

| 節點 | Owner |
| --- | --- |
| `#player-layer-status` | React 外持久節點 |
| `#map-data-status` | React 外；目前內容仍由 legacy renderer 更新 |
| `#nearby-sessions-count-status` | React 外；原地更新 textContent |
| `#toast-root` | 容器在 React 外，內容由 React portal 擁有 |
| `#my-sessions-badge-status` | React 內 |

階段 0 必須補：

- React 外 live region 不得被 replace/recreate 的測試
- owner 與更新方式的 manifest
- 過期註解修正

### 4.3 應消除的雙重 ownership

- React portal 產生節點，`main.js` 卻替同一容器處理 UI event delegation。
- React 元件 render 節點後，外部模組再寫 `disabled`、`hidden` 或 `textContent`。
- controller 同時決定 server flow、surface 名稱、transition、focus reason 與 view setter。
- top-level module side effect 負責其他 view 模組的 wiring。

---

## 5. 階段 0：三條 gate、一本帳與 aria-live 測試

### 5.1 Gate A：禁止新增 HTML renderer

同時掃描：

- `.innerHTML =`
- `insertAdjacentHTML`
- `outerHTML`
- `dangerouslySetInnerHTML`
- surface mount 的 `html:` 選項

不能只擋 `innerHTML`，否則會留下 SurfaceHost HTML shell 的後門。

既有路徑以每檔計數或符號定位凍結，不使用容易因搬檔失效的固定行號 allowlist。

### 5.2 Gate B：禁止 controller 直接操作 DOM

掃描 `src/controller/` 與 `src/sessionController.ts`：

- `document`
- `window` 的 DOM 操作
- `querySelector`
- `innerHTML`
- `classList`
- `textContent`
- `createElement`

現況應為零，測試必須 assert 掃描集合非空，避免 glob 錯誤時空集合也通過。

### 5.3 Gate C：既有 syncCommit gate 加 canary

現有 gate 已限制 production caller 為：

- `src/sessionStore.ts`
- `src/app/SurfaceHost.tsx`

不建立重複 gate，只補三拍 canary：

1. 現況綠
2. 暫增第三個 caller 時紅
3. 還原後綠

### 5.4 Mutation 帳本

「React 節點外部 mutation」無法只靠文字掃描準確判定，因此改成凍結帳本：

- 每個檔案目前的 `textContent`、`hidden`、`disabled`、`classList`、attribute mutation 數量
- 每個例外的 owner 與理由
- 新增數量時必須更新帳本並經人工審核

帳本按檔案與 symbol 定位，不綁固定行號。

### 5.5 CSS import 順序 gate

固定 `src/main.js` 的 13 個 CSS import 順序。

驗收：

1. 現況綠
2. 交換任意兩個 import 時紅
3. 還原後綠

---

## 6. 階段 1：低風險清理

### 6.1 真零風險候選

- 刪除 `src/main.js` 的 dead preload 呼叫。
- `SurfaceSlot` 取消不必要的 export。
- 修正 `src/session.css` 的 token 註解。
- `ds-bundle/` 先標為唯讀快照。

`ds-bundle/` 是否刪除屬產品交付物決策，不由工程清理批自行決定。

### 6.2 需注意測試或格式的候選

- `PROFILE_PUBLIC_DISCLOSURE` 與 `sessionFormSheetRuntime` 仍有檔內 consumer，只能拿掉 `export`，不能刪 declaration。
- 刪除 13 個 presentation re-export 時，必須同批調整 `session-presentation-boundary.test.js`。
- 清理 `prettier-ignore` 後必須重新執行格式化並跑 `prettier:check`。
- CSS 順序 gate 是新增守門，不是死碼清理。

### 6.3 Preload 清理

目前登入 preload 與 intent preload 重疊。

候選策略：

- 移除 dead preload 呼叫。
- 登入後只保留小型 idle preload 集合。
- 桌面使用 pointerover/focusin。
- 手機使用 idle-time 或已知下一步預載，不依賴 hover。
- 優先預載 SessionDetail，而不是罕用 Report/Withdraw dialog。

preload 調整只改善網路競爭，不會增加 bundle gate 餘裕。

---

## 7. 階段 2：build+preview 與效能基線

### 7.1 先建立 Playwright preview project

現有 performance 測試跑 Vite dev server，不能代表 production chunk、hash path、preload 或壓縮行為。

需要新增：

```text
npm run build
npm run preview
Playwright preview project
```

同時修正匿名 private repository gate：

- 不再比對 dev server 的 `/src/.../privateDataRepository.ts` 路徑。
- 改以 production asset/chunk marker 判斷。
- 必須加入 positive control，證明掃描工具真的有看到 network requests/chunks。

### 7.2 基線情境

- 未登入首次進站
- 已登入首次進站
- OAuth callback 返回
- 手機 390px 慢網路
- 桌面正常網路
- 首次打開 SessionDetail
- 首次打開 Messages / Chat
- 首次打開 My Sessions
- 首次打開 Me

### 7.3 指標

- LCP
- INP 或可重現的 interaction latency
- Google Maps 可互動時間
- JS parse / execute
- request waterfall
- initial transfer gzip/brotli
- 登入後 preload 與 Maps/discovery/Sentry 的頻寬競爭
- lazy chunk 首次互動等待

---

## 8. 階段 3：Bundle ADR

### 8.1 現況 gate 餘裕

```text
主 chunk raw 餘裕：19,930 B
主 chunk gzip 餘裕：4,954 B
全部 JS raw 餘裕：8,400 B
全部 JS gzip 餘裕：1,435 B
Sentry chunk gzip 餘裕：1,277 B
MySessionsPage raw lazy 餘裕：1,524 B
MePage gzip lazy 餘裕：551 B
```

raw 最大與 gzip 最大由不同 lazy chunk 綁住，不能合稱單一「最大 lazy chunk」。

### 8.2 不得漏掉的非 byte gate

ADR 必須同時保留：

- output scan 非空
- output 總字元量下限
- demo identifiers 不進 production
- E2E hook 不進 production
- entry script 恰一個
- JS chunk 掃描集與 entry presence
- Sentry marker 不進 main
- Sentry 獨立 chunk 存在
- private repository marker 不進 main
- private repository chunk 恰一個

不能只比較 bytes。

### 8.3 候選方案

#### 方案 A：維持目前架構與 gate

不增加 runtime dependency，route/server-state 先用既有工具建立 facade。

#### 方案 B：延遲載入 auth client

目前 boot 會立即 restore auth 與註冊 auth state listener，因此「只在登入後載入 Auth」的前提不成立。

若要重開，必須重新設計：

- boot 時的 session restore
- PKCE callback
- auth state listener
- token refresh
- public discovery client

#### 方案 C：Supabase 未使用子套件替身

高風險，需要：

- 完整的 export/constructor 相容面
- Realtime `setAuth()` 相容
- production-equivalent Auth 執行測試
- refresh、sign-out 與 OAuth 驗證

不得只在 production build 套 alias，卻讓所有測試都跑真套件。

#### 方案 D：正式調整 bundle gate

調整前必須：

1. 先修改 `.claude/rules/react-migration.md:46` 的一票否決規則。
2. 明確記錄批准者。
3. 提供真實裝置 before/after。
4. 一次只為一個依賴調整。
5. 禁止預留未使用空間。
6. 設定年度 total gzip 成長上限。

建議公式候選：

```text
新上限 = 實際引入後的穩定基準
       + max(raw 4 KiB / gzip 1 KiB, 該類總量 1%)
```

年度 total gzip 累計成長超過 10% 時，下一次增加前必須先提出還債方案。

#### 方案 E：直接組合 auth-js + postgrest-js

初步探針顯示可能約節省：

```text
raw：約 96.5 KB
gzip：約 26.8 KB
brotli：約 22.2 KB
```

這只是獨立 esbuild 探針量級，ADR 前必須用同一環境與真實 Vite build 重測。

優點：

- 不需要為未使用 realtime/storage/functions 建立假模組。
- RPC 可集中經 PostgREST client。
- 可能釋放足夠空間評估 Router 或 Query。

風險：

- Auth 與 PostgREST token 注入需自行組裝。
- PKCE、detectSessionInUrl、refresh、sign-out 要全部重驗。
- 需自行管理兩個子套件的直接依賴與版本相容。
- 目前依賴由 supabase-js 精確鎖版，拆開後升級責任轉到專案。
- repository generic 與 local Supabase harness 需要調整。
- 此用法是否符合官方支援與長期升級策略尚未確認。

方案 E 應納入 ADR，但不能因節省量最大就直接選定。

### 8.4 ADR 決策欄位

- 真實 Vite raw/gzip/brotli
- 首屏與已登入首屏實測
- OAuth/PKCE/refresh/sign-out 風險
- production-equivalent test coverage
- 維護與升級成本
- 是否需要修改規則檔
- Router/Query 可用預算
- rollback 方法
- 批准者

---

## 9. 階段 4：結構 gate 與 wiring 移植

### 9.1 Manifest 化

把直接讀 `sessionViews.js` 字面的結構 gate 改為穩定 manifest/contract。

必須保留：

- lazy sheet 14 項名冊與 import identity
- lazy page 3 項名冊
- eager module 數量
- authenticated preload gate
- 單一 React root
- syncCommit caller 名冊
- surface unmount lifecycle
- close 時 content 先 unmount、shell 後 destroy
- 導覽 a11y
- Escape preventDefault/stopPropagation
- toast/live-region contract

以下隱私契約不在這兩支結構測試內，但不得因搬 gate 遺失：

- private repository 不進 main
- LINE 零 consumer
- demo identifiers 不進 production
- E2E hook 不進 production

### 9.2 Wiring 搬移

top-level 副作用實際包含：

- discovery surface configure
- session surface configure
- profile surface configure
- form surface configure
- pointerover/focusin preload listener

正確 owner 是 `main.js` composition root 或專用 wiring 模組，不是 React render 內的 `AppServicesProvider`。

建議順序：

```text
先改 gate
  → 抽共用 surface loader 底座
  → 原子搬 discovery/session/profile/form configure
  → 搬 preload listener 與 configureSessionViewModules
  → 最後才評估 facade 退役
```

固定驗收順序：

```text
新 gate 綠 → 新 wiring 綠 → 舊 bridge 刪除 → 舊 gate 退役或降級
```

---

## 10. 階段 5：零依賴 server-state facade 實驗

### 10.1 候選：blockedPlayers

選擇理由不是「只有一個寫入者」或「跨頁面共用」；這兩點已被第三輪推翻。

修正後的理由：

- 有單一主要載入者。
- 有必要的帳號切換清除路徑。
- payload/status/error 是相對乾淨的一對一三聯欄。
- 不碰 Maps、GPS、route 或 surface stack。

### 10.2 實驗目標

建立 feature-level facade，明確區分：

```text
load()
refresh()
clearForAccountChange()
getSnapshot()/subscribe()
```

重點是證明「載入」與「隱私清除」能由不同 API 表達，不再全部退化成 controller `setState()`。

### 10.3 驗收

- `SessionControllerState` 移除 blockedPlayers payload/status/error 三欄。
- `mySessionsController` 對這三欄的直接 `setState` 歸零。
- auth account switch 明確呼叫 `clearForAccountChange()`。
- MePage 行為與錯誤狀態不變。
- 上一帳號資料在切換後不可讀。
- 不新增 runtime dependency。
- 不改 route。
- 不改 Supabase data API/RLS/RPC。

如果這個實驗無法在不增加複雜度的情況下完成，就應停止擴大 server-state facade，而不是直接改用 Query library 掩蓋問題。

---

## 11. 階段 6：第一個 vertical slice——Chat + Messages

### 11.1 為什麼選它

- UI ownership 已完成，因此只需處理 route、server-state 與 wiring。
- 有完整 Messages route。
- chat feed 沒有第二個資料 consumer。
- controller open/surface/transition 相對較少。
- Chat 與 Messages lazy chunk 餘裕相對充足。
- 對 `sessionViews` 的測試耦合低於其他主要候選。

UI ownership 已完成不是排除理由，反而能降低本次 slice 的變數數量。

### 11.2 動工前置

1. 將 `chatController.ts` 對 `context.session.unreadMessageCount` 的原地 mutation 改成上游顯式 command。
2. 明確排除共用 `ReportDialog`，不在本 slice 搬遷。
3. 複驗第三輪比較表中的 production caller、surface、transition 與測試數量。
4. 盤點 chat quiet/loud polling、visibility change、已讀 cursor 與 archived state。
5. 盤點 auth identity/gate 變更時 chat surface 關閉流程。

### 11.3 建議拆成兩小批

#### 6A：server-state 與 unread command

- chat feed lifecycle 有單一 facade/hook。
- unread reset 改成上游 command。
- 保留 polling、staleness、mark-read 與 account switch 行為。
- 不改 route。

#### 6B：route ownership 與 wiring

- Messages route 成為單一 source。
- back/forward 與焦點回復不再由多處共同控制。
- 移除該 slice 的 controller → surface 實作選擇。
- 刪除對應 facade/bridge。

若 bundle ADR 尚未允許 Router，可以先建立內部 route contract，不必為了使用套件而阻塞 6A。

### 11.4 驗收

- `#tab-messages` deep link
- browser back/forward
- 未登入 → 登入 → 返回 Messages
- account switch 清除上一帳號 chat state
- stale polling response 不落地
- archived session 唯讀
- unread reset 正確通知 My Sessions / Bottom Navigation
- chat message body 不進 push payload
- report flow 仍由既有共用 dialog 處理
- mobile/desktop lazy loading
- focus restore、Escape 與 aria-live 不退步
- 對應 legacy bridge 有實際刪除

---

## 12. State 分類的修正版

27 個 store 欄位可用六類盤點，但不能假設每欄只有一種身分。

### 12.1 主要分類

| 類別 | 內容 |
| --- | --- |
| 遠端 payload | sessions、mySessions、mySessionRosters、blockedPlayers、players、profile、courts |
| 衛星狀態 | discovery、mySessions、blockedPlayers、playerLayer 的 status/error/message，加上 courtsReady |
| orchestration | authEpoch、authSession |
| UI / query input | filters、drawerState、playerLayerOn、bounds |
| browser integration | userLocation、locationBlocked、locationMessage、mapUnavailable |
| 授權/本地投影 | profileEligibility |

### 12.2 特殊欄位

- `profileEligibility` 是物化的授權投影，包含刻意的 optimistic patch，不能直接改成純 selector。
- `filters` 是前端過濾條件，不是 server query key；真正進查詢範圍的是 `bounds`。
- `discoveryMessage` 有寫入但無 consumer，應先確認後刪除，不要搬進新 facade。
- `authEpoch` 同時服務 identity、profile gate、in-flight cancellation 與 pending action reset。
- `courtsReady` 與 store 外的 `courtCatalogueStatus` 必須一起評估。
- sessions/mySessions 落地後會同步 reconcile active detail/chat，不能只搬 payload 而漏掉 surface authority 規則。

另外需盤點 store 外狀態，例如：

- `courtCatalogueStatus`
- `profileLoadStatus`
- chat sheet local messages
- join preview
- notification preferences

---

## 13. CSS 暫定規則

- 維持現有 13 檔 import 次序。
- token 只在 `src/session.css` 定義；這同時是 contrast test 的載重前提。
- 不導入 `@layer`。
- 新 feature 使用既有 feature 前綴慣例。
- 不新增新的跨 feature selector；既有跨 feature 覆寫維持現狀。
- 需要共用視覺時，優先建立 shared vocabulary class，而不是跨 feature selector。
- 避免新增 ID selector。
- 不新增一般性 `!important`；`prefers-reduced-motion` 等必要全域覆寫可例外，但需附理由。
- responsive 規則只有在搬移後不翻轉同 specificity 勝負時，才放回 feature 鄰近檔案。
- 新增 `content-visibility` 或 `contain-intrinsic-size` 前，必須更新封閉集合測試並說明理由。

若未來導入 CSS Modules，先改寫依賴全域 class 字面的測試，不能先讓 gate 全部失效。

---

## 14. Query 或其他 cache 的隱私規則

若未來導入 Query/cache，必須遵守：

- raw `userLocation` 與精確 `bounds` 不得出現在 query key、mutation variables、error context 或 log。
- 需要位置 scope 時只能使用不可逆的粗粒度代號。
- access token 不得進 history state、URL、query key 或任何可序列化結構。
- 不得使用 private cache persister。
- production 不得包含 Query Devtools。
- account identity change 時必須 remove 私人 cache，不能只 invalidate。
- query key 必須區分帳號與資料 scope。
- authEpoch 不直接整個塞進所有 query key，需先拆 identity 與 gate 語意。
- mutation 完成後仍需驗證 live identity 與 profile gate。
- raw Supabase table 仍不得由 UI 直接查詢。
- cache 不取代 push subscription、Service Worker 或 browser history 的隱私盤點。

另需修正現況：`sessionIdentity()` 不應以 `access_token` 作 fallback 寫入 `history.state`。正常 session 應使用 user ID；缺少安全 identity 時應使用 null 或非敏感 generation token。

---

## 15. 驗收規則

### 15.1 所有 runtime 批共同必跑

依 `.claude/rules/testing.md`：只要修改 `src/` runtime，就不得豁免 `npm run test:local`。

共同入口：

```text
node scripts/generate-courts-seed.mjs --check
npm run typecheck
npm run lint
npm run prettier:check
npm run test:mock
npm run test:local
npm run build
npm run check:production-bundle
git diff --check
```

可依批次補跑具名 Node/Playwright project，但不能用「相關測試」四字取代上述標準入口。

### 15.2 條件必跑

有 migration 時：

```text
npm run test:db
```

涉及 Auth、Supabase client、push、private cache 或 account switch 時：

```text
TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium
OAuth / PKCE / refresh / sign-out 驗證
雙帳號切換驗證
```

涉及 hosted 行為時，另依 release checklist 執行穩定 preview 驗證。

### 15.3 每批不變條件

- 不改未核可 UX、文案與隱私 allowlist。
- account switch 不留下私人 DOM、store、cache 或 push endpoint ownership。
- deep link、back/forward、focus restore 與 Escape 不退步。
- raw GPS、LINE、access token 不進可序列化或持久資料。
- bundle 有 before/after raw/gzip/brotli。
- lazy/private/Sentry chunk 邊界不退步。
- 新 gate 必須有 canary。
- 新架構有對應 legacy 刪除，或明確標示本批只是前置。

---

## 16. 不建議做的事

- 不重寫全案。
- 不重新搬已完成的 React page ownership。
- 不導入 `@layer`。
- 不直接刪除 `syncCommit`。
- 不只為消除 warning 提高 Vite warning limit。
- 不把 `manualChunks` 當作下載量改善。
- 不同時導入多個 Router/Query/state framework。
- 不在 production-only alias 缺少執行測試時替換 Supabase 子套件。
- 不因方案 E 省最多 bytes 就直接選定。
- 不讓 UI 直接查 raw Supabase table。
- 不把 Map SDK 內部 DOM 搬給 React。
- 不把 React 外 live region 搬入會重建的 subtree，除非有 AT 驗證。
- 不刪除白箱 gate，除非新 gate 已先證明涵蓋同一契約。
- 不先搬資料夾再尋找 owner。
- 不刪除 `ds-bundle/`，除非產品維護者確認它已無交付用途。

---

## 17. 請 Claude 第四次確認

請以 HEAD、規則檔、migration、production bundle 與測試為準，回答：

### 推播風險

1. §3 的跨帳號 Web Push 風險是否成立？請重新建立 A→B 的完整時序並嘗試反證。
2. 外洩內容範圍是否描述正確？是否還有其他 event payload 包含更敏感資料？
3. 登出 cleanup + 登入 auto-resubscribe 能解決哪些情境、不能解決哪些情境？
4. 是否必須新增 migration 支援 endpoint handoff？若是，如何避免只知道 endpoint 的攻擊者搶走所有權？
5. 多分頁、OAuth callback、token refresh 與 session replacement 的完整修復點應放在哪裡？
6. 階段 -1 應如何切批，才不會同時改 browser、Auth、RPC 與 dispatcher 而失去可驗證性？

### Gate 與 ownership

7. 階段 0 的三條 gate與 mutation 帳本是否可低誤報實作？
8. HTML renderer gate 的掃描面是否仍有後門？
9. aria-live 實名清單與 owner 是否準確？哪些節點真的需要「不得重建」？
10. controller DOM gate 的掃描集合與 allowlist 應如何定義？
11. CSS 順序 gate 與暫定規則是否符合既有 specificity 決策？

### 清理與量測

12. 階段 1 的每個候選是否準確？請區分刪除 declaration、只拿掉 export 與需改 gate 的項目。
13. Playwright preview project 能否重用現有 fixtures？需要哪些 production-only positive controls？
14. §7 的效能指標是否足以支持 bundle ADR？

### Bundle

15. §8 的 byte 餘裕與非 byte gate 是否完整、口徑一致？
16. 五個 bundle 方案是否完整？是否有更低風險方案？
17. 方案 E 的 Auth token 注入、PKCE、refresh 與型別組裝能否做出最小 PoC？
18. 方案 E 使用 auth-js/postgrest-js 是否屬官方可接受用法？版本升級責任如何管理？
19. 方案 D 修改 `.claude/rules/react-migration.md` 的批准流程是否還缺前置？
20. 建議的 byte 預算公式與年度 10% 上限是否合理？

### Server state 與第一個 slice

21. blockedPlayers 是否仍是最佳零依賴 facade 實驗？請再次盤點所有讀寫者。
22. `clearForAccountChange()` 是否足以守住跨帳號資料，或仍需 generation/epoch？
23. Chat + Messages 是否確實是最佳第一片？請重新複驗 caller、surface、transition、route、chunk 與測試數量。
24. unreadMessageCount 原地 mutation 應改成哪一個上游 command？由誰擁有？
25. 6A/6B 的切法能否避免一次改 route 與 server state？
26. 哪些 chat requestGate/authEpoch 語意不能被新 facade 取代？

### 隱私與驗收

27. §14 是否完整阻止 raw GPS、bounds、access token 與私人 cache 的序列化？
28. `sessionIdentity()` 的 access-token fallback 是否在任何正常或異常流程可被觸發？安全替代值是什麼？
29. §15 是否正確套用 `.claude/rules/testing.md`？是否有命令重複、缺漏或不可在一般批次執行？
30. 請標出本文件所有仍屬推論、量級估算或需要產品決策的句子，並提供最低成本複驗方式。

---

## 18. Claude 確認前的操作邊界

### 可做

- 只讀盤點
- 複驗推播風險
- 建立 threat model 與派工草案
- 建立不改 runtime 的測試/gate 草案
- 建立 preview performance 設計
- 建立 bundle ADR 與方案 E PoC 設計
- 盤點 blockedPlayers 與 Chat/Message callers

### 不可直接做

- 實作推播 migration 或 runtime 修復
- 修改 Auth boot、PKCE、refresh、sign-out
- 安裝 Router 或 Query dependency
- 修改 bundle gate 或規則檔
- 建立 production Supabase alias
- 改成 auth-js/postgrest-js 組合
- 刪除 `ds-bundle/`
- 導入 `@layer`
- 刪除 `syncCommit`
- 開始 Chat + Messages vertical slice

---

## 19. 最終候選管線

```text
階段 -1  跨帳號 Web Push 修復
階段 0   三條 gate＋mutation 帳本＋aria-live 持久性測試
階段 1   死碼／死 export／preload／CSS 順序清理
階段 2   build+preview Playwright＋真實效能基線
階段 3   Bundle ADR（A–E）
階段 4   結構 gate manifest 化＋wiring 移植
階段 5   blockedPlayers 零依賴 server-state facade
階段 6A  Chat server-state＋unread command
階段 6B  Messages route ownership＋bridge 退役
```

每個階段都必須能單獨驗收與回滾；任何階段若無法證明複雜度下降，就不得只因 roadmap 已排定而繼續擴大。
