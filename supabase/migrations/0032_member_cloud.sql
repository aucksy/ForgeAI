-- NOT APPLIED. Needs the owner's yes (#50).
--
-- 0032: members' workouts kept on ForgeAI's own server (tracker #50 and #27, owner 24 Oct 2026: "For
-- Hevy and other apps, they store the data in their own database ... We shouldn't depend on Google ...
-- use the free Supabase we have ... We'll try it with 10-20 members"), and the one switch for the free
-- plan's limits (tracker #43). Re-runnable (if not exists / create or replace / on conflict do nothing).
-- Apply after 0030. Test: supabase/tests/0032_member_cloud.sql (pasted into the SQL Editor it always
-- ends in an error and so changes nothing).
--
-- WHO. A member who taps "Continue with Google" in the app has a Supabase Auth account (auth.users,
-- Google provider). Everything below is keyed by that account (auth.uid()). It has NOTHING to do with
-- a gym: the gym member key (0002) and the gym's records stay exactly as they are, and no gym, owner,
-- trainer or front desk can read a member's copy (the trainer view is a separate later decision, #46).
-- A member who never signs in sends nothing here.
--
-- WHAT. One row per thing the member keeps (public.member_items), packed small by the phone
-- (apps/mobile/src/cloud/pack.ts, format v = 1):
--   kind 'w' a workout with all its sets       kind 'r' a routine folder with its routines
--   kind 'x' an exercise the member made       kind 'p' rest lengths and record starts (one row)
--   kind 'b' a body weight (id = the day)      kind 'm' a body measurement (id = day|kind)
--   kind 'f' a progress photo's day (the photo itself stays on the phone)
--   kind 'u' the member's profile (name, goal, height, targets; never the phone number)
-- data = the packed record as compact JSON text (no key names, trailing empties dropped); data NULL =
-- deleted on the phone (a "tombstone", kept so a slower phone cannot bring it back by accident).
-- edited_at = when the phone saw this version (ms). The NEWEST EDIT WINS: a write with an older
-- edited_at than the row already has changes nothing.
--
-- SIZE (the free plan: 500 MB database; 100 MB kept for the gym side, so 400 MB for this, #50).
-- Measured by apps/mobile/test/cloud/pack.test.ts on a typical workout (4.4 exercises, 18 sets,
-- the averages of the owner's real 487-workout history): 549 bytes of data. A Postgres row adds
-- about 24 B header + 16 B member + 2 B kind + 37 B id + 2 B v + 8 B edited_at + 8 B saved_at, and the
-- primary-key index about 70 B, so a workout costs about 0.7 KB on disk. Counted at 1 KB to be safe
-- (page fill, TOAST, dead rows before autovacuum):
--   a member training 3 times a week = 13 workouts a month = about 13 KB a month, 0.16 MB a year;
--   routines, body weight, measurements and the profile add about 20 KB a year;
--   400 MB / 0.18 MB a year = about 2,200 member-years: 1,500 members for about 1.5 years, 100
--   members for about 20 years. The test pilot (10-20 members) uses well under 1% of the plan.
-- Downloads (5 GB a month on the free plan): a new phone reads a year of history in about 0.2 MB.
-- Limits per member: 30,000 rows (about 40 years of workouts) and 32 KB per row (a workout of about
-- 500 sets); a write over them is refused with COPY_FULL / TOO_BIG, and nothing else changes.
--
-- THE FREE PLAN'S LIMITS (#43). public.app_config row 'free_limits': {"on": false, "routines": 4,
-- "customExercises": 7, "chartMonths": 3}. OFF at launch. When "on" is true, a member who is NOT in a
-- gym on ForgeAI gets at most 4 routines, 7 exercises of their own and 3 months of charts; gym
-- members always get everything. The app reads it with app_limits() (anyone may call it; it only
-- answers this row) and keeps the answer for 12 hours. Only the server's secret key (HQ) changes it:
--   update public.app_config set value = jsonb_set(value, '{on}', 'true'), updated_at = now()
--    where key = 'free_limits';
-- Re-running this file never switches it back (the row is only added when missing).
--
-- NEW FUNCTIONS (signed-in members only; each acts on the caller's own rows, auth.uid()):
--   member_copy_put(items jsonb)      up to 200 items [{k, i, v, d, e}]; returns {saved, older,
--                                     olderIds: [{k, i}]} (olderIds: the server holds a newer edit).
--                                     Errors: SIGN_IN, INVALID, TOO_MANY, TOO_BIG, COPY_FULL.
--   member_copy_get(after_kind, after_id, limit)   the member's rows in (kind, id) order, a page at a
--                                     time (at most 1,000), as [{k, i, v, d, e}].
--   member_copy_count()               {items, workouts, lastSavedAt} for Settings.
--   member_account_delete()           deletes the member's copy and, when the account is ONLY a member
--                                     account, the account itself: {account: 'deleted'}. Supabase links a
--                                     Google sign-in to an existing account with the same email, so an
--                                     owner's or trainer's sign-in, or an older (0001) gym-sync member
--                                     with a gym, keeps the account: {account: 'kept'}, copy deleted.
--                                     (Google Play asks for "Delete my account" in the app.)
--   app_limits()                      the free plan's switch (anon too).
-- No existing table or function is changed.

-- A lock wait gives up after 3 seconds rather than stalling the live apps behind it.
set lock_timeout = '3s';

-- ------------------------------------------------------------------ the copy
create table if not exists public.member_items (
  member_id uuid not null references auth.users(id) on delete cascade,
  kind      text not null,
  item_id   text not null,
  v         smallint not null default 1,
  data      text,
  edited_at bigint not null,
  saved_at  timestamptz not null default now(),
  primary key (member_id, kind, item_id)
);
alter table public.member_items drop constraint if exists member_items_kind_check;
alter table public.member_items add constraint member_items_kind_check
  check (kind in ('w', 'r', 'x', 'p', 'b', 'm', 'f', 'u'));
alter table public.member_items drop constraint if exists member_items_id_check;
alter table public.member_items add constraint member_items_id_check check (length(item_id) between 1 and 64);
alter table public.member_items drop constraint if exists member_items_data_check;
alter table public.member_items add constraint member_items_data_check check (data is null or length(data) <= 32768);

-- Row level security: a member reads only their own rows. Writes go only through member_copy_put
-- (SECURITY DEFINER, newest edit wins, size and count limits), never straight into the table.
-- There is NO policy for gym staff: a gym sees nothing here.
alter table public.member_items enable row level security;
revoke all on public.member_items from anon, authenticated;
grant select on public.member_items to authenticated;
drop policy if exists member_items_own on public.member_items;
create policy member_items_own on public.member_items for select to authenticated
  using (member_id = (select auth.uid()));

-- ------------------------------------------------------------------ the free plan's switch
create table if not exists public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
insert into public.app_config(key, value)
  values ('free_limits', '{"on": false, "routines": 4, "customExercises": 7, "chartMonths": 3}'::jsonb)
  on conflict (key) do nothing;

create or replace function public.app_limits() returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.app_config where key = 'free_limits'), '{"on": false}'::jsonb)
$$;

-- ------------------------------------------------------------------ limits (one place)
create or replace function public._copy_max_rows() returns int
  language sql immutable set search_path = public as $$ select 30000 $$;

-- ------------------------------------------------------------------ write
create or replace function public.member_copy_put(p_items jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  it jsonb;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  have int;
  fresh int;
  saved int := 0;
  older_ids jsonb;
begin
  if uid is null then raise exception 'SIGN_IN'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'INVALID'; end if;
  if jsonb_array_length(p_items) > 200 then raise exception 'TOO_MANY'; end if;
  if jsonb_array_length(p_items) = 0 then return jsonb_build_object('saved', 0, 'older', 0, 'olderIds', '[]'::jsonb); end if;

  -- Every item is checked before anything is written: one bad item refuses the whole call.
  for it in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it) <> 'object'
       or jsonb_typeof(it->'k') is distinct from 'string' or (it->>'k') not in ('w', 'r', 'x', 'p', 'b', 'm', 'f', 'u')
       or jsonb_typeof(it->'i') is distinct from 'string' or length(it->>'i') not between 1 and 64
       or jsonb_typeof(it->'e') is distinct from 'number' or (it->>'e')::numeric <= 0
       or not (it ? 'd') or jsonb_typeof(it->'d') not in ('string', 'null')
       or (it ? 'v' and (jsonb_typeof(it->'v') <> 'number' or (it->>'v')::numeric not between 1 and 100)) then
      raise exception 'INVALID';
    end if;
    if length(it->>'d') > 32768 then raise exception 'TOO_BIG'; end if;
  end loop;

  -- Room for the new rows (updates of rows already there always fit).
  select count(*) into have from public.member_items where member_id = uid;
  select count(distinct (x->>'k', x->>'i')) into fresh from jsonb_array_elements(p_items) x
   where not exists (select 1 from public.member_items m
                      where m.member_id = uid and m.kind = x->>'k' and m.item_id = x->>'i');
  if have + fresh > public._copy_max_rows() then raise exception 'COPY_FULL'; end if;

  -- The same id twice in one call: the newest edit of it is the one kept. Items the server already
  -- holds a newer edit of are not written and come back in olderIds (the phone brings them in).
  with c as (
    select distinct on (x->>'k', x->>'i') x->>'k' as kind, x->>'i' as item_id,
           coalesce((x->>'v')::smallint, 1::smallint) as v, x->>'d' as data,
           -- A phone whose clock runs far ahead cannot lock a row for ever: at most a day ahead
           -- (capped BEFORE the cast, so a huge number is refused by nothing and stored as the cap).
           least(floor((x->>'e')::numeric), (now_ms + 86400000)::numeric)::bigint as edited_at
      from jsonb_array_elements(p_items) x
     order by x->>'k', x->>'i', (x->>'e')::numeric desc),
  w as (
    insert into public.member_items as m (member_id, kind, item_id, v, data, edited_at, saved_at)
    select uid, c.kind, c.item_id, c.v, c.data, c.edited_at, now() from c
    on conflict (member_id, kind, item_id) do update
       set v = excluded.v, data = excluded.data, edited_at = excluded.edited_at, saved_at = now()
     where m.edited_at <= excluded.edited_at
    returning m.kind, m.item_id)
  select (select count(*) from w),
         coalesce((select jsonb_agg(jsonb_build_object('k', c.kind, 'i', c.item_id) order by c.kind, c.item_id) from c
                    where not exists (select 1 from w where w.kind = c.kind and w.item_id = c.item_id)), '[]'::jsonb)
    into saved, older_ids;
  return jsonb_build_object('saved', saved, 'older', jsonb_array_length(older_ids), 'olderIds', older_ids);
end $$;

-- ------------------------------------------------------------------ read
create or replace function public.member_copy_get(p_after_kind text default '', p_after_id text default '', p_limit int default 500)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SIGN_IN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('k', kind, 'i', item_id, 'v', v, 'd', data, 'e', edited_at) order by kind, item_id)
      from (select kind, item_id, v, data, edited_at from public.member_items
             where member_id = uid and (kind, item_id) > (coalesce(p_after_kind, ''), coalesce(p_after_id, ''))
             order by kind, item_id
             limit greatest(1, least(coalesce(p_limit, 500), 1000))) page), '[]'::jsonb);
