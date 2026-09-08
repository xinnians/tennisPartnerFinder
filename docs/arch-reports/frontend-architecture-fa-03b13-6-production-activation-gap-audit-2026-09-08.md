# FA-03B13.6 正式環境啟用缺口稽核

日期：2026-09-08

狀態：**完成；已重新查證 repo、Vercel 與 Supabase Hosted。沒有部署、改 Secret、發 Function request 或寫資料庫。**

## 白話結論

現在還不能打開 Push v2，而且不是只差一個開關。

最重要的新確認是：`qiuka.tw` 目前部署的是 commit
`a14e81ecf88fbdd87f7b7f77fe0ffcf4d22b6343`，建立於 2026-08-29 01:03:27 CST。這個 commit 是目前工作分支
`7110782` 的祖先，兩者相差 124 個 commit；它只有 legacy Push，沒有這段時間完成的 Push v2 default-off 程式。
所以「目前 production 前端和這個工作分支不同」是已查證的事實，不是推測，也不是未知 drift。

另外，Supabase Hosted 目前只有舊 dispatcher 與獨立 v2 canary；`push-subscription-v2` 和 `push-cleanup` Function 都不存在。
就算現在把 repo 的 `push-subscription-v2` 原封不動部署上去，它也會因 Hosted runtime 判斷固定回 503。正式啟用前，
必須先補齊 source gate、部署 default-off 版本、配置 key／endpoint／policy、完成 canary 證據，最後才切 UI 與 runtime。

## 本輪重新查到的外部現況

查證時間：2026-09-08 13:54 CST。

### Vercel production

- `qiuka.tw` 指向 `READY` production deployment `dpl_3ECR8B99FLp1Ht83LbmnwCLc4iRw`。
- Vercel metadata 的 GitHub commit 是
  `a14e81ecf88fbdd87f7b7f77fe0ffcf4d22b6343`，branch 是 `main`。
- 該 commit 在本機 repo 可解析，且是目前工作分支的 ancestor；`git rev-list` 實算相差 124 個 commit。
- 直接讀該 commit 的 tree，只找到 legacy `save_push_subscription`、`public/push-sw.js` 與
  `src/notificationPush.js`；找不到 production shell、Push v2 subscription／cleanup source 或 public-key build asset。
- Vercel production environment 目前只有 8 個既有前端變數名稱；有
  `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`，沒有 `PUSH_CLEANUP_PUBLIC_JWK_JSON`、
  `PUSH_SUBSCRIPTION_PUBLIC_JWK_JSON`、Push v2 mode 或 deadline 變數。只列名稱，沒有讀出 value。

### Supabase Hosted Function 與 source

| Function                                 | 目前狀態                         |
| ---------------------------------------- | -------------------------------- |
| `notification-outbox-dispatch`           | ACTIVE、version 41、JWT gate off |
| `notification-outbox-dispatch-v2-canary` | ACTIVE、version 25、JWT gate off |
| `push-subscription-v2`                   | 不存在                           |
| `push-cleanup`                           | 不存在                           |

- 重新下載兩支 Hosted Function 後，獨立 canary 的 10 個實際 source dependency 全部和 repo 逐 byte 相同。
- active dispatcher 的 `dispatch.js` 仍和 repo 相同；Hosted `index.ts` SHA-256 是
  `0d618f63deaf3d6042bfdc6f5468088ba5b92ce0a3084b33343496e392b246b6`，repo 是
  `37fd11a72d6d717d7b46fee44003c0d268b2af3b8e068f530be2c90df2ea04cb`。
- 這個已知差異是 repo 已加入 format-1 filter 與 local-only D2／D3A route，但尚未部署；Hosted 仍跑 legacy entry。
- Secret 名稱只有 6 個 canary 專用名稱、3 個 VAPID 名稱與既有 cron secret；通用 dispatcher、subscription v2、
  cleanup Secret 都不存在。本輪只讀名稱，沒有讀 value。

### Supabase Hosted DB aggregate

- migration：39 local／39 remote，最新皆為 `202609070001`。
- runtime control：exact 1 row、generation 1、dispatch enabled、mode disabled、legacy writes true、legacy handled false。
- worker／request／delivery duration 與 max attempts 尚未配置；TTL safety budget、legacy cutoff 也未配置。
- worker、canary profile、delivery、consent、endpoint registry、cleanup limiter bucket：全部 0。
- Push：4 total／4 legacy／0 v2。
- outbox：7 total／0 pending／7 format v1／0 format v2。

以上只查 aggregate，沒有讀 endpoint、Push key、payload、profile 或其他 row-level 敏感資料。

## Repo 目前的精確缺口

| 層級              | 已有                                                                        | 還缺什麼                                                                                                        |
| ----------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 登出              | default-off single-flight、AbortSignal 接縫、dormant cleanup coordinator    | caller-owned deadline 的可驗證數值、data-free telemetry、enabled config                                         |
| browser runtime   | lazy production shell、storage、subscription／cleanup transport、Auth proof | shell 仍 hard-coded disabled；沒有 production mode、兩個 endpoint、兩套 public key 與 owner RPC production 組裝 |
| UI                | 8-state v2 presentation 與 privacy 文案                                     | 三個「開啟推播」入口仍走 legacy `save_push_subscription`，沒有 v2 caller                                        |
| Service Worker    | `push`、`notificationclick`                                                 | 沒有 `pushsubscriptionchange`；訂閱換新後沒有前景 reconciliation 通知                                           |
| subscription Edge | local HTTP／Auth／DB 路徑已通過                                             | Hosted 判斷固定 unavailable；沒有 Hosted-compatible、default-off source gate                                    |
| cleanup Edge      | Hosted source trust 與 Postgres limiter canary 已驗證                       | Function／Secret／production limiter policy 都不存在，尚未正式部署                                              |
| dispatcher        | D1 DB barrier、D2 local source、D3A sender、獨立 Hosted canary              | active Hosted entry 仍是 legacy；repo compatible entry 未部署，Hosted active v2 route 也尚未建立                |
| DB runtime        | schema、commands、role 已 Hosted 套用                                       | mode disabled，所有時間／attempt policy null，沒有 canary profile 或 v2 row                                     |
| live web          | legacy production 穩定存在                                                  | 目前工作分支未合併／未部署；不能拿 repo build 當成 live build                                                   |

