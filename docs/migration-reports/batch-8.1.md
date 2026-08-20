# 批 8.1：球場雙 drawer＋unavailable sheet 遷移 React 回報

日期：2026-08-19（Asia/Taipei）

## 1. 結論

三個公開 factory 已在簽名、預設值、同步建立語意與回傳 handle 零變更下，把 `mountSheet` surface 內的內容遷移到 strict TSX：

- `openSessionUnavailableSheet()`
- `openCourtSessionDrawer(court, sessions, { courts, onOpenSession })`
- `openCourtPlayersDrawer(court, players, { onClose, onOpenPlayer })`

`mountSheet` 仍唯一擁有 `#sheet-root`、backdrop、`section.surface`、focus trap、capture-phase Escape、surface stack、dismiss、close、isolation 與 opener 焦點回復。React 只掛進 `mounted.surface` 的 child list。

同時新增共用 `src/components/SessionCard.tsx`，Nearby drawer 與 court-session sheet 共用；legacy lowercase `sessionCard()` 字串 template 及其唯一 caller 已退役，連帶零 caller 的 `sessionTimeTileMarkup()` 一併移除。

`src/main.js`、`src/sessionController.js`、`src/sheets.js`、`src/modalIsolation.js`、`tests/**` 與其他凍結檔全數零 diff。未 commit、未 push；本批不需 DB reset。

## 2. Surface 殼／React 內容責任分界

三個 factory 都先同步建立原 surface 殼：

```js
const mounted = mountSheet({
  id: "...",
  label: "...",
  onClose,
  html: "",
});
```

再把 React 掛進殼已建立的 `mounted.surface`：

```text
#sheet-root                         mountSheet 擁有
├─ .surface-backdrop               mountSheet 擁有
└─ section.surface[role=dialog]     mountSheet 擁有
   ├─ .surface__head                React 內容
   └─ list/message                  React 內容
```

每個 content mount 都以 `createRoot(mounted.surface)`＋`flushSync` 首次 commit；factory 返回時 head、close、cards／empty copy 已在 DOM，native wiring 可以立即查詢。

mountSheet 建殼時 content 尚空，因此它當下找不到 `[data-surface-close]` 可綁；React close button 保留原 attribute，click handler 只呼叫 adapter 傳入的 `mounted.close()`。它沒有重做 close：真正的 closed guard、stack remove、Escape listener remove、isolation release、root teardown、`onClose({ reason })` 與 focus restore 仍全在 `mountSheet` handle。

三 factory 的外部 handle 不擴張：

- unavailable：仍回 `{ root, surface, close }`。
- court sessions：仍回 `{ root, surface, close }`。
- court players：仍回 `{ root, surface, close }`，既有 `onClose` 仍由 mountSheet 呼叫。

## 3. 三個 content 元件

### `SessionUnavailableSheet.tsx`

純靜態 head＋message。凍結：

```text
id/testid  session-unavailable-sheet（由殼建立）
label      找不到球局
eyebrow    球局連結
h2         找不到這個球局
close aria 關閉找不到球局訊息
message    這個球局可能已下架、不再開放，或連結有誤。
```

### `CourtSessionSheet.tsx`

輸出原 head、`.nearby-sessions__cards`、compact session cards 或原空文案。`wireSessionCards(mounted.root, onOpenSession)` 仍在 adapter，且只在 React 同步 commit 後執行；React card 本身不接 click callback。

凍結：

```text
id/testid  court-session-sheet
label      球場球局
eyebrow    court.district || court.city || "台北市"
h2         court.name
close aria 關閉球場球局
empty      這座球場目前沒有可加入的球局。
```

### `CourtPlayersSheet.tsx`

輸出原 head、player-card rows 或原空文案。`[data-player-id]` click 仍由 adapter 查回原 `players` array 中的 object，再把同一 object 傳給 `onOpenPlayer(target)`；callback identity/payload 未被 React props snapshot 取代。

凍結：

```text
id/testid  court-players-sheet
label      球場球友
h2         `${court.name}・球友`
row testid `court-player-card-${profileId}`
presence   isPresent 才顯示；openToGreeting 才附「 · 接受現場問候」
types      playTypes.join("、") || "未填打法"
empty      這座球場目前沒有在線球友。
```

