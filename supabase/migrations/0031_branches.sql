-- NOT APPLIED. Needs the owner's yes (#41).
--
-- 0031: gyms with several BRANCHES under one business (tracker #41, owner R-99, 24 Oct 2026: "build
-- the multi-branch feature ... available from the beginning ... all functionalities"). Additive and
-- re-runnable (if not exists / create or replace / drop ... if exists). Apply after 0030.
-- Test: supabase/tests/0031_branches.sql (CI runs it after every migration; pasted into the SQL Editor
-- it always ends in an error and so changes nothing).
--
-- THE MODEL (how Wellyx, GymMaster and FitnessForce do it, made simple for chains of 2-5 branches):
--   A BRANCH is a gym row, exactly as today: its own records (crm_records), its own record version,
--   receipt numbers, join code, QR poster, shop, messages and front-desk staff. Nothing about a gym
--   changes when it is a branch, so every owner_* function, crm_pull and crm_push work unchanged.
--   A GROUP (gym_groups) is the business that owns the branches. gyms.group_id is null for a gym
--   that never added a branch: a group of one, exactly as before this file.
--   OWNERS are owners of the whole business: an owner of one branch is an owner (gym_staff row, role
--   owner, same mobile) of every branch. Adding a branch copies the owners in; adding an owner to one
--   branch adds them to all; removing an owner removes them from all; "sign out everywhere" for an
--   owner signs them out of every branch. DESK STAFF are per branch (role staff), as today.
--   SIGN-IN reaches every branch: an owner signs in to any one branch (the code is per branch, as
--   today), then owner_open_branch hands that device a session for any other branch of the group.
--   The admin app keeps one key per branch and shows one branch at a time (a switch at the top),
--   plus an "All branches" page built from every branch's own records.
--   MEMBERS belong to one branch (their records live in it). A member's record may say
--   "allBranches": true: then the desk of any other branch may check them in, and so may the
--   member app's QR at another branch. Such a visit is written in the member's HOME branch (so their
--   attendance and the at-risk list stay true), with atGymId / atGymName saying where they trained.
--   RECEIPTS: two branches under one GST number must never print the same number (GST Rule 46: one
--   series per GSTIN per year, at most 16 characters). The first branch keeps its numbers
--   (2026-27/0001); every added branch gets a prefix (gyms.receipt_prefix 'B2', 'B3' ...: B2/2026-27/
--   0001, imports B2I/26-27/0001). The server refuses a new receipt in a prefixed branch whose
--   number does not start with its prefix, and keeps the prefix in the branch's 'gym' record.
--
-- NEW (each checks the key itself, granted to anon like every owner_* function):
--   owner_branches(key)                     the group and its branches (names, codes, prefixes).
--   owner_add_branch(key, name, copy_plans, device)  a new branch, its owners, optionally the plans
--                                           of this branch; returns a session for it. Owner only.
--                                           The new branch takes the first branch's HQ status, plan
--                                           and free-trial dates (one business, one trial; ForgeAI's
--                                           price per branch stays information in HQ), its branding,
--                                           and its GST number as a starting value (changeable).
--                                           Errors: OWNER_ONLY, EMPTY, NAME_TAKEN, TOO_MANY (10),
--                                           SUSPENDED.
--   owner_open_branch(key, gym, device)     a session in another branch of the group. Owner only.
--                                           Errors: OWNER_ONLY, GONE, STAFF_ELSEWHERE.
--   owner_rename_group(key, name)           the business's name. Owner only. Errors: EMPTY.
--   branch_find_visitor(key, phone)         a member of ANOTHER branch with this mobile (first name,
--                                           branch, allowed, plan ok, already in). Desk or owner.
--                                           At most 30 look-ups an hour per branch (TOO_MANY_LOOKUPS).
--   branch_check_in_visitor(key, gym, member)  check that member in here; written in their branch.
--                                           Errors: GONE, NOT_ALLOWED.
--   branch_visitors(key, day)               members of other branches checked in HERE that day.
--   branch_undo_visitor(key, gym, member, day)  take back such a check-in (a mis-tap).
--   hq_groups(actor)                        HQ: every group with its branches and member counts
--                                           (service_role only, audited like every hq_* read).
-- CHANGES FIVE EXISTING FUNCTIONS (every answer they gave before is unchanged for a gym that is not
-- in a group; the only new behaviour is for grouped gyms):
--   owner_add_person (0010)        an owner added to a grouped branch is added to every branch.
--   owner_remove_person (0010)     an owner removed from a grouped branch leaves every branch; the
--                                  last owner check counts the whole group.
--   owner_sign_out_person (0010)   an owner is signed out of every branch.
--   member_check_in (0020)         the QR of ANOTHER branch of the member's group checks them in when
--                                  their record says allBranches (else OTHER_GYM, as before).
--   support_make_signin_code (0010)  a mobile that owns several branches of ONE group no longer
--                                  needs p_gym: the first branch is used.
-- AND ONE TRIGGER: gym_staff_not_suspended (0027) is pointed at _gym_staff_not_suspended, which is
--   0027's rule (a paused gym's staff list is read-only) except inside the five people functions
--   above, which may take an owner OFF a paused branch (removed_at only) and put a business owner ON
--   it (an owner row). So removing an owner never fails because one branch is paused.
-- RACES: every change to the people of a business (add, remove, sign out, open, add a branch) takes
--   one lock per business (_branch_lock), so a removal can never be undone by an open or a copy
--   running at the same moment.
-- RE-RUNNING 0010, 0020 or 0027 puts back their own versions of these: always re-run 0031 after them.
-- Nothing here reads or changes any member data except the visits the new check-in functions write.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ tables and columns
create table if not exists public.gym_groups (
  group_id   uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
alter table public.gym_groups enable row level security;
revoke all on public.gym_groups from public, anon, authenticated;

alter table public.gyms add column if not exists group_id uuid references public.gym_groups(group_id) on delete set null;
alter table public.gyms add column if not exists receipt_prefix text;
-- The branch's number in its group (1 = the first gym, 2 = B2 ...): the order every list shows.
alter table public.gyms add column if not exists branch_no int;
alter table public.gyms drop constraint if exists gyms_receipt_prefix_check;
alter table public.gyms add constraint gyms_receipt_prefix_check
  check (receipt_prefix is null or receipt_prefix ~ '^[A-Z][A-Z0-9]{0,3}$');
create index if not exists gyms_group on public.gyms(group_id, created_at) where group_id is not null;
create unique index if not exists gyms_group_prefix on public.gyms(group_id, receipt_prefix)
  where group_id is not null and receipt_prefix is not null;

-- Look-ups of other branches' members by mobile, per branch (the rate limit of branch_find_visitor).
create table if not exists public.branch_lookups (
  gym_id uuid not null references public.gyms(gym_id) on delete cascade,
  at     timestamptz not null default now()
);
create index if not exists branch_lookups_gym on public.branch_lookups(gym_id, at);
alter table public.branch_lookups enable row level security;
revoke all on public.branch_lookups from public, anon, authenticated;

-- ------------------------------------------------------------------ helpers (no grants)
-- Every branch of p_gym's group, first made first; just p_gym when it is in no group.
create or replace function public._branch_ids(p_gym uuid) returns uuid[]
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select array_agg(x.gym_id order by coalesce(x.branch_no, 1), x.created_at, x.gym_id)
       from public.gyms me join public.gyms x on x.group_id = me.group_id
      where me.gym_id = p_gym and me.group_id is not null),
    array[p_gym])
