# 2026-08-25 整體路線圖對立審查報告（Codex）

- 審查對象：`docs/arch-roadmap-2026-08-25.md`
- 審查依據：`docs/arch-dispatch-2026-08-25-roadmap-review.md`
- 審查時間：2026-08-25 01:42–01:49 CST
- 性質：唯讀審查；除本報告外未修改程式、既有文件、Git refs 或資料庫
- 最終級別：**異議需使用者重審**（同時含結構性問題）

## 一、先講結論

路線圖的「批次項目覆蓋」大致完整，但目前版本不能原樣執行。至少要先修正下列四件事：

1. [已驗證] **階段 0 的 production 前提已失效。** 審查進行到 01:49 CST 時，
   `qiuka.tw` 已由 Vercel 送出 640,044-byte React bundle，內含 `createRoot` 與
   `onCommitFiberRoot`；HTTP `last-modified` 是 2026-08-25 01:48:59 CST。遠端兩個 Git branch
   同時仍停在 `main=76779be`、工作分支 `0be31a2`。因此「production 仍是 pre-React」不再成立，
   而且 production 在本次審查期間發生了未伴隨 branch ref 更新的 deploy／redeploy。
2. [已驗證] **F3-1 與仍標為「生效」的 MIG-06 正面衝突。** F3-1 要讓四主分頁進 URL、可深連結、
   重整保位；`docs/architecture-decisions.md` 的 MIG-06 卻仍規定「分頁狀態進 URL 留在遷移
   scope 之外，另開產品 track」。F3-0 目前只授權翻 surface stack／DOM 凍結，沒有授權翻 MIG-06。
3. [已驗證] **階段 0 的備份順序倒置。** 路線圖先在第 3 步清 QA fixtures，直到第 6 步才處理
   hosted 備份檔；新鮮 dump、count preflight、備份可讀性確認都應在任何刪除之前。
4. [已驗證] **「OPS-4／5／10／11」是空殼引用。** 全 repo 只有路線圖與本審查派工單出現這些
   ID；沒有可追溯的 OPS 原始文件。Site URL、Maps referrer、migration 對齊各自有其他證據，
   但 OPS 編號本身不可驗證；「backup 在 scratchpad」尤其沒有 repo 證據。

[推論] 若把「上線」拆成「部署程式」與「對外公開宣傳」，最小返工方案是：可繼續準備程式部署，
但先重新盤點目前 production SHA；社群公開則維持被真實種子供給 gate 擋住。這能保留使用者的
「上線先行」方向，同時不違反 `mvp-plan` 對空 discovery 的明文警告。

## 二、引用錨點（節首原句逐字）

下文引用文件時，以本表節首原句作為防空殼錨點：

| 文件／章節 | 該節原文第一句（逐字） |
| --- | --- |
| `arch-roadmap-2026-08-25.md`「階段 0」 | `依序，**push 後等 CI 綠才 merge main**：` |
| `arch-dispatch-2026-08-22-frontend.md`「批次相依」 | `批 0（安全網，項目間互相獨立，可平行）` |
| 同檔「F3-1」 | `- **目標／動機**：四個 showXPage 各自硬編 hidden 矩陣（O(N²)）；分頁不進 URL／history，無法深連結、重整回地圖、返回鍵無作用。` |
| 同檔「F4-3」 | `- **作法順序**：先 rollup-plugin-visualizer 出報告（回報附截圖或 JSON 摘要）→` |
| 同檔「F4-8」 | `- **驗收**：production build 以 define／條件編譯拔除 \`__tennisE2ETestHooks\` 讀取路徑；` |
| `mvp-plan.md`「首次公開發布 checklist」 | `本節是 hosted 發布的人工 gate。` |
| 同檔「分發管道與文案」 | `已核可管道只有三處：Threads 發文、LINE openchat 公開揪球群、FB 網球社團。` |
| `architecture-decisions.md` 本頁導言 | `本頁把五份歷史文件的 32 個決策條目收斂成可追溯索引。` |
| `final-verdict-2026-08-21.md`「未盡事項」 | `REL／push、hosted preview 人工 QA、CSP Report-Only→enforcing、error transport 廠商拍板` |
| `frontend-fix-plan-2026-08-20.md` production 差異節 | `**這是本輪最重要的發現，兩份分析都沒提到。**` |
| `qiuka-rebrand-design.md`「執行順序與驗收」 | `1. 本批在工作分支執行，**排在 Codex QA 的 GO 判定之前落地**——理由：對外第一` |

