-- (NOT APPLIED) - needs the owner's yes (paste into the Supabase SQL Editor after 0059).
-- 0060: T79 "Pay MettleUp" (owner request R-380/R-381, 6 Nov 2026). ADDITIVE and re-runnable: three new
-- tables, private helpers, apply_gym_payment, two owner_* functions and six hq_* functions. Changes no existing function,
-- table or row. Test: supabase/tests/0060_pay_mettleup.sql.
--
-- WHAT IT DOES. A gym owner pays MettleUp for a plan from the admin app (Settings -> Pay MettleUp): UPI
-- (a QR code built in the browser) or a bank transfer (NEFT), then sends the reference number (UTR) and
-- the amount. That is a PENDING payment. MettleUp HQ checks it against the bank and either CONFIRMS it
-- (the gym's plan, billing and paid_until are set: one month or twelve months on from the later of today
-- and the current paid_until) or REJECTS it with a reason the owner reads. No money moves through the
-- database; nothing is locked when a payment is late (0030's rule still holds).
--
-- THE PAYMENT DETAILS (UPI ID, payee name, bank account, IFSC) ARE NEVER IN THIS REPOSITORY. The code is
-- public. This migration makes the table EMPTY; HQ fills it from its own form (hq_set_payment_details),
-- or the owner inserts the row live in the SQL Editor. Only a gym OWNER's key reads it
-- (owner_pay_mettleup); no app can read the table itself (RLS on, every privilege revoked). With no row
-- the admin app says "payment is not available yet" and shows no QR code.
--
-- PRICES (the approved list, OWNER-INBOX #30 A, 30 Oct 2026; the landing page's pricing): Starter Rs 999 a
-- month or Rs 9,990 a year; Pro Rs 1,499 a month or Rs 14,990 a year. Pro + AI is not on sale yet (sold
-- once the AI parts are built), so it cannot be paid here. The admin app's copy: apps/dashboard/src/crm/
-- logic/payMettleUp.ts PRICES. One branch: a gym with more branches messages MettleUp for its total.
--
-- 3 tables: platform_payment_details (MettleUp's details, one row), mettleup_payments (what owners sent),
-- gym_payment_ledger (every payment applied to a plan, from any source).
--
-- OWNER SIDE (each checks the key; owner only, a front-desk key gets OWNER_ONLY):
--   owner_pay_mettleup(key)          -> {payTo|null, gymName, gymCode, plan, billing, paidUntil, trialEndsAt,
--                                        payments: the gym's last 20}
--   owner_report_mettleup_payment(key, plan, billing, amount_paise, reference, method)
--                                     -> the new pending payment. Errors: BAD_PLAN, BAD_INPUT, BAD_REFERENCE,
--                                        BAD_AMOUNT, NOT_OPEN (no payment details yet), TOO_MANY (3 waiting),
--                                        DUPLICATE_REFERENCE (that reference is already sent, not rejected).
-- HQ SIDE (service_role only through the HQ Worker; each writes one hq_audit row, except the count):
--   hq_mettleup_payments(actor, status)         pending (oldest first) / confirmed / rejected / all (newest first)
--   hq_mettleup_payments_waiting(actor)         how many are pending: a count only, for "Needs you" (asked
--                                               every minute, so it writes no audit row; it opens nothing)
--   hq_confirm_mettleup_payment(actor, payment, note)   errors: GONE, NOT_PENDING, LIFETIME, BAD_DATE, ALREADY_APPLIED.
--                                               It applies the payment through apply_gym_payment (source 'manual').
-- THE ONE WAY A PAYMENT BECOMES A PLAN (service_role only): apply_gym_payment(gym, plan, billing, source,
--   reference, amount_paise, actor) sets plan + paid_until and writes a gym_payment_ledger row, unique on
--   (source, reference). HQ's Confirm uses source 'manual'; a future payment-company webhook (fully automatic
--   buying, being designed) calls the same function with its own source, so a payment is never applied twice.
--   No feature is switched on or off by plan here (another design covers that).
--   hq_reject_mettleup_payment(actor, payment, reason)  errors: GONE, NOT_PENDING, NEED_REASON
--   hq_payment_details(actor)                    the saved details, for HQ's form
--   hq_set_payment_details(actor, upi, payee, account_name, account_number, ifsc, bank_name)
--                                               errors: BAD_UPI, BAD_NAME, BAD_ACCOUNT, BAD_IFSC, INCOMPLETE.
--                                               All empty clears them (the admin app then says "not available").
--
-- Undo: drop function public.owner_pay_mettleup(text), public.apply_gym_payment(uuid, text, text, text, text, int, text),
--   public.owner_report_mettleup_payment(text, text, text, int, text, text),
--   public.hq_mettleup_payments(text, text), public.hq_mettleup_payments_waiting(text),
--   public.hq_confirm_mettleup_payment(text, uuid, text), public.hq_reject_mettleup_payment(text, uuid, text),
--   public.hq_payment_details(text), public.hq_set_payment_details(text, text, text, text, text, text, text),
--   public._mettleup_price(text, text), public._mettleup_extend(timestamptz, text, timestamptz),
--   public._mettleup_payment_json(public.mettleup_payments), public._pay_details_json(public.platform_payment_details);
--   drop table public.mettleup_payments, public.gym_payment_ledger, public.platform_payment_details;

set lock_timeout = '3s';

-- ------------------------------------------------------------------ tables (no app reads them directly)
-- One row at most (id = 1). Empty here: the real values are put in live, never in git.
create table if not exists public.platform_payment_details (
  id             smallint primary key default 1 check (id = 1),
  upi_id         text check (upi_id is null or upi_id ~ '^[a-z0-9._-]{2,255}@[a-z][a-z0-9.-]{1,63}$'),
  payee_name     text check (payee_name is null or length(payee_name) between 2 and 60),
  account_name   text check (account_name is null or length(account_name) between 2 and 80),
  account_number text check (account_number is null or account_number ~ '^[0-9]{6,20}$'),
  ifsc           text check (ifsc is null or ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_name      text check (bank_name is null or length(bank_name) between 2 and 60),
  updated_at     timestamptz not null default now(),
  updated_by     text
);
alter table public.platform_payment_details enable row level security;
revoke all on public.platform_payment_details from public, anon, authenticated;

create table if not exists public.mettleup_payments (
  payment_id    uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(gym_id) on delete cascade,
  plan          text not null check (plan in ('starter', 'pro')),
  billing       text not null check (billing in ('monthly', 'yearly')),
  price_paise   int  not null check (price_paise > 0),        -- the price of that plan when it was sent
  amount_paise  int  not null check (amount_paise between 100 and 10000000),  -- what the owner says was paid
  reference     text not null check (reference ~ '^[A-Z0-9]{6,30}$'),       -- UPI or bank reference (UTR)
  method        text not null check (method in ('upi', 'bank')),
  status        text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  reported_at   timestamptz not null default clock_timestamp(),  -- two sent in one transaction keep their order
  reported_by   text,                                         -- the owner's name (an old owner key: null)
  decided_at    timestamptz,
  decided_by    text,                                         -- the HQ person's email
  reject_reason text check (reject_reason is null or length(reject_reason) <= 500),
  paid_until    timestamptz                                   -- set on confirm: the gym's new paid-until
);
create index if not exists mettleup_payments_gym on public.mettleup_payments(gym_id, reported_at desc);
create index if not exists mettleup_payments_status on public.mettleup_payments(status, reported_at);
-- One reference is one payment (a rejected one may be sent again, corrected).
create unique index if not exists mettleup_payments_ref on public.mettleup_payments(reference) where status <> 'rejected';
alter table public.mettleup_payments enable row level security;
revoke all on public.mettleup_payments from public, anon, authenticated;

-- ------------------------------------------------------------------ helpers (no grants)
-- The approved price in paise; null for anything not on sale here. PURE.
create or replace function public._mettleup_price(p_plan text, p_billing text) returns int
  language sql immutable set search_path = public as $$
  select case coalesce(p_plan, '') || '/' || coalesce(p_billing, '')
    when 'starter/monthly' then 99900
    when 'starter/yearly'  then 999000
    when 'pro/monthly'     then 149900
    when 'pro/yearly'      then 1499000
  end
$$;

-- The new paid-until after a confirmed payment: from the LATER of today and the current paid-until (India
-- days), one month or twelve months on (31 Jan + 1 month = 28/29 Feb), to the end of that India day.
-- The HQ page shows the same date before the tap (apps/hq/public/logic.js extendPaidUntil). PURE.
create or replace function public._mettleup_extend(p_paid_until timestamptz, p_billing text, p_now timestamptz)
  returns timestamptz language sql immutable set search_path = public as $$
  select (((greatest((p_now at time zone 'Asia/Kolkata')::date,
                     coalesce((p_paid_until at time zone 'Asia/Kolkata')::date, (p_now at time zone 'Asia/Kolkata')::date))
            + case when p_billing = 'yearly' then interval '12 months' else interval '1 month' end)::date
           + time '23:59:59') at time zone 'Asia/Kolkata')
$$;

create or replace function public._mettleup_payment_json(p public.mettleup_payments) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', p.payment_id, 'plan', p.plan, 'billing', p.billing, 'pricePaise', p.price_paise,
    'amountPaise', p.amount_paise, 'reference', p.reference, 'method', p.method, 'status', p.status,
    'reportedAt', p.reported_at, 'decidedAt', p.decided_at, 'rejectReason', p.reject_reason, 'paidUntil', p.paid_until)
$$;

-- The details as the admin app reads them; null when nothing usable is saved (neither UPI nor a bank account).
create or replace function public._pay_details_json(d public.platform_payment_details) returns jsonb
  language sql stable set search_path = public as $$
  select case when d.id is null or (d.upi_id is null and d.account_number is null) then null
    else jsonb_build_object('upiId', d.upi_id, 'payeeName', d.payee_name, 'accountName', d.account_name,
                            'accountNumber', d.account_number, 'ifsc', d.ifsc, 'bankName', d.bank_name) end
$$;

-- ------------------------------------------------------------------ the gym owner's side
create or replace function public.owner_pay_mettleup(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);
  d public.platform_payment_details;
  x public.gyms;
begin
  select * into d from public.platform_payment_details where id = 1;
  select * into x from public.gyms where gym_id = g;
  return jsonb_build_object(
    'ok', true,
    'payTo', public._pay_details_json(d),
    'gymName', x.name, 'gymCode', x.join_code,
    'plan', x.plan, 'billing', x.billing, 'paidUntil', x.paid_until, 'trialEndsAt', x.trial_ends_at,
    'payments', coalesce((select jsonb_agg(public._mettleup_payment_json(p) order by p.reported_at desc)
                            from (select * from public.mettleup_payments where gym_id = g
                                   order by reported_at desc limit 20) p), '[]'::jsonb));
end $$;

create or replace function public.owner_report_mettleup_payment(p_key text, p_plan text, p_billing text,
    p_amount_paise int, p_reference text, p_method text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  ref text := upper(regexp_replace(coalesce(p_reference, ''), '[[:space:]-]', '', 'g'));
  price int := public._mettleup_price(p_plan, p_billing);
  r public.mettleup_payments;
begin
  if price is null then raise exception 'BAD_PLAN'; end if;
  if p_method is null or p_method not in ('upi', 'bank') then raise exception 'BAD_INPUT'; end if;
  if ref !~ '^[A-Z0-9]{6,30}$' then raise exception 'BAD_REFERENCE'; end if;
  if p_amount_paise is null or p_amount_paise < 100 or p_amount_paise > 10000000 then raise exception 'BAD_AMOUNT'; end if;
  if public._pay_details_json((select d from public.platform_payment_details d where d.id = 1)) is null then
    raise exception 'NOT_OPEN';
  end if;
  -- The gym's row lock: two tabs sending at once never pass the count together.
  perform 1 from public.gyms where gym_id = g for update;
  if (select count(*) from public.mettleup_payments where gym_id = g and status = 'pending') >= 3 then
    raise exception 'TOO_MANY';
  end if;
  if exists (select 1 from public.mettleup_payments where reference = ref and status <> 'rejected') then
    raise exception 'DUPLICATE_REFERENCE';
  end if;
  insert into public.mettleup_payments(gym_id, plan, billing, price_paise, amount_paise, reference, method, reported_by)
    values (g, p_plan, p_billing, price, p_amount_paise, ref, p_method, left(st.name, 80))
    returning * into r;
  return public._mettleup_payment_json(r);
end $$;

-- ------------------------------------------------------------------ HQ (service_role only)
create or replace function public.hq_mettleup_payments(p_actor text, p_status text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare s text := coalesce(nullif(p_status, ''), 'pending'); out jsonb;
begin
  perform public._hq_guard();
  if s not in ('pending', 'confirmed', 'rejected', 'all') then raise exception 'INVALID'; end if;
  select coalesce(jsonb_agg(public._mettleup_payment_json(p) || jsonb_build_object(
           'gymId', g.gym_id, 'gymName', g.name, 'gymCode', g.join_code,
           'gymPlan', g.plan, 'gymBilling', g.billing, 'gymPaidUntil', g.paid_until,
           'extendsTo', case when p.status = 'pending' and g.billing is distinct from 'lifetime'
                             then public._mettleup_extend(g.paid_until, p.billing, now()) end)
         order by case when s = 'pending' then extract(epoch from p.reported_at) else -extract(epoch from p.reported_at) end),
         '[]'::jsonb)
    into out
    from (select * from public.mettleup_payments m
           where s = 'all' or m.status = s
           order by case when s = 'pending' then m.reported_at end asc, m.reported_at desc
           limit 200) p
    join public.gyms g on g.gym_id = p.gym_id;
  perform public._hq_log(p_actor, 'view_payments', null, null, jsonb_build_object('status', s, 'rows', jsonb_array_length(out)));
  return out;
end $$;

-- A count only (no gym, no reference, no amount): "Needs you" asks every minute, so no audit row.
create or replace function public.hq_mettleup_payments_waiting(p_actor text)
  returns int language plpgsql stable security definer set search_path = public as $$
begin
  perform public._hq_guard();
  perform public._hq_actor(p_actor);
  return (select count(*) from public.mettleup_payments where status = 'pending');
end $$;

-- ------------------------------------------------------------------ THE ONE WAY A PAYMENT TURNS INTO A PLAN
-- apply_gym_payment is the ONLY function that sets a gym's plan + paid_until from a payment, and it writes
-- one gym_payment_ledger row each time. HQ's "Confirm" calls it with source 'manual' (UPI / bank transfer,
-- checked by hand). A payment company's webhook (planned: fully automatic buying) will call the same
-- function through its own server-side Worker with source 'razorpay' (or the company's name) and the
-- company's payment id as the reference. The ledger is UNIQUE on (source, reference), so the same payment
-- can never be applied twice (a webhook sent twice gets ALREADY_APPLIED and changes nothing).
-- service_role only. Errors: GONE (no gym), BAD_PLAN, BAD_SOURCE, BAD_REFERENCE, BAD_AMOUNT, LIFETIME (a
-- lifetime gym pays nothing more), BAD_DATE (more than 3 years ahead), ALREADY_APPLIED.
-- -> {ledgerId, gymId, plan, billing, paidUntilBefore, paidUntil}
create table if not exists public.gym_payment_ledger (
  ledger_id         uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references public.gyms(gym_id) on delete cascade,
  plan              text not null check (plan in ('starter', 'pro', 'ai')),
  billing           text not null check (billing in ('monthly', 'yearly')),
  source            text not null check (source ~ '^[a-z][a-z0-9_]{1,30}$'),   -- 'manual', 'razorpay', ...
  reference         text not null check (length(reference) between 3 and 100),
  amount_paise      int  not null check (amount_paise between 100 and 10000000),
  paid_until_before timestamptz,
  paid_until        timestamptz not null,
  applied_at        timestamptz not null default clock_timestamp(),
  applied_by        text,                                                   -- HQ email, or null for a webhook
  unique (source, reference)
);
create index if not exists gym_payment_ledger_gym on public.gym_payment_ledger(gym_id, applied_at desc);
alter table public.gym_payment_ledger enable row level security;
revoke all on public.gym_payment_ledger from public, anon, authenticated;

alter table public.mettleup_payments add column if not exists ledger_id uuid references public.gym_payment_ledger(ledger_id);

create or replace function public.apply_gym_payment(p_gym uuid, p_plan text, p_billing text, p_source text,
    p_reference text, p_amount_paise int, p_actor text default null)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g public.gyms; pu timestamptz; lid uuid; ref text := btrim(coalesce(p_reference, ''));
begin
  perform public._hq_guard();  -- never from an app (anon / signed-in): the grants say so too
  if p_plan is null or p_plan not in ('starter', 'pro', 'ai') or p_billing is null or p_billing not in ('monthly', 'yearly') then
    raise exception 'BAD_PLAN';
  end if;
  if p_source is null or p_source !~ '^[a-z][a-z0-9_]{1,30}$' then raise exception 'BAD_SOURCE'; end if;
  if length(ref) not between 3 and 100 then raise exception 'BAD_REFERENCE'; end if;
  if p_amount_paise is null or p_amount_paise < 100 or p_amount_paise > 10000000 then raise exception 'BAD_AMOUNT'; end if;
  select * into g from public.gyms where gym_id = p_gym for update;
  if g.gym_id is null then raise exception 'GONE'; end if;
  if exists (select 1 from public.gym_payment_ledger where source = p_source and reference = ref) then
    raise exception 'ALREADY_APPLIED';
  end if;
  if g.billing = 'lifetime' then raise exception 'LIFETIME'; end if;
  pu := public._mettleup_extend(g.paid_until, p_billing, now());
  if pu > now() + interval '3 years' then raise exception 'BAD_DATE'; end if;
  insert into public.gym_payment_ledger(gym_id, plan, billing, source, reference, amount_paise, paid_until_before, paid_until, applied_by)
    values (p_gym, p_plan, p_billing, p_source, ref, p_amount_paise, g.paid_until, pu, nullif(btrim(coalesce(p_actor, '')), ''))
    returning ledger_id into lid;
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set plan = p_plan, billing = p_billing, paid_until = pu where gym_id = p_gym;
  perform set_config('forgeai.hq', 'off', true);  -- only for this one write
  return jsonb_build_object('ledgerId', lid, 'gymId', p_gym, 'plan', p_plan, 'billing', p_billing,
                            'paidUntilBefore', g.paid_until, 'paidUntil', pu);
end $$;

-- HQ's "Confirm": checks the pending payment, writes the audit row, and applies it through apply_gym_payment
-- (source 'manual', the UPI / bank reference).
create or replace function public.hq_confirm_mettleup_payment(p_actor text, p_payment uuid, p_note text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p public.mettleup_payments; g public.gyms; a text; applied jsonb;
begin
  perform public._hq_guard();
  select * into p from public.mettleup_payments where payment_id = p_payment for update;
  if p.payment_id is null then raise exception 'GONE'; end if;
  if p.status <> 'pending' then raise exception 'NOT_PENDING'; end if;
  select * into g from public.gyms where gym_id = p.gym_id;
  a := public._hq_actor(p_actor);
  applied := public.apply_gym_payment(p.gym_id, p.plan, p.billing, 'manual', p.reference, p.amount_paise, a);
  perform public._hq_log(a, 'confirm_payment', p.gym_id, nullif(left(btrim(coalesce(p_note, '')), 500), ''),
    jsonb_build_object('paymentId', p.payment_id, 'ledgerId', applied->'ledgerId', 'plan', p.plan, 'billing', p.billing,
                       'amountPaise', p.amount_paise, 'reference', p.reference,
                       'from', jsonb_build_object('plan', g.plan, 'billing', g.billing, 'paidUntil', g.paid_until),
                       'to', jsonb_build_object('plan', p.plan, 'billing', p.billing, 'paidUntil', applied->'paidUntil')));
  update public.mettleup_payments
     set status = 'confirmed', decided_at = now(), decided_by = a,
         paid_until = (applied->>'paidUntil')::timestamptz, ledger_id = (applied->>'ledgerId')::uuid
   where payment_id = p.payment_id returning * into p;
  return public._mettleup_payment_json(p);
end $$;

create or replace function public.hq_reject_mettleup_payment(p_actor text, p_payment uuid, p_reason text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p public.mettleup_payments; why text; a text;
begin
  perform public._hq_guard();
  select * into p from public.mettleup_payments where payment_id = p_payment for update;
  if p.payment_id is null then raise exception 'GONE'; end if;
  if p.status <> 'pending' then raise exception 'NOT_PENDING'; end if;
  why := public._hq_reason(p_reason);
  a := public._hq_log(p_actor, 'reject_payment', p.gym_id, why,
    jsonb_build_object('paymentId', p.payment_id, 'amountPaise', p.amount_paise, 'reference', p.reference));
  update public.mettleup_payments set status = 'rejected', decided_at = now(), decided_by = a, reject_reason = why
   where payment_id = p.payment_id returning * into p;
  return public._mettleup_payment_json(p);
end $$;

create or replace function public.hq_payment_details(p_actor text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare d public.platform_payment_details;
begin
  perform public._hq_guard();
  select * into d from public.platform_payment_details where id = 1;
  perform public._hq_log(p_actor, 'view_pay_details', null, null, '{}'::jsonb);
  return jsonb_build_object('details', public._pay_details_json(d), 'updatedAt', d.updated_at, 'updatedBy', d.updated_by);
end $$;

-- Empty boxes are cleared. A bank account needs its name and IFSC; a UPI ID needs the payee name.
-- The audit row says WHICH parts are set, never the values.
create or replace function public.hq_set_payment_details(p_actor text, p_upi_id text, p_payee_name text,
    p_account_name text, p_account_number text, p_ifsc text, p_bank_name text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  upi text := nullif(lower(regexp_replace(coalesce(p_upi_id, ''), '[[:space:]]', '', 'g')), '');
  payee text := nullif(btrim(regexp_replace(coalesce(p_payee_name, ''), '[[:space:]]+', ' ', 'g')), '');
  aname text := nullif(btrim(regexp_replace(coalesce(p_account_name, ''), '[[:space:]]+', ' ', 'g')), '');
  acc text := nullif(regexp_replace(coalesce(p_account_number, ''), '[[:space:]-]', '', 'g'), '');
  ifsc text := nullif(upper(regexp_replace(coalesce(p_ifsc, ''), '[[:space:]]', '', 'g')), '');
  bank text := nullif(btrim(regexp_replace(coalesce(p_bank_name, ''), '[[:space:]]+', ' ', 'g')), '');
  a text;
begin
  perform public._hq_guard();
  if upi is not null and upi !~ '^[a-z0-9._-]{2,255}@[a-z][a-z0-9.-]{1,63}$' then raise exception 'BAD_UPI'; end if;
  if (payee is not null and length(payee) not between 2 and 60) or (aname is not null and length(aname) not between 2 and 80)
     or (bank is not null and length(bank) not between 2 and 60) then
    raise exception 'BAD_NAME';
  end if;
  if acc is not null and acc !~ '^[0-9]{6,20}$' then raise exception 'BAD_ACCOUNT'; end if;
  if ifsc is not null and ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' then raise exception 'BAD_IFSC'; end if;
  if (upi is not null and payee is null) or (acc is not null and (aname is null or ifsc is null))
     or (acc is null and (ifsc is not null)) then
    raise exception 'INCOMPLETE';
  end if;
  a := public._hq_log(p_actor, 'set_pay_details', null, null,
    jsonb_build_object('upi', upi is not null, 'bank', acc is not null));
  insert into public.platform_payment_details(id, upi_id, payee_name, account_name, account_number, ifsc, bank_name, updated_at, updated_by)
    values (1, upi, payee, aname, acc, ifsc, bank, now(), a)
    on conflict (id) do update set upi_id = excluded.upi_id, payee_name = excluded.payee_name,
      account_name = excluded.account_name, account_number = excluded.account_number, ifsc = excluded.ifsc,
      bank_name = excluded.bank_name, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return jsonb_build_object('details', public._pay_details_json((select d from public.platform_payment_details d where d.id = 1)));
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._mettleup_price(text, text)                                   from public, anon, authenticated;
revoke all on function public._mettleup_extend(timestamptz, text, timestamptz)               from public, anon, authenticated;
revoke all on function public._mettleup_payment_json(public.mettleup_payments)               from public, anon, authenticated;
revoke all on function public._pay_details_json(public.platform_payment_details)             from public, anon, authenticated;
revoke all on function public.owner_pay_mettleup(text)                                       from public;
revoke all on function public.owner_report_mettleup_payment(text, text, text, int, text, text) from public;
grant execute on function public.owner_pay_mettleup(text)                                    to anon, authenticated;
grant execute on function public.owner_report_mettleup_payment(text, text, text, int, text, text) to anon, authenticated;
revoke all on function public.hq_mettleup_payments(text, text)                               from public, anon, authenticated;
revoke all on function public.hq_mettleup_payments_waiting(text)                             from public, anon, authenticated;
revoke all on function public.hq_confirm_mettleup_payment(text, uuid, text)                  from public, anon, authenticated;
revoke all on function public.hq_reject_mettleup_payment(text, uuid, text)                   from public, anon, authenticated;
revoke all on function public.hq_payment_details(text)                                       from public, anon, authenticated;
revoke all on function public.hq_set_payment_details(text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.apply_gym_payment(uuid, text, text, text, text, int, text)          from public, anon, authenticated;
grant execute on function public.apply_gym_payment(uuid, text, text, text, text, int, text)       to service_role;
grant execute on function public.hq_mettleup_payments(text, text)                            to service_role;
grant execute on function public.hq_mettleup_payments_waiting(text)                          to service_role;
grant execute on function public.hq_confirm_mettleup_payment(text, uuid, text)               to service_role;
grant execute on function public.hq_reject_mettleup_payment(text, uuid, text)                to service_role;
grant execute on function public.hq_payment_details(text)                                    to service_role;
grant execute on function public.hq_set_payment_details(text, text, text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
