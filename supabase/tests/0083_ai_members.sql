-- R-531 decision #98 = B (0083): the owner's and staff's AI questions are free; members' and visitors' answers use the
-- gym's credits (10 = 1 credit) under the owner's switch and monthly limit. Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- Fake numbers only (90000 82xxx); the secret here is a test value.

create or replace function pg_temp.t82_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t82_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

create or replace function pg_temp.t82_sig(p_msg text) returns text
  language sql as $$
  select encode(extensions.hmac(p_msg, 'test-secret-0123456789abcdef0123456789abcdef', 'sha256'), 'hex')
$$;

-- One signed take, as the panel Worker sends it.
create or replace function pg_temp.t82_take(p_key text, p_app text) returns jsonb
  language plpgsql as $$
declare at bigint := extract(epoch from now())::bigint;
begin
  return public.ai_question_take(p_key, p_app, at, pg_temp.t82_sig('aiq.' || p_app || '.' || at || '.' || p_key));
end $$;

create or replace function pg_temp.t82_visit(p_code text, p_visitor text) returns jsonb
  language plpgsql as $$
declare at bigint := extract(epoch from now())::bigint;
begin
  return public.ai_visitor_question_take(p_code, p_visitor, at, pg_temp.t82_sig('aiqv.' || upper(p_code) || '.' || p_visitor || '.' || at));
end $$;

do $$
declare
  ga uuid; gz uuid; s_owner uuid; s_desk uuid; s_oz uuid;
  kop text := 't82-owner-session-0001'; kd text := 't82-desk-session-00001'; kok text := 't82-owner-key-00000001';
  koz text := 't82-owner-z-session-01';
  km1 text := 't82-member-key-000001'; km2 text := 't82-member-key-000002'; km3 text := 't82-member-key-000003';
  kmz text := 't82-member-key-gym-z1';
  r jsonb; q uuid; fails text := ''; checks int := 0; i int; n int; bal int;
  next_month text := to_char((to_date(public._ai_month() || '-01', 'YYYY-MM-DD') + interval '1 month')::date, 'FMDD Mon');
