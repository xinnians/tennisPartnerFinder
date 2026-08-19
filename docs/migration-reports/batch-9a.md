# 批 9a：sessionController 狀態 store 化（自製 minimal store，對外 API 凍結）

- 基準 HEAD：`48d8273`（docs-only，`git diff 36593fd HEAD -- src/` 為 0 行；`e43f0b7` 在鏈上）
- 產出：`src/sessionStore.ts`（新增，54 行）、`src/sessionController.js`（222 insertions / 212 deletions）
- `tests/**` 零修改零新增；工作樹僅上述兩檔，未 stage、未 commit、未 push

## 0. 防偽引用（batch-8.7.md「驗收方註記」節第 2 條第一句原文）

> 2. **獨立 canary（第五發，角度＝React↔閉包接線錨點，dev 四發未覆蓋）**：TSX 的
>    `data-confirm-withdraw` 暫改 `data-confirm-withdraw-canary` → factory `querySelector`
>    落空、confirm 無 handler → smoke `withdrawal requires an in-project confirmation…` 紅 →
>    還原後綠、SHA 逐字回復 `b9eedaf5…`。

---

## 1. 盤點結論與改動計劃

### 1.1 盤點得到的三個硬約束

**約束 A：派發必須顯式，不能由寫入觸發。** HEAD 有四類行為讓「寫入即通知」在定義上做不到等價：

| 型態 | HEAD 證據 | 自動派發會怎麼壞 |
|---|---|---|
| 值沒變仍要派發 | `refreshAuthoritativeState` 收尾的 `publish()`（HEAD:1689）不依賴任何欄位變更；`reloadParticipation` 開頭 `state.mySessionsStatus = "loading"` + `notifyMySessions()`（HEAD:833–834）在已是 `loading` 時仍要通知 | 變更偵測會吃掉這些派發 → 次數變少 |
| 多欄寫完才派發一次 | `loadDiscovery` 連寫 `bounds`／`sessions`／`discoveryStatus`／`discoveryMessage`（HEAD:1004–1009）後才 `publish()` | 每欄一次派發 → 次數變多 |
| 寫入後派發次序被中間呼叫切開 | `loadDiscovery` 寫完後先同步呼叫 `loadPlayers()`（HEAD:1010），`loadPlayers` 內部的 `publish()`（HEAD:889）先於 `loadDiscovery` 自己的 `publish()`（HEAD:1011） | 寫入即派發會把 discovery 的那拍提前到 players 之前 → 次序反轉 |
| 只通知單一面 | `replaceMySessions` 只寫 `mySessions`／`mySessionRosters`（HEAD:656–657）後由呼叫端 `notifyMySessions()`，全程不 `publish()` | 全域派發會多出 render 呼叫 |

單元測試也直接釘住這件事：`tests/session-controller.test.js:2534`
`assert.equal(harness.renders.length, rendersBeforeIllegal, "illegal values are ignored and do not publish")`。

→ **設計拍板：`setState` 只寫不派發，`emit(channel)` 顯式派發。** 這正是派工單「訂閱機制若天然會合併，必須以顯式逐次派發保序」的落地。

**約束 B：`publish()` 與 `notifyMySessions()` 的 24／11 個呼叫點原地不動。** 兩者改成 `store.emit("map")`／
`store.emit("mySessions")` 的薄轉發，呼叫點一個都不搬，呼叫序列因此是「構造上等價」而非「測出來等價」。

**約束 C：可變集合的引用語意不能動。** `state.filters` 在 HEAD 是就地改欄位（`state.filters[key] = …`，
HEAD:1087/1089），`render` payload 直接把同一個 `filters` 物件交出去。換成不可變替換會改變 payload 的
物件 identity（React 端的比較行為可能因此改變），故保留就地突變 + `setState({ filters })` 讓寫入仍走 store。

### 1.2 改動計劃（已全數執行）

1. `src/sessionStore.ts`：`createStore(initialState)` → `{ getState, setState, subscribe, emit }`，零依賴 strict TS。
2. 25 欄 `state` 物件 + `authEpoch` → 單一 store；其餘 20 個 closure 綁定留原地（判準見附錄 B）。
3. 讀取一律 `read().<field>`（`const read = store.getState`），寫入一律 `store.setState({…})`，
   相鄰且無條件的寫入合併為單次 `setState`。
4. 三條通道收斂為 `store.subscribe(channel, listener)`：`map`、`mySessions`、`courts`。
5. 驗證：113 條單元測試原樣全綠 + HEAD／工作樹行為序列 probe 零差異 + 三發 canary + 七站 gate。

### 1.3 可行性前置驗證

