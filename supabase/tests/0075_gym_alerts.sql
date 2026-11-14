-- The gym's alerts list (0075). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be pasted into
-- the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

create or replace function pg_temp.t75_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t75_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gb uuid;
  ma uuid; mb uuid; mz uuid;
  sown uuid; sdesk uuid; strain uuid;
  ko text := 't75-owner-key'; kdesk text := 't75-desk-key'; ktrain text := 't75-trainer-key'; kpo text := 't75-person-owner-key';
  sper uuid;
  q1 uuid; q2 uuid; th uuid; th2 uuid; th3 uuid; rq uuid; rq2 uuid; rr uuid;
  day date := (now() at time zone 'Asia/Kolkata')::date;
  fails text := ''; checks int := 0; r jsonb; n int;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T75 Gym', 'T75GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T75 Other', 'T75GYB', 1) returning gym_id into gb;
  insert into public.gym_owner_keys(gym_id, key_hash) values (gid, public._hash_key(ko));
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Desk Dinesh', '9876507411', 'staff') returning staff_id into sdesk;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Trainer Tara', '9876507412', 'staff') returning staff_id into strain;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner Om', '9876507413', 'owner') returning staff_id into sper;
  insert into public.gym_sessions(staff_id, key_hash) values (sdesk, public._hash_key(kdesk)), (strain, public._hash_key(ktrain)), (sper, public._hash_key(kpo));
  insert into public.gym_trainers(staff_id, gym_id) values (strain, gid);

  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 't75-r-asha', '{"fullName":"Asha Rao","phone":"9876507401"}', 1),
    (gid, 'member', 't75-r-bina', '{"fullName":"Bina Shah","phone":"9876507402"}', 1),
    (gid, 'membership', 't75-ms-asha', jsonb_build_object('memberId', 't75-r-asha', 'planId', 'monthly',
       'startsOn', to_char(day - 28, 'YYYY-MM-DD'), 'endsOn', to_char(day + 2, 'YYYY-MM-DD')), 1),
    (gid, 'membership', 't75-ms-bina', jsonb_build_object('memberId', 't75-r-bina', 'planId', 'monthly',
       'startsOn', to_char(day - 10, 'YYYY-MM-DD'), 'endsOn', to_char(day + 20, 'YYYY-MM-DD')), 1);

  -- 1. A member joins with the code: an alert with their first name.
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Asha Rao', public._hash_key('t75-m-a'), '9876507401') returning member_id into ma;
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Bina', public._hash_key('t75-m-b'), '9876507402') returning member_id into mb;
  insert into public.gym_members(gym_id, name, key_hash) values (gb, 'Zoya', public._hash_key('t75-m-z')) returning member_id into mz;
  checks := checks + 1; fails := fails || pg_temp.t75_is('1joined', (select line || ' ' || route || ' ' || urgent from public.gym_alerts where tag = 'joined:' || ma),
    'Asha joined your gym in the MettleUp app. See them in Members using the app. /members/app false');

  -- 2. Questions: one to the trainer, one to "any trainer".
  insert into public.trainer_questions(gym_id, member_id, roster_id, staff_id, question) values (gid, ma, 't75-r-asha', strain, 'How many sets?') returning question_id into q1;
  insert into public.trainer_questions(gym_id, member_id, roster_id, question) values (gid, mb, 't75-r-bina', 'Knee hurts') returning question_id into q2;
  checks := checks + 1; fails := fails || pg_temp.t75_is('2line', (select line || ' ' || route || ' ' || audience || ' ' || urgent from public.gym_alerts where tag = 'question:' || q1),
    'Asha asked a trainer a question. Open Questions to reply. /questions question false');

  -- 3. Message your gym: a question, a member's reply in it, anonymous feedback, a complaint (owner only, instant).
  insert into public.gym_talk_threads(gym_id, member_id, roster_id, kind) values (gid, ma, 't75-r-asha', 'question') returning thread_id into th;
  insert into public.gym_talk_messages(thread_id, gym_id, from_gym, body) values (th, gid, false, 'Open on Sunday?');
  insert into public.gym_talk_messages(thread_id, gym_id, from_gym, body) values (th, gid, true, 'Yes');
  insert into public.gym_talk_messages(thread_id, gym_id, from_gym, body) values (th, gid, false, 'Thanks');
  insert into public.gym_talk_threads(gym_id, member_id, kind, anonymous) values (gid, mb, 'feedback', true) returning thread_id into th2;
  insert into public.gym_talk_messages(thread_id, gym_id, from_gym, body) values (th2, gid, false, 'Music too loud');
  insert into public.gym_talk_threads(gym_id, member_id, roster_id, kind) values (gid, mb, 't75-r-bina', 'complaint') returning thread_id into th3;
  insert into public.gym_talk_messages(thread_id, gym_id, from_gym, body) values (th3, gid, false, 'Rude trainer');
  checks := checks + 1; fails := fails || pg_temp.t75_is('3lines', (select string_agg(line, ' | ' order by created_at, line collate "C") from public.gym_alerts where gym_id = gid and route = '/member-messages'),
    'A member sent your gym feedback without their name. Open Member messages to read it. | Asha replied in Member messages. Open it to read the reply. | Asha sent your gym a question. Open Member messages to reply. | Bina sent your gym a complaint. Open Member messages to read it.');
  checks := checks + 1; fails := fails || pg_temp.t75_is('3gym', (select count(*) from public.gym_alerts where gym_id = gid and route = '/member-messages')::text, '4');
  checks := checks + 1; fails := fails || pg_temp.t75_is('3complaint', (select audience || ' ' || urgent from public.gym_alerts where kind = 'member_complaint' and gym_id = gid), 'owner true');

  -- 4. Plan requests: Asha's plan ends in 2 days (instant), Bina's in 20 (digest).
  insert into public.gym_plan_requests(gym_id, app_member, roster_id, kind, plan_id, plan_name) values (gid, ma, 't75-r-asha', 'renew', 'monthly', 'Monthly') returning request_id into rq;
  insert into public.gym_plan_requests(gym_id, app_member, roster_id, kind, freeze_from, freeze_to) values (gid, mb, 't75-r-bina', 'freeze', date '2026-12-01', date '2026-12-08') returning request_id into rq2;
  checks := checks + 1; fails := fails || pg_temp.t75_is('4asha', (select line || ' ' || urgent from public.gym_alerts where tag = 'plan_request:' || rq),
    'Asha asked to renew their plan (Monthly). Approve or say no on Today. true');
  checks := checks + 1; fails := fails || pg_temp.t75_is('4bina', (select line || ' ' || urgent from public.gym_alerts where tag = 'plan_request:' || rq2),
    'Bina asked to pause their plan from 1 Dec to 8 Dec. Approve or say no on Today. false');

  -- 5. A check-in number, a shop order, a referral: instant. A report sent: digest, opening the member's page.
  insert into public.gym_phone_links(gym_id, app_member, roster_id, phone) values (gid, mb, 't75-r-bina', '+919876507402');
  insert into public.shop_orders(gym_id, member_id, member_name, order_no, lines, total_p) values (gid, ma, 'Asha Rao', 7401, '[]', 50000);
  insert into public.gym_friend_referrals(enquiry_id, gym_id, member_id, code) values ('t75-enq-1', gid, ma, 'ABCDEFGH');
  insert into public.gym_report_requests(gym_id, roster_id, from_day) values (gid, 't75-r-bina', date '2026-01-01') returning request_id into rr;
  checks := checks + 1; fails := fails || pg_temp.t75_is('5report-none', (select count(*) from public.gym_alerts where tag = 'report:' || rr)::text, '0');
  update public.gym_report_requests set status = 'sent', sent_at = now(), agreed_at = now(), answered_at = now(), app_member = mb where request_id = rr;
  update public.gym_report_requests set status = 'sent' where request_id = rr;
  checks := checks + 1; fails := fails || pg_temp.t75_is('5report', (select line || ' ' || route from public.gym_alerts where tag = 'report:' || rr),
    'Bina sent the workout report you asked for. Open their page to read it. /members/t75-r-bina');
  checks := checks + 1; fails := fails || pg_temp.t75_is('5instant', (select string_agg(kind || ':' || urgent, ',' order by kind) from public.gym_alerts where gym_id = gid and kind in ('phone_link', 'shop_order', 'friend_referred')),
    'friend_referred:true,phone_link:true,shop_order:true');
  checks := checks + 1; fails := fails || pg_temp.t75_is('5order', (select line from public.gym_alerts where kind = 'shop_order' and gym_id = gid), 'New shop order 7401 from Asha. Get it ready on Shop.');
  checks := checks + 1; fails := fails || pg_temp.t75_is('5friend', (select line from public.gym_alerts where kind = 'friend_referred' and gym_id = gid), 'Asha''s friend asked about joining your gym. Call them from Enquiries.');
  -- Never a phone number in any line.
  checks := checks + 1; fails := fails || pg_temp.t75_is('5nophone', (select count(*) from public.gym_alerts where gym_id = gid and line ~ '[0-9]{10}')::text, '0');

  -- 6. Paid online, from the HQ Worker: once per request; a bad id or another gym's made-up id skipped.
  r := public.hq_gym_alerts_paid(jsonb_build_array(
    jsonb_build_object('id', 'pr_t75aaaaaaaa', 'gymId', gid, 'kind', 'fee', 'rosterId', 't75-r-bina', 'label', 'Monthly plan'),
    jsonb_build_object('id', 'nope', 'gymId', gid),
    jsonb_build_object('id', 'pr_t75bbbbbbbb', 'gymId', gen_random_uuid())));
  perform public.hq_gym_alerts_paid(jsonb_build_array(jsonb_build_object('id', 'pr_t75aaaaaaaa', 'gymId', gid, 'rosterId', 't75-r-bina', 'label', 'Monthly plan')));
  checks := checks + 1; fails := fails || pg_temp.t75_is('6paid', (select string_agg(line || ' ' || route, ',') from public.gym_alerts where kind = 'paid_online'),
    'Bina paid online for Monthly plan. See it on Money. /money');
  checks := checks + 1; fails := fails || pg_temp.t75_is('6invalid', pg_temp.t75_run('select public.hq_gym_alerts_paid(''{}''::jsonb)'), 'INVALID');

  -- 7. Who sees what. The owner key: everything except the question asked to the trainer (0053's rule).
  checks := checks + 1; fails := fails || pg_temp.t75_is('7count', (select count(*) from public.gym_alerts where gym_id = gid)::text, '15');
  checks := checks + 1; fails := fails || pg_temp.t75_is('7owner', (select jsonb_array_length(public.owner_alerts(ko)->'alerts'))::text, '14');
  checks := checks + 1; fails := fails || pg_temp.t75_is('7person-owner', (select jsonb_array_length(public.owner_alerts(kpo)->'alerts'))::text, '14');
  -- The trainer: both questions, no complaint.
  checks := checks + 1; fails := fails || pg_temp.t75_is('7trainer', (select string_agg(x->>'kind', ',') from jsonb_array_elements(public.owner_alerts(ktrain)->'alerts') x
     where x->>'kind' in ('trainer_question', 'member_complaint')), 'trainer_question,trainer_question');
  -- The desk without the trainer tick: no question, no complaint; everything else.
  checks := checks + 1; fails := fails || pg_temp.t75_is('7desk', (select count(*) from jsonb_array_elements(public.owner_alerts(kdesk)->'alerts') x
     where x->>'kind' in ('trainer_question', 'member_complaint'))::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t75_is('7desk-n', (select jsonb_array_length(public.owner_alerts(kdesk)->'alerts'))::text, '12');
  -- An answer holds what the panel needs and nothing more.
  checks := checks + 1; fails := fails || pg_temp.t75_is('7shape', (select string_agg(k, ',' order by k) from jsonb_object_keys(public.owner_alerts(ko)->'alerts'->0) k), 'at,id,kind,line,route,urgent');
  -- p_after: only newer ones; the other gym's owner sees none of these.
  checks := checks + 1; fails := fails || pg_temp.t75_is('7after', (select jsonb_array_length(public.owner_alerts(ko, (extract(epoch from now()) * 1000)::bigint + 1000)->'alerts'))::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t75_is('7badkey', pg_temp.t75_run('select public.owner_alerts(''t75-no-such-key'')'), 'BAD_KEY');
  -- A removed person sees nothing any more (their session no longer opens the gym).
  update public.gym_staff set removed_at = now() where staff_id = sdesk;
  checks := checks + 1; fails := fails || pg_temp.t75_is('7removed', pg_temp.t75_run('select public.owner_alerts(''t75-desk-key'')'), 'BAD_KEY');

  -- 8. A member's own action never fails because of an alert: a broken line (too short) is only a warning.
  perform public._alert(gid, 'member_joined', 'x', 't75-short', 'all', false, 'x', '/');
  checks := checks + 1; fails := fails || pg_temp.t75_is('8warn', (select count(*) from public.gym_alerts where tag = 't75-short')::text, '0');

  -- 9. Who may call what.
  checks := checks + 1;
  if has_function_privilege('anon', 'public.hq_gym_alerts_paid(jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.hq_gym_alerts_paid(jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.owner_alerts(text, bigint)', 'execute')
     or has_function_privilege('anon', 'public._alert(uuid, text, text, text, text, boolean, text, text)', 'execute')
     or has_function_privilege('anon', 'public._alert_talk_line()', 'execute')
     or has_table_privilege('anon', 'public.gym_alerts', 'select')
     or has_table_privilege('authenticated', 'public.gym_alerts', 'insert') then fails := fails || ' 9'; end if;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  checks := checks + 1; fails := fails || pg_temp.t75_is('9guard', pg_temp.t75_run('select public.hq_gym_alerts_paid(''[]''::jsonb)'), 'HQ_ONLY');
  perform set_config('request.jwt.claims', '', true);

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
