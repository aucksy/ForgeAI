-- Check-in challenges test (0091, R-561 item 6: ready-made challenges). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- Fake numbers only (90000 91xxx).

-- Run one statement: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t89_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t89_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- A challenge as the owner would send it: starts `off` days from today, lasts `days` days.
create or replace function pg_temp.t89_ch(p_measure text, p_goal numeric, p_off int, p_days int, p_title text default 'Check-in habit') returns jsonb
  language sql as $$
  select jsonb_build_object('title', p_title, 'measure', p_measure, 'goal', p_goal,
    'startsOn', to_char((now() at time zone 'Asia/Kolkata')::date + p_off, 'YYYY-MM-DD'),
    'endsOn', to_char((now() at time zone 'Asia/Kolkata')::date + p_off + p_days - 1, 'YYYY-MM-DD'),
    'prizeDays', 7)
$$;

-- A visit on the gym's register for roster member `p_roster`, `p_ago` days ago (desk rows have any id).
create or replace function pg_temp.t89_visit(p_gym uuid, p_id text, p_roster text, p_ago int, p_deleted boolean default false) returns void
  language sql as $$
  insert into public.crm_records(gym_id, kind, id, data, version, deleted)
    values (p_gym, 'visit', p_id,
            jsonb_build_object('id', p_id, 'memberId', p_roster,
                               'visitedOn', to_char((now() at time zone 'Asia/Kolkata')::date - p_ago, 'YYYY-MM-DD'),
                               'checkedInAt', 0, 'source', 'desk'),
            1, p_deleted)
$$;

