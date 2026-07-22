# 球友層第一波（球友卡＋邀入球局）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** opt-in 球友卡目錄（登入＋完整 profile 才可見）＋地圖球友圖層＋主揪邀請球友入局（invited→accepted 沿用 LINE 揭露模型）。

**Architecture:** 復用 `profiles.is_public`（opt-in）與 `profile_courts`（地圖錨點）；`session_participants` 擴 `'invited'` status＋`initiated_by`；4 處 trigger 放行；新 view `player_directory`＋3 支 RPC。Spec：`docs/superpowers/specs/2026-07-21-player-directory-invites-design.md`。

**Tech Stack:** 同 repo 現行（Supabase plpgsql/pgTAP、原生 ES modules、node --test、Playwright）。

**前置依賴：** 本 plan 在 `2026-07-21-instant-join-mode.md`（Plan A）**之後**執行；view 重建以 A 落地後的版本為基底（`my_session_participations` 已含尾欄 `join_mode`）。

## Global Constraints

（與 Plan A 相同，逐字適用）：migration 只新增 `supabase/migrations/202607210002_player_directory_invites.sql`；前端只經 `src/dataApi.js`；`esc()` 紀律；pgTAP 先紅後綠；不可 push；精確路徑 stage；Playwright 帶 `--project`；錨點定位不依賴行號。
本 plan 額外一條：**球友卡欄位 allowlist 是隱私承諾**——`player_directory` 永不含 `line_id`、真名、email；任何欄位增減先改 pgTAP 斷言。

---

### Task 1: pgTAP canary — invited 機制、visibility 與 my_profile（先紅）

**Files:**
- Modify: `supabase/tests/session_rls.sql`
- Modify: `supabase/tests/my_profile_rls.sql`

- [ ] **Step 1: 確認存量綠**（含 Plan A 已落地的斷言）

```bash
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test && npm run test:db
```
Expected: 全綠。

- [ ] **Step 2: `my_profile_rls.sql` canary**

1. `my_profile` 欄位 allowlist 斷言（grep `table_name = 'my_profile'`）期望字串尾加 `,is_public`。
2. 新增斷言（plan 數同步 +3）：

```sql
-- save_my_profile 不得重置球友卡開關（回歸保護）
select is(
  public.set_player_visibility(true), 'OK',
  'complete profile can turn on player visibility'
);
select ok(
  public.save_my_profile('My Nick', 3.5, 'my_line',
    array[(select id from public.courts where is_active and city = '台北市' order by id limit 1)]::bigint[],
    array['雙打']::text[], array['we-a']::text[]) is not null,
  'profile resave succeeds after visibility opt-in'
);
select is(
  (select is_public from public.my_profile), true,
  'resaving the profile keeps player visibility on'
);
```

（fixture user 沿用檔內既有帳號與 jwt 切換模式；`set_player_visibility` 尚不存在，紅。）

- [ ] **Step 3: `session_rls.sql` canary — invited 生命週期與 raw 邊界**

沿用檔內 fixture 慣例新增測試帳號（uuid `...3001` 邀請 host、`...3002` 被邀 guest、`...3003` 旁觀 guest）。斷言組（骨架，fixture 建立依檔內模式補齊；host 建 approval 局缺額 1、notes `'__pgtap_invite_session__'`）：

```sql
-- 未開啟球友卡的對象不可邀
select throws_ok(
  $$ select public.invite_to_session(current_setting('pgtap.invite_session_id')::bigint,
       current_setting('pgtap.invitee_profile_id')::bigint) $$,
  'P0001', 'INVITEE_NOT_AVAILABLE',
  'inviting a non-discoverable profile is rejected'
);

-- （invitee 以自己的 jwt 開啟球友卡後）host 邀請成功
select is(
  public.invite_to_session(current_setting('pgtap.invite_session_id')::bigint,
    current_setting('pgtap.invitee_profile_id')::bigint),
  'OK', 'host invites a discoverable player'
);

-- 重複邀請
select throws_ok(
  $$ select public.invite_to_session(current_setting('pgtap.invite_session_id')::bigint,
       current_setting('pgtap.invitee_profile_id')::bigint) $$,
  'P0001', 'ALREADY_INVITED', 'double invite is rejected'
);

-- 非 host 不可邀（旁觀 guest jwt）
select throws_ok(
  $$ select public.invite_to_session(current_setting('pgtap.invite_session_id')::bigint,
       current_setting('pgtap.observer_profile_id')::bigint) $$,
  'P0001', 'NOT_SESSION_HOST', 'only the host can invite'
);

-- 邀自己
select throws_ok(
  $$ select public.invite_to_session(current_setting('pgtap.invite_session_id')::bigint,
       current_setting('pgtap.invite_host_profile_id')::bigint) $$,
  'P0001', 'INVALID_TRANSITION', 'host cannot invite themselves'
);

-- 被邀者在 my_session_participations 看到 can_respond_invite
select is(
  (select can_respond_invite from public.my_session_participations
   where session_id = current_setting('pgtap.invite_session_id')::bigint),
  true, 'invitee sees an actionable invite in my sessions'
);

-- 接受：原子補滿、球局轉 full、contact 互看
select is(
  public.respond_to_session_invite(current_setting('pgtap.invite_session_id')::bigint, 'accepted'),
  'OK', 'invitee accepts the invite'
);
select is(
  (select status from public.sessions where id = current_setting('pgtap.invite_session_id')::bigint),
  'full', 'accepting the last slot flips the session to full'
);
select is(
  (select count(*)::integer from public.session_contacts
   where session_id = current_setting('pgtap.invite_session_id')::bigint),
  1, 'accepted invite exposes the host contact to the guest'
);

-- 無邀請者 respond
select throws_ok(
  $$ select public.respond_to_session_invite(current_setting('pgtap.invite_session_id')::bigint, 'accepted') $$,
  'P0001', 'NOT_INVITED', 'responding without an invite is rejected'
);

-- raw writer 邊界：full 局不可殘留 invited（capacity invariant 擴充）
-- 於 privileged 段（reset role 後）直接 insert invited 到 full 局，預期 INVALID_TRANSITION
select throws_ok(
  $$ insert into public.session_participants (session_id, profile_id, role, status, initiated_by)
     values (current_setting('pgtap.invite_session_id')::bigint,
             current_setting('pgtap.observer_profile_id')::bigint, 'guest', 'invited', 'host') $$,
  'P0001', 'INVALID_TRANSITION',
  'raw invited insert into a full session violates the capacity invariant'
);

-- invited 不可直接 withdrawn（狀態機邊界）
-- （另建缺額 2 的第二局、發一筆邀請後，privileged raw update invited→withdrawn）
select throws_ok(
  $$ update public.session_participants set status = 'withdrawn'
     where session_id = current_setting('pgtap.invite_session_two_id')::bigint
       and status = 'invited' $$,
  'P0001', 'INVALID_TRANSITION',
  'invited cannot jump to withdrawn'
);

-- 24 小時滾動邀請上限：同 host 快速發滿 10 筆後第 11 筆
select throws_ok(
  $$ select public.invite_to_session(current_setting('pgtap.invite_session_two_id')::bigint,
       current_setting('pgtap.extra_invitee_profile_id')::bigint) $$,
  'P0001', 'INVITE_LIMIT', 'the eleventh invite in 24h is rejected'
);
```

