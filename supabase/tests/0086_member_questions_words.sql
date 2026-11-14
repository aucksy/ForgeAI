-- R-533 (0086): a new member question makes the alert "<name> asked a workout question. Open Member questions to
-- reply." Runs in CI after every migration (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor.
-- It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).
-- Fake numbers only (98765 086xx).

create or replace function pg_temp.t86_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; ma uuid; mb uuid; strain uuid; q1 uuid; q2 uuid;
  fails text := ''; checks int := 0;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T86 Gym', 'T86GYA', 1) returning gym_id into gid;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Trainer Tara', '9876508612', 'staff') returning staff_id into strain;
  insert into public.gym_trainers(staff_id, gym_id) values (strain, gid);
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 't86-r-asha', '{"fullName":"Asha Rao","phone":"9876508601"}', 1);
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Asha Rao', public._hash_key('t86-m-a'), '9876508601') returning member_id into ma;
  insert into public.gym_members(gym_id, name, key_hash) values (gid, 'Bina', public._hash_key('t86-m-b')) returning member_id into mb;

  -- 1. To a trainer, from a member on the gym's list: the new words, the same page, kind and audience.
  insert into public.trainer_questions(gym_id, member_id, roster_id, staff_id, question) values (gid, ma, 't86-r-asha', strain, 'How many sets?') returning question_id into q1;
  checks := checks + 1; fails := fails || pg_temp.t86_is('1line', (select line || ' ' || route || ' ' || kind || ' ' || audience || ' ' || urgent from public.gym_alerts where tag = 'question:' || q1),
    'Asha asked a workout question. Open Member questions to reply. /questions trainer_question question false');

  -- 2. To "any trainer or the owner": the same words.
  insert into public.trainer_questions(gym_id, member_id, question) values (gid, mb, 'Knee hurts') returning question_id into q2;
  checks := checks + 1; fails := fails || pg_temp.t86_is('2line', (select line from public.gym_alerts where tag = 'question:' || q2),
    'Bina asked a workout question. Open Member questions to reply.');

  -- 3. The old words are gone from every new alert, and nobody outside can call the trigger function.
  checks := checks + 1; fails := fails || pg_temp.t86_is('3old', (select count(*) from public.gym_alerts where gym_id = gid and line ilike '%asked a trainer%')::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t86_is('3anon', has_function_privilege('anon', 'public._alert_trainer_question()', 'execute')::text, 'false');

  -- 4. Who replied, as the member reads it: a person's first name; the gym itself stays "Your gym".
  update public.trainer_questions set answer = 'Three sets.', answered_by_name = 'Rohit Sharma', answered_at = now() where question_id = q1;
  update public.trainer_questions set answer = 'Rest it.', answered_by_name = 'Your gym', answered_at = now() where question_id = q2;
  checks := checks + 1; fails := fails || pg_temp.t86_is('4name', (select public._tq_member_row(t)->>'answeredBy' from public.trainer_questions t where question_id = q1), 'Rohit');
  checks := checks + 1; fails := fails || pg_temp.t86_is('4gym', (select public._tq_member_row(t)->>'answeredBy' from public.trainer_questions t where question_id = q2), 'Your gym');
  checks := checks + 1; fails := fails || pg_temp.t86_is('4anon', has_function_privilege('anon', 'public._tq_member_row(public.trainer_questions)', 'execute')::text, 'false');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
