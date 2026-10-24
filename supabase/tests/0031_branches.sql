-- Branches test (0031, tracker #41). Runs in CI after every migration (scripts/ci/db_checks.sh:
-- a throw-away local Supabase applies every migration, then each test must end with "RESULT PASS").
-- It can also be pasted into the SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

-- A statement's result as text: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t31_try(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t31_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  ga uuid; gb uuid; gc uuid; gz uuid; grp uuid; s_oa uuid; s_da uuid; s_oz uuid; s_partner uuid; s_db uuid; r jsonb; v bigint; n bigint;
  koa text := 't31-owner-a'; kda text := 't31-desk-a'; koz text := 't31-owner-z'; kold text := 't31-old-owner-key-a';
  kb2 text; kc text; kdb text := 't31-desk-b'; km1 text := 't31-member-1'; km2 text := 't31-member-2';
  day text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  hq text := 'owner@example.com';
  fails text := ''; checks int := 0; i int;
begin
  -- Gym A: owner, desk, three plans (one switched off, one from an import), two members.
  insert into public.gyms(name, join_code, crm_version, brand_accent) values ('T31 Iron Temple', 'T31GYA', 1, '#F7D411') returning gym_id into ga;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner A', '9876531001', 'owner') returning staff_id into s_oa;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Desk A', '9876531002', 'staff') returning staff_id into s_da;
  insert into public.gym_sessions(staff_id, key_hash) values (s_oa, public._hash_key(koa)), (s_da, public._hash_key(kda));
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kold));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'plan', 't31-p1', '{"id":"t31-p1","name":"Monthly","durationUnit":"month","durationCount":1,"priceP":100000,"joiningFeeP":0,"active":true,"sortOrder":1}', 1),
    (ga, 'plan', 't31-p2', '{"id":"t31-p2","name":"Old plan","durationUnit":"month","durationCount":1,"priceP":50000,"joiningFeeP":0,"active":false,"sortOrder":2}', 1),
    (ga, 'plan', 't31-p3', '{"id":"t31-p3","name":"Quarterly","durationUnit":"month","durationCount":3,"priceP":270000,"joiningFeeP":0,"active":true,"sortOrder":3,"importId":"imp-1"}', 1),
    (ga, 'member', 't31-m1', '{"id":"t31-m1","fullName":"Asha Verma","phone":"+919876531101","archived":false,"allBranches":true,"createdAt":1}', 1),
    (ga, 'member', 't31-m2', '{"id":"t31-m2","fullName":"Bilal Khan","phone":"+919876531102","archived":false,"createdAt":2}', 1),
    (ga, 'membership', 't31-ms1', jsonb_build_object('memberId', 't31-m1', 'startsOn', '2020-01-01', 'endsOn', day, 'cancelled', false), 1),
    (ga, 'member', 't31-m3', '{"id":"t31-m3","fullName":"Gita Gone","phone":"+919876531103","archived":false,"allBranches":true,"createdAt":3}', 1),
    (ga, 'gym', 'gym', '{"name":"T31 Iron Temple","gstin":"08AAAAA0000A1Z5"}', 1);
  -- HQ has checked the first branch and put it on a plan (a new branch takes the same: one business).
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'active', plan = 'pro', billing = 'monthly', paid_until = now() + interval '1 month',
                         trial_ends_at = now() + interval '40 days'
   where gym_id = ga;
  perform set_config('forgeai.hq', 'off', true);
  -- App members (the QR check-in) whose numbers already matched the register once.
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values
    (ga, 'Asha app', public._hash_key(km1), '+919876531101'),
    (ga, 'Bilal app', public._hash_key(km2), '+919876531102');
  -- Gym Z: another business.
  insert into public.gyms(name, join_code, crm_version) values ('T31 Other Gym', 'T31GYZ', 1) returning gym_id into gz;
  insert into public.gym_staff(gym_id, name, phone, role) values (gz, 'Owner Z', '9876531009', 'owner') returning staff_id into s_oz;
  insert into public.gym_sessions(staff_id, key_hash) values (s_oz, public._hash_key(koz));

  -- 1. A gym that never added a branch is a group of one, exactly as before.
  r := public.owner_branches(koa);
  fails := fails || pg_temp.t31_is('1 no group', r->>'groupId', null);
  fails := fails || pg_temp.t31_is('1 one branch', jsonb_array_length(r->'branches')::text, '1');
  fails := fails || pg_temp.t31_is('1 group name is the gym', r->>'groupName', 'T31 Iron Temple');
  fails := fails || pg_temp.t31_is('1 owner can open', r->>'canOpen', 'true');
  fails := fails || pg_temp.t31_is('1 desk cannot', public.owner_branches(kda)->>'canOpen', 'false');
  fails := fails || pg_temp.t31_is('1 ids', (public._branch_ids(ga) = array[ga])::text, 'true');
  fails := fails || pg_temp.t31_is('1 a bad key', pg_temp.t31_try('select public.owner_branches(''t31-nobody'')'), 'BAD_KEY');
  checks := checks + 7;

  -- 2. Adding a branch.
  fails := fails || pg_temp.t31_is('2 desk', pg_temp.t31_try(format('select public.owner_add_branch(%L, %L)', kda, 'T31 Branch Two')), 'OWNER_ONLY');
  fails := fails || pg_temp.t31_is('2 old owner key', pg_temp.t31_try(format('select public.owner_add_branch(%L, %L)', kold, 'T31 Branch Two')), 'OWNER_ONLY');
  fails := fails || pg_temp.t31_is('2 empty', pg_temp.t31_try(format('select public.owner_add_branch(%L, %L)', koa, '  ')), 'EMPTY');
  r := public.owner_add_branch(koa, 'T31 Branch Two', true, 't31 phone');
  gb := (r->>'gymId')::uuid;
  kb2 := r->>'sessionKey';
  fails := fails || pg_temp.t31_is('2 prefix', r->>'receiptPrefix', 'B2');
  fails := fails || pg_temp.t31_is('2 plans copied (live ones, imported too)', r->>'plansCopied', '2');
  fails := fails || pg_temp.t31_is('2 signed in as the owner', r->'person'->>'role', 'owner');
  fails := fails || pg_temp.t31_is('2 key works there', (public._owner_gym(kb2) = gb)::text, 'true');
  select group_id into grp from public.gyms where gym_id = ga;
  fails := fails || pg_temp.t31_is('2 one group for both', ((select group_id from public.gyms where gym_id = gb) = grp)::text, 'true');
  fails := fails || pg_temp.t31_is('2 group named after the gym', (select name from public.gym_groups where group_id = grp), 'T31 Iron Temple');
  fails := fails || pg_temp.t31_is('2 first branch keeps its numbers', (select coalesce(receipt_prefix, 'none') from public.gyms where gym_id = ga), 'none');
  fails := fails || pg_temp.t31_is('2 owner copied, desk not',
    (select string_agg(name || '/' || role, ',' order by name) from public.gym_staff where gym_id = gb and removed_at is null), 'Owner A/owner');
  fails := fails || pg_temp.t31_is('2 branding copied', (select brand_accent from public.gyms where gym_id = gb), '#F7D411');
  fails := fails || pg_temp.t31_is('2 its own join code', ((select join_code from public.gyms where gym_id = gb) <> 'T31GYA')::text, 'true');
  fails := fails || pg_temp.t31_is('2 gym record says B2',
    (select data->>'receiptPrefix' || '|' || (data->>'name') from public.crm_records where gym_id = gb and kind = 'gym'), 'B2|T31 Branch Two');
  fails := fails || pg_temp.t31_is('2 copied plans',
    (select string_agg(data->>'name' || ':' || (data->>'gymId' = gb::text) || ':' || (data ? 'importId') || ':' || (id = data->>'id') || ':' || (id not like 't31-%'), ',' order by data->>'name')
       from public.crm_records where gym_id = gb and kind = 'plan'),
    'Monthly:true:false:true:true,Quarterly:true:false:true:true');
  fails := fails || pg_temp.t31_is('2 version 1', (select crm_version from public.gyms where gym_id = gb)::text, '1');
  fails := fails || pg_temp.t31_is('2 name taken', pg_temp.t31_try(format('select public.owner_add_branch(%L, %L)', koa, ' t31 branch TWO ')), 'NAME_TAKEN');
  r := public.owner_add_branch(kb2, 'T31 Branch Three', false);
  gc := (r->>'gymId')::uuid;
  kc := r->>'sessionKey';
  fails := fails || pg_temp.t31_is('2 HQ status, plan and trial copied',
    (select string_agg(status || '/' || coalesce(plan, '-') || '/' || coalesce(billing, '-') || '/' || (trial_ends_at = now() + interval '40 days')
                       || '/' || (paid_until = now() + interval '1 month'), ',') from public.gyms where gym_id = gb),
    'active/pro/monthly/true/true');
  fails := fails || pg_temp.t31_is('2 GST number copied as a start', (select data->>'gstin' from public.crm_records where gym_id = gb and kind = 'gym'), '08AAAAA0000A1Z5');
  checks := checks + 2;
  fails := fails || pg_temp.t31_is('2 next prefix', r->>'receiptPrefix', 'B3');
  fails := fails || pg_temp.t31_is('2 no plans when not asked', (select count(*) from public.crm_records where gym_id = gc and kind = 'plan')::text, '0');
  fails := fails || pg_temp.t31_is('2 same group', ((select group_id from public.gyms where gym_id = gc) = grp)::text, 'true');
  checks := checks + 21;

  -- 3. The list from any branch.
  r := public.owner_branches(kb2);
  fails := fails || pg_temp.t31_is('3 three branches', jsonb_array_length(r->'branches')::text, '3');
  fails := fails || pg_temp.t31_is('3 first made first', r->'branches'->0->>'gymId', ga::text);
  fails := fails || pg_temp.t31_is('3 this one marked',
    (select string_agg(b->>'isThis', ',') from jsonb_array_elements(r->'branches') b), 'false,true,false');
  fails := fails || pg_temp.t31_is('3 group id', r->>'groupId', grp::text);
  fails := fails || pg_temp.t31_is('3 not other gyms', (r::text like '%T31 Other Gym%')::text, 'false');
  checks := checks + 5;

  -- 4. Opening another branch.
  r := public.owner_open_branch(koa, gc, 't31 laptop');
  fails := fails || pg_temp.t31_is('4 opens', ((r->>'gymId')::uuid = gc and public._owner_gym(r->>'sessionKey') = gc)::text, 'true');
  fails := fails || pg_temp.t31_is('4 one row for the owner there',
    (select count(*) from public.gym_staff where gym_id = gc and phone = '9876531001' and removed_at is null)::text, '1');
  fails := fails || pg_temp.t31_is('4 desk', pg_temp.t31_try(format('select public.owner_open_branch(%L, %L)', kda, gb)), 'OWNER_ONLY');
  fails := fails || pg_temp.t31_is('4 other business', pg_temp.t31_try(format('select public.owner_open_branch(%L, %L)', koa, gz)), 'GONE');
  fails := fails || pg_temp.t31_is('4 other business owner', pg_temp.t31_try(format('select public.owner_open_branch(%L, %L)', koz, ga)), 'GONE');
  -- An owner missing from a branch (made before this rule) is put on its list when they open it.
  update public.gym_staff set removed_at = now() where gym_id = gc and phone = '9876531001';
  r := public.owner_open_branch(koa, gc);
  fails := fails || pg_temp.t31_is('4 added back on open',
    (select role from public.gym_staff where gym_id = gc and phone = '9876531001' and removed_at is null), 'owner');
  kc := r->>'sessionKey';
  checks := checks + 6;

  -- 5. Receipt numbers per branch.
  v := public.crm_push(kb2, 1, jsonb_build_array(
    jsonb_build_object('k', 'member', 'id', 't31-bm1', 'd', jsonb_build_object('id', 't31-bm1', 'fullName', 'Chand', 'phone', '+919876531201')),
    jsonb_build_object('k', 'membership', 'id', 't31-bms1', 'd', jsonb_build_object('id', 't31-bms1', 'memberId', 't31-bm1',
      'planId', (select id from public.crm_records where gym_id = gb and kind = 'plan' and data->>'name' = 'Monthly'),
      'priceP', 100000, 'joiningFeeP', 0, 'startsOn', day, 'endsOn', day, 'cancelled', false))));
  fails := fails || pg_temp.t31_is('5 setup', v::text, '2');
  fails := fails || pg_temp.t31_is('5 no prefix refused', pg_temp.t31_try(format('select public.crm_push(%L, 2, %L::jsonb)', kb2,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 't31-pay1', 'd', jsonb_build_object('memberId', 't31-bm1', 'membershipId', 't31-bms1',
      'amountP', 50000, 'paidOn', day, 'receiptNo', '2026-27/0001', 'voided', false))))), 'BAD_RECEIPT_NO');
  fails := fails || pg_temp.t31_is('5 another branch''s prefix refused', pg_temp.t31_try(format('select public.crm_push(%L, 2, %L::jsonb)', kb2,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 't31-pay1', 'd', jsonb_build_object('memberId', 't31-bm1', 'membershipId', 't31-bms1',
      'amountP', 50000, 'paidOn', day, 'receiptNo', 'B3/2026-27/0001', 'voided', false))))), 'BAD_RECEIPT_NO');
  fails := fails || pg_temp.t31_is('5 own prefix saved', pg_temp.t31_try(format('select public.crm_push(%L, 2, %L::jsonb)', kb2,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 't31-pay1', 'd', jsonb_build_object('memberId', 't31-bm1', 'membershipId', 't31-bms1',
      'amountP', 50000, 'paidOn', day, 'receiptNo', 'B2/2026-27/0001', 'voided', false))))), 'ok');
  fails := fails || pg_temp.t31_is('5 import series saved', pg_temp.t31_try(format('select public.crm_push(%L, 3, %L::jsonb)', kb2,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 't31-pay2', 'd', jsonb_build_object('memberId', 't31-bm1', 'membershipId', 't31-bms1',
      'amountP', 10000, 'paidOn', day, 'receiptNo', 'B2I/26-27/0001', 'voided', false, 'importId', 'imp-b'))))), 'ok');
  fails := fails || pg_temp.t31_is('5 cancel keeps working', pg_temp.t31_try(format('select public.crm_push(%L, 4, %L::jsonb)', kb2,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 't31-pay1', 'd', jsonb_build_object('memberId', 't31-bm1', 'membershipId', 't31-bms1',
      'amountP', 50000, 'paidOn', day, 'receiptNo', 'B2/2026-27/0001', 'voided', true, 'voidReason', 'Typed twice'))))), 'ok');
  fails := fails || pg_temp.t31_is('5 first branch unchanged', pg_temp.t31_try(format('select public.crm_push(%L, 1, %L::jsonb)', koa,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 't31-pay3', 'd', jsonb_build_object('memberId', 't31-m1', 'membershipId', 't31-ms1',
      'amountP', 0.5, 'paidOn', day, 'receiptNo', '2026-27/0001', 'voided', false))))), 'BAD_AMOUNT');
  -- The branch's details: its prefix cannot be dropped or changed, and the first branch can't claim one.
  v := public.crm_push(kb2, 5, '[{"k":"gym","id":"gym","d":{"name":"T31 Branch Two","gstin":"08ABCDE1234F1Z5"}}]'::jsonb);
  fails := fails || pg_temp.t31_is('5 prefix kept on the record',
    (select data->>'receiptPrefix' || '|' || (data->>'gstin') from public.crm_records where gym_id = gb and kind = 'gym'), 'B2|08ABCDE1234F1Z5');
  v := public.crm_push(kb2, 6, '[{"k":"gym","id":"gym","d":{"name":"T31 Branch Two","receiptPrefix":"ZZ"}}]'::jsonb);
  fails := fails || pg_temp.t31_is('5 prefix not changed', (select data->>'receiptPrefix' from public.crm_records where gym_id = gb and kind = 'gym'), 'B2');
  v := public.crm_push(koa, 1, '[{"k":"gym","id":"gym","d":{"name":"T31 Iron Temple","receiptPrefix":"B9"}}]'::jsonb);
  fails := fails || pg_temp.t31_is('5 no prefix claimed', (select coalesce(data->>'receiptPrefix', 'none') from public.crm_records where gym_id = ga and kind = 'gym'), 'none');
  checks := checks + 10;

  -- 6. Owners are owners of every branch; desk staff are per branch.
  r := public.owner_add_person(koa, 'Partner', '9876531003', 'owner');
  s_partner := (r->>'staffId')::uuid;
  fails := fails || pg_temp.t31_is('6 owner in every branch',
    (select count(*) from public.gym_staff where phone = '9876531003' and role = 'owner' and removed_at is null and gym_id in (ga, gb, gc))::text, '3');
  r := public.owner_add_person(kb2, 'Desk B', '9876531004', 'staff');
  s_db := (r->>'staffId')::uuid;
  insert into public.gym_sessions(staff_id, key_hash) values (s_db, public._hash_key(kdb));
  fails := fails || pg_temp.t31_is('6 desk only in its branch',
    (select string_agg(gym_id::text, ',') from public.gym_staff where phone = '9876531004' and removed_at is null), gb::text);
  fails := fails || pg_temp.t31_is('6 a desk person elsewhere can''t be made owner here',
    pg_temp.t31_try(format('select public.owner_add_person(%L, %L, %L, %L)', koa, 'Desk B', '9876531004', 'owner')), 'STAFF_ELSEWHERE');
  fails := fails || pg_temp.t31_is('6 nothing half-made',
    (select count(*) from public.gym_staff where phone = '9876531004' and gym_id = ga)::text, '0');
  fails := fails || pg_temp.t31_is('6 desk opens nothing', pg_temp.t31_try(format('select public.owner_open_branch(%L, %L)', kdb, ga)), 'OWNER_ONLY');
  -- A partner signed in on two branches, removed from one: gone from all, devices signed out.
  insert into public.gym_sessions(staff_id, key_hash)
    select staff_id, public._hash_key('t31-partner-' || gym_id::text) from public.gym_staff where phone = '9876531003' and removed_at is null;
  perform public.owner_remove_person(koa, s_partner);
  fails := fails || pg_temp.t31_is('6 removed everywhere',
    (select count(*) from public.gym_staff where phone = '9876531003' and removed_at is null)::text, '0');
  fails := fails || pg_temp.t31_is('6 signed out everywhere',
    (select count(*) from public.gym_sessions x join public.gym_staff s on s.staff_id = x.staff_id
      where s.phone = '9876531003' and x.ended_at is null)::text, '0');
  fails := fails || pg_temp.t31_is('6 cannot remove yourself from a branch',
    pg_temp.t31_try(format('select public.owner_remove_person(%L, %L)', kb2,
      (select staff_id from public.gym_staff where gym_id = gb and phone = '9876531001' and removed_at is null))), 'SELF');
  -- The last owner of the whole business stays (the old owner key of branch A tries).
  fails := fails || pg_temp.t31_is('6 last owner of the group', pg_temp.t31_try(format('select public.owner_remove_person(%L, %L)', kold, s_oa)), 'LAST_OWNER');
  -- A gym in no group: removing one of its two owners is 0010's rule.
  r := public.owner_add_person(koz, 'Owner Z2', '9876531008', 'owner');
  perform public.owner_remove_person(koz, (r->>'staffId')::uuid);
  fails := fails || pg_temp.t31_is('6 single gym unchanged',
    (select count(*) from public.gym_staff where gym_id = gz and role = 'owner' and removed_at is null)::text, '1');
  fails := fails || pg_temp.t31_is('6 single gym last owner',
    pg_temp.t31_try(format('select public.owner_remove_person(%L, %L)', koz, s_oz)), 'SELF');
  checks := checks + 11;

  -- 7. A member of another branch at this branch's desk.
  r := public.branch_find_visitor(kdb, '98765 31101');
  fails := fails || pg_temp.t31_is('7 found', jsonb_array_length(r)::text, '1');
  fails := fails || pg_temp.t31_is('7 what the desk sees',
    r->0->>'firstName' || '|' || (r->0->>'branchName') || '|' || (r->0->>'allowed') || '|' || (r->0->>'planOk') || '|' || (r->0->>'alreadyIn'),
    'Asha|T31 Iron Temple|true|true|false');
  fails := fails || pg_temp.t31_is('7 no full name or mobile', (r::text like '%Verma%' or r::text like '%9876531101%')::text, 'false');
  fails := fails || pg_temp.t31_is('7 not allowed', public.branch_find_visitor(kdb, '9876531102')->0->>'allowed', 'false');
  fails := fails || pg_temp.t31_is('7 nobody', jsonb_array_length(public.branch_find_visitor(kdb, '9876539999'))::text, '0');
  fails := fails || pg_temp.t31_is('7 bad phone', pg_temp.t31_try(format('select public.branch_find_visitor(%L, %L)', kdb, '12345')), 'BAD_PHONE');
  fails := fails || pg_temp.t31_is('7 a gym in no group', jsonb_array_length(public.branch_find_visitor(koz, '9876531101'))::text, '0');
  fails := fails || pg_temp.t31_is('7 not allowed refused',
    pg_temp.t31_try(format('select public.branch_check_in_visitor(%L, %L, %L)', kdb, ga, 't31-m2')), 'NOT_ALLOWED');
  fails := fails || pg_temp.t31_is('7 own branch refused',
    pg_temp.t31_try(format('select public.branch_check_in_visitor(%L, %L, %L)', kdb, gb, 't31-bm1')), 'GONE');
  fails := fails || pg_temp.t31_is('7 other business refused',
    pg_temp.t31_try(format('select public.branch_check_in_visitor(%L, %L, %L)', koz, ga, 't31-m1')), 'GONE');
  n := (select crm_version from public.gyms where gym_id = ga);
  r := public.branch_check_in_visitor(kdb, ga, 't31-m1');
  fails := fails || pg_temp.t31_is('7 checked in', r->>'ok' || '|' || (r->>'alreadyIn') || '|' || (r->>'branchName'), 'true|false|T31 Iron Temple');
  fails := fails || pg_temp.t31_is('7 written in the home branch',
    (select data->>'atGymId' || '|' || (data->>'atGymName') || '|' || (data->>'source') || '|' || (version = n + 1)
       from public.crm_records where gym_id = ga and kind = 'visit' and id = 't31-m1:' || day), gb::text || '|T31 Branch Two|desk|true');
  fails := fails || pg_temp.t31_is('7 home version moved', ((select crm_version from public.gyms where gym_id = ga) = n + 1)::text, 'true');
  fails := fails || pg_temp.t31_is('7 again: already in', public.branch_check_in_visitor(kdb, ga, 't31-m1')->>'alreadyIn', 'true');
  fails := fails || pg_temp.t31_is('7 visitors here', public.branch_visitors(kdb, day)->0->>'firstName', 'Asha');
  fails := fails || pg_temp.t31_is('7 not at the home branch', jsonb_array_length(public.branch_visitors(koa, day))::text, '0');
  fails := fails || pg_temp.t31_is('7 a bad day', jsonb_array_length(public.branch_visitors(kdb, 'soon'))::text, '0');
  perform public.branch_undo_visitor(kdb, ga, 't31-m1', day);
  fails := fails || pg_temp.t31_is('7 taken back', jsonb_array_length(public.branch_visitors(kdb, day))::text, '0');
  perform public.branch_undo_visitor(kdb, ga, 't31-m1', day);
  fails := fails || pg_temp.t31_is('7 taken back twice is quiet', 'ok', 'ok');
  checks := checks + 19;

  -- 7b. A member deleted from the home branch drops off "From other branches today".
  perform public.branch_check_in_visitor(kdb, ga, 't31-m3');
  fails := fails || pg_temp.t31_is('7b listed', jsonb_array_length(public.branch_visitors(kdb, day))::text, '1');
  update public.crm_records set deleted = true where gym_id = ga and kind = 'member' and id = 't31-m3';
  fails := fails || pg_temp.t31_is('7b deleted member left out', jsonb_array_length(public.branch_visitors(kdb, day))::text, '0');
  -- 7c. At most 30 look-ups an hour per branch; another branch has its own 30.
  n := (select count(*) from public.branch_lookups where gym_id = gb);
  for i in (n + 1)..30 loop
    perform public.branch_find_visitor(kdb, '9876539999');
  end loop;
  fails := fails || pg_temp.t31_is('7c the 31st is refused', pg_temp.t31_try(format('select public.branch_find_visitor(%L, %L)', kdb, '9876531101')), 'TOO_MANY_LOOKUPS');
  fails := fails || pg_temp.t31_is('7c another branch still looks', jsonb_array_length(public.branch_find_visitor(koa, '9876531201'))::text, '1');
  checks := checks + 4;

  -- 8. The member app's QR at another branch.
  r := public.member_check_in(km1, (select join_code from public.gyms where gym_id = gc));
  fails := fails || pg_temp.t31_is('8 at branch three', r->>'ok' || '|' || (r->>'gymName') || '|' || (r->>'alreadyIn'), 'true|T31 Branch Three|false');
  fails := fails || pg_temp.t31_is('8 written at home, says where',
    (select data->>'atGymId' || '|' || (data->>'source') from public.crm_records where gym_id = ga and kind = 'visit' and id = 't31-m1:' || day and not deleted),
    gc::text || '|app');
  r := public.member_check_in(km2, (select join_code from public.gyms where gym_id = gb));
  fails := fails || pg_temp.t31_is('8 plan for one branch only', r->>'error' || '|' || (r->>'gymName') || '|' || (r->>'branch'), 'OTHER_GYM|T31 Iron Temple|T31 Branch Two');
  fails := fails || pg_temp.t31_is('8 another business', public.member_check_in(km1, 'T31GYZ')->>'error', 'OTHER_GYM');
  r := public.member_check_in(km1, 'T31GYA');
  fails := fails || pg_temp.t31_is('8 home branch the same day', r->>'ok' || '|' || (r->>'alreadyIn') || '|' || (r->>'gymName'), 'true|true|T31 Iron Temple');
  r := public.member_check_in(km2, 'T31GYA');
  fails := fails || pg_temp.t31_is('8 home branch as before', r->>'ok' || '|' || (r->>'alreadyIn'), 'true|false');
  checks := checks + 6;

  -- 9. Support codes and HQ.
  fails := fails || pg_temp.t31_is('9 support: one business, no pick',
    ((public.support_make_signin_code('9876531001')->>'staffId')::uuid = s_oa)::text, 'true');
  insert into public.gym_staff(gym_id, name, phone, role) values (gz, 'Owner A', '9876531001', 'owner');
  fails := fails || pg_temp.t31_is('9 support: two businesses', pg_temp.t31_try('select public.support_make_signin_code(''9876531001'')'), 'PICK_GYM');
  fails := fails || pg_temp.t31_is('9 support: picked',
    ((public.support_make_signin_code('9876531001', gb)->>'staffId')::uuid
       = (select staff_id from public.gym_staff where gym_id = gb and phone = '9876531001' and removed_at is null))::text, 'true');
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  r := (select g from jsonb_array_elements(public.hq_groups(hq)) g where g->>'groupId' = grp::text);
  fails := fails || pg_temp.t31_is('9 HQ group', r->>'name' || '|' || jsonb_array_length(r->'branches'), 'T31 Iron Temple|3');
  fails := fails || pg_temp.t31_is('9 HQ member counts',
    (select string_agg(b->>'membersRegister' || '/' || (b->>'membersApp') || '/' || coalesce(b->>'receiptPrefix', '-'), ',') from jsonb_array_elements(r->'branches') b),
    '2/2/-,1/0/B2,0/0/B3');
  fails := fails || pg_temp.t31_is('9 HQ look written down', (select action from public.hq_audit order by audit_id desc limit 1), 'view_groups');
  fails := fails || pg_temp.t31_is('9 HQ only', (has_function_privilege('anon', 'public.hq_groups(text)', 'execute')
    or has_function_privilege('authenticated', 'public.hq_groups(text)', 'execute'))::text, 'false');
  perform set_config('request.jwt.claims', '', true);
  checks := checks + 7;

  -- 9b. A paused branch: an owner is still added to it and taken off it (the rest of 0027's
  --     read-only rule stays: nobody else joins its staff list).
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = gc;
  perform set_config('forgeai.hq', 'off', true);
  r := public.owner_add_person(koa, 'Partner Two', '9876531005', 'owner');
  fails := fails || pg_temp.t31_is('9b owner added to the paused branch too',
    (select count(*) from public.gym_staff where phone = '9876531005' and removed_at is null and gym_id in (ga, gb, gc))::text, '3');
  fails := fails || pg_temp.t31_is('9b removing an owner works with a branch paused',
    pg_temp.t31_try(format('select public.owner_remove_person(%L, %L)', koa, (r->>'staffId'))), 'ok');
  fails := fails || pg_temp.t31_is('9b gone from the paused branch too',
    (select count(*) from public.gym_staff where phone = '9876531005' and removed_at is null)::text, '0');
  fails := fails || pg_temp.t31_is('9b a desk person is not added to a paused branch',
    pg_temp.t31_try(format('select public.owner_add_person(%L, %L, %L, %L)', kc, 'Desk C', '9876531006', 'staff')), 'SUSPENDED');
  fails := fails || pg_temp.t31_is('9b a desk person is not removed from it either',
    pg_temp.t31_try(format('update public.gym_staff set name = %L where gym_id = %L and phone = %L', 'X', gc, '9876531001')), 'SUSPENDED');
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'active' where gym_id = gc;
  perform set_config('forgeai.hq', 'off', true);
  -- 9c. The people functions change one business at a time; a removed owner's key opens nothing.
  fails := fails || pg_temp.t31_is('9c every people change takes the business lock',
    (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.prosrc like '%_branch_lock(%'
        and p.proname in ('owner_add_person', 'owner_remove_person', 'owner_sign_out_person', 'owner_open_branch', 'owner_add_branch'))::text, '5');
  r := public.owner_add_person(koa, 'Partner Three', '9876531007', 'owner');
  insert into public.gym_sessions(staff_id, key_hash) values ((r->>'staffId')::uuid, public._hash_key('t31-partner-three'));
  perform public.owner_remove_person(koa, (r->>'staffId')::uuid);
  fails := fails || pg_temp.t31_is('9c removed owner opens no branch', pg_temp.t31_try(format('select public.owner_open_branch(%L, %L)', 't31-partner-three', gb)), 'BAD_KEY');
  fails := fails || pg_temp.t31_is('9c and no row comes back', (select count(*) from public.gym_staff where phone = '9876531007' and removed_at is null)::text, '0');
  checks := checks + 8;

  -- 10. Renaming the business; sign-out everywhere; at most 10 branches; a paused gym adds none.
  r := public.owner_rename_group(koa, 'T31 Iron Temple Group');
  fails := fails || pg_temp.t31_is('10 renamed', r->>'groupName', 'T31 Iron Temple Group');
  fails := fails || pg_temp.t31_is('10 desk cannot rename', pg_temp.t31_try(format('select public.owner_rename_group(%L, %L)', kdb, 'X')), 'OWNER_ONLY');
  perform public.owner_sign_out_person(koa, s_oa);
  fails := fails || pg_temp.t31_is('10 this device stays', (public._owner_gym(koa) = ga)::text, 'true');
  fails := fails || pg_temp.t31_is('10 other branches signed out', pg_temp.t31_try(format('select public.owner_branches(%L)', kb2)), 'BAD_KEY');
  fails := fails || pg_temp.t31_is('10 desk untouched', (public._owner_gym(kdb) = gb)::text, 'true');
  for i in 4..10 loop
    perform public.owner_add_branch(koa, 'T31 Branch ' || i, false);
  end loop;
  fails := fails || pg_temp.t31_is('10 ten branches', array_length(public._branch_ids(ga), 1)::text, '10');
  fails := fails || pg_temp.t31_is('10 prefixes run on',
    (select string_agg(receipt_prefix, ',' order by branch_no) from public.gyms where group_id = grp and receipt_prefix is not null),
    'B2,B3,B4,B5,B6,B7,B8,B9,B10');
  fails := fails || pg_temp.t31_is('10 no eleventh', pg_temp.t31_try(format('select public.owner_add_branch(%L, %L)', koa, 'T31 Branch 11')), 'TOO_MANY');
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = gz;
  perform set_config('forgeai.hq', 'off', true);
  fails := fails || pg_temp.t31_is('10 paused gym', pg_temp.t31_try(format('select public.owner_add_branch(%L, %L)', koz, 'T31 Z Two')), 'SUSPENDED');
  checks := checks + 9;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
