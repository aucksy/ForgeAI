-- "Ask a trainer" and the gym's live Progress test (0053, R-319 items 1 and 11). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

-- Run one statement: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t53_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t53_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  ga uuid; gb uuid; s_owner uuid; s_desk uuid; s_tr uuid; s_tr2 uuid; s_other uuid;
  kop text := 't53-owner-session'; kd text := 't53-desk-session'; kt text := 't53-trainer-session';
  kt2 text := 't53-trainer2-session'; kok text := 't53-owner-key'; kox text := 't53-other-session';
  ka text := 't53-member-asha'; kb text := 't53-member-bilal'; kz text := 't53-member-zoya';
  ta text := 't53-token-asha-xxxxxxxxxxxx'; tb text := 't53-token-bilal-xxxxxxxxxxx';
  fails text := ''; checks int := 0; r jsonb; ma uuid; qa uuid; qb uuid; i int;
  td date := (now() at time zone 'Asia/Kolkata')::date;
  mon date := td - (extract(isodow from td)::int - 1);
  good jsonb; recent jsonb;
begin
  -- Real jobs (live SQL Editor) never get in the way: finished for this test only (undone at the end).
  update public.push_jobs set done_at = now() where done_at is null;

  good := jsonb_build_object(
    'weeks', jsonb_build_array(jsonb_build_object('w', to_char(mon, 'YYYY-MM-DD'), 'n', 3, 'kg', 12480)),
    'best', jsonb_build_array(jsonb_build_object('n', 'Leg press', 'w', 120, 'r', 10, 't', 8)),
    'records', '[]'::jsonb,
    'last', to_char(td - 2, 'YYYY-MM-DD'));
  recent := jsonb_build_array(
    jsonb_build_object('d', to_char(td - 9, 'YYYY-MM-DD'), 'n', 'Pull day',
      'x', jsonb_build_array(jsonb_build_object('n', 'Lat pulldown', 'w', 50, 'r', 10, 's', 3))),
    jsonb_build_object('d', to_char(td - 2, 'YYYY-MM-DD'), 'n', '  Leg   day ', 'notes', 'felt sick',
      'x', jsonb_build_array(jsonb_build_object('n', 'Leg press', 'w', 120.04, 'r', 10, 's', 4, 'rpe', 9),
                             jsonb_build_object('n', 'Pull-up', 'w', 0, 'r', 12, 's', 3))),
    jsonb_build_object('d', to_char(td - 200, 'YYYY-MM-DD'), 'n', 'Old',
      'x', jsonb_build_array(jsonb_build_object('n', 'Squat', 'w', 80, 'r', 5, 's', 5))));

  insert into public.gyms(name, join_code, crm_version) values ('T53 Gym', 'T53GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T53 Other', 'T53GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner Singh', '9876505301', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Ravi Desk', '9876505302', 'staff') returning staff_id into s_desk;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Rohit Sharma', '9876505303', 'staff') returning staff_id into s_tr;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Meena', '9876505304', 'staff') returning staff_id into s_tr2;
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Other Owner', '9876505305', 'owner') returning staff_id into s_other;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_desk, public._hash_key(kd)),
    (s_tr, public._hash_key(kt)), (s_tr2, public._hash_key(kt2)), (s_other, public._hash_key(kox));
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kok));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829053001"}', 1),
    (ga, 'member', 'm-bilal', '{"fullName":"Bilal Khan","phone":"+919829053002"}', 1);
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (ga, 'Asha', '+919829053001', public._hash_key(ka)) returning member_id into ma;
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values
    (ga, 'Bilal', '+919829053002', public._hash_key(kb)),
    (gb, 'Zoya', null, public._hash_key(kz));

  -- 1. The choices: no trainer ticked yet (only the owner); then two, and Asha's own trainer is picked out.
  r := public.member_ask_choices(ka);
  checks := checks + 1; fails := fails || pg_temp.t53_is('1none', (r->'trainers'->0->>'name') || ':' || (r->'trainers'->0->>'owner') || '/'
    || jsonb_array_length(r->'trainers') || '/' || coalesce(r->>'mine', 'none') || '/' || (r->>'open'), 'Owner S.:true/1/none/false');
  perform public.owner_set_trainer(kop, s_tr, true);
  perform public.owner_set_trainer(kop, s_tr2, true);
  perform public.owner_assign_trainer(kop, 'm-asha', s_tr);
  r := public.member_ask_choices(ka);
  checks := checks + 1; fails := fails || pg_temp.t53_is('1names', (select string_agg(x->>'name', ',' order by x->>'name') from jsonb_array_elements(r->'trainers') x), 'Meena,Owner S.,Rohit S.');
  checks := checks + 1; fails := fails || pg_temp.t53_is('1mine', r->>'mine', s_tr::text);
  checks := checks + 1; fails := fails || pg_temp.t53_is('1badkey', pg_temp.t53_run(format('select public.member_ask_choices(%L)', 'nope')), 'BAD_KEY');

  -- 2. Asking: empty, too long, or to someone who is not a ticked trainer of this gym is refused.
  checks := checks + 1; fails := fails || pg_temp.t53_is('2empty', pg_temp.t53_run(format('select public.member_ask_trainer(%L, null, %L)', ka, E'  \n ')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t53_is('2long', pg_temp.t53_run(format('select public.member_ask_trainer(%L, null, %L)', ka, repeat('a', 501))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t53_is('2desk', pg_temp.t53_run(format('select public.member_ask_trainer(%L, %L::uuid, %L)', ka, s_desk, 'Hi')), 'NOT_TRAINER');
  checks := checks + 1; fails := fails || pg_temp.t53_is('2othergym', pg_temp.t53_run(format('select public.member_ask_trainer(%L, %L::uuid, %L)', ka, s_other, 'Hi')), 'NOT_TRAINER');
  checks := checks + 1; fails := fails || pg_temp.t53_is('2nothing', (select count(*)::text from public.trainer_questions where gym_id = ga), '0');
  r := public.member_ask_trainer(ka, s_tr, E'  How do I fix\r\n\n\n\nmy squat?  ');
  qa := (r->'question'->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t53_is('2text', r->'question'->>'question', E'How do I fix\n\nmy squat?');
  checks := checks + 1; fails := fails || pg_temp.t53_is('2trainer', r->'question'->>'trainer', 'Rohit S.');
  checks := checks + 1; fails := fails || pg_temp.t53_is('2roster', (select roster_id from public.trainer_questions where question_id = qa), 'm-asha');
  checks := checks + 1; fails := fails || pg_temp.t53_is('2open', pg_temp.t53_run(format('select public.member_ask_trainer(%L, null, %L)', ka, 'Another')), 'OPEN_QUESTION');
  checks := checks + 1; fails := fails || pg_temp.t53_is('2choicesopen', public.member_ask_choices(ka)->>'open', 'true');

  -- 3. Who sees it (owner decision, 4 Nov 2026): only Rohit, the person picked; not Meena, not the owner; the desk is refused.
  r := public.owner_questions(kop);
  checks := checks + 1; fails := fails || pg_temp.t53_is('3owner', (r->>'role') || '/' || (r->>'open') || '/' || jsonb_array_length(r->'questions'), 'owner/0/0');
  r := public.owner_questions(kt);
  checks := checks + 1; fails := fails || pg_temp.t53_is('3trainerlist', (r->>'role') || '/' || (r->>'open') || '/' || jsonb_array_length(r->'questions'), 'trainer/1/1');
  checks := checks + 1; fails := fails || pg_temp.t53_is('3name', (r->'questions'->0->>'name') || '/' || (r->'questions'->0->>'memberId') || '/' || (r->'questions'->0->>'trainerName'),
    'Asha Verma/m-asha/Rohit Sharma');
  checks := checks + 1; fails := fails || pg_temp.t53_is('3ownerkey', public.owner_question_count(kok)->>'open', '0');
  checks := checks + 1; fails := fails || pg_temp.t53_is('3rohit', public.owner_question_count(kt)->>'open', '1');
  checks := checks + 1; fails := fails || pg_temp.t53_is('3meena', public.owner_question_count(kt2)->>'open', '0');
  checks := checks + 1; fails := fails || pg_temp.t53_is('3meenalist', (public.owner_questions(kt2)->'questions')::text, '[]');
  checks := checks + 1; fails := fails || pg_temp.t53_is('3desk', pg_temp.t53_run(format('select public.owner_questions(%L)', kd)), 'TRAINER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t53_is('3deskcount', pg_temp.t53_run(format('select public.owner_question_count(%L)', kd)), 'TRAINER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t53_is('3othergym', (public.owner_questions(kox)->'questions')::text, '[]');

  -- 4. Replying: only someone who sees it; once; a pop-up job is made.
  checks := checks + 1; fails := fails || pg_temp.t53_is('4meena', pg_temp.t53_run(format('select public.owner_answer_question(%L, %L::uuid, %L)', kt2, qa, 'Hi')), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t53_is('4othergym', pg_temp.t53_run(format('select public.owner_answer_question(%L, %L::uuid, %L)', kox, qa, 'Hi')), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t53_is('4empty', pg_temp.t53_run(format('select public.owner_answer_question(%L, %L::uuid, %L)', kt, qa, ' ')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t53_is('4nojob', (select count(*)::text from public.push_jobs where kind = 'trainer_reply' and ref_id = qa), '0');
  r := public.owner_answer_question(kt, qa, 'Keep your chest up and push your knees out.');
  checks := checks + 1; fails := fails || pg_temp.t53_is('4ok', (r->'question'->>'answer') || '/' || (r->'question'->>'answeredBy'), 'Keep your chest up and push your knees out./Rohit Sharma');
  checks := checks + 1; fails := fails || pg_temp.t53_is('4job', (select count(*)::text from public.push_jobs where kind = 'trainer_reply' and ref_id = qa and gym_id = ga), '1');
  checks := checks + 1; fails := fails || pg_temp.t53_is('4twice', pg_temp.t53_run(format('select public.owner_answer_question(%L, %L::uuid, %L)', kt, qa, 'Again')), 'ALREADY_ANSWERED');
  checks := checks + 1; fails := fails || pg_temp.t53_is('4owner', pg_temp.t53_run(format('select public.owner_answer_question(%L, %L::uuid, %L)', kop, qa, 'Again')), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t53_is('4count', public.owner_question_count(kt)->>'open', '0');

  -- 5. The member sees the reply and who wrote it (first name); it is marked seen.
  r := public.member_questions(ka);
  checks := checks + 1; fails := fails || pg_temp.t53_is('5reply', (r->'questions'->0->>'answer') || '/' || (r->'questions'->0->>'answeredBy') || '/' || (r->'questions'->0->>'open'),
    'Keep your chest up and push your knees out./Rohit/false');
  checks := checks + 1; fails := fails || pg_temp.t53_is('5seen', ((select seen_at from public.trainer_questions where question_id = qa) is not null)::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t53_is('5gymseen', ((public.owner_questions(kt)->'questions'->0->>'seenAt') is not null)::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t53_is('5nowithdraw', pg_temp.t53_run(format('select public.member_withdraw_question(%L, %L::uuid)', ka, qa)), 'NOT_FOUND');

  -- 6. The pop-up goes to the asking member's phones only, once, with who replied and the reply.
  perform public.member_save_push_token(ka, ta);
  perform public.member_save_push_token(kb, tb);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  r := public.hq_push_next(40);
  checks := checks + 1; fails := fails || pg_temp.t53_is('6page', (r->>'kind') || '/' || (r->>'refId') || '/' || (r->'tokens')::text || '/' || (r->>'title') || '/' || (r->>'body'),
    'trainer_reply/' || qa::text || '/["' || ta || '"]/Rohit/Keep your chest up and push your knees out.');
  checks := checks + 1; fails := fails || pg_temp.t53_is('6once', public.hq_push_next(40)::text, null);
  perform set_config('request.jwt.claims', '', true);

  -- 7. "Any trainer": every ticked trainer sees it. Taking it back; at most 3 asked in 24 hours.
  r := public.member_ask_trainer(kb, null, 'Is the gym open on Sunday?');
  qb := (r->'question'->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t53_is('7any', (public.owner_question_count(kt)->>'open') || '/' || (public.owner_question_count(kt2)->>'open') || '/' || (public.owner_question_count(kop)->>'open'), '1/1/1');
  checks := checks + 1; fails := fails || pg_temp.t53_is('7notyours', pg_temp.t53_run(format('select public.member_withdraw_question(%L, %L::uuid)', ka, qb)), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t53_is('7withdraw', public.member_withdraw_question(kb, qb)->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t53_is('7gone', public.owner_question_count(kt2)->>'open', '0');
  checks := checks + 1; fails := fails || pg_temp.t53_is('7answerwithdrawn', pg_temp.t53_run(format('select public.owner_answer_question(%L, %L::uuid, %L)', kop, qb, 'Yes')), 'WITHDRAWN');
  for i in 1..2 loop
    r := public.member_ask_trainer(kb, null, 'Question ' || i);
    perform public.member_withdraw_question(kb, (r->'question'->>'id')::uuid);
  end loop;
  checks := checks + 1; fails := fails || pg_temp.t53_is('7toomany', pg_temp.t53_run(format('select public.member_ask_trainer(%L, null, %L)', kb, 'Fourth')), 'TOO_MANY');

  -- 8. A trainer unticked: their open question is not lost, the other trainers see it.
  r := public.member_ask_trainer(ka, s_tr, 'And my deadlift?');
  checks := checks + 1; fails := fails || pg_temp.t53_is('8before', public.owner_question_count(kt2)->>'open', '0');
  perform public.owner_set_trainer(kop, s_tr, false);
  checks := checks + 1; fails := fails || pg_temp.t53_is('8after', public.owner_question_count(kt2)->>'open', '1');
  checks := checks + 1; fails := fails || pg_temp.t53_is('8oldtrainer', pg_temp.t53_run(format('select public.owner_question_count(%L)', kt)), 'TRAINER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t53_is('8ownernow', public.owner_question_count(kop)->>'open', '1');
  -- Asking the owner: only the owner sees it, never a trainer.
  perform public.member_withdraw_question(ka, (r->'question'->>'id')::uuid);
  r := public.member_ask_trainer(ka, s_owner, 'Can I pause my plan for a week?');
  checks := checks + 1; fails := fails || pg_temp.t53_is('8toowner', (public.owner_question_count(kop)->>'open') || '/'
    || (public.owner_question_count(kok)->>'open') || '/' || (public.owner_question_count(kt2)->>'open'), '1/1/0');
  checks := checks + 1; fails := fails || pg_temp.t53_is('8ownername', public.member_questions(ka)->'questions'->0->>'trainer', 'Owner S.');

  -- 9. Progress: recent workouts checked and rebuilt; only the owner and the member's own trainer read them.
  checks := checks + 1; fails := fails || pg_temp.t53_is('9notarray', pg_temp.t53_run(format('select public.member_trainer_share2(%L, %L::jsonb, %L::jsonb)', ka, good, '{}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t53_is('9heavy', pg_temp.t53_run(format('select public.member_trainer_share2(%L, %L::jsonb, %L::jsonb)', ka, good,
    jsonb_build_array(jsonb_build_object('d', to_char(td, 'YYYY-MM-DD'), 'n', 'A', 'x', jsonb_build_array(jsonb_build_object('n', 'A', 'w', 1001, 'r', 1, 's', 1)))))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t53_is('9toomany', pg_temp.t53_run(format('select public.member_trainer_share2(%L, %L::jsonb, %L::jsonb)', ka, good,
    (select jsonb_agg(jsonb_build_object('d', to_char(td, 'YYYY-MM-DD'), 'n', 'A', 'x', '[]'::jsonb)) from generate_series(1, 31)))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t53_is('9badday', pg_temp.t53_run(format('select public.member_trainer_share2(%L, %L::jsonb, %L::jsonb)', ka, good,
    '[{"d":"2026-02-30","n":"A","x":[]}]')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t53_is('9on', public.member_trainer_share2(ka, good, recent)->>'on', 'true');
  checks := checks + 1; fails := fails || pg_temp.t53_is('9kept', (select s.recent::text from public.gym_progress_summaries s where s.member_id = ma),
    format('[{"d": "%s", "n": "Leg day", "x": [{"n": "Leg press", "r": 10, "s": 4, "w": 120.0}, {"n": "Pull-up", "r": 12, "s": 3, "w": 0.0}]}, {"d": "%s", "n": "Pull day", "x": [{"n": "Lat pulldown", "r": 10, "s": 3, "w": 50.0}]}]',
      to_char(td - 2, 'YYYY-MM-DD'), to_char(td - 9, 'YYYY-MM-DD')));
  r := public.owner_member_progress(kop, 'm-asha');
  checks := checks + 1; fails := fails || pg_temp.t53_is('9owner', (r->>'allowed') || '/' || (r->>'shared') || '/' || jsonb_array_length(r->'recent') || '/' || (r->'summary'->'best'->0->>'n'),
    'true/true/2/Leg press');
  perform public.owner_set_trainer(kop, s_tr, true);
  perform public.owner_assign_trainer(kop, 'm-asha', s_tr);
  perform public.owner_assign_trainer(kop, 'm-bilal', s_tr2);
  checks := checks + 1; fails := fails || pg_temp.t53_is('9rohit', public.owner_member_progress(kt, 'm-asha')->>'shared', 'true');
  checks := checks + 1; fails := fails || pg_temp.t53_is('9meena', public.owner_member_progress(kt2, 'm-asha')::text, '{"ok": true, "allowed": false}');
  checks := checks + 1; fails := fails || pg_temp.t53_is('9notshared', (public.owner_member_progress(kt2, 'm-bilal')->>'shared'), 'false');
  checks := checks + 1; fails := fails || pg_temp.t53_is('9desk', pg_temp.t53_run(format('select public.owner_member_progress(%L, %L)', kd, 'm-asha')), 'TRAINER_ONLY');
  -- An older phone (0050's share) still works; it carries no recent workouts.
  perform public.member_trainer_share(kb, good);
  r := public.owner_member_progress(kt2, 'm-bilal');
  checks := checks + 1; fails := fails || pg_temp.t53_is('9old', (r->>'shared') || '/' || (r->>'hasRecent') || '/' || (r->'recent')::text, 'true/false/[]');
  -- Off deletes it all at once.
  perform public.member_trainer_stop(ka);
  checks := checks + 1; fails := fails || pg_temp.t53_is('9off', public.owner_member_progress(kop, 'm-asha')->>'shared', 'false');

  -- 10. Leaving the gym deletes the member's questions at once.
  perform public.member_leave(ka);
  checks := checks + 1; fails := fails || pg_temp.t53_is('10left', (select count(*)::text from public.trainer_questions where member_id = ma), '0');
  checks := checks + 1; fails := fails || pg_temp.t53_is('10leftkey', pg_temp.t53_run(format('select public.member_questions(%L)', ka)), 'BAD_KEY');

  -- 11. Anyone may call the key-checked functions; nobody may call a helper or read the table.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_ask_choices(text)', 'execute')
     or not has_function_privilege('anon', 'public.member_ask_trainer(text, uuid, text)', 'execute')
     or not has_function_privilege('anon', 'public.member_questions(text)', 'execute')
     or not has_function_privilege('anon', 'public.member_withdraw_question(text, uuid)', 'execute')
     or not has_function_privilege('anon', 'public.owner_questions(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_question_count(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_answer_question(text, uuid, text)', 'execute')
     or not has_function_privilege('anon', 'public.member_trainer_share2(text, jsonb, jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.owner_member_progress(text, text)', 'execute')
     or has_function_privilege('anon', 'public._tq_text(text, int)', 'execute')
     or has_function_privilege('anon', 'public._trainer_recent_clean(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public._tq_live_trainer(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.hq_push_next(int)', 'execute') then fails := fails || ' 11fn'; end if;
  checks := checks + 1;
  if has_table_privilege('anon', 'public.trainer_questions', 'select')
     or has_table_privilege('authenticated', 'public.trainer_questions', 'insert') then fails := fails || ' 11table'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
