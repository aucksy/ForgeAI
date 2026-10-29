-- 0044: a member asks the desk to pause or renew their plan from the app (F150, 30 Oct 2026). NOT
-- APPLIED LIVE: the owner must say yes before this goes to the gym server. Additive and re-runnable: one
-- new table, new functions, one trigger on the new table; nothing existing is changed.
--
-- WHAT IT IS (tracker F150, owner-approved): on the member's plan card in the app, "Pause my plan" (pick
-- the dates) and "Renew my plan" (pick a plan). The admin app lists each request with the member's
-- name; one tap approves it using the desk's OWN freeze and renew tools (F81: the panel's
-- extendMembership and sellMembership, logic in apps/dashboard). The member sees the result on the plan
-- card. A renewal is still paid at the desk: approving books the plan with nothing collected (a due).
--
-- ONE FREEZE/RENEW PATH. This file never moves a plan's end date and never sells a plan. The panel does
-- that through F81 exactly as when the desk presses "Freeze / extra days" or "Renew", and only THEN
-- marks the request approved here. owner_decide_plan_request refuses an approval unless the gym's own
-- records already show F81's write for THIS request (NOT_DONE otherwise):
--   freeze: a live membership of that member whose notes carry the request's mark "app #<first 8>";
--   renew:  a live membership of that member whose requestId is the request's id (F81's sale id).
-- The new plan dates the member is told come from that record, never from the device.
--
-- WHO MAY READ AND WRITE (row security on, no policies, no grants: nobody reads the table directly;
-- every read and write goes through the functions below, each scoped to its key).
--  - The member: only their own requests, through the member key of the app's "Join" and 0023's
--    identity checks (_member_roster_link, 0035: the number matched at a check-in, nothing typed; the
--    first name matches the gym's list; never for a shared number). They create, cancel (while still
--    pending) and mark as seen; nothing else.
--  - That gym's people: an owner key or a live session of the gym's staff (_owner_gym; a removed
--    person's session stops at once: BAD_KEY). Owner and front desk alike, like F81's tools. Gym A's
--    key never reads or decides gym B's requests.
--  - A gym that is deleted takes its requests with it; so does an app member row (on delete cascade).
--  - Paused (suspended) gyms: no new request and no decision (the same trigger as 0027's tables).
--
-- WHAT IS KEPT. Which member (the gym's own list id and the app member), what (pause with two dates,
-- or renew with the plan picked: its id and name), the state, who decided and when, and the plan's
-- dates after the change. Nothing is sent anywhere: no push, no message, no other server.
--
-- LIMITS. One PENDING request of each kind per member (ALREADY_ASKED). At most 6 requests per member
-- per day (TOO_MANY). A pause: starts today or within 90 days, ends on or after its start, at most 365
-- days (F81's own 1-365 range), and only for a member with a gym plan that has not ended (NO_PLAN). A
-- renewal: an active gym plan of this gym (not a PT pack; BAD_PLAN).
--
-- ANSWERS (member side; never a raise after the key check):
--   {ok:true, day, plans:[{id,name,durationUnit,durationCount}], requests:[request...]}
--   {ok:true, request} / {ok:true, cancelled:bool}
--   {error:'NO_PHONE'|'NOT_ON_ROSTER'|'GYM_NOT_ONLINE'|'NAME_MISMATCH'|'SHARED_NUMBER', gymName}  (0023)
--   {error:'BAD_KIND'|'BAD_DATES'|'NO_PLAN'|'BAD_PLAN'|'ALREADY_ASKED'|'TOO_MANY'|'SUSPENDED'}
-- request = {id, kind, from, to, planId, planName, status, createdAt, decidedAt, startsOn, endsOn}
--   (times as epoch ms; startsOn/endsOn: the plan's dates after an approval, else null).
--
-- Apply: Supabase SQL editor, after 0043. Test: supabase/tests/0044_plan_requests.sql (CI runs it after
-- every migration; pasted into the SQL Editor it always ends in an error and so changes nothing).
-- Undo: drop function public.member_plan_requests(text); drop function
-- public.member_ask_plan_change(text, text, text, text, text); drop function
-- public.member_cancel_plan_request(text, uuid); drop function public.member_saw_plan_requests(text, uuid[]);
-- drop function public.owner_plan_requests(text); drop function
-- public.owner_decide_plan_request(text, uuid, text, text); drop function
-- public._plan_request_json(public.gym_plan_requests); drop function public._plan_request_mark(uuid);
-- drop table public.gym_plan_requests.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ table
create table if not exists public.gym_plan_requests (
  request_id      uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(gym_id) on delete cascade,
  app_member      uuid not null references public.gym_members(member_id) on delete cascade,
  roster_id       text not null check (length(roster_id) between 1 and 64),
  kind            text not null check (kind in ('freeze', 'renew')),
  freeze_from     date,
  freeze_to       date,
  plan_id         text check (plan_id is null or length(plan_id) between 1 and 64),
  plan_name       text check (plan_name is null or length(plan_name) <= 120),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid,
  decided_by_name text,
  membership_id   text,
  new_starts_on   date,
  new_ends_on     date,
  seen_at         timestamptz,
  constraint gym_plan_requests_shape check (
    (kind = 'freeze' and freeze_from is not null and freeze_to is not null and freeze_to >= freeze_from
       and plan_id is null)
    or (kind = 'renew' and plan_id is not null and freeze_from is null and freeze_to is null)),
  constraint gym_plan_requests_decided check ((status = 'pending') = (decided_at is null))
);
-- One pending request of each kind per member of a gym.
create unique index if not exists gym_plan_requests_one_pending
  on public.gym_plan_requests(gym_id, roster_id, kind) where status = 'pending';
create index if not exists gym_plan_requests_gym on public.gym_plan_requests(gym_id, status, created_at desc);
create index if not exists gym_plan_requests_member on public.gym_plan_requests(gym_id, roster_id, created_at desc);

alter table public.gym_plan_requests enable row level security;
revoke all on public.gym_plan_requests from public, anon, authenticated;

drop trigger if exists gym_plan_requests_not_suspended on public.gym_plan_requests;
create trigger gym_plan_requests_not_suspended before insert or update or delete on public.gym_plan_requests
  for each row execute function public._gym_not_suspended();

-- ------------------------------------------------------------------ helpers (no grants)
-- The mark F81's freeze note carries for this request ("Freeze - asked in the app (app #1a2b3c4d)").
create or replace function public._plan_request_mark(p_request uuid) returns text
  language sql immutable set search_path = public as $$
  select 'app #' || left(p_request::text, 8)
$$;

-- One request as both sides read it.
create or replace function public._plan_request_json(r public.gym_plan_requests) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', r.request_id,
    'kind', r.kind,
    'from', to_char(r.freeze_from, 'YYYY-MM-DD'),
    'to', to_char(r.freeze_to, 'YYYY-MM-DD'),
    'planId', r.plan_id,
    'planName', r.plan_name,
    'status', r.status,
    'createdAt', (extract(epoch from r.created_at) * 1000)::bigint,
    'decidedAt', case when r.decided_at is null then null else (extract(epoch from r.decided_at) * 1000)::bigint end,
    'startsOn', to_char(r.new_starts_on, 'YYYY-MM-DD'),
    'endsOn', to_char(r.new_ends_on, 'YYYY-MM-DD'))
$$;

-- ------------------------------------------------------------------ the member's side
-- The member's open requests and the answers they have not seen yet (the last 30 days), plus the
-- gym's plans they may pick for a renewal (active gym plans; PT packs are sold at the desk).
create or replace function public.member_plan_requests(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  link jsonb := public._member_roster_link(p_key);
  g uuid;
  roster text;
begin
  if link ? 'error' then return link; end if;
  g := (link->>'gymId')::uuid;
  roster := link->>'rosterId';
  return jsonb_build_object(
    'ok', true,
    'day', to_char(public._ist_today(), 'YYYY-MM-DD'),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', left(btrim(p.data->>'name'), 120),
               'durationUnit', p.data->>'durationUnit',
               'durationCount', case when p.data->>'durationCount' ~ '^[0-9]{1,4}$' then (p.data->>'durationCount')::int end)
             order by case when p.data->>'sortOrder' ~ '^-?[0-9]{1,6}$' then (p.data->>'sortOrder')::int else 0 end,
                      p.data->>'name')
        from (select * from public.crm_records
               where gym_id = g and kind = 'plan' and not deleted
                 and coalesce(data->>'active', 'true') <> 'false'
                 and coalesce(btrim(data->>'name'), '') <> ''
                 and coalesce(nullif(data->>'ptSessions', ''), '0') in ('0', 'null')
               limit 40) p), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(public._plan_request_json(r) order by r.created_at desc)
        from (select * from public.gym_plan_requests
               where gym_id = g and roster_id = roster
                 and (status = 'pending'
                      or (seen_at is null and decided_at > now() - interval '30 days'))
               order by created_at desc limit 10) r), '[]'::jsonb));
