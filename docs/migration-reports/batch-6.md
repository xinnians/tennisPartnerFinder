# 批 6：球局詳情 sheet 遷移 React 回報

日期：2026-08-18（Asia/Taipei）

## 1. 結論

球局詳情 sheet 的內容已由 React 19 接管；`openSessionSheet(session, options = {})` 的公開名稱、參數、預設值、同步建立語意，以及回傳 handle 的 `root`、`surface`、`close(options)`、`setJoinPreview(state)`、`enterConfirming(options)` 全部維持不變。

`mountSheet`、`src/sheets.js`、`src/modalIsolation.js`、`src/main.js`、`index.html`、`src/session.css`、`tests/**`、`src/domainTypes.ts` 最終零 diff。既有 28 個 smoke 與 3 個 performance `openSessionSheet` 文字引用零修改；controller duck-typed handle contract 與既有 unit harness 零修改。

DOM 的 id、testid、class、aria、文案、欄位順序、join preview、候選場定案、五態 actions 與全域 CSS 保留。未 commit、未 push。local gate 前依派工授權執行 `CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test`。

## 2. Sheet 批模式：殼與內容責任分界

### `mountSheet` 繼續擁有 surface 殼

公開 factory 仍先呼叫既有 `mountSheet`，傳入的直接子樹維持：

```html
<span class="session-detail-sheet__grabber"></span>
<div class="session-detail"></div>
```

責任分界如下：

- `mountSheet`／`mountSurface`：`#sheet-root`、backdrop、`section[role=dialog]`、surface stack、focus trap、Escape capture、關閉、`onClose` 與 opener 焦點回復。
- React：只掛進既有 `.session-detail` 內容槽，從不寫 `#sheet-root` 或 surface section。
- adapter：把 legacy callbacks 接到 React 產生的 DOM，並把 React 內容中的關閉按鈕委派到 `mounted.close`。

`mountSheet` 掃描 `[data-surface-close]` 時 React 按鈕尚未存在，因此 adapter 在同步 React mount 後，替該按鈕加一條 `mounted.close` listener。真正的 teardown、surface stack、`onClose` 與 restore focus 仍全部走 `mountSheet` 原語；沒有另造 React 版關閉生命週期。

fresh idle sheet 仍不在 adapter 內搶焦，保留 `mountSurface` 的 rAF fallback 讓「×」取得焦點。`initialStage: "confirming"` 仍於 factory 返回前同步聚焦取消鈕。Escape confirming→idle 的一步退階仍由 `onEscape` 回傳 `true` 攔下，其餘狀態交回 `mountSheet` 關閉。

### 檔案慣例

第一個 sheet 元件放在 `src/sheets/SessionDetailSheet.tsx`，而不是 `src/pages/`。固定慣例已補進 `.claude/rules/react-migration.md`：

1. legacy factory／handle 凍結；imperative state push 用 `flushSync`。
2. `mountSheet` 擁有殼，React 只擁有內容槽。
3. sheet TSX 放 `src/sheets/<SheetName>.tsx`，adapter 留原公開模組。
4. 局部更新保持非目標子樹 DOM identity。

## 3. Handle → React state 同步橋接

`mountSessionDetailSheetContent(rootElement, detail, initialSnapshot)` 每張 sheet 建立一個 React root，並回傳內部 bridge：

```ts
interface SessionDetailContentContract {
  renderStage(stage, message?, expectedAccepted?): void;
  setJoinPreview(state: SessionJoinPreviewState): void;
}
```

兩個方法都先更新 module-local snapshot，再以：

```ts
flushSync(() => reactRoot.render(<SessionDetailSheet detail={detail} snapshot={snapshot} />));
```

同步 commit。因此：

- `detail.setJoinPreview(...)` 返回時，名單 loading／ready／error DOM 已更新。
- `detail.enterConfirming(...)` 返回時，`data-join-stage="confirming"`、提示與按鈕已存在，adapter 可立即 wire／focus。
- submitting／success／error 也都在 controller callback 的下一行即可讀到新 DOM。

公開 handle 仍只回傳 `{ ...mounted, setJoinPreview, enterConfirming }`；內部 `renderStage` 沒有擴張到公開 API。

## 4. 五態局部更新與 generation detach

React root 固定掛在整個 `.session-detail`，但內容分成三種更新域：

