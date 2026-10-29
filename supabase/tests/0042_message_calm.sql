-- 0042: calmer gym messages (R-195): from the 3rd in-app message of a gym's India day members get it with
-- no phone pop-up, and at most 10 in-app messages a day. Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error, so
-- it changes nothing:
--   "RESULT PASS (n checks)" - every rule held;
--   "RESULT FAIL: ..."       - the checks that failed (label:what came back).

-- A statement's answer: 'ok', or the error it raised.
create or replace function pg_temp.t42_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t42_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- A message's quiet mark and its push job: 'false/due', 'true/quiet', ...
create or replace function pg_temp.t42_state(p_msg jsonb) returns text
  language sql as $$
  select (select quiet::text from public.gym_messages where message_id = (p_msg->>'id')::uuid) || '/' ||
         coalesce((select coalesce(why_done, 'due') from public.push_jobs where kind = 'message' and ref_id = (p_msg->>'id')::uuid), 'no job')
$$;

do $t42$
declare
  ga uuid; gb uuid; gc uuid; gd uuid; ge uuid; s uuid;
  ka text := 't42-owner-a'; kb text := 't42-owner-b'; kc text := 't42-owner-c'; kd text := 't42-owner-d'; ke text := 't42-owner-e';
  km text := 't42-member-a'; tm text := 't42-token-aaaaaaaaaaaaaaaaaaaa';
  -- Tomorrow, 12 noon and 6 pm India time (never today, whatever the hour now).
  noon timestamptz := (date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '1 day 12 hours') at time zone 'Asia/Kolkata';
  eve timestamptz := (date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '1 day 18 hours') at time zone 'Asia/Kolkata';
  m1 jsonb; m2 jsonb; m3 jsonb; m4 jsonb; r jsonb;
  fails text := ''; checks int := 0; i int;
