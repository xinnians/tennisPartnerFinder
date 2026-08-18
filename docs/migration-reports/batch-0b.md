# 批 0b 回報：逐字掃描單元測試改行為式

## 1. 結論與設計

結論：三個來源掃描測試已改以跨 `src/` 樹的符號／語意 pattern 與動態副檔名掃描為錨點；拆檔模擬不誤報，四種違規 canary 均確實轉紅，產品 `src/` 最終零差異。

### LINE allowlist

- `tests/session-data-boundary.test.js:98–167、179–217` 遞迴掃描 `src/` 與 `public/` 的 `.js/.ts/.tsx`，不再鎖八組檔名與整行字面。
- standalone `LINE` token 逐一以字元範圍比對四類核可語意：Supabase provider 識別符、登入方法標籤、LINE 登入按鈕文案、帳號連結說明。即使同一行另有核可 token，額外的不核可 token 仍無法搭便車通過。
- 每個核可 pattern 都必須至少命中一次，避免 allowlist 殭屍化；`line.me` 額外連註解一起掃描。
- `line_id` 只鎖「全 `src/` 恰一次」及內容必須為 `p_line_id: null,`，不再鎖 `dataApi.js` 路徑。

### NTRP 單一來源

- `tests/session-create-form.test.js:13–49` 遞迴掃描 `src/` 的 `.js/.ts/.tsx`；`NTRP_SCALE_EXPLANATION` 的實際字面值在全樹仍必須恰好一次。
- 符號定義在全樹必須恰好一處，唯一字面也必須與該定義同檔；每個出現該符號的檔案都必須定義、以 ESM named import 引入或從 barrel re-export。消費端可拆檔、重排 import 或經 formatter 改行，不會再被「單檔恰四次」誤報；複製字面或無 import 使用仍會失敗。

### legacy style scan

- `tests/legacy-style-scan.test.js:8–34` 保留 `readdir` 自動掃描，副檔名擴為 `.css/.js/.ts/.tsx`。
- 掃描下限註解同步為目前 top-level `src/` 22 檔加 `index.html`，守門下限為 23。

### 掃描集非空數字

- LINE：`src/` script 20 檔（斷言下限 15）＋ `public/push-sw.js` 1 檔，實掃共 21 檔。
- NTRP：`src/` script 20 檔（斷言下限 15）。
- legacy style：top-level `src/` 22 檔＋ `index.html`，實掃 23 檔（斷言下限 23）。

## 2. 變更檔案

- `tests/session-data-boundary.test.js:98–167、179–217`：LINE 語意 pattern allowlist、pattern 活性守門、跨樹 `line_id` 契約與掃描下限。
- `tests/session-create-form.test.js:1–49`：跨樹 NTRP 字面／定義／import/re-export 契約與掃描下限。
- `tests/legacy-style-scan.test.js:8–34`：納入 `.ts/.tsx` 並更新掃描集推導與下限。
- `docs/migration-reports/batch-0b.md:1–330`：本回報。

## 3. 韌性模擬：拆出 `openLoginModal`

暫時把 `src/sheets.js` 的 `AUTH_LINE_PROVIDER_ID` import、`LOGIN_TITLES` 與 `openLoginModal` 搬到新檔 `src/loginModal.refactor-canary.js`，原檔只 re-export；三個改寫測試同跑全綠：

```text
TAP version 13
# Subtest: 舊視覺常數不再出現於任何樣式來源
ok 1 - 舊視覺常數不再出現於任何樣式來源
  ---
  duration_ms: 9.111542
  type: 'test'
  ...
# Subtest: NTRP 說明只有一份來源,三個掛載點都引用同一個常數
ok 2 - NTRP 說明只有一份來源,三個掛載點都引用同一個常數
  ---
  duration_ms: 2.847625
  type: 'test'
  ...
# Subtest: frontend source scan allows only the frozen LINE RPC parameter
ok 3 - frontend source scan allows only the frozen LINE RPC parameter
  ---
  duration_ms: 15.722625
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 82.660333
```

## 4. 有牙 canary 紅綠證據

### a. `line.me` 註解

在 `src/config.js` 暫加 `// canary: https://line.me/R/ti/p/example` 後轉紅，關鍵輸出逐字如下：

```text
# Subtest: frontend source scan allows only the frozen LINE RPC parameter
not ok 1 - frontend source scan allows only the frozen LINE RPC parameter
  failureType: 'testCodeFailure'
  error: |-
    frontend source, including comments, must not contain a LINE deep link

    1 !== 0
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 1
  operator: 'strictEqual'
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 73.74225
```

還原後，同一個最終版測試轉綠：

```text
TAP version 13
# Subtest: frontend source scan allows only the frozen LINE RPC parameter
ok 1 - frontend source scan allows only the frozen LINE RPC parameter
  ---
  duration_ms: 15.639667
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 90.057791
```

### b. 第二個 `p_line_id`

在 `src/dataApi.js` 暫加第二行 `p_line_id: null,` 後轉紅，關鍵輸出逐字如下：

