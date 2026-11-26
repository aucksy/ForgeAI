-- "A gym added you" test (0100, F239, R-629). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be
-- pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- Fake numbers only (90001 00xxx); the secret here is a test value.

create or replace function pg_temp.t100_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- The account e-mail 0099 gives this number (generation n; 0 = the first).
create or replace function pg_temp.t100_email(p_phone text, p_gen int) returns text
  language sql as $$
  select 'm-' || substr(encode(extensions.hmac('account:' || p_phone, 'test-secret-0123456789abcdef0123456789abcdef', 'sha256'), 'hex'), 1, 40)
         || case when p_gen > 0 then '-' || p_gen else '' end || '@phone.mettleup.fit'
$$;

create or replace function pg_temp.t100_user(p_email text, p_days_ago int) returns uuid
  language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, raw_app_meta_data, created_at, updated_at, last_sign_in_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
          jsonb_build_object('via', 'phone'),
          now() - make_interval(days => p_days_ago), now() - make_interval(days => p_days_ago),
          now() - make_interval(days => p_days_ago));
  return v;
end $$;

-- Act as this signed-in account (as PostgREST sets it).
create or replace function pg_temp.t100_as(p_user uuid) returns void
  language sql as $$
  select set_config('request.jwt.claims',
    case when p_user is null then '{"role":"anon"}'
         else jsonb_build_object('role', 'authenticated', 'sub', p_user::text)::text end, true);
  select null::void;
$$;

do $$
declare
  vik_ph text := '9000100001'; mona_ph text := '9000100002'; lap_ph text := '9000100003'; old_ph text := '9000100004';
  gone_ph text := '9000100005'; nobody_ph text := '9000100006'; tara_ph text := '9000100007'; goog_ph text := '9000100008';
  ga uuid; gb uuid; gd uuid; ge uuid; tara_staff uuid;
  u_vik uuid; u_mona uuid; u_lap uuid; u_old0 uuid; u_old1 uuid; u_gone uuid; u_nobody uuid; u_tara uuid; u_goog uuid;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  past text := to_char(today - 60, 'YYYY-MM-DD');
  later text := to_char(today + 25, 'YYYY-MM-DD');
  ended5 text := to_char(today - 5, 'YYYY-MM-DD');
  ended20 text := to_char(today - 20, 'YYYY-MM-DD');
  starts text := to_char(today + 3, 'YYYY-MM-DD');
  mkey text := 't100-member-key-0123456789'; mid uuid;
  r jsonb; fails text := ''; checks int := 0; i int;