`courtPlayerCardPresentation` 留在 `sessionViews.js` frozen runtime，統一 `formatNtrp`、presence/greeting label、truthy visibility 與 `String(...)` 邊界；TSX 不複製既有 helper。

## 4. 共用 `SessionCard` 與 circular import 邊界

`src/components/SessionCard.tsx` 接受：

```ts
interface SessionCardProps {
  compact?: boolean;
  courts?: SessionCardCourt[] | null;
  session: Partial<SessionSummary>;
}
```

`compact` 原值直接餵進唯一來源 `sessionCardPresentation(session, { compact, courts })`。以下 class 只從 presentation 產出，TSX 沒有硬編 modifier：

```text
session-card--compact
time-tile--compact
```

共用 consumer：

```text
NearbySessionsDrawer.tsx  compact=false（預設）
CourtSessionSheet.tsx     compact=true
```

`sessionCardRuntime` 只 export `sessionCardPresentation`；Nearby 自己的 runtime 則只剩 discovery empty、date groups、day word，card presentation 不再綁在 Nearby 私有元件。

### Lazy runtime resolve 論證

`sessionViews.js` 的 browser eager globs 會載入 Nearby／sheet，這些 TSX 再 import `SessionCard`，`SessionCard` 又 import `sessionCardRuntime` binding，形成已知 circular module edge。若在 TSX module top level讀 runtime const，會在 `sessionViews` 完成 export 初始化前觸發 TDZ。

因此 component 只在 render 時 lazy resolve：

```ts
function runtime(): SessionCardRuntime {
  return sessionCardRuntime as unknown as SessionCardRuntime;
}
```

factory/render 呼叫發生於 module graph 初始化完成後，沒有 top-level dereference。`CourtPlayersSheet` 的 `courtPlayersSheetRuntime` 同樣採 lazy resolve。這沿用批 8 已驗證的 circular 邊界，且 build 無 circular/TDZ warning、全部 browser tests 無 runtime error。

React best-practices skill 的具體影響：components 全在 module scope；沒有 Effect、React document listener、barrel import 或額外 state；native callback ownership 不搬進 React，避免重複 listener 與 render churn。

## 5. Legacy card／time markup 退役

開工 production grep：

```text
src/sessionViews.js:547:function sessionTimeTileMarkup(session, venue, options = {}) {
src/sessionViews.js:617:function sessionCard(session, { compact = false, courts = [] } = {}) {
src/sessionViews.js:622:    ${sessionTimeTileMarkup(session, presentation.venue, { compact })}
src/sessionViews.js:2879:            ? sessions.map((session) => sessionCard(session, { compact: true, courts })).join("")
```

可見 `openCourtSessionDrawer` 是 `sessionCard()` 唯一 production caller，而 `sessionTimeTileMarkup()` 只被 `sessionCard()` 呼叫。本批用共用 React card 取代後，兩個 function 一併刪除；原註解改指向仍存活的 `sessionTimeTilePresentation`。

退役後 executable reverse grep 逐字：

```text
$ rg -n "sessionCard\(|sessionTimeTileMarkup" src scripts supabase
[no output] (exit 1: no matches)
```

全 repo（排除 migration reports）逐字只剩一條派工明示不算 caller 的 test 註解與兩條歷史規劃文字：

```text
tests/session.spec.js:581:  // 批 D2:discovery 卡(sessionCard())不掛 venue.badge 文字("候選局"只在詳情 sheet
docs/frontend-migration-plan-2026-08-18.md:151:  `nearbySessionsDrawerRuntime` 單一來源，legacy sessionCard() 字串版共用同一 presentation。
docs/frontend-migration-plan-2026-08-18.md:201:  sessionCardPresentation 後，legacy sessionCard() 字串版即可退役（單一來源收官）。
```

`src/pages/MySessionsPage.tsx` 仍有 uppercase private React `SessionCard` component；它不是退役的 lowercase string helper，也不是本批 production caller。

## 6. HEAD/current DOM 逐屬性 probe

以 `HEAD=edef33186af567bd107e89418b8ee01021483719` 建獨立 temp tree，複製相同 `.env.local`，HEAD/current 各啟一個 Vite。browser probe 對每個 element 比較：tag、排序後完整 attributes、直接文字（只正規化 whitespace）、child element 順序；fixture 刻意含 `<`、`&`，同時驗 escape。

案例：unavailable、court sessions 有資料／空態、court players 有資料／空態、Nearby collapsed/open。逐字結果：