## 唯一啟用順序

以下順序是依現有 gate 的實際相依關係排列。前一步未通過，就不能跳到下一步。

1. **先完成 source-only default-off 能力**
   - 讓 `push-subscription-v2` 在 Hosted 只接受一個精確的 opt-in mode；缺設定、錯設定或 handler config 不完整都回 503。
   - 讓 active dispatcher 有 Hosted-compatible v2 entry，但預設仍走 legacy，且 format v1／v2 絕不互相處理。
   - 補 production config parser、owner RPC 組裝、caller-owned deadline port 與 data-free metric port；全部空值時必須保持 disabled。
   - 補 default-off v2 UI caller 與 `pushsubscriptionchange` reconciliation seam，不在 import／mount 時要求通知權限。

2. **部署純 default-off 基線**
   - 先把目前分支整合到可部署 branch，建立 preview，再確認 production build 對應的 exact commit。
   - 部署 compatible legacy dispatcher、disabled subscription Function、disabled cleanup Function。
   - 此時 browser、Edge、DB 三層都仍 disabled；既有 legacy Push 必須繼續可用。

3. **補齊設定，但先不開使用者流量**
   - 建立並核對兩套 RSA private/public key 對應，讓 Vercel 產出兩個 public-only JWK asset。
   - 核對 browser VAPID public key、dispatcher VAPID public/private key 的 fingerprint 一致。
   - 配置 exact same-project subscription／cleanup endpoint、server-only provider origins、dispatcher DB credential 與 cleanup limiter Secret。
   - 每項都先做 fail-closed probe；不能把 Secret value 寫進文件或 log。

4. **先建立 canary 與量測依據**
   - 用可回收的 canary profile／browser fixture 驗證 subscription → outbox → dispatcher → cleanup 完整鏈。
   - 只記錄 action count、固定 outcome code、ALLOW／LIMIT、latency bucket 與 failure rate，不記 token、endpoint、IP 或 payload。
   - 由實測決定 request deadline、worker／delivery lease、attempt、TTL safety budget 與 cleanup production limit；目前全部不填猜測值。

5. **小比例啟用，保留 legacy rollback**
   - DB mode 先進 canary；browser 只對核可的 canary 身分打開 v2。
   - 驗證 generation barrier、零交叉處理、登出不被 Push 卡住、subscription change 可恢復、所有失敗可回到 pending／legacy。
   - 證據達標後才擴大 rollout；每次只改一層 gate，保留可回復路徑。

6. **最後才做 legacy cutoff**
   - 再查 pending legacy outbox、legacy subscription、worker in-flight 與實際影響筆數。
   - 停止 legacy writes、處理剩餘資料與切 scheduler 必須是最後一批；不能和首次 v2 啟用綁在一起。

## 可以直接繼續與必須停下的界線

可以直接繼續的 source-only 工作：

- Hosted-compatible、預設關閉的 subscription／dispatcher runtime gate。
- 空設定即 disabled 的 browser config 與 composition seam。
- default-off UI／Service Worker reconciliation seam、unit／local Edge／browser tests。
- data-free metrics 介面與測試；尚未選 backend 或保存期限時不得假裝已有正式 telemetry。

執行前必須另外確認的外部動作：

- merge／push／Vercel preview 或 production deploy。
- Supabase Function deploy、Secret 新增／修改／刪除、Function request。
- Vercel environment 變數修改與 public-key asset 上線。
- runtime control／canary profile／fixture／policy DB write、真實測試通知。
- legacy cutoff、排程切換、資料清除或其他不可逆操作。

## 下一批

先做 `FA-03B13.6a`：只修改 `push-subscription-v2` 的 Hosted-compatible source gate 與測試。

本批不部署 Function、不建立 Secret、不發 request、不改 DB runtime mode。部署到 Hosted 後若沒有 exact opt-in mode 或完整
config，仍只能回 503；因此可以先把 source 補正，而不會冒充 production 已啟用。

## 本輪驗證方式

- `vercel inspect qiuka.tw --json`：確認 live deployment、target、狀態與部署 ID。
- `vercel ls tennis-partner-finder --json`：確認 production Git commit metadata。
- `vercel env ls production --json`：只取 env key 名稱。
- `supabase functions list --output json`：確認 Function 名稱／狀態／version／JWT gate。
- `supabase functions download ... --use-api`＋`diff`／SHA-256：確認 Hosted source 與 repo 差異。
- `supabase secrets list --output json`：只取 Secret 名稱。
- `supabase migration list --linked`：39／39。
- `supabase db query --linked`：只取 runtime 與資料筆數 aggregate。
- `git cat-file`／`merge-base`／`rev-list`／`git grep <deployed-commit>`：確認 live commit 和目前分支的實際關係。
- 工作區在建立本文件前為 clean。