## 三、A. 事實查核

### A1. origin commit 與 commit 數

判定：**部分成立，但必須把「工作分支 upstream」與 `origin/main` 分開寫。**

[已驗證] 遠端工作分支仍精確停在 `0be31a2`；遠端 main 是 `76779be`。本機 HEAD 相對工作分支
upstream 領先 69 commits。相對 main 則領先 84 commits、139 files，不是單純「60+ commit」的
production 差異。

指令與實際輸出：

```text
$ git ls-remote origin refs/heads/claude/tennis-partner-finder-proto-xfrr6g refs/heads/main
0be31a288bd13c67e018ad5a18ad303113d8404e refs/heads/claude/tennis-partner-finder-proto-xfrr6g
76779be821c7e1b41559287179d54bfc4a0da205 refs/heads/main

$ git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'
origin/claude/tennis-partner-finder-proto-xfrr6g

$ git rev-parse '@{upstream}'
0be31a288bd13c67e018ad5a18ad303113d8404e

$ git rev-list --count '@{upstream}'..HEAD
69

$ git rev-list --count main..HEAD
84

$ git diff --name-only main..HEAD | wc -l
139

$ git diff --stat main..HEAD | tail -1
139 files changed, 20887 insertions(+), 6037 deletions(-)
```

[已驗證] `main` 是 HEAD 祖先，且 `main..HEAD` 沒有 migration 檔；所以 Git 層仍可 fast-forward，
資料庫沒有隨本次前端分支新增不可逆 migration。

```text
$ git merge-base --is-ancestor main HEAD; printf 'main_is_ancestor_exit=%s\n' "$?"
main_is_ancestor_exit=0

$ git diff --name-only main..HEAD -- supabase/migrations/
<空輸出>
```

### A2. REL-10／REL-11 是否是 checklist 僅剩未勾項

判定：**成立。**

[已驗證] 「首次公開發布 checklist」區間只有 2 個 `- [ ]`，分別是穩定 preview 人工 QA 與
QA 資料清除，對應路線圖的 REL-10／REL-11（REL 編號是路線圖命名，`mvp-plan` 原節沒有編號）。

```text
$ sed -n '/^## 首次公開發布 checklist/,/^## Hosted 發布 gate/p' docs/mvp-plan.md | rg -c '^- \[ \]'
2

$ sed -n '/^## 首次公開發布 checklist/,/^## Hosted 發布 gate/p' docs/mvp-plan.md | rg -n '^- \[ \]'
83:- [ ] 穩定 preview 人工 QA：OAuth、Maps referrer、390px 慢網路、鍵盤焦點、支援／隱私連結、
88:- [ ] 清除 QA 球局、訊息、profile/auth fixtures；確認匿名 discovery 無 QA 資料後，才由負責人
```

[已驗證] 原節還明寫：「剩餘未勾項（穩定 preview 人工 QA、QA 資料清理）仍待負責人完成後才可把
`main` push 上 production。」所以路線圖把兩者放在 main production deploy 前是正確依賴。

### A3. 白箱直呼實測數

判定：**路線圖的 140 正確；母派工單的 138 已過時。**

```text
$ grep -rhoE '__importAppModule\("[^"]*"\)' tests | wc -l
     140
```

[已驗證] 這是字面呼叫數，不是 unique module 數或 unique test 數；路線圖應把單位寫成
「140 個字面呼叫點」以免再混用。

### A4. F4-3 的依賴與「3B 後」

判定：**「依賴批 2」成立；「必須在 3B 後」是合理的重工控制推論，不是母派工單硬依賴。**

[已驗證] 母派工單「批次相依」逐字只寫：

```text
批 4（效能與收尾）：F4-1/F4-2/F4-4/F4-6 隨時可做；F4-3 依賴批 2；F4-5 已裁決不做
```

[已驗證] F4-3 自己的驗收要求是 visualizer → lazy private chunks／repository split → per-chunk 與
dist 總量 gate；沒有任何條件要求 AppShell 已完成。

[推論] 路線圖把它排在 3B 後可以避免 F3-2 退役三個 glob、移動 shell 後重新量 bundle，排序是好
的；但標題「必須在 3B 之後」應改成「建議在 3B 之後（避免重錄 bundle 基線）」。若 3B 被阻擋，
現行文字會不必要地連帶阻擋一個其實已具備批 2 前置的效能批。

### A5. 階段 1 三項的原始定義與「隨時可做」

