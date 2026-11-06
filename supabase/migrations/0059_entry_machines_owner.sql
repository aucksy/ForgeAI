-- (NOT APPLIED) - needs the owner's yes (paste into the Supabase SQL Editor after 0058).
-- 0059: F103 entry machines, step 2 (T77, owner request R-378, 6 Nov 2026). ADDITIVE and re-runnable:
-- one new column, one private helper and six owner_* functions. Changes no existing function. Needs 0058.
--
-- The admin app's side (apps/dashboard/src/crm/shop/entryMachinesApi.ts, ui/screens/EntryMachines.tsx,
-- ui/EntryMachineJob.tsx). Every function takes the device's key like every owner_* function:
--   owner_entry_machines          owner and desk: the gym's machines (last heard from, refused today), and
--                                 every member's machine number.
--   owner_add_entry_machine       OWNER ONLY: register a machine by its serial (at most 10 per gym).
--   owner_remove_entry_machine    OWNER ONLY: the machine row goes (its queue and punch log with it; the
--                                 visits it made stay in the register).
--   owner_set_machine_numbers     owner and desk: member -> machine number. A number another member has is
--                                 refused (NUMBER_TAKEN). A changed number queues "remove the old number"
--                                 on every machine.
--   owner_queue_machine_commands  owner and desk: upsert_member / remove_member for the gym's own numbers
--                                 only, on the gym's own machines only; with p_sweep_day, that day's nightly
--                                 sweep, once per machine per day (entry_machines.swept_on).
-- Undo: drop function public.owner_entry_machines(text), public.owner_add_entry_machine(text, text, text, text, int),
--   public.owner_remove_entry_machine(text, uuid), public.owner_set_machine_numbers(text, jsonb),
--   public.owner_queue_machine_commands(text, jsonb, text, uuid[]), public._entry_enqueue(uuid, jsonb);
--   alter table public.entry_machines drop column swept_on;

alter table public.entry_machines add column if not exists swept_on date;

-- ------------------------------------------------------------------ helper (no grants)
-- Queue one command (entryMachine.enqueue, the same as 0058 gate_enqueue without its gate-only guard): a
-- newer upsert/remove for the same member replaces a PENDING one.
create or replace function public._entry_enqueue(p_machine uuid, p_command jsonb)
  returns void language plpgsql security definer set search_path = public as $$
declare t text := p_command->>'type';
begin
  if t is null or t not in ('upsert_member', 'remove_member') then raise exception 'BAD_INPUT'; end if;
  if coalesce(p_command->>'memberNo', '') !~ '^[1-9][0-9]{0,8}$' then raise exception 'BAD_INPUT'; end if;
  delete from public.entry_machine_commands
   where machine_id = p_machine and status = 'pending'
     and command->>'type' in ('upsert_member', 'remove_member') and command->>'memberNo' = p_command->>'memberNo';
  insert into public.entry_machine_commands(machine_id, command) values (p_machine, p_command);
end $$;

-- ------------------------------------------------------------------ the list
create or replace function public.owner_entry_machines(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  day_start timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
begin
  return jsonb_build_object(
    'ok', true,
    'canEdit', st.staff_id is null or st.role = 'owner',
    'machines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.machine_id, 'name', m.name, 'family', m.family, 'serial', m.serial, 'firmware', m.firmware,
               'caps', jsonb_build_object('canHoldExpiry', m.can_hold_expiry, 'canDisable', m.can_disable,
                                          'canOpenDoor', m.can_open_door, 'canEnrollRemotely', m.can_enroll,
                                          'canFetchMissed', m.can_fetch_missed),
               'paused', m.paused,
               'lastSeenAt', case when m.last_seen_at is null then null
                                  else floor(extract(epoch from m.last_seen_at) * 1000)::bigint end,
               'sweptOn', to_char(m.swept_on, 'YYYY-MM-DD'),
               'refusedToday', (select count(*) from public.entry_machine_punches p
                                 where p.machine_id = m.machine_id and p.kind = 'refused' and p.at >= day_start),
               'unknownToday', (select count(*) from public.entry_machine_punches p
                                 where p.machine_id = m.machine_id and p.kind = 'unknown-member' and p.at >= day_start),
               'lastRefused', (select jsonb_build_object('memberNo', p.member_no,
                                                         'at', floor(extract(epoch from p.at) * 1000)::bigint)
                                 from public.entry_machine_punches p
                                where p.machine_id = m.machine_id and p.kind = 'refused' and p.at >= day_start
                                order by p.at desc limit 1))
             order by m.created_at)
        from public.entry_machines m where m.gym_id = g), '[]'::jsonb),
    'numbers', coalesce((select jsonb_object_agg(k.member_id, k.member_no)
                           from public.entry_machine_members k where k.gym_id = g), '{}'::jsonb));
