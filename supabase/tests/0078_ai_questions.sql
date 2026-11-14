-- F209 AI questions on the gym's credits (0078). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be
-- pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- Fake numbers only (90000 78xxx); the secret here is a test value.
-- R-531 (0082): the numbers here are the rules after 0082 (10 answers = 1 credit; the owner's and staff questions are free,
-- so sections 10 and 11 spend through a member). 0082's own test covers the switch and the monthly limit.

create or replace function pg_temp.t78_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t78_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- The Worker's signature: HMAC of the message with the test secret.
create or replace function pg_temp.t78_sig(p_msg text) returns text
  language sql as $$
  select encode(extensions.hmac(p_msg, 'test-secret-0123456789abcdef0123456789abcdef', 'sha256'), 'hex')
$$;

-- One signed take, as the Worker sends it.
create or replace function pg_temp.t78_take(p_key text, p_app text) returns jsonb
  language plpgsql as $$
declare at bigint := extract(epoch from now())::bigint;
begin
  return public.ai_question_take(p_key, p_app, at, pg_temp.t78_sig('aiq.' || p_app || '.' || at || '.' || p_key));
end $$;

create or replace function pg_temp.t78_visit(p_code text, p_visitor text) returns jsonb
  language plpgsql as $$
declare at bigint := extract(epoch from now())::bigint;
begin
  return public.ai_visitor_question_take(p_code, p_visitor, at, pg_temp.t78_sig('aiqv.' || upper(p_code) || '.' || p_visitor || '.' || at));
end $$;

do $$
declare
  ga uuid; gb uuid; gc uuid; gd uuid; gp uuid; s_owner uuid; s_desk uuid; s_oc uuid; s_od uuid;
  kop text := 't78-owner-session-0001'; kd text := 't78-desk-session-00001'; kok text := 't78-owner-key-00000001';
  koc text := 't78-owner-c-session-01'; kod text := 't78-owner-d-session-01';
  km1 text := 't78-member-key-000001'; km2 text := 't78-member-key-000002'; kleft text := 't78-member-key-left01';
  kmb text := 't78-member-key-gym-b1'; kmp text := 't78-member-key-paused';
  kmc text := 't78-member-key-gym-c1'; kmd text := 't78-member-key-gym-d1';
  at bigint := extract(epoch from now())::bigint;
  r jsonb; q uuid; fails text := ''; checks int := 0; i int; n int;
