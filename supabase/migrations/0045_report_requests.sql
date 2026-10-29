-- 0045: the gym asks for a member's workout report, the member says yes or no in the app (F121, 30 Oct
-- 2026). NOT APPLIED LIVE: the owner must say yes before this goes to the gym server. Additive and
-- re-runnable: two new tables, new functions, triggers on the new tables only; nothing existing changes.
--
-- WHAT IT IS (tracker F121, owner-approved). Members already save their own workouts as a spreadsheet
-- (Settings -> Export), with or without a gym; that never changes (R-220: a member's data is never
-- locked behind the membership). For the gym: the desk taps "Request workout report" on the member's
-- page; the member's app asks "Send your report to the gym?"; on yes, the PHONE makes the report (the
-- same spreadsheet as Settings -> Export, only the workouts on or after the member's join date at this
-- gym) and sends it here; the desk downloads it. The gym never gets workouts from before the join date.
--
-- THE JOIN DATE is the gym's own record, fixed when the desk asks (from_day): the member's "joinedOn"
-- on the gym's list, else the first day of their earliest plan at this gym. A member with neither
-- cannot be asked (NO_JOIN_DATE). The phone keeps only workouts on or after from_day, and this server
-- checks the file too: every workout time written in it must be on or after from_day (TOO_EARLY).
--
-- WHY TABLES AND NOT A STORAGE BUCKET (as 0043). The panel has no Supabase sign-in accounts (the desk
-- holds a session key only our functions can check) and neither does the member app (a member key).
-- Storage rules only see "anon", so a bucket would be readable by anyone with the link, or need a
-- server secret to sign links. The report file is kept in its own table, read and written ONLY through
-- the key-checked functions below: there is no link to it at all, public or signed.
--
-- WHO MAY READ AND WRITE (row security on, no policies, no grants: nobody reads the tables directly).
--  - That gym's people (owner key or a live staff session, _owner_gym; a removed person's session stops
--    at once: BAD_KEY): ask for a report, see the request's state, download a sent report. Only for a
--    member on the gym's own list (NO_MEMBER). Gym A's key never reads or asks about gym B's members.
--  - The member (member key of the app's "Join", matched to the gym's list by 0035's
--    _member_roster_link: the check-in number, never typed; first name matches; never a shared number):
--    sees their own pending request, answers yes or no, and (after yes) attaches the file. Only the
--    member writes a report; the desk can only read it.
--  - A gym that is deleted takes its requests and files with it; so does a member removed from the
--    app (on delete cascade / set null).
--  - Paused (suspended) gyms: no new request and no new file (SUSPENDED). Answering stays possible.
--
-- HOW LONG IT IS KEPT: 30 days. A request not answered within 30 days of asking becomes 'expired'. A
-- sent report can be downloaded for 30 days after it was sent; then it becomes 'expired' and the file
-- is deleted. (Tidied on every call for that gym; nothing else reads them. A call that refuses undoes
-- its own clean-up, but it re-checks the state first, so an expired file is never handed out.)
--
-- LIMITS. One pending request per member (asking again returns the one already waiting). At most 5
-- asks per member per day (TOO_MANY). A file is the app's spreadsheet text (it must start with the
-- export's own header: BAD_FILE), at most 3,000,000 characters (TOO_BIG).
--
-- ANSWERS
--  member_report_requests(key)        {ok:true, day, requests:[request]}  (only pending ones)
--  member_answer_report_request(key, id, 'yes'|'no')        {ok:true, request}
--  member_attach_report(key, id, csv, workouts, sets)       {ok:true, request}
--    member errors (never a raise after the key check): {error:'NO_PHONE'|'NOT_ON_ROSTER'|
--    'GYM_NOT_ONLINE'|'NAME_MISMATCH'|'SHARED_NUMBER', gymName} (0023), or {error:'GONE'|'BAD_ANSWER'|
--    'NOT_AGREED'|'BAD_FILE'|'TOO_BIG'|'TOO_EARLY'|'SUSPENDED'}
--  owner_report_requests(key, member)  [request + desk fields], newest first (the last 60 days, max 5)
--  owner_request_report(key, member)   request + desk fields (raises BAD_KEY, NO_MEMBER, NO_JOIN_DATE,
--                                      TOO_MANY, SUSPENDED)
--  owner_report_file(key, id)          {id, memberName, fromDay, firstDay, lastDay, workouts, sets,
--                                      sentAt, csv} (raises BAD_KEY, GONE, NOT_SENT, EXPIRED)
--  request = {id, status, fromDay, agreed, createdAt, answeredAt, sentAt, expiresAt}  (times epoch ms)
--  desk fields = {rosterId, memberName, requestedBy, workouts, sets, firstDay, lastDay}
--
-- Apply: Supabase SQL editor, after 0044. Test: supabase/tests/0045_report_requests.sql (CI runs it after
-- every migration; pasted into the SQL Editor it always ends in an error and so changes nothing).
-- Undo: drop function public.member_report_requests(text); drop function
-- public.member_answer_report_request(text, uuid, text); drop function
-- public.member_attach_report(text, uuid, text, int, int); drop function
-- public.owner_report_requests(text, text); drop function public.owner_request_report(text, text);
-- drop function public.owner_report_file(text, uuid); drop function
-- public._report_request_json(public.gym_report_requests); drop function public._report_desk_json(uuid,
-- public.gym_report_requests); drop function public._report_join_day(uuid, text); drop function
-- public._report_tidy(uuid); drop function public._report_csv_days(text); drop table
-- public.gym_report_files; drop table public.gym_report_requests.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ tables
create table if not exists public.gym_report_requests (
  request_id        uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references public.gyms(gym_id) on delete cascade,
  roster_id         text not null check (length(roster_id) between 1 and 64),
  -- The member's join date at this gym (the gym's own records, fixed when asked).
  from_day          date not null,
  status            text not null default 'pending' check (status in ('pending', 'sent', 'declined', 'expired')),
  created_at        timestamptz not null default now(),
  requested_by      uuid,
  requested_by_name text,
  -- The member's yes (the file may follow a moment later) or no.
  agreed_at         timestamptz,
  answered_at       timestamptz,
  app_member        uuid references public.gym_members(member_id) on delete set null,
  sent_at           timestamptz,
  expires_at        timestamptz not null default now() + interval '30 days',
  constraint gym_report_requests_sent check ((status = 'sent') = (sent_at is not null) or status = 'expired')
);
-- One pending request per member of a gym.
create unique index if not exists gym_report_requests_one_pending
  on public.gym_report_requests(gym_id, roster_id) where status = 'pending';
