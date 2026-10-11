-- ForgeAI shop — review fixes (12 Oct 2026). Run after 0002_shop.sql. Re-runnable (create or
-- replace only; nothing is dropped).
--
-- 1. Stock is never overwritten with an old number. owner_save_product needs the row's
--    updated_at as the panel last saw it ("updatedAt"); if a member ordered since (or another tab
--    saved), it refuses with CHANGED. Quick restock and hide/show have their own calls that only
--    touch what they change: owner_add_stock (a delta) and owner_set_product_active.
-- 2. Restock on cancel skips a line whose product changed shape since (an option that no longer
--    exists, or a plain line on a product that now has options) instead of zeroing or skewing the
--    stock; and it locks products in one fixed order (by id), like member_place_order, so a
--    cancel and an order can never deadlock.
-- 3. member_place_order: totals are summed as bigint and capped (no raw "integer out of range"),
--    products are locked by id first, and one member can place at most 15 orders an hour
--    (TOO_MANY) so a single phone cannot drain the shelves.

-- ------------------------------------------------------------------ restock
create or replace function public._shop_restock(p_lines jsonb)
  returns void language plpgsql security definer set search_path = public as $$
declare l jsonb; pid uuid; opt_id text; q int; p public.shop_products;
begin
  -- Lock every product of the order in id order first (same order as member_place_order).
  perform 1 from public.shop_products
    where product_id in (select nullif(x.ln->>'productId','')::uuid from jsonb_array_elements(p_lines) as x(ln))
    order by product_id for update;
  for l in select x.ln from jsonb_array_elements(p_lines) as x(ln) order by x.ln->>'productId' loop
    pid := nullif(l->>'productId','')::uuid;
    opt_id := nullif(l->>'optionId','');
    q   := coalesce((l->>'qty')::int, 0);
    select * into p from public.shop_products where product_id = pid;
    if p.product_id is null or q <= 0 then continue; end if;
    if opt_id is null then
      -- A plain line, but the product has options now: no option to give it back to.
      if jsonb_array_length(p.options) > 0 then continue; end if;
      update public.shop_products set stock = least(100000, stock + q), updated_at = now()
        where product_id = pid;
    else
      -- The option was removed since (or the product became plain): nothing to restock.
      if not exists (select 1 from jsonb_array_elements(p.options) as x(o) where x.o->>'id' = opt_id) then
        continue;
      end if;
      update public.shop_products set
        options = (
          select jsonb_agg(case when e.o->>'id' = opt_id
                   then jsonb_set(e.o, '{stock}', to_jsonb(least(100000, coalesce((e.o->>'stock')::int,0) + q)))
                   else e.o end order by e.ord)
          from jsonb_array_elements(p.options) with ordinality as e(o, ord)),
        updated_at = now()
        where product_id = pid;
      update public.shop_products set stock = public._option_stock_sum(options) where product_id = pid;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------ owner: save / stock / hide
create or replace function public.owner_save_product(p_key text, p jsonb)
  returns public.shop_products language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_gym(p_key); pid uuid := nullif(p->>'productId','')::uuid;
        opts jsonb := coalesce(p->'options', '[]'::jsonb); r public.shop_products; s int;
        seen timestamptz;
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
    select * into r from public.shop_products where product_id = pid and gym_id = gid for update;
    if r.product_id is null then raise exception 'GONE'; end if;
    begin
      seen := (p->>'updatedAt')::timestamptz;
    exception when others then
      seen := null;
    end;
    -- The panel's copy is old (a member ordered, another tab saved): never write its stock over.
    if seen is null or seen <> r.updated_at then raise exception 'CHANGED'; end if;
    update public.shop_products set
        name = btrim(p->>'name'), category = coalesce(p->>'category', category),
        description = coalesce(p->>'description', description), price_p = (p->>'priceP')::int,
        option_name = nullif(btrim(coalesce(p->>'optionName','')), ''), options = opts, stock = s,
        active = coalesce((p->>'active')::boolean, active), art_kind = coalesce(p->>'artKind', art_kind),
        art_tint = coalesce(p->>'artTint', art_tint), updated_at = now()
      where product_id = pid and gym_id = gid
      returning * into r;
  end if;
  return r;
end $$;

-- Add (or, with a negative delta, take away) stock: a plain product, or one of its options.
create or replace function public.owner_add_stock(p_key text, p_product uuid, p_option text, p_delta int)
  returns public.shop_products language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_gym(p_key); r public.shop_products; opt text := nullif(p_option, '');
