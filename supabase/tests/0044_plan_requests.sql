-- Pause / renew requests from the app (0044, F150). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

-- Run one statement: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t44_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t44_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gb uuid; s_owner uuid; s_staff uuid;
  kop text := 't44-owner-session'; ks text := 't44-staff-session'; kob text := 't44-owner-b';
  ka text := 't44-member-a'; kc text := 't44-member-c'; kn text := 't44-member-n'; kz text := 't44-member-z';
  td date := (now() at time zone 'Asia/Kolkata')::date;
  f1 text := to_char(td + 3, 'YYYY-MM-DD'); t1 text := to_char(td + 9, 'YYYY-MM-DD');
  fails text := ''; checks int := 0; r jsonb; fz uuid; rn uuid; fz2 uuid; rn2 uuid;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T44 Gym', 'T44GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T44 Other', 'T44GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner', '9876500441', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Ravi', '9876500442', 'staff') returning staff_id into s_staff;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_staff, public._hash_key(ks));
  insert into public.gym_owner_keys(gym_id, key_hash) values (gb, public._hash_key(kob));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'plan', 'pl-gold', '{"name":"Gold 3 months","durationUnit":"month","durationCount":3,"priceP":300000,"active":true,"sortOrder":1}', 1),
    (gid, 'plan', 'pl-old', '{"name":"Old plan","durationUnit":"month","durationCount":1,"priceP":100000,"active":false}', 1),
    (gid, 'plan', 'pl-pt', '{"name":"PT 12","durationUnit":"month","durationCount":1,"priceP":500000,"active":true,"ptSessions":12}', 1),
    (gb, 'plan', 'pl-b', '{"name":"B plan","durationUnit":"month","durationCount":1,"priceP":100000,"active":true}', 1),
    (gid, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829012345"}', 1),
    (gid, 'member', 'm-chand', '{"fullName":"Chand Rao","phone":"9829000003"}', 1),
    (gb, 'member', 'm-zoya', '{"fullName":"Zoya Ali","phone":"9829012345"}', 1),
    -- Asha is on Gold today; Chand's plan ended last month.
    (gid, 'membership', 'ms-a', jsonb_build_object('memberId','m-asha','planId','pl-gold','startsOn', to_char(td - 5, 'YYYY-MM-DD'),
       'endsOn', to_char(td + 80, 'YYYY-MM-DD'), 'cancelled', false, 'notes', null), 1),
    (gid, 'membership', 'ms-c', jsonb_build_object('memberId','m-chand','planId','pl-gold','startsOn', to_char(td - 120, 'YYYY-MM-DD'),
       'endsOn', to_char(td - 30, 'YYYY-MM-DD'), 'cancelled', false), 1);
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values
    (gid, 'Asha', '+919829012345', public._hash_key(ka)),
    (gid, 'Chand', '+919829000003', public._hash_key(kc)),
    (gid, 'Nobody', null, public._hash_key(kn)),
    (gb, 'Zoya', '+919829012345', public._hash_key(kz));

  -- 1. The member's read: the active gym plans only (no old plan, no PT pack, no other gym's), nothing asked yet.
  r := public.member_plan_requests(ka);
  checks := checks + 1; fails := fails || pg_temp.t44_is('1ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t44_is('1plans', jsonb_array_length(r->'plans')::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t44_is('1plan', r->'plans'->0->>'name', 'Gold 3 months');
  checks := checks + 1; fails := fails || pg_temp.t44_is('1months', r->'plans'->0->>'durationCount', '3');
  checks := checks + 1; fails := fails || pg_temp.t44_is('1none', (r->'requests')::text, '[]');
  -- 0023's identity answers come back as they are; a wrong key is refused.
  checks := checks + 1; fails := fails || pg_temp.t44_is('1nophone', public.member_plan_requests(kn)->>'error', 'NO_PHONE');
  checks := checks + 1; fails := fails || pg_temp.t44_is('1badkey', pg_temp.t44_run(format(
    'select public.member_plan_requests(%L)', 'nope')), 'BAD_KEY');

  -- 2. Bad pause requests are refused with a code, and nothing is kept.
  checks := checks + 1; fails := fails || pg_temp.t44_is('2kind',
    public.member_ask_plan_change(ka, 'gift', f1, t1, null)->>'error', 'BAD_KIND');
  checks := checks + 1; fails := fails || pg_temp.t44_is('2past',
    public.member_ask_plan_change(ka, 'freeze', to_char(td - 1, 'YYYY-MM-DD'), t1, null)->>'error', 'BAD_DATES');
  checks := checks + 1; fails := fails || pg_temp.t44_is('2back',
    public.member_ask_plan_change(ka, 'freeze', t1, f1, null)->>'error', 'BAD_DATES');
  checks := checks + 1; fails := fails || pg_temp.t44_is('2far',
    public.member_ask_plan_change(ka, 'freeze', to_char(td + 91, 'YYYY-MM-DD'), to_char(td + 95, 'YYYY-MM-DD'), null)->>'error', 'BAD_DATES');
  checks := checks + 1; fails := fails || pg_temp.t44_is('2long',
    public.member_ask_plan_change(ka, 'freeze', f1, to_char(td + 3 + 365, 'YYYY-MM-DD'), null)->>'error', 'BAD_DATES');
  checks := checks + 1; fails := fails || pg_temp.t44_is('2text',
    public.member_ask_plan_change(ka, 'freeze', 'soon', t1, null)->>'error', 'BAD_DATES');
  checks := checks + 1; fails := fails || pg_temp.t44_is('2noplan',
    public.member_ask_plan_change(kc, 'freeze', f1, t1, null)->>'error', 'NO_PLAN');
  checks := checks + 1; fails := fails || pg_temp.t44_is('2kept',
    (select count(*) from public.gym_plan_requests where gym_id = gid)::text, '0');

  -- 3. Asha asks to pause; a second pause while it waits is refused; a renewal may wait beside it.
  r := public.member_ask_plan_change(ka, 'freeze', f1, t1, null);
  fz := (r->'request'->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t44_is('3status', r->'request'->>'status', 'pending');
  checks := checks + 1; fails := fails || pg_temp.t44_is('3dates', (r->'request'->>'from') || '..' || (r->'request'->>'to'), f1 || '..' || t1);
  checks := checks + 1; fails := fails || pg_temp.t44_is('3again',
    public.member_ask_plan_change(ka, 'freeze', f1, t1, null)->>'error', 'ALREADY_ASKED');

  -- 4. Renewals: only an active gym plan of her own gym.
  checks := checks + 1; fails := fails || pg_temp.t44_is('4old', public.member_ask_plan_change(ka, 'renew', null, null, 'pl-old')->>'error', 'BAD_PLAN');
  checks := checks + 1; fails := fails || pg_temp.t44_is('4pt', public.member_ask_plan_change(ka, 'renew', null, null, 'pl-pt')->>'error', 'BAD_PLAN');
  checks := checks + 1; fails := fails || pg_temp.t44_is('4other', public.member_ask_plan_change(ka, 'renew', null, null, 'pl-b')->>'error', 'BAD_PLAN');
  checks := checks + 1; fails := fails || pg_temp.t44_is('4null', public.member_ask_plan_change(ka, 'renew', null, null, null)->>'error', 'BAD_PLAN');
  r := public.member_ask_plan_change(ka, 'renew', null, null, 'pl-gold');
  rn := (r->'request'->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t44_is('4name', r->'request'->>'planName', 'Gold 3 months');
  checks := checks + 1; fails := fails || pg_temp.t44_is('4mine', jsonb_array_length(public.member_plan_requests(ka)->'requests')::text, '2');
  -- Who asked is the member's own list entry, from 0023's checks (never typed).
  checks := checks + 1; fails := fails || pg_temp.t44_is('4roster',
    (select string_agg(distinct roster_id, ',') from public.gym_plan_requests where gym_id = gid), 'm-asha');

  -- 5. The desk sees both, with the member's name; the other gym's key sees none of them.
  r := public.owner_plan_requests(ks);
  checks := checks + 1; fails := fails || pg_temp.t44_is('5n', jsonb_array_length(r)::text, '2');
  checks := checks + 1; fails := fails || pg_temp.t44_is('5name', r->0->>'memberName', 'Asha Verma');
  checks := checks + 1; fails := fails || pg_temp.t44_is('5first', r->0->>'kind', 'freeze');
  checks := checks + 1; fails := fails || pg_temp.t44_is('5other', public.owner_plan_requests(kob)::text, '[]');
  checks := checks + 1; fails := fails || pg_temp.t44_is('5bad', pg_temp.t44_run(format(
    'select public.owner_plan_requests(%L)', 'nope')), 'BAD_KEY');

  -- 6. Approving needs F81's write first: no membership, the wrong one, or one without this request's mark.
  checks := checks + 1; fails := fails || pg_temp.t44_is('6none', pg_temp.t44_run(format(
    'select public.owner_decide_plan_request(%L, %L, %L, null)', ks, fz, 'approved')), 'NOT_DONE');
  checks := checks + 1; fails := fails || pg_temp.t44_is('6nomark', pg_temp.t44_run(format(
    'select public.owner_decide_plan_request(%L, %L, %L, %L)', ks, fz, 'approved', 'ms-a')), 'NOT_DONE');
  checks := checks + 1; fails := fails || pg_temp.t44_is('6chand', pg_temp.t44_run(format(
    'select public.owner_decide_plan_request(%L, %L, %L, %L)', ks, fz, 'approved', 'ms-c')), 'NOT_DONE');
  checks := checks + 1; fails := fails || pg_temp.t44_is('6word', pg_temp.t44_run(format(
    'select public.owner_decide_plan_request(%L, %L, %L, %L)', ks, fz, 'maybe', 'ms-a')), 'INVALID');
  -- Gym B's key cannot decide gym A's request.
  checks := checks + 1; fails := fails || pg_temp.t44_is('6gymb', pg_temp.t44_run(format(
    'select public.owner_decide_plan_request(%L, %L, %L, null)', kob, fz, 'declined')), 'GONE');

  -- 7. The desk's freeze tool (F81) adds the 7 days to Asha's plan with the request's mark; then the
  --    approval goes through, stamped with who did it, and carries the plan's new end from the records.
  update public.crm_records
     set data = data || jsonb_build_object('endsOn', to_char(td + 87, 'YYYY-MM-DD'),
                  'notes', '+7 days (Freeze - asked in the ' || public._plan_request_mark(fz) || '): '
                           || to_char(td + 80, 'YYYY-MM-DD') || ' -> ' || to_char(td + 87, 'YYYY-MM-DD'))
   where gym_id = gid and kind = 'membership' and id = 'ms-a';
  r := public.owner_decide_plan_request(ks, fz, 'approved', 'ms-a');
  checks := checks + 1; fails := fails || pg_temp.t44_is('7status', r->>'status', 'approved');
  checks := checks + 1; fails := fails || pg_temp.t44_is('7ends', r->>'endsOn', to_char(td + 87, 'YYYY-MM-DD'));
  checks := checks + 1; fails := fails || pg_temp.t44_is('7by', r->>'decidedBy', 'Ravi');
  -- Pressed again (a lost answer): the same answer; the other answer now is refused.
  checks := checks + 1; fails := fails || pg_temp.t44_is('7again',
    public.owner_decide_plan_request(kop, fz, 'approved', 'ms-a')->>'decidedBy', 'Ravi');
  checks := checks + 1; fails := fails || pg_temp.t44_is('7flip', pg_temp.t44_run(format(
    'select public.owner_decide_plan_request(%L, %L, %L, null)', kop, fz, 'declined')), 'ALREADY_DECIDED');

  -- 8. The renewal: F81's sale carries the request id as its own id; then it approves with the new dates.
  checks := checks + 1; fails := fails || pg_temp.t44_is('8nosale', pg_temp.t44_run(format(
    'select public.owner_decide_plan_request(%L, %L, %L, %L)', kop, rn, 'approved', 'ms-a')), 'NOT_DONE');
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'membership', 'ms-a2', jsonb_build_object('memberId','m-asha','planId','pl-gold','startsOn', to_char(td + 88, 'YYYY-MM-DD'),
       'endsOn', to_char(td + 178, 'YYYY-MM-DD'), 'cancelled', false, 'priceP', 300000, 'requestId', rn::text), 1);
  r := public.owner_decide_plan_request(kop, rn, 'approved', 'ms-a2');
  checks := checks + 1; fails := fails || pg_temp.t44_is('8status', r->>'status', 'approved');
  checks := checks + 1; fails := fails || pg_temp.t44_is('8dates', (r->>'startsOn') || '..' || (r->>'endsOn'),
    to_char(td + 88, 'YYYY-MM-DD') || '..' || to_char(td + 178, 'YYYY-MM-DD'));
  checks := checks + 1; fails := fails || pg_temp.t44_is('8by', r->>'decidedBy', 'Owner');

  -- 9. The member sees both answers until she has read them; then they go.
  r := public.member_plan_requests(ka);
  checks := checks + 1; fails := fails || pg_temp.t44_is('9n', jsonb_array_length(r->'requests')::text, '2');
  checks := checks + 1; fails := fails || pg_temp.t44_is('9ends',
    (select x->>'endsOn' from jsonb_array_elements(r->'requests') x where x->>'kind' = 'freeze'), to_char(td + 87, 'YYYY-MM-DD'));
  -- Another gym's member cannot mark them read.
  checks := checks + 1; fails := fails || pg_temp.t44_is('9zoya', public.member_saw_plan_requests(kz, array[fz, rn])::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t44_is('9saw', public.member_saw_plan_requests(ka, array[fz, rn])::text, '2');
  checks := checks + 1; fails := fails || pg_temp.t44_is('9gone', (public.member_plan_requests(ka)->'requests')::text, '[]');

  -- 10. A pending request: the member may take it back (only her own); a declined one says so.
  rn2 := (public.member_ask_plan_change(ka, 'renew', null, null, 'pl-gold')->'request'->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t44_is('10zoya', public.member_cancel_plan_request(kz, rn2)->>'cancelled', 'false');
  checks := checks + 1; fails := fails || pg_temp.t44_is('10mine', public.member_cancel_plan_request(ka, rn2)->>'cancelled', 'true');
  checks := checks + 1; fails := fails || pg_temp.t44_is('10twice', public.member_cancel_plan_request(ka, rn2)->>'cancelled', 'false');
  fz2 := (public.member_ask_plan_change(ka, 'freeze', f1, t1, null)->'request'->>'id')::uuid;
  r := public.owner_decide_plan_request(ks, fz2, 'declined', null);
  checks := checks + 1; fails := fails || pg_temp.t44_is('10declined', r->>'status', 'declined');
  checks := checks + 1; fails := fails || pg_temp.t44_is('10nomembership', r->>'membershipId', null);
  checks := checks + 1; fails := fails || pg_temp.t44_is('10cancel', public.member_cancel_plan_request(ka, fz2)->>'cancelled', 'false');
  checks := checks + 1; fails := fails || pg_temp.t44_is('10shown',
    public.member_plan_requests(ka)->'requests'->0->>'status', 'declined');

  -- 11. At most 6 requests a member a day.
  insert into public.gym_plan_requests(gym_id, app_member, roster_id, kind, plan_id, plan_name, status, decided_at)
    select gid, (select member_id from public.gym_members where key_hash = public._hash_key(ka)), 'm-asha', 'renew', 'pl-gold', 'Gold', 'declined', now()
      from generate_series(1, 3);
  checks := checks + 1; fails := fails || pg_temp.t44_is('11many',
    public.member_ask_plan_change(ka, 'renew', null, null, 'pl-gold')->>'error', 'TOO_MANY');

  -- 12. A paused (suspended) gym takes no new request and no decision.
  delete from public.gym_plan_requests where gym_id = gid and status = 'declined' and plan_name = 'Gold';
  rn2 := (public.member_ask_plan_change(ka, 'renew', null, null, 'pl-gold')->'request'->>'id')::uuid;
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = gid;
  perform set_config('forgeai.hq', 'off', true);
  checks := checks + 1; fails := fails || pg_temp.t44_is('12ask',
    public.member_ask_plan_change(ka, 'freeze', f1, t1, null)->>'error', 'SUSPENDED');
  checks := checks + 1; fails := fails || pg_temp.t44_is('12decide', pg_temp.t44_run(format(
    'select public.owner_decide_plan_request(%L, %L, %L, null)', ks, rn2, 'declined')), 'SUSPENDED');
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'active' where gym_id = gid;
  perform set_config('forgeai.hq', 'off', true);

  -- 13. A removed person's session stops at once.
  update public.gym_staff set removed_at = now() where staff_id = s_staff;
  checks := checks + 1; fails := fails || pg_temp.t44_is('13', pg_temp.t44_run(format(
    'select public.owner_plan_requests(%L)', ks)), 'BAD_KEY');

  -- 14. Deleting a gym takes its requests with it.
  checks := checks + 1; fails := fails || pg_temp.t44_is('14del', pg_temp.t44_run(format('delete from public.gyms where gym_id = %L', gid)), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t44_is('14', (select count(*) from public.gym_plan_requests where gym_id = gid)::text, '0');

  -- 15. Anyone may call the key-checked functions (no account); nobody may call the helpers or touch the table.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_plan_requests(text)', 'execute')
     or not has_function_privilege('anon', 'public.member_ask_plan_change(text, text, text, text, text)', 'execute')
     or not has_function_privilege('anon', 'public.member_cancel_plan_request(text, uuid)', 'execute')
     or not has_function_privilege('anon', 'public.member_saw_plan_requests(text, uuid[])', 'execute')
     or not has_function_privilege('anon', 'public.owner_plan_requests(text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_decide_plan_request(text, uuid, text, text)', 'execute')
     or has_function_privilege('anon', 'public._plan_request_json(public.gym_plan_requests)', 'execute')
     or has_function_privilege('anon', 'public._plan_request_mark(uuid)', 'execute')
     or has_table_privilege('anon', 'public.gym_plan_requests', 'select')
     or has_table_privilege('authenticated', 'public.gym_plan_requests', 'select')
     or has_table_privilege('anon', 'public.gym_plan_requests', 'insert')
     or has_table_privilege('authenticated', 'public.gym_plan_requests', 'update') then fails := fails || ' 15'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
