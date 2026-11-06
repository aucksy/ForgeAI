-- (NOT APPLIED) - needs the owner's yes (paste into the Supabase SQL Editor after 0062).
-- 0063: billing step 3 (docs/overhaul/BILLING-DESIGN.md; owner R-382/R-385, 6 Nov 2026): a gym owner buys a
-- MettleUp plan online through a payment company (Razorpay or Cashfree, one at a time, TEST MODE ONLY until
-- he says "payments live"), the company's webhook makes it a plan, every payment gets a numbered receipt, and
-- the plan-end reminders. ADDITIVE and re-runnable: new tables, new functions, two app_config rows (both off
-- or empty), three relaxed checks on gym_payment_ledger (0060) and a second form of apply_gym_payment.
-- Test: supabase/tests/0063_gym_checkout.sql (CI runs it after every migration).
--
-- THE SWITCH (OFF): app_config 'billing_checkout' {"on": false}. While off, hq_billing_checkout_start
-- refuses with NOT_OPEN and owner_billing says checkoutOn false (the admin app shows no "Pay online").
-- The HQ Worker has its own switch too (var BILLING, unset = off; deploy/hq/billing.js). A payment that
-- the company already took is still applied by the webhook whatever this switch says.
--   update public.app_config set value = '{"on": true}'::jsonb, updated_at = now() where key = 'billing_checkout';
--
-- THE RECEIPT'S ISSUER: app_config 'receipt_issuer' {"legalName": null, "address": null}. The receipt says
-- "MettleUp" always; the legal owner's name (and an address, if wanted) come ONLY from this row, filled in
-- live, never from this public repository:
--   update public.app_config set value = jsonb_build_object('legalName', '<name>', 'address', null), updated_at = now()
--    where key = 'receipt_issuer';
--
-- WHAT A GYM CAN BUY (prices from _mettleup_price, 0060 = packages/theme/src/plans.ts; the browser never
-- sends a price):
--   renew     Starter or Pro, monthly or yearly: paid-until moves one month / twelve months on from the
--             later of today and the current paid-until (0060 _mettleup_extend).
--             Pro (or Pro + AI) still paid for and Starter bought: Pro stays until the paid days end, then
--             Starter starts (gym_plan_changes; hq_billing_daily switches it). No money back for the days left.
--   upgrade   Starter with paid days left and Pro asked for: Pro at once, the paid-until stays; the price is
--             the difference per day for the days left, rounded up to a whole rupee (_upgrade_paise; the
--             admin app's copy is upgradePaise in plans.ts).
--   founding  Pro for life, one payment of Rs 29,999, only while fewer than 25 gyms are on a lifetime plan
--             (gyms paid for life + founding payments in progress) and on or before 31 Mar 2027 (India).
--   Pro + AI is not for sale (BAD_PLAN). A lifetime gym buys nothing more (LIFETIME).
--
-- THE FLOW (deploy/hq/billing.js, the HQ Worker, the only place with the server key):
--   1. POST /billing/checkout {key, plan, billing}  -> hq_billing_checkout_start (checks the owner's key here)
--      -> the company's payment link for that exact amount -> hq_billing_checkout_link -> the link's address.
--   2. The company's webhook (signature checked in the Worker) -> hq_billing_order (the amount and currency
--      we asked for, checked in the Worker) -> hq_billing_paid (checks them AGAIN, then apply_gym_payment
--      exactly once). A second webhook for the same payment changes nothing ({duplicate: true}).
--   3. Every gym_payment_ledger row (online or HQ's manual confirm) gets a numbered receipt
--      (MU-<year>-0001, no gaps: the number is taken inside the same transaction).
--   4. Nightly (HQ cron): hq_billing_daily switches due downgrades and lists the gyms whose plan ends in
--      7, 3 or 1 days (each once). The admin app shows its own notice from owner_billing.
--
-- OWNER SIDE (anon key + the owner's key; a front-desk key gets OWNER_ONLY):
--   owner_billing(key)             -> {checkoutOn, plan, billing, paidUntil, daysLeft, scheduled, upgrade,
--                                      founding {open, left}, receipts}
--   owner_receipt(key, receipt_no) -> the receipt (NOT_FOUND for another gym's number)
-- HQ WORKER SIDE (service_role only):
--   hq_billing_checkout_start(key, plan, billing, provider, now) errors: BAD_KEY, OWNER_ONLY, NOT_OPEN,
--     BAD_PROVIDER, BAD_PLAN, LIFETIME, FOUNDING_CLOSED, FOUNDING_FULL, BAD_DATE, TOO_MANY
--   hq_billing_checkout_link(checkout, link_id, link_url)     errors: GONE, NOT_NEW
--   hq_billing_checkout_failed(checkout)                      (the company refused the link: frees a founding place)
--   hq_billing_order(provider, link_id)                       errors: UNKNOWN_ORDER
--   hq_billing_paid(provider, link_id, payment_id, amount_paise, currency)
--     -> {applied} | {duplicate} | {error: AMOUNT_MISMATCH | <apply_gym_payment's refusal>}; UNKNOWN_ORDER raised
--   hq_billing_daily(now)                                     -> {downgraded, reminders: [{gymId, daysBefore, paidUntil}]}
--   apply_gym_payment(gym, plan, billing, source, reference, amount_paise, actor, kind)   kind renew|founding|upgrade
--     (the 7-argument form from 0060 stays and means 'renew').
--
-- Undo: drop function public.owner_billing(text), public.owner_receipt(text, text),
--   public.hq_billing_checkout_start(text, text, text, text, timestamptz), public.hq_billing_checkout_link(uuid, text, text),
--   public.hq_billing_checkout_failed(uuid), public.hq_billing_order(text, text),
--   public.hq_billing_paid(text, text, text, int, text), public.hq_billing_daily(timestamptz),
--   public.apply_gym_payment(uuid, text, text, text, text, int, text, text), public._billing_on(),
--   public._upgrade_paise(text, timestamptz, timestamptz), public._founding_open(timestamptz),
--   public._founding_taken(timestamptz, uuid), public._days_left(timestamptz, timestamptz),
--   public._ledger_receipt() cascade, public._plan_word(text), public._receipt_json(public.gym_receipts);
--   drop table public.gym_receipts, public.receipt_counters, public.gym_checkouts, public.gym_plan_changes,
--   public.gym_billing_reminders; re-run 0060 (its apply_gym_payment and the ledger checks);
--   delete from public.app_config where key in ('billing_checkout', 'receipt_issuer').

set lock_timeout = '3s';

-- ------------------------------------------------------------------ settings rows (off / empty)
insert into public.app_config(key, value) values ('billing_checkout', '{"on": false}'::jsonb) on conflict (key) do nothing;
insert into public.app_config(key, value) values ('receipt_issuer', '{"legalName": null, "address": null}'::jsonb) on conflict (key) do nothing;

create or replace function public._billing_on() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select (value->>'on')::boolean from public.app_config where key = 'billing_checkout'), false)
$$;

-- ------------------------------------------------------------------ the ledger (0060) learns founding and upgrade
alter table public.gym_payment_ledger add column if not exists kind text not null default 'renew';
alter table public.gym_payment_ledger drop constraint if exists gym_payment_ledger_kind_check;
alter table public.gym_payment_ledger add constraint gym_payment_ledger_kind_check check (kind in ('renew', 'founding', 'upgrade'));
alter table public.gym_payment_ledger drop constraint if exists gym_payment_ledger_billing_check;
alter table public.gym_payment_ledger add constraint gym_payment_ledger_billing_check check (billing in ('monthly', 'yearly', 'lifetime'));
-- A lifetime payment has no paid-until.
alter table public.gym_payment_ledger alter column paid_until drop not null;
-- The first day this payment pays for (the receipt's "from").
alter table public.gym_payment_ledger add column if not exists period_from timestamptz;

-- A cheaper plan bought while a dearer one is still paid for: it starts on from_at (hq_billing_daily).
create table if not exists public.gym_plan_changes (
  gym_id     uuid primary key references public.gyms(gym_id) on delete cascade,
  plan       text not null check (plan in ('starter', 'pro')),
  from_at    timestamptz not null,
  ledger_id  uuid references public.gym_payment_ledger(ledger_id),
  created_at timestamptz not null default now()
);
alter table public.gym_plan_changes enable row level security;
revoke all on public.gym_plan_changes from public, anon, authenticated;

-- ------------------------------------------------------------------ checkouts (one per payment link)
create table if not exists public.gym_checkouts (
  checkout_id       uuid primary key default gen_random_uuid(),
  our_ref           text not null unique check (our_ref ~ '^mu_[a-z0-9]{10,40}$'),  -- sent to the company
  gym_id            uuid not null references public.gyms(gym_id) on delete cascade,
  kind              text not null check (kind in ('renew', 'founding', 'upgrade')),
  plan              text not null check (plan in ('starter', 'pro')),
  billing           text not null check (billing in ('monthly', 'yearly', 'lifetime')),
  amount_paise      int  not null check (amount_paise between 100 and 10000000),   -- worked out HERE, never sent by a browser
  currency          text not null default 'INR' check (currency = 'INR'),
  provider          text not null check (provider in ('razorpay', 'cashfree')),
  link_id           text check (link_id is null or length(link_id) between 3 and 100),
  link_url          text check (link_url is null or (length(link_url) <= 500 and link_url ~ '^https://[^[:space:]]+$')),
  expires_at        timestamptz not null,
  status            text not null default 'new' check (status in ('new', 'open', 'paid', 'mismatch', 'failed', 'expired')),
  created_at        timestamptz not null default clock_timestamp(),
  created_by        text,
  paid_at           timestamptz,
  payment_id        text check (payment_id is null or length(payment_id) between 3 and 100),
  paid_amount_paise int,
  paid_currency     text,
  ledger_id         uuid references public.gym_payment_ledger(ledger_id),
  note              text check (note is null or length(note) <= 200)
);
create unique index if not exists gym_checkouts_link on public.gym_checkouts(provider, link_id) where link_id is not null;
create index if not exists gym_checkouts_gym on public.gym_checkouts(gym_id, created_at desc);
create index if not exists gym_checkouts_founding on public.gym_checkouts(kind, status) where kind = 'founding';
alter table public.gym_checkouts enable row level security;
revoke all on public.gym_checkouts from public, anon, authenticated;

-- ------------------------------------------------------------------ receipts
create table if not exists public.receipt_counters (
  yr      int primary key check (yr between 2026 and 2200),
  last_no int not null check (last_no >= 0)
);
alter table public.receipt_counters enable row level security;
revoke all on public.receipt_counters from public, anon, authenticated;

create table if not exists public.gym_receipts (
  receipt_no text primary key check (receipt_no ~ '^MU-[0-9]{4}-[0-9]{4,7}$'),
  ledger_id  uuid not null unique references public.gym_payment_ledger(ledger_id) on delete cascade,
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  issued_at  timestamptz not null default clock_timestamp(),
  details    jsonb not null
);
create index if not exists gym_receipts_gym on public.gym_receipts(gym_id, issued_at desc);
alter table public.gym_receipts enable row level security;
revoke all on public.gym_receipts from public, anon, authenticated;

-- Each plan-end reminder once (per gym, per paid-until, per 7/3/1).
create table if not exists public.gym_billing_reminders (
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  paid_until  timestamptz not null,
  days_before int not null check (days_before in (7, 3, 1)),
  made_at     timestamptz not null default now(),
  primary key (gym_id, paid_until, days_before)
);
alter table public.gym_billing_reminders enable row level security;
revoke all on public.gym_billing_reminders from public, anon, authenticated;

-- ------------------------------------------------------------------ pure helpers (no grants)
create or replace function public._plan_word(p_plan text) returns text
  language sql immutable set search_path = public as $$
  select case p_plan when 'starter' then 'Starter' when 'pro' then 'Pro' when 'ai' then 'Pro + AI' else coalesce(p_plan, '') end
$$;

-- India days from today to the paid-until day, both counted (ending tonight = 1); 0 when it is over. PURE.
create or replace function public._days_left(p_paid_until timestamptz, p_now timestamptz) returns int
  language sql immutable set search_path = public as $$
  select case when p_paid_until is null or p_paid_until < p_now then 0
    else ((p_paid_until at time zone 'Asia/Kolkata')::date - (p_now at time zone 'Asia/Kolkata')::date) + 1 end
$$;

-- Starter -> Pro for the days left: the difference per day, rounded UP to a whole rupee, at least Rs 1.
-- null when nothing is left to upgrade. Same sum as upgradePaise in packages/theme/src/plans.ts. PURE.
create or replace function public._upgrade_paise(p_billing text, p_paid_until timestamptz, p_now timestamptz) returns int
  language sql immutable set search_path = public as $$
  select case when p_billing not in ('monthly', 'yearly') or public._days_left(p_paid_until, p_now) <= 0 then null
    else greatest(1, ceil(((public._mettleup_price('pro', p_billing) - public._mettleup_price('starter', p_billing))::numeric
                           * public._days_left(p_paid_until, p_now))
                          / ((case when p_billing = 'yearly' then 365 else 30 end) * 100)))::int * 100 end
$$;

-- The founding offer's last India day (plans.ts FOUNDING_OFFER.lastDay). PURE.
create or replace function public._founding_open(p_now timestamptz) returns boolean
  language sql immutable set search_path = public as $$
  select (p_now at time zone 'Asia/Kolkata')::date <= date '2027-03-31'
$$;

-- Places taken: gyms on a lifetime plan (paid online or set by HQ) + founding payments in progress
-- (a live link not yet paid) of OTHER gyms. 25 places (plans.ts FOUNDING_OFFER.gyms).
create or replace function public._founding_taken(p_now timestamptz, p_except uuid) returns int
  language sql stable security definer set search_path = public as $$
  select ((select count(*) from public.gyms where billing = 'lifetime')
        + (select count(distinct c.gym_id) from public.gym_checkouts c
            where c.kind = 'founding' and c.status in ('new', 'open') and c.expires_at > p_now
              and c.gym_id is distinct from p_except
              and not exists (select 1 from public.gyms x where x.gym_id = c.gym_id and x.billing = 'lifetime')))::int
$$;

-- ------------------------------------------------------------------ apply_gym_payment, with a kind
-- The ONE way a payment becomes a plan (0060), now also for founding (Pro for life) and upgrade (Starter to
-- Pro for the days left). Same refusals as 0060 plus BAD_KIND and NOT_UPGRADABLE. Every call writes one
-- ledger row (unique on source + reference: a payment never counts twice) and so one receipt.
create or replace function public.apply_gym_payment(p_gym uuid, p_plan text, p_billing text, p_source text,
    p_reference text, p_amount_paise int, p_actor text, p_kind text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  g public.gyms; pu timestamptz; pfrom timestamptz; lid uuid; payref text := btrim(coalesce(p_reference, ''));
  pay_kind text := coalesce(p_kind, 'renew'); new_plan text; new_billing text; later boolean := false;
begin
  perform public._hq_guard();
  if pay_kind not in ('renew', 'founding', 'upgrade') then raise exception 'BAD_KIND'; end if;
  if (pay_kind = 'renew' and (p_plan is null or p_plan not in ('starter', 'pro', 'ai') or p_billing is null or p_billing not in ('monthly', 'yearly')))
     or (pay_kind = 'founding' and (p_plan is distinct from 'pro' or p_billing is distinct from 'lifetime'))
     or (pay_kind = 'upgrade' and (p_plan is distinct from 'pro' or p_billing is null or p_billing not in ('monthly', 'yearly'))) then
    raise exception 'BAD_PLAN';
  end if;
  if p_source is null or p_source !~ '^[a-z][a-z0-9_]{1,30}$' then raise exception 'BAD_SOURCE'; end if;
  if length(payref) not between 3 and 100 then raise exception 'BAD_REFERENCE'; end if;
  if p_amount_paise is null or p_amount_paise < 100 or p_amount_paise > 10000000 then raise exception 'BAD_AMOUNT'; end if;
  select * into g from public.gyms where gym_id = p_gym for update;
  if g.gym_id is null then raise exception 'GONE'; end if;
  if exists (select 1 from public.gym_payment_ledger l where l.source = p_source and l.reference = payref) then
    raise exception 'ALREADY_APPLIED';
  end if;
  if g.billing = 'lifetime' then raise exception 'LIFETIME'; end if;

  if pay_kind = 'renew' then
    pu := public._mettleup_extend(g.paid_until, p_billing, now());
    if pu > now() + interval '3 years' then raise exception 'BAD_DATE'; end if;
    pfrom := greatest(now(), coalesce(g.paid_until, now()));
    new_plan := p_plan; new_billing := p_billing;
    -- Starter bought while Pro (or Pro + AI) is still paid for: Pro until those days end, then Starter.
    if g.plan in ('pro', 'ai') and p_plan = 'starter' and g.paid_until > now() then
      new_plan := g.plan; later := true;
    end if;
  elsif pay_kind = 'founding' then
    pu := null; pfrom := now(); new_plan := 'pro'; new_billing := 'lifetime';
  else
    -- upgrade: Pro at once for the days already paid; the paid-until does not move.
    if g.billing is null or g.billing not in ('monthly', 'yearly') then raise exception 'NOT_UPGRADABLE'; end if;
    pu := g.paid_until; pfrom := now(); new_plan := 'pro'; new_billing := g.billing;
  end if;

  insert into public.gym_payment_ledger(gym_id, plan, billing, source, reference, amount_paise, paid_until_before,
                                        paid_until, applied_by, kind, period_from)
    values (p_gym, p_plan, p_billing, p_source, payref, p_amount_paise, g.paid_until, pu,
            nullif(btrim(coalesce(p_actor, '')), ''), pay_kind, pfrom)
    returning ledger_id into lid;
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set plan = new_plan, billing = new_billing, paid_until = pu where gym_id = p_gym;
  perform set_config('forgeai.hq', 'off', true);  -- only for this one write
  if later then
    insert into public.gym_plan_changes(gym_id, plan, from_at, ledger_id) values (p_gym, 'starter', g.paid_until, lid)
      on conflict (gym_id) do update set plan = excluded.plan, from_at = excluded.from_at, ledger_id = excluded.ledger_id,
                                         created_at = now();
  else
    -- A new choice replaces a switch planned earlier.
    delete from public.gym_plan_changes where gym_id = p_gym;
  end if;
  return jsonb_build_object('ledgerId', lid, 'gymId', p_gym, 'plan', new_plan, 'billing', new_billing, 'kind', pay_kind,
                            'paidUntilBefore', g.paid_until, 'paidUntil', pu,
                            'scheduledPlan', case when later then 'starter' end,
                            'receiptNo', (select r.receipt_no from public.gym_receipts r where r.ledger_id = lid));
end $$;

-- The 0060 form (HQ's manual Confirm uses it): a renewal.
create or replace function public.apply_gym_payment(p_gym uuid, p_plan text, p_billing text, p_source text,
    p_reference text, p_amount_paise int, p_actor text default null)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  return public.apply_gym_payment(p_gym, p_plan, p_billing, p_source, p_reference, p_amount_paise, p_actor, 'renew'::text);
end $$;

-- ------------------------------------------------------------------ a receipt for every ledger row
create or replace function public._ledger_receipt() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  y_ist int := extract(year from (clock_timestamp() at time zone 'Asia/Kolkata'))::int;
  n_next int; rno text; gx public.gyms; issuer jsonb;
begin
  insert into public.receipt_counters(yr, last_no) values (y_ist, 1)
    on conflict (yr) do update set last_no = public.receipt_counters.last_no + 1
    returning last_no into n_next;
  rno := 'MU-' || y_ist::text || '-' || lpad(n_next::text, 4, '0');
  select * into gx from public.gyms where gym_id = new.gym_id;
  select value into issuer from public.app_config where key = 'receipt_issuer';
  insert into public.gym_receipts(receipt_no, ledger_id, gym_id, details) values (rno, new.ledger_id, new.gym_id,
    jsonb_build_object(
      'receiptNo', rno, 'issuedAt', clock_timestamp(),
      'business', 'MettleUp',
      'legalName', nullif(btrim(coalesce(issuer->>'legalName', '')), ''),
      'address', nullif(btrim(coalesce(issuer->>'address', '')), ''),
      'gymName', gx.name, 'gymCode', gx.join_code,
      'plan', new.plan, 'planName', public._plan_word(new.plan), 'billing', new.billing, 'kind', new.kind,
      'periodFrom', coalesce(new.period_from, new.applied_at), 'periodTo', new.paid_until,
      'amountPaise', new.amount_paise, 'currency', 'INR',
      'paidVia', case new.source when 'razorpay' then 'Razorpay' when 'cashfree' then 'Cashfree'
                                 when 'manual' then 'UPI or bank transfer' else new.source end,
      'reference', new.reference,
      'gstLine', 'Not registered under GST; no GST charged.'));
  return new;
end $$;
drop trigger if exists gym_payment_ledger_receipt on public.gym_payment_ledger;
create trigger gym_payment_ledger_receipt after insert on public.gym_payment_ledger
  for each row execute function public._ledger_receipt();

-- The receipt as the owner reads it. A legal name filled in after the receipt was made shows too.
create or replace function public._receipt_json(r public.gym_receipts) returns jsonb
  language sql stable security definer set search_path = public as $$
  select r.details || jsonb_build_object('legalName', coalesce(r.details->>'legalName',
    nullif(btrim(coalesce((select value->>'legalName' from public.app_config where key = 'receipt_issuer'), '')), '')))
$$;

-- ------------------------------------------------------------------ the owner's side
create or replace function public.owner_billing(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  gid uuid := public._owner_only_gym(p_key);
  g public.gyms; pc public.gym_plan_changes; left_days int; taken int;
begin
  select * into g from public.gyms where gym_id = gid;
  select * into pc from public.gym_plan_changes where gym_id = gid;
  left_days := case when g.billing in ('monthly', 'yearly') then public._days_left(g.paid_until, now()) end;
  taken := public._founding_taken(now(), gid);
  return jsonb_build_object(
    'checkoutOn', public._billing_on(),
    'plan', g.plan, 'billing', g.billing, 'paidUntil', g.paid_until, 'trialEndsAt', g.trial_ends_at,
    -- India days left of the paid time (ending tonight = 1; 0 = over); null for lifetime or never paid.
    'daysLeft', left_days,
    'scheduled', case when pc.gym_id is null then null else jsonb_build_object('plan', pc.plan, 'from', pc.from_at) end,
    'upgrade', case when g.plan = 'starter' and g.billing in ('monthly', 'yearly') and left_days > 0
                    then jsonb_build_object('amountPaise', public._upgrade_paise(g.billing, g.paid_until, now()), 'daysLeft', left_days) end,
    'founding', jsonb_build_object('open', public._founding_open(now()) and taken < 25 and g.billing is distinct from 'lifetime',
                                   'left', greatest(0, 25 - taken)),
    'receipts', coalesce((select jsonb_agg(jsonb_build_object('receiptNo', r.receipt_no, 'issuedAt', r.issued_at,
                                   'amountPaise', (r.details->>'amountPaise')::int, 'planName', r.details->>'planName',
                                   'billing', r.details->>'billing', 'kind', r.details->>'kind') order by r.issued_at desc)
                            from (select * from public.gym_receipts where gym_id = gid order by issued_at desc limit 50) r), '[]'::jsonb));
end $$;

create or replace function public.owner_receipt(p_key text, p_receipt_no text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare gid uuid := public._owner_only_gym(p_key); r public.gym_receipts;
begin
  select * into r from public.gym_receipts where receipt_no = upper(btrim(coalesce(p_receipt_no, ''))) and gym_id = gid;
  if r.receipt_no is null then raise exception 'NOT_FOUND'; end if;
  return public._receipt_json(r);
end $$;

-- ------------------------------------------------------------------ the HQ Worker's side (service_role only)
create or replace function public.hq_billing_checkout_start(p_key text, p_plan text, p_billing text, p_provider text,
    p_now timestamptz default now())
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  gid uuid := public._owner_only_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  g public.gyms; c public.gym_checkouts;
  pay_kind text; pay_plan text := lower(btrim(coalesce(p_plan, ''))); pay_billing text := lower(btrim(coalesce(p_billing, '')));
  amt int; what text; phone_no text; who text;
begin
  perform public._hq_guard();
  if not public._billing_on() then raise exception 'NOT_OPEN'; end if;
  if p_provider is null or p_provider not in ('razorpay', 'cashfree') then raise exception 'BAD_PROVIDER'; end if;
  select * into g from public.gyms where gym_id = gid for update;
  if g.billing = 'lifetime' then raise exception 'LIFETIME'; end if;

  if pay_billing = 'lifetime' then
    if pay_plan <> 'pro' then raise exception 'BAD_PLAN'; end if;
    if not public._founding_open(p_now) then raise exception 'FOUNDING_CLOSED'; end if;
    -- One founding place at a time, for all gyms: two gyms can never take the 25th place together.
    perform pg_advisory_xact_lock(hashtext('mettleup_founding'));
    if public._founding_taken(p_now, gid) >= 25 then raise exception 'FOUNDING_FULL'; end if;
    pay_kind := 'founding'; amt := 2999900;
    what := 'MettleUp founding gym: Pro for life, one branch';
  elsif pay_plan not in ('starter', 'pro') or pay_billing not in ('monthly', 'yearly') then
    raise exception 'BAD_PLAN';  -- Pro + AI is not for sale
  elsif g.plan = 'starter' and pay_plan = 'pro' and g.billing in ('monthly', 'yearly') and public._days_left(g.paid_until, p_now) > 0 then
    -- Starter with paid days left: Pro now, for the difference for those days (the billing stays the gym's).
    pay_kind := 'upgrade'; pay_billing := g.billing;
    amt := public._upgrade_paise(g.billing, g.paid_until, p_now);
    what := 'MettleUp Pro from Starter for ' || public._days_left(g.paid_until, p_now) || ' days left';
  else
    pay_kind := 'renew';
    amt := public._mettleup_price(pay_plan, pay_billing);
    if public._mettleup_extend(g.paid_until, pay_billing, p_now) > p_now + interval '3 years' then raise exception 'BAD_DATE'; end if;
    what := 'MettleUp ' || public._plan_word(pay_plan) || ', ' || case when pay_billing = 'yearly' then '12 months' else '1 month' end;
  end if;
  if amt is null or amt < 100 then raise exception 'BAD_PLAN'; end if;

  -- The same purchase with a live link is sent again (no second link for a double tap).
  select * into c from public.gym_checkouts x
   where x.gym_id = gid and x.kind = pay_kind and x.plan = pay_plan and x.billing = pay_billing and x.amount_paise = amt
     and x.provider = p_provider and x.status = 'open' and x.link_url is not null and x.expires_at > p_now + interval '15 minutes'
   order by x.created_at desc limit 1;
  if c.checkout_id is null then
    if (select count(*) from public.gym_checkouts x where x.gym_id = gid and x.created_at > p_now - interval '1 day') >= 20 then
      raise exception 'TOO_MANY';
    end if;
    insert into public.gym_checkouts(our_ref, gym_id, kind, plan, billing, amount_paise, provider, expires_at, created_by)
      values ('mu_' || replace(gen_random_uuid()::text, '-', ''), gid, pay_kind, pay_plan, pay_billing, amt, p_provider,
              p_now + interval '1 day', left(st.name, 80))
      returning * into c;
  end if;
  -- The payment page asks for a phone (Cashfree must have one): the owner's own.
  phone_no := coalesce(st.phone, (select s.phone from public.gym_staff s where s.gym_id = gid and s.role = 'owner'
                                   and s.removed_at is null order by s.created_at limit 1));
  who := coalesce(st.name, (select s.name from public.gym_staff s where s.gym_id = gid and s.role = 'owner'
                             and s.removed_at is null order by s.created_at limit 1), g.name);
  return jsonb_build_object('checkoutId', c.checkout_id, 'ref', c.our_ref, 'kind', c.kind, 'plan', c.plan, 'billing', c.billing,
    'amountPaise', c.amount_paise, 'currency', c.currency, 'provider', c.provider, 'expiresAt', c.expires_at,
    'description', what, 'gymName', g.name, 'gymCode', g.join_code, 'name', who, 'phone', phone_no,
    'linkUrl', c.link_url, 'reuse', c.link_url is not null);
end $$;

create or replace function public.hq_billing_checkout_link(p_checkout uuid, p_link_id text, p_link_url text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare c public.gym_checkouts;
begin
  perform public._hq_guard();
  select * into c from public.gym_checkouts where checkout_id = p_checkout for update;
  if c.checkout_id is null then raise exception 'GONE'; end if;
  if c.status <> 'new' then raise exception 'NOT_NEW'; end if;
  update public.gym_checkouts set link_id = btrim(p_link_id), link_url = btrim(p_link_url), status = 'open'
   where checkout_id = p_checkout returning * into c;
  return jsonb_build_object('checkoutId', c.checkout_id, 'linkUrl', c.link_url);
end $$;

-- The company refused to make the link: the checkout ends (a founding place is free again).
create or replace function public.hq_billing_checkout_failed(p_checkout uuid)
  returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._hq_guard();
  update public.gym_checkouts set status = 'expired', note = 'link refused' where checkout_id = p_checkout and status = 'new';
end $$;

-- What we asked for with this link (the Worker compares the webhook with it before anything else).
create or replace function public.hq_billing_order(p_provider text, p_link_id text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.gym_checkouts;
begin
  perform public._hq_guard();
  select * into c from public.gym_checkouts where provider = p_provider and link_id = btrim(coalesce(p_link_id, ''));
  if c.checkout_id is null then raise exception 'UNKNOWN_ORDER'; end if;
  return jsonb_build_object('checkoutId', c.checkout_id, 'ref', c.our_ref, 'amountPaise', c.amount_paise,
    'currency', c.currency, 'status', c.status, 'kind', c.kind, 'paymentId', c.payment_id);
end $$;

-- "Paid" from the company (signature already checked). Checks the amount and currency against the order
-- AGAIN, then applies it exactly once. A second call for the same link answers {duplicate: true}.
create or replace function public.hq_billing_paid(p_provider text, p_link_id text, p_payment_id text,
    p_amount_paise int, p_currency text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare c public.gym_checkouts; applied jsonb; pay_id text := btrim(coalesce(p_payment_id, '')); why text;
begin
  perform public._hq_guard();
  select * into c from public.gym_checkouts where provider = p_provider and link_id = btrim(coalesce(p_link_id, '')) for update;
  if c.checkout_id is null then raise exception 'UNKNOWN_ORDER'; end if;
  if c.status = 'paid' then
    return jsonb_build_object('duplicate', true, 'samePayment', c.payment_id = pay_id, 'checkoutId', c.checkout_id,
      'receiptNo', (select r.receipt_no from public.gym_receipts r where r.ledger_id = c.ledger_id));
  end if;
  if c.status in ('mismatch', 'failed') and c.payment_id = pay_id then
    return jsonb_build_object('duplicate', true, 'error', upper(coalesce(c.note, 'FAILED')), 'checkoutId', c.checkout_id);
  end if;
  if length(pay_id) not between 3 and 100 then raise exception 'BAD_REFERENCE'; end if;
  if p_amount_paise is distinct from c.amount_paise or upper(coalesce(p_currency, '')) <> c.currency then
    update public.gym_checkouts set status = 'mismatch', payment_id = pay_id, paid_amount_paise = p_amount_paise,
           paid_currency = left(upper(coalesce(p_currency, '')), 8), paid_at = now(), note = 'AMOUNT_MISMATCH'
     where checkout_id = c.checkout_id;
    return jsonb_build_object('error', 'AMOUNT_MISMATCH', 'checkoutId', c.checkout_id);
  end if;
  begin
    applied := public.apply_gym_payment(c.gym_id, c.plan, c.billing, p_provider, pay_id, c.amount_paise, null, c.kind);
  exception when others then
    why := left(sqlerrm, 60);
    if why ~ '^ALREADY_APPLIED' then
      update public.gym_checkouts set status = 'paid', payment_id = pay_id, paid_at = now(), paid_amount_paise = p_amount_paise,
             paid_currency = c.currency,
             ledger_id = (select l.ledger_id from public.gym_payment_ledger l where l.source = p_provider and l.reference = pay_id)
       where checkout_id = c.checkout_id;
      return jsonb_build_object('duplicate', true, 'checkoutId', c.checkout_id);
    end if;
    -- Money taken but it cannot become a plan (e.g. the gym went lifetime meanwhile): kept for HQ to refund.
    update public.gym_checkouts set status = 'failed', payment_id = pay_id, paid_at = now(), paid_amount_paise = p_amount_paise,
           paid_currency = c.currency, note = left(why, 200)
     where checkout_id = c.checkout_id;
    return jsonb_build_object('error', substring(why from '^[A-Z_]+'), 'checkoutId', c.checkout_id);
  end;
  update public.gym_checkouts set status = 'paid', payment_id = pay_id, paid_at = now(), paid_amount_paise = p_amount_paise,
         paid_currency = c.currency, ledger_id = (applied->>'ledgerId')::uuid
   where checkout_id = c.checkout_id;
  return applied || jsonb_build_object('applied', true, 'checkoutId', c.checkout_id);
end $$;

-- Nightly (HQ cron): (1) a Starter bought while Pro was paid for starts when the Pro days end; (2) the gyms
-- whose paid plan ends in 7, 3 or 1 India days, each listed once (the Worker sends messages when that is
-- switched on; the admin app shows its own notice from owner_billing either way).
create or replace function public.hq_billing_daily(p_now timestamptz default now())
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare moved int := 0; due jsonb;
begin
  perform public._hq_guard();
  perform set_config('forgeai.hq', 'on', true);
  with d as (delete from public.gym_plan_changes pc where pc.from_at <= p_now returning pc.gym_id, pc.plan)
  update public.gyms x set plan = d.plan from d where x.gym_id = d.gym_id and x.billing is distinct from 'lifetime';
  get diagnostics moved = row_count;
  perform set_config('forgeai.hq', 'off', true);
  with ins as (
    insert into public.gym_billing_reminders(gym_id, paid_until, days_before)
      select x.gym_id, x.paid_until, ((x.paid_until at time zone 'Asia/Kolkata')::date - (p_now at time zone 'Asia/Kolkata')::date)
        from public.gyms x
       where x.billing in ('monthly', 'yearly') and x.paid_until is not null and coalesce(x.status, 'active') = 'active'
         and ((x.paid_until at time zone 'Asia/Kolkata')::date - (p_now at time zone 'Asia/Kolkata')::date) in (7, 3, 1)
      on conflict do nothing
      returning gym_billing_reminders.gym_id, gym_billing_reminders.paid_until, gym_billing_reminders.days_before)
  select coalesce(jsonb_agg(jsonb_build_object('gymId', ins.gym_id, 'paidUntil', ins.paid_until, 'daysBefore', ins.days_before)), '[]'::jsonb)
    into due from ins;
  return jsonb_build_object('downgraded', moved, 'reminders', due);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._billing_on()                                         from public, anon, authenticated;
revoke all on function public._plan_word(text)                                      from public, anon, authenticated;
revoke all on function public._days_left(timestamptz, timestamptz)                  from public, anon, authenticated;
revoke all on function public._upgrade_paise(text, timestamptz, timestamptz)        from public, anon, authenticated;
revoke all on function public._founding_open(timestamptz)                           from public, anon, authenticated;
revoke all on function public._founding_taken(timestamptz, uuid)                    from public, anon, authenticated;
revoke all on function public._ledger_receipt()                                     from public, anon, authenticated;
revoke all on function public._receipt_json(public.gym_receipts)                    from public, anon, authenticated;
revoke all on function public.owner_billing(text)                                   from public;
revoke all on function public.owner_receipt(text, text)                             from public;
grant execute on function public.owner_billing(text)                                to anon, authenticated;
grant execute on function public.owner_receipt(text, text)                          to anon, authenticated;
revoke all on function public.apply_gym_payment(uuid, text, text, text, text, int, text, text) from public, anon, authenticated;
revoke all on function public.apply_gym_payment(uuid, text, text, text, text, int, text)       from public, anon, authenticated;
revoke all on function public.hq_billing_checkout_start(text, text, text, text, timestamptz)   from public, anon, authenticated;
revoke all on function public.hq_billing_checkout_link(uuid, text, text)                       from public, anon, authenticated;
revoke all on function public.hq_billing_checkout_failed(uuid)                                 from public, anon, authenticated;
revoke all on function public.hq_billing_order(text, text)                                     from public, anon, authenticated;
revoke all on function public.hq_billing_paid(text, text, text, int, text)                     from public, anon, authenticated;
revoke all on function public.hq_billing_daily(timestamptz)                                    from public, anon, authenticated;
grant execute on function public.apply_gym_payment(uuid, text, text, text, text, int, text, text) to service_role;
grant execute on function public.apply_gym_payment(uuid, text, text, text, text, int, text)       to service_role;
grant execute on function public.hq_billing_checkout_start(text, text, text, text, timestamptz)   to service_role;
grant execute on function public.hq_billing_checkout_link(uuid, text, text)                       to service_role;
grant execute on function public.hq_billing_checkout_failed(uuid)                                 to service_role;
grant execute on function public.hq_billing_order(text, text)                                     to service_role;
grant execute on function public.hq_billing_paid(text, text, text, int, text)                     to service_role;
grant execute on function public.hq_billing_daily(timestamptz)                                    to service_role;

notify pgrst, 'reload schema';
