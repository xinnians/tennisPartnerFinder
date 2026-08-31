# 前端架構第七輪複核：第八輪驗證

日期：2026-08-30

驗證對象：`docs/arch-reports/frontend-architecture-seventh-pass-2026-08-30.md`

對象 SHA-256：`70aa8808cb2ef9a762ad892ffe1eee52a0da8e0e272561f1ce7974199ec17d43`

程式基準：HEAD `a14e81ecf88fbdd87f7b7f77fe0ffcf4d22b6343`

本輪只新增這份文件，沒有修改前端、測試、migration、rules 或 bundle limits。

## 0. 總結論

第七輪的主結論仍成立：`frontend-architecture-final-v2-2026-08-30.md` 不應原樣派工。

第七輪也正確補到三件重要事項：

1. 先刪 server row、但同一 browser subscription 仍存在時，B 手動開啟推播確實能接管同一 endpoint。
2. `authController.ts` 的 reconciliation 路徑不可漏掉。
3. 6A 與 6B 應保持分批，unread command 必須先於或同批於 6A。

但第七輪本身仍有可直接證明的錯誤或過度結論，因此也不能原樣當 final-v3：

- `push_subscriptions` 是 **6 欄**，不是 7 欄。
- RPC grant 在 migration **803–804** 行；800 行是 revoke。
- `unsubscribe()` resolve `false` 代表被呼叫的舊 subscription 早已停用，不代表失敗。
- durable tombstone／quarantine 需要 migration；一般「處理舊 subscription、重讀確認舊 endpoint 已非 current，再刪舊 row」流程不一定需要。
- 同 chunk 名、同 raw/gzip 大小是強證據，但不是 byte-identical 證明。
- 「§5 有 26 條」範圍寫錯：§5.1 有 15 條、§5.2 有 26 條、§5.3 有 6 條，§5 合計 47 條。

## 1. 證據規則

本輪只把下列資料當事實來源：