create index if not exists gym_report_requests_member on public.gym_report_requests(gym_id, roster_id, created_at desc);
create index if not exists gym_report_requests_expiry on public.gym_report_requests(gym_id, expires_at)
  where status in ('pending', 'sent');

-- The report itself: one file per request, written by the member, read by that gym's people.
create table if not exists public.gym_report_files (
  request_id  uuid primary key references public.gym_report_requests(request_id) on delete cascade,
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  csv         text not null check (length(csv) between 1 and 3000000),
  workouts    int not null check (workouts between 0 and 100000),
  sets        int not null check (sets between 0 and 2000000),
  first_day   date,
  last_day    date,
  made_at     timestamptz not null default now()
);

alter table public.gym_report_requests enable row level security;
alter table public.gym_report_files enable row level security;
revoke all on public.gym_report_requests from public, anon, authenticated;
revoke all on public.gym_report_files from public, anon, authenticated;

-- A paused gym takes no new request and no new file. Answers, expiry and deletes still pass (a
-- member's no, and the 30-day clean-up, must always work).
drop trigger if exists gym_report_requests_not_suspended on public.gym_report_requests;
create trigger gym_report_requests_not_suspended before insert on public.gym_report_requests
  for each row execute function public._gym_not_suspended();
drop trigger if exists gym_report_files_not_suspended on public.gym_report_files;
create trigger gym_report_files_not_suspended before insert on public.gym_report_files
  for each row execute function public._gym_not_suspended();

-- ------------------------------------------------------------------ helpers (no grants)
-- The 30-day rule for one gym: unanswered requests and sent reports past their time become 'expired',
-- and their files go.
create or replace function public._report_tidy(p_gym uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  update public.gym_report_requests set status = 'expired'
   where gym_id = p_gym and status in ('pending', 'sent') and expires_at <= now();
  delete from public.gym_report_files f using public.gym_report_requests r
   where f.request_id = r.request_id and r.gym_id = p_gym and r.status <> 'sent';
end $$;

-- The member's join date at this gym from the gym's own list: "joinedOn", else the first day of their
-- earliest plan here (not cancelled). Null when neither is there.
create or replace function public._report_join_day(p_gym uuid, p_roster text) returns date
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select public._iso_day(m.data->>'joinedOn') from public.crm_records m
      where m.gym_id = p_gym and m.kind = 'member' and m.id = p_roster and not m.deleted),
    (select min(public._iso_day(x.data->>'startsOn')) from public.crm_records x
      where x.gym_id = p_gym and x.kind = 'membership' and not x.deleted
        and x.data->>'memberId' = p_roster and coalesce(x.data->>'cancelled', 'false') <> 'true'))
