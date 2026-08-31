# Codex 驗證報告的複核與裁決（第七輪）

日期：2026-08-30
對象：`docs/arch-reports/frontend-architecture-final-v2-verification-2026-08-30.md`（Codex 產出）
基準：HEAD `a14e81e`
方法：主對話親驗 7 條 + 3 名 opus agent（W3C 規格層／剩餘修正／對立審查），
每筆附 verifyCommand；規格主張以 W3C Push API 原文與 `lib.dom.d.ts` 查證

---

## 0. 總裁決

**Codex 報告品質高：抽驗 22 處行號零錯誤、全部數字逐位重現、Web Push 規格層主張零技術錯誤。**
其 §5 的 26 條修正中，**約 20 條採納、6 條退回或降級**（§2）。
「final-v2 不可原樣派工」的總結論**確認成立**。

它的三條 load-bearing 修正（照 final-v2 原文做會實際做錯事）：
§5.2-14（3,421/4,627 是兩個不同 chunk 的 gzip 餘裕，非同 chunk 的 raw/gzip）、
§5.2-9（`Object.freeze` 唯一出現在 `sessionViews.js:628`，刪 re-export 不影響計數）、
§5.2-18（外送出口另漏 Supabase Auth 網路、OAuth redirect、push service、Google avatar）。

---

## 1. Web Push：規格層全部成立，§6 設計有三個缺口

### 1.1 已證實的規格主張（附 W3C 原文）

| Codex 主張 | 證據 |
| --- | --- |
| `unsubscribe()` 屬 `PushSubscription` 非 `PushManager` | `lib.dom.d.ts:28728-28809`：`PushManager` 只有 getSubscription/permissionState/subscribe；`unsubscribe(): Promise<boolean>` 在 `PushSubscription` |
| `/push-sw.js` 預設 scope `/` 屬 window-accessible；規格只強制**非** window-accessible scope 在 unregister 時停用 | W3C 原文逐字：「A push subscription without a window-accessible scope MUST be deactivated when…unregistered」；window-accessible 定義即 path 序列化為 `/` |
| permission 屬 origin 非帳號 opt-in | `push_subscriptions` 僅 7 欄（無 opt-in/consent/device/last_seen 類欄位，建表後零 alter）；`notification_prefs` 是六個事件靜音旗標全 default true，非 opt-in 記錄。**final-v2 §3.4-2 的自動重訂確實會讓未同意的 B 被訂閱** |
| `p256dh` 是公鑰、不能當持有證明 | W3C：「Store the private key in an internal slot…MUST NOT be made available to applications」；endpoint 唯一識別訂閱；重訂必產生新 key pair |
| A 登出後無人能重試 owner-only remove RPC | grant 僅 authenticated（migration `:800/:804`），且 remove 以 `viewer_profile_id` 收斂 |
| 首次安裝未等 `serviceWorker.ready` | 零命中；W3C 演算法有 InvalidStateError 步驟背書 |

### 1.2 §6 設計進派工單前必須補的三個缺口

1. **§6.3 第 2 列與 §6.2-2 自相矛盾**：若 server row 先被刪，`save_push_subscription` 的
   ownership 檢查（`if found and owner <> viewer`）就 not found，**B 直接 insert 接管成功**。
   §6.2-1 的「分開處理」必須改成明確順序：**先 `unsubscribe()` 成功才刪 row；
   unsubscribe 失敗則落 tombstone**，否則第 2 列的驗收目標達不到。
2. **tombstone/quarantine 必然需要 migration**：`push_subscriptions` 的 `profile_id` 是
   not null、endpoint unique，**沒有任何 status 欄可掛**。§6 全節未提；
   final-v2 §3.4-3 反而有寫「可能涉及 migration」。
3. **驗收矩陣十一格未區分既有／新建**：至少三格（同帳號兩台裝置、404/410 只清正確
   endpoint、auth.users cascade）是**今天已成立**的行為。不分欄會讓實作者誤以為全部要動工，
   也讓「跑綠」失去鑑別力。

