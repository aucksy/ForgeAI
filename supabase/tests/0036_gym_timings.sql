-- Gym timings test (0036). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be
-- pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

-- Run one statement: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t36_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t36_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gb uuid; s_owner uuid; s_staff uuid;
  kop text := 't36-owner-session'; ks text := 't36-staff-session'; kok text := 't36-owner-key'; kob text := 't36-owner-b';
  km text := 't36-member-a'; kmb text := 't36-member-b';
  td date := (now() at time zone 'Asia/Kolkata')::date;
  fails text := ''; checks int := 0; r jsonb; h jsonb; wk jsonb; day jsonb;
  split jsonb := '{"kind":"hours","ranges":[{"open":"16:00","close":"22:00"},{"open":"05:00","close":"11:00"}]}';
  shut jsonb := '{"kind":"closed","ranges":[]}';
begin
  insert into public.gyms(name, join_code, crm_version) values ('T36 Gym', 'T36GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T36 Other', 'T36GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner', '9876500361', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Ravi', '9876500362', 'staff') returning staff_id into s_staff;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_staff, public._hash_key(ks));
  insert into public.gym_owner_keys(gym_id, key_hash) values (gid, public._hash_key(kok)), (gb, public._hash_key(kob));
  insert into public.gym_members(gym_id, name, key_hash) values (gid, 'Asha', public._hash_key(km)), (gb, 'Zoya', public._hash_key(kmb));

  wk := jsonb_build_object('mon', split, 'tue', split, 'wed', split, 'thu', split, 'fri', split,
          'sat', '{"kind":"hours","ranges":[{"open":"18:00","close":"02:00"}]}'::jsonb, 'sun', shut);
  h := jsonb_build_object('week', wk, 'note', '  Ladies batch 11 am to 12 pm  ',
         'special', jsonb_build_array(
           jsonb_build_object('date', to_char(td + 10, 'YYYY-MM-DD'), 'kind', 'closed', 'note', 'Diwali'),
           jsonb_build_object('date', to_char(td + 3, 'YYYY-MM-DD'), 'kind', 'allDay', 'ranges', '[]'::jsonb),
           jsonb_build_object('date', to_char(td - 5, 'YYYY-MM-DD'), 'kind', 'closed')));

  -- 1. Nothing saved yet: no hours, for the gym and for the member.
  r := public.owner_gym_timings(ks);
  checks := checks + 1; fails := fails || pg_temp.t36_is('1gym', r->>'hours', null);
  checks := checks + 1; fails := fails || pg_temp.t36_is('1desk', r->>'canEdit', 'false');
  checks := checks + 1; fails := fails || pg_temp.t36_is('1owner', public.owner_gym_timings(kop)->>'canEdit', 'true');
  r := public.member_gym_timings(km);
  checks := checks + 1; fails := fails || pg_temp.t36_is('1member', (r->>'ok') || '/' || coalesce(r->>'hours', 'none') || '/' || (r->>'gymName'), 'true/none/T36 Gym');

  -- 2. The owner saves: ranges sorted, the note trimmed, special days sorted and the one that is over
  --    dropped; who saved is the session's person.
  r := public.owner_save_gym_timings(kop, h);
  checks := checks + 1; fails := fails || pg_temp.t36_is('2sort', r->'hours'->'week'->'mon'->'ranges'->0->>'open', '05:00');
  checks := checks + 1; fails := fails || pg_temp.t36_is('2late', r->'hours'->'week'->'sat'->'ranges'->0->>'close', '02:00');
  checks := checks + 1; fails := fails || pg_temp.t36_is('2note', r->'hours'->>'note', 'Ladies batch 11 am to 12 pm');
  checks := checks + 1; fails := fails || pg_temp.t36_is('2special', jsonb_array_length(r->'hours'->'special')::text, '2');
  checks := checks + 1; fails := fails || pg_temp.t36_is('2first', r->'hours'->'special'->0->>'date', to_char(td + 3, 'YYYY-MM-DD'));
  checks := checks + 1; fails := fails || pg_temp.t36_is('2diwali', r->'hours'->'special'->1->>'note', 'Diwali');
  checks := checks + 1; fails := fails || pg_temp.t36_is('2by', r->>'updatedByName', 'Owner');

  -- 3. The member reads the same hours; another gym's member does not.
  r := public.member_gym_timings(km);
  checks := checks + 1; fails := fails || pg_temp.t36_is('3member', r->'hours'->'week'->'sun'->>'kind', 'closed');
  checks := checks + 1; fails := fails || pg_temp.t36_is('3other', public.member_gym_timings(kmb)->>'hours', null);
  checks := checks + 1; fails := fails || pg_temp.t36_is('3otherName', public.member_gym_timings(kmb)->>'gymName', 'T36 Other');

  -- 4. The front desk reads but may not save.
  checks := checks + 1; fails := fails || pg_temp.t36_is('4read', public.owner_gym_timings(ks)->'hours'->>'note', 'Ladies batch 11 am to 12 pm');
  checks := checks + 1; fails := fails || pg_temp.t36_is('4save', pg_temp.t36_run(format('select public.owner_save_gym_timings(%L, %L::jsonb)', ks, h)), 'OWNER_ONLY');

  -- 5. Another gym's owner sees nothing of this gym's and its save lands in its own gym only.
  checks := checks + 1; fails := fails || pg_temp.t36_is('5read', public.owner_gym_timings(kob)->>'hours', null);
  perform public.owner_save_gym_timings(kob, jsonb_build_object('week', jsonb_build_object('mon', shut, 'tue', shut, 'wed', shut, 'thu', shut,
    'fri', shut, 'sat', shut, 'sun', '{"kind":"allDay"}'::jsonb)));
  checks := checks + 1; fails := fails || pg_temp.t36_is('5mine', public.owner_gym_timings(kop)->'hours'->'week'->'sun'->>'kind', 'closed');
  checks := checks + 1; fails := fails || pg_temp.t36_is('5theirs', public.member_gym_timings(kmb)->'hours'->'week'->'sun'->>'kind', 'allDay');
  -- An old owner key saves too (no person: no name).
  checks := checks + 1; fails := fails || pg_temp.t36_is('5key', public.owner_save_gym_timings(kok, h)->>'updatedByName', null);

  -- 6. Bad hours are refused.
  foreach day in array array[
      '{"kind":"hours","ranges":[{"open":"10:00","close":"10:00"}]}',            -- ends when it starts
      '{"kind":"hours","ranges":[{"open":"16:00","close":"10:00"}]}',            -- am/pm slip: past 6:00 am next day
      '{"kind":"hours","ranges":[{"open":"05:00","close":"12:00"},{"open":"11:00","close":"22:00"}]}',  -- overlap
      '{"kind":"hours","ranges":[{"open":"22:00","close":"02:00"},{"open":"23:00","close":"23:30"}]}',  -- overlap past midnight
      '{"kind":"hours","ranges":[]}',                                            -- no time
      '{"kind":"hours","ranges":[{"open":"5:00","close":"11:00"}]}',             -- not HH:MM
      '{"kind":"hours","ranges":[{"open":"05:00","close":"24:00"}]}',            -- 24:00 is written 00:00
      '{"kind":"hours","ranges":[{"open":"05:00","close":"07:00"},{"open":"08:00","close":"09:00"},{"open":"10:00","close":"11:00"}]}',
      '{"kind":"open"}'
    ]::jsonb[] loop
    checks := checks + 1; fails := fails || pg_temp.t36_is('6:' || day::text, pg_temp.t36_run(format('select public.owner_save_gym_timings(%L, %L::jsonb)',
      kop, jsonb_set(h, '{week,mon}', day))), 'INVALID');
  end loop;
  -- A missing day, an unknown key, every day closed, a long note, a special day twice / too far / with a long note.
  checks := checks + 1; fails := fails || pg_temp.t36_is('6missing', pg_temp.t36_run(format('select public.owner_save_gym_timings(%L, %L::jsonb)', kop, h #- '{week,sun}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t36_is('6extra', pg_temp.t36_run(format('select public.owner_save_gym_timings(%L, %L::jsonb)', kop, h || '{"x":1}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t36_is('6shut', pg_temp.t36_run(format('select public.owner_save_gym_timings(%L, %L::jsonb)', kop,
    jsonb_build_object('week', jsonb_build_object('mon', shut, 'tue', shut, 'wed', shut, 'thu', shut, 'fri', shut, 'sat', shut, 'sun', shut)))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t36_is('6note', pg_temp.t36_run(format('select public.owner_save_gym_timings(%L, %L::jsonb)', kop,
    jsonb_set(h, '{note}', to_jsonb(repeat('x', 121))))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t36_is('6twice', pg_temp.t36_run(format('select public.owner_save_gym_timings(%L, %L::jsonb)', kop,
    jsonb_set(h, '{special}', jsonb_build_array(h->'special'->0, h->'special'->0)))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t36_is('6far', pg_temp.t36_run(format('select public.owner_save_gym_timings(%L, %L::jsonb)', kop,
    jsonb_set(h, '{special}', jsonb_build_array(jsonb_build_object('date', to_char(td + 401, 'YYYY-MM-DD'), 'kind', 'closed'))))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t36_is('6baddate', pg_temp.t36_run(format('select public.owner_save_gym_timings(%L, %L::jsonb)', kop,
    jsonb_set(h, '{special}', '[{"date":"2026-02-30","kind":"closed"}]'::jsonb))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t36_is('6snote', pg_temp.t36_run(format('select public.owner_save_gym_timings(%L, %L::jsonb)', kop,
    jsonb_set(h, '{special}', jsonb_build_array(jsonb_build_object('date', to_char(td + 2, 'YYYY-MM-DD'), 'kind', 'closed', 'note', repeat('x', 41)))))), 'INVALID');
  -- Allowed: a midnight close, a range that starts at midnight, a late range ending 6:00 am.
  checks := checks + 1; fails := fails || pg_temp.t36_is('6ok', pg_temp.t36_run(format('select public.owner_save_gym_timings(%L, %L::jsonb)', kop,
    jsonb_set(jsonb_set(h, '{week,mon}', '{"kind":"hours","ranges":[{"open":"16:00","close":"00:00"}]}'), '{week,tue}',
      '{"kind":"hours","ranges":[{"open":"00:00","close":"04:00"},{"open":"20:00","close":"06:00"}]}'))), 'ok');
  -- What was refused changed nothing: the last good save stays.
  checks := checks + 1; fails := fails || pg_temp.t36_is('6kept', public.member_gym_timings(km)->'hours'->'week'->'tue'->'ranges'->1->>'close', '06:00');

  -- 7. Removing the hours: the member sees none.
  r := public.owner_save_gym_timings(kop, null);
  checks := checks + 1; fails := fails || pg_temp.t36_is('7gone', public.member_gym_timings(km)->>'hours', null);
  checks := checks + 1; fails := fails || pg_temp.t36_is('7gym', r->>'hours', null);
  perform public.owner_save_gym_timings(kop, h);

  -- 8. A suspended gym is read-only (0027).
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = gid;
  perform set_config('forgeai.hq', 'off', true);
  checks := checks + 1; fails := fails || pg_temp.t36_is('8suspended', pg_temp.t36_run(format('select public.owner_save_gym_timings(%L, %L::jsonb)', kop, h)), 'SUSPENDED');
  checks := checks + 1; fails := fails || pg_temp.t36_is('8read', public.member_gym_timings(km)->'hours'->'week'->'sun'->>'kind', 'closed');
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'active' where gym_id = gid;
  perform set_config('forgeai.hq', 'off', true);

  -- 9. People no longer allowed: a removed person's session, a member who left, a made-up key.
  update public.gym_staff set removed_at = now() where staff_id = s_owner;
  checks := checks + 1; fails := fails || pg_temp.t36_is('9removed', pg_temp.t36_run(format('select public.owner_save_gym_timings(%L, %L::jsonb)', kop, h)), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t36_is('9read', pg_temp.t36_run(format('select public.owner_gym_timings(%L)', kop)), 'BAD_KEY');
  perform public.member_leave(km);
  checks := checks + 1; fails := fails || pg_temp.t36_is('9left', pg_temp.t36_run(format('select public.member_gym_timings(%L)', km)), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t36_is('9nobody', pg_temp.t36_run(format('select public.member_gym_timings(%L)', 'no-such-key')), 'BAD_KEY');

  -- 10. Anyone may call the key-checked functions; nobody may call the helpers or read the table.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_gym_timings(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_gym_timings(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_save_gym_timings(text, jsonb)', 'execute')
     or has_function_privilege('anon', 'public._timings_clean(jsonb)', 'execute')
     or has_function_privilege('anon', 'public._timings_day(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public._hhmm_min(jsonb)', 'execute')
     or has_table_privilege('anon', 'public.gym_timings', 'select')
     or has_table_privilege('authenticated', 'public.gym_timings', 'insert') then fails := fails || ' 10'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