- HEAD `a14e81e` 的原始碼、migration、測試與 Git 歷史
- 本輪實際執行的 Node、Vite、Postgres rollback transaction 與測試結果
- 本機已安裝的 Vite／Rollup／TypeScript 程式碼
- [W3C Push API](https://www.w3.org/TR/push-api/#dom-pushsubscription-unsubscribe)

前幾輪 Markdown 只算待查主張。Claude memory 只能證明「該檔案存在且寫了什麼」，不能單獨證明事件真的發生。

## 2. 對第七輪八個爭點的逐項答覆

### 2.1 爭點 1：先刪 row 後，B 能否接管同 endpoint？

**同意第七輪的核心判斷。**

直接證據：

- `src/notificationPush.js:29-36` 會先取 `getSubscription()`，有現存訂閱就直接重用。
- `supabase/migrations/202607230001_notifications_web_push.sql:162-170` 只在 endpoint row 已存在且 owner 不同時擋下。
- 同檔 `:172-178` 在 row 不存在時可直接 insert。
- 本輪 rollback transaction 實際得到：`a_save=OK`、`a_remove=OK`、`b_save=OK`，最後 owner 是 B。

rollback 證明的是 row 刪除後 DB/RPC 會接受 B；前端原始碼證明 B **手動走現行開啟推播路徑時**會重用仍存在的 browser subscription。兩段合起來才證明 takeover；目前沒有自動呼叫 `enableBrowserPush()` 的路徑。

所以原先驗收列「server delete 成功、browser subscription 仍存在，但 B 不會接管」在現行 schema／RPC 下達不到。

一般登出的最小安全順序應寫清楚：

1. A 還有有效 session 時捕捉目前 `PushSubscription` 與舊 endpoint。
2. 呼叫舊 subscription 的 `unsubscribe()`。
3. resolve `false` 只代表捕捉到的舊 subscription 已停用；resolve `true` 代表平行 deactivation 已啟動，user agent 不得再投遞該舊 subscription，但不代表 push service 工作已全部完成。
4. 再讀 `registration.pushManager.getSubscription()`；只有確認目前 subscription 已是 `null` 或 endpoint 已不同，才刪捕捉到的舊 row。若出現新 endpoint，要另走 refresh reconciliation，不能直接掛給 B。
5. 實作例外、應用層 timeout、重讀仍是舊 endpoint 或其他 unknown 狀態時，不可先刪 row；保留 A row 可擋同 endpoint 接管，但不能保證 A 已停止收通知。
6. cleanup 成敗都不得阻止 `signOut()`。

W3C 的精確語意是：resolve `false` 表示該 subscription 已經 deactivated；resolve `true` 表示本次平行 deactivation 已啟動，之後 user agent 不得再投遞該舊 subscription 的 push。規格沒有把 reject 或 timeout 列成正常結果；上面的例外／timeout 是應用層防禦狀態。也不能用單純的 truthy 判斷把 `false` 當失敗。

### 2.2 爭點 2：tombstone／quarantine 是否一定要 migration？

**條件式同意，不接受「必然」二字。**

現況可直接證明：`push_subscriptions` 只有 `id`、`profile_id`、`endpoint`、`p256dh`、`auth`、`created_at` 六欄；`endpoint` unique、`profile_id` not null，後續 migration 沒有再 alter 這張表。

- 若只做正常路徑「unsubscribe 已 resolve，且重讀確認舊 endpoint 已不再是 current subscription → 刪舊 row」，不一定要 migration。
- 若要做 durable server quarantine，既保留 endpoint uniqueness、又禁止 dispatcher 繼續送 A，**就需要 migration**，因為現況沒有狀態欄。

較完整的設計方向是：

```text
active
  → revoking（保留 unique endpoint；dispatcher 不送）
  → unsubscribe resolve true/false
  → 重讀 current subscription，確認不是舊 endpoint
  → delete row

實作例外 / 應用層 timeout / unknown
  → 保留 revoking，等待明確的重試與清理規則
```

status 欄本身還不夠。現行 authenticated table grant 只有 SELECT／INSERT／DELETE，沒有 UPDATE（migration `:67-77`、`:87-91`）；應新增 owner-scoped RPC，不建議直接開 raw UPDATE，並同批修改 dispatcher 的 active filter、generated types 與 DB tests。cleanup／TTL 也要有明確 owner；若由 server 執行，再使用 service role。

此設計仍有三個尚未決定的產品問題：登出後由誰重試、revoking 保存多久、B 如何在不使用 A 身分的前提下重新明確 opt-in。未決定前不能寫成已完成方案。

### 2.3 爭點 3：第七輪退回的六項

| 項目 | 本輪裁決 | 精確理由 |
| --- | --- | --- |
| §5.2-5 Gate B 非空 assertion | **降級為文字澄清** | final-v2 已寫「掃描集合非空」，但可能被實作者理解成 violation hits 非空。應明寫「被掃描的 source／AST input 非空，違規結果可為 0」；不是新的架構錯誤。 |
| §5.2-6 + §5.2-25 browser port | **合併，保留修正** | final-v2 已承認 4+4+1 不完整，也列過 share/player；不應拆成兩個重大缺陷。但 `src/appErrors.ts:129` 的 global `HTMLElement` 和 `src/notificationPush.js:17-18` 的 browser globals 仍證明 inventory 未完成。 |
| §5.2-15 Chat 5/86／「最輕」 | **不接受退回** | final-v2 雖標 5/86 未複驗，卻仍用它支持「七維度比較中最輕」。正文實際列出六個量化欄位，且沒有同表比較其他候選；只能寫「初始候選，動工前重建比較表」。 |
| §5.2-17 CSS 38 | **核心保留，支撐句改寫** | 前六輪沒有把「CSS 跨檔 selector 數」明列為 38 並附可重跑定義；但 third-pass `:372-374`、`:605` 確實記錄同類計數無法重現並已移除。正確寫法是「同類計數曾無法重現」，不是「先前已證明 38 無法重現」。 |
| §5.2-11 bundle 累積 | **降級為條件澄清** | 固定現行 total gzip gate 時，累積最多只剩 1,435 B；只有方案 D 每次核准後重新基準化，跨多批成長才沒有固定總上限。final-v2 已把句子放在方案 D，不能再列成獨立 factual error。 |
| §4 的 12 個 assert | **降級為口徑補強** | final-v2 已列靜態行號；但最精確說法仍是「12 個非 byte 靜態 call sites，其中 demo call site 在 loop 執行 12 次」。不是阻擋派工的錯誤。 |

### 2.4 爭點 4：auth reconciliation 是否漏掉？

**同意需要補上 auth 路徑，但「第四個 caller」不精確。** 第七輪 `:89` 寫的 `applyAuthCandidate` 不存在；實際函式是 `applyAuthState`（`src/controller/authController.ts:98`）。

目前是三條有直接呼叫的流程、共五個 call expressions，外加一條刻意不呼叫的 quiet 行為：

| 行為 | 實際動作 | 證據 |
| --- | --- | --- |
| 一般 discovery load | 只 reconcile detail | `src/controller/discoveryMapController.ts:143-149` |
| quiet discovery refresh | 不 reconcile；surface 已開啟時不會啟動新 poll，但已在途的 request 不會因後來開啟 surface 而失效，晚到結果仍可落 state | `src/controller/discoveryMapController.ts:162-192`、`:302-309`；`src/requestGate.ts:51-60` |
| mySessions roster reload | roster hydration 後 reconcile detail + chat | `src/controller/mySessionsController.ts:319-329` |
| auth/profile state apply | state 寫入後立即 reconcile detail + chat，再做 async participation reload | `src/controller/authController.ts:144-161` |

因此 final-v3 應寫成「四種行為契約」，不是把 auth 稱為單純的第四 caller，也不能只保留原先三分法。quiet request「先發出 → 開 surface → response 晚到」的 race 也要成為明確測試。

### 2.5 爭點 5：`ds-bundle` 的 8/17 決策

**接受「repo 外有一筆本機記錄」；不接受把記錄內容升級成已證實事件。**

可直接證明的資料：

- `.design-sync/NOTES.md:8` 的 8/11 repo 記錄仍寫「要版本化由 user 決定」。
- root `ds-bundle/` 現有 13 個 tracked files。
- commit `260ef16` 在 8/21 新增 5 檔，`dd13c51` 再新增 8 檔；Git 沒有 `ds-bundle/` 的刪除紀錄。
- 本機檔 `/Users/ian/.claude/projects/-Users-ian-tennisPartnerFinder/memory/redesign-2026-08-07-pipeline.md` 存在；SHA-256 是 `6dcb778119bfe3c8588edd6bcc0e02a15b36df8de4ce94210b9af3e221cdf806`，mtime/birthtime 是 `2026-08-17 10:04:54 +0800`，第 19 行記載「已拍板不保留」。

final-v3 應使用這段：

> Repo 內沒有 8/17 決策證據；本機 Claude memory 目前的 frontmatter、mtime、birthtime 都標示 8/17，第 19 行記載「不保留」。8/21 又有 13 檔加入 Git。這些 metadata 與內容可證明目前記錄的樣子，不能單獨證明當時決策或目前意圖；由維護者確認現行政策。

「同批其他未追蹤檔也沒有 Git 刪除痕跡」只與 memory 相容，不是獨立佐證。

### 2.6 爭點 6：6A／6B 是否要還原？

**同意還原。**

原 Codex 骨架仍寫了「先 unread，再搬 server state 與 route」，所以不是完全丟掉先後順序；真正遺失的是 6A／6B 的明確派工邊界。

final-v3 應固定為：

- unread command：先於或同批於 6A
- 6A：chat feed/server-state ownership，不改 route
- 6B：Messages route ownership、back/forward、focus 與舊 bridge 退役

文件對齊階段另改名為「階段 -2」，避免和 0a／0b 撞名。

### 2.7 爭點 7：同 hash 能否保留為 byte-identical 證明？

**不同意。只能保留為強證據，不能寫成已證明 byte-identical。**

本機安裝版本是 Vite `6.4.3`、Rollup `4.62.2`：

- Vite 預設檔名是 `[name]-[hash]`：`node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:46291-46300`。
- Rollup 確實用內容產生 hash：`node_modules/rollup/dist/es/shared/node-entry.js:20915-20932`。
- 但預設 hash 長度只有 8：同檔 `:18481-18483`、`:18917-18921`；最後也會切到 placeholder 長度：`:20964-20975`。

因此，相同 8 字元 hash 不是數學上的內容相等保證；相同 raw/gzip 大小也不能消除 collision。repo 目前只有歷史報告中的相同檔名與大小，沒有保存 8/27、8/28 的完整 artifact SHA 或 `cmp` 結果。

可保留的精確句子是：

> 多份 tracked 報告記錄相同主 chunk 名 `index-BWygPPVv.js` 與相同 raw/gzip 數字，屬高度一致的歷史紀錄；因沒有歷史 artifact 全檔雜湊或逐 byte 比對，不能宣稱 byte-identical 已證實。

本輪另外證實的是「現在」：in-memory Vite build 的 24 個 emitted outputs 與現在的 `dist/` 逐 byte 相同。這不能回推歷史兩次 build。

### 2.8 爭點 8：CSS 38 的舊紀錄在哪裡？

不保留原句「先前報告也記錄過該數字無法重現」，因為沒有文件把 CSS 跨檔 selector 數明列為 38、附定義後再判為無法重現。

但也不能寫成「前六輪完全查無同類紀錄」：

- `frontend-architecture-third-pass-2026-08-29.md:372-374`
- 同檔 `:605`

兩處都記錄過「跨檔複合 selector／跨檔 selector 的計數，以多種口徑無法重現，已移除」。所以應改成「同類計數先前已被判定不可重現；38 本身沒有可重跑定義」。核心處方仍是刪掉 38。

## 3. Web Push 驗收矩陣：現況分級

第七輪說至少三格今天已成立，範圍過大。精確狀態如下：

| 情境 | 現況證據 | 裁決 |
| --- | --- | --- |
| A 開啟後正常登出 | UI 沒有 push remove caller，也沒有 `PushSubscription.unsubscribe()` 流程 | 未建立 |
| server delete 成功、browser subscription 仍存在 | rollback 證明 DB/RPC 接受 B，前端原始碼證明手動 enable 會重用 subscription | 現況不符合目標 |
| server delete 失敗、unsubscribe 成功 | dispatcher 有 404/410 路徑，但沒有 logout flow／TTL | 未完整建立 |
| 兩個 cleanup 都失敗 | 沒有 warning、retry owner、時點契約 | 未建立 |
| A→B identity change | 沒有 push cleanup／opt-in reconciliation | 未建立 |
| subscription refresh | Service Worker 沒有 `pushsubscriptionchange` handler | 未建立 |
| permission 撤銷再授予 | 沒有完整恢復流程 | 未建立 |
| VAPID key 輪替 | 沒有 key-version 比對與重建流程 | 未建立 |
| 同帳號兩台裝置 | schema 可放兩個 endpoint；rollback 證實移除其中一個後另一個保留 | **DB/RPC 契約已成立；logout E2E 未建立** |
| dispatcher 404/410 | `supabase/functions/notification-outbox-dispatch/dispatch.js:35-40` 會分類為 remove；同目錄 `index.ts:141-143` 只按 endpoint delete，但沒有 edge integration test，且 delete error 未檢查 | **靜態／unit 部分成立** |
| 刪除 `auth.users` | 只有 push rows 的新帳號 fixture 可成功刪除，subscription 歸 0；其他 profile FK 可能先擋下整筆刪除 | **條件式 DB 契約；不是任意真實帳號已驗證** |

cascade 鏈本身存在：`profiles.user_id` 是 `ON DELETE CASCADE`（`202607020001_initial_mvp_schema.sql:5-8`），`push_subscriptions.profile_id` 也是 cascade（`202607230001_notifications_web_push.sql:9-16`）。但 repo 另有會阻擋 profile delete 的 FK，例如 `private.legacy_*` 與 `public.reports` 的 `ON DELETE RESTRICT`（`202607170003_public_taipei_tennis_sessions.sql:21-35`、`:92-100`），以及 `session_messages.sender_profile_id` 的預設 NO ACTION（`202607270003_session_chat.sql:3-9`）。所以本輪 rollback 只能證明「沒有其他阻擋 FK 資料時」的 cascade，不證明任意正式帳號都能成功刪除。

本輪 focused Node tests：

```text
node --test tests/notification-data-api.test.js tests/notification-dispatch.test.js tests/notification-push.test.js
→ 13 passed、0 failed
```

這 13 個測試沒有涵蓋 logout、A→B、refresh、permission recovery 或 VAPID rotation，不能拿綠燈代替上表缺口。

## 4. 第七輪還要修正的事實

| 第七輪位置 | 問題 | 正確內容 |
| --- | --- | --- |
| `:13` | 「Codex 全部數字、零錯誤」缺完整公開 scope | 本輪找到的欄數、grant、hash 與 unsubscribe 問題是第七輪自己新增的內容，不能拿來直接反駁它對 Codex 報告的抽驗。正確處理是列出完整抽樣清單與重跑輸出，否則把 blanket verdict 收斂為「本輪抽查範圍內未見錯誤」。 |
| `:14`、`:59` | 把 §5 稱為 26 條 | 只有 §5.2 是 26 條；§5 全節共 47 條。若只統計 §5.2，要明寫 scope。 |
| `:32` | `push_subscriptions` 7 欄 | migration `:9-16` 明列 6 欄，後續無 alter。 |
| `:34` | grant 引用 `:800/:804` | `:803/:804` 才是 save/remove grant；`:799/:800` 是 revoke。 |
| `:41-42` | 「unsubscribe 成功」未定義 boolean | `false` 是 captured old subscription 已停用；`true` 是平行 deactivation 已啟動。兩者之後仍要重讀 current subscription，不可只看 boolean 就刪 row。實作例外／應用層 timeout 視為 unknown。 |
| `:43-45` | tombstone 必然要 migration | durable quarantine 才必須 migration；正常 resolved cleanup 不一定。 |
| `:46-48` | 三個矩陣格都算今天已成立 | 同裝置只證明 DB/RPC、404/410 只有 static/unit；auth cascade 也只在沒有其他阻擋 FK 的新帳號 fixture 成立。 |
| `:86-88` | Vite 命名保證同 hash 即同內容 | hash 是 8 字元截斷值；沒有歷史 artifact SHA/cmp，不能保證。 |
| `:89-90` | 函式名與 caller 口徑都錯 | `applyAuthCandidate` 不存在，實際是 `applyAuthState`；精確口徑是三條 direct flows／五個 call expressions，加一條 quiet no-call 行為。 |
| `:103-110` | memory 與其他未追蹤刪除互相佐證 | 只能證明 memory 記錄存在；是否決策發生、8/21 是否翻案，都要維護者確認。 |

## 5. final-v3 可直接採用的架構方向

### 5.1 框架

目前沒有直接證據支持整套換掉 Vite + React。已確認的缺口集中在 ownership、browser platform 邊界、Push lifecycle 與 bundle gate；這些缺口都不需要先換成 SSR framework 才能修。

建議保留 Vite + React，以 feature 為單位逐批收斂：

```text
src/app/        composition、route/surface orchestration
src/features/   UI、commands、selectors
src/platform/   Push、Service Worker、Maps、Geolocation、OAuth、Sentry adapters
src/data/       repositories、mappers、Supabase boundary
src/shared/     無業務狀態的 UI、types、utilities
```

這是目標邊界，不是一次搬家的授權。每搬一個 feature，同批刪除舊 bridge，避免雙架構並存。

### 5.2 建議派工順序

1. 階段 -2：文件與 rules 對齊，只修已證明的矛盾。
2. 階段 -1：Push 產品規則、威脅模型、是否採 durable quarantine／migration。
3. 階段 0a：純 gate。
4. 階段 0b：重建完整 mutation/browser-port manifest；17/89 只能當舊 scope 輸入。
5. 階段 1：可證明 dead／低風險清理；`ds-bundle` 等維護者決策。
6. 階段 2：production preview 與效能基線。
7. 階段 3：Bundle ADR；固定 gate 與重新基準化要分開治理。
8. 階段 4：manifest 與 wiring 搬移。
9. 階段 5：blockedPlayers facade PoC。
10. unread command：先於或同批於 6A。
11. 階段 6A：Chat feed/server-state ownership，不改 route。
12. 階段 6B：Messages route ownership 與舊 bridge 退役。

以上都是建議順序，不代表已授權 runtime、migration、rules 或 byte-limit 變更。

## 6. 本輪補齊的可重跑指令

### 6.1 舊 mutation API scope：17 檔／89 AST nodes

這只重現舊 API scope，仍漏 `value` 與 `inert`，不能升級成正式完整基線。

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const extensions = new Set(['.js', '.ts', '.tsx']);
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (extensions.has(path.extname(entry.name))) files.push(target);
  }
}
walk('src');
const assigned = new Set(['textContent', 'hidden', 'disabled', 'className', 'innerHTML']);
const called = new Set(['setAttribute', 'removeAttribute', 'append', 'appendChild', 'removeChild', 'replaceChildren']);
let nodes = 0;
const touched = new Set();
for (const file of files) {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, kind);
  function visit(node) {
    let hit = false;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left) && assigned.has(node.left.name.text)) hit = true;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (called.has(node.expression.name.text)) hit = true;
      if (ts.isPropertyAccessExpression(node.expression.expression) && node.expression.expression.name.text === 'classList') hit = true;
    }
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'dangerouslySetInnerHTML') hit = true;
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'dangerouslySetInnerHTML') hit = true;
    if (hit) { nodes += 1; touched.add(file); }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
