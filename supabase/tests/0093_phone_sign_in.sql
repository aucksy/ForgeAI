-- "Sign in with your phone number" test (0093, F203, R-493). Runs in CI after every migration (scripts/ci/db_checks.sh);
-- can also be pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- Fake numbers only (90000 93xxx); the secret here is a test value.

create or replace function pg_temp.t93_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- A signed proof for the test secret: v1.<purpose>.<phone>.<expires>.<nonce>.<hmac>.
create or replace function pg_temp.t93_proof(p_purpose text, p_phone text, p_nonce text, p_secs int default 900) returns text
  language sql as $$
  select b || '.' || encode(extensions.hmac(b, 'test-secret-0123456789abcdef0123456789abcdef', 'sha256'), 'hex')
    from (select 'v1.' || p_purpose || '.' || p_phone || '.' || (extract(epoch from now())::bigint + p_secs)
                 || '.' || p_nonce as b) x
$$;

do $$
declare
  vik_ph text := '9000093001'; tara_ph text := '9000093002'; dev_ph text := '9000093003'; mona_ph text := '9000093004';
  gone_ph text := '9000093005'; nobody_ph text := '9000093006'; many_ph text := '9000093007';
  ga uuid; gb uuid; gc uuid; gd uuid; ge uuid; tara_staff uuid; gone_staff uuid; gx uuid;
  past text := to_char((now() at time zone 'Asia/Kolkata')::date - 60, 'YYYY-MM-DD');
  later text := to_char((now() at time zone 'Asia/Kolkata')::date + 25, 'YYYY-MM-DD');
  p text; r jsonb; fails text := ''; checks int := 0; i int;
