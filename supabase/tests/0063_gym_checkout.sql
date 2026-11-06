-- Online buying test (0063, billing step 3). Runs in CI after every migration (scripts/ci/db_checks.sh); can
-- also be pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing (the switch it
-- turns on and the legal name it writes are undone with everything else):
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed.
-- Every name, phone, key, link and payment id here is a made-up test value.
-- Variable names never match a column name (a clash makes a query ambiguous).
do $$
declare
  g_new uuid; g_up uuid; g_down uuid; g_life uuid; g_rem uuid; g_f1 uuid; g_f2 uuid; s_own uuid; s_dsk uuid;
  g_tr uuid; g_tr2 uuid; k_tr text := 't63-trial-key'; tr_end timestamptz; tr_pu timestamptz;
  k_a text := 't63-owner-session'; k_desk text := 't63-desk-session'; k_up text := 't63-up-key'; k_down text := 't63-down-key';
  k_life text := 't63-life-key'; k_f1 text := 't63-f1-key'; k_f2 text := 't63-f2-key';
  today_ist date := (now() at time zone 'Asia/Kolkata')::date;
  pu_up timestamptz; pu_down timestamptz; pu_rem timestamptz; pu_after timestamptz;
  r jsonb; r2 jsonb; r_day jsonb; c_one uuid; c_two uuid; rno text; rno2 text; n_base int; n_rows int; err text;
  fails text := ''; checks int := 0;