- `DetailMain`：memo，固定 props；stage／preview 改變時沿用同一批 DOM nodes。
- `JoinPreview`：memo，只在 `setJoinPreview` 時更新。
- `DetailTail`：memo，固定 action note／report error nodes。
- `.session-detail__actions`：容器本身固定，內部以 `actionGeneration` keyed Fragment 在每次 `renderStage` 時 detach／重建。

generation 不只使用 stage 字串：同態重入 `enterConfirming` 也會增加 generation，精確對齊 legacy 每次 `container.innerHTML = ...` 都 detach actions 子節點的語意；`setJoinPreview` 不增加 generation，因此不碰 actions。

實作途中 local trace 抓到一個重要問題：只用一般 reconciliation 時，submitting 的 confirm `<button>` 可能被 success 的「查看我的球局」重用，adapter 掛在舊 node 的 native confirm listener 也會被保留。單次確認先得到 `ACCEPTED`，再點 success CTA 時誤送第二個 RPC，得到 `SESSION_FULL`。generation-keyed detach 後，舊 listener 隨舊 node 離場；隔離 local case 與完整 local gate皆轉綠。這項規則應直接沿用到批 7 的 native wiring／default DOM state。

非 actions 子樹沒有 remount，所以切態不會抹掉其他區域的焦點或選字；actions 每態的焦點交棒仍由既有 `focusInStage` 明確執行。

## 5. 元件拆分與 helper 單一來源

`SessionDetailSheet.tsx` 依既有 DOM 責任拆為：

- 固定內容：`TimeTile`、`DetailMain`、`PlayerAvatar`、`JoinPreview`、`DetailTail`
- actions：`IdleActions`、`Actions`、copy/edit/chat/report/text CTA、clock/check icon、success push prompt
- mount bridge：`mountSessionDetailSheetContent`

`sessionViews.js` export frozen `sessionDetailSheetRuntime`，TSX 只 import 單一既有／抽出來源：

```text
avatarInitial
candidateCourtRows
completionLabel
hostRowBookedStatus
joinConfirmHintText
ongoingSessionMinutes
safeGoogleAvatarUrl
scoreboardNtrpValue
scoreboardVacancyText
sessionCourtLabel
sessionDetailCourtName
sessionTimeTilePresentation
sessionVenuePresentation
showAvatarFallback
successPushPromptPresentation
trustCountText
```

NTRP 直接 import 原 `profile.js` 的 `formatNtrp`。沒有在 TSX 複製格式規則。legacy `trustCountMarkup` 改呼叫唯一 `trustCountText`；舊 detail-only `nowStartSessionMarkup` 收斂成唯一資料 helper `ongoingSessionMinutes`。detail／join preview／actions 的 markup-only helper 已刪除，JSX 是唯一活 presentation。

`sessionViews.js -> SessionDetailSheet.tsx` browser mount 與 `SessionDetailSheet.tsx -> sessionViews.js` runtime 是安全的 ESM live-binding cycle：兩邊都只在函式執行時讀對方 binding。Node direct import 因 `typeof document === "undefined"` 短路 eager glob，不解析 `.tsx`；246 個 unit tests 與 Vite build 均實際驗證。

React best-practices skill 的具體影響：元件定義都在 module scope、直接 import ReactDOM、沒有 barrel、沒有新增 effect/global listener，並用 memo 保護固定內容子樹。

## 6. DOM 凍結細節

既有 smoke 覆蓋了 detail head、venue/instant/ongoing/candidate/host badges、時間、scoreboard、host、notes、fee、candidate panel、五態 actions、push prompt、join preview、avatar fallback 與 escaped names。

完整 mock gate 曾抓到一個非視覺但可觀察的 whitespace 差異：舊 template 在 `NTRP` eyebrow 與值之間有空白 text node，正規化文字是 `NTRP 不限`；初版 JSX 變成 `NTRP不限`。最終 JSX 明確補回 `{" "}`，desktop/mobile 原測試 2/2 通過。沒有改測試。

## 7. 變更清單

- `src/sheets/SessionDetailSheet.tsx`（新增）：strict TSX detail 內容、memo 更新域、generation-keyed actions、同步 imperative bridge。
- `src/sessionViews.js`：detail eager mount、`openSessionSheet` adapter、single-source runtime；刪除被 JSX 取代的 sheet-only markup helpers。
- `.claude/rules/react-migration.md`：新增 sheet 批固定模式。
- `docs/migration-reports/batch-6.md`：本回報。

