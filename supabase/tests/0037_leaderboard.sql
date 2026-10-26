-- Gym leaderboard and challenge test (0037, R-133). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

-- Run one statement: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t37_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t37_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- A list as text: "rank name value, ..." (the name is the full name for the gym, 'A member' etc. for members).
create or replace function pg_temp.t37_list(j jsonb) returns text
  language sql as $$
  select coalesce(string_agg((e->>'rank') || ' ' || (e->>'name') || ' ' || trim_scale((e->>'value')::numeric)::text, ', ' order by ord), '')
    from jsonb_array_elements(j->'top') with ordinality t(e, ord)
$$;

-- A member's own place: "rank value" or 'none'.
create or replace function pg_temp.t37_me(j jsonb) returns text
  language sql as $$
  select case when j->'me' = 'null'::jsonb then 'none' else (j->'me'->>'rank') || ' ' || trim_scale((j->'me'->>'value')::numeric)::text end
$$;

-- Give a member `total` workouts, three a day from today backwards, `kgday` kg a day (straight into the table).
create or replace function pg_temp.t37_give(p_member uuid, p_total int, p_kgday numeric) returns void
  language plpgsql as $$
declare left_ int := p_total; i int := 0; g uuid;
begin
  select gym_id into g from public.gym_members where member_id = p_member;
  while left_ > 0 loop
    insert into public.gym_member_days(gym_id, member_id, day, workouts, kg)
      values (g, p_member, (now() at time zone 'Asia/Kolkata')::date - i, least(3, left_), p_kgday);
    left_ := left_ - 3; i := i + 1;
  end loop;
end $$;

-- A challenge as the owner would send it: starts `off` days from today, lasts `days` days.
create or replace function pg_temp.t37_ch(p_off int, p_days int, p_extra jsonb default '{}') returns jsonb
  language sql as $$
  select jsonb_build_object('title', 'Hit the goal', 'measure', 'workouts', 'goal', 2,
    'startsOn', to_char((now() at time zone 'Asia/Kolkata')::date + p_off, 'YYYY-MM-DD'),
    'endsOn', to_char((now() at time zone 'Asia/Kolkata')::date + p_off + p_days - 1, 'YYYY-MM-DD'),
    'prizeDays', 7) || p_extra
$$;

-- Push as a phone would, a while after its last push (the server ignores a repeat within 15 seconds).
create or replace function pg_temp.t37_push(p_key text, p_days jsonb, p_show boolean) returns jsonb
  language plpgsql as $$
begin
  update public.gym_member_board set updated_at = now() - interval '1 minute'
   where member_id = (select member_id from public.gym_members where key_hash = public._hash_key(p_key));
  return public.member_board_push(p_key, p_days, p_show);
end $$;

-- Let a gym's clean-up run again (it runs at most once a minute per gym).
create or replace function pg_temp.t37_age_meta(p_gym uuid) returns void
  language sql as $$
  update public.gym_board_meta set cleaned_at = now() - interval '2 minutes' where gym_id = p_gym
$$;

