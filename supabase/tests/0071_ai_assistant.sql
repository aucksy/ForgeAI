-- F201 AI Assistant credits (0071; free credits per owner R-470). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be pasted into
-- the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

create or replace function pg_temp.t71_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t71_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  ga uuid; gb uuid; gc uuid; gd uuid; ge uuid; s_owner uuid; s_desk uuid; s_tr uuid; s_ob uuid; s_oc uuid; s_od uuid; s_oe uuid;
  kop text := 't71-owner-session'; kd text := 't71-desk-session'; kt text := 't71-trainer-session';
  kok text := 't71-owner-key'; kob text := 't71-owner-b'; koc text := 't71-owner-c'; kod text := 't71-owner-d'; koe text := 't71-owner-e';
  hq text := 'hq@example.com';
  t1 uuid := gen_random_uuid(); t2 uuid := gen_random_uuid(); t3 uuid := gen_random_uuid(); t4 uuid := gen_random_uuid();
  t5 uuid := gen_random_uuid();
  prev text := to_char((now() at time zone 'Asia/Kolkata') - interval '1 month', 'YYYY-MM');
  acts jsonb := '[{"tool":"draft_message","input":{"audience":"everyone","kind":"announcement"}}]';
  fails text := ''; checks int := 0; r jsonb;
