-- Bring a friend, a number the gym already knows (0085, R-539). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

create or replace function pg_temp.t85_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gid2 uuid;
  ka text := 't85-member-asha'; kb text := 't85-member-bina';
  fails text := ''; checks int := 0; r jsonb; code text; code2 text; v0 bigint; e jsonb; n int;
  today text := to_char(public._ist_today(), 'YYYY-MM-DD');
  a public.gym_alerts;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T85 Gym', 'T85GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T85 Other', 'T85GYB', 1) returning gym_id into gid2;
  -- Asha is on the gym's list (same number and first name); Bina is in the app only.
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Asha', public._hash_key(ka), '9876508401');
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Bina', public._hash_key(kb), '9876508402');
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 't85-asha', '{"fullName":"Asha Rao","phone":"+919876508401"}', 1),
    (gid, 'member', 't85-mohan', '{"fullName":"Mohan Lal","phone":"+919876508499"}', 1),
    -- A walk-in the desk typed, follow-up next week; and one already overdue; and a lost one.
    (gid, 'enquiry', 't85-walkin', jsonb_build_object('id', 't85-walkin', 'name', 'Ravi Kumar', 'phone', '+919876508411',
       'interest', '3 months, evening batch', 'status', 'open', 'followUpOn', to_char(public._ist_today() + 7, 'YYYY-MM-DD'),
       'createdAt', 1, 'updatedAt', 1), 1),
    (gid, 'enquiry', 't85-late', jsonb_build_object('id', 't85-late', 'name', 'Sunil', 'phone', '+919876508412',
       'interest', null, 'status', 'open', 'followUpOn', to_char(public._ist_today() - 3, 'YYYY-MM-DD'),
       'createdAt', 1, 'updatedAt', 1), 1),
    (gid, 'enquiry', 't85-lost', jsonb_build_object('id', 't85-lost', 'name', 'Lata', 'phone', '+919876508413',
       'status', 'lost', 'createdAt', 1, 'updatedAt', 1), 1),
    (gid2, 'enquiry', 't85-other', jsonb_build_object('id', 't85-other', 'name', 'Other Gym Person', 'phone', '+919876508414',
       'status', 'open', 'createdAt', 1, 'updatedAt', 1), 1);
  code := public.member_friend_invite(ka)->>'code';
  code2 := public.member_friend_invite(kb)->>'code';

  -- 1. An open enquiry's number: "sent"; a note on THAT enquiry, follow-up today, version moved on, one instant alert.
  select crm_version into v0 from public.gyms where gym_id = gid;
  r := public.friend_invite_send(code, 'Ravi K', '98765 08411', 'evening');
  checks := checks + 1; fails := fails || pg_temp.t85_is('1ok', r::text, '{"ok": true}');
  select data into e from public.crm_records where gym_id = gid and kind = 'enquiry' and id = 't85-walkin';
  checks := checks + 1; fails := fails || pg_temp.t85_is('1by', e->'invitedAgain'->>'by', 'Asha Rao');
  checks := checks + 1; fails := fails || pg_temp.t85_is('1time', e->'invitedAgain'->>'time', 'evening');
  checks := checks + 1; fails := fails || pg_temp.t85_is('1v', e->'invitedAgain'->>'v', '1');
  checks := checks + 1; fails := fails || pg_temp.t85_is('1follow', e->>'followUpOn', today);
  checks := checks + 1; fails := fails || pg_temp.t85_is('1interest', e->>'interest', '3 months, evening batch');
  checks := checks + 1; fails := fails || pg_temp.t85_is('1name', e->>'name', 'Ravi Kumar');
  checks := checks + 1; fails := fails || pg_temp.t85_is('1updated', ((e->>'updatedAt')::bigint > 1)::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t85_is('1version',
    ((select crm_version from public.gyms where gym_id = gid) = v0 + 1
     and (select version from public.crm_records where gym_id = gid and id = 't85-walkin') = v0 + 1)::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t85_is('1noenquiry',
    (select count(*) from public.crm_records where gym_id = gid and kind = 'enquiry')::text, '3');
  checks := checks + 1; fails := fails || pg_temp.t85_is('1noreferral',
    (select count(*) from public.gym_friend_referrals where gym_id = gid)::text, '0');
  select * into a from public.gym_alerts where gym_id = gid and ref_id = 't85-walkin';
  checks := checks + 1; fails := fails || pg_temp.t85_is('1alert', a.kind || ' ' || a.audience || ' ' || a.urgent || ' ' || a.route,
    'friend_referred all true /enquiries');
  checks := checks + 1; fails := fails || pg_temp.t85_is('1line', a.line,
    'Asha invited Ravi to your gym. Ravi already asked about joining: call them from Enquiries today.');
  checks := checks + 1; fails := fails || pg_temp.t85_is('1nophone', (a.line ~ '[0-9]{5}')::text, 'false');

  -- 2. The same again today from the same link: "sent", nothing more (one note and one alert a day).
  select crm_version into v0 from public.gyms where gym_id = gid;
  r := public.friend_invite_send(code, 'Ravi K', '9876508411', 'morning');
  checks := checks + 1; fails := fails || pg_temp.t85_is('2ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t85_is('2same', (select crm_version from public.gyms where gym_id = gid)::text, v0::text);
  checks := checks + 1; fails := fails || pg_temp.t85_is('2time',
    (select data->'invitedAgain'->>'time' from public.crm_records where gym_id = gid and id = 't85-walkin'), 'evening');
  checks := checks + 1; fails := fails || pg_temp.t85_is('2alerts',
    (select count(*) from public.gym_alerts where gym_id = gid and ref_id = 't85-walkin')::text, '1');

  -- 3. Another member's link for the same enquiry: its own note (the newest wins) and its own alert.
  r := public.friend_invite_send(code2, 'Ravi', '9876508411', 'any');
  checks := checks + 1; fails := fails || pg_temp.t85_is('3by',
    (select data->'invitedAgain'->>'by' from public.crm_records where gym_id = gid and id = 't85-walkin'), 'Bina');
  checks := checks + 1; fails := fails || pg_temp.t85_is('3alerts',
    (select count(*) from public.gym_alerts where gym_id = gid and ref_id = 't85-walkin')::text, '2');

  -- 4. An overdue follow-up stays overdue.
  perform public.friend_invite_send(code, 'Sunil', '9876508412', 'any');
  checks := checks + 1; fails := fails || pg_temp.t85_is('4overdue',
    (select data->>'followUpOn' from public.crm_records where gym_id = gid and id = 't85-late'),
    to_char(public._ist_today() - 3, 'YYYY-MM-DD'));
  checks := checks + 1; fails := fails || pg_temp.t85_is('4note',
    (select data->'invitedAgain'->>'by' from public.crm_records where gym_id = gid and id = 't85-late'), 'Asha Rao');

  -- 5. A member's number: "sent", nothing added to the member, one alert in plain words opening the member's page.
  select crm_version into v0 from public.gyms where gym_id = gid;
  r := public.friend_invite_send(code, 'Mohan', '9876508499', 'evening');
  checks := checks + 1; fails := fails || pg_temp.t85_is('5ok', r::text, '{"ok": true}');
  checks := checks + 1; fails := fails || pg_temp.t85_is('5member',
    (select data::text from public.crm_records where gym_id = gid and id = 't85-mohan'), '{"phone": "+919876508499", "fullName": "Mohan Lal"}');
  checks := checks + 1; fails := fails || pg_temp.t85_is('5version', (select crm_version from public.gyms where gym_id = gid)::text, v0::text);
  select * into a from public.gym_alerts where gym_id = gid and ref_id = 't85-mohan';
  checks := checks + 1; fails := fails || pg_temp.t85_is('5line', a.line, 'Asha invited Mohan, who is already your member.');
  checks := checks + 1; fails := fails || pg_temp.t85_is('5alert', a.kind || ' ' || a.audience || ' ' || a.urgent || ' ' || a.route,
    'friend_referred all true /members/t85-mohan');

  -- 6. The member's own number: "sent", nothing at all.
  select count(*) into n from public.gym_alerts where gym_id = gid;
  r := public.friend_invite_send(code, 'Asha Me', '9876508401', 'any');
  checks := checks + 1; fails := fails || pg_temp.t85_is('6ok', r::text, '{"ok": true}');
  checks := checks + 1; fails := fails || pg_temp.t85_is('6nothing', (select count(*) from public.gym_alerts where gym_id = gid)::text, n::text);

  -- 7. A lost enquiry's number, and a number open at ANOTHER gym: a new friend, as 0056 (enquiry + referral + alert).
  r := public.friend_invite_send(code2, 'Lata', '9876508413', 'morning');
  checks := checks + 1; fails := fails || pg_temp.t85_is('7lostnew',
    (select count(*) from public.crm_records where gym_id = gid and kind = 'enquiry' and data->>'phone' = '+919876508413')::text, '2');
  r := public.friend_invite_send(code2, 'Other', '9876508414', 'morning');
  select data into e from public.crm_records where gym_id = gid and kind = 'enquiry' and data->>'phone' = '+919876508414';
  checks := checks + 1; fails := fails || pg_temp.t85_is('7new', e->>'source' || ' ' || (e->'referral'->>'by') || ' ' || (e->>'interest'),
    'friend Bina Best time to train: Morning');
  checks := checks + 1; fails := fails || pg_temp.t85_is('7othergym',
    (select (data ? 'invitedAgain')::text from public.crm_records where gym_id = gid2 and id = 't85-other'), 'false');
  checks := checks + 1; fails := fails || pg_temp.t85_is('7alert',
    (select count(*) from public.gym_alerts where gym_id = gid and tag = 'friend:' || (e->>'id'))::text, '1');

  -- 8. The link's 5 a day counts these notes too: Asha's link has 3 (Ravi, Sunil, Mohan); 2 new friends, then TOO_MANY.
  checks := checks + 1; fails := fails || pg_temp.t85_is('8a', public.friend_invite_send(code, 'Friend A', '9876508421', 'any')->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t85_is('8b', public.friend_invite_send(code, 'Friend B', '9876508422', 'any')->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t85_is('8cap', public.friend_invite_send(code, 'Friend C', '9876508423', 'any')->>'error', 'TOO_MANY');
  checks := checks + 1; fails := fails || pg_temp.t85_is('8capknown', public.friend_invite_send(code, 'Mohan', '9876508499', 'any')->>'error', 'TOO_MANY');

  -- 9. Still callable by anyone (the page), as in 0056.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.friend_invite_send(text, text, text, text, text)', 'execute') then
    fails := fails || ' 9';
  end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