$$;

-- The signed-in OWNER behind a session key. An old owner key (no person) or a desk session:
-- OWNER_ONLY. A dead key: BAD_KEY.
create or replace function public._branch_owner(p_key text) returns public.gym_staff
  language plpgsql stable security definer set search_path = public as $$
declare st public.gym_staff := public._staff(p_key);
begin
  if st.staff_id is null then
    perform public._owner_gym(p_key);  -- BAD_KEY for a dead key
    raise exception 'OWNER_ONLY';
  end if;
  if st.role <> 'owner' then raise exception 'OWNER_ONLY'; end if;
  return st;
end $$;

create or replace function public._branch_json(g public.gyms, p_this uuid) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object('gymId', g.gym_id, 'name', g.name, 'joinCode', g.join_code,
                            'receiptPrefix', g.receipt_prefix, 'branchNo', coalesce(g.branch_no, 1), 'isThis', g.gym_id = p_this,
                            'createdAt', g.created_at)
$$;

-- One business's people change one at a time (the group's, or the gym's own when it has no group).
create or replace function public._branch_lock(p_gym uuid) returns void
  language plpgsql volatile security definer set search_path = public as $$
declare grp uuid;
begin
  select group_id into grp from public.gyms where gym_id = p_gym;
  perform pg_advisory_xact_lock(hashtextextended('branches:' || coalesce(grp, p_gym)::text, 0));
end $$;

-- 0027's "a paused gym's staff list is read-only", with the two changes the people functions make
-- across a business (forgeai.branch_people = on, this transaction only): taking an owner off
-- (removed_at set, nothing else) and putting a business owner on (an owner row).
create or replace function public._gym_staff_not_suspended() returns trigger
  language plpgsql security definer set search_path = public as $$
declare st text;
begin
  if current_setting('forgeai.hq', true) = 'on' then return coalesce(new, old); end if;
  select status into st from public.gyms where gym_id = case when tg_op = 'DELETE' then old.gym_id else new.gym_id end;
  if st is distinct from 'suspended' then return coalesce(new, old); end if;
  if current_setting('forgeai.branch_people', true) = 'on' then
    if tg_op = 'UPDATE' and old.removed_at is null and new.removed_at is not null
       and (to_jsonb(new) - 'removed_at') = (to_jsonb(old) - 'removed_at') then
      return new;
    end if;
    if tg_op = 'INSERT' and new.role = 'owner' then return new; end if;
  end if;
  raise exception 'SUSPENDED';
end $$;

drop trigger if exists gym_staff_not_suspended on public.gym_staff;
create trigger gym_staff_not_suspended before insert or update or delete on public.gym_staff
  for each row execute function public._gym_staff_not_suspended();

