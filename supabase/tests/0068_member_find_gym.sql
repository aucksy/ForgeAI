-- "Find my gym by my number" test (0068, R-458). Runs in CI after every migration (scripts/ci/db_checks.sh); can also
-- be pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- Fake numbers only (90000 68xxx); the secret here is a test value.

create or replace function pg_temp.t68_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- A signed proof for the test secret: v1.<purpose>.<phone>.<expires>.<nonce>.<hmac>.
create or replace function pg_temp.t68_proof(p_purpose text, p_phone text, p_nonce text, p_secs int default 900) returns text
  language sql as $$
  select b || '.' || encode(extensions.hmac(b, 'test-secret-0123456789abcdef0123456789abcdef', 'sha256'), 'hex')
    from (select 'v1.' || p_purpose || '.' || p_phone || '.' || (extract(epoch from now())::bigint + p_secs)
                 || '.' || p_nonce as b) x
$$;

do $$
declare
  asha_ph text := '9000068001'; ravi_ph text := '9000068002'; old_ph text := '9000068003'; nobody_ph text := '9000068004';
  ga uuid; gb uuid; gc uuid; gd uuid; mid uuid;
  today text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  past text := to_char((now() at time zone 'Asia/Kolkata')::date - 60, 'YYYY-MM-DD');
  gone text := to_char((now() at time zone 'Asia/Kolkata')::date - 5, 'YYYY-MM-DD');
  later text := to_char((now() at time zone 'Asia/Kolkata')::date + 25, 'YYYY-MM-DD');
  later2 text := to_char((now() at time zone 'Asia/Kolkata')::date + 90, 'YYYY-MM-DD');
  km text := 't68-member-asha-key'; kr text := 't68-member-ravi-key';
  p text; r jsonb; fails text := ''; checks int := 0; i int;
