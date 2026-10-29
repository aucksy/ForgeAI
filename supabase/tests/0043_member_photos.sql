-- Member photo test (0043). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be
-- pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

-- Run one statement: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t43_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t43_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gb uuid; s_owner uuid; s_staff uuid;
  kop text := 't43-owner-session'; ks text := 't43-staff-session'; kob text := 't43-owner-b';
  fails text := ''; checks int := 0; r jsonb;
  -- A tiny "JPEG": the FF D8 FF start is all the server checks; the bytes are kept as they are.
  jpg text := encode('\xffd8ffe000104a464946'::bytea, 'base64');
  jpg2 text := encode('\xffd8ffdb0043000101'::bytea, 'base64');
  png text := encode('\x89504e470d0a1a0a'::bytea, 'base64');
  big text := encode('\xffd8ff'::bytea || convert_to(repeat('x', 100000), 'UTF8'), 'base64');
begin
  insert into public.gyms(name, join_code, crm_version) values ('T43 Gym', 'T43GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T43 Other', 'T43GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner', '9876500431', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Ravi', '9876500432', 'staff') returning staff_id into s_staff;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_staff, public._hash_key(ks));
  insert into public.gym_owner_keys(gym_id, key_hash) values (gb, public._hash_key(kob));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829012345"}', 1),
    (gid, 'member', 'm-bilal', '{"fullName":"Bilal Khan","phone":"9829054321"}', 1),
    (gb, 'member', 'm-zoya', '{"fullName":"Zoya Ali","phone":"9829012345"}', 1);
  insert into public.crm_records(gym_id, kind, id, data, version, deleted) values
    (gid, 'member', 'm-gone', '{"fullName":"Gone","phone":"9829000009"}', 1, true);

  -- 1. The server has photos: an empty list answers [].
  checks := checks + 1; fails := fails || pg_temp.t43_is('1empty', public.owner_member_photos(ks, array[]::text[])::text, '[]');
  checks := checks + 1; fails := fails || pg_temp.t43_is('1none', public.owner_member_photos(ks, array['m-asha'])::text, '[]');

  -- 2. The desk (a staff session) saves Asha's photo; who took it comes from the session.
  r := public.owner_save_member_photo(ks, 'm-asha', jpg);
  checks := checks + 1; fails := fails || pg_temp.t43_is('2id', r->>'memberId', 'm-asha');
  checks := checks + 1; fails := fails || pg_temp.t43_is('2bytes', r->>'jpeg', jpg);
  checks := checks + 1; fails := fails || pg_temp.t43_is('2by',
    (select by_name from public.gym_member_photos where gym_id = gid and member_id = 'm-asha'), 'Ravi');

  -- 3. Read back by the owner: only members with a photo are in the answer.
  r := public.owner_member_photos(kop, array['m-asha', 'm-bilal']);
  checks := checks + 1; fails := fails || pg_temp.t43_is('3n', jsonb_array_length(r)::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t43_is('3jpeg', r->0->>'jpeg', jpg);

  -- 4. A new photo replaces the old one (one row per member), stamped with the new taker.
  perform public.owner_save_member_photo(kop, 'm-asha', jpg2);
  checks := checks + 1; fails := fails || pg_temp.t43_is('4rows',
    (select count(*) from public.gym_member_photos where gym_id = gid and member_id = 'm-asha')::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t43_is('4jpeg', public.owner_member_photos(ks, array['m-asha'])->0->>'jpeg', jpg2);
  checks := checks + 1; fails := fails || pg_temp.t43_is('4by',
    (select by_name from public.gym_member_photos where gym_id = gid and member_id = 'm-asha'), 'Owner');

  -- 5. Not a JPEG, not base64, too big: refused.
  checks := checks + 1; fails := fails || pg_temp.t43_is('5png', pg_temp.t43_run(format(
    'select public.owner_save_member_photo(%L, %L, %L)', ks, 'm-bilal', png)), 'BAD_PHOTO');
  checks := checks + 1; fails := fails || pg_temp.t43_is('5b64', pg_temp.t43_run(format(
    'select public.owner_save_member_photo(%L, %L, %L)', ks, 'm-bilal', '***not base64***')), 'BAD_PHOTO');
  checks := checks + 1; fails := fails || pg_temp.t43_is('5big', pg_temp.t43_run(format(
    'select public.owner_save_member_photo(%L, %L, %L)', ks, 'm-bilal', big)), 'TOO_BIG');
  checks := checks + 1; fails := fails || pg_temp.t43_is('5null', pg_temp.t43_run(format(
    'select public.owner_save_member_photo(%L, %L, null)', ks, 'm-bilal')), 'TOO_BIG');

  -- 6. Only the gym's own, live members: another gym's member, a removed one, or an unknown id is refused.
  checks := checks + 1; fails := fails || pg_temp.t43_is('6other', pg_temp.t43_run(format(
    'select public.owner_save_member_photo(%L, %L, %L)', ks, 'm-zoya', jpg)), 'NO_MEMBER');
  checks := checks + 1; fails := fails || pg_temp.t43_is('6gone', pg_temp.t43_run(format(
    'select public.owner_save_member_photo(%L, %L, %L)', ks, 'm-gone', jpg)), 'NO_MEMBER');
  checks := checks + 1; fails := fails || pg_temp.t43_is('6nobody', pg_temp.t43_run(format(
    'select public.owner_save_member_photo(%L, %L, %L)', ks, 'm-nobody', jpg)), 'NO_MEMBER');

  -- 7. Gym B's owner key never reads or removes gym A's photo (same member id asked for).
  checks := checks + 1; fails := fails || pg_temp.t43_is('7read', public.owner_member_photos(kob, array['m-asha'])::text, '[]');
  checks := checks + 1; fails := fails || pg_temp.t43_is('7remove', public.owner_remove_member_photo(kob, 'm-asha')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t43_is('7still', jsonb_array_length(public.owner_member_photos(kop, array['m-asha']))::text, '1');

  -- 8. A wrong key reads and writes nothing.
  checks := checks + 1; fails := fails || pg_temp.t43_is('8read', pg_temp.t43_run(format(
    'select public.owner_member_photos(%L, %L::text[])', 'nope', array['m-asha'])), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t43_is('8save', pg_temp.t43_run(format(
    'select public.owner_save_member_photo(%L, %L, %L)', 'nope', 'm-asha', jpg)), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t43_is('8remove', pg_temp.t43_run(format(
    'select public.owner_remove_member_photo(%L, %L)', 'nope', 'm-asha')), 'BAD_KEY');

  -- 9. More than 50 at once is refused.
  checks := checks + 1; fails := fails || pg_temp.t43_is('9many', pg_temp.t43_run(format(
    'select public.owner_member_photos(%L, %L::text[])', ks, (select array_agg('m-' || i) from generate_series(1, 51) i))), 'TOO_MANY');

  -- 10. Removing: true once, false after; the photo is gone.
  checks := checks + 1; fails := fails || pg_temp.t43_is('10a', public.owner_remove_member_photo(ks, 'm-asha')::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t43_is('10b', public.owner_remove_member_photo(ks, 'm-asha')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t43_is('10c', public.owner_member_photos(ks, array['m-asha'])::text, '[]');

  -- 11. A removed person's session stops at once.
  update public.gym_staff set removed_at = now() where staff_id = s_staff;
  checks := checks + 1; fails := fails || pg_temp.t43_is('11', pg_temp.t43_run(format(
    'select public.owner_member_photos(%L, %L::text[])', ks, array['m-asha'])), 'BAD_KEY');

  -- 12. Deleting a gym takes its photos with it.
  perform public.owner_save_member_photo(kop, 'm-bilal', jpg);
  checks := checks + 1; fails := fails || pg_temp.t43_is('12del', pg_temp.t43_run(format('delete from public.gyms where gym_id = %L', gid)), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t43_is('12',
    (select count(*) from public.gym_member_photos where gym_id = gid)::text, '0');

  -- 13. Anyone may call the key-checked functions (the panel has no account); nobody may call the helper
  --     or read the table directly.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.owner_member_photos(text, text[])', 'execute')
     or not has_function_privilege('anon', 'public.owner_save_member_photo(text, text, text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_remove_member_photo(text, text)', 'execute')
     or has_function_privilege('anon', 'public._member_photo_json(public.gym_member_photos)', 'execute')
     or has_table_privilege('anon', 'public.gym_member_photos', 'select')
     or has_table_privilege('authenticated', 'public.gym_member_photos', 'select')
     or has_table_privilege('anon', 'public.gym_member_photos', 'insert') then fails := fails || ' 13'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
