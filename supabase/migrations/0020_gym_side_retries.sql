-- 0020: the gym side of the member app, on a patchy network (16 Oct 2026, audit
-- Audit/e2e-v2/C6-gym-side.md: C6-1, C6-6, C6-8, C6-12). Apply after 0019. Re-runnable. The test is
-- supabase/tests/0020_gym_side_retries.sql (CI runs it after every migration).
--
-- Old app versions keep working: every new argument below is optional, and a call without it does
-- exactly what it did before.
--
-- 1. ONE TAP, ONE ORDER (C6-1). When the gym wrote an order but the answer was lost on the way back
--    (4G in the basement), the app said "No internet", kept the bag, and the member's second tap made
--    a second order and took the stock twice. Now the app gives each order its own id before sending
--    it (p_order_id) and sends the same id again on a retry. The same id again returns the order the
--    gym already has (same number, stock taken once) — but only an OPEN order (Ordered or Ready) of
--    this member from the last 24 hours. A collected, cancelled or older order is never handed back
--    for a new tap: that is a new order (review of wave 4a). The app itself keeps an id 15 minutes.
-- 2. ONE MEMBER PER JOIN (C6-6). A Join whose answer was lost, tapped again, made a second "Rahul" on
--    the gym's list who never leaves and is counted in every message's "seen by x of y". Now the app
--    sends its own join id (p_join_id) and the same id within a day gives back the same member, with
--    a fresh key (the first key never reached the phone). Only a hash of the id is kept.
-- 3. CHECK-IN NUMBER TRIES (C6-8). Typing the same mobile number again after "the gym doesn't have
--    your number yet" counted as a new number every time, so three taps of one number said "Too many
--    numbers were tried today", and seven such members in an hour locked the whole gym out of typing
--    numbers. Now one number counts once a day per member, and once an hour for the gym's limit.
--    The count stores an md5 tag of gym + number, not the number as typed. That tag is NOT private:
--    there are only ~4 billion Indian mobile numbers, so anyone who can read the table can recover a
--    number by trying them all. It is a rate-limit tag, readable only by the database owner (RLS on,
--    no grants), and deleted within 2 days (member tries) or 1 day (gym misses).
-- 4. CHECK-IN TIME (C6-12). A visit the desk imported from a paper register has no real time (0); the
--    answer now says "no time" (null) instead of a time, so the app never shows "5:30 am".

-- ------------------------------------------------------------------ 1. one tap, one order
alter table public.shop_orders add column if not exists client_order_id uuid;
-- Not unique: an id that was matched before (now collected, or old) may come again as a new order.
-- Two copies of one tap never both write: the second waits on the gym's lock and then finds the first.
drop index if exists public.shop_orders_member_client_id;
create index if not exists shop_orders_member_client_order
  on public.shop_orders(member_id, client_order_id) where client_order_id is not null;

-- 0003's member_place_order with the order id added (the rest is unchanged). The 2-argument version
-- goes: with both, a call naming only p_key and p_lines would match two functions.
drop function if exists public.member_place_order(text, jsonb);
create or replace function public.member_place_order(p_key text, p_lines jsonb, p_order_id uuid default null)
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
  -- The same order sent again (its answer was lost): the order the gym already has — only while it
  -- is still open and from the last 24 hours. Looked up after the gym's lock, so two copies racing
  -- each other see each other.
  if p_order_id is not null then
    select * into res from public.shop_orders
     where member_id = m.member_id and client_order_id = p_order_id
       and status in ('ordered', 'ready') and created_at > now() - interval '24 hours'
     order by created_at desc limit 1;
    if res.order_id is not null then return res; end if;
  end if;
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
  insert into public.shop_orders(gym_id, member_id, member_name, order_no, lines, total_p, client_order_id)
    values (m.gym_id, m.member_id, m.name, n, out_lines, total::int, p_order_id)
    returning * into res;
  update public.gym_members set last_seen = now() where member_id = m.member_id;
  return res;
end $$;

revoke all on function public.member_place_order(text, jsonb, uuid) from public;
grant execute on function public.member_place_order(text, jsonb, uuid) to anon, authenticated;

-- ------------------------------------------------------------------ 2. one member per join
alter table public.gym_members add column if not exists join_hash bytea;
create index if not exists gym_members_join_hash on public.gym_members(gym_id, join_hash) where join_hash is not null;

