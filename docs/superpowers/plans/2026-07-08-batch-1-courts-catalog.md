# Batch 1 — 全雙北球場資料庫 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 開工第一步：將本計畫存一份到 `docs/superpowers/plans/2026-07-08-batch-1-courts-catalog.md`（repo 慣例）。

**Goal:** 把 courts 從 6 座 seed 擴到全雙北約 110+ 座（官方開放資料匯入），courts seed migration 改由 script 從資料檔產生（pgTAP 與資料檔同步驗證），profile 球場選單改「分區＋可搜尋」，地圖加球場底圖 pin。

**Architecture:** 新增 `data/courts.json` 作為球場目錄唯一 SoT（含英文意譯 slug，交創辦人掃描定案）；`scripts/generate-courts-seed.mjs` 從它產生冪等 upsert migration＋`supabase/tests/courts_catalog.sql`（同源即同步）；前端 profile 選單（新 `src/courtPicker.js`）與地圖底圖 pin 改吃動態 `courts`；mock 模式維持 6 座示範。

**Tech Stack:** Vite + vanilla JS（ES modules、無框架）、Node 22 ESM script、Supabase local-first（migration + pgTAP）、Playwright E2E。

**排程依據:** `docs/superpowers/plans/2026-07-08-dev-roadmap.md` §5 Batch 1（2026-07-08 再議版）。深度指南＋SEO 落地頁是 Batch 2，本批不做。

## Global Constraints

- **courts 表 schema 不變**；slug 不入 DB，只存 `data/courts.json`；slug 收錄後永不改。
- **court name 仍是跨後端 join key**；名稱唯一（DB `name text not null unique`，script 先驗）；**既有 6 座名稱逐字保留**（hosted `profile_courts` 已引用、pgTAP/E2E 用名稱定位）。
- `lat numeric(9,6) not null`／`lng numeric(9,6) not null`（migration :20-21）→ 資料檔 lat/lng 必填、四捨五入 6 位小數。
- **mock 模式維持 6 座示範**：`src/mockData.js` 的 `COURTS` 陣列不動。
- 資料只用**官方開放來源**（不爬 baseline.tw）；授權=政府資料開放授權條款第 1 版，需標注來源（記在資料檔 meta＋docs；對外顯示隨 Batch 2 落地頁）。
- 顯示名稱一律正規化「臺→台」（shipped 名稱用「台」）。
- UI 文案／註解**繁體中文（zh-TW）**；動態值 `esc()`、URL `safeUrl()`（`src/util.js`）。
- **console 零錯誤政策**：smoke 收集 `console.error`/`pageerror` 斷言為空。
- Supabase **local-first**：本地 migration＋pgTAP＋`npm test` 全綠後才 `npx supabase db push`（hosted ref `ttjzxhihctrtoqdsqxdb`）；**push 過的 migration 檔不可再改**（要改=換新 stamp 產新檔）。
- 測試 Maps stub（`tests/smoke.spec.js` 與 `tests/supabase.spec.js` **兩份重複**）只支援 `Map/Marker/Point/Size`；Marker 只用 `{map,label,title,zIndex,position,icon}`；stub 的 Map 無 `addListener`（不可用 zoom_changed 做底圖顯隱）。
- Node script 只准 import `node:*` 與 `src/districts.js`／`src/util.js`；**禁止 import `src/config.js`**（`import.meta.env` 在 Node 下炸）。
- 跑測試前先讀 `.claude/rules/testing.md`（5174/5175 埠、`-g` 要配 `--project`）。

---

## Context（為什麼做這批）

競品 baseline.tw 有 112 座雙北球場庫＋地圖，我們只有 6 座 seed。2026-07-08 創辦人再議定案：球場資料庫先擴到全雙北（地圖廣度、零用戶時地圖也有內容、為 Batch 2 深度指南提供入口與 slug 基礎），深度內容之後分波滾動（C2–C5）。

### 資料來源（2026-07-08 規劃時已查證）

- **主來源：data.gov.tw 資料集 #22849「全國運動場館資訊」**（https://data.gov.tw/dataset/22849）：運動部、CSV、每年更新、免費；欄位含縣市、行政區、場館名稱、場館分類、地址、緯度、經度、設施項目、開放情形；授權=政府資料開放授權條款-第1版（相容，需標注來源）。用法：篩縣市 ∈ {臺北市, 新北市} 且名稱/設施含「網球」。
- **交叉查核**：臺北 vbs.sports.taipei（體育局場館系統含 GIS）＋data.gov.tw #127187（北市體育局自營場館）；新北河濱 hrcm.ntpc.gov.tw 高灘地工程管理處「網球場」設施頁（判 `isRiverside`）；個別場館 iplay.sa.gov.tw。

