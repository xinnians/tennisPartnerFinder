# 批 7：建局／編輯表單 sheet 遷移 React 回報

日期：2026-08-18（Asia/Taipei）

## 1. 結論

`openCreateSessionSheet(options = {})` 與 `openEditSessionSheet(session, options = {})` 的公開名稱、參數、預設值、同步建立語意及回傳 handle 全數凍結。兩者仍回傳 `mountSheet` 的 `root`、`surface`、`close(options)`，並保留同步 `setCourts(courts, { ready })`。

兩張 sheet 的 surface 子內容已由 React 19 接管：

- `src/sheets/CreateSessionSheet.tsx`：建局表單、成功頁、離散表單 state 與同步 imperative bridge。
- `src/sheets/EditSessionSheet.tsx`：編輯表單、球場 options state 與同步 imperative bridge。
- `src/sessionViews.js`：凍結的 legacy factory／validation／`runAsyncAction` adapter 與唯一 runtime helper 來源。

`mountSheet`、`src/sheets.js`、`src/modalIsolation.js`、`src/main.js`、`index.html`、`src/session.css`、`tests/**`、`src/domainTypes.ts` 最終零 diff。既有 testid、id、class、aria、文案、欄位順序、surface 結構、submit payload 與 controller duck-typed handle 全部保留。未 commit、未 push。

## 2. Sheet 殼／內容責任分界

兩個 factory 仍先同步呼叫 `mountSheet`：

```js
const mounted = mountSheet({
  id: "...",
  label: "...",
  className: "...",
  onClose,
  html: "",
});
```

React root 建在 `mounted.surface` 上，只管理該 `section.surface` 的 child list；surface element 本身及其外層不屬於 React。因此沒有為遷移新增 wrapper，React 輸出的第一層仍是舊 DOM 的 head＋form／scroll：

- `mountSheet`／`mountSurface`：`#sheet-root`、backdrop、`section[role=dialog]`、aria-modal/label、surface stack、focus trap、Escape、dismiss、teardown、`onClose` 與 opener 焦點回復。
- React：既有 surface 內的 head、form、成功頁與表單內容。
- legacy adapter：validation、`runAsyncAction`、controller callbacks、公開 handle 與 React imperative bridge。

close button 仍帶原本的 `data-surface-close`，但因 mountSheet 建立時 React 尚未輸出按鈕，React click handler 只委派至 `mounted.close()`；真正的 stack teardown、reason、restore focus 與 `onClose` 仍全部由 mountSheet 處理。mountSheet 的下一個 animation frame會從 React 已同步 commit 的內容中找到第一顆可聚焦按鈕，因此進場焦點仍落在既有返回／關閉鍵。

兩個 mount 函式的 initial render 與所有公開 `setCourts` state push 都包在 `flushSync`；factory 或 handle 返回時 DOM 已反映最新 props/state。

## 3. 表單 state 設計

### Create

`CreateSessionSheet` 只把會產生衍生視覺的離散值放進 React state：

```text
mode, court, candCourts, dateKey, customDate,
slot, time, timeCustom, nowStart,
type, band, need, instant, booked,
availableCourts, courtsReady, stage, done presentation
```

費用說明與備註不進 React state。兩顆 textarea 以 `defaultValue`／ref 維持 uncontrolled，submit 當下才讀 `.value` 合併進 form snapshot。這保留舊碼「input 只更新草稿、不呼叫 sync()」的核心語意，並進一步消除每鍵 JS state 寫入。

React imperative handle：

```ts
interface CreateSessionContentContract {
  setCourts(courts, options?): void;
  showDone(value, result?): void;
}
```

公開 handle 仍只有 `{ ...mounted, setCourts }`；`showDone` 是 adapter 內部橋接，沒有擴張外部 API。

submit 仍由 `sessionViews.js` 執行：

1. `createSessionFormCanPublish(form)` 的原守門／toast。
2. `createSessionFormRawInput` → frozen `validateCreateSessionInput`。
3. 原 `runAsyncAction` disable／error／restore 時序。
4. success 後同步 `content.showDone(validation.value, result)`，同 sheet 切成功頁。

`onViewMySessions` 仍以 `{ reason: "view-my-sessions", restoreFocus: false }` 關閉；回到地圖仍走預設 close。

### Edit

edit 只把球場 options／ready、球場 select、打法 select、缺額 radio 放 React state。以下仍是 uncontrolled：

