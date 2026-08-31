# 第八輪的複核與收斂裁決（第九輪）

日期：2026-08-31
對象：`docs/arch-reports/frontend-architecture-eighth-pass-2026-08-30.md`（Codex 第八輪）
基準：HEAD `a14e81e`
方法：主對話親驗 9 條 + 2 名 opus agent（規格/SQL 邏輯、對立審查）；W3C 原文逐字核對

---

## 0. 總裁決

第八輪對第七輪的**六條修正全部成立**（主對話逐條親驗：6 欄、grant `:803/:804`、
`§5`=47 條、unsubscribe boolean 語意、hash 截斷、third-pass 同類記錄），
且它的可重跑指令品質是本系列最高（AST 17/89、profile helper 35/6 皆逐位重現）。

但第八輪自身有**一個硬錯誤與十二處待修**（§2），其中三處會直接影響 Push 派工設計。
雙方分歧已收斂：**技術事實層再無爭議，剩餘全部是產品決策或待實作項**（§4）。

---

## 1. 第八輪九項清單（§8）的最終狀態

| # | 項目 | 狀態 |
| --- | --- | --- |
| 1 | 17/89、35/6、24 outputs 重跑 | **已確認**（主對話逐位重現 17/89 與 35/6） |
| 2 | W3C unsubscribe boolean 語意 | **已確認**（agent 取回演算法原文逐字：第 3 步「already been deactivated, resolve promise with false」、第 4-5 步平行 deactivate 後 resolve true）。一處措辭精修見 §2.3 |
| 3 | takeover 前端半邊 + DB rollback | **前端半邊已證**（`notificationPush.js:29-36` 重用 + migration `:172-178` row 不存在直接 insert，SQL 邏輯與 rollback 輸出一致）；DB rollback 本輪依授權邊界未重跑，採認 Codex 實測 |
| 4 | durable quarantine 才需 migration | **需重新表述**，見 §2.2——「條件式」實質空心 |
| 5 | 行為契約 | **要五種不是四種**，見 §2.4；且 `applyAuthCandidate` 存在性要更正（§2.1） |
| 6 | 6A/6B 邊界與 unread 硬順序 | **已確認保留** |
| 7 | 禁用「同 hash 保證 byte-identical」 | **保留禁令，但要附量級與真正的風險點**，見 §2.5 |
| 8 | ds-bundle 標「維護者待確認」 | **已確認**（第八輪 §2.5 的表述雙方接受） |
| 9 | 盤點所有 RESTRICT/NO ACTION FK | **仍是待辦**——第八輪只給「例如」三處；本輪補：直接阻擋恰 **5 RESTRICT + 1 NO ACTION**（它引用的三處剛好覆蓋全部），另有**間接路徑**未列：`profiles →(cascade) sessions →(restrict) reports.session_id`（`202607170003:57/:95`）——主揪的球局被檢舉過，刪帳號就會被擋 |

---

## 2. 第八輪自身的待修處（final-v3 前必改）

### 2.1 硬錯誤：`applyAuthCandidate` 存在

`[已驗證]` 第八輪 §2.4／§4 說「`applyAuthCandidate` 不存在」——**它存在**，在
`src/features/profile/profileOrchestrationFeature.ts:309`（`:336`／`:358` 呼叫），
且經 `dependencies.setAuthSession` → `authController.ts:172` → `:176 applyAuthState`
確實落在 auth reconcile 鏈上。

第七輪的實際錯誤是**位置歸屬**（把它掛到 `authController.ts:158-159`），不是存在性。
第八輪用錯誤理由否定了一個位置錯誤的正確函式名。

（本系列主對話在上一輪也photocopy了這個「不存在」——當時的驗證指令只 grep 了
`authController.ts` 單檔，把「該檔內不存在」誤當「全庫不存在」。同型教訓：
**否定存在性的驗證必須全庫掃**。）

### 2.2 tombstone「條件式同意」實質空心

`[委派查證·附 dispatcher 源碼]` 第八輪區分「正常路徑不需 migration／durable quarantine 需要」。
但它自己 §2.1-5 承認：exception／timeout／unknown 時保留 A row。而
`index.ts:87-89` 的 dispatcher 只用 `profile_id` 過濾、表無任何狀態欄——
**保留的 A row 會被無限期繼續派送**。

所以「不 migration 的正常路徑」在失敗分支**必然留下無界外洩窗口**，而 tombstone 提出的
唯一理由就是失敗分支。final-v3 應寫成：

> 選擇不 migration＝選擇接受失敗分支的無界外洩窗口。這是**產品決策**，不是實作細節。

（第八輪 §4 第 6 列還把第七輪的主張改寫成「所有 cleanup 都要 migration」再反駁——
第七輪原文主詞明寫 tombstone/quarantine，範圍誤述。）

### 2.3 unsubscribe 語意的措辭精修

規格的 MUST NOT 掛在第 4 步 in-parallel 的 deactivate 子句，resolve true 是第 5 步、
不等待平行步驟完成。final-v3 用：「true 代表 deactivation 已啟動，UA 隨即負有不再投遞的
義務，但 push service 側請求可能仍在重試中（規格第 4 步：SHOULD retry for a reasonable
amount of time）」。

### 2.4 行為契約是五種不是四種

`[已驗證]` 第八輪的四種漏掉 **token refresh 路徑**：`authController.ts:179-180`——
identity 未變時只 `setState` + `emit("me")`，**完全不 reconcile**。這是最容易在測試契約
漏掉的一種。另外「三條有直接呼叫的流程」是 call-site 分佈數不是入口窮舉——
`loadDiscovery` 本身有 7 個 caller，寫契約時以行為分類不以呼叫點列舉。

