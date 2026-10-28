-- APPLIED LIVE 29 Oct 2026 (owner: "yes, apply 0039 and 0040 live in Supabase and add their privacy lines"; live test 0040 PASS 46).
--
-- 0040: a gym mate's profile, opened from the gym leaderboard (R-164, 28 Oct 2026: "if a member chose to
-- show their name, others can tap it and see their profile like their own ... just within the gym").
-- Owner's picks: a SEPARATE switch on the member's phone, "Let my gym mates see my workouts", OFF by
-- default; showing the name alone shares nothing more. Space kept tiny (owner, 28 Oct): no workout or
-- progress photos ever; summaries only; 30 workouts / 60 days per member.
-- Numbered 0040, not 0039: another change ("how busy the gym is now") may take 0039 at the same time.
-- Additive and re-runnable: two new tables, new functions, one trigger on each new table and one new
-- trigger on gym_members (leaving); nothing that exists is changed. Apply after 0037 (uses its
-- _board_name, _board_rows and gym_member_board). Test: supabase/tests/0040_gym_mate_profiles.sql (CI
-- runs it after every migration; pasted into the SQL Editor it always ends in an error and so changes
-- nothing).
--
-- WHAT LEAVES THE PHONE (only while the member's switch is on, with the member key from the app's Join):
--   {"bio": text <= 160 or null,
--    "workouts": up to 30 of {"id": the phone's workout id, "d": "YYYY-MM-DD", "name": the workout's
--      name <= 60, "min": minutes 0..1440, "kg": kg lifted 0..60000,
--      "ex": up to 8 of {"n": exercise name <= 40, "k": the app's picture key <= 40 or null,
--                        "w": the best set's kg 0..1000, "r": its reps 0..1000}]}
--   No phone number, body weight, photo of any kind, note, or list of sets. The name others see is
--   the leaderboard's ("Rahul S.", 0037 _board_name) from the gym's own record, never from the phone.
--   No picture: there is no member-photo storage on the server, so a mate's profile shows initials.
--
-- WHAT IS KEPT: gym_mate_profiles (one row per sharing member: bio and an opaque share id that other
--   members use to open it; never the member id) and gym_mate_workouts (one compact row per workout,
--   under 2 KB, see the test). A push REPLACES the member's workouts. Days outside [today - 59,
--   today + 1] are left out; more than 30 workouts is INVALID.
-- WHEN IT GOES (there is no nightly job):
--   * the switch goes off: the phone calls member_mate_stop: everything of that member, at once;
--   * the member leaves the gym (left_at set, by any path): at once, by a trigger on gym_members;
--     a member deleted for good: by the foreign keys;
--   * a workout older than 60 days: at the member's next push, and at every read of that gym
--     (member_mate_board / member_mate_profile); a profile not refreshed for 60 days goes whole at
--     the same reads.
--   Deleting is allowed in a suspended gym (0027's rule), so the switch and leaving always work.
--
-- WHO MAY READ WHAT:
--   member_mate_share(key, profile)  {ok:true, workouts:n}; BAD_KEY (also after leaving), INVALID,
--                                    SUSPENDED.
--   member_mate_stop(key)            {ok:true, removed:bool}.
--   member_mate_board(key)           {ok:true, workouts:[{rank,name,profile}], kg:[...]}: the same top
--                                    10 rows as member_board, with `profile` = the share id ONLY when
--                                    that member shows their name AND shares, has not left and the gym
--                                    has not hidden them; else null (and always null on your own row).
--   member_mate_profile(key, id)     {ok:true, name, bio, workouts:[...newest first]} for a member of
--                                    YOUR gym who passes the same four checks; else NOT_SHARED.
--   The tables have RLS on, no policies and no grants; every read and write goes through these.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ tables
create table if not exists public.gym_mate_profiles (
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  member_id  uuid primary key references public.gym_members(member_id) on delete cascade,
  share_id   uuid not null unique default gen_random_uuid(),
  bio        text check (bio is null or length(bio) <= 160),
  updated_at timestamptz not null default now()
);
create index if not exists gym_mate_profiles_by_gym on public.gym_mate_profiles(gym_id);
alter table public.gym_mate_profiles enable row level security;
revoke all on public.gym_mate_profiles from public, anon, authenticated;

create table if not exists public.gym_mate_workouts (
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  member_id  uuid not null references public.gym_mate_profiles(member_id) on delete cascade,
  workout_id text not null check (workout_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  day        date not null,
  name       text not null check (length(name) between 1 and 60),
  minutes    int not null check (minutes between 0 and 1440),
  kg         numeric not null check (kg >= 0 and kg <= 60000),
  exercises  jsonb not null check (jsonb_typeof(exercises) = 'array' and jsonb_array_length(exercises) <= 8),
  primary key (member_id, workout_id)
);
create index if not exists gym_mate_workouts_by_day on public.gym_mate_workouts(gym_id, day);
alter table public.gym_mate_workouts enable row level security;
revoke all on public.gym_mate_workouts from public, anon, authenticated;

-- Suspended gym: inserts and updates are refused, deletes are not (0027).
drop trigger if exists gym_mate_profiles_not_suspended on public.gym_mate_profiles;
create trigger gym_mate_profiles_not_suspended before insert or update on public.gym_mate_profiles
  for each row execute function public._gym_not_suspended();
drop trigger if exists gym_mate_workouts_not_suspended on public.gym_mate_workouts;
create trigger gym_mate_workouts_not_suspended before insert or update on public.gym_mate_workouts
  for each row execute function public._gym_not_suspended();

-- ------------------------------------------------------------------ helpers (no grants)
-- The 60-day rule for one gym: old workouts and profiles not refreshed for 60 days go.
create or replace function public._mate_cleanup(p_gym uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  delete from public.gym_mate_workouts where gym_id = p_gym and day < today - 59;
  delete from public.gym_mate_profiles where gym_id = p_gym and updated_at < now() - interval '60 days';
  delete from public.gym_mate_profiles p using public.gym_members x
   where p.gym_id = p_gym and x.member_id = p.member_id and x.left_at is not null;
end $$;

-- Leaving the gym takes the shared profile with it at once (every way left_at gets set).
create or replace function public._mate_member_left() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  delete from public.gym_mate_profiles where member_id = new.member_id;
  return new;
end $$;
drop trigger if exists gym_members_mate_left on public.gym_members;
create trigger gym_members_mate_left after update of left_at on public.gym_members
  for each row when (old.left_at is null and new.left_at is not null)
  execute function public._mate_member_left();

-- The share id of a member others may open, or null: shows the name, shares, not left, not hidden.
create or replace function public._mate_open_id(p_member uuid) returns uuid
  language sql stable set search_path = public as $$
  select p.share_id
    from public.gym_mate_profiles p
    join public.gym_members x on x.member_id = p.member_id and x.gym_id = p.gym_id
    join public.gym_member_board b on b.gym_id = p.gym_id and b.member_id = p.member_id
   where p.member_id = p_member and x.left_at is null and b.show_name and not b.hidden
$$;

-- One list of member_board's top 10 (same order: 0037 _board_top), with the share id where it may open.
create or replace function public._mate_top(p_gym uuid, p_measure text, p_me uuid) returns jsonb
  language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'rank', q.rk,
           'name', public._board_name(q.m_name, q.show_name),
           'profile', case when q.m_id = p_me then null else public._mate_open_id(q.m_id)::text end)
         order by q.rk, q.joined_at, q.m_id), '[]'::jsonb)
    from (select * from (select x.*, rank() over (order by x.total desc) as rk
                           from public._board_rows(p_gym, p_measure) x
                          where not x.hidden) w
           order by w.rk, w.joined_at, w.m_id limit 10) q
$$;

-- ------------------------------------------------------------------ the member's side
create or replace function public.member_mate_share(p_key text, p_profile jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  p jsonb := p_profile; w jsonb; e jsonb; dt date; nm text; bio text;
  exs jsonb; n int := 0; seen text[] := '{}';
begin
  if m.left_at is not null then raise exception 'BAD_KEY'; end if;
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 40000 then raise exception 'INVALID'; end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in ('bio', 'workouts')) then raise exception 'INVALID'; end if;
  if jsonb_typeof(p->'workouts') is distinct from 'array' or jsonb_array_length(p->'workouts') > 30 then raise exception 'INVALID'; end if;
  if p ? 'bio' and jsonb_typeof(p->'bio') not in ('string', 'null') then raise exception 'INVALID'; end if;
  bio := nullif(btrim(regexp_replace(coalesce(p->>'bio', ''), '\s+', ' ', 'g')), '');
  if length(bio) > 160 then raise exception 'INVALID'; end if;
  if exists (select 1 from public.gyms where gym_id = m.gym_id and status = 'suspended') then raise exception 'SUSPENDED'; end if;

  -- Check every workout before anything is written. Any slip inside (a cast that fails included) is INVALID.
  begin
  for w in select value from jsonb_array_elements(p->'workouts') loop
    if jsonb_typeof(w) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(w) k where k not in ('id', 'd', 'name', 'min', 'kg', 'ex'))
       or jsonb_typeof(w->'id') is distinct from 'string' or (w->>'id') !~ '^[A-Za-z0-9_-]{1,64}$'
       or jsonb_typeof(w->'d') is distinct from 'string' or (w->>'d') !~ '^\d{4}-\d{2}-\d{2}$'
       or jsonb_typeof(w->'name') is distinct from 'string' or length(btrim(w->>'name')) > 60
       or jsonb_typeof(w->'min') is distinct from 'number' or (w->>'min')::numeric not between 0 and 1440
       or jsonb_typeof(w->'kg') is distinct from 'number' or (w->>'kg')::numeric not between 0 and 60000
       or jsonb_typeof(w->'ex') is distinct from 'array' or jsonb_array_length(w->'ex') > 8 then
      raise exception 'INVALID';
    end if;
    if (w->>'id') = any(seen) then raise exception 'INVALID'; end if;
    seen := seen || (w->>'id');
    begin
      dt := (w->>'d')::date;
    exception when others then
      raise exception 'INVALID';
    end;
    if to_char(dt, 'YYYY-MM-DD') <> w->>'d' then raise exception 'INVALID'; end if;
    for e in select value from jsonb_array_elements(w->'ex') loop
      if jsonb_typeof(e) is distinct from 'object'
         or exists (select 1 from jsonb_object_keys(e) k where k not in ('n', 'k', 'w', 'r'))
         or jsonb_typeof(e->'n') is distinct from 'string' or length(btrim(e->>'n')) not between 1 and 40
         or (e ? 'k' and jsonb_typeof(e->'k') not in ('string', 'null'))
         or (jsonb_typeof(e->'k') = 'string' and (e->>'k') !~ '^[A-Za-z0-9_.-]{1,40}$')
         or jsonb_typeof(e->'w') is distinct from 'number' or (e->>'w')::numeric not between 0 and 1000
         or jsonb_typeof(e->'r') is distinct from 'number' or (e->>'r')::numeric not between 0 and 1000 then
        raise exception 'INVALID';
      end if;
    end loop;
  end loop;
  exception when others then
    raise exception 'INVALID';
  end;

  insert into public.gym_mate_profiles(gym_id, member_id, bio, updated_at)
    values (m.gym_id, m.member_id, bio, now())
  on conflict (member_id) do update set gym_id = excluded.gym_id, bio = excluded.bio, updated_at = now();

  delete from public.gym_mate_workouts where member_id = m.member_id;
  for w in select value from jsonb_array_elements(p->'workouts') loop
    dt := (w->>'d')::date;
    continue when dt < today - 59 or dt > today + 1;
    nm := btrim(regexp_replace(w->>'name', '\s+', ' ', 'g'));
    if nm = '' then nm := 'Workout'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
             'n', btrim(regexp_replace(x.value->>'n', '\s+', ' ', 'g')),
             'k', case when jsonb_typeof(x.value->'k') = 'string' then x.value->>'k' else null end,
             'w', round((x.value->>'w')::numeric, 1),
             'r', trunc((x.value->>'r')::numeric)::int) order by x.ord), '[]'::jsonb)
      into exs
      from jsonb_array_elements(w->'ex') with ordinality x(value, ord);
    insert into public.gym_mate_workouts(gym_id, member_id, workout_id, day, name, minutes, kg, exercises)
      values (m.gym_id, m.member_id, w->>'id', dt, nm, trunc((w->>'min')::numeric)::int, round((w->>'kg')::numeric), exs);
    n := n + 1;
  end loop;

  perform public._mate_cleanup(m.gym_id);
  return jsonb_build_object('ok', true, 'workouts', n);