begin
  -- Real jobs (live SQL Editor) never get in the way: finished for this test only (undone at the end).
  update public.push_jobs set done_at = now() where done_at is null;

  insert into public.gyms(name, join_code, crm_version) values ('T42 A', 'T42GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T42 B', 'T42GYB', 1) returning gym_id into gb;
  insert into public.gyms(name, join_code, crm_version) values ('T42 C', 'T42GYC', 1) returning gym_id into gc;
  insert into public.gyms(name, join_code, crm_version) values ('T42 D', 'T42GYD', 1) returning gym_id into gd;
  insert into public.gyms(name, join_code, crm_version) values ('T42 E', 'T42GYE', 1) returning gym_id into ge;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner', '9876500421', 'owner') returning staff_id into s;
  insert into public.gym_sessions(staff_id, key_hash) values (s, public._hash_key(ka));
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Owner', '9876500422', 'owner') returning staff_id into s;
  insert into public.gym_sessions(staff_id, key_hash) values (s, public._hash_key(kb));
  insert into public.gym_staff(gym_id, name, phone, role) values (gc, 'Owner', '9876500423', 'owner') returning staff_id into s;
  insert into public.gym_sessions(staff_id, key_hash) values (s, public._hash_key(kc));
  insert into public.gym_staff(gym_id, name, phone, role) values (gd, 'Owner', '9876500424', 'owner') returning staff_id into s;
  insert into public.gym_sessions(staff_id, key_hash) values (s, public._hash_key(kd));
  insert into public.gym_staff(gym_id, name, phone, role) values (ge, 'Owner', '9876500425', 'owner') returning staff_id into s;
  insert into public.gym_sessions(staff_id, key_hash) values (s, public._hash_key(ke));
  insert into public.gym_members(gym_id, name, key_hash) values (ga, 'Asha', public._hash_key(km));
  perform public.member_save_push_token(km, tm);

  -- 1. The 1st and 2nd message of the day pop up; the 3rd (and 4th) only goes to the app's list.
  m1 := public.owner_send_message(ka, 'announcement', 'One', '');
  m2 := public.owner_send_message(ka, 'closed', 'Two', '');
  m3 := public.owner_send_message(ka, 'timing', 'Three', '');
  m4 := public.owner_send_message(ka, 'reminder', 'Four', '');
  checks := checks + 1; fails := fails || pg_temp.t42_is('1first', pg_temp.t42_state(m1), 'false/due');
  checks := checks + 1; fails := fails || pg_temp.t42_is('1second', pg_temp.t42_state(m2), 'false/due');
  checks := checks + 1; fails := fails || pg_temp.t42_is('1third', pg_temp.t42_state(m3), 'true/quiet');
  checks := checks + 1; fails := fails || pg_temp.t42_is('1fourth', pg_temp.t42_state(m4), 'true/quiet');
  checks := checks + 1; fails := fails || pg_temp.t42_is('1answer', (m3->>'quiet') || '/' || (m1->>'quiet'), 'true/false');

  -- 2. The sender pushes only the first two; the quiet ones never.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  -- (Both are due at the same moment, so either may come first.)
  r := public.hq_push_next(40);
  r := jsonb_build_array(r->>'refId', public.hq_push_next(40)->>'refId');
  checks := checks + 1; fails := fails || pg_temp.t42_is('2pushed',
    (select string_agg(x, ',' order by x) from jsonb_array_elements_text(r) x),
    (select string_agg(x, ',' order by x) from unnest(array[m1->>'id', m2->>'id']) x));
  checks := checks + 1; fails := fails || pg_temp.t42_is('2none', public.hq_push_next(40)::text, null);
  perform set_config('request.jwt.claims', '', true);

  -- 3. The member's inbox still holds all four, the quiet ones marked so; the owner's Sent list too.
  checks := checks + 1; fails := fails || pg_temp.t42_is('3inbox',
    (select string_agg((e->>'title') || ':' || (e->>'quiet'), ',' order by e->>'title') from jsonb_array_elements(public.member_messages(km)) e),
    'Four:true,One:false,Three:true,Two:false');
  checks := checks + 1; fails := fails || pg_temp.t42_is('3sent',
    (select count(*) from jsonb_array_elements(public.owner_messages(ka)) e where (e->>'quiet')::boolean)::text, '2');

  -- 4. A message taken back does not count.
  m1 := public.owner_send_message(kb, 'announcement', 'One', '');
  perform public.owner_withdraw_message(kb, (m1->>'id')::uuid);
  m2 := public.owner_send_message(kb, 'announcement', 'Two', '');
  m3 := public.owner_send_message(kb, 'announcement', 'Three', '');
  checks := checks + 1; fails := fails || pg_temp.t42_is('4backNotCounted', pg_temp.t42_state(m3), 'false/due');
  m4 := public.owner_send_message(kb, 'announcement', 'Four', '');
  checks := checks + 1; fails := fails || pg_temp.t42_is('4thenQuiet', pg_temp.t42_state(m4), 'true/quiet');

  -- 5. A timed message counts on the day it appears: 2 timed for tomorrow leave today calm, and the
  --    3rd for tomorrow is quiet.
  m1 := public.owner_send_message(kc, 'announcement', 'Tomorrow 1', '', null, noon);
  m2 := public.owner_send_message(kc, 'announcement', 'Tomorrow 2', '', null, noon);
  m3 := public.owner_send_message(kc, 'announcement', 'Today', '');
  checks := checks + 1; fails := fails || pg_temp.t42_is('5todayCalm', pg_temp.t42_state(m3), 'false/due');
  m4 := public.owner_send_message(kc, 'announcement', 'Tomorrow 3', '', null, eve);
  checks := checks + 1; fails := fails || pg_temp.t42_is('5tomorrowQuiet', pg_temp.t42_state(m4), 'true/quiet');
  checks := checks + 1; fails := fails || pg_temp.t42_is('5tomorrowFirst', pg_temp.t42_state(m1), 'false/due');

  -- 6. Messages of another day do not count: yesterday's two leave today's first calm.
  m1 := public.owner_send_message(kd, 'announcement', 'Old 1', '');
  m2 := public.owner_send_message(kd, 'announcement', 'Old 2', '');
  update public.gym_messages set created_at = created_at - interval '1 day' where gym_id = gd;
  m3 := public.owner_send_message(kd, 'announcement', 'New', '');
  checks := checks + 1; fails := fails || pg_temp.t42_is('6otherDay', pg_temp.t42_state(m3), 'false/due');

  -- 7. Another gym's messages do not count (gym A already sent 4 today).
  checks := checks + 1; fails := fails || pg_temp.t42_is('7ownGym', pg_temp.t42_state(m3), 'false/due');

  -- 8. At most 10 in-app messages a day (it was 20): the 10th goes, the 11th is refused; offers and
  --    events keep 1 a day.
  for i in 1..9 loop
    perform public.owner_send_message(ke, 'announcement', 'Note ' || i, '');
  end loop;
  checks := checks + 1; fails := fails || pg_temp.t42_is('8tenth', pg_temp.t42_run(format('select public.owner_send_message(%L, %L, %L, %L)', ke, 'offer', 'Tenth', '')), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t42_is('8eleventh', pg_temp.t42_run(format('select public.owner_send_message(%L, %L, %L, %L)', ke, 'announcement', 'Eleventh', '')), 'TOO_MANY');
  checks := checks + 1; fails := fails || pg_temp.t42_is('8count', (select count(*) from public.gym_messages where gym_id = ge)::text, '10');
  checks := checks + 1; fails := fails || pg_temp.t42_is('8offerDay', pg_temp.t42_run(format('select public.owner_send_message(%L, %L, %L, %L)', kb, 'offer', 'Offer 1', '')) || '/' ||
    pg_temp.t42_run(format('select public.owner_send_message(%L, %L, %L, %L, null, %L::timestamptz)', kb, 'event', 'Event 2', '', noon)) || '/' ||
    pg_temp.t42_run(format('select public.owner_send_message(%L, %L, %L, %L, null, %L::timestamptz)', kb, 'event', 'Event 3', '', eve)), 'ok/ok/OFFER_TODAY');

  -- 9. Who may call what: unchanged for the owner's send; nobody calls the new trigger function.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.owner_send_message(text, text, text, text, uuid[], timestamptz)', 'execute')
     or has_function_privilege('anon', 'public._message_quiet()', 'execute')
     or has_function_privilege('authenticated', 'public._message_quiet()', 'execute')
     or has_function_privilege('anon', 'public._message_json(public.gym_messages)', 'execute')
     or has_table_privilege('anon', 'public.gym_messages', 'select') then fails := fails || ' 9grants'; end if;
  -- Every function changed here keeps a fixed search_path.
  checks := checks + 1; fails := fails || pg_temp.t42_is('9searchPath',
    (select string_agg(p.proname, ',' order by p.proname) from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('_message_json', '_message_quiet', '_push_job_message', 'owner_send_message')
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), null);

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $t42$;
