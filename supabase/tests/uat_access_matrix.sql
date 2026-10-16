-- UAT item 2 (17 Oct 2026): the role x gym access matrix, at the database. Runs in CI after every
-- migration (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends
-- in an error, so it changes nothing:
--   "RESULT PASS (n cells ...)" — every cell answered as the table below says;
--   "RESULT FAIL: ..."          — the cells that did not (entity/action/actor: got, want).
-- The readable copy of this table, with the findings, is Audit/uat/MONEY-ACCESS.md.
--
-- HOW A CELL IS RUN. Every cell is one row of the CELLS list below: an entity, an action, the path
-- (the RPC, or the table through RLS), the statement, the "effect" (a yes/no question asked
-- afterwards as the database owner: did the action reach GYM A's data?) and the expected answer for
-- each actor. Each cell runs on its own: the statement runs AS THE ACTOR'S ROLE (anon, or
-- authenticated for a 0001 sign-in account), then the effect is read, then the cell is undone, so
-- every cell starts from the same seeded gyms.
--   allow        no error, and the effect is true;
--   deny:CODE    the call raised CODE (BAD_KEY, OWNER_ONLY, INVALID, GONE, ...);
--   deny:PERM    the database refused the role (permission denied / row-level security);
--   deny:none    no error, but nothing of gym A was read or changed (e.g. gym B's owner writing a
--                row with gym A's id lands in gym B).
-- Expecting the exact reason, not just "deny", is what stops a typo in a statement passing as a
-- refusal.
--
-- ACTORS. Every gym-side caller reaches the database as the anon role with a key in the call:
--   anon     no key at all ('');
--   memberA  an app member of gym A (member key, from member_join);
--   deskA    a front-desk (Staff) person of gym A (session key, from staff_sign_in);
--   deskA2   a second front-desk person of gym A, used to prove a signed-out / removed key dies;
--   ownerA   an owner (role owner) of gym A (session key);
--   ownerB   an owner of gym B. Every ownerB cell must be a deny (checked below).
-- The 0001 sign-in-account path (the mobile app's workout summaries) uses the authenticated role:
--   signedIn  a signed-in user with no gym; pMemberA / pOwnerA / pOwnerB  profiles in gym A / A / B.
-- Direct table access (no RPC) is the same for every key actor (they all ARE the anon role), so the
-- table cells are run for anon and for signedIn.

create or replace function pg_temp.uat_pulled(p_kind text, p_id text) returns boolean
  language sql as $$
  select exists (select 1 from jsonb_array_elements(coalesce(nullif(current_setting('uat.out', true), '')::jsonb -> 'records', '[]'::jsonb)) r
                  where r->>'k' = p_kind and r->>'id' = p_id)
$$;

do $uat$
declare
  ga uuid; gb uuid; s_oa uuid; s_da uuid; s_d2 uuid; s_ob uuid; m_a uuid; m_a2 uuid; m_b uuid;
  pa uuid; pb uuid; o_mine uuid; o_other uuid; msg_a uuid; msg_b uuid;
  pma uuid := gen_random_uuid(); pm2 uuid := gen_random_uuid(); poa uuid := gen_random_uuid();
  pob uuid := gen_random_uuid(); psi uuid := gen_random_uuid();
  ka text := 'uat-am-owner-a'; kd text := 'uat-am-desk-a'; kd2 text := 'uat-am-desk-a2'; kob text := 'uat-am-owner-b';
  km text := 'uat-am-member-a'; km2 text := 'uat-am-member-a2'; kmb text := 'uat-am-member-b';
  code_a text := 'UQAMXA'; code_b text := 'UQAMXB';
  td date := (now() at time zone 'Asia/Kolkata')::date;
  today_s text; end_s text; end60_s text;
  mem_d jsonb; plan_d jsonb; ms_d jsonb; mscxl_d jsonb; pay_d jsonb; payv_d jsonb; vis_d jsonb; enq_d jsonb; exp_d jsonb;
  c record; pair text; actor text; want text; stmt text; eff text; pre text; ok boolean;
  akey text; arole text; agym uuid; aclaims text; ver bigint;
  got text; fails text := ''; cells int := 0; n_allow int := 0; n_deny int := 0; n_cross int := 0; n_table int := 0;
  per_actor jsonb := '{}'::jsonb; probe_ip text; open_f text := ''; why text;
  nokey text := 'anon=deny:BAD_KEY memberA=deny:BAD_KEY';
begin
  today_s := to_char(td, 'YYYY-MM-DD');
  end_s := to_char(public._plan_end(td, 'month', 1), 'YYYY-MM-DD');
  end60_s := to_char(td + 60, 'YYYY-MM-DD');

  -- ---------------------------------------------------------------- two gyms
  insert into public.gyms(name, join_code, creator_ip) values ('UAT Gym A', code_a, '203.0.113.7') returning gym_id into ga;
  insert into public.gyms(name, join_code) values ('UAT Gym B', code_b) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'UAT Owner A', '9811100011', 'owner') returning staff_id into s_oa;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'UAT Desk A', '9811100012', 'staff') returning staff_id into s_da;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'UAT Desk Two', '9811100013', 'staff') returning staff_id into s_d2;
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'UAT Owner B', '9811100021', 'owner') returning staff_id into s_ob;
  insert into public.gym_sessions(staff_id, key_hash) values
    (s_oa, public._hash_key(ka)), (s_da, public._hash_key(kd)), (s_d2, public._hash_key(kd2)), (s_ob, public._hash_key(kob));
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (ga, 'UAT App A', public._hash_key(km), '+919811100001')
    returning member_id into m_a;
  insert into public.gym_members(gym_id, name, key_hash) values (ga, 'UAT App A2', public._hash_key(km2)) returning member_id into m_a2;
  insert into public.gym_members(gym_id, name, key_hash) values (gb, 'UAT App B', public._hash_key(kmb)) returning member_id into m_b;

  mem_d   := '{"fullName":"Asha A","phone":"9811100001","archived":false,"createdAt":1}';
  plan_d  := '{"name":"Monthly","durationUnit":"month","durationCount":1,"priceP":100000,"joiningFeeP":0}';
  ms_d    := jsonb_build_object('memberId', 'a-mem', 'planId', 'a-plan', 'priceP', 100000, 'joiningFeeP', 0,
               'startsOn', to_char(td - 10, 'YYYY-MM-DD'), 'endsOn', to_char(td + 19, 'YYYY-MM-DD'), 'cancelled', false);
  mscxl_d := jsonb_build_object('memberId', 'a-mem', 'planId', 'a-plan', 'priceP', 100000, 'joiningFeeP', 0,
               'startsOn', to_char(td - 60, 'YYYY-MM-DD'), 'endsOn', to_char(td - 31, 'YYYY-MM-DD'), 'cancelled', true);
  pay_d   := jsonb_build_object('memberId', 'a-mem', 'membershipId', 'a-ms', 'amountP', 50000, 'method', 'cash',
               'paidOn', today_s, 'receiptNo', '2026-27/0001', 'voided', false);
  payv_d  := pay_d || '{"receiptNo":"2026-27/0002","voided":true,"voidReason":"typo"}';
  vis_d   := jsonb_build_object('memberId', 'a-mem', 'visitedOn', to_char(td - 1, 'YYYY-MM-DD'), 'checkedInAt', 1, 'source', 'desk');
  enq_d   := '{"name":"Walk-in","phone":"9811100031","status":"open"}';
  exp_d   := jsonb_build_object('amountP', 20000, 'category', 'rent', 'spentOn', today_s);

  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'gym', 'gym', '{"name":"UAT Gym A"}', 1),
    (ga, 'member', 'a-mem', mem_d, 1),
    (ga, 'member', 'a-imp', '{"fullName":"Imported A","phone":"9811100002","importId":"imp-a"}', 1),
    (ga, 'plan', 'a-plan', plan_d, 1),
    (ga, 'plan', 'a-plan-imp', '{"name":"Old","durationUnit":"month","durationCount":1,"priceP":50000,"importId":"imp-a"}', 1),
    (ga, 'membership', 'a-ms', ms_d, 1),
    (ga, 'membership', 'a-ms-cxl', mscxl_d, 1),
    (ga, 'membership', 'a-ms-imp', ms_d || '{"importId":"imp-a"}', 1),
    (ga, 'payment', 'a-pay', pay_d, 1),
    (ga, 'payment', 'a-pay-void', payv_d, 1),
    (ga, 'payment', 'a-pay-imp', pay_d || '{"membershipId":"a-ms-imp","receiptNo":"IMP/2026-27/0001","importId":"imp-a"}', 1),
    (ga, 'visit', 'a-vis', vis_d, 1),
    (ga, 'enquiry', 'a-enq', enq_d, 1),
    (ga, 'expense', 'a-exp', exp_d, 1),
    (gb, 'member', 'b-mem', '{"fullName":"Bina B","phone":"9811100041"}', 1);
  update public.gyms set crm_version = 1 where gym_id in (ga, gb);
  -- 0021: one row of gym A's receipt history, for the owner to read and nobody else.
  insert into public.receipt_history(gym_id, receipt_id, what, old_data, new_data, old_deleted, new_deleted)
    values (ga, 'a-pay', 'changed', pay_d, pay_d, false, false);

  insert into public.shop_products(gym_id, name, category, price_p, options, stock, active)
    values (ga, 'UAT Shaker A', 'gear', 39900, '[]', 10, true) returning product_id into pa;
  insert into public.shop_products(gym_id, name, category, price_p, options, stock, active)
    values (gb, 'UAT Shaker B', 'gear', 39900, '[]', 10, true) returning product_id into pb;
  insert into public.shop_orders(gym_id, member_id, member_name, order_no, lines, total_p)
    values (ga, m_a, 'UAT App A', 1, '[]', 39900) returning order_id into o_mine;
  insert into public.shop_orders(gym_id, member_id, member_name, order_no, lines, total_p)
    values (ga, m_a2, 'UAT App A2', 2, '[]', 39900) returning order_id into o_other;
  insert into public.gym_messages(gym_id, kind, title, body, recipients)
    values (ga, 'announcement', 'UAT hello A', '', 2) returning message_id into msg_a;
  insert into public.gym_messages(gym_id, kind, title, body, recipients)
    values (gb, 'announcement', 'UAT hello B', '', 1) returning message_id into msg_b;

  -- The 0001 sign-in accounts (the mobile app's workout summaries): profiles in gym A and gym B.
  insert into auth.users(instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', pma, 'authenticated', 'authenticated', 'uat-am-' || pma || '@example.invalid'),
    ('00000000-0000-0000-0000-000000000000', pm2, 'authenticated', 'authenticated', 'uat-am-' || pm2 || '@example.invalid'),
    ('00000000-0000-0000-0000-000000000000', poa, 'authenticated', 'authenticated', 'uat-am-' || poa || '@example.invalid'),
    ('00000000-0000-0000-0000-000000000000', pob, 'authenticated', 'authenticated', 'uat-am-' || pob || '@example.invalid'),
    ('00000000-0000-0000-0000-000000000000', psi, 'authenticated', 'authenticated', 'uat-am-' || psi || '@example.invalid');
  insert into public.profiles(id, gym_id, role) values (pma, ga, 'member'), (pm2, ga, 'member'), (poa, ga, 'owner'), (pob, gb, 'owner');
  insert into public.member_summary(member_id, gym_id, display_name, total_workouts) values (pm2, ga, 'UAT other member', 12);

  -- ---------------------------------------------------------------- the cells
  for c in
    select * from (values
    -- entity, action, path, pre (as owner, before the actor), statement, effect, expected per actor
    -- ======================================================== member (the gym's roster)
    ('member', 'C', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"member","id":"x-new","d":{"fullName":"New","phone":"9811100009"}}]'::jsonb)$q$,
     $q$exists (select 1 from public.crm_records where gym_id = {GA} and kind = 'member' and id = 'x-new')$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    ('member', 'C (app member)', 'member_join, public join code', null,
     $q$select public.member_join({CODEA}, 'UAT Joiner')$q$,
     $q$exists (select 1 from public.gym_members where gym_id = {GA} and name = 'UAT Joiner')$q$,
     'anon=allow'),
    ('member', 'R', 'crm_pull', null,
     $q$select set_config('uat.out', public.crm_pull({K}, 0)::text, true)$q$,
     $q$pg_temp.uat_pulled('member', 'a-mem')$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    ('member', 'U', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, jsonb_build_array(jsonb_build_object('k','member','id','a-mem','d', {MEM_D} || '{"fullName":"Changed"}'::jsonb)))$q$,
     $q$(select data->>'fullName' from public.crm_records where gym_id = {GA} and kind = 'member' and id = 'a-mem') = 'Changed'$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    ('member', 'D (imported)', 'crm_push x:true', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"member","id":"a-imp","d":null,"x":true}]'::jsonb)$q$,
     $q$(select deleted from public.crm_records where gym_id = {GA} and kind = 'member' and id = 'a-imp')$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:INVALID'),
    ('member', 'D (typed by hand)', 'crm_push x:true', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"member","id":"a-mem","d":null,"x":true}]'::jsonb)$q$,
     $q$(select deleted from public.crm_records where gym_id = {GA} and kind = 'member' and id = 'a-mem')$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=deny:INVALID ownerB=deny:INVALID'),
    ('member', 'D (erase my cloud data)', 'delete_my_cloud_data', null,
     $q$select public.delete_my_cloud_data()$q$,
     $q$(select count(*) from public.crm_records where gym_id = {GA} and not deleted) <> 14
        or not exists (select 1 from public.gym_members where gym_id = {GA} and name = 'UAT App A')$q$,
     'deskA=deny:PERM anon=deny:PERM pMemberA=deny:none'),
    ('member', 'D (own sign-in profile)', 'delete_my_cloud_data', null,
     $q$select public.delete_my_cloud_data()$q$,
     $q$not exists (select 1 from public.profiles where id = {PMA})$q$,
     'pMemberA=allow'),
    ('member', 'R (workout summaries)', 'table member_summary (RLS)', null,
     $q$select set_config('uat.out', (select count(*) from public.member_summary where member_id = {PM2})::text, true)$q$,
     $q$current_setting('uat.out')::int > 0$q$,
     'pOwnerA=allow pMemberA=deny:none pOwnerB=deny:none signedIn=deny:none anon=deny:none|deny:PERM'),
    ('member', 'C (own summary, own gym)', 'table member_summary (RLS)', null,
     $q$insert into public.member_summary(member_id, gym_id, display_name) values ({PMA}, {GA}, 'UAT me')$q$,
     $q$exists (select 1 from public.member_summary where member_id = {PMA} and gym_id = {GA})$q$,
     'pMemberA=allow'),
    ('member', 'C (own summary, other gym)', 'table member_summary (RLS)', null,
     $q$insert into public.member_summary(member_id, gym_id, display_name) values ({PMA}, {GB}, 'UAT me')$q$,
     $q$exists (select 1 from public.member_summary where member_id = {PMA})$q$,
     'pMemberA=deny:PERM'),
    ('member', 'U (own role to owner)', 'table profiles', null,
     $q$update public.profiles set role = 'owner' where id = {PMA}$q$,
     $q$(select role from public.profiles where id = {PMA}) = 'owner'$q$,
     'pMemberA=deny:PERM'),
    -- ======================================================== plan
    ('plan', 'C', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"plan","id":"x-plan","d":{"name":"Free","priceP":0}}]'::jsonb)$q$,
     $q$exists (select 1 from public.crm_records where gym_id = {GA} and kind = 'plan' and id = 'x-plan')$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:none'),
    ('plan', 'R', 'crm_pull', null,
     $q$select set_config('uat.out', public.crm_pull({K}, 0)::text, true)$q$,
     $q$pg_temp.uat_pulled('plan', 'a-plan')$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    ('plan', 'U (price)', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, jsonb_build_array(jsonb_build_object('k','plan','id','a-plan','d', {PLAN_D} || '{"priceP":1}'::jsonb)))$q$,
     $q$(select data->>'priceP' from public.crm_records where gym_id = {GA} and kind = 'plan' and id = 'a-plan') = '1'$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:none'),
    ('plan', 'D (imported)', 'crm_push x:true', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"plan","id":"a-plan-imp","d":null,"x":true}]'::jsonb)$q$,
     $q$(select deleted from public.crm_records where gym_id = {GA} and kind = 'plan' and id = 'a-plan-imp')$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:INVALID'),
    ('plan', 'D (typed by hand)', 'crm_push x:true', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"plan","id":"a-plan","d":null,"x":true}]'::jsonb)$q$,
     $q$(select deleted from public.crm_records where gym_id = {GA} and kind = 'plan' and id = 'a-plan')$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=deny:INVALID ownerB=deny:INVALID'),
    -- ======================================================== membership
    ('membership', 'C (sell a plan)', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"membership","id":"x-ms","d":{"memberId":"a-mem","planId":"a-plan","priceP":100000,"joiningFeeP":0,"startsOn":"{TODAY}","endsOn":"{END}","cancelled":false}}]'::jsonb)$q$,
     $q$exists (select 1 from public.crm_records where gym_id = {GA} and kind = 'membership' and id = 'x-ms')$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    ('membership', 'R', 'crm_pull', null,
     $q$select set_config('uat.out', public.crm_pull({K}, 0)::text, true)$q$,
     $q$pg_temp.uat_pulled('membership', 'a-ms')$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    ('membership', 'U (move the end: extra days)', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, jsonb_build_array(jsonb_build_object('k','membership','id','a-ms','d', {MS_D} || '{"endsOn":"{END60}"}'::jsonb)))$q$,
     $q$(select data->>'endsOn' from public.crm_records where gym_id = {GA} and kind = 'membership' and id = 'a-ms') = '{END60}'$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:none'),
    ('membership', 'U (cancel)', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, jsonb_build_array(jsonb_build_object('k','membership','id','a-ms','d', {MS_D} || '{"cancelled":true}'::jsonb)))$q$,
     $q$(select data->>'cancelled' from public.crm_records where gym_id = {GA} and kind = 'membership' and id = 'a-ms') = 'true'$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:none'),
    ('membership', 'U (undo a cancel)', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, jsonb_build_array(jsonb_build_object('k','membership','id','a-ms-cxl','d', {MSCXL_D} || '{"cancelled":false}'::jsonb)))$q$,
     $q$(select data->>'cancelled' from public.crm_records where gym_id = {GA} and kind = 'membership' and id = 'a-ms-cxl') = 'false'$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:none'),
    ('membership', 'D (imported)', 'crm_push x:true', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"membership","id":"a-ms-imp","d":null,"x":true}]'::jsonb)$q$,
     $q$(select deleted from public.crm_records where gym_id = {GA} and kind = 'membership' and id = 'a-ms-imp')$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:INVALID'),
    ('membership', 'D (typed by hand)', 'crm_push x:true', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"membership","id":"a-ms","d":null,"x":true}]'::jsonb)$q$,
     $q$(select deleted from public.crm_records where gym_id = {GA} and kind = 'membership' and id = 'a-ms')$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=deny:INVALID ownerB=deny:INVALID'),
    -- ======================================================== payment / receipt
    ('payment', 'C (collect)', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"payment","id":"x-pay","d":{"memberId":"a-mem","membershipId":"a-ms","amountP":50000,"method":"cash","paidOn":"{TODAY}","receiptNo":"2026-27/0003","voided":false}}]'::jsonb)$q$,
     $q$exists (select 1 from public.crm_records where gym_id = {GA} and kind = 'payment' and id = 'x-pay')$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:WRONG_PLAN'),
    ('payment', 'R', 'crm_pull', null,
     $q$select set_config('uat.out', public.crm_pull({K}, 0)::text, true)$q$,
     $q$pg_temp.uat_pulled('payment', 'a-pay')$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    -- 0021 (F-03): a saved receipt is never edited, by anyone; the owner cancels it and issues a new
    -- one. Gym B's owner naming gym A's ids makes a NEW receipt in gym B, refused for its membership.
    ('payment', 'U (change the amount)', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, jsonb_build_array(jsonb_build_object('k','payment','id','a-pay','d', {PAY_D} || '{"amountP":100}'::jsonb)))$q$,
     $q$(select data->>'amountP' from public.crm_records where gym_id = {GA} and kind = 'payment' and id = 'a-pay') = '100'$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=deny:RECEIPT_LOCKED ownerB=deny:WRONG_PLAN'),
    ('payment', 'U (cancel = void)', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, jsonb_build_array(jsonb_build_object('k','payment','id','a-pay','d', {PAY_D} || '{"voided":true,"voidReason":"typo"}'::jsonb)))$q$,
     $q$(select data->>'voided' from public.crm_records where gym_id = {GA} and kind = 'payment' and id = 'a-pay') = 'true'$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:WRONG_PLAN'),
    ('payment', 'U (cancel with no reason)', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, jsonb_build_array(jsonb_build_object('k','payment','id','a-pay','d', {PAY_D} || '{"voided":true}'::jsonb)))$q$,
     $q$(select data->>'voided' from public.crm_records where gym_id = {GA} and kind = 'payment' and id = 'a-pay') = 'true'$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=deny:NEED_REASON ownerB=deny:WRONG_PLAN'),
    ('payment', 'U (undo a void)', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, jsonb_build_array(jsonb_build_object('k','payment','id','a-pay-void','d', {PAYV_D} || '{"voided":false}'::jsonb)))$q$,
     $q$(select data->>'voided' from public.crm_records where gym_id = {GA} and kind = 'payment' and id = 'a-pay-void') = 'false'$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=deny:RECEIPT_LOCKED ownerB=deny:WRONG_PLAN'),
    ('payment', 'R (change history)', 'owner_receipt_history', null,
     $q$select set_config('uat.out', public.owner_receipt_history({K})::text, true)$q$,
     $q$current_setting('uat.out') like '%"a-pay"%'$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:none'),
    ('payment', 'D (imported)', 'crm_push x:true', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"payment","id":"a-pay-imp","d":null,"x":true}]'::jsonb)$q$,
     $q$(select deleted from public.crm_records where gym_id = {GA} and kind = 'payment' and id = 'a-pay-imp')$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:INVALID'),
    ('payment', 'D (typed by hand)', 'crm_push x:true', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"payment","id":"a-pay","d":null,"x":true}]'::jsonb)$q$,
     $q$(select deleted from public.crm_records where gym_id = {GA} and kind = 'payment' and id = 'a-pay')$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=deny:INVALID ownerB=deny:INVALID'),
    -- ======================================================== attendance / visit
    ('visit', 'C (desk check-in)', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"visit","id":"x-vis","d":{"memberId":"a-mem","visitedOn":"{TODAY}","checkedInAt":1,"source":"desk"}}]'::jsonb)$q$,
     $q$exists (select 1 from public.crm_records where gym_id = {GA} and kind = 'visit' and id = 'x-vis')$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    ('visit', 'C (QR self check-in, own gym)', 'member_check_in', null,
     $q$select set_config('uat.out', public.member_check_in({K}, {CODEA})::text, true)$q$,
     $q$exists (select 1 from public.crm_records where gym_id = {GA} and kind = 'visit' and not deleted
                 and data->>'memberId' = 'a-mem' and data->>'visitedOn' = '{TODAY}')$q$,
     'memberA=allow anon=deny:BAD_KEY deskA=deny:BAD_KEY ownerA=deny:BAD_KEY ownerB=deny:BAD_KEY'),
    ('visit', 'C (QR check-in, other gym''s code)', 'member_check_in', null,
     $q$select set_config('uat.out', public.member_check_in({K}, {CODEB})::text, true)$q$,
     $q$current_setting('uat.out')::jsonb->>'ok' = 'true'$q$,
     'memberA=deny:none'),
    ('visit', 'R', 'crm_pull', null,
     $q$select set_config('uat.out', public.crm_pull({K}, 0)::text, true)$q$,
     $q$pg_temp.uat_pulled('visit', 'a-vis')$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    ('visit', 'U', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, jsonb_build_array(jsonb_build_object('k','visit','id','a-vis','d', {VIS_D} || '{"source":"app"}'::jsonb)))$q$,
     $q$(select data->>'source' from public.crm_records where gym_id = {GA} and kind = 'visit' and id = 'a-vis') = 'app'$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    ('visit', 'D (take back)', 'crm_push x:true', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"visit","id":"a-vis","d":null,"x":true}]'::jsonb)$q$,
     $q$(select deleted from public.crm_records where gym_id = {GA} and kind = 'visit' and id = 'a-vis')$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    -- ======================================================== enquiry
    ('enquiry', 'C', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"enquiry","id":"x-enq","d":{"name":"New walk-in","status":"open"}}]'::jsonb)$q$,
     $q$exists (select 1 from public.crm_records where gym_id = {GA} and kind = 'enquiry' and id = 'x-enq')$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    ('enquiry', 'R', 'crm_pull', null,
     $q$select set_config('uat.out', public.crm_pull({K}, 0)::text, true)$q$,
     $q$pg_temp.uat_pulled('enquiry', 'a-enq')$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    ('enquiry', 'U', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, jsonb_build_array(jsonb_build_object('k','enquiry','id','a-enq','d', {ENQ_D} || '{"status":"joined"}'::jsonb)))$q$,
     $q$(select data->>'status' from public.crm_records where gym_id = {GA} and kind = 'enquiry' and id = 'a-enq') = 'joined'$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    ('enquiry', 'D', 'crm_push x:true', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"enquiry","id":"a-enq","d":null,"x":true}]'::jsonb)$q$,
     $q$(select deleted from public.crm_records where gym_id = {GA} and kind = 'enquiry' and id = 'a-enq')$q$,
     '{NOKEY} deskA=deny:INVALID ownerA=deny:INVALID ownerB=deny:INVALID'),
    -- ======================================================== expense
    ('expense', 'C', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"expense","id":"x-exp","d":{"amountP":5000,"category":"other","spentOn":"{TODAY}"}}]'::jsonb)$q$,
     $q$exists (select 1 from public.crm_records where gym_id = {GA} and kind = 'expense' and id = 'x-exp')$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:none'),
    -- deskA=allow: the whole gym is pulled to every signed-in device (permissions.ts "HONEST LIMIT").
    ('expense', 'R', 'crm_pull', null,
     $q$select set_config('uat.out', public.crm_pull({K}, 0)::text, true)$q$,
     $q$pg_temp.uat_pulled('expense', 'a-exp')$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    ('expense', 'U', 'crm_push', null,
     $q$select public.crm_push({K}, {V}, jsonb_build_array(jsonb_build_object('k','expense','id','a-exp','d', {EXP_D} || '{"amountP":1}'::jsonb)))$q$,
     $q$(select data->>'amountP' from public.crm_records where gym_id = {GA} and kind = 'expense' and id = 'a-exp') = '1'$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:none'),
    ('expense', 'D', 'crm_push x:true', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"expense","id":"a-exp","d":null,"x":true}]'::jsonb)$q$,
     $q$(select deleted from public.crm_records where gym_id = {GA} and kind = 'expense' and id = 'a-exp')$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:none'),
    -- ======================================================== staff (people who sign in to the panel)
    ('staff', 'C', 'owner_add_person', null,
     $q$select public.owner_add_person({K}, 'UAT New Desk', '9811100077', 'staff')$q$,
     $q$exists (select 1 from public.gym_staff where gym_id = {GA} and phone = '9811100077' and removed_at is null)$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:none'),
    ('staff', 'R', 'owner_people', null,
     $q$select set_config('uat.out', public.owner_people({K})::text, true)$q$,
     $q$current_setting('uat.out') like '%UAT Desk Two%'$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:none'),
    ('staff', 'U (make a sign-in code)', 'owner_make_signin_code', null,
     $q$select public.owner_make_signin_code({K}, {SD2})$q$,
     $q$exists (select 1 from public.gym_signin_codes where staff_id = {SD2} and used_at is null)$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:GONE'),
    ('staff', 'U (sign out every device)', 'owner_sign_out_person', null,
     $q$select public.owner_sign_out_person({K}, {SD2})$q$,
     $q$not exists (select 1 from public.gym_sessions where staff_id = {SD2} and ended_at is null)$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:GONE'),
    ('staff', 'D (remove)', 'owner_remove_person', null,
     $q$select public.owner_remove_person({K}, {SD2})$q$,
     $q$(select removed_at is not null from public.gym_staff where staff_id = {SD2})$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:GONE'),
    -- A signed-out or removed person's key stops working, for reads and for pushes (deskA2 = that person).
    ('staff', 'key works before (control)', 'crm_pull', null,
     $q$select set_config('uat.out', public.crm_pull({K}, 0)::text, true)$q$,
     $q$pg_temp.uat_pulled('member', 'a-mem')$q$,
     'deskA2=allow'),
    ('staff', 'R after signed out', 'crm_pull', $q$select public.owner_sign_out_person({KA}, {SD2})$q$,
     $q$select set_config('uat.out', public.crm_pull({K}, 0)::text, true)$q$,
     $q$pg_temp.uat_pulled('member', 'a-mem')$q$,
     'deskA2=deny:BAD_KEY'),
    ('staff', 'C after signed out', 'crm_push', $q$select public.owner_sign_out_person({KA}, {SD2})$q$,
     $q$select public.crm_push({K}, {V}, '[{"k":"member","id":"x-late","d":{"fullName":"Late","phone":"9811100008"}}]'::jsonb)$q$,
     $q$exists (select 1 from public.crm_records where gym_id = {GA} and kind = 'member' and id = 'x-late')$q$,
     'deskA2=deny:BAD_KEY'),
    ('staff', 'R after removed', 'crm_pull', $q$select public.owner_remove_person({KA}, {SD2})$q$,
     $q$select set_config('uat.out', public.crm_pull({K}, 0)::text, true)$q$,
     $q$pg_temp.uat_pulled('member', 'a-mem')$q$,
     'deskA2=deny:BAD_KEY'),
    ('staff', 'C after removed', 'crm_push', $q$select public.owner_remove_person({KA}, {SD2})$q$,
     $q$select public.crm_push({K}, {V}, '[{"k":"member","id":"x-late","d":{"fullName":"Late","phone":"9811100008"}}]'::jsonb)$q$,
     $q$exists (select 1 from public.crm_records where gym_id = {GA} and kind = 'member' and id = 'x-late')$q$,
     'deskA2=deny:BAD_KEY'),
    ('staff', 'U after removed (orders)', 'owner_set_order_status', $q$select public.owner_remove_person({KA}, {SD2})$q$,
     $q$select public.owner_set_order_status({K}, {OA}, 'ready')$q$,
     $q$(select status from public.shop_orders where order_id = {OA}) = 'ready'$q$,
     'deskA2=deny:BAD_KEY'),
    -- ======================================================== shop order
    ('shop order', 'C (place)', 'member_place_order', null,
     $q$select public.member_place_order({K}, jsonb_build_array(jsonb_build_object('productId', {PA}, 'optionId', null, 'qty', 1)))$q$,
     $q$(select count(*) from public.shop_orders where gym_id = {GA}) > 2$q$,
     'memberA=allow anon=deny:BAD_KEY deskA=deny:BAD_KEY ownerA=deny:BAD_KEY ownerB=deny:BAD_KEY'),
    ('shop order', 'C (with gym B''s product)', 'member_place_order', null,
     $q$select public.member_place_order({K}, jsonb_build_array(jsonb_build_object('productId', {PB}, 'optionId', null, 'qty', 1)))$q$,
     $q$(select stock from public.shop_products where product_id = {PB}) < 10$q$,
     'memberA=deny:GONE'),
    ('shop order', 'R (own)', 'member_orders', null,
     $q$select set_config('uat.out', (select coalesce(jsonb_agg(o.order_id), '[]') from public.member_orders({K}) o)::text, true)$q$,
     $q$current_setting('uat.out') like '%' || {OA} || '%'$q$,
     'memberA=allow anon=deny:BAD_KEY deskA=deny:BAD_KEY ownerB=deny:BAD_KEY'),
    ('shop order', 'R (another member''s)', 'member_orders', null,
     $q$select set_config('uat.out', (select coalesce(jsonb_agg(o.order_id), '[]') from public.member_orders({K}) o)::text, true)$q$,
     $q$current_setting('uat.out') like '%' || {OO} || '%'$q$,
     'memberA=deny:none'),
    ('shop order', 'R (gym list)', 'owner_orders', null,
     $q$select set_config('uat.out', (select coalesce(jsonb_agg(o.order_id), '[]') from public.owner_orders({K}) o)::text, true)$q$,
     $q$current_setting('uat.out') like '%' || {OA} || '%'$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    -- deskA=allow: orders stay open to the front desk (0018 C8-2: "Orders ... stay open to Staff").
    ('shop order', 'U (move on: ready)', 'owner_set_order_status', null,
     $q$select public.owner_set_order_status({K}, {OA}, 'ready')$q$,
     $q$(select status from public.shop_orders where order_id = {OA}) = 'ready'$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:GONE'),
    ('shop order', 'U (gym cancels)', 'owner_set_order_status', null,
     $q$select public.owner_set_order_status({K}, {OA}, 'cancelled')$q$,
     $q$(select status from public.shop_orders where order_id = {OA}) = 'cancelled'$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:GONE'),
    ('shop order', 'U (member cancels own)', 'member_cancel_order', null,
     $q$select public.member_cancel_order({K}, {OA})$q$,
     $q$(select status from public.shop_orders where order_id = {OA}) = 'cancelled'$q$,
     'memberA=allow anon=deny:BAD_KEY deskA=deny:BAD_KEY ownerA=deny:BAD_KEY ownerB=deny:BAD_KEY'),
    ('shop order', 'U (member cancels another''s)', 'member_cancel_order', null,
     $q$select public.member_cancel_order({K}, {OO})$q$,
     $q$(select status from public.shop_orders where order_id = {OO}) = 'cancelled'$q$,
     'memberA=deny:GONE'),
    ('shop order', 'D', 'no function; table only', null,
     $q$delete from public.shop_orders where order_id = {OA}$q$,
     $q$not exists (select 1 from public.shop_orders where order_id = {OA})$q$,
     'anon=deny:PERM signedIn=deny:PERM'),
    -- ======================================================== shop product (what orders are made of)
    ('shop product', 'R (member shop)', 'member_products', null,
     $q$select set_config('uat.out', (select coalesce(jsonb_agg(p.product_id), '[]') from public.member_products({K}) p)::text, true)$q$,
     $q$current_setting('uat.out') like '%' || {PA} || '%'$q$,
     'memberA=allow anon=deny:BAD_KEY deskA=deny:BAD_KEY ownerB=deny:BAD_KEY'),
    ('shop product', 'R (gym B''s shop)', 'member_products', null,
     $q$select set_config('uat.out', (select coalesce(jsonb_agg(p.product_id), '[]') from public.member_products({K}) p)::text, true)$q$,
     $q$current_setting('uat.out') like '%' || {PB} || '%'$q$,
     'memberA=deny:none'),
    ('shop product', 'R (panel)', 'owner_products', null,
     $q$select set_config('uat.out', (select coalesce(jsonb_agg(p.product_id), '[]') from public.owner_products({K}) p)::text, true)$q$,
     $q$current_setting('uat.out') like '%' || {PA} || '%'$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    ('shop product', 'U (restock)', 'owner_add_stock', null,
     $q$select public.owner_add_stock({K}, {PA}, null, 5)$q$,
     $q$(select stock from public.shop_products where product_id = {PA}) = 15$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:GONE'),
    ('shop product', 'D', 'owner_delete_product', null,
     $q$select public.owner_delete_product({K}, {PA})$q$,
     $q$not exists (select 1 from public.shop_products where product_id = {PA})$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:none'),
    -- ======================================================== messages to members
    ('message', 'R (inbox)', 'member_messages', null,
     $q$select set_config('uat.out', public.member_messages({K})::text, true)$q$,
     $q$current_setting('uat.out') like '%' || {MA} || '%'$q$,
     'memberA=allow anon=deny:BAD_KEY deskA=deny:BAD_KEY ownerB=deny:BAD_KEY'),
    ('message', 'R (gym B''s message)', 'member_messages', null,
     $q$select set_config('uat.out', public.member_messages({K})::text, true)$q$,
     $q$current_setting('uat.out') like '%' || {MB} || '%'$q$,
     'memberA=deny:none'),
    ('message', 'U (mark gym B''s message seen)', 'member_saw_messages', null,
     $q$select public.member_saw_messages({K}, array[{MB}]::uuid[])$q$,
     $q$exists (select 1 from public.gym_message_seen where message_id = {MB})$q$,
     'memberA=deny:none'),
    ('message', 'C (send)', 'owner_send_message', null,
     $q$select public.owner_send_message({K}, 'announcement', 'UAT sent', '')$q$,
     $q$exists (select 1 from public.gym_messages where gym_id = {GA} and title = 'UAT sent')$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:none'),
    ('message', 'D (take back)', 'owner_withdraw_message', null,
     $q$select public.owner_withdraw_message({K}, {MA})$q$,
     $q$(select withdrawn_at is not null from public.gym_messages where message_id = {MA})$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:GONE'),
    -- ======================================================== gym settings / brand
    ('gym settings', 'R (panel)', 'owner_gym', null,
     $q$select set_config('uat.out', public.owner_gym({K})::text, true)$q$,
     $q$current_setting('uat.out')::jsonb->>'gymId' = {GA}::text$q$,
     '{NOKEY} deskA=allow ownerA=allow ownerB=deny:none'),
    ('gym settings', 'R (member app)', 'member_me', null,
     $q$select set_config('uat.out', public.member_me({K})::text, true)$q$,
     $q$current_setting('uat.out')::jsonb->>'gymId' = {GA}::text$q$,
     'memberA=allow anon=deny:BAD_KEY deskA=deny:BAD_KEY ownerB=deny:BAD_KEY'),
    ('gym settings', 'R (invite link preview)', 'gym_preview', null,
     $q$select set_config('uat.out', public.gym_preview({CODEA})::text, true)$q$,
     $q$current_setting('uat.out')::jsonb->>'joinCode' = {CODEA}$q$,
     'anon=allow'),
    ('gym settings', 'U (rename)', 'owner_rename_gym', null,
     $q$select public.owner_rename_gym({K}, 'UAT Renamed')$q$,
     $q$(select name from public.gyms where gym_id = {GA}) = 'UAT Renamed'$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:none'),
    ('gym settings', 'U (brand)', 'owner_set_brand', null,
     $q$select public.owner_set_brand({K}, '#112233', null, null, 'normal')$q$,
     $q$(select brand_accent from public.gyms where gym_id = {GA}) is not distinct from '#112233'$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:none'),
    ('gym settings', 'U (gym details record)', 'crm_push kind gym', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"gym","id":"gym","d":{"name":"UAT Pushed"}}]'::jsonb)$q$,
     $q$(select name from public.gyms where gym_id = {GA}) = 'UAT Pushed'$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=allow ownerB=deny:none'),
    ('gym settings', 'D (gym details record)', 'crm_push x:true', null,
     $q$select public.crm_push({K}, {V}, '[{"k":"gym","id":"gym","d":null,"x":true}]'::jsonb)$q$,
     $q$(select deleted from public.crm_records where gym_id = {GA} and kind = 'gym' and id = 'gym')$q$,
     '{NOKEY} deskA=deny:OWNER_ONLY ownerA=deny:INVALID ownerB=deny:INVALID'),
    -- pMemberA=allow: 0001's gyms_read lets a gym's signed-in member read the gyms row. Since 0021
    -- the row no longer holds the IP the gym was created from (F-10; the probe below).
    ('gym settings', 'R (gyms row)', 'table gyms (RLS 0001)', null,
     $q$select set_config('uat.out', (select count(*) from public.gyms where gym_id = {GA})::text, true)$q$,
     $q$current_setting('uat.out')::int > 0$q$,
     'pMemberA=allow pOwnerA=allow pOwnerB=deny:none signedIn=deny:none anon=deny:none|deny:PERM'),
    -- F-14 closed by 0021: 0001's gyms_owner_update policy is gone, so no signed-in profile has an
    -- update rule on gyms at all (it used to fail only by accident, at the logo check).
    ('gym settings', 'U (gyms row)', 'table gyms (RLS 0001)', null,
     $q$update public.gyms set name = 'UAT hacked' where gym_id = {GA}$q$,
     $q$(select name from public.gyms where gym_id = {GA}) = 'UAT hacked'$q$,
     'pOwnerA=deny:none|deny:PERM pMemberA=deny:none pOwnerB=deny:none signedIn=deny:none anon=deny:none|deny:PERM')
    ) as t(entity, action, path, pre, stmt, effect, expect)
    union all
    -- ======================================================== every table, directly (no function)
    select tb.entity, x.op || ' (direct)', 'table ' || tb.tname, null,
           case x.op when 'R' then format($q$select set_config('uat.out', (select count(*) from public.%I where %s)::text, true)$q$, tb.tname, tb.cond)
                     when 'C' then tb.ins
                     when 'U' then format($q$update public.%I set %s where %s$q$, tb.tname, tb.upd, tb.cond)
                     else format($q$delete from public.%I where %s$q$, tb.tname, tb.cond) end,
           case x.op when 'R' then $q$current_setting('uat.out')::int > 0$q$
                     when 'C' then tb.ins_eff
                     when 'U' then tb.upd_eff
                     else format($q$not exists (select 1 from public.%I where %s)$q$, tb.tname, tb.cond) end,
           case when tb.tname = 'gyms' then 'anon=deny:none|deny:PERM signedIn=deny:none|deny:PERM'
                else 'anon=deny:PERM signedIn=deny:PERM' end
      from (values
        ('member', 'crm_records', $q$gym_id = {GA}$q$, $q$data = '{}'$q$,
         $q$insert into public.crm_records(gym_id, kind, id, data, version) values ({GA}, 'member', 'tbl-x', '{}', 1)$q$,
         $q$exists (select 1 from public.crm_records where id = 'tbl-x')$q$,
         $q$exists (select 1 from public.crm_records where gym_id = {GA} and data = '{}')$q$),
        ('member', 'gym_members', $q$gym_id = {GA}$q$, $q$name = 'UAT hacked'$q$,
         $q$insert into public.gym_members(gym_id, name, key_hash) values ({GA}, 'UAT table', decode('00', 'hex'))$q$,
         $q$exists (select 1 from public.gym_members where name = 'UAT table')$q$,
         $q$exists (select 1 from public.gym_members where name = 'UAT hacked')$q$),
        ('staff', 'gym_staff', $q$gym_id = {GA}$q$, $q$role = 'owner'$q$,
         $q$insert into public.gym_staff(gym_id, name, phone, role) values ({GA}, 'UAT table', '9811100099', 'owner')$q$,
         $q$exists (select 1 from public.gym_staff where name = 'UAT table')$q$,
         $q$not exists (select 1 from public.gym_staff where gym_id = {GA} and role = 'staff')$q$),
        ('staff', 'gym_sessions', $q$staff_id = {SD2}$q$, $q$ended_at = null$q$,
         $q$insert into public.gym_sessions(staff_id, key_hash) values ({SD2}, decode('01', 'hex'))$q$,
         $q$exists (select 1 from public.gym_sessions where key_hash = decode('01', 'hex'))$q$,
         $q$false$q$),
        ('gym settings', 'gym_owner_keys', $q$gym_id = {GA}$q$, $q$key_hash = decode('02', 'hex')$q$,
         $q$insert into public.gym_owner_keys(gym_id, key_hash) values ({GA}, decode('03', 'hex'))$q$,
         $q$exists (select 1 from public.gym_owner_keys where gym_id = {GA})$q$,
         $q$exists (select 1 from public.gym_owner_keys where key_hash = decode('02', 'hex'))$q$),
        ('shop order', 'shop_orders', $q$gym_id = {GA}$q$, $q$total_p = 0$q$,
         $q$insert into public.shop_orders(gym_id, order_no, lines, total_p) values ({GA}, 99, '[]', 0)$q$,
         $q$exists (select 1 from public.shop_orders where gym_id = {GA} and order_no = 99)$q$,
         $q$exists (select 1 from public.shop_orders where gym_id = {GA} and total_p = 0)$q$),
        ('shop product', 'shop_products', $q$gym_id = {GA}$q$, $q$price_p = 100$q$,
         $q$insert into public.shop_products(gym_id, name, price_p) values ({GA}, 'UAT table', 100)$q$,
         $q$exists (select 1 from public.shop_products where name = 'UAT table')$q$,
         $q$exists (select 1 from public.shop_products where gym_id = {GA} and price_p = 100)$q$),
        ('message', 'gym_messages', $q$gym_id = {GA}$q$, $q$title = 'UAT hacked'$q$,
         $q$insert into public.gym_messages(gym_id, kind, title) values ({GA}, 'offer', 'UAT table')$q$,
         $q$exists (select 1 from public.gym_messages where title = 'UAT table')$q$,
         $q$exists (select 1 from public.gym_messages where title = 'UAT hacked')$q$),
        ('gym settings', 'gyms', $q$gym_id = {GA}$q$, $q$name = 'UAT hacked'$q$,
         $q$insert into public.gyms(name, join_code) values ('UAT table', 'UQAMXZ')$q$,
         $q$exists (select 1 from public.gyms where join_code = 'UQAMXZ')$q$,
         $q$exists (select 1 from public.gyms where name = 'UAT hacked')$q$),
        -- 0021: the receipt change log, and the IPs gyms were created from.
        ('payment', 'receipt_history', $q$gym_id = {GA}$q$, $q$what = 'UAT hacked'$q$,
         $q$insert into public.receipt_history(gym_id, receipt_id, what, old_data, new_data, old_deleted, new_deleted) values ({GA}, 'tbl-x', 'changed', '{}', '{}', false, false)$q$,
         $q$exists (select 1 from public.receipt_history where receipt_id = 'tbl-x')$q$,
         $q$exists (select 1 from public.receipt_history where what = 'UAT hacked')$q$),
        ('gym settings', 'gym_creator_ips', $q$gym_id = {GA}$q$, $q$ip = 'UAT hacked'$q$,
         $q$insert into public.gym_creator_ips(gym_id, ip) values ({GB}, '198.51.100.77')$q$,
         $q$exists (select 1 from public.gym_creator_ips where ip = '198.51.100.77')$q$,
         $q$exists (select 1 from public.gym_creator_ips where ip = 'UAT hacked')$q$)
      ) as tb(entity, tname, cond, upd, ins, ins_eff, upd_eff)
      cross join (values ('C'), ('R'), ('U'), ('D')) as x(op)
  loop
    foreach pair in array regexp_split_to_array(btrim(replace(c.expect, '{NOKEY}', nokey)), '\s+') loop
      actor := split_part(pair, '=', 1);
      want := split_part(pair, '=', 2);
      akey := case actor when 'anon' then '' when 'memberA' then km when 'deskA' then kd when 'deskA2' then kd2
                         when 'ownerA' then ka when 'ownerB' then kob else '' end;
      agym := case when actor in ('deskA', 'deskA2', 'ownerA') then ga when actor = 'ownerB' then gb end;
      arole := case when actor in ('signedIn', 'pMemberA', 'pOwnerA', 'pOwnerB') then 'authenticated' else 'anon' end;
      aclaims := case actor
        when 'signedIn' then jsonb_build_object('role', 'authenticated', 'sub', psi)::text
        when 'pMemberA' then jsonb_build_object('role', 'authenticated', 'sub', pma)::text
        when 'pOwnerA'  then jsonb_build_object('role', 'authenticated', 'sub', poa)::text
        when 'pOwnerB'  then jsonb_build_object('role', 'authenticated', 'sub', pob)::text
        else '{"role":"anon"}' end;
      if actor in ('ownerB', 'pOwnerB') and want = 'allow' then
        fails := fails || format(' %s/%s/%s: the table itself lets gym B reach gym A', c.entity, c.action, actor);
      end if;

      got := null; why := null;
      begin
        -- Tokens: {K} the actor's key, {V} the version of the actor's gym (what its panel would send).
        if c.pre is not null then
          execute replace(replace(c.pre, '{KA}', quote_literal(ka)), '{SD2}', quote_literal(s_d2) || '::uuid');
        end if;
        select crm_version into ver from public.gyms where gym_id = agym;
        stmt := c.stmt; eff := c.effect;
          stmt := replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
                  stmt, '{K}', quote_literal(akey)), '{V}', coalesce(ver, 0)::text), '{GA}', quote_literal(ga) || '::uuid'),
                  '{GB}', quote_literal(gb) || '::uuid'), '{KA}', quote_literal(ka)), '{SD2}', quote_literal(s_d2) || '::uuid'),
                  '{OA}', quote_literal(o_mine) || '::uuid'), '{OO}', quote_literal(o_other) || '::uuid'),
                  '{PA}', quote_literal(pa) || '::uuid'), '{PB}', quote_literal(pb) || '::uuid'),
                  '{MA}', quote_literal(msg_a) || '::uuid'), '{MB}', quote_literal(msg_b) || '::uuid'),
                  '{PMA}', quote_literal(pma) || '::uuid'), '{PM2}', quote_literal(pm2) || '::uuid'),
                  '{CODEA}', quote_literal(code_a)), '{CODEB}', quote_literal(code_b)),
                  '{TODAY}', today_s), '{END60}', end60_s), '{END}', end_s),
                  '{MEM_D}', quote_literal(mem_d::text) || '::jsonb'), '{PLAN_D}', quote_literal(plan_d::text) || '::jsonb'),
                  '{MS_D}', quote_literal(ms_d::text) || '::jsonb');
          stmt := replace(replace(replace(replace(replace(replace(stmt,
                  '{MSCXL_D}', quote_literal(mscxl_d::text) || '::jsonb'), '{PAY_D}', quote_literal(pay_d::text) || '::jsonb'),
                  '{PAYV_D}', quote_literal(payv_d::text) || '::jsonb'), '{VIS_D}', quote_literal(vis_d::text) || '::jsonb'),
                  '{ENQ_D}', quote_literal(enq_d::text) || '::jsonb'), '{EXP_D}', quote_literal(exp_d::text) || '::jsonb');
          eff := replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
                  eff, '{GA}', quote_literal(ga) || '::uuid'), '{GB}', quote_literal(gb) || '::uuid'),
                  '{SD2}', quote_literal(s_d2) || '::uuid'), '{OA}', quote_literal(o_mine::text)), '{OO}', quote_literal(o_other::text)),
                  '{PA}', quote_literal(pa::text)), '{PB}', quote_literal(pb::text)), '{MA}', quote_literal(msg_a::text)),
                  '{MB}', quote_literal(msg_b::text)), '{PMA}', quote_literal(pma) || '::uuid'), '{CODEA}', quote_literal(code_a)),
                  '{TODAY}', today_s), '{END60}', end60_s);
        perform set_config('uat.out', '', true);
        perform set_config('request.jwt.claims', aclaims, true);
        execute format('set local role %I', arole);
        execute stmt;
        reset role;
        execute 'select (' || eff || ')' into ok;
        got := case when ok then 'allow' else 'deny:none' end;
        raise exception 'UAT_UNDO';
      exception when others then
        reset role;
        if sqlerrm <> 'UAT_UNDO' then
          got := 'deny:' || case when sqlstate = '42501' then 'PERM' else sqlerrm end;
          why := sqlerrm;
        end if;
      end;

      cells := cells + 1;
      if c.path like 'table %' and c.action like '% (direct)' then n_table := n_table + 1; end if;
      if actor in ('ownerB', 'pOwnerB') then n_cross := n_cross + 1; end if;
      if got = 'allow' then n_allow := n_allow + 1; else n_deny := n_deny + 1; end if;
      per_actor := jsonb_set(per_actor, array[actor], to_jsonb(coalesce((per_actor->>actor)::int, 0) + 1));
      if not (got = any(string_to_array(want, '|'))) then
        fails := fails || format(' %s/%s/%s: got %s (%s), want %s;', c.entity, c.action, actor, got, coalesce(why, 'no error'), want);
      end if;
    end loop;
  end loop;

  -- Finding F-10 (a probe, never a failure): a signed-in member of gym A (0001 profiles) reads the
  -- whole gyms row, including the IP address the gym was created from.
  begin
    perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', pma)::text, true);
    execute 'set local role authenticated';
    select creator_ip into probe_ip from public.gyms where gym_id = ga;
    reset role;
  exception when others then
    reset role;
    probe_ip := null;
  end;
  if probe_ip = '203.0.113.7' then open_f := ' F-10'; end if;

  if fails = '' then
    raise exception 'RESULT PASS (% cells: % allow, % deny; % gym-B-on-gym-A cells all deny; % direct-table cells; by actor %; findings still open:%)',
      cells, n_allow, n_deny, n_cross, n_table, per_actor::text, case when open_f = '' then ' none' else open_f end;
  end if;
  raise exception 'RESULT FAIL:%', fails;
end $uat$;