```text
# Subtest: frontend source scan allows only the frozen LINE RPC parameter
not ok 1 - frontend source scan allows only the frozen LINE RPC parameter
  failureType: 'testCodeFailure'
  error: |-
    src/ must contain exactly one frozen line_id RPC parameter

    2 !== 1
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 1
  actual: 2
  operator: 'strictEqual'
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 85.036625
```

還原後，同一個最終版測試的逐字綠色輸出與上節相同：

```text
# Subtest: frontend source scan allows only the frozen LINE RPC parameter
ok 1 - frontend source scan allows only the frozen LINE RPC parameter
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 90.057791
```

### c. 第二份 NTRP 說明字面

在 `src/profile.js` 暫加第二份完整 `NTRP_SCALE_EXPLANATION` 字面後轉紅，關鍵輸出逐字如下：

```text
# Subtest: NTRP 說明只有一份來源,三個掛載點都引用同一個常數
not ok 1 - NTRP 說明只有一份來源,三個掛載點都引用同一個常數
  failureType: 'testCodeFailure'
  error: |-
    NTRP explanation must have one definition, found in: /Users/ian/tennisPartnerFinder/src//profile.js, /Users/ian/tennisPartnerFinder/src//sessionViews.js

    2 !== 1
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 1
  actual: 2
  operator: 'strictEqual'
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 53.176833
```

還原後，最終版測試轉綠：

```text
TAP version 13
# Subtest: NTRP 說明只有一份來源,三個掛載點都引用同一個常數
ok 1 - NTRP 說明只有一份來源,三個掛載點都引用同一個常數
  ---
  duration_ms: 4.218083
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 47.788083
```

### d. `.ts` legacy token

暫建 `src/canary.ts`（SHA-256 `ed09cc7ec6f623303488ef37ff4d4d9afa9339fbd9910c78c0090afe5516e948`）並放入 `#d7f22a` 後轉紅：

```text
ed09cc7ec6f623303488ef37ff4d4d9afa9339fbd9910c78c0090afe5516e948  src/canary.ts
TAP version 13
# Subtest: 舊視覺常數不再出現於任何樣式來源
not ok 1 - 舊視覺常數不再出現於任何樣式來源
  failureType: 'testCodeFailure'
  error: 'src/canary.ts 仍含舊視覺常數 #d7f22a'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 41.044333
```

刪除後，最終版測試轉綠：

```text
TAP version 13
# Subtest: 舊視覺常數不再出現於任何樣式來源
ok 1 - 舊視覺常數不再出現於任何樣式來源
  ---
  duration_ms: 8.273917
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 51.778625
```

## 5. `src/` 暫改還原 SHA-256

```text
src/sheets.js
before 36dda9c8f3f3feef40b3b8776d188e15aa595375118b2f978406a6d5f7b198cc
after  36dda9c8f3f3feef40b3b8776d188e15aa595375118b2f978406a6d5f7b198cc

src/config.js
before 6409df6351b0466e4ec6254cf73e518e8086a952cb7694b5717e98658d086069
after  6409df6351b0466e4ec6254cf73e518e8086a952cb7694b5717e98658d086069

src/dataApi.js
before 8e621a4ebc230057f0236c5d38c82563c39920f81eb2aa3398a0b7a431fa688b
after  8e621a4ebc230057f0236c5d38c82563c39920f81eb2aa3398a0b7a431fa688b

src/profile.js
before 086ba7603a175b18f3b6798526ce0647840f0228de1b4ee1f951073ee2714058
after  086ba7603a175b18f3b6798526ce0647840f0228de1b4ee1f951073ee2714058

src/loginModal.refactor-canary.js
before absent
after  absent

src/canary.ts
before absent
after  absent
```

最終 `git diff -- src/` 完整輸出為空。

## 6. 四個 gate 結尾輸出

local gate 首次遇到既有通知設定 bootstrap race；目標情境單跑為 `1 passed (4.5s)`。依 repo `.claude/rules/testing.md` 的標準前置，以 guarded command 確認並重建 `127.0.0.1:54321` 的 loopback 測試庫後，以下指定 gate 全綠；未動既有 e2e 斷言。

### `npm run test:mock`

```text
  4 skipped
  250 passed (2.1m)
```

### `npm run test:local`

```text
  11 skipped
  42 passed (1.3m)
```

### `npm run build`

```text
dist/index.html                  11.73 kB │ gzip:   3.53 kB
dist/assets/index-Ckdsfrjg.css   67.43 kB │ gzip:  10.64 kB
dist/assets/index-Zt4BwSlo.js     1.93 kB │ gzip:   0.95 kB
dist/assets/index-clC2fhHp.js   485.87 kB │ gzip: 130.67 kB
✓ built in 556ms
```

### `git diff --check`

```text
```

（完整輸出為空；exit code 0。）

## 7. `git diff --stat`

```text
 tests/legacy-style-scan.test.js     |   8 +--
 tests/session-create-form.test.js   |  44 ++++++++++++---
 tests/session-data-boundary.test.js | 109 ++++++++++++++++++++++--------------
 3 files changed, 109 insertions(+), 52 deletions(-)
```

`git diff --stat` 不列未追蹤檔；新增的 `docs/migration-reports/batch-0b.md` 位於白名單。未 commit、未 push。
