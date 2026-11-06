-- 0062: which plan gets which features, checked ON THE SERVER, and what happens when a gym stops paying
-- (billing step 1, docs/overhaul/BILLING-DESIGN.md; owner R-382/R-384/R-385, 6 Nov 2026).
-- NOT APPLIED LIVE: the owner must say yes before this goes to the gym server.
-- Additive and re-runnable: one new table, one app_config row, new functions and new triggers; no
-- existing table, column, row or function changes. Apply after 0061. Test: supabase/tests/0062_plan_features.sql
-- (CI runs it after every migration; pasted into the SQL Editor it always ends in an error and changes nothing).
--
-- THE SWITCH (OFF): app_config row 'plan_gate' {"on": false}. While it is off, gym_has_feature answers
-- true for every gym and every feature, and none of the triggers below refuse anything: everything
-- behaves exactly as before this file. It is the server half of PLAN_GATE_ON (packages/theme/src/plans.ts);
-- both are switched on together, with the owner's yes, in build step 4:
--   update public.app_config set value = '{"on": true}'::jsonb, updated_at = now() where key = 'plan_gate';
--
-- THE PLAN -> FEATURES TABLE: public.plan_features (plan, feature). A feature that has rows here is a
-- Pro extra: a gym gets it only when its plan has the row. A feature with no row at all is in every
-- plan (the desk, messages, members...). The rows mirror PACK_FEATURES in packages/theme/src/plans.ts
-- word for word; a test fails if they differ (apps/dashboard/test/crm/pricesOneSource.test.ts).
-- A gym with no plan picked (gyms.plan null) is on its free trial, which has the Pro features.
--
-- THE GYM'S STATE (DECIDED 6 Nov 2026, R-384), gym_state(gym):
--   'active'    paid (paid_until in the future), on the free trial, a lifetime gym, or no dates at all
--   'grace'     the 7 days after the later of paid_until and trial_ends_at: everything still on
--   'basic'     the 30 days after that: check-in, fee entry and the member list keep working; no new
--               members; Pro extras off; nothing else can be changed
--   'read_only' after that: look and download only. Paying (apply_gym_payment, 0060) moves paid_until
--               and reopens everything at once. Data is never deleted.
-- The admin app has the same rule (gymStateAt in packages/theme/src/plans.ts) and reads the state
-- from owner_gym_state below.
--
-- WHERE THE SERVER CHECKS (triggers, so every function that writes is covered, like 0027's suspension):
--   Pro extras, refused with PLAN_PRO_ONLY when the gym's plan (or state) does not have them:
--     branding       gyms brand_* columns set to a new look        owner_set_brand
--     shop           new shop_products rows / new shop_orders rows  owner_save_product, member_place_order
--     challenge      new gym_challenges rows                       owner_save_challenge
--     workoutOffer   new gym_offers rows                           owner_save_offer
--     trainerPlans   new gym_diet_plans / gym_body_measurements;   owner_save_diet_plan, owner_save_measurement,
--                    crm_records kind 'workout_plan' saves         crm_push (workout plans)
--   The desk's records (crm_records, i.e. crm_push, QR check-in, entry machines):
--     read_only: every save refused with PLAN_READ_ONLY
--     basic:     a NEW member refused with PLAN_NO_NEW_MEMBERS; anything but members, memberships,
--                receipts and check-ins refused with PLAN_BASIC
--   Not yet: messages to members (gym_messages). Automatic messages (offer and challenge rewards) are
--   written inside other server jobs, and a refusal there must not stop them; a later step closes the
--   owner's own "send a message" for basic and read-only.
--   Not gated: deletes (a gym can always remove), stopping or editing existing Pro rows, HQ actions
--   (forgeai.hq = 'on'), and "Your numbers" (worked out in the browser from the gym's own records, so
--   only the screens close it).
--
--   gym_has_feature(gym, feature) -> boolean       (no grant: server-side only)
--   gym_state(gym, at)            -> text          (no grant)
--   owner_gym_state(key)          -> {gateOn, state, plan, endsAt, graceUntil, basicUntil}  owner/desk key

set lock_timeout = '3s';

-- ------------------------------------------------------------------ the switch (off)
insert into public.app_config(key, value) values ('plan_gate', '{"on": false}'::jsonb)
  on conflict (key) do nothing;

create or replace function public._plan_gate_on() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select (value->>'on')::boolean from public.app_config where key = 'plan_gate'), false)
$$;

