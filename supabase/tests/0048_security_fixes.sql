-- Security fixes test (0048, R-287). Runs in CI after every migration (scripts/ci/db_checks.sh: a
-- throw-away local Supabase applies every migration, then each test must end with "RESULT PASS").
-- It can also be pasted into the SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

create or replace function pg_temp.t48_try(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t48_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- Sign in as if from caller address p_ip (each wrong try from its own address, so the old
-- 5-per-caller limit never hides the PIN lock).
create or replace function pg_temp.t48_in(p_phone text, p_code text, p_ip text) returns jsonb
  language plpgsql as $$
begin
  perform set_config('request.headers', format('{"cf-connecting-ip":"%s"}', p_ip), true);
  return public.staff_sign_in(p_phone, p_code, 't48 device');
end $$;

do $$
declare
  ga uuid; gd uuid; s_own uuid; s_desk uuid;
  kown text := 't48-owner'; kop text := 't48-owner-person'; kdesk text := 't48-desk'; kdemo text := 't48-demo';
  ka text := 't48-m-asha'; kb text := 't48-m-bilal'; kx text := 't48-m-x';
  ma uuid; mb uuid; lid uuid; lid2 uuid; cid uuid;
  ph_own text := '9876548001'; pin_own text := '271828';
  r jsonb; n int; i int; fails text := ''; checks int := 0;
  td date := (now() at time zone 'Asia/Kolkata')::date;
begin
  perform set_config('request.headers', '', true);
  insert into public.gyms(name, join_code, crm_version) values ('T48 Gym', 'T48GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code) values ('T48 Demo', 'T48GYD') returning gym_id into gd;
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kown)), (gd, public._hash_key(kdemo));
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner', ph_own, 'owner') returning staff_id into s_own;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Desk', '9876548002', 'staff') returning staff_id into s_desk;
  insert into public.gym_sessions(staff_id, key_hash) values (s_own, public._hash_key(kop)), (s_desk, public._hash_key(kdesk));
  insert into public.gym_members(gym_id, name, key_hash) values (ga, 'Asha app', public._hash_key(ka)) returning member_id into ma;
  insert into public.gym_members(gym_id, name, key_hash) values (ga, 'Bilal app', public._hash_key(kb)) returning member_id into mb;
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829048001","archived":false,"createdAt":1}', 1),
    (ga, 'member', 'm-bilal', '{"fullName":"Bilal Khan","phone":"+919829048002","archived":false,"createdAt":2}', 1),
    (ga, 'membership', 'ms-a', jsonb_build_object('memberId','m-asha','startsOn','2020-01-01','endsOn','2099-01-01','cancelled', false), 1);

  -- ---------------------------------------------------------------- 1. a typed number waits for the desk
  r := public.member_check_in(ka, 'T48GYA', '98290 48001');
  fails := fails || pg_temp.t48_is('1a desk check', (r->>'error') || '|' || (r->>'deskCheck') || '|' || (r->>'gymName'),
    'TOO_MANY_NUMBERS|true|T48 Gym');
  fails := fails || pg_temp.t48_is('1b names nobody', (r ? 'memberName' or r ? 'planOk' or r ? 'ok')::text, 'false');
  fails := fails || pg_temp.t48_is('1c not linked yet', (select coalesce(checkin_phone, '-') from public.gym_members where member_id = ma), '-');
  fails := fails || pg_temp.t48_is('1d no visit', (select count(*)::text from public.crm_records where gym_id = ga and kind = 'visit'), '0');
  -- Typed again: still one request (the same row).
  r := public.member_check_in(ka, 'T48GYA', '9829048001');
  fails := fails || pg_temp.t48_is('1e one request', (select count(*)::text from public.gym_phone_links where app_member = ma), '1');
  -- A number nobody has is not a request.
  r := public.member_check_in(kb, 'T48GYA', '9000048009');
  fails := fails || pg_temp.t48_is('1f no match', (r->>'error') || '|' ||
    (select count(*)::text from public.gym_phone_links where app_member = mb), 'NOT_ON_ROSTER|0');
  checks := checks + 6;

  -- The desk's list: the roster name, the app name, the number.
  r := public.owner_phone_links(kdesk);
  fails := fails || pg_temp.t48_is('2a list', (r->0->>'memberName') || '|' || (r->0->>'appName') || '|' || (r->0->>'phone') || '|' || (r->0->>'status'),
    'Asha Verma|Asha app|+919829048001|pending');
  lid := (r->0->>'id')::uuid;
  fails := fails || pg_temp.t48_is('2b other gym sees nothing', jsonb_array_length(public.owner_phone_links(kdemo))::text, '0');
  fails := fails || pg_temp.t48_is('2c other gym cannot decide',
    pg_temp.t48_try(format('select public.owner_decide_phone_link(%L, %L::uuid, %L)', kdemo, lid, 'approved')), 'GONE');
  fails := fails || pg_temp.t48_is('2d bad decision',
    pg_temp.t48_try(format('select public.owner_decide_phone_link(%L, %L::uuid, %L)', kdesk, lid, 'maybe')), 'INVALID');
  fails := fails || pg_temp.t48_is('2e bad key', pg_temp.t48_try(format('select public.owner_phone_links(%L)', 'no-such-key')), 'BAD_KEY');
  checks := checks + 5;

  -- The desk says yes: linked; the scan then checks in with the name; the same yes again is fine; a no is refused.
  r := public.owner_decide_phone_link(kdesk, lid, 'approved');
  fails := fails || pg_temp.t48_is('3a approved', r->>'status', 'approved');
  fails := fails || pg_temp.t48_is('3b linked', (select checkin_phone || '|' || phone from public.gym_members where member_id = ma),
    '+919829048001|+919829048001');
  fails := fails || pg_temp.t48_is('3c who', (select decided_by_name from public.gym_phone_links where link_id = lid), 'Desk');
  fails := fails || pg_temp.t48_is('3d again', public.owner_decide_phone_link(kdesk, lid, 'approved')->>'status', 'approved');
  fails := fails || pg_temp.t48_is('3e no after yes',
    pg_temp.t48_try(format('select public.owner_decide_phone_link(%L, %L::uuid, %L)', kdesk, lid, 'declined')), 'ALREADY_DECIDED');
  r := public.member_check_in(ka, 'T48GYA');
  fails := fails || pg_temp.t48_is('3f checks in', (r->>'ok') || '|' || (r->>'memberName'), 'true|Asha');
  checks := checks + 6;

  -- A no: nothing linked; a new try makes a new request.
  r := public.member_check_in(kb, 'T48GYA', '9829048002');
  select link_id into lid2 from public.gym_phone_links where app_member = mb and status = 'pending';
  perform public.owner_decide_phone_link(kown, lid2, 'declined');
  fails := fails || pg_temp.t48_is('4a declined', (select coalesce(checkin_phone, '-') from public.gym_members where member_id = mb), '-');
  r := public.member_check_in(kb, 'T48GYA', '9829048002');
  fails := fails || pg_temp.t48_is('4b asks again', (select count(*)::text from public.gym_phone_links where app_member = mb), '2');
  checks := checks + 2;

  -- The gym-wide cap: 30 new requests an hour, then no more.
  delete from public.gym_phone_links where gym_id = ga;
  insert into public.gym_phone_links(gym_id, app_member, roster_id, phone, status, decided_at)
    select ga, ma, 'm-asha', '+919829048001', 'declined', now() from generate_series(1, 30);
  r := public.member_check_in(kb, 'T48GYA', '9829048002');
  fails := fails || pg_temp.t48_is('5 cap', (r->>'error') || '|' || coalesce(r->>'deskCheck', '-') || '|' ||
    (select count(*)::text from public.gym_phone_links where app_member = mb), 'TOO_MANY_NUMBERS|-|0');
  checks := checks + 1;

  -- ---------------------------------------------------------------- 6. PIN locks grow
  fails := fails || pg_temp.t48_is('6a lengths', (public._pin_lock_for(1) || '|' || public._pin_lock_for(2) || '|' ||
    public._pin_lock_for(3) || '|' || public._pin_lock_for(4)), '00:15:00|00:15:00|01:00:00|24:00:00');
  r := public.staff_set_pin(kop, pin_own);
  for i in 1..5 loop r := pg_temp.t48_in(ph_own, '000000', '10.48.0.' || i); end loop;
  fails := fails || pg_temp.t48_is('6b first lock 15 min', (select (lock_streak || '|' ||
    (locked_until between now() + interval '14 minutes' and now() + interval '16 minutes'))::text from public.gym_staff_pins where staff_id = s_own), '1|true');
  -- The 2nd and 3rd lock in a day: 15 minutes, then 1 hour.
  update public.gym_staff_pins set locked_until = now() - interval '1 second' where staff_id = s_own;
  for i in 1..5 loop r := pg_temp.t48_in(ph_own, '000000', '10.48.1.' || i); end loop;
  update public.gym_staff_pins set locked_until = now() - interval '1 second' where staff_id = s_own;
  for i in 1..5 loop r := pg_temp.t48_in(ph_own, '000000', '10.48.2.' || i); end loop;
  fails := fails || pg_temp.t48_is('6c third lock 1 h', (select (lock_streak || '|' ||
    (locked_until between now() + interval '59 minutes' and now() + interval '61 minutes'))::text from public.gym_staff_pins where staff_id = s_own), '3|true');
  update public.gym_staff_pins set locked_until = now() - interval '1 second' where staff_id = s_own;
  for i in 1..5 loop r := pg_temp.t48_in(ph_own, '000000', '10.48.3.' || i); end loop;
  fails := fails || pg_temp.t48_is('6d fourth lock 24 h', (select (lock_streak || '|' ||
    (locked_until > now() + interval '23 hours'))::text from public.gym_staff_pins where staff_id = s_own), '4|true');
  -- Locked: even the right PIN does not sign in.
  r := pg_temp.t48_in(ph_own, pin_own, '10.48.4.1');
  fails := fails || pg_temp.t48_is('6e locked', r->>'error', 'TOO_MANY_TRIES');
  -- A day later the count starts again; a right PIN resets it.
  update public.gym_staff_pins set locked_until = now() - interval '1 second', last_locked_at = now() - interval '25 hours' where staff_id = s_own;
  for i in 1..5 loop r := pg_temp.t48_in(ph_own, '000000', '10.48.5.' || i); end loop;
  fails := fails || pg_temp.t48_is('6f a day later', (select lock_streak::text from public.gym_staff_pins where staff_id = s_own), '1');
  update public.gym_staff_pins set locked_until = now() - interval '1 second' where staff_id = s_own;
  r := pg_temp.t48_in(ph_own, pin_own, '10.48.6.1');
  fails := fails || pg_temp.t48_is('6g right PIN', (r->>'via') || '|' ||
    (select lock_streak::text from public.gym_staff_pins where staff_id = s_own), 'pin|0');
  fails := fails || pg_temp.t48_is('6h helper closed',
    (has_function_privilege('anon', 'public._pin_lock_for(int)', 'execute')
     or has_function_privilege('authenticated', 'public._pin_lock_for(int)', 'execute'))::text, 'false');
  checks := checks + 8;
  perform set_config('request.headers', '', true);

  -- ---------------------------------------------------------------- 7. challenge winners wait for the owner
  insert into public.gym_member_days(gym_id, member_id, day, workouts, kg) values (ga, ma, td - 3, 3, 100), (ga, mb, td - 3, 3, 100);
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days)
    values (ga, 'T48 push', 'workouts', 2, td - 10, td - 1, 5) returning id into cid;
  perform public.owner_challenges(kown);
  fails := fails || pg_temp.t48_is('7a confirm', (select string_agg(reward_state, ',' order by name) from public.gym_challenge_hits where challenge_id = cid),
    'confirm,confirm');
  fails := fails || pg_temp.t48_is('7b nothing yet', (select data->>'endsOn' from public.crm_records where gym_id = ga and id = 'ms-a') || '|' ||
    (select count(*)::text from public.gym_messages where gym_id = ga), '2099-01-01|0');
  fails := fails || pg_temp.t48_is('7c desk cannot',
    pg_temp.t48_try(format('select public.owner_confirm_challenge_reward(%L, %L::uuid, %L::uuid, true)', kdesk, cid, ma)), 'NOT_OWNER');
  fails := fails || pg_temp.t48_is('7d other gym',
    pg_temp.t48_try(format('select public.owner_confirm_challenge_reward(%L, %L::uuid, %L::uuid, true)', kdemo, cid, ma)), 'GONE');
  r := public.owner_confirm_challenge_reward(kop, cid, ma, true);
  fails := fails || pg_temp.t48_is('7e give', (r->>'state') || '|' || (r->>'days') || '|' ||
    (select data->>'endsOn' from public.crm_records where gym_id = ga and id = 'ms-a'), 'added|5|2099-01-06');
  r := public.owner_confirm_challenge_reward(kown, cid, mb, false);
  fails := fails || pg_temp.t48_is('7f skip', (r->>'state') || '|' || (r->>'reason'), 'none|skipped');
  fails := fails || pg_temp.t48_is('7g one message', (select count(*)::text from public.gym_messages where gym_id = ga), '1');
  -- Pressed again: nothing changes.
  r := public.owner_confirm_challenge_reward(kown, cid, ma, true);
  r := public.owner_confirm_challenge_reward(kown, cid, mb, true);
  fails := fails || pg_temp.t48_is('7h once', (r->>'state') || '|' ||
    (select data->>'endsOn' from public.crm_records where gym_id = ga and id = 'ms-a') || '|' ||
    (select count(*)::text from public.gym_messages where gym_id = ga), 'none|2099-01-06|1');
  checks := checks + 8;

  -- ---------------------------------------------------------------- 8. hasPeople: a demo gym has nobody
  fails := fails || pg_temp.t48_is('8a real gym', public.staff_me(kown)->>'hasPeople', 'true');
  fails := fails || pg_temp.t48_is('8b demo gym', public.staff_me(kdemo)->>'hasPeople', 'false');
  checks := checks + 2;

  -- ---------------------------------------------------------------- 9. the table stays closed
  fails := fails || pg_temp.t48_is('9 closed', (has_table_privilege('anon', 'public.gym_phone_links', 'select')
    or has_table_privilege('authenticated', 'public.gym_phone_links', 'insert'))::text, 'false');
  checks := checks + 1;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
