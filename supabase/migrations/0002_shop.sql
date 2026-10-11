-- ForgeAI — the gym's own Shop and member list (S2). The owner runs the gym in the web panel
-- (forgeai.aakashpahuja.in); members see the gym's products in the app's Shop tab, order, and pay
-- at the desk; the owner marks each order ready / collected (or cancels it) and the member sees
-- that in "My orders".
--
-- WHO IS WHO, WITHOUT ACCOUNTS. The demo must run with no sign-up and no password, and this
-- project's auth settings are not changed. So each side holds a KEY the database itself made:
--   * the panel's "Start demo" (demo_start_gym) makes a gym and returns its OWNER KEY;
--   * the app's "Join" (member_join, gym code + name) returns that member's MEMBER KEY.
-- Keys are random 48-hex-char secrets; only their SHA-256 is stored. Every read and write goes
-- through a SECURITY DEFINER function that checks the key first. The tables themselves are
-- closed to the public roles (RLS on, no policies, no grants).
--
-- Money is in PAISE (whole numbers). Prices and stock are ALWAYS checked here (member_place_order)
-- under a row lock — the phone's bag is a wish list, never the price.
--
-- Shapes match the app's S1 types (apps/mobile/src/shop/types.ts): a product's options are a small
-- JSON array [{id,label,priceP?,stock,tint?}] (a flavour or a size, with its own stock).
--
-- Apply: Supabase SQL editor (after 0001_init.sql). Re-runnable; it drops and rebuilds the shop
-- objects (no real data lives in them yet).

create extension if not exists pgcrypto;

drop function if exists public.place_order(jsonb);
drop function if exists public.cancel_my_order(uuid);
drop function if exists public.set_order_status(uuid, text);
drop function if exists public.seed_demo_shop();
drop function if exists public.set_my_display_name(text);
drop function if exists public._shop_restock(jsonb);
drop function if exists public._seed_shop(uuid);
drop table if exists public.shop_orders;
drop table if exists public.shop_products;

