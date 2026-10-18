-- 0024: workout plans from the gym or trainer (OWNER-INBOX #6, 18 Oct 2026). Re-runnable.
-- Plan: docs/overhaul/plans/gym-workout-plans.md.
--
-- A trainer (or the owner) makes a plan in the admin app and sends it to members; it shows in the
-- member's app as routines "From <gym> · <trainer>". A plan is one crm_records row of the new kind
-- 'workout_plan' (versioned sync and gym isolation as every other record):
--   {name, note, routines: [routine file routines], assign: {memberIds: [], planIds: []},
--    withdrawn, createdAt, updatedAt, createdBy, createdByName}
-- The routines use the member app's routine-file shape (apps/mobile/src/tracker/plans/routineFile.ts);
-- the phone cleans every number when it imports them, so the server checks only the outline and the
-- size (_workout_plan_ok, plus crm_push's 20 KB cap). Never deleted: "withdrawn" hides it.
-- Who made it is stamped from the session (like 0019's soldBy), never what the device wrote.
--
-- member_gym_plans(p_key): the member app's read, with exactly 0023's identity checks (the number
-- matched at a check-in, nothing typed; the first name must match the gym's list; never for a shared
-- number). A plan is sent to a member when its memberIds hold the member's id on the gym's list, or
-- its planIds hold the plan of a membership covering today.
--
-- Apply: Supabase SQL editor, after 0023 (LIVE apply only with the owner's yes).

alter table public.crm_records drop constraint if exists crm_records_kind_check;
alter table public.crm_records add constraint crm_records_kind_check
  check (kind in ('gym','member','plan','membership','payment','visit','enquiry','expense','workout_plan'));

-- The outline of a workout plan; raises INVALID otherwise.
create or replace function public._workout_plan_ok(d jsonb)
  returns void language plpgsql immutable set search_path = public as $$
declare rt jsonb; ex jsonb; a jsonb;
begin
  if jsonb_typeof(d->'name') is distinct from 'string' or length(btrim(d->>'name')) not between 1 and 80 then raise exception 'INVALID'; end if;
  if d ? 'note' and jsonb_typeof(d->'note') not in ('string', 'null') then raise exception 'INVALID'; end if;
  if d ? 'withdrawn' and jsonb_typeof(d->'withdrawn') is distinct from 'boolean' then raise exception 'INVALID'; end if;
  if jsonb_typeof(d->'routines') is distinct from 'array' or jsonb_array_length(d->'routines') not between 1 and 14 then raise exception 'INVALID'; end if;
  for rt in select value from jsonb_array_elements(d->'routines') loop
    if jsonb_typeof(rt) is distinct from 'object' or jsonb_typeof(rt->'name') is distinct from 'string'
       or length(btrim(rt->>'name')) not between 1 and 80 then raise exception 'INVALID'; end if;
    if jsonb_typeof(rt->'exercises') is distinct from 'array' or jsonb_array_length(rt->'exercises') not between 1 and 30 then raise exception 'INVALID'; end if;
    for ex in select value from jsonb_array_elements(rt->'exercises') loop
      if jsonb_typeof(ex) is distinct from 'object' or jsonb_typeof(ex->'name') is distinct from 'string'
         or length(btrim(ex->>'name')) not between 1 and 80 then raise exception 'INVALID'; end if;
      if ex ? 'catalogKey' and not (jsonb_typeof(ex->'catalogKey') = 'null'
         or (jsonb_typeof(ex->'catalogKey') = 'string' and length(ex->>'catalogKey') between 1 and 64)) then raise exception 'INVALID'; end if;
    end loop;
  end loop;
  a := d->'assign';
  if jsonb_typeof(a) is distinct from 'object' then raise exception 'INVALID'; end if;
  if jsonb_typeof(a->'memberIds') is distinct from 'array' or jsonb_array_length(a->'memberIds') > 2000
     or jsonb_typeof(a->'planIds') is distinct from 'array' or jsonb_array_length(a->'planIds') > 100 then raise exception 'INVALID'; end if;
  if exists (select 1 from jsonb_array_elements(a->'memberIds') e where jsonb_typeof(e) <> 'string' or length(e #>> '{}') not between 1 and 64)
     or exists (select 1 from jsonb_array_elements(a->'planIds') e where jsonb_typeof(e) <> 'string' or length(e #>> '{}') not between 1 and 64) then
    raise exception 'INVALID';
  end if;
end $$;

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
  -- 0021: who is saving, for the receipt history (this transaction only).
  perform set_config('forgeai.actor_id', coalesce(st.staff_id::text, ''), true);
  perform set_config('forgeai.actor_name', coalesce(st.name, 'Owner (old owner key)'), true);
  v := cur + 1;
  for r in select value from jsonb_array_elements(p_records) loop
    k := r->>'k';
    rid := r->>'id';
    if k is null or k not in ('gym','member','plan','membership','payment','visit','enquiry','expense','workout_plan') then raise exception 'INVALID'; end if;
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
      -- 0021: the receipt and price rules, for every session (owner included).
      if k = 'payment' then
        perform public._receipt_ok(g, rid, r->'d', is_staff);
      elsif k in ('plan', 'membership') then
        perform public._prices_ok(g, k, rid, r->'d');
      elsif k = 'workout_plan' then
        -- 0024: a workout plan's shape (owner and front desk / trainers alike).
        perform public._workout_plan_ok(r->'d');
      end if;
      -- 0019 (C7-12): a NEW receipt or plan says who took the money / sold it: the signed-in
      -- person, from the session (never what the device wrote).
      --  - A front-desk session: ALWAYS (an import mark or a blank does not skip it).
      --  - An owner's session: only when the panel named a taker (collectedBy / soldBy). Records
      --    without one are history: moving a browser gym online, an import. They stay as they are.
      --  - The old owner key (no person): left as written.
      d := r->'d';
      if st.staff_id is not null and prev is null
         and (is_staff
              or (coalesce(d->>'importId', '') = ''
                  and coalesce(d->>(case when k = 'payment' then 'collectedBy' else 'soldBy' end), '') <> '')) then
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
      -- 0024: a workout plan says who made it (the signed-in person, from the session; the member
      -- sees "From <gym> · <name>"), and keeps it on every later save.
      if k = 'workout_plan' then
        if prev is null then
          d := d - 'createdBy' - 'createdByName';
          if st.staff_id is not null then d := d || jsonb_build_object('createdBy', st.staff_id::text, 'createdByName', st.name); end if;
        else
          foreach tk in array array['createdBy', 'createdByName'] loop
            if prev ? tk then d := jsonb_set(d, array[tk], prev->tk); else d := d - tk; end if;
          end loop;
        end if;
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

-- The member app's read (see the top). Never a raise after the key check.
--   {ok:true, gymId, gymName, plans: [{id, version, name, note, routines, byName, updatedAt}]}
--   {error: NO_PHONE | GYM_NOT_ONLINE | NOT_ON_ROSTER | SHARED_NUMBER | NAME_MISMATCH, gymName}
create or replace function public.member_gym_plans(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  g public.gyms;
  ph text;
  roster public.crm_records;
  sharing int;
  day text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  my_plans text[];
  out jsonb;
begin
  select * into g from public.gyms where gym_id = m.gym_id;
  -- 0023's steps, in its order.
  ph := public._norm_phone(m.checkin_phone);
  if ph is null then return jsonb_build_object('error', 'NO_PHONE', 'gymName', g.name); end if;
  if coalesce(g.crm_version, 0) = 0
     and not exists (select 1 from public.crm_records where gym_id = g.gym_id and kind = 'member') then
    return jsonb_build_object('error', 'GYM_NOT_ONLINE', 'gymName', g.name);
  end if;
  roster := public._checkin_roster_member(g.gym_id, ph);
  if roster.id is null then return jsonb_build_object('error', 'NOT_ON_ROSTER', 'gymName', g.name); end if;
  select count(*) into sharing from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'member' and not r.deleted
     and coalesce(r.data->>'archived', 'false') <> 'true'
     and public._norm_phone(r.data->>'phone') = ph;
  if sharing > 1 then return jsonb_build_object('error', 'SHARED_NUMBER', 'gymName', g.name); end if;
  if public._first_name_key(roster.data->>'fullName') is null
     or public._first_name_key(roster.data->>'fullName') is distinct from public._first_name_key(m.name) then
    return jsonb_build_object('error', 'NAME_MISMATCH', 'gymName', g.name);
  end if;

  -- The plans of the memberships covering today.
  select coalesce(array_agg(distinct r.data->>'planId'), '{}') into my_plans
    from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'membership' and not r.deleted
     and r.data->>'memberId' = roster.id
     and coalesce(r.data->>'cancelled', 'false') <> 'true'
     and r.data->>'startsOn' <= day and r.data->>'endsOn' >= day;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id, 'version', w.version, 'name', w.data->>'name', 'note', w.data->'note',
           'routines', w.data->'routines', 'byName', w.data->'createdByName', 'updatedAt', w.data->'updatedAt')
           order by w.id), '[]'::jsonb)
    into out
    from public.crm_records w
   where w.gym_id = g.gym_id and w.kind = 'workout_plan' and not w.deleted
     and coalesce(w.data->>'withdrawn', 'false') <> 'true'
     and (w.data->'assign'->'memberIds' ? roster.id
          or exists (select 1 from jsonb_array_elements_text(w.data->'assign'->'planIds') p where p = any(my_plans)));

  return jsonb_build_object('ok', true, 'gymId', g.gym_id::text, 'gymName', g.name, 'plans', out);
end $$;

revoke all on function public._workout_plan_ok(jsonb) from public, anon, authenticated;
revoke all on function public.member_gym_plans(text) from public;
grant execute on function public.member_gym_plans(text) to anon, authenticated;
revoke all on function public.crm_push(text, bigint, jsonb, uuid) from public;
grant execute on function public.crm_push(text, bigint, jsonb, uuid) to anon, authenticated;
