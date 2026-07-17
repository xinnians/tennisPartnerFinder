#!/usr/bin/env node
// ============================================================
//  scripts/generate-courts-seed.mjs
//  以 data/courts.json 為單一資料源(SoT),同源產出：
//    - supabase/migrations/<stamp>_courts_catalog_double_north.sql
//    - supabase/tests/courts_catalog.sql (pgTAP)
//  兩份輸出檔皆為確定性輸出：同一份 data/courts.json 重跑必得到
//  位元組級相同的內容,請勿手改產出檔——改 data/courts.json 後重生。
//
//  用法：
//    node scripts/generate-courts-seed.mjs --stamp <migration timestamp>
//        產生 migration + pgTAP 兩份檔案(timestamp 純數字,如 202607080001)
//    node scripts/generate-courts-seed.mjs --check
//        重新產生內容並與磁碟上既有檔案比對,drift 即 exit 1(不寫檔)
//    node scripts/generate-courts-seed.mjs --slugs
//        印出 name → slug 對照表(不寫檔)
//
//  三種模式互斥,一次只能指定一個;不帶任何旗標則印用法並 exit 1。
// ============================================================

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cityOf } from "../src/districts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data/courts.json");
const MIGRATIONS_DIR = path.join(ROOT, "supabase/migrations");
const TESTS_DIR = path.join(ROOT, "supabase/tests");
const MIGRATION_SUFFIX = "_courts_catalog_double_north.sql";
const PGTAP_PATH = path.join(TESTS_DIR, "courts_catalog.sql");

// 既有 seed 經查證為真的三座(join key,逐字保留):跨後端的 join key
// (profile 的球場勾選以「名稱」比對),絕不可從資料檔中消失,否則既有
// profile/partner_requests 會斷鏈。
const LEGACY_REAL = ["台北網球中心", "百齡河濱公園網球場", "青年公園網球場"];

// 2026-07-08 全面校真:既有 6 座 seed 中這 3 座經三個官方來源交叉確認不存在,
// catalog 不得收錄——由 initial migration 既有 seed 保留、本產生器的 migration
// 停用子句(is_active=false)自動停用,不 DELETE。
const FICTIONAL_LEGACY = ["大安森林公園網球場", "中正網球中心", "迎風河濱公園網球場"];

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CITY_SET = new Set(["台北市", "新北市"]);

// 雙北座標 bounding box——攔住忘記從 TWD97 轉換成 WGS84 經緯度的資料。
const LAT_MIN = 24.6;
const LAT_MAX = 25.4;
const LNG_MIN = 121.2;
const LNG_MAX = 122.1;

// ------------------------------------------------------------
//  資料載入
// ------------------------------------------------------------

function loadCourts() {
  const raw = readFileSync(DATA_PATH, "utf8");
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.courts)) {
    console.error("錯誤:data/courts.json 缺少 courts 陣列");
    process.exit(1);
  }
  return data.courts;
}

// ------------------------------------------------------------
//  驗證規則(五大類,聚合列出全部錯誤,不 fail-fast)
// ------------------------------------------------------------

