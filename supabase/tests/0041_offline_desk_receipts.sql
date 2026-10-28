-- 0041: a receipt printed offline from a desk's own series is never refused as "more than owed"
-- (offline front desk #7, 29 Oct 2026). Runs in CI after every migration (scripts/ci/db_checks.sh);
-- can also be pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)" - every rule held;
--   "RESULT FAIL: ..."       - the checks that failed (label:what came back).

-- One receipt through the server's receipt rules: 'ok', or the refusal it raised.
create or replace function pg_temp.t41_ok(p_gym uuid, p_id text, p_data jsonb, p_staff boolean) returns text
  language plpgsql as $$
begin
  perform public._receipt_ok(p_gym, p_id, p_data, p_staff);
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t41_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $t41$
declare
  gid uuid; g2 uuid;
  td date := (now() at time zone 'Asia/Kolkata')::date;
  day text;
  fails text := ''; checks int := 0;
  r jsonb;
begin
  day := to_char(td, 'YYYY-MM-DD');
  insert into public.gyms(name, join_code) values ('T41 Gym', 'T41GYA') returning gym_id into gid;
  insert into public.gyms(name, join_code) values ('T41 Other Gym', 'T41GYB') returning gym_id into g2;

  -- Asha's plan: Rs 1,500. Desk D1 of this gym claimed its series; D2 never did. The other gym's D3 did.
  -- Another desk already took Rs 1,000 for it (2026-27/0001).
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 'm1', '{"fullName":"Asha","phone":"9811410001"}', 1),
    (gid, 'membership', 'ms1', jsonb_build_object('memberId', 'm1', 'planId', 'pl', 'priceP', 150000, 'joiningFeeP', 0,
       'startsOn', day, 'endsOn', to_char(td + 29, 'YYYY-MM-DD'), 'cancelled', false), 1),
    (gid, 'payment', 'p0', jsonb_build_object('memberId', 'm1', 'membershipId', 'ms1', 'amountP', 100000, 'method', 'cash',
       'paidOn', day, 'receiptNo', '2026-27/0001', 'voided', false), 1),
    (gid, 'enquiry', 'deskseries-1', '{"id":"deskseries-1","deskSeries":1,"deviceId":"dev-a","claimedAt":1}', 1),
    (g2, 'enquiry', 'deskseries-3', '{"id":"deskseries-3","deskSeries":3,"deviceId":"dev-c","claimedAt":1}', 1);

  -- Desk D1 was offline and also took Rs 1,000 for the same plan: Rs 500 more than it still owed.
  r := jsonb_build_object('memberId', 'm1', 'membershipId', 'ms1', 'amountP', 100000, 'method', 'cash', 'paidOn', day,
         'receiptNo', '2026-27/D1-0001', 'voided', false, 'offline', true);

  -- 1. The printed offline receipt is taken as written (desk and owner).
  fails := fails || pg_temp.t41_is('1a desk offline over the due', pg_temp.t41_ok(gid, 'd1', r, true), 'ok');
  fails := fails || pg_temp.t41_is('1b owner offline over the due', pg_temp.t41_ok(gid, 'd1', r, false), 'ok');
  fails := fails || pg_temp.t41_is('1c branch spelling', pg_temp.t41_ok(gid, 'd1b', r || '{"receiptNo":"B2/26-27/D1-0002"}', true), 'ok');
  fails := fails || pg_temp.t41_is('1d short-year spelling', pg_temp.t41_ok(gid, 'd1c', r || '{"receiptNo":"26/D1-0003"}', true), 'ok');
  checks := checks + 4;

  -- 2. Anything else is still held to what is owed.
  fails := fails || pg_temp.t41_is('2a not marked offline', pg_temp.t41_ok(gid, 'd2', r - 'offline', true), 'OVER_DUE');
  fails := fails || pg_temp.t41_is('2b offline false', pg_temp.t41_ok(gid, 'd2', r || '{"offline":false}', true), 'OVER_DUE');
  fails := fails || pg_temp.t41_is('2c normal series marked offline', pg_temp.t41_ok(gid, 'd2', r || '{"receiptNo":"2026-27/0002"}', true), 'OVER_DUE');
  fails := fails || pg_temp.t41_is('2d desk never claimed', pg_temp.t41_ok(gid, 'd2', r || '{"receiptNo":"2026-27/D2-0001"}', true), 'OVER_DUE');
  fails := fails || pg_temp.t41_is('2e another gym''s desk', pg_temp.t41_ok(gid, 'd2', r || '{"receiptNo":"2026-27/D3-0001"}', true), 'OVER_DUE');
  fails := fails || pg_temp.t41_is('2f series in the middle', pg_temp.t41_ok(gid, 'd2', r || '{"receiptNo":"D1-0001/2026"}', true), 'OVER_DUE');
  checks := checks + 6;

  -- 3. The other rules of 0021 still hold for an offline receipt.
  insert into public.crm_records(gym_id, kind, id, data, version) values (gid, 'payment', 'd-saved', r, 2);
  fails := fails || pg_temp.t41_is('3a same number twice', pg_temp.t41_ok(gid, 'd3', r, true), 'DUP_RECEIPT');
  fails := fails || pg_temp.t41_is('3b a resend', pg_temp.t41_ok(gid, 'd-saved', r, true), 'ok');
  fails := fails || pg_temp.t41_is('3c a saved one is never edited', pg_temp.t41_ok(gid, 'd-saved', r || '{"amountP":1}', false), 'RECEIPT_LOCKED');
  fails := fails || pg_temp.t41_is('3d desk 32 days back', pg_temp.t41_ok(gid, 'd3', r || jsonb_build_object('receiptNo', '2026-27/D1-0009',
    'paidOn', to_char(td - 32, 'YYYY-MM-DD')), true), 'TOO_OLD');
  fails := fails || pg_temp.t41_is('3e tomorrow', pg_temp.t41_ok(gid, 'd3', r || jsonb_build_object('receiptNo', '2026-27/D1-0009',
    'paidOn', to_char(td + 1, 'YYYY-MM-DD')), true), 'BAD_DATE');
  fails := fails || pg_temp.t41_is('3f zero', pg_temp.t41_ok(gid, 'd3', r || '{"receiptNo":"2026-27/D1-0009","amountP":0}', true), 'BAD_AMOUNT');
  fails := fails || pg_temp.t41_is('3g another member''s plan', pg_temp.t41_ok(gid, 'd3', r || '{"receiptNo":"2026-27/D1-0009","memberId":"m9"}', true), 'WRONG_PLAN');
  fails := fails || pg_temp.t41_is('3h 17 characters', pg_temp.t41_ok(gid, 'd3', r || '{"receiptNo":"ABCD/2026-27/D1-0"}', true), 'BAD_RECEIPT_NO');
  checks := checks + 8;

  if fails = '' then
    raise exception 'RESULT PASS (% checks)', checks;
  end if;
  raise exception 'RESULT FAIL:%', fails;
end $t41$;
