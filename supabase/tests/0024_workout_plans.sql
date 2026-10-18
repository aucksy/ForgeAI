-- Workout plans test (0024). Runs in CI after every migration (scripts/ci/db_checks.sh); can also
-- be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

-- One push on the gym's current version: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t24_push(p_key text, p_rows jsonb) returns text
  language plpgsql as $$
declare v bigint;
begin
  select crm_version into v from public.gyms where gym_id = public._owner_gym(p_key);
  perform public.crm_push(p_key, v, p_rows);
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t24_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gb uuid; s_owner uuid; s_staff uuid;
  kop text := 't24-owner-session'; ks text := 't24-staff-session'; kob text := 't24-owner-b';
  ka text := 't24-member-a'; kb text := 't24-member-b'; kc text := 't24-member-c'; kz text := 't24-member-z';
  td date := (now() at time zone 'Asia/Kolkata')::date;
  fails text := ''; checks int := 0; r jsonb; d jsonb; c text;
  ex jsonb := '{"name":"Bench Press","catalogKey":"bench_press","logType":"weight_reps","sets":3,"repMin":6,"repMax":10,"primary":["chest"]}';
  rt jsonb;
begin
  rt := jsonb_build_object('name', 'Push', 'dayType', 'push', 'exercises', jsonb_build_array(ex));
  insert into public.gyms(name, join_code, crm_version) values ('T24 Gym', 'T24GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T24 Other', 'T24GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner', '9876500211', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Ravi', '9876500212', 'staff') returning staff_id into s_staff;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_staff, public._hash_key(ks));
  insert into public.gym_owner_keys(gym_id, key_hash) values (gb, public._hash_key(kob));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'plan', 'pl-gold', '{"name":"Gold","durationUnit":"month","durationCount":3,"priceP":300000}', 1),
    (gid, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829012345"}', 1),
    (gid, 'member', 'm-bilal', '{"fullName":"Bilal Khan","phone":"9829054321"}', 1),
    (gid, 'member', 'm-chand', '{"fullName":"Chand Rao","phone":"9829000003"}', 1),
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

  -- 1. The trainer (a front-desk session) sends a plan to Asha; the device's "createdBy" is ignored.
  d := jsonb_build_object('name', 'Asha strength', 'note', 'Knee: no deep squats', 'routines', jsonb_build_array(rt),
         'assign', jsonb_build_object('memberIds', jsonb_build_array('m-asha'), 'planIds', '[]'::jsonb),
         'withdrawn', false, 'createdBy', 'forged', 'createdByName', 'Someone else');
  c := pg_temp.t24_push(ks, jsonb_build_array(jsonb_build_object('k', 'workout_plan', 'id', 'wp-1', 'd', d)));
  checks := checks + 1; fails := fails || pg_temp.t24_is('1save', c, 'ok');
  select data into d from public.crm_records where gym_id = gid and kind = 'workout_plan' and id = 'wp-1';
  checks := checks + 1; fails := fails || pg_temp.t24_is('1by', d->>'createdByName', 'Ravi');
  checks := checks + 1; fails := fails || pg_temp.t24_is('1byid', d->>'createdBy', s_staff::text);

  -- 2. The owner edits it later: who made it stays Ravi.
  d := d || jsonb_build_object('name', 'Asha strength v2', 'createdByName', 'Owner');
  c := pg_temp.t24_push(kop, jsonb_build_array(jsonb_build_object('k', 'workout_plan', 'id', 'wp-1', 'd', d)));
  checks := checks + 1; fails := fails || pg_temp.t24_is('2save', c, 'ok');
  select data into d from public.crm_records where gym_id = gid and kind = 'workout_plan' and id = 'wp-1';
  checks := checks + 1; fails := fails || pg_temp.t24_is('2by', d->>'createdByName', 'Ravi');

  -- 3. A plan for everyone on Gold.
  d := jsonb_build_object('name', 'Gold starter', 'routines', jsonb_build_array(rt),
         'assign', jsonb_build_object('memberIds', '[]'::jsonb, 'planIds', jsonb_build_array('pl-gold')));
  c := pg_temp.t24_push(kop, jsonb_build_array(jsonb_build_object('k', 'workout_plan', 'id', 'wp-gold', 'd', d)));
  checks := checks + 1; fails := fails || pg_temp.t24_is('3save', c, 'ok');

  -- 4. Bad outlines are refused; a plan is never deleted.
  checks := checks + 1; fails := fails || pg_temp.t24_is('4noname', pg_temp.t24_push(kop, jsonb_build_array(jsonb_build_object('k', 'workout_plan', 'id', 'wp-x',
    'd', jsonb_build_object('routines', jsonb_build_array(rt), 'assign', jsonb_build_object('memberIds', '[]'::jsonb, 'planIds', '[]'::jsonb))))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t24_is('4noroutine', pg_temp.t24_push(kop, jsonb_build_array(jsonb_build_object('k', 'workout_plan', 'id', 'wp-x',
    'd', jsonb_build_object('name', 'X', 'routines', '[]'::jsonb, 'assign', jsonb_build_object('memberIds', '[]'::jsonb, 'planIds', '[]'::jsonb))))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t24_is('4badid', pg_temp.t24_push(kop, jsonb_build_array(jsonb_build_object('k', 'workout_plan', 'id', 'wp-x',
    'd', jsonb_build_object('name', 'X', 'routines', jsonb_build_array(rt), 'assign', jsonb_build_object('memberIds', jsonb_build_array(5), 'planIds', '[]'::jsonb))))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t24_is('4delete', pg_temp.t24_push(kop, jsonb_build_array(jsonb_build_object('k', 'workout_plan', 'id', 'wp-1', 'x', true))), 'INVALID');

  -- 5. Asha sees her plan (with the note and who made it), not Gold's.
  r := public.member_gym_plans(ka);
  checks := checks + 1;
  if r->>'ok' is distinct from 'true' or jsonb_array_length(r->'plans') <> 1 or r->'plans'->0->>'id' <> 'wp-1'
     or r->'plans'->0->>'byName' <> 'Ravi' or r->'plans'->0->>'note' <> 'Knee: no deep squats'
     or r->'plans'->0->'routines'->0->>'name' <> 'Push' then fails := fails || ' 5:' || r::text; end if;

  -- 6. Bilal (on Gold today) sees the Gold plan; Chand (Gold ended) sees none.
  r := public.member_gym_plans(kb);
  checks := checks + 1;
  if jsonb_array_length(r->'plans') <> 1 or r->'plans'->0->>'id' <> 'wp-gold' then fails := fails || ' 6b:' || r::text; end if;
  r := public.member_gym_plans(kc);
  checks := checks + 1;
  if r->>'ok' is distinct from 'true' or jsonb_array_length(r->'plans') <> 0 then fails := fails || ' 6c:' || r::text; end if;

  -- 7. Withdrawn: gone from the member's list.
  update public.crm_records set data = data || '{"withdrawn": true}' where gym_id = gid and id = 'wp-gold';
  r := public.member_gym_plans(kb);
  checks := checks + 1;
  if jsonb_array_length(r->'plans') <> 0 then fails := fails || ' 7:' || r::text; end if;

  -- 8. Another gym's member with the same number sees nothing of this gym's.
  r := public.member_gym_plans(kz);
  checks := checks + 1;
  if r->>'error' is distinct from 'GYM_NOT_ONLINE' and coalesce(jsonb_array_length(r->'plans'), 0) <> 0 then fails := fails || ' 8:' || r::text; end if;
  checks := checks + 1; fails := fails || pg_temp.t24_is('8push', pg_temp.t24_push(kob, jsonb_build_array(jsonb_build_object('k', 'workout_plan', 'id', 'wp-1',
    'd', jsonb_build_object('name', 'Hijack', 'routines', jsonb_build_array(rt), 'assign', jsonb_build_object('memberIds', jsonb_build_array('m-asha'), 'planIds', '[]'::jsonb))))), 'ok');
  select data into d from public.crm_records where gym_id = gid and kind = 'workout_plan' and id = 'wp-1';
  checks := checks + 1; fails := fails || pg_temp.t24_is('8mine', d->>'name', 'Asha strength v2');

  -- 9. The identity checks are 0023's: a different first name and a typed-only number see nothing.
  update public.gym_members set name = 'Imposter' where key_hash = public._hash_key(ka);
  r := public.member_gym_plans(ka);
  checks := checks + 1; fails := fails || pg_temp.t24_is('9name', r->>'error', 'NAME_MISMATCH');
  update public.gym_members set name = 'Asha', checkin_phone = null where key_hash = public._hash_key(ka);
  r := public.member_gym_plans(ka);
  checks := checks + 1; fails := fails || pg_temp.t24_is('9phone', r->>'error', 'NO_PHONE');

  -- 10. Anyone may call the read (the app has no account); nobody may call the outline check.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_gym_plans(text)', 'execute')
     or has_function_privilege('anon', 'public._workout_plan_ok(jsonb)', 'execute') then fails := fails || ' 10'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
