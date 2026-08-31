# 前端架構審查——二次確認與修訂意見

日期：2026-08-29
對象：`docs/arch-reports/frontend-architecture-review-2026-08-29.md`（以下稱「原報告」）
基準：HEAD `a14e81e`。working tree 的 untracked 檔只有原報告與本檔，兩者皆未入版。
用途：回應原報告 §15 的十三個二次確認問題，並修正其中與程式碼、與既有拍板決策不符之處

> 本文已經過三名 opus agent 的 read-back 驗收（逐條開檔複驗行號引用、數字一致性、過度宣稱）。
> 首版有 21 筆 FAIL，均已於本版修正；修正過程見 §11。

---

## 0. 一句話結論

原報告的**技術方向大致正確，但它不知道專案已經走完一整條 React ownership 收斂管線**。

批 0.5 至批 6 於 2026-08-26 至 08-28 全案完結。原報告 §13 階段 B 七項搬遷清單中的
**第 1、2、3、6 項**（Messages／Me／My Sessions／Discovery drawer）與 §9 的 surface 系統目標，
在 **roadmap 的判準下**已經完結。

但必須立刻補一句限定：roadmap 的完結判準是 **React ownership 收斂**（hooks 單源＋直接 portal＋
`main.js` 零頁面 mount 鏈），而原報告階段 B 的完成定義寫在它自己的 §16（query ownership、
route／deep link、feature 目錄）。**以前者宣告後者結案是不成立的**——原報告 §16 的驗收條件
目前一項都沒達成。詳見 §2。

原報告真正的價值，集中在它指出的五件確實還沒做的事：路由、server-state 邊界、CSS 層疊守門、
preload 策略、feature-first 目錄。其中前兩件在現行 bundle gate 下**不可執行**，必須先拍板預算。

---

## 1. 方法與證據分級

本文的證據分三級，全文嚴格套用：

- `[已驗證]`——主對話在本輪親自開檔複驗，附行號與原文。
- `[委派查證]`——由 subagent 以 Bash 實測後回報，附行號與原文引用；主對話未逐條重跑。
  其中經 read-back 第二次獨立複驗者另標 `[委派查證·已複驗]`。
- `[推論]` / `[不確定]`——未實測，或需要額外資訊才能定案。

查證分工：原報告 §15 的 Q1／Q2／Q4／Q5／Q8／Q10／Q13 七題各由一名 agent 實測；
四名 opus agent 對主對話先前的四項結論做對立審查（全部下修，見 §6）；
三名 opus agent 對本文首版做 read-back（21 筆 FAIL，見 §11）。

可複驗指令見附錄 A。未能定案的事項見附錄 B。

---

## 2. 「已完結」是什麼意思——兩把尺不能混用

總控文件是 `docs/arch-roadmap-2026-08-26-react-ownership.md`（346 行，2026-08-26 拍板）。
原報告完全沒有引用它。`[已驗證]`

### 2.1 roadmap 判準下已完結的部分

| 原報告 §13-B 項次 | roadmap 批次 | 狀態 |
| --- | --- | --- |
| 第 1 項 Messages | 批 1 | **ACCEPTED 2026-08-26**（Q2 拍板即「Messages-only 試點」） |
| 第 2 項 Me | 批 3C-1／3C-2 | **ACCEPTED 2026-08-26** |
| 第 3 項 My Sessions | 批 2A／2B | **ACCEPTED 2026-08-26** |
| 第 6 項 Discovery drawer | 批 3A／3B | **ACCEPTED 2026-08-26**（NearbyDrawer 全案完結） |
| §9 surface stack／backdrop／Escape／focus trap／restore 由 React 擁有 | 批 4C-1／4C-2／4C-3 | **ACCEPTED 2026-08-27**，`SurfaceHost` 已是單一 owner |
| §13-D「多數 mount bridge 可以刪除」 | 批 3 | slot 機制歸零、`pageViews.js` 刪檔 |
| §13-D「`syncCommit` 最好最終歸零」 | 批 5 | **ACCEPTED**，拍板**保留 2 個**，見 §3.2 |

**未涵蓋的是第 4 項（Player Directory／Presence）與第 5 項（Create／Edit／Join flows）。**
所以正確說法是「第 1、2、3、6 項」，不是「前四項」。

`src/sheets.ts` 目前 186 行 `[已驗證]`（批 6C 已將 `sheets.js` 轉為 `.ts`；HEAD 已無 `sheets.js`）。

### 2.2 但這不等於原報告階段 B 完成

roadmap 批 3 的條文明寫「controller／store 仍是 server state 權威」。也就是說那四頁完成的是
**UI ownership 收斂**，不是原報告要的 vertical slice。對照原報告 §16 的驗收條件：

| 原報告 §16 條件 | 現況 |
| --- | --- |
| server data 有明確 query ownership | 未達成（27 欄仍在同一個 store，見 §5 Q4） |
| deep link 行為由 route 擁有 | 未達成（仍是 `main.js` 手動 hash） |
| 依 feature 重整目錄 | 未達成 |

**所以 §2.1 的表格只證明一件事：原報告建議的那四個「起手點」，在 UI ownership 這一層已經沒有
東西可搬了。** 它們的 server-state 與 route 面向完全未動。這也是為什麼本文 §9 仍把原報告
§5.3／§5.4／§6 列為「成立且尚未處理」——兩節並不矛盾，是同一批頁面的不同層面。

**對原報告 §15 第 12 題（是否低估既有工作）的答覆：是，低估了整條 UI ownership 管線；
但原報告對「還有多少沒做」的判斷，在 server-state 與 route 這兩層上是對的。**

---

## 3. 原報告重提了三個已結案的決策

### 3.1 `@layer`：2026-08-19 批 10 已完整評估並否決

`[已驗證]` `docs/migration-reports/batch-10.md:112` 標題即「`@layer` 決策：**未做**，附三個實證反例」；
`:22` 寫「三個實證反例證明本站層疊『跨群組依賴特異性』，任何 layer 切法都會翻轉勝負」；
`:145` 寫「要安全導入 `@layer`，得先把上述跨群組特異性依賴改寫掉——那是行為變更重構」。
結論並複寫進 `src/main.js:2-7` 與 13 個 CSS 檔的檔頭。

三組跨檔特異性依賴 `[委派查證]`：

1. `src/sheet-shells.css:16-19,31-32,47-48` 的六個 `.surface.<sheet>`（0,2,0）
   vs `src/responsive.css:23` 的 `.surface`（0,1,0）
2. `src/motion.css:22` 的 `.band-option:active`（0,2,0）
   vs `src/map-page.css:233`（1,2,0）與 `src/surfaces.css:98`（0,3,0）
3. `src/style.css:33` 的 `button:disabled`（0,1,1）vs 元件層 `cursor` 宣告（如 `src/create-session.css:114`）

**更關鍵的是原報告 §10.1 的漸進策略方向是反的。** CSS Cascade Level 5 規定 unlayered 一般宣告
**優先於** layered 一般宣告。「第一階段只包住新 CSS」的實際效果是：新 CSS 在任何與既有規則
重疊之處**全面失效**，不論特異性多高；作者只能改用 `!important`，而 `!important` 在 layer 中
順序又是反轉的。這不是安全的第一步，是沉默失效的陷阱。

### 3.2 `syncCommit` 歸零：批 5 已拍板保留 2 個，附「移除即紅」實證