### 盤點 ground truth（檔案:行號已逐項驗證）

- 唯一 migration `supabase/migrations/202607020001_initial_mvp_schema.sql`：courts DDL（:16-25）；seed 六座 `on conflict (name) do update`（:272-285，冪等）；RLS `using (is_active)` to anon+authenticated（:120-123）；`grant select`（:261）。`[db.seed]` disabled 且無 seed.sql → **資料必須走 migration**。
- pgTAP 唯一檔 `supabase/tests/quick_contact_rls.sql`（`plan(16)`）；「exactly 6」硬斷言 :81-85；:72/:143/:162 用「大安森林公園網球場」名稱動態查 id。
- `profile_courts.court_id`／`partner_requests.court_id` 皆 `on delete restrict` → 下架球場只能 `is_active=false`，永不 DELETE。
- `loadCourts()`（`src/dataApi.js:124-138`）mock 回 6 座 `COURTS`；Supabase 模式 `select id,name,district,lat,lng where is_active order by id`。`saveCurrentProfile` name→id（:217-218）→ **選單維持存 name 即零改動**。
- discovery view 已有 `court_district`（migration :248）且 `loadDiscoveryPlayers` 用 `select("*")`；`loadActivePartnerRequests` select 已含 `district`（dataApi.js:154）——但 `mapDiscoveryRow`（:27-40）/`mapRequestRow`（:42-56）都沒映射 → **免改查詢，只補 mapper**。
- profile checklist 硬吃 mock `COURTS`（`src/main.js:532-550`）；`setupProfile()`（:674）跑在 `await loadAppData()`（:677）前 → 選單需可重入；`syncProfileForm`（:640-642）只 toggle class 不重繪 → 需改。
- 地圖：`groupPinsByCourt`（`src/map.js:95`）過濾零 items 球場；`renderPins`（:106-135）全清全畫、單一 `markers` 池；zIndex 聚合40/球友30/需求20；`refreshPins` caller＝程度篩選(:272)/類型 chip(:298)/發布(:370)/存檔(:616)/retry(:101)/init(:692) → **底圖 pin 必須獨立池**。
- **Maps stub 排版雷（Plan agent 發現，已驗證原文）**：stub 以 `left = 20 + markers.length*12`、`top = 120 + markers.length*8` 排 marker（smoke.spec.js:54-55），`#app { overflow: hidden }`（style.css:60）→ 底圖池 110+ 顆先建後，overlay pin index 從 110 起跳、`left≈1340px` 溢出被裁切，**既有點擊測試全滅**；且 stub button 文字=`label||title`，底圖 pin 無 label 時整串球場名撐寬按鈕互相遮擋。→ 必須先改兩份 stub 為小格網排版。
- aria-label=`"地圖圖釘 "+(title||label)` → 底圖 pin title 用**前綴** `球場 ${name}`，避免與球友 pin 撞名（前綴插入不會被既有 `/地圖圖釘 大安森林.../` regex 子串誤中）。
- `openCourtDrawer`（`src/sheets.js:115-174`）零 items：header 孤兒「・」（:158）＋清單無空狀態（:162）→ 補。
- `districtOf`（`src/mockData.js:24-27`）只查 mock 6 座、查無回「台北市」→ 新北球場的球友/需求卡顯示錯區 → T5 順修退場。
- `showPlaceholder`（`src/main.js:651-663`）無上限全列 courts → Supabase＋無 Maps key 會列 110+ 行 → 輕量處理。
- E2E 名稱依賴：supabase spec 依賴「大安森林公園網球場」「中正網球中心」存在且 active；smoke 另用「台北網球中心」。
- `package.json` `"type":"module"`；`scripts/` 不存在（本批第一支）；`src/util.js` 可被 Node import。
- 文件連動（本批後過時）：CLAUDE.md「checklist 永遠讀 mock COURTS」段、`.claude/rules/supabase.md`「新增球場=migration＋6 座硬斷言」段、`docs/mvp-plan.md` Next Concrete Step、roadmap Batch 3 預名 `202607080001_session_first_schema.sql`（stamp 被本批用掉，需註記後移）。

---

## 檔案結構（新增/修改總覽）

- Create: `data/courts.json`（球場目錄 SoT）、`src/districts.js`（雙北行政區常數＋cityOf）、`scripts/generate-courts-seed.mjs`（產生器）、`src/courtPicker.js`（profile 選單元件）
- Generated: `supabase/migrations/202607080001_courts_catalog_double_north.sql`、`supabase/tests/courts_catalog.sql`
- Modify: `supabase/tests/quick_contact_rls.sql`、`src/dataApi.js`、`src/mockData.js`、`src/sheets.js`、`src/pins.js`、`src/map.js`、`src/main.js`、`src/style.css`、`index.html`、`tests/smoke.spec.js`、`tests/supabase.spec.js`、`CLAUDE.md`、`.claude/rules/supabase.md`、`supabase/README.md`、`docs/mvp-plan.md`、`docs/superpowers/plans/2026-07-08-dev-roadmap.md`（一行註記）

