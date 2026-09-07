# 前端架構開發進度

最後更新：2026-09-08

這是前端架構開發的**單一進度入口**。新的 session 應先讀本文件，再讀
`frontend-architecture-final-v3-2026-08-31.md`；舊的審查報告只作歷史紀錄，不直接代表目前狀態。
最新 Hosted migration 套用前後證據在
`frontend-architecture-fa-03-hosted-migration-preflight-2026-09-04.md` 與
`frontend-architecture-fa-03-hosted-migration-apply-2026-09-04.md`。
Cleanup canary 的平台 raw-IP log 限制與建議步驟在
`frontend-architecture-fa-03-cleanup-canary-preflight-2026-09-04.md`；已完成的 C0 證據在
`frontend-architecture-fa-03-cleanup-c0-2026-09-04.md`；C1 scope 與未通過／完整復原證據分別在
`frontend-architecture-fa-03-cleanup-c1-preflight-2026-09-04.md`、
`frontend-architecture-fa-03-cleanup-c1-result-2026-09-04.md`；本機 stage diagnostic 與 Hosted 重驗待核可範圍在
`frontend-architecture-fa-03-cleanup-c1-diagnostic-preflight-2026-09-04.md`，重驗結果在
`frontend-architecture-fa-03-cleanup-c1-diagnostic-result-2026-09-04.md`；source substage 最小重驗範圍在
`frontend-architecture-fa-03-cleanup-c1-source-substage-preflight-2026-09-04.md`。目前 B12 local composition 的最新
批次證據在 `frontend-architecture-fa-03b12-manual-reenable-coordinator-2026-09-04.md`；最新 storage 前置證據在
`frontend-architecture-fa-03b12-provisioning-cancel-storage-2026-09-04.md` 與
`frontend-architecture-fa-03b12-refresh-commit-storage-2026-09-04.md`。browser provider-policy 契約衝突與選項在
`frontend-architecture-fa-03b12-browser-provider-policy-decision-2026-09-04.md`；不依賴該選項的 coordinator core 證據在
`frontend-architecture-fa-03b12-policy-neutral-subscription-coordinator-2026-09-04.md`，browser acquisition port 證據在
`frontend-architecture-fa-03b12-browser-subscription-port-2026-09-04.md`。使用者選擇 A 後的 v1.3 契約與 B11.1
provider-policy 拆分證據在 `frontend-architecture-fa-03b11-provider-policy-split-2026-09-06.md`；最新 dormant browser
encrypted HTTP transport 證據在
`frontend-architecture-fa-03b12-encrypted-subscription-transport-2026-09-06.md`；最新 local composition 證據在
`frontend-architecture-fa-03b12-local-subscription-composition-2026-09-06.md`；最新 local-only Edge HTTP／Auth／DB
composition 證據在 `frontend-architecture-fa-03b12-edge-handler-local-2026-09-07.md`。
最新 browser → real local Edge → Auth／DB／IndexedDB composition 證據在
`frontend-architecture-fa-03b12-browser-edge-local-2026-09-07.md`。
最新 production wiring 唯讀盤點在
`frontend-architecture-fa-03b13-production-wiring-preflight-2026-09-07.md`。
最新 Auth proof adapter 實作與競態證據在
`frontend-architecture-fa-03b13-auth-proof-adapter-2026-09-07.md`。
最新 default-off production composition 證據在
`frontend-architecture-fa-03b13-default-off-composition-2026-09-07.md`。
最新 UI／隱私狀態盤點與待確認項目在
`frontend-architecture-fa-03b13-ui-privacy-preflight-2026-09-07.md`。
最新 dispatcher generation／canary barrier 唯讀盤點在
`frontend-architecture-fa-03-dispatcher-barrier-preflight-2026-09-07.md`。
最新 dispatcher dormant egress core 證據在
`frontend-architecture-fa-03-dispatcher-d0-egress-core-2026-09-07.md`。
最新 dispatcher dormant outcome／local Edge transport canary 證據在
`frontend-architecture-fa-03-dispatcher-d0-outcome-canary-2026-09-07.md`。
最新 dispatcher D1 dormant database barrier 證據在
`frontend-architecture-fa-03-dispatcher-d1-database-barrier-2026-09-07.md`。
最新 dispatcher D2 compatible source 與真實 local Edge／DB／mock composition 證據在
`frontend-architecture-fa-03-dispatcher-d2-compatible-source-2026-09-07.md`。
最新 dispatcher D3A Deno-native sender／獨立 manual canary source 證據在
`frontend-architecture-fa-03-dispatcher-d3a-deno-sender-2026-09-07.md`；Hosted 分段操作界線在
`frontend-architecture-fa-03-dispatcher-d3-hosted-canary-preflight-2026-09-07.md`；D1 Hosted migration 套用結果在
`frontend-architecture-fa-03-dispatcher-d1-hosted-apply-2026-09-07.md`；canary Secret 隔離證據在
`frontend-architecture-fa-03-dispatcher-d3b-canary-secret-isolation-2026-09-07.md`；Hosted canary 執行環境與 no-write probe
結果在 `frontend-architecture-fa-03-dispatcher-d3-hosted-environment-result-2026-09-07.md`。FA-04 phase 0a
結構 gate 證據在 `frontend-architecture-fa-04-phase-0a-structure-gates-2026-09-07.md`；phase 0b ownership 基線在
`frontend-architecture-fa-04-phase-0b-ownership-baseline-2026-09-07.md`；最新 FA-05 phase 1 低風險清理證據在
`frontend-architecture-fa-05-phase-1-low-risk-cleanup-2026-09-07.md`；phase 2 production preview 與效能基線在
`frontend-architecture-fa-05-phase-2-production-preview-baseline-2026-09-07.md`；phase 3 Bundle ADR 在
`frontend-architecture-fa-05-phase-3-bundle-adr-2026-09-07.md`。最新 FA-06 階段 4 wiring 唯讀盤點在
`frontend-architecture-fa-06-stage-4-wiring-preflight-2026-09-07.md`；最新 tests-only gate manifest 化證據在
`frontend-architecture-fa-06-stage-4-1-manifest-gates-2026-09-07.md`；最新共用 loader 拆分證據在
`frontend-architecture-fa-06-stage-4-2-surface-loaders-2026-09-07.md`；最新 configure wiring 拆分證據在
`frontend-architecture-fa-06-stage-4-3-session-view-wiring-2026-09-07.md`；最新 app-module／preload wiring 證據在
`frontend-architecture-fa-06-stage-4-4-app-module-preload-wiring-2026-09-07.md`；最新 facade 退役評估在
`frontend-architecture-fa-06-stage-4-5-facade-evaluation-2026-09-07.md`；完整退役證據在
`frontend-architecture-fa-06-stage-4-6-facade-retirement-2026-09-07.md`；最新 blockedPlayers facade 唯讀盤點在
`frontend-architecture-fa-06-stage-5-blocked-players-preflight-2026-09-07.md`；Stage 5.1 的 facade 實作與競態證據在
`frontend-architecture-fa-06-stage-5-1-blocked-players-facade-2026-09-07.md`；最新 Stage 6 Chat／Messages 唯讀盤點在
`frontend-architecture-fa-06-stage-6-chat-messages-preflight-2026-09-07.md`；最新 Stage 6.0 immutable unread command
證據在 `frontend-architecture-fa-06-stage-6-0-unread-command-2026-09-07.md`；最新 Stage 6A Chat feed owner 證據在
`frontend-architecture-fa-06-stage-6a-chat-feed-owner-2026-09-07.md`；最新 Stage 6B.1 Messages 專用 selector 與
App services bridge 退役證據在
`frontend-architecture-fa-06-stage-6b1-messages-selector-2026-09-07.md`；最新 Stage 6B.2 page-route owner 證據在
`frontend-architecture-fa-06-stage-6b2-page-route-owner-2026-09-07.md`；Stage 6B.3 Chat surface 邊界盤點在
`frontend-architecture-fa-06-stage-6b3-chat-surface-preflight-2026-09-08.md`；最新 Stage 6B.4 React 單一 UI owner 證據在
`frontend-architecture-fa-06-stage-6b4-chat-react-owner-2026-09-08.md`；最新 Stage 6B.5 app wiring 與第一個 vertical
slice 完成證據在 `frontend-architecture-fa-06-stage-6b5-chat-app-wiring-2026-09-08.md`；post-FA-06 completion audit 在
`frontend-architecture-post-fa-06-completion-audit-2026-09-08.md`；最新 `ds-bundle/` 全量差異、18 次 render 與同步切法在
`frontend-architecture-ds-bundle-preflight-2026-09-08.md`。

## 目前狀態

| 項目                    | 狀態                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 工作分支                | `codex/frontend-architecture-execution`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 開發基準                | `51dde9c`（16 份前端架構審查文件首次入版）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 目前批次                | `ds-bundle/` 全量 preflight 完成：9 張現有卡片可渲染，但 CSS／文件／索引／source reference 有已證實 drift；下一批先做 deterministic CSS mirror 與 drift gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 整體狀態                | `FA-00`、`FA-01`、`FA-02` 完成；FA-03 preflight、`FA-03A0`～`FA-03A4`、`FA-03B0`～`FA-03B11.1`、`FA-03B12.1`～`FA-03B12.9`、`FA-03B13` preflight／B13.1 Auth adapter／B13.2 disabled shell、dispatcher D0.1／D0.2／D1／D2／D3A local composition、cleanup limiter foundation、全部 39 份 Hosted migration 與獨立 Hosted canary 執行環境、`FA-04 phase 0a／0b`、`FA-05 phase 1／2／3`、`FA-06 stage 4` preflight／4.1～4.6、stage 5 preflight／5.1、stage 6 preflight／6.0／6A／6B.1～6B.5 已完成；第一個 vertical slice 完成；active D2／D3A source 尚未部署 Hosted，Hosted v2 runtime 未啟用                                                                                                                                                                                                                                          |
| runtime 變更            | Auth gate、current-device local sign-out、DB dormant command、本機 cleanup Edge、兩套獨立 public-key build boundary、dormant IndexedDB／cleanup transport／owner adapter／coordinator／Auth handoff／Push deactivation／manual re-enable coordinator／pre-network cancel／refresh commit／subscription browser／transport／local composition、dormant Push v2 validator／hybrid crypto／Edge ports、local-only Push v2 HTTP／Auth／DB handler、default-off app composition shell、dormant dispatcher egress／outcome core、local D1 DB barrier、local-only D2 Edge／DB／mock、D3A Deno-native sender、獨立 Hosted canary no-write probe、local-only cleanup limiter composition、Chat feed owner、Messages 專用資料邊界與 app-owned Chat surface wiring 已落地；Push 登出 server cleanup、v2 UI、SW、Hosted active dispatcher 尚未接線 |
| migration 變更          | 39 local／39 Hosted，最新皆為 `202609070001`；D1 套用後 role／commands／index／trigger、資料與 linked lint 驗證通過                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| bundle checker／CI 變更 | checker 已分成開發期 report 與 release enforce，並報 raw／gzip／Brotli；Brotli 無門檻。required CI 跑 production preview Chromium；WebKit preview 留在非阻擋 job                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 下一步                  | `ds-bundle` 批次 A：由 production 13 份 CSS 產生 deterministic bundle、加入 drift gate，並更新品牌／React／來源／實際檔案索引；Hosted C 真實 Push 與 B13.3 UI 仍分別等待產品確認                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

查實際 Git 狀態：

```bash
git status --short
git branch --show-current
git log --oneline --decorate -10
```

## 已確認決策

| ID  | 決策                                                                                                                                                                                                                                                                                                                                 | 實作狀態                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Push 同意採「帳號＋裝置」opt-in；換帳號必須重新同意                                                                                                                                                                                                                                                                                  | `FA-03A4` DB command 與 B12.9 browser-to-DB local composition 已完成；production wiring 尚未接線                                                                                                              |
| D2  | 一般登出只停止目前裝置的登入與推播；其他裝置不受影響                                                                                                                                                                                                                                                                                 | `FA-03B10.1` 已固定 production Auth local scope；`FA-03B10.2` 已完成 dormant capture／unsubscribe／reread 分類，production 與 server cleanup 尚未接線                                                         |
| D3  | Push cleanup 結果不明時採 durable quarantine；dispatcher 送出前重查狀態                                                                                                                                                                                                                                                              | quarantine DB／Edge foundation 與 A4 共用 residue helper 已完成；repo／local dispatcher 已完成送出前重查與 transaction lock，Hosted source 尚未部署                                                           |
| D4  | Q6-A 已取代原本無法由現有 stack 證明的精確界線：只承諾 DB transaction 持續有效時的 quarantine/send 排序；載入記憶體仍不算 handoff                                                                                                                                                                                                    | 已核可 current-stack 條件式邊界；殘餘斷線空檔需保留監控與測試                                                                                                                                                 |
| D5  | quarantine 的重新確認、保存期限與到期處理由 `FA-02` 提案後再核可；不先猜 30／90 天                                                                                                                                                                                                                                                   | Q1-A 已核可：不設日曆期限，只依 server provider 證據解除                                                                                                                                                      |
| D6  | session 缺少 `user.id` 時 fail-closed：視為無效、清私人狀態並要求重新登入                                                                                                                                                                                                                                                            | `FA-03B0` 已完成；controller 與 orchestration 都只接受非空 `user.id`                                                                                                                                          |
| D7  | `ds-bundle/` 與 `.design-sync/` 保留並持續使用於 UI/UX 優化                                                                                                                                                                                                                                                                          | 已決策；同步前仍需全量重驗，不能假設自動同步                                                                                                                                                                  |
| D8  | 開發期 bundle bytes 只報告、不阻擋 CI；demo／E2E hook／隱私與拆包邊界仍 hard fail                                                                                                                                                                                                                                                    | `FA-01` 已完成                                                                                                                                                                                                |
| D9  | 第一個 production release candidate 前，依 route、裝置、網路、gzip／Brotli 與 Web Vitals 基線重訂並啟用 hard byte limits                                                                                                                                                                                                             | 本機 production preview 基線已完成；正式裝置／網路／hosting 與 Web Vitals 基線仍待 release candidate                                                                                                          |
| D10 | 刪帳時清除 consent/device/token、transport、outbox/delivery/payload；只留 algorithm/hash/state/reason/version 的 ownerless deny registry row，時間欄清空                                                                                                                                                                             | `FA-03A3` dormant schema／真實 FK 測試完成；待 compatible runtime                                                                                                                                             |
| D11 | `update_session` 的通知相關欄位完全沒變時，不建立 `session_updated` Push                                                                                                                                                                                                                                                             | `FA-03A3` DB-owned source version 完成；待 compatible RPC                                                                                                                                                     |
| D12 | cleanup raw token 不直接送進 Edge invocation log 可見的 request body；採 application-layer RSA-OAEP-SHA256 隨機加密封包                                                                                                                                                                                                              | `FA-03B3` codec／key rotation／真實 Edge 解密與 DB 狀態轉換完成；browser 尚未接線                                                                                                                             |
| D13 | cleanup Edge 先採 local-only、預設關閉；完成 distributed limiter、hosted canary 與 hosted log 證據前，不得在 hosted 執行                                                                                                                                                                                                             | hard gate 仍在；C0 已完成並刪除；C1 dormant exact mode＋32-byte token gate 只能走 limiter，不讀 body／cleanup key／quarantine；Hosted diagnostic 已停在 `SOURCE` 並完整復原，正式 runtime 未啟用              |
| D14 | cleanup current public key 由 build-only public env 產生固定 same-origin v1 JSON，HTTP `no-store`；不綁進 `VITE_*` JS 常數                                                                                                                                                                                                           | `FA-03B4` generator／headers 與 `FA-03B6` dormant loader 已完成；目前未配置 key，production 尚無 caller                                                                                                       |
| D15 | browser 必須在 enable network 前先保存 logical device、binding 與 raw cleanup token；需要 cleanup 時先獨立提交本機 fail-closed，再用另一筆原子交易把 token 搬到 immutable pending attempt；壞資料或較新 DB version 不自動刪除／降版                                                                                                  | `FA-03B5` dormant storage boundary 已完成；production 零 caller                                                                                                                                               |
| D16 | dormant cleanup transport 每次明確呼叫最多送出 2 次 POST；只有第一個 response 完全符合 `503`＋exact `{"outcome":"RETRY"}` 與 URL／header 契約，才重新抓 key、重新加密並送第二次。其他錯誤、不明結果或第二次 `RETRY` 都保留 pending，不立即重送                                                                                       | `FA-03B6` 已完成；沒有自行猜 timeout、backoff 或跨呼叫重試次數，production 零 caller                                                                                                                          |
| D17 | dormant owner-quarantine adapter 每次有效呼叫只送 1 次既有 `quarantine_push_device` RPC；exact `OK` 才回 completed、exact `STALE_PUSH_DEVICE` 才回 stale，其餘回 pending。UUID／version 不合法時在 RPC 前 fail-closed                                                                                                                | `FA-03B7` 已完成；沒有 retry、timeout、backoff 或排程，production 零 caller                                                                                                                                   |
| D18 | dormant cleanup coordinator 每次只處理 caller 明確提供的一筆 attempt，最多呼叫 transport 一次；只有 exact `{kind: "completed"}` 才把原 attempt 交給 local completion 一次。local completion 回 primitive boolean（`true`／`false`）才回 completed，其餘或 throw 都回 pending；不掃描、不排程、不自行重試                             | `FA-03B8` 已完成；production 零 caller                                                                                                                                                                        |
| D19 | dormant Auth-failure handoff 只接受 exact `rejected`／`unavailable`、相符 `authUserId` 與 exact B5 safe binding CAS snapshot。`unavailable` 只做本機 `auth-unverified`；`rejected` 先交 B5 suspend／queue，再把 exact correlated attempt 交 B8 一次。invalid process input、contract drift、throw 或非 exact completion 一律 pending | 使用者核可先建立 `FA-03B9` dormant seam；production 零 caller，B1 可信 owner correlation 與 unavailable recovery 仍未完成                                                                                     |
| D20 | `auth_unavailable` 後即使 Auth 重新驗證成功也不自動恢復 Push；使用者必須再次明確啟用，先完成舊 binding cleanup，再建立新 binding、cleanup token 與 server consent epoch                                                                                                                                                              | 使用者於 2026-09-02 選 A；B12.1、B12.4、B12.5、B12.7.1～B12.9 已完成 local 順序、cancel、coordinator、browser acquisition、encrypted transport 與 browser-to-DB composition；production wiring 與 UI 尚未實作 |
| D21 | v2 enable／refresh 先凍結 canonical subscription、provider egress、Edge、DB CAS、Auth correlation 與測試契約；Claude 複核與使用者 migration 核可前不實作 schema／production wiring                                                                                                                                                   | 契約 v1.3 已凍結；A4 DB CAS、B11.1 policy split 與 B12.5～B12.9 local storage／browser／transport／Edge composition 已完成；production wiring 尚未開始                                                        |
| D22 | provider egress 採應用層充分條件：exact provider-origin allowlist＋send-time DNS public-IP 檢查即可進 enabled；平台 egress 層 allowlist 為 nice-to-have，殘餘風險為攻擊者需控制 provider DNS 解析結果                                                                                                                                | 使用者於 2026-09-02 拍板；B11.1 把 allowlist 保留在 server；D3A 已完成 local send-time DNS／IP pinning，Hosted B 已設定 canary-only provider policy，但真正 sender canary 尚未執行                            |
| D23 | Edge envelope 的 AES-GCM AAD 綁定已驗證 `authUserId`，並釘死 `encryptedKey`／`iv`／`keyId`／AES key 長度；不符即 `invalid`、不進 DB                                                                                                                                                                                                  | 使用者於 2026-09-02 拍板；B11 crypto canary、B12.8 local handler 與 B12.9 real browser-to-DB composition 已實測，production 未接線                                                                            |
| D24 | 不新增 local cleanup reason；手動重新啟用沿用既有 `subscription_changed`，避免 B5 validator 在前端回滾後把 push 子系統讀成 `invalid`                                                                                                                                                                                                 | 使用者於 2026-09-02 拍板；B12 local storage／coordinator 與 A4 server transition 已實作，production wiring 未接                                                                                               |
| D25 | consent 為 `enabled`、request binding 等於 stored binding、但完全沒有 transport 時，enable command 直接重建 transport（version +1，不旋轉 hash／epoch／binding）；refresh 同情境回 `stale`                                                                                                                                           | `FA-03A4` command 與 pgTAP 已實作；production caller 尚未接線                                                                                                                                                 |
| D26 | 本機 pgTAP 單一連線無法觸發真併發 deadlock；A4 以取鎖述句順序斷言（錨點非空＋兩個 canary 驗紅）與同 transaction 交錯呼叫收斂斷言替代；真併發與三個寫入階段搶插分支列入 dispatcher barrier 批並在 CI 加 `dblink`                                                                                                                      | A4 替代斷言與要求的 canary 已完成；真併發／`dblink` 仍明確留在 dispatcher barrier 批，未宣稱覆蓋                                                                                                              |
| D27 | Push v2 provider policy 不內建猜測的 production hostname；設定只接受 sorted／unique／non-empty canonical origin JSON，endpoint 名稱再依 IANA Special-Use registry fail-closed                                                                                                                                                        | B11.1 已拆分 browser／server policy；D3A local send-time DNS 已完成；Hosted B 設定前重查 4 筆皆為 exact FCM origin，僅寫入 canary-only Secret；正式 active 值仍未設定                                         |
| D28 | push-cleanup distributed limiter 採 Postgres 原子 token bucket，不新增外部 Redis 供應商；全域與來源兩層在同一 RPC 內固定順序鎖定，來源 IP 只以 Edge HMAC digest 進 DB；production 門檻沒有證據就不設定                                                                                                                               | schema、RPC、Edge fail-closed composition 與並行測試完成，migration 已套 Hosted；C1 建議值只作可推導的 canary fixture，不是 production policy，Hosted 尚未設定                                                |
| D29 | 13 份 FA-03 Hosted migration 獨立套用；本批只做 DB migration 與事後唯讀驗證，不綁 Edge deploy、env／secret、request 或 hard-gate 變更                                                                                                                                                                                                | 使用者於 2026-09-04 核可並完成；38 local／38 remote、資料／ACL／catalog／lint 驗證通過                                                                                                                        |
| D30 | Supabase 方案為 Free；接受平台保存 raw source-IP headers 1 天，並核可 C0 只暫時部署 hard-gated cleanup、送 2 次空 body POST、唯讀驗證後立即刪除                                                                                                                                                                                      | 使用者於 2026-09-04 確認；2 次 exact 503／RETRY、2 筆一致來源 header log、DB 零變動，Function 已刪除                                                                                                          |
| D31 | C1 核可 4 個臨時 secrets、單一 cleanup deploy、最多 1 未授權＋20 授權空 body POST、不重試、固定 rollback；不包含 production policy／cleanup／key／browser／privacy／hard-gate 移除                                                                                                                                                   | 使用者於 2026-09-04 選 A；實際 1 未授權符合、首筆授權缺 ALLOW marker即停，19 筆取消；Function／secrets／limiter 已復原，C1 未通過                                                                             |
| D32 | browser 不持有 Push provider origins；只驗 canonical endpoint 與 key 結構。Edge 解密後與 dispatcher send-time 才用 server-only exact allowlist 完整重驗                                                                                                                                                                              | 使用者於 2026-09-06 選 A；B11.1 shared API／雙預期 corpus、B12.8 local Edge 與 B12.9 browser-to-DB 重驗已完成；production graph／Hosted 未接                                                                  |
| D33 | Supabase local Edge 實測不會呼叫 Node `https.Agent.lookup`；dispatcher 的 Edge DNS pinning 改採 Deno 原生 resolve → public-IP 驗證 → connect exact IP → 原 hostname startTLS，同一 socket 不重用                                                                                                                                     | D0.2 transport canary 與 D3A encrypted sender 都在 local Edge 收到 HTTPS 204，並驗 actual remote IP；Hosted B 只完成 DB probe，真正 encrypted send canary 尚未做                                              |
| D34 | D2 direct DB client 採 exact `jsr:@db/postgres@0.19.5` 與 checked-out `PoolClient`；prepare、provider request、complete 必須在同一筆 transaction。只提供 local exact mode，不能使用 Hosted marker 或正式 mock transport                                                                                                              | active repo source 與真實 local Edge／DB／mock composition 已完成；Hosted B 已用同一 DB client 完成 role probe；active source／runtime control／dispatch 尚未執行                                             |
| D35 | Hosted dispatcher canary 使用獨立、預設 unavailable 的 Function 與 manual-run secret，不改現行 cron 或先部署 active dispatcher；token 本身不宣稱 cryptographic one-shot，request 數由核可操作流程限制                                                                                                                                | repo／local 與 Hosted B 已完成；只呼叫一次 no-write probe，active dispatcher／cron／runtime policy 未改，真正 dispatch request 仍需 C 階段確認                                                                |
| D36 | 本專案所有 migration 已取得持續授權，不必逐支再詢問；每次仍要先 dry-run、限制 exact scope、套用後驗證並記錄。這不包含 deploy、secret／credential、runtime control、request、資料清除或 legacy cutoff                                                                                                                                 | 使用者於 2026-09-07 授權、2026-09-08 再次確認所有 migration 都不必詢問；D1 migration 已依此套用，39／39、資料／catalog／lint／diff 驗證完成                                                                   |
| D37 | 獨立 Hosted canary 的 DB URL／generation／provider policy／transport 必須使用 canary-only Secret 名稱；只共享既有 VAPID，避免 active dispatcher 意外繼承 canary 設定                                                                                                                                                                 | D3B repo／local 與 Hosted B 完成；六個 canary-only 名稱存在，四個通用名稱不存在，active dispatcher 未繼承 canary 設定                                                                                         |
| D38 | Hosted canary request 必須明確指定 exact action；`database-probe` 只驗證專用 role 連線並回固定 ready，不建立 worker／不寫 DB／不送 Push；只有 `dispatch` 能進派送流程                                                                                                                                                                | D3C repo／local 與 Hosted B 完成；Hosted probe exact 200／ready，worker／delivery／v2 row 仍為 0，`dispatch` 未呼叫                                                                                           |
| D39 | Hosted B 只設定專用 role credential、六個 canary-only Secret、部署獨立 Function 並呼叫一次 no-write probe；失敗必須精確復原，不碰 active dispatcher／cron／runtime／使用者資料                                                                                                                                                       | 已完成；第一次本機 shell 中斷後完整復原，第二次成功；10 個 deployed source byte-identical，legacy bundle hash 不變                                                                                            |
| D40 | Bundle ADR 採 A：維持完整 Supabase client 與現有 facade；B／C／D 現階段不採。E 只有在正式效能證據成立時才做隔離 App-level PoC，且須另以 ADR 決定是否接受 runtime migration                                                                                                                                                           | `FA-05 phase 3` 已完成；沒有 dependency、runtime、gate 或 alias 變更                                                                                                                                          |

## 授權邊界

- 使用者已設定持續開發目標：依本文件逐批執行；migration 已有持續授權，不再逐支詢問。產品決策、deploy／
  secret／credential、runtime control、request、資料清除、legacy cutoff 或其他不可逆操作仍要停下確認。
- 已完成 `FA-00`、`FA-01`、`FA-02`；FA-02 Q1–Q10 已全部核可，可進行 FA-03 的唯讀
  preflight、可逆 expand、runtime 與測試。
- migration 已有持續授權，不再逐支詢問，但仍須先 dry-run 與事後驗證；不可逆資料 contract、deploy、secret、runtime
  control、request 或 legacy cutoff 前仍必須回報實際影響並另外確認。
- Dispatcher Hosted B 的 credential／六個 canary Secret／獨立 deploy／no-write probe 已依先前同意完成；這不會自動授權 C 的
  真實 Push、fixture 或 D 的 runtime／generation／cutoff。
- 不自行 push 遠端；每批以獨立 commit 保存。

## 批次總表

| 批次  | 內容                                                              | 狀態                                                                                                                                                                                                                                                                                                                                                                   | 完成條件                                                                                                                                                                                                  |
| ----- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FA-00 | 建立進度單一來源、回填已確認決策                                  | 完成                                                                                                                                                                                                                                                                                                                                                                   | 文件差異與 whitespace 檢查通過；無非文件變更                                                                                                                                                              |
| FA-01 | 文件／rules 對齊；bundle 結構 hard gate 與開發期 size report 分流 | 完成                                                                                                                                                                                                                                                                                                                                                                   | 非 byte 邊界仍可翻紅；bytes 可報告；release enforcement 路徑存在                                                                                                                                          |
| FA-02 | Push lifecycle、quarantine、consent、local sign-out 詳細設計      | 完成並核可                                                                                                                                                                                                                                                                                                                                                             | state machine、資料模型、到期方案、RPC／SW／dispatcher／測試矩陣完整；十項決策已記錄                                                                                                                      |
| FA-03 | Push runtime 與 migration                                         | preflight、`FA-03A0`～`FA-03A4`、`FA-03B0`～`FA-03B11.1`、`FA-03B12.1`～`FA-03B12.9`、`FA-03B13` preflight／B13.1／B13.2、dispatcher D0.1／D0.2／D1／D2／D3A、cleanup limiter foundation、39／39 Hosted migrations、cleanup C0、dormant C1 path、local stage diagnostic 與 source substage 完成；Hosted diagnostic 停在 `SOURCE` 且已復原；契約 v1.3；runtime disabled | expand、DB、browser-to-local-DB、雙帳號、dormant dispatcher core 與 local Edge canary tests 通過；UI／privacy、active dispatcher、source substage Hosted 重驗、production Edge 與不可逆 contract 另行確認 |
| FA-04 | DOM／ownership gates 與正式 ledger／browser manifest              | 完成（phase 0a／0b）                                                                                                                                                                                                                                                                                                                                                   | gate 有 canary；清單有明確 scope                                                                                                                                                                          |
| FA-05 | 低風險清理、production preview、效能基線、Bundle ADR              | 完成（phase 1／2／3）                                                                                                                                                                                                                                                                                                                                                  | before／after 可重現；未放寬未核可邊界                                                                                                                                                                    |
| FA-06 | `sessionViews` wiring、blockedPlayers、Chat／Messages ownership   | 階段 4 preflight／4.1～4.6、stage 5 preflight／5.1、Stage 6 preflight／6.0／6A／6B.1～6B.5 完成；第一個 vertical slice 完成                                                                                                                                                                                                                                            | 每個新 owner 都伴隨舊 bridge 刪除與完整回歸                                                                                                                                                               |

## FA-00 實際內容

已做：

- 建立 `codex/frontend-architecture-execution` 分支。
- 建立本進度文件。
- 將 D1–D9 與 fail-closed 決策回填 final-v3。
- 保留 final-v3 的技術事實／待驗項目區分。

未做：

- 未改應用程式、資料庫、Service Worker、Edge Function、測試、rules 或 CI。
- 未執行 runtime test suite；本批沒有 runtime 變更。
- 未把 quarantine 保存天數寫死。

本批驗證：

```text
文件非空與 code fence 成對
git diff --check
git diff --name-only（只允許本進度文件與 final-v3）
```

## FA-01 實際內容

已做：

- 保留原本 8 個 raw／gzip byte 數值，集中到 `scripts/productionBundlePolicy.mjs`，沒有調高門檻。
- `npm run check:production-bundle` 改為開發期 report：超過 bytes 會列出差額，但不因此失敗。
- 新增 `npm run check:production-bundle:release` 與明確的 `--enforce-byte-limits` 參數；相同超額在
  release 模式會合併列出並 hard fail，未知參數也會失敗。
- demo identifier、E2E hook、輸出完整性、private repository 與 Sentry 拆包仍是 hard gate。
- Sentry 特例不再靠 `sentry_version` 字串分類；checker 另跑 production `write:false` build，要求
  `src/sentryBrowserSdk.ts` 與全部 `@sentry` module 只存在同一 chunk、不得混入其他 app module，
  也不得再 import 其他 chunk，並核對該 chunk 與磁碟 `dist` 內容相同。原 marker 只保留作第二層檢查。
- 在既有 `tests/ci-config.test.js` 補 report／enforce、邊界相等、未知參數與 Sentry provenance canary；
  沒有新增未被聚合 script 收錄的孤立 test file。
- 對齊 `CLAUDE.md` 與三份 `.claude/rules/` 的真實路徑、命令、CI job、Playwright 範圍及 byte 政策。

刻意未做：

- 未修改 `.github/workflows/quality-gate.yml`；frontend CI 原本就會在 build 後呼叫預設 checker，
  因此現在自然取得 report 行為。
