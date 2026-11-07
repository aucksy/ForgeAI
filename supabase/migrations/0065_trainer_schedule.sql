-- APPLIED LIVE 7 Nov 2026 (owner: "yes 0065"); live test RESULT PASS (38 checks). Needs 0050 (live).
-- 0065: F105 trainer profiles and personal-training bookings (plan: docs/plans/F105-trainer-profiles.md, 7 Nov 2026).
-- ADDITIVE and re-runnable: two new tables, one private helper and four owner_* functions. Changes nothing that
-- exists. Test: supabase/tests/0065_trainer_schedule.sql (CI runs it after every migration; pasted into the SQL
-- Editor it always ends in an error and so changes nothing).
--
-- The admin app's side: apps/dashboard/src/crm/shop/trainerScheduleApi.ts, ui/screens/Trainers.tsx, rules in
-- logic/trainerSchedule.ts (the same clash rules, so the desk sees the reason before it presses Book).
--
-- A trainer is a person the owner ticked "Trainer" (0050 gym_trainers). Their member list is 0050's
-- gym_trainer_members. Kept OUT of crm_records (which every device downloads and merges offline), so two desks
-- booking the same slot are decided here, one at a time per gym (an advisory lock), never by a merge.
--
--   owner_trainer_schedule(key, week)     owner, desk and trainers: the ticked trainers with their profile, who
--                                         trains whom, the week's bookings (Monday of `week` .. Sunday) and how
--                                         many classes each member has booked from now on.
--   owner_save_trainer_profile(key, staff, teaches, hours, photo)
--                                         the OWNER for anyone, a trainer for their OWN page only (else
--                                         OWNER_ONLY). photo: null keeps it, '' removes it, else base64 JPEG
--                                         of at most 100 KB.
--   owner_book_pt(key, staff, member, day, start, length, outside_ok, request)
--                                         owner, desk and trainers. Refuses NOT_TRAINER, NO_MEMBER, BAD_TIME,
--                                         PAST, TOO_FAR, TRAINER_BUSY, MEMBER_BUSY, OUTSIDE_HOURS (unless
--                                         outside_ok), SUSPENDED. The same request id twice = the first booking.
--   owner_cancel_pt(key, booking)         owner, desk and trainers for a booking that has not started; only the
--                                         owner for one that started or is past (OWNER_ONLY). NOT_FOUND.
-- Times are minutes from midnight in India time; the day is the gym's (India) day.
-- Undo: drop function public.owner_trainer_schedule(text, date), public.owner_save_trainer_profile(text, uuid, text, jsonb, text),
--   public.owner_book_pt(text, uuid, text, date, int, int, boolean, text), public.owner_cancel_pt(text, uuid),
--   public._pt_clean_hours(jsonb); drop table public.gym_pt_bookings, public.gym_trainer_profiles;

set lock_timeout = '3s';

-- ------------------------------------------------------------------ tables
create table if not exists public.gym_trainer_profiles (
  staff_id   uuid primary key references public.gym_staff(staff_id) on delete cascade,
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  teaches    text check (teaches is null or length(teaches) <= 80),
  -- {"1": [[360, 600], [1020, 1260]], ... "7": []}: ISO weekday (1 = Monday) -> up to 2 shifts [from, to).
  hours      jsonb not null default '{}'::jsonb,
  photo      text check (photo is null or length(photo) <= 140000),
  updated_at timestamptz not null default now(),
  updated_by_name text
);
create index if not exists gym_trainer_profiles_by_gym on public.gym_trainer_profiles(gym_id);
alter table public.gym_trainer_profiles enable row level security;
revoke all on public.gym_trainer_profiles from public, anon, authenticated;

