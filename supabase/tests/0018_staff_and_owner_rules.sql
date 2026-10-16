-- Front desk and owner rules test (0018: C8-1, C8-2, C8-3, C8-4, C8-7, C8-11). Runs in CI after
-- every migration (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS
-- ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).
-- The three helpers below live only for this connection (pg_temp).

-- One push on the gym's current version: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t18_push(p_key text, p_rows jsonb) returns text
  language plpgsql as $$
declare v bigint;
begin
  select crm_version into v from public.gyms where gym_id = public._owner_gym(p_key);
  perform public.crm_push(p_key, v, p_rows);
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- Any statement: 'ok', or the error it raised.
create or replace function pg_temp.t18_try(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t18_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gb uuid; s_owner uuid; s_staff uuid; s_pa uuid; s_pb uuid;
  ko text := 't18-owner-key'; kop text := 't18-owner-session'; ks text := 't18-staff-session';
  td date := (now() at time zone 'Asia/Kolkata')::date;
  fails text := ''; checks int := 0;
  d jsonb; x jsonb; r jsonb; pid uuid; mid uuid; c text; wrong text; i int; n int; stmt text;
  ph text := '9876500021';
  owner_fns text[];
begin
  -- ---------------------------------------------------------------- a gym with an owner and a desk
  insert into public.gyms(name, join_code) values ('T18 Gym', 'T18GYA') returning gym_id into gid;
  insert into public.gym_owner_keys(gym_id, key_hash) values (gid, public._hash_key(ko));
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner', '9876500011', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Desk', '9876500012', 'staff') returning staff_id into s_staff;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_staff, public._hash_key(ks));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'plan', 'pl-month', '{"name":"Monthly","durationUnit":"month","durationCount":1,"priceP":100000}', 1),
    (gid, 'plan', 'pl-pt', '{"name":"PT 10","durationUnit":"day","durationCount":30,"priceP":500000,"ptSessions":10}', 1),
    (gid, 'member', 'm1', '{"fullName":"Typed by hand","phone":"9811111111"}', 1),
    (gid, 'member', 'm-imp', '{"fullName":"Imported","phone":"9811111112","importId":"import-t18"}', 1),
    (gid, 'payment', 'pay1', '{"memberId":"m1","amountP":50000,"voided":false,"receiptNo":"R-1"}', 1),
    (gid, 'membership', 'ms1', jsonb_build_object('memberId', 'm1', 'planId', 'pl-month', 'priceP', 100000,
       'startsOn', to_char(td - 10, 'YYYY-MM-DD'), 'endsOn', to_char(td + 20, 'YYYY-MM-DD'), 'cancelled', false, 'updatedAt', 1), 1),
    (gid, 'membership', 'pt1', jsonb_build_object('memberId', 'm1', 'planId', 'pl-pt', 'priceP', 500000, 'ptSessions', 3,
       'ptLog', jsonb_build_array(to_char(td - 1, 'YYYY-MM-DD')),
       'startsOn', to_char(td - 5, 'YYYY-MM-DD'), 'endsOn', to_char(td + 24, 'YYYY-MM-DD'), 'cancelled', false, 'updatedAt', 1), 1);
  update public.gyms set crm_version = 1 where gym_id = gid;

  -- ---------------------------------------------------------------- C8-1 receipts (Staff)
  select data into d from public.crm_records where gym_id = gid and kind = 'payment' and id = 'pay1';
  fails := fails || pg_temp.t18_is('1a lower a receipt', pg_temp.t18_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 'pay1', 'd', d || '{"amountP":100}'))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('1b move a receipt', pg_temp.t18_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 'pay1', 'd', d || '{"memberId":"m-imp"}'))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('1c void a receipt', pg_temp.t18_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 'pay1', 'd', d || '{"voided":true,"voidReason":"x"}'))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('1d same receipt again', pg_temp.t18_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 'pay1', 'd', d))), 'ok');
  fails := fails || pg_temp.t18_is('1e take a fee', pg_temp.t18_push(ks,
    '[{"k":"payment","id":"pay-new","d":{"memberId":"m1","amountP":30000,"voided":false,"receiptNo":"R-2"}}]'), 'ok');
  fails := fails || pg_temp.t18_is('1f minus receipt', pg_temp.t18_push(ks,
    '[{"k":"payment","id":"pay-neg","d":{"memberId":"m1","amountP":-500,"voided":false}}]'), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('1g zero receipt', pg_temp.t18_push(ks,
    '[{"k":"payment","id":"pay-zero","d":{"memberId":"m1","amountP":0,"voided":false}}]'), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('1h voided new receipt', pg_temp.t18_push(ks,
    '[{"k":"payment","id":"pay-void","d":{"memberId":"m1","amountP":100,"voided":true}}]'), 'OWNER_ONLY');
  checks := checks + 8;
  if (select data->>'amountP' from public.crm_records where gym_id = gid and id = 'pay1') <> '50000' then
    fails := fails || ' 1:receipt changed';
  end if;
  checks := checks + 1;

  -- ---------------------------------------------------------------- C8-1 PT log (Staff)
  select data into d from public.crm_records where gym_id = gid and kind = 'membership' and id = 'pt1';
  fails := fails || pg_temp.t18_is('2a mark today', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'pt1',
    'd', d || jsonb_build_object('ptLog', jsonb_build_array(to_char(td - 1, 'YYYY-MM-DD'), to_char(td, 'YYYY-MM-DD')), 'updatedAt', 2)))), 'ok');
  fails := fails || pg_temp.t18_is('2b take back today', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'pt1',
    'd', d || jsonb_build_object('ptLog', jsonb_build_array(to_char(td - 1, 'YYYY-MM-DD')), 'updatedAt', 3)))), 'ok');
  fails := fails || pg_temp.t18_is('2c take back an old day', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'pt1',
    'd', d || jsonb_build_object('ptLog', '[]'::jsonb, 'updatedAt', 4)))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('2d mark a future day', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'pt1',
    'd', d || jsonb_build_object('ptLog', jsonb_build_array(to_char(td - 1, 'YYYY-MM-DD'), to_char(td + 3, 'YYYY-MM-DD')), 'updatedAt', 4)))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('2e mark before the start', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'pt1',
    'd', d || jsonb_build_object('ptLog', jsonb_build_array(to_char(td - 6, 'YYYY-MM-DD'), to_char(td - 1, 'YYYY-MM-DD')), 'updatedAt', 4)))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('2f more than bought', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'pt1',
    'd', d || jsonb_build_object('ptLog', jsonb_build_array(to_char(td - 4, 'YYYY-MM-DD'), to_char(td - 3, 'YYYY-MM-DD'),
                                                             to_char(td - 1, 'YYYY-MM-DD'), to_char(td, 'YYYY-MM-DD')), 'updatedAt', 4)))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('2g up to what was bought', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'pt1',
    'd', d || jsonb_build_object('ptLog', jsonb_build_array(to_char(td - 3, 'YYYY-MM-DD'), to_char(td - 1, 'YYYY-MM-DD'), to_char(td, 'YYYY-MM-DD')), 'updatedAt', 4)))), 'ok');
  select data into d from public.crm_records where gym_id = gid and kind = 'membership' and id = 'pt1';
  fails := fails || pg_temp.t18_is('2h same day twice', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'pt1',
    'd', d || jsonb_build_object('ptLog', jsonb_build_array(to_char(td - 3, 'YYYY-MM-DD'), to_char(td - 1, 'YYYY-MM-DD'), to_char(td, 'YYYY-MM-DD'), to_char(td, 'YYYY-MM-DD')), 'updatedAt', 5)))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('2i more sessions', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'pt1',
    'd', d || '{"ptSessions":10}'))), 'OWNER_ONLY');
  checks := checks + 9;

  -- ---------------------------------------------------------------- C8-1 other membership fields (Staff)
  select data into d from public.crm_records where gym_id = gid and kind = 'membership' and id = 'ms1';
  fails := fails || pg_temp.t18_is('3a lower the price', pg_temp.t18_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms1', 'd', d || '{"priceP":1}'))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('3b move the end', pg_temp.t18_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms1', 'd', d || jsonb_build_object('endsOn', to_char(td + 60, 'YYYY-MM-DD'))))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('3c move the start', pg_temp.t18_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms1', 'd', d || jsonb_build_object('startsOn', to_char(td - 9, 'YYYY-MM-DD'))))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('3d cancel', pg_temp.t18_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms1', 'd', d || '{"cancelled":true}'))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('3e add PT to a gym plan', pg_temp.t18_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms1', 'd', d || jsonb_build_object('ptLog', jsonb_build_array(to_char(td, 'YYYY-MM-DD')))))), 'OWNER_ONLY');
  checks := checks + 5;

  -- ---------------------------------------------------------------- C8-1 selling a plan (Staff)
  -- The plan's own end date, worked out here the way the panel does (logic/membership.ts).
  checks := checks + 4;
  fails := fails || pg_temp.t18_is('4 end 31 Jan +1 month', public._plan_end('2026-01-31', 'month', 1)::text, '2026-02-27');
  fails := fails || pg_temp.t18_is('4 end 26 Jul +1 month', public._plan_end('2026-07-26', 'month', 1)::text, '2026-08-25');
  fails := fails || pg_temp.t18_is('4 end 31 Jan +3 months', public._plan_end('2026-01-31', 'month', 3)::text, '2026-04-29');
  fails := fails || pg_temp.t18_is('4 end 7-day pass', public._plan_end('2026-07-26', 'day', 7)::text, '2026-08-01');
  x := jsonb_build_object('memberId', 'm1', 'planId', 'pl-month', 'priceP', 80000, 'joiningFeeP', 0, 'listPriceP', 100000,
         'startsOn', to_char(td, 'YYYY-MM-DD'), 'endsOn', to_char((td + interval '1 month')::date - 1, 'YYYY-MM-DD'),
         'cancelled', false, 'notes', null, 'soldBy', null, 'createdAt', 1, 'updatedAt', 1);
  fails := fails || pg_temp.t18_is('4a sell today (discount)', pg_temp.t18_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-a', 'd', x))), 'ok');
  fails := fails || pg_temp.t18_is('4b sell from 20 days back', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-b',
    'd', x || jsonb_build_object('startsOn', to_char(td - 20, 'YYYY-MM-DD'), 'endsOn', to_char((td - 20 + interval '1 month')::date - 1, 'YYYY-MM-DD'))))), 'ok');
  fails := fails || pg_temp.t18_is('4c sell from 40 days back', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-c',
    'd', x || jsonb_build_object('startsOn', to_char(td - 40, 'YYYY-MM-DD'), 'endsOn', to_char((td - 40 + interval '1 month')::date - 1, 'YYYY-MM-DD'))))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('4d longer than the plan', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-d',
    'd', x || jsonb_build_object('endsOn', to_char((td + interval '1 month')::date, 'YYYY-MM-DD'))))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('4e minus price', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-e',
    'd', x || '{"priceP":-1}'))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('4f minus joining fee', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-f',
    'd', x || '{"joiningFeeP":-100}'))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('4g no such plan', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-g',
    'd', x || '{"planId":"no-such-plan"}'))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('4h sold cancelled', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-h',
    'd', x || '{"cancelled":true}'))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('4i queued renewal', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-i',
    'd', x || jsonb_build_object('startsOn', to_char(td + 25, 'YYYY-MM-DD'), 'endsOn', to_char((td + 25 + interval '1 month')::date - 1, 'YYYY-MM-DD'))))), 'ok');
  x := jsonb_build_object('memberId', 'm1', 'planId', 'pl-pt', 'priceP', 500000, 'joiningFeeP', 0, 'ptSessions', 10, 'trainer', null,
         'ptLog', '[]'::jsonb, 'startsOn', to_char(td, 'YYYY-MM-DD'), 'endsOn', to_char(td + 29, 'YYYY-MM-DD'), 'cancelled', false);
  fails := fails || pg_temp.t18_is('4j sell a PT pack', pg_temp.t18_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'pt-a', 'd', x))), 'ok');
  fails := fails || pg_temp.t18_is('4k PT pack, more sessions', pg_temp.t18_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'pt-b', 'd', x || '{"ptSessions":50}'))), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('4l PT pack, days already used', pg_temp.t18_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'pt-c', 'd', x || jsonb_build_object('ptLog', jsonb_build_array(to_char(td, 'YYYY-MM-DD')))))), 'OWNER_ONLY');
  checks := checks + 12;

  -- ---------------------------------------------------------------- the desk's everyday work still goes in
  fails := fails || pg_temp.t18_is('5a add a member', pg_temp.t18_push(ks, '[{"k":"member","id":"m-new","d":{"fullName":"New one","phone":"9811111113"}}]'), 'ok');
  fails := fails || pg_temp.t18_is('5b edit a member', pg_temp.t18_push(ks, '[{"k":"member","id":"m1","d":{"fullName":"Typed by hand","phone":"9811111119"}}]'), 'ok');
  fails := fails || pg_temp.t18_is('5c check in', pg_temp.t18_push(ks, jsonb_build_array(jsonb_build_object('k', 'visit', 'id', 'v1',
    'd', jsonb_build_object('memberId', 'm1', 'visitedOn', to_char(td, 'YYYY-MM-DD'), 'source', 'desk')))), 'ok');
  fails := fails || pg_temp.t18_is('5d take back a check-in', pg_temp.t18_push(ks, '[{"k":"visit","id":"v1","d":null,"x":true}]'), 'ok');
  fails := fails || pg_temp.t18_is('5e enquiry', pg_temp.t18_push(ks, '[{"k":"enquiry","id":"e1","d":{"name":"Walk-in","status":"open"}}]'), 'ok');
  fails := fails || pg_temp.t18_is('5f a plan', pg_temp.t18_push(ks, '[{"k":"plan","id":"pl-x","d":{"name":"Free"}}]'), 'OWNER_ONLY');
  fails := fails || pg_temp.t18_is('5g sale + receipt in one push', pg_temp.t18_push(ks, jsonb_build_array(
    jsonb_build_object('k', 'membership', 'id', 'ms-j', 'd', jsonb_build_object('memberId', 'm-new', 'planId', 'pl-month', 'priceP', 100000,
      'joiningFeeP', 50000, 'startsOn', to_char(td, 'YYYY-MM-DD'), 'endsOn', to_char((td + interval '1 month')::date - 1, 'YYYY-MM-DD'), 'cancelled', false)),
    jsonb_build_object('k', 'payment', 'id', 'pay-j', 'd', '{"memberId":"m-new","membershipId":"ms-j","amountP":150000,"voided":false}'::jsonb))), 'ok');
  checks := checks + 7;

  -- ---------------------------------------------------------------- owners are unchanged
  select data into d from public.crm_records where gym_id = gid and kind = 'payment' and id = 'pay1';
  fails := fails || pg_temp.t18_is('6a owner voids', pg_temp.t18_push(kop,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 'pay1', 'd', d || '{"voided":true,"voidReason":"typo"}'))), 'ok');
  select data into d from public.crm_records where gym_id = gid and kind = 'membership' and id = 'pt1';
  fails := fails || pg_temp.t18_is('6b owner takes back an old PT day', pg_temp.t18_push(kop, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'pt1',
    'd', d || jsonb_build_object('ptLog', jsonb_build_array(to_char(td, 'YYYY-MM-DD')))))), 'ok');
  fails := fails || pg_temp.t18_is('6c owner sells 60 days back', pg_temp.t18_push(kop, jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-o',
    'd', jsonb_build_object('memberId', 'm1', 'planId', 'pl-month', 'priceP', 100000, 'startsOn', to_char(td - 60, 'YYYY-MM-DD'),
                            'endsOn', to_char((td - 60 + interval '1 month')::date - 1, 'YYYY-MM-DD'), 'cancelled', false)))), 'ok');
  select data into d from public.crm_records where gym_id = gid and kind = 'membership' and id = 'ms1';
  fails := fails || pg_temp.t18_is('6d old owner key gives extra days', pg_temp.t18_push(ko,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms1', 'd', d || jsonb_build_object('endsOn', to_char(td + 27, 'YYYY-MM-DD'))))), 'ok');
  checks := checks + 4;

  -- ---------------------------------------------------------------- C8-3 the import mark is fixed at insert
  select data into d from public.crm_records where gym_id = gid and kind = 'member' and id = 'm1';
  fails := fails || pg_temp.t18_is('7a staff stamps a hand record', pg_temp.t18_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'member', 'id', 'm1', 'd', d || '{"importId":"import-t18"}'))), 'INVALID');
  fails := fails || pg_temp.t18_is('7b owner stamps a hand record', pg_temp.t18_push(kop,
    jsonb_build_array(jsonb_build_object('k', 'member', 'id', 'm1', 'd', d || '{"importId":"import-t18"}'))), 'INVALID');
  select data into d from public.crm_records where gym_id = gid and kind = 'member' and id = 'm-imp';
  fails := fails || pg_temp.t18_is('7c staff strips the mark', pg_temp.t18_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'member', 'id', 'm-imp', 'd', d - 'importId'))), 'INVALID');
  fails := fails || pg_temp.t18_is('7d owner changes the mark', pg_temp.t18_push(kop,
    jsonb_build_array(jsonb_build_object('k', 'member', 'id', 'm-imp', 'd', d || '{"importId":"import-other"}'))), 'INVALID');
  fails := fails || pg_temp.t18_is('7e edit keeps the mark', pg_temp.t18_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'member', 'id', 'm-imp', 'd', d || '{"fullName":"Imported, edited"}'))), 'ok');
  fails := fails || pg_temp.t18_is('7f a new record may carry one', pg_temp.t18_push(ks,
    '[{"k":"member","id":"m-imp2","d":{"fullName":"Imported 2","phone":"9811111114","importId":"import-t18"}}]'), 'ok');
  select data into d from public.crm_records where gym_id = gid and kind = 'payment' and id = 'pay-new';
  fails := fails || pg_temp.t18_is('7g stamp a receipt', pg_temp.t18_push(kop,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 'pay-new', 'd', d || '{"importId":"import-t18"}'))), 'INVALID');
  checks := checks + 7;

  -- ---------------------------------------------------------------- C8-2 owner-only functions
  pid := (public.owner_save_product(ko, '{"name":"T18 shaker","priceP":50000}'::jsonb)).product_id;
  mid := (public.owner_send_message(ko, 'announcement', 'T18 hello', '')->>'id')::uuid;
  owner_fns := array[
    'select public.owner_rename_gym(%1$L, ''New name'')',
    'select public.owner_set_brand(%1$L, null, null, null, ''normal'')',
    'select public.owner_save_product(%1$L, ''{"name":"T18 bar","priceP":10000}''::jsonb)',
    'select public.owner_add_stock(%1$L, %2$L::uuid, null, 1)',
    'select public.owner_set_product_active(%1$L, %2$L::uuid, false)',
    'select public.owner_set_product_photo(%1$L, %2$L::uuid, null)',
    'select public.owner_photo_ticket(%1$L)',
    'select public.owner_send_message(%1$L, ''announcement'', ''Pay here'', '''')',
    'select public.owner_withdraw_message(%1$L, %3$L::uuid)',
    'select public.owner_delete_product(%1$L, %2$L::uuid)'];
  foreach stmt in array owner_fns loop
    fails := fails || pg_temp.t18_is('8 staff ' || split_part(split_part(stmt, 'public.', 2), '(', 1),
      pg_temp.t18_try(format(stmt, ks, pid, mid)), 'OWNER_ONLY');
    checks := checks + 1;
  end loop;
  foreach stmt in array owner_fns loop
    fails := fails || pg_temp.t18_is('8 owner ' || split_part(split_part(stmt, 'public.', 2), '(', 1),
      pg_temp.t18_try(format(stmt, kop, pid, mid)), 'ok');
    checks := checks + 1;
  end loop;
  fails := fails || pg_temp.t18_is('8 old owner key', pg_temp.t18_try(format('select public.owner_rename_gym(%L, ''T18 Gym'')', ko)), 'ok');
  fails := fails || pg_temp.t18_is('8 unknown key', pg_temp.t18_try('select public.owner_rename_gym(''t18-nobody'', ''X'')'), 'BAD_KEY');
  -- Orders and reads stay open to the desk (handing over orders).
  fails := fails || pg_temp.t18_is('8 staff reads orders', pg_temp.t18_try(format('select public.owner_orders(%L)', ks)), 'ok');
  fails := fails || pg_temp.t18_is('8 staff reads products', pg_temp.t18_try(format('select public.owner_products(%L)', ks)), 'ok');
  checks := checks + 4;

  -- ---------------------------------------------------------------- C8-4 / C8-11 sign-in tries
  -- The same mobile is an owner in this gym (A) and a person in another gym (B) someone made.
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner two', ph, 'owner') returning staff_id into s_pa;
  insert into public.gyms(name, join_code) values ('T18 Gym B', 'T18GYB') returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (gb, 'Same mobile', ph, 'staff') returning staff_id into s_pb;
  c := public._make_code(s_pa)->>'code';
  wrong := lpad(((c::int + 1) % 1000000)::text, 6, '0');

  -- 9a. Four wrong tries from one caller.
  perform set_config('request.headers', '{"cf-connecting-ip":"10.18.0.1"}', true);
  for i in 1..4 loop r := public.staff_sign_in(ph, wrong); end loop;
  fails := fails || pg_temp.t18_is('9a wrong', r->>'error', 'WRONG_CODE');
  -- 9b. A code made for the same mobile in gym B clears only gym B's person: gym A's tries stay.
  select count(*) into n from public.gym_signin_fails where staff_id = s_pa;
  perform public._make_code(s_pb);
  fails := fails || pg_temp.t18_is('9b A tries kept', (select count(*) from public.gym_signin_fails where staff_id = s_pa)::text, n::text);
  fails := fails || pg_temp.t18_is('9b B tries cleared', (select count(*) from public.gym_signin_fails where staff_id = s_pb)::text, '0');
  -- So the guessing caller is still stopped after its fifth wrong try.
  r := public.staff_sign_in(ph, wrong);
  fails := fails || pg_temp.t18_is('9c fifth wrong', r->>'error', 'WRONG_CODE');
  r := public.staff_sign_in(ph, wrong);
  fails := fails || pg_temp.t18_is('9c sixth stopped', r->>'error', 'TOO_MANY_TRIES');
  r := public.staff_sign_in(ph, c);
  fails := fails || pg_temp.t18_is('9c stopped caller, right code', r->>'error', 'TOO_MANY_TRIES');
  -- 9d. The real person (another caller) still signs in with the right code.
  perform set_config('request.headers', '{"cf-connecting-ip":"10.18.0.2"}', true);
  r := public.staff_sign_in(ph, c);
  fails := fails || pg_temp.t18_is('9d right code signs in', r->'person'->>'staffId', s_pa::text);
  checks := checks + 6;

  -- 9e. Ten wrong tries (from several callers, none over its own limit) make a code void.
  c := public._make_code(s_pa)->>'code';
  wrong := lpad(((c::int + 7) % 1000000)::text, 6, '0');
  for i in 1..10 loop
    perform set_config('request.headers', format('{"cf-connecting-ip":"10.18.1.%s"}', (i + 1) / 2), true);
    r := public.staff_sign_in(ph, wrong);
  end loop;
  fails := fails || pg_temp.t18_is('9e tenth wrong', r->>'error', 'WRONG_CODE');
  perform set_config('request.headers', '{"cf-connecting-ip":"10.18.2.1"}', true);
  r := public.staff_sign_in(ph, c);
  fails := fails || pg_temp.t18_is('9e void code refused', r->>'error', 'WRONG_CODE');
  fails := fails || pg_temp.t18_is('9e people list: no code waiting',
    (select e->>'codeUntil' from jsonb_array_elements(public.owner_people(ko)) e where e->>'staffId' = s_pa::text), null);
  -- 9f. A new code works at once.
  c := public._make_code(s_pa)->>'code';
  perform set_config('request.headers', '{"cf-connecting-ip":"10.18.2.2"}', true);
  r := public.staff_sign_in(ph, c);
  fails := fails || pg_temp.t18_is('9f new code signs in', r->'person'->>'staffId', s_pa::text);
  fails := fails || pg_temp.t18_is('9f still 6 digits', (c ~ '^[0-9]{6}$')::text, 'true');
  checks := checks + 5;

  -- ---------------------------------------------------------------- C8-7 uploads (tests/0018_photo_upload.sql does the real insert)
  fails := fails || pg_temp.t18_is('10 anon may run the upload check',
    has_function_privilege('anon', 'public._photo_ticket_ok(text)', 'execute')::text, 'true');
  checks := checks + 1;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
