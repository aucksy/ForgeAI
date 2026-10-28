-- APPLIED LIVE 29 Oct 2026 (owner: "yes, apply 0039 and 0040 live in Supabase and add their privacy lines"; live test 0039 PASS 31).
--
-- 0039: how busy the gym is right now, and its usual busy and quiet hours, for members (R-163, OWNER-INBOX
-- #58 item 2, backlog row "How busy the gym is right now"). Additive and re-runnable: one index, one
-- helper and one member function; nothing that exists is changed. Apply after 0038 (it needs 0036's
-- gym_timings and _hhmm_min). Test: supabase/tests/0039_gym_busy.sql (CI runs it after every migration;
-- pasted into the SQL Editor it always ends in an error and so changes nothing).
--
-- WHERE THE NUMBERS COME FROM. Check-ins the gym already keeps: crm_records rows of kind 'visit' (the
-- member app's QR check-in, member_check_in, and the desk's check-ins pushed by the admin app). Only a
-- visit with a real time counts: checkedInAt in ms, on the same India day as its visitedOn (an imported
-- paper register says 0, which is never counted; same rule as the admin app's busy hours,
-- apps/dashboard/src/crm/logic/attendance.ts trustedHour). A visit a member of this gym made at
-- ANOTHER branch (0031's atGymId) is not counted here. Visitors from other branches are not counted
-- either (finding them would mean reading every gym's visits); a small undercount, on the safe side.
--
-- WHAT A MEMBER GETS (member_gym_busy(key)):
--   {ok, gymId, learning, level, about, weeks, week}
--   learning  true while the gym has fewer than 40 timed check-ins in the last 8 weeks: then level,
--             about and week are null and the app shows nothing (too few to be honest, and too few to
--             hide one person in).
--   level     'quiet' | 'normal' | 'busy' | 'closed': check-ins in the last 90 minutes against what is
--             usual for this weekday and time (the same 90 minutes on the same weekday, averaged over
--             the weeks we have, up to 8). 2 or fewer = quiet; under 0.7 x usual = quiet; 1.3 x usual
--             or more AND at least 5 = busy; else normal. 'closed': nobody in the last 90 minutes and
--             the gym's weekly hours (0036) say closed this hour. Special days (Diwali) are the app's
--             to show: it has the hours and the same rules (packages/theme gymHours.ts).
--   about     check-ins in the last 90 minutes rounded to the nearest 5, only when 5 or more; else null.
--             Never an exact small number.
--   weeks     how many weeks the usual levels are made from (1 to 8).
--   week      {"mon": [24], ... "sun": [24]}: per India hour, how busy it usually is, 0 to 4, against the
--             busiest hour of the week (4). 0 = an hour with fewer than 3 check-ins in all those weeks
--             together (so no single person's habit shows as a bar). null = the gym is closed that hour
--             by its weekly hours. A gym with no hours set: every hour has a number.
--   No names, no member ids, no times of anyone's visit leave the server: only these levels.
-- Errors: BAD_KEY (no member with this key: never joined, or left).

set lock_timeout = '3s';

-- ------------------------------------------------------------------ index
-- The check-ins of one gym by day, so the 8-week read never walks a gym's whole history.
create index if not exists crm_records_visit_day on public.crm_records (gym_id, (data->>'visitedOn'))
  where kind = 'visit' and not deleted;

-- ------------------------------------------------------------------ helper (no grants)
-- The hours (0..23, India time) a gym is open on weekday p_dk ('mon'..'sun') by its weekly hours, p_prev
-- the weekday before (a range past midnight runs into this morning). Null hours = no hours set = null
-- (every hour counts). An hour that is open for any part counts as open.
create or replace function public._busy_open_hours(p_hours jsonb, p_dk text, p_prev text) returns int[]
  language plpgsql immutable set search_path = public as $$
declare
  d jsonb; r jsonb; s int; c int; e int; h int; out int[] := '{}';
begin
  if p_hours is null or jsonb_typeof(p_hours->'week') is distinct from 'object' then return null; end if;
  d := p_hours->'week'->p_dk;
  if d->>'kind' = 'allDay' then
    return array(select generate_series(0, 23));
  end if;
  if d->>'kind' = 'hours' and jsonb_typeof(d->'ranges') = 'array' then
    for r in select value from jsonb_array_elements(d->'ranges') loop
      s := public._hhmm_min(r->'open');
      c := public._hhmm_min(r->'close');
      e := case when c = 0 then 1440 when c <= s then 1440 else c end;  -- past midnight: to the end of today
      for h in s / 60 .. (e - 1) / 60 loop out := out || h; end loop;
    end loop;
  end if;
  -- Yesterday's range that ran past midnight (close earlier than open, not a midnight close).
  d := p_hours->'week'->p_prev;
  if d->>'kind' = 'hours' and jsonb_typeof(d->'ranges') = 'array' then
    for r in select value from jsonb_array_elements(d->'ranges') loop
      s := public._hhmm_min(r->'open');
      c := public._hhmm_min(r->'close');
      if c > 0 and c <= s then
        for h in 0 .. (c - 1) / 60 loop out := out || h; end loop;
      end if;
    end loop;
  end if;
  return array(select distinct x from unnest(out) x order by 1);
end $$;

-- ------------------------------------------------------------------ the member's side
create or replace function public.member_gym_busy(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  gid uuid := m.gym_id;
  now_ist timestamp := now() at time zone 'Asia/Kolkata';
  today date := (now() at time zone 'Asia/Kolkata')::date;
  dks text[] := array['mon','tue','wed','thu','fri','sat','sun'];
  hrs jsonb;
  ts timestamptz[];
  first_at timestamptz;
  n_hist int; n_now int; weeks int; typical numeric; lvl text; about int;
  i int; dk text; prev text; open_h int[]; counts jsonb; c int; mx int := 0; arr jsonb; week jsonb := '{}'::jsonb; h int;
  now_open int[];
begin
  select t.hours into hrs from public.gym_timings t where t.gym_id = gid;

  -- Every timed check-in at this gym in the last 8 weeks and today (57 days).
  select coalesce(array_agg(v.t order by v.t), '{}') into ts from (
    select to_timestamp((r.data->>'checkedInAt')::bigint / 1000.0) as t, r.data->>'visitedOn' as d
      from public.crm_records r
     where r.gym_id = gid and r.kind = 'visit' and not r.deleted
       and (r.data->>'visitedOn') >= to_char(today - 57, 'YYYY-MM-DD')
       and coalesce(nullif(r.data->>'atGymId', ''), gid::text) = gid::text
       and r.data->>'checkedInAt' ~ '^[0-9]{1,15}$'
       and (r.data->>'checkedInAt')::bigint > 0
  ) v
  where v.t > now() - interval '57 days' and v.t <= now() + interval '5 minutes'
    and to_char((v.t at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') = v.d;

  -- History = the 8 weeks before today (today itself is "now", not "usual").
  select count(*), min(x) into n_hist, first_at from unnest(ts) x
   where (x at time zone 'Asia/Kolkata')::date between today - 56 and today - 1;

  if n_hist < 40 then
    return jsonb_build_object('ok', true, 'gymId', gid::text, 'learning', true, 'level', null, 'about', null,
                              'weeks', 0, 'week', null);
  end if;

  -- Weeks of history we really have (a gym online for 3 weeks averages over 3, not 8).
  weeks := greatest(1, least(8, ceil(extract(epoch from (now() - first_at)) / (7 * 86400))::int));

  -- Now: check-ins in the last 90 minutes. Usual: the same 90 minutes on the same weekday, 1..weeks ago.
  select count(*) into n_now from unnest(ts) x where x > now() - interval '90 minutes' and x <= now() + interval '5 minutes';
  select count(*)::numeric / weeks into typical from unnest(ts) x, generate_series(1, weeks) k
   where x > now() - k * interval '7 days' - interval '90 minutes' and x <= now() - k * interval '7 days';

  -- The week, per India weekday and hour, from the same 8 weeks: {"mon:18": 42, ...} counted once.
  select coalesce(jsonb_object_agg(q.k, q.c), '{}'::jsonb), coalesce(max(q.c), 0) into counts, mx from (
    select to_char(x at time zone 'Asia/Kolkata', 'dy') || ':' || extract(hour from x at time zone 'Asia/Kolkata')::int as k,
           count(*)::int as c
      from unnest(ts) x
     where (x at time zone 'Asia/Kolkata')::date between today - 56 and today - 1
     group by 1
  ) q;
  for i in 1 .. 7 loop
    dk := dks[i];
    prev := dks[case when i = 1 then 7 else i - 1 end];
    open_h := public._busy_open_hours(hrs, dk, prev);
    arr := '[]'::jsonb;
    for h in 0 .. 23 loop
      c := coalesce((counts->>(dk || ':' || h))::int, 0);
      arr := arr || case
        when open_h is not null and not (h = any(open_h)) then 'null'::jsonb
        when c < 3 or mx = 0 then '0'::jsonb
        else to_jsonb(greatest(1, least(4, ceil(c::numeric * 4 / mx)::int)))
      end;
    end loop;
    week := week || jsonb_build_object(dk, arr);
  end loop;

  -- The level now.
  dk := to_char(now_ist, 'dy');
  prev := to_char(now_ist - interval '1 day', 'dy');
  now_open := public._busy_open_hours(hrs, dk, prev);
  if n_now = 0 and now_open is not null and not (extract(hour from now_ist)::int = any(now_open)) then
    lvl := 'closed';
  elsif n_now <= 2 or n_now < 0.7 * typical then
    lvl := 'quiet';
  elsif n_now >= 5 and n_now >= 1.3 * typical then
    lvl := 'busy';
  else
    lvl := 'normal';
  end if;
  about := case when n_now >= 5 then (round(n_now / 5.0) * 5)::int else null end;

  return jsonb_build_object('ok', true, 'gymId', gid::text, 'learning', false, 'level', lvl, 'about', about,
                            'weeks', weeks, 'week', week);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._busy_open_hours(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.member_gym_busy(text) from public;
grant execute on function public.member_gym_busy(text) to anon, authenticated;
