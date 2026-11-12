-- "Message your gym" / "Member messages" test (0069). Runs in CI after every migration (scripts/ci/db_checks.sh);
-- can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

create or replace function pg_temp.t69_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t69_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  ga uuid; gb uuid; s_owner uuid; s_desk uuid; s_other uuid; ma uuid; mb uuid;
  kop text := 't68-owner-session'; kd text := 't68-desk-session'; kok text := 't68-owner-key'; kox text := 't68-other-session';
  ka text := 't68-member-asha'; kb text := 't68-member-bilal'; kz text := 't68-member-zoya';
  ta text := 't68-token-asha-xxxxxxxxxxxx';
  fails text := ''; checks int := 0; r jsonb; tq uuid; tf uuid; tc uuid; i int;
begin
  -- Real notes (live SQL Editor) never get in the way: closed for this test only (undone at the end).
  update public.member_push_notes set done_at = now() where done_at is null;

  insert into public.gyms(name, join_code, crm_version) values ('T68 Gym', 'T68GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T68 Other', 'T68GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner Singh', '9876506801', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Ravi Desk', '9876506802', 'staff') returning staff_id into s_desk;
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Other Owner', '9876506805', 'owner') returning staff_id into s_other;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_desk, public._hash_key(kd)),
    (s_other, public._hash_key(kox));
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kok));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829068001"}', 1),
    (ga, 'member', 'm-bilal', '{"fullName":"Bilal Khan","phone":"+919829068002"}', 1);
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (ga, 'Asha', '+919829068001', public._hash_key(ka)) returning member_id into ma;
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (ga, 'Bilal', '+919829068002', public._hash_key(kb)) returning member_id into mb;
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (gb, 'Zoya', null, public._hash_key(kz));
  perform public.member_save_push_token(ka, ta);

  -- 1. Nothing yet; a bad key is refused.
  checks := checks + 1; fails := fails || pg_temp.t69_is('1unread', public.member_talk_unread(ka)->>'unread', '0');
  checks := checks + 1; fails := fails || pg_temp.t69_is('1list', (public.member_talk_list(ka)->'threads')::text, '[]');
  checks := checks + 1; fails := fails || pg_temp.t69_is('1count', public.owner_talk_count(kop)->>'waiting', '0');
  checks := checks + 1; fails := fails || pg_temp.t69_is('1badkey', pg_temp.t69_run(format('select public.member_talk_unread(%L)', 'nope')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t69_is('1badstaff', pg_temp.t69_run(format('select public.owner_talk_list(%L)', 'nope')), 'BAD_KEY');

  -- 2. Sending: kind, empty, too long, anonymous only for feedback.
  checks := checks + 1; fails := fails || pg_temp.t69_is('2kind', pg_temp.t69_run(format('select public.member_talk_send(%L, %L, false, %L)', ka, 'rant', 'Hi')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t69_is('2empty', pg_temp.t69_run(format('select public.member_talk_send(%L, %L, false, %L)', ka, 'question', E' \n ')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t69_is('2long', pg_temp.t69_run(format('select public.member_talk_send(%L, %L, false, %L)', ka, 'question', repeat('a', 1001))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t69_is('2anonq', pg_temp.t69_run(format('select public.member_talk_send(%L, %L, true, %L)', ka, 'question', 'Hi')), 'ANON_FEEDBACK_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t69_is('2anonc', pg_temp.t69_run(format('select public.member_talk_send(%L, %L, true, %L)', ka, 'complaint', 'Hi')), 'ANON_FEEDBACK_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t69_is('2nothing', (select count(*)::text from public.gym_talk_threads where gym_id = ga), '0');
  r := public.member_talk_send(ka, ' Question ', false, E'  Is the gym open\r\n\n\n\non Diwali?  ');
  tq := (r->'thread'->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t69_is('2q', (r->'thread'->>'kind') || '/' || (r->'thread'->'messages'->0->>'text') || '/' || (r->'thread'->'messages'->0->>'fromGym'),
    E'question/Is the gym open\n\non Diwali?/false');
  checks := checks + 1; fails := fails || pg_temp.t69_is('2roster', (select roster_id from public.gym_talk_threads where thread_id = tq), 'm-asha');
  r := public.member_talk_send(ka, 'feedback', true, 'Please add a second squat rack.');
  tf := (r->'thread'->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t69_is('2anon', (r->'thread'->>'anonymous') || '/' || coalesce((select roster_id from public.gym_talk_threads where thread_id = tf), 'none'), 'true/none');
  r := public.member_talk_send(kb, 'complaint', false, 'The AC in the cardio room is broken.');
  tc := (r->'thread'->>'id')::uuid;

  -- 3. Who sees what: the owner all three; the desk not the complaint; another gym nothing; anonymous has no name.
  r := public.owner_talk_list(kop);
  checks := checks + 1; fails := fails || pg_temp.t69_is('3owner', (r->>'role') || '/' || (r->>'waiting') || '/' || jsonb_array_length(r->'threads'), 'owner/3/3');
  checks := checks + 1; fails := fails || pg_temp.t69_is('3ownerkey', public.owner_talk_count(kok)->>'waiting', '3');
  r := public.owner_talk_list(kd);
  checks := checks + 1; fails := fails || pg_temp.t69_is('3desk', (r->>'role') || '/' || (r->>'waiting') || '/' ||
    (select string_agg(x->>'kind', ',' order by x->>'kind') from jsonb_array_elements(r->'threads') x), 'staff/2/feedback,question');
  checks := checks + 1; fails := fails || pg_temp.t69_is('3deskcount', public.owner_talk_count(kd)->>'waiting', '2');
  checks := checks + 1; fails := fails || pg_temp.t69_is('3other', (public.owner_talk_list(kox)->'threads')::text, '[]');
  select x into r from jsonb_array_elements(public.owner_talk_list(kop)->'threads') x where x->>'id' = tf::text;
  checks := checks + 1; fails := fails || pg_temp.t69_is('3anon', coalesce(r->>'name', '-') || '/' || coalesce(r->>'phone', '-') || '/' || coalesce(r->>'appId', '-') || '/' || coalesce(r->>'memberId', '-') || '/' || (r->>'anonymous'),
    '-/-/-/-/true');
  checks := checks + 1; fails := fails || pg_temp.t69_is('3anontext', position(ma::text in r::text)::text, '0');
  select x into r from jsonb_array_elements(public.owner_talk_list(kop)->'threads') x where x->>'id' = tq::text;
  checks := checks + 1; fails := fails || pg_temp.t69_is('3named', (r->>'name') || '/' || (r->>'memberId') || '/' || (r->>'phone') || '/' || (r->>'waiting'),
    'Asha Verma/m-asha/+919829068001/true');
  -- The member now sees "Seen by your gym".
  checks := checks + 1; fails := fails || pg_temp.t69_is('3seen', (select bool_and((x->>'seenByGym')::boolean)::text from jsonb_array_elements(public.member_talk_list(ka)->'threads') x), 'true');

  -- One transaction has one now(): the member last read a minute ago, so the replies below count as new.
  update public.gym_talk_threads set member_seen_at = now() - interval '1 minute' where gym_id = ga;

  -- 4. Replying: the desk cannot touch the complaint; another gym cannot; empty refused; a pop-up note is made.
  checks := checks + 1; fails := fails || pg_temp.t69_is('4deskcomplaint', pg_temp.t69_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kd, tc, 'Hi')), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t69_is('4deskdone', pg_temp.t69_run(format('select public.owner_talk_done(%L, %L::uuid, true)', kd, tc)), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t69_is('4othergym', pg_temp.t69_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kox, tq, 'Hi')), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t69_is('4empty', pg_temp.t69_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kd, tq, '  ')), 'INVALID');
  r := public.owner_talk_reply(kd, tq, 'Yes, 6 am to 12 noon on Diwali.');
  checks := checks + 1; fails := fails || pg_temp.t69_is('4reply', (r->'thread'->>'waiting') || '/' || (r->'thread'->'messages'->1->>'who') || '/' || (r->'thread'->>'lastFrom'), 'false/Ravi Desk/gym');
  checks := checks + 1; fails := fails || pg_temp.t69_is('4note', (select kind || '|' || route || '|' || line from public.member_push_notes where member_id = ma and done_at is null),
    'gym_reply|/shop/message|Reply to your message: Yes, 6 am to 12 noon on Diwali.');
  checks := checks + 1; fails := fails || pg_temp.t69_is('4count', public.owner_talk_count(kop)->>'waiting', '2');
  -- An owner key signs as the gym's owner; the anonymous feedback gets a reply too.
  r := public.owner_talk_reply(kok, tf, 'Thank you! A second rack comes next month.');
  checks := checks + 1; fails := fails || pg_temp.t69_is('4ownerkey', r->'thread'->'messages'->1->>'who', 'Owner Singh');

  -- 5. The member: two unread replies, first names only; reading marks them read; the gym sees "read".
  checks := checks + 1; fails := fails || pg_temp.t69_is('5unread', public.member_talk_unread(ka)->>'unread', '2');
  checks := checks + 1; fails := fails || pg_temp.t69_is('5bilal', public.member_talk_unread(kb)->>'unread', '0');
  r := public.member_talk_list(ka);
  select x into r from jsonb_array_elements(r->'threads') x where x->>'id' = tq::text;
  checks := checks + 1; fails := fails || pg_temp.t69_is('5who', (r->'messages'->1->>'who') || '/' || (r->'messages'->1->>'fromGym') || '/' || (r->>'unread'), 'Ravi/true/true');
  checks := checks + 1; fails := fails || pg_temp.t69_is('5read', public.member_talk_unread(ka)->>'unread', '0');
  select x into r from jsonb_array_elements(public.owner_talk_list(kop)->'threads') x where x->>'id' = tq::text;
  checks := checks + 1; fails := fails || pg_temp.t69_is('5readbymember', r->>'readByMember', 'true');
  checks := checks + 1; fails := fails || pg_temp.t69_is('5notyours', pg_temp.t69_run(format('select public.member_talk_reply(%L, %L::uuid, %L)', kb, tq, 'Hi')), 'NOT_FOUND');

  -- 6. Done, and the member's new line opens it again; the owner can open it again too.
  r := public.owner_talk_done(kd, tq, true);
  checks := checks + 1; fails := fails || pg_temp.t69_is('6done', (r->'thread'->>'done') || '/' || (r->'thread'->>'doneBy'), 'true/Ravi Desk');
  r := public.member_talk_reply(ka, tq, 'And on the day after?');
  checks := checks + 1; fails := fails || pg_temp.t69_is('6reopened', (r->'thread'->>'done') || '/' || jsonb_array_length(r->'thread'->'messages'), 'false/3');
  checks := checks + 1; fails := fails || pg_temp.t69_is('6waiting', public.owner_talk_count(kd)->>'waiting', '1');
  r := public.owner_talk_done(kop, tc, true);
  r := public.owner_talk_done(kop, tc, false);
  checks := checks + 1; fails := fails || pg_temp.t69_is('6undone', r->'thread'->>'done', 'false');

  -- 7. The pop-up goes to Asha's phone only, with the right words, once.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  r := public.hq_push_direct_next(40);
  checks := checks + 1; fails := fails || pg_temp.t69_is('7notes', (select string_agg((x->>'kind') || ':' || (x->'tokens')::text, ',') from jsonb_array_elements(r->'notes') x),
    'gym_reply:["' || ta || '"],gym_reply:["' || ta || '"]');
  checks := checks + 1; fails := fails || pg_temp.t69_is('7once', jsonb_array_length(public.hq_push_direct_next(40)->'notes')::text, '0');
  perform set_config('request.jwt.claims', '', true);

  -- 8. Limits: 5 new messages in 24 hours (Asha has 2), 50 lines a thread.
  for i in 1..3 loop perform public.member_talk_send(ka, 'question', false, 'Question ' || i); end loop;
  checks := checks + 1; fails := fails || pg_temp.t69_is('8toomany', pg_temp.t69_run(format('select public.member_talk_send(%L, %L, false, %L)', ka, 'question', 'Sixth')), 'TOO_MANY');
  insert into public.gym_talk_messages(thread_id, gym_id, from_gym, body, created_at)
    select tc, ga, true, 'Filler ' || g, now() - interval '2 days' from generate_series(1, 49) g;
  checks := checks + 1; fails := fails || pg_temp.t69_is('8full', pg_temp.t69_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kop, tc, 'One more')), 'THREAD_FULL');
  checks := checks + 1; fails := fails || pg_temp.t69_is('8fullmember', pg_temp.t69_run(format('select public.member_talk_reply(%L, %L::uuid, %L)', kb, tc, 'One more')), 'THREAD_FULL');
  checks := checks + 1; fails := fails || pg_temp.t69_is('8fifty', jsonb_array_length((select x from jsonb_array_elements(public.member_talk_list(kb)->'threads') x where x->>'id' = tc::text)->'messages')::text, '50');

  -- 9. A paused gym: no new lines; reading still works.
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = ga;
  perform set_config('forgeai.hq', '', true);
  checks := checks + 1; fails := fails || pg_temp.t69_is('9send', pg_temp.t69_run(format('select public.member_talk_send(%L, %L, false, %L)', kb, 'question', 'Hi')), 'SUSPENDED');
  checks := checks + 1; fails := fails || pg_temp.t69_is('9reply', pg_temp.t69_run(format('select public.owner_talk_reply(%L, %L::uuid, %L)', kop, tq, 'Hi')), 'SUSPENDED');
  checks := checks + 1; fails := fails || pg_temp.t69_is('9read', pg_temp.t69_run(format('select public.owner_talk_list(%L)', kop)), 'ok');
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'active' where gym_id = ga;
  perform set_config('forgeai.hq', '', true);

  -- 10. Old threads go after 180 days; leaving the gym deletes the member's messages at once.
  update public.gym_talk_threads set last_at = now() - interval '181 days' where thread_id = tc;
  perform public.member_talk_list(kb);
  checks := checks + 1; fails := fails || pg_temp.t69_is('10old', (select count(*)::text from public.gym_talk_threads where thread_id = tc), '0');
  perform public.member_leave(ka);
  checks := checks + 1; fails := fails || pg_temp.t69_is('10left', (select count(*)::text from public.gym_talk_threads where member_id = ma), '0');
  checks := checks + 1; fails := fails || pg_temp.t69_is('10leftkey', pg_temp.t69_run(format('select public.member_talk_list(%L)', ka)), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t69_is('10zoya', public.member_talk_unread(kz)->>'unread', '0');

  -- 11. Anyone may call the key-checked functions; nobody may call a helper or read the tables.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_talk_unread(text)', 'execute')
     or not has_function_privilege('anon', 'public.member_talk_list(text)', 'execute')
     or not has_function_privilege('anon', 'public.member_talk_send(text, text, boolean, text)', 'execute')
     or not has_function_privilege('anon', 'public.member_talk_reply(text, uuid, text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_talk_count(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_talk_list(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_talk_reply(text, uuid, text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_talk_done(text, uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'public._talk_viewer(text)', 'execute')
     or has_function_privilege('anon', 'public._talk_lines(uuid, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public._talk_member_limits(uuid, boolean)', 'execute') then fails := fails || ' 11fn'; end if;
  checks := checks + 1;
  if has_table_privilege('anon', 'public.gym_talk_threads', 'select')
     or has_table_privilege('authenticated', 'public.gym_talk_messages', 'insert') then fails := fails || ' 11table'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