---

### Task 1: `src/districts.js`＋`data/courts.json` 雛形（6 座）

**Files:** Create `src/districts.js`、`data/courts.json`

**Interfaces (Produces):** `TAIPEI_DISTRICTS: string[]`（12 區）、`NEW_TAIPEI_DISTRICTS: string[]`（29 區）、`cityOf(district) => "台北市"|"新北市"|null`。資料檔 schema（後續所有任務依此）：

```json
{
  "meta": {
    "updatedAt": "2026-07-08",
    "license": "政府資料開放授權條款-第1版",
    "sources": [
      { "name": "運動部 全國運動場館資訊（data.gov.tw #22849）", "url": "https://data.gov.tw/dataset/22849", "fetchedAt": "2026-07-08" }
    ],
    "slugPolicy": "英文意譯、ASCII、收錄後永不改"
  },
  "courts": [
    { "name": "大安森林公園網球場", "slug": "daan-forest-park", "city": "台北市", "district": "大安區", "lat": 25.03, "lng": 121.536, "isRiverside": false, "sourceUrl": "https://vbs.sports.taipei/" }
  ]
}
```

- [ ] **Step 1**：寫 `src/districts.js`（純常數、零 import；雙北行政區名無重複，district→city 唯一推導）：

```js
// 雙北行政區對照:資料檔驗證與 profile 選單分組共用(避免雙 SoT)。
export const TAIPEI_DISTRICTS = ["中正區","大同區","中山區","松山區","大安區","萬華區","信義區","士林區","北投區","內湖區","南港區","文山區"];
export const NEW_TAIPEI_DISTRICTS = ["板橋區","三重區","中和區","永和區","新莊區","新店區","土城區","蘆洲區","樹林區","汐止區","鶯歌區","三峽區","淡水區","瑞芳區","五股區","泰山區","林口區","深坑區","石碇區","坪林區","三芝區","石門區","八里區","平溪區","雙溪區","貢寮區","金山區","萬里區","烏來區"];
export function cityOf(district) {
  if (TAIPEI_DISTRICTS.includes(district)) return "台北市";
  if (NEW_TAIPEI_DISTRICTS.includes(district)) return "新北市";
  return null;
}
```

- [ ] **Step 2**：寫 `data/courts.json` 雛形——meta＋既有 6 座（名稱/district/lat/lng 逐字照 `src/mockData.js:15-20`；slug：`taipei-tennis-center`/`daan-forest-park`/`zhongzheng-tennis-center`/`yingfeng-riverside`/`bailing-riverside`/`youth-park`；迎風/百齡 `isRiverside: true`）。
- [ ] **Step 3**：驗證 `node -e "import('./src/districts.js').then(m=>console.log(m.cityOf('板橋區'), m.cityOf('大安區'), m.cityOf('X')))"` → `新北市 台北市 null`；`npm test` 全綠（零行為變更）。
- [ ] **Step 4**：Commit `feat: 新增雙北行政區常數與球場目錄資料檔雛形`。

### Task 2: `scripts/generate-courts-seed.mjs` 產生器

**Files:** Create `scripts/generate-courts-seed.mjs`

**Interfaces (Produces):** CLI：`node scripts/generate-courts-seed.mjs --stamp 202607080001`（產 migration＋pgTAP）；`--check`（重生成與磁碟檔比對，drift 即 exit 1）；`--slugs`（印 `name → slug` 對照表）。輸出檔：`supabase/migrations/<stamp>_courts_catalog_double_north.sql`、`supabase/tests/courts_catalog.sql`。

- [ ] **Step 1**：實作驗證規則（任一違反 exit 1，聚合列出全部錯誤）：
  1. name 唯一非空；**含「臺」即報錯**（顯示名稱一律「台」）；既有 6 座名稱必須逐字存在（hard error）。
  2. slug 唯一且符合 `/^[a-z0-9]+(-[a-z0-9]+)*$/`。
  3. `city ∈ {台北市, 新北市}`；district 屬於該 city（用 `src/districts.js`）。
  4. lat/lng 為數字、在雙北 bounding box（lat 24.6–25.4、lng 121.2–122.1，攔未轉換 TWD97）、輸出四捨五入 6 位小數。
  5. `sourceUrl` 為 http(s)；`courts.length >= 6`。