begin
  delete from public.phone_code_settings;
  insert into public.phone_code_settings(secret) values ('test-secret-0123456789abcdef0123456789abcdef');

  -- ga: in its free trial (20 starter credits). gb: no credits left. gc: 11 credits (the low alert). gd: a paid yearly
  -- Pro (100 free a month). gp: paused by MettleUp.
  insert into public.gyms(name, join_code, crm_version) values ('T78 Gym', 'T78GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T78 Empty', 'T78GYB', 1) returning gym_id into gb;
  insert into public.gyms(name, join_code, crm_version) values ('T78 Low', 'T78GYC', 1) returning gym_id into gc;
  insert into public.gyms(name, join_code, crm_version, plan, billing, paid_until)
    values ('T78 Yearly', 'T78GYD', 1, 'pro', 'yearly', now() + interval '200 days') returning gym_id into gd;
  insert into public.gyms(name, join_code, crm_version) values ('T78 Paused', 'T78GYP', 1) returning gym_id into gp;
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = gp;
  perform set_config('forgeai.hq', 'off', true);
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner Singh', '9000078101', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Ravi Desk', '9000078102', 'staff') returning staff_id into s_desk;
  insert into public.gym_staff(gym_id, name, phone, role) values (gc, 'Owner C', '9000078103', 'owner') returning staff_id into s_oc;
  insert into public.gym_staff(gym_id, name, phone, role) values (gd, 'Owner D', '9000078104', 'owner') returning staff_id into s_od;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_desk, public._hash_key(kd)),
    (s_oc, public._hash_key(koc)), (s_od, public._hash_key(kod));
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kok));
  insert into public.gym_members(gym_id, name, key_hash) values (ga, 'Asha', public._hash_key(km1)), (ga, 'Neha', public._hash_key(km2)),
    (gb, 'Ravi', public._hash_key(kmb)), (gp, 'Paused Member', public._hash_key(kmp)),
    (gc, 'Chetan', public._hash_key(kmc)), (gd, 'Divya', public._hash_key(kmd));
  insert into public.gym_members(gym_id, name, key_hash, left_at) values (ga, 'Gone', public._hash_key(kleft), now());
  -- gb: its starter credits all used (a task). gc: 11 left.
  insert into public.gym_ai_credit_ledger(gym_id, delta, reason, note, month) values
    (gb, 20, 'welcome', 'Starter credits', public._ai_month()), (gb, -20, 'grant', 'test: used up', public._ai_month()),
    (gc, 20, 'welcome', 'Starter credits', public._ai_month()), (gc, -9, 'grant', 'test: 11 left', public._ai_month());

  -- 1. Only the Worker's signature opens it.
  checks := checks + 1; fails := fails || pg_temp.t78_is('1nosig', pg_temp.t78_run(format('select public.ai_question_take(%L, %L, %s, %L)', km1, 'member', at, repeat('0', 64))), 'BAD_SIG');
  checks := checks + 1; fails := fails || pg_temp.t78_is('1old', pg_temp.t78_run(format('select public.ai_question_take(%L, %L, %s, %L)', km1, 'member', at - 600,
    pg_temp.t78_sig('aiq.member.' || (at - 600) || '.' || km1))), 'BAD_SIG');
  checks := checks + 1; fails := fails || pg_temp.t78_is('1otherkey', pg_temp.t78_run(format('select public.ai_question_take(%L, %L, %s, %L)', km2, 'member', at,
    pg_temp.t78_sig('aiq.member.' || at || '.' || km1))), 'BAD_SIG');
  checks := checks + 1; fails := fails || pg_temp.t78_is('1badkey', pg_temp.t78_run(format('select pg_temp.t78_take(%L, %L)', 't78-not-a-real-key-00', 'member')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t78_is('1left', pg_temp.t78_run(format('select pg_temp.t78_take(%L, %L)', kleft, 'member')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t78_is('1app', pg_temp.t78_run(format('select pg_temp.t78_take(%L, %L)', km1, 'phone')), 'INVALID');

  -- 2. The first question takes 1 credit for a block of 10 (the welcome credits come first, 0071).
  r := pg_temp.t78_take(km1, 'member');
  checks := checks + 1; fails := fails || pg_temp.t78_is('2first', (r->>'ok') || '/' || (r->>'who') || '/' || (r->>'balance') || '/' || (r->>'left_today'), 'true/member/19/9');
  checks := checks + 1; fails := fails || pg_temp.t78_is('2ledger', (select string_agg(reason || ':' || delta || ':' || note, ',') from public.gym_ai_credit_ledger where gym_id = ga and reason = 'questions'), 'questions:-1:10 AI answers for members');
  checks := checks + 1; fails := fails || pg_temp.t78_is('2slots', (select slots from public.gym_ai_question_slots where gym_id = ga)::text, '9');

  -- 3. A member: 10 a day, then the day's limit (nothing taken).
  for i in 1..9 loop r := pg_temp.t78_take(km1, 'member'); end loop;
  checks := checks + 1; fails := fails || pg_temp.t78_is('3tenth', (r->>'ok') || '/' || (r->>'left_today') || '/' || (r->>'balance'), 'true/0/19');
  r := pg_temp.t78_take(km1, 'member');
  checks := checks + 1; fails := fails || pg_temp.t78_is('3limit', (r->>'ok') || '/' || (r->>'reason') || '/' || (r->>'per_day'), 'false/day_limit/10');
  checks := checks + 1; fails := fails || pg_temp.t78_is('3count', (select count(*) from public.gym_ai_questions where gym_id = ga)::text, '10');

  -- 4. Twenty members' answers use two credits; the desk's question is free (0082).
  for i in 1..10 loop r := pg_temp.t78_take(km2, 'member'); end loop;
  checks := checks + 1; fails := fails || pg_temp.t78_is('4twenty', (r->>'balance') || '/' || (select slots from public.gym_ai_question_slots where gym_id = ga), '18/0');
  r := pg_temp.t78_take(kd, 'admin');
  checks := checks + 1; fails := fails || pg_temp.t78_is('4next', (r->>'ok') || '/' || (r->>'who') || '/' || (r->>'balance') || '/' || (r->>'left_today'), 'true/staff/18/59');
  checks := checks + 1; fails := fails || pg_temp.t78_is('4rows', (select count(*) from public.gym_ai_credit_ledger where gym_id = ga and reason = 'questions')::text, '2');

  -- 5. Who is who: an old owner key and an owner session = owner; the desk = staff.
  checks := checks + 1; fails := fails || pg_temp.t78_is('5ownerkey', pg_temp.t78_take(kok, 'admin')->>'who', 'owner');
  checks := checks + 1; fails := fails || pg_temp.t78_is('5ownersession', pg_temp.t78_take(kop, 'admin')->>'who', 'owner');
  checks := checks + 1; fails := fails || pg_temp.t78_is('5memberkeyAsAdmin', pg_temp.t78_run(format('select pg_temp.t78_take(%L, %L)', km1, 'admin')), 'BAD_KEY');

  -- 6. A failed AI answer gives the question back, once.
  n := (select slots from public.gym_ai_question_slots where gym_id = ga);
  q := (pg_temp.t78_take(kop, 'admin')->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t78_is('6back', public.ai_question_back(q)->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t78_is('6again', public.ai_question_back(q)->>'ok', 'false');
  checks := checks + 1; fails := fails || pg_temp.t78_is('6slots', (select slots from public.gym_ai_question_slots where gym_id = ga)::text, n::text);
  checks := checks + 1; fails := fails || pg_temp.t78_is('6unknown', public.ai_question_back(gen_random_uuid())->>'ok', 'false');
  -- Taken first: inside the WHERE the take would run once for every row the update looks at.
  q := (pg_temp.t78_take(kop, 'admin')->>'id')::uuid;
  update public.gym_ai_questions set at = now() - interval '11 minutes' where question_id = q;
  checks := checks + 1; fails := fails || pg_temp.t78_is('6late', public.ai_question_back(q)->>'ok', 'false');

  -- 7. No credits: nothing taken, no row; a paused gym: 'paused'.
  r := pg_temp.t78_take(kmb, 'member');
  checks := checks + 1; fails := fails || pg_temp.t78_is('7none', (r->>'ok') || '/' || (r->>'reason') || '/' || public._ai_balance(gb), 'false/no_credits/0');
  checks := checks + 1; fails := fails || pg_temp.t78_is('7norow', (select count(*) from public.gym_ai_questions where gym_id = gb)::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t78_is('7paused', pg_temp.t78_take(kmp, 'member')->>'reason', 'paused');

  -- 8. Where credits went (the owner only): owner 3 (a 4th was given back), staff 1, members 20, visitors 0, 2 credits.
  r := public.owner_ai_questions(kop);
  checks := checks + 1; fails := fails || pg_temp.t78_is('8counts', concat_ws('/', r->>'owner', r->>'staff', r->>'members', r->>'visitors', r->>'credits', r->>'per_credit', r->>'member_day', r->>'visitor_day', r->>'low_at'), '3/1/20/0/2/10/10/3/10');
  checks := checks + 1; fails := fails || pg_temp.t78_is('8desk', pg_temp.t78_run(format('select public.owner_ai_questions(%L)', kd)), 'OWNER_ONLY');

  -- 9. Visitors of the gym page: 3 a day each, 30 a day for the gym; a bad code or visitor is refused.
  for i in 1..3 loop r := pg_temp.t78_visit('t78gya', 'visitor-hash-0001'); end loop;
  checks := checks + 1; fails := fails || pg_temp.t78_is('9third', (r->>'ok') || '/' || (r->>'who') || '/' || (r->>'left_today'), 'true/visitor/0');
  checks := checks + 1; fails := fails || pg_temp.t78_is('9limit', pg_temp.t78_visit('T78GYA', 'visitor-hash-0001')->>'reason', 'day_limit');
  for i in 2..10 loop
    r := pg_temp.t78_visit('T78GYA', 'visitor-hash-' || lpad(i::text, 4, '0'));
    r := pg_temp.t78_visit('T78GYA', 'visitor-hash-' || lpad(i::text, 4, '0'));
    r := pg_temp.t78_visit('T78GYA', 'visitor-hash-' || lpad(i::text, 4, '0'));
  end loop;
  checks := checks + 1; fails := fails || pg_temp.t78_is('9gym', pg_temp.t78_visit('T78GYA', 'visitor-hash-0099')->>'reason', 'gym_limit');
  checks := checks + 1; fails := fails || pg_temp.t78_is('9nogym', pg_temp.t78_run('select pg_temp.t78_visit(''ZZZZZZ'', ''visitor-hash-0001'')'), 'NO_GYM');
  checks := checks + 1; fails := fails || pg_temp.t78_is('9bad', pg_temp.t78_run('select pg_temp.t78_visit(''T78GYA'', ''a b'')'), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t78_is('9visitors', public.owner_ai_questions(kop)->>'visitors', '30');

  -- 10. This month's free credits are used for members' answers first (a paid yearly Pro: 100 a month).
  r := pg_temp.t78_take(kmd, 'member');
  checks := checks + 1; fails := fails || pg_temp.t78_is('10free', (public.owner_ai_wallet(kod)->>'free_left') || '/' || (public.owner_ai_wallet(kod)->>'balance') || '/' || public._ai_month_spent(gd, public._ai_month()), '99/119/1');

  -- 11. "Credits low": ONE alert for the owner when a member's answer takes the balance from 11 to 10; none again at 9.
  r := pg_temp.t78_take(kmc, 'member');
  checks := checks + 1; fails := fails || pg_temp.t78_is('11balance', r->>'balance', '10');
  checks := checks + 1; fails := fails || pg_temp.t78_is('11alert', (select string_agg(kind || '|' || audience || '|' || urgent || '|' || route || '|' || line, ',') from public.gym_alerts where gym_id = gc),
    'ai_credits_low|owner|false|/assistant|Your gym has 10 AI credits left. To get more, open AI Assistant and tap your credits at the top, so members keep getting AI answers.');
  update public.gym_ai_question_slots set slots = 0 where gym_id = gc;
  r := pg_temp.t78_take(kmc, 'member');
  checks := checks + 1; fails := fails || pg_temp.t78_is('11once', r->>'balance' || '/' || (select count(*) from public.gym_alerts where gym_id = gc), '9/1');
  -- Credits added, then low again: one more alert.
  insert into public.gym_ai_credit_ledger(gym_id, delta, reason, note, month) values (gc, 50, 'purchase', 'test pack', public._ai_month());
  insert into public.gym_ai_credit_ledger(gym_id, delta, reason, note, month) values (gc, -59, 'grant', 'test: all used', public._ai_month());
  checks := checks + 1; fails := fails || pg_temp.t78_is('11again', (select count(*) from public.gym_alerts where gym_id = gc)::text, '2');
  checks := checks + 1; fails := fails || pg_temp.t78_is('11zero', (select count(*) from public.gym_alerts where gym_id = gc
    and line = 'Your gym has no AI credits left. Members now get help pages instead of AI answers. To get more, open AI Assistant and tap your credits at the top.')::text, '1');
  -- The owner sees it in owner_alerts; the desk does not.
  checks := checks + 1; fails := fails || pg_temp.t78_is('11owner', (select count(*) from jsonb_array_elements(public.owner_alerts(koc)->'alerts') x where x->>'kind' = 'ai_credits_low')::text, '2');

  -- 12. The ledger: 'questions' is a spend only; older reasons still work.
  checks := checks + 1; fails := fails || pg_temp.t78_is('12plus', (pg_temp.t78_run(format('insert into public.gym_ai_credit_ledger(gym_id, delta, reason, month) values (%L, 1, %L, %L)', ga, 'questions', public._ai_month())) like '%gym_ai_credit_ledger_sign%')::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t78_is('12old', pg_temp.t78_run(format('insert into public.gym_ai_credit_ledger(gym_id, delta, reason, note, month) values (%L, 5, %L, %L, %L)', ga, 'grant', 'test', public._ai_month())), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t78_is('12oldkind', pg_temp.t78_run(format('select public._alert(%L, %L, %L, %L, %L, true, %L, %L)', ga, 'shop_order', 't78-o', 'order:t78-o', 'all', 'New shop order.', '/shop')), 'ok');

  -- 13. Grants: the Worker's three calls are open by name (each checks a signature or a key), the rest are shut.
  checks := checks + 1; fails := fails || pg_temp.t78_is('13anon',
    (has_function_privilege('anon', 'public.ai_question_take(text, text, bigint, text)', 'execute')
     and has_function_privilege('anon', 'public.ai_question_back(uuid)', 'execute')
     and has_function_privilege('anon', 'public.owner_ai_questions(text)', 'execute')
     and has_function_privilege('anon', 'public.ai_visitor_question_take(text, text, bigint, text)', 'execute'))::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t78_is('13helpers',
    (has_function_privilege('anon', 'public._ai_q_take(uuid, text, text)', 'execute')
     or has_function_privilege('anon', 'public._ai_q_rules()', 'execute'))::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t78_is('13tables',
    (has_table_privilege('anon', 'public.gym_ai_questions', 'select') or has_table_privilege('anon', 'public.gym_ai_question_slots', 'select'))::text, 'false');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
