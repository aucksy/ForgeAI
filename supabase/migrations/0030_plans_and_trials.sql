-- NOT APPLIED. Needs the owner's yes (R-97).
--
-- 0030: the free trial and the plan of each gym (owner request R-97, 24 Oct 2026). Re-runnable
-- (if not exists / create or replace / drop constraint if exists). Apply after 0028 (it replaces
-- two of its functions, see below). Test: supabase/tests/0030_plans_and_trials.sql (CI runs it after
-- every migration; pasted into the SQL Editor it always ends in an error and so changes nothing).
--
-- THE FREE TRIAL. Every gym gets 3 months free; ForgeAI HQ can make it longer, up to 6 months from
-- the day the trial started, never more.
--   gyms.trial_starts_at  when the trial started: the day the gym was made. Gyms that exist when
--                         this runs (the pilot gym and the test gyms) start the day it is applied.
--   gyms.trial_ends_at    3 months after that (a column default, so EVERY way a gym is made gets it:
--                         Start my gym, Start demo, the old create_gym, HQ's Make a gym).
-- NOTHING LOCKS WHEN A TRIAL ENDS. Members keep their app, the gym keeps its records; ForgeAI never
-- holds a gym's data hostage. The admin app only shows the state ("Your free trial ended on ...").
-- HQ can still pause a gym by hand, as today (0027's gyms.status, which is a different thing:
-- 'trial' there means "new, not checked by ForgeAI yet", and HQ's screens say exactly that).
--
-- THE PLAN. gyms.plan: 'starter' | 'pro' | 'ai' | null (null = still on the free trial, nothing
-- picked yet). gyms.billing: 'monthly' | 'yearly' | 'lifetime' | null. gyms.paid_until: the day the
-- money received covers, null with 'lifetime' (= for ever). Set by hand in HQ after a payment; no
-- money moves through this migration.
--
-- WHO CAN CHANGE THEM. Only HQ (service_role, forgeai.hq = on for the one write). Any other update
-- of these five columns raises HQ_ONLY (a second lock: no app can update gyms directly since 0021
-- removed the old owner policy, and no gym function touches these columns).
--
-- NEW HQ ACTIONS (service_role only, each writes one hq_audit row, like 0027):
--   hq_set_trial(actor, gym, new_end, reason)    errors: GONE, NEED_REASON, TRIAL_PAST (before now),
--                                                TRIAL_CAP (more than 6 months after the start).
--   hq_set_plan(actor, gym, plan, billing, paid_until, reason)
--                                                errors: GONE, NEED_REASON, INVALID (unknown plan or
--                                                billing, or a billing without a plan), NEED_DATE
--                                                (monthly or yearly without paid until), BAD_DATE
--                                                (paid until more than 3 years ahead).
--
-- CHANGES TWO EXISTING FUNCTIONS, additively (every key they answered before is still there):
--   _hq_gym_extra (0028)    HQ's gym row also carries trialStartsAt, trialEndsAt, trialCapAt, plan,
--                           billing, paidUntil (so hq_gyms and hq_gym show them).
--   owner_hq_access (0028)  the gym owner's answer also carries "trial": {startsAt, endsAt, plan,
--                           billing, paidUntil}, and the owner's list also shows HQ's set_trial and
--                           set_plan actions. Still owner only (a front-desk key gets OWNER_ONLY).
-- Before this runs, the HQ Worker and the admin app see none of these keys and say "needs the
-- database update"; nothing breaks.
-- RE-RUNNING 0028 puts back its own _hq_gym_extra and owner_hq_access (without the trial): always
-- re-run 0030 after it. (Until then HQ only says "needs the database update"; nothing breaks.)

-- A lock wait gives up after 3 seconds rather than stalling the live apps behind it.
set lock_timeout = '3s';

-- ------------------------------------------------------------------ the columns
alter table public.gyms add column if not exists trial_starts_at timestamptz;
alter table public.gyms add column if not exists trial_ends_at   timestamptz;
alter table public.gyms add column if not exists plan            text;
alter table public.gyms add column if not exists billing         text;
alter table public.gyms add column if not exists paid_until      timestamptz;

-- The gyms that exist now: their trial starts today (only rows never given one, so a re-run
-- changes nothing and never meets the HQ_ONLY trigger below, which is made after these lines).
update public.gyms set trial_starts_at = now() where trial_starts_at is null;
update public.gyms set trial_ends_at = trial_starts_at + interval '3 months' where trial_ends_at is null;

-- From now on a new gym's trial starts when it is made and ends 3 months later.
alter table public.gyms alter column trial_starts_at set default now();
alter table public.gyms alter column trial_ends_at set default (now() + interval '3 months');

alter table public.gyms drop constraint if exists gyms_plan_check;
alter table public.gyms add constraint gyms_plan_check check (plan is null or plan in ('starter', 'pro', 'ai'));
alter table public.gyms drop constraint if exists gyms_billing_check;
alter table public.gyms add constraint gyms_billing_check check (billing is null or billing in ('monthly', 'yearly', 'lifetime'));
-- No plan: no billing and no paid-until. A plan always says how it is paid.
alter table public.gyms drop constraint if exists gyms_plan_billing_check;
alter table public.gyms add constraint gyms_plan_billing_check check (
  (plan is null and billing is null and paid_until is null) or (plan is not null and billing is not null));

-- ------------------------------------------------------------------ only HQ changes them
create or replace function public._gym_billing_hq_only() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if current_setting('forgeai.hq', true) = 'on' then return new; end if;
  if new.trial_starts_at is distinct from old.trial_starts_at or new.trial_ends_at is distinct from old.trial_ends_at
     or new.plan is distinct from old.plan or new.billing is distinct from old.billing
     or new.paid_until is distinct from old.paid_until then
    raise exception 'HQ_ONLY';
  end if;
  return new;
end $$;

drop trigger if exists gyms_billing_hq_only on public.gyms;
create trigger gyms_billing_hq_only
  before update of trial_starts_at, trial_ends_at, plan, billing, paid_until on public.gyms
  for each row execute function public._gym_billing_hq_only();

-- The latest end HQ may give a gym's trial: 6 months after it started. Counted on the calendar in
-- UTC whatever the session's time zone, so the HQ page (apps/hq/public/logic.js trialCap) gets the
-- same moment. PURE.
create or replace function public._trial_cap(p_start timestamptz) returns timestamptz
  language sql immutable set search_path = public as $$
  select ((p_start at time zone 'UTC') + interval '6 months') at time zone 'UTC'
$$;

-- ------------------------------------------------------------------ HQ's gym row (0028's, plus the trial)
create or replace function public._hq_gym_extra(p_gym uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', g.status, 'statusAt', g.status_at,
    'deleteRequest', (select public._hq_request_json(r) from public.hq_delete_requests r
                       where r.gym_id = p_gym and r.done_at is null and r.cancelled_at is null
                       order by r.requested_at limit 1),
    'supportUntil', (select x.ends_at from public.hq_grants x
                      where x.gym_id = p_gym and x.starts_at <= now() and x.ends_at > now() and x.ended_early_at is null
                      order by x.ends_at desc limit 1),
    'supportOpenedBy', (select x.opened_by from public.hq_grants x
                         where x.gym_id = p_gym and x.starts_at <= now() and x.ends_at > now() and x.ended_early_at is null
                         order by x.ends_at desc limit 1),
    -- 0030: the free trial and the plan.
    'trialStartsAt', g.trial_starts_at, 'trialEndsAt', g.trial_ends_at,
    'trialCapAt', public._trial_cap(g.trial_starts_at),
    'plan', g.plan, 'billing', g.billing, 'paidUntil', g.paid_until)
  from public.gyms g where g.gym_id = p_gym
