-- Bring a friend (0056, F147). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be
-- pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

create or replace function pg_temp.t56_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gid2 uuid;
  ka text := 't56-member-asha'; kb text := 't56-member-bina'; ko text := 't56-owner';
  fails text := ''; checks int := 0; r jsonb; code text; code2 text; v0 bigint; e jsonb; eid text;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T56 Gym', 'T56GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T56 Other', 'T56GYB', 1) returning gym_id into gid2;
  insert into public.gym_owner_keys(gym_id, key_hash) values (gid, public._hash_key(ko));
  -- Asha is on the gym's list (same number and first name); Bina is in the app only.
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Asha', public._hash_key(ka), '9876505601');
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Bina', public._hash_key(kb), '9876505602');
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 't56-asha', '{"fullName":"Asha  Rao","phone":"+919876505601"}', 1),
    (gid, 'member', 't56-old', '{"fullName":"Old Member","phone":"+919876505699"}', 1),
    (gid, 'gym', gid::text, '{"name":"T56 Gym","friendRewardDays":7}', 1);

  -- 1. The member's invite: a code, made once and kept; the free days; nobody joined yet.
  r := public.member_friend_invite(ka);
  code := r->>'code';
  checks := checks + 1; fails := fails || pg_temp.t56_is('1ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t56_is('1code', (code ~ '^[A-HJ-NP-Z2-9]{8}$')::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t56_is('1days', r->>'rewardDays', '7');
  checks := checks + 1; fails := fails || pg_temp.t56_is('1joined', r->>'joined', '0');
  checks := checks + 1; fails := fails || pg_temp.t56_is('1gym', r->>'gymName', 'T56 Gym');
  checks := checks + 1; fails := fails || pg_temp.t56_is('1same', public.member_friend_invite(ka)->>'code', code);
  code2 := public.member_friend_invite(kb)->>'code';
  checks := checks + 1; fails := fails || pg_temp.t56_is('1other', (code2 <> code)::text, 'true');

  -- 2. The page's preview: the gym and the sharer's first name only; an unknown code is null.
  r := public.friend_invite_preview(lower(code));
  checks := checks + 1; fails := fails || pg_temp.t56_is('2gym', r->>'gymName', 'T56 Gym');
  checks := checks + 1; fails := fails || pg_temp.t56_is('2who', r->>'inviter', 'Asha');
  checks := checks + 1; fails := fails || pg_temp.t56_is('2nophone', (r::text like '%98765%')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t56_is('2none', public.friend_invite_preview('ZZZZZZZZ')::text, null);

  -- 3. The form: a bad number and a bad name are refused; a bot is answered as sent and nothing is kept.
  checks := checks + 1; fails := fails || pg_temp.t56_is('3phone', public.friend_invite_send(code, 'Ravi Kumar', '12345', 'evening')->>'error', 'BAD_PHONE');
  checks := checks + 1; fails := fails || pg_temp.t56_is('3name', public.friend_invite_send(code, ' 1 ', '9876505611', 'evening')->>'error', 'BAD_NAME');
  checks := checks + 1; fails := fails || pg_temp.t56_is('3code', public.friend_invite_send('ZZZZZZZZ', 'Ravi Kumar', '9876505611', 'evening')->>'error', 'NO_INVITE');
  checks := checks + 1; fails := fails || pg_temp.t56_is('3bot', public.friend_invite_send(code, 'Ravi Kumar', '9876505611', 'evening', 'http://x')->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t56_is('3botnothing',
    (select count(*) from public.crm_records where gym_id = gid and kind = 'enquiry')::text, '0');

  -- 4. A real friend: one open enquiry in THIS gym, marked with who referred them; the version moved on.
  select crm_version into v0 from public.gyms where gym_id = gid;
  r := public.friend_invite_send(code, '  Ravi   Kumar ', '+91 98765 05611', 'evening');
  checks := checks + 1; fails := fails || pg_temp.t56_is('4ok', r->>'ok', 'true');
  select id, data into eid, e from public.crm_records where gym_id = gid and kind = 'enquiry';
  checks := checks + 1; fails := fails || pg_temp.t56_is('4name', e->>'name', 'Ravi Kumar');
  checks := checks + 1; fails := fails || pg_temp.t56_is('4phone', e->>'phone', '+919876505611');
  checks := checks + 1; fails := fails || pg_temp.t56_is('4status', e->>'status', 'open');
  checks := checks + 1; fails := fails || pg_temp.t56_is('4source', e->>'source', 'friend');
  checks := checks + 1; fails := fails || pg_temp.t56_is('4by', e->'referral'->>'by', 'Asha Rao');
  checks := checks + 1; fails := fails || pg_temp.t56_is('4roster', e->'referral'->>'memberId', 't56-asha');
  checks := checks + 1; fails := fails || pg_temp.t56_is('4time', e->>'interest', 'Best time to train: Evening');
  checks := checks + 1; fails := fails || pg_temp.t56_is('4follow', e->>'followUpOn', to_char(public._ist_today(), 'YYYY-MM-DD'));
  checks := checks + 1; fails := fails || pg_temp.t56_is('4id', (e->>'id' = eid)::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t56_is('4version',
    ((select crm_version from public.gyms where gym_id = gid) = v0 + 1
     and (select version from public.crm_records where gym_id = gid and id = eid) = v0 + 1)::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t56_is('4othergym',
    (select count(*) from public.crm_records where gym_id = gid2)::text, '0');

  -- 5. Already known: the same number again, a member's number, the sharer's own: answered as sent, nothing new.
  checks := checks + 1; fails := fails || pg_temp.t56_is('5again', public.friend_invite_send(code, 'Ravi K', '9876505611', 'any')->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t56_is('5member', public.friend_invite_send(code, 'Old One', '9876505699', 'any')->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t56_is('5self', public.friend_invite_send(code, 'Asha Me', '9876505601', 'any')->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t56_is('5count',
    (select count(*) from public.crm_records where gym_id = gid and kind = 'enquiry')::text, '1');

  -- 6. Bina is not on the gym's list: her friend's enquiry names her app name and no list id.
  r := public.friend_invite_send(code2, 'Chetan', '9876505612', 'morning');
  select data into e from public.crm_records where gym_id = gid and kind = 'enquiry' and data->>'phone' = '+919876505612';
  checks := checks + 1; fails := fails || pg_temp.t56_is('6by', e->'referral'->>'by', 'Bina');
  checks := checks + 1; fails := fails || pg_temp.t56_is('6roster', e->'referral'->>'memberId', null);
  checks := checks + 1; fails := fails || pg_temp.t56_is('6time', e->'referral'->>'time', 'morning');

  -- 7. Joined: Asha's count is 1 once the desk marks the enquiry joined; the owner's summary agrees.
  update public.crm_records set data = data || '{"status":"joined","memberId":"t56-ravi"}' where gym_id = gid and id = eid;
  checks := checks + 1; fails := fails || pg_temp.t56_is('7joined', public.member_friend_invite(ka)->>'joined', '1');
  checks := checks + 1; fails := fails || pg_temp.t56_is('7bina', public.member_friend_invite(kb)->>'joined', '0');
  r := public.owner_friend_summary(ko);
  checks := checks + 1; fails := fails || pg_temp.t56_is('7links', r->>'links', '2');
  checks := checks + 1; fails := fails || pg_temp.t56_is('7asked', r->>'asked', '2');
  checks := checks + 1; fails := fails || pg_temp.t56_is('7sum', r->>'joined', '1');

  -- 8. The days off (0 or empty): null.
  update public.crm_records set data = data || '{"friendRewardDays":0}' where gym_id = gid and kind = 'gym';
  checks := checks + 1; fails := fails || pg_temp.t56_is('8off', public.member_friend_invite(ka)->>'rewardDays', null);

  -- 9. At most 5 a day from one link.
  perform public.friend_invite_send(code, 'Friend A', '9876505621', 'any');
  perform public.friend_invite_send(code, 'Friend B', '9876505622', 'any');
  perform public.friend_invite_send(code, 'Friend C', '9876505623', 'any');
  perform public.friend_invite_send(code, 'Friend D', '9876505624', 'any');
  checks := checks + 1; fails := fails || pg_temp.t56_is('9cap', public.friend_invite_send(code, 'Friend E', '9876505625', 'any')->>'error', 'TOO_MANY');

  -- 10. A member who left: the link stops (preview null, form refused, no invite of their own).
  update public.gym_members set left_at = now() where key_hash = public._hash_key(kb);
  checks := checks + 1; fails := fails || pg_temp.t56_is('10preview', public.friend_invite_preview(code2)::text, null);
  checks := checks + 1; fails := fails || pg_temp.t56_is('10send', public.friend_invite_send(code2, 'Dev', '9876505631', 'any')->>'error', 'NO_INVITE');
  checks := checks + 1; fails := fails || pg_temp.t56_is('10me', public.member_friend_invite(kb)->>'error', 'LEFT');

  -- 11. Who may call what: the helpers nobody; the four functions anyone (each checks a key or a code).
  checks := checks + 1;
  if has_function_privilege('anon', 'public._friend_code()', 'execute')
     or has_function_privilege('anon', 'public._friend_reward_days(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._friend_reward_days(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.member_friend_invite(text)', 'execute')
     or not has_function_privilege('anon', 'public.friend_invite_preview(text)', 'execute')
     or not has_function_privilege('anon', 'public.friend_invite_send(text, text, text, text, text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_friend_summary(text)', 'execute') then
    fails := fails || ' 11';
  end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