```json
{
  "cases": [
    "unavailable",
    "court-sessions",
    "court-sessions-empty",
    "court-players",
    "court-players-empty",
    "nearby-collapsed",
    "nearby-open"
  ],
  "matched": 7,
  "mismatches": []
}
```

這同時證明抽共用卡後 Nearby 的 DOM output 零變更，及三個 surface 的 id/testid/class/data/aria/text/element tree 與 HEAD 一致。

## 7. React 接管 canary：三 surface 同時紅→綠

canary 前記錄六個相關 src SHA：

```text
572158e67047e2f6375006c315127ca21fa9a213165d44793e1dfdbb2bee2b2e  src/sessionViews.js
50315720137eafa14443fc5c2522283d7d81eb32ae302cb72970daf2109e8d42  src/components/SessionCard.tsx
7f2be243c14ba21c425ea98d039a64274f798c87434585d971d25b2ecf189127  src/pages/NearbySessionsDrawer.tsx
4710aa515378079ee666a4ad0d4ce0b34963ac4d291c871aba8538c7716e9919  src/sheets/SessionUnavailableSheet.tsx
583a9c76d174d0f24c11b7e80bb82270e6a04d6010ba73a2df510d58ae1c876c  src/sheets/CourtSessionSheet.tsx
3ebca317312b6a9fec192262bca93f8ad5644fb77d40c4e84b2b559c506066ca  src/sheets/CourtPlayersSheet.tsx
```

暫時把三個 content mount 的 `reactRoot.render(<... />)` 都改成 `reactRoot.render(null)`，執行三條真正讀 surface 內容的原 e2e：

```bash
TENNIS_TEST_HARNESS_MODE=mock npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep "hash session link opens|drawer, filters, session sheet|mock online layer uses presence pins"
```

紅燈三個 failure 分別命中：

```text
Locator: locator('#session-unavailable-sheet')
Expected substring: "找不到這個球局"
Received string:    ""

Locator:  locator('#court-session-sheet [data-testid=\'session-card\']')
Expected: 1
Received: 0

Locator: getByTestId('court-player-card-8001')
Expected substring: "示範山嵐"
Error: element(s) not found
```

`grep 'failed|passed'` 逐字：

```text
    Error: expect(locator).toContainText(expected) failed
    Error: expect(locator).toHaveCount(expected) failed
    Error: expect(locator).toContainText(expected) failed
  3 failed
```

逐字還原後同命令：

```text
  ✓  1 [desktop-chromium] › tests/smoke.spec.js:386:1 › a hash session link opens its detail, copies a stable share link, and gives an empty state when unavailable (640ms)
  ✓  2 [desktop-chromium] › tests/smoke.spec.js:2834:1 › drawer, filters, session sheet, and empty reset preserve the session-only flow (2.7s)
  ✓  3 [desktop-chromium] › tests/smoke.spec.js:4618:1 › mock online layer uses presence pins while the full directory list opens cards and invitations (1.6s)

  3 passed (5.8s)
```

還原後 `shasum -a 256 -c` 逐字：

```text
src/sessionViews.js: OK
src/components/SessionCard.tsx: OK
src/pages/NearbySessionsDrawer.tsx: OK
src/sheets/SessionUnavailableSheet.tsx: OK
src/sheets/CourtSessionSheet.tsx: OK
src/sheets/CourtPlayersSheet.tsx: OK
```

## 8. Consumer sweep

### Public factory production consumers

```text
src/sessionViews.js:2062           openSessionUnavailableSheet export
src/main.js:84                     import
src/main.js:207                    唯一 caller

src/sessionViews.js:2847           openCourtSessionDrawer export
src/main.js:72                     import
src/main.js:1500                   唯一 caller adapter

src/sessionViews.js:2880           openCourtPlayersDrawer export
src/main.js:73                     import
src/main.js:1501                   app adapter caller
src/sessionController.js:405       default injected dependency
src/sessionController.js:1503      controller caller
```

### Existing direct test consumers（零修改）

```text
tests/smoke.spec.js:3170           direct openCourtPlayersDrawer
tests/smoke.spec.js:3356           direct empty drawer
tests/smoke.spec.js:3401           controller injection
tests/smoke.spec.js:4632,4658      import＋controller injection
tests/session-controller.test.js:286 harness duck type
```

