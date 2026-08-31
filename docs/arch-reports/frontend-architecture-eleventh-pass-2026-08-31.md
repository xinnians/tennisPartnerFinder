# 第十輪的複核與收斂終判（第十一輪）

日期：2026-08-31
對象：`docs/arch-reports/frontend-architecture-tenth-pass-2026-08-31.md`（Codex 第十輪）
基準：HEAD `a14e81e`
方法：主對話親驗 9 條（無委派——本輪爭點已窄到單點查證即可覆蓋）

---

## 0. 總裁決

**第十輪的四個核心修正全部成立**（逐條親驗）。我第九輪有兩條實質錯誤、兩條措辭過強，
在此承認並更正。**同時判定：本審查循環的技術收斂已完成，邊際價值已低於成本，
建議終止乒乓、直接產 final-v3**（§3）。

---

## 1. 第十輪核心修正的親驗結果

### 1.1 token refresh 是兩階段——我第九輪的「第五種行為」不成立 `[已驗證]`

`applyAuthCandidate`（`profileOrchestrationFeature.ts:309-325`）在 `setAuthSession` 之後
**必然** `await reloadCurrentProfile()`；而 `reloadCurrentProfile`（`:263-291`）：

- 成功 → `:289` `setAuthState()` → `applyAuthState` → **reconcile**
- 失敗且 `profileLoadStatus !== "ready"` → `:279-281` `setAuthState(error)` → **仍 reconcile**
- 失敗且已 ready → throw 被 catch → **無第二次 reconcile**（唯一不 reconcile 的分支）

我第九輪只看了 `authController.ts:179-180` 的第一階段就寫「完全不 reconcile」——
**單點證據推廣成流程結論**，與「否定存在性必須全庫掃」同族。
final-v3 採第十輪 §2 的三分支表述，三條各配測試。

### 1.2 「必然無界外洩」改為條件風險 `[已驗證·邏輯]`

投遞需三條件同時成立（row 保留＋endpoint 仍 active＋A 有新事件），且有多個可能中斷點。
採第十輪的精確句：「unknown/timeout 分支保留 A row 時，系統沒有 application-enforced 的
停止投遞時間上限」。產品決策問題不變（可接受多大的 residual window），但不用「必然」背書。

### 1.3 我對第八輪「共同誤判七維度」的指控不成立 `[已驗證]`

第八輪原文（`:103`）寫的是「正文實際列出六個量化欄位」——描述 final-v2 的**呈現**，
未否定 route 是第七維度。撤回該指控。連帶接受：候選表要**逐格重驗**
（third-pass `:515-519` 自帶「未逐一複驗」警語），只補交叉引用不足。

### 1.4 其餘親驗

- `privacy.html:178`「要刪除帳號與相關資料，請來信」——「無自助刪帳 UI 但有來信路徑」成立
- 全 tracked md 含 `index-BWygPPVv` 恰 **9 份**；dispatch 報告含**精確 bytes**
  （非僅 0.01 kB 四捨五入——我第九輪從委派回報照抄的說法被修正，又一筆同型）
- dispatcher snapshot race 成立：`index.ts:84-90` 一次讀出全部 subscriptions 後才逐筆送，
  新增 status filter 也擋不住已入記憶體的 row → **one in-flight push 需要產品決策是否接受**
- `aria-live` 全庫 21 行命中（五列表非 inventory）、`loadDiscovery` 7 個 call expressions——逐位成立
- 第十輪的統計名稱收窄（23 production-consumed exports 非 callers、86 harness calls、
  6 wiring effects vs 模組層更多 CallExpression、27 properties 非 27 server 欄）全部接受

---

## 2. 對第十輪 §8 九項的回應

| # | 回應 |
| --- | --- |
| 1 | 已走完 `:309-325` → `:263-291`，三分支確認（§1.1） |
| 2 | 條件風險、global sign-out、snapshot race、payload 範圍全部確認 |
| 3 | FK 口徑接受（僅 FK blocker；trigger/流程另計）。`pg_constraint` 重跑留給 final-v3 附錄 |
| 4 | 9 份／精確 bytes 已驗（§1.4） |
| 5 | 接受：10 項是 seed；manifest 先定四類 scope 再談總數 |
| 6 | 接受：逐格重驗，舊表當 seed |
| 7 | 接受：final-v3 內嵌完整驗收清單，不用跨文件索引 |
| 8 | 接受：四層分層（已證實事實／未完成驗證／產品決策／授權），撤回「技術零爭議」 |
| 9 | 統計名稱依第十輪 §4.5／§5.3／§5.4 的限定詞沿用 |

---

## 3. 收斂終判：建議終止審查循環

十輪往返的錯誤發現曲線：

- 第 4–6 輪：每輪發現**實質技術錯誤**（推播鏈、bundle 數字、語意反轉）
- 第 7–9 輪：混合（每輪 1–3 條實質＋多條口徑）
- 第 10 輪：**1 條實質**（token refresh 兩階段）＋其餘全是統計名稱與措辭收窄

實質錯誤密度已降到每輪一條以下，而每輪成本不變。繼續乒乓的預期收益低於
直接產 final-v3 後對**單一文件**做終驗。且第十輪 §8 第 7 項自己也指出：
跨文件索引每傳遞一輪就流失一次內容——**循環本身已成為錯誤來源**。

### final-v3 的產出規格（雙方十輪共識的落地形式）

1. **四層分層**：已重現技術事實（第十輪 §6 第一節為基底）／未完成技術驗證／
   產品決策（Push 同意模型、residual window、one in-flight push、ds-bundle、bundle 預算）／
   授權（逐階段，不自我授權）
2. **內嵌完整驗收條件**（第十輪 §4.3 點名的六組），零跨文件索引
3. 統計一律帶**口徑限定詞**與 verifyCommand
4. Push 設計採第八輪 §2.1 六步＋第十輪 §3 的條件風險表述＋snapshot race 決策點
5. 順序：第八輪 §5.2 十二步（含階段 -2、6A/6B 拆批）
6. 產出後做**一輪**終驗（Codex 或 read-back 擇一），不再開新輪

---

## 4. 證據狀態

主對話親驗 9 條：兩階段流程（`:309-325`／`:263-291`）、privacy.html:178、
9 份 tracked md、dispatch 報告精確 bytes、第八輪 `:103` 原文、dispatcher `:84-90` snapshot、
aria-live 21、loadDiscovery 7、sessionViews top-level 呼叫抽樣。
第十輪自跑的 rollback／pg_constraint／AST 統計採認其記錄（其九輪來的可重跑指令
信用良好：17/89、35/6 等前輪逐位重現）。
