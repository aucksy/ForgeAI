-- APPLIED LIVE 23 Oct 2026 (owner said yes, R-87; live test PASS 49).
--
-- 0028: ForgeAI HQ, step 3 ("Govern"): support access ("break-glass"), the gym owner's "ForgeAI
-- access" list, the 1-year access log of the admin app, and the nightly clean-up (plan
-- docs/overhaul/research/R-owner-panel.md sections 4 and 6; task 9 / R-49). Re-runnable. Apply
-- after 0027.
--
-- CHANGES ONE EXISTING FUNCTION: crm_pull (0010) gets one added line that writes an access-log row
-- when a device pulls the gym's WHOLE copy (p_since = 0: a sign-in, a new device, a download).
-- Its answer is unchanged (tests/0028_hq_breakglass_and_logs.sql compares it). Everything else is new.
--
-- SUPPORT ACCESS (hq_grants). Two doors, both written down and both shown to the gym's owner:
--   - The gym asks: in the admin app, Settings -> Your data -> "Let ForgeAI support look (1 hour)"
--     (owner_hq_grant, owner only). The owner can close it early (owner_hq_end).
--   - ForgeAI opens it in an emergency: HQ picks a reason from a short list, writes a sentence, and
--     picks 15, 30 or 60 minutes (hq_open_emergency). The HQ Worker asks for a fresh Google sign-in
--     (15 minutes or newer) first.
-- While a grant is open, hq_gym_records shows that gym's records READ-ONLY (members, plans,
-- memberships, receipts, check-ins, shop orders, staff list); once the time is up it refuses
-- (NO_ACCESS). There is no "log in as the gym" and no edit: a fix is a named HQ action, logged.
-- Every look is an hq_audit row with the gym, the kind and the number of rows shown.
-- The owner sees every grant and every look (owner_hq_access): who opened it, why, from when to
-- when, and what was looked at. Nobody can hide or delete those rows (hq_audit is append-only).
--
-- ACCESS LOG (gym_access_log). Kept 7 days until 13 May 2027 and 1 year from then, as the privacy
-- notice says (PRIVACY-NOTICE.md, "Technical logs"); the nightly clean-up decides by the date.
-- Written by triggers, so no sign-in function changes:
--   sign_in       a new device session (gym_sessions insert): person, device, address;
--   sign_out      a session ended (signed out, removed, signed out everywhere, 11th device);
--   sign_in_failed a wrong code (gym_signin_fails insert; that table keeps rows only 1 day);
--   push          a save from the admin app (gyms.crm_version moved by crm_push; the person from
--                 crm_push's own forgeai.actor_* setting, 0021). Member check-ins are not logged here;
--   pull_all      the whole copy pulled (crm_pull with p_since = 0, the one line above).
--
-- NIGHTLY CLEAN-UP (hq_nightly_cleanup, called by the HQ Worker's 03:00 India-time Cron Trigger):
-- access log past its period (7 days, from 13 May 2027 1 year); the gym creator's address (0021) older than 1 year; support-access
-- rows, done or cancelled delete requests and the HQ audit log older than 2 years. It writes its own
-- audit row with the counts.

-- Apply 0026, 0027 and 0028 together, in this order (each is re-runnable; re-run all three after a
-- change). A lock wait gives up after 3 seconds rather than stalling the live apps behind it.
set lock_timeout = '3s';

-- ------------------------------------------------------------------ support access
create table if not exists public.hq_grants (
  grant_id       uuid primary key default gen_random_uuid(),
  seq            bigint generated always as identity,  -- the order they were opened in
  gym_id         uuid not null,                 -- no foreign key: kept 2 years, like the audit log
  opened_by      text not null check (opened_by in ('gym', 'hq')),
  opened_by_name text not null check (length(opened_by_name) between 1 and 200),
  reason_kind    text not null check (reason_kind in ('gym_asked', 'leak', 'legal', 'erase', 'locked_out', 'other')),
  reason         text not null check (length(reason) between 3 and 500),
  starts_at      timestamptz not null default now(),
  ends_at        timestamptz not null,
  ended_early_at timestamptz,
  check (ends_at > starts_at and ends_at <= starts_at + interval '60 minutes')
);
create index if not exists hq_grants_gym on public.hq_grants(gym_id, starts_at desc);
alter table public.hq_grants enable row level security;
revoke all on public.hq_grants from public, anon, authenticated;

create or replace function public._hq_grant_live(p_gym uuid) returns public.hq_grants
  language sql stable security definer set search_path = public as $$
  select * from public.hq_grants
   where gym_id = p_gym and starts_at <= now() and ends_at > now() and ended_early_at is null
   order by ends_at desc, seq desc limit 1
$$;

create or replace function public._hq_grant_json(x public.hq_grants) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object('grantId', x.grant_id, 'openedBy', x.opened_by, 'openedByName', x.opened_by_name,
    'reasonKind', x.reason_kind, 'reason', x.reason, 'startsAt', x.starts_at,
    'endsAt', coalesce(least(x.ended_early_at, x.ends_at), x.ends_at), 'endedEarly', x.ended_early_at is not null,
    'open', x.starts_at <= now() and x.ends_at > now() and x.ended_early_at is null)
$$;

-- ------------------------------------------------------------------ access log
create table if not exists public.gym_access_log (
  log_id   bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  gym_id   uuid,                  -- no foreign key: the log outlives a deleted gym (1 year)
  staff_id uuid,
  person   text,                  -- the person's name, or a mobile's last 4 digits for a wrong code
  action   text not null check (action in ('sign_in', 'sign_out', 'sign_in_failed', 'push', 'pull_all')),
  device   text,
  ip       text not null default ''
);
create index if not exists gym_access_log_at  on public.gym_access_log(at);
create index if not exists gym_access_log_gym on public.gym_access_log(gym_id, at desc);
alter table public.gym_access_log enable row level security;
revoke all on public.gym_access_log from public, anon, authenticated;

create or replace function public._access_log_session() returns trigger
  language plpgsql security definer set search_path = public as $$
declare st public.gym_staff;
begin
  select * into st from public.gym_staff where staff_id = new.staff_id;
  if st.staff_id is null then return null; end if;
  if tg_op = 'INSERT' then
    insert into public.gym_access_log(gym_id, staff_id, person, action, device, ip)
      values (st.gym_id, st.staff_id, st.name, 'sign_in', left(new.device, 80), public._caller_ip());
  elsif old.ended_at is null and new.ended_at is not null then
    insert into public.gym_access_log(gym_id, staff_id, person, action, device, ip)
      values (st.gym_id, st.staff_id, st.name, 'sign_out', left(new.device, 80), public._caller_ip());
  end if;
  return null;
end $$;

create or replace function public._access_log_fail() returns trigger
  language plpgsql security definer set search_path = public as $$
declare st public.gym_staff;
begin
  if new.staff_id is not null then select * into st from public.gym_staff where staff_id = new.staff_id; end if;
  insert into public.gym_access_log(gym_id, staff_id, person, action, ip)
    values (st.gym_id, st.staff_id, coalesce(st.name, 'mobile ending ' || right(new.phone, 4)), 'sign_in_failed',
            coalesce(nullif(new.ip, ''), public._caller_ip()));
  return null;
end $$;

create or replace function public._access_log_push() returns trigger
  language plpgsql security definer set search_path = public as $$
declare who text := nullif(current_setting('forgeai.actor_name', true), '');
begin
  -- Only crm_push sets the actor (0021); check-ins from the member app and offer rewards do not.
  if who is null or new.crm_version is not distinct from old.crm_version then return null; end if;
  insert into public.gym_access_log(gym_id, staff_id, person, action, ip)
    values (new.gym_id, nullif(current_setting('forgeai.actor_id', true), '')::uuid, who, 'push', public._caller_ip());
  return null;
end $$;

drop trigger if exists gym_sessions_access_log on public.gym_sessions;
create trigger gym_sessions_access_log after insert or update of ended_at on public.gym_sessions
  for each row execute function public._access_log_session();
drop trigger if exists gym_signin_fails_access_log on public.gym_signin_fails;
create trigger gym_signin_fails_access_log after insert on public.gym_signin_fails
  for each row execute function public._access_log_fail();
drop trigger if exists gyms_access_log_push on public.gyms;
create trigger gyms_access_log_push after update of crm_version on public.gyms
  for each row execute function public._access_log_push();

-- 0010's crm_pull, unchanged, plus ONE line: a whole-copy pull is written to the access log.
create or replace function public.crm_pull(p_key text, p_since bigint)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); gr public.gyms; since bigint := greatest(coalesce(p_since, 0), 0);
begin
  select * into gr from public.gyms where gym_id = g;
  -- 0028: who pulled the whole copy, from where (the access log, 1 year).
  if since = 0 then
    insert into public.gym_access_log(gym_id, staff_id, person, action, ip)
      select g, s.staff_id, coalesce(s.name, 'Owner (old owner key)'), 'pull_all', public._caller_ip()
        from public._staff(p_key) s;
  end if;
  return jsonb_build_object(
    'version', gr.crm_version,
    'gym', jsonb_build_object('gymId', gr.gym_id, 'name', gr.name, 'joinCode', gr.join_code, 'createdAt', gr.created_at),
    'records', coalesce((
      select jsonb_agg(jsonb_build_object('k', r.kind, 'id', r.id, 'd', case when r.deleted then null else r.data end, 'x', r.deleted)
                       order by r.version, r.kind, r.id)
        from public.crm_records r
       where r.gym_id = g and r.version > since and (since > 0 or not r.deleted)), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------------ the gym owner's side (anon + key)
-- "Let ForgeAI support look (1 hour)": owner only. An open window from the gym is closed (its looks
-- stay listed under it) and a new hour starts. Errors: BAD_KEY, OWNER_ONLY.
create or replace function public.owner_hq_grant(p_key text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key); st public.gym_staff := public._staff(p_key); x public.hq_grants;
begin
  perform 1 from public.gyms where gym_id = g for update;
  update public.hq_grants set ended_early_at = now()
   where gym_id = g and opened_by = 'gym' and ended_early_at is null and ends_at > now();
  insert into public.hq_grants(gym_id, opened_by, opened_by_name, reason_kind, reason, starts_at, ends_at)
    values (g, 'gym', coalesce(st.name, 'Owner'), 'gym_asked', 'The gym asked ForgeAI support to look', now(), now() + interval '60 minutes')
    returning * into x;
  return public._hq_grant_json(x);
end $$;

-- Close support access now (either door). Quiet when nothing is open. Errors: BAD_KEY, OWNER_ONLY.
create or replace function public.owner_hq_end(p_key text)
  returns void language plpgsql volatile security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key);
begin
  update public.hq_grants set ended_early_at = now()
   where gym_id = g and ended_early_at is null and ends_at > now();
end $$;

-- The gym owner's "ForgeAI access" list: every support-access window of the last 2 years (newest
-- first), with what ForgeAI looked at inside it, plus every other HQ action on this gym (status
-- changes, sign-in resets, sign-outs). Also the gym's status (a suspended gym shows why it is
-- read-only). Errors: BAD_KEY, OWNER_ONLY.
create or replace function public.owner_hq_access(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key);
begin
  return jsonb_build_object(
    'status', (select status from public.gyms where gym_id = g),
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
                                               'sign_out_gym', 'create_gym', 'ai_limit_set')
                 and at > now() - interval '2 years'
               order by at desc, audit_id desc limit 50) a), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------------ HQ side (service_role only)
