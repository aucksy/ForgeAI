-- Trainer pages and personal-training bookings test (0065, F105). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor once 0065 is applied. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

create or replace function pg_temp.t65_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t65_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  ga uuid; gb uuid; s_owner uuid; s_desk uuid; s_tr uuid; s_tr2 uuid; s_other uuid;
  kop text := 't65-owner-session'; kd text := 't65-desk-session'; kt text := 't65-trainer-session';
  kt2 text := 't65-trainer2-session'; kox text := 't65-other-session';
  fails text := ''; checks int := 0; r jsonb; bid uuid; past uuid;
  td date := (now() at time zone 'Asia/Kolkata')::date;
  tm date := td + 1;
  dow text := extract(isodow from td + 1)::int::text;
  hours jsonb;
begin
  hours := jsonb_build_object(dow, jsonb_build_array(jsonb_build_array(1020, 1260), jsonb_build_array(360, 600)));
  insert into public.gyms(name, join_code, crm_version) values ('T65 Gym', 'T65GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T65 Other', 'T65GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner', '9876506001', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Ravi Desk', '9876506002', 'staff') returning staff_id into s_desk;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Rohit Sharma', '9876506003', 'staff') returning staff_id into s_tr;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Meena', '9876506004', 'staff') returning staff_id into s_tr2;
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Other Owner', '9876506005', 'owner') returning staff_id into s_other;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_desk, public._hash_key(kd)),
    (s_tr, public._hash_key(kt)), (s_tr2, public._hash_key(kt2)), (s_other, public._hash_key(kox));
  insert into public.gym_trainers(staff_id, gym_id) values (s_tr, ga), (s_tr2, ga);
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829060001"}', 1),
    (ga, 'member', 'm-bilal', '{"fullName":"Bilal Khan","phone":"+919829060002"}', 1),
    (gb, 'member', 'm-zoya', '{"fullName":"Zoya Ali","phone":"+919829060009"}', 1);

  -- 1. Everyone in the gym reads the week; the trainers are there with no profile yet.
  r := public.owner_trainer_schedule(kd, tm);
  checks := checks + 1; fails := fails || pg_temp.t65_is('1desk', (r->>'owner') || '/' || jsonb_array_length(r->'trainers')::text, 'false/2');
  checks := checks + 1; fails := fails || pg_temp.t65_is('1owner', public.owner_trainer_schedule(kop, tm)->>'owner', 'true');
  checks := checks + 1; fails := fails || pg_temp.t65_is('1bad', pg_temp.t65_run(format('select public.owner_trainer_schedule(%L, null)', 'nope')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t65_is('1other', jsonb_array_length(public.owner_trainer_schedule(kox, tm)->'trainers')::text, '0');

  -- 2. Profiles: a trainer edits their own page; not another's; the desk none; the owner any. Bad hours refused.
  r := public.owner_save_trainer_profile(kt, s_tr, '  Weight   loss, strength ', hours, null);
  checks := checks + 1; fails := fails || pg_temp.t65_is('2own', (r->>'teaches') || '/' || (r->'hours'->dow->0)::text, 'Weight loss, strength/[360, 600]');
  checks := checks + 1; fails := fails || pg_temp.t65_is('2other', pg_temp.t65_run(format('select public.owner_save_trainer_profile(%L, %L, null, %L::jsonb, null)', kt, s_tr2, '{}')), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t65_is('2desk', pg_temp.t65_run(format('select public.owner_save_trainer_profile(%L, %L, null, %L::jsonb, null)', kd, s_tr, '{}')), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t65_is('2nottrainer', pg_temp.t65_run(format('select public.owner_save_trainer_profile(%L, %L, null, %L::jsonb, null)', kop, s_desk, '{}')), 'NOT_TRAINER');
  checks := checks + 1; fails := fails || pg_temp.t65_is('2overlap', pg_temp.t65_run(format('select public.owner_save_trainer_profile(%L, %L, null, %L::jsonb, null)', kop, s_tr,
    '{"1":[[360,600],[540,700]]}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t65_is('2late', pg_temp.t65_run(format('select public.owner_save_trainer_profile(%L, %L, null, %L::jsonb, null)', kop, s_tr,
    '{"8":[[360,600]]}')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t65_is('2photo', pg_temp.t65_run(format('select public.owner_save_trainer_profile(%L, %L, null, %L::jsonb, %L)', kop, s_tr2,
    '{}', 'iVBORw0KGgo=')), 'BAD_PHOTO');
  r := public.owner_save_trainer_profile(kop, s_tr2, 'Yoga', '{}'::jsonb, '/9j/4AAQSkZJRg==');
  checks := checks + 1; fails := fails || pg_temp.t65_is('2ownerphoto', r->>'photo', '/9j/4AAQSkZJRg==');
  -- null keeps the photo; '' removes it.
  r := public.owner_save_trainer_profile(kop, s_tr2, 'Yoga', '{}'::jsonb, null);
  checks := checks + 1; fails := fails || pg_temp.t65_is('2keep', r->>'photo', '/9j/4AAQSkZJRg==');
  r := public.owner_save_trainer_profile(kop, s_tr2, 'Yoga', '{}'::jsonb, '');
  checks := checks + 1; fails := fails || pg_temp.t65_is('2remove', coalesce(r->>'photo', 'none'), 'none');

  -- 3. Booking: the desk books Asha with Rohit tomorrow 7 am for an hour.
  r := public.owner_book_pt(kd, s_tr, 'm-asha', tm, 420, 60, false, 'req-t65-0001');
  bid := (r->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t65_is('3book', (r->>'start') || '/' || (r->>'byName'), '420/Ravi Desk');
  -- The same press again: the same booking, not a second.
  checks := checks + 1; fails := fails || pg_temp.t65_is('3again', public.owner_book_pt(kd, s_tr, 'm-asha', tm, 420, 60, false, 'req-t65-0001')->>'id', bid::text);
  checks := checks + 1; fails := fails || pg_temp.t65_is('3trbusy', pg_temp.t65_run(format('select public.owner_book_pt(%L, %L, %L, %L::date, 450, 30, false, null)', kd, s_tr, 'm-bilal', tm)), 'TRAINER_BUSY');
  checks := checks + 1; fails := fails || pg_temp.t65_is('3membusy', pg_temp.t65_run(format('select public.owner_book_pt(%L, %L, %L, %L::date, 450, 60, true, null)', kd, s_tr2, 'm-asha', tm)), 'MEMBER_BUSY');
  -- Back to back is fine.
  checks := checks + 1; fails := fails || pg_temp.t65_is('3backtoback', pg_temp.t65_run(format('select public.owner_book_pt(%L, %L, %L, %L::date, 480, 60, false, null)', kt, s_tr, 'm-bilal', tm)), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t65_is('3hours', pg_temp.t65_run(format('select public.owner_book_pt(%L, %L, %L, %L::date, 660, 60, false, null)', kd, s_tr, 'm-bilal', tm)), 'OUTSIDE_HOURS');
  checks := checks + 1; fails := fails || pg_temp.t65_is('3hoursok', pg_temp.t65_run(format('select public.owner_book_pt(%L, %L, %L, %L::date, 660, 60, true, null)', kd, s_tr, 'm-bilal', tm)), 'ok');
  -- Meena has no hours set: any time.
  checks := checks + 1; fails := fails || pg_temp.t65_is('3nohours', pg_temp.t65_run(format('select public.owner_book_pt(%L, %L, %L, %L::date, 900, 30, false, null)', kd, s_tr2, 'm-asha', tm)), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t65_is('3past', pg_temp.t65_run(format('select public.owner_book_pt(%L, %L, %L, %L::date, 900, 30, false, null)', kd, s_tr2, 'm-asha', td - 1)), 'PAST');
  checks := checks + 1; fails := fails || pg_temp.t65_is('3far', pg_temp.t65_run(format('select public.owner_book_pt(%L, %L, %L, %L::date, 900, 30, false, null)', kd, s_tr2, 'm-asha', td + 40)), 'TOO_FAR');
  checks := checks + 1; fails := fails || pg_temp.t65_is('3badtime', pg_temp.t65_run(format('select public.owner_book_pt(%L, %L, %L, %L::date, 905, 30, false, null)', kd, s_tr2, 'm-asha', tm)), 'BAD_TIME');
  checks := checks + 1; fails := fails || pg_temp.t65_is('3length', pg_temp.t65_run(format('select public.owner_book_pt(%L, %L, %L, %L::date, 960, 120, false, null)', kd, s_tr2, 'm-asha', tm)), 'BAD_TIME');
  checks := checks + 1; fails := fails || pg_temp.t65_is('3nomember', pg_temp.t65_run(format('select public.owner_book_pt(%L, %L, %L, %L::date, 960, 30, false, null)', kd, s_tr2, 'm-zoya', tm)), 'NO_MEMBER');
  checks := checks + 1; fails := fails || pg_temp.t65_is('3desknottrainer', pg_temp.t65_run(format('select public.owner_book_pt(%L, %L, %L, %L::date, 960, 30, false, null)', kd, s_desk, 'm-asha', tm)), 'NOT_TRAINER');
  checks := checks + 1; fails := fails || pg_temp.t65_is('3othergym', pg_temp.t65_run(format('select public.owner_book_pt(%L, %L, %L, %L::date, 960, 30, false, null)', kox, s_tr, 'm-asha', tm)), 'NOT_TRAINER');

  -- 4. The week shows the bookings and what is booked ahead; the other gym sees none.
  r := public.owner_trainer_schedule(kt2, tm);
  checks := checks + 1; fails := fails || pg_temp.t65_is('4week', jsonb_array_length(r->'bookings')::text || '/' || (r->'ahead'->>'m-asha') || '/' || (r->'ahead'->>'m-bilal'), '4/2/2');
  checks := checks + 1; fails := fails || pg_temp.t65_is('4other', jsonb_array_length(public.owner_trainer_schedule(kox, tm)->'bookings')::text, '0');

  -- 5. Cancel: the desk cancels tomorrow's; a past booking only the owner may cancel.
  checks := checks + 1; fails := fails || pg_temp.t65_is('5cancel', public.owner_cancel_pt(kd, bid)->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t65_is('5twice', pg_temp.t65_run(format('select public.owner_cancel_pt(%L, %L)', kd, bid)), 'NOT_FOUND');
  insert into public.gym_pt_bookings(gym_id, staff_id, roster_id, day, start_min, length_min) values (ga, s_tr, 'm-bilal', td - 1, 420, 60)
    returning booking_id into past;
  checks := checks + 1; fails := fails || pg_temp.t65_is('5pastdesk', pg_temp.t65_run(format('select public.owner_cancel_pt(%L, %L)', kd, past)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t65_is('5pastother', pg_temp.t65_run(format('select public.owner_cancel_pt(%L, %L)', kox, past)), 'NOT_FOUND');
  checks := checks + 1; fails := fails || pg_temp.t65_is('5pastowner', public.owner_cancel_pt(kop, past)->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t65_is('5after', jsonb_array_length(public.owner_trainer_schedule(kd, tm)->'bookings')::text, '3');

  -- 6. Grants: the tables are closed; the helper is private.
  checks := checks + 1;
  if has_table_privilege('anon', 'public.gym_pt_bookings', 'select')
     or has_table_privilege('authenticated', 'public.gym_trainer_profiles', 'select')
     or has_function_privilege('anon', 'public._pt_clean_hours(jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.owner_book_pt(text, uuid, text, date, int, int, boolean, text)', 'execute') then
    fails := fails || ' 6grants';
  end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
