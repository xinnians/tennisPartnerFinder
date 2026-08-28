# ESLint 恢復 Phase E-2 派工單：callback-default 首修批（map.ts 兩筆，驗收模板批）

- 日期：2026-08-28。母文件：
  `docs/arch-plan-2026-08-27-typeaware-eslint-restoration.md` §4E；設計輸入＝
  Phase E-1 驗收紀錄
  （`docs/arch-reports/eslintE1-unbound-manifest-acceptance-2026-08-28.md`）
  切批序第一批與記帳第 1 項。
- 開工基準：`77365a0`（Phase E-1 ACCEPTED）之後的最新 main HEAD（working
  tree 應乾淨，否則停手回報）。
- **本批性質：最小 type-only 修復批**。目標＝修掉 manifest 中
  `callback-default` family 全部 2 筆（`map.ts:470`），並以 scoped
  override 讓 `unbound-method` 對 `src/map.ts` 上線；**同時驗證後續所有
  function-property 批共用的驗收模板**。零 runtime token、零行為變更。
- 你不 commit、不 push；working tree 交驗收方。

## 目標兩筆（manifest stable ID 凍結）

| stableId | 位置 | expression |
| --- | --- | --- |
| `20cd603ceabcae4d0887599015c26831` | `src/map.ts:470:5` | `onSession = () => {}` |
| `761154dcdb4d5bda67d077b9bf89e588` | `src/map.ts:470:27` | `onCluster = () => {}` |

## 修改一：`src/map.ts`（唯一 src 改動面）

`SessionPinHandlers`（`:104-107`，未 export、檔內唯一使用處＝`:470`）的兩個
optional method signature 改為 optional function property：

```ts
// 修改前
interface SessionPinHandlers {
  onCluster?(court: MapCourtSummary, sessions: SessionSummary[]): void;
  onSession?(sessionId: SessionSummary["sessionId"]): void;
}
// 修改後
interface SessionPinHandlers {
  onCluster?: (court: MapCourtSummary, sessions: SessionSummary[]) => void;
  onSession?: (sessionId: SessionSummary["sessionId"]) => void;
}
```

- **`:470` 的 runtime 原文（destructure＋default arrows）一字不動**；成員
  順序、參數名、`?` optionality 全保留。
- construction site 全列（開單實測，動手前自行重驗）：`src/main.js:286`
  （object literal 傳兩個 arrow）、`tests/session-controller.test.js:3123`
  （只傳 `onSession` arrow）。兩處皆與 function property 契約相容，
  預期零 diff；若發現第三個 construction site，停手回報。

## 修改二：`eslint.config.js`（scoped override 上線）

比照 `databaseTypes` scoped override 先例（`:89-96`，其中 `:89-90` 為註解、
`:91-96` 為區塊），在 `:96` 之後、`:97` 註解之前新增（勿把 `:97-98` 註解
與其所屬區塊拆開）：

```js
// Phase E unbound-method 逐批恢復：已清零的檔案以 scoped override 先上線，
// 全庫清零後移除本區塊與全域 off。
{
  files: ["src/map.ts"],
  rules: {
    "@typescript-eslint/unbound-method": "error",
  },
},
```

- 全域 `"@typescript-eslint/unbound-method": "off"`（`:84`）**本批不動**
  （其餘 244 筆仍在）；flat config 後方區塊覆蓋前方，scoped error 生效。
  [已驗證] flat config 以規則名為粒度合併，scoped override 只取代同名
  規則，不影響 `src/map.ts` 其他 type-aware 規則（實測：databaseTypes.ts
  有同型 override，仍保有 no-floating-promises／no-unsafe-assignment／
  react-hooks 全為 error）。`:97` 註解所指的 replace 是「同一條規則的
  選項陣列」，與本區塊無關。
- 註解措辭可調，但必須說明「逐批恢復、清零後收攏」的意圖。

## 修改三：`scripts/generate-eslint-unbound-manifest.mjs` 硬 gate 常數

