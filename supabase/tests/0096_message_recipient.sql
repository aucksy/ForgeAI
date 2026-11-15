-- R-586 "Member picks who reads the message" test (0096). Runs in CI after every migration (scripts/ci/db_checks.sh);
-- can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).
-- Who: an owner key, an owner person who is also ticked as Trainer, the front desk (no tick), two trainers (ticked).
-- Each message's first line is its label (qo = question to the owner, qt = question to trainer Tara, fo / fd = feedback
-- to the owner / "Gym admin", co / cd = complaint to the owner / "Gym admin", oq / of / oc = sent the old way, with no
-- recipient, as every member app before this change does).

create or replace function pg_temp.t96_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t96_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- The labels of the threads a key lists, sorted.
create or replace function pg_temp.t96_list(p_key text) returns text
  language sql as $$
  select coalesce(string_agg(x->'messages'->0->>'text', ',' order by x->'messages'->0->>'text'), '-')
    from jsonb_array_elements(public.owner_talk_list(p_key)->'threads') x
$$;

-- The labels of the "Message your gym" alerts a person (null: the owner key) is alerted about, sorted, once each.
create or replace function pg_temp.t96_alerted(p_gym uuid, p_staff uuid) returns text
  language sql as $$
  select coalesce(string_agg(distinct l.body, ',' order by l.body), '-')
    from public.gym_alerts a
    join public.gym_talk_threads t on t.thread_id::text = a.ref_id
    join lateral (select m.body from public.gym_talk_messages m where m.thread_id = t.thread_id
                   order by m.created_at, m.seq limit 1) l on true
   where a.gym_id = p_gym and a.kind like 'member\_%' and a.kind <> 'member_joined'
     and public._alert_visible(public._alert_viewer(p_gym, p_staff), a)
$$;

do $$
declare
  ga uuid; gb uuid; s_owner uuid; s_desk uuid; s_tara uuid; s_vik uuid; s_zed uuid; ma uuid; mb uuid; mc uuid;
  kok text := 't96-owner-key'; kop text := 't96-owner-session'; kd text := 't96-desk-session';
  kt text := 't96-tara-session'; kv text := 't96-vikram-session';
  ka text := 't96-member-asha'; kb text := 't96-member-bilal'; kc text := 't96-member-chetan';
  fails text := ''; checks int := 0; r jsonb; tqt uuid; tcd uuid; tfd uuid; a public.gym_alerts;