`[已驗證]` 生產 caller 恰為 2 處：`src/sessionStore.ts:102`、`src/app/SurfaceHost.tsx:251`。
roadmap 批 5 回填語：「caller files 維持 2（皆載重）、SurfaceHost 同步點 6→4」，兩個 caller
與四個保留點**全部附原始 oracle 實證**（`sessionStore`→`performance:416` race 3/3；
`commit(update)`→`map-and-bootstrap:377` decision identity），理由書在
`docs/arch-reports/batch-5-synccommit-retention-2026-08-27.md`。

原報告 §13-D 的「最好最終歸零」是在推翻一個已有反向實證的決策。若要重開，必須先推翻那兩份 oracle。

### 3.3 token 單一來源：已達成，原報告誤列為待辦

`[已驗證]` `src/session.css` 全檔 31 個 custom property 定義，是全庫唯一的 token 定義處；
`src/style.css:1` 雖然也是一條 `:root` 規則，但只 `var()` 引用、**不定義任何 token**。

原報告 §10.2「建立唯一 token 來源」是已完成事項。真正的待辦只是修正 `src/session.css:12`
那句不精確的註解（它宣稱自己是「全庫唯一的 `:root` 宣告」，應改為「全庫唯一的 token 定義處」）。

`ds-bundle/` `[已驗證]`：`src/`、`index.html`、`vite.config.*`、`package.json` 對它零引用，
但 git 追蹤 13 個檔。它是一次性交付快照，不構成雙重 token ownership 風險——這是原報告
§15 第 11 題的答案。建議明確標為唯讀或刪除。

---

## 4. 硬約束：bundle gate

`scripts/check-production-bundle.mjs:9-19` 定義**八個**硬性 byte 上限（main／lazy／Sentry／total
四類各一組 raw + gzip），掛在 `npm run test:ci:frontend` 上。

該 gate 以 `readdirSync(DIST_DIR, { recursive: true })` 遞迴掃描整個 `dist/`，
**total 口徑包含 `dist/push-sw.js`**——`:17` 的註解自己就寫「F4-3 total JS (including push-sw.js)」。
我以與 gate 相同的 `zlib.gzipSync` 預設設定、相同的遞迴口徑對帳 `[已驗證]`
（`dist/` 為 2026-08-29 00:21 產物，主 chunk 638,937 bytes，與原報告 §2 的 638.94 KB 吻合）：

| 項目 | 實測 | 上限 | 餘裕 |
| --- | ---: | ---: | ---: |
| 主 chunk raw | 638,937 | 658,867 | 19,930 |
| 主 chunk gzip | 187,466 | 192,420 | 4,954 |
| 全部 JS raw（23 檔，含 push-sw.js） | 841,561 | 849,961 | 8,400 |
| **全部 JS gzip** | **257,627** | **259,062** | **1,435** |
| 最大 lazy chunk gzip（MePage 4,949） | — | 5,500 | 551 |
| Sentry chunk gzip | 29,723 | 31,000 | 1,277 |

**最緊的是 total JS gzip 的 1,435 B**，其次是最大 lazy chunk 的 551 B。
這與 roadmap 批 4C-3 記錄的「total gzip 餘 1,465 B」互相印證（差額來自批 6C 的 −4 gzip 與
後續零 runtime 變更的 ESLint 管線）。

因為 total 是**總量**上限，「把新依賴放進 lazy chunk」不是逃生門——roadmap 的
「等觸發／不排」節已寫明這一點。

### 4.1 對 Router／Query 的結論

直接由硬數字論證，不需要估算套件體積 `[已驗證]`：

> **任何使 `dist/` 全部 `.js` 的 gzip 總和增加超過 1,435 B 的新 runtime 依賴，都會讓
> `npm run check:production-bundle` 翻紅。**

React Router v7 與 TanStack Query v5 的實際體積本輪**未實測** `[推論]`——一般量級分別約
15–20 KB 與 12–13 KB gzip，兩者都遠超 1,435 B，但這只是佐證，結論不依賴這個估計值。

因此原報告 §14「不要同時導入 Router、Query、Zustand、XState」方向對但強度不足：
在現行預算下，單獨導入其中任何一個都會翻紅。

roadmap 的 Q6 已把這件事列為待拍板：「bundle gate 是否允許重編、由誰批准 → 首個確有收益的
新依賴提案時」。`.claude/rules/react-migration.md:46` 明訂 production bundle gate 不得任意放寬
`[委派查證]`。**正確的先後是：先拍板預算或先釋放餘裕，再談 Router／Query。**

---

## 5. §15 十三題的實證答覆

### Q1 「單一 React root，但多個 UI owner」是否準確

**準確，但低估分散程度。** `[委派查證·已複驗]`

`src/app/App.tsx:759-762` 是全 `src/` 唯一的 `createRoot`，其 host 掛在 `document.body`。
`App()` 回傳的子節點中有 7 個是 `createPortal`；例外是 `:727` 的 `<SurfaceHost>`，
它是直接子節點，再由內部 `SurfacePortal`（`:230`）portal 出去。實際效果相同：
DOM 順序與堆疊仍由 `index.html` 決定，不由 React 決定。

以「會直接寫 DOM」為判準，實際是 **9 個 owner**。原報告列的 6 個有 1 個誤算、4 個漏掉：

- **誤算**：controller 不是 UI owner。`src/sessionController.ts` 與 `src/controller/*.ts`
  全掃 `document.`／`innerHTML`／`classList`／`querySelector` **零命中**。它是 view callback 的
  派工者，不擁有任何畫面。把它當成「要收回 React 的對象」會誤導重構方向。
- **漏項 1（最大）**：Google Maps 命令式層 `src/map.ts` + `src/pins.ts`。獨佔整個 `#map` 子樹、
  手工建構所有 marker DOM（`pins.ts:140-158`）、並注入 `<script>` 到 `document.head`
  （`map.ts:233`）。這是視覺面積最大、也最不可能被 React 收編的一塊——
  **原報告第一建議「讓 React 成為唯一的 UI owner」在此處事實上不可達成**，報告沒有承認這個例外。
- **漏項 2**：`src/modalIsolation.js:62-70`，全庫唯一對 `#app` 全部 children 寫 `inert` 的
  橫切 owner（`inert` 在 `src/` 只出現於此檔），跨越 React portal target 與 legacy 節點兩邊。
- **漏項 3**：`src/appErrors.ts:146`，把 `#app-error-notice` append 到 `document.body`，
  在 `#app` 之外、React 之外、也不在 modalIsolation 的掃描範圍內。
- **漏項 4**：`src/sessionActions.ts:137-146`，命令式協定直接寫 `disabled`（`:137`）／
  `textContent`／`hidden`（`:144-145`）。它的 caller 包含 React 元件本身
  （`src/sheets/SessionDetailSheet.tsx:375-383`，在 `runAsyncAction` 的 onSuccess callback 內）
  ——等於 React 元件在 render 之外改自己產出的 DOM。

另有四處「同一節點兩個 owner」的實質重疊，最典型的是 `src/main.js:695-713` 對
`#map-topbar-root`（`:697`）與 `#bottom-navigation-root`（`:705`）掛 delegated listener，
而其子節點由 `src/app/App.tsx:728-729` 的 portal 擁有；`main.js:695-696` 的註解明白承認
這是為了避開 React 重繪而刻意選的委派。

### Q2 哪些 bridge 可安全刪除

`[委派查證·已複驗]` 原報告與我先前都低估了既有拆分程度。

- `src/sessionViews.js` 是 **55 個 export**（不是 41）：39 個自有宣告 + 15 個從
  `sessionPresentation.ts` re-export（`:29-45`）+ 1 個從 `taipeiTime.ts`（`:625`）。