-- Epoch milliseconds now (the panel's createdAt / updatedAt).
create or replace function public._now_ms() returns bigint
  language sql stable set search_path = public as $$
  select floor(extract(epoch from now()) * 1000)::bigint
$$;

-- ------------------------------------------------------------------ the branch rules on records
-- 1. A prefixed branch's 'gym' record always says its prefix (the panel reads it from there), and a
--    branch without one never claims one.
-- 2. A receipt saved in a prefixed branch must carry the branch's prefix (B2/... or B2I/...).
create or replace function public._crm_branch_rules() returns trigger
  language plpgsql security definer set search_path = public as $$
declare px text; no text;
begin
  if new.kind not in ('gym', 'payment') or new.deleted then return new; end if;
  select receipt_prefix into px from public.gyms where gym_id = new.gym_id;
  if new.kind = 'gym' then
    if px is null then new.data := new.data - 'receiptPrefix';
    else new.data := new.data || jsonb_build_object('receiptPrefix', px);
    end if;
    return new;
  end if;
  if px is null then return new; end if;
  no := btrim(coalesce(new.data->>'receiptNo', ''));
  if left(no, length(px) + 1) <> px || '/' and left(no, length(px) + 2) <> px || 'I/' then
    raise exception 'BAD_RECEIPT_NO';
  end if;
  return new;
end $$;

drop trigger if exists crm_records_branch_rules on public.crm_records;
create trigger crm_records_branch_rules before insert or update on public.crm_records
  for each row execute function public._crm_branch_rules();

-- ------------------------------------------------------------------ the group and its branches
create or replace function public.owner_branches(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key); gr public.gyms; grp public.gym_groups;
begin
  select * into gr from public.gyms where gym_id = g;
  select * into grp from public.gym_groups where group_id = gr.group_id;
  return jsonb_build_object(
    'groupId', grp.group_id,
    'groupName', coalesce(grp.name, gr.name),
    'canOpen', st.staff_id is not null and st.role = 'owner',
    'branches', (select jsonb_agg(public._branch_json(x, g) order by coalesce(x.branch_no, 1), x.created_at, x.gym_id)
                   from public.gyms x where x.gym_id = any(public._branch_ids(g))));
end $$;

create or replace function public.owner_add_branch(p_key text, p_name text, p_copy_plans boolean default true, p_device text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  st public.gym_staff := public._branch_owner(p_key);
  me public.gyms; first public.gyms; ng public.gyms; mine public.gym_staff; grp uuid;
  nm text := left(btrim(coalesce(p_name, '')), 60);
  ids uuid[]; px text; i int; tries int := 0; ms bigint := public._now_ms(); copied int := 0; gst text;
begin
  if nm = '' then raise exception 'EMPTY'; end if;
  perform public._branch_lock(st.gym_id);
  -- After the lock: the caller may have been removed meanwhile.
  st := public._branch_owner(p_key);
  select * into me from public.gyms where gym_id = st.gym_id for update;
  if me.status = 'suspended' then raise exception 'SUSPENDED'; end if;
  grp := me.group_id;
  if grp is null then
    insert into public.gym_groups(name) values (left(btrim(me.name), 60)) returning group_id into grp;
    update public.gyms set group_id = grp, branch_no = 1 where gym_id = me.gym_id;
  end if;
  -- The business's own lock too (the first one may have been the gym's, before it had a group).
  perform pg_advisory_xact_lock(hashtextextended('branches:' || grp::text, 0));
  ids := public._branch_ids(me.gym_id);
  if array_length(ids, 1) >= 10 then raise exception 'TOO_MANY'; end if;
  if exists (select 1 from public.gyms where gym_id = any(ids) and lower(btrim(name)) = lower(nm)) then
    raise exception 'NAME_TAKEN';
  end if;
  -- One business, one trial: the first branch's HQ status, plan and trial dates.
  select * into first from public.gyms where gym_id = ids[1];
  i := 2;
  loop
    px := 'B' || i;
    exit when not exists (select 1 from public.gyms where group_id = grp and receipt_prefix = px);
    i := i + 1;
  end loop;
  loop
    begin
      insert into public.gyms(name, join_code, group_id, receipt_prefix, branch_no,
                              brand_accent, brand_bg, brand_logo_url, brand_heading,
                              status, trial_starts_at, trial_ends_at, plan, billing, paid_until)
        values (nm, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), grp, px, i,
                me.brand_accent, me.brand_bg, me.brand_logo_url, coalesce(me.brand_heading, 'normal'),
                coalesce(first.status, 'trial'), coalesce(first.trial_starts_at, now()),
                coalesce(first.trial_ends_at, now() + interval '3 months'), first.plan, first.billing, first.paid_until)
        returning * into ng;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries >= 5 then raise; end if;
    end;
  end loop;
  -- Every owner of the business is an owner here too (one row per mobile).
  insert into public.gym_staff(gym_id, name, phone, role)
    select distinct on (s.phone) ng.gym_id, s.name, s.phone, 'owner'
      from public.gym_staff s
     where s.gym_id = any(ids) and s.role = 'owner' and s.removed_at is null
     order by s.phone, s.created_at;
  -- The branch's own details: its receipt prefix (the trigger adds it) and, as a starting value the
  -- owner can change in Settings, the first branch's GST number.
  select nullif(btrim(data->>'gstin'), '') into gst from public.crm_records
   where gym_id = ids[1] and kind = 'gym' and id = 'gym' and not deleted;
  insert into public.crm_records(gym_id, kind, id, data, version)
    values (ng.gym_id, 'gym', 'gym', jsonb_build_object('name', nm, 'phone', null, 'address', null, 'gstin', gst), 1);
  -- The plans of the branch this was pressed in (live ones; never an import mark).
  if coalesce(p_copy_plans, true) then
    insert into public.crm_records(gym_id, kind, id, data, version)
      select ng.gym_id, 'plan', n.nid,
             (r.data - 'importId') || jsonb_build_object('id', n.nid, 'gymId', ng.gym_id::text, 'createdAt', ms, 'updatedAt', ms),
             1
        from public.crm_records r
        cross join lateral (select gen_random_uuid()::text as nid) n
       where r.gym_id = me.gym_id and r.kind = 'plan' and not r.deleted
         and coalesce(r.data->>'active', 'true') <> 'false';
    get diagnostics copied = row_count;
  end if;
  update public.gyms set crm_version = 1 where gym_id = ng.gym_id;
  select * into mine from public.gym_staff where gym_id = ng.gym_id and phone = st.phone and removed_at is null;
  return public._signed_in_json(mine, public._new_session(mine.staff_id, p_device))
         || jsonb_build_object('receiptPrefix', px, 'plansCopied', copied, 'groupId', grp);
