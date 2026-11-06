-- Pay MettleUp test (0060, T79). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be
-- pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed.
-- Every payment detail here is an obviously fake test value (test@upi, 000000000000, TEST0000000).
do $$
declare
  gid uuid; gid2 uuid; s_owner uuid; s_desk uuid;
  k_owner text := 'pm60-owner-session'; k_desk text := 'pm60-desk-session'; k_old text := 'pm60-old-owner-key';
  k_other text := 'pm60-other-gym';
  actor text := 'hq-test@example.com';
  r jsonb; r2 jsonb; p1 uuid; p2 uuid; p3 uuid; n int;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  want timestamptz; pu timestamptz;
  fails text := ''; checks int := 0; err text;
begin
  -- No real details can be in the table before this test (the CI database is fresh); keep what is there aside.
  delete from public.platform_payment_details;

  insert into public.gyms(name, join_code) values ('PM60 Gym', 'PM60A1') returning gym_id into gid;
  insert into public.gyms(name, join_code) values ('PM60 Other', 'PM60B1') returning gym_id into gid2;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Ownername Pay', '9876560001', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Deskname Pay', '9876560002', 'staff') returning staff_id into s_desk;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(k_owner)), (s_desk, public._hash_key(k_desk));
  insert into public.gym_owner_keys(gym_id, key_hash) values (gid, public._hash_key(k_old)), (gid2, public._hash_key(k_other));

  -- 1. No details yet: the owner gets payTo null and no payments; sending one is refused (NOT_OPEN).
  r := public.owner_pay_mettleup(k_owner);
  checks := checks + 1;
  if jsonb_typeof(r->'payTo') <> 'null' or r->'payments' <> '[]'::jsonb or r->>'gymCode' <> 'PM60A1' then fails := fails || ' 1:' || r::text; end if;
  begin
    perform public.owner_report_mettleup_payment(k_owner, 'pro', 'monthly', 149900, '123456789012', 'upi');
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'NOT_OPEN' then fails := fails || ' 1b:' || err; end if;

  -- 2. HQ saves the details (fake values); wrong ones are refused with their own word.
  begin
    perform public.hq_set_payment_details(actor, 'test@upi', 'Test Payee', 'Test Account', '000000000000', 'TEST000000', null);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'BAD_IFSC' then fails := fails || ' 2a:' || err; end if;
  begin
    perform public.hq_set_payment_details(actor, 'not-a-upi', 'Test Payee', null, null, null, null);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'BAD_UPI' then fails := fails || ' 2b:' || err; end if;
  begin
    perform public.hq_set_payment_details(actor, null, null, null, '000000000000', null, null);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'INCOMPLETE' then fails := fails || ' 2c:' || err; end if;
  r := public.hq_set_payment_details(actor, ' Test@UPI ', 'Test Payee', 'Test Account', '0000 0000 0000', 'test0000000', 'Test Bank');
  checks := checks + 1;
  if r->'details'->>'upiId' <> 'test@upi' or r->'details'->>'accountNumber' <> '000000000000' or r->'details'->>'ifsc' <> 'TEST0000000' then
    fails := fails || ' 2d:' || r::text;
  end if;
  -- The audit row names which parts are set, never the values.
  checks := checks + 1;
  if not exists (select 1 from public.hq_audit where action = 'set_pay_details' and hq_audit.actor = 'hq-test@example.com' and detail = '{"upi": true, "bank": true}'::jsonb)
     or exists (select 1 from public.hq_audit where action = 'set_pay_details' and detail::text like '%test@upi%') then
    fails := fails || ' 2e';
  end if;
  r := public.hq_payment_details(actor);
  checks := checks + 1;
  if r->'details'->>'payeeName' <> 'Test Payee' or r->>'updatedBy' <> actor then fails := fails || ' 2f:' || r::text; end if;

  -- 3. The owner reads them (session key and old owner key); the desk and a wrong key cannot.
  r := public.owner_pay_mettleup(k_owner);
  checks := checks + 1;
  if r->'payTo'->>'upiId' <> 'test@upi' or r->'payTo'->>'bankName' <> 'Test Bank' then fails := fails || ' 3a:' || r::text; end if;
  r := public.owner_pay_mettleup(k_old);
  checks := checks + 1;
  if r->'payTo'->>'ifsc' <> 'TEST0000000' then fails := fails || ' 3b:' || r::text; end if;
  begin
    perform public.owner_pay_mettleup(k_desk);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'OWNER_ONLY' then fails := fails || ' 3c:' || err; end if;
  begin
    perform public.owner_pay_mettleup('no-such-key');
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'BAD_KEY' then fails := fails || ' 3d:' || err; end if;

  -- 4. Sending a payment: wrong plan, method, reference and amount are refused; a good one is pending.
  foreach err in array array['ai|monthly|149900|123456789012|upi|BAD_PLAN', 'pro|weekly|149900|123456789012|upi|BAD_PLAN',
                             'pro|monthly|149900|123456789012|cash|BAD_INPUT', 'pro|monthly|149900|12-3|upi|BAD_REFERENCE',
                             'pro|monthly|149900|1234#5678901|upi|BAD_REFERENCE', 'pro|monthly|50|123456789012|upi|BAD_AMOUNT'] loop
    declare parts text[] := string_to_array(err, '|'); got text;
    begin
      begin
        perform public.owner_report_mettleup_payment(k_owner, parts[1], parts[2], parts[3]::int, parts[4], parts[5]);
        got := 'none';
      exception when others then got := sqlerrm; end;
      checks := checks + 1;
      if got <> parts[6] then fails := fails || ' 4:' || err || '=' || got; end if;
    end;
  end loop;
  r := public.owner_report_mettleup_payment(k_owner, 'pro', 'monthly', 149900, ' 1234 5678-9012 ', 'upi');
  p1 := (r->>'id')::uuid;
  checks := checks + 1;
  if r->>'status' <> 'pending' or r->>'reference' <> '123456789012' or (r->>'pricePaise')::int <> 149900 or r->>'plan' <> 'pro' then
    fails := fails || ' 4b:' || r::text;
  end if;
  checks := checks + 1;
  if (select reported_by from public.mettleup_payments where payment_id = p1) <> 'Ownername Pay' then fails := fails || ' 4c'; end if;
  -- The same reference again: refused.
  begin
    perform public.owner_report_mettleup_payment(k_old, 'pro', 'monthly', 149900, '123456789012', 'upi');
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'DUPLICATE_REFERENCE' then fails := fails || ' 4d:' || err; end if;

  -- 5. HQ's list: the pending payment with its gym and the date it would extend to.
  r := public.hq_mettleup_payments(actor, 'pending');
  want := ((today + interval '1 month')::date + time '23:59:59') at time zone 'Asia/Kolkata';
  checks := checks + 1;
  if jsonb_array_length(r) <> 1 or r->0->>'gymName' <> 'PM60 Gym' or r->0->>'gymCode' <> 'PM60A1'
     or (r->0->>'extendsTo')::timestamptz <> want then
    fails := fails || ' 5a:' || r::text;
  end if;
  checks := checks + 1;
  if public.hq_mettleup_payments_waiting(actor) <> 1 then fails := fails || ' 5b'; end if;
  begin
    perform public.hq_mettleup_payments(actor, 'weird');
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'INVALID' then fails := fails || ' 5c:' || err; end if;

  -- 6. Confirm: no paid-until yet, so today (India) + 1 month, end of that day; the plan is set.
  r := public.hq_confirm_mettleup_payment(actor, p1, 'Seen in the bank');
  checks := checks + 1;
  if r->>'status' <> 'confirmed' or (r->>'paidUntil')::timestamptz <> want then fails := fails || ' 6a:' || r::text; end if;
  checks := checks + 1;
  if (select plan || '/' || billing from public.gyms where gym_id = gid) <> 'pro/monthly'
     or (select paid_until from public.gyms where gym_id = gid) <> want then
    fails := fails || ' 6b';
  end if;
  checks := checks + 1;
  if not exists (select 1 from public.hq_audit where action = 'confirm_payment' and gym_id = gid and reason = 'Seen in the bank') then
    fails := fails || ' 6c';
  end if;
  begin
    perform public.hq_confirm_mettleup_payment(actor, p1, null);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'NOT_PENDING' then fails := fails || ' 6d:' || err; end if;
  begin
    perform public.hq_confirm_mettleup_payment(actor, gen_random_uuid(), null);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'GONE' then fails := fails || ' 6e:' || err; end if;

  -- 7. A yearly Starter payment while paid until next month: 12 months on from THAT day, not from today.
  r := public.owner_report_mettleup_payment(k_owner, 'starter', 'yearly', 999000, 'UTRNEFT00000000001', 'bank');
  p2 := (r->>'id')::uuid;
  r := public.hq_confirm_mettleup_payment(actor, p2, null);
  pu := ((((want at time zone 'Asia/Kolkata')::date + interval '12 months')::date) + time '23:59:59') at time zone 'Asia/Kolkata';
  checks := checks + 1;
  -- Since 0063 a Starter payment made while Pro is still paid for starts when the Pro days end (the gym
  -- stays Pro until then; 0063's own test checks the switch), so either plan word is right here.
  if (r->>'paidUntil')::timestamptz <> pu
     or (select plan || '/' || billing from public.gyms where gym_id = gid) not in ('starter/yearly', 'pro/yearly') then
    fails := fails || ' 7:' || r::text;
  end if;

  -- 8. Reject: a reason is needed; the owner then reads it; that reference may be sent again.
  r := public.owner_report_mettleup_payment(k_owner, 'pro', 'monthly', 100000, '999988887777', 'upi');
  p3 := (r->>'id')::uuid;
  begin
    perform public.hq_reject_mettleup_payment(actor, p3, ' ');
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'NEED_REASON' then fails := fails || ' 8a:' || err; end if;
  r := public.hq_reject_mettleup_payment(actor, p3, 'No payment with this reference arrived');
  checks := checks + 1;
  if r->>'status' <> 'rejected' then fails := fails || ' 8b:' || r::text; end if;
  r := public.owner_pay_mettleup(k_owner);
  checks := checks + 1;
  if r->'payments'->0->>'status' <> 'rejected' or r->'payments'->0->>'rejectReason' <> 'No payment with this reference arrived'
     or jsonb_array_length(r->'payments') <> 3 then
    fails := fails || ' 8c:' || r::text;
  end if;
  r := public.owner_report_mettleup_payment(k_owner, 'pro', 'monthly', 149900, '999988887777', 'upi');
  checks := checks + 1;
  if r->>'status' <> 'pending' then fails := fails || ' 8d:' || r::text; end if;

  -- 9. At most 3 waiting at once.
  perform public.owner_report_mettleup_payment(k_owner, 'pro', 'monthly', 149900, '111122223333', 'upi');
  perform public.owner_report_mettleup_payment(k_owner, 'pro', 'monthly', 149900, '111122224444', 'upi');
  begin
    perform public.owner_report_mettleup_payment(k_owner, 'pro', 'monthly', 149900, '111122225555', 'upi');
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'TOO_MANY' then fails := fails || ' 9:' || err; end if;

  -- 10. Another gym never sees this gym's payments.
  r := public.owner_pay_mettleup(k_other);
  checks := checks + 1;
  if r->'payments' <> '[]'::jsonb or r->>'gymCode' <> 'PM60B1' then fails := fails || ' 10:' || r::text; end if;

  -- 11. A lifetime gym is never extended.
  r := public.owner_report_mettleup_payment(k_other, 'pro', 'yearly', 1499000, '555566667777', 'upi');
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set plan = 'pro', billing = 'lifetime', paid_until = null where gym_id = gid2;
  perform set_config('forgeai.hq', 'off', true);
  begin
    perform public.hq_confirm_mettleup_payment(actor, (r->>'id')::uuid, null);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'LIFETIME' then fails := fails || ' 11:' || err; end if;

  -- 11b. Every confirm went through the ledger (source 'manual'), linked from the payment.
  checks := checks + 1;
  if (select count(*) from public.gym_payment_ledger where gym_id = gid and source = 'manual') <> 2
     or not exists (select 1 from public.mettleup_payments m join public.gym_payment_ledger l on l.ledger_id = m.ledger_id
                     where m.payment_id = p1 and l.reference = '123456789012' and l.paid_until = want and l.applied_by = actor) then
    fails := fails || ' 11b';
  end if;

  -- 11c. A payment company's webhook (future) uses the same function: the same (source, reference) twice is
  --      applied once; the same reference from another source is another payment.
  r := public.apply_gym_payment(gid, 'pro', 'monthly', 'razorpay', 'pay_TEST000001', 149900);
  pu := (select paid_until from public.gyms where gym_id = gid);
  begin
    perform public.apply_gym_payment(gid, 'pro', 'monthly', 'razorpay', 'pay_TEST000001', 149900);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'ALREADY_APPLIED' or (select paid_until from public.gyms where gym_id = gid) <> pu
     or (r->>'paidUntil')::timestamptz <> pu or (select plan from public.gyms where gym_id = gid) <> 'pro' then
    fails := fails || ' 11c:' || err || ' ' || r::text;
  end if;
  r := public.apply_gym_payment(gid, 'pro', 'monthly', 'other_co', 'pay_TEST000001', 149900);
  checks := checks + 1;
  if (r->>'paidUntilBefore')::timestamptz <> pu then fails := fails || ' 11d:' || r::text; end if;
  begin
    perform public.apply_gym_payment(gid, 'pro', 'weekly', 'manual', 'x123456', 149900);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'BAD_PLAN' then fails := fails || ' 11e:' || err; end if;
  begin
    perform public.apply_gym_payment(gid, 'pro', 'monthly', 'Bad Source', 'x123456', 149900);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'BAD_SOURCE' then fails := fails || ' 11f:' || err; end if;
  checks := checks + 1;
  if has_function_privilege('anon', 'public.apply_gym_payment(uuid, text, text, text, text, int, text)', 'execute')
     or has_function_privilege('authenticated', 'public.apply_gym_payment(uuid, text, text, text, text, int, text)', 'execute')
     or not has_function_privilege('service_role', 'public.apply_gym_payment(uuid, text, text, text, text, int, text)', 'execute')
     or has_table_privilege('anon', 'public.gym_payment_ledger', 'select') then
    fails := fails || ' 11g';
  end if;

  -- 12. The extension maths: a lapsed paid-until counts from today; 31 Jan + 1 month = 28 Feb (India days).
  checks := checks + 1;
  if public._mettleup_extend('2020-01-01T00:00:00+05:30', 'monthly', '2027-03-10T12:00:00+05:30') <> '2027-04-10T23:59:59+05:30'::timestamptz
     or public._mettleup_extend('2027-01-31T23:59:59+05:30', 'monthly', '2027-01-20T09:00:00+05:30') <> '2027-02-28T23:59:59+05:30'::timestamptz
     or public._mettleup_extend(null, 'yearly', '2026-11-06T23:30:00+05:30') <> '2027-11-06T23:59:59+05:30'::timestamptz
     -- 19:00 UTC on 6 Nov is already 7 Nov in India.
     or public._mettleup_extend(null, 'monthly', '2026-11-06T19:00:00Z') <> '2026-12-07T23:59:59+05:30'::timestamptz then
    fails := fails || ' 12';
  end if;
  checks := checks + 1;
  if public._mettleup_price('starter', 'monthly') <> 99900 or public._mettleup_price('starter', 'yearly') <> 999000
     or public._mettleup_price('pro', 'monthly') <> 149900 or public._mettleup_price('pro', 'yearly') <> 1499000
     or public._mettleup_price('ai', 'monthly') is not null then
    fails := fails || ' 12b';
  end if;

  -- 13. Clearing the details: the owner is told "not available" again.
  perform public.hq_set_payment_details(actor, '', '', '', '', '', '');
  r := public.owner_pay_mettleup(k_owner);
  checks := checks + 1;
  if jsonb_typeof(r->'payTo') <> 'null' then fails := fails || ' 13:' || r::text; end if;

  -- 14. The doors: the owner functions are callable without signing in (they check the key); HQ's are not;
  --     nobody reads the tables directly.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.owner_pay_mettleup(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_report_mettleup_payment(text, text, text, int, text, text)', 'execute')
     or has_function_privilege('anon', 'public.hq_confirm_mettleup_payment(text, uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.hq_set_payment_details(text, text, text, text, text, text, text)', 'execute')
     or not has_function_privilege('service_role', 'public.hq_payment_details(text)', 'execute')
     or has_function_privilege('anon', 'public._mettleup_extend(timestamptz, text, timestamptz)', 'execute')
     or has_table_privilege('anon', 'public.platform_payment_details', 'select')
     or has_table_privilege('authenticated', 'public.platform_payment_details', 'select')
     or has_table_privilege('anon', 'public.mettleup_payments', 'select') then
    fails := fails || ' 14';
  end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