Unavailable／court session 的 smoke/performance assertions 經 main 間接呼叫，沒有額外 symbol import。

### New internal mount/runtime consumers

```text
src/sessionViews.js:45-54           三個 browser-only eager mount symbols
src/sessionViews.js:1411            sessionCardRuntime export
src/sessionViews.js:2877            courtPlayersSheetRuntime export
src/components/SessionCard.tsx:2    runtime import
src/pages/NearbySessionsDrawer.tsx:5 common SessionCard import
src/sheets/CourtSessionSheet.tsx:4  common SessionCard import
src/sheets/SessionUnavailableSheet.tsx:32 mount export
src/sheets/CourtSessionSheet.tsx:56 mount export
src/sheets/CourtPlayersSheet.tsx:96 mount export
```

`scripts/**`、`supabase/**` 無 factory/runtime/component consumer。

## 9. 變更清單

- `src/components/SessionCard.tsx`（新增）：共用 session card JSX、lazy runtime bridge、compact prop。
- `src/sheets/SessionUnavailableSheet.tsx`（新增）：靜態 unavailable content。
- `src/sheets/CourtSessionSheet.tsx`（新增）：球場球局 head/list/empty content。
- `src/sheets/CourtPlayersSheet.tsx`（新增）：球場球友 head/list/empty content。
- `src/pages/NearbySessionsDrawer.tsx`：刪 private card，改 import 共用版；其餘 drawer 邏輯不動。
- `src/sessionViews.js`：三 mount adapters、兩個 frozen runtimes、player presentation；移除三段 string HTML、`sessionCard()` 與 `sessionTimeTileMarkup()`。
- `docs/migration-reports/batch-8.1.md`：本回報。

刻意未改：`main.js`、`sessionController.js`、`sheets.js`、`modalIsolation.js`、`map.js`、`pins.js`、HTML、CSS、domain types、migration rules、tests。

## 10. Bundle 前後對照

HEAD temp 與本批用相同 `.env.local`／`node_modules` 各跑 `npm run build`；所有數字本批重算：

| | Batch 8 HEAD | Batch 8.1 | delta |
| --- | ---: | ---: | ---: |
| transformed modules | 103 | 107 | +4 |
| Vite main JS | 700.41 kB | 701.84 kB | +1.43 kB |
| Vite gzip | 198.58 kB | 198.91 kB | +0.33 kB |
| exact raw bytes | 700,411 | 701,836 | +1,425 |
| local `gzip -c` bytes | 197,892 | 198,230 | +338 |

四個新增 modules 對應一個共用 component＋三個 sheet contents；移除 legacy strings 抵銷部分 JSX，無異常膨脹。CSS、HTML、小 analytics chunk 不變。

before：

```text
✓ 103 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-8SSLlVBC.js   700.41 kB │ gzip: 198.58 kB
✓ built in 882ms
```

after：

```text
✓ 107 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-BMY2vjV3.js   701.84 kB │ gzip: 198.91 kB
✓ built in 881ms
```

## 11. SHA-256 對照

Batch 開始：

```text
12918ba2a01959bb7eef3c9d1e5620f36651eab49fe224db72a665687cdb0d34  src/sessionViews.js
0be9699dd6cd6ce168194cabc698b4c10c290167be5a6f29e2d7c329795a9d07  src/pages/NearbySessionsDrawer.tsx
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
3bef9149f70f295e28a01be40b8b1207e88b2913d58b53fb4690b1b1ddfa90a4  .claude/rules/react-migration.md
```

最終：

```text
572158e67047e2f6375006c315127ca21fa9a213165d44793e1dfdbb2bee2b2e  src/sessionViews.js
50315720137eafa14443fc5c2522283d7d81eb32ae302cb72970daf2109e8d42  src/components/SessionCard.tsx
7f2be243c14ba21c425ea98d039a64274f798c87434585d971d25b2ecf189127  src/pages/NearbySessionsDrawer.tsx
4710aa515378079ee666a4ad0d4ce0b34963ac4d291c871aba8538c7716e9919  src/sheets/SessionUnavailableSheet.tsx
583a9c76d174d0f24c11b7e80bb82270e6a04d6010ba73a2df510d58ae1c876c  src/sheets/CourtSessionSheet.tsx
3ebca317312b6a9fec192262bca93f8ad5644fb77d40c4e84b2b559c506066ca  src/sheets/CourtPlayersSheet.tsx
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
3bef9149f70f295e28a01be40b8b1207e88b2913d58b53fb4690b1b1ddfa90a4  .claude/rules/react-migration.md
```