begin
  if p_delta is null or p_delta = 0 or abs(p_delta) > 10000 then raise exception 'BAD_STEP'; end if;
  select * into r from public.shop_products where product_id = p_product and gym_id = gid for update;
  if r.product_id is null then raise exception 'GONE'; end if;
  if opt is null then
    if jsonb_array_length(r.options) > 0 then raise exception 'BAD_OPTIONS'; end if;
    update public.shop_products set stock = least(100000, greatest(0, stock + p_delta)), updated_at = now()
      where product_id = p_product returning * into r;
  else
    if not exists (select 1 from jsonb_array_elements(r.options) as x(o) where x.o->>'id' = opt) then
      raise exception 'GONE';
    end if;
    update public.shop_products set
      options = (
        select jsonb_agg(case when e.o->>'id' = opt
                 then jsonb_set(e.o, '{stock}', to_jsonb(least(100000, greatest(0, coalesce((e.o->>'stock')::int,0) + p_delta))))
                 else e.o end order by e.ord)
        from jsonb_array_elements(r.options) with ordinality as e(o, ord)),
      updated_at = now()
      where product_id = p_product;
    update public.shop_products set stock = public._option_stock_sum(options)
      where product_id = p_product returning * into r;
  end if;
  return r;
end $$;

create or replace function public.owner_set_product_active(p_key text, p_product uuid, p_active boolean)
  returns public.shop_products language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_gym(p_key); r public.shop_products;
begin
  update public.shop_products set active = coalesce(p_active, true), updated_at = now()
    where product_id = p_product and gym_id = gid returning * into r;
  if r.product_id is null then raise exception 'GONE'; end if;
  return r;
end $$;

-- ------------------------------------------------------------------ member: place an order
create or replace function public.member_place_order(p_key text, p_lines jsonb)
  returns public.shop_orders language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  l jsonb; pid uuid; opt_id text; q int;
  p public.shop_products; opt jsonb; unit int; label text;
  out_lines jsonb := '[]'::jsonb; total bigint := 0; n int; recent int;
  res public.shop_orders;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
     or jsonb_array_length(p_lines) > 30 then
    raise exception 'EMPTY';
  end if;
  -- One order at a time per gym: the running number never repeats.
  perform 1 from public.gyms where gym_id = m.gym_id for update;
  select count(*) into recent from public.shop_orders
    where member_id = m.member_id and created_at > now() - interval '1 hour';
  if recent >= 15 then raise exception 'TOO_MANY'; end if;
  -- Lock the products in id order (the same order _shop_restock uses).
  perform 1 from public.shop_products
    where gym_id = m.gym_id
      and product_id in (select nullif(x.ln->>'productId','')::uuid from jsonb_array_elements(p_lines) as x(ln))
    order by product_id for update;
  for l in select x.ln from jsonb_array_elements(p_lines) as x(ln) loop
    begin
      pid := nullif(l->>'productId','')::uuid;
    exception when others then
      raise exception 'GONE';
    end;
    opt_id := nullif(l->>'optionId','');
    q   := coalesce((l->>'qty')::int, 0);
    if q <= 0 or q > 20 then raise exception 'EMPTY'; end if;
    select * into p from public.shop_products where product_id = pid and gym_id = m.gym_id;
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
    total := total + unit::bigint * q;
  end loop;
  if total > 100000000 then raise exception 'TOO_BIG'; end if;  -- ₹10 lakh in one order
  select coalesce(max(order_no), 0) + 1 into n from public.shop_orders where gym_id = m.gym_id;
  insert into public.shop_orders(gym_id, member_id, member_name, order_no, lines, total_p)
    values (m.gym_id, m.member_id, m.name, n, out_lines, total::int)
    returning * into res;
  update public.gym_members set last_seen = now() where member_id = m.member_id;
  return res;
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._shop_restock(jsonb) from public, anon, authenticated;
revoke all on function public.owner_add_stock(text, uuid, text, int) from public;
revoke all on function public.owner_set_product_active(text, uuid, boolean) from public;
grant execute on function public.owner_add_stock(text, uuid, text, int)          to anon, authenticated;
grant execute on function public.owner_set_product_active(text, uuid, boolean)   to anon, authenticated;
grant execute on function public.owner_save_product(text, jsonb)                 to anon, authenticated;
grant execute on function public.member_place_order(text, jsonb)                 to anon, authenticated;
