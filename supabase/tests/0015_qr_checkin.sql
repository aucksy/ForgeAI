-- QR check-in test (0015 + the 0016 fixes). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed.
do $$
declare
  gid uuid; gid2 uuid;
  ka text := 'qr-test-key-a'; kb text := 'qr-test-key-b'; kc text := 'qr-test-key-c';
  kd text := 'qr-test-key-d'; ke text := 'qr-test-key-e'; kf text := 'qr-test-key-f'; kz text := 'qr-test-key-z';
  r jsonb; n int; ver bigint; fails text := ''; checks int := 0;
  day text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  i int;
begin
  insert into public.gyms(name, join_code) values ('QR Test Gym', 'QRTST1') returning gym_id into gid;
  insert into public.gyms(name, join_code) values ('QR Other Gym', 'QRTST2') returning gym_id into gid2;
  -- App members. A gave a number at Join: it is NOT trusted for check-in (review, 15 Oct 2026).
  insert into public.gym_members(gym_id, name, phone, key_hash) values
    (gid, 'Asha app', '9829012345', public._hash_key(ka)),
    (gid, 'Bilal app', null, public._hash_key(kb)),
    (gid, 'Chand app', null, public._hash_key(kc)),
    (gid, 'Dev app', null, public._hash_key(kd)),
    (gid, 'Esha app', null, public._hash_key(ke)),
    (gid, 'Farah app', null, public._hash_key(kf)),
    (gid2, 'Zoya app', null, public._hash_key(kz));

  -- 1. No records online yet.
  r := public.member_check_in(ka, 'QRTST1', '9829012345');
  checks := checks + 1;
  if r->>'error' is distinct from 'GYM_NOT_ONLINE' then fails := fails || ' 1:' || r::text; end if;

  -- The roster: phones as the panel saves them (E.164) and as typed by hand.
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829012345","archived":false,"createdAt":1}', 1),
    (gid, 'member', 'm-bilal', '{"fullName":"Bilal Khan","phone":"98290 54321","archived":false,"createdAt":2}', 1),
    (gid, 'member', 'm-chand', '{"fullName":"Chand Old","phone":"+919000000001","archived":true,"createdAt":3}', 1),
    (gid, 'member', 'm-dev', '{"fullName":"Dev Rao","phone":"919876543210","archived":false,"createdAt":4}', 1),
    (gid, 'member', 'm-gone', '{"fullName":"Gone","phone":"+919111111111","archived":false,"createdAt":5}', 1),
    (gid, 'member', 'm-farah', '{"fullName":"Farah Ali","phone":"+919700000007","archived":false,"createdAt":6}', 1),
    -- Asha's plan covers today; Dev's ended yesterday; Bilal has a cancelled one.
    (gid, 'membership', 'ms-asha', jsonb_build_object('memberId','m-asha','startsOn','2020-01-01','endsOn', day, 'cancelled', false), 1),
    (gid, 'membership', 'ms-dev', jsonb_build_object('memberId','m-dev','startsOn','2020-01-01',
       'endsOn', to_char((now() at time zone 'Asia/Kolkata')::date - 1, 'YYYY-MM-DD'), 'cancelled', false), 1),
    (gid, 'membership', 'ms-bilal', jsonb_build_object('memberId','m-bilal','startsOn','2020-01-01','endsOn','2099-01-01','cancelled', true), 1);
  update public.crm_records set deleted = true where gym_id = gid and id = 'm-gone';
  -- Dev was already checked in at the desk today (a random id).
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'visit', 'desk-uuid-1', jsonb_build_object('id','desk-uuid-1','gymId',gid::text,'memberId','m-dev',
      'visitedOn', day, 'checkedInAt', 1700000000000, 'source','desk'), 2);
  update public.gyms set crm_version = 2 where gym_id = gid;

  -- 2. The number from Join is not used: asked for again.
  r := public.member_check_in(ka, 'QRTST1');
  checks := checks + 1;
  if r->>'error' is distinct from 'NO_PHONE' then fails := fails || ' 2:' || r::text; end if;

  -- 3. The scanned code is required.
  r := public.member_check_in(ka, null, '9829012345');
  checks := checks + 1;
  if r->>'error' is distinct from 'OTHER_GYM' then fails := fails || ' 3:' || r::text; end if;

  -- 4. Typed '9829012345' matches roster '+919829012345'; plan covers today.
  r := public.member_check_in(ka, 'qrtst1', '9829012345');
  checks := checks + 1;
  if not coalesce((r->>'ok')::boolean, false) or (r->>'alreadyIn')::boolean or r->>'memberName' is distinct from 'Asha'
     or r->>'day' is distinct from day or r->>'gymName' is distinct from 'QR Test Gym'
     or (r->>'planOk')::boolean is distinct from true then fails := fails || ' 4:' || r::text; end if;
  select crm_version into ver from public.gyms where gym_id = gid;
  select count(*) into n from public.crm_records
   where gym_id = gid and kind = 'visit' and id = 'm-asha:' || day and version = 3
     and data->>'source' = 'app' and data->>'memberId' = 'm-asha' and data->>'visitedOn' = day and not deleted;
  checks := checks + 1;
  if ver <> 3 or n <> 1 then fails := fails || ' 4b:ver=' || ver || ',rows=' || n; end if;

  -- 5. Scanned again, nothing typed: the matched number is remembered; alreadyIn, nothing written.
  r := public.member_check_in(ka, 'QRTST1');
  select crm_version into ver from public.gyms where gym_id = gid;
  select count(*) into n from public.crm_records where gym_id = gid and kind = 'visit' and data->>'memberId' = 'm-asha';
  checks := checks + 1;
  if not coalesce((r->>'alreadyIn')::boolean, false) or ver <> 3 or n <> 1 then fails := fails || ' 5:' || r::text; end if;

  -- 6. Desk already checked Dev in (different id); '09876543210' against '919876543210'; plan ended.
  r := public.member_check_in(kd, 'QRTST1', '09876543210');
  select count(*) into n from public.crm_records where gym_id = gid and kind = 'visit' and data->>'memberId' = 'm-dev';
  checks := checks + 1;
  if not coalesce((r->>'alreadyIn')::boolean, false) or (r->>'checkedInAt')::bigint is distinct from 1700000000000 or n <> 1
     or (r->>'planOk')::boolean is distinct from false then fails := fails || ' 6:' || r::text; end if;

  -- 7. No number yet, then a badly typed one, then '+91 98290-54321' against '98290 54321'.
  r := public.member_check_in(kb, 'QRTST1');
  checks := checks + 1;
  if r->>'error' is distinct from 'NO_PHONE' then fails := fails || ' 7a:' || r::text; end if;
  r := public.member_check_in(kb, 'QRTST1', '12345');
  checks := checks + 1;
  if r->>'error' is distinct from 'BAD_PHONE' then fails := fails || ' 7b:' || r::text; end if;
  r := public.member_check_in(kb, 'QRTST1', '+91 98290-54321');
  checks := checks + 1;
  if not coalesce((r->>'ok')::boolean, false) or r->>'memberName' is distinct from 'Bilal'
     or (r->>'planOk')::boolean is distinct from false then fails := fails || ' 7c:' || r::text; end if;
  select count(*) into n from public.gym_members
   where key_hash = public._hash_key(kb) and checkin_phone = '+919829054321' and phone = '+919829054321';
  checks := checks + 1;
  if n <> 1 then fails := fails || ' 7d:number not kept'; end if;

  -- 8. Only an ARCHIVED roster row has Chand's number; a DELETED row does not count either; and a
  --    number that matched nobody is NOT kept.
  r := public.member_check_in(kc, 'QRTST1', '9000000001');
  checks := checks + 1;
  if r->>'error' is distinct from 'NOT_ON_ROSTER' or r->>'phone' is distinct from '+919000000001' then fails := fails || ' 8:' || r::text; end if;
  r := public.member_check_in(kc, 'QRTST1', '9111111111');
  checks := checks + 1;
  if r->>'error' is distinct from 'NOT_ON_ROSTER' then fails := fails || ' 8b:' || r::text; end if;
  select count(*) into n from public.gym_members where key_hash = public._hash_key(kc) and phone is null and checkin_phone is null;
  checks := checks + 1;
  if n <> 1 then fails := fails || ' 8c:a number that matched nobody was kept'; end if;

  -- 9. Three numbers a day per member: the 4th is TOO_MANY_NUMBERS.
  r := public.member_check_in(kc, 'QRTST1', '9222222222');
  checks := checks + 1;
  if r->>'error' is distinct from 'NOT_ON_ROSTER' then fails := fails || ' 9a:' || r::text; end if;
  r := public.member_check_in(kc, 'QRTST1', '9333333333');
  checks := checks + 1;
  if r->>'error' is distinct from 'TOO_MANY_NUMBERS' then fails := fails || ' 9b:' || r::text; end if;

  -- 10. The other gym's poster.
  r := public.member_check_in(ka, 'QRTST2');
  checks := checks + 1;
  if r->>'error' is distinct from 'OTHER_GYM' then fails := fails || ' 10:' || r::text; end if;

  -- 11. The same number in another gym never reaches this gym's roster (Zoya's gym is not online).
  r := public.member_check_in(kz, 'QRTST2', '9829012345');
  checks := checks + 1;
  if r->>'error' is distinct from 'GYM_NOT_ONLINE' then fails := fails || ' 11:' || r::text; end if;

  -- 12. Undo at the desk, then scan again: the row comes back.
  update public.crm_records set deleted = true where gym_id = gid and kind = 'visit' and id = 'm-asha:' || day;
  r := public.member_check_in(ka, 'QRTST1');
  select count(*) into n from public.crm_records where gym_id = gid and kind = 'visit' and id = 'm-asha:' || day and not deleted;
  checks := checks + 1;
  if (r->>'alreadyIn')::boolean is distinct from false or n <> 1 then fails := fails || ' 12:' || r::text; end if;

  -- 13. A key nobody has.
  begin
    r := public.member_check_in('no-such-key', 'QRTST1');
    fails := fails || ' 13:no BAD_KEY';
  exception when others then
    if sqlerrm <> 'BAD_KEY' then fails := fails || ' 13:' || sqlerrm; end if;
  end;
  checks := checks + 1;

  -- 14. Rate limit: the 11th call in a minute is refused.
  for i in 1..10 loop r := public.member_check_in(ke, 'QRTST1'); end loop;
  r := public.member_check_in(ke, 'QRTST1');
  checks := checks + 1;
  if r->>'error' is distinct from 'TOO_MANY' then fails := fails || ' 14:' || r::text; end if;

  -- 15. Gym-wide cap: after 20 numbers that matched nobody in an hour, no new number is looked up
  --     (stops a script that keeps making new keys) ...
  insert into public.gym_checkin_misses(gym_id) select gid from generate_series(1, 20);
  r := public.member_check_in(kf, 'QRTST1', '9700000007');
  checks := checks + 1;
  if r->>'error' is distinct from 'TOO_MANY_NUMBERS' then fails := fails || ' 15a:' || r::text; end if;
  -- ... but a member whose number already matched still checks in.
  r := public.member_check_in(kb, 'QRTST1');
  checks := checks + 1;
  if not coalesce((r->>'ok')::boolean, false) then fails := fails || ' 15b:' || r::text; end if;

  -- 16. Leave forgets both numbers.
  perform public.member_leave(kb);
  select count(*) into n from public.gym_members where name = 'Bilal app' and gym_id = gid and phone is null and checkin_phone is null;
  checks := checks + 1;
  if n <> 1 then fails := fails || ' 16:numbers kept after Leave'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
