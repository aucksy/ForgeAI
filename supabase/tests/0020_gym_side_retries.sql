-- Gym side on a patchy network test (0020: C6-1, C6-6, C6-8, C6-12). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t20_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; pid uuid;
  km text := 't20-member-key'; kb text := 't20-member-b'; kc text := 't20-member-c';
  oid1 uuid := gen_random_uuid(); oid2 uuid := gen_random_uuid(); jid uuid := gen_random_uuid();
  o1 public.shop_orders; o2 public.shop_orders; o3 public.shop_orders;
  j1 jsonb; j2 jsonb; j3 jsonb; r jsonb;
  lines jsonb;
  n int; i int;
  day text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  fails text := ''; checks int := 0;
begin
  insert into public.gyms(name, join_code) values ('T20 Gym', 'T20GYA') returning gym_id into gid;
  insert into public.gym_members(gym_id, name, key_hash) values
    (gid, 'Asha app', public._hash_key(km)), (gid, 'Bilal app', public._hash_key(kb)), (gid, 'Chand app', public._hash_key(kc));
  insert into public.shop_products(gym_id, name, category, price_p, options, stock, active, art_kind, art_tint)
    values (gid, 'Shaker', 'gear', 39900, '[]', 10, true, 'shaker', '#E8661F') returning product_id into pid;
  lines := jsonb_build_array(jsonb_build_object('productId', pid, 'optionId', null, 'qty', 2));

  -- ---------------------------------------------------------------- C6-1 one tap, one order
  o1 := public.member_place_order(km, lines, oid1);
  o2 := public.member_place_order(km, lines, oid1);   -- the answer was lost: the same id again
  fails := fails || pg_temp.t20_is('1a same id, same order', o2.order_id::text, o1.order_id::text);
  select count(*) into n from public.shop_orders where gym_id = gid;
  fails := fails || pg_temp.t20_is('1b one order kept', n::text, '1');
  fails := fails || pg_temp.t20_is('1c stock taken once', (select stock from public.shop_products where product_id = pid)::text, '8');
  o3 := public.member_place_order(km, lines, oid2);   -- a new order: a new id
  fails := fails || pg_temp.t20_is('1d new id, new order', (o3.order_no = o1.order_no + 1)::text, 'true');
  -- An old app (no id) still places orders, one per call, as before.
  perform public.member_place_order(km, lines);
  perform public.member_place_order(p_key => km, p_lines => lines);
  select count(*) into n from public.shop_orders where gym_id = gid;
  fails := fails || pg_temp.t20_is('1e old app still orders', n::text, '4');
  -- Another member sending the same id gets their OWN new order, never Asha's.
  o2 := public.member_place_order(kb, lines, oid1);
  fails := fails || pg_temp.t20_is('1f id is per member', (o2.order_id <> o1.order_id and o2.member_name = 'Bilal app')::text, 'true');
  checks := checks + 6;

  -- ---------------------------------------------------------------- C6-6 one member per join
  j1 := public.member_join('T20GYA', 'Rahul', null, jid);
  j2 := public.member_join('T20GYA', 'Rahul', null, jid);   -- the answer was lost: the same join again
  fails := fails || pg_temp.t20_is('2a same member', j2->>'memberId', j1->>'memberId');
  fails := fails || pg_temp.t20_is('2b a new key', (j2->>'memberKey' <> j1->>'memberKey')::text, 'true');
  select count(*) into n from public.gym_members where gym_id = gid and name = 'Rahul';
  fails := fails || pg_temp.t20_is('2c one Rahul on the list', n::text, '1');
  -- The new key works; the lost one does not.
  r := public.member_me(j2->>'memberKey');
  fails := fails || pg_temp.t20_is('2d new key works', r->>'memberId', j1->>'memberId');
  begin
    perform public.member_me(j1->>'memberKey');
    fails := fails || ' 2e:lost key still works';
  exception when others then
    fails := fails || pg_temp.t20_is('2e lost key refused', sqlerrm, 'BAD_KEY');
  end;
  -- A different join (or an old app with none) is a new member, as before.
  j3 := public.member_join('T20GYA', 'Rahul', null, gen_random_uuid());
  perform public.member_join('T20GYA', 'Rahul');
  select count(*) into n from public.gym_members where gym_id = gid and name = 'Rahul';
  fails := fails || pg_temp.t20_is('2f other joins are new members', n::text, '3');
  -- After Leave, the same join id is a new member (the one who left stays left).
  perform public.member_leave(j2->>'memberKey');
  j3 := public.member_join('T20GYA', 'Rahul', null, jid);
  fails := fails || pg_temp.t20_is('2g left member not revived', (j3->>'memberId' <> j1->>'memberId')::text, 'true');
  -- Only a hash of the join id is kept.
  select count(*) into n from public.gym_members where gym_id = gid and join_hash = convert_to(jid::text, 'UTF8');
  fails := fails || pg_temp.t20_is('2h id kept only hashed', n::text, '0');
  checks := checks + 8;

  -- ---------------------------------------------------------------- C6-8 the same number counts once
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 'm-dev', '{"fullName":"Dev Rao","phone":"+919876543210","archived":false,"createdAt":1}', 1);
  update public.gyms set crm_version = 1 where gym_id = gid;
  -- Chand's number is not on the roster yet; Chand taps Check in three times with ONE number (the
  -- old count said "Too many numbers" here). Calls stay under the 10-a-minute limit.
  for i in 1..3 loop r := public.member_check_in(kc, 'T20GYA', '98290 12345'); end loop;
  fails := fails || pg_temp.t20_is('3a one number never runs out', r->>'error', 'NOT_ON_ROSTER');
  select count(*) into n from public.gym_checkin_misses where gym_id = gid;
  fails := fails || pg_temp.t20_is('3b counted once for the gym', n::text, '1');
  select count(*) into n from public.member_checkin_tries t join public.gym_members m using (member_id)
   where m.key_hash = public._hash_key(kc) and t.what like 'phone%';
  fails := fails || pg_temp.t20_is('3c counted once for the member', n::text, '1');
  select count(*) into n from public.member_checkin_tries t join public.gym_members m using (member_id)
   where m.key_hash = public._hash_key(kc) and t.what like '%9829012345%';
  fails := fails || pg_temp.t20_is('3d number kept only hashed', n::text, '0');
  -- Two more DIFFERENT numbers are fine; a fourth different number is still refused.
  r := public.member_check_in(kc, 'T20GYA', '9000000002');
  r := public.member_check_in(kc, 'T20GYA', '9000000003');
  fails := fails || pg_temp.t20_is('3e third number', r->>'error', 'NOT_ON_ROSTER');
  r := public.member_check_in(kc, 'T20GYA', '9000000004');
  fails := fails || pg_temp.t20_is('3f fourth number', r->>'error', 'TOO_MANY_NUMBERS');
  -- ... but the first number again is not a new number: still allowed.
  r := public.member_check_in(kc, 'T20GYA', '9829012345');
  fails := fails || pg_temp.t20_is('3g first number again', r->>'error', 'NOT_ON_ROSTER');
  -- The gym's hourly cap: a number already counted this hour is not stopped by it; a new one is.
  insert into public.gym_checkin_misses(gym_id) select gid from generate_series(1, 20);
  r := public.member_check_in(kc, 'T20GYA', '9829012345');
  fails := fails || pg_temp.t20_is('3h counted number past the cap', r->>'error', 'NOT_ON_ROSTER');
  r := public.member_check_in(kb, 'T20GYA', '9111111112');
  fails := fails || pg_temp.t20_is('3i new number at the cap', r->>'error', 'TOO_MANY_NUMBERS');
  checks := checks + 9;

  -- ---------------------------------------------------------------- C6-12 an imported visit has no time
  delete from public.gym_checkin_misses where gym_id = gid;
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'visit', 'paper-1', jsonb_build_object('id','paper-1','gymId',gid::text,'memberId','m-dev',
      'visitedOn', day, 'checkedInAt', 0, 'source','import'), 2);
  update public.gyms set crm_version = 2 where gym_id = gid;
  r := public.member_check_in(km, 'T20GYA', '9876543210');
  fails := fails || pg_temp.t20_is('4a already in', r->>'alreadyIn', 'true');
  fails := fails || pg_temp.t20_is('4b no time', coalesce(r->'checkedInAt', 'null'::jsonb)::text, 'null');
  checks := checks + 2;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
