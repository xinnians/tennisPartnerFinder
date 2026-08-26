# 批 4C-3 派工單：restore focus＋首幀 rAF 遷入 React surface system（批 4 收官）

- 日期：2026-08-27。母文件：`docs/arch-roadmap-2026-08-26-react-ownership.md`（4C
  三段之三，批 4 收官批）；前置：4C-2 ACCEPTED（`1645569`，驗收紀錄
  `docs/arch-reports/batch-4C2-keyboard-acceptance-2026-08-27.md`——其驗收註記
  「`focusableNodes` 兩份單源化」是本批必交付）。設計輸入：4C-2 回報 §10.5。
- 開工基準：`1645569` 之後的最新 main HEAD（working tree 應乾淨，否則停手回報）。
- **bundle 硬約束**：total gzip 現餘僅 **1,517 B**（連兩批收緊）。本批是碼量搬移
  ＋刪一份重複 helper，預期近中性或微降；超 gate＝BLOCKED。
- 本批完成後：`mountSurface` 五責任（DOM／生命週期／isolation／stack－Escape－
  trap／restore－rAF）的機制本體全數入 React surface system，**批 4 全案完結**;
  `sheets.js` 殘餘＝公開 API facade（`mountSheet`／`mountDialog`／`configure*`
  bridge 與 `mountSurface`／`closeSurface` 編排,含 `pushSurfaceIsolation`
  acquire／release 呼叫點）＋click 綁定＋`registerUnmount`＋`surfaces` WeakMap
  ＋`openLoginModal`（批 6 TS 化處理）。
- 你不 commit、不 push；working tree 交驗收方。

## 本批範圍

**搬**：`captureRestoreTarget`＋`resolveRestoreTarget`＋close 的 restore 呼叫
（**三者是不可拆語意單元,一起搬**,4C-2 回報 §10.5）;首幀 rAF 聚焦;
`focusableNodes` 單源化（刪 `sheets.js` 副本,rAF 遷移後唯一消費者就是 host）。

**批 C2-2 修法逐字保真（一票否決）**：只有 `target.drawerId` 有值（capture 當初
`node.closest("#nearby-sessions-drawer")` 命中）才允許 fallback 到 drawer
collapse／toggle;非抽屜 surface 的卡片消失後**只試 full 專屬選擇器
`[data-nearby-dialog] [data-nearby-close]`,找不到就不移動焦點**;`:37-58` 的
12 行修法紀錄註解隨碼搬遷不刪。

## 解凍清單（Q3 守則：未列即凍結）

- `src/sheets.js`（4C-2 後行號）：`:19-23` `focusableNodes`（刪除,單源化）、
  `:25-30` `captureRestoreTarget`、`:32-58` `resolveRestoreTarget`（含 C2-2
  註解）、`:64` `previousFocus` capture＋replace 繼承、`:104` close 的 restore
  呼叫、`:113` entry 的 `restoreFocus` 欄（改為與 host 約定的 descriptor 承載）、
  `:120-127` rAF 首幀聚焦區塊（含註解）。
- `src/app/SurfaceHost.tsx`：新增 restore descriptor 型別＋capture／resolve／
  restore 與首幀聚焦機制;keyboard entry 的 `restoreFocus: unknown` 收斂為
  強型別 descriptor。**keyboard handler（`onSurfaceKeyDown`）內不得解析
  restore descriptor**（4C-2 回報 §10.5 約束）。
- `tests/sheets-dom.test.js`：harness 接線隨搬遷調整;既有「還原三段 fallback」
  oracle（逐段斷言）語意零弱化。
- 回報文件。

**仍凍結（一票否決）**：restore 語意全部——capture 的 `{drawerId, node,
sessionId}` 三欄語意、resolve 的三段順序（live node→同 sessionId 重繪卡→
drawer 語境 fallback）、C2-2 條件、`restoreFocus:false` 不移焦、replace 先繼承
舊 entry 的 restore 再關舊、close 時 restore 在 `onClose` **之後**（4C-2 後
close 序：…→`surfaces.delete`→`onClose`→restore→rethrow）;rAF 聚焦語意——
「使用者已主動移焦不覆寫」guard（`!closed && !surface.contains(document.activeElement)`
的等價判定,closed 判定可改用 host 的 liveness 但語意相同）＋
`focusableNodes(surface)[0] ?? surface`＋`preventScroll:true`＋原註解;
`FOCUSABLE_SELECTOR` 模組;Escape／Tab／stack／listener——零 diff 粒度＝
`onSurfaceKeyDown` 與 `surfaceKeyboardRegistry` 兩函式本體逐字零 diff
（`SurfaceKeyboardEntry.restoreFocus` 型別欄位除外,屬解凍項）;
E 群封條（close 序不變）;A／B／C／D／F 群;`mountSheet`／`mountDialog`／
`openLoginModal` 公開簽名與回傳 shape;click 綁定;`surfaces` WeakMap;
`modalIsolation.js`;4 views;14 sheet;七份指定 e2e spec（同 4C-1／4C-2 清單）
原檔零 diff;bundle gate。

## Ground truth（2026-08-27 開單時實測；動手前自行重驗）

- capture 時機：`:64` 在 `closeSurface(replace)` **之前**讀
  `active?.restoreFocus ?? captureRestoreTarget(document.activeElement)`——
  replace 繼承語意依賴這個先後順序,搬遷後必須保持。
- entry 已承載 `restoreFocus`（4C-2,`:113`）;host 端 keyboard entry 型別現為
  `restoreFocus: unknown`（`SurfaceHost.tsx:43-48` 區）。
