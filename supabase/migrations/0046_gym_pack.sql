-- 0046: the apps may READ which pack a gym is on (tracker T66, owner decision #30 option A, 30 Oct 2026).
-- NOT APPLIED LIVE: the owner must say yes before this goes to the gym server (#30 / T66).
-- Additive and re-runnable: two new read-only functions; no table, column, row or existing function
-- changes. Apply after 0045. Test: supabase/tests/0046_gym_pack.sql (CI runs it after every migration;
-- pasted into the SQL Editor it always ends in an error and so changes nothing).
--
-- THE PACK is gyms.plan, made by 0030 (live): 'starter' | 'pro' | 'ai', or null while the gym is on its
-- free trial with nothing picked. Founding gyms and "Own it" are pack 'pro' with billing 'lifetime' /
-- 'yearly'. Only HQ writes it (0030's HQ_ONLY trigger); nothing here can change it. Until now only the
-- owner could see it (owner_hq_access), not the front desk and not the member app.
--
-- WHAT THE APPS DO WITH IT: packages/theme/src/plans.ts (hasFeature) closes the Pro features for a
-- 'starter' gym, ONLY once its switch PLAN_GATE_ON is turned on (also the owner's yes). While the
-- switch is off the apps never call these functions. A null or unknown pack = every feature.
--
--   owner_gym_pack(key)   {pack: 'starter'|'pro'|'ai'|null} for an owner or front-desk key (the desk
--                         must know which pages are closed). BAD_KEY for a key that is not a session.
--   member_gym_pack(key)  {pack} for the member key of the app's Join. BAD_KEY otherwise. The pack
--                         says which features the gym's members get, nothing about money (no billing,
--                         no paid-until, no trial dates).

set lock_timeout = '3s';

create or replace function public.owner_gym_pack(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key);
begin
  return jsonb_build_object('pack', (select x.plan from public.gyms x where x.gym_id = g));
end $$;

create or replace function public.member_gym_pack(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key);
begin
  return jsonb_build_object('pack', (select x.plan from public.gyms x where x.gym_id = m.gym_id));
end $$;

revoke all on function public.owner_gym_pack(text) from public;
revoke all on function public.member_gym_pack(text) from public;
grant execute on function public.owner_gym_pack(text) to anon, authenticated;
grant execute on function public.member_gym_pack(text) to anon, authenticated;

notify pgrst, 'reload schema';