- 其中 **23 個有真實生產 caller**（全部來自 `main.js` 單一 importer 且逐一實際被呼叫）、
  12 個測試專用、**20 個完全零 caller 的死 export**。
- 真正自己寫 DOM 的只有 2 個：`renderPlayerLayerToggle`（`:196`）、`renderMapDataStatus`（`:213`）。
  其餘 21 個生產 live export 都是純委派。
- **我先前「約一半是純表單邏輯可外搬」的判斷成立，但搬錯了檔**：那 15 個純函式的真身在
  `src/views/sessionFormViews.js:51-350`，`sessionViews.js` 只是委派空殼。對該檔 1–350 行反掃
  `document`／`createElement`／`querySelector`／`innerHTML`／`addEventListener` 零實際 DOM 動作，
  第一個 surface 動作是 `:360` 的 `deferSurfaceOpen`。正確動作是「把 `sessionFormViews.js`
  前 350 行整段搬成 `src/features/session-form/`」，不是動 `sessionViews.js`。
- `src/views/` 四檔 33 個 export **零死 export**；`sheets.ts` 七個 export 全 live 且全是真 bridge；
  `SurfaceHost.tsx` 十個 export 只有 `SurfaceSlot`（`:70`，全庫零外部引用）是真死 export。

**最大的坑不是 UI 而是 gate**：`tests/session-presentation-boundary.test.js:21-35` 的
`RUNTIME_EXPORTS` 陣列與 `:153-157` 的 `Object.freeze` 計數斷言把 13 個 re-export 與
`sessionFormSheetRuntime` 釘死。UI 風險是零，但刪 export 會讓 gate 翻紅，必須同批改測試。

### Q3 Messages 是否最低風險的第一片

**這題已不適用**——Messages 的 UI ownership 是批 1（2026-08-26 ACCEPTED）。
若把問題改成「下一片該選誰」，見 §8——答案是**在 §4 的預算僵局解除前，沒有一個 vertical slice
可以開工**，因為 vertical slice 的定義本身包含 route 與 query ownership。

順帶更正我先前的說法：我曾主張「Messages 太小、證明不了什麼」。對立審查指出理由錯了
`[委派查證]`——原報告 §13-B 口中的「Messages」包含 chat surface，而 `SessionChatSheet` +
`chatController.ts`（247 行）扛著全庫最脆弱的 requestGate 過期閘、auth 紀元檢查、
10 秒靜默輪詢與樂觀已讀清零。結論偶然對，理由是反的。

### Q4 27 欄中哪些是 server state

`[委派查證]` 真正的遠端 payload **只有 7 欄**（26%）：`sessions`、`mySessions`、
`mySessionRosters`、`blockedPlayers`、`players`、`profile`、`courts`。

| 分類 | 欄數 | 欄位 |
| --- | ---: | --- |
| server-cache | 7 | sessions、mySessions、mySessionRosters、blockedPlayers、players、profile、courts |
| 衛星 status／error | 9 | discoveryStatus／discoveryMessage、mySessionsStatus／mySessionsError、blockedPlayersStatus／blockedPlayersError、playerLayerStatus／playerLayerMessage、courtsReady |
| orchestration | 2 | authEpoch、authSession |
| 純 UI | 4 | filters、drawerState、playerLayerOn、bounds（同時是 query key） |
| browser integration | 4 | userLocation、locationBlocked、locationMessage、mapUnavailable |
| 本地推導投影 | 1 | profileEligibility |

server-state cache 能吃掉的是 16 欄，不是原報告 §5.3 暗示的「大部分」。

三個不乾淨的邊界，遷移時最容易出錯：

1. `mySessionsError` 同時承載「我的球局查詢失敗」與「roster 子查詢部分失敗」兩種來源
   （`mySessionsController.ts:333` vs `:181`），cache 化後兩個查詢的錯誤會互相覆寫。
2. `mySessionsStatus` 被 `authController.ts:154` 在任何 fetch 發出**之前**就寫成 `"loading"`
   ——這是 gate 語意不是查詢語意，cache 的 `isLoading` 無法覆蓋。
3. `courtsReady` 是 `main.js:157` 那個 store 外部三態 `courtCatalogueStatus` 的 lossy 布林投影，
   且同時餵進 directory gate 判定（`profile.ts:50`），不能單純刪掉。

**原報告 §7.1 的候選清單有三項根本不在 store 裡**：roster 只有一半在 store、
chat messages 寫在 sheet 自己的 state（`chatController.ts:118`、`:127`）、
join preview 與 notification preferences 零欄位。混談會高估拆 store 的收益。

### Q5 TanStack Query 是否與現有機制衝突

**會，而且比原報告 §7.1 描述的更深。** `[委派查證]`

核心誤解是把 `requestGate` 當成取消機制。它其實是**結果落地閘門**：全庫**零 `AbortController`**，
從未真的取消過任何請求；判準是在 await 回來、要寫進 UI 的那一刻**現讀 live app state**
（sheet 還開著嗎、profile 還過 ntrp 門檻嗎、identity 還是同一個嗎）。這是 query key 表達不了的。

更關鍵：這些 gate 有 **10 個呼叫點掛在寫入路徑上** `[委派查證·已複驗]`
（`playerDirectoryController.ts:224/228/232`、`presenceFeature.ts:112/135`、
`notificationFeature.ts:100/121/151/167/176`），`useMutation` 沒有等價物。
直接刪會讓「切帳號後舊 mutation 回來，把 A 的結果寫進 B 的 UI」重新成為可能。

`authEpoch` 也不能 1:1 對應 query key scope：`authController.ts:118` 在 identity 變、
三級 profile gate 變、readiness 變時都 +1，是 identity 的**嚴格超集**。塞進 key 會讓每次
profile reload 把所有私人 query 連同聊天一起重取；只放 identity 又會失去 gate 降級保護。

**兩條隱私紅線是原報告完全沒提的**：

- `updateMyPresence` 若改成 `useMutation`，raw lat／lng 會留在 MutationCache 的 variables 裡
  （`presenceFeature.ts:87` → `privateDataRepository.ts:480`），直接踩 CLAUDE.md
  「raw GPS 座標只在前景 `watchPosition` 呼叫期間短暫存在」。
- 現況私人資料只活在 in-memory controller state，帳號切換是命令式清空
  （`authController.ts:146-157`）。進 QueryCache 後，`invalidateQueries` **不等於清除**，
  gcTime 會讓上一帳號的 my sessions／roster／blocked players 續存。必須寫死 `removeQueries`
  + 禁用任何 persister，並在 `tests/` 加掃描 gate 擋 `persistQueryClient` 進 `src/`。
  React Query Devtools 也絕不可進 production bundle——它會 dump 整個 cache。
  `scripts/check-production-bundle.mjs:20-34` 的字面黑名單目前只涵蓋 12 個示範暱稱與 E2E hook
  常數（同檔 `:89`／`:103` 另有 Sentry 與 private repository 的標記守門，但都不會攔到 devtools）。

分類清單：

- **可安全取代**：discovery 的 last-write-wins（`discoveryMapController.ts:137`、`:178`，
  兩處 `issue()` 都不帶 predicate）、三態樣板、detail join preview gate。
- **需保留**：上述 10 處寫入路徑 staleness guard、全域 `authRequestGate`（涵蓋 geolocation
  `watchPosition` 這類非 query 流程，`queryClient.cancelQueries` 管不到）、
  `mySessionsVersion` 的 query-of-query 雙重條件。
