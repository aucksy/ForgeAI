-- Which pack a gym is on, read by the apps (0046, T66). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

create or replace function pg_temp.t46_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t46_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gb uuid; s_owner uuid; s_staff uuid;
  kop text := 't46-owner-session'; ks text := 't46-staff-session'; kob text := 't46-owner-b';
  ka text := 't46-member-a'; kz text := 't46-member-z';
  fails text := ''; checks int := 0;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T46 Gym', 'T46GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T46 Other', 'T46GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner', '9876500461', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Ravi', '9876500462', 'staff') returning staff_id into s_staff;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_staff, public._hash_key(ks));
  insert into public.gym_owner_keys(gym_id, key_hash) values (gb, public._hash_key(kob));
  insert into public.gym_members(gym_id, name, key_hash) values
    (gid, 'Asha', public._hash_key(ka)),
    (gb, 'Zoya', public._hash_key(kz));

  -- 1. No pack yet (the free trial): null for the owner, the desk and the member.
  checks := checks + 1; fails := fails || pg_temp.t46_is('1owner', public.owner_gym_pack(kop)::text, '{"pack": null}');
  checks := checks + 1; fails := fails || pg_temp.t46_is('1desk', public.owner_gym_pack(ks)::text, '{"pack": null}');
  checks := checks + 1; fails := fails || pg_temp.t46_is('1member', public.member_gym_pack(ka)::text, '{"pack": null}');

  -- 2. HQ writes Starter on gym A and Pro (founding: lifetime) on gym B: each key sees its own gym's only.
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set plan = 'starter', billing = 'monthly', paid_until = now() + interval '1 month' where gym_id = gid;
  update public.gyms set plan = 'pro', billing = 'lifetime', paid_until = null where gym_id = gb;
  perform set_config('forgeai.hq', 'off', true);
  checks := checks + 1; fails := fails || pg_temp.t46_is('2owner', public.owner_gym_pack(kop)->>'pack', 'starter');
  checks := checks + 1; fails := fails || pg_temp.t46_is('2desk', public.owner_gym_pack(ks)->>'pack', 'starter');
  checks := checks + 1; fails := fails || pg_temp.t46_is('2member', public.member_gym_pack(ka)->>'pack', 'starter');
  checks := checks + 1; fails := fails || pg_temp.t46_is('2ownerB', public.owner_gym_pack(kob)->>'pack', 'pro');
  checks := checks + 1; fails := fails || pg_temp.t46_is('2memberB', public.member_gym_pack(kz)->>'pack', 'pro');
  -- Only the pack: no money facts go to the apps.
  checks := checks + 1; fails := fails || pg_temp.t46_is('2onlypack', (select string_agg(k, ',') from jsonb_object_keys(public.member_gym_pack(ka)) k), 'pack');

  -- 3. Bad keys; a member key is not a desk key and a desk key is not a member key.
  checks := checks + 1; fails := fails || pg_temp.t46_is('3owner', pg_temp.t46_run(format('select public.owner_gym_pack(%L)', 'nope')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t46_is('3member', pg_temp.t46_run(format('select public.member_gym_pack(%L)', 'nope')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t46_is('3cross1', pg_temp.t46_run(format('select public.owner_gym_pack(%L)', ka)), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t46_is('3cross2', pg_temp.t46_run(format('select public.member_gym_pack(%L)', kop)), 'BAD_KEY');

  -- 4. Nobody but HQ can still change the pack (0030's lock stands).
  checks := checks + 1; fails := fails || pg_temp.t46_is('4lock', pg_temp.t46_run(format(
    'update public.gyms set plan = %L where gym_id = %L', 'pro', gid)), 'HQ_ONLY');

  -- 5. Grants: the apps (anon) may call both.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.owner_gym_pack(text)', 'execute')
     or not has_function_privilege('anon', 'public.member_gym_pack(text)', 'execute') then fails := fails || ' 5'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
