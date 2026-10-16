-- The receipt rules, the receipt history and the two access fixes of 0021 (UAT work package 3,
-- 17 Oct 2026; Audit/uat/MONEY-ACCESS.md). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an
-- error, so it changes nothing and leaves no rows:
--   "RESULT PASS (n checks)"  — every rule held;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

-- One push on the gym's current version: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t21_push(p_key text, p_rows jsonb) returns text
  language plpgsql as $$
declare v bigint;
begin
  select crm_version into v from public.gyms where gym_id = public._owner_gym(p_key);
  perform public.crm_push(p_key, v, p_rows);
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- One row for a push.
create or replace function pg_temp.t21_row(p_kind text, p_id text, p_data jsonb) returns jsonb
  language sql as $$
  select jsonb_build_array(jsonb_build_object('k', p_kind, 'id', p_id, 'd', p_data))
$$;

-- Any statement: 'ok' or the error it raised.
create or replace function pg_temp.t21_try(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t21_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $t21$
declare
  gid uuid; g2 uuid; s_owner uuid; s_desk uuid;
  ko text := 't21-owner'; kd text := 't21-desk'; kk text := 't21-old-owner-key';
  td date := (now() at time zone 'Asia/Kolkata')::date;
  day text;
  fails text := ''; checks int := 0;
  r0 jsonb; d jsonb; h record; n int; v bigint; i int; res jsonb;
begin
  day := to_char(td, 'YYYY-MM-DD');
  -- ---------------------------------------------------------------- a gym with an owner, a desk and an old owner key
  insert into public.gyms(name, join_code) values ('T21 Gym', 'T21GYA') returning gym_id into gid;
  insert into public.gyms(name, join_code) values ('T21 Other Gym', 'T21GYB') returning gym_id into g2;
  insert into public.gym_owner_keys(gym_id, key_hash) values (gid, public._hash_key(kk));
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner Om', '9811210011', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Desk Ramesh', '9811210012', 'staff') returning staff_id into s_desk;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(ko)), (s_desk, public._hash_key(kd));

  -- m1 owes on ms1: Rs 1,000 + Rs 500 joining fee. m1 also has a big plan for old receipts.
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'plan', 'pl', '{"name":"Monthly","durationUnit":"month","durationCount":1,"priceP":100000,"joiningFeeP":50000}', 1),
    (gid, 'plan', 'pl-odd', '{"name":"Old odd price","durationUnit":"month","durationCount":1,"priceP":100.5}', 1),
    (gid, 'member', 'm1', '{"fullName":"Asha","phone":"9811210001"}', 1),
    (gid, 'member', 'm2', '{"fullName":"Bina","phone":"9811210002"}', 1),
    (gid, 'membership', 'ms1', jsonb_build_object('memberId', 'm1', 'planId', 'pl', 'priceP', 100000, 'joiningFeeP', 50000,
       'startsOn', to_char(td - 5, 'YYYY-MM-DD'), 'endsOn', to_char(td + 24, 'YYYY-MM-DD'), 'cancelled', false), 1),
    (gid, 'membership', 'ms-big', jsonb_build_object('memberId', 'm1', 'planId', 'pl', 'priceP', 10000000, 'joiningFeeP', 0,
       'startsOn', to_char(td - 500, 'YYYY-MM-DD'), 'endsOn', to_char(td - 135, 'YYYY-MM-DD'), 'cancelled', false), 1),
    (gid, 'membership', 'ms-gone', jsonb_build_object('memberId', 'm1', 'planId', 'pl', 'priceP', 100000,
       'startsOn', day, 'endsOn', day, 'cancelled', false, 'importId', 'imp-21'), 1),
    (gid, 'membership', 'ms2', jsonb_build_object('memberId', 'm2', 'planId', 'pl', 'priceP', 100000, 'joiningFeeP', 0,
       'startsOn', day, 'endsOn', to_char(td + 29, 'YYYY-MM-DD'), 'cancelled', false), 1);
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (g2, 'membership', 'ms-g2', jsonb_build_object('memberId', 'm1', 'planId', 'pl', 'priceP', 100000, 'startsOn', day, 'endsOn', day, 'cancelled', false), 1);
  update public.crm_records set deleted = true where gym_id = gid and id = 'ms-gone';
  update public.gyms set crm_version = 1 where gym_id = gid;

  r0 := jsonb_build_object('memberId', 'm1', 'membershipId', 'ms1', 'amountP', 10000, 'method', 'cash', 'paidOn', day,
          'receiptNo', '2026-27/0001', 'reference', null, 'voided', false, 'voidReason', null, 'createdAt', 1);

  -- ================================================================ 1. dates (F-02)
  fails := fails || pg_temp.t21_is('1a desk today', pg_temp.t21_push(kd, pg_temp.t21_row('payment', 'd-today', r0)), 'ok');
  fails := fails || pg_temp.t21_is('1b desk 31 days back', pg_temp.t21_push(kd, pg_temp.t21_row('payment', 'd-31',
    r0 || jsonb_build_object('receiptNo', '2026-27/0002', 'paidOn', to_char(td - 31, 'YYYY-MM-DD')))), 'ok');
  fails := fails || pg_temp.t21_is('1c desk 32 days back', pg_temp.t21_push(kd, pg_temp.t21_row('payment', 'd-32',
    r0 || jsonb_build_object('receiptNo', '2026-27/0003', 'paidOn', to_char(td - 32, 'YYYY-MM-DD')))), 'TOO_OLD');
  fails := fails || pg_temp.t21_is('1d desk tomorrow', pg_temp.t21_push(kd, pg_temp.t21_row('payment', 'd-tmw',
    r0 || jsonb_build_object('receiptNo', '2026-27/0003', 'paidOn', to_char(td + 1, 'YYYY-MM-DD')))), 'BAD_DATE');
  fails := fails || pg_temp.t21_is('1e owner 400 days back', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-400',
    r0 || jsonb_build_object('membershipId', 'ms-big', 'receiptNo', '2025-26/0001', 'paidOn', to_char(td - 400, 'YYYY-MM-DD')))), 'ok');
  fails := fails || pg_temp.t21_is('1f owner tomorrow', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-tmw',
    r0 || jsonb_build_object('receiptNo', '2026-27/0003', 'paidOn', to_char(td + 1, 'YYYY-MM-DD')))), 'BAD_DATE');
  fails := fails || pg_temp.t21_is('1g no date', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-nodate',
    (r0 - 'paidOn') || '{"receiptNo":"2026-27/0003"}')), 'BAD_DATE');
  fails := fails || pg_temp.t21_is('1h not a real day', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-feb30',
    r0 || '{"receiptNo":"2026-27/0003","paidOn":"2026-02-30"}')), 'BAD_DATE');
  checks := checks + 8;

  -- ================================================================ 2. amounts and numbers (F-04, F-05, F-11)
  fails := fails || pg_temp.t21_is('2a owner zero', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-zero', r0 || '{"receiptNo":"X-1","amountP":0}')), 'BAD_AMOUNT');
  fails := fails || pg_temp.t21_is('2b owner no amount', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-none', (r0 - 'amountP') || '{"receiptNo":"X-1"}')), 'BAD_AMOUNT');
  fails := fails || pg_temp.t21_is('2c old owner key minus', pg_temp.t21_push(kk, pg_temp.t21_row('payment', 'k-neg', r0 || '{"receiptNo":"X-1","amountP":-1}')), 'BAD_AMOUNT');
  fails := fails || pg_temp.t21_is('2d 17-character number', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-long', r0 || '{"receiptNo":"IMP/2026-27/10000"}')), 'BAD_RECEIPT_NO');
  fails := fails || pg_temp.t21_is('2e 16-character number', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-16', r0 || '{"receiptNo":"IMP/2026-27/9999","membershipId":"ms-big"}')), 'ok');
  fails := fails || pg_temp.t21_is('2f no number', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-nono', r0 || '{"receiptNo":"  "}')), 'BAD_RECEIPT_NO');
  fails := fails || pg_temp.t21_is('2g owner reuses a number', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-dup', r0)), 'DUP_RECEIPT');
  fails := fails || pg_temp.t21_is('2h same number twice in one push', pg_temp.t21_push(ko, jsonb_build_array(
    jsonb_build_object('k', 'payment', 'id', 'o-twin1', 'd', r0 || '{"receiptNo":"X-9","amountP":100}'),
    jsonb_build_object('k', 'payment', 'id', 'o-twin2', 'd', r0 || '{"receiptNo":"X-9","amountP":100}'))), 'DUP_RECEIPT');
  checks := checks + 8;

  -- ================================================================ 3. the membership (F-08) and what it owes (F-01)
  -- ms1 owes Rs 1,500; d-today and d-31 took Rs 200, so Rs 1,300 is left.
  fails := fails || pg_temp.t21_is('3a another member''s plan', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-other', r0 || '{"receiptNo":"X-2","membershipId":"ms2"}')), 'WRONG_PLAN');
  fails := fails || pg_temp.t21_is('3b no plan', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-noplan', (r0 - 'membershipId') || '{"receiptNo":"X-2"}')), 'WRONG_PLAN');
  fails := fails || pg_temp.t21_is('3c an undone plan', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-gone', r0 || '{"receiptNo":"X-2","membershipId":"ms-gone"}')), 'WRONG_PLAN');
  fails := fails || pg_temp.t21_is('3d another gym''s plan', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-g2', r0 || '{"receiptNo":"X-2","membershipId":"ms-g2"}')), 'WRONG_PLAN');
  fails := fails || pg_temp.t21_is('3e 1 paisa over what is left', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-over', r0 || '{"receiptNo":"X-2","amountP":130001}')), 'OVER_DUE');
  fails := fails || pg_temp.t21_is('3f exactly what is left', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-exact', r0 || '{"receiptNo":"X-3","amountP":130000}')), 'ok');
  fails := fails || pg_temp.t21_is('3g nothing left: 1 paisa', pg_temp.t21_push(kd, pg_temp.t21_row('payment', 'd-more', r0 || '{"receiptNo":"X-4","amountP":1}')), 'OVER_DUE');
  -- A cancelled receipt stops counting: its money is owed again.
  select data into d from public.crm_records where gym_id = gid and kind = 'payment' and id = 'o-exact';
  fails := fails || pg_temp.t21_is('3h owner cancels it', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-exact', d || '{"voided":true,"voidReason":"wrong amount"}')), 'ok');
  fails := fails || pg_temp.t21_is('3i its money is due again', pg_temp.t21_push(kd, pg_temp.t21_row('payment', 'd-again', r0 || '{"receiptNo":"X-5","amountP":130000}')), 'ok');
  -- An owner's imported receipt is history: not held to the due. The desk's is.
  fails := fails || pg_temp.t21_is('3j owner import over the due', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'o-imp',
    r0 || '{"receiptNo":"IMP/2026-27/0001","amountP":999900,"importId":"imp-21"}')), 'ok');
  fails := fails || pg_temp.t21_is('3k desk import over the due', pg_temp.t21_push(kd, pg_temp.t21_row('payment', 'd-imp',
    r0 || '{"receiptNo":"IMP/2026-27/0002","amountP":999900,"importId":"imp-21"}')), 'OVER_DUE');
  -- A sale and its receipt in one push (the panel's Sell sheet): the full total is fine, 1 paisa more is not.
  fails := fails || pg_temp.t21_is('3l sale + full receipt', pg_temp.t21_push(kd, jsonb_build_array(
    jsonb_build_object('k', 'membership', 'id', 'ms-new', 'd', jsonb_build_object('memberId', 'm2', 'planId', 'pl', 'priceP', 100000,
      'joiningFeeP', 0, 'startsOn', to_char(td + 30, 'YYYY-MM-DD'), 'endsOn', to_char(public._plan_end(td + 30, 'month', 1), 'YYYY-MM-DD'), 'cancelled', false)),
    jsonb_build_object('k', 'payment', 'id', 'd-sale', 'd', r0 || '{"memberId":"m2","membershipId":"ms-new","receiptNo":"X-6","amountP":100000}'))), 'ok');
  fails := fails || pg_temp.t21_is('3m sale + 1 paisa more', pg_temp.t21_push(kd, jsonb_build_array(
    jsonb_build_object('k', 'membership', 'id', 'ms-new2', 'd', jsonb_build_object('memberId', 'm2', 'planId', 'pl', 'priceP', 100000,
      'joiningFeeP', 0, 'startsOn', to_char(td + 61, 'YYYY-MM-DD'), 'endsOn', to_char(public._plan_end(td + 61, 'month', 1), 'YYYY-MM-DD'), 'cancelled', false)),
    jsonb_build_object('k', 'payment', 'id', 'd-sale2', 'd', r0 || '{"memberId":"m2","membershipId":"ms-new2","receiptNo":"X-7","amountP":100001}'))), 'OVER_DUE');
  fails := fails || pg_temp.t21_is('3n nothing of the refused push kept', (select count(*) from public.crm_records where gym_id = gid and id in ('ms-new2', 'd-sale2'))::text, '0');
  checks := checks + 14;

  -- ================================================================ 4. a saved receipt is never edited (F-03, F-06)
  select data into d from public.crm_records where gym_id = gid and kind = 'payment' and id = 'd-today';
  fails := fails || pg_temp.t21_is('4a owner lowers it', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'd-today', d || '{"amountP":1}')), 'RECEIPT_LOCKED');
  fails := fails || pg_temp.t21_is('4b owner moves it', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'd-today', d || '{"memberId":"m2","membershipId":"ms2"}')), 'RECEIPT_LOCKED');
  fails := fails || pg_temp.t21_is('4c owner renumbers it', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'd-today', d || '{"receiptNo":"Z-1"}')), 'RECEIPT_LOCKED');
  fails := fails || pg_temp.t21_is('4d owner redates it', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'd-today', d || jsonb_build_object('paidOn', to_char(td - 1, 'YYYY-MM-DD')))), 'RECEIPT_LOCKED');
  fails := fails || pg_temp.t21_is('4e old owner key changes the method', pg_temp.t21_push(kk, pg_temp.t21_row('payment', 'd-today', d || '{"method":"upi"}')), 'RECEIPT_LOCKED');
  fails := fails || pg_temp.t21_is('4f cancel and change the amount', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'd-today', d || '{"voided":true,"voidReason":"typo","amountP":1}')), 'RECEIPT_LOCKED');
  fails := fails || pg_temp.t21_is('4g cancel, no reason', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'd-today', d || '{"voided":true}')), 'NEED_REASON');
  fails := fails || pg_temp.t21_is('4h cancel, 2 letters', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'd-today', d || '{"voided":true,"voidReason":"  ab  "}')), 'NEED_REASON');
  fails := fails || pg_temp.t21_is('4i the same receipt again', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'd-today', d)), 'ok');
  fails := fails || pg_temp.t21_is('4j no history for a resend', (select count(*) from public.receipt_history where gym_id = gid and receipt_id = 'd-today')::text, '0');
  fails := fails || pg_temp.t21_is('4k cancel with a reason', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'd-today', d || '{"voided":true,"voidReason":"Taken twice"}')), 'ok');
  select data into d from public.crm_records where gym_id = gid and kind = 'payment' and id = 'd-today';
  fails := fails || pg_temp.t21_is('4l undo the cancel', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'd-today', d || '{"voided":false}')), 'RECEIPT_LOCKED');
  fails := fails || pg_temp.t21_is('4m cancel again, new reason', pg_temp.t21_push(ko, pg_temp.t21_row('payment', 'd-today', d || '{"voidReason":"Other"}')), 'RECEIPT_LOCKED');
  fails := fails || pg_temp.t21_is('4n desk still OWNER_ONLY', pg_temp.t21_push(kd, pg_temp.t21_row('payment', 'd-today', d || '{"voided":false}')), 'OWNER_ONLY');
  checks := checks + 14;

  -- ================================================================ 5. the receipt history (F-03)
  select * into h from public.receipt_history where gym_id = gid and receipt_id = 'd-today';
  fails := fails || pg_temp.t21_is('5a one row for the cancel', (select count(*) from public.receipt_history where gym_id = gid and receipt_id = 'd-today')::text, '1');
  fails := fails || pg_temp.t21_is('5b what, who, when', h.what || '|' || h.changed_by::text || '|' || h.changed_by_name || '|' || (h.changed_at is not null)::text,
    'cancelled|' || s_owner::text || '|Owner Om|true');
  fails := fails || pg_temp.t21_is('5c old and new values', (h.old_data->>'voided') || '|' || coalesce(h.old_data->>'voidReason', 'none') || '|'
    || (h.new_data->>'voided') || '|' || (h.new_data->>'voidReason') || '|' || (h.old_data->>'amountP'), 'false|none|true|Taken twice|10000');
  -- The old owner key (no person) is named as such.
  select data into d from public.crm_records where gym_id = gid and kind = 'payment' and id = 'd-31';
  perform pg_temp.t21_push(kk, pg_temp.t21_row('payment', 'd-31', d || '{"voided":true,"voidReason":"typo"}'));
  fails := fails || pg_temp.t21_is('5d the old owner key', (select coalesce(changed_by::text, 'none') || '|' || changed_by_name from public.receipt_history
    where gym_id = gid and receipt_id = 'd-31'), 'none|Owner (old owner key)');
  -- Undoing an import is a change too; so is anything done straight in the database.
  fails := fails || pg_temp.t21_is('5e owner undoes the imported receipt', pg_temp.t21_push(ko, '[{"k":"payment","id":"o-imp","d":null,"x":true}]'), 'ok');
  fails := fails || pg_temp.t21_is('5f logged as removed', (select what || '|' || old_deleted || '|' || new_deleted from public.receipt_history
    where gym_id = gid and receipt_id = 'o-imp'), 'removed|false|true');
  perform set_config('forgeai.actor_id', '', true);
  perform set_config('forgeai.actor_name', '', true);
  update public.crm_records set data = data || '{"amountP":1}' where gym_id = gid and kind = 'payment' and id = 'd-again';
  fails := fails || pg_temp.t21_is('5g a database edit is logged', (select what || '|' || changed_by_name || '|' || (old_data->>'amountP') || '|' || (new_data->>'amountP')
    from public.receipt_history where gym_id = gid and receipt_id = 'd-again'), 'changed|Database (' || session_user || ')|130000|1');
  -- Other kinds of record leave no receipt history.
  perform pg_temp.t21_push(ko, '[{"k":"member","id":"m2","d":{"fullName":"Bina B","phone":"9811210002"}}]');
  fails := fails || pg_temp.t21_is('5h members are not receipts', (select count(*) from public.receipt_history where gym_id = gid and receipt_id = 'm2')::text, '0');
  checks := checks + 8;

  -- Who may read it: the owner (session or old key) only.
  res := public.owner_receipt_history(ko);
  fails := fails || pg_temp.t21_is('5i owner reads it, newest first', jsonb_array_length(res) || '|' || (res->0->>'receiptId'), '5|d-again');
  fails := fails || pg_temp.t21_is('5j one receipt''s history', (public.owner_receipt_history(kk, 'd-today')->0->>'what'), 'cancelled');
  fails := fails || pg_temp.t21_is('5k the desk', pg_temp.t21_try(format('select public.owner_receipt_history(%L)', kd)), 'OWNER_ONLY');
  fails := fails || pg_temp.t21_is('5l no key', pg_temp.t21_try('select public.owner_receipt_history('''')'), 'BAD_KEY');
  begin
    execute 'set local role anon';
    select count(*) into n from public.receipt_history;
    reset role;
    fails := fails || ' 5m:anon read ' || n || ' history rows';
  exception when insufficient_privilege then
    reset role;  -- refused outright: right
  end;
  checks := checks + 5;

  -- ================================================================ 6. prices are whole paise (F-07)
  fails := fails || pg_temp.t21_is('6a owner plan at Rs 100.005', pg_temp.t21_push(ko, pg_temp.t21_row('plan', 'pl-frac', '{"name":"Frac","priceP":10000.5}')), 'BAD_PRICE');
  fails := fails || pg_temp.t21_is('6b owner plan, minus fee', pg_temp.t21_push(ko, pg_temp.t21_row('plan', 'pl-neg', '{"name":"Neg","priceP":100,"joiningFeeP":-1}')), 'BAD_PRICE');
  fails := fails || pg_temp.t21_is('6c owner plan, price as text', pg_temp.t21_push(ko, pg_temp.t21_row('plan', 'pl-text', '{"name":"Text","priceP":"100"}')), 'BAD_PRICE');
  fails := fails || pg_temp.t21_is('6d owner sells at a fraction', pg_temp.t21_push(ko, pg_temp.t21_row('membership', 'ms-frac',
    jsonb_build_object('memberId', 'm2', 'planId', 'pl', 'priceP', 99999.9, 'startsOn', day, 'endsOn', day, 'cancelled', false))), 'BAD_PRICE');
  fails := fails || pg_temp.t21_is('6e free plan is fine', pg_temp.t21_push(ko, pg_temp.t21_row('plan', 'pl-free', '{"name":"Free","priceP":0,"joiningFeeP":null}')), 'ok');
  -- An old row with an odd price is not blocked when the price itself is not touched.
  fails := fails || pg_temp.t21_is('6f renaming an old odd-priced plan', pg_temp.t21_push(ko, pg_temp.t21_row('plan', 'pl-odd',
    '{"name":"Old odd price, renamed","durationUnit":"month","durationCount":1,"priceP":100.5}')), 'ok');
  checks := checks + 6;

  -- ================================================================ 7. F-10: the creator's IP is private
  insert into public.gyms(name, join_code, creator_ip) values ('T21 IP Gym', 'T21GYC', '203.0.113.21') returning gym_id into g2;
  fails := fails || pg_temp.t21_is('7a not on the gyms row', coalesce((select creator_ip from public.gyms where gym_id = g2), 'none'), 'none');
  fails := fails || pg_temp.t21_is('7b kept privately', (select ip from public.gym_creator_ips where gym_id = g2), '203.0.113.21');
  update public.gyms set creator_ip = '203.0.113.22' where gym_id = g2;
  fails := fails || pg_temp.t21_is('7c an update moves too', coalesce((select creator_ip from public.gyms where gym_id = g2), 'none') || '|'
    || (select ip from public.gym_creator_ips where gym_id = g2), 'none|203.0.113.22');
  fails := fails || pg_temp.t21_is('7d no gyms row anywhere holds an IP', (select count(*) from public.gyms where creator_ip is not null)::text, '0');
  -- The per-caller limit still counts: 5 new gyms an hour from one address, then BUSY.
  perform set_config('request.headers', '{"cf-connecting-ip":"198.51.100.21"}', true);
  for i in 1..5 loop
    res := public.gym_create_online('T21 New Gym ' || i, 'Owner ' || i, '98112110' || lpad(i::text, 2, '0'));
  end loop;
  fails := fails || pg_temp.t21_is('7e five gyms counted', (select count(*) from public.gym_creator_ips where ip = '198.51.100.21')::text, '5');
  fails := fails || pg_temp.t21_is('7f the sixth is BUSY', pg_temp.t21_try('select public.gym_create_online(''T21 Sixth'', ''Owner 6'', ''9811211006'')'), 'BUSY');
  fails := fails || pg_temp.t21_is('7g their rows hold no IP', (select count(*) from public.gyms where name like 'T21 New Gym %' and creator_ip is null)::text, '5');
  perform set_config('request.headers', '', true);
  checks := checks + 7;

  -- ================================================================ 8. F-14: the dead update policy is gone
  fails := fails || pg_temp.t21_is('8a gyms_owner_update dropped',
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'gyms' and policyname = 'gyms_owner_update')::text, '0');
  fails := fails || pg_temp.t21_is('8b gyms_read kept',
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'gyms' and policyname = 'gyms_read')::text, '1');
  checks := checks + 2;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $t21$;