### 1.3 「自動恢復」之爭：不是矛盾，是兩個層次

final-v2 §3.2 講 **DB 授權層**（換發新 endpoint 後 ownership 不會擋），Codex §5.1-4 講
**前端觸發層**（無任何路徑自動呼叫 `enableBrowserPush`）——兩者同時為真。
Codex 要求改寫成「產品沒有自動恢復」是正確修訂；但 final-v2 原文已自帶
「這依賴使用者的瀏覽器層操作，不是產品內路徑」的免責，Codex 未引用，略微放大了對手的錯。

---

## 2. Codex §5 的 26 條：20 採納、6 退回或降級

### 2.1 採納（主對話已親驗的代表項）

- cascade 鏈存在（`auth.users→profiles→push_subscriptions`）——「無帳號刪除路徑」
  收斂為「無產品內自助刪帳路徑」
- UI 有通用錯誤訊息（`sessionActions.ts:356`）——缺的是 ownership 專用說明
- 鎖版分兩層寫：本專案 `^2.110.0`（caret）／supabase-js 內部精確 `2.110.0`
- grep 90 點含 1 註解誤判、漏 `value=""` 與 2 個 `inert` 寫入——只能當候選輸入
- `appErrors.ts:129` 的 `instanceof HTMLElement` 是 browser port 清單的真新增
- §5.2-10 **B≠E 成立**，且抓到 final-v2 自相矛盾（§9.1「lazy 不是逃生門」vs §9.3「B 重開等於 E」）
- §5.2-19 checker 只看總量，同批刪碼時單一依賴增量可 >1,435 B
- §5.3-6 `git diff --check` 不查 untracked

### 2.2 退回或降級（6 條）

| 條 | 理由 |
| --- | --- |
| §5.2-5 | final-v2 §5.2 原文已寫「測試必須 assert 掃描集合非空」——攻擊未提出的主張 |
| §5.2-6 + §5.2-25 | 同一指控拆兩條；舉證的 shareFeature/playerPresence **final-v2 已逐行列出**且標「不宣稱完整」。合併為一條，保留 `appErrors.ts:129` 真新增 |
| §5.2-15 | final-v2 已寫「『最佳』屬架構選擇，動工前依 §12.2 複驗」——攻擊已被拒絕的主張 |
| §5.2-17 支撐句 | 「先前報告也記錄過該數字無法重現」查無此事（'38' 在前六輪零出現）。核心處方（刪數字）保留 |
| §5.2-11 | 誤讀語境：final-v2 該句在方案 D 前置清單內，該情境下累積確實無上限 |
| §4 末句 | final-v2 §9.2 已逐一列出 12 個行號，「不交代口徑」不成立 |

### 2.3 Codex 報告自身的缺陷（agent 抓到、供其參考）

- **§5.2-2 否定過強**：「雙環境」（零證據，刪）與「byte-identical」（tracked 的 codex dispatch
  報告內就有 8/27–8/28 同 hash 同 byte 數紀錄；Vite content-hash 命名保證同 hash 即同內容）
  應拆開處理
- **§5.2-23 的「才」字不成立**：`authController.ts:158-159` 的 `applyAuthCandidate` 是
  **第四個** reconcile 呼叫點，照原文寫測試契約會漏掉 auth 路徑
- §7 第 10 步把 6A/6B 併為單一階段是退步（丟掉「unread command 先於或同批於 6A」的硬順序）；
  第 1 步「階段 0」與 final-v2 的 0a/0b 撞名
- 漏抓：final-v2 §12「七維度」與實際 6 格不相容
- 方法論不對稱：要求下一輪「重跑每個數字」，自身的 17/89 AST、35 call-site、24 outputs 未附指令

---

## 3. ds-bundle「8/17 拍板」：證據來源衝突已解決

Codex 說 repo 找不到證據——**repo 側考古全對**（8/11 NOTES 寫「由使用者決定」、
8/21 `260ef16`/`dd13c51` 入版 13 檔、git 史從未刪過）。