五種：一般 discovery load（只 reconcile detail）／quiet refresh（不 reconcile，但在途
request 晚到仍落 state）／mySessions roster reload（detail+chat）／auth state apply
（detail+chat，再 async reload）／**token refresh（不 reconcile）**。

### 2.5 byte-identical：禁令保留，但兩處要修

第七輪確實寫了「保證」二字（非稻草人），第八輪拒絕正確。但：

- 應附量級：8 字元 base64url ≈ 48 bits，單次意外碰撞 ≈ 3.55×10⁻¹⁵；且證據面是
  **8 份 tracked 報告橫跨 8/27–8/28** 同名同數字＋現行 source 可 byte-identical 再產出。
- **真正的殘餘風險是那 8 份報告的出處獨立性**（可能互相抄寫）——第八輪完全沒提，
  挑了較弱的反對理由。且報告記的是 0.01 kB 精度的四捨五入值。

final-v3 措辭：「高度一致的歷史紀錄；因無歷史 artifact 雜湊，不宣稱已證明」——即第八輪
§2.7 的結論句，補上述兩點。

### 2.6 其餘

- **§2.3 對 §5.2-15 的處方過度**：七維度六候選表存在於 `third-pass:521-529`，
  正確處方是**補交叉引用**＋傳承該表的通則警語，不是「重建比較表」。
  且「七維度 vs 六格」是**第七輪與第八輪的共同誤判**——表就是 7 列，第 7 列 route
  是定性欄，final-v2 挪到散文寫。兩輪都應撤回這點。
- **browser port 清單退化**：第八輪只列 2 項，sixth-pass §4-#3 有九項實測清單
  （agent 逐項磁碟複驗全部成立），另補第十項 `playerPresence.js:21`。
- **§5.2 內容流失**：只保留順序、丟掉約十二項具體驗收條件（0a 四支 gate、0b 的
  live roots identity 測試、階段 2 的 positive control、階段 3 的方案門檻、
  階段 4 三段順序、階段 5 四項不變量）。final-v3 不得只以 §5.2 為據。
- 第八輪漏抓的第七條 seventh-pass 錯誤：`Object.freeze` 唯一性是**檔內**口徑
  （`src/` 全庫實有 28 處），與 `session-presentation-boundary.test.js:153-157` 的
  單檔斷言範圍一致；「'38' 零出現」字面亦假（third-pass:8 等處有 38，意義是 FAIL 筆數）。

---

## 3. 技術事實層的收斂確認

至此，八輪往返的全部技術爭點已無分歧。可寫進 final-v3 當「已證實」的核心清單：

- Push 缺陷鏈全部環節（含 A→B takeover 的 rollback 實驗證明、cascade 的條件式性質、
  直接阻擋 FK 5+1 與間接路徑 1）
- W3C 規格四條（unsubscribe boolean、window-accessible scope、permission≠帳號 opt-in、
  p256dh 非持有證明）
- bundle 全部數字（八個 byte 上限餘裕、12 個非 byte assert、Sentry 分類弱點、CSS 無 gate）
- 方案 E 探針量級與官方 standalone 用法；方案 B≠E；方案 D 的前置與 max() 矛盾
- mutation AST 17/89（舊 scope，正式帳本需重定義 API 集合）、browser port 十項清單
- `sessionViews` 的 export 分類、六個 top-level 副作用、86 個測試呼叫行
- state 27 欄與五種 reconcile 行為契約、blockedPlayers 的 3 caller 與 5 欄 setState 拆分
- aria-live 五列實名表、四條專案文件過時處、規則檔 paths 機制洞

## 4. 剩餘未決項（全部非技術）

| 類別 | 項目 |
| --- | --- |
| 產品決策 | Push 同意模型（帳號＋裝置 vs origin permission）；登出是否必停推播；換帳號是否要求重新 opt-in；**是否接受不 migration 的無界外洩窗口（§2.2）**；orphan TTL；ds-bundle 去留；bundle 預算是否重編 |
| 待實作/實測 | 方案 E PoC；preview Playwright project；乾淨機器驗證；OAuth 雙帳號 matrix；正式 mutation 帳本（API 集合重定義）；FK 全盤點的完成 |
| 授權 | 所有 runtime／migration／rules 變更需逐項核可（各輪一致同意） |

## 5. final-v3 的輸入索引（防內容流失）

1. 順序骨架：第八輪 §5.2 十二步（含階段 -2 改名、6A/6B 拆批）
2. 驗收內容：第七輪 §4 清單 + Codex 驗證報告 §5 採納的 20 條 + sixth-pass §4 四條
   + Codex §7 各步驗收項（第八輪 §5.2 流失的十二項自此還原）
3. Push 設計：第八輪 §2.1 六步順序（含 unsubscribe boolean 正確處理）+ §2.2 狀態機
   + 本文 §2.2 的產品決策句 + §2.3 措辭 + 驗收矩陣（第八輪 §3 的分級版，
   補「既有/新建」欄與間接 FK 路徑）
4. 行為契約：本文 §2.4 五種
5. 事實層：本文 §3 清單
6. 措辭修正：本文 §2.5／§2.6

## 6. 證據狀態

- 主對話親驗 9 條：6 欄、grant 行號、`applyAuthCandidate` 存在（全庫 grep）、
  `applyAuthState`、47 條、third-pass:372-374、AST 17/89 重跑、profile helper 35/6 重跑、
  token refresh 分支（`authController.ts:179-180`）
- 委派查證：W3C 原文逐字五段、takeover SQL 邏輯推導、五個 reconcile call expressions、
  FK 直接 5+1 與間接 1、dispatcher 無狀態過濾、第八輪十條修正表逐條比對
- 未執行：DB rollback 重跑（授權邊界）、local browser matrix、乾淨機器