```text
datetime-local、NTRP min/max、feeNote textarea、notes textarea、details open state
```

submit 仍以 `new FormData(form)` 讀取八欄原始值（startAtLocal/courtId/playType/slotsMissing/
ntrpMin/ntrpMax/feeNote/notes；原文「九欄」為手數誤植，驗收 read-back 以指令逐欄核對後修正），
再交給 frozen `validateUpdateSessionInput` 與 `runAsyncAction`。打法改為單打／雙打時對缺額 1／3 的連動與 legacy select change 相同。

`setCourts` 會先讀 live select 值，再同步更新 React options；使用者已選球場可在 catalogue refresh 後保留，且不碰其他 uncontrolled inputs。

## 4. legacy `sync()` 對映表

| legacy `sync()` 責任 | React 對映 | 凍結結果 |
| --- | --- | --- |
| mode `is-active`／`aria-pressed` | `form.mode` render | fixed/candidate 兩鍵逐屬性一致 |
| single/candidate court 區 hidden | `isCandidate` derived boolean | 非目前分支不進 tab order |
| fixed time／candidate slot hidden | `isCandidate` derived boolean | 分區顯隱一致 |
| booked toggle／candidate alternate copy hidden | `isCandidate` derived boolean | 候選模式文案一致 |
| fixed court `is-selected` | `form.court` | catalogue refresh 保留選取 |
| candidate court `is-selected` | `form.candCourts` | 2–3 座、最多 3 座 toast；`Object.keys` payload 順序維持原語意 |
| candidate count HTML | `candidateCount` JSX | `已選 N/3` 與 mono span 結構一致 |
| date chip／custom date hidden/value | `dateKey/customDate` | custom change 後 hidden startAt 同步更新 |
| slot chips | `form.slot` | candidate publish gate 一致 |
| preset/now/custom time chips | `time/timeCustom/nowStart` | selected class 與現在開打語意一致 |
| time stepper output | `bumpCreateTimeMinutes` 單一來源 | 06:00–22:00、15 分鐘步進一致 |
| play type／NTRP band chips | `type/band` | 雙打預設、NTRP 不限預設一致 |
| need output／hidden input | `form.need` | 1–3 clamp、單打→1、雙打→3 一致 |
| instant/booked aria | boolean state | aria-checked／aria-label 逐字一致 |
| hidden startAt input | 原 `createFixedStartAtLocal`／`createCandidateWindowLocal` | Taipei datetime payload 一致 |
| publish ready class/text | 原 `createSessionFormCanPublish` | 無 native disabled；未完成仍以 toast 引導 |
| courts loading/empty status | `courtsReady + availableCourts` | status、hidden、aria-live 一致 |
| feeNote/notes input | uncontrolled ref | 每鍵不觸發 render；submit 時讀值 |
| form/done stage | 兩個固定 sibling 子樹的 hidden state | 成功頁同 sheet、form 仍留在 DOM 且 hidden |

## 5. IME／游標安全性論證

### 為何 composition-safe

1. Create 的 feeNote／notes 沒有 `value`、`onInput` 或 `onChange`；每個文字鍵不會呼叫 `setState`。
2. Edit 的 datetime-local、NTRP、feeNote、notes 同樣只有 `defaultValue`；打字由 browser DOM 擁有。
3. submit 時才從 ref／`FormData` 讀 live DOM 值，沒有 React state 快照過期問題。
4. catalogue `setCourts` 或其他離散控制造成 render 時，textarea/input 的 element type、位置與 key 不變；React 不寫它們的 live `.value`，所以 composition buffer、selection 與 DOM identity 保留。
5. Create 的自訂日期是唯一 controlled native input；舊碼本來就在 `change` 時更新 `customDate` 並呼叫 `sync()`。它是 `type=date` 的 commit control，不是 feeNote／notes／datetime typing path。
6. 時間選擇是既有 chips＋stepper output，沒有受控文字時間輸入；edit 的 `datetime-local` 則維持 uncontrolled。

既有 e2e `delayed Taipei court options hydrate open profile and create forms without losing drafts` 原樣通過，確認 notes 草稿在公開 `setCourts` 後仍在。

另以不落檔 browser probe 在 compositionstart 與 compositionend 之間呼叫公開 `setCourts`，並同時實點時間 stepper，連跑三輪。逐字結果：

