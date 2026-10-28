-- How busy the gym is test (0039). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be
-- pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

-- Run one statement: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t39_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t39_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- One check-in at gym g, at time t (visitedOn = its India day unless p_day says otherwise).
create or replace function pg_temp.t39_visit(g uuid, t timestamptz, p_extra jsonb default '{}'::jsonb,
                                             p_ms bigint default null, p_day text default null) returns void
  language sql as $$
  insert into public.crm_records(gym_id, kind, id, data, version)
  values (g, 'visit', 't39-' || gen_random_uuid()::text,
          jsonb_build_object('memberId', 't39-member-secret', 'visitedOn',
                             coalesce(p_day, to_char((t at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD')),
                             'checkedInAt', coalesce(p_ms, floor(extract(epoch from t) * 1000)::bigint), 'source', 'desk') || p_extra,
          1)
$$;

-- The India weekday key and hour of a moment.
create or replace function pg_temp.t39_slot(t timestamptz) returns text
  language sql as $$
  select to_char(t at time zone 'Asia/Kolkata', 'dy') || ':' || extract(hour from t at time zone 'Asia/Kolkata')::int
$$;

do $$
declare
  ga uuid; gb uuid;
  km text := 't39-member-a'; kmb text := 't39-member-b';
  fails text := ''; checks int := 0; r jsonb; k int; slot text; n int;
  closed jsonb := '{"kind":"closed","ranges":[]}';
  allday jsonb := '{"kind":"allDay","ranges":[]}';
  split jsonb := '{"kind":"hours","ranges":[{"open":"05:00","close":"11:00"},{"open":"16:00","close":"22:00"}]}';
  late jsonb := '{"kind":"hours","ranges":[{"open":"18:00","close":"02:00"}]}';
  wk jsonb;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T39 Gym', 'T39GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T39 Other', 'T39GYB', 1) returning gym_id into gb;
  insert into public.gym_members(gym_id, name, key_hash) values (ga, 'Asha', public._hash_key(km)), (gb, 'Zoya', public._hash_key(kmb));

  -- 1. No check-ins yet: still learning, nothing to show.
  r := public.member_gym_busy(km);
  checks := checks + 1; fails := fails || pg_temp.t39_is('1learning', (r->>'ok') || '/' || (r->>'learning') || '/' || coalesce(r->>'level', 'none') || '/' || coalesce(r->>'week', 'none'), 'true/true/none/none');
  checks := checks + 1; fails := fails || pg_temp.t39_is('1gym', r->>'gymId', ga::text);

  -- 2. History: 7 weeks, each with 5 check-ins 30 minutes before "now" on this weekday and 2 three hours
  --    before (49 in all: past the 40 a gym needs before anything shows).
  for k in 1 .. 7 loop
    for n in 1 .. 5 loop perform pg_temp.t39_visit(ga, now() - k * interval '7 days' - interval '30 minutes'); end loop;
    for n in 1 .. 2 loop perform pg_temp.t39_visit(ga, now() - k * interval '7 days' - interval '3 hours'); end loop;
  end loop;
  -- 39 is not enough: take one away (deleted) and the gym is still learning.
  update public.crm_records set deleted = true
   where gym_id = ga and kind = 'visit' and id = (select id from public.crm_records where gym_id = ga and kind = 'visit' order by id limit 1);
  update public.crm_records set deleted = true
   where gym_id = ga and kind = 'visit' and not deleted and id in (select id from public.crm_records where gym_id = ga and kind = 'visit' and not deleted order by id limit 9);
  checks := checks + 1; fails := fails || pg_temp.t39_is('2few', public.member_gym_busy(km)->>'learning', 'true');
  update public.crm_records set deleted = false where gym_id = ga and kind = 'visit';

  r := public.member_gym_busy(km);
  checks := checks + 1; fails := fails || pg_temp.t39_is('2ready', r->>'learning', 'false');
  checks := checks + 1; fails := fails || pg_temp.t39_is('2weeks', r->>'weeks', '8');
  -- The busiest hour of the week is 4; the 3-hours-before hour (14 against 35) is 2.
  slot := pg_temp.t39_slot(now() - interval '7 days' - interval '30 minutes');
  checks := checks + 1; fails := fails || pg_temp.t39_is('2peak', r->'week'->split_part(slot, ':', 1)->>(split_part(slot, ':', 2)::int), '4');
  slot := pg_temp.t39_slot(now() - interval '7 days' - interval '3 hours');
  checks := checks + 1; fails := fails || pg_temp.t39_is('2side', r->'week'->split_part(slot, ':', 1)->>(split_part(slot, ':', 2)::int), '2');
  checks := checks + 1; fails := fails || pg_temp.t39_is('2days', (select count(*)::text from jsonb_object_keys(r->'week')), '7');
  checks := checks + 1; fails := fails || pg_temp.t39_is('2hours', jsonb_array_length(r->'week'->'mon')::text, '24');

  -- 3. An hour with only 2 check-ins in all 8 weeks shows as 0 (one person's habit never shows).
  perform pg_temp.t39_visit(ga, now() - interval '7 days' - interval '5 hours');
  perform pg_temp.t39_visit(ga, now() - interval '14 days' - interval '5 hours');
  slot := pg_temp.t39_slot(now() - interval '7 days' - interval '5 hours');
  checks := checks + 1; fails := fails || pg_temp.t39_is('3rare', public.member_gym_busy(km)->'week'->split_part(slot, ':', 1)->>(split_part(slot, ':', 2)::int), '0');

  -- 4. Now (usual for these 90 minutes: 35 over 8 weeks = 4.4). Nobody in: quiet, no number.
  r := public.member_gym_busy(km);
  checks := checks + 1; fails := fails || pg_temp.t39_is('4none', (r->>'level') || '/' || coalesce(r->>'about', 'none'), 'quiet/none');
  -- Check-ins that do not count: no time (paper register), a time on another day than its date,
  -- a deleted one, one at another branch, one at another gym, one 2 hours ago.
  perform pg_temp.t39_visit(ga, now() - interval '10 minutes', '{}'::jsonb, 0);
  perform pg_temp.t39_visit(ga, now() - interval '10 minutes', '{}'::jsonb, null, '2001-01-01');
  perform pg_temp.t39_visit(ga, now() - interval '10 minutes', jsonb_build_object('atGymId', gb::text));
  perform pg_temp.t39_visit(gb, now() - interval '10 minutes');
  perform pg_temp.t39_visit(ga, now() - interval '2 hours');
  for n in 1 .. 4 loop perform pg_temp.t39_visit(ga, now() - interval '10 minutes'); end loop;
  update public.crm_records set deleted = true
   where gym_id = ga and kind = 'visit' and id = (select id from public.crm_records where gym_id = ga and kind = 'visit' and not deleted
                                                    and data->>'checkedInAt' <> '0' and (data->>'checkedInAt')::bigint > floor(extract(epoch from now() - interval '15 minutes') * 1000)
                                                    and data->>'atGymId' is null and data->>'visitedOn' <> '2001-01-01' order by id limit 1);
  -- 3 counted: under 0.7 x usual = quiet.
  r := public.member_gym_busy(km);
  checks := checks + 1; fails := fails || pg_temp.t39_is('4three', (r->>'level') || '/' || coalesce(r->>'about', 'none'), 'quiet/none');
  perform pg_temp.t39_visit(ga, now() - interval '5 minutes');
  -- 4: about usual = normal, still no number (under 5).
  r := public.member_gym_busy(km);
  checks := checks + 1; fails := fails || pg_temp.t39_is('4four', (r->>'level') || '/' || coalesce(r->>'about', 'none'), 'normal/none');
  for n in 1 .. 3 loop perform pg_temp.t39_visit(ga, now() - interval '80 minutes'); end loop;
  -- 7: 1.3 x usual or more and at least 5 = busy; the number is rounded to 5.
  r := public.member_gym_busy(km);
  checks := checks + 1; fails := fails || pg_temp.t39_is('4busy', (r->>'level') || '/' || coalesce(r->>'about', 'none'), 'busy/5');
  for n in 1 .. 6 loop perform pg_temp.t39_visit(ga, now() - interval '1 minute'); end loop;
  checks := checks + 1; fails := fails || pg_temp.t39_is('4about', public.member_gym_busy(km)->>'about', '15');
  -- Nothing about anyone leaves the server: only these keys, and no member id.
  r := public.member_gym_busy(km);
  checks := checks + 1; fails := fails || pg_temp.t39_is('4keys', (select string_agg(x, ',' order by x) from jsonb_object_keys(r) x), 'about,gymId,learning,level,ok,week,weeks');
  checks := checks + 1; fails := fails || pg_temp.t39_is('4private', (position('t39-member-secret' in r::text) > 0 or position('Asha' in r::text) > 0)::text, 'false');

  -- 5. The other gym's member sees only their own gym (one check-in there: still learning).
  r := public.member_gym_busy(kmb);
  checks := checks + 1; fails := fails || pg_temp.t39_is('5other', (r->>'gymId') || '/' || (r->>'learning'), gb::text || '/true');

  -- 6. The gym's hours: a closed hour is null, and closed now with nobody in says closed.
  update public.crm_records set deleted = true
   where gym_id = ga and kind = 'visit' and (data->>'checkedInAt')::bigint > floor(extract(epoch from now() - interval '100 minutes') * 1000);
  insert into public.gym_timings(gym_id, hours)
    values (ga, jsonb_build_object('week', jsonb_build_object('mon', closed, 'tue', closed, 'wed', closed, 'thu', closed, 'fri', closed, 'sat', closed, 'sun', closed)));
  r := public.member_gym_busy(km);
  checks := checks + 1; fails := fails || pg_temp.t39_is('6closed', r->>'level', 'closed');
  checks := checks + 1; fails := fails || pg_temp.t39_is('6nulls', (select count(*)::text from jsonb_array_elements(r->'week'->'mon') x where x <> 'null'::jsonb), '0');
  update public.gym_timings set hours = jsonb_build_object('week', jsonb_build_object('mon', allday, 'tue', allday, 'wed', allday, 'thu', allday, 'fri', allday, 'sat', allday, 'sun', allday))
   where gym_id = ga;
  r := public.member_gym_busy(km);
  checks := checks + 1; fails := fails || pg_temp.t39_is('6open', r->>'level', 'quiet');
  checks := checks + 1; fails := fails || pg_temp.t39_is('6all', (select count(*)::text from jsonb_array_elements(r->'week'->'mon') x where x <> 'null'::jsonb), '24');

  -- 7. Which hours are open: two ranges, a range past midnight (into the next morning), a midnight close.
  wk := jsonb_build_object('week', jsonb_build_object('mon', split, 'tue', '{"kind":"hours","ranges":[{"open":"05:30","close":"00:00"}]}'::jsonb,
          'wed', closed, 'thu', closed, 'fri', allday, 'sat', late, 'sun', closed));
  checks := checks + 1; fails := fails || pg_temp.t39_is('7split', public._busy_open_hours(wk, 'mon', 'sun')::text, '{5,6,7,8,9,10,16,17,18,19,20,21}');
  checks := checks + 1; fails := fails || pg_temp.t39_is('7midnight', array_length(public._busy_open_hours(wk, 'tue', 'mon'), 1)::text, '19');
  checks := checks + 1; fails := fails || pg_temp.t39_is('7late', public._busy_open_hours(wk, 'sat', 'fri')::text, '{18,19,20,21,22,23}');
  checks := checks + 1; fails := fails || pg_temp.t39_is('7morning', public._busy_open_hours(wk, 'sun', 'sat')::text, '{0,1}');
  checks := checks + 1; fails := fails || pg_temp.t39_is('7closed', public._busy_open_hours(wk, 'wed', 'tue')::text, '{}');
  checks := checks + 1; fails := fails || pg_temp.t39_is('7none', coalesce(public._busy_open_hours(null, 'wed', 'tue')::text, 'null'), 'null');

  -- 8. No member, or a member who left: BAD_KEY.
  checks := checks + 1; fails := fails || pg_temp.t39_is('8nobody', pg_temp.t39_run(format('select public.member_gym_busy(%L)', 'no-such-key')), 'BAD_KEY');
  perform public.member_leave(km);
  checks := checks + 1; fails := fails || pg_temp.t39_is('8left', pg_temp.t39_run(format('select public.member_gym_busy(%L)', km)), 'BAD_KEY');

  -- 9. Anyone may call the key-checked function; nobody may call the helper.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_gym_busy(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.member_gym_busy(text)', 'execute')
     or has_function_privilege('anon', 'public._busy_open_hours(jsonb, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public._busy_open_hours(jsonb, text, text)', 'execute') then fails := fails || ' 9'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