$$;

-- ------------------------------------------------------------------ HQ actions (service_role only)
-- A new end for the gym's free trial (longer or shorter), with a reason. Errors: GONE, NEED_REASON,
-- TRIAL_PAST, TRIAL_CAP.
create or replace function public.hq_set_trial(p_actor text, p_gym uuid, p_new_end timestamptz, p_reason text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g public.gyms; why text;
begin
  perform public._hq_guard();
  select * into g from public.gyms where gym_id = p_gym for update;
  if g.gym_id is null then raise exception 'GONE'; end if;
  why := public._hq_reason(p_reason);
  if p_new_end is null or p_new_end < now() then raise exception 'TRIAL_PAST'; end if;
  if p_new_end > public._trial_cap(coalesce(g.trial_starts_at, g.created_at)) then raise exception 'TRIAL_CAP'; end if;
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set trial_ends_at = p_new_end, trial_starts_at = coalesce(trial_starts_at, created_at)
   where gym_id = p_gym;
  perform set_config('forgeai.hq', 'off', true);  -- only for this one write
  perform public._hq_log(p_actor, 'set_trial', p_gym, why,
    jsonb_build_object('from', g.trial_ends_at, 'to', p_new_end));
  return public._hq_gym_counts(p_gym);
end $$;

-- The gym's plan (after a payment), or back to "no plan" (all three null). Errors: GONE,
-- NEED_REASON, INVALID, NEED_DATE, BAD_DATE.
create or replace function public.hq_set_plan(p_actor text, p_gym uuid, p_plan text, p_billing text,
    p_paid_until timestamptz, p_reason text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g public.gyms; why text; pu timestamptz := p_paid_until;
begin
  perform public._hq_guard();
  select * into g from public.gyms where gym_id = p_gym for update;
  if g.gym_id is null then raise exception 'GONE'; end if;
  why := public._hq_reason(p_reason);
  if p_plan is null then
    if p_billing is not null or p_paid_until is not null then raise exception 'INVALID'; end if;
  else
    if p_plan not in ('starter', 'pro', 'ai') then raise exception 'INVALID'; end if;
    if p_billing is null or p_billing not in ('monthly', 'yearly', 'lifetime') then raise exception 'INVALID'; end if;
    if p_billing = 'lifetime' then
      pu := null;  -- lifetime: paid for ever
    elsif pu is null then
      raise exception 'NEED_DATE';
    elsif pu > now() + interval '3 years' then
      raise exception 'BAD_DATE';
    end if;
  end if;
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set plan = p_plan, billing = p_billing, paid_until = pu where gym_id = p_gym;
  perform set_config('forgeai.hq', 'off', true);
  perform public._hq_log(p_actor, 'set_plan', p_gym, why,
    jsonb_build_object('from', jsonb_build_object('plan', g.plan, 'billing', g.billing, 'paidUntil', g.paid_until),
                       'to', jsonb_build_object('plan', p_plan, 'billing', p_billing, 'paidUntil', pu)));
  return public._hq_gym_counts(p_gym);
end $$;

-- ------------------------------------------------------------------ the gym owner's side (0028's, plus the trial)
-- The gym owner's "ForgeAI access" list, as in 0028, plus "trial" for the admin app's trial banner,
-- and HQ's trial and plan changes in the actions. Errors: BAD_KEY, OWNER_ONLY.
create or replace function public.owner_hq_access(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key);
begin
  return jsonb_build_object(
    'status', (select status from public.gyms where gym_id = g),
    'trial', (select jsonb_build_object('startsAt', x.trial_starts_at, 'endsAt', x.trial_ends_at,
                                        'plan', x.plan, 'billing', x.billing, 'paidUntil', x.paid_until)
                from public.gyms x where x.gym_id = g),
    'grants', coalesce((
      select jsonb_agg(public._hq_grant_json(x) || jsonb_build_object(
               'looked', coalesce((select jsonb_agg(jsonb_build_object('at', a.at, 'what', a.detail->>'kind', 'rows', a.detail->'rows') order by a.at, a.audit_id)
                                     from public.hq_audit a
                                    where a.gym_id = g and a.action = 'support_view'
                                      and a.at >= x.starts_at and a.at <= coalesce(least(x.ended_early_at, x.ends_at), x.ends_at)), '[]'::jsonb))
             order by x.starts_at desc, x.seq desc)
        from (select * from public.hq_grants where gym_id = g and starts_at > now() - interval '2 years'
               order by starts_at desc, seq desc limit 100) x), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object('at', a.at, 'action', a.action, 'reason', a.reason) order by a.at desc, a.audit_id desc)
        from (select * from public.hq_audit
               where gym_id = g and action in ('approve_gym', 'suspend_gym', 'restore_gym', 'reset_owner_signin',
                                               'sign_out_gym', 'create_gym', 'ai_limit_set', 'set_trial', 'set_plan')
                 and at > now() - interval '2 years'
               order by at desc, audit_id desc limit 50) a), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._gym_billing_hq_only()                              from public, anon, authenticated;
revoke all on function public._trial_cap(timestamptz)                             from public, anon, authenticated;
revoke all on function public._hq_gym_extra(uuid)                                 from public, anon, authenticated;
revoke all on function public.hq_set_trial(text, uuid, timestamptz, text)         from public, anon, authenticated;
revoke all on function public.hq_set_plan(text, uuid, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.hq_set_trial(text, uuid, timestamptz, text)         to service_role;
grant execute on function public.hq_set_plan(text, uuid, text, text, timestamptz, text) to service_role;
revoke all on function public.owner_hq_access(text)                               from public;
grant execute on function public.owner_hq_access(text)                            to anon, authenticated;

notify pgrst, 'reload schema';