- 未修改 app runtime、migration、Service Worker、Edge Function、任何 byte 數值，也未加入 Brotli 門檻。
- 未 push 遠端。

實測 bundle 基線（production、32 files、508 modules）：

| 範圍                         | raw bytes | gzip bytes | 現有門檻 raw／gzip |
| ---------------------------- | --------: | ---------: | -----------------: |
| main                         |   638,937 |    187,466 |   658,867／192,420 |
| 最大一般 lazy（My Sessions） |    16,476 |      4,828 |      18,000／5,500 |
| Sentry                       |    87,975 |     29,723 |     90,000／31,000 |
| total JS                     |   841,561 |    257,627 |   849,961／259,062 |

本批驗證：

```text
node --test tests/ci-config.test.js：19 passed
npm run check:production-bundle：report mode，0 exceeded
npm run check:production-bundle:release：enforce mode，0 exceeded
npm run test:ci:frontend：通過；Playwright 298 passed / 4 skipped
wc -l CLAUDE.md：200
git diff --check：通過
```

補充：完整 CI 輸出曾出現 `WebSocket server error: Port 24678 is already in use` 警告，相關 unit
與整體聚合仍全部通過；本批沒有把這則警告誤寫成測試失敗，也沒有在未查因前宣稱已消失。

## FA-02 實際進度

設計文件：`frontend-architecture-fa-02-push-lifecycle-design-2026-08-31.md`

已完成：

- 逐檔核對 Push browser helper、auth、feature、RPC、migration、RLS、Service Worker、dispatcher、
  scheduler 與現有測試；另以本機 catalog 核對 schema／grant／cron。
- 確認目前沒有 account＋device consent、quarantine、disable、logout cleanup、subscription refresh，
  且一般 logout 仍使用 auth-js 預設 global scope。
- 確認 dispatcher 先取 subscription snapshot、只有 attempts CAS、沒有 lease；重疊 worker 可再次 claim，
  而多裝置任一成功會讓其他暫時失敗的裝置失去重試。
- 設計 consent、endpoint registry、active transport 三層資料模型，避免替 legacy row 偽造 device；另有
  server-first logout、cleanup-only token、RPC-only mutation、per-device delivery 與完整測試矩陣。
- 查明只做 send 前 SELECT 仍有 race；DB lock 只能提供有前提的排序，不能與外部 Push service
  形成共同 transaction，也不能把 request invoked 寫成 service accepted。
- 依 W3C 規格確認 expiration 可為 null、未知 timeout 不是 deactivation 證據，因此沒有虛構
  30／90 天的安全期限。
- 確認現行 web-push 預設 TTL 四週、沒有明確 socket timeout；endpoint 也只有長度檢查，形成
  authenticated-controlled outbound／SSRF boundary，已納入 FA-03 設計與測試。
- 經三個獨立唯讀 reviewer 反覆核對，補正 unsubscribe 只能算 client attestation、遠端 revoke 的
  client-detection 窗口、fan-out／quarantine lock ordering、legacy RPC shim、delivery state、event deadline
  matrix，以及 fingerprint identity 必須和 egress policy 分離。
- 所有新建 outbox 都要求非空 `expires_at`；Q8 只決定 Push service TTL。現況只有兩種 reminder 可由
  文案／query 確認截止語意，其餘 8 種的完整 deadline＋domain invalidation matrix 已列為 Q10-B
  新產品政策，沒有把操作窗口冒充成既有通知規則。
- reminder 改用從 1 起算的 DB schedule version；legacy outbox 的 0 只作 sentinel，避免改期後被舊
  cancelled row 永久擋住。prefs／block／court subscription 的 absent-row race 也有共用 transaction
  advisory guard 與固定 lock order。
- endpoint owner lock 採 exact UTF-8 SHA-256；另以 frozen canonical policy 擋 URL alias。hosted preflight
  只要發現 non-canonical／parse-fail／owner conflict，就停止不可逆擦除並回報，不假設 production 為零。

FA-02 結案當時尚未做（後續 hosted 盤點見 FA-03）：

- 沒有修改 runtime、migration、generated types、Edge Function、Service Worker 或測試。
- 沒有查證 hosted production row 數、grant、cron、Edge env 或 provider 行為；這些是 FA-03
  migration 前的只讀 preflight。
- 沒有執行不可逆的 legacy key 擦除或 pending outbox 取消。

已核可的實作選項：

| 題目 | 選項 | 已固定的行為                                                                                  |
| ---- | ---- | --------------------------------------------------------------------------------------------- |
| Q1   | A    | owner-linked quarantine 不以天數自動釋放，只接受 server provider 證據                         |
| Q2   | A    | 同帳號、同 logical device 也要由使用者手動恢復 Push                                           |
| Q3   | A    | event 建立時固定 recipient 與 logical device                                                  |
| Q4   | A    | canonical preflight 零例外才可隔離 legacy row 並擦除 raw send material；任何例外停止 contract |
| Q5   | A    | UTC cutoff 前 pending legacy outbox 全部取消，保留稽核狀態                                    |
| Q6   | A    | 採 current-stack 條件式 D4 邊界，明列並監控極小未觀察斷線空檔                                 |
| Q7   | A    | 刪帳後保留 ownerless deny fingerprint，只有 server provider 證據可解除                        |
| Q8   | A    | TTL 用 DB remaining deadline 減 verified safety budget；未知 budget 時為 0                    |
| Q9   | A    | app boot 強制 Auth refresh；拒絕時 quarantine，離線／timeout 時 local fail-closed             |
| Q10  | B    | 啟用完整 10-event expiry matrix 與 domain invalidation 規則                                   |

FA-02 結案時實測：

```text
notification data／Push／dispatcher Node tests：13 passed（8 個直接屬 Push／dispatcher）
npm run test:db：804 tests，802 passed / 2 failed
```

DB 的兩個失敗已定位為 reminder fixture 使用全庫總數，被本機既有 candidate session 多算；不是
FA-02 程式變更造成。此測試問題已由下方 `FA-03A0` 修正。

## FA-03 pre-expand 唯讀盤點

詳細報告：`frontend-architecture-fa-03-push-preflight-2026-08-31.md`
去敏證據：`frontend-architecture-fa-03-push-preflight-evidence-2026-08-31.md`

已完成且沒有 hosted 寫入：

- local／remote 25 個 migration 全對齊；PostgreSQL `17.6`、UTF-8。
- strict pg-delta 確認 `public/private` 沒有 structural DDL drift；差異只在 hosted ACL／default
  privileges，而且 hosted 預設會廣泛 grant 新物件。
- `REPEATABLE READ READ ONLY` snapshot 實查 4 筆 legacy subscriptions／3 owners；7 筆 outbox 的
  `sent_at` 非空，pending 0、orphan 0、retired event 0。這不代表 provider 接受或裝置收到。
- exact UTF-8 SHA-256 conflict 0；但 frozen canonical policy 尚未實作，所以 canonical 例外**沒有數字**，
  不能進 contract。
- additive expand 會回填 2 個 session version 1、1 個 legacy reminder sentinel 0；duplicate group 0。
- hosted dispatcher 是 ACTIVE version 6、`verify_jwt=false`；下載後兩個 source file 與 repo 逐 byte
  相同。4 個 production custom secret 名稱存在，mock transport／test URL 名稱不存在。
- dispatch／reminder cron 唯一、active、command shape 相符；Vault 三個必要名稱各一筆且查詢時非空。
- 查詢當下 cron running 0、pg_net queue 0；這不等於零 in-flight Edge worker。

盤點結論：可開始**本機** additive expand 與測試；尚未核可 hosted migration/deploy。contract 仍須
frozen canonical scanner、platform timeout／provider／browser canary、maintenance barrier，以及 Barrier
後重新取數並再次取得使用者確認。

## FA-03A0 測試基線隔離

已完成：

- reminder pgTAP 的時鐘改到本機既有所有有限 session 起始時間之後，避免掃到非本測試建立的 session。
- 只刪除與統計本測試建立的 outbox；不再清空全表，也不以全庫總數當 fixture 斷言。
- 第一次 enqueue 必須精確回傳 `3`、第二次必須精確回傳 `0`，原本的 production 行為斷言沒有放寬。
- 獨立 reviewer 檢查未提交差異，結論為 zero blockers。

本批驗證：

```text
npm run test:db：7 files、804 tests，全數通過
git diff --check：通過
```

## FA-03A1 schedule／outbox foundation

已完成：

- 新增 `sessions.notification_schedule_version bigint NOT NULL DEFAULT 1 CHECK (> 0)`；PG17 constant
  default 走 missing-value metadata path，不以 `UPDATE` 改動既有 `sessions.updated_at`。
- DB trigger 只在 `start_at/court_id/venue_type/range_end/decided_at` 真的改變，或 `status` 跨出／回到
  `open/full` 集合時單調加一；同一 UPDATE 多欄只加一次，no-op／無關欄不加，caller 也不能偽造版本。
- outbox 新增 nullable、無預設的 `expires_at` 與 `source_schedule_version`。既有及跨 DDL 的 legacy
  reminder 由 BEFORE INSERT trigger／backfill 固定成 sentinel `0`；非 reminder 必須維持 `NULL`。
- 舊三欄 reminder unique index 完全不動；新版 schedule-version dedupe 尚未啟用。
- 原本把 sessions 與 outbox 放同一 migration 的版本沒有提交。對立 reviewer 實測找出舊 reminder
  的反向鎖順序後，改成 `001` 只鎖 sessions、`002` 只鎖 outbox，移除可形成的 deadlock cycle。
- generated DB types 與 outbox 精確欄位 allowlist 已同步；trigger helpers 為 invoker security、空
  `search_path`，且 `anon/authenticated/service_role` 都不能直接 execute。

刻意未做：

- 沒有修改 browser runtime、dispatcher、cron、舊 save/remove RPC、service-role 既有 grants 或 reminder
  enqueue helper。
- 沒有建立 consent／registry／delivery／control／worker tables；它們仍有下節列出的精確契約待補。
- 沒有 hosted migration/deploy、legacy key 擦除、outbox 取消或其他 contract 操作。

本批驗證：

```text
新增 pgTAP：33／33 passed
npm run test:db：8 files、837 tests，全數通過
npx supabase db lint --local --schema public,private：No schema errors found
strict pg-delta shadow replay：27 migrations 全部套用，public/private diff 為空
npm run typecheck：通過
Push／dispatcher Node tests：13／13 passed
npm run db:gen-types：重跑產物一致
git diff --check：通過
三位獨立 reviewer：產品範圍、schema 契約與 lock-order 複查皆 zero blockers
```

## FA-03A2 schema contract

契約文件：`frontend-architecture-fa-03a2-schema-contract-2026-08-31.md`

已完成並經 PostgreSQL 17／三路 reviewer 查核：

- 固定 ID/hash/version、consent/registry/delivery state、outbox format 1/2、四種 source kind、10-event
  deadline/invalidation、control/worker admission、ACL 與 profile-first 的未來 lock gate。
- 修正兩個原設計缺口：outbox format 1 default 在 barrier 必須移除；message version `1` 必須由 DB
  immutable trigger 保證，不能只靠目前沒有 edit RPC。
- PG17 rollback-only fixture 證實 registry `SET NULL` 會觸發 child `BEFORE UPDATE` 並可轉 ownerless deny；
  delivery→consent 若是 immediate NO ACTION 會阻塞 profile delete，改成 deferred NO ACTION 才能依 final
  state 正確收斂。
- 新 registry owner composite FK 所需的 non-deferrable three-column UNIQUE、所有 version 的 NOT NULL，
  以及 worker register/barrier admission race 都已補回契約。

使用者於 2026-08-31 確認：

1. 刪帳時 cascade 清除 Push consent/device/token、transport、outbox/delivery/payload，只留下最小
   ownerless deny registry row。
2. `update_session` 的通知相關欄位與 DB 現值完全相同時，不建立 `session_updated` Push。

本輪未做 hosted migration/deploy、browser/dispatcher/runtime、legacy erase 或 pending cancel。

## FA-03A3 dormant Push schema

已完成：

- 新增 `003`～`009` 七份 additive migration，依 relation 拆開 source version、message immutable、outbox
  format、runtime control、consent/registry 與 delivery，避免不必要的跨表 DDL lock。
- `sessions.notification_state_version` 只在契約列出的 16 個 domain 欄位真變更時加一；participant
  version 只看 session/profile/role/status/initiated-by。多欄只加一次，no-op、只改 `updated_at`、caller
  傳 `NULL` 或偽造值都不能改寫 DB version。`session_messages` 的 UPDATE 由 DB 全面拒絕，固定 source
  version `1` 不再只是應用程式慣例。
- outbox 以明確 format `1/2` 區分 legacy 與新版資料；format 2 的 source triple、expiry、fan-out 與
  outcome 都有 validated CHECK，`NULL source_id/source_version` 也會 fail-closed。deferred constraint
  trigger 禁止以 `open` commit；舊三欄 reminder unique index保持原樣，尚未提前切換 runtime 語意。
- 建立 private singleton control、worker ledger、空 canary allowlist；所有未查實的 lease/deadline/attempt/
  TTL safety 數值保持 `NULL`，沒有猜預設秒數或次數。
- consent、endpoint registry 與 per-device delivery 皆由 DB 維護 identity/version/timestamps；delivery
  只能從 pristine pending 建立，identity 不可換，terminal 結果不可復活。private tables 全部 RLS on、
  zero policy，PUBLIC/anon/authenticated/service_role 的 table、sequence、helper EXECUTE 全撤除。
- 真實 auth→profile→session→outbox/consent/registry/subscription/delivery/canary fixture 證實：一般直接
  刪 consent 會被 deferred audit FK 阻擋；刪 auth user 則清除 consent/device/token、raw subscription、
  outbox/payload、delivery、canary 與 session，只留下 algorithm/hash/state/reason/version 的 ownerless
  deny registry row，且三個時間欄皆為 `NULL`。
- generated public DB types 與 `notification_outbox` 精確欄位 allowlist 已同步。

刻意未做：

- 沒有新增或啟用 compatible command、browser consent UI、logout cleanup、dispatcher、cron 或新 grants。
- 沒有改舊 reminder scheduler 去重、移除 outbox format `DEFAULT 1`，也沒有啟用 format 2 writer。
- 沒有 hosted migration/deploy、legacy raw key 擦除、pending cancel 或其他不可逆 contract。

本批驗證：

```text
source-version pgTAP：60／60 passed
outbox-format pgTAP：33／33 passed
private-lifecycle pgTAP：84／84 passed
npm run test:db：11 files、1,014 tests，全數通過
npx supabase db lint --local --schema public,private：No schema errors found
strict pg-delta shadow replay：34 migrations 全部套用，public/private diff 為空
npm run db:gen-types：完成，差異只有核可的 public schema 欄位
npm run typecheck：通過
npm run lint：通過
Push／dispatcher Node tests：13／13 passed
git diff --check：通過
private schema 獨立覆核：兩個 Medium hardening 缺口修正後 zero blockers
全批最終覆核：INSERT version ownership blocker 修正並補真實 fixture 後 zero blockers
```

## FA-03A3.1 outbox deferred guard 相容性 hotfix

已完成：

- authenticated 邊界的 pre-fix 重現確認：test-only `SECURITY DEFINER` format 2 writer 返回後，deferred
  trigger 會以 `authenticated` 執行；原本 invoker-security helper 讀取 `notification_outbox` 時精準失敗為
  `42501 permission denied for table notification_outbox`。production writer 目前仍只寫 format 1，且因條件
  短路不會執行該 SELECT；本文件不把 test-only format 2 證據誤稱為現行 browser writer 行為。
- 新增 additive `010` migration，只把 `private.reject_open_notification_outbox_commit()` 改為
  `SECURITY DEFINER`，保留空 `search_path`，並再次撤除 PUBLIC、anon、authenticated、service_role 的
  直接 EXECUTE；沒有授予 browser role 任何 outbox SELECT。
- 新增 10 項 pgTAP，從 `authenticated` 邊界實證：helper owner 為 `postgres`、現行 `create_session`
  format 1 可提交、合法 frozen
  format 2 可提交、open format 2 仍以契約錯誤 `23514 NOTIFICATION_OUTBOX_FANOUT_OPEN` 被拒絕，且
  browser SELECT／直接呼叫 helper 持續禁止。
- 本機測試 DB 從零套用 35 份 migration（含 `001`～`010`），沒有修改 hosted 資料庫。

本批驗證：

```text
npm run test:db：12 files、1,024 tests，全數通過
npx supabase db lint --local --schema public,private：No schema errors found
npm run typecheck：通過
npm run lint：通過
npm run prettier:check：通過
git diff --check（migration／DB tests）：通過
```

## FA-03B0 auth identity fail-closed

已完成：

- `sessionIdentity()` 與 page/profile 共用的 `authIdentity()` 不再 fallback 到 `access_token`；只接受非空
  `session.user.id`。
- auth controller 會把缺少有效 `user.id` 的 candidate 正規化成匿名狀態；即使 caller 直接繞過
  profile orchestration，也不能把 access token 存成 owner identity 或啟動私人 participation load。
- profile orchestration 在 profile／notification 私人讀取前攔截不完整 session，失效在途 auth request、
  清 presence/profile/notification state、關閉 profile completion、回公開頁並提示重新登入。
- 新增 controller 與 orchestration 回歸測試，明確驗證 access token 不能當 identity、零私人
  participation load、route force-public 與私人 state reset 順序。

刻意未做：

- 本批沒有改 boot session 取得方式；Q9-A 的強制 Auth refresh 與 `INITIAL_SESSION` 競態留在下一個獨立
  commit。
- 沒有新增 Push device/cleanup command、改 logout scope、啟用 Push runtime，或做 hosted 寫入。

本批驗證：

```text
targeted auth tests：5／5 passed
npm run test:session-unit：341 top-level／355 total tests，全數通過
npm run test:mock：Chromium 298 passed／4 skipped
npm run typecheck：通過
npm run lint：通過
npm run prettier:check：通過
npm run build：通過
npm run check:production-bundle：結構檢查通過、development report 0 exceeded
git diff --check：通過
獨立 diff 覆核：zero correctness/security blockers
```

## FA-03B1 Q9-A Auth boot refresh gate

已完成：

- boot 不再把 `getSession()` 的 local cache 當登入證明；它只用來確認是否有可 refresh 的 session，接著
  必須以 no-argument `refreshSession()` 向 Auth server 取得非空 `user.id`＋`access_token`，並和同一輪
  `TOKEN_REFRESHED` 的 identity／token 完全相符，才會開啟私人 state 與資料載入。
- Auth callback 只記錄事件並排到下一個 task，避免在 auth-js subscriber 內重入 refresh deadlock；
  `INITIAL_SESSION` 不授權。SIGNED_OUT、換帳號、不同 token、pending publish、superseded refresh 與延遲
  cross-tab 事件都有 revision/proof barrier。已驗證 state 收到同 identity 的 `TOKEN_REFRESHED` 才能接續
  token rotation；一般 `SIGNED_IN` 只有 identity＋access token 都完全相同才可在重驗期間保留，token
  不同會先關閉。登出後的 stale `SIGNED_IN → TOKEN_REFRESHED` 必須重新 server 驗證，不能靠 local event 復活。
- 明確 4xx rejection 只接受固定 Auth code；network、5xx、timeout／未知錯誤維持 local public 並可在
  `online` 事件重試，不猜成匿名。auth-js initialize 吞掉 `session_not_found` 的已驗證版本行為，另由 exact
  refresh endpoint observer 提供一次性證據。
- observer 只比對 configured origin、精確 path、POST 與 `grant_type=refresh_token`；遵守 Fetch 的
  `init.method` override。它不讀 request body、不讀成功 token response；失敗 response 只保存 frozen
  `revision/kind/status/code`，不保存 credential、message 或 response body。
- 全部 app-owned auth storage 操作共用 `lock:${SUPABASE_AUTH_STORAGE_KEY}`。Web Locks `0` 保留立即失敗，
  其他 timeout 固定為 `-1`，不 timeout／不 steal；缺少 Web Locks 或 callback 沒有取得真正 lock 時直接
  fail-closed。OAuth sign-in／identity linking 共用同一 lock，並以安裝中的真實 GoTrueClient 驗證 PKCE
  verifier 與 linking 都能完成；SDK 自己負責 sign-out 的同名 lock。
- 登出仍會清私人 state，但「我」頁是可安全顯示匿名登入入口的公開頁，因此留在原頁；「我的球局／訊息」
  仍會導回公開地圖。這個真實 local browser 回歸已固定。
- Playwright 永久測試以同一 context 的兩個真實 page、共用 storage key 與安裝中的 GoTrueClient 驗證：
  refresh A 未完成時，B 換帳號或 local sign-out 必須等鎖，最終不能被 A 覆寫或復活。

精確邊界（不可過度宣稱）：

- 這是 Q9-A 的 **Auth boot／local private fail-closed 部分**，不是完整 Q9。`rejected` 尚未接到
  cleanup-token quarantine、Service Worker/private Push display gate 或 dispatcher；D2 production
  sign-out 也仍是 SDK 預設 global scope。
- observer 是單一 tab、latest／one-use 證據，尚未和未來 cleanup device／attempt 綁定；連接 server
  Push state 前必須補這層關聯。
- lock 保證只涵蓋目前 app-owned 呼叫；舊版分頁、外部 client、直接改 localStorage 或不用同名 lock 的
  程式不在保證內。SDK 固定為 `supabase-js/auth-js 2.110.0`；升級時必須重驗 lock name、refresh request、
  error code 與 event ordering。
- 不支援或錯誤實作 Web Locks 的 browser 會安全失敗；而 Supabase data request 也可能因取不到 auth
  session 而不可用。`-1` 是刻意無期限等待，沒有自行猜 timeout；持鎖 network request 若永久 pending，
  後續 auth/data 也會等待，private state 維持關閉。
- 真實 browser lock 測試涵蓋 desktop/mobile Chromium 與 Playwright WebKit，但 Auth HTTP 為 mock；沒有
  hosted Auth、Firefox、實體 Safari／裝置或真實 OAuth provider E2E。
- auth／online subscription 目前符合 app boot 只執行一次的 lifecycle；若未來支援 HMR/re-entry，需先補
  teardown ownership。

本批驗證：

```text
targeted Auth／lock／orchestration：43／43 passed
npm run test:session-unit：381 top-level／398 total，全數通過
npm run test:mock：Chromium 304 passed／4 skipped
真實雙分頁 GoTrueClient lock：desktop Chromium、mobile Chromium、mobile WebKit 共 9／9 passed
npm run test:local：local API 2／2；Supabase Chromium 45 passed／11 skipped
npm run test:local:mobile：6／6 passed
npm run typecheck／lint／prettier:check：全數通過
npm run build：509 modules，通過
npm run check:production-bundle：結構 gate 通過；development report 只有 total gzip 超額 1,324 bytes
npm run check:production-bundle:release：按 D8 預期 hard fail（260,386 > 259,062）
git diff --check：通過
兩路 Auth 獨立覆核：null-lock 與 stale cross-tab barrier 修正後 zero blockers
hosted migration／deploy／Auth 寫入：未執行
```

## FA-03B2 v2 transport 與 quarantine DB boundary

已完成：

- 新增 compatible `011` migration，在既有 `public.push_subscriptions` 加入七個 nullable v2 metadata：
  `consent_id`、endpoint／VAPID fingerprint algorithm＋digest、`transport_version`、`updated_at`。既有
  legacy row 七欄全部維持 `NULL`，沒有 backfill、轉換或擦除 endpoint／keys。
- DB 以 all-or-none CHECK、exact endpoint UTF-8 SHA-256 CHECK、同 owner consent／registry composite FK、
  consent 與 endpoint fingerprint partial unique index固定 v2 transport。trigger 強制新 transport version
  從 `1` 開始，semantic update 才加一；caller 不能偽造 version／timestamp，也不能在 legacy／v2 間換模式。
- authenticated 的 raw subscription table／sequence 權限全部撤除；現行 app 實際使用的
  `save_push_subscription`／`remove_push_subscription` signature 保留。service role 權限精確收斂為舊
  dispatcher 目前必要的 `SELECT/DELETE`，沒有 sequence／raw insert／update。
- legacy RPC 每次先鎖 runtime control；`legacy_writes_enabled=false` 固定拒絕
  `PUSH_CLIENT_UPGRADE_REQUIRED`。開啟期間仍只寫七欄皆 `NULL` 的 legacy row；一旦 exact endpoint
  fingerprint 已進 registry，不論同 owner／不同 owner、active／quarantined／deny，一律要求升級，
  不能用舊 RPC 繞過 owner lock 或重新放回 send material。
- `quarantine_push_device(device_id, consent_epoch, expected_version)` 只給 authenticated owner；仍 enabled
  但 epoch/version 不符時回 `STALE_PUSH_DEVICE`，不把零變更說成成功。exact match 才走共同 private
  helper；不存在或本來已 inactive 則以 `OK` 冪等收斂。
- cleanup token 的 DB command 只給 service role，且只接收 64 字元 lowercase SHA-256 hex digest；DB
  不接 reusable raw token。invalid／unknown／replay 都只回固定 `OK`，不回 owner、device、epoch、hash
  或狀態。raw token 的 32-byte canonical base64url 驗證與 Web Crypto hash 明確留在下一批獨立 Edge
  endpoint，尚未假裝已完成。
- 共同 helper 依 `profile → consent → registry → transport → delivery` 取鎖，在同一 transaction 把
  consent 轉 paused、registry 保留 owner 並轉 quarantined、刪除 endpoint／keys、取消同 epoch 的
  `pending/processing/unknown` delivery；既有 terminal delivery 不改，也不鎖／更新 outbox。
- 新增 68 項 pgTAP，涵蓋 exact schema／ACL、legacy shim、owner／token／stale／rotation／replay、跨帳號
  owner-lock 繞過、三種 non-terminal cancellation、terminal preservation、強制最後一步失敗的完整
  rollback，以及真實 account delete 仍只留下最小 ownerless deny fingerprint。
- generated public DB types 已同步兩個 command 與七個欄位；舊 browser repository 仍只走相容 RPC。

精確邊界（不可過度宣稱）：

- `new_runtime_mode` 仍為 `disabled`；本批沒有 enable command、沒有建立 production v2 row，也沒有切
  cron／dispatcher。現行 dispatcher 仍讀 legacy subscription，未參與 consent／delivery lock，因此只能
  宣稱 DB transaction 內的 quarantine 原子性，不能宣稱 adapter handoff 已符合 Q6-A。
- cleanup Edge endpoint、canonical token codec、rate limit、request body／log 去敏尚未實作；
  `quarantine_push_by_token` 是 service-role-only digest boundary，不是 browser 可直接呼叫的完整 API。
- Auth `rejected` 尚未接 cleanup、IndexedDB 尚無 logical device／raw token／pending attempt，production
  sign-out 仍是 global；Service Worker 也尚未做 owner／epoch／expiry gate，所以 Q9 與 D2 都未完成。
- 本批沒有雙連線 deadlock／pooler canary、hosted default-privilege 實測或 production Edge canary；這些
  必須在 compatible dispatcher／Edge 接線後補。`canonical-endpoint-policy-v1` 仍是 enable／contract
  blocker，不因本批 exact fingerprint CHECK 就視為完成。

本批驗證：

```text
quarantine targeted pgTAP：68／68 passed
npm run test:db：13 files、1,092 tests，全數通過
本機 DB 從零重播：36 migrations 全部套用
npx supabase db lint --local --schema public,private：No schema errors found
strict pg-delta shadow replay：public/private diff 空白
notification data／Push／dispatcher Node tests：13／13 passed
npm run test:session-unit：381 top-level／398 total，全數通過
npm run test:local：local API 3／3；Supabase Chromium 45 passed／11 skipped
npm run test:local:mobile：6／6 passed
npm run db:gen-types／typecheck／lint／prettier:check：全數通過
npm run build：509 modules，通過
npm run check:production-bundle：結構 gate 通過；既有 total gzip 仍超額 1,324 bytes
git diff --check：通過
獨立 source／runtime 覆核：legacy owner-lock bypass 修正後 zero blockers
hosted migration／deploy／Edge 寫入：未執行
```

## FA-03B3 加密 cleanup Edge boundary（local-only）

已完成：

