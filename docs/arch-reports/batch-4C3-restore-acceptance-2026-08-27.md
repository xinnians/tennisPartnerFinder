# 批 4C-3 驗收紀錄（restore focus＋首幀 rAF 遷入 React surface system——批 4 收官）

- 日期：2026-08-27。驗收方：Claude。
- 派工單：`docs/arch-dispatch-2026-08-27-batch4C3-restore.md`；Codex 回報：
  `docs/arch-dispatch-2026-08-27-batch4C3-restore-report-codex.md`。
- 驗收方法：本機重跑全套 gate＋production diff 審閱＋對立審查 agent（canary ×3
  複跑＋C2-2 逐字比對＋rAF liveness 等價獨立判定＋批 4 完結聲稱查核），對立
  審查報告：`docs/arch-reports/batch-4C3-adversarial-2026-08-27.md`。

## 結論：**ACCEPTED——批 4（sheet 殼 React 化）全案完結**

`mountSurface` 五責任機制本體全數入 React surface system：DOM＋生命週期＋
isolation（4C-1）、stack＋Escape＋Tab trap（4C-2）、restore＋首幀 rAF（4C-3）。
`sheets.js` 殘餘＝公開 API facade＋configure bridge ×3＋mount／close 編排（含
isolation 呼叫點）＋click 綁定＋`registerUnmount`＋`surfaces` WeakMap＋
`openLoginModal`（134 行,批 6 TS 化處理）。

## 通過項（全部本機重驗或對立審查實證）

1. **Gate 全綠** [已驗證]：typecheck／lint／prettier／build／bundle／
   `git diff --check` exit 0；unit 346（+2 新 oracle）、mock 298／4 一次過；
   local 見下節。
2. **restore 單元搬遷保真** [已驗證]：capture 先於 replace close、replace 繼承
   舊 descriptor、restore 在 finally 內 `onClose` 之後、`restoreFocus:false`
   不移焦——逐步對照等價；descriptor 強型別
   `{drawerId, node, sessionId}`；獨立 `SurfaceFocusRegistry`（keyboard handler
   不解析 restore）;focus registry 於 mount 起點擷取 stable local＋fail-closed。
3. **C2-2 修法逐字保真** [已驗證，對立審查擴大到完整 12 行 diff exit 0]：
   條件式 drawer fallback（僅 `drawerId` 有值）、full 專屬選擇器第一 fallback、
   非抽屜找不到不移焦。
4. **rAF liveness 等價** [已驗證，對立審查獨立判定]：`stack.includes(entry)`
   替代 `closed` closure——close 全路徑（含 unmount 拋錯）先同步 unregister，
   兩方向不可達論證成立；`requestAnimationFrame` 排程與三行註解逐字隨遷；
   replace 舊 entry 不搶焦。
5. **Canary ×3 複跑** [已驗證]：無條件 drawer fallback→新非抽屜 oracle 紅；
   刪 replacement resolve 段→三段還原 oracle 紅；拿掉 contains guard→新
   onMount 主動焦點 oracle 紅——全數還原綠,SHA 一致。**條件式 canary 指示
   被正確執行**：Codex 先實測 `account-settings:619` 對 mutation 不敏感
   （`[hidden]` 元素 focus no-op,如派工單推演）、未誤報,補 happy-dom 常駐
   封條後取得有效紅燈。
6. **`focusableNodes` 單源化** [已驗證]：sheets.js 零定義、host 唯一,同時
   服務 trap 與首焦；keyboard 兩本體（`onSurfaceKeyDown`／
   `surfaceKeyboardRegistry`）相對 4C-2 逐字零 diff。
7. **凍結面** [已驗證]：七份指定 e2e＋views＋14 sheet＋`sessionViews.js`＋
   `App.tsx`＋`modalIsolation.js`＋lifecycle 六群零 diff；`syncCommit` 仍恰
   2 caller；`line_id|session_contacts` 與基準相同；`__importAppModule` 110。
8. **殘餘面查核** [已驗證]：sheets.js 全文逐行對照,無清單外機制殘留——
   批 4 完結聲稱成立。

## test:local 事件紀錄（兩輪紅，分類完畢，皆非本批迴歸）

1. 首輪紅：`session.spec.js:619`（候選局 pin title poll）——數 DB 253 筆殘留
   session（污染特徵：pin 聚合使候選 title 不可見）→ guarded reset → 該測試綠。
2. Reset 後另一條紅：`session.spec.js:1999`（Me 背景重繪保焦,等
   `update_my_presence` RPC 90 秒 timeout）——單測取樣 `--repeat-each=3`
   全綠（每次 ≈7 秒 vs timeout 90 秒）,判定**負載型偶發**（連續多輪全量
   suite 下的環境延遲）;[推論] 4C-3 只動殼 restore／rAF,與 presence RPC
   路徑無涉。完整重跑 45 passed／11 skipped 綠。

## 回報勘誤（一處，不影響結論）

Canary A 的紅燈「逐字稿」是中間版斷言（`notStrictEqual` 格式）的輸出,非最終版
oracle 的輸出；對立審查對最終檔複跑後 canary 有效性維持。

## Bundle

main gzip 187,462（+103 B，餘 4,958 B）；total gzip **257,597（+52 B，
餘 1,465 B）**——連三批收緊（1,703→1,517→1,465）。批 5 開單續列硬約束；
批 5 是退役批（刪 syncCommit 呼叫）,預期回收。

## 量化更新（新基準）

- main gzip **187,462**（餘 4,958 B）；total gzip **257,597**（餘 1,465 B）。
- unit **346**；mock 298 passed／4 skipped；`__importAppModule` 110。
- `sheets.js` **134 行**（管線起點 206 行）；殼五責任全入 React。
- 批 5 設計輸入：Codex 回報 §9.5 的 caller-by-caller 兩段退役方案
  （SurfaceHost 與 sessionStore 退役條件分開判定、理由書格式、2→1→0 逐步
  歸因）採納為批 5 派工單基礎。
