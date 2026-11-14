-- Training progress over 12 months test (0084, R-537). Runs in CI after every migration (scripts/ci/db_checks.sh);
-- can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

-- Run one statement: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t84_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t84_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  ga uuid; s_owner uuid; s_tr uuid; ma uuid;
  kop text := 't84-owner-session'; kt text := 't84-trainer-session';
  ka text := 't84-member-asha'; kb text := 't84-member-bilal';
  fails text := ''; checks int := 0; r jsonb;
  td date := (now() at time zone 'Asia/Kolkata')::date;
  mon date := td - (extract(isodow from td)::int - 1);
  good jsonb; year jsonb; one jsonb;
begin
  good := jsonb_build_object(
    'weeks', jsonb_build_array(jsonb_build_object('w', to_char(mon, 'YYYY-MM-DD'), 'n', 3, 'kg', 12480)),
    'best', jsonb_build_array(jsonb_build_object('n', 'Bench press', 'w', 60, 'r', 8, 't', 40)),
    'records', '[]'::jsonb,
    'last', to_char(td - 1, 'YYYY-MM-DD'));
  -- 200 workouts over 360 days (one every ~1.8 days), 6 exercises each: a busy year.
  year := (select jsonb_agg(jsonb_build_object('d', to_char(td - (i * 9 / 5), 'YYYY-MM-DD'), 'n', 'Push day', 'notes', 'secret',
            'x', (select jsonb_agg(jsonb_build_object('n', 'Exercise ' || k, 'w', 40 + i % 20, 'r', 8, 's', 4, 'rpe', 9))
                    from generate_series(1, 6) k)))
           from generate_series(1, 200) i);
  one := jsonb_build_object('d', to_char(td - 2, 'YYYY-MM-DD'), 'n', 'A', 'x', '[]'::jsonb);

  insert into public.gyms(name, join_code, crm_version) values ('T84 Gym', 'T84GYA', 1) returning gym_id into ga;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner Singh', '9876508401', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Rohit Sharma', '9876508402', 'staff') returning staff_id into s_tr;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_tr, public._hash_key(kt));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829084001"}', 1),
    (ga, 'member', 'm-bilal', '{"fullName":"Bilal Khan","phone":"+919829084002"}', 1);
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (ga, 'Asha', '+919829084001', public._hash_key(ka)) returning member_id into ma;
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (ga, 'Bilal', '+919829084002', public._hash_key(kb));

  -- 1. A year is taken, checked and rebuilt: 200 workouts, newest first, notes and rpe dropped.
  checks := checks + 1; fails := fails || pg_temp.t84_is('1on', public.member_trainer_share3(ka, good, year)->>'on', 'true');
  r := public.owner_member_progress(kop, 'm-asha');
  checks := checks + 1; fails := fails || pg_temp.t84_is('1read', (r->>'shared') || '/' || (r->>'hasRecent') || '/' || jsonb_array_length(r->'recent'), 'true/true/200');
  checks := checks + 1; fails := fails || pg_temp.t84_is('1newest', r->'recent'->0->>'d', to_char(td - 1, 'YYYY-MM-DD'));
  checks := checks + 1; fails := fails || pg_temp.t84_is('1oldest', r->'recent'->199->>'d', to_char(td - 360, 'YYYY-MM-DD'));
  checks := checks + 1; fails := fails || pg_temp.t84_is('1clean', (r->'recent'->0 ? 'notes')::text || '/' || (r->'recent'->0->'x'->0 ? 'rpe')::text
    || '/' || (r->'recent'->0->'x'->0->>'n'), 'false/false/Exercise 1');

  -- 2. The limits: more than 400 workouts, more than 20 exercises, too long, not a list, a bad day: refused.
  checks := checks + 1; fails := fails || pg_temp.t84_is('2toomany', pg_temp.t84_run(format('select public.member_trainer_share3(%L, %L::jsonb, %L::jsonb)', ka, good,
    (select jsonb_agg(one) from generate_series(1, 401)))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t84_is('2fourhundred', pg_temp.t84_run(format('select public.member_trainer_share3(%L, %L::jsonb, %L::jsonb)', ka, good,
    (select jsonb_agg(one) from generate_series(1, 400)))), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t84_is('2exercises', pg_temp.t84_run(format('select public.member_trainer_share3(%L, %L::jsonb, %L::jsonb)', ka, good,
    jsonb_build_array(jsonb_build_object('d', to_char(td, 'YYYY-MM-DD'), 'n', 'A',
      'x', (select jsonb_agg(jsonb_build_object('n', 'E' || k, 'w', 10, 'r', 5, 's', 1)) from generate_series(1, 21) k))))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t84_is('2long', pg_temp.t84_run(format('select public.member_trainer_share3(%L, %L::jsonb, %L::jsonb)', ka, good,
    (select jsonb_agg(jsonb_build_object('d', to_char(td, 'YYYY-MM-DD'), 'n', repeat('x', 1000), 'x', '[]'::jsonb)) from generate_series(1, 301)))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t84_is('2notarray', pg_temp.t84_run(format('select public.member_trainer_share3(%L, %L::jsonb, %L::jsonb)', ka, good, '{}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t84_is('2badday', pg_temp.t84_run(format('select public.member_trainer_share3(%L, %L::jsonb, %L::jsonb)', ka, good,
    '[{"d":"2026-02-30","n":"A","x":[]}]')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t84_is('2heavy', pg_temp.t84_run(format('select public.member_trainer_share3(%L, %L::jsonb, %L::jsonb)', ka, good,
    jsonb_build_array(jsonb_build_object('d', to_char(td, 'YYYY-MM-DD'), 'n', 'A', 'x', jsonb_build_array(jsonb_build_object('n', 'A', 'w', 1001, 'r', 1, 's', 1)))))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t84_is('2badkey', pg_temp.t84_run(format('select public.member_trainer_share3(%L, %L::jsonb, %L::jsonb)', 'nope', good, '[]')), 'BAD_KEY');

  -- 3. Older than a year (or more than a day ahead) is dropped, not refused.
  perform public.member_trainer_share3(ka, good, jsonb_build_array(
    jsonb_build_object('d', to_char(td - 366, 'YYYY-MM-DD'), 'n', 'Kept', 'x', '[]'::jsonb),
    jsonb_build_object('d', to_char(td - 367, 'YYYY-MM-DD'), 'n', 'Old', 'x', '[]'::jsonb),
    jsonb_build_object('d', to_char(td + 5, 'YYYY-MM-DD'), 'n', 'Ahead', 'x', '[]'::jsonb)));
  checks := checks + 1; fails := fails || pg_temp.t84_is('3year', (select string_agg(w->>'n', ',') from jsonb_array_elements(public.owner_member_progress(kop, 'm-asha')->'recent') w), 'Kept');

  -- 4. Who reads it: unchanged from 0053 (the owner; the member's own ticked trainer; nobody else).
  perform public.member_trainer_share3(ka, good, year);
  checks := checks + 1; fails := fails || pg_temp.t84_is('4untrained', pg_temp.t84_run(format('select public.owner_member_progress(%L, %L)', kt, 'm-asha')), 'TRAINER_ONLY');
  perform public.owner_set_trainer(kop, s_tr, true);
  checks := checks + 1; fails := fails || pg_temp.t84_is('4other', public.owner_member_progress(kt, 'm-asha')->>'allowed', 'false');
  perform public.owner_assign_trainer(kop, 'm-asha', s_tr);
  checks := checks + 1; fails := fails || pg_temp.t84_is('4trainer', jsonb_array_length(public.owner_member_progress(kt, 'm-asha')->'recent')::text, '200');

  -- 5. An older phone (0053's share2) still sends 3 months, 30 workouts at most.
  checks := checks + 1; fails := fails || pg_temp.t84_is('5old', pg_temp.t84_run(format('select public.member_trainer_share2(%L, %L::jsonb, %L::jsonb)', kb, good,
    (select jsonb_agg(one) from generate_series(1, 31)))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t84_is('5oldok', public.member_trainer_share2(kb, good, jsonb_build_array(one))->>'on', 'true');

  -- 6. Off deletes the year at once; leaving the gym too.
  perform public.member_trainer_stop(ka);
  checks := checks + 1; fails := fails || pg_temp.t84_is('6off', (public.owner_member_progress(kop, 'm-asha')->>'shared') || '/' ||
    (select count(*)::text from public.gym_progress_summaries where member_id = ma), 'false/0');
  perform public.member_trainer_share3(ka, good, year);
  perform public.member_leave(ka);
  checks := checks + 1; fails := fails || pg_temp.t84_is('6left', (select count(*)::text from public.gym_progress_summaries where member_id = ma), '0');

  -- 7. Anyone may call the key-checked function; nobody may call the helper.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_trainer_share3(text, jsonb, jsonb)', 'execute')
     or has_function_privilege('anon', 'public._trainer_year_clean(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public._trainer_year_clean(jsonb)', 'execute') then fails := fails || ' 7fn'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
