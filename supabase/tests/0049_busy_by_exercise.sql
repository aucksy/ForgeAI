-- Busy machines by day and hour test (0049, F137). Runs in CI after every migration (scripts/ci/db_checks.sh);
-- can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

-- Run one statement: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t49_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t49_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- One start: member m of gym g did exercise x on day d at hour h.
create or replace function pg_temp.t49_start(g uuid, m uuid, d date, h int, x text) returns void
  language sql as $$
  insert into public.gym_exercise_starts(gym_id, member_id, day, hour, ex) values (g, m, d, h, x) on conflict do nothing
$$;

do $$
declare
  ga uuid; gb uuid; s_owner uuid; s_desk uuid;
  kop text := 't49-owner-session'; kd text := 't49-desk-session'; kok text := 't49-owner-key'; kob text := 't49-owner-b';
  km text := 't49-member-a'; km2 text := 't49-member-a2';
  b1 uuid; b2 uuid; b3 uuid; b4 uuid; ma uuid;
  fails text := ''; checks int := 0; r jsonb; n int; k int;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  w0 date := date '2026-01-05';  -- a Monday
  wk date;
  list jsonb := '[
    {"id":"leg_press","name":"  Leg   press ","units":1,"ex":["leg_press","leg_press_calf_raise","leg_press"]},
    {"id":"squat_rack","name":"Squat rack","units":2,"ex":["barbell_back_squat"]},
    {"id":"treadmill","name":"Treadmill","units":10,"ex":["treadmill_run"]},
    {"id":"own_belt","name":"Belt squat","units":1,"ex":[],"own":true}]';