`sessionController.js`（`.js`）要 `import … from "./sessionStore.ts"`，而 `tests/session-controller.test.js`
是 `node --test` 直載 `src/sessionController.js`，不經 Vite。實測本機 Node `v22.22.3` 原生型別剝離
（unflagged type stripping）可讓 `.js` importer 直接載入 `.ts`：scratch probe `import { makeBox } from "./probe.ts"`
輸出 `BOX_OK {"value":41}`，無旗標、無 loader。Vite 端由 `allowImportingTsExtensions: true` 覆蓋，
`npm run build` 已實證（117 modules transformed）。

---

## 2. 盤點附錄 A：25 欄 reader/writer 矩陣

行號為 **HEAD**（`48d8273`）的 `src/sessionController.js`。`W` 後方 `[…]` 標注該寫點之後 14 行內出現的通道：
`publish` = map 面、`notify` = my-sessions 面、`-` = 該寫點自身不接任何通道（由呼叫端負責派發）。
全檔 `state.X = …` 寫入行共 **72** 行（指令計得），`state.` 出現行共 **203** 行。

| 欄位 | W（寫點｜通道） | R（讀點） |
|---|---|---|
| `bounds` | 1（1004 `[publish]`） | 10（878, 998, 1057, 1519, 1660, 1686, 2120, 2188, 2315, 2391） |
| `courts` | 1（1070 `[publish]`） | 14（549, 589, 1072–1075, 1187, 1388, 1422, 1457, 1619, 1939, 1979, 2141） |
| `courtsReady` | 1（1071 `[publish]`） | 8（1072–1075, 1620, 1940, 1980, 2142） |
| `sessions` | 4（1007, 1015, 1020, 1059 全 `[publish]`） | 5（549, 1225, 1523, 1734, 2079） |
| `filters` | 1（1094 `[publish]`，另有 1087/1089 就地改欄位） | 4（549, 588, 1087, 1089） |
| `userLocation` | 1（2284 `[publish]`） | 3（549, 587, 1162） |
| `locationBlocked` | 5（2267, 2279, 2285, 2291, 2299 全 `[publish]`） | 1（2259） |
| `locationMessage` | 6（2260, 2268, 2280, 2286, 2292, 2300 全 `[publish]`） | 1（591） |
| `drawerState` | 3（1081, 1101, 1591 全 `[publish]`） | 1（586） |
| `mapUnavailable` | 2（1099, 1150 全 `[publish]`） | 1（576） |
| `discoveryStatus` | 4（1008, 1016, 1021, 1060 全 `[publish]`） | 3（577, 578, 1039） |
| `discoveryMessage` | 3（1009, 1022, 1061 全 `[publish]`） | 0 |
| `authSession` | 1（2368 `[notify]`） | 21（603, 643, 767, 795, 802, 806, 828, 829, 831, 879, 957, 992, 1182, 1199, 1440, 1499, 1642, 2033, 2311, 2324, 2419） |
| `profile` | 2（2017 `[notify]`, 2369 `[notify]`） | 35（649, 765–767, 879, 883, 957, 972, 992, 1199, 1441, 1452, 1453, 1499, 1634, 1653, 1699, 1798, 2003, 2004, 2010, 2034, 2035, 2044, 2062, 2110, 2172, 2182, 2193, 2203, 2231, 2311, 2329, 2331, 2425） |
| `mySessions` | 1（656 `[-]`） | 8（604, 631, 666, 1226, 1427, 1791, 2080, 2416） |
| `mySessionsError` | 4（699 `[notify]`, 839 `[notify]`, 855 `[notify]`, 2376 `[notify+publish]`） | 2（647, 2423） |
| `mySessionsStatus` | 5（700, 833, 845, 856 `[notify]`, 2377 `[notify+publish]`） | 2（650, 2426） |
| `mySessionRosters` | 2（657 `[-]`, 697 `[notify]`） | 3（633, 1837, 2090） |
| `blockedPlayers` | 2（722 `[notify]`, 2373 `[notify+publish]`） | 3（644, 741, 2420） |
| `blockedPlayersError` | 3（717, 728 `[notify]`, 2374 `[notify+publish]`） | 2（645, 2421） |
| `blockedPlayersStatus` | 4（716, 723, 729 `[notify]`, 2375 `[notify+publish]`） | 2（646, 2422） |
| `playerLayerOn` | 4（872 `[-]`, 1659 `[-]`, 2187 `[-]`, 2314 `[publish]`） | 11（595, 597, 879, 883, 1010, 1439, 1451, 1499, 2310, 2430, 2432） |
| `playerLayerMessage` | 4（875, 888, 898, 905 全 `[publish]`） | 2（596, 2431） |
| `playerLayerStatus` | 4（874 `[-]`, 887, 897, 904 `[publish]`） | 2（598, 2433） |
| `players` | 4（873 `[-]`, 886, 896, 903 `[publish]`） | 2（554, 1500） |

