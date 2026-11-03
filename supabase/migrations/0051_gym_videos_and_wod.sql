-- NOT APPLIED. Needs the owner's yes (F148, F151).
--
-- 0051: the gym's own form videos (F148) and the gym's workout of the day (F151), from OWNER-INBOX #58.
-- Additive and re-runnable: one new table, new functions, one changed check (_workout_plan_ok, 0024's copy
-- plus one rule). Apply after 0049 (needs 0024's _workout_plan_ok, 0027's _gym_not_suspended, 0035's
-- _member_roster_link, 0010's _owner_gym / _staff). Test: supabase/tests/0051_gym_videos_and_wod.sql (CI runs
-- it after every migration; pasted into the SQL Editor it always ends in an error and so changes nothing).
-- Undo: drop the four public functions below, _video_url_ok, _wod_clean, _wod_json and the table gym_wods,
-- and run 0024's _workout_plan_ok again.
--
-- 1. FORM VIDEOS (F148). A trainer may give any exercise in a workout plan a video link. It rides inside the
--    plan's routines as the exercise's "videoUrl" (crm_records kind 'workout_plan', 0024), so it reaches the
--    phone through member_gym_plans with no other change. The phone shows "Watch your trainer" on that
--    exercise and opens the link. Only a YouTube link is kept: https, host youtube.com / www.youtube.com /
--    m.youtube.com / youtu.be, at most 300 characters, nothing else (no other site, no user@host, no port).
--    _workout_plan_ok now refuses anything else as INVALID, on every save (owner and front desk alike). The
--    admin app and the phone check the same rule (apps/dashboard/src/crm/logic/trainerVideos.ts,
--    apps/mobile/src/shop/trainerVideo.ts); the phone never opens a link that fails it.
--
-- 2. WORKOUT OF THE DAY (F151). One workout per gym per India day, for every member of the gym (anyone the
--    member key + 0023's identity checks lead to: the number matched at a check-in, the first name on the
--    gym's list, never a shared number). The trainer or owner picks a day from one of the gym's plans or
--    builds one in the admin app, for today or a day up to 7 days ahead. Saving the same day again replaces
--    it; "Take it off" deletes it (nothing else points at it: the member's phone keeps its own copy only
--    once they start it). The routine is one routine in the plans' routine-file shape, checked by
--    _workout_plan_ok (so the video rule above holds here too) and the same 20 KB cap as crm_push.
--    Who set it: the signed-in person, from the session (never what the device wrote); an old owner key: none.
--
-- Who may read and write:
--  - The gym's people: an owner key or a live session of the gym's staff (_owner_gym). Owner and front desk /
--    trainers alike, like workout plans. A suspended gym is read-only (trigger, 0027's way).
--  - The member: today's workout of their own gym only (member_gym_wod).
--  - Nobody else: the table has RLS on, no policies and no grants; every read and write goes through the
--    functions below, each scoped to the key's gym.

-- ------------------------------------------------------------------ the video rule
-- A link the member's phone may open: https YouTube only. PURE.
create or replace function public._video_url_ok(u text) returns boolean
  language sql immutable set search_path = public as $$
  select u is not null and length(u) between 10 and 300
     and (u ~ '^https://((www|m)\.)?youtube\.com/[A-Za-z0-9_./?=&%#:+~-]*$'
          or u ~ '^https://youtu\.be/[A-Za-z0-9_-]+([?#][A-Za-z0-9_./?=&%#:+~-]*)?$')
$$;

-- 0024's outline of a workout plan, plus (0051) an exercise's optional videoUrl must pass _video_url_ok.
create or replace function public._workout_plan_ok(d jsonb)
  returns void language plpgsql immutable set search_path = public as $$
declare rt jsonb; ex jsonb; a jsonb;
begin
  if jsonb_typeof(d->'name') is distinct from 'string' or length(btrim(d->>'name')) not between 1 and 80 then raise exception 'INVALID'; end if;
  if d ? 'note' and jsonb_typeof(d->'note') not in ('string', 'null') then raise exception 'INVALID'; end if;
  if d ? 'withdrawn' and jsonb_typeof(d->'withdrawn') is distinct from 'boolean' then raise exception 'INVALID'; end if;
  if jsonb_typeof(d->'routines') is distinct from 'array' or jsonb_array_length(d->'routines') not between 1 and 14 then raise exception 'INVALID'; end if;
  for rt in select value from jsonb_array_elements(d->'routines') loop
    if jsonb_typeof(rt) is distinct from 'object' or jsonb_typeof(rt->'name') is distinct from 'string'
       or length(btrim(rt->>'name')) not between 1 and 80 then raise exception 'INVALID'; end if;
    if jsonb_typeof(rt->'exercises') is distinct from 'array' or jsonb_array_length(rt->'exercises') not between 1 and 30 then raise exception 'INVALID'; end if;
    for ex in select value from jsonb_array_elements(rt->'exercises') loop
      if jsonb_typeof(ex) is distinct from 'object' or jsonb_typeof(ex->'name') is distinct from 'string'
         or length(btrim(ex->>'name')) not between 1 and 80 then raise exception 'INVALID'; end if;
      if ex ? 'catalogKey' and not (jsonb_typeof(ex->'catalogKey') = 'null'
         or (jsonb_typeof(ex->'catalogKey') = 'string' and length(ex->>'catalogKey') between 1 and 64)) then raise exception 'INVALID'; end if;
      -- 0051 (F148): the trainer's video, YouTube only.
      if ex ? 'videoUrl' and not (jsonb_typeof(ex->'videoUrl') = 'null'
         or (jsonb_typeof(ex->'videoUrl') = 'string' and public._video_url_ok(ex->>'videoUrl'))) then raise exception 'INVALID'; end if;
    end loop;
  end loop;
  a := d->'assign';
  if jsonb_typeof(a) is distinct from 'object' then raise exception 'INVALID'; end if;
  if jsonb_typeof(a->'memberIds') is distinct from 'array' or jsonb_array_length(a->'memberIds') > 2000
     or jsonb_typeof(a->'planIds') is distinct from 'array' or jsonb_array_length(a->'planIds') > 100 then raise exception 'INVALID'; end if;
  if exists (select 1 from jsonb_array_elements(a->'memberIds') e where jsonb_typeof(e) <> 'string' or length(e #>> '{}') not between 1 and 64)
     or exists (select 1 from jsonb_array_elements(a->'planIds') e where jsonb_typeof(e) <> 'string' or length(e #>> '{}') not between 1 and 64) then
    raise exception 'INVALID';
  end if;
end $$;

-- ------------------------------------------------------------------ the workout of the day
create table if not exists public.gym_wods (
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  day         date not null,
  -- One routine in the routine-file shape: {name, dayType, exercises: [...]}.
  routine     jsonb not null check (jsonb_typeof(routine) = 'object'),
  note        text check (note is null or length(note) <= 500),
  by_staff    uuid,
  by_name     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (gym_id, day)
);

alter table public.gym_wods enable row level security;
revoke all on public.gym_wods from public, anon, authenticated;

drop trigger if exists gym_wods_not_suspended on public.gym_wods;
create trigger gym_wods_not_suspended before insert or update or delete on public.gym_wods
  for each row execute function public._gym_not_suspended();

-- A workout of the day as typed -> {day, routine, note}, or INVALID / BAD_DATE.
--   {day: 'YYYY-MM-DD' (today .. today + 7, India), name, dayType?, exercises: [...], note?}
create or replace function public._wod_clean(p jsonb) returns jsonb
  language plpgsql stable set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  d date;
  n text;
  dt text;
  rt jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 20000 then raise exception 'INVALID'; end if;
  if jsonb_typeof(p->'day') is distinct from 'string' or (p->>'day') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'BAD_DATE'; end if;
  begin
    d := (p->>'day')::date;
  exception when others then
    raise exception 'BAD_DATE';
  end;
  if d < today or d > today + 7 then raise exception 'BAD_DATE'; end if;
  if p ? 'note' and jsonb_typeof(p->'note') not in ('string', 'null') then raise exception 'INVALID'; end if;
  n := nullif(btrim(coalesce(p->>'note', '')), '');
  if length(n) > 500 then raise exception 'INVALID'; end if;
  dt := coalesce(p->>'dayType', 'full');
  if dt not in ('full', 'push', 'pull', 'legs', 'upper', 'lower') then raise exception 'INVALID'; end if;
  rt := jsonb_build_object('name', p->'name', 'dayType', dt, 'exercises', p->'exercises');
  -- The plans' own outline check (names, 1-30 exercises, library keys, YouTube links).
  perform public._workout_plan_ok(jsonb_build_object('name', p->'name', 'routines', jsonb_build_array(rt),
    'assign', jsonb_build_object('memberIds', '[]'::jsonb, 'planIds', '[]'::jsonb)));
  rt := jsonb_set(rt, '{name}', to_jsonb(btrim(p->>'name')));
  return jsonb_build_object('day', d, 'routine', rt, 'note', n);
end $$;

create or replace function public._wod_json(r public.gym_wods) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object('day', to_char(r.day, 'YYYY-MM-DD'), 'name', r.routine->>'name', 'dayType', r.routine->>'dayType',
    'exercises', r.routine->'exercises', 'note', r.note, 'byName', r.by_name,
    'updatedAt', floor(extract(epoch from r.updated_at) * 1000)::bigint)
$$;

-- The gym's side: today's and the coming days' workouts (newest day last), and India's today.
--   {today: 'YYYY-MM-DD', wods: [{day, name, dayType, exercises, note, byName, updatedAt}]}
create or replace function public.owner_gym_wods(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  return jsonb_build_object('today', to_char(today, 'YYYY-MM-DD'),
    'wods', coalesce((select jsonb_agg(public._wod_json(w) order by w.day) from public.gym_wods w
                       where w.gym_id = g and w.day >= today), '[]'::jsonb));
end $$;

-- Set (or replace) the workout of one day. Returns it. Who set it: the signed-in person (none for an old key).
create or replace function public.owner_save_gym_wod(p_key text, p_wod jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  c jsonb := public._wod_clean(p_wod);
  r public.gym_wods;
begin
  insert into public.gym_wods(gym_id, day, routine, note, by_staff, by_name)
    values (g, (c->>'day')::date, c->'routine', c->>'note', st.staff_id, case when st.staff_id is null then null else st.name end)
  on conflict (gym_id, day) do update
    set routine = excluded.routine, note = excluded.note, by_staff = excluded.by_staff, by_name = excluded.by_name, updated_at = now()
  returning * into r;
  return public._wod_json(r);
end $$;

-- Take a day's workout off. True when there was one (another gym's day is never touched: false).
create or replace function public.owner_clear_gym_wod(p_key text, p_day text)
  returns boolean language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); d date; n int;
begin
  begin
    d := p_day::date;
  exception when others then
    raise exception 'BAD_DATE';
  end;
  delete from public.gym_wods where gym_id = g and day = d;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- The member's side: today's workout at their gym (India day), or none.
--   {ok:true, gymId, gymName, today, wod: {day, name, dayType, exercises, note, byName, updatedAt} | null}
--   {error: NO_PHONE | GYM_NOT_ONLINE | NOT_ON_ROSTER | SHARED_NUMBER | NAME_MISMATCH, gymName}
create or replace function public.member_gym_wod(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  l jsonb := public._member_roster_link(p_key);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  w public.gym_wods;
begin
  if l ? 'error' then return l; end if;
  select * into w from public.gym_wods where gym_id = (l->>'gymId')::uuid and day = today;
  return jsonb_build_object('ok', true, 'gymId', l->>'gymId', 'gymName', l->>'gymName', 'today', to_char(today, 'YYYY-MM-DD'),
    'wod', case when w.gym_id is null then null else public._wod_json(w) end);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._video_url_ok(text) from public, anon, authenticated;
revoke all on function public._workout_plan_ok(jsonb) from public, anon, authenticated;
revoke all on function public._wod_clean(jsonb) from public, anon, authenticated;
revoke all on function public._wod_json(public.gym_wods) from public, anon, authenticated;

revoke all on function public.owner_gym_wods(text) from public;
revoke all on function public.owner_save_gym_wod(text, jsonb) from public;
revoke all on function public.owner_clear_gym_wod(text, text) from public;
revoke all on function public.member_gym_wod(text) from public;
grant execute on function public.owner_gym_wods(text) to anon, authenticated;
grant execute on function public.owner_save_gym_wod(text, jsonb) to anon, authenticated;
grant execute on function public.owner_clear_gym_wod(text, text) to anon, authenticated;
grant execute on function public.member_gym_wod(text) to anon, authenticated;
