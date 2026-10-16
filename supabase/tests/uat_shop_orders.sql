-- UAT (17 Oct 2026): the shop's order moves, gym messages, the invite preview and starting a gym.
-- Runs in CI after every migration (scripts/ci/db_checks.sh); can also be pasted into the live SQL
-- Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).
-- Who may reach these at all (gym B, the front desk, other members) is in uat_access_matrix.sql.
--
-- Order moves (0002 owner_set_order_status): ordered -> ready | collected | cancelled;
-- ready -> ordered (undo a mis-tap) | collected | cancelled. Collected and cancelled are final.
-- A gym cancel puts the stock back and records cancelled_by 'gym'. A member may cancel their own
-- order only while it is 'ordered' (TOO_LATE after), and the stock goes back.

-- 'ok', or the error the statement raised.
create or replace function pg_temp.us_try(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.us_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $uat$
declare
  gid uuid; gb uuid; s_owner uuid; s_desk uuid; s_ob uuid; pid uuid; qid uuid;
  ko text := 'uat-shop-owner'; kd text := 'uat-shop-desk'; kob text := 'uat-shop-owner-b';
  k1 text := 'uat-shop-m1'; k2 text := 'uat-shop-m2'; k3 text := 'uat-shop-m3';
  o public.shop_orders; o2 public.shop_orders; o3 public.shop_orders; o4 public.shop_orders; o5 public.shop_orders;
  plain jsonb; opt jsonb; st text; r jsonb; msg uuid; msg2 uuid; nk text; sk text; v bigint;
  fails text := ''; checks int := 0;
begin
  insert into public.gyms(name, join_code) values ('UAT Shop Gym', 'UQSHPA') returning gym_id into gid;
  insert into public.gyms(name, join_code) values ('UAT Shop Gym B', 'UQSHPB') returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner', '9811400011', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Desk', '9811400012', 'staff') returning staff_id into s_desk;
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Owner B', '9811400021', 'owner') returning staff_id into s_ob;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(ko)), (s_desk, public._hash_key(kd)), (s_ob, public._hash_key(kob));
  insert into public.gym_members(gym_id, name, key_hash) values (gid, 'Asha app', public._hash_key(k1)), (gid, 'Bilal app', public._hash_key(k2));
  insert into public.shop_products(gym_id, name, category, price_p, options, stock, active)
    values (gid, 'Shaker', 'gear', 39900, '[]', 10, true) returning product_id into pid;
  insert into public.shop_products(gym_id, name, category, price_p, option_name, options, stock, active)
    values (gid, 'T-shirt', 'clothing', 59900, 'Size', '[{"id":"m","label":"M","stock":3}]', 3, true) returning product_id into qid;
  plain := jsonb_build_array(jsonb_build_object('productId', pid, 'optionId', null, 'qty', 2));
  opt := jsonb_build_array(jsonb_build_object('productId', qid, 'optionId', 'm', 'qty', 2));

  -- ---------------------------------------------------------------- 1. member cancels
  o := public.member_place_order(k1, plain);
  fails := fails || pg_temp.us_is('1a order takes stock', (select stock from public.shop_products where product_id = pid)::text, '8');
  fails := fails || pg_temp.us_is('1b price read on the server', o.total_p::text || '/' || o.status, '79800/ordered');
  o := public.member_cancel_order(k1, o.order_id);
  fails := fails || pg_temp.us_is('1c member cancels own ordered order', o.status || '/' || o.cancelled_by, 'cancelled/member');
  fails := fails || pg_temp.us_is('1d stock back', (select stock from public.shop_products where product_id = pid)::text, '10');
  o2 := public.member_place_order(k1, plain);
  perform public.owner_set_order_status(ko, o2.order_id, 'ready');
  fails := fails || pg_temp.us_is('1e member cancels once ready',
    pg_temp.us_try(format('select public.member_cancel_order(%L, %L::uuid)', k1, o2.order_id)), 'TOO_LATE');
  fails := fails || pg_temp.us_is('1f stock still taken', (select stock from public.shop_products where product_id = pid)::text, '8');
  fails := fails || pg_temp.us_is('1g another member cancels it',
    pg_temp.us_try(format('select public.member_cancel_order(%L, %L::uuid)', k2, o2.order_id)), 'GONE');
  fails := fails || pg_temp.us_is('1h more than the shelf',
    pg_temp.us_try(format('select public.member_place_order(%L, %L::jsonb)', k2,
      jsonb_build_array(jsonb_build_object('productId', pid, 'optionId', null, 'qty', 9)))), 'SOLD_OUT:Shaker');
  checks := checks + 8;

  -- ---------------------------------------------------------------- 2. the gym moves orders
  -- o2 is ready: undo to ordered, then hand it over straight from ordered.
  fails := fails || pg_temp.us_is('2a ready -> ordered (undo)', (public.owner_set_order_status(ko, o2.order_id, 'ordered')).status, 'ordered');
  fails := fails || pg_temp.us_is('2b ordered -> ordered', pg_temp.us_try(format('select public.owner_set_order_status(%L, %L::uuid, ''ordered'')', ko, o2.order_id)), 'BAD_STEP');
  fails := fails || pg_temp.us_is('2c ordered -> collected', (public.owner_set_order_status(ko, o2.order_id, 'collected')).status, 'collected');
  fails := fails || pg_temp.us_is('2d collected keeps the stock taken', (select stock from public.shop_products where product_id = pid)::text, '8');
  -- o3: ordered -> ready -> ready (refused) -> collected, an option line.
  o3 := public.member_place_order(k2, opt);
  fails := fails || pg_temp.us_is('2e option stock taken', (select (options->0->>'stock') || '/' || stock from public.shop_products where product_id = qid), '1/1');
  fails := fails || pg_temp.us_is('2f ordered -> ready', (public.owner_set_order_status(ko, o3.order_id, 'ready')).status, 'ready');
  fails := fails || pg_temp.us_is('2g ready -> ready', pg_temp.us_try(format('select public.owner_set_order_status(%L, %L::uuid, ''ready'')', ko, o3.order_id)), 'BAD_STEP');
  fails := fails || pg_temp.us_is('2h ready -> collected', (public.owner_set_order_status(ko, o3.order_id, 'collected')).status, 'collected');
  -- o4: the FRONT DESK moves it on (orders stay open to the desk, 0018), the gym cancels from ready.
  o4 := public.member_place_order(k2, jsonb_build_array(jsonb_build_object('productId', pid, 'optionId', null, 'qty', 3)));
  fails := fails || pg_temp.us_is('2i desk: ordered -> ready', (public.owner_set_order_status(kd, o4.order_id, 'ready')).status, 'ready');
  o4 := public.owner_set_order_status(ko, o4.order_id, 'cancelled');
  fails := fails || pg_temp.us_is('2j gym cancels from ready', o4.status || '/' || o4.cancelled_by, 'cancelled/gym');
  fails := fails || pg_temp.us_is('2k stock back after a gym cancel', (select stock from public.shop_products where product_id = pid)::text, '8');
  -- o5: the gym cancels from ordered, an option line: the option's stock and the total both go back.
  o5 := public.member_place_order(k1, jsonb_build_array(jsonb_build_object('productId', qid, 'optionId', 'm', 'qty', 1)));
  o5 := public.owner_set_order_status(ko, o5.order_id, 'cancelled');
  fails := fails || pg_temp.us_is('2l gym cancels from ordered', o5.status || '/' || o5.cancelled_by, 'cancelled/gym');
  fails := fails || pg_temp.us_is('2m option stock back', (select (options->0->>'stock') || '/' || stock from public.shop_products where product_id = qid), '1/1');
  -- Collected and cancelled are final: every move refused, nothing changes.
  foreach st in array array['ordered', 'ready', 'collected', 'cancelled', 'shipped'] loop
    fails := fails || pg_temp.us_is('2n collected -> ' || st, pg_temp.us_try(format('select public.owner_set_order_status(%L, %L::uuid, %L)', ko, o2.order_id, st)), 'BAD_STEP');
    fails := fails || pg_temp.us_is('2o cancelled -> ' || st, pg_temp.us_try(format('select public.owner_set_order_status(%L, %L::uuid, %L)', ko, o4.order_id, st)), 'BAD_STEP');
    checks := checks + 2;
  end loop;
  fails := fails || pg_temp.us_is('2p a final cancel does not restock again', (select stock from public.shop_products where product_id = pid)::text, '8');
  fails := fails || pg_temp.us_is('2q member cancels a cancelled order',
    pg_temp.us_try(format('select public.member_cancel_order(%L, %L::uuid)', k2, o4.order_id)), 'TOO_LATE');
  -- Gym B's owner cannot move gym A's order.
  o := public.member_place_order(k1, jsonb_build_array(jsonb_build_object('productId', pid, 'optionId', null, 'qty', 1)));
  fails := fails || pg_temp.us_is('2r gym B moves it', pg_temp.us_try(format('select public.owner_set_order_status(%L, %L::uuid, ''ready'')', kob, o.order_id)), 'GONE');
  fails := fails || pg_temp.us_is('2s gym B cancels it', pg_temp.us_try(format('select public.owner_set_order_status(%L, %L::uuid, ''cancelled'')', kob, o.order_id)), 'GONE');
  fails := fails || pg_temp.us_is('2t untouched', (select status from public.shop_orders where order_id = o.order_id), 'ordered');
  checks := checks + 19;

  -- ---------------------------------------------------------------- 3. messages
  msg := (public.owner_send_message(ko, 'announcement', 'UAT closed Sunday', '') ->> 'id')::uuid;
  fails := fails || pg_temp.us_is('3a sent to the two app members', (select recipients from public.gym_messages where message_id = msg)::text, '2');
  r := public.member_messages(k1);
  fails := fails || pg_temp.us_is('3b in the inbox, not seen',
    (select e->>'seen' from jsonb_array_elements(r) e where e->>'id' = msg::text), 'false');
  fails := fails || pg_temp.us_is('3c member sees it', public.member_saw_messages(k1, array[msg])::text, '1');
  fails := fails || pg_temp.us_is('3d seen twice counts once', public.member_saw_messages(k1, array[msg])::text, '0');
  fails := fails || pg_temp.us_is('3e inbox says seen',
    (select e->>'seen' from jsonb_array_elements(public.member_messages(k1)) e where e->>'id' = msg::text), 'true');
  fails := fails || pg_temp.us_is('3f owner: seen by 1 of 2',
    (select (e->>'seen') || '/' || (e->>'recipients') from jsonb_array_elements(public.owner_messages(ko)) e where e->>'id' = msg::text), '1/2');
  perform public.member_saw_messages(k2, array[msg]);
  -- A member who joined after it was sent still finds it in the inbox but is not counted (0009).
  insert into public.gym_members(gym_id, name, key_hash, joined_at) values (gid, 'Chand app', public._hash_key(k3), now() + interval '1 hour');
  fails := fails || pg_temp.us_is('3g late joiner has it',
    (select count(*) from jsonb_array_elements(public.member_messages(k3)) e where e->>'id' = msg::text)::text, '1');
  perform public.member_saw_messages(k3, array[msg]);
  fails := fails || pg_temp.us_is('3h owner: seen by 2 of 2',
    (select (e->>'seen') || '/' || (e->>'recipients') from jsonb_array_elements(public.owner_messages(ko)) e where e->>'id' = msg::text), '2/2');
  -- Taken back: gone from every inbox, kept (marked) on the Sent list.
  perform public.owner_withdraw_message(ko, msg);
  fails := fails || pg_temp.us_is('3i gone from the inbox',
    (select count(*) from jsonb_array_elements(public.member_messages(k1)) e where e->>'id' = msg::text)::text, '0');
  fails := fails || pg_temp.us_is('3j still on the Sent list, marked',
    (select e->>'withdrawn' from jsonb_array_elements(public.owner_messages(ko)) e where e->>'id' = msg::text), 'true');
  -- A member who left gets no new message and is not counted.
  perform public.member_leave(k2);
  msg2 := (public.owner_send_message(ko, 'timing', 'UAT new timings', '') ->> 'id')::uuid;
  fails := fails || pg_temp.us_is('3k left member not counted', (select recipients from public.gym_messages where message_id = msg2)::text, '2');
  fails := fails || pg_temp.us_is('3l left member key dead', pg_temp.us_try(format('select public.member_messages(%L)', k2)), 'BAD_KEY');
  checks := checks + 12;

  -- ---------------------------------------------------------------- 4. the invite link's preview
  update public.gyms set brand_accent = '#F7D411', creator_ip = '203.0.113.9' where gym_id = gid;
  r := public.gym_preview(' uqshpa ');
  fails := fails || pg_temp.us_is('4a only name, code and brand',
    (select string_agg(k, ',' order by k) from jsonb_object_keys(r) k), 'brand,gymName,joinCode');
  fails := fails || pg_temp.us_is('4b brand fields only',
    (select string_agg(k, ',' order by k) from jsonb_object_keys(r->'brand') k), 'accent,bg,heading,logoUrl,updatedAt');
  fails := fails || pg_temp.us_is('4c no ids, keys, phones or address in it',
    (r::text ~* (gid::text || '|' || s_owner::text || '|9811400011|203\.0\.113\.9|key'))::text, 'false');
  fails := fails || pg_temp.us_is('4d the gym it names', (r->>'gymName') || '/' || (r->>'joinCode') || '/' || (r->'brand'->>'accent'), 'UAT Shop Gym/UQSHPA/#F7D411');
  fails := fails || pg_temp.us_is('4e unknown code', coalesce(public.gym_preview('NOPE00')::text, 'null'), 'null');
  checks := checks + 5;

  -- ---------------------------------------------------------------- 5. starting a gym
  -- gym_create_online: a new gym online from the first minute, its creator the owner, signed in.
  r := public.gym_create_online('UAT Brand New Gym', 'New Owner', '+91 98114 00031');
  sk := r->>'sessionKey';
  fails := fails || pg_temp.us_is('5a owner, signed in', (r->'person'->>'role') || '/' || (r->'person'->>'phone') || '/' || (length(sk) = 48)::text, 'owner/9811400031/true');
  fails := fails || pg_temp.us_is('5b the key opens the panel', (public.staff_me(sk)->>'gymId'), r->>'gymId');
  fails := fails || pg_temp.us_is('5c join code made', ((r->>'joinCode') ~ '^[0-9A-F]{6}$')::text, 'true');
  fails := fails || pg_temp.us_is('5d no made-up products', (select count(*) from public.shop_products where gym_id = (r->>'gymId')::uuid)::text, '0');
  fails := fails || pg_temp.us_is('5e first records go online', pg_temp.us_try(format(
    'select public.crm_push(%L, 0, ''[{"k":"member","id":"first","d":{"fullName":"First","phone":"9811400032"}}]''::jsonb)', sk)), 'ok');
  fails := fails || pg_temp.us_is('5f owner may add people', pg_temp.us_try(format('select public.owner_add_person(%L, ''Desk'', ''9811400033'', ''staff'')', sk)), 'ok');
  fails := fails || pg_temp.us_is('5g bad mobile', pg_temp.us_try('select public.gym_create_online(''X Gym'', ''Owner'', ''12345'')'), 'BAD_PHONE');
  fails := fails || pg_temp.us_is('5h no gym name', pg_temp.us_try('select public.gym_create_online('' '', ''Owner'', ''9811400034'')'), 'EMPTY');
  -- demo_start_gym: the panel's "Start demo": a gym with the sample shop and an OWNER KEY, which
  -- owner_go_online later turns into a signed-in owner.
  r := public.demo_start_gym('UAT Demo Gym');
  nk := r->>'ownerKey';
  fails := fails || pg_temp.us_is('5i demo key opens it', public.owner_gym(nk)->>'gymId', r->>'gymId');
  fails := fails || pg_temp.us_is('5j sample shop', ((select count(*) from public.shop_products where gym_id = (r->>'gymId')::uuid) > 0)::text, 'true');
  r := public.owner_go_online(nk, 'Demo Owner', '9811400035');
  fails := fails || pg_temp.us_is('5k goes online as owner', (r->'person'->>'role') || '/' || (public.staff_me(r->>'sessionKey')->>'gymId'), 'owner/' || (public.owner_gym(nk)->>'gymId'));
  fails := fails || pg_temp.us_is('5l a member key is not an owner key', pg_temp.us_try(format('select public.owner_go_online(%L, ''X'', ''9811400036'')', k1)), 'BAD_KEY');
  checks := checks + 12;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $uat$;
