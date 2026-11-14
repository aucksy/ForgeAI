-- Free trial when joining online test (0088, F210, R-521). Runs in CI after every migration (scripts/ci/db_checks.sh);
-- can also be pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- Fake numbers only (90000 88xxx); the secret here is a test value.

create or replace function pg_temp.t88_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- A signed 'join' proof for the test secret (the Worker's makeProof shape).
create or replace function pg_temp.t88_proof(p_phone text, p_nonce text) returns text
  language sql as $$
  select b || '.' || encode(extensions.hmac(b, 'test-secret-0123456789abcdef0123456789abcdef', 'sha256'), 'hex')
    from (select 'v1.join.' || p_phone || '.' || (extract(epoch from now())::bigint + 900) || '.' || p_nonce as b) x
$$;

do $$
declare
  ga uuid; gp uuid; gb uuid;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  d_today text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  d_soon text := to_char((now() at time zone 'Asia/Kolkata')::date + 5, 'YYYY-MM-DD');
  d_soon_end text := to_char((now() at time zone 'Asia/Kolkata')::date + 7, 'YYYY-MM-DD');
  d_past text := to_char((now() at time zone 'Asia/Kolkata')::date - 1, 'YYYY-MM-DD');
  d_late text := to_char((now() at time zone 'Asia/Kolkata')::date + 31, 'YYYY-MM-DD');
  ravi text := '9000088001'; asha text := '9000088002'; neha text := '9000088003'; omar text := '9000088004';
  r jsonb; e jsonb; eid text; v0 bigint; fails text := ''; checks int := 0;
begin
  delete from public.phone_code_settings;
  insert into public.phone_code_settings(secret) values ('test-secret-0123456789abcdef0123456789abcdef');

  insert into public.gyms(name, join_code, crm_version) values ('T88 Gym', 'T88AAA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T88 Paused', 'T88PPP', 1) returning gym_id into gp;
  insert into public.gyms(name, join_code, crm_version) values ('T88 Other', 'T88BBB', 1) returning gym_id into gb;
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'gym', ga::text, '{"name":"T88 Gym"}', 1),
    (ga, 'plan', 't88-month', '{"name":"Monthly","durationUnit":"month","durationCount":1,"priceP":150000,"joiningFeeP":50000,"active":true}', 1),
    (ga, 'member', 't88-asha', jsonb_build_object('fullName', 'Asha Rao', 'phone', '+91' || asha, 'archived', false), 1),
    (ga, 'enquiry', 't88-enq', jsonb_build_object('id', 't88-enq', 'name', 'Neha', 'phone', '+91' || neha, 'interest', 'Evening batch',
       'status', 'open', 'memberId', null, 'source', null), 1),
    (gp, 'gym', gp::text, '{"name":"T88 Paused","joinTrialDays":3}', 1),
    (gp, 'plan', 't88-p-month', '{"name":"Monthly","durationUnit":"month","durationCount":1,"priceP":150000,"active":true}', 1),
    (gb, 'gym', gb::text, '{"name":"T88 Other","joinTrialDays":7}', 1),
    (gb, 'plan', 't88-b-month', '{"name":"Monthly","durationUnit":"month","durationCount":1,"priceP":100000,"active":true}', 1);
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = gp;
  perform set_config('forgeai.hq', 'off', true);

  -- 1. Trials off (the default): the preview says so with the key itself (that is how the admin app knows 0088 is in),
  --    and a trial request is refused. Plans work as before.
  r := public.self_join_preview('t88aaa');
  checks := checks + 1; fails := fails || pg_temp.t88_is('1key', (r ? 'trial')::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t88_is('1off', jsonb_typeof(r->'trial'), 'null');
  checks := checks + 1; fails := fails || pg_temp.t88_is('1plans', jsonb_array_length(r->'plans')::text, '1');
  r := public.self_join_send('T88AAA', 'Ravi Kumar', pg_temp.t88_proof(ravi, repeat('a', 32)), 'male', '_trial', d_today, true, true, 'en');
  checks := checks + 1; fails := fails || pg_temp.t88_is('1sendoff', r->>'error', 'TRIAL_OFF');
  -- A value the admin app never sends (5 days, or words) is read as off.
  update public.crm_records set data = data || '{"joinTrialDays":5}' where gym_id = ga and kind = 'gym';
  checks := checks + 1; fails := fails || pg_temp.t88_is('1five', jsonb_typeof(public.self_join_preview('T88AAA')->'trial'), 'null');
  update public.crm_records set data = data || '{"joinTrialDays":"three"}' where gym_id = ga and kind = 'gym';
  checks := checks + 1; fails := fails || pg_temp.t88_is('1words', jsonb_typeof(public.self_join_preview('T88AAA')->'trial'), 'null');
  -- A paused gym: no trial key, and a trial is refused like a plan.
  r := public.self_join_preview('T88PPP');
  checks := checks + 1; fails := fails || pg_temp.t88_is('1closedkey', (r ? 'trial')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t88_is('1closedsend',
    public.self_join_send('T88PPP', 'Ravi Kumar', pg_temp.t88_proof(ravi, repeat('b', 32)), null, '_trial', d_today, true, true, 'en')->>'error', 'CLOSED');

  -- 2. The owner switches on 3 days: the preview offers it, with no fee.
  update public.crm_records set data = data || '{"joinTrialDays":3}' where gym_id = ga and kind = 'gym';
  r := public.self_join_preview('T88AAA');
  checks := checks + 1; fails := fails || pg_temp.t88_is('2days', r->'trial'->>'days', '3');
  checks := checks + 1; fails := fails || pg_temp.t88_is('2fee', r->'trial'->>'feeP', '0');
  checks := checks + 1; fails := fails || pg_temp.t88_is('2other', public.self_join_preview('T88BBB')->'trial'->>'days', '7');

  -- 3. A new person starts a 3-day trial from 5 days on: a new enquiry, no plan, no money, the last day, the alert.
  select crm_version into v0 from public.gyms where gym_id = ga;
  r := public.self_join_send('T88AAA', 'Ravi Kumar', pg_temp.t88_proof(ravi, repeat('c', 32)), 'male', '_trial', d_soon, true, true, 'en');
  checks := checks + 1; fails := fails || pg_temp.t88_is('3ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t88_is('3total', r->>'totalP', '0');
  checks := checks + 1; fails := fails || pg_temp.t88_is('3days', r->'trial'->>'days', '3');
  checks := checks + 1; fails := fails || pg_temp.t88_is('3ends', r->'trial'->>'endsOn', d_soon_end);
  checks := checks + 1; fails := fails || pg_temp.t88_is('3noplan', (r ? 'planName')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t88_is('3linked', r->>'linked', 'false');
  eid := r->>'enquiryId';
  checks := checks + 1; fails := fails || pg_temp.t88_is('3id', (eid ~ '^join-[0-9a-f]{32}$')::text, 'true');
  select data into e from public.crm_records where gym_id = ga and kind = 'enquiry' and id = eid;
  checks := checks + 1; fails := fails || pg_temp.t88_is('3phone', e->>'phone', '+91' || ravi);
  checks := checks + 1; fails := fails || pg_temp.t88_is('3planid', e->'selfJoin'->>'planId', '');
  checks := checks + 1; fails := fails || pg_temp.t88_is('3blocktotal', e->'selfJoin'->>'totalP', '0');
  checks := checks + 1; fails := fails || pg_temp.t88_is('3blockdays', e->'selfJoin'->'trial'->>'days', '3');
  checks := checks + 1; fails := fails || pg_temp.t88_is('3blockends', e->'selfJoin'->'trial'->>'endsOn', d_soon_end);
  checks := checks + 1; fails := fails || pg_temp.t88_is('3blockfee', e->'selfJoin'->'trial'->>'feeP', '0');
  checks := checks + 1; fails := fails || pg_temp.t88_is('3starts', e->'selfJoin'->>'startsOn', d_soon);
  checks := checks + 1; fails := fails || pg_temp.t88_is('3interest', (e->>'interest' like 'Free trial online: 3 days, % to %. Not a member yet.')::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t88_is('3version', (select (crm_version = v0 + 1)::text from public.gyms where gym_id = ga), 'true');
  checks := checks + 1; fails := fails || pg_temp.t88_is('3kept', (select count(*) from public.gym_self_joins where gym_id = ga and phone = ravi and trial)::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t88_is('3alert', (select count(*) from public.gym_alerts
    where gym_id = ga and kind = 'online_join' and ref_id = eid and line like 'Ravi started a free 3-day trial online (%). Let them in until %, and make them a member on Today when they join.')::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t88_is('3alertnophone', (select count(*) from public.gym_alerts where gym_id = ga and line like '%90000%')::text, '0');

  -- 4. The same number again: one free trial per number per gym. A plan is still fine (and replaces the block).
  r := public.self_join_send('T88AAA', 'Ravi Kumar', pg_temp.t88_proof(ravi, repeat('d', 32)), 'male', '_trial', d_today, true, true, 'en');
  checks := checks + 1; fails := fails || pg_temp.t88_is('4used', r->>'error', 'TRIAL_USED');
  r := public.self_join_send('T88AAA', 'Ravi Kumar', pg_temp.t88_proof(ravi, repeat('e', 32)), 'male', 't88-month', d_today, true, true, 'en');
  checks := checks + 1; fails := fails || pg_temp.t88_is('4plan', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t88_is('4planlinked', r->>'enquiryId', eid);
  checks := checks + 1; fails := fails || pg_temp.t88_is('4plantotal', r->>'totalP', '200000');
  select data into e from public.crm_records where gym_id = ga and kind = 'enquiry' and id = eid;
  checks := checks + 1; fails := fails || pg_temp.t88_is('4blockplan', e->'selfJoin'->>'planId', 't88-month');
  checks := checks + 1; fails := fails || pg_temp.t88_is('4blocknotrial', (e->'selfJoin' ? 'trial')::text, 'false');
  -- The same number at ANOTHER gym may still try that gym.
  r := public.self_join_send('T88BBB', 'Ravi Kumar', pg_temp.t88_proof(ravi, repeat('f', 32)), 'male', '_trial', d_today, true, true, 'en');
  checks := checks + 1; fails := fails || pg_temp.t88_is('4othergym', r->'trial'->>'days', '7');
  checks := checks + 1; fails := fails || pg_temp.t88_is('4otherends', r->'trial'->>'endsOn', to_char(today + 6, 'YYYY-MM-DD'));

  -- 5. An open enquiry with this number is linked (its own words stay); a member cannot take a trial.
  r := public.self_join_send('T88AAA', 'Neha Singh', pg_temp.t88_proof(neha, repeat('g', 32)), 'female', '_trial', d_today, true, true, 'hi');
  checks := checks + 1; fails := fails || pg_temp.t88_is('5linked', r->>'linked', 'true');
  checks := checks + 1; fails := fails || pg_temp.t88_is('5linkedid', r->>'enquiryId', 't88-enq');
  select data into e from public.crm_records where gym_id = ga and kind = 'enquiry' and id = 't88-enq';
  checks := checks + 1; fails := fails || pg_temp.t88_is('5interest', e->>'interest', 'Evening batch');
  checks := checks + 1; fails := fails || pg_temp.t88_is('5trial', e->'selfJoin'->'trial'->>'endsOn', to_char(today + 2, 'YYYY-MM-DD'));
  checks := checks + 1; fails := fails || pg_temp.t88_is('5lang', e->'selfJoin'->>'lang', 'hi');
  r := public.self_join_send('T88AAA', 'Asha Rao', pg_temp.t88_proof(asha, repeat('h', 32)), null, '_trial', d_today, true, true, 'en');
  checks := checks + 1; fails := fails || pg_temp.t88_is('5member', r->>'error', 'MEMBER');

  -- 6. The same checks as a plan: the start day, the two boxes, the proof, a bot.
  checks := checks + 1; fails := fails || pg_temp.t88_is('6past',
    public.self_join_send('T88AAA', 'Omar Khan', pg_temp.t88_proof(omar, repeat('i', 32)), null, '_trial', d_past, true, true, 'en')->>'error', 'BAD_DATE');
  checks := checks + 1; fails := fails || pg_temp.t88_is('6late',
    public.self_join_send('T88AAA', 'Omar Khan', pg_temp.t88_proof(omar, repeat('j', 32)), null, '_trial', d_late, true, true, 'en')->>'error', 'BAD_DATE');
  checks := checks + 1; fails := fails || pg_temp.t88_is('6consent',
    public.self_join_send('T88AAA', 'Omar Khan', pg_temp.t88_proof(omar, repeat('k', 32)), null, '_trial', d_today, true, false, 'en')->>'error', 'NO_CONSENT');
  checks := checks + 1; fails := fails || pg_temp.t88_is('6proof',
    public.self_join_send('T88AAA', 'Omar Khan', 'v1.join.' || omar || '.1999999999.' || repeat('l', 32) || '.' || repeat('0', 64), null, '_trial', d_today, true, true, 'en')->>'error', 'BAD_PROOF');
  r := public.self_join_send('T88AAA', 'Bot', pg_temp.t88_proof(omar, repeat('m', 32)), null, '_trial', d_today, true, true, 'en', 'http://x');
  checks := checks + 1; fails := fails || pg_temp.t88_is('6bot', (r ? 'trial')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t88_is('6nothingkept', (select count(*) from public.gym_self_joins where phone = omar)::text, '0');
  -- A 1-day trial ends the day it starts.
  update public.crm_records set data = data || '{"joinTrialDays":1}' where gym_id = ga and kind = 'gym';
  r := public.self_join_send('T88AAA', 'Omar Khan', pg_temp.t88_proof(omar, repeat('n', 32)), null, '_trial', d_soon, true, true, 'en');
  checks := checks + 1; fails := fails || pg_temp.t88_is('6oneday', r->'trial'->>'endsOn', d_soon);
  checks := checks + 1; fails := fails || pg_temp.t88_is('6onedayline', ((select data->>'interest' from public.crm_records where gym_id = ga and kind = 'enquiry' and id = r->>'enquiryId') like 'Free trial online: 1 day, %')::text, 'true');
  -- Switched off again: the next trial is refused at once.
  update public.crm_records set data = data - 'joinTrialDays' where gym_id = ga and kind = 'gym';
  checks := checks + 1; fails := fails || pg_temp.t88_is('6offagain',
    public.self_join_send('T88AAA', 'Zoya Ali', pg_temp.t88_proof('9000088005', repeat('o', 32)), null, '_trial', d_today, true, true, 'en')->>'error', 'TRIAL_OFF');
  -- '_trial' is never a plan: with trials off a plan send of an unknown id is still BAD_PLAN.
  checks := checks + 1; fails := fails || pg_temp.t88_is('6badplan',
    public.self_join_send('T88AAA', 'Zoya Ali', pg_temp.t88_proof('9000088005', repeat('p', 32)), null, 'no-such-plan', d_today, true, true, 'en')->>'error', 'BAD_PLAN');

  -- 7. Grants: the public calls stay as they were; the setting reader is private; the table stays closed.
  checks := checks + 1; fails := fails || pg_temp.t88_is('7anon',
    (has_function_privilege('anon', 'public.self_join_preview(text)', 'execute')
     and has_function_privilege('anon', 'public.self_join_send(text, text, text, text, text, text, boolean, boolean, text, text)', 'execute'))::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t88_is('7private',
    (has_function_privilege('anon', 'public._self_join_trial_days(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._self_join_trial_days(uuid)', 'execute'))::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t88_is('7table', has_table_privilege('anon', 'public.gym_self_joins', 'select')::text, 'false');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
