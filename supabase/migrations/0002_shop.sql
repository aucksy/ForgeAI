-- ForgeAI — the gym's own Shop (S2). The owner lists products in the web panel; members
-- see them in the app's Shop tab, order, and pay at the desk; the owner marks each order
-- ready / collected (or cancels it) and the member sees that in "My orders".
--
-- Money is in PAISE (whole numbers). Prices and stock are ALWAYS checked on the server
-- (place_order) — the phone's bag is a wish list, never the price.
--
-- Shapes match the app's S1 types (apps/mobile/src/shop/types.ts): a product's options are
-- a small JSON array [{id,label,priceP?,stock,tint?}] — a flavour or a size, with its own
-- stock — so a screen swaps the demo catalog for the gym's without learning a new shape.
--
-- Apply: Supabase SQL editor (after 0001_init.sql). Re-runnable.

-- ------------------------------------------------------------------ tables
create table if not exists public.shop_products (
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

create table if not exists public.shop_orders (
  order_id    uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  member_id   uuid references auth.users(id) on delete set null,
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

-- ------------------------------------------------------------------ RLS
alter table public.shop_products enable row level security;
alter table public.shop_orders   enable row level security;

-- Products: everyone in the gym reads them; owners and trainers write them.
drop policy if exists products_read on public.shop_products;
create policy products_read on public.shop_products for select
  using (gym_id = (select public.auth_gym_id()));
drop policy if exists products_staff_write on public.shop_products;
create policy products_staff_write on public.shop_products for all
  using (gym_id = (select public.auth_gym_id()) and (select public.auth_role()) in ('owner','trainer'))
  with check (gym_id = (select public.auth_gym_id()) and (select public.auth_role()) in ('owner','trainer'));

-- Orders: a member reads their own; staff read the gym's. ALL writes go through the RPCs
-- below (prices, stock and status rules live there), so no direct DML for clients.
drop policy if exists orders_self_read on public.shop_orders;
create policy orders_self_read on public.shop_orders for select
  using (member_id = (select auth.uid()));
drop policy if exists orders_staff_read on public.shop_orders;
create policy orders_staff_read on public.shop_orders for select
  using (gym_id = (select public.auth_gym_id()) and (select public.auth_role()) in ('owner','trainer'));
revoke insert, update, delete on public.shop_orders from authenticated, anon;

-- ------------------------------------------------------------------ helpers
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
          select coalesce(jsonb_agg(case when o->>'id' = opt_id
                   then jsonb_set(o, '{stock}', to_jsonb(least(100000, coalesce((o->>'stock')::int,0) + q)))
                   else o end order by ord), '[]'::jsonb)
          from jsonb_array_elements(p.options) with ordinality as e(o, ord)),
        updated_at = now()
        where product_id = pid;
      update public.shop_products set stock = (
          select coalesce(sum(coalesce((o->>'stock')::int,0)),0) from jsonb_array_elements(options) o)
        where product_id = pid;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------ member RPCs
-- The member's name as the gym sees it (orders, the panel's app members). Members cannot
-- write `profiles` directly (0001), so this is the one door, and it only touches the name.
create or replace function public.set_my_display_name(p_name text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set display_name = nullif(left(btrim(coalesce(p_name,'')), 60), '')
    where id = auth.uid();
end $$;

-- Turn the bag into an order. Lines: [{productId, optionId|null, qty}]. Every price and
-- every stock count is read HERE, under a row lock, so two members cannot buy the last tub.
-- Errors the app maps to words: NOT_IN_GYM, EMPTY, SOLD_OUT:<name>, GONE.
create or replace function public.place_order(p_lines jsonb)
  returns public.shop_orders language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_gym uuid; my_name text;
  l jsonb; pid uuid; opt_id text; q int;
  p public.shop_products; opt jsonb; unit int; label text;
  out_lines jsonb := '[]'::jsonb; total int := 0; n int;
  res public.shop_orders;
begin
  select gym_id, display_name into my_gym, my_name from public.profiles where id = me;
  if my_gym is null then raise exception 'NOT_IN_GYM'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
     or jsonb_array_length(p_lines) > 30 then
    raise exception 'EMPTY';
  end if;
  -- One order at a time per gym: the running number never repeats.
  perform 1 from public.gyms where gym_id = my_gym for update;
  for l in select * from jsonb_array_elements(p_lines) loop
    pid := nullif(l->>'productId','')::uuid;
    opt_id := nullif(l->>'optionId','');
    q   := coalesce((l->>'qty')::int, 0);
    if q <= 0 or q > 20 then raise exception 'EMPTY'; end if;
    select * into p from public.shop_products
      where product_id = pid and gym_id = my_gym for update;
    if p.product_id is null or not p.active then raise exception 'GONE'; end if;
    if opt_id is null then
      if jsonb_array_length(p.options) > 0 then raise exception 'GONE'; end if;
      if p.stock < q then raise exception 'SOLD_OUT:%', p.name; end if;
      unit := p.price_p; label := p.name;
      update public.shop_products set stock = stock - q, updated_at = now() where product_id = pid;
    else
      select o into opt from jsonb_array_elements(p.options) o where o->>'id' = opt_id;
      if opt is null then raise exception 'GONE'; end if;
      if coalesce((opt->>'stock')::int, 0) < q then
        raise exception 'SOLD_OUT:%', p.name || ' · ' || (opt->>'label');
      end if;
      unit := coalesce((opt->>'priceP')::int, p.price_p);
      label := p.name || ' · ' || (opt->>'label');
      update public.shop_products set
        options = (
          select jsonb_agg(case when o->>'id' = opt_id
                   then jsonb_set(o, '{stock}', to_jsonb(coalesce((o->>'stock')::int,0) - q))
                   else o end order by ord)
          from jsonb_array_elements(p.options) with ordinality as e(o, ord)),
        updated_at = now()
        where product_id = pid;
      update public.shop_products set stock = (
          select coalesce(sum(coalesce((o->>'stock')::int,0)),0) from jsonb_array_elements(options) o)
        where product_id = pid;
    end if;
    out_lines := out_lines || jsonb_build_array(jsonb_build_object(
      'productId', pid, 'optionId', opt_id, 'name', label, 'qty', q, 'unitPriceP', unit));
    total := total + unit * q;
  end loop;
  select coalesce(max(order_no), 0) + 1 into n from public.shop_orders where gym_id = my_gym;
  insert into public.shop_orders(gym_id, member_id, member_name, order_no, lines, total_p)
    values (my_gym, me, my_name, n, out_lines, total)
    returning * into res;
  return res;
end $$;

-- A member cancels their own order while the gym has not got it ready yet.
create or replace function public.cancel_my_order(p_order uuid)
  returns public.shop_orders language plpgsql security definer set search_path = public as $$
declare o public.shop_orders;
begin
  select * into o from public.shop_orders where order_id = p_order and member_id = auth.uid() for update;
  if o.order_id is null then raise exception 'GONE'; end if;
  if o.status <> 'ordered' then raise exception 'TOO_LATE'; end if;
  perform public._shop_restock(o.lines);
  update public.shop_orders set status = 'cancelled', cancelled_by = 'member', updated_at = now()
    where order_id = p_order returning * into o;
  return o;
end $$;

-- ------------------------------------------------------------------ staff RPCs
-- ordered -> ready -> collected; ordered|ready -> cancelled (stock goes back). Also ready ->
-- ordered (a mis-tap at the desk must be undoable). Collected and cancelled are final.
create or replace function public.set_order_status(p_order uuid, p_status text)
  returns public.shop_orders language plpgsql security definer set search_path = public as $$
declare o public.shop_orders;
begin
  if public.auth_role() not in ('owner','trainer') then raise exception 'NOT_STAFF'; end if;
  select * into o from public.shop_orders where order_id = p_order and gym_id = public.auth_gym_id() for update;
  if o.order_id is null then raise exception 'GONE'; end if;
  if not (
       (o.status = 'ordered' and p_status in ('ready','collected','cancelled'))
    or (o.status = 'ready'   and p_status in ('ordered','collected','cancelled'))
  ) then raise exception 'BAD_STEP'; end if;
  if p_status = 'cancelled' then perform public._shop_restock(o.lines); end if;
  update public.shop_orders set status = p_status,
      cancelled_by = case when p_status = 'cancelled' then 'gym' else null end,
      updated_at = now()
    where order_id = p_order returning * into o;
  return o;
end $$;

-- Fill an empty shop with sample products (the panel's "Add sample products"). Owner only;
-- does nothing when the gym already has products.
create or replace function public.seed_demo_shop()
  returns integer language plpgsql security definer set search_path = public as $$
declare g uuid := public.auth_gym_id(); c int;
begin
  if public.auth_role() <> 'owner' then raise exception 'NOT_STAFF'; end if;
  select count(*) into c from public.shop_products where gym_id = g;
  if c > 0 then return 0; end if;
  perform public._seed_shop(g);
  select count(*) into c from public.shop_products where gym_id = g;
  return c;
end $$;

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
  (g, 'Creatine monohydrate 250 g', 'creatine', '3–5 g a day, every day.', 89900, null, '[]', 18, 'jar', '#F5F5F5', 6),
  (g, 'Shaker bottle 700 ml', 'gear', 'Leak-proof lid, mixing ball.', 39900, null, '[]', 25, 'shaker', '#E8661F', 7),
  (g, 'Lifting gloves', 'gear', 'Padded palm, wrist strap.', 69900, 'Size',
     '[{"id":"m","label":"M","stock":4},{"id":"l","label":"L","stock":5},{"id":"xl","label":"XL","stock":2}]', 11, 'gloves', '#333A45', 8),
  (g, 'Gym towel', 'gear', 'Quick-dry microfibre.', 29900, null, '[]', 30, 'towel', '#2F7D6D', 9),
  (g, 'Gym T-shirt', 'clothing', 'Dry-fit, with the gym''s logo.', 59900, 'Size',
     '[{"id":"s","label":"S","stock":3},{"id":"m","label":"M","stock":6},{"id":"l","label":"L","stock":6},{"id":"xl","label":"XL","stock":3}]', 18, 'tshirt', '#1F2937', 10),
  (g, 'Electrolyte drink 500 ml', 'drinks', 'Cold, from the desk fridge.', 6000, null, '[]', 40, 'bottle', '#29B6F6', 11),
  (g, 'Black coffee (cold brew)', 'drinks', 'No sugar. 150 mg caffeine.', 9000, null, '[]', 20, 'bottle', '#3E2723', 12);
$$;

revoke all on function public._shop_restock(jsonb) from public, anon, authenticated;
revoke all on function public._seed_shop(uuid)     from public, anon, authenticated;
grant execute on function public.set_my_display_name(text)     to authenticated;
grant execute on function public.place_order(jsonb)            to authenticated;
grant execute on function public.cancel_my_order(uuid)         to authenticated;
grant execute on function public.set_order_status(uuid, text)  to authenticated;
grant execute on function public.seed_demo_shop()              to authenticated;

-- ------------------------------------------------------------------ test gym
-- A fixed gym for the cloud phone test (code FORGE1), with the sample shop. No owner.
do $$
declare g uuid;
begin
  select gym_id into g from public.gyms where join_code = 'FORGE1';
  if g is null then
    insert into public.gyms(name, join_code) values ('ForgeAI Test Gym', 'FORGE1') returning gym_id into g;
  end if;
  if not exists (select 1 from public.shop_products where gym_id = g) then
    perform public._seed_shop(g);
  end if;
end $$;