console.log(JSON.stringify({ typescript: ts.version, files: touched.size, nodes }));
NODE
# {"typescript":"6.0.3","files":17,"nodes":89}
```

### 6.2 Profile helper：35 個靜態 call-site 行／6 檔

35 是排除 `src/features/profile-auth/profileAuthFeature.ts` 定義檔後的文字層 call-site 行數，不等於 35 個獨立授權規則。

```bash
rg -n '\b(profileMeetsGate|profileIsReady|profileIsPublic|profileReadiness)\s*\(' \
  src --glob '*.{js,ts,tsx}' \
  | rg -v '^src/features/profile-auth/profileAuthFeature\.ts:' \
  | wc -l
# 35

rg -n '\b(profileMeetsGate|profileIsReady|profileIsPublic|profileReadiness)\s*\(' \
  src --glob '*.{js,ts,tsx}' \
  | rg -v '^src/features/profile-auth/profileAuthFeature\.ts:' \
  | cut -d: -f1 | sort -u | wc -l
# 6
```

### 6.3 Vite in-memory outputs：24 個，全部對上目前 dist

此命令只會比對「執行當下的 source」與「執行前已存在的 `dist/`」。若要從 fresh HEAD 重現，先執行 `npm run build`；該指令會改寫 `dist/`，不屬於唯讀操作。

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
const result = await build({ mode: 'production', logLevel: 'error', build: { write: false } });
const builds = Array.isArray(result) ? result : [result];
const outputs = builds.flatMap((entry) => entry.output ?? []);
const failures = [];
for (const output of outputs) {
  const generated = output.type === 'chunk'
    ? Buffer.from(output.code)
    : Buffer.isBuffer(output.source) ? output.source : Buffer.from(output.source);
  const target = path.join('dist', output.fileName);
  if (!fs.existsSync(target) || !generated.equals(fs.readFileSync(target))) failures.push(output.fileName);
}
const distFiles = fs.readdirSync('dist', { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile()).length;
console.log(JSON.stringify({
  outputs: outputs.length,
  chunks: outputs.filter((entry) => entry.type === 'chunk').length,
  assets: outputs.filter((entry) => entry.type === 'asset').length,
  distFiles,
  failures,
}));
NODE
# {"outputs":24,"chunks":22,"assets":2,"distFiles":32,"failures":[]}
```