- **需重新設計**：`authEpoch` 拆兩層、帳號切換清 cache、chat 輪詢的 quiet／loud 雙模式與
  已讀副作用鏈、5 處 authoritative reload 的 epoch 綁定與錯誤分流。

### Q6 `syncCommit` 是否仍有原始測試證明不能移除

**是，見 §3.2。** 兩個 caller 都有「移除即紅」的原始 oracle，批 5 已審結。

### Q7 React Router 導入需要哪些相容處理

`[已驗證]` `vercel.json` **只有 `headers`，沒有任何 `rewrites`**。browser router（乾淨 URL）
上線前必須先加 SPA rewrite，否則深連結直接 404。原報告「可先用 hash router」的建議正確。

`src/sessionRoute.js` 只有 7 行，路由解析本身幾乎零成本；複雜度在 `main.js` 的頁面切換與焦點處理。
但見 §4——bundle 預算才是真正的前置條件。

### Q8 `authenticatedViewPreloads` 的實際成本

`[委派查證]` 13 個 preload 拉下 13 個 chunk 加共用 Avatar chunk，共 **14 個請求、
79,858 bytes min／28,532 bytes gzip**，約主 bundle gzip 的 15.3%。

三個發現比原報告的問法更有用：

1. **`src/main.js:687` 是死碼** `[已驗證]`。`init()` 是同步函式，`restoreAuth()` 要到 `boot()`
   才啟動，此刻 `sessionController.ts:196` 的初值 `authSession: null`——這行從未觸發過任何預載。
   真正的觸發點只有 `main.js:643` 的 `onAuthIdentityChange`，時機剛好與 Google Maps、
   discovery XHR、Sentry chunk 搶頻寬。
2. **repo 已經有 intent-based preload**：`sessionViews.js:601-618` 的 `preloadForIntent`
   掛在 `pointerover`／`focusin`（`:620-623`）。13 項裡有 7 項與它完全重疊，是純重工。
   原報告把 intent-based 當成未開工的提案，實際問題是「兩套機制並存」。
3. **優先序是反的**：全部 lazy chunk 中最大、也最常被點的 SessionDetailSheet
   （16,049／4,847 gzip）**不在**預載清單；而 ReportDialog（701 gzip）、
   WithdrawSessionConfirmationDialog（601 gzip）這種罕用終端動作每次登入都抓。

注意：不要把 13 項一律改成 hover 觸發。`pointerover` 在觸控裝置上幾乎與 tap 同時發生，
領先時間趨近 0；而 CLAUDE.md 的 release checklist 明訂 390px 手機檢查。行動端的正解是
idle-time 預載小集合。

**同時要說清楚：preload 改動不會釋放任何 bundle gate 餘裕。** gate 對 `dist/` 全部 `.js` 求和，
preload 只改「何時抓」，chunk 仍原樣留在 `dist/`。它的收益是首屏頻寬競爭，不是 gate。

### Q9 主 bundle 的實際組成

`[已驗證]` esbuild 獨立探針實測（探針已刪）：

| 依賴 | minified | gzip |
| --- | ---: | ---: |
| `@supabase/supabase-js` 全量 | 209,852 | 54,728 |
| `react` + `react-dom/client` | 193,475 | 60,335 |
| — `@supabase/auth-js` | 101,890 | **24,389** |
| — `@supabase/realtime-js` | 57,058 | 16,837 |
| — `@supabase/storage-js` | 28,075 | 7,232 |
| — `@supabase/postgrest-js` | 16,244 | 5,201 |
| — `@supabase/functions-js` | 3,349 | 1,525 |

對照主 chunk 638,937 raw／187,466 gzip：**第三方約佔六成**，app code 只剩約四成 `[推論]`
（esbuild 與 Vite 的 minify、tree-shaking、chunk 邊界都不同，比例是量級估算）。
所以拆 app code 對初始下載幫助有限。

**realtime／storage／functions 三者在 `src/` 完全未使用** `[已驗證]`：
`src/config.ts:32` 明寫「MVP 無 realtime 通道，靠輪詢+visibilitychange 補即時性」；
grep `.storage`／`.functions` 全庫零命中。

**且無法 tree-shake** `[已驗證]`：`node_modules/@supabase/supabase-js/src/SupabaseClient.ts:366`
無條件 `this.realtime = this._initRealtimeClient({...})`、`:388` 無條件
`this.storage = new SupabaseStorageClient(...)`；`dist/index.mjs:1-5` 對五個子套件都是
top-level import，且 `export * from "@supabase/realtime-js"`。

既有的 `docs/arch-reports/bundle-composition-2026-08-25.md:86-95` 列了**五個候選**：
defer 全 SDK（否決）、defer React runtime（否決）、`manualChunks`（否決為效能手段）、
defer authenticated repository implementations（**implement first**，已落地）、
defer private feature helpers（reassess）。**沒有任何一個是「不載入用不到的子套件」**
`[委派查證·已複驗]`——這是未被評估過的方向，見 §7 B1。

### Q10 `@layer` 能否漸進導入

**不能，且已於 2026-08-19 裁決。見 §3.1。**

真正低風險的第一步不是 `@layer`，是**替現在完全沒有自動化守門的 import 次序補一個 gate**
`[委派查證]`：目前只有三層人工註解在守 `src/main.js:8-20`，
`tests/content-visibility-contract.test.js:7` 只斷言三個檔存在、不管次序。

### Q11 `ds-bundle` 的性質

**一次性交付快照，前端零 consumer。見 §3.3。**

### Q12 是否低估既有工作

**是，但需要分層看。見 §2。**

### Q13 是否有因素使建議順序不適合

`[委派查證]` 三個硬性因素：

1. **效能**：bundle gate，見 §4。階段 A 第 1 條「建立 Router」當場翻紅。
2. **隱私與程式碼分割**：階段 C 要刪的「legacy DOM contract test」中，至少四支是目前唯一在守
   「匿名不得下載 private repository 模組」「`syncCommit` 只有兩個核可 caller」
   「lazy sheet／page 名冊」「LINE 聯絡面零殘留」的白箱 gate，且直接以
   `src/sessionViews.js`／`src/main.js`／`src/app/App.tsx` 的**字面內容**為讀取標的。
   刪 bridge 等於同時拆守門。正確順序必須是「新 gate 綠 → 舊 bridge 刪 → 舊 gate 刪」，
   不是原報告寫的同步刪除。
3. **可存取性**：`index.html` 的 aria-live 節點是**刻意不進 React** 的決策
   （`src/main.js:310-314` 明寫「掛在會被摧毀重建的節點上，AT 不保證會註冊到它」）。
   階段 D「App 是正常 component tree」正好會把它們搬進 React，而現有測試只斷言屬性存在、
   不斷言「不得被重建」——**這個回歸不會被任何 gate 攔到**。

另外階段 D「main 只負責建立 root 與 providers」與
`tests/app-errors.test.js:112`「App must own exactly one React root」直接相斥。

安全面則相反於直覺：CSP 的 `style-src` 與 `script-src` **都已含 `'unsafe-inline'`**，
所以 CSS-in-JS／inline style 不會踩 CSP。真正的缺口是 CSP 為 Report-Only 且
`tests/security-headers.test.js:69` 明令不得有 report 端點——新增任何 CDN 或 connect 來源
都會靜默通過、零訊號。

---

## 6. 本次二次確認自身的更正

