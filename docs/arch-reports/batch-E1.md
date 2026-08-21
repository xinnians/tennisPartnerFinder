# 批次 E1 回報：非首頁 lazy loading

## 開工重盤

E1 開工前依 D4 commit 重新量測；派工檔記載的 18 個 eager glob 已過時，實際是 15 個 `import.meta.glob(..., { eager: true })` 呼叫：1 個 App module、Session Detail，以及 13 個其他 sheet。D4 基準 build 為：

```text
✓ 148 modules transformed.
dist/assets/index-u1KdvfpQ.js   717.45 kB │ gzip: 201.26 kB
```

首頁地圖、附近球局與 Session Detail 依派工保持 eager；其餘 3 個非首頁頁面與 13 個 sheet 納入動態載入。

## 變更與檔案意圖

- `src/app/App.tsx`：把「我」「訊息」「我的球局」改成具名、可快取與可預載的 dynamic import；等待與失敗狀態使用 `role="status"`，不主動搶焦；頁面完成 commit 後才交回 legacy adapter 綁定事件。
- `src/sessionViews.js`：保留 App 與 Session Detail 的 2 個 eager 邊界；其餘 13 個 sheet 共用 lazy loader、可關閉 loading shell、延後公開 handle 與 preload 策略。
- `tests/react-surface-lifecycle.test.js`：等語意演進結構 gate，固定驗證 2 個 eager 邊界、13 個 lazy sheet、3 個 dynamic page import，以及 hover／focus／登入後 preload。
- `tests/react-unmount.spec.js`：直接呼叫公開 sheet adapter 的生命週期測試先 preload 對應 chunk，原斷言不變。
- `tests/performance.spec.js`：刻意同步觸發 filter adapter race 的測試先 preload，保留原本 race 與焦點斷言。
- `tests/smoke.spec.js`：少數繞過真實 hover／focus／登入流程、直接呼叫公開 adapter 的測試先 preload 對應 chunk，原斷言不變。
- 本回報 `docs/arch-reports/batch-E1.md`。

## Lazy 與 preload 邊界

```text
$ rg -n "import\.meta\.glob\([^\n]*eager: true" src/sessionViews.js | wc -l
2

$ rg -n "import\.meta\.glob" src/sessionViews.js | wc -l
3

$ rg -n "pointerover|focusin|preloadAuthenticatedViews" src/sessionViews.js
291:function preloadAuthenticatedViews() {
312:  document.addEventListener("pointerover", (event) => preloadForIntent(event.target), { passive: true });
313:  document.addEventListener("focusin", (event) => preloadForIntent(event.target));
347:  if (authSession) preloadAuthenticatedViews();
```

- hover／focus 依導覽或動作入口只預載高機率下一步。
- 登入完成後預載私人頁面與常用 sheet；預載失敗不彈錯，實際開啟時才在原 surface 顯示可關閉失敗狀態。
- loading shell 不移焦點；真正 sheet 載入後沿用原有 SurfaceHost、focus trap、close 與公開 handle 契約。

## Build 前後

E1 最終 build：