矩陣讀出的兩個關鍵事實：

- **`[-]` 寫點（656, 657, 872–874, 1659, 2187）證明「寫入 ≠ 派發」**：`replaceMySessions` 與
  `clearPlayerLayer` 的寫入完全不接通道，派發時機由呼叫端決定。任何自動派發設計都會在這些點多送一拍。
- **`[notify+publish]`（2373–2377）是 `setAuthState` 的單一 identity 變更批**：一次寫五欄，先 `notifyMySessions()`
  （HEAD:2381），稍後才 `publish()`（HEAD:2385）——兩條通道對同一批寫入各派一次、次序固定。

## 3. 盤點附錄 B：closure 可變變數逐一判定

**判定標準（先寫標準再套用）**：

> 進 store ⇔ 該值會**出現在某條通道的 payload 中，或直接決定該 payload 的內容**。
> 留 closure ⇔ 純機械資源（外部系統把手、timer、請求 gate）或**只服務併發／版本守衛、從不進 payload** 的計數器與登錄簿。
> 理由：store 的存在意義是「有訂閱者關心的狀態」。把沒有任何 payload 讀它的值收進去，只會製造沒有訂閱者關心的假更新，
> 並讓未來 9b／10 的 selector 誤判依賴面。

控制器作用域的綁定共 **23 個**（指令計得，含 `const state` 與 `Object.freeze` 常數 `SURFACE_TRANSITIONS`）。
扣掉這兩個，可變綁定 **21 個**，判定如下：

| 綁定（HEAD 行） | 判定 | 依據 |
|---|---|---|
| `authEpoch`（463） | **進 store** | 直接是 payload 欄位：`viewGeneration: authEpoch`（HEAD:651 通道 2、HEAD:2427 `getMySessionState`） |
| `map`（452） | 留 closure | Google Maps 實例把手，只給 `mapTools.subscribeToMapIdle`／`getMapBounds` 用（HEAD:1151, 1154），零 payload 讀點 |
| `idleTimer`（453） | 留 closure | `setTimeout` handle，只被 `clearTimeout` 消費（HEAD:1127, 1152） |
| `discoveryGate`（454） | 留 closure | 請求 gate 資源 |
| `participationGate`（455） | 留 closure | 同上 |
| `rosterGate`（456） | 留 closure | 同上 |
| `detailJoinPreviewGate`（457） | 留 closure | 同上 |
| `locationGate`（458） | 留 closure | 同上 |
| `playerGate`（459） | 留 closure | 同上 |
| `playerDirectoryGate`（460） | 留 closure | 同上 |
| `blockedPlayerGate`（461） | 留 closure | 同上 |
| `playerCardGate`（462） | 留 closure | 同上 |
| `mySessionsVersion`（464） | 留 closure | 只被 `replaceMySessions` 寫（HEAD:658）、`isCurrentMySessionsSnapshot` 讀（HEAD:662）、`hydrateMySessionRosters` 快照（HEAD:677）；**零 payload 讀點**。與 `authEpoch` 的差別就在這一點 |
| `explicitViewportGeneration`（465） | 留 closure | 只作為 `expectedExplicitViewports` 條目的序號（HEAD:1116） |
| `expectedExplicitViewports`（466） | 留 closure | 地圖 idle 抑制清單；讀點只有 `pruneExpectedExplicitViewports`（HEAD:1106）、`rememberExplicitViewport`（HEAD:1111）與 `isExpectedExplicitViewport`（HEAD:1123），零 payload 讀點 |
| `surfaceRegistry`（467） | 留 closure | surface 把手登錄簿，本身是資源容器 |
| `suppressReconcileSessionId`（542） | 留 closure | reconcile 抑制窗口，只被 `reconcileSuppressed` 讀（HEAD:1515） |
| `lifecycleMutationGeneration`（543） | 留 closure | mutation token 序號（HEAD:814） |
| `intentVersion`（544） | 留 closure | 服務公開把手 `capturePendingIntentVersion`／`clearPendingIntentIfUnchanged`（HEAD:2411, 2413），但**不進 render／notify payload** |
| `resumeInFlight`（545） | 留 closure | in-flight promise 去重 Map |
| `inFlightLifecycleActions`（546） | 留 closure | 重入防呆 Map |

小計：**1 進 store，20 留 closure**（1 + 20 = 21，與可變綁定總數一致）。

`intentVersion` 是唯一的邊界案例：它被公開把手讀取，但公開把手不是「通道」——通道的定義是「controller 主動推給
renderer 的派發」，`capturePendingIntentVersion()` 是 caller 主動拉。依判定標準（進 payload 才進 store）留 closure。
若 9b 要讓 main.js 的 intent 版本走訂閱，屆時再遷移，本批不預先擴大。

