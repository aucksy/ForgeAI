-- Automatic reminders test (0029). Runs in CI after every migration (scripts/ci/db_checks.sh: a
-- throw-away local Supabase applies every migration, then each test must end with "RESULT PASS").
-- It can also be pasted into the SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

-- A statement's result as text: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t29_try(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t29_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gb uuid; s_owner uuid; s_staff uuid;
  kop text := 't29-owner-session'; ks text := 't29-staff-session'; kold text := 't29-old-owner-key'; kob text := 't29-owner-b';
  ka text := 't29-member-asha'; kn text := 't29-member-nophone'; kw text := 't29-member-wrongname'; kx text := 't29-member-other-gym';
  td date := (now() at time zone 'Asia/Kolkata')::date;
  fails text := ''; checks int := 0; r jsonb; bad jsonb; ok_set jsonb;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T29 Gym', 'T29GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T29 Other', 'T29GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner', '9876500291', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Ravi', '9876500292', 'staff') returning staff_id into s_staff;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_staff, public._hash_key(ks));
  insert into public.gym_owner_keys(gym_id, key_hash) values (gid, public._hash_key(kold)), (gb, public._hash_key(kob));
  insert into public.gym_members(gym_id, name, phone, checkin_phone, key_hash) values
    (gid, 'Asha', null, '+919829012391', public._hash_key(ka)),
    (gid, 'Chand', '9829000091', null, public._hash_key(kn)),
    (gid, 'Zoya', null, '+919829012392', public._hash_key(kw)),
    (gb, 'Asha', null, '+919829012391', public._hash_key(kx));

  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"98290 12391","archived":false,"createdAt":1,"dateOfBirth":"1994-03-09","joinedOn":"2025-10-20"}', 1),
    -- Zoya's number is on the list under another first name: no dates for her.
    (gid, 'member', 'm-bina', '{"fullName":"Bina Rao","phone":"9829012392","archived":false,"createdAt":2,"dateOfBirth":"1990-01-02","joinedOn":"2026-01-01"}', 1),
    -- The other gym's Asha: a birthday that must never reach gym A's phone.
    (gb, 'member', 'm-asha-b', '{"fullName":"Asha Verma","phone":"9829012391","archived":false,"createdAt":1,"dateOfBirth":"2000-12-25"}', 1),
    -- Asha's check-ins: 3 days ago (desk), 1 day ago (deleted), tomorrow (a typing slip: not counted).
    (gid, 'visit', 'v3', jsonb_build_object('memberId','m-asha','visitedOn', to_char(td - 3, 'YYYY-MM-DD'), 'source', 'desk'), 1),
    (gid, 'visit', 'v1x', jsonb_build_object('memberId','m-asha','visitedOn', to_char(td - 1, 'YYYY-MM-DD'), 'source', 'desk'), 1),
    (gid, 'visit', 'vfut', jsonb_build_object('memberId','m-asha','visitedOn', to_char(td + 1, 'YYYY-MM-DD'), 'source', 'desk'), 1),
    (gb, 'visit', 'vb', jsonb_build_object('memberId','m-asha-b','visitedOn', to_char(td, 'YYYY-MM-DD'), 'source', 'desk'), 1);
  update public.crm_records set deleted = true where gym_id = gid and id = 'v1x';

  -- ------------------------------------------------ 1. nothing saved yet: the app's defaults
  r := public.owner_auto_reminders(kop);
  checks := checks + 3;
  fails := fails || pg_temp.t29_is('1 settings null', jsonb_typeof(r->'settings'), 'null')
                 || pg_temp.t29_is('1 owner edits', r->>'canEdit', 'true')
                 || pg_temp.t29_is('1 desk looks', public.owner_auto_reminders(ks)->>'canEdit', 'false');
  checks := checks + 1;
  fails := fails || pg_temp.t29_is('1 old owner key edits', public.owner_auto_reminders(kold)->>'canEdit', 'true');

  r := public.member_auto_reminders(ka);
  checks := checks + 6;
  fails := fails || pg_temp.t29_is('1 member ok', r->>'ok', 'true')
                 || pg_temp.t29_is('1 member settings null', jsonb_typeof(r->'settings'), 'null')
                 || pg_temp.t29_is('1 birthday MM-DD', r->>'birthday', '03-09')
                 || pg_temp.t29_is('1 joined', r->>'joinedOn', '2025-10-20')
                 || pg_temp.t29_is('1 no last visit while "we haven''t seen you" is off', r->>'lastVisitOn', null)
                 || pg_temp.t29_is('1 day', r->>'day', to_char(td, 'YYYY-MM-DD'));

  -- ------------------------------------------------ 2. saving: the owner only, everything checked
  ok_set := '{"plan_ends_soon":{"on":true,"days":[3,7,3]},"birthday":{"on":false},"miss_you":{"on":true,"days":[10]},"pt_low":{"on":false,"days":[2]},"welcome":{"on":true,"extra":"dropped"}}';
  checks := checks + 1;
  fails := fails || pg_temp.t29_is('2 desk refused', pg_temp.t29_try(format('select public.owner_save_auto_reminders(%L, %L::jsonb)', ks, ok_set)), 'OWNER_ONLY');
  for bad in select * from jsonb_array_elements('[
      "x", [], {"nope":{"on":true}}, {"birthday":{"on":"yes"}}, {"birthday":{}}, {"birthday":true},
      {"birthday":{"on":true,"days":[1]}}, {"plan_ends_soon":{"on":true,"days":[0]}}, {"plan_ends_soon":{"on":true,"days":[31]}},
      {"plan_ends_soon":{"on":true,"days":[1,2,3,4]}}, {"plan_ends_soon":{"on":true,"days":[]}}, {"plan_ends_soon":{"on":true,"days":[2.5]}},
      {"plan_ends_soon":{"on":true,"days":"7"}}, {"plan_ended":{"on":true,"days":[61]}}, {"offer_ending":{"on":true,"days":[3,4]}},
      {"miss_you":{"on":true,"days":[4]}}, {"pt_low":{"on":true,"days":[6]}}, {"plan_ends_soon":{"on":true,"days":[-1]}}
    ]'::jsonb) loop
    checks := checks + 1;
    fails := fails || pg_temp.t29_is('2 invalid ' || bad::text, pg_temp.t29_try(format('select public.owner_save_auto_reminders(%L, %L::jsonb)', kop, bad)), 'INVALID');
  end loop;
  checks := checks + 1;
  fails := fails || pg_temp.t29_is('2 nothing saved by refusals', (select count(*)::text from public.gym_auto_reminders where gym_id = gid), '0');

  r := public.owner_save_auto_reminders(kop, ok_set);
  checks := checks + 5;
  fails := fails || pg_temp.t29_is('2 days tidied', (r->'settings'->'plan_ends_soon')::text, '{"on": true, "days": [7, 3]}')
                 || pg_temp.t29_is('2 off kept', (r->'settings'->'birthday')::text, '{"on": false}')
                 || pg_temp.t29_is('2 unknown field dropped', (r->'settings'->'welcome')::text, '{"on": true}')
                 || pg_temp.t29_is('2 who', r->>'updatedByName', 'Owner')
                 || pg_temp.t29_is('2 desk sees it', (public.owner_auto_reminders(ks)->'settings'->'miss_you')::text, '{"on": true, "days": [10]}');

  -- A second save replaces the whole object (one row per gym); an empty object = all defaults.
  perform public.owner_save_auto_reminders(kold, '{"anniversary":{"on":true}}');
  r := public.owner_auto_reminders(kop);
  checks := checks + 3;
  fails := fails || pg_temp.t29_is('2 replaced', (r->'settings')::text, '{"anniversary": {"on": true}}')
                 || pg_temp.t29_is('2 old key name', r->>'updatedByName', 'Owner (old owner key)')
                 || pg_temp.t29_is('2 one row', (select count(*)::text from public.gym_auto_reminders where gym_id = gid), '1');
  perform public.owner_save_auto_reminders(kop, ok_set);

  -- ------------------------------------------------ 3. the member's phone
  r := public.member_auto_reminders(ka);
  checks := checks + 2;
  fails := fails || pg_temp.t29_is('3 member gets switches', (r->'settings'->'plan_ends_soon'->'days')::text, '[7, 3]')
                 || pg_temp.t29_is('3 last visit (miss_you on; not deleted, not future)', r->>'lastVisitOn', to_char(td - 3, 'YYYY-MM-DD'));
  -- No QR check-in yet (no matched number): the switches, but no dates.
  r := public.member_auto_reminders(kn);
  checks := checks + 4;
  fails := fails || pg_temp.t29_is('3 nophone switches', (r->'settings'->'birthday')::text, '{"on": false}')
                 || pg_temp.t29_is('3 nophone birthday', r->>'birthday', null)
                 || pg_temp.t29_is('3 nophone joined', r->>'joinedOn', null)
                 || pg_temp.t29_is('3 nophone visit', r->>'lastVisitOn', null);
  -- The gym's list has another first name for that number: no dates.
  r := public.member_auto_reminders(kw);
  checks := checks + 2;
  fails := fails || pg_temp.t29_is('3 wrong name birthday', r->>'birthday', null)
                 || pg_temp.t29_is('3 wrong name ok', r->>'ok', 'true');
  -- The other gym: its own (no) switches and its own member's dates, never gym A's.
  r := public.member_auto_reminders(kx);
  checks := checks + 3;
  fails := fails || pg_temp.t29_is('3 other gym settings', jsonb_typeof(r->'settings'), 'null')
                 || pg_temp.t29_is('3 other gym birthday', r->>'birthday', '12-25')
                 || pg_temp.t29_is('3 other gym: no visit (its miss_you off)', r->>'lastVisitOn', null);
  checks := checks + 2;
  fails := fails || pg_temp.t29_is('3 other owner reads own', jsonb_typeof(public.owner_auto_reminders(kob)->'settings'), 'null');
  perform public.owner_save_auto_reminders(kob, '{"welcome":{"on":false}}');
  fails := fails || pg_temp.t29_is('3 gym A unchanged', (public.owner_auto_reminders(kop)->'settings'->'welcome')::text, '{"on": true}');

  -- A bad birthday or a future joining day on the list: null, never an error.
  update public.crm_records set data = data || '{"dateOfBirth":"1994-02-30","joinedOn":"2999-01-01"}'::jsonb where gym_id = gid and id = 'm-asha';
  r := public.member_auto_reminders(ka);
  checks := checks + 3;
  fails := fails || pg_temp.t29_is('3 bad dob', r->>'birthday', null)
                 || pg_temp.t29_is('3 future joined', r->>'joinedOn', null)
                 || pg_temp.t29_is('3 still ok', r->>'ok', 'true');

  -- ------------------------------------------------ 4. keys and grants
  checks := checks + 4;
  fails := fails || pg_temp.t29_is('4 dead member key', pg_temp.t29_try('select public.member_auto_reminders(''no-such-key'')'), 'BAD_KEY')
                 || pg_temp.t29_is('4 dead owner key', pg_temp.t29_try('select public.owner_auto_reminders(''no-such-key'')'), 'BAD_KEY')
                 || pg_temp.t29_is('4 member key is no owner key', pg_temp.t29_try(format('select public.owner_auto_reminders(%L)', ka)), 'BAD_KEY')
                 || pg_temp.t29_is('4 member key cannot save', pg_temp.t29_try(format('select public.owner_save_auto_reminders(%L, %L::jsonb)', ka, '{}')), 'BAD_KEY');
  checks := checks + 1;
  if has_function_privilege('anon', 'public._auto_reminders_clean(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public._auto_reminders_json(uuid, boolean)', 'execute')
     or has_table_privilege('anon', 'public.gym_auto_reminders', 'select')
     or has_table_privilege('authenticated', 'public.gym_auto_reminders', 'insert') then
    fails := fails || ' 4 helpers or table open';
  end if;
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_auto_reminders(text)', 'execute') then
    fails := fails || ' 4 member call closed';
  end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