-- ------------------------------------------------------------------ tables
create table if not exists public.gym_owner_keys (
  gym_id     uuid primary key references public.gyms(gym_id) on delete cascade,
  key_hash   bytea not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.gym_members (
  member_id  uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 60),
  phone      text check (phone is null or length(phone) <= 20),
  key_hash   bytea not null unique,
  joined_at  timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
create index if not exists idx_gym_members_gym on public.gym_members(gym_id, joined_at desc);

create table public.shop_products (
  product_id  uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  category    text not null default 'gear'
              check (category in ('protein','preworkout','creatine','gear','clothing','drinks')),
  description text not null default '' check (length(description) <= 600),
  price_p     integer not null check (price_p between 100 and 10000000),
  option_name text check (option_name is null or length(option_name) <= 30),
  options     jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  stock       integer not null default 0 check (stock between 0 and 100000),
  active      boolean not null default true,
  art_kind    text not null default 'tub'
              check (art_kind in ('tub','jar','pouch','barbox','shaker','bottle','gloves','belt','wraps','band','towel','tshirt')),
  art_tint    text not null default '#E8661F' check (art_tint ~ '^#[0-9A-Fa-f]{6}$'),
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_products_gym on public.shop_products(gym_id, sort, created_at);

create table public.shop_orders (
  order_id    uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  member_id   uuid references public.gym_members(member_id) on delete set null,
  member_name text,
  -- Per-gym running number the desk calls out ("Order 12").
  order_no    integer not null,
  -- [{productId, optionId, name, qty, unitPriceP}] — name and price as they were when ordered.
  lines       jsonb not null check (jsonb_typeof(lines) = 'array'),
  total_p     integer not null check (total_p >= 0),
  status      text not null default 'ordered' check (status in ('ordered','ready','collected','cancelled')),
  cancelled_by text check (cancelled_by in ('member','gym')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (gym_id, order_no)
);
create index if not exists idx_orders_gym on public.shop_orders(gym_id, created_at desc);
create index if not exists idx_orders_member on public.shop_orders(member_id, created_at desc);

-- Closed tables: RLS on with no policies, and no grants to the public roles.
alter table public.gym_owner_keys enable row level security;
alter table public.gym_members    enable row level security;
alter table public.shop_products  enable row level security;
alter table public.shop_orders    enable row level security;
revoke all on public.gym_owner_keys, public.gym_members, public.shop_products, public.shop_orders
  from anon, authenticated;

-- ------------------------------------------------------------------ key helpers
create or replace function public._new_key() returns text
  language sql volatile set search_path = public, extensions as $$
  select encode(gen_random_bytes(24), 'hex')
$$;

create or replace function public._hash_key(k text) returns bytea
  language sql immutable set search_path = public, extensions as $$
  select digest(coalesce(k, ''), 'sha256')
$$;

-- The gym an owner key opens; raises BAD_KEY otherwise.
create or replace function public._owner_gym(p_key text) returns uuid
  language plpgsql stable security definer set search_path = public as $$
declare g uuid;
begin
  select gym_id into g from public.gym_owner_keys where key_hash = public._hash_key(p_key);
  if g is null then raise exception 'BAD_KEY'; end if;
  return g;
end $$;

-- The member a member key opens; raises BAD_KEY otherwise.
create or replace function public._member(p_key text) returns public.gym_members
  language plpgsql stable security definer set search_path = public as $$
declare m public.gym_members;
begin
  select * into m from public.gym_members where key_hash = public._hash_key(p_key);
  if m.member_id is null then raise exception 'BAD_KEY'; end if;
  return m;
end $$;

-- Put stock back for every line of an order (cancel). Options and plain products alike.
create or replace function public._shop_restock(p_lines jsonb)
  returns void language plpgsql security definer set search_path = public as $$
declare l jsonb; pid uuid; opt_id text; q int; p public.shop_products;
begin
  for l in select * from jsonb_array_elements(p_lines) loop
    pid := nullif(l->>'productId','')::uuid;
    opt_id := nullif(l->>'optionId','');
    q   := coalesce((l->>'qty')::int, 0);
    select * into p from public.shop_products where product_id = pid for update;
    if p.product_id is null or q <= 0 then continue; end if;
    if opt_id is null then
      update public.shop_products set stock = least(100000, stock + q), updated_at = now()
        where product_id = pid;
    else
      update public.shop_products set
        options = (
          select coalesce(jsonb_agg(case when e.o->>'id' = opt_id
                   then jsonb_set(e.o, '{stock}', to_jsonb(least(100000, coalesce((e.o->>'stock')::int,0) + q)))
                   else e.o end order by e.ord), '[]'::jsonb)
          from jsonb_array_elements(p.options) with ordinality as e(o, ord)),
        updated_at = now()
        where product_id = pid;
      update public.shop_products set stock = (
          select coalesce(sum(coalesce((x.o->>'stock')::int,0)),0) from jsonb_array_elements(options) as x(o))
        where product_id = pid;
    end if;
  end loop;
end $$;

-- Keep a product's stock equal to the sum of its options' stock (when it has options).
create or replace function public._option_stock_sum(p_options jsonb) returns integer
  language sql immutable as $$
  select coalesce(sum(greatest(0, coalesce((x.o->>'stock')::int, 0))), 0)::int
  from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) as x(o)
$$;

-- The sample catalog (the panel's "Start demo" and the test gym).
create or replace function public._seed_shop(g uuid)
  returns void language sql security definer set search_path = public as $$
  insert into public.shop_products(gym_id, name, category, description, price_p, option_name, options, stock, art_kind, art_tint, sort) values
  (g, 'Whey protein 1 kg', 'protein', '24 g protein a scoop. Mixes in water or milk.', 249900, 'Flavour',
     '[{"id":"choc","label":"Chocolate","stock":12,"tint":"#7A4A2A"},{"id":"van","label":"Vanilla","stock":8,"tint":"#E9D8A6"},{"id":"str","label":"Strawberry","stock":0,"tint":"#D9536F"}]', 20, 'tub', '#7A4A2A', 1),
  (g, 'Whey isolate 1 kg', 'protein', '27 g protein a scoop, low lactose.', 379900, null, '[]', 6, 'tub', '#5B6475', 2),
  (g, 'Mass gainer 3 kg', 'protein', 'For members who struggle to eat enough.', 289900, null, '[]', 5, 'pouch', '#E8661F', 3),
  (g, 'Protein bars, box of 12', 'protein', '20 g protein each. Chocolate peanut.', 119900, null, '[]', 15, 'barbox', '#C98A12', 4),
  (g, 'Pre-workout 300 g', 'preworkout', '30 servings. Caffeine 200 mg a scoop.', 179900, 'Flavour',
     '[{"id":"fruit","label":"Fruit punch","stock":7,"tint":"#C2185B"},{"id":"lime","label":"Lemon lime","stock":4,"tint":"#7CB342"}]', 11, 'jar', '#C2185B', 5),
  (g, 'Creatine monohydrate 250 g', 'creatine', '3 to 5 g a day, every day.', 89900, null, '[]', 18, 'jar', '#ECEFF1', 6),
  (g, 'Shaker bottle 700 ml', 'gear', 'Leak-proof lid, mixing ball.', 39900, null, '[]', 25, 'shaker', '#E8661F', 7),
  (g, 'Lifting gloves', 'gear', 'Padded palm, wrist strap.', 69900, 'Size',
     '[{"id":"m","label":"M","stock":4},{"id":"l","label":"L","stock":5},{"id":"xl","label":"XL","stock":2}]', 11, 'gloves', '#333A45', 8),
  (g, 'Gym towel', 'gear', 'Quick-dry microfibre.', 29900, null, '[]', 30, 'towel', '#2F7D6D', 9),
  (g, 'Gym T-shirt', 'clothing', 'Dry-fit, with the gym''s logo.', 59900, 'Size',
     '[{"id":"s","label":"S","stock":3},{"id":"m","label":"M","stock":6},{"id":"l","label":"L","stock":6},{"id":"xl","label":"XL","stock":3}]', 18, 'tshirt', '#1F2937', 10),
  (g, 'Electrolyte drink 500 ml', 'drinks', 'Cold, from the desk fridge.', 6000, null, '[]', 40, 'bottle', '#29B6F6', 11),
  (g, 'Black coffee, cold brew', 'drinks', 'No sugar. 150 mg caffeine.', 9000, null, '[]', 20, 'bottle', '#3E2723', 12);
$$;

-- ------------------------------------------------------------------ owner (panel) functions
-- Make a gym with the sample shop and return its owner key. The demo's front door.
-- A brake on abuse: at most 300 new gyms an hour across the project.
create or replace function public.demo_start_gym(p_name text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.gyms; k text := public._new_key(); n int;
begin
  select count(*) into n from public.gym_owner_keys where created_at > now() - interval '1 hour';
  if n >= 300 then raise exception 'BUSY'; end if;
  insert into public.gyms(name, join_code)
    values (coalesce(nullif(left(btrim(coalesce(p_name,'')), 60), ''), 'My Gym'),
            upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)))
    returning * into g;
  insert into public.gym_owner_keys(gym_id, key_hash) values (g.gym_id, public._hash_key(k));
  perform public._seed_shop(g.gym_id);
  return jsonb_build_object('gymId', g.gym_id, 'name', g.name, 'joinCode', g.join_code, 'ownerKey', k);
end $$;

create or replace function public.owner_gym(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.gyms;
begin
  select * into g from public.gyms where gym_id = public._owner_gym(p_key);
  return jsonb_build_object('gymId', g.gym_id, 'name', g.name, 'joinCode', g.join_code);
end $$;

create or replace function public.owner_rename_gym(p_key text, p_name text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_gym(p_key);
begin
  if length(btrim(coalesce(p_name,''))) = 0 then raise exception 'EMPTY'; end if;
  update public.gyms set name = left(btrim(p_name), 60) where gym_id = gid;
  return public.owner_gym(p_key);
end $$;

create or replace function public.owner_products(p_key text)
  returns setof public.shop_products language sql security definer set search_path = public as $$
  select * from public.shop_products where gym_id = public._owner_gym(p_key) order by sort, created_at
$$;

-- Insert (no productId) or update one product. p: {productId?, name, category, description,
-- priceP, optionName, options, stock, active, artKind, artTint}.
create or replace function public.owner_save_product(p_key text, p jsonb)
  returns public.shop_products language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_gym(p_key); pid uuid := nullif(p->>'productId','')::uuid;
        opts jsonb := coalesce(p->'options', '[]'::jsonb); r public.shop_products; s int;
begin
  if jsonb_typeof(opts) <> 'array' or jsonb_array_length(opts) > 12 then raise exception 'BAD_OPTIONS'; end if;
  s := case when jsonb_array_length(opts) > 0 then public._option_stock_sum(opts)
            else greatest(0, coalesce((p->>'stock')::int, 0)) end;
  if pid is null then
    insert into public.shop_products(gym_id, name, category, description, price_p, option_name, options,
        stock, active, art_kind, art_tint, sort)
      values (gid, btrim(p->>'name'), coalesce(p->>'category','gear'), coalesce(p->>'description',''),
        (p->>'priceP')::int, nullif(btrim(coalesce(p->>'optionName','')), ''), opts, s,
        coalesce((p->>'active')::boolean, true), coalesce(p->>'artKind','tub'), coalesce(p->>'artTint','#E8661F'),
        (select coalesce(max(sort),0) + 1 from public.shop_products where gym_id = gid))
      returning * into r;
  else
    update public.shop_products set
        name = btrim(p->>'name'), category = coalesce(p->>'category', category),
        description = coalesce(p->>'description', description), price_p = (p->>'priceP')::int,
        option_name = nullif(btrim(coalesce(p->>'optionName','')), ''), options = opts, stock = s,
        active = coalesce((p->>'active')::boolean, active), art_kind = coalesce(p->>'artKind', art_kind),
        art_tint = coalesce(p->>'artTint', art_tint), updated_at = now()
      where product_id = pid and gym_id = gid
      returning * into r;
    if r.product_id is null then raise exception 'GONE'; end if;
  end if;
  return r;
end $$;

create or replace function public.owner_delete_product(p_key text, p_product uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.shop_products where product_id = p_product and gym_id = public._owner_gym(p_key);
end $$;

create or replace function public.owner_orders(p_key text)
  returns setof public.shop_orders language sql security definer set search_path = public as $$
  select * from public.shop_orders where gym_id = public._owner_gym(p_key)
  order by created_at desc limit 300
$$;

-- ordered -> ready -> collected; ordered|ready -> cancelled (stock goes back); ready -> ordered
-- (a mis-tap at the desk must be undoable). Collected and cancelled are final.
create or replace function public.owner_set_order_status(p_key text, p_order uuid, p_status text)
  returns public.shop_orders language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_gym(p_key); r public.shop_orders;
begin
  select * into r from public.shop_orders where order_id = p_order and gym_id = gid for update;
  if r.order_id is null then raise exception 'GONE'; end if;
  if not (
       (r.status = 'ordered' and p_status in ('ready','collected','cancelled'))
    or (r.status = 'ready'   and p_status in ('ordered','collected','cancelled'))
  ) then raise exception 'BAD_STEP'; end if;
  if p_status = 'cancelled' then perform public._shop_restock(r.lines); end if;
  update public.shop_orders set status = p_status,
      cancelled_by = case when p_status = 'cancelled' then 'gym' else null end,
      updated_at = now()
    where order_id = p_order returning * into r;
  return r;
end $$;

-- The members who joined from the app, with their order counts.
create or replace function public.owner_app_members(p_key text)
  returns table(member_id uuid, name text, phone text, joined_at timestamptz, last_seen timestamptz,
                orders bigint, spent_p bigint)
  language sql security definer set search_path = public as $$
  select m.member_id, m.name, m.phone, m.joined_at, m.last_seen,
         count(o.order_id) filter (where o.status <> 'cancelled'),
         coalesce(sum(o.total_p) filter (where o.status = 'collected'), 0)
  from public.gym_members m
  left join public.shop_orders o on o.member_id = m.member_id
  where m.gym_id = public._owner_gym(p_key)
  group by m.member_id
  order by m.joined_at desc
$$;

-- ------------------------------------------------------------------ member (app) functions
-- Join a gym by its code. Returns the member key (kept on the phone) and the gym.
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
                            'gymName', g.name, 'joinCode', g.join_code, 'name', m.name);
end $$;

create or replace function public.member_me(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); g public.gyms;
begin
  update public.gym_members set last_seen = now() where member_id = m.member_id;
  select * into g from public.gyms where gym_id = m.gym_id;
  return jsonb_build_object('memberId', m.member_id, 'gymId', g.gym_id, 'gymName', g.name,
                            'joinCode', g.join_code, 'name', m.name);
end $$;

create or replace function public.member_set_name(p_key text, p_name text)
  returns void language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key);
begin
  if length(btrim(coalesce(p_name,''))) = 0 then raise exception 'EMPTY'; end if;
  update public.gym_members set name = left(btrim(p_name), 60) where member_id = m.member_id;
end $$;

-- Leaving the gym's shop: the key stops working. Past orders stay with the gym (money records).
create or replace function public.member_leave(p_key text)
  returns void language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key);
begin
  update public.gym_members set key_hash = public._hash_key(public._new_key()) where member_id = m.member_id;
end $$;

create or replace function public.member_products(p_key text)
  returns setof public.shop_products language sql security definer set search_path = public as $$
  select * from public.shop_products where gym_id = (public._member(p_key)).gym_id and active
  order by sort, created_at
$$;

create or replace function public.member_orders(p_key text)
  returns setof public.shop_orders language sql security definer set search_path = public as $$
  select * from public.shop_orders where member_id = (public._member(p_key)).member_id
  order by created_at desc limit 100
$$;

-- Turn the bag into an order. Lines: [{productId, optionId|null, qty}]. Every price and every
-- stock count is read HERE, under a row lock, so two members cannot buy the last tub.
-- Errors the app maps to words: EMPTY, SOLD_OUT:<name>, GONE, BAD_KEY.
create or replace function public.member_place_order(p_key text, p_lines jsonb)
  returns public.shop_orders language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  l jsonb; pid uuid; opt_id text; q int;
  p public.shop_products; opt jsonb; unit int; label text;
  out_lines jsonb := '[]'::jsonb; total int := 0; n int;
  res public.shop_orders;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
     or jsonb_array_length(p_lines) > 30 then
    raise exception 'EMPTY';
  end if;
  -- One order at a time per gym: the running number never repeats.
  perform 1 from public.gyms where gym_id = m.gym_id for update;
  for l in select * from jsonb_array_elements(p_lines) loop
    pid := nullif(l->>'productId','')::uuid;
    opt_id := nullif(l->>'optionId','');
    q   := coalesce((l->>'qty')::int, 0);
    if q <= 0 or q > 20 then raise exception 'EMPTY'; end if;
    select * into p from public.shop_products
      where product_id = pid and gym_id = m.gym_id for update;
    if p.product_id is null or not p.active then raise exception 'GONE'; end if;
    if opt_id is null then
      if jsonb_array_length(p.options) > 0 then raise exception 'GONE'; end if;
      if p.stock < q then raise exception 'SOLD_OUT:%', p.name; end if;
      unit := p.price_p; label := p.name;
      update public.shop_products set stock = stock - q, updated_at = now() where product_id = pid;
    else
      select x.o into opt from jsonb_array_elements(p.options) as x(o) where x.o->>'id' = opt_id;
      if opt is null then raise exception 'GONE'; end if;
      if coalesce((opt->>'stock')::int, 0) < q then
        raise exception 'SOLD_OUT:%', p.name || ' · ' || (opt->>'label');
      end if;
      unit := coalesce((opt->>'priceP')::int, p.price_p);
      label := p.name || ' · ' || (opt->>'label');
      update public.shop_products set
        options = (
          select jsonb_agg(case when e.o->>'id' = opt_id
                   then jsonb_set(e.o, '{stock}', to_jsonb(coalesce((e.o->>'stock')::int,0) - q))
                   else e.o end order by e.ord)
          from jsonb_array_elements(p.options) with ordinality as e(o, ord)),
        updated_at = now()
        where product_id = pid;
      update public.shop_products set stock = public._option_stock_sum(options) where product_id = pid;
    end if;
    out_lines := out_lines || jsonb_build_array(jsonb_build_object(
      'productId', pid, 'optionId', opt_id, 'name', label, 'qty', q, 'unitPriceP', unit));
    total := total + unit * q;
  end loop;
  select coalesce(max(order_no), 0) + 1 into n from public.shop_orders where gym_id = m.gym_id;
  insert into public.shop_orders(gym_id, member_id, member_name, order_no, lines, total_p)
    values (m.gym_id, m.member_id, m.name, n, out_lines, total)
    returning * into res;
  update public.gym_members set last_seen = now() where member_id = m.member_id;
  return res;
end $$;

-- A member cancels their own order while the gym has not got it ready yet.
create or replace function public.member_cancel_order(p_key text, p_order uuid)
  returns public.shop_orders language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); r public.shop_orders;
begin
  select * into r from public.shop_orders where order_id = p_order and member_id = m.member_id for update;
  if r.order_id is null then raise exception 'GONE'; end if;
  if r.status <> 'ordered' then raise exception 'TOO_LATE'; end if;
  perform public._shop_restock(r.lines);
  update public.shop_orders set status = 'cancelled', cancelled_by = 'member', updated_at = now()
    where order_id = p_order returning * into r;
  return r;
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._new_key()                from public, anon, authenticated;
revoke all on function public._hash_key(text)           from public, anon, authenticated;
revoke all on function public._owner_gym(text)          from public, anon, authenticated;
revoke all on function public._member(text)             from public, anon, authenticated;
revoke all on function public._shop_restock(jsonb)      from public, anon, authenticated;
revoke all on function public._seed_shop(uuid)          from public, anon, authenticated;
revoke all on function public._option_stock_sum(jsonb)  from public, anon, authenticated;

grant execute on function public.demo_start_gym(text)                       to anon, authenticated;
grant execute on function public.owner_gym(text)                            to anon, authenticated;
grant execute on function public.owner_rename_gym(text, text)               to anon, authenticated;
grant execute on function public.owner_products(text)                       to anon, authenticated;
grant execute on function public.owner_save_product(text, jsonb)            to anon, authenticated;
grant execute on function public.owner_delete_product(text, uuid)           to anon, authenticated;
grant execute on function public.owner_orders(text)                         to anon, authenticated;
grant execute on function public.owner_set_order_status(text, uuid, text)   to anon, authenticated;
grant execute on function public.owner_app_members(text)                    to anon, authenticated;
grant execute on function public.member_join(text, text, text)              to anon, authenticated;
grant execute on function public.member_me(text)                            to anon, authenticated;
grant execute on function public.member_set_name(text, text)                to anon, authenticated;
grant execute on function public.member_leave(text)                         to anon, authenticated;
grant execute on function public.member_products(text)                      to anon, authenticated;
grant execute on function public.member_orders(text)                        to anon, authenticated;
grant execute on function public.member_place_order(text, jsonb)            to anon, authenticated;
grant execute on function public.member_cancel_order(text, uuid)            to anon, authenticated;

-- ------------------------------------------------------------------ test gym
-- A fixed gym for the cloud phone test (code FORGE1), with the sample shop. Its stock is
-- topped back up on every re-run of this file.
do $$
declare g uuid;
begin
  select gym_id into g from public.gyms where join_code = 'FORGE1';
  if g is null then
    insert into public.gyms(name, join_code) values ('ForgeAI Test Gym', 'FORGE1') returning gym_id into g;
  end if;
  delete from public.shop_products where gym_id = g;
  perform public._seed_shop(g);
end $$;
