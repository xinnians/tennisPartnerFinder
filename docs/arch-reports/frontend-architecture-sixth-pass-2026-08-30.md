# Codex 第五輪的複核（第六輪）

日期：2026-08-30
對象：`docs/arch-reports/frontend-architecture-fifth-pass-2026-08-30.md`（Codex 產出，以下稱「第五輪」）
基準：HEAD `a14e81e`。`dist/` 由 Codex 於 8/30 18:02 重建，主 chunk hash `index-BWygPPVv`
（638,937 bytes）與 8/29 的完全相同——兩個獨立環境在不同日期 build 出 byte-identical 產物。

方法：任何 `docs/` 內容都是待驗宣稱。主對話親自複驗六項快驗，3 名 opus agent
複現大項與對立審查，每筆附 `verifyCommand`。

---

## 0. 一句話結論

**第五輪的數字品質是本系列最高的一份**——可量化宣稱五項全 PASS，其中四項逐位吻合（0% 偏差）。
四個對第四輪的修正**方向全部正確**。但它自己有 **14 條缺陷**，其中一條是語意反轉
（§5.1 的 `authController` 描述與磁碟相反），照抄會把 facade 派工單寫錯。

第五輪 §13 的六步順序可以採用，但第 1 步的授權範圍要擴大（見 §4.3）。

---

## 1. 已確認成立的部分

### 1.1 可量化宣稱（範圍 A，五項全 PASS）

| 宣稱 | 判定 |
| --- | --- |
| §7.2 mutation 帳本「17 檔、90 個候選點」 | **逐位吻合**——用 grep union（textContent/hidden/disabled/className 賦值 + classList/setAttribute/append 族 + innerHTML/dangerouslySetInnerHTML）得 17 檔／90 點完全相等。檔案分佈前五：sessionSurfaceViews 19、sessionFormViews 12、sessionViews 12、sessionActions 9、appErrors 8 |
| §7.1 Gate A 實名清單 | 五類位置逐一開檔確認：`sessionViews.js:220/:224`、`sheets.ts:137`、`SurfaceHost.tsx:209`、非空 `html:` 恰兩處（`sessionViews.js:499` 與 `sessionSurfaceViews.js:286`）——與第四輪一致 |
| §4.4 esbuild 探針 | 六個數字**逐位相同**（esbuild 0.25.12、三套件皆 2.110.0）：209,906/54,785/46,174 vs 113,352/27,929/23,962 |
| §12 `test:session-unit` | 實跑 **349 passed／0 failed**，逐位相同 |
| §4 bundle 表格 | 七列 28 個 byte 數字全部由 fresh build 重現，含前輪未列的 SessionDetailSheet raw 餘 1,951、CreateSessionSheet raw 餘 2,775 |

### 1.2 新事實（第五輪的貢獻，主對話親自複驗）

- **auth-js 官方支援 standalone 用法**：安裝套件 JSDoc 即有
  「Standalone import for bundle-sensitive environments」（`GoTrueClient.js:76`）。
  方案 E 的「官方支援」從 `[不確定]` 升為**已證實**。
- **`testing.md:49` 過時**：說 lint/prettier「只掃 .ts/.tsx」，`package.json:30-31` 實掃
  `src/**/*.{js,ts,tsx}` 加 tests/scripts 的 js/mjs。專案文件過時清單增為四條。
- **guarded reset 非 `test:local` 技術必要**：`localSupabaseConfig.js` 只檢查
  `supabase status` 成功。修正了第四輪的過強說法（缺 `supabase start` 才會丟錯）。
- **`requestGate.ts:46` 也有 `globalThis.document`**（第五輪寫 :43，差三行）——
  browser port 規則的掃描範圍問題成立。
- CSS 65,865 raw／10,857 gzip 吻合；無 byte gate 的觀察成立。

### 1.3 四個對第四輪的修正——方向全對

1. **§3.2「永久損壞」降為「持續性阻斷、無產品內恢復路徑」**：正確，且抓到第四輪的內部矛盾
   （自己列了「404/410 會刪列」卻寫「永不失效」）。「P0」是優先級判斷非可證事實，同理。