```text
[
  {
    "bumped": "19:45",
    "iteration": 1,
    "restored": "19:30",
    "focused": true,
    "nodeSame": true,
    "selectionEnd": 2,
    "selectionStart": 2,
    "value": "中文草稿"
  },
  {
    "bumped": "19:45",
    "iteration": 2,
    "restored": "19:30",
    "focused": true,
    "nodeSame": true,
    "selectionEnd": 2,
    "selectionStart": 2,
    "value": "中文草稿"
  },
  {
    "bumped": "19:45",
    "iteration": 3,
    "restored": "19:30",
    "focused": true,
    "nodeSame": true,
    "selectionEnd": 2,
    "selectionStart": 2,
    "value": "中文草稿"
  }
]
3 passed: time stepper + composition-safe setCourts
```

這是 DOM identity／selection 的自動實證；派工指定的實機中文輸入法手動檢查仍留給驗收方。

## 6. keyed detach 教訓的套用

本批沒有讓同一顆 button 在不同 stage 換成另一種語意：

- legacy create 的 form 與 done 原本就同時存在於不同 sibling 子樹，只切 `hidden`；React 保留同一結構，所以 publish、查看我的球局、回到地圖不會互相 reconciliation reuse。
- edit submit 從頭到尾只有「儲存變更」一種語意。
- court cell 以 court id key，且 fixed/candidate 位於不同固定 parent；catalogue refill 只重用同一球場同一語意的 node。
- 事件使用 React handler，不替會換語意的 node 掛 native listener；`runAsyncAction` 只同步 mutate 當次固定 submit node 的 disabled/error 狀態。

因此本批不需要額外 generation remount。這不是略過批 6 規則，而是先把語意槽分離：若後續把 form/done 改為同一 conditional slot，必須先加不同 key/generation，不能讓 submit node 變成 success CTA。

## 7. helper 單一來源與 riders

### Runtime 單一來源

`src/sessionViews.js` export frozen `sessionFormSheetRuntime`：

```text
bumpCreateTimeMinutes
createCandidateWindowLocal
createFixedStartAtLocal
createSessionDonePresentation
createSessionFormCanPublish
taipeiClock
taipeiCourts
taipeiDateTimeLocalValue
taipeiDateValue
```

TSX 透過 adapter 注入這些函式／presentation config；沒有複製 Taipei time、publish gate、bump clamp、court filter 或 done-card 格式規則。舊 `createCourtCellMarkup` 與整段手寫 `renderCourtGrids/sync` 已退役，court JSX 是唯一 presentation。

凍結的 public pure exports 未移動、未改簽名：

```text
validateCreateSessionInput  src/sessionViews.js:184
deriveCreateVenueType       src/sessionViews.js:2546
bumpCreateTimeMinutes       src/sessionViews.js:2584
```

既有 `tests/session-create-form.test.js` 與 `tests/session-controller.test.js` 的 24 個文字引用／15 組派工錨定斷言全部原樣通過。

### 批 6 riders

1. `SessionDetailSnapshot.actionGeneration` 改為 optional；increment 使用 `(snapshot.actionGeneration ?? 0) + 1`，initial caller 不必過度承諾欄位。
2. 移除 NTRP eyebrow 與 value 之間獨立的 sibling `{" "}`。為同時保留 frozen `NTRP 不限` 可觀察文字，空白收進 NTRP label 自身，不再建立額外 sibling text node。原 smoke desktop/mobile 2/2 通過。

## 8. 變更清單

- `src/sheets/CreateSessionSheet.tsx`（新增）：strict React 建局內容、uncontrolled text inputs、state derivation、同步 bridge。
- `src/sheets/EditSessionSheet.tsx`（新增）：strict React 編輯內容、uncontrolled free inputs、同步 court bridge。
- `src/sessionViews.js`：兩個 eager sheet mount、frozen runtime、兩個 legacy factory adapter；刪除 create/edit markup 與 `sync()` 手寫 reconciliation。
- `src/sheets/SessionDetailSheet.tsx`：只處理兩項 rider。
- `docs/migration-reports/batch-7.md`：本回報。

刻意未改：`src/main.js`、`src/sheets.js`、`src/modalIsolation.js`、`src/domainTypes.ts`、`.claude/rules/react-migration.md`、`index.html`、`src/session.css`、`tests/**`、package／lint 設定。