- [ ] **Step 2**：實作 migration 產出（SQL 字面值 `s.replace(/'/g, "''")` 逸出；確定性輸出——同輸入位元組級相同）：

```sql
-- AUTO-GENERATED by scripts/generate-courts-seed.mjs from data/courts.json (N 座)。請勿手改;改 data/courts.json 後重生。
insert into public.courts (name, district, lat, lng)
values
  ('台北網球中心', '內湖區', 25.069000, 121.593000),
  ...
on conflict (name) do update
set district = excluded.district, lat = excluded.lat, lng = excluded.lng,
    is_active = true, updated_at = now();

-- 目錄外球場一律停用(不 DELETE:profile_courts/partner_requests 為 on delete restrict)
update public.courts
set is_active = false, updated_at = now()
where name not in ('台北網球中心', ...);
```

- [ ] **Step 3**：實作 `supabase/tests/courts_catalog.sql` 產出（鏡射 `quick_contact_rls.sql` 的 begin/plan/finish/rollback 慣例；`{N}`＝資料檔筆數、新北樣本＝第一筆 `city==="新北市"`，雛形階段無新北 → 該斷言以任一非大安樣本代替並在真實資料後自動切換）：

```sql
-- AUTO-GENERATED ... Do not edit.
begin;
select plan(4);
select is((select count(*) from public.courts where is_active), {N}::bigint,
  'active courts match data/courts.json ({N} entries)');
select is((select count(*) from public.courts where is_active and name in
  ('台北網球中心','大安森林公園網球場','中正網球中心','迎風河濱公園網球場','百齡河濱公園網球場','青年公園網球場')),
  6::bigint, 'legacy six join-key courts remain active');
set local role anon;
select is((select count(*) from public.courts), {N}::bigint, 'anon reads exactly the active catalog');
select is((select count(*) from public.courts where name = '{樣本名}'), 1::bigint,
  'sample court is anon-readable');
select * from finish();
rollback;
```

- [ ] **Step 4**：驗證確定性與 --check：`node scripts/generate-courts-seed.mjs --stamp 202607080001` 跑兩次 → `git diff --exit-code`；`--check` 綠；手動改一格 migration → `--check` exit 1（工具自身 canary）→ 還原。
- [ ] **Step 5**：本地 `npx supabase db reset && npx supabase test db supabase/tests` → 全綠（雛形=6 座，quick_contact_rls 尚未動、courts_catalog N=6 相容）。`npm test` 全綠。
- [ ] **Step 6**：Commit `feat: courts seed 產生器(資料檔→migration+pgTAP 同源產出)`。

### Task 3: `quick_contact_rls.sql` 語意化改寫（去掉 6 座硬斷言）

**Files:** Modify `supabase/tests/quick_contact_rls.sql`（維持 `plan(16)`）

- [ ] **Step 1**：在 `set local role anon`（:79 附近）**之前**、以 postgres 身分插入一座停用測試球場：

```sql
insert into public.courts (name, district, lat, lng, is_active)
values ('__pgtap_inactive_court', '測試區', 25.000000, 121.500000, false);
```

- [ ] **Step 2**：把 :81-85 的 `is(count(*)...6::bigint)` 替換為 RLS 語意斷言（總數斷言已移交 courts_catalog.sql）：

```sql
select is(
  (select count(*) from public.courts where name = '__pgtap_inactive_court'),
  0::bigint,
  'anon cannot read inactive courts (RLS is_active gate)'
);
```

- [ ] **Step 3**：`npx supabase test db supabase/tests` 全綠（整檔 begin/rollback，插入不留殘留）。
- [ ] **Step 4**：Commit `test: quick_contact_rls 的 courts 斷言語意化,總數驗證移交 courts_catalog`。

### Task 4: 全量資料研究＋slug 定案〔C→U〕＋pgTAP 紅→綠

**Files:** Modify `data/courts.json`（換成真實全量）；Generated 兩檔重生

- [ ] **Step 1〔C〕資料抓取與清理**（官方來源，全程記 sourceUrl）：
  1. 下載 data.gov.tw #22849 CSV，篩縣市 ∈ {臺北市, 新北市} 且（場館名稱或設施項目含「網球」）。
  2. 清理：排除非對外開放（用「開放情形」欄）；同場館多列去重；顯示名稱「臺→台」正規化；**既有 6 座以我方名稱為準**（資料集同場館列對映到 shipped 名稱，不改名）。
  3. 交叉查核：新北河濱場對 hrcm.ntpc.gov.tw 網球場清單補漏＋標 `isRiverside`（名稱含河濱/高灘地亦標）；北市對 vbs.sports.taipei 抽查座標；缺經緯度的場館用官方頁補，補不到就**不收**（lat/lng 必填）。
  4. 產出全量 `data/courts.json`（目標約 110+ 座；不足亦可，如實記錄——**查不到的不硬填**）。
