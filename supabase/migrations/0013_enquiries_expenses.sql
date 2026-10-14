-- 0013: enquiries and expenses in the online records (15 Oct 2026; Gym Panel step 5).
-- Two new kinds of row in crm_records: 'enquiry' (someone who asked about joining) and 'expense'
-- (money going out). An expense typed wrong may be removed (like an undone check-in); every other
-- kind is still never deleted. Same function otherwise as 0011.
-- Apply after 0012. Re-runnable.

alter table public.crm_records drop constraint if exists crm_records_kind_check;
alter table public.crm_records add constraint crm_records_kind_check
  check (kind in ('gym','member','plan','membership','payment','visit','enquiry','expense'));

create or replace function public.crm_push(p_key text, p_base bigint, p_records jsonb, p_push_id uuid default null)
  returns bigint language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); cur bigint; v bigint; r jsonb; k text; rid text; n int; done bigint;
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
  v := cur + 1;
  for r in select value from jsonb_array_elements(p_records) loop
    k := r->>'k';
    rid := r->>'id';
    if k is null or k not in ('gym','member','plan','membership','payment','visit','enquiry','expense') then raise exception 'INVALID'; end if;
    if rid is null or length(rid) not between 1 and 64 then raise exception 'INVALID'; end if;
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
