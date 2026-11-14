-- The gym's news pops up on the member's phone (0073). Runs in CI after every migration (scripts/ci/db_checks.sh);
-- can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

create or replace function pg_temp.t73_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t73_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gb uuid;
  ma uuid; mb uuid; mc uuid; md uuid; mz uuid;
  ka text := 't73-member-a'; kb text := 't73-member-b'; kc text := 't73-member-c'; kd text := 't73-member-d';
  wref uuid; dp uuid; ms uuid; ch uuid;
  fails text := ''; checks int := 0; r jsonb; n int;
  plan jsonb := '{"name":"Push  Pull Legs","routines":[{"name":"Push","exercises":[{"name":"Bench Press"}]}],"assign":{"memberIds":["t73-r-asha"],"planIds":[]}}';
begin
  update public.member_push_notes set done_at = now() where done_at is null;

  insert into public.gyms(name, join_code, crm_version) values ('T73 Gym', 'T73GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T73 Other', 'T73GYB', 1) returning gym_id into gb;
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Asha Rao', public._hash_key(ka), '9876507301') returning member_id into ma;
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Bina', public._hash_key(kb), '9876507302') returning member_id into mb;
  -- Chetan has the app but keeps no push address: never a row.
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Chetan', public._hash_key(kc), '9876507303') returning member_id into mc;
  -- Dev's number is on two list entries: the app cannot tell which one is him, so nothing reaches him by name.
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Dev', public._hash_key(kd), '9876507304') returning member_id into md;
  insert into public.gym_members(gym_id, name, key_hash) values (gb, 'Zoya', public._hash_key('t73-member-z')) returning member_id into mz;
  perform public.member_save_push_token(ka, 't73-token-aaaaaaaaaaaaaaaaaaaa');
  perform public.member_save_push_token(kb, 't73-token-bbbbbbbbbbbbbbbbbbbb');
  perform public.member_save_push_token(kd, 't73-token-dddddddddddddddddddd');
  perform public.member_save_push_token('t73-member-z', 't73-token-zzzzzzzzzzzzzzzzzzzz');
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 't73-r-asha', '{"fullName":"Asha Rao","phone":"9876507301"}', 1),
    (gid, 'member', 't73-r-bina', '{"fullName":"Bina Shah","phone":"9876507302"}', 1),
    (gid, 'member', 't73-r-chetan', '{"fullName":"Chetan","phone":"9876507303"}', 1),
    (gid, 'member', 't73-r-dev', '{"fullName":"Dev","phone":"9876507304"}', 1),
    (gid, 'member', 't73-r-dev2', '{"fullName":"Devika","phone":"9876507304"}', 1),
    (gid, 'membership', 't73-ms-bina', jsonb_build_object('memberId', 't73-r-bina', 'planId', 'monthly',
       'startsOn', to_char((now() at time zone 'Asia/Kolkata')::date - 5, 'YYYY-MM-DD'),
       'endsOn', to_char((now() at time zone 'Asia/Kolkata')::date + 25, 'YYYY-MM-DD')), 1);

  -- 1. A new workout plan to Asha: one note, her own, opening the Workout tab, spaces tidied.
  insert into public.crm_records(gym_id, kind, id, data, version) values (gid, 'workout_plan', 't73-wp', plan, 2);
  wref := md5(gid::text || ':workout_plan:t73-wp')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t73_is('1one', (select count(*) from public.member_push_notes where ref_id = wref)::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t73_is('1who', (select member_id::text || ' ' || kind || ' ' || route from public.member_push_notes where ref_id = wref), ma::text || ' workout_plan /workout');
  checks := checks + 1; fails := fails || pg_temp.t73_is('1line', (select line from public.member_push_notes where ref_id = wref), 'New workout plan from your gym: Push Pull Legs. Tap to see it on the Workout tab.');

  -- 2. The same plan pushed again (another device's sync, a note edit): no second note.
  update public.crm_records set data = plan || '{"note":"Warm up first"}', version = 3 where gym_id = gid and kind = 'workout_plan' and id = 't73-wp';
  checks := checks + 1; fails := fails || pg_temp.t73_is('2same', (select count(*) from public.member_push_notes where ref_id = wref)::text, '1');

  -- 3. The routines change: Asha hears it changed. Bina is added by her membership plan: she gets "new".
  update public.crm_records set data = jsonb_set(jsonb_set(plan, '{routines,0,exercises}', '[{"name":"Bench Press"},{"name":"Dip"}]'),
      '{assign,planIds}', '["monthly"]'), version = 4
   where gym_id = gid and kind = 'workout_plan' and id = 't73-wp';
  checks := checks + 1; fails := fails || pg_temp.t73_is('3count', (select count(*) from public.member_push_notes where ref_id = wref)::text, '3');
  checks := checks + 1; fails := fails || pg_temp.t73_is('3asha', (select line from public.member_push_notes where ref_id = wref and member_id = ma and tag not like '%:new:%'),
    'Your gym changed your workout plan: Push Pull Legs. Tap to see it on the Workout tab.');
  checks := checks + 1; fails := fails || pg_temp.t73_is('3bina', (select line from public.member_push_notes where ref_id = wref and member_id = mb), 'New workout plan from your gym: Push Pull Legs. Tap to see it on the Workout tab.');

  -- 4. Withdrawn: nothing. Sent to Chetan (no push address) and Dev (shared number): nothing either.
  update public.crm_records set data = plan || '{"withdrawn":true,"assign":{"memberIds":["t73-r-chetan","t73-r-dev"],"planIds":[]}}', version = 5
   where gym_id = gid and kind = 'workout_plan' and id = 't73-wp';
  insert into public.crm_records(gym_id, kind, id, data, version)
    values (gid, 'workout_plan', 't73-wp2', jsonb_set(plan, '{assign,memberIds}', '["t73-r-chetan","t73-r-dev"]'), 6);
  checks := checks + 1; fails := fails || pg_temp.t73_is('4none', (select count(*) from public.member_push_notes where gym_id = gid and kind = 'workout_plan')::text, '3');

  -- 5. A diet plan: new to Asha, then its meals change; a change to the notes text alone counts as a change too.
  insert into public.gym_diet_plans(gym_id, title, meals, assign) values (gid, 'Lean bulk', '[{"name":"Breakfast","items":["Oats"]}]',
    '{"memberIds":["t73-r-asha"],"planIds":[]}') returning plan_id into dp;
  checks := checks + 1; fails := fails || pg_temp.t73_is('5new', (select line || ' ' || route from public.member_push_notes where ref_id = dp), 'New diet plan from your gym: Lean bulk. Tap to see your meals. /shop/diet');
  update public.gym_diet_plans set updated_at = now() where plan_id = dp;
  checks := checks + 1; fails := fails || pg_temp.t73_is('5touch', (select count(*) from public.member_push_notes where ref_id = dp)::text, '1');
  update public.gym_diet_plans set meals = '[{"name":"Breakfast","items":["Oats","Eggs"]}]' where plan_id = dp;
  checks := checks + 1; fails := fails || pg_temp.t73_is('5changed', (select count(*) from public.member_push_notes where ref_id = dp and line like 'Your gym changed your diet plan: Lean bulk.%')::text, '1');
  update public.gym_diet_plans set withdrawn = true where plan_id = dp;
  update public.gym_diet_plans set withdrawn = false where plan_id = dp;
  -- Sent again after it was taken back: "new" again would be a second "new" tag, which already exists: still 2.
  checks := checks + 1; fails := fails || pg_temp.t73_is('5back', (select count(*) from public.member_push_notes where ref_id = dp)::text, '2');

  -- 6. Measurements saved for Asha: a note with the day, never the numbers; for Dev (shared number) none.
  insert into public.gym_body_measurements(gym_id, member_id, measured_on, weight_kg) values (gid, 't73-r-asha', date '2026-11-14', 72.5) returning measure_id into ms;
  checks := checks + 1; fails := fails || pg_temp.t73_is('6line', (select line || ' ' || route from public.member_push_notes where ref_id = ms),
    'Your gym saved your body measurements from 14 Nov. Tap to see them. /measures');
  insert into public.gym_body_measurements(gym_id, member_id, measured_on, weight_kg) values (gid, 't73-r-dev', date '2026-11-14', 80) returning measure_id into ms;
  checks := checks + 1; fails := fails || pg_temp.t73_is('6dev', (select count(*) from public.member_push_notes where ref_id = ms)::text, '0');

  -- 7. A new challenge: every member of THIS gym with a push address (Asha, Bina, Dev), not Chetan, not Zoya.
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days)
    values (gid, 'November 12', 'workouts', 12, (now() at time zone 'Asia/Kolkata')::date + 2, (now() at time zone 'Asia/Kolkata')::date + 16, 7) returning id into ch;
  checks := checks + 1; fails := fails || pg_temp.t73_is('7who', (select string_agg(m.name, ',' order by m.name) from public.member_push_notes x join public.gym_members m on m.member_id = x.member_id where x.ref_id = ch), 'Asha Rao,Bina,Dev');
  checks := checks + 1; fails := fails || pg_temp.t73_is('7line', (select line from public.member_push_notes where ref_id = ch and member_id = ma),
    format('New challenge at your gym: November 12, %s to %s. Tap to see it on the leaderboard.',
           public._note_day((now() at time zone 'Asia/Kolkata')::date + 2), public._note_day((now() at time zone 'Asia/Kolkata')::date + 16)));
  -- An old challenge (already over) written back: nothing.
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days)
    values (gid, 'Old one', 'workouts', 12, date '2020-01-01', date '2020-01-20', 0) returning id into ch;
  checks := checks + 1; fails := fails || pg_temp.t73_is('7old', (select count(*) from public.member_push_notes where ref_id = ch)::text, '0');

  -- 8. Fee requests from the HQ Worker: Bina's once (handing it twice changes nothing), a bad id skipped.
  r := public.hq_fee_request_notes(jsonb_build_array(
    jsonb_build_object('id', 'pr_t73aaaaaaaa', 'gymId', gid, 'rosterId', 't73-r-bina', 'label', 'Monthly  plan'),
    jsonb_build_object('id', 'bad id', 'gymId', gid, 'rosterId', 't73-r-asha', 'label', 'x'),
    jsonb_build_object('id', 'pr_t73bbbbbbbb', 'gymId', gid, 'rosterId', 't73-r-asha', 'label', '')));
  checks := checks + 1; fails := fails || pg_temp.t73_is('8made', r->>'notes', '2');
  perform public.hq_fee_request_notes(jsonb_build_array(jsonb_build_object('id', 'pr_t73aaaaaaaa', 'gymId', gid, 'rosterId', 't73-r-bina', 'label', 'Monthly plan')));
  checks := checks + 1; fails := fails || pg_temp.t73_is('8once', (select count(*) from public.member_push_notes where kind = 'fee_request' and gym_id = gid)::text, '2');
  checks := checks + 1; fails := fails || pg_temp.t73_is('8line', (select line || ' ' || route from public.member_push_notes where kind = 'fee_request' and member_id = mb),
    'Your gym asked you to pay for Monthly plan. Tap to pay in the app. /shop');
  checks := checks + 1; fails := fails || pg_temp.t73_is('8nolabel', (select line from public.member_push_notes where kind = 'fee_request' and member_id = ma),
    'Your gym asked you to pay your fee. Tap to pay in the app.');
  checks := checks + 1; fails := fails || pg_temp.t73_is('8invalid', pg_temp.t73_run('select public.hq_fee_request_notes(''{}''::jsonb)'), 'INVALID');

  -- 9. The 0054 sender hands the new kinds out like any note.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  r := public.hq_push_direct_next(500);
  checks := checks + 1; fails := fails || pg_temp.t73_is('9kinds', (select string_agg(distinct x->>'kind', ',' order by x->>'kind') from jsonb_array_elements(r->'notes') x),
    'challenge,diet_plan,fee_request,measurement,workout_plan');

  -- 10. Who may call: the HQ key only; the helpers nobody.
  checks := checks + 1;
  if has_function_privilege('anon', 'public.hq_fee_request_notes(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hq_fee_request_notes(jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.hq_fee_request_notes(jsonb)', 'execute')
     or has_function_privilege('anon', 'public._roster_app_members(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public._push_note_workout_plan()', 'execute') then fails := fails || ' 10'; end if;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  checks := checks + 1; fails := fails || pg_temp.t73_is('10guard', pg_temp.t73_run('select public.hq_fee_request_notes(''[]''::jsonb)'), 'HQ_ONLY');
  perform set_config('request.jwt.claims', '', true);

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
