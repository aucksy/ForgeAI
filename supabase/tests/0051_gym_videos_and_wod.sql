-- Gym form videos + workout of the day test (0051, F148 / F151). Runs in CI after every migration
-- (scripts/ci/db_checks.sh: a throw-away local Supabase applies every migration, then each test must end with
-- "RESULT PASS"). It can also be pasted into the SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

create or replace function pg_temp.t51_try(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t51_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- One crm_push of a workout plan whose one exercise carries this videoUrl (jsonb 'null' for none).
create or replace function pg_temp.t51_push_plan(p_key text, p_gym uuid, p_id text, p_video jsonb) returns text
  language plpgsql as $$
declare base bigint;
begin
  select crm_version into base from public.gyms where gym_id = p_gym;
  perform public.crm_push(p_key, base, jsonb_build_array(jsonb_build_object('k', 'workout_plan', 'id', p_id, 'd',
    jsonb_build_object('name', 'T51 plan', 'routines', jsonb_build_array(jsonb_build_object('name', 'Day 1', 'dayType', 'full',
      'exercises', jsonb_build_array(jsonb_build_object('name', 'Bench Press', 'catalogKey', 'bench_press', 'videoUrl', p_video)))),
      'assign', jsonb_build_object('memberIds', jsonb_build_array('m-asha'), 'planIds', '[]'::jsonb)))));
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

do $$
declare
  ga uuid; gb uuid; s_desk uuid;
  kown text := 't51-owner'; kdesk text := 't51-desk'; kb text := 't51-owner-b';
  ka text := 't51-m-asha'; kx text := 't51-m-bilal'; kfar text := 't51-m-far';
  r jsonb; w jsonb; fails text := ''; checks int := 0;
  td date := (now() at time zone 'Asia/Kolkata')::date;
  tds text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  tmr text := to_char((now() at time zone 'Asia/Kolkata')::date + 1, 'YYYY-MM-DD');
begin
  perform set_config('request.headers', '', true);
  insert into public.gyms(name, join_code, crm_version) values ('T51 Gym', 'T51GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T51 Other', 'T51GYB', 1) returning gym_id into gb;
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kown)), (gb, public._hash_key(kb));
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Ravi', '9876551002', 'staff') returning staff_id into s_desk;
  insert into public.gym_sessions(staff_id, key_hash) values (s_desk, public._hash_key(kdesk));
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values
    (ga, 'Asha', public._hash_key(ka), '+919829051001'),
    (ga, 'Bilal', public._hash_key(kx), null),
    (gb, 'Farah', public._hash_key(kfar), '+919829051003');
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829051001","archived":false,"createdAt":1}', 1),
    (gb, 'member', 'm-farah', '{"fullName":"Farah Ali","phone":"+919829051003","archived":false,"createdAt":1}', 1);

  -- ---------------------------------------------------------------- 1. the video rule
  fails := fails || pg_temp.t51_is('1a watch', public._video_url_ok('https://www.youtube.com/watch?v=dQw4w9WgXcQ')::text, 'true');
  fails := fails || pg_temp.t51_is('1b short', public._video_url_ok('https://youtu.be/dQw4w9WgXcQ?t=30')::text, 'true');
  fails := fails || pg_temp.t51_is('1c shorts', public._video_url_ok('https://youtube.com/shorts/abcDEF12345')::text, 'true');
  fails := fails || pg_temp.t51_is('1d mobile', public._video_url_ok('https://m.youtube.com/watch?v=abc')::text, 'true');
  fails := fails || pg_temp.t51_is('1e http', public._video_url_ok('http://www.youtube.com/watch?v=abc')::text, 'false');
  fails := fails || pg_temp.t51_is('1f other site', public._video_url_ok('https://vimeo.com/12345')::text, 'false');
  fails := fails || pg_temp.t51_is('1g lookalike', public._video_url_ok('https://youtube.com.evil.in/watch?v=abc')::text, 'false');
  fails := fails || pg_temp.t51_is('1h user@host', public._video_url_ok('https://youtube.com@evil.in/watch')::text, 'false');
  fails := fails || pg_temp.t51_is('1i port', public._video_url_ok('https://youtube.com:8080/watch?v=abc')::text, 'false');
  fails := fails || pg_temp.t51_is('1j space', public._video_url_ok('https://youtu.be/abc def')::text, 'false');
  fails := fails || pg_temp.t51_is('1k script', public._video_url_ok('javascript:alert(1)//youtube.com/')::text, 'false');
  fails := fails || pg_temp.t51_is('1l too long', public._video_url_ok('https://youtu.be/' || repeat('a', 300))::text, 'false');
  checks := checks + 12;

  -- ---------------------------------------------------------------- 2. videos ride in workout plans
  fails := fails || pg_temp.t51_is('2a good link saved', pg_temp.t51_push_plan(kdesk, ga, 'wp-1', to_jsonb('https://youtu.be/dQw4w9WgXcQ'::text)), 'ok');
  fails := fails || pg_temp.t51_is('2b no link saved', pg_temp.t51_push_plan(kown, ga, 'wp-2', 'null'::jsonb), 'ok');
  fails := fails || pg_temp.t51_is('2c other site refused', pg_temp.t51_push_plan(kown, ga, 'wp-3', to_jsonb('https://evil.in/v'::text)), 'INVALID');
  fails := fails || pg_temp.t51_is('2d number refused', pg_temp.t51_push_plan(kown, ga, 'wp-4', '42'::jsonb), 'INVALID');
  fails := fails || pg_temp.t51_is('2e not saved', (select count(*)::text from public.crm_records where gym_id = ga and kind = 'workout_plan'), '2');
  r := public.member_gym_plans(ka);
  fails := fails || pg_temp.t51_is('2f phone gets it',
    (select string_agg(coalesce(p->'routines'->0->'exercises'->0->>'videoUrl', '-'), ',' order by p->>'id') from jsonb_array_elements(r->'plans') p),
    'https://youtu.be/dQw4w9WgXcQ,-');
  checks := checks + 6;

  -- ---------------------------------------------------------------- 3. the gym sets a workout of the day
  w := jsonb_build_object('day', tds, 'name', '  Leg day  ', 'dayType', 'legs', 'note', 'Warm up first',
    'exercises', jsonb_build_array(
      jsonb_build_object('name', 'Squat', 'catalogKey', 'squat', 'sets', 4, 'repMin', 6, 'repMax', 8, 'videoUrl', 'https://youtu.be/abc123'),
      jsonb_build_object('name', 'Lunge', 'catalogKey', null, 'sets', 3, 'repMin', 10, 'repMax', 12, 'primary', jsonb_build_array('quads'))));
  r := public.owner_save_gym_wod(kdesk, w);
  fails := fails || pg_temp.t51_is('3a saved', (r->>'day') || '|' || (r->>'name') || '|' || (r->>'dayType') || '|' || (r->>'byName') || '|' ||
    jsonb_array_length(r->'exercises')::text, tds || '|Leg day|legs|Ravi|2');
  fails := fails || pg_temp.t51_is('3b video kept', r->'exercises'->0->>'videoUrl', 'https://youtu.be/abc123');
  -- The same day again replaces it; the old owner key stamps no person.
  r := public.owner_save_gym_wod(kown, w || jsonb_build_object('name', 'Leg day 2'));
  fails := fails || pg_temp.t51_is('3c replaced', (r->>'name') || '|' || coalesce(r->>'byName', '-') || '|' ||
    (select count(*)::text from public.gym_wods where gym_id = ga), 'Leg day 2|-|1');
  r := public.owner_save_gym_wod(kown, w || jsonb_build_object('day', tmr, 'name', 'Push'));
  r := public.owner_gym_wods(kdesk);
  fails := fails || pg_temp.t51_is('3d list', (r->>'today') || '|' || (select string_agg(x->>'name', ',' order by x->>'day') from jsonb_array_elements(r->'wods') x),
    tds || '|Leg day 2,Push');
  checks := checks + 4;

  -- ---------------------------------------------------------------- 4. what the save refuses
  fails := fails || pg_temp.t51_is('4a yesterday', pg_temp.t51_try(format('select public.owner_save_gym_wod(%L, %L::jsonb)', kown,
    w || jsonb_build_object('day', to_char(td - 1, 'YYYY-MM-DD')))), 'BAD_DATE');
  fails := fails || pg_temp.t51_is('4b too far', pg_temp.t51_try(format('select public.owner_save_gym_wod(%L, %L::jsonb)', kown,
    w || jsonb_build_object('day', to_char(td + 8, 'YYYY-MM-DD')))), 'BAD_DATE');
  fails := fails || pg_temp.t51_is('4c bad day', pg_temp.t51_try(format('select public.owner_save_gym_wod(%L, %L::jsonb)', kown,
    w || jsonb_build_object('day', '2026-02-31'))), 'BAD_DATE');
  fails := fails || pg_temp.t51_is('4d no exercises', pg_temp.t51_try(format('select public.owner_save_gym_wod(%L, %L::jsonb)', kown,
    w || jsonb_build_object('exercises', '[]'::jsonb))), 'INVALID');
  fails := fails || pg_temp.t51_is('4e no name', pg_temp.t51_try(format('select public.owner_save_gym_wod(%L, %L::jsonb)', kown,
    w || jsonb_build_object('name', '  '))), 'INVALID');
  fails := fails || pg_temp.t51_is('4f bad video', pg_temp.t51_try(format('select public.owner_save_gym_wod(%L, %L::jsonb)', kown,
    w || jsonb_build_object('exercises', jsonb_build_array(jsonb_build_object('name', 'Squat', 'videoUrl', 'https://evil.in/x'))))), 'INVALID');
  fails := fails || pg_temp.t51_is('4g bad kind', pg_temp.t51_try(format('select public.owner_save_gym_wod(%L, %L::jsonb)', kown,
    w || jsonb_build_object('dayType', 'cardio'))), 'INVALID');
  fails := fails || pg_temp.t51_is('4h long note', pg_temp.t51_try(format('select public.owner_save_gym_wod(%L, %L::jsonb)', kown,
    w || jsonb_build_object('note', repeat('a', 501)))), 'INVALID');
  fails := fails || pg_temp.t51_is('4i bad key', pg_temp.t51_try(format('select public.owner_save_gym_wod(%L, %L::jsonb)', 'no-such-key', w)), 'BAD_KEY');
  fails := fails || pg_temp.t51_is('4j member key', pg_temp.t51_try(format('select public.owner_gym_wods(%L)', ka)), 'BAD_KEY');
  fails := fails || pg_temp.t51_is('4k nothing changed', (select routine->>'name' from public.gym_wods where gym_id = ga and day = td), 'Leg day 2');
  checks := checks + 11;

  -- ---------------------------------------------------------------- 5. the member reads today's
  r := public.member_gym_wod(ka);
  fails := fails || pg_temp.t51_is('5a today', (r->>'ok') || '|' || (r->>'gymName') || '|' || (r->>'today') || '|' || (r->'wod'->>'name') || '|' ||
    (r->'wod'->>'note'), 'true|T51 Gym|' || tds || '|Leg day 2|Warm up first');
  fails := fails || pg_temp.t51_is('5b no phone yet', public.member_gym_wod(kx)->>'error', 'NO_PHONE');
  fails := fails || pg_temp.t51_is('5c bad key', pg_temp.t51_try(format('select public.member_gym_wod(%L)', 'nobody')), 'BAD_KEY');
  checks := checks + 3;

  -- ---------------------------------------------------------------- 6. one gym never reaches another
  fails := fails || pg_temp.t51_is('6a other gym sees none', jsonb_array_length(public.owner_gym_wods(kb)->'wods')::text, '0');
  fails := fails || pg_temp.t51_is('6b other gym cannot clear', public.owner_clear_gym_wod(kb, tds)::text, 'false');
  fails := fails || pg_temp.t51_is('6c still there', (select count(*)::text from public.gym_wods where gym_id = ga), '2');
  r := public.owner_save_gym_wod(kb, w || jsonb_build_object('name', 'Other gym day'));
  fails := fails || pg_temp.t51_is('6d own day only', (select routine->>'name' from public.gym_wods where gym_id = ga and day = td) || '|' ||
    (select routine->>'name' from public.gym_wods where gym_id = gb and day = td), 'Leg day 2|Other gym day');
  fails := fails || pg_temp.t51_is('6e member of other gym', public.member_gym_wod(kfar)->'wod'->>'name', 'Other gym day');
  fails := fails || pg_temp.t51_is('6f member of this gym', public.member_gym_wod(ka)->'wod'->>'name', 'Leg day 2');
  checks := checks + 6;

  -- ---------------------------------------------------------------- 7. take it off; a suspended gym is read-only
  fails := fails || pg_temp.t51_is('7a cleared', public.owner_clear_gym_wod(kdesk, tds)::text, 'true');
  fails := fails || pg_temp.t51_is('7b member sees none', coalesce(public.member_gym_wod(ka)->>'wod', '-') || '|' || (public.member_gym_wod(ka)->>'ok'), '-|true');
  fails := fails || pg_temp.t51_is('7c again', public.owner_clear_gym_wod(kdesk, tds)::text, 'false');
  fails := fails || pg_temp.t51_is('7d bad day', pg_temp.t51_try(format('select public.owner_clear_gym_wod(%L, %L)', kdesk, 'soon')), 'BAD_DATE');
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = ga;
  perform set_config('forgeai.hq', 'off', true);
  fails := fails || pg_temp.t51_is('7e suspended', pg_temp.t51_try(format('select public.owner_save_gym_wod(%L, %L::jsonb)', kown, w)), 'SUSPENDED');
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'active' where gym_id = ga;
  perform set_config('forgeai.hq', 'off', true);
  checks := checks + 5;

  -- ---------------------------------------------------------------- 8. the table stays closed
  fails := fails || pg_temp.t51_is('8a closed', (has_table_privilege('anon', 'public.gym_wods', 'select')
    or has_table_privilege('authenticated', 'public.gym_wods', 'insert'))::text, 'false');
  fails := fails || pg_temp.t51_is('8b helper closed', has_function_privilege('anon', 'public._wod_clean(jsonb)', 'execute')::text, 'false');
  checks := checks + 2;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
