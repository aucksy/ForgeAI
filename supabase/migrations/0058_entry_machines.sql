-- (NOT APPLIED) - needs the owner's yes (paste into the Supabase SQL Editor after 0057).
-- 0058: F103 entry machines, step 1 (T77, owner request R-378, 6 Nov 2026). ADDITIVE and re-runnable:
-- five new tables and the gate_* functions. Changes no existing table or function.
--
-- eSSL / ZKTeco machines at the gym door call MettleUp's "gate" Worker (deploy/gate, NOT DEPLOYED) over
-- the ADMS protocol. The Worker is the only caller: every gate_* function is granted to service_role
-- ONLY (a Supabase secret key named "gate", held by that Worker), and _gate_guard refuses a call that
-- says it is anon or a signed-in app user even if a grant is ever widened by mistake.
-- The rules the functions follow are the pure TypeScript in apps/dashboard/src/crm/machines
-- (entryMachine.ts: queue and punch rules; memoryStore.ts: the reference behaviour).
--
-- Tables (row-level security ON, nothing granted to anon or authenticated, like every gym table):
--   entry_machines          one row per machine: its gym, serial, firmware type, what it can do, its
--                           clock offset (India 330 minutes), paused, last heard from.
--   entry_machine_members   the gym's member numbers typed into the machine (1001, 1002...) -> member id.
--   entry_machine_commands  the per-machine queue: pending -> sent -> done | error.
--   entry_machine_punches   every punch kept (visit / unknown-member / refused); repeats within 2 min
--                           are dropped by the Worker; the same machine+number+time is kept once.
--   entry_machine_strangers serials that called but are not registered to any gym (for "add a machine").
-- A known member's punch becomes a visit in crm_records (kind 'visit', source 'machine', id
-- <memberId>:<day>), exactly like the QR check-in (0048): one per member per India day, and a day that
-- already has a visit (desk, app, earlier punch) is left as it is.
--
-- NOT HERE YET (step 2): the owner's screens to register a machine and give members numbers, and the
-- job that queues member commands after a sale / renewal / pause and every night.
-- Undo: drop function public.gate_machine(text), public.gate_seen(uuid, jsonb), public.gate_stranger(text, text),
--   public.gate_member_nos(uuid, text[]), public.gate_recent_punches(uuid, text[], bigint),
--   public.gate_save_punches(uuid, jsonb, jsonb), public.gate_take_commands(uuid),
--   public.gate_command_results(uuid, jsonb), public.gate_enqueue(uuid, jsonb), public._gate_guard();
--   drop table public.entry_machine_punches, public.entry_machine_commands, public.entry_machine_members,
--   public.entry_machine_strangers, public.entry_machines;

-- ------------------------------------------------------------------ tables
create table if not exists public.entry_machines (
  machine_id        uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references public.gyms(gym_id) on delete cascade,
  family            text not null default 'zk-adms' check (family in ('zk-adms', 'realtime', 'matrix-cosec', 'hikvision')),
  serial            text not null unique check (serial ~ '^[A-Za-z0-9_-]{1,32}$'),
  name              text not null default 'Entry machine' check (length(name) between 1 and 40),
  firmware          text not null default 'ta' check (firmware in ('ta', 'ac')),
  can_hold_expiry   boolean not null default false,
  can_disable       boolean not null default false,
  can_open_door     boolean not null default false,
  can_enroll        boolean not null default false,
  can_fetch_missed  boolean not null default true,
  tz_minutes        int not null default 330 check (tz_minutes between -720 and 840),
  paused            boolean not null default false,
  attlog_stamp      text check (attlog_stamp ~ '^[0-9]{1,12}$'),
  operlog_stamp     text check (operlog_stamp ~ '^[0-9]{1,12}$'),
  last_seen_at      timestamptz,
  firmware_version  text check (length(firmware_version) <= 64),
  user_count        int,
  last_ip           text check (length(last_ip) <= 15),
  created_at        timestamptz not null default now()
);
create index if not exists entry_machines_gym on public.entry_machines(gym_id);

