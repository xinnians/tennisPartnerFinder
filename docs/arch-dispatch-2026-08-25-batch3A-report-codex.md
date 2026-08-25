# 批 3A 執行回報：導覽狀態機／深連結＋啟動編排

- 日期：2026-08-25
- 派工單：`docs/arch-dispatch-2026-08-25-batch3A.md`
- 開工 HEAD：`19deb6c`
- 實作 HEAD：`bded000`
- 分支：`main`
- 結論：[已驗證] F3-0 → F3-1 → F3-3 依指定順序落地；四主分頁已有 URL／history 狀態、`#/session/:id` 優先序不變，session 冷啟動改為結構性等待 auth 後只開一次；標準矩陣全綠。
- 提交／推送：[已驗證] F3-0 為獨立純文件 commit，F3-1／F3-3 均有獨立 commit；本回報不列入實作 commit，未 push。

## 1. Commit 與範圍

開工時 `origin/main` 為 `bb0a810`，本派工單由其後的 docs-only commit `19deb6c` 加入；實作直接接在 `19deb6c` 後，沒有回退或改寫派工單。

```text
$ git log --oneline 19deb6c..HEAD
bded000 fix(auth): scope page-owner reset to boot
28864b4 fix(boot): reconcile page owner before profile load
1e220f6 fix(nav): reset owned page history on account change
305fa43 refactor(boot): await auth before session deep links
8e4dbd1 feat(nav): add page hash state machine
a15d37e docs(arch): 解凍批 3 導覽與 AppShell 規則
```

| Commit | 歸屬 | 內容 |
| --- | --- | --- |
| `a15d37e` | F3-0 | 只修改 React migration 規則，載明批 3 解凍與不解凍邊界。 |
| `8e4dbd1` | F3-1 | 加入分頁 hash 狀態機、history、router 與四條導覽 e2e。 |
| `305fa43` | F3-3 | 顯式化 `boot()` 依賴，讓 session route 等待 auth，加入冷啟動四象限 e2e。 |
| `1e220f6` | F3-1／F3-3 交界 | 讓應用建立的分頁 history entry 帶 owner identity，避免跨帳號冷啟動復原私人分頁。 |
| `28864b4` | F3-1／F3-3 交界 | 將 boot owner reconciliation 移到 profile load 前，消除使用者已操作後才晚到重設的競態。 |
| `bded000` | F3-1／F3-3 交界 | 將 owner reconciliation 限定於 boot restore；即時登出仍留在 Me 頁，維持既有登入入口行為。 |

本批實作只改五個檔案：

```text
$ git diff --stat 19deb6c HEAD
 .claude/rules/react-migration.md                   |   7 ++
 src/features/profile/profileOrchestrationFeature.js |  24 ++--
 src/main.js                                        | 123 +++++++++++++--------
 tests/session.spec.js                              |  51 +++++++++
 tests/smoke.spec.js                                |  70 +++++++++++
 5 files changed, 220 insertions(+), 55 deletions(-)
```

[已驗證] `sheets.js`、controller 模組、`dataApi`、`syncCommit.ts`、通知／presence 功能面均未修改。

## 2. F3-0：規則修訂

`a15d37e` 只修改 `.claude/rules/react-migration.md`，新增四點：

1. surface stack 可遷入 React，但只限 3B；3A 不動 `sheets.js`。
2. DOM 凍結只對 3B 實際接管的 topbar、底部導覽、toast、login modal 解除。
3. MIG-06 翻案：分頁狀態進 URL／history；session 與 page hash 的命名空間及優先序明文化。
4. `data-testid`、既有 e2e 斷言、文案、同步 commit 與 `dataApi` 邊界仍凍結。

[已驗證] 3A 規則修訂本身不改 DOM 結構，因此預期受影響的守門測試為零，不需調整任何 guard。

## 3. F3-1：導覽狀態機與 hash 設計

### 3.1 Hash 命名空間

| 目的地 | Hash |
| --- | --- |
| 地圖／探索 | `#tab-map` |
| 我的球局 | `#tab-my-sessions` |
| 訊息 | `#tab-messages` |
| 我的 | `#tab-me` |
| 球局深連結 | `#/session/:id`（逐字保留） |

選擇 `#tab-*` 是為了直接接管既有 `#tab-map` anchor，不引入第二套首頁 hash。router 先用既有 `sessionIdFromHash()` 判斷 `#/session/:id`，只有不是 session route 時才解析 `#tab-*`，所以 session 命名空間永遠優先。未知非空 hash 不強制改頁；空 hash 才回地圖。

### 3.2 狀態機形狀

`PAGE_ROUTES` 是四頁到 DOM id／hash 的唯一映射；純函式 `pageFromHash()` 只負責解析。`setActivePage(page, { historyMode })` 是 hidden 矩陣唯一寫入點，依序完成：

