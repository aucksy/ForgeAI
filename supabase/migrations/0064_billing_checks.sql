-- (NOT APPLIED) - needs the owner's yes (paste into the Supabase SQL Editor after 0063).
-- 0064: billing gaps (docs/overhaul/BILLING-DESIGN.md "Gaps closed", 6 Nov 2026). ADDITIVE and re-runnable:
-- four new columns on gym_checkouts (0063), new hq_* functions, and hq_mettleup_payments (0060) again with the
-- free-trial rule of 0063. Test: supabase/tests/0064_billing_checks.sql (CI runs it after every migration).
--
-- 1. PAYMENTS TO CHECK. A payment the company took that could not become a plan (the amount was not what we
--    asked for, or the gym changed in between, e.g. went lifetime) is kept by hq_billing_paid (0063) as a
--    checkout with status 'mismatch' or 'failed'. HQ now lists them ("Payments to check") and marks each one
--    either REFUNDED (money sent back through the payment company) or APPLIED BY HAND (HQ set the plan itself,
--    e.g. with "Set plan"). Each mark writes one hq_audit row (_hq_log) with a reason, and the row leaves the
--    "to check" list. Nothing here moves money or changes a plan: HQ does that in the company's dashboard or
--    with the existing plan tools; this only records that it was done.
--      hq_billing_checks(actor, which)          which: open (default) | done | all  -> [rows]   (audit: view_billing_checks)
--      hq_billing_checks_waiting(actor)         how many are open: a count for "Needs you" (no audit row)
--      hq_billing_check_done(actor, checkout, how, note)  how: refunded | applied_by_hand; note: at least 3
--                                               letters (the refund id, what was set). Errors: GONE,
--                                               NOT_TO_CHECK, ALREADY_DONE, INVALID, NEED_REASON, NO_ACTOR.
--
-- 2. NIGHTLY RECONCILIATION (deploy/hq/billing.js runBillingReconcile, its own Cron Trigger; off unless the
--    Worker's BILLING var is set): the Worker asks the payment company about every link we opened in the
--    last 48 hours that is still 'open' here, and any the company says is paid goes through hq_billing_paid,
--    the same single path as the webhook (a payment the webhook already applied is a harmless duplicate).
--      hq_billing_open_links(provider, now, hours)  -> [{checkoutId, linkId, ref, amountPaise, currency, createdAt}]
--                                                     oldest first, at most 100.
--
-- 3. HQ's manual-payment list (hq_mettleup_payments, 0060) shows the same "paid until" Confirm will set,
--    counting the rest of a running free trial (0063 _paid_from), and the gym's trial end.
--
-- Undo: drop function public.hq_billing_checks(text, text), public.hq_billing_checks_waiting(text),
--   public.hq_billing_check_done(text, uuid, text, text), public.hq_billing_open_links(text, timestamptz, int),
--   public._billing_check_json(public.gym_checkouts);
--   alter table public.gym_checkouts drop column checked_at, drop column checked_by, drop column checked_how,
--   drop column checked_note; re-run 0060's hq_mettleup_payments.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ HQ's mark on a payment to check
alter table public.gym_checkouts add column if not exists checked_at   timestamptz;
alter table public.gym_checkouts add column if not exists checked_by   text;
alter table public.gym_checkouts add column if not exists checked_how  text;
alter table public.gym_checkouts add column if not exists checked_note text;
alter table public.gym_checkouts drop constraint if exists gym_checkouts_checked_how_check;
alter table public.gym_checkouts add constraint gym_checkouts_checked_how_check
  check (checked_how is null or checked_how in ('refunded', 'applied_by_hand'));
alter table public.gym_checkouts drop constraint if exists gym_checkouts_checked_note_check;
alter table public.gym_checkouts add constraint gym_checkouts_checked_note_check
  check (checked_note is null or length(checked_note) <= 500);
create index if not exists gym_checkouts_to_check on public.gym_checkouts(paid_at) where status in ('mismatch', 'failed');
-- The nightly reconciliation's read: open links by company and age.
create index if not exists gym_checkouts_open on public.gym_checkouts(provider, created_at) where status = 'open';

-- One payment to check, as HQ reads it. reason: AMOUNT_MISMATCH, or the refusal that stopped it (LIFETIME, ...).
create or replace function public._billing_check_json(c public.gym_checkouts) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.checkout_id, 'gymId', c.gym_id, 'gymName', g.name, 'gymCode', g.join_code,
    'provider', c.provider, 'paymentId', c.payment_id, 'linkId', c.link_id,
    'paidPaise', c.paid_amount_paise, 'paidCurrency', c.paid_currency, 'askedPaise', c.amount_paise,
    'plan', c.plan, 'billing', c.billing, 'kind', c.kind, 'status', c.status,
    'reason', coalesce(substring(coalesce(c.note, '') from '^[A-Z_]+'), upper(c.status)),
    'paidAt', c.paid_at, 'checkedAt', c.checked_at, 'checkedBy', c.checked_by, 'checkedHow', c.checked_how,
    'checkedNote', c.checked_note)
  from (select 1) one left join public.gyms g on g.gym_id = c.gym_id
$$;

