-- Nightly backup test (0052, launch audit ops #1). Runs in CI after every migration (scripts/ci/db_checks.sh).
-- It can also be pasted into the SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed.
-- The full round trip (copy -> wipe -> restore -> same rows) is scripts/backup/ci_drill.sh, a separate CI step.
do $$
declare
  fails  text := '';
  checks int := 0;
  snap   jsonb;
  t      record;
  want   int;
  uid    uuid := gen_random_uuid();
  g      jsonb;
  before jsonb := '{}'::jsonb;
begin
  -- Some rows to copy: a demo gym (gym, owner key, shop) and one sign-in account with a password and a token.
  g := public.demo_start_gym('T52 Backup Gym');
  insert into auth.users(id, instance_id, aud, role, email, encrypted_password, confirmation_token, created_at, updated_at)
    values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't52@example.com',
            'secret-hash-t52', 'token-t52', now(), now());

  -- Row counts BEFORE the copy (the copy then writes its own audit row, which it cannot contain).
  for t in select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition loop
    execute format('select count(*) from public.%I', t.name) into want;
    before := before || jsonb_build_object(t.name, want);
  end loop;

  snap := public.hq_backup_snapshot();

  -- 1. The shape.
  checks := checks + 1;
  if snap->>'format' is distinct from 'mettleup-backup-1' then fails := fails || ' 1:format'; end if;

  -- 2. EVERY ordinary table in public is in the copy, with all its rows, and the count says so.
  for t in select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition loop
    checks := checks + 1;
    want := (before->>t.name)::int;
    if not (snap->'tables' ? t.name) then fails := fails || ' 2:missing ' || t.name;
    elsif jsonb_array_length(snap->'tables'->t.name) <> want or (snap->'counts'->>t.name)::int <> want then
      fails := fails || ' 2:' || t.name || ' has ' || jsonb_array_length(snap->'tables'->t.name) || ' of ' || want;
    end if;
  end loop;

  -- 3. The demo gym is really in it.
  checks := checks + 1;
  if not exists (select 1 from jsonb_array_elements(snap->'tables'->'gyms') r where r->>'gym_id' = g->>'gymId') then
    fails := fails || ' 3:demo gym not copied';
  end if;

  -- 4. The sign-in account is copied WITHOUT its password hash or tokens.
  checks := checks + 2;
  if not exists (select 1 from jsonb_array_elements(snap->'authUsers') u where u->>'id' = uid::text) then
    fails := fails || ' 4a:account not copied';
  end if;
  if snap::text like '%secret-hash-t52%' or snap::text like '%token-t52%' then fails := fails || ' 4b:secret copied'; end if;

  -- 5. One audit row, and only the HQ key may call it.
  checks := checks + 2;
  if not exists (select 1 from public.hq_audit where actor = 'nightly-backup' and action = 'backup') then fails := fails || ' 5a:no audit row'; end if;
  if has_function_privilege('anon', 'public.hq_backup_snapshot()', 'execute')
     or has_function_privilege('authenticated', 'public.hq_backup_snapshot()', 'execute') then
    fails := fails || ' 5b:apps can call it';
  end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