begin
  -- ga: in its free trial (the default 3 months). gb: a paid monthly Starter plan. gc: founding lifetime.
  -- gd: a paid yearly plan. ge: a yearly plan whose paid_until has passed (and whose trial ended long ago).
  insert into public.gyms(name, join_code, crm_version) values ('T71 Gym', 'T71GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version, plan, billing, paid_until)
    values ('T71 Starter', 'T71GYB', 1, 'starter', 'monthly', now() + interval '30 days') returning gym_id into gb;
  insert into public.gyms(name, join_code, crm_version, plan, billing)
    values ('T71 Founding', 'T71GYC', 1, 'pro', 'lifetime') returning gym_id into gc;
  insert into public.gyms(name, join_code, crm_version, plan, billing, paid_until)
    values ('T71 Yearly', 'T71GYD', 1, 'pro', 'yearly', now() + interval '200 days') returning gym_id into gd;
  insert into public.gyms(name, join_code, crm_version, plan, billing, paid_until, trial_starts_at, trial_ends_at)
    values ('T71 Lapsed', 'T71GYE', 1, 'starter', 'yearly', now() - interval '2 days', now() - interval '500 days', now() - interval '400 days')
    returning gym_id into ge;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner Singh', '9876507101', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Ravi Desk', '9876507102', 'staff') returning staff_id into s_desk;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Rohit Trainer', '9876507103', 'staff') returning staff_id into s_tr;
  insert into public.gym_trainers(staff_id, gym_id) values (s_tr, ga);
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Owner B', '9876507104', 'owner') returning staff_id into s_ob;
  insert into public.gym_staff(gym_id, name, phone, role) values (gc, 'Owner C', '9876507105', 'owner') returning staff_id into s_oc;
  insert into public.gym_staff(gym_id, name, phone, role) values (gd, 'Owner D', '9876507106', 'owner') returning staff_id into s_od;
  insert into public.gym_staff(gym_id, name, phone, role) values (ge, 'Owner E', '9876507107', 'owner') returning staff_id into s_oe;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_desk, public._hash_key(kd)),
    (s_tr, public._hash_key(kt)), (s_ob, public._hash_key(kob)), (s_oc, public._hash_key(koc)), (s_od, public._hash_key(kod)),
    (s_oe, public._hash_key(koe));
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kok));

  -- 1. Free credits (R-470). A trial gym: 20 starter credits once, nothing a month. Reading again adds nothing.
  r := public.owner_ai_wallet(kop);
  checks := checks + 1; fails := fails || pg_temp.t71_is('1trial', (r->>'balance') || '/' || (r->>'free_left') || '/' || (r->>'monthly_free') || '/' || (r->>'plan') || '/' || (r->>'trial'), '20/0/0/trial/true');
  checks := checks + 1; fails := fails || pg_temp.t71_is('1packs', (r->'packs')::text,
    '[{"inr": 149, "credits": 50}, {"inr": 399, "credits": 150, "popular": true}, {"inr": 999, "credits": 500}]');
  r := public.owner_ai_wallet(kok);  -- the old owner key is the owner too
  checks := checks + 1; fails := fails || pg_temp.t71_is('1again', r->>'balance', '20');
  checks := checks + 1; fails := fails || pg_temp.t71_is('1welcomeOnce',
    (select count(*)::text || '/' || sum(delta) from public.gym_ai_credit_ledger where gym_id = ga and reason = 'welcome'), '1/20');
  checks := checks + 1; fails := fails || pg_temp.t71_is('1trialNoMonthly',
    (select count(*)::text from public.gym_ai_credit_ledger where gym_id = ga and reason = 'monthly'), '0');
  -- A monthly plan: the 20 once, no monthly credits.
  r := public.owner_ai_wallet(kob);
  checks := checks + 1; fails := fails || pg_temp.t71_is('1monthlyPlan', (r->>'balance') || '/' || (r->>'monthly_free') || '/' || (r->>'plan') || '/' || (r->>'trial'), '20/0/starter/false');
  -- A paid yearly plan: 20 + 100 this month, and not twice.
  r := public.owner_ai_wallet(kod);
  checks := checks + 1; fails := fails || pg_temp.t71_is('1yearly', (r->>'balance') || '/' || (r->>'free_left') || '/' || (r->>'monthly_free'), '120/100/100');
  checks := checks + 1; fails := fails || pg_temp.t71_is('1yearlyOnce', public.owner_ai_wallet(kod)->>'balance', '120');
  checks := checks + 1; fails := fails || pg_temp.t71_is('1yearlyRows',
    (select count(*)::text from public.gym_ai_credit_ledger where gym_id = gd and reason = 'monthly'), '1');
  -- Founding lifetime (paid_until null = for ever): 100 a month too.
  r := public.owner_ai_wallet(koc);
  checks := checks + 1; fails := fails || pg_temp.t71_is('1lifetime', (r->>'balance') || '/' || (r->>'monthly_free'), '120/100');
  -- A yearly plan whose paid_until has passed: no monthly credits.
  r := public.owner_ai_wallet(koe);
  checks := checks + 1; fails := fails || pg_temp.t71_is('1lapsed', (r->>'balance') || '/' || (r->>'monthly_free') || '/' || (r->>'trial'), '20/0/false');
  -- The panel worker's fair use: paid or in the trial.
  checks := checks + 1; fails := fails || pg_temp.t71_is('1status',
    (public.owner_ai_status(kop)->>'paid') || (public.owner_ai_status(kop)->>'trial') || '/' ||
    (public.owner_ai_status(kob)->>'paid') || (public.owner_ai_status(kob)->>'trial') || '/' ||
    (public.owner_ai_status(koc)->>'paid') || '/' || (public.owner_ai_status(koe)->>'paid') || (public.owner_ai_status(koe)->>'trial'),
    'falsetrue/truefalse/true/falsefalse');

  -- 2. Owner only: the front desk and a trainer are refused; a made-up key too.
  checks := checks + 1; fails := fails || pg_temp.t71_is('2deskWallet', pg_temp.t71_run(format('select public.owner_ai_wallet(%L)', kd)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t71_is('2trainerWallet', pg_temp.t71_run(format('select public.owner_ai_wallet(%L)', kt)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t71_is('2deskSave', pg_temp.t71_run(format('select public.owner_ai_task_save(%L, %L, %L, false, %L)', kd, t1, 'hi', acts)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t71_is('2trainerTasks', pg_temp.t71_run(format('select public.owner_ai_tasks(%L, 10)', kt)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t71_is('2deskStatus', pg_temp.t71_run(format('select public.owner_ai_status(%L)', kd)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t71_is('2badkey', pg_temp.t71_run(format('select public.owner_ai_wallet(%L)', 'nope')), 'BAD_KEY');

  -- 3. Saving a draft: no charge; saving again re-saves; bad input and another gym's id are refused.
  r := public.owner_ai_task_save(kop, t1, '  Sab members ko Diwali ki badhai  ', true, acts);
  checks := checks + 1; fails := fails || pg_temp.t71_is('3saved', r->>'status', 'drafted');
  checks := checks + 1; fails := fails || pg_temp.t71_is('3trimmed', (select request from public.gym_ai_tasks where task_id = t1), 'Sab members ko Diwali ki badhai');
  perform public.owner_ai_task_save(kop, t1, 'Diwali message to everyone', false, acts);
  checks := checks + 1; fails := fails || pg_temp.t71_is('3resaved', (select request || '/' || spoken from public.gym_ai_tasks where task_id = t1), 'Diwali message to everyone/false');
  checks := checks + 1; fails := fails || pg_temp.t71_is('3nocharge', public.owner_ai_wallet(kop)->>'balance', '20');
  checks := checks + 1; fails := fails || pg_temp.t71_is('3otherGym', pg_temp.t71_run(format('select public.owner_ai_task_save(%L, %L, %L, false, %L)', kob, t1, 'steal', acts)), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t71_is('3empty', pg_temp.t71_run(format('select public.owner_ai_task_save(%L, %L, %L, false, %L)', kop, t2, '   ', acts)), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t71_is('3long', pg_temp.t71_run(format('select public.owner_ai_task_save(%L, %L, %L, false, %L)', kop, t2, repeat('a', 601), acts)), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t71_is('3notArray', pg_temp.t71_run(format('select public.owner_ai_task_save(%L, %L, %L, false, %L)', kop, t2, 'x', '{"a":1}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t71_is('3stillOtherGym', (select gym_id::text from public.gym_ai_tasks where task_id = t1), ga::text);

  -- 4. Spend: atomic, marks the task done; a second spend of the same task is refused.
  r := public.owner_ai_spend(kop, t1, 1, '{"sent":142}');
  checks := checks + 1; fails := fails || pg_temp.t71_is('4spent', (r->>'balance') || '/' || (r->>'free_left'), '19/0');
  checks := checks + 1; fails := fails || pg_temp.t71_is('4done', (select status || '/' || credits || '/' || (result->>'sent') from public.gym_ai_tasks where task_id = t1), 'done/1/142');
  checks := checks + 1; fails := fails || pg_temp.t71_is('4twice', pg_temp.t71_run(format('select public.owner_ai_spend(%L, %L, 1, null)', kop, t1)), 'ALREADY_SPENT');
  checks := checks + 1; fails := fails || pg_temp.t71_is('4onceRow', (select count(*)::text from public.gym_ai_credit_ledger where task_id = t1 and reason = 'spend'), '1');
  checks := checks + 1; fails := fails || pg_temp.t71_is('4resaveDone', pg_temp.t71_run(format('select public.owner_ai_task_save(%L, %L, %L, false, %L)', kop, t1, 'again', acts)), 'ALREADY_DONE');
  checks := checks + 1; fails := fails || pg_temp.t71_is('4otherGymSpend', pg_temp.t71_run(format('select public.owner_ai_spend(%L, %L, 1, null)', kob, t1)), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t71_is('4unknown', pg_temp.t71_run(format('select public.owner_ai_spend(%L, %L, 1, null)', kop, gen_random_uuid())), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t71_is('4deskSpend', pg_temp.t71_run(format('select public.owner_ai_spend(%L, %L, 1, null)', kd, t1)), 'OWNER_ONLY');
  perform public.owner_ai_task_save(kop, t2, 'Workout plan for Rahul', false, '[{"tool":"draft_workout_plan","input":{}}]');
  checks := checks + 1; fails := fails || pg_temp.t71_is('4zeroCredits', pg_temp.t71_run(format('select public.owner_ai_spend(%L, %L, 0, null)', kop, t2)), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t71_is('4tooMany', pg_temp.t71_run(format('select public.owner_ai_spend(%L, %L, 10, null)', kop, t2)), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t71_is('4plan3', public.owner_ai_spend(kop, t2, 3, null)->>'balance', '16');

  -- 5. NO_CREDITS: nothing is written and the task stays a draft. HQ takes credits back (never below 0).
  r := public.hq_ai_grant(hq, gb, -19, 'Test: take back');
  checks := checks + 1; fails := fails || pg_temp.t71_is('5takenBack', r->>'balance', '1');
  checks := checks + 1; fails := fails || pg_temp.t71_is('5notEnough', pg_temp.t71_run(format('select public.hq_ai_grant(%L, %L, -5, %L)', hq, gb, 'Too much')), 'NOT_ENOUGH');
  checks := checks + 1; fails := fails || pg_temp.t71_is('5needReason', pg_temp.t71_run(format('select public.hq_ai_grant(%L, %L, 10, %L)', hq, gb, '')), 'NEED_REASON');
  checks := checks + 1; fails := fails || pg_temp.t71_is('5badKind', pg_temp.t71_run(format('select public.hq_ai_grant(%L, %L, -10, %L, %L)', hq, gb, 'Refund pack', 'purchase')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t71_is('5zero', pg_temp.t71_run(format('select public.hq_ai_grant(%L, %L, 0, %L)', hq, gb, 'Nothing')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t71_is('5audit', (select count(*)::text from public.hq_audit where gym_id = gb and action = 'ai_credits_added'), '1');
  perform public.owner_ai_task_save(kob, t3, 'Plan for Neha', false, acts);
  checks := checks + 1; fails := fails || pg_temp.t71_is('5noCredits', pg_temp.t71_run(format('select public.owner_ai_spend(%L, %L, 3, null)', kob, t3)), 'NO_CREDITS');
  checks := checks + 1; fails := fails || pg_temp.t71_is('5stillDraft', (select status from public.gym_ai_tasks where task_id = t3), 'drafted');
  checks := checks + 1; fails := fails || pg_temp.t71_is('5lastOne', public.owner_ai_spend(kob, t3, 1, null)->>'balance', '0');
  -- A pack bought: HQ adds it as a purchase.
  r := public.hq_ai_grant(hq, gb, 150, 'Paid Rs 399 by UPI', 'purchase');
  checks := checks + 1; fails := fails || pg_temp.t71_is('5purchase', (r->>'balance') || '/' || (r->'this_month'->>'added') || '/' || (r->'this_month'->>'spent'), '150/131/1');

  -- 6. Refund: only that task's spend, once, within 10 minutes; the task becomes 'failed'.
  r := public.owner_ai_refund(kop, t1);
  checks := checks + 1; fails := fails || pg_temp.t71_is('6refund', (r->>'refunded') || '/' || (r->>'balance'), '1/17');
  checks := checks + 1; fails := fails || pg_temp.t71_is('6failed', (select status from public.gym_ai_tasks where task_id = t1), 'failed');
  checks := checks + 1; fails := fails || pg_temp.t71_is('6twice', pg_temp.t71_run(format('select public.owner_ai_refund(%L, %L)', kop, t1)), 'ALREADY_REFUNDED');
  checks := checks + 1; fails := fails || pg_temp.t71_is('6respend', pg_temp.t71_run(format('select public.owner_ai_spend(%L, %L, 1, null)', kop, t1)), 'ALREADY_SPENT');
  checks := checks + 1; fails := fails || pg_temp.t71_is('6otherGym', pg_temp.t71_run(format('select public.owner_ai_refund(%L, %L)', kob, t2)), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t71_is('6desk', pg_temp.t71_run(format('select public.owner_ai_refund(%L, %L)', kd, t2)), 'OWNER_ONLY');
  perform public.owner_ai_task_save(kop, t4, 'Bijli ka bill 3200', false, '[{"tool":"add_expense","input":{"amount":3200}}]');
  checks := checks + 1; fails := fails || pg_temp.t71_is('6noSpend', pg_temp.t71_run(format('select public.owner_ai_refund(%L, %L)', kop, t4)), 'NOT_FOUND');
  perform public.owner_ai_spend(kop, t4, 1, null);
  update public.gym_ai_credit_ledger set created_at = now() - interval '11 minutes' where task_id = t4 and reason = 'spend';
  checks := checks + 1; fails := fails || pg_temp.t71_is('6late', pg_temp.t71_run(format('select public.owner_ai_refund(%L, %L)', kop, t4)), 'TOO_LATE');
  checks := checks + 1; fails := fails || pg_temp.t71_is('6balance', public.owner_ai_wallet(kop)->>'balance', '16');

  -- 7. A new month (lifetime gym): the last month's unused free credits go, this month's 100 are added once.
  perform public.owner_ai_task_save(koc, t5, 'Rahul ne 2000 diye', false, acts);
  perform public.owner_ai_spend(koc, t5, 1, null);  -- 119 left; 99 of last month's free unused
  update public.gym_ai_credit_ledger set month = prev, created_at = now() - interval '35 days'
   where gym_id = gc and reason in ('monthly', 'spend');
  r := public.owner_ai_wallet(koc);
  checks := checks + 1; fails := fails || pg_temp.t71_is('7newMonth', (r->>'balance') || '/' || (r->>'free_left'), '120/100');
  checks := checks + 1; fails := fails || pg_temp.t71_is('7expired',
    (select delta::text || '/' || month from public.gym_ai_credit_ledger where gym_id = gc and reason = 'expire'), '-99/' || prev);
  checks := checks + 1; fails := fails || pg_temp.t71_is('7once', public.owner_ai_wallet(koc)->>'balance', '120');
  checks := checks + 1; fails := fails || pg_temp.t71_is('7rows',
    (select count(*)::text from public.gym_ai_credit_ledger where gym_id = gc and reason in ('monthly', 'expire', 'welcome')), '4');
  -- A yearly plan that ran out over the month end: last month's 100 go, nothing new comes; the 20 stay.
  update public.gym_ai_credit_ledger set month = prev, created_at = now() - interval '35 days' where gym_id = gd and reason = 'monthly';
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set paid_until = now() - interval '1 day' where gym_id = gd;
  perform set_config('forgeai.hq', 'off', true);
  r := public.owner_ai_wallet(kod);
  checks := checks + 1; fails := fails || pg_temp.t71_is('7yearlyEnded', (r->>'balance') || '/' || (r->>'free_left') || '/' || (r->>'monthly_free'), '20/0/0');
  checks := checks + 1; fails := fails || pg_temp.t71_is('7yearlyEndedOnce', public.owner_ai_wallet(kod)->>'balance', '20');

  -- 8. History: newest first, owner's own gym only, limited.
  r := public.owner_ai_tasks(kop, 10);
  checks := checks + 1; fails := fails || pg_temp.t71_is('8count', jsonb_array_length(r->'tasks')::text, '3');
  checks := checks + 1; fails := fails || pg_temp.t71_is('8limit', jsonb_array_length(public.owner_ai_tasks(kop, 1)->'tasks')::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t71_is('8otherGym', jsonb_array_length(public.owner_ai_tasks(kob, 50)->'tasks')::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t71_is('8hq', public.hq_ai_wallet(hq, ga)->'this_month'->>'tasks_done', '2');
  checks := checks + 1; fails := fails || pg_temp.t71_is('8hqFree', (public.hq_ai_wallet(hq, ga)->>'monthly_free') || '/' || (public.hq_ai_wallet(hq, gc)->>'monthly_free'), '0/100');

  -- 8b. After 400 days a spend's note (the request's first words) is cleared on the next save; the credits row stays.
  update public.gym_ai_credit_ledger set created_at = now() - interval '401 days' where task_id = t5 and reason = 'spend';
  perform public.owner_ai_task_save(koc, gen_random_uuid(), 'y', false, acts);
  checks := checks + 1; fails := fails || pg_temp.t71_is('8bNoteGone',
    (select coalesce(note, 'null') || '/' || delta::text from public.gym_ai_credit_ledger where task_id = t5 and reason = 'spend'), 'null/-1');
  checks := checks + 1; fails := fails || pg_temp.t71_is('8bOtherGymKept',
    (select (count(*) > 0)::text from public.gym_ai_credit_ledger where gym_id = ga and reason = 'spend' and note is not null), 'true');

  -- 9. A paused gym spends nothing.
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = gc;
  perform set_config('forgeai.hq', 'off', true);
  perform public.owner_ai_task_save(koc, gen_random_uuid(), 'x', false, acts);
  checks := checks + 1; fails := fails || pg_temp.t71_is('9paused', pg_temp.t71_run(format('select public.owner_ai_spend(%L, %L, 1, null)', koc,
    (select task_id from public.gym_ai_tasks where gym_id = gc and status = 'drafted' limit 1))), 'SUSPENDED');

  -- 10. Anyone may call the owner functions (each checks its key); only HQ's key the hq_ ones; nobody reads the tables.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.owner_ai_wallet(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_ai_spend(text, uuid, int, jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.owner_ai_status(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_ai_refund(text, uuid)', 'execute') then fails := fails || ' 10fn'; end if;
  checks := checks + 1;
  if has_function_privilege('anon', 'public.hq_ai_grant(text, uuid, int, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.hq_ai_wallet(text, uuid)', 'execute')
     or has_function_privilege('anon', 'public._ai_monthly_free(uuid)', 'execute')
     or has_function_privilege('anon', 'public._ai_add_free(uuid)', 'execute') then fails := fails || ' 10hq'; end if;
  checks := checks + 1;
  if has_table_privilege('anon', 'public.gym_ai_credit_ledger', 'select')
     or has_table_privilege('authenticated', 'public.gym_ai_tasks', 'insert') then fails := fails || ' 10table'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
