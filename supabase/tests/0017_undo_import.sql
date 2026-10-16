-- "Undo this import" test (0017). Runs in CI after every migration (scripts/ci/db_checks.sh);
-- can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed.
do $$
declare
  gid uuid; sid uuid;
  ko text := 'undo-test-owner'; ks text := 'undo-test-staff';
  ver bigint; n int; fails text := ''; checks int := 0;
  k text;
begin
  insert into public.gyms(name, join_code) values ('Undo Test Gym', 'UNDOT1') returning gym_id into gid;
  insert into public.gym_owner_keys(gym_id, key_hash) values (gid, public._hash_key(ko));
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Desk', '9876500000', 'staff') returning staff_id into sid;
  insert into public.gym_sessions(staff_id, key_hash) values (sid, public._hash_key(ks));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 'm-imp', '{"fullName":"Imported","importId":"import-abc"}', 1),
    (gid, 'member', 'm-hand', '{"fullName":"Typed by hand"}', 1),
    (gid, 'plan', 'p-imp', '{"name":"Quarterly","importId":"import-abc"}', 1),
    (gid, 'membership', 'ms-imp', '{"memberId":"m-imp","importId":"import-abc"}', 1),
    (gid, 'payment', 'pay-imp', '{"memberId":"m-imp","importId":"import-abc"}', 1),
    (gid, 'payment', 'pay-hand', '{"memberId":"m-hand","importId":""}', 1);
  update public.gyms set crm_version = 1 where gym_id = gid;

  -- 1. The front desk may not undo an import.
  begin
    perform public.crm_push(ks, 1, '[{"k":"member","id":"m-imp","d":null,"x":true}]'::jsonb);
    fails := fails || ' 1:staff deleted an imported member';
  exception when others then
    if sqlerrm <> 'OWNER_ONLY' then fails := fails || ' 1:' || sqlerrm; end if;
  end;
  checks := checks + 1;

  -- 2. A record typed in by hand is never deleted, even by the owner (and an empty importId is none).
  foreach k in array array['m-hand', 'pay-hand'] loop
    begin
      perform public.crm_push(ko, 1, jsonb_build_array(jsonb_build_object(
        'k', case when k = 'm-hand' then 'member' else 'payment' end, 'id', k, 'd', null, 'x', true)));
      fails := fails || ' 2:owner deleted ' || k;
    exception when others then
      if sqlerrm <> 'INVALID' then fails := fails || ' 2:' || k || ':' || sqlerrm; end if;
    end;
    checks := checks + 1;
  end loop;

  -- 3. The owner undoes the import: all four imported kinds go in one push.
  ver := public.crm_push(ko, 1, '[
    {"k":"payment","id":"pay-imp","d":null,"x":true},
    {"k":"membership","id":"ms-imp","d":null,"x":true},
    {"k":"member","id":"m-imp","d":null,"x":true},
    {"k":"plan","id":"p-imp","d":null,"x":true}]'::jsonb);
  checks := checks + 1;
  if ver <> 2 then fails := fails || ' 3:version ' || ver; end if;
  select count(*) into n from public.crm_records where gym_id = gid and deleted;
  checks := checks + 1;
  if n <> 4 then fails := fails || ' 3:deleted ' || n; end if;
  -- The rows keep their data (like a taken-back check-in).
  select count(*) into n from public.crm_records where gym_id = gid and deleted and data ? 'importId';
  checks := checks + 1;
  if n <> 4 then fails := fails || ' 3:data dropped'; end if;
  select count(*) into n from public.crm_records where gym_id = gid and not deleted;
  checks := checks + 1;
  if n <> 2 then fails := fails || ' 3:hand records touched (' || n || ' left)'; end if;

  -- 4. An already deleted record cannot be "deleted" again (nothing stored to check).
  begin
    perform public.crm_push(ko, 2, '[{"k":"member","id":"m-imp","d":null,"x":true}]'::jsonb);
    fails := fails || ' 4:deleted twice';
  exception when others then
    if sqlerrm <> 'INVALID' then fails := fails || ' 4:' || sqlerrm; end if;
  end;
  checks := checks + 1;

  -- 5. Check-ins and expenses still come back as before; a gym record never.
  begin
    perform public.crm_push(ko, 2, '[{"k":"gym","id":"gym","d":null,"x":true}]'::jsonb);
    fails := fails || ' 5:gym deleted';
  exception when others then
    if sqlerrm <> 'INVALID' then fails := fails || ' 5:' || sqlerrm; end if;
  end;
  checks := checks + 1;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