完整 sorted `src/**` manifest diff 只有：新增共用 component、三個 sheet contents，及預期修改 Nearby/sessionViews。domain types、migration rule 與所有其他 src hashes 不變。凍結檔 `git diff --name-only HEAD -- ...` 無輸出。

## 12. 完整 gate 結尾輸出（逐字）

### `npm test`（含 pretest）

```text
> tennis-partner-finder@0.1.0 pretest
> node scripts/generate-courts-seed.mjs --check

--check 通過:產出檔案與 data/courts.json 重生結果一致。
```

unit：

```text
1..246
# tests 246
# suites 0
# pass 246
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1856.915667
```

desktop＋mobile：

```text
  ✓  250 [mobile-chromium] › tests/smoke.spec.js:5183:1 › openFilterSheet mounts a dialog with six data-filter groups and closes on Escape (182ms)
  ✓  251 [mobile-chromium] › tests/smoke.spec.js:5220:1 › the filter sheet applies a district change immediately to the background drawer summary and keeps keyboard focus off body (192ms)
  ✓  252 [mobile-chromium] › tests/smoke.spec.js:5286:1 › closing and reopening the filter sheet three times does not stack delegated listeners on the shared sheet root (506ms)
  ✓  253 [mobile-chromium] › tests/smoke.spec.js:5327:1 › the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading (1.4s)
  ✓  254 [mobile-chromium] › tests/smoke.spec.js:5359:1 › the filter sheet traps Tab focus between its own first and last controls (219ms)

  4 skipped
  250 passed (2.3m)
```

### `npm run test:local`

API：

```text
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4232.340542
```

Supabase Chromium：

```text
  ✓  49 [supabase-chromium] › tests/session.spec.js:2036:1 › neutral counts stay hidden at zero and appear on all three surfaces once a session is played (3.0s)
  ✓  50 [supabase-chromium] › tests/session.spec.js:2156:1 › a brand-new account is subscribed to every active Taipei court when it first saves a profile (919ms)
  ✓  51 [supabase-chromium] › tests/session.spec.js:2180:1 › N1 an existing zero-subscription account is never seeded by a later profile save (933ms)
  ✓  52 [supabase-chromium] › tests/session.spec.js:2199:1 › N2 an account that explicitly cleared every court stays at zero across later profile saves (1.3s)
  ✓  53 [supabase-chromium] › tests/session.spec.js:2226:1 › N3 a failing subscription seed never fails the profile save (757ms)

  11 skipped
  42 passed (1.5m)
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
vite v6.4.3 building for production...
transforming...
✓ 107 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-BMY2vjV3.js   701.84 kB │ gzip: 198.91 kB
✓ built in 881ms
```

既有 500 kB warning 類型與 before 相同。

### `git diff --check`

```text
[no output] (exit 0)
```

## 13. `git diff --stat`／工作樹

報告落檔前 tracked stat：

```text
 src/pages/NearbySessionsDrawer.tsx |  53 +-----------------
 src/sessionViews.js                | 111 +++++++++++++++----------------------
 2 files changed, 47 insertions(+), 117 deletions(-)
```

Git 不把 untracked 納入 `git diff --stat`；另有：

```text
?? src/components/SessionCard.tsx             77 lines
?? src/sheets/SessionUnavailableSheet.tsx     35 lines
?? src/sheets/CourtSessionSheet.tsx           59 lines
?? src/sheets/CourtPlayersSheet.tsx           99 lines
?? docs/migration-reports/batch-8.1.md         本回報
```

最終不 stage、不 commit、不 push。

> **批 12 後註（2026-08-20）**：本節記載的 `as unknown as` 雙重斷言寫法已全面移除。
> 實測顯示它會吞掉 `sessionViews.js` 的 runtime 匯出漂移（改名或改回傳形狀，`tsc` 都靜默通過）。
> 根因是 `sessionCardPresentation` 的 `courts = []` 被推成 `never[]`，已改以 JSDoc 標註修正，
> 10 處斷言全部可直接刪除。新程式碼請勿再沿用此寫法，詳見 `docs/migration-reports/batch-12.md`。
