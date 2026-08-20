# 批 12：移除 10 處雙重型別斷言，恢復 `.js → .tsx` 邊界的漂移偵測

日期：2026-08-20　基準：`c9bd71b`
對應工單：`docs/frontend-fix-plan-2026-08-20.md` 的 **P0-B**
性質：純型別／編譯期改動，零 runtime 影響（bundle hash 未變，見 §4）

> 這一批同時作為後續修正批（批 13 起）的**格式樣本**：
> 證據怎麼列、canary 三拍怎麼跑、對照組怎麼設、驗收條件怎麼寫成可證偽的形式。

---

## 1. 問題

`src/` 有 10 處 `return xxxRuntime as unknown as XxxRuntime;`。
`as unknown as` 是「先擦成 `unknown` 再重貼標籤」，等於把 `.tsx` 自己宣告的
`interface XxxRuntime` 對 `sessionViews.js` 實際 `Object.freeze({...})` 匯出的
一致性檢查整個關掉。

因為 `tsconfig.json` 是 `allowJs: true` + `checkJs: false`，這 10 個介面是
**`.js → .tsx` 邊界上唯一還在運作的型別檢查**——把它們斷言掉，等於這條邊界完全沒有守衛。

### 現況沒有牙的實證（對照組）

在 `git archive HEAD` 的乾淨副本上，把 `sessionViews.js:126` 的 runtime 匯出欄位改名：

```js
- export const avatarRuntime = Object.freeze({ avatarInitial, safeGoogleAvatarUrl, showAvatarFallback });
+ export const avatarRuntime = Object.freeze({ avatarInitialRENAMED: avatarInitial, safeGoogleAvatarUrl, showAvatarFallback });
```

```
npx tsc --noEmit  →  exit=0     ← 靜默通過，零錯誤
```

`Avatar.tsx` 宣告它需要 `avatarInitial`，JS 端已經沒有這個欄位，
但因為 `as unknown as` 把檢查關掉了，編譯期完全看不到。
執行期才會炸成 `helpers.avatarInitial is not a function`。

---

## 2. 改動

### 2.1 根因修正：`src/sessionViews.js`

移除全部 10 處斷言後，只有 `src/components/SessionCard.tsx:43` 編不過：

```
src/components/SessionCard.tsx(43,3): error TS2322:
  Types of property 'sessionCardPresentation' are incompatible.
    Types of parameters '__1' and 'options' are incompatible.
      Type 'SessionCardCourt[] | null' is not assignable to type 'never[] | undefined'.
```

原因不是型別真的不相容，而是 JS 端的 `courts = []` 預設值讓 TypeScript
把參數推成 `never[]`。**修根因而不是加回斷言**：

```js
/**
 * `courts` 需要明寫型別:預設值 `[]` 會讓 TypeScript 從這個 .js 推成 `never[]`,
 * 使 React 端(SessionCard.tsx)宣告的 `CourtSummary[] | null` 對不上,
 * 逼出一個雙重型別斷言。這段 JSDoc 讓推論正確,斷言就不需要了(批 12)。
 *
 * @param {*} session
 * @param {{ compact?: boolean, courts?: readonly any[] | null }} [options]
 */
function sessionCardPresentation(session, { compact = false, courts = [] } = {}) {
```

加上這段 JSDoc 之後，**10 處斷言全部可以刪**——比原工單規劃的「留 1 處」更乾淨。
`checkJs: false` 不影響 JSDoc 的推論用途（只影響是否回報該 `.js` 檔內部的錯誤）。

### 2.2 移除斷言：10 個 `.tsx`

| 檔案 | 行 |
|---|---|
| `src/components/Avatar.tsx` | 21 |
| `src/components/SessionCard.tsx` | 43 |
| `src/pages/NearbySessionsDrawer.tsx` | 63 |
| `src/sheets/CourtPlayersSheet.tsx` | 43 |
| `src/sheets/DecideSessionSheet.tsx` | 55 |
| `src/sheets/PlayerCardSheet.tsx` | 85 |
| `src/sheets/PlayerDirectorySheet.tsx` | 62 |
| `src/sheets/ProfileCompletionSheet.tsx` | 78 |
| `src/sheets/ReportDialog.tsx` | 24 |
| `src/sheets/SessionChatSheet.tsx` | 65 |

改動形式一律是 `return xRuntime as unknown as XRuntime;` → `return xRuntime;`。

### 2.3 文件同步

`docs/migration-reports/batch-8.1.md`、`8.3.md`、`8.5.md`、`8.6.md` 各記載了這個寫法
是批次標準模式。四份都是已歸檔報告，**採用加後註而非改寫**，保留審計軌跡。

---

## 3. canary 三拍（在真實工作樹上執行）

canary 內容與 §1 對照組相同：把 `sessionViews.js:126` 的 `avatarInitial` 改名。
清除一律以精確字串替換，**未使用 `git checkout`**（會洗掉同檔其他未提交改動）。