2. **§4.2 Sentry 弱點受 total gate 限制**：正確收窄，agent 以 A/B canary 實證 total gate 承重。
3. **§4.3 「max() 必放寬四常數」依賴歷史基準**：反駁成立——改用當前 build 基準，
   main 兩個常數會**收緊** 13,541/3,079，只有 lazy 兩個放寬。
4. **§11 拒收第四輪的 agent 統計**：定性正確（工作流程統計非 repo 事實）。

---

## 2. 第五輪的 14 條缺陷

### 2.1 語意反轉（最嚴重，照抄會派錯工）

**§5.1 寫「`authController.ts:149-155` 中 blockedPlayers 與 mySessions 狀態拆開寫入」
列為 facade「必須保留」項——磁碟上該處是單一筆 setState 同時寫六欄，沒有「拆開」可保留。**
第四輪 §7 第 11 條的原意相反：要求 facade **把這筆拆成兩筆**。行號對，語意反了。

### 2.2 清單不完整（browser port）

第五輪提議的 browser port 規則清單漏三筆 `[委派查證]`：

- `src/pins.ts:135` 的 `documentRoot: Pick<Document, "createElement"> = globalThis.document`
  （第 4 個 `globalThis.document` default，也是第 4 個 Document 型別引用——第五輪說三個）
- `src/appErrors.ts:127` 的 `showGlobalErrorNotice(documentRoot: Document)`
- **`src/controller/intentController.ts:492` 的 `globalThis.navigator?.geolocation`**——
  Gate B 掃描範圍內唯一**未注入**的 browser global 直接讀取，比 Document default 更接近
  「controller 直接碰 browser」，完全沒被列入

### 2.3 定性強度錯置（兩條，方向相反）

- **§4.2 低估**：寫「不易被發現」，實測是 total 餘裕內**完全不會被發現**——
  帶 `sentry_version` 的 app lazy chunk 可超出 5,500 gzip 上限 815 B 而 gate 全綠。
  且窗口大小是「當下 total 餘裕」而非固定值。
- **§3.2 恢復機制描述不完整**：恢復不必經 dispatcher 刪列——瀏覽器換發新 endpoint
  （清 site data、撤銷後再授予權限）後 `getSubscription()` 回 null → `subscribe()` 產生
  無主 endpoint → ownership 檢查不會擋。阻斷的真正條件是「瀏覽器持續回傳同一 endpoint」。

### 2.4 過度修正（丟掉第四輪的有效發現）

§4.3 只保留「四個數字依賴歷史基準」，**刪掉了「max() 與方案 D 第 5 條『禁止預留未使用空間』
自相矛盾」這條結構性發現**——該矛盾與基準選擇無關（新上限恆為 baseline + max(4 KiB, 1%)，
永遠預留 ≥4 KiB raw）。第五輪全文零次提及「預留未使用空間」。

### 2.5 其他

- `requestGate.ts` 行號 :43 → 實際 **:46**（第四輪 §8.3 點名的「手抄未附指令的枚舉」同型複發）
- §7.2 的 AST 掃描**無可重跑指令**，違反第五輪自己 §0 的證據規則
  （本輪已用 grep union 補上可重跑版本，見 §1.1）
- §2.1「混成同一條規則」是措辭放大——第四輪 §1.1 已指出同一缺陷並給了同一修法
- §2.2 null 短路成立但未寫代價：null 是 **fail-open**（該 history entry 從此不做 owner 比對），
  是可接受的降級而非等價替換
- §11「不應拿來決定技術方案」過度擴張——第四輪從未用 agent 統計推導技術方案，
  該節是流程品質警訊，其方法論結論（手數未附指令的枚舉最易失準）獨立成立

---

## 3. 覆蓋率比對（範圍 C 的關鍵發現）

第四輪 §7 實為 **17 條**（編號跳過 15）。**全部 17 條都被第五輪覆核或吸收，
沒有任何一條被靜默略過**——包括 identity 修法、驗收口徑、§18/§19 授權對齊、
blockedPlayers、unreadMessageCount、外洩範圍。