end $$;

create or replace function public.owner_open_branch(p_key text, p_gym uuid, p_device text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare st public.gym_staff := public._branch_owner(p_key); there public.gym_staff;
begin
  if p_gym is null or not (p_gym = any(public._branch_ids(st.gym_id))) then raise exception 'GONE'; end if;
  perform public._branch_lock(st.gym_id);
  -- After the lock: an owner removed at this very moment gets no new row (BAD_KEY / OWNER_ONLY).
  st := public._branch_owner(p_key);
  perform 1 from public.gyms where gym_id = p_gym for update;
  select * into there from public.gym_staff where gym_id = p_gym and phone = st.phone and removed_at is null;
  if there.staff_id is null then
    -- A business owner missing from this branch's list (even a paused branch) is put on it.
    perform set_config('forgeai.branch_people', 'on', true);
    insert into public.gym_staff(gym_id, name, phone, role) values (p_gym, st.name, st.phone, 'owner') returning * into there;
    perform set_config('forgeai.branch_people', 'off', true);
  elsif there.role <> 'owner' then
    raise exception 'STAFF_ELSEWHERE';
  end if;
  return public._signed_in_json(there, public._new_session(there.staff_id, p_device));
end $$;

create or replace function public.owner_rename_group(p_key text, p_name text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare st public.gym_staff := public._branch_owner(p_key); grp uuid; nm text := left(btrim(coalesce(p_name, '')), 60);
begin
  if nm = '' then raise exception 'EMPTY'; end if;
  select group_id into grp from public.gyms where gym_id = st.gym_id;
  if grp is null then
    -- A gym with one branch: the business's name is the gym's name.
    perform public.owner_rename_gym(p_key, nm);
  else
    update public.gym_groups set name = nm where group_id = grp;
  end if;
  return public.owner_branches(p_key);
end $$;

-- ------------------------------------------------------------------ owners are owners of every branch
-- 0010's owner_add_person; an OWNER added to a grouped branch is added to every branch of the group.
create or replace function public.owner_add_person(p_key text, p_name text, p_phone text, p_role text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._people_admin(p_key); ph text := public._norm_phone(p_phone); st public.gym_staff; n int; b uuid;
begin
  if ph is null then raise exception 'BAD_PHONE'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'EMPTY'; end if;
  if p_role not in ('owner', 'staff') then raise exception 'BAD_ROLE'; end if;
  perform public._branch_lock(g);
  perform 1 from public.gyms where gym_id = g for update;
  if exists (select 1 from public.gym_staff where gym_id = g and phone = ph and removed_at is null) then
    raise exception 'PHONE_TAKEN';
  end if;
  select count(*) into n from public.gym_staff where gym_id = g and removed_at is null;
  if n >= 30 then raise exception 'TOO_MANY'; end if;
  insert into public.gym_staff(gym_id, name, phone, role)
    values (g, left(btrim(p_name), 60), ph, p_role) returning * into st;
  if p_role = 'owner' then
    -- The other branches, paused ones too (an owner of the business is an owner of all of it).
    perform set_config('forgeai.branch_people', 'on', true);
    foreach b in array public._branch_ids(g) loop
      continue when b = g;
      if exists (select 1 from public.gym_staff where gym_id = b and phone = ph and removed_at is null and role = 'staff') then
        raise exception 'STAFF_ELSEWHERE';
      end if;
      insert into public.gym_staff(gym_id, name, phone, role)
        select b, st.name, ph, 'owner'
         where not exists (select 1 from public.gym_staff where gym_id = b and phone = ph and removed_at is null);
    end loop;
    perform set_config('forgeai.branch_people', 'off', true);
  end if;
  return public._person_json(st);
end $$;

-- 0010's owner_remove_person; an OWNER leaves every branch of the group (paused ones too), and a
-- group keeps at least one owner. For a gym in no group this is exactly 0010's rule.
create or replace function public.owner_remove_person(p_key text, p_staff uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare g uuid := public._people_admin(p_key); me public.gym_staff; st public.gym_staff;
  others int; ids uuid[];
begin
  perform public._branch_lock(g);
  me := public._staff(p_key);
  perform 1 from public.gyms where gym_id = g for update;
  select * into st from public.gym_staff where staff_id = p_staff and gym_id = g and removed_at is null;
  if st.staff_id is null then raise exception 'GONE'; end if;
  if st.staff_id = me.staff_id or (st.role = 'owner' and st.phone = me.phone) then raise exception 'SELF'; end if;
  if st.role = 'owner' then
    ids := public._branch_ids(g);
    select count(distinct s.phone) into others from public.gym_staff s
     where s.gym_id = any(ids) and s.role = 'owner' and s.removed_at is null and s.phone <> st.phone;
    if others = 0 then raise exception 'LAST_OWNER'; end if;
    update public.gym_sessions x set ended_at = now()
      from public.gym_staff s
     where x.staff_id = s.staff_id and x.ended_at is null
       and s.gym_id = any(ids) and s.role = 'owner' and s.phone = st.phone and s.removed_at is null;
    delete from public.gym_signin_codes c using public.gym_staff s
     where c.staff_id = s.staff_id and c.used_at is null
       and s.gym_id = any(ids) and s.role = 'owner' and s.phone = st.phone and s.removed_at is null;
    perform set_config('forgeai.branch_people', 'on', true);
    update public.gym_staff set removed_at = now()
     where gym_id = any(ids) and role = 'owner' and phone = st.phone and removed_at is null;
    perform set_config('forgeai.branch_people', 'off', true);
    return;
  end if;
  update public.gym_staff set removed_at = now() where staff_id = st.staff_id;
  update public.gym_sessions set ended_at = now() where staff_id = st.staff_id and ended_at is null;
  delete from public.gym_signin_codes where staff_id = st.staff_id and used_at is null;
end $$;

-- 0010's owner_sign_out_person; an OWNER is signed out of every branch. This device keeps the key
-- it called with; its keys for the OTHER branches are signed out too (the server cannot tell which
-- sessions are this device's), and the admin app opens those branches again with a new key the next
-- time (branches/BranchProvider.tsx keyFor).
create or replace function public.owner_sign_out_person(p_key text, p_staff uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare g uuid := public._people_admin(p_key); st public.gym_staff;
begin
  perform public._branch_lock(g);
  select * into st from public.gym_staff where staff_id = p_staff and gym_id = g and removed_at is null;
  if st.staff_id is null then raise exception 'GONE'; end if;
  update public.gym_sessions x set ended_at = now()
    from public.gym_staff s
   where x.staff_id = s.staff_id and x.ended_at is null and x.key_hash <> public._hash_key(p_key)
     and (s.staff_id = st.staff_id
          or (st.role = 'owner' and s.role = 'owner' and s.phone = st.phone and s.removed_at is null
              and s.gym_id = any(public._branch_ids(g))));
end $$;

-- 0010's support_make_signin_code: a mobile that owns several branches of ONE group gets its code in
-- the first branch (it opens the others from there); owners of unrelated gyms still need p_gym.
create or replace function public.support_make_signin_code(p_phone text, p_gym uuid default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare st public.gym_staff; n int; groups int;
begin
  select count(*), count(distinct coalesce(g.group_id, g.gym_id)) into n, groups
    from public.gym_staff s join public.gyms g on g.gym_id = s.gym_id
   where s.phone = public._norm_phone(p_phone) and s.role = 'owner' and s.removed_at is null
     and (p_gym is null or s.gym_id = p_gym);
  if n = 0 then raise exception 'GONE'; end if;
  if groups > 1 then raise exception 'PICK_GYM'; end if;
  select s.* into st from public.gym_staff s join public.gyms g on g.gym_id = s.gym_id
   where s.phone = public._norm_phone(p_phone) and s.role = 'owner' and s.removed_at is null
     and (p_gym is null or s.gym_id = p_gym)
   order by coalesce(g.branch_no, 1), g.created_at, g.gym_id limit 1;
  return public._make_code(st.staff_id);
end $$;

-- ------------------------------------------------------------------ members of other branches
-- A member of ANOTHER branch of this gym's group, by full mobile number (no browsing by name).
-- Desk or owner. Answers [] for a gym in no group. Only the first name, the branch, whether their
-- plan lets them train at every branch, whether a plan covers today and whether they are in already.
create or replace function public.branch_find_visitor(p_key text, p_phone text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); ph text := public._norm_phone(p_phone); b uuid; m public.crm_records; out jsonb := '[]'::jsonb;
  day text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD'); n int;
begin
  if ph is null then raise exception 'BAD_PHONE'; end if;
  -- 30 look-ups an hour per branch: a desk checks a few visitors a day; a script trying numbers stops.
  perform pg_advisory_xact_lock(hashtextextended('branch-lookups:' || g::text, 0));
  select count(*) into n from public.branch_lookups where gym_id = g and at > now() - interval '1 hour';
  if n >= 30 then raise exception 'TOO_MANY_LOOKUPS'; end if;
  insert into public.branch_lookups(gym_id) values (g);
  delete from public.branch_lookups where gym_id = g and at < now() - interval '1 day';
  foreach b in array public._branch_ids(g) loop
    continue when b = g;
    m := public._checkin_roster_member(b, ph);
    continue when m.id is null;
    out := out || jsonb_build_array(jsonb_build_object(
      'gymId', b, 'branchName', (select name from public.gyms where gym_id = b), 'memberId', m.id,
      'firstName', split_part(btrim(coalesce(m.data->>'fullName', '')), ' ', 1),
      'allowed', coalesce(m.data->>'allBranches', 'false') = 'true',
      'planOk', public._checkin_plan_ok(b, m.id, day),
      'alreadyIn', exists (select 1 from public.crm_records v where v.gym_id = b and v.kind = 'visit' and not v.deleted
                            and v.data->>'memberId' = m.id and v.data->>'visitedOn' = day)));
  end loop;
  return out;
end $$;

-- Check in, HERE, a member of another branch whose record says allBranches. The visit is written in
-- the member's own branch (id '<member>:<day>', like a QR check-in) with atGymId / atGymName.
create or replace function public.branch_check_in_visitor(p_key text, p_gym uuid, p_member text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); here public.gyms; home public.gyms; m public.crm_records; prev jsonb;
  day text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD'); vid text; v bigint;
  at_ms bigint := public._now_ms(); first_name text;
begin
  if p_gym is null or p_gym = g or not (p_gym = any(public._branch_ids(g))) then raise exception 'GONE'; end if;
  select * into here from public.gyms where gym_id = g;
  select * into m from public.crm_records
   where gym_id = p_gym and kind = 'member' and id = p_member and not deleted
     and coalesce(data->>'archived', 'false') <> 'true';
  if m.id is null then raise exception 'GONE'; end if;
  if coalesce(m.data->>'allBranches', 'false') <> 'true' then raise exception 'NOT_ALLOWED'; end if;
  first_name := split_part(btrim(coalesce(m.data->>'fullName', '')), ' ', 1);
  select * into home from public.gyms where gym_id = p_gym for update;
  select r.data into prev from public.crm_records r
   where r.gym_id = p_gym and r.kind = 'visit' and not r.deleted
     and r.data->>'memberId' = m.id and r.data->>'visitedOn' = day
   order by r.version limit 1;
  if prev is not null then
    return jsonb_build_object('ok', true, 'alreadyIn', true, 'firstName', first_name, 'branchName', home.name,
                              'planOk', public._checkin_plan_ok(p_gym, m.id, day), 'day', day);
  end if;
  vid := m.id || ':' || day;
  v := coalesce(home.crm_version, 0) + 1;
  insert into public.crm_records(gym_id, kind, id, data, version)
    values (p_gym, 'visit', vid,
            jsonb_build_object('id', vid, 'gymId', p_gym::text, 'memberId', m.id, 'visitedOn', day,
                               'checkedInAt', at_ms, 'source', 'desk', 'atGymId', g::text, 'atGymName', here.name),
            v)
    on conflict (gym_id, kind, id) do update
      set data = excluded.data, version = v, deleted = false, updated_at = now();
  update public.gyms set crm_version = v where gym_id = p_gym;
  return jsonb_build_object('ok', true, 'alreadyIn', false, 'firstName', first_name, 'branchName', home.name,
                            'planOk', public._checkin_plan_ok(p_gym, m.id, day), 'day', day, 'checkedInAt', at_ms);
end $$;

-- Members of other branches who trained HERE on p_day (desk or owner).
create or replace function public.branch_visitors(p_key text, p_day text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); day text := coalesce(public._iso_day(p_day)::text, '');
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'gymId', v.gym_id, 'branchName', b.name, 'memberId', v.data->>'memberId',
             'firstName', split_part(btrim(coalesce(m.data->>'fullName', '')), ' ', 1),
             'checkedInAt', case when v.data->>'checkedInAt' ~ '^[0-9]{1,15}$' then (v.data->>'checkedInAt')::bigint end,
             'source', v.data->>'source')
           order by v.data->>'checkedInAt')
      from public.crm_records v
      join public.gyms b on b.gym_id = v.gym_id
      join public.crm_records m on m.gym_id = v.gym_id and m.kind = 'member' and m.id = v.data->>'memberId' and not m.deleted
     where v.gym_id = any(public._branch_ids(g)) and v.gym_id <> g
       and v.kind = 'visit' and not v.deleted and v.data->>'atGymId' = g::text and v.data->>'visitedOn' = day), '[]'::jsonb);
end $$;

-- Take back a check-in this branch made for a member of another branch (quiet when there is none).
create or replace function public.branch_undo_visitor(p_key text, p_gym uuid, p_member text, p_day text)
  returns void language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); home public.gyms; v bigint;
begin
  if p_gym is null or p_gym = g or not (p_gym = any(public._branch_ids(g))) then raise exception 'GONE'; end if;
  select * into home from public.gyms where gym_id = p_gym for update;
  if not exists (select 1 from public.crm_records where gym_id = p_gym and kind = 'visit' and not deleted
                   and data->>'memberId' = p_member and data->>'visitedOn' = p_day and data->>'atGymId' = g::text) then
    return;
  end if;
  v := coalesce(home.crm_version, 0) + 1;
  update public.crm_records set deleted = true, version = v, updated_at = now()
   where gym_id = p_gym and kind = 'visit' and not deleted
     and data->>'memberId' = p_member and data->>'visitedOn' = p_day and data->>'atGymId' = g::text;
  update public.gyms set crm_version = v where gym_id = p_gym;
end $$;

-- ------------------------------------------------------------------ the member app's QR at another branch
-- 0020's member_check_in. Changed: a scanned code of ANOTHER branch of the member's group is accepted
-- when the member's record says allBranches; the visit is written in the member's own branch with
-- atGymId / atGymName, and gymName in the answer is the branch they are at. Anything else is exactly
-- as 0020 left it (a code of another branch for a member without allBranches: OTHER_GYM, as before,
-- now also naming that branch in 'branch').
create or replace function public.member_check_in(p_key text, p_code text default null, p_phone text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  g public.gyms;
  at_g public.gyms;
  visiting boolean := false;
  tries int;
  ph text;
  tag text;
  typed boolean := false;
  new_miss boolean := false;
  roster public.crm_records;
  day text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  vid text;
  prev jsonb;
  v bigint;
  plan_ok boolean;
  first_name text;
  at_ms bigint := floor(extract(epoch from now()) * 1000)::bigint;
  shown text;
begin
  -- 10 a minute per member key. Queued per member, so a burst cannot slip past the count.
  perform pg_advisory_xact_lock(hashtextextended('checkin:' || m.member_id::text, 0));
  select count(*) into tries from public.member_checkin_tries
   where member_id = m.member_id and at > now() - interval '1 minute';
  if tries >= 10 then return jsonb_build_object('error', 'TOO_MANY'); end if;
  insert into public.member_checkin_tries(member_id) values (m.member_id);
  delete from public.member_checkin_tries where member_id = m.member_id and what = 'try' and at < now() - interval '10 minutes';
  delete from public.member_checkin_tries where member_id = m.member_id and at < now() - interval '2 days';

  select * into g from public.gyms where gym_id = m.gym_id;

  if nullif(btrim(coalesce(p_code, '')), '') is null then
    return jsonb_build_object('error', 'OTHER_GYM', 'gymName', g.name);
  end if;
  if upper(btrim(p_code)) <> g.join_code then
    -- 0031: another branch of the member's own business?
    if g.group_id is not null then
      select * into at_g from public.gyms where join_code = upper(btrim(p_code)) and group_id = g.group_id;
    end if;
    if at_g.gym_id is null then return jsonb_build_object('error', 'OTHER_GYM', 'gymName', g.name); end if;
    visiting := true;
  end if;

  if nullif(btrim(coalesce(p_phone, '')), '') is not null then
    ph := public._norm_phone(p_phone);
    if ph is null then return jsonb_build_object('error', 'BAD_PHONE'); end if;
  else
    ph := public._norm_phone(m.checkin_phone);
    if ph is null then return jsonb_build_object('error', 'NO_PHONE', 'gymName', g.name); end if;
  end if;

  if coalesce(g.crm_version, 0) = 0
     and not exists (select 1 from public.crm_records where gym_id = g.gym_id and kind = 'member') then
    return jsonb_build_object('error', 'GYM_NOT_ONLINE', 'gymName', g.name);
  end if;

  -- A number that has not matched for this member before is a TYPED try, limited per key (3
  -- numbers a day) and, for numbers that match nobody, per gym (20 an hour). C6-8: the same number
  -- typed again is not a new number — it counts once a day for the member, once an hour for the gym.
  if public._norm_phone(m.checkin_phone) is distinct from ph then
    typed := true;
    tag := 'phone:' || md5(g.gym_id::text || ':' || ph);
    if not exists (select 1 from public.member_checkin_tries
                    where member_id = m.member_id and what = tag and at > now() - interval '1 day') then
      select count(distinct what) into tries from public.member_checkin_tries
       where member_id = m.member_id and what like 'phone%' and at > now() - interval '1 day';
      if tries >= 3 then return jsonb_build_object('error', 'TOO_MANY_NUMBERS'); end if;
      insert into public.member_checkin_tries(member_id, what) values (m.member_id, tag);
    end if;
    perform pg_advisory_xact_lock(hashtextextended('checkin-misses:' || g.gym_id::text, 0));
    if not exists (select 1 from public.gym_checkin_misses
                    where gym_id = g.gym_id and phone_tag = tag and at > now() - interval '1 hour') then
      select count(*) into tries from public.gym_checkin_misses
       where gym_id = g.gym_id and at > now() - interval '1 hour';
      if tries >= 20 then return jsonb_build_object('error', 'TOO_MANY_NUMBERS'); end if;
      new_miss := true;
    end if;
  end if;

  roster := public._checkin_roster_member(g.gym_id, ph);
  if roster.id is null then
    if new_miss then
      insert into public.gym_checkin_misses(gym_id, phone_tag) values (g.gym_id, tag);
      delete from public.gym_checkin_misses where gym_id = g.gym_id and at < now() - interval '1 day';
    end if;
    return jsonb_build_object('error', 'NOT_ON_ROSTER', 'gymName', g.name, 'phone', '+91' || ph);
  end if;

  -- 0031: at another branch only when the member's plan says every branch.
  if visiting and coalesce(roster.data->>'allBranches', 'false') <> 'true' then
    return jsonb_build_object('error', 'OTHER_GYM', 'gymName', g.name, 'branch', at_g.name);
  end if;

  if typed then
    update public.gym_members set checkin_phone = '+91' || ph, phone = '+91' || ph where member_id = m.member_id;
  end if;

  first_name := split_part(btrim(coalesce(roster.data->>'fullName', m.name)), ' ', 1);
  plan_ok := public._checkin_plan_ok(g.gym_id, roster.id, day);
  shown := case when visiting then at_g.name else g.name end;

  -- The gym's row lock (the one crm_push takes) only now, just before the "already in" look and
  -- the write, so versions never collide and a desk check-in cannot slip in between.
  select * into g from public.gyms where gym_id = g.gym_id for update;

  -- Already in today, however it was recorded (desk rows have random ids).
  select r.data into prev from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'visit' and not r.deleted
     and r.data->>'memberId' = roster.id and r.data->>'visitedOn' = day
   order by r.version limit 1;
  if prev is not null then
    -- C6-12: a visit with no real time (an imported paper register says 0) has no time, never 1970.
    return jsonb_build_object('ok', true, 'alreadyIn', true, 'gymName', shown, 'memberName', first_name,
      'day', day, 'planOk', plan_ok,
      'checkedInAt', case when prev->>'checkedInAt' ~ '^[0-9]{1,15}$' and (prev->>'checkedInAt')::bigint > 0
                          then (prev->>'checkedInAt')::bigint else null end);
  end if;

  vid := roster.id || ':' || day;
  v := coalesce(g.crm_version, 0) + 1;
  insert into public.crm_records(gym_id, kind, id, data, version)
    values (g.gym_id, 'visit', vid,
            jsonb_build_object('id', vid, 'gymId', g.gym_id::text, 'memberId', roster.id,
                               'visitedOn', day, 'checkedInAt', at_ms, 'source', 'app')
            || case when visiting then jsonb_build_object('atGymId', at_g.gym_id::text, 'atGymName', at_g.name)
                    else '{}'::jsonb end,
            v)
    on conflict (gym_id, kind, id) do update
      set data = excluded.data, version = v, deleted = false, updated_at = now();
  update public.gyms set crm_version = v where gym_id = g.gym_id;
  update public.gym_members set last_seen = now() where member_id = m.member_id;

  return jsonb_build_object('ok', true, 'alreadyIn', false, 'gymName', shown, 'memberName', first_name,
    'day', day, 'planOk', plan_ok, 'checkedInAt', at_ms);
end $$;

-- ------------------------------------------------------------------ HQ: groups and their branches
create or replace function public.hq_groups(p_actor text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare out jsonb;
begin
  perform public._hq_guard();
  select coalesce(jsonb_agg(jsonb_build_object(
           'groupId', grp.group_id, 'name', grp.name, 'createdAt', grp.created_at,
           'branches', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'gymId', g.gym_id, 'name', g.name, 'joinCode', g.join_code,
                                  'receiptPrefix', g.receipt_prefix, 'createdAt', g.created_at, 'status', g.status,
                                  'membersRegister', (select count(*) from public.crm_records r
                                                       where r.gym_id = g.gym_id and r.kind = 'member' and not r.deleted),
                                  'membersApp', (select count(*) from public.gym_members x
                                                  where x.gym_id = g.gym_id and x.left_at is null))
                                order by coalesce(g.branch_no, 1), g.created_at, g.gym_id), '[]'::jsonb)
                          from public.gyms g where g.group_id = grp.group_id))
         order by grp.created_at desc), '[]'::jsonb)
    into out from public.gym_groups grp;
  perform public._hq_log(p_actor, 'view_groups', null, null, jsonb_build_object('groups', jsonb_array_length(out)));
  return out;
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._branch_ids(uuid)                          from public, anon, authenticated;
revoke all on function public._branch_owner(text)                        from public, anon, authenticated;
revoke all on function public._branch_json(public.gyms, uuid)            from public, anon, authenticated;
revoke all on function public._now_ms()                                  from public, anon, authenticated;
revoke all on function public._branch_lock(uuid)                         from public, anon, authenticated;
revoke all on function public._gym_staff_not_suspended()                 from public, anon, authenticated;
revoke all on function public._crm_branch_rules()                        from public, anon, authenticated;
revoke all on function public.support_make_signin_code(text, uuid)       from public, anon, authenticated;