do $$
declare
  ga uuid; gb uuid; gc uuid; s_owner uuid; s_staff uuid; s_owner_c uuid;
  kop text := 't37-owner-session'; ks text := 't37-staff-session'; kok text := 't37-owner-key'; kob text := 't37-owner-b';
  kcc text := 't37-owner-c';
  kasha text := 't37-m-asha'; krahul text := 't37-m-rahul'; kpriya text := 't37-m-priya'; kanil text := 't37-m-anil';
  kdev text := 't37-m-dev'; kzoya text := 't37-m-zoya';
  ma uuid; mr uuid; mp uuid; mk uuid; mw uuid; mz uuid;
  td date := (now() at time zone 'Asia/Kolkata')::date;
  fails text := ''; checks int := 0; r jsonb; q jsonb; cid1 uuid; cid_adj uuid; cid31 uuid; cid_far uuid; cid_b uuid; cid_c uuid; cid_over uuid; cid_over2 uuid;
  names text[] := array['Aarav','Bhavna','Chirag','Divya','Esha','Farhan','Gita','Hari','Ishaan','Jaya','Kabir','Lata','Mohan'];
  totals int[] := array[30,25,25,20,19,18,17,16,15,14,13,10,0];
  cm uuid[] := '{}'; i int; id_ uuid; bad text; d jsonb; days jsonb;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T37 Gym', 'T37GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T37 Other', 'T37GYB', 1) returning gym_id into gb;
  insert into public.gyms(name, join_code, crm_version) values ('T37 Ranks', 'T37GYC', 1) returning gym_id into gc;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner', '9876500371', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Ravi', '9876500372', 'staff') returning staff_id into s_staff;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_staff, public._hash_key(ks));
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kok)), (gb, public._hash_key(kob)), (gc, public._hash_key(kcc));

  -- Gym A: five members, joined in this order (it breaks ties); Dev has a phone number.
  insert into public.gym_members(gym_id, name, phone, key_hash, joined_at) values (ga, 'Asha Verma', '9800000371', public._hash_key(kasha), now() - interval '5 hours') returning member_id into ma;
  insert into public.gym_members(gym_id, name, key_hash, joined_at) values (ga, 'Rahul Sharma', public._hash_key(krahul), now() - interval '4 hours') returning member_id into mr;
  insert into public.gym_members(gym_id, name, key_hash, joined_at) values (ga, 'Priya', public._hash_key(kpriya), now() - interval '3 hours') returning member_id into mp;
  insert into public.gym_members(gym_id, name, key_hash, joined_at) values (ga, 'Anil  Kumar verma', public._hash_key(kanil), now() - interval '2 hours') returning member_id into mk;
  insert into public.gym_members(gym_id, name, phone, key_hash, joined_at) values (ga, 'Dev Singh', '9800000372', public._hash_key(kdev), now() - interval '1 hour') returning member_id into mw;
  insert into public.gym_members(gym_id, name, key_hash) values (gb, 'Zoya', public._hash_key(kzoya)) returning member_id into mz;

  -- 1. Nothing pushed: an empty board; no challenge.
  r := public.member_board(kasha);
  checks := checks + 1; fails := fails || pg_temp.t37_is('1ok', (r->>'ok') || '/' || (r->>'gymName') || '/' || (r->>'members') || '/' || (r->'workouts'->>'top') || '/' || coalesce(r->'workouts'->>'me', '-') || '/' || coalesce(r->>'challenge', '-'), 'true/T37 Gym/0/[]/-/-');
  checks := checks + 1; fails := fails || pg_temp.t37_is('1kg', (r->'kg'->>'top') || '/' || pg_temp.t37_me(r->'kg'), '[]/none');

  -- 2. A push REPLACES the member's days for the window it covers.
  checks := checks + 1; fails := fails || pg_temp.t37_is('2push', pg_temp.t37_push(kasha,
    jsonb_build_array(jsonb_build_object('d', to_char(td - 3, 'YYYY-MM-DD'), 'w', 1, 'kg', 100),
                      jsonb_build_object('d', to_char(td - 2, 'YYYY-MM-DD'), 'w', 1, 'kg', 100),
                      jsonb_build_object('d', to_char(td - 1, 'YYYY-MM-DD'), 'w', 1, 'kg', 100)), false)::text, '{"ok": true}');
  r := public.member_board(kasha);
  checks := checks + 1; fails := fails || pg_temp.t37_is('2first', pg_temp.t37_list(r->'workouts') || '/' || pg_temp.t37_me(r->'workouts'), '1 A member 3/1 3');
  perform pg_temp.t37_push(kasha,
    jsonb_build_array(jsonb_build_object('d', to_char(td, 'YYYY-MM-DD'), 'w', 2, 'kg', 1200.5),
                      jsonb_build_object('d', to_char(td - 1, 'YYYY-MM-DD'), 'w', 1, 'kg', 800)), false);
  checks := checks + 1; fails := fails || pg_temp.t37_is('2rows', (select count(*)::text from public.gym_member_days where member_id = ma), '2');
  checks := checks + 1; fails := fails || pg_temp.t37_is('2gone', (select count(*)::text from public.gym_member_days where member_id = ma and day = td - 3), '0');
  r := public.member_board(kasha);
  checks := checks + 1; fails := fails || pg_temp.t37_is('2kg', pg_temp.t37_list(r->'kg'), '1 A member 2000.5');
  -- An empty push clears the member's days.
  perform pg_temp.t37_push(krahul, '[]'::jsonb, true);
  checks := checks + 1; fails := fails || pg_temp.t37_is('2empty', (select count(*)::text from public.gym_member_days where member_id = mr), '0');

  -- 3. What the server does not believe is left out (use Zoya, gym B).
  days := jsonb_build_array(
    jsonb_build_object('d', to_char(td - 1, 'YYYY-MM-DD'), 'w', 4, 'kg', 100),           -- more than 3 workouts
    jsonb_build_object('d', to_char(td - 2, 'YYYY-MM-DD'), 'w', 2, 'kg', 60001),         -- more than 60000 kg
    jsonb_build_object('d', to_char(td - 3, 'YYYY-MM-DD'), 'w', 1, 'kg', -50),           -- negative kg counts 0
    jsonb_build_object('d', to_char(td - 32, 'YYYY-MM-DD'), 'w', 1, 'kg', 10),           -- too old
    jsonb_build_object('d', to_char(td + 2, 'YYYY-MM-DD'), 'w', 1, 'kg', 10),            -- too far ahead
    jsonb_build_object('d', to_char(td + 1, 'YYYY-MM-DD'), 'w', 1, 'kg', 10),            -- tomorrow (the phone may be ahead): kept
    jsonb_build_object('d', to_char(td - 4, 'YYYY-MM-DD'), 'w', 0, 'kg', 0),             -- nothing: not kept
    jsonb_build_object('d', to_char(td - 5, 'YYYY-MM-DD'), 'w', 3, 'kg', 60000),         -- the largest believed day
    jsonb_build_object('d', to_char(td - 6, 'YYYY-MM-DD'), 'w', 1.9, 'kg', 10.26),       -- whole workouts, kg to 0.1
    jsonb_build_object('d', to_char(td - 7, 'YYYY-MM-DD'), 'w', 1, 'kg', 5),             -- the same date twice: the last wins
    jsonb_build_object('d', to_char(td - 7, 'YYYY-MM-DD'), 'w', 2, 'kg', 6));
  perform pg_temp.t37_push(kzoya, days, false);
  checks := checks + 1; fails := fails || pg_temp.t37_is('3rows', (select string_agg(to_char(day - td, 'FM999') || ':' || workouts || ':' || trim_scale(kg), ' ' order by day)
    from public.gym_member_days where member_id = mz), '-7:2:6 -6:1:10.3 -5:3:60000 -3:1:0 1:1:10');
  -- Refused pushes change nothing.
  foreach bad in array array[
      'null', '{"d":"2026-01-01"}', '"x"', '[1]',
      '[{"d":"2026-02-30","w":1,"kg":1}]', '[{"d":"tomorrow","w":1,"kg":1}]', '[{"d":"2026-01-01","w":"1","kg":1}]',
      '[{"d":"2026-01-01","w":1}]', '[{"w":1,"kg":1}]'] loop
    checks := checks + 1; fails := fails || pg_temp.t37_is('3bad:' || bad, pg_temp.t37_run(format('select pg_temp.t37_push(%L, %L::jsonb, false)', kzoya, bad)), 'INVALID');
  end loop;
  checks := checks + 1; fails := fails || pg_temp.t37_is('3many', pg_temp.t37_run(format('select pg_temp.t37_push(%L, %L::jsonb, false)', kzoya,
    (select jsonb_agg(jsonb_build_object('d', to_char(td - n, 'YYYY-MM-DD'), 'w', 1, 'kg', 1)) from generate_series(0, 40) n))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t37_is('3forty', pg_temp.t37_run(format('select pg_temp.t37_push(%L, %L::jsonb, false)', kzoya,
    (select jsonb_agg(jsonb_build_object('d', to_char(td - n, 'YYYY-MM-DD'), 'w', 1, 'kg', 1)) from generate_series(0, 39) n))), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t37_is('3noshow', pg_temp.t37_run(format('select pg_temp.t37_push(%L, ''[]''::jsonb, null)', kzoya)), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t37_is('3kept', (select count(*)::text from public.gym_member_days where member_id = mz), '32');
  perform pg_temp.t37_push(kzoya, '[]'::jsonb, false);

  -- 4. Names: opt-in. "Rahul S.", one word as it is, the LAST word's initial, otherwise 'A member'.
  perform pg_temp.t37_push(krahul, jsonb_build_array(jsonb_build_object('d', to_char(td, 'YYYY-MM-DD'), 'w', 1, 'kg', 500)), true);
  perform pg_temp.t37_push(kpriya, jsonb_build_array(jsonb_build_object('d', to_char(td - 2, 'YYYY-MM-DD'), 'w', 1, 'kg', 700)), true);
  perform pg_temp.t37_push(kanil, jsonb_build_array(jsonb_build_object('d', to_char(td - 5, 'YYYY-MM-DD'), 'w', 1, 'kg', 50)), true);
  -- Window edges: the window is the last 30 days ending today, so td-29 counts and td-30 does not.
  perform pg_temp.t37_push(kdev, jsonb_build_array(
    jsonb_build_object('d', to_char(td, 'YYYY-MM-DD'), 'w', 3, 'kg', 300),
    jsonb_build_object('d', to_char(td - 29, 'YYYY-MM-DD'), 'w', 1, 'kg', 100),
    jsonb_build_object('d', to_char(td - 30, 'YYYY-MM-DD'), 'w', 2, 'kg', 200)), false);
  checks := checks + 1; fails := fails || pg_temp.t37_is('4rows', (select count(*)::text from public.gym_member_days where member_id = mw), '3');
  r := public.member_board(kasha);
  checks := checks + 1; fails := fails || pg_temp.t37_is('4workouts', pg_temp.t37_list(r->'workouts'),
    '1 A member 4, 2 A member 3, 3 Rahul S. 1, 3 Priya 1, 3 Anil V. 1');
  checks := checks + 1; fails := fails || pg_temp.t37_is('4kg', pg_temp.t37_list(r->'kg'),
    '1 A member 2000.5, 2 Priya 700, 3 Rahul S. 500, 4 A member 400, 5 Anil V. 50');
  checks := checks + 1; fails := fails || pg_temp.t37_is('4me', pg_temp.t37_me(r->'workouts') || '/' || (r->'workouts'->'top'->1->>'me') || '/' || (r->'workouts'->'top'->0->>'me'), '2 3/true/false');
  checks := checks + 1; fails := fails || pg_temp.t37_is('4members', r->>'members', '5');
  -- Switching the name off again.
  perform pg_temp.t37_push(krahul, jsonb_build_array(jsonb_build_object('d', to_char(td, 'YYYY-MM-DD'), 'w', 1, 'kg', 500)), false);
  checks := checks + 1; fails := fails || pg_temp.t37_is('4off', pg_temp.t37_list(public.member_board(kasha)->'kg'),
    '1 A member 2000.5, 2 Priya 700, 3 A member 500, 4 A member 400, 5 Anil V. 50');
  perform pg_temp.t37_push(krahul, jsonb_build_array(jsonb_build_object('d', to_char(td, 'YYYY-MM-DD'), 'w', 1, 'kg', 500)), true);
  -- Another gym's member sees none of gym A.
  r := public.member_board(kzoya);
  checks := checks + 1; fails := fails || pg_temp.t37_is('4other', (r->>'gymName') || '/' || (r->>'members') || '/' || (r->'workouts'->>'top'), 'T37 Other/0/[]');
  -- The gym sees full names, phone numbers and the same two lists.
  r := public.owner_board(ks);
  checks := checks + 1; fails := fails || pg_temp.t37_is('4gym', pg_temp.t37_list(r->'workouts'),
    '1 Dev Singh 4, 2 Asha Verma 3, 3 Rahul Sharma 1, 3 Priya 1, 3 Anil Kumar verma 1');
  checks := checks + 1; fails := fails || pg_temp.t37_is('4phone', (r->'workouts'->'top'->0->>'phone') || '/' || (r->'workouts'->'top'->0->>'hidden') || '/' || (r->>'canEdit'), '9800000372/false/false');
  checks := checks + 1; fails := fails || pg_temp.t37_is('4owner', public.owner_board(kop)->>'canEdit', 'true');

  -- 5. Ranks and the top 10 (gym C: 13 members; Mohan has nothing, Aarav and Bhavna show their names).
  for i in 1..13 loop
    insert into public.gym_members(gym_id, name, phone, key_hash, joined_at)
      values (gc, names[i] || ' Test', '98765001' || lpad(i::text, 2, '0'), public._hash_key('t37-c-' || i), now() - interval '1 day' + i * interval '1 minute')
      returning member_id into id_;
    cm := cm || id_;
    perform pg_temp.t37_give(id_, totals[i], case when i = 12 then 20000 else 1000 end);
  end loop;
  insert into public.gym_member_board(gym_id, member_id, show_name) values (gc, cm[1], true), (gc, cm[2], true);
  r := public.member_board('t37-c-4');
  checks := checks + 1; fails := fails || pg_temp.t37_is('5workouts', pg_temp.t37_list(r->'workouts'),
    '1 Aarav T. 30, 2 Bhavna T. 25, 2 A member 25, 4 A member 20, 5 A member 19, 6 A member 18, 7 A member 17, 8 A member 16, 9 A member 15, 10 A member 14');
  checks := checks + 1; fails := fails || pg_temp.t37_is('5ten', jsonb_array_length(r->'workouts'->'top')::text, '10');
  checks := checks + 1; fails := fails || pg_temp.t37_is('5me4', pg_temp.t37_me(r->'workouts'), '4 20');
  checks := checks + 1; fails := fails || pg_temp.t37_is('5members', r->>'members', '12');
  -- Outside the top 10: your place and number. A member with 0: not on the board.
  checks := checks + 1; fails := fails || pg_temp.t37_is('5me11', pg_temp.t37_me(public.member_board('t37-c-11')->'workouts'), '11 13');
  checks := checks + 1; fails := fails || pg_temp.t37_is('5me12', pg_temp.t37_me(public.member_board('t37-c-12')->'workouts'), '12 10');
  checks := checks + 1; fails := fails || pg_temp.t37_is('5me13', pg_temp.t37_me(public.member_board('t37-c-13')->'workouts'), 'none');
  checks := checks + 1; fails := fails || pg_temp.t37_is('5nobody13', (select count(*)::text from jsonb_array_elements(r->'workouts'->'top') e where e->>'value' = '0'), '0');
  -- The kg list is its own ranking; ten rows even when the tie at the end is longer.
  checks := checks + 1; fails := fails || pg_temp.t37_is('5kg', pg_temp.t37_list(r->'kg'),
    '1 A member 80000, 2 Aarav T. 10000, 3 Bhavna T. 9000, 3 A member 9000, 5 A member 7000, 5 A member 7000, 7 A member 6000, 7 A member 6000, 7 A member 6000, 10 A member 5000');
  checks := checks + 1; fails := fails || pg_temp.t37_is('5kgme', pg_temp.t37_me(public.member_board('t37-c-11')->'kg'), '10 5000');

  -- 6. A member the gym hid: in nobody's top 10, still sees their own place; the gym still sees them marked.
  checks := checks + 1; fails := fails || pg_temp.t37_is('6hide', pg_temp.t37_run(format('select public.owner_hide_on_board(%L, %L, true)', kcc, cm[1])), 'ok');
  r := public.member_board('t37-c-4');
  checks := checks + 1; fails := fails || pg_temp.t37_is('6others', pg_temp.t37_list(r->'workouts'),
    '1 Bhavna T. 25, 1 A member 25, 3 A member 20, 4 A member 19, 5 A member 18, 6 A member 17, 7 A member 16, 8 A member 15, 9 A member 14, 10 A member 13');
  checks := checks + 1; fails := fails || pg_temp.t37_is('6meDivya', pg_temp.t37_me(r->'workouts'), '3 20');
  checks := checks + 1; fails := fails || pg_temp.t37_is('6mine', pg_temp.t37_me(public.member_board('t37-c-1')->'workouts') || '/' || pg_temp.t37_me(public.member_board('t37-c-1')->'kg'), '1 30/2 10000');
  checks := checks + 1; fails := fails || pg_temp.t37_is('6inkg', (pg_temp.t37_list(public.member_board('t37-c-4')->'kg') like '%Aarav%')::text, 'false');
  r := public.owner_board(kcc);
  checks := checks + 1; fails := fails || pg_temp.t37_is('6gym', left(pg_temp.t37_list(r->'workouts'), 33), '1 Aarav Test 30, 2 Bhavna Test 25');
  checks := checks + 1; fails := fails || pg_temp.t37_is('6flag', (r->'workouts'->'top'->0->>'hidden') || '/' || (r->'workouts'->'top'->1->>'hidden'), 'true/false');
  checks := checks + 1; fails := fails || pg_temp.t37_is('6list', (r->'hiddenMembers'->0->>'name') || '/' || jsonb_array_length(r->'hiddenMembers')::text, 'Aarav Test/1');
  perform public.owner_hide_on_board(kcc, cm[1], false);
  checks := checks + 1; fails := fails || pg_temp.t37_is('6undo', left(pg_temp.t37_list(public.member_board('t37-c-4')->'workouts'), 29) || '/' || jsonb_array_length(public.owner_board(kcc)->'hiddenMembers')::text, '1 Aarav T. 30, 2 Bhavna T. 25/0');
  -- Hiding is the owner's alone; a made-up person or another gym's member is refused.
  checks := checks + 1; fails := fails || pg_temp.t37_is('6desk', pg_temp.t37_run(format('select public.owner_hide_on_board(%L, %L, true)', ks, ma)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t37_is('6deskread', jsonb_array_length(public.owner_board(ks)->'workouts'->'top')::text, '5');
  checks := checks + 1; fails := fails || pg_temp.t37_is('6other', pg_temp.t37_run(format('select public.owner_hide_on_board(%L, %L, true)', kob, ma)), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t37_is('6nobody', pg_temp.t37_run(format('select public.owner_hide_on_board(%L, %L, true)', kok, gen_random_uuid())), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t37_is('6null', pg_temp.t37_run(format('select public.owner_hide_on_board(%L, %L, null)', kok, ma)), 'INVALID');

  -- 7. Days older than 62 days are deleted by the first read or push of the gym in each minute (no push needed).
  insert into public.gym_member_days(gym_id, member_id, day, workouts, kg) values
    (gc, cm[13], td - 70, 1, 1), (gc, cm[13], td - 63, 1, 1), (gc, cm[13], td - 62, 1, 1);
  perform public.member_board('t37-c-4');  -- the gym's clean-up already ran in this minute: nothing yet
  checks := checks + 1; fails := fails || pg_temp.t37_is('7throttle', (select count(*)::text from public.gym_member_days where member_id = cm[13]), '3');
  perform pg_temp.t37_age_meta(gc);
  perform public.member_board('t37-c-4');
  checks := checks + 1; fails := fails || pg_temp.t37_is('7read', (select string_agg(to_char(day - td, 'FM999'), ',' order by day) from public.gym_member_days where member_id = cm[13]), '-62');
  insert into public.gym_member_days(gym_id, member_id, day, workouts, kg) values (gc, cm[13], td - 80, 1, 1);
  perform pg_temp.t37_age_meta(gc);
  perform public.owner_board(kcc);
  checks := checks + 1; fails := fails || pg_temp.t37_is('7ownerBoard', (select count(*)::text from public.gym_member_days where member_id = cm[13] and day < td - 62), '0');
  insert into public.gym_member_days(gym_id, member_id, day, workouts, kg) values (gc, cm[13], td - 81, 1, 1);
  perform pg_temp.t37_age_meta(gc);
  perform public.owner_challenges(kcc);
  checks := checks + 1; fails := fails || pg_temp.t37_is('7ownerChallenges', (select count(*)::text from public.gym_member_days where member_id = cm[13] and day < td - 62), '0');
  insert into public.gym_member_days(gym_id, member_id, day, workouts, kg) values (gc, cm[13], td - 82, 1, 1);
  perform pg_temp.t37_age_meta(gc);
  perform pg_temp.t37_push('t37-c-13', '[]'::jsonb, false);
  checks := checks + 1; fails := fails || pg_temp.t37_is('7push', (select count(*)::text from public.gym_member_days where member_id = cm[13] and day < td - 62), '0');
  checks := checks + 1; fails := fails || pg_temp.t37_is('7kept', (select count(*)::text from public.gym_member_days where member_id = cm[13]), '1');
  checks := checks + 1; fails := fails || pg_temp.t37_is('7others', (select count(*)::text from public.gym_member_days where member_id = cm[1]), '10');
  -- Reading never fails or deletes anything else: Aarav's numbers are the same.
  checks := checks + 1; fails := fails || pg_temp.t37_is('7same', pg_temp.t37_me(public.member_board('t37-c-1')->'workouts'), '1 30');
  -- 8. The challenge rules (gym A, owner session). Members of A today: Dev 3, Asha 2 workouts; Rahul 1.
  r := public.owner_save_challenge(kop, pg_temp.t37_ch(0, 14));
  cid1 := (r->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t37_is('8id', (cid1 is not null)::text, 'true');
  r := public.owner_challenges(ks);
  checks := checks + 1; fails := fails || pg_temp.t37_is('8desk', (r->>'canEdit') || '/' || jsonb_array_length(r->'challenges')::text || '/' || (r->'challenges'->0->>'status') || '/' || (r->'challenges'->0->>'createdByName'), 'false/1/running/Owner');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8owner', public.owner_challenges(kop)->>'canEdit', 'true');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8shape', (r->'challenges'->0->>'title') || '/' || (r->'challenges'->0->>'measure') || '/' || (r->'challenges'->0->>'goal') || '/' || (r->'challenges'->0->>'prizeDays')
    || '/' || (r->'challenges'->0->>'startsOn') || '/' || (r->'challenges'->0->>'endsOn'), 'Hit the goal/workouts/2/7/' || to_char(td, 'YYYY-MM-DD') || '/' || to_char(td + 13, 'YYYY-MM-DD'));
  -- Who hit the goal: everyone at 2 workouts or more inside its dates, with phone and value; 3 people took part.
  checks := checks + 1; fails := fails || pg_temp.t37_is('8hitters', (select string_agg((h->>'name') || ' ' || coalesce(h->>'phone', '-') || ' ' || (h->>'value'), ', ' order by o)
    from jsonb_array_elements(r->'challenges'->0->'hitters') with ordinality t(h, o)), 'Dev Singh 9800000372 3, Asha Verma 9800000371 2');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8entrants', r->'challenges'->0->>'entrants', '3');
  -- What the member sees.
  q := public.member_board(kasha)->'challenge';
  checks := checks + 1; fails := fails || pg_temp.t37_is('8member', (q->>'title') || '/' || (q->>'myValue') || '/' || (q->>'hit') || '/' || (q->>'hitters') || '/' || (q->>'goal') || '/' || (q->>'prizeDays'), 'Hit the goal/2/true/2/2/7');
  q := public.member_board(krahul)->'challenge';
  checks := checks + 1; fails := fails || pg_temp.t37_is('8notHit', (q->>'myValue') || '/' || (q->>'hit'), '1/false');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8otherGym', public.member_board(kzoya)->>'challenge', null);
  -- The desk reads but may not save or cancel.
  checks := checks + 1; fails := fails || pg_temp.t37_is('8deskSave', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', ks, pg_temp.t37_ch(30, 7))), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8deskCancel', pg_temp.t37_run(format('select public.owner_cancel_challenge(%L, %L)', ks, cid1)), 'OWNER_ONLY');
  -- Dates: 7 to 31 days, not in the past, at most 60 days ahead.
  foreach bad in array array['-1:7', '61:7', '30:6', '30:32', '30:1'] loop
    checks := checks + 1; fails := fails || pg_temp.t37_is('8dates:' || bad, pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop,
      pg_temp.t37_ch(split_part(bad, ':', 1)::int, split_part(bad, ':', 2)::int))), 'INVALID');
  end loop;
  r := public.owner_save_challenge(kop, pg_temp.t37_ch(60, 7));                                  -- the furthest start
  cid_far := (r->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t37_is('8title60', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop, pg_temp.t37_ch(30, 7, jsonb_build_object('title', repeat('x', 60))))), 'ok');
  delete from public.gym_challenges where gym_id = ga and title = repeat('x', 60);
  r := public.owner_save_challenge(kop, pg_temp.t37_ch(25, 31, '{"title":"  A long one  ","measure":"kg","goal":150000.5,"prizeDays":0}'));
  cid31 := (r->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t37_is('8long', (select (c->>'title') || '/' || (c->>'measure') || '/' || (c->>'goal') || '/' || (c->>'prizeDays') from jsonb_array_elements(public.owner_challenges(kop)->'challenges') c where c->>'id' = cid31::text), 'A long one/kg/150000.5/0');
  -- Other things that are refused.
  foreach bad in array array[
      '{"title":""}', '{"title":"   "}', '{"measure":"steps"}', '{"goal":0}', '{"goal":-3}', '{"goal":1.5}', '{"goal":94}', '{"goal":"3"}',
      '{"prizeDays":61}', '{"prizeDays":-1}', '{"prizeDays":1.5}', '{"x":1}', '{"startsOn":"2026-02-30"}', '{"startsOn":"soon"}'] loop
    checks := checks + 1; fails := fails || pg_temp.t37_is('8bad:' || bad, pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop, pg_temp.t37_ch(40, 7, bad::jsonb))), 'INVALID');
  end loop;
  checks := checks + 1; fails := fails || pg_temp.t37_is('8title61', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop, pg_temp.t37_ch(40, 7, jsonb_build_object('title', repeat('x', 61))))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8missing', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop, pg_temp.t37_ch(40, 7) - 'goal')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8notobj', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop, '[]')), 'INVALID');
  -- Two at once may not share a day; the day after the end is free.
  checks := checks + 1; fails := fails || pg_temp.t37_is('8overlap', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop, pg_temp.t37_ch(13, 7))), 'OVERLAP');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8inside', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop, pg_temp.t37_ch(30, 7))), 'OVERLAP');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8around', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop, pg_temp.t37_ch(20, 40))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8cover', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop, pg_temp.t37_ch(-0, 31))), 'OVERLAP');
  r := public.owner_save_challenge(kok, pg_temp.t37_ch(14, 7, '{"title":"Next"}'));               -- an old owner key saves too
  cid_adj := (r->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t37_is('8adjacent', (select c->>'createdByName' from jsonb_array_elements(public.owner_challenges(kop)->'challenges') c where c->>'id' = cid_adj::text), null);
  -- Changing one that has not started; one that has can only be cancelled.
  r := public.owner_save_challenge(kop, pg_temp.t37_ch(14, 9, jsonb_build_object('id', cid_adj, 'title', 'Next, changed')));
  checks := checks + 1; fails := fails || pg_temp.t37_is('8edit', (r->>'id') || '/' || (select (c->>'title') || '/' || (c->>'endsOn') from jsonb_array_elements(public.owner_challenges(kop)->'challenges') c where c->>'id' = cid_adj::text),
    cid_adj::text || '/Next, changed/' || to_char(td + 22, 'YYYY-MM-DD'));
  checks := checks + 1; fails := fails || pg_temp.t37_is('8editCount', jsonb_array_length(public.owner_challenges(kop)->'challenges')::text, '4');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8editOverlap', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop, pg_temp.t37_ch(20, 8, jsonb_build_object('id', cid_adj)))), 'OVERLAP');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8editStarted', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop, pg_temp.t37_ch(0, 14, jsonb_build_object('id', cid1, 'title', 'Changed')))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8editNone', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop, pg_temp.t37_ch(14, 7, jsonb_build_object('id', gen_random_uuid())))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8editBadId', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop, pg_temp.t37_ch(14, 7, jsonb_build_object('id', 'nope')))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8deskEdit', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', ks, pg_temp.t37_ch(14, 7, jsonb_build_object('id', cid_adj)))), 'OWNER_ONLY');
  -- Another gym's owner cannot see, change or cancel it.
  checks := checks + 1; fails := fails || pg_temp.t37_is('8theirs', jsonb_array_length(public.owner_challenges(kob)->'challenges')::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8theirEdit', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kob, pg_temp.t37_ch(14, 7, jsonb_build_object('id', cid_adj)))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8theirCancel', pg_temp.t37_run(format('select public.owner_cancel_challenge(%L, %L)', kob, cid_adj)), 'INVALID');
  -- Cancelled ones no longer block their days, and are never shown to members.
  checks := checks + 1; fails := fails || pg_temp.t37_is('8cancel', public.owner_cancel_challenge(kop, cid_adj)::text, '{"ok": true}');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8cancelAgain', pg_temp.t37_run(format('select public.owner_cancel_challenge(%L, %L)', kop, cid_adj)), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8status', (select (c->>'status') || '/' || (c->>'cancelledAt' is not null)::text from jsonb_array_elements(public.owner_challenges(kop)->'challenges') c where c->>'id' = cid_adj::text), 'cancelled/true');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8freed', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop, pg_temp.t37_ch(14, 7))), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8nolist', (select count(*)::text from jsonb_array_elements(public.owner_challenges(kop)->'challenges') c where c->>'status' = 'cancelled' and jsonb_array_length(c->'hitters') > 0), '0');
  checks := checks + 1; fails := fails || pg_temp.t37_is('8newest', (select string_agg(c->>'startsOn', ',') from jsonb_array_elements(public.owner_challenges(kop)->'challenges') c),
    to_char(td + 60, 'YYYY-MM-DD') || ',' || to_char(td + 25, 'YYYY-MM-DD') || ',' || to_char(td + 14, 'YYYY-MM-DD') || ',' || to_char(td + 14, 'YYYY-MM-DD') || ',' || to_char(td, 'YYYY-MM-DD'));
  -- A challenge that is over cannot be cancelled (its winners stay on the record).
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days) values (ga, 'Over', 'workouts', 1, td - 20, td - 10, 3) returning id into id_;
  checks := checks + 1; fails := fails || pg_temp.t37_is('8overCancel', pg_temp.t37_run(format('select public.owner_cancel_challenge(%L, %L)', kop, id_)), 'INVALID');
  delete from public.gym_challenges where id = id_;

  -- 9. Which challenge a member sees: the one running today, else one that ended in the last 7 days, else none (gym B).
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days) values (gb, 'Ended 8 days ago', 'workouts', 5, td - 20, td - 8, 3) returning id into cid_b;
  checks := checks + 1; fails := fails || pg_temp.t37_is('9old', public.member_board(kzoya)->>'challenge', null);
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days) values (gb, 'Ended 7 days ago', 'workouts', 5, td - 20, td - 7, 3);
  checks := checks + 1; fails := fails || pg_temp.t37_is('9recent', public.member_board(kzoya)->'challenge'->>'title', 'Ended 7 days ago');
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days) values (gb, 'Ended yesterday', 'kg', 5, td - 20, td - 1, 3);
  checks := checks + 1; fails := fails || pg_temp.t37_is('9latest', public.member_board(kzoya)->'challenge'->>'title', 'Ended yesterday');
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days) values (gb, 'Starts tomorrow', 'workouts', 5, td + 1, td + 10, 3);
  checks := checks + 1; fails := fails || pg_temp.t37_is('9future', public.member_board(kzoya)->'challenge'->>'title', 'Ended yesterday');
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days, cancelled_at) values (gb, 'Cancelled, running', 'workouts', 5, td - 3, td + 3, 3, now());
  checks := checks + 1; fails := fails || pg_temp.t37_is('9cancelled', public.member_board(kzoya)->'challenge'->>'title', 'Ended yesterday');
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days) values (gb, 'Running', 'workouts', 5, td, td + 10, 3);
  checks := checks + 1; fails := fails || pg_temp.t37_is('9running', public.member_board(kzoya)->'challenge'->>'title', 'Running');
  checks := checks + 1; fails := fails || pg_temp.t37_is('9ends', (public.member_board(kzoya)->'challenge'->>'endsOn'), to_char(td + 10, 'YYYY-MM-DD'));
  -- The last day still counts as running; the day after it, the challenge is "ended".
  update public.gym_challenges set starts_on = td - 10, ends_on = td where gym_id = gb and title = 'Running';
  checks := checks + 1; fails := fails || pg_temp.t37_is('9lastDay', public.member_board(kzoya)->'challenge'->>'title', 'Running');
  update public.gym_challenges set starts_on = td - 12, ends_on = td - 2 where gym_id = gb and title = 'Running';
  checks := checks + 1; fails := fails || pg_temp.t37_is('9after', public.member_board(kzoya)->'challenge'->>'title', 'Ended yesterday');

  -- 10. A challenge across many days (gym C, set straight in the table): value is the total inside its dates, in kg too.
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days) values (gc, 'Ten days', 'workouts', 25, td - 12, td + 8, 7) returning id into cid_c;
  q := public.member_board('t37-c-1')->'challenge';
  checks := checks + 1; fails := fails || pg_temp.t37_is('10hit', (q->>'myValue') || '/' || (q->>'hit') || '/' || (q->>'hitters'), '30/true/3');
  q := public.member_board('t37-c-4')->'challenge';
  checks := checks + 1; fails := fails || pg_temp.t37_is('10miss', (q->>'myValue') || '/' || (q->>'hit'), '20/false');
  -- A hidden member still wins.
  perform public.owner_hide_on_board(kcc, cm[1], true);
  checks := checks + 1; fails := fails || pg_temp.t37_is('10hidden', public.member_board('t37-c-1')->'challenge'->>'hit' || '/' || (public.member_board('t37-c-4')->'challenge'->>'hitters'), 'true/3');
  perform public.owner_hide_on_board(kcc, cm[1], false);
  r := public.owner_challenges(kcc);
  checks := checks + 1; fails := fails || pg_temp.t37_is('10owner', (select string_agg((h->>'name') || ' ' || (h->>'phone') || ' ' || (h->>'value'), ', ' order by o)
    from jsonb_array_elements(r->'challenges'->0->'hitters') with ordinality t(h, o)), 'Aarav Test 9876500101 30, Bhavna Test 9876500102 25, Chirag Test 9876500103 25');
  checks := checks + 1; fails := fails || pg_temp.t37_is('10entrants', r->'challenges'->0->>'entrants', '12');
  update public.gym_challenges set measure = 'kg', goal = 9000 where id = cid_c;
  checks := checks + 1; fails := fails || pg_temp.t37_is('10kg', (select string_agg(h->>'name', ',' order by o) from jsonb_array_elements(public.owner_challenges(kcc)->'challenges'->0->'hitters') with ordinality t(h, o)), 'Lata Test,Aarav Test,Bhavna Test,Chirag Test');
  -- A challenge over a year ago is not listed.
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days) values (gc, 'Long ago', 'workouts', 5, td - 400, td - 380, 3);
  checks := checks + 1; fails := fails || pg_temp.t37_is('10year', jsonb_array_length(public.owner_challenges(kcc)->'challenges')::text, '1');

  -- 11. A suspended gym is read-only (0027).
  delete from public.gym_challenges where id = cid31;  -- frees days for the save below
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = ga;
  perform set_config('forgeai.hq', 'off', true);
  checks := checks + 1; fails := fails || pg_temp.t37_is('11push', pg_temp.t37_run(format('select pg_temp.t37_push(%L, ''[]''::jsonb, true)', kasha)), 'SUSPENDED');
  checks := checks + 1; fails := fails || pg_temp.t37_is('11pushNew', pg_temp.t37_run(format('select pg_temp.t37_push(%L, %L::jsonb, true)', kanil,
    jsonb_build_array(jsonb_build_object('d', to_char(td - 8, 'YYYY-MM-DD'), 'w', 1, 'kg', 1)))), 'SUSPENDED');
  checks := checks + 1; fails := fails || pg_temp.t37_is('11save', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop, pg_temp.t37_ch(40, 7))), 'SUSPENDED');
  checks := checks + 1; fails := fails || pg_temp.t37_is('11cancel', pg_temp.t37_run(format('select public.owner_cancel_challenge(%L, %L)', kop, cid_far)), 'SUSPENDED');
  checks := checks + 1; fails := fails || pg_temp.t37_is('11hide', pg_temp.t37_run(format('select public.owner_hide_on_board(%L, %L, true)', kop, ma)), 'SUSPENDED');
  checks := checks + 1; fails := fails || pg_temp.t37_is('11read', (public.member_board(kasha)->>'ok') || '/' || (public.member_board(kasha)->'challenge'->>'title'), 'true/Hit the goal');
  checks := checks + 1; fails := fails || pg_temp.t37_is('11gymRead', (public.owner_challenges(kop)->>'canEdit') || '/' || (public.owner_board(kop)->>'ok'), 'true/true');
  -- A member can still leave a suspended gym, and their numbers go at once.
  checks := checks + 1; fails := fails || pg_temp.t37_is('11leave', pg_temp.t37_run(format('select public.member_leave(%L)', kanil)), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t37_is('11gone', (select count(*)::text from public.gym_member_days where member_id = mk) || '/' || (select count(*)::text from public.gym_member_board where member_id = mk), '0/0');
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'active' where gym_id = ga;
  perform set_config('forgeai.hq', 'off', true);

  -- 12. A member who left: BAD_KEY, off every list, their days and board row deleted at that moment.
  checks := checks + 1; fails := fails || pg_temp.t37_is('12before', (select count(*)::text from public.gym_member_days where member_id = mr), '1');
  perform public.member_leave(krahul);
  checks := checks + 1; fails := fails || pg_temp.t37_is('12now', (select count(*)::text from public.gym_member_days where member_id = mr) || '/' || (select count(*)::text from public.gym_member_board where member_id = mr), '0/0');
  checks := checks + 1; fails := fails || pg_temp.t37_is('12push', pg_temp.t37_run(format('select pg_temp.t37_push(%L, ''[]''::jsonb, true)', krahul)), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t37_is('12read', pg_temp.t37_run(format('select public.member_board(%L)', krahul)), 'BAD_KEY');
  r := public.member_board(kasha);
  checks := checks + 1; fails := fails || pg_temp.t37_is('12list', pg_temp.t37_list(r->'workouts'), '1 A member 4, 2 A member 3, 3 Priya 1');
  checks := checks + 1; fails := fails || pg_temp.t37_is('12members', r->>'members', '3');
  checks := checks + 1; fails := fails || pg_temp.t37_is('12hitters', (select count(*)::text from jsonb_array_elements((select c->'hitters' from jsonb_array_elements(public.owner_challenges(kop)->'challenges') c where c->>'id' = cid1::text))), '2');
  checks := checks + 1; fails := fails || pg_temp.t37_is('12entrants', (select c->>'entrants' from jsonb_array_elements(public.owner_challenges(kop)->'challenges') c where c->>'id' = cid1::text), '2');
  checks := checks + 1; fails := fails || pg_temp.t37_is('12hide', pg_temp.t37_run(format('select public.owner_hide_on_board(%L, %L, true)', kop, mr)), 'INVALID');
  -- Nobody, nothing: made-up keys.
  checks := checks + 1; fails := fails || pg_temp.t37_is('12nobody', pg_temp.t37_run(format('select public.member_board(%L)', 'no-such-key')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t37_is('12nobodyPush', pg_temp.t37_run(format('select pg_temp.t37_push(%L, ''[]''::jsonb, false)', 'no-such-key')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t37_is('12ownerKey', pg_temp.t37_run(format('select public.owner_board(%L)', kasha)), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t37_is('12ownerRead', pg_temp.t37_run(format('select public.owner_challenges(%L)', 'no-such-key')), 'BAD_KEY');
  -- A removed person's session.
  update public.gym_staff set removed_at = now() where staff_id = s_owner;
  checks := checks + 1; fails := fails || pg_temp.t37_is('12removed', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kop, pg_temp.t37_ch(40, 7))), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t37_is('12removedRead', pg_temp.t37_run(format('select public.owner_challenges(%L)', kop)), 'BAD_KEY');

  -- 13. The results of a challenge that is over are kept (gym C: Aarav 27, Bhavna and Chirag 22 inside its dates).
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days) values (gc, 'Over', 'workouts', 22, td - 14, td - 1, 3) returning id into cid_over;
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days) values (gc, 'Over 2', 'workouts', 5, td - 22, td - 15, 3) returning id into cid_over2;
  checks := checks + 1; fails := fails || pg_temp.t37_is('13before', (select (results_at is null)::text from public.gym_challenges where id = cid_over), 'true');
  q := (select c from jsonb_array_elements(public.owner_challenges(kcc)->'challenges') c where c->>'id' = cid_over::text);
  checks := checks + 1; fails := fails || pg_temp.t37_is('13status', (q->>'status') || '/' || (q->>'entrants'), 'ended/12');
  checks := checks + 1; fails := fails || pg_temp.t37_is('13hitters', (select string_agg((h->>'name') || ' ' || coalesce(h->>'phone', '-') || ' ' || (h->>'value'), ', ' order by o)
    from jsonb_array_elements(q->'hitters') with ordinality t(h, o)), 'Aarav Test 9876500101 27, Bhavna Test 9876500102 22, Chirag Test 9876500103 22');
  checks := checks + 1; fails := fails || pg_temp.t37_is('13kept', (select count(*)::text || '/' || (select (results_at is not null)::text from public.gym_challenges where id = cid_over)
    from public.gym_challenge_hits where challenge_id = cid_over), '3/true');
  -- A cancelled challenge keeps nothing; a late push of an old date makes no late winner.
  perform pg_temp.t37_push('t37-c-4', (select jsonb_agg(jsonb_build_object('d', to_char(td - n, 'YYYY-MM-DD'), 'w', 3, 'kg', 1000)) from generate_series(1, 10) n), false);
  q := (select c from jsonb_array_elements(public.owner_challenges(kcc)->'challenges') c where c->>'id' = cid_over::text);
  checks := checks + 1; fails := fails || pg_temp.t37_is('13late', (jsonb_array_length(q->'hitters'))::text || '/' || (q->>'entrants') || '/' || (q::text like '%Divya%'), '3/12/false');
  -- A member's own view of a challenge that is over reads the kept result too (gym B: Zoya pushes a day that would hit its goal).
  perform pg_temp.t37_push(kzoya, jsonb_build_array(jsonb_build_object('d', to_char(td - 3, 'YYYY-MM-DD'), 'w', 1, 'kg', 100)), false);
  q := public.member_board(kzoya)->'challenge';
  checks := checks + 1; fails := fails || pg_temp.t37_is('13memberLate', (q->>'title') || '/' || (q->>'hit') || '/' || (q->>'hitters') || '/' || (q->>'myValue'), 'Ended yesterday/false/0/4.9');
  perform pg_temp.t37_push(kzoya, '[]'::jsonb, false);
  -- The member who hit it sees it as a hit, with the kept number.
  update public.gym_challenges set ends_on = td - 1 where id = cid_c;  -- the running one in gym C is over too, so 'Over' is not alone
  update public.gym_challenges set cancelled_at = now() where id = cid_c;
  q := public.member_board('t37-c-2')->'challenge';
  checks := checks + 1; fails := fails || pg_temp.t37_is('13memberHit', (q->>'title') || '/' || (q->>'hit') || '/' || (q->>'hitters') || '/' || (q->>'myValue'), 'Over/true/3/22');
  q := public.member_board('t37-c-4')->'challenge';
  checks := checks + 1; fails := fails || pg_temp.t37_is('13memberMiss', (q->>'title') || '/' || (q->>'hit') || '/' || (q->>'myValue'), 'Over/false/21');

  -- Leaving: the numbers go at once; the kept result stays but its phone number is blanked.
  perform public.member_leave('t37-c-1');
  checks := checks + 1; fails := fails || pg_temp.t37_is('13leftGone', (select count(*)::text from public.gym_member_days where member_id = cm[1]) || '/' || (select count(*)::text from public.gym_member_board where member_id = cm[1]), '0/0');
  checks := checks + 1; fails := fails || pg_temp.t37_is('13leftPhone', (select coalesce(phone, '-') || '/' || name || '/' || value from public.gym_challenge_hits where challenge_id = cid_over and member_id = cm[1]), '-/Aarav Test/27');
  checks := checks + 1; fails := fails || pg_temp.t37_is('13othersPhone', (select phone from public.gym_challenge_hits where challenge_id = cid_over and member_id = cm[2]), '9876500102');
  q := (select c from jsonb_array_elements(public.owner_challenges(kcc)->'challenges') c where c->>'id' = cid_over::text);
  checks := checks + 1; fails := fails || pg_temp.t37_is('13stillWinner', (select string_agg((h->>'name') || ' ' || coalesce(h->>'phone', '-'), ', ' order by o) from jsonb_array_elements(q->'hitters') with ordinality t(h, o)),
    'Aarav Test -, Bhavna Test 9876500102, Chirag Test 9876500103');
  -- A suspended gym: leaving still works and still blanks the number; reading still keeps a result.
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = gc;
  perform set_config('forgeai.hq', 'off', true);
  checks := checks + 1; fails := fails || pg_temp.t37_is('13suspLeave', pg_temp.t37_run(format('select public.member_leave(%L)', 't37-c-3')), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t37_is('13suspHq', coalesce(current_setting('forgeai.hq', true), 'off'), 'off');
  checks := checks + 1; fails := fails || pg_temp.t37_is('13suspGone', (select count(*)::text from public.gym_member_days where member_id = cm[3]) || '/' || (select coalesce(phone, '-') from public.gym_challenge_hits where challenge_id = cid_over and member_id = cm[3]), '0/-');
  checks := checks + 1; fails := fails || pg_temp.t37_is('13suspRead', (public.owner_challenges(kcc)->>'canEdit') || '/' || (select (results_at is not null)::text from public.gym_challenges where id = cid_over2), 'true/true');
  checks := checks + 1; fails := fails || pg_temp.t37_is('13suspWrite', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kcc, pg_temp.t37_ch(40, 7))), 'SUSPENDED');
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'active' where gym_id = gc;
  perform set_config('forgeai.hq', 'off', true);
  -- Backstop: stray rows of a member who left are removed by the next clean-up.
  insert into public.gym_member_days(gym_id, member_id, day, workouts, kg) values (gc, cm[1], td - 3, 1, 1);
  insert into public.gym_member_board(gym_id, member_id, show_name) values (gc, cm[1], true);
  perform pg_temp.t37_age_meta(gc);
  perform public.member_board('t37-c-4');
  checks := checks + 1; fails := fails || pg_temp.t37_is('13backstop', (select count(*)::text from public.gym_member_days where member_id = cm[1]) || '/' || (select count(*)::text from public.gym_member_board where member_id = cm[1]), '0/0');
  -- The 62-day clean-up never loses a kept result.
  delete from public.gym_member_days where gym_id = gc;
  checks := checks + 1; fails := fails || pg_temp.t37_is('13survive', (select count(*)::text from public.gym_challenge_hits where challenge_id = cid_over), '3');
  q := (select c from jsonb_array_elements(public.owner_challenges(kcc)->'challenges') c where c->>'id' = cid_over::text);
  checks := checks + 1; fails := fails || pg_temp.t37_is('13survived', jsonb_array_length(q->'hitters')::text || '/' || (q->>'entrants'), '3/12');
  -- A cancelled challenge has no winners.
  checks := checks + 1; fails := fails || pg_temp.t37_is('13cancelled', (select (c->>'status') || '/' || jsonb_array_length(c->'hitters') from jsonb_array_elements(public.owner_challenges(kcc)->'challenges') c where c->>'id' = cid_c::text), 'cancelled/0');

  -- 14. Names: a title is skipped, one word stays, a digit or nothing is 'A member'.
  foreach bad in array array[
      'Dr. Anil Kumar|Anil K.', 'dr anil kumar|anil K.', 'Mrs Priya Nair|Priya N.', 'MS. Rekha Rao|Rekha R.', 'Shri Ram Lal|Ram L.', 'Smt. Lata Devi|Lata D.',
      'Smt. Lata|Lata', 'Dr|A member', 'Ms. Mrs.|A member', '  |A member', 'R2D2 Sharma|A member', 'Rahul  Sharma|Rahul S.', 'Rahul|Rahul',
      'Rahul 2nd|Rahul', 'Anil Kumar verma|Anil V.', 'Doctor Who|Doctor W.', 'Mr. Amit Shah Jr.|Amit J.'] loop
    checks := checks + 1; fails := fails || pg_temp.t37_is('14name:' || split_part(bad, '|', 1), public._board_name(split_part(bad, '|', 1), true), split_part(bad, '|', 2));
  end loop;
  checks := checks + 1; fails := fails || pg_temp.t37_is('14off', public._board_name('Rahul Sharma', false), 'A member');
  checks := checks + 1; fails := fails || pg_temp.t37_is('14null', public._board_name(null, true) || '/' || public._board_name('Rahul Sharma', null), 'A member/A member');

  -- 15. A push that changes nothing within 15 seconds is ignored; a new name switch is not (gym B, Zoya).
  perform pg_temp.t37_push(kzoya, jsonb_build_array(jsonb_build_object('d', to_char(td, 'YYYY-MM-DD'), 'w', 1, 'kg', 10)), false);
  checks := checks + 1; fails := fails || pg_temp.t37_is('15again', public.member_board_push(kzoya, jsonb_build_array(jsonb_build_object('d', to_char(td, 'YYYY-MM-DD'), 'w', 2, 'kg', 20)), false)::text, '{"ok": true}');
  checks := checks + 1; fails := fails || pg_temp.t37_is('15ignored', (select workouts::text from public.gym_member_days where member_id = mz and day = td), '1');
  r := public.member_board_push(kzoya, jsonb_build_array(jsonb_build_object('d', to_char(td, 'YYYY-MM-DD'), 'w', 2, 'kg', 20)), true);
  checks := checks + 1; fails := fails || pg_temp.t37_is('15switch', (r->>'ok') || '/'
    || (select workouts::text from public.gym_member_days where member_id = mz and day = td) || '/' || (select show_name::text from public.gym_member_board where member_id = mz), 'true/2/true');
  update public.gym_member_board set updated_at = now() - interval '16 seconds' where member_id = mz;
  perform public.member_board_push(kzoya, jsonb_build_array(jsonb_build_object('d', to_char(td, 'YYYY-MM-DD'), 'w', 3, 'kg', 30)), true);
  checks := checks + 1; fails := fails || pg_temp.t37_is('15after', (select workouts::text from public.gym_member_days where member_id = mz and day = td), '3');
  -- A bad payload is still refused (the checks come before the throttle).
  update public.gym_member_board set updated_at = now() - interval '16 seconds' where member_id = mz;
  checks := checks + 1; fails := fails || pg_temp.t37_is('15bad', pg_temp.t37_run(format('select public.member_board_push(%L, %L::jsonb, true)', kzoya, '{"a":1}')), 'INVALID');
  foreach bad in array array['5', 'true', '"x"', 'null'] loop
    checks := checks + 1; fails := fails || pg_temp.t37_is('15type:' || bad, pg_temp.t37_run(format('select public.member_board_push(%L, %L::jsonb, true)', kzoya, bad)), 'INVALID');
  end loop;
  perform pg_temp.t37_push(kzoya, '[]'::jsonb, false);

  -- 16. A made-up challenge id is INVALID (never a database error), at every place a uuid comes in as text.
  foreach bad in array array['nope', '12345678-1234-1234-1234-12345678901', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz', '1234567-81234-1234-1234-123456789012',
      '{12345678-1234-1234-1234-123456789012}', '12345678123412341234123456789012', ' 12345678-1234-1234-1234-123456789012'] loop
    checks := checks + 1; fails := fails || pg_temp.t37_is('16id:' || bad, pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kcc, pg_temp.t37_ch(40, 7, jsonb_build_object('id', bad)))), 'INVALID');
  end loop;
  checks := checks + 1; fails := fails || pg_temp.t37_is('16number', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kcc, pg_temp.t37_ch(40, 7, '{"id":12}'))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t37_is('16upper', pg_temp.t37_run(format('select public.owner_save_challenge(%L, %L::jsonb)', kcc, pg_temp.t37_ch(40, 7, jsonb_build_object('id', upper(gen_random_uuid()::text))))), 'INVALID');
  -- 17. Anyone may call the key-checked functions; nobody may call the helpers or read the tables.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_board_push(text, jsonb, boolean)', 'execute')
     or not has_function_privilege('anon', 'public.member_board(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_challenges(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_save_challenge(text, jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.owner_cancel_challenge(text, uuid)', 'execute')
     or not has_function_privilege('anon', 'public.owner_board(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_hide_on_board(text, uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'public._board_name(text, boolean)', 'execute')
     or has_function_privilege('anon', 'public._board_rows(uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public._board_top(uuid, text, uuid, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public._challenge_hitters(public.gym_challenges)', 'execute')
     or has_function_privilege('anon', 'public._board_cleanup(uuid)', 'execute')
     or has_function_privilege('anon', 'public._challenge_results(uuid)', 'execute')
     or has_function_privilege('anon', 'public._board_member_left()', 'execute')
     or has_table_privilege('anon', 'public.gym_challenge_hits', 'select')
     or has_table_privilege('authenticated', 'public.gym_challenge_hits', 'insert')
     or has_table_privilege('anon', 'public.gym_board_meta', 'select')
     or has_table_privilege('anon', 'public.gym_member_days', 'select')
     or has_table_privilege('anon', 'public.gym_member_board', 'select')
     or has_table_privilege('anon', 'public.gym_challenges', 'select')
     or has_table_privilege('authenticated', 'public.gym_member_days', 'insert')
     or has_table_privilege('authenticated', 'public.gym_challenges', 'update') then fails := fails || ' 13'; end if;
  checks := checks + 1;
  if not (select relrowsecurity from pg_class where oid = 'public.gym_member_days'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.gym_member_board'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.gym_challenges'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.gym_challenge_hits'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.gym_board_meta'::regclass) then fails := fails || ' 13rls'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
