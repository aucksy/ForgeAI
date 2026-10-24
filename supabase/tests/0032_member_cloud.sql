-- Members' cloud copy and the free plan's switch (0032, tracker #50 and #43). Runs in CI after every
-- migration (scripts/ci/db_checks.sh) and can be pasted into the SQL Editor. It ALWAYS ends in an
-- error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

-- '' when got = want, else ' label:got'. A put's answer {saved, older, olderIds} is compared on
-- saved and older (olderIds has its own checks).
create or replace function pg_temp.t32_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case
    when p_got is not distinct from p_want then ''
    when p_want like '{"older":%' and p_got like '{%' and (p_got::jsonb - 'olderIds') = p_want::jsonb then ''
    else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- Run p_sql (one text value) as p_role with the signed-in id p_sub (null = not signed in). The value,
-- or the error it raised. The role is always put back.
create or replace function pg_temp.t32_as(p_role text, p_sub uuid, p_sql text) returns text
  language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims',
    case when p_sub is null then json_build_object('role', p_role)::text
         else json_build_object('role', p_role, 'sub', p_sub)::text end, true);
  execute format('set local role %I', p_role);
  execute p_sql into v;
  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  return v;
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  return sqlerrm;
end $$;

do $$
declare
  ma uuid := gen_random_uuid(); mb uuid := gen_random_uuid(); ow uuid := gen_random_uuid();
  ga uuid; r text; big text; many text; n bigint;
  fails text := ''; checks int := 0;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into public.gyms(name, join_code) values ('T32 Gym', 'T32GYM') returning gym_id into ga;
  insert into auth.users(instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', ma, 'authenticated', 'authenticated', 't32-a-' || ma || '@example.invalid'),
    ('00000000-0000-0000-0000-000000000000', mb, 'authenticated', 'authenticated', 't32-b-' || mb || '@example.invalid'),
    ('00000000-0000-0000-0000-000000000000', ow, 'authenticated', 'authenticated', 't32-o-' || ow || '@example.invalid');
  -- Member A and an OWNER account of the same gym (the 0001 sign-in design): the owner must still see nothing.
  insert into public.profiles(id, gym_id, role) values (ma, ga, 'member'), (ow, ga, 'owner');

  -- 1. The free plan's switch: off at launch, Hevy's numbers, readable without signing in.
  r := pg_temp.t32_as('anon', null, 'select public.app_limits()::text');
  fails := fails || pg_temp.t32_is('1 off', (r::jsonb->>'on'), 'false');
  fails := fails || pg_temp.t32_is('1 numbers', (r::jsonb->>'routines') || '/' || (r::jsonb->>'customExercises') || '/' || (r::jsonb->>'chartMonths'), '4/7/3');
  fails := fails || pg_temp.t32_is('1 table closed to anon', pg_temp.t32_as('anon', null, 'select count(*)::text from public.app_config'), 'permission denied for table app_config');
  fails := fails || pg_temp.t32_is('1 table closed to members', pg_temp.t32_as('authenticated', ma,
    'update public.app_config set value = ''{"on": true}'' returning key'), 'permission denied for table app_config');
  -- HQ (the secret key) switches it; the app's read follows.
  update public.app_config set value = jsonb_set(value, '{on}', 'true') where key = 'free_limits';
  fails := fails || pg_temp.t32_is('1 HQ switch on', (pg_temp.t32_as('anon', null, 'select public.app_limits()::text'))::jsonb->>'on', 'true');
  update public.app_config set value = jsonb_set(value, '{on}', 'false') where key = 'free_limits';
  checks := checks + 5;

  -- 2. Not signed in: no way in.
  fails := fails || pg_temp.t32_is('2 anon put', pg_temp.t32_as('anon', null,
    'select public.member_copy_put(''[]'')::text'), 'permission denied for function member_copy_put');
  fails := fails || pg_temp.t32_is('2 anon get', pg_temp.t32_as('anon', null,
    'select public.member_copy_get()::text'), 'permission denied for function member_copy_get');
  fails := fails || pg_temp.t32_is('2 anon read', pg_temp.t32_as('anon', null,
    'select count(*)::text from public.member_items'), 'permission denied for table member_items');
  fails := fails || pg_temp.t32_is('2 no direct write', pg_temp.t32_as('authenticated', ma, format(
    'insert into public.member_items(member_id, kind, item_id, data, edited_at) values (%L, %L, %L, %L, 1) returning item_id', ma, 'w', 'x1', '[]')),
    'permission denied for table member_items');
  checks := checks + 4;

  -- 3. Member A keeps three things; reads them back in (kind, id) order.
  r := pg_temp.t32_as('authenticated', ma, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(
      jsonb_build_object('k', 'w', 'i', 'w-1', 'v', 1, 'd', '["2026-10-20",1]', 'e', now_ms - 3000),
      jsonb_build_object('k', 'w', 'i', 'w-2', 'v', 1, 'd', '["2026-10-22",2]', 'e', now_ms - 2000),
      jsonb_build_object('k', 'b', 'i', '2026-10-22', 'v', 1, 'd', '[78.5]', 'e', now_ms - 1000))));
  fails := fails || pg_temp.t32_is('3 saved', r, '{"older": 0, "saved": 3}');
  r := pg_temp.t32_as('authenticated', ma, 'select public.member_copy_get()::text');
  fails := fails || pg_temp.t32_is('3 order', (select string_agg(x->>'k' || ':' || (x->>'i'), ',') from jsonb_array_elements(r::jsonb) x), 'b:2026-10-22,w:w-1,w:w-2');
  fails := fails || pg_temp.t32_is('3 data back', (select x->>'d' from jsonb_array_elements(r::jsonb) x where x->>'i' = 'w-2'), '["2026-10-22",2]');
  r := pg_temp.t32_as('authenticated', ma, 'select public.member_copy_count()::text');
  fails := fails || pg_temp.t32_is('3 count', (r::jsonb->>'items') || '/' || (r::jsonb->>'workouts'), '3/2');
  fails := fails || pg_temp.t32_is('3 own rows readable', pg_temp.t32_as('authenticated', ma, 'select count(*)::text from public.member_items'), '3');
  checks := checks + 5;

  -- 4. Member B sees none of A's rows, and the same ids make B's own rows.
  fails := fails || pg_temp.t32_is('4 B get', pg_temp.t32_as('authenticated', mb, 'select public.member_copy_get()::text'), '[]');
  fails := fails || pg_temp.t32_is('4 B select', pg_temp.t32_as('authenticated', mb, 'select count(*)::text from public.member_items'), '0');
  r := pg_temp.t32_as('authenticated', mb, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(jsonb_build_object('k', 'w', 'i', 'w-1', 'd', '["B"]', 'e', now_ms))));
  fails := fails || pg_temp.t32_is('4 B own', r, '{"older": 0, "saved": 1}');
  fails := fails || pg_temp.t32_is('4 A untouched', (select data from public.member_items where member_id = ma and item_id = 'w-1'), '["2026-10-20",1]');
  checks := checks + 4;

  -- 5. The gym sees nothing: an owner account of A's gym, and the gym's own functions.
  fails := fails || pg_temp.t32_is('5 owner select', pg_temp.t32_as('authenticated', ow, 'select count(*)::text from public.member_items'), '0');
  fails := fails || pg_temp.t32_is('5 owner get', pg_temp.t32_as('authenticated', ow, 'select public.member_copy_get()::text'), '[]');
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'member_items';
  fails := fails || pg_temp.t32_is('5 one policy only', n::text, '1');
  checks := checks + 3;

  -- 6. The newest edit wins.
  r := pg_temp.t32_as('authenticated', ma, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(jsonb_build_object('k', 'w', 'i', 'w-1', 'd', '["older phone"]', 'e', now_ms - 5000))));
  fails := fails || pg_temp.t32_is('6 older refused', r, '{"older": 1, "saved": 0}');
  fails := fails || pg_temp.t32_is('6 older named', (r::jsonb->'olderIds')::text, '[{"i": "w-1", "k": "w"}]');
  fails := fails || pg_temp.t32_is('6 older kept out', (select data from public.member_items where member_id = ma and item_id = 'w-1'), '["2026-10-20",1]');
  r := pg_temp.t32_as('authenticated', ma, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(jsonb_build_object('k', 'w', 'i', 'w-1', 'd', '["edited"]', 'e', now_ms))));
  fails := fails || pg_temp.t32_is('6 newer saved', r, '{"older": 0, "saved": 1}');
  fails := fails || pg_temp.t32_is('6 newer in', (select data from public.member_items where member_id = ma and item_id = 'w-1'), '["edited"]');
  -- Twice in one call: the newer of the two.
  r := pg_temp.t32_as('authenticated', ma, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(jsonb_build_object('k', 'b', 'i', 'twice', 'd', '[2]', 'e', now_ms + 10),
                      jsonb_build_object('k', 'b', 'i', 'twice', 'd', '[1]', 'e', now_ms))));
  fails := fails || pg_temp.t32_is('6 twice in one call', (select data from public.member_items where member_id = ma and item_id = 'twice'), '[2]');
  checks := checks + 6;

  -- 7. A delete on the phone is kept as an empty row (so it is not brought back), and can come back newer.
  r := pg_temp.t32_as('authenticated', ma, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(jsonb_build_object('k', 'w', 'i', 'w-2', 'd', null, 'e', now_ms + 1))));
  fails := fails || pg_temp.t32_is('7 deleted', (select coalesce(data, 'EMPTY') from public.member_items where member_id = ma and item_id = 'w-2'), 'EMPTY');
  r := pg_temp.t32_as('authenticated', ma, 'select public.member_copy_count()::text');
  fails := fails || pg_temp.t32_is('7 not counted', r::jsonb->>'workouts', '1');
  checks := checks + 2;

  -- 8. Refused whole: unknown kind, long id, missing d, bad time, too big, too many, not a list.
  fails := fails || pg_temp.t32_is('8 kind', pg_temp.t32_as('authenticated', ma, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(jsonb_build_object('k', 'z', 'i', 'a', 'd', '[]', 'e', now_ms)))), 'INVALID');
  fails := fails || pg_temp.t32_is('8 long id', pg_temp.t32_as('authenticated', ma, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(jsonb_build_object('k', 'w', 'i', repeat('x', 65), 'd', '[]', 'e', now_ms)))), 'INVALID');
  fails := fails || pg_temp.t32_is('8 no d', pg_temp.t32_as('authenticated', ma, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(jsonb_build_object('k', 'w', 'i', 'a', 'e', now_ms)))), 'INVALID');
  fails := fails || pg_temp.t32_is('8 bad time', pg_temp.t32_as('authenticated', ma, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(jsonb_build_object('k', 'w', 'i', 'a', 'd', '[]', 'e', 'soon')))), 'INVALID');
  big := repeat('9', 32769);
  fails := fails || pg_temp.t32_is('8 too big', pg_temp.t32_as('authenticated', ma, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(jsonb_build_object('k', 'w', 'i', 'big', 'd', big, 'e', now_ms)))), 'TOO_BIG');
  select jsonb_agg(jsonb_build_object('k', 'b', 'i', 'many-' || g, 'd', '[1]', 'e', now_ms))::text into many from generate_series(1, 201) g;
  fails := fails || pg_temp.t32_is('8 too many', pg_temp.t32_as('authenticated', ma, format('select public.member_copy_put(%L)::text', many)), 'TOO_MANY');
  fails := fails || pg_temp.t32_is('8 not a list', pg_temp.t32_as('authenticated', ma, 'select public.member_copy_put(''{"k":"w"}'')::text'), 'INVALID');
  -- One bad item: the good one beside it is not written either.
  r := pg_temp.t32_as('authenticated', ma, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(jsonb_build_object('k', 'b', 'i', 'good', 'd', '[1]', 'e', now_ms), jsonb_build_object('k', 'q', 'i', 'bad', 'd', '[1]', 'e', now_ms))));
  fails := fails || pg_temp.t32_is('8 all or nothing', (select count(*)::text from public.member_items where member_id = ma and item_id = 'good'), '0');
  checks := checks + 8;

  -- 9. A clock far ahead is held to a day ahead.
  r := pg_temp.t32_as('authenticated', ma, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(jsonb_build_object('k', 'u', 'i', 'me', 'd', '["A"]', 'e', now_ms + 365::bigint * 86400000))));
  fails := fails || pg_temp.t32_is('9 future held', ((select edited_at from public.member_items where member_id = ma and item_id = 'me') <= now_ms + 86400000 + 60000)::text, 'true');
  -- A number far past what a bigint holds is held to the cap too (never an overflow error).
  r := pg_temp.t32_as('authenticated', ma, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(jsonb_build_object('k', 'u', 'i', 'me', 'd', '["A2"]', 'e', 1e30))));
  fails := fails || pg_temp.t32_is('9 huge time', r, '{"older": 0, "saved": 1}');
  fails := fails || pg_temp.t32_is('9 huge time held', ((select edited_at from public.member_items where member_id = ma and item_id = 'me') <= now_ms + 86400000 + 60000)::text, 'true');
  checks := checks + 3;

  -- 10. A page at a time.
  r := pg_temp.t32_as('authenticated', ma, 'select public.member_copy_get('''', '''', 2)::text');
  fails := fails || pg_temp.t32_is('10 first page', (select string_agg(x->>'i', ',') from jsonb_array_elements(r::jsonb) x), '2026-10-22,twice');
  r := pg_temp.t32_as('authenticated', ma, 'select public.member_copy_get(''b'', ''twice'', 2)::text');
  fails := fails || pg_temp.t32_is('10 next page', (select string_agg(x->>'k' || ':' || (x->>'i'), ',') from jsonb_array_elements(r::jsonb) x), 'u:me,w:w-1');
  checks := checks + 2;

  -- 11. Full: no new rows past the limit; edits of rows already there still go in.
  insert into public.member_items(member_id, kind, item_id, data, edited_at)
    select mb, 'b', 'fill-' || g, '[1]', 1 from generate_series(1, public._copy_max_rows() - 1) g;
  fails := fails || pg_temp.t32_is('11 full', pg_temp.t32_as('authenticated', mb, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(jsonb_build_object('k', 'w', 'i', 'one-more', 'd', '[1]', 'e', now_ms)))), 'COPY_FULL');
  fails := fails || pg_temp.t32_is('11 edit still fits', pg_temp.t32_as('authenticated', mb, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(jsonb_build_object('k', 'w', 'i', 'w-1', 'd', '["B2"]', 'e', now_ms + 5)))), '{"older": 0, "saved": 1}');
  checks := checks + 2;

  -- 12. Delete my account: B's copy and account go; A's stay.
  fails := fails || pg_temp.t32_is('12 anon refused', pg_temp.t32_as('anon', null, 'select public.member_account_delete()::text'),
    'permission denied for function member_account_delete');
  fails := fails || pg_temp.t32_is('12 deleted', pg_temp.t32_as('authenticated', mb, 'select public.member_account_delete()::text'), '{"account": "deleted"}');
  fails := fails || pg_temp.t32_is('12 B rows gone', (select count(*)::text from public.member_items where member_id = mb), '0');
  fails := fails || pg_temp.t32_is('12 B account gone', (select count(*)::text from auth.users where id = mb), '0');
  fails := fails || pg_temp.t32_is('12 A kept', (select count(*)::text from public.member_items where member_id = ma), '5');
  -- A gym OWNER's sign-in (Supabase links Google to the same email's account): the copy goes, the
  -- account and its profile stay, so the owner can still open the admin app.
  r := pg_temp.t32_as('authenticated', ow, format('select public.member_copy_put(%L)::text',
    jsonb_build_array(jsonb_build_object('k', 'w', 'i', 'o-1', 'd', '["O"]', 'e', now_ms))));
  fails := fails || pg_temp.t32_is('12 owner kept', pg_temp.t32_as('authenticated', ow, 'select public.member_account_delete()::text'), '{"account": "kept"}');
  fails := fails || pg_temp.t32_is('12 owner copy gone', (select count(*)::text from public.member_items where member_id = ow), '0');
  fails := fails || pg_temp.t32_is('12 owner account stays', (select count(*)::text from auth.users where id = ow)
    || (select count(*)::text from public.profiles where id = ow and role = 'owner'), '11');
  -- An older (0001) gym-sync member, with a gym on the profile: the same.
  fails := fails || pg_temp.t32_is('12 gym member kept', pg_temp.t32_as('authenticated', ma, 'select public.member_account_delete()::text'), '{"account": "kept"}');
  fails := fails || pg_temp.t32_is('12 gym member copy gone', (select count(*)::text from public.member_items where member_id = ma)
    || (select count(*)::text from auth.users where id = ma), '01');
  checks := checks + 10;

  -- 13. Who may call what, and row level security is on.
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname in ('member_copy_put', 'member_copy_get', 'member_copy_count', 'member_account_delete')
     and (has_function_privilege('anon', p.oid, 'execute') or not has_function_privilege('authenticated', p.oid, 'execute'));
  fails := fails || pg_temp.t32_is('13 member functions', n::text, '0');
  fails := fails || pg_temp.t32_is('13 limits for all', (has_function_privilege('anon', 'public.app_limits()', 'execute'))::text, 'true');
  fails := fails || pg_temp.t32_is('13 helper closed', (has_function_privilege('authenticated', 'public._copy_max_rows()', 'execute'))::text, 'false');
  fails := fails || pg_temp.t32_is('13 RLS on', (select string_agg(relname || '=' || relrowsecurity::text, ',' order by relname) from pg_class
    where relnamespace = 'public'::regnamespace and relname in ('app_config', 'member_items')), 'app_config=true,member_items=true');
  checks := checks + 4;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
