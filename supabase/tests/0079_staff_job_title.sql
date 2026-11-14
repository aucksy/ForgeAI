-- A person's job name on Settings -> Staff & sign-in (0079, R-522). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

-- Run one statement: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t79_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t79_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  ga uuid; gb uuid; s_owner uuid; s_desk uuid; s_clean uuid; s_other uuid;
  kop text := 't79-owner-session'; kd text := 't79-desk-session'; kok text := 't79-owner-key'; kox text := 't79-other-session';
  fails text := ''; checks int := 0; r jsonb; pr jsonb;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T78 Gym', 'T78GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T78 Other', 'T78GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner', '9876507801', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Ravi Desk', '9876507802', 'staff') returning staff_id into s_desk;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Suresh', '9876507803', 'staff') returning staff_id into s_clean;
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Other Owner', '9876507804', 'owner') returning staff_id into s_other;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_desk, public._hash_key(kd)),
    (s_other, public._hash_key(kox));
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kok));

  -- 1. Nobody has a job name yet: every row says job null (the key is there, so the app knows 0079 is live).
  r := public.owner_people(kop);
  checks := checks + 1; fails := fails || pg_temp.t79_is('1rows', jsonb_array_length(r)::text, '3');
  checks := checks + 1;
  if exists (select 1 from jsonb_array_elements(r) e where not (e ? 'job') or e->'job' <> 'null'::jsonb) then fails := fails || ' 1job_not_null'; end if;

  -- 2. The owner names Suresh's job; spaces are tidied; his access stays front desk.
  r := public.owner_set_person_job(kop, s_clean, '  Head   cleaner ');
  checks := checks + 1; fails := fails || pg_temp.t79_is('2answer', r->>'job', 'Head cleaner');
  checks := checks + 1; fails := fails || pg_temp.t79_is('2role', (select role from public.gym_staff where staff_id = s_clean), 'staff');
  select e into pr from jsonb_array_elements(public.owner_people(kop)) e where e->>'staffId' = s_clean::text;
  checks := checks + 1; fails := fails || pg_temp.t79_is('2listed', (pr->>'job') || '/' || (pr->>'role'), 'Head cleaner/staff');
  -- The old owner key may do it too.
  checks := checks + 1; fails := fails || pg_temp.t79_is('2ownerkey', public.owner_set_person_job(kok, s_desk, 'Manager')->>'job', 'Manager');

  -- 3. Refusals: the desk, a bad key, another gym's person, an owner row, too long, control characters.
  checks := checks + 1; fails := fails || pg_temp.t79_is('3desk', pg_temp.t79_run(format('select public.owner_set_person_job(%L, %L, %L)', kd, s_clean, 'Boss')), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t79_is('3badkey', pg_temp.t79_run(format('select public.owner_set_person_job(%L, %L, %L)', 'nope', s_clean, 'Boss')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t79_is('3othergym', pg_temp.t79_run(format('select public.owner_set_person_job(%L, %L, %L)', kop, s_other, 'Boss')), 'GONE');
  checks := checks + 1; fails := fails || pg_temp.t79_is('3owner', pg_temp.t79_run(format('select public.owner_set_person_job(%L, %L, %L)', kop, s_owner, 'Boss')), 'NOT_STAFF');
  checks := checks + 1; fails := fails || pg_temp.t79_is('3long', pg_temp.t79_run(format('select public.owner_set_person_job(%L, %L, %L)', kop, s_clean, repeat('a', 41))), 'TOO_LONG');
  checks := checks + 1; fails := fails || pg_temp.t79_is('3cntrl', pg_temp.t79_run(format('select public.owner_set_person_job(%L, %L, %L)', kop, s_clean, 'Bad' || chr(10) || 'name')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t79_is('3kept', (select job_title from public.gym_staff where staff_id = s_clean), 'Head cleaner');
  -- The column refuses an empty or over-long name written any other way.
  checks := checks + 1;
  if pg_temp.t79_run(format('update public.gym_staff set job_title = %L where staff_id = %L', '   ', s_clean)) = 'ok' then fails := fails || ' 3blank_column'; end if;
  -- The other gym's owner sees nothing of this gym's job names.
  checks := checks + 1;
  if public.owner_people(kox)::text like '%cleaner%' then fails := fails || ' 3leak'; end if;

  -- 4. Empty clears it.
  checks := checks + 1; fails := fails || pg_temp.t79_is('4clear', coalesce(public.owner_set_person_job(kop, s_clean, '  ')->>'job', 'none'), 'none');
  checks := checks + 1; fails := fails || pg_temp.t79_is('4cleared', (select job_title from public.gym_staff where staff_id = s_clean), null);

  -- 5. The calls are callable by the app's keys; the helper they use is not.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.owner_set_person_job(text, uuid, text)', 'execute') then fails := fails || ' 5not_callable'; end if;
  checks := checks + 1;
  if has_function_privilege('anon', 'public._people_admin(text)', 'execute') then fails := fails || ' 5helper_callable'; end if;

  if fails = '' then
    raise exception 'RESULT PASS (% checks)', checks;
  end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
