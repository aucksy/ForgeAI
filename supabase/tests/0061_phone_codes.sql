-- Sign-in codes by WhatsApp test (0061, F187). Runs in CI after every migration (scripts/ci/db_checks.sh); can
-- also be pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed.
-- Fake numbers only (90000 0xxxx); the secret here is a test value.
do $$
declare
  sec text := 'test-secret-0123456789abcdef0123456789abcdef';
  owner_ph text := '9000061001'; desk_ph text := '9000061002'; nobody_ph text := '9000061003'; new_ph text := '9000061004';
  gid uuid; gid2 uuid; s_owner uuid; s_owner2 uuid; s_desk uuid;
  now_s bigint := extract(epoch from now())::bigint;
  r jsonb; ok boolean; err text; p text; body text; g public.gyms; n int;
  fails text := ''; checks int := 0;
begin
  delete from public.phone_code_settings;

  insert into public.gyms(name, join_code) values ('PC61 Gym', 'PC61A1') returning gym_id into gid;
  insert into public.gyms(name, join_code) values ('PC61 Other', 'PC61B1') returning gym_id into gid2;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner Pc', owner_ph, 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid2, 'Owner Pc', owner_ph, 'owner') returning staff_id into s_owner2;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Desk Pc', desk_ph, 'staff') returning staff_id into s_desk;
  insert into public.gym_staff_pins(staff_id, pin_hash, wrong_tries, locked_until)
    values (s_owner, extensions.crypt('482913', extensions.gen_salt('bf', 4)), 0, now() + interval '10 minutes');

  -- 1. No settings row yet: the account check says NOT_READY, and every proof is refused.
  begin
    perform public.phone_code_has_account(owner_ph, now_s, repeat('0', 64));
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'NOT_READY' then fails := fails || ' 1a:' || err; end if;

  insert into public.phone_code_settings(secret) values (sec);

  -- 2. The account check: only with the Worker's signature, made in the last 5 minutes.
  ok := public.phone_code_has_account(owner_ph, now_s, encode(extensions.hmac('exists.' || owner_ph || '.' || now_s, sec, 'sha256'), 'hex'));
  checks := checks + 1;
  if ok is not true then fails := fails || ' 2a'; end if;
  ok := public.phone_code_has_account('+91 ' || nobody_ph, now_s, encode(extensions.hmac('exists.' || nobody_ph || '.' || now_s, sec, 'sha256'), 'hex'));
  checks := checks + 1;
  if ok is not false then fails := fails || ' 2b'; end if;
  begin
    perform public.phone_code_has_account(owner_ph, now_s, encode(extensions.hmac('exists.' || owner_ph || '.' || now_s, 'wrong-secret-0123456789abcdef0123', 'sha256'), 'hex'));
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'BAD_SIG' then fails := fails || ' 2c:' || err; end if;
  begin
    perform public.phone_code_has_account(owner_ph, now_s - 400, encode(extensions.hmac('exists.' || owner_ph || '.' || (now_s - 400), sec, 'sha256'), 'hex'));
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'BAD_SIG' then fails := fails || ' 2d:' || err; end if;

  -- 3. Forgot PIN with a good 'pin' proof: every row of that number gets the PIN; lock and tries cleared.
  body := 'v1.pin.' || owner_ph || '.' || (now_s + 900) || '.' || repeat('a', 32);
  p := body || '.' || encode(extensions.hmac(body, sec, 'sha256'), 'hex');
  -- A weak PIN is refused and does NOT use up the proof.
  r := public.staff_reset_pin_with_proof(p, '123456');
  checks := checks + 1;
  if r->>'error' is distinct from 'WEAK_PIN' then fails := fails || ' 3a:' || r::text; end if;
  r := public.staff_reset_pin_with_proof(p, '730591');
  checks := checks + 1;
  if r->>'ok' is distinct from 'true' or (r->>'people')::int <> 2 then fails := fails || ' 3b:' || r::text; end if;
  select count(*) into n from public.gym_staff_pins
   where staff_id in (s_owner, s_owner2) and pin_hash = extensions.crypt('730591', pin_hash) and locked_until is null and wrong_tries = 0;
  checks := checks + 1;
  if n <> 2 then fails := fails || ' 3c:' || n; end if;
  -- The desk person's PIN is untouched.
  checks := checks + 1;
  if exists (select 1 from public.gym_staff_pins where staff_id = s_desk) then fails := fails || ' 3d'; end if;
  -- And the new PIN signs in.
  r := public.staff_sign_in(owner_ph, '730591', null);
  checks := checks + 1;
  if r->>'via' is distinct from 'pin' then fails := fails || ' 3e:' || r::text; end if;

  -- 4. A proof works once; a changed, expired, too long-lived or other-purpose proof never.
  r := public.staff_reset_pin_with_proof(p, '730592');
  checks := checks + 1;
  if r->>'error' is distinct from 'BAD_PROOF' then fails := fails || ' 4a:' || r::text; end if;
  body := 'v1.pin.' || desk_ph || '.' || (now_s + 900) || '.' || repeat('b', 32);
  r := public.staff_reset_pin_with_proof(body || '.' || encode(extensions.hmac('v1.pin.' || owner_ph || '.' || (now_s + 900) || '.' || repeat('b', 32), sec, 'sha256'), 'hex'), '730593');
  checks := checks + 1;
  if r->>'error' is distinct from 'BAD_PROOF' then fails := fails || ' 4b:' || r::text; end if;
  body := 'v1.pin.' || desk_ph || '.' || (now_s - 1) || '.' || repeat('c', 32);
  r := public.staff_reset_pin_with_proof(body || '.' || encode(extensions.hmac(body, sec, 'sha256'), 'hex'), '730594');
  checks := checks + 1;
  if r->>'error' is distinct from 'BAD_PROOF' then fails := fails || ' 4c:' || r::text; end if;
  body := 'v1.pin.' || desk_ph || '.' || (now_s + 3600) || '.' || repeat('d', 32);
  r := public.staff_reset_pin_with_proof(body || '.' || encode(extensions.hmac(body, sec, 'sha256'), 'hex'), '730595');
  checks := checks + 1;
  if r->>'error' is distinct from 'BAD_PROOF' then fails := fails || ' 4d:' || r::text; end if;
  body := 'v1.signup.' || desk_ph || '.' || (now_s + 900) || '.' || repeat('e', 32);
  r := public.staff_reset_pin_with_proof(body || '.' || encode(extensions.hmac(body, sec, 'sha256'), 'hex'), '730596');
  checks := checks + 1;
  if r->>'error' is distinct from 'BAD_PROOF' then fails := fails || ' 4e:' || r::text; end if;
  r := public.staff_reset_pin_with_proof('anything', '730597');
  checks := checks + 1;
  if r->>'error' is distinct from 'BAD_PROOF' then fails := fails || ' 4f:' || r::text; end if;
  -- A number with no account: NO_PERSON, nothing made.
  body := 'v1.pin.' || nobody_ph || '.' || (now_s + 900) || '.' || repeat('f', 32);
  r := public.staff_reset_pin_with_proof(body || '.' || encode(extensions.hmac(body, sec, 'sha256'), 'hex'), '730598');
  checks := checks + 1;
  if r->>'error' is distinct from 'NO_PERSON' then fails := fails || ' 4g:' || r::text; end if;

  -- 5. Create my gym: without a proof (switch off) exactly as before, with a free trial.
  r := public.gym_create_online('PC61 Plain', 'Plain Owner', '9000061005', null, null, '730599');
  select * into g from public.gyms where gym_id = (r->>'gymId')::uuid;
  checks := checks + 1;
  if r->>'phoneChecked' <> 'false' or r->>'freeTrial' <> 'true' or g.trial_ends_at < now() + interval '80 days' then fails := fails || ' 5a:' || r::text; end if;

  -- 6. With a 'signup' proof for a new number: free trial, and the number is remembered.
  body := 'v1.signup.' || new_ph || '.' || (now_s + 900) || '.' || repeat('1', 32);
  r := public.gym_create_online('PC61 Checked', 'New Owner', new_ph, null, null, '730599', body || '.' || encode(extensions.hmac(body, sec, 'sha256'), 'hex'));
  select * into g from public.gyms where gym_id = (r->>'gymId')::uuid;
  checks := checks + 1;
  if r->>'phoneChecked' <> 'true' or r->>'freeTrial' <> 'true' or g.trial_ends_at < now() + interval '80 days'
     or not exists (select 1 from public.trial_phones where phone = new_ph and gym_id = g.gym_id) then
    fails := fails || ' 6a:' || r::text;
  end if;
  -- 7. The same number again (a new proof): no second free trial.
  body := 'v1.signup.' || new_ph || '.' || (now_s + 900) || '.' || repeat('2', 32);
  r := public.gym_create_online('PC61 Again', 'New Owner', new_ph, null, null, '730599', body || '.' || encode(extensions.hmac(body, sec, 'sha256'), 'hex'));
  select * into g from public.gyms where gym_id = (r->>'gymId')::uuid;
  checks := checks + 1;
  if r->>'freeTrial' <> 'false' or g.trial_ends_at > now() then fails := fails || ' 7a:' || r::text; end if;
  -- An existing owner's number that never checked before: no free trial either.
  body := 'v1.signup.' || owner_ph || '.' || (now_s + 900) || '.' || repeat('3', 32);
  r := public.gym_create_online('PC61 Owner2', 'Owner Pc', owner_ph, null, null, null, body || '.' || encode(extensions.hmac(body, sec, 'sha256'), 'hex'));
  checks := checks + 1;
  if r->>'freeTrial' <> 'false' then fails := fails || ' 7b:' || r::text; end if;

  -- 8. A proof for another number, a used proof, or a 'pin' proof: PHONE_CHECK, no gym made.
  select count(*) into n from public.gyms;
  body := 'v1.signup.' || new_ph || '.' || (now_s + 900) || '.' || repeat('4', 32);
  begin
    perform public.gym_create_online('PC61 Bad', 'Someone', '9000061006', null, null, null, body || '.' || encode(extensions.hmac(body, sec, 'sha256'), 'hex'));
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'PHONE_CHECK' then fails := fails || ' 8a:' || err; end if;
  body := 'v1.signup.' || new_ph || '.' || (now_s + 900) || '.' || repeat('2', 32);
  begin
    perform public.gym_create_online('PC61 Bad', 'New Owner', new_ph, null, null, null, body || '.' || encode(extensions.hmac(body, sec, 'sha256'), 'hex'));
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'PHONE_CHECK' then fails := fails || ' 8b:' || err; end if;
  body := 'v1.pin.' || '9000061007' || '.' || (now_s + 900) || '.' || repeat('5', 32);
  begin
    perform public.gym_create_online('PC61 Bad', 'Someone', '9000061007', null, null, null, body || '.' || encode(extensions.hmac(body, sec, 'sha256'), 'hex'));
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'PHONE_CHECK' then fails := fails || ' 8c:' || err; end if;

  -- 9. Switch on: no proof = PHONE_CHECK.
  update public.phone_code_settings set signup_check_required = true;
  begin
    perform public.gym_create_online('PC61 Bad', 'Someone', '9000061008', null, null, null, null);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'PHONE_CHECK' then fails := fails || ' 9a:' || err; end if;
  checks := checks + 1;
  if (select count(*) from public.gyms) <> n then fails := fails || ' 9b: a refused gym was made'; end if;

  -- 10. Nobody outside reads the secret, the proofs or the trial numbers; the helpers are not callable.
  checks := checks + 1;
  if has_table_privilege('anon', 'public.phone_code_settings', 'select') or has_table_privilege('authenticated', 'public.phone_code_settings', 'select')
     or has_table_privilege('anon', 'public.phone_proofs_used', 'select') or has_table_privilege('anon', 'public.trial_phones', 'select')
     or has_function_privilege('anon', 'public._phone_proof(text, text, boolean)', 'execute')
     or has_function_privilege('anon', 'public._phone_sig_ok(text, text)', 'execute') then
    fails := fails || ' 10';
  end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
