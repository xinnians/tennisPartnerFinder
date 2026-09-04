# FA-03 push-cleanup Hosted C1 診斷重驗前置確認

最後更新：2026-09-04

狀態：**使用者已核可並完成 Hosted 重驗；第 1 次授權 request 回 `SOURCE` 後停損，Hosted 已完整復原。結果見
`frontend-architecture-fa-03-cleanup-c1-diagnostic-result-2026-09-04.md`。**

## 白話結論

- C1 首輪只知道「授權 request 沒有真的形成 limiter row」，現有證據不能確定卡在哪一段，所以沒有猜根因。
- 本機已加入固定的診斷 stage。它只會在 Hosted canary mode、POST、正確 32-byte token 全部成立後回傳。
- 診斷只會回傳下方九個固定字串之一，不會回 error text、secret、IP、digest、policy、URL、response body 或 DB 細節。
- 一般 request 的 HTTP status 與 body 沒變；正式 cleanup 仍是 hard-disabled。
- 若使用者核可，建議用一次有停損點的 Hosted 重驗完成診斷：先送 1 次未授權 request，再送第 1 次授權 request。
  若第 1 次授權成功形成 `ALLOW`，才繼續剩餘 19 次；若回 stage 或任何不符，立刻停止並復原。

首輪完整證據見 `frontend-architecture-fa-03-cleanup-c1-result-2026-09-04.md`。

## 診斷程式做了什麼

`push-cleanup` 把 limiter 呼叫拆成可獨立測試的 client，並把失敗位置收斂成固定 allowlist：

| stage            | 只代表                                                   |
| ---------------- | -------------------------------------------------------- |
| `SOURCE`         | Hosted 提供的兩個可信來源 header 缺少或不一致            |
| `POLICY`         | 固定 canary policy 無法通過既有 parser                   |
| `HMAC_KEY`       | limiter HMAC key 無法通過既有 loader                     |
| `BUCKET_HASH`    | 無法產生 global／source bucket hash                      |
| `SERVICE_CONFIG` | Supabase URL 或 server secret key 不可用                 |
| `RPC_FETCH`      | 對 limiter RPC 的 `fetch` 沒有取得 response              |
| `RPC_STATUS`     | limiter RPC 有 response，但 HTTP status 不是成功         |
| `RPC_CONTRACT`   | limiter RPC 的 JSON 或 `ALLOW`／`LIMIT` 契約不符         |
| `UNCLASSIFIED`   | 未分類或非可信程式錯誤；不接受 error 上偽造的 stage 欄位 |

這些 stage 只能縮小故障範圍，不能自動證明更細的根因。例如 `RPC_STATUS` 不會公開 status code 或 response body，
仍要搭配去敏的 Hosted aggregate 才能判讀。

## 不變的安全邊界

- 未授權、mode 不符、method 不符、token 不符或 auth helper throw：固定 `503`＋exact
  `{"outcome":"RETRY"}`，沒有 outcome header，也沒有 stage header。
- 正確授權且 limiter 回 exact `ALLOW|LIMIT`：只回既有 outcome header，沒有 stage header。
- 正確授權但 limiter path 失敗：只回 stage header，沒有 outcome header；兩者不能同時存在。
- canary path 不讀 request body、不載 cleanup private key、不解密、不呼叫 quarantine RPC。
- source code 仍禁止 `console.*`。RPC body 只含 HMAC bucket hashes 與 policy 數字，不含 raw IP。
- server credential 只放 `apikey` header；不另放 `Authorization`。
- production policy、timeout、正式 cleanup、browser wiring、privacy 文案與 hard gate 移除都不在本批。

## 已完成的本機驗證

```text
push-cleanup targeted Node tests：34／34
diagnostic direct tests：成功路徑、8 個邊界、非 JSON／非契約 outcome、偽造 stage 全覆蓋
TypeScript：通過
targeted ESLint：通過
Prettier：通過
local Edge → limiter → quarantine smoke：1／1
npm run test:ci:frontend：通過；Node 509 passed／1 skipped；Playwright 330 passed／4 skipped；build／bundle report 通過
npm run test:ci:supabase：通過；DB 15 files、1,198／1,198；local API 4／4；desktop 45 passed／11 skipped；mobile 6／6；Edge 1／1
git diff --check：通過
Hosted deploy／secret／request／DB write：未執行
```

本機測試只能證明 stage mapping 與安全邊界符合程式契約，不能取代 Hosted 重驗。