revoke all on function public.owner_branches(text)                       from public;
revoke all on function public.owner_add_branch(text, text, boolean, text) from public;
revoke all on function public.owner_open_branch(text, uuid, text)        from public;
revoke all on function public.owner_rename_group(text, text)             from public;
revoke all on function public.owner_add_person(text, text, text, text)   from public;
revoke all on function public.owner_remove_person(text, uuid)            from public;
revoke all on function public.owner_sign_out_person(text, uuid)          from public;
revoke all on function public.branch_find_visitor(text, text)            from public;
revoke all on function public.branch_check_in_visitor(text, uuid, text)  from public;
revoke all on function public.branch_visitors(text, text)                from public;
revoke all on function public.branch_undo_visitor(text, uuid, text, text) from public;
revoke all on function public.member_check_in(text, text, text)          from public;
grant execute on function public.owner_branches(text)                       to anon, authenticated;
grant execute on function public.owner_add_branch(text, text, boolean, text) to anon, authenticated;
grant execute on function public.owner_open_branch(text, uuid, text)        to anon, authenticated;
grant execute on function public.owner_rename_group(text, text)             to anon, authenticated;
grant execute on function public.owner_add_person(text, text, text, text)   to anon, authenticated;
grant execute on function public.owner_remove_person(text, uuid)            to anon, authenticated;
grant execute on function public.owner_sign_out_person(text, uuid)          to anon, authenticated;
grant execute on function public.branch_find_visitor(text, text)            to anon, authenticated;
grant execute on function public.branch_check_in_visitor(text, uuid, text)  to anon, authenticated;
grant execute on function public.branch_visitors(text, text)                to anon, authenticated;
grant execute on function public.branch_undo_visitor(text, uuid, text, text) to anon, authenticated;
grant execute on function public.member_check_in(text, text, text)          to anon, authenticated;

revoke all on function public.hq_groups(text) from public, anon, authenticated;
grant execute on function public.hq_groups(text) to service_role;

notify pgrst, 'reload schema';
