-- 0014: Front desk (Staff) limits on the SERVER too (15 Oct 2026). The panel hides owner-only
-- actions from Staff (auth/permissions.ts); this makes crm_push refuse them, so a Staff login with
-- browser tools cannot do them either: plans, expenses and gym details (kinds plan / expense /
-- gym), voiding or un-voiding a receipt, cancelling / un-cancelling a membership or moving its end
-- date (freeze / extra days). Staff may still add members, sell memberships, take payments, check
-- in, and work enquiries. An old owner key and an owner's session are unchanged. OWNER_ONLY is
-- the error (the panel says "Only an owner can do this.").
-- Apply after 0013. Re-runnable.

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
    if is_staff then
      -- Front desk: no plans, expenses or gym details; no voiding a receipt; no cancelling,
      -- un-cancelling or moving the end of an existing membership (freeze / extra days).
      if k in ('plan','expense','gym') then raise exception 'OWNER_ONLY'; end if;
      select data into prev from public.crm_records where gym_id = g and kind = k and id = rid and not deleted;
      if prev is not null and k = 'payment'
         and coalesce(prev->>'voided','false') <> coalesce(r->'d'->>'voided','false') then
        raise exception 'OWNER_ONLY';
      end if;
      if prev is not null and k = 'membership'
         and (coalesce(prev->>'cancelled','false') <> coalesce(r->'d'->>'cancelled','false')
              or coalesce(prev->>'endsOn','') <> coalesce(r->'d'->>'endsOn','')) then
        raise exception 'OWNER_ONLY';
      end if;
    end if;
    if coalesce(r->>'x', 'false') = 'true' then
      -- Only a check-in or a mistyped expense is ever taken back. The row keeps its data.
      if k not in ('visit','expense') then raise exception 'INVALID'; end if;
      update public.crm_records set deleted = true, version = v, updated_at = now()
       where gym_id = g and kind = k and id = rid;
    else
      if jsonb_typeof(r->'d') is distinct from 'object' or octet_length((r->'d')::text) > 20000 then
        raise exception 'INVALID';
      end if;
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

revoke all on function public.crm_push(text, bigint, jsonb, uuid) from public;
grant execute on function public.crm_push(text, bigint, jsonb, uuid) to anon, authenticated;
