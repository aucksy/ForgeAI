-- Trainer view of member progress test (0050, F109). Runs in CI after every migration (scripts/ci/db_checks.sh);
-- can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

-- Run one statement: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t50_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t50_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  ga uuid; gb uuid; s_owner uuid; s_desk uuid; s_tr uuid; s_tr2 uuid; s_other uuid;
  kop text := 't50-owner-session'; kd text := 't50-desk-session'; kt text := 't50-trainer-session';
  kt2 text := 't50-trainer2-session'; kok text := 't50-owner-key'; kob text := 't50-owner-b'; kox text := 't50-other-session';
  ka text := 't50-member-asha'; kb text := 't50-member-bilal'; kn text := 't50-member-nolist'; kz text := 't50-member-zoya';
  fails text := ''; checks int := 0; r jsonb; ma uuid;
  td date := (now() at time zone 'Asia/Kolkata')::date;
  mon date := td - (extract(isodow from td)::int - 1);
  good jsonb;
begin
  good := jsonb_build_object(
    'weeks', jsonb_build_array(jsonb_build_object('w', to_char(mon, 'YYYY-MM-DD'), 'n', 3, 'kg', 12480),
                               jsonb_build_object('w', to_char(mon - 7, 'YYYY-MM-DD'), 'n', 2, 'kg', 9000)),
    'best', jsonb_build_array(jsonb_build_object('n', '  Leg   press ', 'w', 120.04, 'r', 10, 't', 8)),
    'records', jsonb_build_array(jsonb_build_object('n', 'Leg press', 'w', 120, 'r', 10, 'd', to_char(td - 2, 'YYYY-MM-DD'))),
    'last', to_char(td - 2, 'YYYY-MM-DD'),
    'bodyWeight', 80);

  insert into public.gyms(name, join_code, crm_version) values ('T50 Gym', 'T50GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T50 Other', 'T50GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner', '9876505001', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Ravi Desk', '9876505002', 'staff') returning staff_id into s_desk;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Rohit Sharma', '9876505003', 'staff') returning staff_id into s_tr;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Meena', '9876505004', 'staff') returning staff_id into s_tr2;
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Other Owner', '9876505005', 'owner') returning staff_id into s_other;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_desk, public._hash_key(kd)),
    (s_tr, public._hash_key(kt)), (s_tr2, public._hash_key(kt2)), (s_other, public._hash_key(kox));
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kok)), (gb, public._hash_key(kob));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829050001"}', 1),
    (ga, 'member', 'm-bilal', '{"fullName":"Bilal Khan","phone":"+919829050002"}', 1),
    (gb, 'member', 'm-zoya', '{"fullName":"Zoya Ali","phone":"+919829050009"}', 1);
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (ga, 'Asha', '+919829050001', public._hash_key(ka)) returning member_id into ma;
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values
    (ga, 'Bilal', '+919829050002', public._hash_key(kb)),
    (ga, 'Nobody', null, public._hash_key(kn)),
    (gb, 'Zoya', '+919829050009', public._hash_key(kz));

  -- 1. Nothing shared: the member's status; the owner sees an empty list; the desk is refused.
  r := public.member_trainer_status(ka);
  checks := checks + 1; fails := fails || pg_temp.t50_is('1status', (r->>'shared') || '/' || coalesce(r->>'trainer', 'none'), 'false/none');
  r := public.owner_trainer_members(kop);
  checks := checks + 1; fails := fails || pg_temp.t50_is('1owner', (r->>'role') || '/' || (r->'members')::text, 'owner/[]');
  checks := checks + 1; fails := fails || pg_temp.t50_is('1desk', pg_temp.t50_run(format('select public.owner_trainer_members(%L)', kd)), 'TRAINER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t50_is('1badkey', pg_temp.t50_run(format('select public.owner_trainer_members(%L)', 'nope')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t50_is('1ownerkey', public.owner_trainer_members(kok)->>'role', 'owner');

  -- 2. A bad summary is refused and keeps nothing; a good one is tidied and extra fields dropped.
  checks := checks + 1; fails := fails || pg_temp.t50_is('2notobj', pg_temp.t50_run(format('select public.member_trainer_share(%L, %L::jsonb)', ka, '[]')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t50_is('2notmonday', pg_temp.t50_run(format('select public.member_trainer_share(%L, %L::jsonb)', ka,
    jsonb_build_object('weeks', jsonb_build_array(jsonb_build_object('w', to_char(mon + 1, 'YYYY-MM-DD'), 'n', 1, 'kg', 1)), 'best', '[]'::jsonb, 'records', '[]'::jsonb))), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t50_is('2badday', pg_temp.t50_run(format('select public.member_trainer_share(%L, %L::jsonb)', ka,
    '{"weeks":[],"best":[],"records":[{"n":"A","w":1,"r":1,"d":"2026-02-30"}]}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t50_is('2heavy', pg_temp.t50_run(format('select public.member_trainer_share(%L, %L::jsonb)', ka,
    '{"weeks":[],"best":[{"n":"A","w":1001,"r":1,"t":1}],"records":[]}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t50_is('2halfrep', pg_temp.t50_run(format('select public.member_trainer_share(%L, %L::jsonb)', ka,
    '{"weeks":[],"best":[{"n":"A","w":10,"r":1.5,"t":1}],"records":[]}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t50_is('2toomany', pg_temp.t50_run(format('select public.member_trainer_share(%L, %L::jsonb)', ka,
    '{"weeks":[],"best":[{"n":"A","w":1,"r":1,"t":1},{"n":"A","w":1,"r":1,"t":1},{"n":"A","w":1,"r":1,"t":1},{"n":"A","w":1,"r":1,"t":1},{"n":"A","w":1,"r":1,"t":1},{"n":"A","w":1,"r":1,"t":1}],"records":[]}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t50_is('2noname', pg_temp.t50_run(format('select public.member_trainer_share(%L, %L::jsonb)', ka,
    '{"weeks":[],"best":[{"n":"   ","w":1,"r":1,"t":1}],"records":[]}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t50_is('2nothing', (select count(*)::text from public.gym_progress_summaries), '0');
  r := public.member_trainer_share(ka, good);
  checks := checks + 1; fails := fails || pg_temp.t50_is('2on', r->>'on', 'true');
  checks := checks + 1; fails := fails || pg_temp.t50_is('2tidy', (select (summary->'best'->0)::text from public.gym_progress_summaries where member_id = ma),
    '{"n": "Leg press", "r": 10, "t": 8, "w": 120.0}');
  checks := checks + 1; fails := fails || pg_temp.t50_is('2nobody', (select (summary ? 'bodyWeight')::text from public.gym_progress_summaries where member_id = ma), 'false');
  checks := checks + 1; fails := fails || pg_temp.t50_is('2roster', (select roster_id from public.gym_progress_summaries where member_id = ma), 'm-asha');
  perform public.member_trainer_share(kb, good);
  perform public.member_trainer_share(kn, good);
  perform public.member_trainer_share(kz, good);

  -- 3. The owner sees every sharing member of the gym, list names and numbers; never another gym's.
  r := public.owner_trainer_members(kop);
  checks := checks + 1; fails := fails || pg_temp.t50_is('3count', jsonb_array_length(r->'members')::text, '3');
  checks := checks + 1; fails := fails || pg_temp.t50_is('3names', (select string_agg(x->>'name' || ':' || coalesce(x->>'memberId', '-') || ':' || coalesce(x->>'phone', '-'), ',' order by x->>'name')
    from jsonb_array_elements(r->'members') x), 'Asha Verma:m-asha:+919829050001,Bilal Khan:m-bilal:+919829050002,Nobody:-:-');
  r := public.owner_trainer_members(kob);
  checks := checks + 1; fails := fails || pg_temp.t50_is('3othergym', (select string_agg(x->>'name', ',') from jsonb_array_elements(r->'members') x), 'Zoya Ali');

  -- 4. The trainer tick: owner only; never a person of another gym.
  checks := checks + 1; fails := fails || pg_temp.t50_is('4desksetup', pg_temp.t50_run(format('select public.owner_trainer_setup(%L)', kd)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t50_is('4deskset', pg_temp.t50_run(format('select public.owner_set_trainer(%L, %L::uuid, true)', kd, s_desk)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t50_is('4crossgym', pg_temp.t50_run(format('select public.owner_set_trainer(%L, %L::uuid, true)', kop, s_other)), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t50_is('4null', pg_temp.t50_run(format('select public.owner_set_trainer(%L, %L::uuid, null)', kop, s_tr)), 'INVALID');
  r := public.owner_set_trainer(kop, s_tr, true);
  perform public.owner_set_trainer(kop, s_tr, true);
  perform public.owner_set_trainer(kop, s_tr2, true);
  checks := checks + 1; fails := fails || pg_temp.t50_is('4ticked', (select string_agg(x->>'name' || ':' || (x->>'trainer'), ',' order by x->>'name') from jsonb_array_elements(r->'people') x),
    'Meena:false,Owner:false,Ravi Desk:false,Rohit Sharma:true');
  checks := checks + 1; fails := fails || pg_temp.t50_is('4role', (select role from public.gym_staff where staff_id = s_tr), 'staff');

  -- 5. A ticked trainer with no members sees an empty list; the desk is still refused.
  r := public.owner_trainer_members(kt);
  checks := checks + 1; fails := fails || pg_temp.t50_is('5empty', (r->>'role') || '/' || (r->'members')::text, 'trainer/[]');
  checks := checks + 1; fails := fails || pg_temp.t50_is('5desk', pg_temp.t50_run(format('select public.owner_trainer_members(%L)', kd)), 'TRAINER_ONLY');

  -- 6. Assigning: owner only; a member of the list; a ticked trainer of this gym.
  checks := checks + 1; fails := fails || pg_temp.t50_is('6desk', pg_temp.t50_run(format('select public.owner_assign_trainer(%L, %L, %L::uuid)', kd, 'm-asha', s_tr)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t50_is('6trainer', pg_temp.t50_run(format('select public.owner_assign_trainer(%L, %L, %L::uuid)', kt, 'm-asha', s_tr)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t50_is('6notrainer', pg_temp.t50_run(format('select public.owner_assign_trainer(%L, %L, %L::uuid)', kop, 'm-asha', s_desk)), 'NOT_TRAINER');
  checks := checks + 1; fails := fails || pg_temp.t50_is('6crossstaff', pg_temp.t50_run(format('select public.owner_assign_trainer(%L, %L, %L::uuid)', kop, 'm-asha', s_other)), 'NOT_TRAINER');
  checks := checks + 1; fails := fails || pg_temp.t50_is('6crossmember', pg_temp.t50_run(format('select public.owner_assign_trainer(%L, %L, %L::uuid)', kop, 'm-zoya', s_tr)), 'NO_MEMBER');
  r := public.owner_assign_trainer(kop, 'm-asha', s_tr);
  perform public.owner_assign_trainer(kop, 'm-bilal', s_tr2);
  checks := checks + 1; fails := fails || pg_temp.t50_is('6assigned', (r->'assigned')::text, format('[{"memberId": "m-asha", "trainerId": "%s"}]', s_tr));
  -- Another gym's owner cannot assign this gym's member to anyone.
  checks := checks + 1; fails := fails || pg_temp.t50_is('6othergym', pg_temp.t50_run(format('select public.owner_assign_trainer(%L, %L, %L::uuid)', kob, 'm-asha', s_tr)), 'NO_MEMBER');

  -- 7. Each trainer sees only their own members; the owner sees who trains whom; the member sees the first name.
  r := public.owner_trainer_members(kt);
  checks := checks + 1; fails := fails || pg_temp.t50_is('7rohit', (select string_agg(x->>'name', ',') from jsonb_array_elements(r->'members') x), 'Asha Verma');
  checks := checks + 1; fails := fails || pg_temp.t50_is('7summary', r->'members'->0->'summary'->'records'->0->>'n', 'Leg press');
  r := public.owner_trainer_members(kt2);
  checks := checks + 1; fails := fails || pg_temp.t50_is('7meena', (select string_agg(x->>'name', ',') from jsonb_array_elements(r->'members') x), 'Bilal Khan');
  r := public.owner_trainer_members(kop);
  checks := checks + 1; fails := fails || pg_temp.t50_is('7owner', (select string_agg(x->>'name' || ':' || coalesce(x->>'trainerName', '-'), ',' order by x->>'name')
    from jsonb_array_elements(r->'members') x), 'Asha Verma:Rohit Sharma,Bilal Khan:Meena,Nobody:-');
  r := public.member_trainer_status(ka);
  checks := checks + 1; fails := fails || pg_temp.t50_is('7status', (r->>'shared') || '/' || (r->>'trainer'), 'true/Rohit');
  -- Another gym's trainer key sees none of these.
  checks := checks + 1; fails := fails || pg_temp.t50_is('7otherkey', (select string_agg(x->>'name', ',') from jsonb_array_elements(public.owner_trainer_members(kox)->'members') x), 'Zoya Ali');

  -- 8. Ask for help: once a day; refused while not shared.
  r := public.member_trainer_help(ka);
  checks := checks + 1; fails := fails || pg_temp.t50_is('8help', r->>'already', 'false');
  checks := checks + 1; fails := fails || pg_temp.t50_is('8again', public.member_trainer_help(ka)->>'already', 'true');
  checks := checks + 1; fails := fails || pg_temp.t50_is('8seen', ((public.owner_trainer_members(kt)->'members'->0->>'helpAt') is not null)::text, 'true');
  -- A new summary keeps the help request.
  perform public.member_trainer_share(ka, good);
  checks := checks + 1; fails := fails || pg_temp.t50_is('8kept', ((select help_at from public.gym_progress_summaries where member_id = ma) is not null)::text, 'true');

  -- 9. Off deletes the copy at once; help is then refused.
  perform public.member_trainer_stop(ka);
  checks := checks + 1; fails := fails || pg_temp.t50_is('9gone', (select count(*)::text from public.gym_progress_summaries where member_id = ma), '0');
  checks := checks + 1; fails := fails || pg_temp.t50_is('9trainer', (public.owner_trainer_members(kt)->'members')::text, '[]');
  checks := checks + 1; fails := fails || pg_temp.t50_is('9help', pg_temp.t50_run(format('select public.member_trainer_help(%L)', ka)), 'NOT_SHARED');
  checks := checks + 1; fails := fails || pg_temp.t50_is('9status', public.member_trainer_status(ka)->>'shared', 'false');

  -- 10. Unticking a trainer ends their assignments and their access.
  perform public.owner_set_trainer(kop, s_tr2, false);
  checks := checks + 1; fails := fails || pg_temp.t50_is('10access', pg_temp.t50_run(format('select public.owner_trainer_members(%L)', kt2)), 'TRAINER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t50_is('10unassigned', (select count(*)::text from public.gym_trainer_members where staff_id = s_tr2), '0');

  -- 11. Removing a person from the gym unticks them; leaving the gym deletes the summary.
  perform public.member_trainer_share(ka, good);
  update public.gym_staff set removed_at = now() where staff_id = s_tr;
  checks := checks + 1; fails := fails || pg_temp.t50_is('11removed', (select count(*)::text from public.gym_trainers where staff_id = s_tr), '0');
  checks := checks + 1; fails := fails || pg_temp.t50_is('11status', coalesce(public.member_trainer_status(ka)->>'trainer', 'none'), 'none');
  perform public.member_leave(kb);
  checks := checks + 1; fails := fails || pg_temp.t50_is('11left', (select count(*)::text from public.gym_progress_summaries p join public.gym_members m using (member_id) where m.name = 'Bilal'), '0');

  -- 12. Nothing new for 90 days: gone on the next read.
  update public.gym_progress_summaries set updated_at = now() - interval '91 days' where member_id = ma;
  perform public.owner_trainer_members(kop);
  checks := checks + 1; fails := fails || pg_temp.t50_is('12old', (select count(*)::text from public.gym_progress_summaries where member_id = ma), '0');

  -- 13. A suspended gym: no shares, no ticks; off still works.
  perform public.member_trainer_share(ka, good);
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = ga;
  perform set_config('forgeai.hq', 'off', true);
  checks := checks + 1; fails := fails || pg_temp.t50_is('13share', pg_temp.t50_run(format('select public.member_trainer_share(%L, %L::jsonb)', ka, good)), 'SUSPENDED');
  checks := checks + 1; fails := fails || pg_temp.t50_is('13tick', pg_temp.t50_run(format('select public.owner_set_trainer(%L, %L::uuid, true)', kop, s_desk)), 'SUSPENDED');
  checks := checks + 1; fails := fails || pg_temp.t50_is('13stop', pg_temp.t50_run(format('select public.member_trainer_stop(%L)', ka)), 'ok');
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'active' where gym_id = ga;
  perform set_config('forgeai.hq', 'off', true);

  -- 14. Anyone may call the key-checked functions; nobody may call a helper or read a table.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.owner_trainer_members(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_trainer_setup(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_set_trainer(text, uuid, boolean)', 'execute')
     or not has_function_privilege('anon', 'public.owner_assign_trainer(text, text, uuid)', 'execute')
     or not has_function_privilege('anon', 'public.member_trainer_status(text)', 'execute')
     or not has_function_privilege('anon', 'public.member_trainer_share(text, jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.member_trainer_stop(text)', 'execute')
     or not has_function_privilege('anon', 'public.member_trainer_help(text)', 'execute')
     or has_function_privilege('anon', 'public._trainer_viewer(text)', 'execute')
     or has_function_privilege('authenticated', 'public._trainer_clean(jsonb)', 'execute')
     or has_function_privilege('anon', 'public._trainer_of(uuid, text)', 'execute') then fails := fails || ' 14fn'; end if;
  checks := checks + 1;
  if has_table_privilege('anon', 'public.gym_progress_summaries', 'select')
     or has_table_privilege('authenticated', 'public.gym_trainer_members', 'select')
     or has_table_privilege('anon', 'public.gym_trainers', 'insert') then fails := fails || ' 14table'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
