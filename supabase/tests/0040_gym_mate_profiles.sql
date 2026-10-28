-- Gym mate profiles test (0040, R-164). Runs in CI after every migration (scripts/ci/db_checks.sh); can also
-- be pasted into the live SQL Editor once 0040 is live. It ALWAYS ends in an error:
--   "RESULT PASS (n checks; ...)"  everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."              the checks that failed (label:what came back).

create or replace function pg_temp.t40_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t40_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gb uuid;
  ka text := 't40-member-a'; kb text := 't40-member-b'; kc text := 't40-member-c'; kz text := 't40-member-z';
  ma uuid; mb uuid; mc uuid; mz uuid;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  fails text := ''; checks int := 0; r jsonb; sa text; sc text; ex8 jsonb; big jsonb; i int;
  worst int; typical int; ws jsonb;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T40 Gym', 'T40GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T40 Other', 'T40GYB', 1) returning gym_id into gb;
  insert into public.gym_members(gym_id, name, phone, key_hash) values (gid, 'Asha Rao', '9876500401', public._hash_key(ka)) returning member_id into ma;
  insert into public.gym_members(gym_id, name, key_hash) values (gid, 'Bina Shah', public._hash_key(kb)) returning member_id into mb;
  insert into public.gym_members(gym_id, name, key_hash) values (gid, 'Chetan Das', public._hash_key(kc)) returning member_id into mc;
  insert into public.gym_members(gym_id, name, key_hash) values (gb, 'Zoya Ali', public._hash_key(kz)) returning member_id into mz;

  -- Everyone on the board today; Asha and Bina show their names, Chetan does not.
  perform public.member_board_push(ka, jsonb_build_array(jsonb_build_object('d', to_char(today, 'YYYY-MM-DD'), 'w', 1, 'kg', 3000)), true);
  perform public.member_board_push(kb, jsonb_build_array(jsonb_build_object('d', to_char(today, 'YYYY-MM-DD'), 'w', 1, 'kg', 2000)), true);
  perform public.member_board_push(kc, jsonb_build_array(jsonb_build_object('d', to_char(today, 'YYYY-MM-DD'), 'w', 1, 'kg', 1000)), false);
  perform public.member_board_push(kz, jsonb_build_array(jsonb_build_object('d', to_char(today, 'YYYY-MM-DD'), 'w', 1, 'kg', 1000)), true);

  -- 1. Asha shares: 2 recent workouts and one 61 days old (left out).
  r := public.member_mate_share(ka, jsonb_build_object('bio', '  Leg day   lover ', 'workouts', jsonb_build_array(
    jsonb_build_object('id', 'w1', 'd', to_char(today, 'YYYY-MM-DD'), 'name', 'Push 1', 'min', 52, 'kg', 3611.4,
      'ex', jsonb_build_array(jsonb_build_object('n', 'Bench Press', 'k', 'bench_press', 'w', 60, 'r', 8),
                              jsonb_build_object('n', 'Pull Up', 'k', null, 'w', 0, 'r', 12))),
    jsonb_build_object('id', 'w0', 'd', to_char(today - 3, 'YYYY-MM-DD'), 'name', '', 'min', 0, 'kg', 0, 'ex', '[]'::jsonb),
    jsonb_build_object('id', 'wold', 'd', to_char(today - 61, 'YYYY-MM-DD'), 'name', 'Old', 'min', 30, 'kg', 100, 'ex', '[]'::jsonb))));
  checks := checks + 1; fails := fails || pg_temp.t40_is('1ok', r->>'workouts', '2');
  checks := checks + 1; fails := fails || pg_temp.t40_is('1rows', (select count(*) from public.gym_mate_workouts where member_id = ma)::text, '2');
  checks := checks + 1; fails := fails || pg_temp.t40_is('1bio', (select bio from public.gym_mate_profiles where member_id = ma), 'Leg day lover');
  checks := checks + 1; fails := fails || pg_temp.t40_is('1noname', (select name from public.gym_mate_workouts where member_id = ma and workout_id = 'w0'), 'Workout');
  checks := checks + 1; fails := fails || pg_temp.t40_is('1kg', (select kg::text from public.gym_mate_workouts where member_id = ma and workout_id = 'w1'), '3611');
  select share_id::text into sa from public.gym_mate_profiles where member_id = ma;

  -- 2. Refused shapes: nothing written.
  checks := checks + 1; fails := fails || pg_temp.t40_is('2key', pg_temp.t40_run(format('select public.member_mate_share(%L, %L)', 'no-such-key', '{"workouts":[]}')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t40_is('2extra', pg_temp.t40_run(format('select public.member_mate_share(%L, %L)', kb, '{"workouts":[],"phone":"98"}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t40_is('2kgtext', pg_temp.t40_run(format('select public.member_mate_share(%L, %L)', kb,
    '{"workouts":[{"id":"a","d":"2026-10-01","name":"x","min":1,"kg":"lots","ex":[]}]}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t40_is('2date', pg_temp.t40_run(format('select public.member_mate_share(%L, %L)', kb,
    '{"workouts":[{"id":"a","d":"2026-02-30","name":"x","min":1,"kg":1,"ex":[]}]}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t40_is('2dup', pg_temp.t40_run(format('select public.member_mate_share(%L, %L)', kb,
    format('{"workouts":[{"id":"a","d":"%s","name":"x","min":1,"kg":1,"ex":[]},{"id":"a","d":"%s","name":"x","min":1,"kg":1,"ex":[]}]}', today, today))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t40_is('2setlist', pg_temp.t40_run(format('select public.member_mate_share(%L, %L)', kb,
    format('{"workouts":[{"id":"a","d":"%s","name":"x","min":1,"kg":1,"ex":[{"n":"Squat","w":1,"r":1,"sets":[1,2]}]}]}', today))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t40_is('2bio', pg_temp.t40_run(format('select public.member_mate_share(%L, %L)', kb,
    jsonb_build_object('bio', repeat('b', 161), 'workouts', '[]'::jsonb))), 'INVALID');
  ex8 := (select jsonb_agg(jsonb_build_object('n', 'Ex ' || g, 'w', 1, 'r', 1)) from generate_series(1, 9) g);
  checks := checks + 1; fails := fails || pg_temp.t40_is('2nine', pg_temp.t40_run(format('select public.member_mate_share(%L, %L)', kb,
    jsonb_build_object('workouts', jsonb_build_array(jsonb_build_object('id', 'a', 'd', to_char(today, 'YYYY-MM-DD'), 'name', 'x', 'min', 1, 'kg', 1, 'ex', ex8))))), 'INVALID');
  big := (select jsonb_agg(jsonb_build_object('id', 'w' || g, 'd', to_char(today, 'YYYY-MM-DD'), 'name', 'x', 'min', 1, 'kg', 1, 'ex', '[]'::jsonb)) from generate_series(1, 31) g);
  checks := checks + 1; fails := fails || pg_temp.t40_is('2many', pg_temp.t40_run(format('select public.member_mate_share(%L, %L)', kb, jsonb_build_object('workouts', big))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t40_is('2none', (select count(*) from public.gym_mate_profiles where member_id = mb)::text, '0');

  -- 3. Size (owner, 28 Oct: a summary row under ~2 KB): the biggest row allowed, and a typical one.
  ex8 := (select jsonb_agg(jsonb_build_object('n', rpad('Exercise ' || g, 40, 'x'), 'k', rpad('key_' || g, 40, 'k'), 'w', 999.5, 'r', 999)) from generate_series(1, 8) g);
  perform public.member_mate_share(kb, jsonb_build_object('bio', repeat('b', 160), 'workouts', (
    select jsonb_agg(jsonb_build_object('id', 'w' || lpad(g::text, 63, '0'), 'd', to_char(today - g, 'YYYY-MM-DD'), 'name', rpad('Workout ' || g, 60, 'y'),
                                        'min', 1440, 'kg', 59999.9, 'ex', ex8)) from generate_series(0, 29) g)));
  select max(pg_column_size(w.*)) into worst from public.gym_mate_workouts w where member_id = mb;
  checks := checks + 1; fails := fails || pg_temp.t40_is('3thirty', (select count(*) from public.gym_mate_workouts where member_id = mb)::text, '30');
  checks := checks + 1; if worst is null or worst >= 2048 then fails := fails || ' 3worst:' || coalesce(worst::text, 'null'); end if;
  ex8 := (select jsonb_agg(jsonb_build_object('n', (array['Bench Press','Incline Dumbbell Press','Cable Fly','Shoulder Press','Lateral Raise','Triceps Pushdown'])[g], 'k', 'ex_' || g, 'w', 42.5, 'r', 10)) from generate_series(1, 6) g);
  perform public.member_mate_share(kc, jsonb_build_object('workouts', jsonb_build_array(
    jsonb_build_object('id', 'c1d2e3f4-0000-4000-8000-000000000001', 'd', to_char(today, 'YYYY-MM-DD'), 'name', 'Push 1', 'min', 55, 'kg', 6150, 'ex', ex8))));
  select pg_column_size(w.*) into typical from public.gym_mate_workouts w where member_id = mc;
  select share_id::text into sc from public.gym_mate_profiles where member_id = mc;

  -- 4. The board, as Bina sees it: Asha's row opens (name shown + sharing); Chetan's never (he shares but
  --    hides his name); Bina's own row never; another gym's member is not on it.
  r := public.member_mate_board(kb);
  checks := checks + 1; fails := fails || pg_temp.t40_is('4asha', (select e->>'profile' from jsonb_array_elements(r->'kg') e where e->>'name' = 'Asha R.'), sa);
  checks := checks + 1; fails := fails || pg_temp.t40_is('4own', (select e->>'profile' from jsonb_array_elements(r->'kg') e where e->>'name' = 'Bina S.'), null);
  checks := checks + 1; fails := fails || pg_temp.t40_is('4chetan', (select e->>'profile' from jsonb_array_elements(r->'kg') e where e->>'name' = 'A member'), null);
  checks := checks + 1; fails := fails || pg_temp.t40_is('4order', (select string_agg(e->>'name', ',' order by o) from jsonb_array_elements(r->'kg') with ordinality x(e, o)), 'Asha R.,Bina S.,A member');
  checks := checks + 1; fails := fails || pg_temp.t40_is('4zoya', (select count(*) from jsonb_array_elements(r->'kg') e where e->>'name' like 'Zoya%')::text, '0');

  -- 5. Opening Asha's profile: the leaderboard name, the bio, newest first, nothing private.
  r := public.member_mate_profile(kb, sa::uuid);
  checks := checks + 1; fails := fails || pg_temp.t40_is('5name', r->>'name', 'Asha R.');
  checks := checks + 1; fails := fails || pg_temp.t40_is('5bio', r->>'bio', 'Leg day lover');
  checks := checks + 1; fails := fails || pg_temp.t40_is('5order', (select string_agg(e->>'id', ',' order by o) from jsonb_array_elements(r->'workouts') with ordinality x(e, o)), 'w1,w0');
  checks := checks + 1; fails := fails || pg_temp.t40_is('5best', r#>>'{workouts,0,ex,0}', '{"k": "bench_press", "n": "Bench Press", "r": 8, "w": 60.0}');
  checks := checks + 1; fails := fails || pg_temp.t40_is('5private', (r::text like '%9876500401%' or r ? 'phone' or r ? 'memberId')::text, 'false');

  -- 6. Who may NOT open it: name hidden (Chetan), another gym (Zoya), hidden by the gym, a made-up id.
  checks := checks + 1; fails := fails || pg_temp.t40_is('6noname', pg_temp.t40_run(format('select public.member_mate_profile(%L, %L)', ka, sc)), 'NOT_SHARED');
  checks := checks + 1; fails := fails || pg_temp.t40_is('6othergym', pg_temp.t40_run(format('select public.member_mate_profile(%L, %L)', kz, sa)), 'NOT_SHARED');
  checks := checks + 1; fails := fails || pg_temp.t40_is('6madeup', pg_temp.t40_run(format('select public.member_mate_profile(%L, %L)', kb, gen_random_uuid())), 'NOT_SHARED');
  update public.gym_member_board set hidden = true where member_id = ma;
  checks := checks + 1; fails := fails || pg_temp.t40_is('6hidden', pg_temp.t40_run(format('select public.member_mate_profile(%L, %L)', kb, sa)), 'NOT_SHARED');
  update public.gym_member_board set hidden = false where member_id = ma;
  -- Asha switches her NAME off: her profile closes too (and opens again when it is back on).
  perform public.member_board_push(ka, jsonb_build_array(jsonb_build_object('d', to_char(today, 'YYYY-MM-DD'), 'w', 1, 'kg', 3000)), false);
  checks := checks + 1; fails := fails || pg_temp.t40_is('6nameoff', pg_temp.t40_run(format('select public.member_mate_profile(%L, %L)', kb, sa)), 'NOT_SHARED');
  update public.gym_member_board set show_name = true where member_id = ma;
  checks := checks + 1; fails := fails || pg_temp.t40_is('6back', pg_temp.t40_run(format('select public.member_mate_profile(%L, %L)', kb, sa)), 'ok');

  -- 7. A new push replaces the workouts; the share id stays.
  perform public.member_mate_share(ka, jsonb_build_object('workouts', jsonb_build_array(
    jsonb_build_object('id', 'w9', 'd', to_char(today, 'YYYY-MM-DD'), 'name', 'Legs', 'min', 40, 'kg', 5000, 'ex', '[]'::jsonb))));
  checks := checks + 1; fails := fails || pg_temp.t40_is('7replaced', (select string_agg(workout_id, ',') from public.gym_mate_workouts where member_id = ma), 'w9');
  checks := checks + 1; fails := fails || pg_temp.t40_is('7sameid', (select share_id::text from public.gym_mate_profiles where member_id = ma), sa);
  checks := checks + 1; fails := fails || pg_temp.t40_is('7nobio', (select coalesce(bio, 'none') from public.gym_mate_profiles where member_id = ma), 'none');

  -- 8. The 60-day rule at a read: an old workout and a profile not refreshed for 60 days go.
  insert into public.gym_mate_workouts(gym_id, member_id, workout_id, day, name, minutes, kg, exercises)
    values (gid, ma, 'stale', today - 70, 'Old', 1, 1, '[]');
  update public.gym_mate_profiles set updated_at = now() - interval '61 days' where member_id = mc;
  perform public.member_mate_board(kb);
  checks := checks + 1; fails := fails || pg_temp.t40_is('8old', (select count(*) from public.gym_mate_workouts where workout_id = 'stale')::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t40_is('8stale', (select count(*) from public.gym_mate_workouts where member_id = mc)::text, '0');

  -- 9. The switch goes off: everything of that member goes at once.
  r := public.member_mate_stop(kb);
  checks := checks + 1; fails := fails || pg_temp.t40_is('9stop', r->>'removed', 'true');
  checks := checks + 1; fails := fails || pg_temp.t40_is('9rows', (select count(*) from public.gym_mate_workouts where member_id = mb)::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t40_is('9again', public.member_mate_stop(kb)->>'removed', 'false');

  -- 10. Leaving the gym takes it at once; the key no longer shares.
  update public.gym_members set left_at = now() where member_id = ma;
  checks := checks + 1; fails := fails || pg_temp.t40_is('10left', (select count(*) from public.gym_mate_profiles where member_id = ma)::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t40_is('10leftw', (select count(*) from public.gym_mate_workouts where member_id = ma)::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t40_is('10share', pg_temp.t40_run(format('select public.member_mate_share(%L, %L)', ka, '{"workouts":[]}')), 'BAD_KEY');
  -- A member deleted for good: by the foreign keys.
  perform public.member_mate_share(kz, '{"workouts":[]}'::jsonb);
  delete from public.gym_members where member_id = mz;
  checks := checks + 1; fails := fails || pg_temp.t40_is('10deleted', (select count(*) from public.gym_mate_profiles where member_id = mz)::text, '0');

  -- 11. Who may call what: members the four member_mate_* functions; nobody the tables or helpers.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_mate_share(text, jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.member_mate_stop(text)', 'execute')
     or not has_function_privilege('anon', 'public.member_mate_board(text)', 'execute')
     or not has_function_privilege('anon', 'public.member_mate_profile(text, uuid)', 'execute')
     or has_function_privilege('anon', 'public._mate_cleanup(uuid)', 'execute')
     or has_function_privilege('anon', 'public._mate_open_id(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._mate_top(uuid, text, uuid)', 'execute')
     or has_table_privilege('anon', 'public.gym_mate_profiles', 'select')
     or has_table_privilege('authenticated', 'public.gym_mate_workouts', 'select')
     or not (select relrowsecurity from pg_class where oid = 'public.gym_mate_workouts'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.gym_mate_profiles'::regclass) then fails := fails || ' 11'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks; biggest workout row % bytes, typical % bytes)', checks, worst, typical;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