判定：**F4-6、F4-2 相符；F4-8 可做但沒有「隨時可做」來源，且原始優先級是 P2。**

| 項目 | 母派工單原文狀態 | 路線圖判讀 |
| --- | --- | --- |
| F4-6 Sentry | 「即日可派工」；依賴表列「隨時可做」 | [已驗證] 相符 |
| F4-2 AdvancedMarker | 依賴表列「隨時可做」 | [已驗證] 相符 |
| F4-8 test hooks | 標題明列「P2」；不在「隨時可做」清單 | [已驗證] 沒有已知程式依賴，但被路線圖提級是新排序決策，不是來源事實 |

[已驗證] `__tennisE2ETestHooks` 目前在 `src/` 有 6 個字面讀取／型別命中；原分析把它定性為
「風險低」。因此把 F4-8 放 post-release 第一批並非錯誤，但路線圖不應用「三項皆隨時可做」
背書；應明說「F4-8 由 P2 提級，理由是縮短 test-only path 的 production 暴露期」。

```text
$ rg -n '__tennisE2ETestHooks' src | wc -l
6
```

### A6. OPS、Site URL、referrer、Push、migration、backup

判定：**技術內容有真有假；OPS 編號全部不可追溯。**

#### A6.1 OPS 編號

```text
$ rg -uuu -n 'OPS-(4|5|10|11)' . --glob '!node_modules/**' --glob '!.git/**'
./docs/arch-roadmap-2026-08-25.md:30:   Supabase Site URL 切 `https://qiuka.tw`（OPS-4）、Maps referrer 實測（OPS-5）。
./docs/arch-roadmap-2026-08-25.md:32:  （memory 記錄自相矛盾，OPS-10）；hosted 備份檔搬離 scratchpad（OPS-11）。
./docs/arch-dispatch-2026-08-25-roadmap-review.md:42:6. 路線圖引用的 OPS 項（Site URL、referrer、推播 origin、migration 006–008
```

[已驗證] `git log --all -S'OPS-4' -- docs` 與 `-S'OPS-10'` 都只回路線圖 commit `18f9487`。
建議刪 OPS 編號，直接引用 repo 來源；若 OPS 其實在外部 memory，應先落成可讀文件。

#### A6.2 Supabase Site URL

[已驗證] `docs/superpowers/specs/2026-08-14-qiuka-rebrand-design.md` 的「執行順序與驗收」第 5 點
確實寫：「Supabase Site URL 於切換正式網域時改為 `https://qiuka.tw`（ian 執行，Redirect URLs
已加）。」

[不確定] 本審查沒有 Supabase Dashboard 的 Site URL read API；只能驗來源存在，不能宣稱目前值仍
未切。階段 0 應先讀值，再決定是「修改」還是「確認」，不能無條件重寫。

#### A6.3 Maps referrer

[已驗證] `mvp-plan` release checklist 把 Maps referrer 列進剩餘穩定 preview QA；歷史 hosted gate
則記錄 2026-07-20 曾成功。重新驗 production referrer 合理，因為 API key hosted 設定是 repo 外狀態。

#### A6.4 Push origin

[已驗證] 前端以同源 `/push-sw.js` 註冊 service worker，並從該 registration 的 PushManager 取／建
subscription：

```text
src/notificationPush.js:29:  const registration = await browserNavigator.serviceWorker.register("/push-sw.js");
src/notificationPush.js:30:  const existing = await registration.pushManager.getSubscription();
src/notificationPush.js:33:    (await registration.pushManager.subscribe({
```

[推論] preview alias 與 `qiuka.tw` 的 permission／subscription 不共用，故從 preview 到 production
必須在 production 自己驗一次；但本次不是把 production 從另一個 domain 搬到 qiuka.tw——
`qiuka.tw` 已是現行 production origin。路線圖「換域後需重新授權」會誤導，應改成：
「preview 授權不代表 qiuka.tw 已授權；在 qiuka.tw 查既有 subscription，沒有才由使用者手勢申請」。

#### A6.5 migrations 006–008

判定：**當下已對齊；路線圖所稱矛盾可結案，不該留到 deploy 後。**

```text
$ npx supabase migration list 2>/dev/null | jq '{count: (.migrations | length), mismatches: [.migrations[] | select(.local != .remote)], target_006_008: [.migrations[] | select(.local == "202607270006" or .local == "202607270007" or .local == "202607270008")]}'
{
  "count": 25,
  "mismatches": [],
  "target_006_008": [
    { "local": "202607270006", "remote": "202607270006", "time": "202607270006" },
    { "local": "202607270007", "remote": "202607270007", "time": "202607270007" },
    { "local": "202607270008", "remote": "202607270008", "time": "202607270008" }
  ]
}
```