- [ ] **Step 2〔C〕slug 全數產生**：英文意譯（官方英名優先，如 `taipei-tennis-center`；無官方英名用意譯＋必要時區名消歧，如 `sanchong-riverside`）；`--slugs` 印對照表。
- [ ] **Step 3〔U〕創辦人掃描定案 slug 對照表**——**執行時的人工檢查點，未定案不得進 Step 4**。
- [ ] **Step 4 紅**：先只重生 pgTAP（跑 `--stamp 202607080001` 會同時重生兩檔——此步在 `db reset` **之前**跑 `npx supabase test db supabase/tests`，本地 DB 仍是 6 座 → courts_catalog **必須紅**（count 6 ≠ N），證明斷言有牙。
- [ ] **Step 5 綠**：`npx supabase db reset && npx supabase test db supabase/tests` → 全綠；`npm test` 三 project 仍全綠（前端未動：舊 checklist 仍讀 mock；publish select 變 110+ 選項但 `selectOption({label})` 與 `courtIdByName`（name 唯一）不受影響）。
- [ ] **Step 6**：Commit `feat: 匯入全雙北球場目錄(N 座)與生成 migration/pgTAP`（訊息記實際座數與資料來源）。

### Task 5: district 資料流順修（mapper 補欄位、`districtOf` 退場）

**Files:** Modify `src/dataApi.js`、`src/mockData.js`、`src/sheets.js`

- [ ] **Step 1**：`mapDiscoveryRow` 加 `courtDistrict: row.court_district ?? ""`；`mapRequestRow` 加 `courtDistrict: court?.district ?? ""`（查詢已含欄位，免改 select）。
- [ ] **Step 2**：`src/mockData.js` 12 筆（6 球友＋6 需求）各補 `courtDistrict`（值照 COURTS 對應區；維持 mock 與 mapper 同形狀慣例）；刪 `districtOf`。
- [ ] **Step 3**：`src/sheets.js` :39、:87 改讀 `p.courtDistrict`/`d.courtDistrict`，刪 `districtOf` import。
- [ ] **Step 4**：`grep -rn "districtOf" src tests` 無結果（附輸出）；`npm test` 全綠。
- [ ] **Step 5**：Commit `fix: 球友/需求卡行政區改吃 DB 欄位,廢除只認 mock 6 座的 districtOf`。

### Task 6: Maps stub 排版改版（純測試基建，先於底圖 pin）

**Files:** Modify `tests/smoke.spec.js`、`tests/supabase.spec.js`（兩份 stub 的 Marker 建構子同步改）

- [ ] **Step 1**：兩份 stub 中 marker 排版改小格網＋固定小尺寸（110+ 顆不溢出 `#app{overflow:hidden}`；390px 視窗 24 欄 → 8+23×15+12=365px 內）：

```js
const i = markers.length;
this.el.style.left = 8 + (i % 24) * 15 + "px";
this.el.style.top = 70 + Math.floor(i / 24) * 22 + "px";
this.el.style.width = "12px";
this.el.style.height = "12px";
this.el.style.overflow = "hidden";
this.el.style.padding = "0";
```

- [ ] **Step 2**：`npm test` 全綠（零產品碼變更）。
- [ ] **Step 3**：Commit `test: Maps stub marker 改格網排版,容納 110+ 底圖 pin 不溢出`。

### Task 7: profile 球場選單（分區＋搜尋）

**Files:** Create `src/courtPicker.js`；Modify `src/main.js`、`src/style.css`、`index.html`、`tests/smoke.spec.js`、`tests/supabase.spec.js`

**Interfaces:** `mountCourtPicker(container, { getSelected, onToggle }) => { setCourts(courts), refresh() }`；選取值仍是**球場名稱字串 Set**（`saveCurrentProfile` name→id 零改動）。

- [ ] **Step 1（測試先行，先紅）**：smoke 新 test（自帶 console 監聽樣板，鏡射 smoke.spec.js:102-106）——進個人檔案 tab → 搜尋框（`aria-label="搜尋球場"`）fill「青年」→ 清單 `.prof-court` 只剩 1 顆 → 點選 → chips 出現「青年公園網球場」→ `expect(runtimeErrors).toEqual([])`。supabase spec 新 test——註冊登入→填暱稱/LINE→搜尋選一座新北球場（名稱以 `readFileSync("data/courts.json")` 取第一筆 `city==="新北市"`，不寫死）→儲存→見「已儲存到 Supabase」→ reload → chips 仍見該球場。跑 `--project=desktop-chromium` 與 `--project=supabase-chromium` 確認**紅**。
- [ ] **Step 2**：寫 `src/courtPicker.js`（shell/list 分離渲染：外殼＋搜尋框只建一次 → **keystroke 不掉焦點**；chips 恆顯示已選、即使不在當前清單 → 解 DB 回填顯示問題）：