begin
  pu_up   := ((today_ist + 14) + time '23:59:59') at time zone 'Asia/Kolkata';  -- 15 days left, today counted
  pu_down := ((today_ist + 10) + time '23:59:59') at time zone 'Asia/Kolkata';
  pu_rem  := ((today_ist + 7) + time '23:59:59') at time zone 'Asia/Kolkata';   -- ends in 7 days

  -- Setup as HQ (the plan and dates are HQ's alone).
  perform set_config('forgeai.hq', 'on', true);
  insert into public.gyms(name, join_code) values ('T63 New', 'T63NW1') returning gym_id into g_new;
  insert into public.gyms(name, join_code) values ('T63 Up', 'T63UP1') returning gym_id into g_up;
  insert into public.gyms(name, join_code) values ('T63 Down', 'T63DN1') returning gym_id into g_down;
  insert into public.gyms(name, join_code) values ('T63 Life', 'T63LF1') returning gym_id into g_life;
  insert into public.gyms(name, join_code) values ('T63 Remind', 'T63RM1') returning gym_id into g_rem;
  insert into public.gyms(name, join_code) values ('T63 Found1', 'T63F01') returning gym_id into g_f1;
  insert into public.gyms(name, join_code) values ('T63 Found2', 'T63F02') returning gym_id into g_f2;
  update public.gyms set plan = 'starter', billing = 'monthly', paid_until = pu_up where gym_id = g_up;
  update public.gyms set plan = 'pro', billing = 'monthly', paid_until = pu_down where gym_id = g_down;
  update public.gyms set plan = 'pro', billing = 'lifetime', paid_until = null where gym_id = g_life;
  update public.gyms set plan = 'pro', billing = 'monthly', paid_until = pu_rem where gym_id = g_rem;
  -- These gyms' free trials are over (a running trial is checked in 16).
  update public.gyms set trial_starts_at = now() - interval '100 days', trial_ends_at = now() - interval '1 day'
   where gym_id in (g_new, g_up, g_down, g_life, g_rem, g_f1, g_f2);
  -- Two gyms still on the free trial: it ends in 20 days.
  tr_end := ((today_ist + 20) + time '18:00:00') at time zone 'Asia/Kolkata';
  insert into public.gyms(name, join_code, trial_ends_at) values ('T63 Trial', 'T63TR1', tr_end) returning gym_id into g_tr;
  insert into public.gyms(name, join_code, trial_ends_at) values ('T63 Trial2', 'T63TR2', tr_end) returning gym_id into g_tr2;
  perform set_config('forgeai.hq', 'off', true);
  insert into public.gym_owner_keys(gym_id, key_hash) values (g_tr, public._hash_key(k_tr));
  insert into public.gym_staff(gym_id, name, phone, role) values (g_new, 'Owner Test', '9876563001', 'owner') returning staff_id into s_own;
  insert into public.gym_staff(gym_id, name, phone, role) values (g_new, 'Desk Test', '9876563002', 'staff') returning staff_id into s_dsk;
  insert into public.gym_sessions(staff_id, key_hash) values (s_own, public._hash_key(k_a)), (s_dsk, public._hash_key(k_desk));
  insert into public.gym_owner_keys(gym_id, key_hash) values (g_up, public._hash_key(k_up)), (g_down, public._hash_key(k_down)),
    (g_life, public._hash_key(k_life)), (g_f1, public._hash_key(k_f1)), (g_f2, public._hash_key(k_f2));
  update public.app_config set value = '{"legalName": "Test Legal Name", "address": null}'::jsonb where key = 'receipt_issuer';

  -- 1. The switch is OFF: no checkout; the owner's screen hears checkoutOn false.
  begin perform public.hq_billing_checkout_start(k_a, 'pro', 'monthly', 'razorpay'); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'NOT_OPEN' or (public.owner_billing(k_a)->>'checkoutOn')::boolean then fails := fails || ' 1:' || err; end if;
  update public.app_config set value = '{"on": true}'::jsonb where key = 'billing_checkout';

  -- 2. Refusals: the desk, Pro + AI, an unknown company, a lifetime gym.
  begin perform public.hq_billing_checkout_start(k_desk, 'pro', 'monthly', 'razorpay'); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'OWNER_ONLY' then fails := fails || ' 2a:' || err; end if;
  begin perform public.hq_billing_checkout_start(k_a, 'ai', 'monthly', 'razorpay'); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'BAD_PLAN' then fails := fails || ' 2b:' || err; end if;
  begin perform public.hq_billing_checkout_start(k_a, 'pro', 'monthly', 'payu'); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'BAD_PROVIDER' then fails := fails || ' 2c:' || err; end if;
  begin perform public.hq_billing_checkout_start(k_life, 'pro', 'yearly', 'razorpay'); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'LIFETIME' then fails := fails || ' 2d:' || err; end if;

  -- 3. A renewal: the price comes from the server's list; the owner's phone goes to the payment page.
  r := public.hq_billing_checkout_start(k_a, 'pro', 'monthly', 'razorpay');
  c_one := (r->>'checkoutId')::uuid;
  checks := checks + 1;
  if (r->>'amountPaise')::int <> 149900 or r->>'kind' <> 'renew' or r->>'phone' <> '9876563001' or r->>'currency' <> 'INR'
     or (r->>'reuse')::boolean or r->>'ref' !~ '^mu_[a-z0-9]{10,40}$' then
    fails := fails || ' 3:' || r::text;
  end if;
  perform public.hq_billing_checkout_link(c_one, 'plink_T63A', 'https://rzp.io/i/t63a');
  -- A double tap gets the same link back, not a second one.
  r2 := public.hq_billing_checkout_start(k_a, 'pro', 'monthly', 'razorpay');
  checks := checks + 1;
  if not (r2->>'reuse')::boolean or r2->>'linkUrl' <> 'https://rzp.io/i/t63a' or (r2->>'checkoutId')::uuid <> c_one then
    fails := fails || ' 3b:' || r2::text;
  end if;
  r := public.hq_billing_order('razorpay', 'plink_T63A');
  checks := checks + 1;
  if (r->>'amountPaise')::int <> 149900 or r->>'currency' <> 'INR' or r->>'status' <> 'open' then fails := fails || ' 3c:' || r::text; end if;
  begin perform public.hq_billing_order('razorpay', 'plink_NOT_OURS'); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'UNKNOWN_ORDER' then fails := fails || ' 3d:' || err; end if;

  -- 4. Wrong amount, then wrong currency: recorded, never applied.
  r := public.hq_billing_checkout_start(k_a, 'pro', 'yearly', 'razorpay');
  c_two := (r->>'checkoutId')::uuid;
  perform public.hq_billing_checkout_link(c_two, 'plink_T63Y', 'https://rzp.io/i/t63y');
  r := public.hq_billing_paid('razorpay', 'plink_T63Y', 'pay_T63BAD1', 100, 'INR');
  r2 := public.hq_billing_paid('razorpay', 'plink_T63Y', 'pay_T63BAD2', 1499000, 'USD');
  checks := checks + 1;
  if r->>'error' <> 'AMOUNT_MISMATCH' or r2->>'error' <> 'AMOUNT_MISMATCH'
     or (select x.status from public.gym_checkouts x where x.checkout_id = c_two) <> 'mismatch'
     or exists (select 1 from public.gym_payment_ledger l where l.gym_id = g_new)
     or (select x.plan from public.gyms x where x.gym_id = g_new) is not null then
    fails := fails || ' 4:' || r::text || r2::text;
  end if;

  -- 5. Paid: applied once, with a numbered receipt.
  r := public.hq_billing_paid('razorpay', 'plink_T63A', 'pay_T63OK1', 149900, 'inr');
  rno := r->>'receiptNo';
  checks := checks + 1;
  if not coalesce((r->>'applied')::boolean, false) or rno !~ '^MU-[0-9]{4}-[0-9]{4,7}$'
     or (select x.plan from public.gyms x where x.gym_id = g_new) <> 'pro'
     or (select x.billing from public.gyms x where x.gym_id = g_new) <> 'monthly'
     or (select x.paid_until from public.gyms x where x.gym_id = g_new) <> public._mettleup_extend(null, 'monthly', now())
     or (select x.status from public.gym_checkouts x where x.checkout_id = c_one) <> 'paid' then
    fails := fails || ' 5:' || r::text;
  end if;

  -- 6. The same webhook again (and again with the same payment): nothing changes.
  r := public.hq_billing_paid('razorpay', 'plink_T63A', 'pay_T63OK1', 149900, 'INR');
  r2 := public.hq_billing_paid('razorpay', 'plink_T63A', 'pay_T63OK1', 149900, 'INR');
  checks := checks + 1;
  if not coalesce((r->>'duplicate')::boolean, false) or not coalesce((r2->>'duplicate')::boolean, false)
     or (select count(*) from public.gym_payment_ledger l where l.gym_id = g_new) <> 1
     or (select count(*) from public.gym_receipts x where x.gym_id = g_new) <> 1
     or (select x.paid_until from public.gyms x where x.gym_id = g_new) <> public._mettleup_extend(null, 'monthly', now()) then
    fails := fails || ' 6:' || r::text;
  end if;

  -- 7. The receipt: MettleUp, the legal name from the settings row, the GST line; only for its own gym.
  r := public.owner_receipt(k_a, lower(rno));
  checks := checks + 1;
  if r->>'business' <> 'MettleUp' or r->>'legalName' <> 'Test Legal Name' or r->>'gstLine' <> 'Not registered under GST; no GST charged.'
     or (r->>'amountPaise')::int <> 149900 or r->>'paidVia' <> 'Razorpay' or r->>'reference' <> 'pay_T63OK1'
     or r->>'gymName' <> 'T63 New' or r->>'planName' <> 'Pro' then
    fails := fails || ' 7:' || r::text;
  end if;
  begin perform public.owner_receipt(k_up, rno); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'NOT_FOUND' then fails := fails || ' 7b:' || err; end if;
  checks := checks + 1;
  if jsonb_array_length(public.owner_billing(k_a)->'receipts') <> 1 then fails := fails || ' 7c'; end if;

  -- 8. HQ's manual confirm path (the 0060 form) gets the next receipt number.
  r := public.apply_gym_payment(g_new, 'pro', 'monthly', 'manual', 'UTR63TEST01', 149900);
  rno2 := r->>'receiptNo';
  checks := checks + 1;
  if split_part(rno2, '-', 2) <> split_part(rno, '-', 2) or split_part(rno2, '-', 3)::int <> split_part(rno, '-', 3)::int + 1
     or public.owner_receipt(k_a, rno2)->>'paidVia' <> 'UPI or bank transfer' then
    fails := fails || ' 8:' || coalesce(rno2, 'null');
  end if;

  -- 9. Proration: the difference per day for the days left, rounded up to a whole rupee.
  checks := checks + 1;
  if public._upgrade_paise('monthly', pu_up, now()) <> 25000
     or public._upgrade_paise('yearly', ((today_ist + 99) + time '23:59:59') at time zone 'Asia/Kolkata', now()) <> 137000
     or public._upgrade_paise('yearly', ((today_ist + 72) + time '23:59:59') at time zone 'Asia/Kolkata', now()) <> 100000
     or public._upgrade_paise('monthly', (today_ist + time '23:59:59') at time zone 'Asia/Kolkata', now()) <> 1700
     or public._upgrade_paise('monthly', now() - interval '1 hour', now()) is not null
     or public._days_left(pu_up, now()) <> 15 then
    fails := fails || ' 9:' || coalesce(public._upgrade_paise('monthly', pu_up, now())::text, 'null');
  end if;

  -- 10. Upgrade Starter -> Pro mid-period: only the difference; Pro at once; the paid-until does not move.
  r := public.owner_billing(k_up);
  checks := checks + 1;
  if (r->'upgrade'->>'amountPaise')::int <> 25000 or (r->'upgrade'->>'daysLeft')::int <> 15 then fails := fails || ' 10a:' || r::text; end if;
  r := public.hq_billing_checkout_start(k_up, 'pro', 'yearly', 'razorpay');  -- the gym is monthly: the upgrade stays monthly
  checks := checks + 1;
  if r->>'kind' <> 'upgrade' or (r->>'amountPaise')::int <> 25000 or r->>'billing' <> 'monthly' then fails := fails || ' 10b:' || r::text; end if;
  perform public.hq_billing_checkout_link((r->>'checkoutId')::uuid, 'plink_T63UP', 'https://rzp.io/i/t63up');
  r := public.hq_billing_paid('razorpay', 'plink_T63UP', 'pay_T63UP1', 25000, 'INR');
  checks := checks + 1;
  if not coalesce((r->>'applied')::boolean, false)
     or (select x.plan from public.gyms x where x.gym_id = g_up) <> 'pro'
     or (select x.billing from public.gyms x where x.gym_id = g_up) <> 'monthly'
     or (select x.paid_until from public.gyms x where x.gym_id = g_up) <> pu_up
     or (select l.kind from public.gym_payment_ledger l where l.gym_id = g_up) <> 'upgrade' then
    fails := fails || ' 10c:' || r::text;
  end if;

  -- 11. Downgrade Pro -> Starter: paid now, starts when the Pro days end (no money back).
  r := public.hq_billing_checkout_start(k_down, 'starter', 'monthly', 'razorpay');
  perform public.hq_billing_checkout_link((r->>'checkoutId')::uuid, 'plink_T63DN', 'https://rzp.io/i/t63dn');
  r2 := public.hq_billing_paid('razorpay', 'plink_T63DN', 'pay_T63DN1', 99900, 'INR');
  pu_after := public._mettleup_extend(pu_down, 'monthly', now());
  checks := checks + 1;
  if r->>'kind' <> 'renew' or (r->>'amountPaise')::int <> 99900 or not coalesce((r2->>'applied')::boolean, false)
     or (select x.plan from public.gyms x where x.gym_id = g_down) <> 'pro'
     or (select x.paid_until from public.gyms x where x.gym_id = g_down) <> pu_after
     or (select pc.from_at from public.gym_plan_changes pc where pc.gym_id = g_down) <> pu_down
     or public.owner_billing(k_down)->'scheduled'->>'plan' <> 'starter' then
    fails := fails || ' 11a:' || r2::text;
  end if;
  r_day := public.hq_billing_daily(now());  -- also today's reminders (checked in 12)
  checks := checks + 1;
  if (select x.plan from public.gyms x where x.gym_id = g_down) <> 'pro' then fails := fails || ' 11b'; end if;
  r := public.hq_billing_daily(pu_down + interval '1 minute');
  checks := checks + 1;
  if (r->>'downgraded')::int < 1 or (select x.plan from public.gyms x where x.gym_id = g_down) <> 'starter'
     or (select x.paid_until from public.gyms x where x.gym_id = g_down) <> pu_after
     or exists (select 1 from public.gym_plan_changes pc where pc.gym_id = g_down) then
    fails := fails || ' 11c:' || r::text;
  end if;

  -- 12. Reminders 7, 3 and 1 days before the end, each once.
  r2 := public.hq_billing_daily(now());
  checks := checks + 1;
  if not exists (select 1 from jsonb_array_elements(r_day->'reminders') e where e->>'gymId' = g_rem::text and (e->>'daysBefore')::int = 7)
     or exists (select 1 from jsonb_array_elements(r2->'reminders') e where e->>'gymId' = g_rem::text) then
    fails := fails || ' 12a:' || r_day::text;
  end if;
  r := public.hq_billing_daily(now() + interval '4 days');
  r2 := public.hq_billing_daily(now() + interval '6 days');
  checks := checks + 1;
  if not exists (select 1 from jsonb_array_elements(r->'reminders') e where e->>'gymId' = g_rem::text and (e->>'daysBefore')::int = 3)
     or not exists (select 1 from jsonb_array_elements(r2->'reminders') e where e->>'gymId' = g_rem::text and (e->>'daysBefore')::int = 1)
     or (select count(*) from public.gym_billing_reminders b where b.gym_id = g_rem) <> 3 then
    fails := fails || ' 12b:' || r::text || r2::text;
  end if;

  -- 13. Founding: closed after 31 Mar 2027 (India); 25 places, a place in progress counts.
  begin perform public.hq_billing_checkout_start(k_f1, 'pro', 'lifetime', 'razorpay', timestamptz '2027-04-01 00:30:00+05:30'); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'FOUNDING_CLOSED' or not public._founding_open(timestamptz '2027-03-31 23:00:00+05:30')
     or public._founding_open(timestamptz '2027-04-01 00:30:00+05:30') then
    fails := fails || ' 13a:' || err;
  end if;
  begin perform public.hq_billing_checkout_start(k_f1, 'starter', 'lifetime', 'razorpay'); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'BAD_PLAN' then fails := fails || ' 13b:' || err; end if;
  -- Fill the places up to 24 (g_life already counts).
  n_base := public._founding_taken(now(), null);
  perform set_config('forgeai.hq', 'on', true);
  insert into public.gyms(name, join_code, plan, billing)
    select 'T63 Lifetime ' || i, 'L63' || lpad(i::text, 3, '0'), 'pro', 'lifetime' from generate_series(1, 24 - n_base) i;
  perform set_config('forgeai.hq', 'off', true);
  r := public.hq_billing_checkout_start(k_f1, 'pro', 'lifetime', 'razorpay');
  checks := checks + 1;
  if r->>'kind' <> 'founding' or (r->>'amountPaise')::int <> 2999900 or r->>'billing' <> 'lifetime' then fails := fails || ' 13c:' || r::text; end if;
  c_one := (r->>'checkoutId')::uuid;
  begin perform public.hq_billing_checkout_start(k_f2, 'pro', 'lifetime', 'razorpay'); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'FOUNDING_FULL' or (public.owner_billing(k_f2)->'founding'->>'open')::boolean
     or (public.owner_billing(k_f2)->'founding'->>'left')::int <> 0 then
    fails := fails || ' 13d:' || err;
  end if;
  -- The first gym's link was refused: its place is free again.
  perform public.hq_billing_checkout_failed(c_one);
  r := public.hq_billing_checkout_start(k_f2, 'pro', 'lifetime', 'razorpay');
  perform public.hq_billing_checkout_link((r->>'checkoutId')::uuid, 'plink_T63F2', 'https://rzp.io/i/t63f2');
  r2 := public.hq_billing_paid('razorpay', 'plink_T63F2', 'pay_T63F21', 2999900, 'INR');
  checks := checks + 1;
  if not coalesce((r2->>'applied')::boolean, false)
     or (select x.billing from public.gyms x where x.gym_id = g_f2) <> 'lifetime'
     or (select x.plan from public.gyms x where x.gym_id = g_f2) <> 'pro'
     or (select x.paid_until from public.gyms x where x.gym_id = g_f2) is not null
     or (select l.kind from public.gym_payment_ledger l where l.gym_id = g_f2) <> 'founding'
     or jsonb_typeof(public.owner_receipt(k_f2, r2->>'receiptNo')->'periodTo') <> 'null'
     or public._founding_taken(now(), null) <> 25 then
    fails := fails || ' 13e:' || r2::text;
  end if;
  begin perform public.hq_billing_checkout_start(k_f1, 'pro', 'lifetime', 'razorpay'); err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'FOUNDING_FULL' then fails := fails || ' 13f:' || err; end if;

  -- 14. A payment that cannot become a plan (the gym went lifetime meanwhile) is kept as failed, not lost.
  r := public.hq_billing_checkout_start(k_up, 'pro', 'monthly', 'razorpay');
  perform public.hq_billing_checkout_link((r->>'checkoutId')::uuid, 'plink_T63LT', 'https://rzp.io/i/t63lt');
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set billing = 'lifetime', paid_until = null where gym_id = g_up;
  perform set_config('forgeai.hq', 'off', true);
  r2 := public.hq_billing_paid('razorpay', 'plink_T63LT', 'pay_T63LT1', (r->>'amountPaise')::int, 'INR');
  select count(*) into n_rows from public.gym_payment_ledger l where l.gym_id = g_up;
  checks := checks + 1;
  if r2->>'error' <> 'LIFETIME' or n_rows <> 1
     or (select x.status from public.gym_checkouts x where x.checkout_id = (r->>'checkoutId')::uuid) <> 'failed' then
    fails := fails || ' 14:' || r2::text;
  end if;

  -- 15. Doors: the owner reads; only the server key buys, pays or reads a checkout.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.owner_billing(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_receipt(text, text)', 'execute')
     or has_function_privilege('anon', 'public.hq_billing_paid(text, text, text, int, text)', 'execute')
     or has_function_privilege('authenticated', 'public.hq_billing_checkout_start(text, text, text, text, timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.apply_gym_payment(uuid, text, text, text, text, int, text, text)', 'execute')
     or has_function_privilege('anon', 'public.hq_billing_daily(timestamptz)', 'execute')
     or not has_function_privilege('service_role', 'public.hq_billing_paid(text, text, text, int, text)', 'execute')
     or has_function_privilege('anon', 'public._upgrade_paise(text, timestamptz, timestamptz)', 'execute')
     or has_table_privilege('anon', 'public.gym_checkouts', 'select')
     or has_table_privilege('anon', 'public.gym_receipts', 'select')
     or has_table_privilege('authenticated', 'public.gym_receipts', 'select') then
    fails := fails || ' 15';
  end if;

  -- 16. Paid during the free trial: no trial day is lost. The paid month starts when the trial ends, online
  --     and by HQ's manual confirm alike; Starter bought during the trial starts when the trial ends.
  tr_pu := public._mettleup_extend(tr_end, 'monthly', now());
  checks := checks + 1;
  if public._paid_from(null, tr_end, now()) <> tr_end or public._paid_from(null, now() - interval '1 day', now()) is not null
     or public._paid_from(tr_end + interval '5 days', tr_end, now()) <> tr_end + interval '5 days'
     or tr_pu <> (((today_ist + 20) + interval '1 month')::date + time '23:59:59') at time zone 'Asia/Kolkata' then
    fails := fails || ' 16a:' || tr_pu::text;
  end if;
  r := public.hq_billing_checkout_start(k_tr, 'pro', 'monthly', 'razorpay');
  perform public.hq_billing_checkout_link((r->>'checkoutId')::uuid, 'plink_T63TR', 'https://rzp.io/i/t63tr');
  r2 := public.hq_billing_paid('razorpay', 'plink_T63TR', 'pay_T63TR1', 149900, 'INR');
  checks := checks + 1;
  if not coalesce((r2->>'applied')::boolean, false) or (r2->>'paidUntil')::timestamptz <> tr_pu
     or (select x.paid_until from public.gyms x where x.gym_id = g_tr) <> tr_pu
     or (select x.plan from public.gyms x where x.gym_id = g_tr) <> 'pro'
     or (public.owner_receipt(k_tr, r2->>'receiptNo')->>'periodFrom')::timestamptz <> tr_end then
    fails := fails || ' 16b:' || r2::text;
  end if;
  -- HQ's manual confirm (the 0060 form), Starter during the trial: the trial's Pro features run on, then Starter.
  r := public.apply_gym_payment(g_tr2, 'starter', 'monthly', 'manual', 'UTR63TRIAL1', 99900);
  checks := checks + 1;
  if (r->>'paidUntil')::timestamptz <> tr_pu or r->>'scheduledPlan' <> 'starter'
     or (select x.plan from public.gyms x where x.gym_id = g_tr2) <> 'pro'
     or (select pc.from_at from public.gym_plan_changes pc where pc.gym_id = g_tr2) <> tr_end then
    fails := fails || ' 16c:' || r::text;
  end if;
  -- A second Starter month adds paid time; the switch day stays the trial's end.
  r := public.apply_gym_payment(g_tr2, 'starter', 'monthly', 'manual', 'UTR63TRIAL2', 99900);
  checks := checks + 1;
  if (r->>'paidUntil')::timestamptz <> public._mettleup_extend(tr_pu, 'monthly', now())
     or (select pc.from_at from public.gym_plan_changes pc where pc.gym_id = g_tr2) <> tr_end then
    fails := fails || ' 16d:' || r::text;
  end if;
  r := public.hq_billing_daily(tr_end + interval '1 minute');
  checks := checks + 1;
  if (select x.plan from public.gyms x where x.gym_id = g_tr2) <> 'starter' then fails := fails || ' 16e'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