end $$;

-- ------------------------------------------------------------------ add / remove (owner only)
create or replace function public.owner_add_entry_machine(p_key text, p_serial text, p_name text, p_family text, p_tz_minutes int)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);
  s text := btrim(coalesce(p_serial, ''));
  n text := left(nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ''), 40);
  id uuid;
begin
  if s !~ '^[A-Za-z0-9_-]{1,32}$' then raise exception 'BAD_SERIAL'; end if;
  if coalesce(p_family, 'zk-adms') <> 'zk-adms' then raise exception 'NOT_YET'; end if;
  if exists (select 1 from public.entry_machines where upper(serial) = upper(s)) then raise exception 'DUPLICATE_SERIAL'; end if;
  if (select count(*) from public.entry_machines where gym_id = g) >= 10 then raise exception 'TOO_MANY'; end if;
  insert into public.entry_machines(gym_id, family, serial, name, tz_minutes)
    values (g, 'zk-adms', s, coalesce(n, 'Entry machine'),
            case when p_tz_minutes between -720 and 840 then p_tz_minutes else 330 end)
    returning machine_id into id;
  -- It called before it was added: it is no longer a stranger.
  delete from public.entry_machine_strangers where upper(serial) = upper(s);
  return id;
end $$;

create or replace function public.owner_remove_entry_machine(p_key text, p_machine uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key);
begin
  delete from public.entry_machines where machine_id = p_machine and gym_id = g;
  if not found then raise exception 'NO_MACHINE'; end if;
end $$;

-- ------------------------------------------------------------------ machine numbers (owner and desk)
-- p_numbers: [{memberId, memberNo}]. All or nothing: one number another member has refuses the lot.
create or replace function public.owner_set_machine_numbers(p_key text, p_numbers jsonb)
  returns int language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  x jsonb;
  mid text;
  no text;
  old text;
  m uuid;
  n int := 0;
begin
  if jsonb_typeof(p_numbers) is distinct from 'array' then raise exception 'BAD_INPUT'; end if;
  if jsonb_array_length(p_numbers) > 5000 then raise exception 'TOO_MANY'; end if;
  -- The gym's row lock: two desks giving out numbers at once never collide.
  perform 1 from public.gyms where gym_id = g for update;
  for x in select e from jsonb_array_elements(p_numbers) e loop
    mid := x->>'memberId';
    no := x->>'memberNo';
    if coalesce(no, '') !~ '^[1-9][0-9]{0,8}$' then raise exception 'BAD_NUMBER'; end if;
    if mid is null or length(mid) not between 1 and 64 then raise exception 'BAD_INPUT'; end if;
    if not exists (select 1 from public.crm_records r
                    where r.gym_id = g and r.kind = 'member' and r.id = mid and not r.deleted) then
      raise exception 'NO_MEMBER';
    end if;
    if exists (select 1 from public.entry_machine_members k where k.gym_id = g and k.member_no = no and k.member_id <> mid) then
      raise exception 'NUMBER_TAKEN';
    end if;
    select member_no into old from public.entry_machine_members where gym_id = g and member_id = mid;
    continue when old = no;
    if old is not null then
      update public.entry_machine_members set member_no = no where gym_id = g and member_id = mid;
      -- The machines still hold the old number: take it off.
      for m in select machine_id from public.entry_machines where gym_id = g and not paused loop
        perform public._entry_enqueue(m, jsonb_build_object('type', 'remove_member', 'memberNo', old));
      end loop;
    else
      insert into public.entry_machine_members(gym_id, member_no, member_id) values (g, no, mid);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ------------------------------------------------------------------ member updates (owner and desk)
