# 批次 E2 回報：主 chunk 大小 gate

## 變更與檔案意圖

- `scripts/check-production-bundle.mjs`：從 `dist/index.html` 找唯一 production entry script，量 raw bytes 與 Node gzip bytes；任一超過固定上限即 fail，並保留原有 demo identifier 掃描。
- 本回報 `docs/arch-reports/batch-E2.md`。

沒有修改 package script：既有 `check:production-bundle` 已直接執行此檔，所以本機與 frontend CI 都自動取得新 gate。

## 上限依據

E1 最終 entry chunk 實測：

```text
raw：639896 bytes
gzip：184705 bytes
```

依派工取實測值乘 1.1 並向上取整：

```text
MAIN_CHUNK_RAW_LIMIT_BYTES = 703886
MAIN_CHUNK_GZIP_LIMIT_BYTES = 203176
```

這保留 10% 日常維護空間，但不能無聲長回 E1 前的 717.45 kB／201.26 kB（Vite 顯示值）。

## Gate 有牙三拍

### 1. 現量綠

```text
$ npm run check:production-bundle
production bundle check passed: 28 files, 12 demo identifiers absent; main chunk 639896/184705 bytes within 703886/203176
```

### 2. 暫時降低上限，驗紅

只用精確 patch 把 raw 上限由 `703886` 暫改為 `639895`，比現量少 1 byte：

```text
$ npm run check:production-bundle
AssertionError [ERR_ASSERTION]: production main chunk raw size 639896 bytes exceeds 639895 bytes: assets/index-DdBPRNH2.js
    at file:///Users/ian/tennisPartnerFinder/scripts/check-production-bundle.mjs:44:8
```

命令 exit 1，證明 gate 真的會擋下超標 entry chunk。

### 3. 精確恢復，重新轉綠

沒有使用 `git checkout`；再用精確 patch 把 raw 上限恢復為 `703886`：

```text
$ npm run check:production-bundle
production bundle check passed: 28 files, 12 demo identifiers absent; main chunk 639896/184705 bytes within 703886/203176
```

## Build 數字

E2 沒有修改 runtime，最終 build 與 E1 相同：

```text
✓ 148 modules transformed.
dist/assets/index-DdBPRNH2.js   639.90 kB │ gzip: 184.71 kB
✓ built in 916ms
```

最終 gate 直接從檔案量得：

```text
production bundle check passed: 28 files, 12 demo identifiers absent; main chunk 639896/184705 bytes within 703886/203176
```

## 固定 Gate

`npm run typecheck`、`npm run lint`、`npm run prettier:check`：exit 0；Prettier 末尾：

```text
Checking formatting...
All matched files use Prettier code style!
```

`npm run test:session-unit`：

```text
1..280
# tests 280
# suites 0
# pass 280
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

`npm run test:mock`：

```text
4 skipped
266 passed (2.5m)
```

`npm run test:local`：

```text
ℹ tests 2
ℹ pass 2
ℹ fail 0

11 skipped
42 passed (1.5m)
```

沒有 fixture 資源耗盡，未執行 local DB reset。

`git diff --check`：exit 0，無輸出。

## 非阻擋 WebKit

依規格只跑一次：

```text
6 failed
3 skipped
126 passed (2.0m)
```

與固定基準完全相同；六項都是既有 performance／focus timeout。E2 只改 build 後的 Node 檢查 script，沒有 runtime 影響。

## 白名單與未動範圍

- 只使用 E2 白名單的 `scripts/check-production-bundle.mjs` 與新回報。
- 未新增 script、依賴或 package 變更；production bundle check 原入口不變。
- `git diff --name-only -- .env supabase/migrations supabase/tests data/courts.json vercel.json package.json package-lock.json src` 輸出空。
- 沒有 push、deploy、改 `.env*`、DB、migration、Supabase tests、球場資料、CSP 或 runtime。

## BLOCKED／偏差

- BLOCKED：無。
- 偏差：無。
