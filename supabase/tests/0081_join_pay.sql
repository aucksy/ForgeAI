-- Join online and pay online test (0081, R-528). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be
-- pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- Fake numbers only (90000 81xxx); the secret here is a test value.

create or replace function pg_temp.t81_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- The panel Worker's signature: hex HMAC-SHA256 of the message with 0061's secret (phoneCode.js hmacHex).
create or replace function pg_temp.t81_sig(p_msg text) returns text
  language sql as $$
  select encode(extensions.hmac(p_msg, 'test-secret-0123456789abcdef0123456789abcdef', 'sha256'), 'hex')
$$;

create or replace function pg_temp.t81_proof(p_phone text, p_nonce text) returns text
  language sql as $$
  select b || '.' || pg_temp.t81_sig(b)
    from (select 'v1.join.' || p_phone || '.' || (extract(epoch from now())::bigint + 900) || '.' || p_nonce as b) x
$$;

do $$
declare
  ga uuid; gp uuid; at bigint := extract(epoch from now())::bigint;
  d_today text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  r jsonb; eid text; fails text := ''; checks int := 0;
begin
  delete from public.phone_code_settings;
  insert into public.phone_code_settings(secret) values ('test-secret-0123456789abcdef0123456789abcdef');
  insert into public.gyms(name, join_code, crm_version) values ('T81 Gym', 'T81AAA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T81 Paused', 'T81PPP', 1) returning gym_id into gp;
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'plan', 't81-month', '{"name":"Monthly","durationUnit":"month","durationCount":1,"priceP":150000,"joiningFeeP":50000,"active":true}', 1),
    (ga, 'enquiry', 't81-enq', jsonb_build_object('id', 't81-enq', 'name', 'Neha', 'phone', '+919000081002', 'interest', 'Evening',
       'status', 'open', 'memberId', null, 'source', null), 1);
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = gp;
  perform set_config('forgeai.hq', 'off', true);

  -- 1. self_join_pay_gym: only with the Worker's signature, fresh, for an open gym.
  r := public.self_join_pay_gym('t81aaa', at, pg_temp.t81_sig('sjpay.T81AAA.' || at));
  checks := checks + 1; fails := fails || pg_temp.t81_is('1ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t81_is('1gym', r->>'gymId', ga::text);
  checks := checks + 1; fails := fails || pg_temp.t81_is('1nosig', public.self_join_pay_gym('T81AAA', at, null)->>'error', 'BAD_SIG');
  checks := checks + 1; fails := fails || pg_temp.t81_is('1badsig', public.self_join_pay_gym('T81AAA', at, repeat('0', 64))->>'error', 'BAD_SIG');
  -- A signature for another code does not open this one.
  checks := checks + 1; fails := fails || pg_temp.t81_is('1othercode', public.self_join_pay_gym('T81AAA', at, pg_temp.t81_sig('sjpay.T81PPP.' || at))->>'error', 'BAD_SIG');
  -- Older than 5 minutes: refused, even when signed.
  checks := checks + 1; fails := fails || pg_temp.t81_is('1old', public.self_join_pay_gym('T81AAA', at - 400, pg_temp.t81_sig('sjpay.T81AAA.' || (at - 400)))->>'error', 'BAD_SIG');
  checks := checks + 1; fails := fails || pg_temp.t81_is('1nogym', public.self_join_pay_gym('ZZZZ81', at, pg_temp.t81_sig('sjpay.ZZZZ81.' || at))->>'error', 'NO_GYM');
  checks := checks + 1; fails := fails || pg_temp.t81_is('1shape', public.self_join_pay_gym('bad code', at, pg_temp.t81_sig('sjpay.BAD CODE.' || at))->>'error', 'NO_GYM');
  checks := checks + 1; fails := fails || pg_temp.t81_is('1paused', public.self_join_pay_gym('T81PPP', at, pg_temp.t81_sig('sjpay.T81PPP.' || at))->>'error', 'CLOSED');

  -- 2. self_join_send answers with its own enquiry's id: a new one ...
  r := public.self_join_send('T81AAA', 'Ravi Kumar', pg_temp.t81_proof('9000081001', repeat('a', 32)), 'male', 't81-month', d_today, true, true, 'en');
  checks := checks + 1; fails := fails || pg_temp.t81_is('2ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t81_is('2total', r->>'totalP', '200000');
  select id into eid from public.crm_records where gym_id = ga and kind = 'enquiry' and data->>'phone' = '+919000081001';
  checks := checks + 1; fails := fails || pg_temp.t81_is('2id', r->>'enquiryId', eid);
  checks := checks + 1; fails := fails || pg_temp.t81_is('2shape', ((r->>'enquiryId') ~ '^join-[0-9a-f]{32}$')::text, 'true');
  -- ... and for a linked one, the open enquiry's own id.
  r := public.self_join_send('T81AAA', 'Neha Singh', pg_temp.t81_proof('9000081002', repeat('b', 32)), null, 't81-month', d_today, true, true, 'en');
  checks := checks + 1; fails := fails || pg_temp.t81_is('2linked', r->>'linked', 'true');
  checks := checks + 1; fails := fails || pg_temp.t81_is('2linkedid', r->>'enquiryId', 't81-enq');
  -- Everything 0077 kept is still kept: the block, pay at the desk until the money comes, the alert.
  checks := checks + 1; fails := fails || pg_temp.t81_is('2block', (select data->'selfJoin'->>'pay' from public.crm_records where gym_id = ga and id = eid), 'desk');
  checks := checks + 1; fails := fails || pg_temp.t81_is('2alert', (select count(*) from public.gym_alerts where gym_id = ga and kind = 'online_join')::text, '2');
  -- A bot (the hidden box): answered as sent, no enquiry id (so no payment is ever made for it).
  r := public.self_join_send('T81AAA', 'Bot', pg_temp.t81_proof('9000081003', repeat('c', 32)), null, 't81-month', d_today, true, true, 'en', 'http://x');
  checks := checks + 1; fails := fails || pg_temp.t81_is('2bot', (r ? 'enquiryId')::text, 'false');

  -- 3. Grants: anon may call both (each checks a proof or the Worker's signature itself).
  checks := checks + 1; fails := fails || pg_temp.t81_is('3anon',
    (has_function_privilege('anon', 'public.self_join_pay_gym(text, bigint, text)', 'execute')
     and has_function_privilege('anon', 'public.self_join_send(text, text, text, text, text, text, boolean, boolean, text, text)', 'execute'))::text, 'true');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
