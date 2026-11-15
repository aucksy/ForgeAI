-- The member's start date at their gym test (0092, F218). Runs in CI after every migration (scripts/ci/db_checks.sh);
-- can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

-- Run one statement: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t92_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t92_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  ga uuid; gb uuid;
  ka text := 't92-member-asha'; kc text := 't92-member-chand'; kd text := 't92-member-dev';
  kf text := 't92-member-farah'; kn text := 't92-member-nobody'; kw text := 't92-member-wrongname';
  ko text := 't92-member-other-gym';
  fails text := ''; checks int := 0; r jsonb;
  td date := (now() at time zone 'Asia/Kolkata')::date;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T92 Gym', 'T92GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T92 Other', 'T92GYB', 1) returning gym_id into gb;
  insert into public.crm_records(gym_id, kind, id, data, version) values
    -- Asha: the gym typed her start date.
    (ga, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829092001","joinedOn":"2025-03-01"}', 1),
    -- Chand: no start date, two plans and an older cancelled one: the earliest plan not cancelled.
    (ga, 'member', 'm-chand', '{"fullName":"Chand Rao","phone":"+919829092002"}', 1),
    (ga, 'membership', 'ms-c1', '{"memberId":"m-chand","startsOn":"2026-05-01","endsOn":"2026-06-01","cancelled":false}', 1),
    (ga, 'membership', 'ms-c0', '{"memberId":"m-chand","startsOn":"2026-03-10","endsOn":"2026-04-10","cancelled":false}', 1),
    (ga, 'membership', 'ms-cx', '{"memberId":"m-chand","startsOn":"2025-01-01","endsOn":"2025-02-01","cancelled":true}', 1),
    -- Dev: neither a start date nor a plan.
    (ga, 'member', 'm-dev', '{"fullName":"Dev Patel","phone":"+919829092003"}', 1),
    -- Farah: a start date typed ahead of today.
    (ga, 'member', 'm-farah', format('{"fullName":"Farah Ali","phone":"+919829092004","joinedOn":"%s"}', to_char(td + 10, 'YYYY-MM-DD'))::jsonb, 1),
    -- Wasim on the list, but the app member gave another first name.
    (ga, 'member', 'm-wasim', '{"fullName":"Wasim Khan","phone":"+919829092005","joinedOn":"2024-06-01"}', 1),
    -- The same number as Asha at ANOTHER gym, with an older start: never read for Asha's key.
    (gb, 'member', 'm-asha-b', '{"fullName":"Asha Verma","phone":"+919829092001","joinedOn":"2023-01-01"}', 1),
    (gb, 'member', 'm-other', '{"fullName":"Om Joshi","phone":"+919829092007","joinedOn":"2024-02-02"}', 1);
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values
    (ga, 'Asha', '+919829092001', public._hash_key(ka)),
    (ga, 'Chand', '+919829092002', public._hash_key(kc)),
    (ga, 'Dev', '+919829092003', public._hash_key(kd)),
    (ga, 'Farah', '+919829092004', public._hash_key(kf)),
    (ga, 'Nobody', '+919829092006', public._hash_key(kn)),
    (ga, 'Imran', '+919829092005', public._hash_key(kw)),
    (gb, 'Om', '+919829092007', public._hash_key(ko));

  -- 1. The gym's own start date.
  r := public.member_join_day(ka);
  checks := checks + 1; fails := fails || pg_temp.t92_is('1typed', (r->>'ok') || '/' || coalesce(r->>'joinedOn', 'null'), 'true/2025-03-01');

  -- 2. No start date: the first day of the earliest plan not cancelled.
  checks := checks + 1; fails := fails || pg_temp.t92_is('2plan', public.member_join_day(kc)->>'joinedOn', '2026-03-10');

  -- 3. Neither: null (the phone keeps today's way), no error.
  r := public.member_join_day(kd);
  checks := checks + 1; fails := fails || pg_temp.t92_is('3none', (r->>'ok') || '/' || coalesce(r->>'joinedOn', 'null'), 'true/null');

  -- 4. A day after today is never given.
  checks := checks + 1; fails := fails || pg_temp.t92_is('4ahead', coalesce(public.member_join_day(kf)->>'joinedOn', 'null'), 'null');

  -- 5. Not one person on the gym's list: null, with 0035's reason.
  r := public.member_join_day(kn);
  checks := checks + 1; fails := fails || pg_temp.t92_is('5notlisted', coalesce(r->>'joinedOn', 'null') || '/' || (r->>'why'), 'null/NOT_ON_ROSTER');
  r := public.member_join_day(kw);
  checks := checks + 1; fails := fails || pg_temp.t92_is('5name', coalesce(r->>'joinedOn', 'null') || '/' || (r->>'why'), 'null/NAME_MISMATCH');

  -- 6. Each gym answers only for its own list: the other gym's older day never reaches Asha; Om gets his own gym's.
  checks := checks + 1; fails := fails || pg_temp.t92_is('6own', public.member_join_day(ka)->>'joinedOn', '2025-03-01');
  checks := checks + 1; fails := fails || pg_temp.t92_is('6other', public.member_join_day(ko)->>'joinedOn', '2024-02-02');

  -- 7. The gym changes the date: the next answer has it. A deleted member record is not read.
  update public.crm_records set data = data || '{"joinedOn":"2025-04-15"}' where gym_id = ga and id = 'm-asha';
  checks := checks + 1; fails := fails || pg_temp.t92_is('7changed', public.member_join_day(ka)->>'joinedOn', '2025-04-15');
  update public.crm_records set deleted = true where gym_id = ga and id = 'm-dev';
  checks := checks + 1; fails := fails || pg_temp.t92_is('7deleted', coalesce(public.member_join_day(kd)->>'joinedOn', 'null'), 'null');

  -- 8. A bad key: BAD_KEY. Left the gym: the key no longer works.
  checks := checks + 1; fails := fails || pg_temp.t92_is('8badkey', pg_temp.t92_run(format('select public.member_join_day(%L)', 'nope')), 'BAD_KEY');
  perform public.member_leave(kc);
  checks := checks + 1; fails := fails || pg_temp.t92_is('8left', pg_temp.t92_run(format('select public.member_join_day(%L)', kc)), 'BAD_KEY');

  -- 9. It changes nothing (read only): the gym's records are as before.
  checks := checks + 1; fails := fails || pg_temp.t92_is('9readonly',
    (select count(*)::text from public.crm_records where gym_id = ga and kind = 'membership' and not deleted), '3');

  -- 10. Anyone may call the key-checked function.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_join_day(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.member_join_day(text)', 'execute') then fails := fails || ' 10fn'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
