-- APPLIED LIVE 10 Nov 2026 (owner said yes on 10 Nov 2026: D3 "all as recommended"), in the SQL Editor, this exact
-- text from bbf04f06. Before: _terms_versions() = {2026-10-24}, 1 acceptance row. After: {2026-10-24,2026-11-10},
-- still 1 row. Live test supabase/tests/0067: RESULT PASS (7 checks), rolled back.
-- 0067: a new version of the MettleUp terms and the gym data agreement, 2026-11-10 (R-443 / R-445).
-- ADDITIVE and re-runnable: replaces ONE helper, _terms_versions() (0033), so its list also holds '2026-11-10'.
-- Nothing else changes: no table, no grant, no other function. Old acceptances stay as they are.
-- Test: supabase/tests/0067_terms_version.sql (CI runs it after every migration; pasted into the SQL Editor it
-- always ends in an error and so changes nothing).
--
-- What it does for gyms: the admin app's TERMS_VERSION becomes '2026-11-10' (apps/dashboard/src/crm/auth/terms.ts),
-- so each gym's owner is asked once, at their next sign-in, to tick "I agree" to the new terms and data agreement
-- (TermsGate). owner_accept_terms and gym_create_online refuse a version that is not in this list, so this
-- migration must be live BEFORE that admin app is deployed (an older admin app keeps sending '2026-10-24', which
-- stays valid).
-- Re-running 0033 puts the old one-version list back: always re-run 0067 after 0033.

set lock_timeout = '3s';

-- Every version of the terms there has been, oldest first. The ONE list (0033 header).
create or replace function public._terms_versions() returns text[]
  language sql immutable set search_path = public as $$
  select array['2026-10-24', '2026-11-10']
$$;

revoke all on function public._terms_versions() from public, anon, authenticated;
