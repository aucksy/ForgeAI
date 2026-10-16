-- Front-desk discount limit and "who took the money" test (0019: C7-12, C7-13). Runs in CI after
-- every migration (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS
-- ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

-- One push on the gym's current version: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t19_push(p_key text, p_rows jsonb) returns text
  language plpgsql as $$
declare v bigint;
begin
  select crm_version into v from public.gyms where gym_id = public._owner_gym(p_key);
  perform public.crm_push(p_key, v, p_rows);
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t19_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; s_owner uuid; s_staff uuid;
  ko text := 't19-owner-key'; kop text := 't19-owner-session'; ks text := 't19-staff-session';
  td date := (now() at time zone 'Asia/Kolkata')::date;
  fails text := ''; checks int := 0;
  sale jsonb; d jsonb;
begin
  -- ---------------------------------------------------------------- a gym with an owner and a desk
  insert into public.gyms(name, join_code) values ('T19 Gym', 'T19GYA') returning gym_id into gid;
  insert into public.gym_owner_keys(gym_id, key_hash) values (gid, public._hash_key(ko));
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner Om', '9876500091', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Desk Ramesh', '9876500092', 'staff') returning staff_id into s_staff;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_staff, public._hash_key(ks));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'plan', 'pl-month', '{"name":"Monthly","durationUnit":"month","durationCount":1,"priceP":100000,"joiningFeeP":50000}', 1),
    (gid, 'member', 'm-new', '{"fullName":"New one","phone":"9811111191"}', 1),
    (gid, 'member', 'm-new2', '{"fullName":"New two","phone":"9811111192"}', 1),
    (gid, 'member', 'm-old', '{"fullName":"Old one","phone":"9811111193"}', 1),
    (gid, 'membership', 'ms-old', jsonb_build_object('memberId', 'm-old', 'planId', 'pl-month', 'priceP', 100000, 'joiningFeeP', 50000,
       'startsOn', to_char(td - 40, 'YYYY-MM-DD'), 'endsOn', to_char(td - 10, 'YYYY-MM-DD'), 'cancelled', false), 1);
  update public.gyms set crm_version = 1 where gym_id = gid;

  sale := jsonb_build_object('memberId', 'm-new', 'planId', 'pl-month', 'priceP', 100000, 'joiningFeeP', 50000, 'listPriceP', 100000,
            'startsOn', to_char(td, 'YYYY-MM-DD'), 'endsOn', to_char(public._plan_end(td, 'month', 1), 'YYYY-MM-DD'),
            'cancelled', false, 'notes', null, 'soldBy', null, 'createdAt', 1, 'updatedAt', 1);

  -- ---------------------------------------------------------------- C7-13 the desk's discount limit
  fails := fails || pg_temp.t19_is('1a desk sells at Rs 0', pg_temp.t19_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-zero', 'd', sale || '{"priceP":0}'))), 'OWNER_ONLY');
  fails := fails || pg_temp.t19_is('1b desk 1 paisa under 10% off', pg_temp.t19_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-under', 'd', sale || '{"priceP":89999}'))), 'OWNER_ONLY');
  fails := fails || pg_temp.t19_is('1c desk drops a new member''s joining fee', pg_temp.t19_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-nofee', 'd', sale || '{"joiningFeeP":0}'))), 'OWNER_ONLY');
  fails := fails || pg_temp.t19_is('1d desk gives 10% off with the fee', pg_temp.t19_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-ten', 'd', sale || '{"priceP":90000}'))), 'ok');
  fails := fails || pg_temp.t19_is('1e desk renews without the fee', pg_temp.t19_push(ks,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-renew', 'd', sale || '{"memberId":"m-old","joiningFeeP":0}'))), 'ok');
  fails := fails || pg_temp.t19_is('1f owner session gives it free', pg_temp.t19_push(kop,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-free', 'd', sale || '{"memberId":"m-new2","priceP":0,"joiningFeeP":0}'))), 'ok');
  fails := fails || pg_temp.t19_is('1g old owner key gives it free', pg_temp.t19_push(ko,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-free2', 'd', sale || '{"memberId":"m-new2","priceP":0,"joiningFeeP":0}'))), 'ok');
  checks := checks + 7;

  -- ---------------------------------------------------------------- C7-12 who took the money
  fails := fails || pg_temp.t19_is('2a desk takes a fee naming a colleague', pg_temp.t19_push(ks,
    format('[{"k":"payment","id":"pay-desk","d":{"memberId":"m-new","membershipId":"ms-ten","paidOn":"%s","amountP":30000,"voided":false,"receiptNo":"R-1","collectedBy":"%s","collectedByName":"Owner Om"}}]',
           to_char(td, 'YYYY-MM-DD'), s_owner)::jsonb), 'ok');
  select data into d from public.crm_records where gym_id = gid and kind = 'payment' and id = 'pay-desk';
  fails := fails || pg_temp.t19_is('2b the receipt names the desk', d->>'collectedBy', s_staff::text);
  fails := fails || pg_temp.t19_is('2c and its name', d->>'collectedByName', 'Desk Ramesh');
  fails := fails || pg_temp.t19_is('2d the amount is kept', d->>'amountP', '30000');
  fails := fails || pg_temp.t19_is('2e owner session fee', pg_temp.t19_push(kop,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 'pay-owner', 'd',
      '{"memberId":"m-new","amountP":20000,"voided":false,"receiptNo":"R-2","collectedBy":"anyone"}'::jsonb || jsonb_build_object('membershipId', 'ms-ten', 'paidOn', to_char(td, 'YYYY-MM-DD'))))), 'ok');
  fails := fails || pg_temp.t19_is('2f names the owner', (select data->>'collectedByName' from public.crm_records
    where gym_id = gid and kind = 'payment' and id = 'pay-owner'), 'Owner Om');
  fails := fails || pg_temp.t19_is('2g old owner key fee', pg_temp.t19_push(ko,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 'pay-key', 'd',
      '{"memberId":"m-new","amountP":10000,"voided":false,"receiptNo":"R-3","collectedBy":null}'::jsonb || jsonb_build_object('membershipId', 'ms-ten', 'paidOn', to_char(td, 'YYYY-MM-DD'))))), 'ok');
  fails := fails || pg_temp.t19_is('2h old key leaves it as written', (select coalesce(data->>'collectedBy', 'none') from public.crm_records
    where gym_id = gid and kind = 'payment' and id = 'pay-key'), 'none');
  fails := fails || pg_temp.t19_is('2i imported receipt', pg_temp.t19_push(kop,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 'pay-imp', 'd',
      '{"memberId":"m-new","amountP":10000,"voided":false,"receiptNo":"R-4","collectedBy":null,"importId":"import-t19"}'::jsonb || jsonb_build_object('membershipId', 'ms-ten', 'paidOn', to_char(td, 'YYYY-MM-DD'))))), 'ok');
  fails := fails || pg_temp.t19_is('2j imported receipt names nobody', (select coalesce(data->>'collectedBy', 'none') from public.crm_records
    where gym_id = gid and kind = 'payment' and id = 'pay-imp'), 'none');
  fails := fails || pg_temp.t19_is('2k the plan the desk sold names the desk', (select data->>'soldByName' from public.crm_records
    where gym_id = gid and kind = 'membership' and id = 'ms-ten'), 'Desk Ramesh');
  -- Voiding later (the owner) never changes who took it, even when the device's copy says otherwise.
  select data into d from public.crm_records where gym_id = gid and kind = 'payment' and id = 'pay-desk';
  fails := fails || pg_temp.t19_is('2l owner voids the desk receipt', pg_temp.t19_push(kop,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 'pay-desk', 'd', d || '{"voided":true,"voidReason":"typo","collectedByName":"Someone else"}'))), 'ok');
  fails := fails || pg_temp.t19_is('2m still names the desk', (select data->>'collectedByName' from public.crm_records
    where gym_id = gid and kind = 'payment' and id = 'pay-desk'), 'Desk Ramesh');
  -- Review: moving a browser gym online (the owner's session copies old records up with no taker)
  -- never names the owner on them.
  fails := fails || pg_temp.t19_is('2n owner uploads an old receipt', pg_temp.t19_push(kop,
    jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 'pay-old', 'd',
      '{"memberId":"m-new","membershipId":"ms-ten","amountP":15000,"voided":false,"receiptNo":"2025-26/0007","collectedBy":null}'::jsonb
      || jsonb_build_object('paidOn', to_char(td - 200, 'YYYY-MM-DD'))))), 'ok');
  fails := fails || pg_temp.t19_is('2o old receipt names nobody', (select coalesce(data->>'collectedBy', 'none') from public.crm_records
    where gym_id = gid and kind = 'payment' and id = 'pay-old'), 'none');
  fails := fails || pg_temp.t19_is('2p owner uploads an old sale', pg_temp.t19_push(kop,
    jsonb_build_array(jsonb_build_object('k', 'membership', 'id', 'ms-old2', 'd', sale || '{"memberId":"m-old","soldBy":null}'))), 'ok');
  fails := fails || pg_temp.t19_is('2q old sale names nobody', (select coalesce(data->>'soldBy', 'none') from public.crm_records
    where gym_id = gid and kind = 'membership' and id = 'ms-old2'), 'none');
  -- Review: a desk receipt with an import mark is still stamped with the desk.
  fails := fails || pg_temp.t19_is('2r desk receipt with an import mark', pg_temp.t19_push(ks,
    format('[{"k":"payment","id":"pay-desk-imp","d":{"memberId":"m-new","membershipId":"ms-ten","paidOn":"%s","amountP":5000,"voided":false,"receiptNo":"IMP/1","importId":"import-desk","collectedBy":"%s","collectedByName":"Owner Om"}}]',
           to_char(td, 'YYYY-MM-DD'), s_owner)::jsonb), 'ok');
  fails := fails || pg_temp.t19_is('2s names the desk', (select data->>'collectedByName' from public.crm_records
    where gym_id = gid and kind = 'payment' and id = 'pay-desk-imp'), 'Desk Ramesh');
  checks := checks + 19;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
