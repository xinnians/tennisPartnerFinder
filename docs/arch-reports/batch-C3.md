# 批次 C3 回報：抽出 chat 到 features

## 變更與範圍盤點

- 新增 `src/features/chat/chatFeature.ts`：集中聊天會員資格、最新有效訊息 ID、可檢舉訊息三個純判斷，直接引用 B1 domain type 與 B4 controller contract。
- `src/sessionController.js`：刪除三個函式本體，改成 import；聊天載入、已讀、發文、封鎖、檢舉、surface 與輪詢仍由 controller 編排。
- 新增本回報 `docs/arch-reports/batch-C3.md`。

本 feature 讀到的 controller 狀態是 `authSession`、`authEpoch`、`mySessions`、`blockedPlayers` 與 `courts`；聊天 context 自有 `messages`、`roster`、`lastMarkedMessageId`、`requestGate`、`poller`、`session` 與 `sheet`。聊天沒有新增 store channel；標已讀、封鎖與重新載入仍透過既有 `mySessions` 事件更新 unread／block UI。

controller 內盤點到的 chat orchestration 是 `markActiveChatRead`、`refreshActiveChat`、`openChatMessageReport`、`blockChatSender`、`postActiveChatMessage`、`openSessionChat` 與 `reconcileActiveChatParticipation`。它們牽涉 API、auth snapshot、request gate、surface identity、best-effort retry 或 poller 生命週期，本批刻意保留，避免改動先後順序。

`main.js` 的聊天依賴注入仍在 1484–1499（load／mark read／post）及 1529（openChat view）；controller 呼叫仍在我的球局與訊息頁 1023、1127。`sessionViews.js` 的 chat sheet 與 messages page adapter 沒有修改。

## 搬移對照

| controller 原位置（C2 commit） | 新位置 | 說明 |
| --- | --- | --- |
| `sessionController.js:88-96` | `chatFeature.ts:4-12` | `latestChatMessageId`，只接受有限數值並取最大值，演算法逐行不變 |
| `sessionController.js:1073-1075` | `chatFeature.ts:14-16` | `chatMemberSession`，仍只允許 accepted participant |
| `sessionController.js:1130-1138` | `chatFeature.ts:18-29` | `visibleChatMessage`，ID、user kind、非本人與安全 sender ID 四個條件不變 |

## Controller 行數

```text
搬移前：2263 src/sessionController.js
搬移後：2240 src/sessionController.js
```

下降 23 行，符合單調下降要求。

## API、時序與測試契約

- `ControllerApi` 的 42 個方法沒有變動；公開的 `openSessionChat` 仍由 controller 提供。
- `main.js`、`sessionViews.js`、data facade、store 介面與 UI 零修改。
- open chat 後建立 context、建立 poller、第一次 refresh、quiet refresh、mark read、關閉時 invalidate／stop 的時序完全留在 controller。
- 已讀 RPC 失敗時「不回滾樂觀清零、下次再重試」的行為未變；封鎖與 archived chat 的 refresh 次序也未變。
- 沒有修改測試；unit、Chromium mock、local Supabase、build 與 bundle 必要 gate 全綠。

`git diff -- src/main.js src/sessionViews.js`：exit 0，無輸出。

## Gate

`npm run typecheck`、`npm run lint`、`npm run prettier:check`：全綠。

`npm run test:session-unit`：

```text
1..276
# tests 276
# pass 276
# fail 0
# skipped 0
# duration_ms 2064.326209
```

`npm run test:mock`：

```text
4 skipped
266 passed (2.5m)
```

`npm run test:local`：

```text
11 skipped
42 passed (1.6m)
```

`npm run build`：

```text
✓ 144 modules transformed.
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-CgKsGA-d.css   65.39 kB │ gzip:  10.76 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-Dtvdr4I0.js   714.60 kB │ gzip: 200.76 kB
✓ built in 878ms
```

`npm run check:production-bundle`：

```text
production bundle check passed: 12 files, 12 demo identifiers absent
```

`git diff --check`：exit 0，無輸出。

## 非阻擋 WebKit

本批依規格只跑一次，結果如下：

```text
7 failed
3 skipped
125 passed (2.1m)
```

相較 C1／C2 的 126／6／3，多一項既知的 `keyboard dialogs trap focus and return it to the trigger` WebKit focus 波動；另外六項與既有 performance／focus 清單相同。這次只搬三個純判斷，未修改 dialog、DOM、focus 或 UI；Chromium 266 項全綠，因此記為非阻擋基準波動，不重跑修飾數字。

## 反向掃描與白名單

- `rg -n '\bas any\b|:\s*any\b|<any>|@ts-ignore|@ts-expect-error' src/features/chat src/sessionController.js`：輸出空。
- `git diff --name-only -- src/main.js src/sessionViews.js src/dataApi.js tests supabase/migrations supabase/tests data/courts.json`：輸出空。
- 沒有修改測試、UI、data facade、migration、DB 測試、球場資料或 runtime LINE 欄位。
- 本機 Supabase 未 reset、未套 migration、未手動修改資料。

## BLOCKED／偏差

- BLOCKED：無。
- 偏差：無。