[已驗證] 指令 exit 0、25/25、mismatch 空。把這項留在階段 0 第 6 步只會重複查一次；較安全是
在 destructive cleanup 前做一次 preflight，部署後除非期間有人 push migration，否則不用重跑。

#### A6.6 hosted backup／scratchpad

[已驗證] repo 只證明 2026-08-04、08-07、08-13 做過歷史 dump，且路徑在執行者本機 backup 目錄；
找不到「目前有一份 hosted 備份在 scratchpad」的檔名、checksum、時間或 count。

[不確定] OPS-11 的物件是否存在、能否 restore、是否涵蓋 fixture cleanup 前最新資料。路線圖必須把
它改成可驗收步驟：「cleanup 前新 dump → checksum → counts → 搬到非 scratchpad 的 0700/0600
目錄 → 讀回確認」，而不是部署後的雜項搬檔。

### A7. production 現況（派工背景的額外高風險事實）

判定：**「qiuka.tw 仍跑 pre-React」已不成立。**

```text
$ date '+local_now=%Y-%m-%d %H:%M:%S %Z'
local_now=2026-08-25 01:49:30 CST

$ curl -fsSL https://qiuka.tw/ | rg -o 'assets/index-[A-Za-z0-9_-]+\.(js|css)'
assets/index-KQ1sIPq3.js
assets/index-CgKsGA-d.css

$ curl -fsSL https://qiuka.tw/assets/index-KQ1sIPq3.js | tee >(wc -c >&2) | rg -o 'onCommitFiberRoot|react-dom|createRoot' | sort | uniq -c
  640044
   2 createRoot
   2 onCommitFiberRoot
   3 react-dom

$ curl -fsSI https://qiuka.tw/ | rg -i '^(date|etag|last-modified|x-vercel|server):'
date: Mon, 24 Aug 2026 17:49:21 GMT
etag: "976b2c7498c0b97c83be4cc954aa8a49"
last-modified: Mon, 24 Aug 2026 17:48:59 GMT
server: Vercel
```

[已驗證] UTC 17:48:59 等於台北 01:48:59，恰在本審查期間。相同時間 `git ls-remote` 仍顯示
main `76779be`、工作分支 `0be31a2`。不能從這些資料推定是誰或用何種 UI 觸發 deployment；能確定
的是 roadmap 的 production snapshot 已過期。

## 四、B. 排序與依賴邏輯

### B1. 階段總依賴表

| 路線圖邊 | 判定 | 證據／修正 |
| --- | --- | --- |
| 階段 0 → 階段 1 | [推論] 有條件成立 | production 狀態已變，先重建 release snapshot；若最新 branch 尚未 deploy，仍需 preview QA |
| F4-2 → F4-1/F4-9/F4-4 | [推論] 合理 | AdvancedMarker API 與 legacy Marker 的 detach/update/content API 不同，先遷移可避免 marker diff 寫兩次 |
| F3-0 → F3-1 | [已驗證] 不足 | F3-0 現有授權沒有翻 MIG-06；必須先新增「MIG-06 正式翻案或 F3-1 縮 scope」 |
| F3-1 → F3-3 | [推論] 可成立 | 先定義導覽／URL 狀態，再讓 boot 描述等待點，可減少 F3-3 重寫；同批必須用冷啟動 deep-link tests 鎖交界 |
| 3A → 3B | [已驗證] 成立 | AppShell 殼遷移依 F3-0 規則解凍，且 3A 先收斂導航／boot 可降低三方共管風險 |
| 3B → F4-3 | [推論] 軟依賴 | 避免 glob／chunk 基線被 3B 攪動；不是硬技術依賴 |
| 任意位置 → F0-7/F0-8/F4-10 | [已驗證] 只有 F0-8 近似成立 | F0-7 直接綁 sheet／eager／consumer 清單；F4-10 會拆 smoke 與改 workers，會與大量新增 e2e 的批 3 互相改動 |

### B2. 地圖批與 AdvancedMarker 相容性

[已驗證] 現行 `src/map.js` 的三種 marker renderer 都先 `oldMarkers.forEach(marker =>
marker.setMap(null))`，再 `new google.maps.Marker({icon,label,optimized:false})`；F4-1 就是要消除這個全拆。
AdvancedMarker 使用 DOM content、`map`／`position` property 形狀，現有 `setMap`、`icon`、`label`、
`optimized` acceptance 不能原封不動沿用。