刻意未改：`src/main.js`、`src/sheets.js`、`src/modalIsolation.js`、`src/domainTypes.ts`、`index.html`、`src/session.css`、`tests/**`、package／lint 設定。

## 8. React 接管有牙紅綠證據

最終程式完成並收斂白名單後，把 `SessionDetailSheet` 暫時改成 `return null`，用派工指定的 `failed|passed` grep 判定：

```bash
set -o pipefail
npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep "join confirmation shares the sheet's own summary" \
  2>&1 | grep -E 'failed|passed'
```

空 React 內容，逐字輸出（pipeline exit 1）：

```text
  1 failed
```

逐字還原後，同一命令逐字輸出（exit 0）：

```text
  1 passed (1.4s)
```

因此 detail e2e 的成功確實依賴 React 內容 mount。

## 9. Repeat-each=3 證據

命令涵蓋 focus trap／Escape、confirming、submitting pending、防重送、success、error/retry、join preview 與 success focus：

```bash
npx playwright test tests/performance.spec.js tests/smoke.spec.js \
  --project=desktop-chromium \
  --repeat-each=3 \
  --grep "keyboard dialogs trap focus|pending join confirmation|join confirmation shares|pre-join roster|distinguishes both requested NTRP"
```

最終逐字結果（exit 0）：

```text
Running 15 tests using 1 worker

  ✓   1 [desktop-chromium] › tests/performance.spec.js:170:1 › keyboard dialogs trap focus and return it to the trigger (854ms)
  ✓   2 [desktop-chromium] › tests/smoke.spec.js:998:1 › a pending join confirmation accepts only one intentional submission (171ms)
  ✓   3 [desktop-chromium] › tests/smoke.spec.js:1173:1 › join confirmation shares the sheet's own summary (no repeat) and becomes an in-place success state (626ms)
  ✓   4 [desktop-chromium] › tests/smoke.spec.js:1456:1 › authenticated pre-join roster renders host first with escaped names, NTRP fallback, and avatar fallback (184ms)
  ✓   5 [desktop-chromium] › tests/smoke.spec.js:1630:1 › join confirmation distinguishes both requested NTRP outcomes without losing success focus (2.0s)
  ✓   6 [desktop-chromium] › tests/performance.spec.js:170:1 › keyboard dialogs trap focus and return it to the trigger (876ms)
  ✓   7 [desktop-chromium] › tests/smoke.spec.js:998:1 › a pending join confirmation accepts only one intentional submission (170ms)
  ✓   8 [desktop-chromium] › tests/smoke.spec.js:1173:1 › join confirmation shares the sheet's own summary (no repeat) and becomes an in-place success state (1.1s)
  ✓   9 [desktop-chromium] › tests/smoke.spec.js:1456:1 › authenticated pre-join roster renders host first with escaped names, NTRP fallback, and avatar fallback (189ms)
  ✓  10 [desktop-chromium] › tests/smoke.spec.js:1630:1 › join confirmation distinguishes both requested NTRP outcomes without losing success focus (1.9s)
  ✓  11 [desktop-chromium] › tests/performance.spec.js:170:1 › keyboard dialogs trap focus and return it to the trigger (811ms)
  ✓  12 [desktop-chromium] › tests/smoke.spec.js:998:1 › a pending join confirmation accepts only one intentional submission (167ms)
  ✓  13 [desktop-chromium] › tests/smoke.spec.js:1173:1 › join confirmation shares the sheet's own summary (no repeat) and becomes an in-place success state (570ms)
  ✓  14 [desktop-chromium] › tests/smoke.spec.js:1456:1 › authenticated pre-join roster renders host first with escaped names, NTRP fallback, and avatar fallback (182ms)
  ✓  15 [desktop-chromium] › tests/smoke.spec.js:1630:1 › join confirmation distinguishes both requested NTRP outcomes without losing success focus (1.5s)

  15 passed (12.9s)
```

另有 desktop/mobile detail targeted sweep 16/16 通過，涵蓋 instant、ongoing、top-sheet Escape、五態、preview、兩種 NTRP outcome 與候選場。