以下四項是主對話先前的結論，經四名 opus agent 對立審查後**全部下修**。一併記錄，
避免錯誤前提被後續派工沿用。

### 6.1 【錯誤】「controller 的 view callback 在 `controllerContracts.ts:298-303`，共 6 個」

`[已驗證]` **方向與數量都錯。** `controllerContracts.ts:273` 的註解明寫
「`createSessionController()` return object 的公開方法」，`:274` 是 `interface ControllerApi`
的宣告行。那 6 行是 controller **對外回傳、由 React／main.js 呼叫**的入口，
方向是 view → controller，與「controller 決定開哪張 sheet」相反。
同一介面內同類的 `open*` 成員實為 11 個，`:298-303` 只是字母排序區塊被切了一半。

真正的 controller → view 決策權在 `SessionControllerOptions`
（`src/sessionController.ts:100-131`），其中 `open*` 有 **12 個**（`:106-120`），
由 `main.js:611-635` 注入；加上 3 個 render port 與 `promptProfile`／`showCreatedSession`／
`toast`，注入型 UI port 共 18 個。

而且**收掉這 12 個也不夠**。controller 還握有四條與 callback 無關的 UI 決策通道
`[委派查證]`：

- `surfaceRegistry`（`sessionController.ts:222-240`，11 個具名 surface）
- `SURFACE_TRANSITIONS`（`:242-296`，15 條具名轉場，連 `restoreFocus: false` 與 `reason` 字串都在裡面）
- 15 個對已開啟 surface 的命令式 setter 呼叫點（`setJoinPreview`／`setState`／`setArchived`／
  `setCourts`／`setDirectory`／`setInvitableSessions`／`setTerminal`／`enterConfirming`），
  完全繞過 React props
- `SessionDetailHandlers`（`:67-85`，**17 個成員**——含 6 個呈現旗標與 8 個 callback，
  由 controller 在 `:533-565` 的 `openSession` 呼叫中組裝，同樣是 17 個 key）`[已驗證]`

外加一條反向耦合：`discoveryPollIsActive()`（`discoveryMapController.ts:162-175`）
讀 `surfaceRegistry` 決定要不要輪詢——資料層決策直接讀「哪張 sheet 開著」。

至於 store 的 emit 通道：channel 只有 courts／map／me／mySessions 四條
（`controllerContracts.ts:179-184`，`:176-177` 的註解自稱「沒有隱藏的第四種事件」），
是正當的 state 通道，**不算 ownership 洩漏**。

### 6.2 【過度宣稱】「刪 bridge 的成本在測試，測試改寫是先決條件」

`[委派查證·已複驗]` 方向對，四個環節過度宣稱：

- **111 掛錯對象**：全 `tests/` 的 `__importAppModule(` 呼叫共 110 處（不含定義），
  其中**只有 86 處傳 `"sessionViews"`**；其餘 **24 處**指向 mockData(9)／sheets(4)／
  sessionController(3)／filters(3)／map(2)／dataApi(2)／supabaseClient(1)，不受 bridge 退役影響。
  虛增約 28%。（原報告若引用 111，是含定義處的口徑；roadmap 自批 5 起的官方基準是 110。）
- **兩側計量單位不對稱**：生產側用「檔案數」得 1，測試側用「呼叫點數」得 110。改用同一單位——
  生產側 `main.js:87-111` 一次匯入 23 個 symbol，測試側 86 處只用到 **15 個相異 symbol**。
  以 symbol 計，測試耦合面比生產側**還窄**。
- **因果講反了**：`src/views/` 四模組靠注入設定才能運作，而唯一的 configure 呼叫者是
  `sessionViews.js` 的**模組頂層副作用**（`:383`／`:424`／`:439`／`:640`，四行皆在第 0 欄，
  而 `configureSessionViewModules` 起於 `:241`、止於 `:250`，四個呼叫都在其外）`[委派查證·已複驗]`。
  測試今天能透過 bridge 拿到可用 surface，是因為 import 這個動作本身完成了 wiring。
  所以**生產側 wiring 搬遷才是先決條件**，測試改名只能跟在後面。
- **對原報告 §13-C 的指控證據不足**：`:450` 原文是「每完成一個 feature，應**同步**刪除」，
  bullet 未宣告先後，且該 bullet 自己已寫「或改寫成使用者行為測試」。

**真正具備先決條件性質的只有 2 個檔案的結構 gate**：
`tests/react-surface-lifecycle.test.js:12`（`readFileSync` 整個 `sessionViews.js`）、
`:133`／`:143`／`:144`，以及 `tests/session-presentation-boundary.test.js:94-163`。
它們在**第一次重構動到檔案時就會紅**，不是等到退役才紅。

修正後的措辭：把這些結構 gate 單獨提前，列為階段 A 的凍結項；其餘測試改名屬跟隨項。

### 6.3 【過度宣稱】「換成 postgrest-js + auth-js 可回收 25.6 KB gzip」

`[委派查證]` **診斷成立，處方不成立。**

- 診斷成立：無法 tree-shake（§5 Q9 已親自複驗建構子）、三者零使用、量級大致對。
- **節省被高估**：上線走 brotli。真實主 bundle brotli 為 156,777 bytes；以兩個獨立
  esbuild bundle 對照，實際節省是 27,082 gzip／**22,206 brotli**。真實 over-the-wire
  節省約 20 KB，不是 25.6 KB。
  （方法論警告：複驗此題**不能用 concat**——brotli 的 4 MB 視窗會把重複內容壓到近乎零。）
- **處方代價被低估**：`supabase-js` 對子套件是**精確版本鎖定**（`package.json` 全部 `"2.110.0"`
  非 caret），拆開後升級相容性自己扛、官方不支援；`PostgrestClient` 的泛型是四參數，
  strict TS 下要手工組合以取代注入型別（`dataRepository.ts:36`、`privateDataRepository.ts:103`、
  `authApi.ts:11`，泛型參數是 `RepositoryDatabase`）；測試 harness
  （`tests/fixtures/localSupabase.js:1,22,29`）要跟著改，並須重跑 `test:local` 驗 PKCE／
  `detectSessionInUrl`／token refresh 三條路徑。

**結論改為：走 alias 替身，不走 client 重組。** 但替身**不是 no-op**，見 §7 B1 的介面契約。

### 6.4 【過度宣稱】「第一片改用 Withdraw + Report」

`[委派查證]` 這兩個 dialog 結構上確實跑完整條 surface 管線
（`sessionViews.js:80/84` → `sessionSurfaceViews.js:363/411` 含 `deferSurfaceOpen` →
`mountDialog` → `mountSurfaceContent` portal → `syncCommit` → `main.js:634-635`）。

**但它們不是 vertical slice。** 兩個檔案的原始碼註解自述
（`WithdrawSessionConfirmationDialog.tsx:9-13`、`ReportDialog.tsx:5-11`）
「this component declares no state, so it never re-renders」——是全庫僅有的兩個零 React state 的
surface。伺服器狀態完全不在它們身上：withdraw 的 RPC 編排整段在
`lifecycleActionsController.ts:128`／`:278`，report 的 auth 閘門與三個進入點整段在
`sessionController.ts:724-784`。搬它們**一行 server state 都不會移動，一個 route 都碰不到**，
對照原報告 §16 的驗收條件命中 0 項。

它們符合的是原報告 §13 **階段 A 第 3 點**「建立新的 SurfaceProvider，但先只接一個低風險 surface」
——橫向的 surface 層試點，不是階段 B 的 vertical slice。

