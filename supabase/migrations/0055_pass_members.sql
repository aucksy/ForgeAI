-- NOT APPLIED LIVE - needs the owner's yes (a live database change).
--
-- 0055: pass members (F123, 4 Nov 2026). Someone who trains at the gym on a pass bought from another
-- company (FITPASS, cultpass and the like) pays that company, not the gym. The admin app marks them on
-- their own record (crm_records kind 'member', data.passCompany, e.g. "FITPASS"; data.passSince, the
-- first day): no plan, no dues, never on the renewal list, and every check-in is a pass visit, counted
-- per company per month on Visits -> Pass visits. That part needs no database change: it lives in the
-- member record the admin app already sends (crm_push), like `batch` and `allBranches`.
--
-- What this file changes, for the member app (MettleUp):
--   1. _checkin_plan_ok (0016): a pass member's check-in by the gym's QR is "plan OK", so the app says
--      "You're checked in" and not "your plan has ended, see the desk". The visit was always written;
--      the admin app counts it as a pass visit by the member's passCompany and passSince.
--   2. member_membership (0023): the answer also carries 'pass' (the company's name, or null), so
--      "My membership" in the app says "FITPASS member" instead of "No plan yet. Ask the desk."
--      Copied from 0023 with only the marked 0055 lines added. Nothing is removed from the answer, so
--      member_auto_reminders (0029), which reads it, is unchanged.
-- Nothing is sent to any pass company, and no new member data leaves the gym.
--
-- Additive and re-runnable: one new helper function, two existing functions replaced (same names,
-- same arguments, same grants). Apply after 0054 (needs 0016's _checkin_plan_ok, 0023's
-- member_membership and _first_name_key, 0015's _checkin_roster_member).
-- Test: supabase/tests/0055_pass_members.sql (CI runs it after every migration; pasted into the SQL
-- Editor it always ends in an error and so changes nothing).
-- Before it is applied, both apps keep working: the admin app's pass members and pass visits work in
-- full; the member app shows a pass member "No plan yet" and, after a QR check-in, "see the desk"
-- (the visit still counts for the pass company on the admin app).
--
-- Undo: re-run 0016's _checkin_plan_ok and 0023's member_membership; drop function public._pass_company(jsonb).

set lock_timeout = '3s';

-- The pass company on a roster member's record: trimmed, at most 40 letters; null for a member who pays
-- the gym. No grants: only the functions below call it.
create or replace function public._pass_company(p_data jsonb)
  returns text language sql immutable set search_path = public as $$
  select nullif(left(btrim(regexp_replace(coalesce(p_data->>'passCompany', ''), '\s+', ' ', 'g')), 40), '')
$$;
revoke all on function public._pass_company(jsonb) from public, anon, authenticated;

-- 0016's _checkin_plan_ok. Changed (0055): a pass member is covered every day.
create or replace function public._checkin_plan_ok(p_gym uuid, p_member text, p_day text)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm_records r
     where r.gym_id = p_gym and r.kind = 'membership' and not r.deleted
       and r.data->>'memberId' = p_member
       and coalesce(r.data->>'cancelled', 'false') <> 'true'
       and r.data->>'startsOn' <= p_day and r.data->>'endsOn' >= p_day)
  -- 0055: a pass member (FITPASS, cultpass...): the pass company pays for the visit.
  or exists (
    select 1 from public.crm_records r
     where r.gym_id = p_gym and r.kind = 'member' and not r.deleted and r.id = p_member
       and public._pass_company(r.data) is not null)
$$;
revoke all on function public._checkin_plan_ok(uuid, text, text) from public, anon, authenticated;

-- 0023's member_membership. Changed: the lines marked 0055 (the 'pass' in the answer).
create or replace function public.member_membership(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  g public.gyms;
  ph text;
  roster public.crm_records;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  day text := to_char(today, 'YYYY-MM-DD');
  month_start text := to_char(date_trunc('month', today), 'YYYY-MM-DD');
  cur jsonb;
  nxt jsonb;
  last_end text;
  visits int;
  sharing int;
  pass text;
begin
  select * into g from public.gyms where gym_id = m.gym_id;

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

  -- The plan covering today (the one ending last, when two overlap).
  select jsonb_build_object(
           'planName', r.data->>'planName', 'startsOn', r.data->>'startsOn', 'endsOn', r.data->>'endsOn',
           'ptSessions', case when r.data->>'ptSessions' ~ '^[0-9]{1,4}$' then (r.data->>'ptSessions')::int end,
           'ptUsed', case when jsonb_typeof(r.data->'ptLog') = 'array' then jsonb_array_length(r.data->'ptLog') else 0 end,
           'trainer', nullif(btrim(coalesce(r.data->>'trainer', '')), ''))
    into cur
    from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'membership' and not r.deleted
     and r.data->>'memberId' = roster.id
     and coalesce(r.data->>'cancelled', 'false') <> 'true'
     and r.data->>'startsOn' <= day and r.data->>'endsOn' >= day
   order by r.data->>'endsOn' desc
   limit 1;

  -- A plan already sold that starts later (a renewal paid in advance).
  select jsonb_build_object('planName', r.data->>'planName', 'startsOn', r.data->>'startsOn', 'endsOn', r.data->>'endsOn')
    into nxt
    from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'membership' and not r.deleted
     and r.data->>'memberId' = roster.id
     and coalesce(r.data->>'cancelled', 'false') <> 'true'
     and r.data->>'startsOn' > day
   order by r.data->>'startsOn'
   limit 1;

  select max(r.data->>'endsOn') into last_end
    from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'membership' and not r.deleted
     and r.data->>'memberId' = roster.id
     and coalesce(r.data->>'cancelled', 'false') <> 'true'
     and r.data->>'endsOn' < day;

  select count(distinct r.data->>'visitedOn') into visits
    from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'visit' and not r.deleted
     and r.data->>'memberId' = roster.id
     and r.data->>'visitedOn' between month_start and day;

  -- 0055: a pass member (FITPASS, cultpass...): the company's name, as the desk wrote it.
  pass := public._pass_company(roster.data);

  return jsonb_build_object('ok', true, 'gymName', g.name,
    'memberName', split_part(btrim(coalesce(roster.data->>'fullName', m.name)), ' ', 1),
    'day', day, 'current', cur, 'next', nxt, 'lastEndedOn', last_end, 'visitsThisMonth', coalesce(visits, 0),
    'pass', pass);
end $$;

revoke all on function public.member_membership(text) from public;
grant execute on function public.member_membership(text) to anon, authenticated;