上限 fixture 說明：需要 10 個可邀對象成本高——改以 privileged `reset role` 段直接 insert 9 筆 `initiated_by='host'` 的 invited 列到第二局（合法：局未滿、對象為既有測試 profiles 可重複利用不同局；若 unique(session_id, profile_id) 限制不足以塞 9 筆，開第三局分攤），再以 RPC 發第 10 筆成功、第 11 筆拒絕。plan 數依實際斷言數更新。

- [ ] **Step 4: 跑紅並記錄失敗清單**

```bash
npm run test:db
```
Expected: FAIL（`invite_to_session` 不存在、`can_respond_invite` 欄位不存在、`is_public` 不在 my_profile、invited 值域不合法等）。

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/session_rls.sql supabase/tests/my_profile_rls.sql
git commit -m "test: 球友邀約與 visibility 的 pgTAP canary（預期紅）"
```

---

### Task 2: Migration 前半 — invited 值域、trigger 放行、visibility

**Files:**
- Create: `supabase/migrations/202607210002_player_directory_invites.sql`

**Interfaces:**
- Produces: `session_participants.status` 含 `'invited'`；`initiated_by` 欄；`set_player_visibility(boolean)`；`my_profile` 含 `is_public`；save_my_profile 保留 is_public。

- [ ] **Step 1: 段 1 — 值域與欄位**

```sql
alter table public.session_participants
  drop constraint session_participants_status_check;
alter table public.session_participants
  add constraint session_participants_status_check
  check (status in ('requested', 'invited', 'accepted', 'declined', 'withdrawn'));

alter table public.session_participants
  add column initiated_by text not null default 'guest'
  check (initiated_by in ('guest', 'host'));
```

（constraint 名先驗證：`select conname from pg_constraint where conrelid = 'public.session_participants'::regclass and contype = 'c';`——inline check 的自動名通常是 `session_participants_status_check`；若實際名不同，migration 以實際名為準並在 PR 註記。）

- [ ] **Step 2: 段 2 — trigger 4 處放行**

以 0003 現行全文為基底 `create or replace` 重建兩個 function，套以下修改（各處給修改後程式碼）：

`private.enforce_session_participant_transition`：

(a) INSERT 分支（原 `elsif new.status <> 'requested' then`）：

```sql
    elsif new.status not in ('requested', 'invited') then
      raise exception 'INVALID_TRANSITION';
    end if;
```

(b) 狀態機（原 requested/accepted 兩條合法轉移）：

```sql
    elsif new.status is distinct from old.status
      and not (
        (old.status = 'requested' and new.status in ('accepted', 'declined', 'withdrawn'))
        or (old.status = 'invited' and new.status in ('accepted', 'declined'))
        or (old.status = 'accepted' and new.status = 'withdrawn')
      ) then
      raise exception 'INVALID_TRANSITION';
    end if;
```

(c) 新列 parent 檢查（原 `if new.role = 'guest' and new.status = 'requested' then`）：

```sql
  if new.role = 'guest' and new.status in ('requested', 'invited') then
```

(d) accepted 轉移容量防護（原 `if old.status <> 'requested' then`）：

```sql
    if old.status not in ('requested', 'invited') then
      raise exception 'INVALID_TRANSITION';
    end if;
```

`private.enforce_session_capacity_invariant`（full 局 pending 殘留檢查，原 `and participant_row.status = 'requested'`）：

```sql
          and participant_row.status in ('requested', 'invited')
```

- [ ] **Step 3: 段 3 — save_my_profile 保留 is_public＋set_player_visibility＋my_profile**

`save_my_profile` 全文重貼（0003:681-770 基底），僅 upsert 段改為：

```sql
  insert into public.profiles (user_id, nickname, ntrp, line_id, is_public)
  values (auth.uid(), btrim(p_nickname), p_ntrp, btrim(p_line_id), false)
  on conflict (user_id) do update
  set nickname = excluded.nickname,
      ntrp = excluded.ntrp,
      line_id = excluded.line_id
  returning id into saved_profile_id;