-- ------------------------------------------------------------------ plan -> features
create table if not exists public.plan_features (
  plan    text not null check (plan in ('starter', 'pro', 'ai')),
  feature text not null check (feature ~ '^[A-Za-z]{2,40}$'),
  primary key (plan, feature)
);
alter table public.plan_features enable row level security;
revoke all on public.plan_features from public, anon, authenticated;

-- Starter: none of the Pro extras. Pro: all of them. Pro + AI: exactly Pro until its AI parts exist.
insert into public.plan_features(plan, feature) values
  ('pro', 'branding'), ('pro', 'shop'), ('pro', 'challenge'), ('pro', 'workoutOffer'), ('pro', 'trainerPlans'), ('pro', 'yourNumbers'),
  ('ai',  'branding'), ('ai',  'shop'), ('ai',  'challenge'), ('ai',  'workoutOffer'), ('ai',  'trainerPlans'), ('ai',  'yourNumbers')
  on conflict do nothing;

-- ------------------------------------------------------------------ the gym's state from its dates
create or replace function public.gym_state(p_gym uuid, p_at timestamptz default now()) returns text
  language plpgsql stable security definer set search_path = public as $$
declare g public.gyms; ends timestamptz;
begin
  select * into g from public.gyms where gym_id = p_gym;
  if g.gym_id is null or g.billing = 'lifetime' then return 'active'; end if;
  ends := greatest(g.paid_until, g.trial_ends_at);  -- greatest() skips nulls
  if ends is null or p_at <= ends then return 'active'; end if;
  if p_at <= ends + interval '7 days' then return 'grace'; end if;
  if p_at <= ends + interval '37 days' then return 'basic'; end if;
  return 'read_only';
end $$;

-- ------------------------------------------------------------------ does this gym have this feature now?
-- Features: a Pro extra (a word in plan_features), or one of the desk words:
--   'look', 'export'                  always (read-only still looks and downloads)
--   'checkin', 'fees', 'memberList'   until read-only
--   'addMember'                       not in basic or read-only
--   anything else                     in active and grace only
create or replace function public.gym_has_feature(p_gym uuid, p_feature text) returns boolean
  language plpgsql stable security definer set search_path = public as $$
declare st text; pack text;
begin
  if not public._plan_gate_on() then return true; end if;
  if p_gym is null or not exists (select 1 from public.gyms where gym_id = p_gym) then return true; end if;
  if p_feature in ('look', 'export') then return true; end if;
  st := public.gym_state(p_gym);
  if st = 'read_only' then return false; end if;
  if p_feature in ('checkin', 'fees', 'memberList') then return true; end if;
  if st = 'basic' then return false; end if;
  if not exists (select 1 from public.plan_features f where f.feature = p_feature) then return true; end if;
  -- No plan picked = the free trial, which has the Pro features.
  select coalesce(x.plan, 'pro') into pack from public.gyms x where x.gym_id = p_gym;
  return exists (select 1 from public.plan_features f where f.plan = pack and f.feature = p_feature);
end $$;