## 10. SHA-256 與 canary 還原

### 批前基準

```text
407ae7e2eb992b4e9681d81c5c474e25e492be3d70fc014e4fed83fc2f6432a2  src manifest（29 檔）
f9df0c437cb00295597bc6a17df0c420b8ad8eb79319c0de3b579fed6a04199c  src/sessionViews.js
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
36dda9c8f3f3feef40b3b8776d188e15aa595375118b2f978406a6d5f7b198cc  src/sheets.js
a7203fa1ff7be6ff63b709cab22d1c0ca69963fb64bbd3cc65cc761d9fc0767f  src/modalIsolation.js
24839cc13adcb4ce59c90c77326576c6fed4c07d338fbf6d834b0d60c7934b9e  src/main.js
da59985dac99550ff46670efa57a9cf76f4a5bac7b6c0a4cd383e2389aacd13a  .claude/rules/react-migration.md
```

### 最終 canary 前／暫改／還原後

排序後逐個 src 檔 SHA-256，再對 manifest 文字取 SHA-256：

```text
before  d1aafd8c97243cee00b322c20cdcf46d71da9bca7e45e6f62212751b8dd3ea26
canary  4a5288acfc76d2876d48ef5d86aca495c6fe459b15a9b1236736246b99d9335d
after   d1aafd8c97243cee00b322c20cdcf46d71da9bca7e45e6f62212751b8dd3ea26
SRC_FILE_COUNT=30
```

canary 直接檔案：

```text
before  c303de07cf6c4cc63b473d877347e8263a1ea71b8e0744f3ee0abce351a8d83b  src/sheets/SessionDetailSheet.tsx
canary  dc3194f8db955ce46d67232409ccf13bfa25a7ebb3b942ec52adaadfcac2ba80  src/sheets/SessionDetailSheet.tsx
after   c303de07cf6c4cc63b473d877347e8263a1ea71b8e0744f3ee0abce351a8d83b  src/sheets/SessionDetailSheet.tsx
```

最終直接檔案：

```text
e9d2a9706d2f5aef6cddcb09d2733125642540a3d5691334c3279ca220ed9333  src/sessionViews.js
c303de07cf6c4cc63b473d877347e8263a1ea71b8e0744f3ee0abce351a8d83b  src/sheets/SessionDetailSheet.tsx
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
36dda9c8f3f3feef40b3b8776d188e15aa595375118b2f978406a6d5f7b198cc  src/sheets.js
a7203fa1ff7be6ff63b709cab22d1c0ca69963fb64bbd3cc65cc761d9fc0767f  src/modalIsolation.js
24839cc13adcb4ce59c90c77326576c6fed4c07d338fbf6d834b0d60c7934b9e  src/main.js
3bef9149f70f295e28a01be40b8b1207e88b2913d58b53fb4690b1b1ddfa90a4  .claude/rules/react-migration.md
```

凍結的 domain／surface／main 四檔批前後同 SHA。canary 全數還原。

## 11. Bundle 前後對照

批前取批 5 最終工作樹；批後使用相同依賴與 `gzip -c | wc -c`：

| 狀態 | modules | 主 JS raw | 主 JS gzip | CSS raw/gzip | 小 JS raw/gzip |
| --- | ---: | ---: | ---: | ---: | ---: |
| 批前（批 5） | 99 | 692,694 B | 195,737 B | 67,426 / 10,678 B | 1,932 / 971 B |
| 批後 | 100 | 696,440 B | 196,526 B | 67,426 / 10,678 B | 1,932 / 971 B |
| 差額 | +1 | **+3,746 B** | **+789 B** | 0 / 0 | 0 / 0 |

React runtime 已於批 3 進 bundle；本批同時刪除舊 markup helpers，所以新增 detail TSX 的 gzip 邊際只有 789 B。沒有新 dependency、CSS 或小 chunk 膨脹；既有 500 kB 主 chunk warning 維持。

批前 Vite 摘要：

```text
vite v6.4.3 building for production...
transforming...
✓ 99 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-DA7HTyMH.js   692.69 kB │ gzip: 196.43 kB
✓ built in 918ms
```

批後摘要見第 13 節。

## 12. 全 repo consumer sweep

### `openSessionSheet`

Production：