```js
// 球場選單:分區＋搜尋。選取值=球場名稱(跨後端 join key)。
import { esc } from "./util.js";
import { TAIPEI_DISTRICTS, NEW_TAIPEI_DISTRICTS } from "./districts.js";

const CHECK_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9E23B" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;

export function mountCourtPicker(container, { getSelected, onToggle }) {
  let courts = [];
  let query = "";

  container.innerHTML = `
    <div class="court-picker">
      <div class="court-picker__chips" data-chips></div>
      <input type="search" class="court-picker__search" placeholder="搜尋球場或行政區" aria-label="搜尋球場" />
      <div class="court-picker__list scroll" data-list></div>
    </div>`;
  const chipsBox = container.querySelector("[data-chips]");
  const listBox = container.querySelector("[data-list]");
  const searchInput = container.querySelector(".court-picker__search");
  searchInput.addEventListener("input", () => {
    query = searchInput.value.trim();
    renderList();
  });
  container.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-c]");
    if (btn) onToggle(btn.dataset.c);
  });

  function renderChips() {
    const selected = [...getSelected()];
    chipsBox.innerHTML = selected.length
      ? selected.map((name) => `
          <button type="button" class="court-chip" data-c="${esc(name)}" aria-label="移除 ${esc(name)}">
            ${esc(name)}<span class="court-chip__x" aria-hidden="true">×</span>
          </button>`).join("")
      : `<div class="court-picker__hint">尚未選擇球場</div>`;
  }

  function renderList() {
    const selected = getSelected();
    const match = (c) => !query || c.name.includes(query) || c.district.includes(query);
    const sections = [];
    for (const [city, districts] of [["台北市", TAIPEI_DISTRICTS], ["新北市", NEW_TAIPEI_DISTRICTS]]) {
      const groups = districts
        .map((district) => ({ district, rows: courts.filter((c) => c.district === district && match(c)) }))
        .filter((g) => g.rows.length);
      if (groups.length) sections.push({ city, groups });
    }
    if (!sections.length) {
      listBox.innerHTML = `<div class="court-picker__hint">找不到符合的球場</div>`;
      return;
    }
    listBox.innerHTML = sections.map((s) => `
      <div class="court-picker__city">${esc(s.city)}</div>
      ${s.groups.map((g) => `
        <div class="court-picker__district">${esc(g.district)}</div>
        ${g.rows.map((c) => `
          <button type="button" class="prof-court${selected.has(c.name) ? " is-on" : ""}" data-c="${esc(c.name)}">
            <span class="prof-court__box">${CHECK_SVG}</span>
            <span class="prof-court__name">${esc(c.name)}</span>
            <span class="prof-court__dist">${esc(c.district)}</span>
          </button>`).join("")}`).join("")}`).join("");
  }

  renderChips();
  renderList();
  return {
    setCourts(next) { courts = next; renderChips(); renderList(); },
    refresh() { renderChips(); renderList(); },
  };
}
```

- [ ] **Step 3**：`src/main.js` 接線——模組級 `let courtPicker = null;`；`setupProfile()` 的 :532-550 checklist 區塊整段替換為：

```js
courtPicker = mountCourtPicker(document.getElementById("prof-courts"), {
  getSelected: () => prof.courts,
  onToggle: (name) => {
    prof.courts.has(name) ? prof.courts.delete(name) : prof.courts.add(name);
    courtPicker.refresh();
  },
});
courtPicker.setCourts(courts); // 初次=mock COURTS(mock 模式維持 6 座示範)
```

`loadAppData()` 兩條成功路徑（mock :326 附近、Supabase :339 之後）courts 賦值後加 `courtPicker?.setCourts(courts);`；`syncProfileForm()` 的 :640-642 toggle 迴圈改為 `courtPicker?.refresh();`。

- [ ] **Step 4**：`src/style.css` 加 `.court-picker__chips`（flex wrap）、`.court-chip`（lime-soft 底、lime-border）、`.court-picker__search`（fork `.modal-field input` 質感，style.css:981-997）、`.court-picker__list`（`max-height: 320px; overflow-y: auto;`）、`.court-picker__city`/`.court-picker__district`（fork `.popover__title` 風格）、`.court-picker__hint`。`index.html` :144 label 改「常打的球場（搜尋加入，可複選）」。
- [ ] **Step 5**：Step 1 兩條新測試轉綠＋`npm test` 全綠（含 smoke test1 console 零錯誤）。
- [ ] **Step 6**：Commit `feat: profile 球場選單改分區＋搜尋,資料改吃 loadCourts`。