## 4. 盤點附錄 C：三通道呼叫圖

### 通道 1 `publish()` — 24 個呼叫點（HEAD 行號）

889, 899, 906, 1011, 1026, 1029, 1062, 1076, 1082, 1090, 1095, 1102, 1131, 1163（`else publish()`）,
1592, 1689, 2261, 2269, 2281, 2293, 2301, 2318, 2385, 2386（`if (await reloadParticipation(...)) publish()`）。

改動後同為 **24 個呼叫點**（指令複算：`grep -n "publish()" | grep -v "function publish"` 扣掉 1 行註解＝24），
且逐行對位不變，只有函式本體從內聯 renderer 呼叫改成 `store.emit("map")`。

### 通道 2 `notifyMySessions()` — 11 個呼叫點（HEAD 行號）

702, 718, 724, 730, 834, 842, 848, 857, 1269, 2018, 2381。改動後同為 **11 個**，逐行對位不變。

### 通道 3 surface 把手直呼 — 18 個呼叫點，逐點判定

| # | HEAD 行 | 呼叫 | 語意判定 | 處置 |
|---|---|---|---|---|
| 1–3 | 610, 617, 621 | `surface?.setJoinPreview?.(…)` | **命令**：join preview 名單不在 `state` 內，是該次 async 讀取的私有結果 | 維持原樣 |
| 4–6 | 975, 982, 986 | `directory?.setDirectory?.(…)` | **命令**：目錄列不在 `state` 內，是該 surface 私有的 async 結果 | 維持原樣 |
| 7–10 | 1072–1075 | `…?.setCourts?.(state.courts, { ready: state.courtsReady })` ×4 | **狀態鏡射**：讀的就是 store 兩欄，且四個 surface 是同一份資料的四個消費者 | **收斂為通道 `courts`** |
| 11–13 | 1289, 1298, 1303 | `context.sheet?.setState?.(…)` | **命令**：`messages`／`roster` 掛在 chat context 上，不是 controller state | 維持原樣 |
| 14 | 1372 | `context.sheet?.setArchived?.(error.message)` | **命令**：把一則 RPC 錯誤訊息交給 sheet 呈現 | 維持原樣 |
| 15 | 1487 | `card?.setInvitableSessions?.(invitableSessions())` | **狀態鏡射**（衍生自 `state.mySessions`） | **維持原樣**，見下方論證 |
| 16 | 1552 | `activeChat.sheet?.setArchived?.()` | **命令**：封存後轉唯讀的一次性指令 | 維持原樣 |
| 17 | 1609 | `detail.enterConfirming?.({ expectedAccepted })` | **命令**：sheet 就地切態 | 維持原樣 |
| 18 | 1955 | `sheet?.setTerminal?.("候選球局已逾期或下架，無法再定案。")` | **命令**：終態訊息 | 維持原樣 |

**#15 的逆向論證（唯一被判為狀態鏡射卻仍不收斂者）**：`setInvitableSessions` 讀的是 `invitableSessions()`，
確實衍生自 store 的 `mySessions`。但它在 HEAD 只出現在 `openPlayer` 的 `onInvite` 失敗分支（HEAD:1483–1487）——
「reloadParticipation 之後、丟錯之前」的那一個瞬間。收斂成訂閱意味著**每次 mySessions 變更都要推給球友卡**，
那會新增 HEAD 不存在的呼叫（例如任何一次 `reloadParticipation` 都會多推一次），直接違反「呼叫次序與次數逐次相同」的
凍結面。保守原則在此與收斂衝突時，凍結面優先。列入「留給 9b」。

## 5. 盤點附錄 D：113 條測試的 harness 接線面

- 檔案：`tests/session-controller.test.js`，`grep -c "^test("` ＝ **113**。
- 唯一構造入口：`createHarness(overrides)`（該檔 237–377 行），直接呼叫
  `createSessionController({ api, mapTools, render, renderPins, renderPlayers, openSession, … })`，
  不碰 controller 內部；controller 的 `state` 與 closure 變數對測試完全不可見（皆為閉包私有）。
- 錄製面（全部是 push-to-array 的 fake）：`renders`、`pinBatches`、`playerRenders`、`mySessionChanges`，
  以及每個 surface fake 的 `closeCalls`／`confirmingCalls`／`courtUpdates`／`joinPreviewUpdates`／`stateUpdates`
  （`createSurface`，該檔 119–147 行）。