revoke all on function public._plan_gate_on() from public, anon, authenticated;
revoke all on function public.gym_state(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.gym_has_feature(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ the server's checks (triggers)
-- New Pro rows: TG_ARGV[0] is the feature.
create or replace function public._plan_gate_insert() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if current_setting('forgeai.hq', true) = 'on' or not public._plan_gate_on() then return new; end if;
  if not public.gym_has_feature(new.gym_id, tg_argv[0]) then
    if public.gym_state(new.gym_id) = 'read_only' then raise exception 'PLAN_READ_ONLY'; end if;
    raise exception 'PLAN_PRO_ONLY';
  end if;
  return new;
end $$;

drop trigger if exists shop_products_plan_gate on public.shop_products;
create trigger shop_products_plan_gate before insert on public.shop_products
  for each row execute function public._plan_gate_insert('shop');
drop trigger if exists shop_orders_plan_gate on public.shop_orders;
create trigger shop_orders_plan_gate before insert on public.shop_orders
  for each row execute function public._plan_gate_insert('shop');
drop trigger if exists gym_challenges_plan_gate on public.gym_challenges;
create trigger gym_challenges_plan_gate before insert on public.gym_challenges
  for each row execute function public._plan_gate_insert('challenge');
drop trigger if exists gym_offers_plan_gate on public.gym_offers;
create trigger gym_offers_plan_gate before insert on public.gym_offers
  for each row execute function public._plan_gate_insert('workoutOffer');
drop trigger if exists gym_diet_plans_plan_gate on public.gym_diet_plans;
create trigger gym_diet_plans_plan_gate before insert on public.gym_diet_plans
  for each row execute function public._plan_gate_insert('trainerPlans');
drop trigger if exists gym_body_measurements_plan_gate on public.gym_body_measurements;
create trigger gym_body_measurements_plan_gate before insert on public.gym_body_measurements
  for each row execute function public._plan_gate_insert('trainerPlans');
-- Branding: a NEW look (colour, background, logo, heading style). Clearing it back to plain is allowed.
create or replace function public._plan_gate_brand() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if current_setting('forgeai.hq', true) = 'on' or not public._plan_gate_on() then return new; end if;
  if (new.brand_accent, new.brand_bg, new.brand_logo_url, new.brand_heading)
       is not distinct from (old.brand_accent, old.brand_bg, old.brand_logo_url, old.brand_heading) then
    return new;
  end if;
  if new.brand_accent is null and new.brand_bg is null and new.brand_logo_url is null
     and coalesce(new.brand_heading, 'normal') = 'normal' then
    return new;
  end if;
  if not public.gym_has_feature(new.gym_id, 'branding') then
    if public.gym_state(new.gym_id) = 'read_only' then raise exception 'PLAN_READ_ONLY'; end if;
    raise exception 'PLAN_PRO_ONLY';
  end if;
  return new;
end $$;

drop trigger if exists gyms_plan_gate_brand on public.gyms;
create trigger gyms_plan_gate_brand before update on public.gyms
  for each row execute function public._plan_gate_brand();

-- The desk's records (crm_records): read-only, basic mode and workout plans.
create or replace function public._plan_gate_crm() returns trigger
  language plpgsql security definer set search_path = public as $$
declare st text;
begin
  if current_setting('forgeai.hq', true) = 'on' or not public._plan_gate_on() then return new; end if;
  st := public.gym_state(new.gym_id);
  if st = 'read_only' then raise exception 'PLAN_READ_ONLY'; end if;
  if st = 'basic' then
    if new.kind not in ('member', 'membership', 'payment', 'visit') then raise exception 'PLAN_BASIC'; end if;
    -- A new member (crm_push upserts: an existing row is an edit, which is allowed).
    if new.kind = 'member' and tg_op = 'INSERT'
       and not exists (select 1 from public.crm_records r where r.gym_id = new.gym_id and r.kind = 'member' and r.id = new.id) then
      raise exception 'PLAN_NO_NEW_MEMBERS';
    end if;
  end if;
  if new.kind = 'workout_plan' and not public.gym_has_feature(new.gym_id, 'trainerPlans') then
    raise exception 'PLAN_PRO_ONLY';
  end if;
  return new;
end $$;

drop trigger if exists crm_records_plan_gate on public.crm_records;
create trigger crm_records_plan_gate before insert or update on public.crm_records
  for each row execute function public._plan_gate_crm();

revoke all on function public._plan_gate_insert() from public, anon, authenticated;
revoke all on function public._plan_gate_brand() from public, anon, authenticated;
revoke all on function public._plan_gate_crm() from public, anon, authenticated;

-- ------------------------------------------------------------------ the admin app reads the state
-- For the owner's banner (grace / basic / read-only, only once PLAN_GATE_ON is on). An owner or desk key.
create or replace function public.owner_gym_state(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); x public.gyms; ends timestamptz;
begin
  select * into x from public.gyms where gym_id = g;
  ends := case when x.billing = 'lifetime' then null else greatest(x.paid_until, x.trial_ends_at) end;
  return jsonb_build_object(
    'gateOn', public._plan_gate_on(),
    'state', public.gym_state(g),
    'plan', x.plan,
    'endsAt', ends,
    'graceUntil', ends + interval '7 days',
    'basicUntil', ends + interval '37 days');
end $$;

revoke all on function public.owner_gym_state(text) from public;
grant execute on function public.owner_gym_state(text) to anon, authenticated;

notify pgrst, 'reload schema';
