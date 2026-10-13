-- ForgeAI — gym branding, Level 1 (13 Oct 2026). Run after 0004. Re-runnable, additive only.
--
-- A gym's look inside the ForgeAI app: one brand colour, an optional background tone, a logo and
-- a heading style. The owner sets it in the panel (Settings → Branding); the app gets it with the
-- join (member_join) and on every launch (member_me), keeps it on the phone, and repaints itself.
-- The full palette (shades, text on the colour, chart colours, readability checks) is worked out
-- on the phone and in the panel from these few values by ONE shared function
-- (packages/theme/src/brand.ts) — the database only keeps what the owner picked.
--
-- Logos live in a PUBLIC bucket `gym-logos` (anyone with the link can see a gym's logo, as on
-- its signboard). Uploading works exactly like product photos (0004): the panel asks for a
-- one-time upload ticket with its owner key (owner_photo_ticket, 15 minutes) and the storage
-- policy only lets a file in when its folder is a live ticket: <ticket>/<name>.png.

-- ------------------------------------------------------------------ the gym's brand
-- (gyms.branding jsonb from 0001 was never used; it stays, untouched.)
alter table public.gyms add column if not exists brand_accent text
  check (brand_accent is null or brand_accent ~ '^#[0-9A-F]{6}$');
alter table public.gyms add column if not exists brand_bg text
  check (brand_bg is null or brand_bg ~ '^#[0-9A-F]{6}$');
alter table public.gyms add column if not exists brand_logo_url text
  check (brand_logo_url is null or length(brand_logo_url) <= 400);
alter table public.gyms add column if not exists brand_heading text not null default 'normal'
  check (brand_heading in ('normal', 'bold-italic'));
alter table public.gyms add column if not exists brand_updated_at timestamptz;

-- ------------------------------------------------------------------ the logo bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gym-logos', 'gym-logos', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1048576,
  allowed_mime_types = array['image/png','image/jpeg','image/webp'];

-- Same one-time tickets as product photos (public.photo_tickets, _photo_ticket_ok from 0004).
drop policy if exists gym_logos_upload on storage.objects;
create policy gym_logos_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'gym-logos' and public._photo_ticket_ok(name));

-- A gym may only point at a logo inside that bucket, in a ticket folder.
create or replace function public._logo_url_ok(p_url text) returns boolean
  language sql immutable as $$
  select p_url is null
      or p_url ~ '^https://hdxzqbdiokjklnypfisq\.supabase\.co/storage/v1/object/public/gym-logos/[0-9a-f]{48}/[A-Za-z0-9._-]{1,80}$'
$$;

-- '#f7d411' / 'F7D411' → '#F7D411'; null stays null; anything else raises BAD_COLOUR.
create or replace function public._brand_hex(p text) returns text
  language plpgsql immutable as $$
declare s text := upper(btrim(coalesce(p, '')));
begin
  if s = '' then return null; end if;
  if left(s, 1) <> '#' then s := '#' || s; end if;
  if s !~ '^#[0-9A-F]{6}$' then raise exception 'BAD_COLOUR'; end if;
  return s;
end $$;

-- The brand as the app and the panel read it: always an object, each field null when unset.
create or replace function public._brand_json(g public.gyms) returns jsonb
  language sql stable as $$
  select jsonb_build_object(
    'accent',    g.brand_accent,
    'bg',        g.brand_bg,
    'logoUrl',   g.brand_logo_url,
    'heading',   coalesce(g.brand_heading, 'normal'),
    'updatedAt', g.brand_updated_at)
$$;