end $$;

-- Ask the desk. p_kind 'freeze' (p_from, p_to: 'YYYY-MM-DD') or 'renew' (p_plan: a plan id from
-- member_plan_requests). Answers {ok:true, request} or {error: ...} (see the header).
create or replace function public.member_ask_plan_change(p_key text, p_kind text, p_from text, p_to text, p_plan text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  link jsonb := public._member_roster_link(p_key);
  m public.gym_members := public._member(p_key);
  g uuid;
  roster text;
  today date := public._ist_today();
  d_from date;
  d_to date;
  pl public.crm_records;
  r public.gym_plan_requests;
begin
  if link ? 'error' then return link; end if;
  g := (link->>'gymId')::uuid;
  roster := link->>'rosterId';
  if p_kind is null or p_kind not in ('freeze', 'renew') then return jsonb_build_object('error', 'BAD_KIND'); end if;
  if (select status from public.gyms where gym_id = g) = 'suspended' then
    return jsonb_build_object('error', 'SUSPENDED');
  end if;
  -- One member's requests are decided one at a time (the pending check below then holds).
  perform pg_advisory_xact_lock(hashtext('plan_request:' || g::text || ':' || roster));
  if (select count(*) from public.gym_plan_requests
       where gym_id = g and roster_id = roster and created_at > now() - interval '1 day') >= 6 then
    return jsonb_build_object('error', 'TOO_MANY');
  end if;
  if exists (select 1 from public.gym_plan_requests
              where gym_id = g and roster_id = roster and kind = p_kind and status = 'pending') then
    return jsonb_build_object('error', 'ALREADY_ASKED');
  end if;

  if p_kind = 'freeze' then
    d_from := public._iso_day(p_from);
    d_to := public._iso_day(p_to);
    if d_from is null or d_to is null or d_from < today or d_from > today + 90 or d_to < d_from
       or (d_to - d_from + 1) > 365 then
      return jsonb_build_object('error', 'BAD_DATES');
    end if;
    -- A gym plan (not a PT pack, not cancelled) that has not ended: F81 adds the days to it.
    if not exists (select 1 from public.crm_records x
                    where x.gym_id = g and x.kind = 'membership' and not x.deleted
                      and x.data->>'memberId' = roster
                      and coalesce(x.data->>'cancelled', 'false') <> 'true'
                      and coalesce(nullif(x.data->>'ptSessions', ''), '0') in ('0', 'null')
                      and public._iso_day(x.data->>'endsOn') >= today) then
      return jsonb_build_object('error', 'NO_PLAN');
    end if;
    insert into public.gym_plan_requests(gym_id, app_member, roster_id, kind, freeze_from, freeze_to)
      values (g, m.member_id, roster, 'freeze', d_from, d_to)
      returning * into r;
  else
    select * into pl from public.crm_records
     where gym_id = g and kind = 'plan' and id = p_plan and not deleted
       and coalesce(data->>'active', 'true') <> 'false'
       and coalesce(btrim(data->>'name'), '') <> ''
       and coalesce(nullif(data->>'ptSessions', ''), '0') in ('0', 'null');
    if pl.id is null then return jsonb_build_object('error', 'BAD_PLAN'); end if;
    insert into public.gym_plan_requests(gym_id, app_member, roster_id, kind, plan_id, plan_name)
      values (g, m.member_id, roster, 'renew', pl.id, left(btrim(pl.data->>'name'), 120))
      returning * into r;
  end if;
  return jsonb_build_object('ok', true, 'request', public._plan_request_json(r));
end $$;

-- Take back a request the desk has not answered yet. {ok:true, cancelled:true|false}.
create or replace function public.member_cancel_plan_request(p_key text, p_request uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare link jsonb := public._member_roster_link(p_key); n int;
begin
  if link ? 'error' then return link; end if;
  delete from public.gym_plan_requests
   where request_id = p_request and gym_id = (link->>'gymId')::uuid and roster_id = link->>'rosterId'
     and status = 'pending';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'cancelled', n > 0);
end $$;

-- The member read these answers (they stop showing). Only their own, only decided ones. The count.
create or replace function public.member_saw_plan_requests(p_key text, p_ids uuid[])
  returns int language plpgsql security definer set search_path = public as $$
declare link jsonb := public._member_roster_link(p_key); n int;
begin
  if link ? 'error' or p_ids is null then return 0; end if;
  if cardinality(p_ids) > 20 then raise exception 'TOO_MANY'; end if;
  update public.gym_plan_requests set seen_at = now()
   where request_id = any(p_ids) and gym_id = (link->>'gymId')::uuid and roster_id = link->>'rosterId'
     and status <> 'pending' and seen_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- ------------------------------------------------------------------ the gym's side
-- Every pending request (oldest first) and those answered in the last 14 days, each with the member's
-- name from the gym's own list. An empty gym answers [] (the panel uses that to learn this server has
-- requests).
create or replace function public.owner_plan_requests(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key);
begin
  return coalesce((
    select jsonb_agg(public._plan_request_json(q.r) || jsonb_build_object(
             'rosterId', (q.r).roster_id,
             'memberName', coalesce(nullif(btrim(m.data->>'fullName'), ''), 'A member'),
             'decidedBy', (q.r).decided_by_name,
             'membershipId', (q.r).membership_id)
           order by ((q.r).status <> 'pending'), case when (q.r).status = 'pending' then (q.r).created_at end,
                    (q.r).decided_at desc)
      from (select x as r from public.gym_plan_requests x
             where x.gym_id = g
               and (x.status = 'pending' or x.decided_at > now() - interval '14 days')
             order by (x.status <> 'pending'), x.created_at
             limit 150) q
      left join public.crm_records m
        on m.gym_id = g and m.kind = 'member' and m.id = (q.r).roster_id), '[]'::jsonb);