## 建議核可的 Hosted 精確範圍

### 1. 事前唯讀基線

以下任一不符就不開始：

- `push-cleanup` 不存在。
- 既有 dispatcher 的名稱、ACTIVE、`verify_jwt=false` 與 artifact hash 符合上次復原值。
- 四個 C1 secret names 不存在。
- limiter 0 rows；consent／registry／delivery 0；legacy／v2 Push 4／0；outbox／pending 7／0。
- runtime control 是 disabled singleton exact 1。

不把 dispatcher 的 version 數字當成 code 是否改變的證據；只用 artifact hash 驗 source artifact。

### 2. 暫時變更

只允許：

1. 部署目前 commit 的 `push-cleanup`，當下 mode 尚未設定，仍 hard-gated。
2. 在同一個受控程序記憶體產生兩份互相獨立的 random 32-byte canonical 值。
3. 一次設定 token、HMAC key、固定測試 policy；最後另一次設定
   `PUSH_CLEANUP_RUNTIME_MODE=hosted-limiter-canary-v1`。

四個 secret 名稱與 policy 數字沿用已核可 C1，不寫入 repo、文件、檔案、command output 或 shell history。

### 3. Request 與停損

1. 先送 1 次未帶 canary token 的空 body POST：必須是 503／exact RETRY，outcome／stage header 都 absent，
   limiter 仍為 0 rows。
2. 再送第 1 次帶正確 token 的空 body POST：
   - 若是 503／exact RETRY、outcome=`ALLOW`、stage absent，才繼續剩餘 19 次。
   - 若有 stage，必須是 allowlist 中唯一一值，且 outcome absent；立即停止，不送剩餘 19 次。
   - 其他任何結果也立即停止。
3. 只有第 1 次授權成功時，才依序送第 2～20 次；都必須 503／exact RETRY、outcome=`LIMIT`、stage absent。
4. 每筆最多等 10 秒，整個 mode 啟用窗最多五分鐘；這只是 runner 停損，不是 production timeout。
5. 總上限仍是 21 requests；任何 request 都不 retry。

這個分段方式不增加原 C1 的流量上限；若問題仍在，實際只會送 2 requests。若第 1 次授權已成功，才用同一輪
臨時 secrets 完成原定的最小 p95 樣本，避免為相同驗證重複變更 secrets。

### 4. 唯讀驗證

- response：outcome 與 stage 互斥；stage 只接受 allowlist。
- 成功完整跑完時 limiter 必須只有 global＋source 共 2 rows；提早停損時只記錄實際 aggregate，不猜資料來源。
- Push tables 與 runtime control 必須保持基線。
- platform logs 只查固定時間窗、exact pathname 與 aggregate；不讀 raw IP、token、digest、API key 或 body。
- 平台預期不保存自訂 request／response 診斷 headers；權威 stage 證據由受控 client 當下比對後只記固定字串。
- 只有完成 20 筆授權樣本才計算 client-observed min／p50／p95／max；不宣稱 p99 或 production threshold。

### 5. 固定復原

成功或失敗都依序：

1. unset runtime mode，立即恢復 Hosted hard gate。
2. 刪除 `push-cleanup`。
3. 只有 limiter rows 與預期 scope 完全吻合時，才用 guarded transaction 刪除；不符就不刪並回報。
4. unset token／HMAC／policy。
5. 唯讀確認 Function、secret names、limiter 與 Push tables 回到基線。

## 這次必須先接受的 Hosted 副作用

上次實測已確認：project-wide secrets mutation 會讓既有 dispatcher 的 Hosted version metadata 單調增加，即使
dispatcher source 與 artifact hash 完全沒變。這輪設定與移除臨時 secrets 會再次改變該 version metadata；平台
沒有在這個流程提供「還原舊 version 數字」的安全操作。

因此，執行 Hosted 重驗前需要使用者明確接受：**dispatcher version metadata 可以增加；驗收改看名稱、狀態、
`verify_jwt` 與 artifact hash 不變。**

## 核可與執行紀錄

使用者於 2026-09-04 明確同意上方精確範圍與 dispatcher version metadata 副作用。實際執行只送 1 次未授權＋
1 次授權 request；授權 request 回 `SOURCE` 後取消剩餘 19 次，沒有 retry。Function、4 個 secrets 與 DB 基線
均已復原；dispatcher artifact hash 不變、version metadata 由 10 增至 14。