1. 更新 `activePage`。
2. 由同一份 `PAGE_ROUTES` 計算四個 page root 的 hidden 值。
3. 同步底部導覽狀態。
4. 視 `historyMode` 使用 `pushState`／`replaceState`，或在 router 復原時不寫 history。

原 `showMapPage`、`showMySessionsPage`、`showMessagesPage`、`showMePage` 均保留為薄包裝；既有第一參數與 `focus`／`focusNotificationSettings` 語意不變。`routeCurrentHash()` 實體共 10 行，沒有引入 React Router。

應用建立的 page history entry 另記錄 `pageOwnerIdentity`。只有 boot restore 發現「有 owner 且與完成還原的 auth identity 不同」時，才以 replace 回 `#tab-map`；同帳號重整保位，冷開外部 route 不被誤判，即時登出也不會把 Me 頁切走。

### 3.3 Hidden 矩陣歸零證據

派工起點來源碼中的直接指派為 9 處：

```text
$ git grep -n -E 'document\.getElementById\("(discovery-page|my-sessions-page|messages-page|me-page)"\)\.hidden[[:space:]]*=' 19deb6c -- src
19deb6c:src/main.js:559:  document.getElementById("my-sessions-page").hidden = true;
19deb6c:src/main.js:560:  document.getElementById("messages-page").hidden = true;
19deb6c:src/main.js:561:  document.getElementById("me-page").hidden = true;
19deb6c:src/main.js:578:  document.getElementById("messages-page").hidden = true;
19deb6c:src/main.js:579:  document.getElementById("me-page").hidden = true;
19deb6c:src/main.js:595:  document.getElementById("my-sessions-page").hidden = true;
19deb6c:src/main.js:596:  document.getElementById("messages-page").hidden = true;
19deb6c:src/main.js:621:  document.getElementById("my-sessions-page").hidden = true;
19deb6c:src/main.js:622:  document.getElementById("me-page").hidden = true;
```

HEAD 反向 grep 為零；hidden 寫入只剩 `setActivePage()` 內依映射計算的單點：

```text
$ rg -n 'document\.getElementById\("(?:discovery-page|my-sessions-page|messages-page|me-page)"\)\.hidden\s*=' src
# no matches
```

測試內為建立 fixture 狀態而做的 `.hidden` 指派不屬於產品 `show*Page` 矩陣，且本批沒有改動那些既有行。

## 4. F3-3：顯式啟動依賴

文字依賴圖如下：

```text
init()
└─ boot()
   ├─ publicStartup = Promise.allSettled(...)
   │  ├─ loadCourtsImmediately()   ┐
   │  ├─ controller.loadDiscovery()├─ 不等 auth，三路真並行
   │  └─ startMap()                ┘
   ├─ bootAuthReady = restoreAuth()
   │  └─ auth candidate → setAuthState → 必要時 profile load
   └─ routeCurrentHash()
      ├─ #tab-*：立即復原頁面，不寫新 history
      └─ #/session/:id：await bootAuthReady → 再確認 hash → 開啟一次

匯合：await bootAuthReady；再 await Promise.all([publicStartup, routeStartup])
```

`startMap()` 改為 async 並 await 原本的 Maps promise，讓 public 匯合點可觀察其完成。`Promise.allSettled` 保留三路各自既有 fallback，任一路失敗不阻止另外兩路。court pins 與 discovery 仍刻意不等 auth。

session route 的結構性等待由 `bootAuthReady` 與 `openAuthReadySessionHashRoute(expectedSessionId)` 表達；等待完成後會再核對當前 hash，避免等待期間已導航仍開舊 session。原 profile orchestration 的 reopen flag 及 router generation 已退役：

```text
$ rg -n 'bootDeepLinkReopenPending|sessionHashRouteGeneration' src tests
# no matches

$ rg -n 'openSessionHashRoute' src/features/profile
# no matches
```

profile orchestration 現在 await auth candidate 的 profile/controller 同步工作；router ownership 從 profile feature 移回啟動編排，不再靠 profile load 完成時間碰巧重開深連結。

## 5. 新增 E2E（逐條）

`tests/smoke.spec.js` 只追加以下六條：

1. `each main page opens directly from its tab hash`：四個主分頁 hash 逐一冷開。
2. `a main page hash keeps its page active across reload`：重整保位。
3. `browser Back returns to the previous main page`：分頁間 Back 語意。
4. `the existing home logo anchor routes to the map page`：既有 logo／`#tab-map` anchor 接管。
5. `cold boot routes an anonymous page hash`：未登入＋page hash。
6. `cold boot opens an anonymous session hash`：未登入＋session hash。

`tests/session.spec.js` 只追加以下兩條：

