-- "Phone number sign-in also backs up workouts" test (0099, F237, R-627). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes
-- nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- Fake numbers only (90000 99xxx); the secret here is a test value.

create or replace function pg_temp.t99_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

create or replace function pg_temp.t99_proof(p_purpose text, p_phone text, p_nonce text, p_secs int default 900) returns text
  language sql as $$
  select b || '.' || encode(extensions.hmac(b, 'test-secret-0123456789abcdef0123456789abcdef', 'sha256'), 'hex')
    from (select 'v1.' || p_purpose || '.' || p_phone || '.' || (extract(epoch from now())::bigint + p_secs)
                 || '.' || p_nonce as b) x
$$;

-- An auth account as the Edge Function makes it (admin createUser), with when it was last used.
create or replace function pg_temp.t99_user(p_email text, p_name_key text, p_days_ago int) returns uuid
  language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, raw_app_meta_data, created_at, updated_at, last_sign_in_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
          jsonb_build_object('via', 'phone', 'name_key', p_name_key),
          now() - make_interval(days => p_days_ago), now() - make_interval(days => p_days_ago),
          now() - make_interval(days => p_days_ago));
  return v;
end $$;

do $$
declare
  asha_ph text := '9000099001'; old_ph text := '9000099002'; kept_ph text := '9000099003'; copy_ph text := '9000099004';
  r jsonb; r2 jsonb; fails text := ''; checks int := 0; e1 text; uid uuid;