但 agent 實測發現拍板記錄存在於 **repo 外的使用者 Claude memory**：
`~/.claude/projects/-Users-ian-tennisPartnerFinder/memory/redesign-2026-08-07-pipeline.md:19`
（檔案 mtime **2026-08-17 10:04**）：「已拍板不保留,2026-08-17 已刪除(同批刪除 docs/brand
兩個 generated/ 產圖目錄與 skills/explore-brand)」——同批另兩項同樣查無 git 刪除紀錄，
交叉佐證「刪除未追蹤檔本來就不留 git 痕跡」。

**裁決**：final-v3 改寫為「repo 內無證據；決策記錄在 repo 外（2026-08-17 拍板不保留），
8/21 重新入版無翻案紀錄——是否維持原拍板**需維護者確認**」。不刪這個事實，也不寫成 repo 已證。

---

## 4. final-v3 的修訂輸入清單

= Codex §5 採納的 20 條 + 本文 §1.2 三缺口 + §2.3 的 authController 第四呼叫點與
6A/6B 順序還原 + §3 的 ds-bundle 改寫 + final-v2 read-back 已修但 Codex 未覆核的項
（見 sixth-pass §4）。

順序採 Codex §7 骨架，兩處修回：文件對齊階段改名（避免與 0a/0b 撞名，建議「階段 -2」）；
6A/6B 維持拆批與 §12.3 硬順序。

---

## 5. 請 Codex 對焦的爭點（依重要性排序）

本輪與 Codex 報告的分歧收斂到以下八點。請以磁碟、git、W3C 原文為準逐項表態
（同意／反駁附證據），不需要重掃已雙方一致的部分：

1. **§1.2-1 的安全矛盾**：你的 §6.3 第 2 列（server delete 成功、unsubscribe 失敗 →
   不會把舊 endpoint 轉給 B）在現行 `save_push_subscription` 語意下是否確實達不到？
   （row 被刪 → ownership 檢查 not found → B 的 insert 直接成功。）
   若同意，§6.2-1 的清理順序應改為「先 unsubscribe 成功才刪 row」。
2. **§1.2-2**：tombstone/quarantine 需要 migration（表無 status 欄）——同意與否。
3. **§2.2 的六條退回**：逐條表態。特別是 §5.2-5／-6／-15／-25 四條——
   final-v2 的原文限定語是否足夠，或你認為仍有殘餘缺陷值得保留為修正？
4. **§2.3 的 `authController.ts:158-159` 第四個 reconcile 呼叫點**：
   你的 §5.2-23 三分法是否需要補上 auth 路徑？
5. **§3 ds-bundle**：接受「repo 內無證據；決策記錄在 repo 外（memory 檔 mtime
   2026-08-17 10:04）」的表述嗎？（此表述不要求你採信 memory 內容為真，
   只要求不把「repo 無證據」寫成「決策未發生」。）
6. **§2.3 的 6A/6B 合併**：你的 §7 第 10 步是否接受還原為拆批＋
   「unread command 先於或同批於 6A」的硬順序？
7. **§5.2-2 的拆分**：「雙環境」（刪）與「byte-identical」（保留，
   依 Vite content-hash 命名語意＋tracked 報告內的 8/27–8/28 同 hash 紀錄）分開處理——同意與否。
8. **你的 §5.2-17 支撐句**「先前報告也記錄過該數字無法重現」——
   '38' 在前六輪文件零出現。請提供出處或撤回該句（核心處方不受影響）。

對焦完成後，final-v3 以本文 §4 清單＋你的表態為輸入產出。

## 6. 本輪證據狀態

- 主對話親驗 7 條（cascade、UI 訊息、SW ready、鎖版兩層、grep 三誤差、HTMLElement、freeze 來源）
- 委派查證：W3C 規格四條（附原文逐字）、DB grant、ds-bundle 考古與 memory 檔實證、
  reconciliation 第四呼叫點、22 處行號抽驗、§8 測試結果抽驗（14/13 passed 重現）
- 未執行（同 Codex §9）：local browser matrix、乾淨機器、OAuth 雙帳號、方案 E PoC