begin
  delete from public.phone_code_settings;
  insert into public.phone_code_settings(secret) values ('test-secret-0123456789abcdef0123456789abcdef');
  update public.phone_gym_check_settings set "on" = true;

  insert into public.gyms(name, join_code, crm_version, brand_accent) values ('T100 Iron', 'T100AA', 1, '#E11D48') returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T100 Beta', 'T100BB', 1) returning gym_id into gb;
  insert into public.gyms(name, join_code, crm_version) values ('T100 Delta', 'T100DD', 1) returning gym_id into gd;
  insert into public.gyms(name, join_code, crm_version) values ('T100 Paused', 'T100EE', 1) returning gym_id into ge;

  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Vik Shah', vik_ph, 'owner');
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Tara Iyer', tara_ph, 'staff') returning staff_id into tara_staff;
  insert into public.gym_trainers(staff_id, gym_id) values (tara_staff, gb);
  insert into public.gym_staff(gym_id, name, phone, role) values (ge, 'Tara Iyer', tara_ph, 'staff');

  insert into public.crm_records(gym_id, kind, id, data, version) values
    -- Mona: plan running at Delta.
    (gd, 'member', 't100-mona', jsonb_build_object('fullName', 'Mona Das', 'phone', '+91' || mona_ph), 1),
    (gd, 'membership', 't100-mona-m', jsonb_build_object('memberId', 't100-mona', 'startsOn', past, 'endsOn', later, 'cancelled', false), 1),
    -- Lata: plan ended 5 days ago at Delta (lapsed, still found) and 20 days ago at Beta (too old, not found).
    (gd, 'member', 't100-lata-d', jsonb_build_object('fullName', 'Lata', 'phone', lap_ph), 1),
    (gd, 'membership', 't100-lata-dm', jsonb_build_object('memberId', 't100-lata-d', 'startsOn', past, 'endsOn', ended5, 'cancelled', false), 1),
    (gb, 'member', 't100-lata-b', jsonb_build_object('fullName', 'Lata', 'phone', lap_ph), 1),
    (gb, 'membership', 't100-lata-bm', jsonb_build_object('memberId', 't100-lata-b', 'startsOn', past, 'endsOn', ended20, 'cancelled', false), 1),
    -- Lata at Iron: a plan that starts in 3 days (not yet).
    (ga, 'member', 't100-lata-a', jsonb_build_object('fullName', 'Lata', 'phone', lap_ph), 1),
    (ga, 'membership', 't100-lata-am', jsonb_build_object('memberId', 't100-lata-a', 'startsOn', starts, 'endsOn', later, 'cancelled', false), 1),
    -- Old number: on Delta's list with a running plan, as the NEW holder (Ravi).
    (gd, 'member', 't100-ravi', jsonb_build_object('fullName', 'Ravi', 'phone', old_ph), 1),
    (gd, 'membership', 't100-ravi-m', jsonb_build_object('memberId', 't100-ravi', 'startsOn', past, 'endsOn', later, 'cancelled', false), 1),
    -- Gone: deleted from Delta's list.
    (gd, 'member', 't100-gone', jsonb_build_object('fullName', 'Gopal', 'phone', gone_ph), 1),
    (gd, 'membership', 't100-gone-m', jsonb_build_object('memberId', 't100-gone', 'startsOn', past, 'endsOn', later, 'cancelled', false), 1);
  update public.crm_records set deleted = true where gym_id = gd and id = 't100-gone';

  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = ge;
  perform set_config('forgeai.hq', 'off', true);

  u_vik := pg_temp.t100_user(pg_temp.t100_email(vik_ph, 0), 1);
  u_mona := pg_temp.t100_user(pg_temp.t100_email(mona_ph, 0), 1);
  u_lap := pg_temp.t100_user(pg_temp.t100_email(lap_ph, 0), 1);
  u_old0 := pg_temp.t100_user(pg_temp.t100_email(old_ph, 0), 200);
  u_old1 := pg_temp.t100_user(pg_temp.t100_email(old_ph, 1), 2);
  u_gone := pg_temp.t100_user(pg_temp.t100_email(gone_ph, 0), 1);
  u_nobody := pg_temp.t100_user(pg_temp.t100_email(nobody_ph, 0), 1);
  u_tara := pg_temp.t100_user(pg_temp.t100_email(tara_ph, 0), 1);
  u_goog := pg_temp.t100_user('someone.t100@example.com', 1);

  -- 1. Owner: Vik finds Iron as owner (any first name: staff rows need none).
  perform pg_temp.t100_as(u_vik);
  r := public.phone_account_gyms('Vik');
  checks := checks + 1; fails := fails || pg_temp.t100_is('1ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t100_is('1n', jsonb_array_length(r->'matches')::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t100_is('1role', r->'matches'->0->>'role', 'owner');
  checks := checks + 1; fails := fails || pg_temp.t100_is('1code', r->'matches'->0->>'joinCode', 'T100AA');
  checks := checks + 1; fails := fails || pg_temp.t100_is('1brand', r->'matches'->0->'brand'->>'accent', '#E11D48');

  -- 2. Trainer: Tara at Beta; the suspended gym never shows.
  perform pg_temp.t100_as(u_tara);
  r := public.phone_account_gyms('Tara');
  checks := checks + 1; fails := fails || pg_temp.t100_is('2n', jsonb_array_length(r->'matches')::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t100_is('2role', r->'matches'->0->>'role', 'trainer');

  -- 3. Member with a running plan; wrong first name finds nothing; no data of other members.
  perform pg_temp.t100_as(u_mona);
  r := public.phone_account_gyms('Mona');
  checks := checks + 1; fails := fails || pg_temp.t100_is('3role', r->'matches'->0->>'role', 'member');
  checks := checks + 1; fails := fails || pg_temp.t100_is('3lapsed', r->'matches'->0->>'lapsed', 'false');
  checks := checks + 1; fails := fails || pg_temp.t100_is('3ends', r->'matches'->0->>'endsOn', later);
  checks := checks + 1; fails := fails || pg_temp.t100_is('3noprice', (strpos(r::text, 'price') = 0)::text, 'true');
  r := public.phone_account_gyms('Priya');
  checks := checks + 1; fails := fails || pg_temp.t100_is('3name', jsonb_array_length(r->'matches')::text, '0');

  -- 4. Lapsed: ended 5 days ago -> found, lapsed; ended 20 days ago -> not; starts in 3 days -> not yet.
  perform pg_temp.t100_as(u_lap);
  r := public.phone_account_gyms('Lata');
  checks := checks + 1; fails := fails || pg_temp.t100_is('4n', jsonb_array_length(r->'matches')::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t100_is('4gym', r->'matches'->0->>'gymName', 'T100 Delta');
  checks := checks + 1; fails := fails || pg_temp.t100_is('4lapsed', r->'matches'->0->>'lapsed', 'true');
  checks := checks + 1; fails := fails || pg_temp.t100_is('4ends', r->'matches'->0->>'endsOn', ended5);

  -- 5. Only the caller's OWN number counts: Vik typing Mona's name still gets only his own gym (never Mona's Delta),
  -- and no answer ever carries a number.
  perform pg_temp.t100_as(u_vik);
  r := public.phone_account_gyms('Mona');
  checks := checks + 1; fails := fails || pg_temp.t100_is('5own', (r->'matches'->0->>'gymName') || '/' || jsonb_array_length(r->'matches'), 'T100 Iron/1');
  checks := checks + 1; fails := fails || pg_temp.t100_is('5nonumber', (r::text ~ '90001000')::text, 'false');
  perform pg_temp.t100_as(u_mona);
  r := public.phone_account_gyms('Mona');
  checks := checks + 1; fails := fails || pg_temp.t100_is('5nonumber2', (r::text ~ '90001000')::text, 'false');

  -- 6. Recycled number: the old holder's (older) account learns nothing; the new holder's finds Delta.
  perform pg_temp.t100_as(u_old0);
  r := public.phone_account_gyms('Ravi');
  checks := checks + 1; fails := fails || pg_temp.t100_is('6old', r->>'error', 'NOT_YOUR_NUMBER');
  perform pg_temp.t100_as(u_old1);
  r := public.phone_account_gyms('Ravi');
  checks := checks + 1; fails := fails || pg_temp.t100_is('6new', r->'matches'->0->>'gymName', 'T100 Delta');

  -- 7. A Google account or no sign-in: refused.
  perform pg_temp.t100_as(u_goog);
  r := public.phone_account_gyms('Ann');
  checks := checks + 1; fails := fails || pg_temp.t100_is('7google', r->>'error', 'NOT_PHONE_ACCOUNT');
  perform pg_temp.t100_as(null);
  r := public.phone_account_gyms('Vik');
  checks := checks + 1; fails := fails || pg_temp.t100_is('7anon', r->>'error', 'NOT_PHONE_ACCOUNT');

  -- 8. Deleted from the list, or on no list: nothing.
  perform pg_temp.t100_as(u_gone);
  r := public.phone_account_gyms('Gopal');
  checks := checks + 1; fails := fails || pg_temp.t100_is('8gone', jsonb_array_length(r->'matches')::text, '0');
  perform pg_temp.t100_as(u_nobody);
  r := public.phone_account_gyms('Nobody');
  checks := checks + 1; fails := fails || pg_temp.t100_is('8none', jsonb_array_length(r->'matches')::text, '0');
  -- Each check keeps one log row: the account and the count, never the number.
  checks := checks + 1; fails := fails || pg_temp.t100_is('8log',
    (select count(*) from public.phone_gym_checks where user_id = u_nobody and found = 0)::text, '1');

  -- 9. Limit: 6 checks per account per 24 h (Nobody has 1 already).
  for i in 1..5 loop r := public.phone_account_gyms('Nobody'); end loop;
  checks := checks + 1; fails := fails || pg_temp.t100_is('9sixth', r->>'ok', 'true');
  r := public.phone_account_gyms('Nobody');
  checks := checks + 1; fails := fails || pg_temp.t100_is('9seventh', r->>'error', 'TOO_MANY');

  -- 10. Switch off: answers off, nothing found, no log row.
  update public.phone_gym_check_settings set "on" = false;
  perform pg_temp.t100_as(u_mona);
  r := public.phone_account_gyms('Mona');
  checks := checks + 1; fails := fails || pg_temp.t100_is('10off', r->>'off', 'true');
  checks := checks + 1; fails := fails || pg_temp.t100_is('10none', jsonb_array_length(r->'matches')::text, '0');
  update public.phone_gym_check_settings set "on" = true;

  -- 11. The first-screen sign-in (0093) uses the same member rule: the lapsed member is found there too.
  r := public.phone_sign_in_find(
         (select b || '.' || encode(extensions.hmac(b, 'test-secret-0123456789abcdef0123456789abcdef', 'sha256'), 'hex')
            from (select 'v1.member.' || lap_ph || '.' || (extract(epoch from now())::bigint + 900) || '.' || repeat('9', 32) as b) x),
         'Lata');
  checks := checks + 1; fails := fails || pg_temp.t100_is('11signin', r->'matches'->0->>'gymName', 'T100 Delta');
  checks := checks + 1; fails := fails || pg_temp.t100_is('11lapsed', r->'matches'->0->>'lapsed', 'true');

  -- 12. Claim after the join: Mona joins Delta in the app, then the account links the gym's list row.
  insert into public.gym_members(gym_id, name, key_hash) values (gd, 'Mona', public._hash_key(mkey)) returning member_id into mid;
  perform pg_temp.t100_as(u_vik);
  r := public.phone_account_claim(mkey);
  checks := checks + 1; fails := fails || pg_temp.t100_is('12other', r->>'error', 'NOT_ON_ROSTER');
  perform pg_temp.t100_as(u_mona);
  r := public.phone_account_claim(mkey);
  checks := checks + 1; fails := fails || pg_temp.t100_is('12ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t100_is('12phone',
    (select checkin_phone from public.gym_members where member_id = mid), '+91' || mona_ph);

  -- 13. Who may call: the app's signed-in role only; never anon; the helpers never.
  checks := checks + 1; fails := fails || pg_temp.t100_is('13anon',
    has_function_privilege('anon', 'public.phone_account_gyms(text)', 'execute')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t100_is('13auth',
    has_function_privilege('authenticated', 'public.phone_account_gyms(text)', 'execute')::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t100_is('13claimanon',
    has_function_privilege('anon', 'public.phone_account_claim(text)', 'execute')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t100_is('13find',
    has_function_privilege('authenticated', 'public._phone_gym_find(text, text)', 'execute')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t100_is('13num',
    has_function_privilege('authenticated', 'public._phone_for_code(text, text, uuid)', 'execute')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t100_is('13code',
    has_function_privilege('authenticated', 'public._phone_account_code()', 'execute')::text, 'false');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