- 斷言型態以 `…at(-1)` 與 `deepEqual` 為主；**明確釘住呼叫次數的只有 3 處**：
  - `tests/session-controller.test.js:2526/2534`：`rendersBeforeIllegal` → 非法 `setDrawerState` 不得產生新 render。
  - `tests/session-controller.test.js:3539/3546`：`rendersAfterInitial` → 安靜輪詢後 `laterViews.length > 0`（掃描集非空）。
  - `tests/session-controller.test.js:2941`：`assert.deepEqual(sheet.detail.courtUpdates, [{ courts, options: { ready: true } }])`
    → `setCourts` 對開著的 surface 恰好推一次、內容逐字相符。
- **結論：沒有任何一條測試耦合到本批必須改的內部結構**（`state` 物件形狀、closure 變數名、publish 內聯實作皆為私有）。
  「113 條原樣全綠」在本設計下可達成，已實測。→ 不需要縮 scope。
- **同時盤出一個重要缺口**：既有 113 條只釘 3 處呼叫次數，**不足以證明「呼叫序列逐次相同」**。
  這正是行為序列 probe（§8）存在的理由，canary 1 與 3 也實證了這個缺口（§9）。

---

## 6. store 設計

`src/sessionStore.ts`（54 行，零依賴，strict TS，`tsc --noEmit` 與 `eslint`／`prettier` 全過）：

```ts
export type StorePatch<S> = Partial<S> | ((state: Readonly<S>) => Partial<S>);
export type StoreListener<S> = (state: Readonly<S>) => void;

export interface Store<S extends object> {
  getState: () => Readonly<S>;
  setState: (patch: StorePatch<S>) => Readonly<S>;   // 只寫，不派發
  subscribe: (channel: string, listener: StoreListener<S>) => () => void;
  emit: (channel: string) => void;                    // 顯式派發，依訂閱順序逐一呼叫
}
```

三個設計決定與理由：

1. **`setState` 不派發、`emit` 才派發**（相對派工單描述的三方法多一個 `emit`，且 `subscribe` 多一個 channel 參數）：
   §1.1 約束 A 已證明自動派發在本 controller 上無法等價。列入偏離清單第 1 條。
2. **頂層不可變替換（`Object.assign({}, state, patch)`）**：讓未來 `useSyncExternalStore` 這類 React 接法拿得到
   合法快照；同時所有讀點都是 `read().x` 現讀，沒有跨 `setState` 的頂層快取，故行為與 HEAD 的就地突變等價。
   巢狀物件（`filters`、`mySessionRosters` Map、`mySessions` 各列）**維持同一引用**，HEAD 的突變模式原封不動。
3. **`emit` 對 listener 陣列取快照後再迭代**：派發期間若有訂閱增減，以派發當下名單為準，避免同一次派發漏叫或重複叫。
   （本批三個 listener 都在建構時註冊、永不解除，此為防禦性寫法。）

`createSessionController` 內：

```js
const store = createStore({ authEpoch: 0, bounds: …, /* 25 欄 */ });
const read = store.getState;    // 目前狀態快照；一律現讀，不跨 await 快取
```

計數（指令計得）：`store.setState(` **39** 處、`store.emit(` **3** 處、`store.subscribe(` **3** 處、
`read().` 出現 **134** 次（分布於 114 行）、殘留 `state.<field> = ` 寫入 **0** 處。

## 7. 通道收斂對映表

| 通道 | HEAD 實作 | 本批實作 | 呼叫點變化 | 對外可觀察差異 |
|---|---|---|---|---|
| 1 `map` | `function publish()` 內聯呼叫 `render` / `renderPins` / `renderPlayers`（HEAD:582–600） | `store.subscribe("map", listener)` 註冊同一段內容；`publish()` ＝ `store.emit("map")` | 24 → 24，逐行對位不變 | 無 |
| 2 `mySessions` | `function notifyMySessions()` 內聯呼叫 `onMySessionsChange`（HEAD:641–653） | `store.subscribe("mySessions", listener)`；`notifyMySessions()` ＝ `store.emit("mySessions")` | 11 → 11，逐行對位不變 | 無 |
| 3 `courts` | `setCourts()` 內 4 行把手直呼（HEAD:1072–1075），寫入 → 4 直呼 → `publish()` | `store.subscribe("courts", listener)`；`setCourts()` ＝ `setState` → `emit("courts")` → `publish()` | 4 直呼 → 1 個 `emit`（listener 內仍 4 呼、順序不變） | 無（probe 逐次比對零差異，見 §8） |
| 3 其餘 13 個把手直呼 | 見附錄 C | **原樣不動** | 0 → 0 | 無 |

三個 listener 的 payload 建構全部改讀 `emit` 當下傳入的 `current` 快照，等價於 HEAD 讀 `state.x`
（`emit` 傳的就是 `getState()` 的同一個物件）。

## 8. 行為序列 probe

