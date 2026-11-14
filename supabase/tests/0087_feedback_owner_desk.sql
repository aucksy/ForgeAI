-- R-552 "Feedback goes to the owner and front desk only" test (0087). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).
-- Who: an owner key, an owner person who is also ticked as Trainer, the front desk (no tick), a trainer (ticked).
-- A trainer may not list, read, reply to, mark done, count or be alerted about feedback; the owner and the desk may.
-- Questions: everyone, as before. Complaints: the owner only, as before.

create or replace function pg_temp.t87_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t87_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- The kinds of the threads a key lists, sorted.
create or replace function pg_temp.t87_kinds(p_key text) returns text
  language sql as $$
  select coalesce(string_agg(x->>'kind', ',' order by x->>'kind'), '-') from jsonb_array_elements(public.owner_talk_list(p_key)->'threads') x
$$;

-- The "Message your gym" alert kinds a key sees, sorted.
create or replace function pg_temp.t87_alerts(p_key text) returns text
  language sql as $$
  select coalesce(string_agg(x->>'kind', ',' order by x->>'kind'), '-') from jsonb_array_elements(public.owner_alerts(p_key)->'alerts') x
   where x->>'kind' like 'member\_%' and x->>'kind' <> 'member_joined'
$$;

do $$
declare
  ga uuid; s_owner uuid; s_desk uuid; s_train uuid; ma uuid; mb uuid;
  kok text := 't87-owner-key'; kop text := 't87-owner-session'; kd text := 't87-desk-session'; kt text := 't87-trainer-session';
  ka text := 't87-member-asha'; kb text := 't87-member-bilal';
  fails text := ''; checks int := 0; r jsonb; tq uuid; tf uuid; tfa uuid; tc uuid; a public.gym_alerts;