end $$;

create or replace function public.member_copy_count() returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); r jsonb;
begin
  if uid is null then raise exception 'SIGN_IN'; end if;
  select jsonb_build_object(
           'items', count(*) filter (where data is not null),
           'workouts', count(*) filter (where kind = 'w' and data is not null),
           'lastSavedAt', max(saved_at))
    into r from public.member_items where member_id = uid;
  return r;
end $$;

-- ------------------------------------------------------------------ delete the account
-- The copy always. The account itself only when it is nothing but a member account: Supabase links a
-- Google sign-in to an existing account with the same email, so an owner's or trainer's sign-in, or an
-- older 0001 gym-sync member (a profile with a gym), keeps its account and its profile; only the copy
-- goes. The gym's own records (its register, payments, check-ins) are the gym's and are never touched
-- here: a member asks the gym, or leaves it in the app, as today.
-- (An earlier draft of this file returned boolean; the drop lets a re-run change the answer's type.)
drop function if exists public.member_account_delete();
create function public.member_account_delete() returns jsonb
  language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SIGN_IN'; end if;
  delete from public.member_items where member_id = uid;
  if exists (select 1 from public.profiles p where p.id = uid and (p.role in ('owner', 'trainer') or p.gym_id is not null)) then
    return jsonb_build_object('account', 'kept');
  end if;
  delete from public.member_summary where member_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
  return jsonb_build_object('account', 'deleted');
end $$;

-- ------------------------------------------------------------------ who may call what
revoke all on function public.app_limits() from public;
grant execute on function public.app_limits() to anon, authenticated;
revoke all on function public._copy_max_rows() from public, anon, authenticated;
revoke all on function public.member_copy_put(jsonb) from public, anon;
revoke all on function public.member_copy_get(text, text, int) from public, anon;
revoke all on function public.member_copy_count() from public, anon;
revoke all on function public.member_account_delete() from public, anon;
grant execute on function public.member_copy_put(jsonb) to authenticated;
grant execute on function public.member_copy_get(text, text, int) to authenticated;
grant execute on function public.member_copy_count() to authenticated;
grant execute on function public.member_account_delete() to authenticated;