begin
  delete from public.phone_code_settings;
  insert into public.phone_code_settings(secret) values ('test-secret-0123456789abcdef0123456789abcdef');

  insert into public.gyms(name, join_code, crm_version) values ('T68 Alpha', 'T68AAA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T68 Beta', 'T68BBB', 1) returning gym_id into gb;
  insert into public.gyms(name, join_code, crm_version) values ('T68 Closed', 'T68CCC', 1) returning gym_id into gc;
  insert into public.gyms(name, join_code, crm_version) values ('T68 Delta', 'T68DDD', 1) returning gym_id into gd;
  insert into public.crm_records(gym_id, kind, id, data, version) values
    -- Asha: a plan at Alpha (ends in 25 days) and a FITPASS pass at Beta.
    (ga, 'member', 't68-asha-a', jsonb_build_object('fullName', 'Asha Rao', 'phone', '+91' || asha_ph), 1),
    (ga, 'membership', 't68-asha-a-m', jsonb_build_object('memberId', 't68-asha-a', 'startsOn', past, 'endsOn', later, 'cancelled', false, 'planName', 'Monthly'), 1),
    (gb, 'member', 't68-asha-b', jsonb_build_object('fullName', 'asha', 'phone', '0' || asha_ph, 'passCompany', 'FITPASS'), 1),
    -- Asha at Closed: her plan ended 5 days ago (not listed).
    (gc, 'member', 't68-asha-c', jsonb_build_object('fullName', 'Asha R', 'phone', asha_ph), 1),
    (gc, 'membership', 't68-asha-c-m', jsonb_build_object('memberId', 't68-asha-c', 'startsOn', past, 'endsOn', gone, 'cancelled', false), 1),
    -- Delta: a running plan, but the member was archived (not listed), and a cancelled plan for Ravi.
    (gd, 'member', 't68-asha-d', jsonb_build_object('fullName', 'Asha', 'phone', asha_ph, 'archived', true), 1),
    (gd, 'membership', 't68-asha-d-m', jsonb_build_object('memberId', 't68-asha-d', 'startsOn', past, 'endsOn', later2, 'cancelled', false), 1),
    (gd, 'member', 't68-ravi-d', jsonb_build_object('fullName', 'Ravi Kumar', 'phone', ravi_ph), 1),
    (gd, 'membership', 't68-ravi-d-m', jsonb_build_object('memberId', 't68-ravi-d', 'startsOn', past, 'endsOn', later2, 'cancelled', true), 1),
    -- A recycled number: the gym's list still has "Meena" on it with a running plan.
    (ga, 'member', 't68-meena', jsonb_build_object('fullName', 'Meena Joshi', 'phone', old_ph), 1),
    (ga, 'membership', 't68-meena-m', jsonb_build_object('memberId', 't68-meena', 'startsOn', past, 'endsOn', later2, 'cancelled', false), 1);

  -- 1. Asha's own proof: Alpha (plan, ends `later`) then Beta (pass); never Closed (ended) or Delta (archived).
  p := pg_temp.t68_proof('member', asha_ph, repeat('1', 32));
  r := public.member_find_gyms(p, 'Asha');
  checks := checks + 1; fails := fails || pg_temp.t68_is('1ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t68_is('1n', jsonb_array_length(r->'gyms')::text, '2');
  checks := checks + 1; fails := fails || pg_temp.t68_is('1first', r->'gyms'->0->>'gymName', 'T68 Alpha');
  checks := checks + 1; fails := fails || pg_temp.t68_is('1code', r->'gyms'->0->>'joinCode', 'T68AAA');
  checks := checks + 1; fails := fails || pg_temp.t68_is('1ends', r->'gyms'->0->>'endsOn', later);
  checks := checks + 1; fails := fails || pg_temp.t68_is('1second', r->'gyms'->1->>'gymName', 'T68 Beta');
  checks := checks + 1; fails := fails || pg_temp.t68_is('1pass', r->'gyms'->1->>'pass', 'true');
  -- Nothing about money or visits is in the answer.
  checks := checks + 1; fails := fails || pg_temp.t68_is('1nomoney', (r::text ~* 'price|paise|due|visit')::text, 'false');
  -- Looking does not use the proof up.
  checks := checks + 1; fails := fails || pg_temp.t68_is('1unused',
    (select count(*) from public.phone_proofs_used where nonce = repeat('1', 32))::text, '0');

  -- 2. Another first name on the same number finds nothing (a recycled number shows no gym).
  r := public.member_find_gyms(pg_temp.t68_proof('member', old_ph, repeat('2', 32)), 'Rahul');
  checks := checks + 1; fails := fails || pg_temp.t68_is('2n', jsonb_array_length(r->'gyms')::text, '0');
  r := public.member_find_gyms(pg_temp.t68_proof('member', old_ph, repeat('2', 32)), 'Meena');
  checks := checks + 1; fails := fails || pg_temp.t68_is('2meena', r->'gyms'->0->>'gymName', 'T68 Alpha');

  -- 3. A cancelled plan, an unknown number: nothing. No name: NAME_NEEDED.
  r := public.member_find_gyms(pg_temp.t68_proof('member', ravi_ph, repeat('3', 32)), 'Ravi');
  checks := checks + 1; fails := fails || pg_temp.t68_is('3cancelled', jsonb_array_length(r->'gyms')::text, '0');
  r := public.member_find_gyms(pg_temp.t68_proof('member', nobody_ph, repeat('4', 32)), 'Asha');
  checks := checks + 1; fails := fails || pg_temp.t68_is('3nobody', jsonb_array_length(r->'gyms')::text, '0');
  r := public.member_find_gyms(pg_temp.t68_proof('member', asha_ph, repeat('5', 32)), '  ');
  checks := checks + 1; fails := fails || pg_temp.t68_is('3noname', r->>'error', 'NAME_NEEDED');

  -- 4. Proofs that must fail: another purpose, a wrong signature, expired, a typed number with no proof.
  r := public.member_find_gyms(pg_temp.t68_proof('pin', asha_ph, repeat('6', 32)), 'Asha');
  checks := checks + 1; fails := fails || pg_temp.t68_is('4purpose', r->>'error', 'BAD_PROOF');
  r := public.member_find_gyms('v1.member.' || asha_ph || '.' || (extract(epoch from now())::bigint + 900) || '.' || repeat('7', 32) || '.' || repeat('0', 64), 'Asha');
  checks := checks + 1; fails := fails || pg_temp.t68_is('4sig', r->>'error', 'BAD_PROOF');
  r := public.member_find_gyms(pg_temp.t68_proof('member', asha_ph, repeat('8', 32), -5), 'Asha');
  checks := checks + 1; fails := fails || pg_temp.t68_is('4expired', r->>'error', 'BAD_PROOF');
  r := public.member_find_gyms(asha_ph, 'Asha');
  checks := checks + 1; fails := fails || pg_temp.t68_is('4typed', r->>'error', 'BAD_PROOF');

  -- 5. At most 5 searches per proof (proof 1 has used 1).
  for i in 1..4 loop perform public.member_find_gyms(p, 'Asha'); end loop;
  r := public.member_find_gyms(p, 'Asha');
  checks := checks + 1; fails := fails || pg_temp.t68_is('5many', r->>'error', 'TOO_MANY');

  -- 6. A suspended gym is not listed.
  update public.gyms set status = 'suspended' where gym_id = gb;
  r := public.member_find_gyms(pg_temp.t68_proof('member', asha_ph, repeat('9', 32)), 'Asha');
  checks := checks + 1; fails := fails || pg_temp.t68_is('6suspended', jsonb_array_length(r->'gyms')::text, '1');
  update public.gyms set status = 'active' where gym_id = gb;

  -- 7. Link after joining Alpha: a desk request still waiting is closed; the proof is used up; once only.
  insert into public.gym_members(gym_id, name, key_hash) values (ga, 'Asha', public._hash_key(km)) returning member_id into mid;
  insert into public.gym_phone_links(gym_id, app_member, roster_id, phone) values (ga, mid, 't68-asha-a', '+91' || asha_ph);
  p := pg_temp.t68_proof('member', asha_ph, repeat('a', 32));
  r := public.member_claim_phone(km, p);
  checks := checks + 1; fails := fails || pg_temp.t68_is('7ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t68_is('7phone',
    (select checkin_phone from public.gym_members where member_id = mid), '+91' || asha_ph);
  checks := checks + 1; fails := fails || pg_temp.t68_is('7checked',
    ((select phone_checked_at from public.gym_members where member_id = mid) is not null)::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t68_is('7desk',
    (select status || '/' || decided_by_name from public.gym_phone_links where app_member = mid), 'approved/Number checked');
  checks := checks + 1; fails := fails || pg_temp.t68_is('7used',
    (select count(*) from public.phone_proofs_used where nonce = repeat('a', 32))::text, '1');
  r := public.member_claim_phone(km, p);
  checks := checks + 1; fails := fails || pg_temp.t68_is('7again', r->>'error', 'BAD_PROOF');
  -- My membership now answers (no desk check was needed).
  r := public.member_membership(km);
  checks := checks + 1; fails := fails || pg_temp.t68_is('7membership', r->>'ok', 'true');

  -- 8. Link refused: another first name in the app (proof kept), a number not on this gym's list.
  insert into public.gym_members(gym_id, name, key_hash) values (ga, 'Ravi', public._hash_key(kr)) returning member_id into mid;
  p := pg_temp.t68_proof('member', asha_ph, repeat('b', 32));
  r := public.member_claim_phone(kr, p);
  checks := checks + 1; fails := fails || pg_temp.t68_is('8name', r->>'error', 'NAME_MISMATCH');
  checks := checks + 1; fails := fails || pg_temp.t68_is('8kept',
    (select count(*) from public.phone_proofs_used where nonce = repeat('b', 32))::text, '0');
  r := public.member_claim_phone(kr, pg_temp.t68_proof('member', ravi_ph, repeat('c', 32)));
  checks := checks + 1; fails := fails || pg_temp.t68_is('8roster', r->>'error', 'NOT_ON_ROSTER');
  checks := checks + 1; fails := fails || pg_temp.t68_is('8untouched',
    (select coalesce(checkin_phone, 'none') from public.gym_members where member_id = mid), 'none');
  -- A bad member key is refused by _member.
  begin
    perform public.member_claim_phone('t68-no-such-key', p);
    r := '{"error":"none"}';
  exception when others then r := jsonb_build_object('error', sqlerrm); end;
  checks := checks + 1; fails := fails || pg_temp.t68_is('8key', r->>'error', 'BAD_KEY');

  -- 9. Callable without signing in only by name: anon may run both (each checks a proof / key itself).
  checks := checks + 1; fails := fails || pg_temp.t68_is('9anon',
    (has_function_privilege('anon', 'public.member_find_gyms(text, text)', 'execute')
     and has_function_privilege('anon', 'public.member_claim_phone(text, text)', 'execute'))::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t68_is('9table',
    has_table_privilege('anon', 'public.member_find_tries', 'select')::text, 'false');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