```text
✓ 148 modules transformed.
dist/assets/SessionUnavailableSheet-BVH1TVug.js              0.77 kB │ gzip:   0.48 kB
dist/assets/CourtSessionSheet-D-a9Jcq_.js                    0.95 kB │ gzip:   0.57 kB
dist/assets/WithdrawSessionConfirmationDialog-CEKE7Id1.js    1.11 kB │ gzip:   0.56 kB
dist/assets/CourtPlayersSheet-blBcjMwQ.js                    1.32 kB │ gzip:   0.71 kB
dist/assets/ReportDialog-BJ6PvN9Q.js                         1.34 kB │ gzip:   0.68 kB
dist/assets/index-Zt4BwSlo.js                                1.93 kB │ gzip:   0.95 kB
dist/assets/DecideSessionSheet-CFiFmvZ1.js                   2.40 kB │ gzip:   1.20 kB
dist/assets/MessagesPage-9msX6QmE.js                         2.79 kB │ gzip:   1.37 kB
dist/assets/PlayerDirectorySheet-DiWH0fCK.js                 3.77 kB │ gzip:   1.56 kB
dist/assets/ProfileCompletionSheet-BAvnMFMe.js               4.44 kB │ gzip:   1.80 kB
dist/assets/FilterSheet-Xin449lx.js                          4.70 kB │ gzip:   1.76 kB
dist/assets/PlayerCardSheet-BBhdrWXp.js                      5.22 kB │ gzip:   2.10 kB
dist/assets/SessionChatSheet-DXvB07Za.js                     5.28 kB │ gzip:   2.08 kB
dist/assets/EditSessionSheet-D76Y3waE.js                     5.47 kB │ gzip:   2.10 kB
dist/assets/MySessionsPage-C6ulgMCN.js                      13.01 kB │ gzip:   3.70 kB
dist/assets/MePage-BXxoG9XA.js                              14.90 kB │ gzip:   4.71 kB
dist/assets/CreateSessionSheet-CMM18_Kw.js                  15.23 kB │ gzip:   4.54 kB
dist/assets/index-DdBPRNH2.js                              639.90 kB │ gzip: 184.71 kB
✓ built in 909ms
```

主 chunk raw 由 717.45 kB 降至 639.90 kB，少 77.55 kB（10.8%）；gzip 由 201.26 kB 降至 184.71 kB，少 16.55 kB（8.2%）。Vite 的 500 kB 提示仍存在，E2 將以這次實測值加 10% 固定防回長 gate。

## Gate

`npm run typecheck`、`npm run lint`、`npm run prettier:check`：exit 0；Prettier 末尾：

```text
Checking formatting...
All matched files use Prettier code style!
```

`npm run test:session-unit`（也由最終 `test:mock` 重跑）：

```text
ℹ tests 280
ℹ suites 0
ℹ pass 280
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

`npm run test:mock`：

```text
4 skipped
266 passed (2.5m)
```

直接 adapter 測試第一次暴露 lazy chunk 尚未就緒；修正方式只是先呼叫公開 preload，再跑完整 gate。沒有刪除或放寬任何斷言，最終完整 mock 全綠。

`npm run test:local`：

```text
ℹ tests 2
ℹ pass 2
ℹ fail 0

11 skipped
42 passed (1.6m)
```

沒有 fixture 資源耗盡，未執行 local DB reset。

`npm run check:production-bundle`：

```text
production bundle check passed: 28 files, 12 demo identifiers absent
```

`git diff --check`：exit 0，無輸出。

## 非阻擋 WebKit

依規格只跑一次：

```text
7 failed
3 skipped
125 passed (2.0m)
```

固定參考為 126／6／3；多一項是歷史 D1、D3、C3、C4 都記錄過的 `keyboard dialogs trap focus and return it to the trigger` WebKit focus timeout。其餘六項是既有 performance／focus 清單，包含先前已記錄的通知 focus 案例；正式 desktop/mobile Chromium 全綠。依非阻擋規則保留單次原始結果，不重跑修飾數字。

## 白名單、反向掃描與未動範圍

- 使用 E1 白名單：`src/sessionViews.js`、`src/app/**` 與對應測試／新回報；沒有改公開 adapter 名稱、testid、id、aria、中文正式內容或資料 allowlist。
- 測試演進前後語意：原本直接 adapter 可同步取得 eager module；現在同一測試先等待 module preload，再執行完全相同 adapter、race 與斷言。結構掃描仍有非空數量與精確集合。
- 以下反向掃描輸出空：

```text
$ git diff --name-only -- .env supabase/migrations supabase/tests data/courts.json vercel.json package.json package-lock.json src/dataApi.js src/data src/map.js src/pins.js
```

- 沒有 push、deploy、改 `.env*`、依賴、DB、migration、Supabase tests、球場資料或 CSP。

## BLOCKED／偏差

- BLOCKED：無。
- 偏差：單次非阻擋 WebKit 比固定參考多一項歷史已知 focus 波動；必要 gate 全綠。