React best-practices skill 的具體影響：元件定義都在 module scope、ReactDOM 直接 import、沒有 barrel／effect／global listener；高頻文字值留在 DOM，不訂閱成 React state；只有衍生視覺所需的離散 primitive 進 state。

## 9. 雙 React canary 紅綠證據

### Create

暫時把：

```tsx
reactRoot.render(<CreateSessionSheetWithRef {...options} ref={contentRef} />)
```

改為 `reactRoot.render(null)`，執行：

```bash
npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep "create sheet submits a walk-on session with one authoritative court" \
  2>&1 | grep -E 'failed|passed'
```

空實作逐字輸出（Playwright exit 1）：

```text
  1 failed
```

逐字還原後，同命令輸出（exit 0）：

```text
  1 passed (1.5s)
```

### Edit

暫時把 Edit mount 改為 `reactRoot.render(null)`，執行：

```bash
npx playwright test tests/smoke.spec.js \
  --project=desktop-chromium \
  --grep "an existing 對拉 session still saves from the edit form while new sessions cannot pick it" \
  2>&1 | grep -E 'failed|passed'
```

空實作逐字輸出（Playwright exit 1）：

```text
  1 failed
```

逐字還原後，同命令輸出（exit 0）：

```text
  1 passed (1.1s)
```

## 10. repeat-each=3 證據

命令涵蓋 focus trap、create validation/error、walk-on、預設 instant、candidate 3 座、成功頁、打法／缺額與兩個 edit case：

```bash
npx playwright test tests/performance.spec.js tests/smoke.spec.js \
  --project=desktop-chromium \
  --repeat-each=3 \
  --grep "keyboard dialogs trap focus|profile and create sheets disclose|create sheet submits a walk-on|create sheet submits sensible defaults|create sheet switches to candidate mode|create sheet blocks publish|create sheet switches to its own success|the create form asks|an existing 對拉|edit sheet expands"
```

逐字測試結果：