| 拍 | 動作 | `npx tsc --noEmit` |
|---|---|---|
| 1 | 改動後、無 canary | **exit=0** |
| 2 | 改動後 + canary | **exit=2** ← 見下方逐字輸出 |
| 3 | 精確刪除 canary 還原 | **exit=0** |
| 對照 | **HEAD（未改動）+ 同一顆 canary** | **exit=0（靜默，證明改動前沒有牙）** |

第 2 拍逐字輸出：

```
src/components/Avatar.tsx(21,3): error TS2741: Property 'avatarInitial' is missing in type
'Readonly<{ avatarInitialRENAMED: (nickname: any) => string; safeGoogleAvatarUrl: (value: any) => string;
showAvatarFallback: (image: any) => void; }>' but required in type 'AvatarRuntime'.
```

第 3 拍還原後逐字確認：

```
126:export const avatarRuntime = Object.freeze({ avatarInitial, safeGoogleAvatarUrl, showAvatarFallback });
```

**四拍齊全**：存量綠 → canary 紅 → 還原綠 → 對照組證明「這道牙是本批長出來的，不是本來就有」。

---

## 4. 完整 gate（改動後，機器無平行作業）

| Gate | 結果 |
|---|---|
| `npx tsc --noEmit` | exit=0 |
| `npm run lint` | exit=0 |
| `npm run prettier:check` | `All matched files use Prettier code style!` |
| `node scripts/generate-courts-seed.mjs --check` | `--check 通過`，exit=0 |
| `npm run test:session-unit` | `# pass 248 # fail 0` |
| `npm run test:mock` | `254 passed / 4 skipped`（258） |
| `npx vite build` | 見下 |
| `git diff --check` | exit=0 |

`npm run test:db` 與 `npm run test:local` **豁免，理由**：本批零 migration、
零 `src/dataApi.js` 改動、零 RPC 簽名改動，是純編譯期型別改動，
不觸及資料庫契約。（`git diff --name-only` 可證改動集只含 `src/sessionViews.js`、
10 個 `.tsx` 與 4 份已歸檔報告。）

### 零 runtime 影響的證據

```
改動前：dist/assets/index-Ddb_WTIS.js   713.77 kB │ gzip: 201.04 kB
改動後：dist/assets/index-Ddb_WTIS.js   713.77 kB │ gzip: 201.04 kB
```

**content hash 與位元組數完全相同**。型別斷言是純編譯期構造，
JSDoc 是註解，兩者都不進 bundle——hash 相同是這件事最強的證明。

---

## 5. 驗收條件對照

| # | 條件 | 結果 |
|---|---|---|
| 1 | `grep -rc "as unknown as" src/` 從 10 降到 0 | ✅ 0 處（註解亦不含該字面，避免驗收誤判） |
| 2 | **有牙證明**：改 runtime 欄位名 → `typecheck` 變紅 | ✅ §3 第 2 拍，TS2741 |
| 3 | bundle 位元組數與改動前一致 | ✅ hash 與位元組皆相同 |
| 4 | 四份 migration report 已加後註 | ✅ §2.3 |
| 5 | 工作區只含本批預期變更 | ✅ `git status --porcelain` 見 §6 |

---

## 6. 變更清單

```
src/sessionViews.js                    +8   （JSDoc）
src/components/Avatar.tsx              ±1
src/components/SessionCard.tsx         ±1
src/pages/NearbySessionsDrawer.tsx     ±1
src/sheets/CourtPlayersSheet.tsx       ±1
src/sheets/DecideSessionSheet.tsx      ±1
src/sheets/PlayerCardSheet.tsx         ±1
src/sheets/PlayerDirectorySheet.tsx    ±1
src/sheets/ProfileCompletionSheet.tsx  ±1
src/sheets/ReportDialog.tsx            ±1
src/sheets/SessionChatSheet.tsx        ±1
docs/migration-reports/batch-8.1.md    +5   （後註）
docs/migration-reports/batch-8.3.md    +5
docs/migration-reports/batch-8.5.md    +5
docs/migration-reports/batch-8.6.md    +5
docs/migration-reports/batch-12.md     新增
```

---

## 7. 偏離與後續建議

1. **偏離工單**：原工單規劃「9 處刪除 + `SessionCard` 保留單層 `as` 或補 JSDoc」。
   實作時選了補 JSDoc，結果 **10 處全部可刪**，比原規劃乾淨。工單的兩個選項都成立，
   這裡選了修根因的那個。
2. **後續建議（不在本批範圍）**：本批讓檢查長出牙，但**沒有機制阻止有人再把
   `as unknown as` 寫回來**。可考慮加一條掃描測試（比照
   `tests/legacy-style-scan.test.js` 的形式）把它釘死。這需要新增測試檔並登記進
   `package.json` 的 `test:session-unit`（見計劃 §0.2），屬於獨立的一批。
3. **未動凍結項**：本批未修改任何 e2e 斷言、`data-testid`、`id`、`class`、`aria`、
   文案或 DOM 結構。258 條 mock e2e 的通過數與基準逐字相同（254 passed / 4 skipped）。