begin
  delete from public.phone_code_settings;
  insert into public.phone_code_settings(secret) values ('test-secret-0123456789abcdef0123456789abcdef');

  -- 1. A first sign-in: a new account to make, a made-up e-mail with no number in it.
  r := public.phone_account_pick(pg_temp.t99_proof('member', asha_ph, repeat('a', 32)), 'Asha Rao');
  checks := checks + 1; fails := fails || pg_temp.t99_is('1ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t99_is('1create', r->>'create', 'true');
  checks := checks + 1; fails := fails || pg_temp.t99_is('1fresh', r->>'fresh', 'true');
  checks := checks + 1; fails := fails || pg_temp.t99_is('1shape', ((r->>'email') ~ '^m-[0-9a-f]{40}@phone\.mettleup\.fit$')::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t99_is('1nonumber', (strpos(r->>'email', asha_ph) = 0)::text, 'true');
  e1 := r->>'email';

  -- 2. The same number again (another proof): the same account. Only the first word of the name counts, any case.
  r2 := public.phone_account_pick(pg_temp.t99_proof('member', asha_ph, repeat('b', 32)), '  asha ');
  checks := checks + 1; fails := fails || pg_temp.t99_is('2same', r2->>'email', e1);
  checks := checks + 1; fails := fails || pg_temp.t99_is('2namekey', r2->>'name_key', r->>'name_key');

  -- 3. The account exists and was used recently: reopened (not made again), whatever name is typed.
  uid := pg_temp.t99_user(e1, r->>'name_key', 3);
  r2 := public.phone_account_pick(pg_temp.t99_proof('member', asha_ph, repeat('c', 32)), 'Someone');
  checks := checks + 1; fails := fails || pg_temp.t99_is('3email', r2->>'email', e1);
  checks := checks + 1; fails := fails || pg_temp.t99_is('3create', r2->>'create', 'false');
  checks := checks + 1; fails := fails || pg_temp.t99_is('3fresh', r2->>'fresh', 'false');

  -- 4. Recycled number: unused for 120 days and ANOTHER first name -> a new account (-1); the old one stays locked.
  r := public.phone_account_pick(pg_temp.t99_proof('member', old_ph, repeat('d', 32)), 'Ravi');
  uid := pg_temp.t99_user(r->>'email', r->>'name_key', 120);
  r2 := public.phone_account_pick(pg_temp.t99_proof('member', old_ph, repeat('e', 32)), 'Meena');
  checks := checks + 1; fails := fails || pg_temp.t99_is('4new', ((r2->>'email') ~ '^m-[0-9a-f]{40}-1@phone\.mettleup\.fit$')::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t99_is('4create', r2->>'create', 'true');
  checks := checks + 1; fails := fails || pg_temp.t99_is('4fresh', r2->>'fresh', 'true');
  -- ... and once that new account exists, the new holder keeps getting it.
  uid := pg_temp.t99_user(r2->>'email', r2->>'name_key', 0);
  r := public.phone_account_pick(pg_temp.t99_proof('member', old_ph, repeat('f', 32)), 'Meena');
  checks := checks + 1; fails := fails || pg_temp.t99_is('4kept', r->>'email', r2->>'email');

  -- 5. Unused for 120 days, SAME first name: the old account comes back (a member who took a long break).
  r := public.phone_account_pick(pg_temp.t99_proof('member', kept_ph, repeat('1', 32)), 'Vik');
  uid := pg_temp.t99_user(r->>'email', r->>'name_key', 120);
  r2 := public.phone_account_pick(pg_temp.t99_proof('member', kept_ph, repeat('2', 32)), 'VIK Shah');
  checks := checks + 1; fails := fails || pg_temp.t99_is('5back', r2->>'email', r->>'email');
  checks := checks + 1; fails := fails || pg_temp.t99_is('5create', r2->>'create', 'false');

  -- 6. No sign-in for 120 days, but a copy saved 5 days ago: still in use, reopened whatever the name.
  r := public.phone_account_pick(pg_temp.t99_proof('member', copy_ph, repeat('3', 32)), 'Nina');
  uid := pg_temp.t99_user(r->>'email', r->>'name_key', 120);
  insert into public.member_items(member_id, kind, item_id, data, edited_at, saved_at)
    values (uid, 'w', 't99-w1', '[]', 1, now() - interval '5 days');
  r2 := public.phone_account_pick(pg_temp.t99_proof('member', copy_ph, repeat('4', 32)), 'Other');
  checks := checks + 1; fails := fails || pg_temp.t99_is('6inuse', r2->>'email', r->>'email');

  -- 7. Bad proofs and no name: refused, nothing told.
  r := public.phone_account_pick(pg_temp.t99_proof('pin', asha_ph, repeat('5', 32)), 'Asha');
  checks := checks + 1; fails := fails || pg_temp.t99_is('7purpose', r->>'error', 'BAD_PROOF');
  r := public.phone_account_pick(pg_temp.t99_proof('member', asha_ph, repeat('6', 32), -5), 'Asha');
  checks := checks + 1; fails := fails || pg_temp.t99_is('7expired', r->>'error', 'BAD_PROOF');
  r := public.phone_account_pick('v1.member.' || asha_ph || '.9999999999.' || repeat('7', 32) || '.' || repeat('0', 64), 'Asha');
  checks := checks + 1; fails := fails || pg_temp.t99_is('7forged', r->>'error', 'BAD_PROOF');
  r := public.phone_account_pick(pg_temp.t99_proof('member', asha_ph, repeat('8', 32)), '   ');
  checks := checks + 1; fails := fails || pg_temp.t99_is('7noname', r->>'error', 'NO_NAME');

  -- 8. The proof is only looked at: it still works for the gym afterwards (not in phone_proofs_used).
  checks := checks + 1; fails := fails || pg_temp.t99_is('8notused',
    (select count(*) from public.phone_proofs_used where nonce = repeat('a', 32))::text, '0');

  -- 9. Only the server may call it: never the app's own keys.
  checks := checks + 1; fails := fails || pg_temp.t99_is('9anon',
    has_function_privilege('anon', 'public.phone_account_pick(text, text)', 'execute')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t99_is('9auth',
    has_function_privilege('authenticated', 'public.phone_account_pick(text, text)', 'execute')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t99_is('9service',
    has_function_privilege('service_role', 'public.phone_account_pick(text, text)', 'execute')::text, 'true');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
