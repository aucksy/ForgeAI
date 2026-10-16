-- 0019: the front desk's discount limit, and who took the money (16 Oct 2026, admin audit
-- Audit/e2e-v2/C7-admin-app.md: C7-12, C7-13). Apply after 0018. Re-runnable (it only replaces two
-- functions). The test is supabase/tests/0019_staff_discount_and_taker.sql (CI runs it after every
-- migration).
--
-- 1. WHO TOOK THE MONEY (C7-12). Receipts never said who took them, so a cash drawer short at the end
--    of the day could not be traced. Now every NEW receipt saved from a signed-in phone or PC carries
--    that person's id and name (collectedBy, collectedByName), and every new plan sold carries who
--    sold it (soldBy, soldByName). The server writes them from the session, so a desk can never put
--    a colleague's name on a receipt. Imported records and the old owner key (no person) are left
--    as they are. Once saved, who took it never changes (a void or a PT session keeps it). The
--    panel shows "Taken by Ramesh" on the Money list and can filter by person.
-- 2. FRONT-DESK DISCOUNTS (C7-13). The front desk could sell any plan for Rs 0 (the panel promised
--    "Staff cannot change prices" but nothing stopped it). Owner's decision as the audit suggested:
--    the owner can give any discount, a free plan too; the FRONT DESK can give at most 10% off the
--    plan's listed price (lowest = price - floor(price / 10), the panel's own rounding), and must
--    charge the plan's joining fee to someone who has no plan in the gym yet (a renewal may skip
--    it). Anything else is refused (OWNER_ONLY) and the panel says "Ask the owner".

-- ------------------------------------------------------------------ the front desk's rules (C7-13)
-- 0018's _staff_write_ok with the discount limit and the joining fee added.
create or replace function public._staff_write_ok(p_gym uuid, p_kind text, p_id text, p_new jsonb)
  returns void language plpgsql stable set search_path = public as $$
declare
  prev jsonb; gone boolean; plan jsonb;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  today_s text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  tomorrow_s text := to_char((now() at time zone 'Asia/Kolkata')::date + 1, 'YYYY-MM-DD');
  old_log jsonb; new_log jsonb; n_all int; n_distinct int; cap numeric; st date; en date; cnt numeric;
  list_p numeric; fee_p numeric;
begin
  if p_kind in ('plan', 'expense', 'gym') then raise exception 'OWNER_ONLY'; end if;
  if p_kind not in ('payment', 'membership') then return; end if;

  select data, deleted into prev, gone from public.crm_records where gym_id = p_gym and kind = p_kind and id = p_id;
  if prev is not null and gone then raise exception 'OWNER_ONLY'; end if;

  if p_kind = 'payment' then
    if prev is not null then
      -- 0019: who took it is the server's to keep (crm_push), so it is not compared.
      if (prev - 'collectedBy' - 'collectedByName') = (p_new - 'collectedBy' - 'collectedByName') then return; end if;
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
    if (prev - 'ptLog' - 'updatedAt' - 'soldBy' - 'soldByName') is distinct from (p_new - 'ptLog' - 'updatedAt' - 'soldBy' - 'soldByName') then
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
  -- 0019 (C7-13): at most 10% off the plan's price (the panel's staffLowestPrice, same rounding).
  list_p := case when jsonb_typeof(plan->'priceP') = 'number' then (plan->>'priceP')::numeric else 0 end;
  if (p_new->>'priceP')::numeric < list_p - floor(list_p / 10) then raise exception 'OWNER_ONLY'; end if;
  -- 0019 (C7-13): the plan's joining fee, unless the member already has a plan here (renewal).
  fee_p := case when jsonb_typeof(plan->'joiningFeeP') = 'number' then (plan->>'joiningFeeP')::numeric else 0 end;
  if coalesce((p_new->>'joiningFeeP')::numeric, 0) < fee_p
     and not exists (select 1 from public.crm_records o
                      where o.gym_id = p_gym and o.kind = 'membership' and not o.deleted and o.id <> p_id
                        and o.data->>'memberId' = p_new->>'memberId') then
    raise exception 'OWNER_ONLY';
  end if;
  if coalesce(p_new->>'cancelled', 'false') <> 'false' then raise exception 'OWNER_ONLY'; end if;
  if coalesce(jsonb_typeof(p_new->'ptSessions'), 'null') not in ('null', 'number') then raise exception 'OWNER_ONLY'; end if;
  cap := case when jsonb_typeof(plan->'ptSessions') = 'number' then (plan->>'ptSessions')::numeric else 0 end;
  if coalesce((p_new->>'ptSessions')::numeric, 0) > cap then raise exception 'OWNER_ONLY'; end if;
  if jsonb_array_length(new_log) > 0 then raise exception 'OWNER_ONLY'; end if;
end $$;

-- ------------------------------------------------------------------ the records (C7-12)
-- 0018's crm_push with who took the money stamped on a new receipt or plan.
create or replace function public.crm_push(p_key text, p_base bigint, p_records jsonb, p_push_id uuid default null)
  returns bigint language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); cur bigint; v bigint; r jsonb; k text; rid text; n int; done bigint;
  st public.gym_staff := public._staff(p_key); is_staff boolean; prev jsonb; d jsonb; tk text;
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
      -- 0019 (C7-12): a NEW receipt or plan typed in the panel says who took the money / sold it:
      -- the signed-in person, from the session (never what the device wrote). Imported records and
      -- an old owner key (no person) are left as they are.
      d := r->'d';
      if st.staff_id is not null and prev is null and coalesce(d->>'importId', '') = '' then
        if k = 'payment' then
          d := d || jsonb_build_object('collectedBy', st.staff_id::text, 'collectedByName', st.name);
        elsif k = 'membership' then
          d := d || jsonb_build_object('soldBy', st.staff_id::text, 'soldByName', st.name);
        end if;
      elsif prev is not null and k in ('payment', 'membership') then
        -- Once saved, who took the money / sold the plan never changes (a void or a PT session
        -- keeps it), whoever saves the row and whatever the device's copy says.
        foreach tk in array array['collectedBy', 'collectedByName', 'soldBy', 'soldByName'] loop
          if prev ? tk then d := jsonb_set(d, array[tk], prev->tk); else d := d - tk; end if;
        end loop;
      end if;
      insert into public.crm_records(gym_id, kind, id, data, version)
        values (g, k, rid, d, v)
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

-- ------------------------------------------------------------------ grants (as 0018)
revoke all on function public._staff_write_ok(uuid, text, text, jsonb)    from public, anon, authenticated;
revoke all on function public.crm_push(text, bigint, jsonb, uuid)         from public;
grant execute on function public.crm_push(text, bigint, jsonb, uuid)      to anon, authenticated;
