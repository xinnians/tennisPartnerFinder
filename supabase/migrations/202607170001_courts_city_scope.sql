-- Keep city nullable: the three historical fictional rows are retained for
-- referential integrity but intentionally remain outside data/courts.json.
alter table public.courts
  add column if not exists city text;

alter table public.courts
  drop constraint if exists courts_city_scope_check;

alter table public.courts
  add constraint courts_city_scope_check
  check (city is null or city in ('台北市', '新北市'));

-- Backfill only the verified legacy join keys.  The following generated
-- catalogue migration owns the complete data/courts.json backfill; a generic
-- district backfill here would incorrectly assign a city to archived fiction.
update public.courts
set city = '台北市'
where city is null
  and name in ('台北網球中心', '百齡河濱公園網球場', '青年公園網球場');