begin
  insert into public.gyms(name, join_code, crm_version) values ('T49 Gym', 'T49GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T49 Sim', 'T49GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner', '9876504901', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Ravi', '9876504902', 'staff') returning staff_id into s_desk;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_desk, public._hash_key(kd));
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kok)), (gb, public._hash_key(kob));
  insert into public.gym_members(gym_id, name, key_hash) values (ga, 'Asha', public._hash_key(km)) returning member_id into ma;
  insert into public.gym_members(gym_id, name, key_hash) values (ga, 'Bina', public._hash_key(km2));

  -- 1. Nothing set: off, no machines; the desk reads but cannot edit.
  r := public.owner_machine_setup(kop);
  checks := checks + 1; fails := fails || pg_temp.t49_is('1off', (r->>'enabled') || '/' || (r->'machines')::text || '/' || (r->>'canEdit'), 'false/[]/true');
  checks := checks + 1; fails := fails || pg_temp.t49_is('1desk', public.owner_machine_setup(kd)->>'canEdit', 'false');
  checks := checks + 1; fails := fails || pg_temp.t49_is('1badkey', pg_temp.t49_run(format('select public.owner_machine_setup(%L)', 'nope')), 'BAD_KEY');

  -- 2. Members see nothing and nothing they send is kept while it is off.
  r := public.member_machine_busy(km);
  checks := checks + 1; fails := fails || pg_temp.t49_is('2off', (r->>'on') || '/' || (r->'keys')::text || '/' || (r->'machines')::text, 'false/[]/[]');
  r := public.member_machine_push(km, jsonb_build_array(jsonb_build_object('d', to_char(today, 'YYYY-MM-DD'), 'h', 19, 'x', jsonb_build_array('leg_press'))));
  checks := checks + 1; fails := fails || pg_temp.t49_is('2pushoff', r->>'on', 'false');
  checks := checks + 1; fails := fails || pg_temp.t49_is('2nothing', (select count(*)::text from public.gym_exercise_starts where gym_id = ga), '0');

  -- 3. Only the owner saves; a bad list is refused.
  checks := checks + 1; fails := fails || pg_temp.t49_is('3desk', pg_temp.t49_run(format('select public.owner_save_machine_setup(%L, true, %L::jsonb)', kd, list)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t49_is('3units0', pg_temp.t49_run(format('select public.owner_save_machine_setup(%L, true, %L::jsonb)', kop, '[{"id":"a","name":"A","units":0,"ex":[]}]')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t49_is('3half', pg_temp.t49_run(format('select public.owner_save_machine_setup(%L, true, %L::jsonb)', kop, '[{"id":"a","name":"A","units":1.5,"ex":[]}]')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t49_is('3dupe', pg_temp.t49_run(format('select public.owner_save_machine_setup(%L, true, %L::jsonb)', kop, '[{"id":"a","name":"A","units":1,"ex":[]},{"id":"a","name":"B","units":1,"ex":[]}]')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t49_is('3badex', pg_temp.t49_run(format('select public.owner_save_machine_setup(%L, true, %L::jsonb)', kop, '[{"id":"a","name":"A","units":1,"ex":["Leg Press"]}]')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t49_is('3noname', pg_temp.t49_run(format('select public.owner_save_machine_setup(%L, true, %L::jsonb)', kop, '[{"id":"a","name":"   ","units":1,"ex":[]}]')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t49_is('3badid', pg_temp.t49_run(format('select public.owner_save_machine_setup(%L, true, %L::jsonb)', kop, '[{"id":"A B","name":"A","units":1,"ex":[]}]')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t49_is('3null', pg_temp.t49_run(format('select public.owner_save_machine_setup(%L, null, %L::jsonb)', kop, '[]')), 'INVALID');

  -- 4. Switched on with four machines: names tidied, keys unique, only 1-2 units with exercises counted.
  r := public.owner_save_machine_setup(kop, true, list);
  checks := checks + 1; fails := fails || pg_temp.t49_is('4on', r->>'enabled', 'true');
  checks := checks + 1; fails := fails || pg_temp.t49_is('4name', r->'machines'->0->>'name', 'Leg press');
  checks := checks + 1; fails := fails || pg_temp.t49_is('4keys', (r->'machines'->0->'ex')::text, '["leg_press", "leg_press_calf_raise"]');
  checks := checks + 1; fails := fails || pg_temp.t49_is('4counted',
    (select string_agg(m->>'counted', ',' order by ord) from jsonb_array_elements(r->'machines') with ordinality x(m, ord)), 'true,true,false,false');
  checks := checks + 1; fails := fails || pg_temp.t49_is('4own', r->'machines'->3->>'own', 'true');
  checks := checks + 1; fails := fails || pg_temp.t49_is('4check', (r->'machines'->0->'check')::text, '{"proven": false, "weeksRight": 0, "weeksChecked": 0}');
  checks := checks + 1; fails := fails || pg_temp.t49_is('4fewsenders', coalesce(r->>'membersSending', 'null'), 'null');

  -- 5. The member learns which keys to send; no machine is proven yet.
  r := public.member_machine_busy(km);
  checks := checks + 1; fails := fails || pg_temp.t49_is('5keys', (r->>'on') || '/' || (r->'keys')::text,
    'true/["barbell_back_squat", "leg_press", "leg_press_calf_raise", "treadmill_run"]');
  checks := checks + 1; fails := fails || pg_temp.t49_is('5none', (r->'machines')::text, '[]');

  -- 6. A push keeps only this gym's keys and the last 35 days; a bad push changes nothing.
  r := public.member_machine_push(km, jsonb_build_array(
    jsonb_build_object('d', to_char(today, 'YYYY-MM-DD'), 'h', 19, 'x', jsonb_build_array('leg_press', 'pec_deck_fly')),
    jsonb_build_object('d', to_char(today - 1, 'YYYY-MM-DD'), 'h', 7, 'x', jsonb_build_array('barbell_back_squat', 'leg_press')),
    jsonb_build_object('d', to_char(today - 40, 'YYYY-MM-DD'), 'h', 7, 'x', jsonb_build_array('leg_press'))));
  checks := checks + 1; fails := fails || pg_temp.t49_is('6on', r->>'on', 'true');
  checks := checks + 1; fails := fails || pg_temp.t49_is('6kept', (select string_agg(day - today || ':' || hour || ':' || ex, ',' order by day, ex)
    from public.gym_exercise_starts where gym_id = ga), '-1:7:barbell_back_squat,-1:7:leg_press,0:19:leg_press');
  checks := checks + 1; fails := fails || pg_temp.t49_is('6hour', pg_temp.t49_run(format('select public.member_machine_push(%L, %L::jsonb)', km,
    jsonb_build_array(jsonb_build_object('d', to_char(today, 'YYYY-MM-DD'), 'h', 24, 'x', '[]'::jsonb)))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t49_is('6day', pg_temp.t49_run(format('select public.member_machine_push(%L, %L::jsonb)', km,
    '[{"d":"2026-02-30","h":7,"x":[]}]')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t49_is('6x', pg_temp.t49_run(format('select public.member_machine_push(%L, %L::jsonb)', km,
    '[{"d":"2026-02-03","h":7,"x":[5]}]')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t49_is('6notarray', pg_temp.t49_run(format('select public.member_machine_push(%L, %L::jsonb)', km, '{}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t49_is('6still', (select count(*)::text from public.gym_exercise_starts where gym_id = ga), '3');
  -- A second push replaces the first.
  perform public.member_machine_push(km, jsonb_build_array(jsonb_build_object('d', to_char(today, 'YYYY-MM-DD'), 'h', 18, 'x', jsonb_build_array('leg_press'))));
  checks := checks + 1; fails := fails || pg_temp.t49_is('6replace', (select string_agg(hour || ':' || ex, ',') from public.gym_exercise_starts where gym_id = ga), '18:leg_press');
  checks := checks + 1; fails := fails || pg_temp.t49_is('6badkey', pg_temp.t49_run(format('select public.member_machine_push(%L, %L::jsonb)', 'nope', '[]')), 'BAD_KEY');

  -- 7. Taking a machine away drops the rows only it used.
  perform public.member_machine_push(km, jsonb_build_array(jsonb_build_object('d', to_char(today, 'YYYY-MM-DD'), 'h', 18, 'x', jsonb_build_array('leg_press', 'treadmill_run'))));
  perform public.owner_save_machine_setup(kop, true, '[{"id":"leg_press","name":"Leg press","units":1,"ex":["leg_press"]}]'::jsonb);
  checks := checks + 1; fails := fails || pg_temp.t49_is('7dropped', (select string_agg(ex, ',') from public.gym_exercise_starts where gym_id = ga), 'leg_press');

  -- 8. Leaving takes the member's rows with them at once.
  perform public.member_leave(km);
  checks := checks + 1; fails := fails || pg_temp.t49_is('8left', (select count(*)::text from public.gym_exercise_starts where member_id = ma), '0');
  checks := checks + 1; fails := fails || pg_temp.t49_is('8leftkey', pg_temp.t49_run(format('select public.member_machine_busy(%L)', km)), 'BAD_KEY');

  -- 9. Switching off deletes every member-linked row of the gym.
  perform public.member_machine_push(km2, jsonb_build_array(jsonb_build_object('d', to_char(today, 'YYYY-MM-DD'), 'h', 18, 'x', jsonb_build_array('leg_press'))));
  checks := checks + 1; fails := fails || pg_temp.t49_is('9before', (select count(*)::text from public.gym_exercise_starts where gym_id = ga), '1');
  perform public.owner_save_machine_setup(kop, false, '[{"id":"leg_press","name":"Leg press","units":1,"ex":["leg_press"]}]'::jsonb);
  checks := checks + 1; fails := fails || pg_temp.t49_is('9after', (select count(*)::text from public.gym_exercise_starts where gym_id = ga), '0');
  checks := checks + 1; fails := fails || pg_temp.t49_is('9member', public.member_machine_busy(km2)->>'on', 'false');

  -- 10. The weekly guess and its self-check (gym B, a made-up quarter, the server's own clock passed in).
  --     Weeks 0-6: three members start the leg press every Monday at 7 pm; one member alone every Thursday at
  --     7 am. Weeks 7-9: the crowd moves about (Tuesday, Wednesday, then Friday at 7 pm).
  insert into public.gym_members(gym_id, name, key_hash) values (gb, 'B1', public._hash_key('t49-b1')) returning member_id into b1;
  insert into public.gym_members(gym_id, name, key_hash) values (gb, 'B2', public._hash_key('t49-b2')) returning member_id into b2;
  insert into public.gym_members(gym_id, name, key_hash) values (gb, 'B3', public._hash_key('t49-b3')) returning member_id into b3;
  insert into public.gym_members(gym_id, name, key_hash) values (gb, 'B4', public._hash_key('t49-b4')) returning member_id into b4;
  insert into public.gym_machine_setup(gym_id, enabled, machines) values (gb, true, public._mbusy_clean(
    '[{"id":"leg_press","name":"Leg press","units":1,"ex":["leg_press"]},{"id":"squat_rack","name":"Squat rack","units":2,"ex":["barbell_back_squat"]}]'));
  for k in 0 .. 9 loop
    wk := w0 + 7 * k;
    if k <= 6 then
      perform pg_temp.t49_start(gb, b1, wk, 19, 'leg_press');
      perform pg_temp.t49_start(gb, b2, wk, 19, 'leg_press');
      perform pg_temp.t49_start(gb, b3, wk, 19, 'leg_press');
    else
      n := case k when 7 then 1 when 8 then 2 else 4 end;
      perform pg_temp.t49_start(gb, b1, wk + n, 19, 'leg_press');
      perform pg_temp.t49_start(gb, b2, wk + n, 19, 'leg_press');
      perform pg_temp.t49_start(gb, b3, wk + n, 19, 'leg_press');
    end if;
    perform pg_temp.t49_start(gb, b4, wk + 3, 7, 'leg_press');
  end loop;

  -- Weeks 0-2: under 3 weeks of data before them, so no guess.
  for k in 0 .. 2 loop perform public._mbusy_refresh(gb, w0 + 7 * k + 2); end loop;
  checks := checks + 1; fails := fails || pg_temp.t49_is('10early', (select count(*)::text from public.gym_machine_guesses where gym_id = gb), '0');
  perform public._mbusy_refresh(gb, w0 + 21 + 2);
  checks := checks + 1; fails := fails || pg_temp.t49_is('10guess', (select busy::text from public.gym_machine_guesses where gym_id = gb and machine_id = 'leg_press' and week_start = w0 + 21), '{mon:19}');
  -- One member alone on Thursday morning is never "busy" (level 1 at most); Tuesday is quiet.
  r := (select levels from public.gym_machine_guesses where gym_id = gb and machine_id = 'leg_press' and week_start = w0 + 21);
  checks := checks + 1; fails := fails || pg_temp.t49_is('10levels', (r->'mon'->>19) || (r->'thu'->>7) || (r->'tue'->>19), '210');
  -- The guess for a week is made only once (a second refresh changes nothing).
  perform public._mbusy_refresh(gb, w0 + 21 + 4);
  checks := checks + 1; fails := fails || pg_temp.t49_is('10once', (select count(*)::text from public.gym_machine_guesses where gym_id = gb and machine_id = 'leg_press'), '1');
  checks := checks + 1; fails := fails || pg_temp.t49_is('10unchecked', (select count(*)::text from public.gym_machine_guesses where gym_id = gb and checked_at is not null), '0');

  -- Weeks 4-6: each refresh checks the week before; all right, but 3 checked weeks are not proof yet.
  for k in 4 .. 6 loop perform public._mbusy_refresh(gb, w0 + 7 * k + 2); end loop;
  checks := checks + 1; fails := fails || pg_temp.t49_is('10three', (public._mbusy_score(gb, 'leg_press'))::text, '{"proven": false, "weeksRight": 3, "weeksChecked": 3}');
  checks := checks + 1; fails := fails || pg_temp.t49_is('10hidden', (public._mbusy_member_view(gb, w0 + 44)->'machines')::text, '[]');
  -- The squat rack had nobody: its weeks say nothing (never proven, never shown).
  checks := checks + 1; fails := fails || pg_temp.t49_is('10rack', (public._mbusy_score(gb, 'squat_rack'))::text, '{"proven": false, "weeksRight": 0, "weeksChecked": 0}');

  -- Week 7: the fourth right week: proven, and members get this week's guess.
  perform public._mbusy_refresh(gb, w0 + 49 + 2);
  checks := checks + 1; fails := fails || pg_temp.t49_is('10proven', (public._mbusy_score(gb, 'leg_press'))::text, '{"proven": true, "weeksRight": 4, "weeksChecked": 4}');
  r := public._mbusy_member_view(gb, w0 + 49 + 2);
  checks := checks + 1; fails := fails || pg_temp.t49_is('10shown', (jsonb_array_length(r->'machines'))::text || '/' || (r->'machines'->0->>'id') || '/' || (r->'machines'->0->'week'->'mon'->>19), '1/leg_press/2');
  checks := checks + 1; fails := fails || pg_temp.t49_is('10noids', (r::text ~ (b1::text || '|' || b2::text || '|' || b3::text || '|' || b4::text))::text, 'false');
  r := public._mbusy_owner_view(gb, true, w0 + 49 + 2);
  checks := checks + 1; fails := fails || pg_temp.t49_is('10owner', r->'machines'->0->'check'->>'proven', 'true');

  -- Weeks 7 and 8 guessed Monday but the crowd came on Tuesday and Wednesday: wrong. 4 of the last 6 still holds ...
  perform public._mbusy_refresh(gb, w0 + 56 + 2);
  perform public._mbusy_refresh(gb, w0 + 63 + 2);
  checks := checks + 1; fails := fails || pg_temp.t49_is('10wrong2', (public._mbusy_score(gb, 'leg_press'))::text, '{"proven": true, "weeksRight": 4, "weeksChecked": 6}');
  checks := checks + 1; fails := fails || pg_temp.t49_is('10seen', (select seen_busy::text from public.gym_machine_guesses where gym_id = gb and machine_id = 'leg_press' and week_start = w0 + 49), '{tue:19}');
  -- ... and a third wrong week takes the proof away: members see nothing again.
  perform public._mbusy_refresh(gb, w0 + 70 + 2);
  checks := checks + 1; fails := fails || pg_temp.t49_is('10lost', (public._mbusy_score(gb, 'leg_press'))::text, '{"proven": false, "weeksRight": 3, "weeksChecked": 6}');
  checks := checks + 1; fails := fails || pg_temp.t49_is('10gone', (public._mbusy_member_view(gb, w0 + 72)->'machines')::text, '[]');
  -- Rows older than 63 days were cleaned up on the way.
  checks := checks + 1; fails := fails || pg_temp.t49_is('10clean', (select (min(day) >= w0 + 72 - 63)::text from public.gym_exercise_starts where gym_id = gb), 'true');
  -- Five members or more: the owner sees how many phones sent workouts.
  insert into public.gym_members(gym_id, name, key_hash) values (gb, 'B5', public._hash_key('t49-b5')) returning member_id into ma;
  perform pg_temp.t49_start(gb, ma, w0 + 70, 19, 'leg_press');
  checks := checks + 1; fails := fails || pg_temp.t49_is('10senders', public._mbusy_owner_view(gb, true, w0 + 72)->>'membersSending', '5');

  -- 11. A suspended gym: no saves, no pushes, no guesses; reading still works.
  perform public.owner_save_machine_setup(kop, true, '[{"id":"leg_press","name":"Leg press","units":1,"ex":["leg_press"]}]'::jsonb);
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = ga;
  perform set_config('forgeai.hq', 'off', true);
  checks := checks + 1; fails := fails || pg_temp.t49_is('11save', pg_temp.t49_run(format('select public.owner_save_machine_setup(%L, true, %L::jsonb)', kop, '[]')), 'SUSPENDED');
  checks := checks + 1; fails := fails || pg_temp.t49_is('11push', pg_temp.t49_run(format('select public.member_machine_push(%L, %L::jsonb)', km2, '[]')), 'SUSPENDED');
  checks := checks + 1; fails := fails || pg_temp.t49_is('11read', public.member_machine_busy(km2)->>'on', 'true');
  checks := checks + 1; fails := fails || pg_temp.t49_is('11owner', public.owner_machine_setup(kop)->>'enabled', 'true');
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'active' where gym_id = ga;
  perform set_config('forgeai.hq', 'off', true);

  -- 12. Anyone may call the four key-checked functions; nobody may call a helper or read a table.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_machine_busy(text)', 'execute')
     or not has_function_privilege('anon', 'public.member_machine_push(text, jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.owner_machine_setup(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_save_machine_setup(text, boolean, jsonb)', 'execute')
     or has_function_privilege('anon', 'public._mbusy_refresh(uuid, date)', 'execute')
     or has_function_privilege('authenticated', 'public._mbusy_member_view(uuid, date)', 'execute')
     or has_function_privilege('anon', 'public._mbusy_clean(jsonb)', 'execute') then fails := fails || ' 12fn'; end if;
  checks := checks + 1;
  if has_table_privilege('anon', 'public.gym_exercise_starts', 'select')
     or has_table_privilege('authenticated', 'public.gym_machine_guesses', 'select')
     or has_table_privilege('anon', 'public.gym_machine_setup', 'insert') then fails := fails || ' 12table'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