-- Emergency access: reason from the short list + a sentence, 15 / 30 / 60 minutes. Errors: GONE,
-- INVALID, NEED_REASON (10 letters or more).
create or replace function public.hq_open_emergency(p_actor text, p_gym uuid, p_reason_kind text, p_reason text, p_minutes int)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a text := public._hq_actor(p_actor); x public.hq_grants;
begin
  perform public._hq_guard();
  if not exists (select 1 from public.gyms where gym_id = p_gym) then raise exception 'GONE'; end if;
  if p_reason_kind not in ('leak', 'legal', 'erase', 'locked_out', 'other') or p_minutes not in (15, 30, 60) then raise exception 'INVALID'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'NEED_REASON'; end if;
  update public.hq_grants set ended_early_at = now()
   where gym_id = p_gym and opened_by = 'hq' and ended_early_at is null and ends_at > now();
  insert into public.hq_grants(gym_id, opened_by, opened_by_name, reason_kind, reason, starts_at, ends_at)
    values (p_gym, 'hq', 'ForgeAI support', p_reason_kind, left(btrim(p_reason), 500), now(), now() + make_interval(mins => p_minutes))
    returning * into x;
  perform public._hq_log(a, 'support_open', p_gym, left(btrim(p_reason), 500),
    jsonb_build_object('reasonKind', p_reason_kind, 'minutes', p_minutes, 'grantId', x.grant_id));
  return public._hq_grant_json(x);
