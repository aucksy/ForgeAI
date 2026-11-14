-- Join online test (0077, R-513). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be pasted into
-- the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- Fake numbers only (90000 77xxx); the secret here is a test value.

create or replace function pg_temp.t77_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- A signed proof for the test secret: v1.<purpose>.<phone>.<expires>.<nonce>.<hmac> (the Worker's makeProof shape).
create or replace function pg_temp.t77_proof(p_purpose text, p_phone text, p_nonce text) returns text
  language sql as $$
  select b || '.' || encode(extensions.hmac(b, 'test-secret-0123456789abcdef0123456789abcdef', 'sha256'), 'hex')
    from (select 'v1.' || p_purpose || '.' || p_phone || '.' || (extract(epoch from now())::bigint + 900)
                 || '.' || p_nonce as b) x
$$;

do $$
declare
  ga uuid; gp uuid; gq uuid; v0 bigint; v1 bigint;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  d_today text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  d_soon text := to_char((now() at time zone 'Asia/Kolkata')::date + 5, 'YYYY-MM-DD');
  d_last text := to_char((now() at time zone 'Asia/Kolkata')::date + 30, 'YYYY-MM-DD');
  d_late text := to_char((now() at time zone 'Asia/Kolkata')::date + 31, 'YYYY-MM-DD');
  d_past text := to_char((now() at time zone 'Asia/Kolkata')::date - 1, 'YYYY-MM-DD');
  ravi text := '9000077001'; asha text := '9000077002'; old_m text := '9000077003'; neha text := '9000077004';
  many text := '9000077005';
  p text; r jsonb; e jsonb; fails text := ''; checks int := 0; n int; i int;
begin
  delete from public.phone_code_settings;
  insert into public.phone_code_settings(secret) values ('test-secret-0123456789abcdef0123456789abcdef');

  insert into public.gyms(name, join_code, crm_version) values ('T77 Gym', 'T77AAA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T77 Paused', 'T77PPP', 1) returning gym_id into gp;
  insert into public.gyms(name, join_code, crm_version) values ('T77 Other', 'T77QQQ', 1) returning gym_id into gq;
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'plan', 't77-month', '{"name":"Monthly","durationUnit":"month","durationCount":1,"priceP":150000,"joiningFeeP":50000,"active":true,"sortOrder":2}', 1),
    (ga, 'plan', 't77-quarter', '{"name":"3 months","durationUnit":"month","durationCount":3,"priceP":400000,"joiningFeeP":0,"active":true,"sortOrder":1}', 1),
    (ga, 'plan', 't77-pt', '{"name":"PT 12","durationUnit":"month","durationCount":1,"priceP":600000,"joiningFeeP":0,"active":true,"ptSessions":12}', 1),
    (ga, 'plan', 't77-old', '{"name":"Old plan","durationUnit":"month","durationCount":1,"priceP":100000,"joiningFeeP":0,"active":false}', 1),
    (ga, 'member', 't77-asha', jsonb_build_object('fullName', 'Asha Rao', 'phone', '+91' || asha, 'archived', false), 1),
    (ga, 'member', 't77-oldm', jsonb_build_object('fullName', 'Old Member', 'phone', '+91' || old_m, 'archived', true), 1),
    (ga, 'enquiry', 't77-enq', jsonb_build_object('id', 't77-enq', 'name', 'Neha', 'phone', '+91' || neha, 'interest', 'Evening batch',
       'status', 'open', 'memberId', null, 'source', 'friend', 'referral', jsonb_build_object('by', 'Asha Rao', 'memberId', 't77-asha')), 1),
    (gp, 'plan', 't77-p-month', '{"name":"Monthly","durationUnit":"month","durationCount":1,"priceP":150000,"active":true}', 1);
  -- Only HQ may change a gym's status (0027): the HQ flag on around it.
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = gp;
  perform set_config('forgeai.hq', 'off', true);

  -- 1. The preview: the gym's own plans (no PT pack, no inactive plan) with its own prices, today and the last day.
  r := public.self_join_preview('t77aaa');
  checks := checks + 1; fails := fails || pg_temp.t77_is('1gym', r->>'gymName', 'T77 Gym');
  checks := checks + 1; fails := fails || pg_temp.t77_is('1open', r->>'closed', 'false');
  checks := checks + 1; fails := fails || pg_temp.t77_is('1plans', (select string_agg(x->>'id', ',') from jsonb_array_elements(r->'plans') x), 't77-quarter,t77-month');
  checks := checks + 1; fails := fails || pg_temp.t77_is('1total', (select x->>'totalP' from jsonb_array_elements(r->'plans') x where x->>'id' = 't77-month'), '200000');
  checks := checks + 1; fails := fails || pg_temp.t77_is('1today', r->>'today', d_today);
  checks := checks + 1; fails := fails || pg_temp.t77_is('1last', r->>'lastDay', d_last);
  checks := checks + 1; fails := fails || pg_temp.t77_is('1nophone', (r::text like '%90000770%')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t77_is('1none', public.self_join_preview('ZZZZZZ')::text, null);
  -- A paused gym: the page says it is not taking online sign-ups (no plans shown), and a send is refused.
  r := public.self_join_preview('T77PPP');
  checks := checks + 1; fails := fails || pg_temp.t77_is('1closed', r->>'closed', 'true');
  checks := checks + 1; fails := fails || pg_temp.t77_is('1closedplans', (r ? 'plans')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t77_is('1closedsend',
    public.self_join_send('T77PPP', 'Ravi Kumar', pg_temp.t77_proof('join', ravi, repeat('a', 32)), null, 't77-p-month', d_today, true, true, 'en')->>'error', 'CLOSED');

  -- 2. Refusals, each before anything is kept.
  p := pg_temp.t77_proof('join', ravi, repeat('b', 32));
  checks := checks + 1; fails := fails || pg_temp.t77_is('2code', public.self_join_send('ZZZZZZ', 'Ravi Kumar', p, null, 't77-month', d_today, true, true, 'en')->>'error', 'NO_GYM');
  checks := checks + 1; fails := fails || pg_temp.t77_is('2name', public.self_join_send('T77AAA', ' 1 ', p, null, 't77-month', d_today, true, true, 'en')->>'error', 'BAD_NAME');
  checks := checks + 1; fails := fails || pg_temp.t77_is('2proof', public.self_join_send('T77AAA', 'Ravi Kumar', 'v1.join.9000077001.1.x.y', null, 't77-month', d_today, true, true, 'en')->>'error', 'BAD_PROOF');
  -- A proof made for another purpose (the member app's "Find my gym") does not work here.
  checks := checks + 1; fails := fails || pg_temp.t77_is('2purpose', public.self_join_send('T77AAA', 'Ravi Kumar', pg_temp.t77_proof('member', ravi, repeat('c', 32)), null, 't77-month', d_today, true, true, 'en')->>'error', 'BAD_PROOF');
  checks := checks + 1; fails := fails || pg_temp.t77_is('2pt', public.self_join_send('T77AAA', 'Ravi Kumar', p, null, 't77-pt', d_today, true, true, 'en')->>'error', 'BAD_PLAN');
  checks := checks + 1; fails := fails || pg_temp.t77_is('2inactive', public.self_join_send('T77AAA', 'Ravi Kumar', p, null, 't77-old', d_today, true, true, 'en')->>'error', 'BAD_PLAN');
  checks := checks + 1; fails := fails || pg_temp.t77_is('2othergym', public.self_join_send('T77AAA', 'Ravi Kumar', p, null, 't77-p-month', d_today, true, true, 'en')->>'error', 'BAD_PLAN');
  checks := checks + 1; fails := fails || pg_temp.t77_is('2past', public.self_join_send('T77AAA', 'Ravi Kumar', p, null, 't77-month', d_past, true, true, 'en')->>'error', 'BAD_DATE');
  checks := checks + 1; fails := fails || pg_temp.t77_is('2late', public.self_join_send('T77AAA', 'Ravi Kumar', p, null, 't77-month', d_late, true, true, 'en')->>'error', 'BAD_DATE');
  checks := checks + 1; fails := fails || pg_temp.t77_is('2adult', public.self_join_send('T77AAA', 'Ravi Kumar', p, null, 't77-month', d_today, false, true, 'en')->>'error', 'NO_CONSENT');
  checks := checks + 1; fails := fails || pg_temp.t77_is('2health', public.self_join_send('T77AAA', 'Ravi Kumar', p, null, 't77-month', d_today, true, null, 'en')->>'error', 'NO_CONSENT');
  -- A bot (the hidden box): answered as sent, nothing kept.
  checks := checks + 1; fails := fails || pg_temp.t77_is('2bot', public.self_join_send('T77AAA', 'Ravi Kumar', p, null, 't77-month', d_today, true, true, 'en', 'http://x')->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t77_is('2nothing',
    (select count(*) from public.crm_records where gym_id = ga and kind = 'enquiry')::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t77_is('2unused', (select count(*) from public.phone_proofs_used where nonce = repeat('b', 32))::text, '0');

  -- 3. Ravi joins: one new enquiry with the block; EVERY price from the gym's plan; the version moved; one instant alert.
  select crm_version into v0 from public.gyms where gym_id = ga;
  r := public.self_join_send('T77AAA', '  Ravi   Kumar ', p, 'male', 't77-month', d_soon, true, true, 'hi');
  checks := checks + 1; fails := fails || pg_temp.t77_is('3ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t77_is('3total', r->>'totalP', '200000');
  checks := checks + 1; fails := fails || pg_temp.t77_is('3linked', r->>'linked', 'false');
  select data into e from public.crm_records where gym_id = ga and kind = 'enquiry' and data->>'phone' = '+91' || ravi;
  checks := checks + 1; fails := fails || pg_temp.t77_is('3name', e->>'name', 'Ravi Kumar');
  checks := checks + 1; fails := fails || pg_temp.t77_is('3status', e->>'status', 'open');
  checks := checks + 1; fails := fails || pg_temp.t77_is('3id', (e->>'id' ~ '^join-[0-9a-f]{32}$')::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t77_is('3plan', e->'selfJoin'->>'planId', 't77-month');
  checks := checks + 1; fails := fails || pg_temp.t77_is('3price', e->'selfJoin'->>'priceP', '150000');
  checks := checks + 1; fails := fails || pg_temp.t77_is('3fee', e->'selfJoin'->>'joiningFeeP', '50000');
  checks := checks + 1; fails := fails || pg_temp.t77_is('3sjtotal', e->'selfJoin'->>'totalP', '200000');
  checks := checks + 1; fails := fails || pg_temp.t77_is('3start', e->'selfJoin'->>'startsOn', d_soon);
  checks := checks + 1; fails := fails || pg_temp.t77_is('3gender', e->'selfJoin'->>'gender', 'male');
  checks := checks + 1; fails := fails || pg_temp.t77_is('3lang', e->'selfJoin'->>'lang', 'hi');
  checks := checks + 1; fails := fails || pg_temp.t77_is('3paid', e->'selfJoin'->>'paid', 'false');
  checks := checks + 1; fails := fails || pg_temp.t77_is('3consent', ((e->'selfJoin'->'consents'->>'adultAt')::bigint > 0 and (e->'selfJoin'->'consents'->>'healthAt')::bigint > 0)::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t77_is('3interest', (e->>'interest' like 'Joined online: Monthly, starts %. Pays at the desk.')::text, 'true');
  select crm_version into v1 from public.gyms where gym_id = ga;
  checks := checks + 1; fails := fails || pg_temp.t77_is('3version', (v1 = v0 + 1)::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t77_is('3recver', (select version from public.crm_records where gym_id = ga and kind = 'enquiry' and id = e->>'id')::text, v1::text);
  checks := checks + 1; fails := fails || pg_temp.t77_is('3alert', (select count(*) from public.gym_alerts where gym_id = ga and kind = 'online_join' and ref_id = e->>'id' and urgent and audience = 'all')::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t77_is('3line', (select line from public.gym_alerts where gym_id = ga and kind = 'online_join' and ref_id = e->>'id'),
    format('Ravi asked to join your gym online (Monthly, from %s). Make them a member on Today.', to_char(today + 5, 'FMDD Mon')));
  checks := checks + 1; fails := fails || pg_temp.t77_is('3alertnophone', (select count(*) from public.gym_alerts where gym_id = ga and line like '%90000%')::text, '0');
  -- The proof is used up: sent again, it is refused.
  checks := checks + 1; fails := fails || pg_temp.t77_is('3oneuse', public.self_join_send('T77AAA', 'Ravi Kumar', p, null, 't77-month', d_today, true, true, 'en')->>'error', 'BAD_PROOF');
  -- Another gym's enquiries are untouched.
  checks := checks + 1; fails := fails || pg_temp.t77_is('3othergym', (select count(*) from public.crm_records where gym_id = gq and kind = 'enquiry')::text, '0');

  -- 4. Sending again with a new proof replaces the block on the SAME enquiry (still one row for Ravi).
  r := public.self_join_send('T77AAA', 'Ravi Kumar', pg_temp.t77_proof('join', ravi, repeat('d', 32)), null, 't77-quarter', d_today, true, true, 'en');
  checks := checks + 1; fails := fails || pg_temp.t77_is('4linked', r->>'linked', 'true');
  checks := checks + 1; fails := fails || pg_temp.t77_is('4one', (select count(*) from public.crm_records where gym_id = ga and kind = 'enquiry' and data->>'phone' = '+91' || ravi)::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t77_is('4plan', (select data->'selfJoin'->>'planId' from public.crm_records where gym_id = ga and kind = 'enquiry' and data->>'phone' = '+91' || ravi), 't77-quarter');

  -- 5. Asha is already a member: MEMBER, nothing made, and her proof is not used up.
  p := pg_temp.t77_proof('join', asha, repeat('e', 32));
  checks := checks + 1; fails := fails || pg_temp.t77_is('5member', public.self_join_send('T77AAA', 'Asha Rao', p, null, 't77-month', d_today, true, true, 'en')->>'error', 'MEMBER');
  checks := checks + 1; fails := fails || pg_temp.t77_is('5nothing', (select count(*) from public.crm_records where gym_id = ga and kind = 'enquiry' and data->>'phone' = '+91' || asha)::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t77_is('5unused', (select count(*) from public.phone_proofs_used where nonce = repeat('e', 32))::text, '0');
  -- An archived member is a returning member: the request is kept.
  r := public.self_join_send('T77AAA', 'Old Member', pg_temp.t77_proof('join', old_m, repeat('f', 32)), null, 't77-month', d_today, true, true, 'en');
  checks := checks + 1; fails := fails || pg_temp.t77_is('5archived', r->>'ok', 'true');

  -- 6. Neha has an open enquiry (a member's friend): linked, her referral, name and interest kept, marked for today.
  r := public.self_join_send('T77AAA', 'Neha Sharma', pg_temp.t77_proof('join', neha, repeat('0', 32)), 'female', 't77-quarter', d_today, true, true, 'en');
  checks := checks + 1; fails := fails || pg_temp.t77_is('6linked', r->>'linked', 'true');
  select data into e from public.crm_records where gym_id = ga and kind = 'enquiry' and id = 't77-enq';
  checks := checks + 1; fails := fails || pg_temp.t77_is('6by', e->'referral'->>'by', 'Asha Rao');
  checks := checks + 1; fails := fails || pg_temp.t77_is('6name', e->>'name', 'Neha');
  checks := checks + 1; fails := fails || pg_temp.t77_is('6sjname', e->'selfJoin'->>'name', 'Neha Sharma');
  checks := checks + 1; fails := fails || pg_temp.t77_is('6interest', e->>'interest', 'Evening batch');
  checks := checks + 1; fails := fails || pg_temp.t77_is('6follow', e->>'followUpOn', d_today);
  checks := checks + 1; fails := fails || pg_temp.t77_is('6one', (select count(*) from public.crm_records where gym_id = ga and kind = 'enquiry' and data->>'phone' = '+91' || neha)::text, '1');

  -- 7. Limits: 3 a day per number.
  for i in 1..3 loop
    r := public.self_join_send('T77AAA', 'Many Tries', pg_temp.t77_proof('join', many, lpad(i::text, 32, '1')), null, 't77-month', d_today, true, true, 'en');
  end loop;
  checks := checks + 1; fails := fails || pg_temp.t77_is('7third', r->>'ok', 'true');
  r := public.self_join_send('T77AAA', 'Many Tries', pg_temp.t77_proof('join', many, lpad('4', 32, '1')), null, 't77-month', d_today, true, true, 'en');
  checks := checks + 1; fails := fails || pg_temp.t77_is('7number', r->>'error', 'TOO_MANY');
  -- 30 a day per gym.
  insert into public.gym_self_joins(gym_id, enquiry_id, phone) select ga, 'filler-' || g, '9000077099' from generate_series(1, 30) g;
  r := public.self_join_send('T77AAA', 'Late Comer', pg_temp.t77_proof('join', '9000077006', repeat('2', 32)), null, 't77-month', d_today, true, true, 'en');
  checks := checks + 1; fails := fails || pg_temp.t77_is('7gym', r->>'error', 'TOO_MANY');

  -- 8. Callable without signing in only by name: anon may run both (each checks a code / proof itself); the table is shut.
  checks := checks + 1; fails := fails || pg_temp.t77_is('8anon',
    (has_function_privilege('anon', 'public.self_join_preview(text)', 'execute')
     and has_function_privilege('anon', 'public.self_join_send(text, text, text, text, text, text, boolean, boolean, text, text)', 'execute'))::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t77_is('8helpers',
    (has_function_privilege('anon', 'public._self_join_plans(uuid)', 'execute'))::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t77_is('8table', has_table_privilege('anon', 'public.gym_self_joins', 'select')::text, 'false');
  -- 0075's older kinds still work alongside the new one.
  perform public._alert(ga, 'shop_order', 't77-order', 'order:t77-order', 'all', true, 'New shop order T77 from Ravi. Get it ready on Shop.', '/shop');
  checks := checks + 1; fails := fails || pg_temp.t77_is('8oldkind', (select count(*) from public.gym_alerts where tag = 'order:t77-order')::text, '1');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
