-- Pass members (0055, F123). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be
-- pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

create or replace function pg_temp.t55_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid;
  ka text := 't55-member-asha'; kb text := 't55-member-bina'; kc text := 't55-member-chet';
  fails text := ''; checks int := 0; r jsonb;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T55 Gym', 'T55GYA', 1) returning gym_id into gid;
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Asha', public._hash_key(ka), '9876505501');
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Bina', public._hash_key(kb), '9876505502');
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Chetan', public._hash_key(kc), '9876505503');
  insert into public.crm_records(gym_id, kind, id, data, version) values
    -- Asha comes with FITPASS (no plan at all).
    (gid, 'member', 't55-asha', '{"fullName":"Asha Rao","phone":"+919876505501","passCompany":"  FITPASS ","passSince":"2026-11-01"}', 1),
    -- Bina pays the gym and has no plan today.
    (gid, 'member', 't55-bina', '{"fullName":"Bina Shah","phone":"+919876505502","passCompany":null}', 1),
    -- Chetan was a pass member once: a blank company is no pass.
    (gid, 'member', 't55-chet', '{"fullName":"Chetan","phone":"+919876505503","passCompany":"   "}', 1);

  -- 1. The helper: trimmed, blank is null, at most 40 letters.
  checks := checks + 1; fails := fails || pg_temp.t55_is('1trim', public._pass_company('{"passCompany":"  cult   pass "}'), 'cult pass');
  checks := checks + 1; fails := fails || pg_temp.t55_is('1blank', public._pass_company('{"passCompany":"  "}'), null);
  checks := checks + 1; fails := fails || pg_temp.t55_is('1none', public._pass_company('{}'), null);
  checks := checks + 1; fails := fails || pg_temp.t55_is('1long', length(public._pass_company(jsonb_build_object('passCompany', repeat('x', 60))))::text, '40');

  -- 2. Plan OK: a pass member yes; a paying member with no plan no; a blank company no.
  checks := checks + 1; fails := fails || pg_temp.t55_is('2pass', public._checkin_plan_ok(gid, 't55-asha', '2026-11-04')::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t55_is('2paid', public._checkin_plan_ok(gid, 't55-bina', '2026-11-04')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t55_is('2blank', public._checkin_plan_ok(gid, 't55-chet', '2026-11-04')::text, 'false');
  -- A plan still counts as before.
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'membership', 't55-ms-bina', '{"memberId":"t55-bina","startsOn":"2026-11-01","endsOn":"2026-11-30","cancelled":false,"planName":"Monthly"}', 1);
  checks := checks + 1; fails := fails || pg_temp.t55_is('2plan', public._checkin_plan_ok(gid, 't55-bina', '2026-11-04')::text, 'true');
  -- A deleted pass member is not covered.
  update public.crm_records set deleted = true where gym_id = gid and id = 't55-chet';
  update public.crm_records set data = data || '{"passCompany":"cultpass"}' where gym_id = gid and id = 't55-chet';
  checks := checks + 1; fails := fails || pg_temp.t55_is('2deleted', public._checkin_plan_ok(gid, 't55-chet', '2026-11-04')::text, 'false');

  -- 3. The QR check-in of a pass member: written, and plan OK.
  r := public.member_check_in(ka, 'T55GYA', null);
  checks := checks + 1; fails := fails || pg_temp.t55_is('3ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t55_is('3plan', r->>'planOk', 'true');
  checks := checks + 1; fails := fails || pg_temp.t55_is('3visit',
    (select count(*) from public.crm_records where gym_id = gid and kind = 'visit' and data->>'memberId' = 't55-asha')::text, '1');

  -- 4. My membership: 'pass' for the pass member, null for the paying one; everything else as before.
  r := public.member_membership(ka);
  checks := checks + 1; fails := fails || pg_temp.t55_is('4ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t55_is('4pass', r->>'pass', 'FITPASS');
  checks := checks + 1; fails := fails || pg_temp.t55_is('4cur', r->>'current', null);
  checks := checks + 1; fails := fails || pg_temp.t55_is('4visits', r->>'visitsThisMonth', '1');
  r := public.member_membership(kb);
  checks := checks + 1; fails := fails || pg_temp.t55_is('4paid', r->>'pass', null);
  checks := checks + 1; fails := fails || pg_temp.t55_is('4plan', r->'current'->>'planName', 'Monthly');
  checks := checks + 1; fails := fails || pg_temp.t55_is('4haskey', (r ? 'pass')::text, 'true');

  -- 5. Who may call what: the helpers nobody; member_membership the app as before.
  checks := checks + 1;
  if has_function_privilege('anon', 'public._pass_company(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public._pass_company(jsonb)', 'execute')
     or has_function_privilege('anon', 'public._checkin_plan_ok(uuid, text, text)', 'execute')
     or not has_function_privilege('anon', 'public.member_membership(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.member_membership(text)', 'execute') then
    fails := fails || ' 5';
  end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
