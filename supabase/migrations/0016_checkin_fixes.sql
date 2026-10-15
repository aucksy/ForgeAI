-- 0016: QR check-in fixes from the safety review (15 Oct 2026). Apply after 0015. Re-runnable.
-- The test is supabase/tests/0015_qr_checkin.sql (CI runs it after every migration).
--
-- 1. GUESSING NUMBERS (high). The number an app member gave at Join (gym_members.phone, never
--    checked) was used for check-in with no limit, so a script could Join many times with the
--    poster's code and try one number per new key. Now check-in uses ONLY a number that already
--    matched the roster once (gym_members.checkin_phone). Any other number counts as a typed try:
--    3 a day per member key, AND at most 20 numbers that match nobody per gym per hour (the gym-wide
--    count is what stops a script that keeps making new keys).
-- 2. The scanned code is required (p_code); the app always sends it.
-- 3. A number is saved only when it matches the roster (a typo or a stranger's number is not kept).
--    Leave clears both numbers.
-- 4. planOk in the answer: false when no plan (not cancelled) covers today, so the app can say
--    "see the desk"; the visit is still written (whether someone trains is the gym's call).
-- 5. TOO_MANY_NUMBERS (3 numbers a day, or the gym's hourly cap) is a separate answer from
--    TOO_MANY (10 calls a minute), so the app can say "ask the desk" instead of "wait a minute".
-- 6. The gym's row lock is taken only just before the write, so refused scans never queue behind
--    the desk's saves.

alter table public.gym_members add column if not exists checkin_phone text;

create table if not exists public.gym_checkin_misses (
  gym_id uuid not null references public.gyms(gym_id) on delete cascade,
  at     timestamptz not null default now()
);
create index if not exists gym_checkin_misses_gym on public.gym_checkin_misses(gym_id, at);
alter table public.gym_checkin_misses enable row level security;
revoke all on public.gym_checkin_misses from anon, authenticated;

-- True when a membership row (not deleted, not cancelled) covers p_day for this roster member.
create or replace function public._checkin_plan_ok(p_gym uuid, p_member text, p_day text)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm_records r
     where r.gym_id = p_gym and r.kind = 'membership' and not r.deleted
       and r.data->>'memberId' = p_member
       and coalesce(r.data->>'cancelled', 'false') <> 'true'
       and r.data->>'startsOn' <= p_day and r.data->>'endsOn' >= p_day)
$$;

create or replace function public.member_check_in(p_key text, p_code text default null, p_phone text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  g public.gyms;
  tries int;
  ph text;
  typed boolean := false;
  roster public.crm_records;
  day text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  vid text;
  prev jsonb;
  v bigint;
  plan_ok boolean;
  first_name text;
  at_ms bigint := floor(extract(epoch from now()) * 1000)::bigint;
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

  if nullif(btrim(coalesce(p_code, '')), '') is null or upper(btrim(p_code)) <> g.join_code then
    return jsonb_build_object('error', 'OTHER_GYM', 'gymName', g.name);
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

  -- A number that has not matched for this member before is a TYPED try, limited per key and,
  -- for numbers that match nobody, per gym.
  if public._norm_phone(m.checkin_phone) is distinct from ph then
    typed := true;
    select count(*) into tries from public.member_checkin_tries
     where member_id = m.member_id and what = 'phone' and at > now() - interval '1 day';
    if tries >= 3 then return jsonb_build_object('error', 'TOO_MANY_NUMBERS'); end if;
    perform pg_advisory_xact_lock(hashtextextended('checkin-misses:' || g.gym_id::text, 0));
    select count(*) into tries from public.gym_checkin_misses
     where gym_id = g.gym_id and at > now() - interval '1 hour';
    if tries >= 20 then return jsonb_build_object('error', 'TOO_MANY_NUMBERS'); end if;
    insert into public.member_checkin_tries(member_id, what) values (m.member_id, 'phone');
  end if;

  roster := public._checkin_roster_member(g.gym_id, ph);
  if roster.id is null then
    if typed then
      insert into public.gym_checkin_misses(gym_id) values (g.gym_id);
      delete from public.gym_checkin_misses where gym_id = g.gym_id and at < now() - interval '1 day';
    end if;
    return jsonb_build_object('error', 'NOT_ON_ROSTER', 'gymName', g.name, 'phone', '+91' || ph);
  end if;

  if typed then
    update public.gym_members set checkin_phone = '+91' || ph, phone = '+91' || ph where member_id = m.member_id;
  end if;

  first_name := split_part(btrim(coalesce(roster.data->>'fullName', m.name)), ' ', 1);
  plan_ok := public._checkin_plan_ok(g.gym_id, roster.id, day);

  -- The gym's row lock (the one crm_push takes) only now, just before the "already in" look and
  -- the write, so versions never collide and a desk check-in cannot slip in between.
  select * into g from public.gyms where gym_id = g.gym_id for update;

  -- Already in today, however it was recorded (desk rows have random ids).
  select r.data into prev from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'visit' and not r.deleted
     and r.data->>'memberId' = roster.id and r.data->>'visitedOn' = day
   order by r.version limit 1;
  if prev is not null then
    return jsonb_build_object('ok', true, 'alreadyIn', true, 'gymName', g.name, 'memberName', first_name,
      'day', day, 'planOk', plan_ok,
      'checkedInAt', case when prev->>'checkedInAt' ~ '^[0-9]{1,15}$' then (prev->>'checkedInAt')::bigint else at_ms end);
  end if;

  vid := roster.id || ':' || day;
  v := coalesce(g.crm_version, 0) + 1;
  insert into public.crm_records(gym_id, kind, id, data, version)
    values (g.gym_id, 'visit', vid,
            jsonb_build_object('id', vid, 'gymId', g.gym_id::text, 'memberId', roster.id,
                               'visitedOn', day, 'checkedInAt', at_ms, 'source', 'app'),
            v)
    on conflict (gym_id, kind, id) do update
      set data = excluded.data, version = v, deleted = false, updated_at = now();
  update public.gyms set crm_version = v where gym_id = g.gym_id;
  update public.gym_members set last_seen = now() where member_id = m.member_id;

  return jsonb_build_object('ok', true, 'alreadyIn', false, 'gymName', g.name, 'memberName', first_name,
    'day', day, 'planOk', plan_ok, 'checkedInAt', at_ms);
end $$;

-- Leave (0008): also forget both numbers.
create or replace function public.member_leave(p_key text)
  returns void language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key);
begin
  update public.gym_members
     set key_hash = public._hash_key(public._new_key()), left_at = now(), phone = null, checkin_phone = null
   where member_id = m.member_id;
end $$;

revoke all on function public._checkin_plan_ok(uuid, text, text)   from public, anon, authenticated;
revoke all on function public.member_check_in(text, text, text)    from public;
grant execute on function public.member_check_in(text, text, text) to anon, authenticated;
revoke all on function public.member_leave(text)                   from public;
grant execute on function public.member_leave(text)                to anon, authenticated;