[推論] 所以路線圖的「階段 1 先 F4-2、階段 4 再 F4-1」方向正確，不存在新舊 API 衝突；但下一張
地圖派工單必須把 F4-1 驗收改寫成 AdvancedMarker 形狀：

- key：sessionId/courtId（cluster 還要定義成員集合 fingerprint）；
- unchanged：marker instance、content node、listener、DOM mutation 全部 0；
- removed：以 `marker.map = null` 或封裝 adapter detach，不再驗 `setMap(null)`；
- changed：只更新 position/content/zIndex 必要欄位，不重綁 listener；
- fakeMaps：要記 create/update/detach/content replace 計數，而不只 `visibleMarkerOptions`。

[已驗證] F4-9 會把 main 的 marker arrays 與 map singleton 合成單一 owner，與 F4-1 的 keyed registry
是同一狀態邊界；三項合批有根據。

### B3. 守門收尾不是完全「無依賴」

[已驗證] F0-7 要取代的現行 magic counts 包含：14 sheet adapters、14
`mounted.registerUnmount`、8 imperative adapters、2 eager globs、13 lazy sheets、14 presentation
consumers。F3-2 又會遷 `openLoginModal`、surface stack 與三個 glob，正好改變這些集合或其存在理由。

```text
tests/react-surface-lifecycle.test.js:40:test("all 14 React sheet adapters register tracked SurfaceHost portal content", () => {
tests/react-surface-lifecycle.test.js:103:  assert.equal((SESSION_VIEWS.match(/eager: true/g) ?? []).length, 2, "only App and Session Detail stay eager");
tests/react-surface-lifecycle.test.js:105:  assert.equal((lazySheetList.match(/\.\/sheets\/.+?\.tsx/g) ?? []).length, 13);
tests/session-presentation-boundary.test.js:111:test("all 14 presentation consumers depend on the TypeScript boundary", () => {
```

[推論] 最低重工排法是 F0-7 放在 **F3-0 之後、F3-2 之前**：先知道哪些凍結條款被翻，再把目前集合
清單化，3B 只改單一 manifest 並在報告解釋變因。若 F0-7 放到 3B 後也能做，但不能再稱「任何
階段之間皆無依賴」。

[推論] F4-10 最好在 3A 前或 3B 後，不要夾在 3A/3B 中間；它會拆 `smoke.spec` 並改 worker，會讓
同期間新增的 navigation/AppShell e2e 產生大面積 merge/驗收噪音。F0-8 才是真正可獨立插入。

### B4. 階段 0 的安全順序

原順序的主要問題不是「CI 綠才 merge」；這條是對的。問題是沒有 immutable release snapshot、
備份太晚、rollback 目標不精確，且 live production 已在審查中改變。

建議改成：

1. [已驗證] **重新凍結現況**：記錄 remote branch SHAs、Vercel production deployment SHA／asset、
   production env mode、Supabase Site URL 現值、Maps referrer 現值；先解釋 01:48 的 deployment。
2. [已驗證] **cleanup 前備份**：fresh schema/data dump、counts、checksum、權限與讀回；離開 scratchpad。
3. [已驗證] push 開發分支，等 `frontend` 與 `supabase` CI 綠；WebKit 雖 non-blocking，仍下載 artifact
   對照既有六條，不接受新增失敗。
4. [推論] 用 immutable preview URL／SHA 做 REL-10：390px 慢網路、鍵盤、support/privacy、OAuth、
   Maps、push、console/pageerror；補一輪實機 Safari 鍵盤／VoiceOver分類。
5. [已驗證] 在最後一輪 hosted QA 完成「取消球局」，再清 fixtures；清完驗匿名 discovery 沒 QA
   row、directory 沒 opt-in QA profile、auth fixtures 已處理。
6. [推論] 在 merge 前完成 Site URL／redirect/referrer 的**讀值與變更計畫**；不要部署後才第一次發現
   redirect 設錯。
7. [已驗證] 確認 main 仍是 release SHA 祖先、diff 無 migration，再 fast-forward／merge main 並以
   Git push 觸發 production。
8. [推論] production smoke：精確 asset/SHA、匿名 discovery、OAuth 兩帳號、Maps、push、深連結、
   create/cancel 的最短可逆旅程、console/pageerror。
