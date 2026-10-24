-- Terms acceptance test (0033, tracker #38). Runs in CI after every migration (scripts/ci/db_checks.sh:
-- a throw-away local Supabase applies every migration, then each test must end with "RESULT PASS").
-- It can also be pasted into the SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

create or replace function pg_temp.t33_try(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t33_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  r jsonb; gnew uuid; gold uuid; gb uuid; s_old uuid; s_desk uuid; kold text := 't33-owner-old'; kdesk text := 't33-desk-old';
  knew text; kb text; fails text := ''; checks int := 0;
begin
  -- 1. Create my gym with the box ticked: the acceptance is kept with the gym.
  perform set_config('request.headers', '{"cf-connecting-ip":"203.0.113.7"}', true);
  r := public.gym_create_online('T33 New Gym', 'New Owner', '9876533001', 't33 phone', '2026-10-24');
  gnew := (r->>'gymId')::uuid;
  knew := r->>'sessionKey';
  fails := fails || pg_temp.t33_is('1 made', r->>'termsVersion', '2026-10-24');
  fails := fails || pg_temp.t33_is('1 kept',
    (select terms_version || '|' || how || '|' || staff_name || '|' || (staff_id = (r->'person'->>'staffId')::uuid) from public.gym_terms_acceptance where gym_id = gnew),
    '2026-10-24|create|New Owner|true');
  fails := fails || pg_temp.t33_is('1 address hashed, never kept',
    (select (ip_hash = encode(extensions.digest(gnew::text || ':203.0.113.7', 'sha256'), 'hex'))::text from public.gym_terms_acceptance where gym_id = gnew), 'true');
  fails := fails || pg_temp.t33_is('1 no raw address',
    (select (to_jsonb(t)::text like '%203.0.113.7%')::text from public.gym_terms_acceptance t where gym_id = gnew), 'false');
  r := public.owner_terms(knew);
  fails := fails || pg_temp.t33_is('1 read back', r->>'acceptedVersion' || '|' || (r->>'how') || '|' || (r->>'canAccept'), '2026-10-24|create|true');
  fails := fails || pg_temp.t33_is('1 bad version', pg_temp.t33_try(
    'select public.gym_create_online(''T33 Bad'', ''Bad'', ''9876533009'', null, ''soon'')'), 'INVALID');
  checks := checks + 6;

  -- 2. An older admin app (no version): the gym is made as before, nothing accepted yet.
  perform set_config('request.headers', '', true);
  r := public.gym_create_online('T33 Older App Gym', 'Older Owner', '9876533002', 't33 phone');
  fails := fails || pg_temp.t33_is('2 made', (r->>'gymId' is not null)::text, 'true');
  fails := fails || pg_temp.t33_is('2 nothing accepted', public.owner_terms(r->>'sessionKey')->>'acceptedVersion', null);
  fails := fails || pg_temp.t33_is('2 one function only',
    (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'gym_create_online')::text, '1');
  checks := checks + 3;

  -- 3. An existing gym: asked once, at the owner's next sign-in.
  insert into public.gyms(name, join_code) values ('T33 Old Gym', 'T33OLD') returning gym_id into gold;
  insert into public.gym_staff(gym_id, name, phone, role) values (gold, 'Old Owner', '9876533003', 'owner') returning staff_id into s_old;
  insert into public.gym_staff(gym_id, name, phone, role) values (gold, 'Old Desk', '9876533004', 'staff') returning staff_id into s_desk;
  insert into public.gym_sessions(staff_id, key_hash) values (s_old, public._hash_key(kold)), (s_desk, public._hash_key(kdesk));
  r := public.owner_terms(kold);
  fails := fails || pg_temp.t33_is('3 not yet', coalesce(r->>'acceptedVersion', 'none') || '|' || (r->>'canAccept'), 'none|true');
  fails := fails || pg_temp.t33_is('3 desk is not asked', public.owner_terms(kdesk)->>'canAccept', 'false');
  fails := fails || pg_temp.t33_is('3 desk cannot accept', pg_temp.t33_try(format('select public.owner_accept_terms(%L, %L)', kdesk, '2026-10-24')), 'OWNER_ONLY');
  fails := fails || pg_temp.t33_is('3 not a date', pg_temp.t33_try(format('select public.owner_accept_terms(%L, %L)', kold, '2026-13-40')), 'INVALID');
  fails := fails || pg_temp.t33_is('3 bad key', pg_temp.t33_try('select public.owner_terms(''t33-nobody'')'), 'BAD_KEY');
  r := public.owner_accept_terms(kold, '2026-10-24');
  fails := fails || pg_temp.t33_is('3 accepted', r->>'acceptedVersion' || '|' || (r->>'how') || '|' || (r->>'acceptedByName'), '2026-10-24|sign_in|Old Owner');
  r := public.owner_accept_terms(kold, '2026-10-24');
  fails := fails || pg_temp.t33_is('3 twice kept once', (select count(*) from public.gym_terms_acceptance where gym_id = gold)::text, '1');
  fails := fails || pg_temp.t33_is('3 no address: no hash', (select coalesce(ip_hash, 'none') from public.gym_terms_acceptance where gym_id = gold), 'none');
  -- Only a version that exists (in _terms_versions) and has come: a made-up or future one is refused.
  fails := fails || pg_temp.t33_is('3 future version', pg_temp.t33_try(format('select public.owner_accept_terms(%L, %L)', kold, '2099-01-01')), 'INVALID');
  fails := fails || pg_temp.t33_is('3 unknown version', pg_temp.t33_try(format('select public.owner_accept_terms(%L, %L)', kold, '2026-01-01')), 'INVALID');
  fails := fails || pg_temp.t33_is('3 unknown at Create my gym', pg_temp.t33_try(
    'select public.gym_create_online(''T33 Future'', ''Future'', ''9876533008'', null, ''2099-01-01'')'), 'INVALID');
  fails := fails || pg_temp.t33_is('3 the list', array_to_string(public._terms_versions(), ','), '2026-10-24');
  checks := checks + 12;

  -- 4. The business accepts once for every branch (0031).
  r := public.owner_add_branch(kold, 'T33 Old Gym Two', false);
  gb := (r->>'gymId')::uuid;
  kb := r->>'sessionKey';
  fails := fails || pg_temp.t33_is('4 a new branch is covered', public.owner_terms(kb)->>'acceptedVersion', '2026-10-24');
  checks := checks + 1;

  -- 5. Never changed or removed by anyone but the gym's own deletion.
  fails := fails || pg_temp.t33_is('5 no edit', pg_temp.t33_try(format(
    'update public.gym_terms_acceptance set terms_version = %L where gym_id = %L', '2020-01-01', gold)), 'APPEND_ONLY');
  fails := fails || pg_temp.t33_is('5 no delete', pg_temp.t33_try(format('delete from public.gym_terms_acceptance where gym_id = %L', gold)), 'APPEND_ONLY');
  fails := fails || pg_temp.t33_is('5 the apps cannot read it', (has_table_privilege('anon', 'public.gym_terms_acceptance', 'select')
    or has_table_privilege('authenticated', 'public.gym_terms_acceptance', 'select'))::text, 'false');
  fails := fails || pg_temp.t33_is('5 a deleted gym takes its rows', pg_temp.t33_try(format('delete from public.gyms where gym_id = %L', gnew)), 'ok');
  fails := fails || pg_temp.t33_is('5 gone with it', (select count(*) from public.gym_terms_acceptance where gym_id = gnew)::text, '0');
  checks := checks + 5;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