刪除收益也小：`mountDialog`／`sheets.ts`／`SurfaceHost` 都刪不掉，因為另外 12 個 surface 共用
`mountSurfaceContent`；14 個 surface 只薄 2 個。

---

## 7. 可立即執行的動作（按風險排序）

### 低風險

| # | 動作 | 位置 | 備註 |
| --- | --- | --- | --- |
| A1 | 刪死碼 preload 呼叫 | `src/main.js:687` | `authSession` 恆為 null，零行為變化 |
| A2 | `SurfaceSlot` 取消 export | `src/app/SurfaceHost.tsx:70` | `src/` 與 `tests/` 零外部引用 |
| A3 | 刪 7 個零 caller 死 export | `src/sessionViews.js:47,98,104,116,120,140,628` | `sessionFormSheetRuntime` 降級為模組私有，須同批改 `session-presentation-boundary.test.js:153-157` |
| A4 | 刪 13 個零 caller presentation re-export | `src/sessionViews.js:29-45` | 保留 `messagesFromGroups`、`nearbySessionsSummaryText`；須同批改 `:21-35` 的 `RUNTIME_EXPORTS` |
| A5 | 清失效鷹架 | `src/sessionViews.js` 10 組 `// F2D freezes…` + `// prettier-ignore` | 其宣稱凍結的掃描 gate 在 `tests/` 已零 hit |
| A6 | 補 CSS import 次序 gate | 針對 `src/main.js:8-20` | 三拍驗收：存量綠 → 調換兩行驗紅 → 還原綠 |
| A7 | 修 token 註解措辭 | `src/session.css:12` | 「唯一 `:root` 宣告」→「唯一 token 定義處」 |
| A8 | `ds-bundle/` 標唯讀或刪除 | — | 零引用、13 個 tracked 檔 |
| **A9** | **落實原報告 §13 階段 A 第 4 點的凍結條款** | 新增掃描 gate | 見下方說明 |

**A9 補充**（首版遺漏，read-back 指出）：原報告 §13 階段 A 第 4 點「新功能不得再新增 legacy
renderer 或 `innerHTML` 路徑」是全份原報告成本最低的一條——零 bundle 成本、不受 §4 僵局阻擋、
可直接寫成掃描 gate，而專案已有大量同型 gate 可沿用。裁決：**成立，建議立刻做**。
範圍需排除 §5 Q1 點名的既有例外（`map.ts`／`pins.ts` 的 Maps 命令式層、
`sessionViews.js:213` 的 `renderMapDataStatus`），以既有清單白名單化。

### 中風險

| # | 動作 | 位置 | 備註 |
| --- | --- | --- | --- |
| B2 | preload 清單 13 → 2 | `src/sessionViews.js:544-558` | 只留 ProfileCompletionSheet + SessionDetailSheet；省 11 請求／21,473 B 傳輸量。**不影響 gate 餘裕** |
| B3 | preload 包 `requestIdleCallback` | `src/sessionViews.js:595-597` | 避免與 Maps／discovery 搶首屏頻寬。**不影響 gate 餘裕** |
| B4 | 純表單邏輯外搬 | `src/views/sessionFormViews.js:38-350` → `src/features/session-form/` | React sheet 側零改動（靠 `:381-401` props 注入，不是 import） |
| B5 | 拆 `mySessionsError` 雙來源 | `src/controller/mySessionsController.ts:181` | server-state 化的前置清理 |
| B6 | `#band-options` ID 降 class | `src/map-page.css:214-236` | 消掉全庫最大一團 ID 特異性 |

### 高風險（原列中風險，經 read-back 上調）

**B1：Supabase 未使用子套件替身**

目標：把 `@supabase/realtime-js`／`storage-js`／`functions-js` 以 Vite `resolve.alias` 換成替身模組。
預估釋放 **20–24 KB gzip** `[推論]`——esbuild 探針量到三套件獨立 bundle 合計 23,537 gzip，
但那不是「套上 alias 後跑 `npm run build`、再用 gate 自己的 `gzipSync` 量」的數字，
兩者 minifier、tree-shaking 與 chunk 邊界都不同。**這個數字必須以實際 build 複驗才能寫進拍板文件。**

**替身不是 no-op。** `[已驗證]` `SupabaseClient.ts` 對三者的內部呼叫點：

| 位置 | 呼叫 |
| --- | --- |
| `:366` | `this.realtime = this._initRealtimeClient({...})` |
| `:376` | `.then((token) => this.realtime.setAuth(token))` |
| `:388` | `this.storage = new SupabaseStorageClient(...)` |
| `:396` | `this._listenForAuthEvents()` |
| `:404` | `new FunctionsClient(...)` |
| `:516`／`:530`／`:550`／`:567` | `this.realtime.channel／getChannels／removeChannel／removeAllChannels` |
| `:652`／`:654` | `this.realtime.setAuth(token)` / `setAuth()` |

關鍵風險：`src/supabaseClient.js:13-21` 的 `createClient` **未傳 `accessToken` 選項**，
所以 `:396` 的 `_listenForAuthEvents()` **必然執行**，`:652`／`:654` 會在每次
SIGNED_IN／SIGNED_OUT 觸發；而該處設 `autoRefreshToken: true`，TOKEN_REFRESHED 會週期性
再觸發同一行。**照字面做 no-op 必炸。**

替身至少須提供 9 個具名 export：`RealtimeClient`、`StorageClient`、`StorageApiError`、
`FunctionsClient`、`FunctionsError`、`FunctionsFetchError`、`FunctionsHttpError`、
`FunctionsRelayError`、`FunctionRegion`。其中 `RealtimeClient` 與 `StorageClient` 必須可 `new`
（storage 收 4 個參數），且 `RealtimeClient` 必須實作可用的 `setAuth(token?)`。

**風險上調為高的第二個理由：驗證覆蓋是空的。** `vite.config.ts:28-31` 的既有 alias 模式帶條件
`command === "build" && mode === "production"` `[已驗證]`。照抄會讓替身**只在唯一沒有任何測試
執行它的那個 build 生效**——dev、`test:mock`、`test:local` 全部載入真套件；
`check-production-bundle` 只量 byte 與 grep 字面黑名單，不執行 bundle；
Vite alias 是 bundler-only，`tsc` 仍解析真 `.d.ts`，`npm run typecheck` 對替身形狀零覆蓋。
合起來是一個「只在生產環境、只在登入或 token 續期時才爆，且三條測試管線都攔不到」的失效面。

**因此 B1 必須連同驗證設計一起派工**：替身在 `test:local` 亦生效，或新增一條實跑登入與
token 續期的 gate。缺這一項不得開工。

### 需先拍板

| # | 事項 | 為何不能直接做 |
| --- | --- | --- |
| C1 | bundle 預算重編 | `.claude/rules/react-migration.md:46` 明訂不得任意放寬；Q6 已列待拍板。**Router／Query 都卡在這** |
| C2 | 延遲載入 auth／private client 路徑（原報告 §11 第 4 項） | 見下方 |
| C3 | `courtsReady` 與 `courtCatalogueStatus` 合併 | 會動到 directory gate 判定（`src/profile.ts:33-50`） |
| C4 | aria-live 節點是否可進 React | 現有測試不斷言「不得被重建」，回歸不會被攔到 |

