-- F56 MettleUp Plus, the gym owner's switch (0070). Runs in CI after every migration (scripts/ci/db_checks.sh); can
-- also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

create or replace function pg_temp.t70_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t70_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  ga uuid; gb uuid; s_owner uuid; s_desk uuid;
  kop text := 't70-owner-session'; kd text := 't70-desk-session'; kok text := 't70-owner-key';
  ka text := 't70-member-asha'; kz text := 't70-member-zoya';
  fails text := ''; checks int := 0; r jsonb;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T70 Gym', 'T70GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T70 Other', 'T70GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner Singh', '9876507001', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Ravi Desk', '9876507002', 'staff') returning staff_id into s_desk;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_desk, public._hash_key(kd));
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kok));
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (ga, 'Asha', null, public._hash_key(ka));
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (gb, 'Zoya', null, public._hash_key(kz));

  -- 1. No row = the default: ON (the app's GYM_LOCK_AFTER_END_DEFAULT = true, owner's "A", 12 Nov 2026).
  checks := checks + 1; fails := fails || pg_temp.t70_is('1owner', public.owner_plus_lock(kop)->>'lockAfterEnd', 'true');
  checks := checks + 1; fails := fails || pg_temp.t70_is('1member', public.member_plus_lock(ka)->>'lockAfterEnd', 'true');
  checks := checks + 1; fails := fails || pg_temp.t70_is('1canEdit', public.owner_plus_lock(kop)->>'canEdit', 'true');
  checks := checks + 1; fails := fails || pg_temp.t70_is('1deskRead', public.owner_plus_lock(kd)->>'canEdit', 'false');

  -- 2. The desk may read, never change it; bad keys are refused; null is refused.
  checks := checks + 1; fails := fails || pg_temp.t70_is('2desk', pg_temp.t70_run(format('select public.owner_save_plus_lock(%L, false)', kd)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t70_is('2badstaff', pg_temp.t70_run(format('select public.owner_plus_lock(%L)', 'nope')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t70_is('2badmember', pg_temp.t70_run(format('select public.member_plus_lock(%L)', 'nope')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t70_is('2null', pg_temp.t70_run(format('select public.owner_save_plus_lock(%L, null)', kop)), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t70_is('2stillon', public.member_plus_lock(ka)->>'lockAfterEnd', 'true');

  -- 3. The owner switches it OFF: his members read OFF, stamped with his name; another gym keeps the default.
  r := public.owner_save_plus_lock(kop, false);
  checks := checks + 1; fails := fails || pg_temp.t70_is('3saved', r->>'lockAfterEnd', 'false');
  checks := checks + 1; fails := fails || pg_temp.t70_is('3who', r->>'updatedByName', 'Owner Singh');
  checks := checks + 1; fails := fails || pg_temp.t70_is('3member', public.member_plus_lock(ka)->>'lockAfterEnd', 'false');
  checks := checks + 1; fails := fails || pg_temp.t70_is('3other', public.member_plus_lock(kz)->>'lockAfterEnd', 'true');
  -- An old owner key (no staff row) may change it too; ON again.
  checks := checks + 1; fails := fails || pg_temp.t70_is('3ownerkey', public.owner_save_plus_lock(kok, true)->>'lockAfterEnd', 'true');
  checks := checks + 1; fails := fails || pg_temp.t70_is('3rows', (select count(*)::text from public.gym_plus_settings where gym_id = ga), '1');

  -- 4. Anyone may call the key-checked functions; nobody may read the table.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.owner_plus_lock(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_save_plus_lock(text, boolean)', 'execute')
     or not has_function_privilege('anon', 'public.member_plus_lock(text)', 'execute') then fails := fails || ' 4fn'; end if;
  checks := checks + 1;
  if has_table_privilege('anon', 'public.gym_plus_settings', 'select')
     or has_table_privilege('authenticated', 'public.gym_plus_settings', 'update') then fails := fails || ' 4table'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
