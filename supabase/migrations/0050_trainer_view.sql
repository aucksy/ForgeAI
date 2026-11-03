-- NOT APPLIED. Needs the owner's yes (F109).
--
-- 0050: trainers see their members' progress (F109; owner's plan OWNER-INBOX #46, DECIDED 24 Oct 2026: option A,
-- no tick box: one line on the join screen and an off switch in Settings -> Your gym, on by default; research
-- docs/overhaul/research/R-trainer-view.md).
-- Additive and re-runnable: four new tables, new functions, one trigger on each new table, one new trigger on
-- gym_members (leaving) and one on gym_staff (removed); nothing that exists is changed. Apply after 0049 (needs
-- 0027's _gym_not_suspended, 0018's _owner_only_gym, 0010's _staff / _owner_gym, 0035's _member_roster_link and
-- _roster_member_ok). Test: supabase/tests/0050_trainer_view.sql (CI runs it after every migration; pasted into
-- the SQL Editor it always ends in an error and so changes nothing).
-- Undo: drop the nine public functions below, the triggers gym_members_trainer_left and gym_staff_trainer_gone,
-- and the four tables.
--
-- WHAT LEAVES THE PHONE (member_trainer_share; only a phone that joined this gym, never sample data, and only
-- while the member's "Share my workouts with my trainers" switch is on; off deletes it at once):
--   one small weekly summary, worked out on the phone, REPLACING the last one:
--   {"weeks":  [{"w":"YYYY-MM-DD" (a Monday), "n": workouts that week, "kg": kg lifted that week}]  at most 12
--    "best":   [{"n": exercise name, "w": kg, "r": reps, "t": times done in 12 weeks}]                 at most 5
--    "records":[{"n": exercise name, "w": kg, "r": reps, "d":"YYYY-MM-DD"}]  new heaviest, last 30 days, at most 5
--    "last":   "YYYY-MM-DD" of the last workout, or null}
--   Never body weight, photos, notes, food or a list of sets. Checked and rebuilt here (_trainer_clean), at most
--   6000 characters. Kept in gym_progress_summaries, one row per app member, NEVER in crm_records (which every
--   staff device downloads). Deleted at once on "off" (member_trainer_stop), on leaving the gym (trigger), and
--   on the next read when nothing new came for 90 days.
--
-- THE TRAINER TICK (owner only): gym_trainers holds the people (gym_staff) the owner ticked as "Trainer". Their
-- role stays what it was (a desk person stays 'staff', so a trainer never gets owner powers, R-trainer-view §1).
-- WHICH MEMBERS A TRAINER SEES: the owner picks a member's trainer on the member's page (gym_trainer_members,
-- keyed by the gym's list id). A summary reaches a trainer only when the app member is matched to the gym's list
-- (0035's _member_roster_link: the check-in number the desk confirmed, 0048, plus the first name) and that list
-- member is assigned to the trainer. Untick or remove a trainer: their assignments go at once.
--
-- WHO MAY READ AND WRITE (the tables have RLS on, no policies and no grants):
--   owner_trainer_members(key)               the owner (or an owner key): every sharing member of the gym; a
--                                            ticked trainer: only their assigned members; the front desk without
--                                            the tick: TRAINER_ONLY.
--   owner_trainer_setup(key)                 owner only: the people with their tick, and the assignments.
--   owner_set_trainer(key, staff, on)        owner only. NOT_FOUND for a person not (or no longer) in this gym.
--   owner_assign_trainer(key, member, staff) owner only. staff null = no trainer. NO_MEMBER / NOT_TRAINER.
--   member_trainer_status(key)               {ok, shared, trainer: first name or null}.
--   member_trainer_share(key, summary)       {ok, on: true}; INVALID / SUSPENDED / BAD_KEY.
--   member_trainer_stop(key)                 {ok}; deletes the summary.
--   member_trainer_help(key)                 "Ask my trainer for help": {ok, already}; NOT_SHARED while off.
-- Errors: BAD_KEY, OWNER_ONLY, TRAINER_ONLY, NOT_FOUND, NO_MEMBER, NOT_TRAINER, NOT_SHARED, INVALID, SUSPENDED.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ tables
create table if not exists public.gym_trainers (
  staff_id       uuid primary key references public.gym_staff(staff_id) on delete cascade,
  gym_id         uuid not null references public.gyms(gym_id) on delete cascade,
  ticked_at      timestamptz not null default now(),
  ticked_by_name text
);
create index if not exists gym_trainers_by_gym on public.gym_trainers(gym_id);
alter table public.gym_trainers enable row level security;
revoke all on public.gym_trainers from public, anon, authenticated;

create table if not exists public.gym_trainer_members (
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  roster_id   text not null check (length(roster_id) between 1 and 64),
  staff_id    uuid not null references public.gym_staff(staff_id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (gym_id, roster_id)
);
create index if not exists gym_trainer_members_by_staff on public.gym_trainer_members(staff_id);
alter table public.gym_trainer_members enable row level security;
revoke all on public.gym_trainer_members from public, anon, authenticated;

create table if not exists public.gym_progress_summaries (
  member_id  uuid primary key references public.gym_members(member_id) on delete cascade,
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  roster_id  text check (roster_id is null or length(roster_id) between 1 and 64),
  summary    jsonb not null,
  updated_at timestamptz not null default now(),
  help_at    timestamptz
);
create index if not exists gym_progress_summaries_by_gym on public.gym_progress_summaries(gym_id, roster_id);
alter table public.gym_progress_summaries enable row level security;
revoke all on public.gym_progress_summaries from public, anon, authenticated;

-- Suspended gym: inserts and updates are refused (0027); deletes pass, so "off", leaving and clean-ups still work.
drop trigger if exists gym_trainers_not_suspended on public.gym_trainers;
create trigger gym_trainers_not_suspended before insert or update on public.gym_trainers
  for each row execute function public._gym_not_suspended();
drop trigger if exists gym_trainer_members_not_suspended on public.gym_trainer_members;
create trigger gym_trainer_members_not_suspended before insert or update on public.gym_trainer_members
  for each row execute function public._gym_not_suspended();
drop trigger if exists gym_progress_summaries_not_suspended on public.gym_progress_summaries;
create trigger gym_progress_summaries_not_suspended before insert or update on public.gym_progress_summaries
  for each row execute function public._gym_not_suspended();

-- ------------------------------------------------------------------ helpers (no grants)
-- A whole number in [lo, hi] or INVALID.
create or replace function public._tv_int(v jsonb, lo numeric, hi numeric) returns int
  language plpgsql immutable set search_path = public as $$
declare n numeric;
begin
  if jsonb_typeof(v) is distinct from 'number' then raise exception 'INVALID'; end if;
  n := (v #>> '{}')::numeric;
  if n <> trunc(n) or n < lo or n > hi then raise exception 'INVALID'; end if;
  return n::int;
end $$;

-- kg in [0, 1000], kept to 0.1, or INVALID.
create or replace function public._tv_kg(v jsonb) returns numeric
  language plpgsql immutable set search_path = public as $$
declare n numeric;
begin
  if jsonb_typeof(v) is distinct from 'number' then raise exception 'INVALID'; end if;
  n := (v #>> '{}')::numeric;
  if n < 0 or n > 1000 then raise exception 'INVALID'; end if;
  return round(n, 1);
end $$;

-- A real day 'YYYY-MM-DD' or INVALID.
create or replace function public._tv_day(v jsonb) returns date
  language plpgsql immutable set search_path = public as $$
declare d date;
begin
  if jsonb_typeof(v) is distinct from 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID'; end if;
  begin
    d := (v #>> '{}')::date;
  exception when others then
    raise exception 'INVALID';
  end;
  if to_char(d, 'YYYY-MM-DD') <> (v #>> '{}') then raise exception 'INVALID'; end if;
  return d;
end $$;

-- An exercise name: 1 to 40 characters once tidied, or INVALID.
create or replace function public._tv_name(v jsonb) returns text
  language plpgsql immutable set search_path = public as $$
declare s text;
begin
  if jsonb_typeof(v) is distinct from 'string' then raise exception 'INVALID'; end if;
  s := regexp_replace(btrim(v #>> '{}'), '\s+', ' ', 'g');
  if length(s) < 1 or length(s) > 40 then raise exception 'INVALID'; end if;
  return s;
end $$;

-- The phone's summary, checked and rebuilt with only the known fields; raises INVALID.
create or replace function public._trainer_clean(p jsonb) returns jsonb
  language plpgsql immutable set search_path = public as $$
declare e jsonb; weeks jsonb := '[]'::jsonb; best jsonb := '[]'::jsonb; recs jsonb := '[]'::jsonb; d date; seen date[] := '{}';
begin
  if p is null or jsonb_typeof(p) is distinct from 'object' or length(p::text) > 6000
     or jsonb_typeof(p->'weeks') is distinct from 'array' or jsonb_array_length(p->'weeks') > 12
     or jsonb_typeof(p->'best') is distinct from 'array' or jsonb_array_length(p->'best') > 5
     or jsonb_typeof(p->'records') is distinct from 'array' or jsonb_array_length(p->'records') > 5
     or (p ? 'last' and jsonb_typeof(p->'last') not in ('string', 'null')) then
    raise exception 'INVALID';
  end if;
  for e in select value from jsonb_array_elements(p->'weeks') loop
    if jsonb_typeof(e) is distinct from 'object' then raise exception 'INVALID'; end if;
    d := public._tv_day(e->'w');
    if extract(isodow from d) <> 1 or d = any(seen) then raise exception 'INVALID'; end if;
    seen := seen || d;
    weeks := weeks || jsonb_build_array(jsonb_build_object('w', e->>'w', 'n', public._tv_int(e->'n', 0, 21),
               'kg', public._tv_int(e->'kg', 0, 2000000)));
  end loop;
  for e in select value from jsonb_array_elements(p->'best') loop
    if jsonb_typeof(e) is distinct from 'object' then raise exception 'INVALID'; end if;
    best := best || jsonb_build_array(jsonb_build_object('n', public._tv_name(e->'n'), 'w', public._tv_kg(e->'w'),
              'r', public._tv_int(e->'r', 0, 1000), 't', public._tv_int(e->'t', 0, 500)));
  end loop;
  for e in select value from jsonb_array_elements(p->'records') loop
    if jsonb_typeof(e) is distinct from 'object' then raise exception 'INVALID'; end if;
    recs := recs || jsonb_build_array(jsonb_build_object('n', public._tv_name(e->'n'), 'w', public._tv_kg(e->'w'),
              'r', public._tv_int(e->'r', 0, 1000), 'd', to_char(public._tv_day(e->'d'), 'YYYY-MM-DD')));
  end loop;
  return jsonb_build_object('weeks', weeks, 'best', best, 'records', recs,
    'last', case when jsonb_typeof(p->'last') = 'string' then to_char(public._tv_day(p->'last'), 'YYYY-MM-DD') else null end);
end $$;

-- Who is asking: {gym, staff (null for an owner key), owner}. A ticked trainer is not the owner; anyone else
-- (the front desk without the tick) is refused TRAINER_ONLY. BAD_KEY for no live key.
create or replace function public._trainer_viewer(p_key text) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key);
begin
  if st.staff_id is null or st.role = 'owner' then
    return jsonb_build_object('gym', g, 'staff', st.staff_id, 'owner', true);
  end if;
  if exists (select 1 from public.gym_trainers t where t.staff_id = st.staff_id and t.gym_id = g) then
    return jsonb_build_object('gym', g, 'staff', st.staff_id, 'owner', false);
  end if;
  raise exception 'TRAINER_ONLY';
end $$;

-- The trainer a list member is assigned to, while that person is still a live, ticked trainer of the gym.
create or replace function public._trainer_of(p_gym uuid, p_roster text) returns public.gym_staff
  language sql stable security definer set search_path = public as $$
  select s.* from public.gym_trainer_members a
    join public.gym_trainers t on t.staff_id = a.staff_id and t.gym_id = a.gym_id
    join public.gym_staff s on s.staff_id = a.staff_id and s.gym_id = a.gym_id and s.removed_at is null
   where a.gym_id = p_gym and a.roster_id = p_roster
$$;

-- The owner's setup view.
create or replace function public._trainer_setup_view(p_gym uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', s.staff_id, 'name', s.name, 'role', s.role,
                  'trainer', exists (select 1 from public.gym_trainers t where t.staff_id = s.staff_id and t.gym_id = p_gym))
                  order by s.created_at, s.staff_id)
                from public.gym_staff s where s.gym_id = p_gym and s.removed_at is null), '[]'::jsonb),
    'assigned', coalesce((select jsonb_agg(jsonb_build_object('memberId', a.roster_id, 'trainerId', a.staff_id) order by a.roster_id)
                from public.gym_trainer_members a
                join public.gym_trainers t on t.staff_id = a.staff_id and t.gym_id = a.gym_id
                join public.gym_staff s on s.staff_id = a.staff_id and s.removed_at is null
               where a.gym_id = p_gym), '[]'::jsonb))
$$;

-- Leaving the gym takes the member's summary with it at once.
create or replace function public._trainer_member_left() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  delete from public.gym_progress_summaries where member_id = new.member_id;
  return new;
end $$;
drop trigger if exists gym_members_trainer_left on public.gym_members;
create trigger gym_members_trainer_left after update of left_at on public.gym_members
  for each row when (old.left_at is null and new.left_at is not null)
  execute function public._trainer_member_left();

-- A person removed from the gym stops being a trainer at once, and their members are unassigned.
create or replace function public._trainer_staff_gone() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  delete from public.gym_trainer_members where staff_id = new.staff_id;
  delete from public.gym_trainers where staff_id = new.staff_id;
  return new;
end $$;
drop trigger if exists gym_staff_trainer_gone on public.gym_staff;
create trigger gym_staff_trainer_gone after update of removed_at on public.gym_staff
  for each row when (old.removed_at is null and new.removed_at is not null)
  execute function public._trainer_staff_gone();

-- ------------------------------------------------------------------ the gym's side
-- The members a viewer may see, each with the one summary their phone sent. Newest first; the admin app sorts.
create or replace function public.owner_trainer_members(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb := public._trainer_viewer(p_key);
  g uuid := (v->>'gym')::uuid;
  me uuid := nullif(v->>'staff', '')::uuid;
  is_owner boolean := (v->>'owner')::boolean;
  list jsonb;
begin
  -- Nothing new for 90 days: the copy goes.
  delete from public.gym_progress_summaries where gym_id = g and updated_at < now() - interval '90 days';
  select coalesce(jsonb_agg(x.row order by x.updated_at desc), '[]'::jsonb) into list from (
    select p.updated_at, jsonb_build_object(
        'appId', p.member_id,
        'memberId', case when r.id is not null then p.roster_id end,
        'name', coalesce(nullif(btrim(r.data->>'fullName'), ''), m.name),
        'phone', case when r.id is not null then r.data->>'phone' end,
        'trainerId', tr.staff_id,
        'trainerName', tr.name,
        'summary', p.summary,
        'updatedAt', floor(extract(epoch from p.updated_at) * 1000)::bigint,
        'helpAt', case when p.help_at is null then null else floor(extract(epoch from p.help_at) * 1000)::bigint end) as row
      from public.gym_progress_summaries p
      join public.gym_members m on m.member_id = p.member_id and m.left_at is null
      left join public.crm_records r on r.gym_id = p.gym_id and r.kind = 'member' and r.id = p.roster_id and not r.deleted
      left join lateral (select (public._trainer_of(g, p.roster_id)).*) tr on r.id is not null
     where p.gym_id = g
       and (is_owner or (r.id is not null and tr.staff_id = me))
  ) x;
  return jsonb_build_object('ok', true, 'role', case when is_owner then 'owner' else 'trainer' end, 'members', list);
end $$;

create or replace function public.owner_trainer_setup(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return public._trainer_setup_view(public._owner_only_gym(p_key));
end $$;

create or replace function public.owner_set_trainer(p_key text, p_staff uuid, p_on boolean)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key); me public.gym_staff := public._staff(p_key);
begin
  if p_on is null then raise exception 'INVALID'; end if;
  if p_staff is null or not exists (select 1 from public.gym_staff s where s.staff_id = p_staff and s.gym_id = g and s.removed_at is null) then
    raise exception 'NOT_FOUND';
  end if;
  if exists (select 1 from public.gyms where gym_id = g and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  if p_on then
    insert into public.gym_trainers(staff_id, gym_id, ticked_by_name)
      values (p_staff, g, case when me.staff_id is null then null else me.name end)
    on conflict (staff_id) do nothing;
  else
    delete from public.gym_trainer_members where gym_id = g and staff_id = p_staff;
    delete from public.gym_trainers where staff_id = p_staff and gym_id = g;
  end if;
  return public._trainer_setup_view(g);
end $$;

create or replace function public.owner_assign_trainer(p_key text, p_member text, p_staff uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key);
begin
  perform public._roster_member_ok(g, p_member);
  if p_staff is null then
    delete from public.gym_trainer_members where gym_id = g and roster_id = p_member;
    return public._trainer_setup_view(g);
  end if;
  if not exists (select 1 from public.gym_trainers t join public.gym_staff s on s.staff_id = t.staff_id
                  where t.staff_id = p_staff and t.gym_id = g and s.gym_id = g and s.removed_at is null) then
    raise exception 'NOT_TRAINER';
  end if;
  if exists (select 1 from public.gyms where gym_id = g and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  insert into public.gym_trainer_members(gym_id, roster_id, staff_id) values (g, p_member, p_staff)
  on conflict (gym_id, roster_id) do update set staff_id = excluded.staff_id, assigned_at = now();
  return public._trainer_setup_view(g);
end $$;

-- ------------------------------------------------------------------ the member's side
create or replace function public.member_trainer_status(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); link jsonb; tr public.gym_staff;
begin
  link := public._member_roster_link(p_key);
  if link ? 'rosterId' then tr := public._trainer_of(m.gym_id, link->>'rosterId'); end if;
  return jsonb_build_object('ok', true,
    'shared', exists (select 1 from public.gym_progress_summaries where member_id = m.member_id),
    -- First name only: the member knows who it is.
    'trainer', case when tr.staff_id is null then null else split_part(btrim(tr.name), ' ', 1) end);
end $$;

create or replace function public.member_trainer_share(p_key text, p_summary jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); c jsonb; link jsonb;
begin
  c := public._trainer_clean(p_summary);
  if exists (select 1 from public.gyms where gym_id = m.gym_id and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  link := public._member_roster_link(p_key);
  insert into public.gym_progress_summaries(member_id, gym_id, roster_id, summary, updated_at)
    values (m.member_id, m.gym_id, link->>'rosterId', c, now())
  on conflict (member_id) do update
    set gym_id = excluded.gym_id, roster_id = excluded.roster_id, summary = excluded.summary, updated_at = now();
  return jsonb_build_object('ok', true, 'on', true);
end $$;

create or replace function public.member_trainer_stop(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key);
begin
  delete from public.gym_progress_summaries where member_id = m.member_id;
  return jsonb_build_object('ok', true);
end $$;

-- "Ask my trainer for help": once a day at most (a second tap the same day is {already: true}).
create or replace function public.member_trainer_help(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); p public.gym_progress_summaries;
begin
  select * into p from public.gym_progress_summaries where member_id = m.member_id for update;
  if p.member_id is null then raise exception 'NOT_SHARED'; end if;
  if p.help_at is not null and p.help_at > now() - interval '20 hours' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if exists (select 1 from public.gyms where gym_id = m.gym_id and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  update public.gym_progress_summaries set help_at = now() where member_id = m.member_id;
  return jsonb_build_object('ok', true, 'already', false);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._tv_int(jsonb, numeric, numeric) from public, anon, authenticated;
revoke all on function public._tv_kg(jsonb) from public, anon, authenticated;
revoke all on function public._tv_day(jsonb) from public, anon, authenticated;
revoke all on function public._tv_name(jsonb) from public, anon, authenticated;
revoke all on function public._trainer_clean(jsonb) from public, anon, authenticated;
revoke all on function public._trainer_viewer(text) from public, anon, authenticated;
revoke all on function public._trainer_of(uuid, text) from public, anon, authenticated;
revoke all on function public._trainer_setup_view(uuid) from public, anon, authenticated;
revoke all on function public._trainer_member_left() from public, anon, authenticated;
revoke all on function public._trainer_staff_gone() from public, anon, authenticated;

revoke all on function public.owner_trainer_members(text) from public;
revoke all on function public.owner_trainer_setup(text) from public;
revoke all on function public.owner_set_trainer(text, uuid, boolean) from public;
revoke all on function public.owner_assign_trainer(text, text, uuid) from public;
revoke all on function public.member_trainer_status(text) from public;
revoke all on function public.member_trainer_share(text, jsonb) from public;
revoke all on function public.member_trainer_stop(text) from public;
revoke all on function public.member_trainer_help(text) from public;
grant execute on function public.owner_trainer_members(text) to anon, authenticated;
grant execute on function public.owner_trainer_setup(text) to anon, authenticated;
grant execute on function public.owner_set_trainer(text, uuid, boolean) to anon, authenticated;
grant execute on function public.owner_assign_trainer(text, text, uuid) to anon, authenticated;
grant execute on function public.member_trainer_status(text) to anon, authenticated;
grant execute on function public.member_trainer_share(text, jsonb) to anon, authenticated;
grant execute on function public.member_trainer_stop(text) to anon, authenticated;
grant execute on function public.member_trainer_help(text) to anon, authenticated;

-- PostgREST learns the new functions at once (instead of on its next schema reload).
notify pgrst, 'reload schema';
