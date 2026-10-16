-- UAT item 1 (17 Oct 2026): money rules the SERVER is responsible for. Runs in CI after every
-- migration (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in
-- an error, so it changes nothing:
--   "RESULT PASS (n checks; findings still open: ...)" — every rule held; the listed findings were
--                                                       re-run and still behave as written up;
--   "RESULT FAIL: ..."                                  — the checks that failed (label:what came back).
-- The rules, which layer enforces each one, and the findings: Audit/uat/MONEY-ACCESS.md.
--
-- FINDINGS ARE PROBES, NOT FAILURES. A money rule the server should enforce but does not (e.g. a
-- receipt bigger than what is owed) is run as a probe: the push is tried and then undone. "open"
-- means the server still accepts it (the finding stands); "closed" means a later migration now
-- refuses it WITH THE REFUSAL NAMED IN THE PROBE (update the write-up). A probe that fails in any
-- OTHER way is a broken test and fails the file. So CI stays green while a finding is open, and the
-- open list is printed every run.
--
-- 0021 (UAT work package 3, 17 Oct 2026) closed F-01 to F-08. Each probe now names the refusal
-- that closes it; the rules themselves are tested in 0021_receipt_rules.sql.

-- One push on the gym's current version: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.um_push(p_key text, p_rows jsonb) returns text
  language plpgsql as $$
declare v bigint;
begin
  select crm_version into v from public.gyms where gym_id = public._owner_gym(p_key);
  perform public.crm_push(p_key, v, p_rows);
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- The same push, then undone whatever happened: 'ok' (the server accepted it) or the error.
create or replace function pg_temp.um_probe(p_key text, p_rows jsonb) returns text
  language plpgsql as $$
declare res text;
begin
  begin
    res := pg_temp.um_push(p_key, p_rows);
    raise exception 'UAT_UNDO';
  exception when others then
    if sqlerrm <> 'UAT_UNDO' then res := sqlerrm; end if;
  end;
  return res;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.um_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- One row for a push.
create or replace function pg_temp.um_row(p_kind text, p_id text, p_data jsonb) returns jsonb
  language sql as $$
  select jsonb_build_array(jsonb_build_object('k', p_kind, 'id', p_id, 'd', p_data))
$$;

do $uat$
declare
  gid uuid; s_owner uuid; s_desk uuid;
  ko text := 'uat-money-owner'; kd text := 'uat-money-desk';
  td date := (now() at time zone 'Asia/Kolkata')::date;
  today_s text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  fails text := ''; checks int := 0; open_f text := ''; probes int := 0;
  pay1 jsonb; rcpt jsonb; sale jsonb; d jsonb; r text; v bigint; v2 bigint; pid uuid := gen_random_uuid(); n int;
  probe record;
begin
  -- ---------------------------------------------------------------- a gym with an owner and a desk
  insert into public.gyms(name, join_code) values ('UAT Money Gym', 'UQMNYA') returning gym_id into gid;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner Om', '9811200011', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Desk Ramesh', '9811200012', 'staff') returning staff_id into s_desk;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(ko)), (s_desk, public._hash_key(kd));

  pay1 := jsonb_build_object('memberId', 'm1', 'membershipId', 'ms1', 'amountP', 60000, 'method', 'cash', 'paidOn', today_s,
            'receiptNo', '2026-27/0001', 'reference', null, 'voided', false, 'voidReason', null, 'createdAt', 1);
  -- A new desk receipt: ₹100 on m1's plan (₹1,000, ₹600 paid, so ₹400 still due).
  rcpt := pay1 || jsonb_build_object('amountP', 10000, 'receiptNo', '2026-27/0002', 'createdAt', 2);
  sale := jsonb_build_object('memberId', 'm1', 'planId', 'pl', 'priceP', 100000, 'joiningFeeP', 0, 'listPriceP', 100000,
            'startsOn', today_s, 'endsOn', to_char(public._plan_end(td, 'month', 1), 'YYYY-MM-DD'), 'cancelled', false);

  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'plan', 'pl', '{"name":"Monthly","durationUnit":"month","durationCount":1,"priceP":100000,"joiningFeeP":50000}', 1),
    (gid, 'plan', 'pl-odd', '{"name":"Odd","durationUnit":"month","durationCount":1,"priceP":99999,"joiningFeeP":0}', 1),
    (gid, 'member', 'm1', '{"fullName":"Asha","phone":"9811200001"}', 1),
    (gid, 'member', 'm-new', '{"fullName":"New one","phone":"9811200002"}', 1),
    (gid, 'member', 'm-new2', '{"fullName":"New two","phone":"9811200003"}', 1),
    (gid, 'membership', 'ms1', jsonb_build_object('memberId', 'm1', 'planId', 'pl', 'priceP', 100000, 'joiningFeeP', 0,
       'startsOn', to_char(td - 10, 'YYYY-MM-DD'), 'endsOn', to_char(td + 19, 'YYYY-MM-DD'), 'cancelled', false), 1),
    (gid, 'membership', 'ms-imp', jsonb_build_object('memberId', 'm1', 'planId', 'pl', 'priceP', 40000, 'joiningFeeP', 0,
       'startsOn', to_char(td - 100, 'YYYY-MM-DD'), 'endsOn', to_char(td - 71, 'YYYY-MM-DD'), 'cancelled', false, 'importId', 'imp-money'), 1),
    (gid, 'payment', 'pay1', pay1, 1),
    (gid, 'payment', 'pay-imp', pay1 || '{"membershipId":"ms-imp","receiptNo":"IMP/2026-27/0001","amountP":25000,"importId":"imp-money"}', 1),
    (gid, 'payment', 'pay-imp2', pay1 || '{"membershipId":"ms-imp","receiptNo":"IMP/2026-27/0002","amountP":15000,"importId":"imp-money"}', 1);
  update public.gyms set crm_version = 1 where gym_id = gid;

  -- ================================================================ FINDINGS (probes; each undone)
  -- Run first, on the seeded gym, so every probe sees the same state.
  for probe in select * from (values
    -- F-01 (coordinator): a desk receipt MORE than the term's remaining due (₹10,000 on ₹400 due).
    ('F-01', kd, pg_temp.um_row('payment', 'p-over', rcpt || '{"amountP":1000000}'), 'OVER_DUE'),
    -- F-02: the desk dates a receipt 400 days back (last financial year) or 30 days ahead.
    ('F-02', kd, pg_temp.um_row('payment', 'p-back', rcpt || jsonb_build_object('paidOn', to_char(td - 400, 'YYYY-MM-DD'))), 'TOO_OLD'),
    ('F-02', kd, pg_temp.um_row('payment', 'p-ahead', rcpt || jsonb_build_object('paidOn', to_char(td + 30, 'YYYY-MM-DD'))), 'BAD_DATE'),
    -- F-03: the owner rewrites a saved receipt (amount, member, number). Now refused for everyone;
    -- the change log is in 0021_receipt_rules.sql.
    ('F-03', ko, pg_temp.um_row('payment', 'pay1', pay1 || '{"amountP":100}'), 'RECEIPT_LOCKED'),
    ('F-03', ko, pg_temp.um_row('payment', 'pay1', pay1 || '{"receiptNo":"2026-27/0999","memberId":"m-new"}'), 'RECEIPT_LOCKED'),
    -- F-04: an owner session's NEW receipt: minus, a fraction of a paisa, text.
    ('F-04', ko, pg_temp.um_row('payment', 'p-neg', rcpt || '{"amountP":-500}'), 'BAD_AMOUNT'),
    ('F-04', ko, pg_temp.um_row('payment', 'p-frac', rcpt || '{"amountP":100.5}'), 'BAD_AMOUNT'),
    ('F-04', ko, pg_temp.um_row('payment', 'p-text', rcpt || '{"amountP":"10000"}'), 'BAD_AMOUNT'),
    -- F-05: a second receipt with a number already used in this gym (the desk).
    ('F-05', kd, pg_temp.um_row('payment', 'p-dupno', rcpt || '{"receiptNo":"2026-27/0001"}'), 'DUP_RECEIPT'),
    -- F-06: the owner cancels a receipt with no reason.
    ('F-06', ko, pg_temp.um_row('payment', 'pay1', (pay1 - 'voidReason') || '{"voided":true}'), 'NEED_REASON'),
    -- F-07: the desk sells a plan at a fraction of a paisa.
    ('F-07', kd, pg_temp.um_row('membership', 'ms-frac', sale || '{"priceP":90000.5}'), 'BAD_PRICE'),
    -- F-08: the desk takes money against a plan that does not exist / belongs to another member.
    ('F-08', kd, pg_temp.um_row('payment', 'p-nowhere', rcpt || '{"membershipId":"no-such-plan"}'), 'WRONG_PLAN'),
    ('F-08', kd, pg_temp.um_row('payment', 'p-wrong', rcpt || '{"memberId":"m-new"}'), 'WRONG_PLAN')
    ) as t(fid, k, prow, closed_by)
  loop
    r := pg_temp.um_probe(probe.k, probe.prow);
    probes := probes + 1;
    if r = 'ok' then
      if position(probe.fid in open_f) = 0 then open_f := open_f || ' ' || probe.fid; end if;
    elsif r is distinct from probe.closed_by then
      fails := fails || ' probe ' || probe.fid || ' broke:' || r || ' (want ' || probe.closed_by || ')';
    end if;
  end loop;

  -- ================================================================ 1. a typed-in receipt is never deleted
  fails := fails || pg_temp.um_is('1a desk deletes a receipt', pg_temp.um_push(kd, '[{"k":"payment","id":"pay1","d":null,"x":true}]'), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('1b owner deletes a receipt', pg_temp.um_push(ko, '[{"k":"payment","id":"pay1","d":null,"x":true}]'), 'INVALID');
  fails := fails || pg_temp.um_is('1c still there, unchanged',
    (select (not deleted and data = pay1)::text from public.crm_records where gym_id = gid and kind = 'payment' and id = 'pay1'), 'true');
  checks := checks + 3;

  -- ================================================================ 2. the desk cannot change a saved receipt
  fails := fails || pg_temp.um_is('2a desk lowers it', pg_temp.um_push(kd, pg_temp.um_row('payment', 'pay1', pay1 || '{"amountP":100}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('2b desk raises it', pg_temp.um_push(kd, pg_temp.um_row('payment', 'pay1', pay1 || '{"amountP":600000}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('2c desk moves it to another member', pg_temp.um_push(kd, pg_temp.um_row('payment', 'pay1', pay1 || '{"memberId":"m-new"}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('2d desk moves it to another plan', pg_temp.um_push(kd, pg_temp.um_row('payment', 'pay1', pay1 || '{"membershipId":null}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('2e desk renumbers it', pg_temp.um_push(kd, pg_temp.um_row('payment', 'pay1', pay1 || '{"receiptNo":"2026-27/0099"}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('2f desk redates it', pg_temp.um_push(kd, pg_temp.um_row('payment', 'pay1', pay1 || jsonb_build_object('paidOn', to_char(td - 3, 'YYYY-MM-DD')))), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('2g desk changes the method', pg_temp.um_push(kd, pg_temp.um_row('payment', 'pay1', pay1 || '{"method":"upi"}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('2h desk cancels it (void)', pg_temp.um_push(kd, pg_temp.um_row('payment', 'pay1', pay1 || '{"voided":true,"voidReason":"x"}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('2i desk sends the same receipt again', pg_temp.um_push(kd, pg_temp.um_row('payment', 'pay1', pay1)), 'ok');
  fails := fails || pg_temp.um_is('2j receipt unchanged',
    (select (data - 'collectedBy' - 'collectedByName' = pay1)::text from public.crm_records where gym_id = gid and kind = 'payment' and id = 'pay1'), 'true');
  checks := checks + 10;

  -- ================================================================ 3. a new desk receipt is whole paise above zero
  fails := fails || pg_temp.um_is('3a desk Rs 0 receipt', pg_temp.um_push(kd, pg_temp.um_row('payment', 'n-zero', rcpt || '{"amountP":0}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('3b desk minus receipt', pg_temp.um_push(kd, pg_temp.um_row('payment', 'n-neg', rcpt || '{"amountP":-500}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('3c desk half a paisa', pg_temp.um_push(kd, pg_temp.um_row('payment', 'n-frac', rcpt || '{"amountP":100.5}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('3d desk amount as text', pg_temp.um_push(kd, pg_temp.um_row('payment', 'n-text', rcpt || '{"amountP":"10000"}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('3e desk no amount', pg_temp.um_push(kd, pg_temp.um_row('payment', 'n-none', rcpt - 'amountP')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('3f desk new receipt already cancelled', pg_temp.um_push(kd, pg_temp.um_row('payment', 'n-void', rcpt || '{"voided":true}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('3g desk Rs 100 receipt', pg_temp.um_push(kd, pg_temp.um_row('payment', 'n-ok', rcpt)), 'ok');
  select data into d from public.crm_records where gym_id = gid and kind = 'payment' and id = 'n-ok';
  fails := fails || pg_temp.um_is('3h stored as whole paise', jsonb_typeof(d->'amountP') || ':' || (d->>'amountP'), 'number:10000');
  fails := fails || pg_temp.um_is('3i names the desk as taker', d->>'collectedBy', s_desk::text);
  select count(*) into n from public.crm_records where gym_id = gid and kind = 'payment' and id like 'n-%';
  fails := fails || pg_temp.um_is('3j only the good one kept', n::text, '1');
  checks := checks + 10;

  -- ================================================================ 4. replaying a push never makes a second receipt
  select crm_version into v from public.gyms where gym_id = gid;
  v2 := public.crm_push(kd, v, pg_temp.um_row('payment', 'r-1', rcpt || '{"receiptNo":"2026-27/0003"}'), pid);
  fails := fails || pg_temp.um_is('4a first send', v2::text, (v + 1)::text);
  -- The answer was lost; the panel sends the same push (same id) on its OLD version.
  fails := fails || pg_temp.um_is('4b same push again', public.crm_push(kd, v, pg_temp.um_row('payment', 'r-1', rcpt || '{"receiptNo":"2026-27/0003"}'), pid)::text, v2::text);
  -- Same push id, other rows (a buggy resend): the server answers the first and writes nothing.
  fails := fails || pg_temp.um_is('4c same id, other rows', public.crm_push(kd, v, pg_temp.um_row('payment', 'r-2', rcpt || '{"receiptNo":"2026-27/0004"}'), pid)::text, v2::text);
  fails := fails || pg_temp.um_is('4d version moved once', (select crm_version from public.gyms where gym_id = gid)::text, v2::text);
  fails := fails || pg_temp.um_is('4e one receipt r-1, no r-2',
    (select count(*) filter (where id = 'r-1') || '/' || count(*) filter (where id = 'r-2') from public.crm_records where gym_id = gid and kind = 'payment'), '1/0');
  -- The same receipt id in a NEW push (the panel's resend after a refresh) is the same row.
  fails := fails || pg_temp.um_is('4f same receipt id, new push', pg_temp.um_push(kd, pg_temp.um_row('payment', 'r-1', rcpt || '{"receiptNo":"2026-27/0003"}')), 'ok');
  fails := fails || pg_temp.um_is('4g still one row', (select count(*) from public.crm_records where gym_id = gid and kind = 'payment' and id = 'r-1')::text, '1');
  checks := checks + 7;
  -- Two desks: a push built on an older version is refused (STALE), so two receipts can never
  -- take the same number from the same snapshot.
  begin
    perform public.crm_push(kd, v, pg_temp.um_row('payment', 'r-stale2', rcpt));
    fails := fails || ' 4h:stale push saved';
  exception when others then
    fails := fails || pg_temp.um_is('4h stale push', sqlerrm, 'STALE');
  end;
  fails := fails || pg_temp.um_is('4i nothing written', (select count(*) from public.crm_records where gym_id = gid and id = 'r-stale2')::text, '0');
  checks := checks + 2;

  -- ================================================================ 5. cancelling (void) keeps the row and its number
  select data into d from public.crm_records where gym_id = gid and kind = 'payment' and id = 'pay1';
  fails := fails || pg_temp.um_is('5a owner cancels it', pg_temp.um_push(ko, pg_temp.um_row('payment', 'pay1', d || '{"voided":true,"voidReason":"typo"}')), 'ok');
  select data into d from public.crm_records where gym_id = gid and kind = 'payment' and id = 'pay1' and not deleted;
  fails := fails || pg_temp.um_is('5b row kept with number and amount',
    d->>'voided' || '|' || (d->>'receiptNo') || '|' || (d->>'amountP') || '|' || (d->>'voidReason'), 'true|2026-27/0001|60000|typo');
  fails := fails || pg_temp.um_is('5c still pulled by the panel',
    (select (public.crm_pull(ko, 0)->'records') @> jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 'pay1')))::text, 'true');
  fails := fails || pg_temp.um_is('5d desk cannot undo the cancel', pg_temp.um_push(kd, pg_temp.um_row('payment', 'pay1', d || '{"voided":false}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('5e cancelled receipt cannot be deleted', pg_temp.um_push(ko, '[{"k":"payment","id":"pay1","d":null,"x":true}]'), 'INVALID');
  -- Who took it survives a cancel, whatever the owner's copy says (0019).
  select data into d from public.crm_records where gym_id = gid and kind = 'payment' and id = 'n-ok';
  perform pg_temp.um_push(ko, pg_temp.um_row('payment', 'n-ok', d || jsonb_build_object('voided', true, 'voidReason', 'typo', 'collectedBy', s_owner::text)));
  fails := fails || pg_temp.um_is('5f the taker survives the cancel',
    (select data->>'voided' || '|' || (data->>'collectedBy') from public.crm_records where gym_id = gid and kind = 'payment' and id = 'n-ok'),
    'true|' || s_desk::text);
  checks := checks + 6;

  -- ================================================================ 6. undo an import (receipts)
  fails := fails || pg_temp.um_is('6a desk undoes an imported receipt', pg_temp.um_push(kd, '[{"k":"payment","id":"pay-imp","d":null,"x":true}]'), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('6b owner undoes it', pg_temp.um_push(ko, '[{"k":"payment","id":"pay-imp","d":null,"x":true}]'), 'ok');
  fails := fails || pg_temp.um_is('6c row kept, marked deleted, data intact',
    (select deleted || '|' || (data->>'receiptNo') || '|' || (data->>'amountP') || '|' || (data->>'importId')
       from public.crm_records where gym_id = gid and kind = 'payment' and id = 'pay-imp'), 'true|IMP/2026-27/0001|25000|imp-money');
  fails := fails || pg_temp.um_is('6d not pulled as live',
    (select (public.crm_pull(ko, 0)->'records') @> jsonb_build_array(jsonb_build_object('k', 'payment', 'id', 'pay-imp')))::text, 'false');
  fails := fails || pg_temp.um_is('6e undone twice', pg_temp.um_push(ko, '[{"k":"payment","id":"pay-imp","d":null,"x":true}]'), 'INVALID');
  fails := fails || pg_temp.um_is('6f desk brings it back', pg_temp.um_push(kd,
    pg_temp.um_row('payment', 'pay-imp', pay1 || '{"receiptNo":"IMP/2026-27/0001","amountP":25000,"importId":"imp-money"}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('6g owner strips an import mark', pg_temp.um_push(ko,
    pg_temp.um_row('payment', 'pay-imp2', pay1 || '{"receiptNo":"IMP/2026-27/0002","amountP":15000}')), 'INVALID');
  fails := fails || pg_temp.um_is('6h owner marks a typed receipt as imported', pg_temp.um_push(ko,
    pg_temp.um_row('payment', 'n-ok', (select data from public.crm_records where gym_id = gid and kind = 'payment' and id = 'n-ok') || '{"importId":"imp-money"}')), 'INVALID');
  checks := checks + 8;

  -- ================================================================ 7. the desk's discount limit (0019)
  fails := fails || pg_temp.um_is('7a 10% off Rs 1,000 = Rs 900', pg_temp.um_push(kd, pg_temp.um_row('membership', 's-a', sale || '{"priceP":90000}')), 'ok');
  fails := fails || pg_temp.um_is('7b 1 paisa below', pg_temp.um_push(kd, pg_temp.um_row('membership', 's-b', sale || '{"priceP":89999}')), 'OWNER_ONLY');
  -- Rs 999.99: 10% rounds DOWN to Rs 99.99, so the lowest is exactly Rs 900.00.
  fails := fails || pg_temp.um_is('7c odd price, lowest', pg_temp.um_push(kd, pg_temp.um_row('membership', 's-c', sale || '{"planId":"pl-odd","priceP":90000,"listPriceP":99999}')), 'ok');
  fails := fails || pg_temp.um_is('7d odd price, 1 paisa below', pg_temp.um_push(kd, pg_temp.um_row('membership', 's-d', sale || '{"planId":"pl-odd","priceP":89999,"listPriceP":99999}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('7e minus price', pg_temp.um_push(kd, pg_temp.um_row('membership', 's-e', sale || '{"priceP":-1}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('7f price as text', pg_temp.um_push(kd, pg_temp.um_row('membership', 's-f', sale || '{"priceP":"100000"}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('7g minus joining fee', pg_temp.um_push(kd, pg_temp.um_row('membership', 's-g', sale || '{"joiningFeeP":-1}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('7h new member, fee dropped', pg_temp.um_push(kd, pg_temp.um_row('membership', 's-h', sale || '{"memberId":"m-new"}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('7i new member, fee charged', pg_temp.um_push(kd, pg_temp.um_row('membership', 's-i', sale || '{"memberId":"m-new","joiningFeeP":50000}')), 'ok');
  fails := fails || pg_temp.um_is('7j renewal skips the fee', pg_temp.um_push(kd, pg_temp.um_row('membership', 's-j', sale)), 'ok');
  fails := fails || pg_temp.um_is('7k owner sells it free', pg_temp.um_push(ko, pg_temp.um_row('membership', 's-k', sale || '{"memberId":"m-new2","priceP":0,"joiningFeeP":0}')), 'ok');
  fails := fails || pg_temp.um_is('7l desk starts 31 days back', pg_temp.um_push(kd, pg_temp.um_row('membership', 's-l', sale || jsonb_build_object(
    'startsOn', to_char(td - 31, 'YYYY-MM-DD'), 'endsOn', to_char(public._plan_end(td - 31, 'month', 1), 'YYYY-MM-DD')))), 'ok');
  fails := fails || pg_temp.um_is('7m desk starts 32 days back', pg_temp.um_push(kd, pg_temp.um_row('membership', 's-m', sale || jsonb_build_object(
    'startsOn', to_char(td - 32, 'YYYY-MM-DD'), 'endsOn', to_char(public._plan_end(td - 32, 'month', 1), 'YYYY-MM-DD')))), 'OWNER_ONLY');
  -- A saved sale's price never changes at the desk.
  select data into d from public.crm_records where gym_id = gid and kind = 'membership' and id = 's-a';
  fails := fails || pg_temp.um_is('7n desk lowers a sold price', pg_temp.um_push(kd, pg_temp.um_row('membership', 's-a', d || '{"priceP":1}')), 'OWNER_ONLY');
  fails := fails || pg_temp.um_is('7o desk adds a joining fee later', pg_temp.um_push(kd, pg_temp.um_row('membership', 's-a', d || '{"joiningFeeP":1}')), 'OWNER_ONLY');
  checks := checks + 15;

  if fails = '' then
    raise exception 'RESULT PASS (% checks, % finding probes; findings still open:%)', checks, probes,
      case when open_f = '' then ' none' else open_f end;
  end if;
  raise exception 'RESULT FAIL:%', fails;
end $uat$;
