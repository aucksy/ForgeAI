-- NOT APPLIED LIVE. Waits for the owner's "yes 0097" (R-595, 16 Nov 2026).
--
-- 0097: the direct-read record. Every read (and change) of gym data made with the Supabase OWNER login is
-- written down and kept 2 years, and the gym owner sees the ones that touched the gym, next to the support
-- access looks (0028). Why: on 15 Nov 2026 Claude read a test gym's (Crispy Curves) member rows from the
-- Supabase SQL editor. The data agreement says every look is recorded; until now only HQ's own looks were.
--
-- WHAT "THE OWNER LOGIN" MEANS. The Supabase dashboard's SQL editor and table editor, a psql or pooler
-- connection with the database password, and the Supabase MCP all reach the database as the role `postgres`
-- (Supabase docs, "Identifying Dashboard SQL Editor Activity by User"). The app never does: members, the
-- admin app and the Workers come in through PostgREST as anon / authenticated / service_role. So the switch
-- is set on the role `postgres` only, and the app's own traffic is never logged.
--
-- HOW (a SELECT cannot fire a trigger, so the database cannot write this itself):
--   1. pgaudit (a Postgres extension Supabase ships) writes one "AUDIT:" line into Supabase's Postgres log
--      for every read or change made by a `postgres` session: the time, the tables and the query text.
--      Only for `postgres`: ALTER ROLE ... SET pgaudit.log (below). Catalog-only queries (the dashboard
--      looking up table lists) are left out (log_catalog off).
--   2. Supabase keeps that log about 1 day on the free plan. The HQ Worker (deploy/hq/readLog.js, every
--      10 minutes) asks Supabase's Management API for the new AUDIT lines and hands them to
--      hq_db_reads_ingest below, which keeps one small row per statement in public.db_direct_reads.
--      The Worker comes in as service_role, so its own calls are never logged (no loop).
--   3. The gym owner's "MettleUp access" answer (owner_hq_access) gains "direct": the looks that named this
--      gym, and the looks that named no gym (those could have read any gym). Tables and times only, never
--      the query text (it can hold other gyms' names or numbers). HQ sees everything (hq_db_reads).
--
-- PROVABLE, NOT A LOCK. The owner login can still switch pgaudit off. That cannot be hidden: every pull
-- checks the switch and writes an "audit_off" row the moment it is gone; a pull that comes after the log
-- has expired writes a "gap" row (not recorded from .. to ..); deleting rows here as `postgres` is itself
-- a logged change, recorded on the next pull. Rows are append-only (as hq_audit, 0026).
--
-- SIZE. One row per statement, the query text cut to 2,000 characters: about 1 KB a look. At most 2,000
-- rows a day and 20,000 rows in all (about 20 MB at worst); above that only a counter goes up. Kept 2 years.
--
-- WHAT THE LIVE APPLY CHANGES: turns on the pgaudit extension; sets 3 pgaudit settings on the role
-- `postgres` (new sessions only: the SQL editor picks it up within minutes); adds 2 tables (RLS on, nobody
-- but these functions can read them); adds 3 hq_* functions (service_role only); replaces owner_hq_access
-- (0030) with the same answer plus "direct" and "directSince". Nothing is recorded until the Worker has the
-- Management API key (SUPABASE_LOGS_TOKEN). Re-runnable.
--
-- UNDO: alter role postgres reset pgaudit.log; (and pgaudit.log_catalog, pgaudit.log_relation); re-run 0030 for owner_hq_access.

-- ------------------------------------------------------------------ 1. the switch, on `postgres` only
create extension if not exists pgaudit with schema extensions;

-- read = SELECT, COPY ... TO; write = INSERT, UPDATE, DELETE, TRUNCATE, COPY ... FROM; misc_set = SET (so a
-- session that switches pgaudit off for itself is seen doing it).
alter role postgres set pgaudit.log = 'read, write, misc_set';
alter role postgres set pgaudit.log_catalog = off;      -- the dashboard's own catalog lookups stay out
alter role postgres set pgaudit.log_relation = on;      -- one line per table, so the tables are named

-- Supabase's other login roles, where the owner's account can reach the data without `postgres` (the MCP's
-- read-only mode uses supabase_read_only_user). Supabase may refuse ALTER ROLE on its own roles: then a
-- notice, and hq_db_reads shows which roles are switched on.
do $$
declare r text;
begin
  foreach r in array array['supabase_read_only_user', 'dashboard_user'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      begin
        execute format('alter role %I set pgaudit.log = %L', r, 'read, write, misc_set');
        execute format('alter role %I set pgaudit.log_catalog = off', r);
        execute format('alter role %I set pgaudit.log_relation = on', r);
      exception when others then
        raise notice 'direct-read record: role % not switched on (%)', r, sqlerrm;
      end;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------ 2. the record
create table if not exists public.db_direct_reads (
  look_id    text primary key,                  -- '<Postgres session id>:<statement number>' (one statement)
  at         timestamptz not null,
  role       text not null,                     -- the login role: postgres, supabase_read_only_user, ...
  kind       text not null check (kind in ('read', 'change', 'audit_change', 'audit_off', 'audit_on', 'gap')),
  objects    text[] not null default '{}',      -- 'public.crm_records', 'auth.users', ...
  gym_ids    uuid[] not null default '{}',      -- the gyms the query names; empty = it named none (any gym)
  query      text not null default '',          -- cut to 2,000 characters; HQ only, never shown to a gym
  source     text not null default 'direct' check (source in ('dashboard', 'direct', 'system')),
  who        text,                              -- the dashboard's "-- user: <id>" comment, when there is one
  until_at   timestamptz,                       -- 'gap' rows: not recorded from at to until_at
  created_at timestamptz not null default now()
);
create index if not exists db_direct_reads_at on public.db_direct_reads (at desc);
create index if not exists db_direct_reads_gyms on public.db_direct_reads using gin (gym_ids);
alter table public.db_direct_reads enable row level security;
revoke all on public.db_direct_reads from public, anon, authenticated;

-- One row: since when the record runs, how far the pulls have covered, and the switch as last seen.
create table if not exists public.db_read_log_state (
  id          int primary key default 1 check (id = 1),
  started_at  timestamptz not null default now(),
  covered_to  timestamptz not null default now(), -- every AUDIT line up to here is in db_direct_reads
  last_pull_at timestamptz,
  last_error  text,
  audit_on    boolean,
  audited_roles text[] not null default '{}',
  dropped     bigint not null default 0            -- looks not kept because a cap was reached
);
alter table public.db_read_log_state enable row level security;
revoke all on public.db_read_log_state from public, anon, authenticated;
insert into public.db_read_log_state(id) values (1) on conflict (id) do nothing;

-- Append-only, as hq_audit (0026). An update may only ADD tables or gyms to a statement (its lines can arrive
-- in two pulls). Deleting only rows older than 2 years, inside the ingest (forgeai.hq_purge on).
create or replace function public._db_reads_append_only() returns trigger
  language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('forgeai.hq_purge', true) = 'on' and old.at < now() - interval '2 years' then return old; end if;
    raise exception 'APPEND_ONLY';
  end if;
  if new.look_id = old.look_id and new.at = old.at and new.role = old.role and new.kind = old.kind
     and new.query = old.query and new.source = old.source and new.who is not distinct from old.who
     and new.until_at is not distinct from old.until_at and new.created_at = old.created_at
     and new.objects @> old.objects and new.gym_ids @> old.gym_ids then
    return new;
  end if;
  raise exception 'APPEND_ONLY';
end $$;

create or replace function public._db_reads_no_truncate() returns trigger
  language plpgsql set search_path = public as $$
begin
  raise exception 'APPEND_ONLY';
end $$;

drop trigger if exists db_direct_reads_append_only on public.db_direct_reads;
create trigger db_direct_reads_append_only before update or delete on public.db_direct_reads
  for each row execute function public._db_reads_append_only();
drop trigger if exists db_direct_reads_no_truncate on public.db_direct_reads;
create trigger db_direct_reads_no_truncate before truncate on public.db_direct_reads
  for each statement execute function public._db_reads_no_truncate();

-- The login roles whose pgaudit switch reads and changes. PURE on the catalog.
create or replace function public._db_audited_roles() returns text[]
  language sql stable set search_path = public as $$
  select coalesce(array_agg(r.rolname::text order by r.rolname), '{}')
    from pg_roles r
   where exists (select 1 from unnest(r.rolconfig) c
                  where c like 'pgaudit.log=%' and c like '%read%' and c like '%write%')
$$;

-- ------------------------------------------------------------------ 3. the HQ Worker's two calls
-- Where the next pull starts. Errors: HQ_ONLY.
create or replace function public.hq_db_reads_cursor()
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.db_read_log_state;
begin
  perform public._hq_guard();
  select * into s from public.db_read_log_state where id = 1;
  return jsonb_build_object('coveredTo', s.covered_to, 'startedAt', s.started_at);
end $$;

-- One pull. p_items: the statements the Worker read from the AUDIT lines, each
--   {id, at, role, kind ('read' | 'change' | 'audit_change'), objects: [..], uuids: [..], text, source, who}.
-- p_from: the earliest moment this pull could still see (the log keeps about a day); p_covered_to: every line
-- up to here is in p_items; p_error: the pull failed (the key was refused, Supabase was down): only noted.
-- Writes 'gap' when p_from is past what was covered before, and 'audit_off' / 'audit_on' when the switch on
-- `postgres` changed. -> {added, dropped, auditOn, roles}. Errors: HQ_ONLY, INVALID.
create or replace function public.hq_db_reads_ingest(p_items jsonb, p_from timestamptz, p_covered_to timestamptz, p_error text default null)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  s public.db_read_log_state; it jsonb; v_added int := 0; v_dropped int := 0; v_today int; v_total int;
  v_roles text[] := public._db_audited_roles(); v_on boolean; v_gyms uuid[]; v_q text;
begin
  perform public._hq_guard();
  select * into s from public.db_read_log_state where id = 1 for update;
  v_on := 'postgres' = any(v_roles);

  -- The switch, as seen now.
  if s.audit_on is distinct from v_on and (s.audit_on is not null or not v_on) then
    insert into public.db_direct_reads(look_id, at, role, kind, query, source)
      values ('switch:' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'), now(), 'postgres',
              case when v_on then 'audit_on' else 'audit_off' end,
              case when v_on then 'The direct-read record was switched on again.'
                   else 'The direct-read record was switched off on the role postgres.' end, 'system')
      on conflict (look_id) do nothing;
  end if;

  if p_error is not null then
    update public.db_read_log_state set last_pull_at = now(), last_error = left(p_error, 300),
           audit_on = v_on, audited_roles = v_roles where id = 1;
    return jsonb_build_object('added', 0, 'dropped', 0, 'auditOn', v_on, 'roles', to_jsonb(v_roles));
  end if;
  if p_from is null or p_covered_to is null or p_covered_to < p_from or p_covered_to > now() + interval '5 minutes'
     or jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 1000 then
    raise exception 'INVALID';
  end if;

  -- Lines that expired before any pull saw them.
  if p_from > s.covered_to + interval '2 minutes' then
    insert into public.db_direct_reads(look_id, at, role, kind, query, source, until_at)
      values ('gap:' || to_char(s.covered_to, 'YYYYMMDDHH24MISSUS'), s.covered_to, 'postgres', 'gap',
              'Not recorded: no pull read the log before Supabase deleted it.', 'system', p_from)
      on conflict (look_id) do nothing;
  end if;

  select count(*) into v_today from public.db_direct_reads where created_at >= date_trunc('day', now());
  select count(*) into v_total from public.db_direct_reads;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if jsonb_typeof(it) <> 'object' or coalesce(it->>'id', '') !~ '^[A-Za-z0-9.:_-]{1,100}$'
       or coalesce(it->>'kind', '') not in ('read', 'change', 'audit_change')
       or coalesce(it->>'role', '') !~ '^[a-z_][a-z0-9_]{0,62}$' then
      raise exception 'INVALID';
    end if;
    v_q := left(coalesce(it->>'text', ''), 2000);
    -- The gyms it names: a gym id anywhere in the query, or the gym's name (5 letters or more).
    select coalesce(array_agg(distinct g.gym_id), '{}') into v_gyms
      from public.gyms g
     where g.gym_id::text in (select lower(u) from jsonb_array_elements_text(coalesce(it->'uuids', '[]'::jsonb)) u)
        or (length(g.name) >= 5 and position(lower(g.name) in lower(v_q)) > 0);
    if exists (select 1 from public.db_direct_reads where look_id = it->>'id') then
      update public.db_direct_reads d
         set objects = (select coalesce(array_agg(distinct o order by o), '{}') from unnest(d.objects || array(
                          select left(x, 130) from jsonb_array_elements_text(coalesce(it->'objects', '[]'::jsonb)) x limit 50)) o),
             gym_ids = (select coalesce(array_agg(distinct x), '{}') from unnest(d.gym_ids || v_gyms) x)
       where d.look_id = it->>'id';
      continue;
    end if;
    if v_today >= 2000 or v_total >= 20000 then
      v_dropped := v_dropped + 1;
      continue;
    end if;
    insert into public.db_direct_reads(look_id, at, role, kind, objects, gym_ids, query, source, who)
      values (it->>'id', (it->>'at')::timestamptz, it->>'role', it->>'kind',
              (select coalesce(array_agg(distinct x order by x), '{}') from
                 (select left(y, 130) x from jsonb_array_elements_text(coalesce(it->'objects', '[]'::jsonb)) y limit 50) z),
              v_gyms, v_q,
              case when it->>'source' = 'dashboard' then 'dashboard' else 'direct' end,
              nullif(left(coalesce(it->>'who', ''), 64), ''));
    v_added := v_added + 1; v_today := v_today + 1; v_total := v_total + 1;
  end loop;

  perform set_config('forgeai.hq_purge', 'on', true);
  delete from public.db_direct_reads where at < now() - interval '2 years';
  perform set_config('forgeai.hq_purge', 'off', true);

  update public.db_read_log_state
     set covered_to = greatest(covered_to, p_covered_to), last_pull_at = now(), last_error = null,
         audit_on = v_on, audited_roles = v_roles, dropped = dropped + v_dropped
   where id = 1;
  return jsonb_build_object('added', v_added, 'dropped', v_dropped, 'auditOn', v_on, 'roles', to_jsonb(v_roles));
end $$;

-- ------------------------------------------------------------------ 4. HQ's list
-- Every direct read, newest first, 200 at a time, with the query text and the gyms' names, and the record's
-- health (since when, covered to, last pull, the switch). The look itself is an hq_audit row. Errors:
-- NO_ACTOR, HQ_ONLY.
create or replace function public.hq_db_reads(p_actor text, p_before timestamptz default null)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare s public.db_read_log_state; rows jsonb;
begin
  perform public._hq_guard();
  select * into s from public.db_read_log_state where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.look_id, 'at', d.at, 'role', d.role, 'kind', d.kind, 'tables', to_jsonb(d.objects),
           'gyms', coalesce((select jsonb_agg(jsonb_build_object('gymId', g.gym_id, 'name', g.name) order by g.name)
                               from public.gyms g where g.gym_id = any(d.gym_ids)), '[]'::jsonb),
           'allGyms', cardinality(d.gym_ids) = 0 and d.kind in ('read', 'change'),
           'query', d.query, 'source', d.source, 'who', d.who, 'until', d.until_at)
         order by d.at desc, d.look_id desc), '[]'::jsonb)
    into rows
    from (select * from public.db_direct_reads where p_before is null or at < p_before
           order by at desc, look_id desc limit 200) d;
  perform public._hq_log(p_actor, 'view_db_reads', null, null, jsonb_build_object('rows', jsonb_array_length(rows)));
  return jsonb_build_object('rows', rows,
    'state', jsonb_build_object('startedAt', s.started_at, 'coveredTo', s.covered_to, 'lastPullAt', s.last_pull_at,
                                'lastError', s.last_error, 'auditOn', s.audit_on, 'roles', to_jsonb(s.audited_roles),
                                'dropped', s.dropped));
