# 批 24：修復 archived chat 關閉回歸並改正 local gate 豁免判準

日期：2026-08-21　基準：`5944731`
對應退件單：`docs/codex-rework-order-2026-08-20.md` §1–2

## 1. 問題

批 20 為 React surface 加上正式 `unmount()` 後，聊天在 `cancel_session` 轉為 archived
狀態再關閉時穩定拋出：

```text
Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.
```

本批開工前逐字重跑：

```bash
TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-chromium \
  tests/session.spec.js:1566 --repeat-each=3 --reporter=line
```

結果為 `3 failed`、exit 1，三次都紅在既有 `expect(runtimeErrors).toEqual([])`。
根因不是 `unmount()` 本身，而是 `src/sessionViews.js` 的 `setArchived()` 先以
`querySelector(...).remove()` 拆掉 React 擁有的 withdraw button；之後 React update 或
surface close/unmount 會依虛擬樹再次移除同一節點。

這也推翻舊豁免判準：批 20 零 migration、零 `dataApi.js`、零 RPC 改動，卻仍破壞了
`test:local` 的真實 archived-chat browser journey。故自批 24 起，修改 `src/` runtime
程式碼就不得豁免 `npm run test:local`；只有純測試、CI 設定或文件批可豁免。

## 2. 改動

- `src/sheets/SessionChatSheet.tsx`
  - `SessionChatContentContract` 新增同步 `setArchived()`。
  - archived 由 React state 擁有；input/send disabled、archived note 與 withdraw button
    的條件移除都由同一次 React render 完成。
  - 保留批 20 的 `SurfaceContentLifecycle` 與 `unmount()` 契約。
- `src/sessionViews.js`
  - `setArchived()` 改呼叫 React contract，不再以 `.remove()` 改 React-owned DOM topology。
  - 錯誤訊息、焦點與捲動等原有 imperative 行為保持不變。
- `tests/smoke.spec.js`
  - 既有 chat 測試改用 `canWithdraw: true`，archive 後確認 withdraw 消失，再實際關閉
    surface 並驗 runtime error 為空；因此 mock gate 現在可抓到本回歸。
- `docs/frontend-fix-plan-2026-08-20.md`、`.claude/rules/testing.md`
  - 落檔新版 `test:local` 豁免判準與推翻它的 archived-chat 實證。

## 3. canary 四拍

### 3.1 本批新增的 archived-chat mock gate

1. 改動後、無 canary：

   ```bash
   TENNIS_TEST_HARNESS_MODE=mock npx playwright test --project=desktop-chromium \
     tests/smoke.spec.js -g "chat sheet escapes user bodies" --repeat-each=3 --reporter=line
   ```

   ```text
   3 passed (3.4s)
   exit=0
   ```

2. 精確加入 canary：在 `content.setArchived();` 前重新加入
   `mounted.root.querySelector("[data-chat-withdraw]")?.remove();`，再執行：

   ```bash
   TENNIS_TEST_HARNESS_MODE=mock npx playwright test --project=desktop-chromium \
     tests/smoke.spec.js -g "chat sheet escapes user bodies" --reporter=line
   ```

   ```text
   Error: expect(locator).toBeDisabled() failed
   Locator: getByTestId('session-chat-sheet').getByTestId('chat-message-input')
   Error: element(s) not found
   1 failed
   exit=1
   ```

   React error boundary 已因 `removeChild` render error 卸掉內容，所以 input 不再存在；
   這是 mock gate 第一次能看見同一個 DOM ownership 缺陷。

3. 用精確 patch 刪除上述單行 canary，確認還原內容與重跑：

   ```bash
   rg -n -C 2 "content\.setArchived" src/sessionViews.js
   TENNIS_TEST_HARNESS_MODE=mock npx playwright test --project=desktop-chromium \
     tests/smoke.spec.js -g "chat sheet escapes user bodies" --reporter=line
   ```

   ```text
   877:    content.setArchived();
   1 passed (1.4s)
   exit=0
   ```

