-- 0022 staff_key_status test (UAT U-A14). Runs in CI after every migration (scripts/ci/db_checks.sh);
-- can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

create or replace function pg_temp.t22_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; owner_id uuid; desk_id uuid; other_id uuid;
  k_owner text := 't22-owner-key'; k_desk text := 't22-desk-key'; k_desk_old text := 't22-desk-old';
  k_other text := 't22-other-key';
  fails text := ''; checks int := 0;
begin
  insert into public.gyms(name, join_code) values ('T22 Gym', 'T22GYA') returning gym_id into gid;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner', '9829000001', 'owner') returning staff_id into owner_id;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Desk', '9829000002', 'staff') returning staff_id into desk_id;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Other', '9829000003', 'staff') returning staff_id into other_id;
  insert into public.gym_sessions(staff_id, key_hash) values
    (owner_id, public._hash_key(k_owner)), (desk_id, public._hash_key(k_desk)),
    (desk_id, public._hash_key(k_desk_old)), (other_id, public._hash_key(k_other));

  fails := fails || pg_temp.t22_is('1 live', public.staff_key_status(k_desk), 'live');
  fails := fails || pg_temp.t22_is('2 unknown', public.staff_key_status('t22-no-such-key'), 'unknown');
  checks := checks + 2;

  -- One device signed out.
  update public.gym_sessions set ended_at = now() where key_hash = public._hash_key(k_desk_old);
  fails := fails || pg_temp.t22_is('3 signed out', public.staff_key_status(k_desk_old), 'signed_out');
  fails := fails || pg_temp.t22_is('3b other device live', public.staff_key_status(k_desk), 'live');
  checks := checks + 2;

  -- The owner signs Other out everywhere, and removes Desk (the panel's own functions).
  perform public.owner_sign_out_person(k_owner, other_id);
  perform public.owner_remove_person(k_owner, desk_id);
  fails := fails || pg_temp.t22_is('4 signed out everywhere', public.staff_key_status(k_other), 'signed_out');
  fails := fails || pg_temp.t22_is('5 removed', public.staff_key_status(k_desk), 'removed');
  fails := fails || pg_temp.t22_is('5b removed, older device', public.staff_key_status(k_desk_old), 'removed');
  fails := fails || pg_temp.t22_is('6 owner still live', public.staff_key_status(k_owner), 'live');
  checks := checks + 4;

  -- Callable without signing in (the device has only its dead key), and by nothing else's rights.
  fails := fails || pg_temp.t22_is('7 anon may call', has_function_privilege('anon', 'public.staff_key_status(text)', 'execute')::text, 'true');
  checks := checks + 1;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