```

（移除 update 分支的 `is_public = false`——存檔不再下架球友卡；新 profile 仍預設 false。）

新 RPC：

```sql
create or replace function public.set_player_visibility(p_visible boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
begin
  viewer_profile := private.require_complete_profile();

  if p_visible is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.profiles
  set is_public = p_visible
  where id = viewer_profile;

  return 'OK';
end;
$$;

revoke all on function public.set_player_visibility(boolean) from public, anon, authenticated;
grant execute on function public.set_player_visibility(boolean) to authenticated;
```

`my_profile` view 全文重貼（0004:5-37 基底），select 尾端加 `profile_row.is_public`。

- [ ] **Step 4: 局部驗證**

```bash
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test && npm run test:db
```
Expected: `my_profile_rls.sql` 全綠；`session_rls.sql` 仍紅於 `invite_to_session`/`player_directory`/`can_respond_invite`（Task 3-4 範圍），且**不得**新增其他失敗（invited 值域與 trigger 已就位）。

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202607210002_player_directory_invites.sql
git commit -m "feat: participant invited 值域、trigger 放行與球友卡開關"
```

---

### Task 3: pgTAP canary — player_directory（先紅）

**Files:**
- Modify: `supabase/tests/session_rls.sql`

- [ ] **Step 1: 新增 directory 斷言組**

```sql
-- 有序 allowlist（隱私承諾）
select is(
  (select string_agg(column_name, ',' order by ordinal_position)
   from information_schema.columns
   where table_schema = 'public' and table_name = 'player_directory'),
  'profile_id,nickname,ntrp,play_types,slot_codes,court_id,court_name,court_district,court_lat,court_lng,is_self',
  'player_directory has the exact allowlist'
);

-- 永不含 line_id
select is(
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'player_directory'
            and column_name = 'line_id'),
  false, 'player_directory never exposes line_id'
);

-- anon 拒絕
-- （set local role anon 段）
select throws_ok($$select * from public.player_directory$$, '42501',
  null, 'anon cannot read the player directory');

-- is_public=false 不出現；開啟後出現在其常打球場
-- 不完整 profile 的 viewer 看 0 列（用一個未完成 profile 的測試帳號 jwt）
select is(
  (select count(*)::integer from public.player_directory), 0,
  'an incomplete viewer sees an empty directory'
);
-- 完整 viewer 看得到已 opt-in 的球友（含 is_self 標記自己）
```

（後兩組依 fixture 慣例補完整斷言；每條計入 plan 數。）

- [ ] **Step 2: 跑紅、Commit**

```bash
npm run test:db
git add supabase/tests/session_rls.sql
git commit -m "test: player_directory allowlist 與可見性 canary（預期紅）"
```

---

### Task 4: Migration 後半 — directory、invite/respond、view 尾欄（轉綠）

**Files:**
- Modify: `supabase/migrations/202607210002_player_directory_invites.sql`（追加段 4-7；本檔尚未套用 hosted，local 迭代合法）

**Interfaces:**
- Produces: `private.has_complete_profile(uuid)`；`public.player_directory`（11 欄如 allowlist）；`invite_to_session(bigint, bigint)`；`respond_to_session_invite(bigint, text)`；`my_session_participations` 尾欄 `can_respond_invite`；`review_join_request`/`request_to_join_session` 補滿 decline 擴 invited。

- [ ] **Step 1: 段 4 — 完整性判定 helper 與 directory view**

```sql
create or replace function private.has_complete_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile_row
    where profile_row.user_id = p_user_id
      and btrim(profile_row.nickname) <> ''
      and btrim(coalesce(profile_row.line_id, '')) <> ''
      and profile_row.ntrp between 1.0 and 7.0
      and exists (
        select 1
        from public.profile_play_types play_type_row
        where play_type_row.profile_id = profile_row.id
      )
      and exists (
        select 1
        from public.profile_courts profile_court_row
        join public.courts court_row on court_row.id = profile_court_row.court_id
        where profile_court_row.profile_id = profile_row.id
          and court_row.is_active
          and court_row.city = '台北市'
      )
  );
$$;

create or replace view public.player_directory
with (security_barrier = true, security_invoker = false)
as
select
  profile_row.id as profile_id,
  profile_row.nickname,
  profile_row.ntrp,
  coalesce(
    (select array_agg(play_type_row.play_type order by play_type_row.play_type)
     from public.profile_play_types play_type_row
     where play_type_row.profile_id = profile_row.id),
    '{}'::text[]
  ) as play_types,
  coalesce(
    (select array_agg(slot_row.slot_code order by slot_row.slot_code)
     from public.profile_slots slot_row
     where slot_row.profile_id = profile_row.id),
    '{}'::text[]
  ) as slot_codes,
  court_row.id as court_id,
  court_row.name as court_name,
  court_row.district as court_district,
  court_row.lat as court_lat,
  court_row.lng as court_lng,
  (profile_row.user_id = auth.uid()) as is_self
from public.profiles profile_row
join public.profile_courts profile_court_row on profile_court_row.profile_id = profile_row.id
join public.courts court_row on court_row.id = profile_court_row.court_id
where profile_row.is_public
  and court_row.is_active
  and court_row.city = '台北市'
  and private.has_complete_profile(profile_row.user_id)
  and private.has_complete_profile(auth.uid());

revoke all on table public.player_directory from public, anon, authenticated;
grant select on table public.player_directory to authenticated;
```

- [ ] **Step 2: 段 5 — `invite_to_session` 全文**

```sql
create or replace function public.invite_to_session(
  p_session_id bigint,
  p_profile_id bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
  locked_session public.sessions%rowtype;
  prior_status text;
  recent_invite_count integer;
begin
  locked_session := private.lock_and_expire_session(p_session_id);

  if locked_session.status = 'expired' then
    return 'SESSION_EXPIRED';
  end if;

  viewer_profile := private.viewer_profile_id();

  if viewer_profile is null or not private.is_session_host(locked_session.id, viewer_profile) then
    raise exception 'NOT_SESSION_HOST';
  end if;

  if locked_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  elsif locked_session.status = 'full' then
    raise exception 'SESSION_FULL';
  elsif locked_session.status <> 'open' then
    raise exception 'SESSION_NOT_OPEN';
  elsif locked_session.start_at <= now() then
    raise exception 'SESSION_STARTED';
  end if;

  if p_profile_id is null or p_profile_id = viewer_profile then
    raise exception 'INVALID_TRANSITION';
  end if;

  if not exists (
    select 1
    from public.profiles profile_row
    where profile_row.id = p_profile_id
      and profile_row.is_public
      and private.has_complete_profile(profile_row.user_id)
  ) then
    raise exception 'INVITEE_NOT_AVAILABLE';
  end if;

  select participant_row.status
  into prior_status
  from public.session_participants participant_row
  where participant_row.session_id = locked_session.id
    and participant_row.profile_id = p_profile_id;

  if found then
    if prior_status = 'requested' then
      raise exception 'ALREADY_REQUESTED';
    elsif prior_status = 'invited' then
      raise exception 'ALREADY_INVITED';
    end if;
    raise exception 'ALREADY_DECIDED';
  end if;

  select count(*)
  into recent_invite_count
  from public.session_participants participant_row
  join public.sessions session_row on session_row.id = participant_row.session_id
  where session_row.host_profile_id = viewer_profile
    and participant_row.initiated_by = 'host'
    and participant_row.created_at > now() - interval '24 hours';

  if recent_invite_count >= 10 then
    raise exception 'INVITE_LIMIT';
  end if;

  insert into public.session_participants (session_id, profile_id, role, status, initiated_by)
  values (locked_session.id, p_profile_id, 'guest', 'invited', 'host');

  return 'OK';
end;
$$;

revoke all on function public.invite_to_session(bigint, bigint) from public, anon, authenticated;
grant execute on function public.invite_to_session(bigint, bigint) to authenticated;
```

- [ ] **Step 3: 段 6 — `respond_to_session_invite` 全文**

```sql
create or replace function public.respond_to_session_invite(
  p_session_id bigint,
  p_decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_profile bigint;
  locked_session public.sessions%rowtype;
  invited_participant public.session_participants%rowtype;
  accepted_guest_count integer;
begin
  locked_session := private.lock_and_expire_session(p_session_id);

  if locked_session.status = 'expired' then
    return 'SESSION_EXPIRED';
  end if;

  viewer_profile := private.viewer_profile_id();

  if p_decision is null or p_decision not in ('accepted', 'declined') then
    raise exception 'INVALID_TRANSITION';
  end if;

  select *
  into invited_participant
  from public.session_participants participant_row
  where participant_row.session_id = locked_session.id
    and participant_row.profile_id = viewer_profile
    and participant_row.role = 'guest'
    and participant_row.status = 'invited'
  for update;

  if viewer_profile is null or not found then
    raise exception 'NOT_INVITED';
  end if;

  if locked_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  elsif locked_session.start_at <= now() then
    raise exception 'SESSION_STARTED';
  end if;

  if p_decision = 'declined' then
    update public.session_participants
    set status = 'declined'
    where id = invited_participant.id;

    return 'OK';
  end if;

  if locked_session.status = 'full' then
    raise exception 'SESSION_FULL';
  elsif locked_session.status <> 'open' then
    raise exception 'SESSION_NOT_OPEN';
  end if;

  select count(*)
  into accepted_guest_count
  from public.session_participants participant_row
  where participant_row.session_id = locked_session.id
    and participant_row.role = 'guest'
    and participant_row.status = 'accepted';

  if accepted_guest_count >= locked_session.slots_total then
    update public.sessions
    set status = 'full'
    where id = locked_session.id
      and status = 'open';
    raise exception 'SESSION_FULL';
  end if;

  update public.session_participants
  set status = 'accepted'
  where id = invited_participant.id;

  if accepted_guest_count + 1 = locked_session.slots_total then
    update public.sessions
    set status = 'full'
    where id = locked_session.id;

    update public.session_participants
    set status = 'declined'
    where session_id = locked_session.id
      and role = 'guest'
      and status in ('requested', 'invited');
  end if;

  return 'OK';
end;
$$;

revoke all on function public.respond_to_session_invite(bigint, text) from public, anon, authenticated;
grant execute on function public.respond_to_session_invite(bigint, text) to authenticated;
```

- [ ] **Step 4: 段 7 — 既有 RPC 補滿段落擴 invited＋view 尾欄**

1. `review_join_request` 全文重貼（0003:930-1026 基底），補滿 decline 段的 `and status = 'requested'` 改為 `and status in ('requested', 'invited')`。
2. `request_to_join_session` 全文重貼（**Plan A 落地版**基底），instant 分支與（若有的）補滿 decline 同樣擴為 `in ('requested', 'invited')`。
3. `my_session_participations` 全文重貼（Plan A 落地版基底，尾欄現為 `join_mode`），select 尾端再加：

```sql
  ,(
    viewer_participant.status = 'invited'
    and session_row.status in ('open', 'full')
    and session_row.start_at > now()
  ) as can_respond_invite
```

同步更新 `my_session_participations` 的子集斷言（此斷言是 `column_name in (...) having count(*) = N`，非 ordered string；Plan A 落地後 N 為 9）：把 `'can_respond_invite'` 加進 `in (...)` 清單並把 count 改為 `= 10`。

- [ ] **Step 5: 全綠（三拍第三拍）**

```bash
CONFIRM_LOCAL_DB_RESET=1 npm run db:reset:test && npm run test:db
```
Expected: 全 PASS。

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202607210002_player_directory_invites.sql supabase/tests/session_rls.sql
git commit -m "feat: 球友目錄 view 與邀請/回覆 RPC"
```

---

### Task 5: dataApi 與 mock players

**Files:**
- Modify: `src/dataApi.js`
- Modify: `src/mockData.js`
- Modify: `src/main.js`（api 注入表）
- Test: `tests/session-data-boundary.test.js`

**Interfaces:**
- Produces: `PLAYER_DIRECTORY_SELECT`；`loadPlayerDirectory(bounds)` 回 `PlayerCourtEntry[]`（`{profileId, nickname, ntrp, playTypes, slotCodes, courtId, courtName, courtDistrict, courtLat, courtLng, isSelf}`）；`inviteToSession(sessionId, profileId)`、`respondToSessionInvite(sessionId, decision)`、`setPlayerVisibility(visible)` 皆回 `{outcome, reloadRequired}`；`mapMySession` 新增 `canRespondInvite`；`mapCurrentProfile` 新增 `isPublic`；錯誤碼×4 與文案。

- [ ] **Step 1: 先寫失敗 unit**（allowlist 斷言、`mapPlayerDirectoryRow` 映射、invite wrapper outcome）比照檔內既有測試模式，跑 `npm run test:session-unit` 確認紅。

- [ ] **Step 2: 實作 dataApi**

1. 常數：

```js
const PLAYER_DIRECTORY_COLUMNS = [
  "profile_id", "nickname", "ntrp", "play_types", "slot_codes",
  "court_id", "court_name", "court_district", "court_lat", "court_lng", "is_self",
];
export const PLAYER_DIRECTORY_SELECT = PLAYER_DIRECTORY_COLUMNS.join(",");
```

2. `MY_SESSION_COLUMNS` 尾加 `"can_respond_invite"`（`join_mode` 已由 Plan A 在 SESSION_SUMMARY_COLUMNS 引入）；`mapMySession` 加 `canRespondInvite: asBoolean(row.can_respond_invite)`。
3. `MY_PROFILE_COLUMNS` 尾加 `"is_public"`；`mapCurrentProfile` 加 `isPublic: asBoolean(row.is_public)`。
4. mapper：

```js
export function mapPlayerDirectoryRow(row = {}) {
  return {
    profileId: asNumber(row.profile_id),
    nickname: asText(row.nickname),
    ntrp: asNumber(row.ntrp),
    playTypes: asArray(row.play_types),
    slotCodes: asArray(row.slot_codes),
    courtId: asNumber(row.court_id),
    courtName: asText(row.court_name),
    courtDistrict: asText(row.court_district),
    courtLat: asNumber(row.court_lat),
    courtLng: asNumber(row.court_lng),
    isSelf: asBoolean(row.is_self),
  };
}
```

5. 讀取（比照 `loadSessionDiscovery` 的 bounds 四謂詞；mock 分支回 `MOCK_PLAYERS` 過濾 bounds）：

```js
async function loadPlayerDirectory({ bounds } = {}) {
  if (!configured) {
    return asArray(mockPlayers).filter((entry) => withinBounds(entry, bounds)).map((entry) => ({ ...entry }));
  }
  const activeClient = requireClient();
  let query = activeClient.from("player_directory").select(PLAYER_DIRECTORY_SELECT);
  if (bounds) {
    query = query
      .gte("court_lat", bounds.south).lte("court_lat", bounds.north)
      .gte("court_lng", bounds.west).lte("court_lng", bounds.east);
  }
  const { data, error } = await query;
  if (error) throw error;
  return asArray(data).map(mapPlayerDirectoryRow);
}
```

（`withinBounds`/`mockPlayers` 參數比照 `createDataApi` 既有 mock 注入模式：`mockPlayers = MOCK_PLAYERS` 進 factory 參數。）

6. 寫入 wrapper（`invite`/`respond`/`visibility` 皆回 `'OK' | 'SESSION_EXPIRED'`，直接走 `callLifecycleRpc`）：

```js
async function inviteToSession(sessionId, profileId) {
  return callLifecycleRpc("invite_to_session", { p_session_id: sessionId, p_profile_id: asNumber(profileId) });
}
async function respondToSessionInvite(sessionId, decision) {
  return callLifecycleRpc("respond_to_session_invite", { p_session_id: sessionId, p_decision: decision });
}
async function setPlayerVisibility(visible) {
  return callLifecycleRpc("set_player_visibility", { p_visible: Boolean(visible) });
}
```

7. `SESSION_ACTION_CODES` 加 `"INVITEE_NOT_AVAILABLE", "ALREADY_INVITED", "NOT_INVITED", "INVITE_LIMIT"`；`ACTION_MESSAGES` 對應：「這位球友目前未開放邀請。」「你已邀請過這位球友。」「找不到你的邀請，球局狀態可能已更新。」「24 小時內邀請次數已達上限。」
8. singleton 轉發區與 `createDataApi` 回傳物件加四個新函式；`src/main.js` import 與 api 注入表同步加入。

- [ ] **Step 3: `MOCK_PLAYERS`**（`src/mockData.js`，安全示範、不影射真人，球場取 mockData 既有 court）：

```js
export const MOCK_PLAYERS = [
  { profileId: 8001, nickname: "示範山嵐", ntrp: 3.5, playTypes: ["單打", "對拉"], slotCodes: ["we-m", "we-a"], courtId: 101, courtName: "台北網球中心", courtDistrict: "內湖區", courtLat: 25.067446, courtLng: 121.596648, isSelf: false },
  { profileId: 8002, nickname: "示範海風", ntrp: 4.0, playTypes: ["雙打"], slotCodes: ["wd-e"], courtId: 101, courtName: "台北網球中心", courtDistrict: "內湖區", courtLat: 25.067446, courtLng: 121.596648, isSelf: false },
  { profileId: 8003, nickname: "示範杉林", ntrp: 2.5, playTypes: ["練球"], slotCodes: ["we-e"], courtId: 102, courtName: "大佳河濱公園網球場", courtDistrict: "中山區", courtLat: 25.074849, courtLng: 121.531508, isSelf: false },
];
```

（court id/name/座標以 mockData 檔內既有球局用值為準對齊，上列數值執行時校正。）

- [ ] **Step 4: 跑綠、Commit**

```bash
npm run test:session-unit
git add src/dataApi.js src/mockData.js src/main.js tests/session-data-boundary.test.js
git commit -m "feat: dataApi 球友目錄與邀請寫入邊界"
```

---

### Task 6: `groupMySessions` 的 invite 分組

**Files:**
- Modify: `src/sessionController.js`
- Test: `tests/session-controller.test.js`

- [ ] **Step 1: 失敗測試**：invited＋`canRespondInvite: true` 的 session 進 `needsAction` 且 `kind === "invite"`；`canRespondInvite: false`（過期/取消）進 history；排序 host-request → invite → guest-request。跑紅。

- [ ] **Step 2: 實作**（grep 錨點 `participantStatus === "requested"` 分支之前插入）：

```js
    if (viewerRole === "guest" && participantStatus === "invited") {
      if (session?.canRespondInvite) needsAction.push({ kind: "invite", session });
      else history.push(session);
      continue;
    }
```

排序函式 kindOrder 改三值（host-request=0、invite=1、guest-request=2）：

```js
  const KIND_ORDER = { "host-request": 0, invite: 1, "guest-request": 2 };
  needsAction.sort((left, right) => {
    const kindOrder = (KIND_ORDER[left.kind] ?? 9) - (KIND_ORDER[right.kind] ?? 9);
    return (
      kindOrder ||
      compareSessionStart(left.session, right.session) ||
      Number(left.participant?.participantId ?? 0) - Number(right.participant?.participantId ?? 0)
    );
  });
```

- [ ] **Step 3: 跑綠、Commit**

```bash
npm run test:session-unit
git add src/sessionController.js tests/session-controller.test.js
git commit -m "feat: 我的球局將收到的邀請列入需處理"
```

---

### Task 7: UI — 球友卡開關（My Sessions 頁）

**Files:**
- Modify: `src/sessionViews.js`（`renderMySessionsPage` 頂部區塊）、`src/sessionController.js`（visibility state 與 handler）、`src/main.js`（接線）、`src/session.css`

- [ ] **Step 1: 區塊 markup**（`renderMySessionsPage` 需處理區之前；`profile.isPublic` 由 controller 傳入）：

```js
  const visibilityBlock = `
    <section class="player-visibility" aria-label="球友卡">
      <div>
        <h3>球友卡</h3>
        <p class="form-hint">開啟後，完成檔案的球友可在地圖上你的常打球場看到你的暱稱、NTRP 與可打時段。LINE 不會顯示。</p>
      </div>
      <button type="button" class="session-secondary" data-my-action="toggle-visibility"
        role="switch" aria-checked="${profileIsPublic ? "true" : "false"}"
        data-testid="player-visibility-toggle">${profileIsPublic ? "已開啟" : "已關閉"}</button>
    </section>`;
```

- [ ] **Step 2: controller handler**：`toggle-visibility` → `api.setPlayerVisibility(!current)` → 成功後 reload profile（走 main.js 既有 profile 載入路徑）並重繪；失敗 `role="alert"` 顯示 `error.message`。pending 期間 disable（沿用 `runMySessionAction` 模式）。

- [ ] **Step 3: mock 驗證與 Commit**

```bash
npm run test:mock
git add src/sessionViews.js src/sessionController.js src/main.js src/session.css
git commit -m "feat: 我的球局頁提供球友卡開關"
```

---

### Task 8: UI — 地圖球友圖層與球友卡 sheet

**Files:**
- Modify: `src/pins.js`（`playerPin`）、`src/map.js`（`renderPlayerPins`）、`src/sessionViews.js`（`openCourtPlayersDrawer`、`openPlayerCardSheet`、圖層 toggle chip）、`src/sessionController.js`（players state/載入/gate）、`src/main.js`（接線）、`index.html`（toggle 節點，若既有 header 結構容納不下）

**Interfaces:**
- Consumes: `loadPlayerDirectory(bounds)`（Task 5）。
- Produces: controller 的 `togglePlayerLayer()`；view 的 `openPlayerCardSheet(player, { myInvitableSessions, onInvite })`。

- [ ] **Step 1: pins.js 加 `playerPin`**（比照 `courtPin` 的 `markerIcon` 模式，色用 `--blue` 系、label 為該球場球友數）。

- [ ] **Step 2: map.js 加 `renderPlayerPins(google, map, groups, onCourtPlayers, oldMarkers)`**（全文比照 `renderCourtBasePins` 清舊建新；`groups` 為 `{court, players}` 陣列；click 回呼 `onCourtPlayers(court, players)`）。

- [ ] **Step 3: 圖層 toggle 與 controller**

- 地圖上加 chip（`index.html` 地圖容器內）：`<button type="button" id="player-layer-toggle" class="session-secondary" aria-pressed="false">顯示球友</button>`。
- controller：`state.playerLayerOn`、`state.players`；`togglePlayerLayer()`——未登入或 profile 未完成時走既有 `requireSessionAction` gate 流程（intent 種類 `"players"`，登入完成後自動重開圖層）；開啟時以現行 bounds 呼叫 `api.loadPlayerDirectory({ bounds })`（request counter 防競態，比照 discovery 的單調遞增 counter 模式），按 `courtId` 分組後交 `renderPlayerPins`；關閉時清空 players marker。
- bounds idle 事件：圖層開啟時同步重載 players（掛進既有 `loadDiscovery` 的 idle 訂閱路徑，不另訂閱）。

- [ ] **Step 4: 球友清單 drawer 與球友卡 sheet**（`src/sessionViews.js`）

```js
/** 球場球友清單，比照 openCourtSessionDrawer。 */
export function openCourtPlayersDrawer(court, players, { onOpenPlayer = () => {} } = {}) {
  const mounted = mountSheet({
    id: "court-players-sheet",
    label: "球場球友",
    html: `
      <div class="surface__head">
        <div><p class="surface__eyebrow">${esc(court.district || "台北市")}</p><h2>${esc(court.name)}・球友</h2></div>
        <button type="button" class="surface__close" data-surface-close aria-label="關閉球場球友">×</button>
      </div>
      <div class="nearby-sessions__cards">
        ${players.length ? players.map((player) => `
          <button type="button" class="player-card" data-player-id="${esc(player.profileId)}">
            <strong>${esc(player.nickname)}</strong> · NTRP ${esc(Number(player.ntrp).toFixed(1))}
            <span>${esc((player.playTypes ?? []).join("、") || "未填打法")}</span>
          </button>`).join("") : '<p class="surface__copy">這座球場目前沒有開放的球友。</p>'}
      </div>`,
  });
  mounted.root.querySelectorAll("[data-player-id]").forEach((node) => {
    node.addEventListener("click", () => {
      const target = players.find((player) => String(player.profileId) === node.dataset.playerId);
      if (target) onOpenPlayer(target);
    });
  });
  return mounted;
}
```

`openPlayerCardSheet(player, { myInvitableSessions = [], onInvite = async () => {} })`：顯示暱稱/NTRP/打法/時段/常打球場；`player.isSelf` 時不渲染邀請區；否則列出 `myInvitableSessions`（controller 從 `state.mySessions` 過濾 `viewerRole==='host' && status==='open' && startAt 未來`）為 radio 清單＋「送出邀請」鈕（無可邀局時顯示「你目前沒有可邀請的球局」＋「去開球局」CTA 走既有 create intent）；submit 流程沿用表單樣板（pending disable、`role="alert"` 錯誤、`root.contains` finally），成功後原地顯示「邀請已送出」。

- [ ] **Step 5: mock 驗證與 Commit**

```bash
npm run test:mock
git add src/pins.js src/map.js src/sessionViews.js src/sessionController.js src/main.js index.html src/session.css
git commit -m "feat: 地圖球友圖層與球友卡邀請入口"
```

---

### Task 9: UI — 收到的邀請卡與回覆接線

**Files:**
- Modify: `src/sessionViews.js`（`inviteCard`＋`renderMySessionsPage` 分派）、`src/sessionController.js`（`respondInvite` mutation）、`src/main.js`

- [ ] **Step 1: `inviteCard`**（比照 `hostRequestCard`）：

```js
function inviteCard({ session }) {
  return `<article class="my-action-card" data-testid="invite-row" data-session-id="${esc(session.sessionId)}">
    <p class="my-action-card__eyebrow">邀請你加入 · ${esc(session.court)} · ${esc(taipeiDateTime(session.startAt))}</p>
    <h3>${esc(session.hostNickname)} · NTRP ${esc(Number(session.hostNtrp).toFixed(1))}</h3>
    <p>${esc(session.playType)} · 缺 ${esc(session.slotsRemaining)} 位${session.notes ? ` · ${esc(session.notes)}` : ""}</p>
    <div class="my-session-card__actions">
      <button type="button" class="session-primary" data-my-action="accept-invite" data-session-id="${esc(session.sessionId)}" data-testid="accept-invite-${esc(session.sessionId)}">接受邀請</button>
      <button type="button" class="session-secondary" data-my-action="decline-invite" data-session-id="${esc(session.sessionId)}" data-testid="decline-invite-${esc(session.sessionId)}">婉拒</button>
      <button type="button" class="session-tertiary" data-my-action="report-session" data-session-id="${esc(session.sessionId)}">檢舉此球局</button>
    </div>
  </article>`;
}
```

`renderMySessionsPage` 的 needsAction 渲染依 `entry.kind === "invite"` 走 `inviteCard`；click 分派表加 `accept-invite`/`decline-invite` → `onAcceptInvite`/`onDeclineInvite`（沿用 `runMySessionAction` 的 pending/錯誤/focus 樣板）。

- [ ] **Step 2: controller `respondInvite(sessionId, decision)`**：比照既有 my-session mutation 家族（`beginLifecycleAction` → `api.respondToSessionInvite` → `refreshAuthoritativeState`；`SESSION_EXPIRED`/`reloadRequired` 一律重讀權威資料）。`main.js` 把兩個 handler 注入。

- [ ] **Step 3: 驗證與 Commit**

```bash
npm run test:session-unit && npm run test:mock
git add src/sessionViews.js src/sessionController.js src/main.js
git commit -m "feat: 我的球局回覆球友邀請"
```

---

### Task 10: e2e — local 雙帳號旅程與 mock 回歸

**Files:**
- Modify: `tests/session.spec.js`（旅程進既有檔：supabase-chromium testMatch 只收 `session|performance` 檔名）
- Modify: `tests/session-mobile.spec.js`（390px 邀請卡操作）
- Modify: `tests/fixtures/sessionFactory.js`（`setPlayerVisibilityViaRpc`、`inviteViaRpc` helper）
- Modify: `tests/smoke.spec.js`（mock：圖層 toggle 顯示 MOCK_PLAYERS、zero console error）

- [ ] **Step 1: local 旅程**：帳號 A 完成 profile → My Sessions 開啟球友卡 → 帳號 B（host）地圖開球友圖層 → 看到 A 於其常打球場 → 開球友卡 sheet → 邀入 B 的 open 局 → A 的 My Sessions 需處理區出現邀請卡 → 接受 → 雙方聯絡資訊互看 LINE。反向斷言：A 關閉開關後，B 重載圖層看不到 A。

- [ ] **Step 2: mock 旅程**：開圖層 → MOCK_PLAYERS pin 與清單渲染 → 開球友卡（未登入 → 邀請入口觸發登入 gate）→ `console.error`/`pageerror` 為空。

- [ ] **Step 3: 跑全部、Commit**

```bash
npm run test:local
TENNIS_TEST_HARNESS_MODE=local npx playwright test --project=supabase-mobile-chromium
npm run test:mock
git add tests/session.spec.js tests/session-mobile.spec.js tests/fixtures/sessionFactory.js tests/smoke.spec.js
git commit -m "test: 球友卡與邀請的雙帳號 e2e 旅程"
```

---

### Task 11: 文件同步與收尾 gate

**Files:**
- Modify: `CLAUDE.md`（公開邊界節：補 player_directory 為 authenticated-only 面、invited 值域、邀請 RPC；「公開探索只透過 session_discovery」語句改寫為「匿名公開面只有 session_discovery；登入球友目錄走 player_directory」）
- Modify: `.claude/rules/supabase.md`（browser 邊界清單＋player_directory allowlist＋invited/initiated_by＋新錯誤碼＋24h 邀請上限）

- [ ] **Step 1: 逐字對照 spec「邊界變更」節修訂兩檔**（不寫未實作敘述；`docs/mvp-plan.md` 的 release gate 增補由監督 session 另行決定，不在本 plan）。

- [ ] **Step 2: 完整本機 gate**（與 Plan A Task 7 相同指令序列，全綠才可宣告完成）。

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md .claude/rules/supabase.md
git commit -m "docs: 球友層邊界與規則同步"
```

---

## Self-Review 紀錄（plan 作者已檢）

- Spec 覆蓋：is_public 復用與 save 回歸（T1/T2）、trigger 4 處（T2）、directory view＋gate（T3/T4）、invite/respond＋補滿 decline 擴充（T4）、can_respond_invite（T4/T5）、UI 開關/圖層/邀請/回覆（T7-T9）、測試矩陣（T1/T3/T5/T6/T10）、文件（T11）。
- 型別一致：`profileId/canRespondInvite/isPublic`（camel）↔ `profile_id/can_respond_invite/is_public`（DB）；`kind:'invite'` 貫穿 T6/T9。
- 已知執行時自查點：status check constraint 實際名（T2 Step 1）、INVITE_LIMIT fixture 的塞列策略（T1 Step 3）、MOCK_PLAYERS 座標對齊 mockData 既有球場（T5 Step 3）、`requireSessionAction` intent 種類擴充的實際簽名（T8 Step 3）。

## 執行期裁決紀錄（監督 session 維護）

- **2026-07-22 Task 10-11／全案 checkpoint（Approved with findings）**：最終 review 與完整 gate 期間，執行 session 以 autosquash 重寫 `7303ebb`（重寫前 Task 11 HEAD）至 `28933d4`（核可 HEAD）。實際重寫不是只有最後回報的 Escape 修正，而包含下列三組改動；本節補記不再修改已驗收的 `feat/player-directory` branch。
  1. **Task 7 visibility reconciliation**：`set_player_visibility` RPC 成功代表 consent 已在 DB 提交，因此 UI 必須先發布 RPC-confirmed 的 `isPublic`，再做次要 profile reload；reload 失敗時保留已提交值並回報「設定已更新、同步失敗」，換帳號時則以 auth snapshot 拒絕舊帳號的晚到 reconciliation。同步更新既有 unit，並新增「RPC 成功＋reload 失敗仍保留值」與「account switch 不套用舊結果」兩條，避免 server 已更新而 UI 回退舊值。
  2. **Task 8／9 final-review 修正**：declined 歷史原本一律顯示「主揪婉拒」，會把補滿 cleanup、自動 decline 等情況錯誤歸因給主揪；改為中性 `未加入`／`這次參與未成立`，mock 與既有 local e2e 同時斷言新文案且排除「主揪婉拒」。另在 391–700px 寬度將 `#map-data-status` 的 `top` 由 `155px` 移至 `240px`，並以 550px 真實 geometry 測試證明完整 player-layer control 與狀態訊息不重疊。中性文案與 local e2e autosquash 至 Task 9；medium-width CSS 與 geometry regression autosquash 至 Task 8。
  3. **Task 8 top-surface Escape 防禦**：完整 mock gate 揭露 sheet 的 `requestAnimationFrame` autofocus 前，keydown target 仍可能是底層 drawer card；document capture 關閉 sheet 後，同一 Escape 會繼續 bubble 並再關閉 drawer。top surface 的 Escape 分支新增 `event.stopPropagation()` 與意圖註解；確定性 regression 同步開 sheet 後立即 dispatch Escape，斷言只關 top sheet、drawer 保持展開且焦點回到原 session card。暫時移除防禦時 regression 會紅出 `drawerExpanded: false`／`activeSessionId: null`。

  重寫的 ground-truth 全量 stat 為：

  ```text
   src/session.css                  |  2 +-
   src/sessionController.js         | 19 ++++++--
   src/sessionViews.js              |  4 +-
   src/sheets.js                    |  4 ++
   tests/session-controller.test.js | 45 ++++++++++++++++++-
   tests/session.spec.js            |  4 +-
   tests/smoke.spec.js              | 93 ++++++++++++++++++++++++++++++++++++++++
   7 files changed, 162 insertions(+), 9 deletions(-)
  ```

  最終 fresh-reset gate：pgTAP `303+19+8=330`、unit `100`、mock Playwright `90`（另 2 個既有 skip）、local API＋Playwright `1+16`（另 8 個既有 skip）、mobile `2`、seed check、build、`git diff --check` 全綠；最終獨立 review 為 Critical／Important／Minor `0/0/0`。

- **歷史重寫回報規則**：今後任何 amend、rebase 或 autosquash，checkpoint 回報必須同時列出 old HEAD 與 new HEAD，並附未做 path filter 的 `git diff <oldHEAD>..<newHEAD> --stat` **全量原文**；另逐組說明每個變更檔案的動機與驗證。不得只申報最後一個 fix，或以 commit 數仍相同代替 content delta 稽核。

## 監督協議（執行 session 必讀）

- 與 Plan A 同一 worktree 接續（`feat/instant-join-mode` 完成驗收後，開 `git worktree add -b feat/player-directory ../tennisPartnerFinder-players HEAD`，base 為含 Plan A 的 HEAD）。
- **不可 push**；每 task 一 commit。
- Checkpoint：Task 4 完成（DB 契約全綠）、Task 9 完成（UI 閉環）、Task 11 完成（gate），各停一次回報監督 session 做 read-back 驗收。
- 回報格式同 Plan A：指令＋關鍵輸出原文＋變更檔案清單；隱私相關斷言（directory allowlist、line_id 排除、anon 42501）必須附 pgTAP 輸出行。