本輪另用 `cmp` 逐檔確認：`public/` 的 8 檔都與 `dist/` 對應檔相同；它們不是這 24 個 Rollup emitted outputs。

### 6.4 Push takeover rollback transaction

本輪在 local container `supabase_db_tennisPartnerFinder` 執行，交易最後 rollback，沒有留下資料：

```sql
begin;
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'push-sequence-a@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'push-sequence-b@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000a1',true);
select public.save_push_subscription('https://push.example/seventh-sequence','a-key','a-auth');
select public.remove_push_subscription('https://push.example/seventh-sequence');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000b1',true);
select public.save_push_subscription('https://push.example/seventh-sequence','same-browser-key','same-browser-auth');
reset role;
select u.email
from public.push_subscriptions s
join public.profiles p on p.id = s.profile_id
join auth.users u on u.id = p.user_id
where s.endpoint = 'https://push.example/seventh-sequence';
rollback;
```

執行方式：

```bash
docker exec -i supabase_db_tennisPartnerFinder \
  psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -At
```

核心輸出：A save `OK`、A remove `OK`、B save `OK`、owner `push-sequence-b@example.test`、`ROLLBACK`。

### 6.5 同帳號兩 endpoint 與 auth cascade rollback transaction

同樣透過上一節的 `docker exec ... psql` 執行：