-- ------------------------------------------------------------------ owner: set the brand
-- Saves the WHOLE brand the panel's form shows (a null clears that part; all nulls and 'normal'
-- = back to ForgeAI's own look). Returns owner_gym, brand included.
create or replace function public.owner_set_brand(p_key text, p_accent text, p_bg text,
                                                  p_logo_url text, p_heading text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_gym(p_key);
        a text := public._brand_hex(p_accent);
        b text := public._brand_hex(p_bg);
        u text := nullif(btrim(coalesce(p_logo_url, '')), '');
        h text := coalesce(nullif(btrim(coalesce(p_heading, '')), ''), 'normal');
begin
  if not public._logo_url_ok(u) then raise exception 'BAD_LOGO'; end if;
  if h not in ('normal', 'bold-italic') then raise exception 'BAD_HEADING'; end if;
  update public.gyms set brand_accent = a, brand_bg = b, brand_logo_url = u, brand_heading = h,
         brand_updated_at = now()
   where gym_id = gid;
  return public.owner_gym(p_key);
end $$;

-- ------------------------------------------------------------------ the brand in every answer
-- owner_gym (0002) + brand.
create or replace function public.owner_gym(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.gyms;
begin
  select * into g from public.gyms where gym_id = public._owner_gym(p_key);
  return jsonb_build_object('gymId', g.gym_id, 'name', g.name, 'joinCode', g.join_code,
                            'brand', public._brand_json(g));
end $$;

-- member_join (0002), unchanged except the brand in its answer.
create or replace function public.member_join(p_code text, p_name text, p_phone text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.gyms; k text := public._new_key(); m public.gym_members; n int;
begin
  select * into g from public.gyms where join_code = upper(btrim(coalesce(p_code,'')));
  if g.gym_id is null then raise exception 'INVALID_CODE'; end if;
  if length(btrim(coalesce(p_name,''))) = 0 then raise exception 'EMPTY'; end if;
  select count(*) into n from public.gym_members where gym_id = g.gym_id and joined_at > now() - interval '1 hour';
  if n >= 500 then raise exception 'BUSY'; end if;
  insert into public.gym_members(gym_id, name, phone, key_hash)
    values (g.gym_id, left(btrim(p_name), 60), nullif(left(btrim(coalesce(p_phone,'')), 20), ''), public._hash_key(k))
    returning * into m;
  return jsonb_build_object('memberId', m.member_id, 'memberKey', k, 'gymId', g.gym_id,
                            'gymName', g.name, 'joinCode', g.join_code, 'name', m.name,
                            'brand', public._brand_json(g));
end $$;

-- member_me (0002), unchanged except the brand in its answer. The app calls it on launch.
create or replace function public.member_me(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); g public.gyms;
begin
  update public.gym_members set last_seen = now() where member_id = m.member_id;
  select * into g from public.gyms where gym_id = m.gym_id;
  return jsonb_build_object('memberId', m.member_id, 'gymId', g.gym_id, 'gymName', g.name,
                            'joinCode', g.join_code, 'name', m.name,
                            'brand', public._brand_json(g));
end $$;

revoke all on function public._logo_url_ok(text) from public, anon, authenticated;
revoke all on function public._brand_hex(text) from public, anon, authenticated;
revoke all on function public._brand_json(public.gyms) from public, anon, authenticated;
revoke all on function public.owner_set_brand(text, text, text, text, text) from public;
grant execute on function public.owner_set_brand(text, text, text, text, text) to anon, authenticated;
grant execute on function public.owner_gym(text)                               to anon, authenticated;
grant execute on function public.member_join(text, text, text)                 to anon, authenticated;
grant execute on function public.member_me(text)                               to anon, authenticated;

-- ------------------------------------------------------------------ demo gym: RAM'S FITNESS CLUB IMPACT
-- The first client, branded, for the app and the cloud phone test (code RAMS01), with the sample
-- shop the first time only (re-running never wipes its products). FORGE1 stays unbranded, so both
-- looks can be tested. Their logo is not in this file: upload it once (see supabase/README.md,
-- "Gym branding") and point brand_logo_url at it.
do $$
declare g uuid;
begin
  select gym_id into g from public.gyms where join_code = 'RAMS01';
  if g is null then
    insert into public.gyms(name, join_code) values ('RAM''S FITNESS CLUB IMPACT', 'RAMS01') returning gym_id into g;
    perform public._seed_shop(g);
  end if;
  update public.gyms set brand_accent = '#F7D411', brand_bg = '#0A0A0C', brand_heading = 'bold-italic',
         brand_updated_at = coalesce(brand_updated_at, now())
   where gym_id = g;
end $$;
