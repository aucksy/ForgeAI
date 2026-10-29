-- Workout reports the gym asks for (0045, F121). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

-- Run one statement: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t45_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t45_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gb uuid; s_owner uuid; s_staff uuid;
  kop text := 't45-owner-session'; ks text := 't45-staff-session'; kob text := 't45-owner-b';
  ka text := 't45-member-a'; kc text := 't45-member-c'; kn text := 't45-member-n'; kz text := 't45-member-z';
  head text := '"title","start_time","end_time","description","exercise_title"';
  good text; early text;
  fails text := ''; checks int := 0; r jsonb; ra uuid; rc uuid; ra2 uuid;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T45 Gym', 'T45GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T45 Other', 'T45GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner', '9876500451', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Ravi', '9876500452', 'staff') returning staff_id into s_staff;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_staff, public._hash_key(ks));
  insert into public.gym_owner_keys(gym_id, key_hash) values (gb, public._hash_key(kob));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    -- Asha joined on 1 Jun 2026 (the gym's list). Chand has no joinedOn: his first plan started 10 Mar 2026.
    (gid, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829012345","joinedOn":"2026-06-01"}', 1),
    (gid, 'member', 'm-chand', '{"fullName":"Chand Rao","phone":"9829000003"}', 1),
    (gid, 'member', 'm-dev', '{"fullName":"Dev Nath","phone":"9829000004"}', 1),
    (gid, 'membership', 'ms-c1', '{"memberId":"m-chand","startsOn":"2026-05-01","endsOn":"2026-06-01","cancelled":false}', 1),
    (gid, 'membership', 'ms-c0', '{"memberId":"m-chand","startsOn":"2026-03-10","endsOn":"2026-04-10","cancelled":false}', 1),
    (gid, 'membership', 'ms-cx', '{"memberId":"m-chand","startsOn":"2025-01-01","endsOn":"2025-02-01","cancelled":true}', 1),
    (gb, 'member', 'm-zoya', '{"fullName":"Zoya Ali","phone":"9829012345","joinedOn":"2026-01-01"}', 1);
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values
    (gid, 'Asha', '+919829012345', public._hash_key(ka)),
    (gid, 'Chand', '+919829000003', public._hash_key(kc)),
    (gid, 'Nobody', null, public._hash_key(kn)),
    (gb, 'Zoya', '+919829012345', public._hash_key(kz));
  good := head || E'\n"Push","1 Jun 2026, 18:00","1 Jun 2026, 19:05","","Bench"\n"Pull","14 Oct 2026, 07:30","14 Oct 2026, 08:20","","Row"\n';
  early := head || E'\n"Push","31 May 2026, 23:50","1 Jun 2026, 00:40","","Bench"\n';

  -- 1. Nothing asked yet: the member sees none, the desk sees none (and learns the server has reports).
  r := public.member_report_requests(ka);
  checks := checks + 1; fails := fails || pg_temp.t45_is('1ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t45_is('1none', (r->'requests')::text, '[]');
  checks := checks + 1; fails := fails || pg_temp.t45_is('1desk', public.owner_report_requests(ks, 'm-asha')::text, '[]');
  checks := checks + 1; fails := fails || pg_temp.t45_is('1nophone', public.member_report_requests(kn)->>'error', 'NO_PHONE');
  checks := checks + 1; fails := fails || pg_temp.t45_is('1badkey', pg_temp.t45_run(format(
    'select public.member_report_requests(%L)', 'nope')), 'BAD_KEY');

  -- 2. The desk asks. The join date is the gym's own: Asha's joinedOn; Chand's earliest plan that
  --    was not cancelled; Dev has neither, so he cannot be asked. Gym B cannot ask about gym A's member.
  r := public.owner_request_report(ks, 'm-asha');
  ra := (r->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t45_is('2status', r->>'status', 'pending');
  checks := checks + 1; fails := fails || pg_temp.t45_is('2from', r->>'fromDay', '2026-06-01');
  checks := checks + 1; fails := fails || pg_temp.t45_is('2by', r->>'requestedBy', 'Ravi');
  checks := checks + 1; fails := fails || pg_temp.t45_is('2name', r->>'memberName', 'Asha Verma');
  checks := checks + 1; fails := fails || pg_temp.t45_is('2expires',
    ((r->>'expiresAt')::bigint - (r->>'createdAt')::bigint)::text, (30::bigint * 86400 * 1000)::text);
  r := public.owner_request_report(kop, 'm-chand');
  rc := (r->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t45_is('2chand', r->>'fromDay', '2026-03-10');
  checks := checks + 1; fails := fails || pg_temp.t45_is('2dev', pg_temp.t45_run(format(
    'select public.owner_request_report(%L, %L)', ks, 'm-dev')), 'NO_JOIN_DATE');
  checks := checks + 1; fails := fails || pg_temp.t45_is('2nomember', pg_temp.t45_run(format(
    'select public.owner_request_report(%L, %L)', ks, 'm-nobody')), 'NO_MEMBER');
  checks := checks + 1; fails := fails || pg_temp.t45_is('2gymb', pg_temp.t45_run(format(
    'select public.owner_request_report(%L, %L)', kob, 'm-asha')), 'NO_MEMBER');
  checks := checks + 1; fails := fails || pg_temp.t45_is('2gymbread', public.owner_report_requests(kob, 'm-asha')::text, '[]');
  -- Asking again while one waits returns the same request (one pending per member).
  checks := checks + 1; fails := fails || pg_temp.t45_is('2again', public.owner_request_report(kop, 'm-asha')->>'id', ra::text);
  checks := checks + 1; fails := fails || pg_temp.t45_is('2one',
    (select count(*) from public.gym_report_requests where gym_id = gid and roster_id = 'm-asha')::text, '1');

  -- 3. The member sees it with the date the report starts from; another gym's member does not.
  r := public.member_report_requests(ka);
  checks := checks + 1; fails := fails || pg_temp.t45_is('3mine', r->'requests'->0->>'id', ra::text);
  checks := checks + 1; fails := fails || pg_temp.t45_is('3from', r->'requests'->0->>'fromDay', '2026-06-01');
  checks := checks + 1; fails := fails || pg_temp.t45_is('3agreed', r->'requests'->0->>'agreed', 'false');
  checks := checks + 1; fails := fails || pg_temp.t45_is('3zoya', (public.member_report_requests(kz)->'requests')::text, '[]');
  checks := checks + 1; fails := fails || pg_temp.t45_is('3zoyaanswer',
    public.member_answer_report_request(kz, ra, 'yes')->>'error', 'GONE');
  checks := checks + 1; fails := fails || pg_temp.t45_is('3chandanswer',
    public.member_answer_report_request(kc, ra, 'yes')->>'error', 'GONE');

  -- 4. No file before the member's yes; a bad answer word is refused.
  checks := checks + 1; fails := fails || pg_temp.t45_is('4noyes',
    public.member_attach_report(ka, ra, good, 2, 2)->>'error', 'NOT_AGREED');
  checks := checks + 1; fails := fails || pg_temp.t45_is('4word',
    public.member_answer_report_request(ka, ra, 'maybe')->>'error', 'BAD_ANSWER');
  r := public.member_answer_report_request(ka, ra, 'yes');
  checks := checks + 1; fails := fails || pg_temp.t45_is('4yes', r->'request'->>'agreed', 'true');
  checks := checks + 1; fails := fails || pg_temp.t45_is('4still', r->'request'->>'status', 'pending');
  -- The desk cannot download before the file is there.
  checks := checks + 1; fails := fails || pg_temp.t45_is('4notsent', pg_temp.t45_run(format(
    'select public.owner_report_file(%L, %L)', ks, ra)), 'NOT_SENT');

  -- 5. The file: the export's own header, nothing from before the join date, not too big.
  checks := checks + 1; fails := fails || pg_temp.t45_is('5early',
    public.member_attach_report(ka, ra, early, 1, 1)->>'error', 'TOO_EARLY');
  -- A workout note shaped like an old date is not read as a workout day (only start,end pairs are).
  checks := checks + 1; fails := fails || pg_temp.t45_is('5note',
    (select d.first_day::text from public._report_csv_days(
      '"Push","1 Jun 2026, 18:00","1 Jun 2026, 19:05","12 Jan 2020, 10:00","Bench"') d), '2026-06-01');
  checks := checks + 1; fails := fails || pg_temp.t45_is('5header',
    public.member_attach_report(ka, ra, 'a,b,c', 1, 1)->>'error', 'BAD_FILE');
  checks := checks + 1; fails := fails || pg_temp.t45_is('5count',
    public.member_attach_report(ka, ra, good, -1, 2)->>'error', 'BAD_FILE');
  checks := checks + 1; fails := fails || pg_temp.t45_is('5big',
    public.member_attach_report(ka, ra, head || repeat('x', 3000000), 1, 1)->>'error', 'TOO_BIG');
  checks := checks + 1; fails := fails || pg_temp.t45_is('5nofile',
    (select count(*) from public.gym_report_files where gym_id = gid)::text, '0');
  r := public.member_attach_report(ka, ra, good, 2, 2);
  checks := checks + 1; fails := fails || pg_temp.t45_is('5sent', r->'request'->>'status', 'sent');
  -- Sent again (a lost answer): replaced, still one file.
  r := public.member_attach_report(ka, ra, good, 2, 2);
  checks := checks + 1; fails := fails || pg_temp.t45_is('5again', r->'request'->>'status', 'sent');
  checks := checks + 1; fails := fails || pg_temp.t45_is('5one',
    (select count(*) from public.gym_report_files where gym_id = gid)::text, '1');
  -- A file with no workouts yet (only the header) is a real answer too.
  perform public.member_answer_report_request(kc, rc, 'yes');
  checks := checks + 1; fails := fails || pg_temp.t45_is('5empty',
    public.member_attach_report(kc, rc, head || E'\n', 0, 0)->'request'->>'status', 'sent');

  -- 6. The desk sees it sent, with the days and counts, and downloads the same text. Gym B cannot.
  r := public.owner_report_requests(ks, 'm-asha');
  checks := checks + 1; fails := fails || pg_temp.t45_is('6status', r->0->>'status', 'sent');
  checks := checks + 1; fails := fails || pg_temp.t45_is('6days', (r->0->>'firstDay') || '..' || (r->0->>'lastDay'), '2026-06-01..2026-10-14');
  checks := checks + 1; fails := fails || pg_temp.t45_is('6n', r->0->>'workouts', '2');
  r := public.owner_report_file(ks, ra);
  checks := checks + 1; fails := fails || pg_temp.t45_is('6csv', r->>'csv', good);
  checks := checks + 1; fails := fails || pg_temp.t45_is('6gymb', pg_temp.t45_run(format(
    'select public.owner_report_file(%L, %L)', kob, ra)), 'GONE');
  -- The member no longer sees it as waiting.
  checks := checks + 1; fails := fails || pg_temp.t45_is('6gone', (public.member_report_requests(ka)->'requests')::text, '[]');

  -- 7. No: declined, nothing kept, a file is refused after it.
  ra2 := (public.owner_request_report(ks, 'm-asha')->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t45_is('7new', (ra2 <> ra)::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t45_is('7no',
    public.member_answer_report_request(ka, ra2, 'no')->'request'->>'status', 'declined');
  checks := checks + 1; fails := fails || pg_temp.t45_is('7noagain',
    public.member_answer_report_request(ka, ra2, 'no')->'request'->>'status', 'declined');
  checks := checks + 1; fails := fails || pg_temp.t45_is('7nofile',
    public.member_attach_report(ka, ra2, good, 2, 2)->>'error', 'GONE');
  checks := checks + 1; fails := fails || pg_temp.t45_is('7yeslater',
    public.member_answer_report_request(ka, ra2, 'yes')->>'error', 'GONE');
  checks := checks + 1; fails := fails || pg_temp.t45_is('7desk', (select x->>'status' from jsonb_array_elements(public.owner_report_requests(ks, 'm-asha')) x where x->>'id' = ra2::text), 'declined');

  -- 8. 30 days: a sent report past its time is expired and its file deleted; an unanswered request too.
  update public.gym_report_requests set expires_at = now() - interval '1 minute' where request_id in (ra, rc);
  checks := checks + 1; fails := fails || pg_temp.t45_is('8expired', pg_temp.t45_run(format(
    'select public.owner_report_file(%L, %L)', ks, ra)), 'EXPIRED');
  -- (A refusal undoes its own writes; the next read that answers does the clean-up.)
  checks := checks + 1; fails := fails || pg_temp.t45_is('8shown', (select x->>'status' from jsonb_array_elements(public.owner_report_requests(ks, 'm-asha')) x where x->>'id' = ra::text), 'expired');
  checks := checks + 1; fails := fails || pg_temp.t45_is('8files',
    (select count(*) from public.gym_report_files where gym_id = gid)::text, '0');
  ra2 := (public.owner_request_report(ks, 'm-chand')->>'id')::uuid;
  update public.gym_report_requests set expires_at = now() - interval '1 minute' where request_id = ra2;
  checks := checks + 1; fails := fails || pg_temp.t45_is('8pending', (public.member_report_requests(kc)->'requests')::text, '[]');
  checks := checks + 1; fails := fails || pg_temp.t45_is('8state',
    (select status from public.gym_report_requests where request_id = ra2), 'expired');

  -- 9. At most 5 asks a member a day.
  update public.gym_report_requests set status = 'declined', answered_at = now() where gym_id = gid and roster_id = 'm-chand' and status = 'pending';
  insert into public.gym_report_requests(gym_id, roster_id, from_day, status, answered_at)
    select gid, 'm-chand', date '2026-03-10', 'declined', now() from generate_series(1, 3);
  checks := checks + 1; fails := fails || pg_temp.t45_is('9many', pg_temp.t45_run(format(
    'select public.owner_request_report(%L, %L)', ks, 'm-chand')), 'TOO_MANY');

  -- 10. A paused gym takes no new request and no new file; the member can still say no.
  delete from public.gym_report_requests where gym_id = gid;
  ra2 := (public.owner_request_report(ks, 'm-asha')->>'id')::uuid;
  perform public.member_answer_report_request(ka, ra2, 'yes');
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = gid;
  perform set_config('forgeai.hq', 'off', true);
  checks := checks + 1; fails := fails || pg_temp.t45_is('10file',
    public.member_attach_report(ka, ra2, good, 2, 2)->>'error', 'SUSPENDED');
  checks := checks + 1; fails := fails || pg_temp.t45_is('10ask', pg_temp.t45_run(format(
    'select public.owner_request_report(%L, %L)', ks, 'm-chand')), 'SUSPENDED');
  checks := checks + 1; fails := fails || pg_temp.t45_is('10no',
    public.member_answer_report_request(ka, ra2, 'no')->'request'->>'status', 'declined');
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'active' where gym_id = gid;
  perform set_config('forgeai.hq', 'off', true);

  -- 11. A removed person's session stops at once.
  update public.gym_staff set removed_at = now() where staff_id = s_staff;
  checks := checks + 1; fails := fails || pg_temp.t45_is('11', pg_temp.t45_run(format(
    'select public.owner_report_requests(%L, %L)', ks, 'm-asha')), 'BAD_KEY');

  -- 12. Deleting a gym takes its requests and files with it.
  ra2 := (public.owner_request_report(kop, 'm-asha')->>'id')::uuid;
  perform public.member_answer_report_request(ka, ra2, 'yes');
  perform public.member_attach_report(ka, ra2, good, 2, 2);
  checks := checks + 1; fails := fails || pg_temp.t45_is('12file', (select count(*) from public.gym_report_files where gym_id = gid)::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t45_is('12del', pg_temp.t45_run(format('delete from public.gyms where gym_id = %L', gid)), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t45_is('12', (
    (select count(*) from public.gym_report_requests where gym_id = gid) + (select count(*) from public.gym_report_files where gym_id = gid))::text, '0');

  -- 13. Anyone may call the key-checked functions (no account); nobody may call the helpers or touch the tables.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_report_requests(text)', 'execute')
     or not has_function_privilege('anon', 'public.member_answer_report_request(text, uuid, text)', 'execute')
     or not has_function_privilege('anon', 'public.member_attach_report(text, uuid, text, int, int)', 'execute')
     or not has_function_privilege('anon', 'public.owner_report_requests(text, text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_request_report(text, text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_report_file(text, uuid)', 'execute')
     or has_function_privilege('anon', 'public._report_tidy(uuid)', 'execute')
     or has_function_privilege('anon', 'public._report_join_day(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public._report_csv_days(text)', 'execute')
     or has_function_privilege('anon', 'public._report_request_json(public.gym_report_requests)', 'execute')
     or has_function_privilege('anon', 'public._report_desk_json(uuid, public.gym_report_requests)', 'execute')
     or has_table_privilege('anon', 'public.gym_report_requests', 'select')
     or has_table_privilege('authenticated', 'public.gym_report_requests', 'select')
     or has_table_privilege('anon', 'public.gym_report_files', 'select')
     or has_table_privilege('authenticated', 'public.gym_report_files', 'select')
     or has_table_privilege('anon', 'public.gym_report_files', 'insert')
     or has_table_privilege('authenticated', 'public.gym_report_requests', 'update') then fails := fails || ' 13'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