**方法**：`git worktree add --detach` 取出 HEAD（`48d8273`）到 scratchpad，用同一支 probe 腳本
（scratchpad，不入版）分別驅動 HEAD 版與工作樹版 controller，把每次 renderer callback 與 my-sessions
通知逐次錄成 `{channel, payload}` 陣列後 `diff`。時間戳全部使用固定值（`2099-01-02`／`2099-01-03`），
排序與分組結果因此可比。probe 跑完即移除 worktree（`git worktree list` 已確認不殘留）。

**錄製面**：`render`（sessions id 列、drawerState、hasUserLocation、filters 全欄含 Set 展開排序、courts id 列、
mapStatus、locationMessage）、`renderPins`（id 列）、`renderPlayers`（on／status／message／每組 court+人數+在場數）、
`onMySessionsChange`（authenticated／status／error／isPublic／viewGeneration／封鎖數與狀態／needsActionCount／
upcoming、history id 列／hasUnread）、surface 把手直呼（`setCourts` 等）、`toast`、公開 getter 回傳形狀。

**腳本涵蓋（17 步，派工單七項全含）**：

| 步驟 | 派工單要求 | 該步錄到的呼叫數（HEAD） |
|---|---|---|
| `setCourts` | 初始化 | 3（render/pins/players 各 1） |
| `initial-discovery` | 初始化 | 6 |
| `bounds-change` | **bounds 變更** | 6 |
| `drawer` | — | 6（3 次呼叫只產生 2 拍：非法值 `"half"` 零派發） |
| `filters` | **filter 變更** | 12 |
| `sign-in` | **登入（authEpoch 翻轉）＋ mySessions 載入** | 11（含 mySessions 通道 5 拍） |
| `courts-channel-with-open-form` | 通道 3 | 8（`surface:createSession:setCourts` 2 次，每次都在 render 之前） |
| `blocks` | — | 2（loading／ready 兩拍，僅 mySessions 通道） |
| `player-layer-on` | **player layer 開** | 6 |
| `player-layer-off` | **player layer 關** | 3 |
| `gate-superseded` | **gate superseded** | 9（舊請求 resolve 後零額外派發） |
| `discovery-error` | — | 6 |
| `map-unavailable` | — | 3 |
| `location-denied` | — | 6 |
| `getters` | — | 5 |
| `sign-out` | **登出（authEpoch 翻轉）** | 4 |
| `sign-in-other-account` | 帳號切換 | 11 |

**掃描集非空**：每一步的錄製筆數皆 > 0（上表逐列，指令計得），總筆數 **124**＝17 個步驟標記 + **107** 筆實際呼叫。

**結果**：

```text
recorded 124 entries -> head2.json
recorded 124 entries -> work3.json
PROBE_DIFF_EXIT=0
0
```

HEAD 與工作樹的呼叫序列**逐次零差異**（筆數、次序、每筆 payload 指紋全等）。

## 9. canary 三發（時序 + SHA）

以 `shasum -a 256 | cut -c1-16` 記錄；還原一律用注入前的檔案備份 `cp` 回寫，故「還原後 SHA 逐字回復」是
byte-level 證據。probe 比對基準為 `head2.json`（HEAD 版錄製）。

```text
== baseline ==
controller SHA c945bc038cfc9199  store SHA 3f011476c57a3b89
unit: # pass 113 # fail 0   probe=SAME

== CANARY-1 合併派發(emit 做值比對去重) ==
injected store SHA c9618b686a0a2704
unit: # pass 113 # fail 0   probe=DIFF(201 lines)
restored store SHA 3f011476c57a3b89
unit: # pass 113 # fail 0   probe=SAME

== CANARY-2 courts 通道次序倒置(emit 早於 setState) ==
injected controller SHA 91bc131e3bca744a
unit: # pass 111 # fail 2   probe=DIFF(4 lines)
  RED: not ok 75 - active profile and create forms receive courts loaded after they open
  RED: not ok 88 - decision sheet stays nonterminal while courts load and receives the ready catalogue
restored controller SHA c945bc038cfc9199
unit: # pass 113 # fail 0   probe=SAME

== CANARY-3 authEpoch 寫入繞過 store ==
injected controller SHA 960b67c88ea94ffd
unit: # pass 113 # fail 0   probe=DIFF(28 lines)
restored controller SHA c945bc038cfc9199
unit: # pass 113 # fail 0   probe=SAME

== final ==
controller SHA c945bc038cfc9199  store SHA 3f011476c57a3b89
 M src/sessionController.js
?? src/sessionStore.ts
```

三發各自針對的失效模式與命中面：

