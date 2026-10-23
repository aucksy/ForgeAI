-- NOT APPLIED - main session applies after review (owner said yes, #51).
--
-- 0026: ForgeAI HQ, step 1 ("Look"): the system owner's panel reads counts, never people, and every
-- look is written down (Project Tracker #51, option A; plan docs/overhaul/research/R-owner-panel.md
-- sections 2, 3, 6 and 7). Re-runnable. Apply after 0025. Adds only: no existing table, row or
-- function changes.
--
-- WHO CAN CALL THESE. Only the HQ Worker (deploy/hq), with its own Supabase secret key "hq"
-- (Worker secret SUPABASE_HQ_KEY). A secret key reaches the database as the service_role role; every
-- hq_* function below is granted to service_role ONLY (revoked from public, anon, authenticated). The
-- admin app, the member app and every gym key reach the database as anon, so a gym's own session or
-- device key is refused by the database before any HQ code runs (tests/0026_hq.sql proves it for
-- every hq_ function). _hq_guard() also refuses a call whose request says anon or authenticated, in
-- case a grant is ever widened by mistake.
-- Never add a platform branch to _owner_gym or any owner_* function; never ship the HQ key to a
-- browser.
--
-- THE AUDIT LOG (hq_audit). Every hq_* function writes one row in the same transaction: when, the
-- ForgeAI person (the email the HQ Worker verified), the action, the gym, the reason, small details
-- and the address HQ was opened from (header x-hq-client-ip, set by the Worker). Append-only: a
-- trigger refuses every UPDATE and TRUNCATE, and every DELETE except the nightly clean-up of rows
-- older than 2 years (0028's hq_nightly_cleanup). Kept in Mumbai with the gyms' data, 2 years.
--
-- COUNTS, NEVER PEOPLE. hq_gyms / hq_gym / hq_system return per-gym totals: members, check-ins,
-- orders, money collected (sums only, never who paid), staff count, failed sign-ins, live devices,
-- last activity. The only names and mobiles are each gym OWNER's (ForgeAI's own business contact,
-- ForgeAI is responsible for that data itself). No member name or mobile, no staff list.

-- Apply 0026, 0027 and 0028 together, in this order (each is re-runnable; re-run all three after a
-- change). A lock wait gives up after 3 seconds rather than stalling the live apps behind it.
set lock_timeout = '3s';

-- ------------------------------------------------------------------ the audit log
create table if not exists public.hq_audit (
  audit_id bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  actor    text not null check (length(actor) between 3 and 200),
  action   text not null check (action ~ '^[a-z][a-z_]{2,39}$'),
  gym_id   uuid,                        -- no foreign key: the row outlives a deleted gym
  gym_name text,
  reason   text check (reason is null or length(reason) <= 500),
  detail   jsonb not null default '{}'::jsonb,
  ip       text not null default ''
);
create index if not exists hq_audit_at  on public.hq_audit(at desc);
create index if not exists hq_audit_gym on public.hq_audit(gym_id, at desc);
alter table public.hq_audit enable row level security;
revoke all on public.hq_audit from public, anon, authenticated;

-- Append-only. The only way out is the nightly clean-up of rows older than 2 years.
create or replace function public._hq_audit_append_only() returns trigger
  language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and current_setting('forgeai.hq_purge', true) = 'on'
     and old.at < now() - interval '2 years' then
    return old;
  end if;
  raise exception 'APPEND_ONLY';
end $$;

drop trigger if exists hq_audit_append_only on public.hq_audit;
create trigger hq_audit_append_only before update or delete on public.hq_audit
  for each row execute function public._hq_audit_append_only();
drop trigger if exists hq_audit_no_truncate on public.hq_audit;
create trigger hq_audit_no_truncate before truncate on public.hq_audit
  for each statement execute function public._hq_audit_append_only();

-- ------------------------------------------------------------------ helpers (no grants)
-- A second lock behind the grants: a call that says it is anon or a signed-in app user is refused.
create or replace function public._hq_guard() returns void
  language plpgsql stable set search_path = public as $$
declare r text;
begin
  begin
    r := nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role';
  exception when others then
    r := null;  -- quiet: no request claims (SQL editor, cron): the grants already decided
  end;
  if r in ('anon', 'authenticated') then raise exception 'HQ_ONLY'; end if;
end $$;

-- The ForgeAI person, as the HQ Worker verified it (an email, lower case). NO_ACTOR otherwise.
create or replace function public._hq_actor(p_actor text) returns text
  language plpgsql immutable set search_path = public as $$
declare a text := lower(btrim(coalesce(p_actor, '')));
begin
  if a !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then raise exception 'NO_ACTOR'; end if;
  if length(a) > 200 then raise exception 'NO_ACTOR'; end if;
  return a;
end $$;

-- The address HQ was opened from (the Worker passes its visitor's address in x-hq-client-ip).
create or replace function public._hq_ip() returns text
  language plpgsql stable set search_path = public as $$
declare h json;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;  -- quiet: no request headers (SQL editor, tests)
  end;
  return left(coalesce(btrim(h->>'x-hq-client-ip'), ''), 64);
end $$;

-- Write one audit row; returns the checked actor.
create or replace function public._hq_log(p_actor text, p_action text, p_gym uuid, p_reason text, p_detail jsonb)
  returns text language plpgsql volatile security definer set search_path = public as $$
declare a text := public._hq_actor(p_actor);
begin
  insert into public.hq_audit(actor, action, gym_id, gym_name, reason, detail, ip)
    values (a, p_action, p_gym, (select name from public.gyms where gym_id = p_gym),
            nullif(left(btrim(coalesce(p_reason, '')), 500), ''), coalesce(p_detail, '{}'::jsonb), public._hq_ip());
  return a;
end $$;

-- What later steps add to a gym's row in HQ (0027: status and delete request; 0028: support
-- access). Empty here.
create or replace function public._hq_gym_extra(p_gym uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select '{}'::jsonb
$$;

-- One gym's counts (never a member's name or number). The money is sums of live, uncancelled
-- receipts by the receipt's own date, in paise, India months.
create or replace function public._hq_gym_counts(p_gym uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  with t as (select (now() at time zone 'Asia/Kolkata')::date as today),
  m as (select to_char(today, 'YYYY-MM') as this_m,
               to_char((date_trunc('month', today) - interval '1 day')::date, 'YYYY-MM') as last_m,
               to_char(today - 6, 'YYYY-MM-DD') as d7, to_char(today - 29, 'YYYY-MM-DD') as d30,
               date_trunc('month', today)::date as m_start
          from t),
  g as (select * from public.gyms where gym_id = p_gym),
  o as (select s.name, s.phone from public.gym_staff s
         where s.gym_id = p_gym and s.role = 'owner' and s.removed_at is null
         order by s.created_at limit 1)
  select jsonb_build_object(
    'gymId', g.gym_id, 'name', g.name, 'joinCode', g.join_code, 'createdAt', g.created_at,
    'ownerName', (select name from o), 'ownerPhone', (select phone from o),
    'membersRegister', (select count(*) from public.crm_records r
                         where r.gym_id = p_gym and r.kind = 'member' and not r.deleted),
    'membersApp', (select count(*) from public.gym_members x where x.gym_id = p_gym and x.left_at is null),
    'checkins7', (select count(*) from public.crm_records r, m
                   where r.gym_id = p_gym and r.kind = 'visit' and not r.deleted and r.data->>'visitedOn' >= m.d7),
    'checkins30', (select count(*) from public.crm_records r, m
                    where r.gym_id = p_gym and r.kind = 'visit' and not r.deleted and r.data->>'visitedOn' >= m.d30),
    'orders30', (select count(*) from public.shop_orders x
                  where x.gym_id = p_gym and x.created_at > now() - interval '30 days'),
    'moneyThisMonthP', (select coalesce(sum(public._num(r.data->'amountP')), 0) from public.crm_records r, m
                         where r.gym_id = p_gym and r.kind = 'payment' and not r.deleted
                           and coalesce(r.data->>'voided', 'false') <> 'true' and left(r.data->>'paidOn', 7) = m.this_m),
    'moneyLastMonthP', (select coalesce(sum(public._num(r.data->'amountP')), 0) from public.crm_records r, m
                         where r.gym_id = p_gym and r.kind = 'payment' and not r.deleted
                           and coalesce(r.data->>'voided', 'false') <> 'true' and left(r.data->>'paidOn', 7) = m.last_m),
    'receiptsCancelledThisMonth', (select count(*) from public.crm_records r, m
                                    where r.gym_id = p_gym and r.kind = 'payment' and not r.deleted
                                      and coalesce(r.data->>'voided', 'false') = 'true'
                                      and (r.updated_at at time zone 'Asia/Kolkata')::date >= m.m_start),
    'lastDeskActivity', greatest(
       (select max(r.updated_at) from public.crm_records r where r.gym_id = p_gym),
       (select max(x.last_seen_at) from public.gym_sessions x join public.gym_staff s on s.staff_id = x.staff_id
         where s.gym_id = p_gym)),
    'staff', (select count(*) from public.gym_staff s where s.gym_id = p_gym and s.removed_at is null),
    'failedSignins24h', (select count(*) from public.gym_signin_fails f join public.gym_staff s on s.staff_id = f.staff_id
                          where s.gym_id = p_gym and f.at > now() - interval '24 hours'),
    'liveDevices', (select count(*) from public.gym_sessions x join public.gym_staff s on s.staff_id = x.staff_id
                     where s.gym_id = p_gym and x.ended_at is null and s.removed_at is null
                       and x.last_seen_at > now() - interval '30 days'))
    || public._hq_gym_extra(p_gym)
  from g
$$;

-- ------------------------------------------------------------------ HQ reads (service_role only)
-- Home: every gym's counts, newest first. One audit row per look.
create or replace function public.hq_gyms(p_actor text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare out jsonb;
begin
  perform public._hq_guard();
  select coalesce(jsonb_agg(public._hq_gym_counts(g.gym_id) order by g.created_at desc), '[]'::jsonb)
    into out from public.gyms g;
  perform public._hq_log(p_actor, 'view_all_gyms', null, null, jsonb_build_object('gyms', jsonb_array_length(out)));
  return out;
end $$;

-- One gym: its counts and its owners' contact (ForgeAI's business contact). GONE when there is none.
create or replace function public.hq_gym(p_actor text, p_gym uuid)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare out jsonb;
begin
  perform public._hq_guard();
  if not exists (select 1 from public.gyms where gym_id = p_gym) then raise exception 'GONE'; end if;
  out := public._hq_gym_counts(p_gym) || jsonb_build_object(
    'owners', coalesce((select jsonb_agg(jsonb_build_object('staffId', s.staff_id, 'name', s.name, 'phone', s.phone)
                                         order by s.created_at)
                          from public.gym_staff s where s.gym_id = p_gym and s.role = 'owner' and s.removed_at is null), '[]'::jsonb),
    'recentHq', coalesce((select jsonb_agg(jsonb_build_object('at', a.at, 'actor', a.actor, 'action', a.action, 'reason', a.reason)
                                           order by a.at desc)
                            from (select * from public.hq_audit where gym_id = p_gym order by at desc limit 20) a), '[]'::jsonb));
  perform public._hq_log(p_actor, 'view_gym', p_gym, null, '{}'::jsonb);
  return out;
end $$;

-- The System page: database size against the free 500 MB, and totals across every gym.
create or replace function public.hq_system(p_actor text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare out jsonb;
begin
  perform public._hq_guard();
  out := jsonb_build_object(
    'dbBytes', pg_database_size(current_database()),
    'dbLimitBytes', 500 * 1024 * 1024,
    'gyms', (select count(*) from public.gyms),
    'gymsNew7', (select count(*) from public.gyms where created_at > now() - interval '7 days'),
    'membersRegister', (select count(*) from public.crm_records where kind = 'member' and not deleted),
    'membersApp', (select count(*) from public.gym_members where left_at is null),
    'liveDevices', (select count(*) from public.gym_sessions where ended_at is null and last_seen_at > now() - interval '30 days'),
    'auditRows', (select count(*) from public.hq_audit));
  perform public._hq_log(p_actor, 'view_system', null, null, '{}'::jsonb);
  return out;
end $$;

-- The audit log, newest first, 100 at a time (p_before: the last audit_id already shown).
create or replace function public.hq_audit_list(p_actor text, p_before bigint default null, p_gym uuid default null, p_limit int default 100)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare out jsonb; lim int := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  perform public._hq_guard();
  select coalesce(jsonb_agg(jsonb_build_object('id', a.audit_id, 'at', a.at, 'actor', a.actor, 'action', a.action,
                                               'gymId', a.gym_id, 'gymName', a.gym_name, 'reason', a.reason,
                                               'detail', a.detail, 'ip', a.ip) order by a.audit_id desc), '[]'::jsonb)
    into out
    from (select * from public.hq_audit
           where (p_before is null or audit_id < p_before) and (p_gym is null or gym_id = p_gym)
           order by audit_id desc limit lim) a;
  perform public._hq_log(p_actor, 'view_audit', p_gym, null, '{}'::jsonb);
  return out;
end $$;

-- What the HQ Worker did outside this database (feedback and lead status, AI limits, sign-in,
-- pages from Cloudflare's own database), written here so the log is in one place, in Mumbai.
create or replace function public.hq_log(p_actor text, p_action text, p_gym uuid default null, p_reason text default null, p_detail jsonb default '{}'::jsonb)
  returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._hq_guard();
  if p_detail is not null and octet_length(p_detail::text) > 4000 then raise exception 'INVALID'; end if;
  perform public._hq_log(p_actor, p_action, p_gym, p_reason, p_detail);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._hq_audit_append_only()                     from public, anon, authenticated;
revoke all on function public._hq_guard()                                 from public, anon, authenticated;
revoke all on function public._hq_actor(text)                             from public, anon, authenticated;
revoke all on function public._hq_ip()                                    from public, anon, authenticated;
revoke all on function public._hq_log(text, text, uuid, text, jsonb)      from public, anon, authenticated;
revoke all on function public._hq_gym_extra(uuid)                         from public, anon, authenticated;
revoke all on function public._hq_gym_counts(uuid)                        from public, anon, authenticated;
revoke all on function public.hq_gyms(text)                               from public, anon, authenticated;
revoke all on function public.hq_gym(text, uuid)                          from public, anon, authenticated;
revoke all on function public.hq_system(text)                             from public, anon, authenticated;
revoke all on function public.hq_audit_list(text, bigint, uuid, int)      from public, anon, authenticated;
revoke all on function public.hq_log(text, text, uuid, text, jsonb)       from public, anon, authenticated;
grant execute on function public.hq_gyms(text)                            to service_role;
grant execute on function public.hq_gym(text, uuid)                       to service_role;
grant execute on function public.hq_system(text)                          to service_role;
grant execute on function public.hq_audit_list(text, bigint, uuid, int)   to service_role;
grant execute on function public.hq_log(text, text, uuid, text, jsonb)    to service_role;

notify pgrst, 'reload schema';
