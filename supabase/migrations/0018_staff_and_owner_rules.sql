-- 0018: front desk and owner rules on the SERVER, from the server safety review (16 Oct 2026,
-- Audit/e2e-v2/C8-server-security.md: C8-1, C8-2, C8-3, C8-4, C8-7, C8-11). Apply after 0017.
-- Re-runnable. The tests are supabase/tests/0018_staff_and_owner_rules.sql and
-- supabase/tests/0018_photo_upload.sql (CI runs them after every migration).
--
-- 1. RECEIPTS AND PLANS THE FRONT DESK ALREADY SAVED (C8-1). A Staff session could overwrite any
--    field of a saved receipt or membership (lower an amount, move it to another member, add PT
--    sessions, remove old PT days). Now, for a Staff session:
--    - a saved RECEIPT never changes (receipts are insert-only; voiding stays the owner's). A new
--      receipt must be a whole amount above zero and not voided.
--    - a saved MEMBERSHIP changes only in its PT log: a session may be marked (a day that has
--      come, inside the pack's dates, never more sessions than were bought, not on a cancelled
--      pack), and only a session marked for TODAY may be taken back (the panel's own rule:
--      permissions.ts undoOldPtSession).
--    - a NEW membership must come from one of the gym's plans: price and joining fee 0 or more,
--      not cancelled, PT sessions no more than the plan's, no PT days yet, and its dates no longer
--      than the plan (ends on or before the plan's own end date). It may start at most 31 days
--      back (India time). Why 31: the panel's sale sheet starts a plan today, or the day after
--      the member's current plan ends; a back date is only typed for "joined last week, written
--      in today". A start further back hands out past months for free, so it is the owner's.
--    - a receipt or membership that was taken back (an undone import) is not brought back.
--    Everything the front desk does in the panel still works: add and edit members, sell a plan,
--    collect a fee, mark a PT session (and take back today's), check in, work enquiries.
-- 2. OWNER-ONLY SHOP, BRANDING, NAME AND MESSAGES (C8-2). These took any signed-in session; now
--    an old owner key or an OWNER's session only (OWNER_ONLY for the front desk): rename the gym,
--    branding, save / delete / restock / show-hide a product, its photo and the upload ticket,
--    send and take back a message to members. The panel already shows these to owners only
--    (permissions.ts manageGym). Orders (the list and handing an order over) stay open to Staff.
-- 3. IMPORT MARK (C8-3). A record's importId (what "Undo this import" deletes) is set only when
--    the record is first saved. A save that adds, changes or removes it is refused (INVALID), for
--    everyone, so Undo can neither be pointed at hand-typed records nor made to miss imported ones.
-- 4. SIGN-IN WRONG TRIES (C8-4, C8-11).
--    - A code takes at most 10 wrong tries; the 10th makes it void (the owner makes a new one).
--    - Wrong tries are recorded against each PERSON with that mobile (staff_id), not the mobile
--      alone. Making a code clears only that person's tries, so a code made in another gym for the
--      same mobile no longer resets this gym's count.
--    - The 50-tries-from-everyone cap is gone: other people's wrong tries never lock the real
--      person out. A caller (IP) with 5 wrong tries for a mobile in 15 minutes is still stopped,
--      as before. Codes stay 6 digits.
-- 5. LOGO AND PRODUCT-PHOTO UPLOADS (C8-7). 0012 took EXECUTE on _photo_ticket_ok away from anon,
--    but the upload policies on storage.objects (0004, 0005) call it as the uploader (anon), so
--    every upload failed with "permission denied for function _photo_ticket_ok" (proved in CI by
--    tests/0018_photo_upload.sql before this file). It only answers yes/no for a 48-hex ticket, so
--    anon may call it again.

-- ------------------------------------------------------------------ helpers (no grants)
-- A 'YYYY-MM-DD' text as a date, or null when it is not a real day.
create or replace function public._iso_day(p text) returns date
  language plpgsql immutable set search_path = public as $$
begin
  if p is null or p !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
  return p::date;
exception when others then
  return null;
end $$;

-- The last day of a plan bought on p_start, as the panel works it out (logic/membership.ts
-- computeEndDate): N months clamp to the month's end, then one day back; N days count the first.
create or replace function public._plan_end(p_start date, p_unit text, p_count numeric) returns date
  language sql immutable set search_path = public as $$
  select case when p_unit = 'month'
              then (p_start + make_interval(months => greatest(1, trunc(coalesce(p_count, 1))::int)))::date - 1
              else p_start + (greatest(1, trunc(coalesce(p_count, 1))::int) - 1) end
$$;

-- The gym of an OLD OWNER KEY or of a live session whose person is an OWNER. A Staff session:
-- OWNER_ONLY. Anything else: BAD_KEY.
create or replace function public._owner_only_gym(p_key text) returns uuid
  language plpgsql stable security definer set search_path = public as $$
declare g uuid; st public.gym_staff;
begin
  select gym_id into g from public.gym_owner_keys where key_hash = public._hash_key(p_key);
  if g is not null then return g; end if;
  st := public._staff(p_key);
  if st.staff_id is null then raise exception 'BAD_KEY'; end if;
  if st.role <> 'owner' then raise exception 'OWNER_ONLY'; end if;
  return st.gym_id;
end $$;

-- What a Staff session may save (C8-1). Raises OWNER_ONLY; returns quietly when the row is fine.
create or replace function public._staff_write_ok(p_gym uuid, p_kind text, p_id text, p_new jsonb)
  returns void language plpgsql stable set search_path = public as $$
declare
  prev jsonb; gone boolean; plan jsonb;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  today_s text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  tomorrow_s text := to_char((now() at time zone 'Asia/Kolkata')::date + 1, 'YYYY-MM-DD');
  old_log jsonb; new_log jsonb; n_all int; n_distinct int; cap numeric; st date; en date; cnt numeric;
begin
  if p_kind in ('plan', 'expense', 'gym') then raise exception 'OWNER_ONLY'; end if;
  if p_kind not in ('payment', 'membership') then return; end if;

  select data, deleted into prev, gone from public.crm_records where gym_id = p_gym and kind = p_kind and id = p_id;
  if prev is not null and gone then raise exception 'OWNER_ONLY'; end if;

  if p_kind = 'payment' then
    if prev is not null then
      if prev = p_new then return; end if;  -- the same receipt again: nothing changes
      raise exception 'OWNER_ONLY';
    end if;
    if jsonb_typeof(p_new->'amountP') is distinct from 'number'
       or (p_new->>'amountP')::numeric <= 0
       or (p_new->>'amountP')::numeric <> trunc((p_new->>'amountP')::numeric)
       or coalesce(p_new->>'voided', 'false') <> 'false' then
      raise exception 'OWNER_ONLY';
    end if;
    return;
  end if;

  -- A membership.
  new_log := coalesce(p_new->'ptLog', '[]'::jsonb);
  if jsonb_typeof(new_log) = 'null' then new_log := '[]'::jsonb; end if;
  if jsonb_typeof(new_log) <> 'array' then raise exception 'OWNER_ONLY'; end if;

  if prev is not null then
    -- Nothing but the PT log (and the time it was saved) may differ.
    if (prev - 'ptLog' - 'updatedAt') is distinct from (p_new - 'ptLog' - 'updatedAt') then
      raise exception 'OWNER_ONLY';
    end if;
    old_log := coalesce(prev->'ptLog', '[]'::jsonb);
    if jsonb_typeof(old_log) <> 'array' then old_log := '[]'::jsonb; end if;
    if old_log = new_log then return; end if;
    -- Only real days, each once.
    if exists (select 1 from jsonb_array_elements(new_log) e
                where jsonb_typeof(e) <> 'string' or public._iso_day(e #>> '{}') is null) then
      raise exception 'OWNER_ONLY';
    end if;
    select count(*), count(distinct e) into n_all, n_distinct from jsonb_array_elements_text(new_log) e;
    if n_all <> n_distinct then raise exception 'OWNER_ONLY'; end if;
    -- Taking back: only a session marked for today.
    if exists (select 1 from jsonb_array_elements_text(old_log) o(v)
                where not (new_log ? o.v) and o.v < today_s) then
      raise exception 'OWNER_ONLY';
    end if;
    -- Marking: a day that has come (a day of grace for a desk clock), inside the pack's dates, on a
    -- pack that is not cancelled, never more sessions than were bought.
    if exists (select 1 from jsonb_array_elements_text(new_log) e(v) where not (old_log ? e.v)) then
      if coalesce(prev->>'cancelled', 'false') = 'true' then raise exception 'OWNER_ONLY'; end if;
      if exists (select 1 from jsonb_array_elements_text(new_log) e(v)
                  where not (old_log ? e.v)
                    and (e.v > tomorrow_s or e.v < coalesce(prev->>'startsOn', '9999') or e.v > coalesce(prev->>'endsOn', ''))) then
        raise exception 'OWNER_ONLY';
      end if;
      cap := case when jsonb_typeof(prev->'ptSessions') = 'number' then (prev->>'ptSessions')::numeric else 0 end;
      if n_all > cap then raise exception 'OWNER_ONLY'; end if;
    end if;
    return;
  end if;

  -- A new membership: from one of the gym's plans, no longer than that plan, not far back.
  select data into plan from public.crm_records
   where gym_id = p_gym and kind = 'plan' and id = p_new->>'planId' and not deleted;
  st := public._iso_day(p_new->>'startsOn');
  en := public._iso_day(p_new->>'endsOn');
  if plan is null or st is null or en is null then raise exception 'OWNER_ONLY'; end if;
  if st < today - 31 then raise exception 'OWNER_ONLY'; end if;
  cnt := case when jsonb_typeof(plan->'durationCount') = 'number' then (plan->>'durationCount')::numeric else 1 end;
  if en < st or en > public._plan_end(st, plan->>'durationUnit', cnt) then raise exception 'OWNER_ONLY'; end if;
  if jsonb_typeof(p_new->'priceP') is distinct from 'number' or (p_new->>'priceP')::numeric < 0 then
    raise exception 'OWNER_ONLY';
  end if;
  if coalesce(jsonb_typeof(p_new->'joiningFeeP'), 'null') not in ('null', 'number')
     or coalesce((p_new->>'joiningFeeP')::numeric, 0) < 0 then
    raise exception 'OWNER_ONLY';
  end if;
  if coalesce(p_new->>'cancelled', 'false') <> 'false' then raise exception 'OWNER_ONLY'; end if;
  if coalesce(jsonb_typeof(p_new->'ptSessions'), 'null') not in ('null', 'number') then raise exception 'OWNER_ONLY'; end if;
  cap := case when jsonb_typeof(plan->'ptSessions') = 'number' then (plan->>'ptSessions')::numeric else 0 end;
  if coalesce((p_new->>'ptSessions')::numeric, 0) > cap then raise exception 'OWNER_ONLY'; end if;
  if jsonb_array_length(new_log) > 0 then raise exception 'OWNER_ONLY'; end if;
end $$;

-- ------------------------------------------------------------------ the records (C8-1, C8-3)
-- 0017's crm_push, with the Staff rules in _staff_write_ok and the import mark fixed at insert.
create or replace function public.crm_push(p_key text, p_base bigint, p_records jsonb, p_push_id uuid default null)
  returns bigint language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); cur bigint; v bigint; r jsonb; k text; rid text; n int; done bigint;
  st public.gym_staff := public._staff(p_key); is_staff boolean; prev jsonb;
begin
  if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'INVALID'; end if;
  n := jsonb_array_length(p_records);
  if n = 0 or n > 1000 then raise exception 'INVALID'; end if;
  select crm_version into cur from public.gyms where gym_id = g for update;
  if p_push_id is not null then
    select version into done from public.crm_push_log where gym_id = g and push_id = p_push_id;
    if done is not null then return done; end if;
  end if;
  if cur is distinct from p_base then raise exception 'STALE'; end if;
  -- 0014: an old owner key or an owner's session may do anything; a Staff session may not.
  is_staff := st.staff_id is not null and st.role = 'staff';
  v := cur + 1;
  for r in select value from jsonb_array_elements(p_records) loop
    k := r->>'k';
    rid := r->>'id';
    if k is null or k not in ('gym','member','plan','membership','payment','visit','enquiry','expense') then raise exception 'INVALID'; end if;
    if rid is null or length(rid) not between 1 and 64 then raise exception 'INVALID'; end if;
    -- Front desk: no plans, expenses or gym details at all.
    if is_staff and k in ('plan','expense','gym') then raise exception 'OWNER_ONLY'; end if;
    if coalesce(r->>'x', 'false') = 'true' then
      -- A check-in or a mistyped expense may be taken back. 0017: so may a member, plan,
      -- membership or receipt that came from an IMPORT (its data carries importId), by the owner
      -- only ("Undo this import"). Anything typed in by hand still can never be deleted.
      if k in ('member','plan','membership','payment') then
        if is_staff then raise exception 'OWNER_ONLY'; end if;
        select data into prev from public.crm_records where gym_id = g and kind = k and id = rid and not deleted;
        if prev is null or coalesce(prev->>'importId', '') = '' then raise exception 'INVALID'; end if;
      elsif k not in ('visit','expense') then
        raise exception 'INVALID';
      end if;
      update public.crm_records set deleted = true, version = v, updated_at = now()
       where gym_id = g and kind = k and id = rid;
    else
      if jsonb_typeof(r->'d') is distinct from 'object' or octet_length((r->'d')::text) > 20000 then
        raise exception 'INVALID';
      end if;
      -- 0018: the import mark is set when a record is first saved, and never after (C8-3).
      select data into prev from public.crm_records where gym_id = g and kind = k and id = rid;
      if prev is not null and coalesce(prev->>'importId', '') <> coalesce(r->'d'->>'importId', '') then
        raise exception 'INVALID';
      end if;
      -- 0018: what the front desk may save (C8-1).
      if is_staff then perform public._staff_write_ok(g, k, rid, r->'d'); end if;
      insert into public.crm_records(gym_id, kind, id, data, version)
        values (g, k, rid, r->'d', v)
        on conflict (gym_id, kind, id) do update
          set data = excluded.data, version = v, deleted = false, updated_at = now();
      if k = 'gym' and length(btrim(coalesce(r->'d'->>'name', ''))) > 0 then
        update public.gyms set name = left(btrim(r->'d'->>'name'), 60) where gym_id = g;
      end if;
    end if;
  end loop;
  update public.gyms set crm_version = v where gym_id = g;
  if p_push_id is not null then
    insert into public.crm_push_log(gym_id, push_id, version) values (g, p_push_id, v);
    delete from public.crm_push_log where gym_id = g and at < now() - interval '1 day';
  end if;
  return v;
end $$;

-- ------------------------------------------------------------------ owner-only functions (C8-2)
-- Each is its latest body (0002 / 0003 / 0004 / 0005 / 0008 / 0009) with _owner_gym swapped for
-- _owner_only_gym. Nothing else changes.

-- 0002
create or replace function public.owner_rename_gym(p_key text, p_name text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_only_gym(p_key);
begin
  if length(btrim(coalesce(p_name,''))) = 0 then raise exception 'EMPTY'; end if;
  update public.gyms set name = left(btrim(p_name), 60) where gym_id = gid;
  return public.owner_gym(p_key);
end $$;

-- 0002
create or replace function public.owner_delete_product(p_key text, p_product uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.shop_products where product_id = p_product and gym_id = public._owner_only_gym(p_key);
end $$;

-- 0003
create or replace function public.owner_add_stock(p_key text, p_product uuid, p_option text, p_delta int)
  returns public.shop_products language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_only_gym(p_key); r public.shop_products; opt text := nullif(p_option, '');
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

-- 0003
create or replace function public.owner_set_product_active(p_key text, p_product uuid, p_active boolean)
  returns public.shop_products language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_only_gym(p_key); r public.shop_products;
begin
  update public.shop_products set active = coalesce(p_active, true), updated_at = now()
    where product_id = p_product and gym_id = gid returning * into r;
  if r.product_id is null then raise exception 'GONE'; end if;
  return r;
end $$;

-- 0004
create or replace function public.owner_photo_ticket(p_key text)
  returns text language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_only_gym(p_key); t text := public._new_key(); n int;
begin
  delete from public.photo_tickets where expires_at < now();
  select count(*) into n from public.photo_tickets where gym_id = gid;
  if n >= 50 then raise exception 'BUSY'; end if;
  insert into public.photo_tickets(ticket, gym_id, expires_at) values (t, gid, now() + interval '15 minutes');
  return t;
end $$;

-- 0004
create or replace function public.owner_set_product_photo(p_key text, p_product uuid, p_url text)
  returns public.shop_products language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_only_gym(p_key); r public.shop_products; u text := nullif(btrim(coalesce(p_url,'')), '');
begin
  if not public._photo_url_ok(u) then raise exception 'BAD_PHOTO'; end if;
  update public.shop_products set image_url = u, updated_at = now()
    where product_id = p_product and gym_id = gid returning * into r;
  if r.product_id is null then raise exception 'GONE'; end if;
  return r;
end $$;

-- 0004
create or replace function public.owner_save_product(p_key text, p jsonb)
  returns public.shop_products language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_only_gym(p_key); pid uuid := nullif(p->>'productId','')::uuid;
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

-- 0005
create or replace function public.owner_set_brand(p_key text, p_accent text, p_bg text,
                                                  p_logo_url text, p_heading text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare gid uuid := public._owner_only_gym(p_key);
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

-- 0009
create or replace function public.owner_send_message(p_key text, p_kind text, p_title text, p_body text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);
  t text := btrim(coalesce(p_title, ''));
  b text := btrim(coalesce(p_body, ''));
  today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  n int;
  m public.gym_messages;
begin
  if p_kind not in ('announcement','closed','timing','offer','event','reminder') then raise exception 'BAD_KIND'; end if;
  if length(t) = 0 then raise exception 'EMPTY'; end if;
  if length(t) > 60 or length(b) > 300 then raise exception 'TOO_LONG'; end if;
  -- One send at a time per gym: the counts below and the insert see each other.
  perform 1 from public.gyms where gym_id = g for update;
  select count(*) into n from public.gym_messages where gym_id = g and created_at >= today_start;
  if n >= 20 then raise exception 'TOO_MANY'; end if;
  if p_kind in ('offer','event') then
    select count(*) into n from public.gym_messages
      where gym_id = g and kind in ('offer','event') and created_at >= today_start
        and (withdrawn_at is null or withdrawn_at > created_at + interval '10 minutes');
    if n >= 1 then raise exception 'OFFER_TODAY'; end if;
    select count(*) into n from public.gym_messages
      where gym_id = g and kind in ('offer','event') and created_at >= today_start - interval '6 days'
        and (withdrawn_at is null or withdrawn_at > created_at + interval '10 minutes');
    if n >= 3 then raise exception 'OFFER_WEEK'; end if;
  end if;
  select count(*) into n from public.gym_members where gym_id = g and left_at is null;
  insert into public.gym_messages(gym_id, kind, title, body, recipients)
    values (g, p_kind, t, b, n) returning * into m;
  return public._message_json(m) || jsonb_build_object('recipients', m.recipients, 'seen', 0, 'withdrawn', false);
end $$;

-- 0008
create or replace function public.owner_withdraw_message(p_key text, p_message uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  update public.gym_messages set withdrawn_at = coalesce(withdrawn_at, now())
    where message_id = p_message and gym_id = public._owner_only_gym(p_key);
  if not found then raise exception 'GONE'; end if;
end $$;

-- ------------------------------------------------------------------ sign-in (C8-4, C8-11)
alter table public.gym_signin_fails add column if not exists staff_id uuid;
create index if not exists gym_signin_fails_staff on public.gym_signin_fails(staff_id, at);
create index if not exists gym_signin_fails_phone_ip on public.gym_signin_fails(phone, ip, at);

-- Mobile + code -> a session. Never raises for a wrong code (the counts must be kept).
-- Errors: BAD_PHONE, TOO_MANY_TRIES (this caller: 5 wrong tries for the mobile in 15 minutes),
-- WRONG_CODE with triesLeft (also when no code is waiting: one answer for both).
create or replace function public.staff_sign_in(p_phone text, p_code text, p_device text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare ph text := public._norm_phone(p_phone); v_ip text := public._caller_ip(); mine int; cid uuid; st public.gym_staff;
  t timestamptz := clock_timestamp();
begin
  if ph is null then return jsonb_build_object('error', 'BAD_PHONE'); end if;
  perform pg_advisory_xact_lock(hashtext('signin:' || ph));
  delete from public.gym_signin_fails where at < now() - interval '1 day';
  -- One wrong try is recorded against every person with this mobile (two gyms: two rows) with ONE
  -- time stamp (t), so tries are counted as distinct moments, not rows.
  select count(distinct at) into mine from public.gym_signin_fails
   where phone = ph and coalesce(gym_signin_fails.ip, '') = v_ip and at > now() - interval '15 minutes';
  if mine >= 5 then return jsonb_build_object('error', 'TOO_MANY_TRIES'); end if;

  select x.code_id into cid
    from public.gym_signin_codes x join public.gym_staff s on s.staff_id = x.staff_id
   where s.phone = ph and s.removed_at is null and x.used_at is null and x.expires_at > now()
     and x.wrong_tries < 10 and x.code_hash = public._code_hash(x.code_id, p_code)
   limit 1 for update of x;

  if cid is null then
    insert into public.gym_signin_fails(phone, ip, staff_id, at)
      select ph, v_ip, s.staff_id, t from public.gym_staff s where s.phone = ph and s.removed_at is null;
    if not found then
      insert into public.gym_signin_fails(phone, ip, staff_id, at) values (ph, v_ip, null, t);
    end if;
    -- Every live code for this mobile takes the try; the 10th wrong try makes a code void.
    update public.gym_signin_codes x set wrong_tries = x.wrong_tries + 1
      from public.gym_staff s
     where s.staff_id = x.staff_id and s.phone = ph and s.removed_at is null
       and x.used_at is null and x.expires_at > now() and x.wrong_tries < 10;
    return jsonb_build_object('error', 'WRONG_CODE', 'triesLeft', greatest(0, 4 - mine));
  end if;

  update public.gym_signin_codes set used_at = now() where code_id = cid;
  select s.* into st from public.gym_signin_codes x join public.gym_staff s on s.staff_id = x.staff_id where x.code_id = cid;
  delete from public.gym_signin_fails where staff_id = st.staff_id;
  return public._signed_in_json(st, public._new_session(st.staff_id, p_device));
end $$;

-- A new code clears only THIS person's wrong tries (a code made for the same mobile in another
-- gym no longer touches them).
create or replace function public._make_code(p_staff uuid) returns jsonb
  language plpgsql volatile security definer set search_path = public as $$
declare c text := public._six_digits(); id uuid := gen_random_uuid(); until timestamptz := now() + interval '30 minutes';
begin
  delete from public.gym_signin_codes where staff_id = p_staff and used_at is null;
  delete from public.gym_signin_fails where staff_id = p_staff;
  insert into public.gym_signin_codes(code_id, staff_id, code_hash, expires_at)
    values (id, p_staff, public._code_hash(id, c), until);
  return jsonb_build_object('staffId', p_staff, 'code', c, 'expiresAt', until);
end $$;

-- People list (0011): a code with 10 wrong tries is void, so it is not shown as waiting.
create or replace function public.owner_people(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._people_admin(p_key); me uuid := (public._staff(p_key)).staff_id;
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'staffId', s.staff_id, 'name', s.name, 'phone', s.phone, 'role', s.role,
             'createdAt', s.created_at, 'me', s.staff_id = me,
             'devices', (select count(*) from public.gym_sessions x where x.staff_id = s.staff_id and x.ended_at is null),
             'lastSeenAt', (select max(x.last_seen_at) from public.gym_sessions x where x.staff_id = s.staff_id),
             'codeUntil', (select max(c.expires_at) from public.gym_signin_codes c
                            where c.staff_id = s.staff_id and c.used_at is null and c.expires_at > now()
                              and c.wrong_tries < 10))
           order by (s.role = 'owner') desc, s.created_at)
      from public.gym_staff s where s.gym_id = g and s.removed_at is null), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._iso_day(text)                              from public, anon, authenticated;
revoke all on function public._plan_end(date, text, numeric)              from public, anon, authenticated;
revoke all on function public._owner_only_gym(text)                       from public, anon, authenticated;
revoke all on function public._staff_write_ok(uuid, text, text, jsonb)    from public, anon, authenticated;
revoke all on function public._make_code(uuid)                            from public, anon, authenticated;
revoke all on function public.crm_push(text, bigint, jsonb, uuid)         from public;
revoke all on function public.staff_sign_in(text, text, text)             from public;
revoke all on function public.owner_people(text)                          from public;
grant execute on function public.crm_push(text, bigint, jsonb, uuid)      to anon, authenticated;
grant execute on function public.staff_sign_in(text, text, text)          to anon, authenticated;
grant execute on function public.owner_people(text)                       to anon, authenticated;

-- C8-7: the storage upload policies call this as the uploader (anon). It answers only yes/no for
-- a 48-hex ticket folder, so it may be called by anyone (tests/security.sql lists it on purpose).
grant execute on function public._photo_ticket_ok(text) to anon, authenticated;