begin
  delete from public.phone_code_settings;
  insert into public.phone_code_settings(secret) values ('test-secret-0123456789abcdef0123456789abcdef');

  insert into public.gyms(name, join_code, crm_version, brand_accent) values ('T93 Iron', 'T93AAA', 1, '#E11D48') returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T93 Beta', 'T93BBB', 1) returning gym_id into gb;
  insert into public.gyms(name, join_code, crm_version) values ('T93 Core', 'T93CCC', 1) returning gym_id into gc;
  insert into public.gyms(name, join_code, crm_version) values ('T93 Delta', 'T93DDD', 1) returning gym_id into gd;
  insert into public.gyms(name, join_code, crm_version) values ('T93 Paused', 'T93EEE', 1) returning gym_id into ge;

  -- Vik: the owner of Iron, AND a member with a running plan at Iron (one line: owner) and at Delta (member).
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Vik Shah', vik_ph, 'owner');
  -- Tara: desk staff at Beta with the Trainer tick (trainer); desk staff at Core without it (desk).
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Tara Iyer', tara_ph, 'staff') returning staff_id into tara_staff;
  insert into public.gym_trainers(staff_id, gym_id) values (tara_staff, gb);
  insert into public.gym_staff(gym_id, name, phone, role) values (gc, 'Tara I', tara_ph, 'staff');
  -- Dev: desk staff at Paused (suspended below: never listed).
  insert into public.gym_staff(gym_id, name, phone, role) values (ge, 'Dev Rao', dev_ph, 'staff');
  -- Gone: removed from Core's people (never listed).
  insert into public.gym_staff(gym_id, name, phone, role) values (gc, 'Gopal', gone_ph, 'staff') returning staff_id into gone_staff;
  update public.gym_staff set removed_at = now() where staff_id = gone_staff;

  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'member', 't93-vik-a', jsonb_build_object('fullName', 'Vik Shah', 'phone', '+91' || vik_ph), 1),
    (ga, 'membership', 't93-vik-a-m', jsonb_build_object('memberId', 't93-vik-a', 'startsOn', past, 'endsOn', later, 'cancelled', false, 'planName', 'Monthly', 'price', 150000), 1),
    (gd, 'member', 't93-vik-d', jsonb_build_object('fullName', 'vik', 'phone', vik_ph), 1),
    (gd, 'membership', 't93-vik-d-m', jsonb_build_object('memberId', 't93-vik-d', 'startsOn', past, 'endsOn', later, 'cancelled', false, 'price', 99900), 1),
    -- Mona: a member at Delta with a running plan; another member of Delta (Ravi) must never show up.
    (gd, 'member', 't93-mona', jsonb_build_object('fullName', 'Mona Das', 'phone', mona_ph), 1),
    (gd, 'membership', 't93-mona-m', jsonb_build_object('memberId', 't93-mona', 'startsOn', past, 'endsOn', later, 'cancelled', false), 1),
    (gd, 'member', 't93-ravi', jsonb_build_object('fullName', 'Ravi Kumar', 'phone', '9000093099'), 1),
    (gd, 'membership', 't93-ravi-m', jsonb_build_object('memberId', 't93-ravi', 'startsOn', past, 'endsOn', later, 'cancelled', false), 1);

  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = ge;
  perform set_config('forgeai.hq', 'off', true);

  -- 1. Vik's own proof: Iron as owner (first), Delta as member (plan end); one line per gym.
  p := pg_temp.t93_proof('member', vik_ph, repeat('1', 32));
  r := public.phone_sign_in_find(p, 'Vik');
  checks := checks + 1; fails := fails || pg_temp.t93_is('1ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t93_is('1n', jsonb_array_length(r->'matches')::text, '2');
  checks := checks + 1; fails := fails || pg_temp.t93_is('1first', r->'matches'->0->>'gymName', 'T93 Iron');
  checks := checks + 1; fails := fails || pg_temp.t93_is('1role', r->'matches'->0->>'role', 'owner');
  checks := checks + 1; fails := fails || pg_temp.t93_is('1code', r->'matches'->0->>'joinCode', 'T93AAA');
  checks := checks + 1; fails := fails || pg_temp.t93_is('1ownerends', r->'matches'->0->>'endsOn', null);
  checks := checks + 1; fails := fails || pg_temp.t93_is('1brand', r->'matches'->0->'brand'->>'accent', '#E11D48');
  checks := checks + 1; fails := fails || pg_temp.t93_is('1second', r->'matches'->1->>'gymName', 'T93 Delta');
  checks := checks + 1; fails := fails || pg_temp.t93_is('1member', r->'matches'->1->>'role', 'member');
  checks := checks + 1; fails := fails || pg_temp.t93_is('1ends', r->'matches'->1->>'endsOn', later);
  checks := checks + 1; fails := fails || pg_temp.t93_is('1pass', r->'matches'->1->>'pass', 'false');
  -- Nothing about money, visits, other members or other people of the gym is in the answer.
  checks := checks + 1; fails := fails || pg_temp.t93_is('1nomoney', (r::text ~* 'price|paise|due|visit|150000|99900')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t93_is('1noothers', (r::text ~* 'Mona|Ravi|Tara|9000093')::text, 'false');
  -- Looking does not use the proof up.
  checks := checks + 1; fails := fails || pg_temp.t93_is('1unused',
    (select count(*) from public.phone_proofs_used where nonce = repeat('1', 32))::text, '0');

  -- 2. Tara: trainer at Beta (the Trainer tick), desk staff at Core; staff need no first-name match.
  r := public.phone_sign_in_find(pg_temp.t93_proof('member', tara_ph, repeat('2', 32)), 'Someone');
  checks := checks + 1; fails := fails || pg_temp.t93_is('2n', jsonb_array_length(r->'matches')::text, '2');
  checks := checks + 1; fails := fails || pg_temp.t93_is('2trainer', (r->'matches'->0->>'gymName') || '/' || (r->'matches'->0->>'role'), 'T93 Beta/trainer');
  checks := checks + 1; fails := fails || pg_temp.t93_is('2desk', (r->'matches'->1->>'gymName') || '/' || (r->'matches'->1->>'role'), 'T93 Core/desk');
  checks := checks + 1; fails := fails || pg_temp.t93_is('2nobrand', r->'matches'->1->'brand'->>'accent', null);

  -- 3. A member: the first name must match (a recycled number shows no gym); no name skips members only.
  r := public.phone_sign_in_find(pg_temp.t93_proof('member', mona_ph, repeat('3', 32)), 'Mona');
  checks := checks + 1; fails := fails || pg_temp.t93_is('3mona', (r->'matches'->0->>'gymName') || '/' || (r->'matches'->0->>'role'), 'T93 Delta/member');
  r := public.phone_sign_in_find(pg_temp.t93_proof('member', mona_ph, repeat('4', 32)), 'Rahul');
  checks := checks + 1; fails := fails || pg_temp.t93_is('3othername', jsonb_array_length(r->'matches')::text, '0');
  r := public.phone_sign_in_find(pg_temp.t93_proof('member', mona_ph, repeat('5', 32)), '  ');
  checks := checks + 1; fails := fails || pg_temp.t93_is('3noname', jsonb_array_length(r->'matches')::text, '0');
  r := public.phone_sign_in_find(pg_temp.t93_proof('member', vik_ph, repeat('6', 32)), null);
  checks := checks + 1; fails := fails || pg_temp.t93_is('3nonamestaff', (jsonb_array_length(r->'matches')::text) || '/' || (r->'matches'->0->>'role'), '1/owner');

  -- 4. Never listed: a suspended gym's staff, a removed person, an unknown number.
  r := public.phone_sign_in_find(pg_temp.t93_proof('member', dev_ph, repeat('7', 32)), 'Dev');
  checks := checks + 1; fails := fails || pg_temp.t93_is('4suspended', jsonb_array_length(r->'matches')::text, '0');
  r := public.phone_sign_in_find(pg_temp.t93_proof('member', gone_ph, repeat('8', 32)), 'Gopal');
  checks := checks + 1; fails := fails || pg_temp.t93_is('4removed', jsonb_array_length(r->'matches')::text, '0');
  r := public.phone_sign_in_find(pg_temp.t93_proof('member', nobody_ph, repeat('9', 32)), 'Asha');
  checks := checks + 1; fails := fails || pg_temp.t93_is('4nobody', r::text, '{"ok": true, "matches": []}');

  -- 5. Proofs that must fail: another purpose, a wrong signature, expired, a typed number with no proof.
  r := public.phone_sign_in_find(pg_temp.t93_proof('pin', vik_ph, repeat('a', 32)), 'Vik');
  checks := checks + 1; fails := fails || pg_temp.t93_is('5purpose', r->>'error', 'BAD_PROOF');
  r := public.phone_sign_in_find('v1.member.' || vik_ph || '.' || (extract(epoch from now())::bigint + 900) || '.' || repeat('b', 32) || '.' || repeat('0', 64), 'Vik');
  checks := checks + 1; fails := fails || pg_temp.t93_is('5sig', r->>'error', 'BAD_PROOF');
  r := public.phone_sign_in_find(pg_temp.t93_proof('member', vik_ph, repeat('c', 32), -5), 'Vik');
  checks := checks + 1; fails := fails || pg_temp.t93_is('5expired', r->>'error', 'BAD_PROOF');
  r := public.phone_sign_in_find(vik_ph, 'Vik');
  checks := checks + 1; fails := fails || pg_temp.t93_is('5typed', r->>'error', 'BAD_PROOF');
  -- A used-up proof (after member_claim_phone) answers nothing.
  insert into public.phone_proofs_used(nonce, purpose) values (repeat('d', 32), 'member');
  r := public.phone_sign_in_find(pg_temp.t93_proof('member', vik_ph, repeat('d', 32)), 'Vik');
  checks := checks + 1; fails := fails || pg_temp.t93_is('5used', r->>'error', 'BAD_PROOF');

  -- 6. At most 5 searches per proof, shared with 0068's member_find_gyms (proof 1 has used 1).
  for i in 1..3 loop perform public.phone_sign_in_find(p, 'Vik'); end loop;
  perform public.member_find_gyms(p, 'Vik');
  r := public.phone_sign_in_find(p, 'Vik');
  checks := checks + 1; fails := fails || pg_temp.t93_is('6many', r->>'error', 'TOO_MANY');
  r := public.member_find_gyms(p, 'Vik');
  checks := checks + 1; fails := fails || pg_temp.t93_is('6many0068', r->>'error', 'TOO_MANY');

  -- 7. At most 5 gyms for one number.
  for i in 1..7 loop
    insert into public.gyms(name, join_code, crm_version) values ('T93 Many ' || i, 'T93M0' || i, 1) returning gym_id into gx;
    insert into public.gym_staff(gym_id, name, phone, role) values (gx, 'Many', many_ph, 'staff');
  end loop;
  r := public.phone_sign_in_find(pg_temp.t93_proof('member', many_ph, repeat('e', 32)), 'Many');
  checks := checks + 1; fails := fails || pg_temp.t93_is('7five', jsonb_array_length(r->'matches')::text, '5');

  -- 8. Callable without signing in (it checks the proof itself); the tries table stays closed.
  checks := checks + 1; fails := fails || pg_temp.t93_is('8anon',
    has_function_privilege('anon', 'public.phone_sign_in_find(text, text)', 'execute')::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t93_is('8table',
    has_table_privilege('anon', 'public.member_find_tries', 'select')::text, 'false');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
