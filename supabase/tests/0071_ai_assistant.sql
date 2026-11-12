-- F201 AI assistant credits (0071). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be pasted into
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
  ga uuid; gb uuid; gc uuid; s_owner uuid; s_desk uuid; s_tr uuid; s_ob uuid; s_oc uuid;
  kop text := 't71-owner-session'; kd text := 't71-desk-session'; kt text := 't71-trainer-session';
  kok text := 't71-owner-key'; kob text := 't71-owner-b'; koc text := 't71-owner-c';
  hq text := 'hq@example.com';
  t1 uuid := gen_random_uuid(); t2 uuid := gen_random_uuid(); t3 uuid := gen_random_uuid(); t4 uuid := gen_random_uuid();
  t5 uuid := gen_random_uuid();
  prev text := to_char((now() at time zone 'Asia/Kolkata') - interval '1 month', 'YYYY-MM');
  acts jsonb := '[{"tool":"draft_message","input":{"audience":"everyone","kind":"announcement"}}]';
  fails text := ''; checks int := 0; r jsonb;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T71 Gym', 'T71GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version, plan, billing, paid_until)
    values ('T71 Starter', 'T71GYB', 1, 'starter', 'monthly', now() + interval '30 days') returning gym_id into gb;
  insert into public.gyms(name, join_code, crm_version, plan, billing)
    values ('T71 Founding', 'T71GYC', 1, 'pro', 'lifetime') returning gym_id into gc;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner Singh', '9876507101', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Ravi Desk', '9876507102', 'staff') returning staff_id into s_desk;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Rohit Trainer', '9876507103', 'staff') returning staff_id into s_tr;
  insert into public.gym_trainers(staff_id, gym_id) values (s_tr, ga);
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Owner B', '9876507104', 'owner') returning staff_id into s_ob;
  insert into public.gym_staff(gym_id, name, phone, role) values (gc, 'Owner C', '9876507105', 'owner') returning staff_id into s_oc;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_desk, public._hash_key(kd)),
    (s_tr, public._hash_key(kt)), (s_ob, public._hash_key(kob)), (s_oc, public._hash_key(koc));
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kok));

  -- 1. The first wallet read adds 30 welcome + this month's free (trial gym: 60). Reading again adds nothing.
  r := public.owner_ai_wallet(kop);
  checks := checks + 1; fails := fails || pg_temp.t71_is('1balance', r->>'balance', '90');
  checks := checks + 1; fails := fails || pg_temp.t71_is('1free', r->>'free_left', '60');
  checks := checks + 1; fails := fails || pg_temp.t71_is('1monthly', r->>'monthly_free', '60');
  checks := checks + 1; fails := fails || pg_temp.t71_is('1plan', r->>'plan', 'trial');
  checks := checks + 1; fails := fails || pg_temp.t71_is('1packs', (r->'packs')::text,
    '[{"inr": 149, "credits": 50}, {"inr": 399, "credits": 150, "popular": true}, {"inr": 999, "credits": 500}]');
  r := public.owner_ai_wallet(kok);  -- the old owner key is the owner too
  checks := checks + 1; fails := fails || pg_temp.t71_is('1again', r->>'balance', '90');
  checks := checks + 1; fails := fails || pg_temp.t71_is('1welcomeOnce',
    (select count(*)::text from public.gym_ai_credit_ledger where gym_id = ga and reason = 'welcome'), '1');
  checks := checks + 1; fails := fails || pg_temp.t71_is('1monthlyOnce',
    (select count(*)::text from public.gym_ai_credit_ledger where gym_id = ga and reason = 'monthly'), '1');
  -- Starter: 20 a month; founding (Pro for life): 60.
  r := public.owner_ai_wallet(kob);
  checks := checks + 1; fails := fails || pg_temp.t71_is('1starter', (r->>'balance') || '/' || (r->>'monthly_free') || '/' || (r->>'plan'), '50/20/starter');
  checks := checks + 1; fails := fails || pg_temp.t71_is('1founding', public.owner_ai_wallet(koc)->>'balance', '90');

  -- 2. Owner only: the front desk and a trainer are refused; a made-up key too.
  checks := checks + 1; fails := fails || pg_temp.t71_is('2deskWallet', pg_temp.t71_run(format('select public.owner_ai_wallet(%L)', kd)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t71_is('2trainerWallet', pg_temp.t71_run(format('select public.owner_ai_wallet(%L)', kt)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t71_is('2deskSave', pg_temp.t71_run(format('select public.owner_ai_task_save(%L, %L, %L, false, %L)', kd, t1, 'hi', acts)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t71_is('2trainerTasks', pg_temp.t71_run(format('select public.owner_ai_tasks(%L, 10)', kt)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t71_is('2badkey', pg_temp.t71_run(format('select public.owner_ai_wallet(%L)', 'nope')), 'BAD_KEY');

  -- 3. Saving a draft: no charge; saving again re-saves; bad input and another gym's id are refused.
  r := public.owner_ai_task_save(kop, t1, '  Sab members ko Diwali ki badhai  ', true, acts);
  checks := checks + 1; fails := fails || pg_temp.t71_is('3saved', r->>'status', 'drafted');
  checks := checks + 1; fails := fails || pg_temp.t71_is('3trimmed', (select request from public.gym_ai_tasks where task_id = t1), 'Sab members ko Diwali ki badhai');
  perform public.owner_ai_task_save(kop, t1, 'Diwali message to everyone', false, acts);
  checks := checks + 1; fails := fails || pg_temp.t71_is('3resaved', (select request || '/' || spoken from public.gym_ai_tasks where task_id = t1), 'Diwali message to everyone/false');
  checks := checks + 1; fails := fails || pg_temp.t71_is('3nocharge', public.owner_ai_wallet(kop)->>'balance', '90');
  checks := checks + 1; fails := fails || pg_temp.t71_is('3otherGym', pg_temp.t71_run(format('select public.owner_ai_task_save(%L, %L, %L, false, %L)', kob, t1, 'steal', acts)), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t71_is('3empty', pg_temp.t71_run(format('select public.owner_ai_task_save(%L, %L, %L, false, %L)', kop, t2, '   ', acts)), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t71_is('3long', pg_temp.t71_run(format('select public.owner_ai_task_save(%L, %L, %L, false, %L)', kop, t2, repeat('a', 601), acts)), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t71_is('3notArray', pg_temp.t71_run(format('select public.owner_ai_task_save(%L, %L, %L, false, %L)', kop, t2, 'x', '{"a":1}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t71_is('3stillOtherGym', (select gym_id::text from public.gym_ai_tasks where task_id = t1), ga::text);

  -- 4. Spend: atomic, marks the task done, free credits counted first; a second spend of the same task is refused.
  r := public.owner_ai_spend(kop, t1, 1, '{"sent":142}');
  checks := checks + 1; fails := fails || pg_temp.t71_is('4spent', (r->>'balance') || '/' || (r->>'free_left'), '89/59');
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
  checks := checks + 1; fails := fails || pg_temp.t71_is('4plan3', public.owner_ai_spend(kop, t2, 3, null)->>'balance', '86');

  -- 5. NO_CREDITS: nothing is written and the task stays a draft. HQ takes credits back (never below 0).
  r := public.hq_ai_grant(hq, gb, -49, 'Test: take back');
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
  checks := checks + 1; fails := fails || pg_temp.t71_is('5purchase', (r->>'balance') || '/' || (r->'this_month'->>'added') || '/' || (r->'this_month'->>'spent'), '150/101/1');

  -- 6. Refund: only that task's spend, once, within 10 minutes; the task becomes 'failed'.
  r := public.owner_ai_refund(kop, t1);
  checks := checks + 1; fails := fails || pg_temp.t71_is('6refund', (r->>'refunded') || '/' || (r->>'balance'), '1/87');
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
  checks := checks + 1; fails := fails || pg_temp.t71_is('6balance', public.owner_ai_wallet(kop)->>'balance', '86');

  -- 7. A new month: the last month's unused free credits go, this month's are added once.
  perform public.owner_ai_task_save(koc, t5, 'Rahul ne 2000 diye', false, acts);
  perform public.owner_ai_spend(koc, t5, 1, null);  -- 89 left; 59 of last month's free unused
  update public.gym_ai_credit_ledger set month = prev, created_at = now() - interval '35 days'
   where gym_id = gc and reason in ('monthly', 'spend');
  r := public.owner_ai_wallet(koc);
  checks := checks + 1; fails := fails || pg_temp.t71_is('7newMonth', (r->>'balance') || '/' || (r->>'free_left'), '90/60');
  checks := checks + 1; fails := fails || pg_temp.t71_is('7expired',
    (select delta::text || '/' || month from public.gym_ai_credit_ledger where gym_id = gc and reason = 'expire'), '-59/' || prev);
  checks := checks + 1; fails := fails || pg_temp.t71_is('7once', public.owner_ai_wallet(koc)->>'balance', '90');
  checks := checks + 1; fails := fails || pg_temp.t71_is('7rows',
    (select count(*)::text from public.gym_ai_credit_ledger where gym_id = gc and reason in ('monthly', 'expire', 'welcome')), '4');

  -- 8. History: newest first, owner's own gym only, limited.
  r := public.owner_ai_tasks(kop, 10);
  checks := checks + 1; fails := fails || pg_temp.t71_is('8count', jsonb_array_length(r->'tasks')::text, '3');
  checks := checks + 1; fails := fails || pg_temp.t71_is('8limit', jsonb_array_length(public.owner_ai_tasks(kop, 1)->'tasks')::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t71_is('8otherGym', jsonb_array_length(public.owner_ai_tasks(kob, 50)->'tasks')::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t71_is('8hq', public.hq_ai_wallet(hq, ga)->'this_month'->>'tasks_done', '2');

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
     or not has_function_privilege('anon', 'public.owner_ai_refund(text, uuid)', 'execute') then fails := fails || ' 10fn'; end if;
  checks := checks + 1;
  if has_function_privilege('anon', 'public.hq_ai_grant(text, uuid, int, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.hq_ai_wallet(text, uuid)', 'execute')
     or has_function_privilege('anon', 'public._ai_add_free(uuid)', 'execute') then fails := fails || ' 10hq'; end if;
  checks := checks + 1;
  if has_table_privilege('anon', 'public.gym_ai_credit_ledger', 'select')
     or has_table_privilege('authenticated', 'public.gym_ai_tasks', 'insert') then fails := fails || ' 10table'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
