-- Billing gaps test (0064). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be pasted
-- into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed.
-- Every name, key, link and payment id here is a made-up test value.
-- Variable names never match a column name (a clash makes a query ambiguous).
do $$
declare
  g_one uuid; g_two uuid; k_one text := 't64-one-key'; k_two text := 't64-two-key';
  hq_who text := 'hq-test64@example.com';
  r jsonb; r2 jsonb; c_bad uuid; c_old uuid; c_open uuid; n_open int; err text;
  fails text := ''; checks int := 0;
begin
  perform set_config('forgeai.hq', 'on', true);
  insert into public.gyms(name, join_code, trial_starts_at, trial_ends_at)
    values ('T64 One', 'T64ON1', now() - interval '100 days', now() - interval '1 day') returning gym_id into g_one;
  insert into public.gyms(name, join_code, trial_starts_at, trial_ends_at)
    values ('T64 Two', 'T64TW1', now() - interval '100 days', now() - interval '1 day') returning gym_id into g_two;
  perform set_config('forgeai.hq', 'off', true);
  insert into public.gym_owner_keys(gym_id, key_hash) values (g_one, public._hash_key(k_one)), (g_two, public._hash_key(k_two));
  update public.app_config set value = '{"on": true}'::jsonb where key = 'billing_checkout';
  n_open := public.hq_billing_checks_waiting(hq_who);

  -- A payment of the wrong amount: kept, and now in "Payments to check".
  r := public.hq_billing_checkout_start(k_one, 'pro', 'monthly', 'razorpay');
  c_bad := (r->>'checkoutId')::uuid;
  perform public.hq_billing_checkout_link(c_bad, 'plink_T64BAD', 'https://rzp.io/i/t64bad');
  perform public.hq_billing_paid('razorpay', 'plink_T64BAD', 'pay_T64BAD1', 100, 'INR');

  -- 1. The list: gym, amounts, reason, date, payment id; the count for "Needs you"; an audit row.
  r := public.hq_billing_checks(hq_who, 'open');
  checks := checks + 1;
  if not exists (select 1 from jsonb_array_elements(r) e
                  where e->>'id' = c_bad::text and e->>'gymName' = 'T64 One' and e->>'gymCode' = 'T64ON1'
                    and (e->>'paidPaise')::int = 100 and (e->>'askedPaise')::int = 149900
                    and e->>'reason' = 'AMOUNT_MISMATCH' and e->>'paymentId' = 'pay_T64BAD1'
                    and e->>'paidAt' is not null and e->>'checkedAt' is null)
     or public.hq_billing_checks_waiting(hq_who) <> n_open + 1
     or not exists (select 1 from public.hq_audit a where a.action = 'view_billing_checks' and a.actor = hq_who) then
    fails := fails || ' 1:' || r::text;
  end if;

  -- 2. Refusals: no reason, a wrong choice, a checkout that is fine, no HQ person, an unknown list.
  begin perform public.hq_billing_check_done(hq_who, c_bad, 'refunded', 'x'); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'NEED_REASON' then fails := fails || ' 2a:' || err; end if;
  begin perform public.hq_billing_check_done(hq_who, c_bad, 'forgotten', 'Refund id rfnd_T64'); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'INVALID' then fails := fails || ' 2b:' || err; end if;
  r := public.hq_billing_checkout_start(k_two, 'starter', 'monthly', 'razorpay');
  c_open := (r->>'checkoutId')::uuid;
  perform public.hq_billing_checkout_link(c_open, 'plink_T64OPEN', 'https://rzp.io/i/t64open');
  begin perform public.hq_billing_check_done(hq_who, c_open, 'refunded', 'Refund id rfnd_T64'); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'NOT_TO_CHECK' then fails := fails || ' 2c:' || err; end if;
  begin perform public.hq_billing_check_done('not an email', c_bad, 'refunded', 'Refund id rfnd_T64'); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'NO_ACTOR' then fails := fails || ' 2d:' || err; end if;
  begin perform public.hq_billing_checks(hq_who, 'weird'); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'INVALID' then fails := fails || ' 2e:' || err; end if;

  -- 3. Marked refunded: one audit row with the reason; off the open list, on the done list; only once.
  r := public.hq_billing_check_done(hq_who, c_bad, 'refunded', 'Refund id rfnd_T64');
  checks := checks + 1;
  if r->>'checkedHow' <> 'refunded' or r->>'checkedBy' <> hq_who or r->>'checkedNote' <> 'Refund id rfnd_T64'
     or not exists (select 1 from public.hq_audit a where a.action = 'billing_refunded' and a.gym_id = g_one
                     and a.reason = 'Refund id rfnd_T64' and a.detail->>'paymentId' = 'pay_T64BAD1')
     or exists (select 1 from jsonb_array_elements(public.hq_billing_checks(hq_who, 'open')) e where e->>'id' = c_bad::text)
     or not exists (select 1 from jsonb_array_elements(public.hq_billing_checks(hq_who, 'done')) e where e->>'id' = c_bad::text)
     or public.hq_billing_checks_waiting(hq_who) <> n_open
     or exists (select 1 from public.gym_payment_ledger l where l.gym_id = g_one) then
    fails := fails || ' 3:' || r::text;
  end if;
  begin perform public.hq_billing_check_done(hq_who, c_bad, 'applied_by_hand', 'Set Pro by hand'); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'ALREADY_DONE' then fails := fails || ' 3b:' || err; end if;

  -- 4. Reconciliation's list: open links of that company from the last 48 hours, nothing else.
  r := public.hq_billing_checkout_start(k_one, 'starter', 'yearly', 'razorpay');
  c_old := (r->>'checkoutId')::uuid;
  perform public.hq_billing_checkout_link(c_old, 'plink_T64OLD', 'https://rzp.io/i/t64old');
  update public.gym_checkouts set created_at = now() - interval '3 days' where checkout_id = c_old;
  r := public.hq_billing_open_links('razorpay', now(), 48);
  checks := checks + 1;
  if not exists (select 1 from jsonb_array_elements(r) e where e->>'checkoutId' = c_open::text and e->>'linkId' = 'plink_T64OPEN'
                  and (e->>'amountPaise')::int = 99900 and e->>'currency' = 'INR')
     or exists (select 1 from jsonb_array_elements(r) e where e->>'checkoutId' in (c_old::text, c_bad::text))
     or exists (select 1 from jsonb_array_elements(public.hq_billing_open_links('cashfree', now(), 48)) e
                 where e->>'checkoutId' = c_open::text) then
    fails := fails || ' 4:' || r::text;
  end if;
  begin perform public.hq_billing_open_links('payu', now(), 48); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'BAD_PROVIDER' then fails := fails || ' 4b:' || err; end if;

  -- 5. A payment the reconciliation applies, then the late webhook: applied once, the second is a duplicate.
  r := public.hq_billing_paid('razorpay', 'plink_T64OPEN', 'pay_T64OK1', 99900, 'INR');
  r2 := public.hq_billing_paid('razorpay', 'plink_T64OPEN', 'pay_T64OK1', 99900, 'INR');
  checks := checks + 1;
  if not coalesce((r->>'applied')::boolean, false) or not coalesce((r2->>'duplicate')::boolean, false)
     or (select count(*) from public.gym_payment_ledger l where l.gym_id = g_two) <> 1
     or exists (select 1 from jsonb_array_elements(public.hq_billing_open_links('razorpay', now(), 48)) e
                 where e->>'checkoutId' = c_open::text) then
    fails := fails || ' 5:' || r::text || r2::text;
  end if;

  -- 6. HQ's manual list (0060, again in 0064 with the trial rule) still answers.
  checks := checks + 1;
  if jsonb_typeof(public.hq_mettleup_payments(hq_who, 'all')) <> 'array' then fails := fails || ' 6'; end if;

  -- 7. Doors: only the server key.
  checks := checks + 1;
  if has_function_privilege('anon', 'public.hq_billing_checks(text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.hq_billing_check_done(text, uuid, text, text)', 'execute')
     or has_function_privilege('anon', 'public.hq_billing_open_links(text, timestamptz, int)', 'execute')
     or has_function_privilege('anon', 'public.hq_billing_checks_waiting(text)', 'execute')
     or not has_function_privilege('service_role', 'public.hq_billing_check_done(text, uuid, text, text)', 'execute')
     or not has_function_privilege('service_role', 'public.hq_billing_open_links(text, timestamptz, int)', 'execute') then
    fails := fails || ' 7';
  end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
