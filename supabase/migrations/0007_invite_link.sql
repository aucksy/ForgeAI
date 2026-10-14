-- 0007: invite link + front-desk QR (14 Oct 2026).
--
-- The panel shares one link per gym: https://forgeai.aakashpahuja.in/j/<JOIN CODE>. Tapped on a
-- phone with the app, Android opens the app straight on a "Join <gym>" screen; without the app, the
-- link's web page shows the gym and how to get the app. Both ask this function what the code is
-- BEFORE anyone joins, so the screen can show the gym's name and logo, and say plainly when a code
-- is wrong. Joining itself is still member_join (0005), unchanged.
--
-- Read-only and public on purpose: a join code is printed on the gym's front desk, and the answer
-- holds only what the gym shows its members anyway (name, colours, logo) — never the owner, the
-- members or any number. An unknown code answers null, not an error, so a typo is not a crash.

create or replace function public.gym_preview(p_code text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g public.gyms;
begin
  select * into g from public.gyms where join_code = upper(btrim(coalesce(p_code, '')));
  if g.gym_id is null then return null; end if;
  return jsonb_build_object('gymName', g.name, 'joinCode', g.join_code,
                            'brand', public._brand_json(g));
end $$;

revoke all on function public.gym_preview(text) from public;
grant execute on function public.gym_preview(text) to anon, authenticated;
