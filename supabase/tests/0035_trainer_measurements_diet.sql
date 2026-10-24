-- Trainer measurements + diet plans test (0035). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

-- Run one statement: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t35_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t35_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gb uuid; s_owner uuid; s_staff uuid;
  kop text := 't35-owner-session'; ks text := 't35-staff-session'; kob text := 't35-owner-b';
  ka text := 't35-member-a'; kb text := 't35-member-b'; kc text := 't35-member-c'; kz text := 't35-member-z';
  td date := (now() at time zone 'Asia/Kolkata')::date;
  d1 text := to_char(td - 30, 'YYYY-MM-DD'); d2 text := to_char(td, 'YYYY-MM-DD');
  fails text := ''; checks int := 0; r jsonb; c text; e1 text; e2 text; dp1 text; dpg text;
  meals jsonb := '[{"name":"Breakfast","time":"8:00 am","items":["2 besan chilla","1 glass milk"]},{"name":"Lunch","items":["2 roti, dal, sabzi"]}]';
begin
  insert into public.gyms(name, join_code, crm_version) values ('T35 Gym', 'T35GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T35 Other', 'T35GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner', '9876500351', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Ravi', '9876500352', 'staff') returning staff_id into s_staff;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_staff, public._hash_key(ks));
  insert into public.gym_owner_keys(gym_id, key_hash) values (gb, public._hash_key(kob));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'plan', 'pl-gold', '{"name":"Gold","durationUnit":"month","durationCount":3,"priceP":300000}', 1),
    (gid, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829012345"}', 1),
    (gid, 'member', 'm-bilal', '{"fullName":"Bilal Khan","phone":"9829054321"}', 1),
    (gid, 'member', 'm-chand', '{"fullName":"Chand Rao","phone":"9829000003"}', 1),
    (gb, 'member', 'm-zoya', '{"fullName":"Zoya Ali","phone":"9829012345"}', 1),
    -- Bilal is on Gold today; Chand's Gold ended last month.
    (gid, 'membership', 'ms-b', jsonb_build_object('memberId','m-bilal','planId','pl-gold','startsOn', to_char(td - 5, 'YYYY-MM-DD'),
       'endsOn', to_char(td + 80, 'YYYY-MM-DD'), 'cancelled', false), 1),
    (gid, 'membership', 'ms-c', jsonb_build_object('memberId','m-chand','planId','pl-gold','startsOn', to_char(td - 120, 'YYYY-MM-DD'),
       'endsOn', to_char(td - 30, 'YYYY-MM-DD'), 'cancelled', false), 1);
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values
    (gid, 'Asha', '+919829012345', public._hash_key(ka)),
    (gid, 'Bilal', '+919829054321', public._hash_key(kb)),
    (gid, 'Chand', '+919829000003', public._hash_key(kc)),
    (gb, 'Zoya', '+919829012345', public._hash_key(kz));

  -- ================================================================ measurements
  -- 1. The trainer (a front-desk session) measures Asha a month ago; numbers rounded to 0.1; who
  --    measured comes from the session, not the device.
  r := public.owner_save_measurement(ks, 'm-asha', jsonb_build_object('date', d1, 'weightKg', 72.46, 'bodyFat', 24,
         'tape', jsonb_build_object('waist', 84, 'arm', 31.25), 'note', 'Before the plan', 'byName', 'Someone else'));
  e1 := r->>'id';
  checks := checks + 1; fails := fails || pg_temp.t35_is('1by', r->>'byName', 'Ravi');
  checks := checks + 1; fails := fails || pg_temp.t35_is('1kg', r->>'weightKg', '72.5');
  checks := checks + 1; fails := fails || pg_temp.t35_is('1arm', r->'tape'->>'arm', '31.3');
  -- And today, by the owner (only the waist).
  r := public.owner_save_measurement(kop, 'm-asha', jsonb_build_object('date', d2, 'tape', jsonb_build_object('waist', 81.5)));
  e2 := r->>'id';
  checks := checks + 1; fails := fails || pg_temp.t35_is('1owner', r->>'byName', 'Owner');

  -- 2. The same day twice, and bad entries, are refused.
  checks := checks + 1; fails := fails || pg_temp.t35_is('2day', pg_temp.t35_run(format(
    'select public.owner_save_measurement(%L, %L, %L::jsonb)', ks, 'm-asha', jsonb_build_object('date', d2, 'weightKg', 70))), 'DAY_TAKEN');
  checks := checks + 1; fails := fails || pg_temp.t35_is('2future', pg_temp.t35_run(format(
    'select public.owner_save_measurement(%L, %L, %L::jsonb)', ks, 'm-asha', jsonb_build_object('date', to_char(td + 1, 'YYYY-MM-DD'), 'weightKg', 70))), 'BAD_DATE');
  checks := checks + 1; fails := fails || pg_temp.t35_is('2empty', pg_temp.t35_run(format(
    'select public.owner_save_measurement(%L, %L, %L::jsonb)', ks, 'm-bilal', jsonb_build_object('date', d2, 'tape', '{}'::jsonb))), 'EMPTY');
  checks := checks + 1; fails := fails || pg_temp.t35_is('2kind', pg_temp.t35_run(format(
    'select public.owner_save_measurement(%L, %L, %L::jsonb)', ks, 'm-bilal', jsonb_build_object('date', d2, 'tape', jsonb_build_object('wrist', 17)))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t35_is('2heavy', pg_temp.t35_run(format(
    'select public.owner_save_measurement(%L, %L, %L::jsonb)', ks, 'm-bilal', jsonb_build_object('date', d2, 'weightKg', 500))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t35_is('2text', pg_temp.t35_run(format(
    'select public.owner_save_measurement(%L, %L, %L::jsonb)', ks, 'm-bilal', jsonb_build_object('date', d2, 'weightKg', '70'))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t35_is('2nomember', pg_temp.t35_run(format(
    'select public.owner_save_measurement(%L, %L, %L::jsonb)', ks, 'm-nobody', jsonb_build_object('date', d2, 'weightKg', 70))), 'NO_MEMBER');

  -- 3. The owner fixes the first entry: the value changes, who measured stays Ravi.
  r := public.owner_save_measurement(kop, 'm-asha', jsonb_build_object('id', e1, 'date', d1, 'weightKg', 72.8, 'bodyFat', 24,
         'tape', jsonb_build_object('waist', 84)));
  checks := checks + 1; fails := fails || pg_temp.t35_is('3kg', r->>'weightKg', '72.8');
  checks := checks + 1; fails := fails || pg_temp.t35_is('3by', r->>'byName', 'Ravi');
  checks := checks + 1; fails := fails || pg_temp.t35_is('3arm', r->'tape'->>'arm', null);
  -- Moving it onto a day that has one: DAY_TAKEN.
  checks := checks + 1; fails := fails || pg_temp.t35_is('3move', pg_temp.t35_run(format(
    'select public.owner_save_measurement(%L, %L, %L::jsonb)', kop, 'm-asha', jsonb_build_object('id', e1, 'date', d2, 'weightKg', 70))), 'DAY_TAKEN');

  -- 4. The gym's list for Asha: newest day first.
  r := public.owner_member_measurements(ks, 'm-asha');
  checks := checks + 1;
  if jsonb_array_length(r) <> 2 or r->0->>'id' <> e2 or r->1->>'id' <> e1 or r->1->>'note' <> 'Before the plan' then fails := fails || ' 4:' || r::text; end if;

  -- 5. Another gym's owner sees, changes and deletes nothing of this gym's.
  r := public.owner_member_measurements(kob, 'm-asha');
  checks := checks + 1; fails := fails || pg_temp.t35_is('5list', jsonb_array_length(r)::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t35_is('5save', pg_temp.t35_run(format(
    'select public.owner_save_measurement(%L, %L, %L::jsonb)', kob, 'm-asha', jsonb_build_object('date', d2, 'weightKg', 70))), 'NO_MEMBER');
  checks := checks + 1; fails := fails || pg_temp.t35_is('5edit', pg_temp.t35_run(format(
    'select public.owner_save_measurement(%L, %L, %L::jsonb)', kob, 'm-zoya', jsonb_build_object('id', e1, 'date', d2, 'weightKg', 70))), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t35_is('5delete', pg_temp.t35_run(format(
    'select public.owner_delete_measurement(%L, %L::uuid)', kob, e1)), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t35_is('5still', (select count(*)::text from public.gym_body_measurements where gym_id = gid), '2');

  -- 6. Asha reads her own two (no desk note); Bilal reads only his; Zoya (other gym, same number) nothing of these.
  perform public.owner_save_measurement(ks, 'm-bilal', jsonb_build_object('date', d2, 'weightKg', 88));
  r := public.member_measurements(ka);
  checks := checks + 1;
  if r->>'ok' is distinct from 'true' or r->>'gymName' <> 'T35 Gym' or jsonb_array_length(r->'entries') <> 2
     or r->'entries'->0->>'id' <> e2 or r->'entries'->1->>'weightKg' <> '72.8' or r->'entries'->1->>'byName' <> 'Ravi'
     or r->'entries'->1 ? 'note' then fails := fails || ' 6a:' || r::text; end if;
  r := public.member_measurements(kb);
  checks := checks + 1;
  if jsonb_array_length(r->'entries') <> 1 or r->'entries'->0->>'weightKg' <> '88.0' then fails := fails || ' 6b:' || r::text; end if;
  r := public.member_measurements(kz);
  checks := checks + 1;
  if coalesce(jsonb_array_length(r->'entries'), 0) <> 0 then fails := fails || ' 6z:' || r::text; end if;

  -- 7. A deleted entry is gone for the member too.
  perform public.owner_delete_measurement(kop, e2::uuid);
  r := public.member_measurements(ka);
  checks := checks + 1; fails := fails || pg_temp.t35_is('7', jsonb_array_length(r->'entries')::text, '1');

  -- ================================================================ diet plans
  -- 8. The trainer writes a plan for Asha; another for everyone on Gold. Blank lines are dropped.
  r := public.owner_save_diet_plan(ks, jsonb_build_object('title', ' Fat loss veg 1,600 kcal ', 'goal', 'Lose fat slowly', 'kcal', 1600,
         'proteinG', 90, 'meals', meals || '[{"name":"Dinner","items":["", "Paneer bhurji, 1 roti"]}]'::jsonb, 'notes', 'Talk to a doctor if you have a health condition.',
         'assign', jsonb_build_object('memberIds', jsonb_build_array('m-asha', 'm-asha'), 'planIds', '[]'::jsonb), 'byName', 'Someone else'));
  dp1 := r->>'id';
  checks := checks + 1; fails := fails || pg_temp.t35_is('8by', r->>'byName', 'Ravi');
  checks := checks + 1; fails := fails || pg_temp.t35_is('8title', r->>'title', 'Fat loss veg 1,600 kcal');
  checks := checks + 1; fails := fails || pg_temp.t35_is('8blank', jsonb_array_length(r->'meals'->2->'items')::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t35_is('8dedupe', jsonb_array_length(r->'assign'->'memberIds')::text, '1');
  r := public.owner_save_diet_plan(kop, jsonb_build_object('title', 'Gold maintenance', 'meals', meals,
         'assign', jsonb_build_object('memberIds', '[]'::jsonb, 'planIds', jsonb_build_array('pl-gold'))));
  dpg := r->>'id';

  -- 9. Bad plans are refused.
  checks := checks + 1; fails := fails || pg_temp.t35_is('9nomeal', pg_temp.t35_run(format('select public.owner_save_diet_plan(%L, %L::jsonb)', ks,
    jsonb_build_object('title', 'X', 'meals', '[]'::jsonb, 'assign', jsonb_build_object('memberIds', '[]'::jsonb, 'planIds', '[]'::jsonb)))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t35_is('9kcal', pg_temp.t35_run(format('select public.owner_save_diet_plan(%L, %L::jsonb)', ks,
    jsonb_build_object('title', 'X', 'kcal', 100, 'meals', meals, 'assign', jsonb_build_object('memberIds', '[]'::jsonb, 'planIds', '[]'::jsonb)))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t35_is('9notitle', pg_temp.t35_run(format('select public.owner_save_diet_plan(%L, %L::jsonb)', ks,
    jsonb_build_object('title', '  ', 'meals', meals, 'assign', jsonb_build_object('memberIds', '[]'::jsonb, 'planIds', '[]'::jsonb)))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t35_is('9noitems', pg_temp.t35_run(format('select public.owner_save_diet_plan(%L, %L::jsonb)', ks,
    jsonb_build_object('title', 'X', 'meals', '[{"name":"Lunch","items":[" "]}]'::jsonb, 'assign', jsonb_build_object('memberIds', '[]'::jsonb, 'planIds', '[]'::jsonb)))), 'INVALID');

  -- 10. The owner edits Asha's plan: who made it stays Ravi.
  r := public.owner_save_diet_plan(kop, jsonb_build_object('id', dp1, 'title', 'Fat loss veg 1,600 kcal', 'kcal', 1600, 'meals', meals,
         'assign', jsonb_build_object('memberIds', jsonb_build_array('m-asha'), 'planIds', '[]'::jsonb)));
  checks := checks + 1; fails := fails || pg_temp.t35_is('10by', r->>'byName', 'Ravi');
  checks := checks + 1; fails := fails || pg_temp.t35_is('10goal', r->>'goal', null);

  -- 11. Who sees what: Asha hers only, Bilal (Gold today) Gold's, Chand (Gold ended) none, Zoya none.
  r := public.member_diet_plans(ka);
  checks := checks + 1;
  if r->>'ok' is distinct from 'true' or jsonb_array_length(r->'plans') <> 1 or r->'plans'->0->>'id' <> dp1
     or r->'plans'->0->>'byName' <> 'Ravi' or r->'plans'->0->'meals'->0->>'time' <> '8:00 am' or r->'plans'->0 ? 'assign' then
    fails := fails || ' 11a:' || r::text; end if;
  r := public.member_diet_plans(kb);
  checks := checks + 1;
  if jsonb_array_length(r->'plans') <> 1 or r->'plans'->0->>'id' <> dpg then fails := fails || ' 11b:' || r::text; end if;
  r := public.member_diet_plans(kc);
  checks := checks + 1;
  if r->>'ok' is distinct from 'true' or jsonb_array_length(r->'plans') <> 0 then fails := fails || ' 11c:' || r::text; end if;
  r := public.member_diet_plans(kz);
  checks := checks + 1;
  if coalesce(jsonb_array_length(r->'plans'), 0) <> 0 then fails := fails || ' 11z:' || r::text; end if;

  -- 12. Another gym: its list is empty, and it can't edit or withdraw this gym's plan.
  checks := checks + 1; fails := fails || pg_temp.t35_is('12list', jsonb_array_length(public.owner_diet_plans(kob))::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t35_is('12edit', pg_temp.t35_run(format('select public.owner_save_diet_plan(%L, %L::jsonb)', kob,
    jsonb_build_object('id', dp1, 'title', 'Hijack', 'meals', meals, 'assign', jsonb_build_object('memberIds', '[]'::jsonb, 'planIds', '[]'::jsonb)))), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t35_is('12withdraw', pg_temp.t35_run(format('select public.owner_withdraw_diet_plan(%L, %L::uuid)', kob, dpg)), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t35_is('12gym', jsonb_array_length(public.owner_diet_plans(ks))::text, '2');

  -- 13. Withdrawn: gone from Bilal's list; can't be edited (make a copy).
  perform public.owner_withdraw_diet_plan(ks, dpg::uuid);
  r := public.member_diet_plans(kb);
  checks := checks + 1; fails := fails || pg_temp.t35_is('13gone', jsonb_array_length(r->'plans')::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t35_is('13edit', pg_temp.t35_run(format('select public.owner_save_diet_plan(%L, %L::jsonb)', kop,
    jsonb_build_object('id', dpg, 'title', 'Again', 'meals', meals, 'assign', jsonb_build_object('memberIds', '[]'::jsonb, 'planIds', jsonb_build_array('pl-gold'))))), 'WITHDRAWN');

  -- ================================================================ people who are no longer allowed
  -- 14. The identity checks are 0023's: a different first name sees nothing.
  update public.gym_members set name = 'Imposter' where key_hash = public._hash_key(ka);
  checks := checks + 1; fails := fails || pg_temp.t35_is('14name', public.member_measurements(ka)->>'error', 'NAME_MISMATCH');
  checks := checks + 1; fails := fails || pg_temp.t35_is('14namediet', public.member_diet_plans(ka)->>'error', 'NAME_MISMATCH');
  update public.gym_members set name = 'Asha' where key_hash = public._hash_key(ka);
  -- Taken off the gym's list (archived): nothing.
  update public.crm_records set data = data || '{"archived": true}' where gym_id = gid and id = 'm-bilal';
  checks := checks + 1; fails := fails || pg_temp.t35_is('14archived', public.member_measurements(kb)->>'error', 'NOT_ON_ROSTER');

  -- 15. A removed trainer's session stops at once.
  update public.gym_staff set removed_at = now() where staff_id = s_staff;
  checks := checks + 1; fails := fails || pg_temp.t35_is('15save', pg_temp.t35_run(format(
    'select public.owner_save_measurement(%L, %L, %L::jsonb)', ks, 'm-asha', jsonb_build_object('date', to_char(td - 2, 'YYYY-MM-DD'), 'weightKg', 70))), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t35_is('15list', pg_temp.t35_run(format('select public.owner_member_measurements(%L, %L)', ks, 'm-asha')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t35_is('15diet', pg_temp.t35_run(format('select public.owner_diet_plans(%L)', ks)), 'BAD_KEY');

  -- 16. Asha leaves the gym in the app: her old key reads nothing from then on.
  perform public.member_leave(ka);
  checks := checks + 1; fails := fails || pg_temp.t35_is('16meas', pg_temp.t35_run(format('select public.member_measurements(%L)', ka)), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t35_is('16diet', pg_temp.t35_run(format('select public.member_diet_plans(%L)', ka)), 'BAD_KEY');

  -- 17. Anyone may call the key-checked functions (the apps have no account); nobody may call the helpers
  --     or read the tables directly.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_measurements(text)', 'execute')
     or not has_function_privilege('anon', 'public.member_diet_plans(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_save_measurement(text, text, jsonb)', 'execute')
     or has_function_privilege('anon', 'public._member_roster_link(text)', 'execute')
     or has_function_privilege('anon', 'public._measure_clean(jsonb)', 'execute')
     or has_function_privilege('anon', 'public._diet_clean(jsonb)', 'execute')
     or has_table_privilege('anon', 'public.gym_body_measurements', 'select')
     or has_table_privilege('authenticated', 'public.gym_diet_plans', 'select') then fails := fails || ' 17'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