### Task 8: 地圖底圖 pin＋抽屜空狀態

**Files:** Modify `src/pins.js`、`src/map.js`、`src/main.js`、`src/sheets.js`、`tests/smoke.spec.js`、`tests/supabase.spec.js`

**Interfaces:** `courtPin(google) => { icon }`（pins.js）；`renderCourtBasePins(google, map, courts, onCourtTap, oldMarkers=[]) => Marker[]`（map.js）。

- [ ] **Step 1（測試先行，先紅）**：smoke 新斷言（可併入 Task 7 的新 test）——切地圖 tab → 點 `getByRole("button", { name: /地圖圖釘 球場 青年公園網球場/ })` → `.drawer` 含「青年公園網球場」「萬華區」；並確認既有 `/地圖圖釘 大安森林公園網球場/` 定位在底圖＋overlay 並存下無 strict-mode 衝突。supabase spec 新 test——點某無內容球場的 `地圖圖釘 球場 X`（X 取資料檔某新北球場）→ 抽屜顯示名稱＋行政區＋空狀態文案；test 自帶 console 監聽斷言為空（驗收條款「不報錯」）。跑對應 project 確認紅。
- [ ] **Step 2**：`src/pins.js` 新增（鏡射既有 SVG data-URI 慣例；**無 label**——110 顆 label 會糊掉地圖，stub 端也靠無 label 縮小按鈕）：

```js
// 球場底圖釘:弱化樣式的同心圓,墊在球友/需求釘下層。
const COURT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11" fill="#F4F6F0" stroke="#9DACA0" stroke-width="1.6"/><circle cx="13" cy="13" r="3.5" fill="#9DACA0"/></svg>`;
export const COURT_PIN_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(COURT_SVG)}`;
export function courtPin(google) {
  return {
    icon: {
      url: COURT_PIN_URL,
      scaledSize: new google.maps.Size(26, 26),
      anchor: new google.maps.Point(13, 13),
    },
  };
}
```

- [ ] **Step 3**：`src/map.js` 新增（與 `renderPins` 同構；title 前綴 `球場 `；zIndex 10 墊底）：

```js
// 球場底圖釘:每座 active 球場一顆,只在資料變動時重建(不進 refreshPins 的篩選重繪池)。
export function renderCourtBasePins(google, map, courts, onCourtTap, oldMarkers = []) {
  oldMarkers.forEach((m) => m.setMap(null));
  return courts.map((court) => {
    const marker = new google.maps.Marker({
      map,
      position: { lat: court.lat, lng: court.lng },
      icon: courtPin(google).icon,
      title: `球場 ${court.name}`,
      zIndex: 10,
    });
    marker.addListener("click", () => onCourtTap(court));
    return marker;
  });
}
```

- [ ] **Step 4**：`src/main.js`——模組級 `let baseMarkers = [];`；新增：

```js
function refreshBasePins() {
  if (!map) return;
  baseMarkers = renderCourtBasePins(google, map, courts, openCourtFromBasePin, baseMarkers);
}
function openCourtFromBasePin(court) {
  const groups = groupPinsByCourt([court], filterData(dataSet, state.filters));
  openCourtDrawer(court, groups[0]?.items ?? [], pinHandlers);
}
```

呼叫點：`init()` 建圖後（`refreshPins()` 旁）＋`refreshDataAndPins()` 內（retry/存檔/發布後 courts 可能變）。**`refreshPins()` 不碰底圖池**——篩選 chip 不重建 110+ marker。

- [ ] **Step 5**：`src/sheets.js` `openCourtDrawer`——:158 sub 改 `[esc(court.district), parts.length ? esc(parts.join("、")) : ""].filter(Boolean).join("・")`（修孤兒「・」）；`items.length === 0` 時清單區渲染空狀態 `<div class="drawer__empty">這座球場還沒有球友或徵求</div>`（此區塊即 Batch 2 指南摘要掛載點，保持乾淨）；`src/style.css` 加 `.drawer__empty`（muted 文字、置中、上下留白）。
- [ ] **Step 6**：Step 1 測試轉綠＋`npm test` 全綠。
- [ ] **Step 7**：Commit `feat: 地圖加球場底圖 pin,抽屜支援零內容球場`。

### Task 9: 輕量收尾

**Files:** Modify `src/main.js`、`src/sheets.js`、`index.html`