-- p_items: [{machineId, command}] (entryMachine.syncCommands). Only upsert_member / remove_member, only for a
-- machine of this gym, only for a number this gym gave out (a remove may name a number no longer given out).
-- p_sweep_day + p_sweep_machines: this is that day's nightly sweep for those machines; a machine already swept
-- that day (another desk) gets none of its items. -> how many were queued.
create or replace function public.owner_queue_machine_commands(p_key text, p_items jsonb, p_sweep_day text, p_sweep_machines uuid[])
  returns int language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  d date;
  x jsonb;
  c jsonb;
  mid uuid;
  skip uuid[] := '{}';
  n int := 0;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'BAD_INPUT'; end if;
  if jsonb_array_length(p_items) > 20000 then raise exception 'TOO_MANY'; end if;
  if p_sweep_day is not null then
    if p_sweep_day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'BAD_INPUT'; end if;
    d := p_sweep_day::date;
    -- Lock the machines being swept; those already swept that day (or later) are skipped.
    select coalesce(array_agg(machine_id), '{}') into skip from (
      select machine_id from public.entry_machines
       where gym_id = g and machine_id = any(coalesce(p_sweep_machines, '{}')) and swept_on >= d
       for update) q;
    update public.entry_machines set swept_on = d
     where gym_id = g and machine_id = any(coalesce(p_sweep_machines, '{}')) and (swept_on is null or swept_on < d);
  end if;
  for x in select e from jsonb_array_elements(p_items) e loop
    begin
      mid := (x->>'machineId')::uuid;
    exception when others then
      raise exception 'BAD_INPUT';
    end;
    continue when mid = any(skip);
    if not exists (select 1 from public.entry_machines where machine_id = mid and gym_id = g) then raise exception 'NO_MACHINE'; end if;
    c := x->'command';
    if jsonb_typeof(c) is distinct from 'object' or c->>'type' not in ('upsert_member', 'remove_member') then raise exception 'BAD_INPUT'; end if;
    if c->>'type' = 'upsert_member' then
      if not exists (select 1 from public.entry_machine_members k where k.gym_id = g and k.member_no = c->>'memberNo') then
        raise exception 'BAD_NUMBER';
      end if;
      if jsonb_typeof(c->'active') is distinct from 'boolean' then raise exception 'BAD_INPUT'; end if;
      -- Only the fields a machine needs, with a short name.
      c := jsonb_build_object('type', 'upsert_member', 'memberNo', c->>'memberNo',
                              'name', left(coalesce(c->>'name', ''), 40), 'active', (c->>'active')::boolean,
                              'validFrom', case when c->>'validFrom' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then c->>'validFrom' end,
                              'validTo', case when c->>'validTo' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then c->>'validTo' end);
    else
      c := jsonb_build_object('type', 'remove_member', 'memberNo', c->>'memberNo');
    end if;
    perform public._entry_enqueue(mid, c);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._entry_enqueue(uuid, jsonb)                                   from public, anon, authenticated;
revoke all on function public.owner_entry_machines(text)                                    from public;
revoke all on function public.owner_add_entry_machine(text, text, text, text, int)          from public;
revoke all on function public.owner_remove_entry_machine(text, uuid)                        from public;
revoke all on function public.owner_set_machine_numbers(text, jsonb)                        from public;
revoke all on function public.owner_queue_machine_commands(text, jsonb, text, uuid[])       from public;
grant execute on function public.owner_entry_machines(text)                                 to anon, authenticated;
grant execute on function public.owner_add_entry_machine(text, text, text, text, int)       to anon, authenticated;
grant execute on function public.owner_remove_entry_machine(text, uuid)                     to anon, authenticated;
grant execute on function public.owner_set_machine_numbers(text, jsonb)                     to anon, authenticated;
grant execute on function public.owner_queue_machine_commands(text, jsonb, text, uuid[])    to anon, authenticated;

notify pgrst, 'reload schema';