create table if not exists public.entry_machine_members (
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  member_no  text not null check (member_no ~ '^[1-9][0-9]{0,8}$'),
  member_id  text not null check (length(member_id) between 1 and 64),
  created_at timestamptz not null default now(),
  primary key (gym_id, member_no)
);
create unique index if not exists entry_machine_members_member on public.entry_machine_members(gym_id, member_id);

create table if not exists public.entry_machine_commands (
  command_id  bigint generated always as identity primary key,
  machine_id  uuid not null references public.entry_machines(machine_id) on delete cascade,
  command     jsonb not null check (command->>'type' in ('upsert_member', 'remove_member', 'open_door', 'set_time', 'fetch_missed_entries')),
  status      text not null default 'pending' check (status in ('pending', 'sent', 'done', 'error')),
  tries       int not null default 0,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  done_at     timestamptz,
  result      text check (length(result) <= 32)
);
create index if not exists entry_machine_commands_due on public.entry_machine_commands(machine_id, status, created_at);

create table if not exists public.entry_machine_punches (
  punch_id    bigint generated always as identity primary key,
  machine_id  uuid not null references public.entry_machines(machine_id) on delete cascade,
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  member_no   text not null check (member_no ~ '^[1-9][0-9]{0,8}$'),
  member_id   text check (length(member_id) <= 64),
  at          timestamptz not null,
  local_time  text not null check (length(local_time) <= 19),
  kind        text not null check (kind in ('visit', 'unknown-member', 'refused')),
  verify      text not null default 'other' check (length(verify) <= 12),
  reason      text check (length(reason) <= 40),
  created_at  timestamptz not null default now(),
  unique (machine_id, member_no, at)
);
create index if not exists entry_machine_punches_gym on public.entry_machine_punches(gym_id, at desc);

create table if not exists public.entry_machine_strangers (
  serial    text primary key check (serial ~ '^[A-Za-z0-9_-]{1,32}$'),
  first_at  timestamptz not null default now(),
  last_at   timestamptz not null default now(),
  calls     bigint not null default 1,
  what      text check (length(what) <= 40)
);

alter table public.entry_machines          enable row level security;
alter table public.entry_machine_members   enable row level security;
alter table public.entry_machine_commands  enable row level security;
alter table public.entry_machine_punches   enable row level security;
alter table public.entry_machine_strangers enable row level security;
revoke all on public.entry_machines, public.entry_machine_members, public.entry_machine_commands,
  public.entry_machine_punches, public.entry_machine_strangers from public, anon, authenticated;

-- A suspended gym's member numbers are frozen like its other tables (0027). Its machines are not (the
-- Worker still notes when a machine was last heard from), but gate_machine answers them as paused, so
-- nothing a machine sends is saved.
drop trigger if exists entry_machine_members_not_suspended on public.entry_machine_members;
create trigger entry_machine_members_not_suspended before insert or update or delete on public.entry_machine_members
  for each row execute function public._gym_not_suspended();

-- ------------------------------------------------------------------ helpers (no grants)
-- A second lock behind the grants: a call that says it is anon or a signed-in app user is refused.
create or replace function public._gate_guard() returns void
  language plpgsql stable set search_path = public as $$
declare r text;
begin
  begin
    r := nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role';
  exception when others then
    r := null;  -- quiet: no request claims (SQL editor, cron): the grants already decided
  end;
  if r in ('anon', 'authenticated') then raise exception 'GATE_ONLY'; end if;
end $$;