```text
Running 30 tests using 1 worker

  ✓   1 [desktop-chromium] › tests/performance.spec.js:170:1 › keyboard dialogs trap focus and return it to the trigger (861ms)
  ✓   2 [desktop-chromium] › tests/smoke.spec.js:3763:1 › profile and create sheets disclose public nickname use and retain a local-demo create failure (693ms)
  ✓   3 [desktop-chromium] › tests/smoke.spec.js:4075:1 › create sheet submits a walk-on session with one authoritative court (650ms)
  ✓   4 [desktop-chromium] › tests/smoke.spec.js:4118:1 › create sheet submits sensible defaults when only a court and start time are chosen (597ms)
  ✓   5 [desktop-chromium] › tests/smoke.spec.js:4157:1 › create sheet switches to candidate mode and submits up to three candidate courts as an array (765ms)
  ✓   6 [desktop-chromium] › tests/smoke.spec.js:4222:1 › create sheet blocks publish with guidance toast until the venue requirement is met (575ms)
  ✓   7 [desktop-chromium] › tests/smoke.spec.js:4257:1 › create sheet switches to its own success page after publish and routes 查看我的球局 through onViewMySessions (1.0s)
  ✓   8 [desktop-chromium] › tests/smoke.spec.js:4944:1 › the create form asks about the venue situation and offers three play types and slot buttons (718ms)
  ✓   9 [desktop-chromium] › tests/smoke.spec.js:4998:1 › an existing 對拉 session still saves from the edit form while new sessions cannot pick it (218ms)
  ✓  10 [desktop-chromium] › tests/smoke.spec.js:5047:1 › edit sheet expands advanced settings by default when the session already has NTRP, fee note, or notes (165ms)
  ✓  11 [desktop-chromium] › tests/performance.spec.js:170:1 › keyboard dialogs trap focus and return it to the trigger (839ms)
  ✓  12 [desktop-chromium] › tests/smoke.spec.js:3763:1 › profile and create sheets disclose public nickname use and retain a local-demo create failure (675ms)
  ✓  13 [desktop-chromium] › tests/smoke.spec.js:4075:1 › create sheet submits a walk-on session with one authoritative court (608ms)
  ✓  14 [desktop-chromium] › tests/smoke.spec.js:4118:1 › create sheet submits sensible defaults when only a court and start time are chosen (630ms)
  ✓  15 [desktop-chromium] › tests/smoke.spec.js:4157:1 › create sheet switches to candidate mode and submits up to three candidate courts as an array (802ms)
  ✓  16 [desktop-chromium] › tests/smoke.spec.js:4222:1 › create sheet blocks publish with guidance toast until the venue requirement is met (573ms)
  ✓  17 [desktop-chromium] › tests/smoke.spec.js:4257:1 › create sheet switches to its own success page after publish and routes 查看我的球局 through onViewMySessions (1.0s)
  ✓  18 [desktop-chromium] › tests/smoke.spec.js:4944:1 › the create form asks about the venue situation and offers three play types and slot buttons (701ms)
  ✓  19 [desktop-chromium] › tests/smoke.spec.js:4998:1 › an existing 對拉 session still saves from the edit form while new sessions cannot pick it (216ms)
  ✓  20 [desktop-chromium] › tests/smoke.spec.js:5047:1 › edit sheet expands advanced settings by default when the session already has NTRP, fee note, or notes (170ms)
  ✓  21 [desktop-chromium] › tests/performance.spec.js:170:1 › keyboard dialogs trap focus and return it to the trigger (796ms)
  ✓  22 [desktop-chromium] › tests/smoke.spec.js:3763:1 › profile and create sheets disclose public nickname use and retain a local-demo create failure (712ms)
  ✓  23 [desktop-chromium] › tests/smoke.spec.js:4075:1 › create sheet submits a walk-on session with one authoritative court (617ms)
  ✓  24 [desktop-chromium] › tests/smoke.spec.js:4118:1 › create sheet submits sensible defaults when only a court and start time are chosen (634ms)
  ✓  25 [desktop-chromium] › tests/smoke.spec.js:4157:1 › create sheet switches to candidate mode and submits up to three candidate courts as an array (864ms)
  ✓  26 [desktop-chromium] › tests/smoke.spec.js:4222:1 › create sheet blocks publish with guidance toast until the venue requirement is met (611ms)
  ✓  27 [desktop-chromium] › tests/smoke.spec.js:4257:1 › create sheet switches to its own success page after publish and routes 查看我的球局 through onViewMySessions (1.0s)
  ✓  28 [desktop-chromium] › tests/smoke.spec.js:4944:1 › the create form asks about the venue situation and offers three play types and slot buttons (683ms)
  ✓  29 [desktop-chromium] › tests/smoke.spec.js:4998:1 › an existing 對拉 session still saves from the edit form while new sessions cannot pick it (204ms)
  ✓  30 [desktop-chromium] › tests/smoke.spec.js:5047:1 › edit sheet expands advanced settings by default when the session already has NTRP, fee note, or notes (178ms)

  30 passed (20.5s)
```

時間 bump 的 UI 三輪證據見第 5 節；pure clamp 的既有四個 unit assertions 也原樣通過。

## 11. 全 repo consumer sweep

### Production factories

```text
src/sessionViews.js:2672  openCreateSessionSheet definition
src/sessionViews.js:2865  openEditSessionSheet definition
src/main.js:74            openCreateSessionSheet import（未改）
src/main.js:76            openEditSessionSheet import（未改）
src/main.js:491           create production call（未改）
src/main.js:1506          edit factory injection（未改）
```

### e2e direct consumers

`tests/smoke.spec.js` 的 create 20 個文字引用（10 組 import/call，未改）：

```text
3793,3794
3842,3843
4081,4083
4124,4126
4163,4166
4228,4231
4263,4265
4302,4304
4497,4498
4949,4950
```

edit 4 個文字引用（2 組 import/call，未改）：

```text
5003,5004
5052,5053
```

`tests/performance.spec.js` create 2 個文字引用：`259,260`；edit 零引用。

### Handle／controller

```text
src/sessionController.js:1069              setCourts authority update
src/sessionController.js:1072              createSession.setCourts optional duck call
src/sessionController.js:1074              editSession.setCourts optional duck call
src/main.js:1286,1298                      ready/error catalogue pushes
tests/session-controller.test.js:137       harness setCourts contract
tests/session-controller.test.js:2463      create-flow setCourts
tests/smoke.spec.js:4511,4528               create direct setCourts draft regression
```

### New internal mounts／runtime

```text
src/sessionViews.js:31-38                   eager glob + mount bindings
src/sheets/CreateSessionSheet.tsx:791       create mount definition
src/sessionViews.js:2692                    create mount call
src/sheets/EditSessionSheet.tsx:287         edit mount definition
src/sessionViews.js:2884                    edit mount call
src/sessionViews.js:2659                    sessionFormSheetRuntime only export
src/sessionViews.js:2693-2723,2885,2914     runtime consumers
```

