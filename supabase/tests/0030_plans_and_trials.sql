-- Free trial and plan test (0030, R-97). Runs in CI after every migration (scripts/ci/db_checks.sh:
-- a throw-away local Supabase applies every migration, then each test must end with "RESULT PASS").
-- It can also be pasted into the SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

-- A statement's result as text: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t30_try(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t30_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  ga uuid; gold uuid; s_oa uuid; s_da uuid; r jsonb; acc jsonb; cap timestamptz; n bigint;
  koa text := 't30-owner-a'; kda text := 't30-desk-a';
  hq text := 'owner@example.com';
  fails text := ''; checks int := 0;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into public.gyms(name, join_code, crm_version) values ('T30 Gym A', 'T30GYA', 1) returning gym_id into ga;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner A', '9876530001', 'owner') returning staff_id into s_oa;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Desk A', '9876530002', 'staff') returning staff_id into s_da;
  insert into public.gym_sessions(staff_id, key_hash) values (s_oa, public._hash_key(koa)), (s_da, public._hash_key(kda));

  -- 1. A new gym: trial starts when it is made, ends 3 months later, no plan.
  fails := fails || pg_temp.t30_is('1 starts now', ((select trial_starts_at from public.gyms where gym_id = ga) = now())::text, 'true');
  fails := fails || pg_temp.t30_is('1 ends in 3 months',
    ((select trial_ends_at from public.gyms where gym_id = ga) = now() + interval '3 months')::text, 'true');
  fails := fails || pg_temp.t30_is('1 no plan', (select coalesce(plan, '') || coalesce(billing, '') || coalesce(paid_until::text, '') from public.gyms where gym_id = ga), '');
  fails := fails || pg_temp.t30_is('1 status untouched', (select status from public.gyms where gym_id = ga), 'trial');
  -- Every way a gym is made gets it: Start my gym (0021's gym_create_online).
  r := public.gym_create_online('T30 Online Gym', 'Online Owner', '9876530009', 't30 phone');
  fails := fails || pg_temp.t30_is('1 online gym too',
    (select trial_ends_at = trial_starts_at + interval '3 months' from public.gyms where name = 'T30 Online Gym')::text, 'true');
  checks := checks + 5;

  -- 2. Only HQ changes the trial or the plan.
  fails := fails || pg_temp.t30_is('2 not by the gym', pg_temp.t30_try(format(
    'update public.gyms set trial_ends_at = now() + interval %L where gym_id = %L', '5 years', ga)), 'HQ_ONLY');
  fails := fails || pg_temp.t30_is('2 plan not by the gym', pg_temp.t30_try(format(
    'update public.gyms set plan = %L, billing = %L where gym_id = %L', 'ai', 'lifetime', ga)), 'HQ_ONLY');
  fails := fails || pg_temp.t30_is('2 rename still works', pg_temp.t30_try(format('select public.owner_rename_gym(%L, %L)', koa, 'T30 Gym A2')), 'ok');
  checks := checks + 3;

  -- 3. Extend the trial: a reason, not in the past, never past 6 months from the start.
  cap := public._trial_cap((select trial_starts_at from public.gyms where gym_id = ga));
  fails := fails || pg_temp.t30_is('3 cap is 6 months', ((cap at time zone 'UTC') = ((now() at time zone 'UTC') + interval '6 months'))::text, 'true');
  fails := fails || pg_temp.t30_is('3 reason', pg_temp.t30_try(format('select public.hq_set_trial(%L, %L, now() + interval %L, %L)', hq, ga, '4 months', ' ')), 'NEED_REASON');
  fails := fails || pg_temp.t30_is('3 past', pg_temp.t30_try(format('select public.hq_set_trial(%L, %L, now() - interval %L, %L)', hq, ga, '1 day', 'Owner asked')), 'TRIAL_PAST');
  fails := fails || pg_temp.t30_is('3 over the cap', pg_temp.t30_try(format('select public.hq_set_trial(%L, %L, %L::timestamptz + interval %L, %L)', hq, ga, cap, '1 second', 'Owner asked')), 'TRIAL_CAP');
  fails := fails || pg_temp.t30_is('3 nobody else', pg_temp.t30_try(format('select public.hq_set_trial(%L, %L, now() + interval %L, %L)', hq, gen_random_uuid(), '4 months', 'Owner asked')), 'GONE');
  r := public.hq_set_trial(hq, ga, now() + interval '4 months', 'Owner is moving 300 members over');
  fails := fails || pg_temp.t30_is('3 extended', ((r->>'trialEndsAt')::timestamptz = now() + interval '4 months')::text, 'true');
  fails := fails || pg_temp.t30_is('3 audit', (select action || '|' || reason from public.hq_audit where gym_id = ga order by audit_id desc limit 1),
    'set_trial|Owner is moving 300 members over');
  fails := fails || pg_temp.t30_is('3 HQ switch off after', coalesce(current_setting('forgeai.hq', true), ''), 'off');
  r := public.hq_set_trial(hq, ga, cap, 'Up to the most we give');
  fails := fails || pg_temp.t30_is('3 exactly the cap', ((r->>'trialEndsAt')::timestamptz = cap)::text, 'true');
  r := public.hq_set_trial(hq, ga, now() + interval '10 days', 'Shorter, the owner agreed');
  fails := fails || pg_temp.t30_is('3 shorter is allowed', ((r->>'trialEndsAt')::timestamptz = now() + interval '10 days')::text, 'true');
  checks := checks + 10;

  -- 4. A gym that existed before 0030 (made a year ago): its trial started the day 0030 ran, so its
  --    cap is 6 months from then, not from the day it was made.
  insert into public.gyms(name, join_code, created_at) values ('T30 Old Gym', 'T30OLD', now() - interval '1 year') returning gym_id into gold;
  fails := fails || pg_temp.t30_is('4 old gym five more months', pg_temp.t30_try(format(
    'select public.hq_set_trial(%L, %L, now() + interval %L, %L)', hq, gold, '5 months', 'Pilot gym')), 'ok');
  checks := checks + 1;

  -- 5. The plan.
  fails := fails || pg_temp.t30_is('5 reason', pg_temp.t30_try(format('select public.hq_set_plan(%L, %L, %L, %L, null, %L)', hq, ga, 'pro', 'lifetime', '')), 'NEED_REASON');
  fails := fails || pg_temp.t30_is('5 unknown plan', pg_temp.t30_try(format('select public.hq_set_plan(%L, %L, %L, %L, null, %L)', hq, ga, 'gold', 'lifetime', 'Paid')), 'INVALID');
  fails := fails || pg_temp.t30_is('5 billing needs a plan', pg_temp.t30_try(format('select public.hq_set_plan(%L, %L, null, %L, null, %L)', hq, ga, 'monthly', 'Paid')), 'INVALID');
  fails := fails || pg_temp.t30_is('5 plan needs billing', pg_temp.t30_try(format('select public.hq_set_plan(%L, %L, %L, null, null, %L)', hq, ga, 'pro', 'Paid')), 'INVALID');
  fails := fails || pg_temp.t30_is('5 monthly needs a date', pg_temp.t30_try(format('select public.hq_set_plan(%L, %L, %L, %L, null, %L)', hq, ga, 'pro', 'monthly', 'Paid')), 'NEED_DATE');
  fails := fails || pg_temp.t30_is('5 too far ahead', pg_temp.t30_try(format('select public.hq_set_plan(%L, %L, %L, %L, now() + interval %L, %L)', hq, ga, 'pro', 'yearly', '4 years', 'Paid')), 'BAD_DATE');
  r := public.hq_set_plan(hq, ga, 'pro', 'yearly', now() + interval '1 year', 'Paid by UPI, receipt 12');
  fails := fails || pg_temp.t30_is('5 yearly', (r->>'plan') || '/' || (r->>'billing') || '/' || (((r->>'paidUntil')::timestamptz = now() + interval '1 year')::text), 'pro/yearly/true');
  fails := fails || pg_temp.t30_is('5 audit', (select action from public.hq_audit where gym_id = ga order by audit_id desc limit 1), 'set_plan');
  r := public.hq_set_plan(hq, ga, 'ai', 'lifetime', now() + interval '1 year', 'Lifetime deal');
  fails := fails || pg_temp.t30_is('5 lifetime has no end', (r->>'billing') || '/' || coalesce(r->>'paidUntil', 'forever'), 'lifetime/forever');
  r := public.hq_set_plan(hq, ga, null, null, null, 'Entered by mistake');
  fails := fails || pg_temp.t30_is('5 back to no plan', coalesce(r->>'plan', 'none') || coalesce(r->>'billing', '') || coalesce(r->>'paidUntil', ''), 'none');
  checks := checks + 10;

  -- 6. HQ's gym list and gym page carry the trial; the counts are unchanged.
  r := (select x from jsonb_array_elements(public.hq_gyms(hq)) x where x->>'gymId' = ga::text);
  fails := fails || pg_temp.t30_is('6 list has the trial', (r ? 'trialEndsAt' and r ? 'trialCapAt' and r ? 'plan' and r ? 'paidUntil')::text, 'true');
  fails := fails || pg_temp.t30_is('6 list keeps the counts', (r ? 'membersRegister' and r ? 'status' and r ? 'supportUntil')::text, 'true');
  fails := fails || pg_temp.t30_is('6 cap on the row', ((r->>'trialCapAt')::timestamptz = cap)::text, 'true');
  r := public.hq_gym(hq, ga);
  fails := fails || pg_temp.t30_is('6 one gym', (r ? 'trialEndsAt' and r ? 'owners')::text, 'true');
  checks := checks + 4;

  -- 7. The gym owner's own answer (the admin app's banner); the front desk is refused, as before.
  acc := public.owner_hq_access(koa);
  fails := fails || pg_temp.t30_is('7 owner sees the trial', ((acc->'trial'->>'endsAt')::timestamptz = now() + interval '10 days')::text, 'true');
  fails := fails || pg_temp.t30_is('7 owner sees no plan', coalesce(acc->'trial'->>'plan', 'none'), 'none');
  fails := fails || pg_temp.t30_is('7 keeps grants and status', (acc ? 'grants' and acc ? 'status')::text, 'true');
  fails := fails || pg_temp.t30_is('7 owner sees the extension',
    (select count(*) from jsonb_array_elements(acc->'actions') a where a->>'action' in ('set_trial', 'set_plan'))::text, '6');
  fails := fails || pg_temp.t30_is('7 desk refused', pg_temp.t30_try(format('select public.owner_hq_access(%L)', kda)), 'OWNER_ONLY');
  checks := checks + 5;

  -- 8. A paused gym can still get more trial time (HQ's own write passes the pause).
  perform public.hq_set_gym_status(hq, ga, 'suspended', 'Testing the pause');
  fails := fails || pg_temp.t30_is('8 paused gym extended', pg_temp.t30_try(format(
    'select public.hq_set_trial(%L, %L, now() + interval %L, %L)', hq, ga, '1 month', 'Still talking to them')), 'ok');
  checks := checks + 1;

  -- 9. Who may call the new HQ actions: the HQ key (service_role) only.
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname in ('hq_set_trial', 'hq_set_plan')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or not has_function_privilege('service_role', p.oid, 'execute'));
  fails := fails || pg_temp.t30_is('9 grants', n::text, '0');
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  fails := fails || pg_temp.t30_is('9 guard', pg_temp.t30_try(format('select public.hq_set_trial(%L, %L, now() + interval %L, %L)', hq, ga, '1 month', 'Owner asked')), 'HQ_ONLY');
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  checks := checks + 2;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
