-- ForgeAI shop — real product photos (12 Oct 2026). Run after 0003. Re-runnable.
--
-- The owner uploads a photo in the panel; members see it in the app's Shop. Photos live in a
-- PUBLIC Supabase Storage bucket (anyone with the link can view a product photo — they are shop
-- pictures, nothing private). Uploading is NOT public: there are no accounts, so the panel first
-- asks for an UPLOAD TICKET with its owner key (owner_photo_ticket, valid 15 minutes), and the
-- storage policy only lets a file in when its folder is a live ticket: <ticket>/<name>.jpg.
-- The product then points at the file (owner_set_product_photo, or imageUrl in
-- owner_save_product); only URLs inside this bucket are accepted.

alter table public.shop_products add column if not exists image_url text
  check (image_url is null or length(image_url) <= 400);

-- ------------------------------------------------------------------ the bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- ------------------------------------------------------------------ upload tickets
create table if not exists public.photo_tickets (
  ticket     text primary key,
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.photo_tickets enable row level security;
revoke all on public.photo_tickets from anon, authenticated;

create or replace function public.owner_photo_ticket(p_key text)
  returns text language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_gym(p_key); t text := public._new_key(); n int;
begin
  delete from public.photo_tickets where expires_at < now();
  select count(*) into n from public.photo_tickets where gym_id = gid;
  if n >= 50 then raise exception 'BUSY'; end if;
  insert into public.photo_tickets(ticket, gym_id, expires_at) values (t, gid, now() + interval '15 minutes');
  return t;
end $$;

-- True when the first folder of a storage path is a live ticket. Used by the storage policy.
create or replace function public._photo_ticket_ok(p_name text)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.photo_tickets
    where ticket = split_part(coalesce(p_name, ''), '/', 1) and expires_at > now()
  )
$$;
grant execute on function public._photo_ticket_ok(text) to anon, authenticated;

drop policy if exists product_photos_upload on storage.objects;
create policy product_photos_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'product-photos' and public._photo_ticket_ok(name));

-- ------------------------------------------------------------------ pointing a product at a photo
create or replace function public._photo_url_ok(p_url text) returns boolean
  language sql immutable as $$
  select p_url is null
      or p_url ~ '^https://hdxzqbdiokjklnypfisq\.supabase\.co/storage/v1/object/public/product-photos/[0-9a-f]{48}/[A-Za-z0-9._-]{1,80}$'
$$;

create or replace function public.owner_set_product_photo(p_key text, p_product uuid, p_url text)
  returns public.shop_products language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_gym(p_key); r public.shop_products; u text := nullif(btrim(coalesce(p_url,'')), '');
begin
  if not public._photo_url_ok(u) then raise exception 'BAD_PHOTO'; end if;
  update public.shop_products set image_url = u, updated_at = now()
    where product_id = p_product and gym_id = gid returning * into r;
  if r.product_id is null then raise exception 'GONE'; end if;
  return r;
end $$;

-- owner_save_product (0003) plus imageUrl: a new product can be saved with its photo in one go,
-- and an edit keeps or changes it. Same CHANGED rule as 0003 for edits.
create or replace function public.owner_save_product(p_key text, p jsonb)
  returns public.shop_products language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_gym(p_key); pid uuid := nullif(p->>'productId','')::uuid;
        opts jsonb := coalesce(p->'options', '[]'::jsonb); r public.shop_products; s int;
        seen timestamptz; img text := nullif(btrim(coalesce(p->>'imageUrl','')), '');
        has_img boolean := p ? 'imageUrl';
begin
  if jsonb_typeof(opts) <> 'array' or jsonb_array_length(opts) > 12 then raise exception 'BAD_OPTIONS'; end if;
  if not public._photo_url_ok(img) then raise exception 'BAD_PHOTO'; end if;
  s := case when jsonb_array_length(opts) > 0 then public._option_stock_sum(opts)
            else greatest(0, coalesce((p->>'stock')::int, 0)) end;
  if pid is null then
    insert into public.shop_products(gym_id, name, category, description, price_p, option_name, options,
        stock, active, art_kind, art_tint, sort, image_url)
      values (gid, btrim(p->>'name'), coalesce(p->>'category','gear'), coalesce(p->>'description',''),
        (p->>'priceP')::int, nullif(btrim(coalesce(p->>'optionName','')), ''), opts, s,
        coalesce((p->>'active')::boolean, true), coalesce(p->>'artKind','tub'), coalesce(p->>'artTint','#E8661F'),
        (select coalesce(max(sort),0) + 1 from public.shop_products where gym_id = gid), img)
      returning * into r;
  else
    select * into r from public.shop_products where product_id = pid and gym_id = gid for update;
    if r.product_id is null then raise exception 'GONE'; end if;
    begin
      seen := (p->>'updatedAt')::timestamptz;
    exception when others then
      seen := null;
    end;
    if seen is null or seen <> r.updated_at then raise exception 'CHANGED'; end if;
    update public.shop_products set
        name = btrim(p->>'name'), category = coalesce(p->>'category', category),
        description = coalesce(p->>'description', description), price_p = (p->>'priceP')::int,
        option_name = nullif(btrim(coalesce(p->>'optionName','')), ''), options = opts, stock = s,
        active = coalesce((p->>'active')::boolean, active), art_kind = coalesce(p->>'artKind', art_kind),
        art_tint = coalesce(p->>'artTint', art_tint),
        image_url = case when has_img then img else image_url end,
        updated_at = now()
      where product_id = pid and gym_id = gid
      returning * into r;
  end if;
  return r;
end $$;

revoke all on function public._photo_url_ok(text) from public, anon, authenticated;
revoke all on function public.owner_photo_ticket(text) from public;
revoke all on function public.owner_set_product_photo(text, uuid, text) from public;
grant execute on function public.owner_photo_ticket(text)                  to anon, authenticated;
grant execute on function public.owner_set_product_photo(text, uuid, text) to anon, authenticated;
grant execute on function public.owner_save_product(text, jsonb)           to anon, authenticated;

-- The test gym's shaker carries a photo, so the cloud phone test sees one on a real screen.
-- (The file was uploaded once with a hand-made ticket; re-running 0002 re-seeds FORGE1's
-- products, so re-run this file after it.)
update public.shop_products set image_url =
  'https://hdxzqbdiokjklnypfisq.supabase.co/storage/v1/object/public/product-photos/f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0/shaker-dark.jpg'
where name = 'Shaker bottle 700 ml'
  and gym_id = (select gym_id from public.gyms where join_code = 'FORGE1');