```sql
begin;
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'push-two-devices@example.test', 'test', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000c1',true);
select public.save_push_subscription('https://push.example/device-one','key-one','auth-one');
select public.save_push_subscription('https://push.example/device-two','key-two','auth-two');
reset role;
select 'before_remove=' || count(*)
from public.push_subscriptions
where endpoint like 'https://push.example/device-%';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000c1',true);
select public.remove_push_subscription('https://push.example/device-one');
reset role;
select 'after_one_remove=' || string_agg(endpoint, ',')
from public.push_subscriptions
where endpoint like 'https://push.example/device-%';
delete from auth.users
where id = '10000000-0000-0000-0000-0000000000c1';
select 'after_auth_delete=' || count(*)
from public.push_subscriptions
where endpoint like 'https://push.example/device-%';
rollback;
```

核心輸出：兩次 save 都是 `OK`、`before_remove=2`、移除第一個 endpoint 後只剩 `device-two`、`after_auth_delete=0`、`ROLLBACK`。這個 fixture 沒有 report、legacy 或 chat message 等其他 profile FK 資料，只驗證無阻擋資料時的 cascade。

## 7. 本輪有做與沒有做的驗證

已執行：

- 第七輪 SHA、HEAD、source／migration／Git history 對讀
- W3C `unsubscribe()` boolean 語意核對
- 兩組 Postgres rollback transactions：A→B takeover；同帳號兩 endpoint＋無其他阻擋 FK fixture 的 auth cascade
- Push focused Node tests：13 passed、0 failed
- TypeScript AST 17／89、profile helper 35／6、Vite emitted outputs 24／dist files 32 重跑
- 本機 Claude memory 的內容、時間與 SHA 核對