但 **§13 第 1 步「先把本文件列出的事實修正回 final candidate」的授權範圍只涵蓋第五輪自身**，
三條只存在於第四輪 §7 的細節會掉出派工：

1. §8.1 重排時要涵蓋**全部** byte 上限（最緊六個依序）
2. §3.2 `session_reminder` 的人身時間地點
3. §18/§19 的**五個階段**（0/1/2/4/5）授權口徑

---

## 4. 修正版 final candidate 的產生條件

採用第五輪 §13 的六步順序，加四條修正：

1. **第 1 步的輸入 = 第五輪事實修正 + 第四輪 §7 的 17 條 + 本文 §2 的 14 條**，
   不是只有第五輪自身。
2. **§5.1 的 authController 描述改回第四輪原意**：facade 動工時要把
   `authController.ts:149-155` 那筆 setState 拆成兩筆（blockedPlayers 三欄與
   mySessions 兩欄分開），不是「保留拆開現況」。
3. **browser port 規則的完整清單**（本輪實測）：`globalThis.document` default ×4
   （`discoveryMapController.ts:105`、`sessionController.ts:170`、`requestGate.ts:46`、
   `pins.ts:135`）、Document 型別引用 ×4（前三者的宣告 + `chatController.ts:57` +
   `appErrors.ts:127`）、加 `intentController.ts:492` 的 geolocation 直讀。
4. **第 3 步拆批**：六條 gate 同批過重，且與第五輪自己 §7.1/§7.2 的分析矛盾
   （mutation manifest 需要 90 點逐點標 owner，與純掃描 gate 不是同一工作量級）。
   建議：Gate A + Gate B + syncCommit canary 一批（純掃描），
   mutation manifest + aria-live contract 一批（需人工判定 owner），CSS order gate 隨任一批。

---

## 5. 證據狀態

- 主對話親自複驗：§1.2 全部五項、dist hash 交叉比對、`localSupabaseConfig` 行為。
- 委派查證（附 verifyCommand）：§1.1 五項複現、§2 的 14 條、§3 的覆蓋率比對、
  §4.2 的 Sentry canary 實證。
- 本文未回答的：第五輪 §13 第 2 步的 Web Push 設計與測試矩陣（需先拍板 §3.4 的威脅模型）、
  方案 E PoC（授權邊界內只可設計）。

## 附錄：本輪新增的可重跑指令

```bash
# mutation 帳本 90 點（第五輪未附指令，本輪補）
grep -rEn '\.(textContent|hidden|disabled|className)\s*=[^=]' src/ --include='*.js' --include='*.ts' --include='*.tsx' > /tmp/mutA.txt
grep -rEn 'classList\.|setAttribute\(|removeAttribute\(|\.append\(|appendChild|removeChild|replaceChildren' src/ --include='*.js' --include='*.ts' --include='*.tsx' > /tmp/mutB.txt
grep -rEn 'innerHTML\s*=[^=]|dangerouslySetInnerHTML' src/ --include='*.js' --include='*.ts' --include='*.tsx' | grep -vE ':[0-9]+: *//' > /tmp/mutC.txt
cat /tmp/mut{A,B,C}.txt | sort -u | wc -l          # → 90
cat /tmp/mut{A,B,C}.txt | sort -u | cut -d: -f1 | sort -u | wc -l   # → 17

# browser port 完整清單
grep -rn "globalThis.document\|globalThis.navigator" src/ --include='*.ts' --include='*.js' --include='*.tsx'
grep -rnE ": (Pick<)?Document" src/ --include='*.ts' --include='*.tsx'

# requestGate 行號
grep -n "globalThis.document" src/requestGate.ts    # → 46

# testing.md:49 vs 實際
sed -n '49p' .claude/rules/testing.md
grep -nE '"lint"|"prettier:check"' package.json

# auth-js standalone 標語
grep -rn "Standalone import" node_modules/@supabase/auth-js/dist/module/GoTrueClient.js
```