4. 對照組使用工單指定的批 19 `d54c098`：

   ```bash
   control_dir=$(mktemp -d /tmp/tennis-batch24-control.XXXXXX)
   git archive d54c098 | tar -x -C "$control_dir"
   ln -s /Users/ian/tennisPartnerFinder/node_modules "$control_dir/node_modules"
   # 以精確 patch 將本批同三行 close-after-archive 斷言與 canWithdraw fixture 加入舊測試
   (cd "$control_dir" && TENNIS_TEST_HARNESS_MODE=mock npx playwright test \
     --project=desktop-chromium tests/smoke.spec.js \
     -g "chat sheet escapes user bodies" --reporter=line)
   ```

   ```text
   1 passed (1.6s)
   exit=0
   ```

   批 19 尚未加入 React unmount，舊 `.remove()` 與新增 close assertion 同時存在仍綠，
   證明紅綠邊界確實由批 20 的 unmount 契約引入。

### 3.2 批 20 unmount gate 未被抵消

精確移除 Session Detail 的 `mounted.registerUnmount(content.unmount);` 後：

```bash
node --test tests/react-surface-lifecycle.test.js
```

```text
Expected values to be strictly equal:
13 !== 14
# tests 3
# pass 2
# fail 1
exit=1
```

精確加回該行後，同指令回到 `# pass 3 # fail 0`、exit 0。

## 4. 完整 gate

所有 gate 在無平行作業時執行；依本批落檔的新判準，`src/` runtime 有改動，
`test:local` 不得豁免。`test:db` 本可因零 migration 豁免，但退件單指定本批全跑，故亦實跑。

| Gate | 結果 |
| --- | --- |
| `node scripts/generate-courts-seed.mjs --check` | `--check 通過`，exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run prettier:check` | `All matched files use Prettier code style!` |
| `npm run test:session-unit` | `270 passed / 0 failed` |
| `npm run test:mock` | `266 passed / 4 skipped`（270） |
| `npm run build` | JS `714.34 / 200.64 kB`；CSS `65.39 / 10.76 kB` |
| `npm run check:production-bundle` | 12 files；12 demo identifiers absent |
| `npm run test:db` | 7 files、799 tests，PASS |
| `npm run test:local` | API `2 passed`；browser `42 passed / 11 skipped`（53） |
| local mobile Chromium | `6 passed` |
| `git diff --check` | exit 0 |

另跑非阻擋 `npm run test:mock:webkit`：`124 passed / 8 failed / 3 skipped`。
其中兩條是退件單批 26 指定的外網 Google avatar 400；其餘為既知 focus/timing 訊號，
本批未將非阻擋 WebKit 誤報為全綠。

焦點重現命令亦單獨驗證：

```bash
TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-chromium \
  tests/session.spec.js:1566 --repeat-each=3 --reporter=line
```

```text
3 passed (22.9s)
exit=0
```

`tests/react-unmount.spec.js` 在 desktop/mobile Chromium 為 `4 passed`。

## 5. 驗收條件對照

| 條件 | 結果 |
| --- | --- |
| 不修改既有 `session.spec.js:1686` 凍結斷言 | ✅ 該檔零 diff |
| 不回滾批 20，surface close 仍先 unmount 再清 DOM | ✅ lifecycle unit 3/3；browser 4/4 |
| local archived-chat 重跑三次 | ✅ 3/3 綠 |
| 移除 Session Detail unmount registration 的 canary | ✅ `# fail 1` |
| mock 模式能在 archive 後 close 並抓 runtime error | ✅ §3.1 canary 紅 |
| 新豁免判準同步兩份流程文件 | ✅ 已落檔 |
| 零 migration、零 `dataApi.js`、零 RPC 簽名改動 | ✅ `git diff --name-only` 可反查 |

## 6. 變更清單與偏離

```text
.claude/rules/testing.md             |  3 +++
docs/frontend-fix-plan-2026-08-20.md |  4 ++++
src/sessionViews.js                  | 10 +++++-----
src/sheets/SessionChatSheet.tsx      | 18 +++++++++++++-----
tests/smoke.spec.js                  |  4 ++++
docs/migration-reports/batch-24.md   | new
```

- 工單偏離：無。
- 凍結面：既有 e2e 斷言、`data-testid`、`id`、`class`、`aria`、文案與最終 DOM 結構均未改；
  只在既有 mock test 追加 archive-close 斷言。
- 工作樹另有使用者提供、未納入本批 commit 的兩份 intake 文件：
  `docs/codex-rework-order-2026-08-20.md` 與
  `docs/migration-reports/batch-13-23-acceptance.md`。