```text
src/sessionViews.js:1890  export definition
src/main.js:83            import（未改）
src/main.js:1490          production call（未改）
```

`tests/smoke.spec.js` 28 個文字引用（未改）：

```text
1005,1012
1180,1181
1364,1366
1421,1422
1438,1439
1463,1489
1540,1541
1609,1610
1619,1620
1640,1641
1708,1714
1733,1734
1853,1854
2783,2790
```

`tests/performance.spec.js` 3 個文字引用（未改）：`215,218,219`。

歷史 docs 只有 `docs/superpowers/plans/2026-07-17-public-taipei-tennis-session-mvp.md`、`2026-07-21-instant-join-mode.md`、`2026-08-08-batch-c3-inline-join-flow.md` 的規格文字，沒有 active consumer。

### Handle 方法

```text
src/sessionController.js:610,617,621   setJoinPreview loading/ready/error
src/sessionController.js:1598,1609     enterConfirming resume/manual path
src/domainTypes.ts:125-126             frozen SessionDetailSurfaceContract
tests/session-controller.test.js:123,134,140  duck-typed harness
tests/smoke.spec.js:1490               direct setJoinPreview e2e
src/sessionViews.js:1963,2082,2103     adapter methods/return
```

### 新 mount／runtime 與被動到 helper

- `mountSessionDetailSheetContent`：定義 `src/sheets/SessionDetailSheet.tsx:551`；唯一取得／呼叫點 `src/sessionViews.js:27-30,1916,1940`。
- `sessionDetailSheetRuntime`：唯一 export `src/sessionViews.js:1859`；唯一 module consumer `src/sheets/SessionDetailSheet.tsx:7`。
- detail-only pure helpers：只在 `sessionViews.js:1802-1875` 定義／runtime export，由 TSX 消費。
- `trustCountText`：definition `src/sessionViews.js:92`；legacy `trustCountMarkup` 與 TSX join preview 共用。
- `ongoingSessionMinutes`：definition `src/sessionViews.js:582`；只由 runtime/TSX detail 使用。
- `formatNtrp`：仍是 `profile.js` 的唯一來源。
- `scripts/`：上述 factory、handle、mount、runtime 全部零 consumer。
- `supabase/functions/`：上述符號全部零 consumer。

## 13. 全部 gate 結尾輸出（逐字）

### `npm test`（含 pretest）

exit 0；摘要逐字：

```text
--check 通過:產出檔案與 data/courts.json 重生結果一致。
# tests 246
# suites 0
# pass 246
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1851.564
  4 skipped
  250 passed (2.3m)
```

### `npm run test:local`

local DB reset 後 exit 0；摘要逐字：

```text
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3988.502125
  11 skipped
  42 passed (1.4m)
```

### `npm run typecheck`

```text
> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit
```

### `npm run lint`

```text
> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{ts,tsx}" vite.config.ts
```

### `npm run prettier:check`

```text
> tennis-partner-finder@0.1.0 prettier:check
> prettier --check "src/**/*.{ts,tsx}" vite.config.ts

Checking formatting...
All matched files use Prettier code style!
```

### `npm run build`

```text
> tennis-partner-finder@0.1.0 build
> vite build

vite v6.4.3 building for production...
transforming...
✓ 100 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-ei1wyWD4.js   696.44 kB │ gzip: 197.26 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 819ms
```

精確 byte：

```text
index-Ckdsfrjg.css raw=67426 gzip=10678
index-Zt4BwSlo.js raw=1932 gzip=971
index-ei1wyWD4.js raw=696440 gzip=196526
```

### `git diff --check`

```text
(no output)
EXIT_CODE=0
```

## 14. Git diff stat

`git diff --stat`（tracked；新增未追蹤檔另列）：

```text
 .claude/rules/react-migration.md |   7 +
 src/sessionViews.js              | 402 +++++++--------------------------------
 2 files changed, 75 insertions(+), 334 deletions(-)
```

untracked：

```text
src/sheets/SessionDetailSheet.tsx        586 lines
docs/migration-reports/batch-6.md        (this report)
```

`src/sessionViews.js` 的大幅刪除來自 sheet-only HTML helpers 退役；白名單外的 Prettier 換行噪音已全部還原。`git status --short` 最終只包含上述四個允許路徑。未 commit、未 push。