-- 0005's member_join with the join id added (the rest is unchanged).
drop function if exists public.member_join(text, text, text);
create or replace function public.member_join(p_code text, p_name text, p_phone text default null, p_join_id uuid default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.gyms; k text := public._new_key(); m public.gym_members; n int; jh bytea;
begin
  select * into g from public.gyms where join_code = upper(btrim(coalesce(p_code,'')));
  if g.gym_id is null then raise exception 'INVALID_CODE'; end if;
  if length(btrim(coalesce(p_name,''))) = 0 then raise exception 'EMPTY'; end if;
  if p_join_id is not null then
    jh := public._hash_key(p_join_id::text);
    -- Two copies of the same join racing each other: one at a time.
    perform pg_advisory_xact_lock(hashtextextended('join:' || p_join_id::text, 0));
    select * into m from public.gym_members
     where gym_id = g.gym_id and join_hash = jh and left_at is null and joined_at > now() - interval '1 day'
     order by joined_at desc limit 1;
    if m.member_id is not null then
      -- The same join again: the same member, with a new key (the first one never arrived).
      update public.gym_members set key_hash = public._hash_key(k), name = left(btrim(p_name), 60), last_seen = now()
       where member_id = m.member_id returning * into m;
      return jsonb_build_object('memberId', m.member_id, 'memberKey', k, 'gymId', g.gym_id,
                                'gymName', g.name, 'joinCode', g.join_code, 'name', m.name,
                                'brand', public._brand_json(g));
    end if;
  end if;
  select count(*) into n from public.gym_members where gym_id = g.gym_id and joined_at > now() - interval '1 hour';
  if n >= 500 then raise exception 'BUSY'; end if;
  insert into public.gym_members(gym_id, name, phone, key_hash, join_hash)
    values (g.gym_id, left(btrim(p_name), 60), nullif(left(btrim(coalesce(p_phone,'')), 20), ''), public._hash_key(k), jh)
    returning * into m;
  return jsonb_build_object('memberId', m.member_id, 'memberKey', k, 'gymId', g.gym_id,
                            'gymName', g.name, 'joinCode', g.join_code, 'name', m.name,
                            'brand', public._brand_json(g));
end $$;

revoke all on function public.member_join(text, text, text, uuid) from public;
grant execute on function public.member_join(text, text, text, uuid) to anon, authenticated;

-- ------------------------------------------------------------------ 3 + 4. check-in
alter table public.gym_checkin_misses add column if not exists phone_tag text;

-- 0016's member_check_in. Changed: the typed-number counts (one number counts once) and the time
-- of a visit with no real time (null). Everything else is as 0016 left it.
create or replace function public.member_check_in(p_key text, p_code text default null, p_phone text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  g public.gyms;
  tries int;
  ph text;
  tag text;
  typed boolean := false;
  new_miss boolean := false;
  roster public.crm_records;
  day text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  vid text;
  prev jsonb;
  v bigint;
  plan_ok boolean;
  first_name text;
  at_ms bigint := floor(extract(epoch from now()) * 1000)::bigint;
begin
  -- 10 a minute per member key. Queued per member, so a burst cannot slip past the count.
  perform pg_advisory_xact_lock(hashtextextended('checkin:' || m.member_id::text, 0));
  select count(*) into tries from public.member_checkin_tries
   where member_id = m.member_id and at > now() - interval '1 minute';
  if tries >= 10 then return jsonb_build_object('error', 'TOO_MANY'); end if;
  insert into public.member_checkin_tries(member_id) values (m.member_id);
  delete from public.member_checkin_tries where member_id = m.member_id and what = 'try' and at < now() - interval '10 minutes';
  delete from public.member_checkin_tries where member_id = m.member_id and at < now() - interval '2 days';

  select * into g from public.gyms where gym_id = m.gym_id;

  if nullif(btrim(coalesce(p_code, '')), '') is null or upper(btrim(p_code)) <> g.join_code then
    return jsonb_build_object('error', 'OTHER_GYM', 'gymName', g.name);
  end if;

  if nullif(btrim(coalesce(p_phone, '')), '') is not null then
    ph := public._norm_phone(p_phone);
    if ph is null then return jsonb_build_object('error', 'BAD_PHONE'); end if;
  else
    ph := public._norm_phone(m.checkin_phone);
    if ph is null then return jsonb_build_object('error', 'NO_PHONE', 'gymName', g.name); end if;
  end if;

  if coalesce(g.crm_version, 0) = 0
     and not exists (select 1 from public.crm_records where gym_id = g.gym_id and kind = 'member') then
    return jsonb_build_object('error', 'GYM_NOT_ONLINE', 'gymName', g.name);
  end if;

  -- A number that has not matched for this member before is a TYPED try, limited per key (3
  -- numbers a day) and, for numbers that match nobody, per gym (20 an hour). C6-8: the same number
  -- typed again is not a new number — it counts once a day for the member, once an hour for the gym.
  if public._norm_phone(m.checkin_phone) is distinct from ph then
    typed := true;
    tag := 'phone:' || md5(g.gym_id::text || ':' || ph);
    if not exists (select 1 from public.member_checkin_tries
                    where member_id = m.member_id and what = tag and at > now() - interval '1 day') then
      select count(distinct what) into tries from public.member_checkin_tries
       where member_id = m.member_id and what like 'phone%' and at > now() - interval '1 day';
      if tries >= 3 then return jsonb_build_object('error', 'TOO_MANY_NUMBERS'); end if;
      insert into public.member_checkin_tries(member_id, what) values (m.member_id, tag);
    end if;
    perform pg_advisory_xact_lock(hashtextextended('checkin-misses:' || g.gym_id::text, 0));
    if not exists (select 1 from public.gym_checkin_misses
                    where gym_id = g.gym_id and phone_tag = tag and at > now() - interval '1 hour') then
      select count(*) into tries from public.gym_checkin_misses
       where gym_id = g.gym_id and at > now() - interval '1 hour';
      if tries >= 20 then return jsonb_build_object('error', 'TOO_MANY_NUMBERS'); end if;
      new_miss := true;
    end if;
  end if;

  roster := public._checkin_roster_member(g.gym_id, ph);
  if roster.id is null then
    if new_miss then
      insert into public.gym_checkin_misses(gym_id, phone_tag) values (g.gym_id, tag);
      delete from public.gym_checkin_misses where gym_id = g.gym_id and at < now() - interval '1 day';
    end if;
    return jsonb_build_object('error', 'NOT_ON_ROSTER', 'gymName', g.name, 'phone', '+91' || ph);
  end if;

  if typed then
    update public.gym_members set checkin_phone = '+91' || ph, phone = '+91' || ph where member_id = m.member_id;
  end if;

  first_name := split_part(btrim(coalesce(roster.data->>'fullName', m.name)), ' ', 1);
  plan_ok := public._checkin_plan_ok(g.gym_id, roster.id, day);

  -- The gym's row lock (the one crm_push takes) only now, just before the "already in" look and
  -- the write, so versions never collide and a desk check-in cannot slip in between.
  select * into g from public.gyms where gym_id = g.gym_id for update;

  -- Already in today, however it was recorded (desk rows have random ids).
  select r.data into prev from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'visit' and not r.deleted
     and r.data->>'memberId' = roster.id and r.data->>'visitedOn' = day
   order by r.version limit 1;
  if prev is not null then
    -- C6-12: a visit with no real time (an imported paper register says 0) has no time, never 1970.
    return jsonb_build_object('ok', true, 'alreadyIn', true, 'gymName', g.name, 'memberName', first_name,
      'day', day, 'planOk', plan_ok,
      'checkedInAt', case when prev->>'checkedInAt' ~ '^[0-9]{1,15}$' and (prev->>'checkedInAt')::bigint > 0
                          then (prev->>'checkedInAt')::bigint else null end);
  end if;

  vid := roster.id || ':' || day;
  v := coalesce(g.crm_version, 0) + 1;
  insert into public.crm_records(gym_id, kind, id, data, version)
    values (g.gym_id, 'visit', vid,
            jsonb_build_object('id', vid, 'gymId', g.gym_id::text, 'memberId', roster.id,
                               'visitedOn', day, 'checkedInAt', at_ms, 'source', 'app'),
            v)
    on conflict (gym_id, kind, id) do update
      set data = excluded.data, version = v, deleted = false, updated_at = now();
  update public.gyms set crm_version = v where gym_id = g.gym_id;
  update public.gym_members set last_seen = now() where member_id = m.member_id;

  return jsonb_build_object('ok', true, 'alreadyIn', false, 'gymName', g.name, 'memberName', first_name,
    'day', day, 'planOk', plan_ok, 'checkedInAt', at_ms);
end $$;

revoke all on function public.member_check_in(text, text, text)    from public;
grant execute on function public.member_check_in(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