begin
  -- Real notes (live SQL Editor) never get in the way: closed for this test only (undone at the end).
  update public.member_push_notes set done_at = now() where done_at is null;

  insert into public.gyms(name, join_code, crm_version) values ('T87 Gym', 'T87GYA', 1) returning gym_id into ga;
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kok));
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner Om', '9876508701', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Desk Dinesh', '9876508702', 'staff') returning staff_id into s_desk;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Trainer Tara', '9876508703', 'staff') returning staff_id into s_train;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_desk, public._hash_key(kd)),
    (s_train, public._hash_key(kt));
  -- The trainer tick (0050): Tara, and the owner too (an owner who also trains still sees everything).
  insert into public.gym_trainers(staff_id, gym_id) values (s_train, ga), (s_owner, ga);
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'member', 't87-asha', '{"fullName":"Asha Verma","phone":"+919829087001"}', 1),
    (ga, 'member', 't87-bilal', '{"fullName":"Bilal Khan","phone":"+919829087002"}', 1);
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (ga, 'Asha', '+919829087001', public._hash_key(ka)) returning member_id into ma;
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (ga, 'Bilal', '+919829087002', public._hash_key(kb)) returning member_id into mb;

  -- The members write: a question, feedback without the name, feedback with the name, a complaint.
  tq := (public.member_talk_send(ka, 'question', false, 'Is the gym open on Diwali?')->'thread'->>'id')::uuid;
  tfa := (public.member_talk_send(ka, 'feedback', true, 'Please keep the changing room cleaner.')->'thread'->>'id')::uuid;
  tf := (public.member_talk_send(kb, 'feedback', false, 'Tara is a great trainer.')->'thread'->>'id')::uuid;
  tc := (public.member_talk_send(kb, 'complaint', false, 'A trainer was rude to me.')->'thread'->>'id')::uuid;

  -- 1. Who is a trainer.
  checks := checks + 1; fails := fails || pg_temp.t87_is('1viewer',
    (public._talk_viewer(kok)->>'trainer') || '/' || (public._talk_viewer(kop)->>'trainer') || '/' ||
    (public._talk_viewer(kd)->>'trainer') || '/' || (public._talk_viewer(kt)->>'trainer'), 'false/true/false/true');

  -- 2. The list: the owner (key, or the owner who is also a trainer) all four; the desk no complaint; the trainer the
  -- question only. 'feedback' says whether this person sees feedback; 'role' is unchanged.
  checks := checks + 1; fails := fails || pg_temp.t87_is('2ownerkey', pg_temp.t87_kinds(kok), 'complaint,feedback,feedback,question');
  checks := checks + 1; fails := fails || pg_temp.t87_is('2owner', pg_temp.t87_kinds(kop), 'complaint,feedback,feedback,question');
  checks := checks + 1; fails := fails || pg_temp.t87_is('2desk', pg_temp.t87_kinds(kd), 'feedback,feedback,question');
  checks := checks + 1; fails := fails || pg_temp.t87_is('2trainer', pg_temp.t87_kinds(kt), 'question');
  r := public.owner_talk_list(kt);
  checks := checks + 1; fails := fails || pg_temp.t87_is('2trainerflags', (r->>'role') || '/' || (r->>'feedback') || '/' || (r->>'waiting'), 'staff/false/1');
  r := public.owner_talk_list(kd);
  checks := checks + 1; fails := fails || pg_temp.t87_is('2deskflags', (r->>'role') || '/' || (r->>'feedback') || '/' || (r->>'waiting'), 'staff/true/3');
  r := public.owner_talk_list(kop);
  checks := checks + 1; fails := fails || pg_temp.t87_is('2ownerflags', (r->>'role') || '/' || (r->>'feedback') || '/' || (r->>'waiting'), 'owner/true/4');
  checks := checks + 1; fails := fails || pg_temp.t87_is('2ownerkeyflags', public.owner_talk_list(kok)->>'feedback', 'true');
  -- Nothing of the feedback reaches the trainer's answer at all (not its words, not its id).
  r := public.owner_talk_list(kt);
  checks := checks + 1; fails := fails || pg_temp.t87_is('2trainertext',
    (position('Tara is a great' in r::text) + position('changing room' in r::text) + position(tf::text in r::text) + position(tfa::text in r::text))::text, '0');

  -- 3. The count (the menu badge): the trainer counts only the question.
  checks := checks + 1; fails := fails || pg_temp.t87_is('3count',
    (public.owner_talk_count(kok)->>'waiting') || '/' || (public.owner_talk_count(kop)->>'waiting') || '/' ||
    (public.owner_talk_count(kd)->>'waiting') || '/' || (public.owner_talk_count(kt)->>'waiting'), '4/4/3/1');

  -- 4. Reply and done: the trainer cannot touch feedback or a complaint; the question as before.
  checks := checks + 1; fails := fails || pg_temp.t87_is('4trainerreply', pg_temp.t87_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kt, tf, 'Thanks')), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t87_is('4trainerreplyanon', pg_temp.t87_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kt, tfa, 'Thanks')), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t87_is('4trainerdone', pg_temp.t87_run(format('select public.owner_talk_done(%L, %L::uuid, true)', kt, tf)), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t87_is('4trainercomplaint', pg_temp.t87_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kt, tc, 'Hi')), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t87_is('4deskcomplaint', pg_temp.t87_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kd, tc, 'Hi')), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t87_is('4nofeedbackline', (select count(*)::text from public.gym_talk_messages where thread_id in (tf, tfa, tc) and from_gym), '0');
  checks := checks + 1; fails := fails || pg_temp.t87_is('4trainerquestion', pg_temp.t87_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kt, tq, 'Yes, 6 am to 12 noon.')), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t87_is('4deskfeedback', pg_temp.t87_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kd, tf, 'Thank you! We will tell her.')), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t87_is('4deskdone', pg_temp.t87_run(format('select public.owner_talk_done(%L, %L::uuid, true)', kd, tfa)), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t87_is('4ownercomplaint', pg_temp.t87_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kop, tc, 'Sorry. I will talk to them today.')), 'ok');
  -- The member writes back in the feedback: one more alert, still not for the trainer.
  perform public.member_talk_reply(kb, tf, 'Thanks!');

  -- 5. Alerts (owner_alerts, the admin app's bell and Today): feedback never reaches the trainer.
  checks := checks + 1; fails := fails || pg_temp.t87_is('5ownerkey', pg_temp.t87_alerts(kok), 'member_complaint,member_feedback,member_feedback,member_feedback,member_question');
  checks := checks + 1; fails := fails || pg_temp.t87_is('5owner', pg_temp.t87_alerts(kop), 'member_complaint,member_feedback,member_feedback,member_feedback,member_question');
  checks := checks + 1; fails := fails || pg_temp.t87_is('5desk', pg_temp.t87_alerts(kd), 'member_feedback,member_feedback,member_feedback,member_question');
  checks := checks + 1; fails := fails || pg_temp.t87_is('5trainer', pg_temp.t87_alerts(kt), 'member_question');
  -- The browser pushes (0076) ask the same rule, person by person.
  select * into a from public.gym_alerts where gym_id = ga and kind = 'member_feedback' order by created_at limit 1;
  checks := checks + 1; fails := fails || pg_temp.t87_is('5push',
    public._alert_visible(public._alert_viewer(ga, null), a)::text || '/' || public._alert_visible(public._alert_viewer(ga, s_owner), a)::text || '/' ||
    public._alert_visible(public._alert_viewer(ga, s_desk), a)::text || '/' || public._alert_visible(public._alert_viewer(ga, s_train), a)::text,
    'true/true/true/false');
  select * into a from public.gym_alerts where gym_id = ga and kind = 'member_question' order by created_at limit 1;
  checks := checks + 1; fails := fails || pg_temp.t87_is('5pushquestion', public._alert_visible(public._alert_viewer(ga, s_train), a)::text, 'true');
  select * into a from public.gym_alerts where gym_id = ga and kind = 'member_complaint' order by created_at limit 1;
  checks := checks + 1; fails := fails || pg_temp.t87_is('5pushcomplaint',
    public._alert_visible(public._alert_viewer(ga, s_desk), a)::text || '/' || public._alert_visible(public._alert_viewer(ga, s_train), a)::text, 'false/false');

  -- 6. Untick the trainer: they are front desk now and see feedback; the owner's own tick changes nothing.
  delete from public.gym_trainers where staff_id = s_train;
  checks := checks + 1; fails := fails || pg_temp.t87_is('6untick', pg_temp.t87_kinds(kt) || '/' || (public.owner_talk_list(kt)->>'feedback'), 'feedback,feedback,question/true');

  -- 7. Nothing members or anon can newly call: the helpers stay closed; the key-checked ones stay as they were.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.owner_talk_list(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_talk_count(text)', 'execute')
     or has_function_privilege('anon', 'public._talk_viewer(text)', 'execute')
     or has_function_privilege('authenticated', 'public._talk_viewer(text)', 'execute')
     or has_function_privilege('anon', 'public._talk_visible(jsonb, public.gym_talk_threads)', 'execute')
     or has_function_privilege('anon', 'public._alert_visible(jsonb, public.gym_alerts)', 'execute')
     or has_function_privilege('authenticated', 'public._alert_visible(jsonb, public.gym_alerts)', 'execute') then fails := fails || ' 7fn'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