| canary | 注入 | 模擬的實作錯誤 | 單元測試 | probe |
|---|---|---|---|---|
| 1 | `emit` 對每欄做值比對，值沒變就不派發 | 「訂閱機制天然合併」——§1.1 約束 A 的直接反證 | 綠（未偵測） | **紅**，201 行差異（多處派發被合併吃掉） |
| 2 | `setCourts` 內 `emit("courts")` 早於 `setState` | 通道收斂時把派發放錯位置，surface 收到舊目錄 | **紅**（#75、#88） | **紅**，4 行 |
| 3 | `authEpoch` 改寫進新的 closure 變數，store 內那欄凍在 0 | 「寫入繞過 store」——欄位漏遷 | 綠（未偵測） | **紅**，28 行（`viewGeneration` 全部 1 → 0） |

**這張表本身就是本批最重要的驗證發現**：既有 113 條單元測試只抓到 3 發中的 1 發。canary 1 與 3 若沒有
行為序列 probe，會以「全綠」通過。§5 盤出的「只有 3 處釘呼叫次數」在此得到實證。

**canary 1 的第一次注入是失敗的（照實記錄）**：最初寫成「state 物件 identity 未變才跳過派發」，
因為 `setState` 每次都換新頂層物件，該條件幾乎永不成立 → 單元測試與 probe 都綠。改成逐欄值比對後才轉紅。
第一版注入不計為有效 canary，上表為第二版（有效版）的結果。

## 10. 完整 gate 七站（最終工作樹，逐字結尾）

跑前 `pgrep -f vite` 輸出 `1`——經 `pgrep -fl vite` 複查為**外層 shell 命令字串自身的 self-match**
（該命令列含 "vite" 字樣），實際零 vite 行程、`lsof -nP -iTCP -sTCP:LISTEN` 於 5173–5175 無 listener。
未執行 `db:reset:test`（本批零 migration、零 DB 寫入路徑改動，`test:local` 直接全綠，無累積污染跡象）。

```text
===== npm test =====        （含 pretest 目錄 --check、pretest:mock typecheck）
# tests 246
# pass 246
# fail 0
  4 skipped
  252 passed (2.4m)
EXIT=0

===== npm run test:local =====
# tests 2
# pass 2
# fail 0
  11 skipped
  42 passed (1.6m)
EXIT=0

===== npm run typecheck =====
> tsc --noEmit
EXIT=0

===== npm run lint =====
> eslint "src/**/*.{ts,tsx}" vite.config.ts
EXIT=0

===== npm run prettier:check =====
Checking formatting...
All matched files use Prettier code style!
EXIT=0

===== npm run build =====
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-O8AyLdXs.js   714.04 kB │ gzip: 201.05 kB
✓ built in 961ms
EXIT=0

===== git diff --check =====
EXIT=0
```

`npm test` 的 246 條 node 測試涵蓋 `test:session-unit` 全部 15 個檔案（指令計得）；其中
`tests/session-controller.test.js` 為 113 條，零修改零新增（`git status` 僅列 `src/` 兩檔）。

## 11. 偏離清單

1. **store 介面多一個 `emit`，且 `subscribe` 帶 channel 參數**（派工單描述為
   `{ getState, setState, subscribe }`）。理由見 §1.1 約束 A：自動派發與凍結的呼叫序列在本 controller 上
   數學上不相容（多欄批次寫、值未變仍派發、寫入與派發之間插入其他派發、單面通知四種型態同時存在）。
   派工單「訂閱機制若天然會合併，必須以顯式逐次派發保序」已預留此路。行數仍在「約 50 行等級」（54 行）。
2. **`authEpoch` 收進 store**（派工單把它與 `mySessionsVersion` 並列為「守衛變數」，要求判斷時序一個 token 不變）。
   依附錄 B 判準，`authEpoch` 是 payload 欄位（`viewGeneration`）故進 store；`mySessionsVersion` 純守衛故留 closure。
   時序未變：`setState` 同步寫入、`read()` 現讀，`authEpoch += 1` → `store.setState({ authEpoch: read().authEpoch + 1 })`
   之間無 await，後續 `const epoch = read().authEpoch` 取到同一值。canary 3 已反證此欄若漏遷會被 probe 抓到。
3. **`state.filters` 保留就地突變**：`setFilter` 改為「取出同一個 filters 物件 → 就地改欄位 → `setState({ filters })`」。
   寫入仍走 store，但物件 identity 刻意不換（§1.1 約束 C）。`resetFilters` 維持 HEAD 的整體替換。
4. **`context.session.unreadMessageCount = 0`（HEAD:1268）維持巢狀就地突變**，未包成 `setState`。
   它改的是 `state.mySessions` 內某一列的欄位，不是 25 欄之一；HEAD 的樂觀清零語意（含失敗時刻意不回滾）
   依賴這個引用突變被 `mySessionItems()` 的 spread 讀到。