-- ------------------------------------------------------------------ the Worker's functions
-- The machine for a serial, or null. A machine of a suspended gym reads as paused.
create or replace function public.gate_machine(p_serial text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.entry_machines; st text;
begin
  perform public._gate_guard();
  select * into m from public.entry_machines where serial = btrim(coalesce(p_serial, ''));
  if m.machine_id is null then return null; end if;
  select status into st from public.gyms where gym_id = m.gym_id;
  return jsonb_build_object(
    'id', m.machine_id, 'gymId', m.gym_id, 'family', m.family, 'serial', m.serial, 'name', m.name,
    'firmware', m.firmware,
    'caps', jsonb_build_object('canHoldExpiry', m.can_hold_expiry, 'canDisable', m.can_disable,
                               'canOpenDoor', m.can_open_door, 'canEnrollRemotely', m.can_enroll,
                               'canFetchMissed', m.can_fetch_missed),
    'tzMinutes', m.tz_minutes, 'paused', m.paused or coalesce(st, '') = 'suspended',
    'attlogStamp', m.attlog_stamp, 'operlogStamp', m.operlog_stamp);
end $$;

-- The machine was heard from. last_seen_at is written at most once a minute (a machine polls every
-- 30 s); stamps and details whenever they come.
create or replace function public.gate_seen(p_machine uuid, p_info jsonb)
  returns void language plpgsql security definer set search_path = public as $$
declare i jsonb := case when jsonb_typeof(p_info) = 'object' then p_info else '{}'::jsonb end;
begin
  perform public._gate_guard();
  update public.entry_machines set
      last_seen_at     = now(),
      firmware_version = coalesce(left(nullif(btrim(i->>'firmware'), ''), 64), firmware_version),
      user_count       = case when i->>'users' ~ '^[0-9]{1,7}$' then (i->>'users')::int else user_count end,
      last_ip          = case when i->>'ip' ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' then i->>'ip' else last_ip end,
      attlog_stamp     = case when i->>'attlogStamp' ~ '^[0-9]{1,12}$' then i->>'attlogStamp' else attlog_stamp end,
      operlog_stamp    = case when i->>'operlogStamp' ~ '^[0-9]{1,12}$' then i->>'operlogStamp' else operlog_stamp end
   where machine_id = p_machine
     and (last_seen_at is null or last_seen_at < now() - interval '1 minute'
          or i->>'attlogStamp' is not null or i->>'operlogStamp' is not null or i->>'firmware' is not null);
end $$;

-- A serial nobody registered called. One row per serial; at most 5000 rows kept (oldest dropped).
create or replace function public.gate_stranger(p_serial text, p_what text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._gate_guard();
  if coalesce(p_serial, '') !~ '^[A-Za-z0-9_-]{1,32}$' then return; end if;
  insert into public.entry_machine_strangers(serial, what) values (p_serial, left(p_what, 40))
  on conflict (serial) do update set last_at = now(), calls = public.entry_machine_strangers.calls + 1, what = excluded.what;
  delete from public.entry_machine_strangers
   where serial in (select serial from public.entry_machine_strangers order by last_at desc offset 5000);
end $$;

-- Member number -> member id, for the numbers asked only ({"1001": "<memberId>"}).
create or replace function public.gate_member_nos(p_gym uuid, p_nos text[])
  returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._gate_guard();
  if coalesce(array_length(p_nos, 1), 0) > 5000 then raise exception 'TOO_MANY'; end if;
  return coalesce((select jsonb_object_agg(k.member_no, k.member_id)
                     from public.entry_machine_members k
                    where k.gym_id = p_gym and k.member_no = any(p_nos)), '{}'::jsonb);
end $$;

-- The newest let-in punch per number on this machine since p_since_ms ({"1001": <epoch ms>}).
create or replace function public.gate_recent_punches(p_machine uuid, p_nos text[], p_since_ms bigint)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._gate_guard();
  if coalesce(array_length(p_nos, 1), 0) > 5000 then raise exception 'TOO_MANY'; end if;
  return coalesce((select jsonb_object_agg(member_no, ms) from (
             select p.member_no, floor(extract(epoch from max(p.at)) * 1000)::bigint as ms
               from public.entry_machine_punches p
              where p.machine_id = p_machine and p.member_no = any(p_nos) and p.kind <> 'refused'
                and p.at >= to_timestamp(p_since_ms / 1000.0)
              group by p.member_no) q), '{}'::jsonb);
end $$;

-- Keep the punches and write the visits. p_punches: [{memberNo, memberId, at (ms), localTime, kind,
-- verify, reason}], repeats already left out. p_visits: [{memberId, visitedOn, checkedInAt (ms)}].
-- A visit is written only for a member number this gym really gave out, and only when that member
-- has no visit that day yet. -> {punches: <new rows>, visits: <new visits>}
create or replace function public.gate_save_punches(p_machine uuid, p_punches jsonb, p_visits jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.entry_machines;
  g public.gyms;
  x jsonb;
  v bigint;
  vid text;
  n_p int := 0;
  n_v int := 0;
begin
  perform public._gate_guard();
  select * into m from public.entry_machines where machine_id = p_machine;
  if m.machine_id is null then raise exception 'NO_MACHINE'; end if;
  if jsonb_typeof(p_punches) is distinct from 'array' or jsonb_typeof(p_visits) is distinct from 'array' then
    raise exception 'BAD_INPUT';
  end if;
  if jsonb_array_length(p_punches) > 5000 or jsonb_array_length(p_visits) > 5000 then raise exception 'TOO_MANY'; end if;

  insert into public.entry_machine_punches(machine_id, gym_id, member_no, member_id, at, local_time, kind, verify, reason)
  select m.machine_id, m.gym_id, e->>'memberNo',
         case when e->>'kind' = 'unknown-member' then null else left(nullif(e->>'memberId', ''), 64) end,
         to_timestamp((e->>'at')::bigint / 1000.0), left(coalesce(e->>'localTime', ''), 19), e->>'kind',
         left(coalesce(nullif(e->>'verify', ''), 'other'), 12), left(e->>'reason', 40)
    from jsonb_array_elements(p_punches) e
   where e->>'kind' in ('visit', 'unknown-member', 'refused')
     and e->>'memberNo' ~ '^[1-9][0-9]{0,8}$'
     and e->>'at' ~ '^[0-9]{1,15}$'
  on conflict (machine_id, member_no, at) do nothing;
  get diagnostics n_p = row_count;

  if jsonb_array_length(p_visits) = 0 then return jsonb_build_object('punches', n_p, 'visits', 0); end if;

  -- The gym's row lock (the one crm_push and member_check_in take): versions never collide.
  select * into g from public.gyms where gym_id = m.gym_id for update;
  v := coalesce(g.crm_version, 0);
  for x in select e from jsonb_array_elements(p_visits) e loop
    continue when coalesce(x->>'visitedOn', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
               or coalesce(x->>'checkedInAt', '') !~ '^[0-9]{1,15}$';
    continue when not exists (select 1 from public.entry_machine_members k
                               where k.gym_id = m.gym_id and k.member_id = x->>'memberId');
    continue when exists (select 1 from public.crm_records r
                           where r.gym_id = m.gym_id and r.kind = 'visit' and not r.deleted
                             and r.data->>'memberId' = x->>'memberId' and r.data->>'visitedOn' = x->>'visitedOn');
    vid := (x->>'memberId') || ':' || (x->>'visitedOn');
    continue when length(vid) > 64;
    v := v + 1;
    insert into public.crm_records(gym_id, kind, id, data, version)
      values (m.gym_id, 'visit', vid,
              jsonb_build_object('id', vid, 'gymId', m.gym_id::text, 'memberId', x->>'memberId',
                                 'visitedOn', x->>'visitedOn', 'checkedInAt', (x->>'checkedInAt')::bigint,
                                 'source', 'machine', 'machineId', m.machine_id::text),
              v)
      on conflict (gym_id, kind, id) do update
        set data = excluded.data, version = excluded.version, deleted = false, updated_at = now();
    n_v := n_v + 1;
  end loop;
  if v <> coalesce(g.crm_version, 0) then update public.gyms set crm_version = v where gym_id = m.gym_id; end if;
  return jsonb_build_object('punches', n_p, 'visits', n_v);
end $$;

-- Hand out what is due (entryMachine.takeForPoll): a command sent 10+ minutes ago with no answer goes
-- back to pending, or to error 'NO_ANSWER' after 5 sends; then up to 20 pending, oldest first, are
-- marked sent. -> [{id, command, tries}]
create or replace function public.gate_take_commands(p_machine uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare res jsonb;
begin
  perform public._gate_guard();
  update public.entry_machine_commands
     set status  = case when tries >= 5 then 'error' else 'pending' end,
         done_at = case when tries >= 5 then now() else null end,
         result  = case when tries >= 5 then 'NO_ANSWER' else result end
   where machine_id = p_machine and status = 'sent' and sent_at <= now() - interval '10 minutes';

  with due as (
    select c.command_id from public.entry_machine_commands c
     where c.machine_id = p_machine and c.status = 'pending'
     order by c.created_at, c.command_id
     limit 20
     for update skip locked
  ), sent as (
    update public.entry_machine_commands c
       set status = 'sent', sent_at = now(), tries = c.tries + 1
      from due where c.command_id = due.command_id
    returning c.command_id, c.command, c.tries, c.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', s.command_id, 'command', s.command, 'tries', s.tries)
                            order by s.created_at, s.command_id), '[]'::jsonb)
    into res from sent s;
  return res;
end $$;

-- The machine's answers [{id, code}]: "0" = done, any other number = error (kept for the owner).
-- An answer about another machine's command, or one already finished, changes nothing.
create or replace function public.gate_command_results(p_machine uuid, p_answers jsonb)
  returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public._gate_guard();
  if jsonb_typeof(p_answers) is distinct from 'array' then raise exception 'BAD_INPUT'; end if;
  update public.entry_machine_commands c
     set status = case when a.code = '0' then 'done' else 'error' end, done_at = now(), result = a.code
    from (select (e->>'id')::bigint as id, btrim(e->>'code') as code
            from jsonb_array_elements(p_answers) e
           where e->>'id' ~ '^[0-9]{1,15}$' and btrim(coalesce(e->>'code', '')) ~ '^-?[0-9]{1,6}$') a
   where c.command_id = a.id and c.machine_id = p_machine and c.status in ('pending', 'sent');
  get diagnostics n = row_count;
  return n;
end $$;

-- Queue one command (entryMachine.enqueue): a newer upsert/remove for the same member replaces a
-- PENDING one; a pending set_time / open_door is not queued twice. -> the new command's id.
create or replace function public.gate_enqueue(p_machine uuid, p_command jsonb)
  returns bigint language plpgsql security definer set search_path = public as $$
declare t text := p_command->>'type'; new_id bigint;
begin
  perform public._gate_guard();
  if t is null or t not in ('upsert_member', 'remove_member', 'open_door', 'set_time', 'fetch_missed_entries') then
    raise exception 'BAD_INPUT';
  end if;
  if t in ('upsert_member', 'remove_member') then
    if coalesce(p_command->>'memberNo', '') !~ '^[1-9][0-9]{0,8}$' then raise exception 'BAD_INPUT'; end if;
    delete from public.entry_machine_commands
     where machine_id = p_machine and status = 'pending'
       and command->>'type' in ('upsert_member', 'remove_member') and command->>'memberNo' = p_command->>'memberNo';
  elsif t in ('set_time', 'open_door') then
    delete from public.entry_machine_commands
     where machine_id = p_machine and status = 'pending' and command->>'type' = t;
  end if;
  insert into public.entry_machine_commands(machine_id, command) values (p_machine, p_command)
    returning command_id into new_id;
  return new_id;
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._gate_guard()                                   from public, anon, authenticated;
revoke all on function public.gate_machine(text)                              from public, anon, authenticated;
revoke all on function public.gate_seen(uuid, jsonb)                          from public, anon, authenticated;
revoke all on function public.gate_stranger(text, text)                       from public, anon, authenticated;
revoke all on function public.gate_member_nos(uuid, text[])                   from public, anon, authenticated;
revoke all on function public.gate_recent_punches(uuid, text[], bigint)       from public, anon, authenticated;
revoke all on function public.gate_save_punches(uuid, jsonb, jsonb)           from public, anon, authenticated;
revoke all on function public.gate_take_commands(uuid)                        from public, anon, authenticated;
revoke all on function public.gate_command_results(uuid, jsonb)               from public, anon, authenticated;
revoke all on function public.gate_enqueue(uuid, jsonb)                       from public, anon, authenticated;
grant execute on function public.gate_machine(text)                           to service_role;
grant execute on function public.gate_seen(uuid, jsonb)                       to service_role;
grant execute on function public.gate_stranger(text, text)                    to service_role;
grant execute on function public.gate_member_nos(uuid, text[])                to service_role;
grant execute on function public.gate_recent_punches(uuid, text[], bigint)    to service_role;
grant execute on function public.gate_save_punches(uuid, jsonb, jsonb)        to service_role;
grant execute on function public.gate_take_commands(uuid)                     to service_role;
grant execute on function public.gate_command_results(uuid, jsonb)            to service_role;
grant execute on function public.gate_enqueue(uuid, jsonb)                    to service_role;
