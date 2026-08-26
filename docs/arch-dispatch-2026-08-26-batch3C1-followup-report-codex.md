# 批 3C-1 補件回報（Codex，B3C1-FU-1〜FU-2）

- 日期：2026-08-26
- 基準：`3cfe4db`＋目前未提交的批 3C-1 working tree；未 revert 主體。
- 狀態：未 commit、未 push。

## FU-1：恢復 bridge live scope fallback

`src/main.js` 的 `mountMeDestination` bag 已恢復 `sessionStore`：

```js
// bridge-scope-only：凍結 bridge 的 commit callback 需要 live 讀 user id 做跨帳號 pending 隔離
// （mount-once 下 closure 捕捉的 authSession 恆為登入前快照）；3C-2 隨 adapter 退役時以 scope 搬進 MePage 根治。
sessionStore: controller?.sessionStore,
```

這讓未修改的 `src/views/pageViews.js` commit callback 每次執行時重新讀取
`options.sessionStore?.getState?.().authSession?.user?.id`，不再依賴 mount-once 捕捉的登入前
`authSession = null`。

`MePageOptions` 同步恢復 bridge-only 型別欄，註解原文：

```ts
// bridge-scope-only：凍結 bridge commit callback live 讀 user id；MePage 本體不得消費，3C-2 隨 adapter 退役搬入 owner。
sessionStore?: Store<SessionControllerState, ControllerEventName>;
```

MePage 元件本體沒有讀取 `props.sessionStore`；九個資料欄仍只走 provider hooks。

## FU-2：原 3C-1 回報 §3 修正段原文

`docs/arch-dispatch-2026-08-26-batch3C1-me-report-codex.md` 已把 bag 數量補正為 26→5，並以
以下文字取代錯誤的第二 fallback 聲稱：

> bridge 補正：原 3C-1 移除 `sessionStore` 後，`mountMeDestination` 的 mount-once closure
> 捕捉到登入前 `authSession = null`，所以「既有第二 fallback 仍取得相同 user id」的原聲稱不實。
> 本補件恢復 `sessionStore` bridge-only 欄，讓凍結 bridge 的 commit callback 每次以
> `options.sessionStore?.getState?.().authSession?.user?.id` live 讀目前帳號並維持跨帳號 pending
> 隔離；MePage 本體仍不消費此 store。3C-2 隨 adapter 退役時，會把 scope 以 auth identity
> 為 key 搬進 MePage owner 並補 node-replacement 帳號切換 oracle。`renderMePage` bridge 本體零修改。

並補記驗收的重要證偽：

> `account-settings:141-146` 在 HEAD 刪除 `syncPendingMySessionActions` 的 canary 仍全 mock 綠，
> 該斷言原本就不咬 bridge sync；實際載重是 React node identity 與 `runMySessionAction`
> imperative disable。因此 3C-2 必須新增 node-replacement 情境，不能沿用現有 Me rerender
> 情境當 scope/sync oracle。

## 收尾矩陣

所有指令直接實跑，未接 pipe。

### 型別

```text
$ npm run typecheck

> tennis-partner-finder@0.1.0 typecheck
> tsc --noEmit

exit 0
```

### Lint

```text
$ npm run lint

> tennis-partner-finder@0.1.0 lint
> eslint "src/**/*.{js,ts,tsx}" "tests/**/*.{js,mjs}" "scripts/**/*.{js,mjs}" eslint.config.js prettier.config.js playwright.config.js vite.config.ts

exit 0
```

### Mock

```text
$ npm run test:mock

unit: 335 tests, 335 pass, 0 fail
playwright:
  4 skipped
  286 passed (51.9s)

exit 0
```

Node unit 期間仍有既有 Vite middleware `Port 24678 is already in use` 診斷，但沒有 `not ok`；
aggregate 通過。存量 `chat-settings-filters:468` 本次通過，未重跑。

### 空白

```text
$ git diff --check
(no output)
exit 0
```

Build、bundle、`test:local` 依補件派工單沿用已通過的 3C-1 數字，未重跑。

## 未做／疑義／BLOCKED

- 未做：node-replacement scope oracle、scope 搬入 MePage owner、adapter/slot 退役；均留給 3C-2。
- 疑義：無。`sessionStore` 是 bridge-scope-only 型別／bag 欄，不是 Me 資料 fallback。
- BLOCKED：無。
