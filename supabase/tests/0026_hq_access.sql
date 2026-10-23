-- ForgeAI HQ test, step 1 (0026, with 0027 and 0028's functions in the door check). Runs in CI after
-- every migration (scripts/ci/db_checks.sh); can also be pasted into the SQL Editor. It ALWAYS ends
-- in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- What it proves:
--   1. Every hq_* function is callable by service_role (the HQ key) and by NOTHING the apps use:
--      a gym's own session key, an old owner key, a member key and a signed-in app user all reach
--      the database as anon / authenticated, and every hq_* call is refused there by the database.
--      Run AS anon / authenticated (the owner bypasses grants and would pass falsely).
--   2. A call whose request says anon is refused by _hq_guard even if a grant were widened.
--   3. HQ never returns a member's name or mobile, nor a front-desk person's, on any default read
--      (hq_gyms, hq_gym, hq_system, hq_audit_list, hq_delete_requests). Owners' contact is allowed.
--   4. The counts are right (members, check-ins, money sums), and every read writes an audit row.
--   5. The audit log is append-only: UPDATE, DELETE and TRUNCATE are refused.

create or replace function pg_temp.t26_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; s_owner uuid; s_desk uuid; f record; stmt text; got text; r jsonb; all_out text := ''; n bigint;
  k_owner text := 't26-owner-session'; k_desk text := 't26-desk-session'; k_old text := 't26-old-owner-key'; k_mem text := 't26-member-key';
  td date := (now() at time zone 'Asia/Kolkata')::date;
  fails text := ''; checks int := 0; refused int := 0; nfn int := 0;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T26 Gym', 'T26GYA', 1) returning gym_id into gid;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Tanvi Owner', '9876526001', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Deskperson Zeta', '9876526002', 'staff') returning staff_id into s_desk;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(k_owner)), (s_desk, public._hash_key(k_desk));
  insert into public.gym_owner_keys(gym_id, key_hash) values (gid, public._hash_key(k_old));
  insert into public.gym_members(gym_id, name, phone, key_hash) values (gid, 'Appmember Quasar', '9876526003', public._hash_key(k_mem));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 't26-m1', '{"fullName":"Registermember Xylo","phone":"9876526004"}', 1),
    (gid, 'member', 't26-m2', '{"fullName":"Registermember Yaro","phone":"9876526005"}', 1),
    (gid, 'visit', 't26-v1', jsonb_build_object('memberId', 't26-m1', 'visitedOn', to_char(td, 'YYYY-MM-DD')), 1),
    (gid, 'visit', 't26-v2', jsonb_build_object('memberId', 't26-m1', 'visitedOn', to_char(td - 20, 'YYYY-MM-DD')), 1),
    (gid, 'payment', 't26-p1', jsonb_build_object('memberId', 't26-m1', 'amountP', 150000, 'paidOn', to_char(td, 'YYYY-MM-DD'), 'voided', false), 1),
    (gid, 'payment', 't26-p2', jsonb_build_object('memberId', 't26-m2', 'amountP', 99900, 'paidOn', to_char(td, 'YYYY-MM-DD'), 'voided', true), 1);

  -- 1. The door: service_role yes, anon and authenticated no, for EVERY hq_ function.
  for f in select p.oid, p.oid::regprocedure::text as sig,
                  (select string_agg('null::' || format_type(t, null), ', ' order by i)
                     from unnest(p.proargtypes::oid[]) with ordinality as a(t, i)) as nulls
             from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.proname like 'hq\_%' loop
    checks := checks + 1;
    nfn := nfn + 1;
    if not has_function_privilege('service_role', f.oid, 'execute') then fails := fails || ' 1:service_role cannot call ' || f.sig; end if;
    if has_function_privilege('anon', f.oid, 'execute') then fails := fails || ' 1:anon can call ' || f.sig; end if;
    if has_function_privilege('authenticated', f.oid, 'execute') then fails := fails || ' 1:authenticated can call ' || f.sig; end if;
    -- And really call it as each app role, with a gym session key wherever a text fits.
    stmt := format('select %s(%s)', split_part(f.sig, '(', 1),
                   replace(coalesce(f.nulls, ''), 'null::text', quote_literal(k_owner) || '::text'));
    foreach got in array array['anon', 'authenticated'] loop
      begin
        perform set_config('request.jwt.claims', format('{"role":"%s"}', got), true);
        execute format('set local role %I', got);
        execute stmt;
        reset role;
        fails := fails || ' 1:' || got || ' ran ' || f.sig;
      exception when insufficient_privilege then
        reset role;
        refused := refused + 1;
      when others then
        reset role;
        fails := fails || ' 1:' || got || ' got ' || sqlerrm || ' from ' || f.sig;
      end;
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  checks := checks + 1;
  -- 0026: 5, 0027: 8, 0028: 5. A new hq_ function is tested by the loop above automatically.
  if nfn < 18 or refused <> 2 * nfn then fails := fails || ' 1:' || refused || ' refusals for ' || nfn || ' functions'; end if;

  -- The internal helpers are not callable from the apps either.
  foreach got in array array['_hq_guard()', '_hq_log(text,text,uuid,text,jsonb)', '_hq_gym_counts(uuid)'] loop
    checks := checks + 1;
    if has_function_privilege('anon', ('public.' || got)::regprocedure, 'execute') then fails := fails || ' 1b:anon can call ' || got; end if;
  end loop;

  -- 2. The second lock: a request that says "anon" is refused inside, whatever the grants say.
  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform public.hq_system('owner@example.com');
    fails := fails || ' 2:anon claims passed _hq_guard';
  exception when others then
    fails := fails || pg_temp.t26_is('2 guard', sqlerrm, 'HQ_ONLY');
  end;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  checks := checks + 1;

  -- A gym key is not an actor: the HQ functions want the email the HQ Worker verified.
  begin
    perform public.hq_gyms(k_owner);
    fails := fails || ' 2b:a session key passed as the actor';
  exception when others then
    fails := fails || pg_temp.t26_is('2b actor', sqlerrm, 'NO_ACTOR');
  end;
  checks := checks + 1;

  -- 3 + 4. Every default read, as HQ.
  r := public.hq_gyms('owner@example.com');
  all_out := all_out || r::text;
  select x into r from jsonb_array_elements(r) x where x->>'gymId' = gid::text;
  fails := fails || pg_temp.t26_is('4 register', r->>'membersRegister', '2')
                 || pg_temp.t26_is('4 app', r->>'membersApp', '1')
                 || pg_temp.t26_is('4 checkins7', r->>'checkins7', '1')
                 || pg_temp.t26_is('4 checkins30', r->>'checkins30', '2')
                 || pg_temp.t26_is('4 money (cancelled receipt left out)', r->>'moneyThisMonthP', '150000')
                 || pg_temp.t26_is('4 cancelled', r->>'receiptsCancelledThisMonth', '1')
                 || pg_temp.t26_is('4 staff', r->>'staff', '2')
                 || pg_temp.t26_is('4 devices', r->>'liveDevices', '2')
                 || pg_temp.t26_is('4 owner contact', r->>'ownerPhone', '9876526001')
                 || pg_temp.t26_is('4 status (a new gym starts as trial)', r->>'status', 'trial');
  checks := checks + 10;
  r := public.hq_gym('owner@example.com', gid);
  all_out := all_out || r::text;
  all_out := all_out || public.hq_system('owner@example.com')::text;
  all_out := all_out || public.hq_audit_list('owner@example.com', null, null, 100)::text;
  all_out := all_out || public.hq_delete_requests('owner@example.com')::text;
  foreach got in array array['Registermember', 'Appmember', 'Deskperson', '9876526002', '9876526003', '9876526004', '9876526005'] loop
    checks := checks + 1;
    if position(got in all_out) > 0 then fails := fails || ' 3:HQ showed ' || got; end if;
  end loop;

  -- Every read above wrote its audit row.
  select count(*) into n from public.hq_audit
   where actor = 'owner@example.com' and action in ('view_all_gyms', 'view_gym', 'view_system', 'view_audit', 'view_delete_requests')
     and at >= now();
  fails := fails || pg_temp.t26_is('4 audit rows', n::text, '5');
  select count(*) into n from public.hq_audit where action = 'view_gym' and gym_id = gid and gym_name = 'T26 Gym';
  fails := fails || pg_temp.t26_is('4 audit names the gym', n::text, '1');
  checks := checks + 2;

  -- 5. Append-only.
  begin
    update public.hq_audit set actor = 'someone@else.com' where gym_id = gid;
    fails := fails || ' 5:audit row edited';
  exception when others then
    fails := fails || pg_temp.t26_is('5 update', sqlerrm, 'APPEND_ONLY');
  end;
  begin
    delete from public.hq_audit where gym_id = gid;
    fails := fails || ' 5:audit row deleted';
  exception when others then
    fails := fails || pg_temp.t26_is('5 delete', sqlerrm, 'APPEND_ONLY');
  end;
  begin
    truncate public.hq_audit;
    fails := fails || ' 5:audit truncated';
  exception when others then
    fails := fails || pg_temp.t26_is('5 truncate', sqlerrm, 'APPEND_ONLY');
  end;
  -- Even with the clean-up's switch on, a row younger than 2 years stays.
  begin
    perform set_config('forgeai.hq_purge', 'on', true);
    delete from public.hq_audit where gym_id = gid;
    fails := fails || ' 5:young audit row purged';
  exception when others then
    fails := fails || pg_temp.t26_is('5 young row', sqlerrm, 'APPEND_ONLY');
  end;
  perform set_config('forgeai.hq_purge', 'off', true);
  checks := checks + 4;

  -- The tables are closed to the apps.
  foreach got in array array['anon', 'authenticated'] loop
    begin
      execute format('set local role %I', got);
      select count(*) into n from public.hq_audit;
      reset role;
      fails := fails || ' 5b:' || got || ' read hq_audit';
    exception when insufficient_privilege then
      reset role;
    end;
    checks := checks + 1;
  end loop;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
