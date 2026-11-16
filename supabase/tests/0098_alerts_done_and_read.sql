-- The bell knows what is done and what each person read (0098, R-604). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).
-- One transaction, so now() stands still: times are set by hand (created_at) where order matters.

create or replace function pg_temp.t98_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t98_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- How an alert was handled: 'null', or "how by".
create or replace function pg_temp.t98_how(p_id uuid) returns text
  language sql as $$
  select coalesce(handled_how, 'null') || coalesce(' ' || handled_by, '') from public.gym_alerts where alert_id = p_id
$$;

-- The alert of a conversation's nth member line.
create or replace function pg_temp.t98_talk(p_thread uuid, p_n int) returns uuid
  language sql as $$
  select a.alert_id from public.gym_alerts a
   where a.tag = 'talk:' || (select m.msg_id from public.gym_talk_messages m where m.thread_id = p_thread and not m.from_gym
                              order by m.seq offset p_n - 1 limit 1)
$$;

-- Where one alert is in this person's bell: 'open', 'history:<left>' or '-' (not there).
create or replace function pg_temp.t98_where(p_key text, p_id uuid) returns text
  language sql as $$
  with l as (select public.owner_alert_list(p_key) as j)
  select coalesce(
    (select 'open' from l, jsonb_array_elements(l.j->'open') x where x->>'id' = p_id::text),
    (select 'history:' || (x->>'left') from l, jsonb_array_elements(l.j->'history') x where x->>'id' = p_id::text),
    '-')
$$;

-- "count/newCount/open action/open info unread/open info" of this person's bell.
create or replace function pg_temp.t98_count(p_key text) returns text
  language sql as $$
  with l as (select public.owner_alert_list(p_key) as j)
  select (l.j->>'count') || '/' || (l.j->>'newCount') || '/'
      || (select count(*) from jsonb_array_elements(l.j->'open') x where x->>'needs' = 'action') || '/'
      || (select count(*) from jsonb_array_elements(l.j->'open') x where x->>'needs' = 'info' and x->>'read' = 'false') || '/'
      || (select count(*) from jsonb_array_elements(l.j->'open') x where x->>'needs' = 'info')
    from l
$$;

-- "endpoint-tail body / tag" of each push to this test's browsers, sorted.
create or replace function pg_temp.t98_sends(r jsonb) returns text
  language sql as $$
  select coalesce(string_agg(right(x->>'endpoint', 6) || ' ' || (x->>'body') || ' / ' || (x->>'tag'), ' | '
                             order by right(x->>'endpoint', 6) collate "C", x->>'tag' collate "C"), '-')
    from jsonb_array_elements(r->'sends') x where x->>'endpoint' like '%t98-%'
$$;