function validateCourts(courts) {
  const errors = [];

  if (courts.length < 6) {
    errors.push(`courts.length 必須 >= 6,目前 ${courts.length} 筆`);
  }

  // 1. name 唯一非空;含「臺」即報錯(顯示名稱一律「台」);既有 seed 查證為真的
  //    三座名稱逐字存在;虛構 3 座不得入 catalog
  const nameCounts = new Map();
  for (const c of courts) {
    const name = c && c.name;
    if (typeof name !== "string" || name.trim() === "") {
      errors.push(`name 為空或非字串:${JSON.stringify(c && c.name)}`);
      continue;
    }
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    if (name.includes("臺")) {
      errors.push(`name 不可含「臺」,顯示名稱一律用「台」:${name}`);
    }
  }
  for (const [name, count] of nameCounts) {
    if (count > 1) errors.push(`name 重複:${name}(${count} 筆)`);
  }
  for (const legacyName of LEGACY_REAL) {
    if (!nameCounts.has(legacyName)) {
      errors.push(`既有 seed 查證為真的三座名稱缺漏,不可從資料檔移除(join key):${legacyName}`);
    }
  }
  for (const fictionalName of FICTIONAL_LEGACY) {
    if (nameCounts.has(fictionalName)) {
      errors.push(`虛構球場不得入 catalog(由 migration 停用):${fictionalName}`);
    }
  }

  // 2. slug 唯一且符合 /^[a-z0-9]+(-[a-z0-9]+)*$/
  const slugCounts = new Map();
  for (const c of courts) {
    const slug = c && c.slug;
    if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
      errors.push(`slug 格式不合法(需符合 ${SLUG_RE}):${c && c.name} → ${JSON.stringify(slug)}`);
      continue;
    }
    slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1);
  }
  for (const [slug, count] of slugCounts) {
    if (count > 1) errors.push(`slug 重複:${slug}(${count} 筆)`);
  }

  // 3. city ∈ {台北市, 新北市};district 屬於該 city
  for (const c of courts) {
    if (!c) continue;
    if (!CITY_SET.has(c.city)) {
      errors.push(`city 必須是 台北市 或 新北市:${c.name} → ${JSON.stringify(c.city)}`);
      continue;
    }
    if (cityOf(c.district) !== c.city) {
      errors.push(`district 不屬於 city:${c.name} → district=${c.district}, city=${c.city}`);
    }
  }

  // 4. lat/lng 為數字、在雙北 bounding box 內(攔未轉換 TWD97)
  for (const c of courts) {
    if (!c) continue;
    const { lat, lng } = c;
    if (typeof lat !== "number" || Number.isNaN(lat) || typeof lng !== "number" || Number.isNaN(lng)) {
      errors.push(`lat/lng 必須是數字:${c.name} → lat=${lat}, lng=${lng}`);
      continue;
    }
    if (lat < LAT_MIN || lat > LAT_MAX || lng < LNG_MIN || lng > LNG_MAX) {
      errors.push(
        `lat/lng 超出雙北 bounding box(可能是未轉換的 TWD97 座標):${c.name} → (${lat}, ${lng})`
      );
    }
  }

  // 5. sourceUrl 為 http(s)
  for (const c of courts) {
    if (!c) continue;
    if (typeof c.sourceUrl !== "string" || !/^https?:\/\//i.test(c.sourceUrl)) {
      errors.push(`sourceUrl 必須是 http(s) 開頭:${c.name} → ${JSON.stringify(c.sourceUrl)}`);
    }
  }

  return errors;
}

// ------------------------------------------------------------
//  SQL 產出小工具
// ------------------------------------------------------------

/** SQL 字面值逸出並加上單引號 */
function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** 經緯度四捨五入輸出 6 位小數 */
function fmtCoord(n) {
  return Number(n).toFixed(6);
}

/**
 * pgTAP 第 4 條斷言的樣本球場:第一筆 city==="新北市" 的球場;
 * 雛形階段尚無新北資料時,改用第一筆名稱不在 LEGACY_REAL 的球場
 * (有真實新北資料後自動切換)。
 */
function pickSample(courts) {
  const newTaipei = courts.find((c) => c.city === "新北市");
  if (newTaipei) return newTaipei.name;
  const sample = courts.find((c) => !LEGACY_REAL.includes(c.name));
  return sample ? sample.name : courts[0].name;
}

// ------------------------------------------------------------
//  Migration 產出
// ------------------------------------------------------------

function buildMigration(courts) {
  const n = courts.length;
  const valuesLines = courts
    .map(
      (c) =>
        `  (${sqlString(c.name)}, ${sqlString(c.city)}, ${sqlString(c.district)}, ${fmtCoord(c.lat)}, ${fmtCoord(c.lng)})`
    )
    .join(",\n");
  const nameList = courts.map((c) => sqlString(c.name)).join(", ");

  return `-- AUTO-GENERATED by scripts/generate-courts-seed.mjs from data/courts.json (${n} 座)。請勿手改;改 data/courts.json 後重生。
insert into public.courts (name, city, district, lat, lng)
values
${valuesLines}
on conflict (name) do update
set city = excluded.city, district = excluded.district, lat = excluded.lat, lng = excluded.lng,
    is_active = true, updated_at = now();

-- 目錄外球場一律停用(不 DELETE:profile_courts/partner_requests 為 on delete restrict)
update public.courts
set is_active = false, updated_at = now()
where name not in (${nameList});
`;
}

// ------------------------------------------------------------
//  pgTAP 產出(鏡射 quick_contact_rls.sql 的 begin/plan/finish/rollback 慣例)
// ------------------------------------------------------------