- 新增 `push-cleanup` Edge Function，但不是 production 功能：只有環境精確等於
  `PUSH_CLEANUP_RUNTIME_MODE=local-test-v1`，且不存在 hosted 的 `DENO_DEPLOYMENT_ID`／`SB_REGION`
  marker 時才會讀 request body；marker 名稱依
  [Supabase hosted environment variables](https://supabase.com/docs/guides/functions/secrets) 核對。預設、設定錯誤與
  hosted 都先固定回 `503 RETRY`，不載入密鑰、解密或碰 DB。
- cleanup token 維持 32 random bytes、43 字元 canonical unpadded base64url。browser 端 helper 先把 43 個 ASCII
  bytes 用 RSA-OAEP／SHA-256 與固定 label `qiuka.tw/push-cleanup-token/v1` 隨機加密；Edge 解密後才 decode
  成原本 32 bytes 並算 SHA-256 digest。incoming body 因此只含每次不同的 ciphertext、公開 `kid` 與 version。
- `kid` 按 [RFC 7638](https://www.rfc-editor.org/rfc/rfc7638) 對 `{e,kty,n}` 算 SHA-256 thumbprint；v1 精確限制 RSA 2048-bit、exponent `AQAB`、
  一到兩把 standard private JWKS current／previous key。載入時會實做 public encrypt → private decrypt 自我檢查；
  結構正確但 CRT 私密參數損壞的 key 也會被拒絕。
- v1 request 不是拍腦袋設上限：2048-bit ciphertext 固定 256 bytes／342 base64url 字元，加上 43 字元 `kid`
  與固定 canonical JSON 後，實算必須正好 425 UTF-8 bytes。1024／3072 key 都拒絕，若未來改 3072 必須升
  protocol version 並重算 body contract。
- 只接受 exact canonical JSON、`application/json`、無壓縮、exact allowed HTTP(S) Origin、`POST`。foreign、
  `null`、missing 與 suffix Origin 都在 body／crypto／DB 前回 `403`；其他 malformed body 固定回 `200 OK`
  且不碰 DB，避免把解析細節回傳給呼叫端。
- 已知 `kid` 但 OAEP／token 失敗時，先取新的 32-byte random fallback，再 hash 並走相同 DB RPC；成功與失敗
  HTTP 外觀相同。已移除的 `kid` 固定回 `503 RETRY` 且不碰 DB，未來 client 必須重抓 public key、重加密後
  有限次重試，不能無限重送舊 ciphertext。
- Edge 只呼叫固定的 service-role-only `quarantine_push_by_token`，只傳 lowercase digest。新式
  `SUPABASE_SECRET_KEYS.default` 與本機 legacy key 都只放 `apikey`，不放 `Authorization`；RPC fetch 禁止
  redirect；header 用法依 [Supabase auth headers](https://supabase.com/docs/guides/functions/auth-headers) 核對。
  程式沒有 application log，也不回傳 token、digest、ciphertext、owner 或內部錯誤。
- `verify_jwt=false` 是刻意的 cleanup-token bearer boundary，不是 anonymous DB 權限；真正授權資料是 256-bit
  cleanup token。Origin 只能限制正常 browser，不當作非瀏覽器攻擊者的身分驗證。
- 真實本機 smoke 會產生臨時 RSA key／token、建立真實帳號與 `enabled` consent、啟動 pinned Supabase CLI
  2.115.0 的完整 Functions runtime，送 encrypted body，再直接確認 DB 已變成
  `paused|cleanup_quarantine`。結束時刪臨時帳號／env file 並停止 Edge runtime。
- 同一 smoke 在 runtime 完全停止後，掃 child output 與本專案全部 local Supabase container logs；實測沒有
  raw token、digest、RSA 私密欄位／完整 JWKS、新式 `SECRET_KEY` 或 legacy `SERVICE_ROLE_KEY`。這項證據只限
  本機，不能外推 hosted。
- ESLint 現在真的對 Edge JS 套 Deno globals＋recommended rules，對 TS entry 套 TypeScript recommended；
  CI canary 會直接讀 ESLint resolved config，避免只有 glob、實際檔案卻被 ignored 的假守門。

精確邊界（不可過度宣稱）：

- browser／IndexedDB／Auth rejected／local sign-out 尚未呼叫此 endpoint，production 使用者目前不會送出
  cleanup envelope；Service Worker／dispatcher 也未接 v2 gate。
- 沒有 hosted deploy、secret、request 或 DB 寫入。[Supabase Edge logging](https://supabase.com/docs/guides/functions/logging)
  說 invocation log 會收 request／response metadata；目前只確認本機 logs，仍沒有證據保證 hosted Edge →
  PostgREST 的 outbound digest body 不會被記錄。
- distributed limiter、可量測的 threshold、hosted log canary 與 deployment allowlist 尚未完成，所以 D13
  維持 hosted hard-disabled。即使誤 bulk deploy，handler 仍不執行 cleanup，但公開 request 仍可能產生成本。
- 固定 response 與相同 DB control flow 只能降低直接 oracle，不能宣稱 RSA／DB 是 constant-time。retired `kid`
  的 `503` 會透露公開 key ring 是否包含該公開 id；token match／no-match timing 也可能不同。
- pinned 本機 gateway 實測會攔截所有 `OPTIONS`，對允許與惡意 suffix Origin 都回 `200`、`ACAO: *`；POST
  仍由 handler exact-Origin gate 把 suffix Origin 擋成 `403`。這只描述 local CLI 2.115.0，不能外推 hosted。
- `supabase functions serve` 實際會啟動全部本機 Functions，env 也屬該 runtime 共用；repo 搜尋確認只有
  `push-cleanup` 讀三個 `PUSH_CLEANUP_*` 名稱，但這不是平台層 secret isolation。
- RPC fetch 已禁止 redirect；沒有可靠 latency 基線可訂 timeout，本批沒有猜秒數。正式啟用前必須以 hosted
  canary／failure distribution 定出 timeout 與 limiter，不可沿用本機速度。
- JavaScript immutable string 不能主動清零；可變 token／ciphertext／plaintext buffer 已在 `finally` 清零，
  但 raw-token string、serialized JWKS 與 service key 仍只能等 GC。正式 hosted 前仍需 log canary。

本批驗證：

```text
Edge／CI targeted：44 passed / 1 local-only skipped
真實 local Edge → DB smoke：1／1 passed；enabled → paused|cleanup_quarantine
npm run test:ci:frontend：通過；Node 423 passed / 1 skipped；Chromium 304 passed / 4 skipped
npm run test:ci:supabase：通過；DB 1,092／1,092、local API 3／3、desktop 45 passed / 11 skipped、mobile 6／6、Edge 1／1
npm run typecheck／lint／prettier:check／build／git diff --check：均由完整 CI 通過
npm run check:production-bundle：結構 gate 通過；既有 total gzip 仍超額 1,324 bytes，依 D8 只報告
三路 protocol／CI reliability／security 獨立覆核：修正 corrupt-key blind spot、uniform-OK DB blind spot、
preflight gateway 誤判、log key 漏掃、teardown masking 與 Edge lint 假覆蓋後，zero blockers
hosted migration／deploy／secret／Edge request／DB 寫入：未執行
```

## FA-03B4 可輪替 cleanup public-key boundary（dormant）

已完成：

- 將 browser 需要的 base64url、RFC 7638 thumbprint、RSA-OAEP encrypt、canonical envelope 與 public-key
  validator 抽到 `supabase/functions/_shared/push-cleanup-protocol.js`。Edge private key ring、decrypt、fallback
  digest 仍只在 `push-cleanup/crypto.js`；shared source 明確沒有 private-key loader、decrypt 或 private env。
- public key 不放進 `VITE_*` 或 app config，避免已開啟的舊 tab 永久綁住舊 JS 常數。Vite 只在 build／dev
  server 端讀 public-only `PUSH_CLEANUP_PUBLIC_JWK_JSON`，並產生固定同源路徑
  `/push-cleanup-key-v1.json`。依 [Vite env 文件](https://vite.dev/guide/env-and-mode.html)，只有 `VITE_*`
  會自動暴露給 client；本批也以真實 build 證明 key、modulus 與 env 名稱都沒有進 JS chunk。
- v1 env 只能是 exact canonical 479-byte public JWK；document 固定為 499-byte
  `{"key":{...},"version":1}`，只發布 current encrypt key。額外／重複／private 欄位、錯誤 `kid`、欄位順序、
  空白、尾端換行與非 2048-bit key 全部 fail build，沒有自動修正或寬鬆 alias。
- 沒有設定 public key 時不產生 placeholder asset；實際 production build 已確認檔案不存在，因此目前仍是
  dormant。`.env.example` 只留空的 public env 名稱，沒有生成或提交任何真實 key。
- Vite dev middleware 對 exact path 提供 `Cache-Control: no-store`、`Pragma: no-cache`、JSON content type 與
  `nosniff`；query alias／其他 method 不視為同一路徑。Vercel exact path 也加入 `no-store/no-cache`，政策依
  [Vercel Cache-Control 文件](https://vercel.com/docs/caching/cache-control-headers)；尚未部署，所以沒有宣稱
  production response 已實測。
- build test 以真實 Vite/Rollup output 驗證 configured 時只多一份 byte-for-byte canonical JSON，未配置時
  零 asset；JS chunks 不含 public `kid/n`、public env 名或 private env 名。lint／Prettier 範圍也擴到
  `_shared`，並由 resolved ESLint config canary 證明不是假 glob。
- 同一份共用協定已由真實本機 Edge runtime 再跑完整 envelope → RPC → DB quarantine，確認抽檔後 Deno
  bundle 與既有行為相容。

精確邊界（不可過度宣稱）：

- `FA-03B6` 已有 dormant browser loader／transport，但 production 尚無 import 或 caller，也沒有 Auth wiring；
  因此現行舊 tab **仍不會**自動抓 key 或送 cleanup。只有未來明確接線後，舊 tab 才能在每次 attempt 重新抓
  fixed same-origin key；loader 已採 499-byte bounded stream read，沒有使用無上限 `response.text()`。
- 固定同源 URL 讓未來 stable-origin 舊 tab 可重新抓新 deployment，但 commit-specific preview URL 與 rollback
  仍可能指向舊 asset。正式 rotation 必須按 private ring `[new, old]` → new asset → canary → retire old 的順序；
  不能以猜測天數移除 old key，也不能把已疑似外洩的舊 private key 為 rollback 放回。
- build 只驗 public document 本身；尚未有 deployment canary 證明 published `kid` 確實存在 hosted private
  ring。hosted Edge 仍由 D13 hard-disable，本批沒有 deploy、env 寫入、hosted request 或 DB migration。
- `no-store` 目前由設定測試與本機 middleware 證明，尚未由真實 Vercel response 證明。production／preview
  是否共用 Supabase project、允許的 stable origins、可安全 rollback 的 deployment 都仍需部署前查實。

本批驗證：

```text
public-key／Edge／CI／header targeted：54／54 passed
真實 local Edge → DB smoke：1／1 passed
npm run test:ci:frontend：通過；Node 430 passed / 1 skipped；Chromium 304 passed / 4 skipped
npm run build：509 modules；未配置 key 時沒有 public-key asset
npm run check:production-bundle：結構 gate 通過；既有 total gzip 仍超額 1,324 bytes，依 D8 只報告
typecheck／lint／prettier:check／git diff --check：完整 frontend CI 全部通過
獨立安全／build 審查：公私鑰邊界、canonical fail-closed、Edge 語意與真實 Vite dev/build 均 zero blockers
DB schema／migration：未變更；hosted deploy／env／request／DB 寫入：未執行
```

## FA-03B5 dormant browser Push storage foundation

已完成：

- 新增未接 production 的 `notificationPushStorage.ts`。IndexedDB 固定為
  `tennis-partner-finder-push` v1，只有 `meta`、`current-binding`、`pending-cleanups` 三個 store；前兩個是
  singleton，pending 以 `bindingId` unique index 防止同一 binding 重複排隊。
- logical device 使用 Web Crypto UUIDv4。同一個 browser storage context 可跨 reload 與分頁共用；刪除整個
  IndexedDB 後才建立新 device。模組 import 本身不開 DB。
- future enable 必須先建立 `provisioning`：先用 Web Crypto 產 32 random bytes，再保存成 43 字元 canonical
  base64url cleanup token。server response 只能把同一筆 provisioning 提升為 `enabled`，不能替換 raw token；
  consent 的 PostgreSQL bigint ID／version 以 canonical decimal string 保存，避免 JavaScript number 精度遺失。
- mutation 以 exact auth user、binding 與隨機 local revision 做 CAS。兩個分頁同時建立 device／provisioning
  只會得到同一筆；同時 cleanup 只有一筆成功，舊 revision 固定回 `PUSH_STORAGE_STALE` 且零寫入。
- cleanup 分兩步：第一筆 transaction 先把本機改成 `cleanup-required`，立即 fail-closed；第二筆 transaction
  再把 current binding 刪除並以 `add` 搬成 immutable pending attempt。第二筆若 abort，刪除也會 rollback，
  `cleanup-required` 與原 token 都還在，不會回到 `enabled`。
- `auth-unverified` 專門表示 Auth 網路結果不明：本機停用但不宣稱 server 已 quarantine，也不先排 cleanup。
  它只能單向升級為真正 cleanup；本批沒有 resume API。
- current binding 與 pending attempt 不可共存；pending 未精確完成前不能建立新 provisioning。一般 runtime
  snapshot 不回 raw token，只有明確的 provisioning／pending transport API 可以讀取。完成 cleanup 只刪除
  所有欄位逐一相符的 attempt；修改內容或舊 response 都不能碰新的 current binding。
- 每次操作會檢查 DB version、exact store／index、record exact keys、UUID、token、bigint 與跨 record device
  關係。多餘 singleton row、壞資料或較新的 physical DB version 都 fail-closed，且不刪除、不修正、不降版。
  connection 每次 transaction 完成後關閉，並在 `versionchange` 立即關閉。
- production `src` 沒有其他檔案 import 此模組；模組也沒有 dataApi、Supabase client、network、Auth、UI、SW、
  `localStorage`、`sessionStorage` 或 `Math.random()` fallback。目前 production 行為完全不變。

精確邊界（不可過度宣稱）：

- IndexedDB 不是同源 XSS 的秘密保管箱；raw token 仍是 browser-held bearer secret。真正的損害限制仍來自
  token 只能 quarantine，不能讀取、啟用、刪除或轉讓 Push。
- `FA-03B6` 已有 dormant 499-byte bounded key loader、cleanup HTTP transport 與單次呼叫最多 2 POST 的有限重試；
  `FA-03B8` 已串起 caller 指定的單筆 attempt，`FA-03B9` 也已建立 caller-supplied Auth failure → B5／B8
  handoff。但仍無 production caller、B1 可信 owner correlation、queue trigger、v2 enable／refresh command、D2 local
  sign-out 或 SW display gate。`auth-unverified` 只證明本機 fail-closed。
- 現行 `public/push-sw.js` 是 classic Service Worker，不能直接 import 這份 TS／ESM module。SW 批次必須先
  選擇可 bundle 的 module worker 或單一共享 schema artifact，不能複製兩份 validator 後假設永遠同步。
- targeted tests 實測 Playwright desktop Chromium、Pixel 5 Chromium emulation 與 iPhone 12 WebKit emulation；
  這不是 Android／iPhone 實機證據，也尚未驗 Firefox、installed PWA 與各平台 storage partition matrix。
- 模組尚未進 production graph，所以本批沒有修改 privacy page；真正開始保存本機 Push 狀態前必須更新。
- 本批沒有 migration、hosted deploy、env、request 或 DB 寫入，也沒有配置 public key。

本批驗證：

```text
Push storage targeted Node／CI canary：29／29 passed
真實 browser IndexedDB targeted：15／15 passed（desktop Chromium、mobile Chromium、mobile WebKit 各 5）
npm run test:ci:frontend：通過；Node 432 passed / 1 skipped；Chromium 314 passed / 4 skipped
npm run build：509 modules；production output 不含 B5 DB name／error marker，bundle bytes 與 B4 相同
npm run check:production-bundle：結構 gate 通過；既有 total gzip 仍超額 1,324 bytes，依 D8 只報告
typecheck／lint／prettier:check／git diff --check：完整 frontend CI 全部通過
DB schema／migration：未變更；hosted deploy／env／request／DB 寫入：未執行
```

## FA-03B6 dormant bounded browser cleanup transport

已完成：

- 新增未接 production 的 `notificationPushCleanupTransport.ts`。建立 transport 不會開 DB 或發 request；只有
  明確呼叫 `loadPublicKey()` 或 `sendPushCleanup()` 才會產生網路行為。
- public-key loader 只讀 browser origin 下固定的 `/push-cleanup-key-v1.json`，使用 GET、
  `credentials: omit`、`cache: no-store`、禁止 redirect。只接受 HTTP 200、exact response URL、核可的 JSON
  Content-Type、`Cache-Control` 含 `no-store`，以及 canonical 且實際 UTF-8 長度恰為 499 bytes 的 document。
- response body 不使用無上限的 `response.text()`／`response.json()`。public key 最多讀 499 bytes；cleanup
  response 最多讀 19 bytes；超限會取消 stream，無效 UTF-8 或非 canonical 內容一律 fail-closed。讀取用的
  mutable byte buffers 會清零。
- cleanup token 先在本機驗證為 canonical 32-byte token，再以當次取得的 key 做 RSA-OAEP-SHA256 加密。
  POST body 只接受 canonical 且實際長度恰為 425 bytes 的 envelope；request URL、headers 與 body 都不含 raw
  cleanup token。shared protocol 也會清零 token decode bytes、plaintext 與 mutable ciphertext buffer。
- 每次明確呼叫最多送 2 次 POST。只有 exact URL／header、HTTP 503 與 exact
  `{"outcome":"RETRY"}` 同時成立，才重新抓 current key、重新加密並送第二次；exact HTTP 200＋exact
  `{"outcome":"OK"}` 才回 `completed`。網路錯誤、abort、redirect、header／URL／body 不符、response 超限
  或第二次 `RETRY` 都回 `pending`，不在同一次呼叫內繼續送。
- transport 沒有自行設定 timeout、backoff、jitter 或 timer，只接受 caller 傳入的 `AbortSignal`；也不自行刪除
  B5 IndexedDB attempt。browser 整合測試已改由 B8 coordinator 在 exact `completed` 後呼叫 B5 exact CAS completion。
- production `src` 沒有其他檔案 import transport；transport 也沒有 storage、Auth、UI、Service Worker、
  data API、Supabase client、session credential、log 或 persistence dependency。D13 hosted hard-disable 沒有變動，
  production runtime 行為不變。

精確邊界（不可過度宣稱）：

- 本批沒有接 v2 enable／refresh、Auth rejected、D2 local sign-out、Service Worker 或 dispatcher，也沒有
  production caller；不能寫成 production cleanup 已啟用。
- transport 只回 `completed`／`pending`，不會自行刪 IndexedDB attempt。每次呼叫最多 2 POST 不是跨呼叫的
  全域上限；B8 只處理 caller 提供的一筆 attempt，尚未定義由誰掃描、觸發、排程、租約或退避。
- transport 沒有內建 timeout。caller 未 abort 且底層 fetch 永久不結束時，呼叫也可能一直 pending；目前沒有
  證據支持自行猜 timeout 或 backoff 秒數。
- 499 是 public-key **實際解碼後 body** 的上限且 body 必須恰為 499 bytes；425 是 outgoing canonical envelope
  的精確大小；19 只是 cleanup response 的最大讀取量，不代表 OK response 必須是 19 bytes。
- `Content-Length` 可以不存在；存在時只拒絕格式錯誤或大於上限，不要求它等於 browser 解碼後的 body 長度。
  browser 可能先處理 HTTP compression，所以本批也沒有猜測性地禁止 `Content-Encoding`；目前證據不能宣稱
  bounded reader 可限制瀏覽器在 JavaScript 取得 decoded stream 前的解壓資源成本。
- cleanup endpoint 只限制 HTTPS（loopback 可 HTTP）與 exact `/functions/v1/push-cleanup` path，尚未建立
  Supabase project hostname allowlist。兩個分頁也沒有共用 Web Lock，可能同時送同一 attempt；server
  idempotency 與 B5 exact CAS 可避免誤刪，但不是 traffic deduplication。
- browser 測試使用注入的 fake fetch／Response；實測的是 browser WebCrypto、ReadableStream 與 IndexedDB，
  不是真實 Vercel asset、Supabase gateway、local Edge 或 hosted end-to-end 證據。mobile Chromium／WebKit 是
  Playwright Pixel 5／iPhone 12 emulation，不是 Android／iPhone 實機。
- public key 仍未配置或部署，也沒有真實 hosted asset／response-header canary。distributed limiter、hosted log、
  stable origin／preview-to-production mapping、private key ring 對齊與有證據的 timeout 都仍缺；hosted handler
  因此繼續 hard-disabled。
- raw token 是 JavaScript string，語言本身無法可靠清零；本批只清零可控制的 mutable byte buffers。同源 XSS
  仍可能讀取 browser-held token，B5 所列 bearer-secret 風險沒有消失。

本批驗證：

```text
cleanup transport／Edge／CI targeted Node：68／68 passed（transport 本身 11／11）
真實 browser crypto／stream／IndexedDB targeted：12／12 passed（desktop Chromium、mobile Chromium、mobile WebKit 各 4）
browser repeat-each 壓力重跑：60／60 passed；Node transport 21 輪共 231／231 passed
npm run test:ci:frontend：通過；Node 445 passed / 1 skipped；Chromium 322 passed / 4 skipped
npm run build：509 modules；production output 不含 B6 transport／error marker，未配置 key 時仍無 public-key asset
npm run check:production-bundle：結構 gate 通過；total gzip 超額 1,324 bytes，依 D8 只報告
typecheck／lint／prettier:check／git diff --check：完整 frontend CI 全部通過
獨立程式／安全／測試審查：最新版 zero blockers；exact-response、same-key re-encrypt 與 token 不跨 browser test boundary 均已複查
DB schema／migration：未變更；hosted deploy／env／request／DB 寫入：未執行
```

## FA-03B7 dormant owner-quarantine RPC adapter

已完成：

- 新增未接 production 的 `notificationPushOwnerQuarantine.ts`。factory 只接受注入的 RPC function；建立 adapter
  本身不呼叫 RPC，也不讀 Auth、storage 或 network。
- `deviceId` 與 `consentEpoch` 必須是 lowercase canonical UUID；`consentVersion` 必須是
  `1`～`9223372036854775807` 的 canonical PostgreSQL bigint 十進位字串。缺欄位、number、前導零、符號、
  小數、超過 bigint 上限或非 canonical UUID 都在 RPC 前以固定錯誤拒絕，錯誤內容不夾帶輸入。
- 每次有效呼叫固定只呼叫既有 `quarantine_push_device` 一次，參數只包含 `p_device_id`、
  `p_consent_epoch`、`p_expected_version`；version 全程保留 string，不轉成不安全的 JavaScript number。
- 只有 `{ data: "OK", error: null }` 回 `completed`；只有 exact `STALE_PUSH_DEVICE` 回 `stale`。RPC throw、
  error 非 null／缺失、未知或非 exact outcome、無效 response 都回 `pending`，不重試，也不把底層錯誤傳出去。
- 新單元測試已納入 `test:session-unit`；source canary 同時要求 production graph 零 import，且 adapter 沒有
  secret、storage、直接 network、log、timer、timeout 或 random dependency。
- 真實本機 Supabase Data API 已把最大 bigint 字串送入現有 RPC 並收到 exact `OK`，證明目前
  Supabase／PostgREST boundary 可解析完整 int64 字串，不需要經過 JavaScript number。

精確邊界（不可過度宣稱）：

- adapter 本身不驗證 Auth/session；owner 權限仍由未來注入的 authenticated RPC client，以及資料庫既有 ACL
  與函式內 owner check 執行。注入 seam 不代表 production Data API 已完成接線。
- DB 的 `OK` 是刻意不洩漏資料的結果：不存在、非 owner 或已非 enabled 的 row 也可回 `OK`。因此
  `completed` 只表示 RPC 已接受並完成它的既定流程，不證明原本一定存在一筆裝置或真的發生狀態轉換。
- owner RPC 只適用於仍有有效 owner session、且 caller 已確認目前 user 與本機 binding owner 相同的路徑。
  換帳號或 Auth 已 rejected 時仍應走 cleanup-token 路徑；本批沒有建立這個 coordinator。
- `stale` 只表示 enabled owner row 的 epoch／version 不符，不表示 cleanup 完成；`pending` 也沒有由本 adapter
  寫進 B5 durable storage 或安排重試。本批沒有 import B5／B6、標記本機 fail-closed、unsubscribe、sign-out，
  或刪除任何 pending attempt。
- 本機 max bigint 測試使用不存在的隨機 device，證明的是 string 穿過 PostgREST bigint parser；matching row、
  stale 與跨 owner 的 DB 語意另由既有 68 項 quarantine pgTAP fixture 證明，不能混成同一項證據。
- generated `databaseTypes.ts` 目前仍把 RPC bigint 參數表示為 `number`。B7 刻意使用 string 保留精度；未來
  production wiring 必須增加 typed wrapper 與真實 bound-client integration test，不能轉回 `Number()`。
- 本批沒有 v2 enable／refresh、Auth rejected、D2 local sign-out、Service Worker、dispatcher 或 production
  caller；現行 production Push 與 global sign-out 行為沒有改變。
- 本批沒有 migration、schema、hosted deploy、env 或 hosted request。public key 仍未配置，D13 hosted
  hard-disable、distributed limiter、hosted canary／log 與 canonical endpoint policy blocker 都沒有解除。

本批驗證：

```text
owner-quarantine／Push／CI targeted Node：38／38 passed（adapter 本身 5／5）
真實 local Supabase Data API max-bigint string：1／1 passed
既有 quarantine command pgTAP：68／68 passed
npm run test:ci:frontend：通過；Node 452 passed / 1 skipped；Chromium 322 passed / 4 skipped
npm run build：509 modules；production JS byte totals 與 B6 相同，沒有 B7 RPC／error marker
npm run check:production-bundle：結構 gate 通過；total gzip 超額 1,324 bytes，依 D8 只報告
typecheck／lint／prettier:check／git diff --check：完整 frontend CI 全部通過
獨立程式／安全／測試複核：最新版 zero blockers
DB schema／migration：未變更；hosted deploy／env／request／DB 寫入：未執行
```

## FA-03B8 dormant single-attempt cleanup coordinator

已完成：

- 新增未接 production 的 `notificationPushCleanupCoordinator.ts`。它只靠 structural generic ports 組合
  B5 storage 與 B6 transport，不 import 兩者，也不複製完整 pending-attempt schema；只讀 `cleanupToken`，
  完成時把同一個原始 attempt 物件交回 storage。
- factory 只確認兩個注入方法存在；建立 coordinator 不呼叫任何 port。設定無效只拋固定錯誤 code，錯誤
  不夾帶輸入。
- 每次 `processPendingPushCleanup()` 只接 caller 提供的一筆 attempt，並把同一個 `AbortSignal` 傳給 transport；
  transport 方法最多呼叫一次。input 只做 object＋string token 的最小檢查。
- 只有 own key 恰為 `kind` 的 exact `{ kind: "completed" }` 才呼叫 local completion 一次。pending、額外欄位、
  未知 shape、invalid input 或 transport throw 都只回固定 `{ kind: "pending" }`，且 local completion 為零次。
- exact transport completion 後，即使 signal 已在 response 前被 abort，仍執行 local CAS，因為 server completion
  證據已經取得。storage 收到原 attempt identity；primitive `true`／`false` 都代表這筆 input 已 settled，回
  fixed completed。storage 回其他值或 throw 則回 pending，也不再次呼叫 transport。
- 回傳值只有 `kind`，沒有 token、attempt 或底層錯誤。source canary 禁止 direct network／storage／Auth／log／
  timer／loop 與 pending-list API，並驗證 production graph 零 import／caller。
- 既有 browser 整合已改成由 B8 串真 B5＋B6：exact OK 後原 attempt 消失，reload 維持 disabled；ambiguous
  abort 後原 attempt 跨 reload 保留。

精確邊界（不可過度宣稱）：

- 這不是 queue reader、drainer 或 scheduler。B8 不呼叫 `listPendingPushCleanups()`，不找工作；caller 必須先
  取得一筆 attempt 再明確呼叫。尚未決定誰在何時觸發，也沒有 timer、timeout、backoff、online listener、
  Background Sync、lease 或持久排程。
- B8 只驗最小 shape，不證明任意輸入一定是 B5 的 durable attempt，也不重做完整 token 驗證；組合真 B5／B6
  時，完整資料與 canonical token 仍各自在原 boundary fail-closed。
- coordinator 的 completed 不等於「本次一定刪除一列」。真 B5 回 `true` 代表 exact attempt 在該 transaction
  被刪除並 commit；`false` 只代表同一 attemptId 在該 snapshot 已不存在，本次沒有刪除。它不證明 queue 為空、
  不證明由誰先刪，也不證明沒有較新的 attempt。B6／Edge 的 exact OK 同樣不揭露原本是否存在 server row。
- B8 每次最多呼叫 transport 方法一次；組合真 B6 時，一次 transport call 仍可能依 D16 送最多 2 次 POST。
  這不是跨呼叫或跨 tab 的全域上限。B8 沒有 Web Lock、in-flight 合併或 traffic dedup；B5 CAS 防誤刪，
  但不防重複 POST，本批也沒有宣稱已驗證雙 coordinator race。
- pending／throw 只代表本次 B8 沒有呼叫 local completion，不代表 server 一定沒收到 request，也不排除另一個
  tab 同時改 storage。B8 只透傳 caller signal；caller 不 abort 且底層 fetch 不結束時，呼叫也可能不返回。
- raw token 仍以 JavaScript string 傳給 B6，無法可靠清零；同源 XSS 風險沒有改變。
- 本批沒有接 Auth rejected、D2 sign-out、owner RPC、enable／refresh、Service Worker、dispatcher 或 production
  caller。public key 仍未配置，hosted hard-disable 與既有 deployment blockers 都沒有解除。
- browser 證據使用真 WebCrypto／IndexedDB 與 fake fetch／Response；不是 local Edge 或 hosted E2E。mobile
  Chromium／WebKit 仍是 Playwright emulation，不是 Android／iPhone 實機。

本批驗證：

```text
coordinator／Push／CI targeted Node：41／41 passed（coordinator 本身 6／6）
cleanup transport browser targeted：12／12 passed（desktop Chromium、mobile Chromium、mobile WebKit 各 4）
browser reviewer repeat-each 壓力重跑：40／40 passed
npm run test:ci:frontend：通過；Node 460 passed / 1 skipped；Chromium 322 passed / 4 skipped
npm run build：509 modules；production output 不含 B8 coordinator／error marker
npm run check:production-bundle：結構 gate 通過；total gzip 260,386，超額 1,324 bytes，依 D8 只報告
typecheck／lint／prettier:check／git diff --check：全部通過
獨立程式／型別／測試複核：最新版 zero blockers
DB schema／migration：未變更；hosted deploy／env／request／DB 寫入：未執行
```

## FA-03B9 dormant Auth-failure handoff coordinator

已完成：

- 新增未接 production 的 `notificationPushAuthFailureCoordinator.ts`。factory 只接受 B5 storage 與 B8 cleanup
  structural ports；建立時不呼叫 port。模組沒有 import，也不直接依賴 Auth、Supabase、network、IndexedDB、
  pending-list、timer、loop 或 log。
- caller 只能提供 exact `rejected`／`unavailable`、`authUserId`、B5 safe binding CAS snapshot 與 optional signal。
  input／binding 都驗 exact own keys；owner、binding、device、revision、state、reason 與 server consent 必須符合目前
  B5 v1 canonical shape，否則固定回 `{ kind: "pending" }`，兩個 port 都不呼叫。
- `unavailable` 只接受 `enabled`／`provisioning`／`auth-unverified`，以 `auth_unavailable` 呼叫 B5 一次；只有
  exact `attempt: null` 與相符 `auth-unverified` safe state 才回 `{ kind: "local-closed" }`，B8 固定零次。
  `cleanup-required + unavailable` 直接回 pending，兩個 port 都不呼叫。
- `rejected` 接受上述三種 state 與 `cleanup-required`，先呼叫 B5 一次。非既有 cleanup-required 使用
  `auth_rejected`；既有 cleanup-required 由 B5 保留原 reason。只有 returned state 與 attempt 的 exact own keys、
  schema version、canonical cleanup token、owner／binding／device／reason／server consent 全部相符，且
  attempt `bindingRevision` 等於 returned state `localRevision`，才把同一 attempt 與同一 signal 交給 B8 一次。
- 只有 B8 exact `{ kind: "completed" }` 才回 `{ kind: "cleanup-completed" }`。storage／B8 回 unknown shape、
  額外 string 或 symbol key、throw 或 pending 都只回 fixed pending，不重試。公開結果只有 `kind`，不回傳
  binding、attempt、raw token 或底層錯誤。
- browser composition 使用真 B5 IndexedDB＋真 B8：unavailable 跨 reload 維持 `auth-unverified` 且零 pending；
  rejected 的 fake transport 回 pending 時，同一 B5 token 經 SHA-256 digest 證明後仍跨 reload 保留；回 completed
  時只清掉該 attempt，reload 維持 disabled。

精確邊界（不可過度宣稱）：

- production `src` 對 B9 為零 import／caller。現有 B1 `AuthVerificationResult` 的 rejected／unavailable 結果沒有
  舊 owner／binding identity；B9 只證明 caller 提供的 `authUserId` 和 snapshot owner 相等，不是獨立 Auth proof。
  在補上可信 correlation 前不能把 B1 直接接到 B9，Q9-A 整體仍未完成。
- `local-closed` 只證明 B5 本機 transaction 回了 exact `auth-unverified` state；不代表 server 已 quarantine。
  B9 完成時尚未選擇後續政策；D20 已於 2026-09-02 決定「不自動恢復，手動重新啟用時建立新 epoch」。
  B5／B9 目前仍沒有 resume／manual-reenable API，runtime 尚未實作。
- B9 刻意不覆寫或降級既有 `cleanup-required`；`cleanup-required + unavailable` 分支不呼叫任何 port 並回
  pending，因此也不證明 caller snapshot 仍是目前狀態。
- `cleanup-completed` 沿用 B8 的「本次 input attempt 已 settled」語意；不證明 server 原本有 row、整個 queue
  已清空、由哪個 tab 先完成，或沒有較新的 attempt。
- B9 不讀 queue、不找工作，也沒有 Auth observer、SIGNED_OUT／D2 trigger、timer、online listener、scheduler、
  backoff、timeout、Background Sync、lease 或跨 tab traffic dedup。caller 不 abort 且任一 port 永久不返回時，
  B9 也可能不返回。
- B9 固定目前 B5 safe-binding exposed shape，並要求 pending attempt `schemaVersion === 1`；attempt version 或
  exposed shape 改變時會 fail-closed，必須同步更新契約與測試。若 B5 只改內部版本、safe shape 不變，B9
  無法也不需要從這個輸入辨識內部版本。
- B9 會檢查 attempt 的 raw token 是否為 canonical 32-byte base64url，並把同一 attempt 交給 B8；token 仍是
  無法可靠清零的 JavaScript string。同源 XSS 風險不變，但 B9 不記錄、不回傳，也不把 token 放進錯誤。
- browser composition 的 transport 是 fake，沒有呼叫 B6、local Edge 或 hosted Edge。public key 仍未配置，
  hosted handler 仍 hard-disabled；D2 local sign-out、v2 enable／refresh、Service Worker 與 dispatcher 都未接線。
- B9 完成時 production v2 enable／refresh 尚缺 canonical endpoint／provider egress、Edge request／response／
  error、private DB command 與完整 CAS 定義；`FA-03B10` 已在後續文件凍結 v1 contract，但 adapter／migration
  仍未實作。

本批驗證：

```text
B9 unit：8／8 passed；64 個 cleanup-token 末字元逐一對 shared canonical decoder 對照
coordinator／Push／CI targeted Node：51／51 passed
B9 browser targeted：9／9 passed（desktop Chromium、mobile Chromium、mobile WebKit 各 3）
B9 browser repeat-each 壓力重跑：45／45 passed
npm run test:ci:frontend：通過；Node 470 passed / 1 skipped；Chromium 328 passed / 4 skipped
npm run build：509 modules；production output 不含 B9 coordinator／error marker
npm run check:production-bundle：結構 gate 通過；total gzip 260,386，超額 1,324 bytes，依 D8 只報告
typecheck／lint／prettier:check／git diff --check：全部通過
獨立程式／契約／測試複核：最新版 zero blockers
DB schema／migration：未變更；hosted deploy／env／request／DB 寫入：未執行
```

## FA-03B10 Push v2 enable／refresh technical contract v1

本章記錄 v1 review-freeze 當時的狀態；`user_reenable` reason 與平台 egress 層要求已於 `FA-03B10.3` 修訂，
現況以下方 `FA-03B10.3` 章節與契約 v1.1 為準。

已完成：

- 新增 `frontend-architecture-fa-03b10-push-v2-contract-2026-09-02.md`，明確分開 repo 已證明事實、使用者
  已確認產品決策、未來 implementation contract 與仍需 deployment evidence 的參數。
- D20 已固定：`auth_unavailable` 後驗證成功不自動 resume；使用者再次啟用時，必須先完成舊 binding cleanup，
  再產生新 binding、cleanup token 與 server consent epoch。
- v2 browser request、獨立 RSA-OAEP＋AES-GCM wire envelope、Edge exact input／output、canonical endpoint、
  P-256／auth key、VAPID、provider-origin policy、DB command、CAS、idempotency、lock order、legacy coexistence、
  B1 → B9 correlation 與測試矩陣已固定成 v1 review baseline。
- 為避免無必要的 IndexedDB migration，選定沿用 B5 v1 server snapshot；未來 DB consent `version` 要擴充成
  consent 或 transport 任一語意改變都遞增的統一 CAS。純 no-op 不遞增。
- provider origin 實值、TTL、timeout、rate limit 與 hosted egress 能力沒有 repo／canary 證據，因此契約只固定
  canonical config format 與 hard-disable gate，沒有猜 hostname 或秒數。
- 查核來源包含現有 B1～B9、007／008／011 migrations、legacy dispatcher，以及 W3C Push API、RFC 8030／
  8291、WHATWG URL、W3C Web Cryptography API、OWASP SSRF、web-push 3.x 與 Supabase Auth 官方文件。

精確邊界：

- 本批只新增／修改 Markdown；沒有新增 runtime、test、dependency、migration、Edge Function、env 或 UI 文案。
- `client_binding_id`、`transport_revision`、provisioning cancel、v2 Edge／RPC 名稱、
  hybrid envelope 與 `/push-subscription-key-v1.json` 都只是已凍結的 future contract，repo 目前尚不存在；
  不可寫成已實作。
- provider-origin allowlist 目前沒有 production 實值。（v1 原文，已由 v1.1 取代，見 D22）contract reviewer
  必須特別確認 DNS check 與實際 outbound socket 是否共用同一解析結果；若平台不能提供可證明的 egress
  allowlist，v2 需改走獨立 push gateway。
- 外部複核完成不等於 migration 已核可。`FA-03A4` 開始前仍須回報 exact diff（口徑見 `FA-03B10.3` 章節）並取得
  使用者確認。

本批驗證：

```text
repo／官方一手來源逐條交叉核對
Markdown code fence parity：通過
git diff --check：通過
runtime／test／dependency／migration：未變更
hosted deploy／env／request／DB 寫入：未執行
```

## FA-03B10.1 current-device Auth sign-out scope

已完成：

- production `signOut()` 不再使用 auth-js 的預設 global scope；現在經可單測的 `signOutCurrentDevice()`，明確傳入
  `{ scope: "local" }`。這與 [Supabase 官方 sign-out scope 定義](https://supabase.com/docs/guides/auth/signout)
  一致：只結束目前 session，其他裝置或 browser 的 session 維持有效。
- 沒有在外層再次取得 app Auth lock。既有 Supabase client 已把 `signOut` 放進同一個 storage lock；巢狀取得同名
  lock 會形成 deadlock，因此維持單層鎖。
- 新增 exact option 測試與 Supabase error mapping 測試；既有真實 GoTrueClient race test 仍證明 concurrent refresh
  不能在 local sign-out 後復活舊 session。

精確邊界：

- 本批只完成 D2 的 **Auth session scope**，沒有宣稱 Push cleanup 已完成。
- `handleSignOut()` 尚未依六步流程捕捉／unsubscribe／重讀 `PushSubscription`，也尚未接 B5～B8 cleanup。
- 現有 legacy Push row 在本批不會被刪除或 quarantine；沒有新增 Push request、migration、hosted deploy 或 DB 寫入。
- 因為完整 D2 要依賴尚未核可的 v2 enable／refresh 與 hosted no-send 能力，本批沒有用 legacy endpoint delete
  取代 durable owner quarantine。

本批驗證：

```text
auth storage／sign-out targeted：13／13 passed
完整 session unit：473 tests；472 passed、1 skipped、0 failed
mock Chromium：332 tests；328 passed、4 skipped、0 failed
production build：509 modules；bundle structural gate 通過
typecheck／ESLint／Prettier／git diff --check：通過
DB schema／migration：未變更；hosted deploy／env／Push request／DB 寫入：未執行
```

## FA-03B10.2 dormant browser Push deactivation seam

已完成：

- 新增無 import 的 `notificationPushDeactivation.ts`，以注入的 `readCurrentSubscription()` 固定 D2 登出六步流程
  的前四步：捕捉目前 subscription、呼叫一次 `unsubscribe()`、再讀一次、依實際結果分類。
- 每次呼叫最多讀 subscription 兩次、unsubscribe 一次；第一讀為 exact `null` 時回 `absent`，不做 unsubscribe。
- `unsubscribe()` 的 exact `true` 只記為 `deactivation-started`，exact `false` 只記為 `already-inactive`；throw 或
  非 boolean 只記 `unknown`。這些回傳值都不能單獨證明最終狀態。
- 第二讀為 exact `null` 才回 `deactivated`；endpoint exact 不同才回 `replaced`；相同 endpoint、讀取失敗、
  malformed handle 或其他結果全部 fail-closed 為 `unknown`。
- 結果只把 captured／replacement handle 交給未來明確 caller；本 module 不記錄、不持久化、不送 network，
  也沒有 timer、retry 或全域 browser dependency。
- `notification-push.test.js` 新增 production graph zero-reference 與無 network／storage／log／timer governance gate；
  新單元測試已加入正式 `test:session-unit` inventory。

精確邊界：

- 本批是 dormant seam，production 沒有 importer 或 caller；`handleSignOut()` 行為仍只有 B10.1 Auth local scope。
- 尚未建立 Service Worker registration adapter，也沒有接 B5 suspension、B7 owner quarantine、B8 token cleanup、
  legacy delete、replacement reconciliation 或 UI 提示。
- `captured.endpoint` 與 replacement handle 是 capability data；未來 caller 必須只傳給核可的 cleanup／refresh port，
  不得寫 log、error、analytics 或一般 app state。
- 本批不新增 timeout。若 browser promise 永久 pending，目前就會 pending；要訂 timeout 必須先有量測證據與
  對應的 unknown → durable quarantine caller。
- 沒有 runtime bundle、dependency、migration、hosted deploy、Push request 或 DB 寫入變更。

本批驗證：

```text
deactivation／governance／CI inventory targeted：52／52 passed
完整 session unit：488 tests；487 passed、1 skipped、0 failed
mock Chromium：332 tests；328 passed、4 skipped、0 failed
production build：509 modules；bundle bytes 與 B10.1 完全相同，structural gate 通過
typecheck／ESLint／Prettier／git diff --check：通過
production graph references：0
DB schema／migration：未變更；hosted deploy／env／Push request／DB 寫入：未執行
```

## FA-03B10.3 Push v2 契約複核與修訂

已完成：

- Claude 複核報告 `frontend-architecture-fa-03b10-push-v2-contract-review-claude-2026-09-02.md` 判定契約 §2 現況
  11／11 PASS，提出 4 項 blocking（B1–B4）與 P1–P4 待拍板項；使用者於 2026-09-02 拍板：blocking 全部照複核建議修、
  egress 放寬為應用層充分條件、envelope AAD 綁定 `authUserId`、不新增 reason 而沿用 `subscription_changed`、
  push-cleanup hosted 啟用列為 B12／B13 前置批次。
- 契約修訂為 v1.1，文件頭修訂紀錄列出 12 項：取消 `user_reenable`；§8 egress 採應用層充分條件並寫下殘餘風險、
  DNS 檢查改為 TOCTOU 減緩；§9.0 AAD 綁定 `authUserId` 並釘死長度；§9.5 401 先經 authoritative lookup 複驗；§10.2
  明列既有物件替換且 `client_binding_id not null` 不給 default；§10.3 rule 1 指定 pause reason；§10.4 predecessor
  null 走 same-owner rotation、predecessor 降為稽核資訊；§10.6 caller 預鎖 consent；§10.7 補 gate 承重理由；§13、
  §14、§16 同步。其中 §10.4 偏離複核 B1 建議的「三態一律先 pause 再旋轉」：`PUSH_PAUSE_CANNOT_ROTATE_CONSENT`
  （`202608310008:106-108`）、helper 只更新 `state = 'enabled'` row（`202608310011:384-389`）與
  `PUSH_REVOKED_CONSENT_CANNOT_PAUSE`（`202608310008:133-135`）使 paused／revoked 無法先 pause，v1.1 改為 `enabled`
  經 pause、`paused`／`revoked` 直接轉 enabled，轉 enabled 時寫 `reason_code = 'user_enabled'`，殘留清理共用契約
  §10.2 第 4 條的子 helper。
- 契約 §2「已由 repo 證明的現況」未變動；所有修訂都在 §3 之後的未來契約。

精確邊界：

- 本批新增複核報告一份，修改契約檔與本進度文件兩份 Markdown；沒有新增 runtime、test、dependency、migration、
  Edge Function、env、`vercel.json` 或 UI 文案。
- `client_binding_id`、`transport_revision`、`maintain_push_device_consent()` 的 `semantic_changed` 擴充、
  `quarantine_locked_push_consent` reason 白名單擴充、`/push-subscription-key-v1.json`、AAD 綁定與長度檢查都仍是
  future contract，repo 目前尚不存在；不可寫成已實作。
- 拍板寫入契約不等於 migration 已核可。`FA-03A4` 開始前仍須回報 exact diff（additive 欄位＋契約 §10.2 既有物件
  替換第 1–4 條，含殘留清理子 helper 抽取；兩者分開列）並取得使用者確認。
- 仍開放的檢查點只剩平台 egress 層證據（nice-to-have）與 DNS／socket 綁定實測（契約 §14 第 6 條 dispatcher
  generation／canary barrier 批，含自訂 `https.Agent` `lookup` 綁定 local canary）。

本批驗證：

```text
新增複核報告一份；修改兩個 Markdown：契約檔與本進度文件
Markdown code fence parity：通過
git diff --check：通過
runtime／test／migration：未變更
hosted deploy／env／request／DB 寫入：未執行
```

## FA-03B10.4 契約 v1.2 補充拍板

已完成：

- 使用者於 2026-09-02 補兩項拍板（D25、D26），契約升 v1.2：§10.4 新增「enabled、同 binding、無 transport」的
  transport 重建路徑並在判定順序明列；§10.5 改為只接受仍有 transport 的 enabled consent，無 transport 回 `stale`；
  §13 DB 明訂本機單一連線的 lock-order 替代斷言、兩個 canary 與真併發另案，並新增重建路徑測試項。
- 新增 `frontend-architecture-fa-03a4-handoff-2026-09-02.md`：給 `FA-03A4` 實作者的複核結果摘要與契約 v1→v1.2
  變動通知。

精確邊界：

- 只改契約檔、本進度文件與新增一份 handoff Markdown；沒有 runtime、test、migration、Edge、env 或 UI 變更。
- `FA-03A4` 仍待實作者回報 exact diff 並取得使用者確認；口徑不變（additive 欄位＋§10.2 既有物件替換第 1–4 條，
  含殘留清理子 helper 抽取；兩者分開列）。

本批驗證：

```text
修改兩個 Markdown、新增一個 Markdown
Markdown code fence parity：通過
git diff --check：通過
runtime／test／migration：未變更
hosted deploy／env／request／DB 寫入：未執行
```

## FA-03A4 Push v2 DB commands

已完成：

- 依契約 v1.2 新增單一 migration `202609030001_push_subscription_v2_commands.sql`。migration 有 884 行，
  `rg -n "^create( or replace)? function"` 列出 6 支函式：2 支既有函式替換、1 支 private residue helper、
  1 支共用 private mutation helper，以及 2 支 public service-role wrapper。
- additive 欄位明確只有兩個：`private.push_device_consents.client_binding_id uuid not null`（沒有 default）與
  `transport_revision uuid`。migration 開頭會在既有 consent 非空時中止，沒有猜測 backfill 值。
- 契約 §10.2 的既有物件替換第 1–4 條已分開完成：
  1. `private.maintain_push_device_consent()` 把 `transport_revision` 納入語意 version，並限制
     `client_binding_id` 只能在非 enabled → enabled 時更換。
  2. `private.quarantine_locked_push_consent(...)` 的 reason 白名單加入 `subscription_changed`。
  3. 既有 exact-column 斷言與兩份 pgTAP 的 5 個 consent fixture 都補上 `client_binding_id`。
  4. registry → transport → delivery cancel 的殘留清理由唯一的
     `private.clear_locked_push_consent_residue(...)` 承擔；父 helper 先 pause consent 再呼叫子 helper，v2 enable
     也只呼叫同一子 helper，沒有複製三段清理。
- `private.mutate_push_transport_v2(...)` 集中處理 enable／refresh 的 CAS、exact retry、same-owner rotation、
  legacy coexistence、同 binding 無 transport 重建與固定 consent → registry → transport 鎖序。
  `public.enable_push_device_v2(...)`、`public.refresh_push_transport_v2(...)` 只授權 `service_role`；沒有放寬 raw table
  ACL。runtime control 預設 disabled，現行 browser／Edge 沒有 caller。
- 新增 `push_subscription_v2_commands.sql` 77 項 pgTAP；更新兩份既有 pgTAP；generated DB types 只新增兩支
  public RPC，其中 enable 的 3 個 predecessor 參數由資料庫 default 正確產生為 optional。
- 完整 Supabase CI 發現本機 cleanup Edge fixture 仍直接 insert 舊 consent 欄位；已明確補入獨立
  `client_binding_id`，targeted Edge 測試與最後整套 CI 都通過。
- 逐段複查另找到並修正三個原測試未覆蓋的 fail-closed 缺口：Push command 不再嘗試建立缺 nickname／NTRP 的
  profile；predecessor 非空但 server consent 不存在時回 stale；同 binding 重建只允許 enabled consent，且 cleanup
  hash 必須相同。新增 6 項 pgTAP 分別證明不建立殘缺 profile、零寫入與 paused／revoked／hash mismatch 不會補 transport。

精確邊界：

- 目前只有 repo 與本機資料庫：該批完成時 `supabase migration list` 實測 37 份 local、25 份 remote，當時新增的 12 份
  FA-03 migration 均未套 hosted。沒有 deploy、遠端 mutation、secret、provider request、SW、dispatcher 或 UI 變更。
- 本機完整測試後 `push_device_consents`、`push_subscriptions`、`notification_deliveries` 都是 0；這只證明本機，
  不外推 hosted。hosted 套用前仍須唯讀確認 consent／registry 空表並取得另一次核可。
- A4 依 D26 只證明靜態鎖序與同 transaction 交錯收斂；沒有宣稱完成雙連線 deadlock 或三個寫入階段搶插測試。
  這些仍在 dispatcher barrier 批加 `dblink`。
- 驗證過程曾在「未重設 DB、連續再跑整套」時出現一次既有新帳號球場訂閱 UI checkbox 未及時更新；同一測試在
  乾淨 reset 後單獨通過，之後從乾淨 reset 跑完整 Supabase CI 也通過。沒有足夠證據宣稱根因已消失，因此保留為
  觀察項，不把它算成 A4 功能失敗或假裝未發生。
- development bundle 仍是 D8 report-only：total JS gzip 260,430，比參考值 259,062 多 1,368 bytes；main 與最大
  lazy chunk 各自在門檻內，結構 hard gate 通過。release 前仍依 D9 重訂並 enforce。

本批驗證：

```text
要求的 6 個 red canary：6／6 都能使指定斷言失敗；逐一還原後全綠
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test：37 migrations 從零重播成功
A4 targeted pgTAP：77／77 passed
npm run test:db：14 files，1,169／1,169 passed
Supabase DB lint（public＋private，warning）：0 issue
supabase db diff --local --schema public,private：No schema changes found
npm run test:local：3 Node API tests passed；Playwright 45 passed／11 skipped
npm run test:local:mobile：6／6 passed
npm run test:local:push-cleanup-edge：1／1 passed
npm run test:ci:supabase（乾淨 reset 後）：通過
npm run test:ci:frontend：通過；Playwright 328 passed／4 skipped；bundle structural gate passed
typecheck／ESLint／Prettier／production build／git diff --check：通過
hosted deploy／migration apply／env／request／DB 寫入：未執行
```

## FA-03B11 dormant Push v2 protocol／crypto／Edge ports

已完成：

- 新增唯一的 shared `push-subscription-v2-protocol.js`，同時提供 canonical endpoint、PushSubscription keys、
  VAPID fingerprint、provider-origin policy、enable／refresh inner JSON、outer envelope 與 public-key document
  驗證。沒有複製三份 browser／Edge／dispatcher 規則；共用 corpus 由 Node 與真實 Chromium／WebKit 執行。
- endpoint 保留 browser 原字串，使用 WHATWG `URL`，上限 4,096 UTF-8 bytes，只收 canonical HTTPS、default
  443、exact allowlisted origin。IP literal、single-label name 與 IANA 2026-05-22 Special-Use registry 目前列出的
  forward domain／subdomain 全部拒絕；清單來源是 <https://www.iana.org/assignments/special-use-domain-names>，沒有
  猜 FCM／Mozilla／Apple production hostname。
- `PUSH_PROVIDER_ORIGINS_V1` 的 shared parser 只接受 sorted、unique、non-empty canonical JSON string array；
  空白、重複、錯序、非 canonical 或特殊／本機名稱都 hard fail。SHA-256 digest 保留為 32-byte 原始值，未自行猜
  release evidence 的文字編碼。
- `p256dh`／`auth` 只收 canonical unpadded base64url；解碼長度分別固定 65／16 bytes，`p256dh` 必須以 `0x04`
  開頭並由 WebCrypto 真正 import 為 P-256 point。endpoint 與 VAPID fingerprint 使用契約指定算法。
- 新增獨立 RSA-OAEP-SHA256＋AES-256-GCM hybrid envelope：每次呼叫產生新的 32-byte AES key 與 12-byte IV，
  RSA label 固定 `qiuka.tw/push-subscription-v2/key/v1`，AES AAD 固定 prefix 後接 canonical lowercase
  `authUserId`。inner／outer 都驗 exact own keys 與固定順序；另一帳號重放、舊 fixed-only AAD、錯 label、錯 key、
  off-by-one 長度都 invalid。
- body 上限不是手填：測試以正好 4,096 UTF-8 bytes endpoint、最大 PostgreSQL bigint、完整 predecessor 的有效
  enable fixture 經 canonical JSON＋GCM tag＋RSA envelope 算出 `6,645` bytes，並鎖定實際加密 body 等於此值。
- 新增最多兩把 key 的 private key-ring loader、rotation 解密與 exact structural ports；ports 只有
  `verifyUser`、policy／key／VAPID loaders 與 enable／refresh command。沒有 `Deno.serve`、`fetch`、env reader、
  handler 或 production caller，因此仍是 dormant，不會打 Auth、DB 或網路。
- 新增完全獨立的 `/push-subscription-key-v1.json` build-only publisher、
  `PUSH_SUBSCRIPTION_PUBLIC_JWK_JSON` env、499-byte encrypt-only JWK document，以及 Vercel `no-store`／`no-cache`
  rule。測試 key 與 cleanup 測試 key 的 thumbprint 不同；新 publisher 也不 import cleanup protocol。
- ESLint／Prettier 與 required Chromium 專案已納入新 protocol、Edge 目錄與 browser WebCrypto spec；source scan 與
  build 證據都證明 production app／legacy dispatcher 沒有 import B11 runtime。

精確邊界：

- 沒有 production provider origin 實值、private key、VAPID key、Supabase env、hosted deploy 或 request；Vite 在 env
  空白時不發佈 placeholder key asset。
- 沒有實作 HTTP body reader、CORS、JWT authoritative lookup、DB command mapping、response mapping、browser
  coordinator 或 dispatcher send。這些不是 B11「structural ports」假裝完成的範圍。
- send-time DNS A／AAAA public-IP、禁止 3xx 的實際 transport 與 `https.Agent lookup` socket 綁定仍依契約留在
  dispatcher generation／canary barrier 批；本批只完成可共用的 exact-origin policy。
- 本批不改 migration 或本機 schema。Supabase 完整 gate 第一次在未 reset 的重複資料上重現既有「新帳號全球場
  checkbox 未打勾」觀察項；依 workflow 先 reset 37 migrations 後完整重跑通過，沒有把第一次誤報為成功。
- production JS build 與 A4 完全相同：main 647,082／190,278 raw/gzip、最大 lazy 16,476／4,830、total
  849,706／260,430；B11 沒有增加任何 production bundle byte。total gzip 仍依 D8 report-only 超標 1,368 bytes。

本批驗證：

```text
B11 Node protocol／crypto／asset／header targeted：42／42 passed
B11 真實 browser WebCrypto：desktop Chromium、mobile Chromium、mobile WebKit 各 1／1 passed
npm run test:session-unit：501 passed／1 skipped
npm run test:ci:frontend：通過；Playwright 330 passed／4 skipped；production build／bundle structural gate 通過
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test：37 migrations 從零重播成功
npm run test:db：14 files，1,169／1,169 passed
npm run test:local：3 Node API tests passed；Playwright 45 passed／11 skipped
npm run test:local:mobile：6／6 passed
npm run test:local:push-cleanup-edge：1／1 passed
npm run test:ci:supabase（乾淨 reset 後）：通過
typecheck／ESLint／Prettier／git diff --check：通過
hosted deploy／migration apply／env／request／DB 寫入：未執行
```

## FA-03B11.1 browser structure／server provider-policy 拆分（dormant）

已完成：

- 使用者選擇 A，Push v2 契約升為 v1.3；沒有把 server-only origins 公開給 browser，也沒有猜 provider hostname。
- shared protocol 新增 endpoint／subscription structure validator。canonical inner serializer 與 hybrid encryption
  只依結構驗證，不再接收 origins。
- Edge 解密後先驗 canonical inner，再以 server-only origins 完整驗 subscription；合法結構但 origin 未列入 policy 時
  回 `endpoint-unavailable`，不進 DB。
- 共用 corpus 分成 `structureValid` 與 `providerValid`；Node、Chromium、WebKit 都驗證「foreign canonical origin 在
  browser 通過、server 拒絕」。browser subscription port 也以真實 shared structure validator 組合測試。

精確邊界：

- production provider origins 仍未設定；production importer、HTTP transport、dispatcher、Hosted 與 migration 都未改。
- 本批只修正 dormant protocol 邊界，不代表 production 已能接收 v2 subscription。

本批驗證：

```text
Node protocol／browser port／governance：43／43 passed
desktop Chromium＋mobile WebKit protocol：2／2 passed
npm run test:ci:frontend：Node 547 passed／1 skipped；Playwright 344 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
typecheck／ESLint／Prettier／bundle structural gate／git diff --check：通過
Hosted deploy／migration／env／request／DB write：未執行
```

詳細證據見 `frontend-architecture-fa-03b11-provider-policy-split-2026-09-06.md`。

## FA-03B12.1 manual re-enable storage 起點（local-only）

已完成：

- B5 新增 `beginExplicitPushReenable(...)`，只接受 exact owner／binding／local revision，且只允許
  `auth-unverified`＋`auth_unavailable`。
- 同一 IndexedDB transaction 把舊 current binding 轉成一筆 reason 固定為 `subscription_changed` 的 pending
  cleanup；沒有先刪除再跨 transaction 補寫的空窗。
- 兩個 tab 以同一份 CAS 同時操作時，收斂到同一 attempt；不產生第二筆 cleanup 或第二把 token。
- CAS、狀態或 reason 不符都回既有 `PUSH_STORAGE_STALE`；transaction abort 時舊 binding 完整 rollback。
- 實測 cleanup 完成前 runtime 保持 `cleanup-pending`；完成後才可用既有 B5 API 建立全新的 binding 與 cleanup
  token，兩者都不重用舊值。

精確邊界：

- 本批只有 dormant storage action 與真實 browser IndexedDB 測試；production graph 仍為零 caller。
- 沒有自動 Auth 恢復、B1 correlation、B8 transport caller、enable／refresh coordinator、SW、UI 或 production
  wiring；因此不能宣稱 B12 完成。
- 沒有 migration、Hosted、provider request、timeout、retry、backoff、scheduler 或 production 設定變更。
- production bundle bytes 不變；total gzip 仍是既有 D8 report-only 超額 1,368 bytes。

本批驗證：

```text
push-storage targeted：10／10 passed
npm run test:ci:frontend：Node 509 passed／1 skipped；Playwright 334 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
typecheck／ESLint／Prettier／bundle structural gate／git diff --check：通過
hosted deploy／migration apply／env／request／DB 寫入：未執行
```

## FA-03B12.2 Auth failure correlation seam（local composition only）

已完成：

- B1 `authRefreshCoordinator` 新增 optional `onVerificationFailure(...)`，只送 `kind`、verification revision 與
  optional `priorVerifiedAuthUserId`；不送 error、session、access token 或 refresh token。
- prior owner 只來自同一 coordinator 曾成功發布的 verified proof；cold boot 不猜 owner，`SIGNED_OUT` 與 confirmed
  anonymous 會清除舊 owner。
- fail-close 的 async publication 期間若出現較新 Auth event，舊 result 不發 callback；穩定的第二次
  `superseded` 可回報分類，但未來 adapter 必須禁止它進 B9。
- callback 預設 no-op 且 throw 會被隔離；現行 production composition 沒有提供 callback，所以沒有新增 Push caller
  或 side effect。

精確邊界：

- 這批建立 B1 的可信 correlation 資料出口，尚未建立 B1 → B9 adapter，也沒有讀 B5 binding。
- warm／cold 分流、B8 cleanup 與手動 re-enable coordinator 仍待 local composition；production Push 仍未接線。
- 沒有 migration、Hosted、provider request、timeout、retry、backoff、scheduler 或 UI 變更。
- 因 auth coordinator 原本就在 production graph，main 增加 222 raw／112 gzip，total gzip 增加 125 bytes；既有 D8
  report-only 超額因此為 1,493 bytes。沒有調整任何 bundle 門檻，其他 byte 與 structural gate 都通過。

本批驗證：

```text
Auth coordinator targeted：32／32 passed
npm run test:ci:frontend：Node 511 passed／1 skipped；Playwright 334 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
typecheck／ESLint／Prettier／bundle structural gate／git diff --check：通過
hosted deploy／migration apply／env／request／DB 寫入：未執行
```

## FA-03B12.3 Auth failure correlation adapter（dormant）

已完成：

- 新增無 import 的 `notificationPushAuthCorrelation.ts`，以 injected revision check、B5 runtime read 與 B9 port
  組成；production graph 對它是零 reference。
- notice 進入 B9 前後有兩次 current-revision gate；`superseded`、舊 revision、malformed notice、非 active binding
  runtime 都不呼叫 B9。
- warm session 的 `priorVerifiedAuthUserId` 必須與 B5 binding owner 完全相同；不符時回 `ignored`。
- cold session 不發明 Auth owner：binding owner 只作 B5/B9 local CAS identity；`unavailable` 仍只能 local close，
  `rejected` 仍只能由既有 B9 交 B8 token cleanup，adapter 沒有 authenticated owner RPC port。
- port throw 與非 exact B9 result 一律回 detail-free `pending`。

精確邊界：

- 目前只有 adapter 與 injected fake port 測試；尚未把 B12.2 callback 接到 adapter，也沒有 concrete B5／B8／B9
  composition。
- 沒有 Auth、Supabase、network、browser storage、log、timer、retry 或 scheduler direct dependency。
- production bundle 與 B12.2 完全相同；total gzip 仍是既有 D8 report-only 超額 1,493 bytes。
- 沒有 migration、Hosted deploy、provider request、DB 寫入或 UI 變更。

本批驗證：

```text
adapter／governance targeted：22／22 passed
npm run test:ci:frontend：Node 518 passed／1 skipped；Playwright 334 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
typecheck／ESLint／Prettier／bundle structural gate／git diff --check：通過
hosted deploy／migration apply／env／request／DB 寫入：未執行
```

## FA-03B12.4 manual re-enable coordinator（local-only）

已完成：

- 新增無 import 的 `notificationPushManualReenableCoordinator.ts`，只透過 injected ports 串接 B12.1 storage、B8
  cleanup、future enable 與 verified Auth proof check；production graph 對它是零 reference。
- 固定流程為 `proof → re-enable storage → proof → cleanup → proof → new provisioning → proof → enable → proof`；
  每個 async boundary 後都重新確認同一 owner／revision 的 Auth proof。
- cleanup attempt 必須和原 `auth-unverified` binding 的 owner、binding、revision、device 與 server consent 完全相符；
  只有 exact `{kind: "completed"}` 才建立新 provisioning。
- 新 provisioning 沿用同一 logical device，但 binding ID 與 cleanup token 都不能重用；舊 server consent 只作同一次
  enable call 的 in-memory predecessor。
- enable 只有 exact `{kind: "committed"}` 且最後 Auth proof 仍有效時才回 committed；malformed、contract drift、
  pending 或 throw 一律回 detail-free pending。
- 真實 Chromium 組合測試使用實際 B5 IndexedDB 與 B8 coordinator，證明 cleanup 完成後才呼叫 enable，且舊新
  binding／token 不同、pending attempt 歸零。

精確邊界：

- `enableProvisioning` 仍是 injected port；browser enable／refresh transport、Edge HTTP/Auth/DB composition、provider
  request 與 production caller 尚未實作。
- Chromium 測試的 enable port 只做本機 commit，不能當成 server enable 證據。
- 沒有 production importer、UI、timer、retry、scheduler、migration 或 Hosted 變更，也沒有跨 tab network 去重。
- production bundle 與 B12.3 完全相同；total gzip 仍是既有 D8 report-only 超額 1,493 bytes。

本批驗證：

```text
npm run test:session-unit：Node 526 passed／1 skipped
npm run test:ci:frontend：Node 526 passed／1 skipped；Playwright 336 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
typecheck／ESLint／Prettier／bundle structural gate／git diff --check：通過
hosted deploy／migration apply／env／request／DB 寫入：未執行
```

## FA-03B12.5 provisioning cancel storage action（local-only）

已完成：

- B5 新增 `cancelExplicitPushProvisioning(...)`，只接受 exact owner／binding／local revision 與 canonical UUID。
- 單一 IndexedDB transaction 做 CAS、確認 state 仍是 `provisioning`，再只刪 current binding；logical device 保留，
  pending cleanup 維持零，schema／DB version 不變。
- stale revision、已 enabled、invalid input、完成後 replay 都不刪資料；transaction abort 時 provisioning 完整 rollback。
- 這個 action 只提供 future browser coordinator 在能證明 enable network 尚未開始時呼叫；storage 不自行猜 network
  狀態。

精確邊界：

- request 可能已送出後的 unknown／abort／crash 仍必須保留 provisioning 與 token；本批沒有改這條契約。
- 沒有 production importer、UI、service worker、enable／refresh transport、Edge composition 或 Hosted 變更。
- production bundle 與 B12.4 完全相同；total gzip 仍是既有 D8 report-only 超額 1,493 bytes。

本批驗證：

```text
push-storage targeted：13／13 passed
npm run test:ci:frontend：Node 526 passed／1 skipped；Playwright 340 passed／4 skipped；build 509 modules
npm run test:ci:supabase（乾淨 local reset 後）：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
typecheck／ESLint／Prettier／bundle structural gate／git diff --check：通過
hosted deploy／migration apply／env／request／DB 寫入：未執行
```

第一次 Supabase CI 的 DB 全過但 local API fixture 被 discovery 100 筆上限截掉；唯讀查證七日窗已累積 223 場
本機測試球局。防呆 script 確認 target 是 `127.0.0.1:54321` 後重建本機測試 DB、重播 38 migration，再跑即全過。
這次只刪除不可復原的本機測試資料，沒有碰 Hosted／production。

## FA-03B12.6 refresh commit storage action（local-only）

已完成：

- B5 新增 `commitPushRefresh(...)`，只接受 exact owner／binding／device／local revision、完整 expected consent 與
  server response consent。
- response 必須保持同 consent ID／epoch，version 只能和 expected 完全相同或恰好 `+1`；其他語意漂移在 storage
  transaction 前即拒絕。
- transaction 內再次確認目前仍是 exact enabled binding 與舊 server consent。exact no-op 不寫資料、不改 local
  revision；version `+1` 才更新 server consent 並產生新 local revision。
- local commit 後重放同一 response 會回同一份 safe binding，不會再次增加 revision。
- stale consent／local revision、invalid input 與 transaction abort 都完整保留舊 enabled binding。

精確邊界：

- 本批只建立 refresh response → B5 local commit；沒有取得 PushSubscription 或送 network request。
- 沒有 production importer、UI、service worker、browser transport、Edge composition、migration 或 Hosted 變更。
- production bundle 與 B12.5 完全相同；total gzip 仍是既有 D8 report-only 超額 1,493 bytes。

本批驗證：

```text
push-storage targeted：15／15 passed
npm run test:ci:frontend：Node 526 passed／1 skipped；Playwright 344 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
typecheck／ESLint／Prettier／bundle structural gate／git diff --check：通過
hosted deploy／migration apply／env／request／DB 寫入：未執行
```

## FA-03B12.7.1 policy-neutral subscription coordinator（local-only）

已完成：

- 新增無 import 的 `notificationPushSubscriptionCoordinator.ts`，只透過 injected Auth／browser／storage／transport
  ports 串起 enable 與 refresh；建立 coordinator 本身不會產生任何副作用。
- enable 與 refresh 都在唯一一次 network call 前後重新確認 verified Auth proof 與 exact durable local snapshot；stale、
  malformed、throw 或 contract drift 一律保留現況並回 detail-free pending。
- enable 只有在 exact `cancelled-before-network` 時才呼叫 B12.5；收到 exact committed response 才呼叫 B5
  `commitPushProvisioning`。refresh 永不取消 provisioning，只透過 B12.6 `commitPushRefresh` 提交。
- exact unauthorized 只把 owner／revision 通知 Auth，不傳 bearer；若 Auth proof 已被取代則不送通知。
- governance test 確認 production graph 零 reference、沒有直接 Auth／browser／network／storage／log／timer dependency，
  也沒有 retry loop。

精確邊界：

- 測試只使用 fake ports；沒有真實 PushManager、Service Worker、加密、HTTP、Edge request 或 production composition。
- 本層只確認 subscription 三欄 exact 且非空；canonical key、endpoint 與 provider allowlist 留給具體 port。
- v1.2 server-only origins 與 B11 browser serializer 的衝突沒有被繞過。A／B 未決前不改 B11、不實作具體 transport。
- 沒有 UI、migration、Hosted deploy、secret、env、provider request 或 Hosted DB 寫入；production bundle 不變。

本批驗證：

```text
subscription coordinator targeted：8／8 passed
npm run test:session-unit：Node 536 passed／1 skipped（537 tests）
npm run test:ci:frontend：Node 536 passed／1 skipped；Playwright 344 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
typecheck／ESLint／Prettier／bundle structural gate／git diff --check：通過
hosted deploy／migration apply／env／request／DB 寫入：未執行
```

詳細證據見
`frontend-architecture-fa-03b12-policy-neutral-subscription-coordinator-2026-09-04.md`。

## FA-03B12.7.2 browser subscription port（provider-neutral／local-only）

已完成：

- 新增 dormant `notificationPushBrowserSubscription.ts`；只有 `preparePushSubscription` 被呼叫時才碰 Notification、
  Service Worker 與 PushManager，production graph 對它維持零 reference。
- enable 才能開 permission prompt；refresh 不開 prompt。只有 enable 在任何 Service Worker／PushManager 動作前得到
  exact denied／default，才回 `cancelled-before-network` 交 B12.5。
- 固定 `register('/push-sw.js')` 後等待 `navigator.serviceWorker.ready`，不用 register 的立即回傳 registration。
- VAPID public key 必須是 canonical base64url、65-byte uncompressed P-256 key；現有與新建 subscription 都再次比對
  `options.applicationServerKey`。
- VAPID 不同時先 unsubscribe、重讀，再於 exact null 時建立 replacement；殘留不同 key 時 fail-closed。
- 瀏覽器原樣的 endpoint／auth／p256dh 不 trim、不改寫；只有 injected validator 回 exact 相同三欄才 ready。
- browser／validator throw、abort、native shape drift 一律 detail-free pending；開始 browser side effect 後不回 cancellation。

精確邊界：

- production validator 未實作；A／B 決策前不碰 provider allowlist，也不匯入 B11 protocol。
- Node 測試只用 fake browser ports，沒有真實 Service Worker／Push provider；現行 legacy Push UI／runtime 未改。
- 沒有 app HTTP、Auth、IndexedDB、UI、migration、Hosted deploy、secret、env、provider request 或 Hosted DB 寫入；
  production bundle 不變。

本批驗證：

```text
browser subscription port targeted：8／8 passed；related Push targeted：39／39 passed
npm run test:session-unit：Node 546 passed／1 skipped（547 tests）
npm run test:ci:frontend：Node 546 passed／1 skipped；Playwright 344 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
typecheck／ESLint／Prettier／bundle structural gate／git diff --check：通過
hosted deploy／migration apply／env／request／DB 寫入：未執行
```

詳細證據見 `frontend-architecture-fa-03b12-browser-subscription-port-2026-09-04.md`。

## FA-03B12.7.3 browser encrypted HTTP transport（local-only）

已完成：

- 新增 dormant `notificationPushSubscriptionTransport.ts`；只接受 exact v2 Function endpoint，production HTTPS、
  local loopback HTTP，建構時零 network。
- fixed same-origin 499-byte public-key loader 驗 exact URL／status／content-type／`no-store`／無 redirect／canonical JWK。
- enable 只把 raw cleanup token 的 SHA-256 digest 放進 inner payload；enable／refresh 都用 B11 hybrid envelope 與
  `authUserId` AAD，POST body 不含 endpoint、keys 或 raw token。
- 每次明確呼叫最多一個 POST；沒有 retry、timeout、backoff、排程或 provider allowlist。
- success／non-success 只接受 v1.3 exact status、bounded canonical JSON 與 response headers；401 只交回 Auth，其他
  network／header／URL／body drift 都回 `unavailable`。
- Node 與真實 Chromium／WebKit 都把 browser envelope 交 Edge decrypt，驗證 enable token digest 與 refresh consent
  payload 完全相符；governance 證明 production graph 零 importer。

精確邊界：

- 尚未和 B12.7.1 coordinator、browser acquisition、B1 Auth 或 B5 storage 做 concrete composition。
- Edge HTTP/Auth/DB handler、production keys／provider policy、UI、SW、dispatcher、migration 與 Hosted 都未改。
- production bundle byte 完全不變；total gzip 維持既有 D8 report-only 超額 1,493 bytes。

本批驗證：

```text
transport Node targeted：9／9 passed
desktop Chromium＋mobile WebKit transport：2／2 passed
npm run test:ci:frontend：Node 558 passed／1 skipped；Playwright 346 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
typecheck／ESLint／Prettier／bundle structural gate／git diff --check：通過
Hosted deploy／migration／env／request／DB write：未執行
```

詳細證據見 `frontend-architecture-fa-03b12-encrypted-subscription-transport-2026-09-06.md`。

## FA-03B12.7.4 local Push v2 subscription composition（local-only）

已完成：

- 新增 dormant `notificationPushSubscriptionLocalComposition.ts`，把 B5 storage、B11.1 browser structure validator、
  B12.7.1 coordinator、B12.7.2 browser acquisition 與 B12.7.3 encrypted transport 接成單一 local factory。
- storage、browser 與 transport 共用 caller 注入的 WebCrypto；Auth proof 仍是明確 port，不自行讀 Supabase session。
- factory 建構本身不開 IndexedDB、不碰 Service Worker、不 fetch；只有 caller 明確呼叫 coordinator 或 storage 方法
  才會執行對應動作。
- 真實 Chromium 與 WebKit 測試走完整 enable：先建立 durable provisioning，再取得 browser subscription、讀公鑰、
  加密並只送一個 POST；只有 exact committed response 才用 B5 CAS 寫成 enabled。
- 測試再由 Node 解開瀏覽器送出的 envelope，確認 `authUserId` AAD、device、binding、predecessor 與 cleanup token
  digest 都和 durable local snapshot 相符。
- governance 證明 production graph 零 importer，composition 不含 provider origins、app data API、Supabase client、
  logging、timer、retry 或 scheduler。

精確邊界：

- 正式 App 尚未 import factory；現行 UI 與 legacy Push 行為不變。
- production Auth adapter、VAPID／key／Function endpoint config、Edge HTTP／Auth／DB handler、SW、dispatcher 與 UI
  尚未接線。
- 沒有 provider hostname、timeout 或 production policy 推測；沒有 migration、Hosted deploy、secret、request 或 DB write。
- production bundle 完全不變；total gzip 維持既有 D8 report-only 超額 1,493 bytes。

本批驗證：

```text
composition Node targeted：2／2 passed
desktop Chromium＋mobile WebKit full local enable composition：2／2 passed
npm run test:ci:frontend：Node 562 passed／1 skipped；Playwright 348 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
typecheck／ESLint／Prettier／bundle structural gate／git diff --check：通過
Hosted deploy／migration／env／request／DB write：未執行
```

詳細證據見 `frontend-architecture-fa-03b12-local-subscription-composition-2026-09-06.md`。

## FA-03B12.8 Push v2 Edge HTTP／Auth／DB composition（local-only）

已完成：

- 新增 local-only `push-subscription-v2` Edge handler、runtime gate 與 adapters；exact Origin／CORS、method、media
  type、content encoding、bounded canonical envelope 與 bearer 格式都在 Auth／DB 前 fail-closed。
- bearer token 由 `GET /auth/v1/user` authoritative verification；anon key 只作 `apikey`，不當使用者身分。
  rejected 精確回 401；Auth dependency／contract drift 回 503。
- Edge 以已驗證的 `authUserId` 解密 AAD，再載入 server-only provider policy、RSA key ring 與 VAPID public key；
  foreign provider 在 DB 前回 409，browser 不取得 provider origins。
- service role adapter 只呼叫既有 `enable_push_device_v2`／`refresh_push_transport_v2`；只讓 exact v1 command
  result 穿過 response boundary，未知或漂移結果 fail-closed。
- Hosted markers 存在時不能啟用 local mode；只有非 Hosted exact `local-test-v1` 才建立 handler，其餘固定 503。
- `verify_jwt = false` 讓 handler 自己處理 OPTIONS 與 authoritative Auth 401／503 分類；不是略過使用者驗證。
- 真實 local Edge smoke 已走 JWT → Auth `/user` → encrypted enable／refresh → server policy → A4 RPC → local DB，
  並驗 invalid JWT、foreign provider、惡意 Origin suffix、重送收斂與敏感值 output scan。
- smoke 的 runtime control snapshot 改用 `json_build_object` 保留 NULL；連跑兩次都完成並還原 fixture。
- 完整 CI 另揭露既有 court subscription checkbox auto-save 測試 race；只補等待權威 save，production code 未改，
  已獨立 commit `dc6b947`。

精確邊界：

- 正式 App 仍未 import local composition；browser composition 尚未直接連到 real local Edge。
- production Origin／provider origins／VAPID／RSA／Function endpoint 均未填值；Hosted app gate 仍固定關閉。
- 本批沒有 migration、Hosted deploy、env／secret mutation、Hosted request 或正式 DB write。
- 沒有加入 retry、timeout、backoff、scheduler、UI、SW 或 dispatcher；production bundle 完全不變。

本批驗證：

```text
Push v2 handler／adapter targeted：16／16 passed
npm run test:ci:frontend：Node 578 passed／2 skipped；Playwright 348 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；cleanup Edge 1／1；Push v2 Edge 1／1
git diff --check：通過
production bundle：main 647,304／190,390；最大 lazy 16,476／4,829；total 849,928／260,555 raw/gzip
Hosted deploy／migration／env／secret／request／DB write：未執行
```

詳細證據見 `frontend-architecture-fa-03b12-edge-handler-local-2026-09-07.md`。

## FA-03B12.9 browser → real local Edge → DB composition

已完成：

- 擴充既有 Push v2 local Edge smoke，啟動真實 Vite public-key middleware 與 Chromium，走 B12.7.4 local
  composition 的 storage、browser port、transport 與 coordinator。
- 真實 browser IndexedDB／WebCrypto 先建立 provisioning、取得同源 RSA public key、加密後經跨 origin CORS POST
  到本機 Edge；Edge 再走 Auth `/user`、server provider policy 與 A4 enable RPC，exact response 才寫回 IndexedDB。
- 同一 browser binding 接著走 refresh；A4 exact no-op 與 browser local CAS 都保持相同 consent／binding／revision。
- deterministic `Notification`／`PushManager` port 取代外部 provider subscription；加密、HTTP、CORS、Auth、DB 與
  IndexedDB 均走真實實作。沒有把測試 endpoint 當 production provider。
- browser 內檢查兩個 POST body 均不含 plaintext endpoint 或 raw cleanup token；runtime output 敏感值 scan 也通過。
- Chromium、Vite、Edge、Auth／DB fixture、IndexedDB 與 runtime control 都有固定 teardown；current smoke 連跑與完整
  Supabase CI 均通過。
- 第一次完整 CI 找到 court subscription test 在初始權威 GET 完成前就操作的 race；只修測試等待 DB＋UI，不改
  production code，獨立 commit `6f7d98a`。

精確邊界：

- 正式 App 仍為零 importer；production UI、Auth／config wiring、SW、dispatcher 與 Hosted runtime 都未改。
- production Origin／provider／VAPID／RSA／Function endpoint 仍無實值；沒有 migration、Hosted mutation 或 request。
- 自動測試未連真實外部 Push provider；沒有新增 timeout、retry、backoff 或 scheduler。

本批驗證：

```text
browser → real local Edge targeted：連跑通過；完整 Supabase CI 再通過 1／1
npm run test:ci:frontend：Node 578 passed／2 skipped；Playwright 348 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；cleanup Edge 1／1；Push v2 browser-to-Edge 1／1
production bundle：與 B12.8 相同，total gzip report-only 超額 1,493 bytes
Hosted deploy／migration／env／secret／request／DB write：未執行
```

詳細證據見 `frontend-architecture-fa-03b12-browser-edge-local-2026-09-07.md`。

## FA-03B13 production wiring preflight

已完成唯讀盤點：

- 畫面三個 `onEnablePush` caller 最後都進 `notificationFeature.enablePushNotifications()`，目前仍是
  `/push-sw.js` subscription → legacy `save_push_subscription` RPC。
- B1 內部持有 authoritative verified session 與 verification revision，但沒有供 Push v2 讀取／驗 current 的 port；
  `controller.authEpoch` 是 UI ownership epoch，不能代替它。
- B12.2 failure callback 已存在，但 profile orchestration 沒有接 callback；B12.3／B9 因此仍是 production 零 caller。
- browser 只有 legacy VAPID config；v2 envelope public-key asset 已獨立，但 production Function endpoint 沒有
  frontend export，legacy／v2 VAPID 對應也尚未取得 production 證據。
- Edge Hosted hard gate 與 DB `new_runtime_mode = 'disabled'` 是兩層獨立 server gate；browser 不可讀 private control
  table，也不能用 public flag 取代 server gate。
- 現行 SW 只有 `push`／`notificationclick`；initial enable 可沿用，但 `pushsubscriptionchange` 仍須獨立批次。
- cleanup Hosted、dispatcher generation／canary barrier、privacy 更新與 production values 仍是後續 blocker。

下一批縮成 `FA-03B13.1` Auth proof adapter：只補 B1 verified proof／revision current-check、401 authoritative retry 與
failure notice 接口；不 import v2 composition、不改 UI、不要求通知權限、不送 Edge request、不碰 Hosted。

完整盤點見 `frontend-architecture-fa-03b13-production-wiring-preflight-2026-09-07.md`。

## FA-03B13.1 Auth proof adapter

已完成：

- B1 coordinator 暴露最小 verified Auth authority：讀目前 proof、依 owner／revision 精確讀取、檢查 revision／
  proof 是否 current，以及 exact `401` 後 authoritative retry。
- proof 只在記憶體保存 owner、access token 與 revision；每次讀取回 frozen copy。新 Auth event、登出、fail-closed
  或 proof 替換會立即讓舊 proof 失效。
- `401` 只有完全符合目前 verified owner／revision 才先關閉私人狀態再重驗；stale／foreign notice 不做事。
- profile orchestration 在 Auth subscription 前交出 optional authority，並轉交既有 privacy-safe failure notice；
  callback 錯誤不會破壞 Auth fail-closed。
- 複查並修正 same-proof `TOKEN_REFRESHED` publication race：重複 fresh event 共用 apply，proof 收斂到最新 revision。

精確邊界：

- `src/main.js` 尚未提供 callback；Push v2 production graph 仍是零 importer／caller，legacy UI 行為不變。
- 沒有 browser network、通知權限、storage、SW、dispatcher、migration 或 Hosted 變更。
- production values 未填；Edge／DB server gates 保持關閉。

本批驗證：

```text
targeted Auth／orchestration：34 top-level／37 tests passed
npm run test:ci:frontend：Node 581 passed／2 skipped；Playwright 348 passed／4 skipped；build 509 modules
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；cleanup Edge 1／1；Push v2 browser-to-Edge 1／1
production bundle：main 648,934／190,804；最大 lazy 16,476／4,830；total 851,558／260,967 raw/gzip
bundle total：依 D8 report-only，較參考值多 1,597／1,905 raw/gzip bytes
Hosted deploy／migration／env／secret／request／DB write：未執行
```

第一次補跑前確認 local DB 已累積 184 筆同場地測試 session，使既有 200 筆 discovery cap 無法保證帶回新
fixture；使用 guarded script 只重設 `http://127.0.0.1:54321` 並從零重播 38 migrations。精確目前 source 的完整
Supabase CI 隨後通過；不是 production drift，Hosted 未動。

詳細證據見 `frontend-architecture-fa-03b13-auth-proof-adapter-2026-09-07.md`。

## FA-03B13.2 default-off composition shell

已完成：

- `main.js` 在 app 層只建立一次 hard-coded `disabled` shell，並接收 B13.1 authority／failure callback。
- shell 只有 enabled 且實際需要 runtime 時才 dynamic import；disabled 收到 callback 固定忽略，不觸發 loader。
- 新 runtime composition 集中組合 subscription storage／browser／transport／coordinator、cleanup transport／B8、B9
  Auth failure、B1 correlation 與 manual re-enable；共用同一 storage 與 authority。
- 同 authority 的並行讀取共用一份 runtime；authority 在 import 中被替換時，舊 runtime 不得發布。
- storage 將 `beginExplicitPushReenable` 回傳型別收窄為實作已保證的 `subscription_changed`，沒有 cast 或行為變更。
- 舊 source graph 測試已由「零 reference」精確改成「只能由 lazy runtime composition 引用」。

精確邊界：

- disabled shell 不載入完整 runtime、不開 IndexedDB、不註冊 SW、不問權限、不送 request；legacy UI／RPC 不變。
- production build 沒有輸出重型 v2 runtime identifiers；Edge／DB server gate 都保持 disabled。
- 沒有 production config、migration、Hosted mutation、dispatcher、sign-out cleanup 或 UI 文案變更。

本批驗證：

```text
shell／composition targeted：6／6 passed；Push source-boundary targeted：27／27 passed
npm run test:ci:frontend：Node 587 passed／2 skipped；Playwright 348 passed／4 skipped；build 524 modules／32 files
npm run test:ci:supabase：DB 1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；cleanup Edge 1／1；Push v2 browser-to-Edge 1／1
production bundle：main 650,134／191,175；最大 lazy 16,476／4,830；total 852,758／261,346 raw/gzip
bundle total：依 D8 report-only，較參考值多 2,797／2,284 raw/gzip bytes
Hosted deploy／migration／env／secret／request／DB write：未執行
```

完整證據見 `frontend-architecture-fa-03b13-default-off-composition-2026-09-07.md`。

## FA-03B13.3 UI／隱私前置盤點

已完成：

- 查明正式畫面的三個 Push 入口都共用 `main.js` 的 legacy `enablePushNotifications()`；目前 UI 只有
  `idle`／`denied`／`unsupported`／`enabled` 四種記憶體狀態，並不代表 v2 IndexedDB 權威狀態。
- 逐項核對 v2 storage 實際有 `disabled`、`enabled`、`auth-unverified`、`cleanup-required`、
  `cleanup-pending`、`provisioning`、`invalid`、`unavailable` 八種狀態。HTTP／Edge operation 的
  `unavailable` 另屬單次動作結果，不能當成新的持久化狀態。
- 確認 `cleanup-required`／`cleanup-pending` 可提案共用使用者畫面，但底層仍須分開；`provisioning`、
  `invalid`、storage `unavailable` 的原因與安全動作不同，不能無依據壓成原先四種狀態。
- 建議在 `sessionPresentation.ts` 建立單一 typed mapping，三個入口只接 derived UI state，不把 token／binding／
  consent 原始資料帶進 UI，也不靠 React effect 複製狀態。
- 查明隱私頁目前只列 localStorage／sessionStorage，尚未涵蓋 v2 IndexedDB；Supabase 說明也未涵蓋 C0 已實測的
  Edge 平台 raw source-IP log。文件只引用本專案已完成證據，不外推所有 Supabase 服務。

待確認：

- 八種狀態的顯示分組與操作。
- 是否先做 dormant UI mapping＋隱私更新，legacy 正式功能與 v2 disabled 都保持不變。
- `invalid` 先只顯示支援資訊，或未來提供會刪除本機 Push 資料的重設流程。
- 隱私頁是否只寫已查證的 Edge source-IP log 與 v2 IndexedDB 範圍。

精確邊界：本批只新增盤點文件；沒有改 runtime、UI、隱私頁、測試、migration、Hosted 或設定。完整內容見
`frontend-architecture-fa-03b13-ui-privacy-preflight-2026-09-07.md`。

## FA-03 dispatcher generation／canary barrier 前置盤點

已完成：

- 2026-09-07 重新唯讀查詢並下載 Hosted `notification-outbox-dispatch`：目前 ACTIVE version 14、
  `verify_jwt=false`；`index.ts`／`dispatch.js` 與 repo SHA-256 相同且逐 byte 相同，沒有 production source drift。
- 查明現行 worker 只做 legacy outbox attempts CAS；它不讀 runtime control／generation／canary，也沒有 worker 或
  delivery lease、send 前 fresh-check、per-device outcome 或 v2 finalizer。
- 查明 404／410 仍依 endpoint 直接 delete，TTL 是 `web-push@3.6.7` 預設四週，socket timeout／總 deadline 都未設，
  也尚無 dispatcher Edge→DB→mock provider integration test。
- 核對 local DB：runtime mode disabled、generation 1、所有 duration／attempt policy 為 null，worker／canary／delivery／
  v2 outbox／v2 subscription 都是 0。
- 核對 upstream `web-push@3.6.7` 確實接受 `TTL`、`timeout` 與 `https.Agent`；Deno compatibility、DNS 綁定與
  redirect 仍需 local canary，不以 source inspection 冒充實測。
- 確認 barrier 不能只靠 `supabase-js` REST：Q6-A 要在外部 Push request 期間保持同一 DB transaction，需直接
  Postgres transaction connection、最小權限 role／commands 與 Hosted DB connection secret。

下一步分成 D0 source-only dormant core、D1 additive DB command migration、D2 compatible dispatcher、D3 Hosted
canary／generation rotation、D4 legacy cutoff。D1 migration 只新增 dormant command／role／測試，不改 control 值、
legacy row／cron，也不 deploy；開始前需使用者核可。完整內容見
`frontend-architecture-fa-03-dispatcher-barrier-preflight-2026-09-07.md`。

## FA-03 dispatcher D0.1 dormant egress core

已完成：

- 新增未被 active dispatcher 匯入的 `v2-egress.js`；沿用 B11.1 server-only policy，只有 canonical endpoint exact
  命中 canonical provider origin 才能準備 egress。
- A／AAAA 全部查詢並逐筆依 IANA `Globally Reachable` 規則檢查；ENODATA 之外的 resolver failure、空結果、
  private／documentation／mixed result 都 fail-closed。
- 已驗證位址交給 hostname-exact pinned lookup 與 `https.Agent`，禁止重新 DNS lookup／換 host；agent 不 keep-alive、
  單一 socket。
- TTL 只用 DB time／expiresAt／request deadline／safety budget 的 injected 毫秒值計算，無預設秒數；不足固定 0。
- 新增 7 tests、session unit 聚合、ESLint／Prettier 與唯一 dormant dispatcher reference gate；active `index.ts`／
  `dispatch.js` hash 未變，production Vite bundle byte 數與 B13.2 完全相同。

驗證：targeted 44／44；Node 594 passed／2 skipped；Playwright 348 passed／4 skipped；DB 1,198／1,198；local API
4／4、desktop 45／11 skipped、mobile 6／6、兩支 Edge 1／1。Hosted deploy／migration／env／secret／request／DB write
均未執行。這是 D0.1 完成當下的紀錄；D0.2 已由下一節完成，D1 migration 仍待核可。完整證據見
`frontend-architecture-fa-03-dispatcher-d0-egress-core-2026-09-07.md`。

## FA-03 dispatcher D0.2 dormant outcome／local Edge canary

已完成：

- 新增未被 active dispatcher 匯入的 `v2-outcome.js`；固定 `2xx` accepted、所有 `3xx` permanent reject、
  verified provider 的 `404／410` quarantine、`429` 只接受合法 `Retry-After`、其餘 transient／unknown 不猜
  retry schedule。
- `Retry-After` 的 delta-seconds 與三種 HTTP-date 都由嚴格 parser 處理；驗 weekday／日期／時間，RFC 850
  兩位數年份依相對 50 年規則解析，不依賴 runtime 的寬鬆 `Date.parse`。
- 新增 caller-injected total deadline 與 fixed three-field redacted log boundary；raw errors、endpoint、token 與未知欄位
  都不會穿過 outcome／log boundary。
- local Edge 實測確認 Supabase Edge Runtime 不呼叫 Node `https.Agent.lookup`，因此 production D2 不可使用 D0.1
  Node Agent 作 pinning。local-only canary 改以 Deno resolve → public-IP validation → connect exact IP → original
  hostname startTLS，在同一條不重用的 socket 得到 HTTPS 204，並核對 actual remote IP。
- canary 有 Hosted marker hard gate；Google endpoint、8.8.8.8 resolver 與 8 秒 deadline 都只是本機 fixture，不是
  production policy。

驗證：targeted 17 passed／1 skipped，local Edge canary 1／1；完整 frontend CI 為 Node 604 passed／3 skipped、
Playwright 348 passed／4 skipped；Supabase CI 為 DB 1,198／1,198、local API 4／4、desktop 45／11 skipped、
mobile 6／6、三支 Edge 各 1／1。production bundle 852,758／261,346 raw/gzip 與 active dispatcher hash 都未變。
Hosted deploy／migration／env／secret／request／DB write 均未執行。這是 D0.2 完成當下的紀錄；D1 已由下一節完成。
完整證據見
`frontend-architecture-fa-03-dispatcher-d0-outcome-canary-2026-09-07.md`。

## FA-03 dispatcher D1 dormant database barrier（repo／local only）

已完成：

- 使用者核可 additive migration；新增專用 `notification_dispatcher_api` schema、passwordless dormant
  `notification_dispatcher` login role 與 7 個 worker／delivery／finalizer commands。
- dispatcher role 沒有 elevated attribute、role membership、raw table grant 或 private schema usage；在 project
  schemas 中只可呼叫 7 個 reviewed security-definer commands。
- command JSON 的 generation、delivery／outbox／profile ID、transport version 與毫秒 policy 都使用 canonical
  decimal string，不會先進 JavaScript number；這項 v1.3 boundary 已由 D1.1／D1.2 補正並重測。
- worker begin／finish／expire、generation 與 lease 檢查、canary filter、`FOR UPDATE SKIP LOCKED` delivery claim、
  send 前 fresh-check、固定 completion shape 與 idempotent outbox finalizer 已落地。
- preference、player block、court subscription 三個 absence race 改用 deterministic transaction advisory guard；既有
  setter 同步取消受影響的非終態 v2 delivery，不改 legacy 行為。
- v2 outbox identity 已固定不可改；保留既有一次性 `open → frozen` fan-out，frozen 後只接受已驗證 outcome。
- prepare 會從目前 domain data 重建 payload；10 種既有 event 都用真實 local fixture 完成 prepare＋accepted
  completion。
- 兩條真實 `dblink` connection 已覆蓋 consent、registry、cleanup hash、交叉 endpoint refresh 與雙 worker claim
  race；沒有 deadlock、loser residue 或重複 claim。

驗證：migration 39 份從零重播、DB lint 0 error；dispatcher commands 52／52、event matrix 14／14、真併發
26／26；完整 DB 1,290／1,290，local API 4／4、desktop 45／11 skipped、mobile 6／6、三支 Edge smoke 各 1／1。
完整 frontend CI 也通過；generated DB types 無差異、local schema diff 空白。

clean reset 後 runtime 仍是 generation 1、mode disabled、legacy writes true，所有 lease／deadline／attempt／TTL policy
仍為 null；worker、canary、delivery、v2 outbox、v2 transport 都是 0。D1 沒有接 active dispatcher、本批沒有套 Hosted、
沒有 secret／deploy／request／control write，也沒有猜 production 值。完整證據見
`frontend-architecture-fa-03-dispatcher-d1-database-barrier-2026-09-07.md`。

## FA-03 dispatcher D2 compatible source（repo／local only）

已完成：

- active dispatcher source 新增 fail-closed local-only v2 route；Hosted marker 會關閉這條路徑，其他路徑使用 mock transport
  會直接失敗。尚未切換的 legacy route 明確只讀 format 1 outbox。
- exact `jsr:@db/postgres@0.19.5` 的 pool size 1／checked-out `PoolClient` 先檢查 dedicated role，再呼叫 D1 七個
  fully-qualified commands；prepare、provider request、complete 保持在同一筆 `read committed` transaction。
- runtime 對所有 DB response、cross-command identity、canonical bigint string、payload、fingerprint、timestamp 與固定
  outcome 做完整重驗；不明或不可保存的 provider 結果一律 fail-closed。
- local mock 只接受 `host.docker.internal`，仍完整套 server-only provider origin／endpoint policy、不跟 redirect，TTL 與
  deadline 只使用 DB material。
- 真實 local Edge／Postgres／mock provider 測試在 provider response 暫停期間，證明另一條 authenticated preference
  mutation 會因共同 advisory guard 鎖住；201 放行後 delivery accepted、v2 outbox completed、worker completed，legacy
  format 1 row 與 v2 outbox 的 legacy 欄位皆未改。
- 未授權 request 回 exact 401 且沒有 worker；臨時 role password／env file／fixture／runtime control 全部在 finally
  清除或還原，dispatcher output 也沒有 secret 或 endpoint。

驗證：D2 targeted 9／9、local Edge／DB／mock 1／1；完整 frontend CI 為 Node 613 passed／4 skipped、Playwright
348 passed／4 skipped、build 通過；完整 Supabase CI 為 DB 1,290／1,290、local API 4／4、desktop 45／11 skipped、
mobile 6／6 與四支 Edge 各 1／1。DB lint 0 schema error、`git diff --check` 通過。

驗證後 runtime 回到 generation 1、enabled、mode disabled、legacy writes true、legacy handled false，其餘 policy null；
D2 worker／canary／delivery／v2 outbox／v2 transport 與 fixture users／profiles 都是 0，dedicated role password 為 null。
本批沒有 migration、Hosted read／write、deploy、secret、control write、正式 provider request 或 production policy。
這是 D2 完成當下的紀錄；production-compatible Deno-native encrypted sender 已由下一節 D3A 完成。完整證據見
`frontend-architecture-fa-03-dispatcher-d2-compatible-source-2026-09-07.md`。

## FA-03 dispatcher D3A Deno-native sender（repo／local only）

已完成：

- exact `npm:web-push@3.6.7` 只負責 `generateRequestDetails`；固定 `aes128gcm`、DB-derived TTL、normal urgency 與
  per-call VAPID，不使用 global VAPID state 或 library network sender。
- Deno sender 重新驗 canonical subscription、endpoint／VAPID fingerprint、server provider policy 與全部 A＋AAAA；
  只連 public exact IP，再以原 hostname 做 TLS，自己寫固定 HTTP/1.1 request、關閉 socket、不跟 redirect。
- request／response header shape 都被限縮；response header 最多 16,384 bytes，與本機 Node runtime 實查及 Node
  官方預設一致。總 deadline 包住 crypto、DNS、TCP、TLS、write 與 response。
- active repo dispatcher 的 v2 route 仍只允許 local exact mode；Hosted 看到任何 v2 transport env 都 fail-closed，
  legacy route 仍只讀 format 1。
- 新增獨立 `notification-outbox-dispatch-v2-canary` source：Hosted 必須 exact manual-canary mode、專用 secret、
  direct DB URL 與 generation，batch 固定 1；預設 503，不使用 cron secret，也不會被現行 cron 呼叫。
- local 真實 composition 使用隨機 P-256 subscription／VAPID 與 Google `generate_204`，走 Edge→dedicated
  Postgres role→同 transaction fresh-check→encrypted POST→pinned IP/TLS→HTTP 204→accepted/finalized；legacy row
  保持不變。這只證明傳輸與 DB 結構，不是正式 FCM 或使用者收件驗收。
- output 敏感值掃描未命中；fixture／env file／runtime／role password 全部清除或還原。

驗證：targeted 55／55；本批 Edge／DB integration 2／2；完整 frontend CI 為 Node 627 total、622 passed／5 skipped，
Playwright 348 passed／4 skipped、build 通過；完整 Supabase CI 為 DB 1,290／1,290、local API 4／4、desktop
45／11 skipped、mobile 6／6，四組 Edge 為 1／1、1／1、1／1、2／2。DB lint 0 schema error、`git diff --check`
通過。bundle 與 D2 相同，開發期仍只報告。

2026-09-07 Hosted 唯讀重查後，D1 migration 已依使用者持續授權套用：39 local／39 remote，role／7 commands／index／
trigger、資料、linked lint 與 structural diff 驗證通過。Hosted 仍只有 version 14 legacy dispatcher，新 canary 未部署；
runtime／4 legacy Push／7 outbox 與 v2 零資料基線不變，D3 secret 名稱都不存在。

驗證後 local runtime 回到 `1|true|disabled|true|false` 且其餘 policy null；worker／canary／delivery／v2 outbox／v2
transport 是 `0|0|0|0|0`，dedicated role password null、search path empty。

下一步是另行確認 role credential、D3 secrets 與獨立 canary Function deploy。browser fixture、runtime policy、canary
request、generation／cron／legacy cutoff 仍分批處理。完整證據與 Hosted 分段界線見
`frontend-architecture-fa-03-dispatcher-d3a-deno-sender-2026-09-07.md`、
`frontend-architecture-fa-03-dispatcher-d3-hosted-canary-preflight-2026-09-07.md`、
`frontend-architecture-fa-03-dispatcher-d1-hosted-apply-2026-09-07.md`。

## FA-03 push-cleanup distributed limiter foundation（repo／local only）

已完成：

- 使用者核可採 Postgres 原子限流，不引入 Upstash／Redis。新增
  `202609040001_push_cleanup_rate_limit.sql`：private bucket table 只保存 `global|source` scope、32-byte opaque
  digest、token 狀態與到期時間；application roles 對 raw table 全無權限。
- `consume_push_cleanup_rate_limit` 只 grant 給 `service_role`，public wrapper 一律使用 DB
  `clock_timestamp()`；可指定時鐘的 deterministic helper 留在 private，所有 application roles 都不能 execute。
- limiter 是同一 transaction 的兩層 token bucket：先鎖 global，再鎖 source。global 已耗盡時不建立
  attacker-selected source row；source 被限流時不消耗 global token。bucket 初次建立使用 `ON CONFLICT DO NOTHING`
  收斂 race，不做 SELECT-then-INSERT。
- 過期回收只在本次 target bucket 更新後執行，一次最多刪一筆並使用 `FOR UPDATE SKIP LOCKED`，不等待另一個
  limiter transaction，避免 reaper 與 global／source 形成反向鎖序。每個 request 最多也只會新增一筆 source row。
- Edge 新增 exact canonical policy parser；只接受 version 1 與 PostgreSQL positive `integer` 範圍內的 capacity、
  refill milliseconds、idle TTL。repo 沒有 production 預設值；設定缺失、非 canonical、RPC 失敗或非 exact
  `ALLOW|LIMIT` 都回固定 `503 RETRY`，且停在 body／RSA decrypt／quarantine RPC 前。
- global bucket 用固定 versioned label 的 SHA-256，HMAC key rotation 不重設全域保護；source bucket 用獨立
  32-byte non-extractable HMAC-SHA256 key 與 canonical IP，DB 不收到 raw IP。hosted 來源暫定必須由
  `cf-connecting-ip` 與 `x-real-ip` 各自解析後完全相同；本批只完成 parser，後續 C0 已證明兩個 Hosted header
  每筆都有且相同。
- local Edge 使用固定 loopback source，不把本機 gateway header 行為外推 production。真實 smoke 已走
  Edge → limiter RPC → cleanup RPC → DB，並驗 global／source 各消耗一 token；測試 setup／teardown 只清自己的
  exact bucket，因此連跑兩次皆通過。
- 50 個同 bucket 的真實 parallel PostgREST RPC 在 capacity 5 時精確得到 5 `ALLOW`／45 `LIMIT`；另以 12 組
  已到期 bucket 加 24 組不同 pair 同時呼叫，驗證 reaper 沒有 deadlock。這些數字只是假資料測試向量，不是
  production threshold。
- 本機 output 與所有 Supabase container logs 重新掃描 raw cleanup token、cleanup digest、RSA private material、
  service keys、limiter HMAC key 與兩個 bucket digest，未命中。generated DB types 已包含新 public RPC。

精確邊界：

- limiter foundation 完成時，`handler.js` 的 `hostedRuntime || !localTestEnabled` hard gate 仍在 limiter、body、key
  與 DB 之前；後續 dormant C1 把它拆成「Hosted 預設 hard gate」與「exact C1 mode＋token 才只走 limiter」，正常
  Hosted runtime 仍未開放 cleanup。
- 沒有 production capacity、refill、idle TTL 或 RPC timeout。正常 browser 單次 cleanup invocation 最多 2 POST
  是既有證據，但不能單獨推導共享 IP、全域容量或 hosted latency 門檻。
- 沒有 hosted migration apply、Edge deploy、secret/env、request 或 DB write；local 1,198 pgTAP 與並行測試不能
  代替 production traffic／gateway／log 證據。
- Supabase 官方文件說 inbound Edge request 不受 recursive function-call limiter 保護，官方 rate-limit 範例使用
  [Upstash Redis](https://supabase.com/docs/guides/functions/examples/rate-limiting)。本專案依使用者決策使用 Postgres，
  代價是被拒絕的請求仍會產生一次輕量 DB RPC；它不是網路層 DDoS 防護。
- C0 已驗 gateway 同時提供一致的兩個來源 header 與 platform raw-IP logging；Hosted limiter latency／failure
  distribution、PostgREST log 與 production policy／timeout 證據仍待 C1 及後續批次，仍需另一次核可。

後續 C0 更新（2026-09-04）：

- 使用者確認方案為 Free，接受 Supabase platform raw-IP log 保留 1 天，並核可 hard-gated C0。
- 單獨暫時部署 `push-cleanup` 後送剛好 2 次空 body POST；兩次皆為 exact `503`＋`{"outcome":"RETRY"}`。
- `function_edge_logs` 在固定時間窗正好 2 筆；兩筆皆有 `cf-connecting-ip`／`x-real-ip` 且兩者相同，distinct
  source count 為 1。查詢只回傳聚合結果，沒有讀出 raw IP。
- C0 後 DB 仍為 limiter／consent／registry／delivery 0 rows、legacy Push 4、v2 0、outbox 7／pending 0，runtime
  control 仍 disabled。
- 臨時 Function 已立即刪除，Hosted 清單只剩原有 dispatcher。C0 未經 limiter；production threshold、timeout、
  C1 mode、env／secret 與 privacy 文案仍未核可。
- 詳細命令、timestamps、deploy warning 與聚合結果見
  `frontend-architecture-fa-03-cleanup-c0-2026-09-04.md`。

本批驗證：

```text
Node cleanup Edge／rate-limit targeted：30／30 passed
limiter pgTAP：29／29 passed
parallel local PostgREST：50 calls → 5 ALLOW／45 LIMIT；異 bucket＋expired reaper 無 deadlock
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test：38 migrations 從零重播成功
npm run test:ci:frontend：通過；Node 505 passed／1 skipped；Playwright 330 passed／4 skipped
npm run test:ci:supabase：通過；DB 15 files、1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
npx supabase db lint --local --level warning：No schema errors found
npx supabase db diff --local --schema public,private：No schema changes found
`npx supabase migration list`：38 份 local／25 份 remote；13 份 FA-03 migration 的 remote 欄皆空白
local Edge smoke 連續兩次：各 1／1 passed；敏感值 log scan 未命中
production bundle：與 B11 相同，main 647,082／190,278、最大 lazy 16,476／4,830、total 849,706／260,430 raw/gzip
hosted migration／deploy／env／request／DB write：未執行
```

## FA-03 cleanup C1 dormant limiter-only canary

已完成：

- 新增 exact `hosted-limiter-canary-v1`。只有 Hosted marker、exact mode、POST 與 32-byte canonical random token
  全部成立，才會呼叫 limiter；本機不能用同一 mode 冒充 Hosted。
- canary request token 走自訂 header，使用完整 32-byte 比對並清零 decoded buffer；missing、alias、長度錯誤、
  method 錯誤或 auth helper throw 都固定 503，停在 limiter 前。
- 授權後只呼叫 `consume_push_cleanup_rate_limit`；不讀 body、不載 cleanup key、不解密、不 quarantine。exact
  `ALLOW|LIMIT` 只放進受控 response header；RPC error／contract drift 不暴露細節。
- 將 browser-only `/push-cleanup-key-v1.json` 路徑拆出 Edge crypto dependency；browser URL／Vite asset 行為不變。
  local Edge compile 直接斷言不得再出現 C0 的 absolute-path bundler warning。
- 完整 CI 首次執行暴露既有 mobile filter-sheet 測試的掛載 race；failure snapshot 顯示 UI 最終完整，測試改用
  locator poll 等同一組 `data-filter` 契約。單案例與完整 Chromium 重跑通過，production UI 未改。
- C1 Hosted exact scope 已固定為 4 個臨時 secrets、1 次未授權＋最多 20 次授權空 body POST、最多五分鐘啟用窗、
  固定復原順序與 guarded limiter-row cleanup。測試 policy 的每個數字都有 state-machine 推導，且不作 production
  threshold。

精確邊界：

- 本批只改 repo 並跑本機測試；沒有 Hosted deploy、secret、request、DB write 或 Function mutation。
- Supabase 官方 log schema 沒列自訂 canary header；Hosted C1 仍必須用 aggregate 驗它沒有被保存，不能用文件
  推定取代實測。
- 20 筆只能形成最小 nearest-rank p95 樣本；不得宣稱 p99 或直接推導 production policy／timeout。
- 詳細 diff、policy 推導、驗證與 rollback 見
  `frontend-architecture-fa-03-cleanup-c1-preflight-2026-09-04.md`。Hosted 操作仍待使用者核可。

本批驗證：

```text
push-cleanup targeted Node tests：33／33
cleanup／Vite asset 相關 Node tests：70／70
TypeScript：通過
targeted ESLint：通過
mobile filter-sheet targeted rerun：1／1
local Edge → limiter → cleanup RPC smoke：1／1，多次重跑皆通過
local Edge compile output：未出現 absolute public-key path warning
npm run test:ci:frontend：通過；Node 508 passed／1 skipped；Playwright 330 passed／4 skipped；build／bundle report 通過
npm run test:ci:supabase：通過；DB 15 files、1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
git diff --check：通過
Hosted deploy／secret／request／DB write：未執行
```

### Hosted C1 首輪執行更新（2026-09-04）

- 使用者核可 C1 exact scope 後，事前 Function／secret name／DB 基線全數符合；單獨部署的 cleanup bundle 為
  9.6 kB，C0 absolute public-key path warning 沒有再出現。
- CLI 第一次拒絕 `/dev/stdin` env-file；當下 0 secret、0 mode、0 request，trap 刪除 Function。重新確認基線
  完整復原後才進行第二次部署，沒有把工具失敗算成 canary request。
- 實際 C1 先設定三個材料 secret，再最後設定 mode。未授權第 1 筆精確為 503／RETRY、沒有 marker，且獨立
  DB check 為 limiter 0 rows。
- 第 1 筆授權 request 仍為 503／RETRY，但缺少預期 ALLOW marker；依規則立刻停止，剩餘 19 筆未送、沒有 retry。
  總 request 只有 2，因此沒有 p50／p95／p99 樣本。
- 固定時間窗的 `function_edge_logs` 精確 2 筆；POST／503、兩個 source-IP header present／equal 都是 2，
  distinct source 1，自訂 canary header log field 0。`function_logs` 只有 2 Boot＋2 EarlyDrop，沒有 application log。
- 同時間窗的 `/rest/v1/rpc/consume_push_cleanup_rate_limit` gateway log 為 0，DB limiter 也為 0。現有固定回應無法
  唯一區分 auth、設定、crypto 或 RPC 前置階段，因此不猜根因；下一步先做 local-only allowlisted stage diagnostic。
- rollback 依序完成 mode unset、Function delete、guarded limiter check、其餘三個 secret unset；最終四個 C1
  secret names 0、limiter／consent／registry／delivery 0、legacy／v2 Push 4／0、outbox／pending 7／0、runtime
  disabled exact 1。
- 四次 secret mutation 後，既有 dispatcher version 從 6 單調增加為 10，但 `ezbr_sha256` 前後相同；後續
  rollback 必須驗 Function 名稱、狀態、`verify_jwt` 與 artifact hash，不能再要求 Hosted version 回到舊數字。
- 詳細 timestamps、aggregate 與邊界見 `frontend-architecture-fa-03-cleanup-c1-result-2026-09-04.md`。

### Hosted C1 local stage diagnostic 更新（2026-09-04）

- limiter composition 已拆成可直接測試的 client；成功 path 的 RPC URL、method、欄位、`apikey`-only header、
  no raw-IP body 與 `ALLOW` 契約都有斷言。
- exact canary 授權後的失敗只回固定 stage：`SOURCE`、`POLICY`、`HMAC_KEY`、`BUCKET_HASH`、
  `SERVICE_CONFIG`、`RPC_FETCH`、`RPC_STATUS`、`RPC_CONTRACT` 或 `UNCLASSIFIED`。不回 error text、secret、IP、
  digest、policy、URL、status body 或 DB detail。
- stage 以 module-private `WeakMap` 綁定本模組建立的 error；外部在一般 Error 上偽造欄位只會得到
  `UNCLASSIFIED`。未授權、mode／method／token 不符或 auth helper throw 都沒有 stage／outcome header。
- refactor 初次 local Edge smoke 找到 quarantine path 尚引用舊的 secret helper 名稱；已改成共享的
  `configuredPushCleanupSecretKey` 並以真實 local Edge→limiter→quarantine 重新驗證。這是未 commit 的本機
  refactor 問題，不是 Hosted C1 首輪根因。
- targeted Node 34／34、TypeScript、ESLint、Prettier、local Edge 1／1、完整 frontend CI 與完整 Supabase CI
  全部通過；此 bullet 記錄的是 Hosted 重驗前的本機狀態。
- 建議重驗仍維持最多 21 requests：未授權 1 次後先送授權第 1 次；若回 stage 或任何不符即停，只有精確
  `ALLOW` 才繼續其餘 19 次。完整 scope 見
  `frontend-architecture-fa-03-cleanup-c1-diagnostic-preflight-2026-09-04.md`。
- 使用者已明確接受設定與移除 project-wide 臨時 secrets 會增加既有 dispatcher version metadata；Hosted 重驗
  已執行，結果如下。

### Hosted C1 source diagnostic 執行更新（2026-09-04）

- 執行前 Function、4 個 secret names、limiter、Push tables 與 runtime control 全數符合基線；只部署
  `push-cleanup`，bundle 9.7 kB，部署後仍先維持 hard gate。
- 未授權 request 為 503／exact RETRY、outcome／stage absent、limiter 0；第 1 次授權 request 為
  503／exact RETRY、outcome absent、stage=`SOURCE`。依規則取消剩餘 19 次，總共只送 2 request、沒有 retry。
- `SOURCE` 只證明 Function 內部沒有取得兩個都有效且相同的可信來源 header；現有 stage 不能再區分缺少、格式
  無效或兩值不同，因此不猜是哪個 header。
- 同時間窗 platform log 正好 2 筆 cleanup POST／503，外層 `cf-connecting-ip` 與 `x-real-ip` 都是 2 present／
  2 equal、distinct source 1；自訂 request／response header log 都是 0。外層 log 不能替代 Function Request 內部值。
- limiter RPC gateway log 0、DB limiter 0；Function runtime 為 2 Boot＋2 Shutdown、0 application Log、2 executions。
- rollback 的 mode unset、Function delete、材料 secrets unset 成功。guarded DB query 因 runner 把 `$$` 錯組成
  literal `\$\$` 而失敗；獨立 read-only query 立即確認 limiter 本來就是 0，所以沒有補做刪除或留下 row。
- 最終 4 secret names 0、cleanup Function 不存在、Push/runtime 基線不變；dispatcher artifact hash 不變，version
  metadata 由 10 增至 14。
- 詳細 client latency、log aggregate 與復原證據見
  `frontend-architecture-fa-03-cleanup-c1-diagnostic-result-2026-09-04.md`。

### Hosted C1 source substage local 更新（2026-09-04）

- `inspectTrustedHostedClientAddress` 現在能區分 headers 介面錯誤、Cloudflare header 缺少／無效、real-IP header
  缺少／無效，以及兩個 canonical address 不同；只回固定 code，不回 raw header 或 IP。
- canary stage 對應為 `SOURCE_HEADERS`、`SOURCE_CF_MISSING`、`SOURCE_CF_INVALID`、
  `SOURCE_REAL_MISSING`、`SOURCE_REAL_INVALID`、`SOURCE_MISMATCH`；未知 inspector 契約仍 fail-closed 為 `SOURCE`。
- 安全條件沒有放寬：只有兩個 header 都存在、是 canonical IP 且相同，才回 source address 並繼續 limiter。
- targeted Node 34／34、TypeScript、ESLint、Prettier、完整 frontend CI、完整 Supabase CI 與真實 local Edge smoke
  全數通過；Hosted 未再變更。
- 下一輪可縮為 2 個臨時 secrets、最多 2 requests、零 DB write。因不設定 HMAC／policy，若 source 意外通過也只會
  停在固定 `POLICY`，不會建立 limiter row。精確 scope 見
  `frontend-architecture-fa-03-cleanup-c1-source-substage-preflight-2026-09-04.md`，尚待使用者核可。

## FA-05 phase 2 production preview 與效能基線

- 新增獨立 production build／preview Playwright 設定；所有 browser-facing integration 都明確改成本機或空值，
  沒有繼承 production Secret，也沒有碰 Hosted、migration、deploy 或 app runtime。
- 未登入、已登入、OAuth PKCE callback、390px Chromium 慢網路與 390px WebKit request latency 共 5 個情境通過；
  三次重跑為 15／15。OAuth 只模擬外部 provider 的 code exchange，callback 後仍由真實 local Supabase refresh 驗證。
- production chunk probe 直接讀實際 JavaScript response 的既有 marker；anonymous 為 0，authenticated 與 OAuth
  各為 1 個唯一 private chunk。舊的 `/src/...ts` 開發路徑假綠測試已移除。
- checker 新增 `node:zlib` Brotli 報告，不新增門檻。相同 production-equivalent 環境下，`b3b5a05` 與本批的 main
  都是 650,257／191,204／159,809，total JS 都是 852,881／261,345／220,847 raw／gzip／Brotli，差異全為 0。
- 完整 frontend CI 為 Node 638 passed／5 skipped、required Chromium 348 passed／4 skipped；完整 Supabase CI
  為 DB 1,290／1,290、local API 4／4、desktop 44 passed／11 skipped、mobile 6／6、preview Chromium 4／4、
  Edge 1＋1＋1＋2。完整三引擎 production preview 5／5 通過。
- 第一次串跑因長期本機資料讓 discovery 最早 200 筆上限截掉新 fixture；安全 script 驗證目標精確為
  `127.0.0.1:54321` 後只重置 local test DB，39 migration 從零重播並完整通過，Hosted 未動。
- optional mock WebKit 為 165 passed／3 skipped／8 failed，失敗集中在既有 focus restoration。可重現的 7 個案例
  放回 `b3b5a05` 也是 7／7 同型失敗，確認不是本批回歸；新增 preview WebKit 本身三次皆通過。
- 詳細環境、三次量測、before／after 與不宣稱範圍見
  `frontend-architecture-fa-05-phase-2-production-preview-baseline-2026-09-07.md`。

## FA-05 phase 3 Bundle ADR

- 採 A：維持完整 `@supabase/supabase-js` client 與現有 data facade。B 完整 client dynamic import 不減 total 且
  boot 立即需要 Auth＋PostgREST；C production alias 需模仿 SDK 契約；D 調 gate 不是效能改善，因此都不採。
- E 直接組合只保留為條件式、可丟棄 App-level PoC；正式 hosting／裝置／Web Vitals 尚未證明 bundle 是主要瓶頸，
  現在不承擔非官方 `SupabaseClient` 等價維護成本。
- production source 對 umbrella package 有 9 個 named imports；其中 7 個 runtime、2 個 type-only。測試另用
  `GoTrueClient` 與 4 個 Auth error constructors，皆有真實 `new` caller。
- 已安裝的 `PostgrestClient` 2.110.0 沒有公開 `setAuth()`；完整 client 是每次 fetch 前從 Auth session 取 token。
  未來 PoC 必須自行定義並驗證 credential bridge，不能假設不存在的 API。
- final-v3 的 12 個 non-byte call sites 是舊基線；目前 checker 有 14 個結構／內容 call sites，Sentry module
  provenance 另有 8 個。Sentry 已要求 exact wrapper／dependency chunk、無混入 module／imports，不再只靠 marker 分類。
- 詳細五案比較、套件 attribution、PoC 必過項與停損條件見
  `frontend-architecture-fa-05-phase-3-bundle-adr-2026-09-07.md`。本批只有文件，沒有 dependency、runtime、gate、
  alias、migration 或 Hosted 變更。

## FA-06 stage 4 wiring 唯讀盤點

- 已用 final-v3 首次入版 commit 回查舊行號，確認可退役 5 組是 3 個 `sessionViews.js` 字面斷言、
  `sessionPresentation.ts` 的 `Object.freeze` 計數，以及 1 組歷史文件措辭斷言，不包含真正的 lazy、生命週期、
  可及性或隱私契約。
- 現況精確為：`surfaceManifest.js` 81 行／3 consumers、14 lazy sheets、14 unmount registrations、
  4 個頂層 configure、2 個頂層 preload listeners，以及 87 個分布於 12 支 spec 的 `sessionViews` harness calls。
- 下一批先讓 manifest 記錄 lazy loader、unmount wiring 與 auth preload 的真實 owner；測試不再寫死
  `sessionViews.js` 後，才依序搬 loader、4 個 configure、listener 與 app-module wiring。
- `deferSurfaceOpen` 搬檔時必須同步更新 HTML renderer inventory、DOM mutation ledger；listener 搬檔時要同步
  更新 browser port manifest。所有數量都以 AST 重新掃描結果為準。
- 詳細證據與固定分批順序見
  `frontend-architecture-fa-06-stage-4-wiring-preflight-2026-09-07.md`。本批只有文件，targeted 基線 121／121
  通過；runtime、migration、Hosted 與 production 設定未變。

## FA-06 stage 4.1 surface gate manifest 化

- 既有 `SURFACE_MANIFEST` 新增 authenticated preload、lazy loader 與 unmount wiring 三個 frozen source owner；
  初值都是目前真實的 `src/sessionViews.js`，manifest consumers 維持 3 支。
- lifecycle gate 改由 manifest 找 owner。14 個 lazy sheet 仍要求 key === `import()` 字面並解析成 repo path；
  14 個 unmount registration、auth truthy 才 warm、main verified identity transition caller 都仍有 fail-closed 斷言。
- 用 final-v3 首次入版內容精確退役 5 組純字面凍結；其餘 eager／lazy／root／commit／unmount／close／
  navigation／a11y／privacy 契約未刪除。
- 暫時把 lazy owner 指向不存在檔案時，lifecycle 6 pass／1 fail 並回 `ENOENT`；還原後 7／7，證明新 owner gate
  有效且 canary 無殘留。
- 完整 frontend CI：Node 638 passed／5 skipped、Chromium 348 passed／4 skipped，build／bundle 結構 gate 通過；
  bundle 數字不變。詳細證據見 `frontend-architecture-fa-06-stage-4-1-manifest-gates-2026-09-07.md`。
- 本批只有 tests／fixture／文件，沒有 runtime、migration、Hosted 或 production 設定變更。

## FA-06 stage 4.2 共用 surface loader 拆分

- 14 個 dynamic imports、14 個 mount bindings／preloaders、loading shell HTML 與 `deferSurfaceOpen` 已從
  `sessionViews.js` 搬到 `src/views/surfaceLoaders.js`；舊實作同步刪除。
- `sessionViews.js` 只透過 `lazySurfaceMounts` 與 preloader 使用 loader 底座。4 個 configure、14 個 unmount
  registrations、2 個 authenticated preload listeners 與 app-module wiring 尚未搬，87 個 browser harness calls 未改。
- surface source owner、HTML renderer inventory 與 DOM mutation ledger 都已改指新檔；AST 基線實測為
  18 files／125 nodes／34 symbols／112 references，只有 owner file 數增加。
- lazy lifecycle targeted 14／14、Node 638／5 skipped、Chromium 348／4 skipped、production preview 5／5，
  production build 525 modules 與 bundle 結構 gate 通過。
- main 為 650,799／191,358／159,879，仍低於既有 raw／gzip 上限；total 為
  853,454／261,564／220,922 raw／gzip／Brotli，開發期 raw／gzip 超額 3,493／2,502 bytes 只報告，release
  enforce 未放寬。詳細證據見
  `frontend-architecture-fa-06-stage-4-2-surface-loaders-2026-09-07.md`。
- 本批沒有 UI／資料 contract、migration、Hosted、secret、deploy 或 production 設定變更。

## FA-06 stage 4.3 session view wiring 拆分

- 新增 `src/views/sessionViewWiring.js`，集中 4 個 surface configure 與 14 個 unmount registrations；執行順序鎖為
  discovery → session → profile → form，並由 `main.js` 在 controller 建立前明確呼叫一次。
- `PROFILE_PUBLIC_DISCLOSURE`、`sessionFormSheetRuntime` 已隨真實使用者搬移並保持 private；唯一
  `NTRP_SCALE_EXPLANATION` 定義也在 wiring owner，facade 只保留相容 re-export。
- `sessionViews.js` 從 448 行降到 284 行，舊 configure calls 歸零；2 個 preload listeners、app-module wiring 與
  87 個 browser harness calls 尚未搬。
- 暫時移除 main explicit call 時 lifecycle 6／1 fail，還原後 7／7；targeted 151／151、lazy lifecycle 14／14、
  Node 638／5 skipped、Chromium 348／4 skipped、production preview 5／5，526 modules production build 與 bundle
  結構 gate 通過。
- main 650,806／191,352／159,988 仍低於既有 raw／gzip 上限；total
  853,461／261,545／221,002 raw／gzip／Brotli，開發期 raw／gzip 超額 3,500／2,483 bytes 只報告，release
  enforce 未放寬。詳細證據見
  `frontend-architecture-fa-06-stage-4-3-session-view-wiring-2026-09-07.md`。
- 本批沒有 UI／資料 contract、migration、Hosted、secret、deploy 或 production 設定變更。

## FA-06 stage 4.4 app module 與 preload wiring 拆分

- app-module state、login renderer、authenticated／named preloads、toast／toolbar／navigation bridge 與 2 個 intent
  listeners 已搬到 `sessionViewWiring.js`；`main.js` 直接從真實 owner import。
- `configureSessionViewModules` 內的 private installer 有 module-level guard。測試連續 configure 兩次，只記錄
  `pointerover` 與 `focusin` 各一次，並核對 passive option；既有 facade 以 re-export 保留相容名稱。
- `sessionViews.js` 從 284 行降到 167 行；4 configure、14 unmount、14 lazy sheets、2 listeners 與 87 個
  browser harness calls 的契約數量都沒有改變。
- browser port AST 實掃只把 facade 的 top-level document／`preloadForIntent::Element` 換成
  `sessionViewWiring` 的 installer document／`preloadForIntent::Element`，UI global 總數仍是 54。
- targeted 152／152、lazy lifecycle 14／14、Node 639／5 skipped、Chromium 348／4 skipped、production preview
  5／5，526 modules production build 與 bundle 結構 gate 通過。
- main 650,841／191,365／159,913 仍低於既有 raw／gzip 上限；total
  853,496／261,534／220,921 raw／gzip／Brotli，開發期 raw／gzip 超額 3,535／2,472 bytes 只報告，release
  enforce 未放寬。詳細證據見
  `frontend-architecture-fa-06-stage-4-4-app-module-preload-wiring-2026-09-07.md`。
- 本批沒有 UI／資料 contract、migration、Hosted、secret、deploy 或 production 設定變更。

## FA-06 stage 4.5 `sessionViews` facade 退役評估

- AST 實掃確認 facade 現有 40 exports：27 個轉呼叫、11 個 re-export、2 個本檔 DOM renderer；真正 owner 均已存在。
- production 只有 `main.js` 這 1 個 importer、17 個 named imports；全部可直接改用 form／session／discovery／
  profile／presentation owner。
- browser harness 現況為 87 calls／12 specs、實際使用 17 個 exports；3 支 Node 功能測試另使用 11 個 exports。
- final-v3 的 86／11 是 FA-04 phase 0b 前的正確歷史基線；`63d38ea` 新增 live-root spec 與 1 次 import 後變成
  87／12。FA-06 preflight 到 4.4 誤沿用舊數字，已更正；不改寫歷史 final-v3。
- 不做 partial cleanup。下一批先加不可回復 gate，再讓 production 與測試直接 import 真正 owner、把最後 2 個
  renderer 搬到 discovery owner、同步 HTML／mutation／browser-port inventory，並同批刪除 facade。
- targeted Node baseline 210／210 通過。詳細證據見
  `frontend-architecture-fa-06-stage-4-5-facade-evaluation-2026-09-07.md`；本批只有文件，沒有 runtime、UI、
  migration、Hosted、secret、deploy 或 request 變更。

## FA-06 stage 4.6 `sessionViews` facade 完整退役

- 167 行 facade 與 40 個 exports 已刪除；production 原本 17 個 imports、Node 功能測試與 12 支 Playwright specs
  全部改用真正 owner，沒有 test-only bridge。
- 舊 `__importAppModule("sessionViews")` 87 calls 歸零；direct-owner harness 為 93 calls，增加 6 次只因跨 owner 的
  混合 import 拆開，不會增加 production request。
- 最後 2 個 DOM renderer 搬到 `discoverySurfaceViews.js`；HTML renderer 維持 6、mutation ledger 維持
  18 files／125 nodes／34 symbols／112 refs、browser port 維持 1／26／54／152，只更換真實 owner。
- 新 gate 同時鎖定檔案不存在、source 不可重引入、test harness 不可恢復舊 name；canary 放回同名檔時 6／1 fail，
  移除後 7／7。
- targeted 218／218、受影響 desktop Chromium 135 passed／2 skipped、Node 638／5 skipped、Chromium
  348／4 skipped、production preview 5／5，525 modules production build 與 bundle 結構 gate 通過。
- main 649,973／191,341／159,692；total 852,628／261,506／220,734 raw／gzip／Brotli，比 stage 4.4 分別少
  868／28／187 bytes（total 口徑）。詳細證據見
  `frontend-architecture-fa-06-stage-4-6-facade-retirement-2026-09-07.md`。
- 本批沒有 UI／資料 contract、migration、Hosted、secret、deploy 或 production 設定變更。

## FA-06 stage 5 blockedPlayers facade 唯讀盤點

- production 恰有 3 個 refresh 入口：開啟「我」頁、封鎖聊天發送者後、解除封鎖後；測試另有 1 個直接呼叫。
- `SessionControllerState` 的 blocked 三欄目前由 My Sessions controller 寫入 loading／ready／error，auth identity
  boundary 則先 invalidate gate，再用一筆 5-key setState 同時清 blocked 三欄與 My Sessions 兩欄。
- 解除封鎖前有同步 list membership 守衛；Me Page 仍依賴完整九欄 view，selector 測試明確鎖住這個外部行為。
- 下一批固定為零依賴 facade：私有 request gate、完整 snapshot 原子發布、auth snapshot 雙層防護、account clear
  立即不可讀；不雙寫、不混入 stage 6、不改 route、data API、RLS、RPC 或資料庫。
- targeted controller／auth／sequence／Me Page／architecture baseline 137／137。詳細證據見
  `frontend-architecture-fa-06-stage-5-blocked-players-preflight-2026-09-07.md`；本批只有文件。

## FA-06 stage 5.1 blockedPlayers facade 實作

- 新增零依賴 facade，私有持有 request gate，並用完整 frozen snapshot 原子發布 blockedPlayers 三欄。
- `SessionControllerState` 27→24 欄；My Sessions 不再持有或發布 block query state，解除封鎖同步守衛改讀 facade。
- Auth account boundary 先清 facade 再公開新 identity；舊帳號 late response 與可觀察的 B 身分＋A 名單配對都有測試阻擋。
- Me Page 改為合併 session store 六欄與 facade 三欄，對 UI 維持原本九欄契約；三個 production refresh 入口不變。
- 新 architecture gate 含 negative canary；targeted 27／27、Node 645／5 skipped、Chromium 348／4 skipped、
  production preview 5／5、local API 4／4、local desktop 44／11 skipped、local mobile 6／6 通過。
- mobile WebKit 單工為 165 passed／3 skipped／8 failed；八個都是跨既有功能的 focus assertion，新增帳號切換
  block 案例通過。依現行 CI 為非阻擋風險，不把未知原因猜成本批回歸。
- production main 650,482／191,518／159,993，total 853,137／261,685／220,992 raw／gzip／Brotli；開發期
  total raw／gzip 超額 3,176／2,623 bytes 只報告，沒有調高門檻。
- 詳細證據見 `frontend-architecture-fa-06-stage-5-1-blocked-players-facade-2026-09-07.md`。本批沒有 route、
  data API、RLS、RPC、migration、Hosted、secret、deploy 或 production 設定變更。

## FA-06 stage 6 Chat／Messages 唯讀盤點

- AST 重驗：Chat 為 1／12 open callback、1／11 registry、2／15 transition；共用 store 現為 24 欄，Chat feed
  零欄但 unread 在 `mySessions[]`，surface context 另有 8 欄 server／lifecycle state。
- 現行 Messages functional source 是 `courts`、`mySessions` 與被通用 selector 帶入的 `mySessionRosters`；舊文件的
  `0/27` 不能再描述完整 Chat＋Messages。
- 目前測試為 7 次 controller chat open、5 次 browser surface open；舊 `5/86` facade 人工歸類已失效。
- Chat chunk 5,280／2,081／1,751，Messages chunk 1,719／872／733 raw／gzip／Brotli；兩者仍有餘裕。
- 完整盤點 quiet／loud polling、visibility、read cursor、archived、authority、account switch 與三層 stale guard；
  `ReportDialog` 明確排除，chat 正文仍不進 Push payload。
- 固定三批順序：6.0 immutable unread command、6A Chat feed owner、6B Messages route owner＋bridge 退役。
- targeted Node 191／191、desktop＋mobile Chromium 121／1 skipped。詳細證據見
  `frontend-architecture-fa-06-stage-6-chat-messages-preflight-2026-09-07.md`；本批只有文件。

## FA-06 stage 6.0 immutable unread command

- My Sessions owner 新增 `clearMySessionUnread(sessionId)`；只在命中且未讀非零時複製陣列與該筆 session，精確
  發布一次，不增加 roster／list authority version。
- Chat 刪除直接 `notifyMySessions` 依賴與 `context.session.unreadMessageCount = 0` 原地 mutation；公開
  `ControllerApi` 沒有增加方法。
- mark-read 既有語意不變：先樂觀歸零，RPC 成功才前進 cursor，失敗則下次 refresh 重試；原始 API row 不被修改。
- 新 AST gate 與 negative canary 阻擋任何 controller 恢復對 `unreadMessageCount` 的直接 assignment。
- targeted 129／129、Node 646／5 skipped、Chromium 348／4 skipped、production preview 5／5、local API 4／4、
  desktop 44／11 skipped、mobile 6／6 通過。mobile WebKit 為 164／3 skipped／9 failed；單工重跑同九項仍是
  元素存在但 focus `inactive`，Chat 案例通過。原因未證實，只列既有相容性風險。
- production main 650,708／191,652／159,939，total 853,363／261,848／220,969 raw／gzip／Brotli；開發期
  total raw／gzip 超額 3,402／2,786 bytes，只報告且未調整門檻。
- 詳細證據見 `frontend-architecture-fa-06-stage-6-0-unread-command-2026-09-07.md`。本批沒有 UI、route、data
  API、RLS、RPC、migration、Hosted、secret、deploy 或 production 設定變更。

## FA-06 stage 6A Chat feed owner

- 新增 `chatFeedFacade.ts`，單一持有 messages、roster、last-marked cursor、request gate 與 foreground poller；
  messages／roster 仍並行載入，quiet／loud、hidden／visible 行為不變。
- Chat surface context 8→4 欄；chat controller 244→193 行，舊 `activeChat`、refresh、mark-read 與 poller owner
  已實際刪除，只留 surface 與 mutation orchestration。
- request generation、auth snapshot、surface identity 三層 stale guard 各有獨立測試；registry release 是唯一
  `feed.stop()` 入口，會 invalidate pending request 並移除 timer／listener。
- 已讀失敗仍重試、成功仍去重；新增逆序成功測試，確保 cursor 單調前進、不被較舊 acknowledgement 倒退。
- dedicated facade 9／9、targeted 143／143、Node 655／5 skipped、Chromium 348／4 skipped、preview 5／5、local
  API 4／4、desktop 44／11 skipped、mobile 6／6 通過。第一次 local desktop 有一筆 Me presence response timeout；
  單獨重跑 1／1 與完整重跑 44／44 均通過，原因未證實。
- mobile WebKit 維持 164／3 skipped／9 failed，仍為相同九項元素存在但 focus `inactive`；Chat 案例通過，只列
  未解相容性風險。
- production main 650,916／191,738／160,027，total 853,571／261,909／221,057 raw／gzip／Brotli；相較 6.0
  增加 208／86／88 bytes，開發期 total raw／gzip 超額 3,610／2,847 bytes，未調整門檻。
- 詳細證據見 `frontend-architecture-fa-06-stage-6a-chat-feed-owner-2026-09-07.md`。本批沒有 UI、Messages
  route、data API、RLS、RPC、migration、Hosted、secret、deploy、production 設定或新 runtime dependency。

## FA-06 stage 6B.1 Messages 專用資料邊界

- 新增 Messages feature selector，直接從 `mySessions` 過濾聊天列，另讀 `courts`；不再借 My Sessions groups，
  `mySessionRosters` 變動不會影響 Messages 結果。
- `MessagesPage` 直接接收 `sessionStore` 與 `onOpenChat`；`AppServicesProvider` 的 Messages types／hooks、舊
  `messagesFromGroups()` 與測試 bridge 已刪除。
- source gate 與三個 negative canary 會阻止 App Context bridge、page context import 或 roster coupling 回來。
- typecheck、lint、targeted Node 80／80、desktop Chromium 16／16、production build 與 bundle structural checks
  通過。
- production main 650,284／191,609／160,037，Messages chunk 2,154／1,045／882，total
  853,377／261,968／221,212 raw／gzip／Brotli。相較 6A total 為 -194／+59／+155 bytes；開發期 total
  raw／gzip 超額 3,416／2,906 bytes，依 D8 只報告。
- 詳細證據見 `frontend-architecture-fa-06-stage-6b1-messages-selector-2026-09-07.md`。route owner、`main.js`
  Messages 路由特例退役與完整回歸屬 6B.2，本小步未宣告 Stage 6B 完成。

## FA-06 stage 6B.2 page-route owner

- 新增零 runtime dependency page-route owner，單一保存四頁 hash／root／tab／heading focus、active page、history
  owner 與私人頁回 map 規則；browser API 經 `main.js` 具名薄介面注入。
- Messages deep link、bottom-nav click、Back／Forward 與 heading focus 共用 `navigate()`；`main.js` 已刪
  `PAGE_ROUTES`、`setActivePage()`、`showMessagesPage()` 與 Messages tab／heading 特例。
- My Sessions 只保留 create／join 卡片 focus page-view wrapper；Me／My Sessions 的必要進頁資料刷新沒有被刪。
- route source gate 有三個 negative canary；DOM mutation ledger 與 browser-port manifest 已換成實際 owner。
- Node 659／5 skipped、desktop＋mobile Chromium 348／4 skipped、targeted route 19／19、navigation 32／32、
  typecheck、lint、Prettier、build 與 bundle structural checks 通過。
- production main 650,481／191,883／160,168，total 853,574／262,224／221,337 raw／gzip／Brotli；相較
  6B.1 total +197／+256／+125 bytes，開發期 total raw／gzip 超額 3,613／3,162 bytes，依 D8 只報告。
- 詳細證據見 `frontend-architecture-fa-06-stage-6b2-page-route-owner-2026-09-07.md`。依 Stage 6 preflight 與
  final candidate，下一步仍要只讀重驗 Chat imperative adapter／controller → surface 選擇，不能提前宣告 6B 完成。

## FA-06 stage 6B.3 Chat surface 邊界 preflight

- production 的 concrete open 鏈已確認是 `main.js → SessionControllerOptions.openChat → chatController.openChat()`；
  controller 另以 `publish → sheet.setState()` 推 feed，archived 時直接呼叫 `sheet.setArchived()`。
- `SessionChatSheet` 目前是 8 個 imperative adapters 之一；Chat 在 formal mutation ledger 有 5 個 legacy symbols，
  React 與舊 adapter 分別管理同一張畫面的 rows、status、error、events、announcement 與 scroll。
- 3 支 Browser spec 共 5 次直接呼叫 `openSessionChatSheet()`；AST 另找到 1 次 lazy 載入後的函式自我重入，兩者沒有
  混算。targeted Node 152／152 通過。
- 最小退役固定兩步：6B.4 先把 feed 改為可訂閱狀態並讓 React 拿回完整 UI ownership；6B.5 再讓 controller 只建立
  Chat session/model，由 app wiring 選 surface，刪除兩層 `openChat` callback 與 main concrete mapping。
- 詳細證據見 `frontend-architecture-fa-06-stage-6b3-chat-surface-preflight-2026-09-08.md`。本批只有文件；沒有 runtime、
  UI、migration、Hosted、secret、request、deploy 或 production control 變更。

## FA-06 stage 6B.4 Chat React 單一 UI owner

- feed 的 immutable snapshot 新增 status／error／archived／revision 與 `subscribe()`；React 直接訂閱，完整管理
  loading、error、rows、roster、archived、announcement、events 與 scroll。
- controller 的 `sheet.setState()`／Chat `sheet.setArchived()`、view 的 Chat DOM queries／native listeners、
  `SessionChatContentContract` imperative methods 與 5 個 legacy mutation entries 已刪除。
- imperative adapters 8→7；mutation ledger symbols 34→31、nodes 125→110、references 112→100。成功清空 input 與
  near-bottom scroll 是 2 個 React 自有 ref mutation，已明確登記 owner。
- source gate 對 controller command、imperative handle、view DOM query/listener/state command 都有 negative canary。
- Node 661／5 skipped、selected desktop＋mobile Chromium 127／1 skipped、typecheck、lint、Prettier、build、bundle
  structural checks 與 diff check 通過。
- production total JS 852,930／262,198／221,296 raw／gzip／Brotli；開發期 raw／gzip 超額 2,969／3,136 bytes，
  依 D8 只報告。詳細證據見 `frontend-architecture-fa-06-stage-6b4-chat-react-owner-2026-09-08.md`。
- 本批沒有 migration／Hosted／production control。下一步只做 6B.5 app wiring，尚未宣告 Stage 6B 完成。

## FA-06 stage 6B.5 Chat app wiring

- controller contract 改為 `createSessionChat()`：只建立經權限檢查的 Chat model，不再取得或保存 concrete sheet handle。
- app-owned `createSessionChatOpener()` 統一組合 model 與 `SessionChatSheet`；Messages、My Sessions 與 detail CTA 共用
  同一個穩定 app command。
- `SessionControllerOptions.openChat`、`ChatControllerDependencies.openChat`、controller concrete surface call、
  `main.js` mapping、`ControllerApi.openSessionChat` 與 provider 的 controller bridge 已刪除。
- 新 gate 對上述六類舊接線各有 add-red／restore-green canary；surface 缺失、mount／start 失敗、controller lifecycle
  close 與 user close 都有 model release／unsubscribe 證據。
- targeted Node 194／194、完整 Node 666／5 skipped、mock Chromium 348／4 skipped、selected Chromium
  117／1 skipped、local API 4／4、local desktop 44／11 skipped、local mobile 6／6、production preview 4／4 通過。
  non-blocking WebKit 為 166／3 skipped／7 failed，7 項都不在 Chat 範圍，未宣告通過。
- production main JS 649,121／191,413／159,896、total JS 853,560／262,410／221,605
  raw／gzip／Brotli；開發期 total raw／gzip 超額 3,599／3,348 bytes，依 D8 只報告。
- 詳細證據見 `frontend-architecture-fa-06-stage-6b5-chat-app-wiring-2026-09-08.md`。本批沒有 migration／Hosted／
  production control；Stage 6B 與第一個 vertical slice 完成。

## post-FA-06 completion audit

- final-v3 的通用階段 0a／0b、1～5、6A、6B 已逐項對照 implementation status、現行 source 與正式 gates；已完成
  項目不重做，也不因缺少新工作而任意導入 Router／Query／state framework。
- 現行正式基線為 imperative adapters 7；DOM mutation ledger 19 files／110 nodes／31 symbols／100 references；
  browser ports controller 1／platform adapters 26／UI globals 50／type-only 153。本次 targeted 55／55 通過。
- production Push v2 UI、Hosted active dispatcher／真實 canary、runtime control 與 legacy cutoff 仍受既定產品／外部操作
  邊界約束；release bundle hard limits 仍等正式 hosting／裝置／網路／Web Vitals 基線。
- `ds-bundle/` 已實證落後目前 React 與 13 份 production CSS：設定仍稱無 React、CSS 說明仍指兩個舊來源，README
  索引中的 screens 與 Bricks 本機缺檔。下一個安全批次是只讀全量 drift inventory，不先改 production UI。
- 詳細證據見 `frontend-architecture-post-fa-06-completion-audit-2026-09-08.md`。本批只有文件與唯讀測試；沒有 runtime、
  migration、Hosted 或 production control 變更。

## `ds-bundle` 全量 drift preflight

- 13 個 tracked bundle files 中只有 9 張 HTML 卡片；README 另列出的 Bricks 與 9 張 Screens 在 repo 內不存在。
  `.design-sync/NOTES.md` 只能證明它們過去曾在遠端，不能證明目前遠端狀態，因此本批沒有猜測或還原舊檔。
- production 的 13 份 CSS 合計 114,984 bytes，舊 `_ds_bundle.css` 為 102,371 bytes。semantic audit 排除拆檔／grouped
  selector 假差異後，得到 50 tokens 全等、648 selector occurrences 全等、4 changed、2 bundle-only、15
  production-only。
- 49 筆 source reference 有 9 筆指向 4 個退役路徑；另有存在但行號已失效的引用。後續改用現行 owner／symbol，
  不再依賴容易漂移的固定行號。
- 9 張卡片在 desktop 1280×900 與 mobile 390×844 共 18 次 Playwright Chromium render：全部 HTTP 200、內容非空，
  console／page／request error、overlay 與 horizontal overflow 都是 0；BottomNav 點品牌後正確到 `#tab-map`。
- 實查缺陷為 SessionCard／Chat／Sheet 缺 viewport meta、Toast 重複 ID，以及數個 demo button 未達 bundle 自訂的
  44px 規範。Chat 兩個 runtime variant 是 dynamic class，不列為廢棄。
- 詳細證據見 `frontend-architecture-ds-bundle-preflight-2026-09-08.md`。本批只讀 production source 並產文件；
  沒有改 production UI、runtime、migration、Hosted 或資料。
- 下一批 A 先以固定順序從 13 份 production CSS 產生 deterministic standalone bundle、加入 drift gate，並更新
  README／config／NOTES／conventions 的品牌、React、來源與實際檔案索引。下一批 B 才更新 9 張卡片並重跑 render。

## 已知阻塞與風險

- `FA-03B12.7` 的 browser provider-policy 契約衝突已依使用者選擇 A 解決：v1.3 與 B11.1 把 browser structure
  validator 和 server provider-policy 拆開；B12.7.3 browser HTTP transport 與 B12.7.4 local composition 也已完成。
  B12.8 已完成 local-only Edge HTTP／Auth／DB，B12.9 已完成 real browser-to-local-DB composition。production
  provider policy secret 仍未設定；Hosted 4 筆現有 row 的 aggregate 都是 exact FCM origin，但正式設定前仍要重查，
  不得把這次 aggregate 外推成永久 provider 清單。
- 最新一般 development build 的 main 為 649,121／191,413／159,896，total 為
  853,560／262,410／221,605 raw／gzip／Brotli；raw／gzip 比目前參考值多 3,599／3,348 bytes。D8 允許開發期
  report 繼續，release enforce 仍是 hard fail；第一個 production candidate 前須依 D9 用正式 hosting、裝置、網路
  與 Web Vitals 重訂 release 基線。本機 production preview 基線不是 production SLA。
- 現行 production browser／Hosted dispatcher 仍只讀寫 legacy `push_subscriptions`；repo／本機已有 v2 transport metadata、
  quarantine command、A4 enable／refresh DB command、encrypted browser transport 與 local-only Edge HTTP／Auth／DB
  handler，但 production graph 沒有 browser／Edge wiring，Hosted runtime gate 仍 disabled，不能誤稱已啟用或已停止
  production send。
- outbox source/fanout/outcome、control/worker、account-delete audit、no-op source version，以及 D1 worker／delivery／
  finalizer DB barrier 已在 repo／local 完成 migration 與測試，D1 migration 也已套 Hosted 並驗證。D2 compatible
  dispatcher 與 D3A encrypted sender 已通過真實 local Edge／DB／network 測試，但 Hosted route 尚未接線。
- 現行一般登出的 Auth session 已在 `FA-03B10.1` 改為 local scope，B10.2 也已建立 dormant browser
  capture／unsubscribe／reread seam；但 production importer、server-first cleanup 與 durable quarantine 尚未接線，
  所以 D2 仍未完整。
- B12.1 已完成 `auth-unverified` 手動重新啟用的原子 storage 起點與跨 tab 收斂；B12.2 已完成 B1 failure notice 的
  revision／prior-owner 出口；B12.3 已完成 dormant B1 → B9 correlation adapter；B12.4 已完成 B8 cleanup → 新
  provisioning → future enable port 的 local coordinator；B12.5 已完成 pre-network provisioning cancel storage action。
  B12.6 已完成 refresh response → enabled binding 的 exact local CAS；B12.7.1 已完成 policy-neutral enable／refresh
  coordinator core；B12.7.2 已完成 provider-neutral browser subscription acquisition；B11.1 已完成可直接供 browser
  使用的 structure validator；B12.7.3 已完成 encrypted HTTP transport；B12.7.4 已完成 subscription local
  composition；B12.8 已完成 local-only Edge HTTP／Auth／DB；B12.9 已讓 browser composition 直連 real local Edge
  與 DB。B1 callback、production Auth／config 與正式 importer 仍未做；production Push 仍不會呼叫它們。
- D6、Q9-A Auth boot gate、quarantine DB digest boundary、local-only encrypted Edge 與 B9 dormant handoff seam
  已完成；但 B1 rejected result 尚無可信舊 owner correlation，production 對 B9 為零 caller，explicit rejection
  也尚未由 browser 呼叫 Edge。`auth_unavailable` 已決策為「驗證成功仍不自動恢復，必須手動重新啟用」，但
  local coordinator、browser acquisition、encrypted transport 與 browser-to-local-DB 已實作，但 production wiring
  與 UI 尚未實作；SW/private Push 與 dispatcher gate 也未完成，因此 Q9 整體仍未完成。
- Auth 跨頁安全依賴符合規格的 Web Locks 與目前固定的 auth-js 2.110.0 call shape；舊版 tab／外部 client
  不受新 lock 約束。`-1` 無期限等待避免 timeout-steal，但持鎖 request 若永久 pending 也會讓後續 auth/data
  等待；目前沒有未經證據自行設定 network timeout。
- Hosted legacy dispatcher 仍沒有使用 D1 delivery lease／per-device outcome；repo／local 的 D2 route 已正確呼叫
  commands 並通過 transaction-lock integration，但尚未部署，不能把 local 證據誤稱成 production barrier 已啟用。
- Web Push 與 PostgreSQL 沒有共同 transaction；Q6-A 已核可較弱但可實作的條件式邊界，仍須測試、
  監控並明列無法完全消除的斷線空檔。
- 現行 Hosted legacy dispatcher 的 web-push 仍是預設 TTL 四週且沒有明確 timeout；repo D3A sender 已改用
  DB-derived TTL、總 deadline 與 send-time DNS/IP pinning，但尚未部署，不能把 local 修正誤稱為 production 已生效。
- Hosted public-schema default privileges 對 app roles 過寬；`011` 已在 migration 內把 subscription ACL
  精確重設為 authenticated 無 raw 權限、service role 只有舊 dispatcher 必需的 SELECT／DELETE，Hosted 實查已
  符合。其他後續 public schema 物件仍須維持相同部署邊界。
- cleanup raw-token codec、application-layer encryption、local Edge、本機 log 去敏、build-time public-key
  asset、dormant IndexedDB、bounded browser transport、owner-quarantine adapter、single-attempt coordinator 與
  Auth-failure handoff 已完成；但 production graph 對 B5～B9 五個 browser foundation 都是零 import／caller，
  Auth failure／登出／SW／dispatcher 尚未接線。distributed limiter DB schema 已套 Hosted；C0 已證明這次 Hosted
  gateway 的兩個來源 header 每筆都有且相同，也證明 platform log 會保存 raw IP，但 C0 沒有執行 limiter，仍缺
  Hosted limiter latency／failure distribution、production policy 與 timeout 證據；handler 因此維持 hard-disabled，
  不能外推為完整 production cleanup API。
- public-key dev server 的 query alias 會落到既有 SPA fallback 並回 `200 text/html`，不是 key response、也沒有
  洩漏 key。dormant loader 已固定無 query 的 same-origin URL，並驗 `Content-Type`、`no-store`、499-byte body 與
  canonical JSON；正式 Vercel response、compression 與 stable-origin 行為仍待 hosted canary。
- 本機 gateway 對 preflight／response 會覆寫 `ACAO: *`；handler exact Origin gate 已由惡意 suffix POST
  實測為 `403`，但 Origin 不是非瀏覽器身分驗證，真正 bearer authorization 仍是 256-bit cleanup token。
- `supabase functions deploy` 未指定名稱時會涵蓋所有 Functions；本案必須明列單一 `push-cleanup`，避免誤部署
  其他 function。即使 handler 不執行 DB，公開 endpoint 仍可能帶來請求成本；正式啟用前仍需 production limiter
  policy 與有證據的 RPC timeout。C0 的 absolute public-key path warning 已在 repo 拆分並由 local compile 驗證
  消失，C1 Hosted deploy 也沒有再出現 warning。
- C1 Hosted 首輪的未授權 request 通過，但首筆授權 request 缺 ALLOW marker；remaining 19 requests 已取消，
  Function／secrets／limiter 全部復原。現有去敏固定回應無法從外部唯一定位 auth 到 RPC 前的失敗階段；在
  新一輪明確核可前，不再部署或送 Hosted request；local-only allowlisted diagnostic 已完成並通過完整 CI。
- Supabase secret mutation 實測會讓未改 source 的既有 dispatcher version 單調增加；本輪由 6 變 10，artifact
  hash 不變。version number 不能再作 rollback 等值條件，應改驗 code hash／狀態／config。
- Supabase 官方 logging 文件與 C0 都證明 platform logs 會保存 `cf-connecting-ip` 與 `x-real-ip`；DB 只存 HMAC
  digest 無法去除平台層 raw IP。使用者已確認方案為 Free 並接受 1 天 retention。現行 privacy 頁只說 Vercel
  Analytics 不留 IP，沒有揭露 Supabase access logs；正式開放前必須另批更新。
- `FA-03B11` 已建立 `canonical-endpoint-policy-v1` shared module；D3A 也完成 local send-time DNS/socket 綁定。
  Hosted B 已設定 canary-only provider secret，但真正 browser canary subscription 與 release evidence 仍不存在，因此
  module／local sender 完成不代表 production v2 enable／refresh 已可接收 endpoint；active provider 值仍未設定。
- Vault 與 Edge 的 cron secret 目前只證明兩邊存在，metadata 不能證明值相同；現行 function 沒有
  side-effect-free healthcheck，因此本輪刻意沒有直接呼叫 hosted dispatcher。
- `ds-bundle/` 全量 preflight 已完成，確認它不是目前 UI/CSS 的可靠副本；在 deterministic CSS mirror、drift gate 與
  9 張卡片更新完成前，不得把它當成 production 正典或直接回同步。
- C1 Hosted diagnostic 已停在 `SOURCE` 並完整復原；local source substage 已完成。再次 Hosted deploy／secret／
  request 前仍須取得新核可；最小範圍是 2 secrets、2 requests、零 DB write。

## 下一個 session 的起點

1. 確認分支為 `codex/frontend-architecture-execution`，先讀本文件、`FA-03B10` Push v2 contract v1.3、
   `frontend-architecture-fa-03-hosted-migration-apply-2026-09-04.md`、A4 handoff、FA-02 設計與 FA-03 preflight。
   A4、B11、cleanup limiter、dispatcher D0.1／D0.2／D1／D2／D3A local composition 與先前 Hosted additive
   migration 已完成；不要重做、重套 migration 或自行填 production 值。D3A 唯讀重查、sender repo／local 證據與
   D1 Hosted migration、專用 DB credential、六個 canary-only Secret、獨立 canary deploy 與 no-write probe 都已完成。
   不要重做 Hosted B，也不要把 canary 設定改成 active 設定。Hosted C 的真實 browser fixture／`dispatch` 仍要產品確認；
   FA-04 phase 0a／0b 與 FA-05 phase 1／2／3 已完成；production preview／效能基線與 Bundle ADR 不要重做。
   FA-06 階段 4 preflight、4.1 manifest、4.2 loader、4.3 configure、4.4 app-module／preload wiring、4.5 評估與
   4.6 facade 完整退役、stage 5 blockedPlayers preflight 與 5.1 facade 實作已完成；不要恢復 `sessionViews.js`、
   舊 harness name 或把 blocked 三欄放回 session store。Stage 6 Chat／Messages 唯讀 preflight、6.0 immutable
   unread command、6A Chat feed owner、6B.1 Messages 專用 selector／App services bridge 退役與 6B.2 page-route
   owner、6B.3 Chat surface 邊界 preflight、6B.4 React 單一 UI owner 與 6B.5 app wiring 已完成；不要恢復
   原地修改 unread、Chat 直接 notify、controller 內的 feed／cursor／gate／poller owner、Messages Context hooks 或
   roster coupling，不要把 Messages route／tab／heading 特例放回 `main.js`，也不要把 Chat `setState/setArchived`、
   view DOM mutation、native listener 或 controller → concrete Chat callback 放回去。Stage 6B 與第一個 vertical slice
   已完成；post-FA-06 completion audit 與 `ds-bundle` 全量 drift preflight 也已完成，不要重跑舊的粗略 byte-only
   比對。下一步做 `ds-bundle` 批次 A：以 production 固定 13 份 CSS 產生 deterministic standalone mirror、加入
   drift gate，並更新 README／config／NOTES／conventions；不先改 production UI。之後批次 B 才更新 9 張卡片並
   重跑 desktop／390px render。
2. 確認 `FA-03A2` contract、`FA-03A3` dormant schema、`FA-03A3.1` hotfix、`FA-03B1` Auth gate、
   `FA-03B2` quarantine DB boundary、`FA-03B3` local-only encrypted Edge、`FA-03B4` public-key asset、
   `FA-03B5` dormant IndexedDB storage、`FA-03B6` bounded browser cleanup transport 與 `FA-03B7` dormant
   owner-quarantine adapter、`FA-03B8` single-attempt coordinator、`FA-03B9` Auth-failure handoff、`FA-03B10.1`
   Auth local sign-out、`FA-03B10.2` dormant browser deactivation、`FA-03B12.1` manual re-enable storage 起點、
   `FA-03B12.2` Auth failure notice、`FA-03B12.3` dormant correlation adapter、`FA-03B12.4` manual re-enable
   local coordinator、`FA-03B12.5` pre-network provisioning cancel、`FA-03B12.6` refresh commit 與
   `FA-03B12.7.1` policy-neutral subscription coordinator core、`FA-03B12.7.2` browser subscription port 與
   `FA-03B12.7.3` encrypted HTTP transport、`FA-03B12.7.4` local composition、`FA-03B12.8` local-only Edge
   HTTP／Auth／DB composition、`FA-03B12.9` real browser-to-local-DB composition 都存在；
   不要重做已完成的 003～011、Auth gate、
   transport linkage、RSA envelope、key generator、browser storage schema、key loader、owner result mapping、bigint
   string boundary、single-attempt exact transport→CAS handoff、caller-supplied Auth failure → B5／B8 handoff，或
   capture → unsubscribe → reread classification。
3. 以 `npm run test:db` 的 1,290／1,290 作為 compatible runtime 的最新 local DB 基線；39 migration 從零重播、
   DB lint clean 與 local `public`／`private`／`notification_dispatcher_api` schema diff 空白是本機證據。Hosted 在
   2026-09-07 D3A 重查後已套用 `202609070001`；Hosted 現為 39 remote，catalog／資料／lint／diff 驗證完成。
4. `FA-03B5`～`FA-03B9` 已建立 dormant storage、bounded cleanup transport、owner RPC adapter、single-attempt
   coordinator 與 Auth-failure handoff seam；`FA-03B10` 已固定 v1.3 契約，A4 DB command、B11／B11.1 shared
   validator／hybrid envelope／independent key asset／Edge structural ports，以及 Postgres distributed limiter
   foundation 已完成。2026-09-04 Hosted 已套完 13 份 migration，4 筆 legacy Push row 保留、1 筆 reminder
   sentinel update 完成，runtime 仍 disabled。Cleanup C0 已完成：Free／1 天 raw-IP retention 已接受；2 次
   hard-gated request、platform log 與 DB 驗證通過，臨時 Function 已刪除。Dormant C1 limiter-only path 已完成；
   使用者核可後的 Hosted 首輪只送 1 未授權＋1 授權 request，授權 request 缺 ALLOW marker 即停損，其餘 19 筆
   未送、沒有 retry，Function／4 secrets／limiter 已完整復原。local-only allowlisted stage diagnostic 與完整
   CI 已完成；使用者核可後的 Hosted diagnostic 只送 1 未授權＋1 授權 request，授權 request 回 `SOURCE` 即
   停損。Function／4 secrets／limiter 已完整復原，dispatcher artifact hash 不變、version 10→14。local source
   substage 與完整 CI 已完成；下一步另行核可 2 secrets、最多 2 request、零 DB write 的 Hosted 最小重驗。
   production policy／timeout、privacy 文案與 hard gate 移除仍要之後獨立核可。
   `FA-03B12.1` 已完成 exact `auth-unverified` → `subscription_changed` pending cleanup 的原子 B5 action；B12.2
   已完成 B1 exact failure notice，B12.3 已完成 notice → B9 的 dormant correlation adapter，B12.4 已完成 B8
   cleanup → 新 provisioning → injected enable port 的 manual re-enable local coordinator，B12.5 已完成 v1.2 要求的
   pre-network provisioning cancel，B12.6 已完成 exact refresh local commit，B12.7.1 已完成不涉及 provider-policy
   的 enable／refresh coordinator core，B12.7.2 已完成 VAPID／permission／ready SW／subscription acquisition，
   B11.1 已依方案 A 完成 browser structure／server policy 拆分，B12.7.3 已完成 dormant 加密 HTTP transport，
   B12.7.4 已完成 local-only composition，B12.8 已完成 local-only Edge HTTP／CORS／authoritative Auth／DB port
   composition，B12.9 已驗證 browser → encryption → Edge → Auth → A4 DB RPC → local CAS。B13 production wiring
   preflight 已查清 Auth adapter、runtime config、UI／SW importer、B1／B9 handoff 與 server-controlled gate；B13.1 已補
   verified proof／revision／401 retry／failure callback authority，B13.2 已由 production main 接上 hard-coded disabled
   shell，重型 runtime 未進 production 產物。B13.3 已查明 v2 實際有八種技術狀態，不能直接壓成四種；下一步先
   確認顯示分組、異常恢復與 privacy 已查證範圍。server-only origins 不得進 browser，也不得自行猜 production
   provider／key。D1 local DB barrier、D2 local-only compatible source 與 D3A Deno-native sender／獨立 canary source、
   Hosted D1 與 Hosted B no-write probe 都已完成；active source 未部署、`dispatch` 未呼叫、browser fixture 未建立、runtime
   未啟用。未決定 timeout、排程與 backoff 前不可自行填數字或加入 scheduler。
5. 所有 migration 已獲持續授權，不再逐支詢問；每次仍須先重跑 hosted canonical／影響筆數並在套用後驗證。未再次確認前
   不得擦除資料、批次取消、直接 push 遠端，或執行 deploy／secret／runtime／request／legacy cutoff。

## 進度紀錄

| 日期       | 批次                             | 紀錄                                                                                                                                                                                                                                                                                                                                             |
| ---------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-31 | FA-00                            | 建立執行分支、單一進度入口，寫入已確認產品與開發政策。                                                                                                                                                                                                                                                                                           |
| 2026-08-31 | FA-01                            | Bundle 結構 hard gate 與 byte report／release enforce 分流完成，rules 與測試同步。                                                                                                                                                                                                                                                               |
| 2026-08-31 | FA-02                            | 完成 Push 現況稽核與詳細設計草案；runtime／migration 未動，等待十項核可。                                                                                                                                                                                                                                                                        |
| 2026-08-31 | FA-02                            | 使用者核可 `1A、2A、3A、4A、5A、6A、7A、8A、9A、10B`；FA-03 可開始，contract 前仍須回報 hosted 實際影響。                                                                                                                                                                                                                                        |
| 2026-08-31 | FA-03                            | 完成 hosted pre-expand 唯讀盤點：4 legacy subscriptions、7 筆 `sent_at` 非空／0 pending outbox；結構無 drift、ACL 有差異；未做 hosted 寫入。                                                                                                                                                                                                     |
| 2026-08-31 | FA-03A0                          | reminder pgTAP 改用隔離時鐘與 fixture-scoped outbox 斷言；完整 DB 測試 804／804 通過。                                                                                                                                                                                                                                                           |
| 2026-08-31 | FA-03A1                          | sessions schedule version 與 outbox nullable/sentinel foundation 分成兩個無反向鎖序的 migration；837／837 通過，hosted 未套用。                                                                                                                                                                                                                  |
| 2026-08-31 | FA-03A2                          | schema contract 三路複查完成；使用者核可刪帳最小保留與 no-op 不推播，準備獨立 commit；hosted 未寫入。                                                                                                                                                                                                                                            |
| 2026-08-31 | FA-03A3                          | 003～009 dormant schema、177 項新增 pgTAP 與真實刪帳 FK 測試完成；全套 DB 1,014／1,014、strict diff 空白，hosted 未套用。                                                                                                                                                                                                                        |
| 2026-08-31 | FA-03A3.1                        | 010 將 deferred outbox guard 收斂為 postgres-owned empty-path definer helper，browser 權限不放寬；從零 replay 與 DB 1,024／1,024 通過，hosted 未套用。                                                                                                                                                                                           |
| 2026-08-31 | FA-03B0                          | auth identity 只認非空 `user.id`；不完整 session 在私人 RPC 前 fail-closed，完整單元回歸 355／355、Chromium 298 passed。                                                                                                                                                                                                                         |
| 2026-08-31 | FA-03B1                          | boot 只接受 server refresh＋matching event；Web Locks 防跨頁覆寫，stale sign-out barrier 與真實 GoTrueClient 測試完成；Q9 Push cleanup 部分仍待實作。                                                                                                                                                                                            |
| 2026-08-31 | FA-03B2                          | v2 transport linkage、legacy shim／ACL 與 owner／token-digest quarantine DB boundary 完成；owner-lock bypass 修正，1,092 DB tests 通過；Edge／browser／dispatcher 仍未接線。                                                                                                                                                                     |
| 2026-08-31 | FA-03B3                          | 使用者核可 encrypted envelope＋local-only；RSA-OAEP v1、hosted hard gate、真實 Edge→DB quarantine 與本機全 logs 敏感值掃描完成；browser／hosted／dispatcher 未接線。                                                                                                                                                                             |
| 2026-08-31 | FA-03B4                          | fixed same-origin v1 public-key asset、public-only canonical generator、encrypt-only shared protocol 與 no-store headers 完成；未配置 key、未接 browser、未部署 hosted。                                                                                                                                                                         |
| 2026-09-01 | FA-03B5                          | dormant IndexedDB logical device、persistent provisioning、local fail-closed 與 immutable pending cleanup foundation 完成；production 零 caller、零 network、零 hosted 寫入。                                                                                                                                                                    |
| 2026-09-01 | FA-03B6                          | dormant 499-byte key loader、425-byte encrypted cleanup POST 與每次呼叫最多 2 POST 的 exact RETRY transport 完成；production 零 caller、未配置 key、未部署 hosted。                                                                                                                                                                              |
| 2026-09-01 | FA-03B7                          | dormant owner-quarantine RPC adapter、exact OK／STALE／pending mapping 與 bigint string boundary 完成；production 零 caller，Auth rejected／D2 sign-out／hosted 均未接。                                                                                                                                                                         |
| 2026-09-01 | FA-03B8                          | dormant caller-supplied single-attempt cleanup coordinator 完成 exact transport→local CAS handoff；production 零 caller，未掃描 queue、未排程、未做跨 tab traffic dedup。                                                                                                                                                                        |
| 2026-09-01 | FA-03B9                          | 使用者核可先完成 dormant Auth-failure handoff：unavailable 只做 B5 local-close，rejected 只把 exact B5 attempt 交 B8 一次；production 零 caller，B1 可信 owner correlation 與 unavailable recovery 仍未完成。                                                                                                                                    |
| 2026-09-02 | FA-03B10                         | 使用者核可 unavailable 不自動恢復與 contract-first；Push v2 enable／refresh v1 已 review-freeze，等待 Claude 複核與 additive migration 核可，runtime／hosted 未變。                                                                                                                                                                              |
| 2026-09-02 | FA-03B10.1                       | production Auth sign-out 明確改為 current-device local scope；exact wrapper／error／GoTrue race 測試通過，Push unsubscribe／cleanup 仍未接線。                                                                                                                                                                                                   |
| 2026-09-02 | FA-03B10.2                       | dormant browser Push capture／unsubscribe／reread seam 完成 bounded 分類；production 零 importer，server cleanup／migration／hosted 未動。                                                                                                                                                                                                       |
| 2026-09-02 | FA-03B10.3                       | Claude 複核 `FA-03B10` 契約；使用者拍板 blocking 全修、egress 放寬、envelope 綁 `authUserId`、不新增 reason；契約修訂為 v1.1，runtime／migration／hosted 未變。                                                                                                                                                                                  |
| 2026-09-02 | FA-03B10.4                       | 使用者補拍板同 binding 無 transport 與 A4 併發替代斷言；契約升 v1.2，新增 A4 handoff，runtime／migration／hosted 未變。                                                                                                                                                                                                                          |
| 2026-09-03 | FA-03A4                          | v1.2 additive 欄位、既有物件替換、共用 residue／mutation helper、兩支 service-role RPC 與 77 項新 pgTAP 完成；六個 canary 全紅、DB 1,169／1,169、完整 frontend／Supabase CI 通過；使用者已核可 exact diff，hosted 未套用。                                                                                                                       |
| 2026-09-03 | FA-03B11                         | shared canonical endpoint／provider／subscription validator、獨立 RSA＋AES envelope、key asset 與 Edge structural ports 完成；Node、Chromium、WebKit、完整 frontend／乾淨 Supabase CI 通過，production graph／provider env／hosted 仍未接線。                                                                                                    |
| 2026-09-04 | FA-03 cleanup limiter            | 使用者核可 Postgres 原子限流；private global＋source token bucket、service-role RPC、HMAC source digest、Edge fail-closed composition、過期 reaper 與 parallel PostgREST 測試完成；38 migrations 重播、DB 1,198／1,198 與完整 CI 通過，production policy／hosted 仍未動。                                                                        |
| 2026-09-04 | FA-03 hosted migration preflight | Hosted read-only transaction 重查 2 sessions／2 participants／2 messages／4 legacy Push／7 outbox，只有 1 reminder 會直接回填；dry-run 精確列出 13 份 migration，未做遠端寫入，等待獨立套用核可。                                                                                                                                                |
| 2026-09-04 | FA-03 hosted migration apply     | 使用者核可後套用全部 13 份；38／38 migration 對齊、4 legacy Push 與 7 outbox 保留、1 reminder sentinel、0 v2／consent／registry／delivery／limiter rows，ACL／catalog／linked lint 通過；Edge／env／secret／request 未動。                                                                                                                       |
| 2026-09-04 | FA-03 cleanup C1 Hosted          | 使用者核可 exact scope；未授權 request 與 DB check 通過，首筆授權 request 缺 ALLOW marker即停損，19 筆取消、無 retry；mode、Function、4 secrets、limiter 完整復原。平台聚合不足以唯一判根因，下一步先做 local-only allowlisted diagnostic。                                                                                                      |
| 2026-09-04 | FA-03 cleanup canary preflight   | 官方文件確認 individual deploy 與 platform logs 會保存兩個 raw source-IP headers；前置確認當時 CLI／未登入 Dashboard 無法確認實際 plan retention，C0 尚待使用者核可。                                                                                                                                                                            |
| 2026-09-04 | FA-03 cleanup C0                 | 使用者確認 Free／1 天 retention 並接受 raw-IP log；暫時單獨部署 hard-gated cleanup，2 次空 body POST 均 exact 503／RETRY；platform log 正好 2 筆且兩個來源 header 皆存在並相同，DB 零變動；Function 已立即刪除，C1 未核可。                                                                                                                      |
| 2026-09-04 | FA-03 cleanup C1 preflight       | Dormant Hosted limiter-only mode、32-byte token gate、fixed response marker 與 public-key path bundle 拆分完成；本機 targeted／Edge smoke 通過。4 臨時 secrets、最多 21 requests、guarded cleanup 的 exact scope 已記錄，Hosted 尚未執行。                                                                                                       |
| 2026-09-04 | FA-03 cleanup C1 diagnostic      | allowlisted stage header、獨立 limiter client 與防偽 error mapping 完成；targeted Node 34／34、完整 frontend／Supabase CI 與 local Edge smoke 通過。Hosted 重驗與 dispatcher version metadata 副作用待使用者核可，遠端未動。                                                                                                                     |
| 2026-09-04 | FA-03 cleanup C1 source result   | 使用者核可後只送 1 未授權＋1 授權 request；授權回 `SOURCE` 即停損，limiter RPC／row 皆 0。Function／4 secrets 已移除，Push/runtime 基線與 dispatcher hash 不變，version 10→14；下一步 local 細分 source substage。                                                                                                                               |
| 2026-09-04 | FA-03 cleanup source substage    | local 已細分 headers／CF／real-IP 缺少、無效與 mismatch，安全條件不放寬；targeted Node 34／34 與完整 frontend／Supabase CI 通過。最小 Hosted 重驗縮為 2 secrets、最多 2 requests、零 DB write，尚待使用者核可。                                                                                                                                  |
| 2026-09-04 | FA-03B12.1                       | dormant B5 manual re-enable storage action 完成：exact `auth-unverified` CAS 原子轉成單一 `subscription_changed` cleanup，跨 tab 收斂且 abort 完整 rollback；完整 frontend／Supabase CI 通過，production／Hosted 未接。                                                                                                                          |
| 2026-09-04 | FA-03B12.2                       | B1 新增 privacy-safe failure notice：只帶 kind／revision／optional prior verified owner，cold boot 不猜 owner、較新 event 阻斷舊 notice；完整 frontend／Supabase CI 通過，callback 預設 no-op 且尚未接 B9。                                                                                                                                      |
| 2026-09-04 | FA-03B12.3                       | dormant B1 → B9 correlation adapter 完成：revision 前後 gate、warm owner exact match、cold branch 不猜 Auth proof、superseded 不進 B9；targeted 22／22 與完整 CI 通過，production graph 零 reference。                                                                                                                                           |
| 2026-09-04 | FA-03B12.4                       | dormant manual re-enable coordinator 完成：逐段重驗 Auth proof、B8 exact completion 後才建新 binding／token、predecessor 只在同次呼叫記憶體傳遞；真實 B5／B8 Chromium 組合與完整 CI 通過，future enable port／production caller 未接。                                                                                                           |
| 2026-09-04 | FA-03B12.5                       | B5 pre-network provisioning cancel 完成：exact CAS 只刪 provisioning、保留 logical device、不建 cleanup；stale／enabled／abort／replay 均 fail-closed。因本機七日窗累積 223 場造成 fixture 被 100 筆上限截掉，安全 reset local DB 後完整 CI 通過；Hosted 未動。                                                                                  |
| 2026-09-04 | FA-03B12.6                       | B5 refresh commit 完成：exact enabled CAS 只接受同 consent ID／epoch 與 version no-op 或恰好 +1；no-op 不改 local revision、成功重放收斂、stale／drift／abort 保留舊值。真實 Chromium 與完整 CI 通過；production／Hosted 未接。                                                                                                                  |
| 2026-09-04 | FA-03B12.7 preflight             | 唯讀查證 v1.2 server-only provider origins 與 B11 browser encryption 必須持有 origins 的契約衝突；已整理 A 拆分結構／server policy（建議）與 B 公開 policy 兩案。runtime／migration／Hosted 未變，等待使用者選擇。                                                                                                                               |
| 2026-09-04 | FA-03B12.7.1                     | 不依賴 provider-policy 的 dormant enable／refresh coordinator core 完成：逐段重驗 Auth proof 與 exact local snapshot、每次最多一個 request、exact response 才交 B5／B12.6 commit；targeted 8／8 與完整 CI 通過，具體 browser／transport、production／Hosted 未接。                                                                               |
| 2026-09-04 | FA-03B12.7.2                     | provider-neutral browser subscription port 完成：enable-only permission prompt、ready SW、VAPID exact match／rotation、raw subscription validator injection 與 abort fail-closed；targeted 8／8、Node 546／1 skipped 與完整 CI 通過，production validator／transport／Hosted 未接。                                                              |
| 2026-09-06 | FA-03B11.1                       | 使用者選擇 A；Push v2 契約升 v1.3，browser structure 與 server provider-policy 拆分，Edge 解密後完整重驗，corpus 保存雙層預期；targeted Node 43／43、Chromium＋WebKit 2／2 通過，production／Hosted／provider 值未動。                                                                                                                           |
| 2026-09-06 | FA-03B12.7.3                     | dormant encrypted HTTP transport 完成：499-byte same-origin key、enable token digest、Auth-bound envelope、每次最多 1 POST、exact bounded response／401 handoff；Node 558／1 skipped、Playwright 346／4 skipped 與完整 Supabase CI 通過，production／Hosted 未接。                                                                               |
| 2026-09-06 | FA-03B12.7.4                     | dormant local composition 完成：B5 storage、browser acquisition、structure validator、encrypted transport 與 coordinator 串接；Node 562／1 skipped、Playwright 348／4 skipped 與完整 Supabase CI 通過，production／Hosted 未接。                                                                                                                 |
| 2026-09-07 | CI stabilization                 | 完整 CI 揭露既有 court subscription checkbox auto-save race；只讓測試逐筆等待權威 DB save，isolated case 通過，production code 未改；獨立 commit `dc6b947`。                                                                                                                                                                                     |
| 2026-09-07 | FA-03B12.8                       | local-only Push v2 Edge HTTP／Auth／DB composition 完成：authoritative Auth、server provider policy、hybrid decrypt、A4 enable／refresh RPC 與 Hosted hard gate；targeted 16／16、Node 578／2 skipped、Playwright 348／4 skipped、DB 1,198／1,198、兩支 Edge smoke 通過，production／Hosted 未接。                                               |
| 2026-09-07 | CI stabilization                 | B12.9 首次完整 CI 證明既有 court test 在 Me 頁初始 notification GET 完成前操作；改為逐筆等待 exact DB set＋UI count，isolated 連跑與完整 Supabase CI 通過；production code 未改，獨立 commit `6f7d98a`。                                                                                                                                         |
| 2026-09-07 | FA-03B12.9                       | 真實 Chromium／IndexedDB／WebCrypto 經 Vite key、跨 origin transport、本機 Edge、Auth `/user`、A4 enable／refresh RPC 回 local CAS；targeted 連跑與完整 CI 1／1，正式 App／provider／Hosted／migration 未動。                                                                                                                                    |
| 2026-09-07 | FA-03B13 preflight               | 唯讀確認 UI 仍走 legacy、B1 proof／revision 尚無 Push port、B9 零 caller、SW 無 subscription-change、Edge／DB 雙 server gate 仍關閉；下一批只做 Auth proof adapter，不改 UI／Hosted／migration／production values。                                                                                                                              |
| 2026-09-07 | FA-03B13.1                       | B1 verified proof／revision current-check、exact 401 retry 與 profile failure／authority seam 完成；same-proof publication race 收斂到最新 revision。Node 581／2 skipped、Playwright 348／4 skipped、DB 1,198／1,198 與完整 local Edge CI 通過；production main／UI／Hosted 未接。                                                               |
| 2026-09-07 | FA-03B13.2                       | production main 接 hard-coded disabled shell；完整 runtime 以 dynamic import 組合 B1／B9、subscription、cleanup 與 manual re-enable。disabled 零 loader／storage／SW／權限／request，重模組未輸出；Node 587／2 skipped、Playwright 348／4 skipped 與完整 Supabase CI 通過。                                                                      |
| 2026-09-07 | FA-03B13.3 preflight             | 唯讀查明三個 UI 入口仍共用 legacy 狀態；v2 storage 實際有八種狀態，operation unavailable 另計。已整理安全顯示分組、invalid 恢復與隱私頁 Edge raw-IP／IndexedDB 缺口；runtime、UI、隱私頁與 Hosted 均未改，等待產品確認。                                                                                                                         |
| 2026-09-07 | FA-03 dispatcher preflight       | Hosted dispatcher version 14 兩份 source 與 repo byte-identical，沒有 prod source drift；現行仍為 legacy worker。已確認 generation／lease／fresh-check／delivery／DNS barrier 缺口與 direct Postgres transaction＋additive migration 必要性；Hosted 無寫入。                                                                                     |
| 2026-09-07 | FA-03 dispatcher D0.1            | dormant server policy／IANA public A＋AAAA／pinned `https.Agent`／evidence-only TTL core 完成；targeted 44／44、完整 frontend／Supabase CI 通過。active dispatcher hash 與 production bundle 不變；Hosted／migration 未動。                                                                                                                      |
| 2026-09-07 | FA-03 dispatcher D0.2            | dormant fixed outcome／strict Retry-After／total deadline／redacted log 完成；local Edge 證明 Node Agent lookup 不適用，Deno native pinned TCP→startTLS canary 回 204。Node 604／3 skipped、Playwright 348／4 skipped、DB 1,198／1,198 與三支 Edge 通過；active dispatcher／bundle／Hosted／migration 未動。                                     |
| 2026-09-07 | FA-03 dispatcher D1              | 使用者核可 additive migration；專用 command schema／最小權限 passwordless role、7 commands、absence guards、delivery lease index 與 v2 outbox immutability 完成。targeted 52＋14＋26、DB 1,290／1,290 與完整 CI 通過；39 local migrations，Hosted／Prod 未套用。                                                                                 |
| 2026-09-07 | FA-03 dispatcher D1.1            | D2 adapter 前查出 D1 command 的 bigint JSON 尚未 cast text；已將 generation、各 ID 與 transport version 全部改成 canonical decimal string，避免 JavaScript 精度流失。39 migrations 從零重播、lint、52 targeted 與 DB 1,290／1,290 通過；本批未碰 Hosted。                                                                                        |
| 2026-09-07 | FA-03 dispatcher D1.2            | D2 parser 盤點續查出 request／delivery lease 與 TTL 毫秒欄位也是 bigint；已一併改為 canonical decimal string，測試明確檢查 JSON type。這是同一契約修正的完整收尾；本批未碰 Hosted。                                                                                                                                                              |
| 2026-09-07 | FA-03 dispatcher D2              | active repo source 新增 local-only v2 Edge／dedicated DB role／mock provider composition；真實 send transaction lock、401 無 worker、accepted completion、legacy isolation 與完整 cleanup 均通過。Node 613／4 skipped、Playwright 348／4 skipped、DB 1,290／1,290 與四支 Edge 各 1／1；Hosted／Prod 未動。                                       |
| 2026-09-07 | FA-03 dispatcher D3A             | Deno-native encrypted sender、16 KiB bounded response parser 與獨立 default-unavailable manual canary source 完成；local 真實 pinned IP／TLS／Web Push→204→DB accepted，完整 CI 通過。該批完成時 Hosted 為 38 migrations／version 14 legacy dispatcher；後續 D1 Hosted row 記錄 migration 套用結果。                                             |
| 2026-09-07 | FA-03 dispatcher D1 Hosted       | 使用者授權所有 migration 後套用唯一 pending `202609070001`；39／39、role／7 commands／index／trigger、資料、linked lint 與 structural diff 均通過。legacy Function／cron／4 Push／7 outbox 不變；secret、deploy、request、runtime control 未動。                                                                                                 |
| 2026-09-07 | FA-03 dispatcher D3B             | DB URL／generation／provider policy／transport 改為 canary-only Secret；只共享既有 VAPID，通用設定無法滲入。unit 4／4、local sender／DB 2／2 與完整 frontend／Supabase CI 通過；Hosted 尚未設定或部署。                                                                                                                                          |
| 2026-09-07 | FA-03 dispatcher D3C             | canary 新增 exact `database-probe`／`dispatch` 動作門檻；probe 只驗專用 role 連線、不建 worker／不寫 DB／不送 Push。unit 5／5、local probe worker=0、dispatcher 2／2 與完整 frontend／Supabase CI 通過；Hosted 尚未設定、部署或呼叫。                                                                                                            |
| 2026-09-07 | FA-03 dispatcher Hosted B        | 設定專用 role credential／六個 canary-only Secret、部署獨立 Function，單一 no-write probe exact 200／ready。role／source／migration／lint 通過；worker／delivery／v2 為 0，legacy Push 4／outbox 7、runtime／cron／legacy hash不變；`dispatch` 未呼叫。第一次 shell 中斷已完整復原後重做。                                                       |
| 2026-09-07 | FA-04 phase 0a                   | AST manifest 鎖定 6 個 HTML renderer、1 個 pass-through、controller DOM 違規 0、2 個 `syncCommit` caller 與 13 個 CSS imports；每類 gate 均驗 add-red／restore-green。只改測試／manifest，runtime、UI、Hosted 未變。                                                                                                                             |
| 2026-09-07 | FA-04 phase 0b                   | 正式 mutation ledger 鎖定 17 files／125 nodes／34 symbols／112 refs；browser port manifest 鎖定 controller 1／adapter 26／UI 54／type-only 152；四個外部 live roots 經三種 browser 的資料更新與頁面切換仍保持 identity。只改測試／manifest／文件，runtime、UI、Hosted 未變。                                                                     |
| 2026-09-07 | FA-05 phase 1                    | 刪除 auth-null no-op preload，只留 verified identity transition；3 個檔內名稱改私有；13 個零 production caller 的 runtime re-export 與 10 組失效鷹架退場，2 個實用 helper re-export 保留。Node 639／5 skipped、Playwright 350／4 skipped、bundle gates 通過；production JS -21 raw／-32 gzip。                                                   |
| 2026-09-07 | FA-05 phase 2                    | production build＋preview 覆蓋 anonymous／authenticated／OAuth callback／390px Chromium 與 WebKit；private chunk 同 probe 有 negative／positive control，checker 新增 Brotli 報告。production-equivalent bundle 差異 0；frontend、local 與 preview 回歸通過。                                                                                    |
| 2026-09-07 | FA-05 phase 3                    | Bundle ADR 採 A 維持完整 client＋facade；B／C／D 不採，E 只保留條件式隔離 PoC。核對 9 個 production imports、boot 時序、package attribution、`setAuth` 實況與目前 14＋8 個 non-byte／Sentry provenance gates；只有文件變更。                                                                                                                     |
| 2026-09-07 | FA-06 stage 4 preflight          | 唯讀核對 81 行／3 consumers 的 manifest、14 lazy sheets、14 unmount registrations、4 configure、2 preload listeners、87 個 facade harness calls 與 5 組可退役字面 gate；targeted 121／121，下一步先做 tests-only manifest 化。                                                                                                                   |
| 2026-09-07 | FA-06 stage 4.1                  | manifest 新增 3 個 frozen structure owners；lazy／unmount／auth gate 不再寫死 facade。精確退役 5 組純字面凍結；missing-owner canary 紅、還原 7／7，Node 638／5 skipped、Chromium 348／4 skipped 與 bundle 結構 gate 通過；零 runtime 變更。                                                                                                      |
| 2026-09-07 | FA-06 stage 4.2                  | 14 個 dynamic imports、mount bindings／preloaders、loading shell 與 `deferSurfaceOpen` 搬到 `surfaceLoaders.js`；manifest／HTML inventory／mutation ledger 同步換 owner。Node 638／5 skipped、Chromium 348／4 skipped、preview 5／5 與 bundle 結構 gate 通過；UI／資料／Hosted 未變。                                                            |
| 2026-09-07 | FA-06 stage 4.3                  | 4 個 configure 與 14 個 unmount registrations 搬到 `sessionViewWiring.js`，main 明確呼叫並鎖 discovery → session → profile → form；facade 降至 284 行。Node 638／5 skipped、Chromium 348／4 skipped、preview 5／5，UI／資料／Hosted 未變。                                                                                                       |
| 2026-09-07 | FA-06 stage 4.4                  | app-module state、login renderer、preloads 與 2 listeners 搬到 wiring；重複 configure 實測只綁 2 次。browser port 只換 owner，facade 降至 167 行。Node 639／5 skipped、Chromium 348／4 skipped、preview 5／5，UI／資料／Hosted 未變。                                                                                                            |
| 2026-09-07 | FA-06 stage 4.5                  | AST／Git 歷史確認 facade 40 exports、production 17 imports／1 importer、browser 87 calls／12 specs。86／11 是 phase 0b 前基線；決定下一批直接 owner 化並同批刪 facade，不留 test-only bridge。targeted Node 210／210；本批只有文件。                                                                                                             |
| 2026-09-07 | FA-06 stage 4.6                  | 167 行 facade／40 exports 完整退役，production／Node／Playwright 直接用真正 owner，舊 harness 87→0；2 個 DOM renderer 與 AST inventory 換 owner。Node 638／5 skipped、Chromium 348／4 skipped、preview 5／5，total JS -868 raw／-28 gzip。                                                                                                       |
| 2026-09-07 | FA-06 stage 5 preflight          | 唯讀確認 blockedPlayers 的 3 個 production refresh 入口、session store 3 欄、My Sessions 3 組寫入、Auth 5-key reset、解除封鎖守衛與 Me Page 9-key 契約；固定零依賴 facade 與四項競態不變量。targeted 137／137；本批只有文件。                                                                                                                    |
| 2026-09-07 | FA-06 stage 5.1                  | blockedPlayers 三欄與 request gate 搬入零依賴 facade；My Sessions 舊 owner 歸零，Auth 先清舊帳號資料，Me Page 維持九欄契約。targeted 27／27、Node 645／5 skipped、Chromium 348／4 skipped、preview 5／5、local API 4／4、desktop 44／11 skipped、mobile 6／6；WebKit 非阻擋 focus 165／3 skipped／8 failed。                                     |
| 2026-09-07 | FA-06 stage 6 preflight          | AST 重驗 Chat 為 1／12 open callback、1／11 registry、2／15 transition、8 欄 context／15 dependencies；目前 7 controller calls、5 surface calls，舊 5／86 已失效。完整列出 polling／cursor／authority／account invariants，固定 6.0 → 6A → 6B；targeted Node 191／191、Chromium 121／1 skipped。                                                 |
| 2026-09-07 | FA-06 stage 6.0                  | My Sessions 新增 immutable unread command；Chat 刪除共用 session 原地 mutation 與直接 notify 依賴，AST negative canary 防倒退。targeted 129／129、Node 646／5 skipped、Chromium 348／4 skipped、preview 5／5、local API 4／4、desktop 44／11 skipped、mobile 6／6；WebKit 非阻擋 focus 164／3 skipped／9 failed。                                |
| 2026-09-07 | FA-06 stage 6A                   | Chat feed facade 接管 messages／roster／cursor／gate／poller；context 8→4 欄、controller 244→193 行，舊 owner 實際刪除。三層 stale guard、quiet/loud、stop、mark-read retry／monotonic cursor 均有測試；Node 655／5 skipped、Chromium 348／4 skipped、preview 5／5、local API 4／4、desktop 44／11 skipped、mobile 6／6；WebKit 維持 164／3／9。 |
| 2026-09-07 | FA-06 stage 6B.1                 | Messages 改用只讀 `mySessions`／`courts` 的專用 selector，移除 App Context Messages hooks、舊 groups adapter 與 harness bridge；source gate 有三個 negative canary。typecheck／lint、targeted Node 80／80、desktop Chromium 16／16、build／bundle structural checks 通過；尚待 6B.2 route owner。                                                |
| 2026-09-07 | FA-06 stage 6B.2                 | 零依賴 page-route owner 集中四頁 hash／history owner／private fallback／focus；Messages deep link、tab click、Back／Forward 共用 `navigate()`，main 專屬 route／tab／heading 特例已刪。Node 659／5 skipped、Chromium 348／4 skipped、route 19／19、navigation 32／32 與 gates 通過；尚待 6B.3 Chat surface 邊界重驗。                            |
| 2026-09-08 | FA-06 stage 6B.3                 | 唯讀確認 main → controller → imperative Chat surface 鏈、5 個 legacy mutation owners、8 個 imperative adapters 中的 Chat 與 5 個 Browser direct calls；固定 6B.4 React ownership、6B.5 app wiring 兩批。targeted Node 152／152；本批只有文件。                                                                                                   |
| 2026-09-08 | FA-06 stage 6B.4                 | feed 改為 React 可訂閱 immutable state；舊 `setState/setArchived`、Chat DOM queries／native listeners 與 5 個 legacy mutation entries 退役。imperative adapters 8→7，ledger symbols 34→31；Node 661／5 skipped、selected Chromium 127／1 skipped、build／bundle structural checks 通過；尚待 6B.5。                                              |
| 2026-09-08 | FA-06 stage 6B.5                 | controller 改為只建立 Chat model，app wiring 統一三個入口並選 concrete surface；六類舊 callback／bridge 退役且各有 canary。Node 666／5 skipped、mock Chromium 348／4 skipped、local API 4／4、desktop 44／11 skipped、mobile 6／6、preview 4／4；Stage 6B 與第一個 vertical slice 完成。                                                         |
| 2026-09-08 | post-FA-06 completion audit      | 對照 final-v3、現行 source／manifest／gates 後確認通用架構階段完成；Push active 與 release baseline 仍受既定邊界限制。正式 ledger 31 symbols、browser ports 1／26／50／153、targeted 55／55；`ds-bundle/` 有已證實 drift，下一批先做全量唯讀重驗。                                                                                               |
| 2026-09-08 | `ds-bundle` drift preflight      | 9 張卡片、13 個 bundle files、49 source refs、171 classes、13 份 production CSS 全量盤點；50 tokens 全等，CSS 4 changed／2 bundle-only／15 production-only。desktop＋390px 共 18/18 正常渲染、零 console/page/request error 與 overflow；下一批先做 deterministic CSS mirror／gate 與文件真相同步。                                              |