### Frozen pure functions

- `validateCreateSessionInput`：definition `src/sessionViews.js:184`；direct test consumer `tests/session-create-form.test.js:9,58,89-91,97,129-131,146,176,182,198,203,209`。
- `deriveCreateVenueType`：definition `src/sessionViews.js:2546`；form mapper `2621`；unit import/assertions `tests/session-controller.test.js:2395-2399`。
- `bumpCreateTimeMinutes`：definition `src/sessionViews.js:2584`；runtime `2660/2693`；unit import/assertions `tests/session-controller.test.js:2450-2454`。

### 其他 repo 範圍

- `scripts/`：兩 factory、新 mounts、runtime 全部零 consumer。
- `supabase/functions/`：兩 factory、新 mounts、runtime 全部零 consumer。
- 歷史 docs 只有 `docs/superpowers/plans/2026-07-17-public-taipei-tennis-session-mvp.md` 與 `2026-07-21-instant-join-mode.md` 的規格文字，不是 active consumer。

## 12. Bundle 前後對照

批前為批 6 最終工作樹；批後相同 dependency，以 `gzip -c | wc -c` 取 exact bytes：

| 狀態 | modules | 主 JS raw | 主 JS gzip | CSS raw/gzip | 小 JS raw/gzip |
| --- | ---: | ---: | ---: | ---: | ---: |
| 批前（批 6） | 100 | 696,440 B | 196,526 B | 67,426 / 10,678 B | 1,932 / 971 B |
| 批後 | 102 | 697,247 B | 197,112 B | 67,426 / 10,678 B | 1,932 / 971 B |
| 差額 | +2 | **+807 B** | **+586 B** | 0 / 0 | 0 / 0 |

兩個 TSX modules 加入同時取代 609 行 legacy factory／markup blocks，所以 gzip 邊際只有 586 B。沒有新增 dependency、CSS 或 chunk；既有 500 kB 主 chunk warning 維持。

## 13. SHA-256 與 canary 還原

### 批前基準

```text
d1aafd8c97243cee00b322c20cdcf46d71da9bca7e45e6f62212751b8dd3ea26  src manifest（30 檔）
e9d2a9706d2f5aef6cddcb09d2733125642540a3d5691334c3279ca220ed9333  src/sessionViews.js
c303de07cf6c4cc63b473d877347e8263a1ea71b8e0744f3ee0abce351a8d83b  src/sheets/SessionDetailSheet.tsx
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
36dda9c8f3f3feef40b3b8776d188e15aa595375118b2f978406a6d5f7b198cc  src/sheets.js
a7203fa1ff7be6ff63b709cab22d1c0ca69963fb64bbd3cc65cc761d9fc0767f  src/modalIsolation.js
24839cc13adcb4ce59c90c77326576c6fed4c07d338fbf6d834b0d60c7934b9e  src/main.js
```

### 最終 create canary

```text
before  1920e2e2a0384334e9399bdde00ca36b04f192b76d7991abad1363a7e119f0d7  src manifest
canary  4fd6a20f00b62f9df08b6f416755b703d7c3783396f6934cc6e9b7fb1122ec0e  src manifest
after   1920e2e2a0384334e9399bdde00ca36b04f192b76d7991abad1363a7e119f0d7  src manifest

before  4c8a4f9c549f1d4ea819625814516edb797f8bcccae22abecfd848e1bb4be601  CreateSessionSheet.tsx
canary  ad245f994efcfd8ebf4f0aabf9c572e90ea526378e10bb521f45d2b3e779362f  CreateSessionSheet.tsx
after   4c8a4f9c549f1d4ea819625814516edb797f8bcccae22abecfd848e1bb4be601  CreateSessionSheet.tsx
```

### 最終 edit canary

```text
before  1920e2e2a0384334e9399bdde00ca36b04f192b76d7991abad1363a7e119f0d7  src manifest
canary  b33ac59752a601e80f30557de69ec410877faa5f232464e99d9b43912c432ebd  src manifest
after   1920e2e2a0384334e9399bdde00ca36b04f192b76d7991abad1363a7e119f0d7  src manifest

before  dbe3da2b2f9467708a51382bac48999bcc581964db6e8c369d0d2e6a4a43268f  EditSessionSheet.tsx
canary  56f5c095e583ad2cbb2f27b8a71eeb3cce03038fb33ded0656f14a832f638572  EditSessionSheet.tsx
after   dbe3da2b2f9467708a51382bac48999bcc581964db6e8c369d0d2e6a4a43268f  EditSessionSheet.tsx
```