Phase E-1 驗收記帳第 1 項的必要步驟：`:16-18` 的
`EXPECTED_FINDINGS` 246→**244**、`EXPECTED_FILES` 28→**27**（`map.ts`
兩筆為該檔全部）；`EXPECTED_SESSION_CONTROLLER_FINDINGS` 63 **不變**。
除三常數行外 generator 零 diff（`:85` 的 `!parent break` 不順手改，維持
最小批）。改完以 `node scripts/generate-eslint-unbound-manifest.mjs`
重生兩檔，再以 `--check` 自證綠。generator 自帶 `overrideConfig` 強制
`unbound-method: error` 掃 SCAN_GLOBS，與 `eslint.config.js` 的 off／
scoped 無關，因此本批**不需**另做「暫時全開法重掃對照」——`--check`
的 244／27／63 即該對照。

## 硬驗收條件

1. **規則有牙三拍**（gate 上線必證明有牙）：
   - 存量綠：修復後 `npm run lint` 全綠。
   - canary 紅：暫時把 `:104-107` revert 回 method signature →
     `npm run lint` 恰紅 **2 筆**，指名 `@typescript-eslint/unbound-method`
     於 `src/map.ts` 470 行（逐字抄錄）。
   - 還原：SHA-256 byte-identical 還原修復版 → 綠。
2. **erased-token 全等**：修改前（HEAD 版）與修改後的 `src/map.ts` 各自以
   esbuild 擦除（同版 esbuild、loader ts、format "esm"、target "esnext"、
   minifyWhitespace true、treeShaking false，沿用 Phase A–D gate 口徑）
   逐 byte 全等；bundle 淨 0 B。
3. **manifest 收斂**：重生後兩筆 stableId 自 JSON 消失（指名反掃）、
   `callback-default` family 0、`src/map.ts` 不在檔案清單；244／27／63；
   generator 兩次 byte-identical（兩次 SHA-256）＋`--check` 三拍
   （改一 byte→紅→還原→綠）。
4. **無新增例外**：不加 `any`／`@ts-ignore`／inline disable；`:470`
   與兩個 construction site 零 diff（`git diff` 自證）。

## 解凍清單（Q3 守則：未列即凍結）

- `src/map.ts`：僅 `:104-107` 兩個成員宣告形狀。
- `eslint.config.js`：僅新增上述 scoped override 區塊。
- `scripts/generate-eslint-unbound-manifest.mjs`：僅 `:16-17` 兩常數。
- `docs/arch-eslint-phaseE-unbound-manifest.json`／`.md`：由 generator
  重生，不得手改。

**仍凍結**：其餘 `src/**` 全部、`tests/**` 全部（含
`session-controller.test.js:3123`）、`tsconfig.json`、`package.json`、
`package-lock.json`、全域 off 行、databaseTypes override、bundle gate。

格式面備忘：`prettier:check` glob 含 `eslint.config.js` 與 `scripts/**`、
不含 `docs/**`——新增 config 區塊與常數行需 prettier-clean；重生的
manifest `.md` 非 prettier 格式但不在 glob 內（E-1 記帳第 2 項），
不需也不得手動 format。

## 收尾標準矩陣（實跑、不接 pipe、逐字抄錄）

- typecheck／lint／prettier:check／build／check:production-bundle
  （main gzip 與 total gzip 淨 0 B）／test:session-unit（346）／test:mock
  （≥298）／**test:local（本批動 src，必跑；紅時先數 DB 再依 guarded
  reset 三拍分類）**／`git diff --check`。
- generator 兩次 SHA-256＋`--check` 三拍。
- `git status --porcelain` 全庫：改動恰為解凍清單＋回報檔。

## 回報合約

寫 `docs/arch-dispatch-2026-08-28-eslintE2-map-callback-default-report-codex.md`
（不 commit、不 push），必含：修改後 `:104-107` 逐字原文（防偽引用）、
canary 紅的 lint 輸出逐字、generator 成功行與 `--check` 三拍逐字、兩筆
stableId 反掃證明、erased-token 對帳結果、收尾矩陣逐字、Codex 五問
（第 5 問答「本批驗收模板中哪些步驟可原樣複用到 controller ports 79 批、
哪些需要調整——特別是 scoped override files 陣列的擴充方式與 manifest
常數維護的自動化空間」）、未做／疑義／BLOCKED。