end $$;

-- Approve or decline. Approve only AFTER the panel ran F81 (freeze: "Freeze / extra days"; renew: the
-- sale) and hands the membership it changed or made: the gym's records must show that write (NOT_DONE
-- otherwise). The same answer twice is the same (a lost answer, pressed again). Raises BAD_KEY, GONE,
-- INVALID, NOT_DONE, ALREADY_DECIDED, SUSPENDED.
create or replace function public.owner_decide_plan_request(p_key text, p_request uuid, p_decision text, p_membership text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  r public.gym_plan_requests;
  ms public.crm_records;
begin
  if p_decision is null or p_decision not in ('approved', 'declined') then raise exception 'INVALID'; end if;
  select * into r from public.gym_plan_requests where request_id = p_request and gym_id = g for update;
  if r.request_id is null then raise exception 'GONE'; end if;
  if r.status <> 'pending' then
    if r.status = p_decision then
      return public._plan_request_json(r) || jsonb_build_object('rosterId', r.roster_id, 'decidedBy', r.decided_by_name,
        'membershipId', r.membership_id);
    end if;
    raise exception 'ALREADY_DECIDED';
  end if;

  if p_decision = 'approved' then
    select * into ms from public.crm_records x
     where x.gym_id = g and x.kind = 'membership' and x.id = p_membership and not x.deleted
       and x.data->>'memberId' = r.roster_id
       and coalesce(x.data->>'cancelled', 'false') <> 'true'
       and case r.kind
             when 'freeze' then position(public._plan_request_mark(r.request_id) in coalesce(x.data->>'notes', '')) > 0
             else x.data->>'requestId' = r.request_id::text
           end;
    if ms.id is null then raise exception 'NOT_DONE'; end if;
  end if;

  update public.gym_plan_requests
     set status = p_decision, decided_at = now(), decided_by = st.staff_id,
         decided_by_name = coalesce(st.name, 'Owner'),
         membership_id = ms.id,
         new_starts_on = public._iso_day(ms.data->>'startsOn'),
         new_ends_on = public._iso_day(ms.data->>'endsOn')
   where request_id = r.request_id
   returning * into r;
  return public._plan_request_json(r) || jsonb_build_object('rosterId', r.roster_id, 'decidedBy', r.decided_by_name,
    'membershipId', r.membership_id);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._plan_request_mark(uuid)                               from public, anon, authenticated;
revoke all on function public._plan_request_json(public.gym_plan_requests)           from public, anon, authenticated;
revoke all on function public.member_plan_requests(text)                             from public;
revoke all on function public.member_ask_plan_change(text, text, text, text, text)   from public;
revoke all on function public.member_cancel_plan_request(text, uuid)                 from public;
revoke all on function public.member_saw_plan_requests(text, uuid[])                 from public;
revoke all on function public.owner_plan_requests(text)                              from public;
revoke all on function public.owner_decide_plan_request(text, uuid, text, text)      from public;
grant execute on function public.member_plan_requests(text)                          to anon, authenticated;
grant execute on function public.member_ask_plan_change(text, text, text, text, text) to anon, authenticated;
grant execute on function public.member_cancel_plan_request(text, uuid)              to anon, authenticated;
grant execute on function public.member_saw_plan_requests(text, uuid[])              to anon, authenticated;
grant execute on function public.owner_plan_requests(text)                           to anon, authenticated;
grant execute on function public.owner_decide_plan_request(text, uuid, text, text)   to anon, authenticated;

-- PostgREST learns the new functions at once (instead of on its next schema reload).
notify pgrst, 'reload schema';
