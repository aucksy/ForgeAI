-- ForgeAI HQ test, step 3 (0028): support access is time-limited, read-only, logged and visible to
-- the gym's owner; the access log; the nightly clean-up. Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the SQL Editor. It ALWAYS ends in an error, so
-- it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

create or replace function pg_temp.t28_try(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t28_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  ga uuid; gb uuid; s_oa uuid; s_da uuid; s_ob uuid; r jsonb; acc jsonb; n bigint; mark bigint; code text; k text; t0 jsonb; t1 jsonb;
  koa text := 't28-owner-a'; kda text := 't28-desk-a'; kob text := 't28-owner-b';
  hq text := 'owner@example.com';
  fails text := ''; checks int := 0;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into public.gyms(name, join_code, crm_version) values ('T28 Gym A', 'T28GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T28 Gym B', 'T28GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner A', '9876528001', 'owner') returning staff_id into s_oa;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Desk A', '9876528002', 'staff') returning staff_id into s_da;
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Owner B', '9876528003', 'owner') returning staff_id into s_ob;
  insert into public.gym_sessions(staff_id, key_hash) values
    (s_oa, public._hash_key(koa)), (s_da, public._hash_key(kda)), (s_ob, public._hash_key(kob));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'member', 't28-m1', '{"fullName":"Member One","phone":"9876528004"}', 1),
    (gb, 'member', 't28-b1', '{"fullName":"Other Gym Member"}', 1);

  -- 1. No grant: HQ cannot read gym A's records.
  fails := fails || pg_temp.t28_is('1 closed', pg_temp.t28_try(format('select public.hq_gym_records(%L, %L, %L)', hq, ga, 'member')), 'NO_ACCESS');
  checks := checks + 1;

  -- 2. The gym asks (owner only): one hour, read-only, every look logged.
  fails := fails || pg_temp.t28_is('2 desk may not', pg_temp.t28_try(format('select public.owner_hq_grant(%L)', kda)), 'OWNER_ONLY');
  fails := fails || pg_temp.t28_is('2 other gym key', pg_temp.t28_try(format('select public.owner_hq_access(%L)', 'no-such-key')), 'BAD_KEY');
  r := public.owner_hq_grant(koa);
  fails := fails || pg_temp.t28_is('2 one hour', (((r->>'endsAt')::timestamptz - (r->>'startsAt')::timestamptz) = interval '60 minutes')::text, 'true');
  fails := fails || pg_temp.t28_is('2 by the gym', r->>'openedBy' || '/' || (r->>'openedByName'), 'gym/Owner A');
  r := public.hq_gym_records(hq, ga, 'member');
  fails := fails || pg_temp.t28_is('2 reads A', r->'rows'->0->'d'->>'fullName', 'Member One');
  fails := fails || pg_temp.t28_is('2 only A', (position('Other Gym Member' in r::text) = 0)::text, 'true');
  fails := fails || pg_temp.t28_is('2 B still closed', pg_temp.t28_try(format('select public.hq_gym_records(%L, %L, %L)', hq, gb, 'member')), 'NO_ACCESS');
  fails := fails || pg_temp.t28_is('2 staff list', (jsonb_array_length(public.hq_gym_records(hq, ga, 'staff')->'rows'))::text, '2');
  fails := fails || pg_temp.t28_is('2 bad kind', pg_temp.t28_try(format('select public.hq_gym_records(%L, %L, %L)', hq, ga, 'secrets')), 'INVALID');
  -- The owner sees the window and what was looked at.
  acc := public.owner_hq_access(koa);
  fails := fails || pg_temp.t28_is('2 owner sees grant', jsonb_array_length(acc->'grants')::text, '1');
  fails := fails || pg_temp.t28_is('2 owner sees looks', (select string_agg(x->>'what', ',' order by x->>'at') from jsonb_array_elements(acc->'grants'->0->'looked') x), 'member,staff');
  fails := fails || pg_temp.t28_is('2 on HQ row', (public.hq_gym(hq, ga)->>'supportOpenedBy'), 'gym');
  checks := checks + 12;

  -- Pressing the button again closes this window (its start and its looks stay as they were) and
  -- opens a new hour.
  update public.hq_grants set starts_at = now() - interval '10 minutes', ends_at = now() + interval '50 minutes' where gym_id = ga;
  r := public.owner_hq_grant(koa);
  acc := public.owner_hq_access(koa);
  fails := fails || pg_temp.t28_is('2b two windows', jsonb_array_length(acc->'grants')::text, '2');
  fails := fails || pg_temp.t28_is('2b the first keeps its start',
    ((acc->'grants'->1->>'startsAt')::timestamptz = now() - interval '10 minutes')::text || '/' || (acc->'grants'->1->>'endedEarly'), 'true/true');
  fails := fails || pg_temp.t28_is('2b and its looks', (select string_agg(x->>'what', ',' order by x->>'what') from jsonb_array_elements(acc->'grants'->1->'looked') x), 'member,staff');
  fails := fails || pg_temp.t28_is('2b the new hour is open', (acc->'grants'->0->>'open') || '/' || (r->>'open'), 'true/true');
  checks := checks + 4;

  -- Read-only: there is no HQ write path through a grant, and HQ still cannot use a gym function.
  fails := fails || pg_temp.t28_is('2 no edit', (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname like 'hq\_gym\_%' and p.proname <> 'hq_gym_records')::text, '0');
  checks := checks + 1;

  -- 3. Time-limited: once the hour is over, refused; the owner can also close it early.
  update public.hq_grants set starts_at = now() - interval '61 minutes', ends_at = now() - interval '1 minute' where gym_id = ga;
  fails := fails || pg_temp.t28_is('3 expired', pg_temp.t28_try(format('select public.hq_gym_records(%L, %L, %L)', hq, ga, 'member')), 'NO_ACCESS');
  perform public.owner_hq_grant(koa);
  perform public.owner_hq_end(koa);
  fails := fails || pg_temp.t28_is('3 closed early', pg_temp.t28_try(format('select public.hq_gym_records(%L, %L, %L)', hq, ga, 'member')), 'NO_ACCESS');
  fails := fails || pg_temp.t28_is('3 max one hour', (pg_temp.t28_try(format(
    'insert into public.hq_grants(gym_id, opened_by, opened_by_name, reason_kind, reason, starts_at, ends_at) values (%L, %L, %L, %L, %L, now(), now() + interval %L)',
    ga, 'hq', 'x', 'other', 'too long a window', '61 minutes')) like '%check%')::text, 'true');
  checks := checks + 3;

  -- 4. Emergency (HQ's door): a reason from the list, a sentence, 15 / 30 / 60 minutes.
  fails := fails || pg_temp.t28_is('4 minutes', pg_temp.t28_try(format('select public.hq_open_emergency(%L, %L, %L, %L, 90)', hq, ga, 'legal', 'Police letter dated 22 Oct')), 'INVALID');
  fails := fails || pg_temp.t28_is('4 sentence', pg_temp.t28_try(format('select public.hq_open_emergency(%L, %L, %L, %L, 15)', hq, ga, 'legal', 'short')), 'NEED_REASON');
  fails := fails || pg_temp.t28_is('4 kind', pg_temp.t28_try(format('select public.hq_open_emergency(%L, %L, %L, %L, 15)', hq, ga, 'curious', 'Just wanted to look around')), 'INVALID');
  r := public.hq_open_emergency(hq, ga, 'locked_out', 'Owner lost his phone and asked by call', 15);
  fails := fails || pg_temp.t28_is('4 open', r->>'open', 'true');
  fails := fails || pg_temp.t28_is('4 15 minutes', (((r->>'endsAt')::timestamptz - (r->>'startsAt')::timestamptz) = interval '15 minutes')::text, 'true');
  perform public.hq_gym_records(hq, ga, 'payment');
  acc := public.owner_hq_access(koa);
  fails := fails || pg_temp.t28_is('4 owner sees ForgeAI opened it', acc->'grants'->0->>'openedBy' || ':' || (acc->'grants'->0->>'reason'), 'hq:Owner lost his phone and asked by call');
  -- (Inside one test transaction every row has the same time, so the earlier looks fall in this
  -- window too; the newest look is the last one.)
  fails := fails || pg_temp.t28_is('4 owner sees the look', acc->'grants'->0->'looked'->-1->>'what', 'payment');
  fails := fails || pg_temp.t28_is('4 logged', (select count(*) from public.hq_audit where gym_id = ga and action = 'support_open')::text, '1');
  perform public.hq_end_access(hq, ga);
  fails := fails || pg_temp.t28_is('4 ended', pg_temp.t28_try(format('select public.hq_gym_records(%L, %L, %L)', hq, ga, 'member')), 'NO_ACCESS');
  -- HQ's other actions on the gym are on the owner's list too.
  perform public.hq_set_gym_status(hq, ga, 'active', null);
  fails := fails || pg_temp.t28_is('4 actions listed', (public.owner_hq_access(koa)->'actions'->0->>'action'), 'approve_gym');
  fails := fails || pg_temp.t28_is('4 status for the app', (public.owner_hq_access(koa)->>'status'), 'active');
  checks := checks + 11;

  -- 5. Nobody can hide a window: the grants and looks are in the append-only audit log too.
  fails := fails || pg_temp.t28_is('5 hide', pg_temp.t28_try(format('delete from public.hq_audit where gym_id = %L', ga)), 'APPEND_ONLY');
  fails := fails || pg_temp.t28_is('5 apps cannot read grants', (has_table_privilege('anon', 'public.hq_grants', 'select'))::text, 'false');
  checks := checks + 2;

  -- 6. Access log: sign-in, wrong code, save, whole-copy pull, sign-out.
  select coalesce(max(log_id), 0) into mark from public.gym_access_log;
  code := public.owner_make_signin_code(koa, s_da)->>'code';
  r := public.staff_sign_in('9876528002', case when code = '000000' then '111111' else '000000' end, null);
  r := public.staff_sign_in('9876528002', code, 't28 desk phone');
  k := r->>'sessionKey';
  perform public.crm_push(k, (select crm_version from public.gyms where gym_id = ga),
                          '[{"k":"visit","id":"t28-v1","d":{"memberId":"t28-m1","visitedOn":"2026-10-23"}}]'::jsonb);
  t0 := public.crm_pull(k, 0);
  t1 := public.crm_pull(k, 1);
  perform public.staff_sign_out(k);
  select string_agg(action, ',' order by log_id) into code from public.gym_access_log where gym_id = ga and staff_id = s_da and log_id > mark;
  fails := fails || pg_temp.t28_is('6 log', code, 'sign_in_failed,sign_in,push,pull_all,sign_out');
  fails := fails || pg_temp.t28_is('6 who and device', (select person || '/' || device from public.gym_access_log where gym_id = ga and action = 'sign_in' and staff_id = s_da and log_id > mark), 'Desk A/t28 desk phone');
  fails := fails || pg_temp.t28_is('6 pull answer unchanged', (t0 ? 'version' and t0 ? 'gym' and jsonb_array_length(t0->'records') = 2)::text, 'true');
  fails := fails || pg_temp.t28_is('6 small pull not logged', (select count(*) from public.gym_access_log where gym_id = ga and action = 'pull_all' and log_id > mark)::text, '1');
  checks := checks + 4;

  -- 7. Nightly clean-up: old rows go, recent ones stay, and it writes its own audit row.
  -- The access log's period follows the privacy notice: 7 days until 13 May 2027, then 1 year.
  fails := fails || pg_temp.t28_is('7 period now', public._access_log_keep(timestamptz '2026-10-23 12:00+05:30')::text, '7 days')
                 || pg_temp.t28_is('7 period on the last 7-day day', public._access_log_keep(timestamptz '2027-05-12 23:59+05:30')::text, '7 days')
                 || pg_temp.t28_is('7 period from 13 May 2027', public._access_log_keep(timestamptz '2027-05-13 00:00+05:30')::text, '1 year');
  checks := checks + 3;
  insert into public.gym_access_log(at, gym_id, action) values
    (now() - interval '400 days', ga, 'sign_in'), (now() - interval '8 days', ga, 'pull_all'), (now() - interval '3 days', ga, 'sign_out');
  insert into public.hq_audit(at, actor, action) values (now() - interval '800 days', 'old@example.com', 'view_all_gyms');
  insert into public.gym_creator_ips(gym_id, ip, created_at) values (gb, '1.2.3.4', now() - interval '400 days')
    on conflict (gym_id) do update set created_at = excluded.created_at;
  r := public.hq_nightly_cleanup('{"feedback":0}'::jsonb);
  fails := fails || pg_temp.t28_is('7 access log', ((r->>'accessLog')::int >= 1)::text, 'true');
  fails := fails || pg_temp.t28_is('7 3 days kept', (select count(*) from public.gym_access_log where gym_id = ga and at = now() - interval '3 days')::text, '1');
  fails := fails || pg_temp.t28_is('7 8 days: gone while the period is 7 days',
    (select count(*) from public.gym_access_log where gym_id = ga and at = now() - interval '8 days')::text,
    case when public._access_log_keep(now()) = interval '7 days' then '0' else '1' end);
  checks := checks + 1;
  fails := fails || pg_temp.t28_is('7 old audit', (select count(*) from public.hq_audit where actor = 'old@example.com')::text, '0');
  fails := fails || pg_temp.t28_is('7 recent audit kept', ((select count(*) from public.hq_audit where gym_id = ga) > 5)::text, 'true');
  fails := fails || pg_temp.t28_is('7 creator address', (select count(*) from public.gym_creator_ips where gym_id = gb)::text, '0');
  fails := fails || pg_temp.t28_is('7 own row', (select detail->'web'->>'feedback' from public.hq_audit where action = 'nightly_cleanup' order by audit_id desc limit 1), '0');
  fails := fails || pg_temp.t28_is('7 purge switch off', current_setting('forgeai.hq_purge', true), 'off');
  checks := checks + 7;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