create table if not exists public.gym_pt_bookings (
  booking_id   uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms(gym_id) on delete cascade,
  staff_id     uuid not null references public.gym_staff(staff_id) on delete cascade,
  roster_id    text not null check (length(roster_id) between 1 and 64),
  day          date not null,
  start_min    int not null check (start_min between 300 and 1380),
  length_min   int not null check (length_min in (30, 45, 60, 90)),
  request_id   text check (request_id is null or length(request_id) between 8 and 64),
  booked_by_name text,
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by_name text
);
create index if not exists gym_pt_bookings_by_day on public.gym_pt_bookings(gym_id, day) where cancelled_at is null;
create unique index if not exists gym_pt_bookings_request on public.gym_pt_bookings(gym_id, request_id) where request_id is not null;
alter table public.gym_pt_bookings enable row level security;
revoke all on public.gym_pt_bookings from public, anon, authenticated;

-- ------------------------------------------------------------------ helpers (no grants)
-- Working hours, checked and rebuilt: keys "1".."7", each at most 2 shifts [from, to) on the half hour,
-- 5:00 am to 11:00 pm, from < to, not overlapping. Anything else: INVALID.
create or replace function public._pt_clean_hours(p jsonb) returns jsonb
  language plpgsql immutable set search_path = public as $$
declare res jsonb := '{}'::jsonb; k text; shifts jsonb; s jsonb; a int; b int; prev_end int; clean jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'INVALID'; end if;
  for k, shifts in select * from jsonb_each(p) loop
    if k !~ '^[1-7]$' or jsonb_typeof(shifts) <> 'array' or jsonb_array_length(shifts) > 2 then raise exception 'INVALID'; end if;
    clean := '[]'::jsonb; prev_end := -1;
    for s in select x from jsonb_array_elements(shifts) x order by (x->>0)::numeric loop
      if jsonb_typeof(s) <> 'array' or jsonb_array_length(s) <> 2
         or jsonb_typeof(s->0) <> 'number' or jsonb_typeof(s->1) <> 'number' then raise exception 'INVALID'; end if;
      a := (s->>0)::numeric; b := (s->>1)::numeric;
      if (s->>0)::numeric <> a or (s->>1)::numeric <> b or a % 30 <> 0 or b % 30 <> 0
         or a < 300 or b > 1380 or a >= b or a < prev_end then raise exception 'INVALID'; end if;
      clean := clean || jsonb_build_array(jsonb_build_array(a, b)); prev_end := b;
    end loop;
    if jsonb_array_length(clean) > 0 then res := res || jsonb_build_object(k, clean); end if;
  end loop;
  return res;
end $$;

-- ------------------------------------------------------------------ the week
create or replace function public.owner_trainer_schedule(p_key text, p_week date)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  ist timestamp := now() at time zone 'Asia/Kolkata';
  td date := ist::date;
  now_min int := extract(hour from ist)::int * 60 + extract(minute from ist)::int;
  mon date := coalesce(p_week, td) - (extract(isodow from coalesce(p_week, td))::int - 1);
begin
  return jsonb_build_object(
    'ok', true,
    'me', st.staff_id,
    'owner', st.staff_id is null or st.role = 'owner',
    'week', to_char(mon, 'YYYY-MM-DD'),
    'trainers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.staff_id, 'name', s.name,
               'teaches', p.teaches, 'hours', coalesce(p.hours, '{}'::jsonb), 'photo', p.photo)
             order by s.created_at, s.staff_id)
        from public.gym_trainers t
        join public.gym_staff s on s.staff_id = t.staff_id and s.gym_id = g and s.removed_at is null
        left join public.gym_trainer_profiles p on p.staff_id = s.staff_id and p.gym_id = g
       where t.gym_id = g), '[]'::jsonb),
    'assigned', coalesce((
      select jsonb_agg(jsonb_build_object('memberId', a.roster_id, 'trainerId', a.staff_id) order by a.roster_id)
        from public.gym_trainer_members a
        join public.gym_trainers t on t.staff_id = a.staff_id and t.gym_id = a.gym_id
        join public.gym_staff s on s.staff_id = a.staff_id and s.removed_at is null
       where a.gym_id = g), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.booking_id, 'trainerId', b.staff_id, 'memberId', b.roster_id,
               'day', to_char(b.day, 'YYYY-MM-DD'), 'start', b.start_min, 'length', b.length_min,
               'byName', b.booked_by_name)
             order by b.day, b.start_min, b.created_at)
        from public.gym_pt_bookings b
       where b.gym_id = g and b.cancelled_at is null and b.day between mon and mon + 6), '[]'::jsonb),
    -- Classes each member has booked from now on (any week), for "0 classes left" before booking another.
    'ahead', coalesce((
      select jsonb_object_agg(x.roster_id, x.n) from (
        select b.roster_id, count(*) as n from public.gym_pt_bookings b
         where b.gym_id = g and b.cancelled_at is null
           and (b.day > td or (b.day = td and b.start_min + b.length_min > now_min))
         group by b.roster_id) x), '{}'::jsonb));
