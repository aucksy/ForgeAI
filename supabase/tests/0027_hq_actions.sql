-- ForgeAI HQ test, step 2 (0027): suspended = read-only, an active gym is unaffected, and the HQ
-- actions. Runs in CI after every migration (scripts/ci/db_checks.sh); can also be pasted into the
-- SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

-- A statement's result as text: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t27_try(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t27_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  ga uuid; gb uuid; s_oa uuid; s_da uuid; s_ob uuid; pa uuid; pb uuid; req uuid; r jsonb; v bigint; n bigint; code text;
  koa text := 't27-owner-a'; kda text := 't27-desk-a'; kob text := 't27-owner-b'; kma text := 't27-member-a'; kmb text := 't27-member-b';
  hq text := 'owner@example.com';
  fails text := ''; checks int := 0;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into public.gyms(name, join_code, crm_version) values ('T27 Gym A', 'T27GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T27 Gym B', 'T27GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner A', '9876527001', 'owner') returning staff_id into s_oa;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Desk A', '9876527002', 'staff') returning staff_id into s_da;
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Owner B', '9876527003', 'owner') returning staff_id into s_ob;
  insert into public.gym_sessions(staff_id, key_hash) values
    (s_oa, public._hash_key(koa)), (s_da, public._hash_key(kda)), (s_ob, public._hash_key(kob));
  insert into public.gym_members(gym_id, name, key_hash) values (ga, 'Member A', public._hash_key(kma)), (gb, 'Member B', public._hash_key(kmb));
  insert into public.shop_products(gym_id, name, category, price_p, options, stock, active)
    values (ga, 'Shaker A', 'gear', 39900, '[]', 10, true) returning product_id into pa;
  insert into public.shop_products(gym_id, name, category, price_p, options, stock, active)
    values (gb, 'Shaker B', 'gear', 39900, '[]', 10, true) returning product_id into pb;

  -- 1. Approve a new gym (trial -> active); a status change outside HQ is refused.
  fails := fails || pg_temp.t27_is('1 starts trial', (select status from public.gyms where gym_id = ga), 'trial');
  r := public.hq_set_gym_status(hq, ga, 'active', null);
  fails := fails || pg_temp.t27_is('1 approved', r->>'status', 'active');
  fails := fails || pg_temp.t27_is('1 not by the gym', pg_temp.t27_try(format(
    'update public.gyms set status = %L where gym_id = %L', 'active', gb)), 'HQ_ONLY');
  fails := fails || pg_temp.t27_is('1 audit', (select action from public.hq_audit where gym_id = ga order by audit_id desc limit 1), 'approve_gym');
  checks := checks + 4;

  -- 2. Suspend needs a reason.
  fails := fails || pg_temp.t27_is('2 reason', pg_temp.t27_try(format('select public.hq_set_gym_status(%L, %L, %L, %L)', hq, ga, 'suspended', ' ')), 'NEED_REASON');
  r := public.hq_set_gym_status(hq, ga, 'suspended', 'Unpaid for 3 months, owner told');
  fails := fails || pg_temp.t27_is('2 suspended', r->>'status', 'suspended');
  fails := fails || pg_temp.t27_is('2 HQ switch off after', coalesce(current_setting('forgeai.hq', true), ''), 'off');
  checks := checks + 3;

  -- 3. Suspended gym A: every write refused with SUSPENDED ...
  fails := fails || pg_temp.t27_is('3 push', pg_temp.t27_try(format(
    'select public.crm_push(%L, 1, %L::jsonb)', koa, '[{"k":"member","id":"t27-m1","d":{"fullName":"New"}}]')), 'SUSPENDED');
  fails := fails || pg_temp.t27_is('3 desk push', pg_temp.t27_try(format(
    'select public.crm_push(%L, 1, %L::jsonb)', kda, '[{"k":"visit","id":"t27-v1","d":{"memberId":"x","visitedOn":"2026-10-23"}}]')), 'SUSPENDED');
  fails := fails || pg_temp.t27_is('3 rename', pg_temp.t27_try(format('select public.owner_rename_gym(%L, %L)', koa, 'Renamed')), 'SUSPENDED');
  fails := fails || pg_temp.t27_is('3 product', pg_temp.t27_try(format(
    'select public.owner_save_product(%L, %L::jsonb)', koa, '{"name":"T27 bar","priceP":10000}')), 'SUSPENDED');
  fails := fails || pg_temp.t27_is('3 message', pg_temp.t27_try(format(
    'select public.owner_send_message(%L, %L, %L, %L)', koa, 'announcement', 'Hello', 'Body')), 'SUSPENDED');
  fails := fails || pg_temp.t27_is('3 member order', pg_temp.t27_try(format(
    'select public.member_place_order(%L, %L::jsonb)', kma, jsonb_build_array(jsonb_build_object('productId', pa, 'qty', 1)))), 'SUSPENDED');
  fails := fails || pg_temp.t27_is('3 add person', pg_temp.t27_try(format(
    'select public.owner_add_person(%L, %L, %L, %L)', koa, 'New Desk', '9876527009', 'staff')), 'SUSPENDED');
  checks := checks + 7;
  -- ... but reading, signing in and downloading still work.
  fails := fails || pg_temp.t27_is('3 pull', pg_temp.t27_try(format('select public.crm_pull(%L, 0)', koa)), 'ok');
  fails := fails || pg_temp.t27_is('3 staff_me', pg_temp.t27_try(format('select public.staff_me(%L)', kda)), 'ok');
  fails := fails || pg_temp.t27_is('3 owner_gym', pg_temp.t27_try(format('select public.owner_gym(%L)', koa)), 'ok');
  code := public.owner_make_signin_code(koa, s_da)->>'code';
  fails := fails || pg_temp.t27_is('3 sign in', (public.staff_sign_in('9876527002', code, 't27 phone') ? 'sessionKey')::text, 'true');
  fails := fails || pg_temp.t27_is('3 member reads', pg_temp.t27_try(format('select public.member_me(%L)', kma)), 'ok');
  checks := checks + 5;

  -- 4. Gym B (active) is unaffected: push, order, product, message, rename.
  r := public.hq_set_gym_status(hq, gb, 'active', null);
  v := public.crm_push(kob, 1, '[{"k":"member","id":"t27-b1","d":{"fullName":"B one"}}]'::jsonb);
  fails := fails || pg_temp.t27_is('4 push', v::text, '2');
  fails := fails || pg_temp.t27_is('4 order', pg_temp.t27_try(format(
    'select public.member_place_order(%L, %L::jsonb)', kmb, jsonb_build_array(jsonb_build_object('productId', pb, 'qty', 1)))), 'ok');
  fails := fails || pg_temp.t27_is('4 product', pg_temp.t27_try(format(
    'select public.owner_save_product(%L, %L::jsonb)', kob, '{"name":"T27 bar B","priceP":10000}')), 'ok');
  fails := fails || pg_temp.t27_is('4 message', pg_temp.t27_try(format(
    'select public.owner_send_message(%L, %L, %L, %L)', kob, 'announcement', 'Hello', 'Body')), 'ok');
  fails := fails || pg_temp.t27_is('4 rename', pg_temp.t27_try(format('select public.owner_rename_gym(%L, %L)', kob, 'T27 Gym B2')), 'ok');
  checks := checks + 5;

  -- 5. Restore: gym A writes again.
  r := public.hq_set_gym_status(hq, ga, 'active', null);
  fails := fails || pg_temp.t27_is('5 restored', r->>'status', 'active');
  fails := fails || pg_temp.t27_is('5 audit', (select action from public.hq_audit where gym_id = ga order by audit_id desc limit 1), 'restore_gym');
  v := public.crm_push(koa, 1, '[{"k":"member","id":"t27-m1","d":{"fullName":"New"}}]'::jsonb);
  fails := fails || pg_temp.t27_is('5 push', v::text, '2');
  checks := checks + 3;

  -- 6. Create a gym for a lead: active, owner signs in with the code HQ was shown.
  r := public.hq_create_gym(hq, 'T27 Lead Gym', 'Lead Owner', '+91 98765 27010', 'lead-7');
  fails := fails || pg_temp.t27_is('6 status', (select status from public.gyms where gym_id = (r->>'gymId')::uuid), 'active');
  fails := fails || pg_temp.t27_is('6 sign in', (public.staff_sign_in('9876527010', r->>'code', null) ? 'sessionKey')::text, 'true');
  fails := fails || pg_temp.t27_is('6 code never logged', (select count(*) from public.hq_audit
    where gym_id = (r->>'gymId')::uuid and (detail::text like '%' || (r->>'code') || '%' or coalesce(reason, '') like '%' || (r->>'code') || '%'))::text, '0');
  fails := fails || pg_temp.t27_is('6 bad phone', pg_temp.t27_try(format('select public.hq_create_gym(%L, %L, %L, %L)', hq, 'X', 'Y', '123')), 'BAD_PHONE');
  checks := checks + 4;

  -- 7. Reset the owner's sign-in: only after the call is ticked.
  fails := fails || pg_temp.t27_is('7 call first', pg_temp.t27_try(format('select public.hq_reset_owner_signin(%L, %L)', hq, ga)), 'CONFIRM_CALL');
  r := public.hq_reset_owner_signin(hq, ga, null, true);
  fails := fails || pg_temp.t27_is('7 code for the owner', r->>'phone', '9876527001');
  fails := fails || pg_temp.t27_is('7 sign in', (public.staff_sign_in('9876527001', r->>'code', null) ? 'sessionKey')::text, 'true');
  checks := checks + 3;

  -- 8. Sign gym A out everywhere: its keys die, gym B's do not.
  fails := fails || pg_temp.t27_is('8 reason', pg_temp.t27_try(format('select public.hq_sign_out_gym(%L, %L, %L)', hq, ga, '')), 'NEED_REASON');
  r := public.hq_sign_out_gym(hq, ga, 'Owner reported a lost phone');
  fails := fails || pg_temp.t27_is('8 count', ((r->>'devices')::int >= 3)::text, 'true');
  fails := fails || pg_temp.t27_is('8 key dead', pg_temp.t27_try(format('select public.staff_me(%L)', koa)), 'BAD_KEY');
  fails := fails || pg_temp.t27_is('8 other gym live', pg_temp.t27_try(format('select public.staff_me(%L)', kob)), 'ok');
  checks := checks + 4;

  -- 9. Delete request: steps in order, the typed code, then nothing of gym B is left.
  r := public.hq_delete_request_add(hq, gb, 'gym', now() - interval '3 days', 'admin_app', 'fb-27', null, 'From the admin app');
  req := (r->>'requestId')::uuid;
  fails := fails || pg_temp.t27_is('9 day', r->>'day', '4');
  fails := fails || pg_temp.t27_is('9 same feedback twice', public.hq_delete_request_add(hq, gb, 'gym', now(), 'admin_app', 'fb-27')->>'requestId', req::text);
  fails := fails || pg_temp.t27_is('9 on the gym row', public.hq_gym(hq, gb)->'deleteRequest'->>'requestId', req::text);
  fails := fails || pg_temp.t27_is('9 call first', pg_temp.t27_try(format('select public.hq_delete_gym(%L, %L, %L)', hq, req, 'T27GYB')), 'NOT_CALLED');
  perform public.hq_delete_request_step(hq, req, 'called');
  fails := fails || pg_temp.t27_is('9 remind first', pg_temp.t27_try(format('select public.hq_delete_gym(%L, %L, %L)', hq, req, 'T27GYB')), 'NOT_REMINDED');
  perform public.hq_delete_request_step(hq, req, 'reminded');
  fails := fails || pg_temp.t27_is('9 wrong code', pg_temp.t27_try(format('select public.hq_delete_gym(%L, %L, %L)', hq, req, 'T27GYA')), 'WRONG_CODE');
  update public.shop_products set image_url = 'https://hdxzqbdiokjklnypfisq.supabase.co/storage/v1/object/public/product-photos/'
    || repeat('ab', 24) || '/shaker.jpg' where product_id = pb;
  r := public.hq_delete_gym(hq, req, 't27gyb');
  fails := fails || pg_temp.t27_is('9 deleted', r->>'deleted', 'true');
  fails := fails || pg_temp.t27_is('9 files', r->'files'->0->>'bucket', 'product-photos');
  fails := fails || pg_temp.t27_is('9 no gym', (select count(*) from public.gyms where gym_id = gb)::text, '0');
  fails := fails || pg_temp.t27_is('9 no records', (select count(*) from public.crm_records where gym_id = gb)::text, '0');
  fails := fails || pg_temp.t27_is('9 audit kept', (select count(*) from public.hq_audit where gym_id = gb and action = 'delete_gym')::text, '1');
  fails := fails || pg_temp.t27_is('9 closed', pg_temp.t27_try(format('select public.hq_delete_request_step(%L, %L, %L)', hq, req, 'called')), 'CLOSED');
  fails := fails || pg_temp.t27_is('9 gym A untouched', (select count(*) from public.gyms where gym_id = ga)::text, '1');
  checks := checks + 13;

  -- 10. A member erase request is tracked by hand: done only after the call.
  r := public.hq_delete_request_add(hq, ga, 'member', now(), 'email', null, 'mobile ending 4321', null);
  fails := fails || pg_temp.t27_is('10 call first', pg_temp.t27_try(format('select public.hq_delete_request_step(%L, %L, %L)', hq, r->>'requestId', 'member_done')), 'NOT_CALLED');
  perform public.hq_delete_request_step(hq, (r->>'requestId')::uuid, 'called');
  fails := fails || pg_temp.t27_is('10 done', (public.hq_delete_request_step(hq, (r->>'requestId')::uuid, 'member_done')->>'doneAt' is not null)::text, 'true');
  fails := fails || pg_temp.t27_is('10 no member name kept', (select count(*) from public.hq_delete_requests where member_ref like '%Member%')::text, '0');
  checks := checks + 3;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
