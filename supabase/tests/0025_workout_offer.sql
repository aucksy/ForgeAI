-- Workout offer, group and timed messages test (0025). Runs in CI after every migration
-- (scripts/ci/db_checks.sh: a throw-away local Supabase applies every migration, then each test must
-- end with "RESULT PASS"). It can also be pasted into the SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

-- A statement's result as text: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t25_try(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t25_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gb uuid; s_owner uuid; s_staff uuid; mid_a uuid; mid_b uuid; mid_x uuid;
  kop text := 't25-owner-session'; ks text := 't25-staff-session'; kob text := 't25-owner-b';
  ka text := 't25-member-asha'; kb text := 't25-member-bilal'; kn text := 't25-member-nophone'; kx text := 't25-member-other-gym';
  td date := (now() at time zone 'Asia/Kolkata')::date;
  fails text := ''; checks int := 0; r jsonb; o1 uuid; o2 uuid; v0 bigint; v1 bigint; n int; msg uuid; msg2 uuid;
  dd text[];
begin
  -- dd[i] = the day i-1 days ago ('YYYY-MM-DD'); dd[1] is today.
  select array_agg(to_char(td - g, 'YYYY-MM-DD') order by g) into dd from generate_series(0, 12) g;

  insert into public.gyms(name, join_code, crm_version) values ('T25 Gym', 'T25GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T25 Other', 'T25GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner', '9876500251', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Ravi', '9876500252', 'staff') returning staff_id into s_staff;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_staff, public._hash_key(ks));
  insert into public.gym_owner_keys(gym_id, key_hash) values (gb, public._hash_key(kob));
  insert into public.gym_members(gym_id, name, phone, checkin_phone, key_hash) values
    (gid, 'Asha', null, '+919829012345', public._hash_key(ka)) returning member_id into mid_a;
  insert into public.gym_members(gym_id, name, phone, checkin_phone, key_hash) values
    (gid, 'Bilal', null, '+919829054321', public._hash_key(kb)) returning member_id into mid_b;
  insert into public.gym_members(gym_id, name, phone, checkin_phone, key_hash) values
    (gid, 'Chand', '9829000000', null, public._hash_key(kn));
  insert into public.gym_members(gym_id, name, phone, checkin_phone, key_hash) values
    (gb, 'Asha', null, '+919829012345', public._hash_key(kx)) returning member_id into mid_x;

  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"98290 12345","archived":false,"createdAt":1}', 1),
    (gid, 'member', 'm-bilal', '{"fullName":"Bilal Khan","phone":"9829054321","archived":false,"createdAt":2}', 1),
    -- Asha: a gym plan running today, and a PT pack that ends later (never the one the reward moves).
    (gid, 'membership', 'ms-a', jsonb_build_object('memberId','m-asha','planName','Monthly','startsOn', dd[13],
       'endsOn', to_char(td + 10, 'YYYY-MM-DD'), 'cancelled', false, 'notes', null), 1),
    (gid, 'membership', 'ms-a-pt', jsonb_build_object('memberId','m-asha','planName','PT 12','startsOn', dd[6],
       'endsOn', to_char(td + 40, 'YYYY-MM-DD'), 'cancelled', false, 'ptSessions', 12), 1),
    -- Asha's check-ins: desk 6, 5, 2 and 1 days ago; the QR poster 3 days ago; an import today. 4 days ago: none.
    (gid, 'visit', 'v6', jsonb_build_object('memberId','m-asha','visitedOn', dd[7], 'source', 'desk'), 1),
    (gid, 'visit', 'v5', jsonb_build_object('memberId','m-asha','visitedOn', dd[6]), 1),
    (gid, 'visit', 'v3', jsonb_build_object('memberId','m-asha','visitedOn', dd[4], 'source', 'app'), 1),
    (gid, 'visit', 'v2', jsonb_build_object('memberId','m-asha','visitedOn', dd[3], 'source', 'desk'), 1),
    (gid, 'visit', 'v1', jsonb_build_object('memberId','m-asha','visitedOn', dd[2], 'source', 'desk'), 1),
    (gid, 'visit', 'v0', jsonb_build_object('memberId','m-asha','visitedOn', dd[1], 'source', 'import'), 1),
    -- A deleted check-in never counts.
    (gid, 'visit', 'v4x', jsonb_build_object('memberId','m-asha','visitedOn', dd[5], 'source', 'desk'), 1);
  update public.crm_records set deleted = true where gym_id = gid and id = 'v4x';

  -- ------------------------------------------------ 1. no offer yet
  r := public.member_offers(ka);
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('1 no offer', r->>'canJoin', 'NONE') || pg_temp.t25_is('1 offer null', jsonb_typeof(r->'offer'), 'null');

  -- ------------------------------------------------ 2. starting an offer: the owner only, numbers checked
  checks := checks + 4;
  fails := fails || pg_temp.t25_is('2 desk', pg_temp.t25_try(format('select public.owner_save_offer(%L, %L::jsonb)', ks,
    '{"title":"T","workouts":4,"windowDays":7,"rewardDays":3}')), 'OWNER_ONLY');
  fails := fails || pg_temp.t25_is('2 too few', pg_temp.t25_try(format('select public.owner_save_offer(%L, %L::jsonb)', kop,
    jsonb_build_object('title','T','workouts',3,'windowDays',7,'rewardDays',3,'joinUntil',dd[1]))), 'INVALID');
  fails := fails || pg_temp.t25_is('2 reward 8', pg_temp.t25_try(format('select public.owner_save_offer(%L, %L::jsonb)', kop,
    jsonb_build_object('title','T','workouts',4,'windowDays',7,'rewardDays',8,'joinUntil',dd[1]))), 'INVALID');
  r := public.owner_save_offer(kop, jsonb_build_object('title', 'Train 4 times in 7 days', 'workouts', 4, 'windowDays', 7,
         'rewardDays', 3, 'joinUntil', to_char(td + 30, 'YYYY-MM-DD'), 'countAppCheckins', true, 'autoGive', false));
  o1 := (r->>'id')::uuid;
  fails := fails || pg_temp.t25_is('2 saved', (r->>'open') || ':' || (r->>'autoGive') || ':' || (r->>'createdByName'), 'true:false:Owner');
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('2 one running', pg_temp.t25_try(format('select public.owner_save_offer(%L, %L::jsonb)', kop,
    jsonb_build_object('title','T2','workouts',4,'windowDays',7,'rewardDays',3,'joinUntil',dd[1]))), 'ONE_RUNNING');

  -- ------------------------------------------------ 3. who can join
  r := public.member_offers(ka);
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('3 asha', (r->>'canJoin') || ':' || (r->'offer'->>'workouts') || ':' || (r->'offer'->>'minMinutes') || ':' || (r->'offer'->>'minSets'), 'yes:4:20:6');
  checks := checks + 3;
  fails := fails || pg_temp.t25_is('3 no phone', public.member_offers(kn)->>'canJoin', 'NO_PHONE');
  fails := fails || pg_temp.t25_is('3 no plan', public.member_offers(kb)->>'canJoin', 'NO_PLAN');
  -- Gym B's member (same number, same name) sees nothing of gym A.
  fails := fails || pg_temp.t25_is('3 other gym', public.member_offers(kx)->>'canJoin', 'NONE');
  checks := checks + 2;
  fails := fails || pg_temp.t25_is('3 bilal join', public.member_join_offer(kb, o1, 'offer-consent-v1')->>'error', 'NO_PLAN');
  fails := fails || pg_temp.t25_is('3 other gym join', public.member_join_offer(kx, o1, 'offer-consent-v1')->>'error', 'CLOSED');

  -- ------------------------------------------------ 4. dates before joining: nothing is kept
  r := public.member_offer_days(ka, o1, jsonb_build_array(dd[7]));
  checks := checks + 2;
  fails := fails || pg_temp.t25_is('4 not joined', r->>'error', 'NOT_JOINED');
  select count(*) into n from public.offer_days where offer_id = o1;
  fails := fails || pg_temp.t25_is('4 no rows', n::text, '0');

  -- ------------------------------------------------ 5. join (consent logged with the words' version)
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('5 bad notice', public.member_join_offer(ka, o1, '')->>'error', 'BAD_NOTICE');
  r := public.member_join_offer(ka, o1, 'offer-consent-v1');
  perform public.member_join_offer(ka, o1, 'offer-consent-v1');  -- a double tap
  checks := checks + 2;
  fails := fails || pg_temp.t25_is('5 joined', (r->>'canJoin') || ':' || (r->'me'->>'counted') || ':' || (r->'me'->>'windowEndsOn'),
    'JOINED:0:' || to_char(td + 6, 'YYYY-MM-DD'));
  select count(*) into n from public.offer_log where offer_id = o1 and event = 'joined' and notice_version = 'offer-consent-v1';
  fails := fails || pg_temp.t25_is('5 one consent row', n::text, '1');
  -- Time passes: she joined 6 days ago (window: 6 days ago .. today).
  update public.offer_members set joined_on = td - 6, window_ends_on = td where offer_id = o1 and roster_id = 'm-asha';

  -- ------------------------------------------------ 6. dates: only check-in days in the window count
  -- Sent: 6, 5, 4 (no check-in; a deleted one), 3 (QR) days ago; tomorrow; 10 days ago (before
  -- joining); junk. Kept: 6, 5, 3.
  r := public.member_offer_days(ka, o1, jsonb_build_array(dd[7], dd[6], dd[5], dd[4], to_char(td + 1, 'YYYY-MM-DD'), dd[11], 'junk', dd[7]));
  checks := checks + 2;
  fails := fails || pg_temp.t25_is('6 counted', (r->'me'->>'counted') || ':' || (r->'me'->>'earned'), '3:false');
  fails := fails || pg_temp.t25_is('6 days', r->'me'->>'days', jsonb_build_array(dd[7], dd[6], dd[4])::text);
  -- The same list again changes nothing; a count from the phone is never read.
  r := public.member_offer_days(ka, o1, jsonb_build_array(dd[7], dd[6], dd[4]));
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('6 again', r->'me'->>'counted', '3');
  checks := checks + 2;
  fails := fails || pg_temp.t25_is('6 not a list', public.member_offer_days(ka, o1, '{"count":10}'::jsonb)->>'error', 'INVALID');
  fails := fails || pg_temp.t25_is('6 not earned', pg_temp.t25_try(format('select public.staff_give_reward(%L, %L, %L)', ks, o1, 'm-asha')), 'NOT_EARNED');

  -- ------------------------------------------------ 7. the 4th date: earned; "I give them" gives nothing yet
  select crm_version into v0 from public.gyms where gym_id = gid;
  r := public.member_offer_days(ka, o1, jsonb_build_array(dd[3]));
  checks := checks + 2;
  fails := fails || pg_temp.t25_is('7 earned', (r->'me'->>'counted') || ':' || (r->'me'->>'earned') || ':' || (r->'me'->>'given'), '4:true:false');
  fails := fails || pg_temp.t25_is('7 plan untouched', (select data->>'endsOn' from public.crm_records where gym_id = gid and id = 'ms-a'),
    to_char(td + 10, 'YYYY-MM-DD'));
  r := public.owner_offers(ks);
  checks := checks + 2;
  fails := fails || pg_temp.t25_is('7 list', (r->'offers'->0->>'joined') || ':' || (r->'offers'->0->>'ready') || ':' || (r->'offers'->0->>'given'), '1:1:0');
  fails := fails || pg_temp.t25_is('7 member row', (r->'members'->0->>'counted') || ':' || (r->'members'->0->>'deskDays') || ':' || (r->'members'->0->>'appDays'), '4:3:1');
  -- No phone number, workout detail or another gym in the panel's answer.
  checks := checks + 1;
  if r::text ~ '9829012345|T25 Other' then fails := fails || ' 7 leak:' || left(r::text, 200); end if;

  -- ------------------------------------------------ 8. the desk's one tap: once, the gym plan, a note
  r := public.staff_give_reward(ks, o1, 'm-asha');
  checks := checks + 4;
  fails := fails || pg_temp.t25_is('8 given', (r->>'alreadyGiven') || ':' || (r->>'oldEnd') || ':' || (r->>'newEnd'),
    'false:' || to_char(td + 10, 'YYYY-MM-DD') || ':' || to_char(td + 13, 'YYYY-MM-DD'));
  fails := fails || pg_temp.t25_is('8 plan', (select (data->>'endsOn') || '|' || (data->>'notes') from public.crm_records where gym_id = gid and id = 'ms-a'),
    to_char(td + 13, 'YYYY-MM-DD') || '|+3 days (Reward - Workout offer): ' || to_char(td + 10, 'YYYY-MM-DD') || ' -> ' || to_char(td + 13, 'YYYY-MM-DD'));
  fails := fails || pg_temp.t25_is('8 pt untouched', (select data->>'endsOn' from public.crm_records where gym_id = gid and id = 'ms-a-pt'), to_char(td + 40, 'YYYY-MM-DD'));
  select crm_version into v1 from public.gyms where gym_id = gid;
  fails := fails || pg_temp.t25_is('8 version', (v1 - v0)::text || ':' || (select version from public.crm_records where gym_id = gid and id = 'ms-a')::text, '1:' || v1::text);
  -- A second tap (or the other desk) changes nothing.
  r := public.staff_give_reward(kop, o1, 'm-asha');
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('8 twice', (r->>'alreadyGiven') || ':' || (select data->>'endsOn' from public.crm_records where gym_id = gid and id = 'ms-a'),
    'true:' || to_char(td + 13, 'YYYY-MM-DD'));
  r := public.owner_offers(kop);
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('8 who', (r->'members'->0->>'givenByName') || ':' || (r->'members'->0->>'givenAuto'), 'Ravi:false');
  r := public.member_offers(ka);
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('8 member sees', (r->'me'->>'given') || ':' || (r->'me'->>'newEnd'), 'true:' || to_char(td + 13, 'YYYY-MM-DD'));

  -- ------------------------------------------------ 9. take back: the owner only, only while unchanged
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('9 desk', pg_temp.t25_try(format('select public.owner_undo_reward(%L, %L, %L)', ks, o1, 'm-asha')), 'OWNER_ONLY');
  r := public.owner_undo_reward(kop, o1, 'm-asha');
  checks := checks + 2;
  fails := fails || pg_temp.t25_is('9 back', (select data->>'endsOn' from public.crm_records where gym_id = gid and id = 'ms-a'), to_char(td + 10, 'YYYY-MM-DD'));
  fails := fails || pg_temp.t25_is('9 note', (select split_part(data->>'notes', E'\n', 2) from public.crm_records where gym_id = gid and id = 'ms-a'),
    'Reward taken back: ' || to_char(td + 13, 'YYYY-MM-DD') || ' -> ' || to_char(td + 10, 'YYYY-MM-DD'));
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('9 twice', pg_temp.t25_try(format('select public.owner_undo_reward(%L, %L, %L)', kop, o1, 'm-asha')), 'NOT_GIVEN');
  -- Given again by hand, then the plan is changed by hand: taking it back now is refused.
  perform public.staff_give_reward(kop, o1, 'm-asha');
  update public.crm_records set data = data || jsonb_build_object('endsOn', to_char(td + 20, 'YYYY-MM-DD')) where gym_id = gid and id = 'ms-a';
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('9 changed', pg_temp.t25_try(format('select public.owner_undo_reward(%L, %L, %L)', kop, o1, 'm-asha')), 'CHANGED');

  -- ------------------------------------------------ 10. another gym's owner: nothing of gym A
  r := public.owner_offers(kob);
  checks := checks + 3;
  fails := fails || pg_temp.t25_is('10 list', jsonb_array_length(r->'offers')::text || ':' || jsonb_array_length(r->'members')::text, '0:0');
  fails := fails || pg_temp.t25_is('10 give', pg_temp.t25_try(format('select public.staff_give_reward(%L, %L, %L)', kob, o1, 'm-asha')), 'GONE');
  fails := fails || pg_temp.t25_is('10 stop', pg_temp.t25_try(format('select public.owner_stop_offer(%L, %L)', kob, o1)), 'GONE');

  -- ------------------------------------------------ 11. "Give the days by themselves", desk check-ins only
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('11 desk stop', pg_temp.t25_try(format('select public.owner_stop_offer(%L, %L)', ks, o1)), 'OWNER_ONLY');
  perform public.owner_stop_offer(kop, o1);
  r := public.owner_save_offer(kop, jsonb_build_object('title', 'Auto', 'workouts', 4, 'windowDays', 7, 'rewardDays', 2,
         'joinUntil', to_char(td + 30, 'YYYY-MM-DD'), 'countAppCheckins', false, 'autoGive', true));
  o2 := (r->>'id')::uuid;
  perform public.member_join_offer(ka, o2, 'offer-consent-v1');
  update public.offer_members set joined_on = td - 6, window_ends_on = td where offer_id = o2 and roster_id = 'm-asha';
  -- 6, 5, 3 (QR: not counted in this offer), 2 days ago: 3 counted.
  r := public.member_offer_days(ka, o2, jsonb_build_array(dd[7], dd[6], dd[4], dd[3]));
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('11 desk only', r->'me'->>'counted', '3');
  -- Her plan is cancelled before the 4th: earned, but no plan to add days to (the desk sees "ready").
  update public.crm_records set data = data || '{"cancelled":true}'::jsonb where gym_id = gid and id = 'ms-a';
  r := public.member_offer_days(ka, o2, jsonb_build_array(dd[2]));
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('11 no plan', (r->'me'->>'earned') || ':' || (r->'me'->>'given'), 'true:false');
  -- The plan is back: the next send gives the days, by itself, once.
  update public.crm_records set data = data || '{"cancelled":false}'::jsonb where gym_id = gid and id = 'ms-a';
  r := public.member_offer_days(ka, o2, '[]'::jsonb);
  checks := checks + 2;
  fails := fails || pg_temp.t25_is('11 auto', (r->'me'->>'given') || ':' || (r->'me'->>'givenAuto') || ':' || (r->'me'->>'newEnd'),
    'true:true:' || to_char(td + 22, 'YYYY-MM-DD'));
  perform public.member_offer_days(ka, o2, jsonb_build_array(dd[7], dd[2]));
  fails := fails || pg_temp.t25_is('11 once', (select data->>'endsOn' from public.crm_records where gym_id = gid and id = 'ms-a'), to_char(td + 22, 'YYYY-MM-DD'));
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('11 by', (select given_by_name from public.offer_members where offer_id = o2 and roster_id = 'm-asha'), 'Automatic');

  -- ------------------------------------------------ 12. messages: a group, a time
  msg := (public.owner_send_message(kop, 'announcement', 'T25 group', '', array[mid_a, mid_x]) ->> 'id')::uuid;
  checks := checks + 3;
  fails := fails || pg_temp.t25_is('12 recipients', (select recipients::text || ':' || to_group::text from public.gym_messages where message_id = msg), '1:true');
  fails := fails || pg_temp.t25_is('12 in group', (select count(*) from jsonb_array_elements(public.member_messages(ka)) e where e->>'id' = msg::text)::text, '1');
  fails := fails || pg_temp.t25_is('12 not in group', (select count(*) from jsonb_array_elements(public.member_messages(kb)) e where e->>'id' = msg::text)::text, '0');
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('12 saw other', public.member_saw_messages(kb, array[msg])::text, '0');
  checks := checks + 2;
  fails := fails || pg_temp.t25_is('12 no one', pg_temp.t25_try(format('select public.owner_send_message(%L, %L, %L, %L, %L::uuid[])', kop, 'announcement', 'x', '', array[mid_x])), 'NO_ONE');
  fails := fails || pg_temp.t25_is('12 too far', pg_temp.t25_try(format('select public.owner_send_message(%L, %L, %L, %L, null, %L::timestamptz)', kop, 'announcement', 'x', '', now() + interval '40 days')), 'BAD_TIME');
  -- Tomorrow's offer, then today's: both fit (each day has one). A second one tomorrow does not.
  msg2 := (public.owner_send_message(kop, 'offer', 'T25 tomorrow', '', null, now() + interval '1 day') ->> 'id')::uuid;
  checks := checks + 4;
  fails := fails || pg_temp.t25_is('12 timed hidden', (select count(*) from jsonb_array_elements(public.member_messages(ka)) e where e->>'id' = msg2::text)::text, '0');
  fails := fails || pg_temp.t25_is('12 today', pg_temp.t25_try(format('select public.owner_send_message(%L, %L, %L, %L)', kop, 'offer', 'T25 today', '')), 'ok');
  fails := fails || pg_temp.t25_is('12 tomorrow again', pg_temp.t25_try(format('select public.owner_send_message(%L, %L, %L, %L, null, %L::timestamptz)', kop, 'offer', 'T25 again', '', now() + interval '1 day 1 minute')), 'OFFER_TODAY');
  -- The admin app's Sent list says when and to whom.
  fails := fails || pg_temp.t25_is('12 sent list', (select (e->>'toGroup') || ':' || (e->>'sendAt' is not null)::text
      from jsonb_array_elements(public.owner_messages(kop)) e where e->>'id' = msg2::text), 'false:true');
  -- The front desk still cannot send.
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('12 desk', pg_temp.t25_try(format('select public.owner_send_message(%L, %L, %L, %L)', ks, 'announcement', 'x', '')), 'OWNER_ONLY');
  -- Its time comes: it shows.
  update public.gym_messages set send_at = now() - interval '1 minute' where message_id = msg2;
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('12 timed shows', (select count(*) from jsonb_array_elements(public.member_messages(ka)) e where e->>'id' = msg2::text)::text, '1');

  -- ------------------------------------------------ 13. leaving: dates deleted, the reward stays
  perform public.member_leave_offer(ka, o2);
  checks := checks + 3;
  select count(*) into n from public.offer_days where offer_id = o2;
  fails := fails || pg_temp.t25_is('13 dates gone', n::text, '0');
  fails := fails || pg_temp.t25_is('13 reward stays', (select (given_at is not null)::text || ':' || (member_id is null)::text from public.offer_members where offer_id = o2), 'true:true');
  fails := fails || pg_temp.t25_is('13 not sending', public.member_offer_days(ka, o2, jsonb_build_array(dd[7]))->>'error', 'NOT_JOINED');
  -- Back in offer 1's row (stopped, so no new join) — and leaving the gym leaves every offer.
  update public.offer_members set left_at = null, member_id = mid_a where offer_id = o1;
  perform public.member_leave(ka);
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('13 gym leave', (select (left_at is not null)::text || ':' || (select count(*) from public.offer_days where offer_id = o1)::text
      from public.offer_members where offer_id = o1), 'true:0');

  -- ------------------------------------------------ 14. who may call what
  checks := checks + 2;
  if not has_function_privilege('anon', 'public.member_offers(text)', 'execute')
     or not has_function_privilege('anon', 'public.member_offer_days(text, uuid, jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.staff_give_reward(text, uuid, text)', 'execute') then
    fails := fails || ' 14 grants';
  end if;
  if has_function_privilege('anon', 'public._offer_give(uuid, text, uuid, text, boolean)', 'execute')
     or has_function_privilege('anon', 'public._offer_identity(public.gym_members)', 'execute')
     or has_function_privilege('authenticated', 'public._offer_tidy(uuid)', 'execute') then
    fails := fails || ' 14 helpers open';
  end if;
  -- A dead key is refused.
  checks := checks + 1;
  fails := fails || pg_temp.t25_is('14 dead key', pg_temp.t25_try('select public.member_offers(''no-such-key'')'), 'BAD_KEY');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