7. `cold boot retains an authenticated page hash after auth settles`：已登入＋page hash。
8. `cold boot opens an authenticated session hash once after auth settles`：已登入＋session hash，並以 request count 斷言只開一次。

既有 E2E 沒有刪改；兩檔 numstat 都是純新增：

```text
$ git diff --numstat 19deb6c HEAD -- tests/smoke.spec.js tests/session.spec.js
51  0  tests/session.spec.js
70  0  tests/smoke.spec.js
```

[已驗證] `tests/react-page-focus.spec.js` 完全未動；既有 focus 測試全綠。既有 `#/session/:id` 深連結斷言也零修改並全綠。

## 6. Canary

### 6.1 實作前紅燈

先加入四頁直開的新測試，在尚未實作 router 的程式上執行：

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
    --project=desktop-chromium --grep "each main page opens directly" \
    --workers=1 --retries=0
1 failed
```

失敗點是 `#tab-my-sessions` 冷開後 `#my-sessions-page` 仍為 hidden，證明測試不是恆綠。完成 F3-1 後同一條通過。

### 6.2 History mutation：紅 → 還原 → 綠

在完成實作後，暫時把分頁寫入由 `pushState` 變成 `replaceState`，再跑新 Back 測試：

```text
$ TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
    --project=desktop-chromium --grep "browser Back returns" \
    --workers=1 --retries=0
Expected: /#tab-messages$/
Received: "about:blank"
1 failed
```

還原 mutation 後，以完全相同指令重跑為 `1 passed`。暫時 mutation 沒有進 commit；這條 canary 同時證明斷言真的觀察 URL 與 history。

## 7. GOLDEN、testid 與凍結面

### 7.1 兩張 GOLDEN

本批未修改 `tests/session-controller-sequence.test.js`：

```text
$ git diff --numstat 19deb6c HEAD -- tests/session-controller-sequence.test.js
# no output
```

把 `0be31a2..19deb6c` 與 `0be31a2..HEAD` 的該檔 diff 分別做 SHA-256，結果一致：

```text
GOLDEN base: 2fa47f6048845af2fe4f14849cc0975eaf429663b6424f647b3f2eefdca136d1
GOLDEN HEAD: 2fa47f6048845af2fe4f14849cc0975eaf429663b6424f647b3f2eefdca136d1
```

[已驗證] 其中既有 `GOLDEN` 與 `ME_GOLDEN` 仍只有先前已核可 hunk，本批沒有重錄。

### 7.2 `data-testid`

以非空 `src/**/*.{js,ts,tsx}` scanner 比較 `0be31a2` 與 HEAD：

```text
baseline source files: 68
HEAD source files: 96
baseline data-testid assignments/set: 91/90
HEAD data-testid assignments/set: 91/90
added: (none)
removed: (none)
```

[已驗證] testid 集合逐值相同，沒有新增、刪除或改名。

### 7.3 其他凍結面

- 頁面 DOM 結構與文案未改。
- `syncCommit` 邊界未改。
- `dataApi` 邊界未改。
- `sessionRoute.js` 純函式未改。
- `sheets.js` 未改；F3-2／3B 沒有偷跑。

## 8. 測試結果

所有 Playwright 命令均沒有並發執行；標準矩陣的最終完整重跑結果如下：

| 指令 | 結果 |
| --- | --- |
| `npm run test:ci:frontend` | PASS；unit 308 passed；mock Playwright 282 passed／4 skipped；build 504 modules；main bundle `651949 / 190267` bytes，低於 `703886 / 203176` 上限。 |
| `npm run test:db` | PASS；7 files、799 tests。 |
| `npm run test:local` | PASS；API 2 passed；Playwright 44 passed／11 skipped；did not run = 0。 |
| `git diff --check 19deb6c HEAD` | PASS；無 whitespace error。 |

另做過的聚焦驗證：

- F3-1 導覽 desktop／mobile 加 React focus：12 passed。
- session hash 加導覽 desktop：5 passed。
- 未登入冷啟動與導覽 desktop／mobile：14 passed。
- 已登入冷啟動四象限相關兩條：2 passed。
- 既有 local session deep-link 兩條：2 passed，零修改。
- account-switch／signout 既有測試在三個交界修正後重跑全綠。

測試過程中曾各遇到一次既有案例的非重現 Playwright timing failure：pending withdrawal 流程的 context destroyed，以及 session-only close button 的 detached／unstable。兩者各自 `--repeat-each=3` 都通過，最後的完整標準矩陣亦乾淨通過，未以修改既有測試規避。

## 9. 最終狀態

```text
$ git status --short --branch
## main...origin/main [ahead 7]
?? docs/arch-dispatch-2026-08-25-batch3A-report-codex.md
```

`ahead 7` 包含既有派工單 docs commit `19deb6c` 與本批六個實作 commit。本回報依要求保持未提交；未 push。
