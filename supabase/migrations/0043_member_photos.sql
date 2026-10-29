-- 0043: a member's photo, taken at the desk (F107, 29 Oct 2026). NOT APPLIED LIVE: the owner must say
-- yes before this goes to the gym server. Additive and re-runnable: one new table, new functions;
-- nothing existing is changed.
--
-- WHAT IT IS. On "Add member" (and "Change photo" on a member's page) the desk takes a photo with the
-- computer's camera, or picks a picture file. The admin app shrinks it in the browser to a small square
-- JPEG (about 400 x 400 px, under ~60 KB) and saves it here. It shows on the member's page, their
-- member card and the check-in screen, so the desk knows who is who.
--
-- WHY A TABLE AND NOT A STORAGE BUCKET. The panel has no Supabase sign-in accounts: the desk holds a
-- session key that only our own functions can check (_owner_gym). Storage rules only see "anon", so a
-- bucket would have to be either readable by anyone with the link, or need a server secret to make
-- signed links. A small JPEG in a table, read and written ONLY through the key-checked functions
-- below, keeps the photo private without either: there is no link to the photo at all, public or
-- signed. The photo travels as base64 inside the function's answer and is shown as a data: picture.
--
-- WHO MAY READ AND WRITE.
--  - That gym's people: an owner key or a live session of the gym's staff (_owner_gym; a removed
--    person's session stops at once: BAD_KEY). Owner and front desk alike: the desk adds members.
--  - Only for a member on that gym's own list (crm_records kind 'member', not deleted:
--    _roster_member_ok from 0035, NO_MEMBER otherwise). Gym A's key never reads or writes gym B's photos.
--  - Nobody else: RLS on, no policies, no grants on the table. The member app does not read it.
--  - A gym that is deleted takes its photos with it (on delete cascade).
--
-- LIMITS. JPEG only (the file must start with FF D8 FF: BAD_PHOTO), at most 100,000 bytes (TOO_BIG;
-- the app aims under ~60 KB). One photo per member: a new one replaces the old one. At most 50 members
-- per read.
--
-- Apply: Supabase SQL editor, after 0042. Test: supabase/tests/0043_member_photos.sql (CI runs it after
-- every migration; pasted into the SQL Editor it always ends in an error and so changes nothing).
-- Undo: drop function public.owner_member_photos(text, text[]); drop function
-- public.owner_save_member_photo(text, text, text); drop function public.owner_remove_member_photo(text, text);
-- drop table public.gym_member_photos.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ table
create table if not exists public.gym_member_photos (
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  member_id  text not null check (length(member_id) between 1 and 64),
  jpeg       bytea not null check (octet_length(jpeg) between 4 and 100000),
  by_staff   uuid,
  by_name    text,
  updated_at timestamptz not null default now(),
  primary key (gym_id, member_id)
);

alter table public.gym_member_photos enable row level security;
revoke all on public.gym_member_photos from public, anon, authenticated;

-- ------------------------------------------------------------------ helpers (no grants)
-- One photo row as the app reads it: {memberId, jpeg (base64, one line), updatedAt (epoch ms)}.
create or replace function public._member_photo_json(r public.gym_member_photos) returns jsonb
  language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'memberId', r.member_id,
    'jpeg', translate(encode(r.jpeg, 'base64'), E'\n\r', ''),
    'updatedAt', (extract(epoch from r.updated_at) * 1000)::bigint)
$$;

-- ------------------------------------------------------------------ the gym's side
-- The photos of up to 50 of the gym's members (those without a photo are simply not in the answer).
-- An empty list answers [] (the app uses that to learn this server has photos).
create or replace function public.owner_member_photos(p_key text, p_members text[])
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key);
begin
  if p_members is null or cardinality(p_members) = 0 then return '[]'::jsonb; end if;
  if cardinality(p_members) > 50 then raise exception 'TOO_MANY'; end if;
  return coalesce((select jsonb_agg(public._member_photo_json(r) order by r.member_id)
                     from public.gym_member_photos r
                    where r.gym_id = g and r.member_id = any(p_members)), '[]'::jsonb);
end $$;

-- Save (or replace) one member's photo. p_jpeg is the JPEG as base64 (no data: prefix).
-- Refuses: BAD_KEY, NO_MEMBER, BAD_PHOTO (not base64, or not a JPEG), TOO_BIG (over 100,000 bytes).
-- Who took it is stamped from the session, never from the device.
create or replace function public.owner_save_member_photo(p_key text, p_member text, p_jpeg text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  b bytea;
  r public.gym_member_photos;
begin
  perform public._roster_member_ok(g, p_member);
  if p_jpeg is null or length(p_jpeg) > 140000 then raise exception 'TOO_BIG'; end if;
  begin
    b := decode(p_jpeg, 'base64');
  exception when others then
    raise exception 'BAD_PHOTO';
  end;
  if octet_length(b) > 100000 then raise exception 'TOO_BIG'; end if;
  if octet_length(b) < 4 or substring(b from 1 for 3) <> '\xffd8ff'::bytea then raise exception 'BAD_PHOTO'; end if;
  insert into public.gym_member_photos(gym_id, member_id, jpeg, by_staff, by_name, updated_at)
    values (g, p_member, b, st.staff_id, st.name, now())
  on conflict (gym_id, member_id) do update
    set jpeg = excluded.jpeg, by_staff = excluded.by_staff, by_name = excluded.by_name, updated_at = now()
  returning * into r;
  return public._member_photo_json(r);
end $$;

-- Take a member's photo away. True when there was one. Works for a member already removed from the
-- list too (so a removed member's photo can still be cleared), but only inside the key's own gym.
create or replace function public.owner_remove_member_photo(p_key text, p_member text)
  returns boolean language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); n int;
begin
  delete from public.gym_member_photos where gym_id = g and member_id = p_member;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._member_photo_json(public.gym_member_photos) from public, anon, authenticated;
revoke all on function public.owner_member_photos(text, text[])            from public;
revoke all on function public.owner_save_member_photo(text, text, text)    from public;
revoke all on function public.owner_remove_member_photo(text, text)        from public;
grant execute on function public.owner_member_photos(text, text[])         to anon, authenticated;
grant execute on function public.owner_save_member_photo(text, text, text) to anon, authenticated;
grant execute on function public.owner_remove_member_photo(text, text)     to anon, authenticated;