- restore 呼叫（`:104`）在 try/finally 的 finally 內、`onClose` 之後——4C-2
  加固後 shell 錯誤也不會跳過 restore,搬遷不得退回「錯誤跳過 restore」。
- rAF 首焦與 trap 的 focusable 判定現為兩份逐字相同副本（sheets.js `:19-23`／
  SurfaceHost）;單源化後唯一定義在 host。
- **載重 oracle 盤點**：`sheets-dom` 還原三段 fallback（逐段斷言,4C-1 改寫版）;
  `session-lifecycle-smoke.spec.js:177`（關 sheet 焦點回到起始卡片）;
  `account-settings-smoke.spec.js:619`（非 drawer report dialog 的 trigger 卡
  消失**不得**把焦點送到 drawer toggle——C2-2 修法的專屬 oracle）＋`:693`;
  `discovery-interactions-smoke.spec.js:313`（重繪後卡片仍是合法 restore
  目標）;`performance.spec.js:199`（trap＋回 trigger）;`session.spec.js:218`
  （local,4C-2 回報 §10.5 點名,test:local 會跑到）。
- 量化基準（4C-2 後）：main gzip 187,359（餘 5,061 B）;total 257,545
  （**餘 1,517 B**）;unit 344;mock 298 passed／4 skipped;
  `__importAppModule`（window 口徑）110;`sheets.js` 176 行,SHA-256 起點
  `9a243a2e…`（4C-2 回報 §12）。

## 作法要求

1. **restore 單元一起搬**：capture／resolve／restore 呼叫入 host（descriptor
   強型別化;resolve 不在 keyboard handler 內執行）;`sheets.js` 經既有
   configure bridge 模式取用（不 import TSX）。close 序與 replace 繼承逐字
   等價。
2. **rAF 首焦搬遷**：`closed` 判定改用 host liveness（或等價）,guard 語意
   零變更;原註解隨遷。
3. **`focusableNodes` 單源化**：刪 `sheets.js` 副本;host 唯一定義同時服務
   trap 與首焦。
4. **oracle**：既有還原三段 oracle 全綠自證;若三段 fallback 各段缺獨立咬合
   （以 canary 檢驗）,補足。

## Oracle 與 canary（三拍必附、逐字輸出）

Canary ×3——**每條先驗目標測試 guard 再宣稱紅**（4C-2 假 canary 教訓）：

- (a) 破壞 C2-2 條件一行（把 drawer fallback 的 `target.drawerId` 條件拿掉,
  回到無條件 fallback）→先試 `account-settings-smoke.spec.js:619`。**開單時
  推演它很可能不紅**：`style.css:35` `[hidden]{display:none!important}` 使
  收合中 drawer 的 collapse 鈕不可 focus（Chromium 對未渲染元素 `focus()`
  no-op）,activeElement 留 body,`:683-684` 照樣過。若實測不紅,**改在
  `sheets-dom` 補一條單元 canary oracle**：非抽屜 opener＋document 放置
  drawer-collapse／toggle 節點＋卡片消失後 close,斷言焦點不落到它們
  （happy-dom 無 CSS、focus 不受渲染限制,無條件 fallback 會實際搶焦,必紅）;
  該 oracle 留存為 C2-2 修法的常駐封條。
- (b) 破壞 sessionId 重繪卡 resolve 一段→`sheets-dom` 還原 oracle 的
  replacement 段斷言（`:322-323`）紅→還原綠（`discovery-interactions:313`
  第二次重繪可能走 live-node 早退,不作拍點）。
- (c) 破壞 rAF guard（拿掉 `surface.contains(document.activeElement)` 判定）→
  開單時反掃無專屬 oracle,**先補**「開啟後立即主動移焦不被 rAF 覆寫」單元
  oracle 再 canary（提示：`onMount` 在 rAF 排程之前,同步 rAF harness 下在
  `onMount` 內移焦即可,不必改 harness）→紅→還原綠。

## 不在範圍

- 批 5 syncCommit 退役;批 6 TS 化（含 sheets.js 殘餘）;14 sheet content、
  views、UX／文案／CSS、新依賴、bundle gate 調整。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

typecheck／lint／prettier:check／build／check:production-bundle（main／total
對照＋淨值,total 餘裕逐字抄錄,超 gate＝BLOCKED）／test:mock（≥298＋新增;
已立案 flake 撞到重跑註明）／test:local（不豁免;污染紅依 guarded reset 三拍）
／`git diff --check`。

## 回報合約

寫 `docs/arch-dispatch-2026-08-27-batch4C3-restore-report-codex.md`（不 commit、
不 push），必含：restore 單元搬遷對照（capture 時機／replace 繼承／close 序
逐步）、descriptor 型別設計、rAF guard 等價自證、`focusableNodes` 單源化反掃
（sheets.js 零定義）、canary ×3 三拍逐字、C2-2 註解搬遷自證（逐字）、bundle
淨值（total 餘裕逐字）、`__importAppModule` 對帳、凍結面自證（Escape／Tab／
stack 零 diff、七 e2e spec 零 diff、E 群仍過）、收尾矩陣逐字輸出、Codex 五問
（第 5 問答「批 4 全案完結後,對批 5 syncCommit 2→0 的建議——特別是
`SurfaceHost.commitSynchronously` 與 `sessionStore.ts` 兩 caller 各自的退役
條件與殘留理由書寫」）、未做／疑義／BLOCKED。