begin
  -- Real notes (live SQL Editor) never get in the way: closed for this test only (undone at the end).
  update public.member_push_notes set done_at = now() where done_at is null;

  insert into public.gyms(name, join_code, crm_version) values ('T96 Gym', 'T96GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T96 Other', 'T96GYB', 1) returning gym_id into gb;
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kok));
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Om Prakash', '9876509601', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Dinesh Desk', '9876509602', 'staff') returning staff_id into s_desk;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, '  Tara   Singh ', '9876509603', 'staff') returning staff_id into s_tara;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Vikram Rao', '9876509604', 'staff') returning staff_id into s_vik;
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Zed Other', '9876509605', 'staff') returning staff_id into s_zed;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_desk, public._hash_key(kd)),
    (s_tara, public._hash_key(kt)), (s_vik, public._hash_key(kv));
  -- The trainer tick (0050): Tara, Vikram, the owner too (an owner who also trains), and another gym's trainer.
  insert into public.gym_trainers(staff_id, gym_id) values (s_tara, ga), (s_vik, ga), (s_owner, ga), (s_zed, gb);
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'member', 't96-asha', '{"fullName":"Asha Verma","phone":"+919829096001"}', 1),
    (ga, 'member', 't96-bilal', '{"fullName":"Bilal Khan","phone":"+919829096002"}', 1),
    (ga, 'member', 't96-chetan', '{"fullName":"Chetan Das","phone":"+919829096003"}', 1);
  -- Asha's own trainer is Vikram (0050 assignment).
  insert into public.gym_trainer_members(gym_id, roster_id, staff_id) values (ga, 't96-asha', s_vik);
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (ga, 'Asha', '+919829096001', public._hash_key(ka)) returning member_id into ma;
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (ga, 'Bilal', '+919829096002', public._hash_key(kb)) returning member_id into mb;
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (ga, 'Chetan', '+919829096003', public._hash_key(kc)) returning member_id into mc;

  -- 1. The choices: the ticked trainers who are not the owner, the member's own trainer first, the name as typed
  -- (spaces tidied), nothing else about them.
  r := public.member_talk_choices(ka);
  checks := checks + 1; fails := fails || pg_temp.t96_is('1asha',
    (select string_agg(x->>'name', ',' order by n) from jsonb_array_elements(r->'trainers') with ordinality e(x, n)) || '/' || coalesce(r->>'mine', 'none'),
    'Vikram Rao,Tara Singh/' || s_vik::text);
  r := public.member_talk_choices(kb);
  checks := checks + 1; fails := fails || pg_temp.t96_is('1bilal',
    (select string_agg(x->>'name', ',' order by n) from jsonb_array_elements(r->'trainers') with ordinality e(x, n)) || '/' || coalesce(r->>'mine', 'none'),
    'Tara Singh,Vikram Rao/none');
  checks := checks + 1; fails := fails || pg_temp.t96_is('1onlyname',
    (select string_agg(k, ',' order by k) from jsonb_array_elements(r->'trainers') x, jsonb_object_keys(x) k) || '/' || (position('98765' in r::text))::text,
    'id,id,name,name/0');
  checks := checks + 1; fails := fails || pg_temp.t96_is('1badkey', pg_temp.t96_run(format('select public.member_talk_choices(%L)', 'nope')), 'BAD_KEY');

  -- 2. Refused, and nothing written: a question to "Gym admin", feedback or a complaint to a trainer, an unknown
  -- recipient, a trainer who is the desk, the owner, nobody or at another gym, a complaint without the name.
  checks := checks + 1; fails := fails || pg_temp.t96_is('2qdesk', pg_temp.t96_run(format('select public.member_talk_send_to(%L, %L, false, %L, %L, null)', ka, 'question', 'x', 'desk')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t96_is('2ctrainer', pg_temp.t96_run(format('select public.member_talk_send_to(%L, %L, false, %L, %L, %L::uuid)', ka, 'complaint', 'x', 'trainer', s_tara)), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t96_is('2ftrainer', pg_temp.t96_run(format('select public.member_talk_send_to(%L, %L, false, %L, %L, %L::uuid)', ka, 'feedback', 'x', 'trainer', s_tara)), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t96_is('2nobody', pg_temp.t96_run(format('select public.member_talk_send_to(%L, %L, false, %L, %L, null)', ka, 'question', 'x', 'everyone')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t96_is('2nulldest', pg_temp.t96_run(format('select public.member_talk_send_to(%L, %L, false, %L, null, null)', ka, 'question', 'x')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t96_is('2deskperson', pg_temp.t96_run(format('select public.member_talk_send_to(%L, %L, false, %L, %L, %L::uuid)', ka, 'question', 'x', 'trainer', s_desk)), 'NOT_TRAINER');
  checks := checks + 1; fails := fails || pg_temp.t96_is('2ownerperson', pg_temp.t96_run(format('select public.member_talk_send_to(%L, %L, false, %L, %L, %L::uuid)', ka, 'question', 'x', 'trainer', s_owner)), 'NOT_TRAINER');
  checks := checks + 1; fails := fails || pg_temp.t96_is('2notrainer', pg_temp.t96_run(format('select public.member_talk_send_to(%L, %L, false, %L, %L, null)', ka, 'question', 'x', 'trainer')), 'NOT_TRAINER');
  checks := checks + 1; fails := fails || pg_temp.t96_is('2othergym', pg_temp.t96_run(format('select public.member_talk_send_to(%L, %L, false, %L, %L, %L::uuid)', ka, 'question', 'x', 'trainer', s_zed)), 'NOT_TRAINER');
  checks := checks + 1; fails := fails || pg_temp.t96_is('2anoncomplaint', pg_temp.t96_run(format('select public.member_talk_send_to(%L, %L, true, %L, %L, null)', ka, 'complaint', 'x', 'owner')), 'ANON_FEEDBACK_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t96_is('2empty', pg_temp.t96_run(format('select public.member_talk_send_to(%L, %L, false, %L, %L, null)', ka, 'question', '   ', 'owner')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t96_is('2badkey', pg_temp.t96_run(format('select public.member_talk_send_to(%L, %L, false, %L, %L, null)', 'nope', 'question', 'x', 'owner')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t96_is('2nothing', (select count(*)::text from public.gym_talk_threads where gym_id = ga), '0');
  -- The table itself refuses a complaint to a trainer, or a question to "Gym admin".
  checks := checks + 1; fails := fails || pg_temp.t96_is('2table',
    pg_temp.t96_run(format('insert into public.gym_talk_threads(gym_id, member_id, kind, to_who, to_staff) values (%L, %L, %L, %L, %L)', ga, ma, 'complaint', 'trainer', s_tara)) || '/' ||
    pg_temp.t96_run(format('insert into public.gym_talk_threads(gym_id, member_id, kind, to_who) values (%L, %L, %L, %L)', ga, ma, 'question', 'desk')),
    'new row for relation "gym_talk_threads" violates check constraint "gym_talk_to_kind"/new row for relation "gym_talk_threads" violates check constraint "gym_talk_to_kind"');

  -- 3. The members write (each first line is the label).
  perform public.member_talk_send_to(ka, 'question', false, 'qo', 'owner', null);
  r := public.member_talk_send_to(ka, 'question', false, 'qt', 'trainer', s_tara);
  tqt := (r->'thread'->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t96_is('3memberrow', (r->'thread'->>'to') || '/' || (r->'thread'->>'toName'), 'trainer/Tara Singh');
  tcd := (public.member_talk_send_to(ka, 'complaint', false, 'cd', 'desk', null)->'thread'->>'id')::uuid;
  perform public.member_talk_send(ka, 'question', false, 'oq');
  perform public.member_talk_send_to(kb, 'feedback', false, 'fo', 'owner', null);
  r := public.member_talk_send_to(kb, 'feedback', true, 'fd', 'desk', null);
  tfd := (r->'thread'->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t96_is('3deskrow', (r->'thread'->>'to') || '/' || coalesce(r->'thread'->>'toName', 'none') || '/' || (r->'thread'->>'anonymous'), 'desk/none/true');
  perform public.member_talk_send_to(kb, 'complaint', false, 'co', 'owner', null);
  -- Sent the old way (no recipient): exactly as before.
  r := public.member_talk_send(kc, 'feedback', false, 'of');
  checks := checks + 1; fails := fails || pg_temp.t96_is('3oldrow', coalesce(r->'thread'->>'to', 'none'), 'none');
  perform public.member_talk_send(kc, 'complaint', false, 'oc');
  -- The anonymous "Gym admin" feedback carries no name or list id; the trainer question keeps Asha's list id.
  checks := checks + 1; fails := fails || pg_temp.t96_is('3rows',
    coalesce((select roster_id from public.gym_talk_threads where thread_id = tfd), 'none') || '/' ||
    (select roster_id || ':' || to_staff::text from public.gym_talk_threads where thread_id = tqt),
    'none/t96-asha:' || s_tara::text);

  -- 4. Who lists what.
  checks := checks + 1; fails := fails || pg_temp.t96_is('4ownerkey', pg_temp.t96_list(kok), 'cd,co,fd,fo,oc,of,oq,qo,qt');
  checks := checks + 1; fails := fails || pg_temp.t96_is('4owner', pg_temp.t96_list(kop), 'cd,co,fd,fo,oc,of,oq,qo,qt');
  checks := checks + 1; fails := fails || pg_temp.t96_is('4desk', pg_temp.t96_list(kd), 'cd,fd,of,oq');
  checks := checks + 1; fails := fails || pg_temp.t96_is('4tara', pg_temp.t96_list(kt), 'oq,qt');
  checks := checks + 1; fails := fails || pg_temp.t96_is('4vikram', pg_temp.t96_list(kv), 'oq');
  -- The gym's list says who it went to.
  r := (select x from jsonb_array_elements(public.owner_talk_list(kok)->'threads') x where x->>'id' = tqt::text);
  checks := checks + 1; fails := fails || pg_temp.t96_is('4gymrow', (r->>'to') || '/' || (r->>'toName') || '/' || (r->>'toStaff'), 'trainer/Tara Singh/' || s_tara::text);
  r := (select x from jsonb_array_elements(public.owner_talk_list(kok)->'threads') x where x->>'id' = tcd::text);
  checks := checks + 1; fails := fails || pg_temp.t96_is('4gymdesk', (r->>'to') || '/' || coalesce(r->>'toName', 'none'), 'desk/none');
  -- Nothing of the "Gym admin" complaint reaches a trainer (not its words, not its id).
  r := public.owner_talk_list(kt);
  checks := checks + 1; fails := fails || pg_temp.t96_is('4taranocomplaint', (position(tcd::text in r::text) + position(tfd::text in r::text))::text, '0');

  -- 5. The count (the menu badge).
  checks := checks + 1; fails := fails || pg_temp.t96_is('5count',
    (public.owner_talk_count(kok)->>'waiting') || '/' || (public.owner_talk_count(kop)->>'waiting') || '/' ||
    (public.owner_talk_count(kd)->>'waiting') || '/' || (public.owner_talk_count(kt)->>'waiting') || '/' ||
    (public.owner_talk_count(kv)->>'waiting'), '9/9/4/2/1');

  -- 6. Alerts (the bell, Today, and the browser pushes, which all ask _alert_visible person by person): a question to
  -- Tara alerts Tara only (not the owner, not Vikram, not the desk); "Gym admin" alerts the owner and the desk; the
  -- owner's own messages the owner only; old messages as before.
  checks := checks + 1; fails := fails || pg_temp.t96_is('6ownerkey', pg_temp.t96_alerted(ga, null), 'cd,co,fd,fo,oc,of,oq,qo');
  checks := checks + 1; fails := fails || pg_temp.t96_is('6owner', pg_temp.t96_alerted(ga, s_owner), 'cd,co,fd,fo,oc,of,oq,qo');
  checks := checks + 1; fails := fails || pg_temp.t96_is('6desk', pg_temp.t96_alerted(ga, s_desk), 'cd,fd,of,oq');
  checks := checks + 1; fails := fails || pg_temp.t96_is('6tara', pg_temp.t96_alerted(ga, s_tara), 'oq,qt');
  checks := checks + 1; fails := fails || pg_temp.t96_is('6vikram', pg_temp.t96_alerted(ga, s_vik), 'oq');
  -- The admin app's own read (owner_alerts) agrees, and Tara's line says the question is for her.
  checks := checks + 1; fails := fails || pg_temp.t96_is('6taraalerts',
    (select string_agg(x->>'line', ' | ' order by x->>'line') from jsonb_array_elements(public.owner_alerts(kt)->'alerts') x where x->>'kind' = 'member_question'),
    'Asha sent you a question. Open Member messages to reply. | Asha sent your gym a question. Open Member messages to reply.');
  checks := checks + 1; fails := fails || pg_temp.t96_is('6ownerkeyalerts',
    (select count(*)::text from jsonb_array_elements(public.owner_alerts(kok)->'alerts') x where x->>'line' like '%sent you a question%'), '0');
  -- A complaint stays instant; what each alert keeps as its audience.
  checks := checks + 1; fails := fails || pg_temp.t96_is('6audience',
    (select string_agg(a2.audience || ':' || a2.urgent::text, ',' order by a2.kind) from public.gym_alerts a2 where a2.ref_id in (tqt::text, tcd::text)),
    'all:true,owner:false');

  -- 7. Replies: only the people who see it. Tara and the owner may answer her question; Vikram and the desk may not;
  -- the desk answers the "Gym admin" complaint, Tara may not; nobody but the owner the owner's complaint.
  checks := checks + 1; fails := fails || pg_temp.t96_is('7vikram', pg_temp.t96_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kv, tqt, 'Hi')), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t96_is('7deskq', pg_temp.t96_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kd, tqt, 'Hi')), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t96_is('7taracomplaint', pg_temp.t96_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kt, tcd, 'Hi')), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t96_is('7taradone', pg_temp.t96_run(format('select public.owner_talk_done(%L, %L::uuid, true)', kt, tcd)), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t96_is('7tara', pg_temp.t96_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kt, tqt, 'Keep your back straight.')), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t96_is('7owner', pg_temp.t96_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kop, tqt, 'And go lighter.')), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t96_is('7desk', pg_temp.t96_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kd, tcd, 'Sorry. We will look into it today.')), 'ok');
  -- The member reads who replied: the trainer's first name, then the owner's.
  r := (select x from jsonb_array_elements(public.member_talk_list(ka)->'threads') x where x->>'id' = tqt::text);
  checks := checks + 1; fails := fails || pg_temp.t96_is('7memberwho',
    (select string_agg(coalesce(m->>'who', 'me'), ',' order by n) from jsonb_array_elements(r->'messages') with ordinality e(m, n)) || '/' || (r->>'toName'),
    'me,Tara,Om/Tara Singh');
  -- Asha writes back: the alert again goes to Tara only.
  perform public.member_talk_reply(ka, tqt, 'Thanks!');
  checks := checks + 1; fails := fails || pg_temp.t96_is('7writeback',
    (select count(*)::text from public.gym_alerts a2 where a2.ref_id = tqt::text and public._alert_visible(public._alert_viewer(ga, s_tara), a2)) || '/' ||
    (select count(*)::text from public.gym_alerts a2 where a2.ref_id = tqt::text and public._alert_visible(public._alert_viewer(ga, null), a2)), '2/0');

  -- 8. A thread that is gone (the member left): its old complaint alert still never reaches a trainer.
  select * into a from public.gym_alerts where ref_id = tcd::text order by created_at limit 1;
  delete from public.gym_talk_threads where thread_id = tcd;
  checks := checks + 1; fails := fails || pg_temp.t96_is('8gone',
    public._alert_visible(public._alert_viewer(ga, s_tara), a)::text || '/' || public._alert_visible(public._alert_viewer(ga, s_desk), a)::text || '/' ||
    public._alert_visible(public._alert_viewer(ga, null), a)::text, 'false/true/true');

  -- 9. Untick Tara: she is front desk now and sees "Gym admin" feedback; her own question stays hers.
  delete from public.gym_trainers where staff_id = s_tara;
  checks := checks + 1; fails := fails || pg_temp.t96_is('9untick', pg_temp.t96_list(kt), 'fd,of,oq,qt');
  checks := checks + 1; fails := fails || pg_temp.t96_is('9choices',
    (select string_agg(x->>'name', ',') from jsonb_array_elements(public.member_talk_choices(kb)->'trainers') x), 'Vikram Rao');

  -- 10. Who may call: the two new member calls check the member key themselves; the helpers stay closed.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_talk_choices(text)', 'execute')
     or not has_function_privilege('anon', 'public.member_talk_send_to(text, text, boolean, text, text, uuid)', 'execute')
     or not has_function_privilege('anon', 'public.member_talk_send(text, text, boolean, text)', 'execute')
     or has_function_privilege('anon', 'public._talk_visible(jsonb, public.gym_talk_threads)', 'execute')
     or has_function_privilege('anon', 'public._talk_gym_row(public.gym_talk_threads)', 'execute')
     or has_function_privilege('anon', 'public._talk_member_row(public.gym_talk_threads)', 'execute')
     or has_function_privilege('anon', 'public._alert_visible(jsonb, public.gym_alerts)', 'execute')
     or has_function_privilege('authenticated', 'public._alert_visible(jsonb, public.gym_alerts)', 'execute')
     or has_function_privilege('anon', 'public._alert_talk_line()', 'execute') then fails := fails || ' 10fn'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
