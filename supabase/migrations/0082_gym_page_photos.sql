-- NOT LIVE YET (14 Nov 2026). Waiting for CI to be green, then the main session applies it in the SQL Editor (R-529 covers
-- it: "Photos: our own Supabase storage, served at join.mettleup.fit/p/..."). Re-runnable.
-- NEEDS 0080 (gym_pages), 0027 (_gym_not_suspended), 0018 (_owner_only_gym).
-- Test: supabase/tests/0082_gym_page_photos.sql (CI runs it after every migration; pasted into the SQL Editor it always
-- ends in an error and so changes nothing).
--
-- 0082: F207 the gym page's photos (R-529: our own Supabase storage, no Cloudflare R2, no card).
--
-- WHERE A PHOTO LIVES. A PRIVATE bucket `gym-page-photos` (no public link), one file per photo at
-- <gym_id>/<photo_id>.webp, WebP only, at most 1 MB (the admin app shrinks each photo to 1600 px WebP, under ~400 KB,
-- which also drops the camera's location data). The visitor's address is https://join.mettleup.fit/p/<gym_id>/<photo_id>.webp
-- (the only photo address 0080's owner_save_gym_page accepts); the panel Worker (deploy/panel/gymPageServe.js) reads the
-- file with the public app key and passes it on.
--
-- UPLOADING (the same idea as 0004's tickets, but one ticket = one named file). The admin app asks
-- owner_gym_page_photo_slot(key) (the OWNER only) for a slot: a fresh random photo id for that gym, good for 15 minutes.
-- The storage policy lets a file in only at <gym_id>/<photo_id>.webp of a live slot of THAT gym. A slot's id becomes
-- public in the photo's address, but the file is already there and nothing may overwrite it (no update policy).
-- At most 12 open slots per gym, 60 a day.
--
-- READING. Anyone with the public app key may read a file only while it is one of the photos on that gym's page row
-- (gym_pages.photos, published or not, so the owner's editor can show a saved draft), the page is not taken down by
-- MettleUp HQ, and the gym is not suspended. A photo the owner removed from the page can no longer be read. A file is
-- never listed for anyone else: the read rule names the file, and the random 32-letter id cannot be guessed.
-- KNOWN LIMIT: the storage "list" call uses the same read rule, so someone with the public key could list the
-- photos on gyms' page rows (unpublished drafts included). They are the photos the owner chose for a public page.
--
-- CLEAN-UP (later, not here): files of removed photos stay in the bucket (no one can read them). A later HQ job may
-- delete files no page row names.
--
-- NEW
--   table gym_page_photo_slots              one row per upload slot (15 minutes; kept a day for the daily limit)
--   bucket gym-page-photos                  private, image/webp, 1 MB
--   owner_gym_page_photo_slot(key)          -> {ok, gymId, photoId, path, url} | {error: 'BUSY' | 'TOO_MANY'}
--   _gym_page_photo_upload_ok(name)         the upload policy's check (anon calls it, like 0018's _photo_ticket_ok)
--   _gym_page_photo_read_ok(name)           the read policy's check (anon calls it)
--   policies gym_page_photos_upload (insert), gym_page_photos_read (select) on storage.objects
--
-- Undo: drop policy gym_page_photos_read on storage.objects; drop policy gym_page_photos_upload on storage.objects;
--   drop function public.owner_gym_page_photo_slot(text); drop function public._gym_page_photo_upload_ok(text);
--   drop function public._gym_page_photo_read_ok(text); drop table public.gym_page_photo_slots. The bucket and its files
--   may stay (private, unreadable without the policy).

set lock_timeout = '3s';

do $$
begin
  if to_regclass('public.gym_pages') is null then raise exception '0082 needs 0080 (gym_pages) first'; end if;
end $$;

-- ------------------------------------------------------------------ the slots
create table if not exists public.gym_page_photo_slots (
  photo_id    text primary key check (photo_id ~ '^[0-9a-f]{32}$'),
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists gym_page_photo_slots_gym on public.gym_page_photo_slots(gym_id, created_at);
alter table public.gym_page_photo_slots enable row level security;
revoke all on public.gym_page_photo_slots from public, anon, authenticated;

-- A suspended gym cannot add photos (0027's trigger, as on gym_pages).
drop trigger if exists gym_page_photo_slots_not_suspended on public.gym_page_photo_slots;
create trigger gym_page_photo_slots_not_suspended before insert or update or delete on public.gym_page_photo_slots
  for each row execute function public._gym_not_suspended();

-- ------------------------------------------------------------------ the bucket (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gym-page-photos', 'gym-page-photos', false, 1048576, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/webp'];

-- ------------------------------------------------------------------ the owner asks for a slot
create or replace function public.owner_gym_page_photo_slot(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);      -- raises BAD_KEY, or OWNER_ONLY for a desk key
  id text := replace(gen_random_uuid()::text, '-', '');
begin
  delete from public.gym_page_photo_slots where gym_id = g and expires_at < now() - interval '1 day';
  if (select count(*) from public.gym_page_photo_slots where gym_id = g and expires_at > now()) >= 12 then
    return jsonb_build_object('error', 'BUSY');
  end if;
  if (select count(*) from public.gym_page_photo_slots where gym_id = g and created_at > now() - interval '1 day') >= 60 then
    return jsonb_build_object('error', 'TOO_MANY');
  end if;
  insert into public.gym_page_photo_slots(photo_id, gym_id, expires_at) values (id, g, now() + interval '15 minutes');
  return jsonb_build_object('ok', true, 'gymId', g::text, 'photoId', id, 'path', g::text || '/' || id || '.webp',
                            'url', 'https://join.mettleup.fit/p/' || g::text || '/' || id || '.webp');
end $$;

-- ------------------------------------------------------------------ the storage rules' checks
-- Upload: the name is exactly <gym_id>/<photo_id>.webp of a live slot of that gym. Answers only yes or no.
create or replace function public._gym_page_photo_upload_ok(p_name text)
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_name, '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{32}\.webp$'
     and exists (select 1 from public.gym_page_photo_slots s
                  where s.gym_id::text = split_part(p_name, '/', 1)
                    and s.photo_id = left(split_part(p_name, '/', 2), 32)
                    and s.expires_at > now())
$$;

-- Read: the file is one of the photos on that gym's page row, the page is not taken down by HQ, the gym not suspended.
create or replace function public._gym_page_photo_read_ok(p_name text)
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_name, '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{32}\.webp$'
     and exists (select 1 from public.gym_pages p join public.gyms g on g.gym_id = p.gym_id
                  where p.gym_id::text = split_part(p_name, '/', 1)
                    and not p.hidden_by_hq
                    and g.status <> 'suspended'
                    and p.photos @> jsonb_build_array(jsonb_build_object('url', 'https://join.mettleup.fit/p/' || p_name)))
$$;

drop policy if exists gym_page_photos_upload on storage.objects;
create policy gym_page_photos_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'gym-page-photos' and public._gym_page_photo_upload_ok(name));

drop policy if exists gym_page_photos_read on storage.objects;
create policy gym_page_photos_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'gym-page-photos' and public._gym_page_photo_read_ok(name));

-- ------------------------------------------------------------------ grants
-- The two checks are called by the storage rules AS the caller (anon), so anon may call them (0018's lesson: without
-- it every upload fails "permission denied for function"). Each answers only yes or no for one file name.
revoke all on function public.owner_gym_page_photo_slot(text) from public;
revoke all on function public._gym_page_photo_upload_ok(text) from public;
revoke all on function public._gym_page_photo_read_ok(text) from public;
grant execute on function public.owner_gym_page_photo_slot(text) to anon, authenticated;
grant execute on function public._gym_page_photo_upload_ok(text) to anon, authenticated;
grant execute on function public._gym_page_photo_read_ok(text) to anon, authenticated;

notify pgrst, 'reload schema';