$$;

-- The first and last workout day written in a report: every "7 Jul 2026, 14:24" time in it (the
-- export's start and end times). Nulls for a file with no workouts.
create or replace function public._report_csv_days(p text, out first_day date, out last_day date)
  language sql immutable set search_path = public as $$
  select min(to_date(m[1], 'DD Mon YYYY')), max(to_date(m[1], 'DD Mon YYYY'))
    from regexp_matches(p, '"([0-9]{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4}), [0-9]{2}:[0-9]{2}"', 'g') as m
$$;

-- One request as both sides read it.
create or replace function public._report_request_json(r public.gym_report_requests) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', r.request_id,
    'status', r.status,
    'fromDay', to_char(r.from_day, 'YYYY-MM-DD'),
    'agreed', r.agreed_at is not null,
    'createdAt', (extract(epoch from r.created_at) * 1000)::bigint,
    'answeredAt', case when r.answered_at is null then null else (extract(epoch from r.answered_at) * 1000)::bigint end,
    'sentAt', case when r.sent_at is null then null else (extract(epoch from r.sent_at) * 1000)::bigint end,
    'expiresAt', (extract(epoch from r.expires_at) * 1000)::bigint)
$$;

-- The desk's view of one request: plus the member's name from the gym's list, who asked, and the
-- report's size and days when it was sent.
create or replace function public._report_desk_json(p_gym uuid, r public.gym_report_requests) returns jsonb
  language sql stable security definer set search_path = public as $$
  select public._report_request_json(r) || jsonb_build_object(
    'rosterId', r.roster_id,
    'memberName', coalesce((select nullif(btrim(m.data->>'fullName'), '') from public.crm_records m
                             where m.gym_id = p_gym and m.kind = 'member' and m.id = r.roster_id), 'A member'),
    'requestedBy', r.requested_by_name,
    'workouts', f.workouts,
    'sets', f.sets,
    'firstDay', to_char(f.first_day, 'YYYY-MM-DD'),
    'lastDay', to_char(f.last_day, 'YYYY-MM-DD'))
    from (select 1) one
    left join public.gym_report_files f on f.request_id = r.request_id and r.status = 'sent'
$$;

