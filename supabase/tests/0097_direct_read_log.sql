-- R-595 direct-read record test (0097). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be
-- pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- Two gyms, an owner key for each. The HQ Worker's pulls are played by calling hq_db_reads_ingest directly.

create or replace function pg_temp.t97_try(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t97_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  ga uuid; gb uuid; s_oa uuid; s_ob uuid; r jsonb; acc jsonb; accb jsonb; t0 timestamptz := now() - interval '30 minutes';
  koa text := 't97-owner-a'; kob text := 't97-owner-b'; hq text := 'owner@example.com';
  fails text := ''; checks int := 0;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into public.gyms(name, join_code, crm_version) values ('T97 Crispy Test', 'T97GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T97 Other Gym', 'T97GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner A', '9876597001', 'owner') returning staff_id into s_oa;
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Owner B', '9876597002', 'owner') returning staff_id into s_ob;
  insert into public.gym_sessions(staff_id, key_hash) values (s_oa, public._hash_key(koa)), (s_ob, public._hash_key(kob));
  update public.db_read_log_state set covered_to = t0 - interval '1 minute', audit_on = null where id = 1;

  -- 1. The switch is on the role postgres only, not on the app's roles.
  checks := checks + 1; fails := fails || pg_temp.t97_is('1postgres', ('postgres' = any(public._db_audited_roles()))::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t97_is('1app',
    (select count(*)::text from unnest(public._db_audited_roles()) x where x in ('anon', 'authenticated', 'service_role', 'authenticator')), '0');
  checks := checks + 1; fails := fails || pg_temp.t97_is('1catalog',
    (select count(*)::text from pg_roles r, unnest(r.rolconfig) c where r.rolname = 'postgres'
      and c in ('pgaudit.log_catalog=off', 'pgaudit.log_relation=on')), '2');

  -- 2. One pull: a read naming gym A by id, a read naming gym B by name, an unscoped read, a change.
  r := public.hq_db_reads_ingest(jsonb_build_array(
         jsonb_build_object('id', 'sess1:1', 'at', t0, 'role', 'postgres', 'kind', 'read', 'objects', jsonb_build_array('public.crm_records'),
                            'uuids', jsonb_build_array(upper(ga::text)), 'text', 'select * from crm_records where gym_id = ''' || ga || '''',
                            'source', 'dashboard', 'who', 'a1b2'),
         jsonb_build_object('id', 'sess1:2', 'at', t0 + interval '1 minute', 'role', 'postgres', 'kind', 'read',
                            'objects', jsonb_build_array('public.gyms'), 'uuids', '[]'::jsonb,
                            'text', 'select * from gyms where name = ''t97 other gym''', 'source', 'direct'),
         jsonb_build_object('id', 'sess1:3', 'at', t0 + interval '2 minutes', 'role', 'postgres', 'kind', 'read',
                            'objects', jsonb_build_array('public.crm_records'), 'text', 'select count(*) from crm_records'),
         jsonb_build_object('id', 'sess1:4', 'at', t0 + interval '3 minutes', 'role', 'postgres', 'kind', 'change',
                            'objects', jsonb_build_array('public.gym_staff'), 'uuids', jsonb_build_array(gb::text),
                            'text', 'update gym_staff set name = name where gym_id = ''' || gb || '''')),
       t0 - interval '1 minute', t0 + interval '4 minutes');
  checks := checks + 1; fails := fails || pg_temp.t97_is('2added', r->>'added' || '/' || (r->>'auditOn'), '4/true');
  checks := checks + 1; fails := fails || pg_temp.t97_is('2gymA',
    (select gym_ids::text from public.db_direct_reads where look_id = 'sess1:1'), '{' || ga || '}');
  checks := checks + 1; fails := fails || pg_temp.t97_is('2byname',
    (select gym_ids::text from public.db_direct_reads where look_id = 'sess1:2'), '{' || gb || '}');
  checks := checks + 1; fails := fails || pg_temp.t97_is('2none',
    (select gym_ids::text from public.db_direct_reads where look_id = 'sess1:3'), '{}');
  checks := checks + 1; fails := fails || pg_temp.t97_is('2covered',
    ((select covered_to from public.db_read_log_state where id = 1) = t0 + interval '4 minutes')::text, 'true');

  -- 3. The same statement again (overlapping pulls; its other table in a later pull): one row, tables added.
  r := public.hq_db_reads_ingest(jsonb_build_array(
         jsonb_build_object('id', 'sess1:1', 'at', t0, 'role', 'postgres', 'kind', 'read', 'objects', jsonb_build_array('public.gym_staff'),
                            'text', 'select * from crm_records where gym_id = ''' || ga || '''', 'source', 'dashboard', 'who', 'a1b2')),
       t0, t0 + interval '5 minutes');
  checks := checks + 1; fails := fails || pg_temp.t97_is('3once', r->>'added' || '/' ||
    (select count(*)::text from public.db_direct_reads where look_id like 'sess1:%'), '0/4');
  checks := checks + 1; fails := fails || pg_temp.t97_is('3merged',
    (select objects::text from public.db_direct_reads where look_id = 'sess1:1'), '{public.crm_records,public.gym_staff}');

  -- 4. Gym A's owner sees: its own read (inside no support window), the unscoped read. Not gym B's two.
  acc := public.owner_hq_access(koa);
  checks := checks + 1; fails := fails || pg_temp.t97_is('4count', jsonb_array_length(acc->'direct')::text, '2');
  checks := checks + 1; fails := fails || pg_temp.t97_is('4newest',
    (acc->'direct'->0->>'allGyms') || '/' || (acc->'direct'->1->>'allGyms') || '/' || (acc->'direct'->1->>'fromDashboard')
    || '/' || (acc->'direct'->1->'tables'->>0) || '/' || (acc->'direct'->1->>'inSupportWindow'), 'true/false/true/crm_records/false');
  checks := checks + 1; fails := fails || pg_temp.t97_is('4no text', (position('select' in (acc->'direct')::text) = 0)::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t97_is('4since', ((acc->>'directSince') is not null)::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t97_is('4grants kept', jsonb_typeof(acc->'grants') || '/' || jsonb_typeof(acc->'actions'), 'array/array');
  accb := public.owner_hq_access(kob);
  checks := checks + 1; fails := fails || pg_temp.t97_is('4gymB', jsonb_array_length(accb->'direct')::text, '3');
  checks := checks + 1; fails := fails || pg_temp.t97_is('4B not A', (position(ga::text in accb::text) = 0)::text, 'true');

  -- 5. A look inside the gym's own support hour says so.
  perform public.owner_hq_grant(koa);
  r := public.hq_db_reads_ingest(jsonb_build_array(
         jsonb_build_object('id', 'sess2:1', 'at', now(), 'role', 'postgres', 'kind', 'read', 'objects', jsonb_build_array('public.crm_records'),
                            'uuids', jsonb_build_array(ga::text), 'text', 'select 1')), t0 + interval '5 minutes', now());
  acc := public.owner_hq_access(koa);
  checks := checks + 1; fails := fails || pg_temp.t97_is('5window', acc->'direct'->0->>'inSupportWindow', 'true');

  -- 6. A pull that comes after the log expired writes a gap, shown to every gym.
  r := public.hq_db_reads_ingest('[]'::jsonb, now() + interval '4 minutes', now() + interval '4 minutes');
  checks := checks + 1; fails := fails || pg_temp.t97_is('6gap',
    (select count(*)::text from public.db_direct_reads where kind = 'gap' and at = now() and until_at = now() + interval '4 minutes'), '1');
  checks := checks + 1; fails := fails || pg_temp.t97_is('6gap shown', (select string_agg(x->>'kind', ',')
    from jsonb_array_elements(public.owner_hq_access(kob)->'direct') x where x->>'kind' = 'gap'), 'gap');

  -- 7. Switching pgaudit off on postgres is written down at the next pull (and on again).
  alter role postgres reset pgaudit.log;
  r := public.hq_db_reads_ingest(null, now(), now(), 'test: key refused');
  checks := checks + 1; fails := fails || pg_temp.t97_is('7off', (r->>'auditOn') || '/' ||
    (select count(*)::text from public.db_direct_reads where kind = 'audit_off'), 'false/1');
  checks := checks + 1; fails := fails || pg_temp.t97_is('7error', (select last_error from public.db_read_log_state where id = 1), 'test: key refused');
  alter role postgres set pgaudit.log = 'read, write, misc_set';
  r := public.hq_db_reads_ingest('[]'::jsonb, now(), now());
  checks := checks + 1; fails := fails || pg_temp.t97_is('7on', (r->>'auditOn') || '/' ||
    (select count(*)::text from public.db_direct_reads where kind = 'audit_on') || '/' ||
    coalesce((select last_error from public.db_read_log_state where id = 1), 'none'), 'true/1/none');

  -- 8. Append-only: no edit, no delete, no truncate.
  checks := checks + 1; fails := fails || pg_temp.t97_is('8edit', pg_temp.t97_try('update public.db_direct_reads set query = ''x'' where look_id = ''sess1:1'''), 'APPEND_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t97_is('8drop gym', pg_temp.t97_try('update public.db_direct_reads set gym_ids = ''{}'' where look_id = ''sess1:1'''), 'APPEND_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t97_is('8delete', pg_temp.t97_try('delete from public.db_direct_reads where look_id = ''sess1:1'''), 'APPEND_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t97_is('8truncate', pg_temp.t97_try('truncate public.db_direct_reads'), 'APPEND_ONLY');

  -- 9. Bad input is refused whole.
  checks := checks + 1; fails := fails || pg_temp.t97_is('9kind', pg_temp.t97_try(format('select public.hq_db_reads_ingest(%L::jsonb, now(), now())',
    '[{"id":"x:1","at":"2026-11-16T00:00:00Z","role":"postgres","kind":"drop"}]')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t97_is('9backwards', pg_temp.t97_try('select public.hq_db_reads_ingest(''[]''::jsonb, now(), now() - interval ''1 hour'')'), 'INVALID');

  -- 10. HQ's list has the query text and the gym's name; the look is in hq_audit.
  r := public.hq_db_reads(hq);
  checks := checks + 1; fails := fails || pg_temp.t97_is('10hq',
    (select x->'gyms'->0->>'name' || '|' || (x->>'who') from jsonb_array_elements(r->'rows') x where x->>'id' = 'sess1:1'), 'T97 Crispy Test|a1b2');
  checks := checks + 1; fails := fails || pg_temp.t97_is('10state', (r->'state'->>'auditOn'), 'true');
  checks := checks + 1; fails := fails || pg_temp.t97_is('10audited',
    (select count(*)::text from public.hq_audit where action = 'view_db_reads' and at >= now()), '1');

  -- 11. Who may call: only service_role; the gym's key reaches only owner_hq_access; the tables are closed.
  checks := checks + 1;
  if has_function_privilege('anon', 'public.hq_db_reads_ingest(jsonb, timestamptz, timestamptz, text)', 'execute')
     or has_function_privilege('authenticated', 'public.hq_db_reads_ingest(jsonb, timestamptz, timestamptz, text)', 'execute')
     or has_function_privilege('anon', 'public.hq_db_reads_cursor()', 'execute')
     or has_function_privilege('anon', 'public.hq_db_reads(text, timestamptz)', 'execute')
     or not has_function_privilege('service_role', 'public.hq_db_reads_ingest(jsonb, timestamptz, timestamptz, text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_hq_access(text)', 'execute')
     or has_table_privilege('anon', 'public.db_direct_reads', 'select')
     or has_table_privilege('authenticated', 'public.db_direct_reads', 'select')
     or has_table_privilege('anon', 'public.db_read_log_state', 'select') then fails := fails || ' 11grants'; end if;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  checks := checks + 1; fails := fails || pg_temp.t97_is('11guard', pg_temp.t97_try('select public.hq_db_reads_cursor()'), 'HQ_ONLY');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