end $$;

-- ------------------------------------------------------------------ a trainer's page
create or replace function public.owner_save_trainer_profile(p_key text, p_staff uuid, p_teaches text, p_hours jsonb, p_photo text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  is_owner boolean := st.staff_id is null or st.role = 'owner';
  t text := left(nullif(btrim(regexp_replace(coalesce(p_teaches, ''), '\s+', ' ', 'g')), ''), 80);
  h jsonb := public._pt_clean_hours(coalesce(p_hours, '{}'::jsonb));
  pic text := nullif(btrim(coalesce(p_photo, '')), '');
begin
  if not is_owner and st.staff_id is distinct from p_staff then raise exception 'OWNER_ONLY'; end if;
  if p_staff is null or not exists (select 1 from public.gym_trainers x join public.gym_staff s on s.staff_id = x.staff_id
                                     where x.staff_id = p_staff and x.gym_id = g and s.gym_id = g and s.removed_at is null) then
    raise exception 'NOT_TRAINER';
  end if;
  if exists (select 1 from public.gyms where gym_id = g and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  if pic is not null then
    if length(pic) > 140000 or pic !~ '^[A-Za-z0-9+/]+=*$' or left(pic, 4) <> '/9j/' then raise exception 'BAD_PHOTO'; end if;
  end if;
  insert into public.gym_trainer_profiles(staff_id, gym_id, teaches, hours, photo, updated_by_name)
    values (p_staff, g, t, h, pic, st.name)
  on conflict (staff_id) do update set
    teaches = excluded.teaches,
    hours = excluded.hours,
    photo = case when p_photo is null then public.gym_trainer_profiles.photo else excluded.photo end,
    updated_at = now(),
    updated_by_name = excluded.updated_by_name;
  return (select jsonb_build_object('id', p.staff_id, 'teaches', p.teaches, 'hours', p.hours, 'photo', p.photo)
            from public.gym_trainer_profiles p where p.staff_id = p_staff);
end $$;

-- ------------------------------------------------------------------ book and cancel
create or replace function public.owner_book_pt(p_key text, p_staff uuid, p_member text, p_day date, p_start int,
                                                p_length int, p_outside_ok boolean, p_request text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  ist timestamp := now() at time zone 'Asia/Kolkata';
  td date := ist::date;
  now_min int := extract(hour from ist)::int * 60 + extract(minute from ist)::int;
  req text := nullif(btrim(coalesce(p_request, '')), '');
  hrs jsonb;
  b public.gym_pt_bookings;
begin
  if req is not null and length(req) not between 8 and 64 then req := null; end if;
  -- One booking at a time per gym: two desks pressing Book on the same slot are decided in order.
  perform pg_advisory_xact_lock(hashtextextended('pt-book:' || g::text, 0));
  if req is not null then
    select * into b from public.gym_pt_bookings where gym_id = g and request_id = req;
    if found then
      return jsonb_build_object('id', b.booking_id, 'trainerId', b.staff_id, 'memberId', b.roster_id,
        'day', to_char(b.day, 'YYYY-MM-DD'), 'start', b.start_min, 'length', b.length_min, 'byName', b.booked_by_name);
    end if;
  end if;
  if exists (select 1 from public.gyms where gym_id = g and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  if p_staff is null or not exists (select 1 from public.gym_trainers x join public.gym_staff s on s.staff_id = x.staff_id
                                     where x.staff_id = p_staff and x.gym_id = g and s.gym_id = g and s.removed_at is null) then
    raise exception 'NOT_TRAINER';
  end if;
  perform public._roster_member_ok(g, p_member);
  if p_day is null or p_start is null or p_length is null or p_length not in (30, 45, 60, 90)
     or p_start % 30 <> 0 or p_start < 300 or p_start + p_length > 1380 then
    raise exception 'BAD_TIME';
  end if;
  if p_day < td or (p_day = td and p_start <= now_min) then raise exception 'PAST'; end if;
  if p_day > td + 31 then raise exception 'TOO_FAR'; end if;
  if exists (select 1 from public.gym_pt_bookings x where x.gym_id = g and x.staff_id = p_staff and x.day = p_day
               and x.cancelled_at is null and x.start_min < p_start + p_length and p_start < x.start_min + x.length_min) then
    raise exception 'TRAINER_BUSY';
  end if;
  if exists (select 1 from public.gym_pt_bookings x where x.gym_id = g and x.roster_id = p_member and x.day = p_day
               and x.cancelled_at is null and x.start_min < p_start + p_length and p_start < x.start_min + x.length_min) then
    raise exception 'MEMBER_BUSY';
  end if;
  -- Working hours: only when some are set. A day with no shift is a day off.
  select p.hours into hrs from public.gym_trainer_profiles p where p.staff_id = p_staff and p.gym_id = g;
  if not coalesce(p_outside_ok, false) and hrs is not null and hrs <> '{}'::jsonb
     and not exists (select 1 from jsonb_array_elements(coalesce(hrs->(extract(isodow from p_day)::int::text), '[]'::jsonb)) s
                      where (s->>0)::int <= p_start and p_start + p_length <= (s->>1)::int) then
    raise exception 'OUTSIDE_HOURS';
  end if;
  insert into public.gym_pt_bookings(gym_id, staff_id, roster_id, day, start_min, length_min, request_id, booked_by_name)
    values (g, p_staff, p_member, p_day, p_start, p_length, req, st.name)
    returning * into b;
  return jsonb_build_object('id', b.booking_id, 'trainerId', b.staff_id, 'memberId', b.roster_id,
    'day', to_char(b.day, 'YYYY-MM-DD'), 'start', b.start_min, 'length', b.length_min, 'byName', b.booked_by_name);
end $$;

create or replace function public.owner_cancel_pt(p_key text, p_booking uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  is_owner boolean := st.staff_id is null or st.role = 'owner';
  ist timestamp := now() at time zone 'Asia/Kolkata';
  td date := ist::date;
  now_min int := extract(hour from ist)::int * 60 + extract(minute from ist)::int;
  b public.gym_pt_bookings;
begin
  select * into b from public.gym_pt_bookings where booking_id = p_booking and gym_id = g and cancelled_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not is_owner and (b.day < td or (b.day = td and b.start_min <= now_min)) then raise exception 'OWNER_ONLY'; end if;
  update public.gym_pt_bookings set cancelled_at = now(), cancelled_by_name = st.name where booking_id = b.booking_id;
  return jsonb_build_object('ok', true, 'id', b.booking_id);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._pt_clean_hours(jsonb)                                              from public, anon, authenticated;
revoke all on function public.owner_trainer_schedule(text, date)                                  from public;
revoke all on function public.owner_save_trainer_profile(text, uuid, text, jsonb, text)           from public;
revoke all on function public.owner_book_pt(text, uuid, text, date, int, int, boolean, text)      from public;
revoke all on function public.owner_cancel_pt(text, uuid)                                         from public;
grant execute on function public.owner_trainer_schedule(text, date)                               to anon, authenticated;
grant execute on function public.owner_save_trainer_profile(text, uuid, text, jsonb, text)        to anon, authenticated;
grant execute on function public.owner_book_pt(text, uuid, text, date, int, int, boolean, text)   to anon, authenticated;
grant execute on function public.owner_cancel_pt(text, uuid)                                      to anon, authenticated;

notify pgrst, 'reload schema';
