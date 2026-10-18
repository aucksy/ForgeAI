-- "My membership" test (0023). Runs in CI after every migration (scripts/ci/db_checks.sh); can also
-- be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed.
do $$
declare
  gid uuid; gid2 uuid;
  ka text := 'ms-test-key-a'; kb text := 'ms-test-key-b'; kc text := 'ms-test-key-c'; kd text := 'ms-test-key-d';
  r jsonb; fails text := ''; checks int := 0;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  d0 text := to_char(today, 'YYYY-MM-DD');
  past_end text := to_char(today - 40, 'YYYY-MM-DD');
  ends text := to_char(today + 12, 'YYYY-MM-DD');
  ms text := to_char(date_trunc('month', today), 'YYYY-MM-DD');
  before_month text := to_char(date_trunc('month', today) - interval '1 day', 'YYYY-MM-DD');
  raised boolean := false;
  want_visits int;
begin
  insert into public.gyms(name, join_code) values ('MS Test Gym', 'MSTST1') returning gym_id into gid;
  insert into public.gyms(name, join_code) values ('MS Empty Gym', 'MSTST2') returning gym_id into gid2;
  insert into public.gym_members(gym_id, name, phone, checkin_phone, key_hash) values
    (gid, 'asha v', null, '+919829012345', public._hash_key(ka)),
    -- Bilal typed a number at Join only: never matched at a check-in, so not trusted here.
    (gid, 'Bilal', '9829054321', null, public._hash_key(kb)),
    -- Chand's matched number has since been removed from the gym's list.
    (gid, 'Chand app', null, '+919000000001', public._hash_key(kc)),
    (gid2, 'Dev app', null, '+919876543210', public._hash_key(kd));

  -- 1. Nothing online yet.
  r := public.member_membership(ka);
  checks := checks + 1;
  if r->>'error' is distinct from 'GYM_NOT_ONLINE' then fails := fails || ' 1:' || r::text; end if;

  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829012345","archived":false,"createdAt":1}', 1),
    (gid, 'member', 'm-bilal', '{"fullName":"Bilal Khan","phone":"98290 54321","archived":false,"createdAt":2}', 1),
    -- Asha: an old plan, the one covering today (with PT), a cancelled one, and a renewal paid ahead.
    (gid, 'membership', 'ms-old', jsonb_build_object('memberId','m-asha','planName','Monthly','startsOn','2020-01-01','endsOn', past_end, 'cancelled', false, 'priceP', 150000), 1),
    (gid, 'membership', 'ms-now', jsonb_build_object('memberId','m-asha','planName','Quarterly + PT','startsOn', to_char(today - 78, 'YYYY-MM-DD'),
       'endsOn', ends, 'cancelled', false, 'priceP', 900000, 'ptSessions', 12, 'ptLog', jsonb_build_array('2026-01-01','2026-01-03','2026-01-05'), 'trainer', 'Ravi'), 1),
    (gid, 'membership', 'ms-cancel', jsonb_build_object('memberId','m-asha','planName','Yearly','startsOn', d0, 'endsOn', '2099-01-01', 'cancelled', true), 1),
    (gid, 'membership', 'ms-next', jsonb_build_object('memberId','m-asha','planName','Quarterly','startsOn', to_char(today + 13, 'YYYY-MM-DD'),
       'endsOn', to_char(today + 103, 'YYYY-MM-DD'), 'cancelled', false), 1),
    -- Visits: two this month (one day twice), one last month, one deleted.
    (gid, 'visit', 'v1', jsonb_build_object('memberId','m-asha','visitedOn', ms), 1),
    (gid, 'visit', 'v2', jsonb_build_object('memberId','m-asha','visitedOn', d0), 1),
    (gid, 'visit', 'v2b', jsonb_build_object('memberId','m-asha','visitedOn', d0), 1),
    (gid, 'visit', 'v3', jsonb_build_object('memberId','m-asha','visitedOn', before_month), 1),
    (gid, 'visit', 'v4', jsonb_build_object('memberId','m-asha','visitedOn', d0), 1);
  update public.crm_records set deleted = true where gym_id = gid and id = 'v4';
  update public.gyms set crm_version = 1 where gym_id = gid;

  -- 2. Asha: today's plan, the renewal after it, the old end, this month's days.
  r := public.member_membership(ka);
  checks := checks + 1;
  if r->>'ok' is distinct from 'true' or r->>'memberName' <> 'Asha' or r->>'gymName' <> 'MS Test Gym'
     or r->'current'->>'planName' <> 'Quarterly + PT' or r->'current'->>'endsOn' <> ends
     or (r->'current'->>'ptSessions')::int <> 12 or (r->'current'->>'ptUsed')::int <> 3 or r->'current'->>'trainer' <> 'Ravi'
     or r->'next'->>'planName' <> 'Quarterly' or r->>'lastEndedOn' <> past_end then
    fails := fails || ' 2:' || r::text;
  end if;
  checks := checks + 1;
  -- On the 1st, the month's first day is today: one day so far.
  want_visits := (case when ms = d0 then 1 else 2 end);
  if (r->>'visitsThisMonth')::int <> want_visits then fails := fails || ' 2v:' || (r->>'visitsThisMonth'); end if;
  -- 3. No money in the answer, ever.
  checks := checks + 1;
  if r::text ~* 'price|amount|paise|due|payment' then fails := fails || ' 3:' || r::text; end if;

  -- 4. A number given only at Join is not used: the member must check in once first.
  r := public.member_membership(kb);
  checks := checks + 1;
  if r->>'error' is distinct from 'NO_PHONE' or r->>'gymName' <> 'MS Test Gym' then fails := fails || ' 4:' || r::text; end if;

  -- 5. A matched number no longer on the list.
  r := public.member_membership(kc);
  checks := checks + 1;
  if r->>'error' is distinct from 'NOT_ON_ROSTER' then fails := fails || ' 5:' || r::text; end if;

  -- 6. On the list with no plan at all: ok, nothing current, nothing next.
  update public.gym_members set checkin_phone = '+919829054321' where key_hash = public._hash_key(kb);
  r := public.member_membership(kb);
  checks := checks + 1;
  if r->>'ok' is distinct from 'true' or jsonb_typeof(r->'current') <> 'null' or jsonb_typeof(r->'next') <> 'null'
     or jsonb_typeof(r->'lastEndedOn') <> 'null' or (r->>'visitsThisMonth')::int <> 0 then
    fails := fails || ' 6:' || r::text;
  end if;

  -- 6b. Someone who typed another member's number (a different first name) sees nothing of theirs.
  update public.gym_members set name = 'Imposter' where key_hash = public._hash_key(kb);
  r := public.member_membership(kb);
  checks := checks + 1;
  if r->>'error' is distinct from 'NAME_MISMATCH' or r::text ~ 'Bilal' then fails := fails || ' 6b:' || r::text; end if;

  -- 6c. A number two members share (a parent and child): nobody's plan, ask the desk.
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 'm-bilal-son', '{"fullName":"Bilal Junior","phone":"9829054321","archived":false,"createdAt":9}', 1);
  update public.gym_members set name = 'Bilal' where key_hash = public._hash_key(kb);
  r := public.member_membership(kb);
  checks := checks + 1;
  if r->>'error' is distinct from 'SHARED_NUMBER' then fails := fails || ' 6c:' || r::text; end if;

  -- 7. Another gym's member never sees this gym's records.
  r := public.member_membership(kd);
  checks := checks + 1;
  if r->>'error' is distinct from 'GYM_NOT_ONLINE' then fails := fails || ' 7:' || r::text; end if;

  -- 8. A dead key is refused.
  begin
    perform public.member_membership('no-such-key');
  exception when others then
    raised := sqlerrm = 'BAD_KEY';
  end;
  checks := checks + 1;
  if not raised then fails := fails || ' 8'; end if;

  -- 9. Anyone may call it (the app has no account); nobody may call its helpers.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_membership(text)', 'execute')
     or has_function_privilege('anon', 'public._first_name_key(text)', 'execute') then fails := fails || ' 9'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