本輪沒有執行：

- browser logout／OAuth 雙帳號 E2E
- 真實 Chrome、Safari、Firefox 的 Push lifecycle matrix
- permission recovery、subscription refresh、VAPID rotation
- Edge Function 對真實 push service 的 404/410 integration test
- 全量 `typecheck`、`lint`、`test:mock`、`test:local`、`test:db`
- 歷史 8/27、8/28 artifact 的逐 byte 比對，因 repo 沒有保存可比對的 artifact

以上未執行項目一律不能在 final-v3 寫成已通過。

## 8. 給 Claude 下一輪確認的最短清單

請直接對 HEAD `a14e81e` 驗證，不要用本系列 Markdown 互相證明：

1. 重跑 §6.1–6.3，確認 17/89、35/6、24 emitted outputs／32 dist files。
2. 核對 W3C：`false` 是 captured subscription already deactivated；`true` 是平行 deactivation 已啟動，兩者都不能取代後續 `getSubscription()` 重讀。
3. 合併 rollback transaction 與 `notificationPush.js:29-36`，反駁或確認 B 手動 enable 時的同 endpoint takeover。
4. 確認 durable quarantine 才需要 migration；不要把所有安全 cleanup 都寫成必須 migration。
5. 將 auth reconciliation 寫成四種行為契約。
6. 保留 6A／6B 邊界與 unread 硬順序。
7. 不得再使用「Vite 同 hash 保證 byte-identical」。
8. `ds-bundle` 最終政策標記為「維護者待確認」。
9. auth delete 只標成條件式 cascade；先盤點所有 RESTRICT／NO ACTION FK，不能把空白 fixture 擴大成任意正式帳號。

完成這九項後，才適合整理 final-v3 派工文件。
