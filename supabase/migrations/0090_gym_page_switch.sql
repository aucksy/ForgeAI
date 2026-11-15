-- NOT LIVE - needs the owner's yes. Re-runnable. Apply after 0080 (it replaces 0080's owner_gym_page and
-- gym_page_public) and 0026/0027 (the HQ guard, actor and audit log).
-- Test: supabase/tests/0090_gym_page_switch.sql (CI runs it after every migration; pasted into the SQL Editor it always
-- ends in an error and so changes nothing). 0080's own test still runs against the functions replaced here.
--
-- 0090: F207 gym web pages, MettleUp HQ's switch for ONE gym (R-563, owner 15 Nov 2026: "By default it should be on
-- for all GYMS and part of their onboarding step. And then I may be able to switch it off if needed for GYMs
-- individually."). On for every gym by default: a gym is off only while it has a row in gym_page_off, which only HQ
-- writes (service role, his Google sign-in, logged in hq_audit). Off means:
--   - the gym's page answers "not here" (gym_page_public answers null, as for an unpublished page);
--   - the gym's admin app hides "Your web page", its screen and the "Make your free gym web page" set-up step
--     (owner_gym_page answers {off: true}; the admin app reads that as "no web page part", gympage/logic.ts);
--   - the gym's join link (/m/<CODE>, Join online) works exactly as before: it is not part of this switch.
-- The owner's own page row (words, photos, address) is kept, so switching back on shows the page again as it was.
-- The global switch (the panel Worker's GYM_PAGES) still comes first: while it is off no gym has a page.
--
-- NEW
--   table gym_page_off            one row per gym that HQ switched off (note, who, when). RLS on, no grants.
--   hq_gym_page(actor, gym)       HQ's read: {pageOn, slug, published, hiddenByHq}
--   hq_set_gym_page(actor, gym, on, note)  switch one gym's page on or off -> {ok, pageOn}; logged as gym_page_on/off
-- CHANGED
--   owner_gym_page(key)           exactly 0080's, + 'off': true when HQ switched this gym's page off
--   gym_page_public(slug)         exactly 0080's, + null when HQ switched this gym's page off
-- Not changed: gym_page_ask_send. A visitor who had the page open before it was switched off can still send one
-- question; it lands in the gym's own Enquiries as before (the page itself no longer opens).
-- Before this is applied: every gym's page follows only the global switch, and HQ's "Web page" switch says the
-- database change is not in yet (HQ checks for hq_gym_page).
-- Undo: re-run 0080's owner_gym_page and gym_page_public; drop function public.hq_set_gym_page(text, uuid, boolean, text);
--   drop function public.hq_gym_page(text, uuid); drop table public.gym_page_off.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ the switch (a row = off)
create table if not exists public.gym_page_off (
  gym_id  uuid primary key references public.gyms(gym_id) on delete cascade,
  note    text check (note is null or length(note) <= 300),
  set_by  text not null,
  set_at  timestamptz not null default now()
);
alter table public.gym_page_off enable row level security;
revoke all on public.gym_page_off from public, anon, authenticated;

-- ------------------------------------------------------------------ the owner's side (0080's, + off)
create or replace function public.owner_gym_page(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key); r public.gym_pages;
begin
  -- 0090: switched off by MettleUp HQ for this gym: the admin app shows no web page part at all.
  if exists (select 1 from public.gym_page_off where gym_id = g) then
    return jsonb_build_object('off', true, 'page', null, 'canEdit', false);
  end if;
  select * into r from public.gym_pages where gym_id = g;
  -- An old owner key has no person (st null) and is the owner.
  return jsonb_build_object('page', public._gym_page_json(r), 'canEdit', st.staff_id is null or st.role = 'owner');
end $$;

-- ------------------------------------------------------------------ the public page (0080's, + off)
create or replace function public.gym_page_public(p_slug text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.gym_pages; g public.gyms; d jsonb; t public.gym_timings; ph text; join_open boolean;
begin
  select * into r from public.gym_pages where slug = lower(btrim(coalesce(p_slug, '')));
  if r.gym_id is null or not r.published or r.hidden_by_hq or r.terms_at is null then return null; end if;
  -- 0090: switched off by MettleUp HQ for this gym.
  if exists (select 1 from public.gym_page_off where gym_id = r.gym_id) then return null; end if;
  select * into g from public.gyms where gym_id = r.gym_id;
  if g.gym_id is null or g.status = 'suspended' then return null; end if;
  d := public._gym_details(g.gym_id);
  select * into t from public.gym_timings where gym_id = g.gym_id;
  ph := case when r.show_phone then public._norm_phone(d->>'phone') end;
  -- "Become a member" (Join online, 0077) only while the gym can add members.
  join_open := not public._self_join_closed(g);
  return jsonb_build_object(
    'v', 1, 'slug', r.slug, 'gymName', g.name, 'area', r.area, 'city', r.city,
    'joinCode', case when join_open then g.join_code end,
    'brand', public._brand_json(g), 'about', r.about, 'highlights', r.highlights, 'photos', r.photos,
    'plans', public._gym_page_plans(g.gym_id), 'hours', t.hours,
    'address', nullif(left(btrim(coalesce(d->>'address', '')), 200), ''), 'mapsUrl', r.maps_url, 'lat', r.lat, 'lng', r.lng,
    'contact', jsonb_build_object('phone', ph, 'whatsapp', ph is not null and r.whatsapp),
    'joinOnline', join_open,
    'indexable', r.indexable, 'aiHelper', r.ai_helper,
    'updatedAt', to_char(r.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
end $$;

-- ------------------------------------------------------------------ MettleUp HQ (service role only)
create or replace function public.hq_gym_page(p_actor text, p_gym uuid)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.gym_pages;
begin
  perform public._hq_guard();
  perform public._hq_actor(p_actor);
  if not exists (select 1 from public.gyms where gym_id = p_gym) then raise exception 'GONE'; end if;
  select * into r from public.gym_pages where gym_id = p_gym;
  return jsonb_build_object(
    'pageOn', not exists (select 1 from public.gym_page_off where gym_id = p_gym),
    'slug', r.slug,
    'published', coalesce(r.published and r.terms_at is not null, false),
    'hiddenByHq', coalesce(r.hidden_by_hq, false));
end $$;

-- On (p_on true): the row goes. Off: a row with the note (optional, at most 300 letters). Logged either way.
create or replace function public.hq_set_gym_page(p_actor text, p_gym uuid, p_on boolean, p_note text default null)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a text; why text := nullif(left(btrim(coalesce(p_note, '')), 300), ''); turn_on boolean := coalesce(p_on, true);
begin
  perform public._hq_guard();
  a := public._hq_actor(p_actor);                -- NO_ACTOR before anything changes
  if not exists (select 1 from public.gyms where gym_id = p_gym) then raise exception 'GONE'; end if;
  if turn_on then
    delete from public.gym_page_off where gym_id = p_gym;
  else
    insert into public.gym_page_off(gym_id, note, set_by) values (p_gym, why, a)
      on conflict (gym_id) do update set note = excluded.note, set_by = excluded.set_by, set_at = now();
  end if;
  perform public._hq_log(p_actor, case when turn_on then 'gym_page_on' else 'gym_page_off' end, p_gym, why, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'pageOn', turn_on);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public.hq_gym_page(text, uuid) from public, anon, authenticated;
revoke all on function public.hq_set_gym_page(text, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.hq_gym_page(text, uuid) to service_role;
grant execute on function public.hq_set_gym_page(text, uuid, boolean, text) to service_role;

notify pgrst, 'reload schema';