end $$;

-- ------------------------------------------------------------------ 5. the gym owner's side (0030's, plus "direct")
-- The gym owner's "MettleUp access" list, as in 0030, plus:
--   "direct": the last 2 years' direct reads that named this gym or named no gym, newest first, at most 100:
--             {at, kind, tables (without "public."), allGyms, fromDashboard, inSupportWindow}, and the
--             'gap' / 'audit_off' / 'audit_on' rows (they concern every gym). Never the query text.
--   "directSince": since when the record runs (null before this migration).
-- Errors: BAD_KEY, OWNER_ONLY.
create or replace function public.owner_hq_access(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key);
begin
  return jsonb_build_object(
    'status', (select status from public.gyms where gym_id = g),
    'trial', (select jsonb_build_object('startsAt', x.trial_starts_at, 'endsAt', x.trial_ends_at,
                                        'plan', x.plan, 'billing', x.billing, 'paidUntil', x.paid_until)
                from public.gyms x where x.gym_id = g),
    'grants', coalesce((
      select jsonb_agg(public._hq_grant_json(x) || jsonb_build_object(
               'looked', coalesce((select jsonb_agg(jsonb_build_object('at', a.at, 'what', a.detail->>'kind', 'rows', a.detail->'rows') order by a.at, a.audit_id)
                                     from public.hq_audit a
                                    where a.gym_id = g and a.action = 'support_view'
                                      and a.at >= x.starts_at and a.at <= coalesce(least(x.ended_early_at, x.ends_at), x.ends_at)), '[]'::jsonb))
             order by x.starts_at desc, x.seq desc)
        from (select * from public.hq_grants where gym_id = g and starts_at > now() - interval '2 years'
               order by starts_at desc, seq desc limit 100) x), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object('at', a.at, 'action', a.action, 'reason', a.reason) order by a.at desc, a.audit_id desc)
        from (select * from public.hq_audit
               where gym_id = g and action in ('approve_gym', 'suspend_gym', 'restore_gym', 'reset_owner_signin',
                                               'sign_out_gym', 'create_gym', 'ai_limit_set', 'set_trial', 'set_plan')
                 and at > now() - interval '2 years'
               order by at desc, audit_id desc limit 50) a), '[]'::jsonb),
    'direct', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', d.at, 'kind', d.kind,
               'tables', to_jsonb(array(select regexp_replace(o, '^public\.', '') from unnest(d.objects) o)),
               'allGyms', cardinality(d.gym_ids) = 0 and d.kind in ('read', 'change'),
               'fromDashboard', d.source = 'dashboard',
               'until', d.until_at,
               'inSupportWindow', exists (select 1 from public.hq_grants x
                                           where x.gym_id = g and d.at >= x.starts_at
                                             and d.at <= coalesce(least(x.ended_early_at, x.ends_at), x.ends_at)))
             order by d.at desc, d.look_id desc)
        from (select * from public.db_direct_reads
               where at > now() - interval '2 years'
                 and (kind in ('gap', 'audit_off', 'audit_on')
                      or (kind in ('read', 'change') and (g = any(gym_ids) or cardinality(gym_ids) = 0)))
               order by at desc, look_id desc limit 100) d), '[]'::jsonb),
    'directSince', (select started_at from public.db_read_log_state where id = 1));
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._db_reads_append_only()                                  from public, anon, authenticated;
revoke all on function public._db_reads_no_truncate()                                  from public, anon, authenticated;
revoke all on function public._db_audited_roles()                                      from public, anon, authenticated;
revoke all on function public.hq_db_reads_cursor()                                     from public, anon, authenticated;
revoke all on function public.hq_db_reads_ingest(jsonb, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.hq_db_reads(text, timestamptz)                           from public, anon, authenticated;
grant execute on function public.hq_db_reads_cursor()                                     to service_role;
grant execute on function public.hq_db_reads_ingest(jsonb, timestamptz, timestamptz, text) to service_role;
grant execute on function public.hq_db_reads(text, timestamptz)                           to service_role;
revoke all on function public.owner_hq_access(text) from public;
grant execute on function public.owner_hq_access(text) to anon, authenticated;