do $$
declare
  ga uuid; gb uuid; s_owner uuid; s_desk uuid; s_tara uuid; ma uuid; mb uuid;
  kok text := 't98-owner-key'; kop text := 't98-owner-session'; kd text := 't98-desk-session'; kt text := 't98-tara-session';
  kb_owner text := 't98-other-owner-key'; ka text := 't98-member-asha'; kbm text := 't98-member-bilal';
  e_own text := 'https://fcm.googleapis.com/fcm/send/t98-browser-own001';
  e_desk text := 'https://updates.push.services.mozilla.com/wpush/v2/t98-browser-dsk002';
  e_tara text := 'https://web.push.apple.com/t98-browser-tar003';
  pk text := repeat('B', 87); au text := repeat('A', 22);
  today text := to_char(public._ist_today(), 'YYYY-MM-DD');
  th1 uuid; th2 uuid; th3 uuid; q1 uuid; q2 uuid; p1 uuid; p2 uuid; p3 uuid; l1 uuid; l2 uuid; o1 uuid; o2 uuid;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; aq1 uuid; aq2 uuid; ap1 uuid; ap2 uuid; al1 uuid; ao1 uuid; ao2 uuid;
  ae1 uuid; ae2 uuid; ae3 uuid; ae4 uuid; ae5 uuid; afi uuid; j1 uuid; pay1 uuid; jold uuid; jgone uuid; aold uuid;
  u1 uuid; fb uuid; jx uuid; rx uuid; ids uuid[];
  fails text := ''; checks int := 0; r jsonb;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T98 Gym', 'T98GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T98 Other', 'T98GYB', 1) returning gym_id into gb;
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kok)), (gb, public._hash_key(kb_owner));
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Om Prakash', '9876509801', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Dinesh Desk', '9876509802', 'staff') returning staff_id into s_desk;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Tara Singh', '9876509803', 'staff') returning staff_id into s_tara;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_desk, public._hash_key(kd)),
    (s_tara, public._hash_key(kt));
  insert into public.gym_trainers(staff_id, gym_id) values (s_tara, ga);
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'member', 't98-asha', '{"fullName":"Asha Verma","phone":"+919829098001"}', 1),
    (ga, 'member', 't98-bilal', '{"fullName":"Bilal Khan","phone":"+919829098002"}', 1);
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (ga, 'Asha', '+919829098001', public._hash_key(ka)) returning member_id into ma;
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (ga, 'Bilal', '+919829098002', public._hash_key(kbm)) returning member_id into mb;

  -- 1. Member messages: a reply handles the lines before it (and says who); a new line is a new alert; "done" handles
  --    it; taking "done" back makes it wait again; a conversation that is removed is done.
  th1 := (public.member_talk_send(ka, 'question', false, 'Is the gym open on Sunday?')->'thread'->>'id')::uuid;
  a1 := pg_temp.t98_talk(th1, 1);
  checks := checks + 1; fails := fails || pg_temp.t98_is('1open', pg_temp.t98_how(a1), 'null');
  perform public.owner_talk_reply(kd, th1, 'Yes, 6 am to 12 noon.');
  checks := checks + 1; fails := fails || pg_temp.t98_is('1reply', pg_temp.t98_how(a1), 'reply Dinesh Desk');
  perform public.member_talk_reply(ka, th1, 'Thanks. And on Monday?');
  a2 := pg_temp.t98_talk(th1, 2);
  checks := checks + 1; fails := fails || pg_temp.t98_is('1newline', pg_temp.t98_how(a1) || ' / ' || pg_temp.t98_how(a2), 'reply Dinesh Desk / null');
  perform public.owner_talk_done(kop, th1, true);
  checks := checks + 1; fails := fails || pg_temp.t98_is('1done', pg_temp.t98_how(a2), 'done Om Prakash');
  -- Times in order (one transaction: now() stands still): the reply 2 h ago, the member's lines 1 h ago, done 30 min ago.
  update public.gym_talk_messages set created_at = now() - interval '2 hours' where thread_id = th1 and from_gym;
  update public.gym_talk_messages set created_at = now() - interval '1 hour' where thread_id = th1 and not from_gym;
  update public.gym_talk_threads set done_at = now() - interval '30 minutes' where thread_id = th1;
  perform public.owner_talk_done(kop, th1, false);
  checks := checks + 1; fails := fails || pg_temp.t98_is('1undone', pg_temp.t98_how(a1) || ' / ' || pg_temp.t98_how(a2), 'reply Dinesh Desk / null');
  -- A new line after "done" opens it again: the new line is its own alert, the old one stays done.
  perform public.owner_talk_done(kop, th1, true);
  perform public.member_talk_reply(ka, th1, 'Sorry, one more thing.');
  a4 := pg_temp.t98_talk(th1, 3);
  checks := checks + 1; fails := fails || pg_temp.t98_is('1reopened', pg_temp.t98_how(a2) || ' / ' || pg_temp.t98_how(a4), 'done Om Prakash / null');
  th2 := (public.member_talk_send(ka, 'complaint', false, 'The shower is broken.')->'thread'->>'id')::uuid;
  a3 := pg_temp.t98_talk(th2, 1);
  th3 := (public.member_talk_send(ka, 'feedback', false, 'Great new machines.')->'thread'->>'id')::uuid;
  delete from public.gym_talk_threads where thread_id = th3;
  checks := checks + 1; fails := fails || pg_temp.t98_is('1gone',
    (select coalesce(handled_how, 'null') from public.gym_alerts where ref_id = th3::text), 'gone');

  -- 2. Member questions: answered (and by whom), withdrawn.
  insert into public.trainer_questions(gym_id, member_id, roster_id, question) values (ga, ma, 't98-asha', 'How many sets?') returning question_id into q1;
  insert into public.trainer_questions(gym_id, member_id, roster_id, question) values (ga, ma, 't98-asha', 'Can I skip legs?') returning question_id into q2;
  select alert_id into aq1 from public.gym_alerts where ref_id = q1::text;
  select alert_id into aq2 from public.gym_alerts where ref_id = q2::text;
  checks := checks + 1; fails := fails || pg_temp.t98_is('2open', pg_temp.t98_how(aq1), 'null');
  update public.trainer_questions set answer = 'Three sets of ten.', answered_at = now(), answered_by_name = 'Tara Singh' where question_id = q1;
  update public.trainer_questions set withdrawn_at = now() where question_id = q2;
  checks := checks + 1; fails := fails || pg_temp.t98_is('2done', pg_temp.t98_how(aq1) || ' / ' || pg_temp.t98_how(aq2), 'answered Tara Singh / withdrawn');

  -- 3. Plan requests: said no to (and by whom); taken back by the member.
  insert into public.gym_plan_requests(gym_id, app_member, roster_id, kind, freeze_from, freeze_to)
    values (ga, ma, 't98-asha', 'freeze', current_date + 1, current_date + 10) returning request_id into p1;
  insert into public.gym_plan_requests(gym_id, app_member, roster_id, kind, plan_id, plan_name)
    values (ga, ma, 't98-asha', 'renew', 'plan-1', 'Monthly') returning request_id into p2;
  select alert_id into ap1 from public.gym_alerts where ref_id = p1::text;
  select alert_id into ap2 from public.gym_alerts where ref_id = p2::text;
  update public.gym_plan_requests set status = 'declined', decided_at = now(), decided_by_name = 'Dinesh Desk' where request_id = p1;
  delete from public.gym_plan_requests where request_id = p2;
  checks := checks + 1; fails := fails || pg_temp.t98_is('3plan', pg_temp.t98_how(ap1) || ' / ' || pg_temp.t98_how(ap2), 'decided Dinesh Desk / taken_back');

  -- 4. A check-in number confirmed.
  insert into public.gym_phone_links(gym_id, app_member, roster_id, phone) values (ga, ma, 't98-asha', '+919829098001') returning link_id into l1;
  select alert_id into al1 from public.gym_alerts where ref_id = l1::text;
  checks := checks + 1; fails := fails || pg_temp.t98_is('4open', pg_temp.t98_how(al1), 'null');
  update public.gym_phone_links set status = 'approved', decided_at = now(), decided_by_name = 'Dinesh Desk' where link_id = l1;
  checks := checks + 1; fails := fails || pg_temp.t98_is('4link', pg_temp.t98_how(al1), 'decided Dinesh Desk');

  -- 5. Shop orders: ready; cancelled by the member.
  insert into public.shop_orders(gym_id, member_id, member_name, order_no, lines, total_p) values (ga, ma, 'Asha', 9801, '[]', 0) returning order_id into o1;
  insert into public.shop_orders(gym_id, member_id, member_name, order_no, lines, total_p) values (ga, ma, 'Asha', 9802, '[]', 0) returning order_id into o2;
  select alert_id into ao1 from public.gym_alerts where ref_id = o1::text;
  select alert_id into ao2 from public.gym_alerts where ref_id = o2::text;
  update public.shop_orders set status = 'ready', updated_at = now() where order_id = o1;
  update public.shop_orders set status = 'cancelled', cancelled_by = 'member', updated_at = now() where order_id = o2;
  checks := checks + 1; fails := fails || pg_temp.t98_is('5order', pg_temp.t98_how(ao1) || ' / ' || pg_temp.t98_how(ao2), 'moved_on / moved_on');

  -- 6. Enquiries: not interested; called (next call on a later day); the web page chat marked done; deleted. A name
  --    change, a next call still today, or a date that is not a date: still waiting (and never an error).
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'enquiry', 't98-e1', jsonb_build_object('id', 't98-e1', 'name', 'Ravi', 'status', 'open', 'followUpOn', today), 2),
    (ga, 'enquiry', 't98-e2', jsonb_build_object('id', 't98-e2', 'name', 'Sana', 'status', 'open', 'followUpOn', today), 2),
    (ga, 'enquiry', 't98-e3', jsonb_build_object('id', 't98-e3', 'name', 'Visitor', 'status', 'open', 'followUpOn', today,
                                                   'pageChat', jsonb_build_object('status', 'needs_you')), 2),
    (ga, 'enquiry', 't98-e4', jsonb_build_object('id', 't98-e4', 'name', 'Kabir', 'status', 'open', 'followUpOn', today), 2),
    (ga, 'enquiry', 't98-e5', jsonb_build_object('id', 't98-e5', 'name', 'Meera', 'status', 'open', 'followUpOn', today), 2);
  perform public._alert(ga, 'friend_referred', 't98-e1', 't98:e1', 'all', true, 'Asha''s friend asked about joining your gym. Call them from Enquiries.', '/enquiries');
  perform public._alert(ga, 'online_join', 't98-e2', 't98:e2', 'all', true, 'Sana asked to join online. Call them from Enquiries.', '/');
  perform public._alert(ga, 'page_question', 't98-e3', 't98:e3', 'all', true, 'A visitor asked something on your web page that the AI could not answer. Open Enquiries to read the chat.', '/enquiries');
  perform public._alert(ga, 'friend_referred', 't98-e4', 't98:e4', 'all', true, 'Asha''s friend asked about joining your gym. Call them from Enquiries.', '/enquiries');
  perform public._alert(ga, 'friend_referred', 't98-e5', 't98:e5', 'all', true, 'Asha''s friend asked about joining your gym. Call them from Enquiries.', '/enquiries');
  -- A friend who is already a member: news, not a call (0085: their member page).
  perform public._alert(ga, 'friend_referred', 't98-asha', 't98:fi', 'all', true, 'Asha''s friend Bilal is already a member. See their page.', '/members/t98-bilal');
  select alert_id into ae1 from public.gym_alerts where tag = 't98:e1';
  select alert_id into ae2 from public.gym_alerts where tag = 't98:e2';
  select alert_id into ae3 from public.gym_alerts where tag = 't98:e3';
  select alert_id into ae4 from public.gym_alerts where tag = 't98:e4';
  select alert_id into ae5 from public.gym_alerts where tag = 't98:e5';
  select alert_id into afi from public.gym_alerts where tag = 't98:fi';
  update public.crm_records set data = data || '{"status":"lost"}' where gym_id = ga and kind = 'enquiry' and id = 't98-e1';
  update public.crm_records set data = data || jsonb_build_object('followUpOn', to_char(public._ist_today() + 3, 'YYYY-MM-DD'))
   where gym_id = ga and kind = 'enquiry' and id = 't98-e2';
  update public.crm_records set data = jsonb_set(data, '{pageChat,doneAt}', to_jsonb(floor(extract(epoch from now()) * 1000)::bigint))
   where gym_id = ga and kind = 'enquiry' and id = 't98-e3';
  update public.crm_records set deleted = true where gym_id = ga and kind = 'enquiry' and id = 't98-e4';
  update public.crm_records set data = data || '{"name":"Meera Shah"}' where gym_id = ga and kind = 'enquiry' and id = 't98-e5';
  checks := checks + 1; fails := fails || pg_temp.t98_is('6notadate',
    pg_temp.t98_run(format('update public.crm_records set data = data || %L where gym_id = %L and kind = %L and id = %L', '{"followUpOn":"soon"}', ga, 'enquiry', 't98-e5')), 'ok');
  update public.crm_records set data = data || jsonb_build_object('followUpOn', today) where gym_id = ga and kind = 'enquiry' and id = 't98-e5';
  checks := checks + 1; fails := fails || pg_temp.t98_is('6enquiry',
    pg_temp.t98_how(ae1) || ' / ' || pg_temp.t98_how(ae2) || ' / ' || pg_temp.t98_how(ae3) || ' / ' || pg_temp.t98_how(ae4) || ' / ' || pg_temp.t98_how(ae5),
    'not_interested / called / chat_done / gone / null');
  -- Made a member (status 'joined') handles it too.
  update public.crm_records set data = data || '{"status":"joined"}' where gym_id = ga and kind = 'enquiry' and id = 't98-e5';
  checks := checks + 1; fails := fails || pg_temp.t98_is('6joined', pg_temp.t98_how(ae5), 'joined');

  -- 7. Info items are never "done" on the server (each person's bell decides).
  perform public._alert(ga, 'member_joined', ma::text, 't98:j1', 'all', false, 'Asha joined your gym in the MettleUp app. See them in Members using the app.', '/members/app');
  perform public._alert(ga, 'paid_online', 'pr_t98pay1', 't98:pay1', 'all', false, 'Asha paid online for Monthly. See it on Money.', '/money');
  select alert_id into j1 from public.gym_alerts where tag = 't98:j1';
  select alert_id into pay1 from public.gym_alerts where tag = 't98:pay1';
  checks := checks + 1; fails := fails || pg_temp.t98_is('7info', pg_temp.t98_how(j1) || ' / ' || pg_temp.t98_how(pay1) || ' / ' || pg_temp.t98_how(afi), 'null / null / null');

  -- 8. Each person's bell.
  -- 8a. Where things are: open until done; done ones in History; a complaint only for the owner; a question for the
  --     trainer and the owner, never the desk.
  checks := checks + 1; fails := fails || pg_temp.t98_is('8aowner',
    pg_temp.t98_where(kok, a4) || ' ' || pg_temp.t98_where(kok, a1) || ' ' || pg_temp.t98_where(kok, a3) || ' ' || pg_temp.t98_where(kok, j1) || ' ' || pg_temp.t98_where(kok, afi),
    'open history:done open open open');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8adesk',
    pg_temp.t98_where(kd, a4) || ' ' || pg_temp.t98_where(kd, a3) || ' ' || pg_temp.t98_where(kd, aq1),
    'open - -');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8atrainer', pg_temp.t98_where(kt, aq1) || ' ' || pg_temp.t98_where(kt, a3), 'history:done -');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8ahistory',
    (select (x->>'done') || ' ' || (x->>'doneHow') || ' ' || (x->>'doneBy') || ' ' || ((x->>'leftAt')::bigint = floor(extract(epoch from now()) * 1000)::bigint)
       from jsonb_array_elements(public.owner_alert_list(kok)->'history') x where x->>'id' = ap1::text),
    'true decided Dinesh Desk true');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8ashape',
    (select string_agg(k, ',' order by k) from jsonb_object_keys(public.owner_alert_list(kok)) k), 'count,history,newCount,now,ok,open');
  -- Open for the owner key: a4 (question), a3 (complaint); j1, pay1, afi and the two joins 0075 raised when Asha and
  -- Bilal joined at the start (news, not read). Count: all 7; new: 7.
  checks := checks + 1; fails := fails || pg_temp.t98_is('7joins',
    (select string_agg(kind, ',' order by kind) from public.gym_alerts where gym_id = ga and public._alert_needs(kind, route) = 'info' and alert_id not in (j1, pay1, afi)),
    'member_joined,member_joined');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8acount', pg_temp.t98_count(kok), '7/7/2/5/5');
  -- 8b. The panel opens: everything shown is read for THIS person only. Action items stay and still count; news
  --     stays in the list without a number.
  select array_agg((x->>'id')::uuid) into ids from jsonb_array_elements(public.owner_alert_list(kok)->'open') x;
  checks := checks + 1; fails := fails || pg_temp.t98_is('8bread', public.owner_alerts_read(kok, ids)::text, '{"ok": true, "read": 7}');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8bagain', public.owner_alerts_read(kok, ids)->>'read', '0');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8bowner', pg_temp.t98_count(kok), '2/0/2/0/5');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8bperson', pg_temp.t98_count(kop), '7/7/2/5/5');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8bdesk', pg_temp.t98_count(kd), '6/6/1/5/5');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8bnotdone', pg_temp.t98_how(a4) || ' ' || pg_temp.t98_how(a3), 'null null');
  -- 8c. News opened (tapped) by the owner key: in its History; still open for the desk and the owner's own sign-in.
  checks := checks + 1; fails := fails || pg_temp.t98_is('8copened', public.owner_alert_opened(kok, j1)::text, '{"ok": true, "opened": true}');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8cwhere',
    pg_temp.t98_where(kok, j1) || ' ' || pg_temp.t98_where(kd, j1) || ' ' || pg_temp.t98_where(kop, j1), 'history:opened open open');
  -- An action item opened stays until it is done.
  perform public.owner_alert_opened(kok, a4);
  checks := checks + 1; fails := fails || pg_temp.t98_is('8caction', pg_temp.t98_where(kok, a4) || ' ' || pg_temp.t98_how(a4), 'open null');
  -- 8d. X (remove) on an action item: off THIS person's list only, never done; Undo puts it back.
  checks := checks + 1; fails := fails || pg_temp.t98_is('8dremove', public.owner_alert_remove(kd, a4, true)::text, '{"ok": true, "removed": true}');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8dwhere',
    pg_temp.t98_where(kd, a4) || ' ' || pg_temp.t98_where(kok, a4) || ' ' || pg_temp.t98_where(kt, a4) || ' ' || pg_temp.t98_how(a4),
    'history:removed open open null');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8dnotdone',
    (select x->>'done' from jsonb_array_elements(public.owner_alert_list(kd)->'history') x where x->>'id' = a4::text)
      || ' ' || (public.owner_talk_count(kok)->>'waiting'), 'false 2');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8dcount', pg_temp.t98_count(kd), '5/5/0/5/5');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8dundo', public.owner_alert_remove(kd, a4, false)::text, '{"ok": true, "removed": false}');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8dback', pg_temp.t98_where(kd, a4) || ' ' || pg_temp.t98_count(kd), 'open 6/5/1/5/5');
  -- X on news: History for this person.
  perform public.owner_alert_remove(kd, pay1, true);
  checks := checks + 1; fails := fails || pg_temp.t98_is('8dnews', pg_temp.t98_where(kd, pay1) || ' ' || pg_temp.t98_where(kok, pay1), 'history:removed open');
  -- When the removed thing is done later, History says done.
  perform public.owner_alert_remove(kd, a4, true);
  perform public.owner_talk_reply(kop, th1, 'We open at 6 am on Monday.');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8ddone',
    (select (x->>'left') || ' ' || (x->>'done') from jsonb_array_elements(public.owner_alert_list(kd)->'history') x where x->>'id' = a4::text)
      || ' ' || pg_temp.t98_where(kok, a4), 'done true history:done');
  -- 8e. Time: news not opened leaves the list after 7 days (History until 14); an action item not done never leaves.
  perform public._alert(ga, 'member_joined', 't98-old1', 't98:jold', 'all', false, 'Ravi joined your gym in the MettleUp app. See them in Members using the app.', '/members/app');
  perform public._alert(ga, 'member_joined', 't98-old2', 't98:jgone', 'all', false, 'Kiran joined your gym in the MettleUp app. See them in Members using the app.', '/members/app');
  perform public._alert(ga, 'plan_request', 't98-noreq', 't98:aold', 'all', false, 'Asha asked to renew their plan. Approve or say no on Today.', '/');
  select alert_id into jold from public.gym_alerts where tag = 't98:jold';
  select alert_id into jgone from public.gym_alerts where tag = 't98:jgone';
  select alert_id into aold from public.gym_alerts where tag = 't98:aold';
  update public.gym_alerts set created_at = now() - interval '8 days' where alert_id = jold;
  update public.gym_alerts set created_at = now() - interval '15 days' where alert_id = jgone;
  update public.gym_alerts set created_at = now() - interval '20 days' where alert_id = aold;
  checks := checks + 1; fails := fails || pg_temp.t98_is('8etime',
    pg_temp.t98_where(kok, jold) || ' ' || pg_temp.t98_where(kok, jgone) || ' ' || pg_temp.t98_where(kok, aold), 'history:old - open');
  -- 8f. Refused or left out: what this person may not see, another gym, a test alert, too many ids, a bad key.
  checks := checks + 1; fails := fails || pg_temp.t98_is('8fnotmine',
    (public.owner_alert_opened(kd, a3)->>'error') || ' ' || (public.owner_alert_remove(kd, a3, true)->>'error') || ' '
      || (public.owner_alerts_read(kd, array[a3])->>'read') || ' ' || (public.owner_alert_opened(kb_owner, j1)->>'error'),
    'NOT_FOUND NOT_FOUND 0 NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8fmany',
    pg_temp.t98_run(format('select public.owner_alerts_read(%L, %L::uuid[])', kok, (select array_agg(gen_random_uuid()) from generate_series(1, 201)))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8fnone', public.owner_alerts_read(kok, '{}')::text || ' ' || public.owner_alerts_read(kok, null)::text,
    '{"ok": true, "read": 0} {"ok": true, "read": 0}');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8fbadkey', pg_temp.t98_run(format('select public.owner_alert_list(%L)', 't98-nobody')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t98_is('8fother', pg_temp.t98_count(kb_owner), '0/0/0/0/0');

  -- 9. The pushes. Everything above counts as sent; three browsers: the owner key, the desk, the trainer.
  update public.gym_alerts set sent_at = now(), sent_how = 'instant' where gym_id = ga and sent_at is null;
  perform public.owner_save_web_push(kok, e_own, pk, au);
  perform public.owner_save_web_push(kd, e_desk, pk, au);
  perform public.owner_save_web_push(kt, e_tara, pk, au);
  -- 9a. An urgent alert already done before its turn: sent to nobody ('none').
  insert into public.gym_phone_links(gym_id, app_member, roster_id, phone) values (ga, mb, 't98-bilal', '+919829098002') returning link_id into l2;
  update public.gym_phone_links set status = 'declined', decided_at = now(), decided_by_name = 'Dinesh Desk' where link_id = l2;
  -- 9b. An urgent alert the owner key already read: the desk and the trainer only.
  perform public._alert(ga, 'shop_order', 't98-ox', 't98:u1', 'all', true, 'New shop order 9809 from Bilal. Get it ready on Shop.', '/shop');
  select alert_id into u1 from public.gym_alerts where tag = 't98:u1';
  perform public.owner_alerts_read(kok, array[u1]);
  r := public.hq_panel_push_instant(40);
  checks := checks + 1; fails := fails || pg_temp.t98_is('9instant', pg_temp.t98_sends(r),
    'dsk002 New shop order 9809 from Bilal. Get it ready on Shop. / mettleup-alert-' || u1
    || ' | tar003 New shop order 9809 from Bilal. Get it ready on Shop. / mettleup-alert-' || u1);
  checks := checks + 1; fails := fails || pg_temp.t98_is('9none',
    (select sent_how from public.gym_alerts where ref_id = l2::text) || ' ' || (select sent_how from public.gym_alerts where alert_id = u1), 'none instant');
  -- 9c. The 11:00 summary: per browser, only what is not done and not read (opened, removed) by its person.
  perform public._alert(ga, 'member_feedback', 't98-fb', 't98:fb', 'all', false, 'Bilal sent your gym feedback. Open Member messages to read it.', '/member-messages');
  perform public._alert(ga, 'member_joined', 't98-jx', 't98:jx', 'all', false, 'Bilal joined your gym in the MettleUp app. See them in Members using the app.', '/members/app');
  perform public._alert(ga, 'report_sent', 't98-rx', 't98:rx', 'all', false, 'Bilal sent the workout report you asked for. Open their page to read it.', '/members/t98-bilal');
  select alert_id into fb from public.gym_alerts where tag = 't98:fb';
  select alert_id into jx from public.gym_alerts where tag = 't98:jx';
  select alert_id into rx from public.gym_alerts where tag = 't98:rx';
  insert into public.gym_plan_requests(gym_id, app_member, roster_id, kind, freeze_from, freeze_to)
    values (ga, mb, 't98-bilal', 'freeze', current_date + 1, current_date + 5) returning request_id into p3;
  update public.gym_plan_requests set status = 'approved', decided_at = now(), decided_by_name = 'Om Prakash' where request_id = p3;
  update public.gym_alerts set created_at = now() - interval '2 hours' where tag in ('t98:fb', 't98:jx', 't98:rx') or ref_id = p3::text;
  perform public.owner_alerts_read(kok, array[fb, rx]);
  perform public.owner_alert_opened(kd, jx);
  r := public.hq_panel_digest_claim(ga, floor(extract(epoch from now() - interval '10 minutes') * 1000)::bigint, 40);
  checks := checks + 1; fails := fails || pg_temp.t98_is('9digest', (r->>'claimed') || ' | ' || pg_temp.t98_sends(r),
    'true | dsk002 2 new updates from your members. Open the admin app to see them. / mettleup-digest'
    || ' | own001 Bilal joined your gym in the MettleUp app. See them in Members using the app. / mettleup-alert-' || jx
    || ' | tar003 2 new updates from your members. Open the admin app to see them. / mettleup-digest');
  checks := checks + 1; fails := fails || pg_temp.t98_is('9marked',
    (select sent_how from public.gym_alerts where ref_id = p3::text) || ' ' || (select sent_how from public.gym_alerts where alert_id = fb), 'none digest');
  -- 9d. Never twice; and a summary where everyone has read everything sends nothing at all.
  r := public.hq_panel_digest_claim(ga, floor(extract(epoch from now() - interval '10 minutes') * 1000)::bigint, 40);
  checks := checks + 1; fails := fails || pg_temp.t98_is('9twice', (r->>'claimed') || ' ' || pg_temp.t98_sends(r), 'false -');
  update public.gym_alert_settings set last_digest_at = now() - interval '1 day' where gym_id = ga;
  perform public._alert(ga, 'member_joined', 't98-jz', 't98:jz', 'all', false, 'Zoya joined your gym in the MettleUp app. See them in Members using the app.', '/members/app');
  update public.gym_alerts set created_at = now() - interval '30 minutes' where tag = 't98:jz';
  select array_agg(alert_id) into ids from public.gym_alerts where tag = 't98:jz';
  perform public.owner_alerts_read(kok, ids);
  perform public.owner_alerts_read(kd, ids);
  perform public.owner_alert_remove(kt, ids[1], true);
  r := public.hq_panel_digest_claim(ga, floor(extract(epoch from now() - interval '10 minutes') * 1000)::bigint, 40);
  checks := checks + 1; fails := fails || pg_temp.t98_is('9zero', (r->>'claimed') || ' ' || pg_temp.t98_sends(r), 'true -');

  -- 10. Admin apps released before 0098: owner_alerts answers exactly as before (same keys, done ones included).
  checks := checks + 1; fails := fails || pg_temp.t98_is('10old',
    (select string_agg(distinct k, ',' order by k) from jsonb_array_elements(public.owner_alerts(kok)->'alerts') x, jsonb_object_keys(x) k)
      || ' ' || (select count(*) from jsonb_array_elements(public.owner_alerts(kok)->'alerts') x where x->>'id' = a1::text),
    'at,id,kind,line,route,urgent 1');

  -- 11. Who may call what.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.owner_alert_list(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_alerts_read(text, uuid[])', 'execute')
     or not has_function_privilege('anon', 'public.owner_alert_opened(text, uuid)', 'execute')
     or not has_function_privilege('anon', 'public.owner_alert_remove(text, uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'public._alert_handle(uuid, text[], text, timestamptz, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public._alert_pending_for(public.gym_alerts, uuid)', 'execute')
     or has_function_privilege('anon', 'public._alert_needs(text, text)', 'execute')
     or has_function_privilege('anon', 'public._alert_done_enquiry()', 'execute')
     or has_function_privilege('anon', 'public.hq_panel_digest_claim(uuid, bigint, int)', 'execute')
     or not has_function_privilege('service_role', 'public.hq_panel_push_instant(int)', 'execute')
     or has_table_privilege('anon', 'public.gym_alert_reads', 'select')
     or has_table_privilege('authenticated', 'public.gym_alert_reads', 'insert') then fails := fails || ' 11grants'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