### 最終檔案

```text
1920e2e2a0384334e9399bdde00ca36b04f192b76d7991abad1363a7e119f0d7  src manifest（32 檔）
5270f2ef7ae45a314184cef9dda85c26c26b6c82582d38e645c4a51e3deaf8a7  src/sessionViews.js
4c8a4f9c549f1d4ea819625814516edb797f8bcccae22abecfd848e1bb4be601  src/sheets/CreateSessionSheet.tsx
dbe3da2b2f9467708a51382bac48999bcc581964db6e8c369d0d2e6a4a43268f  src/sheets/EditSessionSheet.tsx
14c1de353be32a92d5644164bbbaf81550d42c0df3a1e706d76a49bcb8a38095  src/sheets/SessionDetailSheet.tsx
b07659e94e6e8bbff95344a53fa0006cbd938258c96079ac11fec4d5d0e8cbf3  src/domainTypes.ts
36dda9c8f3f3feef40b3b8776d188e15aa595375118b2f978406a6d5f7b198cc  src/sheets.js
a7203fa1ff7be6ff63b709cab22d1c0ca69963fb64bbd3cc65cc761d9fc0767f  src/modalIsolation.js
24839cc13adcb4ce59c90c77326576c6fed4c07d338fbf6d834b0d60c7934b9e  src/main.js
```

兩次 canary 的 before/after manifest 逐字相同，最終 manifest 也相同；所有暫改已還原。

## 14. 全部 gate 結尾輸出（逐字）

local gate 前依授權執行：

```bash
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test
```

reset exit 0，結尾：

```text
Restarting containers...
Finished supabase db reset on branch claude/tennis-partner-finder-proto-xfrr6g.
{"target":"local","version":"","message":"Reset local database."}
```

### `npm test`（含 pretest）

exit 0；結尾摘要逐字：

```text
--check 通過:產出檔案與 data/courts.json 重生結果一致。
# tests 246
# suites 0
# pass 246
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1875.525333
  4 skipped
  250 passed (2.3m)
```

### `npm run test:local`

最終 source exit 0；摘要逐字：

```text
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4264.469625
  11 skipped
  42 passed (1.4m)
```

其中原樣通過：

```text
✓ a complete profile creates a Taipei session with an explicit Taipei ISO timestamp and focuses its upcoming card
✓ a host creates a candidate session in the form and a guest joins it
✓ a host edits a single-court session and sees authoritative card and detail values
✓ a host creates a now-start direct session in the form, then a guest joins and both can open group chat
✓ instant local join accepts immediately and opens group chat without host review
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
✓ 102 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-Pqh9gnEG.js   697.25 kB │ gzip: 197.83 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 912ms
```

exact bytes：

```text
index-Ckdsfrjg.css raw=67426 gzip=10678
index-Pqh9gnEG.js raw=697247 gzip=197112
index-Zt4BwSlo.js raw=1932 gzip=971
```

### `git diff --check`

tracked diff 與兩個 untracked TSX 分別檢查：

```text
(no output)
TRACKED_DIFF_CHECK=0
CREATE_NEW_FILE_CHECK=1  # no-index 的「只有新增 diff、無 whitespace error」
EDIT_NEW_FILE_CHECK=1    # no-index 的「只有新增 diff、無 whitespace error」
```

## 15. Git diff stat

`git diff --stat`（tracked）：

```text
 src/sessionViews.js               | 694 ++++++++------------------------------
 src/sheets/SessionDetailSheet.tsx |   6 +-
 2 files changed, 138 insertions(+), 562 deletions(-)
```

新增未追蹤檔：

```text
src/sheets/CreateSessionSheet.tsx   808 lines
src/sheets/EditSessionSheet.tsx     301 lines
docs/migration-reports/batch-7.md   (this report)
```

`src/sessionViews.js` 的刪除來自 create/edit HTML templates、`renderCourtGrids()` 與全表 `sync()` 退役；沒有白名單外格式化噪音。最終 `git status --short` 只包含上述五個允許路徑。未 commit、未 push。