**C2 補充**（首版遺漏，read-back 指出）：原報告 §11 第 4 項建議「驗證是否能把只在登入後需要的
auth/private client 路徑延遲載入」，本輪**未評估**。這個候選不小——§5 Q9 的表格顯示
`@supabase/auth-js` 單獨就是 **24,389 gzip**，比 B1 三個套件加總的 23,537 gzip 還大。
因此**不能宣稱 B1 是唯一能釋放 gate 餘裕的手段**；C2 至少同量級，只是可行性未查
（匿名 discovery 是否真的完全不需要 auth client、PKCE 回調時序如何處理，都待確認）。
建議與 B1 一併評估後再決定投入順序。

原報告 §11 第 6 項（用真實瀏覽器量測 LCP／INP／parse 時間）同樣未回應。
本文 §4／§8 的所有論證都建立在**下載預算**上，沒有任何一項有真實裝置的效能數據支撐——
這是本文最大的證據缺口，建議在投入 B1／C2 前先補一次基線量測。

---

## 8. 建議的下一條管線

roadmap 在批 6F 回填處寫的下一步是「ESLint Phase A → 鄰接 `.js` 九檔小批 →
`main.js`／`sessionViews` 收尾」。ESLint 管線已於 HEAD `a14e81e`（今日）全案完結，
所以現在正是決定下一條管線的時點。

1. **零風險清理批**：§7 的 A1–A9。不需任何拍板，可立刻派工。其中 A9 是原報告的建議，
   應優先——它防止問題繼續增生。
2. **量測基線批**：C2 的可行性評估 + 原報告 §11 第 6 項的真實裝置量測。
   **這批要先於任何 bundle 改動**，否則後續投入沒有判斷依據。
3. **bundle 釋放批**：B1（含驗證設計）或 C2，依第 2 批的結果擇一或並行。
   目標是把 total gzip 餘裕從 1,435 B 拉到足以容納一個 router 或 query 套件；
   實際可釋放量需以套上改動後的 `npm run build` + `check-production-bundle` 實測，
   不採信 esbuild 探針估算。
4. **結構 gate 移植批**：把 §6.2 點名的 2 個檔案的 gate 從「讀 `sessionViews.js` 字面」
   改成讀新的 manifest。這是任何 bridge 退役的真正前置。
5. **wiring ownership 批**：把 `sessionViews.js:383/424/439/640` 那四個 top-level configure
   副作用搬出。這才是 bridge 退役的卡點（§6.2）。
6. **第一個真 vertical slice**：**在第 3 批解除預算僵局前不建議開工**——vertical slice 的
   定義（原報告 §16）包含 route 與 query ownership，兩者都需要新依賴。

候選的已知阻礙，供第 3 批完成後選用：

| 候選 | 阻礙 |
| --- | --- |
| Player Directory | **耦合最深，不是最鬆**：`playerLayerOn` 經 `main.js:291-298` 餵進 `map.ts:547` 的 `renderPlayerPins`，畫在 §5 Q1 認定「React ownership 事實上不可達成」的 Maps 命令式圖層上；`renderPlayerLayerToggle` 是 §5 Q2 點名僅有的 2 個真寫 DOM 的 export 之一；12 個 `open*` port 中有 4 個屬它 `[委派查證]` |
| MePage | lazy chunk gzip 4,949／上限 5,500，**只剩 551 B 餘裕**，且 roadmap 批 3C-1 已下「hooks 嚴禁放頁面 chunk」硬約束。要在它身上驗 Router + query ownership，兩邊都貼著上限 |
| Chat／Messages | `requestGate` 與 auth epoch 最脆弱處（§5 Q5），應留到最後 |
| Create／Edit／Join（原報告第 5 項） | 未查證。是四個候選中唯一沒有已知結構性阻礙的，但也代表未知最多 |

**我先前推薦 Player Directory 與 MePage 是錯的**，理由與本文 §4、§5 的查證相斥，在此撤回。

另外原報告 §6 的 feature-first 目標結構本身沒問題，但它漏了一件事：**`src/` root 現有
40 多個散檔**（`sessionActions`、`sessionCriteria`、`sessionIntent`、`sessionPresentation`、
`sessionRoute`、`sessionSelectors`、`sessionStore`、`filters`、`profile`、`pins`、`map`、
`meFocus`、`nearbyDrawerFocus`、`mySessionsCreatedFocus`…）。這一層比任何被點名的大檔都更難
導航，是 feature-first 重組時第一個該處理的。

---

## 9. 原報告仍然成立且有價值的部分

- **§5.1 UI ownership 分散：成立，且比報告寫的更嚴重。** 本文 §5 Q1 的裁決是「準確，
  但低估分散程度……實際是 9 個 owner」。這是本文對原報告最強的一次背書。
- **§5.2 核心檔案責任過多：成立，且本文 §6.1 提供了加強證據。** `sessionController` 除了
  12 個注入 callback，還握有 `surfaceRegistry`（11 surface）、`SURFACE_TRANSITIONS`（15 條轉場）、
  15 個命令式 setter 呼叫點、`SessionDetailHandlers`（17 成員）——正是「同時負責 dependency
  wiring、server request orchestration、UI state、surface 開關」的實例。
- **§5.3 server 資料與 UI 狀態混住：成立且尚未處理。** roadmap 沒排進任何批次。
- **§5.4 路由是手動實作：成立且尚未處理。**
- **§5.5 CSS 依賴檔案順序：主體成立，但有一句要切割。** 「新增樣式需先理解全域順序」
  「ID selector 與 responsive override 互相影響」成立；但「tokens 分布在不只一個 `:root`」
  **不成立**——見 §3.3，token 定義只有一處。
- **§5.6 preload 效益可能被提早消耗：成立**，且比報告想的更值得修（見 §5 Q8）。
- **§6 feature-first 目錄：成立且尚未處理。**
- **§11 第 4 項（延遲載入 auth／private client）：成立且未評估**，見 §7 C2。
- **§11 第 6 項（真實瀏覽器量測）：成立且未回應**，是本文最大的證據缺口。
- **§12 不建議改 Next.js：判斷正確**，理由也對；roadmap 的 Q5 已把重評條件列為待拍板。
- **§13 階段 A 第 4 點（凍結新 legacy renderer）：成立，且是全份報告成本最低的一條**，
  已納入 §7 A9。
- **§14 的八條「不建議做的事」：全部成立**，其中「不要先搬資料夾再處理 ownership」
  與「不要為了消除 Vite 警告改 chunk 名稱」尤其切中本專案的歷史教訓。

未回應的一項：**§10.3「新功能採局部樣式」**。本文的 CSS 動作（A6／A7／B6）都只處理症狀，
沒有回答「新 feature 該用什麼樣式隔離手段」這個治本問題。需注意的既有約束是
`tests/contrast-tokens.test.js:29,33` 要求 `src/*.css` 維持 ≥13 個檔、去註解後 >70,000 字元，
且 `tests/content-visibility-contract.test.js:18-47` 比對全域 selector——CSS Modules 的雜湊
class 會讓這些斷言永久失效，導入前必須先改寫這兩支 gate `[委派查證]`。

---

## 10. 對原報告作者的回覆要點

若要回覆原報告作者，最短路徑是三份文件：

1. `docs/arch-roadmap-2026-08-26-react-ownership.md`——說明 §13 階段 B 的第 1／2／3／6 項在
   UI ownership 層已完結，以及 §9 的 surface 目標已由批 4C 達成。
2. `docs/migration-reports/batch-10.md` §3——`@layer` 已於 2026-08-19 評估並否決，附三個反例。
3. `scripts/check-production-bundle.mjs:9-19` 與本文 §4 的對帳表——說明階段 A 第 1 條為何
   在預算解除前不可執行。