9. [已驗證] rollback 必須指定一個**確切 deployment ID/SHA**，並證明它是 2026-08-14 後且具真實
   Supabase env；不可只寫「前一 deployment」。

[已驗證] `frontend-fix-plan` 已記錄：回滾到 2026-08-14 前會進 mock mode、公開假球局，直接違反產品
紅線。路線圖的「Vercel 可即時 rollback 至前一 deployment」漏掉這個既知限制。現在 production 又
剛發生 redeploy，「前一個」指向什麼更不能靠記憶。

## 五、C. 完整性

### C1. 母派工單條目覆蓋

| 範圍 | 路線圖狀態 | 判定 |
| --- | --- | --- |
| F3-0/F3-1/F3-3 | 階段 2（3A） | [已驗證] 有排；但 F3-1 卡 MIG-06 |
| F3-2 | 階段 3（3B） | [已驗證] 有排 |
| F4-1/F4-9/F4-4 | 階段 4 | [已驗證] 有排，合批有 ownership 根據 |
| F4-3 | 階段 5 | [已驗證] 有排；「3B 後」應標軟依賴 |
| F4-7 | 階段 6，前端／DB 分批 | [已驗證] 有排，且符合母單「DB 另立批」 |
| F0-7/F0-8/F4-10 | 彈性批 | [已驗證] 有排；只有「無依賴」敘述過度 |
| F4-2/F4-6/F4-8 | 階段 1 | [已驗證] 有排；F4-8 是 roadmap 自行提級 |
| F4-5 | 不做 | [已驗證] 正確，沒有偷排回來 |
| TanStack Query/Router/Redux/@layer/SSR | 不做／延後 | [已驗證] 與 NP-01～06 相符 |
| 桌面雙欄 | analytics 後再議 | [已驗證] 與 MIG-01/NP-05 相符 |

[已驗證] 母派工單尚未完成的具名 F0/F3/F4 項目都有被排或明確不做；沒有發現單純「漏掉某個 F 編號」。

### C2. 與 architecture-decisions 的矛盾

1. [已驗證] **MIG-06 vs F3-1：真衝突。** MIG-06 仍「生效」，F3-1 正在做同一件事。
2. [已驗證] **OV-04/FV-04/D-02 的狀態已過時。** 索引仍寫 error transport 廠商選擇與接線留待
   使用者／暫不做，但 2026-08-22 母派工單已記錄使用者選 Sentry 並可即日派工。這不阻擋 roadmap，
   卻代表剛 ACCEPTED 的決策索引不是 current truth；應標「已翻案」或拆成「廠商已終結／接線待做」。
3. [已驗證] **D-03 需在 F4-6 顯式處置。** D-03 說監控重啟時再評估 hidden source map；F4-6 已是
   重啟點。由於本專案禁止傳 raw stack，可能結論仍是「不開」，但必須落決策，不可完全漏掉。
4. [已驗證] MIG-05（列表虛擬化另 track）與 F4-7 不衝突；F4-7 明確先做 content-visibility 與資料
   pagination，且說「不過早虛擬化」。

### C3. 路線圖漏掉但會咬人的債

#### CSP Report-Only

[已驗證] `vercel.json` 仍只有 `Content-Security-Policy-Report-Only`，且沒有 report endpoint；
`tests/security-headers.test.js` 還明確禁止 `report-uri|report-to`。現在甚至沒有 CSP violation telemetry，
所以「先觀察再 enforcing」沒有實際收集通道。

[推論] 排在 F4-6 後新增「安全標頭決策批」：先把 Sentry 需要的 connect-src 精確加入 preview policy，
決定低個資 violation 收集方式，再 staged enforcing。若本輪不做，路線圖至少要列「不排：仍由
OV-03/FV-03 等使用者拍板」，不可消失。

#### reports.status 無法結案

[已驗證] `mvp-plan` 明載沒有 RPC 可改 `reports.status`；`open` report 會讓關聯訊息豁免 90 天 purge，
直到結案。pgTAP 也證明 closed report 才允許 purge。

[推論] 這不是部署當日 blocker，但是真實 report 出現後就開始累積保留債。應排一張獨立 DB／治理批，
最晚在首個 90-day retention window 前完成 owner-only close/dismiss 流程、audit 與 pgTAP；否則明確記錄
接受 indefinite retention。

#### WebKit 六條實機分類