end $$;

-- Close support access early from HQ.
create or replace function public.hq_end_access(p_actor text, p_gym uuid)
  returns void language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  perform public._hq_guard();
  update public.hq_grants set ended_early_at = now() where gym_id = p_gym and ended_early_at is null and ends_at > now();
  get diagnostics n = row_count;
  perform public._hq_log(p_actor, 'support_close', p_gym, null, jsonb_build_object('closed', n));
end $$;

-- One gym's records, read-only, ONLY while support access is open. p_kind: member | plan |
-- membership | payment | visit | order | staff. 200 rows a page, newest first. Every call is an
-- audit row the gym owner sees. Errors: NO_ACCESS, INVALID.
create or replace function public.hq_gym_records(p_actor text, p_gym uuid, p_kind text, p_offset int default 0)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare x public.hq_grants := public._hq_grant_live(p_gym); rows jsonb; off int := greatest(coalesce(p_offset, 0), 0);
begin
  perform public._hq_guard();
  if x.grant_id is null then raise exception 'NO_ACCESS'; end if;
  if p_kind in ('member', 'plan', 'membership', 'payment', 'visit') then
    select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'd', r.data, 'updatedAt', r.updated_at) order by r.updated_at desc), '[]'::jsonb)
      into rows
      from (select * from public.crm_records where gym_id = p_gym and kind = p_kind and not deleted
             order by updated_at desc offset off limit 200) r;
  elsif p_kind = 'order' then
    select coalesce(jsonb_agg(jsonb_build_object('id', o.order_id, 'orderNo', o.order_no, 'memberName', o.member_name,
                                                 'lines', o.lines, 'totalP', o.total_p, 'status', o.status, 'createdAt', o.created_at)
                              order by o.created_at desc), '[]'::jsonb)
      into rows
      from (select * from public.shop_orders where gym_id = p_gym order by created_at desc offset off limit 200) o;
  elsif p_kind = 'staff' then
    select coalesce(jsonb_agg(jsonb_build_object('id', s.staff_id, 'name', s.name, 'phone', s.phone, 'role', s.role,
                                                 'createdAt', s.created_at) order by s.created_at), '[]'::jsonb)
      into rows
      from (select * from public.gym_staff where gym_id = p_gym and removed_at is null order by created_at offset off limit 200) s;
  else
    raise exception 'INVALID';
  end if;
  perform public._hq_log(p_actor, 'support_view', p_gym, x.reason,
    jsonb_build_object('kind', p_kind, 'rows', jsonb_array_length(rows), 'offset', off, 'grantId', x.grant_id));
  return jsonb_build_object('kind', p_kind, 'rows', rows, 'until', x.ends_at, 'openedBy', x.opened_by);