同時應肯定它正確指出的五件事（§9），並邀請它針對「server-state 邊界」與「route ownership」
這兩個真正的空白提出更具體的方案——那是它最有價值、也最沒有被既有管線覆蓋的部分。

---

## 11. 本文首版的修正紀錄

首版由三名 opus agent 做 read-back，21 筆 FAIL、16 項 blocking，已全部處理。主要修正：

| 類別 | 首版 | 本版 |
| --- | --- | --- |
| total JS 餘裕 | raw 9,362／gzip 1,921 | **raw 8,400／gzip 1,435**（首版指令漏掃 `dist/push-sw.js`，而 gate 註解 `:17` 明寫含它） |
| gate 常數個數 | 六個 | **八個**（四類 × raw/gzip；首版漏 Sentry 兩條，表格也只列五列） |
| `SessionDetailHandlers` | 19 欄 | **17 個成員** |
| requestGate 寫入路徑呼叫點 | 12 個 | **10 個** |
| `__importAppModule` 非 sessionViews 部分 | 25 處／虛增 29% | **24 處／虛增 28%**（首版與自身細目 9+4+3+3+2+2+1 矛盾） |
| `bundle-composition` 候選 | 三個、全部否決 | **五個**，其中三個否決、一個 implement first、一個 reassess |
| §13-B 完結項次 | 「前四項」 | **第 1／2／3／6 項**（首版把第 4、5 項誤算為已完結，卻又在 §8 推薦第 4 項當下一批） |
| 「完結」定義 | 未區分 | **切開 roadmap 判準與原報告 §16 判準**（見 §2.2） |
| `sheets.js` 殘餘 134 行 | 照抄 roadmap 舊狀態並標 `[已驗證]` | **`sheets.ts` 186 行**（批 6C 後已無 `.js`） |
| B1 描述 | 「no-op stub、`src/` 一行不改、中風險可逆」 | **介面相容替身、9 個具名 export、`setAuth` 必須可用、風險上調為高、須連同驗證設計派工** |
| §8「餘裕拉到約 21 KB」 | 無推導，且把 B2／B3 的流量效益當 gate 效益 | **刪除該數字**；明說 preload 不影響 gate；改為「須以實際 build 實測」 |
| 「B1 是唯一能釋放餘裕的手段」 | — | **刪去「唯一」**，補 C2（auth-js 單獨 24,389 gzip，比 B1 三套件加總還大） |
| vertical slice 推薦 | Player Directory 或 MePage | **撤回**；改為列出各候選已知阻礙，並說明預算僵局解除前不建議開工 |
| Router／Query 論證 | 以未實測的套件體積論「當場翻紅」 | **改以 1,435 B 硬數字論證**，體積估計降為佐證並保留 `[推論]` |
| 遺漏回應 | — | 補 §5.2、§10.3、§11 第 4／6 項、§13 階段 A 第 4 點（A9） |
| §9 清單 | 漏 §5.1 | **補入**，並切割 §5.5 中與 §3.3 相斥的一句 |
| 證據分級 | 裸 `[已驗證]` 與 `[已驗證，我親自複驗]` 混用 | **統一為 §1 的三級制**，`[委派查證]` 明確標示 |
| 行號 | `main.js:695-697`、`controllerContracts:274`、`sessionController:533-556`、`dataRepository.ts:1` | `:695-713`、`:273`、`:533-565`、`:36`／`:103`（泛型為 `RepositoryDatabase`） |

read-back 同時確認首版 51 筆行號引用中有 51 筆內容成立（含 PARTIAL 的範圍微調），
未發現任何造假引用。

---

## 附錄 A：可複驗指令

```bash
# bundle gate 對帳（必須遞迴掃 dist 全部 .js，含 push-sw.js——與 gate 同口徑）
node -e '
const fs=require("fs"),z=require("zlib"),p=require("path");
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p.join(d,e.name)):[p.join(d,e.name)]);
const js=walk("dist").filter(f=>f.endsWith(".js"));
let R=0,G=0;for(const f of js){const b=fs.readFileSync(f);R+=b.length;G+=z.gzipSync(b).length;}
console.log("files",js.length,"total raw",R,"gzip",G,"| 餘裕 raw",849961-R,"gzip",259062-G);'

# Supabase 子套件體積（探針放 repo root，跑完必刪）
printf 'import * as M from "@supabase/realtime-js"; console.log(M);\n' > .probe.mjs
npx esbuild .probe.mjs --bundle --minify --format=esm --outfile=/tmp/probe.js && gzip -c /tmp/probe.js | wc -c
rm -f .probe.mjs

# 白箱直呼點計數（官方基準口徑：排除定義處）
grep -rho "__importAppModule(" tests | wc -l                  # → 110
grep -rho '__importAppModule("sessionViews")' tests | wc -l   # → 86（指向 bridge 的子集）

# 確認 supabase-js 無法 tree-shake，以及替身必須實作哪些呼叫
grep -nE "this\.realtime\.|this\.storage|_listenForAuthEvents" node_modules/@supabase/supabase-js/src/SupabaseClient.ts
head -5 node_modules/@supabase/supabase-js/dist/index.mjs

# SessionDetailHandlers 成員數
sed -n '67,85p' src/sessionController.ts | grep -cE "^\s+[a-zA-Z]+[?]?[(:]"
```

## 附錄 B：未能定案的事項

依承重程度排序（承重者在前）：

1. **B1 的實際節省量未以真實 build 驗證。** §7 B1 的 20–24 KB 來自 esbuild 獨立探針，
   不是套上 alias 後跑 `npm run build` 再用 gate 的 `gzipSync` 量。兩者 minifier、
   tree-shaking 與 chunk 邊界都不同。這個數字是整條「解除預算僵局」論證的承重點。
2. **C2（延遲載入 auth／private client）的可行性完全未查。** 匿名 discovery 是否真的不需要
   auth client、PKCE 回調時序如何處理，都待確認。而它的量級（24,389 gzip）大於 B1。
3. **真實裝置效能基線不存在。** 本文所有論證都建立在下載預算上，沒有 LCP／INP／parse 時間資料。
4. **React Router 與 TanStack Query 在本 repo 打包後的實際體積未實測**（`package.json` 無此依賴）。
   §4.1 的結論不依賴這個估計值，但若要寫進拍板文件應先 `npm install` + `build` 實測。
5. **TanStack Query v5 的 `focusManager`／`refetchIntervalInBackground` 精確語意未查證官方文件。**
   已確認現有 poller 兩個條件不對稱（`requestGate.ts:53` 用 `=== "visible"`、`:59` 用
   `!== "hidden"`），故「行為不等價、需逐案比對」成立；差在哪幾個 edge case 未定。
6. **`bounds` 歸類為「client state 但同時是 query key」**，依據是它唯一寫入點
   （`discoveryMapController.ts:139`）同時餵給 discovery 與 players 查詢。若產品希望地圖視窗
   保有獨立於查詢的 UI 語意，此判定需重看；未找到現存需求文件可定案。
7. **`profile` 的樂觀本地 patch**（`presenceFeature.ts:113/:136`、`sessionController.ts:688`）
   在 cache 化後應改 optimistic update 還是 invalidate-after-mutation，屬設計取捨，未定。
8. **`tests/` 是否已有測試在斷言 `requestGate`／poller 的具體行為**，未逐檔盤點。
9. **各 lazy chunk 的 hosted 真機預熱行為**（批 4B 遺留的 `AdvancedMarker` title 事件路徑）未驗。