end $$;

create or replace function public.member_mate_stop(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); k int;
begin
  delete from public.gym_mate_profiles where member_id = m.member_id;
  get diagnostics k = row_count;
  return jsonb_build_object('ok', true, 'removed', k > 0);
end $$;

-- Volatile on purpose: a read runs the 60-day clean-up for the gym.
create or replace function public.member_mate_board(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key);
begin
  if m.left_at is not null then raise exception 'BAD_KEY'; end if;
  perform public._mate_cleanup(m.gym_id);
  return jsonb_build_object('ok', true,
    'workouts', public._mate_top(m.gym_id, 'workouts', m.member_id),
    'kg', public._mate_top(m.gym_id, 'kg', m.member_id));
end $$;

create or replace function public.member_mate_profile(p_key text, p_profile uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  p public.gym_mate_profiles; x public.gym_members; ws jsonb;
begin
  if m.left_at is not null then raise exception 'BAD_KEY'; end if;
  if p_profile is null then raise exception 'NOT_SHARED'; end if;
  perform public._mate_cleanup(m.gym_id);
  select * into p from public.gym_mate_profiles where share_id = p_profile and gym_id = m.gym_id;
  if p.member_id is null or public._mate_open_id(p.member_id) is distinct from p_profile then raise exception 'NOT_SHARED'; end if;
  select * into x from public.gym_members where member_id = p.member_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.workout_id, 'd', to_char(w.day, 'YYYY-MM-DD'), 'name', w.name, 'min', w.minutes, 'kg', w.kg,
           'ex', w.exercises) order by w.day desc, w.workout_id desc), '[]'::jsonb)
    into ws
    from public.gym_mate_workouts w where w.member_id = p.member_id;
  return jsonb_build_object('ok', true, 'name', public._board_name(x.name, true), 'bio', p.bio, 'workouts', ws);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._mate_cleanup(uuid) from public, anon, authenticated;
revoke all on function public._mate_member_left() from public, anon, authenticated;
revoke all on function public._mate_open_id(uuid) from public, anon, authenticated;
revoke all on function public._mate_top(uuid, text, uuid) from public, anon, authenticated;

revoke all on function public.member_mate_share(text, jsonb) from public;
revoke all on function public.member_mate_stop(text) from public;
revoke all on function public.member_mate_board(text) from public;
revoke all on function public.member_mate_profile(text, uuid) from public;
grant execute on function public.member_mate_share(text, jsonb) to anon, authenticated;
grant execute on function public.member_mate_stop(text) to anon, authenticated;
grant execute on function public.member_mate_board(text) to anon, authenticated;
grant execute on function public.member_mate_profile(text, uuid) to anon, authenticated;