function buildPgTap(courts) {
  const n = courts.length;
  const newTaipeiCount = courts.filter((court) => court.city === "新北市").length;
  const legacyReal = LEGACY_REAL.map((name) => sqlString(name)).join(",");
  const fictionalLegacy = FICTIONAL_LEGACY.map((name) => sqlString(name)).join(",");
  const sample = pickSample(courts);

  return `-- AUTO-GENERATED by scripts/generate-courts-seed.mjs from data/courts.json. Do not edit.
begin;
select plan(8);
select is((select count(*) from public.courts where is_active), ${n}::bigint,
  'active courts match data/courts.json (${n} entries)');
select is((select count(*) from public.courts where is_active and (city is null or city not in ('台北市', '新北市'))), 0::bigint,
  'every active court has a valid city from data/courts.json');
select is((select count(*) from public.courts where is_active and city = '新北市'), ${newTaipeiCount}::bigint,
  'New Taipei courts remain in the raw active catalogue');
select is((select count(*) from public.courts where is_active and name in
  (${legacyReal})),
  3::bigint, 'legacy real-three join-key courts remain active');
select is((select count(*) from public.courts where name in (${fictionalLegacy}) and is_active), 0::bigint, 'fictional legacy courts are deactivated');
select is((select count(*) from public.courts where name in (${fictionalLegacy}) and city is null), 3::bigint,
  'fictional legacy courts retain a null city');
set local role anon;
select is((select count(*) from public.courts), ${n}::bigint, 'anon reads exactly the active catalog');
select is((select count(*) from public.courts where name = ${sqlString(sample)}), 1::bigint,
  'sample court is anon-readable');
select * from finish();
rollback;
`;
}

// ------------------------------------------------------------
//  --check:找出既有 migration(依檔名 suffix 比對,若多筆取最新一支)
// ------------------------------------------------------------

function findExistingMigration() {
  if (!existsSync(MIGRATIONS_DIR)) return null;
  const matches = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(MIGRATION_SUFFIX))
    .sort();
  if (matches.length === 0) return null;
  return path.join(MIGRATIONS_DIR, matches.at(-1));
}

// ------------------------------------------------------------
//  CLI
// ------------------------------------------------------------

function printUsage() {
  console.error(`用法:
  node scripts/generate-courts-seed.mjs --stamp <migration timestamp>   產生 migration + pgTAP
  node scripts/generate-courts-seed.mjs --check                        重新產生並與磁碟現有檔案比對,drift 即 exit 1
  node scripts/generate-courts-seed.mjs --slugs                        印出 name → slug 對照表

三種模式互斥,一次只能指定一個。`);
}

function main() {
  const args = process.argv.slice(2);
  const stampIdx = args.indexOf("--stamp");
  const hasStamp = stampIdx !== -1;
  const stampValue = hasStamp ? args[stampIdx + 1] : undefined;
  const hasCheck = args.includes("--check");
  const hasSlugs = args.includes("--slugs");

  const modeCount = [hasStamp, hasCheck, hasSlugs].filter(Boolean).length;
  if (modeCount === 0) {
    printUsage();
    process.exit(1);
  }
  if (modeCount > 1) {
    console.error("錯誤:--stamp / --check / --slugs 三者互斥,一次只能指定一個模式");
    process.exit(1);
  }

  const courts = loadCourts();
  const errors = validateCourts(courts);
  if (errors.length > 0) {
    console.error(`資料驗證失敗(${errors.length} 項):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  if (hasSlugs) {
    for (const c of courts) {
      console.log(`${c.name} → ${c.slug}`);
    }
    return;
  }

  if (hasStamp) {
    if (!stampValue || !/^\d+$/.test(stampValue)) {
      console.error("錯誤:--stamp 需要接一個數字 timestamp,例如 202607080001");
      process.exit(1);
    }
    const migrationPath = path.join(MIGRATIONS_DIR, `${stampValue}${MIGRATION_SUFFIX}`);
    writeFileSync(migrationPath, buildMigration(courts));
    writeFileSync(PGTAP_PATH, buildPgTap(courts));
    console.log(`已產生:${path.relative(ROOT, migrationPath)}`);
    console.log(`已產生:${path.relative(ROOT, PGTAP_PATH)}`);
    return;
  }

  // --check
  const existingMigrationPath = findExistingMigration();
  if (!existingMigrationPath) {
    console.error(
      `錯誤:找不到任何既有 migration(supabase/migrations/*${MIGRATION_SUFFIX}),請先用 --stamp 產生`
    );
    process.exit(1);
  }

  const expectedMigration = buildMigration(courts);
  const expectedPgTap = buildPgTap(courts);
  const actualMigration = readFileSync(existingMigrationPath, "utf8");
  const actualPgTap = existsSync(PGTAP_PATH) ? readFileSync(PGTAP_PATH, "utf8") : null;

  const drifts = [];
  if (actualMigration !== expectedMigration) {
    drifts.push(path.relative(ROOT, existingMigrationPath));
  }
  if (actualPgTap !== expectedPgTap) {
    drifts.push(path.relative(ROOT, PGTAP_PATH));
  }

  if (drifts.length > 0) {
    console.error("drift 偵測:以下檔案與 data/courts.json 重生結果不一致:");
    for (const d of drifts) console.error(`  - ${d}`);
    process.exit(1);
  }

  console.log("--check 通過:產出檔案與 data/courts.json 重生結果一致。");
}

main();