[已驗證] 六條穩定訊號中，四條被歷史報告分類為 Safari 程式化 focus／restore 差異，兩條是
Playwright 觸控 input model 假設。CI job 是 `continue-on-error: true`；所以 CI 綠不會回答真實 iPhone
鍵盤／VoiceOver 是否可用。

[推論] 把實機 Safari 分類併入 REL-10，而不是等一般「上線後債」。這不是要求六條全修；是先分類
四個可能的產品 a11y 問題，測試模型問題則另改測試。

#### `profiles.line_id` 凍結債

[已驗證] 前端仍唯一傳 `p_line_id: null`，欄位不讀、不寫、不渲染；現有 guard 有牙。這是 schema
清理債，不是 release blocker。

[推論] 放「不排／後續 DB 清理」即可；要做時須新 migration、backup/count preflight、改 RPC
簽名與生成型別，不能和 F4-7 pagination DB 半批偷綁，否則驗收面過大。

#### Analytics 啟用

[已驗證] `mvp-plan` 明寫 Vercel Dashboard 要先啟用 Analytics 並重新 Git deployment 才收得到進站
資料。路線圖一邊把桌面雙欄押後到 analytics，一邊沒把 Analytics 啟用／驗證列進階段 0。

[推論] 若尚未啟用，加入 production preflight；否則「先看裝置比例」沒有資料來源，首波分發成效也
無法觀察。

### C4. 五條既有風險之外，最可能讓計畫失敗的前三名

1. **release truth 在執行中漂移。** [已驗證] 01:48:59 production 已 redeploy 成 React，remote refs
   未變；roadmap 仍以 pre-React 為前提。沒有 deployment SHA/asset snapshot 的 runbook 會讓 QA、
   rollback、diff 對錯版本。
2. **Batch 3 開工即撞有效決策。** [已驗證] MIG-06 未翻案，F3-0 授權範圍也沒涵蓋它；嚴格按規則
   執行時 F3-1 應 BLOCKED，寬鬆執行則會破壞決策治理。
3. **把程式部署與公開 launch 混為同一件事。** [已驗證] `mvp-plan` 說發布日匿名 discovery 必然
   0 筆、種子供給「發布前必須補上」；路線圖卻擱置 REL-12。若同時發社群文，第一波注意力會落在
   空地圖與登入牆；若只部署程式而不宣傳，則可以接受，但路線圖必須分詞。

## 六、D. 對四項已拍板決策的證據級異議

### D1. 決策 1「上線先行」：要求重審其操作定義，不反對儘快部署

- 異議：[已驗證] production 已在審查期間變成 React，原本「先把 pre-React 換掉」的決策前提消失；
  最新 branch 仍未 push，production 也無外部 error transport。
- 證據：live bundle 640,044 bytes 且有 React fiber；remote branch 仍 `0be31a2`；
  `rg configureAppErrorTransport src` 只有 `src/appErrors.ts` 定義；main→HEAD 84 commits／139 files。
- 替代：先 freeze 當下 deployment SHA，完成 fresh backup＋immutable preview QA；若使用者仍接受無 Sentry
  空窗，可以 deploy，但要把 Sentry 定為緊接的有期限 hot-follow，而不是含糊「之後第一批」。
- 返工成本：[推論] 路線圖與 runbook 小修約 1–2 小時；若堅持 Sentry pre-release，增加一張既定 F4-6
  派工與一次 preview QA，沒有丟棄既有程式成果。

### D2. 決策 2「3A 含 F3-1」：MIG-06 必須正式翻案

- 異議：[已驗證] 不是架構偏好，而是有效決策文件與派工 scope 自相矛盾。
- 證據：MIG-06「分頁狀態進 URL 留在遷移 scope 之外，另開產品 track」仍標生效；F3-1 驗收要求
  四主分頁可深連結、重整保位、返回鍵有語意。
- 替代 A：使用者正式翻 MIG-06，將理由、產品語意、hash namespace 與 analytics 限制寫進 F3-0；
  替代 B：F3-1 只收斂 `setActivePage`，URL/history 另開產品批。
- 返工成本：[推論] A 為文件決策＋測試 scope 約半天內；B 會拆派工與延後 deep-link 價值，但程式
  重工仍低於做到一半才被 governance 退件。

### D3. 決策 3「收尾批全排入」：無異議

[已驗證] F4-1/2/3/4/7/8/9/10 與 F0-7/8 都有去處，F4-5 仍維持不做；沒有把已否決框架項偷排回來。
只需把硬／軟依賴與 F0-7/F4-10 的插入位置修正。