5. **`setInvitableSessions`（HEAD:1487）判定為狀態鏡射但不收斂**，論證見附錄 C #15，列入 §12。
6. **未執行 `db:reset:test`**：本批零 migration，`test:local` 一次全綠。
7. **未開 preview server 做視覺驗證**：本批是 controller 內部重構，零 DOM／CSS／文案變更，
   e2e（mock 252 passed／local 42 passed）已覆蓋實際渲染結果；本批的核心證據是行為序列 probe，
   非幾何指紋。
8. **一個未採納的順手清理（提出，不自行執行）**：`requestCurrentLocation` 內
   `"無法取得位置；你仍可移動地圖或依球場尋找球局。"` 字面重複 5 次，抽成模組常數可消除同步漏改風險。
   本批曾寫入後主動回退，維持 HEAD 字面，避免靜默擴大 scope。是否要做請 PM 決定。

## 12. 留給 9b（與後續批）

1. **`setInvitableSessions` 的通道化**（附錄 C #15）：要收斂就必須接受「每次 mySessions 變更都推球友卡」，
   那是行為變更，需 PM 拍板後才做。
2. **`intentVersion` 是否進 store**：目前服務 `capturePendingIntentVersion`／`clearPendingIntentIfUnchanged`
   兩個公開把手（拉模式）。若 9b 要把 main.js 的 intent 版本改成訂閱，屆時一併遷移。
3. **`emit` 之外是否要提供 selector 訂閱**：本批刻意不做 selector／記憶化（派工單指定）。
   批 10 若要 React `useSyncExternalStore`，需要的是「頂層快照穩定 + selector」，前者本批已具備。
4. **chat context / surfaceRegistry 的狀態化**：`context.messages`／`context.roster`／`activeChat.session`
   目前是 surface 私有可變狀態，不在 store 內。若未來要讓聊天面也走訂閱，屬獨立批。
5. **行為序列 probe 的常駐化**：本批的 probe 是 scratchpad 一次性腳本（不入版）。既有 113 條只釘 3 處呼叫次數
   （§5、§9 已實證這個缺口），若 PM 認為值得，可考慮把序列比對做成常駐測試——**但那會新增 `tests/**` 檔案，
   本批凍結面明文禁止，故不在 9a 執行**。

## 驗收方註記（2026-08-19）

1. **偏離八條全數接受**：第 1 條（emit 顯式分離＋channel 參數）是本批最重要的設計裁決——
   §1.1 約束 A 的四型態表格＋canary 1 反證構成完整論證，派工單「顯式逐次派發保序」預留
   之路的正確落地；第 2 條（authEpoch 進 store）經 read-back Lens 2 驗證遞增與讀取無
   await 縫隙、canary 3 反證漏遷可偵測；第 8 條（順手清理主動回退）是 scope 紀律模範，
   位置錯誤訊息抽常數列 PM 觀察項不開批。
2. **獨立 canary（第四發，角度＝重複派發，與 dev 三發〔合併／次序／繞過〕相反方向）**：
   `setCourts` 內 `emit("courts")` 複呼一次 → 單元測試 `decision sheet stays nonterminal…`
   紅（`courtUpdates` 恰一次的 deepEqual 斷言）→ 還原後 246/246 綠、controller SHA 逐字
   回復 `c945bc03…`。與 dev canary 2 合看：courts 通道的少發、錯序、多發三向都有斷言面。
3. **Read-back 四 lens（API 凍結／狀態遷移與快取縫隙／通道對位與附錄真實性／store 品質
   與跨環境）全 PASS，零 blocker 零 concern**。跨 await 快取縫隙攻擊零命中——全檔唯一
   跨 await 存活的 `const epoch = read().authEpoch` token 級對應 HEAD 的
   `const epoch = authEpoch`（HEAD 本來就是快照語意）。兩個理論縫隙入檔不開批：
   (a) map listener 混用 `current` 快照與 read() 活讀，若 render callback 同步再入
   setState 會分歧——全檔無此路徑，probe 零差異；(b) 附錄 A 矩陣的通道標注是「後方
   14 行內」文字鄰近規則，`playerLayerOn:2314` 的 `[publish]` 非控制流語意——矩陣自述
   規則，非造假，讀者須知。
4. **Lens 4 兩個 note 供 9b 參考**：StorePatch 函式形式在 controller 零呼叫點（dead API
   surface，9b 決定去留）；`Readonly<S>` 為編譯期宣稱無 runtime freeze，與「頂層替換、
   巢狀刻意突變」設計一致，非型別謊言。
5. 驗收方七站 gate 複跑全綠（mock 252／local 42 passed）；驗收期間工作樹零修改
   （canary 還原後 SHA 實證）。「留給 9b」五項全部需 PM 拍板後才發單。
