-- R-630 slice A (No Gaps G3): the under-18 deletes (0101). Runs in CI after every migration
-- (scripts/ci/db_checks.sh) and can be pasted into the SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

create or replace function pg_temp.t101_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- Run p_sql (one text value) as p_role with the signed-in id p_sub (null = not signed in). The value, or the error.
create or replace function pg_temp.t101_as(p_role text, p_sub uuid, p_sql text) returns text
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
  kid uuid := gen_random_uuid(); adult uuid := gen_random_uuid(); ow uuid := gen_random_uuid();
  ga uuid; m1 uuid; m2 uuid; k1 text := 't101-member-1'; k2 text := 't101-member-2';
  fails text := ''; checks int := 0;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into public.gyms(name, join_code) values ('T101 Gym', 'T101GY') returning gym_id into ga;
  insert into auth.users(instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', kid, 'authenticated', 'authenticated', 't101-k-' || kid || '@example.invalid'),
    ('00000000-0000-0000-0000-000000000000', adult, 'authenticated', 'authenticated', 't101-a-' || adult || '@example.invalid'),
    ('00000000-0000-0000-0000-000000000000', ow, 'authenticated', 'authenticated', 't101-o-' || ow || '@example.invalid');
  insert into public.profiles(id, gym_id, role) values (kid, ga, 'member'), (adult, null, 'member'), (ow, ga, 'owner');
  insert into public.member_items(member_id, kind, item_id, data, edited_at) values
    (kid, 'w', 'k1', '[]', 1), (adult, 'w', 'a1', '[]', 1), (ow, 'w', 'o1', '[]', 1);

  insert into public.gym_members(gym_id, name, key_hash) values (ga, 'Kid', public._hash_key(k1)) returning member_id into m1;
  insert into public.gym_members(gym_id, name, key_hash) values (ga, 'Other', public._hash_key(k2)) returning member_id into m2;
  insert into public.gym_progress_summaries(member_id, gym_id, summary) values (m1, ga, '{}'), (m2, ga, '{}');
  insert into public.gym_member_days(gym_id, member_id, day, workouts, kg) values (ga, m1, current_date, 1, 100), (ga, m2, current_date, 1, 100);
  insert into public.gym_member_board(gym_id, member_id) values (ga, m1), (ga, m2);
  insert into public.member_push_tokens(token, gym_id, member_id) values (repeat('a', 30), ga, m1), (repeat('b', 30), ga, m2);

  -- 1. Not signed in: the account delete is closed.
  fails := fails || pg_temp.t101_is('1 anon', pg_temp.t101_as('anon', null, 'select public.member_under18_delete()::text'),
    'permission denied for function member_under18_delete');
  checks := checks + 1;

  -- 2. An owner's login is never removed, even in the gym's member app.
  fails := fails || pg_temp.t101_is('2 owner refused', pg_temp.t101_as('authenticated', ow, 'select public.member_under18_delete()::text'), 'STAFF_LOGIN');
  fails := fails || pg_temp.t101_is('2 owner kept', (select count(*)::text from auth.users where id = ow), '1');
  fails := fails || pg_temp.t101_is('2 owner copy kept', (select count(*)::text from public.member_items where member_id = ow), '1');
  checks := checks + 3;

  -- 3. A member's own delete removes the copy and the account; nobody else's.
  fails := fails || pg_temp.t101_is('3 kid delete', (pg_temp.t101_as('authenticated', kid, 'select public.member_under18_delete()::text'))::jsonb->>'deleted', 'true');
  fails := fails || pg_temp.t101_is('3 kid copy', (select count(*)::text from public.member_items where member_id = kid), '0');
  fails := fails || pg_temp.t101_is('3 kid account', (select count(*)::text from auth.users where id = kid), '0');
  fails := fails || pg_temp.t101_is('3 kid profile', (select count(*)::text from public.profiles where id = kid), '0');
  fails := fails || pg_temp.t101_is('3 adult untouched', (select count(*)::text from public.member_items where member_id = adult), '1');
  checks := checks + 5;

  -- 4. The gym-member delete, by the member's own key: summary, days, board, pop-up code; the gym's record stays.
  fails := fails || pg_temp.t101_is('4 bad key', pg_temp.t101_as('anon', null, format('select public.gym_member_under18_delete(%L)::text', 'nope')), 'BAD_KEY');
  fails := fails || pg_temp.t101_is('4 delete', (pg_temp.t101_as('anon', null, format('select public.gym_member_under18_delete(%L)::text', k1)))::jsonb->>'deleted', 'true');
  fails := fails || pg_temp.t101_is('4 summary', (select count(*)::text from public.gym_progress_summaries where member_id = m1), '0');
  fails := fails || pg_temp.t101_is('4 days', (select count(*)::text from public.gym_member_days where member_id = m1), '0');
  fails := fails || pg_temp.t101_is('4 board', (select count(*)::text from public.gym_member_board where member_id = m1), '0');
  fails := fails || pg_temp.t101_is('4 push', (select count(*)::text from public.member_push_tokens where member_id = m1), '0');
  fails := fails || pg_temp.t101_is('4 gym record kept', (select count(*)::text from public.gym_members where member_id = m1), '1');
  fails := fails || pg_temp.t101_is('4 other member untouched', (select count(*)::text from public.gym_progress_summaries where member_id = m2)
    || (select count(*)::text from public.gym_member_days where member_id = m2) || (select count(*)::text from public.member_push_tokens where member_id = m2), '111');
  checks := checks + 8;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
