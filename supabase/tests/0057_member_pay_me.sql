-- member_pay_me test (0057, F79 online payments). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed.
do $$
declare
  gid uuid; gid2 uuid;
  ka text := 'pm-test-key-a'; kb text := 'pm-test-key-b'; kc text := 'pm-test-key-c'; kd text := 'pm-test-key-d';
  r jsonb; fails text := ''; checks int := 0; raised boolean := false;
begin
  insert into public.gyms(name, join_code) values ('PM Test Gym', 'PMTST1') returning gym_id into gid;
  insert into public.gyms(name, join_code) values ('PM Other Gym', 'PMTST2') returning gym_id into gid2;
  insert into public.gym_members(gym_id, name, phone, checkin_phone, key_hash) values
    (gid, 'asha v', null, '+919829012345', public._hash_key(ka)),
    -- Bilal typed a number at Join only: never confirmed, so not trusted here.
    (gid, 'Bilal', '9829054321', null, public._hash_key(kb)),
    -- An imposter whose confirmed number belongs to someone with another first name.
    (gid, 'Imposter', null, '+919811111111', public._hash_key(kc)),
    (gid2, 'Dev', null, '+919829012345', public._hash_key(kd));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829012345","archived":false,"createdAt":1}', 1),
    (gid, 'member', 'm-bilal', '{"fullName":"Bilal Khan","phone":"98290 54321","archived":false,"createdAt":2}', 1),
    (gid, 'member', 'm-ravi', '{"fullName":"Ravi Kumar","phone":"9811111111","archived":false,"createdAt":3}', 1);
  update public.gyms set crm_version = 1 where gym_id = gid;

  -- 1. Asha: her gym, her app id, her place on the gym's list, her first name. No money, no plan.
  r := public.member_pay_me(ka);
  checks := checks + 1;
  if r->>'gymId' is distinct from gid::text or r->>'rosterId' is distinct from 'm-asha' or r->>'name' <> 'asha'
     or r->>'memberId' is null then
    fails := fails || ' 1:' || r::text;
  end if;
  checks := checks + 1;
  if r::text ~* 'price|amount|paise|due|plan|phone' then fails := fails || ' 1b:' || r::text; end if;

  -- 2. A number not confirmed at a check-in: no place on the list (shop payments only).
  r := public.member_pay_me(kb);
  checks := checks + 1;
  if jsonb_typeof(r->'rosterId') <> 'null' or r->>'gymId' is distinct from gid::text then fails := fails || ' 2:' || r::text; end if;

  -- 3. Another first name for that number: nobody's place.
  r := public.member_pay_me(kc);
  checks := checks + 1;
  if jsonb_typeof(r->'rosterId') <> 'null' or r::text ~ 'm-ravi' then fails := fails || ' 3:' || r::text; end if;

  -- 4. A number two members share: nobody's place.
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 'm-asha-2', '{"fullName":"Asha Junior","phone":"9829012345","archived":false,"createdAt":9}', 1);
  r := public.member_pay_me(ka);
  checks := checks + 1;
  if jsonb_typeof(r->'rosterId') <> 'null' then fails := fails || ' 4:' || r::text; end if;

  -- 5. The same number at another gym never reaches this gym's list.
  r := public.member_pay_me(kd);
  checks := checks + 1;
  if jsonb_typeof(r->'rosterId') <> 'null' or r->>'gymId' is distinct from gid2::text then fails := fails || ' 5:' || r::text; end if;

  -- 6. A dead key is refused.
  begin
    perform public.member_pay_me('no-such-key');
  exception when others then
    raised := sqlerrm = 'BAD_KEY';
  end;
  checks := checks + 1;
  if not raised then fails := fails || ' 6'; end if;

  -- 7. The app (anon) may call it.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_pay_me(text)', 'execute') then fails := fails || ' 7'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