- [ ] **Step 1**：`showPlaceholder`（main.js:651-663）改為只列「有球友/需求」的球場＋結尾一行 `共 N 座球場`（mock 6 座全有 items → smoke :176 的「台北網球中心」斷言仍命中）。
- [ ] **Step 2**：publish modal 球場 `<select>`（sheets.js:396-398）以 `<optgroup label="<區>">` 分區（最薄版本；Batch 3 會整個換成開球局 modal）。
- [ ] **Step 3**：`index.html` 地圖頂部 loc-pill「台北市」→「雙北」（若有此文案；創辦人可否決）。
- [ ] **Step 4**：`npm test` 全綠；Commit `chore: placeholder 摘要化與發布選單分區`。

### Task 10: 文件連動＋hosted push＋canary

**Files:** Modify `CLAUDE.md`、`.claude/rules/supabase.md`、`supabase/README.md`、`docs/mvp-plan.md`、`docs/superpowers/plans/2026-07-08-dev-roadmap.md`

- [ ] **Step 1**：CLAUDE.md——「the profile tab's court checklist always renders from mockData `COURTS`」段改寫為新事實（選單吃 `loadCourts()`、mock 6 座示範、目錄 SoT=`data/courts.json`）；`wc -l CLAUDE.md` ≤ 200。
- [ ] **Step 2**：`.claude/rules/supabase.md`——「Adding a court = a new migration plus updating the pgTAP test that hard-asserts exactly 6 active courts」改為「改 `data/courts.json` → `node scripts/generate-courts-seed.mjs --stamp <新stamp>` 產新 migration＋courts_catalog.sql（**push 過的 migration 不可改**）」。
- [ ] **Step 3**：`supabase/README.md` 測試涵蓋清單補 courts_catalog.sql；README 若有 6 座敘述一併校正。
- [ ] **Step 4**：`docs/mvp-plan.md` Next Concrete Step 翻到 Batch 2＋Implementation Status 補本批段落；roadmap Batch 3 加一行註記「`202607080001` stamp 已被 Batch 1 用掉，實作時改用當日 stamp」。
- [ ] **Step 5 canary（pgTAP 有牙，兩道）**：
  1. `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "update public.courts set is_active=false where name='青年公園網球場'"` → `npx supabase test db supabase/tests` **預期紅**（courts_catalog N-1）→ `npx supabase db reset` 復原 → 綠。
  2. 暫時從 `data/courts.json` 刪一座 → `node scripts/generate-courts-seed.mjs --check` **預期 exit 1**（drift）→ 還原 → `--check` 綠。
- [ ] **Step 6 hosted（僅在本地全綠＋canary 通過後）**：`npx supabase db push` → REST 驗證座數＝資料檔筆數：

```bash
curl -sI -H "apikey: $ANON" -H "Prefer: count=exact" -H "Range: 0-0" \
  "https://ttjzxhihctrtoqdsqxdb.supabase.co/rest/v1/courts?select=id&is_active=eq.true" | grep -i content-range
```

- [ ] **Step 7**：Commit `docs: Batch 1 完工連動(CLAUDE.md/rules/mvp-plan/roadmap)`。

---

## 驗證計畫（驗收條款對照）

```bash
# 1) DB 座數 = 資料檔筆數(驗收一;pgTAP courts_catalog + 手動對照)
npx supabase start && npx supabase db reset
npx supabase test db supabase/tests
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select count(*) from public.courts where is_active"
node -e "console.log(JSON.parse(require('fs').readFileSync('data/courts.json')).courts.length)"

# 2) 前端三 project 全綠(驗收四;先清 5174/5175 埠)
npm test
# 驗收二(profile 搜尋新北球場存檔成功)=Task 7 supabase 新 test
# 驗收三(無內容球場抽屜不報錯)=Task 8 supabase 新 test(自帶 console 斷言)

# 3) 產生器確定性
node scripts/generate-courts-seed.mjs --stamp 202607080001 && git diff --exit-code
node scripts/generate-courts-seed.mjs --check

# 4) canary 兩道(Task 10 Step 5)+hosted REST 座數驗證(Task 10 Step 6)
```

## 風險與已決事項

- **slug 定案是執行中的〔U〕檢查點**（Task 4 Step 3）：未掃描定案不得寫入 repo 提交全量資料。
- 官方資料若不足 110+ 座：如實收錄、不硬填（品質鐵則）；缺口記錄於 commit message 供 C2 波次補查。
- publish modal 110+ 選項 UX 降級：接受（Batch 3 汰換該 modal）。
- migration stamp `202607080001` 與 roadmap Batch 3 預名衝突：Task 10 Step 4 註記後移。
- 6 座既有球場座標會被官方精確值覆寫（pin 微移）：無測試依賴座標值，接受。
- 執行方式：核准後建議 superpowers:subagent-driven-development 逐任務派工（每任務含紅→綠證據與 grep 輸出回報）；或 executing-plans 就地執行。