do $$
declare
  ga uuid; gb uuid; s_staff uuid;
  kok text := 't89-owner-key'; kob text := 't89-owner-b'; ks text := 't89-staff-session';
  kasha text := 't89-m-asha'; krahul text := 't89-m-rahul'; kpriya text := 't89-m-priya'; kneel text := 't89-m-neel';
  kbob text := 't89-m-bob';
  ma uuid; mr uuid; mp uuid; mn uuid; mb uuid;
  td date := (now() at time zone 'Asia/Kolkata')::date;
  fails text := ''; checks int := 0; r jsonb; cid uuid; cw uuid; e jsonb;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T91 Gym', 'T91GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T91 Other', 'T91GYB', 1) returning gym_id into gb;
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kok)), (gb, public._hash_key(kob));
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Ravi', '9000091090', 'staff') returning staff_id into s_staff;
  insert into public.gym_sessions(staff_id, key_hash) values (s_staff, public._hash_key(ks));

  -- The gym's own list (roster): Asha, Rahul, Neel. Neel's row is archived (not a live member).
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'member', 't89-r-asha', jsonb_build_object('fullName', 'Asha Rao', 'phone', '+91 90000 91001'), 1),
    (ga, 'member', 't89-r-rahul', jsonb_build_object('fullName', 'Rahul Jain', 'phone', '09000091002'), 1),
    (ga, 'member', 't89-r-neel', jsonb_build_object('fullName', 'Neel Shah', 'phone', '9000091004', 'archived', true), 1),
    (gb, 'member', 't89-r-bob', jsonb_build_object('fullName', 'Bob Das', 'phone', '9000091005'), 1);
  -- App members. Asha and Rahul checked in with the app before (their number is linked); Priya never did.
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (ga, 'Asha Rao', public._hash_key(kasha), '+919000091001') returning member_id into ma;
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (ga, 'Rahul Jain', public._hash_key(krahul), '+919000091002') returning member_id into mr;
  insert into public.gym_members(gym_id, name, key_hash) values (ga, 'Priya', public._hash_key(kpriya)) returning member_id into mp;
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (ga, 'Neel Shah', public._hash_key(kneel), '+919000091004') returning member_id into mn;
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gb, 'Bob Das', public._hash_key(kbob), '+919000091005') returning member_id into mb;

  -- Visits. Asha: today, 1, 2 and 3 days ago (QR and desk rows), two rows on one day, one deleted row, one a day
  -- before the challenge, one with a broken day. Rahul: 1 day. Neel (archived on the list): 3 days. Bob (gym B): 3 days.
  perform pg_temp.t89_visit(ga, 't89-r-asha:' || to_char(td, 'YYYY-MM-DD'), 't89-r-asha', 0);
  perform pg_temp.t89_visit(ga, 't89-v1', 't89-r-asha', 1);
  perform pg_temp.t89_visit(ga, 't89-v2', 't89-r-asha', 1);
  perform pg_temp.t89_visit(ga, 't89-v3', 't89-r-asha', 2);
  perform pg_temp.t89_visit(ga, 't89-v4', 't89-r-asha', 3, true);
  perform pg_temp.t89_visit(ga, 't89-v5', 't89-r-asha', 9);
  insert into public.crm_records(gym_id, kind, id, data, version)
    values (ga, 'visit', 't89-v6', jsonb_build_object('id', 't89-v6', 'memberId', 't89-r-asha', 'visitedOn', 'yesterday'), 1);
  perform pg_temp.t89_visit(ga, 't89-v7', 't89-r-rahul', 0);
  perform pg_temp.t89_visit(ga, 't89-v8', 't89-r-neel', 0);
  perform pg_temp.t89_visit(ga, 't89-v9', 't89-r-neel', 1);
  perform pg_temp.t89_visit(ga, 't89-v10', 't89-r-neel', 2);
  perform pg_temp.t89_visit(gb, 't89-v11', 't89-r-bob', 0);
  perform pg_temp.t89_visit(gb, 't89-v12', 't89-r-bob', 1);
  perform pg_temp.t89_visit(gb, 't89-v13', 't89-r-bob', 2);

  -- 1. The admin app learns that this file is in.
  r := public.owner_challenges(kok);
  checks := checks + 1; fails := fails || pg_temp.t89_is('1key', (r->>'checkins') || '/' || (r->>'autoRewards') || '/' || (r->>'canEdit'), 'true/true/true');

  -- 2. The rules for a check-in challenge: whole visits, 1 to 31, at most one a day; other measures still refused.
  checks := checks + 1; fails := fails || pg_temp.t89_is('2frac', pg_temp.t89_run(format('select public.owner_save_challenge(%L, %L)', kok, pg_temp.t89_ch('checkins', 2.5, 0, 7))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t89_is('2zero', pg_temp.t89_run(format('select public.owner_save_challenge(%L, %L)', kok, pg_temp.t89_ch('checkins', 0, 0, 7))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t89_is('2more', pg_temp.t89_run(format('select public.owner_save_challenge(%L, %L)', kok, pg_temp.t89_ch('checkins', 8, 0, 7))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t89_is('2over31', pg_temp.t89_run(format('select public.owner_save_challenge(%L, %L)', kok, pg_temp.t89_ch('checkins', 32, 0, 31))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t89_is('2steps', pg_temp.t89_run(format('select public.owner_save_challenge(%L, %L)', kok, pg_temp.t89_ch('steps', 3, 0, 7))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t89_is('2desk', pg_temp.t89_run(format('select public.owner_save_challenge(%L, %L)', ks, pg_temp.t89_ch('checkins', 3, 0, 7))), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t89_is('2none', (select count(*)::text from public.gym_challenges where gym_id = ga), '0');
  -- 31 visits in 31 days is the most there can be; one that starts later and is changed before it starts.
  r := public.owner_save_challenge(kok, pg_temp.t89_ch('checkins', 31, 10, 31, 'Every day'));
  checks := checks + 1; fails := fails || pg_temp.t89_is('2max', (select measure || '/' || goal::text from public.gym_challenges where id = (r->>'id')::uuid), 'checkins/31');
  checks := checks + 1; fails := fails || pg_temp.t89_is('2change', pg_temp.t89_run(format('select public.owner_save_challenge(%L, %L)', kok,
    pg_temp.t89_ch('checkins', 20, 10, 30, 'Every day') || jsonb_build_object('id', r->>'id'))), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t89_is('2changed', (select goal::text || '/' || (ends_on - starts_on + 1)::text from public.gym_challenges where id = (r->>'id')::uuid), '20/30');
  perform public.owner_cancel_challenge(kok, (r->>'id')::uuid);

  -- 3. A running check-in challenge (started 7 days ago? no: it may only start today) from today, 7 days, goal 3.
  --    Move its start back afterwards, the way 0037's test does, so the past visits fall inside.
  r := public.owner_save_challenge(kok, pg_temp.t89_ch('checkins', 3, 0, 7));
  cid := (r->>'id')::uuid;
  update public.gym_challenges set starts_on = td - 3, ends_on = td + 3 where id = cid;

  -- Asha: today, 1 day ago (two rows), 2 days ago = 3 visit days (the deleted row, the day before the start and the
  -- broken day do not count). She reached the goal. Rahul: 1. Priya: no linked number, 0. Neel: his number is on no
  -- live member of the list (archived), 0.
  r := public.member_board(kasha);
  checks := checks + 1; fails := fails || pg_temp.t89_is('3asha', (r->'challenge'->>'measure') || '/' || (r->'challenge'->>'myValue') || '/' || (r->'challenge'->>'hit') || '/' || (r->'challenge'->>'hitters'),
    'checkins/3/true/1');
  r := public.member_board(krahul);
  checks := checks + 1; fails := fails || pg_temp.t89_is('3rahul', (r->'challenge'->>'myValue') || '/' || (r->'challenge'->>'hit'), '1/false');
  r := public.member_board(kpriya);
  checks := checks + 1; fails := fails || pg_temp.t89_is('3priya', (r->'challenge'->>'myValue') || '/' || (r->'challenge'->>'hit') || '/' || (r->'challenge'->>'title'), '0/false/Check-in habit');
  r := public.member_board(kneel);
  checks := checks + 1; fails := fails || pg_temp.t89_is('3neel', r->'challenge'->>'myValue', '0');
  -- The leaderboard's own lists are untouched: nobody pushed a workout.
  checks := checks + 1; fails := fails || pg_temp.t89_is('3lists', (r->'workouts'->>'top') || '/' || (r->'kg'->>'top') || '/' || (r->>'members'), '[]/[]/0');

  -- The gym's view: 2 members took part (Asha and Rahul), Asha reached the goal with 3.
  r := public.owner_challenges(kok);
  e := (select x from jsonb_array_elements(r->'challenges') x where x->>'id' = cid::text);
  checks := checks + 1; fails := fails || pg_temp.t89_is('3owner', (e->>'status') || '/' || (e->>'measure') || '/' || (e->>'entrants') || '/' || jsonb_array_length(e->'hitters')::text
    || '/' || (e->'hitters'->0->>'name') || '/' || (e->'hitters'->0->>'value'), 'running/checkins/2/1/Asha Rao/3');
  -- The desk reads it too.
  r := public.owner_challenges(ks);
  checks := checks + 1; fails := fails || pg_temp.t89_is('3desk', (r->>'canEdit') || '/' || jsonb_array_length(r->'challenges')::text, 'false/2');

  -- A desk check-in for Rahul on two more days: 3, he reaches it too.
  perform pg_temp.t89_visit(ga, 't89-v14', 't89-r-rahul', 1);
  perform pg_temp.t89_visit(ga, 't89-v15', 't89-r-rahul', 2);
  r := public.member_board(krahul);
  checks := checks + 1; fails := fails || pg_temp.t89_is('3rahul3', (r->'challenge'->>'myValue') || '/' || (r->'challenge'->>'hit') || '/' || (r->'challenge'->>'hitters'), '3/true/2');

  -- Gym B sees nothing of gym A, and gym A's challenge counts none of gym B's visits.
  r := public.owner_challenges(kob);
  checks := checks + 1; fails := fails || pg_temp.t89_is('3gymB', jsonb_array_length(r->'challenges')::text, '0');
  r := public.member_board(kbob);
  checks := checks + 1; fails := fails || pg_temp.t89_is('3bob', coalesce(r->>'challenge', 'none'), 'none');

  -- 4. Over: the winners are kept with their numbers, entrants too, and each waits for the owner's Give (0048).
  update public.gym_challenges set starts_on = td - 9, ends_on = td - 1 where id = cid;
  -- Inside td - 9 .. td - 1: Asha 1, 1 (two rows), 2 and 9 days ago = 3 days. Rahul: 1 and 2 days ago = 2 days.
  r := public.owner_challenges(kok);
  e := (select x from jsonb_array_elements(r->'challenges') x where x->>'id' = cid::text);
  checks := checks + 1; fails := fails || pg_temp.t89_is('4kept', (e->>'status') || '/' || (e->>'entrants') || '/' || jsonb_array_length(e->'hitters')::text
    || '/' || (e->'hitters'->0->>'name') || '/' || (e->'hitters'->0->'reward'->>'state'), 'ended/2/1/Asha Rao/confirm');
  checks := checks + 1; fails := fails || pg_temp.t89_is('4row', (select (results_at is not null)::text || '/' || entrants::text from public.gym_challenges where id = cid), 'true/2');
  -- A late desk entry for Rahul inside the old dates does not make him a late winner, and his number stays under the goal.
  perform pg_temp.t89_visit(ga, 't89-v16', 't89-r-rahul', 5);
  r := public.member_board(krahul);
  checks := checks + 1; fails := fails || pg_temp.t89_is('4late', (r->'challenge'->>'myValue') || '/' || (r->'challenge'->>'hit') || '/' || (r->'challenge'->>'hitters'), '2/false/1');
  r := public.member_board(kasha);
  checks := checks + 1; fails := fails || pg_temp.t89_is('4asha', (r->'challenge'->>'myValue') || '/' || (r->'challenge'->>'hit'), '3/true');

  -- 5. Workouts are counted exactly as before (0037): a workouts challenge in gym B from the phone's days.
  r := public.owner_save_challenge(kob, pg_temp.t89_ch('workouts', 4, 0, 7, 'Workout habit'));
  cw := (r->>'id')::uuid;
  insert into public.gym_member_days(gym_id, member_id, day, workouts, kg) values (gb, mb, td, 2, 500), (gb, mb, td - 1, 1, 300);
  update public.gym_challenges set starts_on = td - 3, ends_on = td + 3 where id = cw;
  r := public.member_board(kbob);
  checks := checks + 1; fails := fails || pg_temp.t89_is('5workouts', (r->'challenge'->>'measure') || '/' || (r->'challenge'->>'myValue') || '/' || (r->'challenge'->>'hit'), 'workouts/3/false');
  update public.gym_challenges set measure = 'kg', goal = 800 where id = cw;
  r := public.member_board(kbob);
  checks := checks + 1; fails := fails || pg_temp.t89_is('5kg', (r->'challenge'->>'myValue') || '/' || (r->'challenge'->>'hit'), '800/true');
  r := public.owner_challenges(kob);
  checks := checks + 1; fails := fails || pg_temp.t89_is('5owner', (r->'challenges'->0->>'entrants') || '/' || jsonb_array_length(r->'challenges'->0->'hitters')::text, '1/1');

  -- 6. A member who leaves is not counted any more.
  update public.gym_challenges set measure = 'checkins', goal = 2 where id = cw;
  r := public.owner_challenges(kob);
  checks := checks + 1; fails := fails || pg_temp.t89_is('6before', (r->'challenges'->0->>'entrants') || '/' || jsonb_array_length(r->'challenges'->0->'hitters')::text, '1/1');
  perform public.member_leave(kbob);
  r := public.owner_challenges(kob);
  checks := checks + 1; fails := fails || pg_temp.t89_is('6left', (r->'challenges'->0->>'entrants') || '/' || jsonb_array_length(r->'challenges'->0->'hitters')::text, '0/0');

  -- 7. Grants: the calls stay as they were; the new helpers are private.
  checks := checks + 1; fails := fails || pg_temp.t89_is('7calls',
    (has_function_privilege('anon', 'public.owner_challenges(text)', 'execute')
     and has_function_privilege('anon', 'public.member_board(text)', 'execute')
     and has_function_privilege('anon', 'public.owner_save_challenge(text, jsonb)', 'execute'))::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t89_is('7private',
    (has_function_privilege('anon', 'public._challenge_checkin_days(uuid, date, date, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._challenge_checkin_days(uuid, date, date, uuid)', 'execute')
     or has_function_privilege('anon', 'public._challenge_value(public.gym_challenges, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._challenge_entrants(public.gym_challenges)', 'execute'))::text, 'false');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