begin
  delete from public.phone_code_settings;
  insert into public.phone_code_settings(secret) values ('test-secret-0123456789abcdef0123456789abcdef');

  -- ga: in its free trial (20 starter credits). gz: the owner set the members' limit to 0.
  insert into public.gyms(name, join_code, crm_version) values ('T82 Gym', 'T82GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T82 Zero', 'T82GYZ', 1) returning gym_id into gz;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner Singh', '9000083101', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Ravi Desk', '9000083102', 'staff') returning staff_id into s_desk;
  insert into public.gym_staff(gym_id, name, phone, role) values (gz, 'Owner Z', '9000083103', 'owner') returning staff_id into s_oz;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_desk, public._hash_key(kd)),
    (s_oz, public._hash_key(koz));
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kok));
  insert into public.gym_members(gym_id, name, key_hash) values (ga, 'Asha', public._hash_key(km1)), (ga, 'Neha', public._hash_key(km2)),
    (ga, 'Kiran', public._hash_key(km3)), (gz, 'Zoya', public._hash_key(kmz));

  -- 1. The numbers: 10 answers for 1 credit, a limit of 20 credits a month until the owner changes it (0 to 500).
  checks := checks + 1; fails := fails || pg_temp.t82_is('1rules', concat_ws('/', public._ai_q_rules()->>'per_credit', public._ai_q_rules()->>'month_credits',
    public._ai_q_rules()->>'month_max', public._ai_q_rules()->>'staff_day'), '10/20/500/60');
  r := public.owner_ai_member_rules(kop);
  checks := checks + 1; fails := fails || pg_temp.t82_is('1defaults', concat_ws('/', r->>'ok', r->>'members_on', r->>'month_credits', r->>'month_max',
    r->>'per_credit', r->>'month_answers', r->>'month_used'), 'true/true/20/500/10/0/0');

  -- 2. The owner and staff ask free: recorded, no credit, no block; the daily limit (60) still holds.
  bal := public._ai_balance(ga);
  r := pg_temp.t82_take(kop, 'admin');
  checks := checks + 1; fails := fails || pg_temp.t82_is('2owner', concat_ws('/', r->>'ok', r->>'who', r->>'left_today'), 'true/owner/59');
  r := pg_temp.t82_take(kok, 'admin');
  checks := checks + 1; fails := fails || pg_temp.t82_is('2ownerkey', r->>'who', 'owner');
  for i in 1..60 loop r := pg_temp.t82_take(kd, 'admin'); end loop;
  checks := checks + 1; fails := fails || pg_temp.t82_is('2desk60', concat_ws('/', r->>'ok', r->>'who', r->>'left_today'), 'true/staff/0');
  r := pg_temp.t82_take(kd, 'admin');
  checks := checks + 1; fails := fails || pg_temp.t82_is('2deskLimit', concat_ws('/', r->>'ok', r->>'reason', r->>'per_day'), 'false/day_limit/60');
  checks := checks + 1; fails := fails || pg_temp.t82_is('2free', concat_ws('/', public._ai_balance(ga) - bal,
    (select count(*) from public.gym_ai_credit_ledger where gym_id = ga and reason = 'questions'),
    coalesce((select slots from public.gym_ai_question_slots where gym_id = ga), 0),
    (select count(*) from public.gym_ai_questions where gym_id = ga and who in ('owner', 'staff') and not opened_block)), '0/0/0/62');
  -- A failed AI answer for the owner: not counted, and no slot appears from nowhere.
  q := (pg_temp.t82_take(kop, 'admin')->>'id')::uuid;
  r := public.ai_question_back(q);
  checks := checks + 1; fails := fails || pg_temp.t82_is('2back', concat_ws('/', r->>'ok',
    coalesce((select slots from public.gym_ai_question_slots where gym_id = ga), 0)), 'true/0');

  -- 3. A member's first answer takes 1 credit for a block of 10 ("10 AI answers for members").
  r := pg_temp.t82_take(km1, 'member');
  checks := checks + 1; fails := fails || pg_temp.t82_is('3first', concat_ws('/', r->>'ok', r->>'who', r->>'balance', r->>'left_today'), 'true/member/19/9');
  checks := checks + 1; fails := fails || pg_temp.t82_is('3ledger', (select string_agg(reason || ':' || delta || ':' || note, ',') from public.gym_ai_credit_ledger
    where gym_id = ga and reason = 'questions'), 'questions:-1:10 AI answers for members');
  for i in 1..9 loop r := pg_temp.t82_take(km1, 'member'); end loop;
  r := pg_temp.t82_take(km2, 'member');
  checks := checks + 1; fails := fails || pg_temp.t82_is('3eleventh', concat_ws('/', r->>'balance', (select slots from public.gym_ai_question_slots where gym_id = ga)), '18/9');
  -- A member's failed answer gives its slot back.
  q := (pg_temp.t82_take(km2, 'member')->>'id')::uuid;
  -- (Given back first: inside one statement the slot count would be read before the give-back.)
  r := public.ai_question_back(q);
  checks := checks + 1; fails := fails || pg_temp.t82_is('3back', concat_ws('/', r->>'ok', (select slots from public.gym_ai_question_slots where gym_id = ga)), 'true/9');

  -- 4. The switch: only the owner saves it; off = 'off' for members (no row, no credit); the owner still asks free.
  checks := checks + 1; fails := fails || pg_temp.t82_is('4desk', pg_temp.t82_run(format('select public.owner_save_ai_member_rules(%L, false, 20)', kd)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t82_is('4deskRead', pg_temp.t82_run(format('select public.owner_ai_member_rules(%L)', kd)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t82_is('4memberKey', pg_temp.t82_run(format('select public.owner_save_ai_member_rules(%L, false, 20)', km1)), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t82_is('4tooMany', pg_temp.t82_run(format('select public.owner_save_ai_member_rules(%L, true, 501)', kop)), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t82_is('4minus', pg_temp.t82_run(format('select public.owner_save_ai_member_rules(%L, true, -1)', kop)), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t82_is('4null', pg_temp.t82_run(format('select public.owner_save_ai_member_rules(%L, null, 20)', kop)), 'INVALID');
  r := public.owner_save_ai_member_rules(kop, false, 20);
  checks := checks + 1; fails := fails || pg_temp.t82_is('4saved', concat_ws('/', r->>'ok', r->>'members_on', r->>'month_credits', r->>'month_answers', r->>'month_used'), 'true/false/20/11/2');
  n := (select count(*) from public.gym_ai_questions where gym_id = ga);
  r := pg_temp.t82_take(km3, 'member');
  checks := checks + 1; fails := fails || pg_temp.t82_is('4off', concat_ws('/', r->>'ok', r->>'reason', r->>'who', (select count(*) from public.gym_ai_questions where gym_id = ga) - n), 'false/off/member/0');
  checks := checks + 1; fails := fails || pg_temp.t82_is('4ownerStill', pg_temp.t82_take(kop, 'admin')->>'ok', 'true');
  -- Visitors of the gym page are not under the members' switch (only the monthly limit).
  checks := checks + 1; fails := fails || pg_temp.t82_is('4visitor', pg_temp.t82_visit('T82GYA', 'visitor-hash-0001')->>'ok', 'true');

  -- 5. The monthly limit: 2 credits = 20 answers for members and visitors together (12 used so far).
  r := public.owner_save_ai_member_rules(kop, true, 2);
  checks := checks + 1; fails := fails || pg_temp.t82_is('5saved', concat_ws('/', r->>'members_on', r->>'month_credits', r->>'month_answers'), 'true/2/12');
  for i in 1..7 loop r := pg_temp.t82_take(km3, 'member'); end loop;
  checks := checks + 1; fails := fails || pg_temp.t82_is('5before', concat_ws('/', r->>'ok', (select count(*) from public.gym_alerts where gym_id = ga and kind = 'ai_members_limit')), 'true/0');
  -- The 20th answer reaches the limit: the owner hears it at once (one alert).
  r := pg_temp.t82_take(km3, 'member');
  checks := checks + 1; fails := fails || pg_temp.t82_is('5twentieth', concat_ws('/', r->>'ok', (select count(*) from public.gym_alerts where gym_id = ga and kind = 'ai_members_limit')), 'true/1');
  checks := checks + 1; fails := fails || pg_temp.t82_is('5alert', (select string_agg(kind || '|' || audience || '|' || urgent || '|' || route || '|' || line, ',')
    from public.gym_alerts where gym_id = ga and kind = 'ai_members_limit'),
    'ai_members_limit|owner|false|/assistant|Members have used this month''s AI answers. Until ' || next_month
      || ', they get help pages instead. To give them more, open AI Assistant and tap your credits at the top.');
  -- Past it: 'month_limit' for members and visitors, nothing taken, no second alert; the owner still asks free.
  bal := public._ai_balance(ga);
  r := pg_temp.t82_take(km3, 'member');
  checks := checks + 1; fails := fails || pg_temp.t82_is('5member', concat_ws('/', r->>'ok', r->>'reason', r->>'per_day'), 'false/month_limit/10');
  checks := checks + 1; fails := fails || pg_temp.t82_is('5visitor', pg_temp.t82_visit('T82GYA', 'visitor-hash-0002')->>'reason', 'month_limit');
  checks := checks + 1; fails := fails || pg_temp.t82_is('5nothing', concat_ws('/', public._ai_balance(ga) - bal, (select count(*) from public.gym_alerts where gym_id = ga and kind = 'ai_members_limit')), '0/1');
  checks := checks + 1; fails := fails || pg_temp.t82_is('5owner', pg_temp.t82_take(kop, 'admin')->>'ok', 'true');
  -- The owner raises it: members get answers again; reaching the new limit this month makes no second alert.
  r := public.owner_save_ai_member_rules(kop, true, 3);
  r := pg_temp.t82_take(km3, 'member');
  checks := checks + 1; fails := fails || pg_temp.t82_is('5raised', r->>'ok', 'true');
  for i in 1..20 loop r := pg_temp.t82_visit('T82GYA', 'visitor-hash-1' || lpad(i::text, 3, '0')); end loop;
  checks := checks + 1; fails := fails || pg_temp.t82_is('5once', concat_ws('/', r->>'reason', (select count(*) from public.gym_alerts where gym_id = ga and kind = 'ai_members_limit')), 'month_limit/1');
  -- The owner sees the alert; the desk does not.
  checks := checks + 1; fails := fails || pg_temp.t82_is('5ownerList', (select count(*) from jsonb_array_elements(public.owner_alerts(kop)->'alerts') x where x->>'kind' = 'ai_members_limit')::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t82_is('5deskList', (select count(*) from jsonb_array_elements(public.owner_alerts(kd)->'alerts') x where x->>'kind' = 'ai_members_limit')::text, '0');

  -- 6. A limit of 0 (the owner's own choice): 'month_limit' at once, and no alert.
  r := public.owner_save_ai_member_rules(koz, true, 0);
  r := pg_temp.t82_take(kmz, 'member');
  checks := checks + 1; fails := fails || pg_temp.t82_is('6zero', concat_ws('/', r->>'ok', r->>'reason', (select count(*) from public.gym_alerts where gym_id = gz and kind = 'ai_members_limit'),
    (select count(*) from public.gym_ai_questions where gym_id = gz)), 'false/month_limit/0/0');

  -- 7. The Credits sheet's numbers: who asked, and the members' switch, limit and use.
  r := public.owner_ai_questions(kop);
  checks := checks + 1; fails := fails || pg_temp.t82_is('7counts', concat_ws('/', r->>'owner', r->>'staff', r->>'members', r->>'visitors', r->>'credits', r->>'per_credit'),
    '4/60/20/10/3/10');
  checks := checks + 1; fails := fails || pg_temp.t82_is('7members', concat_ws('/', r->>'members_on', r->>'month_credits', r->>'month_max', r->>'month_answers', r->>'month_used'),
    'true/3/500/30/3');
  checks := checks + 1; fails := fails || pg_temp.t82_is('7desk', pg_temp.t82_run(format('select public.owner_ai_questions(%L)', kd)), 'OWNER_ONLY');

  -- 8. Grants: the two new owner calls are open by name (each checks the OWNER key); the rest are shut.
  checks := checks + 1; fails := fails || pg_temp.t82_is('8anon',
    (has_function_privilege('anon', 'public.owner_ai_member_rules(text)', 'execute')
     and has_function_privilege('anon', 'public.owner_save_ai_member_rules(text, boolean, int)', 'execute'))::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t82_is('8helpers',
    (has_function_privilege('anon', 'public._ai_member_rules(uuid)', 'execute')
     or has_function_privilege('anon', 'public._ai_member_json(uuid)', 'execute')
     or has_function_privilege('anon', 'public._ai_members_limit_alert(uuid, text)', 'execute')
     or has_table_privilege('anon', 'public.gym_ai_member_rules', 'select'))::text, 'false');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