end $$;

-- One gym's access log (the admin app's sign-ins, sign-outs, saves, whole-copy pulls), newest first.
-- By default only WHEN and WHAT (and counts per kind): no person, device or address. Those show only
-- while support access is open on the gym, and that look is an audit row the gym owner sees
-- ("sign-in history" in owner_hq_access).
create or replace function public.hq_access_log(p_actor text, p_gym uuid, p_before bigint default null)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare x public.hq_grants := public._hq_grant_live(p_gym); detailed boolean; rows jsonb; counts jsonb;
begin
  perform public._hq_guard();
  detailed := x.grant_id is not null;
  select coalesce(jsonb_agg(case when detailed
                                 then jsonb_build_object('id', l.log_id, 'at', l.at, 'action', l.action, 'person', l.person,
                                                         'device', l.device, 'ip', l.ip)
                                 else jsonb_build_object('id', l.log_id, 'at', l.at, 'action', l.action) end
                            order by l.log_id desc), '[]'::jsonb)
    into rows
    from (select * from public.gym_access_log where gym_id = p_gym and (p_before is null or log_id < p_before)
           order by log_id desc limit 200) l;
  select coalesce(jsonb_object_agg(action, n), '{}'::jsonb) into counts
    from (select action, count(*) n from public.gym_access_log
           where gym_id = p_gym and at > now() - interval '7 days' group by action) c;
  if detailed then
    perform public._hq_log(p_actor, 'support_view', p_gym, x.reason,
      jsonb_build_object('kind', 'access_log', 'rows', jsonb_array_length(rows), 'grantId', x.grant_id));
  else
    perform public._hq_log(p_actor, 'view_access_log', p_gym, null, '{}'::jsonb);
  end if;
  return jsonb_build_object('rows', rows, 'counts7Days', counts, 'detailed', detailed);
end $$;

-- How long the access log is kept on a given day: 7 days until 13 May 2027 (the privacy notice says
-- "up to 7 days today"), 1 year from then (DPDP Rules 2025, Rule 6). PURE.
create or replace function public._access_log_keep(p_now timestamptz) returns interval
  language sql immutable set search_path = public as $$
  select case when p_now < timestamptz '2027-05-13 00:00:00+05:30' then interval '7 days' else interval '1 year' end
$$;