create or replace function public.hq_billing_checks(p_actor text, p_which text default 'open')
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare w text := coalesce(nullif(btrim(coalesce(p_which, '')), ''), 'open'); out jsonb;
begin
  perform public._hq_guard();
  if w not in ('open', 'done', 'all') then raise exception 'INVALID'; end if;
  select coalesce(jsonb_agg(public._billing_check_json(c) order by c.paid_at desc nulls last), '[]'::jsonb)
    into out
    from (select * from public.gym_checkouts x
           where x.status in ('mismatch', 'failed')
             and (w = 'all' or (w = 'open' and x.checked_at is null) or (w = 'done' and x.checked_at is not null))
           order by x.paid_at desc nulls last limit 200) c;
  perform public._hq_log(p_actor, 'view_billing_checks', null, null, jsonb_build_object('which', w, 'rows', jsonb_array_length(out)));
  return out;
end $$;

-- A count only: "Needs you" asks every minute, so no audit row.
create or replace function public.hq_billing_checks_waiting(p_actor text)
  returns int language plpgsql stable security definer set search_path = public as $$
begin
  perform public._hq_guard();
  perform public._hq_actor(p_actor);
  return (select count(*) from public.gym_checkouts where status in ('mismatch', 'failed') and checked_at is null);
end $$;

create or replace function public.hq_billing_check_done(p_actor text, p_checkout uuid, p_how text, p_note text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare c public.gym_checkouts; how_done text := lower(btrim(coalesce(p_how, ''))); why text; who text;
begin
  perform public._hq_guard();
  if how_done not in ('refunded', 'applied_by_hand') then raise exception 'INVALID'; end if;
  select * into c from public.gym_checkouts where checkout_id = p_checkout for update;
  if c.checkout_id is null then raise exception 'GONE'; end if;
  if c.status not in ('mismatch', 'failed') then raise exception 'NOT_TO_CHECK'; end if;
  if c.checked_at is not null then raise exception 'ALREADY_DONE'; end if;
  why := public._hq_reason(p_note);
  who := public._hq_log(p_actor, case how_done when 'refunded' then 'billing_refunded' else 'billing_applied_by_hand' end,
    c.gym_id, why,
    jsonb_build_object('checkoutId', c.checkout_id, 'provider', c.provider, 'paymentId', c.payment_id,
                       'paidPaise', c.paid_amount_paise, 'askedPaise', c.amount_paise, 'status', c.status,
                       'reason', coalesce(substring(coalesce(c.note, '') from '^[A-Z_]+'), upper(c.status))));
  update public.gym_checkouts set checked_at = now(), checked_by = who, checked_how = how_done, checked_note = why
   where checkout_id = c.checkout_id returning * into c;
  return public._billing_check_json(c);
end $$;

-- ------------------------------------------------------------------ the nightly reconciliation's list
create or replace function public.hq_billing_open_links(p_provider text, p_now timestamptz default now(), p_hours int default 48)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare hrs int := least(greatest(coalesce(p_hours, 48), 1), 168);
begin
  perform public._hq_guard();
  if p_provider is null or p_provider not in ('razorpay', 'cashfree') then raise exception 'BAD_PROVIDER'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('checkoutId', c.checkout_id, 'linkId', c.link_id, 'ref', c.our_ref,
                                                       'amountPaise', c.amount_paise, 'currency', c.currency,
                                                       'createdAt', c.created_at) order by c.created_at)
                     from (select * from public.gym_checkouts x
                            where x.provider = p_provider and x.status = 'open' and x.link_id is not null
                              and x.created_at > p_now - make_interval(hours => hrs) and x.created_at <= p_now
                            order by x.created_at limit 100) c), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------ 0060's list, with the free-trial rule (0063)
create or replace function public.hq_mettleup_payments(p_actor text, p_status text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare s text := coalesce(nullif(p_status, ''), 'pending'); out jsonb;
begin
  perform public._hq_guard();
  if s not in ('pending', 'confirmed', 'rejected', 'all') then raise exception 'INVALID'; end if;
  select coalesce(jsonb_agg(public._mettleup_payment_json(p) || jsonb_build_object(
           'gymId', g.gym_id, 'gymName', g.name, 'gymCode', g.join_code,
           'gymPlan', g.plan, 'gymBilling', g.billing, 'gymPaidUntil', g.paid_until, 'gymTrialEndsAt', g.trial_ends_at,
           'extendsTo', case when p.status = 'pending' and g.billing is distinct from 'lifetime'
                             then public._mettleup_extend(public._paid_from(g.paid_until, g.trial_ends_at, now()), p.billing, now()) end)
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

-- ------------------------------------------------------------------ grants (service_role only)
revoke all on function public._billing_check_json(public.gym_checkouts)              from public, anon, authenticated;
revoke all on function public.hq_billing_checks(text, text)                          from public, anon, authenticated;
revoke all on function public.hq_billing_checks_waiting(text)                        from public, anon, authenticated;
revoke all on function public.hq_billing_check_done(text, uuid, text, text)          from public, anon, authenticated;
revoke all on function public.hq_billing_open_links(text, timestamptz, int)          from public, anon, authenticated;
revoke all on function public.hq_mettleup_payments(text, text)                       from public, anon, authenticated;
grant execute on function public.hq_billing_checks(text, text)                       to service_role;
grant execute on function public.hq_billing_checks_waiting(text)                     to service_role;
grant execute on function public.hq_billing_check_done(text, uuid, text, text)       to service_role;
grant execute on function public.hq_billing_open_links(text, timestamptz, int)       to service_role;
grant execute on function public.hq_mettleup_payments(text, text)                    to service_role;

notify pgrst, 'reload schema';
