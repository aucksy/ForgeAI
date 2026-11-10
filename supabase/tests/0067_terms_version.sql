-- Terms version 2026-11-10 test (0067, R-445). Runs in CI after every migration (scripts/ci/db_checks.sh); can
-- also be pasted into the live SQL Editor once 0067 is applied. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

create or replace function pg_temp.t67_try(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t67_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  r jsonb; g uuid; s uuid; k text := 't67-owner'; fails text := ''; checks int := 0;
begin
  -- 1. The list: the old version stays valid, the new one is last (the admin app's TERMS_VERSION).
  fails := fails || pg_temp.t67_is('1 the list', array_to_string(public._terms_versions(), ','), '2026-10-24,2026-11-10');

  -- 2. A gym that accepted the old version reads it back, then accepts the new one at sign-in.
  insert into public.gyms(name, join_code) values ('T67 Gym', 'T67GYM') returning gym_id into g;
  insert into public.gym_staff(gym_id, name, phone, role) values (g, 'T67 Owner', '9876567001', 'owner') returning staff_id into s;
  insert into public.gym_sessions(staff_id, key_hash) values (s, public._hash_key(k));
  r := public.owner_accept_terms(k, '2026-10-24');
  fails := fails || pg_temp.t67_is('2 old still accepted', r->>'acceptedVersion', '2026-10-24');
  r := public.owner_accept_terms(k, '2026-11-10');
  fails := fails || pg_temp.t67_is('2 new accepted', r->>'acceptedVersion' || '|' || (r->>'how'), '2026-11-10|sign_in');
  fails := fails || pg_temp.t67_is('2 reads the newest', public.owner_terms(k)->>'acceptedVersion', '2026-11-10');
  fails := fails || pg_temp.t67_is('2 two rows kept', (select count(*) from public.gym_terms_acceptance where gym_id = g)::text, '2');

  -- 3. Anything else is still refused.
  fails := fails || pg_temp.t67_is('3 unknown version', pg_temp.t67_try(format('select public.owner_accept_terms(%L, %L)', k, '2026-11-11')), 'INVALID');
  fails := fails || pg_temp.t67_is('3 the apps cannot call the list', (has_function_privilege('anon', 'public._terms_versions()', 'execute')
    or has_function_privilege('authenticated', 'public._terms_versions()', 'execute'))::text, 'false');
  checks := checks + 7;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