-- ------------------------------------------------------------------ the member's side
-- The member's pending request (at most one), with the join date the report starts from.
create or replace function public.member_report_requests(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  link jsonb := public._member_roster_link(p_key);
  g uuid;
begin
  if link ? 'error' then return link; end if;
  g := (link->>'gymId')::uuid;
  perform public._report_tidy(g);
  return jsonb_build_object(
    'ok', true,
    'day', to_char(public._ist_today(), 'YYYY-MM-DD'),
    'requests', coalesce((
      select jsonb_agg(public._report_request_json(r) order by r.created_at desc)
        from (select * from public.gym_report_requests
               where gym_id = g and roster_id = link->>'rosterId' and status = 'pending'
               order by created_at desc limit 3) r), '[]'::jsonb));
end $$;

-- Yes or no to one request. Yes is kept (agreed) and the file follows (member_attach_report); no
-- declines it and nothing is ever sent. The same answer twice is the same.
create or replace function public.member_answer_report_request(p_key text, p_request uuid, p_answer text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  link jsonb := public._member_roster_link(p_key);
  m public.gym_members := public._member(p_key);
  g uuid;
  r public.gym_report_requests;
begin
  if link ? 'error' then return link; end if;
  if p_answer is null or p_answer not in ('yes', 'no') then return jsonb_build_object('error', 'BAD_ANSWER'); end if;
  g := (link->>'gymId')::uuid;
  perform public._report_tidy(g);
  select * into r from public.gym_report_requests
   where request_id = p_request and gym_id = g and roster_id = link->>'rosterId' for update;
  if r.request_id is null then return jsonb_build_object('error', 'GONE'); end if;
  if r.status <> 'pending' then
    if (p_answer = 'no' and r.status = 'declined') or (p_answer = 'yes' and r.status = 'sent') then
      return jsonb_build_object('ok', true, 'request', public._report_request_json(r));
    end if;
    return jsonb_build_object('error', 'GONE');
  end if;
  if p_answer = 'no' then
    update public.gym_report_requests
       set status = 'declined', agreed_at = null, answered_at = now(), app_member = m.member_id
     where request_id = r.request_id returning * into r;
  elsif r.agreed_at is null then
    update public.gym_report_requests
       set agreed_at = now(), answered_at = now(), app_member = m.member_id
     where request_id = r.request_id returning * into r;
  end if;
  return jsonb_build_object('ok', true, 'request', public._report_request_json(r));
end $$;

-- The report the phone made, after the member's yes. p_csv is the spreadsheet text (the app's own
-- export, only workouts on or after from_day). Sending it again (a lost answer) replaces it.
create or replace function public.member_attach_report(p_key text, p_request uuid, p_csv text, p_workouts int, p_sets int)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  link jsonb := public._member_roster_link(p_key);
  g uuid;
  r public.gym_report_requests;
  d record;
begin
  if link ? 'error' then return link; end if;
  g := (link->>'gymId')::uuid;
  perform public._report_tidy(g);
  select * into r from public.gym_report_requests
   where request_id = p_request and gym_id = g and roster_id = link->>'rosterId' for update;
  if r.request_id is null or r.status not in ('pending', 'sent') then return jsonb_build_object('error', 'GONE'); end if;
  if r.agreed_at is null then return jsonb_build_object('error', 'NOT_AGREED'); end if;
  if (select status from public.gyms where gym_id = g) = 'suspended' then
    return jsonb_build_object('error', 'SUSPENDED');
  end if;
  if p_csv is not null and length(p_csv) > 3000000 then return jsonb_build_object('error', 'TOO_BIG'); end if;
  if p_csv is null or left(p_csv, 20) <> '"title","start_time"'
     or p_workouts is null or p_workouts not between 0 and 100000
     or p_sets is null or p_sets not between 0 and 2000000 then
    return jsonb_build_object('error', 'BAD_FILE');
  end if;
  begin
    select * into d from public._report_csv_days(p_csv);
  exception when others then
    -- A time the server cannot read as a day: the file is not the app's own export.
    return jsonb_build_object('error', 'BAD_FILE');
  end;
  if d.first_day is not null and d.first_day < r.from_day then
    return jsonb_build_object('error', 'TOO_EARLY');
  end if;
  insert into public.gym_report_files(request_id, gym_id, csv, workouts, sets, first_day, last_day)
    values (r.request_id, g, p_csv, p_workouts, p_sets, d.first_day, d.last_day)
  on conflict (request_id) do update
    set csv = excluded.csv, workouts = excluded.workouts, sets = excluded.sets,
        first_day = excluded.first_day, last_day = excluded.last_day, made_at = now();
  update public.gym_report_requests
     set status = 'sent', sent_at = now(), expires_at = now() + interval '30 days'
   where request_id = r.request_id returning * into r;
  return jsonb_build_object('ok', true, 'request', public._report_request_json(r));
end $$;

-- ------------------------------------------------------------------ the gym's side
-- One member's requests, newest first (the last 60 days, at most 5). A member with none answers []
-- (the panel uses that to learn this server has reports).
create or replace function public.owner_report_requests(p_key text, p_member text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key);
begin
  perform public._report_tidy(g);
  return coalesce((
    select jsonb_agg(public._report_desk_json(g, r) order by r.created_at desc)
      from (select * from public.gym_report_requests
             where gym_id = g and roster_id = p_member and created_at > now() - interval '60 days'
             order by created_at desc limit 5) r), '[]'::jsonb);
end $$;

-- Ask a member for their workout report. A request already waiting is returned as it is (one pending
-- per member). Who asked is stamped from the session, never from the device.
create or replace function public.owner_request_report(p_key text, p_member text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  joined date;
  r public.gym_report_requests;
begin
  perform public._roster_member_ok(g, p_member);
  perform public._report_tidy(g);
  perform pg_advisory_xact_lock(hashtext('report_request:' || g::text || ':' || p_member));
  select * into r from public.gym_report_requests
   where gym_id = g and roster_id = p_member and status = 'pending';
  if r.request_id is not null then return public._report_desk_json(g, r); end if;
  if (select count(*) from public.gym_report_requests
       where gym_id = g and roster_id = p_member and created_at > now() - interval '1 day') >= 5 then
    raise exception 'TOO_MANY';
  end if;
  joined := public._report_join_day(g, p_member);
  if joined is null then raise exception 'NO_JOIN_DATE'; end if;
  insert into public.gym_report_requests(gym_id, roster_id, from_day, requested_by, requested_by_name)
    values (g, p_member, joined, st.staff_id, coalesce(st.name, 'Owner'))
    returning * into r;
  return public._report_desk_json(g, r);
end $$;

-- A sent report, to download. Raises GONE (not this gym's), NOT_SENT (no file yet), EXPIRED.
create or replace function public.owner_report_file(p_key text, p_request uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  r public.gym_report_requests;
  f public.gym_report_files;
begin
  perform public._report_tidy(g);
  select * into r from public.gym_report_requests where request_id = p_request and gym_id = g;
  if r.request_id is null then raise exception 'GONE'; end if;
  if r.status = 'expired' then raise exception 'EXPIRED'; end if;
  if r.status <> 'sent' then raise exception 'NOT_SENT'; end if;
  select * into f from public.gym_report_files where request_id = r.request_id;
  if f.request_id is null then raise exception 'NOT_SENT'; end if;
  return public._report_desk_json(g, r) || jsonb_build_object('csv', f.csv);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._report_tidy(uuid)                                       from public, anon, authenticated;
revoke all on function public._report_join_day(uuid, text)                             from public, anon, authenticated;
revoke all on function public._report_csv_days(text)                                   from public, anon, authenticated;
revoke all on function public._report_request_json(public.gym_report_requests)         from public, anon, authenticated;
revoke all on function public._report_desk_json(uuid, public.gym_report_requests)      from public, anon, authenticated;
revoke all on function public.member_report_requests(text)                             from public;
revoke all on function public.member_answer_report_request(text, uuid, text)           from public;
revoke all on function public.member_attach_report(text, uuid, text, int, int)         from public;
revoke all on function public.owner_report_requests(text, text)                        from public;
revoke all on function public.owner_request_report(text, text)                         from public;
revoke all on function public.owner_report_file(text, uuid)                            from public;
grant execute on function public.member_report_requests(text)                          to anon, authenticated;
grant execute on function public.member_answer_report_request(text, uuid, text)        to anon, authenticated;
grant execute on function public.member_attach_report(text, uuid, text, int, int)      to anon, authenticated;
grant execute on function public.owner_report_requests(text, text)                     to anon, authenticated;
grant execute on function public.owner_request_report(text, text)                      to anon, authenticated;
grant execute on function public.owner_report_file(text, uuid)                         to anon, authenticated;

-- PostgREST learns the new functions at once (instead of on its next schema reload).
notify pgrst, 'reload schema';