### D4. 決策 4「REL-12 擱置」：若代表公開宣傳，要求重審；若只代表 code deploy，可保留

- 異議：[已驗證] `mvp-plan` 用強制語氣寫「種子供給：待定（發布前必須補上）。」並說匿名
  discovery 必然 0 筆；這與「發布時機另議」的 roadmap 有直接衝突。
- 證據：同節還明寫「這一段沒有定案就發布，首波社群注意力會落在空地圖與登入牆上」。
- 替代：把兩個 gate 分開：`REL-code` 可部署；`REL-public`／社群分享必須有 1–2 場創辦人真實局或
  pilot 主揪真實局。禁止 QA 假資料、禁止代建第三方貼文，維持原產品紅線。
- 返工成本：[推論] 程式零返工；只需調整 roadmap 用詞與安排真實供給。產品／招募成本取決於
  是否已有主揪，但不能以文件擱置消除空市場風險。

## 七、建議直接套進 roadmap 的最小文字 diff

1. 背景改成「01:48:59 CST live 已是 React baseline；最新工作分支仍未 push，先確認 production
   deployment SHA 與 branch 對應」。
2. 階段 0 前新增 `0a release snapshot` 與 `0b fresh backup/count/checksum`；把原第 6 步 migration
   list 移到 cleanup 前，把 backup 搬檔移到 cleanup 前。
3. rollback 改成「預先指定 exact Vercel deployment ID/SHA，證明為 2026-08-14 後且 real Supabase
   env；禁止泛稱 previous deployment」。
4. Push 文案改成「preview 與 qiuka.tw origin 分離；在 qiuka.tw 查 existing subscription，缺少才
   申請」，刪「換域後必重新授權」。
5. F3-0 scope 新增「MIG-06 正式翻案」；若使用者不翻，從 3A 移出 F3-1 的 URL/history 部分。
6. F4-3 標題把「必須」改「建議（避免 3B 後重錄基線）」。
7. 彈性批拆成：F0-8 真彈性；F0-7 放 F3-0 後／3B 前；F4-10 放 3A 前或 3B 後。
8. 新增「明確不排／待使用者」：CSP enforcing、reports.status close workflow、WebKit 實機分類、
   `profiles.line_id` DB 清理；其中 WebKit 分類移進 REL-10，reports workflow 設 90-day deadline。
9. 將 Sentry 決策在 `architecture-decisions.md` 的 OV-04/FV-04/D-02 更新狀態；F4-6 同時對 D-03
   hidden source map 作顯式決定。
10. 把「上線」拆成「production code deploy」與「public/social launch」；後者仍受真實種子供給 gate。

## 八、檢查過而未發現問題的項目

- [已驗證] REL checklist 確實只剩兩個未勾項，沒有第三個隱藏 checkbox。
- [已驗證] migrations 25/25 對齊，006/007/008 都 local=remote，沒有 drift。
- [已驗證] `main` 是 HEAD 祖先，且 main..HEAD 沒有 migration，前端 Git rollback 沒有新增 DB
  schema 耦合。
- [已驗證] F4-2 先於 F4-1 是避免 API 重工的正確方向；地圖三項合批符合單一 owner 收斂。
- [已驗證] 3A/3B 分批比把導航、boot、shell、glob 一次改完更可驗收；3B 的同步 commit caller 上限仍有
  F0-9 fail-closed gate。
- [已驗證] F4-7 拆前端半批與 DB 半批符合母派工單，沒有把 view/RPC/pgTAP 偷塞進 CSS 小改。
- [已驗證] F4-5、TanStack Query、React Router、Redux/Zustand、CSS `@layer`、SSR 沒被偷排回來。
- [已驗證] `profiles.line_id` 前端凍結契約仍在，路線圖沒有誤把 schema drop 當小前端批。
- [已驗證] 白箱直呼 140 的新數字可重現。

## 九、最終判定

**異議需使用者重審。**

不是因為收尾項目選錯，而是執行前提與治理邊界已不一致：live production 在審查中換成 React、
F3-1 與生效中的 MIG-06 衝突、備份在 destructive cleanup 之後、rollback 沒有 exact safe target，
且「code deploy」與「public launch」未分開導致 REL-12 與 `mvp-plan` 直接矛盾。

完成第七節 10 項文字修正後，技術批次主幹可降級為「需小修」；在 production SHA、MIG-06 與
REL-public 定義未重審前，不建議照目前階段 0／3A 原文直接執行。
