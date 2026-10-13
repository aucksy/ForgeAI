-- ForgeAI — gym branding: a gym's logo is a file in OUR gym-logos bucket, for every write
-- (13 Oct 2026). Run after 0005. Re-runnable, additive only.
--
-- 0005 checks the logo link only inside owner_set_brand. But the gyms_owner_update policy (0001)
-- also lets a signed-in owner account UPDATE public.gyms directly, and so write any https link
-- into brand_logo_url — a tracking pixel every member's phone would then fetch on every launch.
-- This puts the same rule on the column itself, so there is no way around it: _logo_url_ok from
-- 0005 (this project's public gym-logos bucket, a 48-hex upload-ticket folder, a plain file name;
-- null = no logo). The rule stays in that ONE function — the project's storage host is named
-- there and nowhere new.
--
-- Added NOT VALID first (no long lock while the table is read), then validated: every logo saved
-- so far came through owner_set_brand or the README's copy of a link the panel made, so all pass.
-- If VALIDATE ever fails, list the offending rows with
--   select gym_id, brand_logo_url from public.gyms where not public._logo_url_ok(brand_logo_url);
-- clear them (set brand_logo_url = null) and run this file again.
-- _logo_url_ok is immutable: if it is ever changed, run the VALIDATE line again (old rows are not
-- re-checked by themselves).
--
-- The member app refuses any other link on its side too (packages/theme/src/brand.ts logoUrlOf).

alter table public.gyms drop constraint if exists gyms_brand_logo_url_ok;
alter table public.gyms add constraint gyms_brand_logo_url_ok
  check (public._logo_url_ok(brand_logo_url)) not valid;
alter table public.gyms validate constraint gyms_brand_logo_url_ok;
