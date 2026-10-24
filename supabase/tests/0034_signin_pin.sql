-- Lasting sign-in PIN test (0034, R-117). Runs in CI after every migration (scripts/ci/db_checks.sh:
-- a throw-away local Supabase applies every migration, then each test must end with "RESULT PASS").
-- It can also be pasted into the SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- Each wrong try comes from its own made-up caller address (request.headers), so the old per-caller
-- limit (5 per mobile per caller, 0018) never hides what the new per-person PIN lock does.

create or replace function pg_temp.t34_try(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t34_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- Sign in as if from caller address 10.34.<a>.<b>.
create or replace function pg_temp.t34_in(p_phone text, p_code text, p_ip text) returns jsonb
  language plpgsql as $$
begin
  perform set_config('request.headers', format('{"cf-connecting-ip":"%s"}', p_ip), true);
  return public.staff_sign_in(p_phone, p_code, 't34 device');
end $$;

do $$
declare
  r jsonb; ga uuid; gb uuid; s_oa uuid; s_da uuid; s_ob uuid; s_xb uuid; koa text; kda text; kob text := 't34-owner-b';
  ph_a text := '9876534001'; ph_d text := '9876534002'; pin_a text := '271828'; c text; x text; i int; n bigint;
  fails text := ''; checks int := 0;
begin
  perform set_config('request.headers', '', true);

  -- 1. Create my gym: weak and malformed PINs are refused before anything is made; a good one is kept
  --    only as a slow salted hash.
  foreach x in array array['111111', '123456', '654321', '012345', right(ph_a, 6)] loop
    fails := fails || pg_temp.t34_is('1 weak ' || x, pg_temp.t34_try(format(
      'select public.gym_create_online(%L, %L, %L, null, null, %L)', 'T34 Weak', 'Weak', ph_a, x)), 'WEAK_PIN');
  end loop;
  foreach x in array array['12345', '12a456', '1234567'] loop
    fails := fails || pg_temp.t34_is('1 bad ' || x, pg_temp.t34_try(format(
      'select public.gym_create_online(%L, %L, %L, null, null, %L)', 'T34 Bad', 'Bad', ph_a, x)), 'BAD_PIN');
  end loop;
  fails := fails || pg_temp.t34_is('1 nothing made', (select count(*) from public.gym_staff where phone = ph_a)::text, '0');
  r := public.gym_create_online('T34 Gym A', 'Owner A', '+91 98765 34001', 't34 phone', null, pin_a);
  ga := (r->>'gymId')::uuid;
  koa := r->>'sessionKey';
  s_oa := (r->'person'->>'staffId')::uuid;
  fails := fails || pg_temp.t34_is('1 made with a PIN', r->>'hasPin', 'true');
  fails := fails || pg_temp.t34_is('1 slow hash', (select (pin_hash like '$2a$10$%')::text from public.gym_staff_pins where staff_id = s_oa), 'true');
  fails := fails || pg_temp.t34_is('1 never the PIN itself', (select (pin_hash like '%' || pin_a || '%')::text from public.gym_staff_pins where staff_id = s_oa), 'false');
  fails := fails || pg_temp.t34_is('1 one function only',
    (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'gym_create_online')::text, '1');
  r := public.gym_create_online('T34 Older App Gym', 'Older Owner', '9876534009', 't34 phone');
  fails := fails || pg_temp.t34_is('1 older app: no PIN, still made', (r->>'hasPin') || '|' || ((r->>'sessionKey') is not null)::text, 'false|true');
  checks := checks + 14;

  -- 2. Sign in with mobile + PIN (any way the number is typed).
  r := pg_temp.t34_in('98765 34001', pin_a, '10.34.0.1');
  fails := fails || pg_temp.t34_is('2 PIN signs in', (r->'person'->>'staffId') || '|' || (r->>'via') || '|' || (r->>'hasPin'), s_oa::text || '|pin|true');
  fails := fails || pg_temp.t34_is('2 gym A', r->>'gymId', ga::text);
  fails := fails || pg_temp.t34_is('2 device marked pin',
    (select via from public.gym_sessions where key_hash = public._hash_key(r->>'sessionKey')), 'pin');
  checks := checks + 3;

  -- 3. Five wrong tries (each from another caller) lock that PIN for 15 minutes; even the right PIN
  --    then waits.
  for i in 1..5 loop
    r := pg_temp.t34_in(ph_a, '999990', '10.34.1.' || i);
    fails := fails || pg_temp.t34_is('3 wrong ' || i, (r->>'error') || '|' || (r->>'triesLeft'), 'WRONG_CODE|' || (5 - i));
  end loop;
  fails := fails || pg_temp.t34_is('3 locked', (select (locked_until > now() + interval '14 minutes')::text from public.gym_staff_pins where staff_id = s_oa), 'true');
  r := pg_temp.t34_in(ph_a, pin_a, '10.34.2.1');
  fails := fails || pg_temp.t34_is('3 right PIN waits', (r->>'error') || '|' || ((r->>'lockedUntil') is not null)::text, 'TOO_MANY_TRIES|true');
  fails := fails || pg_temp.t34_is('3 owner list shows the lock',
    (select (e->>'pinLockedUntil' is not null)::text from jsonb_array_elements(public.owner_people(koa)) e where e->>'staffId' = s_oa::text), 'true');
  checks := checks + 8;

  -- 4. 15 minutes later (the lock moved into the past) the right PIN works, and the count is cleared.
  update public.gym_staff_pins set locked_until = now() - interval '1 second' where staff_id = s_oa;
  r := pg_temp.t34_in(ph_a, pin_a, '10.34.2.2');
  fails := fails || pg_temp.t34_is('4 lock over', r->>'via', 'pin');
  fails := fails || pg_temp.t34_is('4 cleared', (select wrong_tries || '|' || coalesce(locked_until::text, 'none') from public.gym_staff_pins where staff_id = s_oa), '0|none');
  -- A correct sign-in clears a count that has not reached 5.
  for i in 1..3 loop r := pg_temp.t34_in(ph_a, '999991', '10.34.3.' || i); end loop;
  fails := fails || pg_temp.t34_is('4 three counted', (select wrong_tries from public.gym_staff_pins where staff_id = s_oa)::text, '3');
  r := pg_temp.t34_in(ph_a, pin_a, '10.34.3.9');
  fails := fails || pg_temp.t34_is('4 right PIN clears', (select wrong_tries from public.gym_staff_pins where staff_id = s_oa)::text, '0');
  checks := checks + 4;

  -- 5. A one-time code still works, even while the PIN is locked, and its sign-in clears the lock.
  for i in 1..5 loop r := pg_temp.t34_in(ph_a, '999992', '10.34.4.' || i); end loop;
  c := public.owner_make_signin_code(koa, s_oa)->>'code';
  r := pg_temp.t34_in(ph_a, c, '10.34.4.9');
  fails := fails || pg_temp.t34_is('5 code while locked', (r->'person'->>'staffId') || '|' || (r->>'via') || '|' || (r->>'hasPin'), s_oa::text || '|code|true');
  fails := fails || pg_temp.t34_is('5 lock cleared', (select coalesce(locked_until::text, 'none') from public.gym_staff_pins where staff_id = s_oa), 'none');
  checks := checks + 2;

  -- 6. A desk person: first sign-in with a code, no PIN yet; sets one; weak ones refused; changing it
  --    later needs the current PIN unless this device signed in with a code in the last 15 minutes.
  r := public.owner_add_person(koa, 'Desk A', ph_d, 'staff');
  s_da := (r->>'staffId')::uuid;
  c := public.owner_make_signin_code(koa, s_da)->>'code';
  r := pg_temp.t34_in(ph_d, c, '10.34.5.1');
  kda := r->>'sessionKey';
  fails := fails || pg_temp.t34_is('6 code, no PIN', (r->>'via') || '|' || (r->>'hasPin'), 'code|false');
  r := public.staff_pin_status(kda);
  fails := fails || pg_temp.t34_is('6 status', (r->>'canSet') || '|' || (r->>'hasPin') || '|' || (r->>'needsCurrent'), 'true|false|false');
  foreach x in array array['000000', '987654', '456789', right(ph_d, 6)] loop
    fails := fails || pg_temp.t34_is('6 weak ' || x, public.staff_set_pin(kda, x)->>'error', 'WEAK_PIN');
  end loop;
  fails := fails || pg_temp.t34_is('6 bad', public.staff_set_pin(kda, '31415')->>'error', 'BAD_PIN');
  fails := fails || pg_temp.t34_is('6 set', public.staff_set_pin(kda, '314159')->>'ok', 'true');
  fails := fails || pg_temp.t34_is('6 fresh code: change without the current one', public.staff_set_pin(kda, '314160')->>'ok', 'true');
  update public.gym_sessions set created_at = now() - interval '1 hour' where key_hash = public._hash_key(kda);
  fails := fails || pg_temp.t34_is('6 later: needs current', public.staff_pin_status(kda)->>'needsCurrent', 'true');
  fails := fails || pg_temp.t34_is('6 no current', public.staff_set_pin(kda, '424242')->>'error', 'NEED_CURRENT');
  r := public.staff_set_pin(kda, '424242', '111112');
  fails := fails || pg_temp.t34_is('6 wrong current counts', (r->>'error') || '|' || (r->>'triesLeft'), 'WRONG_PIN|4');
  fails := fails || pg_temp.t34_is('6 right current', public.staff_set_pin(kda, '424242', '314160')->>'ok', 'true');
  r := pg_temp.t34_in(ph_d, '424242', '10.34.5.2');
  fails := fails || pg_temp.t34_is('6 desk PIN signs in', (r->'person'->>'staffId') || '|' || (r->>'via'), s_da::text || '|pin');
  fails := fails || pg_temp.t34_is('6 own row only', (select count(*) from public.gym_staff_pins where staff_id = s_da)::text, '1');
  fails := fails || pg_temp.t34_is('6 a dead key', pg_temp.t34_try('select public.staff_set_pin(''t34-nobody'', ''424242'')'), 'BAD_KEY');
  checks := checks + 16;

  -- 7. Another gym can't see, use, clear or set gym A's PINs. Gym B has a desk person with the SAME
  --    mobile as gym A's owner (no PIN).
  insert into public.gyms(name, join_code) values ('T34 Gym B', 'T34GYB') returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Owner B', '9876534003', 'owner') returning staff_id into s_ob;
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Same mobile', ph_a, 'staff') returning staff_id into s_xb;
  insert into public.gym_sessions(staff_id, key_hash) values (s_ob, public._hash_key(kob));
  fails := fails || pg_temp.t34_is('7 B cannot sign A out', pg_temp.t34_try(format('select public.owner_sign_out_person(%L, %L)', kob, s_oa)), 'GONE');
  fails := fails || pg_temp.t34_is('7 B list has no A',
    (select count(*) from jsonb_array_elements(public.owner_people(kob)) e where e->>'staffId' in (s_oa::text, s_da::text))::text, '0');
  fails := fails || pg_temp.t34_is('7 B list: nobody has a PIN',
    (select count(*) from jsonb_array_elements(public.owner_people(kob)) e where e->>'hasPin' = 'true')::text, '0');
  r := pg_temp.t34_in(ph_a, pin_a, '10.34.6.1');
  fails := fails || pg_temp.t34_is('7 A PIN lands in gym A', (r->>'gymId') || '|' || (r->'person'->>'staffId'), ga::text || '|' || s_oa::text);
  fails := fails || pg_temp.t34_is('7 B desk got no PIN', (select count(*) from public.gym_staff_pins where staff_id = s_xb)::text, '0');
  fails := fails || pg_temp.t34_is('7 B owner status', public.staff_pin_status(kob)->>'hasPin', 'false');
  -- Gym A's owner setting a PIN touches only gym A's row, never gym B's person with the same mobile.
  fails := fails || pg_temp.t34_is('7 A changes', public.staff_set_pin(koa, '161803', pin_a)->>'ok', 'true');
  fails := fails || pg_temp.t34_is('7 still not on B', (select count(*) from public.gym_staff_pins where staff_id = s_xb)::text, '0');
  pin_a := '161803';
  checks := checks + 8;

  -- 8. A removed person's PIN dies with them.
  perform public.owner_remove_person(koa, s_da);
  fails := fails || pg_temp.t34_is('8 PIN gone', (select count(*) from public.gym_staff_pins where staff_id = s_da)::text, '0');
  r := pg_temp.t34_in(ph_d, '424242', '10.34.7.1');
  fails := fails || pg_temp.t34_is('8 cannot sign in', coalesce(r->>'error', 'signed in'), 'WRONG_CODE');
  checks := checks + 2;

  -- 9. The owner's "Sign out everywhere" (here: other devices) clears the owner's PIN; this device stays.
  perform public.owner_sign_out_person(koa, s_oa);
  fails := fails || pg_temp.t34_is('9 PIN cleared', public.staff_pin_status(koa)->>'hasPin', 'false');
  fails := fails || pg_temp.t34_is('9 this device stays', (public._owner_gym(koa) = ga)::text, 'true');
  r := pg_temp.t34_in(ph_a, pin_a, '10.34.8.1');
  fails := fails || pg_temp.t34_is('9 old PIN refused', coalesce(r->>'error', 'signed in'), 'WRONG_CODE');
  fails := fails || pg_temp.t34_is('9 new PIN without the old one', public.staff_set_pin(koa, pin_a)->>'ok', 'true');
  checks := checks + 4;

  -- 10. HQ's reset clears the owner's PIN, then the one-time code works as before.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  r := public.hq_reset_owner_signin('owner@example.com', ga, null, true);
  perform set_config('request.jwt.claims', '', true);
  fails := fails || pg_temp.t34_is('10 PIN cleared', (select count(*) from public.gym_staff_pins where staff_id = s_oa)::text, '0');
  c := r->>'code';
  r := pg_temp.t34_in(ph_a, pin_a, '10.34.9.1');
  fails := fails || pg_temp.t34_is('10 old PIN refused', coalesce(r->>'error', 'signed in'), 'WRONG_CODE');
  r := pg_temp.t34_in(ph_a, c, '10.34.9.2');
  fails := fails || pg_temp.t34_is('10 code works', (r->'person'->>'staffId') || '|' || (r->>'via') || '|' || (r->>'hasPin'), s_oa::text || '|code|false');
  checks := checks + 3;

  -- 11. The PIN is never readable by the apps' roles, and no answer carries a hash.
  fails := fails || pg_temp.t34_is('11 no table rights', (has_table_privilege('anon', 'public.gym_staff_pins', 'select')
    or has_table_privilege('authenticated', 'public.gym_staff_pins', 'select'))::text, 'false');
  foreach x in array array['anon', 'authenticated'] loop
    begin
      execute format('set local role %I', x);
      execute 'select count(*) from public.gym_staff_pins' into n;
      reset role;
      if n > 0 then fails := fails || ' 11 ' || x || ' reads ' || n || ' rows'; end if;
    exception when insufficient_privilege then
      reset role;  -- quiet: refused outright, which is the point
    end;
  end loop;
  fails := fails || pg_temp.t34_is('11 helpers not callable', (has_function_privilege('anon', 'public._pin_problem(text, text)', 'execute')
    or has_function_privilege('anon', 'public._pin_people(public.gym_staff)', 'execute')
    or has_function_privilege('anon', 'public._fresh_code_session(text)', 'execute')
    or has_function_privilege('anon', 'public.hq_reset_owner_signin(text, uuid, uuid, boolean)', 'execute'))::text, 'false');
  fails := fails || pg_temp.t34_is('11 no hash in answers',
    ((public.owner_people(koa)::text || public.staff_pin_status(koa)::text || public.staff_set_pin(koa, '583209')::text) like '%$2a$%')::text, 'false');
  checks := checks + 4;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