-- The nightly clean-up (the HQ Worker's Cron Trigger). p_detail: what the Worker cleaned in
-- Cloudflare's database, written into the same audit row.
create or replace function public.hq_nightly_cleanup(p_detail jsonb default '{}'::jsonb)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a int; c int; gr int; rq int; au int; out jsonb;
begin
  perform public._hq_guard();
  delete from public.gym_access_log where at < now() - public._access_log_keep(now());
  get diagnostics a = row_count;
  delete from public.gym_creator_ips where created_at < now() - interval '1 year';
  get diagnostics c = row_count;
  delete from public.hq_grants where ends_at < now() - interval '2 years';
  get diagnostics gr = row_count;
  delete from public.hq_delete_requests
   where coalesce(done_at, cancelled_at) < now() - interval '2 years';
  get diagnostics rq = row_count;
  perform set_config('forgeai.hq_purge', 'on', true);
  delete from public.hq_audit where at < now() - interval '2 years';
  get diagnostics au = row_count;
  perform set_config('forgeai.hq_purge', 'off', true);
  out := jsonb_build_object('accessLog', a, 'creatorAddresses', c, 'supportAccess', gr, 'deleteRequests', rq, 'audit', au)
         || jsonb_build_object('web', coalesce(p_detail, '{}'::jsonb));
  -- Its own row: no person signed in to run it (_hq_log accepts only a verified email).
  insert into public.hq_audit(actor, action, detail) values ('nightly-cleanup', 'nightly_cleanup', out);
  return out;
end $$;

-- A gym's open support access, on its HQ row (0026's _hq_gym_counts), with 0027's status.
create or replace function public._hq_gym_extra(p_gym uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', g.status, 'statusAt', g.status_at,
    'deleteRequest', (select public._hq_request_json(r) from public.hq_delete_requests r
                       where r.gym_id = p_gym and r.done_at is null and r.cancelled_at is null
                       order by r.requested_at limit 1),
    'supportUntil', (select x.ends_at from public.hq_grants x
                      where x.gym_id = p_gym and x.starts_at <= now() and x.ends_at > now() and x.ended_early_at is null
                      order by x.ends_at desc limit 1),
    'supportOpenedBy', (select x.opened_by from public.hq_grants x
                         where x.gym_id = p_gym and x.starts_at <= now() and x.ends_at > now() and x.ended_early_at is null
                         order by x.ends_at desc limit 1))
  from public.gyms g where g.gym_id = p_gym
$$;

-- ------------------------------------------------------------------ grants
revoke all on function public._hq_grant_live(uuid)                        from public, anon, authenticated;
revoke all on function public._hq_grant_json(public.hq_grants)            from public, anon, authenticated;
revoke all on function public._access_log_session()                      from public, anon, authenticated;
revoke all on function public._access_log_fail()                         from public, anon, authenticated;
revoke all on function public._access_log_push()                         from public, anon, authenticated;
revoke all on function public._access_log_keep(timestamptz)              from public, anon, authenticated;
revoke all on function public._hq_gym_extra(uuid)                         from public, anon, authenticated;
revoke all on function public.hq_open_emergency(text, uuid, text, text, int) from public, anon, authenticated;
revoke all on function public.hq_end_access(text, uuid)                   from public, anon, authenticated;
revoke all on function public.hq_gym_records(text, uuid, text, int)       from public, anon, authenticated;
revoke all on function public.hq_access_log(text, uuid, bigint)           from public, anon, authenticated;
revoke all on function public.hq_nightly_cleanup(jsonb)                   from public, anon, authenticated;
grant execute on function public.hq_open_emergency(text, uuid, text, text, int) to service_role;
grant execute on function public.hq_end_access(text, uuid)                to service_role;
grant execute on function public.hq_gym_records(text, uuid, text, int)    to service_role;
grant execute on function public.hq_access_log(text, uuid, bigint)        to service_role;
grant execute on function public.hq_nightly_cleanup(jsonb)                to service_role;

-- The gym owner's three (each checks the key itself, like every owner_* function).
revoke all on function public.owner_hq_grant(text)                        from public;
revoke all on function public.owner_hq_end(text)                          from public;
revoke all on function public.owner_hq_access(text)                       from public;
revoke all on function public.crm_pull(text, bigint)                      from public;
grant execute on function public.owner_hq_grant(text)                     to anon, authenticated;
grant execute on function public.owner_hq_end(text)                       to anon, authenticated;
grant execute on function public.owner_hq_access(text)                    to anon, authenticated;
grant execute on function public.crm_pull(text, bigint)                   to anon, authenticated;

notify pgrst, 'reload schema';
